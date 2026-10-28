---
name: codex-review-handoff
description: "작업 단위가 끝나면 Codex 검수 요청서(_workspace/features/<영역>/<기능>/review_*.md)를 만들고 사용자에게 \"검수 넘길 것 있음\"을 보고한다(2026-08-20 지시)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46150c4e-20b0-4ee4-9aca-885ca60a7282
  modified: 2026-08-20T04:56:50.452Z
---

기능/작업 단위가 끝나면 **끝났다고만 보고하지 말고 Codex 검수 요청서를 만든다**. 규약 정본은 `C:\solutions\COLLAB.md` §8(검수 모드) — `STATUS: SOLO-CLAUDE`에서 구현은 Claude, 검수는 Codex다.

- 파일: `_workspace/features/<영역>/<기능>/review_{feature}.md`(2026-10-19 재편 전엔 `_workspace/reviews/`). 코덱스 원시 결과(`*_codex.md`)는 `_workspace/_archive/features/<영역>/<기능>/`. 항목 4개 — **범위**(변경 파일 목록) / **의도**(선택한 설계와 **버린 대안**) / **중점 확인 요청**(스스로 불안한 지점 — 여기를 비우면 검수가 값어치를 잃는다) / **검증 현황**(통과한 것과 **검증 못 한 것**을 나눠서).
- 다른 세션·에이전트가 만든 커밋이 같은 브랜치에 섞여 있으면 **검수 대상에서 제외한다고 명시**한다.
- 🔴 검수 트리거는 수동이다(사용자가 Codex 세션을 연다). 요청서를 만든 **즉시 사용자에게 보고**하고 쌓아두지 않는다.
- Codex는 같은 파일 `## 검수 결과`에 심각도(🔴/🟡/🟢)로 적는다. 반영하면 `[x]`로 닫고, 반영하지 않으면 **그 이유를 파일에 적는다**(계약서 요청과 같은 무게).
- 자기 코드를 자기가 검수해 통과시키지 않는다.

**Why:** 하루에 8개 단위가 들어가면 스스로 놓친 위험(메모리 병합 성능·오탐 판정·다중 호스트 케이스)을 자기 검토로는 못 잡는다. 사용자가 이 흐름을 명시적으로 요구했다.
**How to apply:** 커밋·푸시 보고와 같은 턴에 요청서 경로를 함께 알린다. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--ai-assistant-design|ai-assistant-design]]
