# period-lock 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-03 · autopilot 무인 회차 · 재작업 회차 0(초판)
> 입력: `01_architect_design.md`(§2~§6, §11.1), `04_spike_todo.md`, `QUESTIONS.md` Q16~Q26(미회신 → 설계서 기본 가정 그대로)
> 엔진(`src/domain/approval/**`, `ApprovalService`) **무변경**. forge·git 명령 실행 없음.

## 결과 요약

- `npm test -- --runInBand`: **46 suites / 529 tests 통과** (기준선 39 / 414 → +7 suites, +115 tests)
- resolver 신규 8 / 변경 4(추가 필드만). 3단계 등록 + 계약 테스트 통과.
- 마이그레이션 `v022_create_approval_period_close_table`, `v023_create_timesheet_close_drift_table` (뒤에만 append).
- manifest: `jira:timeTrackingProvider`·`jira:issueAction`·`jira:issueActivity`, resource entry `worklog`, scope `write:jira-work`.
- 검증 권고 R7(timesheet-approval)도 처리 — 페이지를 하나도 못 본 회차는 `failStreak` 보존.

## 1. 파일

| 구분 | 파일 |
|---|---|
| 도메인(신규) | `src/domain/timesheet/lock.js`, `src/domain/timesheet/worklogInput.js` (+ `__test__/lock.test.js`, `__test__/worklogInput.test.js`) |
| 스키마(신규) | `src/rdb/schema/ddl/periodLock.sql.js` / 변경 `ddl/index.js`, `migrate.js`, `__test__/migrate.test.js` |
| 워크로그(신규) | `src/resolver/worklog/{WorklogController,WorklogService,WorklogGateway}.js` (+ `__test__/WorklogGateway.test.js`, `WorklogService.test.js`) |
| 타임시트(신규) | `src/resolver/timesheet/{PeriodLockService,PeriodCloseService,PeriodCloseRepository,CloseDriftRepository}.js` (+ `__test__/PeriodCloseService.test.js`, `PeriodLockRepositories.test.js`, `PeriodLockWiring.test.js`) |
| 타임시트(변경) | `TimesheetController.js`(마감 3종), `TimesheetService.js`(표시 필드), `TimesheetRepository.js`(`findLatestCovering`·`findSubmissionsByWorklogIds`), `TimesheetDriftService.js`(마감 후 변경 경로·게이트·R7), `WorklogCollector.js`(`created`·`updated`·`updatedTimes`) |
| 권한(변경) | `permission/JiraPermission.js`(`getIssueAccess` 워크로그 키 동봉), `permission/permissionGuard.js`(`appAccess:false`), `permission/PermissionMap.js`(8개), `test/permission/permissionMap.contract.test.js` |
| 설정(변경) | `settings/SettingsRepository.js`(정책 키 2), `settings/SettingsService.js`(검증), `settings/SettingsAuditRepository.js`(선택 `auditId` + `INSERT IGNORE`) |
| 기타 | `src/index.js`(`registerWorklogController`), `src/trigger/runTimesheetSweep.js`(자동 마감 → 감지), `src/utils/errors/ErrorCodes.js`(9개), `manifest.yml` |

## 2. resolver 와 **실제 응답 shape** (전부 `res.content`)

공통: 성공 `{ success:true, content }`, 실패 `{ success:false, error:{ name, code, message, cause } }`. 시각 epoch ms, 시간 양 초.

### 2.1 권한 축 (PermissionMap)

| resolver | 축 |
|---|---|
| `getIssueWorklogs`·`getWorklogEditorContext`·`createWorklog`·`updateWorklog`·`deleteWorklog` | `{ issue:'view', issueIdKey:'issueId', appAccess:false }` |
| `listPeriodCloses`·`closePeriod`·`reopenPeriod` | `{ admin:true }` |

`appAccess:false` = 앱 접근 명부(`restrictAccess`)만 면제(Q22). 라이선스 가드·이슈 열람 가드는 그대로. 계약 테스트: `appAccess` 가 있으면 `false` 이고 `issue` 축 동반.

