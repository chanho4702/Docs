---
name: jira-approval-repo
description: Jira 판 승인 앱은 별도 리포 C:\CloudJira\moves-approval-jira 에서 하네스(approval-harness)로 개발 중 — 이 Confluence 리포와 혼동 금지
metadata:
  node_type: memory
  type: project
  originSessionId: fb978189-6f4a-42e9-af36-c4c64439aff9
  modified: 2026-10-03T04:51:33.068Z
---

Jira 판 승인 앱은 2026-10-03 별도 리포 `C:\CloudJira\moves-approval-jira` 로 시작했다(이 Confluence 리포 `fa07591` 을 git archive 로 복사). 설계서는 그 리포 `docs/DESIGN.md`, 하네스는 `.claude/skills/approval-harness`(core-port → timesheet-approval → period-lock → workforce-link → transition-approval).

**Why:** 사용자가 별도 레포 관리를 지시. 고객(스트라드비전) 핵심 요구가 워크로그 잠금·승인이라 타임시트 먼저, 기본 단위 월.

**How to apply:** Jira 판 작업 요청은 그 리포에서 한다. 이 리포(Confluence 판)는 원본으로만 읽는다. 복사본 manifest 의 app id 는 placeholder(`REPLACE-WITH-forge-register`) — `forge register` 전에는 배포 금지(Confluence 앱 덮어쓰기 위험). 커밋엔 Co-Authored-By 를 넣지 않는다(AGENTS.md). 관련: [[workforce-integration]]
