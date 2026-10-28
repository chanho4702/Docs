# timesheet-approval 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-03 · autopilot 무인 회차 · 회차 1(초판)
> 입력: `01_architect_design.md` §2·§7·§8·§11.2, **`02_backend_report.md`(실제 shape 우선)**, `_workspace/core-port/02_frontend_report.md`
> 범위: `static/ui/src/**`, `locales/{kr,en}/**`. **백엔드 `src/**`·`manifest.yml` 무변경.** forge 명령 0회, git 인덱스 조작 0회, 리포 밖 수정 0.

## 검증 결과

```
npm run merge                     → locales\ko-KR.json, en-US.json 생성(성공 — kr·en 키 집합 동일)
npm run test:ui -- --runInBand    → Test Suites: 12 passed, 12 total / Tests: 86 passed, 86 total
                                    (기준선 8 / 58 → +4 suites, +28 tests)
npm run build:ui                  → Compiled with warnings — 전부 node_modules(@atlaskit source map ENOENT 2건,
                                    @atlaskit/react-select postcss-calc 1건). 우리 소스 ESLint 경고 0.
                                    산출 html: inbox / modal / settings / projectSettings (4, 변동 없음)
npm test -- --runInBand (백엔드)   → Test Suites: 39 passed, 39 total / Tests: 405 passed, 405 total (기준선 유지)
```

정적 대조(`_workspace/timesheet-approval/tmp/check_keys.js`):
- `static/ui/src` 의 리터럴 번역 키 전부 ko-KR·en-US 에 있음(누락 0).
- `error.json`(kr·en) 키 집합 = `ErrorCodes` 값 집합(43개) 정확히 일치.
- 동적으로 조립하는 키 묶음(`timesheet.status.*`, `violation.title.*`, `settings.unit.*`, `settings.action.*`, `detail.driftKind.*`, `inbox.type.timesheet`, `cert.target.timesheet`, `detail.event.changed_after_approval`, 알림 템플릿 2개) 누락 0.
- 인라인 쿼리키(`queryKey: [`) 신규 0(기존 `DataSettings.jsx:127` 1건은 이번 변경 아님). `100vh` 신규 0.

## 엔트리 — 추가 없음 (설계 §7.1 그대로)

`craco.config.js` ENTRIES·`public/*.html`·manifest `resources[].entry` 무변경. 타임시트 두 화면은 `inbox` 엔트리 탭, 설정은 `settings` 엔트리(+업무함 설정) 탭, 상세는 `modal` 엔트리.

## 구현 파일

**신규 `static/ui/src/features/timesheet/`**
- `MyTimesheetPage.jsx` — 기간 선택·상태 배지·live 요약·위반·제출/다시 제출/회수·제출본 보기
- `TeamTimesheetPage.jsx` — 기간·팀 선택, 요약 문구, 일괄 승인 줄, 매트릭스, 반려, 엑셀
- `PeriodPicker.jsx`, `PeriodStatusBadge.jsx`, `TimesheetSummary.jsx`(일별·이슈별 표, CommonTable), `ViolationList.jsx`, `SubmitBar.jsx`
- `TeamMatrixTable.jsx`(CommonTable), `BulkDecideBar.jsx`, `RejectDialog.jsx`, `TimesheetSnapshotSection.jsx`(모달 상세)
- `exportTeamTimesheetExcel.js`(utils/excel 재사용, 열 이름 t())
- 순수 모듈: `timesheetFormat.js`(formatSeconds·기간 키 이동·formatPeriod·periodRangeLabel·violationText·timesheetTitle), `submitPlan.js`(제출 버튼 상태), `decideTimesheetsRunner.js`(20건씩 + remaining 이어 호출), `matrixRows.js`(체크 가능 행)
- 테스트 `__test__/timesheetPure.test.js`, `__test__/MyTimesheetPage.test.jsx`, `__test__/TeamMatrixTable.test.jsx`