### 2.2 `getIssueWorklogs({ issueId, offset? })`

```js
{
  issueId: '10002',
  timeZone: 'Asia/Seoul',
  unit: 'MONTH',                      // | 'WEEK'
  worklogs: [WorklogView],            // started 내림차순 → worklogId 내림차순(숫자 비교), offset 부터 50건
  total: 120,                         // 이번에 받은 수(≤1000) — 이 사용자가 볼 수 있는 것만(asUser)
  truncated: true,                    // Jira 응답 total > 받은 수(=1000 초과)
  nextOffset: 50,                     // 없으면 null
  permissions: { canLog: true, canEditOwn: true, canDeleteOwn: true },   // mypermissions — 표시용
  lockRanges: [LockRange],
}
```

`WorklogView` (테스트 `WorklogService.test.js` 의 `toEqual` 그대로):

```js
{
  worklogId: '6',
  issueId: '10002',
  authorAccountId: 'me',              // | null
  authorDisplayName: 'ME',            // | null
  authorAvatarUrl: null,              // author.avatarUrls['48x48'] | null
  started: 1759280400000,             // | null (손상 행)
  timeSpentSeconds: 3600,
  comment: 'c6',                      // ADF → 평문, 없으면 ''
  created: 1759280400000,             // | null
  updated: 1759280400000,             // | null
  visibilityRestricted: false,
  mine: true,
  periodKey: '2026-10',               // 정책 단위·타임존 기간. started 가 null 이면 null
  lock: { locked: false, reasonCode: null, periodKey: null },
  //   mine=true  → 마감 + 본인 제출·승인 / mine=false → 마감만(남의 제출 상태는 내보내지 않는다, Q20)
  canEdit: true,                      // mine && permissions.canEditOwn && !lock.locked
  canDelete: true,                    // mine && permissions.canDeleteOwn && !lock.locked
}
```

`LockRange`: `{ start, end, periodKey, reasonCode: 'PERIOD_CLOSED'|'PERIOD_SUBMITTED'|'PERIOD_APPROVED', auto: boolean }` — `[start, end)`, `start` 내림차순, 마감과 겹치는 본인 잠금은 빠진다. 사이트 마감은 현재 기간부터 과거 24기간, 본인 제출·승인은 12기간.

### 2.3 `getWorklogEditorContext({ issueId, worklogId? })`

```js
{
  issueId: '10002',
  issueKey: null,                     // 항상 null — 조회하지 않는다. 프론트는 extension context 의 issue.key 사용
  timeZone: 'Asia/Seoul', unit: 'MONTH',
  now: 1760886000000,                 // 서버 시각 — 기본 started·사전 판정 기준
  permissions: { canLog, canEditOwn, canDeleteOwn },
  lockRanges: [LockRange],
  worklog: WorklogView | null,        // worklogId 를 줬을 때만. 남의 것 → WORKLOG_NOT_OWNER, 다른 이슈/없음 → WORKLOG_NOT_FOUND
}
```

### 2.4 쓰기

| resolver | 입력 | 응답 |
|---|---|---|
| `createWorklog` | `{ issueId, started:int(ms), timeSpentSeconds:int 60..86400, comment?:string ≤4000 }` | `{ worklog: WorklogView }` (Jira 응답 본문으로 만든 뷰, 재조회 없음) |
| `updateWorklog` | `{ issueId, worklogId, started, timeSpentSeconds, comment? }` | `{ worklog: WorklogView }` |
| `deleteWorklog` | `{ issueId, worklogId }` | `{ worklogId: '5', deleted: true }` |

- `updateWorklog` 의 이전 started 는 **서버가 GET 한 값**이다(payload 의 다른 칸은 무시).
- `comment` 를 빈 문자열로 보내면 Jira 본문에서 `comment` 를 생략한다 — **기존 설명을 지우지 않는다**(Jira 는 생략된 칸을 유지하는 것으로 기대 — P8 과 함께 실측). 설명 지우기는 현재 불가.
- Jira 호출: `adjustEstimate=auto`, `notifyUsers` 미전송, `visibility` 미전송.

