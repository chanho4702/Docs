# Project people and labor cost

[Guide home](./index.md) · [한국어](../ko/project-people.md)

> Review draft: English screenshots were captured on the designated staging site on 2026-10-04 and are shared by both language guides. The deployed version and role-specific access and save operations remain under review.

Set the people and teams responsible for a project. Authorized users can also configure its labor-cost basis. Member lists, salary management, and work assignment serve different purposes.

## Required access

- View members: Project read. Change members or responsible teams: Project or Resource Management write.
- View salary and cost: Cost read. Change amounts: Cost write and editing access permitted by the selected policy.
- Assign Jira work: the app's write permission plus the relevant Jira permissions, such as assigning issues.

Personal amounts depend on both cost access and salary policy. Access to an ordinary member list does not grant access to personal annual salaries.


<!-- detailed-walkthrough:start -->

## Example: add one project member

**Path:** Project Management → Demo website launch → **User Management → Members**. Use your own Jira account, already registered as an app user. You do not need to create a fictional employee.

1. Check whether you are already in the member list.
2. Open **Add User** and select the registered user. If the search has no result, ask an administrator to check app-user registration.
3. Add the selected user and verify the member list. Add User selects users; it does not set their project role or level.
4. Select and save the project role and level in the member-list cells. Ask an administrator to prepare those reference options if missing.
5. Check the saved name, role, and level. Labor cost is managed separately with cost access; do not invent salary values to register a member.

For a responsible team, use **Edit assigned teams**, then **Pick members** to bring in the people you need. Assigning a team and registering its people as project members are separate actions. Review the added/skipped results rather than assuming that a visible team name means every team member was registered.

**Next:** [Link DEMO-12 in Work Management](./project-work.md). Assigning that Jira issue is another separate action; registering a member does not change its Jira assignee. Review the cost basis below if you also need cost analysis.

<!-- detailed-walkthrough:end -->

## Set responsible teams and register members

1. In the project details, open **User Management → Members**.
2. Use **Edit assigned teams** to select the responsible teams and primary team.
3. Use **Add User** to register participants, or **Pick members** to select people from the assigned teams.
4. Check each member's role and level.

**Selecting a responsible team does not register its members.** Assigning a Jira issue is also separate from project membership. After adding a team, check the added and skipped results and the actual member list.

![Assigned teams and project members. Edit assigned teams and Add User perform different actions.](../images/en/05-user-list-teams.jpg)

Assigned teams and project members. Edit assigned teams and Add User perform different actions.

## Choose the labor-cost basis

| Organization policy | Basis used in the project |
|---|---|
| Individual | **Project** mode uses the entered project allocation amount. **Annual** mode prorates the person's annual salary over the project period |
| Level-based | Uses the level's representative annual amount, prorated over the project period, instead of personal amounts |

Annual proration uses calendar days, including the end date. Allocation months = calendar days ÷ 30.4375; labor cost = annual amount ÷ 12 × allocation months. This is separate from the working-day conversion used for MD and MM.

If no representative level amount is set, check that both lower and upper limits are present. Level-based cost needs a valid representative amount or both limits.

## Assign work

Compare candidates' skills and workload, then select the issues to assign. Distinguish adding project membership only from also assigning an issue, and check both results after saving. Use [Resource Management](./resources.md) to compare candidates across the organization.

## When labor cost is hidden or zero

| State | What to check |
|---|---|
| The field is hidden | Cost read access and whether salary policy hides personal amounts |
| Annual mode shows zero | Personal annual salary and project dates |
| Level-based cost is zero | The member's project level and a valid level amount |
| Project mode shows zero | Whether the allocation amount is missing or intentionally zero |

The entered project budget may differ from calculated labor cost. Check any missing-calculation notices and, after a policy change, the aggregation timestamp.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Path: project details → User Management → Members. After adding users, check/edit role and level in the list separately; manage costs in the authorized cost view.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Add User / user selection / Add | Select multiple registered Jira users and add them to the roster. This add dialog does not contain role/level entry steps. | For an unregistered-user error, register them in Settings first; check the roster after adding. |
| Inline role / level editing | Open the member's role/level cell, choose a reference value, and confirm. The change applies to that project member. | Check the saved list value; distinguish the organizational user definition from the person's project role/level. |
| Edit assigned teams / primary team | Set responsible teams and the primary team. Selecting a team does not make all its users project members. | Check the team indicators after saving; add actual people through Pick members. |
| Pick members | Choose people from assigned teams. Distinguish existing members from available candidates. | Review added/skipped results and the roster; do not treat team assignment and member selection as the same action. |
| Remove member | Remove the project-member relationship. This differs from deleting a Jira account or worklog. | Check the roster and assignment state after removal; inspect Jira issue assignee relationships separately. |
| Salary calculation mode / assigned amount | Under Per person, distinguish using the entered assigned amount directly from prorating annual salary over the project calendar period. | Save with cost write access and check effective cost. Missing annual salary/project dates can yield zero annual-based cost. |
| Salary band / effective cost | Level-based policy uses representative annual amounts and restricts personal salary entry/display. Separate cost access is also required. | Check the level and valid representative or both range limits. Do not assume zero means a free allocation. |
| Unassign / Remove coworker | Unassign the selected work or remove the candidate’s coworker relationship. These are separate controls and do not remove project membership. | Check Jira assignment permission for unassigning and issue-property editing access for coworker changes. Verify assignee, coworker list, and roster separately. |



<!-- control-reference:end -->

