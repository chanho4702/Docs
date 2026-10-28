# 코덱스 검수 결과 — APM P2 QA 결함 수정분 (2026-09-02, BE a0f13d5..36f3413 · FE f4a50a4..1aceeff)

- 검수 결과: 반드시 수정 2건(기존 P1 Live 회귀 1, 오류 건수 라벨 불일치 1)입니다.
- semconv 별칭의 SQL 정책 우회, SSE 403 직접 응답, 토큰 scope 조합은 기준 diff에서 차단·검증되어 있습니다.
- 테스트는 실행하지 않았으며, diff와 HEAD 커밋 내용만 검토했습니다.

| # | 심각도 | 레포/파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| 1 | 높음 | BE `MetricIngestor.java:391-393`, `LiveBuffer.java:449-450,555-557` | CUMULATIVE 히스토그램의 `min/max=null` 전환이 P1 Live의 지연 Top을 빈 값으로 만들고, Live p95의 실측 범위 클램프도 끕니다. | `valuesOf()`가 CUMULATIVE의 극값을 의도적으로 제거한 뒤 그대로 `LivePoint.duration()`에 전달합니다. `RouteAgg.maxSeconds`는 null을 무시하므로 Live Top의 `maxMs`가 전부 null이 됩니다. 문서도 이 회귀를 “조용히 비는” 상태로 인정합니다. `MetricIngestorTest`는 null 적재만 검증하며 Live 경로 회귀는 잡지 못합니다. | 저장 롤업용 극값과 Live용 값을 분리하십시오. Live에는 해당 export의 관측 범위 또는 exemplar 값 기반 Top 값을 별도로 전달하고, CUMULATIVE 입력에서 Live Top·p95 표시가 유지되는 회귀 테스트를 추가하십시오. |
| 2 | 중간 | BE `ApmErrorQueryService.java:132-166`, FE `ApmErrorGroupTable.tsx:87-94` | `count`는 요청 창이 아니라 창을 덮는 1시간 버킷 전체 합인데, FE 열 제목은 “발생(선택 기간)”으로 정확한 기간 건수처럼 표시합니다. | 정시 내림으로 D1의 빈 결과는 해소됐지만, 예를 들어 15분 창도 1시간치 `window_count`를 표시합니다. BE IT가 이 동작 자체는 고정했지만, FE에는 근사·버킷 단위임을 알리는 라벨/테스트가 없습니다. 배포 `new-errors`도 같은 표를 재사용하므로 동일합니다. | 열 제목 또는 툴팁을 “선택 기간과 겹치는 1시간 버킷 합(근사)”로 바꾸고, 15분 창에서 1시간 버킷 count가 표시될 때 안내가 남는 FE 테스트를 추가하십시오. |

## 다음 커밋 전 반드시 고칠 것

1. CUMULATIVE 수신에서도 P1 Live Top과 p95가 의미 있는 값을 유지하도록 Live 전용 값 경로와 회귀 테스트를 추가할 것.
2. 오류 `count`의 1시간 버킷 확대 의미를 FE 라벨/툴팁에 명시할 것.
