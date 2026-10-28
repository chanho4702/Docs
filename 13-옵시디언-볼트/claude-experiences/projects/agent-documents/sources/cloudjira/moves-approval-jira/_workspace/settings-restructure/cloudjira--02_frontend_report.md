# 02 프론트 보고서 — 설정 화면 재구성 (프론트 전용)

작성: 2026-10-12 frontend-engineer. 입력: `00_input/requirement.md`, `01_architect_design.md`(백엔드 보고서 없음 — 백엔드 무변경).

## 소비하는 resolver (변경 없음)

| resolver | 소비 위치 | 비고 |
|---|---|---|
| `getApprovalSettings` | `PolicySettings`, `IssueApprovalPolicySettings`(신규) | 같은 쿼리키 `settingsKeys.policy()` — 캐시 공유 |
| `saveApprovalSettings` | 위 두 폼 | **부분 patch**. 전역 정책 폼은 13개 일반 키만, 이슈 승인 정책 폼은 `transitionApprovalEnabled`·`fieldChangeApplyFallback`·`statusLabels` 3개만 보낸다. 서버 `SettingsService.saveApprovalSettings` 가 `normalizeSettingsPatch` 후 전체 설정을 돌려줘 `onSuccess` 의 `setQueryData` 가 그대로 유효함을 코드로 확인 |

쿼리키 팩토리·엔트리 3곳(craco ENTRIES·public html·manifest) 변경 없음.

## 바뀐 파일

신규
- `static/ui/src/features/settings/IssueApprovalSettings.jsx` — 이슈 승인 페이지, 탭 policy/flows/groups/approvers, 탭 내용 `React.lazy(importWithReloadOnce)`, testId `issue-approval-tab-${key}`, `initialTab/onTabChange`
- `static/ui/src/features/settings/IssueApprovalPolicySettings.jsx` — 전역 정책에서 분리한 이슈 승인 정책 폼(StatusFlow·fallback 경고·Q53 주석·저장 비활성 조건 그대로)
- `static/ui/src/features/settings/issueApprovalModel.js`, `timesheetSettingsModel.js` — 탭 상수(순수) + `xxxTabOf`(모르는 값 → 기본 탭)
- `static/ui/src/features/settings/policyFormParts.jsx` — 두 정책 폼이 같이 쓰는 `BooleanField`·`errorText`(복사 대신 분리)
- 테스트: `features/settings/__test__/{settingsNavigation.test.js, IssueApprovalSettings.test.jsx, TimesheetSettings.test.jsx}`

수정
- `features/settings/settingsNavigation.js` — `SETTINGS_GROUPS`, `SETTINGS_NAVIGATION`(평평, item 에 `group`), `LEGACY_SETTINGS`(flows/groups/approvers → approval, worklogHistory → audit + section), `normalizeSetting`(시그니처 유지), `legacySectionOf`, `settingsNavigation(t)`(children 용, `group` = 묶음 라벨 문자열), `settingsNavigationGroups(t)`
- `features/settings/SettingsPage.jsx` — `FEATURES` 에서 flows/groups/approvers 제거·approval 추가. `SettingsPanel({selected, section, onSectionChange})`, 탭 페이지(approval·timesheet·audit)에 `initialTab/onTabChange`. 설정 엔트리는 `groups={settingsNavigationGroups(t)}`, 하위 탭은 메모리 state(항목 바꾸면 비움)
- `features/settings/PolicySettings.jsx` — 이슈 승인 3키·StatusFlow·statusLabels 상태 제거(formKey·patch 포함), `FormSection` 세 묶음(deadline/notify/security). 저장 비활성 조건은 `!dirty` 로 단순화(statusLabelsDirty 가 이 폼에서 사라짐)
- `features/settings/TimesheetSettings.jsx` — 탭 4개(policy=TimesheetPolicySettings+TimeTrackingProviderGuide / cert / periodClose / teams), 탭 내용 lazy, 페이지 Heading 없음, 상단 주석 갱신, testId `timesheet-settings-tab-${key}`
- `app/AppShell.jsx` — children 의 `group` 이 직전 child 와 다르면 `<div class="app-nav-group-label app-nav-child-group">` 삽입
- `app/appShell.css` — `.app-nav-child-group { padding-top: 8px; padding-bottom: 4px; }`
- `features/inbox/InboxPage.jsx` — `section` 파라미터(쓰기는 section 만, `auditTab` 은 읽기 호환), 옛 setting 값은 `legacySectionOf` 로 `setting=<새키>&section=<탭>` replace(auditTab 제거), `selectSetting` 은 `section·auditTab` null, 설정을 벗어나면 `setting·section·auditTab` 제거. `auditTabOf` import 제거(SettingsPanel 이 처리)
- `features/audit/AuditPage.jsx` — JSDoc 한 줄(URL 파라미터 이름)만
- 테스트 갱신: `PolicyFallback.test.jsx`(IssueApprovalPolicySettings 렌더 + 부분 patch 2건 추가), `InboxPage.test.jsx`(SettingsPanel 목이 section 노출, 3건 추가), `AppShell.test.jsx`(child group 라벨 1건)
- `locales/{kr,en}/policy.json` — `settings.group.{general,issue,worklog,records}`, `settings.tab.approval`, `issueApproval.{title,hint,policyTitle,tab.policy}`, `section.{deadline,notify,security}` 추가, 미사용 `settings.tab.worklogHistory` 제거(grep 으로 소비처 없음 확인)
- `locales/{kr,en}/timesheet.json` — `settings.tab.{policy,cert,periodClose,teams}` 추가

