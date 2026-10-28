# 마이페이지 (My Page) — 프론트엔드 구현 리포트

브랜치: RFC-168 · 입력: `01_architect_design.md` + `02_backend_report.md` · 구현자: frontend-engineer

> 설계서 §4 파일 구조 + backend report의 **실제 응답 shape**(`res.data`)에 invoke 소비 경로를 맞춰 구현했다. 독립 신규 페이지 `pages/myPage/`, 라우트 `/my-page`, 네비 항목 추가.

---

## 1. 소비하는 응답 shape (backend report 실제값과 일치)

모든 resolver는 `responseWrapper` 표준 → 최상위 `{ success, data, error }`. **`res.data` 로 접근, `res.success` 로 분기.**

| resolver | 호출 훅 | 소비 경로 |
|----------|--------|----------|
| `getMyProjectList` | `useMyPageProjects` | `res.data[]` → `{ project_id, project_name, start_date, end_date, role?.name, level?.name, status?.{name,color} }` |
| `getMyIssueList` | `useMyPageIssues` | `res.data[]` (Issue[]) → `fields.status.statusCategory.key`, `fields.summary`, `fields.issuetype.iconUrl`, `fields.assignee`, `fields.duedate` |
| `getMyCalendarWorklog` | `useMyPageWorklogs` | `res.data[]` (Issue[]) → `fields.worklog.worklogs[]` (서버가 내 것+이번달 필터) → `{ started, timeSpent }` |
| `getMySkills` | `useMySkills` | `res.data.skillIds` (string[]) |
| `setMySkills` | `useMySkills` (mutation) | 성공 후 `myPageKeys.mySkills(accountId)` invalidate. `res.data.count` 미소비(성공 판정만) |
| `getSkillList` | `SkillMultiSelect`(재사용, 무수정) | `res.data[]` `{id,name,category}` — 백엔드 PUBLIC 완화로 일반 멤버 접근 가능 |

### 처리율/남은작업 — 프론트 집계 (신규 resolver 없음)
`useMyPageStats(issues)` (useMemo):
- 완료 판정 = `issue.fields.status.statusCategory.key === 'done'`
- `total = issues.length`, `done = 완료수`, `rate = done/total`, `remainingIssues = 미완료 배열`
- 설계서 §2 / backend report §7 판단대로 `getMyIssueList` 단일 응답을 재사용(중복 조회 없음).

### projectIds 조달
`useMyPageProjects` 결과 `project_id` 전체(dedupe+sort)를 `allProjectIds` 로 만들어 `useMyPageIssues`/`useMyPageWorklogs` 에 전달. 이슈/워크로그 쿼리는 `enabled: allProjectIds.length>0`(이슈는 `coworkerFieldId` 로드 완료 추가 조건). "내 전체" 스코프.

---

## 2. 신규 파일 목록

### 쿼리키
- `static/ui/src/utils/queryKey/myPageKeys.js` — `all/projects/issues/worklogs/mySkills` 팩토리. myWork 인라인 키와 분리(projectIds 스코프 충돌 방지).

### 훅 (`pages/myPage/hooks/`)
- `useMyPageProjects.js` — `invoke('getMyProjectList')` → `myPageKeys.projects`
- `useMyPageIssues.js` — `invoke('getMyIssueList')` → `myPageKeys.issues`, `coworkerFieldId` 쿼리(`['coworkerFieldId']`) 재사용
- `useMyPageWorklogs.js` — `invoke('getMyCalendarWorklog')` → `myPageKeys.worklogs`
- `useMySkills.js` — `invoke('getMySkills')` 조회 + `invoke('setMySkills',{skillIds})` mutation(**SELF, accountId 미전달**), 성공 시 invalidate
- `useMyPageStats.js` — 처리율/남은작업 useMemo 집계

### 섹션 (`pages/myPage/sections/`)
- `MyPageSummary.jsx` — KpiTile 재사용, 처리율%/전체/완료/남은/프로젝트수
- `MyProjectsSection.jsx` — 읽기전용 카드 그리드(StatusTag/DateTag 재사용, 프로젝트명 클릭 → `/project/:id`)
- `MyIssuesSection.jsx` — 평면 테이블(WorklogTableTree, IssueComponent/StatusComponent/UserAvatar/DateTag), 전체/남은작업 세그먼트 토글(ViewModeToggle)
- `MyWorklogSection.jsx` — worklogs 평탄화 최근순 리스트(평면 테이블)
- `MySkillSection.jsx` — `SkillMultiSelect` 재사용(진짜 재사용 단위) + `useMySkills` 저장 래퍼(Card footer 저장 버튼, ToastFlags)

### 페이지
- `MyPage.jsx` — `const context = await view.getContext()`(모듈 top-level, WorklogPage 관례), 섹션 조립, 워크로그 범위=이번달

### i18n
- `locales/kr/myPage.json` + `locales/en/myPage.json` — 신규 네임스페이스(nav/title/summary/projects/issues/worklog/skill). 공용 키(`common.button.*`, `common.toast.*`, `worklog.worklogTable.*`) 재사용.

## 3. 수정 파일

| 파일 | 변경 |
|------|------|
| `static/ui/src/App.jsx` | `import MyPage` + `<Route path="/my-page" element={<MyPage />} />` (`/myWork` 아래) |
| `static/ui/src/layout/Sidebar.jsx` | `mainItems` 에 My Page 항목 추가 — `key:'/my-page'`, `PersonIcon`(기존 import), `label:t('myPage.nav')`, **`permission:null`(전원 노출)**, `/myWork` 다음 위치 |

---

## 4. i18n merge

- `cd static/ui && npm run merge` **실행 완료** → `locales/ko-KR.json`(라인 628 `"myPage"`)·`en-US.json` 에 반영 확인. ko-KR/en-US 직접 수정 없음.
- UI 는 `useI18nStore.t()` 로만 사용.

## 5. 빌드 결과

- `cd static/ui && npm run build` → **성공** ("The build folder is ready to be deployed"). prebuild merge 정상 실행.
- 컴파일 경고는 node_modules 의 소스맵 파싱 경고(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐 — **본 변경과 무관한 pre-existing 경고**. 신규 파일 관련 경고/에러 없음.
- 참고: 이 워크트리에는 `static/ui/node_modules` 가 없어 main 리포(`C:\CloudJira\moves-workforce\static\ui\node_modules`)로 **디렉토리 junction** 을 생성해 빌드함(패키지 버전 동일). 소스맵 경로가 main 을 가리키는 것은 이 때문.

---

## 6. 계약/정합성 메모 (integration-verifier 참고)

- 모든 invoke 소비 경로가 backend report 실제 shape(`res.data`)과 **일치**. shape 불일치·모호 없음.
- `getMySkills`/`setMySkills` 는 **accountId 미전달**(SELF, 서버 context 강제) — 타인 데이터 열람 불가.
- `setMySkills` `res.data.count` 는 소비하지 않음(성공 판정만) — 계약 위배 아님(추가 필드 무시).
- `getSkillList` 응답의 `description` 필드도 backend 실제엔 존재하나 `SkillMultiSelect` 는 id/name/category만 사용 — 무해.
