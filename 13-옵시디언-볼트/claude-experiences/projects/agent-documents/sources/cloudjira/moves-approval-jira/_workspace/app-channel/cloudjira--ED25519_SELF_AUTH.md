# Ed25519 자체 인증 설계 설명

작성일: 2026-10-19
대상: 승인 앱(moves-approval-jira)과 워크포스(moves-workforce) 사이의 웹트리거 통신
그림: 같은 폴더의 ED25519_SELF_AUTH.drawio (3페이지)
원본 설계: _workspace/workforce-channel-rest/01_architect_design.md 2.2~2.6절
공유 코드: src/integration/channel/ (두 리포에 바이트 그대로 복사)

---

## 1. 한 줄 요약

두 앱이 각자 **개인키로 요청에 도장을 찍고**, 받는 앱은 빌드에 들어 있는 **상대 공개키로 도장을 확인**합니다. 도장에는 사이트, 연결 id, 시각, 일회용 번호, 요청한 사용자까지 포함되어 있어서 위조·변조·재전송·다른 사이트 사칭이 막힙니다.

---

## 2. 왜 직접 만들어야 하나

| 사실 | 근거 |
|---|---|
| Forge는 웹트리거 URL을 인증하지 않는다. URL을 아는 사람은 누구나 호출할 수 있다 | Atlassian 공식: Web trigger 모듈 |
| 웹트리거 함수에는 사용자 정보가 없다. principal 이 null 이고 asUser 를 쓸 수 없다 | 실측 2026-10-19 (spikes/app-channel/RESULTS.md) |
| 받는 쪽에 오는 것은 사이트 정보(installContext)뿐이다 | 실측 2026-10-19 |

그래서 "누가 보냈는지", "내용이 바뀌지 않았는지", "같은 요청을 다시 보낸 것이 아닌지"를 앱이 스스로 확인해야 합니다.

---

## 3. 원리를 쉽게

| 개념 | 비유 | 실제 |
|---|---|---|
| 개인키 | 회사 인감 | 각 앱만 가진 32바이트 비밀값. Forge 환경 변수에 암호화 저장 |
| 공개키 | 인감 증명서 | 누구나 봐도 되는 값. 상대 앱 빌드 안의 keyring.js 에 들어 있음 |
| 서명 | 인감을 찍은 도장 | 요청 본문 전체에 대한 Ed25519 서명 (86자) |
| 검증 | 도장과 증명서 대조 | 공개키로 서명을 확인. 본문이 1바이트라도 바뀌면 실패 |

Ed25519를 고른 이유

- Forge 런타임(Node 22)의 기본 crypto 로 서명·검증이 된다. 별도 라이브러리가 필요 없다 (실측 W1)
- 본문을 바꾸면 검증이 실패하는 것을 확인했다 (실측 W2)
- 두 앱 사이에 이미 같은 방식의 키와 검증 코드가 있어 새 비밀을 만들지 않는다

---

## 4. 구성 요소

| 구성 요소 | 어디에 | 비밀 여부 | 역할 |
|---|---|---|---|
| 개인키(seed) | 각 앱 Forge 환경 변수 MOVES_LINK_SIGNING_KEY (forge variables --encrypt) | 비밀 | 자기 요청·응답에 서명 |
| kid (키 이름) | 환경 변수 MOVES_LINK_SIGNING_KID, 예: ap-prd-1, wf-prd-1 | 공개 | 어떤 키로 서명했는지 표시. 키 교체를 가능하게 함 |
| 공개키 목록 | keyring.js, 두 앱 빌드에 같은 파일로 내장 | 공개 | 상대 서명 검증 |
| 신뢰 집합 | keyring ∩ 환경 변수 MOVES_LINK_TRUSTED_KIDS (없으면 prd 키만) | 공개 | 개발용 키가 운영 사이트에서 통하지 않게 함 |
| linkId | 각 앱 KVS link:channel | 반공개 | 이 사이트의 이 연결을 가리키는 22자 id. 재연결하면 바뀜 |
| 상대 URL | 각 앱 KVS link:channel (secret 저장) | 반공개 | 상대 웹트리거 주소. 형식 검사를 통과한 것만 저장 |
| cloudId | 웹트리거 context 의 installContext | 공개 | 요청이 이 사이트용인지 확인 |
| nonce | 요청마다 새로 만드는 16바이트 난수 | 공개 | 재전송 감지, 응답을 요청에 묶음 |
| iat | 서명 시각 (ms) | 공개 | 120초가 지난 요청 거부 |
| actor | 요청을 일으킨 사람 또는 SYSTEM 사유 | 공개 | 받는 앱이 그 사람 기준으로 권한을 다시 좁힘 |

