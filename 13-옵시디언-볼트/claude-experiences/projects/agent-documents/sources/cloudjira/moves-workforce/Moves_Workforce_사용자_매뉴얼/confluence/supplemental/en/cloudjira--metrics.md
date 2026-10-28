## Align the basis before comparing

This customer reference explains effort, utilization, progress, and cost. Align the period, included projects, work items and people, units, and aggregation timestamp. Missing or not-yet-aggregated values are not zero.

## Working days, MD, and MM

| Measure | Calculation |
|---|---|
| Working value of a day | Weekends 0, weekdays 1, public holidays use the configured work ratio |
| Base MD | Sum of each day's working value in the period |
| Recorded MD | Recorded hours divided by standard hours per day |
| 1MM | Working-day basis of the relevant month after weekdays and holidays |
| Recorded MM | Recorded MD divided by the applicable 1MM working-day basis |

For periods spanning months, check the monthly basis applied by the screen. Monthly charts use each month's own basis. With an eight-hour day, 16 hours is 2MD.

## Utilization and available capacity

Utilization is recorded MD divided by effective available MD. Capacity reflects elapsed working days, public holidays, and personal leave; future days are excluded. If capacity is unavailable or zero, read N/A rather than inventing a small denominator.

Overlapping schedules use the lowest work ratio for the day and cannot deduct more than that day's capacity. Organization-wide capacity counts overlapping participation dates for one person once. Project ratios cannot be summed or averaged to reconstruct that organization-wide denominator.

MM is absolute effort; utilization is relative to capacity. With 1.6MD recorded and 1.4MD available, utilization is about 114%. If that month's 1MM basis is 20MD, recorded effort is 0.08MM.

## Progress and delay

| Measure | Calculation and limitation |
|---|---|
| Completion | Sum of issue progress × planned MD, divided by total planned MD |
| Effort consumption | Accumulated worklogs; not a direct completion measure |
| Schedule | Elapsed project working days divided by total project working days |
| Completion–schedule gap | Completion minus schedule, in percentage points |

Done issues contribute 100%, To Do contributes 0%, and in-progress issues use actual divided by planned effort, capped at 100%. This is an approximation. Unestimated issues are excluded from the weighted denominator. The progress screen is a whole-project snapshot without an independent period filter.

Confirmed delay describes completed work finishing after its due date, separately from early completion. Predicted delay compares an estimated finish based on remaining effort with the planned finish. Predictions are optimistic approximations that do not fully model concurrency, dependencies, or resource contention.

## Portfolio T, S, and R signals

- T: completion minus schedule, compared with the configured progress threshold.
- S: the share of remaining To Do work, compared with configured caution and risk thresholds.
- R: underuse and overload based on utilization. A project's people-based signal and organization-wide utilization can have different denominators.

Use the installed site's settings. A progress threshold of 5 means **5 percentage points**, not 5 percent of another measure.

## Planned labor cost and salary policy

Individual policy uses a project amount or prorated annual salary. Level-band policy uses a representative annual value; a valid lower-and-upper-bound midpoint can be used where no representative value is specified.

Annual prorating uses calendar days including the end date, divided by 30.4375 for allocated months. Cost is annual amount ÷ 12 × allocated months. This is separate from MD/MM working-day conversion. People without a determinable price must be reviewed as unpriced.

Planned labor cost, entered budget, and accounting payments are different. The current consumed-cost KPI allocates planned labor cost by schedule progress; it is not a record of actual worklog-based payments. Worklogs can be used for issue-level allocation without changing that overall consumption basis.

Changing salary policy can hide incompatible cost snapshots. Requesting aggregation is not proof of completion; verify that the last aggregation timestamp changed.

## Team aggregation

Grouping uses current team membership. Responsible teams represent ownership; worklog teams represent actual contribution. People and issue counts are deduplicated within their applicable scope, while effort contributions are summed across projects. Team utilization and hierarchy rollups recombine numerators and denominators rather than averaging ratios.

Related guides: [Analysis and reports](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046926), [General settings](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047452), and [Glossary](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203817004).
