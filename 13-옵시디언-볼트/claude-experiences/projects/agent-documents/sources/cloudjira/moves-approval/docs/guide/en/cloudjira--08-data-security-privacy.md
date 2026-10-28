# Data, security, and privacy

> For: site administrators and security or privacy reviewers

## Summary

- Moves Approval is an **Atlassian Forge** app and runs entirely on Atlassian's infrastructure.
- App data is stored only in Atlassian-hosted **Forge storage** (Forge SQL and the Forge Key-Value Store). Approval data is never sent to external servers. The one exception is **error diagnostics**: when an unhandled error occurs in the app's screens, only the error type, stack trace, and browser information are sent to Sentry (US) ([Error diagnostics](#error-diagnostics)).
- When acting for a user, the app calls Confluence **with that user's permissions**. Users cannot see information about pages they cannot view through the app.
- The app **does not store page content.** It stores only version numbers and a hash of area content, which it needs to make approval decisions. The document fingerprint on an approval certificate is computed on demand, and the content is not kept.
- The only time the app **edits** page content is the **automatic stamp box** that a requester chooses, and it does so only with the requester's permissions.

## Data the app stores

| Data | Contents | Purpose |
| --- | --- | --- |
| Approval requests | Page ID, title, and version; space key; area identifier and content hash; status; deadline; request note (up to 500 characters); requester account ID | Approval progress and history |
| Approval lines and decisions | Steps, approver account IDs, decisions (approve or reject), decision times, rejection and withdrawal reasons, delegate who decided | Decision records |
| Audit events | Order and reasons of requests, approvals, rejections, withdrawals, and expiries | Audit timeline |
| Inbox index | Role per account ID (approver, requester, Cc) and whether it is their turn | Approval inbox lists |
| In-app notifications | Recipient account ID, notification type and variables (such as page title), read state | Notifications |
| Signatures | Signature image drawn or uploaded by the user (resized to fit 480×160) | Stamps next to decisions and in the stamp box |
| Signature PIN | A **salted PBKDF2 hash** of the PIN and a failure count. The PIN itself is never stored. | Decision confirmation |
| Delegations | Delegator and delegate account IDs, period, note | Deciding on behalf |
| Settings | Policy, enabled spaces, approval lines, approval groups, approver list, settings administrators | App behavior |
| Record retention settings | Retention period; date, record count, and administrator account ID of the last export | Managing retention |
| Settings change log | Account ID of the person who changed it, time, area, details | Audit |

Users are stored only as Atlassian **account IDs**. Names, email addresses, and profile pictures are not stored; they are read from Confluence each time a screen is shown.

Approval certificate PDFs are generated in the browser each time they are requested and downloaded; the app keeps no copy.

## Retention

| Data | Retention |
| --- | --- |
| Finished approval records (approved, rejected, expired, or withdrawn requests, with their approval lines and audit events) | Kept for the retention period an administrator sets (Forever, 1, 3, 5, or 10 years; **3 years by default**). They are not deleted automatically when the period ends; they are removed only when an administrator **exports them to Excel** and then deletes them. |
| Open requests | Not subject to the retention period. |
| In-app notifications | Deleted automatically after 180 days |
| Settings change log | Deleted automatically after one year |
| Signatures, PIN, delegations | Until the user removes or changes them. Deleted automatically when the Atlassian account is closed |

- Set the retention period under settings → **Data management** → **Approval record retention**. Only app administrators (Confluence administrators and settings administrators) can use this screen.
- Only **the range you last exported** can be deleted, and deletion runs after a second confirmation. Deleting a request also deletes its approval line, audit history, inbox entries, and related notifications. **Deletion cannot be undone.**
- Records of pages the administrator cannot view are excluded from export and deletion. Records of pages **permanently deleted** from Confluence (emptied trash or deleted space) are included, with the page title, request note, and rejection or withdrawal reasons blanked. Confluence does not distinguish a deleted page from one whose restrictions also block the app, so records of such a restricted page are treated the same way.
- Retention changes, exports, and deletions are recorded in the settings change log (area "Retention", actions "Export" and "Purge").
- Users cannot modify approval records. Approval records are removed only according to the retention and cleanup policy above.

Handling of data after uninstallation follows the Atlassian Forge platform's data retention policy.

### Exported files

The .xlsx file from **Export to Excel** (sheets: Requests / Approvers / History) contains page titles, request notes, rejection and withdrawal reasons, and **user names** read from Confluence at the time of export. The file is downloaded to the administrator's computer, and its storage, access control, and disposal from then on are **the customer's responsibility**. Keep it somewhere that meets your organization's records retention policy.

### Storage limit

App data is stored within Forge SQL's per-installation storage limit (based on 1 GiB). When the limit is reached, new approvals can no longer be saved. Check usage under settings → **Data management** → **Storage**: it shows **Warning** at 80% or more and **Critical** at 90% or more. Sizes and row counts per table are estimates from database statistics.

## What the app writes to Confluence

The app writes only these two things to Confluence.

