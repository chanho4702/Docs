# P0-2 Backend 구현 보고 — `assignWorkItem` Issue 소속 검증

## 변경 범위

- 변경: `src/resolver/workAssignment/WorkAssignmentWriter.js`
- 추가: `src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js`
- 변경하지 않음: Controller 등록, `PermissionMap`, DB/KVS, manifest, P0-1/P0-4 관련 소스

## 구현 내용

`assignWorkItemService(payload)`는 기존 `guardedDefine`의 inherited project scope 통과 후 다음 순서로 수행한다.

1. `getIssueForAssignmentApi(target, 'user')`로 호출자가 열람 가능한 canonical Issue를 조회한다.
2. 응답의 `id`와 `key`가 모두 있어야 하며, 요청에 `issueId`와 `issueKey`를 함께 보냈다면 각각 canonical 값과 일치해야 한다. key 비교는 Jira key의 대소문자 차이만 허용한다.
3. `areIssuesInProject([canonicalIssueKey], projectId, 'user')`로 `moves_RMS_projectId` 소속을 확인한다.
4. 소속 불일치·소속 확인 실패·소속 확인 API 예외는 모두 `ProjectScopeDeniedError` / `PERMISSION_PROJECT_SCOPE_DENIED`로 fail-close한다.
5. 검증 완료 후에만 assignee는 canonical key로, coworker property는 canonical numeric Issue ID로 write한다. 후속 재조회도 canonical key를 사용한다.

따라서 다른 프로젝트 Issue, RMS 프로젝트에 연결되지 않은 Issue, 서로 다른 Issue를 가리키는 `issueId`/`issueKey` 조합에는 Jira write가 실행되지 않는다.

## 실제 resolver 응답 shape

성공 시 기존 계약을 유지한다.

```js
{
  success: true,
  content: {
    issueId: string,
    issueKey: string,
    applied: { assignee: boolean, coworkers: boolean },
    item: QueueItem,
    previous: PreviousAssignment
  }
}
```

소속 검증 실패 시 `responseWrapper`가 다음 형태로 직렬화한다.

```js
{
  success: false,
  error: {
    name: 'ProjectScopeDeniedError',
    code: 'PERMISSION_PROJECT_SCOPE_DENIED',
    message: 'You do not have access to this project',
    cause: ''
  }
}
```

## 검증

```text
npm test -- --runInBand src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js
PASS — 1 suite, 4 tests

npm test -- --runInBand src/resolver/workAssignment/__test__
PASS — 3 suites, 72 tests
```

회귀 테스트는 canonical ID/key write, 다른 프로젝트 차단, 소속 확인 API 예외 fail-close, 서로 다른 ID/key 조합 차단을 다룬다.
