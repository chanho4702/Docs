## Required access

Project read or Resource management read opens projects and their work. The candidate list requires Resource management read and is restricted to the permitted organizational people scope. Assignment requires Project write or Resource management write; changes to Jira assignees also require Jira assignment permission. Project required skills use Project write, and people's skills use the applicable resource or self/team-lead permission.

Read-only resource access does not permit assignment. Candidates must be registered in People management. Project visibility scope still applies.

## Three panels

| Panel | Contents |
|---|---|
| Projects | Search and status filters; due-date signals, unassigned or overdue work, and options to include ended or over-schedule projects |
| Work | Open issues and currently allocated people for the selected project |
| Organization-wide people | Roles, levels, skills, fit, load signals, and assignment actions |

Collapse panels from their headers or resize their boundaries. Date labels such as D-7, D-DAY, or D+3 provide schedule context.

> **[Image insertion point]** `06-resource-assignment.jpg` — Project, work, and candidate panels with fit and load signals.

## Assign a person

1. Select a project.
2. Compare candidate skills, fit, and load.
3. Select Assign, then choose issues or add the person as a project member without assigning an issue.
4. For a team, review the Team assignment confirmation and its target count.
5. Verify project membership and Jira assignee changes separately.

Fit compares project required skills with the person's registered skills. It is not meaningful if either set is missing. Required skills can be configured in the project form or this screen; people's skills are maintained in the people overview or applicable My Page path.

> **[Image insertion point]** `06-resource-work-picker.jpg` — Issue selection in the assignment dialog. Distinguish project membership from changing a Jira assignee.

## Team assignment and removal

Already assigned members are excluded. Review the team, person count, and project before execution. There is no bulk cancellation: remove people individually. Removing project membership does not automatically clear the assignee on already assigned Jira issues; read the affected-issue notice.

## Allocation graph

The graph links projects, teams, and people using project membership, not worklog contribution. A person who has not started work can still appear. Filters include project and progress state, with an option for ended projects. Large graphs initially limit projects and provide Show all. Selecting a person opens details.

> **[Image insertion point · additional capture needed]** Allocation graph with project, team, and person nodes, filters, and an example of one person linked to multiple projects.

Project-detail work assignment begins with that project's people. This screen starts with the broader candidate pool and compares multiple projects. Use project analysis to inspect actual contribution.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Project Assignment adds permitted candidates to project rosters or assigns Jira work as assignee/coworker. These are separate actions.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Project search / status / include closed | Choose a project. Closed/overdue inclusion broadens the project candidates. | Changing the selected project changes fit requirements; check project visibility scope. |
| Candidate team / descendants / skill fit | Compare permitted people by membership and required-skill fit. The Company resources label does not guarantee access to every employee. | Inspect fit, workload, and unregistered-user notices together. |
| Assign to project / Assign whole team | Add the person or a team's unassigned members to the roster. Existing members are excluded. | Review actual targets/results. Undoing requires individual roster removals. |
| Set assignee / Add coworker / Confirm | Choose issues and save an assignee/coworker, without automatically replacing roster registration. | You can continue assigning Jira work after the non-member warning, but the project roster is not updated automatically. Add roster membership separately when required and verify both results. Jira access for assigning an issue differs from editing coworker properties. |
| Remove roster member / assignment graph / Show all | Remove roster relationships or inspect project/team/person assignments. The graph follows roster assignment, not actual logged work. | Not-yet-started people can appear. Check Jira assignee relationships separately after removal. |



<!-- control-reference:end -->

