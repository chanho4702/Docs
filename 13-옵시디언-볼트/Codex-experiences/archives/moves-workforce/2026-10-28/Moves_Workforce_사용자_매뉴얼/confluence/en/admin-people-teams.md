# Managing people and teams

[Guide home](./index.md) · [한국어](../ko/admin-people-teams.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Register app users in User Management and set organizational membership and leaders in Team Management. Register participation in individual projects separately.

## Required access

User registration and changes require User Management write. Team structure, membership, and leadership changes require Team Management write. Viewing uses the respective read permission. Salary and permission-set assignments may have additional requirements.

## Register a user

1. Open **Settings → User Management** and add a user.
2. Search for and select the Jira user.
3. Select a role, level, and permission set, then save.
4. Set team membership and verify the effective permissions.

Being a searchable Jira user is different from being a registered app user. A person may exist in Jira but remain absent from some assignment lists until registered in the app.

## Register multiple users with Excel

1. Download the latest template from the screen.
2. Complete it in the supported xlsx format within the displayed size limit.
3. Upload and check progress and completion.
4. Distinguish registered, duplicate, not-found, and failed results and inspect failure reasons.

Clicking upload does not mean processing has finished. For not-found accounts, check Jira account status and search visibility. Do not repeatedly upload all entries without checking which already succeeded.

## Create teams and select leaders

1. Add a team in **Settings → Team Management**.
2. Enter its name and parent. Without a parent, it is a top-level team.
3. Choose a leader from registered people.
4. Add members and, if using team permissions, select a permission set.

A leader must belong to the team they lead. Choosing someone from another team may change their membership; review the save notice. Under the current rules, one person cannot lead multiple teams.

> Image candidate IMG-18: the team tree and details showing the leader, membership, and permission-inheritance notice.

## When changing the organization

- A user belongs to one team. Assigning them to another changes their previous membership.
- Change or remove a person's leader assignment before moving them outside that team.
- Removing the leader assignment does not automatically remove the former leader from the team.
- Before deleting a team, review the preview of subteam moves, unassigned people, and permission inheritance changes.
- After a change, verify the effective result in [My Page](./my-page.md) and [permissions](./admin-permissions.md).

Manage skill dictionaries, levels, and roles in [reference settings](./admin-settings.md). Use [project people](./project-people.md) to change project participation.

<!-- supplemental-guides:start -->

## Detailed guides

- [People registration and bulk upload](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047498)
- [Team hierarchy and membership](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047539)

<!-- supplemental-guides:end -->
