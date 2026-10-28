# Administrator guide

Jira administrators use app administration or inbox settings. App settings managers use the inbox route for global settings. Project rules require administrative permission for that project.

In the inbox, select **Settings** in the left sidebar to expand its subsections in the same navigation. Selecting a subsection loads that screen. The inbox preserves the subsection in its URL; the standalone settings page in Jira app administration keeps the selection within the current page.

## Settings

| Area | Purpose |
| --- | --- |
| Policy | Deadlines, rejection reasons, notifications, signatures, PINs, reminders, delegation, access restrictions and transition enforcement |
| Projects | Approval scope and permitted per-project overrides |
| Project worklog pre-approval | Required approval for new entries, allowed flows and a default flow; issue-panel users choose only an allowed flow |
| Timesheets | Unit, time zone, guardrails, teams, leads, closure and worklog history |
| Workforce integration | Enablement, signing, publication status and republishing |
| Flows and approval groups | Steps, membership, completion rules and project scope |
| Approvers and settings managers | App roster and settings access |
| Settings audit and worklog history | Tracking, searches and exports |
| Data management | Storage, retention, export and deletion |

## Key defaults

| Policy | Default |
| --- | --- |
| Deadline | 7 days |
| Rejection reason, notifications, signatures, approver visibility check | On |
| Required PIN, reminders, delegation, restricted access | Off |
| First/repeat reminder interval | 3 days each; requires reminders enabled |
| Due-soon threshold | 24 hours, checked daily |
| Timesheet unit and time zone | Month; Asia/Seoul |
| Empty submissions | Allowed |
| Daily/weekly limits | 720/3,120 minutes |
| Future-date check and submitted/approved period locks | On |
| Backdate limit and automatic closure | 0; off |
| Guardrail response | Warn only |
| Workforce integration, transition enforcement and transition comment notifications | On, subject to their configuration and permission requirements |
| Worklog history and full descriptions | History on; full descriptions off |
| Worklog history retention | 12 months |

When changing the timesheet unit or zone, distinguish existing request periods from new submissions. A zero time limit disables that check. Extra-step policy requires an exception group.

## Access and operations

Restricted access permits Jira administrators, settings managers, the approver roster and active timesheet team members. App access and issue visibility remain separate. Verify roster and team changes with a regular account.

Regularly check pending requests, post-approval changes, unapplied fields, closure exceptions, integration delays and storage. Verify exported files before deleting data and follow your organization's retention policy.

## Departing users and personal data reporting

**Deactivate accounts** when people leave instead of deleting them. Deactivated accounts keep the name supplied by Jira. If deletion is necessary, **download audit records before deleting the account** and verify that both names and account IDs are included. Once personal data reporting confirms a closed account, the app displays `Deleted user A`, `Deleted user B`, and so on. The same account keeps the same label throughout the app.

Account closure removes only that account's group and flow membership; groups and flows are not automatically disabled. If a flow step becomes empty, flow settings show a **Needs review** warning. That flow is unavailable for new requests until an administrator edits and saves its steps. Existing requests and other users' inbox records are retained.

The app uses its existing daily checks to report accounts whose personal data it retains to Atlassian, normally every seven days. It follows a different reporting period when Atlassian specifies one. After account closure is confirmed, it removes functional data such as signature images, PINs, notifications, delegation, team membership and app roster entries, and invalidates user caches. **Account IDs in approval, certification, worklog change, control and settings audit records are retained.** Closing an account therefore does not erase its entire audit history. See the [privacy guide](cloudjira--11-data-security-privacy.md) for retained data.

The installation upgrade for this feature adds the `report:personal-data` permission. Before uninstalling, release worklogs hidden by app controls and download the audit records you need. Cleanup immediately before uninstall has a time limit and does not replace these administrator checks.

[Data guide](cloudjira--11-data-security-privacy.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--09-admin-guide.md)

## Operating automatic transitions and certification

New transition approvals apply with the original requester's offline impersonation permissions. Check project enablement, rules, workflow validator and requester Jira permissions. Approval and application are separate; UNKNOWN must be reconciled or reviewed manually, never reposted. Existing LEGACY_MANUAL requests require manual transitions. Scope changes require installation upgrade and consent verification.

Certification checks a Jira source already recorded. Its author selects an available flow on the row's certification screen. Required WORKLOG_CREATE policy is optional strict mode and retains manual recording by the requester after approval. Certification, period locks and timesheet approval are separate. Test invalidation after source changes, rejection of another author's certification request and approval/application separation with regular accounts. Actual provider selection is not detected automatically.

## Worklog policy hierarchy

Use **Site worklog defaults** and **Policy diagnostic counters** in timesheet settings, **Project worklog policy** in the project policy modal, and **Issue worklog policy and inheritance** in the worklog tab. Project administrators save the complete sparse override with its integer revision. On POLICY_CONFLICT, refresh and reconsider the change. Legacy string revisions cannot be saved until migration completes.

Workforce policies are edited in Workforce, not this screen. **Refresh Workforce policy** receives the signed document. Check target, public key, kid/trustedKids, time and revision when signatures or expiry fail. Retention, approval unit and time zone are site-only. Retention 0 means indefinite and preserves manual export→purge. Project retention overrides are unavailable. Diagnostics are current-response counters, not cumulative telemetry.


## Reopening periods and app field application

Paid subscriptions and trials show a warning in the inbox, work log, issue and settings screens starting seven days before expiry. Dismissing it hides it for the current day. If Moves Approval is the time tracking provider, site time entry may stop after expiry. Renew the license, or ask a Jira administrator to open **Jira settings > Issues > Time tracking**, switch to the **Jira default provider**, and check work log entry on an issue.

**Allow new input** removes the period closure lock while retaining existing approval and certification. **Allow editing too** previews approval, certification and hidden-worklog counts and requires a reason. Existing decisions and certification records remain, but reapproval and recertification become necessary. Resume a partial operation until it finishes. Visibility restoration runs in the control queue and may finish shortly after the period operation.

App fallback for field changes is off by default. When enabled, an explicit permission or screen rejection of the user PUT permits one app attempt. Jira records the app as the editor; the approval record retains the human approver. Application can still fail if the app lacks permission or the screen restriction remains. An unknown result is not automatically resent, to avoid duplicate writes.
