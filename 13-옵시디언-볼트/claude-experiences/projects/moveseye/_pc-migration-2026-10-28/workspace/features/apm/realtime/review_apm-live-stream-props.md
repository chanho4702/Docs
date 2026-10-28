# 검수 요청 — APM 실시간 관제 SSE 동시 시청 상한을 설정으로 승격

- 요청: Claude · 2026-09-23 · 사용자 결정 "설정 승격만 바로 하고 나머지는 백로그에 적어둬"
- 근거: 코덱스 의견 [review_apm-live-sse-concurrency_codex.md](../../../_archive/features/apm/realtime/review_apm-live-sse-concurrency_codex.md) 권고 2("상한을 검증된 설정 묶음으로 승격")
- 검수 등급: 코덱스 `gpt-5.6-sol`(high), 읽기 전용
- 티켓 **#ZM-122** · BE 커밋 **`2339a2d`**(master, 미푸시)

## 범위 (BE `moveseye-be-spring`, 5파일)

| 파일 | 변경 |
|---|---|
| `premium/apm/overview/live/spans/ApmLiveStreamProperties.java` | **신설**. `@ConfigurationProperties("app.apm.live.spans.stream") @Validated record` 6키(`maxActive` 1~500 · `maxWaiting` 0~200 · `perUser` 1~16 · `maxSnapshots` 1~16 · `queueMib` 8~64 · `writeTimeoutMs` 200~30000). null → 코드 기본값(40/10/4/2/8/2000 = 승격 전 상수). compact ctor에서 `perUser > maxActive`면 `IllegalStateException` |
| `LiveStreamLimits.java` | `defaults()` → `from(ApmLiveStreamProperties.defaults())`. `from(p)`가 프레임·part·로그 예산은 상수로 두고 동시 시청 6값만 설정에서 받는다 |
| `LiveSpanStreamService.java` | `@Autowired` 생성자에 `ApmLiveStreamProperties` 주입 → `LiveStreamLimits.from(stream)`. `snapshotWorkers` 풀 크기를 `limits.snapshots()`(= `max-snapshots`)로 — 전엔 상수 2였다 |
| `application.yml` | `app.apm.live.spans.stream:` 블록 + 환경변수 `APM_LIVE_STREAM_{MAX_ACTIVE,MAX_WAITING,PER_USER,MAX_SNAPSHOTS,QUEUE_MIB,WRITE_TIMEOUT_MS}` + 경고 주석 |
| `test/.../ApmLiveStreamPropertiesTest.java` | **신설** 3건: 기본값 = 옛 상수 · 설정값 전달 · `per-user > max-active` 거부 |

## 의도

동작을 바꾸지 않는다. 키를 전부 생략한 설치본은 승격 전과 byte 단위로 같은 `LiveStreamLimits`를 갖는다. 고객사마다 관제 인원이 달라 상한을 재빌드 없이 조정할 수 있게 하는 것이 전부다.

## 중점 확인 요청

1. **기본값 동일성** — `LiveStreamLimits.from(defaults())`가 승격 전 `defaults()` 상수 16개와 같은가(테스트가 6개만 대조한다 — 나머지 10개 상수 자리 순서가 record 파라미터 순서와 맞는지).
2. **`snapshotWorkers` 풀 크기 변경** — 전엔 고정 2, 지금은 `max-snapshots`. `Math.max(1, …)` 방어가 있으나 16까지 열었을 때 snapshot 직렬화가 서비스 락을 잡는 구간(`LiveSpanStreamService` snapshot 경로)에서 경합이 커지는지. 상한 16이 과한가.
3. **교차 검증 위치** — compact ctor의 `IllegalStateException`이 Spring 바인딩 실패 메시지에 묻히지 않는지(`@Validated` 위반과 달리 `BindException`으로 감싸이는가). 기동 로그에서 원인이 읽히는지.
4. **`queue-mib` 하한 8의 근거** — 프레임 2 MiB × part 4와 짝. `LiveStreamLimits.frame`·`parts`가 상수로 남았으니 그 둘을 나중에 바꾸면 하한 8이 어긋난다 — 상수와 하한을 한 곳에서 묶을 방법이 있는지(예: `@Min` 대신 compact ctor에서 `frame*parts/MIB`로 계산).
5. 빈 문자열 명시(`APM_LIVE_STREAM_MAX_ACTIVE=`)의 거동 — `Integer` 변환 실패로 기동이 죽는 것이 의도(조용히 기본값으로 접히지 않게). 실제로 그런지, 아니면 Boot의 relaxed binding이 빈 값을 null로 접어 기본값이 되는지.

## 검증 현황

- `:test --tests '*spans*'` + `ApmLivePropertiesTest` + `ApmSchemaIT` 통과(16 클래스).
- 🔴 **런타임 미검증** — 현재 dev BE(PID 40416)는 승격 전 코드로 떠 있다. 재기동은 사용자 요청 시에만.

## 검수 결과

