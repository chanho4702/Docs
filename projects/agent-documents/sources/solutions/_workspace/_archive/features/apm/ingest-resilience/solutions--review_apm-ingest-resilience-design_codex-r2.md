# 검수 — APM 수집 회복력 설계 v1 · 코덱스 2회차

- 일시 2026-09-23 · 모델 gpt-5.6-sol(high) · 읽기 전용 · 첨부 기반(설계 v1 + 1회차 결과 + 근거 코드) · 반영 결과는 설계서 v2 §0.1 표


## §1 R1~R8 반영 판정표

| 항목 | 판정 | 반영된 내용 | 남은 문제 |
|---|---|---|---|
| R1 Boot phase·SSE 종료 경쟁 | **부분 수용** | phase를 `MAX−1024(2147482623)`로 정정했고, `ContextClosedEvent`에서 `closing`을 먼저 세운 뒤 기존 emitter를 닫도록 했다. `LiveSpanStreamService`의 writer·snapshot 제출 차단도 범위에 넣었다. | `subscribe()`의 `closing` 사전 검사만으로는 원자성이 보장되지 않는다. `closing` 검사 직후 종료 훅이 순회하고, 그 뒤 구독자가 map에 등록되면 새 emitter가 남을 수 있다. 등록과 종료를 같은 lock으로 직렬화하거나, 등록 후 `closing` 재검사·제거가 필요하다. Boot phase와 이벤트 순서는 첨부 C에는 Spring 내부 코드가 없어 독립 대조할 수 없고, 첨부 B의 공식 소스 결론과만 일치한다. |
| R2 스케줄러 종료·외부 부작용 | **부분 수용** | `await-termination=true`, `10s`, 서비스 관리자 timeout 연동을 추가했다. | 원 지적의 핵심인 배치별 중단 안전성 확정을 후속으로 미뤘다. 첨부 C의 `evaluateAll()`은 `ensureProvisioned`·이벤트 저장·orphan sweep·Zabbix push·backfill·cleanup을 한 실행에서 섞는다. 단순히 “같은 값을 다시 밀어 자연 수렴”한다고 일반화할 수 없다. 10초 초과 시 공백 없는 실행 이력도 보장되지 않는다. |
| R3 replay 폭주 보호 | **부분 수용** | 저장 ingest 전용 Semaphore, 기본 6, 429, `num_consumers: 10` 명시 및 V2 부하 지표를 추가했다. 방향은 적절하다. | Semaphore의 정확한 보유 구간과 `finally` 해제가 정의되지 않았다. 또한 “인증 뒤·본문 읽기 전”은 현재 컨트롤러의 본문 읽기→인증 순서와 충돌한다. 429는 재시도 가능할 뿐, 30분 동안 계속 거절되면 `max_elapsed_time`에 의해 폐기될 수 있어 “데이터 손실 없음”은 틀렸다. |
| R4 bytes 해석·신호별 용량·compaction | **수용** | `sizer: bytes`를 폐기하고 `requests`를 유지했다. 신호별 상한임을 명시했고 디스크 안내를 실측식으로 전환했으며 compaction 중 두 파일 공존을 반영했다. | 20,000이라는 값과 디스크 산식의 충분성은 별도 신규 결함이다. R4의 원래 오해 자체는 해소됐다. |
| R5 int overflow·메트릭 단위 파급 | **수용** | bytes 변환을 폐기해 overflow 경로와 큐 메트릭 단위 변경을 모두 제거했다. `queueSize` 최대 500,000은 Java `int` 범위 안이다. |
| R6 기존 큐 업그레이드·rollback | **부분 수용** | “큐 비우기”를 삭제하고, 큐 0 확인 후 재생성·재시작하는 보수적 절차와 backlog 보존 V7을 넣었다. | 실패 시 이전 YAML·queue directory로 되돌리는 rollback 절차가 없다. 또한 현재 첨부된 화면 쿼리는 구간 `max(queue_size)` 집계이므로, 실제 최신 신호별 큐가 0인지 판정하는 수단이 명확하지 않다. |
| R7 `enqueue_failed` SQL·화면·reset | **수용** | SQL 괄호와 `coalesce`가 정확히 반영됐고, 저장 exporter의 `enqueueFailed` 화면 노출, `sendFailed`와의 분리, counter reset 및 로컬 로그 한계를 포함했다. | 이벤트 상세에 breakdown을 전달하려면 현재 하나의 합계 `Point`만 반환하는 evaluator 계약을 어떻게 확장할지 추가 명세가 필요하지만, R7의 필수 취지는 반영됐다. |
| R8 startup STALE 유예 | **부분 수용** | `ApplicationContext.getStartupDate()`, `Instant`, `<` 경계, 기존 열린 이벤트 유지, 시계 역행 처리와 `threshold + 평가 주기` 설명을 넣었다. | 기본 threshold와 initial delay가 모두 5분이면 첫 평가는 이미 `bootAt+5분` 이후라 `< threshold`가 거짓이다. 즉 일반적인 기본 설정에서 새 유예가 한 번도 적용되지 않을 수 있다. 또한 실제 상한에는 Ready까지의 기동 시간, fixed-delay 실행 시간과 스케줄링 지연도 포함된다. |

