# 검증 리포트 (회차 1) — settings-restructure

작성: 2026-10-12 integration-verifier. 기준: `01_architect_design.md`(계약), `02_frontend_report.md`, 실제 소스·`git status`/`git diff`.

## 요약  통과 9 / 실패 0 / 미검증 6

결함(실패)은 발견하지 못했다. 설계서와 다른 점 1건(항목 수 8 → 9)은 **설계서 오기**이며 구현이 맞다(3+1+3+2=9).
관찰 사항(수정 불요·선택) 3건은 맨 아래에 적었다.

## 실패

없음.

## 미검증 (실기기·배포 필요 — 프론트 보고서 목록과 동일, 코드로는 확인 불가)

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| 접힘 사이드바에서 `.app-nav-child-group` 숨김 | 화면 확인 필요. 규칙상 `appShell.css:33` `.app-page--collapsed .app-nav-group-label{display:none}` 에 걸림(클래스 동시 부여 확인) | 업무함 설정 진입 → 사이드바 접기 |
| 설정 엔트리(adminPage) iframe 높이 | 실기기. 신규 파일에 `vh` 사용 없음(`appShell.css:45` 의 100vh 는 기존 행, 무변경) | 탭 전환하며 하단 버튼 잘림·되먹임 확인 |
| 묶음 라벨 간격·다크 모드 | 실기기. CSS 는 기존 `--ds-text-subtlest` 변수 재사용 | 다크 테마로 업무함 사이드바 확인 |
| 새 lazy 청크 배포 직후 1회 reload | 배포 필요. 코드상 모든 새 lazy 가 `importWithReloadOnce` 경유(아래 4) | 배포 직후 열린 탭에서 이슈 승인·타임시트 탭 전환 |
| 뒤로 가기로 `section` 만 바뀌는 경우 | 탭 페이지가 `initialTab` 을 마운트 때만 읽음(AuditPage 기존 동작과 동일) — 범위 밖 | 브라우저 뒤로 가기 |
| 옛 알림·북마크 링크 실제 클릭 | 실기기. 단위 테스트(InboxPage.test)로는 통과 | `?tab=settings&setting=flows` 등 직접 열기 |

## 통과

### 1. 저장 patch 분리의 정합성 — 통과
- 전역 정책 `PolicySettings.jsx:37-51` patch = 13개 일반 키만(이슈 승인 3키 없음). `formKey`(21-35)에서도 제거.
- 이슈 승인 `IssueApprovalPolicySettings.jsx:44-48` patch = `transitionApprovalEnabled`·`fieldChangeApplyFallback('APP'|'OFF')`·`statusLabels` 3개만.
- 서버 `src/resolver/settings/SettingsService.js:233-268` `saveApprovalSettings` → `normalizeSettingsPatch`(106-174)는 **들어온 키만** `Object.entries(patch)` 로 정규화(기본값 채움 없음). 미지 키만 거부.
  → `SettingsRepository.savePolicy`(301-304)는 patch 의 엔트리만 `setValue` — 나머지 키 무접촉. `setValue`(268-)가 `invalidatePolicyCache()` 호출 → 저장 뒤 `getApprovalSettings()` 가 전체 설정을 새로 읽어 반환.
  → `assertTimesheetException`(291)은 해당 키가 없으면 즉시 반환, `control.prepareSave` 는 통제 키 기준. 부분 patch 로 부작용 없음.
- 두 폼 모두 `queryKey: settingsKeys.policy()` 공유, `onSuccess: (settings) => queryClient.setQueryData(settingsKeys.policy(), settings)` (`PolicySettings.jsx` 하단, `IssueApprovalPolicySettings.jsx` 하단) — 서버가 전체 설정을 돌려주므로 캐시 교체가 다른 폼 키를 잃지 않는다.
- 테스트: `PolicyFallback.test.jsx` 신규 2건이 두 폼 patch 의 키 집합을 직접 단언.

