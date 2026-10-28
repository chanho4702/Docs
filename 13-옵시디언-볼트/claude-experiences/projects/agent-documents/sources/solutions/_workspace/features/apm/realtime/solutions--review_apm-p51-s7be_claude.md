# APM P5.1 7단계 BE 보완(C·A·D·G) 구현 검수 — Claude

- 대상: worktree `C:\solutions\moveseye-be-spring-p5`(브랜치 `p5-live`, master 동기 + 미커밋 12파일 / 신규 28파일)
- 구현 보고: `_workspace/_archive/features/apm/realtime/review_apm-p51-s7be_codex-impl.md`
- 근거: `_workspace/features/apm/realtime/contract_apm-p5-live.md`(과제 출처) · `features/apm/realtime/devdesign_apm-realtime.md` v4.5 §2.6·§2.8·§3.2·§3.3 · `features/apm/realtime/devdesign_apm-realtime-ux.md` v1.3 §1.2
- 방식: 읽기 전용(코드 수정 없음) + 선별 테스트 + 변이 3종(적용→검출 확인→md5 복원)
- 판정: **🔴 3 · 🟡 14 · 🟢 8** — **1라운드 수정 후 병합 권고**(C·D·G는 그대로 병합 가능, A만 수정 대상)

---

## 0. 요약

| 과제 | 판정 | 한 줄 |
|---|---|---|
| **C** 압박 카운터 | 🟢 | tick 구간 증분·해제 시 0 발행·무한 `degraded` 정지까지 코드와 단언이 모두 맞다. 다만 필드명·누적값 노출은 문서 정정 필요(🟡-2) |
| **A** `live{}` 공급 | 🔴 | §2.6 합산 규칙·§2.8 산식·90초 stale은 정확하다. 그러나 **heapPct 실효성(🔴-1)**, **snapshot.begin 64 KiB 폭주(🔴-2)**, **시리즈/인스턴스 상한 불일치와 서비스 전체 오염(🔴-3)** 3건이 남는다 |
| **D** `minMs`·`sumMs` | 🟢 | 노출·주석·골든 모두 정직. FE가 평균·다초 p95 보정을 만들 수 있다 |
| **G** 골든 22개 | 🟢 | **실제 송신 바이트**에서 뽑은 JSON이고 checksum을 wire CRC와 대조한다. 미커버 분기 6개는 🟡-12에 나열 |

**검증 수치(재실행)**

| 범위 | tests | fail | error | skip |
|---|---:|---:|---:|---:|
| `overview.live.*` (21클래스) | 177 | 0 | 0 | 0 |
| `collector.ingest.live.*` (17클래스) | 267 | 0 | 0 | 0 |
| `collector.ingest.store.MetricIngestorTest` (9 nested) | 36 | 0 | 0 | 0 |
| **합계** | **480** | **0** | **0** | **0** |

`--max-workers=1 --no-daemon`, IT 미실행, 실행 전 `GradleWorkerMain` 0개 확인. `git diff --check` 클린(rc=0, CRLF 경고만), `src/` 밖 임시 파일 없음, P1.5 기존 테스트(`LiveBufferTest`·`ApmLiveSnapshotServiceTest`·`ApmLiveStreamControllerTest`) 전부 통과.

⚠️ 코덱스 보고의 "`collector.ingest.live.*` 267건"은 `:test`가 아니라 루트 태스크로 돌려야 한다 — `gradlew test --tests …`로 돌리면 `:engine-zabbix:test`가 "No tests found"로 **빌드 자체를 실패**시킨다(`:test`로 한정하면 정상). 검수 재현 시 주의.

---

## 1. 🔴 상세

### 🔴-1. `heapPct`가 기본 JVM(G1)에서 사실상 상시 `null`이고, 같은 레포의 기존 런타임 화면과 규칙이 어긋난다

**위치**: `LiveRuntimeMetrics.java:76~89`(`heap()`), `MetricIngestor.java:410~415`(수집 필터), 대비군 `service/runtime/RuntimeSlotMap.java:267~268`

`heap()`은 인스턴스의 **모든** `HEAP_USED` pool 시리즈에 대해 **같은 pool 키의 `HEAP_LIMIT`**을 요구하고, 하나라도 없거나 stale이거나 `limit <= 0`이면 그 인스턴스 전체를 `Value(null, null)`로 만든다.

