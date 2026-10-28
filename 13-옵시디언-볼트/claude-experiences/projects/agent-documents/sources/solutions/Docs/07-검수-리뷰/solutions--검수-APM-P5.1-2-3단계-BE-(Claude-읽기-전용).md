# 검수 — APM P5.1 2·3단계 BE (Claude, 읽기 전용)

- **대상** worktree `C:\solutions\moveseye-be-spring-p5` · 브랜치 `p5-live` · HEAD `56bc0a6` 위 **미커밋 변경**(수정 23 · 신규 17 = 40)
- **구현 보고** `_workspace/reviews/review_apm-p51-s23-be_codex-impl.md` (코덱스 gpt-6-astra)
- **정본** `_workspace/designs/devdesign_apm-realtime.md` v4.1 §2.3 · §2.3.0 · §2.3.1 · §3.3 · §7.1
- **검수 일자** 2026-09-15 · **코드 수정 없음**(변이 검증 3건은 적용 후 md5 일치 복원 확인)

## 판정 요약

| 등급 | 건수 |
|---|---:|
| 🔴 | **2** |
| 🟡 | **9** |
| 🟢 | 12 |

**병합 가능 여부: 조건부 가능.** 🔴 2건(R1·R2)을 수정 라운드로 처리한 뒤 병합을 권고한다.
두 건 모두 **판정 로직이 아니라 새로 생긴 실패 모드**이고 수정 범위가 각각 파일 1개다.
🔴 중 어느 것도 "라이선스 판정 동작이 바뀌었다"에 해당하지 않는다 — 아래 §1에서 별도로 확정한다.

## 재실행한 테스트 (내가 직접 돌린 수치)

`JAVA_HOME=C:/Program Files/Java/jdk-17` · `./gradlew.bat :test --tests ...` 선별.

| 범위 | 결과 |
|---|---|
| live + license + token + service 패키지 | **489 통과 / 실패·오류·스킵 0** (2분 09초) |
| 그중 live 패키지 | **220** (parser 72 · controller 49 · failure 18 · ingestor 18 · properties 11 · socket 9 · securityChain 7 · **MetadataCacheIT 13** · MetadataCacheTest 12 · dedup 5 · concurrency 4 · gate 2) |
| license 패키지 | ControllerIT 19 · GateIT 18 · SignedKeyProvider 15 · ServiceIT 12 · KeyVerifier 11 · GuardedPort 8 · **Architecture 7** · **Contract 4** · **LiveLicenseFreshness 5(신규)** |
| token · service/list · registry | ReceiveTokenService 17 · RegistryService 7 · ServiceDelete 2+3 · ServiceDetailAlertRules 2 |
| `git diff --check` | 통과 |
| worktree 임시 파일 | 없음 — 변경 항목 40개가 검수 전후 동일 |

🟢 **`LiveMetadataCacheIT`가 스킵되지 않고 13건 실행됐다**(`@EnabledIf("testDatabaseAvailable")`). 3단계의 핵심 계약(AFTER_COMMIT·rollback·hot path SQL 0)이 실제 DB·실제 트랜잭션으로 검증됐다는 뜻이다.
🟢 **`LicenseContractTest` 4건 · `LicenseArchitectureTest` 7건 green** — 발급 도구와의 상수 4파일 동일 사본 계약, A1~A5 아키텍처 규칙 불변.

---

## 1. 공유 라이선스 코드 변경 — 판정은 불변, 실패 모드가 신설됐다

### 🟢 판정 동작 불변 (요구된 1순위 확인)

`SignedKeyLicenseProvider.resolveState(payload)`(`:139-172`)와 `daysRemaining`(`:178-184`)는
`LocalDateTime.now()` → `LocalDateTime.now(clock)` 치환을 뺀 **바이트 단위 동일**이다.
`clock`의 프로덕션 주입값은 `Clock.systemDefaultZone()`(`:64`)이라 기존과 같은 시간·같은 존을 본다.

- **M8 단계적 차단(EXPIRING→GRACE→EXPIRED→ARCHIVED) 순서·경계 불변** — `graceEnd = expiresAt + graceDays`, `archiveStart = graceEnd + LIVE_QUERY_AFTER_GRACE_DAYS` 산식 그대로.
- **`graceDays`·`expiresAt` 키 정본 원칙 불변** — DB 컬럼은 여전히 판정에 쓰이지 않는다(`compute()`는 `licenseKey` 한 줄만 읽는다).
- **P18(라이선스는 인증 뒤)·`LicenseStatus` 필드 구성 불변**.
- 검증: `LicenseContractTest`(4) · `LicenseGateIT`(18) · `LicenseControllerIT`(19) · `LicenseGuardedPortTest`(8) · `LicenseArchitectureTest`(7) 전부 green.

### 🟢 성능 — 매 요청 서명 검증이 아니다

`compute()`(= `findByActiveTrue()` + `verifier.parse()` RSA 검증)는 여전히 **60초에 1회**다.
캐시에 담는 대상이 `LicenseStatus`(완성된 판정)에서 `CachedPayload`(검증된 서명 내용)로 바뀌었을 뿐,
매 요청에 하는 것은 서명 검증이 아니라 **검증된 클레임 위의 시각 비교**다. 방향은 맞다.

### 🔴 R2 — `current()`가 unchecked 예외를 던진다 (신규 실패 모드)

**파일** `license/provider/SignedKeyLicenseProvider.java:72-88`

두 경로가 `IllegalStateException`을 던진다.

```java
synchronized (this) {
    if (version != generation) throw new IllegalStateException("라이선스 갱신 중 상태 변경");   // (a) :80
    cache = snapshot;
}
...
if (monotonic.getAsLong() - snapshot.loadedAtNanos() >= CACHE_TTL.toNanos())
    throw new IllegalStateException("라이선스 검증 freshness 초과");                            // (b) :85
```

- **(a) generation 경합** — 어떤 스레드가 `compute()` 중일 때 `refresh()`가 끼어들면(`LicenseController:89`·`:105`의 등록·해지, 또는 신규 `changed(LicenseChanged)` AFTER_COMMIT 리스너) **조회하던 요청이 통째로 예외로 끝난다.**
- **(b) freshness 초과** — `compute()`가 60초를 넘기면 성공적으로 얻은 결과를 쓰지 못하고 예외.

**왜 문제인가.** `current()`는 `FeatureInterceptor`·`AccessModeInterceptor`가 **모든 요청**에서 부르는 공유 게이트다.
변경 전에는 어떤 경로로도 던지지 않았다(실패는 전부 `LicenseStatus.locked(...)`로 표현). 이제는 전역 예외 핸들러로 빠져 **HTTP 500**이 난다 —
라이선스 잠금 화면도, 403도 아니고 그냥 서버 오류다. 등록·해지는 드물지만, 이건 관리자 한 명의 라이선스 등록이
**다른 사용자의 요청을 500으로 만들 수 있다**는 뜻이고, 신규 `changed()` 리스너가 붙으면서 `refresh()` 호출 빈도가 2배가 됐다
(컨트롤러 직접 호출 + AFTER_COMMIT 리스너).

이 동작은 `LiveLicenseFreshnessTest.loadTimeCountsTowardFreshnessAndExpiredFailureCannotExtendIt`(:63)과
`refreshDuringLoadCannotPublishTheOldSignedKey`(:74)가 **의도적으로 어서션**하고 있다 — 실수가 아니라 선택이다.
그러나 "오래된 판정을 쓰지 않는다"(fail-closed)는 목표는 **예외 없이도** 달성된다.

