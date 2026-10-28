# Data, security, and privacy

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--data-security.md)

This explains app data handling for administrators and security reviewers. Moves Approval runs on Atlassian Forge and currently stores app data in Forge SQL and Key-Value Store. Approval data is never sent outside, and no customer-operated server connection is used. The only external transfer is the **error diagnostics** described below.

## What is stored

| Data | Content and purpose |
| --- | --- |
| Requests and decisions | Page ID, title, version, area identifier/hash, account IDs, steps, status, times, deadline |
| Notes and reasons | Review notes, rejection/withdrawal reasons, and audit events |
| Inbox and notifications | Account roles and request/result notices |
| Signature and PIN | Signature image, salted PIN hash, failure count; no plain-text PIN |
| Delegation | Approver and delegate account IDs, period, and note |
| Settings and change log | Policies, spaces, lines, groups, registrations, administrators, retention, and changes |

Names, email addresses, and profile pictures are read from Confluence for display rather than stored in the app. Page bodies are not retained. Bodies are read as needed for version/area checks and certificate fingerprints.

## Permissions and Confluence changes

User actions follow that user's Confluence permissions. Lists and details are restricted to viewable pages. Background checks and page-update handling may read with app permissions when no user context exists, but do not return those bodies to users.

| Change in Confluence | Condition | Identity |
| --- | --- | --- |
| Insert a stamp box | Requester selects insertion and no box already exists | Requester; successful insertion raises the page version. |
| @mention comment | Confluence notification policy enabled | User performing the action, with comment permission. |

Comments are visible to page readers and may remain after app removal. Restricting app access does not change the visibility of existing Confluence comments.

## Retention and downloads

Finished records default to three years, with forever or 1, 3, 5, or 10 years available. Age alone does not delete them: an administrator exports and deletes the covered range. Open requests are excluded. Records of pages permanently deleted from Confluence are included, exported with titles, notes, and reasons blanked (Confluence does not tell these apart from pages whose restrictions also block the app, so those are handled the same way). In-app notifications are cleaned up after 180 days and settings logs after one year. Users can change or remove their signatures, PINs, and delegations, and they are deleted automatically when the Atlassian account is closed.

Excel and PDF files may include names, notes, and reasons. Customers manage their retention, sharing, and disposal after download. The app does not retain certificate PDF copies. App data after uninstall follows Forge platform policy.

## Why permissions are requested

| Permission group | Purpose |
| --- | --- |
| Read pages and content | Titles, versions, areas, update detection, certificate fingerprints |
| Write pages | Requester-selected stamp insertion |
| Read spaces and content permissions | Space selection and view/edit checks |
| Read users and groups | Approver/Cc search and group membership |
| Read/write comments | Optional @mention notifications |
| App storage | Approval records and settings |
| Personal data reporting | Report stored account IDs to Atlassian and erase personal data of closed accounts |

## Error diagnostics

When configured with a Sentry DSN, the app sends unhandled screen errors to **Sentry** (US region). The client removes user context, request URLs and payloads, cookies, extra data, and breadcrumbs, and does not enable console-log collection. The error message and stack trace are still included; if an error itself contains personal or page data, those fields could contain it. Do not configure the DSN until that residual risk is accepted or the error payload is further sanitized. Without a DSN, the app does not initialize Sentry.

## Data-related requests

Manage signatures, PINs, and delegation in the personal screens. Individual decisions are organizational audit records and cannot be edited or deleted by users. The app reports stored account IDs to Atlassian's Personal data reporting API every 7 days; for closed accounts it deletes signatures, PINs, delegations, and received notifications, and removes them from the approver list and settings administrators. Account IDs in approval and audit records follow the retention policy. Route other requests through the site administrator to support. This is a technical product description; also consult the operator's published privacy policy and terms.

[Data management](cloudjira--admin-data.md) · [Marketplace review](cloudjira--reviewer-guide.md)
