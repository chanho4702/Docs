## 판정

**반려** — 1차 🔴1·2는 해소됐으나, R3의 64자 절단이 서로 다른 단위의 병합을 허용합니다.

파일 수정·테스트 실행 없이 정적으로 검수했습니다. 요청서의 테스트 통과·뮤테이션 결과는 재실행하지 않았습니다.

## 1차 🔴1·2 해소 확인

- **🔴1 해소.** 원장 삭제는 7일 무수신이면서 규칙 세대가 끝났거나 서비스가 없을 때만 수행합니다. 롤업 보존 기간·경계일·DROP 실패 여부로 현재 세대의 종류가 삭제되던 경로가 제거됐습니다. 2000일 경과 후에도 보존하고 규칙 삭제 후 정리하는 IT가 있습니다. 근거: [ApmRetentionService.java:94](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:94), [ApmCustomMetricIT.java:222](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:222).
- **🔴2 해소.** 종류·단위 제약과 자리 배정을 분리했고, `STORE`는 실제 자리가 있을 때만 반환합니다. 만료 GAUGE에 `[COUNTER, GAUGE]`가 오면 여유 시 GAUGE로 복구하고, 포화 시 종류 불일치는 거부·GAUGE는 접습니다. IT는 포화 상태의 순서 반전과 `last_seen_at` 불변도 검사합니다. 근거: [ApmCustomMetricGate.java:303](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:303), [ApmCustomMetricGate.java:626](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:626), [ApmCustomMetricIT.java:419](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:419).

## R3 확인

- **기본 경로는 분석 권고에 부합합니다.** 첫 단위를 고정하고 불일치는 저장·차분 처리 전에 `CUSTOM_UNIT_MISMATCH`로 거부하며, 토큰별·서비스별 사유를 기록합니다. NULL인 기존 원장은 같은 종류의 첫 단위를 채택합니다. 근거: [ApmCustomMetricGate.java:615](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:615), [MetricIngestor.java:609](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:609), [ApmCustomMetricIT.java:458](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:458).
- **V82·조회 연결은 타당합니다.** 별도 마이그레이션으로 nullable 컬럼을 추가하고, 조회는 만료 여부와 무관하게 현재 `rule_id`의 종류·단위를 사용합니다. 근거: [V82__apm_custom_metric_unit.sql:6](/C:/worktrees/zm-155-followup-be/src/main/resources/db/migration/V82__apm_custom_metric_unit.sql:6), [ApmCustomMetricSeriesService.java:105](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:105).
- **FE 표시도 타당합니다.** `ms`·`By`는 해당 포맷을 사용하고, `s` 등은 원래 수치와 카드 단위 태그로 표시합니다. 차트·표에 같은 단위 선택이 적용됩니다. 근거: [customMetricSeries.ts:66](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/customMetricSeries.ts:66), [ApmServiceCustomMetricsTab.tsx:159](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:159), [apmCustomMetricDisplay.test.ts:200](/C:/worktrees/zm-155-followup-fe/src/__tests__/apmCustomMetricDisplay.test.ts:200).

## 🔴 필수

1. **64자 절단으로 단위 불일치 검사를 우회할 수 있습니다.**

   `normalizeUnit`은 긴 단위를 앞 64자로 자릅니다. 후보의 고정 단위와 포인트별 비교 단위에 모두 이 함수를 적용하므로, **앞 64자가 같고 이후만 다른 두 단위는 동일하게 판정되어 함께 저장됩니다.** 리더는 단위 문자열을 그대로 전달합니다. 이는 “다른 단위는 거부”하는 R3 정책과 충돌합니다.

   **정적 재현 추론:** 같은 서비스·이름·GAUGE에 `P + "A"`와 `P + "B"`를 전송합니다(`P`는 동일한 64자 문자열). 두 단위 모두 `P`가 되어, 자리 여유가 있으면 둘 다 `STORE`되고 값이 합산됩니다.

   **수정 요구:** 길이 초과 단위를 자리 배정 전에 명시적으로 거부하거나, 전체 단위를 구별할 수 있게 보존·비교해야 합니다. 같은 64자 접두사를 가진 서로 다른 단위가 함께 저장되지 않는 회귀 검증도 필요합니다.

   근거: [OtlpMetricsReader.java:128](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/otel/metric/OtlpMetricsReader.java:128), [ApmCustomMetricGate.java:135](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:135), [MetricIngestor.java:393](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:393), [MetricIngestor.java:538](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:538).

