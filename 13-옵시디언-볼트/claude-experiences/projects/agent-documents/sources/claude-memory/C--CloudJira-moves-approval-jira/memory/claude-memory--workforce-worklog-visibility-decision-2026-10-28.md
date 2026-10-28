---
name: workforce-worklog-visibility-decision-2026-10-28
description: "2026-10-28 사용자 결정 — 워크포스는 승인 여부와 무관하게 연동 워크로그를 asApp 으로 읽고 자기 권한 모델로 보여 준다, 승인 앱은 상태 사실만 채널로 답한다"
metadata:
  node_type: memory
  type: project
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-28T04:41:11.935Z
---

2026-10-28 사용자 결정(워크포스 F1 재논의): "워크포스에서는 승인 여부와 관계없이 워크포스 권한으로 볼 수 있어야 한다. 앱 권한으로 보여 주면 된다."

- 워크포스: 연동 프로젝트 워크로그는 **항상 asApp 으로 읽고**(승인 앱이 visibility 로 숨긴 승인분 포함), 누구에게 보여 줄지는 **워크포스 자기 권한 모델**(RMS 역할·팀장·협업)이 정한다. 진척도 총계·누적선·구성원별·개인별 목록이 전부 같은 데이터여야 한다.
- 승인 앱: 채널 `cert.query` 는 워크로그 id 의 **승인 상태 사실**(숫자·id·상태, 설명 없음)만 답한다. 작성자 본인·팀장 범위 제한(불변식 8 예외 ①⑤⑥)은 **승인 앱 자기 화면에만** 남긴다. 워크로그 프로퍼티에 승인 표식을 쓰는 안은 거부(불변식 9·상태 변경 잦음·숨김을 못 품).
- 함께 처리: 워크포스 F2(협업 대시보드 개인 Jira 권한 재적용)·F3(내 작업에서 숨김만 있는 이슈 탈락) — 사용자 "2번은 응".

**Why:** 승인 앱이 승인분을 Jira visibility 로 숨기는 것은 수정 잠금이 목적이고 안 보이게 된 것은 부작용. 워크포스 사용자가 승인 때문에 실적을 못 보는 건 제품 의도가 아니다(2026-10-03 "워크포스 전부 표시, 원가·정산만 승인분만").
**How to apply:** 워크포스에서 asUser 워크로그 목록 뒤에 승인 복원을 덧대는 패턴(`applyWorklogApproval`·`withIssueApproval`)을 보면 asApp 읽기 + 워크포스 권한 필터로 바꾼다. 승인 앱 채널에 "actor 작성분만" 식 범위를 새로 넣지 않는다. 관련 [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--linked-mode-decisions-2026-10-14|linked-mode-decisions-2026-10-14]] [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--channel-decision-2026-10-19|channel-decision-2026-10-19]]
