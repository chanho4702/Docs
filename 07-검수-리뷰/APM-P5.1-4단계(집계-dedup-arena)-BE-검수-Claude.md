# APM P5.1 4단계(집계·dedup·arena) BE 검수 — Claude

- 대상: worktree `C:\solutions\moveseye-be-spring-p5`(브랜치 `p5-live`, HEAD `84edbb9` 위 **미커밋**)
- 구현 보고: `_workspace/reviews/review_apm-p51-s4-be_codex-impl.md` (코덱스 gpt-6-astra)
- 정본: `_workspace/designs/devdesign_apm-realtime.md` **v4.2** §2.3.0·§2.4·§3.1·§3.2·§3.3·§5.2·§7.1(4단계 행)
- 검수 방식: 전 파일 정독 + 정본 대조 + **선별 재실행 274건**(라이브 18클래스, IT 포함) + **변이 3종 수동 주입·복원(md5 일치 확인)**
- 판정: **🔴 1 · 🟡 13 · 🟢 16** → **🔴 R1 수정 후 병합 권고**(나머지는 5단계 전/R3 전 처리)

---

## 0. 요약

정본 §2.4의 자료구조(45B 슬롯 arena·세그먼트 lazy·2계층 예약·초별 reservoir·전체 관측 집계 104B·전체 키 dedup·20 MiB 사전)를 **산술까지 맞춰** 구현했다. 정본의 산술 오기(마지막 세그먼트 7,040)를 잡아냈고, 900칸으로는 `[now−900s, now+5s]`를 담을 수 없다는 것도 정확히 짚었다(아래 §3 검산). 락 설계(registry RW + 서비스 락 + arena 모니터 + dedup 샤드)는 순서가 일관되고 교착 경로를 찾지 못했다. 수량 보존식·부분 성공·시간 규칙·삭제 이벤트는 정본대로다.

🔴는 하나다 — **사전 route/instance ID가 서비스별이 아니라 프로세스 전역 시퀀스**라, 라우트 churn이 있으면 **약 30분 만에 65,534개를 소진하고 그 뒤로는 재기동 전까지 모든 경로가 영구 `__other__`**가 된다. 정본이 "ID 재사용 금지"만 적고 네임스페이스를 명시하지 않은 틈이라 정본도 같이 고쳐야 한다.

---

## 1. rps 429 (정본 §2.3.0·§3.3)

| 확인 | 결과 |
|---|---|
| 인증 전 적용 | ✅ `LiveIngestGuardFilter`(`@Order(HIGHEST_PRECEDENCE)`, 서블릿 필터)라 Spring Security 체인(-100)보다 **앞**이다. `LiveTokenRateLimiterTest:42` 가 임의 bearer 11번째 429 + downstream 10회만 호출을 검증 → permitAll 경로의 음성 캐시 오염·DB 조회 예약 차단이라는 §7.1 목적 달성 |
| 저장 경로 불변 | ✅ `matches()` 미변경(`/apm/otlp-live` 전용), `SecurityConfig` 무변경. `otherPathsDoNotConsumeBuckets...`가 `/apm/otlp/**`·`/apm/live/**`를 회귀로 고정 |
| 토큰 해시 비용 | ✅ SHA-256 1회/요청(수십 바이트, ~1µs)이고 **모니터 밖**에서 계산(`LiveTokenRateLimiter.java:59`). 원문 bearer를 맵에 보관하지 않는 점도 좋다 |
| burst 충전 | ✅ 신규 키 10개 시작(→ 11번째 429), 유휴 시 20까지 축적(`:72`,`:75`). 정본의 "10/burst 20 토큰버킷"과 프롬프트의 "11번째 429"를 동시에 만족시키려는 의도적 선택이며 보고서에 명시됨 |
| 429 본문·헤더 | ✅ `Retry-After: <초>` + `{"error":"APM_LIVE_RATE_LIMITED"}` + `application/json`, 필터 매핑에 429 추가(`LiveIngestGuardFilter:69`) |
| 버킷 맵 유계 | ✅ LRU 2,000, 사용 중 버킷은 퇴출하지 않음 |

### 🟡 Y1 — LRU 포화 시 "신규 키 거절"이 정상 토큰을 잠그는 DoS 전환
`LiveTokenRateLimiter.java:64-71`. 맵이 가득 차면 **가장 오래된 버킷이 `burst/rate`(=2초)보다 최근이면 신규 키를 429**로 돌린다. 재현 경로:

1. 공격자가 서로 다른 임의 bearer 2,000개로 맵을 채운다(허용되는 요청 2,000건, 즉시).
2. 각 키를 2초마다 1회씩만 갱신 = **1,000 rps**면 eldest가 항상 2초 미만 → 맵은 영구 포화.
3. 이 동안 **정상 Collector의 새 토큰(또는 BE 재기동 직후의 모든 토큰)은 계속 429**를 받는다. 기존에 등록된 토큰은 LRU 접근 순서 덕에 밀려나지 않으므로 피해는 "신규·재기동"에 한정되지만, 재기동 직후에는 전부가 신규다.

거절된 신규 키 시도는 access order를 갱신하지 않으므로(`get` miss는 순서 변경 없음) 공격 비용이 늘지는 않는다 — 즉 **방어 장치 자체가 표적 거부의 수단이 된다**. 또 이 거절과 "실제 rps 초과" 거절이 같은 `rateLimited` 카운터로 합쳐져 **운영에서 구분되지 않는다**.

수정안(택1, 작은 순):
- `maxBuckets`의 일정 비율(예: 25%)을 **downstream 인증에 성공한 적 있는 키 전용 예약 슬롯**으로 분리(필터가 응답 상태 200/부분성공을 보고 표시).
- 최소한 `rateLimitedNewKey` 같은 **별도 계수**를 두어 포화가 관측되게 하고, 도달 시 경고 로그 1회.

---

## 2. arena (정본 §2.4·§5.2)

| 항목 | 결과 |
|---|---|
| 45B 슬롯 | ✅ `LiveSpanArena` 9열 SoA = 8+8+8+8+4+1+2+2+4 = 45B, `used×45 = 63,000,000B` 회귀 |
| 세그먼트 lazy·반납 없음 | ✅ `allocate()`가 free list 소진 시 1개만 할당, `release`는 free list만 갱신. `twoHundredSparse...:91`이 고수위(전 슬롯 반납 후 `allocatedSlots` 불변)를 고정 |
| 마지막 세그먼트 | ✅ **7,360이 맞다**(검산: 1,400,000 − 85×16,384 = 7,360; 86×16,384 = 1,409,024 > 1.4M). 정본 7,040은 오기 → 정본 정정 대상 |
| 전역/서비스 예약 | ✅ base 1,300k·emphasis 50k(`claim`), 서비스 base 180k(=200×900)·emphasis 20k |
| 초별 층화 reservoir | ✅ Algorithm R 정본(`sample():233` `random.nextInt(n)`, n은 1-based 관측 수). 이미 버린 표본을 되살리지 않도록 `n-1 > counts[i] → cap = counts[i]`로 용량을 고정(§2.4 "🔴 복구 불가"와 일치) |
| 압박 임계 3% | ⚠️ 구현은 정본대로(`maxPointsTotal − used < 3%`)이나 **도달 불가**(Y3) |
| 무작위 축소 | ✅ `shrink()`가 목록을 1회 순회하며 `random.nextInt(remaining--) < keep`로 균등 표본 유지, 대상은 `largest/2`(하한 20) |
| `pointsRev` 단조 | ✅ 신규 채택·교체·축소 모두 `pointsRev[i]++`, 축소 때 `statsRev`는 불변(회귀 `pressureShrinks...:118`) |
| 버킷 헤더 9필드 40B | ✅ long 1 + int 8, SoA |

### 🟡 Y2 — 압박 상태에서 수신 경로가 `O(서비스수 × 907)` 전수 스캔을 돈다
`LiveSpanRing.shrinkLargest():245-260`. pass 0(같은 초)이 하한 20 때문에 실패하면 **pass 1이 서비스 200개 × 907칸 = 181,400 순회**를 돈다. 버킷별로 cap이 고정되기 전(보통 초당 서비스당 1~2회)에 호출되므로 정상 압박 시 초당 200~400회 × 181,400 ≈ **3,600만~7,200만 배열 접근/초**. 붕괴 수준은 아니지만 CPU 10~20%를 먹고, **호출자의 서비스 락 + registry read lock을 쥔 채** 전 서비스에 tryLock을 거는 동안 tick(write lock)이 밀린다. 정본 §2.4가 L3(1,500/초)을 "균등 축소가 관측되는 프로필"로 규정했으므로 이 경로는 예외 상황이 아니다.
수정안: 압박 시 (a) 서비스별 `retained` 상위값을 별도 배열/힙으로 유지하거나, (b) 축소를 tick으로 옮겨 초당 1회 상각하거나, (c) pass 1을 라운드로빈 커서로 쪼개 한 번에 1개 서비스만 훑는다.