```java
Observation u = e.getValue(), l = latest.get(new Key(instance, LivePoint.Kind.HEAP_LIMIT, key.series()));
if (!fresh(u, now) || !fresh(l, now) || l.value() <= 0) return new Value(null, null);
```

HotSpot G1(JDK 17 기본 GC)에서 `MemoryPoolMXBean.getUsage().getMax()`는 **Eden·Survivor가 -1**이고, OTel Java는 그 값을 `jvm.memory.limit`로 **내보내지 않는다**. 즉 `HEAP_USED`는 pool 3개, `HEAP_LIMIT`은 `G1 Old Gen` 1개만 도착한다 → 첫 Eden 키에서 즉시 `null` 반환. **JVM 서비스의 heapPct가 언제나 "측정 불가"가 된다.**

더 나쁜 것은 **같은 제품 안에서 두 화면이 다른 답을 한다**는 점이다. 기존 서비스 런타임 화면은 `jvm.memory.type` 단위 합(`gauge(SLOT_MEMORY_LIMIT, "jvm.memory.limit", DIM_JVM_MEMORY_TYPE)`)으로 heap을 계산하므로 limit을 내지 않은 pool은 그냥 빠지고 **숫자가 나온다**. 같은 데이터로 한 화면은 값을, P5는 "측정 불가"를 말한다.

**재현**: 별도 재현 코드가 필요 없다 — `LiveRuntimeMetricsTest.cpuUsesJvmOrProcessAndHeapNeedsMatchingFreshPositivePoolLimits:62`가 이미 그 동작을 정답으로 고정하고 있다(인스턴스 `b`: `HEAP_USED(pool=only)`만 있고 limit 없음 → `heap().value()` is null). G1 실측은 이 워크트리에서 bootRun 금지라 미수행 — **판정 근거는 HotSpot/OTel 규약이며 런타임 실측이 남아 있다.**

**수정안**: pool 1:1 매칭을 버리고 **heap 한정 Σused / Σ(limit을 낸 pool의 limit)**, limit이 하나도 없을 때만 `null`. G1에서는 `G1 Old Gen`의 max가 곧 전체 heap max이므로 이 식이 바로 맞고, Serial/Parallel처럼 pool마다 max가 있는 경우에도 성립한다. 설계 §2.8의 "heap pool 구분과 유효한 limit이 둘 다 있을 때만"도 "heap 한정 + limit 보유 pool 합"으로 정정한다. 현 규칙을 유지하려면 **G1 실측으로 null 여부를 먼저 확인**하고 UX에 "JVM 구성에 따라 상시 측정 불가"를 명시해야 한다(그 경우 §1.2 heap 타일은 만들 이유가 없다).

---

### 🔴-2. `snapshot.begin`의 `live{}`가 64 KiB 상한을 넘으면 그 설치본은 실시간 화면을 영영 못 연다

**위치**: `LiveSpanSnapshot.java:95`(`"live", snapshot.live`) · `LiveStreamLimits.java:10`(`begin = 65536`) · `LiveSpanRuntimePayload.java:15` · 실패 경로 `LiveSpanSnapshot.java:44`

`LiveSpanRuntimePayload.services()`는 catalog의 **모든** 서비스에 항목을 만든다 — 메트릭이 한 건도 없는 서비스도 `active{value:null,…}`·`cpuPct{avg:null,…}`·`heapPct:null`·`threads:null`을 그대로 싣는다.

```java
var sample = metrics.getOrDefault(dictionary.service().id(), new LiveRuntimeMetrics.Sample(0, List.of()));
...
result.put(Long.toString(dictionary.service().id()), Collections.unmodifiableMap(map( ... )));
```

**실측 크기**(골든 JSON을 컴팩트 직렬화해 측정):

| 항목 | 바이트 |
|---|---:|
| `snapshot.begin` 고정부(live 제외) | 573 |
| live 항목 1건 — 메트릭 없음(전부 null) | 219 |
| live 항목 1건 — 인스턴스 3개(`spans.golden.json`의 실제 블록) | 320 |
| live 항목 1건 — 인스턴스 64개(사전 상한) | 약 2,760 |

begin 여유는 약 64.9 KB이므로 **메트릭 없는 서비스만 있어도 ~291개, 인스턴스 3개면 ~200개, 10개면 ~108개, 64개면 ~23개**에서 상한을 넘는다.