### 2. URL 계약 — 통과
- `InboxPage.jsx:176` section = `section ?? auditTab ?? legacySectionOf(rawSetting)` (쓰기는 section 만, auditTab 은 읽기 호환).
- 옛 링크 replace `InboxPage.jsx:178-185`: `setting=flows|groups|approvers` → `setting=approval&section=<탭>`, `worklogHistory` → `setting=audit&section=worklog`, `auditTab` 제거, `{replace:true}`.
- `changeSection`(186-188): `section` 쓰고 `auditTab:null`.
- 설정 항목 변경 `selectSetting`(309-313): `section:null, auditTab:null`. 설정 이탈 `selectView`(298-305): `setting·section·auditTab` 모두 null.
- `inboxUrl.js` `updateInboxParams` 는 화이트리스트 없이 patch 의 모든 키를 set/delete(null·''·undefined → delete) — `section` 보존·삭제 정상. 다른 화면에서 `section` 파라미터를 쓰는 곳 없음(grep).
- `SettingsPanel` 은 정규화된 `selected` 를 받으므로 첫 렌더(replace 전) 탭은 InboxPage 의 legacy 폴백 section 이 결정 — 올바름. `Feature key={key}` 로 항목 바뀌면 재마운트.
- 테스트: InboxPage.test 신규 3건(flows replace / worklogHistory → section=worklog·auditTab 미기록 / auditTab 읽기·section 쓰기·항목 변경·설정 이탈 시 제거).

### 3. 메뉴 두 표면 일치 — 통과
- 단일 원천 `SETTINGS_GROUPS`(settingsNavigation.js). 설정 엔트리 `SettingsPage.jsx:68` `settingsNavigationGroups(t)` → AppShell `groups`; 업무함 `InboxPage.jsx:284` `children: settingsNavigation(t)`(같은 순서 flatMap, child.group=묶음 라벨) → `AppShell.jsx:56-66` 이 묶음이 바뀌는 자리에 라벨 삽입. 같은 집합·순서 보장.
- `SETTINGS_NAVIGATION` = `SETTINGS_GROUPS.flatMap(items)` — 구조적으로 동일 집합(테스트 `settingsNavigation.test.js:12`).
- 옛 prop/이름 잔존 grep(`normalizeSetting`·`settingsNavigation`·`SETTINGS_NAVIGATION`·`auditTab`·`onAuditTabChange`): `onAuditTabChange` 0건. `auditTab` 은 InboxPage 읽기 호환·`auditModel.auditTabOf`(SettingsPage 의 audit 초기 탭)·JSDoc 뿐. `FEATURES` 키 = 9개 항목과 일치.
- 다른 화면에서 `setting=flows` 등 옛 값으로 링크를 만드는 코드 없음(grep `src`·`static/ui/src`).

### 4. lazy 청크·엔트리 — 통과
- 새 lazy 전부 `React.lazy(() => importWithReloadOnce(loader))`: `IssueApprovalSettings.jsx:12`(정책·결재선·승인 그룹·승인자), `TimesheetSettings.jsx:11`(정책·제공자 안내·인증·기간 마감·팀), `SettingsPage.jsx:12`(approval). 대상 모듈 10개 모두 `export default` 보유.
- craco ENTRIES·`static/ui/public`·`manifest.yml` 무변경(`git status`/`git diff HEAD` 0건).

### 5. i18n — 통과
- `npm run merge` 성공(`locales\ko-KR.json`·`en-US.json` 생성).
- kr/en 전 파일 평탄화 키 집합 diff = 0(스크립트 대조). policy.json 최상위 중복 키 없음(`section`·`issueApproval` 신규).
- 신규 키 전부 사용처 있음: `settings.group.*`·`settings.tab.approval`(settingsNavigation.js), `issueApproval.{title,hint,tab.policy}`(IssueApprovalSettings), `issueApproval.policyTitle`(IssueApprovalPolicySettings), `section.{deadline,notify,security}`(PolicySettings), `timesheet.settings.tab.*`(TimesheetSettings:54 템플릿).
- 제거 키 `policy.settings.tab.worklogHistory` 참조 0건. `settings.tab.flow|group|approver` 는 남아 있고 IssueApprovalSettings 탭 라벨로 사용.

### 6. 테스트·빌드 — 통과(아래 실행 결과)
- `CI=true npm run build` 실패는 **변경 전에도 동일하게 실패** — 프론트 보고서 주장 사실 확인.

