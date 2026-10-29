---
name: commit-message-no-review-source
description: "커밋 메시지에 '코덱스 검수 반영' 같은 출처·절차 표현을 쓰지 말고 작업 내용 요약만 쓴다(2026-10-08 사용자 지시)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 24a3df5c-fb39-49d1-8853-e53d97f143de
  modified: 2026-10-08T06:53:28.973Z
---

2026-10-08 사용자: "코덱스 검수 반영 이런거 쓰지말고 걍 작업 요약 쓰셈" — 검수 반영분 커밋 메시지를 `[FIX] GPU P1 코덱스 검수 반영 — …`로 제안했다가 받은 피드백.

**Why:** 커밋 로그는 "무엇이 바뀌었나"의 기록이지 "왜 그 작업이 생겼나(검수·요청자)"의 기록이 아니다. 출처는 `_workspace/reviews/` 요청서에 남는다.

**How to apply:** 메시지 제목·본문 모두 변경 내용만 요약(`#ZM-XX [TYPE] 제목 -날짜` 관례 유지). "검수 반영"·"코덱스"·"지적 사항" 같은 절차 단어 금지. 관련 [[commit-requires-approval]] [[no-coauthored-by-trailer]] [[codex-review-handoff]]