넘으면 `hub.codec.event(…, hub.limits.begin(), true)` 안의 `BoundedOutput`이 `LiveSpanStreamCodec.TooLarge`를 던진다. 이 예외는 `run()`의 `catch (SnapshotOverflow)` 재시도 루프가 **잡지 않는다** — `keepRatio` 축소는 점(base/emphasis)만 솎기 때문에 `live` 크기를 1바이트도 줄이지 못하고, 결국 `catch (RuntimeException e) { hub.snapshotFailed(snapshot, 503, "APM_LIVE_SNAPSHOT_UNAVAILABLE"); }`로 떨어진다. 재접속해도 같은 크기라 **항구적 503**이다.

코덱스도 "큰 `live` payload는 기존 64 KiB 상한에 닿을 수 있다"고 적었으나 완화 코드는 없다. P5가 기본 `enabled=false`라 당장 사고는 안 나지만, **출시 시점에 서비스 수가 조금만 늘면 기능 전체가 죽는 형태**라 이번 라운드에서 닫는 것이 맞다.

**수정안**(비용 순):
1. **관측이 전혀 없는 서비스 항목을 `services()`에서 생략** — 전체 몫의 대부분이고 3줄이면 된다. FE는 이미 "없는 서비스는 값 없음"으로 처리해야 하므로 계약 변경도 아니다.
2. begin 직전 `live`를 직렬화해 크기를 재고, 초과 시 `instances[]` → `cpuPct` 순으로 떨어뜨리고 `liveTruncated: true`를 싣는다(계약 1필드 추가).
3. `live`를 `snapshot.chunk`(`kind:"live"`)로 내린다 — 가장 안전하지만 FE 상태 머신 동반 수정.

**최소 조치는 1번**이며, 2번까지 하면 상한을 구조적으로 못 넘는다.

---

### 🔴-3. 시리즈 상한이 인스턴스 상한과 4~8배 어긋나고, 인스턴스 1대의 과적재가 서비스 전체를 `null`로 만든다

**위치**: `LiveRuntimeMetrics.java:8`(`MAX_INSTANCES = 64, MAX_SERIES = 256`) · `:27`(인스턴스 상한) · `:34~38`(overflow 기록) · `:62~65`(`overflowed`) · `:69`·`:74`·`:79`(소비)

**(a) 오염 반경이 서비스 전체다.** `overflow`는 `Map<Kind, Long>` 하나뿐이고 `overflowed(kind, now)`는 인스턴스를 구분하지 않는다. 카디널리티가 큰 인스턴스 **1대**가 `latest`를 채우면 그 서비스의 **모든 인스턴스**의 `active`·`threads`·`cpu`가 90초 동안 `null`이 된다. 주석이 말하는 "일부 시리즈만 합친 값을 정상값처럼 보내지 않는다"는 옳지만, 대가로 멀쩡한 인스턴스까지 같이 꺼 버린다.

**(b) 상한 둘이 서로 안 맞는다.** `latest`는 (instance × kind × series)를 **256칸 하나**에 담는데, 인스턴스 1대의 현실적 시리즈 수는 ACTIVE(method×scheme) 4~10 + THREADS(`jvm.thread.state`×`jvm.thread.daemon`) 6~12 + HEAP_USED/LIMIT 4~6 + CPU 1~2 ≈ **16~30**이다. → **8~16대**에서 256을 채운다. 그런데 `MAX_INSTANCES`는 64이고 P5 사전도 서비스당 인스턴스 64개를 허용한다(`LiveSpanDictionary.java:72`). 설계가 상정한 규모의 1/4~1/8에서 기능이 꺼진다.

**(c) 인스턴스 상한 초과는 무증상이다.**
```java
if (!seen.containsKey(instance) && seen.size() >= MAX_INSTANCES) return;
```
65번째 인스턴스는 `seen`에도 `latest`에도 안 들어가고 **아무 표시가 남지 않는다**. 그 결과 `expectedInstances`도 64로 잘리고 `observedInstances == expectedInstances`가 되어, 실제로는 부분합인 `active.value`가 **완전한 값처럼** 화면에 나간다. 시리즈 축에서는 지킨 정직성 원칙이 인스턴스 축에서는 안 지켜진다.

**수정안**: `overflow` 키를 `(instance, kind)`로 바꾸고, `MAX_SERIES`를 `MAX_INSTANCES × 32`(=2,048) 수준으로 올리거나 `ApmLiveProperties`로 빼서 힙 추정식에 반영한다. 인스턴스 상한 초과도 `Sample`에 `instancesTruncated` 같은 신호를 실어 `expectedIsEstimate`와 함께 화면이 "부분 관측"이라고 말할 수 있게 한다.

