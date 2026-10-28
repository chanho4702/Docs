# Request page approval

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--page-approval.md)

Request approval for an entire published page. Choose the review order, deadline, Cc recipients, and note. For only part of a page, use [area approval](cloudjira--area-approval.md).

**Location:** Published page → **Request approval** below the title. You can also open it from the page's `•••` menu.

## Before requesting

You need page edit permission and must satisfy the app's enabled-space and access policies. Approvers must be able to view the page under the default policy. If the same target already has an open request, review [how to handle that request](cloudjira--history-resubmit.md) first.

## Submit a two-step request

1. Choose **Pick approvers** and search by name or account to add the first approver.
2. Select **Add step** if another person should review after the first person. Adding another person to the same step has a different effect.
3. Review the step name and required approval count. Three people with a required count of two need two approvals to pass that step.
4. Use **Move up** and **Move down** to arrange steps. An approval group must occupy a step on its own.
5. Check the deadline, Cc, note, and stamp box option, then submit the request.
6. Confirm the steps, target version, and deadline on the created request.

If an administrator has prepared an approval line, select it under **Use an approval line**. Check its members, steps, and default deadline before submitting.

## Fields and results

| Field | How to use it | What to check |
| --- | --- | --- |
| Approver search / detailed search | Search by name or account, or select several people in detailed search | Check the account when names are similar. |
| Add step / order | A step opens after the previous step finishes | Separate review turns belong in separate steps. |
| Required approvals | Number of approvals needed to pass the step | Cannot exceed the step's member count. |
| Step name | Enter a purpose such as `Legal review` | The name identifies the review stage. |
| Deadline | Enter date and time; leave empty for no deadline | Review any policy or approval-line default. |
| Cc | Choose users or groups | Receives information, without decision permission. |
| Request note | Optional, up to 500 characters | Explain what needs review. |
| Add a stamp box to the top of the page | Adds one if the page does not already contain it | If inserted, the new page version becomes the target. |

## After submission

Only one request can be open for the same target. A request can succeed even if stamp insertion fails, so do not submit again just because the stamp box is missing. Use [manual insertion](cloudjira--stamp-box.md) if needed.

## Troubleshooting

| Symptom | Check in order |
| --- | --- |
| Cannot find an approver | Search term and account status → approver list → group settings |
| An approver cannot view the page | That user's direct page access → space and page restrictions |
| No saved approval line | Whether the line is enabled → its space assignment |
| A request is already open | Existing request status and deadline → withdrawal or resubmission |

Submitting a request does not approve the page. Follow its result in the [approval inbox](cloudjira--inbox.md) and stamp box.
