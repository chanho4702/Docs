**ABA 결함 1건과 초기화 예외 차단 결함 1건을 확인했습니다.** 배열 점유 상한과 메모리 가시성에는 결함이 없습니다. 성능 개선 신호는 뚜렷하지만, 기존 PoC의 집계 지연을 “잡음이었다”고 결론 내릴 근거는 부족합니다.

파일은 수정하지 않았습니다. 소스·기존 벤치 결과를 검토했으며 Java 테스트와 성능 측정은 재실행하지 않았습니다.

**🔴 반드시 고침**

**1. 같은 `startNanos`로 칸이 재사용되면 이전 토큰이 새 요청을 지웁니다.**

근거: [ActiveRequestTracker.java:95](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:95), [종료 CAS:110](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:110).

다음은 소스상 결정적인 반례입니다.

```java
var tracker = new ActiveRequestTracker(1, ignored -> {});
var a = tracker.tryStart(1000L);
tracker.end(a);                         // true
var b = tracker.tryStart(1000L);
tracker.end(a);                         // true: 잘못된 성공, b를 지움
tracker.end(b);                         // false: 실제 b의 종료는 불일치
```

같은 시각이 실제로 나올 수 있습니다. `nanoTime()`은 고유 번호가 아니며, 나노초 단위 해상도도 보장하지 않습니다. 두 스레드가 같은 값을 받은 뒤 B가 등록 직전에 지연되면, A가 종료된 칸을 B가 같은 값으로 재사용할 수 있습니다. **요청 전체가 한 clock tick 안에 끝나야 하는 조건은 아닙니다.** [Java 17 명세](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime())

이후 A의 중복 종료가 오면 B가 사라져 `active`가 과소 집계됩니다. 상세 카운터를 켰다면 A의 종료를 다시 성공으로 세고, B의 실제 종료는 `unmatchedEnds`가 됩니다. 이 손실은 `droppedStarts`에도 잡히지 않습니다.

종료·만료 경합도 **값이 재사용되지 않는 동안만** CAS 승자가 하나입니다. 만료된 A와 같은 시각을 가진 B의 등록이 늦게 도착하면 A의 늦은 종료가 B를 지우는 동일 문제가 생깁니다. 기본 TTL 10분에서는 이 시나리오의 현실성이 낮지만, 중복 종료 반례는 긴 TTL과 무관합니다.

[기존 재사용 테스트:91](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/ActiveRequestTrackerTest.java:91)는 `1000 → 30000`만 확인하므로 검출하지 못합니다. **시각과 소유권 식별자를 분리해야 합니다.** 전역 카운터가 필수인 것은 아니지만, 시간값만으로 ABA 안전성을 주장할 수는 없습니다.

**2. 초기화 실패를 잡는 `catch`에서 실패한 singleton을 다시 호출합니다.**

근거: [PocState.java:20](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:20), [생성자:52](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:52), [MovesEyeInstrumenterCustomizerProvider.java:21](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/MovesEyeInstrumenterCustomizerProvider.java:21).

실패 시나리오:

- 과대한 `max-active` 때문에 배열 할당이 실패하거나, 잘못된 output 경로로 `PocState` 초기화가 실패합니다.
- 바깥 `catch`가 이를 잡습니다.
- 그 안의 `PocState.get().listenerFailed()`가 초기화 실패 상태의 클래스를 다시 사용하면서 `NoClassDefFoundError`를 밖으로 던집니다.

OTel의 더 바깥 방어가 고객 앱까지 보호할지는 별개입니다. **확장 자체의 “예외를 밖으로 내보내지 않는다”는 계약은 깨집니다.** 기존 방어 코드의 문제지만, 이번 선할당 배열 전환으로 초기 메모리 할당 실패와 직접 연결됩니다.

**🟠 고치는 게 좋음**

**3. 포화 백오프는 전체 스캔을 “1ms에 한 번”으로 제한하지 않습니다.**

근거: [ActiveRequestTracker.java:77](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:77), [설명:23](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:23).

여러 스레드가 만료된 deadline을 동시에 읽으면 모두 전체 스캔에 들어갑니다. 끝난 스레드들이 각각 deadline을 쓰므로, 포화 시 **여러 전체 스캔이 한꺼번에 발생**할 수 있습니다.