종합하면 **수용 3건, 부분 수용 5건, 미수용 0건**이다. 8건을 문서 표에 모두 언급한 것은 맞지만, R1·R2·R3·R6·R8은 구현에 착수하기 전에 계약을 더 닫아야 한다.

## §2 v1 신규 결함

### 2.1 🔴 SSE 종료와 구독 등록이 여전히 원자적이지 않음

제시된 구조가 다음과 같다면 경쟁 조건이 남는다.

1. `subscribe()`가 `closing == false`를 확인
2. 종료 훅이 `closing=true`로 변경하고 기존 map을 순회
3. `subscribe()`가 순회 이후 map에 emitter 등록

이 emitter는 종료 훅에 잡히지 않는다. `ConcurrentHashMap`의 weakly consistent 순회도 이를 해결하지 않는다.

다음 중 하나를 설계에 못 박아야 한다.

- 종료와 등록 전체를 같은 lock으로 직렬화
- map 등록 후 `closing`을 다시 검사하여 즉시 제거·완료
- `LiveSpanStreamService`는 `stopped` 검사, connection 등록, 종료를 모두 동일한 `synchronized` 경계에 포함

ticker·deadline 경로도 종료 플래그 이후 새 작업을 제출하지 않는다는 검증이 필요하다.

### 2.2 🔴 `await-termination=10s`만으로 배치 종료 정책이 완성되지 않음

첨부 C의 `ApmAlertEvaluationService.evaluateAll()`에는 다음 부작용이 섞여 있다.

- Zabbix provisioning
- DB 이벤트 생성·해소
- orphan sweep
- Zabbix value push
- event id backfill
- cleanup 재시도

따라서 v1의 “트리거 값 재전송은 멱등이라 자연 수렴”만으로 전체 작업의 중단 안전성을 설명할 수 없다. DB transaction이 rollback되어도 이미 실행된 Zabbix 호출은 되돌아가지 않는다.

또한 10초가 지난 작업은 여전히 중단될 수 있고, 프로세스 종료 중 `recordFailure()`까지 성공한다는 보장도 없다. “실행 이력 성공/실패 중 하나, 공백 없음”이라는 검증 기대는 성립하지 않는다.

최소한 착수 전에 다음이 필요하다.

- `ContextClosedEvent` 이후 새 배치 시작 차단
- 실행 중 job별 최대 시간과 10초 안에 끝나는지 실측
- 외부 호출 후 DB rollback 시 reconciliation 정책
- 10초 초과 시 실행 이력이 없을 수 있음을 허용할지, 별도 `ABORTED` 상태를 남길지 결정

### 2.3 🔴 20초 graceful timeout과 OTLP 완료 보장이 충돌함

v1은 다음 두 가지를 동시에 주장한다.

- graceful phase timeout은 20초
- 큰 OTLP 요청은 “요청 길이만큼 대기하여 200 응답 후 종료”

처리 시간이 20초를 넘으면 둘을 동시에 보장할 수 없다. 영수증 독립 transaction도 정상적인 종료 대기가 실제로 끝까지 유지될 때만 종료 창을 줄인다.

검증 기준은 다음처럼 바꿔야 한다.

- 수용 가능한 OTLP 최대 처리 시간 또는 p99를 실측
- `timeout-per-shutdown-phase`를 그 값보다 크게 설정
- timeout 이내 요청은 200 완료, timeout 초과 요청은 Collector 재시도로 회복되는지 검증
- 서비스 관리자 timeout은 web phase, scheduler 대기, bean 파괴 및 여유 시간을 모두 포함

### 2.4 🔴 ingest admission 429의 실행 계약이 불완전함

