# Project calendar

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--calendar.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Use the project calendar to review participants' worklogs and the schedules of linked issues by date. Use My Work when reviewing only your own work.

## Review the calendar

1. Open the calendar in the project details. You need Project read and access to this project within your visibility scope.
2. Move to the required month or week.
3. Narrow the results using person and task filters.
4. Select worklog or issue display mode.

| Mode | What it shows |
|---|---|
| Worklogs | Time actually recorded and daily totals |
| Issues | Schedules shown from start date to due date |

You can also review holidays and project events. Check unscheduled work in the unscheduled-issues list and set its dates in [work management](cloudjira--project-work.md).

## When results differ from expectations

- For missing worklogs, check the period, author, and issue links.
- For missing issue bars, check issue mode and whether dates are set.
- Editing a worklog requires the author's own editing access.
- For multi-day events, check both the start date and the last displayed date.

These are the same worklogs used in Jira and My Work. Use [people analysis](cloudjira--analytics.md) for individual effort trends. The mode comparison is explained in text; a separate screenshot is not mandatory.

<!-- control-reference:start -->

## Buttons, fields, and result checks

The project calendar shows project-scoped schedules/records, with a different population from personal My Work.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Today / previous-next / month-week | Change the displayed date/scale without editing project or issue dates. | Check the heading's period and selected project. |
| Worklog / issue display | Worklogs use actual logged dates/time; issue schedules use start/due dates. The same issue can appear at different dates by mode. | Distinguish out-of-period records from issues lacking schedule dates. |
| Issue/entry details / unscheduled list | Select a target to inspect key/name/period/time. Check the unscheduled list for work missing start or due dates. | An authorized user can set planning dates in the Work Management Gantt. Do not confuse calendar viewing with logging time. |



<!-- control-reference:end -->

