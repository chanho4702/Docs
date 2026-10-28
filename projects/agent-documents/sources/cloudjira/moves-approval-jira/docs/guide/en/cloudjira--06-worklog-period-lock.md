# Worklog protection and period closing

Approved worklogs cannot be edited or deleted through the app. Unapproved records may also be restricted by closing rules, allowed date windows or an in-progress control operation. **An automatic closing value of 0 means off**; a month ending does not itself close the period.

## Provider and protection method

Selecting Moves Approval as the Jira time tracking provider enables its **Log work / Work log** views. Provider selection alone does not block every write through REST, automation or another app.

Administrators must configure and diagnose the appropriate worklog controls separately. Visibility-based protection can hide records from Jira's standard views or other apps and affect their displayed totals. The app supplements permitted author or team-lead views without exposing another person's hidden description.

Observed external changes may result in change indicators, control history or exclusion from aggregates. A previous approval does not automatically approve a new duration. Event handling and daily reconciliation do not guarantee immediate detection of every change.

## Closing and reconsideration

Administrators manage closing and reopening from the permitted settings. Reopening a period does not automatically unlock approved records. Pending requests submitted before closing may still be decided after the original record is revalidated.

Reconsideration requires a reason where the action is offered. Submitting it does not make the record editable.

## Before uninstalling

Enter RELEASE in the administrator controls to start releasing worklogs. Starting successfully is not completion. Refresh the status and verify that zero controlled records remain before uninstalling. Then change the time tracking provider and uninstall. Do not assume uninstalling restores every hidden record.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--06-worklog-period-lock.md)