**재현**
```
스레드 A: current() → 캐시 만료 → refreshLock 획득 → compute() 진입(DB 조회 중)
스레드 B: 관리자가 POST /license → LicenseService.register() 커밋
          → AFTER_COMMIT changed() → refresh() → generation++
스레드 A: compute() 반환 → version != generation → IllegalStateException → 500
```
(위 테스트 `refreshDuringLoadCannotPublishTheOldSignedKey`가 정확히 이 순서를 재현한다.)

**수정안** — 던지지 말고 다시 계산하거나 잠금 상태로 접는다.

```java
@Override
public LicenseStatus current() {
    for (int attempt = 0; attempt < 3; attempt++) {
        CachedPayload snapshot = cache;
        if (snapshot != null && monotonic.getAsLong() - snapshot.loadedAtNanos() < CACHE_TTL.toNanos())
            return render(snapshot);
        synchronized (refreshLock) {
            snapshot = cache;
            if (snapshot != null && monotonic.getAsLong() - snapshot.loadedAtNanos() < CACHE_TTL.toNanos())
                return render(snapshot);
            long version;
            synchronized (this) { version = generation; }
            CachedPayload computed = compute();
            // freshness를 못 지켰거나 갱신이 끼어들었으면 캐시에 넣지 않고 재시도한다.
            if (monotonic.getAsLong() - computed.loadedAtNanos() >= CACHE_TTL.toNanos()) continue;
            synchronized (this) {
                if (version != generation) continue;   // throw 하지 않는다
                cache = computed;
            }
            return render(computed);
        }
    }
    // 3회 재시도 동안 계속 경합·지연 — 판정 불가로 접는다(500이 아니라 기존 잠금 UX).
    log.warn("라이선스 판정 갱신이 반복 실패했습니다 — 잠금으로 처리합니다");
    return LicenseStatus.locked(LicenseState.INVALID);
}

private LicenseStatus render(CachedPayload snapshot) {
    if (snapshot.payload() == null) return LicenseStatus.locked(snapshot.failure());
    LicenseKeyPayload p = snapshot.payload();
    return new LicenseStatus(resolveState(p), p.licenseType(), p.edition(), p.effectiveFeatures(),
            p.customer(), p.expiresAt(), daysRemaining(p.expiresAt()));
}
```
동반 수정: `LiveLicenseFreshnessTest:63`·`:74`의 `assertThatThrownBy(...)`를
"`LicenseState.INVALID`로 접힌다 / 새 값으로 다시 계산된다"로 바꾼다(검증 의도는 유지).
`continue`가 `synchronized` 블록 안에서 바깥 루프로 나가는 형태라 락 해제 후 재진입한다 — 의도한 대로다.

### 🟡 Y1 — 정본 차이: 타이머 → 매 요청 재계산 (수용, 정본 문구 갱신 필요)

정본 §2.3.1 "라이선스 단일 freshness" 행은 *"다음 전이 시각을 계산해 **타이머**로 반영"*이라고 적혀 있다.
구현은 타이머 없이 **매 요청 `resolveState()` 재계산**이다. 결과는 타이머보다 **엄격**하다(전이 지연 0, 스케줄러 없음, 드리프트 없음).
`LiveLicenseFreshnessTest.signedExpiryTransitionDoesNotWaitForFreshnessTtl`(:46)·`gracePolicyRemainsOpenUntilItsSignedBoundary`(:55)가
`findByActiveTrue()` 1회만으로 EXPIRING→EXPIRED, GRACE→EXPIRED 전이를 증명한다.

→ **구현을 되돌리지 말고 정본 §2.3.1의 "타이머" 문구를 "매 요청 재계산"으로 고칠 것**을 권고한다.

### 🟡 Y2 — `current()`가 매 요청 객체를 새로 만든다

`LicenseKeyPayload.effectiveFeatures()`(`crypto/LicenseKeyPayload.java:44-48`)는 호출마다
`LinkedHashSet` 생성 + `addAll` + `unmodifiableSet` 래핑을 한다. 여기에 `LicenseStatus` 레코드,
`LocalDateTime.now(clock)` **2회**(`resolveState`·`daysRemaining`), `ChronoUnit.DAYS.between`이 더해진다.
변경 전에는 60초에 1번이던 것이 이제 **모든 HTTP 요청마다**다(인터셉터 2개가 부른다).

절대 비용은 마이크로초 단위라 지금 당장 문제는 아니지만, 게이트 특성상 가장 뜨거운 코드다.
**수정안**: 시간에 무관한 부분을 `CachedPayload` 생성 시 1회만 만들어 두고, 매 요청에는 `state`와 `daysRemaining`만 다시 계산한다.
```java
private record CachedPayload(LicenseKeyPayload payload, Set<Feature> features,
                             LicenseState failure, long loadedAtNanos) {}
// features = payload == null ? Set.of() : payload.effectiveFeatures();  // compute()에서 1회
```

### 🟡 Y7 — `LicenseArchitectureTest` 규칙이 완화됐다

`LicenseArchitectureTest.java:256-266`에 `ApmOtlpLiveController` 예외 분기가 추가됐다.
컨트롤러가 `LicenseProvider`를 직접 잡지 않고 `LiveMetadataCache.licensed()`를 거치게 됐기 때문인데,
완화 자체는 **충분히 좁게 짜였다** — 특정 FQN 1개 · 특정 메서드명 `licensed` · 그 메서드가 `current()`와
`LicenseStatus.allows`를 **둘 다** 부르는지까지 확인한다. 임의 위임은 여전히 막힌다.

다만 아키텍처 가드가 완화된 사실은 병합 리뷰어가 알아야 하므로 커밋 메시지에 명시할 것.
규칙이 하드코딩 FQN 문자열에 묶여 있으므로, 컨트롤러를 다른 패키지로 옮기거나 `licensed()`를 rename하면
예외 분기가 매칭되지 않는다 — 그 경우 일반 경로로 떨어져 테스트가 실패할 것으로 읽히나 **직접 돌려 확인하지는 않았다**.
🟢로 봐도 되는 수준이나 기록은 남긴다.

---

## 2. 수량 보존식 `N = A + D + R`

### 🟢 보존식 자체는 구조적으로 강제된다

`LiveIngestResult`(`:9-16`)가 **레코드 컴팩트 생성자에서** `input != accepted + duplicated + Σreasons`를 검사하고
위반 시 `IllegalArgumentException`을 던진다. 즉 이 타입을 만들 수 있으면 보존식은 참이다.
`LiveSpanIngestor.ingest`(`:22-77`)의 루프도 스팬마다 정확히 한 갈래(accepted / duplicated / rejected)로만 빠진다.

경로별 확인 (전부 테스트 존재):