### 🟡 Y3 — "잔여 3%" 압박 분기는 도달 불가(dead)
`baseUsed ≤ 1,300,000`, `emphasisUsed ≤ 50,000`이므로 `arena.used() ≤ 1,350,000`이고, 3% 임계는 `used > 1,358,000`에서만 참이다. 즉 **실질 트리거는 계층 예약 도달 하나**뿐이다. 이는 정본 §2.4가 스스로 계산한 "여유 8,000"의 귀결이라 코드 결함이 아니지만, 어떤 테스트도 이 분기를 타지 않고 앞으로도 탈 수 없다 — 정본과 코드 주석에 "arena 잔여 임계는 상한 조정 시의 안전망이며 기본 설정에서는 계층 예약이 먼저 걸린다"를 명시할 것.

### 🟡 Y5 — 콜드 스타트 초기화가 registry write lock 안에 있다(최대 53.7ms의 주 후보)
`initializeStorage()`(`:100`)는 **첫 배치의 `reserve()` 안, write lock 아래**에서 200×907 슬롯분 배열 ≈ **24.9 MiB**(집계 17.99 + 헤더 6.92)를 할당·`fill` 한다. 보고서의 `최대 53.710ms`는 여기로 보는 것이 가장 자연스럽다(p99 0.758ms와의 격차도 1회성 비용과 일치). 문제는 그 사이 도착한 최대 3개의 동시 배치가 50ms 데드라인에 걸려 `Unavailable → LiveIngestException.storageUnavailable()` = **503 `internalError`**로 나가는 점이다 — 콜드 스타트가 "내부 장애"로 계수된다.
수정안: `enabled=true`일 때 `ApplicationReadyEvent`(또는 컨트롤러 최초 진입 시 락 밖)에서 **선할당**하고, 그래도 실패하면 `busy`로 계수. OFF일 때 25 MiB를 안 잡는 현재의 이득은 그대로 유지된다.

### 🟡 Y6 — tick의 전역 write lock과 창 밖 일괄 반납(53.7ms의 두 번째 후보)
`tick()`은 fair RRWL의 **write lock**을 잡으므로 매초 모든 수신이 최대 50ms 밀릴 수 있고(대기 중인 writer가 신규 reader를 막는다), 수신이 멈췄다 재개되거나 시계가 점프하면 **한 tick이 창 전체(최대 1.35M 슬롯)를 반납**하며 슬롯마다 arena 모니터를 잡는다. R3에서 "초기화 / 정상 tick / 창 전체 반납"을 **분리 계측**해 53.7ms의 귀속을 확정할 것. (정상 상태에서는 반납이 앞서므로 tick당 수천 슬롯 수준이다.)

---

## 3. 900+7칸 (정본 §2.4 창 900초)

**검산 결과 7칸 확장은 필요하고 산술도 맞다.** 허용 구간은 `endTs ∈ [now−900,000, now+5,000]`이고 tick의 반납 조건은 `bucketTime + 1000 ≤ now − 900,000`이므로 동시에 살아 있는 **서로 다른 초는 최대 906개**다. 900칸이면 `now+5s`와 `now−895s`가 같은 인덱스에 겹친다. 907칸은 906을 담고 1칸 여유가 있다(6칸이면 딱 맞고 7칸은 tick 지연 대비 여유). tick이 늦어 910초 전 버킷이 남아 있어도 `offer():188`이 `bucketTime[i] != time`이면 먼저 `clear` 하므로 오염되지 않는다.

- 추가 비용: 7 × 200 × (40 + 104) = 201,600B = **0.192 MiB** — 보고서의 0.193 MiB와 일치(반올림 차).
- `provisionalUntil = bucketTime + 6000`(`copyBucket():361`) = 버킷 종료(+1,000) + 5초 ✅ §2.4·§3.2 정의와 일치. `lateArrivals`도 같은 경계(`now ≥ time+6000`)로 센다 ✅.

---

## 4. dedup (정본 §2.4 "초별 open-addressing 60칸")