**신규 `static/ui/src/features/settings/`**: `TimesheetSettings.jsx`(탭 컨테이너), `TimesheetPolicySettings.jsx`(정책 9키 + `useApprovalGroupOptions`), `TimesheetTeamSettings.jsx`(목록 CursorPagingTable·삭제), `TeamFormModal.jsx`(팀장·구성원·2단계 그룹·Jira 그룹 가져오기)

**신규 기타**: `features/inbox/inboxUrl.test.js`, `locales/{kr,en}/timesheet.json`

**수정**
- `utils/queryKey/approvalKeys.js` — `timesheetKeys`, `settingsKeys.timesheetTeams/timesheetTeam`
- `features/inbox/inboxUrl.js` — `TIMESHEET_VIEWS`, `INBOX_VIEWS` 에 2개, 뷰 키 대소문자 복원, `parseTimesheetSearch`(period·team)
- `features/inbox/InboxPage.jsx` — `getTimesheetContext` 조회, 탭 2개(팀 탭은 `isTeamLead`), lazy 로드(`importWithReloadOnce`), `openRequest`, 모달 onClose 에 `timesheetKeys.all` 무효화, 새로 고침 분기 (+`InboxPage.test.jsx` 1건)
- `features/inbox/InboxTable.jsx`, `exportInboxExcel.js` — TIMESHEET 행 제목 `"{이름} · {기간} 타임시트"`, 유형 라벨
- `features/notification/NotificationPanel.jsx` — `periodKey` 로 `vars.period`·title 채움
- `features/detail/ApprovalDetail.jsx` — TIMESHEET 헤더, 스냅샷 섹션, `CHANGED_AFTER_APPROVAL` 이벤트 색·라벨, 사유 `CONTENT_CHANGED`·`CREATED/UPDATED/DELETED` 번역, TIMESHEET 에서 "승인 요청" 버튼 숨기고 안내
- `features/certificate/CertificateSheet.jsx`, `exportCertificatePdf.jsx` — TIMESHEET 분기(대상자·기간·범위·합계·위반·승인 후 변경·작업 로그 지문), 파일 이름
- `features/settings/SettingsPage.jsx` — 탭 2곳 + FEATURES 에 `timesheet`
- `features/settings/directoryApi.js` — `resolveUsersInChunks`(100명씩)
- `features/settings/exportRetentionExcel.js` — TIMESHEET 행 제목·유형

## 소비 resolver ↔ 읽는 응답 경로 (`invokeApproval` 이 `content` 를 벗긴 값 기준)

