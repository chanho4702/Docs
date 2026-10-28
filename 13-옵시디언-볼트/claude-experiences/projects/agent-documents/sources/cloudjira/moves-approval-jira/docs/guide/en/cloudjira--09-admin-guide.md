# Administrator guide

## Rollout order

Configure enabled projects, basic approval rules, standalone teams or Workforce pairing, approval policies and the time tracking provider, then test with regular users. Prepare the required directory entries and permissions before enabling app access restrictions.

| Setting | Operational meaning |
| --- | --- |
| Status change approval | Server defaults to off; settings UI is not wired, so excluded from the release scope |
| Workforce integration | Off by default; enabling and completed pairing are both required |
| Automatic worklog requests | Requests after saving; save and request outcomes are separate |
| Automatic closing days | 0 disables it; configure the organization's grace period |
| Full description retention | Off by default; fingerprints and short previews may still be retained |
| Worklog controls | Review the protection configuration, diagnostics and release procedure |

In connected mode, change teams, leads and Workforce-owned linked-issue settings in Workforce. Check the effective policy and its owner in Approval rather than editing the same responsibility in both apps.

## Records and capacity

Distinguish approval, certification, worklog-change and settings history in the administrator records views. Storage usage is an estimate, not a guaranteed real-time or billing measurement.

For retention cleanup: **choose a range → export → open and check the file, counts and dates → store it securely → confirm and clean up eligible records**. Protected approval ledgers, active certifications and source evidence are not necessarily deletable after export. Review growth and available capacity regularly for high-volume use.

## Incidents and changes

If a save or decision result is unclear, check the existing record ID and current state first. Understand the impact on existing approvals and locks before disabling features or reopening periods. [Release controls](cloudjira--06-worklog-period-lock.md) before uninstalling.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--09-admin-guide.md)

![Actual development capture ? Korean UI](../images/ko-policy-live.jpg)
