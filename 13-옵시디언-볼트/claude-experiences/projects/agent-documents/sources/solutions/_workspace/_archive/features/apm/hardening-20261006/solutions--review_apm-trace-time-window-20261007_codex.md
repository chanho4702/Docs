# 코덱스 검수 전문 — APM 순위 7 서버 trace 시간창 (2026-10-07, gpt-5.6-sol high, 읽기 전용)

요청서: review_apm-trace-time-window-20261007.md · 대상 BE 브랜치 apm-trace-time-window(기준 ab78f4f) 미커밋 diff, FE 26795a4 미커밋 diff

## 요약

**판정: 조건부 승인 — 🔴 0건 · 🟡 2건 · 🟢 0건**

구현 로직과 BE↔FE 계약에는 반려할 기능 결함이 없습니다. 검사 위치, `receivedAt` 기준 창, 판정 순서, safe 목록 전달, drop reason 및 FE 라벨이 계약과 일치합니다. 조건은 **필수 회귀 검증 보강**과 **배치당 DB 조회의 목표 부하 확인**입니다.

검수는 BE `ab78f4f`, FE `26795a4`의 미커밋 diff 전체를 대상으로 했습니다. 읽기 전용 요청에 따라 테스트를 재실행하거나 파일을 변경하지 않았으며, 요청서에 기록된 통과 결과를 증빙으로 사용했습니다.

### 🟡 1. §2-e 필수 회귀 행렬이 완결되지 않음

- **심각도:** 🟡
- **위치:** [TraceIngestPipelineTest.java:193](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipelineTest.java:193), 필수 목록은 [review_apm-remaining-plan-20261007_codex.md:192](/C:/solutions/_workspace/_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md:192)
- **반례:** `spanDays=3`, `traceSummaryDays=7`, `start=receivedAt-5일` → 기대는 `TRACE_TIME_EXPIRED/dropped=1`이지만, 현재 테스트는 반대 방향(`spanDays=7`, `traceSummaryDays=3`)만 검사하므로 향후 구현이 `traceSummaryDays`만 사용하도록 회귀하면 잘못 `points=1`이 되어도 잡지 못합니다. 현재 구현의 `min()` 계산 자체는 올바릅니다. [TraceIngestPipeline.java:274](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:274)
- **권고:** 아래 “§2-e 회귀 누락” 항목을 추가하고, 특히 실제 PostgreSQL 파티션 미생성을 IT로 증명한 뒤 승인 조건을 해제하십시오.

### 🟡 2. trace 배치마다 보존 정책 DB 조회가 추가되지만 목표 부하 증빙이 없음

- **심각도:** 🟡
- **위치:** [TraceIngestPipeline.java:160](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:160), [ApmRetentionPolicy.java:90](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionPolicy.java:90)
- **반례:** Collector 500개가 초당 한 배치씩 보내면 trace 경로만으로 `scheduler_setting` 조회가 초당 500회 추가됩니다. DB pool이 포화되면 정상 trace 입력도 지연되거나 `503 ingest unavailable`로 재시도될 수 있습니다. 현재까지 이 잘못된 출력이 재현된 것은 아니며, 목표 부하 검증이 없는 운영 위험입니다.
- **권고:** 목표 Collector 수·export interval로 DB query rate와 수신 latency를 측정하십시오. 병목이면 장애 기본값을 쓰지 않는 원칙은 유지하되, 설정 저장 시 원자적으로 갱신되는 authoritative snapshot 같은 구조를 검토하십시오.

## 중점 확인 요청 판정