| What | When | With whose permissions |
| --- | --- | --- |
| A **stamp box macro** at the top of the page | When the requester selects **Add a stamp box to the top of the page** while requesting page approval (the default comes from the **Add an approval stamp box to the top of the page when a request is made** policy, on by default) | **The requester's** — never the app's |
| **Comments** that @mention the people involved | When **Also notify through Confluence** is on (the default) | The user performing the action (`asUser`) |

- The automatic stamp box is the only case in which the app edits page content. Because it is done with the requester's permissions, the page version goes up by one and the page history shows the requester with the message "Moves Approval". If the page already has a stamp box it is not added again, and if the requester lacks edit permission or someone else saved the page in the meantime, the request proceeds without it. The stamp box is a macro that displays approval status; it does not write approval data into the page body.
- Comments are Confluence content: everyone who can view the page can see them, and they remain after the app is uninstalled. The stamp box macro also remains in the page body, but it stops working once the app is uninstalled.

## Approval certificates

- An approval certificate PDF is issued only for **finished approvals**, and only to users who **can view** the page. The server also checks that the request belongs to that page.
- To compute the document fingerprint, the app reads the body of the approved version **with the permissions of the user opening the certificate**, and returns only the SHA-256 value. The body is not stored. If that version cannot be read, the fingerprint is omitted.
- Certificates include the names of the requester, approvers, and actors, the request note, and rejection and withdrawal reasons. Storing and sharing downloaded PDFs is the customer's responsibility.

## Error diagnostics

When an unhandled error occurs in the app's screens, error information is sent to **Sentry** (Functional Software, Inc., US region) to find the cause. This egress is declared in the manifest as an Atlassian-approved analytics tool (`analytics`) and marked as not customer data (`inScopeEUD: false`).

| Sent | Not sent |
| --- | --- |
| Error type, message, and stack trace; app environment; browser and OS type | Account IDs, names, email addresses; page URLs, titles, and content; approval content, reasons, and notes; cookies and request headers; console logs; click and navigation history |

Error messages carry error codes produced by the app and are designed not to contain approval content. Raw server errors (such as database messages) are never sent to the screen, so they never reach Sentry either.

## Permissions the app requests

| Permission | Used for |
| --- | --- |
| `read:page:confluence`, `read:content-details:confluence`, `read:confluence-content.summary` | Reading the title and version of pages under approval, receiving page-updated events, and computing area content hashes and certificate document fingerprints |
| `write:page:confluence` | Adding the stamp box macro to the top of a page with the requester's permissions, when the requester chooses it |
| `read:space:confluence` | Choosing enabled spaces and showing space names |
| `read:content.permission:confluence` | Checking whether users and approvers can view or edit a page |
| `read:user:confluence` | Searching for approvers and Cc recipients, and showing names |
| `read:group:confluence` | Looking up Confluence groups and members for approval groups |
| `read:comment:confluence`, `write:comment:confluence` | Posting @mention notification comments on pages |
| `storage:app` | Storing app data (Forge storage) |
| `report:personal-data` | Reporting stored account IDs through Atlassian's Personal data reporting API and erasing personal data of closed accounts |

## Access control

- **Every request is authorized on the server.** Whether or not a button is visible, each app function runs only after passing the condition declared for it on the server (own data, page view or edit permission, or administrator permission). Functions without a declared condition are refused.
- **Lists are filtered item by item.** Before returning results, the approval inbox keeps only pages the user can actually view.
- **Reads that bypass page permissions are never returned to users.** Only background jobs with no user context, such as deadline expiry and page-edit detection, read pages with app permissions, and they use the result only for version comparison and hashing. Record retention only checks with app permissions whether a page the administrator cannot see still exists in Confluence.
- **The app never edits page content with its own permissions.** The automatic stamp box runs only with the requester's permissions.
- **Safe under concurrent decisions.** Even when several decisions arrive at the same moment, only one open request can exist per target, and nobody can overwrite someone else's decision.
- **The server refuses decisions after the deadline.** Even before the scheduled cleanup runs, approvals or rejections on a request past its deadline are not recorded.
- **Data management** (storage, approval record retention, and deletion) is available only to app administrators.
- **Signature PINs** lock for 15 minutes after five failures.
- When the **license** is inactive, the server rejects every feature call, and every screen (including settings) and every macro in documents shows a purchase notice. Content inside area-approval macros and the approval status under the page title stay visible. Deadline expiry of open requests keeps running to keep data consistent, but no notifications are created.

## Data subject requests

Users can delete their own signature and PIN under **My signature**, and their delegation under **My delegation**. Approval decisions are part of the organization's audit record and cannot be modified or deleted by users; they are removed only when an administrator exports and then deletes records past the retention period. Because the app does not keep names or email addresses itself, when an Atlassian account is deleted the screens show whatever Confluence returns for that account. Names already contained in exported Excel files or downloaded certificate PDFs, however, are copies managed by the customer and cannot be changed by the app. For any other request, contact the support channel through your site administrator.

### Account closure

The app reports the account IDs it stores to Atlassian's **Personal data reporting API** every 7 days. When an account is reported as closed, the app deletes that user's **signature, PIN, delegations, and received notifications**, and removes them from the **approver list and settings administrators**. Account IDs inside approval and audit records are part of the organization's audit record and follow the retention policy above; screens show whatever Atlassian returns for the closed account.
