# Marketplace review guide

> For: Atlassian Marketplace reviewers and submission owners
> Baseline: the Confluence Cloud implementation in this repository on 2026-10-05. The steps below are review scenarios to execute, not a report of completed tests.

## App introduction and listing copy

**App name:** Moves Approval for Confluence

**Short description:** Manage step-by-step document approvals, stamp boxes, and version history in Confluence.

**Detailed description:** Moves Approval adds sequential approval to Confluence Cloud pages and selected regions within a page. Requesters choose approvers and approval steps; approvers handle requests awaiting their decision in the approval inbox. A stamp box displays steps, approvers, and stamps inside the document, and finished requests can be downloaded as approval certificate PDFs. The app supports saved approval flows, approval groups, Cc recipients, time-limited delegation, signatures and PINs, bulk approval, Excel exports, and record retention settings. The interface and user guides are available in Korean and English.

| Highlight | Description | Suggested screenshot |
| --- | --- | --- |
| Approval visible in the document | Page and region approval status, stamp boxes, and the version being approved | Stamp box and approval details on a test page |
| One place to handle approvals | Requests awaiting your decision, your requests, Cc lists, filters, and bulk approval | Approval inbox |
| Retain decisions and their history | Decisions by step, audit timeline, Excel exports, and certificate PDFs | Finished request details and certificate |

The supported product is **Confluence Cloud**. Do not claim Jira or Confluence Data Center support for the app in this repository. Customers do not need a separate external account or a server they operate. Prices and trial terms in the public listing must match the actual Marketplace configuration.

## Installation and usage documentation

Start review and customer guidance at [Documentation home](cloudjira--00-index.md). The [Korean documentation](../ko/cloudjira--00-index.md) provides the same structure.

| Review topic | Guide |
| --- | --- |
| Features and entry points | [Overview and key concepts](cloudjira--01-overview.md) |
| Installation, setup, updates, and uninstall | [Installation and first-time setup](cloudjira--02-installation.md) |
| Requests, withdrawal, and resubmission for a new version | [Requester guide](cloudjira--03-requester-guide.md) |
| Approval, rejection, signatures, PINs, and delegation | [Approver guide](cloudjira--04-approver-guide.md) |
| Cc, viewing, and certificates | [Cc recipient and viewer guide](cloudjira--05-cc-and-viewer-guide.md) |
| Policies, flows, groups, and data management | [Administrator guide](cloudjira--06-admin-guide.md) |
| Errors and information for support requests | [FAQ and troubleshooting](cloudjira--07-faq-troubleshooting.md) |
| Data categories, retention, and permissions | [Data, security, and privacy](cloudjira--08-data-security-privacy.md) |

## Permissions and data handling

