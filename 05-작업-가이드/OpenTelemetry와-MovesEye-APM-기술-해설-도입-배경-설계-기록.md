# OpenTelemetry와 MovesEye APM — 기술 해설·도입 배경·설계 기록

- 작성: 2026-09-03
- 독자: MovesEye 개발·운영·영업. OpenTelemetry(이하 OTel)를 처음 접하는 사람도 끝까지 읽을 수 있게 썼다.
- 정본 설계서: `_workspace/designs/devdesign_apm.md` v3.3 · 화면/WBS `devdesign_apm-screens-wbs.md` · 코드 해설 `_workspace/guides/apm-code-walkthrough.md`
- 실측 기록: `_workspace/verification/r1_apm-collector-roundtrip.md`(Collector↔BE) · `r3_apm-volume.md`(볼륨) · `r10_apm-zabbix-history-push.md`(Zabbix 알람 배달)
- 이 문서의 위치: 설계서가 "무엇을 어떻게 만든다"라면, 이 문서는 "OTel이 무엇이고 왜 이렇게 설계했는가"를 설명한다. 수치·결정은 전부 설계서와 실측 기록에서 가져왔다.

---

## 목차

1. 요약
2. OpenTelemetry란 무엇인가 (기술 해설)
3. 왜 도입이 필요했나 (배경·대안 비교)
4. Zabbix의 한계 — APM 관점
5. APM에는 무엇이 필요한가
6. 설계 중점 (핵심 결정 10가지)
7. 적용 방법 (설치·계측 절차)
8. 어떤 API를 쏘는가 (앱 → Collector → BE → Zabbix)
9. 동작 원리 (수신에서 화면까지)
10. OpenTelemetry의 한계
11. 실측이 설계를 뒤집은 것 (교훈)
12. 용어집

---

## 1. 요약

**한 줄.** 고객 애플리케이션에 OpenTelemetry 자동계측 에이전트를 붙이고(코드 수정 0), 고객 망 안의 OpenTelemetry Collector가 받아서 정리·샘플링한 뒤 MovesEye BE로 보낸다. BE는 Postgres에 저장하고 **서비스 단위**로 응답시간·처리량·오류율·런타임을 보여주며, 트레이스로 원인을 좁힌다.

```
[고객 앱]                     [고객 망 안, Collector 1대]              [MovesEye]
Java  -javaagent ─┐                                                   
.NET  자동계측     ├─ OTLP(gRPC 4317 / HTTP 4318) ─► OTel Collector ─ OTLP HTTP/JSON ─► POST /apm/otlp/v1/{metrics,traces,logs}
Node  --require   │                                · 메모리 제한·배치                        │ 토큰 검증·허용목록·정규화
Python instrument ┘                                · 속성 삭제·PII 마스킹                    ▼
                                                   · tail 샘플링(오류·느림 100%)          Postgres(1m→5m→1h 롤업, 스팬 7일)
                                                   · 인증 헤더 부착·디스크 큐                  │
                                                                                            ├─► 화면(서비스·엔드포인트·트레이스·맵)
                                                                                            └─► 알람 판정 → Zabbix history.push → Slack/Teams/메일
```

**왜 OTel인가.** 서버 모니터링(Zabbix)은 "호스트가 살아 있나"에 답하지만 "사내 Jira가 지금 느린가"에는 답하지 못한다. 그 질문에 답하려면 요청 하나하나의 지연·오류·호출 경로가 필요하고, 그것을 앱 안에서 꺼내는 표준이 OTel이다. 자체 에이전트를 만들지 않고, 락인 없는 개방형 표준을 그대로 쓴다.

**현재 상태(2026-09-03).** P1(메트릭·알람·수집기)·P1.5(실시간)·P2(트레이스·서비스 맵·에러/DB/외부 호출·배포) 구현 완료, 코덱스 검수 7회전·런타임 QA 통과. P3(SLO·합성 감시·리포트)·P4(RUM·로그·K8s) 미착수.

---

## 2. OpenTelemetry란 무엇인가

### 2.1 정의와 출신

OpenTelemetry는 **관측 데이터(텔레메트리)를 만들고·모으고·내보내는 방법을 표준화한 CNCF 오픈소스 프로젝트**다. 2019년에 분산 추적 표준이던 OpenTracing과 Google 계열의 OpenCensus가 합쳐져 만들어졌다. Kubernetes 다음으로 기여가 많은 CNCF 프로젝트이며, Datadog·New Relic·Elastic·Grafana·AWS·Azure 등 거의 모든 관측 벤더가 수신 형식으로 지원한다.

핵심은 **"벤더 중립"** 이다. OTel은 데이터를 **만들고 보내는 쪽**만 표준화하고, **저장·분석·화면은 표준화하지 않는다.** 그래서 OTel 자체는 APM 제품이 아니다. 백엔드(저장소와 화면)는 누군가 만들어야 하고, MovesEye APM이 그 백엔드다.

### 2.2 구성 요소

| 구성 요소 | 역할 | 우리가 쓰는 것 |
|---|---|---|
| **Specification** | API·SDK·데이터 모델·프로토콜·시맨틱 컨벤션의 명세. 언어 무관 | 전부 따른다 |
| **API** | 앱 코드가 호출하는 인터페이스(스팬 만들기, 카운터 올리기). 구현이 없으면 no-op | 자동계측이 대신 호출 |
| **SDK** | API의 구현체. 샘플링·배치·export를 담당. 언어별(Java·.NET·Node·Python·Go 등 11개) | 에이전트에 내장 |
| **계측 라이브러리(Instrumentation)** | 프레임워크·라이브러리(Spring MVC·JDBC·HttpClient·Kafka 등)에 붙어 API를 호출해 주는 코드 | 자동계측 에이전트가 번들 |
| **자동계측 에이전트** | 앱 코드 수정 없이 계측 라이브러리를 주입하는 실행 파일. Java는 `-javaagent` jar | **고객 앱에 붙이는 것** |
| **OTLP** | OpenTelemetry Protocol. 시그널을 전송하는 와이어 프로토콜(gRPC/HTTP, protobuf/JSON) | 앱→Collector, Collector→BE 둘 다 |
| **Collector** | 받아서·가공하고·내보내는 독립 프로세스(Go 단일 바이너리). 벤더 무관 | **고객 망 안 게이트웨이 1대** |
| **시맨틱 컨벤션(semconv)** | "HTTP 요청 지연은 `http.server.request.duration`이고 단위는 초"처럼 이름·단위·속성을 통일한 사전 | 우리 데이터 모델의 어휘 |

### 2.3 시그널 3종 + 컨텍스트 전파

| 시그널 | 무엇 | 답하는 질문 | 우리 Phase |
|---|---|---|---|
| **Metrics** | 시간에 따른 수치 집계(요청 수·지연 히스토그램·메모리) | 얼마나 빠른가·많은가·실패하나 | P1 |
| **Traces** | 요청 하나가 거친 경로를 스팬(span) 트리로 기록 | 어디서 느려졌나·어느 호출이 실패했나 | P2 |
| **Logs** | 기존 로그에 trace_id를 붙여 상관 | 그 요청 때 무슨 로그가 남았나 | P4 |
| (Profiles) | 코드 수준 CPU/메모리 프로파일. 2024년 신설, 아직 실험 단계 | 어느 함수가 CPU를 먹나 | 비범위 |

**컨텍스트 전파(Context Propagation)** 는 시그널 자체는 아니지만 트레이스가 성립하는 근거다. 서비스 A가 B를 HTTP로 부르면 A의 계측이 요청 헤더에 `traceparent`를 넣고, B의 계측이 그 헤더를 읽어 같은 trace_id로 스팬을 이어 붙인다. 형식은 W3C Trace Context 표준이다.

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  └── trace_id (16바이트, hex 32자)     └── parent span_id  └── flags(01=sampled)
             └── version