| 경로 | 처리 | 근거 |
|---|---|---|
| 파서 부분 실패(필수 필드 결손·ID 형식) | 스팬 단위 `malformed` | `LiveSpanParser:141-144` · `LiveSpanParserTest.idsMustHaveExactHexLengthWithoutTruncation`(24 조합) |
| 시간 역전 | 스팬 단위 `timeReversed` | 같은 곳 · `LiveSpanIngestorTest.wholeBatchSpanRejectionsRemainPartialSuccess("reversed")` |
| batchOverflow | `input - spans.size()`를 한 번에 계상 | `LiveSpanIngestor:25-27` · `boundaryConservesEverySpan(999/1000/1001)` |
| 모집단 밖(kind≠SERVER · method 없음) | `outsidePopulation` | `:36-37` · 같은 테스트 "kind"/"method" |
| 미등록·PENDING·HIDDEN·REJECTED | `serviceUnknown`/`servicePending`/`serviceHidden` | `:47-52` · `serviceStatesAreSpanRejections`(4 상태) |
| 메타 미확인 | `metadataUnavailable`, **그 서비스만** | `:47` · `metadataMissAffectsOnlyItsServiceAndDoesNotReserveDedup` |
| 중복 혼합 | `duplicated`, rejected 불포함 | `:68` · `mixedNewDuplicateAndRejection`(1 신규 + 1 중복 + 1 거절) |

### 🟢 `rejectedSpans = R`에 중복·표시 축소가 섞이지 않는다

- `LiveIngestResult.rejected()`(`:18`)는 `reasons` 합만 돌려준다. `duplicated`는 별도 필드.
- `LiveSpanRejection` enum(`:4-8`) 주석이 *"중복·표시 축소·표본 탈락은 여기에 없다"*를 명시하고, 실제로 그런 상수가 없다.
- 표본 탈락이 섞이지 않는지를 `samplingLossCannotBecomeARejection`(:100)이 직접 증명한다 — `admission.aggregate`가 1,000건 중 200건만 보존해도 `accepted=1000, rejected=0`.
- `duplicateOnlyIsIdempotentSuccess`(:55): 1,000건 전량 중복 → `rejected=0`, `errorMessage=""`, HTTP 200.

### 🟢 `errorMessage`에 원문이 없다

`LiveIngestResult.errorMessage()`(`:20-25`)는 `LiveSpanRejection.name()`(고정 enum 문자열)과 정수만 조립하고 256자로 절단한다.
속성값·토큰·서비스명·PII가 들어갈 경로가 문법적으로 없다. `summaryIsBoundedAndContainsOnlyReasonsAndCounts`(:126)가 11개 사유 전부를 100,000으로 채워 256자 상한을 검증한다.
정본 §2.3 예시 문자열 `"Rejected 12 spans: metadataUnavailable=10, servicePending=2"`와 형식이 일치한다(`mixedNewDuplicateAndRejection:49`가 문자열 동등 비교).

### 🟢 "1,001번째 배치 전체 413" → "부분 거절 batchOverflow" 전환은 **정본이 맞다** (요청한 판정)

**정본은 partialSuccess 쪽이다.** 근거 3곳이 일치한다.

1. §2.3.0 "스팬 수" 행: *"초과분은 413이 아니라 partialSuccess(`batchOverflow` 거절 사유)"*
2. §2.3 "400 JSON" 행: *"초과는 배치 전체 413이 아니라 초과분 partialSuccess(`batchOverflow`)"*
3. §7.1 **2단계** 행 구현 범위: *"1,000스팬 수용 규칙(초과분 partialSuccess `batchOverflow`)"* · 회귀 *"999/1,000/1,001"*

1단계 코드의 413은 스스로 *"이번 작업 지시의 413 관문. **2단계에서 초과분 부분 수용 규칙으로 교체한다**"*라고 주석에 적어 둔 **의도된 임시물**이었고(구 `LiveSpanParser:scopes`), 이번 교체가 그 예고를 이행한 것이다.
→ **전환 타당. 추가 조치 없음.**

부수 효과도 올바르다: 초과분을 `skipChildren()`으로 계속 읽어 **JSON·UTF-8 검증을 끝까지 수행**한 뒤 센다(`LiveSpanParser:104-106`).
덕분에 "1,001번째 뒤에 깨진 JSON"이 조용히 200으로 나가지 않는다 — `invalidJsonTailDoesNotPartiallyApplyDedupOrCounters`(:119)가
배치 전체 구문 검증 전에는 dedup·카운터가 움직이지 않음을 증명한다(`LiveSpanIngestor:23` 주석과 일치).

### 🟢 바이트 상한 경계 회귀는 1단계에서 이미 갖춰져 있다

§7.1 2단계가 요구한 "직전·동일·초과"는 `ApmOtlpLiveControllerTest:140-176`의 파라미터화 테스트가
해제 후·압축본 **양쪽**에 대해 `maxBodyBytes ± offset` / `maxCompressedBytes ± offset`으로 덮고 있고,
Content-Length 없음·거짓 값(`:159-169`), 저압축 배치 수용(`:282-294` — 512 KiB 초과·2 MiB 미만 gzip이 200), 고압축 폭탄 해제 중 413(`:233-237`)도 있다.
`ApmLiveSpansPropertiesTest`가 기본값 2,097,152 ×2와 상한 초과 바인딩 거부를 확인한다. **2단계 회귀 목록 누락 없음.**

### 🟡 Y4 — dedup 포화 503이 배치 **중간**에 터져 보존식이 아예 보고되지 않는다

**파일** `BoundedLiveDedupIndex.java:36-37`

```java
if (entries.size() >= capacity) throw new LiveIngestException(503, "APM_LIVE_DEDUP_FULL",
        LiveIngestCounters.Reason.busy);
```

이 예외는 `LiveSpanIngestor`의 스팬 루프 **한가운데**서 던져진다. 그 시점까지의 스팬들은 이미
`admission.aggregate()`가 돌았고 `counters.accept()`도 올라갔으며 dedup 엔트리도 들어갔는데,
클라이언트는 `LiveIngestResult` 없이 **503만** 받는다. 즉 그 배치에 대해서는 `N = A + D + R`이 산출조차 되지 않고,
BE 카운터(정본 판정 기준)와 클라이언트 인식이 어긋난다.

정본 §2.3 "503의 정의"가 *"공통 처리 자원 불능"*을 503으로 규정하므로 **상태 코드는 맞다.** 문제는 **시점**이다.

실제 발생 확률은 낮다 — 300,000 엔트리는 5,000스팬/초 × 60초 기준이고, dedup에 도달하는 것은 모집단 통과분(실측 SERVER 비율 11.6%)뿐이라 ≈600/초 → 36,000 엔트리, **8배 여유**다. 그래도 4단계 arena 통합 전에 정리해 두는 편이 싸다.

**수정안** — 배치 시작 전에 용량을 선검사해 "0건 집계 상태"에서만 503을 낸다.
```java
// LiveDedupIndex에 추가
/** 이 배치가 최악의 경우 필요로 하는 슬롯을 확보할 수 없으면 집계 전에 거절한다. */
void reserve(int spans);   // BoundedLiveDedupIndex: synchronized, 만료 정리 후 capacity - size() < spans 이면 throw

// LiveSpanIngestor.ingest — parse 직후, 루프 이전
dedup.reserve(batch.spans().size());
```
이렇게 하면 503이 항상 "아무것도 집계하지 않았다"와 짝이 되어 카운터가 어긋나지 않는다.

---

## 3. dedup — `BoundedLiveDedupIndex`

### 🟢 60초 창·전체 키 비교

