# moves-approval-jira — Jira Cloud 승인 앱 (Forge)

> 현행화 기준: 2026-10-21 · 출발점: `moves-approval`(Confluence 판) 커밋 `fa07591` 을 `git archive` 로 복사
> 작업 규칙(스타일·불변식·보안·검증·배포·커밋)은 `AGENTS.md`, 제품·아키텍처 설계는 `docs/DESIGN.md`.

Confluence 승인 앱의 엔진(상태 머신·권한 가드·Forge SQL 계층·업무함·위임·서명/PIN·CC·독촉·감사·보관·증명서)을
Jira 로 옮기고, **워크로그 건별 승인·기간 잠금**을 제공한다. 이슈·필드 변경 승인은 코드를 보존하되 현재 제품 기능에서 제외한다. 상태 변경 승인은 2026-10-20 `statusChangeApprovalEnabled`(기본 꺼짐)로 다시 열었다.
워크포스(`C:\CloudJira\moves-workforce`)와 같이 설치되면 연동되고, 없으면 단독으로 동작한다.

## 확정 결정

| 항목 | 결정 | 날짜 |
|---|---|---|
| 리포 | 별도 리포. 코어는 복사(B안), 나중에 모노레포 통합 검토 | 2026-10-03 |
| 첫 기능 | **타임시트 승인**(고객 핵심) → 그다음 이슈 상태 변경 승인 | 2026-10-03 |
| 타임시트 기본 단위 | **월**(정책값 `approvalUnit`, 주 단위로 변경 가능) | 2026-10-03 |
| 기간 잠금 | `jira:timeTrackingProvider` 로 Jira 기본 Log work 를 우리 화면으로 대체 + 나머지 경로는 감지·재승인 | 2026-10-03 |
| 미소속자 작성 금지 | Jira 권한 스킴("Work on work items" → 프로젝트 역할) — 고객 관리자 작업. 우리는 가이드·역할 동기화(워크포스) | 2026-10-03 |
| 워크포스 연동 | **앱 간 = webtrigger(dynamic) + Ed25519 서명, 행위자(actor) 기준 처리**, 첫 연결은 연결 코드 붙여넣기(페어링). 엔티티 프로퍼티 교환은 전부 제거. 외부 시스템 = apiRoute + 3LO(승인 앱은 후속 과제). Runs on Atlassian 자격 포기(두 앱). **워크포스 DB 무증가** 유지(KVS 키만) — 설계 `_workspace/workforce-channel-rest/01_architect_design.md` | 2026-10-19 (이전: 프로퍼티 + 서명, 2026-10-02) |
| 워크포스 표시 | 전부 표시 + 상태 배지, 원가·정산만 "승인분만" | 2026-10-03 |
| 알림 | 앱 내 알림함 + Jira 코멘트 @멘션(외부 채널은 미결정) | — |
| 개발 사이트 | https://tom-chkim-dev.atlassian.net (development) | — |

### 워크로그 중심 개선 요구 (2026-10-13)

이 요구는 아래 변경 이력의 `linked-mode-ux` 입력 창구·정책 권한 결정보다 우선한다. 구현·검증 현황은 `_workspace/worklog-approval-simplification/`에서 관리한다.

- 정상 입력 창구는 **Jira 이슈 패널 또는 Workforce 앱 내부**다. 동일 이슈에 두 앱의 입력기를 중복 노출하지 않는다.
- 작성한 워크로그별 승인 요청과 승인자의 일괄 결정을 제공한다. 자동 접수 기본값은 저장 직후이며 기본 승인자는 소속 팀장, 수동 요청에서는 승인자를 선택할 수 있다. 팀장 부재를 자기 승인으로 처리하지 않는다.
- 정상 입력 증명과 승인 여부는 별개다. 승인·마감된 기록의 수정·삭제를 차단하고, 소명·재승인 요청 중에도 기존 잠금을 유지한다.
- 승인월 진행 중 통계와 마감 후 승인분 통계를 구분한다. 건별 목록에는 미승인분도 상태와 함께 표시한다.
- 연동 프로젝트 팀장은 자신이 담당하는 프로젝트의 연결 이슈 정책을 설정한다. 단독 모드에서도 같은 승인 흐름을 제공한다.
- 이슈 화면은 입력·승인 상태·수정 가능 여부·결정 및 변경 이력 중심으로 구성한다. 이전 사전 승인·인증·상태 변경 기능의 명칭을 새 건별 승인과 혼동시키지 않는다.

## 디렉터리 (목표 구조 — 이식 작업 중)

```
src/
  domain/approval/   상태 머신. SQL 무발행, Jira API 무호출, now 주입 (Confluence 판에서 이식)
  domain/timesheet/  기간 키·워크로그 묶음 지문·제한선 판정 — 역시 순수
  permission/        guardedDefine · PermissionMap · PrincipalResolver · JiraPermission
  rdb/               schema/{ddl,migrate,TableReadiness} · query/{CommonQuery,QueryBuilder,SqlTime}
  api/jira/          RequestJira — asUser 기본, asApp 은 사유 인자 강제
  integration/       workforce/ — 엔티티 프로퍼티 계약·서명
  resolver/{도메인}/  XxxController · XxxService · XxxRepository
  trigger/           얇은 어댑터만 (워크로그 이벤트, 스윕)
static/ui/           별도 패키지. CRA/craco 멀티 엔트리
```

## 계층 규약 (Confluence 판과 동일)

**resolver 등록은 3단계다. 하나라도 빠지면 런타임에서만 죽는다.**
1. Controller 에서 `guardedDefine(resolver, name, handler)`
2. `src/permission/PermissionMap.js` 에 선언 — 미선언은 `PERMISSION_UNMAPPED` 로 원천 거부
3. `src/index.js` 의 `CONTROLLER_REGISTRARS` 에 추가
계약 테스트(`test/permission/permissionMap.contract.test.js`)가 세 곳을 대조한다.

**권한 축**: `'PUBLIC'` | `'SELF'` | `{issue:'view'|'edit', issueIdKey}` | `{project:'admin', projectIdKey}` | `{admin:true}` | `{jiraAdmin:true}` | `{teamLead:true}`(타임시트 결재자)

**응답**: 성공 `{success:true, ...result}` / 실패 `{success:false, error:{name,code,message,cause}}`. 프론트는 **`error.code`** 로 분기.
**서버는 사람이 읽을 문구를 만들지 않는다.** 에러는 코드로, 알림·감사는 `{templateKey, vars}` 로 저장.

## 절대 깨면 안 되는 불변식

