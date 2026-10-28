## Access and visible people

Resource management read opens the people list and detail drawer. Editing skills requires Resource management write, or an applicable self or team-lead path. Organization-wide viewers can see the permitted organization; team leads see the teams they lead under the applicable scope.

## Summary and filters

Review total people, available capacity, appropriate load, overload, and the last aggregation time. Utilization is aggregated in batches. Newly registered people or new worklogs may not appear until the next aggregation. Treat stale-data notices as part of the result.

Filter by skills, job role, level, team, job category, or available people only. Utilization bands are configured in general settings.

> **[Image insertion point · additional capture needed]** People list with utilization signals, filters, skills, and a selected person's detail drawer. Use an English screen for both languages.

## Table columns

| Column | Meaning |
|---|---|
| Person, team, role, level | Identity and job information |
| Utilization | Batch result, displayed with the applicable capacity band |
| Completion ratio | Consumed time divided by consumed plus remaining effort; done issues are included only when updated within the last 26 weeks; this is not a completion-date filter |
| Workload | Processed, remaining, and assigned effort; progress is processed divided by assigned |
| Assigned issues | Issues connected through assignment or collaboration |
| Participating projects | Active, unfinished projects |
| Skills | Registered skill tags |

## Detail drawer and skills

Select a row to open current load, in-progress issues, and project experience. Issue details include status, project, due date, participation type, and the person's estimated share. For shared issues, remaining effort is split equally among participants; this may differ from the actual division of work.

Use Edit skills where permitted. The choices come from the skill dictionary. These values support project-candidate fit. People can edit their own skills in My Page; team leads have an applicable My Team path.

## Troubleshooting

| Symptom | Check |
|---|---|
| No utilization data | Aggregation may not have run, or no worklogs exist in the relevant period |
| Only some people appear | Review the team-lead or organization visibility scope |
| A skill is missing from the filter | Register it in the skill dictionary first |
| Completion ratio is lower than expected | Done issues not updated within the last 26 weeks are excluded; the filter uses update time, not completion time |

<!-- control-reference:start -->

## Buttons, fields, and result checks

People overview inspects permitted people's current workload, skills, and project history.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Role / level / skills / team / descendants / available only | Combine filters to narrow candidates. Available only uses workload/utilization, without expanding account scope. | Check company-wide/led-team scope and clear filters to compare results. |
| Name / resource details / work / experience | Open a person's workload, in-progress issues, and project participation history. | Distinguish estimated remaining-work shares from actual worklogs. Project counts depend on active/ended status. |
| Edit skills / Save | Change a permitted person's selected skills, not role, salary, or permissions. | Check target name/skills after saving. Add dictionary entries separately in Settings. |
| Utilization / workload / completion | Read workload signals. Resource completion uses spent/(spent+remaining), unlike My Page's issue-count completion. | Done issues are included when updated within the last 26 weeks; this is not a completion-date filter. Check shared-work estimates and do not equate workload with productivity. |



<!-- control-reference:end -->

