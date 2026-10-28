# 요구사항 — 프로젝트 상세 진척율/비용 분석 UI 통일 + 이슈별 비용 차트화/전체이슈

통합대시보드(Portfolio)와 프로젝트 상세(진척율/비용)의 차트 UX를 통일하고,
이슈별 비용을 차트화하며 모든 이슈를 비용 계산 대상에 포함한다.

선행 완료(이번 배치 아님, 참고): 롤/레벨 카드 세로중앙배치, CostScatter 상단 잘림/정렬, WidgetCard 확장버튼.

## R3 (프론트) — 진척율/비용 차트 카드에 "확장" + "로우데이터(표)" 토글 통일
대상 페이지:
- `static/ui/src/pages/projectDetail/progress/ProgressPage.jsx`
- `static/ui/src/pages/projectDetail/cost/CostPage.jsx`
두 페이지는 공용 `components/card/Card.jsx`로 차트를 감싼다. 통합대시보드는
`pages/portfolio/widgets/WidgetCard.jsx`(전체화면 확장 portal) + `ChartTableToggle.jsx`(차트⇄표) +
`ChartBox.jsx`(확장 시 vh 높이) + `expandContext.js`(확장 컨텍스트)로 통일돼 있다.

해야 할 일:
1. **공용 `Card`에 확장(전체화면) 버튼 opt-in 추가** — `expandable` prop(기본 false, 기존 사용처 무영향).
   true면 헤더에 GrowDiagonalIcon 버튼 + createPortal 전체화면(WidgetCard/ChartCard 패턴 동일).
   진척율/비용 차트들은 ECharts를 `height:100%`로 쓰므로 전체화면 컨테이너에서 자동으로 커진다.
   - i18n 라벨: `portfolio.common.expand`/`portfolio.common.close` 재사용(이미 존재) 또는 공용 키 신설.
   - `expandContext.js`는 현재 `pages/portfolio/widgets/`에 있다. Card(컴포넌트 계층)가 쓰려면
     `static/ui/src/components/chart/expandContext.js`로 **이동**하고 portfolio(WidgetCard/ChartBox) import 경로를 갱신하라.
2. **차트별 "로우데이터(표)" 토글** — 통합대시보드 `ChartTableToggle`과 동일 UX.
   `ChartTableToggle`은 portfolio 전용 위치다. **공용으로 승격**(예: `components/chart/ChartTableToggle.jsx`)하거나
   동등한 공용 토글을 만들어 progress/cost 차트에 적용. (portfolio도 공용을 쓰도록 정리하면 더 통일적)
   대상 차트(각각 표 데이터 구성):
   - 진척율: `ProgressSCurve`(날짜별 계획/실적 누적 MD), `ProgressBars`(일정/완성/공수율 + MD환산),
     `ProgressStatusDistribution`(상태별 개수/공수).
   - 비용: `CostBurnUp`(날짜별 계획/실집행 등 시리즈), `CostPlanActualBar`(계획 vs 실집행),
     `CostByRoleLevel`(역할/레벨 × 계획/실집행). ※ CostByRoleLevel은 이미 role/level 토글 보유 — 표 토글과 공존.
   표 컬럼은 각 차트의 시리즈를 그대로 행/열로 옮긴다. 신규 i18n 키는 kr/en에 추가 후 merge.

## R4 (프론트) — 이슈별 비용 차트화 + 로우데이터 표
- `static/ui/src/pages/projectDetail/cost/CostIssueTable.jsx`(현재 표) →
  **상위 N개(비용 내림차순, 예: 15~20) 가로 막대 차트** + 차트⇄표 토글(표는 현행 컬럼 유지: key/actualMd/cost/costPerMd).
- 막대는 비용(cost) 기준, 가로(수평) bar. 막대 라벨/툴팁에 issueKey·summary·cost. 통화 포맷 `utils/costFormat`.
- 표(로우데이터)는 전체 이슈(상위 N 제한 없이) 노출, CommonTable 기반(이미 적용됨), maxHeight 스크롤 유지.
- 컴포넌트 명은 의미에 맞게(예: `CostIssuePanel`/`CostByIssue`) 조정 가능. CostPage 연결 갱신.

## R5 (백엔드) — 모든 이슈 비용 계산 (확정: 프로젝트의 모든 이슈 포함)
현재 `src/resolver/projectCost/`:
- `ProjectCostService.getProjectCostSummaryService` → `byIssue = allocateIssueCost(worklogs, salaryMap, ...)`
  (캐시 hit 경로는 `buildByIssue`).
- `CostCalculator.allocateIssueCost`는 **워크로그가 있고 salary가 있는 멤버**의 비용만 집계 →
  워크로그 없는 이슈는 byIssue에 아예 없음.

요구: **프로젝트의 모든 이슈**가 byIssue에 나오도록(워크로그 없는 이슈는 cost=0, actualMd=0).
- 프로젝트 전체 이슈 목록을 조회해야 한다. 기존 진척율/이슈분석에서 프로젝트 이슈를 가져오는 경로
  (예: `src/api/jira/issue/IssueApi.js`, JQL, ProgressService의 issues 산출)를 재사용/참고하라.
  진척율 응답(`getProjectProgressSummary`)이 이미 issues[]를 내려주니 그 조달 방식을 참고.
- 성능: **추가 워크로그 N+1 금지**(메모리 규칙: 기능별 전용 병렬 페처/프로젝트 단위 1회 페치).
  asApp 지양(사용자 컨텍스트). 이슈 목록 조회는 1회(필요 시 페이지네이션) 추가만 허용.
- allocateIssueCost 결과(워크로그 기반)에 전체 이슈를 left-join: 매칭되면 비용/actualMd, 없으면 0.
  이슈 메타(summary 등)는 전체 이슈 목록 우선.
- 캐시 정책 주의: byIssue는 캐시 제외(재구성). 전체 이슈 목록도 캐시 hit/miss 양 경로에서 일관 적용.
- `CostCalculator.test.js` 갱신/추가.

## 경계면 / 응답 shape
- `getProjectCostSummary` 응답의 `byIssue[]` 가 R5로 확장된다. **backend-engineer가 02_backend_report.md에
  실제 byIssue 항목 shape(필드명)을 글자그대로 기록** → frontend가 그대로 소비(R4 차트/표).
  현재 항목: `{ issueKey, summary, actualMd, cost, costPerMd }` (costPerMd는 0비용 시 null 유지 여부 명시).

## 제약
- i18n: kr/en에 키 추가 후 `cd static/ui && npm run merge`. ko-KR/en-US 직접수정 금지.
- 루트 `npm test`(백엔드) + `cd static/ui && npm test`/`npm run build` 통과.
- 데이터 shape 변경은 R5(byIssue)만. 나머지 차트는 표현계층(확장/토글)만 추가, 소비 shape 불변.

## 완료 기준
- 진척율/비용 차트 카드에 확장 버튼 + 표 토글이 통합대시보드와 동일 UX로 동작.
- 이슈별 비용이 상위 N 가로막대 + 표 토글로 보이고, 표에는 프로젝트 전체 이슈가 나온다(0비용 포함).
- 빌드/테스트 통과.
