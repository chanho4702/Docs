# timesheet-approval 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-03 · autopilot 무인 회차 · 재작업 회차: 1(초판)
> 입력: `01_architect_design.md`(계약), `00_input/requirement.md`, `04_spike_todo.md`. QUESTIONS Q4~Q13 은 답이 없어 설계서의 기본 가정을 그대로 썼다.
> 금지 준수: `forge` 명령 0회, git 인덱스 무변경(`git add/commit/mv/stash/checkout` 0회), 리포 밖 파일 수정 0, static/ui·locales 무변경.

## 결과

`npm test -- --runInBand` → **Test Suites 39 passed / 39, Tests 405 passed / 405** (기준선 26 / 215 → +13 suites, +190 tests).

## 설계와 충돌·차이 (먼저 읽을 것)

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| D1 | "`approval_request` ALTER 없음", 신규 마이그레이션 v016~v019 | v016~v019 + **v020·v021 ALTER 추가**: `approval_event.event_type`·`approval_notification.kind` 를 `VARCHAR(16)` → `VARCHAR(32)` | `CHANGED_AFTER_APPROVAL` 은 22자다. 그대로면 감사 이벤트·알림 INSERT 가 실패한다(계약상 이벤트 타입·알림 kind 값이 이 문자열). 기존 마이그레이션 이름·내용은 바꾸지 않았다. `migrate.test.js` 의 "멱등 DDL" 정규식에 `ALTER TABLE … MODIFY COLUMN … VARCHAR(n)` 만 추가 허용. 실측 T18 |
| D2 | 테스트 케이스 §3.1-6 "W11 이 167시간" | **W10** 이 167시간(2026-03-08 은 W10 = 03-02~03-09 에 든다). W11 은 168시간으로 함께 단언 | 설계서의 달력 계산 오류 |
| D3 | §3.5 "`open:TIMESHEET:` + 128 + `:` + 8 = 151" | 152 | 접두가 15자다. 200 이내라 문제없음 |
| D4 | 스윕 잡 순서 `updated` → `deleted` | **`deleted` 먼저** | `updated` 가 예산을 다 쓰는 날에도 싼(페이지당 1요청) 삭제 감지가 굶지 않게 |
| D5 | `submitTimesheet` 의 `supersedes` 는 payload 값만 | payload 에 없고 최신 요청이 **열려 있지 않으면**(REJECTED·EXPIRED·CANCELLED·감지된 APPROVED) 그 id 를 자동으로 supersedes 로 넘긴다 | §3.4 "재제출은 새 요청 + `prev_request_id` 로 연결"을 프론트가 매번 챙기지 않아도 되게. 열린 요청을 바꾸려면 여전히 명시해야 한다(ALREADY_OPEN) |
| D6 | (없음) | 동시 제출 경합(`ALREADY_OPEN`)에서 진 쪽이 **이긴 요청의 역참조를 그 스냅샷으로 다시 씀** | 부속 행·역참조를 요청보다 먼저 쓰므로, 더블 클릭 시 진 쪽이 역참조를 고아 id 로 덮어쓰고 고아 정리가 그걸 지우면 이긴 요청의 삭제 감지가 영구히 빠진다 |
| D7 | `TimesheetRouting.resolveSteps(...)` → steps | `resolve(subjectId, {violations, policy})` → `{steps, team:{teamKey,teamName}, extraStepGroup}` | getMyTimesheet 의 `routing` 블록을 같은 호출로 채우려고 |
| D8 | `StorageService` 테이블 목록에 신규 4개 | **무변경** | 이미 `information_schema.tables` 전체를 돌려준다 — 새 테이블은 자동으로 나온다 |
| D9 | `diffWorklog` UPDATED 조건: issueId·started·seconds | + **작성자가 바뀐 경우**도 UPDATED | 승인 대상(그 사람의 기간)에서 빠진 것이라 변경으로 봐야 한다 |
| D10 | 응답에 없음 | `getMyTimesheet.violationCount`, `submitTimesheet.violationCount` 추가 | `violations` 는 50건에서 잘린다 — 프론트가 "외 N건"을 그리려면 전체 수가 필요(§8.1 `timesheet.violation.more`) |
| D11 | 엔진 변경 목록 | 추가로 `ApprovalService.decideApproval(req, {expectKind})`(선택), `expandApprovalGroup` 반환에 `displayName`(추가 필드) | decideTimesheets 가 TIMESHEET 아닌 요청을 섞지 못하게 / 2단계·예외 단계 이름 |
| D12 | `runTimesheetSweep` | 마이그레이션을 돌리지 않는다 | 시간마다 마이그레이션 조회가 는다. 마이그레이션은 하루 스윕·onInstall·첫 resolver 호출이 맡는다 |

설계 불변식과 충돌한 지점은 없다.

## 구현 파일

신규
- `src/domain/timesheet/{period,snapshot,limits,status}.js` + `__test__/` 4개
- `src/permission/InvocationScope.js`
- `src/rdb/schema/ddl/timesheet.sql.js`
- `src/resolver/approval/target/TimesheetTargetAdapter.js` + 테스트
- `src/resolver/timesheet/` — `TimesheetController` · `TimesheetService` · `TimesheetRepository` · `TeamRepository` · `TeamService` · `TeamScope` · `TimesheetAccess` · `TimesheetRouting` · `WorklogCollector` · `TimesheetDriftService` · `userDisplay` + `__test__/` 8개
- `src/trigger/onWorklogChanged.js`, `src/trigger/runTimesheetSweep.js`

