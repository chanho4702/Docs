# 통합 정합성 검증 리포트 — 분석 카드 접기/확장 + 리플로우

> 2026-08-12 · 기준 설계서 `01_architect_design.md` · 대상 구현 `02_frontend_report.md`
> 프론트 전용 기능(백엔드 resolver·PermissionMap·쿼리키 무변경) → 검증축은 **공용 카드 접기 계약 ↔ 3화면 배선**이다.

## 0. 판정 요약

| 구분 | 건수 | 비고 |
|---|---|---|
| **통과** | 21 | 죽은 버튼 3종·32장 배선·무회귀·상태저장·i18n·게이트 |
| **실패** | 1 (**검증자가 직접 수정 완료**) | 마이페이지 기여도 차트 3장 — 접어도 카드가 줄지 않음(D-2 증상 재현) |
| **미검증** | 8 | 실제 레이아웃/픽셀 — jsdom 미계산, 수동 확인 필요 |
| 관찰(결함 아님) | 3 | 리포트 라인번호 드리프트·카드 사용처 개수 오기·locales 트랙 혼재 |

---

## 1. 죽은 버튼 3종 — **통과**

### D-1 새로고침 조건부 — 통과 (프로젝트 상세 대시보드 무회귀 확인)

| 축 | 위치 | 확인 |
|---|---|---|
| 생산(조건부 렌더) | `components/chart/layout/ChartCard.jsx:154-158` | `{onRefresh && (…)}` + 핸들러 `onRefresh?.()` → `onRefresh()` |
| 소비 A (유지돼야 함) | `pages/projectDetail/dashboard/DashboardPage.jsx:282` | `onRefresh={() => handleRefresh(item)}` **현존** → 아이콘 그대로 렌더 ✔ |
| 소비 B (사라져야 함) | `pages/resource/teamAnalytics/TeamChartFrame.jsx:101` | `title`/`description`/`height` 만 전달 → 아이콘 미렌더 ✔ |

`ChartCard` 사용처는 앱 전체 3곳뿐이며(위 2곳 + `TeamAnalyticsTab.jsx:171` 스켈레톤) 전수 대조했다.
설계 §4의 "유지" 4건(`PortfolioHeader:58`·`PortfolioDashboardPage:216`·`ComparisonTabs:109`·마이페이지 없음)은 diff에 손댄 흔적이 없다.

### D-2 BentoGrid CSS 오버라이드 — 통과 (스코프 격리 확인)

```css
/* BentoGrid.css:43-49 */
.bento-tile[data-collapsed="true"]      { align-self: start; }
.bento-tile[data-collapsed="true"] > *  { flex: 0 0 auto; }
```

- 두 규칙 모두 **`[data-collapsed="true"]` 속성 선택자에만** 걸린다. `BentoGrid.jsx:51` 은
  `data-collapsed={cardId && collapsed ? 'true' : undefined}` — **`cardId` 가 없으면 속성 자체가 붙지 않는다.**
  → cardId 미부여 타일(프로젝트 상세 진척도·비용·분석리포트, 포트폴리오 로딩 스켈레톤)은 셀렉터에 매칭되지 않아 **픽셀 무변경**. ✔
- 기존 `.bento-tile { align-items:stretch(그리드) / flex:1 }` 규칙(`:10-30`)은 한 글자도 수정되지 않았다 — 신규 2규칙은 파일 말미 추가분이다. ✔
- `ChartCard.jsx:84-85` 가 인라인으로도 `height:'auto'` + `flex:'0 0 auto'` 를 넣어 CSS 와 이중으로 basis 0 을 푼다(상충 없음, 같은 값).

### D-3 TeamChartBox useExpanded — 통과 (portfolio ChartBox와 동형, props 무변경)

| 항목 | `widgets/ChartBox.jsx` | `teamAnalytics/TeamChartBox.jsx` | 일치 |
|---|---|---|---|
| `useExpanded()` | `:13` | `:19` | ✔ |
| `effectiveHeight = expanded ? expandedHeight : height` | `:15` | `:22` | ✔ |
| resize 이펙트 deps | `[expanded]` `:21` | `[expanded]` `:31` | ✔ |
| `EmptyState height` | `effectiveHeight` `:24` | `effectiveHeight` `:33` | ✔ |
| `expandedHeight` 기본값 | `'78vh'` | `'78vh'` | ✔ |

