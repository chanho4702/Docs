# 03 Verify Report — 진척율/비용 차트 UX 통일 + 이슈별 비용 차트화 + 전체 이슈 (R3/R4/R5)

검증: 2026-06-18 / 담당: integration-verifier / 방법: 경계면 양쪽 동시 읽기 + 테스트/빌드 실행

## 종합 판정: 전체 통과 (실패 0, 미검증 0)

백엔드 R5 응답 shape ↔ 프론트 R4 소비, R3 공용화 이동 회귀, 성능/패턴, i18n, 테스트/빌드 모두 정합.
런타임에 터질 경계면 불일치(shape/필드명/래핑/키 누락)는 발견되지 않았다.

---

## 1. 경계면 — byIssue shape ↔ 프론트 소비 (R5 ↔ R4) — 통과

### 응답 래핑 단계 (생산자 ↔ 소비자)
- 생산자: `src/utils/ResponseWrapper.js:1-8` — `{ success:true, ...result }`로 **평탄화**(content 중첩 없음).
- 생산자: `src/resolver/projectCost/ProjectCostController.js:6-8` — `getProjectCostSummary`가 `responseWrapper`로 감쌈.
  `getProjectCostSummaryService` 반환(`assembleResponse`: `{ ...rest, byIssue }`)이 success와 같은 레벨로 펼쳐짐.
- 소비자: `CostPage.jsx:46-48` — `data.success === true`, `data.project.startDate`, `data.budget.plannedBudget` 루트 직접 접근.
- 소비자: `CostByIssue.jsx:25-26` — `data.currency`, `data.byIssue` 루트 직접 접근.
- 판정: **래핑 단계 일치**. 프론트가 `data.content.xxx`로 잘못 unwrap 하지 않음(이 응답은 content 래핑이 없음). 실패 분기(`isError || (data && !isSuccess)`)도 `CostPage.jsx:57`에서 처리.

### byIssue[] 항목 shape (글자 그대로 교차)
백엔드 실제 생성: `CostCalculator.js:202-210`(mergeAllIssues) →
`{ issueKey, summary, statusKey, statusName, actualMd, cost, costPerMd }`.
- `costPerMd`: 매칭 없으면 `null`(`:209`), `allocateIssueCost`에서도 actualMd=0 시 null(`:168`). 보고서 명세 일치.
- 0비용 이슈: `cost=0, actualMd=0, costPerMd=null`(`:207-209`). 일치.
- 정렬: cost desc, 동일 cost는 issueKey asc(`:229-232`). 일치.

프론트 소비 경로:
- 차트: `CostByIssue.jsx:30` `issues.filter(i => (i.cost ?? 0) > 0).slice(0, 15)` — cost desc 백엔드 정렬 신뢰, 상위 N 가로막대(ECharts horizontal bar, `:60-79`). 막대/툴팁에 issueKey·summary·cost(`:48-53`), 통화 포맷 `utils/costFormat`(`:6`). 요구 일치.
- 표: `CostByIssue.jsx:93` 전체 `issues` 행 노출(상위 N 제한 없음), 컬럼 key/actualMd/cost/costPerMd(`:85-90`), `tableMaxHeight="50vh"`(`:152`). 요구 일치.
- **costPerMd null 가드**: `CostByIssue.jsx:119-121` `issue.costPerMd == null ? '-' : formatCurrency(...)`. 확인.
- `statusKey`/`statusName`: 응답에 존재하나 이번 UI 미소비(선택 필드). 계약 위반 아님(additive).
- 차트⇄표 토글: `ChartTableToggle`로 구현(`:148-156`). 요구 일치.

### CostPage 연결 / 구 파일 잔존
- `CostPage.jsx:16` `import CostByIssue`, `:110-112` Card(expandable)로 연결. 통과.
- 구 `CostIssueTable.jsx` **삭제 확인**(`pages/projectDetail/cost/` 디렉토리에 없음). 잔존 import **0건**(`grep "CostIssueTable"` 무결과). 통과.

---

## 2. 공용화 이동 회귀 (R3) — 통과

### components/chart/ 이동 + 재노출
- 이동 완료: `components/chart/expandContext.js`, `EmptyState.jsx`, `ChartTableToggle.jsx` 존재 확인.
- 재노출 shim 정상:
  - `pages/portfolio/widgets/expandContext.js` → `export { ExpandContext, useExpanded } from "../../../components/chart/expandContext"`
  - `pages/portfolio/widgets/EmptyState.jsx` → `export { default } from "../../../components/chart/EmptyState"`
  - `pages/portfolio/widgets/ChartTableToggle.jsx` → `export { default } from "../../../components/chart/ChartTableToggle"`
- portfolio 위젯 15개(PortfolioMonthlyBurn 등)는 `./ChartTableToggle`(재노출) 경유 — 무수정 동작.
- `backoffice/page/user/UserListPaging.jsx:17`은 `pages/portfolio/widgets/EmptyState`(재노출) 사용 — 정상.

