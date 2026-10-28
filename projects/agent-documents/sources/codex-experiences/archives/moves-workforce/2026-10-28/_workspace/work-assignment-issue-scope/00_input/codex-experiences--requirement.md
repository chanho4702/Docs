# Work-assignment issue ownership hardening

## Goal

Fix P0-2: `assignWorkItem` must not change an Issue's assignee or coworkers solely because the caller has access to the payload's RMS `projectId`. Before any Jira write, the server must prove that the target Issue is currently linked to that same RMS project.

## In scope

- `assignWorkItem` resolver/controller/service and its Jira write path.
- Server-side target Issue membership validation using the caller's Jira visibility (`asUser`).
- Focused regression tests for a permitted project A combined with an Issue in project B.
- Preserve successful response shape and existing UI behavior unless a change is necessary.

## Out of scope

- P0-1 child-resource mutations are complete and must not be broadened.
- `updateProjectIdField` is P0-4 and remains separate.
- Jira Issue deletion, project deletion lifecycle, and broader work-assignment features.

## Acceptance criteria

1. A caller authorized for project A cannot assign or modify coworkers on an Issue linked to RMS project B.
2. Missing, malformed, nonexistent, or inaccessible Issue identifiers fail closed before Jira writes.
3. Existing valid assignment workflows retain their response contract.
4. Focused backend tests and integration verification pass.
