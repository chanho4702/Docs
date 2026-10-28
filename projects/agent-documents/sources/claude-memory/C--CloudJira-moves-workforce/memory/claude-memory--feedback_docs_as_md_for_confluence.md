---
name: feedback-docs-as-md-for-confluence
description: 문서 작성 요청은 Claude Docs·Artifact가 아니라 Confluence에 붙일 md 파일로 준다
metadata:
  node_type: memory
  type: feedback
  originSessionId: 165cdae3-b140-4f5d-9bce-e0841603a973
  modified: 2026-09-30T05:58:07.503Z
---

문서(기능문서 등) 작성 요청에 Claude Docs 문서를 만들었더니 사용자가 "아냐 컨플에 쓸거야 md파일로 줘"라고 정정했다 (2026-09-30, 기능문서 PMS/RMS 작성 중).

**Why:** 사용자는 문서를 Confluence에 올려 쓴다. 온라인 문서·Artifact는 옮겨 붙이기 불편하다.

**How to apply:** (내 해석) 이 프로젝트에서 "문서 작성해줘" 류 요청은 기본적으로 리포지토리 루트의 `Moves_Workforce_*.md` 형식 md 파일로 만든다. Confluence 붙여넣기에 맞게 제목·표·목록 위주의 단순 마크다운을 쓰고 HTML은 피한다. 다른 형식을 명시하면 그쪽을 따른다. 고객에게 보일 수 있으므로 [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--feedback_no_internal_jargon|feedback_no_internal_jargon]] 도 함께 적용.
