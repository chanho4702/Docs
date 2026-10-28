# 마이페이지 (My Page) — 통합 정합성 검증 리포트

브랜치: RFC-168 · 검증자: integration-verifier · 입력: `01_architect_design.md` + `02_backend_report.md` + `02_frontend_report.md` + 실제 소스

> 결론: **통과. 실패 0건.** 6개 경계면 함수 전부 생산자↔소비자 shape 일치, 등록/권한/라우트/i18n/성능 모두 정합. 백엔드 219/219 테스트 통과, 프론트 빌드 성공.

---

## 통과 (PASS)

### 1. resolver 응답 shape ↔ 프론트 invoke 소비 경로 (6함수 교차 비교)

| # | 함수 | 생산자 (실제 반환) | 소비자 | 판정 |
|---|------|-------------------|--------|------|
| 1 | `getMyProjectList` | `MyWorkService.jsx:43` `{success:true, data:[{...project, role, level, status}]}` | `useMyPageProjects.js:22` `res.data` → `MyProjectsSection` `p.project_id/project_name/start_date/end_date/role?.name/level?.name/status?.name/status?.color` | ✅ |
| 2 | `getMyIssueList` | `MyWorkService.jsx:212` `{data:issues}` → `{success:true, data:[Issue]}`. 필드셋 `IssueApi.js:251` 에 `status` 포함 → `fields.status.statusCategory` 존재 | `useMyPageIssues.js:34` `res.data` → `MyIssuesSection`/`useMyPageStats` `fields.status.statusCategory.key` | ✅ |
| 3 | `getMyCalendarWorklog` | `MyWorkService.jsx:158` `{data:[Issue]}` (내 워크로그 필터됨) | `useMyPageWorklogs.js:27` `res.data` → `MyWorklogSection` `fields.worklog.worklogs[].started/timeSpent` | ✅ |
| 4 | `getMySkills` (신규 SELF) | `MyPageController.jsx:12` → `getUserSkillsService` → `{success:true, data:{accountId, skillIds}}` | `useMySkills.js:24` `res.data.skillIds`. **invoke 시 accountId 미전달** (`invoke("getMySkills")`) | ✅ |
| 5 | `setMySkills` (신규 SELF) | `MyPageController.jsx:15` → `setUserSkillsService({accountId, skillIds},{accountId})` → `{success:true, data:{accountId, count}}` | `useMySkills.js:31` `invoke("setMySkills",{skillIds})` **accountId 미전달**, `res.success` 판정 + `count` 미소비 | ✅ |
| 6 | `getSkillList` (PUBLIC 완화) | `PermissionMap.js:207` `'PUBLIC'`, `SkillService.js:51` `{success:true, data:[{id,name,category,description}]}` | `SkillMultiSelect.jsx:35` `res.data` (id/name/category만 사용) | ✅ |

- 전 훅이 `res.success` 실패 분기(`!res?.success` → `[]`) 처리하고 `res.data` 로 정확히 unwrap. `responseWrapper` 스프레드 계약(`{success:true, ...서비스반환}`) 준수.
- SELF 강제: `MyPageController` 가 `context.accountId` 로 덮어써 타인 데이터 차단. 프론트가 accountId 를 넘기지 않아도 정상(넘겨도 무해).

### 2. 처리율/남은작업 프론트 집계 (요구사항: 건수 기준)
- `useMyPageStats.js:16` 완료 판정 = `issue.fields.status.statusCategory.key === "done"`. 분모 `total = issues.length`, 분자 `done = 완료수`, `rate = done/total`, `remainingIssues = 미완료 배열`. 요구사항(건수 기준)과 일치. ✅
- 전용 집계 resolver 없이 `getMyIssueList` 단일 응답 재사용(중복 조회 없음) — 설계 §2 판단대로.

