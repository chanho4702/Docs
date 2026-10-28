# Installation and first-time setup

[English Guide](cloudjira--00-index.md) · [한국어](../ko/cloudjira--02-installation.md)

> For: Confluence Cloud site administrators

## Prerequisites

- **Site administrator** permission on your Confluence Cloud site
- Your organization's Marketplace purchasing or approval process, if any
- Nothing else: the app runs on Atlassian's infrastructure (Forge), so no servers, firewall changes, or external accounts are needed.

## Install

1. In Confluence, open **Apps** → **Explore more apps** (or go to the Atlassian Marketplace).
2. Search for **Moves Approval** and open the listing.
3. Select **Get app** (free trial or purchase).
4. Choose your Confluence site, review the permissions the app requests, and approve them. See [Data, security, and privacy](cloudjira--08-data-security-privacy.md#permissions-the-app-requests) for what each permission is used for.
5. The app prepares its data storage automatically after installation. If you see "The app storage is still being prepared" on first use, refresh after a moment.

> **Screenshot placement · 03-install**
>
> Installing Moves Approval on Confluence Cloud
>
> File: `ma-03-install-en.png` · Alt text: Installing Moves Approval on Confluence Cloud
>
> Insert an actual product screenshot here.

## Verify the installation

Right after installation you should see:

- **Moves Approval** in the top **Apps** menu
- **Moves Approval** in the **Confluence settings** sidebar
- A **Request approval** item below the title of any page

> **Screenshot placement · 04-entry**
>
> Opening the approval inbox from the Apps menu
>
> File: `ma-04-entry-en.png` · Alt text: Opening the approval inbox from the Apps menu
>
> Insert an actual product screenshot here.

## First-time setup checklist (recommended order)

Go to **Confluence settings → Moves Approval**. Each tab is described in the [Administrator guide](cloudjira--06-admin-guide.md).

1. **Global policy** — Set the default deadline (7 days by default), whether a rejection reason is required, notification channels, signatures and PIN, delegation, and reminders to match your rules. **Add an approval stamp box to the top of the page when a request is made** (on by default) is set here too. While it is on, the stamp box option is pre-checked on the request form, and requesting approval raises the page version by one. Turn it off if you don't want the app to touch page content (requesters can still turn it on per request).
2. **Enabled spaces** — Approvals work in every space at first. To limit them, turn on the spaces you want. **Turning on any space turns all other spaces off.**
3. **Settings administrators** — Give settings access to operators who are not Confluence administrators.
4. **Approvers** — Register an approver list if you want to restrict who can be placed on an approval line. Leave it empty to allow anyone.
5. **Approval groups** and **Approval lines** — Register common approval orders to save requesters time.
6. **Data management** — Check that the **retention period** for finished approval records (3 years by default) matches your records policy. Records past the period are not deleted automatically; an administrator can delete them only after exporting them to Excel.
7. **Pilot** — On a test page, run request → approve, request → reject, and request → withdraw once each, and check that notifications arrive and that the stamp box appears at the top of the page and gets stamped. Download an **Approval certificate (PDF)** from a finished request once as well.

> **If you plan to restrict access**, register approvers and settings administrators first, then test with a regular user account before switching it on. Unregistered users will no longer be able to open the approval inbox or request screens.

## Tell your users

Sharing these guides is usually enough for people to get started without training:

- People who request approval → [Requester guide](cloudjira--03-requester-guide.md)
- People who approve → [Approver guide](cloudjira--04-approver-guide.md)

## Updates

Moves Approval updates automatically through Atlassian. A site administrator only needs to approve an update in Confluence's **Manage apps** screen when the new version asks for **additional permissions**. Existing requests, decisions, and history are kept across updates.

## Licensing

If the license expires or becomes inactive, approval screens show "The app license is not active" and no new requests or decisions can be made. **The settings screen stays available** so administrators can check the license status. Reactivate the license to continue with all existing data.

## Uninstall

Remove Moves Approval from **Confluence settings → Manage apps**.

- Approval status on pages, the approval inbox, the approval features of the **Moves Approval Region** macro, and the **Moves Approval Stamps** macro display disappear. Content inside the macro stays on the page.
- @mention comments the app left on pages are Confluence content and remain after uninstalling.
- Retention and deletion of app data (requests, decisions, history, settings) follow the Atlassian Forge platform's data retention policy. If you must keep approval records, export the lists you need with **Export to Excel** in the approval inbox before uninstalling. You can also keep important approvals as **Approval certificate (PDF)** files. The inbox export includes up to 5,000 requests matching the current tab and filters; it is not a complete backup of individual decisions and audit history.

## Related guides

- [Overview and key concepts](cloudjira--01-overview.md)
- [FAQ and troubleshooting](cloudjira--07-faq-troubleshooting.md)
- [Marketplace review guide](cloudjira--09-marketplace-review.md)