1. **열린 요청은 대상당 하나** — `scopeKey()` → `dedupe_key` UNIQUE. 타임시트는 `TIMESHEET:{accountId}:{periodKey}`.
2. **결정이 진실, 상태는 파생** — `approval_approver` 행이 원천.
3. **도메인은 순수** — `Date.now()` 금지, `now` 주입. 기간 키 계산도 타임존을 인자로 받는다.
4. **CAS UPDATE 의 SET 절에 `rev = rev + 1`.**
5. **승인자 행은 삭제-재삽입 금지** — `WHERE decision_type='PENDING'` 조건부 UPDATE.
6. **감사 이벤트 id 는 결정적.**
7. **가드 통과 ≠ 데이터 범위 확정** — 목록 resolver 는 건별 이슈 열람 권한으로 다시 좁힌다. 팀장은 자기 팀원 타임시트만.
8. **`asUser()` 가 기본, 앱 간 호출은 행위자 기준** — `asApp()` 은 사용자 컨텍스트가 없는 경로(트리거·스윕·**채널 핸들러**)만, 그 결과를 사용자에게 반환하지 않는다.
   **앱 간 채널(webtrigger, 2026-10-19):** 요청은 그것을 일으킨 사람(actor)으로 처리한다. 보내는 앱은 resolver context 의 `principal.accountId` 를 서버가 읽어 서명 봉투 `actor` 에 넣는다(클라이언트 값 금지, `ChannelClient` 는 accountId 인자가 없다). 보내기 전에 자기 가드·asUser 로 1차 확인한다. 받는 앱은 actor 의 실재·활성(`/user?accountId`, 사유 `channel-actor-verify`)을 확인하고, 이슈 범위가 걸린 데이터는 actor 의 Jira 권한을 다시 확인한 뒤 기존 DB 규칙(작성자 본인·팀장 범위·관리자)으로 좁힌다. 채널 핸들러 안의 `asUser()`(세션 토큰)는 **거부된다**(`RequestJira` 가 채널 scope 에서 실패시킨다). 사람 없는 채널 요청은 `actor:SYSTEM` + `ops.js` 허용 reason 만, 범위는 서버가 Jira 데이터로 정한 대상(또는 캐시 무효화)으로 제한한다. 채널 응답은 **상대 앱에게만** 돌려주고, 상대 앱은 자기 권한 판정을 거친 사용자에게만 보이며 설명 원문은 작성자 본인 경로에서만 싣는다.
   **asApp 으로 다른 사용자의 권한을 조회해도 되는 조건**(`user/permission/search`·`user/viewissue/search` 에 accountId 지정) — 전부: ⓐ 조회 대상은 서명 검증된 봉투의 actor 또는 SYSTEM 작업에서 서버가 정한 subject 뿐 ⓑ 사용자 컨텍스트 없는 경로(채널 핸들러·트리거)에서만 ⓒ 결과는 허용/거부 판정에만, 응답·로그 밖으로 내보내지 않음(메모 캐시 키에 actor 포함) ⓓ 응답이 정확히 그 한 사람일 때만 허용, 빈 목록·오류·시간 초과는 거부 ⓔ 사유 키 `channel-actor-permission`(트리거는 `worklog-approval-approver-access`). asApp `permissions/check` 에 accountId 지정은 쓰지 않는다(실측 403). actor 가 이 앱에 동의한 경우의 `asUser(accountId)` offline impersonation 은 최적화로만(401 이면 즉시 asApp 조회로 후퇴, 현재 미구현).
   **예외(2026-10-10 사용자 승인, worklog-control Q127):** 앱이 visibility 로 숨긴(통제 중인) 워크로그는 asApp 으로 읽되, **서버가 판정한 작성자 본인**(또는 TeamScope+이슈 열람을 다시 확인한 팀장 인증 경로)에게만 돌려준다. **전부** 만족해야 한다:
   ① 호출자는 resolver context 의 `principal.accountId` ② 후보를 SQL 소유자 조건(작성자 = 호출자 또는 TeamScope 대상자)으로 **먼저** 줄이고 asApp 응답의 author·worklogId·issueId 를 다시 대조 ③ 반환 행 전부 조회자 asUser 이슈 열람 재확인 ④ **우리 통제로 가려진** 워크로그만(원래부터 제한된 것은 보충하지 않음) ⑤ 설명은 작성자 본인에게만, 팀장에게는 시간·일자·이슈만 ⑥ count·합계·내보내기·캐시에도 같은 범위, 캐시 키에 조회자 포함.
   채널로 같은 데이터를 상대 앱에 줄 때도 ① 의 "호출자"를 actor 로 읽고 ①~⑥ 을 모두 적용한다(`issue.control` 행 경로의 `hidden` = actor 작성분만).
   **워크포스 쪽 범위(2026-10-28 사용자 결정):** 워크포스는 연동 프로젝트 워크로그를 **승인 여부와 무관하게 앱 자격으로 읽고, 보여 줄 범위는 자기 권한 모델**(프로젝트 스코프·팀장·협업)이 정한다. 승인 앱은 채널로 **상태 사실**(`cert.query` 의 id·숫자·상태, `issue.control` AGGREGATE 의 숨긴 id 전원)만 답하고 actor 의 Jira 열람 권한으로 다시 좁히지 않는다(BADGE 의 R2 제거). 위 ①~⑥ 의 작성자·팀장 제한은 **승인 앱 자기 화면**에만 적용한다. 워크로그 프로퍼티에 승인 표식을 쓰는 안은 거부(불변식 9·상태 변경 잦음·숨김 읽기를 못 품).
9. **엔티티 프로퍼티는 신뢰하지 않고, 앱 간 교환에도 쓰지 않는다** — 편집 권한자 누구나 쓸 수 있다. 판정은 우리 DB.
   앱 간 교환은 페어링된 채널(webtrigger)의 **서명 검증된 요청·응답**으로만 한다: 서명(도메인 접두 `moves-link-rpc/1`, 원문 바이트)·사이트(cloudId)·linkId·방향(from/to)·작업 허용 목록(`src/integration/channel/ops.js`, 두 리포 바이트 동일)·iat 창(±120초)·응답의 요청 nonce 결속을 **DB 접근 전에** 확인한다. 받은 값은 캐시(`workforce_inbound`)일 뿐 원장이 아니며 원장 주인 앱에 다시 물을 수 있어야 한다. 서명 없는 오류 응답으로 연결 상태를 바꾸지 않는다. 앱이 자기 기록에 붙이는 표식 프로퍼티(`movesApproval.origin`·`movesApproval.op`)는 DB 를 찾는 키로만 쓴다.
10. **워크플로 validator 는 함수형만** — Jira expression 형은 이슈 프로퍼티 위조로 통과된다.

## 플랫폼 함정

### Confluence 판에서 실측해 그대로 유효한 것

