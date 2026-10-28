# 분석 카드 접기/확장 + 리플로우 설계서

> 2026-08-12 · 프론트 전용(백엔드·resolver·쿼리훅 변경 0) · 기준 소스 `f6e521c`(develop)
> 적용 화면 3곳: **자원관리 팀 분석**(`/resource`) · **통합 대시보드**(`/dashboard`) · **마이페이지**(`/my-page`)

---

## 0. 죽은 버튼의 원인 확정 (실코드 추적 결과)

팀 분석 카드의 우측 상단에는 버튼이 **3개** 있다. 렌더 지점은 전부 `components/chart/layout/ChartCard.jsx` 헤더다
(`TeamChartFrame.jsx:101` → `ChartCard`). 셋 다 실패 양상이 다르다.

### D-1. 새로고침 버튼 — **완전한 no-op** (진짜 죽은 버튼)

```jsx
// static/ui/src/components/chart/layout/ChartCard.jsx:142-144
<Box onClick={(e) => { e.stopPropagation(); onRefresh?.(); }} style={{ cursor: "pointer", padding: 4 }}>
    <RefreshIcon label="refresh" />
</Box>
```

버튼은 **`onRefresh` 유무와 무관하게 항상 렌더**되고, 핸들러는 `onRefresh?.()` 다.
`static/ui/src` 전역에서 `onRefresh` 를 `ChartCard` 에 넘기는 곳은 **단 하나** —
`pages/projectDetail/dashboard/DashboardPage.jsx:282` (이번 범위 밖).
팀 분석의 유일한 호출부 `TeamChartFrame.jsx:101` 은 `title` / `description` / `height` 만 넘긴다.
→ **팀 분석의 새로고침 버튼은 클릭해도 문자 그대로 아무 함수도 호출되지 않는다.**
(같은 리포가 이미 아는 규칙이다 — `PortfolioDashboardPage.jsx:277` 주석: "onRefresh 가 없으면 CTA 자체가 렌더되지 않으므로".
 그 원칙이 `ChartCard` 에는 적용돼 있지 않다.)

### D-2. 접기 버튼 — 상태는 바뀌지만 **카드가 줄지 않고 아무것도 올라오지 않는다**

핸들러·상태·본문 언마운트는 정상이다:
`ChartCard.jsx:41`(`useState(false)`) · `:136`(`setCollapsed(v => !v)`) · `:150`(`{!collapsed && (…)}`).
문제는 **줄어듦을 인라인 height 로만 표현**한다는 점이다:

```jsx
// ChartCard.jsx:72
height: collapsed ? "40px" : height,
```

팀 분석의 카드는 전부 `BentoTile` 의 자식이다(`TeamAnalyticsTab.jsx:278-344`). 그리고

```css
/* static/ui/src/components/layout/BentoGrid.css:17-30 */
.bento-tile { display: flex; flex-direction: column; }
.bento-tile > * { flex: 1; min-height: 0; }      /* = flex: 1 1 0% */
```

세로 flex 컨테이너에서 `flex-basis: 0%` 는 **`height` 프로퍼티를 대체**한다(주축 크기는 basis 가 이긴다).
즉 `height: "40px"` 도, 펼침 상태의 `height={430}`(`TeamChartFrame.jsx:98`)도 **둘 다 버려지고** 카드는 타일을 꽉 채운다.
타일 자체는 그리드 행에 stretch 되고(`BentoGrid.css:10-15` `align-items: stretch`, 행 높이 auto = 그 행 최댓값),
결과는 배치별로 갈린다:

