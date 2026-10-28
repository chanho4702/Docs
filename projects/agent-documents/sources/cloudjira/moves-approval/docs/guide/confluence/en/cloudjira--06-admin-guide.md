# Administrator guide

[English Guide](cloudjira--00-index.md) · [한국어](../ko/cloudjira--06-admin-guide.md)

> For: Confluence administrators and Moves Approval settings administrators

## Who can change settings

| Role | Scope |
| --- | --- |
| Confluence administrator | All settings. Always has access; no registration needed. Can also withdraw other people's requests. |
| Settings administrator | Manages app settings with the same scope as a Confluence administrator, including adding and removing other settings administrators. |

Settings are under **Confluence settings** → **Moves Approval**, and also open from the **Settings** link in the approval inbox. Permission is re-checked on the server for every action, so knowing the URL does not let anyone read or change settings.

The settings screen has eight tabs: **Global policy**, **Enabled spaces**, **Approval lines**, **Approval groups**, **Approvers**, **Settings administrators**, **Change log**, and **Data management**.

## Global policy

Defaults for new requests, plus notification and security rules. Changes apply as soon as you save.

| Setting | Default | Description |
| --- | --- | --- |
| Default deadline (days) | 7 days | Default deadline in the request form. `0` starts requests with no deadline. Requesters can change it per request. |
| Due-soon threshold (hours) | 24 hours | When this little time remains, the approvers whose turn it is (and the requester) get one due-soon notification. Deadlines are checked once a day, so even with a value below 24, the notice can go out as early as 24 hours before the deadline (on screen: "checked once a day, so alerts may come up to a day early when set below 24 hours"). |
| Require a reason when rejecting | On | Rejections must include a reason. |
| Use in-app notifications | On | Creates notifications under **Notifications** in the approval inbox. |
| Also notify through Confluence | On | Leaves an @mention comment on the page. See [Notifications](#notifications). |
| Show signatures and stamps next to decisions | On | Shows the registered signature or an automatic name stamp in the approval table. |
| Require the signature PIN to confirm approvals and rejections | Off | When on, every approver must set a PIN under **My signature** before deciding. |
| Send reminders | Off | Re-notifies **only the approvers whose turn it is** about requests left undecided. |
| Days before the first reminder / Reminder interval (days) | 3 / 3 | Reminder timing when reminders are on. |
| Add an approval stamp box to the top of the page when a request is made | On | Default for the **Add a stamp box to the top of the page** checkbox in the request form. Requesters can clear it per request. Applies to page approvals only. See [Stamp box](#stamp-box). |
| Allow delegation | Off | Lets users choose a delegate under **My delegation**. When off, saved delegations have no effect. |
| Verify approvers can view the page when a request is made | On | Refuses a request if any approver cannot view the page. Open requests are not affected. |
| Only registered users can use the app | Off | When on, only the approver list, settings administrators, and Confluence administrators can open the inbox and request screens. **Global only.** |
| Status labels | (per language) | Display names for Pending approval, Approved, Rejected, Expired, and Withdrawn. **Global only.** |

### Status labels

In the status diagram under **Global policy**, select a status to edit its label.

- Leave a label blank to show the default in each user's language. Organization-defined labels are **not translated** and appear as entered in every language.
- Only the wording changes; the approval workflow stays the same. Express intermediate states (for example, "Legal review") through **step names** in approval lines.

### Before you restrict access

1. Register all requesters and approvers on the **Approvers** tab.
2. Register operators on the **Settings administrators** tab.
3. Test the inbox and request screens with a registered regular user account.
4. Then turn on **Only registered users can use the app**.

Unregistered users will see "Only registered users can use this app."

> **Screenshot placement · 15-policy**
>
> Global deadline, notification, signature, and access policies
>
> File: `ma-15-policy-en.png` · Alt text: Global deadline, notification, signature, and access policies
>
> Insert an actual product screenshot here.

## Enabled spaces

Choose which spaces use approvals, and optionally set a different policy per space.

- **Initially**, with no spaces turned on, approvals work in every space.
- **Turning on any space** limits new requests and the area macro to the spaces you turned on; all others are off.
- **Turning a space off** does not close its open requests. Saving warns you how many remain; they can still be decided from the approval inbox (area boxes disappear from the pages).

### Space policy

Select **Edit policy** on a space row and switch on only the items that should differ in that space. The rest follow the global policy (shown as, for example, "Follows global · currently 7 days"). **Only registered users can use the app** and **Status labels** must be the same across the site, so they cannot be set per space.

Example: the Legal space uses a 3-day deadline and requires a PIN; every other space uses the global defaults. **Adding the stamp box automatically** can also be switched on or off per space.

> **Screenshot placement · 16-spaces**
>
> Enabled spaces and space policy
>
> File: `ma-16-spaces-en.png` · Alt text: Enabled spaces and space policy
>
> Insert an actual product screenshot here.

## Approval lines

Predefine approval orders you use often. They appear on the **Use an approval line** tab of the request form.

- **Name** (required, up to 255 characters), **Description** (shown to requesters), **Default deadline (days)** (1–365; leave empty to follow the global default)
- **Approval steps** — The same editor as the request form: steps, approvers, approval groups, required approvals, and step names.
- **Spaces** — The line is offered only in request forms in the spaces you pick. Leave it empty to offer it everywhere.
- Turning **Enabled** off hides the line from new requests only.
- Editing or deleting a line **does not affect existing requests**; each request keeps a copy of the line it was created with.

> **Screenshot placement · 17-lines**
>
> Approval steps and required approval counts
>
> File: `ma-17-lines-en.png` · Alt text: Approval steps and required approval counts
>
> Insert an actual product screenshot here.

## Approval groups

Groups that can be placed on an approval line as one step.

| Type | Description |
| --- | --- |
| Confluence group | Uses a Confluence group as is. Membership is managed in Confluence. |
| Custom | A group used only by this app. You pick the members (for example, "Legal review"). |

- **Passing rule** — On: **All must approve**. Off: **Any one**.
- Turning off **Show in approval-line search** or deleting the group removes it from search, but requests already using it keep running.
- **View members** shows the current members.

> **Screenshot placement · 18-groups**
>
> Approval group members and passing rule
>
> File: `ma-18-groups-en.png` · Alt text: Approval group members and passing rule
>
> Insert an actual product screenshot here.

## Approvers

The list of people who can be placed on an approval line.

- **Leave it empty** to allow anyone to be an approver.
- With a list, only listed people can be placed on a line ("Only registered approvers can be placed on the line").
- When **Only registered users can use the app** is on, this list also acts as the list of app users.
- Regardless of the list, approvers must be able to view the page when the request is made (default policy).

> **Screenshot placement · 19-access**
>
> Approver list and registered users
>
> File: `ma-19-access-en.png` · Alt text: Approver list and registered users
>
> Insert an actual product screenshot here.

## Settings administrators

People who can change every approval setting without being Confluence administrators. Enter at least two characters of a name to find someone, then select **Save settings administrators**. Confluence administrators do not need to be registered.

## Change log

Changes to policy, enabled spaces, approval lines, approval groups, approvers, and settings administrators, plus retention changes, exports, and deletions under **Data management**, are recorded with **when, user, area, action, and detail** (data management actions appear with the area "Retention" and the actions "Update," "Export," and "Purge"). Users cannot edit or delete entries; they are removed automatically after **one year**. If you need longer retention, capture them periodically.

Decision records for each request live in its **Audit timeline** and **Approval history by version**. Users cannot edit these either; they are removed only when an administrator exports and then deletes them under the retention policy in [Data management](#data-management).

> **Screenshot placement · 20-audit**
>
> Time, user, area, and action in the change log
>
> File: `ma-20-audit-en.png` · Alt text: Time, user, area, and action in the change log
>
> Insert an actual product screenshot here.

## Data management

Manage the storage the app uses and how long finished approval records are kept. Available to Confluence administrators and settings administrators.

### Storage

- A bar shows how much space the app uses against a **1 GiB** limit ("{used} of {limit} used (N%)"). At 80% or more it shows **Warning**; at 90% or more, **Critical**.
- **When the limit is reached, new approvals can no longer be saved.** When you see **Warning**, plan a cleanup with [Approval record retention](#approval-record-retention).
- A table shows **Size, Rows (est.), and Share** for each kind of data (table); select a column header to sort. Sizes and row counts are estimates from database statistics and may differ slightly from the actual values. Select **Refresh** to reload.

### Approval record retention

Choose how long finished approvals (approved, rejected, expired, withdrawn) are kept. Approvals still in progress are not affected.

1. Choose a **Retention period** — **Forever**, or 1, 3 (default), 5, or 10 years. The number of records past the period and the date of the oldest record are shown.
2. Select **Export to Excel**. Every record past the period is downloaded as an Excel file with three sheets: **Requests**, **Approvers**, and **History**. The export is recorded only after the file has actually downloaded, and is shown as "Last export: {date} · N records ({user})."
3. After storing the file, select **Delete N exported records**, then select **Delete** again at "Delete them? This cannot be undone."

- **Only the range covered by the last export** is deleted. Records cannot be deleted before they are exported to Excel ("Export the records past the retention period to Excel before deleting them.").
- If more records passed the period after the last export, you see "N more records passed the period since the last export. Export again to delete them too."
- Deleting a request also deletes its approval line, audit history, inbox entries, and related notifications. **This cannot be undone**, so store the exported file according to your records retention rules first.
- Retention changes, exports, and deletions are all recorded in the **Change log**.
- Finished approval records are **never deleted automatically**, even after the retention period. They are removed only by exporting and then deleting as above.

### Automatic cleanup

| Data | Retention |
| --- | --- |
| In-app notifications | Deleted automatically after 180 days |
| Settings change log | Deleted automatically after one year |
| Finished approval records | Never deleted automatically (an administrator deletes them after exporting the records past the retention period) |

> **Screenshot placement · 21-retention**
>
> Storage, retention period, and export
>
> File: `ma-21-retention-en.png` · Alt text: Storage, retention period, and export
>
> Insert an actual product screenshot here.

## Notifications

| Event | In-app notification | Confluence notification (@mention comment) |
| --- | --- | --- |
| Approval requested | **All** approvers on the line, Cc | Step 1 approvers |
| Next step starts | — (already notified at request time) | Approvers of the step that just opened |
| Final approval | Requester, Cc | Requester, Cc |
| Rejected | Requester, approvers who have not decided, Cc | Requester |
| Withdrawn | Approvers who have not decided, Cc (plus the requester when someone else withdrew it) | Approvers whose turn it is (plus the requester when someone else withdrew it) |
| Expired | Requester, approvers who have not decided, Cc | — |
| Due soon | Requester, approvers whose turn it is | — |
| Reminder | Approvers whose turn it is | — |

- The person who performed the action is never notified about it.
- Intermediate approvals that still wait on others in the same step are not announced; notifications go out only when a step advances or the request ends.
- While a delegation is active, the delegate also sees those turns in their approval inbox.
- Due-soon notices and reminders stop when the request ends (approved, rejected, expired, or withdrawn). Requests without a deadline get no due-soon notice.
- @mention comments are **visible to everyone who can view the page.** Agree on how to write potentially sensitive content such as rejection reasons. If comments are unwelcome, turn off **Also notify through Confluence**.
- Email is delivered only when Confluence sends the @mention according to each user's Confluence notification settings. The app never sends email itself.

## Stamp box

The stamp box is a macro that shows approval steps, approvers, and stamps on the page like a paper approval form (the macro appears in the editor as **Moves Approval Stamps**). It is used for page approvals; for area approvals, the same stamp box is attached below the area panel.

- **Automatic insertion** — When the **Add an approval stamp box to the top of the page when a request is made** policy is on (on by default), a stamp box is added to the top of the page when a request is made. If the page already has one, nothing is added.
  - The page is edited with the requester's permissions, so the page version goes up by one and the page history shows the requester with the message "Moves Approval". The approval applies to that new version.
  - If the stamp box cannot be added (the requester cannot edit the page, or someone else saved in the meantime), the request still goes ahead without it.
  - This is the only case in which the app writes to a page body, and it never does so with the app's own permissions.
- **Tip** — For documents that are approved often, place the **Moves Approval Stamps** macro in the Confluence template in advance. The stamp box is where you want it from the start, and the page version does not go up for it at request time. On a page with no approval request yet, the stamp box shows "No approval request yet." and a **Request approval** button (for people who can request).
- If the **Show signatures and stamps next to decisions** policy is off, the stamp box shows text instead of stamps.

## Expiry and scheduled processing

- Deadline expiry, due-soon notices, reminders, and cleanup of old notifications and settings change log entries are handled by a background job that runs **once a day**. The Atlassian platform decides when it runs.
- As a result, it can take up to a day for a request past its deadline to be cleaned up as **Expired** in lists. Until then, the inbox and approval details show **Overdue**, and the item below the page title shows "⌛ Overdue".
- However, once the deadline passes, decision buttons disappear right away, and any attempt to decide is refused by the server, which expires the request on the spot, so no approval can happen after the deadline. A new request on a page whose previous request is past its deadline expires the previous request automatically.
- Due-soon notices can go out as early as 24 hours before the deadline even when the threshold is set below 24 hours. Reminders are counted in days and are not affected.

## Operations checklist

- [ ] Enabled spaces are configured as intended.
- [ ] Approvers can view the relevant spaces and pages.
- [ ] Deadline, due-soon threshold, and reminder intervals match your rules.
- [ ] If access is restricted, requesters, approvers, and settings administrators were registered first.
- [ ] Representative approval lines and groups exist, and a test request has run end to end.
- [ ] Decisions are made on signatures, PIN, delegation, and Confluence notifications, with rules for using them.
- [ ] You decided whether to add the stamp box automatically, and placed the stamp box in templates for documents that are approved often.
- [ ] The approval record retention period matches your rules, and storage usage is checked regularly.
- [ ] The change log and Excel exports are reviewed regularly.

## Related guides

- [Installation and first-time setup](cloudjira--02-installation.md)
- [Data, security, and privacy](cloudjira--08-data-security-privacy.md)
- [FAQ and troubleshooting](cloudjira--07-faq-troubleshooting.md)
