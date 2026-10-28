# timesheet-approval 검증 리포트 (Phase 5, 회차 1)

> 작성: integration-verifier · 2026-10-03 · autopilot 무인 회차
> 기준: `01_architect_design.md`(계약) · 대조: `02_backend_report.md`, `02_frontend_report.md`, 실제 소스(`src/**`, `static/ui/src/**`, `locales/**`, `manifest.yml`)
> 금지 준수: `forge` 명령 0회(lint 포함), git 인덱스 조작 0회, 소스 수정 0건(이 리포트 파일만 작성)

## 최종 판정: **PASS** (재검증 1 기준 — F1·F2 해소, 남은 필수 수정 0)

> 회차 1 판정은 FAIL(필수 2건)이었다. 아래 본문은 회차 1 기록이고, 해소 내역은 맨 끝 `## 재검증 1` 절.

경계면 shape·3단계 등록·i18n·엔트리·마이그레이션 순서는 모두 맞는다. 실패 2건은 경계면이 아니라 **변경 감지 신뢰성**(잠금 감지 누락)과
**제출 수집 상한**(현실적인 규모에서 제출 불가)이다. 둘 다 수정 범위가 몇 줄이라 backend 1회 재호출로 닫힐 것으로 본다.

## 요약 — 통과 31 / 실패 2 / 미검증 6