| 화면 | resolver · 보내는 payload | 읽는 경로 |
|---|---|---|
| InboxPage 탭 | `getTimesheetContext({})` (실패 → null) | `isTeamLead`, `currentPeriodKey`(다음 기간 상한) |
| MyTimesheetPage | `getMyTimesheet({periodKey?})` | `periodKey`, `period.{start,end}`, `timeZone`, `periods[].{periodKey,periodStatus}`, `live.{contentHash,entryCount,totalSeconds,byDay,issues[].{issueId,issueKey,summary,seconds}}`, `violations[]`, `violationCount`, `violationAction`, `latest.{requestId,status,periodStatus,needsResubmit,submittedAt,decidedAt,currentStepOrder,stepCount}`, `changedSinceSubmit`, `routing.teamName`, `submitBlockedCode` |
| 〃 제출 | `submitTimesheet({periodKey, expectedHash: live.contentHash, requestMessage?, supersedes?})` | `extraStepAdded`. 에러 `error.code` — `TIMESHEET_CONTENT_CHANGED`·`TIMESHEET_LIMIT_BLOCKED`·`ALREADY_OPEN`·`ALREADY_DECIDED` 면 mine 재조회 |
| 〃 회수 | `cancelApproval({requestId: latest.requestId})` | — |
| TeamTimesheetPage | `getTeamTimesheetMatrix({periodKey?, teamKey?})` | `periodKey`, `period`, `timeZone`, `teams[].{teamKey,displayName}`, `rows[].{accountId,displayName,avatarUrl,teamKey,periodStatus,needsResubmit,requestId,requestStatus,submittedAt,decidedAt,entryCount,totalSeconds,violationCount,currentStepOrder,stepCount,myTurn,driftDetectedAt}`, `summary.*`. 에러 `PERMISSION_TEAM_LEAD_REQUIRED` 는 경고로 |
| 〃 일괄 승인 | `decideTimesheets({requestIds ≤20, pin?})` 반복 | `results[].{requestId,ok,code}`, `remaining[]`(다음 묶음 앞에 다시 넣음). 묶음 에러 `PIN_*` 는 그때까지 결과와 함께 표시 |
| 〃 반려 | `decideApproval({requestId, decision:'REJECT', reason?, pin?})` | — (에러 code 표시, `REJECTION_REASON_REQUIRED` 포함) |
| 〃 PIN 필요 여부 | `getMyPinStatus({})` | `required` |
| modal 상세 | `getApprovalDetail({requestId})` | `target.{kind,title,periodKey}`, `approval.{canRequest,…}`(기존) |
| modal 스냅샷 | `getTimesheetDetail({requestId})` | `period`, `timeZone`, `entryCount`, `totalSeconds`, `byDay`, `issues[].{visible,issueKey,summary,seconds}`, `violations`, `violationCount`, `violationAction`, `drift.{detectedAt,kind}` |
| modal 이력·타임라인 | `getApprovalHistory`(기존) | `events[].eventType`='CHANGED_AFTER_APPROVAL', `reason`='CONTENT_CHANGED'·'CREATED'·'UPDATED'·'DELETED' |
| 증명서 PDF | `getApprovalCertificate({requestId})` | `targetKind`, `target.title`, `timesheet.{periodKey,periodStart,periodEnd,timeZone,entryCount,totalSeconds,violationCount,changedAfterApproval,driftDetectedAt}`, `contentHash.{algorithm,value}` |
| 업무함·엑셀 | `listInbox`(기존) | `targetKind`, `title`(대상자 이름, null 가능), `periodKey` |
| 알림 | `listNotifications`(기존) | `templateKey`(신규 2개), `periodKey`, `title` |
| 설정 정책 | `getApprovalSettings` / `saveApprovalSettings(patch: 타임시트 9키만)` | 9키 값. 응답 전체로 `settingsKeys.policy()` 갱신 |
| 설정 그룹 선택지 | `listApprovalGroups({cursor?})` 최대 5쪽 | `items[].{groupKey,displayName,enabled}`, `hasMore`, `nextCursor` |
| 설정 팀 목록 | `listTimesheetTeams({q?, cursor?})` | `items[]`(TeamSummary), `hasMore`, `nextCursor` |
| 팀 편집 | `getTimesheetTeam({teamKey})` | `team.{leadKeys,memberKeys,rev,sourceGroupName,secondStepGroup}` |
| 팀 저장 | `saveTimesheetTeam({teamKey?, rev?, displayName, enabled, leadKeys, memberKeys, secondStepGroup|null, sourceGroupName?})` | `team.teamKey`. 에러 `TIMESHEET_TEAM_MEMBER_CONFLICT` → `error.cause.accountIds` 이름으로 표시 |
| 팀 삭제 | `deleteTimesheetTeam({teamKey, rev})` | `openCount` |
| 그룹 가져오기 | `importTimesheetTeamMembers({groupName})` | `members[].{accountId,displayName,avatarUrl,accountStatus}`, `truncated` |
| 이름 해석 | `resolveUsers({accountIds ≤100})` 묶음 반복 | `items[].{accountId,displayName,avatarUrl}` |
| 보관 엑셀 | `exportExpiredApprovals`(기존) | `requests[].{subjectAccount,periodKey}` 추가 사용 |

신규 resolver 11종 전부 호출. `res.content.content` 이중 접근 없음.

## 쿼리키

```js
timesheetKeys.context()                 // InboxPage
timesheetKeys.mine(periodKey)            // MyTimesheetPage
timesheetKeys.matrix(teamKey, periodKey) // TeamTimesheetPage
timesheetKeys.detail(requestId)          // TimesheetSnapshotSection
settingsKeys.timesheetTeams({ q })       // 팀 목록(infinite)
settingsKeys.timesheetTeam(teamKey)      // 팀 편집
settingsKeys.groups({ purpose: 'timesheet' }) // 2단계·예외 그룹 선택지(GroupSettings 의 무효화 루트 ['settings','groups'] 아래)
```
무효화: 제출·회수·일괄 승인·반려·팀 저장/삭제 → `timesheetKeys.all`(+ 제출·결정은 `inboxKeys.all`). 모달 onClose → `inboxKeys.all`·`notificationKeys.unread()`·`timesheetKeys.all`.