```

이 덕분에 Java 앱이 Node 앱을 부르고 Node가 Python을 불러도 하나의 트레이스로 묶인다. 언어가 달라도 되는 것이 OTel의 가치다.

### 2.4 데이터 모델 — 메트릭

OTLP 메트릭은 세 겹의 계층이다.

```
ResourceMetrics            ← "누가 보냈나": service.name, service.instance.id, service.version,
 └ ScopeMetrics             deployment.environment, host.name (Resource 속성)
    └ Metric               ← "무엇을": 이름·단위·설명·타입
       └ DataPoint[]       ← "언제·얼마·어떤 조건": timeUnixNano, 값, attributes(차원)
```

**계측기(Instrument) 종류와 우리 화면의 대응**

| 계측기 | 의미 | 예 | 화면 |
|---|---|---|---|
| Counter | 단조 증가 합계 | 요청 수 | 처리량(count/Δt) |
| UpDownCounter | 오르내리는 합계 | `http.server.active_requests`, `jvm.memory.used` | 액티브 트랜잭션·힙 |
| Gauge | 순간값 | `jvm.thread.count`, `process.cpu.utilization` | 런타임 |
| **Histogram** | 값의 **분포**(버킷별 개수 + sum + count + min/max) | `http.server.request.duration` | **p50/p95/p99·히트맵** |
| ExponentialHistogram | 지수 스케일 버킷의 히스토그램 | 옵션 | 정규 경계로 변환해 저장 |

**히스토그램이 APM의 핵심**이다. 평균 응답시간은 느린 1%를 숨기지만 히스토그램은 분포를 남기므로 p95를 계산할 수 있다. 히스토그램 데이터포인트는 다음과 같이 온다.

```json
{
  "startTimeUnixNano": "1725300000000000000",
  "timeUnixNano":      "1725300060000000000",
  "count": "1200", "sum": 84.3, "min": 0.002, "max": 3.9,
  "explicitBounds": [0.005,0.01,0.025,0.05,0.075,0.1,0.25,0.5,0.75,1,2.5,5,7.5,10],
  "bucketCounts":   [120,300,400,200,80,50,30,10,5,3,1,1,0,0,0],
  "attributes": [{"key":"http.request.method","value":{"stringValue":"GET"}},
                 {"key":"http.route","value":{"stringValue":"/api/hosts/{id}"}},
                 {"key":"http.response.status_code","value":{"intValue":"200"}}],
  "exemplars": [{"traceId":"4bf9…","spanId":"00f0…","timeUnixNano":"…","asDouble":3.9}]
}
```

- `explicitBounds` 14개 → 버킷 15개(마지막은 +∞). 이 경계가 HTTP 시맨틱 컨벤션 권장값이며 Java 에이전트 기본값이다.
- **p95 계산**: 누적 개수가 `count × 0.95`를 넘는 버킷을 찾고 그 버킷 안에서 선형 보간한다. 버킷이 촘촘할수록 정확하다.
- **Exemplar**: "이 버킷에 들어간 표본 하나"와 그 trace_id. p95 막대에서 느린 트레이스로 바로 점프하는 근거다. 단 **대표 표본이지 최댓값이 아니다**(실측 교훈 §11).

**Temporality(집계 시간성)** 는 두 가지다.

| 종류 | 의미 | 우리 처리 |
|---|---|---|
| CUMULATIVE | 프로세스 시작 이후 누적. 1분 값을 얻으려면 이전 값과 차분 | 이전 포인트를 기억해 차분. 재시작 시 리셋 감지 |
| DELTA | 직전 export 이후의 증분. 그대로 더하면 됨 | 그대로 적재. **가이드 기본 권고** |

가이드는 `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`를 권한다. 그러나 delta를 켜도 **UpDownCounter는 규격상 CUMULATIVE로 온다**(실측). 그래서 BE는 메트릭 단위가 아니라 **데이터포인트 단위**로 temporality를 판정한다.

### 2.5 데이터 모델 — 트레이스

```
ResourceSpans
 └ ScopeSpans
    └ Span: traceId, spanId, parentSpanId, name, kind, startTimeUnixNano, endTimeUnixNano,
            status{code: UNSET|OK|ERROR, message}, attributes[], events[], links[]
```

| 필드 | 뜻 | 우리 활용 |
|---|---|---|
| `kind` | SERVER(요청 받음)·CLIENT(요청 보냄)·INTERNAL·PRODUCER·CONSUMER | SERVER 루트=트랜잭션, CLIENT=외부 의존·DB 호출 → 서비스 맵 엣지 |
| `status.code=ERROR` | 예외·5xx | 에러 그룹, tail 샘플링 정책 |
| `attributes` | `http.route`, `db.system`, `db.query.text`, `server.address`, `exception.*` | 엔드포인트·DB 쿼리 그룹·외부 호출·예외 |
| `events` | 스팬 도중 사건. `exception` 이벤트에 스택트레이스 | 에러 상세 |
| `links` | 다른 트레이스와의 연결(배치·메시징) | P3 |

트레이스 하나 = 같은 `traceId`를 가진 스팬 집합. `parentSpanId`로 트리를 만들면 워터폴이 된다. 크리티컬 패스는 루트에서 가장 늦게 끝나는 자식을 따라간 경로다.

### 2.6 시맨틱 컨벤션 — 이름이 곧 계약

OTel은 "무슨 이름으로 보내는가"를 표준화했다. 같은 이름이면 Java든 .NET이든 같은 뜻이므로, 우리 화면은 언어를 몰라도 된다.

| 컨벤션 이름 | 타입·단위 | 뜻 | 우리 화면 |
|---|---|---|---|
| `http.server.request.duration` | histogram, s | 서버가 요청을 처리한 시간 | RED(처리량·오류·지연), 엔드포인트 표 |
| `http.server.active_requests` | updowncounter | 처리 중 요청 수 | 액티브 트랜잭션 |
| `http.client.request.duration` | histogram, s | 앱이 밖으로 부른 HTTP 지연 | 외부 의존 |
| `db.client.operation.duration` | histogram, s | DB 호출 지연 | DB 호출·슬로우 후보 |
| `db.client.connection.count/pending_requests/wait_time` | gauge/hist | 커넥션 풀 | 풀 차트 |
| `jvm.memory.used/limit`, `jvm.gc.duration`, `jvm.thread.count`, `jvm.cpu.recent_utilization` | gauge/hist | JVM 런타임 | 런타임 탭 |
| `process.cpu.utilization`, `process.memory.usage` | gauge | 비-JVM 공통 | 런타임 탭 |
| 리소스 `service.name`, `service.instance.id`, `service.version`, `deployment.environment.name`, `host.name` | 속성 | 서비스 식별·인스턴스·배포 감지·Zabbix 호스트 연결 | 자동 등록·배포 마커·호스트 링크 |

**주의: 컨벤션은 움직였다.** HTTP는 2023년 말에 stable이 됐고 그때 이름이 `http.server.duration`(ms) → `http.server.request.duration`(s)으로 바뀌었다. 구 버전 계측(특히 Python)은 옛 이름을 내며, `OTEL_SEMCONV_STABILITY_OPT_IN=http`로 새 이름을 켜야 한다. BE는 구 이름 별칭을 받아 주되 단위 차이(ms↔s)를 안다. DB 컨벤션은 2025년에 stable이 됐다.

### 2.7 자동계측의 원리 — 어떻게 코드 수정 없이 되나

| 스택 | 방식 | 원리 |
|---|---|---|
| Java | `-javaagent:opentelemetry-javaagent.jar` | JVM 시작 시 `Instrumentation` API로 클래스 로딩을 가로채 **바이트코드를 조작**(ByteBuddy). Spring MVC 컨트롤러·JDBC·HttpClient·Kafka 등 100여 라이브러리의 진입/종료에 스팬·메트릭 코드를 끼워 넣는다 |
| .NET | `OTEL_DOTNET_AUTO_*` 환경변수 + CLR Profiler | CLR 프로파일링 API로 JIT 시점에 IL을 재작성 |
| Node | `--require @opentelemetry/auto-instrumentations-node/register` | `require()` 훅으로 모듈 로딩 시 함수를 래핑(monkey patch) |
| Python | `opentelemetry-instrument python app.py` | 임포트 시 라이브러리 함수를 monkey patch |
| Go | 없음(SDK 수동) | 정적 바이너리라 런타임 주입 불가. eBPF 기반 자동계측은 실험 단계 |

자동계측이 잡는 것은 **프레임워크 호출 경계**다. "컨트롤러 진입 → JDBC 실행 → HTTP 클라이언트 호출"은 자동으로 스팬이 되지만, 그 사이의 내 메서드 `calculatePrice()`는 스팬이 아니다. Java는 에이전트 옵션 `otel.instrumentation.methods.include=com.acme.Svc[methodA]`로 코드 수정 없이 메서드를 추가할 수 있고, `@WithSpan` 애노테이션은 의존성 추가가 따른다. 이 구분은 §10 한계에서 다시 다룬다.

### 2.8 OTLP 프로토콜

| 항목 | 값 |
|---|---|
| 전송 | gRPC(기본 포트 **4317**) 또는 HTTP/1.1(기본 포트 **4318**) |
| 인코딩 | protobuf 바이너리(기본) 또는 **JSON**(HTTP만, proto3 JSON 매핑) |
| 경로(HTTP) | `POST /v1/metrics` · `/v1/traces` · `/v1/logs` |
| 압축 | gzip 선택 |
| 성공 응답 | 200 + 빈 `ExportXxxServiceResponse`(부분 성공은 `partialSuccess`) |
| **재시도 규약** | 클라이언트는 **429·502·503·504만 재시도**하고, 나머지(400·401·403·404·413·**500** 포함)는 영구 실패로 **즉시 폐기** |

마지막 줄이 우리 BE 응답 계약을 결정했다(§8.2). JSON 인코딩에서 trace_id·span_id는 hex 문자열, int64는 문자열로 온다.

### 2.9 Collector — 받고·가공하고·내보내는 파이프라인

Collector는 설정 yaml 하나로 동작하는 Go 바이너리다. 구조는 네 부품과 파이프라인이다.

```
receivers  ──►  processors(순서대로)  ──►  exporters
 otlp             memory_limiter              otlphttp/moveseye
 prometheus/self  resourcedetection           (json, gzip, Bearer, 디스크 큐, 재시도)
                  attributes/drop
                  redaction/pii
                  transform/sql
                  filter/metrics
                  tail_sampling
                  batch
