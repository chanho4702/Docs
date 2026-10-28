# APM P5.1 5단계(snapshot · SSE) BE 검수 — Claude

- **대상**: worktree `C:\solutions\moveseye-be-spring-p5`(브랜치 `p5-live`, HEAD `5628520` 위 미커밋)
- **구현**: 코덱스(gpt-6-astra) — 보고서 `review_apm-p51-s5-be_codex-impl.md`
- **정본**: `_workspace/designs/devdesign_apm-realtime.md` **v4.3** §2.5·§3.2·§3.3·§3.4·§7.1 5단계 행
- **방식**: 읽기 전용(코드 수정 없음). 변이 3건은 적용 후 **md5로 원복 확인** 완료.
- **일자**: 2026-09-16

## 판정 요약

| | 건수 |
|---|---|
| 🔴 병합 차단 | **0** |
| 🟡 수정 라운드 권고 | **11** |
| 🟢 확인 완료 | 13 |

**병합 가능 여부: 가능.** 6단계(Collector·운영 관측) 착수 전에 아래 🟡 중 **Y1·Y2·Y3** 3건을 처리할 것을 권고한다(나머지는 7단계 계약 표본·R3/R6 실측과 함께 처리 가능).

정본 v4.3에 **반영해야 할 것 3건**(§맨 아래 "정본 수정" 절) — 그중 하나(§2.5 거절 변환 표의 `VisitorSessionChecker` 행)는 **코드가 아니라 정본이 틀렸다**.

---

## 검증 수치 (항목 10)

| 범위 | 결과 |
|---|---|
| 지정 2패키지 `overview.live.*` + `collector.ingest.live.*` | **391건 / 32클래스 green** (코덱스 보고와 정확히 일치) |
| 위 + `auth.security.*` + `ApmMissingParamMvcTest` + `ApmDeploymentWebhookSecurityChainTest` | **424건 / 38클래스 green** |
| `LicenseArchitectureTest` · `OtelArchitectureTest` | green (새 컨트롤러가 ArchUnit 규칙을 건드리지 않음) |
| `AuthorizationContractIT` (**실제 Spring 컨텍스트 기동**, 도커 PG 5433) | **11건 green, skip 0** |
| `git diff --check` | 0 (공백 오류 없음) |
| worktree 임시 파일 | 없음(미추적 19개 전부 `src/` 아래 신규 소스) |
| 신규 테스트 수 | 56(spans 6파일) + 3(`LiveIngestSecurityChainTest`) = **59** — 보고와 일치 |

전체 `:test`는 호스트 메모리 제약으로 미실행(별도 3,528건 green 확인분 존재).

---

## 1. 🟢 공유 인증 코드 변경 — 경로 한정 확실, APM 밖 403 불변

`auth/security/ApiAccessDeniedHandler.java`는 **확장점 1줄 추가**뿐이고 기본 경로는 바이트 단위로 동일하다.

```java
// ApiAccessDeniedHandler.java:31
for (ApiAccessDeniedResponse handler : responses) if (handler.writeDenied(request, response)) return;
```

- 확장점 구현체는 `LiveStreamRejectionAdvice` **하나뿐**이며, `matches()`가 **메서드 GET + `contextPath + "/apm/live/spans/stream"` 완전 일치**만 받는다(prefix 매칭도 아님 — 정본이 요구한 `/apm/live/spans/**`보다 더 좁다).
- 빈 목록 기본값 + `@Autowired(required = false)` 조합이라 구현체가 없어도 동작 불변.
- **근거(강함)**: `AuthorizationContractIT` 11건이 **실제 컨텍스트를 띄워** `HTTP 200 + body code 403` envelope를 단언하고 통과했다(`AuthorizationContractIT.java:51·90·103·155`). 즉 (a) 변경된 핸들러로도 **앱이 기동하고**, (b) APM 밖 403 응답 모양이 그대로다.
- `LiveIngestSecurityChainTest.securityDenialExtensionIsWiredAndLeavesOtherPathsUnchanged`가 같은 핸들러 빈으로 `/apm/live/stream`은 `application/json`, `event:control` 미포함임을 직접 대조한다.
- `ApmLiveSpansStreamControllerTest.rejectionOverrideIsLimitedToExactPathIncludingContextPath`가 contextPath 포함 경계까지 덮는다.

전역 `HandlerExceptionResolver`가 2개(`LiveIngestAdvice`, `LiveStreamRejectionAdvice`)로 늘었으나 **경로가 서로소**(`/apm/otlp-live/**` vs 위 단일 경로)이고 둘 다 비대상이면 즉시 `null` 반환이라 다른 경로 비용·동작 변화 없음.

