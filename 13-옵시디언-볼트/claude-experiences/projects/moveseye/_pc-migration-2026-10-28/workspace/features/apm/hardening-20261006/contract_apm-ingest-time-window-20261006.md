# APM 관측 시각과 파티션 준비 보완

상태: **순위 7 구현 완료(2026-10-07, 코덱스 검수 대기)**. 메트릭은 [지연 집계 계약](contract_apm-late-rollup-20261006.md)에 포함된다. RUM은 10-06 Codex, 서버 trace는 10-07 Claude 구현.

## RUM 구현

- 기존 시작 시각의 과거 30일·미래 300초 창은 유지한다.
- 브라우저 스팬 종료 시각도 수신 시각 +300초를 초과할 수 없다.
- 스팬 길이는 정확히 24시간까지 허용한다. 기존 `Duration.toDays()` 절삭으로 24~48시간 미만을 허용하던 오류를 수정한다.
- 페이지·세션·영수증·timing/error 집계의 기존 30일 수신 의미는 유지한다.
- `apm_rum_span` 파티션은 실제 원본 저장 조건(스팬이 있고 관측 시각이 수신 기준 7일 이내)을 만족하는 날짜만 준비한다. 다른 관측의 빈 원본 파티션을 생성하지 않는다.
- controller의 한 `receivedAt`을 parser·partition 준비·store가 함께 사용한다. 7일 경계는 포함하며 준비와 실제 INSERT가 같은 판정을 쓴다.
- 기존 OTLP RUM `partialSuccess`·폐기 계수·HTTP 응답 shape는 유지한다. 새 FE 필드는 없다.

## 서버 trace 구현 (2026-10-07, `TraceIngestPipeline`)

- 검사 위치: `TraceIngestPipeline.ingest()`에서 `reader.read()` 직후, SQL 정책 조회·`ApmRegistrarServiceResolver` 생성 **전**. 리졸버는 쓰기(자동 등록·`last_seen_at`)이고 writer는 스팬 시작 날짜로 `apm_span`·`apm_trace_summary` 파티션을 만들므로, 걸러진 스팬은 등록·파티션·저장 어디에도 닿지 않는다. 배치 전체가 걸러지면 즉시 반환.
- 기준 시각: 컨트롤러가 넘긴 `receivedAt` 하나(RUM과 같음, `now` 아님).
- 허용 창: `earliest = receivedAt − min(spanDays, traceSummaryDays)`(`ApmRetentionPolicy.authoritativeDays()`, 배치당 1회 DB 읽기), `latest = receivedAt + 300초`(`TraceIngestPipeline.MAX_FUTURE` 상수 — 메트릭 `maxFutureSeconds`·RUM 상수와 공유하지 않음). 경계 포함.
- 판정 순서와 사유(스팬 단위, `signal=TRACE`, `metric_name=null`):
  1. `end < start` → `TRACE_TIME_INVALID`
  2. `start > latest` 또는 `end > latest` → `TRACE_TIME_FUTURE`
  3. `start < earliest` → `TRACE_TIME_EXPIRED`
- 리더의 기존 보정(시작 누락→`receivedAt`, 종료 누락→시작)은 그대로다. RUM의 24시간 길이 상한은 서버 스팬에 적용하지 않는다(장기 배치 작업 스팬 허용).
- 보존 정책은 setter 주입(`setRetentionPolicy`) — 6인자 생성자 조립(테스트)은 검사 없이 동작한다. 정책 JSON이 깨지면 `authoritativeDays()`가 던져 503(메트릭 경로와 동일).
- 응답 shape 변화 없음(서버 trace는 `200 {}`·`partialSuccess` 없음). 폐기 수는 `IngestResult.dropped`·`apm_ingest_drop_stat`에만 남는다.
- **미구현(별도 과제)**: trace용 `retired_before` tombstone·날짜별 잠금. 검사 통과 뒤 retention DROP과 writer의 파티션 재생성 경합은 이 변경으로 닫히지 않는다 — 공통 partition retirement gate로 일반화할 때 함께.

## 검증

RUM 변경 7파일을 BE `22eeff8` detached worktree에 적용하여 parser/store/controller 및 실제 PG `RumSchemaIT`를 실행했다. 53개(14+11+18+10), 실패·오류·건너뜀 0. `RumSchemaIT`에서 20일 전 페이지 집계 저장·원본 span 미저장·span partition 미생성을 확인했다. 증빙은 `_archive/features/apm/hardening-20261006/apm-priority-20261006/rum-time/`다. 아직 메인 작업 트리의 5~6번 변경을 합친 최종 빌드 결과는 아니다. 공유 서버 재시작·운영 DB 변경은 하지 않았다.

## 🔄 FE 요청사항

- RUM: 응답 shape·reason 추가 없음, FE 수정 없음.
- 서버 trace(2026-10-07): 폐기 사유 3종 `TRACE_TIME_EXPIRED`·`TRACE_TIME_FUTURE`·`TRACE_TIME_INVALID` 추가 → FE `APM_DROP_REASONS`·kr/en 라벨 등록, 톤은 critical(미저장), `apmLostDropCount` 합산 포함. **반영 완료**(FE 같은 날 커밋).
