# APM P5.6 비동기 모니터링 FE 검수 (Claude, 읽기 전용)

- 대상: worktree `C:\solutions\moveseyee_fe-p56` / 브랜치 `p56-async` / 기준 master `ac84fa0` (미커밋 working tree)
- 범위: 수정 12 · 신규 9 (총 1,003+ / 314- 라인 + 신규 1,489라인)
- 정본: `_workspace/features/apm/realtime/devdesign_apm-realtime-ux.md` §3(3층·되지 않는 것·3.1~3.5)·§4, `_archive/features/apm/realtime/review_apm-realtime-ux_codex-r1.md`
- 구현 보고: `_workspace/_archive/features/apm/realtime/review_apm-p56-fe_codex-impl.md`
- 검수일: 2026-09-15. 코드 수정 없음(변이 테스트용 임시 편집 3회는 백업에서 즉시 복원, md5 일치 확인).

## 총평

**🔴 2 · 🟡 13 · 🟢 다수.** 정본 §3.1의 첫 출시 5항목은 **전부 구현됐고**, 그리는 법의 세부(가시 행 index 역산·조상 펼침·선택 링크 하나만·화살표 없는 점선·해칭 식·전위 순회 보존·오류 3분기·selfMs 분모)까지 정본과 일치한다. 순수 함수 분리와 결정적 fixture 테스트의 품질이 높아 **변이 3건이 모두 검출**됐다. 정직 규칙 위반 문구는 0건이다.

막는 것은 두 가지다. 하나는 메시징 링크가 SPA 라우팅을 우회해 앱 전체를 리로드하는 것이고(1줄 수정), 다른 하나는 `rootMissing`/`cycleBroken` 응답에서 기능 ②가 **트레이스 전체 범위로 조용히 꺼지는데 화면은 "발견되지 않았습니다"라고 말하는 것**이다. 후자는 §3이 막으려던 바로 그 오독이라 문구든 범위든 한쪽은 고쳐야 한다.

**병합 판단: 🔴 2건 해결 후 병합 가능.** 출시 게이트 R-P5.6(ⓑ 보존 + D-1·3·4·5)은 이번 작업 범위 밖이며 여전히 미완이다.

---

## 1. 정본 일치 (§3.1 "그리는 법" 열 대조)

