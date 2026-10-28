# Storage and Jira common-path audit

Date: 2026-08-26

## P1 — Project storage breakdown silently omits three project-owned SQL tables

- `StorageQuery.PROJECT_ROW_COUNTS` measures only `project`, `projectusers`, `project_dashboard`, `portfolio_project_snapshot`, `gantt_folder`, and `gantt_folder_issue` (`src/resolver/storage/StorageQuery.js:29-38`).
- The schema also defines `project_subscription.project_id` (`src/rdb/schema/ddl/projectSubscription.sql.js:32`), `project_team.project_id` (`projectTeam.sql.js:13`), and `project_skills.project_id` (`skillMapping.sql.js:26`), but none is included in the breakdown query list.
- `getStorageUsageService()` still includes every table in `totalBytes` via `information_schema`, then computes `unassignedBytes = totalBytes - assigned` (`StorageService.js:68-72, 77-108`). Therefore rows in these three tables are consistently reported as unassigned/common storage, rather than attributed to their owning RMS project. This is especially misleading when subscriptions or skill/team mappings are large.

Recommended fix: add all project-owned tables to `PROJECT_ROW_COUNTS`, and keep the list maintained alongside DDL additions. Add a regression test that supplies counts for each table and verifies the project estimate receives them.

## P2 — Jira request helper defaults to `asApp()` despite the project-wide `asUser()` default rule

- All four generic helpers select `api.asApp()` when the caller omits `as`: `requestJiraJson`, `putJiraJson`, `postJiraJson`, and `deleteJira` (`src/api/jira/util/RequestJiaJson.js:9-10, 40-41, 76-77, 112-113`).
- Current call sites inspected generally pass an explicit mode, and normal issue/user paths set `as: 'user'`. Nonetheless, a future call that omits the argument receives app authority silently, contrary to the stated application security invariant that Jira product REST must default to `asUser()`.

Recommended fix: change the shared helper default to `as = 'user'`; retain explicit `as: 'app'` only in documented platform/background exceptions. This turns an accidental omission into the safe behavior without changing explicit callers.

## Verification

- `CI=true npm run build` in `static/ui`: completed; `build/asset-manifest.json` generated.
- `npm test -- --runInBand src/resolver/storage/__test__`: 1 suite, 15 tests passed. The displayed fallback error log is an intentional test case for breakdown-query failure.
