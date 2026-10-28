# FAQ and troubleshooting

| Symptom or question | Check and action |
| --- | --- |
| App unavailable | Check installation, license, restricted access and roster/team membership |
| Request missing from inbox | Check sidebar view, filters, period, decision turn and issue visibility |
| General approval completed but transition blocked | Transition approval is separate. Check target/current status, validator and Jira conditions |
| Transition succeeds without approval | Check the validator on that transition, project scope, rule and global enforcement |
| Approved issue has not moved | Check Jira application status and cause in Details. Only LEGACY_MANUAL requests require manual transition |
| REST changed a locked-period worklog | Pre-write blocking on other routes is not guaranteed. Check detection and resubmit |
| Log work or Work log missing | Check the site's provider and user permissions |
| Approved worklog missing from Jira | The requester must register the approved draft. Check registration state, worklog permission and period locks |
| Cannot select a pre-approval flow | Check project allowed/default flows and issue edit permission. Users cannot disable required approval |
| Unknown worklog registration result | Avoid registering the same content again; reconcile and contact support. No search match does not prove no registration |
| Timesheet submission unavailable | Check team/lead, period start, empty-submission policy, guardrails and exception group |
| Team member missing | Check teams you lead, active membership and issue visibility |
| Approved field unchanged | Check application status, actor edit permission, edit screen and allowed value |
| Field value conflict | The current value is not overwritten. Submit a new request from it |
| PIN locked | After five failures, wait 15 minutes before retrying |
| No Jira comment or email | Check transition comment policy, Add comments permission and Jira delivery settings. In-app notifications are separate |
| Workforce display delayed | Check keys, enablement and publication status; republish if needed |
| History missing | Check collection start, project scope, policy, visibility and event/reconciliation delays |
| Need to edit a rejected or expired decision | Start a new request instead |

## Request support

Include the environment and app version, time and time zone, request ID or issue key, reproduction steps, displayed error code, and expected versus actual result. Redact sensitive messages and descriptions. Never send PINs, signing keys or authentication tokens.

Ask your site administrator about configuration and permissions first. Report product defects through the supplier support channel linked from Marketplace. Before public release, contact the person who provided this documentation. Response times and coverage follow the finalized support policy.

[Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--12-faq-troubleshooting.md)

## Approved but Jira status did not change

Approval and automatic application of new transition requests are separate. Check Jira application status and code in Details. WAITING can await the batch; FAILED/BLOCKED can indicate permissions, rules, state or required input. Never resend UNKNOWN; reconcile instead. Current target status alone is insufficient evidence. Only LEGACY_MANUAL requests require a manual Jira transition after approval.

## Is worklog certification obtained before saving?

Certification approves the fingerprint after Jira recording. Optional strict WORKLOG_CREATE preapproval is separate: approval first, then manual recording by the requester. Changes to time, description or visibility, or deletion, invalidate certification; restoring values still requires a new certification. Period timesheet approval is also separate. Native/REST/automation writes are not universally blocked before recording.

## Worklog policy hierarchy

If effective policy differs from a saved value, inspect source, lock and ignored overrides. Restore inheritance by unchecking override, not by saving null. POLICY_CONFLICT requires a fresh revision. For signature errors check public key/kid/trustedKids; for target mismatch check cloud/project/issue; for expiry publish a new expiry and revision, then refresh. Failed candidates do not remove the verified cache, so last failure and current effective value may differ. Expired locks beyond grace block related writes; unlocked keys fall back. Project/issue retention is unavailable; site retention 0 means indefinite.