- **props 계약 무변경 확인**: 호출부 7곳(`TeamProjectStack:139`·`TeamUtilBandStack:91`·`TeamCompareBar:180,182`·`TeamCompositionStack:78`·`TeamUtilScatter:92`·`TeamRollupTable:172`)은 종전대로 `option`/`height`/`isEmpty`/`empty` 만 넘긴다. 추가된 `expandedHeight` 는 기본값이 있는 **선택 prop**이다. ✔
- 컨텍스트 도달 경로도 실코드로 확인: `ChartCard` → `CardFullscreen`(`ExpandContext.Provider value={true}`) → `{children}`(TeamChartFrame 본문) → `ChartTableToggle` → `TeamChartBox`. 중간 래퍼가 컨텍스트를 끊지 않는다. ✔

---

## 2. 32장 적용 확인표 — grep 전수 재검증 **통과**

| 화면 | 설계/리포트 | grep 실측 | 판정 |
|---|---|---|---|
| 팀 분석 `resource.teamAnalytics.cards` | 6 | `TeamAnalyticsTab.jsx:292,310,314,329,333,342` = **6** | ✔ |
| 통합 대시보드 `portfolio.dashboard.cards` | 17 (개요1+탭16) | 개요 `PortfolioDashboardPage.jsx:249` + `TimeTab:23,36,49`(3) + `ScopeTab:24,37,50,63`(4) + `ResourceTab:32,51,65`(3) + `CostTab:30,44,58,72,86,105`(6) = **17** | ✔ |
| 마이페이지 `myPage.cards` | 9 id / 10 사용처 | `MyContributionCharts:170,178,189`·`MyIssuesPanel:179`·`MyPermissionSection:73`·`MyProjectsPanel:109`·`MySkillSection:115`·`MyTeamSection:78,98`·`MyWorklogPanel:238` = **10 사용처 / 9 고유 id**(`team` 공유) | ✔ |
| **합계** | **32 고유 id / 33 사용처** | 동일 | ✔ |

- cardId 상수는 세 파일 모두 화면 안에서 유일(중복 키 없음), 스토리지 키 3개 서로 다름. ✔
- 타일 span 값이 설계표와 전부 일치(6/2/4/3/3/6, 6/4/2, 2/4/3/3, 3/3/6, 6/4/2/3/3/6). ✔
- **마이페이지 확장 신설 0 확인**: `git diff -- static/ui/src/pages/myPage/` 에 `expandable` 이 **추가된 줄(+)이 하나도 없다**. 기존 `expandable` 은 전부 컨텍스트 줄이며, 확장이 없던 3장(`projects`·`team`·`skill`)은 여전히 없다. ✔
- 로딩 스켈레톤 미부여 확인: `TeamAnalyticsTab.jsx:171` 및 `PortfolioDashboardPage.jsx:167,177,180`(리포트 표기 165/175/178에서 라인 드리프트) — 전부 `cardId` 없음. ✔

---

## 3. 기존 화면 무회귀 — **통과** (이탈 1건 타당 판정)

### degrade 경로 (2중 방어)

`useCardCollapse`(`CardCollapseContext.jsx:75-93`): `persisted = !!(api && id)`.
`api`(Provider) 와 `id`(prop 또는 `CardIdProvider`) **둘 다** 있어야 영속 모드다. 하나라도 없으면 로컬 `useState` 로 떨어진다.

| 셸 | Provider 밖 동작 | 판정 |
|---|---|---|
| `Card.jsx:128` | `{persisted && <CardCollapseButton/>}` — 버튼 미렌더 | ✔ 무변경 |
| `WidgetCard.jsx:94` | `{persisted && …}` — 버튼 미렌더 | ✔ 무변경 |
| `ChartCard.jsx:149` | **무조건 렌더**(이탈 1건) | 아래 판정 |

- cardId 미부여 `Card` 사용처: **13파일 37개소**(설계·리포트의 "22곳"은 과소 집계 — 실측치는 `ProgressPage` 10 · `CostPage` 10 · `ProjectTeamAnalysisPage` 3 · `ProjectAssignmentBoard` 3 · `TaskHistoryPage` 2 · `WorklogPage` 2 · 나머지 8파일 각 1). 개수 오기는 결함이 아니다 — 이 화면들은 **Provider 자체가 없어** `api === null` 이므로 cardId 유무와 무관하게 전부 degrade 한다. 구조적 보장이 개수보다 강하다. ✔
- 프로젝트 상세 대시보드(`DashboardPage.jsx:277`): Provider·cardId 둘 다 없음 → 로컬 state, 새로고침 버튼 유지, `edit` 모드 버튼 구성 무변경. ✔
  - 관찰: 접힘 시 높이가 `40px`(고정) → `auto`(헤더 내용)로 바뀐다. `react-grid-layout` 아이템 안이라 flex basis 간섭이 없고 실측 헤더 높이도 ≈40px 라 시각 차는 무시할 수준. **수동 확인 항목(§6-③)에 포함**.

