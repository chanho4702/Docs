---
name: docs-not-committed
description: "문서(docs/ 폴더, 가이드·보고서)는 커밋하지 않는다 — 코드 커밋 때도 docs 경로는 빼고 스테이징"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-20T06:45:21.981Z
---

2026-10-20 사용자: "독스는 커밋하지마". 승인 앱 `docs/integration/`(webtrigger·apiRoute 보고 문서)와 워크포스 `docs/external-api/` 보강분을 커밋하지 않고 로컬에 둔다.

**Why:** 사용자가 문서를 직접 관리한다(승인 앱 `docs/worklog-approval/` 의 미커밋 변경도 사용자 것).
**How to apply:** 커밋 요청이 와도 `docs/` 아래는 경로 지정 스테이징에서 제외하고, 제외했다고 보고한다. 이미 커밋된 워크포스 `d841c06` 의 `docs/external-api/` 초판은 되돌리지 않는다(요청 없음). [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--workforce-untracked-files|workforce-untracked-files]]
