# R1 실측 — OTel Collector → BE OTLP http/json round-trip (2026-08-31)

- 대상: 설계서 `./devdesign_apm.md` §3.2 R1 · §10 R1/R11/R12 · WBS 0.1/0.14/1.9(Java만)
- 결론 한 줄: **`otlphttp encoding: json`이 metrics·traces·logs 세 경로 모두 동작한다(gzip 포함). protobuf 의존 없이 기존 JSON 파서 계열로 간다(Q3 회귀 없음).** 버전 고정: `otelcol-contrib 0.159.0` · `opentelemetry-javaagent 2.31.1`.
- 픽스처: `../_archive/data/apm-r1-fixtures/` (round1-explicit 54파일 · round2-exponential-delta 60파일). 하네스(캡처 서버·Collector yaml·기동 스크립트)는 scratchpad `r1/`(일회성).

## 1. 구성

```
moveseye-be-spring(:3001, dev 프로필, be.jar 사본) ─ -javaagent 2.31.1 ─ OTLP grpc :4317 ─► otelcol-contrib 0.159.0
   (receivers otlp + prometheus/self :8888, processors memory_limiter·resourcedetection·batch)
   ─ otlphttp encoding:json compression:gzip Bearer ─► 캡처 서버 :4400 (/apm/otlp/v1/{metrics,traces,logs})
```

| 항목 | 값 |
|---|---|
| Collector 설정 검증 | `otelcol-contrib validate` 통과. 🔴 `service.telemetry.metrics.address`는 0.159에서 **없어졌다** → `readers: [{pull: {exporter: {prometheus: {host, port}}}}]` 형식(설계서 §3.2 yaml 정정 필요) |
| Content-Type / Encoding | `application/json` / `gzip`. 압축률 ≈ 5~9배(28KB→4.5KB) |
| 경로 | exporter가 endpoint 뒤에 `/v1/metrics`·`/v1/traces`·`/v1/logs`를 스스로 붙인다 |
| 배치 크기 | metrics 15초분 ≈ 20~30KB(자바 에이전트 26메트릭) · Collector 자기 메트릭 ≈ 20KB(38메트릭) · traces 5~20KB · logs 2~7KB. **8MB 상한과 거리가 멀다** |

## 2. JSON 형식 — 파서가 받아야 하는 것 (실측)

### 2.1 공통
- enum은 **숫자**로 온다: `aggregationTemporality` 1=DELTA·2=CUMULATIVE, span `kind` 1=INTERNAL·2=SERVER·3=CLIENT, `status.code` 2=ERROR(미설정이면 `"status": {}`).
- 64비트 정수는 **문자열**: `count`, `bucketCounts[]`, `asInt`, `timeUnixNano`, `startTimeUnixNano`. `sum`·`min`·`max`·`explicitBounds[]`·`asDouble`은 숫자.
- 속성값은 `{"stringValue"|"intValue"|"doubleValue"|"boolValue"}` — 기존 `attributes()` 유틸 그대로.
- `resource.attributes`에 `service.name`·`service.instance.id`(에이전트가 UUID 생성)·`deployment.environment.name`·`host.name`·`process.*`·`os.*`·`telemetry.sdk.*`. `schemaUrl` 1.24.0.
- `scope.name`이 계측 라이브러리(`io.opentelemetry.tomcat-10.0`·`…jdbc`·`…hikaricp-3.0`·`…runtime-telemetry-java8`·`…lettuce-5.1`·`…spring-scheduling-3.1`) — 런타임 대응표(1.6)의 근거.

