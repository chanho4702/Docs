# MovesEye OpenTelemetry Extension

Java 애플리케이션에서 **현재 처리 중인 HTTP 요청**과 요청별 Hikari 커넥션 획득을 관측하는 OpenTelemetry Java Agent 확장입니다.
요청의 시작과 종료를 추적하고, 경과 시간별 요청 수와 오래 실행 중인 요청 목록을 OTLP로 전송합니다.

예를 들어 응답이 끝나지 않은 요청이 몇 개인지, 얼마나 오래 실행 중인지,
해당 요청이 DB 또는 외부 서비스 호출을 수행 중인지 확인하는 데 사용할 수 있습니다.

## 주요 기능

- 처리 중인 HTTP 요청을 경과 시간별 다섯 구간으로 집계
- 가장 오래 실행 중인 요청의 경과 시간과 상세 목록 제공
- 요청 시작 건수와 정상·느림·오류별 종료 건수 집계
- DB·외부 HTTP·RPC 하위 작업 정보 표시
- 고정 크기 추적 공간과 TTL로 요청 정보 보관 범위 제한
- 경로의 일부 식별자 마스킹과 쿼리스트링 제거

확장 JAR와 시험용 애플리케이션, 부하 생성기, 검증 스크립트가 포함되어 있습니다.
수집 데이터를 저장하거나 화면에 표시하려면 별도의 Collector 및 수신 시스템을 구성해야 합니다.

## 상세 문서

- [설계 문서](docs/worktrees--design.md): 구성 요소, 요청 수명주기, 동시성, 전송 계약, 설계 결정과 제한 사항
- [개발 가이드](docs/worktrees--development.md): 환경 준비, 빌드·테스트, 코드 변경 위치, 성능 검증과 배포 점검

## 개발 환경

| 항목 | 프로젝트 기준 |
|---|---|
| Java | JDK 17 toolchain |
| 빌드 | Gradle Wrapper 포함 |
| OpenTelemetry Java Agent | 2.31.1 |
| 확장 버전 | 0.3.0 |
| 시험용 애플리케이션 | Spring Boot 3.3.5 / Spring MVC / embedded Tomcat 10.1 |

확장은 Agent가 제공하는 incubator SPI와 SDK 내부 접근에 의존합니다.
다른 Agent 버전이나 웹 프레임워크에 적용할 때는 호환성을 별도로 검증해야 합니다.

## 빠른 시작

### 1. 빌드

JDK 17을 설치하고 `JAVA_HOME`을 해당 JDK 설치 디렉터리로 설정합니다.
프로젝트 루트에서 실행합니다. 최초 실행에는 Gradle과 의존성을 내려받을 네트워크 연결이 필요합니다.

Windows PowerShell:

```powershell
.\gradlew.bat test build
```

Linux / macOS:

```bash
./gradlew test build
```

확장 JAR는 다음 위치에 생성됩니다.

```text
build/libs/moveseye-otel-extension-0.3.0.jar
```

확장 JAR만 생성하려면 `test build` 대신 `jar`를 사용합니다.
OpenTelemetry 라이브러리는 실행 시 Agent가 제공하므로 확장 JAR에 포함하지 않습니다.

### 2. 애플리케이션에 연결

OpenTelemetry Java Agent `2.31.1` JAR를 별도로 준비합니다.
다음은 작업 디렉터리에 아래 파일을 배치한 경우의 예시입니다.

```text
app.jar
lib/
├─ opentelemetry-javaagent.jar
└─ moveseye-otel-extension-0.3.0.jar
```

```text
java -javaagent:lib/opentelemetry-javaagent.jar -Dotel.javaagent.extensions=lib/moveseye-otel-extension-0.3.0.jar -Dotel.service.name=sample-service -jar app.jar
```

파일명과 상대 경로는 실제 배치에 맞게 바꿉니다. `-javaagent` 및 `-D` 옵션은 `-jar` 앞에 둡니다.

Agent의 OTLP endpoint, 인증, TLS, metrics 및 logs exporter도 환경에 맞게 설정해야 합니다.
확장은 Agent의 전송 설정을 이용하며, 요청 목록을 받으려면 logs 수집 경로도 활성화해야 합니다.

## 프로젝트 구조

