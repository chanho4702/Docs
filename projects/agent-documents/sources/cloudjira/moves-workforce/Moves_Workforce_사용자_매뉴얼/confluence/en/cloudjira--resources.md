# Resource management and project assignment

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--resources.md)

> Review draft: English screenshots were captured on the designated staging site on 2026-10-04 and are shared by both language guides. The deployed version and role-specific access and save operations remain under review.

Compare workload, skills, and team membership before assigning people to projects. Permission sets with the same name can provide different visibility if their configuration has changed.

## Required access and scope

Resource Management read allows people views; editing and assignment require the applicable write permission. Assigning Jira issues also requires Jira access. Team and people visibility depends on administrative permissions, project scope, and team-leader relationships. A visible menu does not imply access to the entire organization.

See the organizational scope table in [Permissions and data visibility](cloudjira--admin-permissions.md) for the exact all-organization, leading-team, and no-data conditions.

## Review people

1. Check the last aggregation timestamp in the people view.
2. Narrow candidates using team, role, level, and skill filters.
3. Compare utilization, remaining work, and participating projects together.
4. Open a person's details to review active work and experience.

Utilization is an aggregated result, so recently entered work may not appear immediately. Distinguish no recorded activity from available capacity. A person's share of remaining work on a collaborative issue may be an approximation rather than their actual agreed allocation.

## Assign people to a project

1. Select the target project in project assignment.
2. Check its required skills and the candidates' recorded skills.
3. Compare skill match with workload and choose a candidate.
4. Decide whether to assign an issue or register project membership only.
5. After saving, check project membership and issue assignment separately.

![Project Assignment showing the selected project and candidates with skill fit and workload.](../images/en/06-resource-assignment.jpg)

Project Assignment showing the selected project and candidates with skill fit and workload.

![The candidate work picker in All view, distinguishing adding a coworker from setting the assignee.](../images/en/06-resource-work-picker.jpg)

The candidate work picker in All view, distinguishing adding a coworker from setting the assignee.

Skill match compares recorded information; it does not guarantee proficiency or availability. If candidates are missing, check user registration and the allowed visibility scope.

## Teams and allocation relationships

- The organization view shows team hierarchy and membership. Make organizational changes in [team management](cloudjira--admin-people-teams.md).
- Team analysis compares permitted teams and projects. Check whether subteams are included and whether current membership is used.
- The allocation graph shows project membership, including people who have not yet logged work.
- Do not assume removing a project allocation also clears Jira issue assignments. Review any remaining-work notice.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Resource provides People, Organization, Team Analytics, and Project Assignment. Company-wide labels do not override the current permission/leadership scope.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| People / Organization / Team Analytics / Project Assignment | Switch tabs for personal workload, membership, team aggregates, or project assignment. | Check permitted scope for candidates, details, and graphs. Read/write, REPORT, and cost access are separate. |
| Aggregation timestamp / no utilization | Some figures such as utilization are aggregates. Unavailable data differs from 0%. | Check last aggregation/freshness and original entries. Resource figures need not equal project-internal utilization. |



<!-- control-reference:end -->

<!-- supplemental-guides:start -->

## Detailed guides

- [People overview in detail](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047251)
- [Organization overview](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047300)
- [Organization-wide team analysis](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047338)
- [Project assignment in detail](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204047383)

<!-- supplemental-guides:end -->
