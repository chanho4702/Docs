---
name: channel-decision-2026-10-19
description: "2026-10-19 사용자 결정 — 앱 간 통신은 웹트리거(Ed25519), 외부 API 노출은 apiRoute(3LO). 근거 문서 _workspace/app-channel/CHANNEL_DECISION.md"
metadata:
  node_type: memory
  type: project
  originSessionId: 2497a12f-a795-437e-b2a3-2d82191ba8cb
  modified: 2026-10-19T02:11:47.321Z
---

2026-10-19 사용자가 결정: 승인 앱↔워크포스 통신은 webtrigger + 기존 Ed25519 서명, SAP 등 외부 API 노출은 apiRoute + 3LO.
근거·감수 사항은 `_workspace/app-channel/CHANNEL_DECISION.md` (Q&A는 `WEBTRIGGER_APIROUTE_QNA.md`).

**Why:** 실측(spikes/app-channel/RESULTS.md) — webtrigger 는 사람 토큰 없이 0.2초, apiRoute 는 토큰 주인 1명 의존·1.8초. 외부 조회 API 는 apiRoute 만 노출 앱의 Runs on Atlassian 유지.
**How to apply:** 앱 간 webtrigger 를 부르는 앱은 egress 선언으로 Runs on Atlassian 실격(조회 응답이면 받는 앱도 dynamic 으로 실격) — 사용자에게 설명함. CLAUDE.md 확정 결정표 "워크포스 연동 = 엔티티 프로퍼티" 는 아직 갱신 안 됨. [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--app-channel-spike-2026-10-19|app-channel-spike-2026-10-19]] [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--linked-mode-decisions-2026-10-14|linked-mode-decisions-2026-10-14]]