늦게 저장된 오래된 deadline이 최신 값을 덮으면 백오프가 짧아질 수도 있고, 늦게 끝난 스캔이 새 deadline을 쓰면 최초 포화 확인으로부터 창이 연장될 수도 있습니다. 데이터 손상은 아니지만 엄격한 실행 빈도 제한도 아닙니다.

현재의 상한 32 벤치는 `probe == limit`로 반환하므로 **백오프 경로를 전혀 검증하지 않습니다.** 1만 칸 포화에서 다중 스레드의 전체 스캔 횟수와 지연 꼬리를 측정해야 합니다. 단일 스캔 보장이 요구사항이 아니라면 구현 변경보다 설명 정정이 먼저입니다.

**4. 벤치의 일부 수치가 서로 다른 통계를 같은 표제 아래 보여 줍니다.**

근거: [TrackerContentionBenchTest.java:71](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:71), [집계 측정:101](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:101), [포화 측정:141](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:141).

| 수치 | 실제 의미와 오해 위험 |
|---|---|
| 스레드별 ns | 모든 worker가 끝날 때까지의 시간 ÷ 스레드당 반복 수입니다. 개별 호출 지연의 평균이나 p99가 아닙니다. |
| 상한 32 포화 | 실패한 시작도 분모에 포함하고 종료는 성공한 시작에만 실행합니다. 성공·포기 건수를 기록하지 않아 동일한 작업량 비교인지 알 수 없습니다. 이 구간은 매번 map부터 실행합니다. |
| 가득 찬 배열 300ns | 2,000회 중 최솟값입니다. 백오프 중 64칸만 보고 포기한 빠른 경로를 반영하며, 전체 스캔 비용을 뜻하지 않습니다. |
| 집계 11.9~16.9µs | 정지된 점유 상태에서 연속 200회 중 최솟값입니다. 6판 중앙값이나 실제 1초 주기 집계의 대표 지연이 아닙니다. |

또한 [snapshot wrapper:48](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:48)는 결과를 소비하지 않습니다. 실제로 제거됐다고 단정할 수는 없지만 JIT가 결과 객체나 계산 일부를 제거할 여지가 있습니다. 반환값을 소비하는 측정이 필요합니다.

**5. CAS 성공 후 토큰 할당 실패 시 칸을 회수하지 않습니다.**

근거: [ActiveRequestTracker.java:95](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:95), [리스너 예외 처리:33](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestOperationMetrics.java:33).

칸을 채운 직후 `new Token(...)`이 `OutOfMemoryError`로 실패하면 종료할 토큰 없이 점유만 남습니다. 기본 설정에서는 TTL 집계로 회수되지만, TTL 또는 주기 집계가 꺼져 있으면 계속 남습니다. 리스너의 `context.with(...)` 실패에도 유사한 회수 공백이 있습니다.

상한 초과는 아니지만 사용 가능한 용량을 잃습니다. 배열화가 모든 종류의 영구 용량 손실을 없앤다는 설명은 과합니다.

**🟡 참고 — 결함이 없는 부분과 해석 범위**

- **상한:** [빈 칸 CAS:95](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:95)로만 삽입하므로 배열의 점유 칸 수는 동시 삽입에서도 `limit`를 넘지 않습니다. 이 부분에는 결함이 없습니다. ABA에 따른 추적 손실은 별개의 문제입니다.

- **초기값·overflow:** [생성 시각 초기화:49](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:49)와 `now - fullUntilNanos < 0`은 적절합니다. 음수 `nanoTime`을 처리하며, 시간 차가 `2^63`ns 미만이라는 통상적인 전제에서 signed overflow 경계도 처리합니다.

- **빈 칸이 있는데 포기:** [리스너:24](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestOperationMetrics.java:24)에서 `null`을 항상 `droppedStarts`로 셉니다. `detailed-counters=false`여도 유지됩니다. 따라서 기록되지 않는 손실은 아닙니다. 다만 `active`는 추적된 요청 수이며, drop 누계를 더해 실제 진행 건수로 복원할 수 없습니다. 전체 스캔 실패 또한 “어느 한 시점에 모든 칸이 찼다”는 증명은 아닙니다.

