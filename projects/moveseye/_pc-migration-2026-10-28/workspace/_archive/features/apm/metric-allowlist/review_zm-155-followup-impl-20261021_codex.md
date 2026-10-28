## 판정

**반려** — R1의 표시 수정은 타당하지만, R2에 종류 원장 조기 삭제와 배치 내 저장 권한 오판정이 남아 있습니다.

파일 수정·테스트 실행 없이 검수했습니다. 아래 재현 결과는 **코드 경로에 따른 정적 추론**이며, 요청서의 테스트 통과·뮤테이션 결과는 재실행하지 않았습니다.

## R1·R2 해소 확인

- **R1: 구현상 해소.** 저장 행이 있으면 `count=0`이어도 `observed=true`이고, FE는 이를 기준으로 `sum=0`·소수를 보존합니다. BE 테스트는 0·0.2·동일 버킷 병합 0.4를, FE 테스트는 0·0.2·0.4·1·빈칸을 검사합니다. 근거: [ApmCustomMetricSeriesService.java:140](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:140), [customMetricSeries.ts:32](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/customMetricSeries.ts:32), [BE 테스트:153](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesServiceTest.java:153), [FE 테스트:178](/C:/worktrees/zm-155-followup-fe/src/__tests__/apmCustomMetricDisplay.test.ts:178).
- **R2: 부분 해소.** 같은 `rule_id`의 만료 종류를 읽고, 다른 종류를 거부하며, 조회도 만료 여부와 무관하게 현재 세대 종류를 사용하는 방향은 맞습니다. 다만 아래 필수 결함 때문에 완전 해소로 판단할 수 없습니다. 기존 IT도 자리·판정만 검사하며, **공백 전 롤업의 조회 결과가 불변인지**까지 검증하지 않습니다. 근거: [ApmCustomMetricGate.java:402](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:402), [ApmCustomMetricSeriesService.java:104](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:104), [ApmCustomMetricIT.java:225](/C:/worktrees/zm-155-followup-be/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmCustomMetricIT.java:225).

## 🔴 필수

1. **종류 원장 삭제 조건이 실제 데이터 소멸을 보장하지 않습니다.**

   원장은 `last_seen_at < now-dataDays`면 삭제하지만, 파티션은 **날짜 단위로 경계일을 남깁니다**. 기본 400일에서도 경계일 00시대의 마지막 수신은 01:30 정리 때 원장만 삭제되고, 해당 일자의 롤업은 남을 수 있습니다. DROP 실패나 아카이브·롤업 게이트의 보류 때는 불일치가 더 길어집니다. 또한 잡은 `rollup1hDays`만 전달하므로, 다른 해상도의 보존 기간이 더 긴 설정도 보호하지 못합니다. 근거: [ApmRetentionService.java:93](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:93), [ApmPartitionService.java:270](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/partition/ApmPartitionService.java:270), [ApmPartitionService.java:324](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/partition/ApmPartitionService.java:324), [ApmRetentionJob.java:154](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionJob.java:154).

   이후 다른 종류가 자리를 받으면, 조회는 남은 과거 행에도 새 `valueKind`를 적용합니다. 조회 SQL에는 `oldestAvailableMs` 기준 차단이 없어 **R2가 재발합니다**. 근거: [ApmCustomMetricSeriesService.java:75](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:75), [ApmMetricStore.java:447](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricStore.java:447).

   **수정 요구:** 현재 세대 종류는 해당 데이터가 실제로 조회 불가능해질 때까지 유지해야 합니다. 경계일·DROP 실패/보류·보존 기간 역전 조건에서, 정리 및 다른 종류 수신 전후의 과거 조회 결과를 검증해야 합니다.

