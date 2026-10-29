# Artifact runtime

Cloud artifact callbacks share files and installed dependencies with the task's shell/code tools, but not process globals. Desktop-only files are unavailable.

Use absolute paths with Node `fs`, `child_process` for installed binaries, and file URLs for imports: `await import("file:///mnt/data/helper.mjs")`. Check `process.cwd()` for the working directory. Rename rewritten modules to avoid Node's import cache; file reads see current contents. For workspace packages, use `createRequire()` rooted in that workspace.

Document images still require uploaded `library-file:` references; see the main skill.

## Newly installed fonts

If exposed, `font_files_to_load` accepts absolute `.ttf`/`.otf` file paths, not directories or globs. Fonts affect rendering/measurement, are not embedded, and cannot replace loaded application faces.

Omit while rendering works. If it stops, pass paths again; reinstall missing files first. Unchanged files are deduplicated.

Font loading is best effort: check edit `status` separately from `font_loading`. Repair fonts through `inspect_artifact`, never by replaying a saved/accepted edit. Resolve unknown edits with `get_artifact_execution_status`.

- `disabled` / `runtime_unsupported`: use available fonts; report incompatibility if needed.
- `memory_limit`: use loaded fonts; avoid repeated registration attempts.
- `registration_failed`: follow `error_details`; fix paths/permissions, replace invalid files, use loaded faces for collisions, or fewer/smaller files for budget errors. A failed batch may have loaded earlier files.
