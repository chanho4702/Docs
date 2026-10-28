# Data, security and privacy

This page explains product data behavior. It does not replace the vendor's privacy policy, contract or support policy.

## Information processed

| Information | Purpose |
| --- | --- |
| Atlassian account IDs, teams and roles | Identify authors, approvers and permitted viewers |
| Issue, project and worklog identifiers, work dates and duration | Link requests, aggregate time and compare current records |
| Requests, decisions, reasons and signature-related information | Process approvals and retain history |
| Worklog fingerprints, changes and descriptions according to settings | Detect changes and support audits |
| Connection state and cryptographic keys | Authenticate the optional Workforce channel |

App data is stored in Forge SQL and KVS. Original Jira records remain in Jira. Exported spreadsheets and certificates are separate customer-managed copies. Disabling full-description retention does not necessarily remove fingerprints or short previews.

## Access and integration

User-facing Jira access uses user permissions by default, with visibility checks for lists, details and exports. Events, worklog controls, validators and integration channels use limited app-permission paths where no user session is available. Automatic status application uses the requester's permissions.

When connected, the apps exchange organization, linked-issue, write-decision and approval-related information over a signed channel. Do not interpret this as a claim of **no outbound communication** or **Runs on Atlassian certification**. Consult the finalized vendor policies for support, data location, subprocessors and deletion requests.

## Retention and deletion

Code defaults for worklog-change history are 12 months for ordinary records and 36 months for linked records; certification and control history default to 0, meaning indefinite retention. Check the actual site settings. Reaching a retention age does not automatically delete every record. Export confirmation and protected-record exclusions apply.

Deleting an issue or losing permission can make its original content unavailable. Do not treat the app as an archive guaranteed to recover every deleted issue.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--11-data-security-privacy.md)
