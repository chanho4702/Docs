# P0-1 Frontend Implementation Report

## Implemented scope

The existing project-detail screens now include their current `project_id` in every P0-1 mutation payload. No route, query key, optimistic update, toast, or invalidation behavior was changed.

| File | Resolver | Payload change |
| --- | --- | --- |
| `static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx` | `updateProjectMemberSalary` | The existing mutation function merges `project_id` into salary and salary-type updates. |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | `updateProjectUsersByKey`, `deleteProjectUsersByKey` | The update and delete mutation functions include `project_id`. |
| `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` | `deleteProjectIssue`, `updateIssueCoworkers` | The selected Issue removal and coworker update calls include `project_id`. |
| `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx` | `recordIssueAssignedDate` | The post-registration assigned-date call includes `project_id`. |

`updateProjectIdField` was deliberately not changed because it belongs to P0-4.

## Backend response-shape consumption

The frontend retains the established result handling and matches the backend implementation report:

- member mutations continue to use `{ success: true, rowsAffected, ... }` and their existing React Query behavior;
- `deleteProjectIssue` continues to explicitly require `result.success === true` per item;
- `updateIssueCoworkers` continues to branch on `result.success` without changing its `content` consumption;
- `recordIssueAssignedDate` remains non-blocking after successful Issue registration, now with the required project scope payload.

## Verification

Executed successfully:

```powershell
Set-Location static/ui
npm test -- --runInBand src/components/salary/__test__/salaryRenderGuard.test.js
$env:CI='true'; npm run build
npm run bundle:check
```

Results:

- Jest: 1 suite, 6 tests passed.
- CI production build: completed; prebuild locale merge also completed. Node emitted the existing `MODULE_TYPELESS_PACKAGE_JSON` warning for `locales/script/merge.js`, with no build failure.
- Bundle check passed: `static/js/main.e135c3a3.js`, gzip `435,982` bytes, within the `950,000` byte budget.

No i18n key was added, so no locale source file change was needed. The build's prebuild step executed the required locale merge.
