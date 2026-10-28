# Data, security and privacy

This page explains the app's data handling. Refer to the finalized supplier privacy policy, terms and support policy linked from Marketplace. This explanation does not replace those legal policies.

## Stored data

| Data | Content and purpose |
| --- | --- |
| Requests, lines, decisions and audit | Issue identifiers, request messages, account IDs, steps, decisions, reasons, times and delegated actors |
| Timesheet snapshots | User, period, time zone, worklog IDs, issues, start times, durations, fingerprints, violations and change state |
| Transition and field approvals | Source/target statuses, previous/proposed field values, application results, actors and bypass history |
| Worklog pre-approval | Unregistered draft author, issue, date, duration and full description; fixed flow/policy, registration state and linked Jira worklog ID |
| Worklog history | Creation, edits, deletion and observation baselines; authors, actors, time, issue and description fingerprints, previews or full text |
| Inbox and notifications | Related account IDs, roles, notification content and read state |
| Signature, PIN and delegation | Signature images, salted PBKDF2 PIN hashes, failure and lock state, delegates and validity periods |
| Settings and administration | Policies, teams, leads, groups, rosters, flows, changes, exports and cleanup records |

Plaintext PINs are not retained. Users are identified by Jira account ID rather than a separate authoritative directory of names, email addresses or photos. Screens retrieve Jira profile information. Request display metadata, audit and exports may contain necessary user and issue information.

## Worklog descriptions

History recording is on by default; full-description retention is off. Even with full retention off, **the first 40 characters and a fingerprint are stored**, so some sensitive description text may remain. Enabling full descriptions affects subsequent collected changes and increases storage.

Worklog pre-approval drafts store the **complete description** for review and registration of the approved content. Disabling full-description history retention does not disable draft storage. The requester and authorized approval participants can review drafts; avoid unnecessary personal information in descriptions.

Restricted worklog descriptions are shown only to their author. History searches and exports also check the viewer's Jira issue permissions. The app does not reconstruct every change before collection began or guarantee complete real-time auditing. Distinguish initial observation baselines from actual change events.

## Storage and Jira writes

App data is stored in Forge SQL and KVS. The current manifest declares no external-domain egress permissions. This alone does not guarantee a specific data location, certification or Runs on Atlassian badge.

Jira writes include user-entered worklogs, approved field values, eligible transition @mention comments and Workforce integration publications. Worklogs, fields and comments normally use the acting user's permissions. If an administrator enables app fallback for approved field changes, the app attempts the write after an explicit user permission or screen rejection. Jira history records the app, while the approval record retains the actual approver. Limited app-permission paths handle background collection, validator checks and integration publishing without user context.

Deleting app records does not delete or revert Jira worklogs, comments or field values. Jira visibility rules apply to comments and properties.

## Retention, export and deletion

| Item | Policy |
| --- | --- |
| Completed approval records | Default 3 years; indefinite, 1, 3, 5 or 10 years. No automatic deletion solely because time elapsed; administrator cleanup follows confirmed export |
| Pending requests | Excluded from completed-record cleanup |
| Pending or uncertain pre-approved registrations | Applying, unknown, approved waiting and retryable registrations are excluded from completed-record cleanup |
| Worklog change history | Default 12 months; 0 is indefinite. Administrator cleanup follows confirmed export |
| In-app notifications | Automatically cleaned up after 180 days |
| Settings audit | Automatically cleaned up after one year |
| Signatures, PINs and delegation | Users can change or delete their own |

Check usage in Data management. Excel exports and certificate PDFs may include names, request messages and rejection reasons. Customers manage downloaded copies, sharing and disposal. Deletion cannot be undone; verify the file first. Confirm the current Forge and supplier policy for retention and recovery after uninstall.

## Permissions and access

| Requested scope | Purpose |
| --- | --- |
| `storage:app` | App settings, approvals and history |
| `read:jira-work` | Issues, projects, worklogs, changes, visibility checks and events |
| `read:jira-user` | User/group search, membership and display names |
| `write:jira-work` | Create/edit/delete worklogs, apply approved fields, write comments and publish integration data |
| `report:personal-data` | Report accounts whose personal data is retained to Atlassian and check whether data needs erasure or refresh |

The server checks ownership, decision turn, administrative rights and issue visibility. Roster membership and delegation do not expand issue permissions. Direct privacy requests to the site administrator and the supplier's official support channel. Users can delete personal signatures, PINs and delegation; organizational approval audit records follow administrator retention policies.

## Closed and deactivated accounts

Deactivated accounts retain their Jira display name. When Atlassian's personal data reporting API confirms an account as `closed`, the app removes signature images, PINs, notifications, delegation, the account's own functional inbox copies, and team and app roster membership. Other users' inbox copies referring to that requester or subject and account IDs in the original CC roster are retained. Workforce cleanup removes only the closed account's own organization document. An `updated` response does not delete signed Workforce documents. Display names and avatars are not cached on the server; the next lookup with user permissions retrieves current information. Reporting normally runs every seven days and follows the server's `Cycle-Period` response, so account closure may take time to appear in the app.

Groups and flows retain their enabled state while only the closed account's membership is removed. A flow with an empty step shows a **Needs review** warning in settings and cannot be used for new requests until an administrator edits and saves its steps.

For audit traceability, **account IDs in approval requests, approvers, events, certifications, worklog change history, control history and settings audit are retained**. Account cleanup does not automatically erase or anonymize entire audit snapshots or user-written reasons and descriptions. A stable label is retained for each closed account, shown consistently as `Deleted user A`, `Deleted user B`, and so on throughout the app. Audit exports include the display name or label together with the original account ID. Organizations must disclose this identifier retention in their privacy and retention policies.

Deactivate accounts when employees leave. If an account must be deleted, first export audit records containing names and account IDs. Cleanup before uninstall removes functional information that is no longer needed while preserving control records needed to restore worklog visibility until restoration completes. The uninstall hook may reach its time limit before finishing; release controls and verify downloaded records beforehand.

[FAQ](cloudjira--12-faq-troubleshooting.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--11-data-security-privacy.md)

## Automatic transition and certification data

Automatic transitions execute as the original requester with offline asUser, without substituting an asApp transition write. read:jira-work/write:jira-work allow impersonation; consent, access restrictions and live history actor preservation remain unmeasured. The application ledger stores status, code, attempts, timestamps, actor and changelog evidence. Approval and application are separate facts.

Certification fingerprints include source time, description and visibility. Stored snapshots contain worklogId/issueId/authorId/started/seconds/sourceUpdatedAt/fingerprint; description and visibility text are not copied into the certification ledger. Certificates distinguish the immutable request snapshot from current source certification. Observed changes/deletion invalidate verification; restoring values alone never restores it. When worklog history collection is off, the changed feed is narrowed to IDs with an existing certification ledger before details are fetched; other worklogs do not receive an automatic certification ledger before a certification view or request. Jira user permissions restrict access. Existing history retention and certification snapshot non-replication are different policies. Retention exports include request certification snapshots and transition application ledgers.

## Worklog policy hierarchy

Scoped worklog policies store sparse values, updater, revision and verified Workforce cache. rms.policy is trusted for decisions only after public-key signature, target, time and revision validation. Runtime reads verified SQL cache rather than untrusted entity properties. Failed signatures preserve the previous verified policy. Expired locks beyond grace block related writes. History comments default off and follow effective scope settings. historyRetentionMonths is site-only; 0 means indefinite, with deletion after confirmed manual export. Diagnostics are response/cache aggregates rather than persistent user telemetry.
