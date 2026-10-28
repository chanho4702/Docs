# P0-1 Backend Implementation Report

## Implemented scope

- Added `src/resolver/projectIssue/ProjectChildScope.js`.
  - Missing/malformed `project_id`, principal, member ID, Issue ID, duplicate Issue ID, and over-100 Issue requests fail closed with `PERMISSION_PROJECT_SCOPE_DENIED`.
  - For member mutations, the helper resolves the actual `projectusers.project_id`, requires it to equal the claimed `project_id`, and checks the resolved project against `scopedProjectIds(principal)`.
  - For Issue mutations, the helper checks every Issue with Jira using `as: 'user'` before any write occurs.
- Added `areIssuesInProject(issueIds, projectId, as = 'user')` to `src/api/jira/issue/IssueApi.js`.
  - The JQL query accepts validated Jira keys and numeric Issue IDs and requires all requested Issues to match `moves_RMS_projectId`.
- Updated `ProjectUsersController` to pass `principal` to these six existing resolvers:
  - `deleteProjectUsersByKey`
  - `updateProjectUsersByKey`
  - `updateProjectMemberSalary`
  - `deleteProjectIssue`
  - `updateIssueCoworkers`
  - `recordIssueAssignedDate`
- Updated `ProjectUsersQuery` and repository access:
  - `FIND_PROJECT_ID_BY_MEMBER_ID`
  - `DELETE_BY_KEY`, `UPDATE_BY_KEY_WITH_PARAMS`, and `UPDATE_SALARY_BY_KEY` now bind both `project_member_id` and resolved `project_id`.
  - A post-DML `rowsAffected !== 1` condition is treated as the same fail-closed project scope denial.
- `updateProjectIdField` was not changed; P0-4 remains outside this implementation scope.

## Actual resolver response shapes

All resolver functions remain registered through `guardedDefine`, whose `responseWrapper` serializes success as `{ success: true, ...result }`.

| Resolver | Success shape |
| --- | --- |
| `deleteProjectUsersByKey` | `{ success: true, rowsAffected, ... }` |
| `updateProjectUsersByKey` | `{ success: true, rowsAffected, ... }` |
| `updateProjectMemberSalary` | `{ success: true, rowsAffected, ... }` |
| `deleteProjectIssue` | `{ success: true }` |
| `updateIssueCoworkers` | `{ success: true, content: { issueId, coworkers: string[] } }` |
| `recordIssueAssignedDate` | `{ success: true, recorded: number, skipped: number }` |

Scope or ownership failure is `{ success: false, error: { name: 'ProjectScopeDeniedError', code: 'PERMISSION_PROJECT_SCOPE_DENIED', message, cause } }`.

## Tests

Executed:

```powershell
npm test -- --runInBand src/resolver/projectIssue/__test__/ProjectChildScope.test.js src/resolver/projectIssue/__test__/ProjectUsersSalaryLeak.test.js src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js src/resolver/__test__/SalaryPolicyLeak.test.js
```

Result: 4 suites passed, 43 tests passed.

The console output contains expected mocked error-path logs from existing salary-policy and assigned-date best-effort tests; no test failed.