2. **거부용 `lockedKind`가 같은 배치의 다른 포인트에는 저장 권한으로 사용됩니다.**

   후보 종류는 서비스×이름별 **첫 포인트**로 정합니다. 만료 GAUGE에 첫 COUNTER가 오면 새 분기는 자리 배정 없이 `Admissions`에 GAUGE를 넣습니다. 같은 배치에 뒤따르는 GAUGE는 `seatKind != null` 조건을 만족해 `STORE`가 됩니다. 근거: [MetricIngestor.java:389](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:389), [ApmCustomMetricGate.java:497](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:497), [ApmCustomMetricGate.java:226](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:226).

   따라서 **다른 50석이 찬 상태에서도 원래 이름으로 저장**할 수 있고, 그 자리의 `last_seen_at`도 갱신되지 않습니다. 종류 제약과 자리 배정 여부를 별도로 표현해야 합니다. 만료 GAUGE에 `[COUNTER, GAUGE]`가 들어오는 배치를 상한 여유/포화 및 순서 반전 조건으로 검증해야 합니다.

## 🟡 권장

아래 항목은 **승인을 막지 않습니다**.

- **혼합 버전은 동작 호환이며, R1 수정 효과까지 보장하지는 않습니다.** 새 FE+옛 BE는 `count > 0` 폴백 때문에 기존 0·소수 누락이 유지됩니다. 옛 FE도 새 `observed`를 사용하지 않습니다. BE/FE 배포와 기존 브라우저 갱신을 함께 안내하는 편이 좋습니다. 근거: [customMetricSeries.ts:33](/C:/worktrees/zm-155-followup-fe/src/pages/application-monitoring/services/customMetricSeries.ts:33).
- **캐시 포화 경로의 폐기 사유가 다릅니다.** `verifyCached`는 만료 행의 `lockedKind`를 사용하지 않아, 배타 경로에서는 `KIND_UNSUPPORTED`일 입력이 캐시 경로에서는 `FOLD`가 됩니다. 이름별 과거 시계열은 보호되지만, 손실·접힘 통계와 경고는 캐시 상태에 따라 달라집니다. 근거: [ApmCustomMetricGate.java:352](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:352), [MetricIngestor.java:604](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:604).
- **계약 문서를 동기화해야 합니다.** §4에는 `observed`가 없고, §9는 여전히 만료 종류를 조회에 사용하지 않는다고 설명합니다. 근거: [contract_apm-metric-allowlist.md:224](/C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md:224), [contract_apm-metric-allowlist.md:302](/C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md:302).
- **MIXED의 `count` 유지 자체는 이번 범위에서 수용 가능합니다.** 다만 GAUGE 관측 수와 COUNTER의 반올림 증가량이 합쳐지므로, 이를 포인트 “건수”로 설명하는 한계는 남습니다. 근거: [MetricIngestor.java:884](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:884), [MetricIngestor.java:916](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:916).

## 🟢 확인된 것

- **종류 변경 수단으로 삭제·재등록은 타당합니다.** 새 세대가 종류를 다시 정하고 조회가 생성 시각 다음 완전한 버킷부터 시작합니다. 운영 안내에는 **옛 세대 데이터가 현재 조회에서 제외되고, 1h 해상도에서는 최대 1시간 비어 보일 수 있음**도 포함해야 충분합니다. 근거: [ApmCustomMetricGate.java:483](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:483), [ApmCustomMetricSeriesService.java:69](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:69).
- **DELETE의 `NOT EXISTS` 비용만으로 반려할 근거는 없습니다.** 규칙 테이블은 최대 20개이고 이름 UNIQUE 및 원장의 `last_seen_at` 인덱스가 있습니다. 다만 **50×서비스는 살아 있는 자리의 상한**이며, 보존되는 만료 종류 행까지 포함한 전체 행 수 상한은 아닙니다. 성능 평가는 실행계획·실측 없는 정적 추정입니다. 근거: [ApmCustomMetricRuleService.java:57](/C:/worktrees/zm-155-followup-be/src/main/java/com/dmove/moveseye/premium/apm/collector/custommetric/ApmCustomMetricRuleService.java:57), [V81__apm_custom_metric_rule.sql:24](/C:/worktrees/zm-155-followup-be/src/main/resources/db/migration/V81__apm_custom_metric_rule.sql:24), [V81__apm_custom_metric_rule.sql:48](/C:/worktrees/zm-155-followup-be/src/main/resources/db/migration/V81__apm_custom_metric_rule.sql:48).