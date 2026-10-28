# Manage approval lines

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-lines.md)

Save a reusable approval order so requesters can select it at once, such as `Technical review → Owner approval`.

**Location:** Settings → **Approval lines**.

## Create a line

1. Select **Add approval line** and enter its name and description.
2. Choose the first-step approvers, add subsequent steps, and arrange their order.
3. Review step names and required counts. A group must occupy its step alone.
4. Set the default deadline, spaces, and enabled status, then save.
5. On a page in a target space, open **Request approval → Use an approval line** and select the new line. Verify its steps and deadline.

## Fields

| Field | Condition | Check |
| --- | --- | --- |
| Name | Required; up to 255 characters | Make its purpose recognizable. |
| Description | Optional | Explain applicable documents or situations. |
| Default deadline | 1–365 days; blank uses the target space policy, or the global default if no override exists | It is days after requesting, not a fixed date. |
| Steps | Approvers, order, and required count | Steps open in order; empty steps are invalid. |
| Spaces | Empty means all | Selected spaces restrict where the line is offered. |
| Enabled | Controls selection for new requests | Existing requests remain when disabled. |

## After editing or deleting

Requests keep a copy of the line from creation time. Editing or deleting the saved line does not change an open request's people or order. Check new defaults in a new request form and existing requests in their own details.

For a missing line, check enabled status → spaces → approver registration and page access. Manage membership under [approval groups](cloudjira--admin-groups.md).
