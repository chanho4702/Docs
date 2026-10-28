# linked-mode-ux 프론트 보고서 (승인 앱 static/ui)

- 작성 2026-10-13 · frontend-engineer · 1회차
- 입력: `00_input/requirement.md`(결정 절 포함) · `01_architect_design.md`(전부) · `02_backend_report.md`(2회차 — §0 D1~D12, §1 실제 shape, §7 소비 지점)
- 범위: ① 창구 통일 · ③ 이슈 화면 원칙·이슈 예외 · ⑤ 메뉴·역할 · ② 팀 탭·결재자 이름. 워크포스 리포·백엔드·manifest 무변경. `git add/commit`·`forge` 미실행.
- 결과: **UI jest 88 suites / 799 tests 전부 통과**(시작 82 / 739) · **`npm run build:ui` 성공**(경고는 기존 `@atlaskit/react-select` CSS 1건) · **`npm run merge` 성공**(ko-KR.json·en-US.json 생성)
- 작업 트리에 이미 있던 하단 잘림 수정(`app/base.css`, `app/mount.jsx`, `entries/issue.jsx`·`entries/worklog.jsx` Box padding)은 손대지 않았다.

---

## 0. 설계와 다르게 한 점

| # | 위치 | 설계 | 실제 | 이유 |
|---|---|---|---|---|
| F1 | '내 이력' 화면 | 별도 lazy `features/history/HistoryPage.jsx` | `InboxPage` 의 목록 뷰(INBOX_TABS 의 `history`)로 두고 필터 줄만 `features/history/HistoryFilters.jsx` 로 교체 | `listInbox`·`InboxTable`·"더 보기"·엑셀이 그대로 재사용된다. 새 청크는 2개(승인 관리·기록)만 |
| F2 | 내 이력 직접 지정 날짜 URL | (미정) | `hfrom`·`hto` | 다른 업무함의 생성일 필터(`from`·`to`)와 키를 나눠 탭을 옮겨도 서로 새지 않게 |
| F3 | 내 이력 종류 칩 | 화면 필터(기존) | **서버 필터** `filters.targetKinds:[kind]`(history 탭만). 다른 탭은 기존 화면 필터 그대로 | 백엔드가 history 에 `targetKinds` 를 지원(§1.2). 다른 탭 카운트·동작 무변경 |
| F4 | 승인 관리 기간 | `from/to` 선택(생략 가능) | **항상 보낸다**(생성일). 진행 중 기본 1년, 종료 기본 90일, 프리셋 30일/90일/1년/직접(≤3660일, 틀리면 호출 안 함) | 코디네이터 지시 "기간 필수". 진행 중 1년 기본이라 1년 넘게 열린 건은 기간을 넓혀야 보인다 |
| F5 | 승인 관리 프로젝트 필터 | `projectId` 필터 | **미구현** | 숫자 projectId 를 직접 입력하는 UI 는 쓰기 어렵다. 프로젝트 선택기가 필요 — 후속 |
| F6 | 기록 화면 | 신규 `RecordsPage` = AuditPage 탭 4 + DataSettings | `RecordsPage` 는 `AuditPage withData`(감사 4탭 뒤에 '보관·내보내기' 탭) | 감사 화면의 씨앗 이동·보관 안내를 그대로 쓴다 |
| F7 | 이슈 화면 규칙 한 줄 | `WorklogPolicySummary` 재사용 | 신규 `WorklogRulesLine`(같은 `isRestrictive`·`policyValueText`·`PolicySourceChip` 재사용) — `getIssueWorklogs.policy`(effective) 로 그린다 | Summary 는 SectionMessage + details 라 "한 줄"이 아니다. 추가 조회 없음 |
| F8 | `worklogPolicy.ignored.MANAGED_BY_WORKFORCE` | `ignored.*` | `worklogPolicy.reason.MANAGED_BY_WORKFORCE` | 기존 패널이 무시 사유를 `worklogPolicy.reason.${reason}` 로 그린다(`ignored` 는 이미 문자열 키) |
| F9 | 결재선 없음 안내 위치 | `WorklogApprovalFlowLine` | + 작업 로그 탭 상단(필수인데 결재선 없을 때만 — 같은 쿼리키), + Log work 대화상자 경고(`reasonCode==='WORKLOG_POLICY_INVALID'` ∧ required 면 `missing.{managedBy}`) | 기록 버튼이 막힌 이유를 그 자리에서 보이게 |
| F10 | `linkStateOf` | UNAVAILABLE / NOT_LINKED | UNAVAILABLE / **LINKED(`control.linked===true`, 표시용)** / NOT_LINKED — `channel` 은 더 보지 않는다 | 설계 Phase 1 테스트의 "3분기". 아무 경로도 LINKED 로 막지 않는다(소비처는 UNAVAILABLE 만 본다) |
| F11 | 인박스 부트스트랩 | — | 부트스트랩(첫 페인트) 사이드바에서 '관리' 묶음 제거 | 관리자 판정 전에는 보이지 않게(fail-closed 표시) |