**판정 ✅** — 이 항목은 🔴 아님.

---

## 2. 정본 차이 2건 판정

### (a) `visitorId` 불일치를 **401**로 유지 → **코드가 옳다. 정본을 고쳐라.**

정본 §2.5 "거절 변환 위치" 표 2행이 `VisitorSessionChecker`와 `@RequiresFeature(APM)`를 **한 칸에 묶어 403**으로 적은 것이 오기다. 근거 3가지:

1. **`VisitorSessionChecker`의 계약이 401이다.** 클래스 javadoc이 판정 순서를 "① 인증 없음 → 401 · ③ visitor 없음 → 401 `MISSING_MESSAGE` · ④ Redis 세션 불일치 → 401 `INVALID_TOKEN`"으로 명시하고, 구현이 전부 `UnauthorizedError`(= 실제 HTTP 401)를 던진다(`VisitorSessionChecker.java:56~71`). 이 판정기를 "한 벌"로 만든 것이 2026-09-01 4차 검수 🔴1의 결론이었으므로, P5만 403으로 갈라지면 **그 수정을 되돌리는 셈**이다.
2. **P1.5 관례가 401(세션)과 200+403(권한)을 일부러 갈라 놓았다.** `ApmLiveStreamController`는 `requireSession(...)`(401)과 `access.canRead()` 실패(200+code 403)를 분리하고, 그 분리 자체가 **2026-09-02 P2 QA D3 사고의 수정**이다 — 권한 실패가 401로 나가 FE axios 인터셉터가 "세션 만료"로 오인해 refresh→로그아웃을 돌렸다.
3. **방향이 정반대다.** visitorId 불일치는 *진짜로* 세션 문제(다른 기기 로그인으로 Redis 세션 교체)다. 이것을 `control{reject,403,retryable:false}`로 바꾸면 FE는 "권한 없음"을 띄우고 **재시도를 영구 중단**한다 — 사용자는 재로그인 경로를 못 찾는다.

구현도 이 경계를 정확히 지켰다: `ApmLiveSpansStreamController.java:37`에서 `sessions.require(...)`를 **가장 먼저** 부르고, 그 `UnauthorizedError`만 advice가 401 JSON으로 내보낸다(`LiveStreamRejectionAdvice.java:44~49`). 회귀도 있다(`visitorMismatchIs401JsonBeforeStreamOpen`, `missingVisitorUsesSameSessionCheckerAndHeaderFallback`).

→ **권고: 정본 §2.5 표를 3행으로 분리**(아래 "정본 수정" 절 D1). 단, 401 **본문 모양**은 🟡 Y4 참조.

### (b) `Last-Event-ID`의 한 단계 되감기 → **멱등하다. 채택 가능.**

`ApmLiveSpansStreamController.cursor()`가 헤더 `epoch:N`을 `seq = N-1`로 낮춰 **seq N 전체(모든 part)를 재전송**한다. §3.2 병합 규칙 1~5와 대조:

| 시나리오 | 서버 | 클라이언트 적용 | 판정 |
|---|---|---|---|
| part 0/3만 받고 끊김(lastApplied = N−1) | seq N part 0·1·2 재전송 | 규칙 1 `sinceSeq(N−1) == lastApplied(N−1)` → **적용** | ✅ 유실 복구가 목적 그대로 |
| N 전량 적용 후 끊김(lastApplied = N) | seq N 재전송 | 규칙 1 `seq(N) ≤ lastApplied(N)` → **무시(겹침)**, 이어 N+1의 `sinceSeq=N`이 적용 | ✅ 멱등 |

`pointsRev`/`statsRev`와의 충돌도 없다 — 규칙 1에서 이미 이벤트 단위로 걸러지고, 설령 적용되더라도 **동일 rev의 동일 버킷 통째 교체**라 규칙 3·4의 "작으면 무시"를 위반하지 않는다(rev가 역행하지 않는다). 회귀 `reconnectDuringMultipartReplaysEveryPartFromPreviouslyAppliedSeq`가 part 전량 재전송·index 순서까지 단언한다.

비용만 유의: 네이티브 재접속마다 최대 4 part(8 MiB)를 되보낸다. 정본에 **명시**해 두는 편이 낫다(D2).

---

## 3~8. 항목별 판정

### 3. 발행 경계·정합성 🟢

