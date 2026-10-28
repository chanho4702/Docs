# Installation and readiness

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--installation.md)

Moves Approval runs in Confluence Cloud. A site administrator installs it; users then access it through the installed site's Apps menu and pages.

## Install

1. Confirm the target Confluence Cloud site and an administrator account allowed to install apps.
2. If the app is publicly listed, find Moves Approval for Confluence in Atlassian Marketplace. For a private review or early-access installation, use the installation link supplied by the provider. Check the app name, provider, supported product, and displayed installation terms.
3. Select the site, review requested permissions, and complete installation.
4. For a private review version, use the installation route supplied by the submission owner. Distinguish that from a public listing installation.

## Verify three entry points

| Location | Expected screen | If unavailable |
| --- | --- | --- |
| Apps → Moves Approval | Approval inbox | Check site, account, and app access policy. |
| Below a published page title | Approval status or request entry | Check page permission and enabled space. |
| Confluence settings → Moves Approval | Administration | Check Confluence or settings-administrator access. |

Follow [administrator setup](cloudjira--admin-setup.md) for a new site and give users the [quick start](cloudjira--quick-start.md). No separate external account or customer-operated server is needed.

## Updates and licensing

If an update or additional-permission approval appears, an administrator reviews it in app management. After an update, check a new request form and existing request history.

An inactive license blocks new requests and decisions, and every app screen (including settings) and macro in documents shows a purchase notice. Content inside area-approval macros and the approval status under the page title stay visible. Check the license status in Confluence settings → Manage apps. Use the actual listing for pricing and trial terms.

## Before uninstalling

Keep important finished requests as [PDF certificates](cloudjira--certificate.md) and lists through [inbox Excel export](cloudjira--inbox.md). The inbox export is limited to 5,000 request rows and is not a complete history backup. See [data management](cloudjira--admin-data.md) for retention exports.

After uninstalling, app views and macro rendering stop working. @mention comments and macro definitions may remain as Confluence content. Retention and deletion of app data after uninstall follow Forge platform policy.
