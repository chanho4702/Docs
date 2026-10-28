# Quick start — approve your first page

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--quick-start.md)

Use this walkthrough to send a test page through two approval steps. The requester submits the page, a reviewer and a final approver decide in order, and the requester checks the result. On a newly installed site, complete [Administrator setup](cloudjira--admin-setup.md) first.

## Before you start

| Item | Example | Check |
| --- | --- | --- |
| Page | Operating procedure — review copy | A published Confluence page that the requester can edit. |
| Requester | Author A | Needs page edit permission and access to the app. |
| Approvers | Reviewer B and owner C | Both must be able to view the page. |
| Order | Step 1 B → Step 2 C | Put the two people in separate steps. |
| Deadline | A future time that allows review | Choose a real deadline rather than copying an example date. |

## 1. Submit the page

1. Open the published test page and select **Request approval** below its title.
2. Under **Pick approvers**, add B to the first step. Select **Add step** and add C to the second.
3. Name the steps `Content review` and `Final approval`. Check that each requires one approval.
4. Enter a deadline and a request note, such as `Please review the procedure and ownership details.`
5. To show progress in the page, select **Add a stamp box to the top of the page**, then submit the request.
6. Check the target version and first-step status. Inserting a new stamp box increases the page version by one.

## 2. Decide in order

1. B opens Confluence **Apps → Moves Approval → My turn**.
2. Open the request row, review the page, request note, and target version, then select **Approve**. If the site requires a PIN, set up [My signature and PIN](cloudjira--signature-pin.md) first.
3. Check that B's decision is recorded and C's step is now open.
4. C opens the request under their own **My turn**, reviews it, and approves. C cannot decide before the first step is complete.

## 3. Check the result

Reopen the page and check the stamp box and status below the title. In approval details, check both people and decision times. Download an [approval certificate PDF](cloudjira--certificate.md) if needed.

| Completion check | Expected result |
| --- | --- |
| Order | B decided before C. |
| Final status | Approved. |
| Version | The approved version is identified. |
| History | Both decisions and times are recorded. |

Editing the page after approval does not approve the new version. See [Changes, withdrawal, and resubmission](cloudjira--history-resubmit.md).

## If you cannot continue

- If B cannot find the request, check the tab, filters, and page view permission.
- If C has no decision buttons, check whether the first step has finished.
- If the request was rejected or expired, create a new request rather than reopening the finished request.
- A request may exist even if a stamp box is missing. Check approval details before submitting again.
