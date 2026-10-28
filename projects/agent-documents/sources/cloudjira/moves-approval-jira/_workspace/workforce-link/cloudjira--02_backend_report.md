# workforce-link 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-03 · autopilot 무인 회차(1회차)
> 입력: `01_architect_design.md`(§2·§3·§4·§5·§6·§4.10), `00_input/requirement.md`, QUESTIONS Q31~Q41 **기본 가정 그대로**.
> forge·git 명령 실행 없음. 리포 밖 파일 수정 없음(워크포스 리포 읽기도 이번 회차엔 불필요했다).

## 결과 요약

- `npm test -- --runInBand` → **55 suites / 709 tests 전부 통과** (기준선 46 / 529 유지 + 신규 9 suites / 180 tests).
- 설계와 충돌하는 불변식 없음. 설계 계약과 다른 점은 §7 에 모두 적었다(전부 "추가 필드·해석 확정" 수준, 기존 키 의미 변경 없음).
- 연동 꺼짐·모듈 미주입 경로에서 Jira 추가 호출 0 을 테스트로 단언(`TimesheetWorkforce.test.js` "연동 꺼짐·모듈 없음").
- 키링(`keyring.js`)은 **빈 맵**으로 두었다(설계 §11.1). 사람이 키를 만들어 넣기 전에는 모든 수신 검증이 `UNKNOWN_KID` → 단독 경로, 게시 화면은 `inKeyring:false`.

## 1. 파일

| 구분 | 경로 |
|---|---|
| 계약(순수) | `src/integration/workforce/{canonical,base64url,ed25519,contract,keyring,signature,approvalDoc,inbound}.js`, `vectors.json` |
| 도메인 | `src/domain/timesheet/limits.js` — `CODE_ORDER` 확장, `mergeViolations` |
| 스키마 | `src/rdb/schema/ddl/workforceLink.sql.js`, `ddl/index.js`, `migrate.js`(v024~v028), `TableReadiness.js`(`isColumnReady`) |
| 연동 resolver | `src/resolver/workforce/{WorkforceLinkRepository,WorkforceOutbox,WorkforceSigner,WorkforceCloudId,WorkforcePropertyGateway,WorkforceInbound,WorkforceOrgSource,WorkforcePublisher,WorkforceLinkService,WorkforceLinkController}.js` |
| 변경 | `permission/{InvocationScope,permissionGuard,PermissionMap}.js`, `resolver/timesheet/{TeamScope,TimesheetRouting,TimesheetService,WorklogCollector,TimesheetRepository,PeriodCloseRepository,TimesheetDriftService,PeriodCloseService}.js`, `resolver/settings/{SettingsRepository,SettingsService}.js`, `utils/errors/ErrorCodes.js`, `index.js`, `trigger/runSweep.js` |
| 트리거 | `src/trigger/runWorkforcePublish.js`(신규) |
| 기타 | `manifest.yml`, `AGENTS.md`(asApp 2번 문구), `scripts/workforce-link/gen-key.mjs`(실행하지 않음) |
| 테스트 | `src/integration/workforce/__test__/{canonical,signature,approvalDoc,inbound}.test.js` + `testKeys.js`(헬퍼), `src/resolver/workforce/__test__/{WorkforceInbound,WorkforcePublisher,WorkforceLinkService,WorkforceCloudId}.test.js`, `src/resolver/timesheet/__test__/TimesheetWorkforce.test.js`, `src/rdb/schema/__test__/migrate.test.js`(+1) |

## 2. resolver 와 **실제 응답 shape** (전부 `res.content`)

### 2.1 등록(3단계) — 계약 테스트 통과

| resolver | ① guardedDefine | ② PermissionMap | ③ CONTROLLER_REGISTRARS |
|---|---|---|---|
| `getWorkforceLinkStatus` | `WorkforceLinkController.js` | `{ admin: true }` | `registerWorkforceLinkController` |
| `republishWorkforceLink` | 〃 | `{ admin: true }` | 〃 |

### 2.2 `getWorkforceLinkStatus({})`