### 이탈 1건 판정 — **타당 (현행 보존이 옳다)**

리포트 §6-1: "`ChartCard` 의 접기 버튼은 Provider 밖에서도 계속 렌더한다."

- 설계 §11 P1 마지막 항목("세 셸 모두 미렌더")과 설계 §2-4 표(`ChartCard` 헤더에 [접기] 무조건 표기)·§10("프로젝트 상세 대시보드는 접힘이 **로컬·비영속으로 현행 유지**")가 **설계서 내부에서 모순**이다.
- 실코드 근거로 §2-4·§10 쪽이 옳다: `ChartCard` 는 이번 작업 **이전부터** 접기 버튼을 갖고 있었다(diff 기준 `ChevronUpIcon`/`ChevronDownIcon` 토글). 이걸 `persisted` 로 가리면 프로젝트 상세 대시보드에서 **기존 기능이 사라지는 회귀**다.
- 미렌더 규칙은 버튼을 **새로 붙인** 두 셸(`Card`·`WidgetCard`)에만 적용됐고, "기존 사용처 픽셀 무변경" 목표는 그대로 달성된다. **이탈을 승인한다.**
- 잔여(무해): 팀 분석 로딩 스켈레톤(`TeamAnalyticsTab.jsx:171`)의 접기 버튼도 남아 로컬 토글로 동작한다. 데이터 도착 시 사라지는 과도 상태라 사용자 영향 없음.

### 트랙 오염 — 통과

`git status` 의 다른 트랙 미커밋 파일(ResizablePanels v2/v3·panelLayout·WorklogPage·gantt·WorkQueueItem/Panel·AssignmentPage·CandidatePanel·ProjectTreeView·ProjectAssignmentBoard·CostByIssueTable·`src/resolver/projectCost`·`projectProgress`)의 diff를
`cardId|cardCollapse|card/collapse|data-collapsed` 로 전수 grep한 결과 **매칭 0건**. 이 기능은 해당 파일을 건드리지 않았다. ✔
`locales/kr|en/common.json` 에 다른 트랙 키(`panel.collapseBlocked`)가 함께 들어 있고 `projectDetail.json` 도 선행 수정 상태이나, **공유 파일의 트랙 혼재**이지 이 기능의 결함이 아니다(리포트 §6-4 와 동일 판단).

---

## 4. 상태 저장 — **통과**

| 계약(설계 §2-1/§7) | 구현 | 판정 |
|---|---|---|
| 화면 단위 키, 점 구분 소문자 | `resource.teamAnalytics.cards` / `portfolio.dashboard.cards` / `myPage.cards` — 3파일 상수, 서로 다름 | ✔ |
| 저장 shape 평면 맵 `{[cardId]:boolean}` | `writeCollapsed` 가 맵 그대로 직렬화(2층 아님) | ✔ |
| 병합 저장(다른 탭 기억 보존) | `CardCollapseContext.jsx:46` `writeCollapsed(key, mergeCollapsed(readCollapsed(key), next))` — 읽고-병합-쓰기 | ✔ |
| 쓰기는 토글 시점에만 | `toggle` 콜백 내 1회. 렌더·마운트 시 쓰기 없음 | ✔ |
| 손상 방어(손상 JSON·배열·null·접근 예외) | `cardCollapse.js:20-30` try/catch + `isPlainObject` 게이트, 예외 미전파 | ✔ (테스트 20케이스로 커버) |
| 펼침을 키 삭제가 아닌 `false` 로 | `toggleCard:66` `{...flags,[id]:!flags[id]}` | ✔ 병합 저장에서 옛 `true` 부활 방지 |
| falsy cardId → 원본 참조 | `toggleCard:64` `return state`, Provider `:43` 이 참조 비교로 조기 반환 | ✔ |
| 토글 시 resize dispatch **1회** | `:54-55` `clearTimeout` + `setTimeout(…,100)` — 커밋 후 1회, 연속 토글은 디바운스로 합쳐짐. 언마운트 시 `:37-39` 타이머 정리 | ✔ (설계 "1회"보다 엄격, 수용) |

