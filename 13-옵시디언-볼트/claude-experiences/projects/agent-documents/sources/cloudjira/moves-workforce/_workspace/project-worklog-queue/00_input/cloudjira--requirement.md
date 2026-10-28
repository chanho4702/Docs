# Manual project Worklog batch queue completion

## Goal

Fix P1: `startProjectWorklogBatch` enqueues events to `project-worklog-project-queue`, but no manifest consumer or handler processes them. A manual Worklog batch must either execute reliably or report that it was not accepted.

## In scope

- Queue producer, consumer handler, manifest module/function registration, and project Worklog batch service.
- Idempotent per-project event processing, failure visibility, and meaningful enqueue response.
- Focused tests that verify producer queue key matches manifest consumer and that a queued project is actually processed.

## Out of scope

- Reworking unrelated Scheduler/Queue consumers or redesigning all batch jobs.
- Project deletion saga and all other remaining P1/P2 findings.

## Acceptance criteria

1. Every event sent by `startProjectWorklogBatch` has a registered Forge consumer and handler.
2. The handler validates payload and processes the intended project exactly/idempotently.
3. UI receives at least `queuedCount`; it does not claim completed processing merely from enqueue success.
4. Tests cover producer/manifest key agreement and consumer success/failure behavior.
