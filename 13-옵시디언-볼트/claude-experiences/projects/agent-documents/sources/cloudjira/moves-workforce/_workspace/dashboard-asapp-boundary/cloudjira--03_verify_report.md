# Dashboard asApp Aggregate Boundary — 통합 검증

검증일: 2026-09-01

## 실패

- 없음. 초기 F1(위젯 source 계약 fixture 누락)은 `dashboardWidgets.test.js`에서 `dashboardAggregate` source 및 두 widget 기대값을 반영해 해소했다.

## 통과

### resolver·권한 등록 ↔ frontend invoke 경계

- `src/resolver/projectDashboard/ProjectDashboardController.js:83-85`가 `guardedDefine`로 principal을 service에 전달한다.
- `src/permission/PermissionMap.js:204`가 `getDashboardAggregate: R('DASHBOARD', 'detail')`를 선언한다.
- `static/ui/src/hooks/useDashboardAggregate.js:9-13`는 `invoke('getDashboardAggregate', { project_id })` 결과에서 실패를 throw하고 성공 시 `result.content`만 반환한다.
- `projectKeys.dashboardAggregate(projectId)`가 별도 query key로 제공된다.

### asApp 예외 ↔ RMS scope·DTO 경계

- `DashboardAggregateScope.js:13-61`는 principal·projectId·project scope를 Jira fetch 전 검증하고, LEADING의 빈 account scope를 fail-close한다. TeamAnalyticsScope·CostAccess·SalaryVisibility의 공용 helper도 함께 거친다.
- `DashboardAggregateFetcher.js:10-57`만 새 dashboard 경로에서 명시적으로 `as: 'app'`을 사용한다. JQL은 서버 생성 projectId만 사용하며 요청 fields에 `summary`, `description`, `comment`, `worklog`, `issuelinks`, `project`가 없다.
- `DashboardAggregateService.js:83-132`는 scope 확인 뒤 raw issue를 숫자 accumulator로만 줄이고 literal DTO를 조립한다. `key`, `summary`, `description`, `worklog`, assignee/accountId, cost/salary와 raw SQL summary는 반환하지 않는다. `byEffort`도 `doneMd`·`inProgressMd`·`todoMd` 숫자 집계만 포함한다.
- REPORT read가 없으면 `metrics` key 자체를 생략하며, frontend도 `hasInsightMetrics()`로 key 존재 여부를 판별하여 0으로 대체하지 않는다.

### raw detail 경로 보존

- `DashboardInsightService.js:168`는 `getDashboardIssues({ projectId, viewerId })`를 호출하고, `DashboardIssueFetcher.js:127`의 default가 `as = 'user'`다.
- `RelationGraphService.js:292`는 `getTopologyIssues({ projectId, viewerId })`를 호출하고, `TopologyIssueFetcher.js:118`의 default도 `as = 'user'`다.
- `ChartTemplate.js:160-180`은 aggregate·insight·relationGraph hook을 source별로 분리한다. `riskIssues`/`issueSize`는 `issueInsight`, graph는 `relationGraph` source가 유지된다.
- SummaryPanel, progressStatus, plannedVsActual만 aggregate content를 소비한다.

### 실행한 검증

- Backend focused: `npm test -- --runInBand src/resolver/projectDashboard/__test__/DashboardAggregateScope.test.js src/resolver/projectDashboard/__test__/DashboardAggregateFetcher.test.js src/resolver/projectDashboard/__test__/DashboardAggregateService.test.js test/permission/permissionMap.contract.test.js`
  - 통과: 4 suites / 32 tests.
- Frontend focused: `npm test -- --runInBand src/utils/queryKey/queryKeyFactories.test.js src/utils/__test__/dashboardInsightAdapters.test.js src/utils/queryKey/queryKeyContract.test.js src/constants/__test__/dashboardWidgets.test.js`
  - 통과: 4 suites / 79 tests.
- `git diff --check -- src/resolver/projectDashboard static/ui/src`
  - 통과: whitespace error 없음.
- `CI=true npm run build`
  - 통과: build 및 bundle check 완료(기존 Browserslist 갱신 권고 warning만 발생).

## 미검증

- 실제 Jira development 환경에서 Jira Browse 권한이 없는 RMS Dashboard 사용자에 대한 aggregate 성공/raw detail 비노출 회귀는 미실행이다.
