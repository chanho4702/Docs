# Dashboard asApp Aggregate Boundary 설계서

## 1. 개요 / 영향 범위

Jira Issue Browse 권한이 없는 사용자라도 RMS에서 허용한 프로젝트의 총 현황·상태 분포·가동률 판단은 볼 수 있어야 한다. 이를 위해 Jira 원문을 읽는 권한과 RMS 분석 권한을 분리한다.

- 백엔드 신규: `DashboardAggregateService.js`, `DashboardAggregateFetcher.js`, `DashboardAggregateScope.js`.
- 백엔드 수정: `ProjectDashboardController.js`, `PermissionMap.js`, `ProjectDashboardController`/`PermissionMap` 계약 tests.
- 프론트 수정: aggregate 전용 hook와 query key를 추가하고, 원문을 필요로 하지 않는 Dashboard summary/status/metric 위젯만 새 hook으로 전환한다.
- 유지: 기존 `getDashboardIssueInsight`와 `getProjectRelationGraph`는 raw-detail API이므로 `asUser()`를 유지한다.
- DB/KVS/manifest/i18n: 변경 없음. 기존 화면 문구를 재사용하므로 신규 i18n 키도 없다.

## 2. 경계면 계약 (가장 중요)

### 2.1 기존 raw-detail 계약 — 변경 없음

| resolver | 입력 | Jira 권한 | 반환 성격 | 유지 이유 |
|---|---|---|---|---|
| `getDashboardIssueInsight` | `{ project_id }` | `DashboardIssueFetcher`의 `as:'user'` | `issues[]`에 key/summary/assignee/상태 등 원문 식별 정보 포함 | 이슈 큐·상세 링크·우선순위 표시가 필요함 |
| `getProjectRelationGraph` | `{ projectId }` | `TopologyIssueFetcher`의 `as:'user'` | `nodes[]`, `edges[]`, issue/space key, link 관계 포함 | 그래프 시각화가 원문 식별자에 의존함 |

두 resolver의 Controller principal 전달은 계속 유지하지만, **asApp으로 바꾸지 않는다.** Jira Browse가 없으면 Jira가 401/403을 반환하고 기존 fetcher의 empty/fallback contract가 적용된다. app 권한 결과를 이 raw DTO에 섞는 것은 금지한다.

### 2.2 신규 aggregate 계약

| resolver | 입력 | 성공 응답 `content` | 대응 프론트 |
|---|---|---|---|
| `getDashboardAggregate` | `{ project_id }` | `{ generatedAt, project: { startDate, endDate, dDay, elapsedRatio }, counts: { total, done, inProgress, todo, overdue, dueSoon, unassigned, noEstimate }, statusDistribution: { byCount: { done, inProgress, todo } }, metrics?: { completionRate, scheduleRate, diffPercentPoint, effortVsCompletion, status, plannedTotalMd, actualTotalMd }, truncated }` | `useDashboardAggregate(projectId)` / `projectKeys.dashboardAggregate(projectId)` |

- 외부 resolver wrapper 후 형식은 기존 표준 `{ success: true, content }`이다.
- `metrics`는 `REPORT read`가 있을 때만 존재한다. `null`/`0`으로 위장하지 않는다.
- 금액·급여 관련 키는 이 DTO에 정의하지 않는다. 따라서 `CostAccess`/`SalaryVisibility`은 aggregate boundary helper의 미래 확장을 fail-close하는 정책으로 적용하되, 이번 응답에는 포함할 데이터가 없다.
- 금지 키: `issues`, `nodes`, `edges`, `key`, `summary`, `description`, `comments`, `worklog`, `assignee`, `accountId`, `accountIds`, `linkId`, `source`, `target`, Jira space/project key/name.

## 3. 백엔드 설계

### 3.1 Controller·등록·권한 매핑

수정 파일: `src/resolver/projectDashboard/ProjectDashboardController.js`

```js
guardedDefine(resolver, 'getDashboardAggregate', ({ payload, principal }) =>
    getDashboardAggregateService({ ...payload, principal }));
```

수정 파일: `src/permission/PermissionMap.js`

```js
getDashboardAggregate: R('DASHBOARD', 'detail'),
```

