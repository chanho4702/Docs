# APM P5.2 실시간 X-View 화면 — FE 검수 (읽기 전용)

- 대상: worktree `C:\solutions\moveseyee_fe-p5`, 브랜치 `p5-xview`, 커밋 `1f09355` (35파일 +3,520/−62)
- 검수자: Claude (fe-engineer 역할) · 2026-09-16
- 근거 정본: BE 골든 `moveseye-be-spring/src/test/resources/apm/contract/*.golden.json` 23개(최종 정본) · `features/apm/realtime/devdesign_apm-realtime.md` v4.5 §2.5·§3.2·§3.3 · `features/apm/realtime/devdesign_apm-realtime-ux.md` v1.3 §0·§2 · `features/apm/realtime/contract_apm-p5-live.md`
- 구현 보고서(`review_apm-p52-fe_codex-impl.md`)는 **0바이트**라 커밋 `1f09355`의 메시지와 코드 자체만 근거로 삼았다.
- 🔴 **3건** · 🟡 **12건** · 🟢 주요 확인 다수
- **병합 판정: 🔴 3건 중 #1·#2를 고친 뒤 병합.** #3(테스트 공백)은 같은 라운드에서 함께 처리 권고.

---

## 0. 실행 수치 (전부 이 검수에서 직접 돌린 값)

| 항목 | 결과 |
|---|---|
| `npx jest src/pages/application-monitoring/realtime` | **6스위트 105건 green** (커밋 주장과 일치) |
| 위 + `apmRoutes`·`apmHelpContent`·`apmAdminGating` | **9스위트 185건 green** |
| `npx vite build` | **성공 (exit 0, 37.17s)** — `index-e9f0b708.js` 9,838.93 kB(gzip 3,037.21 kB), 500kB 초과 경고는 기존 레포 공통 |
| `npm run typecheck:contract` | **통과 (exit 0, 에러 0)** |
| `git diff --check` / `git status --porcelain -uall` | **둘 다 깨끗** — 워크트리 임시 파일·공백 오류 없음 |
| 변이 3종 후 원본 md5 | `store.ts 91f6ced5…` · `view.ts 44c46d53…` **복원 일치 확인** |

커밋이 말한 "선별 243건/13스위트"는 내가 고른 범위(9스위트 185건)와 선택이 달라 수치가 다르다. 두 값 모두 green이므로 불일치가 아니다.

---

## 1. 🔴 3건

### 🔴-1 기본 탭(`?tab=active`)에서도 X-View 투영이 매 tick 전량 계산된다

- `ApmRealtimePage.tsx:28` — 탭과 무관하게 `<ApmXViewTab … visible={tab === "xview"} />`를 항상 렌더
- `ApmXViewTab.tsx:121` — `<section hidden={!visible}>` (DOM만 숨김)
- `ApmXViewTab.tsx:79` — `const projection = useMemo(() => buildLiveSpansProjection(...), [store, to, route, inst, hiddenSeries, revision])` — **`visible` 가드가 없다**

`to = live.serverTime`와 `revision`이 1초마다 바뀌므로 **기본 진입 탭에서 아무것도 안 보이는 채로 매초 전량 투영**이 돈다. `ApmLiveScatter.render()`는 `!latest.visible`에서 빠져나가지만(그건 맞다), 그보다 앞의 투영 계산이 메인 스레드를 잡는다. UX §0이 정한 기본 탭이 `active`(P5.3 자리)이므로 **모든 사용자가 메뉴를 열자마자 이 비용을 낸다**.

**실측** (plain node/V8 v22, esbuild 번들, warm-up 3회 후 5회 평균):

| 창 안 점 수 | 필터 없음 | 범례 1개 끔 |
|---|---|---|
| 120,000 | 97 ms | 136 ms |
| 480,000 | 167 ms | 685 ms |
| 900,000 | 564 ms | **1,399 ms** |

(참고: 같은 벤치를 jest/ts-jest에서 돌리면 471 / 1,558 / 3,420 ms — 그래서 plain node 수치를 근거로 쓴다.)

정본 §3.3의 보관 목표는 서비스당 초당 200점 · 전역 1.3M이다. 5분 창 × 4서비스 만석 = 240,000점이 정상 범위이고, 그 지점에서 이미 **tick 예산(1초)의 상당 부분**을 숨겨진 탭이 먹는다.

**수정안** — `ApmXViewTab.tsx:79`
```ts
const projection = useMemo(
  () => (visible ? buildLiveSpansProjection(store, to, { route, inst, hidden: hiddenSeries }) : EMPTY_PROJECTION),
  [visible, store, to, route, inst, hiddenSeries, revision]);
```
`EMPTY_PROJECTION`은 모듈 상수 1개(빈 `Float64Array` 5개·`rows: []`·카운트 0). 탭 복귀 시 `visible`이 바뀌며 자동 재계산되므로 추가 배선은 없다. 배지 줄(`counts`·`retained`)만 탭과 무관하게 필요하다면, 그 세 값(`observedCount`·`retainedSlots`·`provisionalFrom`)은 **버킷 순회만으로** 얻어지므로 점 주사 없는 경량 함수로 분리하면 된다(현 `view.ts:64~70` 루프가 그대로 그 함수다).

### 🔴-2 `buildLiveSpansProjection`이 `pointIndex`를 tick마다 3회 전수 주사하고, 점마다 객체를 만든다

`view.ts:60~121`의 구조:

1. `view.ts:92` — 1차: `for (const [key, entry] of store.pointIndex) if (qualifies(...))` (전수 1)
2. `view.ts:99~107` — `for (const emphasis of [true, false])` 안에서 **다시 `store.pointIndex` 전수**(전수 2·3), 각 점마다 `qualifies()` 재평가
3. `view.ts:86~89` — `qualifies()`는 **`filters.hidden.length`가 0이 아니면 점마다 `resolveLiveSpansPoint()`를 호출**한다. 즉 범례를 하나라도 끄면 전수 3회 × 점 1개당 객체 1개가 생성된다 (위 표의 685 ms / 1,399 ms가 이 경로다)
4. `view.ts:103` — 상한 도달 후에도 `continue`만 하고 **루프를 끊지 않는다**(`break` 없음)
5. `view.ts:71,104~106` — 선택되지 않은 브러시 상태에서도 최대 `cap`(300,000)개의 `TApmLiveSpansRow` 객체를 매초 만든다. `rows`를 실제로 쓰는 곳은 브러시 선택(`selectLiveSpansRows`)과 hover 인덱스뿐이다
6. `hover.ts:157~173` — `buildLiveSpansHoverIndex`가 그 `rows`를 **또 한 번** 전수하며 `Float32Array` + 중첩 `Map` + 배열을 매 렌더 재구축한다

