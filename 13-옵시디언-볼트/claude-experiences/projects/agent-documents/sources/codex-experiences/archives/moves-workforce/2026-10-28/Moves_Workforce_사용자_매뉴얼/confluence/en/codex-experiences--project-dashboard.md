# Project dashboard

[Guide home](codex-experiences--index.md) · [한국어](../ko/codex-experiences--project-dashboard.md)

> Review draft: English screenshots were captured on the designated staging site on 2026-10-04 and are shared by both language guides. The deployed version and role-specific access and save operations remain under review.

The project dashboard brings together summaries and charts for one project. Use it to arrange the measures your team reviews regularly.

## Required access

Dashboard read allows viewing; Dashboard write allows widget and layout editing. Analytical widgets additionally require Report read, and cost information requires Cost read. Some amount-based widgets also depend on salary policy.

## Set up the dashboard

1. Open the project's dashboard.
2. Review its summary and existing widgets.
3. If you have editing access, enter edit mode and open the chart selection.
4. Choose widgets for your review and adjust their size and position.
5. Save, then check the layout and filters in viewing mode.

Start with widgets that support decisions, such as work status, planned versus actual effort, and progress trends. If a widget has no data, check issue links, estimates, and worklogs.

## Before interpreting measures

| Check | Why it matters |
|---|---|
| Project, period, and filters | The same measure can differ when its population changes |
| Cost access and salary policy | A hidden amount does not mean zero cost |
| Planned effort | It supplies the basis for progress and plan comparisons |
| Widget explanation | It identifies the calculation and scope |

Custom-filter widgets collect issues matching conditions such as assignee, status, and type. If too few issues appear, remove filters one at a time to identify the cause.

![Sample project dashboard with workforce and duration summaries and distribution widgets.](../images/en/05-dashboard-overview.jpg)

Sample project dashboard with workforce and duration summaries and distribution widgets.

Use [Analysis and reports](codex-experiences--analytics.md) for detail, or the [Portfolio dashboard](codex-experiences--portfolio.md) for comparisons across projects.

<!-- control-reference:start -->

## Buttons, fields, and result checks

The project dashboard manages widget data and layouts. Removing a chart differs from deleting issues/worklogs.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Edit / Finish Editing | Change widget position/size in edit mode and save the changed layout when finishing. This saves the project dashboard configuration. | Check the success notice and layout after reopening. Distinguish a moved on-screen item from a confirmed saved layout. |
| Add Chart: Recommended / Custom / Add all | Choose recommended layouts or specify data/chart type/name. Add all adds currently visible widgets and skips existing ones. | Unavailable cost widgets need not indicate an error. Heavy marks widgets that can load slowly on large projects. |
| Chart name / filter editing | Save that widget's title and supported filters such as assignee/status/type/priority/due/estimate. | Distinguish resetting conditions from saving them. Supported filters vary by widget, so populations can differ within one dashboard. |
| Remove widget | Remove the chart configuration from the dashboard, not Jira work, salary, or worklogs. | Add the widget again if needed; its former title, filters, and layout may need reconfiguration. |
| Expand chart / table view / tooltip | Use supported widgets' expanded/table views. Tooltips help inspect values, units, and populations. | Check period, filters, and formula before comparing numbers. Distinguish an empty chart from a loading error. |
| Role Distribution | Analyze the composition of project members based on their roles. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Level Distribution | Understand team capability and balance by analyzing the distribution of skill levels. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Salary Distribution | Analyze cost structure and spending concentration through salary range distribution. | Requires cost read and a policy permitting personal amounts. Individual salary-distribution widgets cannot be added under level-based policy. |
| Issues by Assignee | Analyze how issues are distributed among assignees. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Issue Distribution | Analyze the distribution of participants involved in issues. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Worklog | Analyze workload concentration based on issue status or time period. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Team mix | Breaks project members down by the team they belong to, showing how much each team is committed. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Status Distribution | Splits issues into Done / In Progress / To Do to show the current progress mix. Switch between issue count and effort. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Planned vs Actual | Compares total planned effort (MD) with actual effort spent to reveal under- or over-estimation. | Requires Report read. Check hours per MD and missing estimates. |
| Relation Topology | Shows issues linked to the project along with sub-task, issue-link and workforce-parent relations. Circle size is time spent, so costly issues stand out. | Requires Project read. Check relation types; edit relationships in Work Management. |
| Overdue & Upcoming | Lists unfinished issues that are past due or due soon, ordered by risk. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Issue Size | Compares which issues take the largest share of work by area. Switch between time spent and planned effort. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |
| Progress Trend | Compares planned and actual cumulative effort over time (S-curve). Uses the same data as the Progress tab. | Requires Report read. Check project dates/plans and distinguish cumulative effort from completed deliverables. |
| Cost Burn-up | Compares cumulative monthly labor cost against the budget line. Uses the same data as the Cost tab. | Requires cost read. This is estimated monthly cost, distinct from accounting payments. |
| Custom Filter | Pick assignee, status, type, priority, due and estimate conditions to gather exactly the issues you want. | Check title, legend, and units. People counts, issue counts, and effort are distinct measures even in one project. |



<!-- control-reference:end -->