- `WINDOW = 60s`(`:17`), 만료 판정 `now - loadedAt < WINDOW`.
- 키는 `(traceHigh, traceLow, span)` = **128bit traceId 전체 + 64bit spanId 전체**(`:18`, `:33-34`). 정본 §3.3 "전체 키 비교" 충족.
- hex 대소문자는 `Long.parseUnsignedLong(...,16)`이 흡수해 **같은 ID로 취급**된다 — 의미상 옳고, `fullKeyAndHexCaseAreCompared`(:13)가 의도적으로 고정한다.
- `exactSixtySecondWindowDoesNotSlideOnDuplicates`(:19): 중복 확인이 만료 시각을 **밀지 않는다**(`entries.put`은 신규 수용에만). 창이 무한 연장되지 않는다.

### 🟢 만료 정리 비용

`entries`는 `LinkedHashMap`을 **기본(삽입 순서)**으로 쓰고 수용 시에만 append하므로 **삽입 순서 = 시간 순서**다.
따라서 `:28-32`의 선두 스윕은 첫 미만료 항목에서 `break`하고, 삽입당 상각 O(1)이다. 정확하고 싸다.
(`accessOrder=true`였다면 순서가 깨졌을 것 — 여기서는 쓰지 않았다. 반면 `LiveMetadataCache:36`은 LRU가 필요해 `true`를 쓴다. 둘의 구분이 올바르다.)

### 🟢 메모리 예산 64 MiB의 근거

실제 산술: 300,000 × (`LinkedHashMap.Entry` ≈ 48B + `Key` 레코드 40B + 박싱 `Long` 16B) ≈ **31 MB**,
여기에 해시 테이블 배열(512K 슬롯 × 4B 압축 oops) 2 MB → **≈ 33 MB**. 주석의 64 MiB는 약 2배 보수적이다. 타당.
4단계에서 primitive open-addressing으로 바꾸면 절반 이하로 줄일 수 있다(코덱스도 R3 대상으로 명시).

### 🟡 Y10 — 전역 `synchronized`가 4단계에서 집계를 직렬화한다

`ingest(...)`(`:26`)가 **인덱스 전역 락 안에서 `aggregate.getAsBoolean()`을 호출**한다.
지금은 `aggregate`가 카운터 증가뿐이라 처리량 영향이 없다 — 1,000스팬 배치 × 600스팬/초면
락 점유는 해시 조회·삽입 ≈ 100 ns 수준이라 코어의 0.01% 미만이다. **현 단계에서는 문제 없다.**

그러나 이 배치는 의도적 설계다(`LiveDedupIndex:3` — *"실패한 집계를 중복 성공으로 만들지 않도록 작업도 원자 구간에 둔다"*).
4단계에서 `aggregate`가 실제 버킷 집계·표본·arena 할당을 하게 되면 **그 전부가 전역 단일 락 아래로 들어간다**.
정본 §7.1 4단계는 *"**서비스별 락**"*을 요구하므로, 그때 반드시 **키 샤딩(서비스별 또는 traceId 해시 기준 스트라이프)**으로 쪼개야 한다.

→ 지금 고칠 것은 없고, **4단계 착수 메모로 남긴다.** `LiveDedupIndex` 인터페이스(`ingest(traceId, spanId, BooleanSupplier)`)는
원자성 경계를 구현체 안에 숨겨 두었으므로 샤딩 교체 시 호출부(`LiveSpanIngestor:58`)를 건드리지 않아도 된다 — **교체 인터페이스로서 적절하다.** 🟢

### 🟢 실패·거절의 재시도 가능성

`aggregate`가 예외를 던지거나 `false`를 반환하면 키를 넣지 않는다(`:38-39`) → 다음 배치에서 다시 시도된다.
`failedOrRejectedAggregationCanBeRetried`(:37)가 세 경우(예외 / false / true)를 순서대로 확인한다.
`concurrentDuplicatesAggregateExactlyOnce`(:44)가 8스레드 64요청에서 `aggregate` 정확히 1회를 증명한다.

---

## 4. 메타 캐시 — `LiveMetadataCache`

### 🟢 무효화 경로 12개 전수 — **누락 없음**

정본 §2.3.1 "무효화 경로 전수" 행과 1:1 대조했다.

| # | 정본 경로 | 발행 지점 | IT 검증 |
|---|---|---|---|
| 1 | 토큰 회수 | `ApmReceiveTokenService:317` (+ 이미 회수된 경우 `:314`) | `tokenRevocationHonorsCommitAndRollback...` |
| 2 | 서비스 승인 | `ApmRegistryService:134` | `pendingCreationApprovalRejectionAndReregistrationInvalidate` |
| 3 | 승인 대기 거절 | `ApmRegistryService:160` | 같은 테스트 |
| 4 | 서비스 삭제 | `ApmServiceQueryService:519` | `automaticHideReactivationAndDeleteInvalidate` |
| 5 | 표시명 변경 | `ApmServiceQueryService:467` | `eachLiveSettingInvalidatesCommittedValue("display")` |
| 6 | 숨김 | 〃 | `("hide")` |
| 7 | 복원 | 〃 | `("restore")` |
| 8 | 느림 임계 | 〃 | `("slow")` |
| 9 | 자동 숨김 | `ApmRetentionService:352` | `automaticHideReactivationAndDelete...` |
| 10 | 자동 재활성화 | `ApmRegistryWriter:157` (`wasHidden`일 때만) | 〃 |
| 11 | 자동 등록 | `ApmRegistryWriter:90` | `automaticRegistrationInvalidatesNegativeCache` |
| 12 | 라이선스 | `LicenseService:83`·`:101` → `SignedKeyLicenseProvider.changed()` | `licenseServiceChangesAreAppliedOnlyAfterCommit` |

**가산**: `createPending`(`ApmRegistryWriter:139`) — 정본 표에 없지만 PENDING 음성 캐시를 뒤집는 데 필요하다. 올바른 추가.

🟢 **`ApmServiceQueryService.update`의 발행 조건**(`:465-466`)이 `displayName | hidden | slowThresholdMs`가 바뀐 경우로 한정돼
정본의 *"실시간 표시·집계에 영향 있는 변경만 골라 이벤트"*를 그대로 구현했다. 나머지 필드 수정으로 캐시를 무효화하지 않는다.

🟢 **`touchService`의 `wasHidden` 가드**(`ApmRegistryWriter:155`)가 정상 수신마다 이벤트를 쏟지 않게 막는다 — 수신 경로 핫패스라 중요하다.

### 🟢 AFTER_COMMIT이 실제로 걸린다 (요구한 5번 항목)

발행 지점 전부가 `@Transactional` 메서드 **안**이다. 확인한 어노테이션 위치:

| 클래스 | 메서드 어노테이션 | 발행 행 |
|---|---|---|
| `ApmReceiveTokenService` | `:212` `@Transactional`(issue) · `:308` `@Transactional`(revoke) | 235 · 314/317 |
| `ApmRegistryService` | `:102`(approve) · `:154`(reject) | 134 · 160 |
| `ApmRetentionService` | `:309` | 352 |
| `ApmServiceQueryService` | `:452`(update) · `:505`(delete) | 467 · 519 |
| `ApmRegistryWriter` | `:74`·`:128`·`:154` — 전부 `REQUIRES_NEW` | 90 · 139 · 157 |
| `LicenseService` | 클래스 `@Transactional` | 83 · 101 |

`ApmRegistryWriter`의 `REQUIRES_NEW`는 **내부 트랜잭션이 독립 커밋**하므로 그 시점에 리스너가 도는 것이 맞다(수신 경로가 바깥 트랜잭션 없이도 등록을 확정하려는 기존 의도와 일치).

