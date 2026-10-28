# 요구사항 — 분석/리포트 탭 통합 + 테이블 디자인 공통화

## 배경
RFC-135(Portfolio 통합 대시보드) + 진척율(progress) + 비용분석(cost)이 최근 신규로 추가되면서
테이블 디자인이 제각각이고, 프로젝트 상세에서 진척율/비용 탭이 최상위에 흩어져 있다.

## 작업 (프론트엔드 전용 — 백엔드/응답 shape 변경 없음)

### 1. 탭 구조 변경 (`static/ui/src/constants/tabs.js`)
- 현재 `projectDetailTabs`의 최상위 탭 `projectProgress`(진척율), `projectCost`(비용)를
  `analysisReport` 그룹 탭의 **children**으로 이동.
- 이동 후 `analysisReport.children` 순서(권장): issueAnalysis → resourceAnalysis → projectProgress → projectCost.
- 기존 권한 제어 유지: progress/cost는 `canRender: () => canReadReport` 였음.
  → children으로 옮길 때도 동일하게 동작해야 한다. `analysisReport` 그룹 자체의 노출/권한 정책과
    children 권한이 어떻게 합성되는지 `CommonTab`/`ProjectDetailTabs` 확인 후 유지.
  (analysisReport 그룹은 현재 `canReadReport` 게이트가 명시돼 있지 않으니, children의 canRender가
   존중되는지 CommonTab 렌더링 로직을 보고 보존할 것.)
- 라벨/아이콘은 기존 것 그대로(ChartTrendIcon=progress, CoinsIcon=cost, i18n 키 동일).

### 2. 테이블 디자인 공통화 — 공통 컴포넌트 `CommonTable` 적용
기준 패턴: `static/ui/src/pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx`
는 이미 `components/table/CommonTable.jsx`를 사용한다. 나머지 테이블을 같은 방식으로 통일.

대상 (raw `@atlaskit/dynamic-table`을 직접 쓰는 테이블 → CommonTable 기반으로 교체):
- `static/ui/src/pages/projectDetail/progress/ProgressRiskTable.jsx`
- `static/ui/src/pages/projectDetail/cost/CostIssueTable.jsx`
- `static/ui/src/pages/portfolio/widgets/PortfolioProjectTable.jsx`
- `static/ui/src/pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` (signal 뷰의 DynamicTable)
- `static/ui/src/pages/portfolio/widgets/PortfolioCostOverrunRank.jsx`
- `static/ui/src/pages/portfolio/widgets/PortfolioUtilization.jsx`
- (확인 후 판단) `ChartTableToggle.jsx`, `ResourceAnalysisChart.jsx`, `WorklogDetailPanel.jsx`도
  DynamicTable을 쓰면 동일 기준 적용. 단 차트/특수 용도면 무리하게 바꾸지 말고 리포트에 사유 기록.

#### 주의 — CommonTable 현재 한계와 보강
`components/table/CommonTable.jsx` 현재 시그니처:
`{ head, rows, rowsPerPage=10, defaultPage=1, emptyMessage, isLoading }`
- `emptyView`를 받지 않고 `emptyMessage`만 받는다. (ResourceAnalysisTable이 `emptyView`를 넘기지만
  무시되는 잠재 버그가 있음 → 보강 시 정합 맞출 것.)
- 행 클릭(`rows[].onClick`), 정렬(`head.cells[].isSortable`)은 DynamicTable 기본 기능이라
  rows/head로 그대로 전달되면 동작한다.
- 일부 테이블은 sticky 스크롤(`overflowY:auto; maxHeight`)을 wrapper에 직접 줬다.
  → CommonTable에 선택적 `maxHeight`(또는 wrapper style) prop을 추가해 흡수하거나,
    필요한 곳만 wrapper로 감싸는 방식 중 일관된 한 가지를 택할 것.
- 토글 버튼/필터 같은 테이블 외부 컨트롤은 그대로 두고 표 부분만 공통화.

**CommonTable을 확장**해야 하면(권장: emptyView/emptyMessage 둘 다 수용 + 선택적 maxHeight),
기존 사용처(ResourceAnalysisTable 등)가 깨지지 않도록 하위호환 유지.

### 3. 제약
- i18n 키 신규 추가가 생기면 `locales/kr/*.json` + `locales/en/*.json`에 넣고 `npm run merge` 실행.
  (이번 작업은 대부분 기존 키 재사용이라 신규 키는 최소일 것)
- 백엔드 resolver/응답 shape은 건드리지 않는다. 테이블이 소비하는 데이터 shape도 그대로 유지.
- `cd static/ui && npm run build` 통과, `cd static/ui && npm test` 통과(스냅샷 갱신 필요 시 갱신).

## 완료 기준
- 진척율/비용이 "분석 및 리포트" 탭의 하위 탭으로 진입된다.
- 대상 테이블들이 CommonTable 공통 컴포넌트를 통해 일관된 디자인(여백/empty/로딩/정렬)으로 렌더된다.
- 빌드/테스트 통과.