---

## 2. 🟡 목록

| # | 항목 | 위치 |
|---|---|---|
| 1 | **사라진 속성 조합이 90~300초 동안 합계를 죽인다.** `sum()`이 `anyMatch(v -> !fresh(v, now))`로 하나라도 stale이면 `null`인데, `latest` 청소 기준은 `EXPECTED_MS`(300초)다. `jvm.thread.count`는 async gauge라 **그 순간 존재하는 (state, daemon) 조합만** 기록된다 — BLOCKED 스레드가 0이 되면 그 시리즈가 사라지고, 90초 뒤부터 300초까지 `threads`가 통째로 `null`이 된다. (ACTIVE는 CUMULATIVE UpDownCounter라 SDK가 조합을 계속 내보내므로 영향이 적다.) 권고: 같은 `(instance, kind)`의 최신 관측 시각보다 이전 export에 속한 시리즈는 "이번 export에서 사라진 것"으로 보고 합산에서 제외하고, **fresh 시리즈가 0일 때만** `null` | `LiveRuntimeMetrics.java:24, 66~71` |
| 2 | **`pressure.arenaPressure`가 누적→구간으로 의미만 바뀌고 이름은 그대로**다. 설계 v4.5 §3.2가 제안한 `arenaPressureDelta`/`arenaPressureTotal` 분리는 미채택. 게다가 누적 카운터는 **어디에서도 읽을 수 없다** — `ring.counters()` 소비자가 `LiveSpanRing`·`LiveSpanStreamService` 밖에 0건이라 "누적 진단값 보존"은 실질적으로 관측 불가다(ring의 `dictBudget`·`instanceBudget`·`dictIdExhausted`도 같은 상태 — 선재 공백). 권고: `pressure.arenaPressureTotal` 1필드 추가 또는 운영 EP 편입, 아니면 설계·계약 문서에서 분리안을 **명시적으로 철회** | `LiveSpanStreamService.java:196~202` · `LiveSpanFrames.java:113` |
| 3 | **P1.5 `activeRequests`의 의미가 바뀌었는데 FE 계약 javadoc이 옛 규칙 그대로다.** `ApmLiveDto.java:79~80`이 아직 "그 칸에서 **마지막으로 관측된** 값. 🔴 합이 아니다(UpDownCounter라 더하면 인스턴스 수만큼 부푼다)"라고 적혀 있다. `LiveBufferTest.java:148`의 DisplayName "🔴 액티브는 합이 아니라 그 칸의 최신값이다"도 같다 — 그 테스트는 두 점의 series가 같아서 **새 규칙에서도 우연히 통과**할 뿐이라(퇴행 감시 역할을 못 한다) 미래에 "원복" 근거로 오용될 수 있다. 값 자체도 달라졌고(`null` 신규 발생 포함) FE 소비자가 있으므로 P1.5 계약 쪽에도 고지 필요 | `ApmLiveDto.java:79` · `LiveBufferTest.java:148` |
| 4 | `threads`·`active.value`·`instances[].value`가 **double**로 나간다(`20.0`, `7.0`). 설계 §3.2 예시는 정수(`212`, `7`). JS는 무해하지만 골든이 타입을 고정했으므로 계약 문서에 명시 | `spans.golden.json` |
| 5 | `active.instances[]`에 **`value: null` 항목이 들어간다**(골든 `id:4`). 설계 §3.2 예시에는 없는 형태 — FE 타입 `number \| null` 필요. ✅ 다만 `asOf`가 숫자면 stale, `null`이면 그 종류를 한 번도 못 봄으로 **구분이 가능하다**(UX §1.2의 "어느 인스턴스가 stale인지"에 바로 쓸 수 있는 정보) — 문서화 권장 | `LiveSpanRuntimePayload.java:23` |
| 6 | `stats.minMs`·`sumMs`는 `count == 0`인 칸에서 **0**이다(`LiveSpanStats.java:34`의 리셋이 0). `p50Ms`/`p95Ms`는 `null`인데 min/sum/max만 0이라 "관측 없음"과 구분되지 않는다. 기존 `maxMs`와 같은 선례라 비차단이나 계약 문서에 "`count>0`일 때만 읽을 것" 명시 | `LiveSpanStats.java:34, 42` |
| 7 | **`live{}` 공급이 P1.5 스위치에 종속된다.** `LiveBuffer.runtimeSnapshot`이 `!props.enabled()`(=`app.apm.live.enabled`, 기본 true)면 `Map.of()`를 준다. P5만 켜고 P1.5를 끈 설치본에서 `live`가 **조용히 빈 객체**가 되는데 계약 문서의 기능 스위치 표에는 `app.apm.live.spans.enabled` 하나만 있다 | `LiveBuffer.java:235~236` |
| 8 | **저장 경로 오버헤드.** 허용된 **모든** 메트릭 datapoint마다 `SEEN` LivePoint를 1건 더 만든다 → 배치당 LivePoint 수·할당이 2배. `LivePoint.gauge`가 매번 `MessageDigest.getInstance("SHA-256")`+hex 변환을 도는데 SEEN의 속성은 항상 `Map.of()`(결과가 상수)다. 더해서 `LiveRuntimeMetrics.record`가 **포인트마다** `seen`/`latest`를 `removeIf`로 전수 스캔한다(최대 320칸 × 포인트 수, `synchronized` 안). 권고: SEEN용 상수 series 캐시 + 만료 스캔을 tick/N회 단위로. ✅ **실패 처리는 정확하다** — `stored > 0`일 때만 offer하고 `offer`가 `RuntimeException`을 삼켜 재전송 이중계상을 막는 P1.5 계약이 그대로다 | `MetricIngestor.java:388, 196~198` · `LivePoint.java:325~335` · `LiveRuntimeMetrics.java:23~24` |
| 9 | **기본 힙 예산이 상한의 99.6%**(63.73 / 64 MiB). 테스트도 `isBetween(50L, 64L)`로 바뀌었다. `Slot`의 active 배열은 **지연 할당**인데 추정식은 항상 최대로 세므로, 앞으로 기본값을 조금만 올리면 `requireWithinHeapBudget`이 **기동을 실패**시킨다. `DEFAULT_MAX_HEAP_MB` 상향 또는 추정식 현실화 권고 | `ApmLiveProperties.java:80, 250~253` · `ApmLivePropertiesTest.java:33` |
| 10 | **사전 ID 소모.** `observeMetricInstances`가 tick마다 메트릭 인스턴스를 P5 사전에 등록하고 `referencedAt`을 갱신한다 → 스팬을 한 번도 안 보낸 인스턴스가 서비스당 64칸을 점유하고 만료(910초)도 계속 연장되어, 스팬 인스턴스를 `__other__`로 밀어낼 수 있다 | `LiveSpanRing.java:55~64` · `LiveSpanDictionary.java:70~73` |
| 11 | `expectedInstances`가 **모든 허용 메트릭**의 저장 성공을 근거로 세므로 `http.server.active_requests`를 내지 않는 런타임(설계 §2.6이 명시한 Node 등)도 분모에 든다 → UX "m/n 인스턴스" 배지가 폴리글랏 서비스에서 상시 부분 장애처럼 보인다. 설계대로이긴 하나 UX 문구 확인 필요 | `LiveRuntimeMetrics.java:29` |
| 12 | **골든 미커버 분기 6개**: ① `spans` 멀티파트(`part.count > 1`) ② `removeServices` 비어있지 않은 경우 ③ `snapshotKeepRatio < 1`인 축소 재시작 `snapshot.begin` ④ `stats.lateArrivals > 0` ⑤ **`APM_LIVE_INVALID_QUERY` 400 본문**(`LiveStreamRejectionAdvice.java:51` — 계약 문서 line 65·640이 규정한 값인데 골든에 없다) ⑥ `patterns` 비어있지 않은 경우(P5.4 범위라 정당). ①~⑤ 중 ⑤가 가장 값싸고 계약 문서에 이미 적힌 것이라 이번에 넣는 것을 권함 | `src/test/resources/apm/contract/` |
| 13 | `service.instance.id`가 없는 런타임은 전부 `""` 한 키로 합쳐져 서로의 ACTIVE를 덮어쓴다(사전에서는 `__none__`, id 0으로 정상 처리됨). 합계 과소의 무증상 경로 — OTel 에이전트는 항상 채우므로 실사용 확률은 낮다 | `LivePoint.java:321` · `LiveRuntimeMetrics.java:25` |
| 14 | `changedLive`가 비지 않으면 **모든 view**에 프레임이 나간다 — 그 서비스를 안 보는 view는 `live:{}`·`replaceBuckets:{}`인 빈 프레임을 받고 seq만 올라간다. 기존 dict delta와 같은 패턴이라 비차단 | `LiveSpanStreamService.java:262~264` |

