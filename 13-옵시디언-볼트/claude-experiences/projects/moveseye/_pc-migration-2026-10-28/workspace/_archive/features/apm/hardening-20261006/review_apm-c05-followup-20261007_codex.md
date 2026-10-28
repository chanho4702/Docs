# 코덱스 검수 전문 — APM 순위 5 소비자 완전성 보완(c05 후속) 1차 (2026-10-07, gpt-5.6-sol high, 읽기 전용)

요청서: review_apm-c05-followup-20261007.md · 검수 대상 BE c05bd85..9a35de1, FE b8081cc..a1e258e

## 요약

**판정: 반려**

- 🔴 1건
- 🟡 3건
- 🟢 5건 — 중점 확인 항목 중 통과
- 파일 변경 없음
- 검수 도중 변경이 커밋되어 동일 범위를 BE `c05bd85..9a35de1`, FE `b8081cc..a1e258e`로 검수했습니다.
- `git diff --check`와 변경 JSON 구문 검사는 통과했습니다. 읽기 전용 조건 때문에 테스트는 재실행하지 않고 요청서의 통과 기록을 대조했습니다.

### 🔴 1. `NOT_MEASURABLE` 오늘 칸이 FE에서 제거되어 “요청 없음”으로 잘못 표시됨

- **심각도 ·** 🔴
- **위치 ·** BE는 측정 불가 시 `sliPct=null`, `requests=null`, `unknownReason=NOT_MEASURABLE`을 정상적으로 반환합니다. [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:545) [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:553) 그러나 FE 변환기는 `sliPct === null`인 날을 먼저 제거합니다. [apmSloDisplay.ts](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/apmSloDisplay.ts:260) [apmSloDisplay.ts](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/apmSloDisplay.ts:266) 따라서 이후의 `NOT_MEASURABLE` 툴팁 분기는 실행될 수 없습니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:221) [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:225)
- **반례 ·** 실제 요청이 있었지만 오늘 롤업이 미확정 → API `{sliPct:null, requests:null, unknownReason:"NOT_MEASURABLE"}` → FE가 행 제거 → 회색 빈 칸과 “그날 요청이 없어 재지 못한 날” 안내를 표시합니다. [kr.json](/C:/solutions/moveseyee_fe/src/locales/kr.json:3074) 툴팁 색인도 살아남은 `cells`만 사용하므로 사유가 표시되지 않습니다. [apmSloCharts.ts](/C:/solutions/moveseyee_fe/src/lib/echarts/apmSloCharts.ts:135)
- **권고 ·** `NOT_MEASURABLE` 칸은 일반 SLI heatmap 값과 별도 series/overlay로 유지하십시오. 숫자 `0`으로 바꾸면 안 됩니다. 실제 calendar option의 data와 tooltip formatter를 호출해 “측정 불가” 문구가 출력되는 테스트도 추가해야 합니다.

### 🟡 2. 범위 시작이 격자에 맞지 않으면 전체 미확정인데도 가짜 0건 점이 하나 생김

- **심각도 ·** 🟡
- **위치 ·** `trustedTo`는 실제 `range.fromMs()`로 잘리지만, 점 생성 시작은 그보다 앞선 격자 경계로 내립니다. [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:240) [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:262)
- **반례 ·** `from=10:02`, `step=300`, stage 상태 문제로 `Issue.from=10:02` → `trustedTo=10:02`, 저장소는 읽지 않음 → `first=10:00`이고 `10:00 < 10:02`라 `Counted.EMPTY` 점 1개 생성 → 전체 범위가 미확정인데 `10:00 requests=0`이 신뢰 가능한 점처럼 출력됩니다. 요청서의 “점 0개” 설명과 다릅니다.
- **권고 ·** `trustedTo <= range.fromMs()`이면 점 목록도 즉시 비우거나, 점 생성 조건에 동일한 trusted-range 가드를 적용하십시오. 현재 테스트는 문제 시각을 여섯 번째 칸에 두어 이 경계를 잡지 못합니다. [ApmSloServiceTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/slo/ApmSloServiceTest.java:393) [ApmSloServiceTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/slo/ApmSloServiceTest.java:409)

### 🟡 3. 같은 잘린 시계열을 쓰는 오류 예산 번다운에는 미확정 안내가 없음

- **심각도 ·** 🟡
- **위치 ·** `incompleteFromMs` 안내는 SLI 카드의 `sliFootnote`에만 연결됩니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:192) [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:449) 번다운은 고정 문구만 사용합니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:423) [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:431)
- **반례 ·** `incompleteFromMs=10:00`, 이후 points 없음 → SLI 카드는 “집계 미확정”을 표시하지만 동일 points로 그린 번다운은 단순히 10:00에서 끝남 → 사용자는 이후 예산이 변하지 않았거나 데이터가 없었다고 읽을 수 있습니다.
- **권고 ·** 미확정 안내를 두 카드가 공유하거나 번다운에도 같은 warning footnote를 연결하십시오. 현재 FE 테스트도 SLI 카드만 단정합니다. [ApmSloPage.test.tsx](/C:/solutions/moveseyee_fe/src/__tests__/ApmSloPage.test.tsx:604)

