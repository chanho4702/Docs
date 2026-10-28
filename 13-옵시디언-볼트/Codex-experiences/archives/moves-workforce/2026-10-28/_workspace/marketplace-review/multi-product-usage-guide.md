# Moves Workforce for Jira — How the app works on Jira and Confluence

## Summary

| Product | Required? | What the app does there |
|---|---|---|
| **Jira** | **Required** | The whole app runs here. All screens are inside Jira. |
| **Confluence** | Optional | **No screen inside Confluence.** Jira uses Confluence only to search pages and link them to projects and work items (the **Document Management** tab in Jira). |

> **Please open the app from Jira.** If you install the app only on Confluence, nothing appears there, because the app adds no Confluence module. Confluence is used only as a document source for the Jira screens.

---

## 1. Installation

1. Install **Moves Workforce for Jira** on the **Jira** site.
2. (Optional) To use the document features, also add the app to **Confluence on the same site**.
   - Without Confluence, every feature still works except linking new documents. The Document Management tab shows a "Not connected to Confluence" notice and runs in read-only mode.
3. The Jira administrator who installs the app gets full permissions in the app automatically.

---

## 2. Using the app in Jira

### 2.1 Opening the app

**Jira Apps menu → Moves Workforce**

The app opens as a full Jira page with a left sidebar. The default page is **My Work** (my worklogs).

Sidebar menus: **My Work**, **My Page**, **Portfolio Dashboard**, **Project Management**, **Resource**, **Worklog Export**, and **Settings** (administration).

### 2.2 Reviewer preparation and Jira walkthrough

Use a test site and data you are authorized to change. The names below are examples, not preloaded data or a report of completed testing. Replace them with your own values.

| Prepare | Required access or configuration |
|---|---|
| Administrator and ordinary user | Jira accounts with app access; register the ordinary user in Settings before adding them to a project. |
| Project reference options | A usable project status, role, and level; review working hours and currency in General Settings. |
| Jira issue, such as DEMO-12 | The tester can browse it; time tracking and Work On Issues are available for worklogging. |
| Confluence page, such as Demo release design (optional) | An accessible page in Confluence on the same site, with the app connected to Confluence. |

Follow the [administrator setup guide](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203751476) if these prerequisites are missing. Keep member registration, Jira assignment, and issue-to-project linking separate.

| Step | Action and example | Expected result |
|---|---|---|
| 1. Create the app project | Project Management → add project. Enter Demo website launch, a configured starting status, and 2026-10-05 through 2026-10-30, or your own dates. Save. | Search the list, open the project name, and verify its saved dates and status. This does not create a Jira space. |
| 2. Add a member | Project → User Management → Members → Add User. Add the registered ordinary user, then check or edit the project role/level in the member list. | The member appears in the project list. This does not assign a Jira issue. |
| 3. Link work | Project → Work Management → Add work. Select the prepared Jira issue and review its current project relationship before adding it. | Its key appears in the project's work list. Review any move notice when an issue belongs to another app project. |
| 4. Record time | Switch to the added member's own account, then My Work → add worklog. Select the linked issue, actual work date, 09:00–12:30, and an activity description; submit. | The app and Jira show that member as the author of the same 3 hours 30 minutes entry. Do not enter the same work again in Jira. |
| 5. Review analysis | Open the project dashboard and analysis/report views with a period covering the entry. Use cost views only with cost access and a configured salary basis. | Check period, member/issue scope, and aggregation time before comparing figures. A saved budget is distinct from calculated labor cost. |

If an action is missing, check app read/write access and the relevant Jira permission. If saving time fails, check the error and existing records before retrying. The [detailed quick start](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203751497) explains the input fields and completion checks.

### 2.3 Inside a Jira work item

Jira work-item panels depend on the installed app version and the work item's project link. If a panel is unavailable, use **Jira → Apps → Moves Workforce → My Work** to record time and the project screens to review results. Panel availability is not a prerequisite for testing the Confluence document workflow below.

### 2.4 Administration

Sidebar → **Settings** (Jira administrators and users given permission):
general settings, users, teams, roles, levels, skills, project statuses, permission sets, public holidays, and storage usage.

---

## 3. Using Confluence with the app (optional)

Confluence has **no app screen**. The Confluence features live in the **Document Management** tab of a Jira project.

### 3.1 Where

**Jira → Apps → Moves Workforce → Project Management → (a project) → Document Management tab**

### 3.2 What you can do