**런타임 증명이 있다**:
- `rollbackPreservesCacheAndCommitInvalidatesAfterTransaction`(IT:118) — 실제 `TransactionTemplate`으로 롤백/커밋을 나눠 확인.
- `licenseServiceChangesAreAppliedOnlyAfterCommit`(IT:163) — 롤백된 해지가 `licensed()`를 바꾸지 않음.
- `nonTransactionalEventsUseFallback`(IT:184) — `fallbackExecution = true` 경로.
- **변이 검증**: `@TransactionalEventListener(AFTER_COMMIT)` → `@EventListener`로 바꾸자 IT 3건이 즉시 실패했다(아래 §7).

### 🟢 나머지 설계 항목

- **soft 20초 / hard 30초**(`:26-27`) — `get()`(`:70-93`)이 `age < SOFT` 즉시 반환 → soft~hard는 **기존 값 반환 + 비동기 갱신 시작** → hard 이후에만 대기·거절. 정본 "갱신 3단" 그대로.
- **TTL 경계 반복 거절 없음** — `repeatedTtlBoundariesNeverRejectWarmHealthyService`(:59)가 **1,500초를 1초씩** 전진시키며 단 한 번도 null이 나오지 않음을 확인. 정본이 v1에서 폐기한 "30초마다 1초분 손실" 구조가 재발하지 않았다는 직접 증거다.
- **single-flight** — `refresh()`(`:102-103`)가 `entry.flight != null`이면 같은 future를 돌려준다. `missSingleFlightAndHotPathUseNoSource`(:31)가 1,000회 호출에 큐 작업 1개만 생김을 확인.
- **generation 역전 방지** — `:113`이 `entries.get(key) == entry && entry.generation == generation` **두 조건**을 함께 본다(객체 정체성 + 세대). `invalidationDuringOldRefreshCannotResurrectService`(:83)와 `evictedInFlightEntryCannotOverwriteRecreatedKey`(:174)가 각각 무효화 경합과 LRU 퇴출 경합을 덮는다 — **두 축을 나눠 검증한 점이 좋다.**
- **음성 캐시** — ABSENT 토큰·ABSENT 서비스도 항목으로 담긴다. `negativeCacheIsBoundedAndEvictionDoesNotResurrectOldEntries`(:120) 확인.
- **REVOKED 보존** — `:77-78`이 만료 검사보다 **먼저** 단락해 회수 상태가 DB 장애·TTL 경계에서도 유지된다. 회수 API에 복원이 없으므로 안전한 단락이다. `revokedStateWinsOverOldTokenRefreshAndOutlivesDatabaseFailure`(:98)가 `10 × HARD` 경과 후에도 REVOKED임을 확인.
- **외부 회수 30초 반영** — `externalRevocationIsAppliedByThirtySeconds`(:111).
- **hot path SQL 0** — 🟢 **가장 강한 테스트다.** `warmLiveEndpointHasZeroSqlQueriesAndNeverTouchesLastSeen`(IT:190)이 Hibernate `Statistics.getPrepareStatementCount()`를 **실제로 카운트**해 100회 호출에 증가분 0을 어서션한다. 추정이 아니라 실측이다. 덧붙여 `apm_receive_token.last_seen_at`이 **NULL로 남는 것**까지 확인해 "라이브는 등록·last-seen을 하지 않는다"(§2.3.1)를 증명한다.
- **저장 경로 불변** — `/apm/otlp/**`를 다루는 `ApmOtlpController`는 이번 diff에 없다. `ApmIngestTokenPolicy`의 유일한 변경은 `bearer()`의 `private` → `public`(`:32`)이고 로직은 동일. 🟢

### 🟢 상한 초과 시 거동 = 거절(통과 아님)

- **갱신 큐 1,000 초과** → `ThreadPoolExecutor.AbortPolicy` → `RejectedExecutionException` → `:123-124`가 `flight`를 되돌리고 future를 실패시킨다 → `get()`은 miss면 즉시 null, hard 이후면 `flight.get`이 `ExecutionException`으로 null. **fail-closed.** `fullRefreshQueueFailsClosedWithoutSourceCall`(:130)이 `verifyNoInteractions(source)`까지 확인.
- **DB 동시성 4** — `productionExecutorBoundsDatabaseConcurrencyAndQueue`(:147)가 실제 `ThreadPoolExecutor`를 리플렉션으로 꺼내 동시 실행 최대 4, 큐 정확히 1,000을 확인한다.
- **LRU 10,000 초과** → 최소 사용 항목 퇴출(`:98`), 퇴출된 in-flight의 결과는 정체성 검사로 폐기.

### 🔴 R1 — 배치 내 hard 만료 서비스마다 3초씩 대기가 누적된다

**파일** `LiveSpanIngestor.java:45` × `LiveMetadataCache.java:85`

```java
// LiveSpanIngestor:45 — 배치 루프 안, 고유 서비스마다 1회
if (!services.containsKey(key)) services.put(key, metadata.service(key.name(), key.env()));

// LiveMetadataCache:85 — hard 만료 항목은 여기서 블로킹
try { flight.get(3, TimeUnit.SECONDS); }
```

배치 내 **서로 다른** 서비스가 전부 hard 만료 상태면 대기가 직렬로 쌓인다: **(고유 서비스 수) × 3초**.
전체 배치에 대한 상한 deadline이 없다.

**왜 현실적인가.**
1. 정본 §2.3.0 실측표가 **"그룹 = 스팬 수 = 1,000"을 물리적 최악으로 명시**한다 — batch 프로세서는 서로 다른 업스트림 요청의 resource를 병합하지 않으므로, 여러 앱을 받는 Collector 하나가 **1,000개 서로 다른 서비스**를 한 배치에 담을 수 있다.
2. hard 만료가 동시 다발하는 시나리오가 바로 **DB 열화**다 — 그리고 hard expiry 정책 자체가 DB 장애를 대비해 만든 것이다. DB가 느려지면 30초 안에 모든 warm 항목이 hard를 넘기고, 이후 **모든 배치**가 이 경로를 탄다.
3. 대기는 `reader.read(...)` 콜백 **안**에서 일어난다 → **admission 세마포어 4슬롯을 점유한 채** 블로킹한다. 4개 배치만 이 상태에 빠지면 **라이브 수신 전체가 정지**하고, 이후 요청은 503 busy가 된다.

읽기 타임아웃 3초(`readTimeoutMs`)는 **본문 읽기**에만 적용되므로 이 대기를 끊지 못한다.

**재현(단위)**
```java
// LiveMetadataCacheTest 스타일 — executor를 막아 두고 서로 다른 서비스 50개짜리 배치를 보낸다
var blocked = new LiveMetadataCache(source, hashes, licenses, task -> { /* 실행하지 않음 */ }, now::get);
// 50개 서비스를 warm → now.set(HARD) → ingest(서비스 50개 × 20스팬)
// 관측: ingest 반환까지 ≈ 50 × 3s = 150s (현재) / 기대: 전체 3s 이내에 metadataUnavailable 거절
```

**수정안** — 배치 전체에 **하나의 deadline**을 준다.

