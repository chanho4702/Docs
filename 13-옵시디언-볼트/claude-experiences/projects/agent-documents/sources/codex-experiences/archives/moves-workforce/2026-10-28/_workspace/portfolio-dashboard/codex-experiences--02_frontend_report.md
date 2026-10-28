# 전사 통합 대시보드 (Portfolio Dashboard) — 프론트엔드 구현 리포트

> frontend-engineer · 2026-06-02 · 단일 진실: `01_architect_design.md` v3 + `02_backend_report.md` + `mockup_v2.html`
> 백엔드 응답 shape(§2.2)과 100% 일치 확인. content 래핑 없음(루트 직접 소비).

---

## 1. 소비한 응답 shape — 접근 경로 (★ 백엔드 리포트와 글자 그대로 일치)

`responseWrapper` 가 루트로 펼침 → `invoke('getPortfolioDashboard', {})` 결과를 `res` 라 하면 **content 래핑 없이** 루트 직접 접근:

| 데이터 | 접근 경로 | 소비처 |
|--------|----------|--------|
| 성공 분기 | `res.success === true` | `PortfolioDashboardPage` |
| 집계 메타 | `res.lastAggregatedAt`, `res.aggregateStatus` ("OK"\|"EMPTY"\|"PARTIAL") | `PortfolioHeader` |
| 프로젝트 raw 배열 | `res.projects[]` | 필터/재집계 전체 |
| 프로젝트 단위 필드 | `p.projectId/projectName/statusName/completionRate/scheduleRate/avgUtilization/actualMm/totalSalary/memberCount/riskScore/diffPercentPoint/diagnosisStatus/isStale/aggregatedAt/issueSummary` | 테이블·리스크 |
| 인원 raw | `p.members[]` (`accountId/displayName/roleKey/levelKey/salary/effortMd`) | 롤레벨/급여/작업분포 재집계 |
| 월별 공수 | `p.monthlyEffort[]` (`{month, md}`) | 공수 추이 |
| 메타 사전 | `res.roleMeta`, `res.levelMeta` (key→name) | 차트 라벨 |
| 급여 버킷 경계 | `res.salaryBuckets[]` (`{bucket,min,max}`, max null=상한없음) | 급여 히스토그램 |
| 가동률 글로벌 | `res.utilization.{buckets[],totalPeople,avgUtilization}` | 가동률 도넛(필터 무관) |
| 문제이슈 | `res.problemIssues[]` (`delayDays/effortDiff/severity/...`) | 버블(필터 무관) |

- **빈 상태**: `res.aggregateStatus === 'EMPTY'` → `success:true` 이므로 isError 아님. 헤더에 안내 배너, 필터바/위젯 숨김.
- **실패**: `data?.success !== true` 분기 → 에러 SectionMessage.
- 재집계: `invoke('triggerPortfolioAggregation', {})` → `{success, started, lastAggregatedAt(직전값)}`. 즉시 토스트성 안내 후 8초 뒤 `invalidateQueries` 로 refetch.

`startDate/endDate/aggregatedAt` 문자열, `totalSalary` Number, `members/monthlyEffort` 파싱 완료 배열 — **추가 JSON.parse 없이** 그대로 소비.

---

## 2. 생성 / 수정한 파일

