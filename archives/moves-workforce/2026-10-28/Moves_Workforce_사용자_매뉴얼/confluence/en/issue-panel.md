# Jira issue panels

[Guide home](./index.md) · [한국어](../ko/issue-panel.md)

> Review draft: panel availability must be checked on the staging site's Jira issue screen.

If the installed app version provides Jira issue panels, you can review planned effort and actual work and record time while viewing an issue linked to an app project. If the panel is unavailable, use **Jira → Apps → Moves Workforce → My Work** to record time and the project screens to review results.

## Required access

- You must be able to view the issue in Jira.
- Creating worklogs requires Work On Issues and enabled time tracking.
- Editing and deleting your own entries require Edit Own Worklogs and Delete Own Worklogs respectively.
- Project names and links into the app follow app project permissions and visibility scope.

## Use the panel

1. Open a Jira issue linked to an app project.
2. Review the summary in the **Moves Workforce** context panel or open details in its activity tab.
3. Check the date, start time, end time, and duration, then describe the work.
4. Save and check the recent-worklog list and KPIs.
5. Use edit or delete on your own entries when correcting them.

> Image candidate IMG-17: the summary panel and activity tab locations on a sample Jira issue.

## Measures and limits

Planned effort uses Jira estimates; recorded effort uses worklogs. **My share** means time you recorded and is approximate when the screen retrieves only recent entries. Do not assume the list contains the complete history.

Worklogs saved in the panel are the same records used by Jira and My Work. Recording them in the activity tab does not create a separate copy.

## When the panel is missing or shows a notice

| State | Action |
|---|---|
| No panel | Check app-project linkage and whether the installed version includes the panel |
| Worklog permission notice | Check Jira access for the issue and time tracking |
| No project link | Check app Project read and project visibility scope |
| Your share is unknown | Check worklog retrieval errors and partial-list notices |
| License notice | Ask an administrator to check the app license |

<!-- control-reference:start -->

## Buttons, fields, and result checks

The Jira issue panel depends on installed version, project linking, and visibility conditions. These instructions apply when the panel is available.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Log work / date / start / end / description | Create a Jira worklog on the current issue. End must follow start; Work On Issues and time tracking are required. | Check save confirmation/recent entries; do not log the same work again in My Work. |
| Reset input / edit / delete entry | Reset restores input fields. Editing/deleting your record needs the corresponding Jira permissions; deletion removes the original entry. | Reload a failed-to-load comment before saving. Unsupported original comment formats can allow date/time-only edits while preserving the source. |
| Project context / Open in app | View linked project context/permitted KPIs and open the full app. | Distinguish unlinked/loading/license notices. Without the panel, use Jira Apps → My Work and project screens. |



<!-- control-reference:end -->