---

## 3. 🟢 확인된 것

1. **C — 압박 카운터**(`LiveSpanStreamService.java:196~202, 300`). 누적에서 tick 구간 증분을 빼고, `pressureChanged = pressure > 0 \|\| lastTickPressure > 0`으로 **압박 해제 시 0을 1회 발행한 뒤 멈춘다**. 기준 전진이 `if (connections.isEmpty() && views.isEmpty()) return;` **앞**에 있어 연결이 없던 구간의 압박이 새 연결에 쏟아지지 않는다. `degraded`는 `tick.pressure() > 0`일 때만 나가므로 무한 발송이 실제로 멈춘다.
   테스트가 그것을 정확히 단언한다(`LiveSpanStreamServiceTest.java:22~40`): 1 발행 → 다음 tick 0 발행 → `control`은 1건 유지 → 새 압박마다 재발행 → 누적 카운터는 3으로 보존.
2. **A — 액티브 합산 규칙 §2.6**. 인스턴스 안 (속성 조합)별 최신값을 먼저 합하고 그 다음 인스턴스를 합한다. 시간축 합산이 아니다(`LiveRuntimeMetricsTest:17~28`이 같은 시리즈의 과거 값 100을 넣어도 9로 유지됨을 고정). method·scheme별 여러 시계열을 실제로 다 더한다(`LiveRuntimeIngestTest:31~33, 45` — `http`/`https` 두 시계열 3+4=7). **관측 0과 `null`(관측 없음)이 구분된다**(`LiveRuntimeMetricsTest:31~41`).
3. **A — 90초 stale 제외**가 §3.2·UX와 일치한다(`STALE_MS = 90_000`, `fresh()`). `LiveSpanRuntimeStreamTest:50~57`이 `spans` 프레임 수준에서 stale 전환(`active.value`·`asOf`·`cpuPct.avg`가 null이 되고 `expectedInstances`는 3으로 남음)까지 확인한다.
4. **A — `expectedInstances` 근거·표기**. `seen`은 **저장이 성공한 시각**(`nowMillis`)으로, 값의 신선도는 **계측 시각**(`point.time()`)으로 판정한다 — 두 축이 분리돼 있고 테스트가 그 분리를 고정한다(`LiveRuntimeMetricsTest.expectedUsesStorageObservationTimeWhileStaleUsesMeasurementTime`). `expectedIsEstimate`는 항상 `true`. `asOf`는 **합산에 참여한 가장 오래된 관측**(`oldest(active)` ← 인스턴스별 `min(at)`)이라 "관측 N초 전" 표기와 맞다.
5. **A — `cpuPct`·`threads`가 §2.8과 일치.** JVM 우선·process 폴백·×100·인스턴스 단순 평균 + `max` 병기, stale·음수는 평균에서 제외(0으로 넣지 않음). `threads`는 (state, daemon)별 최신값을 인스턴스 안에서 합산한 뒤 서비스 합 — 기존 런타임 화면(`RuntimeSlotMap` SLOT_THREADS, dims 없이 저장돼 UPSERT가 합산)과 **같은 값**이 나온다.
6. **A — P1.5 침범 여부.** 바이트 수준 불변은 아니다(`LiveBuffer` +63, `LivePoint` +59 — §2.6 수정이 P1.5 `Slot`을 건드리는 것은 설계가 지시한 것이다). 지켜진 것: DTO shape·10초 버킷·duration/route 집계 그대로, **런타임 전용 서비스가 HTTP 링 LRU를 밀어내지 않음**(별도 맵 `runtimeMetrics`, `LiveBuffer.java:94~99` — `LiveRuntimeMetricsTest:88~97`이 maxServices=1로 실증), `runtimeSnapshot`은 링 회전·LRU를 건드리지 않는 읽기 전용 사본(`:43` `snapshot(now)` 전후 동일 단언), `Slot`은 회전할 때 `new Slot(bucketStart)`로 새로 만들어 이전 칸의 속성이 새 칸에 남지 않는다(`:114~117`). `bucketSeconds`가 `@Max(60)`이라 `activeAt`의 `char` 캐스팅(최대 60,000 < 65,536)도 안전하다.
7. **D — `minMs`·`sumMs`**. `LiveSpanStreamCodec.java:77`에 추가됐고 바로 위 `:73`에 **`histOverflow`는 `hist[14]`의 표시용 사본이라 합계에 더하면 중복**이라는 주석이 붙었다. 골든이 `hist[14] == histOverflow == 1`로 그 중복을 **눈에 보이게 고정**한다 — 문서보다 강한 장치다. FE는 `sumMs/count`로 평균을, `minMs`로 다초 p95의 실측 min 보정을 만들 수 있다.
8. **G — 골든의 성격.** `Sink`가 `LiveStreamSink.send(byte[] …)`로 오는 **실제 송신 바이트**를 그대로 받고, 거기서 `data:` 이후를 잘라 비교한다 — 직렬화 사본이 아니다. `snapshot.end.checksum`을 **실제 wire CRC와 먼저 대조**한 뒤 골든용 정규화 CRC로 갈아끼운다(설계 §3.2 `[impl-r3 D3]` 산식 검증). 시계(`AtomicLong`)·난수(`Random(4)`)·`startedAt`(clock 주입)까지 결정적이라 플래키하지 않다. 실패 메시지에 `_workspace/features/apm/realtime/contract_apm-p5-live.md`와 FE 타입 동반 수정 안내가 들어 있고, `P5_CONTRACT_CAPTURE` 덤프는 `%TEMP%` 하위로 강제되며 **골든을 자동 갱신하지 않는다**(회귀를 조용히 덮는 흔한 함정을 피했다).

