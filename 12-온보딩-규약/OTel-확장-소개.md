# MovesEye OTel active-request extension (0.2.0)

OpenTelemetry Java agent `2.31.1`의 `InstrumenterCustomizerProvider → OperationMetrics →
OperationListener` 지점에서 HTTP 서버 요청의 **시작·종료를 직접 세어** 진행 중 요청을 관측한다
(스팬은 끝나야 export되므로 스팬으로는 볼 수 없다). PoC(0.1.0)에서 출발해 2026-09-22~23에 제품 후보가 됐다 —
🔴 **고객 JVM 안에서 도는 코드**라 요청 경로에 문자열·락·예외를 두지 않는 것이 첫 규칙이다.

무엇을 보내나(1초마다, 기존 OTLP 파이프라인으로):
- metric `moveseye.http.server.active_requests{moveseye.age_bucket=lt_100ms|lt_500ms|lt_1s|lt_5s|ge_5s}` · `.oldest_age` · `.limit` · `.dropped_recent` · `.expired_recent`
- metric `moveseye.http.server.requests.started_recent` · `.ended_recent{moveseye.outcome=ok|slow|error}`
- log(`moveseye.kind=active_requests`) 본문 `[{t,s,m,p,e,o,d}]` — 가장 오래된 처리 중 요청 N건(trace·span·메서드·**가려진** 경로·경과·지금 하는 일·그 경과). 🔴 시작 시각(13자리 epoch ms)은 싣지 않는다 — 수집기 `redaction/pii` 카드번호 패턴이 가려 JSON이 깨진다(2026-09-23 실측). BE가 `asOf − e`로 만든다

BE 수신·화면·상한은 `C:/solutions/_workspace/contract_apm-p5-live.md`("P5.3b" 절), 배경은
`_workspace/guides/apm-handbook/18-p5-realtime.md` §10.10.

## 고정 범위

- JDK 17 · OpenTelemetry Java agent 2.31.1(incubator SPI — 에이전트를 올리면 재검증)
- Spring Boot 3.3.5 / Spring MVC / embedded Tomcat 10.1에서 검증
- 요청 경로에서 보관하는 것: 시작 nanoTime·epoch, 메서드, **경로 참조**(가리기는 1초 스냅샷이 상위 N건에만), trace/span ID, 지금 하는 하위 작업의 **속성 참조**. request/response·thread는 보관하지 않는다
- 저장 없음 — BE도 메모리(90초)만. 임계를 넘긴 요청만 BE가 장부(`apm_stuck_request`)로 옮긴다

## 제품 배치

앱 JVM 실행줄(에이전트 jar와 같은 폴더 `C:\ProgramData\moveseye\otel\`이 우리 관례):
```
-javaagent:.../opentelemetry-javaagent.jar -Dotel.javaagent.extensions=.../moveseye-otel-extension-0.2.0.jar -Dotel.service.name=<서비스>
```
빌드는 `gradlew.bat jar` → `build/libs/moveseye-otel-extension-0.2.0.jar`. 이 폴더는 git이 아니다.

## 빌드와 실행

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
.\gradlew.bat clean test build
.\scripts\run-p1.ps1
.\scripts\run-p2.ps1
```

P1/P2 원시 결과는 `build/poc-results/`에 남는다. 최종 판단과 관측 조건은
`C:/solutions/_workspace/verification/r-p5-3b-extension-poc.md`가 정본이다.

## 설정 (system property)

| system property | 기본값 | 의미 |
|---|---:|---|
| `moveseye.active-requests.max-active` | 10000 | 동시 추적 상한(= 배열 칸 수, 최대 200,000 — 1초 집계가 전체를 훑으므로 상한이 곧 초당 비용) |
| `moveseye.active-requests.tracking-ttl-millis` | 600000 | 완료가 아닌 추적 포기 시간 |
| `moveseye.active-requests.aggregate-interval-millis` | 1000 | 0이면 주기 집계 중지 |
| `moveseye.active-requests.output` | 빈 값 | 시험 harness가 읽을 상태 JSON 경로 |
| `moveseye.active-requests.write-every-snapshot` | false | true면 집계마다 상태 파일 기록(진단용 — 켜고 비용을 재면 파일 I/O를 잰다) |
| `moveseye.active-requests.export-interval-millis` | 1000 | 진행 중 요청 metric만 따로 보내는 주기(전용 MeterProvider). 0이면 에이전트 metric 주기를 탄다 |
| `moveseye.active-requests.metrics.enabled` | true | false면 metric을 내보내지 않는다(추적만) |
| `moveseye.active-requests.slow-threshold-millis` | 2000 | 종료 요청을 "느림"으로 셀 경과 기준(ms). BE 실시간 관제 slowMs와 같게 둔다 |
| `moveseye.active-requests.list.size` | 30 | 1초마다 로그 한 줄로 보내는 "가장 오래된 처리 중 요청" 수(최대 100, 본문 64K자 상한). 0이면 안 보낸다. 잘못된 값은 30 |
| `moveseye.active-requests.exclude-paths` | `/apm/live/stream,/apm/live/spans/stream,/event/stream,/events/stream` | 추적·흐름에서 뺄 경로 접두(쉼표, 최대 32개·각 200자). SSE·long-polling처럼 원래 오래 열리는 연결 |
| `moveseye.active-requests.detailed-counters` | false | true면 정상 경로 카운터(시작·종료 콜백, 추적 시작·종료)도 센다. P1 검증용 |

`MeterPathProbeAgentListener`는 초기화 완료 뒤 `AutoConfiguredOpenTelemetrySdk`가 전달되는 경로만
확인한다. `GlobalOpenTelemetry.get()`을 호출하거나 meter/exporter를 등록하지 않는다.

## 추적기 비교 측정

이전(맵) 구현 사본 `MapActiveRequestTracker`(테스트 전용)와 현재 배열 구현을 같은 JVM에서 교대로 잰다.

```
gradlew test -Dmoveseye.bench=true --tests *Bench*
```

결과와 해석 범위는 `_workspace/verification/r-p5-3b-extension-poc.md`의 "추가 — 추적 자료구조 개선" 절.