UX §2.11 정본은 이렇게 적었다:

> 버킷 키는 **`(serviceId, b)`** … 구조: `Map<serviceId, Map<b, Bucket>>`, **렌더 시 창 안 버킷을 서비스 순으로 이어 붙인다.**

자료구조 자체(`store.ts:11`)는 계약대로 `Map<number, Map<number, Bucket>>`이 맞다(🟢). 그런데 **렌더는 그 버킷 맵이 아니라 전역 `pointIndex`(플랫 `Map<"traceId:spanId", …>`)를 훑는다.** `pointIndex`는 `?pt=`의 O(1) 역조회용 인덱스이지(UX §2.5 "클라이언트 인덱스 … O(1)") 렌더 경로가 아니다. 계약이 지정한 "창 안 버킷 이어 붙이기"로 바꾸면 창 밖 점을 아예 만나지 않고, 버킷마다 `base`/`emphasis` 배열이 이미 갈라져 있어 계층 분리 루프도 사라진다.

**수정안** (한 번의 순회로 끝난다)
```ts
// 1) 버킷만 순회하며 count + 각 계열 길이를 센다(점 객체 생성 없음).
//    seriesId는 flags 비트와 layer로 즉시 나온다 — resolveLiveSpansPoint 호출 금지.
// 2) 길이를 확정한 뒤 Float64Array를 한 번 할당하고, 같은 버킷 순회로 채운다.
// 3) rows는 "브러시 선택이 있을 때"와 "hover 인덱스"만 필요하므로,
//    전체 rows 대신 (serviceId, b, pointIdx) 3원소 Int32Array 병렬 배열을 들고
//    필요한 시점에만 resolveLiveSpansPoint로 승격한다.
```
`qualifies()`의 `hidden` 분기는 아래 한 줄로 대체된다(객체 생성 0):
```ts
const status = flags & (FLAG.HTTP_5XX | FLAG.SPAN_ERROR) ? "error" : flags & FLAG.SLOW ? "slow" : "ok";
const seriesId = layer !== "base" ? (status === "error" ? "emph-error" : "emph-slow") : `base-${status}`;
if (filters.hidden.includes(seriesId)) continue;
```
`view.ts:36~44`의 산식과 동일하므로 로직 변경이 아니라 **추출**이다. 기존 `apmLiveSpansView.test.ts` 250행이 그대로 회귀 그물이 된다(이 스위트는 산식만 보고 내부 순회 방식을 보지 않는다 — 이번 리팩터링에 유리한 성질이다).

### 🔴-3 `begin()`의 "직전 미완 버퍼 폐기"가 테스트로 보호되지 않는다 — 변이 생존

정본 §3.2 병합 규칙 2가 🔴로 못 박은 항목이다:

> 🔴 **FE는 새 `snapshot.begin`이 도착하면 직전 미완 snapshot의 청크 버퍼를 즉시 폐기하고 새 `snapshotId`로 다시 모은다**

구현(`store.ts:139 this.discardIncomplete()`)은 **맞다**. 문제는 **그 줄을 지워도 105건이 전부 통과한다**는 것이다.

**변이 B 결과**: `store.ts:139`의 `this.discardIncomplete();` 한 줄 제거 → `6 suites / 105 tests 전부 passed`. 잡히지 않았다.

**원인**: `begin()`은 마지막에 `this.pending = {…}`를 무조건 덮어쓴다(`store.ts:147`). 그래서 **청크 버퍼(`pending`)는 그 대입만으로 리셋되고**, `discardIncomplete()`가 실제로 지키는 것은 남은 둘 — `this.buffered`(확정 전 도착한 `spans` 프레임, 상한 30)와 `this.parts`다. 기존 테스트(`apmLiveSpansMerge.test.ts:156~172`)는 **chunk 순서만** 확인하므로 이 둘을 건드리지 않는다.

**재현** (이 검수에서 임시 테스트로 확인 후 삭제, 워크트리 clean):
```
begin(#1) → spans(seq 1, sinceSeq 0)   // pending이 있으니 buffered로 들어간다
→ begin(#2, snapshotId="snapshot-retry") → chunk×2 → end(#2)
기대: cursor.sinceSeq === 0   (1차 시도의 프레임은 남의 것이라 버려야 한다)
현재 코드: 0  ✅
변이 B:   1  ❌  ← 남의 시도의 프레임이 새 snapshot에 섞여 커서가 전진한다
```
이 상황은 가정이 아니라 **정본이 명시한 정상 경로**다 — §3.2 규칙 2는 "전송량 상한 초과 시 서버는 `snapshotKeepRatio`를 낮춘 **새 `snapshotId`로 `begin`부터 다시** 보낸다(최대 3회)"고 적었다. 15분 view 만석에서는 `snapshotKeepRatio ≈ 0.83`으로 항상 솎이므로 재시작이 드문 일이 아니다.

**수정안**: `apmLiveSpansMerge.test.ts`의 "새 begin이 오면…" describe에 위 재현을 그대로 한 건 추가한다. 코드 수정은 필요 없다.

**나머지 변이 2건은 정상적으로 잡혔다**(그물이 전부 무른 것은 아니다):

| 변이 | 위치 | 결과 |
|---|---|---|
| A. `pointsRev`/`statsRev`를 한 축으로 합침 | `store.ts:57` → `statsChanged = pointsChanged \|\| !previous` | **2건 실패로 검출** ✅ |
| B. 새 begin의 버퍼 폐기 제거 | `store.ts:139` | **생존** 🔴 |
| C. `observedCount`를 `base.observed + emphasis.observed`로 | `view.ts:67` | **2건 실패로 검출** ✅ |

---

## 2. 🟡 12건

