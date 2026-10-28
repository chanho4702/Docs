# 코덱스 검수 결과 — APM P2 트레이스 1차 (2026-09-02, codex exec read-only, 대상 e63c2e8)

요약: 🔴 같은 trace의 동시 첫 수신은 서로 다른 `start_ts`로 요약 행을 각각 INSERT할 수 있어, 중복 요약과 분산된 `span_count`가 실제로 발생합니다.  
요약: 🔴 `db.query.text`와 이벤트 이름은 BE 최종 방어선에서 원문·크기 제한 없이 저장될 수 있습니다.  
요약: OTLP JSON의 enum·int64 문자열·hex ID·루트·빈 status·exception 이벤트 처리는 코드상 적절하지만, 재전송 멱등성과 SLOW 라벨은 현재 조건부입니다. 테스트는 실행하지 않았습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `ApmTraceSummaryStore.java:164-182` | 동시 첫 수신에서 `trace_id` 단독 유일성이 없어 두 요청이 서로 다른 `start_ts`로 각각 INSERT 가능 | 두 요청이 모두 `find(trace_id)=null`을 본 뒤 `(trace_id, start_ts)`가 다른 행을 INSERT하면 충돌이 없다. 이후 `find()`는 가장 이른 행만 갱신하므로 다른 행은 남아 목록 중복·`span_count` 분산이 발생한다. | `trace_id`를 전역적으로 직렬화/advisory lock 하거나, 비파티션 trace-id registry를 둬 단일 요약 행을 보장하라. 단발 재시도만으로는 해결되지 않는다. |
| 2 | 🔴 | `ApmSpanStore.java:57-63`, `V44__apm_trace.sql:89` | 스팬 PK가 `(trace_id, span_id, start_ts)`라 시각이 달라진 재전송은 중복 적재 | 구현도 이 한계를 인정한다. Collector의 동일 바이트 재시도에는 맞지만 SDK/중계 계층이 시각을 재직렬화·보정하면 같은 논리 스팬이 중복되고 요약 `span_count`도 증가한다. | `trace_id, span_id`의 전역 dedup registry를 추가하거나 trace-id 기준 파티셔닝 등으로 논리 식별자 유일성을 보장하라. |
| 3 | 🔴 | `ApmSpanAttrAllowlist.java:83-85`, `TraceIngestPipeline.java:127,185` | `db.query.text`를 무조건 허용 | `keep_raw_sql=false`, `mask_sql=true` 설정이 있어도 이 적재 경로는 이를 읽지 않는다. Collector 설정을 손편집하거나 우회하면 원문 SQL이 `attrs` 및 이벤트 JSON에 저장된다. 4KB 절단은 비밀값·PII 유출 방어가 아니다. | BE에서 기본적으로 `db.query.text`를 제거/마스킹하고, 관리자 opt-in일 때만 명시적으로 허용하라. 설정 변경 감사·열람 권한 정책도 이 경로와 연결하라. |
| 4 | 🔴 | `TraceIngestPipeline.java:180-188` | `events[].name`은 allowlist·길이 제한 없이 원문 저장 | 이벤트 속성은 필터링하지만 이름은 그대로 jsonb에 넣는다. 임의 OTLP sender가 PII 또는 대용량 문자열을 이름에 넣을 수 있으며, 요청 8MB가 그대로 DB 행 크기로 전파된다. | 이벤트 이름을 표준 허용값 중심으로 제한하고, 최소한 `ApmSpanStore.MAX_NAME` 수준의 길이 절단을 적용하라. |
| 5 | 🟡 | `ApmSampledReason.java:92-97` | `SLOW`가 실제 Collector 정책이 아니라 고정 2000ms 추정 | 실제 `slowMs`는 수집기별 설정이며 DB에 없다. 현재 저장값은 `SLOW`와 추정을 구별하지 못해 화면·후속 API가 확정 사유로 오해할 수 있다. ERROR만 확정이다. | 수집기별 `slowMs`와 설정 버전을 저장해 판정하거나, `SLOW_INFERRED`/판정 근거 필드를 분리하라. |
| 6 | 🟡 | `TraceIngestPipeline.java:121-123`, `ApmIngestDropStatRecorder.java:46-52`, `MetricIngestor.java:228` | 트레이스와 메트릭의 귀속 실패 카운터가 같은 `(token, reason, '')` 행에 합산 | `metric_name=null`은 빈 문자열로 정규화된다. 메트릭도 서비스 귀속 실패 시 null을 넘기므로 단위가 다른 데이터포인트와 스팬을 화면에서 구별할 수 없다. | `signal` 축을 스키마·UNIQUE·조회 DTO에 추가하고 기존 집계를 마이그레이션하라. |
| 7 | 🟡 | `ApmTraceSummaryStore.java:195-210` | UPDATE 경합 재시도도 0행이면 해당 요약 갱신을 포기 | 스팬은 저장되지만 그 배치의 요약 min/max/error/service 집합 갱신은 다음 배치가 와야 회복된다. 마지막 배치였다면 영구 불일치다. | 경합 시 bounded retry+backoff 또는 trace 단위 잠금을 적용하고, 최종 실패는 503으로 재시도되게 하라. |
| 8 | 🟡 | `V44__apm_trace.sql:291-310`, `ApmRetentionJob.java:137-147` | `apm_deployment`의 설계상 400일 보존 정리가 없다 | 현재는 스키마만이라 즉시 영향은 없지만 P3.11이 쓰기 시작하면 비파티션 테이블이 무기한 증가한다. | 배포 이력 DELETE 보존 단계를 P3 쓰기와 함께 반드시 추가하라. |
| 9 | 🟡 | `TraceIngestPipeline.java:8-10`, `ApmOtlpController.java:405-407` | `collector ↔ trace` 패키지 의존 | 현재 Spring bean 순환은 아니지만 trace가 collector의 ingest 계약·resolve·drop에 의존해 계층 경계가 역전된다. 로그 신호가 추가되면 결합이 더 커진다. | `ApmIngestPipeline`, resolver, drop 계약을 신호 중립 `core`로 승격하는 시점을 P4 이전에 확정하라. |
| 10 | 🟢 | `OtlpTracesReader.java:130-173`, `OtlpSpanKind.java:54-75`, `OtlpSpanStatus.java:42-60`, `OtlpJson.java:70-92,222-240` | OTLP JSON 핵심 함정 처리 | enum 숫자, int64 문자열 나노초, 대소문자 hex 정규화, parent 부재 루트, `status:{}`=UNSET, exception 이벤트 속성 읽기가 구현돼 있다. | 유지. 실제 Collector 왕복으로 동일 경로를 확인하라. |
| 11 | 🟢 | `V44__apm_trace.sql:22-49`, `ApmPartitionService.java:86-89`, `ApmRetentionJob.java:141-143` | 설계 §7 대비 다섯 스키마 차이와 파티션·보존 편입 | hex varchar, 파티션 PK 보완, `end_ts/root_span_id`, `bigint[]`, 중복 trace 인덱스 제거는 각각 근거가 타당하다. 6개 파티션 테이블은 생성·DROP 대상에도 편입됐다. | 차이 자체는 승인 가능하나, #2의 멱등성 대책은 별도로 필요하다. |

