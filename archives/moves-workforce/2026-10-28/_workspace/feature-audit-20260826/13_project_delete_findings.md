# Project deletion audit

Date: 2026-08-27

## P1 — Deleting an RMS project leaves its Jira issues and their RMS metadata behind

- `deleteProjectService()` deletes SQL children and then the `project` row, but makes no Jira request (`src/resolver/project/ProjectService.js:124-142`).
- The application identifies project issues through Jira custom field `moves_RMS_projectId`; associated issue metadata is stored in issue property `movesRms` (`src/api/jira/issue/IssueApi.js:146-148`, `src/api/jira/issue/IssuePropertyApi.js:54-92`).
- Thus, deleting an RMS project does **not** delete its Jira issues, clear the `moves_RMS_projectId` field, or remove `movesRms` properties (coworkers, WBS parent, assigned date/by). Those issues retain a deleted RMS project UUID and become orphaned from the app's project list.

This may be intentional for preserving Jira records, but it must be an explicit lifecycle policy. Recommended safe behavior: on project deletion, locate all linked issues, clear only the RMS project field and `movesRms` app property in a bounded/retryable background job, while never deleting the Jira issues themselves. The UI confirmation must state this behavior. If retention is intentional, provide an archive/unlink workflow instead.

## P1 — The application-level cascade is not atomic and has no recovery state

- Forge SQL has no transaction here; the service performs ten awaited deletes in sequence (`ProjectService.js:127-137`).
- If any later delete fails, earlier child rows have already been permanently removed while the parent project may remain. The function has no deletion status, retry job, or compensation log. It merely returns an error to the caller.
- The code comment calls retry safe because the individual deletes are idempotent, but a user has no visible way to distinguish a failed, partially deleted project from a normal one or to resume it deterministically.

Recommended fix: persist a `DELETING` state before cascade, block normal writes, execute/retry an idempotent deletion job, and only remove the parent after all children and Jira unlinking complete. At minimum, return per-step failure context and add an administrator retry action.

## Existing SQL cleanup coverage

The following project-owned SQL records are explicitly removed: `projectusers`, `project_dashboard`, `portfolio_project_snapshot`, `gantt_folder_link`, `gantt_folder_issue`, `gantt_folder`, `project_skills`, `project_team`, and `project_subscription` (`ProjectService.js:128-136`). `ProjectProgress:{projectId}` and `ProjectCost:{projectId}` KVS keys are invalidated best-effort. Other cache keys are intentionally left to TTL (`ProjectService.js:96-114`), so stale display is possible until expiry.

## Test gap

No dedicated `deleteProjectService` cascade test was found under `src/**/__test__`. Add tests for delete ordering, a failure at every step, retry completion, Jira unlink job payload, and cache invalidation.