### 7. 범위 밖 변경 — 통과
- `src/`·`manifest.yml`·`static/ui/public`·craco 무변경. `entries/projectSettings.jsx` 무변경이며 바뀐 모듈(settingsNavigation·SettingsPage·PolicySettings·TimesheetSettings·AppShell)을 import 하지 않음.
- 섹션 폼 내부(FlowSettings·GroupSettings·ApproverSettings·TimesheetPolicySettings·WorklogCertSettings·PeriodCloseSettings·TimesheetTeamSettings·TimeTrackingProviderGuide) 무변경 — 이동만. PolicySettings 는 설계 §4.3 대로 필드 재배치(FormSection 3개)와 저장 비활성 조건 `!dirty` 단순화만.

### 8. 경계면 표 (resolver 무변경 — 소비만 확인)

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getApprovalSettings` | `SettingsController.js:5` → `{content: {...policy, approvalGroups}}`(SettingsService:225) | `PolicySettings`·`IssueApprovalPolicySettings` `query.data.<키>` (invokeApproval 이 content 벗김) | O |
| `saveApprovalSettings` | `SettingsController.js:9` → `{content: getApprovalSettings()}` 전체 설정 | 두 폼 `onSuccess(settings)` → `setQueryData(settingsKeys.policy())`, 실패 `errorText(error.code)` | O |

### 9. 불변식·등록·유휴 비용 — 해당 없음(백엔드 무변경) / 번들 로드 통과
- 새 resolver·트리거·마이그레이션·asApp 사용 없음. `npm run check:bundle` OK.

## 실행 결과

| 명령 | 위치 | 결과 |
|---|---|---|
| `npm run merge` | 리포 루트 | 성공 |
| `CI=true npx jest` | static/ui | **Test Suites 70 passed / Tests 591 passed** (42.7s) |
| `npx jest` | 리포 루트(백엔드) | **Test Suites 151 passed / Tests 2342 passed** |
| `npm run check:bundle` | 리포 루트 | OK |
| `CI=false npm run build` (= craco build) | static/ui | 성공(exit 0). "Compiled with warnings" — `node_modules/@atlaskit/react-select/dist/esm/components/multi-value.compiled.css:56:53` postcss-calc(Css Minimizer) + `@atlaskit/analytics-next-stable-react-context` source map 누락. 우리 코드 경고 0 |
| `CI=true npm run build` (변경 후) | static/ui | **실패** exit 1 — "Treating warnings as errors because process.env.CI = true. / Failed to compile." 원인 행: `multi-value.compiled.css:56:53` |
| `CI=true npm run build` (**변경 전**, `git stash push -u` 상태) | static/ui | **동일하게 실패** exit 1 — 같은 메시지·같은 원인 행. 로그 1~20행 diff 는 CSS 청크 해시 파일명(`9140.…` ↔ `6447.…`) 한 줄뿐 |

- stash 는 `git stash pop` 으로 복원 완료 — 복원 후 `git status --short` 가 검증 시작 시점(M 15 / ?? 8)과 동일, `git stash list` 비어 있음.
- 변경 전 실패 빌드로 `build/` 가 덮였을 수 있어 마지막에 `CI=false npm run build` 를 다시 돌려 현재 코드 기준 산출물로 맞춰 두었다(exit 0).

## 관찰 사항 (결함 아님 — 리더 판단용)

1. **설계서 항목 수 오기** — `01_architect_design.md` §1 "11 → 8 항목" 과 §2 주석 "평평한 8개" 는 9개가 맞다. 구현·테스트(9 고정)가 옳으니 설계서만 고치면 된다.
2. **제목 중복** — 업무함에서 이슈 승인을 열면 AppShell `h1`(`policy.settings.tab.approval` "이슈 승인") 아래 `Heading large` "이슈 승인 설정", 그 아래 각 탭 내용(FlowSettings 등)의 자체 Heading 이 다시 나온다. 기존 전역 정책(`h1` + `policy.title`)도 같은 패턴이라 이번 범위("이동만")에서는 허용 범위. UX 정리는 후속 과제 후보.
3. **legacy 링크에 `section` 이 함께 있을 때** — `?setting=flows&section=groups` 처럼 둘 다 오면 replace 가 `section=flows` 로 덮는다(`InboxPage.jsx:182`). 옛 링크는 `section` 을 가진 적이 없어 실제로 생길 수 없는 조합 — 수정 불요.