| 정본 요구 | 판정 | 근거 |
|---|---|---|
| **1** 링크 목록: `links.length>0` 행에 네이티브 `<button>` → 팝오버, 패널 links 절도 같은 목록 | ✅ | `ApmTraceWaterfall.tsx:550-571`(`<button type="button" data-link-button>`), `ApmSpanDetailPanel.tsx:213-223`이 같은 `ApmSpanLinks`로 교체 |
| 허용 속성 표 + "부모와 같은 대상" | ✅ | `ApmSpanLinks.tsx:66-87`(DmoveTable), `link.isParent` → `link_is_parent` Tag |
| **1a** 같은 trace 이동 = 조상 펼침 → **가시 행 index**로 scrollTop → 1.5초 하이라이트 → `?span=` → 포커스 | ✅ | `useApmAsyncNavigation.ts:88-132` — `reveal()`이 조상 collapsed 해제, `rows.findIndex`(원본 배열 index 아님), `APM_ASYNC_HIGHLIGHT_MS=1500`, `element.focus({preventScroll:true})`. 테스트 `ApmAsyncWaterfall.test.tsx:157-176`이 접힌 가지 40행을 만들어 `(259-40)*ROW_HEIGHT`를 단언 |
| 관계선: 선택한 **하나만** · 양 끝 보일 때만 · 점선 · **화살표 없음** | ✅ | `ApmTraceWaterfall.tsx:170-182, 347-378` — `relation` 단일 상태, `showRelationship` 가시성 2조건, `strokeDasharray="4 3"`, `marker` 없음. 테스트가 `querySelector("marker")` null까지 단언 |
| **1b** 다른 trace 열기 = `from/fromSpan/fromTab/fromAsync` 4키 | ✅ | `apmAsync.ts:133-150` `apmAsyncLinkPath` |
| **2** 해칭 길이 `max(0, childEnd − max(childStart, parentEnd))` · 1ms 오차 · 고아/rootMissing/cycleBroken 제외 | ✅ 식 / 🔴 제외 범위 | `apmAsync.ts:64-79`. 식은 정확(`late` 20ms vs `gap` 20ms의 구분을 fixture가 검증). 제외 범위는 🔴-2 참조 |
| 부모 종료선 `╎` `INK.muted` + `⇢` + 툴팁 + `afterParentEndPct` prop | ✅ | `ApmTraceWaterfall.tsx:610-634`, `ApmWaterfallBar.tsx` prop 신설 |
| **3** `?asyncOnly=1` keepIds(관련 ∪ 조상), 조상 흐리게, **트리 재구성 없음·전위 순회 계약 유지** | ✅ | `apmWaterfall.ts:134` — `keepIds` 필터가 `skipDeeperThan` 설정 **뒤**에 놓여 접기 의미가 보존된다. 정렬·재귀 없음. 테스트가 `["root","branch","late","gap"]` 순서와 접힘 상호작용을 단언 |
| 필터 끄면 이전 `?span=`·스크롤 복귀 | ✅ | `useApmAsyncNavigation.ts:168-200` 스냅샷 + `:134-142` 복원 effect. 탭 왕복까지 `filterSnapshotRef`(페이지 소유)로 커버 |
| **4** 빈 상태 문구 · 요약 문구 · `no_links` 정정 | ✅ | `kr.json:2022 empty_async`(설계 문장 그대로), `:2008 async_summary`, `no_links` → "이 응답에 포함된 링크가 없습니다." |
| **5** selfMs kind 합산 · 분모 = **표시된** 스팬의 Σ selfMs · 합 0이면 비율 없음 · 별도 탭 없음 | ✅ | `apmAsync.ts:200-213`, `ApmTraceWaterfall.tsx:289` `spans={shownSpans}`(= rows의 span), Collapse 카드 1개 |
| §3.3 메시징 실제 키 `msgDest/msgSystem/msgService` + 시간 범위 | ✅ 키 / 🔴 이동 방식 | `apmAsync.ts:170-193`. **from/to를 ms 에폭으로 넘기는 것이 맞다** — `useApmTimeRange.ts`가 "from/to는 ms 에폭, step만 초" 계약(확인함). 링크 방식은 🔴-1 |
| §3.4 오류 3분기 · `from`일 때 "만료" 제목 미부착 | ✅ | `ApmTraceDetailPage.tsx:120-160`. `APM_TRACE_NOT_FOUND`+from → `link_target_not_found`, 403 → `ApmQueryError`+재시도 없음, 그 밖 → `ApmQueryError`+재시도 |
| §3.4 브레드크럼 중립 문구("발행에서 옴" 금지) | ✅ | `from_trace` = "트레이스 {{id}}의 링크에서 이동했습니다" |
| §3.2 P5.6b 미구현(탭 미증설) | ✅ | `?tab=async` 없음, 스레드·역탐색 없음 |

### 금지 문구 스캔 — **위반 0건**

`git diff -U0`로 kr/en 신규·변경 라인만, 그리고 `traces/` 전체 컴포넌트를 검색했다.

- `"병렬"` — 1건, `trace_waterfall.detail`의 **기존(master)** 문장 "병렬 호출에서도 합이 부풀지 않습니다"(자기 시간 설명). 신규 문구 아님.
- `"비동기 작업이 없"` — 3건, 전부 **`"발견되지 않음은 비동기 작업이 없다는 뜻이 아닙니다"`** — 정본 §3이 요구한 부정문 그 자체다(문자열 일치 오탐).
- `"스레드 N"` · `"미완"` · `"발행에서"` — 0건.
- 팝오버는 링크 대상의 kind를 추측해 "발행/소비" 라벨을 붙이지 않는다(테스트가 `queryByText("발행 스팬")` null 단언).

---

## 🔴 조치 필요

### 🔴-1 메시징 집계 링크가 SPA 라우팅을 우회한다 — 전체 페이지 리로드

**위치** `src/pages/application-monitoring/traces/waterfall/ApmSpanDetailPanel.tsx:120`

```tsx
<Typography.Link href={messagingPath}>
```

**근거** APM 안의 내부 이동 12곳은 전부 react-router `<Link to=…>`다(`ApmServiceSettingsTab.tsx:460`, `ApmExemplarStrip.tsx:116`, `ApmRumPage.tsx:156` …). 이 한 곳만 `href`라 브라우저가 document navigation을 일으킨다.

**재현** `messaging.system` + `messaging.destination.name` + `serviceUid`를 모두 가진 CONSUMER/PRODUCER 스팬을 선택 → 우측 패널의 "이 목적지의 메시징 집계 보기 →" 클릭 → 번들 재로드·흰 화면·react-query 캐시 전소·인증 부트스트랩 재실행. (설계 §3.3이 원한 것은 "집계 화면으로 이동"이지 "앱 재시작"이 아니다.)

**수정**
```tsx
import { Link } from "react-router-dom";
…
<Link to={messagingPath}>{t("apm.traces.waterfall.messaging_open")}</Link>
```

