# Moves Workforce integration

Moves Approval works independently. Integration uses Workforce-signed teams, leads, PMs and checks for timesheet routing, and publishes Approval-signed period states to Workforce. Installing both apps does not connect them automatically.

**Source review as of October 6, 2026:** Approval has settings, inbound verification and publishing, but its public key ring is empty. The reviewed Workforce source did not contain this contract's publishing/receiving implementation or administrator integration menu. Compatible releases, key deployment and live verification on both sides are required to complete these tests. This guide describes preparation, not certified integration success.

This integration approves **monthly/weekly timesheets of worklogs already recorded in Jira**. Unregistered drafts from [entry pre-approval](cloudjira--06-worklog-period-lock.md) are not published to Workforce as worklogs. Register an approved draft in Jira before applying normal timesheet and integration procedures. Checks or contract approval types do not convey approval states for unregistered drafts.

## 1. Installation prerequisites and responsibilities

Install compatible releases on the same Jira Cloud site. Copying properties from another site cannot connect the apps. Ask the supplier to confirm both releases, supported project types and signing-contract support. Supported version numbers are not yet finalized.

| Role | Preparation |
| --- | --- |
| Site administrator | Installation and required permission upgrades; test project/account visibility and worklog permissions; Workforce team/project data |
| Jira administrator or Approval settings manager | Project scope, local teams/leads, limits and exception group; toggle, diagnostics, republishing and test records |
| Supplier or deployment operator | Workforce publishing/receiving; public keys in both apps; environment-specific private key, ID and trusted peers; platform permission and scheduler verification |

Settings have no private-key entry/generation or public-key-ring editor. The supplier prepares encrypted Forge variable `MOVES_LINK_SIGNING_KEY`, ID `MOVES_LINK_SIGNING_KID` and, where needed, `MOVES_LINK_TRUSTED_KIDS`. Never put private keys in documents or tickets. Manually written properties are not valid integration data without a valid signature.

Maintain Approval's local teams, leads and exception group. Existing Workforce general settings and team administration are not this integration's activation menu. The supplier must provide the peer configuration route after that functionality is released.

## 2. Data directions and conditions

| Direction | Data | Conditions |
| --- | --- | --- |
| Workforce → Approval | Teams and leads (`rms.org`) | Verified data with approvers other than the requester supplies the first step. Leads view their verified team-member scope |
| Workforce → Approval | Project PMs (`rms.pm`) | Adds PMs for Workforce violations when policy adds an exception step; otherwise uses the exception group if PMs are unavailable. Local violations require that group, and both step types may appear |
| Workforce → Approval | Worklog checks (`rms.check`) | Combines planning/membership codes with local limits. Missing/invalid checks can create a missing-check violation for users declaring support. Jira responses without property support require capability verification |
| Approval → Workforce | Timesheet states (`approval.timesheet`) | Publishes user-period submission/approval/rejection/post-approval-change, closure, locks and snapshot fingerprints in annual user properties, such as `movesApproval.2026` |

General issue, transition and field approval publishing and pre-approved worklogs are outside this procedure. Workforce verification/display/cost or settlement use require a released, verified peer implementation. **Published** does not confirm peer processing.

## 3. Settings and signing status

Open **Moves Approval settings → Workforce integration** from Jira app administration, or **Moves Approval inbox → Settings → Workforce integration**. Settings managers use the inbox route. Regular requesters/leads may not have administrator diagnostics permission.

1. Check **Use Workforce integration**. Toggle changes save immediately. A default-on toggle does not connect missing peer functionality or keys.
2. Check the following under **Integration status**.
3. Have the supplier resolve missing prerequisites before the one-approval test.

| Screen item / diagnostic field | Meaning and action |
| --- | --- |
| Signing / `crypto.available` | Must show **Signing available**. Runtime self-test, not peer verification |
| Signing key / `signing.configured` | Correctly formatted private key and ID exist. Record ID/fingerprint; peer verification is not guaranteed |
| Key notice / `signing.inKeyring` | The embedded Approval public key matches the private key's derived public key. Even with **Workforce can verify this key**, separately confirm the peer release contains and trusts it |
| Trusted Workforce keys / `trustedPeerKids` | Allowed peer key IDs. Must contain the peer signing ID; **None** does not support successful receiving |
| Site information / `cloudIdKnown` | Site identity for signature binding has been learned. If not **Known**, reopen settings and recheck. Not app discovery or connection success |
| Storage notice / `storageReady` | Recheck later; persistent warnings need supplier migration checks. Zero counts here do not confirm no data |

