---
name: zabbix-graph-mgmt
description: Zabbix 일반 그래프 관리(호스트·템플릿 상세 > 그래프 탭) — 2026-10-26 구현·코덱스 2차 승인·master 병합·dev Zabbix 실측 통과
metadata:
  type: project
---

2026-10-26 구현. BE 워크트리 `C:\worktrees\zbx-graph-be`(브랜치 `zabbix-graph-mgmt`), FE `C:\worktrees\zbx-graph-fe`(같은 이름, node_modules 정션 — 제거 전 rmdir). 계약 `_workspace/features/zabbix-config/graph-mgmt/contract_graph.md`. AI 화면 카탈로그(screens.json 호스트 상세 summary·keywords)도 moveseye-ai main에서 미커밋 수정.

- EP `/zabbix-manage/graphs` 목록(hostid|templateid 필수, limit ≤500)·상세·생성·수정(부분)·삭제(전부 아니면 거부). 엔진 계약 `zabbix/graph/ZabbixGraphService` + `ZabbixMethod.GRAPH_CREATE/UPDATE/DELETE`(조사표 api-reference-7.0.json에 원문 확인 후 추가 — 🔴새 Zabbix 메서드는 조사표에도 넣어야 ZabbixMethodTest 통과).
- 🔴 상속(templateid≠0)·발견(flags=4)은 쓰기 거부. 항목은 소속 호스트·템플릿의 숫자형만, 유형별 calc_fnc(normal 1·2·4·7/stacked 1·2·4/pie 1·2·4·9), 합계 항목 type 2는 원형만.
- 🔴 FE 수정 폼은 `detail.graphid === 행 graphid && editable`일 때만 저장(코덱스 1차 반려 — 다른 그래프 상세로 덮어쓰기 경로).
- 공통 DmoveTable 보기 옵션이 500까지 고정이라 목록 상한을 그보다 작게 두면 중간 행이 빠진다(트리거 목록 200 상한도 같은 잠재 결함 — 미조치).
- 오류는 ApiError("CODE: detail") → envelope errorCode=CODE·message=detail. FE `graphErrorMessage`가 errorCode로 번역.
- 2026-10-26 커밋·master 병합(BE 5a4df4a·FE 8c21d13·AI 461a9b4) + dev Zabbix 실측 통과(계약 §8). 남은 것: 트리거 목록 200 상한의 500개 보기 누락(같은 잠재 결함, 미조치).

**Why:** 사용자 "현대캐피탈은 나중에, 1번(C2) 2번(그래프)이나 하자"(2026-10-26).
**How to apply:** 재개 시 위 두 워크트리에서 이어 가고, 실측은 재기동 승인 받은 뒤. 관련 [[zabbix-wrapper-gaps]].
