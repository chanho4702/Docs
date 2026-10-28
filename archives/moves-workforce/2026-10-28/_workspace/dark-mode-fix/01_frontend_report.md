# 다크모드 미적용 수정 — 프론트 구현 리포트

작성일: 2026-07-06 | 슬러그: dark-mode-fix | 담당: frontend-engineer

## 1. 테마 메커니즘 결론 (실증)

앱은 **이미 Jira 테마를 정상 구독**한다. 근본 원인은 "테마 미구독"이 아니라 **하드코딩 색 + 차트 테마 미등록**이었다.

- `static/ui/src/App.jsx:38` — `view.theme.enable()` 호출. Forge가 `<html data-color-mode="dark">` 속성과 `--ds-*` 토큰 CSS 변수를 주입한다. → Atlaskit 컴포넌트와 `token()`/`var(--ds-*)` 사용 부분은 라이트/다크 자동 전환됨.
- `static/ui/src/utils/useColorMode.js` — `data-color-mode` 속성을 MutationObserver로 관측해 `isDark`(boolean) 반환. 다크 전환 시 소비 컴포넌트 리렌더.
- 따라서 **자동으로 바뀌는 것**: Atlaskit 컴포넌트, `token()`/`var(--ds-*)`로 지정한 색.
- **안 바뀌던 것**(= 증상 원인):
  1. 인라인 스타일/CSS의 하드코딩 hex(`#fff` 카드, `#DFE1E6` 보더, `#5E6C84` 텍스트 등) — 통합 대시보드(Portfolio)가 대표적(다크 오버라이드 전무).
  2. **ECharts `theme='dark'`가 no-op였음**: `ProgressSCurve`/`TaskHistoryBurnup` 등은 `theme={isDark?'dark':undefined}`를 넘기지만 **`echarts.registerTheme('dark', ...)`가 어디에도 없어** echarts가 라이트 기본값으로 폴백 → 다크 배경 위에 **어두운 축/범례/툴팁 텍스트**가 안 보임. → 사용자가 말한 "진척 분석 좀 이상함"의 실제 원인.
  3. SVAR 간트가 라이트 `Willow` 테마 고정 → 다크에서 흰 그리드/차트.

## 2. 핵심 수정 (근본 원인 3종)

### (A) ECharts 다크 테마 전역 등록 — 최대 레버리지
- **신규** `static/ui/src/utils/echartsTheme.js`: `echarts.registerTheme('dark', {...})`. 투명 배경 + 밝은 축/범례/툴팁/그리드 중립색 + fallback 팔레트.
- `App.jsx`에서 side-effect import(`import './utils/echartsTheme'`).
- 효과: `theme='dark'`를 넘기던 **모든** 차트(진척 S-curve, 작업이력 번업 등)가 즉시 다크 축/툴팁 색을 실제 적용. 라이트는 `theme=undefined`로 기본값 유지 → 회귀 없음.

### (B) SVAR 간트 다크 테마 전환
- `GanttChart.jsx`: `WillowDark` import + `useColorMode`로 `const GanttTheme = isDark ? WillowDark : Willow;` 후 `<Willow>` 래퍼를 `<GanttTheme>`로 교체. (무료 빌드에 `WillowDark` export·`.wx-willow-dark-theme` CSS 존재 확인)
- `gantt.css`: 막대 색 변수 오버라이드 셀렉터에 `.wx-willow-dark-theme` 추가(대비 튜닝 다크에도 적용). 그리드 보더/그립/리사이저 `#dfe1e6`→`var(--ds-border,#dfe1e6)`, placeholder 텍스트/보더·폴더명(`#403294`)→`var(--ds-text-*)`, 폴더 행 다크 배경 오버라이드 추가.

### (C) 하드코딩 색 → Atlaskit 디자인 토큰 전수 교체
인라인 스타일은 `token("name","fallback")`(=`var(--ds-*, fallback)`), CSS는 `var(--ds-*, fallback)`. fallback은 원본 hex 유지 → 라이트 무회귀.

