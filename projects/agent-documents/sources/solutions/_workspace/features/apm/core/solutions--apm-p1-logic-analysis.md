# APM P1 로직 분석 — 구현된 코드가 실제로 어떻게 동작하는가

- 작성 2026-08-31. 대상 커밋 BE `3b67d01` · FE `223ae83`(둘 다 master). **읽기 전용 분석**(코드 수정 0).
- 독자: 이 코드를 처음 보는 BE/FE 개발자와 검수자. 설계서(`features/apm/core/devdesign_apm.md` v3.2)·계약서(`features/apm/core/contract_apm.md`, `features/apm/core/contract_apm-read-api.md`)가 "무엇을 하기로 했나"라면, 이 문서는 "코드가 실제로 무엇을 하나"다. 둘이 다르면 **코드가 기준**이고 그 차이를 §12에 적었다.
- 근거 표기: `파일:라인`. 추측은 "(추정)". 라인은 2026-08-31 파일 기준.
- 배경 자료: 설계서 v3.2 · 계약서 §1~§6 · 읽기 API 계약 §1~§8 · 실측 `verification/{r1_apm-collector-roundtrip, r10_apm-zabbix-history-push, e2e_apm-selfmonitoring}.md` · 검수 `features/apm/core/review_apm-p1.md`(§3 불안 16건·§6 코덱스 반영 4건·§7 추가분) · `_archive/features/apm/core/review_apm-p1_codex.md`.

**경로 약어**


