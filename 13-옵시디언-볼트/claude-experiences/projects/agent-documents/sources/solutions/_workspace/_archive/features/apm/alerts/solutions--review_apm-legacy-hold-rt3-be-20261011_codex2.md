## 판정

**승인**

1차 반려의 5개 필수 항목이 계약과 일치하게 반영되었습니다. 변경분에서 새 배포 차단 사유는 발견하지 못했습니다.

## 🔴 필수

없음.

## 🟡 권장

- `SLO_BURN`의 “측정 불가”는 알람 유지가 아니라 **알람 해소**로 동작합니다. `UNKNOWN`은 `-1`로 push되고, 임계값 `0`보다 작으므로 Zabbix Problem이 recovery되며 로컬 `ApmAlertEvent`도 resolve됩니다([ApmSloBurnEvaluator.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmSloBurnEvaluator.java:121), [ApmAlertEvaluationService.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:382)). 그래프에서는 정상 `0`과 구별되지만, 열린 알람 상태는 유지되지 않습니다. 이는 기존 값 규약 및 이번 계약의 “측정 불가 값 push”와 일치하므로 반려 사유는 아닙니다. 운영 문서에는 업그레이드 직후 최장 6시간 동안 이 동작이 가능함을 명시하는 편이 좋습니다.

- 처리 지연 때문에 스냅샷을 skip한 상태가 `backfillDays`보다 오래 지속되면 그 날짜는 자동 재시도 범위를 벗어날 수 있습니다([ApmSloSnapshotService.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:110)). 이번 수정의 legacy-null 확정 문제와는 별개지만, 장기 `BLOCKED` 상황을 위한 수동 재생성 절차나 경고가 있으면 안전합니다.

- 애플리케이션은 HTTP `Range`/`206 Partial Content`를 구현하지 않습니다. 따라서 `Range` 요청도 전체 `200` 응답으로 새 계획을 세우는 경로입니다. 이를 명확히 하려면 `Accept-Ranges: none` 또는 MVC 테스트를 추가하는 것을 권장합니다.

## 🟢 참고

- **ceil off-by-one:** stage 60 탐색 시작이 `ceil(max(from, untrustedBefore), 60)`으로 정규화되었습니다. 이미 정각이면 유지되고, `[00:30,02:00)`에서 `00:35` marker는 제외되며 `01:05`는 `01:00`으로 검출됩니다([ApmMetricCoverageReader.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:151)).

- **예산 null 경로:** series는 prefix 또는 suffix가 있으면 `errorBudgetTotal`과 모든 `budgetRemainingPct`를 직접 null 처리합니다([ApmSloService.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:288)). 목록·상세 헤더는 미확정 측정이 `Counted.EMPTY`가 되어 두 예산 필드가 null이며, 오늘 칸과 과거 스냅샷도 동일 규칙을 따릅니다. 누락 경로를 발견하지 못했습니다.

- **스냅샷 판별:** `legacyOnly()`는 `LEGACY_UNVERIFIED` prefix가 있으면서 suffix가 없을 때만 참입니다. legacy와 `PENDING/BLOCKED`가 섞이면 false여서 skip되고, `BOOTSTRAP_PENDING`도 skip됩니다([ApmMetricCoverageReader.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:71), [ApmSloSnapshotService.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:170)). legacy-only null을 확정 후 재계산하지 않는 것도 옳습니다. 해당 날짜의 창은 고정되어 있고 도입 이전 자료는 이후 기다려도 검증 상태로 바뀌지 않기 때문입니다.

- **RAW 경계:** RAW가 별도 도입 시각을 갖지 않으므로 stage 5의 V70 도입 instant를 공유하고 다음 1분 경계로 올리는 구현이 타당합니다([ApmMetricCoverageReader.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:205)). 1m 원본의 7일 보존은 물리적 보존 기간이고 신뢰 경계를 앞당기지 않습니다. 도입 전 RAW는 남아 있어도 미검증이며, 7일 후 자연 소멸합니다.

- **번 4창:** 5m·30m·1h·6h 중 하나라도 미검증이면 네 값을 모두 `null`로 만들어 `BURN_UNKNOWN`으로 수렴합니다([ApmSloCalculator.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:521)). 요청 0건이지만 coverage가 검증된 경우는 기존 줄 단위 규칙을 유지합니다.

- **download 재계획:** 모든 새 download 요청은 본문 직전에 `source.plan()`을 다시 호출합니다([ApmExportService.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:164)). endpoint의 숫자·coverage·watermark는 하나의 `REPEATABLE_READ` snapshot에서 고정되고([ApmEndpointExporter.java](C:/worktrees/apm-rt3/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:76)), `write()`는 그 계획의 행만 출력합니다. write 시 재판정을 제거한 것은 헤더·`_meta`·본문의 동일 snapshot 보장을 위해 맞습니다. 전송 중 변경은 현재 파일에 섞이지 않고, 연결 재시도는 새 GET에서 재계획됩니다.

- 파일은 수정하지 않았습니다. 읽기 전용 조건상 Gradle 테스트는 재실행하지 않았으며, 요청서의 통과 결과는 독립 검증하지 않은 보고값입니다.