- **tick 불변 상태 위 발행 / 구독 선등록 금지** ✅ — `open()`은 `connections`에 담기만 하고(`subscribed=false`), 구독·S 고정은 오직 tick 끝의 `admit()`에서 한다(`LiveSpanStreamService.java:163·329`). `subscriptionWaitsForBoundaryAndSnapshotEndPrecedesFollowingDelta`가 `connection.subscribed == false`와 snapshot.end → spans 순서를 단언.
- **`seq`가 control/heartbeat에 소비되지 않음** ✅ — `seq++`는 `if (hasData)` 안 **한 곳뿐**(:244). heartbeat·control은 `codec.event(..., id=null, ...)`이라 `id:` 줄 자체가 없다. **변이 1(heartbeat에서 seq 증가)로 실증**(아래 9절).
- **`sinceSeq`·`viewKey`·`streamEpoch` 재접속 판정** ✅ — `replayable()`이 epoch·viewKey 동일 + 로그 연속성(`entry.seq() != expected++` 검출)까지 본다(:320~328). `viewKey`는 `env`의 `|`·`%`를 가역 인코딩하고 리터럴 `"all"`을 `%61ll`로 피해 **단사**다(`LiveSpanStreamView.key()`).
- **`provisionalUntil` = 버킷 종료+5초** ✅ — `copyBucket`이 `time + 6000`(1초 버킷 종료 +5,000). `provisionalBoundaryUsesBucketEndPlusFiveSecondsEvenAfterLateChanges`가 늦은 도착 뒤에도 불변임을 단언.
- **`removeServices` 전달** ✅ — 삭제(`departed ⊇ removals`)와 **env 필터 이탈**(`view.services − accepted`)을 합쳐 보낸다(:249~250).
- **env 필터 진입** ✅ — 이미 보관 중이던 서비스가 필터에 새로 들어오면 dirty 증분으로는 과거 clean 버킷을 복원할 수 없으므로 **그 view만 resync + 로그 전량 폐기**(:253~256). `environmentChangeRemovesDepartedServiceAndSnapshotsHistoricalBucketsForJoinedView`가 양방향을 덮는다.

### 4. snapshot 🟢 (🟡 Y2·Y3 동반)

- 순서 `begin(≤64 KiB) → dict chunk → buckets chunk → end(개수·CRC32)` ✅, chunk 1 MiB ✅, `begin`에 사전 미포함 ✅(`assertThat(begin.has("routes")).isFalse()`).
- `begin.chunks == end.chunks` 구조적으로 보장(catalog 수 + range 수).
- 도중 재접속·취소 ✅ — `checkCancelled()` + `snapshot.cancelled`, `interruptedSnapshotReconnectDoesNotResumeUncommittedSnapshot`(새 snapshotId 발급), `deletingServiceCancelsSharedSnapshotAndReturnsAllChunkReferences`(참조 전량 반환).
- 동시 2·버퍼 제한 ✅ **실제 기본값으로** 검증 — `snapshotBufferNeverGrowsPastThreeQueuedAndOneBeingBuilt`가 `outstanding.size() == 3` 도달 + `budget.snapshots() ≤ 4 MiB`를 단언.
- "실제 직렬화 바이트에도 상한 적용" ✅ 존재(`transferred > cap → TooLarge`) — 다만 실패 모드가 🟡 Y3.
- 솎음 비율 산정은 🟡 Y2.

### 5. 바이트 예산 5종 독립 🟢 (🟡 Y5 동반)

회계 불변식을 손으로 추적한 결과 **이중 계상·누락 없음**:

`used`(96 MiB 전역) = `inFlight`(16 MiB) + `logs`(64 MiB) + `degraded`(8 MiB) + `evicted`(8 MiB). 예약 시 `used += n`·`inFlight += n` → `logged()`에서 `inFlight -= n`·`logs += n` → `evict()`에서 `logs -= n`·`evicted += n` → 마지막 `release()`에서 `evicted -= n`·`used -= n`. 각 바이트가 정확히 한 번 계수되고 한 번 반환된다. snapshot 버퍼는 `used`에 **들어가지 않아** 64 MiB 독립 예산이 96 MiB를 잠식하지 않는다(:15~23, `snapshotReservationDoesNotConsumeSseGlobalReservation`).

**퇴출 frame 보유 연결의 해제 — 전 경로 확인:**