변경
- `src/domain/approval/{constants,scopeKey,transitions}.js` (+ `transitions.test.js` 추가 케이스)
- `src/permission/{permissionGuard,PermissionMap,JiraPermission,AppAccess}.js` (+ `JiraPermission.test.js` R3 케이스)
- `src/resolver/approval/{ApprovalService,ApprovalRepository,CertificateService}.js`, `target/TargetRegistry.js`
- `src/resolver/{inbox/InboxService,notification/NotificationService,notification/NotificationRepository,retention/RetentionRepository,settings/SettingsRepository,settings/SettingsService}.js`
- `src/rdb/schema/{migrate.js,ddl/index.js,__test__/migrate.test.js}`, `src/utils/errors/ErrorCodes.js`
- `src/index.js`, `manifest.yml`, `test/permission/permissionMap.contract.test.js`

## resolver 3단계 등록

| resolver | ① guardedDefine | ② PermissionMap | ③ CONTROLLER_REGISTRARS |
|---|---|---|---|
| getTimesheetContext · getMyTimesheet · submitTimesheet · getTimesheetDetail | TimesheetController | `'SELF'` | `registerTimesheetController` |
| getTeamTimesheetMatrix · decideTimesheets | TimesheetController | `{ teamLead: true }` | 〃 |
| listTimesheetTeams · getTimesheetTeam · saveTimesheetTeam · deleteTimesheetTeam · importTimesheetTeamMembers | TimesheetController | `{ admin: true }` | 〃 |

계약 테스트(`permissionMap.contract.test.js`)가 세 곳을 대조해 통과한다. "최소 한 축" 단언에 `meta.teamLead` 를 넣고, `teamLead` 가 있으면 `true` 인지 단언을 추가했다.

`{teamLead:true}` 가드(`permissionGuard.guard`): 앱 접근 확인 뒤 `isTeamLead(principal.accountId)` — 원천은 `timesheet_team_member`(role=LEAD) JOIN `timesheet_team.enabled=1`. 미준비·조회 실패는 false → `PERMISSION_TEAM_LEAD_REQUIRED`.

## 응답 규약 — 프론트가 읽는 경로

모든 resolver 는 Controller 가 `{ content: <result> }` 를 돌려주고 ResponseWrapper 가 펼친다:
```js
// 성공
{ success: true, content: <아래 shape> }
// 실패
{ success: false, error: { name, code, message, cause } }
```
**아래 shape 은 전부 `res.content` 다.** 시각은 epoch ms(number), 시간 양은 초(number).

## resolver 별 실제 요청 payload / 응답 shape

### getTimesheetContext — `SELF`
payload: `{}`
```js
{
  unit: 'MONTH' | 'WEEK',
  timeZone: 'Asia/Seoul',
  currentPeriodKey: '2026-10',
  previousPeriodKey: '2026-09',
  myTeam: { teamKey: 't_0123456789ab', displayName: '개발1팀' } | null,   // 내가 MEMBER 인 활성 팀
  isTeamLead: boolean,
  ledTeams: [{ teamKey, displayName, memberCount }],                        // 내가 LEAD 인 활성 팀. memberCount = MEMBER 수(본인 제외)
}
```
에러: 공통만. 팀 테이블 미준비면 `myTeam:null, isTeamLead:false, ledTeams:[]`.

