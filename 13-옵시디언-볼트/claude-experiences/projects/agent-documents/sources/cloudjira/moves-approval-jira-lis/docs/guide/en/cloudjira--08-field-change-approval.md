# Field change approval

Changes requested through the app are applied after approval. **Direct Jira edits, REST and automation changes are detected and logged, not blocked before editing.**

## Configure rules

Project administrators select the issue type, field and flow under **Project settings → Moves Approval → Field change approval rules**. Supported types are date, user, priority, number and single select. Multi-value, text, rich text, date-time and cascading fields are outside the supported scope. Use transition approval for status and resolution.

## Request and apply

1. Open **Request change** for the governed field in the issue's **Field change approvals** area.
2. Check the current value and proposed value or clear-value option. Enter a reason, deadline and Cc recipients.
3. Submit using the rule's approval line.
4. After final approval, check **both approval and application status**.

| Application status | Meaning and action |
| --- | --- |
| Applied | Jira value updated |
| Approved · not applied | Check edit permissions, edit screen and Jira response; use Apply again from details |
| Value conflict · not applied | The current value changed after the request. Nothing is overwritten; start a request from the current value |
| Applying or waiting | Recheck details shortly. Bulk approval can defer application |

The final decision applies the change with the approver's identity and permissions. A later retry records the actual applying user as the Jira editor. Successful approval does not guarantee successful application. The requester, this request's approvers (including delegated actors), or a Jira administrator can retry; the person applying needs Jira edit permission.

## Jira permissions and direct changes

To restrict direct editing, an administrator can adjust **Edit work items** for requester roles while keeping required approver permissions. This affects other editing tasks; verify in a test project first. Removing the field from the edit screen also prevents the app from applying it.

Deleting a rule changes future detection and governance while leaving open requests in place. Review bypass history for expired requests and overwritten approved values.

[Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--08-field-change-approval.md)