| 경로 | 반환 지점 | 상태 |
|---|---|---|
| 정상 송신 완료 | `written()` → `release(c, pending)` | ✅ |
| writer 작업 중 지역 참조 | `pump()`의 `finally { current.bytes.release(); }` (watchdog이 큐를 비워도 계수 유지) | ✅ |
| 클라이언트 끊김 | `LiveServletWriter.onError/onComplete` → `disconnected()` → `streams.disconnect` → `close()` → `clearQueues()` | ✅ |
| 쓰기 deadline(2초) | `watchdog()` → `close()` | ✅ |
| 컨테이너 async timeout | `onTimeout` → `disconnected()` | ✅ |
| snapshot 취소 | `LiveSpanSnapshot.send()`의 `finally { bytes.release(); }` | ✅ |
| 큐 초과 | `enqueue()`가 `Pending` 생성 **전에** `close(c)` — 호출자가 여전히 소유 | ✅ |
| 서비스 삭제 | `purgeRemoved()` → 로그 전량 퇴출 후 보유 연결 `close` | ✅ |
| tick 실패 | `shedEvicted(true)` → `evicted`가 0이 될 때까지 최고령 보유 연결 종료 | ✅ |

`close()`가 `sink.abort()`(바이트 참조 선삭제) → `clearQueues()` 순서인 것도 올바르다(:534).

**누수 게이트가 실질적이다**: `LiveSpanStreamServiceTest`·`LiveSpanStreamBudgetTest`의 `@AfterEach`가 **모든 테스트마다** `hub.budget.used() == 0`을 기다린다 — 32개 시나리오 전부가 누수 검사다. 변이 2(96 MiB 전역 상한 제거)도 즉시 검출됐다.

**축소 한계값으로만 검증된 항목 → 🟡 Y5** (아래).

### 6. admission·대기열 🟢 (🟡 Y6 동반)

- 활성 40 · 대기 10 · 총 50 초과 거절 ✅(`activeFortyAndWaitingTenDoNotBecomeFiftySubscribers`), 사용자당 4 ✅, 동시 snapshot 2 ✅(`admissionTwoWaitingTenAndPerUserFourAreEnforced`가 `snapshotCount() == 2`를 단언).
- `paused{queuePosition}` — 값이 **바뀔 때만** 재전송(:356), 대기 중에는 heartbeat만(`waitingClientsReceiveOnlyPausedAndHeartbeatUntilAdmission`가 `spans`·`snapshot.begin` 부재 + `sequence() == 0`을 단언).
- 아직 snapshot이 없는 연결에 증분을 쌓지 않음 ✅(미구독이면 `offerFrame` 대상 자체가 아님). 입장 후 snapshot 진행 중 증분은 `c.deltas`에 보류했다가 `end` 뒤 flush(:425) — 정합상 필요하고 순서도 맞다.
- 연결 종료 시 자리 반환 ✅(`close()`가 `connections.remove`).
- 공유 snapshot ✅ (`sameViewSharesSnapshotChunksAndCancellationReleasesLastReference`가 `a.held == b.held` 동일 참조 단언) — 단 **같은 tick 안에서만** 공유(🟡 Y6).

### 7. writer 🟢 (🟡 Y7 동반)

- **비동기 경로 스레드 안전성** ✅ — `LiveServletWriter`는 모든 상태를 자기 monitor로 감싸고, `completion.run()`·`failure.accept()`를 **monitor 밖에서** 호출해 hub 락과의 역순을 만들지 않는다(:60~63). `alreadyClosedWriterInvokesFailureAndDisconnectOutsideItsMonitor`가 `Thread.holdsLock(writer) == false`를 직접 단언한다.
- **느린 소켓 4개 검증의 실효성 — 실효 있음.** `LiveServletWriterTest.fourStalledSocketsReturnAllWorkersAndFastConnectionStillCompletes`는 mock이 아니라 **실제 Tomcat + 수신 버퍼 1 KiB로 좁힌 진짜 소켓 4개**에 8 MiB를 밀어 넣고, ① 4개 worker가 전부 반환되고(`returned.await`) ② **그 상태에서 새 정상 연결이 `event:heartbeat`를 끝까지 받고** ③ 풀 슬롯 4개가 재사용 가능함을 확인한다. 정본 §2.5가 "R1·R6에서 실측하고 반환되지 않으면 `WriteListener`로 바꾼다"고 한 항목을 **처음부터 `WriteListener`로 구현하고 그 반환을 실측**한 셈이다.
- **deadline·반환 실패 시 종료·계수** ✅ — `watchdog()` 100 ms 주기, 2초 초과 시 `writerTimeouts` 증가 후 종료(`slowWriterDeadlineReturnsQueueAndSnapshotBytesWithoutTickBlocking`).
- **tick 스레드 굶주림 방지** ✅ — `blockedWriterInvocationCannotHoldPublicationOrDeadlineLock`이 send를 5초 붙잡은 상태에서 `hub.tick()` + `hub.watchdog()`가 **1초 안에** 끝나는 것을 `assertTimeoutPreemptively`로 강제한다.
- **컨테이너 타임아웃과의 상호작용** ✅ — `AsyncContext.setTimeout(600_000)`(정본 `stream-timeout-seconds` 600)과 hub의 `now - c.opened >= 600000` 종료가 같은 값. `onTimeout` → `disconnected()` → hub `close()`로 양쪽이 한 경로로 수렴한다.
- 풀 포화: `pump()`가 연결당 1개만 제출하므로 미결 작업 ≤ 50 < 큐 100 → `AbortPolicy` 미도달, 도달해도 `close(c)`로 안전(:418).

