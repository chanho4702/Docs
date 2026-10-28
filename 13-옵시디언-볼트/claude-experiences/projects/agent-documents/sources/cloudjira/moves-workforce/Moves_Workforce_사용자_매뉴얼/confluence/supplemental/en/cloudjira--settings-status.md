## Access and purpose

Project status management defines project states, Kanban columns, and their transition flow. Read opens settings; write permits status and flow changes. Editing columns from Kanban uses Kanban write, a separate permission.

Initial statuses are To Do → IN PROGRESS → DONE. Names and colors can be customized.

## Add or edit a status

Select Add status, enter the name and color, and save. Row actions edit or delete a status. The definitions appear in project status selectors and Kanban columns; colors are also used by project and My Work cards.

> **[Image insertion point · additional capture needed]** Status list and flow editor with nodes, arrows, and an unconnected-status example.

## Configure transitions

Open the status-flow editor. Each status can have one previous and one next status. Cycles are not allowed. Unconnected statuses are identified. Project updates and Kanban moves validate the target status and configured flow; rejected moves restore the previous state and report the reason.

## Delete a status

At least one status must remain. A status without a previous status cannot be removed where its projects would have no destination. Deleting an eligible status moves its projects to the previous status; it does not delete the projects.

<!-- control-reference:start -->

## Buttons, fields, and result checks

Project statuses govern app projects and kanban. This does not edit Jira issue workflows.

| Control or field | Function, conditions, and data affected | Result check and recovery |
|---|---|---|
| Add Status / name / color / Save | Register a status name/color for organizational projects. | Check the list entry, resolve duplicate-name errors, and review flow connections separately. |
| Edit Status Flow / connect / Save | Connect predecessor/successor statuses. Each has at most one previous and one next connection; cycles are disallowed. | Save the flow and verify allowed kanban moves. Distinguish drawing an edge from saving it. |
| Edit / Delete status | Change name/color or remove a status definition, potentially affecting existing project/flow references. | Review project/flow usage and resolve references if deletion is rejected. |



<!-- control-reference:end -->

