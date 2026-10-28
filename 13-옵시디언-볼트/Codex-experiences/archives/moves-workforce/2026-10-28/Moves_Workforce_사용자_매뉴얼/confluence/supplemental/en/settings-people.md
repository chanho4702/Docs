## Access and purpose

Register Workforce people before adding them to teams, projects, or leader assignments. People management read opens the screen and export; write is required for adding, editing, deleting, and bulk uploads. Assigning a permission set cannot grant more access than you hold, except for authorized Jira administrators or Permission management writers.

Role, level, team, and permission choices can be read in this screen. Creating those choices requires the corresponding reference-data permission. Individual annual salary follows People management access and the individual salary policy; it is hidden under level-band policy.

## List and filters

Review headcounts by permissions, roles, levels, and teams. Search or filter people, then export the filtered list to Excel. Columns show identity, job role, level, team, permission set or team inheritance, salary where permitted, registration time, and actions. Team leaders have a leader badge. Check the displayed salary unit; the documented Korean annual-salary form uses ten-thousand-currency units.

> **[Image insertion point · additional capture needed]** People management filters, headcount cards, rows, and Add person. Use example names and hide real salaries.

## Add or edit a person

1. Select Add person and search for an existing Jira user by name or email.
2. Choose role, level, and permissions.
3. Leaving the permission choice unset assigns the default Member set. Select team inheritance explicitly if the person should follow a team permission set.
4. Enter an annual salary only where the individual policy and your access permit it.
5. Save and verify the registered person.

A team leader cannot be moved outside the team they lead. Change or clear the leader in Team management first. Deleting a registered leader clears that team's leader; review deletion carefully because the registration cannot be restored through the ordinary form.

## Bulk upload

1. Open Bulk upload and download the template.
2. Complete the template and save an xlsx file. The documented limit is 5MB, xlsx only.
3. Drop or select the file.
4. Follow background progress and review Total, Registered, Duplicate, Not found, and Failed counts.
5. Open the failed-item list and correct only unsuccessful entries.

> **[Image insertion point · additional capture needed]** Template download, file area, progress, result summary, and failed-item list. Use a fictitious example workbook.

Duplicates are already registered people. Not found means the Jira account could not be identified using the entered email. Check invitation status, the exact Email value, and account discoverability. A failed result has another cause explained in the failure list.

## Troubleshooting

| Symptom | Action |
|---|---|
| All rows are Not found | Check Jira invitation status, exact Email values, and account discoverability |
| Salary input is absent | Check level-band policy and your access |
| A permission set cannot be selected | Ask a Permission management writer if the set exceeds your access |
| Changing the team is rejected | Clear or replace the person's leader assignment first |
| A leader or project candidate is missing | Register the person here first |

Annual salary is used by the annual-salary allocation type in project cost calculations; it is separate from an explicitly entered project amount.

<!-- control-reference:start -->

## Buttons, fields, and result checks

People Management registers app users. Jira account creation/invitation and project membership are separate.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Add User / Jira User | Select an accessible Jira account and set organizational role/level/permission/team. Duplicate registration is rejected. | Check account/name after saving. For failed lookup, check account identification and Jira search access as well as invitation status. |
| Permission / team / salary fields | Set personal permission/team relationship. Salary fields depend on policy and monetary access. A leader may need to be unassigned as leader before moving teams. | Do not equate unset, inherit, and default Member. Check effective access with the affected account. |
| Download Template / select Excel / Upload | Enter Jira account emails under the template's exact Email header. Maximum file size is 5MB. Extra role/level/team/Salary columns are not applied by this uploader. | Registration is asynchronous. Dialog closure/acceptance is not completion for every row; check job status and the actual user list. |
| Bulk Upload Failures | Inspect failed emails/reasons and separate successful users from failed rows. | Correct Email header, empty rows, discoverability, and duplicates; retry failed users. Set organizational details through editing afterward. |
| Delete User | Remove app registration and related project assignments, personal schedules, skills, and leadership references. This does not delete the Jira account, original worklogs, or historical project performance. | Review the irreversible-action notice and assignments. Do not assume this removes Jira access. |



<!-- control-reference:end -->

