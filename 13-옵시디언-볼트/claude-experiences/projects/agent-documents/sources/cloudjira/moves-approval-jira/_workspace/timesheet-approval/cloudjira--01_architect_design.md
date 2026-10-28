# timesheet-approval 설계서 — 사용자×기간 타임시트 승인 (단독 모드)

> 작성: feature-architect · 2026-10-03 · autopilot 무인 회차
> 입력: `00_input/requirement.md`, `docs/DESIGN.md` §2.2·§3·§4.3·§5·§8, `CLAUDE.md`, `AGENTS.md`, `_workspace/core-port/{01,03,04}`
> 기준 코드: core-port 완료 상태(백엔드 26/215, UI 8/58). 아래 파일·줄 번호는 이 회차에 직접 읽은 값이다.
> **수용 기준 문장(그대로 화면·문서에 싣는다): "워크로그는 사전 차단되지 않는다. 승인 후 변경은 감지·재승인으로 다룬다(차단은 period-lock 기능)."**

---

## 열린 질문

제품 결정이 필요한 것만 적는다. 구현은 **기본 가정**으로 진행한다(답이 오면 정책 기본값·분기만 바뀌고 계약은 유지된다).
리더는 아래를 `_workspace/QUESTIONS.md` 에 Q4~ 로 옮긴다(이 회차는 설계서·spike_todo 외 파일을 쓰지 않는다).

| # | 질문 | 기본 가정(구현 기준) | 선택지 | 권장 |
|---|---|---|---|---|
| Q4 | 기간 경계를 어느 타임존으로 자르나 | 사이트 단일 IANA 타임존 정책값 `timesheetTimezone`, 기본 `Asia/Seoul` | (a) 사이트 단일 (b) 사용자별 Jira 프로필 타임존 | (a). 팀장 매트릭스의 한 열이 모든 팀원에게 같은 구간이어야 비교가 된다. 요청마다 경계를 저장하므로(§5) 나중에 (b)로 바꿔도 과거 요청은 안 깨진다 |
| Q5 | 워크로그 0건 기간 제출 허용 | 허용(`timesheetAllowEmpty=true`) | 허용 / 금지 | 허용. 휴가로 비는 주·월도 "제출됨"이 돼야 매트릭스가 닫힌다 |
| Q6 | 제한선 기본값과 위반 처리 | 일 12h(720분) · 주 52h(3120분) · 미래 일자 검사 켬 · 소급 검사 끔(0) · 처리 `WARN` | 처리: `WARN` / `EXTRA_STEP`(예외 승인 단계) / `BLOCK`(제출 거부). 규칙별로 처리를 다르게 둘지 | 단일 처리값으로 시작. 규칙별 처리는 고객 요구가 확인되면 키를 늘린다 |
| Q7 | **결재 대기 중** 워크로그가 바뀌면 | 요청을 자동 만료(`EXPIRED`, 사유 `CONTENT_CHANGED`) → 사용자에게 재제출 알림 | (a) 자동 만료 (b) 경고만 띄우고 결재자가 판단 | (a). (b)는 결재자가 낡은 스냅샷을 승인하고 그 즉시 "승인 후 변경"이 되는 경로를 연다 |
| Q8 | 승인 후 변경이 감지된 뒤 사용자가 원래대로 되돌리면 | 플래그 유지(sticky) — 재제출해야 다시 승인 | sticky / 원상 복귀 시 자동 해제 | sticky. 감사 관점에서 "바뀐 적이 있다"가 사실이고, 자동 해제는 이벤트 누락 시 오판정 위험이 크다 |
| Q9 | Jira 관리자·앱 설정 관리자가 모든 팀 매트릭스를 볼 수 있나 | **못 본다.** 팀장(LEAD 행)만 자기 팀 | 관리자 전체 열람(읽기 전용) 허용 | 우선 금지(불변식 7). 필요하면 `{admin}` 축의 별도 resolver 로 추가 |
| Q10 | 팀·팀장의 원천(단독 모드) | 앱 명부(`timesheet_team*` 테이블). Jira 그룹은 **가져오기(스냅샷)** 로만 쓴다 | (a) 명부 + 그룹 가져오기 (b) Jira 그룹 실시간 연동 | (a). (b)는 일반 사용자 `group/member` 조회 권한(U6 미검증)에 매번 기대야 하고 팀장 범위 판정이 Jira 장애에 묶인다. 실시간 원천은 workforce-link 가 맡는다 |
| Q11 | 진행 중인 기간도 제출할 수 있나 | 기간 시작 이후면 제출 가능(미래 기간은 거부) | 기간 종료 후에만 / 종료 N일 전부터 | 시작 이후 허용. 월말 마지막 날 제출이 흔하다. 제출 뒤 추가 입력은 Q7 경로로 재제출 |
| Q12 | 승인 단위(`approvalUnit`)를 운영 중에 바꾸면 | 새 제출부터 새 단위. 기존 요청은 그대로(키 형식이 단위를 스스로 드러낸다). 설정 화면이 경고 | 기간 경계에서만 변경 허용 | 기본 가정대로. 겹치는 월·주 요청이 공존할 수 있음을 설정 화면 경고문에 적는다 |
| Q13 | 타임시트 요청에 결재 마감일(expiresAt)을 둘까 | 두지 않음(null). 독촉(reminder) 정책은 그대로 적용 | 정책 `timesheetDeadlineDays` 추가 | 두지 않음. 마감 만료는 "미제출"로 되돌려 매트릭스를 흐린다 |

기술적 모호함은 스스로 결정하고 근거를 본문에 적었다: 스냅샷 저장 위치(§5.2 — 요청 행이 아니라 1:1 부속 테이블), 변경 감지 방식(§4.6 — 전체 재해시가 아니라 워크로그 단위 대조), CHANGED_AFTER_APPROVAL 의 위치(§3.4 — 만료 사유가 아니라 기간 상태), 팀장 축 판정 원천(§4.3).

---

## 1. 개요·영향 범위

**대상** = (사용자 `accountId`, 기간 `periodKey`). `scopeKey = TIMESHEET:{accountId}:{periodKey}` (`scopeKey.js` 예약 형식 그대로, 불변식 1).

흐름:
```
내 타임시트 탭: 기간 선택 → getMyTimesheet(asUser 로 내 워크로그 수집·요약·제한선 미리보기)
  → submitTimesheet(expectedHash) → 서버가 다시 수집 → 지문 대조 → 결재선 해석(팀장[→2단계][→예외]) → 요청 생성
팀 타임시트 탭(팀장): getTeamTimesheetMatrix → 상세(getTimesheetDetail) → decideTimesheets(일괄 승인, PIN 1회) / decideApproval(REJECT, 사유)
승인 후: 워크로그 이벤트·시간당 스윕 → 스냅샷과 워크로그 단위 대조
  → 대기 중이면 EXPIRED(CONTENT_CHANGED), 승인됐으면 기간 상태 CHANGED_AFTER_APPROVAL(재제출 요구 + 알림)
```

| 축 | 영향 |
|---|---|
| 도메인 | **신규** `src/domain/timesheet/{period,snapshot,limits,status}.js`(순수). **추가만** `src/domain/approval/constants.js`(TargetKind·ExpiryReason·EventType 값), `scopeKey.js`(TIMESHEET 키 빌더), `transitions.js`(`expireByContentChange`). 상태 머신·derive 무변경 |
| resolver | **신규** `src/resolver/timesheet/`(Controller·Service·Repository·TeamScope·TimesheetAccess·WorklogCollector·Routing·DriftService·TeamService·TeamRepository) + `target/TimesheetTargetAdapter.js`. **변경** ApprovalService(`createForTarget` 옵션, `assertTargetVisible` 3번째 인자), CertificateService(대상별 부가 블록), InboxService·NotificationService(TIMESHEET 표시 필드·새 알림 종류), SettingsRepository/Service(정책 키), RetentionRepository·StorageService(테이블 목록), AppAccess(팀 구성원 허용), permissionGuard·PermissionMap(`{teamLead}` 축), JiraPermission(R3 invocation 캐시) |
| 스키마 | **신규 테이블 4개** v016~v019. `approval_request` ALTER 없음(기존 `subject_account`·`period_key`·`content_hash`·`ix_request_subject` 사용) |
| manifest | 트리거 `avi:jira:{created,updated,deleted}:worklog`, 시간당 `scheduledTrigger` 1개, function 2개. **scope 추가 없음**(`read:jira-work` 로 충분 — §6) |
| 프론트 | 엔트리 추가 없음. `inbox` 엔트리 사이드바에 `timesheet`·`teamTimesheet` 뷰, `settings` 엔트리에 `timesheet` 탭, `modal` 상세에 TIMESHEET 대상 섹션, 증명서 TIMESHEET 분기 |
| i18n | **신규 네임스페이스** `timesheet.json`(kr/en). 기존 `error`·`notification`·`state`·`policy`·`inbox`·`cert` 에 키 추가 |
| 워크포스 연동 | 범위 밖. 단, `contentHash`(ts1) 정의는 workforce-link 의 계약이 되므로 이번에 고정한다(§3.2) |

---

## 2. 경계면 계약

권한 축 표기: `SELF` · `{admin}` · `{teamLead}` = `{teamLead:true}`(신규).
공통 에러(모든 resolver): `PERMISSION_DENIED`, `APP_ACCESS_DENIED`, `LICENSE_INACTIVE`, `STORAGE_NOT_READY`, `JIRA_API_FAILED`, `UNKNOWN_ERROR`. `{admin}` 은 `PERMISSION_ADMIN_REQUIRED`, `{teamLead}` 는 **`PERMISSION_TEAM_LEAD_REQUIRED`**(신규). 아래 "에러 code" 열은 그 외만 적는다.
시각은 전부 **epoch ms(number)**, 시간 양은 **초(number)**. 응답은 `{success:true, ...result}` — 아래 shape 는 `result` 부분이다.