- **INVALID 폐기:** 승인. `end < start`를 0ns로 위장해 저장하는 것보다 명시적 손실로 기록하는 것이 정확하며 계약 순서와 일치합니다. [TraceIngestPipeline.java:295](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:295)
- **`authoritativeDays()` 예외 전파:** 승인. 정책을 모르는 상태에서 적재하지 않고 예외를 `503`으로 전환해 재시도시키는 fail-closed 동작입니다. [ApmRetentionPolicy.java:99](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionPolicy.java:99), [ApmOtlpController.java:310](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java:310)
- **`spans = safeSpans` 하류 전달:** 승인. 재대입 후 resolver·accumulator·writer가 모두 safe 목록만 순회하며 시간 폐기와 귀속 폐기는 같은 스팬 단위로 합산됩니다. [TraceIngestPipeline.java:171](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:171), [TraceIngestPipeline.java:183](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:183)
- **배치당 DB 1회:** 조건부 승인. 호출 위치는 배치당 1회가 맞지만 목표 수신 부하에서의 비용은 검증되지 않았습니다.
- **nano 정밀도:** 승인. 문자열 나노초를 `Instant`의 초·나노로 복원하고 경계는 엄격한 `isBefore/isAfter`로 판정합니다. [OtlpJson.java:222](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/otel/json/OtlpJson.java:222), [TraceIngestPipeline.java:298](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:298)
- **실 PG 파티션 미생성:** 조건부 승인. 전량 폐기 시 writer 0회이므로 현재 구조상 파티션 생성 경로는 차단되지만, 실제 PG/OTLP 증빙은 없습니다. [TraceIngestPipeline.java:177](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:177), [ApmTraceWriter.java:129](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmTraceWriter.java:129)

## §2-e 회귀 목록 중 빠진 것

완전 누락 또는 부분 검증 상태입니다.

- 시작/종료 누락 fallback은 기존 `OtlpTracesReaderTest`에 있으나 이번 검증에서 실행하지 않았습니다. [OtlpTracesReaderTest.java:228](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/otel/trace/OtlpTracesReaderTest.java:228)
- 24~48시간 서버 스팬이 duration 상한 없이 저장되는 회귀 테스트.
- 정상·expired·future·invalid를 한 배치에 넣은 사유별 합산 테스트. 현재 혼합 테스트는 정상+expired뿐입니다. [TraceIngestPipelineTest.java:238](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipelineTest.java:238)
- `receivedAt` 하나가 parser·시간창·resolver·저장 경계에 공통 사용되는지 검증.
- `spanDays < traceSummaryDays` 방향의 `min()` 검증.
- expired root + 정상 child에서 child-only 잠정 summary가 만들어지는 검증.
- 실제 PostgreSQL에서 폐기 날짜의 `apm_span`·`apm_trace_summary` 파티션 미생성 검증.
- 실제 PostgreSQL의 자정·시스템 timezone·경계 날짜 검증.
- FE의 세 `TRACE_TIME_*`가 `apmLostDropCount`에 실제 합산되는 테스트. 현재 신규 테스트는 라벨과 critical tone만 확인합니다. [apmCollectorDisplay.test.ts:80](/C:/solutions/moveseyee_fe/src/__tests__/apmCollectorDisplay.test.ts:80), 실제 합산 구현은 [apmCollectorDisplay.ts:112](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/collectors/apmCollectorDisplay.ts:112)
- retention DROP과 ingest 경합 테스트는 미구현입니다. 이는 아래의 의도된 보류 항목입니다.

## 반영 불필요(의도된 동작)

- trace 전체가 아닌 **스팬 단위 폐기**: 정상 child까지 함께 잃지 않기 위한 선택입니다.
- 서버 trace에 RUM의 24시간 상한을 적용하지 않음: 장기 배치 작업 스팬 허용입니다.
- `MAX_FUTURE=300초`를 메트릭 설정과 공유하지 않음: 서로 다른 운영 계약입니다. [TraceIngestPipeline.java:98](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:98)
- `min(spanDays, traceSummaryDays)` 사용: writer가 두 테이블을 함께 쓰기 때문입니다.
- 서버 trace 성공 응답을 기존 `200 {}`로 유지하고 `partialSuccess`를 추가하지 않음: 계약에서 명시적으로 선택한 응답 shape입니다. [features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md:26](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md:26)
- `TRACE_TIME_RETIRED`와 partition retirement gate를 이번 변경에서 제외함: 경합이 남는다는 사실이 계약에 명시돼 있습니다. [features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md:27](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md:27)
- FE API shape 변경 없음: reason whitelist·한/영 라벨 추가만으로 계약과 일치합니다. [apm.ts:1378](/C:/solutions/moveseyee_fe/src/types/apm.ts:1378), [kr.json:1680](/C:/solutions/moveseyee_fe/src/locales/kr.json:1680), [en.json:1680](/C:/solutions/moveseyee_fe/src/locales/en.json:1680)
