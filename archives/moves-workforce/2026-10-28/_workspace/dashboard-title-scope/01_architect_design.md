# Dashboard title ownership hardening 설계서

## 1. 개요 / 영향 범위

`updateChartTitle`은 현재 `{ dashboard_id, title }`만 받아 `project_dashboard.dashboard_id` 단독 조건으로 제목을 수정한다. `PermissionMap`의 `DASHBOARD/inherited` 프로젝트 범위 게이트는 payload에 `projectId` 또는 `project_id`가 없으면 대상 프로젝트를 추출하지 못하므로, MEMBER_ONLY 호출자가 다른 프로젝트의 `dashboard_id`를 전달해도 차단되지 않는다.

수정은 기존 `updateChartFilter`의 범위 방어 방식을 그대로 따른다. 즉, 요청 payload에 `project_id`를 필수화하고, Service의 소유권 조회와 Repository의 복합 SQL 조건을 모두 적용한다. 이 기능은 차트 제목 수정에만 한정한다.

- 백엔드 수정
  - `src/resolver/projectDashboard/ProjectDashboardController.js`
  - `src/resolver/projectDashboard/ProjectDashboardService.js`
  - `src/resolver/projectDashboard/ProjectDashboardRepository.js`
  - `src/rdb/query/ProjectDashboard.js`
  - `src/resolver/projectDashboard/__test__/ChartTitleScope.test.js` 신규
- 프론트 수정
  - `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx`
- DB
  - 스키마/마이그레이션 없음. 기존 `project_dashboard(project_id, dashboard_id)` 데이터를 사용한다.
- i18n
  - UI 문자열·오류 메시지를 새로 노출하지 않는다. 추가 키 없음.

명시적 제외 범위:

- `removeChart`의 삭제 실패 처리(P1), `updateChartLayout`, `updateChartFilter`의 기존 동작 변경
- P0-1, P0-2, P0-4 및 프로젝트 삭제 흐름

## 2. 경계면 계약 (가장 중요)

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 실패 응답 shape | 대응 프론트 / 쿼리키 |
|---|---|---|---|---|
| `updateChartTitle` | `{ project_id: string, dashboard_id: string, title: unknown }` | `{ success: true }` | `{ success: false, error: { name, code, message, cause } }` | `DashboardPage.handleTitleChange`; 성공·실패 모두 `projectKeys.dashboardInfo(project_id)` 무효화 |

입력 규칙:

- `project_id`는 필수다. 누락·빈 값은 `LogicalError(500, 'Internal Server Error', 'PROJECT_ID_REQUIRED')`로 fail-close 한다.
- `dashboard_id`는 필수다. 누락·빈 값은 `LogicalError(500, 'Internal Server Error', 'DASHBOARD_ID_REQUIRED')`로 fail-close 한다.
- `title`의 값 검증/정규화는 기존 계약에 없으므로 이 RFC에서는 변경하지 않는다. 제목 값은 현재와 동일하게 Repository에 전달한다.
- `dashboard_id`가 없거나 해당 `project_id` 소속이 아니면 `LogicalError(500, 'Internal Server Error', 'DASHBOARD_CHART_NOT_FOUND')`를 던진다. 존재 여부와 타 프로젝트 소속을 구분해 노출하지 않는다.

성공 시 Service가 `undefined`를 반환하고 `responseWrapper`가 `{ success: true }`로 감싼다. 프론트는 기존처럼 dashboard-info 쿼리를 무효화해 화면의 실제 저장 값을 다시 읽는다. 새 query key나 Zustand 상태는 만들지 않는다.

## 3. 백엔드 설계

### 3.1 Controller / permission gate

`ProjectDashboardController.js`의 등록은 resolver 이름과 PermissionMap 항목을 유지한다.

```js
guardedDefine(resolver, 'updateChartTitle', ({ payload }) => updateChartTitleService(payload));
```

권한 메타데이터 `PermissionMap.updateChartTitle: W('DASHBOARD', 'inherited')`도 유지한다. UI가 `project_id`를 보내면 `permissionGuard.enforceProjectScope`가 MEMBER_ONLY principal의 `memberProjectIds`와 먼저 대조한다. 이 게이트는 호출 권한만 판단하며, 아래 Service/SQL의 실제 차트 소유권 검증을 대체하지 않는다.

### 3.2 Service

`ProjectDashboardService.js`의 `updateChartTitleService`를 다음 책임으로 변경한다.

1. 기본 인자 `{}`를 받아 destructuring 오류를 방지한다.
2. `project_id`, `dashboard_id`의 필수성을 위 계약의 ErrorCodes로 확인한다.
3. 기존 `existsChartInProjectRepository(project_id, dashboard_id)`를 재사용해 차트가 요청 프로젝트에 실제 소속인지 조회한다.
4. 결과가 false면 `DASHBOARD_CHART_NOT_FOUND`를 throw 하고 UPDATE를 호출하지 않는다.
5. true일 때만 `updateChartTitleRepository(project_id, dashboard_id, title)`를 호출하고 `return;` 한다.

`existsChartInProjectRepository` 및 `ProjectDashboard.FIND_BY_DASHBOARD_ID`는 `updateChartFilter`가 현재 사용하는 소유권 확인의 단일 구현이므로 복제하거나 별도 조회 쿼리를 만들지 않는다.

### 3.3 Repository / SQL

`ProjectDashboardRepository.js`:

- `updateChartTitleRepository` 시그니처를 `(project_id, dashboard_id, title)`로 변경한다.
- `executeQuery(ProjectDashboard.UPDATE_TITLE, [title, dashboard_id, project_id])`로 바인딩한다.
- catch로 오류를 삼키지 않는다. DB 오류는 `responseWrapper`까지 전파되어 `{ success: false }`가 된다.

