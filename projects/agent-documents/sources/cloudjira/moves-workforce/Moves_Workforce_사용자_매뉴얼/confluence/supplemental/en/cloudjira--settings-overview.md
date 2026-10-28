## Screen-specific access

Each setting has its own read and write permission. A user without read access does not see that entry; read-only users cannot edit. Reference lists may also be readable by People management because its forms need role, level, and team choices. This does not grant permission to edit those definitions.

| Screen | Read | Write |
|---|---|---|
| General settings | Settings read | Settings write |
| People management | People management read | People management write |
| Team management | Team management read | Team management write |
| Roles | Role management read | Role management write |
| Levels | Level management read | Level management write |
| Skills | Skill management read | Skill management write |
| Project statuses | Project status management read | Project status management write |
| Permissions | Permission management read | Permission management write |
| Holidays | The sidebar uses Permission management read | Public holiday management write |
| Storage monitoring | Storage monitoring read | Operational details depend on the available action |

Holiday data is read by other screens for working-day calculations. A user with holiday permission alone may need a direct link because sidebar visibility uses a different gate.

> **[Image insertion point · additional capture needed]** Expanded Settings sidebar. Explain that entries vary with permissions.

## Recommended setup order

1. General settings: working hours and salary policy.
2. Roles, levels, and skills: reference choices.
3. Permissions, then registered people and teams.
4. Project statuses and public holidays.

People need reference values and permission choices. Teams need a permission set; a leader must already be registered and becomes a member of the team they lead. Project creation needs a valid status. Working-day calculations depend on holidays.

## Effects on other screens

| Setting | Effects |
|---|---|
| Hours per day | My Work targets, MD/MM conversion, progress, utilization, exports, and issue-panel KPIs |
| Salary policy | Project salary and cost views, dashboards, and portfolio cost axes |
| Utilization bands | People and portfolio load signals |
| Progress threshold | Normal, caution, and delay classification |
| Public holidays | Targets, available capacity, progress working days, bulk worklogs, and calendar labels |
| Roles, levels, skills | Project-member choices and candidate fit |
| Permissions and teams | Menu availability and data visibility |

See [Administrator setup and operational checks](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203751476) for installation, initialization, and operational monitoring. Storage monitoring is outside the ordinary user workflow.