---

## 5. 요청 한 번의 흐름

### 5.1 보내는 앱

1. 사용자가 화면에서 작업합니다. resolver 가 기존 권한 가드와 asUser 확인을 먼저 통과합니다.
2. ChannelClient 가 봉투(env)를 만듭니다: v, linkId, op, from, to, cloudId, kid, iat, nonce, actor, idem(쓰기만).
3. actor 의 accountId 는 **resolver context 의 principal.accountId 만** 씁니다. 화면이나 인자로 받은 값은 쓰지 않습니다.
4. 서명 대상 = "moves-link-rpc/1\n" + 본문 원문 바이트. 개인키로 서명합니다.
5. POST 상대 URL, 헤더 x-moves-link-sig 에 서명, 본문은 서명한 바이트 그대로 보냅니다.

서명 대상 앞에 붙는 접두("moves-link-rpc/1\n")는 용도마다 다릅니다. 연결 코드는 "moves-link-pair/1\n" 입니다. 그래서 다른 용도로 만든 서명을 가져와 재사용할 수 없습니다.

### 5.2 받는 앱: 12단계 검증

비싼 검사일수록 뒤에 둡니다. 1~8단계는 CPU만 쓰고 DB를 건드리지 않습니다.

| 단계 | 검사 | 실패 시 | 비용 |
|---|---|---|---|
| 1 | POST 인지, 본문 256KB 이하인지 | 405, 413 | 없음 |
| 2 | JSON 형태, 버전, 받는 앱이 나인지, 보낸 앱이 상대 계열인지 | 400 MALFORMED | 없음 |
| 3 | 이 방향에서 허용된 작업(op)인지 | 400 OP_UNKNOWN | 없음 |
| 4 | 서명 시각이 지금 기준 120초 안인지 | 401 STALE_REQUEST | 없음 |
| 5 | kid 가 신뢰 집합에 있는지 | 401 UNTRUSTED_KID | 없음 |
| 6 | Ed25519 서명 검증 | 401 BAD_SIGNATURE | CPU |
| 7 | 봉투의 cloudId 가 이 설치의 사이트인지 | 403 SITE_MISMATCH | 없음 |
| 8 | 같은 nonce 를 최근(5분, 2,000건)에 받았는지 | 409 REPLAYED | 메모리 |
| 9 | 연결 상태가 PAIRED 이고 linkId 가 같은지 | 403 NOT_PAIRED, 409 STALE_LINK | KVS 1회 |
| 10 | 라이선스 활성 | 402 LICENSE_INACTIVE | 없음 |
| 11 | actor 정책: 사람이 필요한 작업에 SYSTEM 이 왔는지, SYSTEM 사유가 허용 목록인지 | 403 ACTOR_NOT_ALLOWED | 없음 |
| 12 | actor 재확인(6장) 후 업무 처리 | 작업별 코드 | SQL, Jira |

1~8단계 실패는 서명 없는 최소 응답만 돌려주고 SQL·KVS를 쓰지 않습니다. 위조 요청이 쏟아져도 DB 비용이 생기지 않습니다.

### 5.3 응답도 검증한다

받는 앱은 응답에도 서명하고, 응답 봉투에 **요청의 nonce(re)** 를 넣습니다. 보내는 앱은 다음을 모두 확인한 응답만 씁니다.

- 서명이 맞는가
- re 가 내가 보낸 nonce 와 같은가
- from, to, linkId, cloudId, op 가 맞는가
- 응답 시각이 120초 안인가

그래서 예전에 받은 정상 응답을 중간에서 다시 끼워 넣을 수 없습니다.

---

## 6. 사용자(actor)를 어떻게 믿나

받는 앱은 "상대 앱이 서명한 사용자"를 믿고, **그 사용자 기준으로 다시 확인**합니다.