`src/rdb/query/ProjectDashboard.js`의 `UPDATE_TITLE`은 다음과 같이 프로젝트 조건을 포함한다.

```sql
UPDATE project_dashboard
SET dashboard_title = ?
WHERE dashboard_id = ?
  AND project_id = UUID_TO_BIN(?)
```

소유권 `SELECT`와 복합 `UPDATE`를 모두 유지한다. 선행 SELECT는 타 프로젝트 ID·존재하지 않는 ID에서 명시적 실패를 보장하고, UPDATE의 `project_id` 조건은 ALL 범위 principal 또는 향후 호출 경로 변경 시에도 다른 프로젝트 행을 수정하지 못하게 하는 최종 방어선이다.

### 3.4 Resolver 등록

- `src/index.js`: 기존 `CONTROLLER_REGISTRARS`의 `registerProjectDashboardController` 등록을 변경하지 않는다.
- `src/permission/PermissionMap.js`: 기존 `updateChartTitle` 매핑을 변경하지 않는다.

## 4. 프론트엔드 설계

`static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx`의 `handleTitleChange`에서 invoke payload를 아래와 같이 변경한다.

```js
invoke('updateChartTitle', { project_id, dashboard_id: id, title: newTitle })
```

- `project_id`는 이 페이지의 props로 이미 보유하고 있으며 `getChartInfo`, `updateChartLayout`, `removeChart`, `updateChartFilter`와 같은 프로젝트 ID를 사용한다.
- 제목 저장 성공 처리와 `projectKeys.dashboardInfo(project_id)` 무효화의 기존 구조를 유지한다.
- 오류 UX나 번역 키를 이번 범위에서 추가하지 않는다. 실패 응답 시 성공 toast를 표시하지 않으며, 현재의 데이터 refetch 동작은 유지한다.
- 신규 hook, Zustand store, query-key factory 변경은 없다.

## 5. DB 설계

- 테이블: 기존 MySQL `project_dashboard`.
- 컬럼/인덱스/마이그레이션 변경 없음.
- `dashboard_id`가 전역적으로 우연히 유일하다고 가정하지 않는다. 수정 SQL은 반드시 `(dashboard_id, project_id)` 조합으로 대상 행을 제한한다.
- 기존 `FIND_BY_DASHBOARD_ID`도 같은 조합을 사용하므로 프로젝트 A의 widget ID를 프로젝트 B payload로 요청하면 빈 결과가 된다.

## 6. i18n 키 목록

추가·변경 없음.

기존 성공 toast `dashboard.toast.editChartName` 및 공통 문자열을 유지한다. 서버 오류 cause는 UI에 새로 직접 노출하지 않는다.

## 7. 구현 작업 분해

### Backend

- [ ] `updateChartTitleService({ project_id, dashboard_id, title } = {})`에 `PROJECT_ID_REQUIRED`, `DASHBOARD_ID_REQUIRED` fail-close 검증을 추가한다.
- [ ] Service에서 기존 `existsChartInProjectRepository(project_id, dashboard_id)`를 호출하고, false면 `DASHBOARD_CHART_NOT_FOUND`를 throw 한다.
- [ ] `updateChartTitleRepository`의 인자와 `executeQuery` 바인딩 순서를 `(project_id, dashboard_id, title)` / `[title, dashboard_id, project_id]`로 변경한다.
- [ ] `ProjectDashboard.UPDATE_TITLE`에 `AND project_id = UUID_TO_BIN(?)`를 추가한다.
- [ ] Controller 등록명 및 PermissionMap 등록을 유지하는지 확인한다.

### Tests

- [ ] `src/resolver/projectDashboard/__test__/ChartTitleScope.test.js`를 추가한다. `@forge/sql`과 `CommonQuery.executeQuery`는 기존 `ChartFilterPersistence.test.js` 방식으로 mock 한다.
- [ ] 정상 입력 `{ project_id: 'p-a', dashboard_id: 'w-1', title: '새 제목' }`에서 순서대로 `FIND_BY_DASHBOARD_ID`가 `['w-1', 'p-a']`, `UPDATE_TITLE`가 `['새 제목', 'w-1', 'p-a']`로 호출되는지 검증한다.
- [ ] `project_id` 누락 및 빈 값에서 `PROJECT_ID_REQUIRED`이고 DB 조회/수정이 전혀 호출되지 않는지 검증한다.
- [ ] `dashboard_id` 누락 및 빈 값에서 `DASHBOARD_ID_REQUIRED`이고 DB 호출이 없는지 검증한다.
- [ ] 프로젝트 B의 payload로 프로젝트 A 차트를 가정한 빈 `FIND_BY_DASHBOARD_ID` 결과를 주고 `DASHBOARD_CHART_NOT_FOUND`, UPDATE 미호출을 검증한다.
- [ ] `ProjectDashboard.UPDATE_TITLE` 문자열에 `project_id = UUID_TO_BIN(?)`가 존재하는지 검증한다.
- [ ] Repository 단위에서 바인딩 순서가 title/dashboard_id/project_id 순인지 검증하거나 위 Service mock 호출로 동일 계약을 검증한다.

### Frontend

- [ ] `DashboardPage.handleTitleChange`의 `updateChartTitle` payload에 현재 `project_id` prop을 추가한다.
- [ ] 저장 후 `projectKeys.dashboardInfo(project_id)` 무효화가 계속 실행되는지 기존 화면 동작으로 확인한다.

### 검증 명령

```powershell
npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js
Set-Location static/ui
npm test -- --runInBand
$env:CI = 'true'; npm run build
Set-Location ../..
forge lint
```