| 배치 | 접었을 때 실제로 일어나는 일 |
|---|---|
| `span 6` 단독 행 (#7 프로젝트별 팀 투입, #5 계층 롤업) | 행 높이가 줄어 아래가 올라온다 — **부분적으로 동작한다** |
| `span 2` + `span 4` (가동률 밴드 + 팀 간 비교) | 행 높이를 **짝이 유지** → 본문만 사라지고 **거대한 빈 상자**가 남는다. 아무것도 안 올라온다 |
| `span 3` + `span 3` (인력 구성 + 가동률 vs 규모) | 위와 동일 |

→ 사용자가 "동작을 안 한다"고 말한 것은 **6개 중 4개가 이 상태**이기 때문이다.

### D-3. 확장(전체화면) 버튼 — 오버레이는 열리는데 **차트가 커지지 않는다**

`ChartCard.jsx:139` → `CardFullscreen`(포털, `ExpandContext.Provider value={true}`, `CardFullscreen.jsx:67`)까지는 정상 동작한다.
그런데 그 컨텍스트를 **읽는 곳이 앱 전체에 한 군데뿐**이다:

```
grep useExpanded → pages/portfolio/widgets/ChartBox.jsx:13  (유일한 소비처)
```

포트폴리오 `ChartBox.jsx:11-21` 는 `useExpanded()` 로 높이를 `78vh` 로 키우고 의존성 `[expanded]` 로 resize 를 다시 쏜다.
팀 분석의 `TeamChartBox.jsx:18-40` 에는 **`useExpanded` 호출이 아예 없고**, resize 이펙트 의존성도 `[]`(마운트 1회)다.
→ 전체화면을 열면 **뷰포트 전체가 흰 배경인데 왼쪽 위에 300px짜리 차트만** 놓인다. "확장이 안 된다"로 읽힌다.

### 원인이 **아닌** 것 (배제 근거)

- **핸들러 배선 끊김 아님.** Atlaskit `Box`(primitives 17.1.1)는 `as/children/padding/style/xcss/testId` 만 뽑고
  나머지를 `safeHtmlAttributes` 로 DOM 에 스프레드한다(`node_modules/@atlaskit/primitives/dist/cjs/components/box.js`). `onClick` 은 그대로 붙는다.
- **오버레이가 화면 밖 아님.** `.app-layout { height: 100vh }` + `.app-main { overflow: auto }`(`layout/sidebar.css:14-23`)라
  스크롤은 내부 div 가 먹는다. iframe 뷰포트는 고정이므로 `position: fixed; inset: 0` 은 항상 보이는 자리에 걸린다.
- **ChartTableToggle / ViewToggleButtons 아님.** 이들은 카드 헤더가 아니라 본문 상단에 있고 정상 동작한다.

---

## 1. 개요 / 영향 범위

- **백엔드**: 변경 없음. resolver·PermissionMap·DB 무관.
- **DB**: 없음. 접힘 상태는 **localStorage**(사용자 기기 취향값 — 서버에 저장하지 않는다).
- **프론트 신규**: `components/card/collapse/` 3파일(순수 모듈 1 + 컨텍스트 1 + 버튼 1).
- **프론트 수정**: 카드 셸 3종(`ChartCard`·`WidgetCard`·`Card`), `BentoGrid`(+css), 화면 3곳의 Provider·cardId 배선, `TeamChartBox`(확장 대응).
- **i18n**: `locales/kr/common.json` · `locales/en/common.json` 에 `card.collapse` / `card.expand` 2키.
- **쿼리키·데이터 훅**: **무변경**(요구 제약). 신규 외부 의존성 0.

---

## 2. 경계면 계약 — 공용 컴포넌트 API

백엔드가 없는 기능이므로 "경계면"은 **공용 카드 접기 계약**이다. 세 화면·세 카드 셸이 이 표 하나만 보고 붙는다.

### 2-1. 순수 모듈 `components/card/collapse/cardCollapse.js` (DOM·React 없음 → 테스트 대상)

| 함수 | 입력 | 반환 | 규약 |
|---|---|---|---|
| `readCollapsed(storageKey)` | `string` | `Record<string, boolean>` | 손상 JSON·접근 차단·배열·null → **`{}`**. 예외를 밖으로 내지 않는다 |
| `writeCollapsed(storageKey, state)` | `string, Record<string,boolean>` | `void` | 실패는 무시(메모리 상태로 degrade) |
| `mergeCollapsed(prev, next)` | 두 맵 | `Record<string,boolean>` | `next` 가 이기되 **`prev` 에만 있던 id 는 지우지 않는다**(탭 전환으로 지금 화면에 없는 카드의 기억 보존) |
| `toggleCard(state, cardId)` | 맵, `string` | 맵 | `cardId` 가 falsy 면 **원본 참조 그대로** 반환. 그 외 `{...state, [id]: !state[id]}` |
| `isCardCollapsed(state, cardId)` | 맵, `string` | `boolean` | `state?.[id] === true` (미지정 = 펼침) |

> 왜 `layout/panelLayout.js` 를 재사용하지 않는가: 저장 shape 이 `{weights, collapsed}` 2필드이고
> "마지막 남은 패널은 못 접는다"(`canCollapse`) 규칙이 붙어 있다. 카드에는 그 규칙이 없다.
> 형태를 억지로 공유하면 두 기능의 저장 JSON 이 섞이고 규칙이 새어 나온다.
> **패턴만** 그대로 베낀다(read/merge/write 3분할 + 순수 함수 + 예외 삼킴).

### 2-2. 컨텍스트 `components/card/collapse/CardCollapseContext.jsx`

| export | 시그니처 | 규약 |
|---|---|---|
| `CardCollapseProvider` | `({ storageKey, children })` | 화면 1개당 1개. 초기값 `readCollapsed(storageKey)`. 토글 시 `writeCollapsed(key, mergeCollapsed(readCollapsed(key), next))` 로 **읽고-병합-쓰기**. 토글 직후 `window.dispatchEvent(new Event('resize'))` 를 1회 쏜다(§6) |
| `CardIdProvider` | `({ cardId, children })` | 가장 가까운 카드 id 를 아래로 흘린다. `BentoTile` 이 내부에서 사용 |
| `useCardCollapse(cardId?)` | → `{ collapsed, toggle, persisted }` | `cardId` 생략 시 `CardIdProvider` 값을 쓴다. **Provider·id 가 없으면 로컬 `useState` 로 degrade**(`persisted:false`) — 프로젝트 상세 대시보드처럼 이번 범위 밖 화면의 기존 동작이 그대로 유지된다 |

> `PanelToggleButton`(`ResizablePanels.jsx:353-380`)의 "컨텍스트로 자기 id 를 알아내고, 밖에서는 조용히 degrade" 전례를 그대로 따른다.

### 2-3. 버튼 `components/card/collapse/CardCollapseButton.jsx`

| prop | 타입 | 설명 |
|---|---|---|
| `collapsed` | `boolean` | 현재 상태 |
| `onToggle` | `() => void` | 토글 |

렌더 계약(관례 고정):

```jsx
<button type="button"
        aria-expanded={!collapsed}
        aria-label={t(collapsed ? 'common.card.expand' : 'common.card.collapse')}
        title={동일}
        onClick={onToggle}>
    {collapsed ? <ChevronRightIcon label="" size="small"/> : <ChevronDownIcon label="" size="small"/>}
</button>
```

- **아이콘**: 펼침 = `chevron-down`(본문이 아래로 열려 있다) / 접힘 = `chevron-right`.
  현행 `ChartCard` 는 down/up 을 쓰는데 up/down 쌍은 "무엇이 지금 상태인지"를 못 알린다.
  `PanelToggleButton` 이 chevron-**double** 을 쓰는 이유("단일 chevron 은 다음/이전으로 읽힌다")는 **가로 패널 전용** 근거다 — 세로 아코디언에는 단일 chevron 이 맞다.
- **`disabled` 를 쓰지 않는다**: 카드 접기에는 금지 조건이 없다(패널과 달리 "마지막 하나" 제약 없음). `aria-disabled` 분기도 불필요.
- Atlaskit 토큰만 사용, 배경 transparent·`color.text.subtle`. 다크 테마는 토큰이 처리한다.

### 2-4. 카드 셸 3종의 헤더 버튼 계약 (변경 후)

| 셸 | 파일 | 헤더 우측 버튼(왼→오) | 접힘 시 렌더 |
|---|---|---|---|
| `ChartCard` | `components/chart/layout/ChartCard.jsx` | **[접기]** · [확장] · [새로고침 — `onRefresh` 가 있을 때만] | 제목행만. `hr`·description·본문 미렌더(현행 `:150` 그대로) |
| `WidgetCard` | `pages/portfolio/widgets/WidgetCard.jsx` | **[접기]** · `headerRight` · [확장(`expandable`)] | `h3` 만. `desc`·본문 미렌더 + **`minHeight` 무시** |
| `Card` | `components/card/Card.jsx` | `headerRight` · **[접기]** · [확장(`expandable`)] | 헤더행만. description·`hr`·content·footer 미렌더 + `height:'100%'` → `'auto'` |

- 세 셸 모두 **`cardId` prop 을 새로 받는다**(생략 시 `CardIdProvider` 값). id 도 Provider 도 없으면 접기 버튼을 **그리지 않는다** → 앱의 나머지 22개 `Card` 사용처는 픽셀 단위로 무변경.
- 새로고침 버튼은 `{onRefresh && (…)}` 로 감싸는 **조건부 렌더 1줄**로 끝낸다. 삭제하지 않는 이유: `DashboardPage.jsx:282`(프로젝트 상세 대시보드, 범위 밖)가 실제로 쓰고 있다.

---

## 3. 리플로우 성립 방안 (화면별)

### 3-1. BentoGrid (팀 분석 · 통합 대시보드)

`BentoTile` 에 `cardId` prop 을 추가하고, 접힘일 때 `data-collapsed="true"` 를 찍는다. CSS 는 **2줄**만 늘린다:

```css
/* BentoGrid.css 말미 */
.bento-tile[data-collapsed="true"] { align-self: start; }      /* 행 높이만큼 늘어나지 않는다 */
.bento-tile[data-collapsed="true"] > * { flex: 0 0 auto; }     /* D-2 의 flex:1 basis 무력화 해제 */
```

이 두 줄이 **D-2 의 근본 원인을 정확히 되돌린다**(basis 0 → auto, stretch → start).
그리드 메커니즘 교체 없음, 기존 span 배치·반응형 규칙 무변경.

성립 범위 — 정직하게 적는다:

| 배치 | 접힘 후 |
|---|---|
| `span 6` 단독 행 | **완전 성립.** 행이 헤더 높이로 줄고 아래 카드 전부 상승 |
| 한 행 2장 중 **둘 다** 접음 | **완전 성립.** 행 소멸에 가깝게 줄어든다 |
| 한 행 2장 중 **하나만** 접음 | 접은 카드는 헤더만 남고(빈 상자 없음), **행 높이는 짝이 유지** → 그 아래는 올라오지 않는다 |
| ≤1200px(2열) / ≤760px(1열) | 짝이 풀리는 구간이 생겨 성립 범위가 넓어진다 |

> **왜 여기서 멈추는가**: CSS Grid 는 한 행 안에서 아이템별로 행 높이를 다르게 줄 수 없다.
> 진짜 masonry 리플로우는 `grid-template-rows: masonry`(미출시) 또는 JS 절대배치가 필요한데,
> 둘 다 "그리드 메커니즘 교체 금지" 제약에 걸리고 후자는 카드 위치 고정 원칙(`BentoGrid.jsx:20`)도 깬다.
> **행 단위 리플로우까지가 이 그리드에서 가능한 최대치**다.

### 3-2. 마이페이지 (`/my-page`)

`MyPage.jsx:133` 는 `<Stack space="space.200">` 세로 흐름이고, 두 곳만 좌우 2분할이다(`splitRowStyle`, `:34-40`).

| 구간 | 접힘 후 |
|---|---|
| `MyContributionCharts`(3장 auto-fit 그리드) · `MyWorklogPanel` · `MyTeamSection` — Stack 직계 | **완전 성립.** 블록 흐름이라 접는 즉시 아래 전부 상승 |
| 좌우 2분할 2행(프로젝트\|작업, 권한\|스킬) | 한쪽만 접으면 행 높이는 반대쪽이 유지(§3-1 짝 규칙과 동일). **둘 다 접으면 상승** |
| `MyContributionCharts` 내부 3장 | 같은 행이면 위 규칙, `auto-fit`(min 320px)로 줄바꿈되면 각자 성립 |

**추가 수정 필요 없음**: `splitRowStyle` 은 `alignItems:'stretch'` 지만 카드가 그 안의 **블록 자식**이라,
`Card` 가 접힘 시 `height:'auto'` 로 그리기만 하면 헤더 높이로 줄고 나머지는 빈 여백이 된다(거대한 빈 상자 없음).
`MyPage.jsx` 인라인 스타일은 **손대지 않는다**.

### 3-3. 통합 대시보드 종합 개요 카드

`PortfolioDashboardPage.jsx:244` 의 `WidgetCard`(T/S/R 신호등)는 BentoGrid 밖 블록 흐름이다 → **완전 성립**.

---

## 4. 새로고침 버튼 제거 목록 (전수)

| 위치 | 판정 |
|---|---|
| `components/chart/layout/ChartCard.jsx:142-144` | **조건부로 전환**(`onRefresh` 있을 때만). 팀 분석에서는 사라진다 = 요구 충족. 프로젝트 상세 대시보드에서는 유지 |
| `pages/portfolio/PortfolioHeader.jsx:58` "지금 재집계" | **유지.** 카드 버튼이 아니라 페이지 헤더의 실제 전사 재집계 트리거(`triggerPortfolioAggregation`) |
| `pages/portfolio/PortfolioDashboardPage.jsx:216` 빈 상태 CTA | **유지.** 데이터가 아예 없을 때의 유일한 진입 |
| `pages/portfolio/sections/ComparisonTabs.jsx:109` | **유지.** 인건비 마스킹 사유별 CTA |
| 마이페이지 | 카드 새로고침 버튼 **없음**(확인 완료) |

즉 **카드 헤더의 새로고침 버튼은 앱 전체에 `ChartCard` 하나뿐**이고, 그 하나만 손대면 된다.

---

## 5. 적용 대상 카드 전수 표

`cardId` 는 localStorage 키의 필드명이 된다 — **화면 안에서 유일**하면 충분하고, 화면 간 중복은 무해하다(스토리지 키가 다르다).

### 5-1. 팀 분석 — `storageKey = "resource.teamAnalytics.cards"` (6장)

| # | 카드 | 렌더 파일 | 타일 | `cardId` | 접기 | 확장 |
|---|---|---|---|---|---|---|
| 1 | 프로젝트별 팀 투입 | `charts/TeamProjectStack.jsx:102` | `span 6` | `projectStack` | O | O(D-3 수정 후) |
| 2 | 가동률 밴드 분포 | `charts/TeamUtilBandStack.jsx:71` | `span 2` | `utilBand` | O | O |
| 3 | 팀 간 비교 | `charts/TeamCompareBar.jsx:137` | `span 4` | `compare` | O | O |
| 4 | 인력 구성 | `charts/TeamCompositionStack.jsx:62` | `span 3` | `composition` | O | O |
| 5 | 가동률 vs 규모 | `charts/TeamUtilScatter.jsx:77` | `span 3` | `utilScatter` | O | O |
| 6 | 계층 롤업 | `charts/TeamRollupTable.jsx:149` | `span 6` | `rollup` | O | O |

`TeamKpiRow`(KPI 타일 행)·`TeamScopeSelector`·`TeamProjectFilter` 는 카드가 아니므로 **대상 아님**.
로딩 스켈레톤(`TeamAnalyticsTab.jsx:159-172`)의 `ChartCard` 에는 `cardId` 를 주지 않는다 → 버튼 없음(현행 유지).

### 5-2. 통합 대시보드 — `storageKey = "portfolio.dashboard.cards"` (16장)

| 구획 | 카드 | 파일:라인 | 타일 | `cardId` |
|---|---|---|---|---|
| 개요 | 종합 개요(T/S/R 신호등) | `PortfolioDashboardPage.jsx:244` | (그리드 밖) | `overview` |
| Time | 일정 간트 | `tabs/TimeTab.jsx:23` | 6 | `gantt` |
| Time | 공수 추이 | `tabs/TimeTab.jsx:36` | 4 | `effortTrend` |
| Time | 리스크 TOP | `tabs/TimeTab.jsx:49` | 2 | `riskTop` |
| Scope | 이슈 상태 분포 | `tabs/ScopeTab.jsx:24` | 2 | `issueStatus` |
| Scope | 완성률 vs 일정률 | `tabs/ScopeTab.jsx:37` | 4 | `scopeProgress` |
| Scope | 계획 대비 실적 | `tabs/ScopeTab.jsx:50` | 3 | `plannedActual` |
| Scope | 문제 이슈 TOP | `tabs/ScopeTab.jsx:63` | 3 | `problemBubble` |
| Resource | 롤/레벨 분포 | `tabs/ResourceTab.jsx:32` | 3 | `roleLevel` |
| Resource | 가동률 | `tabs/ResourceTab.jsx:51` | 3 | `utilization` |
| Resource | 작업 분포 | `tabs/ResourceTab.jsx:65` | 6 | `workDist` |
| Cost | 전사 KPI | `tabs/CostTab.jsx:30` | 6 | `costKpi` |
| Cost | 월별 소진 추이 | `tabs/CostTab.jsx:44` | 4 | `monthlyBurn` |
| Cost | 계획 vs 실집행 | `tabs/CostTab.jsx:58` | 2 | `costPlanActual` |
| Cost | 소진율 vs 진척률 | `tabs/CostTab.jsx:72` | 3 | `costScatter` |
| Cost | 역할/레벨별 비용 | `tabs/CostTab.jsx:86` | 3 | `costByRoleLevel` |
| Cost | 비용 초과 위험 순위 | `tabs/CostTab.jsx:105` | 6 | `costOverrunRank` |

(표 17행 = 개요 1 + 탭 16. 확장 버튼은 전부 이미 동작 중 — `WidgetCard` 기본 `expandable=true` + `ChartBox` 가 `useExpanded` 를 읽는다.)
로딩 스켈레톤(`PortfolioDashboardPage.jsx:165,175,178`)은 `cardId` 미부여.
`minHeight={540}`(ResourceTab)은 접힘 시 무시해야 한다 — 안 하면 접어도 540px 로 남는다.

### 5-3. 마이페이지 — `storageKey = "myPage.cards"` (9장)

| 카드 | 파일:라인 | 배치 | `cardId` | 접기 | 확장 |
|---|---|---|---|---|---|
| 내 프로젝트 | `sections/MyProjectsPanel.jsx:106` | 2분할 좌 | `projects` | O | **없음(현행 유지)** |
| 내 작업 | `sections/MyIssuesPanel.jsx:176` | 2분할 우 | `issues` | O | O(기존) |
| 상태 분포 | `sections/MyContributionCharts.jsx:167` | auto-fit 3열 | `chartStatus` | O | O(기존) |
| 일별 추이 | `sections/MyContributionCharts.jsx:174` | auto-fit 3열 | `chartDaily` | O | O(기존) |
| 이슈별 기여 | `sections/MyContributionCharts.jsx:184` | auto-fit 3열 | `chartByIssue` | O | O(기존) |
| 내 워크로그 | `sections/MyWorklogPanel.jsx:235` | 전폭 | `worklog` | O | O(기존) |
| 내 팀(팀장) | `sections/MyTeamSection.jsx:88` | 전폭 | `team` | O | 없음 |
| 내 팀(비팀장 단문) | `sections/MyTeamSection.jsx:76` | 전폭 | `team` | O | 없음 |
| 내 권한 | `sections/MyPermissionSection.jsx:70` | 2분할 좌 | `permission` | O | O(기존) |
| 내 스킬 | `sections/MySkillSection.jsx:112` | 2분할 우 | `skill` | O | 없음 |

- **확장 버튼은 새로 만들지 않는다**(요구: 억지 확장 금지). `expandable` 이 없는 3장(프로젝트·팀·스킬)은 접기만 붙인다.
- `MyPageHeader`·`MyPageSummary`(KPI 타일)는 카드가 아니므로 대상 아님.
- 비팀장 분기와 팀장 분기는 **같은 `team` id 를 공유**한다(같은 섹션이므로 접힘 기억이 이어진다).

---

## 6. ECharts 접힘/펼침 처리 — 기존 메커니즘으로 충분한가

**본문은 언마운트한다**(`{!collapsed && children}`). `ChartCard` 가 이미 그렇게 하고 있고(`:150`), 숨김보다 메모리·재측정이 단순하다.

- **펼칠 때 재측정**: 새로 마운트된 ECharts 는 `onChartReady` 에서 스스로 `resize()` 한다
  (`TeamChartBox.jsx:37`, `ChartBox.jsx:34`). 마이페이지 차트는 고정 px 높이(`MyContributionCharts.jsx:153`)라 마운트 측정만으로 맞는다.
  → **차트별 추가 배선은 불필요.**
- 다만 안전망으로 **Provider 의 `toggle` 이 커밋 후 `window.dispatchEvent(new Event('resize'))` 를 1회** 쏜다.
  `echarts-for-react` 는 window resize 를 구독하므로 이 한 줄이 세 화면 21개 차트를 전부 덮는다.
  전례: `CardFullscreen.jsx:23-27`(전체화면 진입 시 동일 처리), `TeamChartBox.jsx:23-26`.
  → **ResizeObserver 신설 금지.** FullCalendar 처럼 자체 관측이 필요한 위젯은 이 3화면에 없다.
- **부작용(수용)**: 본문 언마운트로 자식 내부 state 가 초기화된다 —
  `ChartTableToggle` 의 차트/표 선택(`ChartTableToggle.jsx:23`), `CommonTable` 의 페이지 인덱스.
  카드를 접었다 펴는 것은 사용자가 의도한 행위이고, 필터·기간 등 **의미 있는 상태는 카드 바깥(부모 섹션)에 있어** 보존된다.
  숨김(`display:none`)으로 바꾸면 이 초기화는 막히지만 21개 ECharts 인스턴스가 0크기로 살아남아 펼칠 때 강제 resize 가 **반드시** 필요해진다 — 단순한 쪽을 택한다.

### D-3 수정 (확장 실동작)

`TeamChartBox.jsx` 를 포트폴리오 `ChartBox` 와 같은 계약으로 맞춘다(3줄):

```js
const expanded = useExpanded();                       // 신규
const effectiveHeight = expanded ? '78vh' : height;   // 신규
useEffect(() => { … }, [expanded]);                   // deps [] → [expanded]
```

`isEmpty` 경로의 `EmptyState height` 도 `effectiveHeight` 로 맞춘다(`ChartBox.jsx:24` 와 동일).
호출부 6곳은 `height` 를 계속 계산해 넘기므로 **props 계약 변경 없음**.

---

## 7. 프론트엔드 설계 — 파일별 작업 지도

```
static/ui/src/
├─ components/card/collapse/            ★신규
│  ├─ cardCollapse.js                   순수 모듈 (§2-1)
│  ├─ CardCollapseContext.jsx           Provider · CardIdProvider · useCardCollapse (§2-2)
│  └─ CardCollapseButton.jsx            chevron 버튼 (§2-3)
├─ components/card/__test__/
│  └─ cardCollapse.test.js              ★신규 (§9)
├─ components/card/Card.jsx             수정 — cardId · 접기 버튼 · 접힘 렌더 · height auto
├─ components/chart/layout/ChartCard.jsx 수정 — useCardCollapse 로 상태 교체, 새로고침 조건부, 접힘 시 flex 해제
├─ components/layout/BentoGrid.jsx      수정 — BentoTile cardId → data-collapsed + CardIdProvider
├─ components/layout/BentoGrid.css      수정 — 접힘 타일 2줄 (§3-1)
├─ pages/portfolio/
│  ├─ PortfolioDashboardPage.jsx        수정 — CardCollapseProvider 감싸기 + 개요 카드 cardId
│  ├─ widgets/WidgetCard.jsx            수정 — cardId · 접기 버튼 · 접힘 시 minHeight 무시
│  ├─ portfolioCards.js                 ★신규 — cardId 상수 (§5-2)
│  └─ tabs/{Time,Scope,Resource,Cost}Tab.jsx  수정 — BentoTile 에 cardId 만 추가
├─ pages/resource/teamAnalytics/
│  ├─ TeamAnalyticsTab.jsx              수정 — Provider + BentoTile cardId
│  ├─ TeamChartFrame.jsx                수정 — cardId prop 통과(또는 BentoTile 컨텍스트에 의존)
│  ├─ TeamChartBox.jsx                  수정 — useExpanded (§6)
│  └─ teamAnalyticsCards.js             ★신규 — cardId 상수 (§5-1)
└─ pages/myPage/
   ├─ MyPage.jsx                        수정 — CardCollapseProvider 로 Stack 감싸기 (인라인 스타일 무변경)
   ├─ myPageCards.js                    ★신규 — cardId 상수 (§5-3)
   └─ sections/*.jsx                    수정 — 각 Card 에 cardId 한 줄
```

- **Zustand 스토어 변경 없음**(접힘은 화면 로컬 취향값이라 전역 스토어로 올릴 이유가 없다. `useJobStore` 처럼 화면을 넘나드는 값이 아니다).
- **쿼리키 변경 없음.**
- **권한 체크 없음** — 접기는 표시 취향이다. 각 화면의 기존 게이트(`RESOURCE_MANAGEMENT` / `REPORT`)를 그대로 통과한 뒤의 문제다.
- **코드 스플리팅 주의**: 새 컴포넌트는 전부 정적 import(작다). lazy 경계를 새로 만들지 않는다 → React #426 위험 없음.

### localStorage 키 규약

기존 관례(`myWork.panels.layout`, `resource.assignmentPanels.layout`, `projectDetail.workTreePanels.layout`)를 따라 **점 구분 소문자**:

```
resource.teamAnalytics.cards     → {"projectStack":true,"compare":false,…}
portfolio.dashboard.cards
myPage.cards
```

저장 shape 은 **`{ [cardId]: boolean }` 평면 맵 하나**(패널처럼 `{weights,collapsed}` 2층으로 만들지 않는다 — 폭 개념이 없다).
쓰기는 **토글 시점에만**(패널의 "드래그 중 매 프레임 쓰지 않는다" 원칙과 동일).

---

## 8. i18n 키 목록

`locales/kr/common.json` · `locales/en/common.json` — 최상위 `card` 그룹 신설(`panel` 옆).

| 키 | kr | en |
|---|---|---|
| `common.card.collapse` | `접기` | `Collapse` |
| `common.card.expand` | `펼치기` | `Expand` |

- 이름 삽입형(`{name} 접기`)을 쓰지 않는 이유: `Card` 의 `title` 이 JSX 노드인 사용처가 있다(`MyTeamSection.jsx:89` — 배지 포함 `<span>`). 평문 이름을 항상 얻을 수 없다.
- **`portfolio.common.expand`("확장해서 보기")와 충돌하지 않는다** — 그것은 *전체화면*, 이것은 *펼치기*다. 기존 키는 건드리지 않는다.
- 작업 후 `cd static/ui && npm run merge` 필수. `locales/ko-KR.json`·`en-US.json` 직접 수정 금지, `locales/script/*.json` 은 빈 스텁이므로 넣지 말 것.
- `pages/resource/teamAnalytics/__test__/teamAnalyticsI18n.test.js` 는 **탭 디렉토리만** 스캔한다. 새 키는 `components/card/collapse/` 에 있으므로 그 테스트에 영향 없다(키는 어차피 kr·en 양쪽에 추가하므로 통과).

---

## 9. 테스트 설계

이 리포의 프론트 테스트는 **jest + jsdom, testing-library 없음**(`static/ui/package.json` 에 미포함). 레이아웃은 jsdom 에서 계산되지 않는다.
→ **순수 함수만 테스트**한다. `components/layout/__test__/panelLayout.test.js` 와 같은 형태.

`components/card/__test__/cardCollapse.test.js`

| 케이스 | 기대 |
|---|---|
| `readCollapsed` — 없는 키 / 손상 JSON / 배열 / `null` / localStorage 접근 예외 | 전부 `{}`, throw 없음 |
| `readCollapsed` — 정상 맵 | 그대로 반환 |
| `toggleCard` — 미지정 id | `true` 로 켜짐 |
| `toggleCard` — `true` 인 id | `false`(키를 **지우지 않는다** — 패널의 "펼침을 false 로 남긴다" 전례) |
| `toggleCard` — `''`/`undefined` cardId | **원본 참조 그대로**(`toBe`) |
| `mergeCollapsed` — prev 에만 있는 id | 보존 |
| `mergeCollapsed` — 겹치는 id | next 가 이김 |
| `mergeCollapsed` — 비객체/배열 입력 | `{}` 로 취급, throw 없음 |
| `isCardCollapsed` — 미지정/`false`/`true`/비객체 | `false,false,true,false` |
| `writeCollapsed` — `setItem` 이 throw(사파리 프라이빗 모사) | 예외가 밖으로 나오지 않는다 |

**하지 않는 테스트**(사유 명시): 접힘 시 실제 높이·행 리플로우는 jsdom 이 레이아웃을 계산하지 않아 검증 불가 — **수동 검증 항목**(§11)으로 넘긴다.

회귀 게이트: 루트 `npm test`(백엔드) + `cd static/ui && npm test` + `CI=true npm run build`(번들 예산 게이트 포함).
번들 영향: 신규 의존성 0, 아이콘 `chevron-right` 1개 추가(`chevron-down`·`chevron-up` 은 이미 `ChartCard` 가 import 중).

---

## 10. 비목표 (이번에 하지 않는 것)

| 항목 | 사유 |
|---|---|
| **프로젝트 상세 대시보드**(`projectDetail/dashboard`, react-grid-layout) | 요구 명시 범위 밖. `ChartCard` 를 쓰지만 Provider 를 두지 않으므로 접힘은 **로컬·비영속**으로 현행 유지되고, `onRefresh` 를 넘기므로 새로고침 버튼도 그대로 살아 있다 |
| **프로젝트 상세 분석리포트/진척도/비용**(BentoGrid 사용) | 같은 이유. `BentoTile` 에 `cardId` 를 주지 않으면 `data-collapsed` 가 붙지 않아 CSS 도 무발동 |
| 한 행 안에서 카드별로 다른 높이(진짜 masonry) | §3-1 참조. 그리드 교체 금지 제약 + masonry 미출시 |
| `Card`·`WidgetCard`·`ChartCard` 3종 셸의 단일 컴포넌트 통합 | 헤더 구조·편집 모드·InfoTip 규약이 서로 달라 통합은 별건 리팩터다. 이번엔 **접기 계약만** 공용 지점으로 수렴한다(RFC-178 원칙 충족) |
| 확장 버튼 신설(마이페이지 프로젝트·팀·스킬 카드) | "억지 확장 금지" 지시 |
| 접힘 상태 서버 저장·계정 간 동기화 | 기기별 표시 취향. KVS·MySQL 어디에도 넣지 않는다 |
| "모두 접기 / 모두 펼치기" 일괄 버튼 | 요구에 없음. 필요해지면 Provider 에 `collapseAll` 만 추가하면 되도록 계약을 열어 둔다 |

---

## 11. 구현 작업 분해 (frontend 전용 체크리스트)

### P0 — 공용 계약 (다른 모든 작업의 선행)
- [ ] `components/card/collapse/cardCollapse.js` — §2-1 5함수. 순수·예외 삼킴
- [ ] `components/card/__test__/cardCollapse.test.js` — §9 표 전 케이스
- [ ] `components/card/collapse/CardCollapseContext.jsx` — Provider / CardIdProvider / `useCardCollapse`(Provider 없으면 로컬 state degrade) + 토글 후 `resize` 1회
- [ ] `components/card/collapse/CardCollapseButton.jsx` — chevron-down/right, `aria-expanded`, Atlaskit 토큰
- [ ] `locales/kr/common.json` · `locales/en/common.json` 에 `card.collapse`/`card.expand` 추가 → `npm run merge`

### P1 — 카드 셸 3종 + 그리드
- [ ] `ChartCard.jsx` — 로컬 `collapsed` → `useCardCollapse()`; 버튼 순서 [접기][확장][새로고침]; **새로고침 `{onRefresh && …}` 조건부**(D-1 해소); 접힘 시 `height:'auto'`·`flex:'0 0 auto'`
- [ ] `WidgetCard.jsx` — `cardId` prop, 접기 버튼(확장 왼쪽), 접힘 시 `desc`·본문 미렌더 + **`minHeight` 미적용**
- [ ] `Card.jsx` — `cardId` prop, 접기 버튼(확장 왼쪽), 접힘 시 description·`hr`·content·footer 미렌더 + `height:'100%'`→`'auto'`
- [ ] `BentoGrid.jsx` — `BentoTile({ cardId })` → `data-collapsed` + `CardIdProvider`
- [ ] `BentoGrid.css` — §3-1 의 2줄 (D-2 해소)
- [ ] 세 셸 모두: **`cardId`·Provider 가 없으면 접기 버튼 미렌더** 회귀 방어 확인(기존 22개 `Card` 사용처)

### P2 — 화면 배선
- [ ] 팀 분석: `teamAnalyticsCards.js` 상수 → `TeamAnalyticsTab.jsx` Provider(`resource.teamAnalytics.cards`) + 6 `BentoTile` 에 `cardId`
- [ ] 팀 분석: `TeamChartBox.jsx` 에 `useExpanded` 적용 (D-3 해소)
- [ ] 대시보드: `portfolioCards.js` 상수 → `PortfolioDashboardPage.jsx` Provider(`portfolio.dashboard.cards`) + 개요 카드 `cardId` + 4개 탭의 16 `BentoTile` 에 `cardId`
- [ ] 마이페이지: `myPageCards.js` 상수 → `MyPage.jsx` Provider(`myPage.cards`) + 9개 섹션 `Card` 에 `cardId`(인라인 레이아웃 스타일 무변경)

### P3 — 검증
- [ ] `cd static/ui && npm test` / 루트 `npm test` / `CI=true npm run build`(번들 예산)
- [ ] **수동**(jsdom 불가): ① 팀 분석 span6 카드 접기 → 아래 상승 ② 짝 카드 둘 다 접기 → 상승, 하나만 접기 → 빈 상자 없이 헤더만 ③ 새로고침 아이콘이 팀 분석에서 사라졌고 프로젝트 상세 대시보드에는 남아 있다 ④ 확장 시 차트가 78vh 로 커진다(팀 분석 6장) ⑤ 새로고침(F5) 후 접힘 유지 ⑥ 다크 테마 아이콘 대비 ⑦ 마이페이지 전폭 섹션 접기 → 아래 상승 ⑧ 접었다 펴면 차트가 올바른 크기로 다시 그려진다
