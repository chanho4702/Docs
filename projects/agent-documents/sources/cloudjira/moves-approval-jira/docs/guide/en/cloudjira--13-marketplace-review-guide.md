# Marketplace reviewer guide

This is a reproduction procedure, not a report of passed live-account tests. Provide the release candidate, installation link, test site and accounts privately to the reviewer.

## Preparation

Prepare a company-managed test project, author A, approver/team lead B, administrator C and user D without issue visibility. Configure the provider, teams and enabled projects. Status change and period timesheet scenarios are excluded from the current submission scope because the UI is not wired.

| ID | Procedure | Expected result |
| --- | --- | --- |
| R01 | A saves through an accepted route and requests approval; B approves | Distinct save/request results, individual approval and decision history |
| R02 | Reject another record; A reads the reason | Preserved rejection history and policy-compliant resubmission |
| R03 | Exercise save success with request failure | Retry on the same worklog ID without a duplicate record |
| R04 | Attempt to edit/delete an approved record in the app | Lock explanation and unchanged original |
| R05 | Close an unapproved test month; compare automatic closing set to 0 | Actual closing applies; 0 means automatic closing OFF |
| R06 | Request reconsideration with a reason | Review request with existing lock and certified time preserved |
| R07 | D accesses lists, details and exports; test another team | Restricted information is not returned |
| R12 | View and export approval/change history | Viewer scope preserved and file contents consistent |
| R13 | Optional: pair Workforce, record work, approve and test failure | Correct data ownership; failures do not grant permission |
| R14 | Release controls and prepare provider change/uninstall | Remaining controls checked and recovery verified |

Associate each result with the version, environment, time, role, record IDs and actual screenshots. Unit tests or screenshots alone do not prove permission rejection or transition execution. Exclude personal data and credentials from public evidence.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--13-marketplace-review-guide.md)