### getMyTimesheet — `SELF` (payload 의 accountId 는 무시, principal 고정)
payload: `{ periodKey?: '2026-10' | '2026-W40' }` (없으면 현재 기간)
```js
{
  periodKey: '2026-10',
  unit: 'MONTH' | 'WEEK',              // 요청한 키의 단위(정책 단위와 다를 수 있다 — 그러면 canSubmitPeriod=false)
  timeZone: 'Asia/Seoul',              // 정책값
  period: { start: 1759244400000, end: 1761922800000 },     // [start, end)
  canSubmitPeriod: boolean,            // 키 단위 === 정책 단위 && now >= start
  live: {
    contentHash: 'ts1:<hex64>',        // ← submitTimesheet.expectedHash 로 그대로 보낸다
    entryCount: 42,
    totalSeconds: 576000,
    entries: [{ worklogId: '10231', issueId: '10002', started: 1759280400000, seconds: 3600 }],  // worklogId 숫자 오름차순
    byDay: { '2026-10-01': 28800 },    // timeZone 기준 날짜
    issues: [{ issueId: '10002', seconds: 7200, issueKey: 'OPS-12' | null, summary: '…' | null, projectKey: 'OPS' | null }],
                                       // 시간 내림차순 → issueId 오름차순. 본인 asUser 수집 결과라 키·제목이 있다
  },
  violations: [Violation],             // ≤ 50
  violationCount: number,              // 전체 수(D10)
  violationAction: 'WARN' | 'EXTRA_STEP' | 'BLOCK',
  latest: null | {
    requestId, status: 'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'|'CANCELLED',
    periodStatus: 'NOT_SUBMITTED'|'SUBMITTED'|'APPROVED'|'REJECTED'|'CHANGED_AFTER_APPROVAL',
    needsResubmit: boolean,
    contentHash: 'ts1:…',
    submittedAt: number,               // 요청 created_at
    decidedAt: number | null,          // PENDING 이면 null, 그 외(APPROVED·REJECTED·EXPIRED·CANCELLED) = 요청 updated_at
    entryCount: number | null, totalSeconds: number | null, violationCount: number | null,
    driftDetectedAt: number | null,
    currentStepOrder: number, stepCount: number,
  },
  changedSinceSubmit: boolean,         // latest 있고 latest.contentHash !== live.contentHash
  routing: { teamKey, teamName, approverKeys: string[] /* 1단계(팀장) */, extraStepGroup: string | null } | null,
  routingError: null | 'TIMESHEET_NO_TEAM' | 'TIMESHEET_NO_APPROVER' | 'INVALID_APPROVER_CONFIGURATION',
  submitBlockedCode: null | 'TIMESHEET_PERIOD_INVALID' | 'ALREADY_OPEN' | 'ALREADY_DECIDED'
                   | 'TIMESHEET_EMPTY' | 'TIMESHEET_LIMIT_BLOCKED' | <routingError>,   // 이 순서로 첫 번째
  periods: [{ periodKey, periodStatus, needsResubmit }],   // 현재 기간부터 과거로 6개(DB 만)
}
```
- `submitBlockedCode === 'ALREADY_OPEN'` 이어도 `changedSinceSubmit` 이면 **`supersedes: latest.requestId`** 로 재제출할 수 있다(프론트 분기).
- 에러: `TIMESHEET_PERIOD_INVALID`(형식), `TIMESHEET_TOO_LARGE`(이슈 200·워크로그 2000 초과), `PERMISSION_DENIED`(myself ≠ principal), `JIRA_API_FAILED`.

`Violation`:
```js
{ code: 'DAILY_MAX',   date: '2026-10-03', seconds, limitSeconds }
{ code: 'WEEKLY_MAX',  week: '2026-W40',   seconds, limitSeconds }
{ code: 'FUTURE_DATE', date, worklogId }
{ code: 'BACKDATED',   date, worklogId, lagDays, limitDays }
// 정렬: code(위 순서) → date/week → worklogId(숫자)
```

### submitTimesheet — `SELF`
payload: `{ periodKey: '2026-10', expectedHash: 'ts1:<hex64>', requestMessage?: string(≤500), supersedes?: requestId }`
```js
{
  requestId: 'uuid',
  status: 'PENDING',
  currentStepOrder: 1,
  periodStatus: 'SUBMITTED',
  contentHash: 'ts1:…',
  entryCount: number,
  totalSeconds: number,
  violations: [Violation],
  violationCount: number,              // D10
  extraStepAdded: boolean,
}
```
에러 code:
| code | 언제 | cause |
|---|---|---|
| `TIMESHEET_PERIOD_INVALID` | periodKey 없음·형식 오류·정책 단위와 다름·미래 기간 | — |
| `INVALID_TARGET` | expectedHash 형식(`/^ts1:[0-9a-f]{64}$/`) 아님, requestMessage 500자 초과 | — |
| `STORAGE_NOT_READY` | 타임시트 테이블 미준비 | — |
| `ALREADY_OPEN` | 최신 요청이 PENDING 인데 `supersedes` 가 그 id 가 아님 / 동시 제출 경합 | — |
| `ALREADY_DECIDED` | 최신 요청이 APPROVED 이고 감지 표시 없음 | — |
| `TIMESHEET_CONTENT_CHANGED` | 서버가 다시 수집한 지문 ≠ expectedHash → **getMyTimesheet 재조회** | — |
| `TIMESHEET_EMPTY` | 0건 + `timesheetAllowEmpty=false` | — |
| `TIMESHEET_LIMIT_BLOCKED` | 위반 + `BLOCK` | `{ violations: Violation[] }` |
| `TIMESHEET_NO_TEAM` / `TIMESHEET_NO_APPROVER` / `INVALID_APPROVER_CONFIGURATION` | 결재선 해석 실패 | — |
| `TIMESHEET_TOO_LARGE` | 상한 초과 | — |

### getTeamTimesheetMatrix — `{teamLead}`
payload: `{ periodKey?: string, teamKey?: string }` (teamKey 없으면 이끄는 활성 팀 전체)
```js
{
  periodKey, unit, timeZone, period: { start, end },
  teams: [{ teamKey, displayName }],          // 내가 이끄는 활성 팀 전부
  teamKey: string | null,                     // 요청한 팀(없으면 null)
  rows: [{
    accountId, displayName /* 조회 실패 시 accountId */, avatarUrl: string | null, teamKey,
    periodStatus, needsResubmit,
    requestId: string | null, requestStatus: string | null,
    submittedAt: number | null, decidedAt: number | null,
    entryCount: number | null, totalSeconds: number | null, violationCount: number | null,
    currentStepOrder: number | null, stepCount: number | null,
    myTurn: boolean,                          // 최신 요청이 PENDING 이고 나(또는 나에게 위임한 사람)의 차례
    driftDetectedAt: number | null,
  }],                                         // displayName 오름차순. 본인 제외. 미제출 행은 숫자 null
  summary: { total, notSubmitted, submitted, approved, rejected, changed },
}
```
에러: `PERMISSION_TEAM_LEAD_REQUIRED`(가드), `TIMESHEET_PERIOD_INVALID`, `INVALID_TARGET`(이끌지 않는 teamKey).

