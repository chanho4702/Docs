# 급여 관리 리뉴얼 — 통합 정합성 검증 보고서 (Phase C)

검증: integration-verifier / 2026-07-13
기준: `01_architect_design.md` §2 경계면 계약 + §2.2 불변식 4항 · `02_backend_report.md` · `02_frontend_report.md`
방법: 생산자/소비자 실코드 양쪽 동시 읽기 + jest/build 실행

## 종합 판정: 전 항목 통과 (실패 0 / 미검증 1 — E2E 런타임)

---

## 통과 (PASS)

### 1. 경계면 교차 비교 — getProjectSalaryList
- **생산자** `ProjectUsersService.js:95-120`: `return {rows, meta:{projectMonths}}` → guardedDefine(responseWrapper) → `{success:true, rows, meta}`.
- **소비자** `SalaryManagementPage.jsx:43-50`: `data.rows`, `data.meta.projectMonths` 접근. 필드명·중첩 구조 글자 그대로 일치.
- SalaryRow 필드 대조 (쿼리 `ProjectUsersQuery.FIND_SALARY_BY_PROJECT_ID:68-81` ↔ 소비 `rows`):
  - `project_member_id`(BIN_TO_UUID) → 행 key + mutation payload ✓
  - `account_id` → userMap `executeRequest('getUser')` 병렬조회 ✓ (ProjectUserPanel과 동일 패턴)
  - `salary` → InlineEdit 투입급여 ✓ / `salary_type`(COALESCE 정규화) → Select 모드 ✓
  - `annual_salary`(u.salary LEFT JOIN, null 가능) → `== null` 시 '-'+경고 ✓
  - `effective_salary`(서버 산정) → toLocaleString 읽기 ✓ / `total_count`(COUNT OVER) → 페이징 ✓
  - snake_case 계약 준수. camel/snake 혼선 없음.

### 2. 경계면 교차 비교 — updateProjectMemberSalary
- **생산자** `ProjectUsersService.js:131-147`: CASE '' 미변경 패턴. params `[salary,salary,salary_type,salary_type,accountId,project_member_id]` ↔ 쿼리 `UPDATE_SALARY_BY_KEY:83-90` 6개 바인딩 순서 일치.
- **소비자** `SalaryManagementPage.jsx:73-97`: 모드 편집 시 `{project_member_id, salary_type}`만, 급여 편집 시 `{project_member_id, salary}`만 전송(미전송=미변경 계약 준수).
- **success:false 분기 처리** `SalaryManagementPage.jsx:76-83`: `if(!result?.success){실패토스트;return;}` — 이 코드베이스 반복 버그 패턴 정확히 대응. INVALID_SALARY_TYPE(`ProjectUsersService.js:133-134` throw → responseWrapper `{success:false}`)여도 안전 처리.
- onSuccess invalidate: `projectKeys.salary(project_id)` + `projectKeys.cost(project_id)`(`:88-89`) — 비용탭 정합 계약 준수.

### 3. 불변식 (§2.2)
- **(a)** 항상 `{success, rows, meta}`, rows 배열: 빈 케이스 `ProjectUsersService.js:96-98` `{rows:[], meta:{projectMonths:0}}` ✓
- **(b)** effective_salary 항상 number(NaN 금지): `EffectiveSalary.js:41-48` `|| 0` 가드. PROJECT 행 `effective===round(salary)`(`:43`) ✓ — jest 29케이스 PASS.
- **(c)** 하위호환: `ProjectCostService.js:127-129` `resolveMemberSalaries`+`totalSalary=Σ유효급여`. 전 멤버 PROJECT면 effective=round(salary), 정수급여 전제 하 Σ=기존 summary.total_salary 동일. `CostCalculator.test.js`·`PortfolioAggregator.test.js` PASS(회귀 0). ProjectCostService 치환 코드 검토: 캐시 miss(`:127`)·hit(`:180` buildByIssue) 양경로 모두 resolveMemberSalaries 적용, `_projectMonths` 캐시 payload(`:158`) 저장 — 대칭.
- **(d)** salary/salary_type 부분 업데이트: CASE '' 패턴으로 전송 필드만 갱신 — jest + 쿼리 검증 ✓

### 4. 월할 환산식 / 공휴일 제거
- `computeProjectMonths`(`EffectiveSalary.js:26-33`): 달력일수(종료일 포함)÷30.4375, 네이티브 Date. 근무일/공휴일 의존 없음.
- **급여 조회 경로 공휴일 페치 제거 확인**: `getProjectSalaryListService`(`ProjectUsersService.js:103-106`) Promise.all = `getSummaryDataService` + `findSalaryByProjectIdRepository`만. `getPublicHolidayListService` 미포함 ✓. (비용 서비스는 scheduleRate용 공휴일 유지 — 설계대로 불변)