백엔드 shape 이 화면 요구를 못 채운 곳 — **없음**(가공 없이 소비). 백엔드 요청 후보만 §6 에.

---

## 1. 화면·엔트리

엔트리 추가 **없음** → `craco.config.js` ENTRIES · `public/*.html` · `manifest.yml` 무변경(3곳 규칙 대상 아님). 새 lazy 청크 2개(`importWithReloadOnce`): `features/approvalAdmin/ApprovalAdminPage`, `features/records/RecordsPage`. `100vh` 신규 사용 없음.

### ① 창구 통일
- `features/settings/WorkforceLinkSettings.jsx` — 작성 창구 select(`InputChannel`, `saveApprovalSettings({linkedInputChannel})`) **삭제** → 연동 모드면 안내 한 줄 `WriteChannelNote`(`workforce.writeChannel`). 저장 호출 없음.
- `features/worklogControl/worklogControlModel.js` — `linkStateOf` 가 `control.channel` 을 보지 않음(F10).
- 연동 이슈 작성: 작업 로그 탭(LINKED 레이아웃 `LinkedWorklogPanel`)·Log work 대화상자·전역 페이지 넘김(`WorklogCreateHandoffPage`)은 이미 막지 않았고, `channel` 분기가 사라져 막힐 경로가 없다. `channelWorkforce` 문구 삭제, 통제 안내(`worklogControl.guide.channel`·`gate.desc/manual.G_HANDOFF`)를 "작성·수정·삭제 넘김"으로 재작성.

### ③ 이슈 화면 원칙 · 이슈 예외
- `features/worklog/WorklogTab.jsx` — 하단 `<details data-testid="worklog-issue-policy">`(`WorklogPolicyPanel scope="issue"`) **삭제** → 표 위 `WorklogRulesLine`(`worklog-rules-line`). '승인 요청' 하위 탭의 `WorklogApprovalPolicyPanel` → `WorklogApprovalFlowLine`.
- `features/issueApproval/IssueApprovalOverview.jsx` — 우측 칸 결재선 select → `WorklogApprovalFlowLine`.
- `features/worklogApproval/WorklogApprovalPolicyPanel.jsx` **삭제**. 신규 `WorklogApprovalFlowLine.jsx`(required=false 미렌더 / `selectedFlow` → "{결재선}(으)로 승인됩니다" + 출처 칩 / `reasonCode` → `missing.{managedBy}` 경고 / 조회 실패 숨김), `missingFlowKey(managedBy)` export.
- `features/worklog/WorklogDialog.jsx` — 결재선 이름 `policy.selectedFlow?.label`(이전 `options.find(selectedFlowId)`), 결재선 없음 안내(F9).
- `features/worklog/LinkedSettingSummary.jsx` — `setting.policy`(키→값 요약)·`setting.flow.label`·`flowInvalid` 경고 가산(읽기 전용).
- `entries/projectSettings.jsx` — `WorklogApprovalConfig` 다음에 신규 `features/worklogPolicy/IssueExceptionList.jsx`:
  - 목록(`listIssueWorklogExceptions`, "더 보기" 커서) 열: 이슈(키·요약) / 바꾼 항목 / 결재선(이름·"프로젝트 기본"·허용 목록 밖 로젠지) / 편집·삭제. `hiddenCount` 안내.
  - 연동 행(`managedBy==='WORKFORCE'`): "워크포스 관리" 로젠지 + 워크포스 값(`workforce.pol`·`workforce.fl` 이름) 요약, **편집 없음, 삭제만**(승인 앱 저장분이 있을 때).
  - 이슈 추가: 키 입력(`/^[A-Za-z][A-Za-z0-9_]*-\d+$/`, 대문자로) → `lookupProjectIssue` → 편집 모달. `PROJECT_ISSUE_MISMATCH`/그 외 오류 안내.
  - 편집 모달(Atlaskit modal-dialog): `WorklogPolicyPanel scope="issue"`(lazy, 이 모달에서만) + 결재선 select(`flows.required` 일 때만, "프로젝트 기본"=null) → `selectIssueWorklogApprovalFlow({projectId, issueId, flowId|null, rev: flow?.rev ?? 0})`. `WORKLOG_POLICY_CONFLICT` 면 목록 재조회.
  - 삭제: `saveIssueWorklogPolicy({projectId, issueId, expectedRevision, override:{}})`(정책이 있을 때) + `selectIssueWorklogApprovalFlow({…, flowId:null, rev})`(지정이 있을 때).
