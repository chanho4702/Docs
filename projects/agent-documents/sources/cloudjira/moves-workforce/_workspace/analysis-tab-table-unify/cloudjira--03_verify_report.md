# 03 검증 리포트 — 분석/리포트 탭 통합 + 테이블 디자인 공통화

- 작업 성격: **프론트엔드 전용 표현계층 리팩터링** (백엔드/응답 shape 변경 없음)
- 검증 일시: 2026-06-18
- 검증 방법: git diff 기반 변경 전후 교차 비교 + 생산자/소비자 양쪽 동시 읽기 + 테스트/빌드 실행
- 결론: **전 항목 통과**. 실패 0건. 미검증 1건(런타임 클릭/스크롤 동작은 코드 정합으로 추론, 실제 브라우저 E2E 미수행).

---

## 1. 요약

| 영역 | 판정 |
|------|------|
| 데이터 shape 불변 (회귀 방지) | 통과 |
| CommonTable 확장 하위호환 | 통과 |
| 탭 이동 + 권한 합성 (tabs.js / CommonTab) | 통과 |
| 백엔드 테스트 (jest 71) | 통과 |
| 프론트 테스트 (jest 50 + snapshot 1) | 통과 |
| 빌드 (prebuild merge 포함) | 통과 |
| i18n 신규 키 존재 + merge | 통과 |

---

## 2. 데이터 shape 불변 — 테이블별 교차 비교

각 테이블의 raw `@atlaskit/dynamic-table` → `CommonTable` 교체에서, 행/셀이 읽는 필드 경로가 변경 전후 동일하게 유지됐는지 git diff로 확인. **표현 계층만 바뀌고 데이터 접근 경로는 전부 보존됨.**

| 파일 | 소비 필드 경로 | shape 변경 | 비고 |
|------|---------------|-----------|------|
| `progress/ProgressRiskTable.jsx` | `issue.key/summary/assignee/dueDate/progressRate/delayDays/effortDeviationMd/statusKey/plannedMd` | 없음 | `progressUnmeasurable` 표기 로직 추가는 기존 필드만 사용(신규 소비 없음) |
| `cost/CostIssueTable.jsx` (신규파일) | `data.byIssue[].{issueKey,summary,actualMd,cost,costPerMd}`, `data.currency` | 없음 | 생산자 `CostCalculator.js:169` + `ProjectCostService.js` 와 정확히 일치 |
| `portfolio/widgets/PortfolioProjectTable.jsx` | `p.projectId/projectName/isStale/aggregatedAt/statusName/memberCount/actualMm/totalSalary/completionRate/scheduleRate/avgUtilization/diagnosisStatus` | 없음 | 변경 전에도 `emptyView` 사용 → 동작 동일 |
| `portfolio/widgets/PortfolioTsrSignalTable.jsx` | `sig.projectId/projectName/isStale/statusName/time.*/scope.*/resource.{level,costLevel,cpi,burnRate,utilization,totalSalary,memberCount}` | shape 불변, **소비 확장** | cost 신호열('c') 신규 소비 → 생산자 `portfolioAggregate.js:303-305`(`resource.{burnRate,cpi,costLevel}`)에 존재 확인 |
| `portfolio/widgets/PortfolioCostOverrunRank.jsx` (신규파일) | `r.{projectId,name,cpi,burnRate,completionRate,overrun}` | 없음 | 생산자 `costOverrunRank()` `portfolioAggregate.js:380-389` 와 일치 |
| `portfolio/widgets/PortfolioUtilization.jsx` | `utilization.{buckets,people,totalPeople,avgUtilization}`, `p.{accountId,displayName,util}`, `r.{projectName,accountId,displayName,util,band}` | 없음 | OverallView 명단 표만 CommonTable 교체, 차트/ChartTableToggle은 기존대로 |
| `portfolio/widgets/ChartTableToggle.jsx` | `tableHead/tableRows` (호출측 제공) | 없음 | `isFixedSize` 변경 전에도 사용 → CommonTable에 그대로 전달, 보존 |
| `analysisReport/issue/WorklogDetailPanel.jsx` | `data.worklogs[].{id,date,hours,md,author.{avatarUrl,displayName}}` | 없음 | invoke('getIssueWorklogDetail') 호출/응답 접근 무변경 |
| `analysisReport/resource/ResourceAnalysisChart.jsx` | `log.{issueKey,issueSummary,date,hours,md}` (WorklogRawTable) | 없음 | invoke('getResourceWorklogDetail') 무변경, 차트는 ECharts 유지(표만 공통화) |

판정: **통과**. 모든 교체가 `head`/`rows`/`emptyView`/`maxHeight`/`isFixedSize`로 1:1 매핑되며 데이터 필드 접근은 불변.

---

## 3. CommonTable 확장 하위호환 — `components/table/CommonTable.jsx`

생산자(CommonTable 시그니처) vs 소비자(각 호출처) 교차 확인:

- `emptyView ?? <p>{emptyMessage}</p>` — `emptyView` 우선, 미전달 시 `emptyMessage` 폴백. 기존 `emptyMessage`만 쓰던 사용처 무손상.
- `maxHeight` → wrapper에 `overflowY:auto + maxHeight` 적용. 변경 전 각 테이블이 wrapper div에 직접 주던 `overflowY:auto; maxHeight`를 동일하게 흡수(ProgressRiskTable 40vh / WorklogDetailPanel 26vh / ResourceAnalysisChart 28vh / CostIssueTable 50vh).
- `wrapperStyle`, `isFixedSize` 추가. `isFixedSize` 기본 false → ChartTableToggle만 true 전달(기존 동작 보존).
- `style = Object.keys(style).length ? style : undefined` — maxHeight/wrapperStyle 둘 다 없으면 인라인 스타일 미적용 → 기존 `.table-wrapper` CSS 그대로.

기능 보존 점검:
- 정렬 `isSortable`: head.cells로 그대로 전달 (CostIssueTable, Portfolio* 유지). 통과.
- 행클릭 `onClick`: rows[].onClick으로 그대로 전달 (PortfolioProjectTable/TsrSignal/OverrunRank navigate, ResourceAnalysisTable onSelectMember). 통과.
- sticky 스크롤 maxHeight: prop으로 흡수. 통과.
- empty 메시지/노드: emptyView 우선 처리. 통과.
- 로딩 isLoading: prop 유지 (ResourceAnalysisTable 사용). 통과.

판정: **통과**. 누락 기능 없음.

---

## 4. 탭 이동 + 권한 — `constants/tabs.js`, `components/tabs/CommonTab.jsx`

### 4-1. tabs.js
- `projectProgress`, `projectCost`가 최상위 → `analysisReport.children`로 이동. 통과.
- children 순서: issueAnalysis → resourceAnalysis → projectProgress → projectCost. 권장 순서 일치. 통과.
- `canRender: () => canReadReport` 유지(progress/cost 양쪽). 통과.
- 라벨/아이콘 보존: `ChartTrendIcon`=progress, `CoinsIcon`=cost, i18n 키 `projectDetail.tabs.progressAnalysis`·`cost.tab.label` 동일. 통과.

### 4-2. CommonTab.findActiveConfig (핵심 권한 게이트)
- 변경 전: 자식 active 시 `{ config: tab(부모), component: child.component }` → **부모 config 반환 → 자식 canRender 무시되는 버그**.
- 변경 후: `{ config: child, component: child.component }` → 자식 config 반환 → 자식 canRender 게이트 동작. **수정 정확.**
- 권한 합성 로직 검증 (`CommonTab.jsx:23-24`):
  - `canRender = config?.canRender ? config.canRender() : true`
  - progress/cost(canRender 있음) → `canReadReport` 평가 → REPORT 권한 없으면 `<NoPermissionPage/>` 렌더. 통과.
  - issueAnalysis/resourceAnalysis(canRender 없음) → `true` 폴백 → 정상 렌더. 통과(회귀 없음).
  - analysisReport 그룹 자체(canRender 없음)는 children 전용이라 직접 active 안 됨 — `getFirstKey`가 `children[0].key`(issueAnalysis) 반환.

판정: **통과**.

---

## 5. i18n 검증

| 키 | kr 소스 | en 소스 | merge(ko-KR/en-US) |
|----|---------|---------|--------------------|
| `portfolio.cost.tsr.costSignal` | O (portfolio.json:346) | O (portfolio.json:346) | O |
| `projectDetail.analysis.progress.risk.progressUnmeasurable` | O (projectDetail.json:283) | O (projectDetail.json:283) | O |

- 신규 키 모두 `locales/kr/*`·`locales/en/*`에 존재, merge 후 ko-KR.json/en-US.json에 반영됨. ko-KR/en-US 직접 수정 아님(merge 워크플로우 준수). 통과.

---

## 6. 테스트 / 빌드 실행 결과

| 검증 | 명령 | 결과 |
|------|------|------|
| 백엔드 jest | `npm test` (루트) | **71 passed / 5 suites** (백엔드 무관 변경 → 통과 정상) |
| 프론트 jest | `static/ui && npm test` (CI) | **50 passed + snapshot 1 passed / 5 suites** |
| 빌드 | `static/ui && npm run build` | **성공** (prebuild merge 자동 실행 포함, 번들 사이즈 경고는 기존 이슈로 변경과 무관) |

---

## 7. 미검증 (추측 통과 금지)

- **런타임 E2E (브라우저)**: 실제 화면에서 행 클릭 드릴다운/sticky 스크롤/툴팁 표시는 코드 정합(prop 전달·필드 경로)으로 보존을 확인했으나, 실제 브라우저 동작은 본 검증에서 수행하지 않음. 코드 레벨에서 회귀 요인은 발견되지 않음.

---

## 8. 결론

표현계층(raw DynamicTable → CommonTable) 리팩터링과 탭 재배치는 데이터 shape를 변경하지 않고 완료됨. CommonTable 확장은 하위호환을 유지하며, 탭 권한 게이트 버그(부모 config 반환)가 자식 config 반환으로 정확히 수정됨. 테스트/빌드 전부 통과. **재작업 필요 항목 없음.**