현재 저장 수신 계약은 본문 크기 검사·읽기·압축 해제 후 인증하는 순서다. 반면 v1은 Semaphore를 “인증 뒤·본문 읽기 전” 획득한다고 한다. 이는 기존 컨트롤러가 “순서가 곧 계약”이라고 명시한 흐름을 변경한다.

다음을 명시해야 한다.

- Content-Type·Content-Length·토큰·라이선스·Semaphore·본문 읽기의 최종 순서
- permit 보유 구간은 본문 읽기부터 parsing, ingest commit, 영수증 처리, 응답 생성까지인지
- 모든 early return과 예외에서 `finally`로 정확히 한 번 해제하는지
- 설정값 0·음수·과대값의 기동 시 검증
- 429 통계 기록이 DB 작업이라면 429 폭주 중 보호 장치를 우회하지 않는지

또한 429는 “재시도 가능”이지 “무손실”이 아니다. 같은 요청이 30분 동안 429를 받으면 현재 `max_elapsed_time: 30m` 계약상 폐기될 수 있다. `Retry-After: 2`를 Collector가 실제로 따르는지도 별도 검증해야 하며, 자체 backoff만을 전제로 잡는 편이 안전하다.

기본 6도 Hikari 기본 10에서 단순히 뺀 정책값일 뿐이다. scheduler pool 4와 조회 요청, ingest transaction의 connection 사용량을 고려해 V2 결과를 기본값 확정 게이트로 삼아야 한다.

### 2.5 🔴 requests 20,000은 아직 확정 기본값이 될 근거가 부족함

“평균 512건, 초당 2배치이면 약 2.8시간”은 트레이스 예시에 불과하다.

- metrics·traces·logs는 요청 크기와 발생률이 다르다.
- `queue_size`는 신호별이므로 최악 디스크 사용량은 세 신호의 합이다.
- 500,000 상한은 디스크 소진 위험에 비해 근거가 없다.
- `평균 배치 바이트 × queueSize × 2`에는 bbolt overhead, 여유 공간, compaction 중 신규 유입이 명시적으로 포함되지 않았다.
- `max_elapsed_time=30m` 때문에 큐가 차기 전에도 소비자별 in-flight 요청이 주기적으로 폐기될 수 있다. 따라서 “2.8시간 큐”는 “2.8시간 무손실”을 뜻하지 않는다.

V0를 작업 순서 마지막이 아니라 기본값 확정 전에 수행해야 한다. 신호별 batch rate·파일 증가율·compaction peak를 측정한 후 기본값, 최대값, 최소 free-space 경고를 확정해야 한다.

### 2.6 🔴 기존 고객 갱신의 큐 0 판정과 rollback이 닫히지 않음

첨부된 `ApmCollectorMetricStore.series()`는 시간 구간의 `max(queue_size)`를 반환하며 저장 exporter를 합산한다. 이것만으로 “지금 신호별 큐가 모두 0이고 최신 표본이다”를 보장하지 못한다.

특히 BE 장애 중 self metric도 backlog에 들어가므로 회복 직후 화면에 보이는 0이 오래된 표본일 수 있다. 안전 게이트에는 다음이 필요하다.

- 최신 표본 시각과 freshness 판정
- metrics·traces·logs 신호별 현재 queue size
- 세 신호 모두 0인 상태가 일정 시간 연속 관측됐다는 조건
- 이전 YAML 백업 및 재기동 실패 시 복원 절차
- 기존 queue directory를 삭제·변경하지 않는 rollback 규칙
- V7 실패 시 릴리스 차단

### 2.7 🔴 기본 설정에서는 STALE 유예가 실질적으로 동작하지 않을 수 있음

첨부 C에서 interval job은 `initialDelay = period`이고 기본 평가 주기는 5분이다. v1 조건은 다음과 같다.

```text
minutes(bootAt, now) < threshold
```

threshold도 5분이면 첫 평가는 통상 `bootAt+5분`보다 늦다. 따라서 첫 평가에서 조건이 이미 거짓이고, 기동 전 `lastSeenAt`을 그대로 평가한다. 부팅 시간까지 더해지므로 `<` 경계로 바꾼 것은 유예를 한 번 줄인 정도가 아니라 기본값에서 유예 전체를 없앨 수 있다.

“첫 평가 한 번을 반드시 유예”할 것인지, “실측된 replay drain 시간 동안 유예”할 것인지 정책을 다시 정해야 한다. 별도 `startupGrace`를 두거나 첫 평가 성공 시각을 기준으로 하는 방식이 더 명확하다.