`AuditTrail.test.jsx` 252행은 수정 없이 통과(worklogHistory → audit 유지).

## 설계와 달리 한 점

1. **항목 수 9개(설계서 "8")** — 설계서 §1 표와 §2 `SETTINGS_GROUPS` 의 항목을 세면 policy·projects·managers·approval·timesheet·worklogControl·workforce·audit·data = 9개다(11 − flows/groups/approvers + approval). 설계의 집합을 그대로 따랐고, "8" 은 오기로 보고 테스트도 9로 고정했다.
2. **`BooleanField`·`errorText` 를 `policyFormParts.jsx` 로 분리** — 두 폼이 같은 조각을 쓴다. `IssueApprovalPolicySettings` 가 `PolicySettings` 청크를 끌어오지 않게 별도 파일로 뺐다.
3. **전역 정책 저장 비활성 조건** — `(!dirty && !statusLabelsDirty)` → `!dirty`. statusLabels 가 이 폼에서 빠졌기 때문(이슈 승인 폼은 원래 조건 그대로).
4. **commentNotifyEnabled 위치** — 라벨 문구에 "(전환 승인)"이 붙어 있지만 설계 §4.3 대로 전역 정책 > 알림·독촉 섹션에 뒀다. 문구 변경은 범위 밖.
5. InboxPage 의 `section` 계산에 `legacySectionOf(rawSetting)` 폴백을 추가 — replace 가 일어나기 전 첫 렌더에서도 올바른 탭으로 열린다(replace 뒤에는 URL 의 section 을 읽음).

## 테스트·빌드 결과

| 명령 | 결과 |
|---|---|
| `npm run merge`(리포 루트) | 성공 — `locales\ko-KR.json`·`en-US.json` 생성(.gitignore 대상, 미추가) |
| `CI=true npx jest`(static/ui) | **Test Suites 70 passed / Tests 591 passed** |
| `CI=false npm run build`(static/ui, = `npm run build:ui`) | 성공. "Compiled with warnings" — 유일한 경고는 `node_modules/@atlaskit/react-select/.../multi-value.compiled.css:56:53` postcss-calc(기존·외부). 우리 코드 eslint 경고 0 |
| `CI=true npm run build` | 위 node_modules 경고를 에러로 승격해 실패 — 기존부터 있는 외부 CSS 경고이며 이번 변경과 무관 |

신규·갱신 테스트(설계 §7): settingsNavigation(4건: 그룹↔평평 일치, 묶음 분리, children/groups 형태, legacy·미지 값), IssueApprovalSettings(2건: 탭 전환·lazy·onTabChange, initialTab/미지 값), TimesheetSettings(2건: 탭 4개·기본 policy 에 제공자 안내, initialTab/미지 값), AppShell child group 라벨(1건), PolicyFallback(기존 2건 대상 교체 + 부분 patch 2건), InboxPage(3건: setting=flows replace, worklogHistory → section=worklog·auditTab 미기록, auditTab 읽기 호환·section 쓰기·항목 변경/설정 이탈 시 제거).

## 남은 미검증(실기기 확인 필요)

- 접힘 사이드바에서 하위 묶음 라벨(`.app-nav-child-group`)이 `.app-page--collapsed .app-nav-group-label { display:none }` 로 숨는지(규칙상 숨지만 화면 확인 전)
- 설정 엔트리(adminPage) iframe 높이 — 탭 전환 시 내용 높이로 줄고 느는지, 100vh 되먹임 없는지(새 코드에 vh 사용 없음)
- 업무함 사이드바(fullPage)에서 묶음 라벨 간격·다크 모드 색
- 배포 직후 새 lazy 청크(IssueApprovalSettings·IssueApprovalPolicySettings·타임시트 탭들) 요청 실패 시 `importWithReloadOnce` 1회 reload
- 브라우저 뒤로 가기로 `section` 만 바뀌는 경우 — 탭 페이지는 AuditPage 선례처럼 `initialTab` 을 마운트 때만 읽어 탭이 따라가지 않는다(기존 감사 탭과 같은 동작, 이번 범위에서 바꾸지 않음)
- 옛 알림·북마크 링크(`setting=flows|groups|approvers|worklogHistory`) 실제 클릭 확인