The app runs on Atlassian Forge and stores approval data in Forge SQL and the Key-Value Store. The only egress is Sentry for error diagnostics (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.sentry-cdn.com`, category `analytics`, `inScopeEUD: false`). It sends only the type, stack trace, and browser information of unhandled screen errors, never customer data. There is no remote configuration. Stored account IDs are reported every 7 days through the Personal data reporting API (`report:personal-data`), and signatures, PINs, delegations, and notifications of closed accounts are deleted. Excel and PDF downloads are copies retained by the customer.

Stored data includes account IDs, page identifiers, titles and versions, approval decisions, timestamps and reasons, request notes, signature images, delegation, notifications, and settings. The app does not retain names, email addresses, profile pictures, or page bodies in its storage. PINs are stored as salted PBKDF2 hashes. [Data, security, and privacy](cloudjira--08-data-security-privacy.md) documents retention and the purpose of every requested scope.

Confluence access for user actions uses `asUser()`. Automatic stamp box insertion increments the page version with the requester's permissions; optional @mention comments use the permissions of the user performing the action. App-context reads in page update triggers and scheduled checks without user context are used only for version and hash checks; the page bodies read this way are not returned to users.

Finished approval records have a default retention period of three years and are not automatically deleted when that period passes. Administrators can delete only the range for which they confirm an Excel export. Notifications are cleaned up after 180 days and settings audit history after one year through scheduled checks. Retention and deletion after uninstall follow Forge platform policy; the app does not promise immediate permanent deletion itself.

## Review procedure

### Preparation

1. Prepare a Confluence Cloud test site that can install the submitted version. Before public listing, the submission owner supplies installation and access instructions in the review ticket.
2. Prepare a site administrator, requester A, approvers B and C, and restricted-access test user D. A has edit permission on the test page, B and C have view permission, and D cannot view that page.
3. Initially disable app access restriction and leave the approver registry empty. Confirm that the test space is enabled.
4. Use test data only. Enable the corresponding policies when checking signatures, PINs, and delegation. Do not include account passwords or API tokens in documents or screenshots.
5. Before checking successful comment creation, confirm that A, B, and C can add comments to the test page. When an actor cannot add comments, check that the approval outcome is still recorded even though no comment is created.
6. The submission owner prepares overdue and past-retention test records in advance and supplies page links, request identifiers, deadlines, completion dates, and the applicable retention period in the review ticket. Reviewers must be able to locate those records without manipulating data themselves.

### Scenarios and expected results

Use a separate request for each terminal outcome. Restore the initial conditions before the next scenario if you change a policy.

| # | Procedure | Expected result |
| --- | --- | --- |
| 1 | Open the app menu, settings, and approval item below the test page title. | The inbox, administrator settings, and approval dialog load; Confluence's normal edit and share functions still work. |
| 2 | A requests page approval with B in step 1 and C in step 2, selecting automatic stamp box insertion. | One open request is created. If insertion increments the page version, that resulting version is the approval target. |
| 3 | Check whether C can decide first, then have B approve and C approve. | C cannot decide before their turn. B's approval opens C's step; the final approval completes the request. |
| 4 | B rejects a new request with a reason. A withdraws another new request. | Each request ends in its respective rejected or withdrawn state, with the decision and reason in its history. |
| 5 | Edit a page with an open request, then have A resubmit for the new version. | Editing alone does not close the request. Resubmission supersedes the previous request and starts a request for the new version. |
| 6 | Add and publish an approval region macro, then request approval for that region. | Region and page approvals are separate targets. Delete the region macro and check that its request is automatically withdrawn. |
| 7 | D accesses the inbox and the restricted page or request details. | Information about the inaccessible page is excluded from the inbox and detail access is denied. |
| 8 | Try approving, rejecting, and creating a new request for an overdue test request. | The overdue indication appears and decisions on the old request are refused. Creating a new request expires the overdue open request. Scheduled state cleanup runs once a day. |
| 9 | B registers a signature and PIN, then decides under a PIN-required policy. Also handle a separate request delegated to C within the delegation period. | A decision requires successful PIN verification. Delegated decisions record both the original approver and the actual actor. |
| 10 | Check in-app notifications and optional Confluence comments for a request with a Cc recipient. | Cc recipients cannot decide. Comments depend on the acting user's permissions and ability to add comments. Reminders and due-soon alerts are in-app notifications; the app does not send email directly. |
| 11 | Download a finished request's certificate PDF and export the inbox to Excel. | Decisions and history are available. The PDF includes a SHA-256 fingerprint when the target version can be read, and omits it otherwise. |
| 12 | An administrator exports and deletes finished records past the retention period in data management. | Only the confirmed export range is deleted; open requests are excluded. If there are no records for that period, no eligible records are shown. |
| 13 | Set A's and B's Confluence languages to Korean and English and inspect the same views. | Views follow each user's language setting. |
| 14 | Access the paid release configuration with an inactive license. | Every screen (including settings) shows a purchase notice, every feature call is rejected with `LICENSE_INACTIVE`, and macros in documents show a short notice; area-approval macro content and the byline status stay visible. The development license exception does not substitute for this test. |

The submission owner prepares test records for deadline and retention checks; do not alter dates on production records. Do not rely solely on automation reporting successful iframe button clicks: also inspect resulting states, decision history, and downloaded files.

## Items to finalize before submission

Writing source documents is separate from publishing them and obtaining approval. Complete these items only after obtaining actual values and evidence. Finalize a public privacy policy covering the operator, contact details, processing purposes, retention, and rights request procedures; feature descriptions alone do not replace it. Check against [Atlassian's data privacy guidelines](https://developer.atlassian.com/platform/marketplace/data-privacy-guidelines/).

- [ ] Publish Korean and English user guides and register a public Documentation URL accessible without signing in. Convert relative links for the publishing destination.
- [ ] Finalize the legal operator name, support URL and email, support hours and time zone, and privacy contact.
- [ ] Finalize a public Privacy policy URL and customer terms or EULA.
- [ ] Register the actual release logo, screenshots, pricing, and trial terms.
- [ ] Complete the Forge app and partner security questionnaires, the Cloud app Privacy & Security tab, required partner identity verification, and vulnerability tickets. Consult the [approval security workflow](https://developer.atlassian.com/platform/marketplace/app-approval-security-workflow/).
- [ ] For a paid release, verify license configuration (manifest `app.licensing.enabled`) and inactive-license behavior on the production listing. Development and staging carry no license information, so they cannot be used for this test.
- [ ] Once the listing URL exists, replace the purchase link (`MARKETPLACE_URL` in `static/ui/src/app/license/licenseConstants.js`).
- [ ] Record Sentry (US) as a subprocessor, the data it collects, and the use of the Personal data reporting API in the Privacy & Security tab and the privacy policy.
- [ ] Execute the scenarios against the submitted deployment and attach the date, version, tester, outcomes, and screenshots to the review ticket.

Check setup and usage documentation and advertised behavior against the [Atlassian app approval guidelines](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/). Do not claim a `Runs on Atlassian` badge, security certifications, or legal electronic-signature validity without verified approval or supporting evidence.