```js
{
  enabled: boolean,                 // policy.workforceLinkEnabled !== false
  storageReady: boolean,            // workforce_publish·inbound·link_log 세 테이블 isTableReady
  crypto: { available: boolean, selfTest: 'OK' | 'FAIL' },
  signing: { configured: boolean, kid: string | null, publicKeyFingerprint: string | null, inKeyring: boolean },
  trustedPeerKids: string[],        // 정렬됨
  cloudIdKnown: boolean,
  publish: {
    pending: number, failed: number, stalled: number, published: number,   // account_id='*' 표식 행 제외
    lastPublishedAt: number | null,
    lastError: { code: string, at: number } | null,                          // last_error_code 가 있는 가장 최근 행(updated_at)
    state: 'OK' | 'DISABLED' | 'KEY_NOT_CONFIGURED' | 'CRYPTO_UNAVAILABLE' | 'CLOUD_ID_UNKNOWN' | 'WRITE_DENIED' | 'STORAGE_NOT_READY',
  },
  inbound: {
    org:   { verified: number, invalid: number, lastVerifiedAt: number | null },
    pm:    { verified: number, invalid: number, lastVerifiedAt: number | null },
    check: { lastSeenAt: number | null },
  },
  recentFailures: [{ direction: 'IN' | 'OUT', typ: string, entityId: string, code: string, firstAt: number, lastAt: number, count: number }],  // ≤20, lastAt 내림차순
}
```

- `state` 판정 순서: DISABLED → STORAGE_NOT_READY → CRYPTO_UNAVAILABLE → KEY_NOT_CONFIGURED → CLOUD_ID_UNKNOWN → (잡 `wf-publish` 의 `last_error === 'WRITE_DENIED'`) → OK.
- 미준비면 카운트 0·`recentFailures: []`·`state:'STORAGE_NOT_READY'`(정책 꺼짐이면 DISABLED 가 먼저). 에러로 던지지 않는다.
- `inbound.*.invalid` = `last_result NOT IN ('OK','ABSENT')` 행 수 — `STALE_REV`·검증 실패 코드가 들어간다. sticky 상태에서 404 가 된 행은 `last_result='ABSENT'` 라 세지 않는다(로그 `DISAPPEARED` 로는 남는다).
- `check.lastSeenAt` = 연동 로그 `(IN, rms.check, '*', 'SEEN')` 행의 `last_at`(검증 통과 점검을 한 건 이상 본 마지막 시각). `recentFailures` 에서는 `SEEN` 을 뺀다.
- `recentFailures[].entityId` 형식: org = accountId, pm = projectId, check = `'<issueId>/<worklogId>'`, 게시 = `'<accountId>/movesApproval.YYYY'`, 우주 초과 = `'*/movesApproval.YYYY'`.
- 이 resolver 는 `request.context.cloudId` 를 학습한다(KVS `approval:link:cloudId`).

### 2.3 `republishWorkforceLink({ scope: 'FAILED' | 'ALL' })`

```js
{ scope: 'FAILED' | 'ALL', resetCount: number, markerCount: number }   // FAILED: resetCount=영향 행, markerCount=0 / ALL: resetCount=0, markerCount=2
```
에러: `INVALID_TARGET`(scope) → `WORKFORCE_LINK_DISABLED` → `WORKFORCE_SIGNING_UNAVAILABLE`(키 미설정·형식 오류·자가 시험 실패) → `STORAGE_NOT_READY` 순. 감사 `{ area:'workforceLink', action:'republish', detail:{ scope } }`. Jira 호출 없음.

### 2.4 변경 resolver (추가 필드만 — 기존 키·의미 무변경)

| resolver | 추가된 필드(실제) |
|---|---|
| `getTimesheetContext` | `myTeam: { teamKey, displayName, source: 'ROSTER'\|'WORKFORCE' } \| null`, `ledTeams[]: { teamKey, displayName, memberCount, source }`. 워크포스 팀 `teamKey='wf:<워크포스 teamKey>'`, `displayName = teamName ?? ''` |
| `getMyTimesheet` | `routing: { teamKey, teamName, approverKeys, extraStepGroup, source: 'ROSTER'\|'WORKFORCE', extraStepSource: null\|'GROUP'\|'WORKFORCE_PM'\|'GROUP_AND_PM' } \| null`, `workforce: { org: 'VERIFIED'\|'NONE'\|'DISABLED', checks: 'VERIFIED'\|'PARTIAL'\|'NONE'\|'UNAVAILABLE'\|'DISABLED' }`, `violations[]` 에 워크포스 위반(§2.5) 섞임, `violationCount` = 자체 total + 워크포스 수 |
| `submitTimesheet` | `routingSource: 'ROSTER'\|'WORKFORCE'`, `extraStepSource: (위와 같음)` |
| `getTeamTimesheetMatrix` | `teams[]: { teamKey, displayName, source }`, `rows[].teamSource`. payload `teamKey` 가 80자 초과면 `INVALID_TARGET` |
| `getTimesheetDetail` | `routingSource: 'ROSTER'\|'WORKFORCE'\|null`, `extraStepSource: …\|null` (v024 이전·컬럼 미적용 = null, 제출 당시 값) |
| `getApprovalSettings` / `saveApprovalSettings` | 정책 키 `workforceLinkEnabled: boolean`(기본 `true`, GLOBAL_ONLY). 비 boolean → `INVALID_TARGET` |

