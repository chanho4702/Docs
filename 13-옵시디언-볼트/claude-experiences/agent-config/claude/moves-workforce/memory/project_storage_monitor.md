---
name: project-storage-monitor
description: "DB 사용량 모니터링 기능 - 앱 정지(한도초과) 예방 목적, 현재 사용량+경고 우선 / 아카이빙 후속"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4f195624-1406-4ee2-9a31-d641e22aaea6
---

Forge SQL 저장 용량 **1 GiB/프로덕션 설치** 한도 초과로 앱이 멈출 위험을 예방하려는 기능 (2026-07-01 설계 착수). 데이터가 쌓이는 곳은 SQL(프로젝트/사용자/워크로그)이라 여기가 핵심 감시 대상. [[reference-forge-storage-limits]] 참조.

**1차 스코프 (지금 구현):** 현재 사용량 + 임계치 경고만.
- TiDB `information_schema.tables`에서 테이블별 `data_length + index_length` 합산 → 총합 vs 1 GiB %게이지
- 80%/90% 색상 경고
- 노출: 백오피스 신규 페이지 `/backoffice/storage` 유력
- 증가 추이/스냅샷 투영은 이번 범위에서 **제외** (사용자 결정)

**후속 작업 (나중에):** 종료된 프로젝트 데이터 아카이빙.
- 종료 프로젝트 정보 엑셀 추출 / 데이터 덤프 / 아카이빙 → SQL 용량 회수 목적
- 엑셀은 기존 `exceljs` 활용 가능

**Why:** 1 GiB는 누적형 한도라 언젠가 닿음 → 모니터링(예방)+아카이빙(회수) 두 축이 근본 대책.
**How to apply:** 이번엔 모니터 페이지만. 아카이빙 요청 오면 이 메모 기준으로 후속 설계.