| 항목 | 결과 |
|---|---|
| 공유 슬롯 풀 + 체인 + 샤드 FIFO | ✅ **정본보다 낫다.** 슬롯 풀이 전역이라 `reserve(int)`가 키 분포를 몰라도 성립한다 — 초별 테이블이었다면 한 초/한 샤드 집중에서 배치 중간에 503이 났을 것(2~3단계 검수 🟡 Y4의 재발 방지). 만료도 도착 시각 FIFO라 샤드별 O(1) |
| 64 샤드 분포 | ✅ splitmix64 finalizer 후 하위 6비트로 샤드, `hash>>>6`로 버킷 → 축이 독립 |
| 전체 키 비교 | ✅ 지문 일치 시에도 24B 전체 키 비교(`apply():93`). 변이 3(키=spanId만)이 `fullKeyAndHexCaseAreCompared`에 잡힘 |
| 4.12 MiB | ✅ 90,000×40B + 180,032×4B = 4,320,128B = 4.12 MiB(회귀로 고정). 정본 목표 5.49 MiB 이내 |
| 61초 이후 재집계 | ✅ **정본 계약 그대로**(§2.4 "60초보다 늦게 온 중복은 다시 집계될 수 있다 — 첫 출시 60초 유지·한계 문구화"). 위반 아님이며 R1 fixture가 관측하도록 회귀도 있다 |
| `reserve(int)` 선검사 | ✅ 전역 풀 기준 `capacity − used − reserved` 하나로 성립. `prepaid` 경로가 free list를 무검사로 쓰는데, `used+reserved ≤ capacity` 불변식상 `used < capacity`가 보장돼 `freeHead ≥ 0`이다(초과 호출은 `IllegalStateException`으로 차단) |
| 멀티스레드 테스트 실효성 | ✅ `concurrentReservationsAndDuplicateKeysCountOnce`가 8스레드 × 같은 키 1,000개로 **실제 경쟁**을 걸어 `observed == 1000`을 확인한다(형식적 테스트가 아니다). `oneBusyShardDoesNotSerializeOtherShard...`는 샤드 분리를 래치로 증명 |

### 🟡 Y4 — 용량 90,000이 L3(1,500/초 × 60초)와 정확히 같아 절벽이 된다
`MAX_ENTRIES = 90_000`은 **하드코딩**이고 프로퍼티가 없다. 1,500/초가 60초 지속되면 정확히 포화 → `reserve()`가 `dedupFull` → **배치 전체 503**(수신 거절). 정본의 "60k~90k × 2배"에서 2배는 해시 테이블 적재율이지 항목 여유가 아니므로 여유가 사실상 0이다. 게다가 요청 단위 사유는 `busy`로 합류해 "admission 초과"와 구분되지 않는다.
수정안: `app.apm.live.spans.dedup-max-entries`로 노출 + 포화 전용 계수/경고, R3에서 L3 프로필의 포화 시점 실측.

---

## 5. 집계 (정본 §3.1·§3.2·§2.4)

- **전체 관측 기준** ✅ `offer()`가 `stats.add` → `observed++` 를 먼저 하고 그 **뒤에** `sample()`을 부른다. 표본에서 역산하는 경로는 코드에 없다. 회귀 2건(`aggregateCountsAllObservations...`: count 1000 / retained 200, `LiveSpanMinimumPathTest`: 수신 종단에서 동일).
- **`hist[15]`** ✅ `CanonicalBounds.durationSeconds()` 14경계 × 1000 → 15칸, `duration > bound`(= le 의미) 분기. 경계값 15종 정확 회귀(`histogramBoundsOverflowAndTupleAreExact`). `histOverflow = hist[14]`로 §3.2 예시(합 = count, overflow 별도 표기)와 정합.
- **근사 p95** ✅ `HistogramRebucketer.percentile(boundsMs, counts, p, min, max)` — 2026-09-02 D5 교훈(min·max로 조이기)이 적용된 사내 관례를 그대로 쓴다. `ApmPercentiles.of`를 거치지 않은 것은 `HistVector`/`Entry` 타입 때문이며 **같은 산식**이다. `p95Approx = true` 고정 ✅(§3.2).
  - 🟢 참고: `ApmPercentiles.SAMPLE_WARNING_THRESHOLD`(20건 미만 경고)에 해당하는 신호는 Stats에 없다. p95Approx가 항상 true라 화면은 늘 "약"으로 표기하므로 실질 문제는 아니다.
- **오류 2축·slow** ✅ `http5xx = status_code ≥ 500`, `spanError = status.code==ERROR`, `slow = duration ≥ slowMs`(BE 전역, §3.1대로 — 서비스 메타의 임계를 쓰지 않는다는 점을 테스트 주석이 고정). flags 비트 = bit0/1/2 + bit3 emphasis ✅ §3.1과 동일하며 base 점에는 bit3가 없음을 회귀로 고정.

---

## 6. 사전

### 🔴 R1 — route/instance ID가 **프로세스 전역** 시퀀스라 65,534개 소진 후 영구 `__other__`
`LiveSpanDictionary.java:176`(`routeSequence`·`instanceSequence`가 사전 인스턴스 = 프로세스 1개)·`:215-217`.