(코덱스 기록)

---

# 검수 요청 2 — 동시 시청 가시성·대기 UX·효율 (2026-09-23 밤, 백로그 B6 #1·#2·#6 · B7 #2②·#3·#4)

- 사용자 결정 "테스트는 미루고 구현 위주". 커밋 BE **`3f731d5`** · FE **`105c8bf`**(master, 미푸시).

## BE (`moveseye-be-spring`, 9파일)

| 파일 | 변경 |
|---|---|
| `spans/ApmLiveStreamStatsDto.java` | **신설** — `enabled·limits·connections{total,active,waiting,users,mine,views,snapshotsInFlight}·counters·seq·streamEpoch·startedAt·serverTime`. 수만(계정 식별자 없음) |
| `spans/LiveSpanStreamService.java` | `stats(user)`(synchronized, 연결 한 바퀴) · `start()`에 유효 상한 INFO 로그 1줄 · slf4j 로거 추가 |
| `spans/ApmLiveSpansStreamController.java` | `GET /apm/live/spans/stats` — `@VisitorIdCheck`, `access.requireRead`, 🔴 MCP는 `ForbiddenError`(스트림과 같은 정책) |
| `spans/LiveSpanFrames.java` | `payload`의 `live`를 `index == 0`에만(그 외 `Map.of()`) — `removeServices`와 같은 규칙 |
| `live/LiveRuntimeMetrics.java` | `ageSeries` 메모(`seriesRevision` + 초) · `AgeHistory.at/flowAt`(copyOfRange) → `has/addTo/hasFlow/addFlowTo`(제자리 합산) · 신선 이력 목록을 한 번만 고름 |
| 테스트 4 | `LiveSpanStreamServiceTest.statsCount…` · `ApmLiveSpansStreamControllerTest.statsReturn…`(MCP 403 포함) · `LiveSpanFramesTest`(multipart live 첫 part만) · `LiveRuntimeMetricsTest.seriesIsMemoized…` |

## FE (`moveseyee_fe`, 17파일)

- `types/apm.ts` `TApmLiveStreamStatsDto` · `services/apm.api.ts` `getLiveSpansStats` · `constants/queryKey.ts` · `hooks/useApmLive.ts` `useApmLiveSpansStats(enabled, 15s)`.
- `hooks/useApmLiveSpans.ts` `disconnect()`(stop → `stopped`, 자동 재접속 없음).
- `ApmLiveStreamNotice.tsx` — 분기 4: disabled / **too-many(429)** / stopped / **queued**. `isLiveTooManyConnections` export. 배너에 "내 연결 n/4"·"탭 m개" 안내·대기엔 "연결 끊기".
- `ApmRealtimePage.tsx` stats 1회 읽어 두 탭에 전달 · `ApmActiveTab.tsx`/`ApmXViewTab.tsx` 헤더 "내 연결·전체 시청", 429면 `ApmQueryError` 숨김, 요청 관제 탭 "연결 끊기" 버튼.
- `liveSpans/inflight.ts` asOf 0 제외 · `ApmLiveInFlightList.tsx` `summary_no_age` · locale kr/en 10키.
- 테스트: ActiveTab 3건(대기 배너·429 배너·stats 없음) · 훅 1건(disconnect) · inflight 1건(asOf 0) · 페이지 테스트 mock 추가.

## 중점 확인 요청

1. **`stats()`의 `waiting` 정의** — "구독 전이고 closeAfterWrite 아님"이라 대기열(`paused`) + 다음 tick에 입장할 연결이 섞인다. 화면은 안 쓰고 운영 진단용인데, 이름이 오해를 부르는지(예: `pending`).
2. **`live` 첫 part만** — `pack()`의 overhead 계산이 index 0 payload로 하므로 뒤 part는 과대 추정(안전). FE `merger.frame`이 part별 `Object.entries(part.live)`를 돌리므로 빈 맵 no-op이 맞는지, snapshot 뒤 `buffered` 재생 경로도 같은지.
3. **시계열 메모** — `seriesRevision` 증가 지점(put·putFlow·회수)에 빠진 변경이 있는지. 특히 `record()`의 `claim` 거부(늦게 온 옛 점)는 이력을 안 바꾸는데 revision은 올라간다(무해, 캐시 미스). 반대로 이력이 바뀌는데 revision이 안 오르는 경로가 있으면 stale 결과가 1초까지 남는다.
4. **`disconnect()` 뒤 `tick()`** — `state.idleClosed`가 아니고 `stopped`라 재오픈 분기(`idleClosed && !hidden`)를 안 탄다. `visibilitychange`·URL 변경(effect 재실행)에서 다시 열리는 것은 의도(새 마운트=새 연결).
5. **stats 폴링 비용** — 15초 × 시청자 수의 GET. `stats()`는 synchronized라 tick과 경합하지만 O(연결 수). 40명이면 초당 2.7회.
6. MCP 403을 `ForbiddenError`로 던지는데 스트림은 200+control이다 — 일반 REST라 JSON 403(실제 HTTP는 전역 핸들러 규칙대로 200+code 403)이 맞는지.

