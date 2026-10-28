# §6 단계별 상세 — P2 트레이스·서비스 맵·에러/DB/의존·배포

> **MovesEye APM 종합 안내서** 분책 08/18 · 원본 절 **§6.3** · 마지막 갱신 **2026-09-14**(원본 `apm-handbook.md` 2026-09-14 작성분을 내용 수정 없이 옮김, 분책 2026-09-14).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. P2 — 스팬 수신·요약, 트레이스 롤업 4종, 조회 EP 17, 배포 감지/웹훅/전후 비교를 무엇/어떻게/왜/조건/함정으로
> 2. 왜 PK에 `start_ts`가 들어갔나(PG 파티션 강제)·왜 예외 롤업은 대입인가·왜 웹훅만 계약이 다른가
> 3. 트레이스 계열 숫자의 한계(샘플 통과분·집계 지연 8분)와 QA가 잡은 결함
>
> **전제 문서** — 이전 [07-p1-metrics.md](solutions--07-p1-metrics.md) · 다음 [09-permissions.md](solutions--09-permissions.md) · 목차 [00-index.md](solutions--00-index.md). 용어는 [14-glossary.md](solutions--14-glossary.md), 출처 전체는 [17-sources.md](solutions--17-sources.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

### 6.3 P2 — 트레이스·서비스 맵·에러/DB/의존·배포

| | |
|---|---|
| **무엇을** | 스팬 수신·요약, 4종 롤업, 조회 EP 17(목록·산점도·상세·플레임·비교·맵·에러 3·DB 4·의존 2·exemplar), 배포 감지(AUTO)·웹훅·전후 비교·신규 예외, 화면 6(탐색·상세·맵·에러·DB·의존) + 배포 탭·RED markLine·exemplar 칩 |
| **어떻게** | 서비스 맵 엣지 = CLIENT/PRODUCER 스팬 → 자식이 다른 서비스면 SERVICE, `messaging.system`이면 QUEUE, `db.system`이면 DB, 나머지 HTTP · 예외 지문 = `sha256(type | apm_error_message_norm(message))`(스택 프레임 제외) · SQL 지문 = `sha256(db_system | apm_sql_norm(text))`(주석→달러 인용→리터럴→숫자→`IN (?)`) · 크리티컬 패스 = 자기 시간(자식 구간 **합집합** 뺀 것) 합 최대인 루트→리프 경로, 응답에 세 번 실린다(플래그·배열·합계, 불변식 테스트) · 배포 AUTO = "살아 있는(30분) 인스턴스 중 아무도 보고하지 않던 버전 관측", 부트스트랩(첫 버전 미기록), 분 단위 절단 · 웹훅 `POST /apm/services/{uid}/deployments`는 **실제 HTTP 상태**·평문 본문·scope `deploy` 토큰 |
| **왜** | 🔴 **PK에 `start_ts`**: PG가 파티션 키를 PK에 요구 — 설계 `PK(trace_id, span_id)`는 만들 수 없었고 IT가 잡았다. 그 대가로 논리 키 dedup이 생겼다 · 🔴 **예외 롤업이 대입**: 트랜잭션은 부분 실패만 막고 커밋 후 재실행은 못 막는다 → 시간대 재계산-대입, `count_total`의 뜻이 "평생 누적"→"보존 90일 합"으로(창 안 발생 수와 같은 원천이 되는 이득) · 히스토그램은 넷 다 `duration_s` 하나(한 화면에서 비교되니 격자가 같아야) · 배포를 인스턴스 버전 변화로 잡지 않는 이유: 컨테이너 배포는 기존 인스턴스를 고치지 않는다(K8s·ECS에서 한 건도 못 잡는다) · 웹훅만 계약이 다른 이유: `curl --fail`은 상태 코드로만 성패를 가르니 200+body면 토큰이 틀려도 파이프라인이 초록 |
| **조건·전제** | 트레이스 계열 숫자는 **샘플 통과분**(건수 근사, 오류 비중 과대, 정본은 메트릭). 집계 지연 최대 **8분**(5분 주기+LAG 3분) — 기본 창을 "최근 5분"으로 쓰지 말 것. 에러 목록의 `count`는 1시간 버킷 합이라 창보다 넓다(D1 — 창 시작만 정시로 내리고 `first_seen_at`으로 2차 필터; 15분 창이 늘 비던 사고) |
| **함정·교훈** | `TraceIngestPipeline`은 **구체 타입** 주입(인터페이스면 `@Primary` 메트릭 파이프라인이 스팬을 먹는다) · 구 semconv 스팬(`db.statement`)이 `db.system`만 남기고 통째로 사라졌다(D4 → `LEGACY_ALIAS`, 신 이름 우선, 별칭 해석이 거부 판정보다 먼저) · `mixedBounds` 판정에 `bounds_id NULL` 혼입 포함(`count(distinct)`는 NULL을 안 센다) · exemplar 0/23(D2 → `stored`) · 트레이스 롤업에 min/max 클램프 누락(D5 → V46) · `POST /traces/compare`는 BE만 있고 FE 화면 없음 · `maxMs`→`valueMs` 개명 보류 · AUTO가 못 잡는 셋(같은 버전 재배포·30분 안 롤백·`service.version` 없는 앱)은 웹훅으로 |

**더 보기**: PK·V44 = `features/apm/core/contract_apm.md` §7.2 · 수신·잠금·dedup·SQL 정책·`SLOW_INFERRED` = §7.3·§7.4·§7.7 · 롤업 4종·워터마크·대입 = §7.8.2·§7.8.8(`_archive/features/apm/core/review_apm-p2-w2_codex.md` 🔴1) · 조회 여섯 가지·권한·`stored` = `features/apm/core/contract_apm-read-api.md` §10.0·§10.2·§10.5 · 배포 AUTO·웹훅 = §11.3·§11.4(`_archive/features/apm/core/review_apm-p2-w3_codex.md` 🔴1) · 산점도 정렬 = `_archive/features/apm/core/review_apm-p2-w2_codex.md` 🔴4 · QA = `features/apm/core/e2e_apm-p2-qa.md` D1·D2·D4·D5·D6·D17 · 코드 `trace/ingest/ApmTraceWriter`·`trace/rollup/ApmTraceRollupService`·`trace/query/ApmSpanTree`·`service/deploy/ApmDeploymentDetector`.
**출처**: `tail_sampling` 프로세서(정책 이름을 스팬에 안 적음) https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor · PostgreSQL 문서(파티션 키·PK 제약, 상위) https://www.postgresql.org/docs/current/ .

---

## 보강 — 이 단계와 관련된 §4·§5·§8 조각(사본)

> 🔁 **보강(사본)** — 아래는 §4.2(단계 표)·§4.3(데이터 모델)·§5(데이터의 길)·§8.2(QA 수치)에서 이 단계에 해당하는 조각을 **그대로 복사**한 것이다(각 파일이 혼자 읽히게). 정본은 [04-overview.md](solutions--04-overview.md) §4.2·§4.3 · [06-data-path.md](solutions--06-data-path.md) §5 · [13-verification.md](solutions--13-verification.md) §8.2이며, 어긋나면 정본이 맞다.

**보강 A — §4.2 단계 표에서 P2 행 (정본 04-overview.md §4.2)**

| 단계 | 날짜(커밋) | 무엇 | 핵심 수치 | 검증 |
|---|---|---|---|---|
| **P2 트레이스** | 09-02 (BE 9커밋 `e63c2e8`~`c5aac1a`, FE 8커밋) | `/v1/traces` 수신(advisory lock·논리 dedup·SQL 정책) · V44~V47 · 트레이스 롤업 4종(엣지·예외·DB 쿼리·의존) · 조회 EP 17 · 배포 감지·웹훅·전후 비교 · 워터폴·맵·에러·DB·의존 화면 | tail 오류 100%/느림 100%/정상 2%(실측 2.02%) · 스팬 7일 | 코덱스 5회(🔴 4+4+1+2+1) · P2 QA 3,790요청·결함 15+3 |

**보강 B — §4.3 데이터 모델에서 V44~V47 (정본 04-overview.md §4.3)**

| 마이그레이션 | 표 | 무엇을 담나 |
|---|---|---|
| **V44** `apm_trace` | `apm_span`·`apm_trace_summary` 🔷 | 스팬 원본(7일, PK에 `start_ts`) / 트레이스당 요약 1행(루트·시작·지속·오류·스팬 수·`sampled_reason`) |
| | `apm_service_edge_5m`·`apm_error_group(+_1h)`·`apm_db_query_group(+_5m)`·`apm_dependency_5m`·`apm_deployment` | 맵 엣지 / 예외 지문 그룹+시간 버킷 / SQL 정규화 그룹+5분 / 외부 의존 5분 / 배포 마커(AUTO·WEBHOOK) |
| V45 | PG 함수 `apm_error_message_norm`·`apm_sql_norm`, BRIN 2 | 지문 정규화를 DB 안에서(롤업이 `INSERT…SELECT`로 남게) |
| V46 | 트레이스 롤업 `min_ns/max_ns` | 백분위 클램프(관측 적을 때 보간이 실측보다 커지는 것 방지) |
| V47 | `apm_metric_*.exemplar_value` | exemplar 값의 정본을 OTLP exemplar 자신으로(CUMULATIVE `max` 고정 800배 사고) |

**보강 C — §5.2 트레이스의 길 그림(트레이스 부분) (정본 06-data-path.md §5.2)**

```
 [앱] 자동계측 스팬 100% ──▶ Collector traces 파이프라인                            [BE]
                              ├ attributes/drop · redaction/pii · transform/sql       POST /apm/otlp/v1/traces (같은 컨트롤러·같은 ①~③ 관문)
                              ├ tail_sampling decision_wait 10s                       ④ OtlpTracesReader — hex id 검증·0 id 거부·parent 없음=루트·start never null
                              │   errors 100% / slow ≥ SLOW_MS 100% / normal 2%       ⑤ TraceIngestPipeline
                              └ batch → exporter                                         ⑤a 수집기 스팬 분리 → 서비스 귀속(ApmRegistrar 재사용)
                                                                                         ⑤b ApmSpanAttrAllowlist(거부>허용, 48개·1024/4096자) + LEGACY_ALIAS 12쌍
                                                                                         ⑤c ApmSqlPolicy KEEP/MASK/DROP (keep_raw_sql × mask_sql)
                                                                                         ⑤d sampled_reason: 속성 원문 → ERROR → SLOW_INFERRED(≥2000ms) → SAMPLED
                                                                                      ⑥ ApmTraceWriter — 트레이스 하나 = 트랜잭션 하나 = pg_advisory_xact_lock(hash(trace_id))
                                                                                         findSpanIds로 논리 dedup → apm_span INSERT ON CONFLICT DO NOTHING
                                                                                         apm_trace_summary 병합(찾기→INSERT/조건부 UPDATE ≤3회, start_ts 내려가면 파티션 이동)
                                                                                      ⑦ 영수증 → 200 {}
                                                                                                │
                                                          5분마다 apm_trace_rollup (워터마크 하나·트랜잭션 하나·LAG 3분·lookback 2버킷)
                                                          ① 엣지(CLIENT/PRODUCER → SERVICE/QUEUE/DB/HTTP) ② 예외 그룹(시간대 재계산-대입) ③ DB 쿼리 그룹(apm_sql_norm)
                                                          ④ 외부 의존 ⑤ 메시징 5m(발행 짝 검증·소비 지연) ⑥ 배치 잡(job.name 규약·완료 시각 경로)
                                                                                                │
                                        조회: ApmSpanTree(고아=루트 승격·순환 끊기·비재귀) → 크리티컬 패스(자기 시간 합 최대 경로) → 워터폴/플레임/비교
                                              산점도(칸별 안정 정렬 다운샘플) · 맵(엣지 합산, env는 호출자만) · exemplar `stored` 배치 확인 · 원문은 ApmRawTextPolicy
```

**보강 D — §5.2 관문별 "왜 이 자리인가"(트레이스 행) (정본 06-data-path.md §5.2)**

| 관문 | 왜 여기인가 | 순서를 바꾸면 |
|---|---|---|
| tail 샘플링이 Collector에 | 트레이스가 끝나야 "오류였나·느렸나"를 안다. 그래서 게이트웨이 1대 | head 샘플링은 오류를 놓친다 |
| ⑤d `SLOW_INFERRED` | tail 프로세서는 어느 정책이 통과시켰는지 스팬에 안 적는다. 추정임을 **값 이름**이 말하게 | 주석에만 적으면 화면·문의가 모른다 |
| ⑥ advisory lock이 dedup **앞** | 같은 트레이스의 앞뒤가 두 배치로 동시에 오면 둘 다 "요약 없네" → 두 행. 잠글 행이 아직 없어 행 잠금은 불가 | 요약 2행 |
| ⑥ 요약 병합이 `ON CONFLICT`가 아니라 찾기→조건부 UPDATE | 더 이른 루트가 나중에 오면 `start_ts`가 내려가 **파티션이 바뀐다**(키가 달라진다) | 같은 트레이스가 두 행 |
| ⑥ 논리 키 `(trace_id, span_id)` dedup이 PK 앞 | PK에 `start_ts`가 들어가(PG 강제) 시각을 다시 찍은 재전송은 다른 키 | 중복 스팬 |
| 롤업 워터마크가 **하나**, 트랜잭션 **하나** | 넷을 따로 두면 "맵에는 있는데 에러 목록에는 없는 5분" | 도메인 간 불일치 |
| LAG 3분 + 자식 lookahead 5분 | SERVICE 엣지는 부모(CLIENT)·자식(SERVER) 스팬이 **둘 다** 있어야 성립하는데 다른 서비스·다른 배치로 온다. 대입이라 나중에 안 고쳐진다 | 서비스 호출이 HTTP 엣지로 굳는다 |
| 예외 롤업이 덧셈이 아니라 **시간대 재계산-대입** | 커밋 후 응답이 끊긴 at-least-once 재실행이 한 번 더 더한다 | 예외 건수 두 배 |
| 지문 정규화가 **PG 함수** | 롤업 SQL의 GROUP BY 키로 DB 안에서 바로 쓴다 | 스팬을 전부 끌어와 자바에서 그룹핑 |
| 산점도가 창 전체 `limit`이 아니라 **칸마다** `limit` + 안정 정렬 | 정렬 없는 limit은 비결정적 — 새로고침마다 그림이 다르고 뒤쪽 시간대가 통째로 빈다 | 신고할 수 없는 결함 |

**보강 E — §8.2 QA 수치에서 P2 행 (정본 13-verification.md §8.2)**

| 단계 | 결과 | 남은 것 |
|---|---|---|
| P2 QA(09-02, 2회차) | 1회차 15(HIGH 2) → 2회차 15/15 PASS + 신규 3(D17 800배) | 트레이스 비교 화면 없음·links 실데이터 0·BRIN 효용·대량 백필 잠금 |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `features/apm/core/contract_apm.md` · `_archive/features/apm/core/review_apm-p2-w2_codex.md` · `features/apm/core/contract_apm-read-api.md` · `_archive/features/apm/core/review_apm-p2-w3_codex.md` · `features/apm/core/e2e_apm-p2-qa.md` · `trace/ingest/ApmTraceWriter` · `trace/rollup/ApmTraceRollupService` · `trace/query/ApmSpanTree` · `service/deploy/ApmDeploymentDetector`
- 클래스·식별자: `SLOW_INFERRED` · `stored`
- 관련 분책: 이전 [07-p1-metrics.md](solutions--07-p1-metrics.md) · 다음 [09-permissions.md](solutions--09-permissions.md) · 목차 [00-index.md](solutions--00-index.md) · 용어 [14-glossary.md](solutions--14-glossary.md) · 출처 전체 [17-sources.md](solutions--17-sources.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| `tail_sampling` | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor |
| PostgreSQL 문서(상위) · 자원 설정 · WAL 설정 | https://www.postgresql.org/docs/current/ |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](solutions--17-sources.md) D.1.

