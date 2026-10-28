# 급여 관리 리뉴얼 — 프론트엔드 구현 보고서 (Phase B)

구현: frontend-engineer / 2026-07-13
설계서: `01_architect_design.md` §4/§6/§7 Phase B · 백엔드 shape: `02_backend_report.md` §2 (단일 진실)

---

## 1. 변경/신규 파일 목록

### 신규
| 파일 | 내용 |
|------|------|
| `static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx` | 급여 관리 자식 탭. getProjectSalaryList 소비, updateProjectMemberSalary 편집, userMap 병렬조회, PROJECT_COST canWrite 게이트, 경고 UI |
| `locales/kr/salary.json` | 급여 관리 i18n (kr) — §6.1 그대로 |
| `locales/en/salary.json` | 급여 관리 i18n (en) — §6.2 그대로 |

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/utils/queryKey/projectKeys.js` | `salary(projectId, page)` 팩토리 추가 (page 생략 시 prefix `['projectSalary', projectId]` — invalidate용) |
| `static/ui/src/constants/tabs.js` | `import SalaryManagementPage` 추가. `projectUser` 탭을 부모-자식으로 개편(자식: `projectUserList`=ProjectUserPanel(기본), `projectSalary`=SalaryManagementPage/canRender:canReadCost) |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | salary head/row 셀 제거. 미사용 import 제거(`Textfield`, `formatNumber/parseNumber`, `InformationIcon`, `Tooltip`). role/level 편집·updateProjectUsersByKey는 유지 (salary 미전송) |
| `locales/kr/user.json` | 급여→연봉 라벨 3키(`table.header.salary`, `modal.edit.label.salary`, `modal.regist.label.salary`) = "연봉" |
| `locales/en/user.json` | 동일 3키 = "Annual Salary" |
| `locales/kr/projectDetail.json` | `tabs.userList` = "인력 목록" 추가 |
| `locales/en/projectDetail.json` | `tabs.userList` = "Members" 추가 |
| `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 산출물(직접수정 아님) |

---

## 2. 소비한 응답 shape (invoke 접근 경로 — 백엔드 계약과 글자 그대로 일치)

### `getProjectSalaryList` — `invoke('getProjectSalaryList', { project_id, page })`
```
res.rows          // SalaryRow[] (빈 케이스도 [])
res.meta.projectMonths   // number (헤더 "투입 개월수" + noPeriod 판정)
```
SalaryRow 소비 필드 (snake_case, 계약대로):
- `row.project_member_id` → 행 key + mutation payload
- `row.account_id` → userMap 병렬조회 키(getUser)
- `row.salary` → 투입 급여(InlineEdit 편집 대상)
- `row.salary_type` (`'PROJECT'|'ANNUAL'`) → 계산 모드(Select 편집 대상)
- `row.annual_salary` (`number|null`) → 연봉(읽기). `== null`이면 '-' + noAnnual 경고
- `row.effective_salary` → 유효 인건비(읽기). `Number(...).toLocaleString()`
- `row.total_count` → 페이징(10건)

> `res.success` 미분기(조회 쿼리는 CostPage 등 기존 패턴과 동일하게 rows/meta 기본값 폴백). 편집 mutation에서는 아래처럼 success를 필수 분기함.

### `updateProjectMemberSalary` — `invoke('updateProjectMemberSalary', { project_member_id, salary?|salary_type? })`
- **`result.success` 필수 체크** (이 코드베이스 반복 버그 패턴 대응): onSuccess 콜백에서 `if (!result?.success) { 실패 토스트; return; }` → success:false(예: INVALID_SALARY_TYPE)여도 reject 없이 반환되므로 명시 분기.
- 성공 시 `invalidateQueries(projectKeys.salary(project_id))` **+ `projectKeys.cost(project_id)`** (비용 탭 정합).
- 미전송 필드는 미변경 계약대로, salary 편집 시 `{project_member_id, salary}`만, 모드 편집 시 `{project_member_id, salary_type}`만 전송.

---

## 3. 설계 대비 달라진 점