| # | 항목 | 위치 | 내용 |
|---|---|---|---|
| 🟡-1 | 403에 "다시 연결" 버튼이 없다 | `useApmLiveSpans.ts:94` · `ApmXViewTab.tsx:146` | 403 분기가 `state.stopped = false`로 두어 `{stream.stopped && <Button onClick={stream.reconnect}>}`가 렌더되지 않는다. 정본 §2.5 상태 머신은 "로그인/권한 변화 **또는 사용자 재시도로만** 새 연결", UX §2.8 표도 "재시도 없음 — … 또는 사용자 재시도"다. **자동 재시도 금지가 맞고 수동 경로 제거는 과하다.** `stopped = true`로 두되 카운트다운 버튼(`retryAt`)은 `null`로 유지하면 계약과 맞는다 |
| 🟡-2 | 점 상태 i18n 키에 점(`.`)이 들어 있다 | `kr/en.json` `apm.realtime.point_state.{stored.spanMissing,notFound.pending}` | i18next 24.2.3의 `deepFind` 평면 폴백(문자열을 만나면 더 긴 조인 키를 다시 시도)에 **전적으로 의존**한다. `keySeparator` 설정 변경·판올림이면 사용자에게 키 문자열이 그대로 보인다. `apmLiveSpansPointDetail.test.ts:141~`이 이 위험을 주석으로 적고 8키 해석 테스트까지 붙였다(성실하다). 그러나 **UX §4.6의 키 초안은 애초에 점을 안 썼다** — `apm.xview.point.{span_missing, not_found_pending}`. 명세대로 `stored_span_missing`·`not_found_pending`으로 바꾸고 상태명→키 매핑 1줄을 두면 위험 자체가 사라진다 |
| 🟡-3 | URL 갱신이 전부 push | `ApmXViewTab.tsx:61~65` (`setSearch(fn)` 기본 push) | 레포 관례는 `useQueryParams.updateParams(params, replace = true)`(89개 페이지 사용, 본 페이지는 `useSearchParams` 직접 사용 7개 중 하나). 브러시 드래그(200ms debounce)·`←/→`의 `at` 1초 이동마다 히스토리가 쌓여 뒤로가기로 페이지를 벗어나기 어렵다. 권고: `sel`·`route`·`inst`·`win`·`svc`·`env`는 `replace`, `pt`·`at`·`tab`은 push(뒤로가기로 패널 닫기가 자연스럽다) |
| 🟡-4 | `replay`가 실패 카운터를 잠식 | `useApmLiveSpans.ts:117` → `retry(undefined, false)` → `:60 failures += 1` | seq 갭은 **연결 실패가 아니라 재생 요청**이다(정본 §2.5 "재생 요청 또는 snapshot"). 지금은 갭 5회 연속이면 `stop()`으로 끊긴다. 정본의 "연속 실패 상한 5회"는 retryable 재시도에 대한 규정이므로 `replay` 경로는 카운터를 올리지 않는 편이 맞다 |
| 🟡-5 | `degraded` 3분기 중 1개만 테스트 | `useApmLiveSpans.test.tsx:239~251` | 테스트 제목은 "reason 3분기"인데 `connection_queue`만 검증한다. i18n 키 3개(`degraded.{connection_queue,frame_limit,arena_pressure}`)는 다 있으므로 `it.each`로 3건 돌리면 된다 |
| 🟡-6 | X-View 위젯 도움말이 1개뿐 | `apmHelpContent.test.ts` `WIDGET_KEYS`에 `"xview"` 추가 | UX §4.4 표는 **4개**를 요구한다 — `xview_scatter`·`xview_brush_table`·`xview_point_panel`·`xview_patterns`. 구현은 `xview` 하나를 산점도 카드(`ApmXViewTab.tsx:169 helpKey="xview"`)에만 달았고, 브러시 표(`ApmLiveSelectionTable`)·점 패널(`ApmLivePointDrawer`)에는 `helpKey`가 없다. 122→123 갱신 자체는 정당하지만 **명세 대비 3개 미달**이다(패턴은 P5.4라 유예 가능) |
| 🟡-7 | `LIMIT.TICK_MS`를 "초→ms 환산 상수"로 오용 | `store.ts:35` · `view.ts:63,132,147,148` · `ApmXViewTab.tsx:115,145,151,152,162` | `snapshotSeconds * LIMIT.TICK_MS`로 창 길이를, `/ LIMIT.TICK_MS`로 "n초 전"을 계산한다. 지금은 `TICK_MS = 1000`이라 우연히 맞지만, tick 주기를 바꾸면 **창 길이·보존 경계·경과 초 표시가 한꺼번에 깨진다**. `MS_PER_SECOND = 1000` 상수를 따로 두고 의미를 갈라야 한다 |
| 🟡-8 | `epochChanged` 뒤 유실 프레임이 재접속을 유발 | `useApmLiveSpans.ts:100` | `merger.clear()`가 `cursor`를 `null`로 만든 뒤, 새 `snapshot.begin` 전에 `spans`가 한 건이라도 오면 `store.ts:198 if (!cursor) return "snapshot"` → `retry(undefined, true)`로 **연결을 끊는다**. 정본·UX 모두 "**연결 유지**, 가진 것 전부 버리고 snapshot 대기"다. `epochChanged` 플래그가 서 있는 동안은 `spans`를 조용히 버리는 분기가 필요하다 |
| 🟡-9 | `heapPct` 타입이 BE와 다르다 | `types/apmLiveSpans.ts:39` | FE는 `heapPct: TApmLiveSpansResource \| null`(객체). BE `LiveSpanRuntimePayload.java:39`는 `"heapPct", average(heap)` — **`Double` 스칼라**다(`cpuPct`만 객체). 골든의 `heapPct`가 하필 `null`이라 픽스처도 `typecheck:contract`도 통과한다. 지금은 아무 데도 안 그리지만 P5.3이 `live{}`를 소비하는 순간 터진다. 함께: BE가 조건부로 싣는 `truncated`·`identityIncomplete`(같은 파일 41~42) · `liveTruncated`(`LiveSpanSnapshot.boundBeginLive`)가 FE 타입에 없다 |
| 🟡-10 | `typecheck:contract`가 realtime 테스트 파일까지 포함 | `tsconfig.contract.json` | `exclude`가 `src/__tests__/**/*.test.ts(x)`만 걸러 `src/pages/application-monitoring/realtime/__tests__/*.test.ts(x)` 5개가 게이트에 들어온다(`tsc --listFiles` 실측). 지금은 전부 통과하나, jest mock의 부분 객체가 늘면 계약 신호를 덮는다. 설정 주석의 의도("테스트 본문은 뺀다")와 동작이 다르다 |
| 🟡-11 | 사이드바 아이콘 중복 | `SideNav.tsx` realtime 항목 | `overview`와 같은 `<DashboardOutlined />`. 개요 바로 아래 2번째라 시각적으로 구분되지 않는다 |
| 🟡-12 | `apmRoutes.test.tsx` 제목에서 "설명 14"가 사라짐 | 해당 `it` 제목 | 단언 삭제는 없다(원래 그 `it`은 `apm.menu` 개수와 상세 탭만 봤고, `settings_menu_desc`는 별도 `it`이다). 제목의 stale 조각을 지운 것이라 문제는 아니나, **검수 이력에 남겨 "단언이 빠진 게 아니다"를 못 박아 둔다** |

