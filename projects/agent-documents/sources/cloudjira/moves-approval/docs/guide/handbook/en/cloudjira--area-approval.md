# Area approval

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--area-approval.md)

Approve only part of a page, such as a contract clause or review table. An area request is separate from approval of the whole page.

## Preparation and location

With page edit permission, add a **Moves Approval Region** macro. Put the content inside it and publish the page, then use **Request area approval** in that area.

## Create an area and request approval

1. In the page editor, use `/` or the insert menu to add **Moves Approval Region**.
2. Move the content to review inside the macro. Content outside it is not the target of this area request.
3. Publish the page. If prompted to edit and save the area once, edit the macro, save it, and publish again.
4. Open **Request area approval** in that area and choose steps, approvers, and a deadline.
5. Check that area's status and stamp box. Confirm the target rather than relying on the status of the whole page or another area.

## Controls and changes

| Item | Meaning and use | What to check |
| --- | --- | --- |
| Area content preview | Review the text in approval details | Also inspect images, attachments, and other macros on the source page. |
| Show / hide stamp box | Expand or collapse progress below the area | Distinguish it from the page-level stamp box. |
| Content changed | The area has changed since the approval baseline | Editing alone does not close the request. |
| Delete the area | Remove the macro from the page | The area's open request is withdrawn automatically. |

## Completion and troubleshooting

Each area should display its own request and status. Create a fresh macro for each additional area. If copied macros cause a duplicate area identifier message, remove the duplicate and insert a new macro.

If no request button appears, check publication → initial macro save → edit permission → enabled space. See [changes and resubmission](cloudjira--history-resubmit.md) when changed content needs a new approval.
