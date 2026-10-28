# Dashboard title ownership hardening

## Goal

Fix P0-3: `updateChartTitle` must not modify a dashboard chart identified only by `dashboardId`. The server must verify that the chart belongs to a project within the caller's writable project scope before updating its title.

## In scope

- `updateChartTitle` resolver/controller/service/repository/query.
- Existing UI invoke payload only if a project ID must be added for inherited guard compatibility.
- SQL ownership lookup and update predicate, with fail-close behavior.
- Focused regression tests for dashboard project A versus caller-authorized project B.

## Out of scope

- Dashboard delete behavior (P1) and other dashboard mutations unless required for shared ownership helper correctness.
- P0-1, P0-2, and P0-4 paths.

## Acceptance criteria

1. A caller authorized for project A cannot change a chart title belonging to project B.
2. Missing, malformed, or nonexistent chart IDs fail closed without an update.
3. Existing success response and UI query invalidation remain compatible.
4. Focused backend tests and integration verification pass.