**테스트 공백** `apmAsync.test.ts`의 메시징 테스트는 `apmAsyncMessagingPath`가 만든 **문자열**만 검사한다. 컴포넌트가 그 문자열을 어떻게 쓰는지는 어느 테스트도 보지 않는다 — 수정과 함께 `ApmAsyncDetail.test.tsx`에 "클릭하면 `url`이 `/application-monitoring/messaging?...`로 바뀐다" 1건을 넣으면 재발이 막힌다.

---

### 🔴-2 `rootMissing`/`cycleBroken`이 트레이스 **전체**의 ② 판정을 끄는데, 화면은 "발견되지 않았습니다"라고 말한다

**위치** `src/pages/application-monitoring/traces/waterfall/apmAsync.ts:57-69` + `ApmTraceWaterfall.tsx:115-126`(detail의 트레이스 플래그를 **모든 스팬에** 투영) + `:263-269`(빈 상태 문구)

```ts
const uncertain = span.cycleBroken ? "cycleBroken"
  : span.rootMissing ? "rootMissing"
  : span.orphan || (span.parentSpanId && !parent) ? "orphan" : undefined;
const after = !uncertain && parentEnd !== null && childEnd > parentEnd + 1;
```

**문제 세 겹**

1. **범위가 과하다.** `rootMissing`·`cycleBroken`은 DTO 주석대로 **트레이스 단위 플래그**다(`types/apm.ts:1637,1639` — "진짜 루트가 없다", "부모 사슬 순환을 끊었다"). 부모가 응답에 실제로 있는 스팬의 종료 시각 비교까지 막을 이유가 없다 — 그 경우는 이미 `span.orphan || (parentSpanId && !parent)` 가지가 per-span으로 잡는다. 결과적으로 `rootMissing:true` 트레이스에서는 **기능 ②(부모 종료 이후 표시·해칭·⇢·요약 개수)가 통째로 사라진다.** `rootMissing`은 잘린 트레이스에서 흔하다.
2. **신호가 없다.** `uncertain` 필드는 계산만 되고 **UI 어디에서도 렌더되지 않는다**(전체 검색 확인). 정본 §3은 "② 판정에서 **제외하거나 '불확실'로 표시**"라고 두 선택지를 줬는데, 구현은 제외만 하고 그 사실을 화면에 남기지 않는다. `truncated`는 `async_truncated` 배지가 있지만 `rootMissing`/`cycleBroken`에는 대응 배지가 없다.
3. **그래서 문구가 어긋난다.** 요약은 "부모 종료 이후 종료 **0**"이라 적고, 링크도 0이면 `empty_async`가 "이 응답에서는 … **발견되지 않았습니다**"라고 뜬다. 실제로는 "찾아봤지만 없었다"가 아니라 "**부모 관계가 불확실해 판정하지 않았다**"다. 정본 §3이 통째로 막으려던 오독("발견되지 않음 ≠ 없음")이 한 단계 아래에서 재발한 형태다.

**재현** `asyncFixture()`에 `rootMissing: true`만 세워 워터폴을 렌더한다 — `late`·`gap`의 `⇢`·해칭·부모 종료선이 전부 사라지고 요약이 "부모 종료 이후 종료 0"이 된다. (기존 테스트 `apmAsync.test.ts:99-113`이 바로 이 동작을 **정상으로 고정**하고 있다 — `%s 응답은 시간 판정만 제외한다`.)

**수정안 (택1, 위쪽 권장)**
- **(a) 범위를 스팬 단위로 좁힌다.** `rootMissing`/`cycleBroken`은 트레이스 플래그로 두되 판정 차단에는 쓰지 않고, 실제로 부모를 못 찾은 스팬만 `uncertain:"orphan"`으로 제외한다. 그 대신 트레이스 플래그가 서 있으면 요약 옆에 `async_truncated`와 같은 급의 경고 한 줄("루트 누락/순환 절단 — 일부 부모 관계가 불확실합니다")을 세운다.
- **(b) 현 범위를 유지한다면 문구를 바꾼다.** 두 플래그가 서 있을 때 요약의 "부모 종료 이후 종료 0"을 "판정 안 함(—)"으로 표시하고, `empty_async` 대신 "부모 관계가 불확실해 시간 판정을 하지 않았습니다" 전용 문구를 띄운다.

어느 쪽이든 `uncertain`이 UI로 나와야 하고, `apmAsync.test.ts`의 해당 케이스와 도움말 문장("고아·루트 누락·순환 절단 응답은 시간 판정에서 제외합니다")을 함께 갱신해야 한다.