### decideTimesheets — `{teamLead}`
payload: `{ requestIds: string[] (1..50, 중복 제거), pin?: string }`
```js
{
  results: [{ requestId, ok: true, status: 'PENDING'|'APPROVED' } | { requestId, ok: false, code }],
  approved: number,
  failed: number,
  remaining: string[],        // 18초 예산 초과로 처리하지 않은 id — 프론트가 이어 부른다(최소 1건은 처리)
}
```
- 묶음 에러: `INVALID_TARGET`(0건·50 초과), `PIN_REQUIRED`·`PIN_INVALID`·`PIN_LOCKED`·`PIN_NOT_SET`.
- 건별 `results[].code`: `REQUEST_NOT_PENDING`, `APPROVER_NOT_ELIGIBLE`, `APPROVER_STEP_NOT_REACHED`, `PERMISSION_TARGET_VIEW_DENIED`, `REQUEST_NOT_FOUND`, `CONCURRENT_MODIFICATION`, `INVALID_TARGET`(TIMESHEET 아닌 요청), `STORAGE_NOT_READY`, `UNKNOWN_ERROR`.
- 반려는 기존 `decideApproval` `{requestId, decision:'REJECT', reason, pin}` 그대로.

### getTimesheetDetail — `SELF` (+ TimesheetAccess.canView)
payload: `{ requestId }`
```js
{
  requestId, subjectAccountId, subjectDisplayName: string | null,
  periodKey, unit: 'MONTH'|'WEEK', timeZone,   // 제출 시점 값(정책이 바뀌어도 고정)
  period: { start, end },
  contentHash, entryCount, totalSeconds,
  entries: [{ worklogId, issueId, started, seconds }],   // 저장 스냅샷. 손상 시 []
  byDay: { 'YYYY-MM-DD': seconds },
  issues: [{ issueId, seconds, visible: boolean, issueKey: string|null, summary: string|null, projectKey: string|null }],
                                               // visible=false 면 키·제목 null(보는 사람 asUser permissions/check). 시간 내림차순
  violations: [Violation], violationCount: number, violationAction: string | null,
  drift: null | { detectedAt, kind: 'CREATED'|'UPDATED'|'DELETED', worklogId: string | null },
}
```
에러: `INVALID_TARGET`(requestId 없음·TIMESHEET 아님), `REQUEST_NOT_FOUND`(요청·부속 행 없음), `PERMISSION_TARGET_VIEW_DENIED`.

### listTimesheetTeams — `{admin}`
payload: `{ q?: string(≤120), cursor?: teamKey }`
```js
{ items: [TeamSummary], nextCursor: string | null, hasMore: boolean }   // 20개씩, team_key 순
// TeamSummary
{ teamKey, displayName, enabled, leadKeys: string[], memberCount, secondStepGroup: string|null,
  sourceGroupName: string|null, syncedAt: number|null, rev: number }
```
에러: `INVALID_TARGET`(q 길이·cursor 형식), `STORAGE_NOT_READY`.

### getTimesheetTeam — `{admin}`
payload: `{ teamKey }` → `{ team: TeamSummary & { memberKeys: string[] } }`. 에러: `INVALID_TARGET`(형식 `t_` + 12 hex 아님·없음).

### saveTimesheetTeam — `{admin}`
payload: `{ teamKey?, displayName(1..120), enabled: boolean, leadKeys: string[](1..10), memberKeys: string[](0..500), secondStepGroup: string|null, sourceGroupName?: string|null, rev?: number(수정 시 필수) }`
→ `{ team: TeamSummary & { memberKeys } }`
- `sourceGroupName` 을 보내면 `syncedAt` 이 지금으로(값이 null 이면 둘 다 null). 안 보내면(수정 시) 기존 값 유지.
- 에러: `INVALID_TARGET`, `TIMESHEET_TEAM_MEMBER_CONFLICT`(cause `{ accountIds: string[], teamKeys: string[] }`), `CONCURRENT_MODIFICATION`(rev 불일치), `INVALID_APPROVER_CONFIGURATION`(없는·비활성 2단계 그룹), `STORAGE_NOT_READY`.

### deleteTimesheetTeam — `{admin}`
payload: `{ teamKey, rev }` → `{ teamKey, deleted: true, openCount: number }`. 에러: `INVALID_TARGET`, `CONCURRENT_MODIFICATION`.

### importTimesheetTeamMembers — `{admin}`
payload: `{ groupName }` → `{ members: [{ accountId, displayName, avatarUrl, accountStatus }], truncated: boolean }` (500명에서 자름, 저장 안 함, 조회 실패는 `members: []`). 에러: `INVALID_TARGET`(빈 이름).

## 변경 resolver — 실제 변화

