---
name: no-coauthored-by-trailer
description: "커밋 메시지에 Co-Authored-By: Claude 트레일러 넣지 말 것 (2026-07-18 사용자 지시)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 71d96fe6-aa9c-4794-bfb3-832a899baf50
---

moveseye 레포(BE/FE) 커밋 메시지에 `Co-Authored-By: Claude ...` 트레일러를 넣지 않는다. 2026-07-18 사용자가 기존 커밋에서 제거를 지시했고, 그 전에 사용자가 직접 amend로 지운 커밋도 있었다(확립된 선호).

**Why:** 사용자가 커밋 이력을 `#ZM-xx [태그] 요약 -날짜` 형식으로 깔끔하게 유지하며, 도구 서명을 원치 않음.

**How to apply:** 이 프로젝트에서 커밋 생성 시(서브에이전트 지시 포함) 트레일러 없이 커밋한다. 에이전트 프롬프트에 커밋 지시를 쓸 때 "Co-Authored-By 트레일러 제외"를 명시.
