# 마이페이지 (My Page) 설계서

브랜치: RFC-168 · 작업 디렉토리: `_workspace/my-page/`
요구사항: `_workspace/my-page/00_input/requirement.md`

---

## 1. 개요 / 영향 범위

사용자 개인의 프로젝트·이슈·처리율·남은작업·워크로그·스킬을 한 화면에 종합하는 **독립 신규 대시보드 페이지** (`/my-page`, 새 최상위 네비 항목).

### 백엔드
- **재사용(수정 없음)**: `getMyProjectList`, `getMyIssueList`, `getMyCalendarWorklog` (모두 `MyWorkController.jsx`, SELF)
- **신규 2종**: `getMySkills`, `setMySkills` — 신규 `src/resolver/myPage/MyPageController.jsx`, **SELF 스코프**. 로직은 기존 `resourceManagement`의 `getUserSkillsService` / `setUserSkillsService`를 **위임 재사용**(신규 Service/Repository/Query 없음).
- **처리율/남은작업 전용 집계 resolver: 불필요.** 근거는 §2 하단 판단 참조.
- PermissionMap 신규 엔트리 2개(SELF), `getSkillList` 권한 완화 1건(§8 결정 필요).

### 프론트
- **신규 페이지**: `static/ui/src/pages/myPage/` (페이지 1 + 섹션 컴포넌트 5~6 + 훅 4)
- **라우트**: `App.jsx`에 `/my-page` 추가
- **네비**: `Sidebar.jsx` `mainItems`에 항목 추가 (permission: null → 전원 노출)
- **쿼리키**: 신규 `static/ui/src/utils/queryKey/myPageKeys.js`
- **재사용 컴포넌트/훅**: `SkillMultiSelect.jsx`, `useMyProjectList.js`, `MyLogSummary` 스타일 참고, `StatusComponent`/`IssueComponent`/`UserAvatar`/`DateTag`/`Card`/`WorklogTableTree`

### DB
- **변경 없음.** 스킬 조회/저장은 기존 `SkillMappingQuery`(MySQL) 경로 그대로. 신규 테이블·KVS 엔티티·마이그레이션 없음.

### i18n
- 신규 `locales/kr/myPage.json` + `locales/en/myPage.json` (§6). merge 후 `ko-KR.json`/`en-US.json` 자동 생성.

---

## 2. 경계면 계약 (가장 중요)

> 프론트 invoke 결과는 항상 `responseWrapper` 표준: 성공 `{ success:true, ...result }`, 실패 `{ success:false, error:{ name, code, message, cause } }`.
> 모든 SELF resolver는 payload.accountId를 무시하고 `context.accountId`로 강제(타인 데이터 열람 차단). 프론트가 accountId를 넘겨도 서버가 덮어씀 — 넘겨도 무해.

| # | resolver 함수 | 구분 | 입력 파라미터 | 응답 shape (success 시, 글자 그대로) | 대응 프론트 훅 / 쿼리키 |
|---|--------------|------|-------------|-----------------------------------|----------------------|
| 1 | `getMyProjectList` | 재사용 | `{ accountId }` (서버가 context로 강제) | `{ success:true, data: [ { project_id, project_name, start_date, end_date, role:{...}\|null, level:{...}\|null, status:{ name, color }\|null, ... } ] }` | `useMyPageProjects` / `myPageKeys.projects(accountId)` |
| 2 | `getMyIssueList` | 재사용 | `{ accountId, selectedProjectIds:string[], coworkerFieldId }` | `{ success:true, data: [ Issue ] }` — `Issue = { id, key, fields:{ summary, duedate, issuetype:{ iconUrl }, assignee, status:{ statusCategory:{ id, key, colorName, name } }, worklog, project }, properties:{ movesRms:{ coworkers:string[] } } } }` | `useMyPageIssues` / `myPageKeys.issues(accountId, projectIds)` |
| 3 | `getMyCalendarWorklog` | 재사용 | `{ accountId, selectedProjectIds:string[], startDate, endDate }` | `{ success:true, data: [ Issue with fields.worklog.worklogs 가 "내가 작성한 것"으로 필터됨 ] }` (각 worklog: `{ id, author:{ accountId, displayName }, started, timeSpent, timeSpentSeconds, comment }`) | `useMyPageWorklogs` / `myPageKeys.worklogs(accountId, start, end)` |
| 4 | `getMySkills` | **신규(SELF)** | `{}` (context.accountId 사용) | `{ success:true, data:{ accountId, skillIds:string[] } }` | `useMySkills` / `myPageKeys.mySkills(accountId)` |
| 5 | `setMySkills` | **신규(SELF)** | `{ skillIds:string[] }` | `{ success:true, data:{ accountId, count:number } }` | `useMySkills`(mutation) → 저장 후 `myPageKeys.mySkills` invalidate |
| 6 | `getSkillList` | 재사용(권한 완화 필요 §8) | `{}` | `{ success:true, data: [ { id, name, category } ] }` | `SkillMultiSelect` 내부 `backofficeKeys.skills()` (그대로) |