## 추가 i18n 키 (kr·en 동시)

- **신규 `timesheet.json`** 118키: `nav.*`, `period.{month,week,range,prev,next,label,current}`, `status.*`(5 + needsResubmit), `summary.*`, `submit.*`, `notice.acceptance`(수용 기준 문장 — 내 타임시트 제출 줄·설정에 고정 노출), `violation.*`, `team.*`, `inbox.{title,someone}`, `detail.{drift,driftKind.*,snapshot,resubmitHint}`, `settings.*`(team 포함)
- `error`: 9개(`PERMISSION_TEAM_LEAD_REQUIRED`, `TIMESHEET_PERIOD_INVALID`, `TIMESHEET_EMPTY`, `TIMESHEET_LIMIT_BLOCKED`, `TIMESHEET_CONTENT_CHANGED`, `TIMESHEET_NO_TEAM`, `TIMESHEET_NO_APPROVER`, `TIMESHEET_TOO_LARGE`, `TIMESHEET_TEAM_MEMBER_CONFLICT`)
- `notification.template.{timesheetChanged,timesheetChangedWhilePending}`
- `detail.event.changed_after_approval`, `state.expiry.CONTENT_CHANGED`
- `policy.settings.tab.timesheet`, `inbox.type.timesheet`
- `cert.target.timesheet`, `cert.timesheet.{subject,period,total,violations,changed,changedAt,hash,hashHint}`

추가는 재실행 가능한 `_workspace/timesheet-approval/tmp/locales_timesheet.js`(deep-merge, CRLF·키 순서 유지)로 했다. 기존 값 변경 0.

## 설계·백엔드 shape 과 다르게 판단한 점

1. **탭 배치**: 설계 §7.1 은 "work 아래 timesheet 그룹"이지만 `AppShell` 은 첫 그룹만 탭, 나머지 그룹을 우측 액션 버튼으로 그린다. 별도 그룹이면 설정처럼 버튼이 된다. 주 동선이라 **첫 그룹(탭)에 `cc` 다음으로** 넣었다. `inbox.nav.timesheetGroup` 키는 쓰는 곳이 없어 만들지 않았다(열린 질문 QF1).
2. **번역 자리표시자**는 설계 표의 `{{x}}` 가 아니라 이 앱 `tFormat` 규약인 `{x}`.
3. **키 구조**: 같은 경로가 문자열이면서 객체일 수 없어 `timesheet.settings.unit` → `unit.label`, `settings.action` → `action.label`. 이벤트 라벨은 설계의 `state.event.CHANGED_AFTER_APPROVAL` 대신 **기존 구조 `detail.event.<소문자>`**(상세·증명서가 이미 이 규칙으로 읽는다). 만료 사유는 설계대로 `state.expiry.CONTENT_CHANGED`.
4. **재제출 supersedes**: `submitBlockedCode==='ALREADY_OPEN' && changedSinceSubmit` 일 때만 `latest.requestId` 를 보낸다. 닫힌 최신 요청은 백엔드 D5 가 잇으므로 보내지 않는다(`submitPlan.js`).
5. **위반 "외 N건"**: 백엔드 D10 의 `violationCount` 로 `violationCount - violations.length`.
6. **일괄 승인**: 설계대로 20건씩 순차, `remaining` 을 다음 묶음 앞에 다시 넣는다. 서버가 진전 없이 전부 돌려주면(약속 위반) 무한 반복 대신 그 건들을 `UNKNOWN_ERROR` 실패로 남긴다. 50건 상한 문구 없음(나눠 보내므로).
7. **체크 가능 행** = `myTurn && periodStatus==='SUBMITTED' && requestId`. 반려 버튼도 같은 행만.
8. **상세 모달 TIMESHEET**: 서버 `canRequest`(대상자 본인·최신·닫힘)가 true 여도 "승인 요청" 버튼을 숨기고 "내 타임시트 탭에서 다시 제출" 안내를 띄운다 — 모달의 요청 폼은 ISSUE 전용이라 누르면 `INVALID_TARGET` 화면이 된다.
9. **업무함 TIMESHEET 제목**: 서버 `title`(대상자 이름)이 null(조회 실패)이면 `timesheet.inbox.someone`("사용자")로 — 키 문자열·accountId 가 보이지 않게.
10. **팀 편집 이름 해석**: `resolveUsers` 상한 100명이라 팀(최대 500명)은 100명씩 나눠 부른다. 실패 묶음은 accountId 로 남는다.
11. **그룹 가져오기**: `accountStatus !== 'active'` 계정은 구성원에 넣지 않는다(비활성 계정을 결재 대상으로 두지 않기 위함, QF2). `sourceGroupName` 은 이번 편집에서 가져왔을 때만 보낸다(안 보내면 서버가 기존 값 유지 — 백엔드 계약).
12. **정책 저장**: 타임시트 9키만 patch 로 보낸다(전역 정책 폼과 서로 덮어쓰지 않게). 저장 전 검증은 서버 규칙(범위·EXTRA_STEP 인데 예외 그룹 없음)과 같게. 예외 그룹 선택지는 활성 그룹만, 목록 밖 저장값도 그대로 보인다.
13. **증명서 사유 칸**: 이벤트 `reason` 은 기존처럼 원문 그대로 찍는다(반려 사유가 사용자 텍스트라 코드 번역과 섞지 않음). 그래서 PDF 이력 표에는 `CONTENT_CHANGED`·`UPDATED` 같은 코드가 보인다 — 상세 화면 타임라인은 번역된다.

