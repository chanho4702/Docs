# period-lock 설계서 — 기간 잠금 (시간 추적 제공자 + 대체 Log work + 기간 마감)

> 작성: feature-architect · 2026-10-03 · autopilot 무인 회차(Phase 2)
> 입력: `00_input/requirement.md`. 재사용 기반: `_workspace/timesheet-approval/{01_architect_design,02_backend_report,02_frontend_report,03_verify_report,04_spike_todo}.md` + 실제 코드
> (`src/domain/timesheet/*`, `src/resolver/timesheet/*`, `src/trigger/*`, `src/permission/*`, `static/ui/src/features/{timesheet,settings}`, `craco.config.js`, `manifest.yml`).
> 기준선: 백엔드 39 suites / 414 tests, UI 12 suites / 86 tests. 최신 마이그레이션 `v021_alter_approval_notification_kind_width` → **이번 기능은 v022·v023**.
> 플랫폼 근거 등급: **문서**(공식 문서 확인, 실측 전) / **미검증**(추정 — `04_spike_todo.md` P 번호).

## 열린 질문

QUESTIONS.md 에 Q16~Q26 으로 올린다. 답이 없으면 **기본 가정**으로 구현한다.

| # | 질문 | 선택지 | 기본 가정(이 설계) | 권장·근거 |
|---|---|---|---|---|
| Q16 | 어떤 기간을 "잠김"으로 보나 | (a) 마감 기간만 (b) 마감 + 제출(PENDING)·승인(APPROVED) 기간 (c) b + 승인 후 변경(CHANGED_AFTER_APPROVAL)도 잠금 | **(b)**. 반려·만료·회수·승인 후 변경 기간은 열림. 제출·승인 잠금은 정책 `timesheetLockSubmitted`(기본 true)로 끌 수 있다 | (b). 승인 후 변경 기간은 어차피 재제출해야 하므로 잠그면 잘못된 외부 변경을 본인이 되돌릴 길만 막힌다. 제출 중 수정은 "회수 → 수정 → 재제출"로 안내 |
| Q17 | 마감 범위(scope) | 사이트 전체 / 팀 / 프로젝트 | **사이트 전체만**. 테이블에 `scope_key` 칸을 두되 값은 `'SITE'` 하나 | 사이트. 팀·프로젝트 마감은 한 워크로그에 여러 scope 가 걸려 판정이 복잡해진다. 칸만 남겨 나중에 연다 |
| Q18 | 자동 마감 | 끔 / 기간 종료 후 N일 | **끔**(정책 `timesheetAutoCloseDays=0`). 켜면 종료 후 N일 자정(정책 타임존)에 마감 | 끔으로 출발. 판정은 시각 계산이라 스윕을 기다리지 않고 즉시 효력, 스윕은 기록(행·감사)만 남긴다 |
| Q19 | 재개방 권한·효과 | 앱 관리자 / Jira 관리자만 · 승인 상태 유지 / 승인 무효화 | **앱 관리자(`{admin:true}`), 승인 상태 유지** | 유지. 재개방은 "입력을 다시 받는다"일 뿐, 그 뒤 실제 변경이 생기면 기존 감지(승인 후 변경)가 재승인을 요구한다 |
| Q20 | 작업 로그 탭에 남의 워크로그 · 남의 것 편집 | 내 것만 표시 / 전부 표시(남의 것 읽기 전용) / 전부 + Edit all worklogs 권한자 편집 | **전부 표시, 편집·삭제는 본인 것만** | 전부 표시. 우리 탭이 Jira 기본 작업 로그 탭을 대체하므로 남의 기록이 안 보이면 퇴행이다(asUser 라 원래 볼 수 있던 것만 보인다). 남의 잠금 사유(제출 여부)는 내보내지 않고 마감 여부만 표시 |
| Q21 | 남은 추정치(`adjustEstimate`) | auto 만 / new·leave·manual 선택 | **auto 만**(Jira 기본) | auto. 선택지를 늘리면 대화상자가 Jira 기본과 달라지고 검증 대상이 는다 |
| Q22 | `restrictAccess=true` 사이트에서 명부에 없는 사용자의 워크로그 입력 | 막는다(현행 앱 접근 게이트) / 워크로그 resolver 만 게이트 면제 | **면제**(가드 메타 `appAccess:false`) | 면제. 우리가 Jira 기본 Log work 를 숨겼는데 앱 명부 미등록자가 시간을 못 남기면 Jira 기능 자체를 빼앗는다. 입력 권한은 Jira 권한(Work on work items)이 판정한다 |
| Q23 | 라이선스 만료 시 워크로그 입력 | 현행대로 막힘(모든 resolver 라이선스 가드) / 워크로그 resolver 만 면제 | **현행 유지(막힘)** + 관리 화면에 "만료 시 시간 추적 제공자를 Jira 기본으로 되돌리세요" 고지 | 제품 결정 필요. 막히면 사이트 전체가 시간 입력을 잃는다(제공자 선택이 남아 있는 한). 면제는 무료 사용 경로가 된다 |
| Q24 | 미제출 기간이 마감 후 바뀌면 | 플래그만 / 플래그 + 앱 내 알림 | **플래그만**(내 타임시트·팀 매트릭스 배지). 알림 없음 | 플래그. 현재 알림 테이블은 요청 행에 묶여(`approval_notification.request_id NOT NULL` + `JOIN approval_request`) 요청 없는 기간에 알림을 걸 수 없다. 알림이 필요하면 별도 기능으로 |
| Q25 | 어떤 기간을 마감할 수 있나 | 종료된 기간만 / 진행 중 기간도 | **종료된 기간만**(`now >= period.end`) | 종료된 기간만. 진행 중 마감은 오늘 입력을 막는다 |
| Q26 | 관리 화면에 "제공자 선택 여부"를 실제로 조회해 표시할까 | 안내문만 / `GET /rest/api/3/configuration/timetracking` 조회(새 scope 필요 가능) | **안내문만**(scope 추가 없음) | 안내문. 조회 API 의 권한·scope 가 미검증(P13)이고, 설정 관리자(비 Jira 관리자)는 볼 수 없을 가능성이 크다 |

## 1. 개요·영향 범위

DESIGN §2.0 의 2층("언제 쓰나")을 만든다. 수용 기준 문장(화면·문서 공통, 의미 유지):

> **기간 잠금은 이 앱이 Jira 시간 추적 제공자로 선택된 사이트에서 Jira 화면의 입력만 막습니다. REST·자동화·모바일 등 다른 경로의 변경은 막지 못하며, 감지해 다시 승인받게 합니다.**

| 영역 | 변경 |
|---|---|
| 도메인(순수) | 신규 `src/domain/timesheet/lock.js`(잠금 판정·자동 마감 시각·잠금 구간), `src/domain/timesheet/worklogInput.js`(입력 검증·ADF↔평문·Jira 시각 문자열). `period.js`·`status.js` 재사용, 무변경 |
| resolver | 신규 8: 워크로그 5(`getIssueWorklogs`·`getWorklogEditorContext`·`createWorklog`·`updateWorklog`·`deleteWorklog`) + 마감 3(`listPeriodCloses`·`closePeriod`·`reopenPeriod`). 변경 4: `getMyTimesheet`·`getTeamTimesheetMatrix`·`getApprovalSettings`·`saveApprovalSettings`(정책 키 2개) |
| 서비스 | 신규 `src/resolver/worklog/{WorklogController,WorklogService,WorklogGateway}.js`, `src/resolver/timesheet/{PeriodLockService,PeriodCloseService,PeriodCloseRepository,CloseDriftRepository}.js`. 변경 `TimesheetDriftService`(마감 후 변경 경로), `WorklogCollector`(`updated` 시각), `TimesheetService`(마감 표시), `TimesheetController`(마감 3종), `SettingsRepository`(정책 키), `SettingsAuditRepository.record`(선택적 `auditId`), `JiraPermission.getIssueAccess`(워크로그 권한 키 동봉), `permissionGuard`(`appAccess:false`) |
| 트리거·스윕 | `runTimesheetSweep`(시간당)에 자동 마감 기록을 감지보다 **먼저** 추가. `onWorklogChanged` 무변경(서비스가 확장) |
| 스키마 | `v022_create_approval_period_close_table`, `v023_create_timesheet_close_drift_table` |
| manifest | `jira:timeTrackingProvider` 1, `jira:issueAction` 1, `jira:issueActivity` 1, resources entry `worklog`, scope `write:jira-work` 추가 |
| 프론트 | 엔트리 신규 `worklog`(3곳). 설정 > 타임시트 탭에 "기간 마감"·"시간 추적 제공자" 섹션, 내 타임시트·팀 매트릭스에 마감 배지 |
| i18n | 신규 `locales/{kr,en}/worklog.json`, `timesheet.json`·`error.json`·`policy.json` 추가 키 |
| 워크포스 연동 | 없음(범위 밖: workforce-link). 엔티티 프로퍼티 미사용(불변식 9) |

엔진(`src/domain/approval/**`, `ApprovalService`) **무변경**. 상태 머신·scopeKey 추가 없음 — 잠금은 승인 요청이 아니라 판정이다.

### 1.1 전체 흐름

```
[제공자 선택된 사이트]
 사용자 ••• > Log work(우리 issueAction) ─┐
 작업 로그 탭(우리 issueActivity) 수정·삭제 ─┤→ resolver(asUser) → PeriodLockService.evaluate → 잠김이면 WORKLOG_PERIOD_LOCKED
                                          └→ 열림이면 Jira REST asUser POST/PUT/DELETE worklog
 REST·자동화·모바일·가져오기 ──────────────→ (막지 못함) → avi:jira:*:worklog 트리거 + 시간당 스윕
                                                         → TimesheetDriftService.applyChanges
                                                            ├ PENDING  → 만료(CONTENT_CHANGED)          (기존)
                                                            ├ APPROVED → CHANGED_AFTER_APPROVAL         (기존)
                                                            └ 마감 기간 + 그 외(미제출·반려·만료) → close drift 플래그 (신규)
[제공자 미선택 사이트] 우리 issueAction/issueActivity 는 displayConditions 로 숨김 → 2층 없음, 3층(감지)만
```

