# 검수 — APM 수집 회복력 설계 v0 · 코덱스 1회차

- 일시 2026-09-23 · 모델 gpt-5.6-sol(high) · 읽기 전용 · 프롬프트: 설계서+근거 코드 17개 발췌 첨부(샌드박스 파일 실행기 오류로 첨부 기반 검수)
- 대상: `features/apm/ingest-resilience/devdesign_apm-ingest-resilience.md` v0 · 반영 결과는 같은 설계서 v1 §0 표


> 검수 범위: 로컬 파일 실행기가 반복 실패하여, 2026-09-23 첨부 원문과 공식 Spring Boot/Spring Framework 및 OpenTelemetry Collector v0.159.0 문서를 기준으로 검수했다. 첨부만으로 입증되지 않는 내용은 “첨부 범위 밖”으로 표시했다.

## §1 질문 답변

### 1. `ContextClosedEvent`가 graceful 대기보다 먼저인가? 더 나은 훅이 있는가?

**답: 순서는 맞지만, 설계서의 phase 설명은 틀렸다.**

Spring Framework 6.1.14의 종료 순서는 다음과 같다.

1. `ContextClosedEvent` 발행
2. `LifecycleProcessor.onClose()`
3. bean 파괴 및 `@PreDestroy`

이는 실제 `AbstractApplicationContext.doClose()` 순서로 확인된다. 따라서 `ContextClosedEvent`에서 SSE를 닫으면 graceful shutdown 대기보다 먼저 실행된다. [Spring Framework 6.1.14 소스](https://raw.githubusercontent.com/spring-projects/spring-framework/v6.1.14/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java)

다만 Spring Boot 3.3의 `WebServerGracefulShutdownLifecycle` phase는 `Integer.MAX_VALUE`가 아니라 `SmartLifecycle.DEFAULT_PHASE - 1024`다. `Integer.MAX_VALUE` 설명은 구버전 정보다. `moveseye`가 쓰는 Boot 3.3에서는 `ContextClosedEvent` 해법의 결론은 유지되지만 근거를 고쳐야 한다. [Spring Boot 3.3.5 소스](https://raw.githubusercontent.com/spring-projects/spring-boot/v3.3.5/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/web/context/WebServerGracefulShutdownLifecycle.java)

`SmartLifecycle`을 새로 두고 그보다 높은 phase로 SSE를 닫는 방법도 가능하지만, 현재 구조에서는 `ContextClosedEvent`가 더 직접적이다. 단, 다음 보완이 필요하다.

- 이벤트 수신 시 `closing=true`를 먼저 세운다.
- 기존 emitter를 닫는다.
- 그 뒤 들어오는 `subscribe()`도 `closing`을 확인하여 즉시 거절하거나 완료한다.

그렇지 않으면 `ContextClosedEvent` 발행과 웹 서버의 신규 연결 차단 사이에 새 SSE 연결이 들어와 다시 20초를 채우는 경쟁 조건이 생긴다. `AtomicBoolean closed`가 단순 재진입 가드에만 쓰이면 충분하지 않다.

근거: `EventStreamHub.java:59-77`, `ApmLiveStreamController.java:136-153`, `LiveSpanStreamService.java:599-607`.

### 2. Collector 0.159의 persistent queue + `sizer: bytes`, 기존 큐 호환, 기본 2 GiB가 적정한가?

**조합은 지원된다. 기존 0.159 큐도 소스상 호환된다. 그러나 “2 GiB 디스크 상한”이라는 해석과 기본값의 적정성은 틀렸다.**

v0.159.0은 `requests`, `items`, `bytes`를 모두 queue sizer로 받으며, `queue_size`는 선택한 단위로 계산한다. `bytes`는 가장 비용이 큰 방식이다. [exporterhelper v0.159 README](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/v0.159.0/exporter/exporterhelper/README.md)

Persistent queue 구현은 활성 sizer와 별개로 `ItemsSize`와 `BytesSize`를 모두 metadata에 저장한다. 따라서 같은 v0.159.0 바이너리에서 `requests → bytes`로 바꿔도 기존 큐 엔트리의 wire format을 바꾸지 않으며, 기존 metadata의 `BytesSize`를 사용할 수 있다. [persistent_queue.go](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/v0.159.0/exporter/exporterhelper/internal/queue/persistent_queue.go)

하지만 다음 한계가 있다.

- `bytes`는 `Request.BytesSize()` 기준의 논리적 serialized pdata 크기다. bbolt 파일의 실제 점유량이 아니다.
- metrics, traces, logs는 신호별 storage client를 사용한다. 같은 exporter 설정의 `queue_size: 2 GiB`는 제품 전체 합계가 아니라 **신호별 상한**이 될 수 있다. 소스도 storage client key에 `signal.String()`을 포함한다. 따라서 이 템플릿은 최대 약 6 GiB의 논리 큐를 만들 수 있다.
- bbolt overhead, 이미 할당됐지만 비어 있는 page, compaction 임시 파일은 이 수치 밖이다.
- `compaction.on_start`가 같은 디스크에서 새 DB를 만드는 동안 추가 여유 공간이 필요하므로 “상한 × 1.2”는 안전 근거가 없다.
- file storage의 실제 파일 상한은 별도 `file_storage.max_size`다. [file_storage v0.159 README](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/extension/storage/filestorage/README.md)

따라서 2 GiB 적정성은 **확인 불가**다. 확인 방법은 고객 규모별 실제 `otelcol_exporter_enqueue_size_bytes` 또는 수신량을 측정하고 다음으로 정해야 한다.

```text
신호별 평균 ingest bytes/s × 보장할 장애 시간 × 안전계수
```

그리고 세 신호의 합, bbolt overhead, compaction 임시 공간까지 포함한 디스크 예산을 별도로 검증해야 한다.

기존 큐 호환 시험은 반드시 비어 있지 않은 큐로 수행해야 한다. `requests` 설정에서 backlog 생성 → Collector 정상 종료 → `bytes` 설정으로 재기동 → 수신 건수·영수증 hash 대조가 필요하다. `otelcol validate`만으로는 호환성을 증명하지 못한다.

### 3. `max_elapsed_time: 1h`와 `0`; 독 배치 가드로 유한값이 맞는가?

**유한값 선택은 맞다. 그러나 1시간의 근거는 없다.**

공식 계약상 `max_elapsed_time`은 한 batch를 보내려고 소비한 최대 시간이고, `0`이면 영구 재시도한다. [exporterhelper v0.159 README](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/v0.159.0/exporter/exporterhelper/README.md)

현재 `ApmOtlpController`가 적재 예외를 모두 503으로 접기 때문에 결정적 DB 제약 오류도 Collector 관점에서는 retryable이다. `0`이면 이런 요청 10개가 기본 소비자 10개를 영구 점유하여 전체 큐를 멈출 수 있다. 따라서 유한값이 필요하다.

다만 30분을 1시간으로 늘리면:

- 장기 BE 장애에서 in-flight batch 폐기 속도는 줄지만,
- 독 배치가 소비자를 점유하는 시간은 두 배가 되고,
- 일반적인 수십 초 재기동 회복에는 차이가 없다.

따라서 1시간은 실측 없이 확정하면 안 된다. 더 좋은 근본 가드는 BE에서 다음을 구분하는 것이다.

- transient DB/network 장애: 503
- 재시도해도 성공할 수 없는 payload/schema/제약 오류: 400 또는 413 등 permanent 상태
- 예상하지 못한 오류: 현재 계약상 503을 유지하되 서버에서 원인·hash를 관측

Exporter 자체에 범용 DLQ나 “이 503은 permanent” 판별기는 없다. 1시간은 이 분류를 보완하는 최후의 폐기 한도로 정의해야 한다.

### 4. `bootAt` 유예의 구멍과 실제 앱 장애를 놓치는 최대 시간

**현재 설명의 “최대 임계 1배”는 틀렸다. 실제 최대는 대략 임계값 + 평가 주기다.**

예를 들어 임계 5분, 첫 평가가 boot 후 정확히 5분이라면 `<= threshold` 때문에 첫 평가가 `empty`가 된다. 다음 평가는 약 10분 시점이므로 실제 죽은 앱을 약 10분 뒤에 발견할 수 있다. `SchedulerManager`는 fixed delay이고 초기 지연도 period다. 근거: `SchedulerManager.java:217-219`.

추가 구멍은 다음과 같다.

- `ApplicationReadyEvent`는 웹 서버가 요청을 받을 수 있게 된 뒤 발생할 수 있다. Ready 이전에 재전송을 받은 서비스도 `lastSeenAt < bootAt`로 분류되어 “기동 후 아직 못 받은 서비스”로 잘못 간주될 수 있다.
- `lastSeenAt == bootAt` 경계, DB timestamp 정밀도 차이, 시스템 시각 보정에 민감하다.
- 기동 전 이미 열린 STALE 이벤트는 유예 중 `empty` 때문에 유지된다. 설계 의도라면 문서화해야 한다.
- 기동 후 한 번 수신한 뒤 실제로 죽은 서비스는 `lastSeenAt >= bootAt`라 정상 경로로 평가된다. 이 부분은 맞다.

`bootAt`은 `ApplicationReadyEvent`보다 `ApplicationContext.getStartupDate()` 또는 그와 동등한 context 시작 시각을 `Instant`로 고정하는 편이 안전하다. 테스트에는 평가 주기 경계와 Ready 이전 수신 케이스를 추가해야 한다.

F7의 “`seenAt`이 BE 수신 시각” 자체는 첨부된 `ApmRegistryWriter.java:140-165`만으로는 확인되지 않는다. 이 메서드는 전달받은 시각을 쓸 뿐이다. 실제 값을 만드는 `ApmRegistrar` 호출부는 **첨부 범위 밖**이므로 별도 확인이 필요하다.

### 5. 라이브 exporter 제외가 맞나? `enqueue_failed`를 별도 kind로 나눌 필요가 있나?

**라이브 exporter 제외는 맞다. 별도 kind는 필수는 아니지만 원인 구분은 보존해야 한다.**

라이브 스트림은 의도적으로 휘발성이므로 그 큐 실패를 저장 경로의 데이터 손실 알람으로 합치면 안 된다. 기존 저장 경로 시계열도 같은 제외를 적용한다. 근거: `ApmCollectorMetricStore.java:210-230`.

SQL은 다음 두 조건을 지켜야 한다.

```sql
and (
  metric like 'otelcol_exporter_send_failed%'
  or metric like 'otelcol_exporter_enqueue_failed%'
)
and coalesce(dims->>'exporter', '') not in (
  'otlphttp/moveseye-live',
  'otlp_http/moveseye-live'
)
```

괄호가 없으면 `AND`/`OR` 우선순위 때문에 시간·service 조건을 우회할 수 있고, `coalesce`가 없으면 exporter dimension이 없는 행은 SQL의 `NULL NOT IN (...)` 때문에 누락된다.

`COLLECTOR_FAILURE`를 유지하는 것은 고객 규칙 호환 관점에서 가능하다. 다만 `send_failed`와 `enqueue_failed`는 대응 방법이 다르므로 이벤트 상세·로그·화면에는 원인을 분리해서 남겨야 한다.

- `send_failed`: 목적지/통신/BE 오류
- `enqueue_failed`: 큐 용량 또는 storage I/O 문제이며 보통 이미 유실

서로 다른 severity와 runbook이 필요해지면 그때 별도 kind로 나누는 것이 맞다.

또한 F9의 “화면 DTO에 이미 있다”는 표현은 과장됐다. 첨부된 `ApmCollectorMetricStore.liveMetrics()`는 라이브 exporter만 조회하고 `enqueue_failed_spans`만 해석한다. 저장 exporter의 metrics/logs/spans enqueue 실패가 일반 수집기 화면에 보인다는 근거는 첨부에 없다. 근거: `ApmCollectorMetricStore.java:65-115`. 이 부분은 구현 범위에 포함해야 한다.

### 6. ingest 분리·Kafka를 하지 않는 판단에 반대 근거가 있는가?

**현재 설치형 단일 인스턴스 전제에서는 판단에 동의한다.**

Collector persistent queue가 짧은 BE 재기동과 일시 장애를 흡수하므로, 이 문제 하나를 이유로 Kafka를 넣는 것은 설치·운영 비용이 더 크다. 프로세스 분리 역시 ingest가 화면 응답이나 DB를 실제로 방해한다는 측정 없이 선행할 이유가 없다.

다만 Collector queue는 다음을 해결하지 않는다.

- BE 회복 후 replay burst가 DB를 포화시키는 문제
- Collector 호스트·디스크 자체 장애
- BE와 DB를 함께 정지하는 장기 점검
- 로컬 persistent queue의 손상
- 여러 고객 또는 여러 BE 인스턴스 간 durable 분배

이것들은 현재 구조의 한계로 명시해야 한다.

**전제가 바뀌면** 다음 조건에서 재검토한다.

- 다중 BE 인스턴스 또는 SaaS
- 노드 장애까지 견디는 복제 durability
- ingest와 조회의 독립 SLO
- 수시간~수일 보관 및 replay
- ingest p95가 조회·알림 DB 작업을 실제로 악화시키는 실측

### 7. 재기동 후 replay burst와 BE 429/동시 상한

**BE 429 또는 endpoint 동시 상한 존재 여부는 첨부 범위 밖이라 확인 불가다.**

확인할 파일·설정은 다음과 같다.

- `SecurityConfig`, rate-limit/filter/interceptor
- OTLP endpoint 전용 semaphore/bulkhead
- nginx/Apache reverse proxy rate limit
- `server.tomcat.threads.*`
- Hikari maximum pool size
- ingest transaction과 DB connection 점유 시간

첨부된 컨트롤러는 429가 retryable이라는 계약만 설명하며, 실제로 429를 생성하는 코드는 보이지 않는다. 현재 템플릿은 `num_consumers`를 생략하여 기본 10이고, batch processor는 요청당 최대 1,024 items다. 근거: `collector-template.yaml:91,99-100`.

따라서 replay 폭주는 이번 범위에 넣어야 한다. 반드시 BE에 새 429 장치를 만든다는 뜻은 아니며, 최소한 다음 중 하나는 필요하다.

- `sending_queue.num_consumers`를 명시적으로 낮추고 실측으로 확정
- 별도 설치 옵션으로 노출
- OTLP endpoint 동시 요청 상한을 두고 초과 시 429/503
- DB pool 및 ingest transaction 처리량에 맞춘 recovery 부하 시험

V2의 “5분 안에 큐 소진”은 현재 아무 처리량 근거가 없어 합격 기준으로 사용할 수 없다. 정상 유입을 계속 받으면서도 backlog가 감소하는지와 조회 API p95·DB pool wait·lock·CPU를 함께 측정해야 한다.

## §2 절별 결함

### §2.1 Graceful shutdown

- 🔴 **Boot 3.3 phase 설명이 틀렸다.** `WebServerGracefulShutdownLifecycle`은 `Integer.MAX_VALUE`가 아니라 `DEFAULT_PHASE - 1024`다. 결론은 유지되지만 설계 근거를 정정해야 한다. 근거: `application.yml:4-5`, [Boot 3.3.5 소스](https://raw.githubusercontent.com/spring-projects/spring-boot/v3.3.5/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/web/context/WebServerGracefulShutdownLifecycle.java).

- 🟡 **종료 이벤트와 신규 SSE 등록의 경쟁 조건이 빠졌다.** 기존 emitter만 닫고 `subscribe()`를 차단하지 않으면 이벤트 발행 직후 새 SSE가 생길 수 있다. 세 클래스 모두 `closing` 상태를 등록 경로에서도 검사해야 한다. 근거: `EventStreamHub.java:79-105`, `ApmLiveStreamController.java:100-153`, `LiveSpanStreamService.java:90-110,595-607`.

- 🔴 **스케줄러가 “종전과 같이 중단”된다는 설명이 불충분하다.** Boot 기본값은 `spring.task.scheduling.shutdown.await-termination=false`이므로 진행 중 작업을 기다리지 않고 interrupt할 수 있다. `ScheduledFuture.cancel(false)`는 설정 변경 시의 취소 정책일 뿐 context 종료 정책을 보장하지 않는다. 근거: `SchedulerManager.java:130-190`; [Boot 3.3 application properties](https://docs.spring.io/spring-boot/3.3/appendix/application-properties/).

- 🟡 **20초는 전체 종료 상한이 아니라 phase별 상한이다.** 다른 `SmartLifecycle` phase와 executor 종료가 추가 시간을 쓸 수 있다. 운영 문서에 서비스 매니저의 실제 stop timeout보다 작게 맞추는 조건도 필요하다.

- 🟡 **검증 기대가 과도하게 단순하다.** SSE만 열려 있을 때 2초 미만은 적절하지만, 큰 OTLP 요청이 진행 중이면 요청 완료까지 기다리는 것이 정상이다. 테스트를 “SSE만 존재”와 “OTLP 진행 중”으로 분리해야 한다.

### §2.2 큐 넘침 알림

- 🔴 **F9의 화면 노출 근거가 사실과 맞지 않는다.** 첨부된 `liveMetrics()`는 라이브 exporter 행만 조회하고 `enqueue_failed_spans`만 해석한다. 저장 exporter의 세 신호 enqueue 실패가 화면에 이미 표시된다는 근거가 아니다. 근거: `ApmCollectorMetricStore.java:65-115`.

- 🔴 **SQL의 괄호와 `coalesce`가 설계에 명시되지 않았다.** 단순히 `A OR B`를 붙이거나 `dims->>'exporter' not in (...)`를 쓰면 잘못 집계하거나 dimension null 행을 잃을 수 있다. 근거: 기존 안전한 패턴 `ApmCollectorMetricStore.java:210-230`.

- 🟡 **자기 메트릭도 같은 exporter queue를 탄다.** 큐가 찬 동안 `enqueue_failed`를 보고할 self metric 자체도 enqueue에 실패할 수 있다. 회복 뒤 누적 counter가 전송되면 잡힐 수 있지만, 그 전에 Collector가 재기동되어 counter가 reset되면 증거가 사라질 수 있다. Collector 로컬 로그와 counter-reset 처리까지 검증해야 한다. 근거: `collector-template.yaml`의 `metrics/self` pipeline.

- 🟡 **서로 다른 실패 원인을 한 숫자로만 합치면 진단성이 떨어진다.** kind를 유지하더라도 `sendFailed`와 `enqueueFailed` breakdown을 이벤트 상세와 UI에 남겨야 한다.

### §2.3 기동 직후 STALE 유예

- 🔴 **`ApplicationReadyEvent`를 boot 경계로 삼는 것은 늦다.** Ready 이전에 서버가 이미 replay를 받으면 그 수신도 `lastSeenAt < bootAt`로 분류된다. context startup 시각 또는 더 이른 고정 시각을 사용해야 한다.

- 🔴 **실제 장애 감지 지연이 “임계 1배”라는 설명은 틀렸다.** `<= threshold`와 fixed-delay 평가를 합치면 최대 지연은 대략 `threshold + 평가 주기`다. 근거: `SchedulerManager.java:217-219`, `ApmAlertEvaluator.java:163-170`.

- 🟡 **기존 열린 STALE 이벤트의 동작을 명시해야 한다.** `Optional.empty()`는 push와 판정을 모두 건너뛰므로 기존 STALE 이벤트는 유예 중 유지된다. 근거: `ApmAlertEvaluationService.java:245-300`.

- 🟡 **시각 타입과 정밀도 정책이 빠졌다.** `Clock` 주입뿐 아니라 `Instant`/zone 변환, DB `LocalDateTime` 정밀도, 시계 역행을 어떻게 처리할지 정해야 한다.

- 🟢 **`lastSeenAt >= bootAt`인 서비스가 다시 죽으면 정상 STALE 경로를 타는 것은 적절하다.**

### §2.4 큐 상한·옵션

- 🔴 **`queue_size bytes = 디스크 상한`이 아니다.** 이는 pdata 논리 크기이며 bbolt 실제 파일 크기와 일치하지 않는다. 실제 hard cap은 `file_storage.max_size`지만 이것도 DB 파일별 설정이다. 근거: [queue sizer 소스](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/v0.159.0/exporter/exporterhelper/internal/request/sizer.go), [file_storage 문서](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/extension/storage/filestorage/README.md).

- 🔴 **2 GiB가 제품 전체가 아니라 신호별로 적용될 수 있다.** persistent storage client는 exporter와 signal 조합으로 나뉜다. metrics/traces/logs 각각 2 GiB면 논리 합계가 약 6 GiB다. 설계의 필드명과 디스크 안내는 이 사실을 반영하지 않는다. 근거: [persistent_queue.go `GetClient(... signal.String())`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/v0.159.0/exporter/exporterhelper/internal/queue/persistent_queue.go).

- 🔴 **“상한 × 1.2” 여유 공간은 compaction에 부족할 수 있다.** `on_start` compaction은 임시 DB를 만들 수 있으므로 최소한 기존 DB와 새 DB가 겹치는 최악 조건을 실측해야 한다. 현재 1.2에는 근거가 없다. 근거: `collector-template.yaml`의 `compaction.on_start`; `file_storage` 공식 문서.

- 🔴 **기본값부터 Java `int` overflow 위험이 있다.** `2048 * 1_048_576`은 2,147,483,648로 `Integer.MAX_VALUE`를 1 초과한다. 생성기는 반드시 `long`으로 승격한 뒤 곱하고 `queue_size` 문자열도 64-bit로 만들어야 한다. 최대 65,536 MiB는 더 명백히 `int` 범위를 넘는다. 근거: `ApmCollectorConfigGenerator.java:70-160`.

- 🔴 **기존 큐를 “비우기”로 처리하는 대안은 데이터 손실 절차다.** 비호환일 경우에는 큐를 먼저 drain하고 백업·롤백 절차를 제공해야 한다. 이번 0.159 동일 버전에서는 소스상 호환되지만, 비어 있지 않은 큐 통합시험을 게이트로 둬야 한다.

- 🟡 **2 GiB 기본값 선정 근거가 없다.** 현재 수집률, 평균 batch byte, 목표 장애 시간을 이용한 산정이 필요하다. F2의 “10분대 소진” 역시 고객 트래픽률 없이 확인할 수 없다. 근거: `collector-template.yaml:91,99-100`.

- 🟡 **`max_elapsed_time: 1h`는 정책 근거가 없다.** finite 선택은 맞지만 30분 대비 이득과 독 배치 점유 비용을 실측해야 한다.

- 🔴 **queue metric의 단위 변경 영향이 빠졌다.** `sizer: bytes` 이후 `otelcol_exporter_queue_size`는 더 이상 “배치 개수”가 아니다. BE record 주석, API 단위, FE 차트와 tooltip을 전부 bytes/MiB 기준으로 바꿔야 한다. 현재는 “개”로 정의되어 있다. 근거: `ApmCollectorMetricStore.java:180-210`, `apmCollectorDisplay.ts:235-250`.

- 🟡 **설정 옵션 호환 시험이 부족하다.** 새 FE→구 BE에서 unknown JSON field를 무시하는지, 구 FE→새 BE에서 기본값을 쓰는지 양방향 contract test가 필요하다. `types/apm.ts:1000-1110`, `ApmCollectorConfigOptionsDto.java` 전문.

- 🟡 **413 영구 손실 경계가 그대로다.** 기존 상위 설계는 batch에 바이트 상한이 없고 413은 분할 재전송되지 않는다고 명시한다. 큐만 크게 만들어도 큰 JSON batch 손실은 해결되지 않는다. 근거: `devdesign_apm.md:175-210`, `ApmOtlpController.java:60-82`.

## §3 놓친 것

1. **회복 시 replay 폭주 보호**

   `num_consumers=10`과 batch 최대 1,024 items가 BE·DB에 동시에 들어온다. 정상 유입을 받는 중 backlog까지 처리하므로 DB pool 대기, UPSERT 경합, 파티션 생성, 영수증 INSERT, 서비스 등록이 한꺼번에 증가할 수 있다. `ApmOtlpController.java:245-300`에 적힌 부작용을 모두 부하 지표로 측정해야 한다.

   합격 기준에는 다음이 필요하다.

   - ingest throughput 및 queue drain rate
   - 정상 조회 API p95/p99
   - Hikari active/pending connection
   - DB CPU·lock wait·WAL/IO
   - 503/429/413 수
   - queue가 줄어드는 동안 새 `enqueue_failed`가 발생하지 않음

2. **Spring graceful shutdown과 SSE/async 경쟁 조건**

   `ContextClosedEvent`에서 기존 emitter를 닫는 것만으로는 부족하다. 종료 플래그 이후 신규 구독을 차단해야 한다. `LiveSpanStreamService`는 별도 writer·snapshot worker·deadline executor를 갖고 있으므로 emitter 종료뿐 아니라 새 write/snapshot 작업 제출도 막아야 한다. 근거: `LiveSpanStreamService.java:90-110,430-470,595-607`.

3. **종료 중 스케줄러 배치의 원자성**

   현재 기본 scheduler shutdown은 실행 작업을 기다리지 않는다. `@Transactional evaluateAll()`은 interrupt 시 rollback될 가능성이 있지만, Zabbix provisioning/push·cleanup 같은 외부 부작용은 DB rollback으로 되돌릴 수 없다. 근거: `ApmAlertEvaluationService.java:200-330`, `SchedulerManager.java:130-190`.

   배치별로 다음을 분류해야 한다.

   - 반드시 완료시킬 job
   - 중단 후 다음 실행에서 idempotent하게 재시도할 job
   - 외부 호출 후 DB 기록 전 중단될 때 reconciliation이 필요한 job

   전역 `await-termination=true`를 무작정 켜기보다, 최대 실행 시간과 서비스 stop timeout을 정한 뒤 적용해야 한다.

4. **설치형 고객 업그레이드 경로**

   “릴리스 노트를 보고 설정 재생성”만으로는 기존 고객에게 변경이 적용된다는 보장이 없다. 다음이 필요하다.

   - 현재 설정 template/version 표시
   - 구 설정 감지 및 “재생성 필요” 배너
   - 토큰·고객별 수정 보존 방법
   - Collector backlog가 0인지 확인한 뒤 재시작
   - 비어 있지 않으면 drain 또는 백업 후 진행
   - 실패 시 이전 yaml과 queue directory로 rollback
   - 새 BE/구 FE 및 구 BE/새 FE 양방향 호환 검증

   특히 persistent queue를 가진 Collector 자체를 재시작할 때의 queue 보존을 별도 시험해야 한다. Upstream에는 목적지가 장애 중인 상태에서 clean shutdown 시 dispatch 중인 persistent queue item이 삭제될 수 있다는 보고가 있으며, v0.159 설계에서는 이를 무시하면 안 된다. [upstream issue #15677](https://github.com/open-telemetry/opentelemetry-collector/issues/15677)

5. **큐 용량을 줄이는 downgrade**

   기존 backlog의 논리 byte 크기가 새 `queue_size`보다 큰 상태에서 시작할 때의 동작과, 이후 신규 enqueue 거절을 검증해야 한다. 단순 config validation은 이 상태를 검사하지 않는다.

6. **Collector 자체 장애와 counter reset**

   `enqueue_failed`는 Collector 프로세스 메모리의 누적 counter다. 넘침 뒤 Collector까지 재기동하면 사후 알림 근거가 reset될 수 있다. counter reset을 증가량 계산에서 구분하고, 로컬 Collector 로그를 운영 증거로 보존해야 한다.

7. **큐 상태 화면 계약**

   `queueSize`만 있으면 byte 사용량과 capacity 비율을 계산하기 어렵다. `queue_capacity`, `queue_size`, sizer 단위를 함께 내려 `% 사용`으로 보여 주는 편이 설치 운영에 유리하다. 신호별 큐라면 합계와 신호별 값을 구분해야 한다.

8. **영수증의 원자성**

   첨부는 “성공 뒤 영수증 기록” 순서를 설명하지만, 실제 telemetry 적재 commit과 영수증 INSERT가 같은 transaction에서 원자적으로 커밋되는지는 **첨부 범위 밖이라 확인 불가**다. 확인 방법은 적재 commit 직후·영수증 insert 직전 장애를 주입해 replay가 중복 집계를 만드는지 검사하는 것이다.

9. **운영 중 디스크 회수**

   `compaction.on_start`만 사용하면 장기 실행 중 backlog가 소진된 뒤에도 bbolt 파일의 할당 크기가 유지될 수 있다. `on_rebound` 도입 여부 또는 정기 유지보수 재시작 정책을 검토해야 한다.

10. **서비스 관리자 timeout**

    systemd/Windows Service/Docker의 stop timeout이 Spring의 phase timeout보다 짧으면 강제 종료된다. 설치형 번들의 서비스 정의와 `20s` 설정을 함께 맞춰야 한다. 이 파일은 **첨부 범위 밖**이다.

## §4 판정

**필수 정정 8건 반영 후 착수 가능**

핵심 방향인 “설치형 단일 인스턴스에서 별도 Kafka·ingest 프로세스를 추가하지 않고 Collector persistent queue와 BE graceful shutdown을 보강한다”는 타당하다. 재설계까지는 필요하지 않다.

착수 전 필수 정정은 다음 8건이다.

1. Boot 3.3 종료 phase 근거 정정, SSE 종료 플래그와 신규 구독 차단 추가
2. scheduler 종료·interrupt·외부 부작용 정책 확정
3. replay burst의 Collector 동시성 또는 BE admission control과 부하 합격 기준 추가
4. `bytes`를 실제 디스크 상한으로 보지 않도록 수정하고 신호별 총량·compaction 공간 산정
5. MiB→bytes를 `long`으로 계산하고 queue metric/API/FE 단위 변경
6. 기존 고객의 비어 있지 않은 큐 업그레이드·rollback 절차 마련; “큐 비우기” 삭제
7. `enqueue_failed` SQL의 괄호·`coalesce`, 저장 exporter 3신호 노출, self metric reset 한계 보완
8. `bootAt`을 Ready 이전 시각으로 옮기고 실제 감지 지연을 `threshold + 평가 주기`로 정정

이 정정 없이 v0 그대로 착수하면 디스크 요구량을 최대 수배 과소 안내하고, 기본 2 GiB부터 정수 overflow가 발생할 수 있으며, 회복 직후 DB 포화와 설치 고객 업그레이드 중 큐 손실을 검증하지 못한다.
