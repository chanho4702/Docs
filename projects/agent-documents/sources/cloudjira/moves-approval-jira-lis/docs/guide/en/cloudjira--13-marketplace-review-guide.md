# Marketplace reviewer guide

This procedure verifies **Moves Approval for Jira** on Jira Cloud. No Confluence installation is required. Moves Workforce is an optional integration; verify standalone use first.

This is an implementation-based preparation draft. Live results below have not yet been recorded. The submission contact will supply the review site, installation route, release version and account permissions through a secure channel. Passwords must not appear in public documentation.

## Prerequisites

- Prepare a company-managed test project, requester A, approver/team lead B, Jira administrator C and user D without issue visibility.
- Requesters and approvers can view test issues and have required worklog permissions. Field application actors can edit the issue and use an edit screen containing the field.
- Enable the project, create a one-step flow and timesheet team, and configure transition and field rules.
- Add and publish the validator on every test transition into the target status. Select the time tracking provider for lock tests.

## Scenarios

| ID | Procedure | Expected result |
| --- | --- | --- |
| R01 | A requests a general review; B approves | Inbox progression, decision history and completed general approval |
| R02 | B rejects a new request with a reason | Rejection retained; A can start another request |
| R03 | Edit the issue during general approval | Edit notice and continuing request; A's resubmission replaces the earlier request |
| R04 | A submits worklogs; B approves a selection in the team view | Fixed snapshot, correct lead scope and decision results |
| R05 | Attempt app entry in a submitted/approved period; modify through another permitted route | App entry refused; later detection and resubmission required. Record detection delay |
| R06 | Administrator closes and reopens an unsubmitted test period | App lock and release; past decisions retained |
| R07 | Transition without approval, request approval, B approves, A retries | First transition rejected; approved retry succeeds; Used state shown |
| R08 | Request and approve a field change; separately test conflict and missing edit access | Applied versus unapplied states distinguished; conflicting value not overwritten |
| R09 | D attempts lists, details and exports | Restricted issue data withheld. Leads cannot access another team's submissions |
| R10 | Create/edit/delete worklogs; inspect history and restricted descriptions | Baselines distinguished from changes; description and export visibility enforced |
| R11 | Enable PINs and delegation; decide personally and as delegate | PIN checks, actual actor recorded, issue permissions preserved |
| R12 | Download completed-record Excel and certificate PDF | Files readable and content verified. Use disposable data for deletion tests |
| R13 | Optional: install Workforce, configure keys and compare approval/publication | Verified integration and delays; local settings used when integration is disabled |
| R14 | Prepare a separate open, unsubmitted period → require worklog pre-approval and select allowed/default flows → A submits a draft → B approves → A registers | No Jira record before approval, automatic flow selection, approver cannot register, one record authored by A. Separately verify repeated clicks, direct create-resolver bypass, policy changes and no retransmission after unknown results |

Record app version, time, account role, request ID and screenshots for each result. Unit-test success does not replace live account verification.

## Limitations to verify

Worklog pre-approval and period locks do not block every entry route. Transition enforcement needs installed validators. Direct field edits are detected after the change. Confirm team-managed support, Preview-module behavior and compatible Workforce versions through live results.

Check public documentation, support, privacy, EULA links and Privacy & Security responses against [Atlassian's listing guidance](https://developer.atlassian.com/platform/marketplace/onboarding-hub/launch/create-your-marketplace-listing-and-link-your-forge-app/). Align documentation with actual behavior under the [approval guidelines](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/).

[Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--13-marketplace-review-guide.md)

## Additional review scenarios: automatic application and certification

Have A submit a new transition request and B approve it; inspect approval and Jira application separately. Live verification must cover requester offline permissions, history actor, REST validator re-entry, required screen field blocking, single concurrent application, zero reposts after UNKNOWN and exact reconciliation evidence. Confirm LEGACY_MANUAL requests never apply automatically. Backend/UI tests do not replace live evidence.

Record a Jira worklog first, request certification as its author with an available flow, then verify VERIFIED. Test invalidation on time, description, visibility changes and deletion, including no automatic restoration after reverting values. Test certification, strict WORKLOG_CREATE approval then manual requester recording, and timesheet period approval separately. Do not claim universal native/REST/automation pre-blocking. Impersonation consent, Forge SQL migrations, five-minute scheduling and team-managed support remain unmeasured live.

## Worklog policy hierarchy

Additional policy tests: site defaults, Workforce locks, Jira project/issue sparse overrides and restored inheritance; allowed tightening and rejected weakening; non-comparable comment locks; identical/lower/equivocating revisions; signature/target/TTL failures; STALE grace and EXPIRED related-write blocking. Verify original-date windows for create/edit/delete, WARN/BLOCK, total limits, period locks and preapproval mode. Confirm retention is site-only and 0 means indefinite. Live Workforce sending, public key provisioning, Forge v042–v045 SQL, Jira properties, UX and latency require separate evidence.