`ProjectDashboardController`는 이미 `src/index.js`의 `CONTROLLER_REGISTRARS`를 통해 등록된다. 새 registrar를 만들거나 `src/index.js`에 새 항목을 더하지 않는다. `permissionMap.contract.test.js`가 controller 등록 함수와 PermissionMap key의 일치를 검사하므로 같은 변경 단위에서 수정한다.

`guardedDefine`의 `detail` scope가 payload의 `project_id`를 검사한다. 서비스도 동일 조건을 독립적으로 재확인한다. 가드는 호출 권한만 보장하므로 service가 생략해서는 안 된다.

### 3.2 공용 scope boundary

신규 파일: `src/resolver/projectDashboard/DashboardAggregateScope.js`

```js
assertDashboardAggregateScope({ projectId, principal })
  -> { projectId, teamAnalyticsScope, visibleAccountIds }
```

처리 순서는 다음으로 고정한다.

1. `principal`과 `projectId`가 없으면 `PermissionError(ErrorCodes.PERMISSION_PRINCIPAL_UNRESOLVED)` 또는 기존 `ProjectScopeError(ErrorCodes.PERMISSION_PROJECT_SCOPE_DENIED)`를 throw한다. principal 누락을 empty aggregate로 바꾸지 않는다.
2. `scopedProjectIds(principal)`을 호출한다. 반환이 `null`이면 `ALL`이며 통과한다. 배열이면 `projectId` 포함을 요구한다. `MEMBER_ONLY`/`TEAM_ONLY`의 빈 배열은 fail-close다.
3. `resolveTeamAnalyticsScope(principal)`을 호출한다.
   - `ALL`: account filter 없음.
   - `LEADING`: `principal.leadingScopeAccountIds`가 비어 있거나 없으면 fail-close. 해당 account set만 `visibleAccountIds`로 반환한다.
   - `NONE`: Dashboard 권한이 있다고 해도 팀/인력 aggregate가 필요한 request는 fail-close한다. 이번 project-wide status aggregate는 account별 원문을 반환하지 않으므로 `visibleAccountIds = null`로 허용할 수 있으나, 사용자·인력/가동률 축을 추가하는 순간 `NONE`을 허용하지 않는다.
4. `canReadCost(principal)`과 salary policy를 함께 계산해 `{ canReadCost, canShowIndividualSalary }`를 반환한다. 이번 DTO는 financial field가 없어서 사용하지 않지만, 이후 데이터 타입이 늘어날 때 service가 이 gate를 빼먹지 않도록 boundary return 값에 포함한다.

`ProjectScope`와 `TeamAnalyticsScope`의 규칙을 이 파일에 복사하지 않는다. 반드시 `scopedProjectIds`, `resolveTeamAnalyticsScope`, `canReadCost`, `resolveSalaryPolicySafe`, `canShowIndividualSalary`를 import한다.

### 3.3 asApp aggregate fetcher

신규 파일: `src/resolver/projectDashboard/DashboardAggregateFetcher.js`

- `postJiraJson({ as: 'app', url: route\`/rest/api/3/search/jql\`, body, ... })`를 호출한다. generic helper의 default에 의존하지 않는다.
- JQL은 `moves_RMS_projectId = "${projectId}"` 하나이며, 사용자가 넘긴 JQL/filter/key를 받지 않는다.
- 요청 fields는 aggregate 계산에 필요한 `status`, `statusCategory`, `duedate`, `timetracking`, `assignee`, `properties:movesRms`로 제한한다. `summary`, `description`, `comment`, `worklog`, `issuelinks`, `project`는 요청하지 않는다.
- `MAX_DASHBOARD_AGGREGATE_ISSUES`(기존 insight cap과 별도 named constant)를 둔다. cap 도달 시 조용히 절단하지 않고 `truncated: true`를 반환한다.
- `LEADING` scope로 person-affecting metric을 계산할 때에는 `visibleAccountIds`로 assignee/coworker를 서버에서 필터한다. Jira JQL에 accountId 목록을 넣어 범위를 확장하지 않는다.
- cache가 필요하면 key는 `app-aggregate:${projectId}:${scopeFingerprint}`이다. `DashboardIssueFetcher`의 `viewerId::projectId` cache나 `TopologyIssueFetcher` cache를 공유하지 않는다. 첫 구현에서는 cache 없이 correctness를 우선해도 된다.

