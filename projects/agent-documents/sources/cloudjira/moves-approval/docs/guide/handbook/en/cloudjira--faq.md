# Troubleshooting and support

[Guide home](cloudjira--index.md) · [한국어](../ko/cloudjira--faq.md)

Before repeating an action, identify the page, request, and account. After a creation or bulk-approval error, inspect what actually succeeded.

## Screens and requests

| Symptom | Check in order | Guide |
| --- | --- | --- |
| App or settings missing | Installed site → account → access policy or administrator registration | [Installation](cloudjira--installation.md), [access](cloudjira--admin-access.md) |
| Cannot request from a page | Published state → edit permission → enabled space → existing open request | [Page approval](cloudjira--page-approval.md) |
| No approvers or lines in search | Search term → registration or group → line enabled status and spaces | [Approval lines](cloudjira--admin-lines.md) |
| Request submitted but no stamp box | Request existence → version or concurrent edit → manual insertion | [Stamp box](cloudjira--stamp-box.md) |
| Duplicate area identifier | Copied macro → remove duplicate and insert a fresh macro | [Area approval](cloudjira--area-approval.md) |

## Decisions and versions

| Symptom | Check | Next action |
| --- | --- | --- |
| Named as approver but no button | Active step → identity or delegation → deadline → finished status | Wait for the earlier step or contact the requester. |
| Another user changed the request | Latest status and decisions | Do not retry a completed action. |
| Past deadline but not marked expired | Overdue indicator | Daily cleanup may be pending; decisions are already blocked. |
| Page edited after approval | Approved and current versions | Request approval of the current version. |
| Mistaken approval or rejection | Open or finished request | Withdraw and replace if open; create a new request if finished. |
| Locked or forgotten PIN | Attempts and 15-minute lock | No administrator reset feature exists; ask support for guidance. |

## Notifications and files

For missing notifications, check [channel, recipient role, and policy](cloudjira--notifications.md). A comment failure does not imply a decision failure. PDF buttons appear only for finished requests. For a missing fingerprint, check whether the target version was readable.

Excel can contain more rows than the screen because it includes requests not yet loaded. Inbox export covers up to 5,000 matching requests. It is different from the retention export required before deletion.

## Include in a support request

- Site and page URL, and request ID
- Time and time zone, selected action, and exact error message
- Your role, request status, and target version
- Reproduction steps and a screenshot with sensitive information removed

Use the support channel on the Marketplace listing. Do not send passwords, API tokens, or signature PINs. Check whether a request already exists before trying to create it repeatedly.