### 3. 신규 Controller 등록 / PermissionMap 등재
- `src/index.js:31,66` `registerMyPageController` import + 호출 ✅
- `PermissionMap.js:218-219` `getMySkills:'SELF'`, `setMySkills:'SELF'` ✅
- 계약 테스트 `test/permission/permissionMap.contract.test.js` **PASS** (등록집합↔맵키집합 대조, 미선언/고아 매핑 0). SELF 가드는 `permissionGuard.js:93` 에서 리소스검사 없이 통과, principal 은 컨트롤러가 `setMySkills` 에 직접 부착 — 정합.

### 4. 권한 완화 부작용 (getSkillList → PUBLIC)
- 전역 grep 결과 소비처: 프론트 invoke 4곳(backoffice skill 페이지 훅 3 + `SkillMultiSelect`) — 전부 `res.data` 배열만 소비, 완화는 접근만 넓힘 → 회귀 없음. ✅
- 백엔드 내부 소비자 `ResourceManagementService.js:57` 은 `getSkillListService()` **직접 호출**(invoke/guard 미경유) → PermissionMap 변경 영향 없음. ✅
- 쓰기(add/update/delete/addSkillBulk)는 `W('SKILL_MANAGEMENT')` 그대로 — 완화는 목록 조회 1건 한정. ✅

### 5. 라우트 / 네비
- `App.jsx:25,87` `import MyPage` + `<Route path="/my-page" element={<MyPage />} />` ✅
- `Sidebar.jsx:57-62` `mainItems` 에 `/my-page`(PersonIcon, `t('myPage.nav')`, `permission:null`=전원 노출) 추가 ✅

### 6. 성능 패턴
- 워크로그: `getMyCalendarWorklog` 전용 병렬 페처(`MyWorkService.jsx:150` `pLimit(5)`), 공통 페치 경로 미수정 — 하네스 교훈 준수. ✅
- `getMyIssueList` 단일 JQL search 1회(`IssueApi.js:253`), N+1 없음. 처리율은 동일 응답 프론트 집계라 재조회 없음. ✅

### 7. i18n
- `locales/kr/myPage.json` + `locales/en/myPage.json` 양쪽 존재, 설계 §6 키 + 실제 사용 추가키(`projects.period/role/level`)까지 kr/en 대칭 완비.
- merge 반영 확인: `ko-KR.json`/`en-US.json` 에 `myPage.*` 존재, `myPage.projects.period`, `myPage.skill.save.success` 등 검증됨. 재사용 공용키(`worklog.worklogTable.*`, `common.button.*`, `common.toast.*`, `projectDetail.filter.dropdownJql.noAssign`) 전부 실재. `t()` 참조 누락 0건. ko-KR/en-US 직접 수정 없음. ✅
- 컨테이너 컴포넌트 prop 계약 확인: `Card`(footer 렌더프롭/headerRight/title), `ViewModeToggle`({viewMode,onChange,items:{mode,label}}), `KpiTile`({icon,label,value}) — 전부 실 prop 과 일치(오타로 인한 silent-drop 없음). ✅

---

## 실행 검증 결과
- 백엔드 `npm test`: **Tests 219 passed / 219**. 실패 8 Suite 는 전부 `static/ui/src/**` ESM 파싱(jqlMaker 등) — 본 변경과 무관한 pre-existing. `permissionMap.contract.test.js` 단독 실행 **PASS**.
- 프론트 `cd static/ui && npm run build`: **성공** ("The build folder is ready to be deployed"), prebuild merge 정상. 신규파일 경고/에러 없음.

---

## 미검증 (Not Verified)
- **E2E 런타임**: Forge 터널/실기기 렌더는 미수행(정적 교차검증 + 빌드까지). shape 정합은 코드 대조로 확인했으나 실 Jira 응답값(예: `statusCategory.key` 실데이터, 팀관리형 프로젝트 필드 누락 이슈)은 실행 미확인.

## 참고 (결함 아님)
- `MyIssuesSection` 상태 컬럼은 `statusCategory`(카테고리 레벨: 할일/진행중/완료)를 `StatusComponent` 에 전달 → 세분 상태명이 아닌 카테고리명 표기. 이는 기존 `MyIssueTable.jsx:75-77` 과 **동일 패턴**이라 의도된 재사용(회귀 아님).