---

## 🟡 권고

| # | 내용 | 위치 |
|---|---|---|
| Y-1 | **해칭 폭이 막대 최소폭 보정을 반영하지 않는다.** `afterParentEndPct = hatchMs/durationMs*100`인데 실제 막대 폭은 `apmSpanBarGeometry`의 `MIN_WIDTH_PCT`(0.4%) 하한과 좌측 당김을 거친다 → 아주 짧은 스팬에서 해칭 비율이 시간 비율과 어긋난다. 덧붙여 컴포넌트 테스트의 `width:"100%"` 단언은 `Math.min(100,…)` 포화 때문에 **해칭 식을 틀리게 바꿔도 통과한다**(변이 2는 순수 함수 테스트만 잡았다) | `ApmTraceWaterfall.tsx:641-645`, `ApmWaterfallBar.tsx:30` |
| Y-2 | **`asyncOnly`·`span` 변경이 `replace:true`라 브라우저 뒤로가기로 복원되지 않는다.** `updateParams`의 기본값이다. 설계 §0은 URL에 상태를 두는 이유로 "공유·새로고침·**뒤로가기**"를 든다 — 지금은 앞 둘만 충족. 기존 레포 관례라 이번 변경의 회귀는 아니지만, push로 바꾸면 스팬 클릭마다 히스토리가 쌓이는 트레이드오프가 있어 **결정이 필요**하다 | `hooks/useQueryParams.tsx:47-70` |
| Y-3 | **신규 `ApmAsyncDetail` 스위트가 느리고 20초 기본 타임아웃에 취약하다.** 단독 실행 11건/85초(평균 7.7초), 다른 스위트와 동시 실행하니 "선택 패널의 동일 목록에서 같은 trace로 이동하면 URL을 갱신한다" 1건이 **20초 초과로 실패**(재현함, 단독 재실행은 통과). 기존 `ApmAlertRulesPage`에 5초 대기를 넣은 것과 같은 계열의 취약점이다 — CI 병렬에서 간헐 실패 위험 | `traces/__tests__/ApmAsyncDetail.test.tsx:178` |
| Y-4 | **도움말 본문 5문단이 3개 키에 그대로 복제됐다.** 설계 §4.4가 요구한 것은 `chart_help.trace_async_marks` 하나인데 `chart_help.trace_waterfall.detail`과 `page_guide.apm_traces.detail`에도 같은 문단이 통째로 붙었다 → 워터폴 도움말을 열면 같은 문장을 두 번 읽고, "32"·"1ms" 계약 상수가 kr/en × 3 = **6곳**에 박혀 상한 변경 시 전부 동기화해야 한다 | `kr/en.json` `chart_help.trace_waterfall.detail`, `page_guide.apm_traces.detail` |
| Y-5 | **`links_limit`에 i18next 예약어 `count`를 비-복수 보간값으로 썼다.** `{{count}}`는 복수 처리 트리거다. 지금은 `links_limit_other`가 없어 기본 키로 폴백해 동작하지만, 누가 복수형 키를 추가하거나 plural 설정이 바뀌면 조용히 깨진다. `{{limit}}` 같은 중립 이름 권장 | `ApmSpanLinks.tsx:46`, `kr/en.json:2024` |
| Y-6 | **렌더마다 O(n) 스캔 3개.** `spans.some(...)`(missingTarget), `rows.findIndex` ×2(relationshipRows). 스크롤 핸들러가 throttle 없이 `setScrollTop`을 부르므로 5,000 스팬에서 스크롤 프레임마다 돈다. O(n²)는 아니지만 코덱스 자가 측정의 "최장 UI 작업 210ms·최초 전환 239.5ms(**잠정 기준 200ms 초과**)"와 직결된다. `missingTarget`은 `useMemo`, `relationshipRows`는 `relation===null` 조기 반환으로 줄인다 | `useApmAsyncNavigation.ts:64-66`, `ApmTraceWaterfall.tsx:170-182` |
| Y-7 | **관계선 SVG 높이가 전체 행 수에 비례한다.** `height: rows.length * 28` → 5,000행이면 140,000px SVG. 선 1개뿐이라 실측 영향은 작을 수 있으나, 가시 창 높이로 좁히고 y를 `scrollTop` 기준 상대값으로 두는 편이 안전 | `ApmTraceWaterfall.tsx:356` |
| Y-8 | **`⇢` 마커 접근성.** `<span aria-label={afterHint}>⇢</span>` — role 없는 generic span의 `aria-label`은 다수 스크린리더가 무시한다. `role="img"` 부여 권장 | `ApmTraceWaterfall.tsx:507` |
| Y-9 | **무관한 prettier 재포맷이 diff에 섞였다.** `.prettierrc`의 `trailingComma:"es5"`에 **맞추는** 방향이라 규약 위반은 아니고 master 쪽이 어긋나 있었다. 다만 `ApmTraceWaterfall.tsx` +818줄·`ApmSpanDetailPanel.tsx`·`ApmTraceDetailPage.tsx`에서 포맷 변경이 로직 변경과 섞여 검수·bisect가 어렵다. 포맷만 별도 커밋 권장 | `apmWaterfall.ts`, `ApmTraceDetailPage.tsx`, `ApmSpanDetailPanel.tsx` |
| Y-10 | **`apmAsyncReturnPath`가 항상 `asyncOnly=0`을 쓴다.** 꺼진 상태로 돌아가도 URL에 `asyncOnly=0`이 남는다(동작 무해, URL 노이즈) | `apmAsync.ts:161-162` |
| Y-11 | **관련 스팬 0건에서 필터를 켜면 행이 0개인 빈 목록이 된다.** 위쪽 `empty_async` 안내가 맥락을 주지만 목록 자리 자체에는 설명이 없다. 관련 0건이면 체크박스를 `disabled`로 두거나 목록 자리에 안내를 넣는 편이 낫다 | `useApmAsyncNavigation.ts:182-185` |
| Y-12 | **`missingTarget` 안내가 다른 행을 눌러도 남는다.** `missingTargetId`는 다음 `followLink`나 `toggleAsyncOnly`까지 유지된다 | `useApmAsyncNavigation.ts:63-66` |
| Y-13 | **`ApmSpanLinks`가 `key={index}`를 쓴다.** `traceId/spanId`라는 안정 키가 있다 | `ApmSpanLinks.tsx:52` |

