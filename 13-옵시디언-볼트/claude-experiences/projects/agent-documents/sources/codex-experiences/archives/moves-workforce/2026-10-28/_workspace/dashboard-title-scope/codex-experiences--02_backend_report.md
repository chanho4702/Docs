# P0-3 Backend Report — Dashboard Title Ownership

## 변경 파일

- `src/resolver/projectDashboard/ProjectDashboardService.js`
- `src/resolver/projectDashboard/ProjectDashboardRepository.js`
- `src/rdb/query/ProjectDashboard.js`
- `src/resolver/projectDashboard/__test__/ChartTitleScope.test.js`

## 구현

`updateChartTitleService({ project_id, dashboard_id, title } = {})`는 다음 순서로 실행된다.

1. `project_id`가 없으면 `LogicalError(500, 'Internal Server Error', 'PROJECT_ID_REQUIRED')`
2. `dashboard_id`가 없으면 `LogicalError(500, 'Internal Server Error', 'DASHBOARD_ID_REQUIRED')`
3. `existsChartInProjectRepository(project_id, dashboard_id)`로 실제 소속을 조회한다.
4. 조회 결과가 없으면 `DASHBOARD_CHART_NOT_FOUND`로 거부하고 UPDATE하지 않는다.
5. `UPDATE_TITLE`에 `[title, dashboard_id, project_id]`를 바인딩한다.
6. UPDATE의 `rowsAffected !== 1`도 `DASHBOARD_CHART_NOT_FOUND`로 처리한다. 조회와 UPDATE 사이의 삭제/소속 변경 경합에서 성공으로 응답하지 않기 위함이다.

SQL은 `dashboard_id`와 `project_id = UUID_TO_BIN(?)`를 함께 조건으로 사용한다.

## Resolver/응답 계약

- 기존 `ProjectDashboardController`의 `guardedDefine(resolver, 'updateChartTitle', ({ payload }) => updateChartTitleService(payload))` 등록과 `PermissionMap.updateChartTitle: W('DASHBOARD', 'inherited')`를 그대로 사용한다.
- payload에 `project_id`가 포함되면 inherited project scope gate가 동작한다.
- service 성공 반환값은 `undefined`이며 `responseWrapper` 실제 성공 응답은 `{ success: true }`이다.
- 실패 응답은 `{ success: false, error: { name, code, message, cause } }`이다.

## 테스트

성공:

```powershell
npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js
```

- 1 suite / 8 tests 통과
- 정상 수정, 필수 식별자 fail-close, 타 프로젝트 차단, UPDATE 0건 경합, SQL 복합 조건을 검증했다.

참고: 설계서의 기존 병행 검증 대상인 `ChartFilterPersistence.test.js`를 함께 실행하면, 이번 파일과 무관하게 P0-1 변경으로 추가된 `ProjectChildScope → PrincipalResolver → SeedData → onInstall → migrate` import chain의 `migrationRunner.enqueue` mock 누락으로 suite load 단계에서 실패한다. `ChartTitleScope.test.js` 단독은 통과했으며, 해당 기존 테스트 mock 정비는 P0-3 범위 밖으로 남긴다.