extensions: file_storage(디스크 큐) · health_check
service.pipelines: metrics / metrics/self / traces / logs  ← 시그널별로 부품 조합
```

| 부품 | 우리 설정에서의 역할 |
|---|---|
| `memory_limiter` | 메모리 상한(512MiB). 넘으면 수신 거부해 Collector 자체가 죽지 않게 |
| `resourcedetection` | `host.name` 보강 → Zabbix 호스트 연결 |
| `attributes/drop` | 원시 URL·쿼리스트링·헤더·User-Agent 삭제(카디널리티·PII 1차 방어) |
| `redaction/pii` | 값 안의 주민번호·카드번호·이메일 패턴 마스킹 |
| `transform/sql` | `db.query.text`의 리터럴을 `?`로(에이전트 마스킹 실패분 2중 방어), 4KB 절단 |
| `filter/metrics` | 허용목록 밖 메트릭 폐기(BE와 이중 게이트) |
| `tail_sampling` | 트레이스가 **끝난 뒤** 오류·2초 초과는 100%, 정상은 2%만 통과 |
| `batch` | 5초/512건 단위 묶음 전송 |
| `file_storage` + `sending_queue` | BE가 잠시 죽어도 디스크 큐에 보관(5,000 배치), 복구 후 전송 |
| `prometheus/self` | Collector 자기 메트릭(`otelcol_*`)을 우리에게 보내 "앱이 죽음 vs 수집기가 죽음 vs BE 거부"를 가른다 |

**배포 모드.** 앱마다 사이드카(agent 모드)로 두거나 사이트당 한 대(gateway 모드)로 둔다. 우리는 **게이트웨이 1대**다. 이유는 tail 샘플링이 "한 트레이스의 모든 스팬이 같은 Collector에 와야" 성립하기 때문이다. 두 대 이상이면 trace_id 일관 해싱(`loadbalancing` exporter) 2계층이 필요하고 이는 승격 항목이다.

**head vs tail 샘플링.** head는 요청 시작 시 확률로 결정하므로 오류인지 모르는 채 버린다. tail은 트레이스가 끝난 뒤 결과를 보고 결정하므로 오류·느린 요청을 100% 남길 수 있다. 대신 `decision_wait`(10초) 동안 스팬을 메모리에 들고 있어야 한다. 에이전트 쪽 샘플러는 `always_on`(전량 Collector로)이고 판단은 Collector에서 한다.

---

## 3. 왜 도입이 필요했나

### 3.1 as-is — 껍데기만 있던 APM

2026-08 시점 MovesEye는 서버(Zabbix)·네트워크·클라우드(AWS)·자산·비용·맵·Zabbix 관리를 한 제품으로 갖췄지만, 애플리케이션 모니터링은 라이선스 `Feature.APM`(PREMIUM)·FE 라우트·메뉴·"준비 중" 스텁·문서 "[예정]"까지 **껍데기만 있고 내용물 0**이었다. 고객 문서는 "Prometheus·Datadog 소스가 붙어야 앱 지표를 수집할 수 있다"고 적혀 있었는데 이것부터 틀렸다. APM은 외부 소스에서 **가져오는** 게 아니라 고객 앱이 **우리에게 보내는** 것이다.

### 3.2 서버 모니터링과 APM은 주어가 다르다

| | 서버 모니터링 | APM |
|---|---|---|
| 주어 | 호스트(서버 1대) | 서비스(앱 1개, 인스턴스 N개) |
| 질문 | CPU 90%인가, 디스크 찼나, ping 되나 | Jira가 느린가, 어느 엔드포인트가, 어느 DB 쿼리 때문에 |
| 단위 | 30초~1분 폴링 스칼라 | 요청 단위 지연 분포 + 요청 경로 |
| 데이터 출처 | OS·에이전트가 밖에서 관찰 | 앱 **안에서** 계측이 꺼냄 |

호스트 CPU가 낮아도 앱이 커넥션 풀 고갈로 멈출 수 있고, 반대로 CPU가 높아도 사용자는 멀쩡할 수 있다. "사용자가 느끼는 성능"은 앱 안에서만 잴 수 있다.

### 3.3 대안 비교

| 대안 | 내용 | 기각·채택 이유 |
|---|---|---|
| A. Zabbix 래핑(v1 M1) | JMX 템플릿·웹 시나리오·프로세스 감시를 APM 화면으로 포장 | 요청 단위 지연·트레이스가 없다(§4). 데모 Zabbix의 JMX 66아이템은 Gateway 미구성으로 수집 0건. **기각**, 합성 감시만 P3 편입 |
| B. 자체 SDK·에이전트 | 언어별 계측 라이브러리를 직접 개발 | 언어 5개 × 프레임워크 수십 개 유지보수 불가. 고객 락인. **기각** |
| C. 상용 APM 에이전트 호환 | Datadog·New Relic 에이전트의 프로토콜을 받는다 | 비공개 프로토콜·라이선스 문제. **기각** |
| D. 외부 APM 읽기 연동 | Jaeger·Tempo·Datadog API에서 조회 | 고객이 이미 APM을 갖고 있어야 한다. M4 후보로만 |
| **E. OpenTelemetry** | 표준 자동계측 + Collector + 우리 백엔드 | 아래 3.4 |

### 3.4 OTel을 채택한 이유

1. **코드 수정 0으로 시작.** Java·.NET·Node·Python 자동계측이 이미 성숙했다. 고객 앱 재빌드 없이 실행 옵션 한 줄이다.
2. **우리는 백엔드만 만들면 된다.** 계측·전송·수집은 표준 부품이 하고, 우리 산출물은 수신·저장·화면·알람·설정 생성기·설치 가이드다. 이것이 개발 범위를 ~247 사람-일로 묶는 근거였다.
3. **락인 없음(계측·수집 계층에서).** Collector exporter 하나 추가로 다른 백엔드에 동시 전송할 수 있다. 영업 문구는 "계측·수집 계층에 락인 없음"까지만 쓰고, 우리 집계·화면·보존 데이터는 우리 형식이므로 절대 표현은 쓰지 않는다.
4. **시맨틱 컨벤션이 데이터 모델을 준다.** 이름·단위·차원을 우리가 발명하지 않는다.
5. **설치형 제약과 양립.** Collector는 도커 없는 단일 바이너리(Windows 서비스·Linux systemd)라 "새 DB·도커 금지" 설치형 경로와 충돌하지 않는다.
6. **확장의 다른 길.** Collector에 Prometheus 스크레이프·hostmetrics·k8s receiver를 붙이면 인프라 메트릭도 같은 경로로 들어온다(수집 엔진 스텝 6의 대안, 아직 결정 안 함).
7. **정액 라이선스와 궁합.** 사용량 과금이 아니라 서비스·트래픽이 늘어도 라이선스 비용은 불변이다(수집기·DB 자원은 고객 부담으로 증가 — 둘을 갈라 쓴다).

사용자 결정(2026-08-26): "수집기는 오픈텔레메트리 쓸 거야" → v2에서 Zabbix 래핑 삭제, Collector 1급 승격. 같은 날 "주력으로 갈 것" → v3 범위 확대.

---

## 4. Zabbix의 한계 — APM 관점

Zabbix는 훌륭한 인프라 모니터링이지만 APM 데이터 모델이 아니다. 구체적으로:

| # | 한계 | 왜 APM에 치명적인가 |
|---|---|---|
| 1 | **호스트 중심 모델.** 모든 값은 호스트의 아이템에 매달린다 | "서비스"라는 1급 개념이 없다. 인스턴스 3대짜리 앱의 p95를 서비스 단위로 묶을 수 없다 |
| 2 | **아이템 = 스칼라 1개/주기.** 히스토그램 타입이 없다 | 분포가 없으니 p95를 못 만든다. 평균만 남아 느린 1%가 사라진다. 버킷을 아이템 15개로 흉내 내면 아래 3번에 걸린다 |
| 3 | **카디널리티.** 아이템은 사전 정의(또는 LLD 디스커버리) | route 50 × method 2 × status 3 × 버킷 15 = 4,500 아이템/서비스. LLD로 만들어도 history 테이블이 감당 못 한다 |
| 4 | **트레이스·스팬 개념 없음** | "어느 호출에서 느려졌나"에 답할 구조 자체가 없다. 컨텍스트 전파도 없다 |
| 5 | **앱 내부를 못 본다.** Zabbix agent는 OS 밖에서 관찰, JMX Gateway는 JVM 내부 수치(힙·GC)까지 | 요청 지연·DB 호출·외부 호출·예외는 앱 코드 경계에 계측이 있어야 나온다 |
| 6 | **폴링·트래퍼 모델.** 서버가 당기거나(agent) 아이템 키를 알고 밀어야(trapper) 한다 | 앱이 "나 여기 있다"고 자동 등록되는 흐름이 없다. 새 서비스마다 호스트·아이템 설정이 선행 |
| 7 | **웹 시나리오는 합성 감시일 뿐** | 밖에서 URL을 두드린 응답시간이지 실사용자 요청이 아니다. 처리량·에러율 내역·DB 지연 불가 |
| 8 | **시각화·집계가 단일 아이템 그래프 중심** | 서비스 맵·워터폴·플레임·산점도 같은 APM 시각화가 없다 |

**그래도 Zabbix가 APM에서 계속 맡는 것**

| 역할 | 방법 | 이유 |
|---|---|---|
| **알림 배달** | BE가 판정한 알람을 Zabbix 7.0 `history.push`로 트래퍼 아이템에 밀고 트리거는 우리가 자동 생성 | 고객이 이미 만든 액션·미디어(Slack/Teams/Jandi/메일)·에스컬레이션·유지보수 창·Problem 화면이 **공짜**로 붙는다. 제품 자체 푸시는 이메일뿐이라 새 채널을 만들면 알림이 두 갈래가 된다 |
| 합성 감시 | 웹 시나리오를 APM 서비스에 바인딩(P3) | 계측 없는 레거시 앱의 "밖에서 본 가용성" |
| 호스트 연결 | 리소스 `host.name` ↔ Zabbix 호스트 매칭 | 서비스 ↔ 서버 화면 상호 링크 |

Zabbix 래핑 원칙("Zabbix에 있으면 감싼다, 없으면 만든다")을 APM에 적용한 결과가 이 분담이다. 수집은 OTel, 배달은 Zabbix.

---

## 5. APM에는 무엇이 필요한가

### 5.1 핵심 지표 6종 (필수 요건)

시장 체크리스트(WhaTap·AWS·Elastic 정의)로 고객이 채점한다는 전제로 대조했다.

| 지표 | OTel 출처 | 자동 제공 | 화면 | Phase |
|---|---|---|---|---|
| 응답 시간 | `http.server.request.duration` 히스토그램 | ✅ 4개 언어 | p50/p95/p99 3선+밴드, 히트맵, 산점도 | P1 |
| 처리량(TPS) | 같은 히스토그램의 count/Δt | ✅ | RED area, StatCard | P1 |
| 에러율 | status 5xx 비율 + 스팬 `status=ERROR` | ✅ | 임계·배포 markLine, 상태코드 stacked, 예외 그룹 | P1/P2 |
| 트랜잭션 추적 | OTLP traces, tail 샘플링 | ✅ 프레임워크 경계까지 | 워터폴·플레임·트레이스 비교 | P2 |
| 액티브 트랜잭션 | `http.server.active_requests` | Java ✅, 타 언어 opt-in | area + 급증 알람 | P1 |
| DB 연결·쿼리 | 풀 메트릭 + `db.client.operation.duration` + 스팬 `db.query.text` | ✅ | 풀 stacked·쿼리 그룹·treemap·SQL 뷰어 | P1/P2 |

### 5.2 지표 위에 필요한 것

| 필요 | 이유 | 우리 답 |
|---|---|---|
| 서비스 자동 등록 | 앱 추가마다 관리자가 설정하면 온보딩이 죽는다 | `service.name` 첫 수신 시 자동 생성(모드 AUTO/APPROVE/ALLOWLIST) |
| 파이프라인 진단 | "그래프가 비었다"의 원인이 앱·수집기·BE 중 어디인지 | Collector 자기 메트릭 수신, 수집기 탭(큐·실패·버전), 60초 수신 검증 |
| 알람 → 기존 채널 | Slack/Teams 없으면 체크리스트 탈락 | Zabbix `history.push` 경유 |
| 배포 영향 | "배포 후 느려졌나" | `service.version` 변화 자동 감지 + CI 웹훅 → 차트 세로선·전후 비교 |
| 보안 | SQL 원문·헤더·개인정보가 DB에 남으면 안 된다 | 에이전트 마스킹 → Collector 마스킹 체인 → BE 절단·정책(KEEP/MASK/DROP) |
| 설치형 용량 상한 | 새 DB 금지 | PG 파티션·롤업 3단·승격 조건 수치화 |
| 권한 | 누가 보나·누가 만지나 | DMOVE 권한 옵션 `applicationMonitoring/apm` view·edit |

### 5.3 정직하게 못 하는 것 (소개서에 그대로 쓰는 문장)

- Kubernetes 통합 모니터링 없음(로드맵), RUM 없음(P4), 코드 레벨 프로파일링 없음, SaaS 없음.
- 1차 목표 규모: 서비스 50·트레이스 일 2천만 이하. 그 이상은 저장소 승격(ClickHouse) 필요.
- 계측이 없는 앱(레거시·서드파티 바이너리)은 합성 감시로 응답시간·가용성만 본다. 서비스 목록에 "계측 없음" 배지.

---

## 6. 설계 중점 — 핵심 결정 10가지

### 6.1 Collector 경유, 직송 불허

| 관심사 | 에이전트 → BE 직송(v1) | **Collector 경유(채택)** |
|---|---|---|
| 프로토콜 | Java SDK는 protobuf만 → BE에 protobuf 의존 | Collector가 JSON으로 변환 → 기존 JSON 파서 재사용, BE 의존 0 |
| 샘플링 | head만 → 오류를 놓친다 | tail → 오류·느림 100% |
| 카디널리티·PII | BE가 다 받고 버림 | Collector가 먼저 거르고 BE는 최종 게이트 |
| 앱 설정 | 앱마다 토큰·주소 | 앱은 `localhost:4317`만. 토큰은 Collector 한 곳 |
| 장애 내성 | 앱 메모리 큐뿐 | 디스크 큐 5,000배치 |
| 비용 | 0 | 단일 바이너리 1개 설치(상용 대비 한 단계 더 — 설치 스크립트로 상쇄) |

### 6.2 서비스가 1급 엔티티

- 자연키 `(service_name, env)`, 내부 참조는 불변 UUID `service_uid`. 이름을 바꿔도 Zabbix 트리거 키·URL·알람 이력이 안 깨진다.
- 등록 모드 AUTO(기본)/APPROVE/ALLOWLIST. `unknown_service:*`는 어떤 모드에서도 서비스로 만들지 않고 설치 가이드로 유도.
- 상태 판정: 수신 지속(STALE)·오류율·p95로 UP/DEGRADED/DOWN.

### 6.3 허용목록 메트릭, 고정 화면

Grafana식 임의 쿼리가 아니라 **오피니언 제품**이다. 받는 메트릭은 허용목록(§2.6 표)뿐이고 나머지는 폐기 카운터만 올린다("받았지만 안 쓰는 메트릭 n종" 표시 → 확장 근거). `http.route`는 서비스당 500 상한, 초과분 `__other__`.

### 6.4 히스토그램 정규 경계

메트릭 패밀리별 정규 경계를 고정하고(Java 기본과 일치시켜 기본 조합에서 재버킷 0건), 경계가 다르면 선형 보간으로 재버킷한다. 그래서 같은 메트릭의 모든 행이 같은 `bounds_id`를 갖고 **롤업은 count 벡터의 단순 합**이 된다.

| 패밀리 | 대상 | 경계 |
|---|---|---|
| `duration_s` | `http.*.duration`, `rpc.*` | 14단 0.005…10 |
| `db_operation_s` | `db.client.operation.duration` | 9단 0.001…10 |
| `gc_s` | `jvm.gc.duration` | 4단 0.01…10 |
| `pool_ms` | `db.client.connection.*_time` | 15단 0…10000 |

실측 교훈: 소스보다 **촘촘한** 격자로 접으면 한 칸이 여러 칸에 균등 분배되어 분포를 날조한다(§11 D2). 그래서 원본 경계 보존(`RAW_BOUNDS`)과 `UNIQUE(bounds, family)`를 두고 격자 분할을 금지했다.

### 6.5 저장 — Postgres 롤업 3단, 승격 조건 수치화

```
apm_metric_1m  7일(인스턴스 축 보존)  →  apm_metric_5m  30일(서비스 합산)  →  apm_metric_1h  400일
apm_span 7일 · apm_trace_summary · 5분 롤업 4종(서비스 엣지·에러 그룹·DB 쿼리 그룹·외부 호출)
```

- R3 실측: 서비스 10·인스턴스 3·route 50에서 1만 행/분 = 14M행/일, 행당 686B(인덱스가 절반), 1m 7일 67GB, 3단 109GB.
- 승격 기준 3축: 용량(20M행/일 검토·35M 착수)·화면(목록 cold p50 3초)·롤업(정상 1회 60초). `ApmMetricStore` 인터페이스로 격리해 ClickHouse 교체 가능.
- PG 튜닝은 선택이 아니다: `work_mem` 4MB→64MB 하나가 HashAgg 스필을 없앴다. 설치 가이드가 `postgres-tuning` 안내를 직접 낸다.

### 6.6 알람 — 우리 규칙, 배달은 Zabbix

규칙(오류율·p95·수신 끊김·수집기 실패·SLO) 판정은 BE가 5분마다 하고, 값을 Zabbix 가상 호스트 `MovesEye APM`의 트래퍼 아이템(`apm.error_rate[<uuid>]`)에 `history.push`로 민다. 트리거는 우리가 만들고 소유 태그(`owner:moveseye-apm`, `apm_uid`)로 표시. **액션·미디어는 절대 만들지 않는다**(고객 운영 정책) — 대신 "알림 액션 없음" 진단 배지. 사용자가 Zabbix에서 표현식을 바꾸면 덮어쓰지 않고 `drift` 배지.

### 6.7 보안 — 토큰 1회 노출, 마스킹 3중

- 수신 토큰 원문은 발급 응답에 1회만, DB는 sha256. yaml 생성은 `POST`(URL·프록시 로그에 안 남게), 응답 `Cache-Control: no-store`. 회수 즉시 401.
- 마스킹: 에이전트 기본(리터럴 `?`) → Collector `attributes/drop`·`redaction/pii`·`transform/sql` → BE `ApmSqlPolicy`(KEEP/MASK/DROP)·4KB 절단·exemplar 속성 폐기. 원문 보존은 관리자 opt-in + 감사 로그 + 경고 배너.

### 6.8 라이선스 만료 = 즉시 손실

403은 exporter가 영구 실패로 즉시 폐기한다(재시도로 버틴다는 v2 전제가 틀렸음). 그래서 D-14/D-7/D-1 배너에 "APM 수집이 중단됩니다", 수집기 화면에 "만료 시 수집기 중지·토큰 회수" 버튼, FAQ에 403 로그 안내.

### 6.9 실시간은 "약 30초 이내"

에이전트 export 기본 60초(권고 10초) + Collector batch 5초 + BE 적재 → 화면 도달 중앙값 14초·최악 23초. "초 단위 실시간"은 불가하며 문구를 '실시간(약 30초 이내)'로 못 박았다. Live는 BE 10초 링 버퍼 + SSE.

### 6.10 수집층 중립 원칙

`Feature.APM`·APM 어휘는 `premium/apm/`에만, OTLP 공용은 `otel/`. `engine-api`의 소스 중립 포트에는 손대지 않고, Zabbix 전용 계약에 `history.push` 1개만 추가. 트레이스 저장소는 엔진 포트로 만들지 않는다(우리가 저장소 주인).

---

## 7. 적용 방법 — 설치·계측 절차

### 7.1 전체 흐름 (60초 온보딩 목표)

```
① 관리자: MovesEye 설정 > 수집기 > 토큰 발급 (원문 1회 표시, 복사)
② 관리자: 수집기 설정 생성 (토큰·BE 주소·샘플링·느림 임계·마스킹 강도 선택) → collector.yaml 다운로드
③ 고객 서버: otelcol-contrib 0.159.0 설치 + yaml 배치 + Windows 서비스/systemd 등록
④ 앱: 실행 옵션 한 줄 추가 후 재시작 (아래 7.2)
⑤ MovesEye: 수집기 탭 "마지막 수신" 확인 → 서비스 목록에 자동 등록 → 8~10초 뒤 첫 차트
```

### 7.2 스택별 앱 계측 (코드 수정 0)

공통 환경변수:

```
OTEL_SERVICE_NAME=order-api                              # 필수. 없으면 unknown_service:* 로 격리됨
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=prod,service.version=1.4.2
OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector-host>:4317  # gRPC. HTTP면 :4318
OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta   # 권고
OTEL_METRIC_EXPORT_INTERVAL=10000                         # 기본 60000 → 10초 권고(실시간 체감)
OTEL_TRACES_SAMPLER=always_on                             # 판단은 Collector tail에서
```

| 스택 | 실행 | 비고 |
|---|---|---|
| Java(Spring·Tomcat·Jira 등) | `java -javaagent:opentelemetry-javaagent.jar -jar app.jar` (javaagent 2.31.1) | JVM 런타임 메트릭 포함, JMX Gateway 불필요. 메서드 스팬은 `-Dotel.instrumentation.methods.include=com.acme.Svc[a,b]` |
| .NET | `OTEL_DOTNET_AUTO_HOME` 설정 + 자동계측 스크립트 | CLR Profiler |
| Node | `node --require @opentelemetry/auto-instrumentations-node/register app.js` | route 템플릿 OK, `active_requests` 없음, 런타임 메트릭 별도 패키지 |
| Python | `opentelemetry-instrument python app.py` + **`OTEL_SEMCONV_STABILITY_OPT_IN=http` 필수** | 없으면 구 이름 `http.server.duration`(ms)으로 와서 폐기됨 |
| Go·기타 | SDK 수동 계측 가이드 | 자동 없음 |

### 7.3 Collector yaml 골자 (BE가 생성해 준다)

```yaml
receivers:
  otlp: { protocols: { grpc: {endpoint: 0.0.0.0:4317}, http: {endpoint: 0.0.0.0:4318} } }
  prometheus/self:                       # Collector 자기 메트릭 → 수집기 진단 화면
    config: { scrape_configs: [ { job_name: otelcol, scrape_interval: 30s,
              static_configs: [ { targets: ['127.0.0.1:8888'] } ] } ] }
processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
  resourcedetection: { detectors: [env, system] }
  attributes/drop:
    actions:
      - { key: url.full, action: delete }
      - { key: url.query, action: delete }
      - { key: user_agent.original, action: delete }
      - { pattern: '^http\.(request|response)\.header\..*', action: delete }
      - { key: enduser.id, action: hash }
  redaction/pii:
    allow_all_keys: true
    blocked_values: [ '\b\d{6}-\d{7}\b', '\b(?:\d[ -]*?){13,16}\b', '[\w.+-]+@[\w-]+\.[\w.]+' ]
  transform/sql:
    trace_statements:
      - context: span
        statements:
          - replace_pattern(attributes["db.query.text"], "'[^']*'", "?")
          - replace_pattern(attributes["db.query.text"], "\\b\\d+\\b", "?")
          - truncate_all(attributes, 4096)
  filter/metrics:
    metrics: { include: { match_type: regexp, metric_names:
      [ 'http\.server\..*', 'http\.client\..*', 'rpc\..*', 'jvm\..*', 'db\.client\..*',
        'process\..*', 'messaging\..*', 'otelcol_.*' ] } }
  tail_sampling:
    decision_wait: 10s
    num_traces: 50000
    policies:
      - { name: errors, type: status_code, status_code: {status_codes: [ERROR]} }
      - { name: slow,   type: latency,     latency: {threshold_ms: 2000} }
      - { name: normal, type: probabilistic, probabilistic: {sampling_percentage: 2} }
  batch: { timeout: 5s, send_batch_size: 512, send_batch_max_size: 1024 }
