# Moves Workforce Gantt density adjustment — 2026-09-02

## Decision

Reduce SVAR Gantt `cellHeight` from 52px to 36px to show more rows per viewport. Use host-scoped Willow font variables rather than direct internal element typography selectors.

## Implementation

- `--wx-grid-body-font`, `--wx-grid-header-font`, and `--wx-gantt-bar-font`: 12px.
- `--wx-timescale-font`: 11px.
- Tree toggle remains a 20px click target with an 18px glyph; the placeholder uses the same width to preserve tree-column alignment.
- Do not force CSS row heights. `cellHeight` must remain the single source shared by the SVAR grid, bars, drag/resize coordinates, and overlay alignment.
- The 36px follow-up leaves 4px vertical space for the 32px Select, 6px for the 30px input, and 12px for the 24px avatar. Treat it as the practical lower bound unless those controls are redesigned.

## Verification

- Frontend Jest: 101 suites / 1,662 tests passed.
- `CI=true npm run build:app` and bundle budget passed.
- `forge lint` passed.
- Browser-level Jira drag/resize and clipping still require manual confirmation in the development environment.