`workforce.org` 의미: `'VERIFIED'` 는 **검증된 org 가 결재자(본인 제외)를 1명 이상 정했을 때만**(= `routing.source==='WORKFORCE'` 와 같은 조건). 검증됐지만 결재자가 없거나 tombstone 이면 `'NONE'`.

`workforce.checks` 의미: 정책 꺼짐 `DISABLED` / 수집이 `properties` 배열을 하나도 못 받음(W4)·검증 불가(cloudId·암호) `UNAVAILABLE` / 대상 워크로그 전부 검증 통과 `VERIFIED` / 일부 `PARTIAL` / 0건 또는 워크로그 없음 `NONE`.

### 2.5 워크포스 위반 객체 (실제)

```js
{ code: 'OVER_PLAN' | 'OUT_OF_PERIOD' | 'NOT_MEMBER' | 'CHECK_MISSING', source: 'WORKFORCE', worklogId, issueId, date }   // date = 정책 타임존 'YYYY-MM-DD'
{ code: 'WORKFORCE_OTHER', source: 'WORKFORCE', worklogId, issueId, date, rawCode: string | null }                     // rawCode 가 ^[A-Z_]{1,32}$ 아니면 null(위반은 남긴다)
```
정렬: `DAILY_MAX, WEEKLY_MAX, FUTURE_DATE, BACKDATED, OVER_PLAN, OUT_OF_PERIOD, NOT_MEMBER, WORKFORCE_OTHER, CHECK_MISSING` → date → worklogId(숫자). 상한 50. 한 워크로그에 같은 코드 중복은 1건.

## 3. 에러 코드 (신규 2)

`WORKFORCE_LINK_DISABLED`, `WORKFORCE_SIGNING_UNAVAILABLE` — 둘 다 `LogicalError`, `republishWorkforceLink` 에서만 던진다.
⚠ `locales/{kr,en}/error.json` 에 아직 없다(frontend 담당 — 설계 §8.3 키 그대로 추가 필요).

## 4. 스키마·마이그레이션 (v023 다음부터, 기존 이름 무변경)

| 이름 | 내용 |
|---|---|
| `v024_alter_timesheet_submission_routing_source` | `ALTER TABLE timesheet_submission ADD COLUMN IF NOT EXISTS routing_source VARCHAR(16) NULL` |
| `v025_alter_timesheet_submission_link_json` | `ALTER TABLE timesheet_submission ADD COLUMN IF NOT EXISTS link_json TEXT NULL` |
| `v026_create_workforce_publish_table` | 설계 §5 그대로 (PK `(account_id, doc_key)`) |
| `v027_create_workforce_inbound_table` | 설계 §5 그대로 (PK `(typ, entity_id)`) |
| `v028_create_workforce_link_log_table` | 설계 §5 그대로 (PK `log_id`) |

- `migrate.test.js` 의 기존 멱등 정규식이 한 줄 ALTER `…ADD COLUMN IF NOT EXISTS` 를 이미 허용 — 정규식 변경 없음. 신규 단언 1개(문장당 컬럼 하나·PK).
- 신규 컬럼은 `TableReadiness.isColumnReady(table, column)`(information_schema.columns, `true` 만 캐시)로 확인. 미적용이면 `insertSubmission` 은 옛 INSERT(판정 기록만 빠짐), `findSubmissionLink` 는 null.
- `link_json` 실제 형식(≤4,000자, 넘으면 NULL 저장):
  ```js
  { v: 1, org: { kid, rev, iat } | null, pm: [{ projectId, kid, rev }],
    checks: { state, verified?, stale?, invalid?, absent?, missing? },   // 점검을 안 봤으면 { state } 만
    extraStepSource }
  ```