| 함정 | 내용 |
|---|---|
| **route 인코딩** | `route` 는 보간값을 URL 인코딩한다. 쿼리스트링을 통째로 보간하면 필터가 사라진다. template strings 배열을 직접 만들어 `route(strings, ...values)` |
| **affectedRows** | `ON DUPLICATE KEY UPDATE` 는 신규 1, 갱신 **2** |
| **SQL 추가 = major upgrade** | `--approve MAJOR_VERSION_RULE` |
| **TIMESTAMP 에 숫자 바인딩 불가** | TiDB 는 epoch ms 를 TIMESTAMP 로 변환 못 한다. `rdb/query/SqlTime.js` 경계를 지킨다 |
| **컬럼 추가 = ALTER 마이그레이션** | `vNNN_alter_*`, 첫 resolver 호출의 `ensureMigratedOnce` 가 적용 |
| **정책 기본값과 KVS 키 맵은 같은 집합** | 어긋나면 정책 조회 전체가 죽는다. 계약 테스트가 대조 |
| **CRA 멀티 엔트리** | `entrypoints.main` 참조 플러그인 제거. 엔트리 추가는 `craco.config.js` ENTRIES + `public/<key>.html` + manifest `resources[].entry` 세 곳 |
| **lazy 청크 배포 직후 백지** | `importWithReloadOnce` 로 1회 reload |
| **모달 안 `100vh` 되먹임** | iframe 이 부풀어 하단 버튼이 잘린다. 높이는 내용이 정한다 |
| **body 기본 margin 8px → 하단 잘림** | Forge 의 iframe-resizer 는 body 내용 높이만 재서 body margin 이 빠진다 → 이슈 화면(issueContext·issueActivity) 마지막 줄이 8px 잘린다(2026-10-13 실측, 326→342px). `app/base.css`(mount 공통)로 html/body margin 0, 여백은 엔트리 Box padding 으로 |
| **잔존 `forge tunnel`** | iframe 이 localhost 로 떠 빈 화면. 배포 검증 전에 확인 |
| **resolver 예외는 서버 로그에 안 남는다** | `[RESOLVER]` 로그 + 상위 페이지 fetch 가로채기 |
| **`forge logs` 는 늦다** | 트리거 동작은 결과 상태(DB·화면)로 확인 |
| **함수형 validator payload** (2026-10-21 dev 실측) | `issue{id,key}`·`transition{from,to}`·`user{accountId}`·`modifiedFields` 가 온다. **projectId·issueTypeId·transitionId·locale 은 없다**. 6.3초 응답도 받아들였지만 예산은 5초(`VALIDATOR_BUDGET_MS`). 목적 상태를 못 읽으면 `REJECT_TARGET_UNKNOWN` |
| **validator 안 동기 쓰기는 늦다** | 콜드에서 요청 생성이 6초를 넘겨 사용자는 거부 문구를 보고 요청은 뒤에서 생겼다 → 큐(`transition-auto-request-queue`)로 넘기고 즉시 거부 |
| **Forge function key 23자 제한** | lint `Function key exceeds 23 characters` — consumer 키는 `transitionAutoReq` |
| **async events 는 최소 1회 전달** | consumer 는 멱등이어야 한다(메시지 `at` 이후 같은 대상 요청이 있으면 건너뜀). 재시도는 `InvocationError`(@forge/events 2.1.7 은 `{_retry:true, retryOptions}`) |
| **아바타** | 절대 URL `<img>` 는 뜬다, 실패 시 `PersonAvatar` 이니셜 |

### 앱 간 채널(webtrigger) — 실측 (2026-10-19, 스파이크 `C:\CloudJira\spikes\app-channel`, development)

| 함정·사실 | 내용 |
|---|---|
| **앱 백엔드 → 상대 dynamic webtrigger** | 사용자 컨텍스트 없이(caller principal null) 200, 0.12~0.4초(W1·W4). 콜드 약 0.5~1.9초. egress 선언 필요 → **부르는 앱은 Runs on Atlassian 실격**, dynamic 이라 받는 앱도 실격(공식) |
| 받는 쪽 context | `principal: null`, `installContext` 사이트 ARI 만 — 호출자 앱 신원 없음 → 인증은 우리 서명으로만 |
| Ed25519 | Node `crypto` 로 서명·검증 OK, 본문 1바이트 변조 감지(W1·W2). 200KB 본문 OK(W3) |
| URL | 설치마다 다름. `webTrigger.getUrl(key)` = CLI URL(W6), 재배포 후 유지(W5), **major 업그레이드 + `install --upgrade` 후에도 유지**(S7). 재설치는 미측정. development 도메인 `{appId}.hello.atlassian-dev.net`, production 미측정(S1) |
| 회전 | `getUrl(key, true)` 로 새 URL — 옛 URL 은 `deleteUrl` 전까지 200, 삭제 직후 404(S11) → "새 URL 알림 확인 → 옛 URL 삭제" 2단계 |
| 응답 사용자 헤더 | dynamic 응답의 사용자 헤더(`x-moves-link-sig`)가 호출자 fetch·curl 에 그대로 온다(S14). `x-ratelimit-*` 헤더도 붙는다 |
| KVS secret | webtrigger 함수에서 `kvs.setSecret/getSecret` 동작(S12) — 상대 URL 은 secret |
| `timeoutSeconds` | webtrigger 함수에는 지정 불가(lint 오류, consumer·scheduledTrigger 만) → 핸들러 예산을 코드로(6초) |
| **webtrigger 안 `api.asUser(accountId)`** | **그 사용자가 이 앱에 동의한 적이 있을 때만** 동작. 미동의 활성 사용자 401 `MISSING_USER_CONSENT`, 비활성·없는 계정 401 `MISSING_OR_INELIGIBLE_USER`. `/myself` 는 동의 사용자도 실패(S2) |
| 타 사용자 권한 확인 | asApp `permissions/check`(accountId 지정) **403**("Only Jira administrators and Connect apps"). 후퇴안 asApp `user/permission/search?permissions&issueKey&accountId`·`user/viewissue/search` 는 **동의와 무관하게 200**(0.4~0.6초), 권한 있으면 `[그 계정]`, 비활성 `[]`. 권한 없는 활성 계정 → `[]` 는 미측정(S2b) |
| `/user?accountId` asApp | 200(0.6초), `active` 제공(S8) |
| **채널이 재사용한 기존 서비스의 asUser** (2026-10-20 dev 실측) | 받는 쪽 핸들러가 기존 guarded resolver·서비스를 부르면 그 안의 asUser(워크포스 가드의 `/mypermissions`, 이름 `/user/bulk`)가 webtrigger 에서 **던진다** → 가드 거부로 보임(`ACTOR_NO_ACCESS`). 단위 테스트 모의 객체가 숨긴다. 채널로 여는 서비스는 asUser 호출 지도를 먼저 만들고, 채널 표시(`via`)가 중첩 scope 에서 유지되는지 테스트로 고정 — `07_feasibility_verification.md` §3 |
| **KVS `batchGet` 의 없는 키** | `successfulKeys` 에서 빠지고 **`failedKeys` 에 `code:'KEY_NOT_FOUND'`** 로 온다. 실패로 보면 "설정 없음"이 "읽기 실패"가 된다(워크포스 이슈 설정 목록·link.resolve 가 죽었던 원인). `KEY_NOT_FOUND` 만 없음으로, 가짜 저장소도 같게 |
| apiRoute 참고 | 토큰 없으면 401(앱 신원 통과 없음), 3LO 동의 URL 에 `sns={appId}.{envId}` 가 없으면 custom scope 누락 403, handler `principal.accountId` = 토큰 발급자, refresh token 회전 강제(R0~R4) — 승인 앱 외부 API 는 후속 과제. 워크포스 `/v1/organization/users` 실측(2026-10-20): 콜드 8.8~10.8초·이후 약 2초, 회전 후 옛 refresh 한 번 더 통과(공식 재사용 구간 기본 10분·미사용 90일 만료 — 결함 아님), generator URL 에 `offline_access` 없음, `accessible-resources` 빈 목록 — `_workspace/workforce-channel-rest/06_apiroute_verification_report.md` |

