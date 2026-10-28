# §5 어떻게 — 데이터가 지나가는 길

> **MovesEye APM 종합 안내서** 분책 06/18 · 원본 절 **§5 (5.1~5.3)** · 마지막 갱신 **2026-09-17**(원본 `apm-handbook.md` 2026-09-14 작성분에 §5.3 라이브의 길을 P5 신설분으로 추가).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. 메트릭 한 점과 스팬 하나가 앱에서 화면·알람까지 어느 관문을 어떤 순서로 지나는지
> 2. 관문 하나하나가 왜 그 자리에 있는지(순서를 바꾸면 무엇이 조용히 틀리는지)
> 3. RUM이 어디서 갈라지는지(Collector 없이 BE 직접 수신)
> 4. 라이브(P5)가 저장의 길과 **어디서 갈라져 어디까지 아무것도 공유하지 않는지**, 어디서 유실될 수 있는지
>
> **전제 문서** — 이전 [05-menus-and-tabs.md](solutions--05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) · 다음 [07-p1-metrics.md](solutions--07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md). 용어는 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md). 라이브 전체 그림은 [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.3.
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 5. 어떻게 — 데이터가 지나가는 길

> 이 장을 읽으면: ① 메트릭 한 점과 스팬 하나가 앱에서 화면·알람까지 어느 관문을 어떤 순서로 지나는지, ② 관문 하나하나가 **왜 그 자리에** 있는지(순서를 바꾸면 무엇이 조용히 틀리는지), ③ RUM이 어디서 갈라지는지, ④ 라이브(P5)가 저장의 길과 어디서 갈라지는지 알게 된다.

### 5.1 메트릭의 길

```
 [고객 앱]                 [고객 망 — Collector 0.159.0]                      [MovesEye BE]                                  [화면·알람]
 -javaagent ──OTLP grpc──▶ receiver otlp                                       POST /apm/otlp/v1/metrics
  10~15초마다 export        ├ memory_limiter · resourcedetection(host.name)     ① 415/413/gzip 스트리밍 상한 8MB
                            ├ attributes/drop (url.full·query·UA·IP·헤더)       ② 401 토큰(sha256) → 403 용도(kind·scope) → 403 라이선스
                            ├ filter/metrics (허용 접두 정규식)                 ③ 400 JSON → 영수증 dedup 판정(본문 sha256)
                            ├ batch 5s/512                                      ④ OtlpMetricsReader — 깨진 것만 버림, 해석 안 함
                            └ exporter otlphttp json+gzip                       ⑤ MetricIngestor
                              · file_storage 디스크 큐 5000                        ⑤a 수집기 자기 메트릭 분리(service.name=otelcol*) → apm_collector + 센티널 service_id=0
                              · retry 429/502/503/504만                            ⑤b 서비스 귀속 ApmRegistrar (name,env) 정규화 → AUTO/APPROVE/ALLOWLIST · unknown_service 격리
                                                                                   ⑤c 허용목록 + 구 semconv 별칭 → 밖은 NOT_ALLOWLISTED 카운트
                                                                                   ⑤d 차원 정규화: 허용 키만·키 정렬·status_class 접기·route 500 상한 __other__ → dims_hash
                                                                                   ⑤e CUMULATIVE 차분(포인트 단위 temporality) · 첫 관측 규칙
                                                                                   ⑤f 정규 경계 재버킷(병합만) · exemplar traceId+값 한 쌍
                                                                                ⑥ ApmMetric1mStore UPSERT(덧셈) → apm_metric_1m ─┐
                                                                                ⑦ stored>0 이면 LiveBuffer.offer() (절대 안 던짐) │      ┌─ 10초 링 → SSE → 개요 "실시간"
                                                                                ⑧ 영수증 기록 → 200 {}                              │      │
                                                                                                                                    ▼      │
                                                          5분마다 apm_rollup: 1m ─(닫힌 버킷, LAG 2분, 워터마크)─▶ 5m ─▶ 1h   (대입 UPSERT)
                                                          매일 apm_partition_maintain(D+2 선생성) · apm_retention(DROP·숨김)
                                                                                                                                    │
                                        ┌───────────────────────────────────────────────────────────────────────────────────────────┘
                                        ▼ 조회 (ApmMetricStore · ApmResolution이 창 길이로 1m/5m/1h 선택)
                                        · 백분위 ApmPercentiles(버킷 선형 보간, min/max 클램프) · ApmHistogramMerger(경계 혼재→mixedBounds)
                                        · 상태 판정 ApmStatusJudge(UP/DEGRADED/DOWN/STALE/UNKNOWN) · 가용성(5m 기준선+1m 꼬리) · 권한 apm.view
                                        ▼
                                        화면: URL query 상태(useApmTimeRange) · 차트↔표 전환 · 배지(rebucketed/mixedBounds/__other__/sampled)
                                        알람: 5분마다 apm_alert_evaluate(1m 원본 집계) → history.push → Zabbix 트리거 → 고객 액션(Slack/Teams)
```

**화살표마다 "왜 이 자리인가"**

| 관문 | 왜 여기인가 | 순서를 바꾸면 |
|---|---|---|
| Collector의 마스킹이 exporter **앞** | 디스크 큐에 **마스킹 후** 데이터만 남게 | 큐 파일에 원문 SQL·IP가 남는다 |
| ①형식·크기가 ②인증보다 앞 | 토큰을 모르는 상대에게 파싱 비용을 안 든다. gzip은 풀면서 상한 초과 즉시 중단 | 압축 폭탄이 힙을 먹는다 |
| ③dedup 판정은 적재 **앞**, ⑧영수증 기록은 적재 **뒤** | 503으로 돌려보낸 배치의 재전송이 살아야 한다 | 재전송이 영수증에 걸려 조용히 버려진다 |
| ⑤a 수집기 분리가 ⑤b 등록 앞 | `service.name=otelcol-contrib`가 서비스로 등록되면 목록·알람·SLO 오염 | 유령 서비스 |
| ⑤d 정규화가 ⑤e 차분 앞 | 차분 키가 `(service, instance, metric, dims_hash)` — 정규화된 dims여야 같은 시계열 | route가 접히기 전 키로 차분해 시계열이 무한 분기 |
| ⑤f 재버킷은 **병합만** | 분할은 없는 분포를 지어낸다(p95 4.7초 사고) | 그럴듯하게 틀린 백분위 |
| ⑥ 1m UPSERT가 **덧셈** | 서로 다른 배치가 같은 분에 더해 넣는 구조. 중복 차단은 영수증의 몫 | (롤업처럼 대입이면) 늦은 배치가 앞 배치를 지운다 |
| ⑦ Live 훅이 ⑥ **뒤** + 절대 안 던짐 | 저장 실패(503) 배치를 링에 먼저 넣으면 재전송이 두 번 더해져 실시간 rps 2배. 훅이 던지면 저장된 배치가 503이 되어 1m이 두 배 | 실시간·저장 둘 다 오염 |
| 롤업이 **대입** + 닫힌 버킷만 + 워터마크 | 원본이 그대로 있는 재계산이라 몇 번 돌려도 같다. 열린 버킷을 접으면 값이 항상 작게 굳는다(대입이라 다시 안 접힌다). 1h는 5m 워터마크를 앞지르지 않는다 | 재실행 이중 계상 / "5분 전 트래픽이 줄었다" |
| 0행이면 워터마크를 **붙잡는다**(단 창이 `maxBuckets`에 잘렸거나 보존을 넘겼으면 전진) | 수집기가 끊겼다 재개하며 버퍼를 몰아 보내는 일이 흔하다 | 그 몫이 5m/1h에 영영 안 실린다 |
| 알람은 롤업이 아니라 **1m 원본** 집계 | 5m은 LAG만큼 늦어 가장 최근 창이 항상 비거나 반만 찬다 | 알람이 5분 늦거나 임계 미달로 안 울린다 |
| 값이 없으면 push도 판정도 **안 한다** | 요청 0건을 0%로 밀면 죽은 서비스가 가장 건강한 그래프 | STALE이 따로 잡는 분업이 무너진다 |
| `STALE`·`SLO_BURN`만 트리거 `>0` 고정 | "몇 분째 안 온다"·멀티윈도우 OR는 Zabbix 표현식으로 못 쓴다 → 판정은 우리, Zabbix는 배달 | 임계를 바꿀 때마다 트리거 수정 |

**더 보기**: `contract_apm.md` §2.4·§3·§5·§6.4 · `guides/apm-code-walkthrough.md` §2·§4·§6 · `premium/apm/collector/ingest/`·`core/batch/`.

### 5.2 트레이스·RUM의 길

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

 [고객의 고객 브라우저] 스니펫(OTel Web SDK 2.x + web-vitals)
     ──OPTIONS ?tokenId=7──▶ RumSecurityConfiguration 필터가 직접 preflight()  : Origin 정확 매칭·전역 100rps 큐·라이선스 → 204 / 전부 같은 403
     ──POST Bearer──────────▶ Content-Type/Encoding 검사(getParameter 전) → Content-Length>상한이면 안 읽고 413 → Bearer sha256 → tokenId 일치 → 토큰별 1초 창(429)
                              → RumParser(배치 4096·documentLoad=PV·web_vitals gauge=관측 1·CUMULATIVE 폐기) → 일 예산 차감 → RumSanitizer(path {id}·해시·국가 힌트·스택 형태 필터)
                              → RumStore 한 트랜잭션: 영수증 0행이면 skip · 세션 distinct · apm_rum_page_5m UPSERT(원소별 합) · timing·오류·스팬
                              → 200 {} 또는 partialSuccess.rejected*:"n"(문자열)
                              조회: 5분 표 직접(롤업 없음), CAP 50,000 최신 우선, p75·good/needs/poor(경계=임계) · 트레이스 상세에만 Browser 행 합류
```

**화살표마다 "왜 이 자리인가"**

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
| RUM preflight를 **필터가 직접** 처리 | Spring MVC 기본 CORS가 200을 먼저 주면 우리의 403·429가 사라진다 | 열거 방지·상한 무력화 |
| RUM Content-Type 검사가 `getParameter` **앞** | form-urlencoded로 오면 Tomcat이 토큰 상한과 무관하게 2MB까지 버퍼링 | 미인증 메모리 소모 |
| RUM 일 예산 차감이 저장 **앞** | 파싱 수신량 기준 — 재전송·중복도 차감(계약이 인정) | (뒤로 옮기면) 503 폭주가 예산을 안 먹는다 |
| RUM 영수증이 적재와 **같은 트랜잭션** | "저장됐는데 영수증이 없다"가 없다 → 재전송 판정이 정확 | 메트릭 경로처럼 앞/뒤 순서 함정 |
| RUM이 1m→롤업이 아니라 **5분 표 직접** | 질문이 "이 페이지 그룹의 p75"뿐, 인스턴스 축 없음, 보존 30일 | 원본 표·워터마크·롤업이 전부 필요 |

**더 보기**: `contract_apm.md` §7.3·§7.8 · `contract_apm-p4.md` §2·§3 · `guides/apm-code-walkthrough.md` §12~§14·§25~§26.

### 5.3 라이브의 길 — 저장과 완전히 다른 길(P5, 2026-09-17 신설)

🔴 **DB를 한 번도 거치지 않는다.** §5.1·§5.2는 결국 PostgreSQL에 눕는 길이고, 여기는 BE 한 프로세스의 **인메모리**에서 SSE로 흘러 나갔다가 15분 뒤 사라지는 길이다. 같은 Collector·같은 receiver에서 갈라지지만, 그 다음부터는 관문·큐·저장소를 **아무것도 공유하지 않는다**.

```text
 [앱] javaagent 2.31.1 ──OTLP/gRPC──▶ Collector 0.159.0 receiver otlp
                                        │
                                        ├──▶ traces (저장의 길 — §5.2. tail_sampling decision_wait 10s를 그대로 탄다)
                                        │     🔴 fan-out은 동기·비격리 — 앞단이 막히면 서로 영향을 준다(CPU·메모리 격리 없음)
                                        │
                                        └──▶ traces/live (라이브의 길 — tail 샘플링 **앞**에서 분기)
                                               ① filter              HTTP SERVER만 · 자기계측 제외
                                               ② transform/live-slim  keep_keys 5~7속성 + name/status/events/links/scope/schemaUrl 정리
                                                                      🔴 error_mode: ignore(propagate 금지 — 저장 분기 오염 방지)
                                               ③ redaction/live       허용 키의 **값**만 PII 패턴 검사
                                               ④ filter/live-safety(13조건)  정리 결과 위반 스팬 drop(비-속성 필드의 유일한 방어)
                                               ⑤ batch/live 1s(max 1,000)
                                               ⑥ otlp_http/moveseye-live  메모리 큐 5배치 · 재시도 없음
                                               ※ 실행줄에 --feature-gates=ottl.set.allowNil 필수(없으면 ②·④가 조용히 무시된다)
                                                        │
                                                        ▼
                              POST /apm/otlp-live/v1/traces (permitAll+수신 토큰, 🔴 기본 OFF)
                                   메타 스냅샷 캐시로 판정 — hot path **DB 0회**
                                        │
                                   dedup(traceId, spanId) 60초
                                        │
                                   1초 버킷 집계(전체 관측: count·오류 2축·slow·hist[15]·근사 p95) ← 통계는 여기서 확정
                                        │
                                   LiveSpanRing 907칸(15분) ── LiveSpanArena 45B 슬롯(초별 층화 reservoir가 표본만 깎는다)
                                        │
                                   GET /apm/live/spans/stream (SSE, 1초 tick)
                                        │
                                   화면: 실시간 관제 ?tab=active(요청 관제) · ?tab=xview(X-View)
```

**화살표마다 "왜 이 자리인가"**

| 관문 | 왜 여기인가 | 순서를 바꾸면 |
|---|---|---|
| tail 샘플링 **앞**에서 분기 | `traces/live`가 `decision_wait 10s`를 안 타는 것이 지연이 초 단위가 되는 유일한 이유 | 뒤에서 가르면 라이브도 10초를 기다리고 2% 샘플만 남아 X-View의 "전량 수신" 전제가 무너진다 |
| filter(HTTP SERVER만)를 정리보다 앞 | ✅ 실측 SERVER 비율 11.6% — 수신의 88%를 먼저 버려야 뒤 단계 비용이 준다 | 전체 스팬에 정리 문장을 돌리면 CPU가 그만큼 는다 |
| `keep_keys` 정리 → `redaction` → `filter/live-safety` 순서 | keep_keys는 **키만** 거른다. 값 안의 PII는 redaction이, 속성이 아닌 필드(`status.message`·`scope.name`·`schemaUrl`)는 live-safety가 막는다 | ✅ 순서를 어긴 v2 원문 실측에서 4종이 그대로 유출됐다 |
| `error_mode: ignore`(propagate 금지) | propagate면 fan-out이 오류를 receiver에 돌려주고 **저장 분기가 오염**된다 | ✅ 실측: SDK 503 재전송이 `apm_span` 중복 26,769건(고유의 300%)을 만들었다 |
| BE 라이브 수신 관문이 저장 관문과 아무것도 공유 안 함 | 라이브 hot path는 영수증(`apm_otlp_receipt`)도 파티션도 만지지 않는다 | 공유하면 라이브 장애가 저장을 503으로 만들고, 재전송이 저장을 두 배로 오염시킨다(§5.1 ⑦과 같은 함정) |
| 집계(전체 관측)와 표본(arena)을 분리 | 통계는 깎기 **전에** 확정되고 arena는 통계에 영향을 안 준다 | 표본에서 오류율을 내면 강조 계층(오류·느림만 담는 별도 예산) 때문에 오류율이 올라간다 |
| SSE 발행은 1초 tick이 끝난 **불변 상태 위에서만** | `seq`·`pointsRev`·`statsRev`·체크섬이 일관돼야 재접속이 안정된다 | 발행 중 변하는 상태를 흘리면 체크섬이 안 맞고 재접속이 반복된다 |

⚠️ **같은 스팬을 두 번 보내는 것이 이 설계의 비용이다.** SERVER 스팬 하나는 Collector에서 두 번 처리되고 두 번 export된다(하나는 저장용 원본, 하나는 슬림화된 라이브용). ✅ 실측 단가: 슬림 스팬 458 B·gzip 후 45 B/스팬. 실측 부하 천장 600 SERVER/초에서 하루 약 23.74 GB(gzip 2.33 GB)가 저장 전송량 **위에 추가로** 나간다 — 증가율은 실효 보존율(정상 스팬 중 저장에 남는 비율)에 따라 2%에서 +266%, 10%에서 +53%(SERVER 비율 11.6%·슬림 458B·저장 크기 1,000B 가정 기준).

🔴 **유실될 수 있는 지점 셋 — 어디서 새느냐에 따라 "손실"의 뜻이 다르다.**

| 지점 | 무엇이 쌓이나 | 넘치면 |
|---|---|---|
| **앱 SDK 배치 큐**(BSP) | export 전 스팬 버퍼(`OTEL_BSP_MAX_QUEUE_SIZE`) | 초과분은 SDK가 드롭 — Collector에 닿지도 않는다(§10.2의 "수신 대상" 자체가 아니다) |
| **Collector 라이브 익스포터 큐** | `otlp_http/moveseye-live` 메모리 큐 5배치 | 재시도 없이 버림(설계상 정상 — 저장 경로의 디스크 큐 5000·재시도와는 다른 정책) |
| **BE 연결(SSE) 큐** | 연결별 바이트 예산 안의 미전송 프레임 | 그 연결만 1/k로 솎아 보낸다(다른 연결은 영향 없음) |

**더 보기**: `designs/devdesign_apm-realtime.md` §2.1(그림·fan-out)·§2.2(yaml 정본)·§2.3(수신)·§2.4(arena·사전)·§2.5(SSE)·§5.1(전송량) · `contract_apm-p5-live.md` §2(이벤트 payload) · 전체 그림·"못 하는 것"·검증 판정은 [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.2~§10.5·§10.7 · DB를 안 쓰는 것의 감사 대상 밖 확인 = `analysis/audit_apm-db-performance.md`.

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `contract_apm.md` · `guides/apm-code-walkthrough.md` · `premium/apm/collector/ingest/` · `core/batch/` · `contract_apm-p4.md` · `designs/devdesign_apm-realtime.md` · `contract_apm-p5-live.md`
- 관련 분책: 이전 [05-menus-and-tabs.md](solutions--05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) · 다음 [07-p1-metrics.md](solutions--07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · P5 실시간 관제 [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) · 출처 전체 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

이 문서 본문에는 외부 URL을 직접 인용한 줄이 없다. 전체 목록은 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.