### 생성 — 페이지/위젯
| 파일 | 역할 |
|------|------|
| `static/ui/src/utils/queryKey/portfolioKeys.js` | 쿼리키 팩토리 `portfolioKeys.dashboard()` |
| `static/ui/src/pages/portfolio/PortfolioDashboardPage.jsx` | `canRead('REPORT')` 게이트 + 단일 useQuery(staleTime 5분) + 재집계 useMutation + 레이아웃 |
| `static/ui/src/pages/portfolio/PortfolioHeader.jsx` | 기준시각 + 재집계 버튼 + PARTIAL/EMPTY 배너 |
| `static/ui/src/pages/portfolio/PortfolioFilterBar.jsx` | `@atlaskit/select` isMulti(기본 전체) + 선택분 요약 라인 |
| `static/ui/src/pages/portfolio/hooks/usePortfolioFilter.js` | useState(Set) 기본 전체 + data 로드 후 동기화 |
| `static/ui/src/pages/portfolio/utils/portfolioAggregate.js` | **재집계 순수함수 8종** |
| `static/ui/src/pages/portfolio/utils/__test__/portfolioAggregate.fixture.js` | 골든 픽스처 1세트 |
| `static/ui/src/pages/portfolio/utils/__test__/portfolioAggregate.test.js` | frontend jest 15케이스(스냅샷 포함) |
| `static/ui/src/pages/portfolio/sections/ComparisonTabs.jsx` | 섹션2 서브탭 3(개요/인력·비용/공수·작업) |
| `static/ui/src/pages/portfolio/sections/RiskSection.jsx` | 섹션3(리스크TOP+문제버블, 서브탭 밖) |
| `static/ui/src/pages/portfolio/tabs/OverviewTab.jsx` | 현황 테이블 |
| `static/ui/src/pages/portfolio/tabs/PeopleCostTab.jsx` | 롤레벨/총인건비/급여히스토/가동률 |
| `static/ui/src/pages/portfolio/tabs/EffortWorkTab.jsx` | 공수추이/작업분포 |
| `static/ui/src/pages/portfolio/widgets/WidgetCard.jsx` | 위젯 카드 셸(필터 반영/무관 배지) |
| `static/ui/src/pages/portfolio/widgets/ChartBox.jsx` | ECharts 공용 래퍼(빈 상태) |
| `static/ui/src/pages/portfolio/widgets/PortfolioProjectTable.jsx` | 현황 테이블(DynamicTable 드릴다운 + isStale 배지+툴팁) |
| `static/ui/src/pages/portfolio/widgets/PortfolioRoleLevelDist.jsx` | 롤/레벨 100%정규화 누적막대 + 토글 |
| `static/ui/src/pages/portfolio/widgets/PortfolioSalaryByProject.jsx` | 프로젝트별 총인건비 막대 |
| `static/ui/src/pages/portfolio/widgets/PortfolioSalaryHistogram.jsx` | 급여 구간 분포(dedup) |
| `static/ui/src/pages/portfolio/widgets/PortfolioUtilization.jsx` | 가동률 도넛(★필터 무관, utilization.buckets[] 직접) |
| `static/ui/src/pages/portfolio/widgets/PortfolioEffortTrend.jsx` | 공수 추이 멀티라인 + 월별⇄누적 토글 |
| `static/ui/src/pages/portfolio/widgets/PortfolioWorkDist.jsx` | 작업 분포 scatter-aggregate-bar + 집계⇄산점 토글 |
| `static/ui/src/pages/portfolio/widgets/PortfolioRiskTop.jsx` | 리스크 TOP 가로막대 |
| `static/ui/src/pages/portfolio/widgets/PortfolioProblemBubble.jsx` | 문제이슈 버블(★필터 무관) |
| `static/ui/src/pages/portfolio/PortfolioDashboard.css` | 서브탭/그리드/배지 스타일 |
| `static/ui/src/components/chart/echart/options/scatterChartOption.js` | scatter 공용(버블·작업분포) 신규 |
| `locales/kr/portfolio.json` · `locales/en/portfolio.json` | i18n 키(§11 전체, en 동형) |

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/components/chart/echart/options/stackChartOption.js` | `normalize` 옵션 추가(기본 false 하위호환, yAxis 0~100%·tooltip %, `colors` 선택) |
| `static/ui/src/App.jsx` | `/dashboard` 라우트 + import |
| `static/ui/src/layout/Sidebar.jsx` | mainItems 에 대시보드 진입점 + `canRead('REPORT')` 필터(mainItems 도 `.filter` 적용) |
| `static/ui/src/backoffice/page/setting/EtcSetting.jsx` | 가동률 band(under/over) 입력 UI + updateSetting 에 `utilizationUnderBand/OverBand` 전달 |
| `locales/kr/setting.json` · `locales/en/setting.json` | `setting.utilization.*` 라벨 추가 |

---

## 3. 재집계 유틸 8종 + 골든 픽스처

`utils/portfolioAggregate.js` 순수함수(모두 위젯에서 `useMemo` 호출, 추가 invoke 없음):

| # | 함수 | 출력 | dedup |
|---|------|------|-------|
| 1 | `filterProjects(all, selectedIds)` | 선택 projects[] | - |
| 2 | `summarizeSelection(selected, totalCount)` | `{projectCount,totalCount,uniqueMemberCount,totalActualMm,totalSalary}` | ★인원 고유 accountId |
| 3 | `roleLevelDistribution(selected, axis, meta)` | `{categories,series:[{name,data:[ratio 0~1]}]}` 100%정규화 | - |
| 4 | `salaryByProject(selected)` | `[{name,totalSalary}]`(직접) | - |
| 5 | `salaryHistogram(selected, buckets)` | `[{bucket,count}]` | ★고유 인원 salary |
| 6 | `effortTrendByProject(selected, mode)` | `{months[합집합],series}` (cumulative=프론트 cumsum) | - |
| 7 | `workDistribution(selected)` | `{categories,points:[[xi,md]],avg}` | - |
| 8 | `riskTop(selected, n)` | riskScore desc 상위 n | - |

> ※ `recomputeUtilization` **없음** — 설계서 A안대로 가동률은 필터 무관 글로벌(`utilization.buckets[]` 직접). members[]에 effectiveMmDays/utilization 필드가 없어 재집계 자체가 불가능. → 8종 확정.

**골든 픽스처** (`portfolioAggregate.fixture.js`): 2프로젝트(P1 결제 3명/P2 모바일 2명), 인원 B가 양쪽 참여(dedup 검증). 위젯별 기대 출력을 `toMatchSnapshot` 으로 고정 → 조용한 재집계 회귀 차단. 추가로 함수별 명시적 단위 assertion 14건(dedup·100%정규화·월합집합·cumsum·버킷경계 등).

---

## 4. i18n merge 실행 여부

- `locales/kr/portfolio.json` + `locales/en/portfolio.json` 작성(설계서 §11 키 전체, en 동형).
- `setting.json` (kr/en)에 `utilization.*` band 라벨 추가.
- **`cd static/ui && npm run merge` 실행 완료** → `ko-KR.json`/`en-US.json` 생성 확인:
  - `ko-KR.json.portfolio.title` = "전사 통합 대시보드" ✅
  - `en-US.json.portfolio.title` = "Portfolio Dashboard" ✅
  - `ko-KR.json.setting.utilization` 존재 ✅
- ko-KR/en-US **직접 수정 안 함**. UI는 `useI18nStore` 의 `t()` 사용(치환은 `tFormat`).

---

## 5. npm test / build 결과

```
# frontend jest (cd static/ui && react-scripts test --watchAll=false)
Test Suites: 5 passed, 5 total
Tests:       36 passed, 36 total   (기존 21 + 신규 portfolioAggregate 15)
Snapshots:   1 passed, 1 total     (골든 픽스처)