## 실행 결과 (직접 재실행)

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand` | **Test Suites 39 passed / 39, Tests 405 passed / 405** (5.7s) — 보고서 수치와 같음 |
| `npm run merge` | 성공(exit 0) — `locales/ko-KR.json`·`en-US.json` 생성 |
| `npm run test:ui -- --runInBand` | **Test Suites 12 passed / 12, Tests 86 passed / 86** — 보고서 수치와 같음 |
| `npm run build:ui` | 성공(exit 0) "Compiled with warnings" — 경고는 전부 `node_modules`(@atlaskit source map ENOENT 2, postcss-calc 1). 산출 html 4개: inbox·modal·settings·projectSettings |
| `forge lint` | 실행 안 함(금지) → 미검증 |

로그: `_workspace/timesheet-approval/tmp/verify_test.log`, `verify_ui.log`

## 실패 (필수 수정)

### F1. [backend] 시간당 스윕이 감지 적용 실패를 무시하고 watermark 를 전진시킨다 — 승인 후 변경이 영구히 누락된다
- 위치: `src/resolver/timesheet/TimesheetDriftService.js:302` (`await this.applyChanges(changes, now);` 반환값 무시) → `:308-310` 완주 시 `watermark: since`
- 어긋남: `applyChanges` 는 후보 조회 실패·건별 실패(`appendEvent`·`closeBySystem`·`markDrift` 예외)를 삼키고 `summary.failed` 로만 돌려준다. `sweepJob` 은 이 값을 보지 않고 `since = page.until` 로 넘어가며 `lastPage` 면 watermark 를 확정한다. 트리거 경로도 같은 실패를 삼키므로 **스윕이 마지막 방어선인데 그 방어선이 실패분을 버린다.** AGENTS.md "미완주 시 watermark 를 전진시키지 않는다" 위반.
- 재현 시나리오: (1) v020(`event_type VARCHAR(32)`)이 아직 적용 안 된 인스턴스(T18) 또는 일시 SQL 오류 → 승인된 타임시트 워크로그 수정 → 트리거 `appendEvent` 실패(삼킴) → 스윕도 같은 실패 → watermark 전진 → 이후 아무리 스윕해도 그 변경은 다시 보지 않는다. 기간 잠금(수용 기준)의 감지가 조용히 빠진다.
- 수정 방향: `const applied = await this.applyChanges(changes, now); if (applied.failed) break;` 처럼 **실패가 있는 페이지에서는 `since` 를 그 페이지 시작값에 둔 채 멈추고 `PARTIAL`(cursor = 그 페이지의 since)로 release**. 이미 처리된 건은 결정적 이벤트 id·조건부 클레임(`drift_detected_at IS NULL`)이라 재처리해도 중복이 없다. 영구 실패 한 건이 스윕을 영원히 막는 것이 걱정되면 `approval_job_state.last_error` 에 남기고 N회(예: 24) 연속 같은 페이지 실패 시에만 넘기는 상한을 둔다. 테스트: `applyChanges` 가 `failed:1` 을 돌려주면 watermark 미전진·cursor 유지.

### F2. [backend] 이슈별 워크로그 상한이 **다른 사람 워크로그까지** 세어, 공용 이슈가 있는 팀은 제출이 막힌다
- 위치: `src/resolver/timesheet/WorklogCollector.js:98` (`if (out.length > MAX_WORKLOGS * 2) throw tooLarge();`)
- 어긋남: `out` 은 author 필터 전(이슈의 모든 작성자) 워크로그다. 설계 §4.7 상한은 "이슈 200개, **내** 워크로그 2000건"이고, author 필터 후 검사(`:126 mine.length > MAX_WORKLOGS`)는 이미 있다. 이 추가 상한(이슈당 전체 4000건)은 설계에 없고 보고서에도 차이로 적히지 않았다.
- 재현 시나리오: 설계 규모(200명, §9.1)에서 전원이 매일 "회의/공통업무" 이슈 하나에 기록 → 월 200×22 = 4,400건(+앞뒤 하루) > 4,000 → 그 이슈에 한 번이라도 기록한 **모든 사용자**의 `getMyTimesheet`·`submitTimesheet` 가 `TIMESHEET_TOO_LARGE`. 본인 워크로그는 수십 건뿐인데 제출 불가.
- 수정 방향: 페이지마다 `worklog.author.accountId === accountId` 로 먼저 걸러 **내 것만 누적**하고 상한은 내 것 기준(`MAX_WORKLOGS`)으로 센다. 호출량 폭주 방지가 목적이면 별도로 "이슈당 페이지 수"(예: 5000×4 페이지) 같은 원시 안전 상한을 두되 값과 이유를 설계 차이 표에 적는다. 테스트: 다른 작성자 4,500건 + 내 3건 이슈 → 정상 수집.

## 프론트가 넘긴 2건 판정

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| (a) | `rejectionReasonRequired` 를 팀장이 못 읽어 반려 창 사전 검증 불가 | **필수 아님 → 권고 R1** | 서버(`ApprovalService.js:726-733`)가 `REJECTION_REASON_REQUIRED` 로 막고, `RejectDialog.jsx` 는 에러를 창 안에 표시하고 닫지 않는다 — 기능은 정상, UX 1회 왕복 손실뿐. 기본값이 `true`(SettingsRepository:42)라 대부분 첫 시도가 실패하는 점은 개선 가치가 있다 |
| (b) | TIMESHEET 상세의 `approval.canRequest` 가 true | **필수 아님 → 권고 R2** | 설계 계약 §2.2 가 정확히 "`canRequest` = 대상자 본인 && 최신 요청이 열려 있지 않음"으로 정의했고 백엔드(`ApprovalService.js:285` + `TimesheetTargetAdapter.canRequest`)는 계약대로다. 프론트는 `ApprovalDetail.jsx:297`(`!isTimesheet`)로 요청 버튼을 숨기고 `:392` 에서 같은 값을 "내 타임시트에서 다시 제출" 안내 조건으로 **쓰고 있다** — false 로 바꾸면 이 안내가 사라진다. 계약 위반 아님 |

## 권고 (이번 회차 필수 아님)

- **R1 [frontend 우선]** 반려 사유: 모달 `DecisionForm` 은 정책과 무관하게 반려 시 사유를 항상 필수로 받는다(`DecisionForm.jsx:66-70`). `RejectDialog` 도 같은 규칙(빈 사유면 버튼 비활성 + `error.REJECTION_REASON_REQUIRED` 안내)으로 맞추면 백엔드 변경 없이 사전 검증된다. 정책이 꺼진 사이트에서 빈 사유 반려를 허용해야 한다면 그때 `getTeamTimesheetMatrix` 응답에 `rejectionReasonRequired:boolean` 1필드를 싣는다(공개 정책값이라 범위 문제 없음).
- **R2 [backend·문서]** `canRequest` 의 TIMESHEET 의미는 "다시 제출 가능"이다. 다음 계약 개정 때 TIMESHEET 전용 `canResubmitTimesheet` 같은 이름으로 분리하거나 설계 §2.2 에 "모달 요청 폼 아님" 한 줄 추가.
- **R3 [frontend]** `TimesheetSnapshotSection.jsx:35` 감지 배너 제목이 항상 `timesheet.status.CHANGED_AFTER_APPROVAL`("승인 후 변경")이다. `drift` 는 대기 중 변경으로 **만료된 요청**에도 실린다 → 그 경우 제목이 틀린다. 요청 상태(EXPIRED)일 때 다른 제목(예: `state.expiry.CONTENT_CHANGED`)을 쓰도록.
- **R4 [backend 테스트]** `decideTimesheets` 로 다른 팀 팀원(내가 결재자가 아닌) 요청 id 를 넣으면 건별 `APPROVER_NOT_ELIGIBLE`/`PERMISSION_TARGET_VIEW_DENIED` 로 실패하는지 서비스+엔진 결합 테스트가 없다(현재는 엔진 mock). 읽기(매트릭스)에는 "다른 팀" 테스트가 있으니 쓰기 대칭 테스트 1건 추가 권장.
- **R5 [설계 확인]** `exportExpiredApprovals`({admin})는 TIMESHEET 요청의 `subjectAccount`·`periodKey`·제목·결재 이력을 관리자에게 내준다. 반면 `TimesheetAccess` 는 관리자의 상세 열람을 막는다(Q9). 보관 내보내기는 설계 §2.2 에 명시된 관리 기능이고 워크로그 본문은 없으므로 결함으로 보지 않지만, Q9 문구에 "보관 내보내기는 예외"를 적어 두는 것이 좋다.
- **R6 [backend 문서]** `getApprovalHistory` 는 기준 요청의 참여자면 같은 대상(사용자×기간)의 다른 회차 이력까지 본다(이전 회차 2단계 결재자 → 이후 회차 이력). ISSUE 와 같은 모델이라 허용 범위로 보나, TimesheetAccess 주석에 명시 권장.

## 미검증

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| `forge lint` / manifest 스키마 | forge 명령 금지 | 배포 회차에 `forge lint` |
| T18 v020·v021 `ALTER … MODIFY COLUMN` 적용 | Forge SQL 실측 필요 | 첫 resolver 호출 후 `[MIGRATE] applied` 에 v020·v021 (F1 과 함께 최우선) |
| T1·T3·T4·T20 워크로그 이벤트·`worklog/updated|deleted|list` 응답 형태 | 실측 필요 | `04_spike_todo.md` 방법대로 |
| T5·T6·T7 JQL `worklogAuthor`·타임존·`startedAfter` 단위·`started` 형식 | 실측 필요 | 경계 시각 워크로그로 `live.entryCount` 확인 |
| T15 `UNIQUE(member_slot)` NULL 중복·`VALUES()` | 실측 필요 | 팀장 2팀 겸임 저장 |
| F7~F10 iframe 화면(타임존 목록·모달 중첩·상세 갱신·엑셀/PDF) | 실측 필요 | 프론트 보고서 방법대로 |

## 통과

### 경계면 표 (생산자 ↔ 소비자, `invokeApproval` 이 `content` 를 벗긴 값 기준)

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| getTimesheetContext | `TimesheetService.js:136-155` | `InboxPage.jsx:109,211,399,412` (`isTeamLead`, `currentPeriodKey`) | O |
| getMyTimesheet | `TimesheetService.js:187-280` | `MyTimesheetPage.jsx`, `SubmitBar.jsx`, `submitPlan.js` (`live.*`, `latest.*`, `periods[]`, `submitBlockedCode`, `changedSinceSubmit`, `routing.teamName`, `violationCount`) | O |
| submitTimesheet | `TimesheetService.js:282-372` | `MyTimesheetPage.jsx:43-57` (`extraStepAdded`, `error.code` 4종 분기) | O |
| getTeamTimesheetMatrix | `TimesheetService.js:391-462` | `TeamTimesheetPage.jsx`, `TeamMatrixTable.jsx`, `matrixRows.js`, `exportTeamTimesheetExcel.js` | O |
| decideTimesheets | `TimesheetService.js:468-501` | `decideTimesheetsRunner.js:25` (`results[]`, `remaining[]`, 묶음 에러 `PIN_*`) | O |
| getTimesheetDetail | `TimesheetService.js:503-556` | `TimesheetSnapshotSection.jsx` (`period`, `timeZone`, `issues[].visible`, `drift.{detectedAt,kind}`) | O |
| list/get/save/delete TimesheetTeam, importTimesheetTeamMembers | `TeamService.js` | `TimesheetTeamSettings.jsx`, `TeamFormModal.jsx` (`team.rev`, `cause.accountIds`, `members[].accountStatus`, `truncated`) — `cause` 는 `ResponseWrapper.js:34` → `ApprovalError.cause` 로 전달 확인 | O |
| getApprovalDetail (TIMESHEET) | `TimesheetTargetAdapter.viewOf` | `ApprovalDetail.jsx:233,320-322` (`target.kind/title/periodKey`) | O |
| getApprovalCertificate | `CertificateService.js:30-` + `certificateExtra` | `CertificateSheet.jsx:85-99`, `exportCertificatePdf.jsx:102` (`data.timesheet.*`) | O |
| listInbox / listNotifications | `InboxService.js:139-147`, `NotificationService.js:203-209` | `InboxTable.jsx:89`, `exportInboxExcel.js:78`, `NotificationPanel.jsx:77-82` (`periodKey`, `title`) | O |
| exportExpiredApprovals | `RetentionRepository.js:66-74` | `exportRetentionExcel.js:54-62` (`targetKind`, `targetTitle`, `subjectAccount`, `periodKey`) | O |
| get/saveApprovalSettings | `SettingsService.js:159-176`(patch 부분 저장, 전체 반환) | `TimesheetPolicySettings.jsx:278-283` (9키 patch, 응답으로 `settingsKeys.policy()` 갱신) | O |

- 프론트가 부르는 resolver 이름 59종 전부 `PermissionMap` 에 존재(스크립트 대조, 누락 0). `res.content.content` 이중 접근 없음.

### 점검표

**등록**
- [x] 신규 11종: `TimesheetController.js`(guardedDefine 11) · `PermissionMap.js:104-118` · `index.js:43 registerTimesheetController` — 계약 테스트(`permissionMap.contract.test.js`)가 실제 registrar 를 가짜 resolver 에 태워 대조, 통과. `teamLead` 축 형태 단언 추가 확인
- [x] 가드 `{teamLead}`: `permissionGuard.js:68` — 앱 접근 확인 뒤 DB 명부 판정, 실패 fail-close

**권한 범위 (불변식 7)**
- [x] 팀 범위 판정 출처는 `TeamScope`(가드·매트릭스·결재선) · `TimesheetAccess`(상세·이력·증명서·결정·취소 경로의 어댑터 canView) 두 곳뿐 — `src` 전역 grep 으로 다른 판정 지점 없음 확인. SQL 원천은 `TeamRepository.findLeadScope` 1곳(`enabled=1`)
- [x] 팀장은 자기 팀원만: `membersOf` 가 본인 제외·이끌지 않는 teamKey `INVALID_TARGET`. 테스트 있음(다른 팀 팀원 범위 밖, 다른 팀장 상세 거부)
- [x] 형제 resolver: 상세(`getTimesheetDetail`)·`getApprovalDetail`·`getApprovalHistory`·`getApprovalCertificate`·`decideApproval`/`bulkApprove`/`decideTimesheets` 모두 `assertTargetVisible`/`canView` → TimesheetAccess. 엑셀은 매트릭스 응답으로 프론트가 생성(별도 resolver 없음). 업무함·알림은 actor/recipient 로 고정
- [x] 쓰기 대칭: 결정은 범위 확인(TimesheetAccess) + 엔진 결재 자격 + `expectKind`. supersede 는 같은 대상(본인×기간)만(`ApprovalService.js:604`)
- [x] `SELF` 는 principal 사용 — `getMyTimesheet`/`submitTimesheet` 는 payload accountId 미사용, `collectMine` 이 `/myself` 와 principal 대조

**불변식**
- [x] 1: `scopeKey.js` `TIMESHEET:{accountId}:{periodKey}` → `open:` dedupe, 역파싱은 마지막 `:` 기준(accountId 의 `:` 대응). 동시 제출 경합 테스트 있음
- [x] 2: 기간 상태는 `periodStatusOf(latest)` 파생, 캐시 테이블 없음
- [x] 3: `src/domain/**` 에 `Date.now()`/`new Date()` 호출 0(주석만). period·limits 는 `now`·`timeZone` 인자
- [x] 4: `timesheet_team` 수정·`markDrift`·`approval_job_state` UPDATE 전부 `rev = rev + 1`
- [x] 5: 결정은 엔진 경로(`decision_type='PENDING'`), 팀 구성원 행은 결재자 행 아님
- [x] 6: `CHANGED_AFTER_APPROVAL` 이벤트 `deterministicEventId(...discriminator:'drift')`, EXPIRED `CONTENT_CHANGED:{contentVersion}`
- [x] 8: asApp 은 `WorklogCollector.fetchWorklogsByIdAsApp`·`listChangedSince`(호출부 `TimesheetDriftService` 뿐, 사유 인자 강제) + 기존 라이선스. resolver 응답 경로는 asUser 만
- [x] 9: 엔티티 프로퍼티 사용 0(grep)
- [x] 10: 해당 없음(validator 없음)
- [x] route 인코딩: 쿼리스트링은 값별 보간(`WorklogCollector.js:94,166-167`)

**마이그레이션**
- [x] v016~v021 이름·순서가 v015 뒤에 append, 기존 이름 무변경, `ddl/index.js` re-export 1곳
- [x] `ensureMigratedOnce` 는 `guardedDefine.withSchema` 가 모든 resolver 에서 호출. 시간당 스윕은 마이그레이션 안 돌림(D12 — 타당)
- [x] `isTableReady` 프로브: `TimesheetRepository.ready()`(submission·ref·request), `TeamRepository.ready()`, `findMyTurn`(approval_inbox), `findSubmission`
- [x] `whereIn` 빈 배열 가드: `listForPeriod`·`findMyTurn`·`findCandidatesBy*`·`findLeadScope`·`membersOfTeams`·`TeamRepository:189,203,222,304` 전부 조기 반환
- [ ] (주의) v020·v021 은 컬럼 폭 변경이라 `isTableReady` 로 프로브할 수 없다 → 미적용 시 F1 경로로 감지 누락. F1 수정으로 완화, T18 실측 필요

**i18n·엔트리**
- [x] `locales/kr` ↔ `locales/en` 파일 집합·네임스페이스별 키 집합 동일(불일치 0)
- [x] `ErrorCodes` 43개 = `error.json` kr 43 / en 43, 누락·잉여 0
- [x] `static/ui/src` 리터럴 번역 키 전부 병합본(ko-KR·en-US)에 존재. 동적 키(`timesheet.status.*` 5, `violation.title.{WARN,EXTRA_STEP,BLOCK}`, `settings.unit/action.*`, `detail.driftKind.*`, `detail.event.changed_after_approval`, `state.expiry.CONTENT_CHANGED`, 알림 템플릿 2) 존재
- [x] `npm run merge` 는 build 에 포함되지 않아 별도 실행 — 성공
- [x] 엔트리 3곳 정합: craco `ENTRIES`(modal·inbox·settings·projectSettings) = `public/*.html` 4 = manifest `resources[0].entry` 4 = 빌드 산출 html 4. 이번 기능의 엔트리 변경 없음(craco 의 working-tree diff 는 core-port 분)
- [x] 쿼리키: 신규 인라인 `queryKey: [` 0(기존 `DataSettings.jsx:127` 1건 제외), `timesheetKeys` 팩토리 사용. 신규 `100vh` 0
- [x] manifest app id 는 `REPLACE-WITH-forge-register`(Confluence id 로 돌아가지 않음), scope 추가 없음, scheduledTrigger 2개

## 다음 회차 (backend 재호출 범위)

1. F1 — `TimesheetDriftService.sweepJob` 실패 페이지에서 정지·cursor 유지 + 테스트
2. F2 — `WorklogCollector.issueWorklogs` 를 내 워크로그 기준 상한으로 + 테스트
3. (선택) R4 쓰기 대칭 테스트

frontend 는 필수 수정 없음. R1·R3 은 다음 프론트 회차에 함께 처리 권장.

## 재검증 1 (2026-10-03)

> 입력: `02_backend_report.md` `## 검증 수정 (F1·F2)` 절, 변경 파일 `TimesheetDriftService.js`·`WorklogCollector.js` + 테스트 3개(최근 수정 시각으로 변경 범위 확인 — 그 밖의 `src/resolver/timesheet` 파일은 무변경). forge·git 조작·코드 수정 0.

### 판정: **PASS** — 남은 필수 수정 0

| 항목 | 결과 | 근거 |
|---|---|---|
| F1 스윕 실패 시 watermark 전진 | **해소** | `TimesheetDriftService.js` `sweepJob`: `applied.failed` 면 `since` 를 그 페이지 시작값에 둔 채 `PARTIAL`(watermark null, cursor=since) release. 같은 cursor 연속 실패만 누적(`since === lease.cursor`), 24회째에 건너뛰고 `last_error` 기록. 잡 전체 예외(`FAILED`)는 기존 cursor·실패 수 보존. 재처리 멱등(결정적 eventId·`drift_detected_at IS NULL` 클레임) 테스트 확인 |
| F2 이슈당 상한이 남의 워크로그를 셈 | **해소** | `WorklogCollector.js:109-114` 페이지마다 작성자 선필터 후 내 것만 누적, 상한은 이슈를 가로지르는 내 누계(`tally.mine > MAX_WORKLOGS`) — 설계 §4.7 과 일치. 원시 안전판은 건수가 아니라 호출 수(`MAX_WORKLOG_PAGES_PER_ISSUE = 40`)라 설계 규모(1쪽)에서 막히지 않음. 설계 대비 차이로 보고서에 기재됨 |
| cursor_value 형식 `"<since>\|f<n>"` 충돌 | **충돌 없음** | `cursor_value` 소비자는 `TimesheetDriftService`(job_key `ts-worklog-updated`·`ts-worklog-deleted`) 하나뿐 — `src` 전역 grep 에서 다른 읽기/쓰기 없음(일일 `approval-sweep` 은 이 칼럼을 읽지 않음). `parseCursor` 는 옛 숫자 값(`"1759…"`)을 그대로 읽고 접미가 없으면 실패 수 0. 비정상 값은 cursor null → watermark 로 폴백(안전측). 길이는 VARCHAR(500) 안 |
| R4 쓰기 대칭 테스트 | **추가 확인** | `TeamScopeAccess.test.js` — 실제 TeamScope→TimesheetAccess→Adapter→ApprovalService 경로에서 다른 팀 요청만 `PERMISSION_TARGET_VIEW_DENIED`, 자기 팀 1건만 approve |
| 회귀 | **없음** | 백엔드 전체 테스트 통과, resolver 응답 shape 무변경(`collectMine` 반환 키 동일, `sweepJob` 반환의 추가 키는 로그 전용) → 프론트 경계면 영향 없음 |

### 실행 결과

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand` | **Test Suites 39 passed / 39, Tests 414 passed / 414** (회차 1 대비 +9) — 로그 `tmp/verify_test2.log` |
| `npm run test:ui` · `npm run build:ui` | 백엔드만 바뀌어 지시대로 생략(회차 1 결과 12/12·86/86, 빌드 성공 유지로 간주) |

### 권고 (필수 아님, 추가)

- **R7 [backend]** 예산 소진으로 첫 페이지 조회 전에 끊긴 회차(예: `deleted` 잡이 예산을 다 써 `updated` 가 0쪽)는 `failStreak = 0` 으로 release 되어 같은 cursor 의 누적 실패 수가 초기화된다. 영구 실패 + 예산 경합이 겹치면 24회 건너뜀 상한에 도달하지 못하고 막힘이 길어질 수 있다. 페이지를 하나도 시도하지 않은 회차는 `lease.failStreak` 를 그대로 보존하도록 권장.
- **R8 [backend]** 보고서 "발견"대로 `page.until === since && !lastPage` 응답이면 예산 소진까지 같은 since 를 반복 조회한다(기존 동작). T3 실측 후 `until <= since` 면 멈추는 가드 검토.
- 회차 1 의 R1·R3(frontend), R2·R5·R6(문서)은 그대로 유효.

### 미검증 (변동 없음 + 추가)

- F1 실효과는 T18(v020·v021) 실측과 함께: 미적용 상태에서 승인 후 수정 → `approval_job_state.last_status='PARTIAL'`, `cursor_value` 에 `|f1`.
- 이슈 worklog API 실제 쪽 크기(호출 예산 40 의 여유) — 실측 필요.
- `forge lint` — 금지 명령으로 미실행.
