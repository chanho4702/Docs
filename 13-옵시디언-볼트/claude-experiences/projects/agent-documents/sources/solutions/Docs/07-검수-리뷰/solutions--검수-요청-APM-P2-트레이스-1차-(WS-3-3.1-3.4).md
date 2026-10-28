# 검수 요청 — APM P2 트레이스 1차 (WS-3 3.1~3.4)

- 대상: `moveseye-be-spring` 커밋 `e63c2e8`(기준 `1b43bb1`). 검수 결과는 `review_apm-p2-w1_codex.md`.
- 의도: OTLP traces 수신의 뼈대 — 파서(`otel/trace/`) · V44 스키마 9테이블 · `/v1/traces` 수신·스팬 적재·트레이스 요약 병합(`premium/apm/trace/ingest/`) · Collector tail 샘플링 옵션. 집계(edge·error·db·dependency 롤업)와 조회 API는 2차.
- 참조: 설계 `../designs/devdesign_apm.md` §5·§7, 계약 `../contract_apm.md` §7·`../contract_apm-read-api.md` §8.7, 실측 `../verification/r1_apm-collector-roundtrip.md`.

## 검증됨
- 전체 `:test` 2339 green(신규 77) · `ApmTraceSchemaIT`(도커 IT DB) · 스팬 순서 뒤섞임·재전송·부분 트레이스 픽스처.

## 🔴 불안한 지점 (구현 에이전트 자진 신고)
1. 설계 `PK(trace_id, span_id)`는 PG 파티션 제약으로 불가 → `PK(trace_id, span_id, start_ts)` 변경. 멱등성 논거(같은 스팬=같은 startTimeUnixNano)가 견고한가.
2. `sampled_reason=SLOW`는 BE 고정 2000ms 재판정 — 고객이 slowMs를 바꾸면 그럴듯하게 틀린 라벨(ERROR만 확실).
3. 루트 후착 시 요약 `start_ts` 하락 → 파티션 이동. trace_id 선조회+UPDATE, 경합은 단발 재시도 — 동시 수신 경합에서 요약 이중 행/유실 가능성.
4. `collector ↔ trace` 패키지 순환 신설(컨트롤러→파이프라인 / 파이프라인→resolve·drop).
5. 폐기 카운터가 메트릭과 한 축(metric_name=null) — 스팬 폐기가 데이터포인트 폐기와 합산.
6. 실 Collector 왕복 미검증 · 스팬 링크 실데이터 0건 · `SUCCESS_NO_INFO` 경로 미실행 · 요약 duration 마이크로초 vs 스팬 나노초.

## 미검증
- 런타임 전체(실 Collector→BE 왕복, tail 정책 실동작, V44를 실 DB에 적용한 적 없음 — dev `dmove`는 BE 재기동 시 자동 적용됨에 유의).

---

## § 반영 (2026-09-02, `review_apm-p2-w1_codex.md` 지적 11건에 대한 답)

전체 `:test` **2371 green · skip 0**(직전 2339 → +32). 도커 IT DB(`moveseye_it`) 붙은 상태라
새 동시성 IT가 실제로 돌았다. 계약 갱신: `contract_apm.md` **§7.7 신설** + §7.3·§7.4·§7.6 개정,
`contract_apm-read-api.md` §8(drops `signal`)·§8.7(`sampledReason` 4값).

