---
name: moveseye-faq-doc
description: 2026-09-01 MovesEye FAQ 정본 신설 위치·상태·잔여(사실 검증 전 review)
metadata: 
  node_type: memory
  type: project
  originSessionId: bfd23e90-cf67-40cb-bd11-f72fe8f57e44
  modified: 2026-09-01T04:34:32.413Z
---

2026-09-01 사용자 요청("우리 시스템 faq 뽑아줘")으로 **`moveseye-docs/guides/자주-묻는-질문.md`** 신설(13영역 90문항, `status: review`). 인벤토리 U6·README 허브 등록 완료. 공유용 아티팩트(검색 필터 포함)는 정본 마크다운을 그대로 임베드해 렌더 — 내용 수정은 정본에서 하고 재게시.

**Why:** 제품 소개서 §11에 9문항만 있었고 2026-08-11 이후 기능(홈 위젯·AI 어시스턴트·MCP·클라우드 재구축·알림 관리·구성 현황·커버리지·에이전트 설치 가이드·이벤트 통계·자산 대시보드)이 어느 문서에도 FAQ 형태로 없었다.

**How to apply:** 답변 상당수가 memory·설계서 기반이라 **런타임 실측 전** — 특히 §3 비밀번호 재설정 흐름·§8 클라우드 설정 메뉴 라벨·§9 AI 툴 수는 화면에서 재확인 후 `current`로 올린다. 새 기능이 끝나면 FAQ에 [제공]/[개발 중]/[예정] 표기도 같이 갱신. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--hyundai-capital-requirements|hyundai-capital-requirements]](LDAP/OTP 질문의 출처)
