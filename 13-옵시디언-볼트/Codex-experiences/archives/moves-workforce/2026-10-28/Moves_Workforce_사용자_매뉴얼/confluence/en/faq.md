# Frequently asked questions

[Guide home](./index.md) · [한국어](../ko/faq.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Use these checks when something goes wrong. A symptom can have several causes, so avoid drawing conclusions from one setting alone.

## A menu is missing

Check the feature's read permission in My Page. Ask an administrator to verify your user registration, permission set, and team inheritance, then refresh. My Team also requires an actual team-leader relationship.

## A colleague can see a project or person that I cannot

Accounts can have different visibility. Compare project membership, team membership and leadership, responsible teams, and organizational access. If only a particular Jira issue is missing, check whether you can open it directly in Jira.

## Does adding work create a new Jira issue?

Including existing work links Jira issues to the app project. Create issue in Work Management creates a new Jira issue and requires Jira Create Issues plus required fields. Removing work from the app project does not delete its Jira issue.

## I selected a responsible team, but no members appeared

A responsible team defines ownership. Register actual participants using Add User or Pick members from an assigned team. Jira issue assignment is also separate from project membership.

## I cannot save or edit a worklog

Check issue access, time tracking, and the author's Jira permissions. Creating requires Work On Issues, editing your own entry requires Edit Own Worklogs, and deleting it requires Delete Own Worklogs. After a save error, check whether the entry was already saved before retrying.

## Labor cost is zero or hidden

For hidden fields, check cost access and salary policy first. For an actual zero, check allocation mode, personal or level amounts, and project dates. Also distinguish an intentional zero project allocation. See [labor-cost guidance](./project-people.md).

## I logged work, but the dashboard has not changed

Check the last aggregation time and partial-failure notices. An authorized user can request reaggregation when needed. Align period, people, and issues when comparing project and organization-wide analysis.

## Does the Excel file contain every worklog?

It contains successfully collected records. Records omitted because of search limits, cancellation, failures, or Jira permissions are not included. Check both the file summary and the collection status.

## A Confluence document is marked broken

The page may have been deleted, or you may lack access. Try opening the source URL directly and check the same-site Confluence connection. Unknown status does not confirm deletion.

## I cannot move a person to another team

Check whether the person is currently a team leader. Change or remove the leader assignment before moving them, then verify inherited permissions after the move.

## Does deleting an app project delete its Jira issues?

The Jira issues remain; app project data and relationships are cleaned up. For interrupted deletion, inspect the failure in the progress dialog and retry. Deleted app-project data cannot be restored, so verify the target first.

## What should I include in a support request?

Include the site, time and timezone, screen path, steps taken, expected and actual results, and error message. When useful, include a sample issue key and a screenshot with personal information hidden. Do not include passwords or API tokens.