### 🟡 4. 스냅샷의 미확정 INFO 로그가 daily 검사에만 적용됨

- **심각도 ·** 🟡
- **위치 ·** daily completeness 실패는 INFO를 남기지만 [ApmSloSnapshotService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:185), rolling window와 1h/6h 실패는 로그 없이 반환합니다. [ApmSloSnapshotService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:199) [ApmSloSnapshotService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:207)
- **반례 ·** 오늘 하루는 clean이지만 30일 rolling window의 과거 bucket이 dirty → 스냅샷 skip → 계산 실패 WARN도, 롤업 미확정 INFO도 없음 → 운영자는 skip 원인을 구분할 수 없습니다.
- **권고 ·** daily/window/1h/6h 각각의 completeness 실패를 공통 helper로 기록하고 어떤 창이 실패했는지 포함하십시오. `SnapshotResult` 계약과 전체 잡 실패 승격은 그대로 보류해도 됩니다.

## 중점 확인 요청 판정

- **`series()` 격자 내림 · 🟡 보완 필요** — 문제 bucket이 굵은 응답 칸 중간이면 칸 전체를 버리는 정책은 타당하지만, `Issue.from == range.from`이고 시작이 비정렬이면 가짜 첫 점이 남습니다.
- **REPEATABLE_READ · 🟢 통과** — `series()` 전체가 `REPEATABLE_READ` 트랜잭션이고, direct `firstIssue()`와 `store.redSeries()`가 같은 트랜잭션에 참여합니다. [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:223)
- **CoverageReader 판정 순서 · 🟢 통과** — stage 5 상태 → stage 60 자기 상태 → 자기 marker → stage 5 marker 순서이며 `cutover=null`도 fail-closed입니다. [ApmMetricCoverageReader.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:52) [ApmMetricCoverageReader.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:104)
- **`todayCell` completeness 가드 · 🟢 통과** — window 미검증 시 `budgetRemainingPct=null`, daily 미검증 시 `requests/measuredUntil=null`, `unknownReason=NOT_MEASURABLE`입니다. [ApmSloService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:540)
- **`todayCellBudgetUsesRollingWindow` 변경 · 🟢 통과** — 일간과 rolling window를 `fromMs`로 분리한 mock이 기존 단정을 유지하면서 새 필드를 확인합니다. [ApmSloServiceTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/slo/ApmSloServiceTest.java:338)
- **FE 캘린더 `NOT_MEASURABLE` 노트 · 🔴 실패** — formatter 테스트 부재보다 앞서, 해당 칸 자체가 `sliPct=null` 필터에서 제거됩니다.
- **APC-07 · 🟢 통과** — 설정 검증과 `LiveSpanRing`의 실제 상한이 모두 200으로 일치합니다. [ApmLiveProperties.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveProperties.java:101) [LiveSpanRing.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRing.java:147)

## 테스트가 못 잡는 케이스

- FE calendar today가 `unknownReason=NOT_MEASURABLE`, `sliPct=null`인 계약 표본이 없습니다. BE golden fixture도 모든 `unknownReason`이 `null`입니다. [slo-detail.json](/C:/worktrees/apm-c05-followup/src/test/resources/apm/contract/slo-detail.json:99)
- 비정렬 `range.fromMs`와 동일 시각에 state issue가 시작되는 시계열 케이스가 없습니다.
- 번다운 카드에 `incompleteFromMs` 안내가 표시되는지 검사하지 않습니다.
- daily는 complete지만 rolling window 또는 1h/6h만 incomplete인 snapshot skip 경로가 없습니다.
- `legacy_cutover=null` fail-closed 구현은 있으나 직접 검증하는 IT가 없습니다.
- APC-07은 Bean Validation으로 `201`을 거절하는 경계 테스트가 없습니다. 기존 테스트의 `new ApmLiveProperties(..., 2000, ...)`는 생성자를 직접 호출하므로 `@Max`를 실행하지 않습니다. [ApmLivePropertiesTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/overview/live/ApmLivePropertiesTest.java:40)

## 반영 불필요(의도된 동작)

- 굵은 응답 step 중간에 문제가 있으면 해당 칸 전체를 버리는 보수적 정책.
- `PARTIAL`과 별도로 `ROLLUP_INCOMPLETE`를 추가하고 untrusted 행의 `activeRequests`까지 비우는 정책. [ApmRedSeriesExporter.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:149) [ApmRedSeriesExporter.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:186)
- 굳은 과거 calendar 칸의 `unknownReason`을 소급 생성하지 않고 오늘 칸에만 채우는 정책.
- 1m 원본을 rollup coverage 판정 대상에서 제외한 정책.
- Availability에 `incompleteFromMs/reason`을 이번 변경에서 추가하지 않은 결정.
- `SnapshotResult` counter 확장과 전체 skip의 잡 실패 승격을 별도 백로그로 둔 결정.