### 3.4 Service와 allowlist mapper

신규 파일: `src/resolver/projectDashboard/DashboardAggregateService.js`

```js
getDashboardAggregateService({ project_id, principal })
  1. assertDashboardAggregateScope({ projectId: project_id, principal })
  2. Promise.all(settings, project summary dates, fetchDashboardAggregateIssues({ projectId, as: 'app' }))
  3. raw Jira issue를 즉시 normalize → count/metric accumulator로 축약
  4. return makeDashboardAggregateDto(accumulator)
```

- `ProjectDashboardService.getSummaryDataService`은 `total_salary`를 읽을 수 있으므로 결과에서 `start_date`/`end_date`만 pick한다. SQL row/object spread를 반환하지 않는다.
- `REPORT read`가 없으면 `metrics`를 계산하지 않는다. 이 규칙은 현재 `DashboardInsightService`와 같다.
- `canReadCost === false` 또는 `canShowIndividualSalary === false` 상태에서는 salary/cost 관련 repository·계산을 호출하지 않는다. 이번 DTO에는 해당 필드가 없으므로 항상 제외된다.
- 최종 `makeDashboardAggregateDto`는 literal allowlist object만 생성한다. raw issue, normalized issue, fetch response, SQL summary를 spread하지 않는다.

### 3.5 Relation graph와 team/resource 경로의 범위

- `RelationGraphService`/`TopologyIssueFetcher`는 원문 node/edge key가 product DTO의 본질이므로 이 feature에서 asApp aggregate로 전환하지 않는다.
- `ResourceManagementService`의 `getResourceOverview`, `getResourceLoadSummary`, `getResourceAllocationGraph` 등은 팀/사람 단위 DTO를 반환한다. asApp 전환은 이 feature 범위가 아니다. 후속 작업에서 `resolveTeamAnalyticsScope(principal)` → `visibleAccountIds` filtering → person aggregate allowlist 순서를 공통화한 뒤에만 전환할 수 있다.
- 즉 이번 feature의 asApp 예외는 `getDashboardAggregate` 하나다. 권한 경계를 넓히지 않고 사용자에게 필요한 Dashboard count/metric만 복구한다.

## 4. 프론트엔드 설계

수정 파일:

- `static/ui/src/utils/queryKey/projectKeys.js`: `dashboardAggregate(projectId) => ['dashboardAggregate', projectId]` 추가.
- `static/ui/src/hooks/useDashboardAggregate.js` 신규: `invoke('getDashboardAggregate', { project_id: projectId })`를 호출하고 기존 query 설정 패턴을 따른다.
- `static/ui/src/pages/projectDetail/dashboard/summary/SummaryPanel.jsx` 및 status/metric만 소비하는 dashboard widget adapter: 기존 `useDashboardInsight`의 `counts`, `statusDistribution`, `metrics`, `project` 의존을 `useDashboardAggregate`로 교체한다.

전환하지 않는 소비자:

- 이슈 큐·이슈 제목·assignee·priority·상세 링크를 표시하는 widget은 `useDashboardInsight`/`getDashboardIssueInsight`을 계속 쓴다.
- `useProjectRelationGraph`와 `topologyGraph`는 `getProjectRelationGraph`을 계속 쓴다.
- `ChartTemplate.js`의 일반 chart `getChartDataById`는 이번 범위에서 바꾸지 않는다. 새 aggregate DTO가 해당 chart의 모든 필터/series 계약을 대체하지 않기 때문이다.

RMS 권한은 있으나 Jira Browse가 없는 사용자는 summary/status/metric에는 aggregate 데이터를 보고, raw issue/graph widget은 기존 empty/error UI를 유지한다. 프론트는 aggregate 실패를 raw insight 결과로 fallback하지 않는다. 두 query key를 분리해 cache가 섞이지 않게 한다.

## 5. DB 설계

변경 없음. MySQL/KVS schema/migration/manifest 변경이 없다.

