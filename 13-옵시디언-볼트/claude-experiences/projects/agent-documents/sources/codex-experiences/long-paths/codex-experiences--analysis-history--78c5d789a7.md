## What the history records

Work history explains when an issue was included in the app project, who included it, and subsequent changes recorded by the app. Project write controls availability of this tab, in addition to project visibility.

## Read an entry

Check the issue, registration time, registering user, and recorded change. Registration time and registrant are automatically generated read-only values. Issues included automatically show Subscription as the registrant.

## Distinguish app history from Jira history

Project inclusion is a relationship with an existing Jira issue. It is not the time the Jira issue was created. Use the Jira issue's own history when investigating changes made outside the app.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Inclusion history distinguishes Jira issue creation from entry into the app project.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| History search / filters / pages | Filters apply to the history table; burnup/insights retain the whole-project basis. | Do not expect filtered-table totals to match whole-project charts. |
| Inclusion date / actor / burnup | Use recorded app-link dates/actors to interpret scope growth. Older issues lacking tracking may have unknown exact inclusion dates. | Do not replace unknown inclusion dates with Jira creation dates. Review aggregate limits on large projects. |



<!-- control-reference:end -->

