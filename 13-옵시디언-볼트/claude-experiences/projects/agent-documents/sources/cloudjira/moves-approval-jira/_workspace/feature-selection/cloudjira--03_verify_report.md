# 검증 리포트 (회차 1) — feature-selection

작성: 2026-10-12 integration-verifier. 기준: `01_architect_design.md`(계약). 보고서(02_backend/02_frontend)의 "통과"는 전부 직접 다시 실행해 확인했다.
범위: A~F·I·J. (G·H 는 `_workspace/worklog-policy-ux/03_verify_report.md`)
작업 트리 공유 중 — `git stash` 미사용, 변경 전 비교는 `git show HEAD:`·`git archive HEAD` 사본으로 했다. 코드 수정 없음.

## 요약  통과 32 / 실패 1(경미) / 미검증 6

## 실패

- [경미·frontend] `static/ui/src/features/settings/__test__/IssueApprovalSettings.test.jsx:59-66` — **부하에서 불안정한 테스트.**
  리포 루트 `npx jest`(백엔드)와 동시에 `static/ui` 에서 `CI=true npx jest` 를 돌린 첫 회차에서 이 파일 5건이 전부 실패
  (`emergency-bypass-section`·`emergency-bypass-toggle` 이 null). 단독 실행·`--runInBand`·병렬 재실행(백엔드 미동시)에서는 5/5 통과.
  원인: `EmergencyBypassSection` 은 목 없이 실제 `React.lazy(importWithReloadOnce(import(...)))` 로 로드되는데, 테스트의 자체 `waitFor` 는
  **시간이 아니라 `setTimeout(0)` 80틱**만 기다린다 — 동적 import 의 babel 변환이 부하로 늦어지면 80틱 안에 청크가 안 온다.
  재현: 터미널 1 `npx jest`(리포 루트), 동시에 터미널 2 `cd static/ui && CI=true npx jest`.
  → 고치는 방법: 이 테스트에서 `jest.mock('../EmergencyBypassSection', …)` 처럼 지연 컴포넌트를 목으로 바꾸거나(정책 폼은 이미 목), `waitFor` 를 시간 기반(예: 최대 3초)으로. 제품 코드 결함은 아니다.

## 미검증

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| 이슈 승인 끔 상태에서 validator 붙은 실제 워크플로 전환 | 실측 필요(Forge 배포) | 개발 사이트에서 끔 → 규칙 있는 전환 → 성공 + `transition_request.armed_at` 없음 |
| 자동 적용 중 끔 → BLOCKED/FEATURE_DISABLED → 켬 → 재시도 APPLIED | 실측 필요 | 승인 직후 끔 → 상세 apply 블록 확인 → 켬 → 재시도 |
| 비관리자 업무함이 설정 뷰 진입 전 `getApprovalSettings` 미호출 | 브라우저 네트워크 실측(단위 테스트로는 확인됨 — `InboxPage.test.jsx:467-502`) | 비관리자 계정, 네트워크 탭 |
| 확인 모달 2종의 iframe 높이·하단 버튼 | 실측 필요(100vh 미사용은 코드로 확인) | 업무함 > 설정 > 사용할 기능·이슈 승인에서 모달 열기 |
| 옛 북마크 `setting=flows`, `setting=approval&section=groups` replace | 실제 URL 진입(순수 함수·InboxPage 테스트는 통과) | 주소창 진입 |
| 배포 직후 새 lazy 청크(FeatureSelection·ApprovalSetup·EmergencyBypass) 1회 reload | 배포 필요 | 배포 직후 진입 |

## 통과