### Jira — 공식 문서로 확인 (2026-10-03, 실측 전)

| 항목 | 내용 |
|---|---|
| `jira:timeTrackingProvider` (Preview) | 관리자가 제공자로 선택하면 기본 "Log work" 버튼·작업 로그 탭이 숨겨진다. 대체 UI 는 `jira:issueAction`·`jira:issueActivity` 로 제공. **사이트당 제공자 하나**(Tempo 와 공존 불가). REST·자동화·모바일 경로는 문서에 언급 없음 |
| 시간 추적 권한 | Work on work items / Edit·Delete own·all worklogs. 기간 조건 없음 → 시간 기반 잠금은 권한으로 불가 |
| 워크로그 이벤트 | `avi:jira:{created,updated,deleted}:worklog`. 누락 보정은 `/rest/api/3/worklog/updated`·`/deleted` (since) |

### 미검증 (P0 스파이크 — `docs/DESIGN.md` §10)

timeTrackingProvider 의 비UI 경로 차단 여부 · 함수형 validator 의 team-managed 지원 · 워크로그 삭제 이벤트 페이로드. (타 앱 프로퍼티 읽기·타 사용자 프로퍼티 쓰기는 2026-10-19 채널 전환으로 더 이상 기대지 않음, Forge 런타임 Ed25519 는 실측 통과)
채널 미검증: production webtrigger 도메인(S1)·와일드카드 egress 수용(S15)·webtrigger `context.license`(S3)·권한 없는 활성 계정의 `permission/search` 응답(S2b)·권한 콤마 목록 의미(S2c) — `_workspace/workforce-channel-rest/04_spike_todo.md`.

## 하네스: Jira 승인 앱 기능 개발

**목표:** 설계 → 백엔드 → 프론트 → 경계면 검증 순차 파이프라인으로 기능을 구현한다.

**트리거:** 이 리포의 기능 구현·이식·수정·재실행 요청 시 `approval-harness` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**무인 실행(autopilot):** `scripts/autopilot/run.ps1` 이 회차마다 한 Phase 씩 `claude -p` 를 부른다. 5시간 한도면 초기화까지 대기, 주간 한도면 그 시각까지 `codex exec` 로 이어 간다. 인수인계는 `_workspace/PROGRESS.md` 하나, 사람에게 묻는 것은 `_workspace/QUESTIONS.md`(답은 `답:` 줄로). 중지는 `_workspace/autopilot/STOP` 파일, 기록은 `_workspace/autopilot/status.log`. 무인 회차는 `forge`·`git commit/add/push` 를 하지 않는다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-10-03 | autopilot 실행기 추가(Claude 한도 대기 → 주간 한도 시 Codex 인계) | scripts/autopilot | 끊김 없는 개발 요청 |
| 2026-10-03 | 초기 구성 — 워크포스 하네스(4 에이전트 순차 파이프라인)를 이 리포 규약에 맞춰 이식, 플랫폼 스파이크 목록 단계 추가 | 전체 | 리포 생성 |

