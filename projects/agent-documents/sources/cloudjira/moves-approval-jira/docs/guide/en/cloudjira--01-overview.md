# Product overview

Moves Approval for Jira provides individual approvals for worklogs saved in Jira Cloud, with decision history, change records and period closing.

Authors review records and request outcomes in the issue's Work log view. Assigned approvers approve or reject requests in the inbox. Administrators configure approval rules, enabled projects, teams, worklog controls and retention.

## Current user flow

**Save work → request approval → approve or reject → review status and history**

Saving and request acceptance are separate outcomes. If only the request fails after saving, retry it on the original record without recording the same time again. Approved records cannot be edited or deleted through the app. Where reconsideration is available, existing locks and certified time remain in place.

## Standalone and connected use

Standalone mode uses Approval's teams and policies. Connecting Moves Workforce uses its linked issues and organization information. In connected mode, worklog approval is limited to Workforce-linked issues. Installing both apps does not pair them; an administrator must complete code-based pairing.

## Availability

The current inbox menus are My turn, In progress, My requests, My history, CC, Notifications, My signature and My delegation. Administrators also have approval management, records and settings.

Period timesheet submission and direct certification are not exposed in the current navigation. New general issue and field change approvals are also unavailable. Status change approval has server code and a manifest entry point, but the current settings and project screens are not fully wired; this guide does not present it as a released feature.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--01-overview.md)
