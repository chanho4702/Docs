# Requester guide

> For: people who need their content approved (page editors)

## What you need

- **Edit permission** on the page
- The page must be in an **enabled space** (if an administrator limited approvals to certain spaces)
- If "Only registered users can use the app" is on, you must be on the approver list or a settings administrator
- Every approver must be **able to view** the page (default policy)

## Request page approval

1. Open the **published** page you want approved.
2. Select the **Request approval** item below the page title. You can also use **Request approval** in the `•••` menu.
3. In **Request page approval**, set up the approval line in one of two ways:
   - **Pick approvers** — Search by name or account and add approvers. Use **Advanced search** to select many people at once. Switch **Search approvers in** to **Groups** to add an approval group as one step.
   - **Use an approval line** — Choose a line registered by an administrator; its steps and approvers are filled in for you.
4. Refine the steps (when picking approvers yourself):
   - **Add step** adds a step; **Move up** / **Move down** reorders them.
   - An optional **Step name** makes the pending status read like "Legal review".
   - **Approvals required to pass this step** sets rules such as "2 of 3 must approve".
   - A group must be the only selection in its step; you cannot mix it with other people or groups.
5. Fill in the optional fields:
   - **Deadline** — Prefilled from the policy default (for example, 7 days after the request). Leave it empty for no deadline. You can set a time (HH:MM) as well.
   - **Cc** — People or groups who can view and get notified only. Groups are expanded to their members when saved.
   - **Request note** — What approvers should know (up to 500 characters).
   - **Add a stamp box to the top of the page** — Inserts the stamp box macro with the request. It is pre-checked according to the administrator's policy (on by default), and you can turn it off for this request only. See [Adding the stamp box automatically](#adding-the-stamp-box-automatically) below.
6. Select **Request approval**.

When the request is created, approvers on the line and Cc recipients get an in-app notification (if Confluence notifications are on, step 1 approvers are also @mentioned in a page comment), and the item below the title changes to `⏳ Pending approval · Step 1 of N in progress`.

### Adding the stamp box automatically

If you request approval with **Add a stamp box to the top of the page** checked, the **Moves Approval Stamps** macro is added to the top of the page, so anyone who opens it sees the steps, approvers, and stamps right away.

- **The page version goes up by one.** The page is edited with your own permissions, so the page history shows the change under your name with the version message "Moves Approval". The request is made against that new version, so it does not immediately show "The page changed after this request".
- If the page already has a stamp box, no new one is added (and the version does not change).
- If the stamp box cannot be added (for example, you lost edit permission or someone else saved the page in the meantime), **the request still goes ahead without it.** Add one yourself as described below if needed.
- Area approval requests do not have this option. Area approval boxes come with their own stamps.

### Inserting the stamp box yourself or in a template

You can insert the stamp box at any time.

1. Edit the page, insert **Moves Approval Stamps** with the `/` command or the **+** menu, and publish. Place it anywhere you like.
2. While there is no request yet, the stamp box shows "No approval request yet." and a **Request approval** button (if you can edit the page). You can request approval from there.
3. For document types that always need approval, **put the stamp box in the page template.** Pages created from the template already have one, so requesting approval adds nothing and does not raise the version.

To read a stamp box, see [Cc recipient and viewer guide — Reading the approval stamps on a page](cloudjira--05-cc-and-viewer-guide.md#reading-the-approval-stamps-on-a-page).

## Request approval for part of a page (area approval)

Use the **Moves Approval Region** macro when only part of a page needs approval.

1. Edit the page and insert **Moves Approval Region** with the `/` command or the **+** menu.
2. Put or move the content to approve **inside** the macro.
3. **Publish the page.** A newly inserted area may show "Edit and save this area once before requesting approval." Edit the macro once and save it to record the area identifier.
4. On the published page, open **Request area approval** in that area and set up the approval line the same way as for a page.

Good to know:

- Each area has its own request and status. A page can contain several areas.
- If an area's content changes, the area shows **Content changed**, but the request continues.
- **Deleting** the macro automatically **withdraws** that area's open request.
- Copying and pasting the macro can duplicate its identifier. If you see "This page contains duplicate area identifiers, so approval is blocked," delete the later macro and insert a new one.
- The approval dialog previews the area's text. Images, attachments, and other macros are omitted from the preview — check them on the page.
- Once requested, the area's approval stamps appear at the bottom of the area approval box. Use **Hide stamps** / **Show stamps** to collapse or expand them (expanded by default).

## Follow progress

- **On the page** — If the page has a stamp box, stamps appear in it as decisions are made. Select the item below the title, or **Open approval details** in the stamp box, to see the **Progress** stepper, the **Approval order and decisions** table (who decided when, with signature stamps), and the **Audit timeline**.
- **In the inbox** — The **My requests** tab in the approval inbox lists every request you created. Select a document name to go to that page (Ctrl/Cmd/Shift-click or middle-click opens a new tab); select anywhere else in the row to open the approval dialog.
- **Deadline** — From three days before the deadline, a badge such as `D-3` or `Due today` appears in the approval dialog and in the inbox deadline column; once the deadline passes it changes to `Overdue`.
- In-app notifications tell you about final approval, rejection, and expiry.

## Withdraw a request

To cancel an open request, select **Withdraw request** in the approval dialog and optionally add a **Reason for withdrawing** (up to 200 characters).

- Only the requester and Confluence administrators can withdraw.
- Withdrawing voids all decisions collected so far and **cannot be undone.**

## If you edited the page after requesting

Editing does not stop the request. Instead, the approval dialog shows **The page changed after this request** (for example, requested against v5, now v7) with a **View changes v5 → v7** link.

- If the edits need approval too, select **Resubmit for the new version**. The earlier request closes and a new one starts for the current version. The approval line is carried over, but **review the deadline, Cc, and request note again.**
- Resubmitting for a new version requires current edit permission on the target page. This also applies to the original requester.
- Decisions and history from the earlier request stay in **Approval history by version**.

## If you edited the page after approval

An approval applies to the **version** that was approved. If the page is edited afterward, the dialog shows "Approved at v5 · current version not approved." Create a new request if the current version needs approval; the previous approval line is prefilled for reuse.

## If the request was rejected or expired

- **Rejected** — Read the reason in the dialog or notification, update the page, and create a new request.
- **Overdue** — The deadline has passed, but the request has not been expired yet. The app expires overdue requests once a day, so it can look like this for up to a day (the item below the title reads `⌛ Overdue`). From this point approvers can no longer approve or reject it.
- **Expired** — The deadline passed and the request closed. Create a new request if it is still needed.
- **Requesting again after the deadline** — When you request again, the overdue earlier request is expired automatically and the new request starts. Once the deadline passes, the approval dialog shows the **Request approval** button even before the request is expired. If you edited the page, you can also use **Resubmit for the new version**.

## Common messages

| Message | What to do |
| --- | --- |
| An approval request is already open. | Only one request can be open per target. Review the existing request, or withdraw it and request again. |
| Someone on the approval line cannot view this page. | Remove that approver, or grant them page and space view permission, then request again. |
| Only registered approvers can be placed on the line. | An administrator maintains an approver list. Pick someone on the list or ask to be registered. |
| Approvals are not enabled in this space. | Ask an administrator to enable the space. |
| The approval line is invalid. | Check for empty steps and make sure required approvals do not exceed the number of approvers in a step. |

For more, see [FAQ and troubleshooting](cloudjira--07-faq-troubleshooting.md).