## 변경 이력 (제품)

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 리포 생성. Confluence 판 `fa07591` 복사, manifest app id 제거(덮어쓰기 방지), 설계서 `docs/DESIGN.md`, 하네스 구성 | Jira 판 착수 |
| 2026-10-07 | 유료 앱 전환 — manifest `app.licensing.enabled`, 프론트 `LicenseGate`(mount 공통, 설정은 배너·나머지는 안내 화면 대체)·`useLicenseStore`·평가판 만료 배너, `locales/*/license.json`, 라이선스 테스트(BE 2·FE 3). 백엔드 가드는 이미 있었음 | 워크포스와 같은 과금 경계 — 결제 없이 못 쓰게 |
| 2026-10-10 | 유휴 SQL 비용 제거 — 5분·시간당 스윕 삭제, 일일 `approval-sweep` + 큐 fan-out, information_schema 프로브·리스·커서 쓰기 절감, 빈 상태 쿼리 수 테스트 고정. 하네스 점검표·설계 순서·AGENTS 에 "유휴 SQL 예산" 항목 추가 | Forge SQL 컴퓨트 과다(사용자 0명에 월 15만~30만 요청) — 코덱스 독립 검토 `_workspace/sql-idle-cost/codex-review.md` |
| 2026-10-10 | 워크로그 인증 모델(인증된 시간의 원본은 우리 DB, 팀장 인증·상위자/본인 서명, 워크포스엔 사용자×월 서명 문서) + 감사 이력(결재/인증/워크로그 변경/설정 탭) — RFC-220 | 워크로그 수정은 막을 수 없으니 "수정해도 인증된 시간은 안 바뀌게", 누가·언제·무엇을 확인 요구 |
| 2026-10-11 | 워크로그 통제권(worklog-control) — 수정·삭제는 우리 화면에서 앱이 판정 후 실행, 확정분·연동분 visibility 숨김(Phase B~D 기본 OFF·실측 관문 강제, 자동 삭제는 알림 전 서버 차단), 진단 도구, 불변식 8 예외(작성자 본인) | 고객 권한 스킴을 건드리지 않고 앱이 통제 — codex 독립 검토 반영 |
| 2026-10-12 | 설정 화면 재구성(settings-restructure) — 메뉴 11개 평평 → 4묶음 9항목(일반/이슈 승인/워크로그·타임시트/기록), 신규 "이슈 승인" 탭 페이지(정책·결재선·승인 그룹·승인자), 타임시트 탭(정책·인증·기간 마감·팀), 전역 정책 폼에서 이슈 승인 전용 3항목 분리(부분 patch), 하위 탭 URL 은 `section`(옛 `auditTab`·`setting=flows|groups|approvers|worklogHistory` 읽기 호환). 프론트 전용 | 사용자 요청 — 상태 승인과 워크로그 설정이 섞여 복잡 |
| 2026-10-12 | 운영 모드(operating-mode) — 모드 = `workforceLinkEnabled === true`(연동) / 그 외 단독. **서버 기본값 꺼짐으로 변경**, 판정은 `SettingsRepository.isWorkforceLinkEnabled()` 하나로(직접 `getValue`+`=== false` 금지 — 미저장이 켬으로 읽힘), `getApprovalSettings` 응답은 항상 boolean. 단독이면 연동 전용 UI(워크포스 상태·통제 Phase C·타 경로 LINKED·연결분 보관·이력 배지) 접기(값 유지, 무시 중 상태는 경고), 메뉴 배지. 모드 모르면 전부 표시. 자동 감지 없음 | 사용자 결정 — "설치는 둘 다 했어도 연동 안 할 수도 있다", 연동은 명시적 선택 |
| 2026-10-12 | 설정 디자인 정리(settings-design) — 공용 `components/settings/{SettingsSection,SettingsRows,SettingsPageIntro}`, 페이지 `Heading large` 제거(AppShell 제목과 중복), 안내문 페이지당 1개·2문장(나머지 details), 섹션 카드·키/값 그리드·폼 너비 720px, 토큰만. testId·동작·쿼리키 무변경 | 사용자 요청 — "너무 복잡해 보임" |
| 2026-10-12 | 사용할 기능 선택(feature-selection) — 정책 키 `issueApprovalEnabled`·`timesheetApprovalEnabled`(기본 true, GLOBAL_ONLY, 판정은 `SettingsRepository.is*Enabled()` 단일 함수). **끔 = 신규 접수만 중지**(`createForTarget` 경계·전환 요청·필드 변경 요청·타임시트 제출; validator 통과·자동 전환 BLOCKED/`FEATURE_DISABLED`·결재/인증/마감/통제는 그대로, `featureGateScope.contract.test` 로 범위 고정). 비상 스위치 `transitionApprovalEnabled` 는 분리 유지(감사 action `feature/*`·`transitionEnforce/*`). 비관리자는 `getTimesheetContext.features`. 설정 첫 진입 "사용할 기능", 결재선·그룹·승인자는 "결재 구성", 메뉴 배지, 라벨 15 평문화 | 코덱스 독립 검토 `_workspace/feature-selection/codex-review.md` 반영, 사용자 결정 "신규 접수만 중지" |
| 2026-10-12 | 워크로그 정책 화면 정리(worklog-policy-ux) — 타임시트 정책 탭의 중복 계층 패널(scope=site) 제거, 4키(create/edit/deleteWindowDays·approvalMode)는 기존 폼 평문 섹션, 진단은 details, 프로젝트·이슈 패널은 "여기서 다르게 적용할 항목" 행(적용값+출처 칩·여기서 바꾸기·워크포스 고정), 초→분, authority 경고는 본문 유지. `getWorklogPolicyCatalog` 는 프론트 미사용(백엔드 잔존) | 사용자 — "사이트 워크로그 기본 정책 뭔 소리인지 모르겠음" |
| 2026-10-12 | 승인 종류 명확화(approval-kind-naming) — 6종 이름 고정(이슈 결재·상태 변경 승인·필드 변경 승인·타임시트 승인·워크로그 사전 승인·워크로그 인증), `approvalKindModel`(= 서버 TargetKind)·`ApprovalKindBadge` 단일 원천, 업무함 종류 열·필터 칩(URL `kind`, 클라이언트 필터 — 빈 상태가 "더 보기" 안내), 알림 `[종류]` 접두(`templateWithKind.*`, targetKind 없으면 원문), 이슈 화면 섹션명·한 줄 설명, 설정 용어(결재 공통 정책·결재자 명부·결재 그룹). `inbox.type.*` 삭제 | 사용자 — "상태 변경 승인인지 워크로그 승인인지 모르겠음" |
| 2026-10-12 | 작업 로그 표·상세 모달(worklog-table) — 열 작성자/시작/소요/기간(periodKey+잠금·인증·통제 배지)/작업("상세"), 설명·행 내 수정·삭제·인라인 이력 제거. Forge Modal mode `detail`(요약 + 상세/변경 이력 탭, 수정·삭제는 모달 안, 남의 행은 버튼 미렌더·쓰기 판정은 서버). 이슈 범위 정책 패널은 표 아래 details 유지 | 사용자 요청 |
| 2026-10-13 | 연동 이슈 작성 기간·사전 승인(linked-issue-schedule) — 워크포스 팀장이 작업관리 "승인 설정"에서 작업별 작성 기간·사전 승인을 정하고 서명 게시(rms.issue·rms.kb), 승인 앱이 검증·저장·판정(더 엄한 쪽, 저장 실패 시 거부, 제출 때 재조회·DB 대조), 연동 작업 입력은 승인 앱 워크포스식 화면 하나로(approval.ctl ch·rx), ctl 1,000건 한도 결함 수정. 문서 `docs/LINKED-ISSUE-SCHEDULE.md` | 사용자 — 이슈 정책 상속이 너무 복잡, 워크포스 입력 경로가 승인 앱 검사를 우회, "팀장이 작업 목록에서 정하자" |
| 2026-10-13 | 이슈 화면 하단 잘림 수정 — Forge iframe-resizer 가 body 내용 높이만 재서 브라우저 기본 body margin 8px 가 측정에서 빠짐(326→342px 실측). 공용 mount 의 `app/base.css` 로 html/body margin 0, 여백은 엔트리 Box padding | 사용자 — "지라 이슈에 붙인 거 하단이 잘림" |
| 2026-10-13 | 워크포스 연동 모드 UX 통합(linked-mode-ux) — ① 연동 모드 워크로그 **쓰기 창구는 승인 앱 하나**(워크포스 4화면은 넘김 버튼, 수정·삭제도 서버 경유 실행 시점 재판정, 통제 문서 이슈는 스위치 OFF 라도 넘김, `linkedInputChannel` 키 삭제·`channel` 응답 제거) ② 설정 > 팀 탭 "워크포스에서 받은 팀" 읽기 전용(데이터는 W-8a 뒤)·결재선에 결재자 이름 ③ **이슈 화면은 기록·보기·승인 요청·이력 네 가지만** — 정책 패널·결재선 선택 제거, 읽기 전용 한 줄 + 설정 위치 안내, 이슈 예외 목록은 Jira 프로젝트 설정 페이지(`selectIssueWorklogApprovalFlow` 축 `{project:'admin'}`+projectId, 연동 이슈는 결재선·사전 승인 거부·해제만, 기록 규칙 7키는 승인 앱에서 편집), `worklogPolicy.*` 문구 재작성 ④ 워크포스 승인 설정 표 = 작성 기간·사전 승인·결재선(계약 `rms.issue.fl`·`approval.flows` 게시, 기록 규칙 7키는 **사이트 관리자 전용**으로 되돌림 Q149) ⑤ `getPrincipalContext.isAdmin` 으로 '관리' 묶음 관리자만, '내 이력' 탭(`tab=done` 호환), 1차 메뉴 '승인 관리'(`listAllApprovals` 기간 필수·SQL ≤16·독촉 하루 1회)·'기록'(옛 URL 호환). SQL·manifest 추가 없음. 코덱스 검토 `_workspace/linked-mode-ux/codex-review.md`, 실측 목록 `04_spike_todo.md` | 사용자 — "워크로그 진입점이 하나였으면", "이슈별 정책을 패널에서 손보는 건 말이 안 됨", "일반 사용자는 요청·내 이력, 관리자는 이력·승인 관리" |
| 2026-10-14 | 연동 모드 보정(linked-mode-fix) — ① 워크포스 Jira 이슈 패널(issueActivity·issueContext)·`movesRmsLink.worklogOwner` 표식 **제거**(입력 창구 = 승인 앱 이슈 화면 + 워크포스 앱 내부) ② 승인 앱: 연동 신호(rms.policy) 최초 VERIFIED·ctl 변경 직후 `WorklogControlHooks.ctlTargetChanged` → `publishCtlNow` 즉시 게시(요청당 3건 상한 `CTL_IMMEDIATE_PER_INVOCATION`, 초과는 touch 만), 전체 재게시(ALL)에 ctl 워터마크 초기화 ③ 워크포스(W-8a): 본인 `movesRms.org` 에 팀 구조(teamKey·teamName·leaderKeys·leads) — 결재자는 소속 팀장, 본인이 팀장이면 가장 가까운 조상 팀장, 끝까지 없으면 [](본인 결재), 상위 팀장 memberKeys 에 하위 팀장·팀장 없는 하위 팀원 포함(결재선·열람 범위 대칭), KVS `approvalLink:orgEpoch` 로 재게시 ④ 승인 앱 기본 승인자 규칙 "상위 팀장 있으면 그 사람만, 없으면 본인"(`candidates`·`requestAutomatically`), 팀장 본인 후보 포함. SQL·manifest 추가 없음(워크포스 manifest 는 삭제만). 검증 `_workspace/linked-mode-fix/03_verify_report.md` | 사용자 — ARS-14 실측: 패널 중복(ctl 이 일일 스윕에서만 등록돼 하루 지연)·팀장 본인 결재 불가(워크포스가 팀 구조를 게시하지 않아 `isWorkforceTeamLead` 항상 false). 결정 "워크포스 패널 없애도 됨", "팀장은 본인 결재 가능해야" |
| 2026-10-14 | 워크포스 입력 재개(workforce-input-reopen) — "진입점 하나"의 뜻은 "Jira 패널에서만 하지 말자"였음(linked-mode-ux ① 오해 정정). ctl 에 `wr`(승인 앱이 병합을 끝낸 쓰기 규칙 메모: 기록 규칙 7키·위반 처리·사전 승인 기본값·마감 행·자동 마감 일수·이슈 예외·`exp` 3일 단위 내림+7일) 신설, `wa` **삭제**(워크포스 구판의 근사 직접 수락 경로·36h iat 검사 폐쇄), `ch` 는 APP 유지, `publicationVersion` 3판. 판정 파일 `src/integration/workforce/writeGate.js` 를 두 리포 **바이트 동일**(.gitattributes eol=lf)로 두고 승인 앱 대조 테스트(골든 158·무작위 2,000)가 도메인 판정과 동일성 강제. 워크포스는 저장 직전 `wr`+사용자 승인 상태 문서+인증 목록으로 판정: ALLOW 저장(출처 서명 그대로) / DENY 4종 / **DEFER(사전 승인 필요·이슈 예외·BLOCK 상한·범위 밖 날짜·미관찰 기록·문서 불량·대상 403/404)는 저장하지 않고 승인 앱으로 넘김**, 10분 유예(Q5), 기간 일괄 입력 날짜별 선판정(Q2). 규칙·마감·예외 저장 시 ctl 재게시 큐잉. SQL 일일 1 + 연동 프로젝트당 4 | 사용자 — "워크포스 입력 다시 열어, 패널에서만 하지 말자는 말이었음". 설계가 워크포스 서버의 `wa` 기반 우회 경로(F-1)·36h 잠복 결함(F-2)을 발견 |
| 2026-10-14 | 개발 사이트 B 단계(승인·인증분 앱 전용 공개 범위) 켬 — 자동 진단 5개(G-ROLE·G-BLOCK·G-PRESERVE·G-AGG·G-RECOVER) 통과(시험 이슈 WORK-104), 사람 확인 3건은 "개발 사이트, 운영 전 재확인" 메모로 PASS 기록. 승인된 24586 이 Jira 직접 조회 404·앱 Work log 탭 "승인됨·수정 불가" 확인. 함께: 워크로그 결정 응답의 필드 변경 전용 `apply` 키를 `APPLY_KINDS`(FIELD_CHANGE·ISSUE_TRANSITION)로 제한 + 모달 `APPLY_NOTICE_KINDS`(승인 즉시 닫힘), 승인 이력·엑셀에 "작업 시작 일시·소요" 열(`worklogApprovalFacts` 공용, 승인 관리 목록·엑셀 내보내기 신설), 변경 이력 배지 문구(출처 "Jira 직접 입력(REST·자동화·다른 앱)", 범위 "워크포스 연결 대상") | 사용자 — "승인된 건 수정되면 안 돼서 visibility 바꾸기로 했잖아", 모달 안 닫힘·사유 상태 이상, 이력에 몇 시간 쌓았는지 안 보임, API 입력이 워크포스로 표시됨(범위 배지 오독) |
| 2026-10-19 | 워크포스 연동 채널 전환(workforce-channel-rest) — 엔티티 프로퍼티 교환(`rms.*`·`movesApproval.*`·`approval.ctl`·`wr`) 전부 제거, 앱 간은 dynamic webtrigger `approval-link-channel` + Ed25519 봉투(`src/integration/channel/*`, 두 리포 바이트 동일, `SHARED_READY.md`)·행위자(actor) 기준 처리(D6)·연결 코드 페어링(양쪽 발급, Q6). "원장 주인이 답한다, 바뀌면 알린다" — 워크포스 org·연결·작성 기간·kb 는 pull + `change.notify`, 인증·통제·결재선은 워크포스가 승인 앱에 묻는다. `writeGate.js`·벡터·`WorkforcePublisher`·아웃박스·일일 `workforce`/`workforce-cert` 작업 삭제, 워크포스 쓰기는 `write.judge`/`write.commit`(intent source `WF`). R2 = asApp `user/permission/search`(webtrigger 안 impersonation 은 동의 사용자만 — 실측). 미커밋 조직 조회 API(3LO·`api.atlassian.com` egress) 철거. 한 번에 전환(이중 운행 없음, Q1), 상대 장애는 fail-close(Q3), 승인 앱 외부 API 는 후속(Q4). SQL 마이그레이션 없음, manifest major(webtrigger·egress). Runs on Atlassian 포기(D4) | 사용자 — "어프로벌이랑 워크포스간 통신은 프로퍼티로 안 하고 REST 방식으로", 스파이크 실측(webtrigger 0.2초 vs apiRoute 1.8초·3LO 고객 설정 4단계) |
| 2026-10-20 | 옛 연동 데이터 정리 삭제 — 승인 앱 `PropertyCleanup`·일일 `workforce-cleanup`·asApp 사유 `channel-cleanup`, 워크포스 `LegacyPropertyCleanup`·팀장 설정 이관(`IssueSettingMigration`)·설정 화면 정리 버튼 제거(옛 `workforce_publish` 테이블은 미사용으로 남김). 함께: `sys.ping` 응답에 승인 앱 버전, dev 보안 실측 `_workspace/workforce-channel-rest/05_webtrigger_security_report.md` | 사용자 — "고객 배포 안 돼서 옛 연동 데이터 정리 필요 없음" |
| 2026-10-20 | 채널 기능 실측(dev)에서 결함 2건 수정 — ① 워크포스 `org.teams` 가 Admin 세트 보유자도 거부(webtrigger 안 asUser `/mypermissions`·`/user/bulk`, 중첩 scope 가 채널 표시를 덮음) → 채널 경로는 워크포스 권한 세트만·이름 생략·via 상속·캐시 키 분리 ② 팀장 이슈 설정이 없으면 목록·link.resolve 실패(KVS batchGet `KEY_NOT_FOUND`) ③ 승인 앱 오류 코드 분리(`WORKFORCE_ACCESS_DENIED`·`WORKFORCE_LINK_DISABLED`). 종합 검증 `_workspace/workforce-channel-rest/07_feasibility_verification.md`, 외부 API 고객 가이드 `moves-workforce/docs/external-api/README.md` | 사용자 — "웹트리거·apiRoute 기능 가능하다는 검증 문서" 요청, 실측 중 발견 |
| 2026-10-20 | 상태 변경 승인 재활성화(product-polish) — 기능 키 `statusChangeApprovalEnabled`(기본 꺼짐, GLOBAL_ONLY), 이슈 화면 카드·••• 메뉴·설정 규칙 화면 복구, 연동·연결 대기·단독 모드를 화면마다 구분, 설정 디자인·글자 크기 정리. 커밋 002ad3c·fdb0abe | 사용자 — "상태 변경 승인 기능 추가", 연동/단독 구분 요청 |
| 2026-10-21 | 상태 변경 규칙 KVS 이전·막힐 때 자동 요청(status-rule-kvs) — 규칙은 커스텀 엔티티 `transition-rules`(원본 `p:{projectId}` + 목적 상태 색인 `s:{toStatusId}`, 색인 ⊇ 원본), 규칙 없는 전환은 **SQL 0·Jira 0**. `transition_rule` 테이블은 미사용으로 남김(마이그레이션 없음). 자동 요청 = 프로젝트 기본값 + 규칙별 덮어쓰기, validator 는 큐에 넣고 `REJECT_AUTO_REQUEST_QUEUED`, consumer `transitionAutoReq` 가 asApp 만으로 전부 재확인(사람·앱 접근·결재자 열람 정확히 true·USER/CUSTOM 그룹만) 후 생성, 멱등·일시 오류 재시도 2회·15분 만료. 프로젝트 설정 4단계 초기 세팅·사이트 "새 프로젝트 기본값". asApp 사유 `transition-auto-request-{actor,approver,issue}`. manifest minor(재동의 없음). dev E2E WORK-102·103 통과. 커밋 3fe95ae·3df9356·e28d060·7f341bf, 설계 `_workspace/status-rule-kvs/` | 사용자 — "막고 승인 요청하는 형태", "스페이스별 결재선 초기 세팅", "DB 많이 쓰는 거 좀 그래서" |
| 2026-10-21 | 상태 변경 규칙 출발 상태 조건(커밋 4d87e7e) — 규칙 키 = 유형 × 목적 × 출발('*'), 구체성 유형 > 출발, 승인 통과는 **지금 걸린 규칙(ruleId)으로 받은 요청만**(다른 규칙의 승인은 새 요청 대상), 검사 읽기 겹치기(규칙 기록 미리 읽기는 Jira projectId 와 같을 때만). dev E2E: 승인 → 요청자 권한 자동 전환 → `PASS_APPROVED` 약 3초 | 사용자 — "3번 조건 가능해야 함", 칸반 지연 |
| 2026-10-21 | 화면 정리·단독 모드 워크로그 승인(ui-polish·standalone-worklog) — 전역 바닥 글꼴(base.css, Jira 본문 토큰), 모달 제목·사이드바 카드 제목·임의 굵게·하드코딩 px 정리(`typographyRules.contract.test`), 모달 안 Select 는 공용 `selectMenuInModal`(body portal·fixed·auto, 터치 스크롤 MenuList; 날짜·시간 피커 제외). 단독: 자기 승인 = 명부 LEAD(연동과 같은 "팀장이면 허용", 팀원 거부), `getWorklogApprovalIdentity` 단독·연결 대기 = 명부(`ROSTER`), 팀 0개 경고, 저장 화면 승인자 선택(`NEEDS_APPROVER`), 문구 정정. Codex gpt-6-astra xhigh 검수 반영 | 사용자 — "폰트·볼드 구림", "모달 드롭다운 먹힘", "워크로그 승인은 단독 상용일 때도 쓸만하게" |
| 2026-10-22 | 화면 오류 수집(Sentry)·egress 정리·파이프라인 — DSN 은 Forge 환경 변수 `SENTRY_DSN` → PUBLIC `getSentryDsn`(워크포스와 같은 방식), 화면은 기다리지 않고 동적 import. **예외만** 보낸다(console 로그 끔 — 인자·템플릿에 이름·요약이 섞임), 이벤트는 허용 목록으로 재구성(오류 코드 형식 메시지·번들 파일 이름·식별자 함수명·브라우저/OS·trace id, breadcrumb 는 이동·요청만 data 없이). manifest backend egress 를 `*.hello.atlassian-dev.net` → 워크포스 app id 호스트 dev·prod 두 개(이전 값은 production 연동을 막았다), client 에 Sentry 주소 — major. 파이프라인: forge CLI 14, check:bundle(UI npm ci 뒤), `scripts/ci/forge-sentry-dsn.sh`. 워크포스 개발 사이트 환경은 moves-rms | 사용자 — "유료앱이니 워크포스처럼 라이선스·센트리 확인", "워크포스 보고 비트버킷 파이프라인" |
| 2026-10-28 | 채널 `cert.query` BADGE 의 actor Jira 열람 재확인(R2) 제거 — 워크포스가 연동 워크로그를 앱 자격으로 읽고 자기 권한 모델로 보여 주기로 결정(워크포스 RFC-220 검토 F1·F2·F3 수정의 승인 앱 몫). 승인 앱은 상태 사실만 답하고 작성자·팀장 범위 제한은 자기 화면에만. Jira 호출 1 감소 | 사용자 — "워크포스에서는 승인 여부와 관계없이 워크포스 권한으로 볼 수 있어야 한다, 앱 권한으로 보여 주면 된다"(진척도 총계가 승인할수록 줄던 결함) |
| 2026-10-27 | 상용 전 잔여 정리 — ① 잔존 DRAFT 거두기(엔진 R1): 일일 EXPIRY 스윕이 생성 1시간 지난 `commit_state='DRAFT'` 를 `DEAD`(dedupe `dead:{id}`, 업무함 행 삭제)로 돌려 대상의 `ALREADY_OPEN` 영구 점유를 푼다(유휴 SQL +1, 예산 11). DEAD 는 보관 정리 대상 아님 ② 앱 내 알림 라이선스 경계: `ApprovalRepository` 직접 INSERT 두 곳(REQUESTED·선행 EXPIRED)에 `shouldEmitNotifications` 주입 — 트리거·큐 소비자가 비활성 라이선스에서 알림을 만들던 구멍 ③ `transition_rule`·`workforce_publish`·`getWorklogPolicyCatalog` 미사용 표식(DROP 은 major 라 보류) | RELEASE_GATE A8·A9·D4 — 스테이징 전 코드 잔여 소진 |
| 2026-10-28 | 전수 점검(`_workspace/full-audit-2026-10-28/REVIEW.md`) 잔여 결함 — **R05** `expireByTargetChange` 가 `CONTENT_CHANGED` 를 받음(워크로그 어댑터·자동 요청의 낡은 PENDING 이 `bad reason` 으로 남아 ALREADY_OPEN 을 막던 결함) **R10** `TableReadiness.tableState`(READY·MISSING·UNAVAILABLE) — validator 는 테이블 확인 실패를 미준비(통과)와 가르지 않고 `REJECT_UNAVAILABLE` **R12** Jira 그룹 명부는 끝까지 읽었을 때만(뒤 페이지 비 200·빈 중간 페이지·상한 → `INVALID_APPROVER_CONFIGURATION` cause `GROUP_MEMBERS_INCOMPLETE`) **R09** 채널 라이선스 판정을 공통 `getLicenseDecision` 으로(INACTIVE 만 402, 2초 상한) **R06** 다음 단계 개방 알림 `STEP_OPENED`(현재 단계 미결 결재자, `myTurn` 문구, 결정 주체 기준) **R07** 통제 증분 스캔 keyset 커서(`confirmScan`{since,until,cert,sheet}, 페이지 상한 10 → 큐 이어달리기, reevaluate 200개씩) **R08** 결재선 프로젝트 매핑은 넣고 나서 지우기 + 세대(rev) 결속, 단계 교체는 지우기 전에 검토 표식 **R11** 업무함 권한 판정 미완료는 `incomplete:true`(던지면 그 창 시작에 커서 고정) + 화면 경고 배너 **D02** 일괄 승인 20초 전체 마감(가장 오래 걸린 한 건 여유, PIN 포함) → `remaining` **D03** 통제 상태 쓰기 뒤 세대 역행 재쓰기·표식은 시작 때 읽은 것과 같을 때만 삭제 **D01** 상용 의존성 패치(BE 0건, UI dompurify 3.4.17·markdown-it 14.3.3 등; `@forge/bridge`·`@mdxeditor/editor`·`exceljs` major 는 보류). Codex 검토 3회 반영 | 전수 점검 보고서 권장 순서 1·3·4 단계. `npm audit fix --omit=dev` 가 dev 패키지를 지우므로 쓰지 말 것(재설치로 복구) |
| 2026-10-28 | 승인 엔진 결정 저장 정합성(full-audit R01~R04) — ① 결정 수락·확정 결속: 클레임은 부모 요청이 PENDING·LIVE 일 때만(EXISTS), 결정 aggregate CAS 는 스냅숏 결정 수 = 실제 결재자 행 결정 수일 때만(COUNT 서브쿼리), 클레임 뒤 재조회한 결정 전체로 재계산, 늦은 결정은 조건부 UPDATE 로 되돌림(APPROVE 는 종료 상태 반환, REJECT 는 ALREADY_DECIDED) ② 재시도 수렴: 내 결정이 이미 행에 있으면(APPROVE 멱등·REJECT 재시도) 빠진 이벤트·aggregate·투영을 마저 채움 ③ 투영 세대 가드 `req_rev <= ?`·my_decided 먼저·`my_turn` 은 미결정자만, myturn 탭·배지에 `my_decided = 0` ④ CAS 에서 진 회수·만료의 이벤트 DELETE. 결정 1건 SQL +1 SELECT(재조회), 유휴 SQL·마이그레이션·응답 shape 무변경. 멀티 테이블 UPDATE·트랜잭션 없음, TiDB 서브쿼리 조건 UPDATE 는 미실측. Codex 검토 2회 반영(최종 규칙): 늦은 결정 되돌림은 종료와 **확실히 모순**일 때만(APPROVED + 내 REJECT, REJECTED + 내 APPROVE 이면서 내 이벤트 없음), 회수·만료 종료는 아무것도 되돌리지 않음, 회수·만료 패자 이벤트는 최종 상태 ≠ 목표 상태일 때만 거둠(PENDING 이면 EXISTS 가드) + 성공 전이는 CAS 직후 이벤트 재기록(결정 1건 SQL 12), 저장소 `idempotent: true` 면 서비스가 알림·afterDecide·Jira 코멘트 생략(`recovered` 는 이번 호출이 이벤트 새 행을 넣었을 때만), 알림 판정은 `ownEvent`, my_decided 문장이 my_turn=0, 대리 결재 부분 실패 복구 없음(한계) | 전수 감사 `_workspace/full-audit-2026-10-28/REVIEW.md`, 설계 `engine-fix-design.md` |
