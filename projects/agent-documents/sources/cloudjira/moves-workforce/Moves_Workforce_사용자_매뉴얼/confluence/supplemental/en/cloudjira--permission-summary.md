## Default sets and actual access

This is an explanatory document. Check My Page → My permissions for your actual set and project scope. Defaults can be changed by an administrator; the installed site's settings take precedence over a default example.

| Feature | Admin | Default Member |
|---|---|---|
| My Work and My Page | Available | Own data; underlying Jira access still applies |
| Jira issue panel | Available where installed | Requires the relevant Jira access; panel availability depends on the installed version |
| Project list, Kanban, and work views | Read and write | Read-only where the relevant read permission is included |
| Project or status changes | Available | Not granted by default |
| Work edits, bulk updates, inclusion, subscriptions, Tree/Gantt editing | Available with Jira access | Project write is required |
| Document list | Available | Project read is required |
| Link, classify, or unlink documents | Available | Project write is required; issue links also need Jira Edit Issues |
| Project dashboard and analysis | Available | Corresponding Dashboard or Report read is required |
| Portfolio reaggregation | Available | Report write is required |
| Salary and cost | Available under policy | Cost access is not granted by default |
| Resource management | Available | Requires Resource management access |
| Worklog export | Available | Requires Worklog export access; older installations may enable only Admin |
| Settings and reference-data changes | Available | Corresponding write permission is required |
| Holiday view | Available | Data is read for calculations; sidebar visibility uses a separate gate |

Admin does not replace Jira product permissions. The issue panel can be absent in a particular installation; My Work provides the alternative worklog route.

## Permission categories

| Category | Read | Write |
|---|---|---|
| Project | Lists, details, people, work views, calendar, documents | Project, people, and work changes; bulk operations; subscriptions; document changes; history-tab availability |
| Dashboard | Project dashboard | Widgets, layout, and custom filters |
| Kanban | Board | Card moves and column changes |
| Report | Analysis, portfolio, analytical widgets | Portfolio reaggregation |
| Cost | Salary and cost views, monetary widgets | Permitted salary changes |
| Resource management | People, organization, teams, candidates | Skills and assignment under the applicable scope |
| Worklog export | Export screen | No separate write workflow |
| Settings categories | Corresponding setting | Corresponding edits |

## Project visibility scope

| Scope | Projects shown |
|---|---|
| All projects | All authorized app projects |
| Participating projects | Projects where you are registered as a member |
| My team | Projects associated with your applicable team, led teams, and child teams; no valid team can mean an empty result |

Jira administrators and the Admin set have the applicable all-project exception. Check project visibility and organizational people scope separately. Resource read alone does not always grant the full directory. Authorized organization-wide users see the full scope; team leaders see their permitted led teams and descendants. Without an allowed scope, organization analytics are restricted. Worklog export and Jira issue panels use Jira access rather than this app-project scope.

## Diagnose a missing screen

1. Check My Page → My permissions and project scope.
2. Identify the category and whether read or write is required.
3. Ask the administrator for that specific access rather than a job-role change.
4. For a missing project, check project membership or team assignment.
5. Check Jira Browse Projects, issue security, editing, scheduling, assignment, or linking as applicable.

See [Permissions and data visibility](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047763) and [My Page](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046526). Access checks apply to returned data as well as visible controls.