---

## 4. 변이 검출 (테스트 품질)

원본 md5 기록 → 변이 적용 → 선별 실행 → 복원 → md5 재확인. **세 변이 모두 잡혔고 워크트리는 바이트 동일로 복원됐다**(`LiveRuntimeMetrics.java` `53db32eb…`, `LiveSpanStreamService.java` `403328af…`, `git diff --stat` 12 files / 215 insertions / 43 deletions 동일).

| 변이 | 내용 | 결과 |
|---|---|---|
| A | `sum()`의 시리즈 합산 → **최신값 1개만** | **5건 실패** — `LiveRuntimeMetricsTest` 4건(`activeSums…:24`, `partialStale…:50`, `cpuUsesJvm…:68`, `overviewBucketOverflow…:124`) + `LiveRuntimeIngestTest:45` |
| B | `STALE_MS` 90초 → **900초**(stale 제외 해제) | **5건 실패** — `LiveRuntimeMetricsTest` 4건 + **`LiveSpanRuntimeStreamTest`**(SSE 프레임 수준까지 잡힘) |
| C | `pressure = max(0, total - last)` → **`total`**(누적 복귀) | **1건 실패** — `LiveSpanStreamServiceTest.pressureIsPerTickStopsOnTheNextTickAndContinuesOnlyWithNewPressure:31` |