Key IDs/public fingerprints may be included in support requests; private keys/PINs/tokens must not.

## 4. Read publishing and inbound diagnostics

**Approval status publishing → Publishing status → Normal** means no local publishing prerequisite currently blocks it, not successful peer receiving or a cleared queue. Resolve Off, No signing key, Signing unavailable, Site unknown or Storage not ready first.

| Display | Meaning |
| --- | --- |
| N pending | User-year documents requiring publication |
| N failed | Pending documents with at least one failed attempt |
| N repeatedly failing | Pending documents with at least eight failed attempts |
| N published | Documents published at least once; may also be pending/failed later |
| Last published / Last error | Processing time and clues. Errors may remain after other successes; assess with recent failures and pending counts |

Counts are documents, not approval requests, and overlap; do not add them. Updating an existing document may not increase the published count.

Under **Workforce data verification**, check verified/failed counts and Last verified for **Teams and leads** and **Project PMs**. Verified counts represent retained valid records; failed counts represent latest failed evaluations. The same record may count in both. Previously verified organization/PM values may be retained when remote data disappears or becomes invalid. Failures do not imply an immediate local-roster switch. Without usable verified data or eligible approvers, local routing is used.

**Worklog checks** shows only Last seen. That time or zero verified records cannot establish the state of every worklog. Check actual violations/routing in **My timesheet**. User activity triggers inbound reads; administrator diagnostics alone does not collect all peer data.

**Recent failures** shows up to 20 entries with Direction, Type, Target, Reason, Count and Last seen. Match targets/times to test accounts. This is not a complete historical or current-failure inventory.

## 5. Verify one approval step by step

After peer/key preparation, provide requester A, lead B, a test issue both can view, a short worklog and a period that has started. Use data without cost/settlement impact.

1. Administrator C records ID/fingerprint/trusted keys/site status and publishing/inbound counts and times.
2. The supplier confirms Workforce's A-team/B-lead publication. A and B each open Approval to read their own data; C rechecks diagnostics.
3. A verifies Workforce team/lead routing in **My timesheet** and submits. For local routing, check valid team data, an approver other than A and trusted keys first. Record the submitted snapshot.
4. B reviews A's snapshot in **Team timesheet** and approves. First verify completion and decision history in Approval.
5. C reopens settings and checks for publication after the test and related failures. Where necessary, the supplier checks A's annual property contains **that period's approved state**. Existing document updates may leave counts unchanged.
6. With the supplier, verify Workforce receiving/verification/display for the same A-period. If peer functionality is unavailable, record **Approval publication verified / Workforce receiving unverified**.
7. Test PM exceptions and check violations separately with extra-step policy, violations, PMs and an exception group. One ordinary approval does not verify those paths.

Publishing sweeps run every five minutes; some changes are detected after an approximately three-minute settling interval. Queue size/retries extend delays; inbound caches normally last five minutes. Immediate reflection is not guaranteed. Record versions, roles, period, request ID, times and screens separately from live results in the [reviewer guide](cloudjira--13-marketplace-review-guide.md).

## 6. Republishing buttons and scope

Resolve the cause first. Success means **scheduled**, not an immediate Jira write or peer receiving. Scheduling is unavailable with integration off or signing/storage prerequisites missing.

| Button | Scope |
| --- | --- |
| Retry failed | Resets attempts/waits for pending documents with failed attempts, including repeatedly failing ones. Disabled when failed count is zero |
| Republish all | Schedules current/previous-year reconstruction according to configured time zone/unit. Targets users with timesheet history for those years, local team members and users/members in verified organization data. Not every Jira user or historical year |

There is no user/period selector. Unchanged content/key skips writes; users with nothing to publish for the first time may receive no empty document. Report **Too many users** to the supplier. Check scheduling results, the next sweep and pending/failed counts rather than clicking repeatedly.

## 7. Troubleshooting and support evidence