- 정본 §3.2 사전은 **서비스별**로 구획돼 있다(`"routes": { "<serviceId>": { "17": "GET /orders/{id}" } }`). 즉 ID는 **서비스 안에서만 유일하면 된다**. 구현은 이를 전역 단조 시퀀스로 만들어 희소성을 200배 낭비한다.
- 재현: route는 템플릿 정규식 `^/[a-zA-Z0-9/_.:{}*~-]*$`만 통과하면 되므로 `/orders/12345` 같은 **비템플릿 경로도 유효**하다(계측 품질이 나쁜 앱의 흔한 모습). 서비스당 200개 상한 + 910초 미참조 회수가 맞물리면 sweep 1회(900초)마다 서비스당 최대 200개가 새로 발급된다 → 200서비스면 **sweep 2회(약 30분)에 65,534 소진**. 이후 `sequence.get() > 65535` 분기(`:215`)로 **모든 신규 route·instance가 `__other__`**가 되고, 기존 엔트리도 만료되면 되살아나지 못한다. **재기동 전까지 회복 불가**이며, 계수는 `dictBudget`(예산 초과와 동일 카운터)에 섞여 원인을 알 수 없다.
- 정본 대조: §2.4 "ID 재사용 금지"는 "**링·snapshot·재생 로그가 참조하는 동안**"이라는 조건부다. 서비스 단위로 네임스페이스를 나누면 그 조건을 지키면서도 소진을 실질적으로 제거할 수 있다(한 서비스가 65,534개를 쓰려면 서비스당 상한 200 × sweep 주기상 **수개월**이 필요하고, 그 서비스가 삭제·LRU 퇴출되면 `removeServices`로 클라이언트가 사전을 통째로 버리므로 네임스페이스 재시작이 안전하다).

**수정안**: `routeSequence`/`instanceSequence`를 `LiveSpanDictionary.Service`의 인스턴스 필드로 내리고(`register()`에서 2부터 시작), `remove(service)` 시 함께 폐기. 회귀 2건 추가 — ① 서비스 A·B가 같은 id를 독립으로 발급해도 `copy()`가 서비스별로 분리돼 충돌하지 않는다 ② 한 서비스에서 65,534 소진 시 `__other__`로 접히고 **다른 서비스는 영향 없다**. 아울러 소진 전용 계수(`dictIdExhausted`)를 두어 관측 가능하게 할 것. 정본 §2.4 사전 항목에 "ID 네임스페이스 = 서비스" 한 줄을 추가해야 한다.

### 그 외 사전 확인
- 20 MiB 예산 카운터 ✅ CAS(`charge`)로 등록 전에 선점, LATIN1 1B/비-LATIN1 2B 계수(§2.4대로), `remove`/`expire`에서 감산. churn 회귀(`sustainedChurnRespects...`)가 200서비스 × (route 200 + instance 64)에서 예산 준수·전량 반납을 확인 ✅.
- `__other__` 접기 ✅ route 200 / instance 64 초과, 예산 초과, 서비스 등록 실패 모두 id 1로 귀속하며 **집계는 성공**(회귀 `dictionaryBudgetFallbackDoesNotEnterPartialRejectionCounters`가 스팬 거절 카운터 0을 고정) ✅ §3.3 "표시 축소" 계약과 일치.
- 910초 회수 vs 정본의 참조 카운트: ✅ 안전하다. 창 안 점의 `referencedAt`은 `max(now, endTs) ≥ endTs`이고 그 점이 링에서 반납되는 시각은 `endTs + 901s`이므로 회수 조건(`now − referencedAt > 910s`)은 **9초 이상의 여유**를 두고 뒤에 온다. 참조 카운트보다 단순하면서 과소 회수 방향이라 정본 의도(과거 점이 옛 id를 참조)를 깨지 않는다 → 정본을 구현에 맞춰 갱신 권고.
- 인스턴스 key ✅ `SHA-256(UTF-8 도착 문자열)` 앞 64bit 소문자 hex 16자, 입력은 **Collector 정리 후 BE 도착 값**(`item.resource().get("service.instance.id")`) — §2.4 `[C-r3 반영]`·§3.2와 일치. 고정 벡터 회귀(`"abc" → ba7816bf8f01cfea`)와 "display 8자는 충돌해도 key는 다르다" 회귀 ✅.

---

## 7. 삭제 이벤트

