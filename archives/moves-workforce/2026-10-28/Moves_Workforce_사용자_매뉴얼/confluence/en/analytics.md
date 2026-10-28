# Reading analysis and reports

[Guide home](./index.md) · [한국어](../ko/analytics.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Analysis provides different views of work, people, teams, progress, and cost. Before comparing figures, align the period, included issues and people, units, and aggregation timestamp.

## Required access

General analysis uses Report read and project visibility scope. Cost analysis also requires Cost read. Separate tabs such as work history follow their applicable project permissions.

## Analyze work and people

1. Select a period in people/team analysis. Distinguish it from cumulative work figures and whole-project progress/cost.
2. Compare planned effort with actual worklogs in work analysis.
3. Review time, MD, MM, and utilization by person or team in people analysis.
4. Investigate unusual values using the person's or issue's detailed worklogs.

| Measure | Meaning and example |
|---|---|
| MD | Recorded hours ÷ standard hours per day. At 8 hours per day, 16 hours is 2MD |
| MM | MD ÷ the working-day basis for 1MM applied on that screen |
| Effective available MD | Available working capacity in the period; check holiday and leave treatment |
| Utilization | Recorded MD ÷ effective available MD. 8MD ÷ 10MD = 80% |

Project utilization and organization-wide utilization can use different populations and denominators. A team ratio should not be interpreted as a simple average of individual ratios.

## Three views of progress

| Measure | Question it answers |
|---|---|
| Completion progress | How much is completed, accounting for planned effort? |
| Schedule progress | How much of the project's working period has elapsed? |
| Effort consumption | How much time has actually been spent? |

If completion is 40% and schedule progress is 60%, the gap is -20 percentage points. Completion is behind elapsed schedule. Spending 80% of the effort does not mean that 80% of the work is complete.

Missing estimates or project dates can prevent a meaningful calculation. Expected finish dates and predicted delays are approximations; consider issue deadlines, dependencies, and actual staffing as well.

> **[Image insertion point · Additional capture required]** Progress — completion, elapsed schedule, effort, and at-risk issues shown together.

## Team and cost analysis

- Responsible teams describe ownership; contributing teams describe recorded work in the selected period. Different lists do not automatically indicate an error.
- Team analysis may use current membership. Do not treat it as a reconstruction of historical organizational assignments.
- Budget is an entered amount. Labor cost is calculated using salary policy, period, and allocation assumptions. Estimated app costs can differ from confirmed accounting payments.
- If team cost is labeled as covering the whole project, distinguish it from the worklog period selected above.

## When figures do not match

Check the period → project, member, and issue scope → working-hour and holiday settings → planned effort → aggregation timestamp. If the screen reports missing, partial, or stale data, do not present the result as complete.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Analysis views use different date bases. Distinguish views with date controls from whole-project/current-state views.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Work / people / team / progress / cost / history | Work compares issue plans/cumulative effort; people/team use worklogs in a selected period; progress uses project dates/current issue status; cost uses the project cost basis; history uses app inclusion dates. | Align periods, populations, units, and aggregation time before comparing tabs. |
| People/team quick period / dates | Default is the first day of this month through today; choose Today/This week/This month/Last week/Last month or custom dates. | Check actual dates after a quick selection. Do not assume progress/cost has the same date filter. |
| MD / MM / capacity / utilization | MD divides recorded hours by daily hours; MM divides MD by the applicable monthly workday basis. Utilization divides effort by effective capacity. | Check hours, holidays, personal schedules, and zero denominators. Distinguish unavailable calculation from actual zero. |



<!-- control-reference:end -->

<!-- supplemental-guides:start -->

## Detailed guides

- [Work analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046946)
- [People analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046982)
- [Project team analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047018)
- [Progress analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047050)
- [Cost analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047088)
- [Work inclusion and change history](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047131)

<!-- supplemental-guides:end -->