### 8. 권한·라이선스 🟢

- `@RequiresFeature(Feature.APM)` 클래스 레벨 ✅ · `ApmAccessChecker.canRead` 경유 ✅ · **MCP 토큰 차단** ✅(`user.isMcp()` — `VisitorSessionChecker`가 MCP를 통과시키므로 이 한 줄이 없으면 기계 토큰이 사람용 스트림을 연다. 회귀 `machineTokenCannotOpenHumanStreamEvenWhenPermissionCheckerAllowsView` 있음).
- **`requireRead` 대신 `canRead` + 직접 쓰기**는 정본 §2.5 문구와 다르지만 **옳다** — `produces=text/event-stream` 핸들러에서 예외를 던지면 협상 실패 → `/error` 재디스패치 → 가짜 401이 되는 2026-09-02 P2 QA D3 사고 경로다. P1.5 `writeForbidden` 주석이 그 실측을 남겨 두었고 여기서도 같은 판단을 했다.
- **`LiveStreamRejectionAdvice`의 403 변환 위치 정확함** — 라이선스 3종(`LicenseRequiredException`·`FeatureNotLicensedException`·`ReadOnlyModeException`)이 **전부 `LicenseGateException` 하위**임을 확인했으므로 LOCKED/EXPIRED 모드도 재디스패치 없이 `control{reject,403,APM_LICENSE_REQUIRED}`로 나간다(누락 없음).
- **P1.5 컨트롤러 불변** ✅ — `ApmLiveStreamController.java`는 diff에 없다.
- `enabled=false` 기본값 유지 ✅ → `control{reject,503,APM_LIVE_DISABLED,retryable:false}`.

### 9. 테스트 품질 — 변이 3건 **전부 검출**

`--max-workers=1`로 3건을 동시에 심고 `overview.live.spans.*`를 돌린 결과 **96건 중 5건 실패**:

| 변이 | 잡은 테스트 |
|---|---|
| ① heartbeat에서도 `seq++` | `onlyDataConsumesSequenceHeartbeatAndPausedDoNot:45`, `waitingClientsReceiveOnlyPausedAndHeartbeatUntilAdmission:206` |
| ② 고유 바이트 96 MiB 전역 상한 제거(`used + n > limits.total()` 삭제) | `total96MibCannotBeHiddenByReferencesOrLogEviction`, `snapshotReservationDoesNotConsumeSseGlobalReservation:81` |
| ③ snapshot CRC 누적 제거 | `boundarySnapshotHasChunkOrderChecksumTupleAndNoEventId:38` |

**원복 확인** — 3파일 md5가 변이 전과 동일:
`LiveSpanStreamService.java f30deddd411939b6e57a292b3c6c2f80` · `LiveStreamBytes.java fee8150c918f3edbd5e6fc8f2e097c00` · `LiveSpanSnapshot.java ab1ba2d79759e0272c9ab90c97832b85`. 원복 후 재실행 green.

§7.1 5단계 "필수 회귀" 14항목 중 **11항목 충분·3항목 부분**(🟡 Y8에 나열).

---

## 🟡 수정 라운드 권고 11건

### Y1. `control{degraded, reason:*}` 3종이 **한 번도 단언되지 않는다** (권고: 6단계 전)
`LiveSpanStreamService.java:272·273·394`가 `frame_limit`·`arena_pressure`·`connection_queue`를 내보내지만, 어느 테스트도 **payload를 확인하지 않는다**. `connectionByteLimitDoesNotBorrowUnusedLogOrGlobalBudget:54`는 `counters.degraded > 0`만 본다. §3.2가 이 3개 `reason` 문자열을 **UX 배지 문구 분기용 계약**으로 못박았고 P5.2가 그대로 소비하므로, 오타 하나면 화면이 조용히 기본 배지로 떨어진다.
→ reason별 1건씩, `clientKeepRatio` 값까지 단언하는 회귀 3건 추가.

