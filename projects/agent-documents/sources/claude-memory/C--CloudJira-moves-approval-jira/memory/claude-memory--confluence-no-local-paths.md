---
name: confluence-no-local-paths
description: "고객용 Confluence 문서에 리포 경로(examples/, docs/, C:\\…)를 쓰지 않는다 — 첨부 파일·페이지 내 절로 가리킨다"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 70b22771-2334-438a-954a-64f4fd507537
  modified: 2026-10-21T06:44:35.805Z
---

고객이 읽는 Confluence 페이지에는 `examples/workforce-client.mjs`, `docs/…`, `C:\work\…` 같은 로컬·리포 경로를 넣지 않는다. 파일은 "이 페이지 첨부 파일 `workforce-client.mjs`", 위치는 "5-6" 같은 절 번호로 가리킨다.

**Why:** 2026-10-21 사용자 — "examples 이런거 써 넣으면 내 로컬 같잖아 이런거는 빼줘야지". README(리포)를 Confluence로 옮길 때 상대 경로가 그대로 남았다.
**How to apply:** 로컬 README → Confluence 반영 시 CDATA 밖의 `examples/`·`docs/`·드라이브 경로를 검색해 바꾼다. 예시 출력의 경로도 `.\wf-token.json`처럼 상대·일반 값으로. 로컬 README 안의 `examples/` 링크는 리포용이라 유지. [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--docs-not-committed|docs-not-committed]]
