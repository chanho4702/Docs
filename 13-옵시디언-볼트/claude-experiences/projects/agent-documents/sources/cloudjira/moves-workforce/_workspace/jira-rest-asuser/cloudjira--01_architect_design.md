# Jira REST helper asUser 기본 경로 감사 설계서

## 1. 개요 / 영향 범위

- 백엔드: 공용 Jira JSON helper, Issue Property helper, Time Tracking helper 및 그 호출부를 `asUser()` 기본으로 정렬한다.
- 프론트: 변경 없음. resolver 이름·payload·성공 DTO는 변경하지 않는다.
- DB/KVS/manifest/i18n: 변경 없음.
- 목적: 호출부가 `as`를 빼먹었을 때 앱 권한으로 승격되는 기본 경로를 제거한다. 단, RMS Dashboard/차트 및 팀 분석의 **집계 계산**은 Jira Issue Browse 권한과 독립된 RMS 권한 모델을 따르므로, 서버가 범위를 확정하고 최소 집계 DTO만 내보내는 조건에서 명시적인 `as: 'app'` 예외로 보존한다.

## 2. 경계면 계약 (가장 중요)

외부 resolver 계약은 모두 유지한다. 변경은 backend 내부 API의 권한 기본값뿐이다.

| 내부 함수 | 입력 변경 | 성공 반환 | 권한 계약 |
|---|---|---|---|
| `requestJiraJson` / `putJiraJson` / `postJiraJson` / `deleteJira` | `{ as?: 'user' | 'app', ... }`, 생략 시 `'user'` | 기존 JSON 또는 `null` | 사용자 요청은 Jira가 호출자 권한으로 인가한다. 앱 실행은 반드시 `as: 'app'` 명시 |
| `readIssueProperty` / `writeIssueProperty` / `mergeIssueProperty` / `deleteIssueProperty` | 기존 `as` 인자 유지, 생략 시 `'user'` | 기존 `{}` / `true` / 병합 결과 | resolver의 사용자 mutation은 asUser. trigger·queue·saga는 `'app'` 명시 |
| `getTimeTracking` / `putTimeTracking` | 인자 없음 유지(또는 내부 고정 `as:'user'`) | 기존 Jira DTO / `null` | Jira 전역 설정은 Jira의 호출자 권한으로 인가; Forge 앱 권한 우회 금지 |

기존 오류 계약도 유지한다.

- `fallback`이 지정된 helper 호출은 기존 fallback을 반환한다.
- fallback이 없으면 기존과 같이 `ForgeAPIError`를 throw한다.
- 사용자에게 Jira 권한이 없으면 새 앱 fallback을 만들지 않고 Jira의 401/403 기반 `ForgeAPIError`를 그대로 전파한다.
- resolver `responseWrapper`가 최종 `{ success: false, error }`로 직렬화한다.

## 3. 반드시 수정할 경로

### 3.1 공용 helper의 unsafe default 제거

대상: `src/api/jira/util/RequestJiaJson.js`

다음 네 함수의 destructuring 기본값을 모두 `as = 'user'`로 바꾼다.

- `requestJiraJson`
- `putJiraJson`
- `postJiraJson`
- `deleteJira`

`as`는 `'user'`와 `'app'`만 허용하도록 작은 `clientOf(as)` 공용 함수를 둔다. 알 수 없는 값은 앱 권한으로 fallback하지 말고 fail-close (`as === 'app' ? api.asApp() : api.asUser()` 또는 명시 validation)한다. 기존 호출 중 app 실행은 모두 `as: 'app'`을 이미 명시하거나 아래 3.3에서 명시 보강한다.

### 3.2 사용자 resolver에서 Issue Property 앱 권한 우회 제거

대상: `src/api/jira/issue/IssuePropertyApi.js`

`readIssueProperty`, `writeIssueProperty`, `deleteIssueProperty`, `mergeIssueProperty`의 기본 `as`를 `'user'`로 바꾼다. `clientOf`도 app을 **명시적으로** 요청했을 때만 `api.asApp()`을 고른다.

아래 호출은 모두 resolver의 `guardedDefine` 요청 흐름이며, Jira issue access를 호출자 권한으로 검사해야 하므로 별도 인자를 넣지 않고 새 기본값을 사용한다.

