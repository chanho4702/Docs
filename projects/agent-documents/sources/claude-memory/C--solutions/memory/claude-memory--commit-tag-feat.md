---
name: commit-tag-feat
description: "커밋 메시지 유형 태그는 [FEAT](FEATURE 아님). 형식 \"#ZM-nnn [FEAT|FIX|...] 요약 -YYYY-MM-DD\". 2026-10-22 사용자 지시"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e8262c9a-a487-4b75-a63a-a360ce88b0a9
  modified: 2026-10-22T06:43:55.986Z
---

커밋 메시지의 유형 태그는 `[FEAT]`으로 쓴다 — `[FEATURE]`가 아니다. 2026-10-22 ZM-172 첫 커밋을 `[FEATURE]`로 올렸다가 사용자가 "FEATURE 걍 FEAT으로 하자"고 해서 amend했다. 전체 형식은 저장소 관례대로 `#ZM-nnn [FEAT] 한 줄 요약 -YYYY-MM-DD` + 본문 불릿.

**Why:** 저장소 이력에 `[FIX]`·`[FEATURE]`가 섞여 있었고 사용자가 짧은 쪽으로 통일하기로 했다.

**How to apply:** 새 기능 커밋은 `[FEAT]`, 수정은 `[FIX]`. 기존 `[FEATURE]` 커밋은 고치지 않는다(푸시된 이력). 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-message-no-review-source|commit-message-no-review-source]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--no-coauthored-by-trailer|no-coauthored-by-trailer]]
