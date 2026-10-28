# Manage approval groups

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-groups.md)

Create a group that occupies one approval step. Choose whether everyone must approve or any one member can pass the step.

**Location:** Settings → **Approval groups**.

## Register a group

1. In the registration dialog, choose **Confluence group** or **Custom**.
2. Select a Confluence group, or name a custom group and add its members.
3. Enable the passing rule for everyone to approve; disable it for any one member. Check this against your process.
4. Enable visibility in approval-line search if requesters should select it, then save.
5. Inspect the members and select the group as one step in a new request form.

## Group behavior

| Item | Action | Check |
| --- | --- | --- |
| Confluence group | Membership is managed in Confluence | Inspect current membership. |
| Custom group | Members are chosen in the app | Check inactive accounts and similar names. |
| Passing rule | All members or any one | A group cannot share a step with other selections. |
| Hide from search / delete | Removes it from selection for new requests | Requests already using it remain. |

After changing a group, inspect the expanded approvers in a new request. Do not assume an existing request changed because a group name is the same. Cc groups have a different role; see [Cc and notifications](cloudjira--notifications.md).
