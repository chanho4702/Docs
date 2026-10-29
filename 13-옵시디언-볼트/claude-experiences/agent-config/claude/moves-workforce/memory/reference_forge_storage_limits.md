---
name: reference-forge-storage-limits
description: "Forge SQL/KVS 저장소 한도 수치 (공식문서 확인, 2026-07-01)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 4f195624-1406-4ee2-9a31-d641e22aaea6
---

Forge 저장소 한도 (2026-07-01 developer.atlassian.com 확인). 앱 정지 위험은 **SQL 용량 1 GiB**가 사실상 유일.

**Forge SQL** (developer.atlassian.com/platform/forge/limits-sql/)
- 저장 용량: **프로덕션 1 GiB / 스테이징 256 MiB / 개발 128 MiB** (설치별 독립) ← 누적형, 앱 정지 위험 핵심
- 테이블 200개/설치, 행 크기 6 MiB, 요청 1 MiB, 응답 4 MiB, 쿼리 메모리 16 MiB
- 처리율: DML 150/s, DDL 25/분, 쿼리 총 실행 62.5초/분 (초과 시 일시 지연, 영구정지 아님)
- 타임아웃: SELECT 5s / DML 10s / DDL 20s per connection

**Forge KVS / Custom Entity Store** (developer.atlassian.com/platform/forge/limits-kvs-ce/)
- 용량 누적형 아님. 키 500자, 값 240 KiB/개, depth 31, 트랜잭션 25작업/4MB
- 처리율 읽기·쓰기 각 4,000/분, 1,000 RPS, 키당 읽기 12MB/s·쓰기 1MB/s
- Custom Entity: 앱당 엔티티 20종, 엔티티당 인덱스 7·속성 50
- 소비기반 과금 전환으로 총량 쿼터는 사실상 폐지, 무료허용량 초과분 과금

**How to apply:** 사용량 모니터는 SQL 1 GiB 게이지가 중심. KVS는 용량게이지 아니라 항목크기/개수 점검. [[project-storage-monitor]]