### 2.5 `listPeriodCloses({ count?: 1..24 = 12, beforePeriodKey? })`

```js
{
  unit: 'MONTH', timeZone: 'Asia/Seoul', autoCloseDays: 0, now: 1760886000000,
  items: [PeriodCloseItem],           // beforePeriodKey(포함, 없으면 현재 기간)부터 과거로 count 개
  nextBeforePeriodKey: '2026-07',     // 마지막 항목의 바로 이전 키 — 항상 문자열(끝 없음)
}
// PeriodCloseItem (테스트 toEqual 그대로)
{
  periodKey: '2026-09', start, end,   // 행이 있으면 행에 고정된 범위, 없으면 정책 타임존 범위
  ended: true,                        // now >= end
  state: 'CLOSED',                    // 'OPEN'(행 없음) | 'CLOSED' | 'REOPENED'
  closed: true,                       // 효력
  auto: false,                        // 행이 있으면 행 auto_closed(REOPENED 이어도 원래 자동이면 true), 없으면 계산상 마감 여부
  closedAt: 1759276801000,            // 행 값 또는 계산된 자동 마감 시각, 아니면 null
  closedBy: 'admin', closedByDisplayName: 'ADMIN',
  reopenedAt: null, reopenedBy: null, reopenedByDisplayName: null,
  autoCloseAt: null,                  // 정책 꺼짐이면 null
  rev: 1,                             // 행 없으면 null — close/reopen 에 그대로 보낸다
  closeDriftCount: 3,
}
```

### 2.6 `closePeriod({ periodKey, rev })` / `reopenPeriod({ periodKey, rev })`

응답 `{ item: PeriodCloseItem }`(변경 후 다시 읽은 값). 감사 `listSettingsAudit` 항목: `area:'periodClose'`, `action:'close'|'reopen'|'autoClose'`, `detail:{ scope:'SITE', periodKey, rev:<변경 후 rev> }`, 자동 마감은 `actorKey:null`.

### 2.7 변경 resolver (추가 필드만)

- `getMyTimesheet`:
  ```js
  close: { closed, auto, closedAt, autoCloseAt, state: 'OPEN'|'CLOSED'|'REOPENED' },
  closeDrift: { detectedAt, kind: 'CREATED'|'UPDATED'|'DELETED', worklogId } | null,  // 최신 요청 제출 이후 감지된 것만
  lock: { locked: boolean, reasonCode: 'PERIOD_CLOSED'|'PERIOD_SUBMITTED'|'PERIOD_APPROVED'|null },
  periods: [{ periodKey, periodStatus, needsResubmit, closed: boolean }],
  ```
- `getTeamTimesheetMatrix`: `close`(위와 같은 shape), `rows[].closeDriftAt: number|null`, `summary.closeDrift: number`.
- `get/saveApprovalSettings`: `timesheetAutoCloseDays`(정수 0..90, 기본 0), `timesheetLockSubmitted`(boolean, 기본 true). 둘 다 `GLOBAL_ONLY_KEYS`. 검증 실패 `INVALID_TARGET`.

## 3. 에러 코드

신규 9개 (`ErrorCodes`): `WORKLOG_PERIOD_LOCKED`, `WORKLOG_INVALID_INPUT`, `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER`, `WORKLOG_PERMISSION_DENIED`, `WORKLOG_REJECTED_BY_JIRA`, `PERIOD_NOT_ENDED`, `PERIOD_ALREADY_CLOSED`, `PERIOD_NOT_CLOSED`.

