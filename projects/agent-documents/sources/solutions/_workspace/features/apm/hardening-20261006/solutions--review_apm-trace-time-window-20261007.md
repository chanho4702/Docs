# 검수 요청 — APM 순위 7 서버 trace 관측 시각 검사 (2026-10-07)

구현: Claude(SOLO-CLAUDE). 검수: Codex. 기준 BE master `ab78f4f`(브랜치 `apm-trace-time-window`, worktree `C:/worktrees/apm-c05-followup`), FE `26795a4`(master 작업 트리).
계약: `_workspace/features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md` "서버 trace 구현" 절(이번에 갱신). 코덱스 사전 의견 `review_apm-remaining-plan-20261007_codex.md` §2.

## 범위

**BE (4파일)**
- `trace/ingest/TraceIngestPipeline.java` — `reader.read()` 직후·리졸버 생성 전에 배치 단위 시간창 검사. `receivedAt` 기준, `earliest = receivedAt − min(spanDays, traceSummaryDays)`(`ApmRetentionPolicy.authoritativeDays()` 배치당 1회), `latest = receivedAt + MAX_FUTURE(300초)`. 판정 INVALID(end<start) → FUTURE(start 또는 end > latest) → EXPIRED(start < earliest), 경계 포함. 사유별 합산해 `dropStats.record(..., null, n, TRACE)`, `dropped`에 가산. 전부 걸러지면 즉시 반환(등록·파티션·writer 0회). 정책은 setter 주입(6인자 생성자 보존).
- `collector/ingest/drop/ApmDropReason.java` — `TRACE_TIME_EXPIRED`·`TRACE_TIME_FUTURE`·`TRACE_TIME_INVALID`(32자 이하).
- `collector/drops/ApmIngestDropsDto.java` — Swagger 사유 목록에 METRIC_TIME_*·TRACE_TIME_* 추가(문서만).
- `TraceIngestPipelineTest` — setUp에서 정책(DEFAULTS 7일) 주입해 기존 18건이 시간창을 켠 채로 통과 + 신규 7건(만료 시 등록·writer 0회, 경계 포함/1ns 밖, 미래 종료, end<start, 혼합 배치 합산, min(span,summary), 정책 미주입 시 검사 생략).

**FE (4파일)** — `types/apm.ts` `APM_DROP_REASONS` 3종, `locales/kr.json`·`en.json` 라벨, `apmCollectorDisplay.test.ts` 3행. 톤은 기본 critical·`apmLostDropCount` 합산(코드 변경 없음).

## 의도 — 선택과 버린 대안

1. **스팬 단위 폐기**(trace 단위 아님). 루트만 만료된 trace는 자식만 남는다 — Collector 배치 특성상 자식이 먼저 오는 것이 정상이라 요약 병합이 이미 "루트 없는 배치"를 다룬다. trace 단위로 버리면 정상 자식까지 잃는다.
2. **24시간 길이 상한 미적용.** RUM은 브라우저 정책이고 서버 스팬은 장기 배치 작업이 있다(코덱스 의견과 같음).
3. **`MAX_FUTURE` 상수 300초, 설정 키 없음.** 메트릭 `maxFutureSeconds`는 롤업 설정이라 공유하지 않는다는 계약을 따랐고, 새 설정 키를 만들면 설치 가이드·FE 설정 화면까지 번진다. 필요해지면 `app.apm.trace.max-future-seconds`로 승격.
4. **보존 창 `min(spanDays, traceSummaryDays)`** — writer가 둘을 같이 쓰므로 짧은 쪽.
5. **retired tombstone 미구현** — trace에는 `apm_metric_partition_state` 같은 상태가 없다. 계약서대로 공통 partition 경계 작업으로 미룸(이번 검사로 "검사 통과 → DROP → 파티션 재생성" 경합은 안 닫힌다).
6. `end == null`은 리더가 start로 접으므로 실제로는 오지 않지만 null-safe로 뒀다.

## 중점 확인 요청