# build (cd static/ui && npm run build) — prebuild 가 merge 자동 실행
The build folder is ready to be deployed.   ✅ 컴파일 성공
```

빌드 중 발견·수정한 2건:
1. `@atlaskit/lozenge` 미설치 → 인라인 `Badge` span 컴포넌트로 대체(상태/리스크/isStale 배지).
2. 이 프로젝트 eslint 에 `react-hooks/exhaustive-deps` 룰 미등록 → 해당 disable 주석이 "rule not found" 에러 유발 → `// eslint-disable-line` 으로 변경.

---

## 6. 설계와 다르게 구현한 부분 + 이유

1. **배지에 Atlaskit Lozenge 대신 인라인 span 사용** — `@atlaskit/lozenge` 가 node_modules 에 없음(빌드 실패로 확인). 설계서 §6.7 의 "Lozenge" 는 시각적 배지를 의미하므로 동일 룩의 인라인 `Badge` 로 구현(색상은 mockup_v2 와 동일: 지연 #FFEBE6/#BF2600 등). isStale "어제 값" 배지는 `@atlaskit/tooltip` + 인라인 Badge 조합으로 aggregatedAt 툴팁 유지.

2. **재집계 완료 감지** — 설계서 "수초 후 refetch". 즉시 started:true 받은 뒤 8초 후 `invalidateQueries` 로 자동 refetch 하여 `lastAggregatedAt` 갱신 확인. (별도 폴링 루프는 과설계라 단발 invalidate 채택. 사용자가 수동 새로고침해도 staleTime 5분 내 캐시 사용.)

3. **EffortTrend 누적 MM 병기 라벨** — §11 `cumulativeMm` 키는 준비했으나, 누적 모드 차트 자체가 cumsum MD 라인이라 별도 MM 환산 라벨 노출은 생략(차트 단순성 유지). 키는 존재하므로 후속 노출 가능.

4. **mainItems 권한 필터** — 설계서는 "mainItems 진입점 + permission 필터". 기존 Sidebar 의 mainItems 는 `.filter` 가 없었으나, 대시보드(REPORT)를 추가하며 mainItems 에도 `.filter(item => item.permission === null || isReadable(item.permission))` 적용(My Work/Project 는 permission null 이라 영향 없음).

설계 계약의 **응답 소비 경로·재집계 흐름·필터 무관 예외(utilization/problemIssues)·서브탭 구조는 100% 준수**.

---

## 7. 검증자가 알아야 할 경계면 포인트

1. **소비 경로 = 루트 직접** (`res.projects`, `res.utilization` 등). content 래핑 없음 — 백엔드 `responseWrapper` 루트 펼침과 일치. `data?.success === true` 분기.
2. **utilization 필터 무관** — `PortfolioUtilization` 은 `selectedProjects` 를 받지 않고 `data.utilization` 만 직접 받음. members[] 재집계 절대 안 함(필드 없음). "필터 무관" 배지(`badge="noFilter"`).
3. **problemIssues 필터 무관** — `PortfolioProblemBubble` 은 `data.problemIssues` 원본 직접. selectedIds 무시. "필터 무관" 배지.
4. **dedup 위치** — `summarizeSelection.uniqueMemberCount`, `salaryHistogram` 만 고유 accountId dedup. `totalSalary`/`actualMm`/`totalSalary 막대` 는 프로젝트 단위 단순 Σ(B가 여러 프로젝트면 인건비는 중복 계상됨 — 의도, 골든 픽스처 테스트에 명시).
5. **isStale** — `p.isStale === true` 행에 "어제 값" 배지 + `p.aggregatedAt` 툴팁(PARTIAL 노후 표시).
6. **빈/EMPTY** — `aggregateStatus==='EMPTY'` 이면 필터바·위젯 미렌더, 헤더 안내만. success:true 이므로 isError 분기 아님.
7. **차트옵션 하위호환** — `stackChartOption` 의 `normalize` 는 기본 false. 기존 호출처(있다면)는 영향 없음. `scatterChartOption` 은 신규(버블·작업분포 공용, series 배열 그대로 수용).
8. **쿼리키** — `portfolioKeys.dashboard()` = `['portfolio','dashboard']`. 인라인 키 미사용.
9. **TanStack Query v5** — `refreshMutation.isPending` 사용(v5 명칭). 빌드 통과로 버전 정합 확인.

---

## UI 보완 (2026-06-02)

> frontend-engineer · 순수 프론트 UI 변경(백엔드 응답 shape 무변경). 요구 5건 반영.

### 변경/신규 파일
| 파일 | 변경 |
|------|------|
| `widgets/ChartTableToggle.jsx` (신규) | 차트⇄표 토글 공용 컴포넌트. `chart` 노드 + `tableHead`/`tableRows`/`emptyTable` prop 수용, Atlaskit `DynamicTable` 렌더. 토글 버튼은 `@atlaskit/icon/core/chart-bar`·`table` 아이콘 + 기존 위젯 토글 스타일 재사용 |
| `widgets/WidgetCard.jsx` | `badge` prop·Badge 컴포넌트 **완전 제거**, `info={{calc,interp}}` prop 추가 → 타이틀 옆 `InfoTip`(진척도 페이지 컴포넌트 재사용) 렌더 |
| `PortfolioHeader.jsx` | "기준 시각" 앞 이모지 `📅` → `@atlaskit/icon/core/clock` 공식 아이콘 (refresh 버튼은 기존 공식 아이콘 유지) |
| `utils/portfolioAggregate.js` | `roleLevelDistribution` 을 비율(0~1) → **실제 인원 카운트** 반환으로 변경. 미사용된 `round2` 제거 |
| `widgets/PortfolioRoleLevelDist.jsx` | `stackChartOption({normalize:false})` 로 y축=인원수. 차트/표 토글 추가(표=프로젝트별 롤·레벨 인원수 매트릭스) |
| `widgets/PortfolioEffortTrend.jsx` | 차트/표 토글(표=월×프로젝트 MD 매트릭스) |
| `widgets/PortfolioWorkDist.jsx` | 차트/표 토글(표=프로젝트별 인원수/총·평균 공수MD) |
| `widgets/PortfolioSalaryByProject.jsx` | 차트/표 토글(표=프로젝트별 총 인건비) |
| `widgets/PortfolioSalaryHistogram.jsx` | 차트/표 토글(표=급여구간별 인원수) |
| `widgets/PortfolioUtilization.jsx` | 차트/표 토글(표=band별 인원수). 하단 요약 라인 유지 |
| `widgets/PortfolioRiskTop.jsx` | 차트/표 토글(표=프로젝트별 riskScore/차이%p/진단) |
| `widgets/PortfolioProblemBubble.jsx` | 차트/표 토글(표=이슈 행: 이슈/프로젝트/요약/담당자/지연일/공수편차/심각도) |
| `tabs/OverviewTab.jsx`·`PeopleCostTab.jsx`·`EffortWorkTab.jsx`·`sections/RiskSection.jsx` | `badge=` prop 제거 → `info={{calc,interp}}` 로 전환 |
| `locales/kr/portfolio.json`·`locales/en/portfolio.json` | `common.viewChart/viewTable`, 위젯별 `info.calc/interp`(+ byProjectInfo/histogramInfo), 표 컬럼 헤더 `col*` 키 추가. `badge.*`·`utilization.noFilterBadge` 키 제거. `roleLevel.desc` "100% 정규화" → "인원 구성(명)" 수정 |
| `utils/__test__/portfolioAggregate.test.js` + `__snapshots__/*.snap` | roleLevelDistribution 기대값을 카운트 기준으로 갱신 |

### (1) 차트별 정보(InfoTip)
모든 위젯(현황테이블/롤레벨/총인건비/급여히스토/가동률/공수추이/작업분포/리스크TOP/문제이슈)의 `WidgetCard`에 `info={{calc,interp}}` 전달 → 타이틀 옆 ⓘ 툴팁. 진척도 페이지 `InfoTip`(`projectDetail/progress/InfoTip.jsx`)을 그대로 import, calc/interp 라벨은 InfoTip 내부 `projectDetail.analysis.progress.tip.*` 키 사용. 위젯별 `portfolio.<widget>.info.calc/interp` i18n 키 신설.

### (2) 임의 아이콘 → 공식 Atlaskit 아이콘
- `PortfolioHeader` 기준시각 `📅` → `@atlaskit/icon/core/clock`.
- 토글 버튼에 `@atlaskit/icon/core/chart-bar`(차트)·`@atlaskit/icon/core/table`(표).
- 위젯/필터바/서브탭의 그 외 임의 SVG·이모지 아이콘 없음(확인 완료). 모든 경로 빌드로 해상도 검증.

### (3) "필터 반영"/"필터 무관" 배지 제거
`WidgetCard`의 Badge·badge prop 완전 삭제, 4개 탭/섹션의 `badge=` 호출 제거, i18n `badge.*`·`utilization.noFilterBadge` 키 삭제. 가동률·문제이슈의 **필터 무관 동작은 유지**(데이터 소비 경로 무변경) — UI 배지만 제거.

### (4) 차트⇄표 토글
공용 `ChartTableToggle.jsx` 신설(재발명 회피). 각 위젯이 자기 데이터로 `tableHead`/`tableRows`(Atlaskit DynamicTable 형식)를 만들어 전달. 현황테이블 위젯(OverviewTab)은 이미 표라 토글 생략. 라벨은 `portfolio.common.viewChart`/`viewTable`.

### (5) 롤/레벨 분포 — 인원수
`roleLevelDistribution` 이 `count/members.length`(round2 비율) → `members.filter(...).length`(절대 카운트) 반환. 위젯은 `stackChartOption({normalize:false})` 로 y축=명. `stackChartOption`의 normalize 옵션은 보존(이 위젯만 미사용). desc i18n "100% 정규화" → "인원 구성(명)". 테스트·골든 스냅샷 카운트 기준 갱신(Dev p1=2/p2=1, PL/QA 등).

### i18n merge
`cd static/ui && npm run merge` 실행 완료 → `ko-KR.json`/`en-US.json` 재생성, 신규 키(common/info/col*) 반영·삭제 키(badge) 제거 확인.

### 테스트/빌드
- `npx jest` (전체): **5 suites / 36 tests passed, snapshot 1 passed**.
- `npm run build`: **Compiled with warnings** — 경고는 기존 node_modules 소스맵(@atlaskit/analytics-next, marklassian) 뿐, 본 변경 관련 에러·경고 없음. clock/chart-bar/table 아이콘 경로 정상 해상.

### 설계와 달라진 점
- 토글을 `WidgetCard` 레벨이 아닌 **위젯 내부 `ChartTableToggle`**로 배치(위젯이 데이터 소유 → chart/table 양쪽 제공이 자연스러움). InfoTip만 WidgetCard 타이틀에 둠. 데이터 소비 경로(백엔드 shape)는 무변경.

---

## T/S/R 재설계 구현 (2026-06-02)

`04_redesign_tsr.md` 단일진실 기준으로 전사 대시보드를 철의 삼각형(Time/Scope/Resource) IA로 재편. **백엔드 zero-touch**(응답 shape·invoke 경로 무변경, 루트 펼침 `data.projects` 등 그대로).

### 변경/신규 파일
**신규**
- `utils/portfolioAggregate.js`: 파생 유틸 2종 추가(9·10번) — `issueStatusDistribution`, `tsrSignals`
- `widgets/PortfolioIssueStatusDist.jsx`: Scope 이슈상태 누적막대(건수⇄비율 토글)
- `widgets/PortfolioScopeProgress.jsx`: Scope 완성률 vs 일정률 그룹막대(§3-3, 신규 유틸 불요 — completionRate/scheduleRate 직접 map)
- `widgets/PortfolioTsrSignalTable.jsx`: 종합 개요 T/S/R 신호등 행(신호등⇄수치표 토글)
- `tabs/TimeTab.jsx` / `tabs/ScopeTab.jsx` / `tabs/ResourceTab.jsx`: 3축 탭 컨테이너

**수정**
- `sections/ComparisonTabs.jsx`: TABS를 time/scope/resource로 교체, problemIssues 패스스루, 기본 active="time"
- `PortfolioDashboardPage.jsx`: 종합 개요 신호등(`PortfolioTsrSignalTable`)을 필터바 아래·서브탭 위(서브탭 밖)에 배치. RiskSection 제거. ComparisonTabs에 problemIssues 전달. `UTIL_BANDS` 상수(0.7/1.1/1.3) 신호등에 전달
- `PortfolioDashboard.css`: `.tsr-dot`/`.tsr-dot--red|amber|green` 신호등 점 스타일 추가
- `utils/__test__/portfolioAggregate.fixture.js`: 픽스처에 issueSummary/completionRate/scheduleRate/avgUtilization/statusName/memberCount/isStale 등 신규 필드 추가
- `utils/__test__/portfolioAggregate.test.js`: 신규 2종 단위 테스트 + 골든 스냅샷 3키(issueStatusCount/Ratio/tsrSignals) 추가
- `locales/kr/portfolio.json` + `locales/en/portfolio.json`: subtab 키 교체(time/scope/resource), overview/issueStatus/scopeProgress 키 신규

**삭제(미사용 정리)**
- `tabs/OverviewTab.jsx` / `tabs/PeopleCostTab.jsx` / `tabs/EffortWorkTab.jsx` / `sections/RiskSection.jsx`
- i18n `subtab.overview/peopleCost/effortWork` 키 제거(time/scope/resource로 대체)

> `widgets/PortfolioProjectTable.jsx`는 **존치** — 신호등 위젯의 "수치표" 모드로 내부 재사용(정보 손실 0). 기존 위젯 컴포넌트 내부 로직 전부 무수정(재배치만).

### 파생 유틸 2종 — 시그니처·임계 구현
**`issueStatusDistribution(selected, mode='count')`**
- 출력 `{ categories:[projectName], series:[{name:'done|inProgress|todo', data:[…]}] }`
- ratio 모드: 각 프로젝트 합(done+inProgress+todo)으로 나눠 round2 0~1, 합 0 → 0(NaN 가드)
- count → `stackChartOption{normalize:false}`, ratio → `normalize:true` 와 짝

**`tsrSignals(selected, bands={utilUnder:0.7,utilOver:1.1,utilRed:1.3})`**
- 행별 `{ projectId, projectName, statusName, statusColor, isStale, aggregatedAt, actualMm, time{level,completion,schedule,diff}, scope{level,completion,todoRatio}, resource{level,utilization,memberCount,totalSalary} }`
- **임계(사용자 확정 그대로):**
  - `time.level` = diagnosisStatus 매핑 (delayed→red / caution→amber / normal→green) — 새 임계 발명 X
  - `scope.level` = todoRatio(todo/(done+inProgress+todo)): `<0.3` green / `0.3~0.6` amber / `≥0.6` red
  - `resource.level` = avgUtilization: `≥utilRed(1.3)` red / `<utilUnder(0.7)` OR `>utilOver(1.1)` amber / 그 사이 green

### 신호등 색 로직
CSS `.tsr-dot--red`(#DE350B) / `--amber`(#FFAB00) / `--green`(#36B37E). 각 점은 `<Tooltip>`으로 감싸 호버 시 축별 수치(완성/일정/지연%p, 대기비중, 가동률) 표시(`white-space:pre-line`). 행 클릭 → `navigate('/project/'+projectId)`. isStale 행은 "어제 값" Lozenge + aggregatedAt 툴팁(기존 패턴 재사용).

### 탭 재편 결과
- **종합 개요(서브탭 밖)**: `PortfolioTsrSignalTable` — 행=프로젝트, 컬럼 [프로젝트명|상태|T|S|R(신호등 점)|완성%|일정%|가동률|인건비|인원] + 신호등⇄수치표 토글
- **Time 탭**: 공수 추이 / 리스크 TOP / 문제 버블(필터 무관 유지) — RiskSection 흡수, 상시노출 해제
- **Scope 탭**: 이슈 상태 분포(신규) / 완성률 vs 일정률 막대(신규)
- **Resource 탭**: 롤레벨 / 총인건비 / 급여 히스토그램 / 가동률(필터 무관) / 작업분포

### 정리한 미사용 파일/키
파일 4개 삭제(OverviewTab/PeopleCostTab/EffortWorkTab/RiskSection), i18n subtab 구키 3개 제거. 잔존 참조 0건(grep 확인).

### i18n merge / test / build
- `npm run merge`: 완료 — ko-KR/en-US 재생성, subtab(time/scope/resource)·overview·issueStatus·scopeProgress 반영, 구 subtab 키 제거 확인
- `npx jest`(전체): **5 suites / 44 tests passed, snapshot 1 passed**(portfolioAggregate 23개 — 신규 issueStatusDistribution 3 + tsrSignals 5 + 골든 스냅샷 포함)
- `npm run build`: **성공**(prebuild merge 자동 실행). `@atlaskit/icon/core/chart-bar`·`table` 아이콘 경로 정상 해상

### 설계와 달라진 점
1. **resource 신호등 가동률 band 조달**: 설계서는 "응답/세팅에서 조달, 없으면 0.7/1.1 폴백"을 제시. `getPortfolioDashboard` 응답에 band 값이 미포함이고 프론트에 settings band 조회 invoke 경로가 없어, 백엔드 zero-touch 유지를 위해 `PortfolioDashboardPage`에 `UTIL_BANDS` 상수(0.7/1.1/1.3)를 폴백으로 사용. 추후 settings 조회 추가 시 prop 교체만으로 연동 가능. InfoTip에 "프로젝트 평균 가동률 기준 — 전사 가동률 분포와 의미 다름" 명시.
2. **Scope 완성vs일정 막대**: 기존 `barChartOption`(default export, 단일 stack·per-bar 색상)이 그룹막대 비교에 부적합해 위젯 내부에 ECharts 옵션을 인라인 구성(그룹 bar 2계열, %포맷). 신규 공용 옵션 파일은 만들지 않음.
3. **골든 픽스처**: 신규 함수가 소비하는 필드(issueSummary 등)가 기존 픽스처에 없어 P1/P2에 추가. todoRatio 경계(P1=0.26→green, P2=0.6→red)·가동률 red 컷(P1=1.35→red, P2=0.83→green)을 의도적으로 양극단 배치해 임계 회귀를 고정.