### Y2. snapshot 솎음 상수 **180 B/점**이 정본의 90 B와 2배 어긋난다 (권고: P5.2 전)
`LiveSpanSnapshot.java:39·41`이 점당 180 B로 산정한다. 실제 튜플은 `[int, double, int, int, int, "32hex", "16hex"]` = traceId 34 B + spanId 18 B + 수치·구분자 ≈ 26 B → **약 78~85 B**로 정본 §3.3의 90 B가 맞다.
영향: 만석 15분 view(1,350,000점)에서 정본은 `snapshotKeepRatio ≈ 0.83`을 약속하는데 코드는 `ceil(1,350,000×180 / 96 MiB) = 3` → **0.33**. 사용자에게 보이는 표본이 정본 대비 **2.5배 적다**. 회귀도 없다 — `sparseTwoHundredServicesFitSnapshotWithoutFixedEstimateRejection:107`은 `keepRatio == 1`(솎임 없음)만 확인한다.
→ 상수를 96 B 정도로 낮추거나(어차피 `transferred > cap` 실측 가드가 뒤를 받친다), 180을 유지할 거면 **§3.3의 0.83을 0.33으로 정정**. 어느 쪽이든 코드와 정본이 같은 수를 말해야 한다. 더불어 `keepRatio < 1`이 실제로 걸리는 회귀 1건 필요.

### Y3. snapshot 전송량 초과의 실패 모드가 정본과 반대다 (권고: 6단계 전)
정본 §3.3: "초과 시 snapshot 자체를 base 1/k로 솎고 `snapshotKeepRatio`" = **축소**. 코드: `LiveSpanSnapshot.java:98`이 `transferred > cap`이면 `TooLarge` → `snapshotFailed(503)` = **중간에 끊고 연결 거절**. 이미 begin·일부 chunk를 보낸 뒤라 클라이언트는 미완 snapshot + `control{reject,503}`을 받는다.
Y2의 2배 여유 덕에 실현 가능성은 낮지만, Y2를 고쳐 상수를 낮추면 **이 경로가 살아난다**. 둘을 같이 봐야 한다.
→ 초과 시 keep을 올려 재계획하거나(재시작), 최소한 `degraded{reason:"frame_limit"}` 후 축소로 이어가도록. 현 동작을 유지한다면 정본 §3.3에 "초과 = 그 연결 503"으로 명시.

### Y4. 이 EP의 401 본문이 전역 `ApiResult` envelope와 다르다
`LiveStreamRejectionAdvice.java:53~54`가 `{"code":401,"errorCode":"INVALID_TOKEN"}`을 쓴다. 전역 `GlobalExceptionHandler.handleUnauthorized`는 `ApiResult`(`{status:"error", message, code}`)를 낸다. 정본 §2.5 401 행은 "**기존 관례 그대로**"라고 했다.
직접 쓰는 것 자체는 옳다(P2 QA D3 재디스패치 회피). 모양만 맞추면 된다.
→ `new ApiResult<>().error(message, 401)`을 직렬화해 쓸 것. (같은 자리의 400 `APM_LIVE_INVALID_QUERY`도 동일.)

### Y5. 실제 상한값으로 검증되지 않은 예산 항목 — 위험 판정
코덱스가 "일부 예산 회귀는 축소 한계값으로 검증"이라 한 부분의 정확한 목록:

| 예산 | 실제값 | 회귀가 쓴 값 | 위험 |
|---|---|---|---|
| tick frame / part | 2 MiB · 4 part | **10,000 B** (`LiveSpanFramesTest`), 4,000 B(budget test) | **낮음** — `pack()`이 `limits.frame()` 단일 상수로만 분기하고 `BoundedOutput`이 실바이트를 센다. 축소값으로도 분기 로직은 동일 경로 |
| 연결별 송신 큐 | 8 MiB / 5초 | **2,200 B** (5초는 실제값 검증됨 — `queueAgeClosesEvenWhenByteBudgetIsFarFromFull`) | **낮음** |
| 재생 로그 view당 / 전역 | 16 MiB / 64 MiB | **5,000 B / 6,500 B** | **중간** — view 8개 상한(`appendLog:302`의 `logViews >= 8`)은 축소값에서도 도달하지 않아 **9번째 view부터 로그 없이 snapshot 전용** 규칙이 미검증이다 |
| 고유 바이트 전역 | 96 MiB | **96 B**(정수 검증) + 실제값은 `Budget` 산술만 | **낮음** |
| 퇴출 보유 | 8 MiB | **200 B** | **낮음** |
| snapshot chunk·동시 버퍼·admission | 1 MiB·64 MiB·2 | **실제값 그대로** | 없음 |
| in-flight 16 MiB · degraded 8 MiB · 슬롯 4 | 실제값 | **실제값 그대로**(산술) | 없음 |