---

## 2. 워터폴 회귀 — 🟢

- **기존 동작 보존 확인(코드 읽기):** 가상 스크롤(`APM_WATERFALL_VIRTUAL_THRESHOLD`·`topPad/bottomPad`·`boxSizing:border-box` 1px 누적 방지 주석 포함) · 접기/펼치기(네이티브 `<button>`·`aria-expanded`·`stopPropagation`) · 행 선택(Enter/Space, `event.target===currentTarget` 가드) · 크리티컬 패스(색+굵기 2축) · RUM 브라우저 스팬 배지 · 고아 배지 — 전부 그대로다.
- **`apmWaterfall.ts` 변경의 파급:** 실질 변경은 선택 인자 `keepIds` **하나**이고 나머지는 포맷이다. `keepIds`를 넘기지 않는 기존 호출부(테스트 `apmTraces.test.ts` 5곳)는 동작이 동일하다.
- **`ApmWaterfallBar`의 다른 소비자:** `ApmRumTimingCard.tsx:91`. `afterParentEndPct` 기본값 0 → `hatch===0` 분기에서 `{background: color, opacity}`를 그대로 스프레드하므로 **렌더 결과가 master와 동일**하다.
- **플레임·`apmTraceDisplay`:** `apmWaterfall.ts`를 import하지 않는다(전체 검색 확인). 영향 없음.
- **실행 검증:** `apmTraceScreens.test.tsx`(워터폴 렌더 스위트) · `apmTraces.test.ts` · `apmRumContract.test.ts` · `ApmHelp.test.tsx` 전부 통과.
- **성능:** O(n²) 없음. `marks`·`keepIds`·`rows`·`shownSpans` 모두 memo. 우려는 Y-6·Y-7 수준이며, 코덱스가 스스로 보고한 **최초 전환 239.5ms > 잠정 200ms**는 D-5 게이트에서 다시 판정해야 한다.

## 3. URL 상태 — 🟢 (Y-2 제외)

- `asyncOnly`·`span`은 `useQueryParams().params` 읽기 / `updateParams` 쓰기로 기존 규약 준수. `from*` 4키는 다른 pathname으로 가는 이동이라 `navigate()` + `URLSearchParams` 직접 조립이 맞다.
- **리마운트 전제 ✅ 검증:** `src/layouts/app/App.tsx:240` `key={\`css-transition-${location.pathname}\`}` — query 변경은 리마운트하지 않는다. 코덱스가 파일 헤더 주석을 이 사실에 맞춰 고친 것도 정확하다(메모리 `fe-page-remount-on-navigate`는 구 동작이다).
- 새로고침 복원 ✅(전부 URL), `from` 없는 직접 진입 ✅(배너·돌아가기 버튼 미표시, 404는 기존 "만료" 문구 유지).
- 필터 토글과 선택 복원이 **updateParams 한 번**으로 처리된다(테스트가 단언).
- `fromSpan=`이 빈 값으로 URL에 남는 것은 의도이며 round-trip이 검증됐다.