### 2.2 메트릭 — explicit histogram (round1)
```json
{"name":"http.server.request.duration","unit":"s","histogram":{"aggregationTemporality":2,"dataPoints":[{
  "attributes":[{"key":"http.request.method","value":{"stringValue":"GET"}},{"key":"http.response.status_code","value":{"intValue":"200"}},
                {"key":"http.route","value":{"stringValue":"/hosts/manage/{hostid}"}},{"key":"network.protocol.version","value":{"stringValue":"1.1"}},{"key":"url.scheme","value":{"stringValue":"http"}}],
  "startTimeUnixNano":"…","timeUnixNano":"…","count":"6","sum":0.29,
  "bucketCounts":["0","0","1","3","2","0","0","0","0","0","0","0","0","0","0"],
  "explicitBounds":[0.005,0.01,0.025,0.05,0.075,0.1,0.25,0.5,0.75,1,2.5,5,7.5,10],
  "exemplars":[{"filteredAttributes":[…],"timeUnixNano":"…","asDouble":0.04,"traceId":"aeb3…","spanId":"7bda…"}],
  "min":0.019,"max":0.29}]}}
```
- `bucketCounts.length == explicitBounds.length + 1`(마지막이 +∞ 버킷).
- ✅ **`http.server.request.duration`·`http.client.request.duration`의 경계 = 설계 정규 경계 14단과 동일** → 재버킷 없음.
- ⚠️ 경계가 다른 것: `db.client.operation.duration` **9단** `[0.001,0.005,0.01,0.05,0.1,0.5,1,5,10]`, `jvm.gc.duration` **4단** `[0.01,0.1,1,10]`, HikariCP `db.client.connection.{create,use,wait}_time` **ms 단위 15단** `[0,5,10,25,50,75,100,250,500,750,1000,2500,5000,7500,10000]`, body size 계열 15단(By). → 설계 §4.3 "정규 경계 재버킷"은 이 셋에 실제로 걸린다. **권고: 패밀리별 정규 경계를 실측 경계로 맞춘다**(`db_operation_s` 9단·`gc_s` 4단·`pool_ms` 15단) — 그러면 Java 에이전트 기본값에서는 재버킷이 0건이고, 다른 스택이 다른 경계를 보낼 때만 보간이 든다.
- ✅ **exemplar가 실린다**(traceId·spanId·값·시각). 🔴 `filteredAttributes`에 **원문이 들어온다**: `db.client.operation.duration`의 exemplar에 `db.query.text`(마스킹 전 SQL 리터럴 그대로 — `set_config('search_path', ?, false)`처럼 에이전트가 `?`로 바꾼 것도 있지만 Flyway 쿼리는 원문), HTTP exemplar에 `url.path`·`client.address`·`user_agent.original`·`network.peer.address`. → BE는 exemplar에서 **traceId·spanId·시각·값만** 취하고 `filteredAttributes`는 버린다. Collector `attributes/drop`은 데이터포인트 속성만 만지므로 exemplar 속성은 BE 절단이 최종 방어다(설계 §3.2·§4.3 보강).
- temporality: 기본 **CUMULATIVE**(에이전트 기본). `startTimeUnixNano`가 시리즈 시작(=프로세스 시작·리셋 지점)이라 1분 버킷은 **연속 두 점의 차분**으로 만든다(리셋 감지 = startTimeUnixNano 변경 또는 count 감소).

