# 02 프론트 보고서 — 사용할 기능 선택 (feature-selection)

작성: 2026-10-12 frontend-engineer · 1회차 · 입력 `01_architect_design.md` §7·§8·§11·§12 + `02_backend_report.md`(응답 shape 기준)
같은 회차에 `worklog-policy-ux` 도 구현했다(같은 파일 `TimesheetPolicySettings.jsx` 를 한 번에) — 그쪽 보고서는 `_workspace/worklog-policy-ux/02_frontend_report.md`.
`src/`(백엔드)·manifest·엔트리 3곳은 건드리지 않았다. git add/commit/push 없음. forge 명령 없음.

## 1. 소비하는 resolver · 접근 경로 (백엔드 보고서 §2 그대로)

| resolver | 소비 화면 | 접근 경로(invokeApproval 이 content 를 벗긴 값) |
|---|---|---|
| `getApprovalSettings` (admin) | 사용할 기능, 이슈 승인, 비상 해제, 타임시트 정책 탭 안내, 메뉴 배지 | `data.issueApprovalEnabled`·`data.timesheetApprovalEnabled`·`data.transitionApprovalEnabled`·`data.workforceLinkEnabled`·`data.approvalUnit` → `featureStateOf(data)` (`!== false`) |
| `saveApprovalSettings` (admin) | FeatureToggle·EmergencyBypassSection·WorkforceLinkToggle | payload 단일 키 `{ issueApprovalEnabled }` / `{ timesheetApprovalEnabled }` / `{ transitionApprovalEnabled }` / `{ workforceLinkEnabled }`. 응답으로 `setQueryData(settingsKeys.policy())` |
| `getFeatureOverview` (admin, 신규) | 사용할 기능 "현재 상태" | `projects.configured`·`projects.enabledCount`·`teams.enabledCount` → `projectsSummaryOf`·`teamsSummaryOf`(null → '—'). 통째 실패도 해당 행만 '—' |
| `getWorkforceLinkStatus` (admin, 기존) | 사용할 기능 연결 상태 한 줄 | **연동 켬일 때만** 조회. `certPublish.linkedAt`(number) → LINKED / 없으면 WAITING / 실패 UNKNOWN / 정책 꺼짐 OFF |
| `getTimesheetContext` (SELF) | 업무함(팀 타임시트 배너) | `context.features` → `featureStateOfContext`(null = 모름 → 전부 보임). 업무함은 `getApprovalSettings` 를 부르지 않는다(설정 뷰 제외) |
| `getMyTimesheet` | 내 타임시트 SubmitBar | `submitBlockedCode === 'TIMESHEET_APPROVAL_FEATURE_DISABLED'` → 기존 `submitPlan` 이 blocked → 제출 버튼 없음, 회수 버튼 유지, 안내 appearance `information` |
| `getIssueApproval` | 이슈 일반 승인 섹션 | `notAvailableReason === 'FEATURE_DISABLED'` → `issueApproval.section.featureDisabled`(버튼은 서버 `canRequest:false` 로 이미 없음) |
| `getIssueTransitionApprovals` | 전환 섹션 | `notEnforcedReason === 'FEATURE_DISABLED'` → `notEnforcedKey` 허용 목록에 추가 |
| `getIssueFieldChanges` | 필드 변경 섹션 | `notEnabledReason === 'FEATURE_DISABLED'` → `fieldChange.section.featureDisabled` |
| `listTransitionRules` / `listFieldChangeRules` | 프로젝트 규칙 화면 | `featureEnabled === false` → 경고 SectionMessage |
| `createFieldChangeApproval`/`getFieldChangeForm` 에러 | 필드 변경 요청 폼 | `ISSUE_APPROVAL_FEATURE_DISABLED` 를 `STALE_CODES` 에 추가(섹션·폼 재조회) |
| 전환 적용 code | TransitionApplyPanel·증명서 | `transitionApply.code.FEATURE_DISABLED`(기존 코드 맵이 자동 사용) |
| 감사 `feature`·`transitionEnforce` | 설정 변경 이력 | `AREA_APPEARANCE` 에 `feature:'new'`, `transitionEnforce:'moved'`, 라벨 `policy.audit.area.*` |

쿼리키: 신규 `settingsKeys.featureOverview()`. 재사용 `settingsKeys.policy()`(기능·모드·비상 스위치 공통, 요청 1회), `settingsKeys.workforceLink()`, `timesheetKeys.context()`, `settingsKeys.audit()`.
FeatureToggle 저장 뒤 무효화: `audit`·`featureOverview`·`timesheetKeys.context()`.

## 2. 바뀐 파일