**결론: 축소 검증 자체는 허용 가능**하다 — 상한이 전부 `LiveStreamLimits` 한 레코드에서 주입되고 실제 직렬화 바이트로 비교되므로 스케일 불변이다. 다만 **"9번째 view = 로그 없음" 규칙 1건만 축소값으로 도달하지 않아 미검증**이니, `logViews >= 8` 경계 회귀 1건을 추가할 것. 그리고 실제 40연결 부하·힙 검증(R4·R6)은 여전히 남는다.

### Y6. 공유 snapshot이 **같은 tick 안에서만** 공유된다
`admit()`의 `created` 맵은 이번 pass에서 만든 것만 담는다(:353·366). 서로 다른 tick에 도착한 같은 `viewKey` 연결 2개는 **별도 snapshot 2개**를 만들어 동시 2슬롯을 소진한다. 정본 §2.5는 "같은 viewKey의 snapshot은 공유"라고만 했다.
정합성 문제는 없고(각자 일관된 S를 받는다) 슬롯 회전만 나빠진다.
→ 진행 중 snapshot을 `viewKey`로 먼저 조회해 합류시키거나, 정본에 "tick 경계 단위 공유"로 한정 명시.

### Y7. tick 스레드의 초당 작업량이 설계 가정보다 크다 (R3/R6 실측 항목)
`tick()`은 `synchronized`이고 그 안에서:
1. `ring.catalog(now-window)`가 **전 서비스 × 900 슬롯**을 훑어 `BucketRef`를 새로 만든다(200서비스 = 180,000객체/초). 정본 §2.5의 "dirty 버킷을 tick당 한 번만 병합" 대신 **전 창 revision 전수 비교**다.
2. 같은 tick에서 사전을 **두 번** 깊은 복사한다 — `catalog()` 안에서 1회(`LiveSpanDictionary.copy`), :228 `copyDictionary`로 또 1회. `copy()`는 route·instance 전량을 `HashMap` → `Map.copyOf`로 2중 복사하므로 사전 예산 20 MiB가 차면 **초당 수십 MiB 가비지**다.
3. :233이 `routes.equals()`·`instances.equals()`로 **전 엔트리 동등 비교**를 서비스마다 한다(버전 비교로 대체 가능).
4. degraded 연결마다 `offerFrame`이 frame을 **재직렬화**한다(:380). tick이 단일 스레드라 `beginDegraded()`의 슬롯 4 가드는 **실제로 아무것도 제한하지 않고**, 40연결이 degraded면 초당 40회 재직렬화가 tick 안에서 직렬로 돈다.

기능은 맞다. 다만 이 사이 writer 콜백(`written()`)이 전부 hub monitor에서 대기한다.
→ R3/R6에 "200서비스 만석 + 40연결 + degraded 다수"에서의 tick 소요·할당률을 **합격식으로** 넣을 것. 값싼 개선: :228 재복사를 `catalog()` 결과 재사용으로 줄이고, :233을 `d.version()` 비교로 교체.

### Y8. §7.1 필수 회귀 중 부분 커버 3항목
- **"4 part로도 넘치면 점 생략 + `statsRevision`만"** — 프레임 쪽은 `moreThanFourPartsOmitsPointsButKeepsStatsAndReleasesRejectedAttempts`로 덮였으나 **연결이 `degraded{frame_limit}`을 받는지**는 미검증(= Y1).
- **"재생 로그 전역 64 MiB"** — view 8개 상한 경계 미도달(= Y5).
- **"epoch 변경 시 클라이언트 재동기"** — 서버가 `epochChanged`를 보내는 것까지만(✅ 2건). 정본 §2.5의 "연속 실패 5회 → 사용자 버튼"은 **클라이언트 상태 머신**이라 P5.2 몫 — 코덱스 보고대로 미구현이 맞다.

### Y9. `control` 타입 `resume`이 정본에 있으나 구현·경로 모두 없다
§2.5 payload 요약은 `type: reject|degraded|paused|resume|epochChanged` 5종인데, 코드는 `paused` 뒤 곧바로 `snapshot.begin`으로 넘어가고 `resume`을 보내지 않는다. §2.5의 상태 머신 본문도 "입장 허용 시 snapshot.begin"이라 **`resume`이 정본 안에서 자기모순**이다.
→ 정본에서 `resume`을 지우거나(권장), 입장 시 1건 보내도록. 7단계 계약 표본 고정 전에 결정.

