# Moves Approval Privacy Policy

> **Draft — pending legal review.** Items in `[ ]` must be confirmed.
> Effective date: [2026-MM-DD]

DMOVE Co., Ltd. ("we") explains here what information the Atlassian Confluence Cloud app **Moves Approval** (the "app") processes and how it is protected.

## 1. Scope

This policy applies to Moves Approval for Confluence Cloud installed through the Atlassian Marketplace. Our website (dmove.kr) is covered by its own policy.

## 2. We do not hold customer data

The app runs on Atlassian Forge ("Runs on Atlassian"). App data is stored only in the Atlassian-hosted Forge storage (Forge SQL and Key-Value Store) attached to the customer's site. **No customer data is sent to servers we operate, and our staff do not access app data on customer sites.** Storage location and data residency follow Atlassian's policies.

## 3. Information the app processes

| Category | Contents |
| --- | --- |
| User identifiers | Atlassian account IDs (requesters, approvers, Cc recipients, delegates, administrators) |
| Approval records | Page ID, title, and version; space key; area identifier and content hash; approval lines; approve/reject decisions and times; request notes; rejection and withdrawal reasons |
| Signatures | Signature images drawn or uploaded by users |
| Signature PIN | A salted PBKDF2 hash and failure count (the PIN itself is never stored) |
| Delegations, notifications, settings | Delegation periods and notes, in-app notifications, app settings and the settings change log |

The app **does not store user names, email addresses, profile pictures, or page content.** Names are read from Confluence with the viewing user's permissions each time a screen is shown.

## 4. Purposes

Only to manage approval requests, progress, and records; display approval screens and notifications; generate approval certificates; apply app settings; and keep an audit trail. Never for advertising, profiling, or sale.

## 5. External transfer — error diagnostics

When an unhandled error occurs in the app's screens, error information is sent to **Sentry** (Functional Software, Inc., United States) to find the cause.

- Sent: error type, message, and stack trace; app environment; browser and OS type
- Not sent: account IDs, names, emails; page URLs, titles, and content; approval content, reasons, and notes; cookies and request headers; console logs; click and navigation history
- The Sentry project is configured not to store IP addresses.

We do not otherwise share customer data with or entrust it to third parties.

## 6. Retention and deletion

| Information | Retention |
| --- | --- |
| Finished approval records | The retention period set by the customer's administrator (3 years by default); deleted when an administrator exports and then deletes them |
| In-app notifications | Deleted automatically after 180 days |
| Settings change log | Deleted automatically after one year |
| Signatures, PIN, delegations | Until the user deletes them; deleted automatically when the Atlassian account is closed |

The app periodically reports stored account IDs through Atlassian's Personal data reporting API and deletes the signatures, PINs, delegations, and notifications of closed accounts. Account IDs inside approval and audit records are the customer organization's audit record and follow the retention above. Data handling after uninstallation follows the Atlassian Forge data retention policy.

Excel exports and approval certificate PDFs downloaded by customers are copies the customer manages.

## 7. Roles

For app data on a customer's site, the customer (the organization operating the site) determines the purposes and scope of processing. We are an app provider that does not hold the data. [Legal: confirm controller/processor wording]

## 8. Your rights

Users can delete their own signature, PIN, and delegations under **My signature** and **My delegation** in the app. Requests to access, correct, or delete approval records should go to your organization's site administrator; send other inquiries to the contact below.

## 9. Security measures

Every function call is authorized on the server before it runs, and information about pages a user cannot view is not shown through the app. PINs are stored only as hashes and lock after repeated failures.

## 10. Contact

- DMOVE Co., Ltd., 3–5F, 26 Seochojungang-ro 20-gil, Seocho-gu, Seoul, Republic of Korea
- Privacy officer: [name, title]
- Email: support@dmove.kr · Phone: +82-2-6405-0800

## 11. Changes

We will announce changes on this page at least 7 days before they take effect.