```java
// LiveMetadataCache — 만료 기한을 받는 오버로드 추가
public LiveMetadataSource.Service service(String name, String env, long deadlineNanos) { ... }
// get() 내부: flight.get(3s) 대신
long remaining = deadlineNanos - clock.getAsLong();
if (remaining <= 0) return null;                       // 더 기다리지 않고 metadataUnavailable
try { flight.get(remaining, TimeUnit.NANOSECONDS); } ...

// LiveSpanIngestor.ingest — 배치 진입 시 1회 계산
long deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
... metadata.service(key.name(), key.env(), deadline)
```
이러면 최악이 **배치당 3초**로 고정되고, 기한을 넘긴 서비스는 즉시 `metadataUnavailable`로 부분 거절된다 —
정본 §2.3.1의 *"hard expiry 뒤 갱신 실패 항목은 거절"*·*"서비스별 메타 미확인은 그 부분만 partialSuccess"*와 정확히 일치한다.
토큰 조회(`ApmOtlpLiveController:32`)는 요청당 1회라 현행 3초 유지로 충분하다.

**회귀 테스트 제안**: 서로 다른 서비스 N개가 전부 hard 만료인 배치가 **3초 안에** 반환하고 `rejectedSpans = N × 스팬수`가 되는지.

### 🟡 Y5 — 음성 캐시 + LRU가 permitAll 경로에서 오염 가능하고, 429 제한이 어느 단계에도 배정돼 있지 않다

`/apm/otlp-live/**`는 `permitAll`이고, 컨트롤러는 **토큰 조회를 가장 먼저** 한다(`:32`) — `enabled=false` 검사는 그 뒤 5번째(`:44`).
이 순서는 정본이 요구한 것(*"false면 인증 통과 뒤 503"*)이라 바꿀 수 없다. 결과적으로 **인증되지 않은 발신자가 임의의 bearer로**
캐시 항목 생성과 DB 조회 예약을 유발할 수 있다.

- 무작위 bearer를 10,000개 넘기면 LRU가 **정상 토큰·서비스 항목을 전부 퇴출**한다 → 정상 Collector가 miss → 503/metadataUnavailable.
- 갱신 큐 1,000·DB 4가 상한이라 DB 자체는 보호되지만, **정상 트래픽의 캐시가 밀려난다.**

정본 §2.3은 `max-requests-per-second-per-token` 기본 10 / burst 20 (실제 429)을 규정하는데,
`ApmLiveSpansProperties`에 해당 설정이 없고 `src/.../live/` 어디에도 429 구현이 없다(grep 0건).
**§7.1의 1~7단계 어느 행에도 이 항목이 배정돼 있지 않다** — 정본의 단계 분해 누락으로 보인다.

**조치 권고**
1. 정본 §7.1에 rps 제한을 **명시적으로 배정**한다(4단계 또는 6단계).
2. 그때까지는 `enabled=false` 기본값이 방어막이므로 **라이브를 켜기 전에 반드시 선행**해야 할 항목으로 못 박는다.
3. 저비용 완화책: 토큰 항목과 서비스 항목의 LRU 예산을 분리(예: 토큰 2,000 / 서비스 8,000)해 한쪽 오염이 다른 쪽을 밀어내지 못하게 한다.

### 🟡 Y6 — `licensed()`는 60초마다 hot path에서 DB를 1회 친다

`LiveMetadataCache.licensed()`(`:68`)는 TTL을 덧붙이지 않고 provider를 그대로 부른다 — 정본 §2.3.1의
"라이선스 단일 freshness"를 지키려는 **의도된 설계**이고 `licenseFreshnessIsNeverCachedAgain`(:138)이 이를 고정한다. 🟢

다만 §2.3 표의 *"스냅샷 캐시 — hot path DB 0회"*와는 문자 그대로는 어긋난다: 60초마다 한 요청이
`findByActiveTrue()` + RSA 검증을 **동기로** 부담한다. `warmLiveEndpointHasZeroSqlQueries...`가 이를 못 잡는 이유는
100회 루프가 60초 안에 끝나기 때문이다.

실질 영향은 작지만(분당 1회, 쿼리 1건), R1의 대기 누적과 겹치면 그 요청이 느려지는 지점이다.
→ **정본 문구를 "라이선스를 제외한 hot path DB 0회 · 라이선스는 60초당 1회"로 정확히 적을 것**을 권고한다. 코드 변경은 불필요.

---

## 5. 파서 변경 (선택 필드 1,000개 보유)

### 🟢 메모리 상한이 유계다

- 보유 대상은 `maxSpans`(1,000)까지이고, **초과분은 `skipChildren()`으로 버린다**(`LiveSpanParser:105-106`) — 1,001번째부터는 힙을 먹지 않는다.
- 스팬당 보유량은 yaml 제한과 파서 허용목록으로 이중 봉인된다: `SPAN_KEYS` 6키(`:26-27`) · 속성값 절단 · ID 32/16 · 시간 19자 · `status.code` 32자.
- 산술 최악: 1,000 × (문자열 ~500 B + 객체 오버헤드 ~400 B) ≈ **1 MB/배치**. 동시 처리는 admission 4로 묶이므로 **피크 ≈ 4 MB**.
- resource map은 resourceSpans 그룹당 1개를 **공유 참조**하므로(`:63`, `:71`) 그룹 = 스팬 수인 최악에서도 스팬당 1개 이상 생기지 않는다.

→ 1단계 피크(본문 스트림 16 MiB)에 비하면 작다. 🟡 **Y9**: 설계서 §5.2 BE 힙 표에 이 항목(배치당 ≈1 MB × in-flight 4)이 없다 — 4단계 arena 예산과 합산할 때 빠지지 않도록 **한 줄 추가를 권고**한다.

### 🟢 1단계 스트리밍 계약 유지

정본 §2.3 마지막 불릿의 요구는 *"전체 트리를 `readTree`로 올리지 않고, `JsonParser` 토큰 단위로 필요 필드만 추출, 나머지 `skipChildren`"* 이다.
`readTree`는 여전히 없고, 허용목록 밖 키는 전부 `skipChildren`, `name`·`status.message`·`events`·`links`는 읽지 않는다.
엄격 UTF-8 디코더(`:43-44`)·심볼 캐시 비활성·`StreamReadConstraints`(깊이 64·이름 256·숫자 32)도 그대로다. **계약 유지.** 🟢

"전체 스팬 목록을 만들지 않는다"는 1단계 문구는 분류·집계가 들어오는 2단계에서 **성립할 수 없는 요구**이며,
클래스 주석(`:20-22`)이 "최대 1,000개의 선택 필드만 보유한다"로 정직하게 갱신됐다.

### 🟢 400 → 스팬 단위 거절로의 강등이 적절하다

`id()`·`nanoTime()`이 예외 대신 `null`을 반환하도록 바뀌었다(`:211-227`). JSON 문법 오류는 여전히
`require(...)`가 `malformed()`를 던져 **배치 400**이고(`:194-196`), 문법은 맞는데 값이 규격 밖인 경우만 스팬 거절이다.
정본 §2.3의 *"400은 입력 불량에만"* + 사유 목록의 스팬 단위 `malformed`와 일치한다.
`identityScalar`(`:230-236`)가 문자열/정수가 아닌 토큰에 `skipChildren()`을 불러 **파서 위치를 정확히 소비**하는 점도 맞다.

### 🟡 Y3 — `parentSpanId: ""` / `null`이 스팬 전체를 `malformed`로 만든다

**파일** `LiveSpanParser.java:129`, `:141-143`