### Y10. `node.nodeId`에 `streamEpoch`를 넣었다
`LiveSpanSnapshot.java:48` `"nodeId", snapshot.epoch`. §3.2 예시는 `"nodeId": "be-1"` — **BE 노드 식별자**(§2.7 다중 BE 라우팅의 축)다. epoch은 링 리셋마다 바뀌므로 화면이 "같은 노드인가"를 판정할 수 없다.
→ 프로퍼티(`app.apm.live.node-id`, 기본 hostname)로 분리. 지금 고치는 편이 싸다.

### Y11. springdoc 주석 부재 · `IllegalArgumentException` 일괄 400
- 새 컨트롤러에 `@Tag`·`@Operation`·`@SecurityRequirement`가 없다(P1.5 컨트롤러는 전부 있다). SSE라 응답 DTO는 없지만 쿼리 파라미터 6개와 이벤트 4종 설명은 계약이다.
- `LiveStreamRejectionAdvice.java:45`가 **모든** `IllegalArgumentException`을 `400 APM_LIVE_INVALID_QUERY`로 바꾼다. 내부 결함성 IAE까지 "잘못된 쿼리"로 표기된다. `LiveSpanStreamView`가 던지는 것만 잡도록 전용 예외를 두는 편이 낫다.

---

## 정본(v4.3)에 반영할 것

**D1. §2.5 "거절 변환 위치" 표를 3행으로 분리** — 2행이 `VisitorSessionChecker`와 `@RequiresFeature`를 묶어 403으로 적은 것은 오기다:

| 단계 | 거절 | 처리 |
|---|---|---|
| 인증 필터(JWT 없음·만료) | **실제 401** | 기존 관례 그대로 |
| `VisitorSessionChecker`(visitorId 없음·세션 불일치) | **실제 401** + `ApiResult` 본문 | 스트림을 열기 전. 🔴 403 `control`로 바꾸지 말 것 — 세션 문제를 권한 문제로 둔갑시켜 FE 재인증 경로를 막는다(P1.5 2026-09-02 P2 QA D3의 역방향 재발) |
| `@RequiresFeature(APM)`·`AccessModeInterceptor`·`ApmAccessChecker` | 403 | `/apm/live/spans/stream` 한정 `LiveStreamRejectionAdvice`가 `control{reject,403,retryable:false}`로 변환 |

또한 §2.5 1행의 "기존 관례 그대로(200+JSON code 401)"라는 괄호 설명도 사실과 다르다 — **401은 실제 상태코드**다(CLAUDE.md §3 #1).

**D2. §2.5 재접속 절에 `Last-Event-ID` 되감기 규칙 명문화**: "헤더는 multipart 중간 part에도 갱신되므로 서버는 `Last-Event-ID: epoch:N`을 `sinceSeq = N−1`로 해석해 **seq N 전체를 재전송**한다(병합 규칙 1이 중복을 흡수한다). 명시 쿼리 `sinceSeq`는 '마지막으로 완전히 적용한 seq'라 되감지 않는다."

**D3. §3.2 `snapshot.end.checksum` 산식 고정**: 현 구현은 **`snapshot.chunk` 이벤트들의 `data:` 이후 JSON UTF-8 바이트만 순서대로 이은 CRC32**(begin·end 제외, 말미 `\n\n` 제외)다. FE가 같은 식으로 계산해야 하므로 7단계 계약 표본에 고정하기 전에 §3.2에 적을 것.

추가로 Y2(90 B vs 180 B)·Y9(`resume`)는 코드/정본 중 어느 쪽을 맞출지 결정한 뒤 반영.

---

## 6단계 진입 전 체크

- [ ] Y1 · Y2(+Y3) · Y4 반영
- [ ] `live`·`patterns`가 빈 맵인 상태(코덱스 보고대로 후속) — §3.2 계약과의 간극을 6단계/P5.4 티켓으로 명시 등재
- [ ] `counters()`를 `ApmCollectorMetricStore`에 연결(6단계 범위)
- [ ] R4·R6: 40연결 실제 상한 부하·힙, Y7의 tick 소요·할당률, 아파치 `mod_proxy_http` 경유 종료→브라우저 지연
- [ ] 전체 `:test` 1회(호스트 메모리 확보 후) — 이번 검수는 선별 424건 + IT 11건만 실행