---

## 3. 🟢 확인된 것 (검수 항목별)

### 항목 1 — 병합 규칙 5

| 규칙 | 구현 | 테스트 | 판정 |
|---|---|---|---|
| 커서 삼중 `(epoch, viewKey, seq)` | `store.ts:199~203` | `apmLiveSpansMerge.test.ts:189~231` (4건) | ✅ |
| `sinceSeq` 연속성 — 건너뛰기 금지 | `store.ts:203` → `"replay"` | :196 | ✅ |
| **중복 `seq` · Last-Event-ID 되감기 멱등** | `store.ts:202 if (frame.seq <= cursor.sinceSeq) return "none"` | :190 | ✅ 정본 §3.2 D2의 `sinceSeq = seq−1` 재전송을 그대로 흡수한다. 멀티파트 중간에서 끊겨도 `parts`가 `part.index` 키라 같은 파트 재수신이 덮어쓰기로 멱등하다 |
| **순서 뒤바뀐 프레임** | 앞선 seq → `"none"`, 건너뛴 seq → `"replay"`(재접속+커서) | :190, :196 | ✅ |
| `pointsRev`/`statsRev` **독립** | `store.ts:56~79` — 두 축을 각각 판정하고 `next`를 부분 갱신 | :271~367 (4건, 역행 rev까지) | ✅ 변이 A로 검출 확인 |
| `provisionalUntil` | `store.ts:78`(stats와 함께 이동) · `view.ts:69` → `ApmLiveScatter.tsx:86` markArea | 간접 | ✅ |
| `removeServices` | `store.ts:215~229` — **모든 part의 합집합을 먼저 모아** 적용하고 버킷·사전·`pointIndex`까지 지운다 | :251~268 | ✅ 정본 "ID 재사용 없음"을 정확히 지킨다 |
| 새 `begin` 시 직전 미완 버퍼 폐기 | `store.ts:139` | ❌ **없음** | 🔴-3 |
| 창 밖 버킷 폐기(규칙 9) | `store.ts:33~41` | :369~378 | ✅ |
| chunk 수·CRC32 체크섬 확정 | `store.ts:172~186` · `:89~106` | :112~154 (4건) | ✅ 정본 §3.2 D3의 "각 chunk의 `data:` JSON을 UTF-8 바이트로 이어붙인 CRC32"를 그대로 구현했고, **테스트가 원본 raw 문자열을 한 번만 만들어 흘려** 재직렬화 오염을 피한다 |

**모킹 우회 없음.** 병합 스위트는 `ApmLiveSpansMerger` 실물에 **골든 픽스처 JSON 문자열**을 넣는다. 훅 스위트도 merger를 목으로 바꾸지 않고 `FakeEventSource`만 심어 실제 병합을 통과시킨다(`useApmLiveSpans.test.tsx:39~92`).

### 항목 2 — control 6분기

정본 §2.5 상태 머신 전건이 구현+테스트됐다.

| 분기 | 구현 | 테스트 |
|---|---|---|
| 403 종료(재시도 없음) | `:92~94` — `control.code !== 403` 조건으로 retry 차단 | `①` :164 (새 연결 0개까지 단언) |
| 429 `retryAfterMs` + jitter | `:62~63` — `retryAfterMs ?? 15000`, `× (1 + random × 0.3)` = 정본 "jitter 0~30%" | `②` :182 (재접속 URL의 커서 3개까지 단언) |
| `paused{queuePosition}` | `:95~96` — **연결 유지**, `connection="queued"`, `loading=true` | `③` :218 (`source.closed === false`) |
| `degraded{reason}` 3종 | `:97~98` + i18n 3키 | `④` :239 (1종만 → 🟡-5) |
| `epochChanged` | `:99~101` — **연결 유지**, `merger.clear()`, snapshot 대기 | `⑤` :253 (버킷 0·커서 null) |
| 연속 실패 5회 중단 | `:61 LIMIT.FAILURES = 5` → `stop()` | `⑥` :269 (+ `reconnect()`로 해제까지) |

🔴 **`resume`을 기대하지 않는다 — 확인.** `useApmLiveSpans.ts`·`realtime/**`·`types/apmLiveSpans.ts` 전체에 `resume` 문자열이 **0건**이고, `TApmLiveSpansControl` union도 `reject|paused|degraded|epochChanged` 4종뿐이다. 테스트 `③`은 `// 🔴 BE는 resume을 보내지 않는다 — 새 begin이 재개 신호다` 주석과 함께 `streamSnapshot(source)`로 재개를 확인한다. 정본 §2.5 "v4.4까지 표에 있던 오기"와 정확히 맞다.

### 항목 3 — 배지 산식

- **`observedCount = Σ stats.count`** — `view.ts:67`. 🔴 **`base.observed + emphasis.observed` 합산은 코드 전체에 0건**(grep 확인). 변이 C로 검출력까지 확인
- **`displayedCount` = 그린 고유 `(traceId, spanId)`** — `pointIndex`가 `"traceId:spanId"` 키라 구조적으로 유일하고, base·emphasis 양쪽에 있는 점은 `layer: "both"` 1건으로 접힌다(`store.ts:68~73`) → 강조 기호가 이긴다(`view.ts:44`). 골든 한 버킷이 "더하면 3, 바르게 세면 2"로 갈리도록 설계돼 있어 테스트가 실질적이다(`apmLiveSpansView.test.ts:22~26,55~67`)
- **`retainedSlots = base.retained + emphasis.retained`** — UX §2.3이 요구한 그대로이고, 문구도 "서버 보관 **슬롯**"이라 겹침 포함임을 말한다 ✅
- **keepRatio 4종** — UX §2.3은 3종이 아니라 4종(서버·이 연결·snapshot·브라우저)을 요구하고, `apm.realtime.ratios`가 4개를 다 낸다 ✅
- **`arenaPressure`** — `ApmXViewTab.tsx:163`이 `pressure.arenaPressure > 0`를 조건으로 쓴다. UX §2.3 `[contract-r1 정정]`은 "값 자체를 조건으로 쓰지 말라"고 했지만, **BE가 고쳐졌다**: `LiveSpanStreamService.java:193~203`
  ```java
  // SSE pressure.arenaPressure는 이번 tick 구간 증분만 노출한다.
  // 연결이 없는 tick도 기준을 전진시켜 과거 압박을 새 연결에 전송하지 않는다.
  long totalPressure = ring.counters().arenaPressure.get();
  long pressure = Math.max(0, totalPressure - lastArenaPressure);
  ```
  진짜 구간 증분이고 연결 없는 tick도 기준선을 전진시킨다. **커밋의 "BE 구간값 전환으로 해소" 주장은 사실이다.** ✅ (→ §5 정본 갱신 대상)