- **거의 없음.** §4 프론트 설계·§6 i18n·§7 Phase B를 그대로 구현.
- **낙관적 업데이트(optimistic update) 미적용**: 설계 §4.2가 "모드 변경 시 유효 인건비는 서버 재환산값 의존(projectMonths 서버 소유)이라 낙관적 재계산 안 함, invalidate로 재수신"이라 명시 → mutation을 단순 invalidate 방식으로 구현(ProjectUserPanel의 onMutate optimistic 패턴은 이식하지 않음). effective_salary 정합을 위해 서버 재조회가 정답.
- **경고 UI 위치**: 연봉 미등록(`annual_salary==null`)은 연봉 열에 '-' + WarningIcon 툴팁, ANNUAL 행의 유효 인건비 열에도 사유(noAnnual/noPeriod) 툴팁 병기. projectMonths===0 → 헤더 아래 SectionMessage(warning) 상시 노출.
- **InfoTip 재사용**: 설계의 "InfoTip(월할 환산식)"은 기존 `progress/InfoTip.jsx`를 그대로 사용. help 문구는 formula 성격이라 `calc` 슬롯으로 전달("계산" 라벨).
- **CommonTab 기본 자식 선택 로직 실물 확인(§4.2 검증 포인트)**:
  - `CommonTab.getFirstKey`는 **tabs[0]** 에만 first-child 규칙(`tabs[0].children?.[0].key`)을 적용. projectUser는 tabs[0]가 아니라 dashboard가 tabs[0]이므로 초기 진입 탭은 dashboard(기존과 동일, 회귀 없음).
  - 부모 탭(projectUser) 클릭 시 `onChange`는 `if (tab.children) return`으로 무시하고 `DropdownTab`이 열림 → 자식(인력 목록/급여 관리)을 드롭다운에서 선택. **analysisReport와 100% 동일 동작**.
  - `DropdownTab`은 canRender로 자식을 필터링하지 않음(모든 자식을 드롭다운에 노출). 권한 게이트는 `findActiveConfig`가 활성 자식의 config를 반환 → `canRender()` false면 `NoPermissionPage` 렌더. 즉 **PROJECT_COST 없는 사용자도 급여 관리 항목은 드롭다운에 보이나 클릭 시 NoPermissionPage**. 이는 기존 analysisReport(projectCost/projectProgress)와 동일한 기존 패턴이라 그대로 준수(설계가 참조한 패턴 자체가 이 동작). 완전 숨김이 필요하면 DropdownTab에 canRender 필터를 넣어야 하나, 이는 공통 컴포넌트 변경이라 범위 밖 — 기존 컨벤션 유지.
  - 기존 인력관리 진입 = 드롭다운에서 "인력 목록"(첫 자식, canRender 없음 → 항상 통과)이 기본 급여탭이 아닌 인력 목록을 보여주므로 **기존 UX 보존**.

---

## 4. i18n merge / build 결과

- `cd static/ui && npm run merge` **실행 완료** → `ko-KR.json`/`en-US.json` 재생성.
  - 검증(생성물 직접 확인): `salary.tab.label`(급여 관리/Salary), `salary.meta.help`(존재), `user.table.header.salary`(연봉/Annual Salary), `projectDetail.tabs.userList`(인력 목록/Members) 전부 반영됨.
- `cd static/ui && CI=false npm run build` **성공** (build 폴더 정상 생성).
  - 경고는 기존 node_modules source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐 — 신규/수정 파일과 무관. 미사용 import 정리로 ESLint 경고 없음.

---

## 4-1. 후속 수정 — 헤더 툴팁 추가 (2026-07-13)

요청: '투입 급여'·'유효 인건비' 컬럼 헤더 옆 설명 툴팁.

- `SalaryManagementPage.jsx`: `ProjectIssueTable.jsx`의 `withTooltip`(label + InformationIcon + Tooltip) 컨벤션을 컴포넌트 밖 헬퍼로 이식(`token('color.text.subtle')`, `cursor:'help'`). head의 `investSalary`/`effectiveSalary` 셀에 적용. import 추가: `InformationIcon`, `token`.
- i18n 신규 키 (`locales/kr|en/salary.json` → `table.tooltip`):
  - `salary.table.tooltip.investSalary`
  - `salary.table.tooltip.effectiveSalary`
- 최종 문구(kr):
  - 투입 급여: "이 프로젝트 투입 기간에 대한 총 단가입니다. '투입 급여 기준' 모드에서는 이 값이 그대로 유효 인건비로 사용됩니다."
  - 유효 인건비: "비용 계산에 실제 사용되는 값입니다. 투입 급여 기준 = 투입 급여 그대로, 연봉 환산 = (연봉 ÷ 12) × 투입 개월수. 근무일·휴일과 무관한 월할 기준입니다."
- `npm run merge` 재실행 → ko-KR/en-US 반영 확인. `CI=false npm run build` **성공**(경고는 기존 source-map만).

## 5. 체크리스트

- [x] `invoke` 결과의 `res.rows`/`res.meta.projectMonths`/`res.success` 접근이 백엔드 shape과 일치
- [x] `updateProjectMemberSalary` `result.success === false` 분기(실패 토스트) 처리
- [x] 쿼리키 `projectKeys.salary(projectId, page)` 팩토리로 정의(인라인 배열 없음)
- [x] i18n 키를 `locales/kr/`·`locales/en/`에 추가 + `npm run merge` 실행
- [x] `ko-KR.json`/`en-US.json` 직접 수정 안 함
- [x] `npm run build` 통과