| resolver | 변화(`content` 기준) |
|---|---|
| getApprovalDetail | TIMESHEET 요청이면 `target = { kind:'TIMESHEET', key:'<accountId>:<periodKey>', subjectAccountId, title, periodKey, issueId:null, issueKey:null, projectId:null, projectKey:null, projectName:null, revision:null }`. title 은 Jira 현재 표시 이름 우선, 실패 시 제출 시점 이름. `approval.isStale=false`, `approval.canResubmit=false`. `canRequest` = 대상자 본인 && 최신 요청 && 열려 있지 않음 |
| getApprovalHistory | 무변경. `items[].events[].eventType` 에 `'CHANGED_AFTER_APPROVAL'`(reason = `'CREATED'|'UPDATED'|'DELETED'`, actorKey null) 가 나올 수 있다. 대기 중 변경 만료는 `eventType:'EXPIRED', reason:'CONTENT_CHANGED'` |
| getApprovalDetail.approval.events | 위와 같다 |
| getApprovalCertificate | TIMESHEET: `target` 은 위 TargetView(저장 스냅샷), `contentHash: { algorithm:'SHA-256', value:'ts1:<hex64>', version:0 }`, **신규 키** `timesheet: { periodKey, periodStart, periodEnd, timeZone, entryCount, totalSeconds, violationCount, changedAfterApproval: boolean, driftDetectedAt: number|null } \| null`. ISSUE 응답에는 `timesheet` 키 자체가 없다 |
| listInbox | 모든 항목에 `periodKey: string|null`, `subjectAccountId: string|null`(TIMESHEET 만 값, `target_key` 역파싱). TIMESHEET 행 `title` = 대상자 표시 이름(user/bulk 실패 시 null — ISSUE 와 같은 규칙), `issueKey`·`projectKey`·`project_id` null |
| listNotifications | 모든 항목에 `periodKey`, `subjectAccountId`(TIMESHEET 만 값, 요청 행 컬럼 우선). 새 `kind: 'CHANGED_AFTER_APPROVAL'` → `templateKey: 'notification.template.timesheetChanged'`, `vars: {}`. `kind:'EXPIRED'` + 이벤트 reason `CONTENT_CHANGED` → `templateKey: 'notification.template.timesheetChangedWhilePending'`. `vars.period` 는 서버가 넣지 않는다 — 프론트가 `periodKey` 로 채운다 |
| getApprovalSettings / saveApprovalSettings | 정책 키 9개(아래). 저장 검증 실패·EXTRA_STEP 인데 예외 그룹 없음·없는/비활성 예외 그룹 → `INVALID_TARGET` |
| getProjectPolicy / saveProjectPolicy | `overridableKeys` 에서 타임시트 9개 제외(`GLOBAL_ONLY_KEYS`). 프로젝트 저장에 넣으면 `INVALID_TARGET` |
| exportExpiredApprovals | `requests[]` 에 `subjectAccount: string|null`, `periodKey: string|null` |
| getStorageUsage | 무변경(D8 — 신규 테이블이 자동으로 나온다) |
| decideApproval / bulkApprove / cancelApproval | 응답 무변경. TIMESHEET 열람 확인이 TimesheetAccess 로 간다 |

### 정책 키 (기본값 = Q4~Q6 기본 가정)

| 키 | 기본값 | 검증 |
|---|---|---|
| `approvalUnit` | `'MONTH'` | `'MONTH'|'WEEK'` |
| `timesheetTimezone` | `'Asia/Seoul'` | Intl 로 생성 가능한 IANA |
| `timesheetAllowEmpty` | `true` | boolean |
| `timesheetDailyMaxMinutes` | `720` | 정수 0..1440 (0=끔) |
| `timesheetWeeklyMaxMinutes` | `3120` | 정수 0..10080 |
| `timesheetFutureDateCheck` | `true` | boolean |
| `timesheetBackdateMaxDays` | `0` | 정수 0..365 |
| `timesheetViolationAction` | `'WARN'` | `'WARN'|'EXTRA_STEP'|'BLOCK'` |
| `timesheetExceptionGroup` | `''` | 문자열 ≤255(trim), 값이 있으면 존재·활성 approval_group |

KVS 키는 `approval:settings:<키>`. 기본값↔KVS 맵 대조는 `SettingsPolicyKeys.test.js` 와 `TimesheetIntegration.test.js` 가 함께 확인.

## 신규 에러 코드 (`ErrorCodes`) — `locales/{kr,en}/error.json` 미반영(프론트 몫)

`PERMISSION_TEAM_LEAD_REQUIRED`, `TIMESHEET_PERIOD_INVALID`, `TIMESHEET_EMPTY`, `TIMESHEET_LIMIT_BLOCKED`, `TIMESHEET_CONTENT_CHANGED`, `TIMESHEET_NO_TEAM`, `TIMESHEET_NO_APPROVER`, `TIMESHEET_TOO_LARGE`, `TIMESHEET_TEAM_MEMBER_CONFLICT` — 9개(설계 §2.8 과 같다). 문구는 설계 §8.2.

## 서버가 쓰는 신규 templateKey / 코드 값 (locales 미반영 — 프론트 몫)