변이 C가 1건만 잡은 것은 골든 `control.degraded.arena_pressure`가 카운터 0→1 상황이라 누적/구간이 같은 값이 되기 때문이다 — 결함 검출력 자체는 충분하지만, 골든에 "압박 2회 이후 tick" 표본이 하나 있으면 더 촘촘해진다.

---

## 5. 정본·계약 문서에 반영할 것

**`_workspace/features/apm/realtime/contract_apm-p5-live.md`** (해소 표시 + 타입 교체)
- §6-A `live{}`가 비어 있음 → **해소**. FE 타입 `live: Record<string, never>`(line 479·549)를 실제 shape로 교체: `active{value:number\|null, observedInstances:number, expectedInstances:number, expectedIsEstimate:true, asOf:number\|null, instances:{id:number, value:number\|null, asOf:number\|null}[]}` · `cpuPct{avg,max,observedInstances,asOf}` · `heapPct:number\|null` · `threads:number\|null`. 숫자는 double로 직렬화된다는 점, `spans.live`는 **바뀐 서비스만** 온다는 점 명기.
- §6-C `arenaPressure` 누적 → **해소(구간값)**. line 749의 "이 배지를 쓰지 말 것" 우회를 **정상 사용**으로 되돌리고, 이름은 그대로지만 의미가 delta임을 굵게 적는다(🟡-2).
- §6-D `minMs`·`sumMs` 미노출 → **해소**. `stats`에 두 필드 추가, `count==0`이면 0이라는 단서 포함(🟡-6).
- §6-E "계약 표본 JSON 0건" → **해소**(`src/test/resources/apm/contract/` 22개). 미커버 분기 6개를 잔여로 기록(🟡-12).
- 기능 스위치 표에 `app.apm.live.enabled`(P1.5) 종속 추가(🟡-7).
- **판정: 불일치가 나면 골든이 정본이다.** 골든은 실제 송신 바이트에서 뽑았고 CRC까지 대조됐으므로, 설계 §3.2 예시(정수 표기·`instances[]`에 null 없음)가 문서 쪽 오차다.

