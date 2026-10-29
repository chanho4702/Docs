---
name: notion-portfolio-page
description: "사용자 포트폴리오용 노션 MovesEye 페이지 위치와 작성 방법(MCP는 등록됐으나 세션 재시작 필요, 브라우저 붙여넣기 경로)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 16baed4f-a4b1-4c87-a72a-aa3954cd37cb
  modified: 2026-08-22T04:52:59.889Z
---

포트폴리오 노션 페이지: https://www.notion.so/MovesEye-3bda0d2516be803e8a04cb56f038baf8 (워크스페이스 "찬호 김의 Notion" > Dmove 제품 개발 > MovesEye, 공개 사이트 oxidized-tile-0f2.notion.site)

- 2026-08-22 원고 전문 작성 완료(`_workspace/notion_moveseye-portfolio.md` 정본, 섹션 1~7 + AI 집중 4장, 4.4 "AI 폭주·오용 방어"를 사용자 요청으로 강조).
- Notion 공식 MCP를 user 스코프로 등록함(`claude mcp add --transport http notion https://mcp.notion.com/mcp -s user`). 등록한 세션에서는 툴이 안 뜸 → 새 세션에서 `/mcp` OAuth 인증 후 사용.
- 🔴 `navigator.clipboard.writeText`는 Notion 탭에서 CDP 45초 타임아웃. 대신 `window.__md`에 텍스트 실은 뒤 빈 블록에 `DataTransfer`+`ClipboardEvent('paste')` 디스패치하면 Markdown(표·코드블록·인용 포함)이 블록으로 변환됨.

**How to apply:** 포트폴리오 갱신 요청 시 정본 md를 고치고 노션 MCP(가능하면) 또는 위 paste 경로로 반영. 기존 본문 중복 붙여넣기 주의.