| 지적 | 반영 | 핵심 |
|---|---|---|
| 🔴1 요약 동시 최초 INSERT | ✅ | `ApmTraceWriter` 신설 — trace 단위 `pg_advisory_xact_lock`(트랜잭션 잠금) 안에서 판정·적재·병합. **트레이스 하나 = 트랜잭션 하나 = 잠금 하나**(교착 불가), DDL은 트랜잭션 밖 |
| 🔴2 스팬 논리 키 dedup | ✅ | **1번과 같은 잠금 안에서** `findSpanIds(traceId)`로 `(trace_id, span_id)` 비교. 배치 내 중복도 함께 제거. PK `ON CONFLICT`는 마지막 그물로 존치 |
| 🔴3 `db.query.text` | ✅ | `ApmSqlPolicy` — `keep_raw_sql`×`mask_sql` → KEEP/MASK/**DROP**. 기본은 마스킹(리터럴 `?`). 이벤트 속성·`exception.message`·`exception.stacktrace`도 같은 정책. 버린 몫은 `RAW_SQL_BLOCKED` |
| 🔴4 이벤트 이름 | ✅ | 이름 255자 절단 + 이벤트·링크 32개 상한. 허용목록은 두지 않음(모르는 이름을 버리면 워터폴에 "이름 없는 점"이 남는다) |
| 🟡5 SLOW 추정 | ✅ | 저장값을 **`SLOW_INFERRED`**로 분리. `SLOW`는 수집기가 속성으로 알려 준 경우에만 |
| 🟡6 drop stat signal | ✅ | `signal varchar(16) NOT NULL DEFAULT 'METRIC'` + UNIQUE 4칸. **V44 안에서 ALTER**(V45 안 만듦). 메트릭 호출부 무수정 |
| 🟡7 요약 UPDATE 최종 실패 | ✅ | 3회 시도(행 소멸이면 재INSERT) 후 **던진다** → 503 → Collector 재시도 |
| 🟡8 `apm_deployment` 보존 | ✅ | `deployments` 단계(`deploymentDays` 기본 400, DELETE). 쓰는 코드 전에 먼저 넣었다 |
| 🟡9 collector↔trace 계층 | 📝 결정만 | 코드 무수정. **승격 시점 = P4 착수 직전 · 대상 4종 → `core/ingest/` · 앞당기는 조건**을 `contract_apm.md` §7.6-4에 못 박음 |
| 🟢10·11 | 유지 | — |

### 트레이드오프 — dedup 완전성 (지적 2의 요구)
**"보존 창 안에서 완전"을 택했다.** 잠금 안 논리 키 비교의 비용은 트레이스당 인덱스 탐색 1회
(파티션 수만큼, 보존 7일이면 10개 안팎)이고, 이미 요약 조회가 같은 비용을 내고 있다.
- 버린 안 ①: 전역 `(trace_id, span_id)` 레지스트리 테이블 — 완전하지만 **일 2천만 행**짜리
  비파티션 테이블을 새로 떠안는다(보존·인덱스 팽창).
- 버린 안 ②: 해시 근사 필터 — 메모리는 싸지만 **오탐 = 진짜 스팬 유실**이라 이 도메인에서 불가.
- 🔴 남는 구멍: 보존 경계를 넘겨 파티션이 DROP된 스팬의 재전송은 다시 저장된다(그때는 요약도
  없어 새 트레이스가 된다).

### 신규·수정 검증
- IT(진짜 PG): `concurrentFirstWritesCollapseToOneSummary`(스레드 8개 × **서로 다른 start_ts**로
  동시 첫 수신 → 요약 1행·span_count 8) · `resendWithShiftedTimestampIsDeduped` ·
  `duplicateWithinOneBatchIsDeduped` · `writerHandlesLateRootAcrossPartitions` ·
  `ApmRetentionJobIT` 3건(배포 400일 · signal 분리 · DDL 기본값).
- 단위: `ApmSqlPolicyTest` 10건(판정표·마스킹·식별자 보존·스택트레이스 프레임 보존·차단 카운트) ·
  `TraceIngestPipelineTest` 16건(SQL 정책 3갈래·이벤트 이름 절단·이벤트 상한·signal=TRACE) ·
  `ApmIngestDropStatRecorderTest` 6건.

### 🔴 이번에도 남는 불안한 지점
1. **실 Collector 왕복은 여전히 미검증**(지적 10의 권고). 잠금·중복 제거가 실 트래픽 동시성에서
   어떤 지연을 만드는지 실측이 없다 — 근거는 산술(ms 단위 × 키 분산)뿐이다.
2. **트랜잭션이 트레이스 단위**라 배치 중간 실패 시 앞부분은 커밋된 채 503이 나간다. 재시도가
   안전하다는 전제(중복 제거)에 기대고 있고, 그 전제가 깨지면 span_count가 부푼다.
3. **V44를 수정했다** — 이미 V44가 적용된 DB가 있으면 Flyway checksum mismatch가 난다.
   `moveseye_it`은 매 실행 drop&create라 무해하지만, dev `dmove`에 BE를 재기동해 적용한 적이
   있다면 그 행을 지우거나 repair해야 한다.
4. **`SLOW_INFERRED` 임계 자체는 그대로 2000ms 고정**이다(수집기별 `slowMs`는 여전히 DB에 없다).
   이름이 그 한계를 드러낼 뿐, 어긋남은 남아 있다.
5. **예외 메시지 SQL 마스킹은 휴리스틱**이다(키워드 쌍 판정). 여러 줄에 걸친 SQL·키워드가 없는
   PII는 못 잡는다 — 정본 방어선은 여전히 에이전트·Collector다.
