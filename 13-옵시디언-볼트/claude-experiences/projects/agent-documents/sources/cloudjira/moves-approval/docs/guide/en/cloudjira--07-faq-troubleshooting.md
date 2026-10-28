# FAQ and troubleshooting

## Menus and screens

### I don't see "Request approval" on a page

- Everyone who can read the page sees the item below its title, but **Request approval** in the `•••` menu appears only with **edit permission**.
- Requesting requires edit permission. If the approval dialog has no request button, check your edit permission.
- If an administrator limited approvals to certain spaces, check that this space is an **enabled space**.
- If **Only registered users can use the app** is on, you must be on the approver list or a settings administrator.

### An app screen is blank or shows "Could not load this screen"

Refresh the browser. Right after an app update, a cached screen may need one refresh. If it continues, try another browser or a private window and include the details in your support request.

### The bottom of a macro is cut off

An issue where the stamp box or area macro was clipped at the bottom when names or signature images loaded late has been fixed. If it still looks clipped, you are seeing a cached screen — refresh the page.

### Initials appear instead of profile pictures

When the browser or your organization's security settings block profile images, the app shows initials instead. Functionality is not affected.

## Requests

### My request is not created

| Message | Fix |
| --- | --- |
| An approval request is already open. | Only one request can be open per target. Review or withdraw the existing request. If the existing request is already past its deadline, submitting again automatically expires it and starts the new request. |
| Someone on the approval line cannot view this page. | Change the approver, or grant page and space permission. |
| Only registered approvers can be placed on the line. | Pick someone on the approver list, or ask an administrator to register the person. |
| The approval line is invalid. | Check for empty steps, required approvals exceeding a step's approvers, and steps mixing a group with others. |
| Approvals are not enabled in this space. | Ask an administrator to enable the space. |

### I can't find someone for the approval line

Enter **at least two characters** of the name or account. If there are many matches, only some are shown — type more to narrow them. If an administrator maintains an approver list, people outside it cannot be added.

### I edited the page after requesting