## 3. 토큰 매핑 표 (적용 규칙)

| 용도 | 원본(예) | 토큰 |
|---|---|---|
| 카드/패널 배경 | `#fff` | `elevation.surface` |
| 옅은 배경 | `#F4F5F7`,`#F7F8FA` | `elevation.surface.sunken` |
| 보더 | `#DFE1E6`,`#DFE3E8`,`#EBECF0`,`#C1C7D0` | `color.border` / `color.border.bold` |
| 강한 텍스트 | `#172B4D`,`#42526E`,`#44546F` | `color.text` |
| 보조 텍스트 | `#5E6C84`,`#6B778C`,`#6B7280` | `color.text.subtle` |
| 가장 옅은 텍스트 | `#8993A4`,`#97A0AF`,`#A5ADBA`,`#B3BAC5` | `color.text.subtlest` |
| 브랜드 배경(활성 버튼) | `#0052CC`,`#0065FF` | `color.background.brand.bold` |
| 브랜드 텍스트/보더/아이콘 | `#0052CC` | `color.text.brand`/`color.border.brand`/`color.icon.brand` |
| 브랜드 위 흰 글자 | `#fff` | `color.text.inverse` |
| neutral 뱃지 | bg`#DFE1E6`/text`#42526E` | `color.background.neutral`/`color.text` |
| information 뱃지 | bg`#DEEBFF`/text`#0747A6` | `color.background.information`/`color.text.information` |
| success 뱃지/텍스트 | bg`#E3FCEF`/`#36B37E22`, text`#006644`/`#1F7A54` | `color.background.success`/`color.text.success` |
| warning 뱃지/텍스트 | bg`#FFFAE6`/`#FF8B0022`, text`#974F0C`/`#B36B00` | `color.background.warning`/`color.text.warning` |
| danger 뱃지/텍스트 | bg`#FFEBE6`/`#DE350B22`, text`#BF2600`/`#B32D08` | `color.background.danger`/`color.text.danger` |
| discovery 뱃지/텍스트 | bg`#EAE6FF`/text`#5E4DB2`/`#403294` | `color.background.discovery`/`color.text.discovery` |

## 4. 수정 파일 목록

**코어/공유**
- `utils/echartsTheme.js` (신규), `App.jsx` (import)
- `components/chart/ChartTableToggle.jsx` (토글버튼), `components/chart/EmptyState.jsx`, `components/chart/layout/ChartCard.jsx` (풀스크린 배경/드래그핸들/구분선/설명)

**① 통합 대시보드(Portfolio)** — DOM 토큰화 + 차트 테마
- 쉘: `widgets/ChartBox.jsx`(ECharts에 `theme` 주입), `widgets/WidgetCard.jsx`, `PortfolioHeader.jsx`, `PortfolioFilterBar.jsx`, `PortfolioDashboardPage.jsx`, `PortfolioDashboard.css`
- 위젯: `PortfolioProjectTable`, `PortfolioTsrSignalTable`, `PortfolioCostOverrunRank`, `PortfolioCostKpi`, `PortfolioCostByRoleLevel`, `PortfolioEffortTrend`, `PortfolioIssueStatusDist`, `PortfolioRoleLevelDist`, `PortfolioWorkDist`, `PortfolioUtilization`(DOM/토글), `PortfolioRiskTop`/`PortfolioSalaryByProject`/`PortfolioSalaryHistogram`(차트 중립 라벨색 제거), `PortfolioCostScatter`/`PortfolioScheduleGantt`(중립 그리드/트랙색 `useColorMode` 조건부)

**② 작업 관리(issue)**
- `issue/ProjectIssuePanel.jsx`, `issue/ProjectIssueTable.jsx`, `issue/ProjectGroupCard.jsx` (IssueAddModal은 하드코딩 색 없음)

**③ 작업 이력(taskHistory)**
- `taskHistory/TaskHistoryTable.jsx`, `taskHistory/TaskHistoryInsightCards.jsx`, `taskHistory/TaskHistoryPage.jsx` (Burnup은 시리즈색만 → 미변경, 테마 등록으로 축/툴팁 해결)

