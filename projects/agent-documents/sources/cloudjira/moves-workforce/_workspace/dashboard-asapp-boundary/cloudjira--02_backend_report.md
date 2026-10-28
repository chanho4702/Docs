# Dashboard asApp Aggregate Boundary — Backend Report

## 구현 범위

- 신규 resolver: `getDashboardAggregate`
  - Controller: `ProjectDashboardController`의 `guardedDefine` 등록
  - PermissionMap: `R('DASHBOARD', 'detail')`
  - `src/index.js` 변경 없음. 기존 `registerProjectDashboardController`가 `CONTROLLER_REGISTRARS`에 이미 등록되어 있음.
- 신규 scope boundary: `DashboardAggregateScope.js`
  - principal 누락, project id 누락/범위 밖을 fetch 이전에 fail-close
  - `scopedProjectIds`, `resolveTeamAnalyticsScope`, `canReadCost`, `resolveSalaryPolicySafe`, `canShowIndividualSalary` 단일 출처를 사용
  - `LEADING`의 빈 `leadingScopeAccountIds`는 fail-close
- 신규 fetcher: `DashboardAggregateFetcher.js`
  - `/rest/api/3/search/jql`을 **명시적 `as: 'app'`**으로 호출
  - raw detail fetcher와 cache/상한을 공유하지 않음
  - 요청 fields: `status`, `statusCategory`, `duedate`, `timetracking`, `assignee` + `movesRms` properties
  - 요청에서 `summary`, `description`, `comment`, `worklog`, `issuelinks`, `project`는 제외
  - `MAX_DASHBOARD_AGGREGATE_ISSUES = 2000`, cap 도달 시 `truncated: true`
- 신규 service: `DashboardAggregateService.js`
  - raw Jira/SQL 객체를 spread하지 않고 literal allowlist DTO만 조립
  - `REPORT read`가 없으면 `metrics` 키 자체를 생략
  - salary/cost 계산·반환 경로는 만들지 않음

## 실제 성공 응답 shape

```js
{
  success: true,
  content: {
    generatedAt: 'ISO-8601',
    project: { startDate, endDate, dDay, elapsedRatio },
    counts: { total, done, inProgress, todo, overdue, dueSoon, unassigned, noEstimate },
    statusDistribution: {
      byCount: { done, inProgress, todo },
      byEffort: { doneMd, inProgressMd, todoMd }, // status별 계획 공수(MD) 합계
    },
    truncated: false,
    // REPORT read 보유 시에만 존재
    metrics: {
      completionRate, scheduleRate, diffPercentPoint, effortVsCompletion,
      status, plannedTotalMd, actualTotalMd,
    },
  },
}
```

`issues`, `key`, `summary`, `description`, `comments`, `worklog`, `assignee`, `accountId`, `linkId`, Jira project/space 식별자, `salary`/`cost`는 이 DTO에 포함되지 않는다.

## 유지 확인

- `getDashboardIssueInsight`와 `getProjectRelationGraph`는 변경하지 않았으며 기존 asUser raw-detail 경로를 유지한다.
- frontend, i18n, manifest, README, locale 파일은 수정하지 않았다.

## 집중 검증

실행:

```powershell
npm test -- --runInBand src/resolver/projectDashboard/__test__/DashboardAggregateScope.test.js src/resolver/projectDashboard/__test__/DashboardAggregateFetcher.test.js src/resolver/projectDashboard/__test__/DashboardAggregateService.test.js test/permission/permissionMap.contract.test.js
```

결과: **4 suites / 32 tests passed**.

- scope fail-close 및 LEADING 빈 범위 차단
- TeamAnalyticsScope 값 판정은 해당 모듈의 `TEAM_ANALYTICS_SCOPES` 단일 출처를 사용(문자열 재정의 없음)
- explicit asApp/요청 field allowlist/cap truncated
- raw Jira sentinel, raw 식별자, 급여 sentinel 미노출
- REPORT metrics key 게이팅
- status MD 토글용 `statusDistribution.byEffort` 안전 숫자 집계

## 후속 전체 테스트 보정

- `PortfolioSpacesPersistence.test.js`의 v019가 마지막 migration이라는 stale 기대를 제거했다.
  v019가 v020~v023을 포함한 후속 migration보다 앞서는 순서만 검증하므로, `v023_cleanup_orphan_project_team_rows` 추가를 정상적으로 허용한다.
- 재실행: `teamAnalyticsScope.contract`, `PortfolioSpacesPersistence`, aggregate 3 suites,
  `permissionMap.contract` — **6 suites / 83 tests passed**.
- Controller 등록 ↔ PermissionMap 계약
