# Portfolio dashboard

[Guide home](codex-experiences--index.md) · [한국어](../ko/codex-experiences--portfolio.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Compare schedule, scope, resources, and cost across projects to decide where to investigate. The portfolio dashboard shows aggregated results rather than live data entry.

## Required access

Report read allows viewing; Report write allows reaggregation. Cost information additionally requires Cost read. Projects remain limited to your visibility scope.

## Recommended review sequence

1. Check the aggregation timestamp and status.
2. Select projects to compare.
3. Use the schedule, scope, and resource signals to choose projects for review.
4. Narrow the cause using the relevant comparison tab.
5. Open project progress, work, or people analysis to inspect the underlying issues.

| Perspective | Question to investigate |
|---|---|
| Schedule | Is completion keeping pace with elapsed schedule? |
| Scope | Is a large amount of work still unstarted? |
| Resources | Are overloaded and underused people appearing together? |
| Cost | What needs investigation when budget, estimated labor cost, and completion are compared? |

Traffic lights help select investigation targets. Green does not prove that no problem exists, and red does not establish its cause.

> Image candidate IMG-15: aggregation timestamp, project filters, traffic lights, and comparison tabs.

## Aggregation and filter considerations

- Recent worklog or staffing changes may not appear until the next aggregation. If permitted, request reaggregation and check completion.
- If a project retains its previous result after an aggregation failure, do not report it as current.
- Some organization-wide widgets use a different scope from the top-level project filter. Read each widget's explanation.
- Following a salary-policy change, cost display may be restricted until results are aggregated under the new policy.
- Organization-wide and project utilization may handle overlapping periods and denominators differently.

When topology is available, expand project, space, status, and issue relationships to investigate individual issues. Do not treat a capped or partially displayed graph as the complete dataset.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Portfolio compares multiple projects at an aggregation timestamp. A new worklog can be saved while displayed values still reflect an earlier aggregation.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Aggregate now / As of / partial failure | Request aggregation when authorized and refresh after completion. Failed projects can retain previous values. | Distinguish accepted/running/completed states and inspect As of/failure notices. Do not treat mixed-time values as all current. |
| Project selection / Select all / Clear | Select projects to compare; Clear does not delete stored data. Some company-wide metrics are independent of this filter. | Check each widget's company-wide/selected-project basis. Zero selections can show a prompt. |
| Time / Scope / Resource / Cost | Switch time/scope/resource/cost axes. Cost visibility follows financial access. | If Cost is absent, check ordinary view access and financial access separately. |
| Signals / table / chart / expand / row drilldown | Change presentation or drill into a project. Read signals with their calculation explanations. | Closing/view switching does not mutate data. Check the same filters/timestamp in expanded views. |
| Overview — T/S/R Signals by Project | T diagnoses completion against elapsed schedule; S uses the to-do issue share; R uses project average utilization. Utilization/to-do color boundaries follow current site settings and aggregation values. | The Resource (R) signal uses the project's internal average load, which differs from the company-wide utilization distribution (filter-independent). The completion behind Time (T) and Cost (CPI) approximates in-progress issues by effort consumption, so it may differ from actual deliverable completeness. The more red signals, the higher the overall risk. |
| Role / Level Distribution | Counts members per role (or level) for each project, shown as a stacked bar (y-axis = people). | Bar height is total staffing; segments show role/level mix. Compare staffing scale and composition across projects. |
| Utilization | Utilization = actual work ÷ available capacity. Numerator (actual) = worklog hours converted to days (MD; 1 MD = one workday's hours). Denominator (available) = workdays in the period (excluding weekends/holidays) minus leave/vacation. 1.0 = 100% (full load). Overall sums each person's project spans without overlap (a shared period counts once — no double counting) for the denominator; by project uses only that project's span. | Above 1.0 (100%) means overload; below means slack. Leave is subtracted from the denominator so people on vacation aren't underrated. Overall = 'is this person overloaded company-wide' (sums multiple projects, filter-independent); by project = 'who is overloaded in this project'. Different denominators, different meanings. |
| Project Schedule | Top bar = schedule elapsed (start–today, calendar-based; fill edge aligns with the today line). Bottom bar = completion (green, progress from start). Both bars fill relative to the full start–end span. | When the green (completion) end is left of the blue (elapsed) end / today line, progress trails the schedule — a delay signal. To the right means ahead of schedule. This is now compared directly on the chart. |
| Effort Trend | Plots effort (MD) per project as lines; switch month/week unit, cumulative mode sums values from the start. | By-period shows the effort rhythm; cumulative is the progress S-curve. Weekly gives a finer-grained trend. |
| Planned vs Actual Effort | Bars compare planned MD (planned) vs actual MD (actual). Burn rate = actual / planned. | Actual above planned means effort overrun; far below means unburned scope or delay. |
| Work Distribution — Members vs Effort | Each dot is one member's effort (MD); each bar is the project's average effort. | Widely scattered dots mean large per-member load variance. Bars compare project averages. |
| Top Risk Projects | Risk = max(0, schedule − completion) × 100 (%p). Higher means more progress delay vs. schedule. | Top bars are the riskiest projects. Color (red/yellow/green) indicates severity. |
| Problem Issues at a Glance (TOP 50) | Severity = delay days × 1 + max(effort diff, 0) × 2 — effort overrun is weighted 2× more than schedule delay (under-spend counts as 0). Shows the top 50 issues across all projects as bubbles. | Top-right (high delay and overrun) is riskier; bubble size is severity and grows more with effort overrun. Identify what to address first. |
| Issue Status Distribution | Plots issue counts done/inProgress/todo counts as a stacked bar per project (ratio mode normalizes by project total). | A large to-do share near a deadline signals scope risk; a higher done share means scope is more consumed. |
| Completion vs Schedule | Places each project's completion and elapsed schedule side by side as grouped bars. | When the completion bar is lower than the schedule bar the project lags; higher means ahead. Compare scope pace. |
| Cost at Completion | CPI = completion divided by elapsed schedule; when CPI is positive, estimated cost at completion = planned labor divided by CPI. With no elapsed schedule or zero CPI, the current view retains planned labor as a fallback. Equal bars do not establish absence of risk: also check CPI and progress. | An at-completion bar above its budget bar means the budget is exceeded if nothing changes. The line on top tells you how much more it costs if you do not act now. |
| Cost per MD | Cost per MD = labor cost ÷ effort spent. The reference line divides total labor cost by total effort, which is not the same as averaging the per-project rates. Projects with no effort spent cannot be divided and are left out. | Projects above the line are senior-heavy or cost a lot for the effort spent. A high rate is not bad by itself. The question is whether it matches how hard the work is. |
| Portfolio Cost Summary | Sum planned labor for selected projects; incurred cost sums each project’s planned labor multiplied by elapsed schedule. Burn rate = incurred divided by planned labor. Distinguish these from entered business budgets and actual accounting payments. | Read cost progression within the selected scope; do not compare it directly with completion for a different project scope. |
| Planned vs Actual | Places planned labor cost and actual (cost × elapsed schedule ratio) as bars per project. | The closer the actual bar is to planned, the more schedule has elapsed. The gap indicates remaining labor cost. |
| Cost Overrun Risk Ranking | CPI = completion ÷ elapsed schedule ratio. Below 1.0 means cost exceeds progress (risk). Lower sorts to top. | Top projects have the worst cost efficiency. Click a row to open the detailed cost analysis. |
| Burn Rate vs Completion | x = burn rate (elapsed schedule ratio), y = completion rate. Dashed lines at 0.5 split the quadrants. | Bottom-right (high burn, low progress) is the risk zone. Top-left (low burn, high progress) is efficient. |
| Portfolio Monthly Burn | Allocate selected projects’ incurred cost across months by actual MD shares and sum it. This can differ from the month of actual payment or cost incurrence. | Read monthly effort concentration and allocated costs together; this is not a monthly accounting-payment ledger. |
| Cost by Role / Level | Sum effective labor amounts by role/level across selected projects; incurred amounts apply each project’s elapsed schedule ratio. | Review cost concentration by role/level within the selection. Personal amounts remain subject to salary policy and financial access. |
| Workforce (RMS) Project · Status · Issue Topology | The Workforce hub connects the projects on screen. Work status counts per project come from the latest aggregation, and clicking a status expands its issues. | Follow the edge chain from Workforce through an RMS project to understand where work is concentrated. |
| Issue Completion vs Progress | Issue completion = finished issues ÷ all issues. Progress = completion weighted by planned effort, the same number the progress tab shows. Projects with no issues are left out. | The wider the gap, the more 'how many are done' and 'how far along are we' say different things. Use it to find the projects where a healthy issue count is misleading. |
| Assignees Carrying the Delays | Groups the global top 50 problem issues by assignee and shows the top 10; the top project filter does not apply. | If Unassigned is prominent, review ownership and actual reasons for delay. A person’s problem-issue count alone is not a performance evaluation. |
| Effort Concentration | Adds up each person's effort (MD) across the selected projects, sorts from most to least, and builds the cumulative share over everyone. The line above is the share held by the top 20% of people. | The sooner the cumulative line reaches 80%, the more the work sits with a few people. If any of them drop out, the schedule feels it right away. |
| Utilization and Effort | The horizontal axis adds up each person's effort (MD) in the selected projects. The vertical axis is company-wide utilization. Band colors follow the same rule as Resource Management and My Page. | Top right is someone carrying a lot of work who is also busy everywhere else, so relieve them first. Bottom right carries a lot but still has room, and top left is loaded by other projects. |
| Company Allocation Map | The same data as the project allocation tab in Resource Management. It shows who is assigned, which is not the same as effort actually spent. | Lines running from one person to several projects mean that person is assigned in more than one place. This card shows company-wide allocation regardless of the project filter above. |



<!-- control-reference:end -->