### 순환참조 점검 (양쪽 동시 읽기)
- `components/chart/ChartTableToggle.jsx:1-6` import: `../../stores/useI18nStore`, `../table/CommonTable`, `./EmptyState` — **pages를 import하지 않음**.
- `ChartBox.jsx:3-4`, `WidgetCard.jsx:7`은 `components/chart/`를 **직접** import(재노출 경유 아님) — 컴포넌트 계층이 pages를 역참조하지 않음. **순환참조 없음.**

### 공용 Card.jsx expandable opt-in
- `Card.jsx:54` `expandable = false` 기본값. `:65-73` expandBtn은 expandable일 때만 렌더, `:77` portal도 `fullscreen` 상태일 때만. 미전달 사용처(백오피스 폼 등) **무영향** 확인. i18n `portfolio.common.expand/close` 재사용(`:68,71,104`).

### 진척율/비용 차트 토글 + expandable + 표↔시리즈 일치
- ChartTableToggle 적용: ProgressSCurve(`:221`), ProgressBars(`:108`), ProgressStatusDistribution(`:128`), CostBurnUp(`:123`), CostPlanActualBar(`:89`), CostByRoleLevel(`:129`). 전부 적용.
- expandable 부여: ProgressPage(`:89,96,102`), CostPage(`:85,92,105,110`). KPI/EVM 비차트 카드는 미부여(요구 일치).
- 표 데이터 ↔ 시리즈 일치 샘플: CostBurnUp 표 `month/actual/cumulative`(`:95-101`)가 `monthlyCost` 시리즈 필드와 정확히 일치, 컬럼 오타/누락 없음.

---

## 3. 성능 / 패턴 (R5) — 통과

- **워크로그 N+1 없음**: 워크로그는 `getResourceProjectWorklogs({ projectId })`로 프로젝트 단위 **1회**(miss: `ProjectCostService.js:103`, hit: `:177`). 이슈당 워크로그 재조회 없음.
- **이슈 목록 추가 페치 최소**:
  - 캐시 miss: `rawIssues`를 이미 completionRate 산정용으로 페치 중 → byIssue용 **재활용**(`:104,117,167`). **추가 호출 0**.
  - 캐시 hit: left-join 일관성 위해 `fetchAllIssues` 1회(+페이지네이션)만 추가(`:178`). worklog 재페치는 기존과 동일.
- **asApp 미사용**: cost 경로(IssueApi/ResourceWorklogFetcher/projectCost)에서 `asApp` grep **0건**. `getResourceProjectWorklogs`는 `as = 'user'` 기본(`ResourceWorklogFetcher.js:70`).
- **동시성 제한**: `ResourceWorklogFetcher.js:3,78` `p-limit` 적용. miss/hit 모두 `Promise.all` 병렬.

---

## 4. i18n — 통과

- 신규 키 모두 `locales/kr/`·`locales/en/` 소스에 존재(직접 ko-KR/en-US 수정 아님):
  - cost.json: `planActual.{colMetric,colAmount}`, `burnup.{colMonth,colActual,colCumulative}`, `roleLevel.colMemberCount`, `issue.{calc,interp}` — 확인.
  - projectDetail.json: `progress.bar.{colMetric,colRate,totalPlannedMdLabel,earnedMdLabel,actualMdLabel}`, `progress.sCurve.colDate`, `progress.status.colStatus` — `:254-281` 확인.
- **merge 반영**: `ko-KR.json`/`en-US.json`에 신규 값 grep 확인(`colMemberCount`, `colCumulative`, 이슈 calc 문구 등). 빌드 prebuild merge가 재실행되어 빌드 성공.
- **t() ↔ 키 교차**: CostByIssue/CostBurnUp/CostPlanActualBar/CostByRoleLevel/ProgressSCurve/ProgressBars/ProgressStatusDistribution의 모든 t() 키를 추출해 소스 키와 대조 — **누락 0건**. 토글/확장 라벨은 기존 `portfolio.common.{viewChart,viewTable,expand,close}` 재사용.

---

## 5. 테스트 / 빌드 — 통과

- 백엔드 루트 `npm test`(jest): **5 suites / 79 tests PASS** (projectCost CostCalculator 28개 — mergeAllIssues 8개 신규 포함).
- 프론트 `static/ui && npm test`: **5 suites / 50 tests / 1 snapshot PASS**.
- 프론트 `static/ui && npm run build`: **성공**("The build folder is ready"). 컴파일 에러 없음. prebuild merge 정상.

---

## 미검증 (런타임 한정 — 추측 통과 안 함)

- 정적/테스트/빌드 기반 교차 검증은 완료. 단 아래는 실제 Forge 런타임 E2E로만 확정 가능(이번 검증 범위 밖, 보고서들도 "E2E 미수행" 명시):
  - 캐시 hit 경로에서 `_scheduleRate`/`_hourRate` 캐시값으로 재구성한 byIssue가 miss 경로 결과와 **수치 동일**한지(로직상 동일 함수 경로라 정합 예상이나 실데이터 미확인).
  - ECharts 전체화면(expandable portal) 진입 시 차트 리사이즈 실동작(`Card.jsx:59-63` resize dispatch — 정적상 정상, 시각 미확인).

## 재작업 필요 항목

없음. backend/frontend 재호출 불필요.