| 파일 | 호출 | 이유 |
|---|---|---|
| `src/resolver/projectIssue/ProjectUsersService.js` | `updateIssueCoworkersService`의 `mergeIssueProperty` | `assertIssueIdsInProject(..., principal)` 통과 후에도 Jira property write는 호출자 권한으로 수행해야 함 |
| `src/resolver/workAssignment/WorkAssignmentWriter.js` | `assignWorkItemService`의 `mergeIssueProperty` | 앞뒤 issue 조회·membership 검증이 이미 asUser이며 coworker write도 같은 주체여야 함 |
| `src/resolver/gantt/GanttService.js` | `setGanttParent`의 `mergeIssueProperty` | 프로젝트 멤버십 및 cycle 검증 후 실제 Jira write도 호출자 권한으로 제한 |
| `src/resolver/gantt/GanttFolderService.js` | Issue metadata 정리의 `mergeIssueProperty` | Gantt resolver mutation의 일관된 Jira 인가 |

이 변경으로 위 서비스의 반환 DTO는 달라지지 않는다. 권한 부족 시 성공처럼 처리하던 앱 권한 우회만 401/403 오류로 표면화된다.

### 3.3 Time Tracking 전역 설정의 앱 권한 우회 제거

대상: `src/api/jira/user/TimeTrackingApi.js`

`getTimeTracking`과 `putTimeTracking`의 명시적 `as: 'app'`을 `as: 'user'`로 변경한다. `/rest/api/3/configuration/timetracking/options`는 Jira 전역 설정이므로 앱 내부 Backoffice 권한만으로는 충분하지 않다. Jira의 실제 전역 관리자 권한 검사를 asUser로 수행해야 한다.

호출부를 전수 확인한다.

- 설정 화면 mutation이 `putTimeTracking`을 호출하면 Jira 권한 부족은 그대로 `ForgeAPIError`가 되어 기존 resolver 실패 contract를 따른다.
- `src/seed/SeedData.js`의 `getTimeTracking`은 install/seed처럼 사용자 컨텍스트가 없을 수 있으므로, seed 기본값을 `DEFAULT_SETTINGS.hourRate`로 유지하고 Jira 시간 추적 조회를 사용자 없는 seed에서 제거한다. seed가 Jira 전역 설정을 앱 권한으로 읽어 초기값에 복사해서는 안 된다.
- 만약 install 시 동기화가 제품상 필수라면 별도 관리자 승인 resolver에서 asUser로 읽어 KVS settings에 저장하는 기능으로 분리한다. 이번 P2 범위에서는 seed의 best-effort 읽기를 삭제/skip하는 것이 최소·안전한 선택이다.

### 3.4 필드 ID 조회 helper의 호출 주체 명시

대상: `src/api/jira/field/FieldApi.js`

`findAppFieldIdByName(fieldName, as = 'user')`로 바꾸고 `getProjectIdFieldIdApi(as = 'user')`, `getCoworkerFieldIdApi(as = 'user')`가 전달한다. `/rest/api/3/field` 일반 조회는 사용자 resolver에서는 asUser가 기본이다.

사용자 resolver의 현 호출은 인자 생략으로 asUser가 된다. 사용자 컨텍스트가 없는 아래 경로만 `getProjectIdFieldIdApi('app')` 또는 `getCoworkerFieldIdApi('app')`으로 명시한다.

- `src/trigger/onIssueCreated.js`
- `src/trigger/subscriptionReconcile.js`
- `src/queue/consumer.js`의 subscription backfill consumer
- `src/resolver/portfolioDashboard/PortfolioAggregator.js`의 scheduled snapshot 경로
- `src/resolver/projectSubscription/SubscriptionBackfill.js`
- `src/resolver/project/ProjectDeletionService.js`의 retryable deletion saga

캐시는 권한 주체별로 분리한다. 동일 `fieldName` 하나만 key로 쓰면 app 성공값이 user 호출에 재사용되어 asUser 검증을 우회한 것처럼 보일 수 있으므로 cache key는 `${as}:${fieldName}`이다.

### 3.5 Dashboard/팀 분석 집계의 의도적인 asApp 경계

Dashboard·차트·팀 분석에서 앱이 Jira 원문을 읽어 합계·가동률·상태 분포·인력 유효성만 계산하는 경우에는 `as: 'app'`을 **호출부에 명시**한다. 이는 Jira Issue Browse 여부로 RMS의 업무 분석 권한이 축소되지 않도록 하는 제품 결정이다.

