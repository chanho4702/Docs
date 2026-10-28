# product-polish-2026-10-20 — 프론트 보고 (A·B 프론트)

> 작성: frontend-engineer · 2026-10-20 · 1회차
> 기준: HEAD `002ad3c`(백엔드 A·B + 디자인 C). 응답 shape 은 `02_backend_report.md` 1~3회차를 따랐다.
> 결과: `npm run test:ui -- --runInBand` **97 suites / 910 tests 전부 통과**(기준 94 / 884, 기준 실행 때 `WorkforceTeamsSection` 1건 타이밍 실패 → 이번에 함께 고침), 타이포 계약 테스트 통과(Text small 상한 135 유지), `npm run merge` OK, `npm run build:ui` OK(경고는 기존 react-select CSS 순서뿐, issue 엔트리 18.56 kB +536 B), `npm run check:bundle` OK.
> src/·manifest·docs 무변경, git·forge 미실행. 엔트리 추가 없음(3곳 수정 불필요).

## 1. 소비하는 resolver·접근 경로

| resolver | 소비 화면 | 읽는 경로(`invokeApproval` 가 content 를 벗긴 값) |
|---|---|---|
| `getApprovalSettings` | 설정 전반(운영 모드·기능 상태) | `statusChangeApprovalEnabled === true`, `workforceLinkEnabled === true` + `linkActive`(true/false/null) |
| `saveApprovalSettings` | 설정 > 이슈 > 상태 변경 승인 | patch `{ statusChangeApprovalEnabled: boolean }` 한 키(비상 해제는 기존 `{ transitionApprovalEnabled }` 한 키) — 응답으로 `settingsKeys.policy()` 교체 |
| `getFeatureOverview` | 같은 화면 "적용 프로젝트" 행 | `projects.{configured, enabledCount}` |
| `getTimesheetContext` | 업무함 종류 칩·승인 관리 | `features.statusChangeApproval === true` |
| `getIssueTransitionApprovals` | 이슈 우측 카드·모달 목록·요청 폼 | `enforced`, `notEnforcedReason`(`FEATURE_DISABLED` 포함), `targets[]`, `history[]`. 끔 조기 반환(`issue:{issueId}` 만)도 그대로 처리 |
| `createTransitionApproval` | 요청 폼 | 오류 `STATUS_CHANGE_APPROVAL_DISABLED` → 문구 + 목록 재조회(STALE_CODES) |
| `listTransitionRules` 등 규칙 3종 | Jira 프로젝트 설정 | 무변경(`featureEnabled` 로 경고) |
| `listIssueWorklogExceptions` | 프로젝트 설정 상단 문구 | `pages[0].linkMode` → `onLinkMode` 콜백 |
| `getProjectWorklogPolicy`·`getIssueWorklogPolicy` | 정책 모달 | `linkMode`(프로젝트) / `effective.linkMode`(이슈). false 면 "워크포스 정책 다시 받기"·안내 숨김 |
| `getWorklogControlStatus` | 워크로그 통제 | `settings.foreignScopeDefaulted` → 선택지 "· 기본값" + 한 줄 |
| `listInbox` | 업무함·내 이력 | 서버 필터 `targetKinds` 를 `['WORKLOG_CERTIFICATION','ISSUE_TRANSITION']`(SURFACE_KINDS)로 넓힘 — 이전엔 워크로그만 보내 상태 변경 승인 행이 아예 안 왔다 |

## 2. 바꾼 화면