| 코드 | 언제 | `error.name` | `error.cause` |
|---|---|---|---|
| `WORKLOG_PERIOD_LOCKED` | 쓰기 직전 서버 판정에서 잠김 | `LogicalError` | `{ reasonCode, periodKey, which:'started'\|'previousStarted' }` |
| `WORKLOG_INVALID_INPUT` | 입력 검증 | `LogicalError` | `{ field:'started'\|'timeSpentSeconds'\|'comment' }` |
| `WORKLOG_NOT_FOUND` | Jira 404, 숫자 아닌 worklogId, 조회한 워크로그의 issueId ≠ payload issueId | `LogicalError` | `''` |
| `WORKLOG_NOT_OWNER` | 작성자 ≠ 호출자 | `LogicalError` | `''` |
| `WORKLOG_PERMISSION_DENIED` | Jira 403 | `PermissionDeniedError` | `''` |
| `WORKLOG_REJECTED_BY_JIRA` | Jira 400 | `LogicalError` | `{ fields: string[] }` (Jira `errors` 의 키 이름만) |
| `JIRA_API_FAILED` | 그 밖 Jira 실패 | `JiraApiError` | — |
| `INVALID_TARGET` | `offset` 음수·비정수, `count` 범위 밖, **`rev` 가 null/양의 정수가 아님** | `LogicalError` | |
| `TIMESHEET_PERIOD_INVALID` | `periodKey`·`beforePeriodKey` 형식 오류·정책 단위와 다름 | `LogicalError` | |
| `PERIOD_NOT_ENDED` | `closePeriod` 에서 `now < end` | `LogicalError` | |
| `PERIOD_ALREADY_CLOSED` | 이미 CLOSED 행 / **행 없이 계산상 자동 마감된 기간** / CAS 실패 후 재조회가 CLOSED | `LogicalError` | |
| `PERIOD_NOT_CLOSED` | 재개방 대상이 열림(REOPENED 행, 또는 행 없고 자동 마감 아님) | `LogicalError` | |
| `CONCURRENT_MODIFICATION` | CAS 실패 후 재조회가 기대 상태도 아님, 또는 rev 를 보냈는데 행 없음 | `ConcurrencyError` | |
| `STORAGE_NOT_READY` | `closePeriod`·`reopenPeriod` 에서 v022 미적용 | `LogicalError` | |
| `PERMISSION_ISSUE_VIEW_DENIED` | 가드 | `PermissionDeniedError` | |

⚠ **locales 미추가**: `locales/{kr,en}/error.json` 에 위 9개 키를 넣지 않았다(설계서 §8.2 — frontend 몫). 백엔드 테스트에 ErrorCodes↔locales 대조는 없다. frontend 가 추가해야 한다.

## 4. 스키마·마이그레이션

| 이름 | 테이블 | PK / 인덱스 |
|---|---|---|
| `v022_create_approval_period_close_table` | `approval_period_close` | PK `(scope_key, period_key)`, `ix_period_close_range (scope_key, period_start, period_end)` |
| `v023_create_timesheet_close_drift_table` | `timesheet_close_drift` | PK `(scope_key, subject_account, period_key)`, `ix_close_drift_period (scope_key, period_key)` |

- CAS: `close`/`reopen` UPDATE 는 `SET … rev = rev + 1 … WHERE scope_key=? AND period_key=? AND rev=? AND state=<이전 상태>`. 신규 행은 `INSERT IGNORE … rev=1`(rowsAffected 1 판정). close drift 는 `INSERT … ON DUPLICATE KEY UPDATE last_* = VALUES(...), rev = rev + 1`(affectedRows 판정에 안 씀, `first_detected_at` 보존).
- 프로브: 두 Repository 모두 `ready()`(isTableReady). 미준비면 읽기는 빈 결과(마감 없음 — 자동 마감 계산은 정책만으로 효력), 쓰기 resolver 는 `STORAGE_NOT_READY`, 감지·자동 마감 기록은 건너뜀.
- 시각 바인딩은 전부 `SqlTime.toSqlTimestamp`. `whereIn` 빈 배열 경로는 전부 조회하지 않는다(테스트로 단언).
- 판정용 조회(`PeriodLockService`)는 SQL 예외를 그대로 올린다(fail-close → `UNKNOWN_ERROR`/`SqlError`), 쓰기는 일어나지 않는다.