### 신규
| 파일 | 내용 |
|---|---|
| `static/ui/src/features/settings/featureStateModel.js` | 순수: `featureStateOf`, `featureStateOfContext`, `featureBadgeOf`, `workforceLinkLineOf`, `projectsSummaryOf`, `teamsSummaryOf` |
| `static/ui/src/features/settings/useFeatureState.js` | `settingsKeys.policy()` 공유 훅(`enabled`, retry false, 5분 stale, 결과 useMemo) |
| `static/ui/src/features/settings/FeatureSelectionSettings.jsx` | 사용할 기능 화면(SettingsPageIntro + SettingsSection×3, FeatureToggle·확인 모달, SettingsRows 요약, 링크) |
| `static/ui/src/features/settings/WorkforceLinkToggle.jsx` | `WorkforceLinkSettings` 의 `EnabledToggle` 를 파일로 분리(같은 mutation·캐시·testId `workforce-link-toggle`·`workforce-mode`·`workforce-toggle-error`) |
| `static/ui/src/features/settings/FeatureOffNotice.jsx` | 끈 기능 안내(SectionMessage information + "사용할 기능에서 켜기"·"저장된 설정 보기/접기") |
| `static/ui/src/features/settings/EmergencyBypassSection.jsx` | 비상 해제 섹션(상태 줄·토글·켜기 확인 모달·해제 중 경고·기능 끔 한 줄) |
| `static/ui/src/features/settings/ApprovalSetupSettings.jsx`, `approvalSetupModel.js` | 결재 구성(결재선·승인 그룹·승인자 탭, 내용 lazy) |
| 테스트 7개 | §5 표 |

### 수정
| 파일 | 변경 |
|---|---|
| `features/settings/settingsNavigation.js` | `features`(첫 항목·`DEFAULT_SETTING`)·`approvalSetup` 항목, 아이콘 `list-checklist`·`tree`, `LEGACY_SETTINGS` → approvalSetup, `canonicalSettingLocation`, 기능 배지(`settings-nav-${key}-feature-${badge}`, bypass 는 warning 토큰), 옵션 `{ mode, features }` |
| `features/settings/SettingsPage.jsx` | FEATURES 에 `features`·`approvalSetup`, `TABBED=['approvalSetup','timesheet','audit']`, `onNavigate` prop(features·approval·timesheet 에만 전달), 초기 `features`, 배지용 `useFeatureState` |
| `features/settings/IssueApprovalSettings.jsx` | 탭 제거 → 정책 + 비상 해제(lazy). 기능 끔이면 `FeatureOffNotice` 안에 접어 둠 |
| `features/settings/IssueApprovalPolicySettings.jsx` | `transitionApprovalEnabled` 를 formKey·patch·BooleanField 에서 제거 |
| `features/settings/issueApprovalModel.js` | **삭제**(탭 상수 소비처 없음 — `approvalSetupModel.js` 로 대체) |
| `features/settings/TimesheetSettings.jsx` | 정책 탭 맨 위 `FeatureOffNotice feature="timesheetApproval"`(children 없음 = 접지 않음), `onNavigate` 전달 |
| `features/settings/TimesheetPolicySettings.jsx` | lockSubmitted 도움말 `timesheet.settings.lockSubmittedHelp` (나머지는 worklog-policy-ux) |
| `features/settings/WorkforceLinkSettings.jsx` | `EnabledToggle` → `WorkforceLinkToggle` import(동작·testId 동일) |
| `features/settings/AuditSettings.jsx` | area 2개 |
| `features/inbox/InboxPage.jsx` | `canonicalSettingLocation` 정규화 effect(옛 링크·`approval&section=flows` replace), `settingsFeatures` 배지, `navigateSetting`(push), `contextFeatures` → `TeamTimesheetPage submissionsOff` |
| `features/timesheet/TeamTimesheetPage.jsx` | `submissionsOff` prop → `team-timesheet-submissions-off` 배너(결정 버튼 무변경) |
| `features/timesheet/SubmitBar.jsx` | `INFORMATION_BLOCKS`(기간 미시작 + 기능 끔) |
| `features/issueApproval/IssueGeneralApprovalSection.jsx` | `issue-approval-feature-disabled` |
| `features/fieldChange/FieldChangeSection.jsx` | `field-change-feature-disabled` |
| `features/fieldChange/FieldChangeRequestForm.jsx` | `STALE_CODES` + `ISSUE_APPROVAL_FEATURE_DISABLED` |
| `features/fieldChange/FieldChangeRuleSettings.jsx` | `field-change-rules-feature-disabled` 경고 |
| `features/transition/transitionModel.js` | `notEnforcedKey` 에 `FEATURE_DISABLED`, `ruleWarnings` 에 `transition.rules.featureDisabled`(TransitionRuleSettings 의 기존 경고 목록 자리) |
| `utils/queryKey/approvalKeys.js` | `settingsKeys.featureOverview()` |
| 기존 테스트 | `PolicyFallback`(patch 에 transitionApprovalEnabled 없음), `settingsNavigation`(재작성 11개), `IssueApprovalSettings`(재작성), `TimesheetSettings`·`InboxPage`·`IssueApprovalOverview`·`FieldChangeSection`·`FieldChangeRuleSettings`·`transitionModel`·`timesheetPure`·`MyTimesheetPage`·`AuditTrail` 케이스 추가 |