- **연결 상태 3단** — `FRESH_MS = 12000`이 정본 "12초(≥ 2 × heartbeat 5초)"와 일치. `connected`(소켓) / `live`(갱신 중) / `stalled`(멈춤)로 3단이 갈리고, 나이 표시(`received_ago`)는 `aria-live` 영역 **밖**에 있다 — UX §2.10 "매초 나이 변화는 live region에 넣지 않는다"를 지켰다 ✅

### 항목 4 — 성능 계약(UX §2.11)

| 계약 | 구현 | 판정 |
|---|---|---|
| 버킷 키 `Map<serviceId, Map<b, …>>` | `store.ts:11` | ✅ |
| typed array | `view.ts:110` `Float64Array` (x,y 인터리브) | ✅ |
| `setOption(opt, {replaceMerge:['series'], notMerge:false})` | `ApmLiveScatter.tsx:102` — 문자 그대로 | ✅ |
| 계열 `id` 고정 6개 | `base-ok/slow/error` + `emph-slow/error` + `selected` | ✅ 정본과 정확히 같은 6개 |
| zoom 보존 | `:60` 재구성 전 `getOption().dataZoom` 읽어 다시 넣고, `:135 onZoom`·`:143 unmount`에서 `preservedRef`에 백업 | ✅ |
| brush 보존 | `:103` setOption 직후 `dispatchAction({type:"brush", areas})` 재적용, `:88/:106 updating` 플래그로 되먹임 차단 | ✅ |
| 선택 보존 | `selected` 계열이 별도 id — UX §2.5 "`emphasis` 계열이 아니라 별도 마커 계열 1개" 그대로 | ✅ |
| rAF 1회 병합 | `:108 schedule()` — `if (!renderFrame && …)` 단일 게이트 | ✅ |
| 숨김 탭 정지 | `:56`(render 진입 차단) · `:108`(schedule 차단) · `useApmLiveSpans.ts:179`(publish 차단) · `:169~172`(5분 초과 시 연결 종료, `IDLE_MS = 300000` = 정본 "5분") | ✅ |
| `ApmChartCard`는 껍데기만 | `ApmXViewTab.tsx:169` — 제목·helpKey·`controls={false}`만 쓰고 본문은 `ApmLiveScatter`가 `echarts.init` 직접 소유 | ✅ 정본 "`notMerge` 고정이라 양립 불가" 진단과 대응이 일치 |
| `dispose` | `ApmLiveScatter.tsx:146` | ✅ |
| **누수** | EventSource `close()` + 핸들러 6종 `removeEventListener` + `onopen/onerror = null`(`useApmLiveSpans.ts:157~160`), `clearInterval`, `visibilitychange` 해제, `retryTimer` 해제 / 차트 쪽 `cancelAnimationFrame` ×2, `ResizeObserver.disconnect()`, `matchMedia` 리스너 해제, `dispose()` | ✅ **전건 해제 확인.** `current !== source` 가드로 옛 소켓의 늦은 이벤트도 차단한다. 언마운트 시 소켓 종료는 테스트로도 단언(`:155`, "사용자당 4개 상한" 근거까지 주석) |
| **렌더마다 O(n) 스캔** | `view.ts:60~121`·`hover.ts:157` | 🔴-2 |

### 항목 5 — 점 클릭 상태 머신

- `pointDetail.ts:201` — `unknown \| checking \| stored \| stored.spanMissing \| notFound.pending \| notFound \| forbidden \| error` — UX §2.5 다이어그램과 **전이·조건까지 1:1**
- 🔴 **"HTTP 200 자체를 stored로 보지 않는다"** — `validateLiveSpansTraceEnvelope`(`:202~211`)가 envelope 실패·`traceId` 불일치·필수 수치 결측·`spans[]` 형태까지 검사한 뒤에만 `stored` 후보가 된다 ✅
- 🔴 **"미저장 확정" 문구 없음** — `notFound` = "현재 저장된 트레이스를 찾지 못했습니다. 정상 요청은 일부만 저장됩니다." 금지어 "저장되지 않았습니다"는 **0건**. `notFound`/`notFound.pending`/`stored.spanMissing`/`error` 전부에 [다시 시도] 버튼(`ApmLivePointDrawer.tsx:60~61`) ✅ 정본 "notFound는 종착 상태가 아니다"
- `PENDING_MS = 20000`이 UX "점 나이 < 20초"와 일치 ✅
- **403이 라우트 가드에 안 먹힌다 — 확인.** ① 이 API는 403을 HTTP 200 + envelope으로 내려 axios가 reject하지 않는다 ② `axiosInstance.ts`가 `window.location`을 만지는 경로는 **401 refresh 실패뿐**(:57~58, :144~146)이고 403 분기는 없다 ③ `resolveApiError`가 `code === 403` → `api_error.permission_denied`로 접고, `liveSpansPointState`가 그 키로 `forbidden`을 세운다 → Drawer 안에서 끝난다 ✅
- 🟡 참고: UX §0 `[R-P5.6 반영]`이 적은 "모듈 권한이 없으면 `PageWrapper`가 `/errors/404`로 먼저 보낸다"는 여전히 사실이다. 즉 `ApmRealtimePage.tsx:22`의 `canView` 403 배너는 "모듈 권한은 있고 `apm.view`만 없는 조합"에서만 도달한다 — 죽은 분기는 아니지만 **런타임 검증 시 그 조합으로 만들어야** 한다(→ §6)

### 항목 6 — URL 상태