| 약어                         | 실제 경로                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apm/`                     | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/`                                                       |
| `otel/`                    | `moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/`                                                              |
| `license/`                 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/license/`                                                           |
| `mig/`                     | `moveseye-be-spring/src/main/resources/db/migration/`                                                                    |
| `T/`                       | `moveseye-be-spring/src/test/java/com/dmove/moveseye/`                                                                   |
| `engine-api/…/history/`    | `moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/`                              |
| `engine-zabbix/…/history/` | `moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/`                           |
| FE 파일명만                    | `moveseyee_fe/src/` 아래(`pages/application-monitoring/**`, `hooks/`, `services/`, `types/`, `lib/echarts/`, `constants/`) |


---

## 0. 한 장 요약

**한 줄**: 고객 앱의 OTel javaagent → 고객 망 안 OTel Collector(json 변환·마스킹·필터·배치) → BE `POST /apm/otlp/v1/metrics`(Bearer 토큰) → 리더가 OTLP JSON을 포인트로 → 등록 엔진이 리소스를 서비스/인스턴스에 귀속 → 허용목록·차원 정규화·CUMULATIVE 차분 → `apm_metric_1m` 덧셈 UPSERT → 5분 배치가 5m/1h로 대입 롤업 → 조회 API가 SQL 컬럼 전개 벡터 합으로 p50/p95/p99·오류율·rps·Apdex·상태를 계산 → FE. 알람은 우리가 1m 원본으로 판정해 이벤트를 남기고, 배달만 Zabbix `history.push`(가상 호스트 트래퍼 아이템 + 우리 트리거)에 태운다.

```
[고객 앱] javaagent 2.31.1 ──OTLP grpc:4317──▶ [otelcol-contrib 0.159.0]  (collector-template.yaml)
                                               metrics: memory_limiter → resourcedetection → attributes/drop → filter/metrics → batch
                                               traces : … → redaction/pii → transform/sql → tail_sampling → batch   (P1 BE는 200+폐기)
                                               metrics/self: prometheus/self(:8888) → filter/self(^otelcol[._]) → batch   ← 수집기 자기 메트릭
                                                        │ otlphttp encoding:json gzip  Authorization: Bearer <토큰>
                                                        ▼
[BE] ApmOtlpController.receive()           415 → 크기(Content-Length·스트리밍 2MB/8MB·gzip 해제 8MB) → 401 → 403(직접 판정) → 신호 → 400 → dedup 판정
   │ MetricIngestPipeline.ingest()
   ▼
 OtlpMetricsReader.read()                   resource/scope/metric/dataPoint → OtlpMetricPoint (exponential→explicit, exemplar 4필드)
   │
 MetricIngestor.ingest()
   ① isCollectorSelfTelemetry ──▶ ApmCollectorStateService.record (apm_collector) + 센티널 행(service_id=0)
   ② ApmServiceResolver ── ApmRegistrar.resolve  (정규화·모드 3종·unknown_service·캐시·UNIQUE 경합)  → Service | Pending | Rejected | Unknown
   ③ ApmMetricAllowlist.find                     (21종 + ^otelcol[._])  → NOT_ALLOWLISTED
   ④ ApmDimsNormalizer.normalize                 (status_class 접기·db.operation 첫 토큰·route 500·canonical JSON→sha256)
   ⑤ CumulativeDeltaTracker.delta                (DELTA 통과·UpDown 미차분·CUMULATIVE 차분·리셋·첫 관측 120초)
   ⑥ ApmMetric1mStore.store                      (재버킷→bounds_id · 배치 내 PK 병합 · 파티션 ensure · 덧셈 UPSERT)
   └ ApmIngestDropStatRecorder                   (사유 8종 카운터, 10초/1000건 flush)
   ▼ 성공 → receipt 기록 → 200 {}    /   저장 0 + 예외 → 503 (exporter 재시도)   /   정책 미저장 → 200
[배치] apm_rollup(5분): 1m→5m→1h 대입 UPSERT, LAG 2분, 워터마크    apm_partition_maintain(00:30)    apm_retention(01:30)
[조회] ApmMetricStore(SQL 컬럼 전개 h1..h24) → ApmHistogramMerger → ApmPercentiles/ApmApdex/ApmStatusJudge/ApmAvailabilityService → Apm*QueryService → Controller → FE
[알람] apm_alert_evaluate(5분): 1m 원본 계산 → apm_alert_event open/resolve → ZabbixAlertBridge.pushAll(history.push) → Zabbix 트리거 → 고객 액션·미디어
       apm_alert_sync(02:00): 트리거 표현식 대조(drift) · 사라진 트리거 재생성 · NOT_SUPPORTED 사유
```

곁길 세 개는 각각 §5(수집기 센티널), §4.8(드롭 카운터), §8(알람)에서 다룬다.

---

## 1. 수신 계층 — `ApmOtlpController`

파일 `apm/collector/ingest/ApmOtlpController.java`(412줄). 세 엔드포인트(`/v1/metrics`·`/v1/traces`·`/v1/logs`, 각각 `…/v1/x/v1/x` 이중 경로도 매핑 `:147-153, 167-174, 179-186`)가 하나의 `receive()`로 위임한다(`:190-192`). 이중 경로 허용 이유: exporter가 endpoint 뒤에 신호 경로를 스스로 붙이므로 전체 경로를 적는 오설정이 흔하고, 404면 텔레메트리가 전량 손실된다(`:127-135, 373-382`).

### 1.1 판정 순서 (의사코드, `:190-327`)

```
[0] Content-Type이 application/json 아님            → 415 {error, hint}                     :197-204
[1] gzipped = Content-Encoding contains "gzip"       wireLimit = gzipped ? 2MB : 8MB          :211-212
    [1-a] Content-Length > wireLimit                 → 413 (한 바이트도 안 읽음)              :216-221
    [1-b] wire = readBounded(inputStream, wireLimit)  PayloadTooLarge→413 / IOException→400  :224-234
[2] payload = gzipped ? readBounded(GZIPInputStream, 8MB) : wire   초과→413 / 깨짐→400      :238-248, 341-348
[3] token = tokenService.authenticate(bearer)        없음/불일치/회수 → 401 (사유 미공개)     :250-255
[4] licenseProvider.current().allows(APM) 아니면     → 403                                   :257-265
[5] signal != METRICS → drop(SIGNAL_NOT_SUPPORTED 1건) + recent(0,1) → 200 {}               :269-275
[6] JSON 파싱 실패                                   → 400 {error:"malformed json"}           :277-285
[7] bodyHash = sha256(해제 후 본문); isDuplicate → 200 {} (적재 없음). 판정 예외는 WARN 후 진행 :287-298
[8] pipeline.ingest → receipt.record → recentTracker.record → 200 {}                        :300-320
    catch (Exception) → 503 {error:"ingest unavailable"}                                    :321-326
```

### 1.2 왜 그 순서인가


| 단계                 | 근거(코드 주석)                                                                                                                  | 위치                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 415 최우선            | OTel SDK 기본이 http/protobuf라 `OTEL_EXPORTER_OTLP_PROTOCOL` 빠뜨리면 여기 온다. 재시도해도 같으니 폐기가 맞다                                     | `:194-196`, 테스트 `T/premium/apm/collector/ingest/ApmOtlpControllerTest.java:326-333` |
| 크기가 인증보다 앞         | "인증 전에 임의 크기를 버퍼에 올리면 토큰을 모르는 상대도 서버를 넘어뜨린다" — 메모리 고갈 방어                                                                   | `:95-97, 208-210`                                                                   |
| Content-Length 선검사 | 없으면 "읽고 나서 재는" 옛 순서와 같아진다(코덱스 🔴1 반영)                                                                                      | `:214-215`                                                                          |
| gzip도 상한 스트림       | 압축률 실측 5~9배. 다 풀고 재면 이미 메모리를 다 썼다                                                                                          | `:236-237, 336-340`                                                                 |
| 403을 직접            | 인터셉터에 맡기면 200+body → 조용한 손실. exporter가 403을 즉시 폐기하는 것이 P17(만료 시 프리미엄 완전 차단)의 의도                                            | `:53-55, 257-259`                                                                   |
| 트레이스·로그 200        | 404·405는 영구 실패로 Collector 로그를 뒤덮어 **메트릭 문제를 가린다**. 카운터로 남겨 화면이 "2단계입니다"라고 답한다                                              | `:155-162`, `apm/collector/ingest/drop/ApmDropReason.java:63-71`                                   |
| dedup 판정 앞·영수증 뒤   | 뒤집으면 503 후 재시도가 영수증에 걸려 조용히 버려진다                                                                                           | `:287-288`, `apm/collector/ingest/receipt/ApmOtlpReceiptService.java:19-21`                           |
| 503, 절대 500 아님     | R11 실측: 500은 Permanent → 60초에 31배치 손실. 모든 예외를 클래스 안에서 잡아 전역 catch-all에 닿지 않게 한다. 같은 이유로 `consumes=`·`@RequestBody`를 쓰지 않는다 | `:71-73, 141-146, 322-323`                                                          |


### 1.3 응답 코드 ↔ Collector 동작 (R11 실측, Javadoc `:58-70`)


| 코드                          | 상황               | exporter                         |
| --------------------------- | ---------------- | -------------------------------- |
| 200 `{}`                    | 정상·중복·미지원 신호     | 큐 비움                             |
| 415 / 413 / 400 / 401 / 403 | 형식·크기·파싱·토큰·라이선스 | **즉시 폐기**(재시도는 429·502·503·504만) |
| 503                         | 적재 예외·DB 장애      | 백오프 재시도 → 살아난다                   |


오류 바디는 `{"error","hint"}` 자체 형식이고 OTLP `Status` 모양이 아니다(`:201-203`). `partialSuccess`는 만들지 않는다 — 일부 포인트를 버려도 200 `{}`.

### 1.4 크기 상한


| 상한      | 기본        | 설정 키                                | 위치         |
| ------- | --------- | ----------------------------------- | ---------- |
| 해제 후 본문 | 8,388,608 | `app.apm.otlp.max-body-bytes`       | `:92-100`  |
| 압축 회선   | 2,097,152 | `app.apm.otlp.max-compressed-bytes` | `:102-112` |


두 키는 `application*.yml`에 없어 코드 기본만 유효. 2MB는 압축률 5~9배 **추정**에서 나온 값(실측 아님, 검수 §6)이며 넘으면 exporter가 413을 재시도 없이 폐기한다. `readBounded`는 초기 버퍼 `min(limit, 64KB)`·8KB 청크로 읽고 초과 순간 throw(`:350-371`).

### 1.5 토큰 인증·dedup


| 항목           | 동작                                                                                        | 위치                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 해시           | `sha256Hex(plain)` 64자 hex, 접두 없음(`token_hash char(64)`라 `rcv:v1:` 71자는 컬럼 초과)            | `apm/collector/token/ApmReceiveTokenService.java:33-37, 122, 185`, `mig/V38__apm_p1.sql:110` |
| 대조           | `findByTokenHash` 인덱스 1회 → `MessageDigest.isEqual` 재확인 → `isRevoked`면 empty(로그엔 회수/모름 구분) | `:181-204`                                                                         |
| 만료           | **없다**. 회수(`revoked_at`)만                                                                 | `apm/core/domain/ApmReceiveToken.java:58-68`                                            |
| last_seen 절제 | 60초에 1회, 프로세스 로컬 맵, 실패 삼킴                                                                 | `:62-69, 206-221`                                                                  |
| dedup 키      | `(token_id, body_sha256)` UNIQUE, 해시는 **해제 후** 본문                                         | `mig/V38__apm_p1.sql:150-157`, 컨트롤러 `:278, 289`                                    |
| 영수증 기록       | `REQUIRES_NEW` + `saveAndFlush`, UNIQUE 위반은 debug — 수신은 성공 유지                             | `apm/collector/ingest/receipt/ApmOtlpReceiptService.java:43-57`                                      |
| 영수증 TTL      | `apm_retention` `receiptDays` 기본 2일                                                       | `apm/core/batch/retention/ApmRetentionJob.java:45-46`                                             |


`scopes`·`kind`는 수신에서 **검사하지 않는다**(`token.getId()`만 사용 `:251-255`) — §12.

### 1.6 `@LicenseExempt` + `FeatureInterceptor` + ArchUnit

인터셉터 등록 순서 `roles → mcp → visitorId → accessMode → feature`(`config/WebConfig.java:39-45`). OTLP 경로가 빠지는 길:

```
SecurityConfig: /apm/otlp/** permitAll                                config/SecurityConfig.java:78
AccessModeInterceptor: 메서드/클래스 @LicenseExempt → 통과            license/web/interceptor/AccessModeInterceptor.java:48-50
FeatureInterceptor:    메서드 @LicenseExempt → 통과 (2026-08-31 추가) license/web/interceptor/FeatureInterceptor.java:38-45
ApmOtlpController.receive(): allows(APM) 직접 → 403                   ApmOtlpController.java:260-265
```

- `allows(f) = state.allowsPremium() && features.contains(f)`, `allowsPremium = ACTIVE|EXPIRING|GRACE`(`license/domain/LicenseStatus.java:52-54`, `license/domain/state/LicenseState.java:65-68`) → EXPIRED·ARCHIVED·NONE·INVALID 전부 403 → **만료 순간부터 손실**(의도, P17).
- 🔴 대조: `AiMonitorOtlpController`는 `canWrite()`(FULL만) 아니면 **503**(`aimonitor/otel/AiMonitorOtlpController.java:173-176`). 두 수신기의 만료 정책이 다르다 — §12.

ArchUnit 규칙(`T/license/LicenseArchitectureTest.java`, `T/otel/OtelArchitectureTest.java`):


| 규칙       | 못박는 것                                                                                                                             | 위치                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 0.12-a   | `otel..`은 `aimonitor..`·`premium..`에 의존 안 함                                                                                       | Otel:41-52         |
| 0.12-b   | `premium..`은 `aimonitor..` 미참조(공유는 otel 승격으로만)                                                                                    | Otel:54-68         |
| A1       | premium 밖은 premium 미의존                                                                                                            | Lic:66-76          |
| A2       | premium의 모든 `@RestController`는 `@RequiresFeature`                                                                                 | Lic:78-89          |
| A3       | premium은 app(비-premium) `*Repository` 미참조(Spring Data 상속 제외 — 2차 정정)                                                              | Lic:91-112         |
| A4       | `@RequiresFeature` 메서드는 premium 밖에 없음                                                                                             | Lic:114-124        |
| A5       | `@LicenseExempt` 메서드는 `license..`·`auth..`에만. 예외 = `UserController` 3개 + `OTLP_RECEIVER_CLASSES`(AiMonitor·Apm)                   | Lic:51-55, 126-184 |
| **A5-c** | 허용 OTLP 클래스의 `@LicenseExempt` 메서드 **전부**가 `LicenseProvider.current()`에 닿는다(직접 또는 **같은 클래스 안 위임 1단계** `receive()`). 클래스마다 ≥1, 총 ≥2 | Lic:186-254        |
| A5-b     | 클래스 단위 `@LicenseExempt`는 `license..`·`auth..` + Internal 2개만                                                                      | Lic:256-284        |


A5가 메서드 이름을 안 적는 이유: metrics·traces·logs 추가 때 목록 갱신 마찰 → "허용은 클래스로, 검증은 메서드 전수로"(Lic:161-166). A5-c는 1단계 위임만 추적하므로 `receive → guard → licenseProvider`로 한 단계 더 쪼개면 테스트가 깨진다(리팩터링 주의). ⚠️ A5 주석(Lic:151-157)은 "`canWrite()` 후 503"이라 적혀 AI 모니터링 기준 — APM에는 부정확.

---

## 2. 리더 — `OtlpMetricsReader` · `OtlpMetricPoint` · `OtlpJson`

파일 `otel/metric/OtlpMetricsReader.java`(337), `otel/json/OtlpJson.java`(215), `otel/metric/OtlpMetricPoint.java`(85). 규칙 1 "깨진 노드는 그 노드만 버린다"(Reader `:38-40`, 메트릭 단위 try/catch `:80-87`).

### 2.1 JSON 표기 흔들림


| 흔들림                        | 처리                                                                                                                                                                                                | 위치                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 키 표기                       | **camelCase만**(`resourceMetrics`, `dataPoints`, `timeUnixNano`, `asInt`, `explicitBounds`, `bucketCounts`, `aggregationTemporality`, `isMonotonic`, `zeroCount`…). snake_case는 grep 0건 → 조용히 빈 결과 | Reader `:70-79, 101-105, 153-155, 201-202, 248-260`                                     |
| enum 숫자/이름                 | 1→DELTA, 2→CUMULATIVE, 그 외 UNSPECIFIED; 문자열은 대문자화 후 `contains`                                                                                                                                    | OtlpJson `:74-93`                                                                       |
| `asInt`/`asDouble`         | `asInt` 있으면 `BigDecimal(asText)`, 없으면 `asDouble` — asInt 우선                                                                                                                                       | OtlpJson `:95-107`                                                                      |
| 64비트 정수 문자열                | `count`·`bucketCounts`는 `longOf`(숫자면 asLong, 아니면 BigDecimal, 실패 0)                                                                                                                                | Reader `:320-336`                                                                       |
| `timeUnixNano` `"0"`/음수/없음 | `nanos <= 0 → null` → `timeOf()`가 `receivedAt`으로 폴백. `**timeUnixNano` 하나만** 폴백(startTime은 2순위로 안 씀 — 프로세스 시작 시각으로 몰림)                                                                             | OtlpJson `:146-181`, Reader `:150-155`, 테스트 `T/otel/metric/OtlpMetricsReaderTest.java:327-342` |
| attributes 평탄화             | `stringValue→intValue→doubleValue→boolValue` 순 첫 매치를 `asText()`; `arrayValue`·`kvlistValue`·`bytesValue` **무시**; 같은 키는 뒤가 덮음                                                                      | OtlpJson `:40-67`                                                                       |
| dp attributes가 배열 아님       | **그 포인트 버림**(차원 잃은 포인트가 다른 시계열에 섞이는 것 방지). 아예 없으면 빈 맵                                                                                                                                             | Reader `:178-197`                                                                       |
| 어떤 메서드도 던지지 않음             | 빈 값·0·null로 접음                                                                                                                                                                                    | OtlpJson `:31-33`                                                                       |


리소스 속성과 dp 속성은 **섞지 않는다**(리소스로 서비스·인스턴스, dp로 시계열 차원 — 합치면 `host.name`이 차원이 되어 카디널리티 폭발) (`otel/metric/OtlpResource.java:9-15`).

### 2.2 4종 컨테이너 (`readMetric` `:93-139`, 판정 순서 sum→gauge→histogram→exponentialHistogram→summary skip)


| 컨테이너                   | kind                                | temporality    | monotonic     | value              | count           | bounds/counts                                                                |
| ---------------------- | ----------------------------------- | -------------- | ------------- | ------------------ | --------------- | ---------------------------------------------------------------------------- |
| `sum`                  | SUM                                 | 컨테이너 값         | `isMonotonic` | `value(dp)`        | 0               | —                                                                            |
| `gauge`                | GAUGE                               | UNSPECIFIED 고정 | false         | `value(dp)`        | 0               | —                                                                            |
| `histogram`            | HISTOGRAM                           | 컨테이너 값         | false         | `histogramSum(dp)` | `longOf(count)` | `explicitBounds`/`bucketCounts`, `counts.length != bounds.length+1`이면 포인트 버림 |
| `exponentialHistogram` | **HISTOGRAM**(변환)                   | 컨테이너 값         | false         | 〃                  | 〃               | §2.3                                                                         |
| `summary`              | 읽지 않음(debug) — 분위수만 있고 버킷이 없어 롤업 불가 |                |               |                    |                 | `:132-137`, `otel/metric/OtlpMetricKind.java:12-13`                                 |


위치 `:107-130, 160-175, 199-223, 247-279`. `OtlpMetricKind`에 EXPONENTIAL이 없는 이유: 두 표현이 하류로 가면 백분위·롤업 계산이 두 벌 → "모든 행이 같은 bounds_id" 규약이 한 표현일 때만 성립(`OtlpMetricKind.java:6-10`).

### 2.3 exponential → explicit 변환 (`:225-279`)

```
scale  = dp.scale (기본 0);  offset = dp.positive.offset;  pos = dp.positive.bucketCounts
size > 4096 → 포인트 버림(WARN)                       :59, :254-258   // scale·offset은 외부 입력, 배열 길이를 믿으면 힙 고갈
negative.bucketCounts 있으면 WARN만, 무시                :259-263
step = 2^(-scale)                                       :267           // base = 2^(2^-scale), base^k = 2^(k·step)
bounds[i] = 2^((offset + i) · step)    i = 0..size      :268-271       // size+1개
counts[0] = zeroCount (부재면 0)                        :273-274       // (-∞, base^offset] — "0이었다"와 "아주 작았다"를 구분
counts[i+1] = pos[i]                                    :275-276
counts[size+1] = 0                                      :277           // +∞: exponential엔 넘침 개념이 없다
```

산출 규약은 explicit와 동일(`bounds n+1, counts n+2`). 실측 고정치: scale 7·offset −730·144버킷 → bounds 145·counts 146(`OtlpMetricsReaderTest.java:178-231`). 🔴 음수 버킷을 버리면서 `count`는 원값이라 `sum(counts) < count`가 될 수 있다(§12). 정규 경계로 접는 것은 리더가 아니라 **스토어**(§4.6) — `Math.pow` 산출 경계는 정규 경계와 비트 동일할 수 없어 exponential 입력은 **항상 재버킷**된다.

### 2.4 exemplar 축소 (`:284-302`, `otel/metric/OtlpExemplar.java`)

레코드 필드 4개만: `traceId, spanId, time, value`(`OtlpExemplar.java:23`; 테스트가 RecordComponent 이름을 검사 `OtlpMetricsReaderTest.java:104-108`). `filteredAttributes`는 자리 자체가 없다 — R14 실측에서 Collector의 어떤 프로세서도 exemplar 속성을 만지지 않아 원문 SQL·URL·IP가 실려 왔고, "BE에서 버리는 것이 유일한 방어선"(`OtlpExemplar.java:9-15`). 개수 제한 없음.

### 2.5 temporality가 포인트 단위인 이유

리더 규칙 3(`:43-45`)·`OtlpMetricPoint.java:27-29`: DELTA 선호를 켜도 UpDownCounter(`jvm.memory.*`·`http.server.active_requests`·`db.client.connection.count`)는 CUMULATIVE로 남는 것이 스펙(R1 §2.3). 배치 단위로 "이번 건 델타"라 가정하면 누적값을 증분으로 더해 수백 배가 된다. 실측 고정: 같은 배치에서 `http.server.request.duration`=DELTA, `jvm.memory.used`=CUMULATIVE·monotonic=false(`OtlpMetricsReaderTest.java:233-243`).

### 2.6 `ReceiveTokenService`(otel) vs `ApmReceiveTokenService`(premium)


|           | `otel/token/ReceiveTokenService.java`                                                                                                          | `apm/collector/token/ApmReceiveTokenService.java` |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 성격        | 도메인 색 없는 원시 함수(`generate` 32바이트→base64url 43자 `:32-42`, `hash`=`rcv:v1:`+sha256 `:44-47`, `sha256Hex` `:66-75`, `matches` 상수시간 `:49-64`) | 엔티티 생명주기 + 인증                           |
| APM이 쓰는 것 | `generate()`·`sha256Hex()`만(`hash()` 미사용 — char(64))                                                                                     | 발급·회수·`authenticate`·withConfig         |
| 컨트롤러      | `sha256Hex(text)`로 dedup 바디 해시(`ApmOtlpController.java:289`)                                                                             | `authenticate(bearer)`(`:251`)          |


의존 방향 premium→otel만(ArchUnit 0.12-a).

---

## 3. 등록 엔진 — `ApmRegistrar` · `Resolution`

파일 `apm/service/registry/auto/ApmRegistrar.java`(469), `Resolution.java`(80), `ApmRegistryWriter.java`(134), `apm/service/registry/auto/ApmNaming.java`(76).

### 3.1 정규화 (`ApmNaming.java`)


| 규칙         | 값                                                                                  | 위치                                       |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 순서         | trim → NFC → `toLowerCase(Locale.ROOT)` → 128자 절단                                  | `:38-51`                                 |
| 허용 문자      | 제한 없음(필터 코드 부재)                                                                    | `:38-51`                                 |
| null/공백    | `""`(NULL 금지 — UNIQUE 회피)                                                          | `:39-45`                                 |
| 저장         | 원문 `truncate()`(정규화 없이 128 절단), 비교만 정규화                                            | `:59-64`, `ApmRegistryWriter.java:52-58` |
| unknown 판정 | `normalize(name).startsWith("unknown_service")`                                    | `:73-75`                                 |
| env 키      | `deployment.environment.name`(신형) → `deployment.environment`(구형) → `""`            | `ApmRegistrar.java:64-66, 287-293`       |
| 인스턴스 id    | `service.instance.id` → `host.name` → `""`(null이면 PG UNIQUE 불성립 — V30 함정) → 255 절단 | `ApmRegistrar.java:275-291`              |


### 3.2 `resolve()` 의사코드 (`ApmRegistrar.java:100-157`)

```
rawName = attrs["service.name"]
if blank(rawName) || isUnknownService(rawName):  return UnknownService                :119-121   ← 모드 무관
nameNorm = normalize(rawName)
if OtlpResource.isCollectorName(nameNorm):       return Collector(instanceId, version)  :124-127   ← 모드 무관
envNorm  = normalize(resolveEnv(attrs))
existing = lookupService(nameNorm, envNorm)      # 캐시 → DB                             :133
if existing 없음:
    mode = settingService.registrationMode()     # apm_setting.registration_mode, 30초 캐시 :136
    APPROVE   → return enqueuePending(...)       # apm_pending_service upsert, 데이터 폐기 :137-139
    ALLOWLIST → return Rejected(...)             # 아무것도 안 만듦                        :140-143
    AUTO      → existing = createServiceRacefully(...)                                  :144
if cache[key].pendingApproval:                   return Pending(null, …)               :147-154   ← §12: 도달 불가
instance = resolveInstance(serviceId, instanceId, version, host)                        :156
return Service(serviceRef, instanceRef)                                                 :157
```

- **이미 등록된 서비스는 모드와 무관하게 저장**된다(`:133-138`).
- ALLOWLIST의 "사전 등록"은 `apm_service` 행 존재인데, 서비스를 만드는 코드는 AUTO 자동 생성과 APPROVE 승인 둘뿐(`ApmService.builder()` 사용처 2파일) → ALLOWLIST 전용 사전 등록 경로는 없다(추정: 모드를 잠시 바꿔 운용).
- 수집기 판정 규칙은 `otel/metric/OtlpResource.java:58-71` **한 곳**: `otelcol` 그 자체 또는 `otelcol`+`-`/`_`/`.`(`otelcolizer`는 서비스). 고객이 `otelcol-…`로 이름 지은 오탐은 감수 — 수집기가 서비스로 들어와 목록·알람을 오염시키는 쪽이 되돌리기 어렵다.
- 수집기 포인트는 평소 여기까지 오지 않는다 — `MetricIngestor` ①에서 먼저 갈라진다(§5).

### 3.3 `Resolution` (sealed, `Resolution.java:19-79`)


| 갈래                                          | 등록        | 저장      | drop 사유           |
| ------------------------------------------- | --------- | ------- | ----------------- |
| `Service(ApmServiceRef, ApmInstanceRef)`    | upsert 완료 | ✅       | —                 |
| `Collector(instanceId, version)`            | 분류만       | 자기 메트릭만 | —                 |
| `UnknownService(rawName, host, instanceId)` | ❌         | ❌       | `UNKNOWN_SERVICE` |
| `Pending(pendingId, name, env)`             | 대기열       | ❌       | `PENDING`         |
| `Rejected(name, env)`                       | ❌         | ❌       | `REJECTED`        |


sealed라 갈래가 늘면 소비자(`apm/collector/ingest/resolve/ApmRegistrarServiceResolver.java:58-97`)가 컴파일 에러. `Service`가 엔티티 아닌 참조값인 이유는 캐시 — 엔티티를 담으면 적중 시에도 로드가 필요해 캐시가 무의미(계약 §2.5).

### 3.4 캐시와 last_seen 절제 (`ApmRegistrar.java:69-88, 153-181, 332-395, 423-468`)


| 캐시              | 키                              | TTL | 상한                                              | 무효화                         |
| --------------- | ------------------------------ | --- | ----------------------------------------------- | --------------------------- |
| `serviceCache`  | `nameNorm + " " + envNorm`     | 10분 | 20,000 초과 시 통째 clear(그 상황은 인스턴스 ID가 매번 바뀌는 오설정) | `clearCache()` — 승인 API가 호출 |
| `instanceCache` | `serviceId + " " + instanceId` | 10분 | 20,000                                          | 동일                          |


- `SEEN_THROTTLE=60초`(`:70`): 캐시 히트 시 `now − lastTouchWritten < 60s`면 skip, CAS로 한 스레드만 UPDATE(`:332-343`). **버전·호스트가 바뀌면 절제 무시 즉시 쓰기**(`:345-360`) — 배포 직후 화면이 옛 버전을 보이면 "무엇을 배포했는지"를 못 믿는다.
- 대기열 `touchPending`은 절제 없음(배치·리소스마다 UPDATE, `:209-215`) — 의도적으로 캐시하지 않음.
- 캐시는 프로세스 로컬 — 다중 인스턴스에서 승인 후 다른 노드는 최대 10분 PENDING으로 버린다(§12).

### 3.5 UNIQUE 경합 회복 (`:190-204, 206-228, 254-261`, `ApmRegistryWriter.java:18-32, 48-49, 68-69, 82-83`)

```
try  created = writer.createService(...)              # REQUIRES_NEW 별도 빈·별도 트랜잭션
catch DataIntegrityViolationException e:
     winner = repo.findByNameNormAndEnvNorm(...).orElseThrow(() -> e)   # 재조회도 비면 원 예외
```

별도 빈이어야 하는 이유 둘: `REQUIRES_NEW`는 프록시를 거쳐야 먹고(자기 호출은 무시), UNIQUE 위반을 바깥 트랜잭션 안에서 잡으면 PG가 그 트랜잭션을 이미 중단시켜 재조회조차 실패한다. 실 PG 8스레드 경합 검증 `T/premium/apm/service/registry/auto/ApmRegistrarIT.java:87-150`.

### 3.6 승인·거절 API (`apm/service/registry/ApmRegistryService.java`)

approve: 없으면 `APM_PENDING_NOT_FOUND` → 같은 자연키 서비스 있으면 `APM_SERVICE_ALREADY_EXISTS`(대기 행은 남김) → `apm_service` 신규(state **ACTIVE**, `first_seen_at`=대기열 최초 관측) → 대기 행 삭제 → `registrar.clearCache()`(`:70-106`). reject는 대기 행 삭제만 — 영구 차단 아님(`:116-124`). `/unknown`은 `apm_ingest_drop_stat`의 `UNKNOWN_SERVICE` 행을 토큰 라벨과 합쳐 집계(`:126-146`).

---

## 4. 정규화·적재

조립 라인(`apm/collector/ingest/store/MetricIngestor.java:26-34`, `apm/collector/ingest/MetricIngestPipeline.java:25-30`): ① 수집기 분리 → ② 리졸버 → ③ 허용목록 → ④ dims 정규화 → ⑤ 차분 → ⑥ 적재. 🔴 **④가 ⑤보다 먼저**: 차분 키가 `dims_hash`라 정규화 전 속성으로 키를 만들면 `status_code=200`과 `201`이 다른 시리즈로 추적되어 같은 `2xx` 행에 두 시리즈의 증분이 섞인다(계약 §3).

### 4.1 허용목록 (`apm/collector/ingest/normalize/ApmMetricAllowlist.java:135-185`)

내부 이름 = OTel 이름 그대로. **단위 변환 없음**(s→ms는 조회 계층 `apm/core/metric/ApmHistBoundsCatalog.java:48-60`에서 `pool_ms`만 ×1, 나머지 ×1000).


| OTel 메트릭                                                                          | 성격                 | 보존 dims(정렬)                                             | 경계 패밀리           | 위치                       |
| --------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- | ---------------- | ------------------------ |
| `http.server.request.duration`                                                    | HISTOGRAM          | `http.request.method`, `http.route`, `status_class`(파생) | `duration_s`     | `:139-140`               |
| `http.server.active_requests`                                                     | UpDownCounter(미차분) | `http.request.method`                                   | —                | `:141-143`               |
| `http.client.request.duration`                                                    | HISTOGRAM          | `server.address`, `status_class`                        | `duration_s`     | `:146-148`               |
| `jvm.memory.used/.limit/.committed`                                               | non-monotonic SUM  | `jvm.memory.type`                                       | —                | `:151-154`               |
| `jvm.gc.duration`                                                                 | HISTOGRAM          | `jvm.gc.name`                                           | `gc_s`           | `:157`                   |
| `jvm.thread.count`·`jvm.cpu.recent_utilization`·`jvm.class.count`·`jvm.cpu.count` | gauge              | —                                                       | —                | `:158-161`               |
| `db.client.connection.count/.pending_requests/.max/.idle.min`                     | UpDown/gauge       | `db.client.connection.pool.name`, `.state`              | —                | `:165-169`               |
| `db.client.connection.wait_time/.use_time/.create_time`                           | HISTOGRAM(**ms**)  | `pool.name`                                             | `pool_ms`        | `:170-174`               |
| `db.client.operation.duration`                                                    | HISTOGRAM          | `db.namespace`, `db.operation`(파생), `db.system.name`    | `db_operation_s` | `:177-178`               |
| `process.cpu.utilization`·`process.memory.usage`                                  | gauge              | —                                                       | —                | `:181-182`(자바 에이전트는 안 냄) |
| `^otelcol[._]` 정규식                                                                | 임의                 | 수신 속성 전부, 12키 상한                                        | `observed`       | `:99-102, 209-211`       |


- 파생 함수: `statusClassOf` — `parseInt`, 100 미만·600 이상은 `""`, 그 외 `(code/100)+"xx"`(`:239-255`). `dbOperationOf` — 앞에서 연속 letter만 취해 대문자, 첫 글자가 letter 아니면 `""`(`:265-279`).
- kind는 표에 없다 — 차분 여부는 포인트의 `kind`/`monotonic`으로 런타임 판정(§4.4).
- 거부 고정(테스트 `T/premium/apm/collector/ingest/normalize/ApmMetricAllowlistTest.java:44-58`): `http.*.body.size`, `otlp.exporter.*`, `processedSpans`, `queueSize`, `up`, `scrape_*`, `promhttp_*`, `jvm.cpu.time`, `jvm.class.loaded`, `jvm.memory.used_after_last_gc`.

### 4.2 dims 정규화 (`apm/collector/ingest/normalize/ApmDimsNormalizer.java`)


| 규칙             | 내용                                                                      | 위치                                                   |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| 허용 외 키 제거      | `spec.dimKeys()`만 TreeMap에 담음. **없는 키는 빼지 않고 `""`**(빼면 같은 엔드포인트가 둘로 보임) | `:34-36, 135-144`                                    |
| status_class   | `http.response.status_code` → `statusClassOf`                           | `:161-162`                                           |
| db.operation   | `db.query.summary` 첫 토큰 → 빈 값이면 `db.operation.name` 폴백                  | `:163-168`                                           |
| 값 sanitize     | trim → NFC → 256자 절단. **소문자화 없음**(route·pool 이름은 대소문자가 의미)              | `:57-58, 184-194`                                    |
| canonical JSON | TreeMap(키 정렬) → Jackson `writeValueAsString`(직접 이스케이프 금지), 실패 시 `"{}"`  | `:313-324`                                           |
| dims_hash      | `sha256Hex(json)` 64자. `sha256Hex("{}")=44136fa3…ff8a` 회귀 고정            | `:326-340`, 테스트 `ApmDimsNormalizerTest.java:170-174` |


**route 상한**(`:38-51, 196-300`): 대상은 `spec.carriesRoute()`(현재 `http.server.request.duration` 하나). `routeLimit` 기본 500, `apm_setting.route_limit`을 배치마다 `MetricIngestPipeline.syncRouteLimit`이 반영(`apm/collector/ingest/MetricIngestPipeline.java:98-109`). 구조는 `routesByService: synchronizedMap(LinkedHashMap accessOrder)` — **바깥 맵(서비스 512개)만 LRU**, 안쪽 `RouteSet`은 `admit()`이 "있으면 true / size ≥ limit면 false / 아니면 add"(`:273-300`). 즉 **선착순 고정**이지 LRU가 아니다 — LRU면 시간이 지나며 시계열이 무제한이 된다(`:45-47`). 초과 route는 `__other__`로 치환 + `ROUTE_OVERFLOW`(저장은 됨). **워밍**: 재기동 시 서비스별 첫 조회 1회 `apm_metric_1m` 최근 1일 `distinct dims->>'http.route'`를 상한까지 읽어 채움(JDBC 1쿼리, 실패해도 빈 집합, `:211-247`). 상한을 줄여도 이미 담긴 route는 소급 폐기하지 않음(`:79-81`).

### 4.3 `CumulativeDeltaTracker` (`apm/collector/ingest/normalize/CumulativeDeltaTracker.java`)


| 항목           | 값                                                                                                                                           | 위치                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 키            | `(serviceId, instanceId, metric, dimsHash)` — 버킷은 키에 없다(차분은 버킷을 가로지름)                                                                       | `:89-95`                                                                   |
| `needsDelta` | HISTOGRAM → true; SUM ∧ monotonic → true; **GAUGE·UpDownCounter → false**(그 시각의 값)                                                          | `:121-130`                                                                 |
| DELTA        | 상태 기억 없이 통과                                                                                                                                 | `:143-148`                                                                 |
| 첫 관측         | `startTime != null && time − startTime < 120s`면 누적값 통째 채택(기동 직후 첫 1분 보존), 그 외 **폐기**(`CUMULATIVE_FIRST_SKIPPED`). 어느 쪽이든 현재 값은 기억 → 다음부터 차분 | `:68, 156-178`; 경계 119 채택·120 폐기 `CumulativeDeltaTrackerTest.java:227-236` |
| 리셋           | `startTime` 변경 ∨ count/value 감소 ∨ 버킷 길이 변경 → 현재 값 통째로 증분                                                                                    | `:159-164, 187-197, 248-250`                                               |
| 정상 차분        | count·value·버킷 원소별 차, 각 `max(0, …)`                                                                                                         | `:252-265`                                                                 |
| 만료           | `ENTRY_TTL=30분`, `delta()` 호출 시 1분 간격 CAS sweep. **개수 상한 없음**                                                                               | `:71-74, 199-226`                                                          |


실측상 HTTP 히스토그램의 `startTime`은 첫 요청 시점이라 첫 배치에서도 통째로 받아지고, JVM 계열(프로세스 시작)만 첫 관측이 버려진다(계약 §3).

### 4.4 `MetricIngestor` — 포인트 → 1m 행

```
toRow(tokenId, serviceId, instanceId, point):                             MetricIngestor.java:265-298
  spec = Allowlist.find(metric)  없으면 NOT_ALLOWLISTED
  dims = normalizer.normalize(serviceId, spec, attrs); routeFolded → ROUTE_OVERFLOW("metric@svc:<id>")
  values = valuesOf(point)  null → CUMULATIVE_FIRST_SKIPPED
  bucket = LocalDateTime.ofInstant(time, systemDefault).truncatedTo(MINUTES)   ApmMetric1mStore.java:146-148
  Row(…, count, sum, min, max, bounds(수신 그대로), bucketCounts(증분), exemplarTraceId)
```

`bucket_start`가 **시스템 TZ**인 이유: 파티션 날짜(`ApmPartitionService.ensureAhead`의 `LocalDate.now()`)와 축을 맞추기 위함 — 여기만 UTC면 자정 부근 수신이 "아직 없는 파티션"을 찾는다(`ApmMetric1mStore.java:140-145`).

**집계 정의 — 한 행에 두 종류의 값이 산다**(`MetricIngestor.java:304-333`, `ApmMetric1mStore.java:34-45`):


| 포인트                 | `count`            | `sum`      | `min`/`max`                                      | `hist_counts` | 정본                                                        |
| ------------------- | ------------------ | ---------- | ------------------------------------------------ | ------------- | --------------------------------------------------------- |
| HISTOGRAM(증분)       | Δ관측 수              | Δ합         | `point.min/max` — ⚠️ CUMULATIVE면 시리즈 전체 값(차분 불가) | Δ벡터           | count·sum·hist_counts                                     |
| 모노토닉 카운터(증분)        | `Math.round(Δsum)` | **Δvalue** | null                                             | null          | `**sum**` — `jvm.cpu.time` 같은 실수 카운터에서 count는 반올림 산물      |
| GAUGE·UpDownCounter | **1**(샘플 수)        | 값          | 값                                                | null          | `**sum/count`(평균)·min·max** — sum만 읽으면 "샘플이 많을수록 커지는" 그래프 |


exemplar는 `linksToTrace()`인 것 중 **값이 가장 큰**(가장 느린) traceId(`:335-355`).

### 4.5 예외 흡수 경계 (`MetricIngestor.ingest` `:97-152`)


| 상황                                               | 처리                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 허용목록 밖·route 접힘·첫 관측                             | 포인트 단위 카운트, 계속(`:267-291`)                                                                                                                                                          |
| 리졸버 `Optional.empty()`(PENDING/REJECTED/UNKNOWN) | 리소스별 1회 판정 캐시, 포인트 단위 카운트, `failed=false`(`:166-193, 202-243`)                                                                                                                      |
| 리졸버 **예외**                                       | WARN, 포인트 버림, `resolverFailures++`(`:218-229`)                                                                                                                                      |
| `collectorState.record` 예외                       | WARN, 계속(`:111-118`)                                                                                                                                                                |
| `store.store` 예외                                 | 잡아 두고 판정(`:124-131`)                                                                                                                                                                |
| **판정**                                           | `faulted = resolverFailures>0 ∨ storeFailure`. `faulted ∧ stored==0` → `ApmIngestUnavailableException`(503). `faulted ∧ stored>0` → WARN + **200**(재전송 시 1m 덧셈으로 이중 계산)(`:133-150`) |


컨트롤러는 적재 단계의 `catch (Exception e)` 전체를 503으로 돌린다(`ApmOtlpController.java:321-326`) — 코드 버그(NPE)도 503 재시도 루프가 된다(§12).

### 4.6 `ApmMetric1mStore` — 재버킷·bounds_id·병합·UPSERT

**재버킷·bounds_id**(`apm/collector/ingest/store/ApmMetric1mStore.java:241-263`):

```
canonical = CanonicalBounds.familyFor(metric)     otel/histogram/CanonicalBounds.java:72-94  (pool_ms → db_operation_s → gc_s → duration_s → null)
effective = canonical ?? row.bounds               # 매핑 없으면 원본 경계("observed")
if canonical == null || sameBounds(row.bounds, canonical): counts = 복사(오차 0)
else: counts = HistogramRebucketer.rebucket(...); REBUCKETED 카운트
boundsId = boundsIdFor(effective)                 # 캐시 → SELECT → INSERT ON CONFLICT DO NOTHING → SELECT; 실패 시 null(배치 안 죽임) :272-320
```

정본 경계(`CanonicalBounds.java:29-45`): `DURATION_S` 14단 `0.005…10` · `DB_OPERATION_S` 9단 `0.001…10` · `GC_S` 4단 `0.01,0.1,1,10` · `POOL_MS` 15단 `0,5,…,10000`(ms). Java 2.31.1 실측 경계와 일치시켜 기본 조합에서 재버킷 0건(`:8-16`). `familyFor`가 pool을 먼저 보는 이유는 `db.` 접두 공유(`:78-79`). `sameBounds`는 `Arrays.equals` 비트 동일(허용오차를 두면 "거의 같은" 다른 경계를 섞는다 `HistogramRebucketer.java:30-39`).

`**HistogramRebucketer.rebucket**`(`otel/histogram/HistogramRebucketer.java:56-90`): 소스 유한 버킷 `[lo,hi)`(첫 버킷 하한 0)의 count를 목적 버킷과의 겹침 비율로 **균등 분포 가정** 선형 배분(`spread` `:93-108`), 소스 +∞는 목적 +∞로 통째(위로 퍼뜨리지 않음 — "없는 정보를 지어내 백분위를 좋게 만드는 것은 관측 도구 최악의 거짓말" `:44-47`), 총 count는 **최대잔여법**으로 정확 보존(`roundPreservingTotal` `:126-168`). 실측 고정: 표본 17은 p95 상대오차 &lt;5%, 표본 6은 &gt;50%("고쳐야 할 버그로 읽지 말 것", `T/otel/histogram/HistogramRebucketerTest.java:118-155`).

**같은 배치 PK 병합**(`ApmMetric1mStore.store` `:158-188`, `Accumulator` `:373-436`): `PkKey(serviceId, instanceId, metric, dimsHash, bucketStart)`로 count 합·sum 합·min/max·exemplar 첫 값, `hist_counts`는 길이·boundsId가 같을 때만 원소 합(다르면 뒤엣것 폐기 + WARN). 반환값이 `stored`(고유 PK 수) — `stored < accepted`는 정상.

**UPSERT SQL**(`:69-83`):

```sql
insert into apm_metric_1m (service_id, instance_id, metric, dims_hash, bucket_start, dims, count, sum, min, max, hist_counts, bounds_id, exemplar_trace_id)
values (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?::int[], ?, ?)
on conflict (service_id, instance_id, metric, dims_hash, bucket_start) do update set
    count             = apm_metric_1m.count + excluded.count,
    sum               = coalesce(apm_metric_1m.sum, 0) + coalesce(excluded.sum, 0),
    min               = least(apm_metric_1m.min, excluded.min),
    max               = greatest(apm_metric_1m.max, excluded.max),
    hist_counts       = apm_int_array_add(apm_metric_1m.hist_counts, excluded.hist_counts),
    bounds_id         = coalesce(apm_metric_1m.bounds_id, excluded.bounds_id),
    exemplar_trace_id = coalesce(excluded.exemplar_trace_id, apm_metric_1m.exemplar_trace_id)
```

- **멱등이 아니다** — 같은 배치를 두 번 넣으면 두 배. 중복 차단은 영수증 dedup의 몫(`:47-51`, `ApmMetric1mStoreIT.java:87-106`).
- 파티션 ensure는 UPSERT 직전 병합 키들의 날짜마다(`:173, 190-198`). DEFAULT 파티션이 없어 안 부르면 배치 통째 실패.
- 배치 크기 상한 없음(고유 PK 전부 `batchUpdate` 1회 `:175-187`). `@Transactional` 없음(JdbcTemplate 자동 커밋).
- `hist_counts integer[]`는 `Integer.MAX_VALUE`로 클램프(`:60-67, 322-333`).

`apm_int_array_add`(`mig/V38__apm_p1.sql:473-489`, `LANGUAGE sql IMMUTABLE`, **STRICT 아님**):

```sql
CASE WHEN a IS NULL THEN b WHEN b IS NULL THEN a
     ELSE (SELECT array_agg(COALESCE(a[i],0)+COALESCE(b[i],0) ORDER BY i)
             FROM generate_series(1, GREATEST(COALESCE(array_length(a,1),0), COALESCE(array_length(b,1),0))) AS i) END
```

길이가 다르면 **긴 쪽 기준**(짧게 자르면 꼬리 버킷이 사라져 p99가 좋아 보인다).

### 4.7 `ApmPartitionService` (`apm/core/batch/partition/ApmPartitionService.java`)

이름 `<table>_p<yyyyMMdd>`(`:50, 178-181`), 범위 `FROM (day) TO (day+1)`(`:89-90`), 대상 화이트리스트 3테이블(`:44-48, 208-216`). `ensurePartition`: 프로세스 캐시 → `pg_class` → `CREATE TABLE IF NOT EXISTS … PARTITION OF` → 예외 시 재확인(남이 만들었으면 성공)(`:74-105`). 선생성 `ensureAhead(n)` 오늘~~D+n × 3테이블(`:115-126`). V38 초기분은 오늘−1~~+2(`mig/V38__apm_p1.sql:293-308`). DEFAULT 파티션은 의도적으로 없음(있으면 DROP 정리 불가, `:22-25`).

### 4.8 드롭 카운터 (`apm/collector/ingest/drop/ApmIngestDropStatRecorder.java`, `ApmDropReason.java`)


| 사유                         | 뜻                                | 저장    |
| -------------------------- | -------------------------------- | ----- |
| `NOT_ALLOWLISTED`          | 허용목록 밖(이름별 카운트 = 확장 근거)          | ❌     |
| `ROUTE_OVERFLOW`           | route 상한 → `__other__`           | ✅(변형) |
| `REBUCKETED`               | 정규 경계 재버킷                        | ✅(변형) |
| `UNKNOWN_SERVICE`          | 이름 없음·unknown_service·리졸버 사유 미상  | ❌     |
| `PENDING`                  | APPROVE 대기                       | ❌     |
| `REJECTED`                 | ALLOWLIST 미등록(구명 NOT_REGISTERED) | ❌     |
| `SIGNAL_NOT_SUPPORTED`     | 트레이스·로그(배치 1건 단위)                | ❌     |
| `CUMULATIVE_FIRST_SKIPPED` | 첫 관측 폐기                          | ❌     |


키 `(tokenId, reason, metricName)`(null→`""`, 128 절단, `:63-68, 145-154`) — **시간축 없음**, 한 행 누적 + `last_seen_at`. 메모리 누적 → `≥1000건` 또는 `≥10초`면 **record 호출 스레드가 동기 flush**(`:63-75`), `@PreDestroy` flush(`:89-90`), 실패 시 되돌려 넣고 예외 안 던짐(`:95-137`). UPSERT `count = count + excluded.count`(`:41-47`). `ROUTE_OVERFLOW`만 `metric_name`에 `@svc:<serviceId>` 접미(`apm/collector/ingest/drop/ApmDropMetricKey.java:34-53`) — UUID(36자) 대신 숫자 id인 이유는 `varchar(128)` UNIQUE 절단 충돌(읽기 계약 §8.2-2). enum 이름은 `varchar(32)` 초과 금지(테스트 강제).

---

## 5. 수집기 상태 — `ApmCollectorStateService` · 센티널

- 판정: `OtlpMetricPoint.isCollectorSelfTelemetry()`(resource `service.name`이 `otelcol` 규칙). `MetricIngestor.ingest` ①에서 먼저 분리(`MetricIngestor.java:104-109`) → `collectorState.record(tokenId, selfPoints)`(실패해도 계속 `:111-118`) → `buildCollectorRows`가 `service_id = SENTINEL_SERVICE_ID(0)`, `instance_id = instanceIdOf(resource)`로 1m 행 생성(`:251-262`). 리졸버까지 오면 WARN + UNKNOWN_SERVICE(`ApmRegistrarServiceResolver.java:91-96`).
- `apm_collector` upsert(UNIQUE `(token_id, collector_instance_id)`, `apm/collector/state/ApmCollectorStateService.java:84-95, 112-134`):


| 컬럼                       | 원천(소문자 비교)                                                       | 집계                  |
| ------------------------ | ---------------------------------------------------------------- | ------------------- |
| `collector_instance_id`  | `service.instance.id` → `host:<host.name>` → `unknown-collector` | `:142-152`          |
| `version`                | `service.version`                                                | `:154-156`          |
| `queue_size`             | `otelcol_exporter_queue_size`(equals)                            | 합→round→int         |
| `send_failed_total`      | `otelcol_exporter_send_failed*`(startsWith)                      | 합(**누적값 그대로**)      |
| `sampling_dropped_total` | `otelcol_processor_tail_sampling*` ∧ `dropped`                   | 합                   |
| `last_seen_at`           | 포인트 time 최댓값(시스템 TZ)                                             | `:173-175, 192-194` |


값이 안 온 항목은 **건드리지 않는다**(`apm/core/domain/ApmCollector.java:71-87`) — 0으로 채우면 "실패 0건"이라는 틀린 안심.

- 센티널 0의 근거: `apm_service.id`는 bigserial(1부터). 별도 테이블 없이 파티션·롤업·보존이 그대로 적용된다. **조회 규약**: 서비스 질의는 `service_id > 0` 또는 명시 `= ?`(`:41-51`) — §7.3.
- UP/STALE 판정은 여기 없고 조회 계층(`apm/collector/state/ApmCollectorQueryService.java:75-87`)이 `stale_minutes`와 비교한다. 시계열 `ApmCollectorMetricStore.series`는 **1m만**(instance 축이 1m에만) `service_id=0 and instance_id=?`, 칸 = `floor(extract(epoch from (bucket_start − from))/cell)`, 카운터 `sum(sum)`·큐 `max(max)`, 없는 값 null(`apm/collector/state/ApmCollectorMetricStore.java:19-30, 58-116`).
- 자기 메트릭이 **일반 메트릭과 같은 토큰·같은 EP**로 오므로(템플릿 `metrics/self` → `otlphttp/moveseye`) 토큰 회수 시 수집기 상태 갱신도 함께 끊긴다.

---

## 6. 배치 — 롤업·파티션·보존

스케줄러 프레임(`scheduler/SchedulerJob.java:22-51`): `jobKey()`·`run(setting)`·`default requiresActiveLicense()=true`. `SchedulerManager`는 `scheduler_setting` 시드와 빈을 `jobKey`로 짝짓고(다르면 경고 후 **등록 안 함** — 배치가 "존재하지 않는" 상태), interval은 fixedDelay, `requiresActiveLicense`면 `canWrite()` 필요(`scheduler/SchedulerManager.java:53-73, 122, 191-216`).


| job_key                  | 클래스                       | 주기          | options                                                                                                      | `requiresActiveLicense` | 이유                                                                             |
| ------------------------ | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| `apm_rollup`             | `ApmRollupJob`            | interval 5분 | `maxBuckets5m`(288)·`maxBuckets1h`(48) — 시드엔 없음                                                              | **true**(기본)            | 정리가 아니라 가공. 원본 1m이 있으니 복구 시 워터마크부터 이어 접는다(`apm/core/batch/rollup/ApmRollupJob.java:18-21`) |
| `apm_partition_maintain` | `ApmPartitionMaintainJob` | daily 00:30 | `aheadDays`(2)                                                                                               | **false**               | 선생성이 멈추면 라이선스 복구 순간 수신이 통째로 실패(`ApmPartitionMaintainJob.java:19-21, 58-62`)    |
| `apm_retention`          | `ApmRetentionJob`         | daily 01:30 | `raw1mDays`7·`rollup5mDays`30·`rollup1hDays`400·`instanceIdleDays`30·`dropStatDays`30·`receiptDays`2(시드엔 없음) | **false**               | 만료돼도 디스크는 찬다(`ApmRetentionJob.java:32, 87-91`)                                 |


시드 `mig/V38__apm_p1.sql:451-456`, `ApmBatchJobTest.jobKeysMatchSeed`가 고정. 보존 일수의 출처는 `apm_retention` options 한 곳(파티션 잡은 만들기만) — 단 자동 숨김 일수만 `apm_setting.hidden_after_days`(사용자 설정).

### 6.1 롤업 (`apm/core/batch/rollup/ApmRollupService.java`)

```
LAG = 2분                                                          :58
closedBefore = floor(now − LAG, N분)   (1h는 추가로 ceiling = watermark5m + 5분)   :135-139
from = watermark ? watermark + N분 : floor(min(bucket_start) of source, N)         :167-183
if from == null || from >= closedBefore → NOTHING                                 :141-144
toExclusive = min(from + maxBuckets×N분, closedBefore)                             :146-148
ensureTargetPartitions → countMixedBoundsGroups → jdbc.update(rollupSql) → saveWatermark(toExclusive − N분)   :150-156
```

- 워터마크는 `apm_setting.rollup_watermark_5m/_1h`(마지막 채운 버킷 **시작** 시각, ISO LocalDateTime), 30초 설정 캐시를 타지 않음(`apm/core/setting/ApmSettingService.java:227-269`). 원본이 비면 워터마크를 세우지 않는다(백필 보호 `:163-165, 175-177`). 0·epoch로 채우지 않는다.
- "닫힌 버킷만": 버킷 `[T, T+N)`은 `now − 2분 ≥ T+N`일 때만. 5분 주기 fixedDelay라 버킷은 닫힌 뒤 2~7분 후에 접힌다. 늦게 도착(LAG 이후)한 1m 행은 롤업에 **영구 미반영**(1m 원본에만).
- 1h는 5m 워터마크를 앞지르지 않는다(아직 안 채운 5m를 읽으면 그 시간대가 영구히 작게 굳는다 — 대입 UPSERT라 다시 접지도 않음). Job은 5m → 1h 순서 강제(`ApmRollupJob.java:44-50`).
- 실패 시: `@Transactional` 없음. INSERT가 던지면 `saveWatermark`에 닿지 않아 **미전진**(다음 실행이 같은 창 재시도). INSERT 후 워터마크 저장만 실패해도 대입이라 재실행 결과 동일(`:39`).
- 🔴 **행이 0이어도 워터마크는 전진한다**(`jdbc.update` 결과와 무관 `:153-156`). 이것이 §12 "만료 &gt;7일 롤업 공백"의 원인.

**SQL**(`:248-277`):

```sql
insert into {target} (service_id, metric, dims_hash, bucket_start, dims, count, sum, min, max, hist_counts, bounds_id, exemplar_trace_id)
select service_id, metric, dims_hash, {bucketExpr},
       (array_agg(dims))[1], sum(count), sum(sum), min(min), max(max),
       case when count(distinct bounds_id) > 1 then null else apm_int_array_sum(hist_counts) end,
       case when count(distinct bounds_id) > 1 then null else min(bounds_id) end,
       (array_agg(exemplar_trace_id order by max desc nulls last, count desc) filter (where exemplar_trace_id is not null))[1]
  from {source} where bucket_start >= ? and bucket_start < ?
 group by service_id, metric, dims_hash, {bucketExpr}
on conflict (service_id, metric, dims_hash, bucket_start) do update set
       dims = excluded.dims, count = excluded.count, sum = excluded.sum, min = excluded.min, max = excluded.max,
       hist_counts = excluded.hist_counts, bounds_id = excluded.bounds_id, exemplar_trace_id = excluded.exemplar_trace_id
```

- **대입(`= excluded.x`) vs 1m 덧셈(`= 기존 + excluded`)**: 1m은 서로 다른 배치가 같은 버킷에 더해 넣는 구조라 덧셈이 맞고(중복 차단은 영수증), 롤업은 원본이 그대로 있는 **재계산**이라 덧셈이면 재실행이 두 배가 된다. 대입이면 배치가 중간에 죽어도 몇 번이든 같은 결과(`:35-39, 241-244`; `ApmRollupJobIT.java:150-165`).
- 인스턴스 축은 GROUP BY에 없어 자연 소실(`Step.sourceHasInstanceAxis` 필드는 SQL에 미사용 — 죽은 파라미터 `:119-133`).
- `apm_int_array_sum`(`mig/V40__apm_rollup_aggregate.sql:28-43`): `CREATE AGGREGATE (SFUNC = apm_int_array_add, STYPE = integer[])`, 카탈로그 확인으로 멱등. SFUNC가 **STRICT가 아닌** 것이 핵심 — 초기 상태 NULL이라 첫 호출이 `add(NULL, v)`이고 STRICT면 전 그룹 벡터가 통째로 사라진다(`:18-21`). V38에 덧붙이지 않은 이유는 기설치 flyway checksum(레포 규약).
- **bounds_id 불일치**: `count(distinct bounds_id) > 1`이면 `hist_counts`·`bounds_id` NULL, count·sum·min·max만 접음 + WARN(`RollupResult.mixedBoundsGroups`, `:200-220`, `ApmRollupJob.java:66-73`). "총량은 맞고 분포만 없는 것"이 분포가 그럴듯하게 틀린 것보다 낫다.
- 버킷 내림은 `date_trunc('hour', …) + floor(분/N) * interval` — `to_timestamp(extract(epoch …))`는 timestamptz가 되어 서버 TZ만큼 밀린다(`:283-295`).
- 센티널(`service_id=0`)도 같은 문장에서 함께 롤업된다.

### 6.2 파티션 유지·drop 경계

`ensureAhead(aheadDays)` 오늘~오늘+2 × 3테이블(기본 9개, 신규만 카운트 `ApmPartitionMaintainJob.java:47-55`). `dropExpired(table, days)`: `cutoff = today − days`, `day.isBefore(cutoff)`면 DROP → **오늘 포함 days+1일치 보존**("하루 덜 지우는 쪽 — 지우는 실수는 되돌릴 수 없고 남기는 실수는 다음 날 정리된다", `ApmPartitionService.java:131-162`). 이름 파싱 실패는 건너뜀(수동 생성본 보호). DROP은 DELETE가 아니라 파티션 DROP(잠금·죽은 튜플·디스크 미회수 회피).

### 6.3 보존·자동 숨김 (`apm/core/batch/retention/ApmRetentionService.java`, `ApmRetentionJob.java:64-100`)


| 단계         | 대상                     | 조건                                                                                 |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------- |
| partitions | 1m/5m/1h               | §6.2                                                                               |
| instances  | `apm_instance`         | `last_seen_at < now − 30d`                                                         |
| dropStats  | `apm_ingest_drop_stat` | `last_seen_at < now − 30d`                                                         |
| receipts   | `apm_otlp_receipt`     | `received_at < now − 2d`                                                           |
| hidden     | `apm_service`          | **ACTIVE만** ∧ `last_seen_at < now − hidden_after_days(14)` → `hide()` (`:102-120`) |


- PENDING_APPROVAL은 숨기지 않는다(숨기면 승인 화면에서 사라져 영영 승인 안 됨). 숨김은 `ApmService.touchSeen`이 수신 재개 시 자동 해제(`apm/core/domain/ApmService.java:127-131`).
- **P1은 숨김까지이고 삭제하지 않는다**(설계 §2.1의 자동 삭제는 CASCADE 파괴 연산 — 관리자 DELETE EP 사용을 보고 판단).
- 각 단계 독립 트랜잭션, 한 단계 실패해도 나머지를 돌고 끝에 `IllegalStateException("성공: … / 실패: …")`(false-green 방지, `ApmRetentionJob.java:74-84, 93-100`).

---

## 7. 조회 계층

### 7.1 해상도 선택·보존 승격 (`apm/core/metric/ApmResolution.java`, `ApmTimeRange.java`)


| 해상도 | 테이블             | step | 보존   | 인스턴스 축 |
| --- | --------------- | ---- | ---- | ------ |
| M1  | `apm_metric_1m` | 60   | 7일   | 있음     |
| M5  | `apm_metric_5m` | 300  | 30일  | 없음     |
| H1  | `apm_metric_1h` | 3600 | 400일 | 없음     |


```
requested = step==null ? byWindow(to−from) : byStep(step)         ApmResolution.java:72-77
byWindow: ≤6h→M1 / ≤7d→M5 / else H1                              :90-99
byStep:   ≥3600→H1 / ≥300→M5 / else M1 (모르는 값은 아래로 접음)    :108-116
escalate: while cur != H1 && from < now − retention(cur): 승격     :119-131
```

- 응답 `step`은 실제 쓴 해상도(`ApmSeriesQueryService.java:171, 328, 398, 463`) — **FE는 응답 step으로 x축을 그려야 한다**(읽기 계약 §7.2-11). 창 시작이 보존 밖이면 상위로 승격해 앞 구간이 조용히 빈 그래프를 주지 않는다.
- 인스턴스 시계열은 승격되면 빈 응답(5m엔 축 없음 `ApmSeriesQueryService.java:118-127`), 인스턴스 표 지표는 M1일 때만(`ApmServiceQueryService.java:222-228`).
- ⚠️ 보존 일수(7/30/400)가 `ApmResolution` 상수 **사본**이라 잡 옵션을 바꾸면 갈린다(`:20-33`, 주석이 인정).
- `ApmTimeRange.of(from,to)`: 비었거나 뒤집히면 최근 1시간(400 안 냄 `:25-54`), `previous()`는 같은 길이 직전 창(`:81-84`), ms 에폭 ↔ `LocalDateTime`은 시스템 TZ(`:92-98`).

### 7.2 `ApmMetricStore` — SQL 컬럼 전개 벡터 합 (`apm/core/metric/ApmMetricStore.java`)

```java
for (int i = 1; i <= MAX_BUCKETS(24); i++) sql += "sum(m.hist_counts[" + i + "]) as h" + i   // :85, :96-106
+ "count(m.hist_counts) as hist_rows, max(coalesce(array_length(m.hist_counts,1),0)) as vec_len"   // :87-89
```

대안 비교(주석 `:22-41`): ① 자바 합산 — 6h RED가 16만 행 전송·카디널리티 비례 ✗ ② `unnest … with ordinality` — 행 15배 폭발 ✗ ③ **컬럼 전개** ✓ — 범위 밖 첨자가 NULL이라 길이가 다른 패밀리가 섞여도 안전. 대가는 **폭 상한 24**(정규 경계 최대 pool_ms 16칸) — `vec_len > 24`면 WARN + `truncated=true`(`readHist` `:614-631`). V40 `apm_int_array_sum`을 조회에서 안 쓰는 이유는 주석 `:23-24`("2항 함수라 집계로 못 쓴다") — V40 이전 판단이 남은 것(추정).

**KST/UTC 함정**(`:47-55`): PG는 TZ 없는 `timestamp`의 `extract(epoch)`를 **UTC로 간주**하고 자바(`ApmTimeRange`)는 시스템 TZ → `epoch(bucket_start)*1000 − fromMs`로 짜면 KST에서 9시간 = **540칸** 밀린다(IT가 잡은 실제 버그, 증상은 "그래프가 통째로 빔"). 해법은 **차이** `floor(extract(epoch from (m.bucket_start − ?)) / ?)`(`:499-513, 557-558`, `T/premium/apm/core/metric/ApmMetricStoreIT.java:250-265`).

**센티널 제외**: 단일 서비스 질의는 `isSentinel(id) = id <= 0` → 빈 목록(`:661-663`), 배치 질의는 `sanitize()`가 `id > 0`만(`:653-658`). IT 실증 `:233-249`.


| 메서드                                                 | 테이블       | 요점                                                                                                                                                                                       | 위치                  |
| --------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `redSeries`                                         | res       | `bucket_start, bounds_id, sum(count) requests, sum(sum), sum(count) filter (status_class='5xx') errors, h1..h24` GROUP BY bucket_start, bounds_id. metric=`http.server.request.duration` | `:199-217, 570-594` |
| `gaugeSeries`                                       | res       | `sum(count) samples, sum(sum), min, max` — active_requests, 정본 sum/count·max                                                                                                             | `:225-243`          |
| `routeTable`                                        | res       | route·method·bounds_id 그룹(정렬·페이지는 자바)                                                                                                                                                    | `:257-278`          |
| `statusClassSeries` / `methodTotals`                | res       | `dims->>'status_class'` / `dims->>'http.request.method'`                                                                                                                                 | `:284-319`          |
| `dimensionSeries`(runtime)                          | res       | metric IN(…) GROUP BY metric, bucket_start, dims::text, bounds_id                                                                                                                        | `:333-359`          |
| `instanceTotals`                                    | **1m 고정** | instance_id 축                                                                                                                                                                            | `:411-425`          |
| `serviceTotals`/`serviceGaugeTotals`/`serviceCells` | res       | 목록 N+1 방지 배치 질의, 스파크 24칸                                                                                                                                                                 | `:437-526`          |
| `receivedCells`(가용성)                                | **1m 고정** | `distinct service_id, cell` 메트릭 무관 — 5m은 LAG로 최근 ~7분이 비어 부적합                                                                                                                             | `:544-564`          |


오류 정의 = `status_class='5xx'`만(4xx 제외 `:66-67`). 결과는 `bounds_id`별로 갈라져 나오고 병합은 `ApmHistogramMerger` 몫.

### 7.3 퍼센타일·병합·Apdex

`**HistogramRebucketer.percentile**`(`otel/histogram/HistogramRebucketer.java:202-233`): `target = p×total`(p&gt;1이면 /100), 누적이 target에 닿는 버킷 i에서 `lo + (hi−lo)×within` 선형 보간(`lo = i==0 ? min(0,b0) : b(i−1)`), **+∞ 버킷에 걸리면 마지막 유한 경계 반환**(위로 외삽 안 함). 관측 0 → 0.

`**ApmPercentiles**`(`apm/core/metric/ApmPercentiles.java`): 단위 환산 `boundsMillis()`(pool_ms만 ms), 관측 0/경계 미상 → **null**(0 아님 `:45-56, 66-79`), `sampleWarning = total < 20`(`SAMPLE_WARNING_THRESHOLD`, "버킷당 1건도 못 채우는 하한 · 소표본 재버킷 p95 오차 최대 68%" `:28-34, 62`). `align`은 짧으면 0 채움, 길면 초과분을 +∞ 칸에 접음(`:81-103`).

`**ApmHistogramMerger**`(`apm/core/metric/ApmHistogramMerger.java:70-134`): `total()` 최대 조각을 지배 경계로 → 다른 bounds_id 조각은 `rebucket(from.ms, …, dominant.ms)`로 접어 더함 → `rebucketed=true`. `rebucketed`가 true인 경우: 지배 경계가 정규 4종 아님 / 어느 조각이 `truncated` / 다른 bounds_id 접음 / 카탈로그 미스 / 히트맵 행 경계≠축 경계(`ApmSeriesQueryService.java:383-395`). 플래그는 RED·히트맵 DTO에만 실리고 엔드포인트 표·목록 행엔 없다(계산만 하고 버림 `:205-211`).

`**ApmApdex**`(`apm/service/status/ApmApdex.java`): `score = (satisfied + tolerating/2) / total`(`:57-63`), T 기본 0.5s(`apdex_t` null/≤0이면), 4T 허용(`TOLERATING_FACTOR=4`), pool_ms면 T×1000. `countAtOrBelow(v)`: `v ≥ hi`면 전량, `v ≤ lo`면 중단, 가로지르면 균등 보간, **+∞ 버킷은 절대 세지 않음**(`:72-94`). 관측 0 → null. T 출처는 `apm_service.apdex_t`(서비스별, NULL=코드 상수 0.5) — **전역 apdex T의 apm_setting 키는 없다**.

### 7.4 상태 판정 (`apm/service/status/ApmStatusJudge.java:88-123`)

```
staleBefore = now − max(1, staleMinutes)
serviceStale = lastSeenAt == null || lastSeenAt < staleBefore
if serviceStale && !inDeployGrace:
    collectorStale = collectorLastSeenAt == null || < staleBefore
    return collectorStale ? UNKNOWN : STALE                         // "앱이 죽었나 vs 파이프라인이 끊겼나"
if errorRatePct > errorRateThresholdPct → DEGRADED (reason "오류율 x% > y%")
if p95Ms > p95ThresholdMs             → DEGRADED
UP
inDeployGrace = versionChanged && newestInstanceFirstSeenAt > now − 10분   // grace는 미수신만 면제, DEGRADED는 그대로
```


| 입력                    | 출처                                                        | 기본   | 위치                                            |
| --------------------- | --------------------------------------------------------- | ---- | --------------------------------------------- |
| staleMinutes          | `apm_setting.stale_minutes`                               | 5    | `ApmSettingService.java:51, 91-93`            |
| errorRateThresholdPct | `default_error_rate_pct` **전역만**(서비스 컬럼 없음)               | 5    | `ApmServiceQueryService.java:472`             |
| p95ThresholdMs        | `service.slowThresholdMs ?? default_p95_ms`               | 2000 | `:473`                                        |
| errorRate/p95         | 조회 창의 **마지막 5분**(`range.lastMinutes(5)`, M1), 요청 0이면 null |      | `:384-387, 446-456`                           |
| collectorLastSeenAt   | 등록 수집기 전체 `max(last_seen_at)` — **전역**                    |      | `:567-573`, 한계 주석 `ApmStatusJudge.java:24-28` |
| now                   | `LocalDateTime.now()`(창 끝 아님)                             |      | `:403`                                        |


DOWN은 P3 합성 감시 전용(P1 미생성). 인스턴스 상태는 UP/STALE 2값(`:126-132`).

### 7.5 가용성 (`apm/service/status/ApmAvailabilityService.java`)

- 원천 **1m**(메트릭 무관 수신 여부), 칸 300초(`:24-28, 43-44`).
- `series()` 칸 상태: 미수신 → 수집기가 그 칸 이후 보고 없음이면 UNKNOWN 아니면 STALE / 수신+HTTP 없음 → UP / requests 0 → UP / 오류율&gt;임계 → DEGRADED / p95&gt;임계 → DEGRADED / UP(`:105-130`).
- `pct24h()` 분모 = `(to − max(from, firstSeenAt)) / 300s` — **서비스가 존재한 칸 수**(방금 등록한 서비스에 24h 분모를 씌우면 2%가 찍힌다 `:186-199`). 분자 = 수신 있던 칸(DEGRADED·UNKNOWN 판정 안 함 `:136-141, 168-175`). `100×min(filled,total)/total` 소수 1자리, total≤0 → null.
- 캐시 키 `(serviceId, windowEndBucket)` — 새 5분 칸이 생기면 키가 바뀌어 자연 무효화(TTL 아님 `:49-50, 152-181`).
- ⚠️ DTO 주석("UNKNOWN은 가용으로 센다" `apm/service/status/ApmAvailabilityDto.java:15-17`)과 달리 pct24h는 미수신 칸을 전부 감산 → 수집기 장애 구간도 퍼센트를 깎는다(§12).

### 7.6 런타임 슬롯 (`apm/service/runtime/RuntimeSlotMap.java`, `ApmRuntimeFamilyResolver.java`)

JVM 바인딩(`:216-243`, 전부 `ingestible=true`): memoryUsed/Limit/Committed(`jvm.memory.*` × `jvm.memory.type`, GAUGE_AVG) · gcDurationMs(`jvm.gc.duration` HIST_SUM ×1000) · gcCount(HIST_COUNT) · threads · cpuUtilizationPct(×100) · classCount · poolActive/Idle(`db.client.connection.count` state=used/idle) · poolPending · poolMax · poolWaitP95Ms(HIST_P95, pool_ms) · 공통 processCpuPct/processMemoryBytes(자바 에이전트는 안 냄). Agg 계산 `ApmSeriesQueryService.java:509-533`: GAUGE_AVG=`scale×Σsum/Σcount`, HIST_SUM=`scale×Σsum`, HIST_COUNT=`Σcount`, HIST_P95=merge→p95.

비-JVM(dotnet/node/python/go)은 표만 있고 `ingestible=false`(허용목록에 없어 저장 자체가 안 됨 `:246-300`, `RuntimeSlotMapTest.java:124-137`). 패밀리 판정은 관측 메트릭 접두 다수결(`jvm.`/`dotnet.`/`nodejs.`·`v8js.`/`process.runtime.cpython.`/`go.` `:137-182`), 리졸버 캐시 10분(`ApmRuntimeFamilyResolver.java:33-82`), `family` 파라미터가 있으면 덮어씀.

**3갈래의 BE 표현**: 데이터 있음 → `slots[slot]=[Series…]`; 슬롯 미지원 → 키 없음; 지원하나 미수신 → 키 없음(`ApmSeriesQueryService.java:436-461`). 즉 BE는 "미지원"과 "미수신"을 **구분하지 않는다** — FE가 패밀리별 기대 슬롯 표(`runtimeSlots.ts`)로 가른다(§10.4).

### 7.7 Zabbix 호스트 링크 (`apm/service/hostlink/ApmZabbixHostLinker.java`)

입력 = `hostNameOverride` 또는 `lastSeenAt` 최신 인스턴스의 `host.name`(`ApmServiceQueryService.java:193-203`). `AssetService.getList(searchField=host, keyword, limit 20)` — Zabbix 호출 없음(`:116-125`; `AssetRepository` 직접 참조는 ArchUnit A3 위반, Zabbix 직격은 매 렌더 전건 로드 `:24-34`). 후보 중 `zabbixHostid` 있고 `normalize(linkedHostName|name) == normalize(입력)` **정확 일치**만(`:126-144`) — 부분 일치면 `api`가 `api-gateway`에 붙는 조용히 틀린 링크. 실패 null + WARN. 캐시 5분(미스도 캐시, 2000건 clear), PUT 저장 시 `clear()`.

### 7.8 조회 API 표

공통: `@RequestMapping("/apm")`, `@VisitorIdCheck`, `@RequiresFeature(APM)`, 오류는 HTTP 200 + body `code`(`apm/service/ApmServiceController.java:47-62`). `from/to` ms 에폭, 없으면 최근 1h.


| 메서드            | 경로                                                                                                                                                                                                                                                                                | 권한                  | 응답                                                   | 위치                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------- | ---------------------------------- |
| GET            | `/apm/overview?from&to&env`                                                                                                                                                                                                                                                       | 로그인                 | `ApmOverviewDto`                                     | `ApmOverviewController.java:38-47` |
| GET            | `/apm/services/overview?from&to&env&includeHidden&q`                                                                                                                                                                                                                              | 로그인                 | `ApmServicesOverviewDto`(summary·services·envs·tags) | `ApmServiceController.java:73-85`  |
| GET/PUT/DELETE | `/apm/services/{uid}`                                                                                                                                                                                                                                                             | 읽기 로그인 / 쓰기 **관리자** | `ApmServiceDetailDto` / 409 `APM_SERVICE_NOT_HIDDEN` | `:87-117`                          |
| GET            | `…/instances` · `…/availability` · `…/red-series` · `…/endpoints`(sort ∉ 허용 → 400 `APM_INVALID_SORT`) · `…/endpoints/series`(route 필수, activeRequests 항상 null) · `…/status-codes` · `…/methods` · `…/latency-heatmap` · `…/runtime?family` · `…/instances/{id}/series`(7일 초과 빈 점) | 로그인                 | 계약 DTO                                               | `:119-247`                         |


개요 계산(`apm/overview/ApmOverviewQueryService.java`): totals는 **숨김·대기 포함 전체**(`:88-104`), summary는 목록 모집단 — 다르다(의도). prev = `range.previous()`(직전 동일 길이 창, "전일 동시간"이 아님 — FE 라벨 정정됨). 히트맵은 목록 스파크 24칸 재사용. 계약 픽스처 8종을 `T/premium/apm/ApmContractFixtureTest.java:38-84`가 트리 비교(FE `typecheck:contract`와 대조).

---

## 8. 알람

파일 `apm/alert/*`, `apm/core/domain/ApmAlertRule*.java`, `engine-api/…/history/*`, `engine-zabbix/…/history/ZabbixHistoryPushImpl.java`, `mig/V41__apm_alert.sql`.

```
[apm_alert_evaluate 5분]  ApmAlertEvaluationService.evaluateAll(now)                 ApmAlertEvaluationService.java:90-160
  for rule in enabled:  for scope in targetsOf(rule):
     binding = bridge.ensureProvisioned(rule, scope, now)       → 그룹/호스트/아이템/트리거 확보(멱등)      :114
     value   = evaluator.evaluate(kind, …)  Optional             → empty면 push·이벤트 둘 다 skip           :119-123
     if !binding.isMissing(): pushes += (binding, key, value, clock=now)                               :127-129
     breached = value > kind.expressionThreshold(threshold); open ? fire : resolve → apm_alert_event    :132-154
  bridge.pushAll(pushes, now)  → history.push 1회                                                       :158
  backfillZabbixEventIds(now)  → event.get으로 zbx_eventid 짝짓기                                        :159
[apm_alert_sync 02:00]  표현식 대조(drift) · 사라진 트리거 재생성 · NOT_SUPPORTED 사유                    ApmAlertSyncService.java:96-126
```

### 8.1 kind 5종 계산식 (`apm/alert/evaluate/ApmAlertEvaluator.java`, `ApmAlertKind.java`)


| kind                    | 계산                                                                                                     | 창                             | 값 없음 조건                         | units / priority           | 위치                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------- | -------------------------- | ------------------------ |
| `ERROR_RATE`            | `sum(count) filter(status_class='5xx') ×100 / sum(count)`, `http.server.request.duration` **1m 원본**    | `[now−window, now)` 1구간       | `total==0` → null("요청 0건 ≠ 0%") | `%` / 4 High               | EV:44-51, 89-92, 150-163 |
| `P95_LATENCY`           | 창 안 `hist_counts` 합(bounds_id별 따로, 관측 최대 하나만 채택) → `percentile(…, 0.95)×1000`                          | 동일                            | 후보 없음/벡터 길이 불일치 → null          | `ms` / 3                   | EV:180-215               |
| `STALE`                 | `minutes = (now − last_seen_at)/60; minutes > thr ? round(minutes) : 0` — 메트릭 테이블 안 읽음, window_min 미사용 | —                             | `lastSeenAt==null` → empty      | `min` / 3, 트리거 `**>0` 고정** | EV:108-115, K:119-121    |
| `COLLECTOR_FAILURE`     | `sum(sum)`, `service_id=0`, `metric like 'otelcol_exporter_send_failed%'`                              | `[now−window, now)`           | 행 없음 → null                     | `''` / 2                   | EV:273-290               |
| `ACTIVE_REQUESTS_SPIKE` | `avg[now−5,now) / avg[now−10,now−5)`, avg=`sum(sum)/sum(count)`                                        | **5분 대 5분 고정**(window_min 무시) | 직전 평균 ≤0 → null(Infinity 방지)    | `''` / 2                   | EV:54, 90-92, 235-263    |
| `SLO_BURN`              | 항상 empty(P3)                                                                                           |                               |                                 | `''` / 3                   | EV:84-87                 |


- 창 끝은 `LocalDateTime.now()` 그대로(분 미정렬, LAG 없음) → 마지막 1m 버킷은 부분 적재 상태일 수 있다(추정). 창 번호는 `floor(extract(epoch from (bucket_start − CAST(? AS timestamp)))/?)`(TZ 함정 회피 EV:33-36, 344-346).
- 값 없음(Optional.empty)이면 **push도 판정도 안 함** → 트래픽 0으로 떨어진 서비스의 열린 이벤트는 유지되고 Zabbix `last()`도 마지막 값 유지 → 탈출구는 STALE 규칙 + `manual_close=1`.
- 우리 판정식 `value > thr`와 트리거 `last(...)>thr`를 **일부러 같게**(ES:40-43, 132; BR:407-410) — 다르면 "화면엔 열렸는데 Slack엔 안 온" 상태.

### 8.2 규칙 모델·전역 펼침

- `apm_alert_rule`(`ApmAlertRule.java`): `rule_uid`(Zabbix 태그 `apm_uid`), `service_id NULL=전역`, `kind`(옛 이름 `LATENCY_P95`·`COLLECTOR_SEND_FAILED`도 `find()`가 받음 K:134-151), `threshold`, `window_min`(1~1440), `enabled`. V38의 `zbx_itemid/zbx_triggerid/drift/synced_at`은 **레거시**(`markSynced/markDrift` 호출처 0) — 정본은 바인딩.
- `targetsOf(rule)`(`ApmAlertService.java:448-471`): 수집기 축(COLLECTOR_FAILURE) → `Scope(null,"collector")` 1개 / 서비스별 → 그 서비스 / 전역 → `state=ACTIVE` 전부 **minus** 같은 kind의 활성 서비스별 규칙이 있는 서비스(둘 다 살리면 같은 문제로 두 번 울린다). PENDING·HIDDEN 제외. 중복 금지 같은 kind×같은 serviceId(`:543-552`). 수정 시 `kind`·`serviceUid` 무시(아이템 키에 들어가는 값 — 바꾸면 삭제 후 재생성이고 이력이 끊긴다).
- `apm_alert_rule_binding`(V41:23-58): 규칙×대상 1행. 전역 규칙 1건이 서비스 수만큼 아이템·트리거를 만들므로 규칙 행의 칸 하나로는 고아가 생긴다(V41:15-19). `service_id NULL`=수집기 축 → PG UNIQUE의 NULL 중복 허용 회피로 **부분 유니크 2개**(V41:50-55). 필드 `zbxItemid/zbxTriggerid(캐시)/syncedAt/drift/cacheReady/error`.

**상태(enum 없음, 필드 조합 파생, `ApmAlertService.java:609-622`)**: `ids null → MISSING` / `drift → DRIFT` / `!cacheReady → PENDING_CACHE` / else `SYNCED`; `error`는 직교 overlay.

```
create(): ids=null, drift=F, cacheReady=F                                    ApmAlertRuleBinding.java:90-96
 └─ provision 성공: markProvisioned(item, trig, now) → ids set, drift=F, error=null, syncedAt=now   :99-106
 └─ provision 실패: markError(msg) (ids 그대로 null)                          ZabbixAlertBridge.java:184-191
PENDING_CACHE ──push ok──▶ markCacheReady(now) → SYNCED                     BR:501-508, BIND:114-118
              ──cacheMiss ∧ withinCacheGrace(now)──▶ 무변경(pending 집계)     BR:509-513   grace = now − syncedAt < 2분  BIND:141-143
              ──그 외 실패──▶ markError(error)                               BR:514-518
SYNCED ──sync 배치: 표현식 다름──▶ markDrift(now) → DRIFT                      ApmAlertSyncService.java:112-116
DRIFT  ──되돌려짐 / resync OURS·THEIRS──▶ markProvisioned                    SS:117-121, AS:297, 332
*      ──규칙 on/off의 trigger.update 실패──▶ markTriggerStatusPending → error="TRIGGER_STATUS_PENDING: wanted=…"
       ──평가/sync 배치 시작부 retryPendingTriggerStatus 성공──▶ clearTriggerStatusPending
```

**트리거 상태 전이(부분 실패·재시도, 2026-08-31 신설 — §12 A3 잔여, 코덱스 2차 검수 #3).** 규칙을 껐다
켜는 것은 바인딩 수만큼의 `trigger.update`이고, 그중 하나가 던지면 옛 코드는 **루프가 끊겨** 나머지
트리거가 켜진 채 남았다. 그 시점에 DB `enabled`는 이미 false이고 열린 이벤트도 닫혀 있어 화면은
"꺼짐"인데 Zabbix Problem은 계속 열려 알림이 나갔고, 어떤 배치도 `setTriggersEnabled`를 다시 부르지
않아 불일치가 **영구**였다. 지금은 (1) `ZabbixAlertBridge.setTriggersEnabled`가 바인딩마다 끝까지
시도하고 `TriggerStatusSummary(ok, failed, skipped)`를 돌려주며, (2) 실패한 바인딩에
`error="TRIGGER_STATUS_PENDING: wanted=disabled — 사유"`를 남기고, (3) `retryPendingTriggerStatus`가
**평가 배치(5분)와 sync 배치(일 1회) 시작부**에서 그 배지를 물고 재시도한다. 🔴 재시도의 "원하는 상태"는
배지 문자열이 아니라 **규칙의 `enabled`**를 다시 읽는다(실패 후 사용자가 다시 켰으면 그쪽이 최종 의사).
🔴 재시도가 **규칙이 아니라 배지 붙은 바인딩에서 출발**하는 이유는, 이 배지가 가장 잘 생기는 상황이
"껐는데 못 껐다"이고 그 규칙은 평가(`findByEnabledTrue`)·sync(꺼진 규칙 skip) 두 루프 모두에서 빠지기
때문이다. 🔴 이 배지는 `markError`·`clearPushError`가 **덮지도 지우지도 못한다** — 지우면 재시도 대상에서
빠져 불일치가 영구가 된다. 내리는 것은 상태를 실제로 새긴 쪽뿐이다(재시도, 또는 `status`를 함께 쓰게 된
`applyOurDefinition`/트리거 생성). 꺼진 규칙은 평가·프로비저닝·push 대상이 아니므로(`findByEnabledTrue`)
재시도 전까지 그 트리거는 마지막으로 민 값으로 참인 채 남는다.
(`ZabbixAlertBridge.setTriggersEnabled/applyTriggerStatus/retryPendingTriggerStatus`,
`ApmAlertRuleBinding.ERROR_PREFIX_TRIGGER_STATUS_PENDING`, `ApmAlertEvaluationService.evaluateAll` 시작부,
`ApmAlertSyncService.syncAll` 시작부. 테스트 `ZabbixAlertBridgeTest` 6건 · `ApmAlertEvaluationRetryTest` 2건 ·
`ApmAlertSyncServiceTest.retriesPendingTriggerStatusFirst`)

🔴 실제 배치 흐름의 결함(§12 A1·A2): `ensureProvisioned`가 매 5분 성공 시 `markProvisioned(…, now)`로 `syncedAt=now`·`drift=false`·`error=null`을 쓰고, 같은 `now`로 `pushAll`이 돌아 `withinCacheGrace(now)`가 **항상 참** → 영구 "does not exist/No permissions" 실패가 영원히 pendingCache로 위장되고, 02:00 sync가 세운 drift·NOT_SUPPORTED 배지는 02:05에 지워진다(코드 확인: `ZabbixAlertBridge.java:170-193`, `ApmAlertRuleBinding.java:99-106, 141-143`, `ApmAlertEvaluationService.java:114, 158`). 테스트는 `syncedAt`을 수동 10분 전으로 두어 통과(`T/…/alert/ZabbixAlertBridgeTest.java:325`).

### 8.3 Zabbix 객체 규약 (`apm/alert/bridge/ZabbixAlertBridge.java`)


| 객체      | 이름/키                                                           | 찾기                                                                                                | 없으면                                                           | 소유 검증                                                          | 위치                          |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| 호스트 그룹  | `MovesEye APM`                                                 | `hostgroup` 검색 후 이름 완전일치                                                                          | create                                                        | 없음(그룹은 태그 없음)                                                  | `:61, 253-267`              |
| 호스트     | `MovesEye APM`(기술명=표시명)                                        | `host.get filter{host} selectTags`                                                                | `host.create` **interfaces 없음**, 태그 owner                     | 동명인데 `owner=moveseye-apm` 없으면 **throw notOwned**(재사용도 생성도 안 함) | `:62, 216-251`              |
| 트래퍼 아이템 | `apm.<kind_lower>[<scope_uid>]`(scope=서비스 UUID 또는 `collector`) | `item.get hostids+filter{key_}+selectTags`                                                        | `item.create {type:2, value_type:0, units, tags}`             | 동키 미소유 → throw                                                 | K:97-107, `:73-78, 280-307` |
| 트리거     | description=아이템 name                                           | `trigger.get tags[apm_uid=ruleUid, apm_service=scopeUid] expandExpression` — **triggerid로 찾지 않음** | `trigger.create {expression, priority, manual_close:1, tags}` | 태그 검색 자체가 우리 것 한정(owner 별도 확인 없음)                              | `:313-369`                  |


- 표현식 `last(/MovesEye APM/<key>)>` + `formatNumber(kind.expressionThreshold(thr))`(`:407-410`, STALE은 0; `Locale.ROOT` `%.6f` 후 꼬리 0 제거 — 한국어 로케일 `5,5` 방지 `:798-805`). recovery_expression 없음(Zabbix 기본 "거짓이면 회복"). priority는 규칙 필드가 아니라 kind 고정(K:82-85).
- 태그: 아이템 `owner`·`apm_service`·`apm_kind`, 트리거는 +`apm_uid`(`:787-796`). 재탐색 키는 `apm_uid` — `zbx_triggerid`는 사용자가 지웠다 만들면 바뀌는 캐시(R10).
- **소유 태그 fail-safe**(`ownedByTag` `:753-766`): `tags`가 List가 아니면(못 받아 왔으면) **"남의 것"**. 메시지 `ZABBIX_OBJECT_NOT_OWNED: …`가 바인딩 error로 화면에 나감(`:780-784`). 삭제도 소유 확인된 것만, **트리거 먼저 → 아이템**(아이템을 먼저 지우면 Zabbix가 참조 트리거를 cascade 삭제 `:559-568`), 호스트·그룹은 지우지 않음. 트리거 재사용 경로엔 owner 검사 없음(검수 §6 인정). 실서버 3회차에서 `host.get selectTags`가 태그를 돌려줘 재사용 통과 확인(E2E 3회차).
- **덮어쓰기 경로 둘**: `ensureProvisioned`(배치, enforce=false)는 없는 것만 만들고 기존 트리거는 손대지 않음 — 여기서 표현식을 맞추면 사용자의 Zabbix 수정이 매 5분 되돌아간다. `applyOurDefinition`(규칙 생성·수정·resync OURS)만 `trigger.update`로 강제(`:148-168, 327-334`).
- hostid 캐시는 `volatile` 프로세스 메모리, 실패 시 즉시 null(`:113-120, 187`).

### 8.4 우리 이벤트 판정과 배달의 분리


| 관찰                                                                              | 위치                                   |
| ------------------------------------------------------------------------------- | ------------------------------------ |
| 이벤트 save/resolve는 루프 안, push는 루프 끝 1회 배치                                        | ES:133-154 vs :158                   |
| binding이 MISSING(프로비저닝 실패)이어도 이벤트 판정은 수행, push 목록에만 안 담음                        | ES:127-129                           |
| push 실패는 binding.error·PushSummary에만, 이벤트 무영향                                   | BR:480-489, 514-518                  |
| 열린 이벤트가 있으면 `value` 갱신 안 함("터진 순간 얼마나 나빴나" 보존)                                  | ES:144-145                           |
| `findOpen`은 JPQL(파생 쿼리는 `serviceId=null`을 `= null`로 번역해 0건 → 수집기 축이 5분마다 새 이벤트) | `ApmAlertEventRepository.java:26-33` |
| Job은 대상이 있는데 **전부** 프로비저닝 실패면 예외(Zabbix 미연결·권한), 부분 실패는 요약                      | `ApmAlertEvaluationJob.java:44-51`   |
| 전체가 한 `@Transactional` 안(Zabbix HTTP 포함)                                        | ES:90-91                             |


push 항목 단위(`pushAll` `:466-524`): `results[i] ↔ requests[i]`, 응답 누락은 failed로 채움(`:498-499`); ok → `markCacheReady`(여기서야 배달 성립 — 아이템 생성 성공이 아니라 **첫 push 성공**이 기준); cacheMiss ∧ grace → pending; 그 외 → `markError`. 전송/JSON-RPC 예외 → 요청 전건 markError(`:480-489`). push 대상은 **host+key**(itemid 아님 `:463-475`). 실패로 ids를 지우거나 cacheReady를 내리는 경로는 없다(`clearObjects` 미사용).

`zbx_eventid` backfill(ES:193-243): `event.get {source 0, object 0, objectids=[triggerids], value 1, time_from}`로 발화 ±3분 안 가장 가까운 것, 한 번 붙으면 불변. `problem.get recent:true`는 최근 해소분도 돌려줘 금지(R10 §1-7).

### 8.5 `ZabbixHistoryPushImpl` (`engine-zabbix/…/history/ZabbixHistoryPushImpl.java`)

```json
// method "history.push", params 배열                                   :44-50
[{"host":"MovesEye APM","key":"apm.error_rate[<uuid>]","value":"12.5","clock":1756600000,"ns":0}]   // 브리지가 쓰는 host+key 경로 :63-65
```

- itemid와 host+key **동시 전송 금지**(JSON-RPC error로 배치 전체 거부 `:56-66`); 둘 다 없으면 호출 전 `IllegalArgumentException`.
- `value`는 String — 포맷은 호출자(`PushValue.numeric` Locale.ROOT `engine-api/…/history/model/PushValue.java:37-46, 68-75`).
- 응답: `response:"success"`는 수신 확인일 뿐, `data[i].error` 있으면 그 값은 버려진 것(`:18-25, 80-93`; `PushResult.cacheMiss()` = error에 `"does not exist"` 포함 `PushResult.java:43-45`). 응답이 짧으면 나머지를 failed로 채움(성공으로 채우면 손실이 통계에서 사라진다 `:95-103`).
- `ZabbixClient`는 JSON-RPC error 문구 `no permission`을 `UnauthorizedError`(401 계열, RuntimeException)로 던짐 → 브리지 `catch (RuntimeException)`이 받아 바인딩 오류로(`engine-zabbix/…/client/ZabbixClient.java:97-113`, BR:480).
- Zabbix 7.0+ 전제는 문서화만, 런타임 버전 확인 없음. R10 실측 대조: 생성 직후 push 실패(캐시 ~10초) → 유예 2분+다음 5분 배치 재시도(busy-wait 없음 — 배치 안에서 10초씩 자면 대상 수만큼 잠든다); 잘못된 타입은 push 성공 후 NOT_SUPPORTED → 값 검증은 우리 몫 + sync 배치가 `state=1` 배지.

### 8.6 드리프트 동기화 (`apm/alert/sync/ApmAlertSyncService.java`)

세 가지만, **고치지 않는다**: ① `trigger.get expandExpression` 결과와 우리 표현식이 다르면(공백 제거 후 문자열 완전일치 — `>5.0`도 drift, 덜 잡는 것보다 더 잡는 쪽) `drift=true`만(`:107-116`) ② 트리거가 사라졌으면 `applyOurDefinition`으로 재생성 + info(`:99-105`) ③ 아이템 `state=1`이면 `binding.error="Zabbix 아이템 NOT_SUPPORTED: 원문"`(`:135-145`). 꺼진 규칙은 대조 안 함. priority·description은 비교 안 함. 감사는 `ZabbixChangeLog` 미사용(배치에 행위자 없음 + A3) — `log.info`와 바인딩 행.

resync `OURS` = 모든 scope에 `applyOurDefinition`. `THEIRS` = 첫 트리거 표현식 상수를 정규식 `>\s*(-?\d+(?:\.\d+)?)\s*$`로 추출 → `rule.update` → 전 scope 강제(`ApmAlertService.java:308-334`, BR:417-431); 우리 형태가 아니면 규칙 안 건드리고 drift 유지. 🔴 THEIRS는 `validThreshold` **미호출**(§12 A4).

### 8.7 액션 진단 (`coveringActions` `:701-740`)

`action.get {eventsource 0, filter{status 0}, selectFilter}` 활성 트리거 액션의 `filter.conditions[]`:


| conditiontype | 뜻               | 검사                                              |
| ------------- | --------------- | ----------------------------------------------- |
| 0             | Host group      | `value == 우리 groupId`                           |
| 25            | Event tag(이름)   | `value == "owner"`(값 무관 — 태그 존재만으로도 우리 이벤트가 걸림) |
| 26            | Event tag value | `value2 == "owner" ∧ value == "moveseye-apm"`   |


옛 코드는 26의 `value`를 태그명으로 읽어 사실상 "태그 값이 owner인 조건"을 세고 있었다(코덱스 🟡3, 필드 표 `:84-102`). `operator`·`evaltype`은 보지 않는다(부정 조건도 "배달됨"으로 집계 가능, 추정). 우리는 액션을 **만들지 않는다** — 0이면 "알림 액션 없음" 배지(실측 데모 17개 중 0).

### 8.8 API (`apm/alert/ApmAlertRuleController.java`)

전부 `AdminAccessChecker.requireAdmin`(userRole 축 — `@Roles`면 Zabbix 미연동 admin(roleid null)이 규칙을 못 만든다 `:36-38`), 단 `GET /apm/services/{uid}/alert-rules`는 운영자 읽기(`:142-148`). 거부 200+code 403. EP: `GET/POST /apm/alert-rules`, `PUT/DELETE /{ruleUid}`, `POST /{ruleUid}/resync?mode=OURS|THEIRS`, `POST /preview`, `GET /zabbix-status`(`notOwnedConflicts` 포함), `GET /apm/alert-events`(**findAll 후 메모리 필터·페이징** `ApmAlertService.java:135-161`). 임계 검증: `>0`(SPIKE는 `>1`), ERROR_RATE ≤100, window 1~1440(`:516-540`) — 임계 0은 정상 서비스에서도 즉시 발화해 "상시 켜진 알람"이 된다. preview는 실시간 evaluate와 같은 SQL(`series`)로 창별 값·위반 구간(`breaches`)·`sampledWindows`, STALE은 `approximate=true`(`:361-428`). 규칙 생성·수정 직후 `syncNow`(실패해도 CRUD 성공, `enabled=false`면 아무것도 안 함 `:336-349`).

---

## 9. 수집기 API

### 9.1 `ApmCollectorConfigGenerator` (`apm/collector/config/ApmCollectorConfigGenerator.java`)

정본은 **파일 하나** `src/main/resources/apm/collector-template.yaml`(otelcol-contrib 0.159.0 `validate` 통과본, 1회 로드 volatile 캐시 `:52, 89, 310-322`). 코드는 치환과 한 군데 삭제만.

```
generate(options, plainToken):                                       :95-133
  os = ApmInstallTarget.os(opts.os)   (모르는 값 → APM_INSTALL_TARGET_INVALID)
  endpoint/slowMs/normalPct/memMib/queueDir 정규화·검증
  yaml = template()
  if keepRawSql: yaml = removeSqlProcessor(yaml)          ← 치환보다 먼저   :108-110
  yaml = mapConfigLines(yaml, 5종 치환 + 토큰은 plainToken 있을 때만)   :117-129
  verifyNoUnexpectedPlaceholder(yaml, tokenEmbedded)                    :131
  return header(keepRawSql, tokenEmbedded) + yaml
```


| 자리표시                                                   | 값                                                                                                                                                   | 인용                                  | 위치                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| `${MOVESEYE_ENDPOINT}`                                 | `normalizeEndpoint` — http/https·호스트 필수·쿼리/프래그먼트 금지·끝 `/` 정리·`/v1/{metrics,traces,logs}` 접미 **거절**(조용히 고쳐 주면 무엇을 잘못 적었는지 영영 모른다)·`/apm/otlp` 없으면 붙임 | 큰따옴표 스칼라(윈도우 경로 콜론·역슬래시)            | `:99, 119, 149-186, 385-387` |
| `${QUEUE_DIR}`                                         | OS별 기본(`/var/lib/moveseye/otelcol-queue` / `C:\ProgramData\moveseye\otelcol-queue`), 개행·`"`·`${` 금지                                                 | 큰따옴표                                | `:64-68, 104, 120, 205-219`  |
| `${SLOW_MS}` / `${NORMAL_PCT}` / `${MEMORY_LIMIT_MIB}` | 2000(1~~600000) / 2(0~~100) / 512(64~65536)                                                                                                         | 평문 정수                               | `:100-103, 121-123`          |
| `${RECEIVE_TOKEN}`                                     | `withConfig` 경로에서만 실제 토큰(이스케이프), 그 외 잔존 허용                                                                                                          | 템플릿이 이미 `"Bearer ${RECEIVE_TOKEN}"` | `:111, 126-128`              |


- **주석 줄 미치환**: 줄 전체가 `#`로 시작하면 mapper 미적용(`:344-354, 368-370`) — 머리말이 자리표시 이름을 *설명*하려고 본문에 적어 두었기 때문(`:113-116`). 테스트 `ApmCollectorConfigGeneratorTest.commentsAreNotSubstituted`.
- `**keepRawSql` 양쪽 제거**(`removeSqlProcessor` `:235-265`): ① `processors:` 아래   `transform/sql:` 정의 블록(들여쓰기 2칸, 다음 빈 줄/≤2칸까지 drop) ② `service.pipelines.traces.processors` 목록의 이름(`"transform/sql, "`/`", transform/sql"`). 한쪽만 지우면 Collector가 기동을 거부한다. 남으면 `IllegalStateException`. 헤더 경고에 **프로세서 이름을 적지 않는다** — "생성물 어디에도 그 이름이 없다"가 검증 가능한 불변식(`:292-298`). yaml 파서를 안 쓰는 이유는 주석 소실.
- **잔존 자리표시는 예외**(`:331-341`): 남으면 Collector는 그 문자열을 값으로 받아 **기동에 성공**하고 엉뚱한 곳으로 보낸다.
- **키 트리 검증**은 테스트에서만: snakeyaml로 파싱해 키 경로 집합을 "자리표시를 `x`로 바꾼 템플릿"과 비교(원본은 플로우 매핑 안 `${…}`가 파싱 불가 `…GeneratorTest.java:46-58, 272-311`). `otelcol-contrib validate`는 바이너리가 없어 못 돌리고 E2E 3회차에서 양 모드 실측 통과.
- 응답: `text/yaml;charset=UTF-8` + `Cache-Control: no-store` + `Content-Disposition: attachment` + 토큰 미주입이면 `X-Apm-Token-Placeholder: RECEIVE_TOKEN`, keepRawSql이면 `X-Apm-Warning: raw-sql` + WARN 감사 로그(`ApmCollectorController.java:110-126`, `ApmCollectorConfigService.java:57, 77-79`). 회수 토큰은 거절(`APM_TOKEN_NOT_FOUND` — 그 설정을 배포하면 401 즉시 폐기인데 원인이 화면 어디에도 안 남는다 `:51-54`).
- `withConfig`(`apm/collector/token/ApmReceiveTokenService.java:134-146`): 발급 응답에만 완성 yaml. 옵션이 잘못되면 **발급 트랜잭션 전체 롤백**(삼키면 "토큰은 만들어졌는데 yaml만 빈" 응답).

### 9.2 템플릿 파이프라인 (`collector-template.yaml`)


| 파이프라인          | receivers                            | processors                                                                                                                        | exporters         |
| -------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `metrics`      | otlp(:4317/:4318)                    | memory_limiter → resourcedetection → attributes/drop → filter/metrics → batch                                                     | otlphttp/moveseye |
| `metrics/self` | prometheus/self(127.0.0.1:8888, 30s) | memory_limiter → filter/self(`^otelcol[._].*`) → batch                                                                            | 〃                 |
| `traces`       | otlp                                 | … → attributes/drop → redaction/pii → **transform/sql** → tail_sampling(errors·slow≥`${SLOW_MS}`·normal `${NORMAL_PCT}`%) → batch | 〃                 |
| `logs`         | otlp                                 | … → attributes/drop → redaction/pii → batch                                                                                       | 〃                 |


exporter: `encoding: json`("BE 파서가 json 전용"), `compression: gzip`, `sending_queue{file_storage, 5000}`, `retry_on_failure{30m}`(:89-96). ⚠️ 템플릿 주석 "429·5xx·네트워크만 재시도"는 R1과 다름(500은 폐기). `telemetry.metrics.readers` 형식(0.159에서 `address` 소멸). 프로세서 순서의 "왜"는 명시 주석 없음(추정: OTel 관례 — 메모리 상한 최전방 → 리소스 보강 → 마스킹 → 샘플링 → batch 최후).

### 9.3 설치 가이드 (`apm/collector/install/ApmInstallGuideService.java`, `ApmInstallTarget.java`, `ApmInstallVersions.java`)

순수 함수(DB·설정 안 봄 `:22-24`). 응답 `{collector{os, version 0.159.0, downloadUrl, steps[]}, app{stack, steps[], envVars[]}, verify[], notices[]}`, `Step={code, title, command?, note?}` — **i18n은 BE가 안 함**, 한국어 원문 + 안정 키(`dto/ApmInstallGuideDto.java:10-15`). os×stack 10조합 전수 테스트. Collector 단계 6(download/extract/config/queue-dir(`icacls`·`install -m 700`)/service(`sc.exe create` · systemd)/start), 앱 단계 스택별(Java `-javaagent`), env 공통 3 + Java `TEMPORALITY_PREFERENCE=delta`·`SEMCONV_STABILITY_OPT_IN=database`(`:230-266`), verify 4단("순서가 곧 진단": health → ingest/recent → 서비스 목록 → Collector 로그 401/403/413 `:283-311`), notices `single-collector`·`license-expiry`·`token-secrecy`(W) + `app-to-collector`·`masking-opt-in`(I). `os`/`stack` 없으면 기본(linux·java), 모르는 값은 400 — "안 준 값"과 "틀린 값"은 다른 사건.

### 9.4 드롭 통계 조회 (`apm/collector/drops/ApmIngestDropQueryService.java`)

`GET /apm/ingest/drops?tokenId&from&to`. `count`는 **누적**, `from/to`는 `lastSeenAt` 필터(시간축 없음) — 둘 다 없으면 무필터(기본 1시간을 씌우면 대부분 행이 사라져 "폐기 없음"으로 보임 `ApmIngestStatusController.java:72-74`). `rows`는 `(reason, metric)` 그룹 200줄, `routeOverflow`는 `@svc:<id>` 접미에서 서비스를 되찾음(사라진 서비스·접미 없는 옛 행 제외 `:63-126`). 전량 `findAll` 메모리 집계.

### 9.5 설정·토큰·권한

`apm_setting` key-value(`ApmSettingService.java`, 30초 TTL 캐시, 깨진 값은 코드 기본): `registration_mode`(AUTO) · `hidden_after_days`(14) · `stale_minutes`(5) · `default_error_rate_pct`(5) · `default_p95_ms`(2000) · `mask_sql`(true) · `keep_raw_sql`(false) · `route_limit`(500) + 워터마크 2키(사람 설정 아님, `updated_by` null). 🔴 `mask_sql`·`keep_raw_sql`은 **소비자 0건** — 실제 스위치는 요청별 `keepRawSql` 옵션이고 설정과 연동되지 않는다(§12). V39 `updated_by`는 `keep_raw_sql`을 켠 "누가·언제"를 설정 행에 남기려는 것(감사 테이블은 자산 도메인 소속 + A3).

토큰(`ApmTokenController` `/apm/receive-tokens` GET/POST/DELETE): 목록 DTO에 `token`·`tokenHash` 필드 자체가 없음, `kind` COLLECTOR/RUM, `scopes` 기본 `["ingest"]`(소비처 0건).

권한 축: 관리 API 전부 `AdminAccessChecker.requireAdmin`(`userRole ∈ {ADMIN, SUPER_ADMIN}`, `auth/security/AdminAccessChecker.java:27-48`) + 클래스 `@RequiresFeature(APM)`; 조회 API(`ApmServiceController`·`ApmOverviewController`)는 로그인 사용자 읽기, PUT/DELETE만 관리자; `@LicenseExempt`는 `premium/apm`에서 `ApmOtlpController` 3메서드가 **전부**. `ApmAdminAccessMvcTest`는 standalone MockMvc라 인터셉터 체인은 미검증(E2E로만).

---

## 10. FE 로직

파일 48개(`pages/application-monitoring/**`) + 공유 10개. 구현 화면: 개요·서비스 목록·상세 P1 탭 5(개요/트랜잭션/런타임/인스턴스/설정)·알람 규칙(탭 3). **수집기·토큰 화면은 자리표시만**(`ApmCollectorsPage.tsx:7-9`, 관련 훅/API 없음) — 온보딩 1단계 버튼이 빈 화면으로 보낸다(§12).

### 10.1 `useApmTimeRange` (`hooks/useApmTimeRange.ts`, `constants/apm.ts`)


| URL 키       | 기본     | 허용                                                                  | 위치                                                           |
| ----------- | ------ | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `preset`    | `1h`   | `15m/1h/6h/24h/7d/30d/custom`                                       | `useApmTimeRange.ts:60, 75`, `constants/apm.ts:135-143, 172` |
| `from`,`to` | 프리셋 계산 | **ms 에폭** — 다른 화면은 같은 키에 초를 쓰므로 `apmEpochMs`가 `<1e11`이면 초로 보고 ×1000 | `:61-62, 69-70`, `constants/apm.ts:256-264`                  |
| `refresh`   | `off`  | `off/30s/1m/5m`                                                     | `:63, 66`, `constants/apm.ts:175-180, 195-200`               |
| `env`       | null   | 자유                                                                  | `:64, 160`                                                   |


- 프리셋 구간: `to = floor(now/60000)*60000`(분 경계 내림 — 초 단위면 리렌더마다 키가 흔들림), `from = to − seconds×1000`(`constants/apm.ts:269-280`).
- **step 자동**(`apmStepSeconds` `constants/apm.ts:229-236`): `≤6h→60 / ≤7d→300 / else 3600`(경계 포함). 단 차트 `minInterval`은 **응답 step**을 쓴다(`red?.step ?? step` — `ApmServiceOverviewTab.tsx:147`, `ApmServiceTransactionsTab.tsx:250`, `ApmServiceRuntimeTab.tsx:100`).
- refresh: 상대 구간 ∧ refreshMs일 때만 `setInterval` tick으로 `from/to` 재계산(`:87-104`); off면 틱 없음("꺼둔 폴링이 뒷문으로 되살아나는 것" 방지). 소비 훅은 `apmRefetchInterval()`로 `null/0/음수 → false`(`useApm.ts:54-56`).
- 전환: 프리셋 클릭 → `from/to` 삭제; RangePicker → `preset=custom`+`from/to`; `custom`인데 NaN이면 기본으로 강등(`:71-79, 108-133`). `updateParams`는 `replace=true`(history 안 쌓임).
- ⚠️ 코드 주석은 "App.tsx가 `location.key`로 리마운트"를 전제하지만 실제 키는 **pathname**(`layouts/app/App.tsx:234-241`) — 같은 경로 쿼리 변경은 리마운트 안 됨. URL 상태 설계는 유효하나 근거 문장이 낡음.

### 10.2 훅 키·폴링·언랩·무효화 (`hooks/useApm.ts`, `useApmAlerts.ts`, `constants/queryKey.ts:412-453`)

- 키 첫 요소는 `APM_QUERY_KEYS.*` 문자열 17개(`"ApmOverview"`…), 시계열·목록 키에 `from/to(/step)` 필수(`queryKey.ts:414-417`). 예 `useApmRedSeries: [RED_SERIES, uid, from, to, step]`(`useApm.ts:132-148`), `useApmEndpoints: [ENDPOINTS, uid, from, to, sort, order, limit, offset, q]`(`:155-175`), `useApmAlertEvents: [ALERT_EVENTS, serviceUid, from, to, limit, offset]`(`useApmAlerts.ts:69-85`).
- `enabled`: `!!uid`(+`!!route`·`!!instanceId`), 알람은 호출부가 `isAdmin`. `staleTime` 미지정 → 전역 60초(`lib/react-query/query.instance.ts:6`).
- 언랩: axios 1겹 + `useDmoveQuery` 1겹 → payload 직접(`hooks/useDmoveQuery.ts:52-57`); 실패 envelope는 throw. 뮤테이션은 `apm.api.ts`의 `unwrapEnvelope`가 직접(`services/apm.api.ts:48-53`). `clean()`이 `null/""` 파라미터 제거(`env=null`이 문자열 "null"로 나가 400 나는 것 방지 `:59-64`).
- 무효화: 서비스 PUT/DELETE → `SERVICES·SERVICE_DETAIL·OVERVIEW`(`useApm.ts:318-342`); 알람 CRUD/resync → `ALERT_RULES·SERVICE_ALERT_RULES·ALERT_ZABBIX_STATUS·SERVICE_DETAIL`(`useApmAlerts.ts:32-42`); preview는 useMutation(무효화 없음); `ALERT_EVENTS`는 어떤 쓰기에서도 무효화 안 됨.

### 10.3 판정·포맷 (`apmDisplay.ts`, `apmAlertDisplay.ts`)

- `apmStatusTone`: UP→good, DEGRADED·STALE→warning, DOWN→critical, UNKNOWN→unknown(`apmDisplay.ts:32-44`; "문구를 항상 같이 적는다"로 STALE/DEGRADED 구분). 심각도 정렬 DOWN&lt;DEGRADED&lt;STALE&lt;UNKNOWN&lt;UP(`:73-79`). 도넛은 STALE만 `HEALTH_TEXT.warning`으로 명도 분리(`ApmStatusDonutCard.tsx:51-61`).
- 오류율 레벨(개요 히트맵) **절대 기준** `{notable:1, critical:5}`: null→빈칸, ≥5 high, ≥1 mid, &gt;0 low, 0 none(`:57-70`).
- 포맷 `apmValueFormatter(unit)`(`lib/echarts/apmTimeSeries.ts:105-122`): ms(≥1000→`1.50 s`), percent, rps, bytes(1024), count. 툴팁·표는 `—`(em dash), 축 라벨은 `-`.
- 알람 동기화 상태: `total≤0→none / missing>0→missing / drift>0→drift / pendingCache>0→pending / synced`(`apmAlertDisplay.ts:41-49`), 재동기화 버튼은 `drift>0`. 임계 검증 `apmAlertThresholdError`(SPIKE `>1`, `≤0` 거부, ERROR_RATE `>100` 거부), 창 1~1440(`:104-131`). 미리보기 `fireCount=breaches.length`(구간) vs `breachWindows=breachCount`(창 수) 구분(`:181-194`). 발화 스트립 48칸(`apmAlertSlots` `:208-237`).
- 배지: `ApmChartCard`가 `rebucketed`(default Tag + `rebucketed_hint`)·`sampleWarning`(warning Tag + 아이콘)을 헤더 extra에(`ApmChartCard.tsx:111-131`). 소스는 RED 응답 플래그 → 개요 탭 5장 공통 `chartFlags`, 트랜잭션 선택 route 3장, 인스턴스 카드; 히트맵은 `rebucketed`만. 런타임·상태코드·메서드 카드엔 소스 없음.

### 10.4 런타임 슬롯 3갈래 (`runtimeSlots.ts:163-172`)

```
apmRuntimeCardState(card, slots, family):
  seriesOf(slots, card.slot, card.seriesName).length → "ready"                 (그린다)
  card.seriesName && slots[card.slot]?.length        → "skip"                  (슬롯은 왔는데 heap/non_heap 차원만 없음)
  card.expected.includes(family)                     → "missing"               ("계측 미제공" 배지 카드)
  else                                                → "skip"                  (아예 안 그림)
```

BE는 "미지원"과 "미수신"을 응답으로 구분하지 않으므로(§7.6) FE가 대응표 10장의 `expected` 패밀리로 가른다(`:64-145` — memory_heap[jvm,dotnet,node,go]·memory_non_heap[jvm]·gc·threads·cpu·classes·pool[]·pool_wait[]·process_cpu/memory[비-JVM]). family는 응답 우선(`ApmServiceRuntimeTab.tsx:97`). GC dual은 수집기별 계열을 `sumSeries`로 합산.

### 10.5 ECharts 빌더·툴팁·표 전환

- 팔레트: CSS 변수 금지(canvas), 빌더 인자 `palette?: TPalette`(`apmTimeSeries.ts:19-21, 79-80`), React는 `usePalette()` 값을 넘김. `buildXAxis`는 `type:"time", min:from, max:to, minInterval: stepSeconds*1000`(`:275-293`), 라벨 `≤1d "HH:mm" / ≤7d "MM-DD HH:mm" / else "MM-DD"`.
- 빌더: `buildApmTimeSeriesOption`(markLine 임계·배포·markArea를 **첫 계열에만** `:313-380`) · `buildApmLatencyOption`(p50/p95/p99 + 투명 밴드 2계열 `__apm_band_*`, 범례 숨김 `:402-489`) · `buildApmDualAxisOption`(rps 막대 + % 선 `:505-576`) · `buildApmLatencyHeatmapOption`(category×category, count 0 제외, `CHART_SEQUENTIAL` `apmDistribution.ts:66-138`) · 도넛/가로막대/게이지(`:170-346`). 상태코드 스택은 화면이 `kind:"bar", stack:"codes"` 5계열로 조립(`ApmServiceTransactionsTab.tsx:265-283`).
- `apmTooltip.ts`: `appendToBody+confine`(`:131-135`), 시각 첫 줄, 시리즈 한 줄 flex, 이름 `max-width 320px + word-break`, 값 `nowrap`, `—`, `__apm_` 계열 제거, `step≥3600`이면 연도 포함(`:50-56, 73-124, 167-197`). **툴팁 안에 드릴다운 링크는 없다** — 링크는 HTML 위젯(히트맵 행·Top5·상태 칩)이 담당.
- `apmChartTable.ts`: `apmSeriesToRows`(행=시각 합집합, 열 `s0,s1…`) · `apmMatrixToRows`(`valueAt` 콜백으로 방향 결정) · `apmItemsToRows`(비율 분모=표 값 합) · `apmMetricsToRows` · `apmStatusToRows`(`:73-319`). 토글은 `useChartView(id)` sessionStorage, 로딩/오류/빈/행 0이면 잠금(`ApmChartCard.tsx:106-166`). 차트가 0을 빼는 곳(히트맵·도넛)도 표는 0을 남김.

### 10.6 상세 탭 12·Phase (`ApmServiceDetailPage.tsx`, `constants/apm.ts:45-86`)

URL `?tab=`(미지 값→`overview`), 탭 변경 시 `offset/sortBy/sortDirection` 삭제(`:78-88`), `Tabs destroyOnHidden`. 활성 P1 5개: overview(`useApmRedSeries`·`useApmLatencyHeatmap`·`useApmAvailability`(24h/step 300 고정, `useMemo[]`)·`useApmEndpoints`×2), transactions(서버 정렬·페이지·q, 선택 route RED, 상태코드, 메서드), runtime, instances(≤6 선택, 카드마다 `useApmInstanceSeries`), settings(PUT/DELETE, 삭제는 `state===HIDDEN` ∧ 이름 입력 일치). 비활성 7(traces/errors/database/dependencies P2·deployments P2·logs P4·synthetics P3): `disabled` + Tooltip `tab_phase_hint` + Phase 배지(`:177-205`). 트랜잭션 탭 전용 URL 키 `route`·`method`, 인스턴스 `instances`(QueryParamKeys에 없음).

### 10.7 도움말

`constants/page-guide.ts:63-96`의 `ENTRIES` + `resolvePageGuide(pathname, search)`(`:355-371`): 경로 길이 내림차순 안정 정렬 → `exact`면 `===`, 아니면 `startsWith(path+"/")` → `tabKeys`에 `?tab=` 값이 있으면 키 교체. 목록(`services` exact)과 상세(prefix)는 길이가 같아 **선언 순서 의존**(테스트가 잡음). 키 11개(`apm_overview`·`apm_services`·`apm_service_detail`+탭 5·`apm_alert_rules`·`apm_collectors`·`apm_placeholder`). 위젯 도움말은 `ApmHelp({helpKey})` → `apm.chart_help.[[ORCA_RICH_MD:1de1280493168838b9d55f887d06f551:inline-html:%3Ckey%3E]].short/.detail`(hover/click), `ApmChartCard.helpKey`는 **필수**, 47키 kr/en 동기화·short ≤80자를 `__tests__/apmHelpContent.test.ts:108-166`가 고정.

### 10.8 라우트·메뉴·권한

경로 14개 `/application-monitoring/*`(`constants/routes.ts:108-146`), 라우트 각각 `[[ORCA_RICH_MD:1de1280493168838b9d55f887d06f551:inline-html:%3CFeatureGate%20feature%3D%22APM%22%3E]]`(`routes/routes.tsx:604-757`, 편의 게이트 — 진짜 차단은 BE). 사이드바 자식 6(`SideNav.tsx:287-349`), 설정 ⚙ 2(`apm-alert-rules`·`apm-slo`, `userRoleAdminOnly` — feature 축 없음 `SettingsMenu.tsx:124-146`), 전역 검색 13. 관리자 축 `useIsUserRoleAdmin()`(`state.auth.userRole`, BE `AdminAccessChecker`와 같은 축, `useIsSuperRole`과 다름 `hooks/useIsUserRoleAdmin.ts:11-25`). i18n `apm.*` 최상단 블록 leaf 487(kr=en).

---

## 11. 설계 결정·트레이드오프


| #   | 결정                                         | 대안                          | 왜 이걸 택했나                                                               | 대가                                        | 근거                                                           |
| --- | ------------------------------------------ | --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| D1  | Collector 필수, 직송 불허                        | 에이전트→BE 직송                  | Java SDK는 protobuf만 → BE protobuf 의존 0; tail 샘플링·큐잉·마스킹이 Collector에 있음 | 설치 단계 +1, 다중 Collector 시 trace 분열         | 설계 §0·Q12                                                    |
| D2  | Postgres 일 파티션 + 롤업 3단                     | ClickHouse/TSDB             | 설치형 "새 DB 없음"                                                          | 1m 7일 ≈ 100M행, 승격 조건 §4.6                 | 설계 §4.4·§4.6                                                 |
| D3  | 1m UPSERT 덧셈 · 롤업 UPSERT 대입                | 둘 다 덧셈/대입                   | 1m은 다른 배치가 같은 버킷에 더함, 롤업은 원본 재계산이라 재실행 멱등 필요                           | 1m 재전송은 두 배(영수증이 유일 방어)                   | `ApmMetric1mStore.java:47-51`, `ApmRollupService.java:35-39` |
| D4  | dedup 판정 앞·영수증 뒤                           | 수신 즉시 기록                    | 503 후 재전송이 영수증에 걸려 조용히 버려지는 것 방지                                       | 적재 중 크래시 시 두 배                            | `ApmOtlpController.java:287-288`                             |
| D5  | 첫 관측 CUMULATIVE는 `<120s`만 수용               | 전부 수용/폐기                    | 기동 직후 1분은 살리고 오래 누적된 값 부풀림 방지                                          | JVM 계열 첫 1분 손실                            | `CumulativeDeltaTracker.java:168-178`                        |
| D6  | temporality 포인트 단위                         | 배치 단위                       | delta 선호에도 UpDownCounter는 CUMULATIVE(R1)                               | 시리즈별 상태(TTL 30분)                          | `OtlpMetricPoint.java:27-29`                                 |
| D7  | 히스토그램 합 = SQL 컬럼 전개 24칸                    | unnest / 자바 / V40 aggregate | 행 폭발·전송량 회피, NULL 첨자로 길이 혼합 안전                                         | 폭 상한 24, V40 존재에도 미교체                     | `ApmMetricStore.java:22-41`                                  |
| D8  | 정규 경계 4패밀리 = Java 기본값                      | 단일 경계                       | 기본 조합 재버킷 0                                                            | 타 스택·exponential은 상시 보간(소표본 68%)          | `CanonicalBounds.java:8-16`                                  |
| D9  | 알람 배달 = Zabbix history.push                | 자체 웹훅                       | Slack/Teams/Jandi·에스컬레이션·유지보수창 공짜(래핑 원칙)                               | 7.0+ 필수, 캐시 대기, 소유권/드리프트 관리               | 설계 §4.5 Q14                                                  |
| D10 | 소유 태그 없으면 재사용도 생성도 안 함                     | 이름 일치 재사용                   | 고객 동명 객체에 push 방지(코덱스 🟡2)                                             | 태그 못 받으면 프로비저닝 통째 막힘; 트리거는 미검사            | `ZabbixAlertBridge.java:753-766`                             |
| D11 | STALE만 트리거 `>0`, 값은 우리 계산                  | `nodata()`                  | "값 안 밈" vs "서비스 사라짐" 구분 불가; 임계 변경 시 트리거 수정 불필요                         | —                                         | `ApmAlertKind.java:119-121`                                  |
| D12 | 판정(우리 이벤트)과 배달(push) 분리                    | 배달 실패=판정 실패                 | 발화 이력은 Zabbix 무관하게 남음                                                  | 매 5분 ERROR 로그 소음 가능                       | `ApmAlertEvaluationService.java:34-42`                       |
| D13 | 롤업 LAG 2분·닫힌 버킷만; 가용성·상태·알람은 1m 직접         | 5m 읽기                       | 최근 ~7분이 5m에 비어 마지막 칸이 항상 죽어 보임                                         | 24h×1m 스캔 → 5분 격자 캐시 키                    | `ApmAvailabilityService.java:24-28`                          |
| D14 | route 상한 도달 시 새 route만 `__other__`, LRU 없음 | LRU                         | 축출하면 시계열이 시간에 따라 무제한                                                   | 상한 낮춰도 기존 집합 유지                           | `ApmDimsNormalizer.java:45-47`                               |
| D15 | traces/logs는 200+카운터                       | 404/405                     | exporter 영구 실패 로그가 메트릭 문제를 가림                                          | 드롭 카운터로만 드러남                              | `ApmOtlpController.java:155-162`                             |
| D16 | 500 금지, 적재 예외 503                          | 500                         | R11: 500은 즉시 폐기                                                        | 전 예외 포착 → 버그도 재시도 루프                      | `:71-73, 321-326`                                            |
| D17 | 부분 실패는 200+WARN                            | 503                         | 저장된 몫이 재전송으로 두 번 계산(1m 덧셈)                                             | 그 리소스 포인트 손실                              | `MetricIngestor.java:133-150`                                |
| D18 | 크기·형식 검사를 인증보다 앞                           | 인증 먼저                       | 토큰 모르는 상대에게 파싱 비용 안 들임                                                 | —                                         | `:95-97`                                                     |
| D19 | `@LicenseExempt` + 컨트롤러 직접 403             | 인터셉터 200+code               | OTLP만 진짜 HTTP 상태 필요                                                    | 게이팅 규칙 변경(A5-c로 못박음), AI 수신기(503)와 정책 불일치 | `:53-55`                                                     |
| D20 | 카운터 정본 = sum, count는 round(Δ)              | count 정본                    | 실수 카운터(`jvm.cpu.time`)                                                 | 조회가 count 읽으면 조용히 틀림                      | `ApmMetric1mStore.java:34-45`                                |
| D21 | 센티널 service_id=0로 수집기 시계열 동거               | 별도 테이블                      | 파티션·롤업·보존 재사용                                                          | 모든 조회에 `service_id>0` 필터 필수               | `ApmCollectorStateService.java:41-51`                        |
| D22 | Zabbix 링크는 AssetService 경유·정확 일치           | ILIKE / Zabbix 직격           | `api`→`api-gateway` 오링크 방지, A3                                         | 미매칭 null, 후보 상한 20                        | `ApmZabbixHostLinker.java:24-34`                             |
| D23 | drops.count 누적, from/to는 lastSeenAt        | 시간축 테이블                     | `(token,reason,metric)` 단일 행                                           | 창 좁혀도 수치 불변                               | `ApmIngestDropStatRecorder.java:63-68`                       |
| D24 | 자동 삭제 없음(숨김까지)                             | 설계 §2.1 자동 삭제               | CASCADE 파괴 연산은 관리자 DELETE EP 사용 관찰 후                                   | 숨김 서비스 데이터 잔존                             | `ApmRetentionService.java:91-94`                             |
| D25 | 정리 배치만 `requiresActiveLicense=false`       | 전부 false                    | 파티션 선생성 막히면 복구 순간 수신 실패; 알람은 프리미엄 동작 자체                                | 만료 중 롤업 정지 → &gt;7일이면 공백 영구(§12)          | `ApmRollupJob.java:18-21`                                    |
| D26 | 프로비저닝 후 push 재시도는 다음 5분 배치                 | 10초 간격 busy-wait            | 배치 안에서 자면 대상 수만큼 잠들고 API에서 자면 저장이 2분                                   | 첫 배달 최대 5분 지연                             | 계약 §6.2                                                      |
| D27 | 승인 대기·unknown은 데이터 폐기                      | 임시 저장                       | 승인 전 저장은 "미등록 앱이 데이터를 남기는" 경로                                          | 승인 전 이력 없음                                | `ApmRegistrar.java:137-143`                                  |


---

## 12. 알려진 한계·잔여 리스크

검수 §3(16건)·§6·§7과 코덱스 판정을 코드 위치와 함께 재정리했고, 이번 분석에서 새로 드러난 것(★)을 더했다. 등급: 🔴 동작 결함 / 🟠 운영 위험 / 🟡 제약·불일치 / 🟢 정리 대상.

### 12.1 이번 분석에서 새로 드러난 것(★)

> **A22~A29는 2026-09-01 상세 주석 작업에서 나왔다** — 코드를 고치려고 읽은 것이 아니라 *설명하려고*
> 읽다가 드러난 것들이다. 여덟 건 중 여섯이 "화면이 그럴듯하게 틀린 값을 보여 주는" 유형이고
> (꺼진 규칙이 적용 중으로 · 초를 ms로 · 지워진 구간을 장애로 · 누적 카운터를 빈 표로),
> 그래서 **증상 신고로는 절대 안 올라온다**. 전건 수정 + 테스트 21개를 붙였다(§12 각 행).
> ⚠️ 번호가 A22부터인 것은 **A21이 이미 쓰이고 있어서**다(dead code·문구 drift, 아래).


| #   | 등급  | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 근거                                                                                                                                                                                    |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 🔴★ | **알람 캐시 유예가 만료되지 않는다.** 배치가 매 5분 `markProvisioned(…, now)`로 `syncedAt=now`를 쓰고 같은 `now`로 push → `withinCacheGrace` 항상 참 → 영구 "does not exist/No permissions" 실패가 영원히 pendingCache, error 배지가 안 선다(의도 "권한 문제가 '동기화 중'으로 위장하면 안 된다"와 정반대). 테스트는 `syncedAt`을 수동 조작 **→ 수정(2026-08-31): `ZabbixAlertBridge.java:190-196`(id가 그대로면 아무것도 안 쓴다 — `markProvisioned`는 생성·재생성·enforce에서만), `ApmAlertRuleBinding.java:98-115`(주석으로 못 박음), `ZabbixAlertBridge.java:520-524`(push 성공이 push 오류 배지를 내린다 — 유예가 진짜로 만료되자 필요해진 회복 경로), 테스트 `ZabbixAlertBridgeTest` 상태 전이 5건**                                               | `ZabbixAlertBridge.java:183, 509-513`, `ApmAlertRuleBinding.java:99-106, 141-143`, `ApmAlertEvaluationService.java:114, 158`; `ZabbixAlertBridgeTest.java:325`                        |
| A2  | 🔴★ | **02:00 sync 배지가 02:05에 지워진다.** 같은 `markProvisioned`가 `drift=false·error=null` 리셋 → drift·NOT_SUPPORTED 사유가 화면에 거의 안 보임(꺼진 규칙 제외) **→ 수정(2026-08-31): 평가 배치는 drift·error를 건드리지 않는다(A1과 같은 `ZabbixAlertBridge.java:190-196`). 해소는 sync 배치·resync·재생성뿐 — `ApmAlertSyncService.java:150`이 회복 시 자기 배지를 내리고(`ApmAlertRuleBinding.clearNotSupportedError`:164), push 성공은 자기 배지만 내린다(`clearPushError`:149, 접두 `ERROR_PREFIX_NOT_SUPPORTED`:56으로 출처 구분)**                                                                                                                                                         | `ApmAlertSyncService.java:113, 141` vs `ApmAlertRuleBinding.java:102-103`                                                                                                             |
| A3  | 🔴★ | **규칙 비활성화 시 Zabbix 트리거는 활성 유지**(status 쓰기 없음), 마지막 push 값으로 Problem 지속 가능; 우리 열린 이벤트도 평가에서 빠져 영영 미해소 **→ 수정(2026-08-31): `ApmAlertService.java:254·270-300`(enabled가 바뀔 때만 `applyEnabledState` — 우리 DB 먼저 닫고 Zabbix 나중, 실패해도 CRUD는 성공), `ZabbixAlertBridge.setTriggersEnabled`:563(소유 태그 확인 후 `status` 0/1), 삭제도 `ApmAlertService.java:316`에서 열린 이벤트를 닫는다. ⚠️ 해소 사유(`RULE_DISABLED`)는 컬럼이 없어 로그에만 남겼다(마이그레이션·FE 계약 확대를 피함). 잔여 보완(2026-08-31, 코덱스 2차 검수 #3): 다건 `trigger.update`의 부분 실패가 루프를 끊어 나머지 트리거가 켜진 채 영구히 남던 것 — 바인딩별 완주 + `TRIGGER_STATUS_PENDING` 표식 + 평가·sync 배치 시작부 재시도로 닫음(§8 "트리거 상태 전이")** | `ApmAlertService.java:338-340`, `ApmAlertEvaluationService.java:92`                                                                                                                   |
| A4  | 🟠★ | **THEIRS가 임계 검증 우회** — STALE 트리거 상수는 항상 0이라 drift 없이 THEIRS를 누르면 임계 0 채택 → 모든 서비스 STALE 발화. SPIKE ≤1·ERROR_RATE &gt;100도 통과 **→ 수정(2026-08-31): `ApmAlertService.java:370-376`(STALE THEIRS는 `APM_ALERT_RESYNC_MODE_INVALID`로 거부 — 상수 0은 임계가 아니다), `:400`(채택값도 CRUD와 같은 `validThreshold`를 통과). 거절하면 규칙도 Zabbix도 안 건드린다**                                                                                                                                                                                                                                                                                  | `ApmAlertService.java:308-329` vs `:516-532`                                                                                                                                          |
| A5  | 🟠★ | **라이선스 만료 &gt;7일 → 롤업 공백 영구화.** 롤업(true)은 멈추고 retention(false)은 1m 파티션을 DROP; 복구 후 워터마크 다음 버킷부터 진행하며 행 0이어도 전진 → 사라진 구간은 5m/1h에 절대 안 채워짐. 주석 "원본은 그대로 있으니"는 ≤7일 가정 **→ 수정(2026-08-31): `ApmRollupJob.java:18-32·50-56`(`requiresActiveLicense()=false` — 기준을 "정리 계열"에서 "수집 소스에 나가는가"로 다시 세움, `SchedulerJob.java:42-53`도 함께 갱신), `ApmRollupService.java:169-176·201-206`(0행이면 워터마크를 붙잡되 ① 창이 상한에 잘렸거나 ② 원본 보존 경계를 넘겼으면 전진 — 무한 정지 방지). 테스트 `ApmRollupWatermarkTest` 4건**                                                                                                                                   | `ApmRollupService.java:134-156, 165-170`, `ApmRollupJob.java:18-21`, `ApmRetentionJob.java:87-91`                                                                                     |
| A6  | 🟠★ | ~~대상 집합에서 빠진 스코프(HIDDEN 전환·서비스별 규칙이 전역을 덮음)의 binding·Zabbix 객체 정리 경로 없음 → Problem 지속(추정)~~ **→ 수정(2026-09-01)**: `V42` `orphaned_at` 신설 + 평가 배치의 고아 정리(`ApmAlertOrphanSweeper`) — 대상에서 빠지면 그 쌍의 트리거 `status=1` + 열린 이벤트 해소 + 표식(아이템은 유지), 돌아오면 되켜고 표식 해제, **한 번만** 한다. 규칙 행이 사라진 바인딩만 객체째 삭제. 서비스 삭제는 표식이 아니라 **삭제 직전 정리**(`ApmAlertService.releaseService` — 행이 지워지면 FK CASCADE로 바인딩이 먼저 사라져 id를 잃는다). 테스트 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `ApmAlertService.java:462-471`, `ApmAlertSyncService.java:77`                                                                                                                         |
| A7  | 🟠★ | ~~전역·서비스별 규칙이 같은 서비스·같은 kind에서 **아이템 1개를 공유**(키에 rule_uid 없음) → 한쪽 삭제 시 공유 아이템 삭제 → Zabbix가 다른 규칙 트리거 cascade 삭제(다음 배치가 재생성, 이력 소실)~~ **→ 수정(2026-09-01)**: 공유는 **의도로 확정**(아이템은 (kind, 서비스)의 것, 트리거만 규칙 단위 — 규칙마다 아이템을 만들면 갈아탈 때 이력이 끊긴다). 삭제에 **참조 카운트** 도입(`findByZbxItemid` — 살아남는 바인딩이 있으면 아이템은 두고 트리거만 삭제), 덮개로 물러난 전역은 A6의 트리거 disable로 처리. 계약 §6.2·§6.3에 명시                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `ApmAlertKind.java:105-107`, `ZabbixAlertBridge.java:280-292, 559-567`                                                                                                                |
| A8  | 🟡★ | `mask_sql`·`keep_raw_sql` 설정의 소비자 0건 — 실제 스위치는 요청별 `keepRawSql` 옵션. V39 `updated_by`·WARN 로그는 아무 동작도 바꾸지 않는 값을 감사 **→ 수정(2026-08-31): `ApmCollectorConfigService.java:93-104`가 요청에 `keepRawSql`이 없으면 설정값을 기본으로 채운다(요청 명시가 우선). `mask_sql`은 P2 스팬 마스킹용이라 P1 미사용임을 `ApmSettingService.java:107-118` 주석에 명시**                                                                                                                                                                                                                                                                                                | `ApmSettingService.java:107-115`, `ApmCollectorConfigGenerator.java:105`                                                                                                              |
| A9  | 🟡★ | 두 OTLP 수신기의 만료 정책 불일치 — APM 403 폐기 vs AI 모니터링 503 재시도. A5 주석은 503만 서술 **→ 정리(2026-08-31): 의도된 차이임을 두 컨트롤러 주석에 상호 참조로 명시(`ApmOtlpController.java:270-271`·`AiMonitorOtlpController.java:173-175`). 코드 변경 없음**                                                                                                                                                                                                                                                                                                                                                                                              | `ApmOtlpController.java:260-265`, `aimonitor/otel/AiMonitorOtlpController.java:173-176`, `LicenseArchitectureTest.java:151-157`                                                       |
| A10 | 🟡★ | 토큰 `scopes`·`kind` 미강제 → RUM kind 토큰도 OTLP 적재 가능(P4 전 잠재) **→ 수정(2026-08-31): `ApmOtlpController.java:257-269·351-366` — `kind=COLLECTOR` ∧ `scopes`에 `ingest`가 없으면 403(빈 배열도 거부)**                                                                                                                                                                                                                                                                                                                                                                                                                       | `ApmOtlpController.java:251-255`, `ApmReceiveTokenService.java:181-204`                                                                                                               |
| A11 | 🟡★ | `PENDING_APPROVAL` 상태를 `apm_service`에 쓰는 코드가 없다(승인은 곧장 ACTIVE) → `ApmRegistrar`의 `pendingApproval` 분기·`ApmService.approve()`는 도달 불가. ALLOWLIST 전용 사전 등록 API도 없음 **→ 문서화(2026-08-31): `ApmService.java:38-50`에 "state 실사용은 ACTIVE/HIDDEN, PENDING_APPROVAL은 예약"으로 명시. enum 값은 FE 타입과 얽혀 둘다. 코드 변경 없음**                                                                                                                                                                                                                                                                                                     | `ApmRegistrar.java:145-154`, `ApmRegistryWriter.java:58`, `ApmRegistryService.java:91`                                                                                                |
| A12 | 🟡★ | 적재 예외 처리가 `catch (Exception)` 전체 → 503 → 코드 버그(NPE)도 exporter 재시도 루프                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `ApmOtlpController.java:321-326`                                                                                                                                                      |
| A13 | 🟡★ | `apm_metric_1m` UPSERT는 경계 불일치를 감지하지 않음 — 같은 PK에 다른 경계 벡터가 오면 `apm_int_array_add`가 원소별로 그냥 더하고 `bounds_id`는 먼저 온 것 유지(배치 내 병합만 폐기+WARN)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `ApmMetric1mStore.java:75-83, 408-416`                                                                                                                                                |
| A14 | 🟡★ | 가용성 24h 퍼센트가 UNKNOWN(수집기 장애) 칸도 감산 — DTO 주석과 불일치                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `ApmAvailabilityService.java:136-141, 168-175`, `ApmAvailabilityDto.java:15-17`                                                                                                       |
| A15 | 🟡★ | 상태 판정 시각 축 불일치: 임계 창은 `range.lastMinutes(5)`(요청 창 끝), STALE은 `LocalDateTime.now()` → 과거 창 조회 시 "그때 오류율"에 "지금 STALE"이 섞임                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `ApmServiceQueryService.java:384-387, 403`                                                                                                                                            |
| A16 | 🟡★ | exponential 음수 버킷 무시 → `sum(counts) ≠ count` 가능                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `OtlpMetricsReader.java:259-263, 175`                                                                                                                                                 |
| A17 | 🟡★ | 보존 일수(7/30/400)가 `ApmResolution` 상수 사본 — 잡 옵션만 바꾸면 갈림. 롤업 시드 options `{}`, retention 시드에 `receiptDays` 없음                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `ApmResolution.java:20-33`, `mig/V38__apm_p1.sql:451-456`                                                                                                                             |
| A18 | 🟡★ | `apm_alert_event` 400일 보존 미구현(`deleteByFiredAtBefore` 호출처 0); `apm_collector` 행 영구 누적                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `ApmAlertEventRepository.java:40-41`, `ApmRetentionService.java:47-120`                                                                                                               |
| A19 | 🟡★ | 알람 평가가 단일 `@Transactional` 안에서 Zabbix HTTP(프로비저닝 N회·push·event.get) 수행; 대상마다 `item.get`+`trigger.get` 2콜; `targetsOf`·`events()` findAll                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `ApmAlertEvaluationService.java:90-91`, `ApmAlertService.java:145-154, 462`                                                                                                           |
| A20 | 🟡★ | ~~FE 수집기·토큰 화면 미구현(자리표시)~~ **→ 해소(2026-08-31): 수집기 화면이 탭 4개로 구현됐다 — 상태(`ApmCollectorStatusTab`) · 토큰 발급/회수와 설정(YAML) 생성(`ApmCollectorTokensTab`) · 설치 가이드(`ApmCollectorInstallTab`) · 등록 설정(`ApmCollectorRegistrationTab`). 온보딩 1단계도 `?tab=tokens` 딥링크로 발급 자리에 바로 보낸다(`ApmOnboardingEmpty.tsx`). 화면 전체가 관리자 전용이라 비관리자는 훅 자체를 끈다.** 남은 것(전부 미수정): ① 알람 이력 스트립이 **현재 페이지 20건만** 집계 — 표는 페이지, 스트립은 구간 전체여야 맞다 ② 24h 가용성 창이 **마운트 시 고정**(`useMemo` deps `[]`) — 오래 열어 두면 창이 뒤처진다 ③ 상대 창+refresh 시 tick 키 변경과 `refetchInterval` 이중 조회 가능(추정)                                                                   | `ApmCollectorsPage.tsx`, `tabs/ApmCollector*Tab.tsx`, `ApmOnboardingEmpty.tsx:54-70`, `ApmAlertEventsTab.tsx:59-67`, `ApmServiceOverviewTab.tsx:105-110`, `useApmTimeRange.ts:90-104` |
| A21 | 🟢★ | Dead code·문구 drift: `ApmAlertRule.markSynced/markDrift`·V38 zbx 컬럼, `ApmAlertRuleBinding.clearObjects`, `ApmIngestRecentTracker.forget`, `Step.sourceHasInstanceAxis`, `ApmService.approve/isActive`; "points 항상 0" stale 문구; `ApmHistBounds` 주석 패밀리 2개(실제 4); `ApmSchemaIT` DisplayName "13개/2벌"(실제 14/4); 템플릿 주석 "5xx 재시도"(500은 폐기); FE 주석 "location.key 리마운트"(실제 pathname)                                                                                                                                                                                                                             | 각 파일 §참조                                                                                                                                                                              |
| A22 | 🔴★ | **적용 규칙과 감시 대상이 어긋났다.** 화면용 `ApmAlertService.forService`는 **꺼진** 서비스별 규칙도 전역을 덮은 것으로 표시하는데, 배치가 쓰는 `targetsOf`는 **활성** 서비스별 규칙만 덮개로 친다 → 규칙을 꺼 둔 서비스에서 화면은 "서비스별 규칙(꺼짐) 적용"이라 말하고 실제로는 **전역 규칙이 다른 임계로** 감시했다 **→ 수정(2026-09-01): 두 판정을 같은 문장으로 통일하고(`ApmAlertService.java:171-215`), 꺼진 규칙은 목록에 남기되 `effective=false`·`appliedRuleUid`(실제로 도는 규칙)를 DTO에 실었다(`ApmAlertRuleDto.java:61-70`). ⚠️ 그 종류만 응답 줄이 2개가 된다(꺼진 서비스별 + 도는 전역) — 계약 `features/apm/core/contract_apm.md` §6 표. 테스트 3건** | `ApmAlertService.java:171-215, 731-741`, `ApmAlertRuleDto.java:61-70` |
| A23 | 🟠★ | **개요 `recentAlerts[].kind`가 저장 표기 그대로 나갔다.** `ApmAlertQueryStore`는 SQL 결과를 옮길 뿐이라 옛 표기(`LATENCY_P95`·`COLLECTOR_SEND_FAILED`)가 그대로 실렸고, 알람 화면은 `ApmAlertKind`로 정규화한 값을 쓴다 → 같은 이벤트가 두 화면에서 다른 문자열. FE는 이 값으로 색·아이콘을 고르므로 **에러 없이** 기본값으로 떨어진다 **→ 수정(2026-09-01): `ApmOverviewQueryService.recentAlerts`가 `ApmAlertKinds.toWire`를 씌우고 같은 표에서 `thresholdUnit`까지 받아 동봉(FE 요청). 모르는 종류의 단위는 빈 문자열 — 지어내지 않는다. 계약 표본 `overview.json` 갱신, 테스트 3건** | `ApmOverviewQueryService.java:247-262`, `ApmOverviewDto.java:104-121`, `ApmAlertQueryStore.java:45-52` |
| A24 | 🟠★ | **`CanonicalBounds.familyFor`가 단위를 무시했다.** `db.client.connection.*_time`을 이름만 보고 **항상 ms 패밀리**로 접어, 같은 이름을 **초**로 보내는 계측의 값이 전부 첫 버킷으로 몰린다 — 화면에는 "모든 커넥션 대기가 0ms"라고 **그럴듯하게** 나온다 **→ 수정(2026-09-01): `familyFor(name, unit)`으로 확장하고 `pool_s`(ms 격자를 1000으로 나눈 같은 모양) 신설. `unit=s`면 초 격자, 그 외·미상이면 기존 이름 규칙(실측 기본이 ms라 null을 주면 가장 흔한 경로가 통째로 '정규 없음'이 된다). `Row`에 `unit` 추가(13-인자 판은 남겨 호출부 무변경), `family` 라벨도 단위를 따라간다(`isMillis`가 그 문자열 하나로 단위를 읽는다), `ApmHistBoundsCatalog.isCanonical`에 5번째 추가. 테스트 4건** | `CanonicalBounds.java:88-175`, `ApmMetric1mStore.java:355-370, 425-445`, `MetricIngestor.java:314-320`, `ApmHistBoundsCatalog.java:113-127` |
| A25 | 🟡★ | **토큰 해시 형식 둘이 서로를 거부했다.** `ReceiveTokenService.matches`가 `rcv:v1:` 접두어를 요구해 APM의 64자 해시를 넘기면 **유효한 토큰인데도 항상 false**. 실사용 경로는 APM 내부가 일관돼(발급·대조 모두 `sha256Hex`) 증상이 없었지만, "이 클래스의 대조 함수"라는 이름이 그 오용을 부른다 **→ 정리(2026-09-01): `matches`가 접두어 유무로 형식을 판별해 둘 다 받는다(마이그레이션 없음). 토큰 저장 형식에 이름을 준 `hashBare`를 신설하고 APM이 범용 `sha256Hex` 대신 그것을 쓴다(발급·대조가 같은 함수). 형식 통일은 `char(64)` 컬럼 확장 + 전량 재발급이라 **하지 않았다**. 테스트 2건** | `ReceiveTokenService.java:26-46, 99-160`, `ApmReceiveTokenService.java:42-55, 179, 268` |
| A26 | 🟡★ | **`drops`에 `to`만 주면 조용히 "최근 1시간"이 됐다.** 컨트롤러가 한쪽만 와도 `ApmTimeRange.of`로 창을 만들었고 그것이 빠진 경계를 채운다 → 누적 카운터의 대부분이 사라진 표가 "폐기 없음"처럼 보인다(둘 다 생략한 경우만 막아 둔 방어가 한쪽만 준 경우엔 뚫려 있었다) **→ 수정(2026-09-01): `drops(tokenId, fromMs, toMs)` 신설 — 두 경계가 서로 독립이고 없는 쪽은 그 방향으로 무한. 뒤집힌 창은 보정하지 않고 빈 표 + WARN(기본 창으로 접는 것이 바로 그 버그다). 계약 §8.2-1 갱신, 테스트 2건** | `ApmIngestDropQueryService.java:66-125`, `ApmIngestStatusController.java:90-104` |
| A27 | 🟡★ | **서비스 삭제가 등록 캐시를 안 비웠다.** 최대 TTL(10분) 동안 다음 수신이 **지워진 `service_id`**로 시계열을 적재하고 그 데이터는 어느 화면에도 안 나온다(`touchService`는 행이 없으면 무동작이라 조용하다). 같은 이름의 앱이 다시 떠도 죽은 캐시 항목이 계속 답한다 **→ 수정(2026-09-01): `delete`가 `ApmRegistrar.clearCache()`를 **커밋 후**에 부른다(트랜잭션 안에서 비우면 동시 수신이 아직 살아 있는 행으로 다시 채운다). 승인·거절이 이미 같은 함수를 부르고 있었다. 테스트 2건** | `ApmServiceQueryService.java:461-500` |
| A28 | 🟡★ | **가용성 스트립만 보존 승격이 없었다.** `series`는 언제나 `apm_metric_1m`(7일)을 읽어, 그 밖의 창을 열면 수신 행이 0건이라 구간 전체가 STALE/UNKNOWN — "데이터가 지워졌다"를 "그때 죽어 있었다"로 그린다 **→ 수정(2026-09-01): `ApmResolution.rawWithinRetention`(1m 원칙 + 보존 밖이면 승격)으로 단을 고르고, 승격 시 롤업 지연으로 비는 **최근 30분은 1m으로 덧댄다**. `receivedCells`에 (해상도, origin, from, to) 판 추가 — origin을 따로 받아야 두 질의의 칸 인덱스가 같은 자를 쓴다. 🔴 **답할 수 없는 칸은 `status` 키가 빠진다**(읽는 단이 칸보다 굵거나 그 단의 보존마저 넘음) — UNKNOWN은 이미 관측 결과라 같은 값으로 칠하면 화면이 다시 거짓말을 한다. 계약 표본 `availability.json` 갱신, 테스트 2 + IT 1** | `ApmAvailabilityService.java:118-215`, `ApmMetricStore.java:664-712`, `ApmResolution.java:130-146`, `ApmAvailabilityDto.java:33-56` |
| A29 | 🟡★ | **설정 캐시를 트랜잭션 안에서 재적재했다.** `update`가 `evict()` 직후 `get()`을 불러 **아직 커밋되지 않은 값**으로 캐시를 채운다 → 롤백되면 최대 30초 동안 DB에 없는 값이 수신·배치의 판정에 쓰인다(`registration_mode` 하나면 그 30초의 서비스가 통째로 다르게 등록된다). "지금은 검증이 전부 쓰기 앞이라 롤백 경로가 없다"는 이 클래스만의 사정이고 바깥 트랜잭션이 실패하면 무너진다 **→ 수정(2026-09-01): 무효화를 `afterCommit`으로 옮기고(트랜잭션이 없으면 즉시 실행 — 단위 테스트·배치가 같은 효과를 본다), 응답은 캐시가 아니라 **방금 쓴 DB 행**으로 만든다(안 그러면 "저장했는데 화면이 안 바뀐다"). 테스트 3건** | `ApmSettingService.java:262-340, 400-470` |


### 12.2 검수 §3 16건·§6·§7 재정리(코드 위치)


| #   | 판정    | 내용                                                                                                                                                                         | 근거                                                                                                     |
| --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | 허용    | 부분 실패(일부 리소스 예외) 200+WARN — 그 포인트는 재전송 안 됨                                                                                                                                 | `MetricIngestor.java:133-150`                                                                          |
| 2   | 허용    | 카운터 `count`는 `round(Δsum)`, 정본 `sum` — 조회가 count 읽으면 조용히 틀림                                                                                                                | `MetricIngestor.java:331-332`, `ApmMetric1mStore.java:34-45`                                           |
| 3   | 허용    | CUMULATIVE 히스토그램 min/max는 시리즈 전체                                                                                                                                           | `MetricIngestor.java:325-329`                                                                          |
| 4   | 허용    | 첫 관측 `<120s` 아니면 폐기                                                                                                                                                        | `CumulativeDeltaTracker.java:168-178`                                                                  |
| 5   | 허용    | 재버킷 소표본 p95 오차 68% → `sampleWarning<20`만                                                                                                                                   | `ApmPercentiles.java:28-34`, `HistogramRebucketerTest.java:135-155`                                    |
| 6   | 허용    | 롤업 LAG 2분, 늦은 도착 미반영                                                                                                                                                       | `ApmRollupService.java:41-44, 58`                                                                      |
| 7   | 허용    | 전량 프로비저닝 실패만 예외, 이벤트 기록은 그 전에 끝남                                                                                                                                           | `ApmAlertEvaluationJob.java:44-51`                                                                     |
| 8   | 허용    | 가용성 분모는 `firstSeenAt` 이후; 시계열 점은 등록 전 STALE(E2E 발견 1, 미수정)                                                                                                                 | `ApmAvailabilityService.java:186-199`                                                                  |
| 9   | 허용    | route 상한 낮춰도 기존 집합 유지                                                                                                                                                      | `ApmDimsNormalizer.java:79-81`                                                                         |
| 10  | 제약    | 수집기 판정 전역(1m에 token_id 없음) — 여럿 중 하나만 끊기면 UNKNOWN 아닌 STALE                                                                                                                 | `ApmStatusJudge.java:24-28`, `ApmServiceQueryService.java:567-573`                                     |
| 11  | 허용    | FeatureInterceptor 면제·A3 정정 = 게이팅 규칙 변경, A5-c가 전수 검사                                                                                                                       | §1.6                                                                                                   |
| 12  | 허용    | `OtlpMetricsParser`(AI 전용)가 `otel/`에 공존 — 방향 규칙만                                                                                                                           | `OtelArchitectureTest.java:21-23`                                                                      |
| 13  | 허용    | FE `from/to` ms vs 초 공유(`apmEpochMs` 보정) · 설정 ⚙에 라이선스 축 없음 · 작은 rps "0 rps"                                                                                                | `constants/apm.ts:256-264`, `SettingsMenu.tsx:124-146`                                                 |
| 14  | 허용    | 알람 화면 비관리자 빈 화면(BE가 목록까지 관리자) · `recentAlerts` 단위 파생                                                                                                                       | `ApmAlertRulesPage.tsx:36, 64-72`                                                                      |
| 15  | 보류→해소 | drops.count 누적·lastSeenAt 필터 규약 · 생성 yaml 실기동은 E2E 3회차 validate로 확인                                                                                                        | §9.4, E2E 3회차                                                                                          |
| 16  | 잔여    | 로케일 파일 복원 사고 — 기존 네임스페이스 하위 미참조 키 소실 가능성(이론상)                                                                                                                              | 검수 §3-16                                                                                               |
| §6  | 잔여    | `max-compressed-bytes` 2MB는 추정값(413 즉시 폐기) · 트리거엔 소유 태그 검사 없음 · `notOwnedConflicts` FE 배지 미반영                                                                              | `ApmOtlpController.java:102-112`, `ZabbixAlertBridge.java:359-369`                                     |
| §7  | 잔여    | 오류율 임계 서비스별 덮어쓰기 미구현(p95만) · STALE 연장 설정·4xx 포함 옵션은 설계만 · 비-JVM 런타임 슬롯 표만(허용목록 없음, Node event loop 슬롯 없음) · `endpoints/series` activeRequests 항상 null · 인스턴스 지표 1m 보존 안에서만 | `ApmServiceQueryService.java:472`, `RuntimeSlotMap.java:246-300`, `ApmSeriesQueryService.java:118-127` |
| 미검증 | —     | 성능(6h/1m·서비스 20+), 드리프트/파티션/보존 잡 실행, 다중 인스턴스, .NET/Node/Python 계측(R12), R14 BE측(PII), 라이선스 만료 QA, Zabbix 알림 **도달**(액션 0), FE 다크모드·나머지 탭 브라우저 렌더                            | 검수 §4                                                                                                  |


### 12.3 다음에 손댈 때 먼저 볼 파일 10개


| 순서  | 파일                                                                                                  | 이유                                                                             |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `apm/collector/ingest/ApmOtlpController.java`                                                                 | 수신 계약 전부(판정 순서·응답 코드·상한)가 한 파일. 여기 503/403 규칙을 깨면 exporter가 데이터를 버린다           |
| 2   | `apm/collector/ingest/store/MetricIngestor.java`                                                                    | 조립 라인의 순서(④→⑤)·집계 정의·503/200 판정 — 적재 의미론의 본체                                   |
| 3   | `apm/collector/ingest/store/ApmMetric1mStore.java`                                                                  | 덧셈 UPSERT·재버킷·bounds_id·PK 병합·시스템 TZ — 저장 형식을 바꾸면 롤업·조회가 같이 흔들린다               |
| 4   | `apm/service/registry/auto/ApmRegistrar.java`                                                                    | 서비스 귀속·모드·캐시·경합. "유령 서비스"나 "데이터가 안 쌓임"의 첫 용의자                                  |
| 5   | `apm/core/batch/rollup/ApmRollupService.java`                                                                   | 워터마크·LAG·대입 UPSERT·bounds 불일치·TZ 버킷 — 5m/1h 수치가 이상하면 여기                        |
| 6   | `apm/core/metric/ApmMetricStore.java`                                                                     | 모든 화면 숫자의 SQL. 컬럼 전개 24칸·칸 인덱스 차이 식·센티널 제외                                     |
| 7   | `apm/service/list/ApmServiceQueryService.java` + `ApmStatusJudge.java`                                     | 목록 조립 6질의·상태 판정 순서·임계 출처 — "왜 DEGRADED인가"의 답                                   |
| 8   | `apm/alert/bridge/ZabbixAlertBridge.java` + `ApmAlertRuleBinding.java`                                     | Zabbix 객체 규약·소유 태그·캐시 유예·상태 전이 — A1·A2 수정 지점                                   |
| 9   | `apm/alert/evaluate/ApmAlertEvaluationService.java` + `ApmAlertEvaluator.java`                               | 판정식·창·push 분리 — 트리거 표현식과 같아야 한다는 불변식                                           |
| 10  | `src/main/resources/apm/collector-template.yaml` + `apm/collector/config/ApmCollectorConfigGenerator.java` | 고객 망에 배포되는 유일한 산출물. 치환은 설정 줄만, keepRawSql은 양쪽 제거 — 형식 바꾸면 텍스트 규칙(들여쓰기 2칸)이 깨진다 |


FE는 `hooks/useApmTimeRange.ts`(URL 시간 축)·`constants/apm.ts`(step·프리셋)·`pages/application-monitoring/runtimeSlots.ts`(3갈래)·`lib/echarts/apmTimeSeries.ts`(응답 step→minInterval) 네 파일이 나머지 화면의 전제다.