# Backend implementation report — Project Worklog Queue

## Implemented contract

`startProjectWorklogBatch({})` now returns:

```js
{appJobId: string | null, queuedCount: number, accepted: true}
```

- No active projects: `{appJobId: null, queuedCount: 0, accepted: true}`.
- Active projects: one `job` record and one event per project. Each event body is
  `{appJobId, batchId, batchIndex, totalBatches, projectId}`.
- Queue concurrency is `project-worklog:<projectId>`, `limit: 1`.

## Changed paths

- `SchedulerService`: creates the TTL job before enqueue and returns the accepted/queued status.
- `queue/consumer.projectWorklogBatch`: validates the event, skips completed batches, handles inactive license and stale projects, persists one snapshot, and finalizes the job.
- `PortfolioAggregator.aggregateAndPersistOneProject`: loads per-invocation shared context, invokes existing `aggregateOneProject`, and upserts only that project's snapshot. It does **not** write `portfolioRollup:current`.
- `ProjectQuery`/`ProjectRepository`: active-project lookup at consumer time.
- `queueUtil`: supports an item-derived concurrency key without changing existing string-key callers.
- `manifest.yml` and `index.js`: register `project-worklog-project-queue` → `projectWorklogBatch` → `queue/consumer.projectWorklogBatch`.

## Failure and idempotency behavior

- Malformed events are terminal failures when a job/batch identity is available; only batch ID, error code, and bounded message are stored in `job_fail`.
- Repeated events with `job_batch.done` do not fetch Jira or upsert again.
- Deleted/inactive projects and explicit inactive licenses are terminal skips (`processed=0`, `failed=0`).
- 429/rate-limit/timeout/ECONNRESET errors retry through the existing consumer wrapper; final retry and terminal errors record one failed batch, allowing `PARTIAL` completion.

## Tests

Executed:

```powershell
npm test -- --runInBand src/resolver/scheduler/__test__/SchedulerService.test.js src/queue/__test__/ProjectWorklogBatch.test.js src/queue/__test__/JobCompletion.test.js
```

Result: 3 suites, 17 tests passed.

Regression check:

```powershell
npm test -- --runInBand src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js src/resolver/portfolioDashboard/__test__/PortfolioAggregatorSalaryPolicy.test.js src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js
```

Result: 3 suites, 39 tests passed. The pre-existing portfolio batch aggregation and its `as: 'app'` contract remain intact.

`forge lint` was started from app root. This CLI session displayed its startup prompt but did not return a final exit result in the execution environment; it is not marked as passed here.

## Verification remediation — canonical batch identity

- `projectWorklogBatch` now derives the only persistence key from validated `appJobId`, `batchIndex`, and `totalBatches`.
- A malformed `batchId` is never used as a `job_batch` or `job_fail` key. When the remaining batch identity is valid, the canonical batch is terminally failed so the job can finish as `PARTIAL` rather than remain `RUNNING`.
- Added regression coverage for a mismatched batch ID: no Jira aggregation, no foreign key mutation, canonical batch failure, and `PARTIAL` job completion.
