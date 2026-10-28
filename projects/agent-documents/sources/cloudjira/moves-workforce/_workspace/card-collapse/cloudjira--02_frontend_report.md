# 프론트 구현 리포트 — 분석 카드 접기/확장 + 리플로우

> 2026-08-12 · 설계서 `01_architect_design.md` 기준 · 프론트 전용(백엔드·resolver·쿼리키·데이터 훅 변경 0)

## 1. 죽은 버튼 3종 해소 지점

| 원인 | 해소 지점(파일:라인) | 내용 |
|---|---|---|
| **D-1 새로고침 no-op** | `static/ui/src/components/chart/layout/ChartCard.jsx:153-158` | `{onRefresh && (…)}` 조건부 렌더. 핸들러도 `onRefresh?.()` → `onRefresh()` 로 정리. **삭제하지 않았다** — `pages/projectDetail/dashboard/DashboardPage.jsx:282` 가 실제로 넘기고 있어 그 화면에서는 그대로 살아 있다. 팀 분석(`TeamChartFrame.jsx:101`)은 안 넘기므로 아이콘이 사라진다 |
| **D-2 접기 리플로우** | `static/ui/src/components/layout/BentoGrid.css:32-50`(신규 2규칙) + `BentoGrid.jsx:38-58` + `ChartCard.jsx:74-88` | `.bento-tile[data-collapsed="true"] { align-self: start; }` / `.bento-tile[data-collapsed="true"] > * { flex: 0 0 auto; }` — `stretch`·`flex-basis:0%` 를 정확히 되돌린다. `BentoTile` 이 `cardId` 를 받아 접힘일 때만 `data-collapsed` 를 찍고, `ChartCard` 는 접힘에서 `height:'auto'` + `flex:'0 0 auto'`(종전 `height:"40px"` 은 basis 0 에 먹혀 무시되던 값이라 폐기) |
| **D-3 확장 무동작** | `static/ui/src/pages/resource/teamAnalytics/TeamChartBox.jsx:19-31` | `useExpanded()` 배선 + `effectiveHeight = expanded ? '78vh' : height` + resize 이펙트 의존성 `[]` → `[expanded]` + `EmptyState height` 도 `effectiveHeight`. 포트폴리오 `ChartBox.jsx:11-21` 과 동형. 호출부 6곳 props 계약 무변경 |

## 2. 신규 파일

| 파일 | 내용 |
|---|---|
| `static/ui/src/components/card/collapse/cardCollapse.js` | 순수 모듈 5함수 — `readCollapsed`/`writeCollapsed`/`mergeCollapsed`/`toggleCard`/`isCardCollapsed`. DOM·React 없음, 예외 삼킴. `panelLayout.js` 의 read/merge/write 3분할 패턴만 베끼고 shape 은 공유하지 않는다(`{[cardId]:boolean}` 평면 맵) |
| `static/ui/src/components/card/collapse/CardCollapseContext.jsx` | `CardCollapseProvider`(화면 1개당 1개, 토글 시 **읽고-병합-쓰기** + 커밋 후 `resize` 1회 dispatch) · `CardIdProvider` · `useCardCollapse(cardId?)`(Provider·id 없으면 로컬 state degrade, `persisted:false`) |
| `static/ui/src/components/card/collapse/CardCollapseButton.jsx` | chevron-down(펼침)/chevron-right(접힘), `aria-expanded`, `title`/`aria-label` = `common.card.*`. `disabled`/`aria-disabled` 분기 없음(카드 접기엔 금지 조건 없음) |
| `static/ui/src/components/card/collapse/CardCollapseButton.css` | `.card-collapse-btn` — `.rp-collapse-btn` 과 같은 껍데기, 색은 전부 Atlaskit 토큰 CSS 변수(다크 테마 자동) |
| `static/ui/src/components/card/__test__/cardCollapse.test.js` | 설계 §9 표 전 케이스(아래 §5) |
| `static/ui/src/pages/resource/teamAnalytics/teamAnalyticsCards.js` | `TEAM_ANALYTICS_CARDS_KEY = 'resource.teamAnalytics.cards'` + id 6 |
| `static/ui/src/pages/portfolio/portfolioCards.js` | `PORTFOLIO_CARDS_KEY = 'portfolio.dashboard.cards'` + id 17 |
| `static/ui/src/pages/myPage/myPageCards.js` | `MY_PAGE_CARDS_KEY = 'myPage.cards'` + id 9 |

## 3. 수정 파일