## 5. manifest 변경

```yaml
jira:timeTrackingProvider:
  - key: moves-time-tracking
    name: Moves Approval
    adminPage: approval-settings
jira:issueAction:
  - key: worklog-log-action
    title: Log work
    resource: main/worklog
    resolver: { function: resolver }
    viewportSize: medium
    displayConditions: { timeTrackingProviderEnabled: { key: moves-time-tracking } }
jira:issueActivity:
  - key: worklog-activity-tab
    title: Work log
    resource: main/worklog
    resolver: { function: resolver }
    displayConditions: { timeTrackingProviderEnabled: { key: moves-time-tracking } }
resources[main].entry.worklog: worklog.html
permissions.scopes: + write:jira-work
```

js-yaml 로 파싱 확인. `forge lint` 미실행(금지). **`static/ui/craco.config.js` ENTRIES·`static/ui/public/worklog.html` 은 만들지 않았다** — 백엔드 테스트가 manifest↔엔트리를 대조하지 않아 깨지지 않았다. frontend 가 엔트리 3곳 중 남은 2곳을 채워야 `npm run build:ui`·배포가 성립한다. scope 추가라 배포 회차에 `forge install --upgrade` 필수.

## 6. 감지(3층) 확장 — `TimesheetDriftService`

- 기존 두 경로(PENDING 만료·APPROVED 감지) 무변경. `applyChanges` 요약에 `closeDrift` 카운트 추가.
- **후보 계획은 기존 경로보다 먼저** 만든다: 같은 회차에서 기존 경로가 PENDING 을 만료시키거나 APPROVED 를 감지로 바꾸면 그 뒤에는 "기존 경로가 받은 변경"을 구분할 수 없다. 사전 상태가 PENDING 이거나 APPROVED(감지 전)인 (작성자, 기간)은 건너뛴다.
- 판정 원천은 **기록된 마감 행만**(정책·KVS 읽기 없음). 자동 마감은 `runTimesheetSweep` 이 ① `recordAutoCloses` → ② `sweep` 순서로 먼저 행을 남긴다. `closed_at` 은 계산된 자동 마감 시각이라 늦게 기록돼도 기준이 같다.
- 변경 시각: 현재 값이 있으면 `worklog.updated` → 피드 `updatedTime` → 트리거 도착 시각. 삭제는 피드 `updatedTime` → 트리거 도착 시각. 모르면 플래그 안 함(누락 쪽으로 틀린다).
- 삭제는 역참조(`timesheet_worklog_ref`)·스냅샷에서 started·작성자를 찾는다(상태 무관). 역참조가 없으면 건너뜀(한계 L1).
- 게이트: 트리거·스윕 모두 `hasAnySubmission() || hasAnyClosed()`. 둘 다 없으면 asApp 0회.
- asApp 신규 호출부 없음(기존 `WorklogCollector` 두 함수만). `WorklogGateway` 는 asApp 을 import 하지 않음(테스트 단언).
- R7: `sweepJob` 이 페이지를 하나도 시도하지 못하고 PARTIAL 로 끝나면 `failStreak: lease.failStreak` 보존.