다만 app authority는 데이터 범위를 자동으로 안전하게 만들지 않는다. 해당 resolver/service는 Jira 호출 전에 다음을 모두 수행해야 한다.

1. `guardedDefine` + `PermissionMap`의 RMS Dashboard/REPORT/RESOURCE_MANAGEMENT 권한을 통과한다.
2. `principal`을 서비스까지 전달한다. 누락된 principal은 fail-close다.
3. 프로젝트 단위 분석은 `ProjectScope`의 실제 허용 project ID 집합으로 입력 `projectId`를 제한한다.
4. 팀 단위 분석과 인력 목록은 `resolveTeamAnalyticsScope(principal)` 단일 출처로 `ALL | MEMBER_ONLY | TEAM_ONLY`를 확정하고, `TEAM_ONLY`이면 해당 팀/구성원으로 먼저 좁힌다.
5. 비용·급여는 집계 화면이라도 `CostAccess.canReadCost(principal)` 및 필요한 `SalaryVisibility`를 별도로 통과해야 하며, 미통과 시 금액·급여 원문을 DTO에서 제거한다.

허용 DTO는 숫자·버킷·서버가 허용한 식별자만 포함하는 최소 집계다. 예: `{ todoCount, inProgressCount, doneCount, issueCount, spentSeconds, remainingSeconds }`, 기간별 series, 서버 scope로 필터한 `{ accountId, utilization }`. Jira raw issue의 `key`, `summary`, `description`, `comments`, `worklog` 원문, Jira project metadata 전체, 또는 scope 밖 accountId 배열은 asApp 집계 resolver에서 반환하지 않는다. 원문 상세·개별 Issue mutation·선택한 Issue의 검증은 반드시 asUser 경로다.

대상 구현은 `ProjectDashboardService`/`DashboardInsightService`/`RelationGraphService`, `ResourceManagementService`, `TeamAnalyticsService` 및 이들이 호출하는 aggregate fetcher로 한정한다. `DashboardIssueFetcher`, `TopologyIssueFetcher`, `ResourceLoadFetcher`, `AssignmentMetricsFetcher`는 aggregate 전용 entry point에만 `'app'`을 받을 수 있고, Issue raw DTO를 소비·반환하는 기존 entry point의 기본값은 `'user'`로 유지한다.

## 4. 허용되는 asApp 플랫폼 예외와 근거

`asApp()`은 아래처럼 사용자 컨텍스트가 원천적으로 없거나 Atlassian이 앱 전용으로 제공한 endpoint에만 남긴다. 모두 호출부에서 `as: 'app'` 또는 직접 `api.asApp()`을 명시한다.

| 경로 | 파일 | 예외 근거 | 직접 검증/보호 장치 |
|---|---|---|---|
| App-owned read-only custom field 값 PUT | `src/api/jira/field/AppFieldValueApi.js` | `/rest/api/3/app/field/{field}/value`는 앱 전용 write 경로 | 사용자 resolver는 먼저 `principal` project scope 및 `areIssuesAccessible(..., 'user')`를 확인. trigger/queue는 저장된 subscription/이벤트 조건으로 범위를 제한 |
| Project deletion discovery/property/field unlink | `ProjectDeletionService.js`, `IssueApi.listProjectDeletionIssuesAsApp`, `IssuePropertyApi` | 재시도 saga가 lease/재호출에서 실행되며 완료 전까지 앱 주체가 필요 | unlink 전 배치마다 `findAccessibleProjectDeletionIssueIdsAsUser`로 요청 사용자의 모든 Issue Browse access를 재확인하고, 하나라도 없으면 `BLOCKED_JIRA_ACCESS`; SQL 삭제 전 barrier 유지 |
| Subscription sweep/backfill/default estimate | `SubscriptionSweeper.js`, `DefaultEstimateApplier.js`, `SubscriptionBackfill.js`, `queue/consumer.js`, `trigger/*` | schedule/event/queue에는 asUser가 없고 구독 기능은 background reconciliation이 본체 | 생성·수정 시 `assertSourceAccessible`: source를 asUser와 asApp 양쪽으로 검증. preview/count/sample은 asUser; sweep의 app JQL만 명시 허용 |
| Portfolio/Dashboard/팀 분석 집계 | `PortfolioAggregator.js`, Dashboard·팀 분석 aggregate fetcher, `PortfolioIssueFetcher.js`, `ResourceWorklogFetcher.js`, `UserApi` 호출 | scheduled trigger에는 사용자 컨텍스트가 없고, 사용자 resolver의 RMS 집계도 Jira Browse와 독립된 제품 권한을 따름 | 호출부의 `as:'app'` 명시가 필수. resolver는 `principal`으로 ProjectScope/`resolveTeamAnalyticsScope`/CostAccess를 선검증하고 raw Issue가 아닌 최소 집계 DTO만 반환 |
| Jira project metadata second check for subscription | `SubscriptionSourceApi.js` | 장래 app sweep 실행 가능 여부를 생성 시 확인 | 먼저 asUser access 실패를 `SUBSCRIPTION_SOURCE_FORBIDDEN`으로 차단한 뒤 asApp availability를 `SUBSCRIPTION_APP_NO_ACCESS`으로 확인 |
| Demo seeder | `src/trigger/demoSeed.js` | 현재 manifest가 주석 처리되어 production surface가 아님 | 활성화 금지 상태를 유지. 재활성화한다면 secret header만으로는 product permission 검증이 아니므로 admin-only 별도 검증/배포 환경 제한을 선행 |
| License API | `src/utils/license/LicenseGuard.js` | Jira product REST가 아닌 Atlassian license API | 본 P2 범위 밖; asUser 전환 대상 아님 |