### 처리율/남은작업 — 전용 집계 resolver 불필요 (판단 근거)
- `getMyIssueList`(#2) 응답의 각 이슈에 이미 **`fields.status.statusCategory`** 가 포함되어 있다 (`MyIssueTable.jsx:145`에서 동일 필드를 소비 중 — 검증됨).
- 따라서 **완료 판정 = `fields.status.statusCategory.key === 'done'`** 을 프론트에서 집계 가능:
  - `total = issues.length`, `done = issues.filter(i => i.fields.status?.statusCategory?.key === 'done').length`
  - `처리율 = total ? done/total : 0`, `남은작업 = issues.filter(완료 아님)`
- `getMyIssueList`는 **단일 JQL search 1회**(N+1 없음, 워크로그 20+ 추가 로드도 안 함)라 다건 이슈여도 안전. 별도 집계 resolver를 만들면 동일 데이터를 재조회하는 중복이 되므로 **프론트 집계(useMemo)** 로 결정.
- 성능 규칙 준수: 공통 워크로그 페치 경로 미수정, 워크로그는 전용 페처(`getMyCalendarWorklog`)만 사용.

### getMyIssueList 호출을 위한 projectIds 조달
- `getMyIssueList`는 `selectedProjectIds`가 필수(빈 배열이면 `{ issues:[] }`).
- My Page는 **"내 전체"** 가 목표이므로, #1(`getMyProjectList`)로 내 프로젝트 전체를 먼저 받아 `project_id[]` 전체를 #2/#3에 전달한다(myWork처럼 사용자가 일부만 선택하는 방식 아님).
- 의존: #2, #3 쿼리는 #1 결과(projectIds)와 `coworkerFieldId`(기존 `['coworkerFieldId']` 쿼리 재사용) 로딩 완료 시 `enabled`.

---

## 3. 백엔드 설계

### 3.1 신규 컨트롤러 `src/resolver/myPage/MyPageController.jsx`
```
registerMyPageController(resolver)
  guardedDefine(resolver, 'getMySkills', ({context}) =>
      getUserSkillsService({ accountId: context?.accountId }))        // 위임 재사용
  guardedDefine(resolver, 'setMySkills', ({payload, context}) =>
      setUserSkillsService(
        { accountId: context?.accountId, skillIds: payload?.skillIds },
        { accountId: context?.accountId }))                           // 2번째 인자=principal(createdId용)
```
- `getUserSkillsService` / `setUserSkillsService` 는 `../resourceManagement/ResourceManagementService`에서 import (경로 확인).
- **신규 Service/Repository/Query 작성 금지** — 기존 서비스가 accountId만 받아 self-scope로 안전 동작.
- `.jsx` 확장자(myWork 도메인 관례 따름).

### 3.2 `src/index.js` 등록
- `import { registerMyPageController } from './resolver/myPage/MyPageController';`
- 기존 등록부에 `registerMyPageController(resolver);` 추가.

### 3.3 PermissionMap (`src/permission/PermissionMap.js`)
```
// ── MyPage (MyPageController) — SELF ─────────────────────
getMySkills: 'SELF',
setMySkills: 'SELF',
```
- **결정 필요 (§8)**: `getSkillList` 을 현재 `OR([SKILL read, RESOURCE read, USER read])` → 스킬 편집 UI가 일반 멤버에게 동작하려면 완화 필요.

### 3.4 에러 케이스
- 위임 서비스가 던지는 `LogicalError(ErrorCodes.USER_ID_REQUIRED)` 그대로 사용 — 신규 에러코드 없음.
- SELF 가드: 미인증/컨텍스트 없음 시 context.accountId 없음 → 서비스에서 accountId 검증 실패 처리.

---

## 4. 프론트엔드 설계

### 4.1 파일 구조 (`static/ui/src/pages/myPage/`)
```
MyPage.jsx                         # 페이지 루트(레이아웃/섹션 조립). context = await view.getContext()
sections/
  MyPageSummary.jsx                # 상단 지표 타일: 처리율%, 전체/완료/남은 이슈수, 참여 프로젝트수
  MyProjectsSection.jsx            # 나에게 할당된 프로젝트(읽기전용 카드 그리드)
  MyIssuesSection.jsx              # 전체 할당 이슈 + 남은작업 토글/탭 (statusCategory 기준)
  MyWorklogSection.jsx             # 내가 작성한 워크로그(최근/이번달)
  MySkillSection.jsx               # 내 스킬 조회+편집 (SkillMultiSelect 재사용 + 저장)
hooks/
  useMyPageProjects.js             # invoke('getMyProjectList')  → myPageKeys.projects
  useMyPageIssues.js               # invoke('getMyIssueList')    → myPageKeys.issues
  useMyPageWorklogs.js             # invoke('getMyCalendarWorklog') → myPageKeys.worklogs
  useMySkills.js                   # get/setMySkills query+mutation → myPageKeys.mySkills
  useMyPageStats.js               # (훅 아님/유틸) issues → {total, done, rate, remaining} useMemo
```

### 4.2 데이터 흐름 (MyPage.jsx)
1. `const context = await view.getContext()` (모듈 top-level, WorklogPage 관례 동일).
2. `useMyPageProjects({context})` → `projects = data.data`, `allProjectIds = projects.map(p=>p.project_id)`.
3. `coworkerFieldId`: 기존 `useQuery(['coworkerFieldId'], () => getCustomFieldId(CustomFieldId.coworkerIdField))` 재사용.
4. `useMyPageIssues({context, projectIds: allProjectIds, coworkerFieldId})` — `enabled: allProjectIds.length>0 && !!coworkerFieldId`.
5. `useMyPageStats(issues)` → 처리율/남은작업(§2 집계식). MyPageSummary·MyIssuesSection에 주입.
6. `useMyPageWorklogs({context, projectIds: allProjectIds, startDate, endDate})` — 기본 range=이번달(WorklogPage `summaryRange`와 동일 계산). `enabled: allProjectIds.length>0`.
7. `useMySkills({context})` — 조회+저장.

> 각 섹션은 독립 로딩 스피너(`LoadingOverlay`) — 프로젝트/이슈/워크로그/스킬 병렬. #4,#6은 #2 projectIds에 의존하되 서로 병렬.

### 4.3 섹션별 재사용 매핑
- **MyProjectsSection**: `useMyProjectList` 훅을 그대로 쓰거나(권장, 데이터만) 읽기전용 카드로 렌더. `MyProjectList.jsx`는 선택/검색 UI가 myWork 전용이므로 **컴포넌트 통째 재사용 대신 훅+간단 카드**로 구성(카드 스타일·StatusTag·DateTag 재사용). 프로젝트명 클릭 시 `navigate('/project/:id')` 동일.
- **MyIssuesSection**: 헤더/컬럼은 `MyIssueTable`의 `IssueComponent`/`StatusComponent`/`UserAvatar`/`DateTag` 재사용. 단, worklog 트리는 불필요 → 평면 테이블(`CommonTable` 또는 `WorklogTableTree` children 없이). "전체 / 남은작업" 세그먼트 토글로 `statusCategory.key==='done'` 필터.
- **MyWorklogSection**: `useMyPageWorklogs` 결과(issues[].fields.worklog.worklogs)를 평탄화해 최근순 리스트. `formatWorklogTime`(MyIssueTable) 로직 참고. 편집이 필요하면 `WorklogModal` 재사용 가능하나 MVP는 읽기전용 권장.
- **MySkillSection**: `SkillMultiSelect` 재사용(값=skillIds). 하단 저장 버튼 → `useMySkills.save`. 조회는 `getMySkills`, 저장은 `setMySkills`. `UserSkillEditModal`은 `getUserSkills/setUserSkills`를 직접 invoke하므로 **모달 통째 재사용 불가** → SkillMultiSelect(진짜 재사용 단위)만 사용하고 얇은 저장 래퍼를 새로 작성.

### 4.4 쿼리키 팩토리 (`static/ui/src/utils/queryKey/myPageKeys.js`)
```js
export const myPageKeys = {
    all: ["myPage"],
    projects: (accountId) => ["myPage", "projects", accountId],
    issues:   (accountId, projectIds) => ["myPage", "issues", accountId, projectIds],
    worklogs: (accountId, startDate, endDate) => ["myPage", "worklogs", accountId, startDate, endDate],
    mySkills: (accountId) => ["myPage", "mySkills", accountId],
};
```
- **myWork의 인라인 키(`['getMyProjectList', accountId]` 등)와 분리** — projectIds 스코프(전체 vs 부분선택)가 달라 캐시 충돌 방지.

### 4.5 라우팅 / 네비
- `App.jsx`: `import MyPage from "./pages/myPage/MyPage";` + `<Route path="/my-page" element={<MyPage />} />` (`/myWork` 라우트 아래에 추가).
- `Sidebar.jsx` `mainItems`: `/myWork` 다음에
  ```
  { key:'/my-page', icon:<PersonIcon label="My Page"/>, label:t('myPage.nav'), permission:null }
  ```
  (아이콘은 사용 중이지 않은 `PersonIcon` 재사용 또는 신규 import.)

### 4.6 권한 체크
- 페이지 자체는 `permission: null` (전원 접근). `usePermissionStore` 게이팅 불필요.
- 서버가 SELF로 자기 데이터만 반환하므로 프론트 추가 가드 없음.

---

## 5. DB 설계

**변경 없음.** 스킬 조회/저장은 기존 MySQL `SkillMappingQuery`(`SELECT_SKILL_IDS_BY_ACCOUNT`, `DELETE_USER_SKILLS_BY_ACCOUNT`, `INSERT_USER_SKILLS`) 경로 재사용. 신규 테이블/KVS 엔티티/마이그레이션/manifest attribute 변경 없음.

---

## 6. i18n 키 목록

`locales/kr/myPage.json` / `locales/en/myPage.json` (신규). merge 후 `ko-KR.json`/`en-US.json` 자동 반영. 기존 공용 키(`common.button.save`, `common.toast.*`, `worklog.worklogTable.*` 등)는 재사용.

| 키 | kr | en |
|----|----|----|
| `myPage.nav` | 마이페이지 | My Page |
| `myPage.title` | 마이페이지 | My Page |
| `myPage.summary.processingRate` | 전체 처리율 | Completion Rate |
| `myPage.summary.totalIssues` | 전체 작업 | Total Issues |
| `myPage.summary.doneIssues` | 완료 작업 | Completed |
| `myPage.summary.remainingIssues` | 남은 작업 | Remaining |
| `myPage.summary.projectCount` | 참여 프로젝트 | Projects |
| `myPage.projects.title` | 나에게 할당된 프로젝트 | My Projects |
| `myPage.projects.empty` | 참여 중인 프로젝트가 없습니다 | No assigned projects |
| `myPage.issues.title` | 나에게 할당된 작업 | My Issues |
| `myPage.issues.tab.all` | 전체 | All |
| `myPage.issues.tab.remaining` | 남은 작업 | Remaining |
| `myPage.issues.empty` | 할당된 작업이 없습니다 | No assigned issues |
| `myPage.worklog.title` | 내가 작성한 워크로그 | My Worklogs |
| `myPage.worklog.empty` | 작성한 워크로그가 없습니다 | No worklogs |
| `myPage.skill.title` | 내 스킬 | My Skills |
| `myPage.skill.placeholder` | 보유 스킬을 선택하세요 | Select your skills |
| `myPage.skill.save.success` | 스킬이 저장되었습니다 | Skills saved |
| `myPage.skill.empty` | 등록된 스킬이 없습니다 | No skills registered |

---

## 7. 구현 작업 분해

### Backend
- [ ] `src/resolver/myPage/MyPageController.jsx` 생성 — `registerMyPageController`, `getMySkills`/`setMySkills` (기존 `getUserSkillsService`/`setUserSkillsService` 위임).
- [ ] `src/index.js` — import + `registerMyPageController(resolver)` 등록.
- [ ] `src/permission/PermissionMap.js` — `getMySkills:'SELF'`, `setMySkills:'SELF'` 추가.
- [ ] `src/permission/PermissionMap.js` — `getSkillList` 권한 완화(§8 결정 반영).
- [ ] (테스트) 기존 `getMyIssueList`/`getMyProjectList`/`getMyCalendarWorklog` 응답 shape 무변경 확인 — 신규 백엔드 로직 없음.

### Frontend
- [ ] `utils/queryKey/myPageKeys.js` 생성.
- [ ] `pages/myPage/hooks/` 4개 훅 작성(위 계약대로 invoke + myPageKeys).
- [ ] `pages/myPage/hooks/useMyPageStats.js` — 처리율/남은작업 useMemo 집계(`statusCategory.key==='done'`).
- [ ] `pages/myPage/sections/` 5~6 컴포넌트 작성(재사용 컴포넌트 §4.3).
- [ ] `pages/myPage/MyPage.jsx` — context 로드 + 섹션 조립.
- [ ] `App.jsx` 라우트 `/my-page` 추가.
- [ ] `Sidebar.jsx` `mainItems`에 My Page 항목 추가(permission:null).
- [ ] `locales/kr/myPage.json` + `locales/en/myPage.json` 작성 후 `cd static/ui && npm run merge`.

---

## 8. 결정 필요 사항 (리더/사용자 확인)

**스킬 마스터 목록 접근 권한.** 요구사항은 `getUserSkills`/`setUserSkills` 재사용을 지시했으나, 조사 결과 세 resolver 모두 관리 권한 게이팅이라 **일반 프로젝트 멤버는 자기 스킬조차 조회/편집 불가**(fail-close):
- `getUserSkills` = `OR([RESOURCE read, USER read])`
- `setUserSkills` = `W(RESOURCE)`
- `getSkillList` = `OR([SKILL read, RESOURCE read, USER read])`

My Page는 전원 접근(`permission:null`)이 전제이므로, 다음을 채택:
1. **(채택) `getMySkills`/`setMySkills` SELF 신규 resolver** — 조회/저장은 해결(§3.1).
2. **스킬 마스터(`getSkillList`) 접근**은 별도 결정 필요. 스킬 편집 UI(`SkillMultiSelect`)가 카탈로그를 불러오려면 일반 멤버도 `getSkillList` 호출 가능해야 함.
   - **권장**: `getSkillList` → `'PUBLIC'` 로 완화. 스킬 카탈로그는 사용자 데이터가 아닌 **비민감 참조 데이터**(스킬명/직군)이며 이미 3개 관리 권한에 개방돼 있음. 한 줄 변경으로 `SkillMultiSelect` 무수정 재사용.
   - **대안(격리 유지)**: 신규 SELF resolver `getMySkillOptions`(= getSkillList 위임) + My Page 전용 스킬 셀렉트 — 코드 중복, 비권장.

> 리더 응답이 없으면 **권장안(getSkillList→PUBLIC)** 으로 진행하고 본 설계서 가정으로 명시한다. 이 변경이 싫으면 MySkillSection을 **조회 전용**으로 축소(편집 불가)하는 폴백도 가능.

---

## 9. 재사용 자산 요약 (검증 완료)

| 자산 | 경로 | 재사용 방식 |
|------|------|-----------|
| `getMyProjectList` | `src/resolver/myWork/MyWorkService.jsx:10` | resolver 무수정 |
| `getMyIssueList` | `src/resolver/myWork/MyWorkService.jsx:204` | resolver 무수정 (status.statusCategory 포함 검증) |
| `getMyCalendarWorklog` | `src/resolver/myWork/MyWorkService.jsx:141` | resolver 무수정 (내 워크로그 전용 N+1 안전 페처) |
| `getUserSkillsService`/`setUserSkillsService` | `src/resolver/resourceManagement/ResourceManagementService.js:205,218` | SELF 컨트롤러가 위임 |
| `SkillMultiSelect` | `static/ui/src/pages/resource/SkillMultiSelect.jsx` | 컴포넌트 재사용(진짜 재사용 단위) |
| `useMyProjectList` | `static/ui/src/pages/myWork/myProject/useMyProjectList.js` | 훅 재사용(프로젝트 데이터) |
| `IssueComponent`/`StatusComponent` | `static/ui/src/components/issue/IssueComponent` | 셀 렌더 재사용 |
| `coworkerFieldId` 쿼리 | `useMyIssueTable.js:7` 패턴 | 동일 쿼리키 재사용 |