### 2.3 메트릭 — exponential histogram + DELTA (round2, `OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION=base2_exponential_bucket_histogram`, `…_TEMPORALITY_PREFERENCE=delta`)
```json
{"exponentialHistogram":{"aggregationTemporality":1,"dataPoints":[{"count":"5","sum":0.1256,"scale":7,
  "positive":{"offset":-730,"bucketCounts":["1","0",…,"1"]},"negative":{},"min":0.019,"max":0.0417,"exemplars":[…4]}]}}
```
- 히스토그램 7종 전부 exponential로 바뀐다(`http.*.duration`·`db.client.*`·`jvm.gc.duration`). `zeroCount`는 0이면 **필드 자체가 없다**(proto3 기본값 생략).
- 경계 변환식: 하한 = 2^(index / 2^scale), index = offset + i. scale 7이면 버킷당 비율 2^(1/128) ≈ 0.54% — 정규 경계로 접는 보간 오차는 무시할 수준.
- 🔴 DELTA 선호를 켜도 **UpDownCounter는 CUMULATIVE로 남는다**(스펙): `jvm.memory.*`·`jvm.thread.count`·`db.client.connection.count`·`http.server.active_requests`(round2에서 sum 2가 233건 남음). → 파서·적재는 **점(point)마다** temporality를 보고 갈라야 한다. 히스토그램·모노토닉 카운터만 DELTA 가정 금지.
- 설치 가이드 권고: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`를 **기본값으로 안내**(1분 버킷 적재가 차분 없이 단순해지고 재기동 리셋 문제가 사라진다). CUMULATIVE도 받는다(고객이 빠뜨려도 데이터를 잃지 않게).

### 2.4 R12(Java) — 자동계측 기본 조합에서 실제로 나오는 것
| 설계 §4.3 허용목록 | 실측 | 비고 |
|---|---|---|
| `http.server.request.duration` | ✅ route 템플릿(`/hosts/manage/{hostid}`·`/event/{id}`), status_code, method | 404는 route **`/**`**, 필터 체인에서 401로 끊긴 요청은 **`/*`** — 카디널리티는 안전하나 화면에서 "라우팅 전 거부"로 라벨링할 것. `error.type` 속성은 4xx에 안 붙는다(5xx/예외만) |
| `http.server.active_requests` | ✅ **experimental 플래그 없이도 나온다**(2.31.1 stable). sum·non-monotonic·CUMULATIVE. exemplar에 `asInt: -1` 같은 증감값이 실림 | 설계 §4.3·§14 "opt-in이라 보장 없음"은 **Java에서는 해소**. .NET/Node/Python은 여전히 R12 대상 |
| `http.client.request.duration` | ✅ (`http-url-connection` 스코프) `server.address`·status | |
| `jvm.memory.used/limit/committed`·`jvm.gc.duration`·`jvm.thread.count`·`jvm.cpu.recent_utilization`·`jvm.class.count` | ✅ 전부 + `jvm.cpu.time`·`jvm.cpu.count`·`jvm.memory.used_after_last_gc`·`jvm.class.loaded/unloaded` | `jvm.memory.*`는 sum(non-monotonic) — gauge가 아니다 |
| `db.client.connection.count/pending_requests/wait_time` | ✅ HikariCP: `db.client.connection.pool.name`(`localhost:5433/dmove`)·`state`(idle/used) + `max`·`idle.min`·`create_time`·`use_time` | 시간 계열 단위 **ms** |
| `db.client.operation.duration` | ✅ (`OTEL_SEMCONV_STABILITY_OPT_IN=database` 켠 상태) `db.system.name`·`db.namespace`·`db.query.summary`(`SELECT "public"."flyway_schema_history"` 꼴 요약)·`server.address/port` | 🔴 `db.query.summary`가 **테이블명까지 포함**해 카디널리티가 route보다 크다 — 허용 차원은 `db.system.name`+`db.namespace`+요약 첫 토큰(SELECT/UPDATE…)만. opt-in 없이는 구 이름(`db.system`)으로 올 수 있어 가이드에 이 env를 넣는다 |
| `process.cpu.utilization`·`process.memory.usage` | ❌ Java 에이전트는 안 냄(JVM 계열로 대체) | 비-JVM 런타임용 |
| 미허용이지만 오는 것 | `http.server.request.body.size`·`response.body.size`·`http.client.request.body.size`·`otlp.exporter.*`·`processedSpans/Logs`·`queueSize` | 폐기 카운터 대상 |

### 2.5 트레이스
- 스팬 507개 실측(kind CLIENT 318·INTERNAL 125·SERVER 64). 스코프: jdbc·spring-data·hibernate·tomcat·spring-scheduling·http-url-connection·lettuce.
- `exception` 이벤트 실림: `events[{name:"exception", attributes:[exception.type, exception.message, exception.stacktrace(전문, `\r\n`)]}]`, 해당 스팬 `status.code=2`. 스택트레이스는 수 KB → 4KB 절단 대상.
- `links`는 0건(동기 호출 앱이라 정상). 필드는 스펙대로 `links[]`.
- `parentSpanId`는 루트에서 **필드 없음**(빈 문자열이 아님). `flags` 259.
- 🔴 스팬 속성에 원문이 그대로: `db.query.text`(리터럴은 에이전트가 `?`로 치환하지만 Flyway·Hibernate DDL류는 원문), `url.path`, `user_agent.original`, `client.address`, `thread.name`. Collector `attributes/drop`·`transform/sql`·`redaction/pii`가 이 값들을 실제로 지우는지는 **R14(0.13)** 에서 확인.

### 2.6 로그
- 142건 중 **63건에 `traceId`·`spanId`**가 붙어 온다(요청 스레드에서 찍힌 로그) → M3 로그 상관의 근거 확보. `severityNumber`(9=INFO 등)·`severityText`·`body.stringValue`·`scope.name`=로거 이름.

### 2.7 Collector 자기 메트릭(`prometheus/self`)
- `otelcol_exporter_queue_size/capacity`·`otelcol_exporter_sent_*`·`otelcol_receiver_accepted/refused/failed_*`·`otelcol_process_uptime/cpu_seconds/memory_rss`·`otelcol_processor_batch_*` 등 38종이 **별도 resource**(`service.name=otelcol-contrib`, `service.instance.id`=Collector UUID, `service.version=0.159.0`)로 온다. → `apm_collector` 식별은 이 resource의 `service.instance.id`, 버전은 `service.version`. 이름은 `otelcol_` 접두(언더스코어)와 `otelcol.` 접두(점, resourcedetection 계열) 둘 다 있다 — 허용목록 정규식은 `^otelcol[._]`.
- 🔴 이 resource에는 `service.name=otelcol-contrib`가 있으므로 등록 엔진이 **서비스로 만들면 안 된다**(수집기로 분류).

## 3. R11 — BE 응답 코드별 Collector 동작 (otlphttp exporter, retry_on_failure enabled, 0.159.0)

캡처 서버를 각 코드로 45~60초 응답하게 두고 `collector.log`를 관찰했다.

| BE 응답 | Collector 판정 | 동작 | 우리 계약 |
|---|---|---|---|
| **401** | `Unauthenticated` → **Permanent error** | 즉시 폐기(`Exporting failed. Dropping data.`), 재시도 0 | 토큰 오류·회수. 설계 §4.1대로 |
| **403** | `PermissionDenied` → **Permanent error** | 즉시 폐기 | `Feature.APM` 미보유. 설계 v3.1 A6대로 — **만료 순간부터 손실** |
| **413** | `Unknown` → **Permanent error** | 즉시 폐기(분할 재전송 없음) | 8MB 상한 초과. 실측 배치는 수십 KB라 실제로는 안 걸린다 |
| **429** | `ResourceExhausted` → 재시도 | 백오프 재시도(간격 4~11초, 60초에 69요청) | 레이트리밋 쓸 때만 |
| **🔴 500** | `Unknown` → **Permanent error** | **즉시 폐기** — 60초에 31배치 전부 손실 | 🔴 **BE는 500을 절대 내면 안 된다.** OTLP/HTTP 스펙상 재시도 코드는 429·502·503·504뿐. 기존 `AiMonitorOtlpController`가 "적재 실패=500(exporter가 재시도)"이라고 주석까지 달아 둔 것은 **틀렸다** → 503으로 바꿔야 한다(별건 수정) |
| **503** | `Unavailable` → 재시도 | 백오프 재시도(45초에 32요청, 데이터 보존) | 일시 장애·DB 연결 실패·라이선스 만료(AI 모니터링 방식) |
| **200** | 성공 | 큐 비움 | |

**BE 수신 응답 계약(확정)**: 성공 200 `{}` · 형식 오류(JSON 파싱 실패·Content-Type 아님) **400/415**(폐기, 재시도 무의미) · 토큰 없음/불일치 **401** · 기능 미보유/만료 **403**(설계 P17) · 본문 상한 **413** · **적재 중 예외·DB 장애는 503**(재시도로 살린다) · 500 금지(전역 `GlobalExceptionHandler` catch-all이 500을 내지 않도록 OTLP 컨트롤러 안에서 전부 잡는다).

## 3.5 R14(Collector 측) — 마스킹 체인 실측 (설계 §3.2 프로세서 그대로, `../_archive/data/apm-r1-fixtures/collector-masked-0.159.0.yaml`)

| 프로세서 | 결과 |
|---|---|
| `attributes/drop`(url.full·url.query·user_agent.original·client.address·network.peer.address·`^http\.(request|response)\.header\..*`·enduser.id hash) | ✅ 스팬 460개에서 해당 키 **0건**. `url.path`는 남긴다(route 폴백·403 화면 표시용) — 경로에 ID가 들어가므로 P4 RUM처럼 `/\d+/`→`/{id}/` 정규화는 BE 몫 |
| `transform/sql`(리터럴·숫자 → `?`, truncate 4096) | ✅ `db.query.text` 241/241 클린(리터럴·숫자 잔존 0) |
| `redaction/pii`(주민번호·카드·이메일 패턴) | ⚠️ 설정은 통과했으나 **PII가 실린 샘플이 없어 미검증** — 0.13에서 PII 심은 요청으로 재확인 |
| `filter/metrics` 허용목록 | ✅ `http.*.body.size`·`otlp.exporter.*`·`processedSpans` 등 제거(`otelcol_processor_filter_datapoints_filtered` 46). ⚠️ `metrics/self` 파이프라인에는 필터가 없어 Prometheus 스크레이프 메타(`up`·`scrape_*`·`promhttp_*`)가 통과 → 템플릿의 `metrics/self`에도 `filter/self`(`^otelcol[._]`)를 건다 |
| **exemplar** | 🔴 **어느 프로세서도 exemplar `filteredAttributes`를 만지지 않는다** — `db.query.text` 75건(원문 SQL), `url.full` 17·`url.query` 11·`client.address`·`user_agent.original` 45건 그대로 통과. **BE에서 exemplar는 traceId·spanId·시각·값만 취하고 나머지 폐기가 유일한 방어**(§2.2 결론 확정) |


## 4. 설계서 반영 목록
1. §3.2 yaml: `service.telemetry.metrics.address` → `readers` 형식(0.159).
2. §4.3: 정규 경계를 패밀리 4종으로(`duration_s` 14단·`db_operation_s` 9단·`gc_s` 4단·`pool_ms` 15단) — Java 기본값과 일치시켜 재버킷 0.
3. §4.3: exemplar `filteredAttributes` **폐기**(원문 SQL·URL·IP 유입 경로).
4. §4.1: temporality는 **포인트 단위** 판정(UpDownCounter는 delta 선호에도 CUMULATIVE).
5. §14/§4.3: `http.server.active_requests` Java ✅ 확정(플래그 불필요). 나머지 스택 R12 유지.
6. §3.3 가이드 env 권고: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`, `OTEL_SEMCONV_STABILITY_OPT_IN=database`.
7. §4.2: `service.name=otelcol-contrib` resource는 Collector로 분류(서비스 등록 제외).
8. §4.3: `db.client.operation.duration` 허용 차원에서 `db.query.summary`는 첫 토큰만.
9. §3.2 yaml: `metrics/self` 파이프라인에도 `filter/self`(`^otelcol[._]`) 추가. exemplar 마스킹은 Collector로 불가 → BE 필수(§4.3).
