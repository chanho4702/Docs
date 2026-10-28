# Moves Workforce project deletion audit — 2026-08-27

- SQL child cleanup covers the current project-owned tables, but project deletion neither deletes Jira issues nor clears their RMS custom-field/property metadata. Treat Jira unlinking as an explicit, retryable lifecycle step rather than deleting Jira business records.
- Forge SQL cascade is sequential and non-atomic. Idempotent queries make manual retry technically possible, but a persisted deletion state and retry observability are required to avoid silent partial deletion.
