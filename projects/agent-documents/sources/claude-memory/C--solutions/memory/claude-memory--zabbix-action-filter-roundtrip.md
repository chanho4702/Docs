---
name: zabbix-action-filter-roundtrip
description: action.get 응답 filter를 그대로 update로 되돌리면 -32602(value2) · 규칙 조건 해제는 전역 승격 위험 — 2026-08-18 실서버로만 잡힌 결함 2건
metadata: 
  node_type: memory
  type: project
  originSessionId: 3562659e-89d6-4e69-8d26-295d509aeecb
  modified: 2026-08-18T23:49:59.701Z
---

2026-08-18 네트워크 디스커버리 규칙 폼 액션 탭(BE `d695167`·FE `8d53684`) 실서버 검증에서 잡힌 결함 2건.

1. **action.get → action.update round-trip 금지 필드**: `conditionid`·`actionid`·`value2`(태그값 조건 26 외)·`eval_formula`·`formulaid`(evaltype≠3). 그대로 보내면 `-32602 unexpected parameter "value2"`. → `zabbixadmin/ActionFilterNormalizer`가 벗긴다. 알림 관리 액션 생성/수정 경로도 같은 정규화를 거친다(FE 폼이 value2:"" 항상 실음).
2. **규칙 조건(18) 해제 = 전역 승격**: 18·19가 유일한 범위 조건인 액션에서 18을 빼면 "모든 규칙에 적용"이 된다(실측: 해제 후 `_linkage` GLOBAL). → BE `ACTION_UNLINK_MAKES_GLOBAL: 이름`으로 거부, FE는 "이 규칙 전용" 태그 + 삭제/비활성화 안내.

**Why:** 단위 테스트는 mock 응답이라 둘 다 통과했다. Zabbix가 돌려주는 원본에 붙는 읽기 전용 필드와 조건 제거의 의미 변화는 실서버 round-trip에서만 드러난다.

**How to apply:** Zabbix get 응답을 update에 되돌리는 코드를 짜면 반드시 실서버 round-trip 1회. 조건을 "빼는" 쓰기는 빠진 뒤 의미(범위 확대)까지 본다. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-wrapper-principle|zabbix-wrapper-principle]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--curl-hangul-cp949-false-500|curl-hangul-cp949-false-500]]
