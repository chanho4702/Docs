# Cc recipient and viewer guide

> For: people copied (Cc) on a request, and anyone checking a page's approval status

## Cc recipients

When a requester copies you (**Cc**), you can follow the request without deciding.

- **Where** — The **Cc** tab of the approval inbox (top **Apps** → **Moves Approval**)
- **What you receive** — In-app notifications when the request is created, **finally** approved, rejected, withdrawn, or expires. Intermediate step approvals are not sent. If Confluence notifications are on, you are also @mentioned in a page comment on final approval.
- **What you cannot do** — Approve, reject, or withdraw
- If you were copied through a group, the group's members at request time become Cc recipients. People who join the group later are not included.
- You need view permission on the page to see its details.

## Page readers: reading the approval status

The item below the page title shows the current status.

| Shown | Meaning |
| --- | --- |
| Request approval | This page has no approval request yet. |
| ⏳ Pending approval · Step 2 of 3 in progress | Step 2 of 3 is in progress. |
| ⏳ Legal review · step 2 of 3 | Progress when the step has a name. |
| ✅ Approved | Every step approved. |
| ❌ Rejected | An approver rejected it. |
| ⌛ Overdue | The deadline has passed. It can no longer be approved or rejected and turns Expired within a day. |
| ⌛ Expired | It closed after its deadline. |
| ↩️ Withdrawn | The requester withdrew it. |

If an administrator renamed the status labels, you will see your organization's terms instead.

Select the item to open the approval dialog. With view permission on the page you can see:

- **Progress** and **Approval order and decisions** (who decided when, signature stamps, and whether someone decided on another's behalf)
- **Audit timeline** — the order of requests, approvals, rejections, withdrawals, and expiries, with reasons
- **Approval history by version** — earlier requests and which version each one approved
- **Deadline** — a `D-n` or `Due today` badge from three days before the deadline, and `Overdue` once it passes

## Reading the approval stamps on a page

If a page contains **approval stamps** (the Moves Approval Stamps macro), you can see the approval at a glance, like a paper approval form, without opening the approval dialog. The stamp box is added to the top of the page when approval is requested, or placed by the author directly or through a template.

| Position | What it shows |
| --- | --- |
| Top row | The step name. Without a name it reads "Step 1", "Step 2", and so on. The step whose turn it is is highlighted. |
| Middle row | The stamp |
| Bottom row | The approver's name and decision date. A proxy decision shows "(proxy)" before the date. |

| Stamp | Meaning |
| --- | --- |
| Round seal with the approver's name | Approved. If the approver registered a signature and the administrator turned signatures on, the signature image is stamped instead. |
| Square "Rejected" seal | Rejected |
| "Pending" in a dashed circle | Not decided yet |

- "No approval request yet." means the page has no request. If you can edit the page, use the **Request approval** button next to it to request right away.
- "The page changed after approval — the current version is not approved." means the stamps apply to an earlier version. See [What "current version not approved" means](#what-current-version-not-approved-means) below.
- **Open approval details** opens the approval dialog.
- The stamp box shows the **page approval**. Area approvals have their own stamps below each area approval box.

## Downloading the approval certificate (PDF)

For a finished approval (Approved, Rejected, Expired, or Withdrawn), select **Approval certificate (PDF)** next to the approval dialog title to download a certificate. Anyone who can view the page can download it; open requests have no button.

The certificate contains:

- **Document details** — document, space, page ID, target (whole page / region in the page), status, requester, requested and closed times, and request note
- **Versions** — the approved version and the current version (whether they match or the page changed after approval)
- **Approval stamps** — approvers and stamps for each step
- **History** — time, event, by, and reason
- **Document fingerprint** — the SHA-256 of the approved version's body
- Issue time, issuer, and request ID

Good to know:

- The certificate body is embedded in the PDF as an image (so Korean text always renders correctly), so it cannot be searched or copied. **The request ID and document fingerprint appear as text at the bottom of every page and in the PDF document properties (keywords)**, so you can copy them.
- The certificate is always printed on white paper, even if you use the dark theme.
- If the body of that version cannot be read, the certificate is issued without a fingerprint and shows "The body of this version could not be read, so no fingerprint was computed."
- For area approvals, the fingerprint is also computed from the **whole page** body of that version.

### Verifying the document fingerprint

Confluence never changes the content of a saved version. So if you fetch the body of the version named on the certificate and compute the hash the same way, a matching value means the content the certificate refers to is unchanged.

1. On the certificate, note the **Page ID**, the **Approved version** (for example, v5), and the **Document fingerprint**.
2. With an account that can view the page, fetch that version's body in ADF format from the Confluence REST API:
   `GET https://<your-site>.atlassian.net/wiki/api/v2/pages/<page ID>?version=<version number>&body-format=atlas_doc_format`
3. Compute the SHA-256 of the `body.atlas_doc_format.value` string **exactly as returned** (UTF-8, no added newline).
4. If the result (hex) matches the fingerprint on the certificate, the content has not changed.

Example (using an API token; requires `jq`):

```
curl -s -u you@example.com:<API token> \
  "https://<your-site>.atlassian.net/wiki/api/v2/pages/<page ID>?version=<version number>&body-format=atlas_doc_format" \
  | jq -j '.body.atlas_doc_format.value' | sha256sum
```

## What "current version not approved" means

An approval applies to a specific **version**. If the page was edited after approval, you see "Approved at v5 · current version not approved." What you are reading may differ from what was approved; check that version in the page history if you need the approved content.

## Area approval boxes

A **Content approval** box inside a page shows the status for that part only, separately from the page as a whole. **Content changed** means the area's content changed after the approval baseline. Areas with a request show their approval stamps at the bottom of the box; use **Hide stamps** / **Show stamps** to collapse or expand them.