- `features/worklogPolicy/WorklogPolicyPanel.jsx` — `managedBy==='WORKFORCE'`(이슈 범위) 면 편집·저장·수신 버튼 없음 + 안내(서버 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` 와 대칭).
- `features/worklogPolicy/WorklogPolicySummary.jsx` — `LINKED_ISSUE` 출처 칩을 워크포스 색으로.
- `features/worklogPolicy/WorklogPolicyNotices.jsx` — `noticeVars`: `limitSeconds` → `limit`(분 표기). 문구 `DAILY_MAX`/`WEEKLY_MAX` 가 초를 보이지 않게.
- `features/settings/ProjectPolicyModal.jsx` — 위치 안내 한 줄 `project.policy.issueExceptionsWhere`.

### ⑤ 메뉴·역할
- 신규 `features/inbox/usePrincipal.js` — `getPrincipalContext`(principalKeys.context, staleTime 5분, retry false). 실패 → null. `showAdminGroup = isAdmin === true`.
- `features/inbox/InboxPage.jsx`
  - '관리' 묶음(승인 관리 `manage` · 기록 `records` · 설정 `settings`)은 **`isAdmin === true` 일 때만**. 설정 children 은 `settingsNavigation(t, {…, surface:'inbox'})` — 기록 묶음(감사·보관) 없음.
  - '처리한 건'(done) → '내 이력'(`history`): `listInbox({tab:'history', filters:{role?, updatedFrom, updatedTo, targetKinds?}})`, 필터 줄은 `HistoryFilters`(역할 칩·기간 칩·직접 지정).
  - URL 읽기 호환(replace): `tab=done` → `tab=history&role=processed` · `tab=settings&setting=audit[&section|&auditTab=X]` → `tab=records&section=X|approval` · `setting=data` → `records&section=data` · `setting=worklogHistory` → `records&section=worklog`. 기존 `setting=flows|groups|approvers`·`approval&section=…` 은 그대로.
  - `view=manage` → `ApprovalAdminPage`(종류 칩은 `enabledKinds(맥락 features)`), 취소는 기존 회수 모달(`intent:'cancel'` → `cancelApproval`), 제목 → 상세 모달. 모달 onClose 에서 `approvalAdminKeys.all` 무효화.
  - `view=records` → `RecordsPage section`(URL `section`).
- 신규 `features/approvalAdmin/ApprovalAdminPage.jsx` — 진행 중/종료 토글 · 종류 칩 · 기간 칩(F4) · 표(종류·제목/이슈·상태·요청자·현재 단계 대기·갱신·작업) · `[독촉]`(canRemind) `[취소]`(canCancel) · `hiddenCount`·`incomplete` 안내 · `PERMISSION_ADMIN_REQUIRED` 안내. 독촉 결과 `already`/`notified`. `REQUEST_NOT_PENDING`·`REQUEST_NOT_FOUND` 면 목록 재조회.
- 신규 `features/records/RecordsPage.jsx`, `features/audit/AuditPage.jsx` 에 `withData` prop('보관·내보내기' 탭 = DataSettings lazy).
- `features/settings/settingsNavigation.js` — `surface` 옵션(`'adminPage'` 기본 = 기존 4묶음, `'inbox'` = records 묶음 제외), `SETTINGS_SURFACES`, `recordsSectionOfSetting(rawSetting, section, auditTab)`. 관리 화면(jira:adminPage `SettingsPage`)은 기록 묶음 유지.
- `features/inbox/inboxUrl.js` — `INBOX_TABS`(done→history), `ADMIN_VIEWS`, `RECORDS_SECTIONS`, `recordsSectionOf`, `LEGACY_VIEWS`·`legacyViewPatch`, `parseHistorySearch`, `periodRangeOf`(직접 지정 ≤366일), `toHistoryFilters`, `localDateOf`.
- `features/settings/AuditSettings.jsx` — 감사 영역 색 `worklogApproval`(D11).

### ② 팀 탭 · 결재자 이름
- 신규 `features/settings/WorkforceTeamsSection.jsx`(설정 › 타임시트 › 팀 탭 `TimesheetTeamSettings` 아래) — `listWorkforceTeams`. `enabled:false` 면 섹션 없음, 빈 `teams` 면 안내(Q146), 표: 팀명(+ '워크포스 우선 N명' = `rosterOverlap.length`) · 팀장 이름 · 팀원 수(펼치면 이름 30명까지) · 마지막 수신 · 상태(VERIFIED/STALE/NONE), `truncated` 안내, "팀장 문서 다시 읽기"(`refreshCandidates` 있을 때 → `refreshWorkforceCapabilities({accountIds})`, 결과 확인·갱신(OK)·읽지 못함(UNREADABLE) 한 줄). `STORAGE_NOT_READY` 경고.
- `features/timesheet/MyTimesheetPage.jsx` — 머리줄에 "결재자: {이름}"(`routing.approverKeys`, `resolveUsers`).
- `features/timesheet/TimesheetSnapshotSection.jsx` — prop `approverNames`, `features/detail/ApprovalDetail.jsx` 가 `approval.steps[].approvers` 이름(이미 해석한 `useUserNames`)을 넘긴다. **백엔드 변경 없음**(설계 §4.3 그대로 — 보고서 §4 ②).
- 신규 공용 훅 `utils/useUserNames.js`(`userKeys.resolve`, `resolveUsersInChunks`) — 승인 관리·팀 섹션·내 타임시트가 쓴다.

---

## 2. 소비하는 resolver · 접근 경로 (`invokeApproval` 이 `content` 를 벗긴 값)

| resolver | 호출 위치 | 쓰는 칸 | 분기(`error.code`) |
|---|---|---|---|
| `getPrincipalContext`(신규) | `inbox/usePrincipal.js` | `isAdmin` | 실패 → 관리 묶음 숨김 |
| `listInbox` tab `history` | `InboxPage`(기존 목록 쿼리) | `items`, `nextCursor`, `hasMore` | 기존 |
| `getInboxCounts` tab `history` | `InboxPage` | `myTurnCount`(statusCounts 는 history 필터 줄에서 안 씀) | 기존 |
| `listAllApprovals`(신규) | `approvalAdmin/ApprovalAdminPage` | `items[].{requestId,targetKind,title,issueKey,status,requesterKey,currentStep.{name,pendingApproverKeys},updatedAt,canCancel,canRemind}`, `hiddenCount`, `nextCursor`, `incomplete` | `PERMISSION_ADMIN_REQUIRED` → 권한 안내 |
| `sendApprovalReminder`(신규) | 같은 화면 | `notified`, `already` | `REQUEST_NOT_PENDING`·`REQUEST_NOT_FOUND` → 목록 재조회 |
| `cancelApproval`(기존) | 회수 모달(intent cancel) | 기존 | 기존 |
| `listWorkforceTeams`(신규) | `settings/WorkforceTeamsSection` | `enabled`, `teams[].{teamKey,teamName,leaderKeys,memberKeys,memberCount,lastReceivedAt,state,rosterOverlap}`, `refreshCandidates`, `truncated` | `STORAGE_NOT_READY` → 경고 |
| `refreshWorkforceCapabilities`(기존) | 같은 섹션 | `checked`, `items[].result` | 기존 |
| `getMyTimesheet`(기존) | `MyTimesheetPage` | + `routing.approverKeys` | — |
| `getApprovalDetail`(기존) | `ApprovalDetail` → `TimesheetSnapshotSection` | `steps[].approvers[].actorKey` | — |
| `getIssueWorklogApprovalPolicy`(변경) | `WorklogApprovalFlowLine`, `WorklogTab`(기록 버튼 활성) | `policy.{required,selectedFlow,source,managedBy,reasonCode}` | 실패 → 숨김 |
| `getWorklogEditorContext.approvalPolicy`(변경) | `WorklogDialog` | `selectedFlow.label`, `required`, `reasonCode`, `managedBy` | — |
| `getIssueWorklogs` | `WorklogTab` | + `policy`(effective, 규칙 한 줄), `control.channel` **소비 삭제** | 기존 |
| `getLinkedIssueOverview`(변경) | `LinkedSettingSummary` | + `setting.policy`, `setting.flow.label`, `setting.flowInvalid` | 기존 |
| `listIssueWorklogExceptions`(신규) | `worklogPolicy/IssueExceptionList` | `linkMode`, `items[].{issueId,issueKey,summary,managedBy,policy.{override,overrideRevision},flow.{flowId,label,rev,valid},workforce.{pol,fl}}`, `hiddenCount`, `nextCursor`, `flows.{required,options}` | 기타 → 에러 문구 |
| `lookupProjectIssue`(신규) | 같은 화면 이슈 추가 | `issueId`, `issueKey`, `summary`, `linked` | `PROJECT_ISSUE_MISMATCH` → 전용 문구, 그 외 → "찾을 수 없음" |
| `getIssueWorklogPolicy`(변경) | 편집 모달 `WorklogPolicyPanel scope="issue"` | + `managedBy` | 기존 |
| `saveIssueWorklogPolicy` | 편집 모달·삭제 | 기존 | + `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`(error.json 문구) |
| `selectIssueWorklogApprovalFlow`(변경) | 편집 모달·삭제 | `binding`(응답은 쓰지 않고 목록 무효화) | `WORKLOG_POLICY_CONFLICT` → 목록 재조회, 나머지 → 에러 문구 |
| `saveApprovalSettings`·`getApprovalSettings` | `WorkforceLinkSettings` | `linkedInputChannel` **소비 삭제** | — |

이슈 화면 정적 고정(`features/worklog/__test__/issueScreenNoPolicyEdit.test.js`): `entries/issue.jsx`·`entries/worklog.jsx` 에서 상대 import(정적·동적)를 따라 닿는 모듈 어디에도 `selectIssueWorklogApprovalFlow`·`saveIssueWorklogPolicy`·`saveProjectWorklogPolicy` 문자열과 `WorklogPolicyPanel`·`IssueExceptionList`·`WorklogApprovalPolicyPanel` 이 없다.

---

## 3. 쿼리키 (`utils/queryKey/approvalKeys.js`)

| 키 | 용도 | 무효화 |
|---|---|---|
| `principalKeys.context()` | 관리 묶음 | — |
| `approvalAdminKeys.list(payload)` / `.all` | 승인 관리 | 독촉 오류·모달 onClose·새로 고침 → `.all` |
| `workforceKeys.teams()` | 워크포스 팀 | 다시 읽기 뒤(+ `worklogControlKeys.all`) |
| `worklogPolicyKeys.exceptions(projectId)` | 이슈 예외 목록(`worklogPolicyKeys.all` 접두) | 예외 저장·결재선·삭제·모달 닫힘 → `worklogPolicyKeys.all`·`worklogApprovalKeys.all`·`worklogKeys.all` |
| `userKeys.resolve(ids)`(기존) | `useUserNames` | — |
| `inboxKeys.list({tab:'history', filters})`(기존 팩토리) | 내 이력 | 기존 |

---

## 4. i18n (locales/kr·en 같은 키, `npm run merge` 성공)

추가
- `inbox`: `nav.{history,manage,records}`, `empty.history`, `history.{roleLabel, role.{ALL,PROCESSED,REQUESTED}, periodLabel, period.{d30,d90,d365,custom}, from, to, rangeInvalid}`, `manage.{title,hint,scope.{OPEN,CLOSED},period,column.{kind,title,status,requester,currentStep,updated,actions},remind,remindDone,remindAlready,cancel,hidden,incomplete,empty,loadMore,rangeInvalid}`, `records.section.data`
- `workforce`: `writeChannel`, `teams.{title,hint,column.{team,leader,members,received,state},state.{VERIFIED,STALE,NONE},override,empty,refresh,refreshResult,truncated}`
- `timesheet.routing.approvers`
- `policy.audit.area.worklogApproval`, `policy.audit.action.bindIssue`(D11)
- `worklogApproval.flowLine.{selected, source.{WORKFORCE,ISSUE,PROJECT_DEFAULT}, missing.{PROJECT_ADMIN,WORKFORCE_LEAD}}`
- `project.policy.issueExceptionsWhere`, `project.issueExceptions.{title,hint,add,issueKey,issue,edit,remove,removeConfirm,empty,changed,flow,flowDefault,flowInvalid,managedByWorkforce,managedHint,lookupFailed,hidden}`
- `worklog.tab.rulesLabel`, `worklog.linked.summary.{policy,flow,flowInvalid}`
- `worklogPolicy.source.LINKED_ISSUE`, `worklogPolicy.reason.MANAGED_BY_WORKFORCE`

재작성(설계 §5.7 — 내부 용어 제거, 2문장 이내): `worklogPolicy.{scope.project, scope.issue, hierarchy, hierarchyShort, lockNotice, retentionNotice, writeNotice, refreshHelp, preapprovalFloor, migration, counterNotice, unavailable, authority.*, reason.{LOCKED,RELAXES_LOCK}, notice.{DAILY_MAX,WEEKLY_MAX}}`(`{limitSeconds}초` → `{limit}`), `worklogControl.{guide.channel, gate.desc.G_HANDOFF, gate.manual.G_HANDOFF}`. 진단·수신 상태 표시는 기존대로 관리자 패널의 "상태 정보(지원용)" details 안.

삭제: `workforce.inputChannel.*`, `worklog.tab.channelWorkforce`, `inbox.tab.done`, `inbox.empty.done`, `worklogApproval.policy.{distinction,defaultHint,required,optional}`(`label`·`choose` 는 증명서·대화상자·설정이 계속 씀).

문구 키 대조 테스트 `features/settings/__test__/linkedModeI18n.test.js`(새 화면 키 존재, 삭제 키 부재, §5.7 문구에 내부 용어 없음·2문장 이내).

포맷 메모: `locales/{kr,en}/workforce.json`·`worklog.json` 은 원래 한 줄 객체가 섞여 있었는데 JSON 재기록으로 2칸 들여쓰기 표준형이 됐다(내용 변화는 위 목록뿐).

---

## 5. 테스트 · 빌드 결과

```
npm run merge            → locales\ko-KR.json 생성 / locales\en-US.json 생성
npm run test:ui -- --runInBand
                         → Test Suites: 88 passed, 88 total
                           Tests:       799 passed, 799 total   (시작 82 / 739)
npm run build:ui         → Compiled with warnings(기존 @atlaskit/react-select multi-value.compiled.css 1건) · build 폴더 생성
```
백엔드 회귀 확인: 루트 `npx jest --runInBand` → 178 suites / 2725 tests 통과(백엔드 코드는 건드리지 않음, locales 변경만 영향 가능 범위).
1회 실패 후 수정: 빌드 eslint `Definition for rule 'react-hooks/exhaustive-deps' was not found`(새 파일 2곳의 disable 주석) → 주석 삭제.

신규 테스트: `features/worklogPolicy/__test__/IssueExceptionList.test.jsx`(7), `features/approvalAdmin/__test__/ApprovalAdminPage.test.jsx`(7), `features/settings/__test__/WorkforceTeamsSection.test.jsx`(5), `features/settings/__test__/linkedModeI18n.test.js`(5), `features/worklog/__test__/issueScreenNoPolicyEdit.test.js`(3), `features/worklog/__test__/LinkedSettingSummary.test.jsx`(2).
갱신: `InboxPage.test.jsx`(관리 묶음 isAdmin 3종·관리자 children·승인 관리 뷰·done→history·history 필터 payload·옛 감사/보관 URL 5종 → records), `inboxUrl.test.js`(history·legacy·records), `settingsNavigation.test.js`(surface·recordsSectionOfSetting), `WorklogTab.test.jsx`(정책 패널·select·편집 resolver 없음, 규칙 한 줄), `WorklogApproval.test.jsx`(FlowLine 4종), `WorklogDialog.test.jsx`(selectedFlow 새 shape), `WorkforceLinkSettings.test.jsx`(select 없음·저장 0), `worklogControlModel.test.js`(channel 무시), `MyTimesheetPage.test.jsx`(결재자 2), `WorklogPolicy.test.jsx`(managedBy WORKFORCE 편집 불가·LINKED_ISSUE 칩).

---

## 6. 미검증 · 후속

| # | 항목 | 확인 방법 |
|---|---|---|
| FU-1 | 실제 Jira iframe 에서 프로젝트 설정 페이지의 Atlaskit 모달(이슈 예외 편집) 높이·스크롤 | 개발 사이트 프로젝트 설정 › Moves Approval 에서 편집 모달 열기 |
| FU-2 | 업무함 '관리' 묶음이 관리자 판정 뒤 늦게 나타나는 깜박임(부트스트랩에는 없음) | 관리자 계정으로 업무함 첫 진입 |
| FU-3 | 내 이력 기간 프리셋은 **브라우저 현지 날짜**로 계산하고 서버는 조회자 Jira 시간대로 해석(D6) — 두 시간대가 다르면 경계 하루 차이 가능 | 시간대가 다른 계정으로 1일 경계 확인 |
| FU-4 | 승인 관리 진행 중 기본 1년(F4) — 1년 넘게 열린 결재는 기간을 넓혀야 보인다 | 운영 데이터에서 오래 열린 건 존재 여부 확인, 필요하면 기본값 조정 |
| FU-5 | 승인 관리 프로젝트 필터 UI 미구현(F5) | 프로젝트 선택기(기존 `listProjects` 류) 붙이는 후속 |
| FU-6 | 워크포스 팀 섹션은 W-8a 전까지 실데이터가 비어 빈 상태만 보인다(Q146). 표 렌더는 테스트 데이터로만 확인 | W-8a 이후 개발 사이트 |
| FU-7 | "팀장 문서 다시 읽기"의 남의 사용자 프로퍼티 읽기(U-3) — 403 이면 UNREADABLE 수로만 보인다 | 개발 사이트 |
| FU-8 | 엑셀 내보내기(`exportInboxExcel`)가 history 탭에서 서버 필터(role·기간·targetKinds)로 전량 조회하는지 실측 | 내 이력에서 엑셀 |

백엔드 요청(선택): 승인 관리 행에 `projectName`(현재 `projectKey` 만)·요청자 표시 이름이 있으면 `resolveUsers` 왕복이 준다. 지금은 화면이 `resolveUsers` 로 해석해 문제는 없다.

---

## 수정 회차 1 (2026-10-13) — 근거: requirement.md "범위 축소"(Q149) · 03_verify_report.md F-1/F-3 · codex-review.md P2·위치 안내

| # | 지적 | 수정 | 파일 |
|---|---|---|---|
| R1-1 | F-1 범위 축소 — 팀장은 기록 규칙(`pol`)을 정하지 않는다 | `LinkedSettingSummary` 의 `setting.policy` 줄 삭제(응답에 남아 있어도 그리지 않음). `IssueExceptionList` 연동 행 "바꾼 항목"은 `workforce.pol` 대신 `workforceChips`(작성 기간 `s~e`·사전 승인 `pa`, 결재선은 결재선 열). i18n `worklog.linked.summary.policy` 삭제. 안내 문구 `project.issueExceptions.managedHint`·`worklogPolicy.hierarchy` 를 "작성 기간·사전 승인·결재선은 워크포스 팀장, 기록 규칙은 프로젝트·사이트 정책"으로 재작성 | `features/worklog/LinkedSettingSummary.jsx`, `features/worklogPolicy/IssueExceptionList.jsx`, locales `worklog`·`project`·`worklogPolicy` |
| R1-2 | F-3 편집 모달 연속 저장 CONFLICT | 결재선: 모달 로컬 상태 `saved{flowId, rev}` — 모달을 연 시점 값에서 시작해 `selectIssueWorklogApprovalFlow` 응답 `binding.{flowId, rev}` 로 갱신, 다음 호출 rev·저장 버튼 비활성 비교에 사용. 정책: `WorklogPolicyPanel` 저장 응답(= `getIssueWorklogPolicy`/`getProjectWorklogPolicy` 새 조회 결과)의 `overrideRevision`·`override` 로 기준 리비전·초안을 바로 갱신하고 캐시에 넣는다 | `IssueExceptionList.jsx`, `features/worklogPolicy/WorklogPolicyPanel.jsx` |
| R1-3 | 코덱스 P2 기간 프리셋 시간대 | 신규 `app/useViewerTimeZone.js` — `view.getContext().timezone`(서버 `request.context.timezone` 과 같은 값, 백엔드 D6), 없거나 실패 시 브라우저 시간대, 모듈 캐시. `localDateOf(ms, timeZone)`(Intl), `shiftDate`(달력 산술), `periodRangeOf`·`toHistoryFilters`·`adminPayloadOf` 가 시간대를 받는다. 시간대를 받기 전에는 '내 이력' 목록·카운트와 승인 관리 조회를 미룬다(경계일이 다른 키로 두 번 부르지 않게) | `features/inbox/inboxUrl.js`, `features/inbox/InboxPage.jsx`, `features/approvalAdmin/ApprovalAdminPage.jsx` |
| R1-4 | 코덱스 — 읽기 전용 요약에 설정 위치 | `WorklogRulesLine` 끝에 위치 한 줄(`worklog.tab.rulesWhere.STANDARD` "설정: Jira 프로젝트 설정 › Moves Approval" / `.LINKED` "설정: Moves Approval 관리자 설정(사이트·프로젝트 정책)" — 범위 축소 뒤 연동 이슈의 기록 규칙은 팀장이 아니라 관리자 정책). 판정은 `getLinkedIssueOverview.linked`. `WorklogApprovalFlowLine` 정상 한 줄 끝에 `worklogApproval.flowLine.where.{PROJECT_ADMIN, WORKFORCE_LEAD}`(서버 `managedBy`). 이슈 화면 편집 UI 는 여전히 0(정적 테스트 그대로 통과) | `features/worklogPolicy/WorklogRulesLine.jsx`, `features/worklog/WorklogTab.jsx`, `features/worklogApproval/WorklogApprovalFlowLine.jsx` |

i18n 추가: `worklog.tab.rulesWhere.{STANDARD,LINKED}`, `worklogApproval.flowLine.where.{PROJECT_ADMIN,WORKFORCE_LEAD}`. 재작성: `project.issueExceptions.managedHint`, `worklogPolicy.hierarchy`. 삭제: `worklog.linked.summary.policy`. (`linkedModeI18n.test` 의 동적·삭제 키 목록에 반영.)

테스트 추가·갱신(+8): `IssueExceptionList.test`(workforceChips, F-3 연속 저장 rev 2→3·저장 후 버튼 비활성), `WorklogPolicy.test`(F-3 expectedRevision 4→5), `LinkedSettingSummary.test`(pol 미표시), `WorklogTab.test`(위치 줄 STANDARD/LINKED), `WorklogApproval.test`(where 2종), `inboxUrl.test`(서울 자정 직전·직후·뉴욕, 잘못된 시간대, shiftDate 월·윤년), `ApprovalAdminPage.test`(프리셋 시간대).

**R1-5 (추가 — 연동 이슈 행 사전 승인)**: 이슈 예외 편집 모달을 연동 행에도 연다(기록 규칙 7키 편집 가능). `WorklogPolicyPanel` 은 `managedBy==='WORKFORCE'` 면 `approvalMode` 행만 "워크포스 관리" 로젠지로 잠그고(`WORKFORCE_MANAGED_KEYS`), 저장 payload 에서 `approvalMode` 를 뺀다(서버 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` 회피·옛 값 정리). 결재선 select 는 연동 행에 없음(팀장 관리). 연동 행 "바꾼 항목"은 승인 앱 기록 규칙 예외 + 팀장 값(작성 기간·사전 승인). 문구 `managedHint`·`rulesWhere.LINKED` 갱신 — 파일: `WorklogPolicyPanel.jsx`, `IssueExceptionList.jsx`, locales `project`·`worklog`