### 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자(파일:라인, shape) | 소비자(파일:라인, 접근 경로) | 일치 |
|---|---|---|---|
| `getApprovalSettings` | `SettingsService.js:244-252` — 두 키 `effectiveFlag(…, true)` 로 **항상 boolean**, `workforceLinkEnabled === true` | `featureStateModel.js:7-11` `featureStateOf`(`!== false`), `EmergencyBypassSection.jsx:49-50`, `FeatureSelectionSettings.jsx:181-186` | O |
| `saveApprovalSettings` | `SettingsService.js:142-146`(booleanValue 2키) → 응답 = `getApprovalSettings()` | `FeatureSelectionSettings.jsx:47-55`(단일 키 patch, `setQueryData(policy)`+무효화 3), `EmergencyBypassSection.jsx:31-37`(`{transitionApprovalEnabled}` 단일) | O |
| `getFeatureOverview`(신규) | `SettingsService.js:259-273` `{projects:{configured:boolean,enabledCount:number|null},teams:{enabledCount:number|null}}` | `FeatureSelectionSettings.jsx:155-159,183,206,240` → `projectsSummaryOf`·`teamsSummaryOf`(null → '—') | O |
| `getTimesheetContext.features` | `TimesheetService.js:207,220-222` — `{issueApproval,timesheetApproval}` boolean 또는 `null`(조회 실패) | `InboxPage.jsx:255` `featureStateOfContext` → `TeamTimesheetPage submissionsOff`(`InboxPage.jsx:487`) | O |
| `getMyTimesheet.submitBlockedCode` | `TimesheetService.js:373-376` — `TIMESHEET_APPROVAL_FEATURE_DISABLED` 최우선, 판정 실패는 미발행 | `submitPlan.js:20`(blocked) · `SubmitBar.jsx:11,42`(information) · 회수 버튼은 `latest.status==='PENDING'`(`SubmitBar.jsx:24`)로 유지 | O |
| `submitTimesheet` 에러 | `TimesheetService.js:458`(정책·수집·부속 행 전) | `SubmitBar.jsx` `error.${code}` | O |
| `getIssueApproval`/`getApprovalDetail` `notAvailableReason` | `ApprovalService.js:382-390`(`'FEATURE_DISABLED'`, `canRequest:false`) | `IssueGeneralApprovalSection.jsx:95-97`, 재상신 버튼은 `canRequest` | O |
| `getIssueTransitionApprovals` `notEnforcedReason` | `TransitionService.js:171-180` | `transitionModel.js` `notEnforcedKey` 허용 목록 + `transition.list.notEnforced.FEATURE_DISABLED` | O |
| `getIssueFieldChanges` `notEnabledReason` | `FieldChangeService.js:212` 이하 | `FieldChangeSection.jsx:93-95`, `fieldChangeModel.js:82`(NO_RULE 외 보임) | O |
| `listTransitionRules`/`listFieldChangeRules` `.featureEnabled` | `TransitionService.js:367-374`, `FieldChangeService.js:609-628`(실패 = true) | `transitionModel.js`(ruleWarnings), `FieldChangeRuleSettings.jsx`(`=== false`) | O |
| 전환 적용 `code:'FEATURE_DISABLED'` | `TransitionExecutor.js:45`, `applyPlan.js:6` canRetry(차단 목록에 없음 → 재시도 가능) | `transitionApply.code.FEATURE_DISABLED` | O |
| 에러 코드 2개 | `ErrorCodes.js:66-68` | `locales/{kr,en}/error.json:119-120` 키 = 값 | O |

`invokeApproval` 가 `content` 를 벗긴 값을 소비자가 그대로 읽는다(`.content` 재접근 없음).

### A. 끔 = 신규 접수만 중지
- ① `ApprovalService.createForTarget`(`:669-675`) — `requirePrincipal` 직후 `assertFeatureOpen(adapter.kind)` 가 describe·`supersede`(`:697`) 보다 **앞**. 테스트 `ApprovalServiceFeatureGate.test.js:107-110` 이 describe·supersede·load·createRequest 미호출 단언. **통과**
- ② 판정 참조 파일 = 허용 목록 10개 정확 일치(`test/feature/featureGateScope.contract.test.js` + 직접 grep 결과 동일). `ApprovalService` 안에서도 `featureEnabled` 호출은 `assertFeatureOpen`(`:364-372`)·`requestGate`(`:382-390`)뿐이고, `requestGate` 호출부는 `viewForTarget`(`:323`)·`createIssueApproval`(`:636`)뿐 — decide/bulkApprove/cancel/위임/만료/증명서 경로 없음. 끔 상태 decide·bulk·cancel 처리 + 판정 미호출 테스트(`:197-221`). 인증·통제·워크포스·사전 승인·이력·위임·trigger·기간 마감/재개/잠금/팀/drift 모듈 미참조 단언. **통과**
- ③ validator(`TransitionValidatorService.js:100-115`) — 두 판정 병렬, 끔이면 SQL·Jira 0 으로 `PASS_FEATURE_DISABLED`, 판정 실패는 `.catch(()=>true)` = 강제(Q53 방향). Executor(`:45`) — POST 전 `FEATURE_DISABLED` → BLOCKED, `postStartedAt`/reconcile 분기(`:29-32`)는 판정 앞이라 영향 없음, `canRetry` true → 다시 켜면 재시도. 끔 경로에서 규칙 조회를 건너뛰어 `RULE_CHANGED`(재시도 불가)로 덮이지 않게 한 편차(백엔드 §5-1)는 요구에 부합. **통과**
- ④ 타임시트: `submitTimesheet` 첫 판정(신규·재제출 공통, fail-close) / `getMyTimesheet` 최우선 코드(표시 fail-open) / 공통 경계 2차 방어. **통과**
- ⑤ 두 키가 `GLOBAL_ONLY_KEYS`(`SettingsRepository.js:188-190`)에 있고 `PROJECT_OVERRIDABLE_KEYS` 제외(`SettingsPolicyKeys.test.js:64-70`), 프로젝트 저장은 `SettingsService.js:491` 에서 거부. **통과**
- 공통 결재 경로(`beforeDecide`)에 게이트 없음. **통과**