### A. 상태 변경 승인 진입점
- **설정 메뉴**: 묶음 `issue`("이슈") > `approval`("상태 변경 승인") 복원(general 다음). `setting=approval` 은 다시 자기 위치(옛 `section=flows|groups|approvers` 만 결재 구성으로). 배지: 끔 `off`, 비상 해제 `bypass`.
- **`IssueApprovalSettings`**: 종류 표(ISSUE_TRANSITION 하나) → 사용 스위치 섹션(켜기 즉시 저장 / 끄기 확인 모달, 꺼져 있으면 "켜기 전에 준비하세요" 3단계 — 규칙·validator "Moves Approval — approval required" 부착·켜기, 적용 프로젝트 요약 + 링크, 규칙 위치) → 정책(상태 표시명, 필드 변경 적용 칸은 `showFieldChange={false}` 로 숨기고 그 키는 patch 에서 뺌) → 비상 해제(moot 판정 = `statusChangeApprovalEnabled !== true`). 기능이 꺼져도 정책·비상 해제는 편집 가능.
- **Jira 프로젝트 설정**: `TransitionRuleSettings` 복원(IssueExceptionList 아래). 자체 `Heading medium` → `SettingsSection`(h2) + 머리줄 [규칙 추가]. 상단 문구는 `linkMode` 로 단독/연동/모름 3가지.
- **이슈 우측 요약(issueContext compact)**: 워크로그 안내·기록 버튼 아래 `StatusChangeApprovalCard`(신규) — 위 구분선 + `PageSection` 제목 "상태 변경 승인" + 한 줄 설명. `enforced=false && history=[]` 면 렌더 없음(로딩 중에도 자리 차지 안 함), 목적 상태 행 [상태 변경 승인 요청], 최근 요청 1건 [상세], [전체 보기](모달 transitionPick). 끔 + 이력 있음 → 이유 한 줄 + 최근 요청만. 모달 onClose 에 `transitionKeys.issue`·`approvalKeys.all` 무효화. issuePanel(full)·Work log 탭 무변경.
- **••• 메뉴(main/modal)**: `resolveModalTarget` 이 issueAction 진입을 곧장 `transition/transitionPick` 으로(종류 선택 `OverviewModalFlow` 는 코드만 보존). 목록(full)에서 `FEATURE_DISABLED` 면 "관리자가 상태 변경 승인을 꺼 두었습니다" 안내 + 기존 이력. 요청 폼은 끔이면 `error.STATUS_CHANGE_APPROVAL_DISABLED` 안내, 제출 중 그 코드면 문구 + 재조회. 폼 본문 제목 `Heading medium h1` → `small h2`(모달 본문 규칙).
- **종류 배지**: `FEATURE_OF_KIND.ISSUE_TRANSITION='statusChangeApproval'`, `enabledKinds(features)` = 워크로그 + (켬일 때) 상태 변경 승인. URL `kind` 는 `SURFACE_KINDS` 안이면 유지. 업무함·내 이력 서버 필터를 두 종류로(위 표) — 끈 뒤에도 진행 중 결재·이력은 보인다.
- `featureStateModel`: `statusChangeApproval` 추가(`=== true`, 기본 꺼짐).

### B. 연동 3상태
- `operatingModeOf` = `STANDALONE`(스위치 아님) / `LINKED`(linkActive true) / `LINKED_PENDING`(linkActive false) / null(linkActive null·없음 — 전부 표시). `isLinkPending`, 배지 "연결 필요"(warning).
- 설정 패널 맨 위 `LinkPendingNotice`(LINKED_PENDING, 워크포스 연동 화면 제외) + "워크포스 연동에서 연결" 링크.
- 워크로그 승인 모드 카드: 연결 대기면 "연결 필요" 배지·경고, `getWorklogApprovalIdentity` 미조회. 연동 문구 아래 "연동 이슈는 워크포스 팀장 설정 우선" 한 줄.
- 팀: 단독이면 `WorkforceTeamsSection` 조회·렌더 안 함(`mode` prop), 연동(대기 포함)이면 명부 위 "결재선은 워크포스 팀 우선" 한 줄.
- 워크로그 통제: 단독이면 `guide.linkScope`·`channel` 안내, 능력 신호 다시 읽기, G_WF/G_LINK/G_HANDOFF 관문 숨김, 기간 창 "단독에서는 동작 안 함" 경고, 감지 범위 `LINKED` 선택 비활성(저장값이면 유지). `foreignScopeDefaulted` 면 "· 기본값" + 설명, 저장 안 함.
- 정책 모달: `linkMode === false` 면 "워크포스 정책 다시 받기"·도움말 숨김, 프로젝트·연동이면 팀장 우선 한 줄.
- 타임시트 정책: 단독이면 이력 범위 `LINKED_ONLY` 비활성(저장값이면 유지 + 무시 중 경고), `PROJECT_OR_LINKED` 는 "프로젝트 기준으로만" 한 줄.
- 감사 › 워크로그 변경: 단독이면 "워크포스 연결분만" 체크 숨김(켜져 있으면 남김), 엑셀 "워크포스 연결 대상" 열 제외(`dropColumn`).
- 워크포스 연동 화면: 상태 조회 실패는 상태 자리만 오류, 스위치는 남음.
- 이슈 Work log: `getLinkedIssueOverview` 실패를 경고 배너 → 조용한 MetaText 한 줄로.

