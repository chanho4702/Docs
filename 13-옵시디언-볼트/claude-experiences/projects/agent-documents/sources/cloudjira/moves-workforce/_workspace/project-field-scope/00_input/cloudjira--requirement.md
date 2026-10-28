# Project field assignment ownership hardening

## Goal

Fix P0-4: `updateProjectIdField` must not write the RMS project custom field to an arbitrary Jira Issue. Before writing, the server must verify the requested RMS project exists, is writable by the caller, and that the target Issue is visible to that caller. The operation must not allow a scoped user to associate an unrelated/inaccessible Issue with an authorized project.

## In scope

- `updateProjectIdField` resolver/controller/service and its Jira field write path.
- Existing UI calls that assign/import Issues into an RMS project.
- Server-side validation of requested project existence/scope and target Issue accessibility using `asUser` before app-authority field write.
- Focused regression tests for cross-project/inaccessible Issue association.

## Out of scope

- Existing Issue membership checks for P0-1/P0-2, which protect mutations of already-linked Issues.
- Jira Issue deletion, project deletion cleanup, and P1 subscription lifecycle.

## Acceptance criteria

1. A caller may associate only a Jira Issue they can access with an RMS project they may modify.
2. Missing, malformed, nonexistent, or inaccessible project/Issue identifiers fail closed before any app-field write.
3. Valid assignment/import workflows preserve their response and UI behavior.
4. Focused tests and integration verification pass.