### B. shape 일치 — 위 경계면 표 전 행 일치. **통과**

### C. 권한
- `getFeatureOverview`: `SettingsController.js:13` guardedDefine + `PermissionMap.js:62 {admin:true}` + SettingsController 는 기존 `CONTROLLER_REGISTRARS`. 계약 테스트(`permissionMap.contract.test.js`) 통과. **통과**
- 비관리자 화면: `InboxPage.jsx:270,272` — `useOperatingMode`·`useFeatureState` 모두 `enabled: view === 'settings'`. 업무함 기본 뷰의 기능 상태 원천은 `getTimesheetContext.features`. 그 외 `getApprovalSettings` 호출처(FeatureSelection·EmergencyBypass·IssueApproval·Timesheet 정책·AuditPage 등)는 전부 설정 화면 내부. `getFeatureOverview` 소비처는 FeatureSelectionSettings 하나. 단위 테스트 `InboxPage.test.jsx:467-502` 확인. **통과**

### D. 감사 action 분리
- `SettingsService.js:278-288 changedSwitches` — patch 에 키가 있을 때만 저장 **전** 이전 유효값 판정(읽기 실패 = 바뀜), `:329-356 recordPolicyAudit` — `feature/enable|disable {feature}`, `transitionEnforce/enable|disable`, 나머지 `policy/update`(세 키 제외, 비면 생략). 값이 같으면 0행(`SettingsFeatureFlags.test.js`). **통과**
- `policy/update` 자체는 기존대로 "값 변경 여부와 무관하게" 남는다 — 설계 §2.2 그대로(기존 동작). 프론트가 기능 토글·비상 해제를 단일 키로 보내고 `IssueApprovalPolicySettings` 가 비상 키를 patch 에서 뺐으므로 엉뚱한 `transitionEnforce` 행이 생기지 않는다(`PolicyFallback.test.jsx`). **통과**
- 감사 화면: `AuditSettings.jsx:26-27` `feature:'new'`, `transitionEnforce:'moved'`; 라벨 `policy.audit.area.feature|transitionEnforce` kr/en 존재, action 은 기존 `enable|disable` 재사용, 엑셀 내보내기(`exportAuditExcel.js:309`)도 같은 키. **통과**

### E. fail-open·문구 방향
- 기능 상태 null(로딩·실패·거부) → 메뉴 배지 없음(`featureBadgeOf`), 이슈 승인 화면 접지 않음(`features?.issueApproval === false` 일 때만), 타임시트 안내 없음, 팀 타임시트 배너 없음(`contextFeatures?.timesheetApproval === false`). 이슈 패널·내 타임시트는 서버 판정이 진실이고 서버 표시 판정은 `.catch(()=>true)`. **통과**
- 비상 해제 모달: 토글 "승인 없이 상태 변경 허용"(체크 = 해제), 모달 제목 "비상 해제를 켤까요?", 본문 "…비상 해제를 끄면 바로 다시 강제됩니다" — 토글 방향과 일치(요구서 원문 "다시 켜면"의 오독 위험을 설계가 교정, en 동일). 강제 복귀는 모달 없음. 기능 끄기 모달 "이슈 승인을 끌까요?/…다시 켜면 저장된 규칙대로 바로 확인합니다" 방향 일치. **통과**