- CAS: `workforce_publish` 성공 처리 `… rev = rev + 1 … WHERE account_id=? AND doc_key=? AND published_rev < ?`, `workforce_inbound` `… rev = rev + 1 WHERE typ=? AND entity_id=? AND rev=?`. 그 밖의 UPDATE(touch upsert·실패 기록·재무장·verified_at)도 전부 `rev = rev + 1` 을 올린다.
- 잡 상태 키(`approval_job_state`): `wf-publish`(리스 4분, 휴지 0), `wf-change-scan`(커서만 — `cursor_value` = `{"o":{"at","id"},"c":{"at","id"}}`), `wf-verify`(리스 10분, 휴지 20시간).

## 5. manifest 변경

```yaml
scheduledTrigger:
  - key: workforce-publish        # 신규 — fiveMinute
    function: runWorkforcePublish
    interval: fiveMinute
function:
  - key: runWorkforcePublish      # 신규
    handler: index.runWorkforcePublish
```
scheduledTrigger 3개(한도 5). scope 추가 없음(W11 주석). 모듈 추가라 배포 시 `forge install --upgrade` 필요, SQL 테이블 추가라 `--approve MAJOR_VERSION_RULE` 가능성 — 리더 확인.
환경 변수(사람이 설정, 이번 회차 미실행): `MOVES_LINK_SIGNING_KEY`(암호화, seed base64url 43자), `MOVES_LINK_SIGNING_KID`, `MOVES_LINK_TRUSTED_KIDS`(선택).

## 6. 동작 요약 (구현 기준)

- **서명**: `node:crypto` Ed25519 만 사용(의존성 추가 없음). 순수 JS 대체(@noble/ed25519)는 `ed25519.js` 의 `{sign, verify, publicKeyOf}` 인터페이스로 끼울 수 있게만 해 두었다 — W1 이 실패할 때 도입. 자가 시험은 RFC 8032 §7.1 TEST 1(공개키 유도·서명 바이트·검증·변조 거부)을 Node 22 로 실측해 고정.
- **교차 시험 벡터** `vectors.json`: 시험 전용 키 2개(sha256 라벨 seed), 정규화 4건, 서명 7건(typ 6종 + tombstone), ts1 2건(경계 — `ps` 정각 포함·`pe` 정각 제외·`+0900`/`Z` 같은 순간). 워크포스가 같은 파일로 대조한다.
- **원천 합치기**: `TeamScope.leadScope` = 명부 팀 + 워크포스 팀(`wf:`), 구성원 = 명부 − overridden + 워크포스 팀원. 워크포스 조회 실패 → 명부만, overridden 실패 → throw(가드 false). 정책은 KVS 키 하나만 invocation 당 1회 읽는다. `TimesheetAccess` 코드 무변경(TeamScope 위임으로 물려받음). `createTeamScope({repository})` 처럼 org 를 안 주면 명부만(기존 테스트·도구 경로).
- **호출 주체 전달**: `guardedDefine` 가드 통과 직후 `bindInvocation({accountId, cloudId})`. `WorkforceOrgSource` 가 `currentAccountId()` 로 본인 여부(selfRead)를 판정 — 남의 org 는 Jira 를 부르지 않고 캐시만.
- **아웃박스 touch**: 제출 성공, 팀장 일괄 결정(성공분만, `findSubjectsByRequestIds` 1회), 감지(만료·승인 후 변경 성공 시, close drift 기록 시), 수동 마감·재개방·자동 마감 기록(연도 표식), 정책 저장(`approvalUnit`·`timesheetTimezone`·`timesheetLockSubmitted`·`timesheetAutoCloseDays` 가 patch 에 있으면, 또는 `workforceLinkEnabled` false→true — 현재·이전 연도 표식). 아웃박스는 예외를 삼키고(`console.warn('[WF][touch] failed', code)`) Jira 를 부르지 않는다. 엔진 경로(단건 결정·반려·회수·만료)는 touch 없음 → 5분 변경 스캔이 잡는다.
- **5분 스윕** `runWorkforcePublish(event, context)`: 리스 → ① 표식 펼침(100개씩, 예산 끊기면 표식 미완료 — 다음 tick 처음부터) → ② 변경 스캔(열린·닫힌 요청 각각 키셋 200행, touch 성공 페이지까지만 커서 전진, 첫 실행 now−7일 + 현재·이전 연도 표식) → ③ 배출(정책·키·cloudId·자가 시험이 막히면 건너뜀, kid 불일치 재무장 200행, due 50행, 예산 20초·Jira 60). 403 5연속 → tick 중단·`WRITE_DENIED`. 실패 백오프 = `5분 × 2^(attempts−1)`(attempts = 이번 실패 포함), 상한 6시간, 8회부터 24시간. 30,000자 초과 → `PUBLISH_TOO_LARGE`.
- **일일 대조**(`runSweep` 끝): 리스 `wf-verify` → 게시 행 100개 asApp GET → `sha256(canonicalize(GET 값)) ≠ published_digest` 면 touch + `TAMPERED`, 404 면 touch + `MISSING_REMOTE`, 항상 `verified_at=now` → 연동 로그 180일 지난 것 1,000건 삭제. 게시가 막힌 상태면 대조는 건너뛰고 정리만.
- **수신**: org(본인 GET, 캐시 5분)·pm(위반 프로젝트만 ≤10, 캐시 1시간)·check(수집 `expand=properties` 동봉분만 검증, 캐시 없음). 전부 asUser. sticky·STALE_REV·tombstone·로그 결정적 id 는 설계 §4.6 그대로.
- **asApp**: `WorkforcePropertyGateway.createAppPropertyGateway` 를 import 하는 파일은 `WorkforcePublisher.js` 하나(테스트로 단언). 사유 `workforce-publish`(PUT)·`workforce-publish-verify`(GET). AGENTS.md 허용 2번 문구를 설계 §4.10 대로 바꿨다.