**④ 간트(gantt)**
- `gantt/GanttChart.jsx`, `gantt/gantt.css`

**⑤ 진척 분석(progress)**
- `progress/InfoTip.jsx`(기본 아이콘색), `progress/ProgressBars.jsx`(아이콘색), `progress/ProgressRiskTable.jsx`(중립/신호 뱃지) — DOM 레이아웃(`ProgressPage.css`)은 **기존에 이미 `html[data-color-mode="dark"]` 오버라이드 보유**라 유지. S-curve/상태분포 차트는 (A)로 해결.

## 5. 미수정·보류 항목과 사유

- **차트 데이터 시리즈 색(30여 개 리터럴 잔존)**: bar/line/area/markLine의 브랜드블루(`#0052CC`)·초록(`#36B37E`)·빨강(`#DE350B`/`#FF5630`)·노랑(`#FF8B00`)·보라(`#6554C0`), 사분면/유틸리제이션 밴드/상태 신호등 상수. **의도적 보존** — 양 모드에서 채도가 충분해 가독. 변경 시 라이트 회귀·의미 훼손 위험이 커 제외.
- **`components/chart/echart/options/pieChartOption.js`의 `borderColor:"#fff"`**(파이 슬라이스 구분선): 캔버스라 `token()`(=var) 미해석. 다크에서 흰 구분선이 다소 도드라지나 "깨짐"은 아님. 순수 빌더라 테마 주입 경로가 없어 보류(후속: 소비처에서 isDark 주입).
- **`apex/rangeBarOption.js`(ApexCharts)**: 5개 대상 화면 밖(리소스 분석 간트)이라 이번 범위 제외.
- **간트 커스텀 툴팁(`.gantt-bar-tooltip`, 남색 배경/흰 글자)**: 양 모드 모두 어두운 툴팁이라 그대로 두어도 정상 → 유지.

## 6. 배포 후 시각 체크포인트 (사용자 확인용)

라이트/다크 **각각** 확인:

1. **통합 대시보드**(`/dashboard`): 위젯 카드 배경/보더/제목·설명 텍스트, 필터바, 서브탭(활성 파랑 밑줄), 토글버튼(차트⇄표, 집계⇄산점), 프로젝트/신호 테이블 뱃지(지연/주의/정상), KPI 타일. 다크에서 흰 박스·안 보이는 텍스트 없어야 함.
2. **작업 관리**: 그룹 카드/헤더/hover 배경, 상태칩, 잘림 경고 배너(노랑), 빈 상태 텍스트.
3. **작업 이력**: 인사이트 카드 값/델타(추가공수 빨강·감소 초록)·라벨, 표 `-` 플레이스홀더, **번업 차트 축/툴팁 글자**가 다크에서 밝게 보이는지.
4. **간트**: 그리드 배경·행/열 구분선·헤더·리사이저가 다크 테마(WillowDark)로 어둡게, 막대(파랑/초록/보라) 대비, placeholder 회색 점선 텍스트, 폴더 행/폴더명, 커스텀 세로선 오버레이·hover 툴팁.
5. **진척 분석**: **S-curve 축/범례/툴팁 글자 가독**(핵심), 오늘·종료·예상 세로선(주황/보라) 라벨, 진척 비교 막대(track/fill 대비), 상태 분포 누적 막대·범례, 위험 이슈 표 편차 뱃지·지연일수(빨강).

## 7. 검증 결과

- `cd static/ui && npm test` → **6 suites / 58 tests 전부 PASS**.
- `npm run build` → **성공**(compiled with warnings). 경고는 전부 사전 존재(node_modules 소스맵 파싱, `merge.js` module type) — 이번 변경과 무관.
- i18n/locales 변경 없음(순수 스타일링) → `merge` 불필요(빌드 prebuild가 자동 실행). 데이터/invoke/쿼리키 변경 없음.