- [ ] **INVALID 폐기가 기존 동작을 바꾼다.** 전에는 `end<start` 스팬을 `durationNanos()=0`으로 저장했다(리더 javadoc "음수를 만들지 않는다"). 지금은 저장하지 않는다. 리더 테스트는 그대로 통과하지만, 운영에서 시계 조정 스팬을 잃는 쪽이 맞는지.
- [ ] **`authoritativeDays()` 예외 전파.** 정책 JSON 깨짐 → 503 → Collector 재시도. 메트릭 경로와 같지만 trace 수신이 전면 중단되는 모양이다.
- [ ] **`spans = safeSpans` 재대입 후 하류.** 리졸버·허용목록·accumulator·writer 전부 safe 목록만 본다. `IngestResult.dropped`가 시간 폐기+귀속 폐기 합이라 단위 혼합은 없다(둘 다 스팬).
- [ ] **배치당 DB 1회 추가**(`authoritativeDays`가 `scheduler_setting` 조회). 수신 QPS에서 부담인지. 메트릭도 같은 비용을 이미 낸다.
- [ ] **경계 테스트의 nano 정밀도** — `earliest.minusNanos(1)`을 OTLP `startTimeUnixNano` 문자열로 넣어 리더가 그대로 복원하는지(테스트 통과로 확인됨).
- [ ] **PG 파티션 미생성은 단위 테스트로만 증명**(writer 호출 0회). 파이프라인 수준 실 PG IT는 없다(기존 `ApmTraceSchemaIT`는 store 직접 호출).

## 검증 현황

**통과**: BE `TraceIngestPipelineTest` 25(신규 7) · `ApmOtlpControllerTest` 28 · `ApmTraceSchemaIT` 20(실 PG) · `ApmIngestDropStatRecorderTest` 6 — 실패·건너뜀 0. FE `tsc` 통과, jest `apmCollectorDisplay` 53 통과.
**못 한 것**: 실제 OTLP 수신(dev BE)으로 과거/미래 스팬 보내 보기. `OtlpTracesReaderTest`는 이번 필터에 안 걸려 돌리지 않음(리더 미변경). 전체 BE 테스트 미실행.

## 검수 결과 (Codex, gpt-5.6-sol high, 2026-10-07 — 전문 `review_apm-trace-time-window-20261007_codex.md`)

판정 **조건부 승인** — 🔴 0 · 🟡 2. 중점 확인 6건 중 4건 승인(INVALID 폐기·예외 전파·safe 목록 하류·nano 정밀도), 2건 조건부(배치당 DB 1회 비용·실 PG 파티션 미생성 증빙).

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🟡 | §2-e 필수 회귀 행렬 미완결 | [x] 단위 +4: `spanDays<traceSummaryDays` 방향 min · 정상·만료·미래·역전 혼합 사유별 합산 · 36시간 서버 스팬 길이 상한 없음 · 만료 루트+정상 자식 → 자식만 남은 요약(rootSpanId null). [x] **실 PG IT 신설 `ApmTraceTimeWindowIT`** 2건 — 400일 전·1년 뒤 스팬이 폐기만 되고 그 날짜의 `apm_span`·`apm_trace_summary` 파티션·서비스 등록이 생기지 않으며 `apm_ingest_drop_stat`에 `TRACE_TIME_EXPIRED/TRACE`가 남는다. [x] `OtlpTracesReaderTest` 실행(리더 fallback 회귀). [x] FE `apmLostDropCount`에 TRACE_TIME_* 3종 합산 테스트. [ ] 자정·시스템 timezone 경계 IT — 보존 정책이 테스트 DB 값이라 경계를 고정할 수 없어 보류(단위 테스트가 nano 경계를 고정). [ ] `receivedAt` 공유는 코드 구조(한 인자)로 보장, 별도 테스트 없음 |
| 2 | 🟡 | 배치당 `scheduler_setting` 조회 1회 추가 — 목표 부하 미검증 | [ ] 보류·백로그 — 메트릭 경로가 이미 같은 비용(`ApmMetricPartitionGuard.ingestionWindow` → `authoritativeDays`)을 내고 있어 trace만 다르게 하지 않았다. 순위 12(목표 부하 검증)에서 설정 저장 시 원자 갱신되는 authoritative 스냅샷으로 둘을 함께 바꾼다 |

반영 검증: `TraceIngestPipelineTest` 29(신규 11) · `ApmTraceTimeWindowIT` 2(실 PG, skipped 0) · `ApmTraceSchemaIT` 20 · `OtlpTracesReaderTest` 통과. FE jest `apmCollectorDisplay` 53 통과.
