# Transition approval

## Administrator setup

1. Enable approvals for the project in global settings and create its flow.
2. In **Project settings → Moves Approval → Transition approval rules**, select the issue type, target status and flow.
3. Edit the Jira workflow, add **Moves Approval — approval required** to **each transition** entering that target status, and publish the workflow.
4. Verify rejection without approval and successful transition after approval using a regular account.

**A rule alone does not enforce approval. Only transitions with the validator are enforced.** Add it to alternative transitions entering the same status. Team-managed support is not guaranteed before live verification.

The current validator can pass without approval when global enforcement is off, the license is inactive, approval tables are not initialized, the issue or destination is missing, no rule matches, or the project is excluded. Do not describe it as blocking every transition at all times. Uninitialized tables and runtime read errors are different conditions. A valid protected rule rejects missing, pending, rejected or consumed approvals. Retest the applicable routes as a regular user after installation, upgrades or license changes.

## Requester flow

Open the issue's **Moves Approval** area or **••• → Request approval → Transition approval** and select a target status. The project rule fixes the approval line. Check the message, deadline and Cc recipients, then submit.

New requests **automatically transition using the original requester's offline permissions** after final approval. An administrator approving or retrying does not become the Jira execution actor. Existing `LEGACY_MANUAL` requests still require a manual Jira transition after approval.

Approval and **Jira application status** are separate outcomes. `WAITING` is execution pending after approval, `APPLYING` is executing, and `APPLIED` confirms a success response or exact changelog and approval consumption evidence. `FAILED` means application failed; `BLOCKED` means permissions, rules, state or required input prevent execution; `UNKNOWN` means the outcome is ambiguous. An approval notification is not proof of Jira application. Check Details.

**Retry automatic application** and **Reconcile Jira application** appear only when the server permits them. `UNKNOWN` is never reposted because Jira may already have applied it. Reconciliation requires matching requester, source/destination, time, a single changelog candidate and approval consumption; current target status alone is insufficient. Each invocation checks at most 500 entries/5 pages/15 seconds. Missing evidence requires administrator review. Automatic UI refresh while applying stops after approximately one minute; refresh manually afterwards.

Execution starts after final approval or in the five-minute job. Required transition screen fields are not guessed. Requester impersonation consent/access restrictions, live changelog actor preservation, REST validator re-entry, Forge SQL migrations and scheduled execution remain unmeasured on a development site. Support for every workflow is not guaranteed.

## Temporary release

Turning off global transition enforcement or excluding the project releases the approval requirement. It does not delete general approval records. Review the impact and record both the release and restoration.

[Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--07-transition-approval.md)
