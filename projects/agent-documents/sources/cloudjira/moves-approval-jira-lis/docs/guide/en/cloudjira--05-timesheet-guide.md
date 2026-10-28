# Timesheet and team lead guide

The approval unit is **one user × one period**. Monthly approval is the default; an administrator can select ISO weeks. Period boundaries follow the configured time zone.

## Submit your timesheet

1. Open **Moves Approval → My timesheet** and choose a period.
2. Check daily and issue totals, worklog counts and guardrail warnings.
3. Review the team-lead routing and any exception steps.
4. Add an optional message and select **Submit**.
5. Open the submitted snapshot. Current worklogs may differ from that snapshot.

You cannot submit a period that has not started. Empty periods are allowed by default, but administrators can disable this. Ask an administrator to configure missing team or lead information.

| Status | Action |
| --- | --- |
| Not submitted | Review and submit |
| Submitted | Await a decision or withdraw your submission |
| Approved | The submitted snapshot was approved |
| Rejected | Review the reason, correct and resubmit |
| Changed after approval | Review current worklogs and resubmit |

Detected worklog changes during approval expire the pending request and require resubmission. Changes after approval preserve the earlier decision and mark the period **Changed after approval**. Event processing and reconciliation can delay detection.

## Review as a team lead

1. Open **Team timesheet** and choose a team you lead and a period.
2. Review each member's status, totals, violations and approval step.
3. Inspect the snapshot, select submissions waiting on you and approve the selection.
4. Provide reasons for rejection. Recheck failed items after bulk processing.
5. Export only the required scope to Excel.

Being a lead does not grant access to other teams. Information from issues you cannot view in Jira is restricted; do not infer missing details.

## Guardrails

The app checks daily and weekly limits, future dates and backdated entries. Policy can warn, add an exception step or block submission. Workforce violations may add further checks. Guardrails do not enforce pre-write restrictions across every Jira entry route.

[Period locks](cloudjira--06-worklog-period-lock.md) · [Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--05-timesheet-guide.md)
