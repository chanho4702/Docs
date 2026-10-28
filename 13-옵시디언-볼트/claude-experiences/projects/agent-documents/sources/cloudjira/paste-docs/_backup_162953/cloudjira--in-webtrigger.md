독자: 사내 의사결정자·개발자 (보고 문서, ~다 체)

# 승인 앱 ↔ 워크포스 앱 간 연동 — webtrigger 채널

> 가능성 · 구현 · 검증 (2026-10-20 기준, 개발 사이트 실측)
> 대상 앱: Moves Approval for Jira(승인 앱) · Moves Workforce for Jira(워크포스)

## 요약

- **결론: 가능하고, 구현해 dev 에서 동작을 확인했다.** 두 Forge 앱의 백엔드가 서로의 dynamic webtrigger 를 HTTPS 로 부르고, 우리가 만든 Ed25519 서명으로 상대를 인증한다.
- 이전 방식(Jira 엔티티 프로퍼티에 서명 문서를 붙여 교환)은 전부 걷어냈다. 프로퍼티는 이슈 편집 권한만 있으면 누구나 쓸 수 있어 신뢰할 수 없고, 반영이 늦고, 크기 한도(32KB)가 있었다.
- 첫 연결은 **연결 코드 붙여넣기**(한쪽 관리자가 만든 코드를 다른 쪽에 붙여넣으면 양방향 완성).
- 요청은 **그것을 일으킨 사람(actor) 기준**으로 처리한다. 보내는 앱이 1차로 확인하고, 받는 앱이 그 사람의 권한을 다시 확인한다.
- 대가: dynamic webtrigger·외부 호출 때문에 두 앱 모두 **Runs on Atlassian 자격을 잃는다**(수용).

| 항목 | 값(dev 실측) |
|---|---|
| 호출 지연 | 0.12~0.4초(사전 실측), 실제 앱 연결 확인 0.24~2초, 콜드 직후 4~7초 |
| 위조 요청 | 26종 + 동시 80건 전부 거부, DB 접근 0 |
| 기능 | 채널 작업 14종 중 11종 화면에서 실측 통과(§3.3) |

---

## 1. 기술적으로 가능한가

### 1.1 확인해야 했던 것

| 질문 | 답 | 근거 |
|---|---|---|
| Forge 앱 백엔드가 **다른 Forge 앱**을 직접 부를 수 있나 | 된다 — 상대의 webtrigger URL 을 `fetch` 로 부른다(사용자 컨텍스트 없이도 200) | 사전 실측 |
| 받는 쪽이 "누가 불렀는지" 알 수 있나 | **모른다** — 핸들러 context 에 `principal: null`, 사이트 ARI 만 온다 | 사전 실측, 공식 문서 "Web trigger URLs are not authenticated by the Forge platform"[^wt] |
| 그럼 인증은 | 우리가 한다 — 요청·응답 원문에 Ed25519 서명. Forge 런타임(Node 22)의 `crypto` 로 서명·검증 동작, 본문 1바이트 변조 감지 | 사전 실측 |
| 큰 데이터 | 200KB 본문 OK(0.26초) | 사전 실측 |
| 상대 URL 을 어떻게 아나 | 각 앱이 런타임에 `webTrigger.getUrl(key)` 로 자기 URL 을 얻는다(CLI 로 만든 URL 과 같음). 재배포·major 업그레이드 후에도 유지 | 사전 실측, 공식[^wtapi] |
| URL 이 새면 | URL 회전 가능 — `getUrl(key, true)` 로 새 URL, `deleteUrl` 로 옛 URL 즉시 404 | 사전 실측 |
| 응답에 우리 헤더(서명)를 실을 수 있나 | 된다(dynamic 응답의 사용자 헤더가 호출자에게 그대로 온다) | 사전 실측, 공식(응답 `headers`)[^wt] |
| 받는 쪽에서 그 사람(actor)으로 Jira 를 부를 수 있나 | **`asUser()` 불가**(사용자 세션 없음). 대신 asApp 으로 그 사람의 권한을 조회한다 — `user/permission/search?accountId=` 200(0.4~0.6초). `permissions/check` 에 accountId 지정은 403 | 사전 실측 |
| 마켓플레이스 영향 | dynamic webtrigger·외부 egress → Runs on Atlassian 실격 | 공식[^roa], 배포 도구 출력 |

