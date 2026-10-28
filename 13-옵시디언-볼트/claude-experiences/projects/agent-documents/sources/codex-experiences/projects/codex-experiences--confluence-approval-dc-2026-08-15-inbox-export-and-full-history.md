# Confluence Approval DC inbox export and full history

2026-08-15: Inbox rows distinguish `PAGE` and `CONTENT_REGION` requests with visible type badges. The server-side Excel-compatible CSV export repeats the current user's authorization and filters before writing the file, includes request type, protects spreadsheet formula cells, and caps one export at 10,000 rows.

Approved version history is no longer limited to five records. The latest approval remains visible by default; an expandable section reveals all approved versions, and each version exposes its append-only audit timeline.

Validation: Maven package for `approval-domain` and `approval-confluence9` passed with 54 domain and 112 Confluence 9 tests.