- ✅ `LiveSpanRing.serviceChanged`(AFTER_COMMIT, `fallbackExecution=true`)가 **삭제·숨김** 모두에서 `remove(state)` → 버킷 전량 `clear`(슬롯 반납) + 사전 `remove` + `markRemoved` 를 write lock 아래 수행.
- ✅ 5단계 연결 상태 보존: `removalsAfter(revision)`이 `{revision, resetRequired, removeServices[]}`를 돌려주고, 로그는 `maxServices × 10`으로 유계, 소비 지연은 `resetRequired`로 신호(회귀 `removalLogIsBounded...`).
- ✅ **누락 경로 점검**: `ApmServiceMetadataChanged`를 발행하는 9곳 전부 확인 — `changed(service)`는 이제 `hidden`을 실어 나르고(`ApmService.STATE_HIDDEN`), 삭제는 `deleted=true`, `serviceId == null`인 등록 예고 2곳은 링이 무시한다. 실사용 상태가 ACTIVE·HIDDEN 둘뿐이라(`ApmService:82`) 누락 상태는 없다.
- ✅ 재삽입 차단: 삭제 후 35초 `blocked`(메타 hard expiry 30초 + 배치 deadline 3초보다 김) — 진행 중이던 오래된 배치가 서비스를 되살리지 못한다. IT(`LiveMetadataCacheIT.committedHideClearsRingDictionaryAndRollbackKeepsThem`)가 **commit/rollback 경계까지** 검증한다.
- 🟡 Y7-b: `blocked`가 2,000건을 넘으면 `blockNewUntil`로 **모든 신규 서비스 등록을 35초 전역 차단**한다(`:320`). 35초 안에 삭제·숨김 2,000건이라는 비현실적 조건이고 fail-closed 방향이라 수용하지만, 도달 시 로그 1줄은 필요하다.

---

## 8. 인스턴스 64개 초과 · `instanceBudget`

- ✅ 구현은 **표시 축소**(`__other__` + `Counters.instanceBudget` 증가, 스팬은 정상 집계)로 처리했다. 정본 §2.4("인스턴스 상한 64를 넘으면 `__other__`로 귀속")와 일치한다.
- 🟡 Y8 — **정본이 자기모순**이다: §3.3 "거절 사유 한 벌"은 `instanceBudget`을 **스팬 단위 거절 11종**에 넣어 두었다. 코덱스는 §2.4 쪽으로 해석하고 `LiveSpanRejection.instanceBudget`을 **미사용으로 남겼다** — 판단은 옳다. 다만 미사용 enum이 partialSuccess 계약 표면에 남아 있으면 5단계/FE에서 "언젠가 오는 값"으로 오해된다.
  → **정본 §3.3을 고쳐라**: 스팬 단위 거절은 **10종**, `instanceBudget`은 `dictBudget`과 함께 "표시 축소 계수"로 이동. 코드에서는 enum 상수를 지우거나(수량 보존식에 영향 없음) `@Deprecated` + 주석으로 이력 표기.

---

## 9. 테스트 품질

**신규 실행 42~43건(집계 확인: ring 17 · arena 1 · dict 5 · dedup 9 · rps 6 · 종단 4).** §7.1 4단계 필수 회귀 대조:

| 필수 회귀 | 상태 |
|---|---|
| rps 10통과/11번째 429/burst 20/토큰 독립/미인증 bearer/맵 상한 | ✅ 6종 전부 |
| 전체 관측 count·오류 2축·slow·p95 근사, **표본에서 계산 금지** | ✅ 단위 + 수신 종단 2중 |
| 200서비스 × 1점/s · hot service · 오류 100% · 창 회전 · 세그먼트 고수위 · 마지막 세그먼트까지 상한 준수 | ✅ 전부 |
| 압박 무작위 축소 + `pointsRev` 상승 | ✅ |
| dedup 0/3/6/30/61초·역순·재전송·샤딩 동시성 | ✅ (60초 정확 경계 `WINDOW−1/WINDOW`도 있음) |
| 사전 예산 초과 `__other__`·ID 재사용 금지·인스턴스 key 안정성·churn | ✅ |
| `endTs` 귀속·future/stale 경계 | ✅ (경계 4점 정확) |
| 삭제 이벤트 즉시 비움 | ✅ 단위 + IT |
| 힙 retained 산정 주석 §5.2 대조 | ✅ `LiveSpanRing` 클래스 주석에 MiB 단위로 병기 |
| **누락 ①** reservoir 균등성/편향 | 🟡 Y9 — 없음(변이로 확인, 아래) |
| **누락 ②** 사전 ID 소진(65,534) 거동 | 🟡 R1 관련 — 없음 |
| **누락 ③** 압박 시 "용량 반감 200→100→50" 단계적 감쇠 | 구현 자체가 버킷 축소로 대체 — 정본 문구와 어긋나므로 정본 or 구현 정렬 필요(경미) |
| **누락 ④** 세그먼트 할당 지연이 50ms 락 예산과 충돌하는지 | R3 항목(테스트 아님) — 미측정 |