## 7. 설계와의 차이 (계약 소비자가 알아야 할 것)

1. `submitTimesheet.extraStepAdded` — 이전엔 `Boolean(extraStepGroup)`, 이제 `Boolean(extraStepSource)`. PM 단계만 붙어도 true. 예외 그룹 경로는 값이 같다.
2. `getMyTimesheet.workforce.org` — `'VERIFIED'` 를 "검증된 org 존재"가 아니라 "검증된 org 가 결재자를 정함"으로 확정(라우팅 원천과 같은 조건). 설계 §2.2 는 의미를 적지 않았다.
3. `WORKFORCE_OTHER.rawCode` — 형식 불량이면 **위반은 남기고 `rawCode: null`**. 설계 "아니면 버림"을 rawCode 를 버리는 것으로 해석했다(프론트는 rawCode null 문구 처리 필요).
4. CHECK_MISSING(Q35) — cap 'check' 선언 사용자는 **부재뿐 아니라 검증 실패·내용 불일치(stale)도** CHECK_MISSING 으로 센다. 부재만 세면 사용자가 점검 프로퍼티를 망가뜨려 예외 단계를 피할 수 있다(Q35 근거와 같은 이유). 열린 질문 O1.
5. 배출 — 한 번도 게시하지 않았고 실을 항목이 0인 문서는 PUT 하지 않고 대기만 내린다(설계에 없음). 미설치·무이력 사용자에게 빈 프로퍼티를 수천 개 쓰지 않기 위해서다. 이미 게시한 적 있으면 빈 문서도 PUT 한다.
6. 백오프 식 — 설계 "5분 × 2^attempts" 를 `attempts = 이번 실패 포함`, 지수 `attempts−1` 로 구현(첫 실패 5분). 이 식으로는 7회째가 5.3시간이라 6시간 상한에 닿기 전에 8회 24시간 구간으로 넘어간다. 열린 질문 O3.
7. `link_json.checks` 에 `state` 를 함께 저장(설계는 카운트만).
8. 명부 팀 객체(`TeamScope.ledTeams`)에는 `source` 를 넣지 않고 서비스 응답에서 `teamKey` 접두(`wf:`)로 붙인다(`inbound.teamSourceOf`). 명부 teamKey 는 `t_…` 라 충돌 없음.
9. cloudId 학습 지점 — 설계 "첫 resolver 호출" 대신 ① 관리 화면 두 resolver ② 연동이 켜진 상태의 수신 경로(`WorkforceInbound` — 사실상 모든 사용자의 업무함 진입) ③ 스케줄 트리거 컨텍스트(`cloudId`·`installContext`) 세 곳. 인스턴스당 KVS 확인 1회. 모든 resolver 에 거는 방식은 연동과 무관한 호출에 KVS 왕복을 더해 택하지 않았다.
10. `getMyTimesheet` 의 정책 꺼짐 판정은 정책 전체 객체가 아니라 `WorkforceOrgSource.enabled()`(KVS 키 1개, invocation memo)로 한다 — 가드(`{teamLead}`) 경로에서도 같은 값을 쓰기 위해서다.

