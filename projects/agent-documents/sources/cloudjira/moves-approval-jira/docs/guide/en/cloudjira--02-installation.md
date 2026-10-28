# Installation and first setup

Prepare a Jira Cloud site administrator, a test project, an author and an approver. Before public release, use the test installation route provided by the vendor.

1. Once listed, locate **Moves Approval for Jira** on Marketplace, verify the vendor and requested permissions, and install it.
2. Open **Apps → Moves Approval** in Jira and enter the administrator settings.
3. Select the enabled projects. Projects are allowed by default until an explicit scope is configured, so establish a test scope first.
4. For standalone use, configure teams, leads and any required approver directory. For connected use, complete [Workforce pairing](cloudjira--10-workforce-integration.md).
5. Set automatic worklog requests and the monthly closing grace period. **0 days disables automatic closing.**
6. In Jira **Settings → System → Time tracking**, select **Moves Approval** and verify the issue's **Log work / Work log** entry points.
7. Save one test worklog and verify request creation, a decision and history using the author and approver accounts.
8. Check [current availability](cloudjira--01-overview.md). Status change approval and period timesheet submission are not part of the current setup flow.

A site has one active time tracking provider. Check the impact before replacing another provider. Verify behavior for your installed version and project type.

## Updates and uninstalling

Versions that change permissions or modules may require an administrator-approved installation upgrade. Before uninstalling, export required records, **release worklog controls and verify the results**, then remove time tracking provider and workflow validator dependencies. The pre-uninstall release attempt is a fallback and does not guarantee that every record is restored.

Uninstalling does not delete Jira worklogs. Check the applicable Forge and vendor policies for app-data retention and recovery after uninstalling.

[Documentation home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--02-installation.md)