## 2. 경계면 계약

모든 응답은 기존 규약 그대로 `{ success:true, content:<아래> }` / `{ success:false, error:{name,code,message,cause} }`. **아래 shape 은 전부 `res.content`.** 시각은 epoch ms(number), 시간 양은 초(number).

### 2.1 신규 resolver

| resolver | 권한 축 | 입력(payload) | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueWorklogs` | `{issue:'view', issueIdKey:'issueId', appAccess:false}` | `{ issueId: string(숫자), offset?: int ≥0 }` | `IssueWorklogsView` (§2.3) | `PERMISSION_ISSUE_VIEW_DENIED`(가드), `INVALID_TARGET`(offset), `WORKLOG_PERMISSION_DENIED`(Jira 403), `JIRA_API_FAILED` | `worklog` 엔트리 탭 모드(`WorklogTab`) |
| `getWorklogEditorContext` | 같음 | `{ issueId, worklogId?: string(숫자) }` | `WorklogEditorContext` (§2.4) | 위 + `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER` | `worklog` 엔트리 대화상자 모드(`WorklogDialog`) — issueAction·Modal 공통 |
| `createWorklog` | 같음 | `{ issueId, started: number(epoch ms), timeSpentSeconds: int, comment?: string(≤4000) }` | `{ worklog: WorklogView }` | `WORKLOG_INVALID_INPUT`(cause `{field}`), `WORKLOG_PERIOD_LOCKED`(cause `LockCause`), `WORKLOG_PERMISSION_DENIED`, `WORKLOG_REJECTED_BY_JIRA`, `JIRA_API_FAILED` | `WorklogDialog` |
| `updateWorklog` | 같음 | `{ issueId, worklogId, started, timeSpentSeconds, comment?: string }` | `{ worklog: WorklogView }` | 위 + `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER` | `WorklogDialog`(편집) |
| `deleteWorklog` | 같음 | `{ issueId, worklogId }` | `{ worklogId, deleted: true }` | `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER`, `WORKLOG_PERIOD_LOCKED`, `WORKLOG_PERMISSION_DENIED`, `WORKLOG_REJECTED_BY_JIRA`, `JIRA_API_FAILED` | `WorklogTab`(삭제 확인) |
| `listPeriodCloses` | `{admin:true}` | `{ count?: int 1..24 (기본 12), beforePeriodKey?: string }` | `PeriodCloseList` (§2.5) | `TIMESHEET_PERIOD_INVALID`(beforePeriodKey 형식·단위), `INVALID_TARGET`(count) | 설정 > 타임시트 > 기간 마감(`PeriodCloseSettings`) |
| `closePeriod` | `{admin:true}` | `{ periodKey, rev: number \| null }` (행이 없으면 null) | `{ item: PeriodCloseItem }` | `TIMESHEET_PERIOD_INVALID`(형식·정책 단위와 다름), `PERIOD_NOT_ENDED`, `PERIOD_ALREADY_CLOSED`, `CONCURRENT_MODIFICATION`, `STORAGE_NOT_READY` | `PeriodCloseSettings` |
| `reopenPeriod` | `{admin:true}` | `{ periodKey, rev: number \| null }` (자동 마감이 아직 행으로 기록되지 않았으면 null) | `{ item: PeriodCloseItem }` | `TIMESHEET_PERIOD_INVALID`, `PERIOD_NOT_CLOSED`, `CONCURRENT_MODIFICATION`, `STORAGE_NOT_READY` | `PeriodCloseSettings` |

권한 축 결정 근거:
- 워크로그 5종은 **`view`** 다. `edit`(EDIT_ISSUES)는 워크로그 권한이 아니다 — "Work on work items"만 있고 이슈 편집 권한이 없는 사용자가 정상적으로 시간을 못 남기게 된다. 쓰기 권한(Work on work items·Edit/Delete own worklogs)은 **Jira 가 asUser 호출에서 판정**하고, 403 을 `WORKLOG_PERMISSION_DENIED` 로 매핑한다. 화면 표시용 권한은 `mypermissions` 1회로 함께 받는다(§4.4).
- `appAccess:false`(Q22)는 가드 메타의 새 선택 키다. `assertAppAccess` 만 건너뛰고 라이선스 가드·이슈 권한 가드는 그대로다. 계약 테스트의 "최소 한 축" 단언은 `issue` 축이 있어 통과한다. `appAccess:false` 는 `issue` 축이 있는 항목에만 허용(테스트로 단언).
- 마감 3종은 `{admin:true}`(Q19). 팀장 축이 아니다 — 마감은 사이트 전체에 효력이 있다.

### 2.2 변경 resolver (추가 필드만, 기존 필드 무변경)

| resolver | 추가 |
|---|---|
| `getMyTimesheet` | `close: PeriodCloseState`, `closeDrift: CloseDriftView \| null`, `lock: { locked: boolean, reasonCode: LockReason \| null }`(이 기간 전체 기준 — 본인), `periods[].closed: boolean` |
| `getTeamTimesheetMatrix` | `close: PeriodCloseState`, `rows[].closeDriftAt: number \| null`, `summary.closeDrift: number` |
| `getApprovalSettings` / `saveApprovalSettings` | 정책 키 `timesheetAutoCloseDays`(정수 0..90, 기본 0), `timesheetLockSubmitted`(boolean, 기본 true). 둘 다 `GLOBAL_ONLY_KEYS`. 검증 실패 `INVALID_TARGET` |
| `listSettingsAudit` | shape 무변경. 새 `area:'periodClose'`, `action: 'close' \| 'reopen' \| 'autoClose'`, `detail: { scope:'SITE', periodKey, rev }` |

`getTimesheetContext`·`submitTimesheet`·`decideTimesheets`·`getTimesheetDetail` 는 무변경 — **마감 기간도 제출·결정할 수 있다**(제출은 워크로그를 바꾸지 않는다).

### 2.3 `IssueWorklogsView` / `WorklogView`

```js
// IssueWorklogsView
{
  issueId: '10002',
  timeZone: 'Asia/Seoul', unit: 'MONTH' | 'WEEK',          // 정책값 — periodKey·잠금 배지 계산 기준
  worklogs: [WorklogView],                                  // started 내림차순 → worklogId 내림차순, 한 쪽 50건
  total: number,                                            // 이 사용자가 볼 수 있는 이 이슈 워크로그 수(최대 1000에서 잘림)
  truncated: boolean,                                       // 1000 초과
  nextOffset: number | null,
  permissions: { canLog: boolean, canEditOwn: boolean, canDeleteOwn: boolean },  // mypermissions — 표시용
  lockRanges: [LockRange],                                  // 대화상자 사전 판정용(표시용, 서버가 쓰기 때 다시 판정)
}

// WorklogView
{
  worklogId: '10231', issueId: '10002',
  authorAccountId: string | null, authorDisplayName: string | null, authorAvatarUrl: string | null,
  started: number, timeSpentSeconds: number,
  comment: string,                     // ADF → 평문(§3.2). 없으면 ''
  created: number | null, updated: number | null,
  mine: boolean,
  visibilityRestricted: boolean,       // Jira visibility(그룹·역할) 지정 여부 — 우리 화면은 편집하지 않고 보존(P8)
  periodKey: string,                   // started 의 정책 단위·타임존 기간
  lock: { locked: boolean, reasonCode: LockReason | null, periodKey: string | null },
  //   mine=true  → 마감 + 본인 제출·승인 판정
  //   mine=false → 마감만(남의 제출 상태는 노출하지 않는다 — Q20)
  canEdit: boolean,                    // mine && permissions.canEditOwn && !lock.locked
  canDelete: boolean,                  // mine && permissions.canDeleteOwn && !lock.locked
}

