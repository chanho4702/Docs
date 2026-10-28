# 02 Frontend Report — R3 + R4 (진척율/비용 차트 UX 통일 + 이슈별 비용 차트화)

작성: 2026-06-18 / 담당: frontend-engineer / 범위: **R3, R4(프론트)**

## 요약

통합대시보드(Portfolio)의 차트 UX 패턴(확장 portal + 차트⇄표 토글)을 프로젝트 상세 진척율/비용
페이지에 동일하게 적용했다. 이를 위해 portfolio 전용이던 확장 컨텍스트/토글/빈상태 컴포넌트를
`components/chart/`로 승격(공용화)하고, 공용 `Card`에 `expandable` opt-in을 추가했다.
이슈별 비용은 상위 N 가로막대 차트 + 전체 이슈 표(로우데이터) 토글로 재구성했다(R5 확장 byIssue 소비).

데이터 소비 shape 변경은 **R5 byIssue만**. 나머지 차트는 기존 소비 shape 그대로 표현계층(확장/토글)만 추가.

## 수정/신규 파일

### 신규 — 공용 차트 컴포넌트 계층 (`static/ui/src/components/chart/`)
- **`expandContext.js`** — portfolio `widgets/expandContext.js`에서 **이동**(ExpandContext/useExpanded).
- **`EmptyState.jsx`** — portfolio `widgets/EmptyState.jsx`에서 **이동**(차트/표 공용 빈 상태).
- **`ChartTableToggle.jsx`** — portfolio `widgets/ChartTableToggle.jsx`를 **공용 승격**.
  - 기존 portfolio 동작 보존 + `tableMaxHeight`, `rowsPerPage` prop 추가(전체 이슈 표 스크롤/페이지 비분할용).

### portfolio — 호환 재노출 + import 경로 갱신
- `pages/portfolio/widgets/expandContext.js` → `components/chart/expandContext` **재노출**(기존 import 경로 유지).
- `pages/portfolio/widgets/EmptyState.jsx` → `components/chart/EmptyState` **재노출**.
- `pages/portfolio/widgets/ChartTableToggle.jsx` → `components/chart/ChartTableToggle` **재노출**.
  - → 기존 portfolio 위젯 ~20개(PortfolioMonthlyBurn 등) + `backoffice/.../UserListPaging.jsx`의 import 무수정 동작.
- `pages/portfolio/widgets/WidgetCard.jsx` — ExpandContext import를 `components/chart/expandContext`로 직접 갱신.
- `pages/portfolio/widgets/ChartBox.jsx` — EmptyState/useExpanded import를 `components/chart/`로 직접 갱신.
  - (컴포넌트 계층이 pages를 import하지 않도록 정리)

### 공용 Card 확장
- **`components/card/Card.jsx`** — `expandable` prop(기본 false) 추가.
  - true면 헤더 우측에 GrowDiagonalIcon 확장 버튼 + createPortal 전체화면(WidgetCard와 동일 패턴),
    `ExpandContext.Provider value={true}`로 children 감쌈 → ChartBox/ECharts(height:100%)가 전체화면에서 자동 확대.
  - `portfolio.common.expand`/`portfolio.common.close` i18n 재사용(이미 존재).
  - **기존 사용처 무영향**: expandable 미전달 시 fullscreen 상태/버튼/portal 모두 비활성(백오피스 폼 등 그대로).

### R3 진척율 차트 — 차트⇄표 토글 적용
- `pages/projectDetail/progress/ProgressSCurve.jsx` — 날짜 × 계획누적/실적누적 MD 표 + 토글.
- `pages/projectDetail/progress/ProgressBars.jsx` — 일정/완성/공수율(%) + MD환산(계획/기성/실투입) 표 + 토글.
- `pages/projectDetail/progress/ProgressStatusDistribution.jsx` — 상태 × 개수/공수 표 + 토글(개수/공수 모드 토글은 두 뷰 공통으로 유지).
- `pages/projectDetail/progress/ProgressPage.jsx` — S-curve/막대/상태분포 Card에 `expandable` 부여.

