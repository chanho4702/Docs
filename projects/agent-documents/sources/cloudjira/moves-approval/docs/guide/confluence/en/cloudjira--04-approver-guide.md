# Approver guide

[English Guide](cloudjira--00-index.md) · [한국어](../ko/cloudjira--04-approver-guide.md)

> For: approvers on an approval line, and delegates deciding on someone's behalf

## Find what is waiting on you

You can learn about new approval work in any of these places:

- **In-app notifications** — When a request is created, every approver on the line receives "{requester} requested approval for {page}." If you are in a later step, you then wait until the earlier steps finish.
- **Confluence notifications** — If an administrator enabled them (on by default), you are @mentioned in a comment on the page **when your step starts**. Confluence delivers it according to your Confluence notification and email settings.
- The Moves Approval summary in the right panel of **Confluence home**
- The **approval inbox** — top **Apps** → **Moves Approval** → **My turn** tab

If an earlier step has not finished, the request appears under **In progress** and no decision buttons are shown ("It is not your turn yet").

## The approval inbox

| Tab | Contents |
| --- | --- |
| My turn | Requests waiting for your decision (or for someone who delegated to you) |
| In progress | Requests you are on, waiting for an earlier step |
| My requests | Approvals you requested |
| Handled | Requests you already decided |
| Cc | Requests you were copied on |

- **Filters** — status, page title, space, requester, requested date (today, last 7 days, last 30 days, or a custom range), deadline (due soon only, overdue only, no deadline), and my turn only.
- **Deadline badges** — In the deadline column, `D-2` within three days, **Due today** on the day, and **Overdue** after the deadline. Approval details show the same badge.
- **Page names** — A page name is a link. Select it to go to that page; Ctrl-click (Cmd-click on Mac), Shift-click, or middle-click opens it in a new tab. Selecting anywhere else on the row opens approval details. Page names in the notification list work the same way.
- **Working with tables** — Drag a column header border to resize the column; double-click it to reset. Below the list you see "Showing N"; if there is more, select **Load more** to continue.
- **Export to Excel** — Export up to **5,000 accessible requests** matching the current tab and filters. The export can include items not yet loaded on screen. It contains the request list, not a complete backup of individual decisions and audit history.
- Lists show only pages you can view, so a tab's count (taken before permission filtering) can be higher than the rows you see.

> **Screenshot placement · 08-inbox**
>
> My turn with filters, deadlines, and export
>
> File: `ma-08-inbox-en.png` · Alt text: My turn with filters, deadlines, and export
>
> Insert an actual product screenshot here.

## Approve

1. Select a request to open **Approval details**. Selecting the item below a page title, or **Open approval details** in the page's stamp box, opens the same dialog.
2. Review it:
   - **Request note**, **Progress** (which step is active), and **Approval order and decisions**
   - If you see **The page changed after this request**, use the **View changes** link to compare the requested version with the current one. The request is for the version it was made against.
   - For area approvals, a preview of the area's text (check images, attachments, and other macros on the page)
3. Select **Approve**. If your site requires a PIN, enter your **Signature PIN**.

When your step has the approvals it needs, the next step opens. When the last step finishes, the request is **Approved**.

> Buttons in the approval dialog always stay in the same place: **Cancel** and **Back** at the far left, and action buttons such as **Approve** and **Reject** at the far right. Even on an empty or error screen, the button at the far left closes the dialog.

> **Screenshot placement · 09-decision**
>
> Reviewing a request before approval or rejection
>
> File: `ma-09-decision-en.png` · Alt text: Reviewing a request before approval or rejection
>
> Insert an actual product screenshot here.

## Reject

1. In approval details, select **Reject**.
2. Enter the **Reason for rejecting** (required by default policy). The requester sees it.
3. Confirm, entering your PIN if required.

> Rejecting **ends the request immediately**. It does not wait for other approvers in the step or for later steps.
>
> If Confluence notifications are on, the rejection is also posted as a page comment that page readers may see. Do not put sensitive information in the reason.

## Approve several at once

On the **My turn** tab, select items with the checkboxes and choose **Approve N selected**.

- Up to **50** items per batch.
- If your site requires a PIN, you enter it **once per batch**.
- Requests past their deadline are excluded from batch approval, and their checkboxes cannot be selected.
- The result reads "Approved N · failed M." Review failed items individually (for example, someone decided first or the deadline passed in the meantime).
- Rejections are not batched, because each needs its own reason.

> **Screenshot placement · 10-bulk**
>
> Bulk approval selection and results
>
> File: `ma-10-bulk-en.png` · Alt text: Bulk approval selection and results
>
> Insert an actual product screenshot here.

## Requests past their deadline

After the deadline, approval details show **This request is past its deadline** and the approve and reject buttons disappear. If the dialog stays open across the deadline, this takes effect within 30 seconds. Even if a decision is sent from a screen opened just before the deadline, the server refuses it and expires the request on the spot, so no approval or rejection can happen after the deadline.