// LockRange — [start, end)
{ start: number, end: number, periodKey: string, reasonCode: LockReason, auto: boolean }
// LockReason = 'PERIOD_CLOSED' | 'PERIOD_SUBMITTED' | 'PERIOD_APPROVED'
// LockCause (WORKLOG_PERIOD_LOCKED 의 cause) = { reasonCode: LockReason, periodKey: string, which: 'started' | 'previousStarted' }
```

`lockRanges` 범위: 사이트 마감은 현재 기간부터 과거 24기간(자동 마감 계산 포함), 본인 제출·승인은 최근 12기간. 그보다 오래된 기간은 서버 판정에만 걸린다(화면은 저장 시 에러로 알게 된다).

### 2.4 `WorklogEditorContext`

```js
{
  issueId: '10002',
  issueKey: string | null,                 // 대화상자 제목용. extension context 에 있으면 프론트 값 우선
  timeZone, unit,
  now: number,                             // 서버 시각 — 기본 started·잠금 사전 판정 기준
  permissions: { canLog, canEditOwn, canDeleteOwn },
  lockRanges: [LockRange],
  worklog: WorklogView | null,             // worklogId 를 줬을 때만. 본인 것이 아니면 WORKLOG_NOT_OWNER
}
```

### 2.5 `PeriodCloseList` / `PeriodCloseItem` / `PeriodCloseState` / `CloseDriftView`

```js
// PeriodCloseList
{
  unit, timeZone, autoCloseDays: number, now: number,
  items: [PeriodCloseItem],                // beforePeriodKey(없으면 현재 기간) 부터 과거로 count 개
  nextBeforePeriodKey: string | null,
}
// PeriodCloseItem
{
  periodKey, start, end,
  ended: boolean,                          // now >= end
  state: 'OPEN' | 'CLOSED' | 'REOPENED',   // 행 상태. 행이 없으면 'OPEN'
  closed: boolean,                         // 효력 — 행 CLOSED 또는 (행 없음 && 자동 마감 시각 경과)
  auto: boolean,                           // 자동 마감(행 auto_closed=1 이거나 아직 행 없는 계산상 마감)
  closedAt: number | null, closedBy: string | null, closedByDisplayName: string | null,
  reopenedAt: number | null, reopenedBy: string | null, reopenedByDisplayName: string | null,
  autoCloseAt: number | null,              // 정책이 꺼져 있으면 null
  rev: number | null,                      // 행이 없으면 null — closePeriod/reopenPeriod 에 그대로 보낸다
  closeDriftCount: number,                 // 이 기간 마감 후 변경 플래그가 선 사용자 수
}
// PeriodCloseState (내 타임시트·매트릭스)
{ closed: boolean, auto: boolean, closedAt: number | null, autoCloseAt: number | null, state: 'OPEN'|'CLOSED'|'REOPENED' }
// CloseDriftView
{ detectedAt: number, kind: 'CREATED' | 'UPDATED' | 'DELETED', worklogId: string | null }
```

`closeDrift` 는 플래그가 있고 **최신 요청이 없거나 최신 요청 제출 시각보다 나중에 감지됐을 때만** 싣는다(제출하면 스냅샷이 그 변경을 담으므로 표시가 의미를 잃는다 — `closeDriftVisible`, §3.1).

### 2.6 신규 에러 코드 (`ErrorCodes` + `locales/{kr,en}/error.json` 동시)

`WORKLOG_PERIOD_LOCKED`, `WORKLOG_INVALID_INPUT`, `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER`, `WORKLOG_PERMISSION_DENIED`, `WORKLOG_REJECTED_BY_JIRA`, `PERIOD_NOT_ENDED`, `PERIOD_ALREADY_CLOSED`, `PERIOD_NOT_CLOSED` — 9개.

Jira 응답 매핑(`WorklogGateway`, `allowStatuses:[400,403,404]`):

| Jira | 코드 |
|---|---|
| 403 | `WORKLOG_PERMISSION_DENIED` |
| 404(이슈·워크로그) | `WORKLOG_NOT_FOUND` |
| 400 | `WORKLOG_REJECTED_BY_JIRA` (cause `{ fields: string[] }` — `errors` 객체의 **키 이름만**, 값(문구)은 싣지 않는다. 시간 추적 꺼짐·이슈 상태 제약 등 — P18) |
| 그 외 실패 | `JIRA_API_FAILED`(기존) |

### 2.7 프론트 호출 대응

| 화면 | 호출 | 분기 |
|---|---|---|
| `WorklogTab` 로드·더 보기 | `getIssueWorklogs({issueId, offset})` | `canEdit`/`canDelete` 로 버튼, `lock.locked` 면 잠금 배지 + `worklog.lock.reason.<code>` 툴팁 |
| `WorklogTab` 편집 | `new Modal({resource:'main/worklog', context:{mode:'edit', issueId, worklogId}})` → 닫히면 재조회 | — |
| `WorklogTab` 삭제 | `deleteWorklog` | `WORKLOG_PERIOD_LOCKED` → 사유 문구 + 재조회 |
| `WorklogDialog` 열기 | `getWorklogEditorContext({issueId, worklogId?})` | `WORKLOG_NOT_OWNER`·`WORKLOG_NOT_FOUND` → 에러 화면 |
| `WorklogDialog` 저장 | `createWorklog`/`updateWorklog` | 입력 중 `lockRanges` 로 사전 경고(저장 버튼 비활성). 서버 `WORKLOG_PERIOD_LOCKED` 는 `cause.reasonCode` 로 문구, `WORKLOG_INVALID_INPUT` 은 `cause.field` 칸에 표시 |
| 설정 > 기간 마감 | `listPeriodCloses` / `closePeriod` / `reopenPeriod` | `CONCURRENT_MODIFICATION` → 재조회 안내 |
| 설정 > 타임시트 정책 | `get/saveApprovalSettings` | 2키 추가 |
| 내 타임시트 | `getMyTimesheet` | `close.closed` 배지, `closeDrift` 배너, `lock.locked` 안내 |
| 팀 매트릭스 | `getTeamTimesheetMatrix` | 헤더 마감 배지, 행 `closeDriftAt` 아이콘 |

## 3. 도메인 (순수 — `Date.now()`·`new Date()` 무인자 호출 금지, now·timeZone 인자)

### 3.1 `src/domain/timesheet/lock.js`

```js
export const LockReason = Object.freeze({
  PERIOD_CLOSED: 'PERIOD_CLOSED', PERIOD_SUBMITTED: 'PERIOD_SUBMITTED', PERIOD_APPROVED: 'PERIOD_APPROVED',
});
export const CloseState = Object.freeze({ CLOSED: 'CLOSED', REOPENED: 'REOPENED' });
export const SITE_SCOPE = 'SITE';

/** 기간 종료(end, 현지 자정) 후 days 번째 현지 자정. days<=0 이면 null. DST 안전 — localDateOf + zonedMidnight. */
autoCloseAtOf(periodEnd, { autoCloseDays, timeZone }) → number | null

/**
 * 마감 효력. row 는 approval_period_close 행(없으면 null).
 *   row.state CLOSED → closed(auto=row.autoClosed)
 *   row.state REOPENED → 열림(자동 마감도 다시 걸지 않는다)
 *   row 없음 → autoCloseAt 이 있고 now >= autoCloseAt 이면 closed(auto=true, closedAt=autoCloseAt)
 */
closeStateOf(row, { now, periodEnd, autoCloseDays, timeZone })
  → { closed, auto, closedAt: number|null, autoCloseAt: number|null, state: 'OPEN'|'CLOSED'|'REOPENED' }

/** now >= range.end. */
isPeriodEnded(range, now) → boolean

/**
 * 워크로그 쓰기 판정. times = [started, previousStarted?] (중복·null 제거, 둘 다 열려 있어야 허용).
 * closes: [{ periodKey, start, end, state, autoClosed, closedAt }]   — 사이트 마감 행(여러 단위가 섞여도 된다 — 범위로 본다)
 * submissions: [{ periodKey, start, end, status, driftDetectedAt }] — 본인 **기간별 최신 요청**(호출부가 pickLatest)
 * 판정 순서(시각마다): ① 그 시각을 덮는 마감 행 중 CLOSED 가 있으면 PERIOD_CLOSED
 *                       ② 그 시각을 덮는 마감 행이 하나도 없으면 정책 단위 기간(periodKeyOf)의 자동 마감 계산
 *                       ③ lockSubmitted 이고 덮는 최신 요청이 PENDING → PERIOD_SUBMITTED,
 *                          APPROVED && driftDetectedAt 없음 → PERIOD_APPROVED (Q16)
 * started 를 먼저 보고, 막히면 which='started'. 그다음 previousStarted.
 */
evaluateWorklogLock({ started, previousStarted, now, unit, timeZone, autoCloseDays, lockSubmitted, closes, submissions })
  → { allowed: true, reasonCode: null, periodKey: null, which: null }
  | { allowed: false, reasonCode: LockReason, periodKey: string, which: 'started'|'previousStarted' }

/** 화면 사전 판정용 잠긴 구간. recentKeys(정책 단위, 최신→과거) 각각의 자동 마감 계산 + 행 + 본인 잠금 요청. 겹치면 CLOSED 우선. */
lockRangesOf({ recentKeys, now, unit, timeZone, autoCloseDays, lockSubmitted, closes, submissions }) → LockRange[]

/** 이 기간 전체 기준 본인 잠금(getMyTimesheet.lock). */
periodLockOf({ periodKey, range, now, timeZone, autoCloseDays, lockSubmitted, closeRow, latest }) → { locked, reasonCode }

/**
 * 마감 후 변경인가 — 트리거·스윕의 change 하나.
 * change.current(생성·수정) 또는 storedStarted(삭제 — 역참조 스냅샷에서 얻은 값)가 마감 효력 구간 안이고,
 * changedAt(워크로그 updated, 없으면 feed updatedTime, 그것도 없으면 null) >= closedAt 이면 true.
 * changedAt 이 null 이면 false(오탐 금지 — 마감 전 변경을 마감 후로 잘못 플래그하지 않는다).
 */
isChangeAfterClose({ at, changedAt, closes, now, unit, timeZone, autoCloseDays }) → { afterClose: boolean, periodKey: string|null }

/** closeDrift 표시 여부 — 최신 요청 제출 이후에 감지된 것만. */
closeDriftVisible(closeDrift, latest) → boolean

