---
name: no-coauthor-trailer
description: 커밋 메시지에 Co-Authored-By 트레일러를 넣지 말 것
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e40b66a3-0adf-450d-b571-f9a983de14ca
  modified: 2026-08-19T06:04:53.824Z
---

이 사용자의 커밋 메시지에는 `Co-Authored-By: Claude ...` 트레일러를 넣지 않는다.
2026-08-19에 명시적으로 요청받았다.

**Why:** 고객 배포용 저장소(Bitbucket `DMOVE_GIT/confluence-approval-dc`)의 이력에
도구 흔적이 남는 것을 원하지 않는다.

**How to apply:** 기본 하네스 지침이 트레일러를 붙이라고 해도 이 사용자 지시가 우선한다.
이미 푸시된 과거 커밋의 트레일러 제거는 이력 재작성 + 강제 푸시가 필요하므로
사용자가 따로 요청할 때만 한다.

관련: [[projects/agent-documents/sources/claude-memory/C--Onpremise-confluence-approval-dc/memory/claude-memory--harness-approval-dev|harness-approval-dev]]
