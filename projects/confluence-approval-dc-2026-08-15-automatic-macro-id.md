# Confluence Approval DC automatic macro identity

2026-08-15: `approval-region` no longer requires users to enter a region key. For a macro without an explicit legacy key, the adapter uses the persistent Confluence storage attribute `ac:macro-id` as `macro:{id}`. The same derivation is used while scanning page storage, so region hashing, duplicate detection, and request lookup agree after editing or moving the macro.

Explicit legacy keys retain priority. Content with neither explicit key nor macro id keeps the previous `default` behavior. The Macro Browser hides the retained compatibility parameter. Validation: 54 domain tests and 113 Confluence 9 tests passed.