1. Click **Link documents**.
2. Search Confluence pages (filter by space, optionally search page content). Select one or more pages.
3. (Optional) Choose the project work items to link them to. If you choose none, the pages are linked to the project itself as "Project documents".
4. (Optional) Choose a category (for example "Design" or "Test plan") and save.
5. The tab then shows:
   - **Documents view**: linked pages with space, category, linked work items, last modified date, and status.
   - **Work items view**: each work item with its linked documents. You can filter work items that have no documents.
   - **Summary cards**: number of linked documents, work items without documents, outdated documents, broken links, and missing required categories.

Categories and the "outdated document" threshold are set in **Settings → General Settings → Documents**.

### 3.3 Access requirements

- Use an account with access to the Jira site and the source Confluence pages on that same site.
- App Project read permission allows viewing project documents. Project write permission is required to link, classify, or unlink them.
- Linking to a Jira work item also requires permission to edit that item.
- Publishing this guide in a documentation site does not connect that site to another Jira site's app. Search uses the Confluence product associated with the app's Jira site.

### 3.4 Reviewer walkthrough and expected results

Continue with the prepared project, linked Jira issue, and same-site Confluence page. Do not use a page hosted only on a separate documentation site.

| Step | Action | Expected result and check |
|---|---|---|
| 1. Find the page | Project → Document Management → Link documents. In Documents, search by space/title or page URL and check the result. | An accessible page appears and its selected count/title matches your intention. If empty, open the original page using the same account. |
| 2. Link to the project | Leave Work items empty; choose an available category or leave uncategorized, then save. | Documents view shows the page as a project document, rather than as an issue-specific link. |
| 3. Link to the issue | Reopen Link documents, select the page, and choose the prepared issue in Work items before saving. | Work items view shows a document link on that issue. Inspect per-issue success/failure results for multi-item operations. |
| 4. Open the source | Click the document title. | The original Confluence page opens; the app has not created a copy or edited its content. |
| 5. Change the category | Use the row's category action and select the intended project/issue relationship. Save. | The selected relationship displays the new category. Other relationships must be checked separately. |
| 6. Unlink a test relationship | Use Unlink and confirm the target relationship before saving. | That link disappears from its target; the original page still exists in Confluence. |
| 7. Check ordinary-user access | Repeat viewing with project read but without project write; use that user's own account. | Permitted documents are readable, mutation actions are unavailable, and Confluence visibility still follows that user's source-page access. |

For failed issue links, check Edit Issues and per-issue document limits before retrying only those targets. Healthy/Stale/Broken/Unknown describe the current user's metadata check; Broken alone is not proof of deletion. The [document guide](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203751465) includes separate worked examples for project and work-item documents.

### 3.5 Status and connection troubleshooting

- **Healthy**: the page is currently accessible to you.
- **Stale**: the last update exceeds the administrator's configured threshold.
- **Broken**: the page may have been deleted or may be inaccessible to the current user; check the original page before assuming deletion.
- **Unknown**: current metadata could not be checked. It does not mean the document is healthy or absent.
- If Confluence is unavailable, saved document titles may still be visible. Searching and new linking are unavailable; ask the site administrator to check the same-site Confluence installation and user access.
- If only some Jira work-item updates fail, check editing permission and document limits for each failed item before retrying.

### 3.6 How the app accesses Confluence

- Scope: `search:confluence` only. The app calls only the Confluence search API (`/wiki/rest/api/search`).
- Calls run **as the current user**. Users see only the pages they already have permission to view in Confluence.
- The app does **not** write to Confluence. Link information is stored on the Jira side: as Jira issue properties, or in Forge storage for project-level documents.
- Without Confluence on the site: existing links remain visible, and searching or adding new links is disabled with a notice.

---

## 4. Data and hosting

- The application backend runs on Atlassian Forge. Workforce data and document-link records use Forge SQL, Forge Key-Value Store, and Jira issue properties.
- Confluence access is read-only: the app does not create, edit, or delete Confluence pages. It stores link metadata and saved page details for displaying relationships and checking status.
- Client error monitoring can use Sentry when configured. The app manifest allows Sentry endpoints, and the client disables default PII collection. See the [Privacy & Security Policy](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/114556931/Privacy+Security+Policy) for the published policy; this walkthrough is not a substitute for that policy.
- No separate third-party account is needed for this document workflow. Reviewers need their own Jira and Confluence access and the app permissions described above.

## 5. Documentation and support

- [English user guide](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046349)
- [Korean user guide](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/172326913)
- [Support service level agreement](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/114556943/Product+Support+service+level+agreement+SLA)
