# Overview and key concepts

Moves Approval adds **sequential approval** to Confluence Cloud content. Who approved which version, and in what order, is recorded next to the page, and approvers handle everything waiting on them in one place: the approval inbox.

## Features

| Feature | Description |
| --- | --- |
| Page approval | Approve an entire page against a specific version. |
| Area approval | Approve only the content wrapped in the **Moves Approval Region** macro. A page can contain several areas. |
| Approval stamps | The **Moves Approval Stamps** macro shows steps, approvers, and stamps inside the page, like a paper approval form. It can be added to the top of the page automatically when approval is requested (on by default). |
| Multi-step approval lines | Steps run in order. Each step can have a name (for example, "Legal review") and a number of approvals required to pass. |
| Approval groups | Add a Confluence group or an app-only group as a single step, with "All must approve" or "Any one". |
| Saved approval lines | Administrators predefine common approval orders so requesters just pick one. |
| Cc | Copy people who should follow the request and get notified without deciding. |
| Deadlines | From three days before the deadline a `D-n` or `Due today` badge appears, and `Overdue` once it passes; overdue requests can no longer be approved or rejected. Overdue requests are expired by a once-a-day check. |
| Approval inbox | My turn, In progress, My requests, Handled, and Cc in one view, with filters, Excel export, and bulk approval. |
| Signatures and PIN | Stamp a signature next to each decision, and optionally require a signature PIN to confirm decisions. |
| Delegation | Hand your approvals to a delegate for a set period while you are away. |
| Reminders and due-soon notices | Re-notify the approvers whose turn it is when a request sits too long. |
| Audit records | Per-request audit timeline, approval history by version, and a settings change log. Users cannot edit them; they are removed only according to the retention period and cleanup policy. |
| Approval certificate (PDF) | Download one PDF with the approval line, stamps, history, and a **document fingerprint** (the SHA-256 of the approved version's body) for a finished approval. Anyone who can view the page can download it. |
| Data management | Administrators check the app's storage usage and set a retention period for finished approval records (3 years by default); records past it are exported to Excel and then deleted. |

## Where to find things

| Location | What it does |
| --- | --- |
| Item below the page title (byline) | Shows the current approval status (for example `⏳ Legal review · step 2 of 3`). Select it to open the approval dialog to view details, request, or decide. Without a request it reads **Request approval**. |
| Page `•••` menu → **Request approval** | Request entry point, shown only to users who can edit the page. |
| **Approval stamps** in the page body | Shows the steps, approvers, and stamps of the page approval inside the page. **Open approval details** opens the approval dialog. The same stamps also appear below each area approval box. |
| **Approval certificate (PDF)** next to the approval dialog title | Downloads the certificate of a finished approval (Approved, Rejected, Expired, or Withdrawn). |
| Top **Apps** menu → **Moves Approval** | The approval inbox. Notifications, My signature, and My delegation open from here too. Select a document name to go to that page; select anywhere else in the row to open the approval dialog. |
| Space sidebar → **Moves Approval** | The approval inbox for that space. |
| Confluence home, right panel | A summary of approvals waiting on you. |
| **Confluence settings** → **Moves Approval** | Administrator settings (also reachable from the **Settings** link in the inbox). Storage and record retention live on the **Data management** tab. |

## How a request flows

```
Request ─▶ Step 1 ─▶ Step 2 ─▶ … ─▶ Approved
              │         │
              └─ Reject ┴─▶ Rejected        (one rejection ends the request immediately)
  Any time while open ─ requester withdraws ─▶ Withdrawn
  Deadline passes ───────────────────────────▶ Expired   (checked once a day; "Overdue" until then)
  Resubmit for the new version ──────────────▶ earlier request closes, a new one starts
```

- A step opens only after the previous step passes. Approvers in later steps cannot decide yet.
- Each target (a page or an area) can have **only one open request** at a time.
- A finished request (approved, rejected, expired, or withdrawn) cannot be reopened. Create a new request if needed.
- Once the deadline passes, the Approve and Reject buttons disappear, and the server also refuses late decisions and expires the request on the spot. If you request approval again on a page whose request is overdue, the earlier request is expired automatically and the new one starts.

## Statuses

| Status | Meaning |
| --- | --- |
| Pending approval | Waiting for decisions. With step names it reads like "Legal review · step 2 of 3". |
| Approved | Every step approved. The approved **version** is recorded. |
| Rejected | An approver rejected it. The reason is recorded. |
| Expired | Closed because the deadline passed. For up to a day after the deadline, until it turns to Expired, it shows as "Overdue". |
| Withdrawn | Withdrawn by the requester (or a Confluence administrator). |

Administrators can rename these **labels** to match your organization's terms. The workflow itself does not change.

## Glossary

| Term | Meaning |
| --- | --- |
| Requester | The person who requests approval. Needs edit permission on the page. |
| Approver | A person on the approval line who approves or rejects. |
| Approval line | The ordered steps and approvers. Build one when requesting, or pick one an administrator registered. |
| Step | One row of the approval line. Approvers in a step decide in parallel; once enough approvals arrive, the next step opens. |
| Approval group | A group that forms one step. Its passing rule is "All must approve" or "Any one". |
| Cc | People who can view and get notified, but not decide. |
| Delegate | A person deciding on behalf of another approver. |
| Approval inbox | The screen that gathers your approval work. |
| Approval stamps | The macro (**Moves Approval Stamps**) that shows steps, approvers, and stamps inside the page. |
| Document fingerprint | The SHA-256 of the approved version's body. Recompute it from the same version to confirm the content is unchanged. |
| Settings administrator | A person registered to manage app settings without being a Confluence administrator. |

## Notifications instead of email

Moves Approval does not send email itself. It uses two channels:

1. **In-app notifications** — collected under **Notifications** in the approval inbox.
2. **Confluence notifications** (when enabled by an administrator; on by default) — the app leaves a comment on the page that @mentions the people involved. Confluence then delivers the mention according to each person's Confluence notification and email settings.

See [Administrator guide — Notifications](cloudjira--06-admin-guide.md#notifications) for details.

## Languages

The interface is available in English and Korean and follows each user's Confluence language setting. Other languages fall back to English.