exporters:
  otlphttp/moveseye:
    endpoint: https://<moveseye>/apm/otlp        # /v1/metrics·/v1/traces·/v1/logs 자동 접미
    encoding: json                               # BE 파서가 JSON 전용
    compression: gzip
    headers: { Authorization: "Bearer <수신 토큰>" }
    sending_queue: { enabled: true, storage: file_storage, queue_size: 5000 }
    retry_on_failure: { enabled: true, max_elapsed_time: 30m }
extensions:
  file_storage: { directory: <데이터 디렉터리>/otelcol-queue, create_directory: true }
  health_check: { endpoint: 127.0.0.1:13133 }
service:
  telemetry: { metrics: { level: normal, readers: [ { pull: { exporter: { prometheus: { host: 127.0.0.1, port: 8888 } } } } ] } }
  pipelines:
    metrics:      { receivers: [otlp], processors: [memory_limiter, resourcedetection, attributes/drop, filter/metrics, batch], exporters: [otlphttp/moveseye] }
    metrics/self: { receivers: [prometheus/self], processors: [memory_limiter, filter/self, batch], exporters: [otlphttp/moveseye] }
    traces:       { receivers: [otlp], processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, transform/sql, tail_sampling, batch], exporters: [otlphttp/moveseye] }
    logs:         { receivers: [otlp], processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, batch], exporters: [otlphttp/moveseye] }
