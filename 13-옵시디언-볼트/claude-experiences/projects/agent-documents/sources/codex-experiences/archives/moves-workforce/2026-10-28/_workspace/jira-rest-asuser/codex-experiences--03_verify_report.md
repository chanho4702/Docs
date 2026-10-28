# Jira REST asUser 기본 경로 — 통합 검증 보고서

검증 기준: `01_architect_design.md`, `02_backend_report.md`, 현재 워킹트리.

## 통과

### 1. 공용 helper authority 계약

| 생산자 | 소비자/검증 | 결과 |
|---|---|---|
| `src/api/jira/util/RequestJiaJson.js:9-16,45-46,83-84,121-122` — `clientOf()`는 `user`/`app`만 허용하고 네 helper의 기본값은 `user` | `RequestJiaJsonAuthority.test.js` | `as` 생략 시 `api.asUser()`, 명시적 `app`일 때만 `api.asApp()`, 알 수 없는 authority fail-close 통과 |
| `src/api/jira/issue/IssuePropertyApi.js:25-29,37,65,88,109` — property read/write/delete/merge 기본값은 `user` | `IssuePropertyApiAuthority.test.js`; `ProjectUsersService:440`, `WorkAssignmentWriter:113`, `GanttService:255`, `GanttFolderService:242` 호출 | 사용자 mutation의 호출자가 authority를 생략해도 asUser로 귀결됨 |
| `src/api/jira/user/TimeTrackingApi.js:5-23` — get/put 모두 asUser | `TimeTrackingApiAuthority.test.js`; 전역 검색으로 현재 호출자는 resolver뿐, seed 호출 제거 확인 | Jira 전역 Time Tracking 권한 부족은 fallback 없는 `ForgeAPIError`로 resolver wrapper까지 전파되는 기존 실패 계약 유지 |
| `src/api/jira/field/FieldApi.js:48-75` — 기본 asUser, cache key `${as}:${fieldName}` | `FieldApi.test.js`; trigger/queue/deletion/portfolio aggregator 호출 | app 결과가 user 조회 cache에 재사용되지 않으며 background 경로만 명시적으로 `app` 전달 |

### 2. asApp 예외와 보호 경계

| asApp 예외 | 생산자 | 보호/소비자 확인 | 결과 |
|---|---|---|---|
| 프로젝트 삭제 discovery·unlink | `IssueApi.listProjectDeletionIssuesAsApp:540-547`, `ProjectDeletionService:50-93` | `findAccessibleProjectDeletionIssueIdsAsUser`가 매 batch 전에 전체 ID를 확인하고 하나라도 누락되면 `BLOCKED_INACCESSIBLE`; 그 뒤에만 property/field app write | 통과 |
| subscription trigger/queue/reconcile/backfill | `onIssueCreated:52`, `subscriptionReconcile:56`, `queue/consumer:280`, `SubscriptionBackfill:96` | 사용자 컨텍스트가 없는 background entry point이며 field lookup만 명시 app | 통과 |
| scheduled portfolio aggregation | `PortfolioAggregator:514,576` 및 raw issue/worklog fetch의 `as:'app'` | scheduled 실행 전용 저장 집계 경로; `PortfolioAggregatorAsApp.test.js` | 통과 |
| assigned-date background recorder | `AssignedDateRecorder:88,94` | read/write 모두 명시 app이며 user 기본값 변경의 영향 없음 | 통과 |

### 3. resolver·응답 계약

- `ProjectDashboardController` 및 `PortfolioDashboardController`는 계속 `guardedDefine`로 등록되어 있고 해당 함수는 `PermissionMap`에 존재한다.
- 이 P2 변경은 resolver 이름, payload, 성공 DTO를 바꾸지 않았다. helper 401/403은 fallback 없는 mutation/read에서 `ForgeAPIError`로 전파되고 최종 `responseWrapper`가 `{ success: false, error }`로 직렬화한다.
- `SeedData.addSettingSeed`는 사용자 컨텍스트가 없는 `getTimeTracking()` 호출을 제거하고 `DEFAULT_SETTINGS`를 사용한다.

### 4. 실행 검증

```text
npm test -- --runInBand \
  src/api/jira/util/__test__/RequestJiaJsonAuthority.test.js \
  src/api/jira/issue/__test__/IssuePropertyApiAuthority.test.js \
  src/api/jira/user/__test__/TimeTrackingApiAuthority.test.js \
  src/api/jira/field/__test__/FieldApi.test.js \
  src/resolver/project/__test__/ProjectDeletionService.test.js \
  src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js \
  src/resolver/gantt/__test__/GanttFolderService.test.js \
  src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js \
  src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js

9 suites, 58 tests passed

npm test -- --runInBand \
  src/resolver/gantt/__test__/GanttValidationService.test.js \
  src/resolver/gantt/__test__/GanttMoveIssueFolder.test.js \
  src/resolver/projectIssue/__test__/ProjectExistingScope.test.js \
  src/resolver/projectIssue/__test__/ProjectChildScope.test.js

4 suites, 28 tests passed
```

`recordIssueAssignedDate`의 500 error console은 failure-path test fixture의 의도된 출력이며 test는 통과했다. `git diff --check`도 통과했다.

## 실패

없음.

이전 검증에서 지적한 stale 주석 2건은 동작 코드를 바꾸지 않고 현재 계약에 맞게 정정됐다.

- `src/api/jira/issue/IssuePropertyApi.js:15-16`: 사용자 resolver mutation은 asUser, 사용자 컨텍스트가 없는 trigger·queue·deletion saga만 explicit app이라는 계약을 정확히 설명한다.
- `src/resolver/workAssignment/WorkAssignmentWriter.js:8,111-112`: assignee/coworker write가 모두 asUser이며 실제 `mergeIssueProperty` 호출과 일치한다.

재검증 결과 `git diff --check`를 통과했다. 권한 helper·호출 인자·응답 DTO에는 변경이 없으므로 이전 13 suites/86 tests 통과 결과는 그대로 유효하다.

## 미완료 / 별도 범위

`DashboardInsightService`, `RelationGraphService`, `PortfolioIssueService` 및 aggregate fetcher의 **asApp 집계 경계 보정**은 이번 P2에서 미구현이다. 요청에 따라 실패가 아닌 별도 후속으로 기록한다.

- 현재 `DashboardInsightService:168`, `RelationGraphService:292`, `PortfolioIssueService:109`는 principal의 accountId를 viewerId로 넘기지만 fetcher authority는 기본 asUser다.
- 차트/총집계가 Jira Browse 권한보다 RMS 분석 권한을 우선해야 한다면, 별도 작업에서 `principal` fail-close, `ProjectScope`/`resolveTeamAnalyticsScope`, 비용·급여 gate, raw issue 제거 DTO를 모두 먼저 구현하고 난 뒤에만 해당 aggregate fetcher를 explicit asApp으로 전환해야 한다.
- 실제 Jira development 권한 매트릭스(401/403, Browse 없는 RMS 분석 사용자, deletion barrier)는 아직 실행하지 않았다. 전체 test/frontend CI build/Forge lint도 이번 집중 검증 범위 밖이다.