| 값 | 쓰는 곳 |
|---|---|
| `notification.template.timesheetChanged` | 알림 `kind:'CHANGED_AFTER_APPROVAL'` |
| `notification.template.timesheetChangedWhilePending` | 알림 `kind:'EXPIRED'` + reason `CONTENT_CHANGED` |
| 이벤트 타입 `CHANGED_AFTER_APPROVAL` | 상세·이력 타임라인 라벨(`state` 네임스페이스) |
| 만료 사유 `CONTENT_CHANGED` | 상세·이력 타임라인의 EXPIRED reason |
| drift kind `CREATED`·`UPDATED`·`DELETED` | `getTimesheetDetail.drift.kind`, CHANGED_AFTER_APPROVAL 이벤트 reason |
| 설정 감사 area `timesheetTeam`(action `create`·`update`·`delete`) | `listSettingsAudit` |

## 스키마·마이그레이션

| 이름 | 내용 |
|---|---|
| `v016_create_timesheet_team_table` | 팀(rev CAS) |
| `v017_create_timesheet_team_member_table` | 구성원(PK team_key+account_id+role, `UNIQUE(member_slot)` — MEMBER 는 한 팀에만) |
| `v018_create_timesheet_submission_table` | 요청 1:1 부속 행, 스냅샷 `ts1z` 압축 JSON, 감지 클레임 컬럼 |
| `v019_create_timesheet_worklog_ref_table` | 워크로그 → 요청 역참조(PK worklog_id, 최신 제출이 덮어씀) |
| `v020_alter_approval_event_type_width` | `approval_event.event_type` VARCHAR(32) (D1) |
| `v021_alter_approval_notification_kind_width` | `approval_notification.kind` VARCHAR(32) (D1) |

새 테이블 참조 전 프로브: `TimesheetRepository.ready()`(submission·ref·approval_request), `TeamRepository.ready()`(team·member). 미준비 시 제출 `STORAGE_NOT_READY`, 컨텍스트 `isTeamLead:false`, 매트릭스 rows 의 요청 정보 null, 감지·스윕 건너뜀. 보관 정리 `CHILD_TABLES` 에 submission·ref 추가.

## 트리거·스윕·manifest

- 트리거 `worklog-changed` → `index.onWorklogChanged` (`avi:jira:{created,updated,deleted}:worklog`). 페이로드에서 `worklog.id`(또는 `worklogId`)·`eventType` 만 쓴다. created/updated 는 asApp `POST /rest/api/3/worklog/list` 1회(사유 `timesheet-drift-trigger`), deleted 는 0회. 타임시트 부속 행이 하나도 없으면 asApp 0회. 페이로드 **키 이름만** 로그(`[TIMESHEET][trigger] payload keys`, T1·T20 확인용).
- 스윕 `timesheet-sweep`(interval: hour) → `index.runTimesheetSweep`. 잡 `ts-worklog-deleted` → `ts-worklog-updated` 순(D4). 리스 10분, 휴지 50분, 예산 20초·요청 30. 완주(`lastPage`)만 `watermark = until`, 끊기면 `cursor_value = until` 만. 첫 실행 now−24h, 타임시트 0건이면 watermark=now 만. 고아 부속 행(1시간 경과)·고아 역참조 각 500건 정리.
- 감지: PENDING → `closeBySystem(expireByContentChange)` → `markDrift` → 만료 알림(요청자+미결 결재자). APPROVED → 결정적 이벤트(`deterministicEventId({requestId, eventType:'CHANGED_AFTER_APPROVAL', actorKey:null, discriminator:'drift'})`) → `markDrift`(조건부, `rev = rev + 1`) → 처음 세웠을 때만 알림(요청자+APPROVE 한 결재자). 스냅샷 손상은 판정 불가로 건너뜀. 모든 예외는 삼키고 요약만.
- scope 추가 없음(`read:jira-work` 주석에 사용 API 를 적었다, T11 미검증).
- scheduledTrigger 2개(한도 5).

## asApp 사용 (AGENTS.md 허용 1번만)

`WorklogCollector.fetchWorklogsByIdAsApp`(`timesheet-drift-trigger`·`timesheet-drift-sweep`), `listChangedSince`(`timesheet-drift-sweep`). 호출부는 `TimesheetDriftService` 뿐이고 결과는 `applyChanges` 대조에만 쓴다(본문·코멘트는 `currentOf` 에서 버린다). resolver 응답 경로(`TimesheetService`)는 asUser 만 쓴다.

## R3 — invocation 캐시

`src/permission/InvocationScope.js` (`AsyncLocalStorage`). `guardedDefine` 의 `withSchema` 가 handler(가드 포함)를 `runInInvocation` 안에서 돌린다. `JiraPermission.getIssueAccess` → `memo('issueAccess:<id>')`, `TeamScope` → `memo('teamLead:<accountId>')`. 테스트: 같은 invocation 의 view+edit 판정 mypermissions 1회 · 스코프 밖은 캐시 없음 · 두 invocation 간 공유 없음 · 팀장 판정 SQL 1회.

## 불변식 점검