## 검증 현황

- BE: 위 테스트 클래스 6개 통과(Frames·StreamService·Controller·RuntimeMetrics·ContractGolden·RuntimeStream).
- FE: `tsc` 0 · eslint 0 · realtime 테스트 6파일 111건 통과.
- 🔴 런타임 미검증(BE 재기동 필요, 사용자 요청 시).

## 검수 결과 (코덱스 gpt-5.6-sol/high, 2026-09-28) — 요청 1·2 합산

원문: `scratchpad/codex_out_be_stats.md` · `codex_out_fe_stats.md`(세션 임시). 양쪽 모두 **"수정 후 가능"** → 아래 전건 반영 뒤 재테스트 통과.

| # | 등급 | 지적 | 반영 |
|---|---|---|---|
| BE-1 | 🟢 | 기본값 16개·순서 승격 전과 동일 | — |
| BE-2 | 🟡 | `max-snapshots` 16까지 열면 서비스 락·CPU 경합(데이터 race 아님) | **미반영**(상한 유지). 문서 §7.12a에 "실측 없이 4 초과 금지" 문구, 부하 시험(B7 #1) 항목 |
| BE-3 | 🟢 | compact ctor 예외는 기동 로그에서 읽힘(추정) | — |
| BE-4 | 🟡 | `queue-mib` 하한 8이 frame×parts와 따로 놂 | ✅ `LiveStreamLimits.from`에서 `queue ≥ frame×parts` 검증 + 테스트 |
| BE-5 | 🔴 | 빈 환경변수가 조용히 기본값으로 복귀 | ✅ `requireNonBlank(Environment)` + `BlankValueGuard` 컴포넌트(기동 실패) + MockEnvironment 테스트 |
| BE-6 | 🟡 | `waiting`이 대기열과 입장 예정 연결을 섞음 | ✅ `queued`/`pending` 분리(DTO·FE 타입·계약) |
| BE-7 | 🟡 | `pack()` overhead가 뒤 part도 live 포함 크기로 과대 | ✅ `overheadFirst`/`overheadRest` |
| BE-8 | 🟢 | `seriesRevision` 누락 경로 없음, 잠금 안에서 읽음 | — |
| BE-9 | 🟢 | `disconnect()` 재접속 없음 | — |
| BE-10 | 🟡 | stats 폴링이 tick 잠금과 convoy(최대 설정 시) | ✅ `refreshStats()`가 tick·connect·close에서 굳힌 volatile 스냅샷을 `stats()`가 잠금 없이 읽음 |
| BE-11 | 🟢 | MCP 거부 = 전역 계약(200+code 403)과 일치 | — |
| BE-12 | 🟡 | MCP 테스트가 예외만 확인(200+403 미검증) | **미반영** — 컨트롤러 테스트가 standalone(전역 핸들러 미포함) 패턴. 다른 APM 컨트롤러 테스트도 같음 |
| FE-1 | 🔴 | asOf 0 행이 항상 맨 앞 + 경과 수십 년 | ✅ `apmLiveActiveRowStart`(null → 뒤로, 경과 긴 순)·`apmLiveActiveRowElapsed`(보정 없음) + 테스트 |
| FE-2 | 🔴 | 429 뒤 대기열 진입 시 too-many가 queued를 가림, 재연결 뒤 옛 순번 잔존 | ✅ paused에서 error·retryAt 소거, retry/stop에서 queuePosition 소거, 배너 순서 queued 우선 + 훅·탭 테스트 |
| FE-3 | 🟡 | retryable 429 배너에 버튼 없음 | ✅ stopped 아니면 "연결 끊기", stopped면 "다시 연결" |
| FE-4 | 🟢 | disconnect 뒤 재오픈 없음 | — |
| FE-5 | 🟡 | `stopped` 불변식 미명시(IDLE_MS>0 시 재개) | ✅ 재개 분기에 `!state.stopped` |
| FE-6 | 🟡 | stats 폴링이 403·라이선스로 멈춘 뒤에도 계속 | ✅ `!(stopped && error)`일 때만 |
| FE-7 | 🟢 | `instanceof ApiEnvelopeError` 안전 | — |
| FE-8 | 🟡 | 테스트가 캐스팅으로 타입 우회·페이지 전달 미검증 | **미반영**(사용자 결정: 테스트 보강은 후순위). 배너 회귀 2건은 추가 |
| FE-9~11 | 🟢 | i18n 9키 양쪽 존재·접근성·정보 노출 낮음 | — |

반영 커밋: BE **`fbcee63`** · FE **`7fa65a6`**(master, 미푸시).

재검증: BE 7클래스(Props·Frames·StreamService·Controller·Golden·RuntimeStream·Budget) 통과 · FE tsc 0·eslint 0·realtime 5파일 109건 통과. 런타임 미검증.