### i18n (kr/en 동시, `npm run merge` 통과)
- `policy.json`: §8.1 전부(`settings.tab.features|approvalSetup`, `settings.badge.*`, `features.*`, `emergency.*`, `approvalSetup.hint`, `audit.area.feature|transitionEnforce`), `issueApproval.hint` 문구 교체, **삭제** `issueApproval.tab`(탭 없어짐). 라벨 15 의 1~4.
- `issueApproval.json`·`fieldChange.json`·`transition.json`·`transitionApply.json`·`timesheet.json`: §8.2 전부. `error.json` 2키는 백엔드가 이미 넣음(확인).
- 라벨 15: 1~4(policy), 5~10(timesheet), 11~13(worklogControl), 14~15(workforce) 반영. en 은 같은 뜻.
- 파일 줄바꿈(CRLF/LF)은 파일별 원래대로 유지했다. 생성물 `ko-KR.json`·`en-US.json` 은 git 무시 대상(상태 변화 없음).

## 3. 설계와 다르게 한 점 (이유)

1. **`policy.transitionApprovalEnabled` 라벨을 비상 해제 섹션의 상태 줄 라벨로 쓴다.** 폼에서 토글을 빼면 이 키가 고아가 된다. 설계 §8.3-1 이 "비상 해제 섹션의 상태 줄"을 용도로 적었으므로 `SettingsRows` 한 줄(값 `features.issue.enforceOn|enforceBypassed`)로 넣었다.
2. **라벨 5·7·9 는 worklog-policy-ux 문구를 택했다.** 같은 키를 두 설계가 다르게 정했다: `unit.WEEK` "주(월요일~일요일)", `backdate` "지난 날짜 기록 가능 일수(0 = 제한 없음)", `lockSubmitted` "결재 중인 기간에 기록 추가 금지". 프로젝트·이슈 패널 키(`worklogPolicy.key.pastDateMaxDays`·`lockSubmittedPeriod`)와 같은 말이 되도록. 도움말은 §8.2 의 긴 문장("승인된 기간은 이 설정과 상관없이 항상 잠깁니다.").
3. **`timesheet.settings.exceptionGroupRequired` 문구도 바꿨다**(설계에 없음) — 라벨이 "추가 결재자 그룹"으로 바뀌어 옛 "예외 승인 그룹" 문구가 어긋났다.
4. **사용할 기능 화면의 워크포스 토글은 도움말을 숨긴다**(`help={false}`). 섹션 설명(`features.workforce.description`)과 겹친다. 컴포넌트·mutation·캐시·testId 는 연동 화면과 같다.
5. **`canonicalSettingLocation(legacy, section)`** — 옛 setting 이어도 URL 에 section 이 있으면 그것을 따른다(옛 `legacySectionOf` 동작과 같은 우선순위). `approval` 의 다른 section(예: 옛 `policy` 탭)은 지운다.
6. **`onNavigate` 는 features·approval·timesheet 에만 넘긴다.** 감사(AuditPage)는 이미 자기 `onNavigate`(탭 간 씨앗) 개념이 있어 이름이 겹치지 않게.
7. **이슈 승인 화면의 정책·비상 해제는 lazy(`importWithReloadOnce`)** — 기존 탭 내용이 lazy 였던 것을 유지(StatusFlow 그림 청크).
8. **업무함 `InboxPage` 의 기존 eslint 경고 1건**(`useCallback` 의 `dictionary` 의존성, 172행)은 이번 변경 전부터 있던 것이고 CRA 빌드 출력에는 나오지 않는다. 손대지 않았다.

## 4. 백엔드 계약 관련 메모 (백엔드 요청 아님)
- 백엔드 보고서 §5-2: `isProjectScopeConfigured` KVS 실패 시 `configured:false` → 화면은 "모든 프로젝트"로 보인다(구별 불가). 표시 fail-open 이라 지금은 허용으로 판단. 정확히 '—' 를 원하면 `configured:null` 이 필요하다.

## 5. 테스트·빌드 결과