### 2.1 신규 resolver (`src/resolver/timesheet/TimesheetController.js` → `registerTimesheetController`)

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getTimesheetContext` | SELF | `{}` | `{unit:'MONTH'\|'WEEK', timeZone, currentPeriodKey, previousPeriodKey, myTeam:{teamKey,displayName}\|null, isTeamLead:boolean, ledTeams:[{teamKey,displayName,memberCount}]}` | — | inbox: AppShell 사이드바(팀 탭 노출), MyTimesheetPage·TeamTimesheetPage 초기 기간 |
| `getMyTimesheet` | SELF (서비스가 `principal.accountId` 로 고정 — payload 에 accountId 없음) | `{periodKey?}` 없으면 `currentPeriodKey` | `MyTimesheetView` §2.3 | `TIMESHEET_PERIOD_INVALID`, `TIMESHEET_TOO_LARGE` | inbox: MyTimesheetPage |
| `submitTimesheet` | SELF (대상 accountId = principal) | `{periodKey, expectedHash, requestMessage?:string≤500, supersedes?:requestId}` | `{requestId, status:'PENDING', currentStepOrder, periodStatus:'SUBMITTED', contentHash, entryCount, totalSeconds, violations:Violation[], extraStepAdded:boolean}` | `TIMESHEET_PERIOD_INVALID`, `TIMESHEET_EMPTY`, `TIMESHEET_LIMIT_BLOCKED`, `TIMESHEET_CONTENT_CHANGED`, `TIMESHEET_NO_TEAM`, `TIMESHEET_NO_APPROVER`, `TIMESHEET_TOO_LARGE`, `ALREADY_OPEN`, `ALREADY_DECIDED`, `INVALID_APPROVER_CONFIGURATION`, `INVALID_TARGET` | inbox: MyTimesheetPage 제출 바 |
| `getTeamTimesheetMatrix` | {teamLead} + 서비스가 `TeamScope.membersOf` 로 행 범위 고정 | `{periodKey?, teamKey?}` teamKey 없으면 이끄는 팀 전체 | `TeamMatrixView` §2.4 | `TIMESHEET_PERIOD_INVALID`, `INVALID_TARGET`(이끌지 않는 teamKey) | inbox: TeamTimesheetPage(매트릭스·엑셀 내보내기) |
| `decideTimesheets` | {teamLead} + 건별 `assertTargetVisible`(TimesheetAccess) + 엔진 결재 자격 | `{requestIds:string[] (1..50, 중복 제거), pin?}` | `{results:[{requestId, ok:true, status}\|{requestId, ok:false, code}], approved:number, failed:number, remaining:string[]}` — `remaining` = 시간 예산(18s) 초과로 처리 안 한 id, 프론트가 이어서 다시 부른다 | `INVALID_TARGET`(0건·50 초과), `PIN_REQUIRED`·`PIN_INVALID`·`PIN_LOCKED`·`PIN_NOT_SET`. 건별 실패 code 는 `results[].code`(`REQUEST_NOT_PENDING`, `APPROVER_NOT_ELIGIBLE`, `APPROVER_STEP_NOT_REACHED`, `PERMISSION_TARGET_VIEW_DENIED`, `REQUEST_NOT_FOUND`, `CONCURRENT_MODIFICATION`) | inbox: TeamTimesheetPage BulkDecideBar |
| `getTimesheetDetail` | SELF + 서비스가 `TimesheetAccess.canView` | `{requestId}` | `TimesheetDetailView` §2.5 | `REQUEST_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED`, `INVALID_TARGET`(TIMESHEET 아닌 요청) | modal: TimesheetSnapshotSection(상세 모달), inbox: MyTimesheetPage(제출본 보기) |
| `listTimesheetTeams` | {admin} | `{q?:string, cursor?:string}` | `{items:[TeamSummary], nextCursor, hasMore}` TeamSummary = `{teamKey, displayName, enabled, leadKeys:string[], memberCount, secondStepGroup:string\|null, sourceGroupName:string\|null, syncedAt:number\|null, rev}` | — | settings: TimesheetTeamSettings |
| `getTimesheetTeam` | {admin} | `{teamKey}` | `{team: TeamSummary & {memberKeys:string[]}}` | `INVALID_TARGET` | settings: TeamFormModal |
| `saveTimesheetTeam` | {admin} | `{teamKey?:string(없으면 생성), displayName:string 1..120, enabled:boolean, leadKeys:string[] 1..10, memberKeys:string[] 0..500, secondStepGroup:string\|null(approval_group.group_key), sourceGroupName?:string\|null, rev?:number(수정 시 필수)}` | `{team: TeamSummary & {memberKeys}}` | `INVALID_TARGET`, `TIMESHEET_TEAM_MEMBER_CONFLICT`(cause: `{accountIds:string[], teamKeys:string[]}`), `CONCURRENT_MODIFICATION`, `INVALID_APPROVER_CONFIGURATION`(없는·비활성 2단계 그룹) | settings: TeamFormModal |
| `deleteTimesheetTeam` | {admin} | `{teamKey, rev}` | `{teamKey, deleted:true, openCount:number}` — 열린 요청은 그대로 둔다(결재선은 제출 시 고정) | `INVALID_TARGET`, `CONCURRENT_MODIFICATION` | settings |
| `importTimesheetTeamMembers` | {admin} | `{groupName:string}` | `{members:[UserDTO], truncated:boolean}` — 저장하지 않는다. 폼에 채우기만 한다(Q10) | `INVALID_TARGET`(빈 이름) — 그룹 조회 실패는 `members:[]` | settings: TeamFormModal "Jira 그룹에서 가져오기" |

UserDTO 는 core-port 와 같다: `{accountId, displayName, avatarUrl, accountStatus}`.

### 2.2 변경 resolver

| resolver | 권한 축 | 변경 | 소비 화면 |
|---|---|---|---|
| `getApprovalDetail` | SELF (무변경) | TIMESHEET 요청이면 `target` 이 `TimesheetTargetView`(§2.6). `approval` shape 무변경(`isStale=false`, `canResubmit=false` — 재제출은 내 타임시트 탭에서). `canRequest` = 대상자 본인 && 최신 요청이 열려 있지 않음 | modal: ApprovalDetail 헤더 분기 |
| `getApprovalHistory` | SELF | 무변경(같은 `target_kind+target_key` = 같은 사용자·기간의 제출 회차들). `events[].eventType` 에 `CHANGED_AFTER_APPROVAL` 이 나올 수 있다 | modal |
| `getApprovalCertificate` | SELF | TIMESHEET: `target` = TimesheetTargetView(저장 스냅샷), `contentHash = {algorithm:'SHA-256', value:'ts1:<hex64>', version:0}`, **신규 선택 필드** `timesheet:{periodKey, periodStart, periodEnd, timeZone, entryCount, totalSeconds, violationCount, changedAfterApproval, driftDetectedAt}`(ISSUE 는 키 없음). R2 처리(§4.9) | modal: CertificateSheet·exportCertificatePdf |
| `decideApproval` | SELF | 무변경. 팀장 화면의 **반려**는 이 resolver(`{requestId, decision:'REJECT', reason, pin}`)를 쓴다 — 사유가 건마다 달라 일괄 반려는 두지 않는다(core 의 bulkApprove 계약과 같다). 반려 사유 필수 여부는 기존 정책 `rejectionReasonRequired` | inbox: TeamTimesheetPage RejectDialog, modal: DecisionForm |
| `bulkApprove` | SELF | 무변경. 2단계·예외 단계 결재자(팀장 아님)는 업무함 일괄 승인을 그대로 쓴다 | inbox |
| `cancelApproval` | SELF | 무변경. 대상자 = 요청자라 본인이 회수 | modal, MyTimesheetPage "회수" |
| `listInbox` | SELF | TIMESHEET 행: `title` = 대상자 표시 이름(Jira 현재 값 우선, 실패 시 저장값), **추가 필드** `periodKey:string\|null`, `subjectAccountId:string\|null`(ISSUE 행은 null). `issueKey`·`projectKey` null | inbox: InboxTable·exportInboxExcel |
| `listNotifications` | SELF | 항목 **추가 필드** `periodKey`, `subjectAccountId`. 새 `kind` = `CHANGED_AFTER_APPROVAL`(templateKey `notification.template.timesheetChanged`). `EXPIRED`+사유 `CONTENT_CHANGED` 의 templateKey = `notification.template.timesheetChangedWhilePending` | inbox: NotificationPanel |
| `getApprovalSettings` / `saveApprovalSettings` | {admin} | 정책 키 9개 추가(§4.8). 검증 실패 `INVALID_TARGET` | settings: TimesheetPolicySettings |
| `getProjectPolicy` / `saveProjectPolicy` | {admin} | `overridableKeys` 에서 타임시트 키 제외(전역 전용 — 타임시트엔 프로젝트가 없다) | settings |
| `exportExpiredApprovals` | {admin} | `requests[]` 에 `subjectAccount`, `periodKey` 추가(TIMESHEET 행만 값) | settings: exportRetentionExcel |
| `getStorageUsage` | {admin} | 테이블 목록에 신규 4개 | settings: DataSettings |

### 2.3 `MyTimesheetView` (getMyTimesheet)

```js
{
  periodKey: '2026-10', unit: 'MONTH', timeZone: 'Asia/Seoul',
  period: { start: 1759244400000, end: 1761922800000 },        // [start, end)
  canSubmitPeriod: true,                                        // 기간 시작 전이면 false
  live: {                                                       // 지금 Jira 값(asUser, 본인)
    contentHash: 'ts1:…', entryCount: 42, totalSeconds: 576000,
    entries: [{ worklogId:'10231', issueId:'10002', started:1759280400000, seconds:3600 }], // worklogId 오름차순
    byDay: { '2026-10-01': 28800, … },                          // timeZone 기준 날짜
    issues: [{ issueId:'10002', issueKey:'OPS-12', summary:'…', projectKey:'OPS', seconds:7200 }],
  },
  violations: [Violation],          // §3.3, live 기준 미리보기
  violationAction: 'WARN' | 'EXTRA_STEP' | 'BLOCK',
  latest: null | {                  // 이 기간 최신 요청(DB)
    requestId, status, periodStatus, needsResubmit, contentHash, submittedAt, decidedAt,
    entryCount, totalSeconds, violationCount, driftDetectedAt, currentStepOrder, stepCount,
  },
  changedSinceSubmit: boolean,      // latest 가 있고 live.contentHash !== latest.contentHash
  routing: { teamKey, teamName, approverKeys:[...], extraStepGroup:null|string } | null,
  routingError: null | 'TIMESHEET_NO_TEAM' | 'TIMESHEET_NO_APPROVER' | 'INVALID_APPROVER_CONFIGURATION',
  submitBlockedCode: null | 'TIMESHEET_EMPTY' | 'TIMESHEET_LIMIT_BLOCKED' | 'TIMESHEET_PERIOD_INVALID' | 'ALREADY_OPEN' | 'ALREADY_DECIDED' | <routingError>,
  periods: [{ periodKey, periodStatus, needsResubmit }],        // 최근 6개 기간(현재 포함, DB 만 — Jira 호출 없음)
}
```
- `entries` 상한 2000건. 넘으면 `TIMESHEET_TOO_LARGE`.
- 프론트는 `live.contentHash` 를 그대로 `submitTimesheet.expectedHash` 로 보낸다.

### 2.4 `TeamMatrixView` (getTeamTimesheetMatrix)

```js
{
  periodKey, unit, timeZone, period: { start, end },
  teams: [{ teamKey, displayName }],          // 내가 이끄는 활성 팀 전부(탭 선택용)
  teamKey: string | null,                     // 요청한 팀(없으면 null = 전체)
  rows: [{
    accountId, displayName, avatarUrl, teamKey,
    periodStatus: 'NOT_SUBMITTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGED_AFTER_APPROVAL',
    needsResubmit: boolean,
    requestId: string | null, requestStatus: string | null,
    submittedAt: number | null, decidedAt: number | null,
    entryCount: number | null, totalSeconds: number | null, violationCount: number | null,
    currentStepOrder: number | null, stepCount: number | null,
    myTurn: boolean,                          // 내가(또는 내가 위임받은 사람이) 지금 결정할 차례
    driftDetectedAt: number | null,
  }],                                         // displayName 오름차순
  summary: { total, notSubmitted, submitted, approved, rejected, changed },
}
```
- 행은 **TeamScope.membersOf(principal)** 의 구성원만(본인 제외). 미제출 행의 시간은 null — 팀원 워크로그를 팀장 권한으로 수집하지 않는다(호출량·권한 둘 다 이유).
- 엑셀 내보내기는 프론트가 이 응답으로 만든다(별도 resolver 없음 → 범위가 새는 형제 resolver 가 생기지 않는다).

### 2.5 `TimesheetDetailView` (getTimesheetDetail)

```js
{
  requestId, subjectAccountId, subjectDisplayName, periodKey, unit, timeZone,
  period: { start, end },
  contentHash, entryCount, totalSeconds,
  entries: [{ worklogId, issueId, started, seconds }],   // 저장 스냅샷(우리 DB)
  byDay: { 'YYYY-MM-DD': seconds },
  issues: [{ issueId, visible:boolean, issueKey|null, summary|null, projectKey|null, seconds }],
  violations: [Violation], violationAction,
  drift: null | { detectedAt, kind:'CREATED'|'UPDATED'|'DELETED', worklogId },
}
```
- `issues[].visible=false` 이면 키·제목을 비운다(보는 사람의 asUser `permissions/check` 결과). 시간만 보인다.
- 스냅샷은 워크로그 본문(코멘트)을 저장하지 않는다 → 노출할 것도 없다.

### 2.6 `TimesheetTargetView` (getApprovalDetail·증명서의 `target`)

```js
{ kind:'TIMESHEET', key:'<accountId>:<periodKey>', subjectAccountId, title:<표시 이름>, periodKey,
  issueId:null, issueKey:null, projectId:null, projectKey:null, projectName:null, revision:null }
