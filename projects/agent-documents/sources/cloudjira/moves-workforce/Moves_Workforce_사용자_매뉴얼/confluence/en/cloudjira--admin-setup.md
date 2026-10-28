# Administrator setup and operational checks

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-setup.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Prepare the app so users can open it, record work, and see the correct data. Your organization's app-installation administrator handles installation; customer administrators then manage organizational settings in the app.

## Before setup

- Check that Moves Workforce is installed on the intended Jira site and has an active license available.
- Check that the initial setup owner can access the app with Jira administrative permissions.
- Check that operational administrators and users have Jira accounts and the necessary project access.
- Distinguish development, test, and production sites and confirm which site you are changing.


<!-- detailed-walkthrough:start -->

## Practical first-installation setup

Start with an installation/setup administrator, one real Jira user, and one accessible Jira issue. Prepare a same-site Confluence page only if you need the document feature. Values below are examples; use your organization's operating standards.

| Order and menu | Action | Check before proceeding |
|---|---|---|
| 1. Jira Apps → Moves Workforce → Settings | Check the installed site and administrator access; prepare operational administrator permissions. | Settings opens on the intended site. |
| 2. Settings → General Settings | Check/set the currency and daily working hours, such as 8 hours, and prepare holidays. | Currency and hours match organizational standards. Do not assume MM is a separate arbitrary input; review the [calculation basis](cloudjira--analytics.md). |
| 3. Roles, levels, skills, project statuses | Prepare the options used by people and projects. | Required options appear in user/project forms. |
| 4. Users and teams | Register real Jira accounts as app users, then set team membership and leadership. | User and team relationships appear in the lists. Register a leader as a user first. |
| 5. Permissions | Set the necessary read/write permissions and visibility scope for users and leaders. | Their accounts can open permitted views without seeing out-of-scope data. Distinguish member management from cost access. |
| 6. Salary/cost basis | Prepare the salary policy and used level or individual amounts only when operating cost features. | An authorized cost user can review the basis. Do not invent monetary values just to begin worklogging. |
| 7. Project Management | [Create the example project](cloudjira--projects.md), [add its member](cloudjira--project-people.md), and [link the Jira issue](cloudjira--project-work.md) separately. | Both the intended member and issue appear in their respective project lists. |
| 8. My Work | Follow [Quick start](cloudjira--quick-start.md) with an actual work date to add one worklog. | The app and Jira show the same issue, date, and duration. |
| 9. Document Management (optional) | Follow the project/work-item examples in [Document linking](cloudjira--documents.md). | The correct target is linked and the original Confluence page opens. |

Before opening the app to the organization, ask ordinary users and team leaders to check access using their own accounts as well as checking the administrator account. For a user without cost access, verify that costs/personal amounts are unavailable; for a leader, verify the allowed team scope. Record the screen path, issue key, time, and error message when something fails, then resolve app permissions or Jira access first. This is a verification checklist, not a claim that your site's live validation has been completed.

<!-- detailed-walkthrough:end -->

## Setup sequence

| Step | Configuration | Completion check |
|---|---|---|
| 1 | Register operational administrators and assign access | They can open Settings |
| 2 | Currency, daily hours, MM calculation review, and holidays | Values match organizational standards |
| 3 | Roles, levels, skills, and project statuses | Choices are available for users and projects |
| 4 | Users, teams, and leaders | Register users first, then check membership and leadership |
| 5 | Read, write, and visibility scope | Check actual access for users, leaders, and administrators |
| 6 | Salary policy and amounts (when operating cost features) | Prepare the individual or level-based cost basis in use |
| 7 | Sample project, members, and linked issues | Each relationship is configured separately |
| 8 | Sample worklog and analysis | Figures are compared using the same period and scope |

Register a person before selecting them as a team leader. For level-based cost, prepare the amount basis for every level actually used.

## Check each user role

1. With a regular user, check My Work and their own projects.
2. With a team leader, check My Team and the permitted people.
3. With a user without cost access, check access to personal amounts and cost views.
4. With an administrative account, check that settings can be changed.

Checking only an administrator's screen can miss ordinary-user permission problems. Ask users to verify access in their own accounts rather than share passwords.

## Regular operational checks

- Latest aggregation and failures in portfolio and resource views
- Subscription status and issue inclusion results
- New-year holidays and working standards
- Leadership, inherited permissions, and allocations after team changes
- New permission items and available features after upgrades

For support requests, include the site, time, screen path, issue key, attempted action, and error message. Share only the necessary salary or personal information.

Ask the product operations team to handle deployment, database migration, or recovery commands. Use the [FAQ](cloudjira--faq.md) for user-facing troubleshooting steps.