| # | 지점 |
|---|---|
| 1 | `scopeKey = TIMESHEET:{accountId}:{periodKey}` → `dedupe_key = open:TIMESHEET:…`. 경합은 `ALREADY_OPEN`(D6 역참조 복구) |
| 2 | 기간 상태는 `periodStatusOf(latest)` 파생, 캐시 테이블 없음 |
| 3 | `src/domain/**` 에 `Date.now()`/`new Date()` 0건(grep). period·limits 는 timeZone·now 인자. 서비스는 `clock()` 1회 |
| 4 | `timesheet_team` 수정·`timesheet_submission.markDrift`·`approval_job_state` 갱신 모두 `rev = rev + 1` |
| 5 | 결정은 엔진 경로(`WHERE decision_type='PENDING'`). 팀 구성원 행은 결재자 행이 아니라 diff |
| 6 | 감사 이벤트(CHANGED_AFTER_APPROVAL·EXPIRED CONTENT_CHANGED)·알림 id 결정적 |
| 7 | 범위 판정은 `TeamScope`(매트릭스 행·가드)·`TimesheetAccess`(상세·이력·증명서·결정) 두 곳뿐. 다른 팀 팀원·이끌지 않는 teamKey 거부 테스트 있음 |
| 8 | asApp 은 트리거·스윕 워크로그 조회만 |
| 9 | 엔티티 프로퍼티 미사용 |
| 10 | 해당 없음 |

## 미검증 (`04_spike_todo.md` T1~T17 + 이번 추가 T18~T22)

- T18 Forge SQL 에서 `ALTER TABLE … MODIFY COLUMN … VARCHAR(32)` 적용 — **v020 이 실패하면 뒤 마이그레이션이 막힌다**. 배포 회차 첫 확인 대상
- T19 `DELETE … WHERE NOT EXISTS (…) LIMIT 500`
- T20 트리거 페이로드 `eventType` 필드
- T21 job_key 별 리스 분리
- T22 restrictAccess 사이트의 팀 구성원 접근
- 기존 T1~T17(이벤트 페이로드, worklog/updated·deleted·list 형태, JQL 타임존, startedAfter/Before 단위, started 문자열, Intl ICU, zlib, AsyncLocalStorage, scope, 실행 시간, 제한 가시성 워크로그, MEDIUMTEXT·VALUES(), 사이드바 URL, 상세 visible) 그대로

## 발견 (범위 밖 — 고치지 않음)

1. `AppAccess.loadApproverRegistry()` 는 "승인자 명부"라는 이름인데 관리자·(이번부터) 팀 구성원까지 포함한 허용 집합을 돌려준다. 현재 호출부는 없다(`loadApproverList` 를 쓴다). 쓰기 전에 이름·의미를 정리할 것.
2. 업무함 항목의 `title` 은 대상 meta 조회 실패 시 `null` 이다(ISSUE·TIMESHEET 공통). 투영 행에는 `title_norm`(소문자)만 있어 원문 제목 폴백이 없다 — 프론트가 null 을 처리하는지 확인 필요.
3. `RetentionRepository.ready()` 가 이제 타임시트 테이블까지 요구한다. 마이그레이션이 한 번이라도 돌면 문제없지만, v016~v019 가 실패한 설치에서는 보관 정리(purge)가 `STORAGE_NOT_READY` 로 막힌다.

## 검증 수정 (F1·F2)

> 재작업 회차 2 · 2026-10-03 · 입력 `03_verify_report.md`(FAIL, 필수 2건) · autopilot 무인 회차 · `forge`·git 인덱스 조작 0회

### 변경 파일

| 파일 | 내용 |
|---|---|
| `src/resolver/timesheet/TimesheetDriftService.js` | F1 — 스윕이 `applyChanges().failed` 를 보고 멈춤·연속 실패 상한 |
| `src/resolver/timesheet/WorklogCollector.js` | F2 — 작성자 선필터, 내 워크로그 기준 상한, 이슈당 호출 예산 |
| `src/resolver/timesheet/__test__/TimesheetDriftService.test.js` | F1 테스트 5건(기존 sweep 단언에 `error` 칸 추가) |
| `src/resolver/timesheet/__test__/WorklogCollector.test.js` | F2 테스트 3건 |
| `src/resolver/timesheet/__test__/TeamScopeAccess.test.js` | R4 쓰기 대칭 결합 테스트 1건 |

### F1 동작 (`sweepJob`)

- 페이지 적용 결과 `applied.failed > 0` 이면 `since` 를 **그 페이지 시작값에 둔 채** 멈추고 `PARTIAL` 로 release(watermark 미전진). 같은 회차의 앞선 성공 페이지 진행분은 유지된다.
- 재처리 멱등: 이미 적용된 건은 결정적 이벤트 id(`deterministicEventId(...,'drift')`)·조건부 클레임(`drift_detected_at IS NULL`)·`closeBySystem` 의 PENDING 조건이라 중복 이벤트·알림이 없다(테스트로 같은 eventId, 알림 1회 확인).
- 연속 실패 상한 `MAX_PAGE_FAIL_STREAK = 24`(export). 같은 cursor 에서 24번째 실패면 그 페이지를 건너뛰고(`since = page.until`) `last_error = "SKIPPED_AFTER_24_FAILURES since=<ms> failed=<n>"` + `console.error`. 이유(코드 주석): 일시 장애(SQL 오류, 아직 안 돈 v020 — 첫 resolver 호출이 적용)는 하루(시간당 24회)면 대부분 지나가고, 영구 실패 1건이 그 뒤 모든 변경의 스윕을 영원히 막지 않게 한다. 막히는 동안에도 핫패스 트리거는 계속 돈다.
- 연속 실패 수 저장: **스키마 변경 없음.** `cursor_value`(VARCHAR 500)에 `"<since>|f<n>"` 로 싣는다(실패 없으면 기존처럼 `"<since>"`). 옛 숫자 값도 그대로 읽힌다. 같은 cursor 에서의 실패만 누적, 성공하면 지워진다. 잡 전체 예외(`FAILED`) 경로는 기존 cursor·실패 수를 보존.
- `sweepJob` 반환에 선택 키 추가: `stalled: {since, failed, streak}`(멈춤) / `skipped: {since, failed, streak}`(건너뜀). `sweep()` 요약 로그에 그대로 실린다. resolver 응답 아님(프론트 영향 없음).
- 트리거(`handleEvent`)·`applyChanges` 는 무변경 — 여전히 throw 하지 않는다.

