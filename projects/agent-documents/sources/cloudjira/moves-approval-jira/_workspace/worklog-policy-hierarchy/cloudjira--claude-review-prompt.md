You are the final independent reviewer for a Jira Forge approval app change.

Repository: C:\CloudJira\moves-approval-jira

Read these first:
- AGENTS.md
- CLAUDE.md
- _workspace/worklog-policy-hierarchy/00_input/requirement.md
- _workspace/worklog-policy-hierarchy/01_architect/design.md
- _workspace/worklog-policy-hierarchy/02_backend/report.md
- _workspace/worklog-policy-hierarchy/03_frontend/report.md

Review the actual uncommitted implementation, not only the reports. Focus only on release-relevant P0, P1, and P2 defects in:
- policy merge precedence, sparse inheritance, provenance, locked Workforce keys, stale/expired fallback
- signature verification and preventing unverified Jira entity properties from affecting decisions
- permissions, SELF data scope, CAS, SQL readiness, empty IN guards, resolver registration
- worklog create/update/delete restrictions, PREAPPROVAL and CERTIFICATION behavior
- timesheet policy evidence, history early exit, retention compatibility
- cost regressions from scheduled jobs, Jira API calls, SQL queries, and per-row property reads
- UI fail-closed behavior, adequate restriction notice, KO/EN coverage, React Query cache correctness
- backward compatibility with existing site KVS and approval_project_config.policy_json

Do not edit files. Use Read, Glob, and Grep only. Return Korean Markdown with:
1. Verdict: PASS or FAIL
2. Findings grouped P0/P1/P2, each with exact file and line evidence, trigger, impact, and minimal fix
3. Confirmed strengths
4. Remaining external verification items

If there are no findings at a severity, write `없음`. Do not list style preferences or speculative issues without a concrete reachable path.
