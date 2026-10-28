---
tags: [moveseye, apm, rollup, archive, testing]
updated: 2026-10-06
---

# APM 우선순위 5~8 구현 교훈

선행 평가와 누적 CUMULATIVE 변경은 [[projects/moveseye/2026-10-06-apm-hardening-scale|2026-10-06-apm-hardening-scale]] 및 [[projects/moveseye/2026-10-06-apm-overall-review|2026-10-06-apm-overall-review]] 참고. 이번 소스 변경·통합 검증은 `C:/solutions/moveseye-docs/overview/apm-priority-fixes.md`가 정본이다.

## 결과

- #5 durable dirty queue·generation ACK·5m→1h 전파·retention guard. stage5 별도 PostgreSQL 회귀 148개 통과. 다만 SLO/burn/availability/exports의 marker completeness 판정은 아직 미연결이라 거짓 `OK`/`DATA` 가능성이 남는다.
- #6 trace reclassification 시 과거 집계 삭제 후 재생성. RR snapshot과 source lock을 포함하고 PostgreSQL 회귀 39개 통과.
- #7 RUM 시간 제한·과거 span partition 재생성 차단. parser/store/MVC/PG 53개 통과. 서버 trace timestamp guard는 미완료.
- #8 archive 파일 hash 불일치·부재를 `CORRUPT`로 격리하고 source DROP hold와 연결. BE 55개, FE Jest 84개 및 tsc 통과. Browser E2E와 source freshness는 별도다.
- 현 BE tree 통합 선별 실행 188개/14개 class, 실패·오류·skip 0. 서로 다른 시점의 개별 실행 수를 합산하지 않는다.

## 재사용할 교훈

1. Rollup watermark는 첫 순회 frontier이지 completeness 증명이 아니다. Dirty/blocked/legacy 상태를 SLO와 export 소비자가 확인하기 전에는 stage5를 end-to-end 완료로 부르면 안 된다.
2. Retired partition 방어는 DROP 이후 재생성을 막는 tombstone을 남긴다. 통합 테스트가 같은 오래된 날짜를 재사용하면 실제 보호 규칙과 충돌한다. fixture마다 `retired_before` 이후이면서 retention 대상인 새 날짜를 사용하고, 전역 tombstone을 테스트 편의로 지우지 않는다.
3. Archive 상태 검증은 hash 읽기만으로 끝나지 않는다. 파일 검사 결과의 DB commit 성공을 확인하고, CAS fingerprint로 검사 도중 바뀐 파일을 낡은 증거가 격리하지 않게 하며, 원본 DROP hold까지 실제 PG에서 확인한다.
4. 테스트는 저장소별 순차 실행. root가 실제 DB를 쓰는 동안 하위 실행자가 Gradle을 병행하지 않게 한다.
5. APM feature regression 통과는 목표 처리량·HA·장애 복구·browser E2E의 증거가 아니다.

BE commit `2f84b554`, FE commit `b8081cc`, 문서 commit `3f2a1de`. 공유 서버 재기동·배포·push는 없음. #5 consumer completeness, #7 trace guard, #9 이후 과제는 열린 상태다.

## 2026-10-06 — rollup completeness consumer enforcement

- Stage5 재집계가 끝나도 소비 경로가 watermark만 신뢰하면 거짓 OK/DATA를 낼 수 있다. coverage 판정은 SLO, cache, export 같은 각 소비자가 같은 DB snapshot 안에서 수행해야 한다.
- Endpoint export는 시간 버킷별 데이터가 아니라 요청 범위 전체 aggregation이다. dirty issue와 요청 구간이 겹치면 issue 이후만 자르는 방식은 불가능하므로 aggregate 전체 수치를 마스킹해야 한다.
- 검증에서 `ApmEndpointExporterTest`가 incompleteFrom을 기대 issue 시각으로 오판했다. watermark 미설정이면 계획 시작부터 incomplete인 기존 정책을 먼저 반영해야 한다. 테스트는 계약을 강화하되 기존 coverage semantics를 정확히 따를 것.
- BE commit: `c05bd85`; docs commit: `b318614`. 선택 회귀군 111 tests 통과. 대규모 부하와 다중 BE HA는 별도 검증 대상.