### 변이 3종 수동 주입 결과 (복원 후 md5 일치 확인 완료)

| 변이 | 결과 |
|---|---|
| ① reservoir → **최신 우선**(`replacement = 0`, 항상 head 덮어쓰기) | 🟡 **미검출 — 전부 green**. 보관 표본이 "처음 199개 + 마지막 1개"가 되는데 아무 테스트도 실패하지 않는다 |
| ② 압박 판정 제거(`pressure = false`) | ✅ 검출 — `pressureShrinksLargestRandomly...`, `globalEmphasisReservationStaysBelowFiftyThousand...` 2건 실패 |
| ③ dedup 키를 **spanId만**으로(해시·비교 동시) | ✅ 검출 — `fullKeyAndHexCaseAreCompared` 실패 |

### 🟡 Y9 — reservoir 균등성 회귀 추가 요망
변이 ①이 통과한다는 것은 "초별 층화 reservoir(균등)"라는 정본 문구가 테스트로 보호되지 않는다는 뜻이다. 값싼 회귀: 고정 시드로 1,000점(spanId 0..999)을 200칸 버킷에 넣고 **보관 spanId의 평균이 400~600**임을 확인(균등≈500, 최신 우선≈103, 최초 우선≈100). 버킷 20개 반복 평균이면 시드 흔들림도 흡수된다.

---

## 10. 재실행·위생

- 선별 재실행(`:test --tests "…collector.ingest.live.*" --tests "…overview.live.spans.*"`): **274건 / 실패 0 / 오류 0 / 18클래스**(`LiveMetadataCacheIT` 포함, JDK17). 코덱스의 전체 3,456 green과 모순 없음. `dropStatsFlush` 플레이크 미발생(범위 밖).
- `git diff --check` ✅ 통과(공백 오류 없음). CRLF 경고는 이 레포의 기존 `core.autocrlf` 설정 때문이며 신규 사안 아님.
- worktree 임시 파일 없음 ✅ (미추적은 전부 `src/` 신규 소스, 그 외는 gitignore된 `build/`·`.gradle/`·`logs/`).
- `BoundedLiveDedupIndex` 삭제 잔여 참조 **없음** ✅ — 유일한 잔재는 🟡 Y11: 테스트 **파일명** `BoundedLiveDedupIndexTest.java`가 그대로다(내용은 `ArenaLiveDedupIndex`를 테스트). `ArenaLiveDedupIndexTest`로 합치거나 개명할 것.
- 🟡 Y13: 공용 픽스처 `LiveIngestTestSupport.ingestor(...)`가 `mock(LiveSpanAdmission.class)`로 바뀌어, 기존 본문·보안 회귀는 `reserve()`가 **null을 반환**하는 데 기대어 통과한다(try-with-resources의 null 허용). 의도는 이해되나 깨지기 쉬우므로 `Mockito.mock(..., RETURNS_SMART_NULLS)` 대신 `when(reserve(any())).thenReturn(() -> {})`를 명시하는 편이 안전하다.

---

## 11. 그 밖의 🟡

- **Y7 — 사유 오분류 2건**: ① `LiveSpanAdmission.reject()`가 링의 `CAPACITY`(서비스 200 상한 초과)를 **`metadataUnavailable`**로 매핑한다(`:34`). 메타 확인 실패가 아니라 자원 상한이므로 운영 오진을 부른다 — 정본에 사유를 추가하거나 최소한 계수를 분리할 것. ② route 값 검사 실패 시 `__unsafe__`로 치환은 하지만 정본 §3.3의 **`unsafeValue` 계수가 없다**.
- **Y10 — 운영 노브가 `application.yml`에 없다**: `rate-limit.*`(3종)·`window-seconds`·`max-points-total`·`dict-budget-mib` 등 `LiveSpanStorageProperties` 전체가 yml에 미기재(기본값은 레코드 생성자). 1단계에서 `max-body-bytes` 등을 주석과 함께 yml에 노출한 관례와 어긋난다. 덧붙여 `arenaSegmentSlots`는 **16,384 외의 값을 거부하면서 실제로는 `LiveSpanArena.SEGMENT_SLOTS` 상수를 쓴다** — 속성을 배선하거나 제거할 것.
- **Y12 — §5.2 기동 검증 미구현·단계 미배정**: "최소 필요량 > `maxMemory()`의 50% → P5만 비활성, 30% 초과 경고"가 어느 단계 행에도 없고 구현도 없다(`max-heap-mib` 프로퍼티 자체가 부재). 5단계 또는 6단계에 배정 필요.