- **메모리 모델:** [get:128](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:128)과 CAS만으로 저장된 `long`의 원자성·가시성은 충분합니다. 추가 fence가 필요한 결함은 없습니다. 다만 전체 snapshot은 한 시점의 원자적 사진이 아니며, 코드도 이를 명시합니다. [AtomicLongArray 명세](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/atomic/AtomicLongArray.html)

- **false sharing:** [무작위 시작 위치:71](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:71)는 확률을 낮출 뿐 인접 칸의 캐시 라인 공유를 없애지 않습니다. 특히 높은 점유율에서 선형 탐색이 같은 빈 영역으로 몰리는 경우와 집계 스레드의 동시 읽기는 현재 벤치가 충분히 대표하지 않습니다. 확인된 성능 결함은 아니며, 지금 padding을 넣어야 한다는 근거도 없습니다.

- **고객 JVM 자원:** [배열 생성:56](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:56)의 `limit × 8B`는 배열 payload입니다. 객체 헤더, 요청별 Token·Context 할당까지 포함한 전체 메모리가 아닙니다. [설정 파서:235](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:235)에 최대 허용치가 없어 오설정 시 큰 선할당이 가능합니다. 요청 경로에는 명시적 lock·대기·I/O나 무한 재시도가 없지만 최대 `limit`칸 스캔 비용은 있습니다. 별도로 [shutdown:163](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:163)은 output 설정 시 동기 파일 쓰기를 하므로 느린 파일시스템이 종료를 지연시킬 수 있습니다.

**성능 결론은 다음 범위까지 타당합니다.**

비포화 조건에서 교차 실행한 6판의 개선 폭은 크고, 기존 결과의 최소~최대 범위도 두 구현 사이에 겹치지 않습니다. 따라서 **“이 호스트의 타이트 루프에서 배열 구현의 시작·종료 처리 성능이 개선됐다”는 결론은 충분히 뒷받침됩니다.**

다만 개선 전체를 경합 감소만의 효과로 분리할 수는 없습니다. 전역 atomic 제거 외에도 map 작업과 할당량이 함께 바뀌었습니다. 스레드가 코어보다 많은 조건에서는 스케줄링 대기가 섞이며, 공통 `nanoTime()` 비용, 실제 Context로 탈출하지 않는 토큰, 한 JVM 안의 JIT·GC 이력도 영향을 줍니다. 워밍업 1판과 순서 교차는 유용하지만 독립 JVM 반복과 안정화 확인을 대신하지는 않습니다.

**기존 “1초 집계 비용이 크다”는 관측을 잡음이었다고 말하면 안 됩니다.** [PoC 보고서:84](../08-%EA%B2%80%EC%A6%9D-QA/P5.3b-OpenTelemetry-%ED%99%95%EC%9E%A5-PoC-%EC%B8%A1%EC%A0%95-%EB%B3%B4%EA%B3%A0%EC%84%9C.md)도 이미 인과 비용을 확정할 수 없다고 명시합니다. 이번 측정은 구현이 다르고, 동시 변경 없는 연속 집계의 최솟값입니다. 특히 기존 [P2 스크립트:76](/C:/solutions/moveseye-otel-extension/scripts/run-p2.ps1:76)는 이미 `write-every-snapshot=false`였으므로 과거 차이를 매초 파일 I/O 탓으로 설명할 수도 없습니다.

말할 수 있는 것은 **“이번 결과에서는 집계 순회 자체가 수십~수백 ms를 필연적으로 소비한다는 증거가 없으며, 과거 큰 지연의 원인은 여전히 미확정”**까지입니다.

**격리 호스트 재측정 판단:** 탐색 측정은 가능하지만, **현재 구현을 검수 통과본으로 삼는 본 재측정은 보류**하는 것이 맞습니다. ABA와 초기화 예외 경계를 먼저 고친 뒤, 성공·drop 비율을 함께 기록하고 `확장 없음 / 추적만 / 추적+집계`를 교차 반복하십시오. 배열 접근 자체를 폐기할 근거는 없습니다.