`src/api/jira/field/FieldApi.js`의 `/field` 목록은 위 background 경로에서만 명시 app으로 허용한다. 일반 resolver에서 전역 field 목록이 앱 권한으로 조회되는 현 상태는 제거한다.

## 5. 호출 주체 분류 결과

### asUser 기본으로 유지/전환할 API

- `IssueApi.js`, `ProjectIssuesFetcher.js`, `ProjectParticipantFetcher.js`, `WorklogApi.js`, `UserApi.js`, `CoworkerResolver.js`
- Issue 원문을 반환하거나 개별 Issue를 검증·수정하는 `DashboardIssueFetcher.js`, `TopologyIssueFetcher.js`, `ResourceLoadFetcher.js`, `WorkAssignmentIssueFetcher.js`, `AssignmentMetricsFetcher.js`, `PortfolioIssueFetcher.js`의 기본 entry point
- `ProjectSubscriptionService.js` preview/count/sample, `SubscriptionSourceApi.js` 목록·사용자 source 검증
- 위 3.2의 project issue property mutation 네 경로
- `TimeTrackingApi.js` get/put

대부분 이미 `as: 'user'` 또는 `as = 'user'`를 전달한다. helper 기본 변경은 누락에 대한 fail-safe이며, API별 기본값을 다시 app으로 두지 않는다.

### 명시적 asApp 집계 API

- Portfolio snapshot의 `PortfolioAggregator.aggregateOneProject`: 사용자 컨텍스트가 없는 scheduled execution이므로 현행 `'app'` 명시를 유지한다.
- Dashboard 차트/insight·관계 그래프 및 팀 분석: RMS 권한과 server-side scope가 확정되고 최소 DTO mapper가 Jira raw issue를 제거한 aggregate 전용 경로만 `'app'`을 사용한다.
- app aggregate fetcher는 generic helper의 기본값에 의존하지 않는다. 각 Jira fetch 호출에 `as: 'app'`을 전달하고, raw issue를 반환하는 함수와 이름/entry point를 분리한다.

### 이미 명시적 app이나 예외인데 확인할 API

- `IssueApi.listProjectDeletionIssuesAsApp`: 함수명·호출이 app임을 유지하고, deletion service의 asUser accessibility barrier test를 강화한다.
- `AssignedDateRecorder`: background subscription에서도 사용되므로 `readIssueProperty(id, 'app')` / `writeIssueProperty(..., 'app')` 명시를 유지한다.
- `TimeTrackingApi`의 기존 app 호출은 예외로 인정하지 않는다(3.3에서 전환).

## 6. 테스트 설계

### Unit tests

1. `src/api/jira/util/__test__/RequestJiaJson*.test.js` 신규/보강
   - 네 helper에서 `as` 생략 시 `api.asUser().requestJira`가 호출된다.
   - `as: 'app'`일 때만 `api.asApp()`가 호출된다.
   - 401/403은 fallback 유무에 따른 기존 반환/`ForgeAPIError` contract를 유지한다.