### R3 비용 차트 — 차트⇄표 토글 적용
- `pages/projectDetail/cost/CostBurnUp.jsx` — 월 × 월실집행/누적실집행 표 + 토글.
- `pages/projectDetail/cost/CostPlanActualBar.jsx` — 계획/실집행 금액 표 + 토글.
- `pages/projectDetail/cost/CostByRoleLevel.jsx` — 역할/레벨 × 계획/실집행/인원 표 + 토글(기존 role/level 토글과 공존).
- `pages/projectDetail/cost/CostPage.jsx` — Burn-up/계획실집행/역할레벨/이슈별 Card에 `expandable` 부여, 이슈별을 CostByIssue로 교체. (EVM/KPI 헤더 카드는 비차트라 확장 미부여.)

### R4 이슈별 비용 차트화
- **신규 `pages/projectDetail/cost/CostByIssue.jsx`** (구 CostIssueTable 대체):
  - **차트**: 상위 N(=15, cost desc, 0비용 제외) 가로 막대(ECharts horizontal bar). 막대 라벨/툴팁에 issueKey·summary·cost(통화 `utils/costFormat`).
  - **표(로우데이터)**: `byIssue` **전체 이슈**(상위 N 제한 없음, 0비용 포함). 컬럼 key/actualMd/cost/costPerMd 유지, `tableMaxHeight="50vh"` 스크롤 유지.
- `pages/projectDetail/cost/CostIssueTable.jsx` — **삭제**(미참조 dead code 제거).

## byIssue 소비 경로 (R5 shape 그대로)

소비 shape: `data.byIssue[{ issueKey, summary, statusKey, statusName, actualMd, cost, costPerMd }]`, `data.currency`.
(`getProjectCostSummary` 응답은 content 래핑 없이 루트 직접 노출 — 기존 CostPage 패턴 유지: `data.byIssue`.)

- **차트(CostByIssue)**: 백엔드가 cost desc 정렬·전체 이슈를 내려주므로 `issues.filter(cost>0).slice(0, 15)`로 상위 N. 0비용은 자동 후순위.
- **표(CostByIssue)**: `byIssue` 전체를 그대로 행으로 노출(상위 N 제한 없음).
- **costPerMd null 가드**: `issue.costPerMd == null ? '-' : formatCurrency(...)`. (백엔드 명시대로 0비용/actualMd=0이면 null).
- `statusKey`/`statusName`은 신규 선택 필드 — 이번 배치에서는 소비하지 않음(차트/표 요구 컬럼에 미포함). 후속 상태 뱃지/필터에 활용 가능.

## 신규 i18n 키 (kr/en 추가 후 merge 실행 완료)

`locales/kr/projectDetail.json` · `locales/en/projectDetail.json`:
- `...progress.bar`: `colMetric`, `colRate`, `totalPlannedMdLabel`, `earnedMdLabel`, `actualMdLabel`
- `...progress.sCurve`: `colDate`
- `...progress.status`: `colStatus`

`locales/kr/cost.json` · `locales/en/cost.json`:
- `planActual`: `colMetric`, `colAmount`
- `burnup`: `colMonth`, `colActual`, `colCumulative`
- `roleLevel`: `colMemberCount`
- `issue`: `calc`, `interp`

토글/확장 라벨은 기존 `portfolio.common.{viewChart,viewTable,expand,close}` 재사용(신규 없음).

**merge 실행**: `cd static/ui && npm run merge` 실행 완료 → `ko-KR.json`/`en-US.json`에 신규 키 반영 확인
(colMetric/colCumulative/colMemberCount/colDate/colStatus 등 grep 확인). ko-KR/en-US 직접 수정 없음.

## 검증 결과

- **`cd static/ui && npm test`**: PASS (5 suites / 50 tests / 1 snapshot). 스냅샷 깨짐 없음(-u 불필요).
- **`cd static/ui && npm run build`**: 성공("build folder is ready"). 컴파일 에러 없음.

## 비고 / 리더 확인 필요 사항

- 백엔드 R5 shape(byIssue 5+2필드)을 글자 그대로 소비. 계약 불일치 없음.
- `statusKey`/`statusName`은 응답에 존재하나 이번 UI 요구 컬럼이 아니라 미소비(선택 필드, 향후 확장 여지). 계약 위반 아님.
- 차트⇄표 토글은 portfolio와 동일 UX(`portfolio.common.viewChart/viewTable`). progress/cost 전용 토글 키는 신설하지 않고 portfolio 공용 키 재사용.
