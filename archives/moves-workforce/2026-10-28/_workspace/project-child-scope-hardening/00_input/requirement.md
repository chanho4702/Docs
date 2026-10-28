# Project child-resource scope hardening

## Goal

Fix P0-1: mutations that accept a child resource identifier without a project identifier must prove that the resolved resource belongs to a project the caller may modify. A direct `invoke()` payload must not be able to alter a different RMS project's member, user, issue association, coworker, or assigned-date data.

## In scope

- Audit and harden every affected resolver/controller/service/repository path already identified in the feature audit:
  - project member salary update;
  - project user update/delete by member key;
  - project issue exclusion/update;
  - coworker update;
  - assigned-date recording.
- Preserve existing UI behavior and response shapes where possible.
- Use server-side ownership resolution; client-supplied project IDs alone are insufficient.
- Add focused regression tests for cross-project direct invocation.

## Out of scope

- P0-2 work-assignment issue ownership, P0-3 dashboard title ownership, and P0-4 project-field ownership are separate follow-up items.
- No Jira issue deletion or project deletion lifecycle changes in this item.

## Acceptance criteria

1. For every in-scope mutation, a caller with write scope for project A cannot alter a child resource belonging to project B.
2. Missing, malformed, or nonexistent child IDs fail closed.
3. UI call shapes remain compatible unless an unavoidable backend contract change is documented.
4. Focused backend tests and integration verification pass.