"사전 실측"은 본 개발 전에 시험용 앱 두 개로 같은 사이트에서 측정한 결과다.

### 1.2 다른 방법과 비교 (왜 webtrigger 인가)

| | webtrigger + 서명(채택) | apiRoute + 3LO | 엔티티 프로퍼티(이전) |
|---|---|---|---|
| 고객 설치 때 할 일 | 연결 코드 한 번 붙여넣기 | 사이트마다 REST API 켜기·OAuth 앱·동의·Secret 보관 | 없음 |
| 사람 없는 경로(트리거) | 그대로 됨 | 저장된 refresh token 주인에 의존(퇴사하면 정지) | 됨 |
| 속도 | 약 0.2초 | 약 1.8초 | 게시·읽기 주기만큼 늦음 |
| 위조 방어 | 서명·사이트·재전송·작업 목록 | 플랫폼 토큰 | 서명했지만 아무나 덮어쓰기·지우기 가능 |
| Runs on Atlassian | 실격 | 실격(호출하는 쪽) | 유지 |

apiRoute 는 **외부 시스템**용으로 남겼다 → `APIROUTE-EXTERNAL-API.md`.

### 1.3 공식 문서의 제약사항과 우리 대응

| 제약(공식) | 출처 | 우리 영향·대응 |
|---|---|---|
| **플랫폼 인증 없음** — "Web trigger URLs are not authenticated by the Forge platform", URL 을 아는 누구나 호출 가능 | [Web triggers][wt] · [Web trigger 모듈][wtm] | Ed25519 서명·사이트·연결 id·시각·재전송 검사로 직접 인증(§2.2). URL 은 KVS 에만, 화면·로그에 안 남김 |
| **webtrigger 함수 안에서 `asUser` 동작 안 함** — 호출에 Atlassian 사용자가 붙지 않는다 | [Web trigger 모듈][wtm] | 받는 쪽은 asApp 으로 actor 권한 조회, 기존 서비스 재사용 시 asUser 단계 우회(§2.3·§3.3 결함 1) |
| **dynamic 은 Runs on Atlassian 실격**(static 만 자격) | [Web trigger 모듈][wtm] · [Runs on Atlassian][roa] | 서명 응답·데이터 응답이 필요해 dynamic 필수 → 실격 수용(D4) |
| **첫 dynamic webtrigger 추가 = major 버전** | [Web trigger 모듈][wtm] | 이미 major 로 배포(고객 재동의 1회). 이후 같은 모듈 유지 |
| **URL 형식** — `urlFormat` 기본 v1(앱 기준), 새 트리거는 v2(설치 기준) 권장. 형식을 바꾸면 새로 만드는 URL 이 바뀜(기존 URL 은 유지) | [Web trigger 모듈][wtm] | 현재 기본값 사용, URL 은 설치마다 다르다는 전제로 페어링 때 교환. 형식 변경 시 재페어링 계획 필요 |
| **실행 시간 최대 55초** | [Invocation limits][lim] | `timeoutSeconds` 지정 불가(실측) → 핸들러 자체 예산 6초, 호출자 제한 8초 |
| **요청 본문 최대 5MB**(헤더 포함, 요청·응답 모두 함수 한도에 포함) | [Invocation limits][lim] | 우리 상한 256KB(수신 1단계), 작업별 상한·커서로 더 작게 |
| **호출 한도** — 설치당 분당 7,000·초당 300, 사용자당 분당 1,200(고정 1분 창). 429 시 `X-Ratelimit-Reset` 까지 기다린 뒤 재시도, webtrigger 는 자동 재시도 없음 | [Invocation limits][lim] · [Web triggers][wt] | 위조 폭주가 한도는 먹을 수 있어도 DB 비용은 0(1~8단계) — URL 이 새면 정상 호출도 429 를 받을 수 있다는 뜻(→ 주소 바꾸기). 플랫폼 429 는 클라이언트가 곧바로 재시도하지 않는다(`HTTP_429`, 5xx 만 재시도). 우리 자체 actor 별 한도는 `RATE_LIMITED`(재시도 안 함) |
| **외부 요청 한도** — 호출당 런타임 분당 100건, 앱당 분당 50,000건(`requestJira` 제외) | [Invocation limits][lim] | 화면 1회당 채널 호출 1~수 건 — 여유 |
| **메모리 기본 512MB(최대 1,024MB)** | [Invocation limits][lim] | 영향 없음 |
| **응답 형식** — 함수 결과가 형식에 안 맞으면 500 | [Web triggers][wt] | 서명 실패 시에도 최소 JSON 응답을 돌려줌 |
| **CLI 로 URL 생성은 설치 관리자만**, 그 밖엔 SDK | [Web triggers][wt] | 런타임 `getUrl` 로 자동 — 고객이 CLI 를 쓰지 않는다 |
| (제안 단계) HMAC 인증 webtrigger | 커뮤니티 [RFC-141](https://community.developer.atlassian.com/t/rfc-141-hmac-authenticated-web-triggers/102029) | 쓰지 않음. 정식 출시되면 서명 위에 한 겹 더 검토 |

실측으로만 확인한 제약(문서에 없음): production 환경 webtrigger 도메인 미확인(egress 정규식 확정 전), 받는 쪽 핸들러 `principal: null`, 다른 사용자의 `permissions/check`(accountId) 403.

---

## 2. 어떻게 구현했나

### 2.1 구조

![앱 간 연동 구조](img/diagram-1-webtrigger-app-channel.png)

- 두 앱이 **대칭**이다. 각자 webtrigger 하나(`op` 로 분기)와 보내는 클라이언트 하나.
- 공유 계약 파일(봉투·서명·작업 목록·키링·연결 코드)은 두 앱에 **바이트까지 같게** 두고, 같은지 테스트로 고정한다.

### 2.2 요청 한 건이 거치는 단계

전송: `POST {상대 URL}`, 헤더 `x-moves-link-sig: <Ed25519 서명 86자>`, 본문 JSON 원문.
서명 대상 = `"moves-link-rpc/1\n"` + 본문 원문 바이트(재직렬화 없음 — 정규화 문제 제거, 다른 용도 서명과 섞이지 않게 도메인 접두).

```json
{ "env": { "v":1, "linkId":"<연결 id>", "op":"org.teams", "from":"approval", "to":"workforce",
           "cloudId":"<사이트>", "kid":"ap-dev-1", "iat":1792476027960, "nonce":"<22자>",
           "actor":{"type":"USER","accountId":"<보낸 사람>"} },
  "data": { … } }
```

![요청 검증 단계](img/diagram-3-request-check-steps.png)

받는 쪽 `ChannelServer` 검사 순서 — **앞 8단계는 DB·KVS 를 건드리지 않는다**(위조 폭주가 비용을 못 만든다).

| 단계 | 검사 | 실패 |
|---|---|---|
| 1 | POST, 본문 ≤ 256KB | 405 / 413 |
| 2 | JSON 형태, `to`=나, `from`=상대 | 400 `MALFORMED` |
| 3 | 발급 시각 ±120초 | 401 `STALE_REQUEST` |
| 4 | 서명 키 id(kid)가 신뢰 목록에 있나 | 401 `UNTRUSTED_KID` |
| 5 | Ed25519 서명 | 401 `BAD_SIGNATURE` |
| 6 | 사이트(cloudId)가 이 설치인가 | 403 `SITE_MISMATCH` |
| 7 | 작업(op)이 이 방향 허용 목록에 있나 | 400 `OP_UNKNOWN`(서명 응답) |
| 8 | nonce 재사용(인스턴스 메모리) | 409 `REPLAYED` |
| 9 | 연결 상태(KVS): PAIRED·같은 linkId | `NOT_PAIRED` / 409 `STALE_LINK` |
| 10 | 라이선스·연동 스위치 | `LICENSE_INACTIVE` / `LINK_DISABLED` |
| 11 | actor 정책 — 사람 필수 작업인가, 시스템 작업 사유가 허용 목록인가, 요청 스키마 | `ACTOR_NOT_ALLOWED` / `MALFORMED` |
| 12 | actor 실재·활성 확인 → 그 사람 기준으로 핸들러 실행 | 작업별 코드 |

호출자도 응답을 검증한다: 서명, `re`(=내가 보낸 nonce), from/to/linkId/cloudId/op, 시각. 옛 응답을 끼워 넣을 수 없다.

### 2.3 행위자(actor) 기준 처리

- **보내는 쪽**: `ChannelClient` 는 accountId 를 인자로 받지 않는다. resolver 가 연 실행 범위(`ActorScope`/`InvocationScope`)에서 플랫폼이 준 사용자 id 만 읽어 봉투에 넣는다 → 화면·payload 값으로 남을 사칭할 수 없다. 보내기 전에 자기 가드·asUser 확인을 이미 통과한 상태다.
- **받는 쪽**: webtrigger 에는 사용자 세션이 없다. 그래서
  - 승인 앱: actor 실재·활성(asApp `/user?accountId`) → 이슈가 걸린 작업은 asApp `user/permission/search?accountId=actor` 결과가 **정확히 [actor]** 일 때만 허용 → 기존 DB 규칙(작성자 본인·팀장 범위·관리자)으로 좁힘.
  - 워크포스: 워크포스 자체 권한 세트(DB)로 판정. **채널 경로에서는 Jira 관리자 판정·이름 조회처럼 asUser 가 필요한 단계를 건너뛴다**(좁히기만 한다).
- 사람 없는 요청(트리거·큐)은 `actor:SYSTEM` + 허용된 사유만, 대상은 서버가 Jira 데이터로 정한 1건.

### 2.4 연결(페어링)·키

![첫 연결 순서](img/diagram-4-pairing-sequence.png)

- **연결 코드** `MLNK1.<payload>.<서명>` — payload 에 앱·환경·사이트·자기 URL·linkId·일회용 pin·만료(30분). 코드 자체가 비밀(pin)이라 화면은 복사만, 로그엔 해시만.
- 순서: A 관리자 "연결 코드 만들기" → B 관리자 붙여넣기 → B 가 코드 서명·사이트·만료 확인 → B 가 A 에 `pair.complete{pin, B의 URL}` 전송 → A 가 pin 확인·저장 → 서명 응답 → B 저장. **한쪽 붙여넣기로 양방향 완성.** 어느 쪽이든 코드를 만들 수 있다.
- 해제·URL 회전: `sys.unpair`, `sys.rekey`(새 URL 을 상대가 확인한 뒤 옛 URL 삭제).
- 서명 키: 앱마다 Ed25519 한 쌍. 비밀 키는 Forge 암호화 변수, 공개 키는 두 앱에 내장된 공개 키 목록, 신뢰할 키 범위는 환경 변수로 정한다. 회전 = 새 kid 를 양쪽 keyring 에 추가·배포 → 서명 전환 → 옛 kid 제거.
- ⚠ 운영(prd) 키는 아직 없다 — production 배포 전에 만들어 등록해야 한다. 서명 키 운영 절차서는 옛 방식 기준이라 새 채널에 맞게 고쳐야 한다.

### 2.5 채널 작업(14종)

| 방향 | 작업 | 쓰임(화면) |
|---|---|---|
| 양쪽 | `pair.complete` · `sys.ping` · `sys.rekey` · `sys.unpair` | 연결·연결 확인·주소 바꾸기·해제 |
| 승인→워크포스 | `org.get` · `org.teams` | 결재자(소속 팀장) 결정, 설정 > 팀 "워크포스에서 받은 팀" |
| 승인→워크포스 | `link.resolve` · `kb.get` | 이슈가 워크포스 연동인지·팀장 작성 기간·사전 승인, 근무 기준(하루 시간·공휴일) |
| 승인→워크포스 | `change.notify` | 인증·기간 마감·통제·결재선 변경 알림(캐시 무효화) |
| 워크포스→승인 | `cert.query` · `issue.control` · `period.status` | 승인 배지·원가 집계, 수정 가능 여부·숨긴 기록, 기간 상태 |
| 워크포스→승인 | `write.judge` → `write.commit` | 워크포스에서 워크로그 입력 시 승인 앱이 판정 → 저장 결과 결속 |
| 워크포스→승인 | `flows.list` · `change.notify` | 팀장 승인 설정의 결재선 목록, 조직·연결·작성 기간 변경 알림 |

받은 값은 **캐시일 뿐 원장이 아니다** — 원장 주인 앱에 다시 물을 수 있다. 상대가 응답하지 않으면 막는다(fail-close): 연동 이슈 쓰기 거부, 기존 잠금 유지.

### 2.6 구성 요소

| 역할 | 승인 앱 | 워크포스 |
|---|---|---|
| 공유 계약(두 앱 동일) | 봉투·서명 검증, Ed25519, 작업 목록·요청 스키마·actor 정책, 공개 키 목록, 연결 코드, 상대 URL 검사 | 같음 |
| 받기 | 채널 서버(검증 12단계) + 작업별 핸들러 | 같음 |
| 보내기 | 채널 클라이언트(실행 범위의 actor 만 사용) | 같음 |
| 연결 상태·페어링 | 연결 상태 저장(원자적 전이)·페어링 서비스 | 같음 |
| actor 확인 | Jira 실재·활성 + 권한 조회(asApp) | 워크포스 권한 세트(채널 경로는 asUser 단계 생략) |
| manifest | webtrigger 1개(dynamic), 상대 앱 webtrigger 도메인 egress | 같음 |
| 화면 | 설정 > 워크포스 연동 | 설정 > 승인 앱 연결 |

---

## 3. 어떻게 검증하나 · 결과

### 3.1 자동 테스트

- 공유 계약: 고정 서명 예제(테스트 벡터), 봉투 검증 단계별 거부, 두 앱 공유 파일 일치.
- 서버: 단계별 거부·서명 응답, actor 정책, 페어링 경쟁(원자적 상태 전이).
- 채널 경로 고정(2026-10-20 추가): 채널 표시가 중첩 실행 범위에서 유지되는가, 채널에서 asUser 단계를 건너뛰는가, KVS 없는 키 처리.
- 결과: 승인 앱 189 suites / 2,762 tests, 워크포스 184 / 2,603 통과.

### 3.2 보안 실측 — 공격자 관점 (dev, 2026-10-20)

방법: 두 앱을 실제로 배포·연결한 뒤, 외부에서 스크립트로 상대 URL 에 직접 요청을 보낸다.

| 가정 | 시나리오 | 결과 |
|---|---|---|
| URL 만 유출(키 없음) | GET, JSON 아님, 300KB, 방향 뒤집기, 시각 ±10분, 모르는 키, 서명 없음·위조, 사람 사칭, 다른 사이트, 위조 40건 동시 — **두 앱 모두** | 전부 거부(405/400/413/401/403), 거부 응답은 코드만, DB 흔적 없음 |
| 서명 키 유출(시험 키를 잠시 신뢰) | 재전송, 서명 후 변조, 다른 사이트, 다른 연결 id, 오래된 시각, 모르는 작업, 허용 안 된 시스템 사유, 없는 사람 사칭, 스키마 밖 필드 | 전부 거부. 시험 키 제거 후 `UNTRUSTED_KID` 확인 |
| 공격 뒤 | 정상 연결 확인 | 승인→워크포스 0.8초, 워크포스→승인 2초 |

![공격 뒤 연결 확인](img/wt-04-ping-after-attack.jpg)

남은 위험(중 — 키 유출 전제): 같은 요청을 120초 안에 **동시에** 여러 번 보내면 인스턴스가 달라 1~5건이 통과할 수 있다(재전송 기록이 인스턴스 메모리). 쓰기 작업에만 KVS 기록을 두는 안이 있다 — 결정 필요.

### 3.3 기능 실측 — 화면에서 (dev, 2026-10-20)

방법: 실제 화면을 조작하고, 브라우저에서 화면이 받은 서버 응답을 함께 확인했다(그 데이터가 상대 앱에서만 나올 수 있는지로 판정).

| 작업 | 화면 | 결과 |
|---|---|---|
| 연결 | 양쪽 설정 화면 "연결됨", 상대 버전 표시 | 통과 |
| `org.teams` | 승인 설정 > 팀 "워크포스에서 받은 팀" | 통과(수정 후) |
| `org.get` | "내 Workforce 결재자 구성" 팀·팀장 | 통과 |
| `link.resolve`·`kb.get` | 연동 이슈 Work log 탭 — 연동 판정, 하루 480분·근무일 22일 | 통과 |
| `flows.list` | 워크포스 작업 관리 > 승인 설정 | 통과(수정 후) |
| `cert.query` | 워크포스 My Work 달력 승인 잠금·확인 중 시간 | 통과 |
| `issue.control` | 승인된 기록 모달 "승인됨·수정 불가" | 통과 |
| `write.judge`→`write.commit` | 워크포스에서 1시간 입력 → `signed:true` → 승인 앱에 "승인 대기" + 승인 요청 자동 생성 | 통과 |

<table><tr>
<td><img src="img/wt-02-approval-paired.jpg" width="420"><br>승인 앱 — 연결됨</td>
<td><img src="img/wt-03-workforce-paired.jpg" width="420"><br>워크포스 — 연결됨</td>
</tr><tr>
<td><img src="img/wt-05-org-teams.jpg" width="420"><br>워크포스에서 받은 팀(org.teams)</td>
<td><img src="img/wt-06-linked-issue.jpg" width="420"><br>연동 이슈 판정(link.resolve·kb.get)</td>
</tr><tr>
<td><img src="img/wt-08-wf-write.jpg" width="420"><br>워크포스 입력(write.judge·commit)</td>
<td><img src="img/wt-09-approval-pending.jpg" width="420"><br>승인 앱에 "승인 대기"</td>
</tr></table>

**실측 중 발견해 고친 결함 2건**(2026-10-20 수정·재배포 후 재실측 통과):
1. 워크포스 Admin 도 팀 목록이 거부됐다 — 채널이 재사용한 기존 서비스 안의 asUser 호출(Jira 관리자 판정·이름 조회)이 webtrigger 에서 실패. 단위 테스트의 모의 객체가 이를 숨겼다. → 채널 경로에서 그 단계를 건너뛰고 테스트로 고정.
2. 팀장 이슈 설정이 하나도 없으면 목록·연동 판정이 실패했다 — KVS `batchGet` 이 없는 키를 실패 목록(`KEY_NOT_FOUND`)으로 돌려준다. → 그 코드만 "없음"으로.


### 3.4 아직 확인하지 않은 것

| 항목 | 하는 법 |
|---|---|
| 결재 → 워크포스 화면 반영(`change.notify` CERT) | 결재자 계정으로 승인 → 워크포스 My Work 배지 확인 |
| 워크포스 조직 변경 알림(`change.notify` ORG) | 워크포스 팀장 변경 → 승인 앱 팀 탭 새로 고침 |
| `period.status` | 워크포스에 호출부 없음 — 계약 정리 대상 |
| 주소 바꾸기·해제 실사용, 권한 없는 활성 사용자의 권한 조회 응답 | 운영 전 |
| production webtrigger 도메인·egress | prd 키 생성 후 production 배포 때 |

### 3.5 다시 검증하려면

1. 두 앱 dev 배포 → 양쪽 설정에서 연결(연결 코드) → "연결 확인" 응답·상대 버전.
2. §3.3 표의 화면을 순서대로 열고, 브라우저 개발자 도구의 네트워크 탭에서 화면이 받은 서버 응답의 성공 여부·내용을 본다.
3. 보안: 공격 스크립트(키 없음·시험 키 두 종류)로 §3.2 시나리오를 보낸다 — 시험 키는 개발 환경에서만 잠시 신뢰하고, 끝나면 신뢰 목록에서 제거한다.

---

[wt]: https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/
[wtm]: https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/
[roa]: https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/
[lim]: https://developer.atlassian.com/platform/forge/limits-invocation/

[^wt]: [Web triggers — Forge runtime reference](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/)
[^wtapi]: [Managing web trigger URLs via SDK](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/) · [Web trigger (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/)
[^roa]: [Build Runs on Atlassian apps](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/)