`echarts-for-react` 가 window resize 를 구독하므로 이 한 줄이 3화면 차트를 덮는다 — 전례(`CardFullscreen.jsx:24-27`, `ChartBox.jsx:18-21`)와 동일 패턴이고 **ResizeObserver 신설 없음**. ✔

---

## 5. 실패 1건 — 마이페이지 기여도 차트 3장이 접혀도 줄지 않음 (**검증자가 수정 완료**)

### 불일치

- **위치**: `static/ui/src/components/card/Card.jsx:103`(수정 전)
- **소비 지점**: `static/ui/src/pages/myPage/sections/MyContributionCharts.jsx:161-167`

```jsx
// MyContributionCharts.jsx:161-167 — Card 3장이 이 그리드의 **직계 아이템**이다
<Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
```

```jsx
// Card.jsx:103 (수정 전) — height 만 풀었다
...(collapsed ? { height: "auto", flex: "0 0 auto" } : null),
```

**왜 실패인가**: 그리드 아이템은 `align-self` 가 `normal`(=**stretch**)일 때 **block-size 가 `auto` 면 행 높이까지 늘어난다.**
즉 `height:'auto'` 로 바꿔도 stretch 가 그대로 먹어 카드가 행 높이를 유지한다. 함께 넣은 `flex:'0 0 auto'` 는 **flex 컨테이너 전용 주축 속성**이라 그리드에서 무효다.
결과: 3장 중 1~2장만 접으면 **본문만 사라지고 거대한 빈 상자가 남는다** — 이 기능이 없애려던 D-2 증상 그대로다(3장 모두 접으면 행 높이가 내용으로 줄어 정상 동작).

설계 §3-2는 마이페이지에 "추가 수정 필요 없음 / 거대한 빈 상자 없음"이라고 적었는데, 그 근거("카드가 그 안의 **블록 자식**")는 좌우 2분할 행에만 성립한다 —
`MyPage.jsx:159-176, 201-208` 은 `<div style={{flex:…}}>` 래퍼가 flex 아이템이고 `Card` 는 그 안의 블록 자식이라 문제가 없다.
**`MyContributionCharts` 만 `Card` 자신이 그리드 아이템**이라 예외였고, 설계서가 이 구분을 놓쳤다.
BentoGrid 는 같은 문제를 CSS `align-self: start` 로 이미 풀어 놨다(§3-1) — 즉 **같은 결함의 미적용 지점**이다.

### 수정 (적용 완료)

`static/ui/src/components/card/Card.jsx` 접힘 인라인 스타일에 `alignSelf: "start"` 1개 추가:

```jsx
...(collapsed ? { height: "auto", flex: "0 0 auto", alignSelf: "start" } : null),
```

- BentoGrid 가 CSS로 하는 것(`align-self: start`)과 동일한 처방을 셸 자체에 넣는다.
- **부작용 없음**: 블록 자식으로 놓인 사용처(마이페이지 좌우 2분할, Stack 직계)에서 `align-self` 는 무효과다. 접힘일 때만 적용되므로 펼침 상태 렌더는 한 픽셀도 바뀌지 않고, `persisted` 가 false 인 37개 기존 사용처는 접힘 상태 자체에 도달하지 않는다.
- 잔여 한계(설계 §3-1과 동일, 결함 아님): 3장 중 하나만 접으면 **행 높이는 짝이 유지**하므로 아래 섹션이 올라오지는 않는다. 빈 상자만 사라진다.

---

## 6. 미검증 8항목 — jsdom 레이아웃 미계산으로 자동화 불가

`static/ui` 테스트는 jest + jsdom 이고 `@testing-library/react` 가 없다. jsdom 은 CSS 레이아웃을 계산하지 않으므로 **높이·행 리플로우·픽셀은 원리적으로 검증 불가**다. 추측으로 통과 처리하지 않는다.