**`features/apm/realtime/devdesign_apm-realtime.md` v4.5 → v4.6**
- §2.6의 "`LiveBuffer.recordActive`에서 아직 미반영" 이력 → **반영 완료**로 갱신(현 구현 위치는 `LiveBuffer.Slot.recordActive`의 시리즈 배열).
- §3.2의 "현재 BE 구현은 `live`를 항상 `{}`로 보낸다", "minMs·sumMs는 구현 중" 주석 삭제.
- §3.2 `arenaPressure`: 구간값 확정 + `delta/total` 분리를 채택하지 않은 사유(또는 `arenaPressureTotal` 추가 결정) 기록.
- **§2.8 `heapPct` 규칙 재검토**(🔴-1) — pool 1:1 매칭이 G1에서 상시 null을 만든다는 사실과, 기존 `RuntimeSlotMap`의 type 단위 합과의 불일치를 적고 규칙을 정한다.
- §5.2 힙 표: P5 편입 후 기본 조합이 63.73 / 64 MiB(99.6%)라는 점과 지연 할당 사실(🟡-9).

**`features/apm/realtime/devdesign_apm-realtime-ux.md` v1.3 §1.2**
- `instances[].value=null` + `asOf` 유무로 **stale / 미관측**을 구분할 수 있다는 점(툴팁 문구에 바로 쓸 수 있다).
- `expectedInstances` 분모에 `active_requests`를 내지 않는 런타임이 포함된다는 점(🟡-11) — "m/n"을 장애 신호처럼 보이지 않게 문구 조정.
- `heapPct`가 JVM 구성에 따라 상시 `null`일 수 있다는 점(🔴-1 결정에 따름).

**`moveseye-be-spring/CLAUDE.md` 또는 `ApmLiveDto` javadoc**
- P1.5 `activeRequests`의 새 규칙(시리즈 합 · 64시리즈 초과 시 `null`)과, `LiveBufferTest.activeKeepsLatestNotSum`의 이름·DisplayName 갱신(🟡-3).

---

## 6. 수정 라운드 항목 · 병합 판정

**R1 (병합 전 필수)**
- **R1-1** `LiveSpanRuntimePayload.services()`에서 관측이 전혀 없는 서비스 항목 생략 + begin `live` 크기 가드(`liveTruncated`) — 🔴-2.
- **R1-2** `LiveRuntimeMetrics.overflow`를 `(instance, kind)`로 키잉 — 🔴-3(a). 인스턴스 상한 초과 신호 추가 — 🔴-3(c).
- **R1-3** `ApmLiveDto.java:79~80` javadoc과 `LiveBufferTest:148` DisplayName을 새 `activeRequests` 규칙으로 갱신 — 🟡-3. (코드 동작 변경 없음, 회귀 유도 차단용)

**R2 (결정 필요 — 설계 판정 후 구현)**
- **R2-1** `heapPct` 산식: pool 1:1 매칭 유지 vs heap 한정 Σused/Σlimit — 🔴-1. **G1 런타임 실측 1회**가 판정 근거가 되어야 한다.
- **R2-2** `MAX_SERIES` 상향/프로퍼티화 + 힙 추정식 반영 — 🔴-3(b), 🟡-9.
- **R2-3** `pressure.arenaPressureTotal` 추가 여부 — 🟡-2.

**R3 (다음 단계로 넘겨도 되는 것)**
- 🟡-1(사라진 시리즈로 인한 `threads` null), 🟡-8(저장 경로 오버헤드), 🟡-10(사전 ID 소모), 🟡-12(골든 미커버 — 최소 `APM_LIVE_INVALID_QUERY` 1건은 R1에 끼워 넣기 권장).

**병합 가능 여부**
- **C·D·G는 지금 그대로 병합 가능.** 구현·주석·테스트가 모두 요구를 충족하고, 변이 검출로 회귀 방어력도 실증됐다.
- **A는 R1 3건을 반영한 뒤 병합**을 권한다. 특히 R1-1은 "규모가 커지면 기능 전체가 503으로 죽는" 형태라 지금 닫는 것이 싸다(3줄).
- R2는 **P5.2 FE 착수 전에는 결정**돼야 한다 — heapPct는 화면 타일 유무를 가르고, `MAX_SERIES`는 "관측 없음" 표기 빈도를 가른다.
