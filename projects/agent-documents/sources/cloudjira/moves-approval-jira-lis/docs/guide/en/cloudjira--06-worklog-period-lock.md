# Worklog pre-approval and period locks

**Period locks apply to the app's input screens on sites selecting Moves Approval as Jira's time tracking provider. They do not block all changes through REST, automation, mobile or other routes before those changes occur.** Those routes are managed through detection, history and reapproval.

## Select the provider

A site administrator selects **Moves Approval** under Jira **Settings → System → Time tracking**. The site has one active provider; Moves Approval and providers such as Tempo cannot both be selected. Review existing entry flows before switching.

The app's modules replace the native **Log work** and **Work log** UI when selected. The Atlassian module is a Preview feature; verify it in the installed environment. [Atlassian time tracking provider documentation](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/)

## Create, edit and delete

Use **••• → Log work** on an issue to enter the date, time and description. Review entries in **Work log**. Editing and deletion depend on ownership and Jira worklog permissions. Operations run with the user's permissions and fail without the required access.

By default, app entry is locked for your submitted and approved periods. Edits that move an entry between dates also check period locks. Closed periods have a separate closure lock.

## Configure approval for each new entry

Project administrators configure **Worklog creation preapproval**, the allowed flows and the default flow in the project's Moves Approval settings. Reuse existing flows so requesters do not rebuild steps for every entry. Pre-approval is optional by default.

To enforce the policy, a site administrator must select Moves Approval as Jira's time tracking provider and enable the project under the global **Applied projects** setting. Without the provider, the app entry screen is unavailable and Jira's default entry route remains. If the project is disabled globally, the app blocks new approval requests and registration even if a project administrator saved a required policy. Confirm both prerequisites with a site administrator first.

On sites restricting app access, requesters must also belong to the app roster or an allowed active team to view approval details and complete registration. Opening the general entry screen alone does not grant post-approval registration access. Test the complete procedure as a requester before requiring approval for a project.

Selecting a **Worklog approval flow** in the issue's Moves Approval panel applies it to the next draft. A configured default flow can be used without selecting it again. This selector lives inside the app panel; it is not a native Jira custom field. Users can select an allowed flow but cannot disable the project's approval requirement. Another user's selection for the issue does not alter a draft and approval steps already submitted. An existing draft may become unavailable for registration if its Flow is removed from the allowed list, its approval-step structure changes, or the project policy is disabled. Transition flows remain automatically determined by separate project, issue-type and destination-status rules.

1. Enter the date, duration and description in a project requiring approval, then request approval. No Jira worklog is created yet.
2. Approvers review the fixed draft and approve or reject it. Changed content requires a new request.
3. Open the entry's detail from **My worklog approvals · registration status**, then select **Register approved worklog**. Registration uses the requester's own Jira permissions, preserving the requester as author. Check approval and registration states separately.
4. Once recorded in Jira, the entry becomes part of normal period timesheets. Entry pre-approval does not replace timesheet approval.

Before registration, the server checks permissions, locks and the current flow policy again. Policy or flow changes can require another approval. Disabling pre-approval does not automatically register older drafts. If storage is not ready or the policy cannot be checked, the app temporarily refuses new registrations.

**Unknown registration result** does not mean failure: Jira may have recorded the entry without returning a response. The app does not automatically resend the same approved request. Reconciliation keeps an unknown result even after finding candidates or completing a scan; support must verify the actual Jira record. Submitting the same content again before verification can create duplicates.

This approval gate covers new worklogs registered through the app. Existing-entry edits and deletions use current permissions and period locks, rather than the same creation-approval gate. REST, automation and other apps' direct registrations bypass this gate. Design Jira permissions accordingly; removing the requester's worklog permission also prevents the app from registering their approved entry.

## Close or reopen a period

Administrators can close and reopen periods in timesheet settings. Automatic closure is off by default; enable it by specifying days after the period ends. Reopening releases the closure lock only; submitted/approved-period locks remain separate. Reopening does not modify past decisions. Use My timesheet if resubmission is required.

To restrict nonmembers across Jira entry routes, the customer's Jira administrator must configure permissions such as **Work on work items** and project roles separately. Jira permissions do not express monthly or weekly time conditions.

[Timesheets](cloudjira--05-timesheet-guide.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--06-worklog-period-lock.md)

## Source-first certification and strict mode

Ordinary worklogs are recorded in Jira first. Select **Worklog certification after recording** on a row to query that source only. Its author can choose an available approval flow and **Request worklog certification**. Other authors cannot submit certification. The UI queries only the selected record, not every row.

States are UNVERIFIED, PENDING, VERIFIED, REJECTED and CHANGED_AFTER_VERIFICATION. A fixed fingerprint covers time, description and visibility; the source is checked again before final approval. Observed changes or deletion invalidate verification. Restoring old values does not restore verification automatically. Deleted sources may return a lookup error. There is no issue-wide certification list or complete historical backfill.

Existing WORKLOG_CREATE remains optional **strict approval before recording**: no Jira source before approval, then the requester records it manually. Worklogs are not created automatically. Certification, strict preapproval and period timesheet approval are separate procedures. Native, REST, automation and other-app writes are not universally blocked before recording. Provider selection and app-screen period lock boundaries still apply.

## Worklog policy hierarchy

Existing required project preapproval remains enforced. Selecting CERTIFICATION in the hierarchy alone does not disable that requirement. Check the editor's approval notice for the actual recording flow.

Policy keys inherit through site → Workforce project (including issue constraints) → Jira project → Jira issue. Open **Issue worklog policy and inheritance** in the worklog tab to inspect effective value, source, revision, lock and ignored overrides. Administrators override only selected keys; unchecking a key restores inheritance. Workforce locks cannot be weakened; comparable keys may be tightened beyond the authoritative floor.

Before create/edit/delete, review dates and operation windows based on the original date, submitted/closed-period locks, WARN/BLOCK and approval mode. BLOCK time limits read current totals immediately before execution and reject before Jira writes. WARN and legacy EXTRA_STEP time limits do not delay recording and are reported in timesheet preview/submission. PREAPPROVAL requires the existing approval flow and manual requester recording after approval. CERTIFICATION approves a Jira source already recorded. Moving an issue stops applying its previous project override; a new-project administrator can rebind an explicit override through a CAS that checks both the prior project and revision.

Verified Workforce policies remain effective for a 24-hour expiry grace. After grace, unlocked keys fall back to site/local values; locked keys block related operations. History comment retention defaults off. Current collection follows the effective issue setting; older history can remain readable after collection is disabled. Retention is site-only, with 0 meaning indefinite. Policy checks and Jira writes are not a single transaction against external changes, and native/REST/automation writes are not universally blocked beforehand.
