# Cc and notifications

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--notifications.md)

Cc recipients follow requests without deciding. Notifications announce requests and results. Being copied or notified does not grant access to the source page.

## Follow a copied request

Find it under **Approval inbox → Cc**. A copied group expands to its members when the request is saved. People joining the group later are not added automatically.

Cc recipients receive in-app notices for creation, final approval, rejection, withdrawal, and expiry. Intermediate step approvals are different from final approval.

## Notification channels

| Channel | Location and behavior | Check |
| --- | --- | --- |
| In-app | **Notifications** in the inbox | Policy controls request, result, reminder, and due-soon notices. |
| Confluence | @mention comments on the target page | Requires comment permission for the user performing the action. |
| Email | Sent by Confluence according to personal notification settings | The app does not send email directly. |

![Request and result notifications in the approval inbox](../assets/ma-13-notifications.jpg)

*MA-13 · In-app notices collect request and decision results. Confluence comment notices also require the policy and comment permission.*

## Recipients by event

| Event | In-app | @mention comment |
| --- | --- | --- |
| Request created | All approvers and Cc | First-step approvers |
| Next step opens | Distinguish from the creation notice | New-step approvers |
| Final approval | Requester and Cc | Requester and Cc |
| Rejection | Requester, undecided approvers, Cc | Requester |
| Expiry | Requester, undecided approvers, Cc | None |
| Reminder / due soon | Current-step approvers; due soon also includes requester | None |

People are not notified about their own action. Withdrawal notifies undecided approvers and Cc in the app, and also the requester if someone else withdrew it.

## Missing notifications

Check in-app policy → event and recipient role → active step → comment permission → personal Confluence settings. A comment failure does not necessarily mean approval failed; inspect the actual decision record.

Reminder and deadline checks run once a day. Decisions after the deadline are blocked without waiting for that job. Administrators configure channels and timing in [global policy](cloudjira--admin-policy.md).
