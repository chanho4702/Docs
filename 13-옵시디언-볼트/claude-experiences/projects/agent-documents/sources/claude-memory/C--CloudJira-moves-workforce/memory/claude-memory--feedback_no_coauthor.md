---
name: feedback-no-coauthor
description: 커밋 메시지에 Co-Authored-By Claude 트레일러를 넣지 말 것 (사용자 명시 지시)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 809a0648-4fb8-4566-b144-71d8628be551
---

커밋 메시지에 `Co-Authored-By: Claude ...` 트레일러를 **넣지 않는다** (사용자 지시 2026-07-02 — "이거 지우셈").

**Why:** 사용자가 커밋 이력에 Claude 서명이 남는 것을 원치 않음.
**How to apply:** 이 저장소에서 커밋을 만들거나 커밋 메시지를 추천할 때 Co-Authored-By 트레일러를 항상 생략. 커밋 컨벤션은 `#RFC-NNN [TYPE] 제목- 날짜` 유지.