## 12. 🟢로 확인한 것(요약)

락 순서 일관성(registry read → 서비스 id 오름차순 → arena 모니터, 압박 시 tryLock만) · 교착 없음(재진입 read lock은 fair RRWL에서도 writer 대기에 막히지 않음) · 배치 전체 락 선점으로 "부분 집계 후 503" 불가 · 수량 보존식 N=A+D+R 유지(`LiveIngestResult` 컴팩트 생성자) · `offer`가 절대 던지지 않음 · snapshot 복사본이 슬롯 재사용에 오염되지 않음(회귀 있음) · 슬롯 회계 불변식(리스트 길이 == retained) 유지 · P1.5 `LiveBuffer` 무변경 · `enabled` 기본 false 유지 · 5단계 훅 3종(`copyBucket`·`copyDictionary`·`removalsAfter`) 존재.

---

## 13. 수정 라운드 요청 (우선순위)

1. **R1(🔴)** 사전 ID 네임스페이스를 **서비스별**로 — 회귀 2건 + 소진 계수. *(병합 전)*
2. **Y1** rps LRU 포화의 신규 토큰 잠금 완화(예약 슬롯 또는 최소한 전용 계수). *(병합 전 권고)*
3. **Y5** 저장소 초기화 선할당(또는 실패 시 `busy` 계수) — 콜드 스타트 503 `internalError` 제거.
4. **Y9** reservoir 균등성 회귀 1건 추가(변이 ① 검출).
5. **Y8/Y7** `instanceBudget` 미사용 정리 + `CAPACITY` 사유 분리 + `unsafeValue` 계수.
6. **Y2/Y4/Y6** 성능·포화 항목 — 코드 수정은 R3 실측 결과에 맞춰도 되나, **계측 훅과 계수 분리**는 지금 넣을 것.
7. **Y10~Y13** yml 노출·`arena-segment-slots` 배선/제거·테스트 파일명·픽스처 명시화.

## 14. 정본(devdesign_apm-realtime.md)에 반영할 것

1. §2.4 마지막 세그먼트 **7,040 → 7,360**(1,400,000 − 85 × 16,384).
2. §2.4·§5.2 버킷 칸수 **900 → 907**(창은 900초 유지) + 헤더·집계 산술 24.72 → **24.91 MiB**(+0.193), 근거는 "[now−900s, now+5s]의 서로 다른 초 906개".
3. §3.3 스팬 단위 거절 **11 → 10종**, `instanceBudget`을 `dictBudget`과 함께 **표시 축소 계수**로 이동(§2.4와 정합).
4. §2.4 dedup 자료구조를 **공유 슬롯 풀 + 체인 + 샤드별 만료 FIFO(64샤드)**로 교체, 상주 5.49 → **4.12 MiB**, 채택 이유(`reserve(int)`가 키 분포에 무관해짐)를 함께 적을 것.
5. §2.4 사전: 회수 규칙을 **"마지막 관측 후 910초"**로(참조 카운트 폐기, 안전 여유 9초의 근거 포함) + 🔴 **"ID 네임스페이스 = 서비스"** 명시.
6. §2.4·§3.3 압박 진입: 기본 설정에서 **"잔여 3%" 분기는 도달 불가**(예약 합 1.35M < 임계 1.358M)이며 실질 트리거는 계층 예약임을 명시.
7. §2.3/§3.3 rps 프로퍼티 표기를 구현에 맞춰 `app.apm.live.spans.rate-limit.{max-requests-per-second-per-token,burst,max-buckets}`로, 신규 키 시작 토큰이 10(= 1초분)이라는 규칙도 함께.
8. §3.3 요청 단위 503에 `APM_LIVE_DEDUP_FULL`·`APM_LIVE_STORAGE_UNAVAILABLE` 2종 추가(현재는 각각 `busy`·`internalError`에 합류).
9. §5.2 **기동 검증의 구현 단계 배정**(현재 어느 행에도 없음).
10. §7.1 4단계 행에 "4단계 완료 — :test 3,456 green, 검수 🔴1·🟡13" 이력 추가(1~3단계 행과 같은 형식).

---
검수자: Claude (be-engineer 읽기 전용 모드) · 2026-09-16
