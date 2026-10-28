# Installation and first-time setup

Use Jira Cloud with an administrator authorized to install apps, a test project, and requester and approver accounts. Before the public Marketplace release, use only the Forge installation route supplied by the product team.

## Install

1. After release, find **Moves Approval for Jira** on Marketplace, verify the product and publisher, and install it on your site.
2. Review the requested access. See [Data, security and privacy](cloudjira--11-data-security-privacy.md) for its purpose.
3. Open **Moves Approval** from Jira's app navigation. Its location can vary with Jira's navigation layout.
4. Open the app's settings from Jira app administration or the inbox. App settings managers use the inbox route.

## Configure in this order

1. Select the projects using approvals. Before an explicit scope is configured, all projects are allowed by default. Select a test project and verify with a regular account.
2. Create approval groups and flows. Verify that requesters and approvers can view the issue.
3. Configure the timesheet unit, time zone, teams and leads. Add an optional second-step group.
4. Test a general request, approval, rejection and inbox history.
5. Configure the [workflow validator](cloudjira--07-transition-approval.md) for enforced transitions and the [time tracking provider](cloudjira--06-worklog-period-lock.md) for period locks separately.
6. Before enabling restricted access, populate the approver roster, settings managers and timesheet teams, then test with a regular account.

For a minimal test flow, save **one step → approver B only → required approval count 1** and make it available to the test project. A submits using this flow; B decides from My turn.

Changing the time tracking provider affects the entire site. Check the existing provider before switching. Importing a team from a Jira group is a one-time copy, not ongoing synchronization.

## Update or uninstall

An update requesting additional permissions requires administrator approval. Confirm supported configurations against the installed version and the [review verification record](cloudjira--13-marketplace-review-guide.md).

Before uninstalling, export required records and remove dependencies on the app's time tracking provider and workflow validator. Uninstalling does not delete Jira worklogs or comments already written by the app. Confirm Forge's policy for app data retained after uninstall.

[Home](cloudjira--00-index.md) · [한국어](../ko/cloudjira--02-installation.md)