### F. 메뉴·URL
- `settingsNavigation.js:46-51` — `features` 일반 묶음 첫 항목·`DEFAULT_SETTING`, `approvalSetup` 일반 묶음. 메뉴 항목은 배지만 붙고 삭제 없음(`featureBadgeNodeOf`). **통과**
- `canonicalSettingLocation`(`:76-84`) — 옛 `flows|groups|approvers|worklogHistory` → 새 위치+탭, `approval&section=flows|groups|approvers` → `approvalSetup`, `approval` 의 다른 section 제거, 미지 → `features`. `InboxPage.jsx:179-190` replace effect. **통과**
- 결재 구성(`ApprovalSetupSettings`)·이슈 승인 메뉴는 기능 끔과 무관하게 접근 가능(`FeatureOffNotice` 소비처는 IssueApproval·Timesheet 둘뿐, 결재 구성은 게이트 없음). **통과**

### I. 테스트·빌드 (직접 실행)
- 백엔드 `npx jest`: **157/157 suites, 2460/2460** 통과.
- `npm run check:bundle`: `[bundle-check] OK`.
- UI `CI=true npx jest`: 1회차(백엔드와 동시) 77/78 · 672/677(위 "실패" 의 불안정 테스트), `--runInBand` **78/78 · 677/677**, 병렬 재실행 **78/78 · 677/677**.
- UI `CI=false npm run build`: 성공. 경고는 `node_modules`(@atlaskit source map 2건, react-select postcss-calc 1건)뿐 — 우리 코드 0.
- `idleSqlBudget.test.js`: 상한 수치 변경 없음(diff 는 케이스 추가만, `-` 행에 숫자 변경 없음). "두 기능 끔" 케이스 통과.
- testId 삭제 0건: `git grep HEAD` 비테스트 소스의 testId 392개(`testId=`·`data-testid=`·`testId:` 형식) 전부 현재 트리에 존재(현재 479개).

### J. 범위 밖 변경
- `manifest.yml`·`craco.config.js`·`static/ui/public/*`·`src/rdb/schema`·마이그레이션·`package*.json` 변경 없음(`git status`). 새 트리거·스케줄·fan-out 없음.
- 결재 경로: `ApprovalService` diff 는 생성자 주입·`assertFeatureOpen`·`requestGate`·`createIssueApproval` 코드 분기뿐(+40/-2). **통과**
- (참고) 미추적 `src/rdb/query/__test__/noBoundLimit.test.js`·`SettingsWorkforceLink.test.js` 는 선행 작업분.

### 불변식 감사(이번 변경분)
- 도메인 순수: `src/domain/settings/features.js` 시간·SQL·fetch 없음, `judge.js` 는 `featureEnabled` 입력만 추가. 
- 서버 문구 생성 없음(코드만). asApp 신규 없음. CAS·승인자 행·이벤트 id 경로 무변경. 엔티티 프로퍼티 판정 사용 없음.

## 관찰(결함 아님, 판단은 리더)
1. `submitTimesheet` 의 첫 판정(`:458`)과 공통 경계 사이에 기능이 꺼지면 `upsertWorklogRefs`(`:522`) 부속 행이 남는다(catch 는 `ALREADY_OPEN` 만 정리, `:545-547`). 전환(`TransitionService` catch → `deleteOrphan`)과 달리 정리하지 않는다. 기존 다른 실패 코드도 같은 동작이고 경쟁 창이 짧아 영향은 작다.
2. `getFeatureOverview` 의 `isProjectScopeConfigured` KVS 실패가 `configured:false` → 화면에 "모든 프로젝트"로 보인다(백엔드 §5-2·프론트 §4 가 이미 기록). 표시 fail-open 이라 허용 범위.
3. `FieldChangeEventService` A2 — 끔 상태에서는 결재 중 필드 변경 요청이 트리거로 만료되지 않는다(설계 의도, 패널 지연 판정·적용 직전 확인이 막음).

## 실행 결과
| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과(`ko-KR.json`·`en-US.json` 생성) |
| `npx jest` (루트) | 157 suites / 2460 tests 통과 |
| `npm run check:bundle` | OK |
| `CI=true npx jest` (static/ui, 백엔드 동시) | 1 failed(IssueApprovalSettings 5건) — 부하 의존 |
| `CI=true npx jest --runInBand` (static/ui) | 78 / 677 통과 |
| `CI=true npx jest` (static/ui 재실행) | 78 / 677 통과 |
| `CI=false npm run build` (static/ui) | 성공, 우리 코드 경고 0 |
| 대상 테스트 재실행(`test/feature`·`test/permission`·idleSqlBudget·FeatureGate·FeatureFlags) | 79 통과 |