### 5. 탭 구조 (부모-자식 개편) — 실물 로직 검증
- `tabs.js:66-97`: projectUser 부모(component 없음, children만) = analysisReport(`:141-196`) 패턴 동일.
- `CommonTab.jsx:6-8 getFirstKey`: `tabs[0]?.children?.[0]?.key ?? tabs[0]?.key`. tabs[0]=dashboard(children 없음) → 초기 진입=dashboard. **기존 회귀 없음**.
- `CommonTab.jsx:10-18 findActiveConfig`: 자식 active 시 자식 config 반환 → `canRender()` 게이트 동작. projectSalary(canReadCost) false → `NoPermissionPage`(`:55`).
- **프론트 리포트 판단 지점 확정**: `DropdownTab.jsx:32-41`은 canRender 필터 없음 → PROJECT_COST 없는 사용자에게도 '급여 관리' 항목이 드롭다운에 보이고 클릭 시 NoPermissionPage. → **기존 analysisReport(projectProgress/projectCost 자식도 canRender 게이트+드롭다운 노출)와 100% 동일 컨벤션**. 완전 숨김은 공통 컴포넌트 변경 필요(범위 밖)이라 기존 패턴 유지가 정당. **판정: 정합(기존 컨벤션 일치)**.

### 6. 인력관리 회귀 (ProjectUserPanel)
- `ProjectUserPanel.jsx`: head cells = name/role/level/action(`:55-62`, action은 `head.4`). salary 헤더/셀 제거됨.
- role/level 편집(`:98-176`)·`findProjectusersByProjectId` 조회(`:64-69`)·`updateProjectUsersByKey` 업데이트(`:198-247`) 온전. salary 미전송(role_key/level_key만).
- import 정리 확인: Textfield/formatNumber/parseNumber/InformationIcon/Tooltip 제거됨, 본문 dangling 참조 없음. **build 통과로 재확인**.

### 7. 권한 매핑 (deny-by-default 회피)
- `PermissionMap.js:82-83`: `getProjectSalaryList: R('PROJECT_COST','detail')`, `updateProjectMemberSalary: W('PROJECT_COST','inherited')` 2건 존재.
- `permissionMap.contract.test.js` PASS(등록집합 ↔ 맵키집합 정합, PERMISSION_UNMAPPED 회피).
- 프론트: 편집 `canWrite('PROJECT_COST')`(`SalaryManagementPage.jsx:30`), 탭 노출 `canRender:()=>canReadCost`(`tabs.js:94`). 서버 가드와 일치.

### 8. i18n
- `ko-KR.json:1759-1789` / `en-US.json:1759-1789`: salary 네임스페이스(tab/title/table/mode/meta/warn/toast/empty) 전 키 존재.
- `userList`(ko:1125 "인력 목록" / en:1125 "Members"), user.salary→"연봉"/"Annual Salary"(2018/2041/2090) merge 반영.
- 프론트 `t()` 참조 키(salary.mode.*, salary.table.*, salary.warn.*, salary.toast.*, salary.meta.*, salary.empty, salary.tab.label, projectDetail.tabs.userList) 전부 존재. ko-KR/en-US 직접수정 아님(merge 산출).

### 실행 검증
- `npm test`(root): **14 suites / 219 tests PASS**. (StorageService console.error는 기존 의도된 catch-path 테스트, 실패 아님)
- `CI=true npx react-scripts test`: **8 suites / 73 tests PASS**.
- `CI=false npm run build`: **성공**. 경고는 기존 node_modules source-map(@atlaskit/marklassian)·merge.js module-type뿐 — 신규/수정 파일 무관.

---

## 관찰 사항 (비차단, 참고)

- **salary=0 입력 경계**: `UPDATE_SALARY_BY_KEY`의 `CASE ? WHEN '' THEN salary` 패턴은 salary를 0으로 설정 시 드라이버 바인딩에 따라 미변경으로 처리될 수 있음(MySQL `0=''` 수치 강제 시 TRUE). 단 이는 기존 `UPDATE_BY_KEY_WITH_PARAMS`의 salary 동작을 그대로 계승한 것으로 **신규 회귀 아님**. PROJECT 모드에서만 의미 있고 실사용상 급여 0 설정은 예외적. 필요 시 별도 sentinel 처리 검토.
- **불변식(c) 정수 전제**: totalSalary가 `summary.total_salary`(Σraw)에서 `Σround(effective)`로 변경. 급여가 정수(UI parseNumber로 정수 제약)면 완전 동일. 소수 급여 존재 시 라운딩 단위 미세 차이 이론상 가능하나 UI 입력 제약상 실사용 무영향 — 설계가 명시적으로 수용한 동작.

---

## 미검증 (UNVERIFIED)

- **E2E 런타임**: forge deploy/tunnel 상 실제 Jira 환경에서의 v012 ALTER 멱등 실행, 급여탭 렌더·편집·비용탭 재계산 정합은 정적 교차검증·단위테스트·빌드까지만 확인. 실 DB(TiDB) `ADD COLUMN IF NOT EXISTS` 및 invoke 왕복은 배포 환경에서 별도 확인 필요.
