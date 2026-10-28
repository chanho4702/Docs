# Global policy and status labels

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-policy.md)

Set site-wide request defaults, notifications, and decision confirmation rules. Use [space policies](cloudjira--admin-spaces.md) for request defaults such as deadlines. PIN, delegation, and signature behavior currently follow global policy.

**Location:** Settings → **Global policy**.

## Change policy

1. Select a state in **Approval status flow**. Its meaning, display name, and related policies appear on the right.
2. Under **Pending (PENDING)**, set the default deadline, due-soon threshold, in-app and Confluence notifications, and reminder schedule. Under **Rejected (REJECTED)**, set whether a rejection reason is required.
3. Below the flow, use **Approval flow** for PIN, signature display, delegation, and automatic stamp insertion. Use **Access and permissions** for registered-user access and approver page checks. Prepare users to register a PIN before requiring one.
4. Review all changes and select **Save policy** at the bottom. Confirm the success message, then reopen the screen to check persistence.
5. Open a new request to inspect the default deadline and stamp option. Existing request deadlines and approval lines do not change retroactively.

Selecting or moving a state node does not save policy. Changed text fields and toggles are saved together with **Save policy**.

## Requests and decisions

| Setting | Default | Use and effect |
| --- | --- | --- |
| Default deadline | 7 days | New-request default; 0 means no deadline. Requesters can change it. |
| Rejection reason required | On | A reason is needed to confirm rejection. |
| Verify approver page access | On | Rejects creation if an approver cannot view the page. |
| Add stamp box automatically | On | Default for the page-request insertion option. |
| Show signatures and stamps | On | Controls their presentation in decisions and stamp boxes. |
| Require signature PIN | Off | Users must register a PIN before deciding when enabled. |
| Allow delegation | Off | Saved delegations have no effect while disabled. |

## Notifications and access

| Setting | Default | Use and effect |
| --- | --- | --- |
| In-app notifications | On | Controls inbox notification creation. |
| Confluence notifications | On | Creates @mention comments on the target page. |
| Due-soon threshold | 24 hours | Daily checks can notify up to a day early even with a shorter threshold. |
| Reminders | Off; first 3 days, repeat 3 days | In-app notices to current-step approvers. |
| Registered users only | Off | Enable after registering users and administrators. Applies site-wide. |

## Status labels

Select a state in the diagram, then enter an organization-specific name in the **status-code label** field on the right. The diagram and panel title preview the new name before saving. Leave the field empty for each user's language default. Custom names are not translated automatically; each label accepts up to 80 characters.

**Approved (APPROVED)**, **Expired (EXPIRED)**, and **Withdrawn (CANCELLED)** are terminal states, so only their display names are editable in this panel. Labels do not change approval, rejection, or withdrawal rules. Set review-step names in [approval lines](cloudjira--admin-lines.md).

Check saved changes in **Change log**. If only one space differs, inspect its overrides before repeatedly saving the global policy.
