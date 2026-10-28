**판정: 현재 초안 그대로의 제품 구현 착수는 보류하고, 확장 지점·전송 경로를 검증하는 제한된 PoC만 진행하는 것이 타당합니다.** 가장 큰 문제는 **샘플링에 따른 누락, 1초 스냅샷과 메트릭 집계의 혼동, 기존 파이프라인을 그대로 사용할 수 있다는 가정**입니다.

대상인 Java agent `2.31.1`과 그 예제가 지정하는 SDK `1.65.0`의 공식 소스, 관련 설계, 현재 BE·Collector 설정을 대조했습니다. 런타임 실험과 성능 측정은 하지 않았으며, 파일도 수정하지 않았습니다.

## §6 답변

### 1. 1초 해상도를 메트릭으로 어떻게 내보내나?

**일반 `Meter`에 매초 기록하고 10~60초마다 export하는 방식으로는 초안의 1초 이력이 보존되지 않습니다.**

- `Gauge`는 같은 속성 조합의 마지막 측정값을 집계합니다.
- `Histogram`에 매초 진행 중 요청들의 경과 시간을 기록하면, export 구간 동안의 관측들이 합쳐집니다. 오래 살아 있는 요청은 반복 관측됩니다. 이것은 **각 초의 동시 요청 분포**와 다른 데이터입니다.
- `ObservableGauge`는 수집 콜백에서 현재 값을 관측하는 수단입니다. 과거 60개의 스냅샷을 timestamp와 함께 재생하는 일반 API가 아닙니다. [Metrics SDK 집계 규약](https://opentelemetry.io/docs/specs/otel/metrics/sdk/#aggregation)

**OTLP로 여러 시점의 포인트를 운반하는 것과, `Meter`가 그 이력을 만들어 주는 것은 별개입니다.** 별도 버퍼·`MetricData` 생성 경로 등을 만들 여지는 있지만, 초안의 “기존 Meter에 올리면 끝” 범위를 벗어납니다. 게다가 60초마다 전달하면 해상도가 1초여도 최신성은 최대 약 60초 뒤처집니다.

권장 표현은 **경과 구간별 현재 건수 5개를 Gauge로 내보내는 것**입니다. 예를 들어 하나의 메트릭에 고정된 `age_bucket` 5종을 둡니다. `timestamp`, `traceId`, 요청 ID를 메트릭 속성으로 넣어 이력을 보존하려는 방식은 피해야 합니다.

전송 선택지는 다음과 같습니다.

| 선택 | 판정 |
|---|---|
| 기존 export 주기 유지 | 가능. “마지막 관측 시점의 분포”로 표시해야 함 |
| 공유 reader를 1초로 설정 | 가능. 해당 reader가 수집하는 **다른 메트릭도** 주기가 짧아지는 비용 검증 필요 |
| 확장 전용 reader·전송 구성 | 후보. 필터링·중복 수집·초기화·종료·exporter 소유권을 별도로 설계해야 함 |
| 매초 기록 후 60초마다 일반 Histogram export | 초안의 요구사항을 충족하지 못함 |

Java의 `otel.metric.export.interval` 기본값은 `60000`ms이며 설정 가능합니다. 하지만 **1초 export 설정이 화면까지 1초 지연을 보장하지는 않습니다.** Collector batch와 재시도까지 포함해야 합니다. [Java SDK 설정](https://opentelemetry.io/docs/languages/java/configuration/)

**§2.3의 Meter 획득 자체는 가능합니다. 에이전트 SDK를 공유할 수 있습니다.**

대상 버전에는 다음 경로가 있습니다.

- `OperationMetrics.create(Meter)`에서 에이전트 계측이 사용하는 `Meter`를 직접 받습니다. 공식 확장 예제가 이 방식입니다. [2.31.1 확장 예제](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/examples/extension/src/main/java/com/example/javaagent/DemoInstrumenterCustomizerProvider.java)
- 자체 instrumentation scope가 필요하면 `AgentListener.afterAgent(AutoConfiguredOpenTelemetrySdk)`에서 초기화된 에이전트 SDK를 받아 Meter를 만들 수 있습니다. **별도 SDK를 만들 필요가 없습니다.** [2.31.1 AgentListener](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/javaagent-extension-api/src/main/java/io/opentelemetry/javaagent/extension/AgentListener.java)

다만 SDK 구성 중인 `AutoConfigurationCustomizerProvider`의 생성자 등에서 무작정 `GlobalOpenTelemetry.get()`을 호출하는 것은 피해야 합니다. 초기화 전 호출은 no-op 전역 인스턴스 설정으로 이어질 수 있습니다. [SDK 1.65.0 초기화 동작](https://github.com/open-telemetry/opentelemetry-java/blob/v1.65.0/api/all/src/main/java/io/opentelemetry/api/GlobalOpenTelemetry.java)

### 2. `onStart`의 맵 put 비용은 무시할 만한가?

**모릅니다. 현재 설계만으로 무시할 만하다고 판정할 근거가 없습니다.**

비용은 put 한 번으로 끝나지 않습니다. 키·엔트리 생성, 시간 읽기, 속성 접근, 상한 관리, remove, 매초 순회와 임시 객체 생성이 포함됩니다. `onStart`는 스팬을 시작한 스레드에서 동기 실행되므로 이 비용이 요청 경로에 들어갑니다. [SpanProcessor 실행 규약](https://opentelemetry.io/docs/specs/otel/trace/sdk/#onstart)

규모는 RPS뿐 아니라 **동시 진행 건수와 요청 수명**에 좌우됩니다.

- 정상 상태에서 평균 동시 건수는 대략 `도착률 × 평균 처리 시간`입니다.
- 예시로 5,000 RPS에서 평균 100ms라면 약 500개지만, 평균 5초로 늘면 약 25,000개입니다.
- 장애로 요청이 멈추면 객체가 오래 살아남아 메모리·GC 부담이 달라집니다. 바로 그 상황이 이 기능의 주요 사용 시점입니다.

“잠금 금지”도 구현 가능한 요구사항으로 다시 써야 합니다. `ConcurrentHashMap`은 모든 변경 연산이 lock-free인 자료구조가 아니며, SDK의 `getAttribute()` 등에도 동기화가 있습니다. **확장 코드의 전역 잠금·대기·I/O 금지와, 측정 가능한 지연 예산**으로 정의하는 편이 정확합니다. [ConcurrentHashMap 계약](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html), [SdkSpan 구현](https://github.com/open-telemetry/opentelemetry-java/blob/v1.65.0/sdk/trace/src/main/java/io/opentelemetry/sdk/trace/SdkSpan.java)

확인 방법은 다음과 같습니다.

- 같은 설정의 **OTel만 사용한 경우 / 확장 추가한 경우**를 비교합니다.
- 정상·장기 요청·높은 동시성·상한 포화·Collector 단절을 각각 측정합니다.
- 처리량, 요청 p99, 할당량 B/request, GC pause, 보유 heap, 집계 소요 시간을 봅니다.
- export 주기 단축 비용과 요청 추적 비용을 분리합니다.

1단계에는 `route`, `method`가 필요하지 않으므로 처음부터 보관하지 않는 것이 좋습니다.

### 3. 맵 상한만으로 충분한가? TTL이 필요한가?

**상한은 메모리 보호에는 필요하지만, 관측 기능의 회복까지 보장하지는 않습니다. 그렇다고 단순 TTL 삭제도 정답이 아닙니다.**

종료가 누락된 항목들이 상한을 채우면 새 요청을 계속 놓칩니다. 반대로 오래된 항목을 TTL로 지우면 **실제로 멈춰 있는 가장 중요한 요청**을 화면에서 제거할 수 있습니다.

설계에 다음 구분이 필요합니다.

- 실제 종료 콜백: 관측된 종료.
- TTL·추적 한도에 따른 제거: **종료 확인 불가 또는 추적 중단**.
- 프로세스 종료·재시작: 해당 인스턴스의 관측 단절과 새 epoch.

따라서 TTL을 넣는다면 “요청 완료 처리”가 아니라 **추적 보장 시간의 상한**으로 정의해야 합니다. 제거가 발생한 이후의 분포는 불완전하다고 표시하고, 완전성 회복 조건도 정해야 합니다.

추가로 필수인 것은 다음입니다.

- 동시 삽입에도 지켜지는 상한. `size() < limit` 확인 후 put만으로는 부족합니다.
- 종료·만료·중복 호출이 경합해도 슬롯을 한 번만 반환하는 처리.
- `(traceId, spanId)` 또는 요청별 토큰을 통한 매칭. 스레드 ID 기반 매칭 금지.
- `droppedStarts`, `expiredTracking`, 집계 실패 등의 별도 진단값.

**누락 누적 건수를 현재 활성 건수에 더해서 보정해서는 안 됩니다.** 누락된 요청 중 무엇이 이미 끝났는지 알 수 없습니다. 또한 취소·타임아웃이 반드시 종료 콜백 누락을 뜻하는 것은 아니므로 지원 스택에서 실제 종료 동작을 시험해야 합니다.

### 4. `SpanProcessor`가 맞는 지점인가?

**“기록되는 스팬의 진행 상태”를 보려면 맞지만, “계측된 HTTP 요청 전체”를 세는 기본 지점으로는 문제가 있습니다.**

확인된 동작은 다음과 같습니다.

1. `onStart`는 스팬을 생성한 스레드에서 동기 호출됩니다. 반드시 Servlet 요청 스레드인 것은 아닙니다.
2. 새 스팬이 호출자의 current context로 활성화되기 전일 수 있습니다. `Span.current()` 대신 전달된 `span`을 사용해야 합니다.
3. `onEnd`는 종료를 실행하는 스레드에서 호출되므로 시작 스레드와 다를 수 있습니다.
4. **샘플러가 `DROP`한 스팬은 `onStart`·`onEnd` 대상이 아닙니다.** `RECORD_ONLY`는 대상입니다. SDK 소스가 비기록 결정에서 `SdkSpan` 생성 전에 반환하는 것을 확인했습니다. [SdkSpanBuilder 1.65.0](https://github.com/open-telemetry/opentelemetry-java/blob/v1.65.0/sdk/trace/src/main/java/io/opentelemetry/sdk/trace/SdkSpanBuilder.java)

특히 `parentbased_always_on`도 원격 부모가 비샘플이면 요청을 제외할 수 있습니다. Collector의 tail sampling은 별개입니다. 이미 JVM에서 기록되지 않은 요청을 복구하지 못합니다.

또한 `SERVER`에는 HTTP 이외의 RPC도 포함됩니다. 기존 정본의 HTTP 모집단과 맞추려면 `SERVER` 필터 하나로는 부족합니다. `http.route`도 시작 시점에 확정된다고 가정할 수 없습니다.

**더 적합한 후보는 `InstrumenterCustomizerProvider → OperationMetrics → OperationListener`입니다.**

대상 버전의 `Instrumenter`에서는 스팬 생성 후 `isRecording()` 검사 없이 operation listener를 호출합니다. 따라서 head sampling으로 스팬이 기록되지 않아도 **실제로 시작된 계측 operation**을 추적할 수 있습니다. `HTTP_SERVER` 유형 선택 기능도 있습니다. [Instrumenter 구현](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/instrumentation-api/src/main/java/io/opentelemetry/instrumentation/api/instrumenter/Instrumenter.java)

대가는 명확합니다. 이 customizer는 `incubator`에 있으며, 소스가 **불안정 API이고 언제든 변경될 수 있음**을 명시합니다. [InstrumenterCustomizer 계약](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/instrumentation-api-incubator/src/main/java/io/opentelemetry/instrumentation/api/incubator/instrumenter/InstrumenterCustomizer.java)

**아직 모르는 것:** 고객이 쓰는 각 Servlet·WebFlux·Netty 조합에서 이것이 요청당 정확히 한 번 시작·종료되는지입니다. 비동기 dispatch, 예외, 취소, 스트리밍, instrumentation suppression까지 실제 agent를 붙인 시험으로 확인해야 합니다. 이 검증 없이 “전 Java HTTP 지원”이라고 선언해서는 안 됩니다.

### 5. 1단계만으로 제품 가치가 나오는가?

**가치는 있습니다. 다만 답하는 질문이 다릅니다.**

- 1단계: “지금 오래 걸리는 요청이 쌓이고 있는가?”, “어느 인스턴스가 밀리는가?”
- 2단계: “어떤 요청인가?”, “어떤 route·trace를 조사해야 하는가?”

따라서 **진행 중 요청의 적체 감지 기능으로 선출시**하는 것은 타당합니다. “어느 요청이 오래 걸리는가”까지 해결했다고 표현하면 부족합니다.

1단계에서 유용한 보강은 인스턴스별 보기, 총 진행 건수, 가장 오래된 경과 시간, 마지막 관측 시각, 관측 완전성입니다. 요청 목록을 미리 구현할 필요는 없습니다.

단, 1초 스냅샷은 그 사이 시작하고 끝난 짧은 요청을 놓칠 수 있습니다. 완료 차트와 구간 색을 공유하더라도 **완료 건수와 순간 동시 건수는 같은 모집단이 아닙니다.** 시간축을 축약할 때도 스냅샷 건수를 단순 합산하면 안 됩니다.

2단계에서도 trace ID가 있다는 이유만으로 즉시 상세 조회가 되는 것은 아닙니다. 아직 종료되지 않았거나 sampling으로 저장되지 않은 trace일 수 있습니다.

### 6. 지원 범위와 킬 스위치는 어디까지 필요한가?

**첫 출시부터 필요합니다. 하지만 킬 스위치 하나로 장애 원인을 즉시 배제할 수 있다고 약속해서는 안 됩니다.**

최소 범위는 다음과 같습니다.

| 장치 | 필요한 동작 |
|---|---|
| 시작 시 비활성화 설정 | listener·집계 작업·메트릭 콜백 등록 자체를 생략 |
| 완전 제거 절차 | extension 설정 제거 후 JVM 재시작 |
| 선택적 런타임 중지 | 원격 서버 없이 로컬 제어로 신규 추적·집계 중단. 이미 보유한 상태와 재활성화 처리 정의 |
| 자체 상태 | 확장 버전, 활성 상태, 추적 건수·상한, 누락·만료·오류, 마지막 정상 집계 시각 |
| 장애 격리 | 요청 경로의 확장 오류를 제한적으로 격리하고 반복 실패 시 확장 기능 중지 |
| 자원 상한 | 엔트리 수뿐 아니라 문자열 길이, 집계 임시 메모리, 작업 시간, 로그 빈도까지 제한 |
| 지원 매트릭스 | 검증한 agent·JDK·프레임워크 조합만 명시 |

첫 PoC는 **agent 한 버전, JDK 한 버전, Spring MVC/Tomcat 한 조합**으로 좁히는 것이 좋습니다. Servlet async는 별도 시험 항목으로 두고, WebFlux·virtual thread·다중 WAR는 검증 전 지원 범위에 넣지 않습니다.

“어떤 예외에도 고객 앱은 멀쩡하다”는 절대 보장은 불가능합니다. 같은 JVM의 OOM, CPU 고갈, 클래스로딩 실패까지 완전히 격리할 수는 없습니다. 또 런타임 중지는 이미 발생한 자원 압박이나 로드된 클래스를 되돌리지 않습니다. 최종 장애 비교에는 **확장 없이 재시작한 조건**이 필요할 수 있습니다.

## 🔴 반드시 고칠 설계 결함

**1. §2.1의 관측 모집단이 틀릴 수 있습니다.**

현재 설계는 “진행 중 HTTP 요청”이라고 부르지만 실제로는 “기록되는 SERVER 스팬”입니다. sampling·HTTP 판별·중복 계측 조건을 명시하고, 우선 `OperationListener` 방식의 정확성을 검증해야 합니다. 샘플링 비율로 나눠 전체 건수를 추정하는 방식은 이 프로젝트 원칙에 맞지 않습니다.

**2. §2.3의 “기존 파이프라인 그대로”는 현재 코드와 맞지 않습니다.**

확인한 실제 경로는 다음과 같습니다.

| 현재 구현 | 설계에 미치는 영향 |
|---|---|
| Collector가 메트릭 이름을 허용목록으로 필터링 | `moveseye.*` 같은 신규 이름은 설정 변경 없이 통과하지 않음 |
| Collector batch timeout `5s` | agent가 1초로 보내도 1초 관제 지연을 보장하지 못함 |
| exporter에 디스크 큐·재시도 설정 | 과거 값이 뒤늦게 도착할 수 있고 디스크에도 남을 수 있음 |
| BE가 허용목록 검사 후 저장 행 생성 | 신규 이름·차원 계약 추가 필요 |
| BE가 저장 성공 뒤 Live로 전달 | §5의 “저장하지 않음”을 그대로 충족하지 못함 |

근거: [Collector 템플릿](/C:/solutions/moveseye-be-spring/src/main/resources/apm/collector-template.yaml:63), [MetricIngestor](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:135).

**같은 OTLP 포트·인증은 재사용할 수 있습니다.** 그러나 Collector 설정, BE의 Live 전용 처리, 지연·보존 정책까지 무변경이라는 결론은 철회해야 합니다. “저장하지 않음”이 영구 DB만 뜻하는지 디스크 큐도 포함하는지도 정해야 합니다.

**3. §4.4의 자동 마스킹 가정은 틀렸습니다.**

현재 metrics pipeline에는 `redaction/pii`가 없습니다. traces와 logs에만 들어갑니다. Collector를 통과한다는 사실만으로 마스킹이 적용되지 않습니다. [실제 pipeline 설정](/C:/solutions/moveseye-be-spring/src/main/resources/apm/collector-template.yaml:121)

2단계의 `traceId·spanId·route`를 메트릭 속성으로 보내는 것도 권하지 않습니다. 동시 목록 상한이 있어도 시간에 따라 ID가 계속 바뀌므로 시계열 수가 증가합니다. **1단계 숫자 메트릭과 2단계 요청 목록의 전송 계약은 분리해서 검토해야 합니다.**

**4. §3의 “수신 없음 → 확장이 없습니다”도 관측을 넘어선 단정입니다.**

수신이 없다는 사실만으로 미설치를 구별할 수 없습니다. 비활성화, 호환 실패, 메트릭 필터, 전송 장애, 프로세스 종료도 같은 증상입니다.

최소한 다음을 구분해야 합니다.

- 정상 관측된 0건
- 일부 요청 또는 일부 인스턴스만 관측
- 관측 지연·중단
- 명시적으로 확인된 비활성·미지원
- 설치·상태 확인 불가

정상일 때는 **0인 구간도 명시적으로 전송**해야 합니다. 별도 capability·상태 신호 없이 “미설치”라고 표시하면 “관측 없음 ≠ 0”와 같은 종류의 오류를 다른 문구로 반복합니다.

**5. 스냅샷 일관성과 시간 계약이 없습니다.**

맵을 순회하는 동안 시작·종료가 발생하므로 `ConcurrentHashMap` 순회 결과는 정확히 한 순간의 원자적 스냅샷이 아닙니다. 요청 스레드를 잠그지 않으려면 이 관측 오차를 인정하고, 집계 시간과 허용 범위를 정의해야 합니다.

필수 계약은 다음입니다.

- 동일 집계 결과에서 생성한 5개 구간과 총합.
- 서로 겹치지 않는 구간 및 경계값 포함 규칙.
- 경과 시간은 monotonic clock, 전송 관측 시각은 epoch timestamp로 구분.
- 인스턴스·기동 epoch별 최신값 교체.
- 중복·역순·오래된 재시도 값 처리.
- GC pause나 집계 실패로 빠진 구간은 결측 유지.

`n(<100ms), n(<500ms)` 표기는 누적 구간처럼 읽힙니다. 스택용이라면 `[0,100), [100,500)…`처럼 배타적 구간임을 명확히 해야 합니다.

**6. 클래스 로더·패키징·종료 수명주기를 설계에 넣어야 합니다.**

공식 예제는 agent가 제공하는 API/SPI를 `compileOnly`로 사용하고, 확장 자체 의존성만 함께 패키징합니다. 또한 일반 extension 코드가 애플리케이션 클래스패스에 자유롭게 접근할 수 있다고 가정하지 않습니다. [2.31.1 공식 빌드 구성](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/examples/extension/build.gradle.kts)

최소 규칙은 다음과 같습니다.

- OTel API·SDK를 확장 안에 별도로 복제하거나 임의 relocation하지 않기.
- 추가 라이브러리는 최소화하고 필요한 충돌 방지·서비스 등록 파일 보존 검증.
- app의 Spring·Servlet·로깅 구현에 일반 확장 코드가 직접 의존하지 않기.
- request·response·thread·전체 context를 맵에 장기 보유하지 않기.
- scheduler·콜백의 종료와 재배포 시 참조 해제 정의.
- 여러 instrumenter가 같은 메트릭을 등록할 때 중복 집계 방지.

“안 붙으면 로그 한 줄”만으로는 부족합니다. 호환 오류가 확장 비활성화로 끝나는지, 기본 OTel 계측까지 영향을 주는지 시험해야 합니다.

## 🟡 고려하면 좋음

- **§7의 4.5일은 제한된 데모 또는 PoC 추정으로는 가능하지만, 고객 배포 가능한 1단계 일정으로는 부족합니다.** 현재 표에는 비동기 종료 정확성, sampling 시험, 클래스 로더·호환성, 장애 주입, 장시간 누수, 기존 메트릭 비용 증가, Live 전용 수신 처리가 빠져 있습니다.
- 정확한 공수는 아직 모릅니다. 계획용으로만 잡는다면, 한정된 지원 조합의 1단계에 **약 12~20인일 수준을 임시 범위**로 보고 PoC 결과로 재산정하겠습니다. 실측 근거가 있는 일정은 아니며, 2단계 목록과 광범위한 호환성 지원은 제외한 판단입니다.
- 매초 전체 맵을 복사하지 말고, 순회해서 작은 불변 집계 결과만 만드는 방식을 우선 검토하십시오. “전송량 5칸”은 맞지만 **추적 메모리와 집계 CPU도 상수라는 뜻은 아닙니다.**
- SSE·long polling·스트리밍 요청은 정상이어도 오래 살아 있습니다. 이를 일반 API 적체와 함께 표시할지 정책이 필요합니다.
- 구 정본 §4.3의 instance epoch·종료 확인 불가·상태 복구 요구사항이 이번 초안에서 빠졌습니다. 요약 스냅샷 방식에 맞춰 계승할 부분을 명시해야 합니다.
- 출시 게이트에는 정상 처리뿐 아니라 `always_off`, 비샘플 원격 부모, 취소·타임아웃, 상한 포화, Collector 단절·복구, 재시작을 넣는 것이 좋습니다.

## 더 나은 대안 (있으면)

**현재 목표와 제약에서는 확장을 없애기보다, 확장 내부의 관측 지점을 바꾸는 것이 가장 유력합니다.**

| 대안 | 얻는 것 | 대가·한계 |
|---|---|---|
| **OTel `OperationListener` 확장** | head sampling과 분리된 요청 수명 관측, 에이전트 Meter 재사용 | 불안정 SPI 버전 고정·프레임워크별 검증 필요. 현재 최우선 PoC 후보 |
| **Servlet Filter / Spring WebFilter** | 앱의 요청 수명을 직접 관측하고 trace sampling과 분리 | 앱 의존성 추가·재배포 필요. Servlet과 reactive 별도 구현 |
| **Micrometer `LongTaskTimer`** | 진행 중 건수·총 경과·최대 경과를 기존 계측으로 제공 | 정확한 5구간 지원은 registry별 확인 필요. 요청 수명 연결은 여전히 필요 |
| **JFR** | GC·잠금·CPU 등 원인 조사에 유용 | 기본 duration event만으로 미완료 HTTP 요청 목록을 얻지 못함. 별도 시작·종료 계측이 필요 |
| **eBPF / 프록시 계측** | JVM 밖에서 프로토콜 수준 요청을 관측 가능 | JVM 내부 처리 수명·route·trace와 동일한 의미가 아님. 플랫폼·권한·프로토콜 제약과 별도 구현 비용 |
| **기존 `http.server.active_requests`만 사용** | 가장 작은 추가 위험으로 현재 동시 건수 제공 | 경과 구간·개별 요청 식별은 해결하지 못함 |

Servlet Filter는 `finally`에서 무조건 종료 처리하면 async 요청을 너무 일찍 제거합니다. `AsyncListener`의 완료·타임아웃·오류·재시작 수명주기까지 처리해야 합니다. [Servlet AsyncListener](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/asynclistener)

Micrometer의 `LongTaskTimer`는 실제 진행 중 작업을 측정하며, Prometheus 구현은 설정에 따라 `GaugeHistogram`도 제공합니다. 다만 이 동작이 현재 OTLP registry에도 같은 형태로 전달된다고 가정해서는 안 됩니다. [LongTaskTimer](https://docs.micrometer.io/micrometer/reference/concepts/long-task-timers.html), [Prometheus 구현](https://docs.micrometer.io/micrometer/reference/implementations/prometheus.html)

JFR의 일반 duration event는 완료·commit 시 기록됩니다. 미완료 요청 관측 문제를 자동 해결하지 않습니다. [JFR 시간 측정](https://docs.oracle.com/en/java/javase/22/jfapi/measuring-time.html)

eBPF는 프로세스 밖에서 프로토콜을 관측할 수 있으므로 §0의 “신호를 만들 수 있는 자리는 JVM 안뿐”은 절대적으로는 틀립니다. 다만 **현재 완료 스팬만 받는 Collector를 수정해서 JVM 내부의 현재 요청 상태를 복원할 수 없다는 판단은 맞습니다.** [OTel eBPF의 관측 방식](https://opentelemetry.io/blog/2025/obi-announcing-first-release/)

## ✅ 타당하다고 본 것

- 완료 스팬으로 현재 진행 중 요청을 꾸며 내지 않는 원칙.
- 개별 목록보다 낮은 카디널리티의 요약부터 검증하는 단계 분리.
- 별도 HTTP 클라이언트·인증·재시도 구현을 줄이고 OTel SDK·OTLP를 재사용하려는 방향.
- 고객 JVM 내부 코드라는 점을 제품 지원·성능·배포 책임으로 취급한 것.
- 비용을 실측하고, 상한·비활성화·제거 절차를 제공하려는 방향.
- 완료 차트와 경과 구간 경계를 공유하되, 진행 중 관측임을 분명하게 구분하려는 의도.