| # | 수동 확인 항목 | 비고 |
|---|---|---|
| ① | 팀 분석 span6 카드(`projectStack`·`rollup`) 접기 → 아래 카드 상승 | 설계가 "완전 성립"이라 주장하는 배치 |
| ② | 짝 카드 둘 다 접기 → 상승 / 하나만 접기 → 빈 상자 없이 헤더만 | `utilBand`+`compare`, `composition`+`utilScatter` |
| ③ | 새로고침 아이콘: 팀 분석 **없음** / 프로젝트 상세 대시보드 **있음** + 클릭 동작 + 접힘 높이(40px→auto) 시각 확인 | D-1 회귀 게이트 |
| ④ | 팀 분석 6장 확장 → 차트가 78vh 로 커짐 | D-3 실동작 |
| ⑤ | F5 후 접힘 유지 + 대시보드 탭 전환 후에도 다른 탭 기억 보존 | localStorage 병합 저장 |
| ⑥ | 다크 테마에서 chevron 아이콘 대비 | `--ds-text-subtle` 토큰 사용, 실렌더 미확인 |
| ⑦ | 마이페이지 전폭 섹션(`worklog`·`team`) 접기 → 아래 상승 + **기여도 차트 3장 중 1장만 접기(§5 수정 검증)** | §5 수정의 실효 확인 필수 |
| ⑧ | 접었다 펴면 차트가 올바른 크기로 재렌더 | resize dispatch 실효 |

---

## 7. 게이트 실행 결과 — **전부 통과** (검증자가 직접 실행)

| 게이트 | 결과 | 리포트 주장과 대조 |
|---|---|---|
| `cd static/ui && npm test` | **71 suites / 1218 tests 통과** (신규 `cardCollapse.test.js` 20케이스 포함) | 일치 ✔ |
| 루트 `npm test`(백엔드) | **70 suites / 1110 tests 통과** | 일치 ✔ |
| `CI=true npm run build` | **성공** (§5 수정 후 재실행분 포함) | 일치 ✔ |
| `bundle:check` | `main.js` gzip **898,273 B / 950,000 B — withinBudget: true** | 일치 ✔ |

테스트 파일(`components/card/__test__/cardCollapse.test.js`)은 설계 §9 표의 **전 케이스를 실제로 담고 있다** — `readCollapsed` 6 · `writeCollapsed` 2 · `toggleCard` 5 · `mergeCollapsed` 3 · `isCardCollapsed` 2. `toggleCard(state,'')` 는 `toBe(state)` 로 **참조 동일성**까지 검사한다. ✔

---

## 8. i18n — **통과**

| 축 | 확인 |
|---|---|
| 소스(kr) | `locales/kr/common.json:125-128` `card.collapse:"접기"` / `card.expand:"펼치기"` ✔ |
| 소스(en) | `locales/en/common.json:125-128` `Collapse` / `Expand` ✔ |
| merge 반영 | `locales/ko-KR.json:358-361`, `locales/en-US.json:358-361` 에 `common.card` 생성 ✔ |
| 직접 수정 금지 | `ko-KR.json`·`en-US.json` 은 merge 산출물로만 갱신(수기 편집 흔적 없음) ✔ |
| `locales/script/` 오투입 | 해당 디렉토리에는 `merge.js` 만 있고 JSON 스텁이 없다 — 오투입 불가 ✔ |
| 소비 | `CardCollapseButton.jsx:22` `t('common.card.expand'/'common.card.collapse')` — 앱 전체 유일 소비처, 키 정확 일치 ✔ |
| 키 충돌 | `ko-KR.json:2238` 의 `card` 는 `project.*` 하위(종료/D-day 배지)로 네임스페이스가 다르다. 기존 `portfolio.common.expand`(전체화면)와도 별개 키 ✔ |

---

## 9. 후속 조치

1. **frontend-engineer 재작업 불필요** — 유일한 실패 1건은 검증자가 1줄로 수정 완료(`Card.jsx`), 빌드·테스트 재검증 통과.
2. **수동 검증 8항목(§6)은 배포 전 필수**. 특히 ⑦은 §5 수정의 실효를 확인하는 항목이라 생략하면 이번 수정이 검증되지 않은 채 나간다.
3. **설계서 정정 권고**(다음 유사 기능 재발 방지):
   - §3-2 "마이페이지 추가 수정 필요 없음"은 **좌우 2분할에만** 성립한다. `Card` 가 grid/flex 아이템 **자신**인 지점(`MyContributionCharts`)에는 `align-self:start` 가 필요하다.
   - §2-4/§10 과 §11 P1 의 "Provider 밖 버튼 미렌더" 서술이 상충한다. §2-4/§10(=현행 보존)이 옳다.
