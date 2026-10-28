# Worklog export

[Guide home](codex-experiences--index.md) · [한국어](../ko/codex-experiences--worklog-export.md)

> Review draft: the screens and deployed version on the designated staging site have not yet been verified.

Search Jira worklogs you can access and download them as an Excel file. This feature is not limited to issues linked to Moves Workforce projects.

## Required access and scope

You need Worklog Export read. Results follow your Jira access and may differ from the app's project visibility scope. Align issues and authors before comparing totals with app project analysis.

## Export worklogs

1. In **Worklog Export**, select the period based on worklog start dates.
2. Select Jira spaces and authors. Add JQL conditions when needed.
3. Search and monitor issue discovery and worklog collection.
4. Check the completion message and any partial-failure or limit notices.
5. Review the summary and preview, then download the Excel file.

For example, specify the period and authors when collecting a team's work for this month. Leaving authors empty can include other accessible authors' records.

> Image candidate IMG-16: search conditions, collection result, summary, and download control together.

## Before sharing the file

| Check | Why it matters |
|---|---|
| Cancellation or partial failures | A downloadable result may still be incomplete |
| Search limit notices | You may need separate searches by period or space |
| Preview versus file | The preview shows a subset; the file includes all successfully collected rows |
| Authors and comments | Check that the contents suit the intended recipients |
| Hours per MD | Align units when comparing reports |

**All collected records** does not mean **all records in Jira**. Records omitted because of cancellation, permissions, limits, or failures are not included in the download.

For slow searches, narrow the period and spaces first. For a missing space, check whether you can open it directly in Jira. For JQL errors, remove additional conditions to isolate the cause.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Worklog Export queries accessible Jira data and downloads a file. Do not assume it has the same population as an app-project member roster.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Project / author | Select Jira projects/authors. An empty selection includes accessible projects or all authors under your Jira access. | Issue assignee and worklog author differ; check the author filter when finding another person's logged time. |
| From / to dates | Limit worklog dates. Collected entries are filtered again by date/author to form the result. | Check date order and actual work dates; do not confuse them with issue creation dates. |
| Additional JQL | Enter a Jira condition combined with project/date/author conditions using AND, for example issuetype = Bug. | For a 400 error, check JQL syntax/field names. Remove extra conditions to diagnose unexpectedly small results. |
| Search | Find matching issues and collect their worklogs. A new search replaces previous results with the new run. | Review progress and failed issues. Do not treat a partial/limited result as a complete total. |
| Cancel | Stop an ongoing query while retaining collected rows. This does not cancel/delete Jira worklogs. | Cancelled results/downloads are partial. Adjust conditions and search again for a complete result. |
| Reset | Restore filter inputs to their default state without changing Jira worklogs. | Run Search for results under new conditions. Distinguish resetting inputs from deleting data. |
| Issue count / worklog count / total hours | Summarize collected data. With failures, cancellation, or truncation, these totals describe the partial result. | An issue's lifetime total can differ from a date/author-filtered total. |
| Download Excel | Build a file from currently collected rows. The first download can take a moment to load file-generation code. | Check period, authors, counts, hours, and the MD basis. For Jira 429, wait briefly and retry with narrower conditions. |



<!-- control-reference:end -->

