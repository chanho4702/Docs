# Moves Workforce deletion saga verifier remediation

- Retry logic must include `BLOCKED_INACCESSIBLE` and `FAILED`, not only `PENDING`; otherwise a later retry can incorrectly enter SQL cleanup while Jira metadata remains.
- Before an idempotent retry, re-check Jira access and transition a now-accessible work row back to `PENDING`; preserve completed property/field facets.
- The deletion status contract needs operational fields (`attempt`, aggregate issue counts, SQL step map, sanitized error, timestamp), not only a display status.
- SQL saga creation needs duplicate-safe insert semantics before lease claim so two first requests converge on one operation.
