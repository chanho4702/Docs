## Purpose and access

Public holidays determine working days and available MD. The sidebar currently uses Permission management read to show this entry; holiday changes require Public holiday management write. Holiday data itself is readable by screens needing working-day calculations.

A user with holiday access alone may not see the sidebar entry. Ask an administrator for a direct link rather than assuming the write permission is missing.

## Register a holiday

Add a name, date, and work ratio. The table provides edit and delete actions. The monthly 1MM working-day and hour basis is calculated from weekdays and public holidays and updates after changes.

> **[Image insertion point · additional capture needed]** Monthly 1MM basis, holiday rows, and Add holiday with name, date, and work ratio.

## Understand the work ratio

| Ratio | Meaning | Capacity deduction |
|---|---|---|
| 0 | Full day off | 1MD |
| 0.5 | Half working day | 0.5MD |
| 1 | Normal working day | None |

Weekend holidays do not create an extra deduction because weekends are already excluded. Personal leave is handled separately: full-day leave deducts 1MD, half-day leave 0.5MD, and an entry with a work ratio of 1 does not reduce capacity. Overlapping leave should not deduct more than the available day.

## Affected screens

Holidays affect My Work targets and calendar labels, project calendar labels, people-analysis capacity, schedule progress, the exclude-holidays option for period worklogs, and the issue panel's monthly MM conversion.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Holidays affect availability and monthly MM calculations. Organizational holidays and personal leave schedules are different data.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Year / monthly 1MM table | Review monthly working days/hours from that year's holidays/weekdays. Monthly 1MM is automatically calculated. | Do not assume 1MM is an arbitrary entered constant; check the year and daily hours together. |
| Add Holiday / name / date / work ratio | Set the organizational date and available work ratio: 0 full day off, 0.5 half-day availability, 1 normal working day. | Review duplicate-date/name notices and save. Do not interpret work ratio as time already logged. |
| Edit / Delete / verify monthly basis | Editing/deleting changes the organizational holiday and monthly workday calculations. | Check the holiday list/monthly MM table after saving; also check aggregation time for aggregated targets/utilization. |



<!-- control-reference:end -->

