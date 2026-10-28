## 판정

**승인** — 3차 🔴1과 🟡 권고가 반영됐으며, 검토 범위에서 이전 수정의 회귀나 새로운 승인 차단 결함은 발견하지 못했습니다.

파일 수정·테스트 실행 없이 정적으로 검수했습니다. 테스트는 코드와 검증 조건만 확인했으며, 요청서의 통과·뮤테이션 결과는 재검증하지 않았습니다.

## 3차 🔴1 해소 확인

**해소됐습니다.** `SeriesWant.see()`가 종류별 모든 단위를 보존하고, `compatible()`은 고정 종류·단위와 일치하는 포인트가 하나라도 있는지 판단합니다. 새 자리의 첫 단위 선택은 별도로 유지됩니다. 이 판단이 활성 자리 touch와 만료 자리 복구에 모두 적용됩니다.

근거: [MetricIngestor.java:392](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:392), [ApmCustomMetricGate.java:144](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:144), [ApmCustomMetricGate.java:188](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:188), [ApmCustomMetricGate.java:677](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:677).

추가 IT는 `[s, ms]`·`[ms, s]` 양쪽에서 만료 자리 복구, 정상 `ms`의 `STORE`, 활성 자리 갱신과 고정 단위 유지를 검사합니다. 따라서 기존 실패 경로는 구현상 제거됐다고 판단합니다.

근거: [ApmCustomMetricIT.java:514](C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:514).

## 🔴 필수

없음.

## 🟡 권장

- **실제 5m·1h 롤업의 조회 불변성 검증은 후속 보강을 권장합니다.** 현재 IT는 설명대로 1m 데이터와 원장 시각 이동을 사용합니다. 검증 범위를 과장하지 않으며, 이번 승인을 막지는 않습니다. 근거: [ApmCustomMetricIT.java:588](C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:588).

## 🟢 확인된 것

- **3차 🟡 반영:** 같은 Gate의 포화 캐시를 재사용하는 IT가 추가됐습니다. 두 차례 반복해 `KIND_UNSUPPORTED`·`UNIT_MISMATCH`·`FOLD`와 `last_seen_at` 불변을 검사합니다. 캐시 경로도 만료 원장의 제약을 전달합니다. 근거: [ApmCustomMetricIT.java:548](C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:548), [ApmCustomMetricGate.java:522](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:522).
- **1차 필수 수정 유지:** 현재 규칙 세대의 원장은 기간만으로 삭제하지 않습니다. 종류·단위 제약과 자리 배정도 분리돼, 제약만으로 `STORE`가 되지 않습니다. 근거: [ApmRetentionService.java:94](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:94), [ApmCustomMetricGate.java:358](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:358).
- **2차 필수 수정 유지:** 단위를 절단하지 않고, 64자 초과 입력은 자리 후보에서 제외한 뒤 거부합니다. 근거: [ApmCustomMetricGate.java:173](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:173), [MetricIngestor.java:388](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:388).
- **R1 표시 수정 유지:** 행 존재를 `observed`로 전달하고 FE가 이를 우선해 0·소수 카운터를 보존합니다. 근거: [ApmCustomMetricSeriesService.java:143](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:143), [customMetricSeries.ts:32](C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/customMetricSeries.ts:32).
- **단위·조회·계약 연결 유지:** 조회는 만료 여부와 무관하게 현재 세대의 종류·단위를 사용합니다. FE는 차트·표에 같은 단위 포맷을 적용하며, 계약 v1.4에 재등록 영향과 동시 배포 안내가 있습니다. 근거: [ApmCustomMetricSeriesService.java:105](C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:105), [ApmServiceCustomMetricsTab.tsx:167](C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:167), [ApmServiceCustomMetricsTab.tsx:181](C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:181), [contract_apm-metric-allowlist.md:313](C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md:313).