## 백엔드에 넘길 것

1. **[요청·경미] 팀장의 반려 사유 필수 여부**: `rejectionReasonRequired` 는 `getApprovalSettings`({admin})에서만 읽힌다. 팀장 반려 대화상자는 미리 막지 못하고 서버의 `REJECTION_REASON_REQUIRED` 로만 안내한다. `getTimesheetContext` 나 `getTeamTimesheetMatrix` 에 `rejectionReasonRequired: boolean` 을 실어 주면 사전 검증 가능.
2. **[확인] TIMESHEET 의 `approval.canRequest`**: 모달에서 쓸 수 없는 액션을 true 로 준다. 프론트는 숨겼다. 의미를 "다시 제출 가능"으로 쓰려면 이름·문서를 맞추거나 TIMESHEET 에서 false 로.
3. **[참고] 업무함 `title` null**(백엔드 보고서 발견 2): 프론트가 TIMESHEET·ISSUE 모두 대체 문구로 처리함 — 조치 불필요.
4. 계약 위반·shape 불일치는 발견하지 못했다. 백엔드 코드 무변경.

## 열린 질문 (기본 가정으로 진행)

| # | 질문 | 선택지 | 기본 가정(구현) |
|---|---|---|---|
| QF1 | 타임시트 두 화면의 위치 | (a) 업무함 탭 줄(현재 탭 7~9개) (b) 우측 액션 버튼(설정처럼) (c) 별도 globalPage 엔트리 | (a). 매일 쓰는 주 동선이다. 탭이 많아 좁은 화면에서 줄이 넘치면 (c)를 검토 |
| QF2 | Jira 그룹 가져오기 때 비활성 계정 | 포함 / 제외 | 제외(결재·제출 주체가 될 수 없다) |

## 미검증

`04_spike_todo.md` 에 **F7~F10** 추가: 타임존 선택기·정책 타임존 표시(F7), iframe 안 Atlaskit 모달 중첩(F8), 타임시트 탭에서 연 상세 모달·닫은 뒤 갱신(F9), 매트릭스 엑셀·TIMESHEET 증명서 내려받기(F10). 기존 T16(새 뷰 URL 유지)·T17(상세 visible=false)도 프론트 화면으로 확인 대상이다.
