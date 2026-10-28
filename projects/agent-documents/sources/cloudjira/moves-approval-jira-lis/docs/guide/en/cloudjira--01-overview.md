# Overview and key concepts

Moves Approval for Jira is an approval app for Jira Cloud. Its inbox brings requests, decisions and change records together while respecting Jira issue permissions. It is a separate app from the Confluence approval product.

## Six approval types

| Type | What is approved | What happens next |
| --- | --- | --- |
| General issue approval | An issue review | No automatic transition or edit lock. Check edit notices and resubmit if needed. |
| Post-entry worklog certification | The time, description and visibility fingerprint of a worklog already stored in Jira | Approval sets `VERIFIED`; an observed source edit or deletion changes it to `CHANGED_AFTER_VERIFICATION`. |
| Worklog draft pre-approval | An unsaved worklog draft created in the app | This is an optional high-control mode. The requester still registers it in Jira after approval, and it does not block direct REST or automation entries. |
| Timesheet | One user's monthly or weekly submission | Changes to the underlying worklogs require resubmission when detected. |
| Transition approval | Moving an issue to a target status | New requests automatically apply as the requester after approval. LEGACY_MANUAL requests remain manual. Enforcement requires a validator on that transition. |
| Field change approval | Current value → proposed value for a governed field | The change is applied with the final approver's Jira permissions. Check approval and application separately. |

General, transition and field change approvals are separate requests. A completed general review does not satisfy a transition approval requirement.

## Approval lines and states

An approval line contains ordered steps. Each step advances according to its assigned approvers and completion rule. The next step starts after the previous step completes. Being a Cc recipient alone does not permit a decision.

A required approval count of one allows one person in the step to approve it. A count equal to the number of approvers requires everyone. For example, a count of two in a three-person step requires two approvals. Rejection in a step rejects the request.

Pending requests can become approved, rejected, expired or cancelled. Start a new request instead of modifying a completed decision. Custom status labels do not change the rules.

## Roles

Requesters submit and track requests. Approvers decide on their turn. Team leads review submissions from the teams they lead. Jira administrators and app settings managers manage global settings; project administrators manage their project's approval rules. None of these roles replaces Jira issue visibility permissions.

Next: [Installation](cloudjira--02-installation.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--01-overview.md)