```java
case "parentSpanId" -> { parent = id(parser, 16); invalidParent |= parent == null; }
...
LiveSpanRejection rejection = trace == null || span == null || start == null || end == null || invalidParent
        ? LiveSpanRejection.malformed : ...
```

`id()`는 길이 ≠ 16이면 null을 돌려주므로 **빈 문자열 `""`도 null**이다 → `invalidParent = true` → 스팬 거절.
`"parentSpanId": null`도 마찬가지다. 이것은 의도된 동작이고 테스트가 고정하고 있다
(`LiveSpanParserTest.invalidIds`(:117)의 값 목록에 `"\"\""`와 `"null"`이 들어 있고 `malformed`를 어서션한다).

**그런데 빈 parentSpanId는 "루트 스팬"이라는 정상 의미다.** 우리 정본 yaml Collector는 proto3 기본값을 생략하므로
(`§2.3`가 `name` 부재를 근거로 명시한 그 동작) 실제로는 필드가 **없다** → `invalidParent`가 false로 남아 통과한다.
그러나 `emitUnpopulated`를 켠 protojson 계열 생산자는 루트 스팬에 `"parentSpanId": ""`를 **명시적으로 넣는다.**

문제는 블라스트 반경이다 — 라이브 모집단은 **SERVER 스팬**, 즉 대부분이 **트레이스 루트**다.
그런 생산자가 하나 붙으면 그 서비스의 **라이브 스팬이 전량 `malformed`로 사라진다**. 게다가 정본 §2.3은
`name` 부재 처리의 이유로 *"다른 Collector 설정 방어"*를 명시하고 있어, 방어 원칙과도 어긋난다.

**수정안** — 없음/빈값/null은 "부모 없음", 값이 있는데 형식이 틀린 경우만 거절.
```java
case "parentSpanId" -> {
    // 루트 스팬은 필드 부재 또는 빈 값으로 온다. 값이 있는데 형식이 틀린 경우만 거절이다.
    if (parser.currentToken() == JsonToken.VALUE_STRING && parser.getTextLength() == 0) parent = null;
    else if (parser.currentToken() == JsonToken.VALUE_NULL) parent = null;
    else { parent = id(parser, 16); invalidParent |= parent == null; }
}
```
`traceId`·`spanId`는 **필수**이므로 현행(빈값 → malformed)이 맞다 — 그쪽은 바꾸지 않는다.
`LiveSpanParserTest.invalidIds`(:117)의 `parentSpanId` × `{"", null}` 조합 2건을 "부모 없음으로 수용"으로 옮기고,
`hexCaseAndAbsentParentArePreserved`(:133)에 빈 문자열 케이스를 추가한다.

---

## 6. 수정된 서비스 5종 — 이벤트 발행 외 동작 변경 없음

`ApmReceiveTokenService` · `ApmRegistryService` · `ApmRegistryWriter` · `ApmServiceQueryService` · `ApmRetentionService`의
diff를 전량 확인했다. 🟢 **어느 것도 기존 로직을 바꾸지 않았다.**

- 추가된 것은 `ApplicationEventPublisher` 필드 1개와 `publishEvent` 호출뿐이다.
- `ApmRegistryWriter.createService`·`createPending`은 `return saveAndFlush(...)`를 지역변수로 풀어 **발행 후 같은 값을 반환**한다 — 반환값 동일.
- `ApmServiceQueryService`는 `@RequiredArgsConstructor`가 아니라 명시 생성자라 인자가 1개 늘었다(`:135`). 호출처는 Spring 주입과 테스트 3곳뿐이고 전부 갱신됨(`event -> {}`).
- 🟢 `ApmReceiveTokenService.revoke`의 **이미 회수된 분기에서도 발행**하는 것(`:313-314`)은 올바른 추가다 — 다른 노드가 회수했거나 DB를 직접 고친 경우, 이 노드의 캐시를 이번 조회로 확인한 상태로 맞춘다. `idempotentRevocationAlsoInvalidatesAnExternallyRevokedToken`(IT:176)이 `jdbc.update`로 외부 회수를 만든 뒤 검증한다.
- 🟢 `ApmServiceQueryService.delete`가 `services.delete(service)` **뒤에** 발행하지만, 영속 컨텍스트가 아직 살아 있어 `getNameNorm()`·`getEnvNorm()` 읽기가 안전하다. 기존 `afterCommit(registrar::clearCache)`도 그대로 남아 있다.
- 트랜잭션 경계는 §4에 표로 확인(전부 `@Transactional` 안 → AFTER_COMMIT 실효).

🟡 **Y11 — 이벤트 payload에 원문 토큰이 없다는 점은 🟢이지만, `tokenHash`가 로그·힙에 남는 범위는 확인 필요.**
`ApmReceiveTokenChanged(String tokenHash, boolean revoked)`는 **해시만** 담는다(레코드 주석이 명시). 원문 유출 경로 없음. 🟢
다만 레코드는 `toString()`이 자동 생성되므로 어떤 이유로든 이벤트를 로깅하면 해시 64자가 로그에 남는다.
해시는 원문이 아니라 심각하진 않으나, 현재 로깅 지점은 없다(grep 0건). **기록만 남긴다.**

---

## 7. 테스트 품질

### 회귀 목록 대조 — 🟢 누락 없음

§7.1 **2단계** 회귀 13항목, **3단계** 회귀 7항목을 항목별로 대조했다.

| 단계 | 회귀 항목 | 커버 |
|---|---|---|
| 2 | 바이트 상한 직전·동일·초과(양쪽) | ✅ `ApmOtlpLiveControllerTest:140-154` |
| 2 | Content-Length 없음·거짓 | ✅ `:159-172` |
| 2 | 낮은/높은 압축률 · 난수 G=N 수용 · 고압축 폭탄 해제 중 413 | ✅ `:233-294` |
| 2 | 깊은 JSON · 큰 미사용 필드 · 느린 본문 | ✅ 1단계 `LiveSpanParserTest` · `LiveIngestSocketTest` |
| 2 | **입력 = 신규 + 중복 + 실제 거절** | ✅ `LiveIngestResult` 생성자 + `mixedNewDuplicateAndRejection` |
| 2 | 999 / 1,000 / 1,001 | ✅ `boundaryConservesEverySpan` |
| 2 | 혼합 · 중복-only · 전량 거절 | ✅ `mixed...` · `duplicateOnly...` · `wholeBatchSpanRejections...` |
| 2 | 표본 탈락이 `rejectedSpans`에 안 섞임 | ✅ `samplingLossCannotBecomeARejection` |
| 3 | commit 후 반영 | ✅ IT `rollbackPreserves...` |
| 3 | rollback 시 변화 없음 | ✅ 같은 테스트 + `licenseServiceChangesAreAppliedOnlyAfterCommit` |
| 3 | 오래된 refresh가 새 상태를 덮지 않음(generation) | ✅ `invalidationDuringOldRefreshCannotResurrectService` + `evictedInFlightEntryCannotOverwriteRecreatedKey` |
| 3 | TTL 경계 반복 거절 없음 | ✅ `repeatedTtlBoundariesNeverRejectWarmHealthyService`(1,500초) |
| 3 | **hot path DB 0** | ✅ IT — Hibernate `PrepareStatementCount` 실측 |
| 3 | 토큰 회수 30초 | ✅ `externalRevocationIsAppliedByThirtySeconds` |
| 3 | 라이선스 60초 freshness | ✅ `LiveLicenseFreshnessTest.externalChangeIsAppliedAtSixtySeconds...`(59.999초 / 60초 경계) |