| 수준 | 방법 | 쓰는 곳 |
|---|---|---|
| R0 | 보내는 앱의 1차 확인만 믿음. 민감하지 않은 데이터 | 연결 여부, 작성 기간, 캐시 무효화 알림 |
| R1 | 그 사용자가 실재하고 활성인지 Jira 에 확인(asApp, 10분 메모) + 우리 DB 규칙(본인, 팀장 범위, 관리자) | 기간 상태, 결재선, 원가 숫자 |
| R2 | 그 사용자의 Jira 권한을 이슈마다 확인(asApp 으로 accountId 지정 권한 조회). 응답이 정확히 그 사용자일 때만 허용 | 워크로그 쓰기 판정, 이슈 배지, 숨긴 워크로그 목록 |

R2 실측(2026-10-19): asApp 권한 조회는 사용자 동의와 상관없이 200, 0.4~0.6초. 권한 있는 사용자는 그 계정이 돌아오고, 비활성 계정은 빈 목록이 돌아옴. 권한 없는 활성 계정의 응답은 아직 미측정입니다.

사람이 없는 흐름(트리거, 스윕)은 actor 를 SYSTEM 으로 보내고, 허용 사유는 6개뿐입니다. 전부 1건 읽기이거나 캐시 무효화라 SYSTEM 으로 데이터 범위가 넓어지지 않습니다.

---

## 7. 처음 연결: 연결 코드 붙여넣기

상대 URL과 linkId 를 안전하게 교환하는 단계입니다. 관리자가 한 번만 하면 양방향 연결이 끝납니다.

1. A 앱 관리자가 "연결 코드 만들기"를 누릅니다. A 는 자기 URL, linkId, 일회용 pin, 30분 만료가 담긴 코드를 **A 개인키로 서명**해 보여 줍니다. pin 은 해시만 저장합니다.
2. A 관리자가 코드를 복사해 B 앱 관리자에게 전달합니다.
3. B 관리자가 코드를 붙여 넣습니다. B 는 서명, 상대 앱 종류, 환경, 사이트(cloudId), 만료, URL 형식을 확인합니다.
4. B 가 A 의 URL 로 pair.complete 요청을 서명해 보냅니다. 요청에는 pin 과 B 의 URL 이 들어 있습니다.
5. A 는 12단계 검증 후 linkId, 만료, pin 해시를 대조하고 연결 상태를 PAIRED 로 저장합니다. 대기 중인 코드는 1회 쓰고 지웁니다.
6. A 의 서명 응답을 받은 B 도 PAIRED 로 저장합니다.

- 코드에는 pin 이 들어 있으므로 화면에는 복사 버튼만 두고, 로그와 감사에는 원문을 남기지 않습니다.
- 다른 사이트의 코드를 붙이면 B 에서 한 번, A 의 수신 7단계에서 또 한 번 거부됩니다.
- 다시 연결하면 linkId 가 바뀌고, 옛 linkId 로 온 요청은 9단계에서 거부됩니다.

---

## 8. 공격별 방어

| 공격 | 막는 장치 | 단계 |
|---|---|---|
| URL을 알아낸 외부인의 위조 요청 | 개인키 없이 서명 불가 | 5, 6 |
| 중간에서 본문 변조 | 본문 전체가 서명 대상 | 6 |
| 정상 요청을 녹화해 다시 보냄 | 120초 창, nonce 기록, 쓰기 작업 멱등 | 4, 8 |
| 다른 고객 사이트의 요청을 이 사이트에 보냄 | 봉투 cloudId 와 설치 사이트 대조 | 7 |
| 예전 연결의 요청 | linkId 대조 | 9 |
| 예전 정상 응답을 끼워 넣음 | 응답의 re 가 요청 nonce 와 일치해야 함 | 응답 검증 |
| 다른 용도의 서명 재사용 | 용도별 접두 (rpc, pair) | 6 |
| 개발용 키로 운영 사이트 공격 | 신뢰 집합은 기본 prd 키만 | 5 |
| 상대 앱 사칭으로 승인 상태 조작 | 받는 작업 목록에 승인·반려·정책 변경·삭제 실행이 없음 | 3 |
| 서명된 사용자 사칭으로 못 볼 데이터 조회 | 받는 앱이 그 사용자 권한으로 다시 좁힘(R1, R2) | 12 |
| 대량 조회 | 작업별 건수 상한, 사용자당 분당 120회 소프트 상한 | 12 |
| 위조 요청 폭주로 DB 비용 유발 | 1~8단계는 DB 미사용 | 1~8 |