| 명령 (위치) | 결과 |
|---|---|
| `CI=true npx jest` (static/ui) | **Test Suites 78 passed / 78, Tests 677 passed / 677** |
| `CI=false npm run build` (static/ui) | 성공. "Compiled with warnings" 는 `node_modules/@atlaskit/react-select/.../multi-value.compiled.css` 의 postcss-calc 경고 1건뿐(기존). 우리 코드 eslint 경고 0 |
| `npm run merge` (리포 루트) | `locales\ko-KR.json 생성` / `locales\en-US.json 생성` |
| 고아 키 점검(스크립트: 이번에 추가한 키가 src 에서 리터럴·템플릿 접두로 쓰이는지) | 신규 키 고아 0. 없앤 키 `policy.issueApproval.tab.policy` 삭제 확인(테스트로 고정) |

### 추가·갱신한 프론트 테스트 (설계 §12 대응)
| 시나리오 | 파일 |
|---|---|
| 상태 원천(null→null, 키 없음→true, false, context 변환, 배지 3종, 연결 상태 4가지, 개요 요약) | `features/settings/__test__/featureStateModel.test.js`(신규, 14) |
| 메뉴(첫 항목·기본값, approvalSetup 일반 묶음, 옛 flows/groups/approvers, approval+flows 정규화, 배지 off/bypass/submissionsOff, features null → 배지 없음·항목 수 동일) | `settingsNavigation.test.js`(재작성, 8) |
| 사용할 기능(세 섹션, 끄기 → 모달 → 단일 키 patch, 취소 무호출, 켜기 모달 없음 + 무효화 키, 워크포스 토글 캐시 교체, 상태 줄, 링크 onNavigate(key, section), 개요 실패 '—', 정책 실패) | `FeatureSelectionSettings.test.jsx`(신규, 9) |
| 이슈 승인(탭 없음, 기능 끔 → 안내 + 접힘·펼치기, 비상 해제 모달·취소, 해제 중 경고, 강제 복귀 모달 없음, 정책 실패 fail-open) | `IssueApprovalSettings.test.jsx`(재작성, 5) |
| 정책 폼 patch 에 `transitionApprovalEnabled` 없음 | `PolicyFallback.test.jsx` |
| 결재 구성(탭 3·기본 flows·onTabChange·lazy·initialTab) | `ApprovalSetupSettings.test.jsx`(신규, 3) |
| 타임시트 설정(끔 → 정책 탭 안내·접지 않음·켜기 링크, 다른 탭 무변경), lockSubmitted 도움말 | `TimesheetSettings.test.jsx`(+2), `TimesheetPolicySettings.test.jsx` |
| 업무함(기본 진입 features, 옛 링크 replace 2종, onNavigate push·뒤로, context 끔 → 팀 배너 + getApprovalSettings 미호출, context features null/실패 → 전부 보임, 설정 뷰 배지) | `InboxPage.test.jsx`(+8) |
| 내 타임시트(`TIMESHEET_APPROVAL_FEATURE_DISABLED` → blocked·information·제출 버튼 없음·회수 유지) | `timesheetPure.test.js`(+1), `MyTimesheetPage.test.jsx`(+1) |
| 이슈 패널(FEATURE_DISABLED 문구·요청 버튼 없음·행 유지, notEnforcedKey, 규칙 화면 경고 2곳) | `IssueApprovalOverview.test.jsx`, `FieldChangeSection.test.jsx`, `transitionModel.test.js`, `FieldChangeRuleSettings.test.jsx` |
| 감사 area 라벨 | `AuditTrail.test.jsx`(+1) |
| 문구 키 kr/en 존재·없앤 키 부재 | `featureSelectionI18n.test.js`(신규, 5) |
| 운영 모드 공존(토글 분리 뒤 testId·동작 동일) | `WorkforceLinkSettings.test.jsx`(무수정 통과) |

## 6. 미검증 (실기기)
| 항목 | 확인 방법 |
|---|---|
| 설정 첫 화면(사용할 기능) 레이아웃·좁은 폭(모바일) 줄바꿈 | 개발 사이트 업무함 > 설정, 창 폭 줄여 보기 |
| 확인 모달 2종(기능 끄기·비상 해제) 높이·하단 버튼 잘림 | iframe 안에서 모달 열기(100vh 미사용 확인됨, 실측 필요) |
| 메뉴 배지(접힌 사이드바 포함) 색 — 다크 모드 | 이슈 승인 끔·비상 해제·타임시트 끔 각각 |
| 옛 북마크 `setting=flows`·`setting=approval&section=groups` replace | 실제 URL 로 진입 |
| 배포 직후 새 lazy 청크(FeatureSelectionSettings·ApprovalSetupSettings·EmergencyBypassSection) | 배포 직후 열기 — `importWithReloadOnce` 1회 reload |
| 비관리자 업무함에서 `getApprovalSettings` 미호출 | 브라우저 네트워크(설정 뷰 진입 전) |
| 이슈 패널·내 타임시트의 끔 상태 문구 | 기능 끔 후 이슈 패널·업무함 |