| 파일:라인 | 변경 |
|---|---|
| `components/chart/layout/ChartCard.jsx:1-10, 43-52, 66-90, 148-160` | `cardId` prop · 로컬 `useState(collapsed)` → `useCardCollapse` · 버튼 [접기][확장][새로고침 조건부] · 접힘 시 `height:'auto'`/`flex:'0 0 auto'` · `ChevronUp/DownIcon` import 제거 |
| `components/card/Card.jsx:1-12, 60-70, 88-104, 118-137` | `cardId` prop · `useCardCollapse` · 헤더 `headerRight`→[접기]→[확장] · 접힘 시 description·`hr`·content·footer 미렌더 + `height:'auto'`+`flex:'0 0 auto'` 인라인(=`cardStyle` 의 `height:100%` 덮기) · **`persisted` 일 때만 버튼 렌더** |
| `pages/portfolio/widgets/WidgetCard.jsx:1-10, 22-40, 50-66, 91-129` | `cardId` prop · `useCardCollapse` · [접기]→`headerRight`→[확장] · 접힘 시 `desc`·본문 미렌더 + **`minHeight` 미적용**(ResourceTab 540px 잔상 방지) · `persisted` 일 때만 버튼 |
| `components/layout/BentoGrid.jsx:1-2, 34-58` | `BentoTile({cardId})` → `data-collapsed` + `CardIdProvider` 로 자식에게 id 전달 |
| `components/layout/BentoGrid.css:32-50` | 접힘 타일 2규칙(위 D-2) |
| `pages/resource/teamAnalytics/TeamAnalyticsTab.jsx:8-10, 190-196, 291-352` | `CardCollapseProvider(resource.teamAnalytics.cards)` 로 본문 감싸기 + `BentoTile` 6개에 `cardId` |
| `pages/resource/teamAnalytics/TeamChartBox.jsx` | D-3(위) |
| `pages/portfolio/PortfolioDashboardPage.jsx:18-21, 247, 296-311` | `CardCollapseProvider(portfolio.dashboard.cards)` + 개요 `WidgetCard cardId` |
| `pages/portfolio/tabs/{Time,Scope,Resource,Cost}Tab.jsx` | import 1줄 + `BentoTile cardId` (3·4·3·6개) |
| `pages/myPage/MyPage.jsx:22-24, 131-140, 201-204` | `CardCollapseProvider(myPage.cards)` 로 `Stack` 감싸기. **`splitRowStyle` 등 인라인 레이아웃 스타일 무변경** |
| `pages/myPage/sections/*.jsx` (7파일) | import 1줄 + `Card cardId` 한 줄씩(총 10개 사용처) |
| `locales/kr/common.json:125-128` · `locales/en/common.json:125-128` | `card.collapse`/`card.expand` 2키 |

## 4. 적용 32장 확인표

### 팀 분석 — `resource.teamAnalytics.cards` (6)

| cardId | 타일 | 접기 | 확장 |
|---|---|---|---|
| `projectStack` | span 6 | O | O (D-3 수정으로 실동작) |
| `utilBand` | span 2 | O | O |
| `compare` | span 4 | O | O |
| `composition` | span 3 | O | O |
| `utilScatter` | span 3 | O | O |
| `rollup` | span 6 | O | O |

`TeamChartFrame` 은 **무변경** — `BentoTile` 의 `CardIdProvider` 로 안쪽 `ChartCard` 가 자기 id 를 알아낸다(설계 §7 이 허용한 두 경로 중 컨텍스트 경로). 로딩 스켈레톤(`TeamAnalyticsTab.jsx:171`)은 `cardId` 미부여.

### 통합 대시보드 — `portfolio.dashboard.cards` (17)

| 구획 | cardId (파일) |
|---|---|
| 개요 | `overview` (`PortfolioDashboardPage.jsx:247`) |
| Time | `gantt`·`effortTrend`·`riskTop` (`TimeTab.jsx:23,36,49`) |
| Scope | `issueStatus`·`scopeProgress`·`plannedActual`·`problemBubble` (`ScopeTab.jsx:24,37,50,63`) |
| Resource | `roleLevel`·`utilization`·`workDist` (`ResourceTab.jsx:32,51,65`) |
| Cost | `costKpi`·`monthlyBurn`·`costPlanActual`·`costScatter`·`costByRoleLevel`·`costOverrunRank` (`CostTab.jsx:30,44,58,72,86,105`) |

로딩 스켈레톤 3장(`PortfolioDashboardPage.jsx:165,175,178`)은 `cardId` 미부여 → 접기 버튼 없음. 탭 전환으로 화면에서 사라진 카드의 접힘 기억은 `mergeCollapsed` 가 보존.

### 마이페이지 — `myPage.cards` (9 id / 10 사용처)

| cardId | 파일:라인 | 확장 |
|---|---|---|
| `projects` | `MyProjectsPanel.jsx:107` | 없음(신설 안 함) |
| `issues` | `MyIssuesPanel.jsx:177` | 기존 유지 |
| `chartStatus` / `chartDaily` / `chartByIssue` | `MyContributionCharts.jsx:168,176,186` | 기존 유지 |
| `worklog` | `MyWorklogPanel.jsx:236` | 기존 유지 |
| `team` | `MyTeamSection.jsx:77`(비팀장) · `:90`(팀장) — **같은 id 공유** | 없음 |
| `permission` | `MyPermissionSection.jsx:71` | 기존 유지 |
| `skill` | `MySkillSection.jsx:113` | 없음 |