- `?tab=` — 모르는 값은 기본 `active`로 접음(`ApmRealtimePage.tsx:14`), 테스트 3건 ✅
- 필터 — `route`/`inst`가 **문자열**(`svcUid:route`, `svcUid:instanceKey`)로 실린다. UX 표의 🔴 "사전 `routeId`(세대 종속)를 URL에 싣지 않는다"를 지켰고, `inst`는 `display`(앞 8자)가 아니라 `dict.instances[].key`(해시 16자)를 쓴다 — **v1의 폐기된 임시 동작이 아니라 v1.3 정본** ✅. 사전에서 사라지면 조용히 풀지 않고 `missingFilter` 경고 + [필터 해제] ✅
- `svc`/`env` 사전 검증(UUID·UTF-8 128B)으로 BE 400을 만들지 않는다 ✅ 테스트 3건
- **🔴 `at`의 의미 — 정확하다.** UX §0 "`at`의 약속"과 §2.8이 겉보기에 어긋나 보이지만 둘 다 만족한다:
  - §0: "그 시각 범위의 **현재 보관 표본**을 다시 조회한 것이지 당시 화면의 재현이 아니다" → 툴팁 `at_hint`가 정본 문구를 **축자 그대로** 담았다: *"이 시각 범위에 대해 현재 서버가 보관 중인 표본을 보여 줍니다. 당시 화면과 같지 않을 수 있습니다."*
  - §2.8: "🔴 보이는 점·통계·표를 함께 고정한다 … **정지 순간 창 안 버킷을 frozen 사본으로 떠서** 렌더는 사본에서, 수신은 계속 live 버킷에 병합" → `ApmXViewTab.tsx:69~77` `freezeLiveSpansStore`가 정확히 그것이다. `at`이 바뀌면(←/→) 사본을 **현재 live에서 다시 뜬다** = "현재 보관 표본 재조회" ✅
  - `store.ts:27~31`의 사본은 맵만 복사하고 버킷 객체는 공유하는데, `mergeBucket`이 항상 `{...previous}`로 **불변 교체**하므로(`:60,:80`) 사본이 오염되지 않는다 ✅
  - 복원 범위 3분기 `full`/`partial`/`unavailable`(`view.ts:145~151`)이 §0 세 경우와 1:1, `unavailable`도 `at`을 지우지 않고 트레이스 탐색 링크를 준다 ✅ 테스트 4건(골든이 갓 기동한 서버라 `full`이 안 나오는 함정까지 주석으로 짚었다)
  - "정지 후 +n초 · 새 관측 k건"(`:151`) · 5분 초과 연결 종료 배너(`:148`) ✅
- **같은 경로 query 변경이 SSE를 끊지 않는다 — 확인.** ① 훅 effect deps가 `[enabled, serviceUid, env, snapshotSeconds]`뿐이고 `:192`에 "URL tab/at/sel/pt/route/inst 변경은 연결 수명과 무관하다" 주석 ② SSE 소유는 페이지 1곳(`ApmRealtimePage.tsx:20`) ③ `App.tsx`의 리마운트 key가 `pathname`이라 query 변경은 리마운트하지 않는다 ④ `ApmRealtimePage.test.tsx:100~104`가 "탭이 무엇이든 SSE 연결은 페이지가 한 번만 소유한다"를 단언하며 주석에 사용자당 4개 상한 근거를 적었다 ✅
- push/replace → 🟡-3

### 항목 7 — 골든 대조

**23개 전부, 불일치 0건.** 골든 JSON과 픽스처를 경로 단위 deep-diff로 기계 대조했다.

- 누락 필드 0 · 허구 필드 0 · 필드명 오타 0 · 값/타입 차이 0
- 중첩 구조, 점 튜플 7원소, `null` 위치(`heapPct`·`config.p95ThresholdMs`·`config.errorRateThresholdPct`·`live."1".active.instances[2].value`)까지 일치
- control 15건은 `type`+`errorCode`+`reason`으로 1:1 매칭, 미매칭·잉여 0
- 골든 23개는 전부 P5 스트림 페이로드다(무관한 골든 섞임 없음). 같은 폴더의 `r-p5b-live-processors.golden`은 OTel Collector YAML이라 FE 수신 계약 대상이 아니며 제외가 맞다

**`typecheck:contract`가 이 픽스처를 실제로 검사한다 — 확인.**
- `package.json:17` → `tsc -p tsconfig.contract.json --noEmit`
- `tsconfig.contract.json`의 `include: ["src", "src/__tests__/fixtures"]`가 부모 `tsconfig.json`의 `exclude: ["src/__tests__"]`를 **덮어쓴다**(extends는 병합이 아니다). `tsc --listFiles` 실측으로 `apmLiveSpansContractSample.ts` 포함 확인
- **강제 형태: 강제된다.** export 9개 전부가 `as const`가 아니라 **명시적 타입 애노테이션**(`: TApmLiveSpansSnapshotBegin = {` 등, 39·88·121·196·207·247·264·274·352행)이라 **필수 필드 누락**과 **초과 프로퍼티** 양방향이 컴파일 에러가 된다. (메모리 `fe-contract-fixture-gate`의 "tsc가 강제한다는 주장이 허위였다" 전례와 달리, 이번에는 실측으로 확인했다)
- 곁가지 → 🟡-10

**커밋의 "계약서가 stale이었다" 주장 3건 검증:**
1. `stats.minMs`·`sumMs` — **사실.** 골든 `snapshot.chunk.buckets`에 `"minMs": 40.0, "sumMs": 12040.0`이 실제로 있고 `LiveSpanStreamCodec.java:77`이 직렬화한다
2. `live{}` 공급 — **사실.** `spans.golden.json`에 `active{value,observedInstances,expectedInstances,expectedIsEstimate,asOf,instances[]}` + `cpuPct{avg,max,observedInstances,asOf}` + `threads`가 실렸다. 단 `spans.empty-dict.golden.json`은 `"live": {}`라 **양쪽 다 온다** — 픽스처가 두 경우를 다 담은 것이 정확하다
3. `arenaPressure` 구간값 — **사실이나 근거는 골든이 아니다.** 골든값이 양쪽 다 `0`이라 의미론이 안 나온다. 근거는 BE 코드(`LiveSpanStreamService.java:193~203`)이고, 픽스처 주석(220~221행)도 BE 주석 인용으로 정직하게 적었다

### 항목 8 — 문구·i18n·접근성

- **금지 문구 0건.** `apm.realtime.*` 106키를 평탄화해 kr(`병렬`·`미저장`·`저장되지 않`·`전체 목록`·`화면 전량`·`오류·느림은 유지`·`정상 표본만`·`초 단위`·`비동기 작업이 없`)·en(`parallel`·`not stored`·`full list`·`entire list`) 전수 검색 → **hit 0**. (레포 전체의 "병렬" 3건은 기존 워터폴/플레임 도움말이고 이 커밋과 무관하며, UX §3이 금지한 것은 비동기 화면의 "병렬 실행"이다)
- 명세가 요구한 대체 문구가 그대로 들어갔다:
  - `browser_reduced` = "브라우저 추가 축소에서 **강조 계층 우선 유지**({{ratio}})" — UX §2.9 지정 문구
  - `selection_title` = "선택 영역의 **표시 표본**({{count}} / **관측 약** {{observed}} — **시간 범위 기준**)" + `selection_denominator` 보조 설명 — UX §2.4 "전체 목록이라 부르지 않는다"
  - `at_hint`·`partial`·`unavailable` — UX §0 축자 일치
