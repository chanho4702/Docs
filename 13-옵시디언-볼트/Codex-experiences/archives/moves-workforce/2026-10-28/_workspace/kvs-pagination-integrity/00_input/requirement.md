# KVS pagination integrity

## Goal

Fix P1 silent truncation caused by Forge KVS `findAll()` helpers that discard cursors after 100 records. Lists, name-duplicate checks, seed/migration, holidays, and job/failure views must not silently disagree or omit data.

## In scope

- Identify all project code paths using truncating custom entity list helpers.
- Use a shared paged helper and shared limit policy where full data is required.
- Where an intentional upper limit is necessary, return/handle explicit truncation rather than silently accepting partial data.
- Align list visibility and duplicate validation limits.
- Add regression tests beyond 100 records.

## Out of scope

- Changes to Forge KVS platform behavior, arbitrary data migration outside affected entities, and unrelated P1 issues.

## Acceptance criteria

1. No affected list or seed/migration path silently drops record 101+.
2. Duplicate checks and displayed lists use the same bounded policy.
3. Job/failure and holiday paths correctly page or explicitly report truncation.
4. Focused tests cover multi-page data and limits.