- Expiry is processed once a day in the background, so it can take up to a day for the request to be cleaned up as **Expired** in lists. Until then, it shows as **Overdue** in the inbox and as "⌛ Overdue" in the item below the page title.
- If it is still needed, the requester must request approval again. When the new request is made, the earlier request past its deadline expires automatically.

## Stamp box and stamps

If the requester added a **stamp box** to the page (automatically at request time, or placed in advance from a template or the editor), you can follow the approval on the page like a paper approval form.

- Each cell shows the **step name** at the top ("Step N" if the step has no name), the **stamp** in the middle, and the **approver's name and decision date** at the bottom. The step whose turn it is has a highlighted header.
- Stamps
  - **Approved** — a round seal. If you registered a signature image under **My signature**, that image is stamped instead.
  - **Rejected** — a square "Rejected" seal
  - **Pending** — a dotted circle
  - Cells decided by a delegate are marked "(proxy)".
  - If an administrator turned off signatures and stamps, text is shown instead of a stamp.
- If the page is edited after approval, the stamp box shows "The page changed after approval — the current version is not approved."
- **Open approval details** in the stamp box opens the approval dialog.
- For area approvals, the same stamp box is attached below the area panel. Use **Show stamps** / **Hide stamps** to expand or collapse it (expanded by default).

## Approval certificate (PDF)

For a finished approval (Approved, Rejected, Expired, Withdrawn, and so on), select **Approval certificate (PDF)** next to the title in approval details to download a certificate. The button does not appear for requests still in progress. Anyone who can view the page can download it.

- **Contents** — document, space, page ID, target (whole page or region in the page), status, requester, requested and closed dates, request note, the approved version and the current version (whether they match or the page changed after approval), **Approval stamps**, **History** (time, event, by, reason), **Document fingerprint**, and the issue date, issuer, and request ID.
- **Document fingerprint** — The SHA-256 of the approved version's page body. Past Confluence versions do not change, so if you later recompute it from the same version and get the same value, the content the certificate refers to is unchanged. If that version's body cannot be read, the certificate is issued without a fingerprint.
- Korean text is embedded in the PDF as images, so it cannot be searched or copied. The request ID and fingerprint appear as text at the bottom of every page and in the PDF document properties (keywords), so they can be copied.
- The certificate is always produced on white paper, even if you use a dark theme.

## My signature and signature PIN

Set these up under **My signature** in the approval inbox.

- **Signature** — **Draw your signature**, or **Upload image** (PNG or JPEG, up to 2MB). It is stamped next to your decision in the **Approval order and decisions** table and in the page's stamp box. Without one, an **automatic name stamp** is used. Stamps are shown 32px tall in the table, so wide signatures read best.
- **Signature PIN** — 4 to 12 digits. If an administrator turned on "Require the signature PIN to confirm approvals and rejections," you must set one before deciding.
  - Five failures lock it for 15 minutes.
  - Changing or removing your PIN requires the current PIN. The app does not provide an administrator PIN reset feature. If you forget your PIN, contact your site administrator and support for guidance.

> **Screenshot placement · 11-signature**
>
> My signature and PIN settings
>
> File: `ma-11-signature-en.png` · Alt text: My signature and PIN settings
>
> Insert an actual product screenshot here.

## Delegation (when you are away)

If an administrator allows delegation, set it up under **My delegation** in the approval inbox.

1. Choose a **Delegate**.
2. Enter **Starts** and **Ends** dates, and optionally a **Note**, then save.
3. To end it early, select **Remove delegation**.

During that period your delegate can decide on requests that are your turn. The approval table records **your name**, and the person who actually decided is shown alongside as "On behalf · {delegate}."

> **Screenshot placement · 12-delegation**
>
> Delegate and delegation dates
>
> File: `ma-12-delegation-en.png` · Alt text: Delegate and delegation dates
>
> Insert an actual product screenshot here.

## If you are a delegate

**People who delegated to me** on the **My delegation** screen shows who delegated to you. During the delegation period, their turns appear in your **My turn** tab tagged `For: {name}`. Approve or reject them as usual.

## Common messages

| Message | Meaning and fix |
| --- | --- |
| It is not your turn yet. | The request moves to **My turn** when the earlier step finishes. |
| You already decided on this request. | Refresh to see the latest state. Decisions cannot be changed. |
| This approval request has already ended. | It ended through another approver's rejection, a withdrawal, or expiry. You also see this when you send a decision on a request past its deadline. |
| Another user changed this request first. | Another decision arrived at the same moment. Refresh and try again. |
| No signature PIN is registered. | Set one under **My signature** first. |
| The PIN is locked. | Try again in 15 minutes. |

> Confirmed decisions cannot be reversed. If the request is still open, ask the requester to withdraw it and create a new request. If it has already ended, create a new request. The earlier decisions and history remain.

## Related guides

- [Overview and key concepts](cloudjira--01-overview.md)
- [FAQ and troubleshooting](cloudjira--07-faq-troubleshooting.md)
- [Marketplace review guide](cloudjira--09-marketplace-review.md)