The request continues. To get the edits approved too, select **Resubmit for the new version** in the approval dialog. → [Requester guide](cloudjira--03-requester-guide.md#if-you-edited-the-page-after-requesting)

### The area macro says "Edit and save this area once before requesting approval"

Open the macro in the editor once, save it, and publish the page. Once the area identifier is recorded you can request approval.

### "This page contains duplicate area identifiers"

Copying and pasting an area macro can duplicate its identifier. Delete the later macro, **insert a new one**, move the content into it, and save. A request that was already open still works: when you open it from the approval inbox, it shows the area whose content matches the request.

### I deleted the macro of an area under approval

With nothing left to approve, the request is withdrawn automatically once the page is saved (reason: "The approval region macro was removed from the page."). If you open the request from the approval inbox before that happens, you see its details without the area content. Approve and reject are unavailable, but you can still withdraw it.

## Stamp box

### The stamp box was not added to my page

When you submit with **Add a stamp box to the top of the page** selected in the request form, the app inserts a stamp box at the top of the page. If it did not appear, check the following.

| Cause | Details |
| --- | --- |
| The policy is off | If an administrator turned off **Add an approval stamp box to the top of the page when a request is made** (globally or for the space), the checkbox in the request form starts cleared. You can still select it for each request. |
| The box was cleared | You cleared **Add a stamp box to the top of the page** when submitting. |
| Area approval | Area approvals do not have this checkbox. The same stamp box is attached below the area macro's panel instead. |
| No edit permission | The stamp box is inserted with the requester's permissions. If you cannot edit the page body (for example, because of page restrictions), it cannot be added. |
| Already present | If the page already has a stamp box (for example, from a template), another one is not added. |
| Simultaneous save | If someone else saved the page at the moment you submitted, it cannot be added. |

Even when the stamp box cannot be added, the request proceeds normally without it. To add one yourself, type `/` in the editor and insert the **Moves Approval Stamps** macro.

### The page version went up when I requested approval

That is the automatic stamp box. The app inserts the stamp box at the top of the page with the requester's permissions, so the page version goes up by one and the page history shows the requester with the message "Moves Approval". The approval is based on that new version, so the request is not marked as edited after requesting. If you don't want the version to change, clear **Add a stamp box to the top of the page** when you submit.

### The stamp box says "The page changed after approval"

The page was edited after it was approved, so the current version is not approved. Request approval again if the edits need approval too.

## Decisions

### A request is missing from my inbox

- If an earlier step hasn't finished, it is under **In progress**, not **My turn**.
- Pages you cannot view are excluded from lists.
- Check whether filters are applied (**Clear all**).
- Lists load in batches. Select **Show more** below the list to load the rest.

### There are no approve or reject buttons

- It may not be your turn yet, you may have decided already, or the request may have ended.
- If you see **This request is past its deadline**, decisions are no longer possible. The requester needs to submit again. Even if the approval dialog stays open while the deadline passes, the buttons disappear within 30 seconds.

### I can't select some requests for bulk approval

Requests past their deadline are excluded from bulk approval, and their checkboxes are disabled.

### I approved (or rejected) by mistake

Confirmed decisions cannot be reversed. If the request is still open, ask the requester to withdraw it and create a new request. If it has already ended, create a new request. The earlier decisions and history remain.

### PIN issues

| Message | Fix |
| --- | --- |
| No signature PIN is registered. | Set one under approval inbox → **My signature**. |
| The PIN is incorrect. | Five failures lock it for 15 minutes. |
| The PIN is locked. | Try again in 15 minutes. |
| The PIN must be 4 to 12 digits. | Enter 4 to 12 digits only. |

Changing or removing your PIN requires the current PIN. The app does not provide an administrator PIN reset feature. If you forget your PIN, contact your site administrator and support for guidance.

## Deadlines

### The deadline passed but the request is still in the list

Deadline expiry is handled by a scheduled job that runs **once a day** (the Atlassian platform decides the exact time). A request past its deadline can therefore take up to a day to be cleared from lists. Until then, the inbox and approval dialog show **Overdue**, and the item below the page title shows **⌛ Overdue**.

The outcome is not affected in the meantime:

- The approve and reject buttons disappear, and if anyone tries to decide, the server refuses and expires the request on the spot.
- If the requester submits a new request for the same page, the earlier request expires automatically and the new one starts.

### A due-soon notice arrived earlier than the policy says

Due-soon checks also run once a day. So even if an administrator sets the **Due-soon threshold (hours)** below 24 hours, the notice may arrive up to a day before the deadline. It is sent only once for the same step of a request.

## Approval certificate

### I don't see the Approval certificate (PDF) button

**Approval certificate (PDF)** is next to the title in the approval dialog and appears only for **finished approvals** (approved, rejected, expired, withdrawn, and so on). Open requests don't have it. Anyone who can view the page can download it. If you see "Could not create the certificate", try again shortly.

### I can't search the text in the certificate PDF

Korean text in the certificate body is embedded as images, so it cannot be searched or copied inside the PDF. The **request ID and document fingerprint**, however, are included as text at the bottom of every page and in the PDF document properties (keywords), so you can copy them. The certificate is always produced on white paper, even when you use the dark theme.

### How do I verify the document fingerprint?

The document fingerprint is the SHA-256 value of the **approved version**'s body in Confluence's document format (ADF). Confluence never changes the content of a past version, so if you fetch the same version again and get the same value, the content the certificate refers to is unchanged.

1. Find the **Page ID** and **Approved version** on the certificate.
2. Using an account that can view the page, call the Confluence REST API `GET /wiki/api/v2/pages/{Page ID}?version={Approved version}&body-format=atlas_doc_format`.
3. Compute SHA-256 over the `body.atlas_doc_format.value` string from the response **exactly as returned** (UTF-8).
4. Compare the result (hexadecimal) with the **Document fingerprint** on the certificate.

For an area approval, the fingerprint still covers the whole page version that contains the area. If the body of that version could not be read when the certificate was created, the certificate shows "The body of this version could not be read, so no fingerprint was computed." and omits the fingerprint.

## Data management (administrators)

### I can't delete records past the retention period

If you see "Export the records past the retention period to Excel before deleting them.", first select **Export to Excel** under settings → **Data management** → **Approval record retention**.

- An export is recorded only after the file has actually been downloaded. If your browser blocked the download, export again.
- Deletion covers **only the range you last exported**. If you see "N more records passed the period since the last export", export again to delete those records too.
- Deletion cannot be undone. Deleting a request also deletes its approval line, audit history, inbox entries, and related notifications.
- Open requests are never subject to the retention period.

### Storage shows "Warning" or "Critical"

Settings → **Data management** → **Storage** shows how much storage the app uses. At 80% or more it shows **Warning**, and at 90% or more **Critical**. When the limit (based on 1 GiB) is reached, new approvals can no longer be saved, so export and then delete approval records past the retention period to free up space. Sizes and row counts per table are estimates from database statistics. After cleaning up, select **Refresh** to check again.

## Notifications

### I don't receive email

The app does not send email itself. In-app notifications are the default, and when an administrator turns on **Also notify through Confluence**, the app leaves an @mention comment on the page. Email arrives only when Confluence sends that mention according to your Confluence notification settings. Due-soon notices, reminders, and expiry are in-app only.

### Comments keep appearing on my page

That is the **Also notify through Confluence** policy. An administrator can turn it off in the global policy or per space.

### Old notifications have disappeared

In-app notifications are deleted automatically after 180 days. The approval outcome and history remain in the audit timeline of the approval dialog.

## All error messages

| Message | Meaning | What to do |
| --- | --- | --- |
| You cannot perform this action. | No permission for this action | Contact a Confluence administrator |
| You cannot view this page. / You cannot edit this page. | Missing page permission | Ask a space administrator |
| Only administrators can use this feature. | No access to settings | Ask a Confluence administrator or settings administrator |
| Only registered users can use this app. | Access restriction is on | Ask a settings administrator to register you |
| The app license is not active. | License expired or inactive | Ask a site administrator to check the license |
| The app license status is unavailable. | Temporary check failure | Try again shortly |
| The approval target is unavailable. | Page moved or deleted, or the screen is stale | Refresh and try again |
| The approval request could not be found. | Stale list, or deleted by retention cleanup | Refresh the list |
| This approval request has already ended. | Ended by another decision, withdrawal, or expiry (including an attempt to decide after the deadline) | Check the latest state |
| Another user changed this request first. | Decisions arrived at the same time | Refresh and try again |
| Enter a reason for rejecting the request. | Reason-required policy | Enter a reason |
| An administrator has turned delegation off. | Delegation not allowed | Contact an administrator |
| Export the records past the retention period to Excel before deleting them. | Tried to delete records that were not exported | Select **Export to Excel**, then delete |
| The app storage is still being prepared. | Right after install or update | Try again shortly |
| The app could not retrieve required information from Confluence. | Confluence did not respond | Try again shortly |
| The app storage failed to process the request. / An unexpected error occurred. | Temporary error | Try again. If it continues, an administrator should check storage under **Data management** and contact support |

## Information to include in a support request

- URL of the affected page (or the inbox screen)
- When it happened, with time zone
- Your role (requester, approver, Cc, administrator)
- The exact message shown, or a screenshot
- Steps to reproduce and what you expected
- Your browser
- For questions about an approval certificate, the request ID on the certificate

Please share personal data only as far as needed to solve the problem.
