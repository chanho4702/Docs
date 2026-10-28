## Register or change project required skills

**Path:** Project Management → Add project or edit an existing project → **Required skills**. Changes require Project write access.

Required skills describe the capabilities the project needs and provide a basis for comparing candidate skill fit. They are optional and can be added or changed later. Choose entries already in the organizational skill catalog; this dialog does not create catalog entries. Ask an authorized skill administrator to register a missing skill.

### Select and save skills

1. Choose a **Job category**, or **All categories**. **Search skills** searches skill names and category text. If results are empty, check both the search term and category.
2. Click an **Available skills** entry. A checkmark appears, and **Selected skills** and its count update. You can select several entries.
3. Click the candidate again or **×** in the selected list to remove it from this project's selection. This does not delete the organizational catalog entry or anyone's owned skill.
4. Check required skills and basic project details, then click **Save project**. Selection alone is not a saved change. For example, selecting React and SQL and saving makes both skills project requirements.
5. After success, reopen the same project's edit dialog and verify the selected skills. In candidate views, inspect the project's requirements and each person's matched/missing skills together. Fit is a review aid, not an automatic assignment or hiring decision.

### When loading or saving skills fails

- **No skills registered:** ask an administrator to populate the catalog. A successfully loaded empty catalog differs from a failed query.
- **Unable to load skills:** use **Try again** to reload the catalog. If existing project details or skill links cannot load, use **Reload**. Selection/saving can remain unavailable until loading completes to protect existing values.
- **Not in the current catalog:** a previously linked ID is absent from the catalog. Check the requirement and catalog before removing it; do not clear all selections because loading failed.
- **Project details saved, but skills not saved:** your selection is retained. Use **Save project** again in the open dialog. Basic project data can already be saved; do not create a duplicate project.
- **Save result unconfirmed:** saving again in the same dialog checks the same creation request. New-project basic fields can remain locked until confirmation. For a conflict notice, inspect the saved project in the list. If retrying skill storage is denied, ask a project administrator to apply the selection.

## Collaboration mode: setup and scope

**Path:** Project Management → edit an existing project → **Collaboration mode**. It does not appear during initial creation: save the project first, then edit it. Changing the setting requires Project write access and visibility of that project.

Collaboration mode lets registered project participants view linked Jira work and worklogs within the app's accessible scope. In the applicable Work Management, Gantt, project Calendar, and Dashboard views, it reduces differences caused by individuals' Jira browse access. Other people's worklogs can be shown, so check the intended audience before enabling it.

### Turn it on or off

1. Review the project member roster. Collaboration reads require registered project membership and access within the app's project scope. Assigning a team does not itself register every member. Administrative access alone does not qualify a nonparticipant for collaboration reads.
2. Turn on the toggle in the edit dialog. Read the **Turn on collaboration mode?** confirmation, the work/worklog sharing notice, and the coverage limitations.
3. Choose **Turn on** to request the change. **Cancel** in the confirmation cancels enabling. Wait while coverage is loading. If enabling becomes available after a coverage-check failure, that does not establish access to every work item.
4. Check the success notice, toggle state, and **Last changed** actor/time. Open the relevant view and check the collaboration badge and visible work.
5. Turning the toggle off requests the change immediately without the enabling confirmation. After success, reads return to each person's own Jira access. Work items and worklogs are not deleted.

**Collaboration mode applies immediately and independently of basic details and skill saving.** After a successful toggle change, there is no additional **Save project** step. Closing the project edit dialog does not undo a successful collaboration change. Unsaved names, dates, and required skills still need Save project. To revert collaboration mode, explicitly restore the toggle and verify success.

### Limits that still apply

- **Feature access, membership, and project scope:** app read access and project visibility still apply. Distinguish the writer's permission to configure the mode from participants' eligibility to use collaboration reads.
- **Jira editing:** visibility does not add permission to change status, dates, assignees, or worklogs. Editing uses each person's Jira access. Opening the original issue in Jira also requires that person's Jira browse permission.
- **Work the app cannot browse:** spaces inaccessible to the app and security-level-restricted issues can remain hidden. Ask a Jira administrator to check the app role's Browse Projects access for a restricted space. Administrative routes and permission models differ between project types, including team-managed and company-managed.
- **Unknown, partial, or visible only to you:** failed checking does not mean there are zero restrictions. A partial-check notice is not a complete audit. Work visible only to you may not appear identically for other participants.
- **Own-access views:** Progress Trend, Cost Burn-up, and the Relations section in work-item details use personal Jira access. Do not interpret this mode as a blanket expansion of analytics, financial, Confluence document, or other feature permissions.

After a setting-load or change error, recheck the actual toggle state. An unavailable setting is not confirmed Off, and a requested change without success is not confirmed applied.