## 7. 설계와의 차이

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| D1 | `listPeriodCloses` 의 `beforePeriodKey` 의미 불명확("부터") | **포함**(그 키부터 과거로). `nextBeforePeriodKey` = 마지막 키의 바로 이전, 항상 문자열 | 이어 부르기가 겹치지 않는다. 끝이 없는 목록이라 null 을 만들 기준이 없다 |
| D2 | `closePeriod` 행 없음 + 계산상 자동 마감 | `PERIOD_ALREADY_CLOSED` | 수동 마감 행으로 덮으면 "누가 닫았나"가 바뀌고 `closed_at` 이 늦춰져 감지 기준이 흔들린다 |
| D3 | `rev` 형식 오류 코드 미정 | `INVALID_TARGET` | 기존 입력 오류 코드 재사용 |
| D4 | `getWorklogEditorContext.issueKey` "프론트 값 우선" | 항상 `null` | 호출 1회 절약(설계 §4.3 "부르지 않는다") |
| D5 | `WorklogCollector.currentOf` 에 `updated` | `created`·`updated` 둘 다 | 스윕 경로에서 생성/수정 구분(`created===updated`) — 표시용, P24 |
| D6 | `PeriodLockService.evaluate` → 판정 결과 | `{ result, loaded }` 반환, 순수 판정 `judge(loaded, …)` 분리 | 목록 50건을 SQL 2회로 판정하고, 쓰기 응답 뷰에 같은 데이터를 재사용 |
| D7 | `updateWorklog` 빈 comment | 본문에서 `comment` 생략 → 기존 설명 유지 기대 | ADF 빈 문서를 보낼지 미정. 설명 "지우기"는 지금 불가 — 열린 질문 O2 |
| D8 | `CONCURRENT_MODIFICATION` 클래스 | `ConcurrencyError(retryable:false)` | 기존 코드 관례. 프론트는 code 로 분기 |

## 8. 미검증 (`04_spike_todo.md` 에 P21~P27 추가)

P21 단건 GET 의 `issueId`(없으면 모든 수정·삭제가 NOT_FOUND — **가장 위험**), P22 POST/PUT 응답 본문, P23 초 단위 반올림, P24 생성/수정 구분, P25 감사 `INSERT IGNORE`, P26 재개방·자동 기록 경합, P27 저장 지연. 설계 P1~P20 은 그대로 유효(특히 P3 displayConditions, P7 scope, P8 visibility, P12 updatedTime, P15 mypermissions 키).

## 9. 열린 질문 (제품 결정 아님 — 확인용)

- O1: `listPeriodCloses` 를 무한히 과거로 넘길 수 있다. 하한(예: 앱 설치일·첫 제출)을 둘지.
- O2: 대화상자에서 설명을 비우면 기존 설명을 지워야 하는가(현재는 유지). 지우려면 빈 ADF 문서 전송 여부 실측 필요.

## 발견 (범위 밖, 고치지 않음)

- `PermissionError` 의 `name` 이 `'PermissionDeniedError'` 인데 `ResponseWrapper` 의 `EXPECTED_ERRORS` 는 `'PermissionError'` 를 담고 있다 → 모든 권한 거부(이번 `WORKLOG_PERMISSION_DENIED` 포함)가 `[RESOLVER]` 예상 밖 오류로 서버 로그에 남는다. 동작 영향은 없고 로그 소음. (`src/utils/ResponseWrapper.js:13`, `src/error/PermissionError.js:9`)
- 설계서 §8.2 메모: `policy.audit.area.timesheetTeam` kr 키 누락 의심 — frontend 확인.

## 테스트

```
npm test -- --runInBand
Test Suites: 46 passed, 46 total
Tests:       529 passed, 529 total
```

신규: `lock.test.js`(마감·자동 마감·DST·단위 혼재·제출 잠금·isChangeAfterClose·lockRangesOf·감사 id·순수성 grep), `worklogInput.test.js`, `PeriodLockRepositories.test.js`(CAS SQL·빈 배열 가드), `PeriodCloseService.test.js`(목록·마감·재개방·CAS 코드·자동 마감 기록·PeriodLockService), `WorklogGateway.test.js`(asApp 미import·경로·상태 매핑), `WorklogService.test.js`(shape·잠금 재판정·소유자·이슈 불일치·fail-close), `PeriodLockWiring.test.js`(스윕 순서·auditId·정책 키). 보강: `TimesheetDriftService.test.js`(설계 §11.1 (a)~(g)·게이트·R7), `TimesheetService.test.js`, `WorklogCollector.test.js`, `JiraPermission.test.js`, `permissionGuard.test.js`, `migrate.test.js`, 계약 테스트.