/** 감사 id — deterministicEventId({ requestId:`periodClose:${scope}:${periodKey}`, eventType:action, actorKey:null, discriminator:String(rev) }) */
periodCloseAuditId({ scope, periodKey, action, rev }) → uuid string
```

테스트 케이스(`__test__/lock.test.js`):
1. 마감 행 CLOSED 구간의 started → `PERIOD_CLOSED`, 바로 다음 기간 시작 시각(경계 `end`) → 허용([start,end) 반열림).
2. 수정으로 열린 기간 → 마감 기간 이동: started 열림·previousStarted 마감 → 거부 `which:'previousStarted'`. 반대 방향도 거부 `which:'started'`.
3. 자동 마감: `autoCloseDays=5`, 월 2026-09(Asia/Seoul) → `autoCloseAt = 2026-10-06T00:00+09:00`. 그 1ms 전 허용, 그 시각 거부(`auto:true`).
4. 자동 마감 + 행 REOPENED → 허용. 행 CLOSED(수동, 자동 시각 이전) → 거부.
5. DST: `America/New_York`, 2026-03 월말 + 1일 → 현지 자정(오프셋 전환 반영).
6. 단위 혼재: 월 단위 마감 행(2026-09)이 있고 정책이 주 단위로 바뀐 뒤 2026-W38 의 시각 → 행 범위로 거부.
7. 제출 잠금: 최신 PENDING → `PERIOD_SUBMITTED`; APPROVED → `PERIOD_APPROVED`; APPROVED+drift → 허용; REJECTED·EXPIRED·CANCELLED → 허용; `lockSubmitted=false` → 마감만 본다.
8. 같은 기간에 이전 APPROVED + 최신 EXPIRED(재제출 만료) → 허용(최신만 본다 — 호출부 pickLatest 와 결합 테스트는 서비스에서).
9. `isChangeAfterClose`: changedAt < closedAt → false, ≥ → true, null → false, 마감 행 REOPENED → false.
10. `lockRangesOf`: 마감·제출 겹침 시 CLOSED 하나만, 오래된 순서 무관하게 start 내림차순.
11. `periodCloseAuditId` 같은 입력 → 같은 id, rev 다르면 다른 id.
12. 도메인 파일 grep: `Date.now(`·`new Date()` 0건(인자 있는 `new Date(ms)` 는 period.js 처럼 허용).

### 3.2 `src/domain/timesheet/worklogInput.js`

```js
export const WORKLOG_LIMITS = Object.freeze({ minSeconds: 60, maxSeconds: 86_400, commentMax: 4000 });

/** 입력 검증. started 유한 정수, seconds 60..86400 정수(60의 배수일 필요는 없다 — Jira 가 분 단위로 반올림하는지 P7), comment 문자열 ≤4000. */
validateWorklogInput({ started, timeSpentSeconds, comment }) → { ok: true, value } | { ok: false, field: 'started'|'timeSpentSeconds'|'comment' }

/** Jira 요청용 시각 — UTC 고정 '2026-10-01T00:00:00.000+0000'. 표시 타임존과 무관(epoch 가 같으면 같은 순간). */
formatJiraDateTime(epochMs) → string

/** 평문 → ADF doc(줄바꿈 = paragraph, 빈 문자열이면 undefined — comment 필드 생략). */
plainTextToAdf(text) → object | undefined

/** ADF → 평문. text 노드 이어붙임, paragraph/hardBreak 는 줄바꿈, mention 은 attrs.text, 그 밖 노드는 자식만. 4000자에서 자른다. */
adfToPlainText(adf) → string

/** Jira 워크로그 응답 → WorklogView 의 Jira 부분(잠금·권한 칸 제외). parseJiraDateTime 재사용. */
worklogFromJira(raw) → { worklogId, issueId, authorAccountId, authorDisplayName, authorAvatarUrl, started, timeSpentSeconds, comment, created, updated, visibilityRestricted }
```

테스트: 경계값(59/60/86400/86401초, 4000/4001자), ADF 왕복(여러 문단·hardBreak·mention·빈 문서), 손상 ADF(null·문자열) → `''`, `formatJiraDateTime` 이 `parseJiraDateTime` 와 왕복.

### 3.3 재사용(무변경)

`period.js`(`periodKeyOf`·`periodRange`·`parsePeriodKey`·`recentPeriodKeys`·`shiftPeriodKey`·`localDateOf`·`zonedMidnight`·`parseJiraDateTime`), `status.js`(`periodStatusOf`·`pickLatest`), `snapshot.js`(`decodeSnapshot` — 삭제된 워크로그의 started 찾기).

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/timesheet/lock.js, worklogInput.js (+ __test__)
src/resolver/worklog/
  WorklogController.js   registerWorklogController — guardedDefine 5
  WorklogService.js      입력 검증 → 현재 워크로그 조회(수정·삭제) → PeriodLockService → WorklogGateway
  WorklogGateway.js      Jira REST asUser 전용(asApp import 금지 — 테스트로 단언)
  __test__/
src/resolver/timesheet/
  PeriodLockService.js   정책·마감 행·본인 최신 요청을 모아 도메인 판정. Worklog·Timesheet·Drift 공용
  PeriodCloseService.js  list/close/reopen + autoCloseDue(스윕)
  PeriodCloseRepository.js
  CloseDriftRepository.js
  TimesheetController.js (+ listPeriodCloses·closePeriod·reopenPeriod)
  TimesheetDriftService.js (+ 마감 후 변경 경로)
  TimesheetRepository.js (+ findLatestCovering)
  WorklogCollector.js (currentOf 에 updated, listChangedSince 에 updatedTime 맵)
src/trigger/runTimesheetSweep.js (자동 마감 기록 → 감지)
```

`src/index.js` `CONTROLLER_REGISTRARS` 에 `registerWorklogController` 추가. PermissionMap 에 8개 추가(§2.1 축 그대로).

### 4.2 `PeriodLockService`

```js
async loadFor(accountId, times, { now, policy }) → { closes, submissions, unit, timeZone, autoCloseDays, lockSubmitted }
async evaluate(accountId, { started, previousStarted, now, policy }) → evaluateWorklogLock 결과
async rangesFor(accountId, { now, policy }) → LockRange[]
```
- 정책은 `settingsRepository.getPolicy()` 1회(호출부가 이미 읽었으면 넘긴다).
- 마감 행: `PeriodCloseRepository.findCovering('SITE', minT, maxT)` — `period_start <= maxT AND period_end > minT`. 테이블 미준비면 `[]`(자동 마감 계산은 그대로 효력 — 정책만으로 판정 가능).
- 본인 요청: `TimesheetRepository.findLatestCovering(accountId, minT, maxT)` — 부속 행 범위로 겹치는 LIVE 요청 전부 → **target_key 별 `pickLatest`**. 미준비면 `[]`.
- **판정 실패(SQL 예외)는 쓰기 거부**(fail-close): `STORAGE_NOT_READY` 가 아니라 예외 전파 → `UNKNOWN_ERROR`. 잠금 판정 없이 쓰는 경로를 만들지 않는다. 단 "테이블이 아직 없음"은 잠금 데이터가 없는 것이므로 열림.

### 4.3 `WorklogService`

| 메서드 | 순서 | Jira 호출(asUser) |
|---|---|---|
| `getIssueWorklogs` | 가드(mypermissions 1, 워크로그 키 동봉 §4.4) → `gateway.listIssueWorklogs(issueId)` 최대 1000건 → 정렬·쪽 → 본인 것은 `PeriodLockService` 판정, 남의 것은 마감만 | GET `issue/{id}/worklog?startAt&maxResults=1000` 보통 1회(최대 1회 — 1000 초과는 `truncated`) |
| `getWorklogEditorContext` | 가드 → (worklogId 있으면) `gateway.getWorklog` → 작성자 확인 → ranges | 0~1 + 이슈 키 `GET issue/{id}?fields=` 은 부르지 않는다(프론트 extension context 사용) |
| `createWorklog` | 가드 → `validateWorklogInput` → `evaluate({started})` → `gateway.create` | POST `issue/{id}/worklog?adjustEstimate=auto` 1 |
| `updateWorklog` | 가드 → 검증 → `gateway.getWorklog`(현재 started·작성자 — **클라이언트가 보낸 이전 값은 믿지 않는다**) → 작성자 ≠ principal 이면 `WORKLOG_NOT_OWNER` → `evaluate({started:new, previousStarted:current})` → `gateway.update` | GET 1 + PUT `…/worklog/{wid}?adjustEstimate=auto` 1 |
| `deleteWorklog` | 가드 → `gateway.getWorklog` → 작성자 → `evaluate({started:current})` → `gateway.delete` | GET 1 + DELETE `…?adjustEstimate=auto` 1 |

- `payload.issueId` 와 조회한 워크로그의 `issueId` 가 다르면 `WORKLOG_NOT_FOUND`(다른 이슈의 워크로그 id 를 섞어 보내 가드를 우회하는 경로 차단 — 가드는 payload issueId 만 본다).
- 판정과 쓰기 사이 경합(그 사이 관리자가 마감): 쓰기는 성공하고 트리거가 `changedAt >= closedAt` 이면 마감 후 변경으로 플래그한다. 의도된 결과다(우리 화면도 마감 순간 이후 쓰기는 감지 대상).
- PUT 본문: `{ started, timeSpentSeconds, comment? }` 만. `visibility` 는 보내지 않는다(기존 값 보존 기대 — P8).
- 쿼리스트링은 값별 보간(`route\`…?adjustEstimate=${'auto'}\``) — route 인코딩 함정.
- 응답은 Jira 응답 본문(생성·수정)을 `worklogFromJira` + 잠금 계산으로 돌려준다. 재조회 없음.
- `notifyUsers` 는 보내지 않는다(Jira 기본 true, P7).

### 4.4 권한 표시 — `JiraPermission.getIssueAccess` 확장

현재 `mypermissions?issueId=&permissions=BROWSE_PROJECTS,EDIT_ISSUES` 1회(memo). 같은 호출에 `WORK_ON_ISSUES,EDIT_OWN_WORKLOGS,DELETE_OWN_WORKLOGS` 를 붙여 `{view, edit, workOn, editOwnWorklog, deleteOwnWorklog}` 를 돌려준다(키 이름 P15). 가드(view)와 서비스(표시)가 같은 invocation 에서 **1회**. 기존 반환 키 `view`·`edit` 의미 무변경 — 기존 테스트 통과.

`permissions` 는 **표시용**이다. 실제 거부는 Jira 응답(403)으로 한다 — mypermissions 가 틀려도 보안 영향 없음.

### 4.5 가드 메타 `appAccess:false`

`permissionGuard.guard`: `if (!meta.admin && meta.appAccess !== false) await assertAppAccess(principal);`. PermissionMap 주석에 의미 추가. 계약 테스트: `appAccess` 가 있으면 `false` 이고 `meta.issue` 가 있어야 한다.

### 4.6 `PeriodCloseService` / Repository (CAS)

| 동작 | SQL(요지) | CAS |
|---|---|---|
| close, 행 없음(`rev:null`) | `INSERT IGNORE INTO approval_period_close (scope_key, period_key, period_unit, time_zone, period_start, period_end, state, auto_closed, closed_at, closed_by, rev, updated_at) VALUES ('SITE', ?, ?, ?, ?, ?, 'CLOSED', 0, ?, ?, 1, ?)` | rowsAffected 0 → `CONCURRENT_MODIFICATION` |
| close, 행 있음 | `UPDATE … SET state='CLOSED', auto_closed=0, closed_at=?, closed_by=?, rev = rev + 1, updated_at=? WHERE scope_key='SITE' AND period_key=? AND rev=? AND state='REOPENED'` | 0 → 재조회: CLOSED 면 `PERIOD_ALREADY_CLOSED`, 아니면 `CONCURRENT_MODIFICATION` |
| reopen, 행 있음 | `UPDATE … SET state='REOPENED', reopened_at=?, reopened_by=?, rev = rev + 1 … WHERE … AND rev=? AND state='CLOSED'` | 0 → REOPENED 면 `PERIOD_NOT_CLOSED`, 아니면 `CONCURRENT_MODIFICATION` |
| reopen, 행 없음(계산상 자동 마감) | `closeStateOf` 가 closed 가 아니면 `PERIOD_NOT_CLOSED`. 맞으면 `INSERT IGNORE … state='REOPENED', auto_closed=1, closed_at=autoCloseAt, closed_by=NULL, reopened_at=?, reopened_by=?, rev=1` | 0 → `CONCURRENT_MODIFICATION` |
| 자동 마감 기록(스윕) | 정책 `autoCloseDays>0` 일 때 현재 기간부터 과거 24기간 중 `autoCloseAt <= now` 이고 행 없는 것: `INSERT IGNORE … state='CLOSED', auto_closed=1, closed_at=<autoCloseAt>, closed_by=NULL, rev=1` | 멱등(INSERT IGNORE). 1행이면 감사 `autoClose` |

- **`closed_at` 은 자동 마감이면 계산된 `autoCloseAt`** 이다(기록 시각이 아님). 그래야 스윕이 늦게 기록해도 `isChangeAfterClose` 기준이 흔들리지 않는다.
- 감사: `SettingsAuditRepository.record({ auditId: periodCloseAuditId({scope:'SITE', periodKey, action, rev:<변경 후 rev>}), actorKey, area:'periodClose', action, detail:{scope:'SITE', periodKey, rev} })`. `record` 는 `auditId` 가 오면 그 값을, `INSERT IGNORE` 로 쓴다(재시도 중복 1건 — 불변식 6). 기록 실패는 여전히 던지지 않는다.
- `period_start/end`·`time_zone`·`period_unit` 은 마감 시점 값으로 고정(정책이 바뀌어도 그 마감의 범위가 흔들리지 않게 — timesheet_submission 과 같은 원칙).
- `closePeriod` 검증: `parsePeriodKey` 실패·정책 단위와 다름 → `TIMESHEET_PERIOD_INVALID`; `now < end` → `PERIOD_NOT_ENDED`(Q25).
- `listPeriodCloses`: 정책 단위 키 `count` 개 → 행 `WHERE scope_key='SITE' AND period_key IN (…)` 1회(빈 배열 가드) → `closeStateOf` → close drift 수 `SELECT period_key, COUNT(*) … GROUP BY period_key` 1회 → 표시 이름 `loadUsers`(user/bulk asUser) 1회.
- 마감·재개방 시 알림 없음(정해진 수신자가 없다 — 범위 밖).

### 4.7 마감 후 변경 감지 — `TimesheetDriftService` 확장

기존 두 경로(PENDING 만료·APPROVED 감지)는 **무변경**. `applyChanges` 끝에 세 번째 경로를 붙인다.

```
closeCandidates = changes 중
   - current 있음(생성·수정): at = current.started, changedAt = current.updated ?? change.updatedTime ?? (트리거면 now) , author = current.authorId
   - current 없음(삭제·조회 불가): 역참조(timesheet_worklog_ref)로 찾은 부속 행 스냅샷의 started(상태 무관 조회), changedAt = change.updatedTime ?? (트리거면 now)
       역참조가 없으면(한 번도 제출되지 않은 기간의 삭제) 판정 불가 → 건너뜀 (한계 L1)
 → isChangeAfterClose(...) 가 true 이고
 → 그 (author, 기간)의 최신 요청이 PENDING 또는 APPROVED(감지 전)가 **아니면**(그 둘은 기존 경로가 이미 처리)
 → CloseDriftRepository.upsert({scope:'SITE', subject, periodKey, now, kind, worklogId})
```

- 수정의 "이전 started" 는 스냅샷에 있을 때만 안다(제출된 기간). 미제출 마감 기간 밖으로 옮긴 수정은 감지 못 한다(한계 L2).
- `kind`: 생성 `CREATED`, 수정 `UPDATED`, 삭제 `DELETED`.
- `upsert`: `INSERT … ON DUPLICATE KEY UPDATE last_detected_at = VALUES(last_detected_at), last_kind = VALUES(last_kind), last_worklog_id = VALUES(last_worklog_id), rev = rev + 1`. 재시도해도 같은 키 1행(affectedRows 1/2 를 판정에 쓰지 않는다). 알림 없음(Q24).
- 우리 화면의 정상 쓰기: 열린 기간이라 ① 기존 후보 쿼리(PENDING/APPROVED 만)에 안 걸리고 ② 마감 구간이 아니므로 close drift 도 아니다 → **오탐 없음**. 잠긴 기간에는 우리 화면이 쓰지 않는다. (요구 5 확인: 제출 전 기간은 원래 drift 대상이 아니다 — `findCandidatesBy*` 의 `status IN ('PENDING','APPROVED')` 조건.)
- 게이트: `handleEvent` 의 `hasAnySubmission()` 단락을 `hasAnySubmission() || closeRepo.hasAnyClosed()` 로 넓힌다. 둘 다 없으면 asApp 0회(기존 절약 유지). 자동 마감은 스윕이 행으로 기록한 뒤부터 트리거가 본다 — 기록 전 공백(최대 1시간)의 변경은 같은 회차 스윕의 `worklog/updated` 처리가 잡는다(아래 순서).
- `runTimesheetSweep` 순서: **① `periodCloseService.recordAutoCloses(now)` → ② `timesheetDriftService.sweep()`**. ①은 throw 하지 않는다(실패는 로그, 감지는 계속).
- 스윕의 `applied.failed` 정지 규칙(F1)은 close drift 실패도 `failed` 로 센다.
- `WorklogCollector.currentOf` 에 `updated: parseJiraDateTime(worklog?.updated)`, `listChangedSince` 반환에 `updatedTimes: Map<worklogId, number>`(`values[].updatedTime` — 형태 P12) 추가. asApp 결과는 여전히 대조에만 쓴다.

### 4.8 `TimesheetService` 변경

- `getMyTimesheet`: 정책·기간 계산 뒤 `closeRepo.findByKeys('SITE', [periodKey, ...periods 6개])` 1회 + `closeDriftRepo.find('SITE', accountId, periodKey)` 1회 → `close`, `closeDrift`(`closeDriftVisible`), `lock`(`periodLockOf`), `periods[].closed`.
- `getTeamTimesheetMatrix`: 마감 행 1회 + `closeDriftRepo.listFor('SITE', periodKey, accountIds)` 1회(빈 배열 가드, 행 범위는 기존 `TeamScope.membersOf` 결과 그대로 — 불변식 7) → `rows[].closeDriftAt`(최신 요청 기준 `closeDriftVisible` 적용), `summary.closeDrift`.

### 4.9 정책 키 (`SettingsRepository` 세 곳 동시 + `SettingsService` 검증)

| 키 | 기본 | KVS 키 | 검증 |
|---|---|---|---|
| `timesheetAutoCloseDays` | `0` | `approval:settings:timesheetAutoCloseDays` | 정수 0..90 |
| `timesheetLockSubmitted` | `true` | `approval:settings:timesheetLockSubmitted` | boolean |

`GLOBAL_ONLY_KEYS` 에 둘 다. `SettingsPolicyKeys.test.js` 대조 통과 필수(기본값 ↔ KVS 맵 동일 집합 — 플랫폼 함정).

### 4.10 불변식 대조

| # | 이 기능의 지점 |
|---|---|
| 1 열린 요청 하나 | 새 승인 요청 없음. 마감 행은 `PRIMARY KEY(scope_key, period_key)` 로 기간당 하나, close drift 는 `(scope_key, subject_account, period_key)` 하나 |
| 2 결정이 진실 | 잠금의 제출·승인 판정은 `approval_request` 최신 + `periodStatusOf` 파생(캐시 칸 없음). 마감은 결정이 아니라 관리 상태라 행 자체가 원천 |
| 3 now 주입 | `lock.js`·`worklogInput.js` 모두 now·timeZone 인자. 서비스 `clock()` 호출당 1회. 자동 마감 시각은 정책 타임존 현지 자정 |
| 4 CAS rev | `approval_period_close` 모든 UPDATE `rev = rev + 1 … WHERE rev=?`, close drift upsert `rev = rev + 1` |
| 5 승인자 행 | 건드리지 않음 |
| 6 결정적 감사 id | `periodCloseAuditId(scope, periodKey, action, rev)` + `INSERT IGNORE`. 감지 이벤트는 기존 결정적 id 그대로 |
| 7 범위 | 워크로그 목록은 asUser `issue/{id}/worklog` 라 Jira 가 이미 호출자 가시성으로 거른 결과다(이슈 열람 가드 + 워크로그 visibility). 남의 행에는 제출 상태를 내보내지 않는다(마감만). 매트릭스 close drift 는 `TeamScope.membersOf` 결과로만 조회. `listPeriodCloses` 의 `closeDriftCount` 는 수만(누구인지 없음) |
| 8 asUser | 워크로그 조회·쓰기 전부 `WorklogGateway`(asUser 전용, asApp import 시 테스트 실패). asApp 은 기존 트리거·스윕 조회만(AGENTS 허용 1번) — 목록 추가 없음 |
| 9 프로퍼티 불신 | 잠금 판정 원천은 우리 SQL(마감 행·요청 행)과 KVS 정책뿐. 엔티티 프로퍼티 읽기·쓰기 0 |
| 10 validator | 해당 없음 |

## 5. 스키마·마이그레이션

`src/rdb/schema/ddl/periodLock.sql.js` 신규 → `ddl/index.js` re-export → `migrate.js` 뒤에만 append(기존 이름 무변경):

```
.enqueue('v022_create_approval_period_close_table', CREATE_APPROVAL_PERIOD_CLOSE_TABLE)
.enqueue('v023_create_timesheet_close_drift_table', CREATE_TIMESHEET_CLOSE_DRIFT_TABLE)
```

```sql
CREATE TABLE IF NOT EXISTS approval_period_close (
    scope_key      VARCHAR(64)  NOT NULL,          -- 'SITE' (Q17 — 'TEAM:<key>'·'PROJECT:<id>' 는 예약)
    period_key     VARCHAR(16)  NOT NULL,
    period_unit    VARCHAR(8)   NOT NULL,
    time_zone      VARCHAR(64)  NOT NULL,
    period_start   TIMESTAMP    NOT NULL,
    period_end     TIMESTAMP    NOT NULL,
    state          VARCHAR(12)  NOT NULL,          -- CLOSED | REOPENED
    auto_closed    TINYINT(1)   NOT NULL DEFAULT 0,
    closed_at      TIMESTAMP    NULL,              -- 자동 마감은 계산된 autoCloseAt
    closed_by      VARCHAR(128) NULL,              -- 자동 마감 NULL
    reopened_at    TIMESTAMP    NULL,
    reopened_by    VARCHAR(128) NULL,
    rev            INT          NOT NULL DEFAULT 1,
    updated_at     TIMESTAMP    NOT NULL,
    PRIMARY KEY (scope_key, period_key),
    INDEX ix_period_close_range (scope_key, period_start, period_end)
)

CREATE TABLE IF NOT EXISTS timesheet_close_drift (
    scope_key         VARCHAR(64)  NOT NULL,
    subject_account   VARCHAR(128) NOT NULL,
    period_key        VARCHAR(16)  NOT NULL,       -- 마감 행의 period_key
    first_detected_at TIMESTAMP    NOT NULL,
    last_detected_at  TIMESTAMP    NOT NULL,
    last_kind         VARCHAR(16)  NOT NULL,       -- CREATED | UPDATED | DELETED
    last_worklog_id   VARCHAR(20)  NULL,
    rev               INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (scope_key, subject_account, period_key),
    INDEX ix_close_drift_period (scope_key, period_key)
)
```

- 시각 바인딩은 `SqlTime.toSqlTimestamp`(TIMESTAMP 숫자 바인딩 불가 — 플랫폼 함정).
- 프로브: `PeriodCloseRepository.ready()`(`approval_period_close`), `CloseDriftRepository.ready()`(`timesheet_close_drift`). 미준비면 읽기는 빈 결과(마감 없음), 쓰기(`closePeriod`·`reopenPeriod`)는 `STORAGE_NOT_READY`, 감지·자동 마감 기록은 건너뜀.
- 보관 정리(`RetentionRepository`) 대상 아님(행 수가 작다 — §9). `StorageService` 는 `information_schema` 전체라 자동 표시(D8).
- 새 테이블 = SQL 추가지만 `sql` 모듈은 이미 있다 → major 여부는 scope 추가(`write:jira-work`) 쪽이 정한다(배포 회차 `--upgrade` 필수).
- `ON DUPLICATE KEY UPDATE … VALUES()` 는 T15 와 같은 미검증(이미 `upsertWorklogRefs` 가 쓴다).

## 6. Jira 연결

### 6.1 manifest 추가 (근거 표기)

```yaml
modules:
  # 2층 — 관리자가 Jira 관리 > 시스템 > 시간 추적에서 이 제공자를 고르면 기본 Log work 버튼·작업 로그 탭이 숨는다.
  jira:timeTrackingProvider:
    - key: moves-time-tracking
      name: Moves Approval              # 필수(문서). 관리 화면 선택 목록에 보이는 이름
      adminPage: approval-settings      # 선택(문서) — 기존 adminPage 재사용. useAsConfig 는 넣지 않는다(P5)

  jira:issueAction:
    - key: worklog-log-action
      title: Log work                   # i18n 객체 { i18n: worklog.manifest.logWork } 로 바꿀 수 있는지 P11
      resource: main/worklog
      resolver:
        function: resolver
      viewportSize: medium
      displayConditions:
        timeTrackingProviderEnabled:
          key: moves-time-tracking      # 문서 예시 형태(issuePanel 예). issueAction 지원 여부 P3

  jira:issueActivity:
    - key: worklog-activity-tab
      title: Work log                   # 탭 이름(문서: title = 탭 항목). i18n P11
      resource: main/worklog
      resolver:
        function: resolver
      displayConditions:
        timeTrackingProviderEnabled:
          key: moves-time-tracking

resources:
  - key: main
    path: static/ui/build
    entry:
      ...기존 4개
      worklog: worklog.html

permissions:
  scopes:
    - write:jira-work                   # 워크로그 POST/PUT/DELETE(asUser). P7
```

출처:
- `jira:timeTrackingProvider` — 속성 `key`(필수)·`name`(필수)·`adminPage`(선택), Preview, 기본 "Log work" 버튼·Work log 탭 숨김 → `jira:issueAction`·`jira:issueActivity` 로 대체, 시간 추적 필드의 Log work 동작 비활성(남은 시간 표시): https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/ (2026-10-03 확인, **문서**)
- display condition `timeTrackingProviderEnabled`(String, "주어진 key 의 제공자를 쓰는가")·`jiraTimeTrackingProviderEnabled`(boolean, Jira 기본 제공자): https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/jira/ (**문서**. 단 그 문서의 지원 모듈 목록에서 issueAction·issueActivity 를 확인하지 못했다 → **P3**)
- `jira:issueAction` — `key`·`title`·`resource`·`resolver`·`viewportSize`·`displayConditions`, ••• 메뉴 항목 → 모달 대화상자, `view.close`: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-action/ (**문서**)
- `jira:issueActivity` — `key`·`title`(탭 항목)·`resource`·`resolver`·`viewportSize`·`displayConditions`, 새 이슈 화면 전용, extension context `issue.id/key`·`project.id/key`: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-activity/ (**문서**)
- 사이트당 제공자 하나(Tempo 공존 불가): CLAUDE.md "공식 문서로 확인" 표(**문서**)
- REST·자동화·모바일·가져오기 경로 차단 여부: 문서에 없음 → **P1·P2**

제공자 **미선택** 사이트: 두 모듈이 displayConditions 로 숨어 Jira 기본 Log work 가 그대로 동작한다. 잠금(2층)은 없고 3층(감지)만 동작한다. P3 이 실패하면(조건 미지원) 미선택 사이트에도 우리 메뉴·탭이 **추가로** 보인다 — 기능상 해는 없으나(우리 화면도 같은 판정) 중복 UI. 대안: 프론트가 `getWorklogEditorContext` 의 provider 판정 없이 그대로 동작하게 두고 안내만 추가.

### 6.2 REST 목록

| 경로 | 주체 | 용도 | 근거 |
|---|---|---|---|
| `GET /rest/api/3/mypermissions?issueId=&permissions=…` | asUser | 가드 + 워크로그 권한 표시(1회 memo) | 기존 |
| `GET /rest/api/3/issue/{id}/worklog?startAt=&maxResults=` | asUser | 탭 목록 | 기존(WorklogCollector) |
| `GET /rest/api/3/issue/{id}/worklog/{wid}` | asUser | 수정·삭제 전 현재 값·작성자 | 문서(실측 전) |
| `POST /rest/api/3/issue/{id}/worklog?adjustEstimate=auto` | asUser | 생성 | 문서, P7 |
| `PUT /rest/api/3/issue/{id}/worklog/{wid}?adjustEstimate=auto` | asUser | 수정 | 문서, P7·P8 |
| `DELETE /rest/api/3/issue/{id}/worklog/{wid}?adjustEstimate=auto` | asUser | 삭제 | 문서, P7 |
| `POST /rest/api/3/worklog/list`, `GET worklog/updated|deleted?since=` | asApp | 감지(기존, 사유 `timesheet-drift-*`) | 기존 |
| `POST /rest/api/3/user/bulk` | asUser | 마감 목록 표시 이름 | 기존(loadUsers) |

asApp 허용 목록(AGENTS.md) 변경 없음.

## 7. 프론트

### 7.1 엔트리 — `worklog` 신규 (3곳 동시)

1. `static/ui/craco.config.js` `ENTRIES.worklog = 'entries/worklog.jsx'`
2. `static/ui/public/worklog.html`(기존 html 복제, 제목만)
3. `manifest.yml` `resources[main].entry.worklog: worklog.html`

`entries/worklog.jsx`: `view.getContext()` 로 분기 —
- `extension.type === 'jira:issueActivity'` → `<WorklogTab issueId projectId />`
- `extension.type === 'jira:issueAction'` → `<WorklogDialog mode="create" issueId onDone={view.close} />`
- 그 밖(우리 `Modal` 로 연 경우 `extension.modal` 또는 context 값 — 위치는 bridge 버전에 따라 갈린다, `entries/modal.jsx` 의 판독 함수 재사용) → `mode: 'create'|'edit'`, `worklogId`

lazy 청크는 `importWithReloadOnce`. 모달 높이는 내용이 정한다(100vh 금지).

### 7.2 화면 트리

```
features/worklog/
  WorklogTab.jsx            목록(DynamicTable 재사용 components/table), [Log work] 버튼(permissions.canLog), 더 보기
    WorklogRow.jsx          작성자(PersonAvatar), started(브라우저 로케일·정책 타임존 병기), 시간, 설명, 잠금 배지(LockBadge), [수정][삭제]
    DeleteConfirm.jsx       Atlaskit ModalDialog — 탭 iframe 이 작아 잘리면 Forge Modal 로(P9)
  WorklogDialog.jsx         시간(“1h 30m” 파서), 시작 날짜·시각(DatePicker+TimePicker), 설명(TextArea ≤4000), 기간 표시(periodKey), 잠금 경고
    durationInput.js        '1w 2d 3h 4m' ↔ 초 (Jira 기본 1d=8h·1w=5d 가정 — 사이트 설정과 다를 수 있다 P17, 표시만)
    lockPrecheck.js         lockRanges 로 started·previousStarted 판정(서버 도메인과 같은 반열림 규칙)
  LockBadge.jsx             reasonCode → worklog.lock.reason.<code>
features/settings/
  PeriodCloseSettings.jsx   기간 목록(상태 배지, 마감/재개방 버튼, 자동 마감 예정 시각, 마감 후 변경 수), 더 보기
  TimeTrackingProviderGuide.jsx  선택 방법·Tempo 공존 불가·미선택 시 2층 없음·라이선스 만료 고지(Q23)·수용 기준 문장
  TimesheetPolicySettings.jsx  + 자동 마감 일수, 제출·승인 기간 잠금 토글
  TimesheetSettings.jsx     Stack 에 Guide·PeriodCloseSettings 추가(정책 → 제공자 안내 → 기간 마감 → 팀)
features/timesheet/
  MyTimesheetPage.jsx       마감 배지(close.closed/auto), closeDrift 배너, lock 안내("제출됨 — 회수하면 수정할 수 있습니다")
  PeriodPicker.jsx          periods[].closed 자물쇠 아이콘
  TeamMatrixTable.jsx       헤더 마감 배지, 행 closeDriftAt 아이콘·툴팁
  matrixRows.js / exportTeamTimesheetExcel.js  "마감 후 변경" 열(값 있으면 일시)
  timesheet.notice.acceptance 문구 교체(§8.2)
```

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const worklogKeys = {
  all: ['worklog'],
  issue: (issueId, offset) => [...worklogKeys.all, 'issue', String(issueId), offset ?? 0],
  editor: (issueId, worklogId) => [...worklogKeys.all, 'editor', String(issueId), worklogId ?? '-'],
};
settingsKeys.periodCloses = (beforePeriodKey, count) => [...settingsKeys.all, 'periodCloses', beforePeriodKey ?? '-', count ?? 12];
```
쓰기 성공 후 `worklogKeys.all` 무효화. 마감·재개방 후 `settingsKeys.periodCloses` 접두와 `timesheetKeys.all`(같은 iframe 이 아니면 효과 없음 — 업무함은 재방문 시 갱신). issueAction 대화상자에서 만든 워크로그는 탭 iframe 캐시를 지우지 못한다 → 탭은 `refetchOnWindowFocus` + 새로고침 버튼(P10).

### 7.4 재사용

`PersonAvatar`, `components/table`, `invokeApproval`(error.code 분기), `PeriodStatusBadge`, `timesheetFormat.periodRangeLabel`, `importWithReloadOnce`, `useI18nStore`.

## 8. i18n 키 (kr / en) — `npm run merge` 필수

### 8.1 신규 `locales/{kr,en}/worklog.json`

| 키 | kr | en |
|---|---|---|
| `manifest.logWork` | 작업 시간 기록 | Log work |
| `manifest.tab` | 작업 로그 | Work log |
| `tab.title` | 작업 로그 | Work log |
| `tab.logWork` | 작업 시간 기록 | Log work |
| `tab.empty` | 아직 기록된 작업 시간이 없습니다. | No work has been logged yet. |
| `tab.loadMore` | 더 보기 | Load more |
| `tab.truncated` | 최근 1,000건만 표시합니다. | Showing the latest 1,000 entries only. |
| `tab.refresh` | 새로고침 | Refresh |
| `tab.edit` | 수정 | Edit |
| `tab.delete` | 삭제 | Delete |
| `tab.restricted` | 공개 범위 제한 | Restricted visibility |
| `column.author` | 작성자 | Author |
| `column.started` | 시작 | Started |
| `column.timeSpent` | 소요 시간 | Time spent |
| `column.comment` | 설명 | Description |
| `dialog.createTitle` | 작업 시간 기록 | Log work |
| `dialog.editTitle` | 작업 로그 수정 | Edit work log |
| `dialog.timeSpent` | 소요 시간 | Time spent |
| `dialog.timeSpentHint` | 예: 3h 30m (1d = 8h) | e.g. 3h 30m (1d = 8h) |
| `dialog.started` | 시작 일시 | Date started |
| `dialog.comment` | 설명 | Description |
| `dialog.period` | 기간 {period} | Period {period} |
| `dialog.save` | 저장 | Save |
| `dialog.cancel` | 취소 | Cancel |
| `dialog.saved` | 저장했습니다. | Saved. |
| `delete.title` | 작업 로그를 삭제할까요? | Delete this work log? |
| `delete.body` | 삭제하면 되돌릴 수 없습니다. | This cannot be undone. |
| `delete.confirm` | 삭제 | Delete |
| `invalid.timeSpentSeconds` | 1분 이상 24시간 이하로 입력하세요. | Enter between 1 minute and 24 hours. |
| `invalid.started` | 시작 일시를 확인하세요. | Check the start date and time. |
| `invalid.comment` | 설명은 4,000자까지 쓸 수 있습니다. | The description can be up to 4,000 characters. |
| `lock.badge` | 잠김 | Locked |
| `lock.reason.PERIOD_CLOSED` | {period} 기간이 마감되어 입력·수정할 수 없습니다. | The {period} period is closed and can't be changed. |
| `lock.reason.PERIOD_SUBMITTED` | {period} 타임시트가 결재 중입니다. 회수하면 수정할 수 있습니다. | Your {period} timesheet is awaiting approval. Withdraw it to make changes. |
| `lock.reason.PERIOD_APPROVED` | {period} 타임시트가 승인되어 수정할 수 없습니다. | Your {period} timesheet is approved and can't be changed. |
| `lock.movedFrom` | 원래 기간도 열려 있어야 옮길 수 있습니다. | The original period must also be open to move this entry. |
| `noPermission` | 이 이슈에 작업 시간을 기록할 권한이 없습니다. | You don't have permission to log work on this issue. |

### 8.2 기존 네임스페이스 추가·변경

| 키 | kr | en |
|---|---|---|
| `timesheet.close.closed` | 마감됨 | Closed |
| `timesheet.close.autoClosed` | 자동 마감됨 | Auto-closed |
| `timesheet.close.autoCloseAt` | {date} 자동 마감 | Auto-closes on {date} |
| `timesheet.close.drift` | 마감 후 변경됨 | Changed after close |
| `timesheet.close.driftBody` | 마감 뒤 Jira 화면 밖(REST·자동화·모바일 등)에서 작업 로그가 바뀌었습니다({date}). | A work log was changed outside the Jira screens (REST, automation, mobile, etc.) after the period closed ({date}). |
| `timesheet.close.lockedHint` | 이 기간은 잠겨 있어 작업 로그를 추가·수정할 수 없습니다. | This period is locked; work logs can't be added or changed. |
| `timesheet.close.column` | 마감 후 변경 | Changed after close |
| `timesheet.notice.acceptance`(**변경**) | 기간 잠금은 이 앱이 Jira 시간 추적 제공자로 선택된 사이트에서 Jira 화면의 입력만 막습니다. REST·자동화·모바일 등 다른 경로의 변경은 막지 못하며, 감지해 다시 승인받게 합니다. | Period locking only blocks entries made in Jira screens on sites where this app is the selected time tracking provider. Changes made through other paths (REST, automation, mobile, etc.) are not blocked; they are detected and require re-approval. |
| `timesheet.settings.autoCloseDays` | 기간 종료 후 자동 마감(일, 0 = 끔) | Auto-close after period end (days, 0 = off) |
| `timesheet.settings.lockSubmitted` | 제출·승인된 기간의 작업 로그 입력 잠금 | Lock work logs in submitted and approved periods |
| `timesheet.periodClose.title` | 기간 마감 | Period close |
| `timesheet.periodClose.hint` | 마감된 기간은 이 앱 화면에서 작업 로그를 추가·수정·삭제할 수 없습니다. 제출·결재는 계속할 수 있습니다. | Closed periods can't have work logs added, edited, or deleted from this app. Submission and approval still work. |
| `timesheet.periodClose.state.OPEN` | 열림 | Open |
| `timesheet.periodClose.state.CLOSED` | 마감 | Closed |
| `timesheet.periodClose.state.REOPENED` | 재개방 | Reopened |
| `timesheet.periodClose.close` | 마감 | Close |
| `timesheet.periodClose.reopen` | 재개방 | Reopen |
| `timesheet.periodClose.reopenConfirm` | {period} 기간을 다시 엽니다. 승인 상태는 유지되고, 이후 변경은 다시 승인받아야 합니다. | Reopen {period}? Approval status is kept, and later changes will need re-approval. |
| `timesheet.periodClose.notEnded` | 아직 끝나지 않은 기간 | Period not ended yet |
| `timesheet.periodClose.closedBy` | {name} · {date} | {name} · {date} |
| `timesheet.periodClose.auto` | 자동 | Automatic |
| `timesheet.periodClose.driftCount` | 마감 후 변경 {count}명 | {count} changed after close |
| `timesheet.provider.title` | 시간 추적 제공자 | Time tracking provider |
| `timesheet.provider.how` | Jira 설정 > 시스템 > 시간 추적에서 "Moves Approval"을 제공자로 선택하세요. 선택하면 Jira 기본 "작업 시간 기록" 버튼과 작업 로그 탭이 이 앱 화면으로 바뀝니다. | In Jira settings > System > Time tracking, select "Moves Approval" as the provider. Jira's built-in "Log work" button and Work log tab are then replaced by this app. |
| `timesheet.provider.tempo` | 제공자는 사이트당 하나입니다. Tempo 등 다른 앱을 제공자로 쓰고 있다면 함께 쓸 수 없습니다. | Only one provider can be active per site. It can't be used alongside another provider such as Tempo. |
| `timesheet.provider.notSelected` | 제공자로 선택하지 않으면 입력 잠금은 동작하지 않고, 변경 감지·재승인만 동작합니다. | If this app isn't the selected provider, input locking is off and only change detection and re-approval work. |
| `timesheet.provider.license` | 라이선스가 만료되면 작업 시간을 기록할 수 없게 됩니다. 만료 전에 제공자를 Jira 기본으로 되돌리세요. | If the license expires, work can't be logged. Switch the provider back to Jira before it expires. |
| `timesheet.provider.permission` | 미소속자의 입력을 막으려면 권한 스킴의 "Work on work items"를 프로젝트 역할에만 부여하세요. | To block people outside a project, grant "Work on work items" only to project roles in the permission scheme. |
| `policy.audit.area.periodClose` | 기간 마감 | Period close |
| `policy.audit.action.close` | 마감 | Close |
| `policy.audit.action.reopen` | 재개방 | Reopen |
| `policy.audit.action.autoClose` | 자동 마감 | Auto-close |
| `error.WORKLOG_PERIOD_LOCKED` | 잠긴 기간이라 작업 로그를 바꿀 수 없습니다. | This period is locked, so the work log can't be changed. |
| `error.WORKLOG_INVALID_INPUT` | 입력값을 확인하세요. | Check your input. |
| `error.WORKLOG_NOT_FOUND` | 작업 로그를 찾을 수 없습니다. 이미 삭제됐을 수 있습니다. | Work log not found. It may have been deleted. |
| `error.WORKLOG_NOT_OWNER` | 본인이 기록한 작업 로그만 수정·삭제할 수 있습니다. | You can only edit or delete your own work logs. |
| `error.WORKLOG_PERMISSION_DENIED` | Jira 권한이 없어 작업 로그를 기록·수정할 수 없습니다. | You don't have Jira permission to log or change work. |
| `error.WORKLOG_REJECTED_BY_JIRA` | Jira가 작업 로그를 거부했습니다. 시간 추적 설정을 확인하세요. | Jira rejected the work log. Check the time tracking settings. |
| `error.PERIOD_NOT_ENDED` | 끝나지 않은 기간은 마감할 수 없습니다. | A period can't be closed before it ends. |
| `error.PERIOD_ALREADY_CLOSED` | 이미 마감된 기간입니다. | This period is already closed. |
| `error.PERIOD_NOT_CLOSED` | 마감되지 않은 기간입니다. | This period isn't closed. |

`policy.audit.area.timesheetTeam` 이 kr 에 없는 것으로 보인다(이번 회차 grep) — frontend 가 확인하고 없으면 함께 추가.

## 9. 용량·호출량

### 9.1 용량 (200명, 월 단위, 인덱스 포함 ×2, 실측 전)

| 테이블 | 연 행 수 | 행 크기 | 연 용량 |
|---|---|---|---|
| `approval_period_close` | 12(월) / 52(주) | ~300B | < 50KB |
| `timesheet_close_drift` | 최악 200명 × 12 = 2,400 (보통 수십) | ~250B | < 1.2MB |
| `approval_settings_audit` 추가분 | 마감·재개방·자동 마감 ~30 | ~400B | 무시 |

기존 예산(연 ~110MB) 대비 무시할 수준. 보관 정리 대상에 넣지 않는다.

### 9.2 resolver 1회당 Jira 호출

| resolver | 호출 | 비고 |
|---|---|---|
| `getIssueWorklogs` | mypermissions 1 + worklog 목록 1 = **2** | 1000건 초과 이슈는 잘라서 `truncated` |
| `getWorklogEditorContext` | 1(생성) / 2(편집) | |
| `createWorklog` | 1 + 1 = **2** | |
| `updateWorklog` / `deleteWorklog` | 1 + 1 + 1 = **3** | 현재 값 GET 은 우회 방지에 필수 |
| `listPeriodCloses` | user/bulk 1 | SQL 2 |
| `closePeriod` / `reopenPeriod` | 0 | SQL 2~3 + KVS(정책) |
| `getMyTimesheet` / `getTeamTimesheetMatrix` | +0 | SQL +2 |

SQL: 워크로그 쓰기당 SELECT 2(마감 행·본인 요청) + KVS 정책 읽기(키 32개 청크 5 → 7회 왕복). **정책 읽기가 가장 비싸다** — `WorklogService` 는 호출당 1회만 읽는다.

부하: 200명 × 하루 4건 × 22일 ≈ 17,600 쓰기/월 → Jira 호출 ~44,000/월(+ 각 쓰기의 트리거 asApp `worklog/list` 1회 = 17,600). 동시성 최대치(오후 6시 몰림, 200명이 1분 안에) ≈ 3.3 쓰기/초 × 3 호출 — Forge·Jira rate limit 아래로 본다(실측 전).

## 10. 미검증

`04_spike_todo.md` P1~P20. 설계를 바꿀 수 있는 것:
- **P1·P2**: 제공자 선택이 REST·자동화·모바일·가져오기를 막지 않을 것으로 **가정**한다(수용 기준 문장이 그 가정). 막는다면 문장을 강화할 수 있지만 3층 설계는 그대로 둔다.
- **P3**: issueAction·issueActivity 의 displayConditions 지원. 실패 시 미선택 사이트에 중복 UI.
- **P12**: `updated`·`updatedTime` 이 없으면 마감 후 변경은 트리거 시각으로만 판정된다(스윕 경로에서는 판정 불가 → 건너뜀, 한계).

한계(수용 기준 옆에 문서화):
- **L1** 한 번도 제출되지 않은 마감 기간의 **삭제**는 감지하지 못한다(삭제 피드는 id 만 주고, 그 워크로그를 기간에 연결할 스냅샷이 없다).
- **L2** 미제출 마감 기간에서 **밖으로 옮긴** 수정은 감지하지 못한다(이전 started 를 모른다).
- **L3** 감지 지연: 트리거(수 초) + 누락 시 시간당 스윕.
- **L4** 제공자 미선택 사이트에는 2층이 없다.

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] `src/domain/timesheet/lock.js` + 테스트(§3.1 1~12)
- [ ] `src/domain/timesheet/worklogInput.js` + 테스트(§3.2)
- [ ] `ErrorCodes` 9개 추가(§2.6)
- [ ] `ddl/periodLock.sql.js` + `ddl/index.js` re-export + `migrate.js` v022·v023 append(+ `migrate.test.js` 목록 단언)
- [ ] `PeriodCloseRepository`(ready·findByKeys·findCovering·insertClosed·close·reopen·insertReopened·insertAutoClosed·hasAnyClosed) — 모든 UPDATE `rev = rev + 1`, `whereIn` 빈 배열 가드
- [ ] `CloseDriftRepository`(ready·upsert·find·listFor·countByPeriods)
- [ ] `TimesheetRepository.findLatestCovering(accountId, minT, maxT)` + 역참조 상태 무관 조회(`findSubmissionsByWorklogIds`)
- [ ] `PeriodLockService`(§4.2) — 판정 SQL 예외는 전파(fail-close)
- [ ] `PeriodCloseService`(list·close·reopen·recordAutoCloses) + 감사 `periodCloseAuditId`
- [ ] `SettingsAuditRepository.record` 선택 `auditId` + `INSERT IGNORE`(기존 호출 무변경)
- [ ] `SettingsRepository` 정책 키 2개(기본값·KVS 키·GLOBAL_ONLY) + `SettingsService` 검증
- [ ] `JiraPermission.getIssueAccess` 워크로그 키 동봉(기존 view/edit 의미 유지)
- [ ] `permissionGuard` `appAccess:false` + `PermissionMap` 8개 + 계약 테스트 단언 추가
- [ ] `WorklogGateway`(asUser 전용 — asApp import 금지 테스트), 상태 코드 매핑(§2.6), `route` 값별 보간
- [ ] `WorklogService` 5 메서드(§4.3) — issueId 불일치 `WORKLOG_NOT_FOUND`, 이전 started 는 서버 조회값
- [ ] `WorklogController` + `index.js` `CONTROLLER_REGISTRARS`
- [ ] `TimesheetController` 마감 3종
- [ ] `TimesheetService.getMyTimesheet`·`getTeamTimesheetMatrix` 추가 필드(§4.8)
- [ ] `WorklogCollector` `updated`·`updatedTimes`
- [ ] `TimesheetDriftService` 마감 후 변경 경로(§4.7) + 게이트 확장 + 테스트: (a) 열린 기간 우리 쓰기 → 0 플래그 (b) 마감 기간 미제출 생성 → close drift 1행 (c) 같은 변경 재처리 → 1행 (d) 마감 전 변경(changedAt < closedAt) → 0 (e) 마감 + APPROVED → 기존 CHANGED_AFTER_APPROVAL 만, close drift 0 (f) 마감 + 반려 기간 삭제(역참조 있음) → DELETED (g) 실패는 `failed` 로 집계
- [ ] `runTimesheetSweep` 자동 마감 기록 → 감지 순서, throw 없음
- [ ] `manifest.yml` 모듈 3 + entry + `write:jira-work` (forge lint 는 배포 회차)
- [ ] 불변식 grep: `src/domain/**` `Date.now(` 0, asApp 신규 호출부 0

### 11.2 frontend 체크리스트

- [ ] 엔트리 `worklog` 3곳(craco ENTRIES·public/worklog.html·manifest entry)
- [ ] `entries/worklog.jsx` extension type 분기
- [ ] `features/worklog/*`(§7.2) + 테스트: durationInput 왕복, lockPrecheck(반열림 경계·이전 기간), WorklogTab 잠금 배지·버튼 비활성, WorklogDialog 서버 에러 `cause.reasonCode`/`cause.field` 표시
- [ ] 설정: `PeriodCloseSettings`, `TimeTrackingProviderGuide`, 정책 2키
- [ ] 내 타임시트·PeriodPicker·팀 매트릭스·엑셀 마감 표시
- [ ] 쿼리키 `worklogKeys`·`settingsKeys.periodCloses`
- [ ] `locales/{kr,en}/worklog.json` 신규 + §8.2 키, `timesheet.notice.acceptance` 교체, `npm run merge`
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui`

### 11.3 순서·의존

backend(도메인 → 스키마 → 저장소 → 서비스 → 컨트롤러·맵) → frontend(엔트리 → 탭·대화상자 → 설정 → 타임시트 표시) → verifier(§2 표 대조, 불변식 7·8·9, P 목록 확인 방법 존재 여부).

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 초판 | period-lock Phase 2 |