```text
moveseye-otel-extension/
├─ src/main/java/com/dmove/moveseye/otel/active/
│  ├─ instrumentation/  요청 시작·종료와 하위 작업 감지
│  ├─ tracking/         진행 중 요청 보관·만료·집계
│  └─ export/           metric 및 목록 log 생성·전송
├─ src/main/resources/META-INF/services/  Agent 확장 진입점 등록
├─ src/test/java/       패키지별 단위 테스트
├─ testapp/             시험용 HTTP 서버
├─ loadgen/             HTTP 부하 생성기
├─ scripts/             수명주기 및 성능 검증 스크립트
├─ build.gradle.kts     확장 빌드 설정
└─ settings.gradle.kts  하위 프로젝트 구성
```

세 패키지를 접수 담당, 진행 명단, 보고 담당으로 생각하면 흐름을 이해하기 쉽습니다.
모두 하나의 확장 JAR에 포함됩니다.

| 패키지 | 주요 코드 | 역할 |
|---|---|---|
| `instrumentation` | [MovesEyeInstrumenterCustomizerProvider](file:///C:/worktrees/apm-deep-otel/src/main/java/com/dmove/moveseye/otel/active/instrumentation/MovesEyeInstrumenterCustomizerProvider.java) | 계측 유형에 맞는 요청·하위 작업 리스너 등록 |
| `instrumentation` | [ActiveRequestOperationMetrics](file:///C:/worktrees/apm-deep-otel/src/main/java/com/dmove/moveseye/otel/active/instrumentation/ActiveRequestOperationMetrics.java), `ActiveRequestChildOperationMetrics` | 요청과 하위 작업의 시작·종료 처리 |
| `tracking` | [ActiveRequestTracker](file:///C:/worktrees/apm-deep-otel/src/main/java/com/dmove/moveseye/otel/active/tracking/ActiveRequestTracker.java) | 고정 배열, 요청 토큰, TTL, 오래된 요청 선별 |
| `tracking` | [ActiveRequestState](file:///C:/worktrees/apm-deep-otel/src/main/java/com/dmove/moveseye/otel/active/tracking/ActiveRequestState.java), `ActiveRequestSnapshot`, `ExtensionDiagnostics` | 설정과 공유 상태, 집계 결과, 초기화 실패 진단 |
| `export` | [ActiveRequestMetricsAgentListener](file:///C:/worktrees/apm-deep-otel/src/main/java/com/dmove/moveseye/otel/active/export/ActiveRequestMetricsAgentListener.java), `DedicatedActiveRequestMeter` | 출력 등록과 metric 전송 주기 구성 |
| `export` | `ActiveRequestListBody`, `ChildOperationDescription`, `PathMasker` | 목록 JSON, 작업 설명, 경로 마스킹 |

처음 읽을 때는 다음 순서를 권장합니다.

```text
MovesEyeInstrumenterCustomizerProvider
  → ActiveRequestOperationMetrics
  → ActiveRequestTracker
  → ActiveRequestMetricsAgentListener
```

## 동작 방식

1. HTTP 서버 요청이 시작되면 추적 토큰을 만들고 OpenTelemetry `Context`에 연결합니다.
2. 토큰을 고정 크기 배열에 보관하고, DB·외부 HTTP·RPC 호출이 발생하면 현재 작업을 기록합니다.
3. 기본 1초마다 배열을 순회하여 경과 시간별 분포와 가장 오래된 요청 목록을 만듭니다.
4. 분포는 metric으로, 상세 목록은 log로 전송합니다.
5. 요청이 종료되면 토큰을 제거하고 결과를 집계합니다. TTL을 넘긴 토큰도 집계 시 회수합니다.

TTL 만료는 추적 정보의 회수이며 애플리케이션 요청을 취소하거나 완료시키지 않습니다.

코드 의존성은 `instrumentation → tracking ← export`입니다.
`tracking`은 OTel 타입에 의존하지 않으며 문자열 가공과 마스킹은 `export`에서 수행합니다.
진입점 클래스를 이동하거나 이름을 변경할 때는 `META-INF/services`도 함께 수정해야 합니다.

## 출력 데이터

### Metrics

| 이름 | 의미 |
|---|---|
| `moveseye.http.server.active_requests` | 경과 시간 구간별 진행 중 요청 수 |
| `moveseye.http.server.active_requests.oldest_age` | 가장 오래된 요청의 경과 시간(ms) |
| `moveseye.http.server.active_requests.limit` | 동시 추적 상한 |
| `moveseye.http.server.active_requests.dropped_recent` | 직전 집계 이후 추적 공간을 확보하지 못한 요청 시작 수 |
| `moveseye.http.server.active_requests.expired_recent` | 직전 집계 이후 TTL로 추적을 종료한 수 |
| `moveseye.http.server.requests.started_recent` | 직전 집계 이후 시작된 요청 수 |
| `moveseye.http.server.requests.ended_recent` | 직전 집계 이후 종료된 요청 수 |

`active_requests`는 `moveseye.age_bucket` 속성으로 다음의 서로 겹치지 않는 구간을 구분합니다.

| 속성값 | 경과 시간 |
|---|---|
| `lt_100ms` | 100ms 미만 |
| `lt_500ms` | 100ms 이상, 500ms 미만 |
| `lt_1s` | 500ms 이상, 1초 미만 |
| `lt_5s` | 1초 이상, 5초 미만 |
| `ge_5s` | 5초 이상 |

`ended_recent`의 `moveseye.outcome`은 `ok`, `slow`, `error`입니다.
HTTP 5xx 또는 응답 상태 코드가 없는 종료를 오류로 분류하며, 오류 분류가 느림 분류보다 우선합니다.

### 요청 목록 로그

`moveseye.kind=active_requests` 속성을 가진 로그 한 건에 오래된 요청 목록을 JSON 배열로 담습니다.
`moveseye.total`은 집계한 진행 중 요청 수, `moveseye.list_limit`은 설정된 목록 최대 건수입니다.

| 본문 필드 | 의미 |
|---|---|
| `t` | Trace ID |
| `s` | Span ID |
| `m` | HTTP 메서드 |
| `p` | 마스킹된 요청 경로 |
| `e` | 요청 경과 시간(ms) |
| `o` | 현재 하위 작업 설명 |
| `d` | 현재 하위 작업의 경과 시간(ms) |

시작 시각은 본문에 포함하지 않습니다. 필요하면 로그 타임스탬프에서 `e`를 빼서 추정할 수 있습니다.

## 설정

### 요청별 Hikari 획득 진단 (M1b 실증 구현)

`-Dmoveseye.diagnostics.enabled=true`로 명시적으로 켭니다. 기본값은 `false`이며
`moveseye.active-requests.metrics.enabled`와 독립입니다. 해제하려면 이 옵션을 제거하거나
`false`로 바꾸고 해당 애플리케이션 JVM을 재시작합니다. 확장 전체를 제거하려면
`otel.javaagent.extensions`에서 이 JAR만 제거하고 재시작합니다.

검증 후보는 **JDK 17 / Agent 2.31.1 / Spring Boot 3.3.5 / embedded Tomcat 10.1.31 /
HikariCP 5.1.0**입니다. 실제 기능 시험과 별도로 30분 부하·8시간 안정성·3회 반복 성능 게이트를
통과하기 전에는 운영 지원 완료로 간주하지 않습니다. WebFlux·가상 스레드·다른 풀·다른 Agent 버전은
지원 실증 범위 밖입니다. 원격 JVM 제어와 JFR는 포함하지 않습니다.

`moveseye.process.run_id` resource UUID는 JVM 시작별로 생성하며 자동 trace·metric과 전용
ActiveRequest Meter에 공통으로 적용합니다. 이 identity 보강은 진단 수집 OFF에서도 적용됩니다.
HTTP 요청 token은 OTel Context로 전달하며 종료 이후 callback은 버립니다.
HikariDataSource의 public `getConnection()`과 `getConnection(String,String)`만 계측하므로
내부 HikariPool 호출·외부 wrapper를 중복 획득으로 세지 않습니다. 두 번째 overload의 미지원 예외도
그대로 애플리케이션에 반환됩니다.

획득 전체 경과는 `POOL_ACQUIRE`입니다. 큐 대기만을 뜻하지 않으며 연결 생성·검증을 포함할 수 있습니다.
10ms 이상인 시도 중 **진입 순서상 앞의 16건**을 보존하며 병렬 완료 순서가 바뀌어도 이 순서를 유지합니다.
작은 시도와 16건 이후 시도도 완료 누적 시간·최댓값·건수에는 포함합니다. 요청 종료 시
`moveseye.pool.acquire` 구간들과 0-duration `moveseye.diagnostics.summary`를 같은 SERVER의 자식
`INTERNAL/UNSET` span으로 내보냅니다. 상세·요약 속성은 `moveseye.diag.*`이며
`attempts = retained + below_threshold + detail_dropped + unfinished`를 지킵니다.
pool 이름·JDBC URL·사용자명·비밀번호·SQL·예외 메시지는 진단 속성으로 만들지 않습니다.

아래 설정에는 모두 `moveseye.diagnostics.` 접두사를 붙입니다. 기동 시 고정되며 범위를 벗어난 값은
기본값으로 돌아갑니다. 상한을 높이는 설정은 제공하지 않습니다.

| 설정 | 기본값 | 허용 범위·의미 |
|---|---|---|
| `enabled` | `false` | 명시적 수집 활성화 |
| `max-active` | `10000` | 1~10000 동시 token |
| `token-ttl-millis` | `600000` | 100~600000ms, 최대 1초 주기 회수 |
| `threshold-millis` | `10` | 10~60000ms |
| `spans-per-second` | `200` | 1~200, JVM 공통 전송률 |
| `burst-spans` | `400` | 17~400, 순간 span 예산 |
| `bytes-per-second` | `262144` | 1024~262144, 추정 payload bytes 예산 |

token마다 16개만 보관하고 풀 식별 레지스트리는 weak key·1024개 상한을 사용합니다.
풀 식별 상한·TTL·token 상한·전송 예산 초과 시 앱 처리는 유지하고 해당 summary 전송을 생략합니다.
진단용 `moveseye.diagnostics.suppressed/unattributed/expired/failures/late_callbacks`는
JVM 시작 이후 누적 값을 가진 gauge입니다. 수신 제품의 allowlist·표시 여부는 별도입니다.
SDK queue와 Collector 전송은 묶음 단위 원자성이 없으므로 실제 도착 구간 수가 retained보다 적을 수 있습니다.
head sampling을 되살리지 않으며 summary가 없으면 0회 획득으로 해석할 수 없습니다.

격리 검증은 `python scripts/run-diagnostics-r0.py --mode on`으로 실행합니다.
`off`, `head-drop`, `ttl`, `budget`, `byte-budget` 모드와 `--active`(전용 Meter 함께 검증)를 지원합니다.
스크립트는 13301/14318 비점유를 먼저 확인하고 본인이 생성한 JVM/Collector만 종료합니다.
결과는 `build/diagnostics-r0/`에 남습니다. `--java`, `--agent`, `--collector`로 로컬 경로를 지정합니다.
Collector 마스킹 재현은 `python scripts/verify-diagnostics-redaction.py`입니다.
배포 Collector에는 진단 ID·run UUID의 형식을 검사한 뒤 해당 키만 redaction에서 보존하는 설정이 필요합니다.
기존 카드번호 정규식은 숫자 위주 span ID·UUID도 훼손합니다. trace 전용 redaction을 사용하고
logs의 동명 키까지 제외하지 않아야 합니다. `--collector-config`로 검증된 격리 설정을 넣을 수 있습니다.
10초 tail 결정 이후 도착은 `verify-diagnostics-tail.py --collector-config <설정>`으로 확인합니다.

### 기존 ActiveRequest 설정

JVM system property로 설정합니다. 예: `-Dmoveseye.active-requests.max-active=20000`.
설정은 JVM 기동 시 읽습니다. 값을 변경한 뒤에는 애플리케이션을 재시작합니다.

아래 설정 이름에는 모두 `moveseye.active-requests.` 접두사를 붙입니다.

| 설정 이름 | 기본값 | 설명 |
|---|---|---|
| `max-active` | `10000` | 동시 추적 상한. 최대 `200000` |
| `tracking-ttl-millis` | `600000` | 추적 정보 보관 제한(ms). `0`이면 TTL 만료 비활성화 |
| `export-interval-millis` | `1000` | 전용 metric 전송 주기(ms). `0`이면 Agent 기본 주기 사용 |
| `metrics.enabled` | `true` | `false`이면 metric·목록 출력과 상세 정보·하위 작업 수집 생략. `output`이 있으면 건수·경과 시간 추적은 유지하며, 없으면 요청 추적 중지 |
| `slow-threshold-millis` | `2000` | 종료된 요청을 느림으로 분류하는 경과 시간 기준(ms) |
| `list.size` | `30` | 오래된 요청 목록의 최대 건수. 최대 `100`. `0`이면 목록과 요청 상세 정보·하위 작업 수집을 생략하고 건수·경과 시간만 집계 |
| `exclude-paths` | 아래 참조 | 추적에서 제외할 경로 접두사. 쉼표로 구분하며 최대 32개, 각 200자 |
| `output` | 빈 값 | 진단용 상태 JSON 파일 경로 |
| `aggregate-interval-millis` | `output` 지정 시 `1000`, 없으면 `0` | 별도 진단 집계 주기(ms). `0`이어도 metric 수집 시 집계는 수행 |
| `write-every-snapshot` | `false` | 집계마다 진단 파일 기록. `output`과 함께 사용 |
| `detailed-counters` | `false` | 검증용 시작·종료 콜백 및 추적 카운터 활성화 |

기본 제외 경로 접두사는 다음과 같습니다.

```text
/apm/live/stream,/apm/live/spans/stream,/event/stream,/events/stream
```

애플리케이션에서 사용하는 SSE나 long-polling 경로에 맞게 설정할 수 있습니다.
전용 metric 전송 경로를 구성하지 못하면 Agent의 기본 metric 전송 주기로 돌아갑니다.
목록 로그도 metric 집계 시 생성되며 실제 전달 시점은 로그 exporter의 설정에 따릅니다.

## 검증 도구

### 단위 테스트

```powershell
.\gradlew.bat test
```

동시 추적 상한, 종료와 만료 처리, 경과 시간 구간, 목록 생성, 마스킹, Agent 진입점 등록을 검증합니다.
결과 보고서는 `build/reports/tests/test/index.html`에 생성됩니다.

### 요청 수명주기 및 부하 시험

먼저 전체 프로젝트를 빌드하고, JDK와 Agent JAR 위치를 명시하여 PowerShell 스크립트를 실행합니다.
다음 예시는 `JAVA_HOME`이 설정되어 있고 Agent JAR를 `lib/`에 배치한 경우입니다.

```powershell
.\gradlew.bat build
.\scripts\run-p1.ps1 -JavaHome $env:JAVA_HOME -AgentJar (Resolve-Path './lib/opentelemetry-javaagent.jar').Path
.\scripts\run-p2.ps1 -JavaHome $env:JAVA_HOME -AgentJar (Resolve-Path './lib/opentelemetry-javaagent.jar').Path
```

- `run-p1.ps1`: 정상 응답, 예외, 취소, 타임아웃, 비동기 처리, 스트리밍의 요청 수명주기 검증
- `run-p2.ps1`: 확장 적용 여부와 집계 조건에 따른 부하 비교
- 결과 저장 위치: `build/poc-results/`

### 추적 자료구조 비교

테스트용 맵 구현과 현재 배열 구현을 같은 JVM에서 비교합니다. 기본 테스트 실행에서는 생략합니다.

```powershell
.\gradlew.bat :test '-Dmoveseye.bench=true' --tests '*Bench*'
```

Linux / macOS에서는 `./gradlew :test -Dmoveseye.bench=true --tests '*Bench*'`를 사용합니다.

## 관측 범위와 해석

- 진행 중 요청 수는 배열을 순회한 결과이므로 모든 요청을 한 시점에 멈춰 찍은 값은 아닙니다.
- 추적 상한과 포화 시 탐색 제한 때문에 요청 일부를 추적하지 못할 수 있습니다. `dropped_recent`을 함께 확인합니다.
- `*_recent`는 집계 간 차분값입니다. 전송이 최종적으로 유실된 구간을 확장이 복구하지 않습니다.
- 현재 하위 작업은 요청당 하나만 보관하며 병렬·중첩 작업 전체를 나타내지는 않습니다.
- 경로 마스킹은 숫자·긴 hex·UUID 형태의 구간과 쿼리스트링을 대상으로 합니다. SQL 리터럴 마스킹은 Agent에 의존합니다.
