# Users, administrators, and access

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--admin-access.md)

Manage who can enter the app, appear on approval lines, and change settings. App registration does not replace Confluence page permission.

## Roles

| Role or list | Capability | Separate requirement |
| --- | --- | --- |
| Confluence administrator | All app settings; withdraw other people's open requests | Document actions still have their own permission checks. |
| Settings administrator | All settings, including managing settings administrators | Does not automatically gain withdrawal rights over others' requests. |
| Approver list | Eligible people when the list is in use | Must also be able to view the target page. |
| Requester | Create requests and withdraw their own open requests | Creation and resubmission require page edit permission. |
| Cc / reader | Read accessible request status and history | Cc alone does not allow approval or rejection. |

## Register approvers

Under **Settings → Approvers**, find and add users, then save the approver list. An empty list does not restrict selection by registration. Once you maintain a populated list, only its members can be placed on approval lines.

If you plan to enable registered-users-only access, register requesters as well. That policy allows inbox and request access to listed users, settings administrators, and Confluence administrators.

![Empty approver registry with the Add control and access-policy guidance](../assets/ma-19-approvers.jpg)

*MA-19A · The registry is empty in this example; use Add to register approvers. Search and selection appear after opening that control.*

![Assign Moves Approval settings administrators](../assets/ma-19-settings-admins.jpg)

*MA-19B · No settings administrators are registered in this example. Use Add to appoint one; Confluence site administrators already have access.*

## Register settings administrators

Open **Settings → Settings administrators**. Enter at least two characters to find users, select them, and save. Confluence administrators do not need separate registration.

## Before restricting access

1. Register requesters and approvers.
2. Register operations owners as settings administrators.
3. Check the inbox and target pages with regular accounts.
4. Enable the global restriction and compare registered and unregistered access.

Settings access, page visibility, and an active approval turn are separate conditions. Seeing a menu does not imply access to every page or decision.