```
ISSUE TargetView 와 같은 키를 null 로 채워 기존 소비 코드가 깨지지 않게 한다. 프론트는 `kind` 로 분기한다.

### 2.7 `Violation`

```js
{ code:'DAILY_MAX',   date:'2026-10-03', seconds, limitSeconds }
{ code:'WEEKLY_MAX',  week:'2026-W40',   seconds, limitSeconds }
{ code:'FUTURE_DATE', date, worklogId }
{ code:'BACKDATED',   date, worklogId, lagDays, limitDays }
```
정렬: code(위 순서) → date/week → worklogId. 최대 50건(초과분 버림, `violationCount` 는 전체 수).

### 2.8 신규 에러 코드 (`ErrorCodes` + `locales/*/error.json` 동시)

`PERMISSION_TEAM_LEAD_REQUIRED`, `TIMESHEET_PERIOD_INVALID`, `TIMESHEET_EMPTY`, `TIMESHEET_LIMIT_BLOCKED`, `TIMESHEET_CONTENT_CHANGED`, `TIMESHEET_NO_TEAM`, `TIMESHEET_NO_APPROVER`, `TIMESHEET_TOO_LARGE`, `TIMESHEET_TEAM_MEMBER_CONFLICT` — 9개. (core-port 검증의 "error.json 키 = ErrorCodes 값" 대조가 그대로 적용된다.)

### 2.9 프론트 호출 대응

| 화면 | 호출 | 쿼리키 | invalidate |
|---|---|---|---|
| AppShell 사이드바 | getTimesheetContext | `timesheetKeys.context()` | — |
| MyTimesheetPage | getMyTimesheet | `timesheetKeys.mine(periodKey)` | 제출·회수 후 `timesheetKeys.mine(periodKey)` + `inboxKeys.all` |
| 〃 제출 | submitTimesheet | — | 위와 같음. `TIMESHEET_CONTENT_CHANGED` 면 mine 재조회 후 다시 확인 |
| TeamTimesheetPage | getTeamTimesheetMatrix | `timesheetKeys.matrix(teamKey, periodKey)` | 결정 후·모달 onClose |
| 〃 일괄 승인 | decideTimesheets (20건씩 순차, `remaining` 이어 호출, PIN 은 메모리에 한 번만 받음) | — | matrix + `inboxKeys.all` |
| 〃 반려 | decideApproval REJECT | — | matrix |
| modal 상세(TIMESHEET) | getApprovalDetail + getTimesheetDetail | `approvalKeys.detail(id)`, `timesheetKeys.detail(id)` | — |
| settings 타임시트 탭 | get/saveApprovalSettings, list/get/save/deleteTimesheetTeam, importTimesheetTeamMembers, listApprovalGroups(2단계·예외 그룹 선택) | `settingsKeys.policy()`, `settingsKeys.timesheetTeams(params)`, `settingsKeys.timesheetTeam(key)` | 저장 후 해당 키 |

---

## 3. 도메인 (순수 — `src/domain/timesheet/**`, `src/domain/approval/**` 추가분)

규칙: SQL·Jira 무호출, `Date.now()`/`new Date()` 무인자 호출 금지, 타임존·now·정책은 인자. `Intl.DateTimeFormat`(타임존 계산)·`crypto.createHash`·`zlib.*Sync` 는 입력이 같으면 출력이 같으므로 도메인에서 써도 된다(`eventId.js` 가 이미 crypto 를 쓴다).

### 3.1 `period.js` — 기간 키

```js
export const PeriodUnit = Object.freeze({ MONTH:'MONTH', WEEK:'WEEK' });
isValidTimeZone(timeZone) -> boolean                 // Intl 로 생성 시도, 실패면 false
parsePeriodKey(key) -> {unit:'MONTH', year, month} | {unit:'WEEK', isoYear, week} | null
   // '2026-10' (month 01..12) | '2026-W40' (week 01..isoWeeksInYear). 그 외 형식·범위 밖 null
isoWeeksInYear(isoYear) -> 52 | 53                   // 1/1 이 목요일이거나, 윤년이고 1/1 이 수요일이면 53
localDateOf(epochMs, timeZone) -> 'YYYY-MM-DD'       // Intl formatToParts
zonedMidnight(year, month, day, timeZone) -> epochMs // 그 날짜 00:00(현지)의 epoch. 오프셋 추정 → 보정 2회 반복(DST 대응)
periodKeyOf(epochMs, { unit, timeZone }) -> periodKey  // 현지 날짜 → 월 또는 ISO 주(월요일 시작, 목요일이 속한 해)
periodRange(periodKey, { timeZone }) -> { start, end }  // [start, end) — 월: 1일 00:00 ~ 다음 달 1일 00:00, 주: 월요일 00:00 ~ 다음 월요일 00:00
currentPeriodKey({ now, unit, timeZone }) -> periodKey
shiftPeriodKey(periodKey, delta) -> periodKey        // 이전/다음(달력 연산만 — 타임존 불필요)
recentPeriodKeys(periodKey, count) -> periodKey[]    // 최신 → 과거
parseJiraDateTime(str) -> epochMs | null             // '2026-10-01T09:00:00.000+0900' → '+09:00' 로 정규화 후 파싱
```
**테스트 케이스** (`src/domain/timesheet/__test__/period.test.js`)
1. `periodRange('2026-10', {timeZone:'Asia/Seoul'})` → start = `2026-09-30T15:00:00Z`, end = `2026-10-31T15:00:00Z`
2. 같은 키 `UTC` → `2026-10-01T00:00Z` ~ `2026-11-01T00:00Z`
3. `2026-10-01T00:30+09:00` 는 Seoul 에서 `'2026-10'`, UTC 에서 `'2026-09'`
4. ISO 주: `2027-01-01` → `'2026-W53'`(2026 은 53주), `2024-12-30` → `'2025-W01'`, `2026-10-01` → `'2026-W40'`, `periodRange('2026-W40')` = 2026-09-28 ~ 2026-10-05
5. 무효: `'2026-13'`, `'2026-00'`, `'2025-W53'`(2025 는 52주), `'2026-W00'`, `'2026-1'`, `'26-10'`, `null` → `parsePeriodKey` null
6. DST: `periodRange('2026-W11', {timeZone:'America/New_York'})` 길이 = 167시간, `periodRange('2026-03', …)` 길이 = 743시간
7. 경계 포함: `periodKeyOf(range.start)` = 그 키, `periodKeyOf(range.end - 1)` = 그 키, `periodKeyOf(range.end)` = 다음 키
8. `shiftPeriodKey('2026-01', -1)` = `'2025-12'`, `shiftPeriodKey('2026-W53', 1)` = `'2027-W01'`, `shiftPeriodKey('2027-W01', -1)` = `'2026-W53'`
9. `parseJiraDateTime` — `+0900`, `+09:00`, `Z`, 밀리초 없음 모두 같은 epoch. 쓰레기 문자열 null
10. `isValidTimeZone('Asia/Seoul')` true, `'Mars/Base'` false

### 3.2 `snapshot.js` — 스냅샷·지문(**workforce-link 계약으로 고정**)

```js
export const SNAPSHOT_FORMAT = 'ts1z';
normalizeWorklogs(raw, { accountId, range }) -> Entry[]
   // raw: Jira worklog 객체 배열. author.accountId === accountId && range.start <= started < range.end && seconds > 0
   // Entry = { worklogId:string, issueId:string, started:number(ms), seconds:number }. worklogId 중복은 첫 것만
sortEntries(entries) -> Entry[]        // 새 배열. worklogId 숫자 오름차순(길이 → 사전순 비교, BigInt 불필요)
contentHashOf({ accountId, periodKey, entries }) -> 'ts1:' + sha256hex(
   'ts1\n' + accountId + '\n' + periodKey + '\n' +
   sortEntries(entries).map(e => `${e.worklogId}|${e.issueId}|${e.started}|${e.seconds}\n`).join(''))
encodeSnapshot(entries) -> 'ts1z:' + base64(deflateRawSync(JSON.stringify(sorted.map(e => [w, i, started, seconds]))))
decodeSnapshot(blob) -> Entry[] | null // 형식 접두 불일치·손상은 null(호출부가 "판정 불가"로 처리)
summarize(entries, { timeZone }) -> { entryCount, totalSeconds, byDay:{date:seconds}, byIssue:{issueId:seconds} }
diffWorklog(entries, { worklogId, current, accountId, range })
   -> { changed:false } | { changed:true, kind:'CREATED'|'UPDATED'|'DELETED' }
   // current = 현재 Entry 또는 null(삭제)·author 포함 객체. 규칙:
   //   스냅샷에 있음 + current null                          → DELETED
   //   스냅샷에 있음 + (issueId·started·seconds 중 하나 다름) → UPDATED  (기간 밖으로 옮겨진 경우 포함)
   //   스냅샷에 없음 + current 가 같은 author·range 안        → CREATED
   //   그 외                                                  → unchanged
```
- **지문에 넣는 것**: 워크로그 id·이슈 id·시작 시각(ms, 절대)·초. 넣지 않는 것: 코멘트(본문을 저장하지 않는다), updateAuthor, created. 시작 시각을 넣는 이유: 기간 안에서 날짜만 옮겨도 일별 분포가 바뀌어 승인 내용이 달라진다.
- `accountId`·`periodKey` 를 지문에 묶는 이유: 같은 워크로그 묶음의 지문을 다른 사람·다른 기간으로 복사 재사용하지 못하게(DESIGN §4.1 서명 대상과 같은 취지).
- 테스트: 입력 순서가 달라도 같은 해시 · 초 1 차이 → 다른 해시 · accountId 다르면 다른 해시 · encode→decode 왕복 동일 · 손상 blob → null · 빈 배열 해시 결정적 · `diffWorklog` 4종 + 다른 author 의 생성은 unchanged · range 밖 생성은 unchanged · `'10'` < `'9'` 같은 사전순 함정(길이 우선 비교로 `'9'` < `'10'`).

### 3.3 `limits.js` — 제한선 판정

```js
evaluateLimits(entries, { timeZone, now, rules, createdAtById })
   -> { violations: Violation[] (최대 50), total: number }
   // rules = { dailyMaxSeconds, weeklyMaxSeconds, futureDateCheck:boolean, backdateMaxDays } — 0/false = 끔
   // DAILY_MAX : 현지 날짜별 합 > dailyMaxSeconds
   // WEEKLY_MAX: ISO 주별 합 > weeklyMaxSeconds  (월 단위 기간에서는 기간에 들어온 워크로그만 합산 — 부분 주 과소 판정 한계를 문서화)
   // FUTURE_DATE: localDateOf(started) > localDateOf(now)
   // BACKDATED : createdAtById 가 있을 때만. 현지 날짜 기준 created - started 일수 > backdateMaxDays
violationDecision(violations, action) -> { block:boolean, extraStep:boolean }
   // action 'BLOCK' && 위반 있음 → block / 'EXTRA_STEP' && 위반 있음 → extraStep / 그 외 둘 다 false
rulesFromPolicy(policy) -> rules        // 분 → 초 변환, 음수·비정수는 0
```
- 테스트: 경계값(정확히 한도 = 위반 아님), 타임존에 따라 같은 워크로그의 날짜가 바뀌는 경우, 다 꺼진 규칙 → 0건, 50건 상한, 정렬 결정성, `now` 를 바꾸면 FUTURE_DATE 결과가 바뀜.

### 3.4 `status.js` — 기간 상태(파생)

```js
export const PeriodStatus = Object.freeze({ NOT_SUBMITTED, SUBMITTED, APPROVED, REJECTED, CHANGED_AFTER_APPROVAL });
periodStatusOf(latest) -> { periodStatus, needsResubmit }
   // latest = { status, driftDetectedAt } | null
   // null / CANCELLED                → NOT_SUBMITTED, false
   // EXPIRED                         → NOT_SUBMITTED, needsResubmit = driftDetectedAt != null
   // PENDING                         → SUBMITTED
   // APPROVED + driftDetectedAt      → CHANGED_AFTER_APPROVAL, true
   // APPROVED                        → APPROVED
   // REJECTED                        → REJECTED, true
pickLatest(rows) -> row | null          // revision 최대(같은 대상 안)
```
**CHANGED_AFTER_APPROVAL 를 만료 사유가 아니라 기간 상태로 둔 이유.** 엔진에서 APPROVED 는 종료 상태이고 "승인은 영구 기록"이다(`transitions.js` expireByDeadline 주석, Confluence 판 stale 배너와 같은 원칙). 승인된 요청을 EXPIRED 로 바꾸면 상태 머신을 고쳐야 하고 "그때 누가 무엇을 승인했나"가 지워진다. 그래서 요청은 APPROVED 로 두고, 부속 행의 `drift_detected_at` 과 감사 이벤트 `CHANGED_AFTER_APPROVAL` 로 표현한다. 재제출은 새 요청(같은 dedupe 범위 — 승인된 요청은 이미 `closed:` 키라 막지 않는다, `prev_request_id` 로 연결).

### 3.5 `src/domain/approval/` 추가분(기존 값·함수 무변경)

| 파일 | 추가 |
|---|---|
| `constants.js` | `TargetKind.TIMESHEET = 'TIMESHEET'` · `ExpiryReason.CONTENT_CHANGED = 'CONTENT_CHANGED'`(대기 중 변경 만료) · `EventType.CHANGED_AFTER_APPROVAL = 'CHANGED_AFTER_APPROVAL'`(감사 전용 — derive 는 APPROVE/REJECT 결정만 보므로 상태에 영향 없음) · TargetKind 주석의 "TIMESHEET 은 넣지 않는다" 문장 갱신 |
| `scopeKey.js` | `SCOPE_PREFIX.TIMESHEET = 'TIMESHEET'`, 빌더 `({accountId, periodKey}) => ACCOUNT_ID.test(accountId) && parsePeriodKey(periodKey) ? `${accountId}:${periodKey}` : null` — `ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/`. **accountId 에 `:` 가 들어갈 수 있다**(`712020:…` 형식). 역파싱은 마지막 `:` 기준(`timesheetTargetFromKey(key)` 를 함께 export) |
| `transitions.js` | `expireByContentChange(state, { now })` — PENDING 만, 사유 `CONTENT_CHANGED`, discriminator `CONTENT_CHANGED`(대기 중 만료는 요청당 1회뿐이라 고정값), contentVersion 유지. 기존 `expireWith` 재사용 |
| `ResourceType` | 이 리포에 없다(core-port 에서 `TargetKind` 로 바뀜). 요구서의 "ResourceType 확장" = `TargetKind` 확장으로 읽는다 |

**테스트 추가** (`transitions.test.js`): TIMESHEET scopeKey 형식 · 콜론 포함 accountId 왕복 · 잘못된 periodKey → INVALID_TARGET · 길이 초과(accountId 128 + 키) 허용 범위 확인(`open:TIMESHEET:` + 128 + `:` + 8 = 151 ≤ 200) · `expireByContentChange` PENDING 만 · 같은 입력 같은 eventId.

---

## 4. 백엔드

### 4.1 파일 배치

```
src/resolver/timesheet/
  TimesheetController.js      guardedDefine 11개 (§2.1)
  TimesheetService.js         getTimesheetContext · getMyTimesheet · submitTimesheet · getTeamTimesheetMatrix · decideTimesheets · getTimesheetDetail
  TimesheetRepository.js      timesheet_submission · timesheet_worklog_ref · 매트릭스/기간 조회 SQL
  WorklogCollector.js         asUser 수집(제출·미리보기), asApp 조회(트리거·스윕) — 둘을 다른 함수로 분리
  TeamRepository.js           timesheet_team · timesheet_team_member
  TeamService.js              설정 resolver 5개 + 감사 기록(area 'timesheetTeam')
  TeamScope.js                팀장 범위 단일 출처(§4.3)
  TimesheetAccess.js          canView 단일 출처(§4.3)
  TimesheetRouting.js         결재선 해석(§4.4)
  TimesheetDriftService.js    트리거·스윕(§4.6) — throw 금지
src/resolver/approval/target/TimesheetTargetAdapter.js
src/permission/InvocationScope.js   R3 + 팀장 판정 캐시(§4.10)
src/trigger/onWorklogChanged.js     얇은 어댑터
src/trigger/runTimesheetSweep.js    얇은 어댑터
```
`src/index.js`: `registerTimesheetController` 를 `CONTROLLER_REGISTRARS` 에, `export { onWorklogChanged } …`, `export { runTimesheetSweep } …`.

### 4.2 TimesheetTargetAdapter (IssueTargetAdapter 와 같은 인터페이스)

| 메서드 | 동작 |
|---|---|
| `kind` | `'TIMESHEET'` |
| `parse(payload)` | `{accountId, periodKey}` 검증 → target. 단, 제출 경로는 parse 를 쓰지 않고 **principal 로 target 을 만든다**(payload 의 accountId 를 받지 않는다) |
| `targetOf(state)` | `state.subjectAccount`·`state.periodKey` 우선, 없으면 `timesheetTargetFromKey(state.targetKey)` |
| `keyOf(target)` | `targetKeyOf(target)` |
| `describe(target)` | asUser `user/bulk` 1회(DirectoryService.resolveUsers 재사용)로 `{title: displayName, subjectAccountId, periodKey, avatarUrl, revision:null}`. 실패하면 `{title:null, …}`(조회 실패가 상세를 막지 않는다) |
| `canView(target, principal, {state})` | `TimesheetAccess.canView(principal, target, state)` |
| `canRequest(target, principal)` | `principal.accountId === target.accountId` |
| `userCanView()` | `null`(Jira 판정 대상 없음 — 결재선은 관리자 설정에서 나오므로 approverAccessCheck 무관) |
| `filterVisible(targetKeys)` | **형식이 맞는 키는 전부 visible.** 업무함·알림 행은 이미 actor_key/recipient_key = 참여자(요청자·결재자·위임받은 사람)로 좁혀진 행이고, 타임시트에는 Jira 쪽 열람 권한 축이 없다. meta = `{title: displayName, subjectAccountId, periodKey}` — 표시 이름은 `user/bulk` asUser 로 일괄(실패하면 meta 없음 → 저장 제목) |
| `fingerprint(target, state)` | `state.contentHash ? {algorithm:'SHA-256', hash: state.contentHash, currentRevision:null} : null` |
| `columnsOf(target, snapshot)` | `{target_key, project_id:null, issue_id:null, issue_key:null, transition_id:null, subject_account: accountId, period_key, target_title: snapshot.title ?? '', content_version:0, content_hash: snapshot.contentHash}` |
| `snapshotOf(state)` | `{title: state.targetTitle, subjectAccountId: state.subjectAccount, periodKey: state.periodKey}` |
| `viewOf(target, snapshot, fallback)` | §2.6 |
| `certificateExtra(state)` (**신규 선택 메서드**) | `TimesheetRepository.findSubmission(requestId)` → §2.2 `timesheet` 블록. ISSUE 어댑터엔 없음 → CertificateService 는 있을 때만 부른다 |

`TargetRegistry`: `createTargetRegistry({ ISSUE: issueTargetAdapter, TIMESHEET: timesheetTargetAdapter })`.

### 4.3 팀장 축과 범위 함수 (불변식 7)

**판정 원천 = 우리 DB `timesheet_team_member`(role='LEAD') + `timesheet_team.enabled=1`.** 엔티티 프로퍼티·Jira 그룹 실시간 조회는 쓰지 않는다(불변식 9, Q10).

```js
// TeamScope.js — 단일 출처. 형제 resolver 는 전부 이것만 부른다.
ledTeams(leadId)                  -> [{teamKey, displayName, memberCount}]   // SQL 1, InvocationScope 캐시
membersOf(leadId, { teamKey })    -> Map<accountId, teamKey>               // 이끄는 팀의 MEMBER, 본인 제외. teamKey 가 이끄는 팀이 아니면 INVALID_TARGET
leads(leadId, subjectId)          -> boolean                               // membersOf 결과 재사용
isTeamLead(accountId)             -> boolean                               // ledTeams(accountId).length > 0
memberTeamOf(accountId)           -> {teamKey, displayName, secondStepGroup, leadKeys} | null   // 결재선 해석용

// TimesheetAccess.js
canView(principal, target, state) =
     principal.accountId === target.accountId                         // 대상자 본인
  || (state && participantsOf(state).has(principal.accountId))        // 결재선(모든 단계)·요청자
  || (state && await delegatedApproverOf(state, principal))           // 결재자 중 나에게 위임한 사람이 있음(DelegationService.activeAmong)
  || await TeamScope.leads(principal.accountId, target.accountId)     // 현재 팀장
```

| 형제 resolver | 범위 장치 |
|---|---|
| getTeamTimesheetMatrix | `TeamScope.membersOf` 로 행 집합 고정 → 그 accountId 만 SQL `IN` |
| decideTimesheets | 건별 `ApprovalService.decideApproval` → `assertTargetVisible`(= TimesheetAccess) → 엔진 결재 자격 |
| getTimesheetDetail | `TimesheetAccess.canView` |
| getApprovalDetail / History / Certificate | 어댑터 `canView` = TimesheetAccess |
| listInbox / listNotifications | 참여자 행(actor_key/recipient_key) + 어댑터 filterVisible |
| 엑셀 내보내기 | 매트릭스 응답만 씀(서버 경로 없음) |
| getMyTimesheet / submitTimesheet | principal 고정, payload 에 accountId 없음 |

- **엔진 변경 1**: `ApprovalService.assertTargetVisible` 과 `CertificateService.getCertificate` 가 `adapter.canView(target, principal, { state })` 로 세 번째 인자를 넘긴다. ISSUE 어댑터는 무시한다(시그니처 호환).
- **가드 `{teamLead:true}`**(`permissionGuard.js`): `meta.teamLead && !(await isTeamLead(principal.accountId))` → `PermissionError(PERMISSION_TEAM_LEAD_REQUIRED)`. 테이블 미준비면 false(fail-close). `PermissionMap.js` 주석에 축 추가. **계약 테스트** `permissionMap.contract.test.js` 의 "최소 한 축" 단언에 `meta.teamLead` 를 넣고, `teamLead !== undefined` 이면 `true` 인지 단언.
- **팀장 교체 시**: 이미 제출된 요청의 결재선은 제출 시 고정(엔진 규칙). 옛 팀장은 결재자로 남아 업무함에서 결정할 수 있고, 새 팀장은 매트릭스에서 보지만 결정 자격은 없다(`myTurn=false`). 재라우팅은 범위 밖 — 팀 삭제 시 설정 화면이 "열린 요청 N건은 기존 결재선 유지"를 안내한다(`deleteTimesheetTeam.openCount`).

### 4.4 결재선 해석 (`TimesheetRouting.resolveSteps(subjectId, { violations, policy })`)

```
1. team = TeamScope.memberTeamOf(subjectId)                → 없음/비활성: TIMESHEET_NO_TEAM
2. leads = team.leadKeys − {subjectId}                     → 비면: TIMESHEET_NO_APPROVER
3. steps = [{ approverKeys: leads, requiredApprovals: 1, stepName: team.displayName }]
4. team.secondStepGroup 있으면 ApprovalService.expandApprovalGroup(key) → { ..., stepName: group.displayName }
      (없는·비활성 그룹 → INVALID_APPROVER_CONFIGURATION)
5. violationDecision(...).extraStep && policy.timesheetExceptionGroup → 같은 방식으로 마지막 단계에 추가
      (EXTRA_STEP 인데 그룹 미설정 → INVALID_APPROVER_CONFIGURATION — 조용히 단계를 빼면 통제가 사라진다)
6. normalizeSteps(steps)  — 한 사람 한 단계(I6). 2단계 그룹에 대상자 본인이 있으면 본인을 뺀다(자기 승인 금지)
```
- 단계 이름은 **관리자가 입력한 데이터**(팀 이름·그룹 표시 이름)라 "서버는 문구를 만들지 않는다" 규칙에 걸리지 않는다.
- 승인자 명부(registry) 검사는 건너뛴다(`skipRegistryCheck`) — 명부는 "요청자가 고를 수 있는 사람"을 제한하는 장치이고, 이 결재선은 관리자가 팀 설정으로 정했다.

### 4.5 제출 (`TimesheetService.submitTimesheet`)

```
principal = req.principal; now = clock(); policy = settingsRepository.getPolicy()
unit = policy.approvalUnit; tz = policy.timesheetTimezone
1. parsePeriodKey(periodKey) && periodKey 형식이 현재 unit 과 같음        else TIMESHEET_PERIOD_INVALID
   range = periodRange(periodKey, {timeZone: tz}); now < range.start       → TIMESHEET_PERIOD_INVALID(미래 기간)
2. latest = repo.findLatest(accountId, periodKey)
   latest PENDING && supersedes !== latest.requestId                      → ALREADY_OPEN
   latest APPROVED && !driftDetectedAt                                     → ALREADY_DECIDED
3. collected = WorklogCollector.collectMine({ range, tz })  (asUser — §4.7)
   entries = normalizeWorklogs(collected.worklogs, {accountId, range})
   hash = contentHashOf({accountId, periodKey, entries})
   hash !== expectedHash                                                   → TIMESHEET_CONTENT_CHANGED
   entries.length === 0 && !policy.timesheetAllowEmpty                     → TIMESHEET_EMPTY
4. { violations, total } = evaluateLimits(entries, { timeZone: tz, now, rules, createdAtById })
   decision = violationDecision(violations, policy.timesheetViolationAction)
   decision.block                                                          → TIMESHEET_LIMIT_BLOCKED (cause: {violations})
5. steps = TimesheetRouting.resolveSteps(accountId, { violations, policy })
6. requestId = uuid()   ← 저장 순서 때문에 미리 만든다
   repo.insertSubmission({ requestId, accountId, periodKey, unit, tz, range, blob: encodeSnapshot(entries),
                           summary, hash, violations(≤50), violationCount: total, violationAction, now })
   repo.upsertWorklogRefs(requestId, entries.map(e => e.worklogId))      // 200건씩 multi-row
7. ApprovalService.createForTarget(req, { adapter, target, requestId, resolvedSteps: steps,
       snapshot: { title: collected.displayName, contentHash: hash }, skipRegistryCheck: true, expiresAt: null, cc: [] })
   ALREADY_OPEN(경합) 이면 6 의 부속 행은 고아로 남는다 → 스윕이 정리(§4.6 끝)
8. 응답 §2.1
```
- **부속 행을 요청보다 먼저 쓰는 이유**: 요청이 LIVE 가 되는 순간부터 트리거가 그 기간을 감시해야 한다. 순서가 반대면 "요청은 있는데 스냅샷·참조가 없는" 틈에 들어온 변경을 놓친다. 고아 부속 행은 무해하다(조회가 항상 `approval_request` 와 JOIN 한다).
- **엔진 변경 2** (`ApprovalService.createForTarget(request, opts)`): 선택 인자 `requestId`, `resolvedSteps`(있으면 `expandRequestedSteps(payload.steps)` 대신 그대로), `snapshot`(있으면 `describe` 생략), `skipRegistryCheck`, `expiresAt`, `cc`. 없으면 지금과 동일. `ApprovalRepository.createRequest` 에 선택 인자 `requestId`(없으면 `this.uuid()`). INSERT 컬럼·바인딩 수(30) 무변경.
- 응답 직전 `getMyTimesheet` 캐시 무효화는 프론트 몫.

### 4.6 변경 감지 — 트리거·스윕 (`TimesheetDriftService`)

**방식: 기간 전체를 다시 해시하지 않고, 바뀐 워크로그 하나를 스냅샷과 대조한다.**
전체 재해시는 asApp 으로 그 사용자 기간의 워크로그를 전부 다시 읽어야 하고(사용자당 이슈 수십 회), 제출 때 asUser 가 못 본 이슈(권한 상실 등)의 워크로그가 asApp 에는 보여 **변경이 없어도 불일치**가 난다. 워크로그 단위 대조는 이벤트 1건당 asApp 0~1회이고 이 오탐이 없다.

```
applyChanges(changes, now)     // changes = [{ worklogId, current: {issueId, authorId, started, seconds} | null }]
  1. 후보 요청 찾기(SQL 2회, JOIN approval_request: commit_state='LIVE' AND status IN ('PENDING','APPROVED')
                     AND s.drift_detected_at IS NULL)
     (a) refs: timesheet_worklog_ref WHERE worklog_id IN (...)                 → 그 워크로그를 담은 요청
     (b) 범위: timesheet_submission WHERE subject_account IN (authors) AND period_start <= started < period_end
  2. 후보마다 decodeSnapshot → diffWorklog. decode 실패 = 판정 불가 → 건너뛰고 로그(오탐으로 만료시키지 않는다)
  3. changed:
     PENDING  → ApprovalRepository.closeBySystem(id, s => expireByContentChange(s, {now}))
                → repo.markDrift(id, {now, kind, worklogId})  → ExpiryService.notifyClosed 와 같은 알림 경로
     APPROVED → appendEvent(CHANGED_AFTER_APPROVAL, eventId = deterministic(requestId, 'CHANGED_AFTER_APPROVAL', null, 'drift'))
                → repo.markDrift(...)  — UPDATE … SET drift_*=?, rev = rev + 1 WHERE request_id=? AND drift_detected_at IS NULL
                → rowsAffected 1 일 때만 알림(kind CHANGED_AFTER_APPROVAL, 수신: 요청자 + APPROVE 한 결재자)
     순서 "이벤트 → 클레임 → 알림": 이벤트는 결정적 id 라 재시도해도 1건, 클레임이 알림 중복을 막는다.
  4. 예외는 건별로 삼키고 요약만 반환. **throw 금지**(AGENTS.md 트리거 규칙)
```

**트리거 `onWorklogChanged(event)`** — `avi:jira:created|updated|deleted:worklog`
- 페이로드에서 `worklog.id`(+있으면 issueId)만 신뢰한다. 형태가 미검증(T1)이라 내용 필드에 기대지 않는다.
- created/updated: asApp `POST /rest/api/3/worklog/list {ids:[id]}` 1회(사유 `'timesheet-drift-trigger'`) → current. 빈 응답(이미 삭제) = null.
- deleted: current = null, 후보는 refs(a)로만 찾는다.
- 타임시트 요청이 하나도 없는 사이트는 SQL `SELECT 1 FROM timesheet_submission LIMIT 1` 로 바로 끝낸다(asApp 호출 0). 결과는 사용자에게 반환하지 않는다(AGENTS asApp 1번).
- 라이선스로 막지 않는다. 알림 생성만 `shouldEmitNotifications` 가 막는다(기존 NotificationService 경로).

**스윕 `runTimesheetSweep`** — 시간당 `scheduledTrigger`
- 잡 2개: `approval_job_state` 의 `ts-worklog-updated`, `ts-worklog-deleted`. 리스는 ExpiryService.acquireLease 패턴(LEASE 10분, REST 50분).
- 예산: 실행당 **20초**(벽시계), 요청 수 상한 30. 남으면 `cursor_value` 에 다음 `since` 를 남기고 끝낸다.
- `updated`: asApp `GET /rest/api/3/worklog/updated?since={cursor ?? watermark}` → `values[].worklogId` → 1000건씩 `POST /rest/api/3/worklog/list` → applyChanges. `deleted`: `GET /rest/api/3/worklog/deleted?since=` → applyChanges(current=null).
- **watermark 규칙**: `lastPage === true` 까지 다 돈 회차에만 `watermark = until`, `cursor_value = NULL`. 예산으로 끊기면 `cursor_value = 응답 until` 만 갱신하고 watermark 는 그대로(AGENTS "미완주 시 watermark 를 전진시키지 않는다"). 다음 회차는 cursor 가 있으면 cursor 부터.
- 첫 실행(watermark NULL): `now − 24h`. 타임시트 요청이 하나도 없으면 watermark 만 `now` 로 두고 끝낸다.
- 정리: 고아 부속 행(요청 없음, created_at < now − 1h) `DELETE … LIMIT 500` 1회.
- 트리거와 스윕이 같은 변경을 두 번 처리해도 결과는 같다(이벤트 결정적 id, 클레임 조건부 UPDATE, `closeBySystem` 은 PENDING 아니면 no-op).

**감지 한계(수용 기준 옆에 함께 적는다)**
1. 제출 시점에 대상자가 볼 수 없던 이슈의 워크로그는 스냅샷에 없다. 그 워크로그가 나중에 바뀌면 "CREATED" 로 감지되지만, 안 바뀌면 영영 승인 범위 밖이다 — 승인 범위 = 스냅샷 집합.
2. 이벤트·스윕 둘 다 놓치는 변경(스윕 watermark 이전 장애 등)은 감지되지 않는다.
3. 월 단위의 WEEKLY_MAX 는 기간에 들어온 워크로그만 합산한다.

### 4.7 워크로그 수집 (`WorklogCollector`)

**asUser — 제출·미리보기(`collectMine({ range, tz })`)**
1. `GET /rest/api/3/myself` → `accountId`(principal 과 대조, 다르면 PERMISSION_DENIED), `displayName`.
2. `POST /rest/api/3/search/jql` `{ jql, fields:['summary','project'], maxResults:100, nextPageToken }`
   jql = `worklogAuthor = currentUser() AND worklogDate >= "{localDateOf(start−1일)}" AND worklogDate <= "{localDateOf(end+1일)}"` — JQL 날짜는 **검색하는 사람의 타임존**으로 해석되므로(T5) 앞뒤 하루를 넓히고 정밀 판정은 3단계 epoch 로 한다.
3. 이슈마다 `GET /rest/api/3/issue/{id}/worklog?startedAfter={start−1일}&startedBefore={end+1일}&maxResults=5000` (동시 6개). `total > 받은 수` 면 `startAt` 페이지.
4. `normalizeWorklogs` 가 author·range 로 거른다. `createdAtById` 는 응답 `created` 로 만든다(BACKDATED 용, 지문엔 안 넣음).
- 상한: 이슈 200개, 워크로그 2000건 → 넘으면 `TIMESHEET_TOO_LARGE`.
- route 는 각 값만 보간(쿼리스트링 통째 보간 금지 — CLAUDE.md route 인코딩 함정).

**asApp — 트리거·스윕 전용(`fetchWorklogsByIdAsApp(ids, reason)`, `listUpdatedSince`, `listDeletedSince`)**
- `RequestJira.asApp(path, init, { reason })` — 사유 문자열 강제. 결과는 `applyChanges` 에만 넘기고 어떤 resolver 응답에도 섞지 않는다.

### 4.8 정책 키 (`SettingsRepository` — 기본값·KVS 키·검증 **세 곳 동시**)

| 키 | KVS 키 | 기본값 | 형 / 검증(`normalizeSettingsPatch`) |
|---|---|---|---|
| `approvalUnit` | `approval:settings:approvalUnit` | `'MONTH'` | `'MONTH'\|'WEEK'` |
| `timesheetTimezone` | `approval:settings:timesheetTimezone` | `'Asia/Seoul'` | `isValidTimeZone` |
| `timesheetAllowEmpty` | `approval:settings:timesheetAllowEmpty` | `true` | boolean |
| `timesheetDailyMaxMinutes` | `approval:settings:timesheetDailyMaxMinutes` | `720` | 정수 0..1440 (0=끔) |
| `timesheetWeeklyMaxMinutes` | `approval:settings:timesheetWeeklyMaxMinutes` | `3120` | 정수 0..10080 |
| `timesheetFutureDateCheck` | `approval:settings:timesheetFutureDateCheck` | `true` | boolean |
| `timesheetBackdateMaxDays` | `approval:settings:timesheetBackdateMaxDays` | `0` | 정수 0..365 |
| `timesheetViolationAction` | `approval:settings:timesheetViolationAction` | `'WARN'` | `'WARN'\|'EXTRA_STEP'\|'BLOCK'` |
| `timesheetExceptionGroup` | `approval:settings:timesheetExceptionGroup` | `''` | `''` 또는 존재하는 approval_group 키(≤255). `EXTRA_STEP` 인데 `''` 면 저장 거부(`INVALID_TARGET`) |

- `PROJECT_OVERRIDABLE_KEYS` 는 지금 "restrictAccess·statusLabels 제외" 필터다 → **전역 전용 집합 `GLOBAL_ONLY_KEYS`** 로 바꾸고 위 9개를 넣는다.
- `SettingsPolicyKeys.test.js` 가 기본값↔KVS 키 대조를 이미 한다. 새 테스트: 9개 키가 `PROJECT_OVERRIDABLE_KEYS` 에 없다.
- `approvalUnit` 이름은 CLAUDE.md "정책값 `approvalUnit`" 을 그대로 따른다(타임시트 전용임을 주석에 적는다).

### 4.9 R2 — 증명서 대상 이름

- 결정: **대상 종류별 TargetView** 로 그린다. TIMESHEET 은 "대상자 표시 이름 + 기간 키 + 기간 범위(+타임존) + 합계·건수 + 지문"을 증명서 사실 블록으로 준다(`target` + `timesheet` 블록, §2.2). 프론트가 `t('cert.timesheet.subject', …)` 로 문장을 만든다.
- 이름은 **제출 시점 스냅샷**(`target_title`)이다. 증명서는 요청 당시 사실 문서라 Jira 현재 이름을 다시 읽지 않는다(Jira 호출 0 유지).
- ISSUE 의 프로젝트 이름(R2 원래 지적)은 이번에 손대지 않는다 — ISSUE 진입점이 없다(Q1). transition-approval 에서 권장안 (a)(열람 확인 후 describe 1회)로 처리한다.
- CertificateService 변경: `fingerprint` 뒤에 `adapter.certificateExtra?.(state).catch(() => null)` 를 불러 결과를 `timesheet` 키로 싣는다(ISSUE 는 키 자체가 없음).

### 4.10 R3 — invocation 캐시 (`src/permission/InvocationScope.js`)

- `node:async_hooks` 의 `AsyncLocalStorage` 로 resolver 호출 하나의 수명을 갖는 `Map` 을 둔다.
  `runInInvocation(fn)` · `memo(key, loader)`(스코프 밖이면 캐시 없이 loader 실행).
- `guardedDefine` 의 `withSchema` 래퍼 안쪽에서 `runInInvocation` 으로 handler 를 감싼다 → 가드와 서비스가 같은 스코프를 공유한다. 모듈 수준 Map 이 아니라서 warm runtime 재사용에도 다음 호출로 새지 않는다(core-port 검증 R3 의 "invocation 단위로 비우는 장치").
- 적용: `JiraPermission.getIssueAccess` → `memo('issueAccess:'+issueId, …)`, `TeamScope.ledTeams/membersOf` → `memo('teamLead:'+accountId, …)`.
- 테스트: `getIssueApproval` 1회에 mypermissions 호출 1회(현재 2회), 스코프 밖 호출은 캐시 안 됨, 두 invocation 사이 캐시 공유 없음.
- 실패 대비: `AsyncLocalStorage` 가 런타임에 없으면(T10) memo 가 loader 를 그대로 부른다 — 정확성은 그대로, 호출량만 지금과 같다.

### 4.11 그 밖의 서비스 변경

| 파일 | 변경 |
|---|---|
| `InboxService.refreshSnapshots` | meta 의 `periodKey`·`subjectAccountId` 를 항목에 싣는다. TIMESHEET 행은 `issueKey`·`projectId` 수렴을 하지 않는다(null 유지) |
| `NotificationService` | `selectNotificationRecipients` 에 `CHANGED_AFTER_APPROVAL`(요청자 + APPROVE 결정자), `notificationTemplate` 에 2개 분기(§2.2), `toItem` 에 `periodKey`·`subjectAccountId`(요청 행 `period_key`·`subject_account` — 조회 SELECT 에 두 컬럼 추가) |
| `AppAccess.loadAccess` | `restrictAccess` 가 켜져 있으면 **타임시트 팀 구성원(LEAD·MEMBER)도 허용 집합**에 넣는다(SQL 1, 테이블 미준비면 생략). 관리자가 팀에 넣은 사람이 앱에 못 들어오는 모순을 막는다 |
| `RetentionRepository.CHILD_TABLES` | `timesheet_submission`, `timesheet_worklog_ref` 추가(둘 다 `request_id` 컬럼). `ready()` 도 함께 확인 |
| `StorageService` | 사용량 테이블 목록에 신규 4개 |
| `ExpiryService` | 무변경(타임시트 요청은 expiresAt=null 이라 마감 만료 대상이 아니다. 독촉은 currentStepOpenedAt 기준이라 그대로 적용) |

### 4.12 decideTimesheets 와 25초 한도

- `pinVerifier(principal, pin)` 1회 → 건마다 `decideApproval(..., {skipPin:true})`(bulkApprove 와 같은 경로). 시작 시각 기준 **18초 예산**을 넘으면 남은 id 를 `remaining` 으로 돌려준다.
- 건당 SQL 약 10회(load·결정 클레임·이벤트·CAS·투영·위임 조회) + Jira 0회(TIMESHEET canView 는 DB 만, 팀장 판정은 invocation 캐시). 50건 = SQL 약 500회 → 실측 전이라 **프론트가 20건씩 나눠** 부르고 `remaining` 을 이어 부른다.
- PIN 잠금 카운터는 맞는 PIN 이면 늘지 않으므로 묶음을 나눠도 PIN 입력은 사용자 기준 1회다.

### 4.13 CAS·불변식 점검

| # | 지점 |
|---|---|
| 1 | dedupe = `open:TIMESHEET:{accountId}:{periodKey}` UNIQUE. 경합 제출은 `ALREADY_OPEN`. 재제출은 `supersedes` |
| 2 | 상태는 결정에서 파생. 기간 상태도 `periodStatusOf(latest)` 파생(캐시 테이블 없음) |
| 3 | `period.js`·`limits.js` 는 timeZone·now 인자. 서비스가 `clock()` 1회로 now 를 정해 내린다 |
| 4 | `timesheet_submission.markDrift`·`timesheet_team` 수정 UPDATE 에 `rev = rev + 1` |
| 5 | 결정은 엔진 경로(`WHERE decision_type='PENDING'`). 팀 구성원 행은 결재자 행이 아니라 diff 삭제/추가 허용 |
| 6 | `CHANGED_AFTER_APPROVAL` 이벤트·`CONTENT_CHANGED` 만료 이벤트·알림 id 모두 결정적 |
| 7 | §4.3 표 |
| 8 | asApp 은 트리거·스윕의 워크로그 조회만(AGENTS 허용 1번). 제출·미리보기·상세는 asUser |
| 9 | 엔티티 프로퍼티 미사용 |
| 10 | 해당 없음(validator 미사용) |

---

## 5. 스키마·마이그레이션

### 5.1 enqueue 추가 (v015 뒤에만 붙인다, 기존 이름 무변경)

```
.enqueue('v016_create_timesheet_team_table',        CREATE_TIMESHEET_TEAM_TABLE)
.enqueue('v017_create_timesheet_team_member_table', CREATE_TIMESHEET_TEAM_MEMBER_TABLE)
.enqueue('v018_create_timesheet_submission_table',  CREATE_TIMESHEET_SUBMISSION_TABLE)
.enqueue('v019_create_timesheet_worklog_ref_table', CREATE_TIMESHEET_WORKLOG_REF_TABLE)
```
DDL 파일: `src/rdb/schema/ddl/timesheet.sql.js`(4개 export) → `ddl/index.js` re-export. `migrate.test.js` 의 이름 목록 단언 갱신.
새 테이블 추가라 첫 배포 때 major version 이 오를 수 있다(`--approve MAJOR_VERSION_RULE`, 배포 회차 몫).

### 5.2 스냅샷 저장 방식 — 확정

**요청 1건당 1행의 부속 테이블 `timesheet_submission` 에 압축 JSON(`ts1z`) 을 둔다. 워크로그별 행 테이블(`approval_snapshot`)은 만들지 않는다.**
DESIGN §8 권장안("요청 행 안 압축 JSON")의 목적(행 폭증 방지, 연 10MB 수준)은 그대로 지킨다. `approval_request` 에 직접 넣지 않는 이유:
1. `approval_request` INSERT(30컬럼·30바인딩, core-port 검증 대조 항목)와 다른 대상 종류(ISSUE·TRANSITION) 행이 타임시트 전용 컬럼 7개를 NULL 로 떠안지 않는다.
2. 변경 감지 클레임(`drift_detected_at`)의 CAS 가 요청 행 `rev` 와 섞이지 않는다 — 요청 행 `rev` 는 결정 CAS 가 쓰므로, 감지가 결정 재시도를 헛돌게 만들지 않는다.
3. 보관 기간 정리는 이미 "request_id 로 딸린 행 함께 삭제"(CHILD_TABLES) 패턴이 있다.

변경 감지의 역참조(삭제된 워크로그 id → 요청)를 위해 **좁은 참조 테이블** `timesheet_worklog_ref(worklog_id → request_id)` 하나를 둔다. `/worklog/deleted` 는 id 와 시각만 주므로(작성자·시작일 없음) 이것 없이는 삭제를 기간에 연결할 수 없다.

### 5.3 테이블 정의

```sql
CREATE TABLE IF NOT EXISTS timesheet_team (
    team_key           VARCHAR(64)  NOT NULL,          -- 서버 생성 't_' + uuid 앞 12자
    display_name       VARCHAR(120) NOT NULL,
    enabled            TINYINT(1)   NOT NULL DEFAULT 1,
    second_step_group  VARCHAR(255) NULL,              -- approval_group.group_key (2단계 PM 등)
    source_group_name  VARCHAR(255) NULL,              -- 마지막으로 가져온 Jira 그룹 이름(표시용)
    synced_at          TIMESTAMP    NULL,
    rev                INT          NOT NULL DEFAULT 1,
    created_at         TIMESTAMP    NOT NULL,
    updated_at         TIMESTAMP    NOT NULL,
    PRIMARY KEY (team_key),
    INDEX ix_ts_team_list (enabled, display_name)
)

CREATE TABLE IF NOT EXISTS timesheet_team_member (
    team_key     VARCHAR(64)  NOT NULL,
    account_id   VARCHAR(128) NOT NULL,
    role         VARCHAR(8)   NOT NULL,                -- 'LEAD' | 'MEMBER'
    member_slot  VARCHAR(128) NULL,                    -- MEMBER 면 account_id, LEAD 면 NULL
    created_at   TIMESTAMP    NOT NULL,
    PRIMARY KEY (team_key, account_id, role),
    UNIQUE KEY uq_ts_member_slot (member_slot),        -- "구성원은 한 팀에만" (NULL 은 중복 허용 → 팀장은 여러 팀 가능)
    INDEX ix_ts_member_account (account_id, role)
)

CREATE TABLE IF NOT EXISTS timesheet_submission (
    request_id         BINARY(16)   NOT NULL,
    subject_account    VARCHAR(128) NOT NULL,
    period_key         VARCHAR(16)  NOT NULL,
    period_unit        VARCHAR(8)   NOT NULL,
    time_zone          VARCHAR(64)  NOT NULL,          -- 제출 시점 정책값 — 이후 정책이 바뀌어도 경계가 고정된다
    period_start       TIMESTAMP    NOT NULL,
    period_end         TIMESTAMP    NOT NULL,
    snapshot_format    VARCHAR(8)   NOT NULL,          -- 'ts1z'
    snapshot_blob      MEDIUMTEXT   NOT NULL,
    entry_count        INT          NOT NULL,
    total_seconds      BIGINT       NOT NULL,
    content_hash       VARCHAR(80)  NOT NULL,          -- approval_request.content_hash 와 같은 값(조인 없이 매트릭스·감지에 쓴다)
    violation_json     TEXT         NULL,              -- Violation[] ≤50
    violation_count    INT          NOT NULL DEFAULT 0,
    violation_action   VARCHAR(12)  NULL,
    drift_detected_at  TIMESTAMP    NULL,
    drift_kind         VARCHAR(16)  NULL,
    drift_worklog_id   VARCHAR(20)  NULL,
    created_at         TIMESTAMP    NOT NULL,
    rev                INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (request_id),
    INDEX ix_ts_sub_subject_period (subject_account, period_start),
    INDEX ix_ts_sub_created (created_at)
)

CREATE TABLE IF NOT EXISTS timesheet_worklog_ref (
    worklog_id   VARCHAR(20)  NOT NULL,
    request_id   BINARY(16)   NOT NULL,
    PRIMARY KEY (worklog_id),                          -- 최신 제출이 덮어쓴다(ON DUPLICATE KEY UPDATE request_id=VALUES(request_id))
    INDEX ix_ts_ref_request (request_id)               -- 보관 정리·고아 정리
)
```
- `worklog_ref` 를 워크로그당 1행(최신 제출로 덮어쓰기)으로 두는 근거: 감지는 열린/승인된 최신 요청만 본다. 워크로그가 다른 기간으로 옮겨지면 그 수정 이벤트에서 옛 기간이 이미 감지(sticky)되므로, 그 뒤 삭제 이벤트는 새 요청만 보면 된다. 덮어쓰기는 `affectedRows` 가 1/2 로 갈리므로(CLAUDE.md 함정) 결과 판정에 쓰지 않는다.
- 시각 바인딩은 전부 `SqlTime.toSqlTimestamp`(TiDB 숫자 바인딩 불가 함정).
- 새 테이블 참조 전 `isTableReady()` — 매트릭스·제출·감지 모두. 미준비면 제출은 `STORAGE_NOT_READY`, 컨텍스트는 `isTeamLead:false`, 감지는 건너뜀.

### 5.4 주요 쿼리

| 용도 | SQL 요지 | 인덱스 |
|---|---|---|
| 매트릭스 | `SELECT r.…, s.total_seconds, s.entry_count, s.violation_count, s.drift_detected_at FROM approval_request r JOIN timesheet_submission s ON s.request_id=r.request_id WHERE r.target_kind='TIMESHEET' AND r.commit_state='LIVE' AND r.period_key=? AND r.subject_account IN (…)` → 대상별 `pickLatest` | `ix_request_subject (subject_account, period_key)` (기존) |
| 내 차례 | `SELECT request_id, my_turn FROM approval_inbox WHERE actor_key IN (나+위임자) AND request_id IN (…) AND role='APPROVER'` | PK 접두 `actor_key` |
| 내 최근 기간 | `… WHERE r.target_kind='TIMESHEET' AND r.subject_account=? ORDER BY r.created_at DESC LIMIT 50` | `ix_request_subject` |
| 최신 요청(기간) | `… WHERE target_kind='TIMESHEET' AND target_key=? ORDER BY revision DESC LIMIT 1` | `ix_request_target` (기존) |
| 감지 (a) | `… FROM timesheet_worklog_ref f JOIN timesheet_submission s … JOIN approval_request r … WHERE f.worklog_id IN (…)` | PK |
| 감지 (b) | `… WHERE s.subject_account IN (…) AND s.period_start <= ? AND s.period_end > ? AND s.drift_detected_at IS NULL` | `ix_ts_sub_subject_period` |
| 팀장 범위 | `SELECT m.team_key, t.display_name FROM timesheet_team_member m JOIN timesheet_team t … WHERE m.account_id=? AND m.role='LEAD' AND t.enabled=1` → 그 팀들의 MEMBER | `ix_ts_member_account`, PK |
- `IN (…)` 은 빈 배열 가드(`QueryBuilder` 가 `1 = 0` 으로 fail-close, AGENTS 체크리스트).
- `LIMIT` 은 바인딩 불가(Forge SQL, ApprovalGroupRepository 주석) → 상수 보간.

---

## 6. Jira 연결

### 6.1 manifest 변경

```yaml
  trigger:
    - key: on-install            # 기존
      …
    # 승인된·대기 중 타임시트의 워크로그가 바뀌면 감지한다. 페이로드는 id 만 믿고 내용은 asApp worklog/list 로 다시 읽는다(T1).
    - key: worklog-changed
      function: onWorklogChanged
      events:
        - avi:jira:created:worklog
        - avi:jira:updated:worklog
        - avi:jira:deleted:worklog

  scheduledTrigger:
    - key: approval-sweep        # 기존(day)
      …
    # 트리거 누락 보정 — worklog/updated·deleted since. 예산 20초, 못 끝내면 커서를 남긴다.
    - key: timesheet-sweep
      function: runTimesheetSweep
      interval: hour

  function:
    …
    - key: onWorklogChanged
      handler: index.onWorklogChanged
    - key: runTimesheetSweep
      handler: index.runTimesheetSweep
```
- **scope 추가 없음.** 워크로그 이벤트·`worklog/updated|deleted|list`·`search/jql`·`issue/{id}/worklog`·`myself` 모두 `read:jira-work`/`read:jira-user` 범위다(문서 기준, T11 에서 `forge lint` 로 확인). 쓰기(`write:jira-work`)는 이번에 없다(되돌리기·프로퍼티 게시는 범위 밖).
- 모듈 추가 → 배포 회차에 `forge install --upgrade` 필수(AGENTS 배포).
- scheduledTrigger 는 앱당 5개 한도 — 이번으로 2개.

### 6.2 REST 목록

| 호출 | 주체 | 쓰는 곳 | 근거 |
|---|---|---|---|
| `GET /rest/api/3/myself` | asUser | 제출·미리보기 | 본인 확인·표시 이름 |
| `POST /rest/api/3/search/jql` | asUser | 제출·미리보기 | 본인 워크로그가 있는 이슈 찾기 |
| `GET /rest/api/3/issue/{id}/worklog?startedAfter&startedBefore` | asUser | 제출·미리보기 | 이슈별 워크로그 |
| `POST /rest/api/3/permissions/check` + `issue/bulkfetch` (`filterVisibleIssues` 재사용) | asUser | getTimesheetDetail | 보는 사람이 볼 수 있는 이슈만 키·제목 표시 |
| `GET /rest/api/3/user/bulk` (`resolveUsers` 재사용) | asUser | 매트릭스·상세·업무함 meta | 표시 이름 |
| `GET /rest/api/3/group/member?groupname=` (`loadGroupMembersByName` 재사용) | asUser(관리자) | importTimesheetTeamMembers | 그룹 가져오기 |
| `POST /rest/api/3/worklog/list` | **asApp** `'timesheet-drift-trigger'`·`'timesheet-drift-sweep'` | 트리거·스윕 | AGENTS asApp 1번 |
| `GET /rest/api/3/worklog/updated?since=` · `/deleted?since=` | **asApp** `'timesheet-drift-sweep'` | 스윕 | AGENTS asApp 1번 |

---

## 7. 프론트

### 7.1 엔트리 — 추가 없음

- `inbox` 엔트리(`jira:globalPage`) 안 사이드바 뷰로 넣는다. 엔트리를 늘리면 manifest·craco·html 3곳과 번들이 늘고, 모달 연동(같은 resource)도 이미 inbox 에 있다.
- `inboxUrl.js`: `INBOX_VIEWS` 에 `'timesheet'`, `'teamTimesheet'` 추가(빠지면 URL 만 바뀌고 화면이 안 바뀐다 — 파일 주석의 사고). `period`·`team` URL 파라미터 파서 추가(`parseTimesheetSearch`).
- `InboxPage.jsx` groups: `work` 아래에 `{key:'timesheet', items:[내 타임시트, (isTeamLead 이면) 팀 타임시트]}` 그룹. `getTimesheetContext` 실패 시 내 타임시트만 보인다(팀 탭은 서버가 어차피 거부).
- 화면 컴포넌트는 `importWithReloadOnce` 로 lazy(배포 직후 백지 함정).

### 7.2 화면 트리

```
features/timesheet/
  MyTimesheetPage.jsx         PeriodPicker · PeriodStatusBadge · TimesheetSummary · ViolationList · SubmitBar
  TeamTimesheetPage.jsx       PeriodPicker · TeamSelect · TeamMatrixTable · BulkDecideBar · RejectDialog · 엑셀 버튼
  PeriodPicker.jsx            이전/다음 + 최근 기간 드롭다운(periods[] 배지)
  PeriodStatusBadge.jsx       Lozenge — NOT_SUBMITTED(default)·SUBMITTED(inprogress)·APPROVED(success)·REJECTED(removed)·CHANGED_AFTER_APPROVAL(moved)
  TimesheetSummary.jsx        일별 표(byDay) + 이슈별 표(issues). 시간 표기 formatSeconds(h:mm)
  ViolationList.jsx           SectionMessage(warning|error) — 위반 처리값에 따라 문구
  SubmitBar.jsx               메시지 입력 · 제출 · (PENDING) 회수 · (needsResubmit) 재제출 강조 · 수용 기준 문장 고정 노출
  TeamMatrixTable.jsx         CommonTable 재사용, 체크박스는 myTurn && SUBMITTED 행만
  BulkDecideBar.jsx           inbox BulkApproveBar 의 PIN 대화상자 재사용, 20건씩 순차 + remaining 이어 호출 + 진행률
  RejectDialog.jsx            사유 입력(rejectionReasonRequired) → decideApproval REJECT
  TimesheetSnapshotSection.jsx  모달 상세에서 getTimesheetDetail 표시(일별·이슈별·위반·drift 배너)
  exportTeamTimesheetExcel.js   utils/excel 재사용. 열 이름은 t() (core R6 교훈)
  timesheetFormat.js          formatSeconds · formatPeriod(periodKey, locale) · periodRangeLabel
features/settings/
  TimesheetSettings.jsx       탭 컨테이너: 정책 섹션 + 팀 섹션
  TimesheetPolicySettings.jsx 단위·타임존(Select, Intl.supportedValuesOf('timeZone') 실패 시 텍스트 입력)·0건·제한선·위반 처리·예외 그룹
  TimesheetTeamSettings.jsx   목록(CursorPagingTable)
  TeamFormModal.jsx           이름·활성·팀장(DirectoryPicker 다중, ≤10)·구성원(≤500)·2단계 그룹(listApprovalGroups)·"Jira 그룹에서 가져오기"
```
- `SettingsPage.jsx` tabs 두 곳(41·84행 배열)에 `{key:'timesheet', label: t('policy.settings.tab.timesheet')}` 추가.
- `entries/modal.jsx`: `target.kind === 'TIMESHEET'` 이면 상세 헤더를 "대상자 · 기간"으로, 본문에 `TimesheetSnapshotSection`. 요청 intent(`request`/`resubmit`)의 ISSUE 전용 분기(131행)는 그대로 둔다(타임시트 제출은 모달이 아니라 내 타임시트 탭).
- `InboxTable`·`exportInboxExcel`: TIMESHEET 행 제목 = `t('timesheet.inbox.title', {name: title, period: formatPeriod(periodKey)})`, 이슈 링크 칸 비움.
- `NotificationPanel`: 새 templateKey 2개, `vars` 에 `period` 를 프론트가 `periodKey` 로 채운다.
- `CertificateSheet`·`exportCertificatePdf`: `targetKind==='TIMESHEET'` 분기 — 대상자·기간·범위·합계·지문.
- `ApprovalDetail` 이벤트 타임라인: `CHANGED_AFTER_APPROVAL` 라벨(state 네임스페이스).
- iframe 함정: 매트릭스 표는 `100vh` 금지, 높이는 내용이 정한다.

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const timesheetKeys = {
  all: ['timesheet'],
  context: () => [...timesheetKeys.all, 'context'],
  mine: (periodKey) => [...timesheetKeys.all, 'mine', periodKey ?? '-'],
  matrix: (teamKey, periodKey) => [...timesheetKeys.all, 'matrix', teamKey ?? '-', periodKey ?? '-'],
  detail: (requestId) => [...timesheetKeys.all, 'detail', String(requestId)],
};
// settingsKeys 에 추가
timesheetTeams: (params) => [...settingsKeys.all, 'timesheetTeams', params ?? null],
timesheetTeam: (teamKey) => [...settingsKeys.all, 'timesheetTeam', teamKey ?? null],
```
모달에서 결정 후 부모(inbox iframe)의 `onClose` 가 `timesheetKeys.all` 을 invalidate 한다(키 불일치면 조용히 낡는다 — 팩토리 주석).

---

## 8. i18n 키 (kr / en) — `npm run merge` 필수

### 8.1 신규 `locales/{kr,en}/timesheet.json`

| 키 | kr | en |
|---|---|---|
| `timesheet.nav.mine` | 내 타임시트 | My timesheet |
| `timesheet.nav.team` | 팀 타임시트 | Team timesheets |
| `timesheet.period.month` | {{year}}년 {{month}}월 | {{month}}/{{year}} |
| `timesheet.period.week` | {{year}}년 {{week}}주차 | Week {{week}}, {{year}} |
| `timesheet.period.range` | {{start}} ~ {{end}} ({{timeZone}}) | {{start}} – {{end}} ({{timeZone}}) |
| `timesheet.period.prev` / `.next` | 이전 기간 / 다음 기간 | Previous / Next |
| `timesheet.status.NOT_SUBMITTED` | 미제출 | Not submitted |
| `timesheet.status.SUBMITTED` | 제출됨 | Submitted |
| `timesheet.status.APPROVED` | 승인됨 | Approved |
| `timesheet.status.REJECTED` | 반려됨 | Rejected |
| `timesheet.status.CHANGED_AFTER_APPROVAL` | 승인 후 변경됨 | Changed after approval |
| `timesheet.status.needsResubmit` | 재제출 필요 | Resubmission needed |
| `timesheet.summary.total` | 합계 {{hours}} | Total {{hours}} |
| `timesheet.summary.count` | 작업 로그 {{count}}건 | {{count}} work logs |
| `timesheet.summary.byDay` | 일별 | By day |
| `timesheet.summary.byIssue` | 이슈별 | By work item |
| `timesheet.summary.hiddenIssue` | 볼 수 없는 이슈 | Restricted work item |
| `timesheet.summary.empty` | 이 기간에 기록한 작업 로그가 없습니다. | No work logged in this period. |
| `timesheet.submit.button` | 제출 | Submit |
| `timesheet.submit.resubmit` | 다시 제출 | Resubmit |
| `timesheet.submit.cancel` | 제출 회수 | Withdraw |
| `timesheet.submit.message` | 결재자에게 남길 말(선택) | Note to approver (optional) |
| `timesheet.submit.changedSince` | 제출 후 작업 로그가 바뀌었습니다. 다시 제출해야 합니다. | Your work logs changed after submission. Please resubmit. |
| `timesheet.submit.notStarted` | 아직 시작하지 않은 기간은 제출할 수 없습니다. | You can't submit a period that hasn't started. |
| `timesheet.submit.routing` | 결재: {{team}} 팀장 | Approval: {{team}} lead |
| `timesheet.notice.acceptance` | 작업 로그는 미리 막히지 않습니다. 승인 후 바뀐 내용은 감지해 다시 승인받습니다. | Work logs aren't blocked in advance. Changes after approval are detected and need re-approval. |
| `timesheet.violation.title.WARN` | 제한선을 넘은 기록이 있습니다 | Some entries exceed the limits |
| `timesheet.violation.title.EXTRA_STEP` | 제한선 초과 — 예외 승인 단계가 추가됩니다 | Limits exceeded — an exception approval step will be added |
| `timesheet.violation.title.BLOCK` | 제한선 초과 — 제출할 수 없습니다 | Limits exceeded — you can't submit |
| `timesheet.violation.DAILY_MAX` | {{date}}: 하루 {{hours}} (한도 {{limit}}) | {{date}}: {{hours}} in a day (limit {{limit}}) |
| `timesheet.violation.WEEKLY_MAX` | {{week}}: 주 {{hours}} (한도 {{limit}}) | {{week}}: {{hours}} in a week (limit {{limit}}) |
| `timesheet.violation.FUTURE_DATE` | {{date}}: 미래 날짜 기록 | {{date}}: logged for a future date |
| `timesheet.violation.BACKDATED` | {{date}}: {{days}}일 뒤에 기록(한도 {{limit}}일) | {{date}}: logged {{days}} days later (limit {{limit}}) |
| `timesheet.violation.more` | 외 {{count}}건 | and {{count}} more |
| `timesheet.team.select` | 팀 | Team |
| `timesheet.team.all` | 전체 팀 | All teams |
| `timesheet.team.column.member` / `.status` / `.total` / `.count` / `.violations` / `.submittedAt` / `.step` | 팀원 / 상태 / 합계 / 건수 / 위반 / 제출일 / 결재 단계 | Member / Status / Total / Logs / Violations / Submitted / Step |
| `timesheet.team.summary` | 전체 {{total}} · 미제출 {{notSubmitted}} · 제출 {{submitted}} · 승인 {{approved}} · 반려 {{rejected}} · 변경 {{changed}} | {{total}} total · {{notSubmitted}} not submitted · {{submitted}} submitted · {{approved}} approved · {{rejected}} rejected · {{changed}} changed |
| `timesheet.team.approveSelected` | 선택 {{count}}건 승인 | Approve {{count}} selected |
| `timesheet.team.progress` | {{done}}/{{total}} 처리 중 | Processing {{done}}/{{total}} |
| `timesheet.team.result` | 승인 {{approved}}건, 실패 {{failed}}건 | {{approved}} approved, {{failed}} failed |
| `timesheet.team.reject` | 반려 | Reject |
| `timesheet.team.rejectReason` | 반려 사유 | Reason for rejection |
| `timesheet.team.export` | 엑셀로 내보내기 | Export to Excel |
| `timesheet.team.empty` | 이끄는 팀에 구성원이 없습니다. | Your team has no members. |
| `timesheet.inbox.title` | {{name}} · {{period}} 타임시트 | {{name}} · {{period}} timesheet |
| `timesheet.detail.drift` | {{date}}에 승인된 내용이 바뀐 것을 감지했습니다({{kind}}). | A change to the approved content was detected on {{date}} ({{kind}}). |
| `timesheet.detail.driftKind.CREATED` / `.UPDATED` / `.DELETED` | 추가 / 수정 / 삭제 | added / edited / deleted |
| `timesheet.settings.title` | 타임시트 승인 | Timesheet approval |
| `timesheet.settings.unit` / `.unit.MONTH` / `.unit.WEEK` | 승인 단위 / 월 / 주(ISO) | Approval period / Month / Week (ISO) |
| `timesheet.settings.unitChangeWarning` | 단위를 바꾸면 새 제출부터 적용됩니다. 이미 제출된 기간은 그대로 남습니다. | Changing the period applies to new submissions only. Existing submissions stay as they are. |
| `timesheet.settings.timeZone` | 기간 기준 시간대 | Time zone for periods |
| `timesheet.settings.allowEmpty` | 작업 로그가 없는 기간도 제출 허용 | Allow submitting empty periods |
| `timesheet.settings.dailyMax` / `.weeklyMax` | 하루 최대(분, 0=끔) / 주 최대(분, 0=끔) | Daily maximum (minutes, 0 = off) / Weekly maximum (minutes, 0 = off) |
| `timesheet.settings.futureDate` | 미래 날짜 기록 검사 | Check entries logged for future dates |
| `timesheet.settings.backdate` | 소급 입력 허용 일수(0=끔) | Days allowed for late logging (0 = off) |
| `timesheet.settings.action` / `.action.WARN` / `.action.EXTRA_STEP` / `.action.BLOCK` | 위반 처리 / 경고만 / 예외 승인 단계 추가 / 제출 거부 | When limits are exceeded / Warn only / Add exception approval step / Block submission |
| `timesheet.settings.exceptionGroup` | 예외 승인 그룹 | Exception approval group |
| `timesheet.settings.teams` | 팀 | Teams |
| `timesheet.settings.team.name` / `.leads` / `.members` / `.secondStep` / `.enabled` | 팀 이름 / 팀장 / 구성원 / 2단계 결재 그룹 / 사용 | Team name / Leads / Members / Second approval group / Enabled |
| `timesheet.settings.team.import` | Jira 그룹에서 가져오기 | Import from Jira group |
| `timesheet.settings.team.importHint` | 가져온 뒤 저장해야 반영됩니다. 그룹이 바뀌어도 자동으로 따라가지 않습니다. | Save to apply. The team won't follow later group changes automatically. |
| `timesheet.settings.team.openRequests` | 진행 중인 요청 {{count}}건은 기존 결재선으로 계속됩니다. | {{count}} open requests keep their current approvers. |

### 8.2 기존 네임스페이스 추가 키

| 키 | kr | en |
|---|---|---|
| `error.PERMISSION_TEAM_LEAD_REQUIRED` | 팀장만 볼 수 있습니다. | Only team leads can view this. |
| `error.TIMESHEET_PERIOD_INVALID` | 제출할 수 없는 기간입니다. | This period can't be submitted. |
| `error.TIMESHEET_EMPTY` | 작업 로그가 없는 기간은 제출할 수 없습니다. | You can't submit a period with no work logs. |
| `error.TIMESHEET_LIMIT_BLOCKED` | 제한선을 넘은 기록이 있어 제출할 수 없습니다. | You can't submit because some entries exceed the limits. |
| `error.TIMESHEET_CONTENT_CHANGED` | 화면을 연 뒤 작업 로그가 바뀌었습니다. 내용을 다시 확인하세요. | Your work logs changed. Review them and try again. |
| `error.TIMESHEET_NO_TEAM` | 소속 팀이 없습니다. 관리자에게 팀 등록을 요청하세요. | You're not in a team. Ask an admin to add you. |
| `error.TIMESHEET_NO_APPROVER` | 팀에 결재할 팀장이 없습니다. | Your team has no lead to approve. |
| `error.TIMESHEET_TOO_LARGE` | 이 기간의 작업 로그가 너무 많아 처리할 수 없습니다. | This period has too many work logs to process. |
| `error.TIMESHEET_TEAM_MEMBER_CONFLICT` | 이미 다른 팀에 속한 구성원이 있습니다. | Some members already belong to another team. |
| `notification.template.timesheetChanged` | 승인된 타임시트({{period}})가 바뀌었습니다. 다시 제출해야 합니다. | An approved timesheet ({{period}}) changed and needs resubmission. |
| `notification.template.timesheetChangedWhilePending` | 결재 중인 타임시트({{period}})가 바뀌어 요청이 닫혔습니다. 다시 제출하세요. | A timesheet under review ({{period}}) changed, so the request was closed. Please resubmit. |
| `state.event.CHANGED_AFTER_APPROVAL` | 승인 후 변경 감지 | Change detected after approval |
| `state.expiry.CONTENT_CHANGED` | 결재 중 내용 변경 | Changed while under review |
| `policy.settings.tab.timesheet` | 타임시트 | Timesheets |
| `inbox.nav.timesheetGroup` | 타임시트 | Timesheets |
| `cert.timesheet.subject` | 대상자 | Person |
| `cert.timesheet.period` | 기간 | Period |
| `cert.timesheet.total` | 합계 | Total |
| `cert.timesheet.hash` | 작업 로그 지문 | Work log fingerprint |

(정확한 기존 키 경로 `state.event.*`·`state.expiry.*` 는 frontend 가 현재 state.json 구조에 맞춘다 — 의미 단위로 위 값을 쓴다.)

---

## 9. 용량·호출량

### 9.1 용량 (200명, 월 단위, 인덱스 포함 ×2, 실측 전)

| 항목 | 연 건수 | 연 용량 |
|---|---|---|
| 타임시트 요청 + 결재자·이벤트·업무함 행(요청당 약 2.4KB, DESIGN §8) | 200×12×1.3(재제출) ≈ 3,100 | 약 15MB |
| `timesheet_submission`(blob 약 1.6KB + 행 약 0.4KB) | 3,100 | 약 12MB |
| `timesheet_worklog_ref`(워크로그당 1행 약 64B) | 200×80×12 ≈ 19.2만 | 약 25MB |
| `timesheet_team*` | 상수(팀 수십, 구성원 200) | 무시 |
| **합계(타임시트분)** | | **연 약 52MB** — 3년 보관 약 160MB |
- 주 단위면 요청 행이 약 4.3배(1.35만 건, 약 65MB+스냅샷 13MB) — 워크로그 수가 같아 ref 는 같다. DESIGN §8 의 연 110~150MB 추정 범위 안.
- 1,000명이면 선형 5배(월 단위 연 약 260MB) — 데이터 관리 화면 보관 기간 정리로 다룬다.

### 9.2 resolver 1회당 Jira 호출

| 경로 | Jira 호출 | SQL | 비고 |
|---|---|---|---|
| getTimesheetContext | 0 | 2~3 | 팀장 판정 캐시 |
| getMyTimesheet | myself 1 + search/jql ⌈이슈/100⌉ + 이슈 수(I) | 3 | I 평균 20 → 약 22회, 동시 6 → 약 4 왕복(≈2초). 상한 I=200 → 약 34 왕복(≈10초) |
| submitTimesheet | 위와 같음 + 그룹 확장(CUSTOM 0 / JIRA 그룹 ⌈n/50⌉) | 약 15 + ⌈워크로그/200⌉ | 상한 근처에서 15초 안쪽 목표(T13 실측) |
| getTeamTimesheetMatrix | user/bulk ⌈구성원/50⌉ (50명 = 1) | 3~4 | 팀원 워크로그는 읽지 않는다 |
| decideTimesheets(20건) | 0 | 약 200 | 18초 예산 + remaining |
| getTimesheetDetail | permissions/check ⌈이슈/100⌉ + bulkfetch ⌈보이는 이슈/100⌉ + user/bulk 1 | 2 | 평균 3회 |
| getApprovalDetail(TIMESHEET) | user/bulk 1(describe) | 기존 | |
| listInbox(TIMESHEET 행 포함) | 페이지당 user/bulk ⌈대상자/50⌉ | 기존 | |
| 트리거 1건 | asApp worklog/list 1(삭제는 0) | 2~6 | 200명×하루 4건 ≈ 800회/일 |
| 스윕 1회 | updated 1~2 + list ⌈n/1000⌉ + deleted 1 | 후보 수 비례 | 하루 24회 ≈ 70~100회/일 |

- N+1 제거: 팀장 매트릭스는 팀원 워크로그를 읽지 않고(제출본 요약만), 표시 이름은 `user/bulk` 일괄, 이슈 가시성은 `permissions/check` 일괄, 감지는 `worklog/list` 일괄.
- 25초 한도: getMyTimesheet·submit 은 이슈 200·워크로그 2000 상한, decideTimesheets 는 예산+이어 호출, 스윕은 20초 예산+커서.

---

## 10. 미검증

`_workspace/timesheet-approval/04_spike_todo.md` 에 확인 방법까지 적었다. 요지:

| # | 항목 | 영향 |
|---|---|---|
| T1 | 워크로그 이벤트 페이로드에 `worklog.id` 가 오는가(삭제 포함) | 트리거 감지 성립. 없으면 스윕만으로 감지(지연 최대 1시간+) |
| T2 | 이벤트가 REST·자동화·가져오기로 만든 워크로그에도 오는가, 누락률 | 스윕 비중 |
| T3 | `worklog/updated`·`deleted` asApp: 페이지 1000, `until`·`lastPage`, 직전 1분 제외 | 스윕 watermark |
| T4 | `POST worklog/list` asApp 상한·필드(author.accountId·started·issueId) | 감지 대조 |
| T5 | `search/jql` 의 `worklogAuthor = currentUser()`·`worklogDate` 타임존 해석·`nextPageToken` | 제출 수집 완전성 |
| T6 | `issue/{id}/worklog` 의 `startedAfter/startedBefore` 단위(ms)·경계 포함 여부·`maxResults` 상한 | 수집 |
| T7 | `started` 문자열 형식(`+0900`) | 파싱 |
| T8 | Forge nodejs22 런타임 Intl 전체 ICU(IANA 타임존) | 기간 계산 전체 |
| T9 | `zlib.deflateRawSync` 런타임 사용 가능 | 스냅샷 저장 |
| T10 | `AsyncLocalStorage` 런타임 사용 가능 | R3 캐시(없어도 정확성 유지) |
| T11 | 새 scope 없이 위 API 가 다 되는가(`forge lint`·배포 후 호출) | 전체 |
| T12 | scheduledTrigger `hour` 의 실제 실행 시간 한도 | 스윕 예산 |
| T13 | 이슈 200개 기간 제출 소요 시간 | 상한값 조정 |
| T14 | 제한된 가시성(그룹·역할) 워크로그를 asUser 작성자 본인이 보는가, asApp worklog/list 가 돌려주는가 | 지문 일치 |
| T15 | Forge SQL `MEDIUMTEXT`·multi-row INSERT 200행·`ON DUPLICATE KEY UPDATE … VALUES()` | 저장 |

---

## 11. 작업 분해

### 11.1 backend 체크리스트

**도메인 (먼저, 테스트와 함께)**
- [ ] `src/domain/timesheet/period.js` + `__test__/period.test.js`(§3.1 케이스 10종)
- [ ] `snapshot.js` + 테스트(§3.2)
- [ ] `limits.js` + 테스트(§3.3)
- [ ] `status.js` + 테스트(§3.4)
- [ ] `domain/approval/constants.js`·`scopeKey.js`·`transitions.js` 추가분 + `transitions.test.js` 추가(§3.5). 기존 테스트 무변경 통과
- [ ] `grep -rn "Date.now()\|new Date()" src/domain` 0건(주석 제외)

**스키마**
- [ ] `ddl/timesheet.sql.js` 4개 + `ddl/index.js` re-export + `migrate.js` v016~v019 + `migrate.test.js` 목록

**권한·공용**
- [ ] `ErrorCodes` 9개(§2.8)
- [ ] `InvocationScope.js` + `guardedDefine` 래핑 + `JiraPermission.getIssueAccess` memo(R3) + 호출 1회 단언 테스트
- [ ] `permissionGuard` `{teamLead}` 축 + `PermissionMap` 11개 선언 + 주석 + 계약 테스트 축 목록 갱신
- [ ] `AppAccess` 팀 구성원 허용(restrictAccess 켜짐일 때만, 테이블 미준비 생략)

**엔진 최소 변경(시그니처 호환)**
- [ ] `ApprovalService.assertTargetVisible`·`CertificateService` → `canView(target, principal, {state})`
- [ ] `ApprovalService.createForTarget` 선택 인자(requestId·resolvedSteps·snapshot·skipRegistryCheck·expiresAt·cc), `ApprovalRepository.createRequest` 선택 `requestId` — INSERT 30컬럼 유지
- [ ] `CertificateService` `certificateExtra` 선택 호출
- [ ] `TargetRegistry` 에 TIMESHEET 등록

**타임시트**
- [ ] `TimesheetTargetAdapter` + 테스트(IssueTargetAdapter.test 구조: parse·키 왕복·canView 4갈래·filterVisible 전부 visible·columnsOf)
- [ ] `TeamRepository`·`TeamScope`·`TimesheetAccess` + 테스트: **다른 팀 accountId 로 매트릭스·상세·결정 호출 시 거부**(core-port 검증 "팀장 범위 다른 팀 테스트 필수"), 비활성 팀 팀장 = 팀장 아님, 본인 제외
- [ ] `TimesheetRouting` + 테스트: 팀 없음·팀장 없음(본인뿐)·2단계 그룹·EXTRA_STEP 단계 추가·그룹 미설정 오류·자기 승인 제거
- [ ] `WorklogCollector`(asUser/asApp 분리, route 값 보간, 상한) + 목 테스트
- [ ] `TimesheetRepository`(submission·ref upsert·매트릭스·최근 기간·감지 후보·markDrift CAS `rev = rev + 1`·고아 정리)
- [ ] `TimesheetService` 6개 + 테스트: expectedHash 불일치·0건 정책·BLOCK·미래 기간·ALREADY_OPEN·ALREADY_DECIDED·supersedes·부속 행이 요청보다 먼저 써지는 순서·decideTimesheets 예산(remaining)·PIN 1회
- [ ] `TeamService` 5개 + 감사 기록 + 구성원 충돌 사전 검사 + rev CAS
- [ ] `TimesheetDriftService` + 테스트: 4종 diff → PENDING 만료/APPROVED 플래그, 이미 플래그면 알림 0, decode 실패 건너뜀, 예외가 밖으로 안 나감, watermark 는 lastPage 때만 전진, 타임시트 0건 사이트는 asApp 0회
- [ ] `trigger/onWorklogChanged.js`·`runTimesheetSweep.js` + `index.js` export + CONTROLLER_REGISTRARS
- [ ] `SettingsRepository` 정책 9개(기본값·KVS 키·`GLOBAL_ONLY_KEYS`) + `SettingsService.normalizeSettingsPatch` 검증 + 테스트
- [ ] `InboxService`·`NotificationService`(수신자·템플릿·필드)·`RetentionRepository`·`StorageService`
- [ ] `manifest.yml` §6.1 (scope 무변경 확인)
- [ ] `npm test -- --runInBand` 통과

### 11.2 frontend 체크리스트

- [ ] `timesheetKeys`·`settingsKeys.timesheetTeam(s)` 팩토리(인라인 키 금지)
- [ ] `inboxUrl.js` 뷰 2개·파라미터, `InboxPage` 사이드바 그룹(팀 탭은 isTeamLead), lazy 로드
- [ ] `features/timesheet/*` §7.2 — MyTimesheetPage(제출·회수·재제출·수용 기준 문장), TeamTimesheetPage(매트릭스·일괄 승인 20건씩·반려·엑셀)
- [ ] `entries/modal.jsx` TIMESHEET 상세 분기 + `TimesheetSnapshotSection`
- [ ] `InboxTable`·`exportInboxExcel`·`NotificationPanel`·`ApprovalDetail` 이벤트 라벨·`CertificateSheet`/`exportCertificatePdf` TIMESHEET 분기
- [ ] `SettingsPage` 탭 2곳 + `TimesheetSettings`·`TimesheetPolicySettings`·`TimesheetTeamSettings`·`TeamFormModal`
- [ ] `error.code` 분기: `TIMESHEET_CONTENT_CHANGED`(재조회 유도), `PERMISSION_TEAM_LEAD_REQUIRED`(팀 탭 숨김), `TIMESHEET_TEAM_MEMBER_CONFLICT`(충돌 구성원 표시 — `error.cause.accountIds`)
- [ ] i18n §8 kr/en 동시, `npm run merge`, 키 비대칭 0
- [ ] UI 테스트: MyTimesheetPage(제출 버튼 상태·위반 표시), TeamMatrixTable(체크 가능 행 = myTurn&&SUBMITTED), BulkDecideBar(remaining 이어 호출), inboxUrl 뷰
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui`

### 11.3 순서·의존

1. 도메인 → 2. 스키마·ErrorCodes·InvocationScope → 3. 엔진 최소 변경·어댑터·TeamScope → 4. 서비스·컨트롤러·정책 → 5. 감지 서비스·트리거·manifest → 6. 프론트(계약 §2 만 보고 병렬 가능하지만, 빌드는 백엔드 완료 후 한 번 — AGENTS 병렬 금지 규칙)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 초판 | timesheet-approval Phase 1 |