**미커버로 남는 것**(위 R1·Y3에서 제안한 것과 동일):
- 서로 다른 hard 만료 서비스 N개 배치의 **총 대기 시간 상한** (R1)
- `parentSpanId: ""`를 루트로 수용 (Y3)
- dedup 포화가 "0건 집계" 상태에서만 503 (Y4)

### 변이 검증 3건 — 🟢 전부 잡힌다

세 변이를 실제로 적용해 돌리고 **원본 복원 후 md5 일치를 확인**했다.

| 변이 | 적용 내용 | 실패한 테스트 |
|---|---|---|
| M1 AFTER_COMMIT → 즉시 발행 | `@TransactionalEventListener(AFTER_COMMIT, fallbackExecution)` → `@EventListener` (2곳) | IT `rollbackPreservesCacheAndCommitInvalidatesAfterTransaction` · `tokenRevocationHonorsCommitAndRollbackAndKeepsRevokedState` · `warmLiveEndpointHasZeroSqlQueriesAndNeverTouchesLastSeen` |
| M2 dedup 키를 spanId만으로 | `new Key(0L, 0L, spanId)` | `BoundedLiveDedupIndexTest.fullKeyAndHexCaseAreCompared` |
| M3 rejected에 duplicated 합산 | `rejected()`에 `duplicated +` | `LiveSpanIngestorTest.duplicateOnlyIsIdempotentSuccess` · `mixedNewDuplicateAndRejection` |

`48 tests completed, 6 failed` — 세 변이 모두 **독립적으로** 검출됐다.

**복원 확인**

| 파일 | 변이 전 md5 | 복원 후 md5 |
|---|---|---|
| `LiveMetadataCache.java` | `edf651f29fb05659e7689538b4c298a3` | **동일** |
| `BoundedLiveDedupIndex.java` | `741f79db666e224097e8eaaaae186497` | **동일** |
| `LiveIngestResult.java` | `dbb9128d2ffce39c2dcee0425e2f8bb6` | **동일** |

복원 후 `live` + `license` 전 범위 재실행 **BUILD SUCCESSFUL**, `git status --porcelain` 40건(검수 전과 동일), `git diff --check` 통과.

### 🟡 Y8 — 1단계 보안체인 테스트가 더 이상 실제 캐시를 타지 않는다

`LiveIngestTestSupport.metadata(...)`(신규, `:30-46`)가 **mock `LiveMetadataCache`**를 만들어
`tokens.authenticate(...)`로 위임한다. 덕분에 `LiveIngestSecurityChainTest`·`ApmOtlpLiveControllerTest`는
1단계 때와 같은 인증 의미를 유지하지만, **실제 캐시 경로(503 metadataUnavailable 포함)는 타지 않는다.**

의도는 명확하고(주석에 *"실제 캐시/DB 계약은 LiveMetadataCacheIT에서 검증한다"*) 실제 계약은
`LiveMetadataGateTest`(503→401 전이)와 `LiveMetadataCacheIT`가 덮는다. **공백은 아니지만**,
mock이 `token()`에서 **절대 null을 반환하지 않으므로** 보안체인 테스트만 보면 "miss = 503" 계약이 보이지 않는다.
→ `LiveIngestSecurityChainTest`에 miss 1케이스(503 + OTLP 본문 + 사람용 envelope 미유입)를 **추가 권고**. 낮은 우선순위.

---

## 8. 수정 라운드 항목

병합 전 처리를 권고하는 순서다.

| # | 등급 | 항목 | 파일 | 규모 |
|---|---|---|---|---|
| **R1** | 🔴 | 배치 전체에 단일 메타 deadline 도입 — hard 만료 서비스 수 × 3초 누적 제거 | `LiveSpanIngestor.java` · `LiveMetadataCache.java` | 메서드 1개 오버로드 + 호출부 1줄 |
| **R2** | 🔴 | `current()`의 `IllegalStateException` 2곳을 재시도 + `locked(INVALID)` 폴백으로 교체 | `SignedKeyLicenseProvider.java:72-88` (+ `LiveLicenseFreshnessTest` 2건) | 메서드 1개 재작성 |
| R3 | 🟡 | `parentSpanId` 빈값·null을 "부모 없음"으로 수용 | `LiveSpanParser.java:129` (+ 파서 테스트 2건) | 3줄 |
| R4 | 🟡 | dedup 포화를 배치 진입 전 `reserve()`로 선검사 | `LiveDedupIndex`·`BoundedLiveDedupIndex`·`LiveSpanIngestor` | 메서드 1개 추가 |
| R5 | 🟡 | `CachedPayload`에 `effectiveFeatures()` 결과를 담아 요청당 할당 제거 | `SignedKeyLicenseProvider.java` | 레코드 필드 1개 |
| R6 | 🟡 | 토큰/서비스 LRU 예산 분리 (permitAll 경로 오염 완화) | `LiveMetadataCache.java` | 선택 — R7과 함께 판단 |
| R7 | 🟡 | **정본 갱신 3건**: ① §2.3.1 "타이머" → "매 요청 재계산" ② §2.3 "hot path DB 0회" → "라이선스 제외" ③ **§7.1에 rps 429 단계 배정**(현재 어느 단계에도 없음) | `devdesign_apm-realtime.md` | 문서 |
| R8 | 🟡 | §5.2 힙 표에 파서 보유분(배치당 ≈1 MB × in-flight 4) 추가 | `devdesign_apm-realtime.md` | 문서 1줄 |
| R9 | 🟡 | `LiveIngestSecurityChainTest`에 메타 miss(503) 케이스 1건 추가 | 테스트 | 낮은 우선순위 |

---

## 9. 총평

2단계·3단계 모두 **정본을 정확히 읽고 구현했다.** 특히 좋았던 것:

- **수량 보존식을 타입 생성자에 박아 넣은 것**(`LiveIngestResult`) — 구현이 늘어나도 보존식을 깰 수 없다.
- **`hot path SQL 0`을 Hibernate 통계로 실측**한 것 — "0회일 것이다"가 아니라 "0회다"를 증명했다.
- **generation 역전 방지에 세대 + 객체 정체성 두 축을 쓰고, 두 경합(무효화 / LRU 퇴출)을 각각 테스트한 것.**
- **무효화 경로 12개 전수를 실제 도메인 진입점으로 호출하는 IT** — 발행 지점이 하나라도 빠지면 warm 값이 남아 실패하는 구조다.
- **1,001번째 초과분도 JSON 검증을 끝까지 하고 버리는 것** — 조용한 200을 막는다.
- **1단계 413이 임시물이었음을 주석에 예고해 두고 그대로 이행한 것** — 검수자가 정본을 다시 안 찾아도 되게 했다.

🔴 2건은 모두 **행복 경로가 아니라 열화 경로**에서 드러난다(DB 느려짐 / 라이선스 갱신 경합).
바꿔 말하면 이번 단계가 방어하려던 바로 그 상황에서 새 실패 모드가 생긴 것이라, 병합 전에 닫는 편이 맞다.
두 건 다 파일 1개 규모이고 기존 테스트를 깨지 않는다.

**판정: R1·R2 수정 후 병합 권고.**