| Symptom or reason | Action |
| --- | --- |
| Missing key / embedded-key warning / no trusted keys | Supplier aligns environment private keys, IDs, both public key rings and trust lists, then deploys. Toggle/republishing alone cannot fix it |
| Unknown key / Untrusted key / Signature mismatch | Compare peer ID/fingerprint/version/environment/site. Request valid supplier publication rather than editing properties |
| Malformed / Unsupported version / Signed in the future / Older revision | Supplier checks contract/time/revision. Do not recover by copying old data |
| Write denied / HTTP 401 or 403 | Supplier checks app user-property permissions and installed version. Consecutive denials may show **Jira denies writing user properties**. Increasing personal edit rights alone may not fix it |
| Publish failed / HTTP 429, 5xx or network | Check rate limits/temporary outages and wait for retries. Waits start at five minutes and increase; eight failures trigger 24-hour intervals. Retry failed resets waits after the cause is fixed |
| Approved but no publication | Check enablement/keys/site/storage/scheduler/queue. Existing user-year documents do not increase counts; check period state and last time |
| Publishing normal but no Workforce display | Check peer receiving/version/Approval-key trust/account/period. Successful display is unavailable before peer functionality is ready |
| Removed or altered (previous value kept) / Does not match worklog | Could mean retained organization values or stale checks. Check current data/worklogs and supplier republishing; old verified counts are not proof of health |
| Altered, republished / Missing, republished | Daily reconciliation detected changes/deletion. Check cause and subsequent publication |
| Too large / Too many users / persistent Storage not ready | Supplier checks size/scope/migrations. Do not delete data arbitrarily |

Include both versions, environment/site, time/zone, user/period/request ID, publishing/inbound screens, recent failure direction/type/reason/count, key ID/public fingerprint, republish scope/time. Redact descriptions/personal data and exclude private keys/PINs/tokens. Suppliers diagnose HTTP statuses; not every status is shown directly in the screen.

## 8. Disabling, recovery and data limitations

Turning **Use Workforce integration** off stops new publishing/inbound verification and uses local teams/limits. It does not delete existing properties or retroactively rewrite open approval lines. Check whether the peer uses retained publications. Deleting data alone does not replace disabling because previously verified values may remain.

Disable/recovery checklist:

- [ ] Prepare local teams/leads/exception group and test a regular user's new submission.
- [ ] Record pre-change screens and handling rules for open requests, approvals and peer settlement.
- [ ] Turn integration off and verify local routing for new submissions.
- [ ] Agree with the supplier on retained-property cleanup; the toggle does not delete them.
- [ ] Check compatible versions/keys/site/permissions before recovery.
- [ ] Turn on and verify one approval, required republishing and peer receiving.

Inbound access uses user Jira permissions; background publishing/reconciliation uses limited app permissions. Integration grants neither issue visibility nor access to other teams. Signatures validate origin/content/site/target binding, not encryption or privacy. Identifiers/states/fingerprints in properties remain subject to Jira visibility. Restricted worklog visibility may cause differing fingerprints; verify approved-work calculations live too.

[Timesheets](cloudjira--05-timesheet-guide.md) · [Data, security and privacy](cloudjira--11-data-security-privacy.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--10-workforce-integration.md)

## Worklog policy hierarchy

Worklog policy reception uses typ **rms.policy** and Jira property **movesRms.policy**, published on a project and optionally as an issue constraint. Envelope: `{v:1,typ:'rms.policy',iss:'moves-workforce',cloud,ent:{projectId,issueId?},iat,exp,kid,body:{rev,values,locks},sig}`. Values are sparse overrides; locks are booleans for keys present in values. Do not publish site-only historyRetentionMonths/approvalUnit/timeZone.

The signed message is UTF-8 `moves-link/policy/1\n` plus canonical JSON of the envelope excluding sig, verified with Ed25519. Configure the trusted WORKFORCE public keyring and trustedKids, and match issuer, cloud, project/issue, five-minute future skew, maximum 30-day TTL, expiry, key.notAfter and signature. The default keyring is empty. Installing both apps or enabling integration does not provision keys. Sender fixtures, provisioning and live Forge property support remain unverified. Never disclose private keys in guides, issues or screenshots.

A project administrator selects **Refresh Workforce policy**. Refresh uses asUser property GET; runtime reads only verified SQL cache. Lower revisions are STALE_REV; different body/expiry at the same revision is EQUIVOCATION. Identical documents return UNCHANGED without UPDATE. Invalid candidates retain the last verified policy and record failure metadata, so a prior valid policy can remain effective after refresh failure.

States follow FRESH → 24-hour STALE expiry grace → EXPIRED. After grace, unlocked values fall back to site/local policy; locked keys block related writes. Comparable keys may be tightened beyond the Workforce floor; non-comparable keys such as comment retention cannot be locally overridden.

Cost: resolve uses at most three scope SELECTs per 100-issue chunk, with no runtime property N+1. Refresh accepts up to 100 issues with concurrency five and a 20-second budget; deferred targets return BUDGET_DEFERRED and require another refresh. No new schedule is added. Existing sweeps exit early when history and tracked certification are absent, but conservative positive hints and tracked certification can keep scans running. Measure total-limit Jira reads and latency on-site. Diagnostics cover the current response; Jira calls are a route budget, not measured physical calls.