## 🟡 권장

아래 항목은 승인을 막지 않습니다.

- **단위가 틀린 포인트만 와도 자리를 복구·유지합니다.** touch·복구 조건은 종류 일치만 확인하므로, 실제 저장은 계속 거부되는데 상한 자리는 유지될 수 있습니다. 단위까지 일치하는 포인트가 있을 때 갱신하는 방향을 권장합니다. 현재 IT도 이 복구 동작을 명시하고 있습니다. 근거: [ApmCustomMetricGate.java:619](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:619), [ApmCustomMetricGate.java:631](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:631), [ApmCustomMetricIT.java:468](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:468).
- **조회 불변성 IT의 검증 범위를 정확히 표시해야 합니다.** 설명은 “공백 전 롤업”이지만 실제로는 최근 1m 데이터와 `step=60`을 조회하고 원장의 시각만 변경합니다. 5m·1h 롤업 자체의 불변성까지 검증한 것은 아닙니다. 근거: [ApmCustomMetricIT.java:500](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:500), [ApmCustomMetricIT.java:514](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:514).
- **캐시 포화 경로의 회귀 검증을 추가하면 좋습니다.** 구현은 만료 원장의 제약을 적용하지만, 신규 포화 IT는 매번 새 Gate를 생성합니다. 같은 Gate의 따뜻한 캐시에서 종류·단위 불일치 사유까지 비교하면 보강됩니다. 근거: [ApmCustomMetricGate.java:467](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:467), [ApmCustomMetricIT.java:444](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:444).

## 🟢 확인된 것

- **R1은 유지됩니다.** 행 존재를 `observed`로 전달하므로 0·소수 카운터를 빈칸으로 지우지 않습니다. BE 병합 0.4 및 FE 0·0.2 표시 검증이 있습니다. 근거: [ApmCustomMetricSeriesService.java:147](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:147), [ApmCustomMetricSeriesServiceTest.java:153](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesServiceTest.java:153), [ApmServiceCustomMetricsTab.test.tsx:146](/C:/worktrees/zm-155-followup-fe/src/__tests__/ApmServiceCustomMetricsTab.test.tsx:146).
- **저장 허가와 세대 확인은 캐시에서도 원장을 거칩니다.** 공유 락에서 현재 세대를 확인하고, 자리 없는 만료 행은 제약으로만 전달합니다. 근거: [ApmCustomMetricGate.java:446](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:446).
- **배포·재등록 안내는 보완됐습니다.** BE/FE 동시 배포·브라우저 갱신, 재등록 시 옛 데이터 제외와 최대 1시간 공백을 명시합니다. 근거: [contract_apm-metric-allowlist.md:317](/C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md:317).
- **보존 DELETE 비용만으로 반려할 근거는 없습니다.** 만료 시각 인덱스와 규칙 이름 UNIQUE가 있습니다. 성능 판단은 실행계획·실측 없는 정적 추정입니다. 근거: [V81__apm_custom_metric_rule.sql:24](/C:/worktrees/zm-155-followup-be/src/main/resources/db/migration/V81__apm_custom_metric_rule.sql:24), [V81__apm_custom_metric_rule.sql:48](/C:/worktrees/zm-155-followup-be/src/main/resources/db/migration/V81__apm_custom_metric_rule.sql:48).