# team-analytics — 프론트엔드 구현 리포트 (P1-c + P1-d)

작성: 2026-08-03 · 슬러그 `team-analytics` · 단계 **P1-c(`/resource` 팀 분석 탭) + P1-d(통합 대시보드 팀 축 제거)**
설계서: `01_architect_design.md` (§A-0 색인 · §4-A · §4-D · §5-1 · §7-1 · §7-2 · §8-2 · §8-4 · §10 · §13-4 · §13-5 · §16-5)
선행: `02_backend_report.md`(P1-a shape) · `02_frontend_report.md`(P1-b 어댑터·스코프 계약)

> 🔴 **`npm run merge` 미실행 — 리더가 일괄 수행.** `npm run build` 도 실행하지 않았다(`prebuild` 가 merge 를 자동 호출한다).
> 검증은 `cd static/ui && npm test` 로만 했다. 근거·상세는 §7.

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| 신규 파일 | **13개** (소스 10 + 테스트 3) |
| 이동 파일 | **2개** (`teamComparison.js`/`.test.js` → `utils/team/teamMetrics.js`/`teamMetrics.test.js`) |
| 삭제 파일 | **1개** (`pages/portfolio/widgets/PortfolioTeamComparison.jsx`) |
| 수정 파일 | 9개 |
| 차트 | **4종 구현 + 1종(#5) 표+막대 = 5종.** 🔴 **#6 레이더는 P1 제외**(§3-6) |
| 신규 옵션 빌더 | **0** — 기존 2종에 additive 옵션(`orientation`/`valueFormatter`) 추가(§3-7) |
| 테스트 | **51 suites / 920 tests 전부 통과** · 회귀 **0** (기준선 실측 §6) |
| merge | 🔴 **미실행** (§7) |

---

## 1. 🔴 작업 전 기준선 — **직접 실측했다**

```
$ cd static/ui && npm test          # 코드 한 줄도 건드리기 전

Test Suites: 45 passed, 45 total
Tests:       733 passed, 733 total
Snapshots:   1 passed, 1 total
Time:        21.122 s
```

P1-b 리포트의 수치(45 / 733)와 **일치**했다. 전달받은 값을 그대로 쓰지 않고 재실측한 결과다.

---

## 2. 신설 · 이동 · 삭제 파일

### 2-1. 신설 (13)

| # | 파일 | 내용 |
|---|---|---|
| 1 | `pages/resource/teamAnalytics/TeamAnalyticsTab.jsx` | 탭 진입 · 게이트 5단 · 차트 그리드 |
| 2 | `pages/resource/teamAnalytics/TeamScopeSelector.jsx` | 가시 팀 선택(서버 `teams[]` 그대로, 들여쓰기만) |
| 3 | `pages/resource/teamAnalytics/TeamKpiRow.jsx` | **인원 3종** + 가동률 + (REPORT) MD·진척률·인건비 |
| 4 | `pages/resource/teamAnalytics/TeamChartFrame.jsx` | 공용 껍데기 — `ChartCard` + **인원 기준 배지** + `ChartTableToggle` + notes |
| 5 | `pages/resource/teamAnalytics/TeamChartBox.jsx` | ECharts 래퍼(다크모드 · 리사이즈 · 빈 상태). **옵션 빌더 아님** |
| 6 | `pages/resource/teamAnalytics/teamAnalyticsAdapter.js` | 순수 조립부(시리즈 생성 · `null` 제외 판단) |
| 7 | `pages/resource/teamAnalytics/hooks/useTeamAnalyticsData.js` | 쿼리 3개 조립 + 스코프 전달 |
| 8 | `pages/resource/teamAnalytics/charts/TeamUtilBandStack.jsx` | #1 |
| 9 | `pages/resource/teamAnalytics/charts/TeamCompareBar.jsx` | #2 (구 `PortfolioTeamComparison` 이식) |
| 10 | `pages/resource/teamAnalytics/charts/TeamCompositionStack.jsx` | #3 |
| 11 | `pages/resource/teamAnalytics/charts/TeamUtilScatter.jsx` | #4 |
| 12 | `pages/resource/teamAnalytics/charts/TeamRollupTable.jsx` | #5 |
| 13 | `locales/kr/teamAnalytics.json` · `locales/en/teamAnalytics.json` | i18n 신규 네임스페이스(87키 × 2, 대칭) |

**테스트 3**
| 파일 | tests | 내용 |
|---|---|---|
| `pages/resource/teamAnalytics/__test__/teamAnalyticsAdapter.test.js` | **26** | `null`≠`0` · 스코프 집계 전 · 팀 미소속 마지막 · REPORT 부재 열화 |
| `pages/resource/teamAnalytics/__test__/teamAnalyticsI18n.test.js` | **77** | 사용 키 kr/en 존재 · 대칭 · 리터럴 점 금지 · P1-d 키 제거 |
| `components/chart/echart/options/__test__/chartOptionOrientation.test.js` | **14** | 빌더 확장 **무회귀** 계약 |

### 2-2. 이동 (2) — 🔴 P1-c 선행 작업

| 이동 전 | 이동 후 |
|---|---|
| `pages/portfolio/utils/teamComparison.js` | **`utils/team/teamMetrics.js`** |
| `pages/portfolio/utils/__test__/teamComparison.test.js` | **`utils/team/__test__/teamMetrics.test.js`** |

`git mv` 로 이동해 이력이 보존된다. import 경로를 고친 곳은 4개 파일뿐이다:
`costGate.test.js` · `teamAnalyticsFields.test.js` · `teamScopeLeak.test.js` · (임시로) `PortfolioTeamComparison.jsx`(직후 삭제).
**`teamMetrics.test.js`(구 `teamComparison.test.js`) 는 import 한 줄 외에 케이스 본문 무변경**이며 30 tests 그대로 통과한다.

### 2-3. 삭제 (1)

`pages/portfolio/widgets/PortfolioTeamComparison.jsx` — `git rm`. 전역 참조 0건(테스트로 고정).

### 2-4. 수정 (9)

| 파일 | 변경 |
|---|---|
| `utils/team/teamMetrics.js` | 파일 헤더 + **옵션 2개 추가**(`includeUtilOnlyTeams`, `teamComparison` 의 `scope`) — §4 |
| `components/chart/echart/options/stackChartOption.js` | `orientation` **additive** |
| `components/chart/echart/options/barChartOption.js` | `orientation` · `valueFormatter` **additive** |
| `pages/resource/ResourcePage.jsx` | 탭 4개로 확장 + `showTeamAnalytics` 게이트 |
| `pages/portfolio/sections/ComparisonTabs.jsx` | 팀 위젯 블록·`<>` 래퍼·import(`PortfolioTeamComparison`/`WidgetCard`)·`teamMeta`/`memberTeamMap` prop **제거** |
| `pages/portfolio/PortfolioDashboardPage.jsx` | `teamMeta`/`memberTeamMap` **전달 제거** |
| `utils/team/__test__/teamScopeLeak.test.js` | 정적 검사 경로 정정 + P1-d 가드 + `includeUtilOnlyTeams` 계약 (22 → **28** tests) |
| `locales/{kr,en}/portfolio.json` | `teamCompare.*` **제거** |
| `locales/{kr,en}/resource.json` | `tab.teamAnalytics` 추가 |

🔴 **다른 에이전트 영역 무변경**: `pages/projectDetail/**` · `constants/tabs.js` · `components/tabs/**` · `locales/{kr,en}/projectDetail.json` 은 **읽기만** 했다. (작업 중 `git status` 에 `projectDetail.json` +30줄과 `analysisReport/period*.js` 신규가 보였으나 **P1-e 에이전트의 것**이며 내가 만든 변경이 아니다.)

---

## 3. 🔴 차트별 명세 (요구된 표)

| # | 차트 | **답하는 질문** | 타입 | **재사용 빌더** | 데이터 원천 | **인원 기준** | **`null` 처리** |
|---|---|---|---|---|---|---|---|
| 1 | 팀별 가동률 분포 | "어느 팀에 과부하·유휴가 몰려 있나" | 누적 **가로** 막대 (`normalize` 토글) | `stackChartOption` (+`orientation`) | `getResourceOverview.people[].utilBand` → `rows[].band*` | **가동률 산출 인원**(`utilMemberCount`) | `utilBand:'unknown'` = **독립 밴드**(0% 아님). `utilMemberCount===0` 팀은 **막대 자체를 안 그림** + 제외 팀 수 안내 |
| 2 | 팀 간 비교 | "이 축에서 어느 팀이 앞/뒤인가" | **가로** 막대 + 축 셀렉터 | `barChartOption` (+`orientation`+`valueFormatter`) | `teamComparison().rows[axis]` (= `teamMetricsByTeam` 산식) | 가동률 축 → 가동률 산출 인원 / 그 외 → **참여 인원** (배지가 축 따라 바뀜) | `dropNullSeries` 로 **카테고리째 제거** + 제외 팀 수 안내. 가동률 축 전체가 `null` 이면 `notAggregated` |
| 3 | 팀별 인력 구성 | "이 팀은 어떤 직무·등급으로 짜여 있나" | 누적 **가로** 막대 (직무/등급 토글) | `stackChartOption` (+`orientation`) | `getResourceOverview.people[].roleName/levelName` | **조직 인원** | 직무·등급 미기재를 **버리지 않고** `미지정` 범주(마지막)로. 버리면 팀 합≠조직 인원 |
| 4 | 가동률 vs 규모 | "인원은 많은데 가동률이 낮은 팀은 어디인가" | 산점도 | `scatterChartOption` (무변경) | x=`utilMemberCount` · y=`utilization` · size=`effortMd` | x축 = **가동률 산출 인원** | `utilization===null` → **점 없음**(y=0 금지). `effortMd===null` → **크기 0 이 아니라 기본 크기**(점이 사라지면 "그 팀은 없다"가 된다) |
| 5 | 팀 계층 롤업 | "본부 단위로 접으면 어떻게 보이나" | 표(direct/total) + **가로** 막대 | `CommonTable`(`ChartTableToggle` 경유) + `barChartOption`(+2옵션) | `rollupTeamTree(flatGroups, teams, {scope})` **+ `teams[]` 별도 조인** | **3종 병기** (조직=서버값 / 참여·가동률=롤업값) | 표는 `-`(Dash), 막대는 `dropNullSeries` 로 제외 |
| ~~6~~ | ~~팀 프로필(레이더)~~ | — | — | — | — | — | 🔴 **P1 제외 — §3-6** |

### 3-6. 🔴 #6 레이더를 만들지 않은 이유 (계약 미완)

외부 검토 판정을 그대로 따랐다. 설계서 §4-D 는 4축("가동률·진척률·**완수 규모**·리스크(역방향)")만 적었고 **계약이 없다**:

| 미정 | 왜 치명적인가 |
|---|---|
| "완수 규모"의 필드·산식 | 어떤 필드인지 특정되지 않음 |
| 4축 정규화 기준 | 비율(0~1)·MD·점수의 단위가 달라 **기준이 없으면 도형이 임의**가 된다 |
| 리스크 역변환 | 뒤집으면 `metric.riskExposure`("리스크 노출") 라벨과 **방향이 반대**가 되고, 뒤집힌 축을 부를 라벨 키가 §10 에 없다 |
| 축별 `null` 처리 | 0 으로 찍으면 "그 축이 최악"으로 읽힌다 |

→ 초안 구현을 **작성했다가 폐기**했다. 어댑터에 그 결정과 이유를 주석으로 남겼다.
i18n `chart.profile.title`/`.desc` 2키는 설계서 §10-1 정의라 **남겼고 현재 소비처가 없다**(P2 재개 시 재사용).

### 3-7. 🔴 옵션 빌더 확장 — additive, 기존 호출부 무변경

**신규 빌더 파일 0.** 기존 2종에 옵션을 붙였고 **기본값이 현행 동작**이다.

| 빌더 | 추가 옵션 | 왜 필요했나 |
|---|---|---|
| `stackChartOption` | `orientation: 'vertical'\|'horizontal'` | 빌더가 **세로 전용**(`xAxis.type:'category'`)이라 설계의 "가로 막대"를 낼 수 없었다. 팀명은 길어 세로축이 유리하다 |
| `barChartOption` | `orientation`, `valueFormatter` | tooltip 이 값을 **건수**(`dashboard.barChart.count`)로 고정 표기한다. MD·원·% 축에 그대로 쓰면 **"12.5 건"** 이라는 거짓 단위가 붙는다 |

무회귀 근거(기계적):
- `chartOptionOrientation.test.js` **14 tests** — 옵션 미전달 시 축·시리즈·tooltip 문구·라벨 부재가 **확장 전과 동일**함을 단언. 특히 "`barChartOption` 은 옵션 없이는 `series[].label` 을 붙이지 않는다"를 못 박았다.
- 기존 호출부 3곳(`PortfolioRoleLevelDist` · `PortfolioIssueStatusDist` · `ChartTemplate.CHART_OPTION_MAP.bar`)은 **한 줄도 수정하지 않았다.**
- 가로 전환 시 **카테고리와 데이터를 함께 뒤집는다**(하나만 뒤집으면 값이 어긋난다) — 짝 유지를 테스트가 단언.
- `CHART_OPTION_MAP` 함정: 5종 전부 빌더를 **직접 import** 하므로 맵을 타지 않는다. 신규 타입 등록 없음.

---

## 4. 🔴 `teamMetrics.js` 이동 후 — **시그니처는 "완전 불변"이 아니다**

설계서 §8-2 는 "시그니처는 바꾸지 않는다"고 적었으나 **그대로는 동작하지 않았다.** 정확히 적는다.

### 4-1. 위치·인자 순서는 불변

```js
teamMetricsByTeam(selected, memberTeamMap, teamMeta, utilizationPeople, options)
teamComparison   (selected, memberTeamMap, teamMeta, utilizationPeople, options)
```
5개 위치 인자, 반환 shape, `teamComparison()` 의 반환 키 집합 — **전부 불변**.
`teamMetrics.test.js`(구 `teamComparison.test.js`) 30 tests 가 **본문 무변경으로 통과**한 것이 기계적 증거다.

### 4-2. 🔴 `options` 에 필드 **2개를 추가**했다 (둘 다 기본값 = 현행 동작)

| 옵션 | 기본 | 왜 필요했나 |
|---|---|---|
| `teamMetricsByTeam(..., { includeUtilOnlyTeams })` | `false` | **`false` 로는 `RESOURCE_MANAGEMENT` 전용 사용자에게 탭이 통째로 빈다.** 현행 코드는 util 축 행을 `scopedTeamKeys.has(teamKey)` 로 좁히는데, `REPORT` 가 없으면 `selected=[]` → `scopedTeamKeys` 가 비어 **가동률·밴드 행이 0개**가 된다. 설계서 §4-A 는 A7/A8 을 `RESOURCE_MANAGEMENT` 만으로 가능하다고 규정한다. 부수 효과로 "프로젝트에 투입되지 않은 가시 팀"도 부하 차트에 나온다 |
| `teamComparison(..., { scope })` | `{ allowedTeamKeys: null, includeUnassigned: true }` | 현행 `teamComparison()` 은 무제한 스코프를 **내부에 하드코딩**해 스코프를 걸 방법이 없었다. TOP N + `기타` 묶음 + 축 게이팅을 복제하지 않으려면 옵션으로 열어야 한다(복제하면 D1 위반 — 같은 팀이 화면마다 다른 순위) |

**`includeUtilOnlyTeams:true` 로 생기는 행의 값 규약**: 공수·인건비·진척률·리스크 = **`null`(모름)**, 참여 인원 = **알려진 `0`**.
🔴 **`0` 으로 채우지 않았다** — 그 팀의 공수가 0 이라고 주장할 근거가 없다. 테스트로 고정(`teamScopeLeak.test.js`).

### 4-3. 스코프 계약은 그대로 지켜진다

`includeUtilOnlyTeams:true` 여도 `isTeamAllowed()` 는 **그대로 적용**된다 — 비가시 팀은 어느 경로로도 새지 않는다.
`teamScopeLeak.test.js` 에 "util 전용 행도 비가시 팀은 안 나온다" 케이스를 추가했다.

---

## 5. 🔴 권한 — 탭 전체를 `REPORT` 로 막지 않았다

### 5-1. 게이트 구조 (설계서 §5-1 · 이중 게이트 정리)

| 층 | 조건 | 실패 시 |
|---|---|---|
| 페이지 진입 | `canRead('RESOURCE_MANAGEMENT')` — **`ResourcePage.jsx` 의 기존 게이트 재사용. 새 게이트 0** | `NoPermissionPage` |
| 탭 노출 | `getTeamAnalyticsScope() !== 'NONE'` | 탭·패널 **둘 다** 미출력 |
| 탭 내부 | `scopeMode === 'NONE'` → `empty.noScope`(에러 아님) | 안내 |

🔴 **`teamAnalyticsScope` 단독 게이팅이 아니다.** 탭은 `ResourcePage` 안에 있어 위 게이트를 통과해야 도달하므로 실효 조건은
**`RESOURCE_MANAGEMENT read && scope !== 'NONE'`** 이다. `PermissionMap.getTeamAnalyticsScope` 의 grant 에 `RESOURCE_MANAGEMENT read` 가
포함돼 있어(`src/permission/PermissionMap.js:334`) 백엔드 리포트 §3-4 의 grant↔판정 비대칭이 **사용자에게 보이지 않는다.**
(백엔드 메모의 `canRead('REPORT') &&` 는 폐기된 `/team-analytics` 사이드바 배치 기준이다 — D7 이후 페이지 게이트가 `RESOURCE_MANAGEMENT` 로 바뀌었다.)

### 5-2. 🔴 차트별 요구 권한 — **REPORT 없어도 탭은 쓸 수 있다**

| 요소 | 필요 권한 | `REPORT` 없을 때 동작 |
|---|---|---|
| KPI 조직 인원 · 가동률 산출 인원 · 가동률 | `RESOURCE_MANAGEMENT` | **정상** |
| KPI 참여 인원 · MD · 진척률 · 인건비 | `REPORT` | **Dash(`-`)** — 0 으로 그리지 않음 |
| #1 가동률 분포 | `RESOURCE_MANAGEMENT` | **정상** |
| #3 인력 구성 | `RESOURCE_MANAGEMENT` | **정상** |
| #2 팀 간 비교 | 축별 상이 | 축 셀렉터가 **가동률 축만** 남고 `needReport` 안내 |
| #4 가동률 vs 규모 | 점=`RESOURCE_MANAGEMENT` / 버블 크기=`REPORT` | **점은 그대로**, 크기만 고정값 열화 + `chart.scatter.noEffort` 안내 |
| #5 계층 롤업 | 인원·가동률=`RESOURCE_MANAGEMENT` / 공수·인건비·진척률=`REPORT` | 해당 **컬럼만 제거**, 막대 축이 MD→가동률로 전환 |

인건비는 별도 축이다 — `costGating.isCostMasked(data) !== false`(**fail-close**)로 판정하며,
`REPORT` 미보유(응답 부재)면 `isCostMasked(undefined) === true` 라 인건비 축이 **자동으로 닫힌다**.

---

## 6. 소비하는 응답 shape (백엔드 계약 대조)

| resolver | 쿼리키 | 접근 경로 | 백엔드 리포트 근거 |
|---|---|---|---|
| `getTeamAnalyticsScope` | `teamAnalyticsKeys.scope()` (P1-b 제작) | **`res.content.*`** — `scopeMode`·`visibleTeamKeys`·`includeUnassigned`·`unassignedCount`·`teams[]`·`limits`·`truncated`·`hasCycle` | §2-1 (`{content:{…}}` 반환) |
| `getResourceOverview` | **`resourceKeys.overview()`** — 형제 탭과 동일 | `res.content.people/teamMeta/…` (`useResourceOverview` 훅 그대로 재사용) | 기존 계약 |
| `getPortfolioDashboard` | **`portfolioKeys.dashboard()`** — `/dashboard` 와 동일 | **루트 스프레드** `res.projects[]` · `res.costMasked` | §2-3 |
| `userPermissionCheck` | (스토어) | **`res.team.teamAnalyticsScope`** — `usePermissionStore.getTeamAnalyticsScope()` 경유 | §2-2 (**`res.content.team` 아님**) |

- 세 queryFn 모두 `!res?.success` → **throw**.
- 🔴 `getPortfolioDashboard` 의 성공 시 **캐시 값이 `/dashboard` 와 완전히 동일**하다(둘 다 `invoke(...)` 결과 전체를 저장). 실패 처리만 다르다(이쪽은 throw → `isError`).
- **신규 쿼리키 0.** `projectKeys` 무변경.

### 6-1. ⚠ "탭 전환 네트워크 0"은 과장이다 — 정확히

| 쿼리 | 인력현황/조직현황에서 탭 전환 시 |
|---|---|
| `getResourceOverview` | **0건** (같은 키 · 같은 훅) |
| `getTeamAnalyticsScope` | **1건 추가** (이 탭 전용, `staleTime` 5분) |
| `getPortfolioDashboard` | `REPORT` 보유자만 **1건 추가** (`/dashboard` 를 이미 방문했고 5분 내면 0건) |

→ 정확한 표현은 **"주 원천(인원·가동률)은 재조회 0, 스코프 1건 + (REPORT 시) 포트폴리오 1건 추가"** 다.

---

## 7. 🔴 i18n — merge **미실행**

- 추가: `locales/kr/teamAnalytics.json` · `locales/en/teamAnalytics.json` (**87키 × 2, 키 집합 완전 대칭**)
- 수정: `locales/{kr,en}/resource.json` — `tab.teamAnalytics` **1키 추가**
- 🔴 제거: `locales/{kr,en}/portfolio.json` — **`teamCompare.*` 전체**(`title`·`desc`·`other`·`globalUtilNote`·`notAggregated`·`dedupNote`·`axis.*`4·`info.calc`·`info.interp`)
- ✅ **남긴 것**: `portfolio.common.viewChart` / `viewTable` — `ChartTableToggle` 공용 키이며 팀 분석 탭도 **같은 컴포넌트를 쓴다**. 이동 금지(설계서 §10-2 각주). 테스트로 고정.
- ✅ **삭제한 것**: `globalUtilNote` — 새 화면에 프로젝트 필터가 없어 무의미(§16-5). 어느 네임스페이스에도 남지 않았음을 테스트로 단언.
- 🔴 **`npm run merge` 실행하지 않았다.** `ko-KR.json`/`en-US.json` 은 **손대지 않았고 diff 0** 이다.
  이유: 생성물은 모든 기능의 키를 한 파일에 모으므로 동시 작업 중 각자 merge 하면 서로 덮어쓴다. **리더가 일괄 수행할 것.**
- 🔴 **`npm run build` 도 실행하지 않았다** — `prebuild` 가 merge 를 자동 호출하기 때문이다. 검증은 `npm test` 로만 했다.

### 7-1. ⚠ 설계서 §10-1 표기와 **다르게 넣은 키 4개** (구조상 불가피)

| 설계서 | 실제 |
|---|---|
| `metric.orgMembers.tip` | **`metric.tip.orgMembers`** |
| `metric.activeMembers.tip` | **`metric.tip.activeMembers`** |
| `metric.utilMembers.tip` | **`metric.tip.utilMembers`** |
| `metric.progressRate.tip` | **`metric.tip.progressRate`** |

중첩 JSON 에서 `metric.orgMembers` 는 **문자열**이라 그 아래 `tip` 을 둘 수 없다(같은 키가 문자열이면서 객체일 수 없다).
리터럴 점을 포함한 키를 쓰면 조회 구현에 따라 **원문 키가 화면에 그대로 찍힌다** — 이 리포의 다른 26개 로케일 파일에
리터럴 점 키가 **한 건도 없다**는 관례를 확인하고 따랐다. `teamAnalyticsI18n.test.js` 가 리터럴 점 키 0건을 감시한다.

### 7-2. 설계서에 없어 **새로 만든 키** (전부 `teamAnalytics.*`)

`scope.allVisible` · `empty.noData` · `compare.other`(구 `portfolio.teamCompare.other` 이동) · `axis.*`4(구 `teamCompare.axis.*` 이동, `completionRate`=**"진척률"**) · `composition.none` · `chart.excludedTeams` · `chart.scatter.noEffort` · `note.unassignedCount` · `partialSeriesTeams`
— 각각 화면에 실제 소비처가 있으며 kr/en 대칭으로 넣었다.

---

## 8. P1-d — 대시보드에서 **제거한 것 / 남긴 것**

### 제거

| 대상 | 처리 |
|---|---|
| `pages/portfolio/widgets/PortfolioTeamComparison.jsx` | **파일 삭제** (`git rm`) |
| `ComparisonTabs.jsx` | `PortfolioTeamComparison`·`WidgetCard` import · `<WidgetCard>…</WidgetCard>` 블록 · `<>` 래퍼 · `teamMeta`/`memberTeamMap` prop |
| `PortfolioDashboardPage.jsx` | `teamMeta={…}` · `memberTeamMap={…}` **전달** |
| `locales/{kr,en}/portfolio.json` | `teamCompare.*` |

### 🔴 남긴 것 (의도적)

| 대상 | 왜 남기나 |
|---|---|
| **백엔드 `getPortfolioDashboard.teamMeta` · `memberTeamMap`** | **응답 필드는 유지가 설계다**(§4-B). 제거는 계약 축소이고 `emptyShape` 루트 키 1:1 규약을 흔든다. §12-12 **고아 필드**로 등재, P3 정리 후보. **백엔드를 건드리지 않았다** |
| `ComparisonTabs.TABS` 배열 4개 | 팀 서브탭을 애초에 만들지 않으므로 **인덱스·기본 선택 영향 0**. 테스트로 4키 존재 단언 |
| `ResourceTab` 본체 | 무변경 — 팀 위젯만 걷어냈다 |
| `portfolio.common.viewChart/viewTable` | 공용 토글 키(§7) |
| `pages/portfolio/widgets/WidgetCard.jsx` | 다른 위젯이 쓴다. import 만 제거 |

### 무회귀 근거 (테스트로 고정)

- `PortfolioTeamComparison.jsx` **파일 부재** + 전역 **코드 참조 0건**(import / JSX 사용 기준. 주석의 이력 서술은 허용 — 없애면 왜 사라졌는지 추적이 끊긴다)
- `PortfolioDashboardPage`·`ComparisonTabs` 에 `teamMeta`/`memberTeamMap` **prop 문법 0건**
- `TABS` 4키 유지
- 포트폴리오 스위트 전수 통과(`costGate` 33 · `portfolioAggregate` 24, 스냅샷 포함)

---

## 9. 정적 검사 경로 정정 (설계서 오류)

`teamScopeLeak.test.js` 의 `TARGET_GLOBS` 가 **`pages/teamAnalytics/**`** 를 가리키고 있었다. 그 경로는 **폐기된 배치**(신규 라우트 → `/resource` 탭 흡수, D7)라 **디렉터리가 존재하지 않았고, 검사가 0건으로 조용히 통과**하고 있었다.

| 이전 | 이후 |
|---|---|
| `pages/teamAnalytics` (없음) | **`pages/resource/teamAnalytics`** (실제 경로) |
| `PortfolioTeam*.jsx (B1 제외)` | `PortfolioTeam*.jsx` (B1 삭제로 대상 0개) |

추가로 **"경로 오타로 검사가 조용히 0건이 되지 않게"** 하는 가드를 넣었다 — `targets.length > 0` + 핵심 파일명 존재 단언.
(경로가 틀린 정적 검사는 통과해도 아무것도 지키지 못한다. P1-b 시점에는 "아직 없다"가 정상이었으나 지금은 아니다.)

---

## 10. 계산 규약 준수 확인

| 규약 | 어디서 지키나 |
|---|---|
| **`null`(집계 전)을 `0` 으로 그리지 않는다** | `dropNullSeries`(#2·#5) · `utilBandSeries` 의 `utilMemberCount===0` 제외(#1) · `utilScatterPoints` 의 `utilization===null` 제외(#4) · KPI/표의 `Dash` — **전부 테스트로 고정** |
| **비율은 Σ/Σ 재계산값** | `teamMetricsByTeam`/`rollupTeamTree` 가 낸 값을 **그대로** 넘긴다. 유일한 프론트 재계산은 KPI 전체 합계이며 그것도 `Σinvested/Σavail`·`Σweighted/Σdenom` 이다(산술평균 아님) |
| **팀 미소속을 숨기지 않는다** | `withUnassignedLast()` — #1·#3 에서 **마지막 항목**. `teamComparison()` 도 `기타` 뒤에 붙인다. 테스트 2건 |
| **인원 3종 표기** | `TeamChartFrame.BasisBadge`(차트마다 배지+Tooltip) + `TeamKpiRow`(3 KPI 나란히) + `note.threeCounts` 고정 배치 |
| **집계 필드 분류 정본 = §8-4** | `ADDITIVE_SUM_FIELDS`/`WEIGHTED_AVG_FIELDS` 를 `teamAnalyticsFields.js` 에서 **그대로 import**. 자체 목록 0. `memberCount` 는 `sumFields` 에 넣지 않았다(`rollupTeamTree` 전용 경로 — 이중 처리 금지) |
| **`scope` 필수 전달** | `teamMetricsByTeam(..., {scope})` · `rollupTeamTree(..., {allowedTeamKeys, includeUnassigned})` — 훅 한 곳에서 **같은 값**을 넘긴다. `compositionByTeam` 도 `scope` 를 **필수 인자로 만들어** throw 시켰다(§8-3 정신 확장) |
| **`stats.bands` 를 읽지 않는다** | #5 는 `band*` 합산 필드만 쓴다(A/B 경로에서 `stats.bands` 는 항상 전부 0). 주석으로 명시 |
| **조직 인원은 서버값** | #5·KPI 모두 `teams[].memberCount`/`descendantMemberCount` 를 **별도 조인**해 쓴다 — 프론트 합산 금지(`orgMemberCount` 는 NON_ADDITIVE) |
| **`?? 0` 금지** | `investedMd`/`availMd`/`salary`/`effortMd`/`unassignedCount` 에 `?? 0` 없음. `?? 0` 을 쓴 곳은 밴드 **카운터**(알려진 0)뿐 |
| **`costMasked` fail-close** | `costGating.isCostMasked(data) !== false` 를 그대로 사용(자체 판정 0) |
| **다크모드** | `TeamChartBox` 가 `theme={isDark ? 'dark' : undefined}`. ⚠ `useColorMode()` 는 **boolean** 을 돌려주는데 삭제된 `PortfolioTeamComparison` 은 `=== "dark"` 로 비교해 **다크 테마가 영영 적용되지 않는 버그**를 갖고 있었다 — 이식본에 물려주지 않았고 주석으로 남겼다 |

---

## 11. 테스트 결과

```
$ cd static/ui && npm test        # ⚠ npx react-scripts test 는 @forge/bridge 스위트 오탐

Test Suites: 51 passed, 51 total
Tests:       920 passed, 920 total
Snapshots:   1 passed, 1 total
Time:        18.4 s
```

| | suites | tests |
|---|---|---|
| **작업 전 기준선(실측)** | 45 | 733 |
| 작업 후 | **51** | **920** |
| 내가 추가한 것 | **+3** | **+123** (신규 117 + `teamScopeLeak` 22→28) |
| ⚠ 동시 작업(P1-e) 기여 | +3 | +64 |

**회귀 0건.** 기존 스위트 중 **본문을 고친 것은 `teamScopeLeak.test.js` 하나**뿐이고, 그것도 (a) 폐기된 경로 정정 (b) 삭제된 B1 단언 → P1-d 가드로 교체다. `teamMetrics.test.js`(30) · `costGate.test.js`(33) · `rollupTeamTree.test.js` · `teamAnalyticsFields.test.js`(16) · `portfolioAggregate.test.js`(스냅샷) 전부 **import 경로 외 무변경 통과**.

### 11-1. 렌더 테스트가 아니다 — 정직하게

이 리포에는 `@testing-library/react` 가 없어 컴포넌트를 마운트할 수 없다. 대신:
- 순수 조립부(`teamAnalyticsAdapter`)를 **컴포넌트 밖으로 빼서** 26 tests 로 고정
- 옵션 빌더 확장을 14 tests 로 고정
- 신규·수정 JSX 16개를 babel 로 **파싱 검증**(일회성 스크립트, 커밋하지 않음)
- i18n 키 커버리지를 77 tests 로 상시 감시

**수동 확인 권장**: 탭 노출(scope `NONE` 사용자) · 다크모드 · 가로 막대 라벨 겹침 · `REPORT` 미보유 계정에서의 열화 · 팀 선택 시 KPI 전환.

---

## 12. 리더 확인이 필요한 것

1. 🔴 **`npm run merge` 를 일괄 실행**해야 번역이 반영된다. (§7)
2. **#6 레이더는 만들지 않았다.** 필요하면 설계서에 4축 계약(필드·정규화 기준·역변환·`null` 처리)을 먼저 추가해야 한다. (§3-6)
3. `teamMetrics.js` 의 **옵션 2개 추가**는 설계서 §8-2 의 "시그니처 불변" 문구와 어긋난다 — 문서 정정 필요. (§4)
4. `chart.profile.title`/`.desc` 2키는 **현재 소비처가 없다**(설계서 §10-1 정의라 남겼다).
5. 배포 전 **§11-5 KVS 권한 세트 감사**는 여전히 필수다 — 누가 `ALL` 이 되는지는 코드가 아니라 운영 데이터가 정한다.
6. P1-c ↔ P1-d 는 **같은 배포 단위**로 함께 나가야 한다(기능 이동이라 공백이 생기면 안 된다). 이 회차에서 **한 번에** 끝냈다.