## 3. 추가·변경 i18n 키 (kr/en 동시, merge OK)
- policy: `settings.group.issue`(값 "이슈"), `settings.tab.approval`(값 "상태 변경 승인"), `issueApproval.hint`(값), `features.statusChange.{title,toggle,description,rulesHint,setupTitle,setupStep1~3,rulesLabel,rulesWhere}`, `features.confirm.statusChangeOff.{title,body}`, `emergency.{description,moot}`(값)
- approvalKind: `feature.statusChangeApproval`
- workforce: `mode.{pending,pendingTitle,pendingNotice,pendingAction}`, `status.loadFailed`
- transition: `card.{title,request,more}`, `list.featureOffTitle`, `list.notEnforced.FEATURE_DISABLED`(값), `rules.featureDisabled`(값), `server.validator.REJECT_NO_REQUEST`(값 — ••• 메뉴 새 이름)
- project: `placeholder.{bodyStandalone,bodyLinked}`
- worklogApprovalFlow: `settings.linkedLeadPrecedence` / timesheet: `settings.team.workforcePrecedence`
- worklogControl: `foreign.{scopeDefault,scopeDefaultHint}`, `dateWindow.standaloneNoEffect`
- worklogHistory: `policy.{linkedOnlyStandalone,projectOrLinkedStandalone}`

## 4. 테스트
신규: `transition/__test__/StatusChangeApprovalCard.test.jsx`(5), `settings/__test__/LinkPending.test.jsx`(4), `worklogHistory/__test__/exportColumns.test.js`(1). 추가: 목록 끔 안내, 요청 폼 끔 2건, 업무함 칩, inboxUrl 종류, 워크로그 통제 단독·대기·기본값 3건, 워크포스 연동 상태 오류·연결 필요, 타임시트 단독 이력 범위, 팀 섹션 단독. 갱신: IssueApprovalSettings(전면), settingsNavigation, featureStateModel, operatingModeModel, approvalKindModel, transitionModel(••• 진입), issueApprovalI18n(validator 문구), InboxPage(배지·approval 위치), WorkforceLinkSettings·WorklogControlSettings(연동 픽스처에 `linkActive:true`).

## 5. 설계와 다른 점
- 이력 배지 `showLinked` 기본값을 false 로 바꾸지 않았다 — 배지는 이미 행의 `workforceLinked === true` 만 그리고(데이터 기반), 서버가 이제 isLinked 로 판정하므로 같은 효과. 감사 화면의 단독 숨김은 유지.
- 공용 `LinkedOnly.jsx` 는 만들지 않았다 — 소비처가 `isStandalone` 분기로 충분. 죽은 `Linked*` 5개는 이미 없음(grep 0).
- 명부 행별 "워크포스 우선" 배지 대신 명부 위 한 줄(행별 겹침 데이터는 워크포스 팀 응답 `rosterOverlap` 에만 있어 명부 쪽에서 조인하려면 추가 조회가 필요).
- `AuditPage` 연동 보관 문구는 정책 값 자체가 필요해 "모름=표시"가 불가 — 그대로.

## 6. 백엔드 요청
없음.

## 7. 실측 필요
- issueAction(`transition-approval-action`) 진입 시 moduleKey 판독(T4·T16) — 못 받아도 issueAction 이면 transitionPick 으로 간다.
- issueContext 에 카드가 붙은 뒤 iframe 높이·하단 잘림(U1), 규칙 없는 이슈에서 높이 변화 없음.
- 끔 상태 이슈 화면 호출 1회 증가(T15) — 카드 쿼리 `staleTime` 30초.
- 연결 대기(스위치 켬·미연결) 사이트에서 설정 상단 안내·메뉴 배지·워크로그 모드 카드 확인.
- 단독 사이트에서 감지 범위 기본 `ALL` 표시("· 기본값")와 Work log 탭 "다른 경로 입력" 표시 증가 여부(백엔드 §5 와 같은 항목).

## 2회차 (2026-10-20) — Codex 검수 P2 2건
1. `WorkforceLinkSettings.useInvalidateLink` 무효화 목록에 `settingsKeys.policy()` 추가 — 연결·해제·키 교체·ping·대기 폴링 완료·새로고침 뒤 운영 모드(linkActive)를 다시 받아 메뉴 배지·LinkPendingNotice·모드 카드가 따라온다.
2. `WorklogApprovalModeContext` 배지를 `operatingModeOf()` 기준으로 — LINKED 만 성공 배지, LINKED_PENDING "연결 필요", STANDALONE 단독 배지, 모름(linkActive null)은 배지 없음. 점검: 메뉴 배지(`settingsNavigation`)·`WorkforceLinkToggle` 은 이미 `operatingModeBadgeOf(mode)`(모름 → null)라 같은 오분류 없음. 스위치 직접 판정은 문구 묶음 선택(`modeKeyOf`)·토글 체크 상태·결재자 구성 조회 여부에만 남는다(배지·성공 표시 아님).
테스트: WorkforceLinkSettings "새로고침 → 정책 재조회·배지 연결 필요→연동", LinkPending "linkActive null 배지 없음 / LINKED·STANDALONE 배지". 전체 **97 suites / 912 tests 통과**, `build:ui` OK.
