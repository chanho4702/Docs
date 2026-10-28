# Moves Workforce Settings Server Validation (2026-08-31)

## Findings

- `guardedDefine` authorizes a resolver but does not validate mutation inputs.
- `updateSetting` validates only progress threshold and salary policy, so direct invoke can persist invalid numeric operational settings.
- A legacy read fallback that normalizes an unknown permission scope to `ALL` must not be used on a write boundary.

## Decision

- Keep compatibility fallback for reads, but use strict rejection for permission mutation scope/pages.
- Keep P1 limited to settings and permission payloads; catalog/holiday validation and project-status graph work remain separate.

## Related

- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-feature-audit-2026-08-26|moves-workforce-feature-audit-2026-08-26]]
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-audit-followup-2026-08-26|moves-workforce-audit-followup-2026-08-26]]