2. `src/api/jira/issue/__test__/IssuePropertyApi*.test.js` 보강
   - read/write/delete/merge가 인자 생략 시 asUser.
   - `'app'` 명시 시에만 asApp.
   - 404 read=`{}`, delete=`true` 및 다른 4xx/5xx throw contract 회귀.

3. `src/api/jira/field/__test__/FieldApi.test.js` 보강
   - 기본 조회는 asUser.
   - app 명시 조회는 asApp.
   - `${as}:${fieldName}` cache 분리(한 권한 주체의 성공이 다른 주체 호출을 건너뛰지 않음).

4. `src/api/jira/user/__test__/TimeTrackingApi*.test.js` 신규
   - get/put 모두 asUser.
   - Jira 권한 403은 fallback 없이 `ForgeAPIError`.

5. Dashboard/팀 분석 aggregate fetcher tests
   - RMS 권한 또는 `principal`이 없으면 Jira `asApp()` 호출 전에 fail-close한다.
   - `TEAM_ONLY` principal은 `resolveTeamAnalyticsScope`가 허용한 팀/구성원만 입력 JQL·집계 대상에 남긴다.
   - `PROJECT_COST` 또는 salary 권한이 없으면 금액·급여 필드가 DTO에 존재하지 않는다.
   - asApp Jira 응답에 issue `key`·`summary`·`description`·worklog 원문을 섞어도 mapper 결과에는 최소 count/series/허용 accountId 외 값이 남지 않는다.
   - 같은 aggregate request를 asUser로 대체하지 않는다. Jira Browse가 없는 RMS 권한 사용자도 scope 내 aggregate 결과를 받는 회귀를 검증한다.

### Service regression tests

- `ProjectUsersService`, `WorkAssignmentWriter`, `GanttService` tests에서 IssueProperty mock/spy가 user default를 쓰는지 확인한다.
- `ProjectDeletionService` test는 property unlink가 explicit app인 점과, asUser accessibility 실패 시 property/field app write가 한 번도 호출되지 않는 점을 유지한다.
- `SubscriptionSweeper`, `PortfolioAggregatorAsApp`, `onIssueCreated`/queue 관련 tests에서 background field lookup과 Jira REST call이 explicit `'app'`으로 전달되는지 검증한다.
- `SeedData` test(없으면 최소 unit test)를 추가해 사용자 없는 seed가 `TimeTrackingApi.getTimeTracking`을 호출하지 않는지 확인한다.

## 7. 구현 작업 분해

### Backend

- [ ] `RequestJiaJson.js` 네 helper default를 `'user'`로 변경하고 unknown authority fail-close.
- [ ] `IssuePropertyApi.js` 네 public helper default를 `'user'`로 변경.
- [ ] `TimeTrackingApi.js`를 asUser로 전환하고 `SeedData.js`의 무주체 Jira 조회를 제거/기본값 처리.
- [ ] `FieldApi.js`에 authority 인자·authority별 cache key를 추가.
- [ ] user mutation (`ProjectUsersService`, `WorkAssignmentWriter`, `GanttService`, `GanttFolderService`)은 user default를 사용하게 하고, background/deletion/trigger/queue/aggregator 모든 field lookup은 `'app'`을 명시.
- [ ] Dashboard·팀 분석의 asApp 사용을 aggregate 전용 entry point로 분리하고, `principal` → ProjectScope/`resolveTeamAnalyticsScope` → CostAccess/SalaryVisibility → 최소 DTO mapper 순서를 강제.
- [ ] `AssignedDateRecorder`, deletion saga, subscription sweep의 explicit app을 보존하고 근거 주석을 최소로 정리.

### Frontend

- [ ] 변경 없음. 기존 invoke 오류 표시는 유지한다.

### 검증

- [ ] 영향을 받는 backend Jest suites를 먼저 실행한다.
- [ ] `npm test -- --runInBand`.
- [ ] app root에서 `pwd`, `forge lint`.
- [ ] 실제 development Jira에서 (a) Jira Browse 없는 Issue의 coworker/Gantt mutation이 실패하는지, (b) Jira global admin이 아닌 Backoffice 사용자의 time tracking 변경이 403인지, (c) RMS Dashboard/팀 분석 권한은 있으나 Jira Issue Browse가 없는 사용자가 scope 내 숫자 집계만 받는지, (d) subscription scheduled sweep와 deletion retry가 유지되는지 확인한다.

## 8. 별도 최소 작업: `dashboard-asapp-boundary`

### 8.1 문제와 범위 분리

