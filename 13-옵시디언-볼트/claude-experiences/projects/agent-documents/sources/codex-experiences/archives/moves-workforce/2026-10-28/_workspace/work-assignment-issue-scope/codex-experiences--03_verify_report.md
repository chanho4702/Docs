# P0-2 `assignWorkItem` Issue 소속 검증 — 통합 검증 보고서

검증일: 2026-08-31  
범위: P0-2만 검증하며 P0-1 및 P0-4의 해결 여부를 이 보고서에서 판정하지 않는다.

## 결론

P0-2의 생산자·소비자 경계면과 Jira write 전 소속 검증은 **통과**다. 요청 ID/key 불일치 및 Issue 소속 불일치/조회 예외에서 모두 write 전에 `PERMISSION_PROJECT_SCOPE_DENIED`로 fail-close 한다.

## 통과

| 경계면 | 생산자 | 소비자 | 검증 결과 |
| --- | --- | --- | --- |
| Resolver 등록·권한 | `src/index.js:84`가 `registerWorkAssignmentController`를 등록하고, `src/resolver/workAssignment/WorkAssignmentController.js:25-26`가 `guardedDefine('assignWorkItem', ...)`로 정의한다. `src/permission/PermissionMap.js:336`은 PROJECT/RESOURCE_MANAGEMENT write OR + `inherited` scope다. | `static/ui/src/pages/projectDetail/assignment/useAssignWorkItem.js:36`의 `invoke('assignWorkItem', payload)` | 함수명·등록·권한 경계가 일치한다. `payload.projectId`는 hook에서 항상 포함한다 (`useAssignWorkItem.js:27-31`). |
| Canonical Issue 확정 | `src/resolver/workAssignment/WorkAssignmentWriter.js:79-85`가 `getIssueForAssignmentApi(target, 'user')`로 조회한 `beforeRaw.id/key`를 canonical 값으로 확정한다. | 두 UI 호출부는 QueueItem의 `issueId`/`issueKey`를 함께 전달한다. 프로젝트 상세: `AssignmentPage.jsx:196-210`, 자원관리 모달: `WorkPickerModal.jsx:50-60`. | `asUser` 조회가 write 전에 수행되며, UI 계약 `{ projectId, issueId, issueKey }`과 일치한다. |
| ID/key 교차 검증 | `WorkAssignmentWriter.js:86-89`는 요청의 ID와 key가 canonical Issue와 각각 일치하지 않으면 `ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)`를 던진다. key 비교는 대소문자만 무시한다. | Hook은 두 값을 payload에 보존한다 (`useAssignWorkItem.js:27-34`). | 서로 다른 Issue를 가리키는 ID/key 조합이 JQL 및 Jira write 이전에 거절된다. 회귀 테스트 `WorkAssignmentWriter.test.js:88-103`도 JQL·assignee·property write 미호출을 확인한다. |
| 실제 RMS 프로젝트 소속 확인 | `WorkAssignmentWriter.js:91-95`는 canonical key만 사용해 `areIssuesInProject([canonicalIssueKey], projectId, 'user')`를 호출하고, `false`와 예외 모두 scope-denied로 전환한다. `src/api/jira/issue/IssueApi.js:504-521`은 `moves_RMS_projectId` 조건 JQL을 `as: 'user'`로 호출한다. | UI는 성공 응답을 받았을 때만 cache patch를 수행한다. `useAssignWorkItem.js:36-45`, `onSuccess`의 `assignmentKeys.board(projectId)` 사용은 `useAssignWorkItem.js:47-52`에 있다. | 소속 불일치·Jira 소속 확인 예외 모두 Jira write 전에 차단된다. 실패 응답은 hook에서 throw되어 `onSuccess` cache patch에 도달하지 않는다. |
| Canonical 대상 write | `WorkAssignmentWriter.js:102-110`에서 assignee는 canonical key와 `asUser`, coworker property는 canonical numeric ID로만 변경한다. 재조회도 canonical key로 수행한다 (`:118`). | 성공 content `{ issueId, issueKey, applied, item, previous }`는 `WorkAssignmentWriter.js:136-143`에서 유지되고, `patchAssignmentCache`가 `result.item`을 소비한다 (`static/ui/src/pages/projectDetail/assignment/patchAssignmentCache.js:195-196`). | 기존 응답 shape와 cache patch 계약이 유지된다. |
| P0-1 회귀 범위 | P0-1의 child scope 서비스는 `src/resolver/projectIssue/ProjectChildScope.js`에 독립되어 있고, 이번 P0-2 변경은 `IssueApi.js`와 `WorkAssignmentWriter.js`에 국한된다. | 관련 회귀 테스트 | `ProjectChildScope`, `recordIssueAssignedDate`, `ProjectUsersSalaryLeak` 3 suite/16 test 통과. 테스트 콘솔 오류는 의도된 Jira property 500 mock의 skip 경로다. |
| P0-4 비침범 | `updateProjectIdField`는 `src/resolver/projectIssue/ProjectUsersController.js:31`, `ProjectUsersService.js:282`에 그대로 남아 있으며 P0-2 파일 변경에 포함되지 않는다. | 해당 없음 | P0-2가 P0-4의 동작·해결 상태를 변경하지 않는다. P0-4는 별도 항목으로 남는다. |

## 실행 검증 통과

```text
npm test -- --runInBand src/resolver/workAssignment/__test__
PASS 3 suites, 72 tests

static/ui: npm test -- --runInBand src/pages/projectDetail/assignment/__test__ src/pages/resource/assignment/__test__
PASS 7 suites, 105 tests

npm test -- --runInBand src/resolver/projectIssue/__test__/ProjectChildScope.test.js src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js src/resolver/projectIssue/__test__/ProjectUsersSalaryLeak.test.js
PASS 3 suites, 16 tests
```

## 실패

없음.

## 미검증

| 항목 | 상태 | 사유 및 후속 조치 |
| --- | --- | --- |
| `forge lint` | 미검증 | 루트에서 실행했으나 30초 동안 출력 없이 종료 상태를 회수하지 못했다. 성공으로 판정하지 않는다. 독립 터미널에서 `pwd; forge lint`를 완료해 exit code를 확인해야 한다. |
| `CI=true npm run build` | 미검증 | `static/ui`에서 locale merge와 `craco build`의 `Creating an optimized production build...`까지 확인했으나 종료 출력/exit code를 회수하지 못했다. `MODULE_TYPELESS_PACKAGE_JSON` 경고만 출력됐고, build 성공 여부는 미판정이다. 완료 후 `npm run bundle:check`까지 실행해야 한다. |
| 실제 Jira 개발 사이트 권한·JQL | 미검증 | 단위 테스트는 `getIssueForAssignmentApi`/`areIssuesInProject`을 mock한다. 프로젝트 A 권한만 가진 사용자로 A Issue 성공, B Issue·미연결 Issue·ID/key 불일치 실패, Jira browse 불가 실패를 개발 사이트에서 확인해야 한다. |
