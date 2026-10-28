## Access and layout

Team management read opens the team tree and details. Write is required for creating, editing, deleting, moving teams, assigning or removing members, and choosing the team's permission set. A permission set cannot exceed the assigning user's access under the applicable administrator rules.

The team list is also used by People management; being able to read that list does not grant team editing. Leader candidates must be registered Workforce people.

> **[Image insertion point · additional capture needed]** Team tree and search, Add team, selected-team details, leader and permission-inheritance text, and member assignment controls.

## Create a team

Select Add team. Enter a unique name, an optional parent and description, a registered leader, and an applicable permission set. Leaving the parent blank creates a top-level team. The team's permission set applies to people using team inheritance rather than an explicit individual set.

Assigning a leader moves that person into the team. The leader can use My Page → My Team and applicable resource views for the led scope.

## Leader rules

| Rule | Result |
|---|---|
| The leader must belong to the led team | Saving a leader from another team changes their membership |
| One person leads one team | Replace their existing leadership before choosing them for another team |
| A leader cannot leave the led team | Member transfer, membership removal, or person editing is rejected until leadership is cleared |
| Replacing or clearing a leader | The former leader remains a member; they are not automatically removed |
| Deleting the registered person | The team's leader becomes empty |

The leader is shown first with a badge in member lists and related people views.

## Change hierarchy and membership

Drag a team onto another team to change its parent, or onto the top-level drop area to remove its parent. Search and Expand all or Collapse all help navigation. Moving under a descendant is rejected to prevent cycles. Moves exceeding depth limits or using stale lists require correction or refresh.

Assign members can add up to 500 people at once. A person belongs to one team; selecting someone from another team moves them. Leaders cannot be transferred or removed until leadership is cleared. Remove membership places selected people in the unassigned group.

## Permission inheritance

Team-inheriting people follow the team's set, or an applicable parent-team set. Read the detail message identifying direct or inherited permissions. If neither the team nor its ancestors has a set, inheriting people lose access. Review this before assigning members or a leader.

## Delete a team

Review the preview of people losing access and child-team inheritance changes. Child teams move to the deleted team's parent; members become unassigned. The result also explains related project-assignment cleanup.

## Troubleshooting

Refresh stale lists before retrying. Correct circular or invalid parent references in team settings. Register people first if the leader list is empty. A population-limit notice means the list is incomplete. If moving a person reports that they are a leader, clear their leadership first.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Team Management governs hierarchy, direct membership, leadership, and inherited permissions. A user belongs to one team.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Search / expand all / collapse all | Find teams and change hierarchy display. Collapsing does not delete descendants. | Distinguish direct membership from descendant-inclusive counts. |
| Add team / parent / description | Enter a name and choose a parent; no parent creates a top-level team. Save the name/hierarchy. | Self-parenting or moving under a descendant is rejected. |
| Leader / team permission set | Only registered app users can lead a team. Assigning a leader moves that user into the team. The team set governs inheritance for users without a personal set. | Check existing leadership before assigning another team's leader. The team set does not override every personal set. |
| Assign members / team filter | Search/filter/select users to assign. Selecting someone from another team moves them here. | Check former/new membership after saving. Resolve leader-move restrictions by removing leadership first. |
| Drag / move to top level | Drop a team on another to change its parent or onto the top-level area. This changes organizational hierarchy. | For cycle/unavailable notices, reload and check parent relationships. |
| Delete team | Child teams move up to the parent; members become unassigned. Jira accounts are not deleted. | Review inherited access and project-team impact first. Check project-team relationships if cleanup is reported incomplete. |
| Select members / Unassign (N) | Select members in team details and unassign their team membership. This does not delete the users. | Check selected count and result. Team-inherited access and team-based views/analytics can be affected; verify the users’ membership afterwards. |



<!-- control-reference:end -->