---

## 9. 키 운영

| 작업 | 절차 |
|---|---|
| 생성 | scripts/workforce-link/gen-key.mjs 로 seed, 공개키, 지문 생성 |
| 등록 | 공개키를 keyring.js 에 추가하고 **두 앱 모두** 배포. seed 는 서명하는 앱 환경에만 forge variables set --encrypt. 파일·커밋 금지 |
| 교체(회전) | 새 kid 를 두 keyring 에 추가·배포 → 서명 kid 를 새 것으로 전환 → 옛 kid 제거 배포. 중간에는 둘 다 신뢰하므로 끊기지 않음 |
| 키 폐기 | keyring 에서 kid 를 빼고 배포하면 그 키의 모든 서명이 즉시 무효 |
| 연결 폐기 | 재연결(새 linkId)하면 옛 연결의 요청이 즉시 거부 |
| URL 교체 | 새 URL 발급 → 상대에게 sys.rekey 로 알림 → 상대 확인 후 옛 URL 삭제 |

**운영 전 필수:** 현재 keyring 에는 dev, stg 키만 있고 prd 키(ap-prd-1, wf-prd-1)가 없습니다. production 배포 전에 만들어 두 리포에 등록해야 합니다.

---

## 10. 감수하는 한계

| 한계 | 내용 | 대응 |
|---|---|---|
| 키가 사이트 공통 | 앱 계열 키 하나를 모든 고객 사이트가 씀. seed 가 유출되면 전 사이트에서 사용자 사칭 가능 | 받는 작업 최소화, R2 재확인, 감사 기록, 키 회전. 설치별 키는 KVS 보관·경합 비용 때문에 채택 안 함 |
| 영속 nonce 저장소 없음 | 컨테이너가 다르면 120초 안의 재전송을 못 막을 수 있음 | 모든 쓰기 작업을 멱등으로 설계. 읽기 재전송은 TLS 로 보호된 응답이라 수용 |
| Runs on Atlassian | 부르는 앱은 egress, 받는 앱은 dynamic 웹트리거라 두 앱 모두 실격 | 설계 결정 D4 로 수용 |
| 상대 앱 장애 | 응답이 없으면 판정 불가 | 막기(fail-close): 기존 잠금 유지, 연동 이슈 쓰기는 승인 앱 화면으로 넘김 |

---

## 11. 아직 확인하지 않은 것

| 항목 | 영향 |
|---|---|
| production 환경 웹트리거 URL 도메인 | URL 형식 검사와 egress 선언 확정 |
| 권한 없는 활성 계정에 대한 asApp 권한 조회 응답 | R2 판정 정확성 |
| 여러 권한을 한 번에 조회할 때의 의미 | R2 호출 수 |
| Forge 의 HMAC 인증 웹트리거(forge webtrigger create --readSecretKey) | 플랫폼 인증이 있다면 일부를 대체할 수 있음 |

---

## 12. 출처

| 구분 | 위치 |
|---|---|
| 원본 설계 | _workspace/workforce-channel-rest/01_architect_design.md 2.2 봉투, 2.4 연결, 2.5 actor, 2.6 위험과 완화 |
| 공유 코드 | src/integration/channel/ envelope.js, keyring.js, ed25519.js, pairingCode.js, ops.js |
| 공유 파일 관리 | _workspace/workforce-channel-rest/SHARED_READY.md |
| 실측 | C:\CloudJira\spikes\app-channel\RESULTS.md (W1 Ed25519 동작, W2 변조 감지, W5 URL 유지, W6 getUrl) |
| Atlassian Web trigger 모듈 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ |
| Atlassian Web trigger 런타임 API | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/ |
| Atlassian Runs on Atlassian | https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/ |
| Atlassian 함수 실행 한도 | https://developer.atlassian.com/platform/forge/limits-invocation/ |