```

손편집은 가능하되 "우리 템플릿 = 지원 범위". 정본 템플릿은 BE `src/main/resources/apm/collector-template.yaml`(otelcol validate 통과).

### 7.4 설치 후 검증 체크리스트

| 확인 | 정상 | 아니면 |
|---|---|---|
| Collector `health_check` :13133 | 200 | 서비스 미기동·포트 충돌 |
| 수집기 탭 "마지막 수신" | 1분 내 | 토큰·BE 주소·방화벽(인바운드 `/apm/otlp/**` nginx location) |
| 서비스 목록에 앱 등장 | 자동 등록 | `OTEL_SERVICE_NAME` 누락(→ "이름 없는 앱" 큐), 등록 모드 APPROVE 대기 |
| 첫 차트 | 8~10초 뒤 | 4초에 판정하면 빈 표 오진 |
| 폐기 카운터 | 0 또는 소수 | 구 semconv 이름·허용목록 밖·재버킷 |
| Collector 로그에 403 | 없음 | 라이선스 만료·기능 미보유 → 즉시 손실 중 |
| Zabbix 알림 액션 | "알림 액션 없음" 배지 없음 | 고객 액션 조건에 호스트 그룹 `MovesEye APM` 추가 |

---

## 8. 어떤 API를 쏘는가

### 8.1 앱 → Collector (에이전트가 자동으로 쏜다)

| 항목 | 값 |
|---|---|
| 프로토콜 | OTLP gRPC `<collector>:4317` (또는 HTTP `:4318`) |
| 인코딩 | protobuf |
| 주기 | 메트릭 export interval(10초 권고), 트레이스는 배치 스팬 프로세서(기본 5초/512스팬) |
| 인증 | 없음(LAN 내). Collector는 앱을 믿는다 |

개발자가 직접 호출할 일은 없다. 자동계측 SDK가 한다.

### 8.2 Collector → BE (우리가 정의한 수신 계약)

| 항목 | 값 |
|---|---|
| 엔드포인트 | `POST /apm/otlp/v1/metrics` · `/v1/traces` · `/v1/logs`(P4) |
| 헤더 | `Authorization: Bearer <수신 토큰>` · `Content-Type: application/json` · `Content-Encoding: gzip` |
| 본문 | OTLP JSON(`resourceMetrics[]` / `resourceSpans[]`), gzip 해제 후 **8MB 상한**(스트리밍 검사) |
| 라이선스 | `Feature.APM` 필수. 인터셉터는 `@LicenseExempt`로 건너뛰고 컨트롤러가 403을 직접 낸다 |
| 멱등 | 본문 sha256 dedup, `timeUnixNano=0` 방어 |

**응답 코드 계약 (OTLP 재시도 규약에 맞춘 것)**

| 코드 | 의미 | Collector 동작 |
|---|---|---|
| 200 `{}` | 적재 완료(부분 폐기는 카운터만) | 다음 배치 |
| 400 / 415 | 형식 오류·JSON 아님 | 즉시 폐기 |
| 401 | 토큰 없음·회수됨 | 즉시 폐기 |
| 403 | 기능 미보유·라이선스 만료 | 즉시 폐기(영구 실패) |
| 413 | 8MB 초과 | 즉시 폐기(분할 재전송 없음) |
| **503** | 적재 중 예외·DB 장애·일시 장애 | **재시도**(디스크 큐 보관, 최대 30분) |
| 500 | **금지** | 즉시 폐기 — 60초에 31배치 손실 실측 |
| 405/415 | 잘못된 메서드·타입 | 실제 HTTP 상태로(프로토콜 오류는 200+body 규약 대상 아님) |

요청 본문 예시(메트릭):

```json
{
  "resourceMetrics": [{
    "resource": { "attributes": [
      {"key":"service.name","value":{"stringValue":"order-api"}},
      {"key":"service.instance.id","value":{"stringValue":"srv01:8080"}},
      {"key":"service.version","value":{"stringValue":"1.4.2"}},
      {"key":"deployment.environment.name","value":{"stringValue":"prod"}},
      {"key":"host.name","value":{"stringValue":"srv01"}} ] },
    "scopeMetrics": [{
      "scope": { "name": "io.opentelemetry.tomcat-10.0", "version": "2.31.1" },
      "metrics": [{
        "name": "http.server.request.duration", "unit": "s",
        "histogram": { "aggregationTemporality": 1,
          "dataPoints": [ { "…": "§2.4의 데이터포인트" } ] }
      }]
    }]
  }]
}
```

`aggregationTemporality`: 1=DELTA, 2=CUMULATIVE.

### 8.3 BE 관리·조회 API (화면·CI가 쏘는 것)

전부 `/apm/**`, `Feature.APM` + 권한 옵션 `applicationMonitoring/apm`(view 36 EP·edit 26 EP). 계약 정본은 `_workspace/contract_apm.md`·`contract_apm-read-api.md`.

| 영역 | 대표 엔드포인트 | 권한 |
|---|---|---|
| 토큰 | `POST /apm/collectors/tokens`(원문 1회) · `DELETE …/{id}` | edit |
| 수집기 설정 | `POST /apm/collector-config`(yaml 생성, no-store) · `GET /apm/collectors/config-defaults` · `GET /apm/collectors/state`(자기 메트릭·큐·폐기) | edit / view |
| 서비스 | `GET /apm/services/overview`(목록+상태+24h 가용성) · `GET /apm/services/{uid}`·`/red`·`/endpoints`·`/runtime`·`/instances`·`/pool` | view |
| 실시간 | `GET /apm/services/{uid}/live`(SSE: snapshot/bucket/heartbeat, `?live=1`) | view |
| 트레이스 | `GET /apm/traces?…`(산점도·목록) · `GET /apm/traces/{traceId}`(워터폴) · `/exemplar` | view(원문 SQL·스택은 ADMIN) |
| 그룹 | `/apm/services/{uid}/errors`·`/db-queries`·`/dependencies`·서비스 맵 `/apm/service-map` | view |
| 배포 | `POST /apm/services/{uid}/deployments`(CI 웹훅, scope deploy 토큰) · `/compare`·`/new-errors` | 웹훅 토큰 / view |
| 알람 | `/apm/alert-rules/**`(CRUD·resync OURS/THEIRS·미리보기·Zabbix 상태) · `/apm/alert-events` | edit / view |
| 등록 | `/apm/services/pending`(APPROVE 모드 승인) · allowlist | edit |

### 8.4 BE → Zabbix (알람 배달)

| 호출 | 용도 |
|---|---|
| `hostgroup.create` / `host.create`(인터페이스 없음) / `item.create`(type=trapper, key `apm.<kind>[<uuid>]`) / `trigger.create` | 프로비저닝(기존 `zabbixadmin` 관리 서비스 재사용). 소유 태그 `owner:moveseye-apm`, `apm_uid` |
| **`history.push`** (Zabbix 7.0+) | 5분마다 판정값 적재. 응답은 항목 단위 `data[i].error`로 확인 |
| `problem.get recent:false` / `event.get` | eventid 짝 맞추기(다음 실행에서). `recent:true`는 해소분 포함이라 금지 |
| `trigger.get` / `item.get` | 일 1회 드리프트·삭제·NOT_SUPPORTED 대조 |
| `action.get selectFilter` | 우리 그룹/태그를 조건으로 가진 활성 액션 수 → "알림 액션 없음" 배지 |

---

## 9. 동작 원리 — 수신에서 화면까지

```
수신 ─► 검증 ─► 정규화 ─► 적재 ─► 롤업/보존 ─► 조회 ─► 화면
```

| 단계 | 하는 일 | 구현 위치(BE `premium/apm`) |
|---|---|---|
| 1 수신 | gzip 해제(8MB 스트리밍 상한) → JSON 파싱 → 토큰 sha256 대조 → `Feature.APM` | `collector/ingest/receipt`, `otel/json` |
| 2 해석 | 리소스에서 `(service.name, env)` → 서비스 upsert(캐시) · `service.instance.id` → 인스턴스 · `host.name` → Zabbix 호스트 링크 | `collector/ingest/resolve`, `service/registry` |
| 3 정규화 | 허용목록 필터 · 차원 canonical JSON + `dims_hash` · status 2xx/3xx/4xx/5xx 접기 · route 500 상한 · temporality 포인트 단위(CUMULATIVE는 차분) · 히스토그램 정규 경계 재버킷 · exemplar는 traceId·spanId·시각·값만 · 구 semconv 별칭 | `collector/ingest/normalize`, `otel/histogram` |
| 4 적재 | `apm_metric_1m` UPSERT(같은 키면 count 벡터 합) · 스팬은 트레이스 단위 트랜잭션(advisory lock)+논리 dedup · SQL 정책 · 폐기 사유 카운터 | `collector/ingest/store`, `trace` |
| 5 롤업 | 5분마다 닫힌 버킷을 1m→5m→1h(같은 `bounds_id`끼리 벡터 합, 워터마크 1개, LAG 3분) · 스팬 5분 롤업 4종 한 트랜잭션 · 일 파티션 DROP · 14일 미수신 자동 숨김 | `core/batch/{rollup,retention,partition}` |
| 6 알람 | 5분마다 규칙 평가(전역→서비스 펼침) → `history.push` → 다음 실행에서 eventid 짝 · 일 1회 드리프트 대조 | `alert/{evaluate,bridge,sync}` |
| 7 조회 | 창에 따라 1m/5m/1h 선택(1h~24h는 1m/5m, 7d는 5m, 30d+는 1h) · 히스토그램 벡터에서 p50/p95/p99 선형 보간 · 24h 가용성은 5m 기준선+워터마크가 정하는 1m 꼬리 | `service/*`, `overview` |
| 8 Live | 10초 링 버퍼(export 시각 기준) → SSE snapshot/bucket(6칸 겹침)/heartbeat | `overview/live` |

**p95가 나오는 과정(예).** 1분 버킷에 count 1200, 누적 개수가 1140(=95%)을 넘는 버킷이 `[0.25, 0.5)`이고 그 버킷 직전 누적이 1100, 버킷 개수가 50이면 p95 ≈ 0.25 + (1140−1100)/50 × (0.5−0.25) = 0.45초. 5분·1시간 롤업은 count 벡터를 더한 뒤 같은 계산을 하므로 백분위가 "평균의 평균"으로 왜곡되지 않는다.

**STALE 판정의 원인 분리.** 서비스 마지막 수신이 끊겼을 때 Collector 자기 메트릭(`otelcol_exporter_send_failed_*`, `otelcol_exporter_queue_size`, `otelcol_receiver_accepted_*`)을 함께 보면 "앱이 죽음"(receiver 0) vs "Collector가 죽음"(자기 메트릭도 끊김) vs "BE 거부"(send_failed 증가)를 화면에서 가른다.

---

## 10. OpenTelemetry의 한계

OTel을 쓰면 계측·전송이 공짜지만, 아래는 OTel이 해 주지 않거나 함정이 되는 것들이다.

| # | 한계 | 영향 | 우리 대응 |
|---|---|---|---|
| 1 | **백엔드가 없다.** 저장·집계·화면·알람·보존은 표준 밖 | APM 제품의 절반은 우리가 만들어야 한다 | 이 프로젝트 자체(~247 사람-일) |
| 2 | **자동계측은 프레임워크 경계까지.** 내 메서드는 스팬이 아니다 | "코드 수준 추적" 체크리스트에 그대로 ✅ 못 씀 | Java는 `methods.include`(코드 수정 0), `@WithSpan`은 의존성 추가로 구분 안내. 타 언어는 스택별 가이드에서 각각 확인(일반화 금지) |
| 3 | **Go·C++·정적 바이너리는 자동계측 없음** | 수동 SDK 필요 | "수동 계측 가이드"로 정직 표기. eBPF는 후보만 |
| 4 | **시맨틱 컨벤션 변동.** HTTP 이름·단위가 바뀌었고 언어별 채택 속도가 다르다 | Python 구 이름 전량 폐기됐던 실측(D1) | 구 이름 별칭 + `OTEL_SEMCONV_STABILITY_OPT_IN` 가이드 |
| 5 | **opt-in 메트릭.** `http.server.active_requests`는 규격상 선택 | Node·Python은 액티브 트랜잭션이 안 나온다 | "계측 미제공" 배지, P2에서 in-flight 스팬 수로 근사 |
| 6 | **히스토그램 경계가 계측마다 다르다.** 단위(초/ms)도 섞인다 | 재버킷 오차, 분포 날조(D2: wait_time을 초 단위+ms 격자로 보내 p95 4.7초 오표시) | 패밀리별 정규 경계, 원본 경계 보존, 촘촘한 격자로 접지 않기, `rebucketed` 표시 |
| 7 | **UpDownCounter는 delta 설정에도 CUMULATIVE** | 메트릭 단위 판정이 틀린다 | 데이터포인트 단위 temporality |
| 8 | **Exemplar에 원문이 실린다.** `filteredAttributes`에 SQL·URL·IP | Collector `attributes/drop`이 exemplar 속성은 안 만진다 → PII 누출 | BE에서 traceId·spanId·시각·값만 보존 |
| 9 | **Exemplar는 대표 표본이지 최댓값이 아니다** | "가장 느린 요청"으로 오해 | 화면 문구 정정, `valueMs` 개명 예정 |
| 10 | **OTLP 재시도 규약.** 429·502·503·504만 재시도, 500·403도 즉시 폐기 | BE 500 = 데이터 손실, 라이선스 만료 = 즉시 손실 | 503 계약·500 금지, 만료 배너·수집기 중지 절차 |
| 11 | **tail 샘플링은 단일 Collector 전제** | HA·수평 확장이 어렵다 | 게이트웨이 1대, active-standby 안내, `loadbalancing` 2계층은 승격 항목 |
| 12 | **Collector 한 단계가 더 있다.** 상용 "에이전트 하나"보다 설치가 하나 많다 | 도입 편의성 감점 | yaml 생성기·서비스 등록 스크립트·60초 검증으로 상쇄 |
| 13 | **지연.** export interval(기본 60초)+배치 | 초 단위 실시간 불가 | 10초 권고, '실시간(약 30초 이내)' 문구 |
| 14 | **카디널리티·볼륨은 OTel이 막아 주지 않는다.** route 없는 프레임워크는 원시 경로가 온다 | 행 폭발·PG 용량 | route 500 상한·`__other__`·허용목록·Collector 필터·승격 기준 |
| 15 | **`db.query.text`는 기본 마스킹**(리터럴 `?`) | 파라미터 값이 안 보인다 | 고객 opt-in(개인정보 경고)으로만 해제 |
| 16 | **RUM·프로파일링·로그는 상대적으로 미성숙** | P4 이후 | 브라우저 SDK는 있으나 토큰 노출 등 보안 계약 별도(§15) |
| 17 | **Collector 운영은 고객 몫** | 업그레이드·모니터링 대행은 비범위 | 설정·상태 가시화까지만, 버전 고정(0.159.0) |

---

## 11. 실측이 설계를 뒤집은 것 (교훈)

문서만 믿고 확정했다가 R1·R3·R10·QA에서 뒤집힌 항목. 다음 설계에서도 "전제는 grep/실측으로 한 번 확인"의 근거다.

| 전제(설계) | 실측 결과 | 반영 |
|---|---|---|
| 5xx면 Collector가 30분 재시도로 버틴다 | **500은 즉시 폐기**, 503만 재시도. 60초에 31배치 손실 | BE 응답 계약 503, 500 금지, AI 모니터링 컨트롤러도 정정 |
| 403은 재시도로 버틴다 | 영구 실패로 즉시 폐기 | 만료 = 즉시 손실, D-14 배너 |
| delta 선호를 켜면 전부 delta | UpDownCounter는 CUMULATIVE | 포인트 단위 판정 |
| exemplar는 trace_id만 | 원문 SQL·url.path·IP가 실림 | BE 폐기 |
| 재버킷은 선형 보간이면 충분 | 초 단위 값+ms 격자 → 한 칸을 12칸에 균등 분배해 p95 4.7초 오표시 | 격자 분할 금지, `UNIQUE(bounds,family)`, min/max 방어 |
| Java는 `active_requests` 플래그 필요 | 플래그 없이 나옴. Node·Python은 안 나옴 | 언어별 표 |
| Python은 새 semconv 기본 | 구 이름으로 와서 전량 폐기 | `OTEL_SEMCONV_STABILITY_OPT_IN=http` 필수 가이드 |
| 행당 150B | **686B**(인덱스가 절반, 1m PK 하나가 41%) | 용량 어림 4.5배 상향, 승격 기준 재정의 |
| 롤업 5분 초과면 승격 | 정상 1회 1.2초, 백필만 6분 | "정상 1회 60초" 기준, `maxBuckets` 288→60 |
| 목록 화면은 빠르다 | 24h cold 13초(1m 원시 12.96M행 스캔) | 5m 기준선+1m 꼬리 하이브리드 → 1/15 |
| 질의 최적화는 SQL 손질 | `order by` 제거·전개 폭 축소 모두 무효, **`work_mem` 4→64MB 하나**가 스필을 없앰 | PG 튜닝을 설치 가이드가 직접 안내 |
| 아이템 만들면 바로 push 가능 | 서버 캐시 동기화 ~10초 전엔 "does not exist" | 대기≠실패, `cache_ready`는 첫 push 성공에서만 |
| `problem.get recent:true`로 복구 판정 | 최근 해소분 포함 | `recent:false`/`event.get` |
| 기존 알림 채널로 보내면 된다 | 제품 자체 푸시는 이메일뿐, Slack/Teams는 Zabbix 미디어 | Zabbix `history.push` 경유 |
| 코드 수준 추적은 자동 | 프레임워크 경계까지만 | `methods.include` 안내 |
| PG 파티션 PK는 자유 | 파티션 키가 PK에 포함돼야 함 | `PK(trace_id, span_id, start_ts)` |
| 실시간 = 초 단위 | 화면 도달 중앙값 14초·최악 23초 | '약 30초 이내' |

---

## 12. 용어집

| 용어 | 뜻 |
|---|---|
| **OTel** | OpenTelemetry. 관측 데이터 생성·수집·전송의 CNCF 표준 |
| **OTLP** | OpenTelemetry Protocol. gRPC 4317 / HTTP 4318, protobuf 또는 JSON |
| **Collector** | 받고·가공하고·내보내는 독립 프로세스. 우리는 `otelcol-contrib` 0.159.0 게이트웨이 1대 |
| **자동계측(auto-instrumentation)** | 앱 코드 수정 없이 런타임에 계측을 주입. Java `-javaagent` |
| **시맨틱 컨벤션(semconv)** | 메트릭·속성 이름·단위의 표준 사전. `http.server.request.duration` 등 |
| **Resource** | 데이터를 보낸 주체의 속성. `service.name`, `service.instance.id`, `host.name` |
| **Span / Trace** | 작업 한 구간 / 같은 trace_id를 가진 스팬 트리 = 요청 하나의 경로 |
| **컨텍스트 전파** | `traceparent` 헤더로 trace_id를 서비스 간에 넘기는 것(W3C Trace Context) |
| **Histogram** | 값의 분포(버킷별 개수). p95의 근거 |
| **Exemplar** | 히스토그램 버킷의 대표 표본 + trace_id. 최댓값이 아니다 |
| **Temporality** | DELTA(증분) / CUMULATIVE(누적) |
| **tail 샘플링** | 트레이스가 끝난 뒤 결과를 보고 남길지 결정. 오류·느림 100% |
| **head 샘플링** | 요청 시작 시 확률로 결정. 오류를 놓친다 |
| **RED** | Rate(처리량)·Errors(오류율)·Duration(지연). 서비스 개요의 3대 지표 |
| **정규 경계(canonical bounds)** | 패밀리별로 고정한 히스토그램 경계. 롤업을 벡터 합으로 만든다 |
| **재버킷(rebucket)** | 수신 경계가 다를 때 정규 경계로 선형 보간. 오차가 생기므로 화면에 표시 |
| **STALE** | 서비스 마지막 수신이 임계를 넘음. 원인은 수집기 자기 메트릭으로 가른다 |
| **history.push** | Zabbix 7.0 API. 트래퍼 아이템에 값을 직접 적재. APM 알람 배달 경로 |
| **드리프트(drift)** | 사용자가 Zabbix에서 우리 트리거를 바꿈. 덮어쓰지 않고 배지 |
| **승격(promotion)** | Postgres → ClickHouse, Collector 1대 → 2계층. 수치화된 기준 3축 |
| **`__other__`** | route 500 상한 초과분을 접는 자리표시 |
| **`unknown_service:*`** | `OTEL_SERVICE_NAME` 없는 앱. 서비스로 만들지 않고 격리 |