현재 `getDashboardIssueInsight`와 `getProjectRelationGraph`는 `ProjectDashboardController`에서 principal을 전달받지만, 서비스 내부에서 Jira raw issue를 `issues[]`/graph `nodes[]`·`edges[]` DTO로 변환해 반환한다. `DashboardInsightService`의 각 issue에는 `key`, `summary`, assignee, 우선순위, 상태 등 원문 식별 정보가 남고, `RelationGraphService`는 issue key와 Jira link 구조를 반환한다. 또한 두 서비스는 `ProjectScope`를 독립적으로 재확인하지 않는다.

따라서 두 **기존 resolver는 asUser raw-detail 경로로 그대로 유지**한다. 이들을 단순히 `as:'app'`으로 바꾸는 것은 금지한다. app 권한을 쓰는 Dashboard/차트 예외는 raw DTO를 만들지 않는 별도 resolver/service/fetcher로 한정한다.

| 구분 | 기존 raw-detail 경로 — 유지 | 신규 aggregate 경로 — `dashboard-asapp-boundary` |
|---|---|---|
| resolver | `getDashboardIssueInsight`, `getProjectRelationGraph` | `getDashboardAggregate`, `getProjectRelationGraphAggregate` |
| Controller | `ProjectDashboardController` 기존 `guardedDefine` | 동일 controller에 `guardedDefine` 신규 등록 |
| PermissionMap | `getDashboardIssueInsight: R('DASHBOARD','detail')`, `getProjectRelationGraph: R('PROJECT','detail')` 유지 | `getDashboardAggregate: R('DASHBOARD','detail')`, `getProjectRelationGraphAggregate: R('PROJECT','detail')` 추가 |
| Jira authority | `DashboardIssueFetcher`/`TopologyIssueFetcher` 기본 `as:'user'` 유지 | `DashboardAggregateFetcher`/`RelationGraphAggregateFetcher`에서만 명시 `as:'app'` |
| 출력 | 기존 issue·graph detail DTO | count/ratio/bucket만 담은 최소 aggregate DTO |

새 resolver 이름은 implementation 전에 `src/permission/PermissionMap.js`와 `src/index.js`의 controller registrar 계약에 동시에 반영한다. 새 resolver의 `principal` 누락은 빈 성공 DTO가 아니라 `PERMISSION_PROJECT_SCOPE_DENIED`로 fail-close한다.

### 8.2 정확한 backend 구성과 principal 흐름

1. `ProjectDashboardController.js`
   - `guardedDefine(resolver, 'getDashboardAggregate', ({ payload, principal }) => getDashboardAggregateService({ ...payload, principal }))`
   - `guardedDefine(resolver, 'getProjectRelationGraphAggregate', ({ payload, principal }) => getProjectRelationGraphAggregateService({ ...payload, principal }))`
   - 기존 two resolver의 principal 전달도 유지한다. controller 밖의 service direct call은 테스트 helper에만 허용한다.

2. `DashboardAggregateService.js` 신규
   - 입력: `{ project_id, principal }`.
   - `assertDashboardAggregateScope({ projectId: project_id, principal })`을 새 공용 boundary helper로 먼저 호출한다. helper는 principal 존재, `projectScope`, `scopedProjectIds` 포함 여부를 검증한다. `ALL` 외에는 `project_id ∈ principal.scopedProjectIds`가 필수다.
   - 그 뒤 `DashboardAggregateFetcher.fetch({ projectId, as: 'app' })`를 호출하고 status/count/MD/flag bucket을 서버에서 산출한다.
   - `canReadReport(principal)`가 false이면 report metrics 계산·반환을 생략한다. `canReadCost(principal)`가 false이면 cost·salary aggregate 자체를 계산하지 않는다. 급여를 포함하는 어떤 aggregate도 `resolveSalaryPolicySafe()` + `canShowIndividualSalary()`을 모두 통과해야 한다.

3. `RelationGraphAggregateService.js` 신규
   - 입력: `{ projectId, principal }`; 같은 `assertDashboardAggregateScope`를 먼저 통과한다.
   - `RelationGraphAggregateFetcher.fetch({ projectId, as: 'app' })`는 graph 구성을 위한 최소 fields만 가져온다.
   - output은 node/edge 원문 배열을 반환하지 않고 node/edge count, `EDGE_KINDS`별 count, `spaceCount`, `outOfScopeEdgeCount`, `truncated`만 반환한다. issue key, space key/name, link id/type name, summary는 모두 mapper에서 삭제한다.

