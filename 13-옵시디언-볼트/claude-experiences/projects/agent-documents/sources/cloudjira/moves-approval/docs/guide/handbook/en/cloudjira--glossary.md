# Concepts and status reference

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--glossary.md)

Whole-page approval, area approval, and requests for earlier versions are separate records. First identify the target and requested version.

## Terms

| Term | Meaning | Distinction |
| --- | --- | --- |
| Request | One approval process for a target and version | A new request after closure is a separate record. |
| Step | A review stage that opens in order | May contain several people. |
| Approval line | Steps, approvers, and passing conditions | Saved lines are copied into new requests. |
| Approval group | People occupying one step | A Confluence group or an app-defined custom group. |
| Cc | Receives status information and notices | Does not grant decision permission. |
| Delegation | Another person decides during a period | Does not grant page view permission. |
| Stamp box | Steps, stamps, and dates shown in the page | Insertion alone does not approve content. |
| Target version | The page version under review | May differ from the latest page. |

## Status and next action

| Status | Meaning | Next action |
| --- | --- | --- |
| Pending approval | A step is active | Current-step approvers review it. |
| Approved | Every step's passing condition is met | Check the approved version. |
| Rejected | An approver ended the request by rejecting | Address the reason and create a new request. |
| Overdue | Deadline passed; scheduled expiry may be pending | Decisions are blocked; create a new request if needed. |
| Expired | Ended after the deadline | Request again with the appropriate deadline and line. |
| Withdrawn | An open request was cancelled | Create a new request if needed. |

Custom labels do not change processing rules. Read version information with the status rather than assuming approval applies to the latest page.

[Quick start](cloudjira--quick-start.md) · [Changes and resubmission](cloudjira--history-resubmit.md)
