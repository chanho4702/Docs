## Access and source amounts

Cost read and project access are required. The screen summarizes labor cost by person and issue using the amounts and policy configured in project salary management. Users without financial access do not see the cost tab or amounts.

> **[Image insertion point · additional capture needed]** Cost summary, budget comparison, unpriced members, member costs, and issue costs. Use fictitious amounts.

## Check the results

- Review total labor cost and the unpriced-member indicator.
- Investigate people with zero calculated cost: missing salary or grade value, missing project dates, or an intentionally zero project amount can produce different outcomes.
- Distinguish the project's entered budget from calculated labor cost. They are different values.
- Monthly cost-consumption widgets on the dashboard provide an additional view with the budget line.

## Interpret with the salary policy

Individual policy uses the configured project amount or prorated annual salary. Level-band policy uses the level's representative annual amount, or a valid midpoint where applicable. Missing price information is a configuration gap, not proof that the work is free.

See [project people and labor cost](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046716) for calculation details and troubleshooting. App estimates are not a record of approved accounting payments.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Cost is estimated from salary policy and project dates, not approved accounting payments or a simple worklog-time total.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Budget / planned labor / actual incurred cost | Entered budget differs from salary-based planned labor. Incurred cost applies schedule elapsed to planned labor, so it is not simply actual logged time. | Check project dates, salary basis, and unpriced members. Missing pricing is not proof of free work. |
| Monthly burn / planned-actual / EVM | Compare schedule-based cost trends, plan, and progress. Chart/table switching changes presentation. | Distinguish cumulative from single-month amounts and check metric numerators/denominators. |
| Issue cost / estimated cost / cost per MD | Issue cost allocates incurred cost by worklog share; estimated cost applies a daily rate to actual effort days. These are distinct measures. | Distinguish an issue without worklogs from missing salary basis. Do not add cost and estimated cost together. |
| Role / level / team cost / chart-table | Switch role/level/team axes to compare planned labor, incurred cost, and headcount. Chart/table displays the same aggregation in a different format. | Teams follow current membership. Distinguish unready aggregation from zero cost; check financial access, policy, and aggregation time. |
| Issue row / member-cost drawer / Close | Click a row in the issue-cost table to open a side drawer with each member’s effort MD, cost, and share. Close dismisses the viewing panel. | Check the issue key/member and distinguish whole-project amounts from issue-level allocations. |



<!-- control-reference:end -->

