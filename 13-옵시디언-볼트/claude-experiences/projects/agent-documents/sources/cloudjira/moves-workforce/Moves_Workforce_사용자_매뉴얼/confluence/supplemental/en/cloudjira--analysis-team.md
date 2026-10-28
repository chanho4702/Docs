## Responsible teams and contributing teams

Project team analysis compares the project's assigned responsible teams with teams that recorded worklogs in the selected period. It requires Report read, Project read, and access to the project.

| Relationship | Interpretation |
|---|---|
| Responsible and contributing | Assigned ownership and recorded contribution agree |
| Responsible without contribution | The team owns the project but has no worklog contribution in the selected period |
| Contributing without responsibility | A team outside the assigned ownership list has contributed work |

## Period and membership

Select a period when reviewing actual contribution. Team grouping uses current membership. It does not reconstruct the organizational assignment a person had when an old worklog was entered.

## Cost visibility

Team cost is shown only with Cost access. Where it is labeled as the whole-project cost, it covers the project's full period and is independent of the worklog period filter. A hidden amount does not mean zero cost.

Use differences between responsibility and contribution as a prompt to review staffing or ownership. The app does not automatically change responsible teams to match the worklogs.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Project team analysis compares responsible teams with actual contribution. Assignment and recorded contribution do not automatically coincide.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Period / team contribution | Compare effort recorded in the selected period by members grouped under current teams. | After membership changes, historical work can be grouped under the current team. |
| Assigned teams vs contribution | Compare project team assignment and worklog contribution as separate axes. | Inspect assignment-without-effort and contribution-without-assignment. Do not read failed loading as no assignment. |
| Team cost | View team labor cost with financial access. Distinguish contribution dates from the salary/schedule cost basis. | Distinguish denied access from zero cost and check personal/level policy. |



<!-- control-reference:end -->