- **kr/en 대칭: `apm.realtime.*` 106 / 106, 양쪽 전용 키 0.** 커밋의 "106개" 주장 검증 완료. (레포 전역 비대칭 kr-only 6·en-only 11은 전부 기존 키로 이 커밋과 무관)
- 점 포함 키 → 🟡-2
- `prefers-reduced-motion` — `ApmLiveScatter.tsx:42,75` `animation: !reduced.matches`, 나머지 계열은 `animation: false` 전역. `reduced.addEventListener("change", schedule)`로 런타임 변경도 반영 ✅ (UX §4.2가 공용 skeleton·Drawer 전환은 제외한다고 명시했으므로 `Skeleton active` 유지는 맞다)
- **다크** — hex 직접 사용 0. `useEchartsTheme` + `getPalette()` 값을 canvas에 인자로 넘기는 정본 규약(§4.1)을 지켰고, 팔레트 캡처가 `useEffect([theme, t])` 안이라 테마 변경 시 재초기화된다 ✅
- **키보드** — Space/`[`/`]`/←→가 `event.target === event.currentTarget` 가드로 **차트 포커스 시에만** 활성(WCAG 2.1.4, UX §2.10) ✅. Esc는 capture 단계에서 Drawer 우선 → 브러시 순(`ApmXViewTab.tsx:92~101`)이고 Drawer 닫힘 뒤 호출 버튼으로 포커스 복귀(`ApmLivePointDrawer.tsx:31~41`) ✅. `ResizableDrawer keyboard={false}`로 antd 기본 Esc와 이중 처리되지 않게 했다 ✅
- **캔버스 대체물** — 브러시 없이도 "표 보기" 버튼 + 범위 입력 폼(`ApmXViewTab.tsx:185~193`, `role="alert"` 포함)으로 같은 표를 연다 — UX §2.10 "WCAG 1.1.1의 정신" 요구 그대로 ✅
- `ResizableDrawer` 사용 ✅ (메모리 `resizable-drawer-common` 규약)

### 항목 9 — 기존 3스위트 기대값 갱신

**전부 정당하다.** UX §0 "화면 위치 결정"이 근거다:

> 🔴 현 APM 메뉴는 **8개**다(… `SideNav.tsx:331~409` 실사) — v1.2까지의 "✅ 7개"는 `slo`를 빠뜨린 오계수였다. 추가하면 **9개**가 되고, **배치는 개요 바로 다음(2번째)**에 둔다

- `apmRoutes`: `SIDEBAR_KEYS` 9개 · realtime이 overview 바로 다음 → **§0과 정확히 일치** ✅. 화면 13→14, 라우트 18→19, 검색 14→15, `apm.menu` 13→14, 브레드크럼 13→14 — 산술 일관 ✅
- `apmAdminGating`: 라우트 가드 18→19 + `guards.length === gates.length`(권한·라이선스 동수) 불변식 유지 ✅. 실제 `routes.tsx`도 `PageWrapper(APPLICATION_MONITORING)` + `FeatureGate("APM")` 둘 다 달았다 ✅
- `apmHelpContent`: 122→123(`xview`), 27→28(`apm_realtime`) ✅ — 다만 → 🟡-6
- UX §0이 지정한 **등록 대상 7파일 전부** 반영: `routes.ts`·`routes.tsx`·`SideNav`·`MobileSideNav`·`navSearchEntries`·`breadcrumbSegments`·`page-guide` ✅. 개요 Live 패널의 "실시간 관제 열기 →" 링크도 들어갔다(`ApmLivePanel.tsx` +49/−)
- 🟡-12 참고

### 항목 10·11

§1 🔴-3 표 및 §0 표 참조. **변이 3건 모두 원본 md5 복원 확인, 워크트리 최종 clean(`git status --porcelain -uall` 무출력, `git diff --check` exit 0).** `git stash/checkout/restore/reset`은 한 번도 쓰지 않았다(임시 변이는 python in-place 치환 후 scratchpad 백업본 `cp`로 복원).

---

## 4. 수정 라운드 항목 (권고 순서)

**병합 전 (필수)**
1. 🔴-1 — `ApmXViewTab` 투영에 `visible` 가드 (변경 1줄 + 빈 투영 상수)
2. 🔴-2 — `buildLiveSpansProjection`을 버킷 순회 단일 패스로 재작성, `qualifies`에서 `resolveLiveSpansPoint` 호출 제거, `rows` 지연 승격. 기존 `apmLiveSpansView.test.ts`가 회귀 그물
3. 🔴-3 — `apmLiveSpansMerge.test.ts`에 "buffered 프레임까지 폐기" 재현 1건 추가

**병합 전 (저비용, 함께 처리 권고)**
4. 🟡-1 — 403에서 `stopped = true`(수동 재연결 경로 복원)
5. 🟡-8 — `epochChanged` 동안 stray `spans` 무시(연결 유지)
6. 🟡-4 — `replay`는 `failures`를 올리지 않게
7. 🟡-9 — `heapPct: number | null`로 정정 + `truncated`·`identityIncomplete`·`liveTruncated` 타입 추가

**후속 (P5.3 전까지)**
8. 🟡-2(i18n 키에서 점 제거) · 🟡-3(replace/push 정리) · 🟡-5(degraded 3분기) · 🟡-6(위젯 도움말 3개) · 🟡-7(`MS_PER_SECOND` 분리) · 🟡-10(tsconfig.contract exclude) · 🟡-11(아이콘)

---

## 5. 정본·계약서에 반영할 것