4. 팀·인력 aggregate 소비 경로 (`ResourceManagementService.js`, `TeamAnalyticsService.js` 및 관련 fetcher)
   - `resolveTeamAnalyticsScope(principal)`을 Jira query 이전에 1회 호출한다. `NONE`은 빈 결과로 승격하지 말고 권한 오류 또는 기존 domain의 fail-close 계약을 사용한다.
   - `LEADING`은 `principal.leadingScopeTeamKeys`와 `principal.leadingScopeAccountIds`로 입력 대상을 먼저 좁힌다. `ALL`만 조직 전체 aggregation을 허용한다.
   - 반환 가능한 사람 단위 DTO는 `{ accountId, utilization, investedMd, availMd, todoCount, inProgressCount, doneCount }`까지만이다. email, salary, annual salary, Jira issue refs, worklog text·시간 원문은 포함하지 않는다. salary/cost aggregate는 위 CostAccess/SalaryVisibility 조건을 만족할 때도 개인 행이 아닌 product requirement가 명시한 집계만 반환한다.

### 8.3 Fetcher와 DTO 계약

`DashboardAggregateFetcher`와 `RelationGraphAggregateFetcher`는 기존 `DashboardIssueFetcher`/`TopologyIssueFetcher`의 내부 raw response를 재사용하지 않는다. 기존 fetcher의 cache key는 `viewerId::projectId`로 사용자 가시 범위를 전제로 하므로 app aggregate와 공유하면 안 된다. aggregate fetcher는 별도 cache 또는 cache 없음으로 시작하며 key에는 권한 결과를 포함한다.

| resolver | 입력 | asApp fetch 결과의 허용 소비 | 외부 성공 DTO |
|---|---|---|---|
| `getDashboardAggregate` | `{ project_id }` + server principal | status category, due-date bucket, estimate/spent seconds을 즉시 count/MD로 축약 | `{ generatedAt, project: { startDate, endDate }, counts: { total, done, inProgress, todo, overdue, dueSoon, unassigned, noEstimate }, metrics?: { completionRate, scheduleRate, diffPercentPoint, effortVsCompletion, status, plannedTotalMd, actualTotalMd }, truncated }` |
| `getProjectRelationGraphAggregate` | `{ projectId }` + server principal | links/parent/project을 edge-kind별 count로 축약 | `{ generatedAt, scanned, truncated, nodeCount, edgeCount, edgeKindCounts, spaceCount, outOfScopeEdgeCount }` |

두 DTO에는 `issues`, `nodes`, `edges`, `key`, `summary`, `description`, `comments`, `worklog`, `assignee`, `accountIds`, `linkId`, `source`, `target`, Jira space key/name이 존재해서는 안 된다. TypeScript가 없는 JavaScript 코드이므로 service return 직전에 allowlist mapper를 사용하고, raw object spread를 금지한다.

### 8.4 테스트 기준

- Controller contract: 새 resolver 두 개가 `guardedDefine` 및 `PermissionMap`에 모두 등록되고 `project_id`/`projectId`가 `detail` scope에 실제로 추출된다.
- Scope: principal 누락, `MEMBER_ONLY`/`TEAM_ONLY`의 scope 밖 프로젝트는 Jira fetch 전에 reject한다. 허용 프로젝트만 `as:'app'` fetch가 호출된다.
- Team scope: `NONE`은 fetch 0회, `LEADING`은 leading team/account 대상만 남는 JQL 또는 prefiltered input, `ALL`만 organization-wide input을 사용한다.
- Raw-data non-leak: fetcher mock에 issue key/summary/description/comments/worklog/account IDs/link IDs를 넣고 JSON stringify 결과에 금지 key·값이 하나도 없음을 검증한다.
- Financial gate: `PROJECT_COST` 또는 salary policy 조건 불충족 시 관련 fetch/계산이 실행되지 않고 amount/salary key가 DTO에 없다.
- Authority: Jira Browse가 없는 RMS Dashboard/REPORT 권한 사용자의 allowed project aggregate는 asApp으로 성공한다. 반대로 기존 raw-detail resolver는 asUser 유지로 Jira 403 시 raw detail을 반환하지 않는다.
- Cache: user raw fetch cache와 app aggregate cache 사이에 동일 project response가 공유되지 않는 회귀 test를 둔다.