## 4. 오류 분기·권한 — 🟢

- 403 판정 `resolvedError.messageKey === "api_error.permission_denied"`는 `services/apiEnvelope.ts:181-184`의 실제 계약(`body.code ?? response.status === 403`)과 일치한다. 이 BE가 403을 **HTTP 200 + body code 403**으로 주는 것까지 커버된다. 테스트가 `ApiEnvelopeError{code:403}` · `{response:{status:403}}` · `{code:403, errorCode:APM_TRACE_NOT_FOUND}` 3형태를 돌린다.
- `APM_TRACE_NOT_FOUND` + `from` → 만료 제목 미부착 ✅. 403 → 재시도 버튼 없음 ✅. 그 밖 → `ApmQueryError` + 재시도 ✅.
- 재시도는 `detailQuery.refetch()`다. 무효화가 아니라 재조회인데, 단건 상세이고 `useApmTraceDetail`은 폴링하지 않으므로 **refetch가 맞다**(invalidate는 불필요한 캐시 흔들림).
- `useApmPermissions` 게이트: P5.6은 **쓰기 동작을 하나도 추가하지 않았다**. 라우트는 기존 `PageWrapper` + `FeatureGate`로 보호되고, view 권한 거부는 위의 403 배너로 떨어진다 — 새 게이트가 필요 없다.

## 5. 팔레트·다크·접근성 — 🟢 (Y-1·Y-8 제외)

- **하드코딩 색 0건** — 변경·신규 파일 전체에서 hex/rgb 검색 결과 없음. 전부 `usePalette()` 토큰(`INK.muted`·`SURFACE.border/borderSubtle/container`·`BRAND.primarySoft`·`CHART_SERIES`·`HEALTH.*`).
- **해칭 색은 정본대로 "막대 색"이다** — §4.1 표가 "같은 막대 색 + 대각선 패턴 0.5"로 못 박고 있고 `stroke={color}` + `APM_ASYNC_HATCH_OPACITY=0.5`가 그것이다. §3.1의 "같은 색"을 `INK.muted`로 읽지 않은 판단이 옳다. (정량 대비는 R-P5.6 M6에서 실측 — 미완)
- **다크** — 테스트가 `setPaletteMode("dark")`에서 선택 배경·부모 종료선 토큰을 단언한다.
- **reduced-motion** — `apm-async.scss` 6줄이 하이라이트 전환 150ms와 `prefers-reduced-motion:reduce → none`을 담는다(§4.2 준수). 상대 경로 import는 레포 관례와 일치(`ApmCollectorInstallTab.tsx:39` 등).
- **네이티브 button** — 링크 버튼·접기 토글 모두 `<button type="button">`. `ApmHelp`는 `Typography.Text role="button"`이 남아 있지만 이번에 `tabIndex={0}` + Enter/Space 핸들러가 추가돼 키보드로 열린다(테스트 단언).
- **인라인 `background: undefined` 금지** — 위반 없음. `ApmWaterfallBar`는 해칭 시 스프레드로 `background` 키 자체를 넣지 않고, 행의 `backgroundColor: … : undefined`는 scss가 배경을 정의하지 않아 충돌 지점이 없다.
- 관계선 SVG·kind 누적 막대 모두 `aria-hidden="true"`이며 같은 정보를 표(DmoveTable)로 제공한다. 팝오버는 Escape로 닫히고 링크 버튼으로 포커스를 되돌린다.

## 6. i18n — 🟢

- **27 추가 · 5 수정, kr/en 대칭** — 보고서 수치와 일치한다(waterfall 25 + `chart_help.trace_async_marks.{short,detail}` 2 / 수정 = `msg_table.detail`·`msg_lag.detail`·`trace_waterfall.detail`·`page_guide.apm_traces.detail`·`no_links`).
- `apmHelpContent.test.ts` 121 → **122** 갱신이 정당하다(`trace_async_marks` 1개 추가).
- **참조 키 전수 확인** — `no_attributes`·`apm.chart.table.share`·`apm.traces.kind.{server,internal,client,producer,consumer}`·`waterfall.{toggle,orphan,orphan_hint}` 전부 kr/en에 존재. 누락 0.
- 기존 구조·순서 보존, 재직렬화 없음 ✅.
- **정직 규칙 준수** — `empty_async`가 설계 문장을 그대로 쓰고 "없습니다"라고 단정하지 않는다. `no_links`도 "다른 트레이스로의 링크가 없습니다" → "이 응답에 포함된 링크가 없습니다"로 정정됐다. 다만 🔴-2의 `rootMissing` 경로에서 이 문구가 사실과 어긋나는 상황이 생긴다.
- 고객 문구에 검수번호·§·HTML 태그 없음. "32"·"1ms"는 실측이 아니라 계약 상수이며 설계가 명시를 요구한 값이다.