**확장 버튼 신설 0** (요구: 억지 확장 금지).

## 5. 테스트 · 빌드 결과

| 게이트 | 결과 |
|---|---|
| `cd static/ui && npm test` | **71 suites / 1218 tests 전부 통과** (신규 `cardCollapse.test.js` 20 케이스 포함) |
| 루트 `npm test`(백엔드) | **70 suites / 1110 tests 통과** (무회귀 확인용) |
| `CI=true npm run build` | **성공**. 첫 시도는 `MyTeamSection.jsx` 의 JSX 주석 위치 오류로 실패 → JS 주석으로 수정 후 통과 |
| 번들 예산(`bundle:check`) | `main.js` gzip **898,273 B / 예산 950,000 B — withinBudget: true**. 신규 의존성 0, 아이콘 `chevron-right` 1개만 추가(대신 `chevron-up` 사용처 제거) |
| `npm run merge` | **실행 완료**. `locales/ko-KR.json:358` `common.card = {collapse:"접기", expand:"펼치기"}`, `en-US.json` = `{Collapse, Expand}` 확인. ko-KR/en-US 직접 수정 없음 |

테스트 케이스(설계 §9 표 전항목): `readCollapsed` 없는키/손상JSON/배열/null/접근예외/정상맵 · `writeCollapsed` throw 삼킴/왕복 · `toggleCard` 미지정→true/true→false(키 보존)/falsy id 원본참조(`toBe`)/비객체 · `mergeCollapsed` prev보존/next우선/비객체 · `isCardCollapsed` 4분기.

## 6. 이탈 · 판단 사항

1. **`ChartCard` 의 접기 버튼은 Provider 밖에서도 계속 렌더한다.** 설계 §11 P1 마지막 항목("세 셸 모두 cardId·Provider 없으면 버튼 미렌더")과 §10("프로젝트 상세 대시보드는 접힘이 **로컬·비영속으로 현행 유지**")·§2-4(ChartCard 헤더에 [접기] 무조건 표기)가 어긋난다. **§10·§2-4 를 따랐다** — `ChartCard` 는 지금도 접기 버튼을 갖고 있어서 감추는 쪽이 오히려 회귀다. 미렌더 규칙은 버튼을 **새로 붙이는** `Card`·`WidgetCard` 에만 적용했다(기존 22개 `Card` 사용처 픽셀 무변경 목표는 그대로 달성). 같은 이유로 팀 분석 로딩 스켈레톤의 `ChartCard` 에도 버튼이 남는다(설계 §5-1 은 "버튼 없음(현행 유지)"이라 적었으나 현행은 버튼 있음 — 현행 유지를 택했다).
2. **`TeamChartFrame` 은 수정하지 않았다.** 설계 §7 이 "cardId prop 통과 **또는** BentoTile 컨텍스트 의존"을 허용했고, 후자가 파일 변경 0이라 채택.
3. **`Card` 접힘에 `flex:'0 0 auto'` 를 함께 넣었다**(설계는 `height:'auto'` 만 명시). `Card` 도 `BentoTile`/flex 컨테이너 자식으로 놓일 수 있어 height 만으로는 basis 0 에 다시 먹힌다 — D-2 와 같은 함정을 미리 막는다.
4. **`npm run merge` 산출물에 다른 트랙의 키가 함께 들어갔다.** `locales/kr|en/projectDetail.json` 이 이 작업 **이전부터** 미커밋 수정 상태였고, merge 는 폴더 전체를 재생성한다. 소스 파일은 건드리지 않았고 prebuild 가 어차피 같은 일을 하므로 정상 경로다.
5. **워킹 트리의 다른 트랙(gantt, 패널 v2/v3, WorkQueueItem, cost/progress 백엔드) 파일은 한 줄도 건드리지 않았다.**
6. **수동 검증 필요**(jsdom 은 레이아웃을 계산하지 않아 자동화 불가 — 설계 §11 P3 그대로): ① span6 접기 → 아래 상승 ② 짝 카드 둘 다/하나만 접기 ③ 새로고침 아이콘이 팀 분석에서 사라지고 프로젝트 상세 대시보드에는 남음 ④ 팀 분석 확장 시 78vh ⑤ F5 후 접힘 유지 ⑥ 다크 테마 아이콘 대비 ⑦ 마이페이지 전폭 섹션 접기 ⑧ 접었다 펴면 차트 정상 크기.
7. **알려진 한계(설계 §3-1 그대로)**: 한 행에 카드 둘 중 하나만 접으면 행 높이는 짝이 유지한다(CSS Grid 는 행 안에서 아이템별 높이를 못 준다). 빈 상자는 사라지지만 그 아래는 올라오지 않는다.
