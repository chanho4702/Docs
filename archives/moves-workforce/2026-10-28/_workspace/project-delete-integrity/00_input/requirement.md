# Project deletion integrity

## Goal

Fix the highest-priority P1 project-deletion issues without deleting Jira business Issues:

1. Deleting an RMS project must unlink its Jira Issues from RMS metadata (`moves_RMS_projectId` and `movesRms` property) so deleted project UUIDs do not remain on Issues.
2. The deletion workflow must expose and recover from partial progress rather than silently leaving a project with only some SQL children removed.

## Product decision for this item

Preserve Jira Issues and their native Jira data. Delete only Moves RMS association metadata. This is the least destructive lifecycle behavior and is the assumption for implementation unless a design constraint requires a separate administrator retry workflow.

## In scope

- Project deletion resolver/service workflow, related SQL cleanup, Jira unlinking, and UI confirmation/status only where needed.
- A retryable/idempotent approach suitable for Forge SQL's lack of transactions.
- Existing project-scoped SQL children and KVS cache invalidation.
- Focused tests for normal delete, Jira unlink failure, SQL child failure, and retry/resume behavior.

## Out of scope

- Deleting Jira Issues, worklogs, comments, attachments, or native Jira fields.
- Unrelated P1 items such as KVS list pagination, Scheduler consumers, settings validation, or dashboard delete.

## Acceptance criteria

1. A successful delete removes all project-owned SQL rows, clears RMS metadata on linked accessible Jira Issues, and finally removes the project.
2. Failures leave a visible/retryable state; no operation reports full success after a partial delete.
3. The operation is idempotent and does not delete Jira Issues.
4. Existing permission and response contracts are preserved or explicitly documented.