## 6. i18n 키 목록

변경 없음. 기존 loading/empty/permission UI 문자열을 재사용한다.

## 7. 테스트 계획

### Backend unit/service

1. `DashboardAggregateScope.test.js`
   - principal 누락, scope 밖 `project_id`, 빈 `memberProjectIds`는 Jira fetch 전에 reject.
   - `ALL`/`MEMBER_ONLY`/`TEAM_ONLY` 각각 `scopedProjectIds`의 결과를 따른다.
   - `LEADING`은 `leadingScopeAccountIds`가 없거나 비어 있으면 fail-close, `ALL`은 account filter 없음.
   - CostAccess/SalaryVisibility 실패 시 financial compute callback이 호출되지 않는다.

2. `DashboardAggregateFetcher.test.js`
   - 모든 Jira 요청이 명시적 `as: 'app'`이다.
   - body fields에 raw text fields(`summary`, `description`, `comment`, `worklog`)가 없다.
   - cap 초과 시 `truncated: true`이며 next page를 더 읽지 않는다.
   - user raw fetcher cache를 호출/재사용하지 않는다.

3. `DashboardAggregateService.test.js`
   - asApp fetch mock에 key/summary/description/comments/worklog/assignee/coworker/linkId를 넣어도 결과 JSON에 금지 key와 sentinel value가 없다.
   - 결과 shape는 §2.2 allowlist와 정확히 일치하고, `metrics`는 REPORT 미보유 시 key 자체가 없다.
   - Jira Browse가 없는 상황을 `asUser` 실패 mock으로 재현해도 aggregate fetch의 asApp 성공 결과가 scope 내에서 반환된다.
   - salary/cost key가 절대 결과에 포함되지 않는다.

4. Controller/permission contract
   - `getDashboardAggregate`가 `guardedDefine`로 등록되고 `PermissionMap`에는 `R('DASHBOARD','detail')`로 존재한다.
   - `principal`이 service까지 전달되는 spy test.
   - 기존 `getDashboardIssueInsight` 및 `getProjectRelationGraph`가 asUser fetcher 호출을 유지하는 회귀 test.

### Frontend tests

- `projectKeys` contract test에 `dashboardAggregate` key를 추가한다.
- `useDashboardAggregate`는 정확한 resolver 및 `{ project_id }` payload를 사용한다.
- Summary/status/metric widget이 aggregate content만으로 렌더링되고 `issues` 배열이 없어도 동작한다.
- raw issue widget은 aggregate query가 성공해도 `useDashboardInsight` 결과를 요구하며, 두 query의 loading/error/empty state가 혼입되지 않는다.

### 통합·runtime

- `npm test -- --runInBand`, `static/ui` Jest, `CI=true npm run build`, `forge lint`.
- development Jira에서 Jira Browse가 없는 RMS Dashboard/REPORT 사용자와 (a) 허용 project, (b) 범위 밖 project, (c) raw issue widget을 각각 검증한다. 기대값은 (a) aggregate만 성공, (b) resolver 실패, (c) raw detail 미노출이다.

## 8. 구현 작업 분해

### Backend

- [ ] `DashboardAggregateScope.js` 생성 및 existing permission helpers 재사용.
- [ ] `DashboardAggregateFetcher.js` 생성, explicit `as:'app'`, separate cap/cache.
- [ ] `DashboardAggregateService.js` 생성, scope-first 및 allowlist DTO mapper 구현.
- [ ] Controller import/`guardedDefine`와 PermissionMap 등록.
- [ ] backend unit/service/controller tests 추가.

### Frontend

- [ ] `projectKeys.dashboardAggregate`와 `useDashboardAggregate` 추가.
- [ ] summary/status/metric widget만 aggregate로 전환.
- [ ] raw issue/graph/일반 chart 소비 경로가 변하지 않았음을 tests로 고정.

### 제외 범위

- [ ] `getDashboardIssueInsight`/`getProjectRelationGraph`의 asApp 전환 금지.
- [ ] `ResourceManagementService` 전체 asApp 전환 금지.
- [ ] 새 DB/KVS schema, i18n, manifest 변경 없음.