## 8. 미검증 (`04_spike_todo.md`)

설계 W1~W16 그대로 + 구현 중 생긴 **W17~W21**(information_schema.columns 프로브, 스케줄 트리거 핸들러 인자 형태, 사용자 프로퍼티 GET/PUT 응답 형태, TiDB `ORDER BY … IS NULL DESC`·`LIKE` 인덱스, 키 없는 상태의 초기 운영). 결과 칸은 배포 회차에서 채운다.

## 9. 열린 질문 (제품 결정 아님 — 기본값으로 구현함)

| # | 질문 | 선택지 | 구현(권장) |
|---|---|---|---|
| O1 | cap 'check' 사용자의 **깨진·옛 점검**도 CHECK_MISSING 인가 | (a) 부재만 (b) 부재+깨짐+stale | **(b)** — 사용자가 프로퍼티를 망가뜨려 예외 단계를 피하는 경로를 막는다 |
| O2 | 키링이 비어 있는 동안 dev 연동 시험 방법 | (a) 배포 회차에 `gen-key.mjs ap-dev-1`·`wf-dev-1` 생성 → 키링에 `env:'dev'` 로 추가 + `MOVES_LINK_TRUSTED_KIDS=wf-dev-1` (b) 키링 없이 시험 불가로 둠 | **(a)** — dev 키는 `env:'dev'` 라 운영 사이트는 목록 없이 신뢰하지 않는다(Q39) |
| O3 | 게시 백오프 식 | (a) 현재(첫 실패 5분, 6시간 상한 실효 없음) (b) `5분 × 2^attempts`(첫 실패 10분, 6회째부터 6시간) | **(a)** 유지. 운영 데이터 보고 조정 |
| O4 | `extraStepAdded` 를 PM 단계까지 포함으로 넓힌 것 | 유지 / 그룹만 | 유지(§7-1) — 프론트가 `extraStepSource` 로 문구를 고른다 |

## 발견 (범위 밖, 고치지 않음)

- `locales/{kr,en}/error.json` 에 `WORKFORCE_LINK_DISABLED`·`WORKFORCE_SIGNING_UNAVAILABLE` 없음 — frontend 몫(설계 §8.3).
- `SettingsService.saveApprovalSettings` 의 연동 touch 는 patch 에 키가 **있기만 해도**(값이 같아도) 연도 전량 재게시를 건다. 비용은 SQL 표식 2행 + 다음 tick 펼침이라 막지 않았다.
- `TimesheetDriftService.planCloseDrift` 가 `isChangeAfterClose` 를 `unit:'MONTH', timeZone:'UTC', autoCloseDays:0` 고정으로 부른다(기존 코드, 행 기반 판정이라 의도로 보임) — 이번 변경과 무관.

## 테스트

```
npm test -- --runInBand
Test Suites: 55 passed, 55 total
Tests:       709 passed, 709 total
```

