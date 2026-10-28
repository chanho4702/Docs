**🔴 남은 치명 결함은 발견하지 못했습니다.** 다만 🟠 두 건이 남아 있어, 1차 지적을 모두 완전히 닫았다고 보기는 어렵습니다. 읽기 전용으로 소스·테스트와 기존 벤치 결과를 확인했으며, 테스트를 새로 실행하지는 않았습니다.

| 1차 지적 | 재검수 판정·근거 |
|---|---|
| 🔴1 ABA | **해소.** 토큰을 매번 생성하고, 종료·만료 모두 해당 객체 참조로 CAS합니다. 같은 시각의 새 요청을 옛 토큰으로 삭제할 수 없습니다. [Tracker:73](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:73), [Tracker:117](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:117), [반례 테스트:109](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/ActiveRequestTrackerTest.java:109) |
| 🔴2 초기화 실패 재호출 | **해소.** provider catch는 독립 카운터만 증가시키고, `create`는 NOOP를 반환합니다. 상한·경로 파싱 방어도 구현되어 있습니다. [Provider:25](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/MovesEyeInstrumenterCustomizerProvider.java:25), [Metrics:26](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestOperationMetrics.java:26), [PocState:56](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:56), [PocState:239](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:239) |
| 🟠3 백오프 설명 | **해소.** 동시 전체 순회·빈칸 누락·비원자적 포화 판단까지 명시합니다. [Tracker:26](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:26) |
| 🟠4 벤치 | **요청한 수정은 반영. 추가 보완 필요.** 결과 소비, 교대 실행, 추적률, 중앙값·최솟값 표기는 확인했습니다. 아래 측정 간섭이 남습니다. [Bench:115](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:115), [Bench:161](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:161) |
| 🟠5 점유 후 등록 실패 | **명시한 두 경로는 해소, 전체 예외 안전성은 부분 해소.** 토큰 생성 실패는 CAS 전이며, `context.with` 실패는 회수합니다. 그 사이의 카운터 실패는 아래와 같습니다. |

**🟠 1. `trackedStarted()` 실패 시 점유한 칸을 회수하지 않습니다.**

[Metrics:40–56의 흐름](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestOperationMetrics.java:40)은 `tryStart → trackedStarted → 내부 try/context.with`입니다. 따라서 `trackedStarted()`는 회수용 catch 바깥에 있습니다.

