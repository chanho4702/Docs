---
name: no-coauthored-by-trailer
description: 커밋 메시지에 Co-Authored-By 줄을 넣지 말 것
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8947039b-ce0a-4326-b975-0e4df03c9618
---

커밋을 만들 때 `Co-Authored-By: Claude ...` trailer를 **넣지 않는다**.

**Why:** 사용자가 명시적으로 빼라고 요청. 이전에 trailer가 들어간 2개 커밋을 메시지 재작성 + force-push로 제거한 적 있음.

**How to apply:** `git commit` 시 본문만 작성하고 Co-Authored-By 줄은 생략. 하네스 기본 가이드가 trailer를 붙이라고 해도 이 사용자 지시가 우선.