## 7. 기존 테스트 3건 수정의 정당성 — 🟢 전부 정당 (실측 확인)

**본 트리 `C:\solutions\moveseyee_fe`(master)에서 `git stash` 없이 직접 실행**해 사전 실패를 확인했다:

```
npx jest src/__tests__/apmCollectorHooks.test.ts src/__tests__/ApmAlertRulesPage.test.tsx
→ Test Suites: 2 failed, 2 total · Tests: 2 failed, 49 passed, 51 total
```

| 수정 | 판정 | 근거 |
|---|---|---|
| `apmCollectorHooks.test.ts` 쿼리 키 null 4개 추가 | ✅ 정당 | 기준 커밋 `ac84fa0`의 `useApmInstallGuide`(hooks/useApm*.ts:226-235)가 이미 `installDir/configDir/queueDir/agentDir`를 키에 넣고 있다. 테스트만 2요소로 남아 **master에서 이미 실패 중**이었다. 코덱스는 제품 코드를 건드리지 않고 기대값만 현행화했다 |
| `ApmAlertRulesPage.test.tsx` 대기 1→5초 | ✅ 정당, 🟡 성격 | master에서도 같은 `findByText`가 기본 1초 타임아웃으로 실패한다(위 실행에서 재현). 제품 로직 변경 없음. 다만 타임아웃 상향은 원인(antd Drawer 비동기 검증 렌더가 느림)을 덮는 조치이며, Y-3과 같은 계열의 취약점이 남는다 |
| `apmHelpContent.test.ts` 121→122 | ✅ 정당 | 도움말 키 1개 추가에 대응하는 필수 갱신. 배열 `WIDGET_KEYS`에도 `trace_async_marks`가 실제로 들어갔다 |

**사전 실패 2건은 이번 브랜치가 만든 것이 아니다** — 기준 master의 기존 부채이며, 이 브랜치가 그것을 함께 갚았다.

## 8. 테스트 품질 — 🟢 (변이 3/3 검출)

신규 4파일 / 40건(traces 디렉터리 3 스위트). **§3.5 D-3·D-4 합격식을 실제로 검사한다:**

- **동기 대조군** — `apmAsync.test.ts:38` "동기 대조군은 부모 종료 이후로 분류하지 않는다"(D-3의 "동기 대조군을 병렬이라 표현한 사례 0건"에 대응)
- **해칭 식** — `late`(childStart < parentEnd, hatch 20) vs `gap`(childStart > parentEnd, hatch 20 ≠ afterParentEnd 60) 두 케이스로 `max(childStart, parentEnd)` 항을 정확히 겨눈다
- **1ms 오차 경계** — `it.each([[1, null],[1.001, 1.001]])` 로 strict `>` 확인
- **32 상한 문구** — kr·en 양쪽에서 `empty_async`·`links_limit`·`chart_help.…detail`에 "32"·"X-View"·"messaging.\*"가 있는지, 그리고 `empty_async`에 "비동기 작업이 없습니다"가 **없는지**까지 단언
- **keepIds** — 조상 집합 결과 + `apmWaterfallRows`의 전위 순서 + 접힘 상호작용 + **순환 부모 사슬 종료**
- **from 복귀 URL** — 링크 path → 복귀 path round-trip으로 `tab/asyncOnly/span` 복원, 그리고 잘못된 `fromTab=async`·`fromAsync=bad`가 `waterfall`/`0`으로 정규화되는지
- **가상 스크롤 점프** — 접힌 40행을 만들어 `(259-40)*ROW_HEIGHT`, 즉 **가시 행 index** 역산 확인
- **5,000 스팬 × 32 링크 = 160,000 링크** 집계 + 원본 배열 순서 불변 확인

### 변이 테스트(손으로, 즉시 복원)

| 변이 | 결과 |
|---|---|
| 1ms 오차 제거 (`childEnd > parentEnd`) | **1 failed / 39 passed** — 검출 ✅ |
| 해칭 식을 `childEnd − parentEnd`로 | **1 failed / 39 passed** — 검출 ✅ |
| `apmAsyncKeepIds`가 조상을 안 담게 | **4 failed / 36 passed** — 검출 ✅ |

복원 후 md5 일치 확인(`05a05c6189c58b69fe6e10d263173947`).

