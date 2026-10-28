## 판정

**반려** — 2차 🔴1은 해소됐으나, 혼합 단위 배치에서 정상 포인트까지 계속 접히는 신규 회귀가 있습니다.

파일 수정·테스트 실행 없이 정적으로 검수했습니다. 아래 재현은 코드 경로에 따른 추론입니다.

## 2차 🔴1 해소 확인

**해소됐습니다.** `normalizeUnit`은 절단하지 않고, 64자 초과 단위는 자리 후보에서 제외한 뒤 `UNIT_MISMATCH`로 거부합니다. 동일한 64자 접두사를 가진 두 초과 단위의 거부·자리 미배정과 정확히 64자인 단위의 허용을 검사하는 IT도 있습니다.

근거: [ApmCustomMetricGate.java:139](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:139), [MetricIngestor.java:390](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:390), [ApmCustomMetricIT.java:488](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:488).

## 🔴 필수

1. **첫 단위만으로 호환성을 판단해, 뒤에 있는 정상 포인트의 자리 복구까지 막습니다.**

   후보는 종류별 **첫 단위만** 보존하고, 새 `compatible`도 그 단위만 비교합니다. 따라서 같은 세대의 `GAUGE/ms` 자리가 만료된 뒤, **자리 여유가 있는데도** `[GAUGE/s, GAUGE/ms]`가 오면 결과는 `[UNIT_MISMATCH, FOLD]`입니다. 정상 `ms`가 배치에 있어도 자리는 복구되지 않고 `__other__`로만 저장됩니다.

   **정적 재현 추론:** 이 순서가 반복되면 매번 복구가 차단됩니다. 활성 자리에서도 같은 이유로 touch하지 않으므로, 정상 `ms` 수신이 계속되는데도 마지막 갱신 7일 뒤 이 상태에 들어갈 수 있습니다.

   근거: [MetricIngestor.java:395](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:395), [ApmCustomMetricGate.java:155](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:155), [ApmCustomMetricGate.java:645](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:645), [ApmCustomMetricGate.java:652](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:652), [ApmCustomMetricGate.java:337](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:337).

   **수정 요구:** 새 자리의 첫 단위 선택과 기존 자리의 호환성 판단을 분리해야 합니다. 기존 자리의 touch·복구는 배치에 고정 종류·단위와 일치하는 포인트가 **하나라도 있는지**로 판단해야 합니다. `[s, ms]`·`[ms, s]`의 순서 반전, 활성 자리 touch와 만료 자리 복구를 검증해야 합니다.

## 🟡 권장

승인을 막지 않는 항목입니다.

- **따뜻한 캐시의 포화 경로 IT는 여전히 미추가입니다.** 구현은 만료 행의 종류·단위 제약을 전달하지만, 기존 포화 IT는 새 Gate로 검사합니다. 같은 Gate를 재사용해 불일치 사유와 `last_seen_at` 불변을 확인하면 좋습니다. 근거: [ApmCustomMetricGate.java:490](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:490), [ApmCustomMetricIT.java:444](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:444).

## 🟢 확인된 것

- **2차 🟡의 ‘잘못된 단위만 수신해도 자리 유지’는 반영됐습니다.** 잘못된 단위만 오면 시각을 유지하고, 맞는 단위가 오면 복구하는 IT가 있습니다. 다만 혼합 배치에는 위 신규 결함이 있습니다. 근거: [ApmCustomMetricIT.java:468](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:468).
- **조회 불변성 IT 설명은 실제 범위로 정정됐습니다.** 1분 해상도·원장 시각 이동임을 명시하며, 5m·1h 롤업 자체 검증을 주장하지 않습니다. 근거: [ApmCustomMetricIT.java:531](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:531).
- **R1의 0·소수 표시 수정은 유지됩니다.** 행 존재를 `observed`로 전달하고 FE도 이를 우선합니다. 근거: [ApmCustomMetricSeriesService.java:147](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:147), [customMetricSeries.ts:32](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/customMetricSeries.ts:32).
- **1차 필수 결함의 회귀는 발견하지 못했습니다.** 현재 세대 원장은 기간만으로 삭제하지 않고, 제약만 있는 이름에 `STORE` 권한을 주지 않습니다. 조회도 현재 세대의 종류·단위를 사용합니다. 근거: [ApmRetentionService.java:94](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:94), [ApmCustomMetricGate.java:337](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:337), [ApmCustomMetricSeriesService.java:105](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:105).
- **FE 단위 표시는 유지됩니다.** 차트·표에 같은 포맷 선택을 적용하고 카드에 단위를 표시합니다. 근거: [ApmServiceCustomMetricsTab.tsx:167](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:167), [ApmServiceCustomMetricsTab.tsx:181](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:181), [ApmServiceCustomMetricsTab.tsx:212](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:212).