| 신규 스위트 | 수 | 다루는 것 |
|---|---|---|
| `integration/workforce/__test__/canonical.test.js` | 24 | 정규화 규칙·거부 13종·깊이/길이 한도·base64url 엄격 디코더 |
| `…/signature.test.js` | 46 | vectors.json 골든(정규화·키 유도·메시지 hex·서명 재생성·ts1 경계 + 바이트 재구현), 왕복(typ 4종), 변조 5종 → BAD_SIGNATURE, 타 사이트·타 사용자·타 기간·타 워크로그·타 프로젝트 → BAD_SIGNATURE, 타 typ → UNKNOWN_KID, 계열 불일치 → VERSION_UNSUPPORTED, 모르는/신뢰 밖/notAfter/같은 kid 다른 키, FUTURE_IAT 경계, 형식 오류, 스키마 위반, 자가 시험, 지문, docKey, rms.org 상한 |
| `…/approvalDoc.test.js` | 17 | `entryBodyOf` 전 분기(PENDING·APPROVED·감지·REJECTED·EXPIRED·CANCELLED·무이력·마감·자동 마감·lockSubmitted=false·경계 대체), 서명 검증 왕복, 지문 안정성(now 무관·항목·kid 변화), 최악 65항목 ≤ 30,000자, 후퇴안 본문, **순수성 grep**(integration·domain 에 `Date.now(`·`new Date()`·`@forge/`·`requestJira`·`executeQuery` 0건) |
| `…/inbound.test.js` | 8 | `orgViewOf`(본인 제외·접두·tombstone), `checkViolationsOf`(매핑·rawCode·stale·invalid·absent·cap), `mergeViolations`(순서·50 상한·total) |
| `resolver/workforce/__test__/WorkforceInbound.test.js` | 21 | sticky(404·위조)·로그, 타 사이트·타 계정 복사 거부, tombstone 해제, STALE_REV(낮은 rev·같은 rev 다른 본문), 5xx 판정 불가(캐시·로그·checked_at 그대로), cloudId 없음, 결정적 로그 id·hit 증가, 남의 계정 Jira 0회, 캐시 5분, overridden, checks(캐시 없음·SEEN), pm(상한 10·캐시), **Outbox throw 금지**·미준비 no-op·docKey 매핑, Signer(ready·inKeyring·seed 비노출·형식 오류·자가 시험 실패) |
| `…/WorkforcePublisher.test.js` | 24 | 백오프·커서 파싱, 배출(PUT·`dirtyRev`), 지문·kid 같음 → PUT 0, kid 변경 → 재게시, 무항목 미게시, 403×5 → WRITE_DENIED·백오프, 5xx 로그, 정책 꺼짐·키 없음·cloudId 없음 → PUT 0·대기열 유지, 30,000자 초과, 리스 실패, **펼침 예산 중단 시 표식 미완료**, 펼침 완료·UNIVERSE_TRUNCATED, 첫 실행 커서·표식, **touch 실패 페이지에서 커서 미전진**, 키셋 동률, 일일 대조 TAMPERED/MISSING_REMOTE/정리, SQL 계약(`rev = rev + 1`·`published_rev < ?`·dirty_rev 3회·upsert·inbound CAS·빈 입력 미조회), **asApp import 그래프** |
| `…/WorkforceLinkService.test.js` | 23 | 상태 shape 전체·미준비·state 4종, 재게시 FAILED/ALL·감사·에러 4종, **TeamScope 원천 합치기**(워크포스 팀장 가드 통과·overridden 제외·실패 시 명부/fail-close·정책 꺼짐 0호출·selfRead 판정), **Routing**(워크포스 1단계·본인뿐 폴백·PM 단계·PM 없음 그룹·GROUP_AND_PM·둘 다 없음·팀장=PM dedup·WARN) |
| `…/WorkforceCloudId.test.js` | 2 | context·installContext 파싱, 1회 기록·실패 삼킴 |
| `resolver/timesheet/__test__/TimesheetWorkforce.test.js` | 14 | **연동 꺼짐·모듈 없음 = expand 없음·점검 검증 0**, 위반 병합·결재선 입력, W4 UNAVAILABLE 시 CHECK_MISSING 없음, cap CHECK_MISSING, 제출 판정 근거 저장·touch, 일괄 결정 touch, 상세·매트릭스 원천, 컨텍스트 워크포스 팀, 감지·마감·정책 touch 지점, insertSubmission 컬럼 유무, collectMine `expand=properties` 보간·movesRms.check 만 |
| `rdb/schema/__test__/migrate.test.js` | +1 | v024~v028 순서·ALTER 문장당 컬럼 하나·PK |

기존 테스트 수정(계약 추가 필드 반영만): `TimesheetService.test.js` 3곳(`source`·`routingSource`·`extraStepSource`), `WorklogCollector.test.js` 1곳(`projectId: null`).

## 재작업 회차

| 회차 | 날짜 | 내용 |
|---|---|---|
| 1 | 2026-10-03 | 초판 |