**남는 공백** — Y-1(컴포넌트 레벨 해칭 단언이 100% 포화라 무력), 🔴-1(메시징 링크의 실제 이동 미검증).

## 9. 검증 재실행 — 수치

| 검사 | 결과 |
|---|---|
| `npx jest src/pages/application-monitoring/traces src/__tests__/apmHelpContent.test.ts src/__tests__/apmCollectorHooks.test.ts` | **5 스위트 / 82건 전부 통과**, 101.6s |
| `npx tsc --noEmit` | **통과**(exit 0) |
| `npm run typecheck:contract` | **통과** |
| `npx eslint` 변경 12 + 신규 9 파일, `--max-warnings 0` | **0 error / 0 warning** |
| `git diff --check` | **clean**(CRLF 안내만) |
| 확장 회귀 ①: `apmTraces` + `apmRumContract` + `apmHelpContent` + `ApmRumPage` + `pages/application-monitoring` | 6 스위트 / 140건 — **1건 실패(20초 타임아웃, 단독 재실행 11/11 통과 → Y-3)** |
| 확장 회귀 ②: `apmTraceScreens` + `ApmRumScreens` + `ApmHelp`(`--runInBand`, 동시 실행 경합) | 3 스위트 / 76건 — **1건 실패**(`ApmRumScreens` RUM 리소스 정렬 20초 타임아웃). **`ApmRumScreens` 단독 전체 재실행 49/49 통과**(603s)로 경합 타임아웃임을 확정 — P5.6과 무관 |

> 코덱스 보고의 "1,152건 전부 통과"는 전체 실행과 부분 재검증의 **합산**이며 단일 전체 재실행이 아니라고 스스로 밝혔다. 내 실행에서도 병렬 부하가 걸리면 타임아웃 실패가 재현된다 — **"전건 통과"로 기록하지 말고 Y-3을 남겨야 한다.**

## 10. 산출물 위생 — 🟢

- worktree에 임시 파일·scratchpad 없음. 미추적 파일은 **의도한 신규 9개뿐**.
- `_workspace`·BE 표본 JSON 미변경(코덱스 보고와 일치).
- `git diff --check` 공백 오류 0.
- 내 변이 테스트용 백업은 세션 scratchpad에만 두었다(`…/scratchpad/bak/apmAsync.ts`).

---

## 병합 판단

**🔴 2건 해결 후 병합 가능.**

- 🔴-1은 1줄 교체 + 테스트 1건.
- 🔴-2는 **범위(a)와 문구(b) 중 어느 쪽으로 갈지 결정**이 먼저다. (a)를 권한다 — `rootMissing`이 흔한 잘린 트레이스에서 기능 ②가 통째로 사라지는 것은 비용이 크고, per-span 판정은 이미 `orphan` 가지가 하고 있다.
- 🟡 중 **Y-2(뒤로가기 정책)** 와 **Y-3(테스트 취약)** 은 병합 전 결정/조치를 권하고, 나머지는 후속으로 충분하다.

## R-P5.6 실측 전 남은 것

1. **게이트 ⓑ(보존) 전건 미완** — Collector→BE→DB→API의 링크 전달 정합성(D-1: ID·순서·허용 속성 100%, 비허용 잔존 0, 33번째 절단), ⓐ(자동계측 생성 여부)는 이번 FE 작업에서 하나도 검증되지 않았다.
2. **D-3 시간·관계 계산** — FE 순수 함수 단위로는 통과했으나 실제 fixture(동기 대조군·`@Async`·CompletableFuture·Kafka·RabbitMQ·수동 Link·경계 31/32/33·128/129)에서의 확인이 남았다. 🔴-2를 고치지 않으면 `rootMissing`이 섞인 fixture에서 기대 마커와 어긋난다.
3. **D-5 표시 성능** — 코덱스 자가 측정 **최초 전환 239.5ms**가 잠정 기준 200ms를 넘었다. 기준을 실행 전에 고정하기로 한 항목이므로 (a) 기준 재확정 또는 (b) Y-6 최적화 후 재측정 중 하나가 필요하다. 최장 UI 작업 210ms는 500ms 기준 내.
4. **M6 해칭 대비 정량 실측** — 라이트·다크 양쪽. 코드 리뷰로는 판정 불가.
5. **실제 앱 연결 검수** — BE(:3000) + FE(:5173)로 실 트레이스에서 링크 팝오버·점프·복귀·403·미저장 대상을 눌러 보는 것. 지금까지의 근거는 전부 jsdom이다.
6. **P5.6b** 미구현(정본대로 범위 밖).
