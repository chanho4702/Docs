## Purpose and access

Use work analysis to compare planned effort with recorded work and investigate estimation or delivery risks. Report read and access to the project are required. Planned effort comes from Jira Original Estimate; actual effort comes from worklogs. Hours are converted to MD using the configured hours per day.

> **[Image insertion point · additional capture needed]** Work analysis: overview charts, filters, issue table, and a selected issue's detail panel.

## Overview charts

| Chart | What it shows |
|---|---|
| Estimation accuracy | Actual-to-planned effort for completed issues with estimates. Unestimated and unfinished issues are excluded and counted separately |
| Planned versus actual by assignee | Summed planned and actual MD. Unassigned issues form a separate group. The overview shows at most 15 people; use the table for the full result |

## Read the issue table

Filter by Jira space, assignee, status, or issue type. Excel export saves the current result.

| Field | Meaning |
|---|---|
| Status, assignee, participants | Ownership and collaborators |
| Start date and due date | Schedule |
| Planned effort, MD | Original Estimate converted to MD |
| Expected finish | Approximation based on planned effort, resources, and working days |
| Actual effort, MD | Accumulated worklogs, with a consumption bar and an overrun badge above 100% |
| Variance | Actual minus planned effort; shown for completed issues |

The effort colors distinguish within plan, overrun, and severe overrun. The standard ranges are at or below 100%, 100–130%, and at least 130%. A positive variance means more effort than planned; a negative variance means less.

## Investigate an issue

Select an issue to open its cumulative effort chart and original worklogs. The actual line is compared with a uniform planned line between the start and due dates. Today, due date, expected finish, and actual-minus-planned variance provide context.

Use worklog records to identify who worked, when, and for how long. High effort can indicate underestimated scope, rework, or blockers; it does not prove completion. An expected finish after the due date is a reason to review the plan.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Work analysis compares project issues' plans and cumulative effort, with worklog details for investigation.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Search / space-work filters / pages | Narrow the issue list and move between pages without editing worklogs. | Distinguish filtered-list results from whole-project figures. |
| Planned MD / actual MD / deviation / estimated end | Plan uses Original Estimate; actual uses Jira worklogs. Estimated end is derived from resources, plan, and workdays, not a guaranteed due date. | Distinguish over/under deviations for done issues from missing plans. Conversion uses working-hour settings. |
| Select row / View Analysis / expand / close | Inspect the selected issue's chart and worklogs in a drawer or expanded view. Closing does not delete data. | Check selected key/detail title and compare actual authors/durations. |
| Export Excel | Export analysis-list data, separately from organization-wide Worklog Export. | Check filters, targets, and units; interpret exported data within any partial-query limits. |



<!-- control-reference:end -->