R1-5 UI jest: `npm run test:ui -- --runInBand` → Test Suites 88 passed / Tests 808 passed(+1: `WorklogPolicy.test` 연동 이슈 approvalMode 잠금·저장 제외, `IssueExceptionList.test` 연동 행 편집 모달 1건 추가·기존 단언 갱신). merge 재실행 성공.

### 실행 결과 (수정 회차 1)
```
npm run merge            → locales\ko-KR.json 생성 / locales\en-US.json 생성
npm run test:ui -- --runInBand
                         → Test Suites: 88 passed, 88 total
                           Tests:       807 passed, 807 total
npm run build:ui         → 성공(exit 0) · Compiled with warnings — 서드파티만:
                           @atlaskit/analytics-next-stable-react-context source map 없음, postcss-calc Lexical error(@atlaskit CSS)
npm run check:bundle     → [bundle-check] OK — exports: onInstall, onIssueChanged, onPreUninstall, onWorklogChanged, runMigration,
                           runSweep, runSweepJob, validateTransition, CONTROLLER_REGISTRARS, handler
```

### 남은 것 · 메모
- `error.WORKLOG_POLICY_MANAGED_BY_WORKFORCE` 문구("워크포스 작업관리 › 승인 설정에서 바꿔 주세요")는 백엔드 소유 키라 손대지 않았다. 범위 축소 뒤 이 오류는 연동 이슈에 **기록 규칙 예외**를 저장할 때도 나는데, 워크포스에서는 기록 규칙을 바꿀 수 없다 → 백엔드가 문구를 "연동 작업은 이슈 예외를 둘 수 없습니다. 기록 규칙은 프로젝트·사이트 정책을 따릅니다" 류로 고칠지 결정 필요(백엔드 요청).
- R1-3: Forge 맥락에 `timezone` 이 실제로 실리는지는 개발 사이트에서 확인 필요(없으면 브라우저 시간대 — 서버는 이때 `principal.timezone` 또는 UTC 로 떨어져 여전히 어긋날 수 있다).
- F-3 의 CONFLICT(다른 사람이 동시에 바꾼 경우)는 여전히 오류 문구 + 목록 재조회이고, 모달은 닫았다 다시 열어야 새 rev 를 받는다.
- 위 §0 F4("기간 필수 — 코디네이터 지시")는 화면 정책이다. 서버 강제 여부는 검증 보고서 F-4(백엔드·리더 결정).