### F2 동작 (`issueWorklogs` / `collectMine`)

- 페이지마다 `worklog.author.accountId === accountId` 로 **먼저 걸러 내 것만** 쌓는다. 남의 워크로그는 저장도 집계도 안 한다.
- 상한 `MAX_WORKLOGS = 2000` 은 이슈를 가로지르는 **내 워크로그 누계**(`tally`, 동시 6개 수집 중 조기 중단)로 센다 → 설계 §4.7 "내 워크로그 2000건"과 일치.
- 별도 호출량 안전판 `MAX_WORKLOG_PAGES_PER_ISSUE = 40`(export): 이슈당 worklog 페이지 호출 40회 초과 시 `TIMESHEET_TOO_LARGE`. 남의 기록 건수를 세지 않고 호출 수만 묶는다. 5000건/쪽 기준 20만 건(쪽 크기가 1000 으로 잘려도 4만 건)이라 설계 규모(200명×22일 ≈ 4,400건/월, 1쪽)의 수십 배 — 현실 규모에서 남의 기록 때문에 막히지 않는다. 초과 시 잘라 내지 않고 거부하는 이유: 중간에서 끊으면 내 워크로그가 빠진 스냅샷으로 제출돼 합계·지문이 틀린다.
- 응답 shape 무변경(`{accountId, displayName, worklogs, issues, createdAtById}`, `worklogs` 는 이전에도 내 것만).

### 설계 대비 차이

| 항목 | 설계 | 구현 | 사유 |
|---|---|---|---|
| 이슈당 조회 상한 | 없음(§4.7 은 이슈 200·내 워크로그 2000만) | `MAX_WORKLOG_PAGES_PER_ISSUE = 40` 호출 예산 → 초과 시 `TIMESHEET_TOO_LARGE` | 호출량 폭주 방지. 건수가 아니라 호출 수 기준이라 남의 기록이 현실 규모에서 제출을 막지 않음 |
| 스윕 실패 처리 | §4.6 은 실패 정책 명시 없음, AGENTS "미완주 시 watermark 미전진" | 실패 페이지에서 정지 + 같은 cursor 24회 연속 실패 시 건너뜀·`last_error` 기록 | 영구 실패 1건이 스윕을 영원히 막지 않게 |
| 실패 수 저장 위치 | — | `cursor_value` 에 `|f<n>` 접미 | ALTER 마이그레이션 회피(cursor 와 한 몸인 값) |

### 테스트

`npm test -- --runInBand` → **Test Suites 39 passed / 39, Tests 414 passed / 414** (이전 405 → +9)
- F1(+5): 실패 페이지에서 PARTIAL·cursor=그 페이지 시작값·watermark null / 다음 회차 같은 cursor 재시작 후 성공 시 실패 수 해제 / 같은 cursor 연속 실패 누적(`|f5`→`|f6`) / 24번째 실패 시 건너뛰고 OK + `last_error` / 실제 `applyChanges` 건별 예외(`appendEvent` 실패)도 watermark 를 막고 재처리 시 같은 eventId·알림 1회
- F2(+3): 다른 작성자 4,500건 + 내 3건 공용 이슈 → 3건 정상 수집 / 내 워크로그 2,001건 → `TIMESHEET_TOO_LARGE` / 이슈당 호출 예산 초과 → 정확히 2+40회 호출 후 `TIMESHEET_TOO_LARGE`
- R4(+1): 실제 `TeamScope → TimesheetAccess → TimesheetTargetAdapter → ApprovalService` 경로로 leadA 가 t_b 팀원 요청 id 를 섞어 보내면 그 건만 `PERMISSION_TARGET_VIEW_DENIED`, `approve` 기록은 자기 팀 건 1회뿐

### 미검증

- `cursor_value` 접미 형식은 Forge SQL 실측 불필요(문자열 칸)지만, F1 의 실제 효과는 T18(v020·v021 적용) 실측과 함께 확인한다 — 미적용 상태에서 승인 후 수정 → 스윕 `approval_job_state.last_status='PARTIAL'`, `cursor_value` 에 `|f1` 이 붙는지 DB 로 확인.
- 이슈 worklog API 의 실제 쪽 크기 상한(5000 요청 시 몇 건이 오는가)은 미검증 — 호출 예산 40 의 여유는 쪽 크기 1000 가정에서도 4만 건.

### 발견 (범위 밖, 미수정)

- `sweepJob` 에서 `page.until === since` 이고 `lastPage=false` 인 응답이 오면 같은 since 로 예산이 다할 때까지 반복 조회한다(기존 동작, T3 응답 형태 확인 후 판단).