실제 감지 상한도 정확히 `threshold + 5분`이 아니다. Scheduler 등록이 Ready 이후라면 다음이 추가된다.

```text
context 시작→Ready 시간
+ fixed-delay 이전 실행 시간
+ scheduler jitter
```

따라서 문구는 “대략 threshold + 평가 주기, 추가로 기동·실행 지연 가능”으로 고쳐야 한다.

### 2.8 🟡 `enqueue_failed` breakdown의 전달 계약이 부족함

현재 `collectorFailureSeries()`는 `send_failed` 합계 하나를 `Point`로 반환한다. v1은 이벤트 상세에 `sendFailed`와 `enqueueFailed`를 분리한다고 했지만, 다음이 정해지지 않았다.

- evaluator 반환 타입 확장 여부
- 별도 breakdown query 여부
- Zabbix tag/message 계약
- API DTO와 FE 필드명
- 합계와 breakdown의 시간창 일치 규칙

화면 열 추가는 구체적이지만 이벤트 상세는 구현자가 다시 설계해야 하는 수준이다.

### 2.9 🟡 직접 재확인 사실의 첨부 C 대조 결과

| 주장 | 첨부 C 대조 |
|---|---|
| Boot phase `2147482623` | Spring Boot 내부 클래스가 첨부 C에 없어 직접 확인 불가. 수치는 `Integer.MAX_VALUE−1024`와 일치하고 첨부 B의 공식 소스 결론과도 일치한다. |
| `ContextClosedEvent`가 lifecycle shutdown보다 먼저 | Spring `AbstractApplicationContext` 코드가 C에 없어 직접 확인 불가. 첨부 B의 공식 소스 결론과는 일치한다. |
| 영수증이 `REQUIRES_NEW` | **확인됨.** `ApmOtlpReceiptService.record()`에 `Propagation.REQUIRES_NEW`와 `saveAndFlush()`가 있다. 다만 첨부된 실행 코드에는 실제 ingest 호출 뒤 `record()` 호출 부분이 빠져 있어 정확한 호출 순서는 주석·설명으로만 확인된다. |
| 적재 경로에 Semaphore 없음 | **첨부 범위에서 확인됨.** `LiveBodyReader`에만 Semaphore가 있고 주석도 저장 reader는 변경하지 않는다고 한다. 저장 컨트롤러 발췌에는 admission 획득이 없다. |
| `seenAt`이 BE 수신 시각 | `Instant receivedAt = Instant.now()`는 확인된다. 이것이 `touchService(seenAt)`까지 전달되는 호출부가 첨부되지 않아 끝단 연결은 부분 확인이다. |

영수증 창에 대해서도 “graceful shutdown이 없앤다”보다 “정상 종료 중 강제 중단 가능성을 줄인다”가 정확하다. 20초 timeout 초과, JVM crash, OS 강제 종료, 영수증 자체 기록 실패에서는 중복 창이 남는다.

### 2.10 🟢 유지해도 좋은 결정

- Kafka나 별도 ingest 프로세스를 선행하지 않고 V2 실측으로 재검토하는 방향
- `sizer: requests` 유지와 큐 메트릭 단위 보존
- 30분 유한 재시도를 유지하면서 결정적 오류의 4xx 분류를 후속으로 분리한 판단
- SQL 괄호·`coalesce` 및 라이브 exporter 제외
- 기존 열린 STALE 이벤트를 유예 중 자동 해소하지 않는 정책
- 413과 영수증 원자성 한계를 범위 밖으로 명시한 점

## §3 판정

**필수 정정 7건 반영 후 착수 가능**

재설계가 필요한 수준은 아니다. Collector persistent queue, Spring graceful shutdown, ingest admission control이라는 큰 방향은 타당하다. 다만 현재 v1 그대로 구현하면 다음 문제가 남는다.

1. 종료 직후 새 SSE가 남는 경쟁 조건
2. 10초를 넘는 배치와 외부 부작용의 불완전한 종료
3. 20초 graceful timeout과 OTLP 완료 보장의 충돌
4. Semaphore의 순서·보유 구간·해제 및 429 손실 계약 미확정
5. 실측 전 20,000·500,000을 확정하여 디스크와 bounded-loss를 과소 설명
6. 최신 신호별 큐 0 확인과 rollback 없는 고객 갱신 절차
7. 기본 주기에서 실제로 적용되지 않을 수 있는 STALE 유예

이 7건을 설계 계약과 검증 게이트에 먼저 반영한 뒤 착수하는 것이 적절하다.
