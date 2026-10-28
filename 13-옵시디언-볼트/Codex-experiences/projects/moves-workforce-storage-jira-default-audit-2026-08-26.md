# Moves Workforce Storage and Jira default audit — 2026-08-26

## Findings

- Storage project attribution must enumerate every SQL table with `project_id`; omitting `project_subscription`, `project_team`, or `project_skills` leaves their bytes in the common/unassigned bucket even though their ownership is known.
- A shared Jira REST wrapper must default to `asUser()`. Leaving the generic `as` default as `app` turns one omitted option at a future call site into a permission-boundary regression.

## Follow-up

Keep the storage table list aligned with DDL through a regression test, and make app-authority Jira calls explicit and documented exceptions.
