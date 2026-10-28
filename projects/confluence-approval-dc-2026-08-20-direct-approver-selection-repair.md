# Confluence Approval DC: 직접 승인자 검색 선택 복구 (2026-08-20)

- 기본 승인자 검색 결과의 `dmove-approval-select-user` click 분기가 누락돼 검색 결과를 선택해도 승인 순서에 추가되지 않았다.
- 선택 시 `addStep` 호출, 검색어·결과·pager 초기화를 복구했다.
- `node --check`를 통과했다.
