# Moves Workforce worklog time-range input — 2026-09-02

## Decision

Replace the normal worklog duration text input (`1h`, `30m`) with start/end time selection. Compute `timeSpentSeconds` client-side and preserve Jira's existing Worklog REST payload.

## Boundaries

- `WorklogModal` is shared by My Work and Project Calendar, so one UI path changes both create and edit.
- The app uses Custom UI `requestJira()` as the current user; no resolver, database, manifest, or query-key contract changes are needed.
- Existing overnight, multi-day, zero/invalid-duration worklogs cannot be faithfully represented as a same-day range. Keep their duration input as a legacy fallback.
- Legacy fallback must restore `started` in `context.timezone`. Initializing it from today/09:00 would silently rewrite the original worklog timestamp during a duration-only edit.
- If an existing legacy worklog has a malformed `started`, block saving instead of inventing a replacement timestamp.
- Put single-day start and end controls on one row. Use 5-minute dropdown presets (288 options) to avoid an unvirtualized 1,440-option menu, while `timeIsEditable` keeps exact `HH:mm` input such as `09:07` available.

## Verification

- Root: 110 suites / 1,488 tests passed.
- Frontend: 106 suites / 1,722 tests passed.
- CI build, bundle budget, and Forge lint passed.
- Real Jira create/edit permission scenarios still need development-site manual verification.
