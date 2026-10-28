# P0-4 Backend 구현 보고서

## 구현 범위

- `ProjectUsersController.updateProjectIdField`가 `principal`을 Service에 전달한다.
- `ProjectChildScope.assertExistingWritableProject({ projectId, principal })`를 추가했다.
  - UUID 및 principal/project scope를 fail-close로 확인한다.
  - `project` 테이블에서 실재 프로젝트를 조회하고, 없으면 동일한 `PERMISSION_PROJECT_SCOPE_DENIED`를 반환한다.
- `IssueApi.areIssuesAccessible(issueIds, as = 'user')`를 추가했다.
  - 1~100개의 중복 없는 numeric Jira Issue ID만 허용한다.
  - JQL 검색 결과의 Issue ID 집합이 요청 집합과 정확히 일치할 때만 `true`를 반환한다.
- `updateProjectIdFieldService({ customFieldId, issueId, value, project_id }, principal)`는 app-field write 전에 다음을 수행한다.
  1. `customFieldId` 존재 확인
  2. 실제 존재·쓰기 가능한 RMS 프로젝트 확인
  3. `areIssuesAccessible(issueId, 'user')`로 호출자의 Jira Issue 접근성 확인
  4. 모두 통과할 때만 기존 `setAppFieldValueForIssues` (`asApp` 플랫폼 예외 write)를 호출
- `PermissionMap`에 `project_id` 필수 계약 주석을 추가했다.

## 실제 응답 shape

`updateProjectIdField` 성공 시 Service는 `undefined`를 반환한다. `responseWrapper` 결과는 기존과 동일하게 다음이다.

```js
{ success: true }
```

범위·프로젝트 존재·Issue 접근성 실패 시:

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

## 등록 위치

- 기존 `registerProjectUsersController`의 `guardedDefine(resolver, 'updateProjectIdField', ...)`를 수정했다.
- 신규 resolver/manifest/스키마 변경은 없다.

## 테스트

실행:

```powershell
npm test -- --runInBand src/resolver/projectIssue/__test__
```

결과: **5 suites, 21 tests passed**.

추가 집중 테스트는 프로젝트 미존재, Issue 접근 불가, 비numeric/중복/누락 Issue, 정상 write의 payload 보존과 실패 시 app-field writer 미호출을 검증한다.
