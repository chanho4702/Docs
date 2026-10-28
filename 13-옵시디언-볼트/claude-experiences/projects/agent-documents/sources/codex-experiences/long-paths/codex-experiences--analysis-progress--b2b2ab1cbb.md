## Three separate measures

Progress analysis is a snapshot of the whole project now. Report read and project access are required. It distinguishes completion, effort consumption, and elapsed schedule; spending 80% of the effort does not mean 80% of the work is complete.

| Measure | Calculation and interpretation |
|---|---|
| Completion | Sum of issue progress × planned MD, divided by total planned MD |
| Effort consumption | Actual accumulated worklogs; an efficiency and risk signal |
| Schedule | Elapsed working days divided by total project working days, excluding weekends and applying holidays |

Done issues contribute 100%; To Do contributes 0%. In-progress issues use actual effort divided by planned effort, capped at 100%. This is an approximation, not a directly reported physical completion percentage.

## Primary signal

The headline gap is completion minus schedule, in percentage points. A negative gap means completion is behind elapsed schedule. The progress threshold is configurable; the standard threshold is 5 percentage points. High effort consumption with low completion deserves a separate efficiency review.

> **[Image insertion point · additional capture needed]** Progress screen showing completion, schedule, effort, the gap, S-curve, status distribution, and delayed or at-risk work. Use sample values.

## Read the screen

| Area | What to check |
|---|---|
| Summary | Completion, schedule, gap, delay badge, confirmed or predicted delay, expected finish |
| Comparison bars | A shorter completion bar than schedule indicates lag; a long effort bar alone indicates consumption |
| S-curve | Actual completion below planned completion can show widening delivery risk |
| Status distribution | Compare counts or MD; MD helps distinguish large from small issues |
| At-risk work | Unfinished overdue issues or large effort deviations needing action |

## Delay and limitations

Confirmed delay describes completed work finishing after its due date. Predicted delay compares an estimated finish from remaining effort with the planned finish. Predictions are optimistic approximations and do not fully model contention, dependencies, or parallel work limits.

There is no independent period filter: cutting only some measures to a shorter period would make the comparison inconsistent. Issues need Original Estimate for a meaningful weighted calculation. Review estimates, dates, and the expandable explanation before reporting the result. Dashboard progress widgets use the same concepts.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Progress uses project dates, current work status, and estimates; it does not provide the people-analysis period filter.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Completion / schedule / variance / estimated end | Compare completion with schedule elapsed. Distinguish issue-count completion from effort-based progress. | Missing dates/Original Estimate can produce a notice. Estimated completion is not a guaranteed deadline. |
| S-curve / comparison / status distribution | Read progress trends and current states without changing Jira statuses. | Review the configured variance threshold (%p) and formula together. |
| Delayed/at-risk work / original issue | Distinguish confirmed from predicted delays and open the original issue by key. | Inspect issue dates/assignee/estimates in the risk table; change plans in Work Management. |



<!-- control-reference:end -->