## 요청서의 불안한 지점 6건 판정

1. `PK(trace_id, span_id, start_ts)` 멱등성: **🔴 불충분**. 동일 Collector 재시도에는 성립하지만, 시각이 달라지는 같은 논리 스팬을 막지 못한다.

2. `sampled_reason=SLOW` 고정 2000ms: **🟡 타당하게 문서화됐지만 저장값은 충분히 정직하지 않음**. 코드·계약에는 “추정”이라고 쓰였으나 DB 값 `SLOW` 자체에는 근거가 없다.

3. 루트 후착·파티션 이동·동시 경합: **🔴 실제 결함**. 기존 행 UPDATE의 row movement 처리보다, 두 요청이 동시에 “행 없음”을 본 뒤 서로 다른 시작 시각으로 INSERT하는 경로가 더 치명적이다.

4. `collector ↔ trace` 순환: **🟡 현재 런타임 순환은 아님**. 다만 패키지·계층 의존은 생겼고 P4 로그 전에는 중립 계약으로 분리할 필요가 있다.

5. 폐기 카운터 축 공유: **🟡 실제 발생**. `MetricIngestor`도 서비스 귀속 실패에 `metric_name=null`을 사용하므로, 문서의 우려대로 같은 행에 합산된다.

6. 실 Collector 왕복·links·`SUCCESS_NO_INFO`·duration 정밀도: **🟡 미검증/제한 유지**. 링크는 파서와 저장 경로가 있고 속성도 필터링된다. `SUCCESS_NO_INFO`는 코드가 방어하지만 중복 시 `span_count` 과대계상 가능성을 인정한다. summary duration의 마이크로초 정밀도 차이는 설계상 알려진 표현 한계다.

## 다음 커밋 전 반드시 고칠 것

- [ ] 같은 `trace_id`의 동시 최초 INSERT를 단일 요약 행으로 직렬화하고, 동시·서로 다른 `start_ts` 통합 테스트를 추가한다.
- [ ] `apm_span`의 논리 키 `(trace_id, span_id)` 재전송 dedup 전략을 도입한다.
- [ ] BE에서 `db.query.text` 원문을 기본 차단/마스킹하고 `keep_raw_sql` opt-in·감사와 실제 연결한다.
- [ ] 이벤트 이름의 allowlist 또는 길이 상한을 적용한다.
- [ ] `SLOW` 추정임을 저장 모델에서 구별하거나 수집기별 실제 임계값을 보존한다.
- [ ] drop stat에 signal 축을 추가해 span과 metric point를 분리한다.
- [ ] 요약 UPDATE의 최종 경합 실패를 “다음 배치에 기대는” 방식으로 남기지 않는다.
- [ ] `apm_deployment` 400일 보존 삭제를 P3 쓰기 전 포함한다.