실패 시나리오는 `detailed-counters=true`에서 슬롯 점유 후 `LongAdder.increment()`가 경합 처리용 메모리를 할당하다 OOM을 내는 경우입니다. 이 카운터는 [PocState:99](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/PocState.java:99)에 있고, 실제 JDK 구현에도 Cell 생성·배열 확장이 있습니다. [OpenJDK 구현](https://raw.githubusercontent.com/openjdk/jdk17u/master/src/java.base/share/classes/java/util/concurrent/atomic/Striped64.java)

바깥 catch는 원래 Context를 반환하므로 종료에서 토큰을 찾지 못합니다. 슬롯은 TTL 회수까지 남고, TTL이 꺼져 있으면 계속 남습니다. **기본 진단 카운터 비활성 경로에는 해당하지 않아 🟠로 판단합니다.** 토큰 획득 이후 Context 등록 완료까지를 하나의 회수 범위로 묶으면 닫힙니다.

질문하신 **`context.with` 실패 자체의 흐름은 정확합니다.** [Metrics:51](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestOperationMetrics.java:51)에서 `end(token)` 후 재던진 예외는 바깥 catch로 들어가 `listenerFailed()`에 한 번 집계되고 원래 Context를 반환합니다. 다만 이미 증가한 `trackedStarts`에 대응하는 `trackedEnds`는 없으므로, 실패가 발생한 실행에서는 두 값의 차이를 곧바로 슬롯 누수로 해석하면 안 됩니다.

**`Token.slot` 가시성과 `slot < 0` 처리는 현재 경로에서 문제없습니다.**

- [Tracker:101](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:101)의 순서는 `배열 CAS → volatile slot 기록 → 반환`입니다. 종료 측에 Context로 전달되는 토큰은 이 기록을 마친 토큰입니다. volatile 쓰기와 후속 읽기의 가시성 규칙에도 맞습니다. [JLS §17.4.5](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.4.5)
- CAS 직후 집계 스레드가 아직 `slot=-1`인 토큰을 볼 수는 있습니다. 하지만 [snapshot:134](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:134)는 `token.slot` 대신 순회 인덱스 `i`로 만료 CAS를 합니다. 그 사이 만료·재사용돼도 옛 토큰은 새 토큰을 지우지 못합니다.
- [end:114](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:114)의 음수 슬롯 거부는 안전합니다. 정상 `tryStart`는 실패 시 토큰이 아니라 `null`을 반환하며, 미완성 토큰을 종료 호출자에게 노출하는 경로가 없습니다.

**🟠 2. 벤치의 추적률 계측이 점유 시간과 측정 비용을 바꿉니다.**

[Bench:92](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:92)에서 매 반복마다 공유 `LongAdder`를 갱신하며, 특히 성공 카운터는 **슬롯을 잡은 상태에서 `end` 전에** 증가합니다.

따라서 측정값에는 카운터 비용이 포함되고, 카운터 경합으로 슬롯 점유도 길어집니다. 성공률이 5.6%와 35.0%로 다른 두 구현에는 성공·실패 카운터의 경합 양상도 다르게 적용됩니다. **스레드별 로컬 `long`으로 세고 반복 종료 후 합산**하는 편이 본 측정에 적합합니다.

포화 `limit=32` 해석은 **가능한 원인 설명이지만, 현재 결과만으로 확정할 수 없습니다.**

- 맵은 [MapTracker:30](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/MapActiveRequestTracker.java:30)에서 예약한 뒤 토큰 번호 증가·객체 생성·삽입을 수행하고, [종료:53](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/MapActiveRequestTracker.java:53)의 remove 이후에야 예약을 반환합니다. 이 경로가 점유 시간을 늘린다는 설명에는 근거가 있습니다.
- 동시에 맵은 [예약 검사:114](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/MapActiveRequestTracker.java:114)에서 만원을 보면 즉시 포기합니다. 배열은 [Tracker:75](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:75)에서 최대 32칸을 순회하며, 그동안 해제된 칸을 잡을 기회가 있습니다. **이 조건에서는 백오프를 사용하지 않습니다.**
- 즉, 맵의 빠른 포기 반복이 시도 건수의 분모를 키우는 효과도 있습니다. 512스레드의 스케줄링과 카운터 간섭까지 섞여 있으므로, 낮은 추적률만으로 높은 평균 점유를 입증하지는 못합니다.

권장 해석은 **“맵의 예약 유지 비용과 빠른 포기 경로, 배열의 순회 중 재확인 기회가 함께 작용했을 가능성이 있다”**입니다. 포화 수치는 성공·포기의 혼합 비용이므로 `16,356 < 39,456`을 동일한 추적 작업의 성능 우위로 읽으면 안 됩니다.

**🟡 설명·검증상의 작은 잔여 사항도 있습니다.**

- [Token 주석:191](/C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/poc/ActiveRequestTracker.java:191)의 “record면 ABA가 돌아온다”는 설명은 부정확합니다. 현재 `AtomicReferenceArray.compareAndSet`은 `equals`와 무관하게 `==`로 비교합니다. 핵심은 **새 토큰 생성·재사용 금지·참조 CAS**입니다. [Java API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/atomic/AtomicReferenceArray.html#compareAndSet(int,E,E))
- [Bench:212](/C:/solutions/moveseye-otel-extension/src/test/java/com/dmove/moveseye/otel/poc/TrackerContentionBenchTest.java:212)의 추적률은 6판 합산 비율이고, ns는 중앙값입니다. 둘이 같은 판의 결과인 것처럼 해석하지 않도록 표기하면 좋습니다.
- ABA 반례 테스트는 확인했습니다. 초기화 실패·`context.with` 실패를 직접 주입하는 테스트는 현재 테스트 소스에서 확인되지 않았습니다.

**격리 호스트 본 재측정에 들어가도 되는가: 조건부로 가능합니다.** 🔴 차단 사유는 없습니다. 다만 본 수치 확정 전에는 벤치 카운터를 반복 밖에서 합산하도록 바꾸고, 진단 모드의 슬롯 회수 공백을 보완하는 것이 좋습니다. 호스트 격리만으로 위 두 문제는 해소되지 않습니다.
