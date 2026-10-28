# Jira REST asUser 기본화 — Backend Report

## 구현 완료

- `RequestJiaJson.js`
  - `requestJiraJson`, `putJiraJson`, `postJiraJson`, `deleteJira`의 기본 authority를 `user`로 전환했습니다.
  - `user`와 `app`만 허용하는 `clientOf`를 추가했습니다. 알 수 없는 authority는 app으로 묵시 전환하지 않고 `ForgeAPIError`로 fail-close 합니다.
- `IssuePropertyApi.js`
  - `readIssueProperty`, `writeIssueProperty`, `deleteIssueProperty`, `mergeIssueProperty`의 기본 authority를 `user`로 전환했습니다.
  - deletion saga와 `AssignedDateRecorder`의 명시적 `'app'` 호출은 보존했습니다.
- `TimeTrackingApi.js`
  - `getTimeTracking`, `putTimeTracking`은 모두 `as: 'user'`를 사용합니다.
  - `SeedData.addSettingSeed`에서 사용자 컨텍스트가 없는 Jira time-tracking 조회를 제거하고 `DEFAULT_SETTINGS.hourRate`를 사용하도록 했습니다.
- `FieldApi.js`
  - `findAppFieldIdByName(fieldName, as = 'user')`, `getProjectIdFieldIdApi(as = 'user')`, `getCoworkerFieldIdApi(as = 'user')`로 authority 인자를 추가했습니다.
  - cache key를 `${as}:${fieldName}`으로 바꿔 app 결과가 user 조회에 재사용되지 않도록 분리했습니다.
  - background/deletion 경로는 `'app'`을 명시했습니다: subscription trigger/reconcile/queue, deletion saga, subscription backfill, scheduled portfolio aggregation.

## 계약 영향

resolver 이름, payload 및 성공 DTO는 변경하지 않았습니다. 기존 helper 반환 계약도 유지합니다.

- JSON helper: 기존 JSON 또는 `null`
- Issue property: read `{}`, write/delete/merge `true`
- Time tracking: Jira DTO 또는 기존 `fallback`/`ForgeAPIError`

## 검증 후속 보정

검증에서 확인된 stale comment 두 곳을 현재 authority 계약에 맞춰 정정했습니다. 동작 변경은 없습니다.

- `IssuePropertyApi.js` 헤더: 사용자 resolver mutation은 asUser 기본, trigger/queue/deletion saga는 explicit app으로 설명을 갱신했습니다.
- `WorkAssignmentWriter.js` 헤더: assignee와 coworker property write 모두 호출 사용자 authority(asUser)임을 명시했습니다.

`git diff --check`를 다시 통과했습니다.

## 집중 검증

다음 명령이 통과했습니다.

```powershell
npm test -- --runInBand src/api/jira/util/__test__/RequestJiaJsonAuthority.test.js src/api/jira/issue/__test__/IssuePropertyApiAuthority.test.js src/api/jira/user/__test__/TimeTrackingApiAuthority.test.js src/api/jira/field/__test__/FieldApi.test.js src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js src/resolver/gantt/__test__/GanttService.test.js src/resolver/gantt/__test__/GanttFolderService.test.js src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js
```

결과: 8 suites, 57 tests passed. `recordIssueAssignedDate`의 의도된 500 error console 출력만 존재하며 실패는 없습니다.

추가로 `PortfolioAggregatorAsApp.test.js`도 통과했습니다(1 suite, 1 test). scheduled portfolio aggregation의 Jira 호출 authority 회귀가 없음을 확인했습니다.

## 후속 보정 필요 (이번 소스 변경 제외)

설계가 추가한 Dashboard/팀 분석 `as: 'app'` 예외는 현재 `DashboardInsightService`, `RelationGraphService`, `PortfolioIssueService`가 principal 누락 fail-close, ProjectScope, TeamAnalyticsScope, Cost/Salary 정책, raw issue 제거 DTO를 모두 충족하는지 별도 보정이 필요합니다.

특히 현행 `DashboardInsightService`와 `RelationGraphService`는 `principal` 없이도 fetcher를 호출하고, raw issue 기반 insight/graph DTO를 만듭니다. 따라서 단순히 fetcher 호출에 `as: 'app'`만 추가하면 설계의 보안 경계 조건을 만족하지 못합니다. 이 부분은 별도 범위에서 호출 경로와 DTO를 함께 정리해야 합니다.