| 문서 | 내용 |
|---|---|
| `devdesign_apm-realtime-ux.md` §2.3 · §1.3 | `[contract-r1 정정]`의 **arenaPressure 우회 지시가 stale이다.** BE `LiveSpanStreamService.tick()`이 구간 증분으로 고쳐졌고 연결 없는 tick도 기준선을 전진시킨다 → "값 자체를 조건으로 쓰지 말고 10초만 켜라"를 삭제하고 "값 조건 사용 가능"으로 갱신 |
| `devdesign_apm-realtime.md` §3.2 jsonc 주석 | 같은 이유로 `pressure.arenaPressure`의 "현재 구현은 누적 총합" 🔴 주석 갱신. 아울러 `stats.minMs`·`sumMs`의 "코덱스가 지금 구현 중이라 현재 응답에 없다" 주석도 stale — 골든에 값이 있다 |
| `devdesign_apm-realtime.md` §3.2 `live{}` 주석 | "현재 BE 구현은 항상 `{}`(`LiveSpanFrames.java:107` 하드코딩)"이 stale — 골든 `spans.golden.json`에 실값이 있다(`empty-dict` 골든은 빈 객체). "둘 다 온다"로 갱신 |
| `devdesign_apm-realtime.md` §3.2 / 계약서 | **`live[].heapPct`는 객체가 아니라 스칼라 `Double`이다**(`cpuPct`만 객체). 설계서 jsonc가 `heapPct: null`만 보여 주어 형태를 못 박지 못했다 — 비대칭이 의도인지 BE에 확인 후 한쪽으로 통일 |
| `devdesign_apm-realtime-ux.md` 머리말 L7 | "APM 메뉴 7개" 잔존 오기 — §0 본문(8개→9개)과 불일치 |
| `devdesign_apm-realtime-ux.md` §4.6 | 구현이 i18n 네임스페이스를 `apm.xview.*`가 아니라 `apm.realtime.*`로 통합했다(초안이 "값은 구현 시 확정"이라 위반은 아님). 정본을 구현에 맞춰 갱신하거나 반대로 정리할지 결정 필요 |
| `features/apm/realtime/contract_apm-p5-live.md` | 위 4건(minMs/sumMs·live{}·arenaPressure·heapPct)의 §6-A~§6-D "FE 요청사항"을 **해소/정정**으로 마감 처리 |

---

## 6. 실 BE 연결 검증(라이브 수신 켜고 종단) 계획 제안

커밋이 스스로 적은 대로 **🔴 실 BE 연결 검증은 미실시**다. 정적 검수로는 끝까지 갈 수 없는 항목이 아래처럼 남아 있다.

**사전 조건**
1. BE 기동은 `_tools/run_be_3000_dev.ps1`(UTF8 .env·`--no-daemon`, JDK17 지정) — 메모리 `dev-runtime-startup` 규약
2. `app.apm.live.spans.*` 라이브 수신을 **켠다**(현재 기본 꺼짐). OTel Collector 또는 부하 생성기로 HTTP SERVER 스팬을 초당 수백 건 흘린다
3. FE는 `npx vite --host 0.0.0.0` (5173, auto-increment 주의) — BE dev CORS가 5173~5175만 허용
4. 인증: 브라우저 로그인 = curl 토큰 쿠키 주입, **`x-visitor-id` 필수**. SSE는 쿼리 `visitorId`로 나가므로 `localStorage`에 값이 있어야 한다
5. Chrome MCP가 localhost를 거부하면 헤드리스 CDP(`_tools/headless-shot`)로 대체. 🔴 **Chrome MCP 숨김 탭은 rAF가 멈춘다** — 숨김 탭 검증은 반드시 헤드리스 CDP로

**검증 항목 (우선순위 순)**

| # | 항목 | 방법 | 통과 기준 |
|---|---|---|---|
| L1 | **URL 구분자·인증** | DevTools Network에서 `/apm/live/spans/stream` 1건이 200 + `text/event-stream`으로 열리는지 | `//apm`·`:3000apm` 없음, `visitorId` 실림, 토큰은 쿼리에 없음 |
| L2 | **snapshot 확정** | `begin`→`dict chunk`→`buckets chunk`→`end` 수신 후 스켈레톤이 걷히고 점이 그려지는지 | 중간 chunk가 그려지지 않음. **CRC32 체크섬이 BE 산식과 실제로 맞는지가 핵심** — FE 구현은 골든 없이 §3.2 D3 서술만 보고 짰다(단위 테스트는 자기 산식끼리 비교라 BE와 맞는지 증명하지 못한다) |
| L3 | **🔴-1·🔴-2 성능 회귀** | `?tab=active`로 진입 → Performance 프로파일 60초. 그다음 `?tab=xview`, 범례 1개 끔 | long task(>50ms) 빈도·최대 길이. 수정 전/후 비교 수치를 남긴다 |
| L4 | **커서 재접속** | BE를 죽였다 살리거나 `Last-Event-ID`로 재연결 유도 | 재접속 URL에 `sinceEpoch/sinceSeq/viewKey` 3개가 실리고, 재전송된 seq가 중복 적용되지 않는다(배지의 관측 수가 튀지 않음) |
| L5 | **control 실경로** | ① `apm.view` 없는 사용자(모듈 권한은 **있음**)로 403 `control` ② 같은 사용자로 5번째 탭 열어 429 ③ 동시 snapshot 3개로 `paused` | 각 배너·카운트다운. 🔴 **401(인증 필터·VisitorSessionChecker)은 `{"code":401,"errorCode":"INVALID_TOKEN"}` 두 필드뿐**이라 `resolveApiError`(status·message·data 전제)를 그대로 태우면 안 된다 — 현 구현은 이 경로를 `AuthService.getMe()` 재확인으로 우회했는데(`useApmLiveSpans.ts:146~154`) **실제로 로그인 화면으로 가는지**를 봐야 한다 |
| L6 | **`at` 앵커 왕복** | 일시정지 → URL 복사 → 새 탭에서 열기 → ←/→ | 같은 화면. `partial`/`unavailable` 배지가 서버 `coverageFrom`에 맞게 뜬다. 5분 초과 시 연결 종료 배너 |
| L7 | **점 클릭 종단** | 방금 그린 점 → 20초 이내(=`notFound.pending`) → 20초 후(=`notFound`) → 저장된 트레이스(=`stored`) → 트레이스 상세로 `?span=` 이동 | 4상태 실관측. 특히 `APM_TRACE_NOT_FOUND` **errorCode 문자열이 실제로 그 값인지**(현 구현이 문자열 일치로 분기한다) |
| L8 | **숨김 탭·5분** | 헤드리스 CDP로 탭 숨김 5분 | 연결 종료 + 복귀 시 snapshot 재수신 |
| L9 | **다국어·다크** | kr/en 전환 × 라이트/다크 | 106키 전부 문구로 풀림(특히 **점 포함 키 2개** — 🟡-2의 실환경 확인), 캔버스 대비 |
| L10 | **`live{}`·`heapPct`** | `spans` 프레임 raw를 브라우저 콘솔에서 확인 | 🟡-9의 스칼라/객체 판정을 실데이터로 확정 |

**산출**: `_workspace/reviews/review_apm-p52-fe_runtime.md`(L1~L10 실측표 + 🔴-1/🔴-2 수정 전후 성능 수치).
