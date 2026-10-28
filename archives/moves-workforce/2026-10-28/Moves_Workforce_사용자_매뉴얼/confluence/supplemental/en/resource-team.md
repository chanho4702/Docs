## Access and data axes

The team-analysis area can be entered with Report read, Resource management read, or Team management read. The entry permission alone provides people and utilization indicators. Effort, progress, and risk axes require Report read. Labor cost additionally requires Cost access and a snapshot compatible with the current salary policy.

Lacking Report permission does not necessarily hide the whole tab. Restricted axes are hidden with an explanation.

## Scope and widgets

Organization-wide access together with all-project scope provides the authorized organization. Team leads see the teams they lead and their child teams. Scope is determined by the app; a filter cannot widen it.

Filter by team and project. Widgets include KPIs, team investment by project, utilization distribution, comparisons between teams, role and level composition, utilization-versus-size scatter plots, and hierarchy rollups.

> **[Image insertion point · additional capture needed]** Team and project filters, KPIs, team comparisons, utilization scatter plot, and hierarchy rollup. Use non-sensitive examples.

## Interpretation and limitations

- Grouping uses current team membership, not historical membership at the worklog date.
- Future capacity is excluded from utilization calculations.
- Read notices about projects that have not been aggregated; they may appear after the next batch.
- The documented large-population limit disables team filters and team views above 500 people. Check notices in the installed version.
- Rollup ratios combine numerators and denominators; they are not simple averages of child-team percentages.

## Three different team views

| View | Question | Scope |
|---|---|---|
| My Page → My Team | How is the organization I lead doing? | Led teams and their children |
| Project → Team analysis | Does project ownership match actual contribution? | One project |
| Resource management → Team analysis | How do teams compare across projects? | Authorized organization or led teams |

<!-- control-reference:start -->

## Buttons, fields, and result checks

Team analytics uses distinct populations for organizational headcount, active people, and people with utilization.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| All visible teams / teams I lead | Analyse currently permitted teams. A leadership-scoped result is not a company total. | Check excluded unassigned/other-team people. REPORT/cost access can restrict corresponding metrics. |
| Project / status selection | Narrow active-project effort/cost/progress. Company-wide utilization columns can be independent of the project filter. | Read asterisked-column explanations and filter coverage. |
| Direct / total including descendants | Direct means this team; total includes descendants. Summing every hierarchy row double-counts. | Team utilization need not be a simple personal average; check the population basis. |
| Compare axis / Show as % / chart-table | Change metric/presentation for comparison. Effort/cost metrics require analytics access. | Assigned teams without logged effort can be absent from contribution charts; distinguish them from assignment graphs. |



<!-- control-reference:end -->

