# 대시보드 강화 (M1 + 히트맵 capacity + M6 토폴로지) — 통합 정합성 검증 리포트

> 검증 2026-08-13 / 기준: `01_architect_design.md` §2·§D5·§11·§13, `01a_leader_decisions.md`,
> `02_backend_report.md`(응답 shape 단일 진실), `02_frontend_report.md`
> 기준 커밋 `8dd1002`(develop) + 미커밋 워킹트리
> 방법: **생산자·소비자 동시 읽기**(백엔드 소스 ↔ 프론트 소비 코드) + 테스트/빌드 전량 실행. **코드 수정 0건.**

---

## 0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 9 영역 / 32 항목 | 지시된 중점 1~9 전부. 경계면 shape 불일치·권한 우회·규약 위반 **0건** |
| **실패(수정 권장, 경미)** | 2 | D-1 insight 쿼리 rejection 시 무안내 백지 차트 / D-2 표 뷰 헤더가 MD 값을 "개수"로 표기 |
| **관찰·문서** | 7 | O-1~O-7 (회귀 아님, 기존 관례 포함) |
| **미검증** | 5 | E2E·실환경 동작(자동 검증 수단 없음) |

**결론: 배포 차단 사유 없음.** D-1/D-2 는 데이터 정합·권한·왕복 수에 영향이 없고 **표시**에만 영향한다.
백엔드/프론트 리포트가 주장한 계약은 **전부 실코드로 재현 확인**했다(리포트를 신뢰하지 않고 양쪽 소스를 직접 대조).

---

## 1. 통과 — 경계면 교차 비교

### 1-1. `getDashboardIssueInsight` 루트 스프레드 ↔ 프론트 소비 — **통과** (중점 1)

| 축 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| 등록 | `ProjectDashboardController.js:68-69` `guardedDefine(resolver,'getDashboardIssueInsight',…)` | `hooks/useDashboardInsight.js:26` `invoke('getDashboardIssueInsight', { project_id })` | fnName·인자명 일치 ✓ (신규 컨트롤러 없음 → `src/index.js` 무변경이 맞다) |
| 래핑 | `guardedDefine` → `{ success:true, ...result }` (서비스가 `DashboardInsightService.js:192-216, 239-253` 에서 **평면 객체**를 반환) | `insight.counts` / `insight.statusDistribution` / `insight.project.dDay` / `insight.truncated` 직접 접근 | **`.content` 접근 0건**(레포 전역 grep 확인) ✓ |
| 실패 판정 | `{ success:false, error:{…} }` | `dashboardInsightAdapters.js:22` `isInsightUsable = insight?.success === true` (truthy 아님) | 명시 비교 ✓ |
| 인자 | — | `{ project_id }` 만. `coworkerFieldId` **미전달**(백엔드 §8-7 지시) | ✓ 첫 렌더가 선행 쿼리에 묶이지 않는다 |

**`'metrics' in` 판정 — 통과.** `dashboardInsightAdapters.js:18-19` 가 `'metrics' in insight` 단일 판정이고,
`SummaryPanel.jsx:78`·`ChartTemplate.js:362` 이 그 함수만 쓴다. 레포 전역에 **`metrics?.… ?? 0` 0건**(주석 2줄 제외).
`toPlannedVsActualChartData`(`:92`)는 `metrics` 부재 시 **null 반환** — 0 막대를 그리지 않는다. ✓

**`completionRate` 3자리 → 표시 포맷 — 통과.**
생산: `DashboardInsightService.js:245` `round1(rate*100)/100` (= 소수 **3자리**, 진척도 탭 `ProjectProgressService.js:128` 과 글자 그대로 동일).
소비: `dashboardInsightAdapters.js:31-32` `formatCompletionRate = (v*100).toFixed(1)` — **재계산·재반올림 없음**. `SummaryPanel.jsx:81` 이 그대로 쓴다. ✓
백엔드 테스트 `DashboardInsight.test.js:173` 이 `computeCompletion` 결과와의 동치를 고정한다.

**`truncated` 캡션 — 통과.** 위젯 하단(`ChartTemplate.js:337-339, 425-434`) + 진척률 타일 InfoTip(`SummaryPanel.jsx:87-93`) **양쪽**. 문구에 상한 2000 을 넣지 않았다(t() 보간 미지원 대응). ✓

### 1-2. 권한 게이팅 — **통과** (중점 2)

| 데이터 | 게이트 | 실코드 |
|---|---|---|
| `issues[]`·`counts`·`statusDistribution`·`project` | `DASHBOARD read`(가드) | `PermissionMap.js:198` `getDashboardIssueInsight: R('DASHBOARD','detail')` — **REPORT 로 넓히지 않았다** ✓ |
| `metrics` | `DASHBOARD read` **AND** `REPORT read` | `DashboardInsightService.js:163` `includeMetrics = canReadReport(principal)` → `:219` `if (!includeMetrics) return response;` — **키를 만들지 않는다** ✓ |

- `ReportAccess.js:39-40` 은 `CostAccess.js:28-29` 와 **문자 그대로 동형**(`isAdmin === true || resourceMap.REPORT.read === true`). `principal` 누락 → `undefined === true` = false = **fail-close** ✓
- Controller 가 `principal` 을 전달한다(`:69`) — 함정 3(조용한 metrics 소실) 회피 확인 ✓
- 게이트가 **페치보다 먼저** 판정돼 REPORT 없는 호출은 공휴일 KVS 를 조회하지 않는다(`:165-170`) ✓
- 테스트로 고정됨: `DashboardInsight.test.js:110`(`'metrics' in res === false`), `:122`(principal 누락 fail-close), `:138`·`:147`(보유/admin 제공)
- **형제 resolver 우회 점검(데이터 기준 grep)**: `computeCompletion`/`computeDiagnosisRates`/`diagnoseStatus` 호출부 전수 확인 → `ProjectProgressService`(`R('REPORT')`), `ProjectCostService`(`R('PROJECT_COST')`), `PortfolioAggregator`(스냅샷 배치), 신규 `DashboardInsightService`(REPORT 게이트). **신규 우회로 0건** ✓
- **`total_salary` 종전 게이팅 불변**: `ProjectDashboardController.js:35-40` `git diff` 상 **변경 0**. 신규 서비스는 `getSummaryDataService` 를 호출하되 `start_date`/`end_date` 만 읽고 `total_salary` 를 응답에 싣지 않는다(`DashboardInsightService.js:175-177`) ✓
- **`AddChartModal` 의 `isLevelBand` 유지**(함정 7): `AddChartModal.jsx:43-48` `if (req === 'PROJECT_COST') return canReadCost && !isLevelBand;` — 일반화하면서 조건 보존 ✓ (`dashboardWidgets.test.js:61-63` 이 `salary.requires` 를 고정)
- 프론트 `canRead('REPORT')`/`canRead('PROJECT_COST')` 는 `usePermissionStore.canRead(pageId)`(`:72-74`)의 리소스 카탈로그 키와 일치 ✓
- 템플릿 필터 변경(`some(isAllowed)`)의 결과 동일성 확인: `salary` 템플릿은 차트가 1개뿐이라 종전과 노출 결과가 같다 ✓

### 1-3. 히트맵 `capacity` 단위 환산 — **통과** (중점 3)

| 축 | 생산자 | 소비자 |
|---|---|---|
| 값 | `ProjectDashboardService.js:539-542` `data = [[date, Number(seconds)]]` — **초**, 기존 무변경 | `calendarHeatmapOption.js:88` 주석·`:109` `d[1]` |
| 용량 | `:508-513` `dailyCapacityHours = round1(memberCount × hourRate)` — **시간** | `ChartTemplate.js:223-224` `chartData.capacity?.dailyCapacityHours` 가 **`typeof === 'number'` 일 때만** 전달 |
| 환산 | — | `calendarHeatmapOption.js:48` `capacitySeconds = capacityHours * 3600`, 경계 `capacitySeconds * ratio`, 툴팁 `value / capacitySeconds`(`:143`) → **`sec / (hours*3600)`** ✓ |

- **기본값 주입 0건**: `?? 8` 류가 `ChartTemplate.js`·`calendarHeatmapOption.js` 어디에도 없다. `:111-113` 이 `typeof number && isFinite && > 0` 일 때만 비율 구간을 쓰고 그 외(키 부재/0/음수/NaN/문자열)는 `buildAbsolutePieces` **기존 절대 구간 폴백** ✓
- 백엔드 키 부재 조건 4종(`인원 0` / 행 없음 / hourRate 없음·0·음수 / 조회 실패)이 전부 `return null` → `...(capacity ? {capacity} : {})`(`:550`)로 **키 자체가 생기지 않는다** ✓
- **`lineStack` 무영향**: `capacity` 는 `case "heatmap"` 블록 안에서만 계산·부착된다(`:533-552`). `lineStack` 분기는 요약·설정을 **읽지도 않는다**(백엔드 테스트 ⑦) ✓
- **숫자 일치**: `resolveHeatmapCapacity` 가 `getSummaryDataService` 를 그대로 호출(`:502`) → 요약 타일(`SummaryPanel.jsx:53` `total_member_count`)과 **같은 SQL·같은 서비스**. 산정이 갈릴 수 없다 ✓
- 병렬화: `Promise.all([aggregateByDateService, resolveHeatmapCapacity])`(`:534-537`) — 지연 증가는 느린 쪽에 흡수 ✓

### 1-4. invoke 1회 공유 / 쿼리키 — **통과** (중점 4)

- `projectKeys.js:76` `dashboardInsight: (projectId) => ['dashboardInsight', projectId]` — **위젯 id(`item.i`) 미포함** ✓ (`dashboardItem` 과의 결정적 차이)
- 구독자 2종이 **같은 키**를 쓴다: `SummaryPanel.jsx:48`, `ChartTemplate.js:114-115`. TanStack Query dedupe → 위젯 k개여도 대시보드 진입당 invoke 1회 ✓
- `ChartTemplate` 은 insight 위젯일 때 기존 `getChartDataById` 쿼리를 `enabled:false` 로 끈다(`:106`) — 왕복 중복 없음 ✓
- 인라인 배열 쿼리키 0건. `queryKeyContract.test.js`·`queryKeyFactories.test.js` 포함 프론트 전량 통과 ✓
- `handleRefresh` 가 공유 키를 명시 무효화(`DashboardPage.jsx:210-213`) — 새로고침이 죽은 버튼이 되지 않는다 ✓

### 1-5. M6 포트폴리오 토폴로지 — **통과** (중점 5)

| 항목 | 확인 |
|---|---|
| 급여 필드 무접촉 | `portfolioAggregate.js:526-673` 및 `PortfolioTopology.jsx` 전문에 `salary`/`totalSalary`/`salaryBuckets`/`salaryPolicy` **참조 0건**(소스 정독 + grep). 위젯은 `buildPortfolioTopology` 산출물만 읽는다 ✓ |
| getter 트랩 테스트 **실재** | `__test__/portfolioAggregate.test.js:332-356` — `Object.defineProperty` 로 `projects[].totalSalary`·`members[].salary` 에 getter 를 심고 `expect(touched).toEqual([])` + 결과 JSON 에 sentinel `999` 부재까지 단언 ✓ (눈 검사가 아니라 **실행**으로 고정) |
| 신규 invoke·쿼리키 | `PortfolioTopology.jsx`·`graph/*` 에 `invoke`/`useQuery` **0건**(2건 매치는 전부 주석). 데이터는 `ResourceTab.jsx:95` 의 `projects={selectedProjects}` props ✓ |
| 기존 관계도 불가침 | `git status` 상 `pages/resource/allocation/` **변경 파일 0** — `allocationGraphOption.js`·`allocationScale.js`·`AllocationGraph.jsx`·그 테스트 전부 무변경 ✓ (리더 Q9 준수) |
| `ChartBox onEvents` additive | `ChartBox.jsx:11,39` — 파라미터 추가 + `onEvents={onEvents}` 전달뿐. 미전달 시 `undefined` 로 `echarts-for-react` 기본 동작(`onEvents \|\| {}`)과 동일 → **종전 호출부 8곳 동작 불변** ✓ |
| 상한 12/120 + hiddenCount 배너 | `portfolioAggregate.js:527-528` `TOPOLOGY_MAX_PROJECTS=12`·`TOPOLOGY_MAX_PEOPLE=120`(리더 Q6 값). `PortfolioTopology.jsx:217-261` 배너(`shown/total`) + "전체 표시"/"상위만 표시" 토글 ✓ |
| `capByRank` 원배열 순서 보존 | `capGraphScale.js:59` — 정렬본(`ranked`)이 아니라 **원배열을 필터**한다. 엣지 캐스케이드(`:60`)도 동일 keptKeys 기준 ✓ (함정 21 회피) |
| `portfolioCards` 등록 | `portfolioCards.js:28` `topology: 'topology'` + `ResourceTab.jsx:87` `cardId={PORTFOLIO_CARDS.topology}` — 죽은 접기 버튼 방지 ✓ (함정 17) |
| `accountId` dedup | `portfolioAggregate.js:559-591` `Map` dedup, 등장 순서 보존. 테스트가 노드 1/엣지 2 를 고정 ✓ |
| 툴팁 이스케이프 | `graphTooltip.js:11-23` `esc()` 를 title/line 이 내부에서 적용. `PortfolioTopology.jsx:175-180` 의 직접 조립부도 `esc()` 경유 ✓ |

### 1-6. 백지 차트 함정 / 3자 정합 — **통과** (중점 6)

- `DATA_TYPES`(9종) ⊆ `WIDGET_SPEC`(9종) — 누락 0. 신규 2종의 `allowedCharts` 는 `progressStatus:["pie","bar"]`(`dashboardTypes.js:71`), `plannedVsActual:["bar"]`(`:82`)이며 **둘 다 `CHART_OPTION_MAP`(`chartOptionMap.js:16-22`)에 존재** ✓
- 정합이 **테스트로 고정**됨: `constants/__test__/dashboardWidgets.test.js:22-35` — 이미 `renderer === 'echart'` 로 스코프가 좁혀져 있어 M5(`forceGraph`) 추가 시 거짓 실패하지 않는다 ✓ (리더가 지시한 축소 작업은 불필요 — 프론트 리포트 §M6-6-3 주장 확인)
- 어댑터 산출 shape ↔ 옵션 함수 입력 대조: pie → `{data:[{name,value}]}`(`pieChartOption` 입력 형태), bar → `{categories, seriesData, valueFormatter}` → `barChartOption.js:21-25` 이 `valueFormatter` 를 정식 파라미터로 받는다(MD 단위가 "건수"로 오표기되지 않음) ✓
- `ChartTemplate.js:213-214` `if (!optionFn) return {}` — 미등록 타입이 들어와도 죽지 않는다(폴백) ✓

### 1-7. 다중 shape 재사용 — `SummaryPanel` 이중 소스 — **통과** (중점 7)

`SummaryPanel` 은 이제 `getSummaryData`(기존)와 `getDashboardIssueInsight`(신규) **두 응답**을 함께 그린다. 같은 개념이 두 출처에서 갈리는 지점을 전수 대조했다.

| 타일 | 출처 | 백엔드 산정 경로 | 갈림 위험 |
|---|---|---|---|
| 투입 인원 | `data.total_member_count` (`getSummaryData`) | `ProjectDashboard.GETSUMMARY` `COUNT(DISTINCT pu.account_id)` | **없음** — insight 는 인원을 내주지 않는다 |
| 기간(`start ~ end`) | `data.start_date`/`end_date` | 동일 GETSUMMARY | **없음** |
| 남은 기간(D-day) | `insight.project.dDay` | `DashboardInsightService.js:176-177,202` 이 **같은 `getSummaryDataService`** 의 `end_date` 로 계산 | **없음** (단일 출처) |
| 히트맵 일일 용량 인원 | `chartData.capacity.memberCount` | 동일 `getSummaryDataService` | **없음** (§1-3) |
| 진척률 | `insight.metrics.completionRate` | `computeCompletion` — 진척도 탭과 동일 함수·동일 반올림 | **없음** (D1 요구 충족) |
| 지연 이슈 | `insight.counts.overdue` | `computeQueueFlags` OVERDUE 카운트 | 진척도 탭에 대응 지표 없음 |

**세 출처(요약 SQL / insight / 히트맵 capacity)가 인원·기간에 대해 모두 `getSummaryDataService` 단일 경로로 수렴한다.** 재집계·복제 0건.
`?? 0` 으로 부재를 삼키는 지점도 없다 — 부재는 타일 미렌더(`hasTotalSalary`·`hasProgress`) 또는 `"-"` 로 표현된다.

### 1-8. work-bulk-apply Codex 수정 4건 최종 상태 — **통과** (중점 8, 부차)

| 지적 | 요구 상태 | 실코드 | 판정 |
|---|---|---|---|
| R-F1 | 권한 우선 + 400 한정 + `error?.cause ?? error` | `bulkApply.js:122-126` — `isPermissionCode` → `isBadRequestCode && isTimeTrackingUnsupportedError(error?.cause ?? error)` → UNKNOWN, **순서·인자 모두 일치** | ✓ |
| R-F2 | `runBulkDelete` catch | `ProjectIssueTable.jsx:362-368` `catch { toast.showError(…) } finally { setIsDeleting(false); setIsDeleteOpen(false); clearSelection(); }` | ✓ |
| R-O2 | 제외 표식 issueKey 기반 | `bulkDelete.js:22-33`(`successKeys`) + `:40-44` `markIssuesDeleted(issues, issueKeys)` = `Set.has(issue?.key)`. 호출부 `ProjectIssueTable.jsx:338-345` 도 키 기반. **`Number.isInteger` index 방어 소멸** | ✓ |
| R-D2 | 설계서 §2-1/2-3 갱신 | `work-bulk-apply/01_architect_design.md:62`(부분 반환 계약으로 갱신) + `:84-88` "**변경됨 (2026-08-13)**" 블록(부분 write·역전 일정 트레이드오프 명시) | ✓ |

### 1-9. i18n — **통과** (중점 9)

- **스크립트 실측**: 변경/신규 프론트 9파일의 `t('…')` **정적 키 120개 전량**이 `locales/ko-KR.json`·`locales/en-US.json` **양쪽에 문자열로 존재**(누락 0).
- 동적 키(템플릿 리터럴) 11종도 개별 확인: `dashboard.widget.denied.{REPORT, PROJECT_COST, REPORT_REQUIRED, PROJECT_COST_REQUIRED, SALARY_POLICY_LEVEL_BAND}` · `dashboard.statusDist.{todo,inProgress,done}` · `portfolio.topology.status.{done,inProgress,todo}` — **전부 ko/en 존재** ✓
  (서버가 내려보내는 `denied.reason` 값 2종까지 커버돼 있어 "안내 문구가 키 문자열로 노출"되는 사고가 없다)
- kr/en **키 개수 동수**: `dashboard` 80/80 · `chartOptions` 35/35 · `portfolio` 279/279 · `projectDetail` 396/396 ✓
- `npm run merge` 산출물 반영 확인(위 키 조회가 곧 산출물 조회다). `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음, `locales/script/*.json` 미사용 ✓
- **하드코딩 한글 0건**(신규·변경 코드 라인 전수 스캔). 검출된 1건은 `AddChartModal.jsx:242` 로 **기존 코드**다(`git show HEAD` 로 확인, 이번 변경 아님 → O-5).

---

## 2. 실패 (수정 권장 — 경미, 배포 차단 아님)

### D-1. [중하] insight 쿼리가 **reject** 되면 안내 없이 백지 차트가 남는다

**파일**: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:342-370` (+ `:114`)

`useDashboardInsight` 의 `isError`/`error` 를 **소비하지 않는다**. `invoke` 가 reject 하는 경우(네트워크 실패, 게이트웨이 오류 등) `insight === undefined` 가 되어 아래 경로를 탄다.

```js
if (isInsightBusy) return null;
if (insight && insight.success === false) return t('dashboard.insight.error');  // insight 가 undefined 라 미도달
if (!insightOk) return null;                                                    // ← 여기서 null
```

`notice === null` + `isInsightBusy === false` → `ChartTemplate.js:410-417` 이 `option = {}` 인 `<ECharts>` 를 렌더한다 = **빈 사각형, 문구 없음**.
서버가 `{success:false}` 로 감싸주는 일반 경로(권한 거부·서비스 예외)는 정상 안내되므로 **드문 경로**지만, 백지 차트를 남기지 않는다는 F12 규약과 어긋난다.

**수정 방법** — 훅의 `isError` 를 받아 마지막 폴백을 에러 문구로 바꾼다(신규 i18n 불요, `dashboard.insight.error` 재사용).
```js
const { data: insight, isLoading, isFetching, isError } = useDashboardInsight(...);
// notice:
if (insight && insight.success === false) return t('dashboard.insight.error');
if (isError || !insight) return t('dashboard.insight.error');   // ← 추가 (기존 `if (!insightOk) return null` 대체)
```
`SummaryPanel` 은 같은 상황에서 `"-"` 를 그리므로 추가 조치가 필요 없다.

### D-2. [하] 표 뷰 헤더가 MD 값을 **"개수"**로 표기한다

**파일**: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:149-155` (헤더), `:198-207` (행)

차트 툴팁·축은 `valueFormatter`(`dashboardInsightAdapters.js:70-72`)로 "12.5 MD" 로 고쳤는데, **표 전환 뷰의 헤더는 공통 `dashboard.chartTemplate.table.header.common.count`("개수" / "Count")로 고정**돼 있다.
해당 위젯 2경우에서 값이 MD 인데 헤더가 "개수"다:
- `progressStatus` + `statusMode === 'byEffort'` (값: `todoMd/inProgressMd/doneMd`)
- `plannedVsActual` (값: `plannedTotalMd`/`actualTotalMd`)

거짓 단위 표기이며, 이 기능이 차트 쪽에서 막으려던 바로 그 오독이다.

**수정 방법** — `head` 의 두 번째 셀 라벨을 단위에 따라 고른다(신규 i18n 불요 — `dashboard.plannedVsActual.unit` 재사용).
```js
const isMdAxis = item.dataType === 'plannedVsActual'
    || (item.dataType === 'progressStatus' && statusMode === 'byEffort');
// cells[1].content = isMdAxis ? t('dashboard.plannedVsActual.unit') : t('…common.count')
```
⚠ 현재 `head` 의 `useMemo` 의존성이 `[item.chartType]` 뿐이므로(`:155`) `item.dataType`·`statusMode`·`t` 를 함께 넣어야 한다. (의존성 누락은 기존 코드의 성질이며 지금은 무해하지만, 위 수정과 함께 바뀐다.)

---

## 3. 관찰 / 문서 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-1** | `constants/__test__/dashboardWidgets.test.js:40` | `expect(spec.renderer).toBe('echart')` 한 줄은 M5(`renderer:'forceGraph'`) 추가 시 **거짓 실패**한다. 렌더러 집합으로 넓혀야 한다. (CHART_OPTION_MAP 정합 검사 `:22-35` 는 이미 스코프가 좁아 안전 — 리더 지시의 축소 작업은 불필요) |
| **O-2** | `PortfolioTopology.jsx:74` | 다중 배정 인력의 **테두리 색**을 `deterministicColor(person.accountId)` 로 준다. 프로젝트 노드가 같은 방식의 색을 쓰므로 "이 사람 = 저 프로젝트 색"으로 오독될 수 있다(실제로는 특정 프로젝트와 무관). 굵기만으로 구분하거나 중립색 테두리가 덜 헷갈린다. 판단은 설계 소관 |
| **O-3** | `layeredGraphOption.js:130` | `categories` 를 series 에 넘기지만 **legend 를 그리지 않는다**. 노드 색이 전부 `itemStyle` 명시라 동작 영향 0. 층 이름(인력/프로젝트/작업상태)이 화면에 표기되지 않는 점만 기록 |
| **O-4** | `hooks/useDashboardInsight.js:29` | `keepPreviousData: true` 는 TanStack Query **v5(5.95.2)에서 무효**다(`placeholderData: keepPreviousData` 로 대체됨). 레포 전역 40곳이 같은 형태라 **기존 관례를 따른 것**이며 이번 변경의 결함이 아니다. 정리한다면 별도 이슈 |
| **O-5** | `AddChartModal.jsx:242` | 하드코딩 한글(`… 를 먼저 선택해주세요`). `git show HEAD` 로 **기존 코드**임을 확인 — 이번 변경 아님 |
| **O-6** | `work-bulk-apply/01_architect_design.md` §2-4 | 1차 리포트 O-4(`useBulkApply` 시그니처에 `groupKey` 없음)가 **아직 미갱신**. 지시 범위(§2-1/2-3)는 갱신됐다 |
| **O-7** | `SummaryPanel.jsx:81` | `metrics` 는 있으나 `completionRate` 가 숫자가 아닌 이론상 경우 `"-%"` 로 렌더된다(백엔드 계약상 도달 불가). 기록만 |

**범위 밖 변경 감지(참고)**: 워킹트리에 `src/resolver/gantt/GanttService.js`·`useGanttMutations.js`·`useJiraUserInfos.js`·`pages/projectDetail/issue/**` 변경이 함께 있다. 이는 **work-bulk-apply 트랙**의 산출물이며 그쪽 `03_verify_report.md`(2차)에서 검증됐다. 이번 검증 범위와 파일 충돌 없음(대시보드 트랙은 그 파일들을 건드리지 않았다).

---

## 4. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **76 suites / 1177 tests 통과** (exit 0). `test/permission/permissionMap.contract.test.js` 포함 → 신규 resolver 의 `PermissionMap` 등록이 계약으로 확인됨 |
| 프론트 전량 | `cd static/ui && npx jest` | **81 suites / 1357 tests 통과, 스냅샷 1 통과** (exit 0). 골든 픽스처 스냅샷 **무변경** = 기존 포트폴리오 집계 회귀 0 |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `bundle:check` → `main.98cf82cd.js` **gzip 432,925B / budget 950,000B, withinBudget: true** |

프론트 리포트 §4·§M6-4 의 수치와 **완전 일치**(재현됨). 백엔드 리포트 §7 대비 suites 76/tests 1177 은 병행 트랙(`GanttScheduleUpdate.test.js` 등) 증가분이며 실패 0.

> ⚠️ 빌드 통과 ≠ 정상 동작. 위 §1 의 교차 비교로 shape·권한 정합을 별도 확인했다.

---

## 5. 미검증 (추측으로 통과 처리하지 않음)

1. **실 Jira E2E 전반** — `getDashboardIssueInsight` 의 실제 JQL(`moves_RMS_projectId = "<uuid>"`) 결과 건수·`truncated` 발동·팀 관리형 프로젝트에서의 이슈 프로퍼티(coworkers) 수신은 배포 후에만 확인 가능하다.
2. **모듈 스코프 60초 캐시의 실효** — Forge 다중 인스턴스라 적중률은 런타임 의존이다(코드·단위 테스트로 로직만 고정). 1차 방어선인 프론트 공유 쿼리키는 코드로 확인됨.
3. **히트맵 비율 구간의 실데이터 색 분포** — 5명×8h=40h 경계는 단위 테스트로 고정(초 환산)했으나, 실제 프로젝트에서 색이 "정보를 주는지"는 실화면 판단이 필요하다(요구의 목적 자체가 시각적 판독).
4. **T2 3열 레이아웃의 세로 길이 / 다크 모드 실화면** (리더 Q6 가 E2E 체크리스트로 미룬 항목) — jsdom 에 레이아웃이 없어 jest 로 검증 불가. 상한 12/120 에서 `_rowCount` 기반 높이(최대 1100px)가 읽히는지 실화면 확인 필요.
5. **REPORT 회수 설치의 실제 화면** — `metrics` 부재 시 KPI 타일 미렌더·`plannedVsActual` 안내 문구는 코드·테스트로 고정했으나, 권한 세트를 실제로 바꾼 사이트에서의 확인은 미수행.

---

## 6. 재작업 지시 요약

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| 권장 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:342-370` | **D-1.** `useDashboardInsight` 의 `isError` 를 받아 `if (!insightOk) return null` 을 `dashboard.insight.error` 반환으로 교체. 현재는 쿼리 reject 시 문구 없는 백지 차트가 남는다 |
| 권장 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:149-155` | **D-2.** 표 뷰 헤더를 단위에 맞춰 분기(`plannedVsActual`·`progressStatus/byEffort` → `dashboard.plannedVsActual.unit`). `head` useMemo 의존성에 `item.dataType`·`statusMode`·`t` 추가 |
| 선택 | frontend (M5 착수 시) | `static/ui/src/constants/__test__/dashboardWidgets.test.js:40` | **O-1.** `expect(spec.renderer).toBe('echart')` → 렌더러 집합 허용으로 확장(M5 전에 하면 거짓 실패 예방) |
| 선택 | frontend | `static/ui/src/pages/portfolio/widgets/PortfolioTopology.jsx:74` | **O-2.** 다중 배정 테두리 색을 중립색으로(프로젝트 색과의 오독 방지) — 설계 판단 |
| 문서 | — | `_workspace/work-bulk-apply/01_architect_design.md` §2-4 | **O-6.** `useBulkApply` 시그니처에서 `groupKey` 제거 반영(1차 O-4 잔존) |

---
---

# § M5 검증 (2차 추기) — 프로젝트 상세 관계 토폴로지 (T1)

> 검증 2026-08-13 / 1차 검증(M1 + 히트맵 + M6) **이후 추가분**
> 기준: `02_backend_report.md` **§11**(확정 계약 — 설계서 §13-2-B 를 대체), `02_frontend_report.md` **§M5**(+ M6 개정 §R1~R8),
> `00_input/addendum_topology.md` **보강 2·3·4**, `01a_leader_decisions.md` Q5·Q7
> 범위: 백엔드 `getProjectRelationGraph` + `TopologyIssueFetcher` + `RelationGraphService` + `singleEntryPromiseCache` 공용화 /
> 프론트 `TopologyWidget` + `topologyGraph.js` + `useProjectRelationGraph` + ChartTemplate·레지스트리 확장
> 방법: 생산자·소비자 동시 읽기 + 테스트/빌드 전량. **코드 수정 0건.** 병행 작업 없음.

## M5-0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 7 영역 / 28 항목 | 지시된 중점 1~7 전부. 경계면 shape·엣지 kind 문자열·권한·캐시 무회귀 불일치 **0건** |
| **실패(수정 권장, 경미)** | 1 | D-M5-1 소속 엣지 툴팁이 **없는 i18n 키**를 참조 → 원시 키 문자열 노출 |
| **관찰** | 6 | O-M5-1~6 (회귀 아님) |
| **미검증** | 4 | 실환경 E2E |

**결론: 배포 차단 사유 없음.** 1차 리포트의 D-1·D-2 는 **둘 다 해소 확인**(아래 M5-8).

---

## M5-1. 경계면 — 입력 키 / 응답 shape / 엣지 kind (중점 1) — **통과**

### 입력 키 `projectId` (다른 대시보드 resolver 는 `project_id`)

| 축 | 실코드 | 판정 |
|---|---|---|
| 서버 기대 | `RelationGraphService.js:282` `({ projectId, principal })`, 없으면 `PROJECT_ID_REQUIRED` throw | — |
| 가드 스코프 | `permissionGuard.js:44` `const pid = payload?.projectId ?? payload?.project_id;` — **두 이름 모두 유효**, `projectId` 로 고정한 것이 안전 | ✓ |
| 훅 흡수 | `useProjectRelationGraph.js:22` `invoke('getProjectRelationGraph', { projectId })` — 파라미터 이름 변환이 **훅 안에서만** 일어난다 | ✓ |
| 호출부 | `ChartTemplate.js:134` `useProjectRelationGraph(project_id, …)` — 앱 표준 변수명을 위치 인자로 넘긴다 | ✓ |
| **혼용 여부** | `getProjectRelationGraph` 문자열이 등장하는 프론트 파일 **전수 grep**: 훅 1곳 + 주석 2곳뿐. `{ project_id }` 로 부르는 지점 **0건** | ✓ |

### 루트 스프레드 ↔ 소비

- 서버가 `{ generatedAt, hourRate, scanned, truncated, project, ...graph }`(`RelationGraphService.js:299-306`)를 **평면**으로 반환 → `guardedDefine` 이 `success` 만 덧붙인다.
- 소비: `ChartTemplate.js:138` `relationGraph?.success === true`, `:390` `relationGraph.nodes`, `TopologyWidget.jsx:47-48` `graph?.nodes`/`graph?.edges`, `:170` `graph?.edgeKindCounts`, `:195,203` `graph?.truncated`/`outOfScopeEdgeCount`.
  **`.content` 접근 0건** ✓

### 엣지 5종 kind — 문자열 대조 (생산 ↔ 스타일 매핑)

| kind | 서버 생산 | 프론트 |
|---|---|---|
| `ROOT_SPACE` | `RelationGraphService.js:63,191` | `topologyGraph.js:25` `STRUCTURE_KINDS` |
| `SPACE_ISSUE` | `:64,198` | `topologyGraph.js:25` |
| `SUBTASK` | `:65,217` | `topologyGraph.js:22,35` `RELATION_KINDS`·`EDGE_STYLE` |
| `ISSUE_LINK` | `:66,236` | `topologyGraph.js:22,36` |
| `WORKFORCE_PARENT` | `:67,215` | `topologyGraph.js:22,37` |

**5종 전부 문자열 일치.** `EDGE_STYLE` 키 3 + `STRUCTURE_KINDS` 2 = 서버 `EDGE_KINDS` 5 와 **집합이 정확히 같다**(누락·오타 0).
노드 kind 도 동일: 서버 `'PROJECT'|'SPACE'|'ISSUE'`(`:133,137,149`) ↔ 프론트 `NODE_CATEGORY`(`topologyGraph.js:19`) + `TopologyWidget.jsx:86,99` 분기 ✓
미등록 kind 는 `styleEdge`(`topologyGraph.js:151-153`)가 소속 스타일로 폴백 — 서버가 종류를 늘려도 선이 사라지지 않는다 ✓

---

## M5-2. 중복·누락 엣지 (중점 2) — **통과**

| 규칙 | 실코드 | 테스트 |
|---|---|---|
| `linkId` dedup | `RelationGraphService.js:234` `id = linkId ? \`ISSUE_LINK:${linkId}\` : \`ISSUE_LINK:${typeName}:${source}>${target}\`` + `:183` `seenEdgeIds` | `RelationGraph.test.js:204`(양쪽 실림 → 1개), `:216`(linkId 없을 때 폴백 dedup) |
| 폴백 키의 대칭성 | outward(A 관점)·inward(B 관점) 모두 `source=A,target=B` 로 정규화(`:91,94`)되므로 **폴백 키도 양방향에서 같다** — 검증 완료 | `:216` |
| `wbsParent === jiraParent` → 1개 | `:217` `if (jiraIn && jira !== wbs) addEdge('SUBTASK', …)` | `:175`(같으면 WORKFORCE_PARENT 하나), `:162`(다르면 둘 다) |
| Blocks 이중 표시 0 | `EDGE_KINDS` 에 **`BLOCKS` 없음**(`:62-68`). 링크는 타입 구분 없이 `ISSUE_LINK` 한 경로(`:220-240`), `typeName` 은 표시용. 프론트도 Blocks 재필터 **0건**(`topologyGraph.js` 전문 확인) | `:184` (전 타입이 `ISSUE_LINK` 하나로) |
| 자기참조 폐기 | `:181` `source === target` return + `:224` `sourceKey === targetKey` continue | `:227` |
| 빈 wbsParent 해제 | `:74-77` `trim()` 없으면 null(GanttMapper 정규화 동일) | `:236` |
| 집합 밖 엣지 | 상위 2경로(`:212-213`) + 링크(`:226-229`) 멤버십 검사 후 `outOfScopeEdgeCount` | `:248` |
| 프론트 이중 필터 금지 | `topologyGraph.js` 는 dedup·자기참조·범위 판정을 **하지 않는다**(서버 결과를 그대로 그린다) | — |

> ⚠ **`typeName` 판정 준수**: 프론트가 `relation` 을 판정에 쓰지 않는다 — `styleEdge`(`:161-162`)는 `_typeName`·`_relation` 을 메타로만 싣고, 툴팁(`TopologyWidget.jsx:154`)은 **`_typeName` 만** 읽는다. `topologyGraph.test.js:195` 가 이를 고정한다. ✓

---

## M5-3. 크기 집계 (중점 3) — **통과**

| 항목 | 실코드 | 판정 |
|---|---|---|
| 루트·스페이스 rollup 이 **상한 이전** 전체 합인가 | `TopologyWidget.jsx:56` `rollupEffort(nodes)` — 인자가 **`graph.nodes`(원본)** 이지 `selection.nodes`(상한 적용본)가 아니다 | ✓ 잘려도 총량 불변 |
| 그룹 키 일치 | 이슈 `projectKey`(서버 `:153`) ↔ 스페이스 `key`(서버 `:136`) ↔ `effort.bySpace.get(node.key)`(`:105,110`) — 세 값이 같은 Jira 프로젝트 키 | ✓ |
| `actualMd = 0` → 디폴트 크기 | `capGraphScale.js:106-110` `usable(v) = number && finite && v > 0`, 아니면 `defaultSize(14)` 반환. `MIN_MEASURED_NODE_SIZE(16)` 보다 **작지만 0 이 아니다** | ✓ 축소·숨김 없음 |
| 축별 sizer 분리 | `TopologyWidget.jsx:79-80` 이슈용·스페이스용 **별도** `createNodeSizer`. 루트는 고정 46 | ✓ 단위 혼합 없음 |
| 상한 랭킹 = `actualMd` | `topologyGraph.js:119` `(b.actualMd ?? 0) - (a.actualMd ?? 0)` → 동률 시 관계 차수 → key asc | ✓ (설계의 `degree` 랭킹에서 바꾼 것 — 목적이 "비용이 큰 노드 식별"이므로 타당) |
| 원배열 순서 보존 | `:127` 정렬본이 아니라 `connected.filter(keep.has)` | ✓ |
| 루트·스페이스 불가침 | `:106` structure 는 필터·상한 대상에서 제외 | ✓ (`topologyGraph.test.js:112` 고정) |
| 서버가 rollup 하지 않음 | `RelationGraph.test.js:296` 이 "산하 합 미집계"를 고정 | ✓ 같은 수를 두 곳에서 유지하지 않는다 |

---

## M5-4. 권한 (중점 4) — **통과**

| 축 | 실코드 |
|---|---|
| PermissionMap 등록 | `PermissionMap.js:207` `getProjectRelationGraph: R('PROJECT','detail')` — 섹션 주석 `9 → 10` 갱신. 이 컨트롤러에서 **유일한 비-DASHBOARD 매핑**(§13-D8 · 리더 Q7) ✓ |
| 계약 테스트 | 루트 `npm test` 의 `permissionMap.contract.test.js` 통과 = 등록집합 ↔ 매핑집합 일치 ✓ (미등록이면 런타임 `PERMISSION_UNMAPPED`) |
| principal 전달 | `ProjectDashboardController.js:85-86` `({payload, principal}) => getProjectRelationGraphService({...payload, principal})` → `RelationGraphService.js:291` `viewerId: principal?.accountId ?? null` ✓ |
| 프론트 `requires` 실키 여부 | `ResourceCatalog.js:48` `{ key:'PROJECT', section:'WORKFORCE', … member: rf }` — **실재 카탈로그 키**이고 `usePermissionStore.canRead('PROJECT')` 가 읽는 그 키다. 존재하지 않는 키라 항상 false 가 되는 위험 없음 ✓ |
| 서버·프론트 판정 동일값 | `dashboardWidgets.js:51-56` `requires:'PROJECT'` ↔ 서버 `R('PROJECT','detail')` — **판정 두 벌 아님**. `dashboardWidgets.test.js:74` 가 값을 고정 ✓ |
| 시드 기본 노출 불변 | `PROJECT` 는 `member: rf`(read=true) + 프리셋 4종 전부 WORKFORCE 섹션 read 부여(`SeedData.js:103-138`) → **기본 설치에서 위젯 노출 차이 0** ✓ |
| 데이터 우회 방지 | `DASHBOARD read` 만 가진 설치에서 이 resolver 는 **거부**된다(작업관리/간트 데이터가 대시보드로 새지 않는다) ✓ |

> 프론트 지시(`requires:null`)와 다르게 `'PROJECT'` 로 넣은 판단(§M5-3 판단 2)은 **옳다** — `null` 이면 PROJECT 회수 설치에서 위젯을 만들 수 있고 만든 뒤 서버 거부로 백지가 된다. 지금은 모달에서 숨고, 이미 배치된 위젯은 `dashboard.widget.denied.PROJECT` 안내를 낸다(키 존재 확인).

---

## M5-5. 캐시 공용화 무회귀 (중점 5) — **통과**

`DashboardIssueFetcher` 의 인라인 캐시가 `createSingleEntryPromiseCache` 로 교체됐다. **동작 5성질을 diff 로 1:1 대조**했다.

| 성질 | 교체 전 (`DashboardIssueFetcher` 구코드) | 교체 후 (`singleEntryPromiseCache.js`) |
|---|---|---|
| viewerId 없음 → 캐시 미사용 | `if (!viewerId) return await fetchDashboardIssues(...)` | `:31` `if (!key) return await loader();` — 호출부가 `viewerId ? key : null` 로 넘긴다(`:132-134`) |
| TTL 판정 | `now - cached.at < TTL_MS` | `:34` **동일 식**, `ttlMs: TTL_MS(60s)` 주입 |
| 엔트리 1개 | 단일 `let cached` | `:28` 클로저 단일 `cached` |
| Promise 저장(동시 진입 1벌) | `cached = {key, at, promise}` | `:36-37` **동일** |
| 실패 미캐시 | `catch → if (cached.promise === promise) cached = null; throw` | `:41-43` **동일**(참조 비교까지 같다) |
| 외부 폴백 | `try/catch` 로 `EMPTY` 반환 | 호출부에 그대로 남음(`:127-131,135-138`) |

- **기존 12 케이스 전부 통과**(페이징·상한·요청 본문·캐시 5종·실패 2종) — `DashboardIssueFetcher.test.js` 무변경으로 통과했다는 것이 동작 무변경의 증거다.
- **엔트리 비공유 확인**: `createSingleEntryPromiseCache()` 가 **모듈마다 호출**되어 각자 클로저를 갖는다(`DashboardIssueFetcher.js:71`, `TopologyIssueFetcher.js:64`). 두 페처가 같은 엔트리를 덮어써 서로의 결과를 반환하는 사고가 구조적으로 불가능 ✓ (`RelationGraph`/`TopologyIssueFetcher` 테스트 ⑧ 이 이를 고정)
- `ProjectParticipantFetcher`(`src/api/jira/`)는 **건드리지 않았다** — 회귀 면적을 넓히지 않는 판단으로 타당 ✓
- 공통 페처 무변경 재확인: `git status` 상 `src/api/jira/**`·`projectIssue`·`gantt` 변경 **0건** ✓

---

## M5-6. M6 무회귀 (중점 6) — **통과**

- **`forceGraphOption.js` 자체 무변경**(`git status` 미등재) — M5 는 확장 없이 **재사용만** 했다. 설계상 가장 위험한 "공용 빌더를 M5 요구로 고치다 M6 를 깨뜨리는" 경로가 애초에 발생하지 않았다 ✓
- **per-edge `lineStyle` 통과 계약 테스트 실재**: `graph/__test__/graphModules.test.js:236-252` — `expect(series.links).toBe(styled)`(**참조 동일성**, 가장 강한 형태) + `lineStyle.type === 'dashed'` + `_edgeKind` 보존. 주석이 "M5 의 종류 구분과 M6 의 프로젝트 색이 같은 통로"임을 명시 ✓
- **골든 픽스처 스냅샷 무변경**(전량 실행에서 `Snapshots: 1 passed`) · `costGate.test.js` 통과 · 급여 getter 트랩 테스트 유지 ✓
- `dashboardWidgets.test.js` 의 `expect(spec.renderer).toBe('echart')` → **알려진 렌더러 집합 검사로 확장**(`:41-47`) — 1차 리포트 O-1 해소. 오타 렌더러는 여전히 걸린다(검사를 없애지 않았다) ✓
- 경로 이중화 방지 테스트 추가: `'graph' in CHART_OPTION_MAP === false`(`:79-81`) ✓ — `renderer:'forceGraph'` 위젯이 옵션 맵을 타지 않음을 고정

---

## M5-7. 썸네일 PNG / i18n / 하드코딩 (중점 7) — **통과**

- **PNG**: `static/ui/src/utils/image/graphChart.png` — 유효 PNG 시그니처, **160×100, 742B**. 기존 썸네일 중 **가장 작다**(barChart 3,112B ~ lineStack 11,264B). CRA 자산 인라인 임계(10KB) 아래라 data URI 로 들어가며 번들 영향은 무시 가능 — 실제로 main gzip 432,930B(M6 개정 시점 432,924B 대비 **+6B**) ✓
- **AddChartModal 경로 성립 확인**: `DATA_TYPES.relationGraph.allowedCharts = ['graph']`(`dashboardTypes.js:94`) ↔ `CHART_TYPES` 에 `graph` 항목 추가(`:129-134`). 한쪽만 있었다면 **차트 유형을 고를 수 없어 위젯 생성이 불가**했다 ✓
- **i18n**: M5 신규/변경 4파일의 `t()` **정적 키 78개 전량**이 `ko-KR.json`·`en-US.json` 양쪽에 존재(누락 0). `dashboard.widget.denied.PROJECT` · `topology.legend.{SUBTASK,ISSUE_LINK,WORKFORCE_PARENT}` 동적 키도 확인. kr/en **동수**: `dashboard` 103/103, `chartOptions` 39/39 ✓ merge 산출물 반영 확인(위 조회가 곧 산출물 조회)
- **하드코딩 한글 0건** (신규 3파일 전수 스캔 — 검출 1건은 JSX 주석)

---

## M5-8. 1차 리포트 지적 해소 확인

| 지적 | 상태 | 실코드 |
|---|---|---|
| **D-1** insight reject 시 백지 차트 | **해소** | `ChartTemplate.js:121` `isError: isInsightError` 수신 → `:409` `if (isInsightError) return t('dashboard.insight.error')`. 신규 i18n 키를 만들지 않고 기존 키 재사용 ✓ |
| **D-2** 표 뷰 헤더가 MD 를 "개수"로 | **해소** | `head` useMemo 에 `isMdValued` 분기 + 값 라벨 `dashboard.plannedVsActual.unit`. **의존성에 `item.dataType`·`statusMode`·`t` 추가** — 축 토글 시 헤더가 갱신되지 않던 문제까지 함께 해소 ✓ |
| **O-1** 렌더러 테스트 확장 | **해소** | 위 M5-6 |
| **O-2** 인력 노드 테두리 해시색 | (M6 개정에서 `palette[3]` 고정 테두리로 정리됨) | `02_frontend_report.md` §R-3 |

토폴로지 위젯도 같은 규약을 따른다: `ChartTemplate.js:387` 이 `isRelationError || relationGraph?.success === false` **두 얼굴**을 함께 처리하고, 이슈 0건은 `dashboard.topology.empty` 로 끝낸다(`:390-391`) — 백지 위젯이 남지 않는다 ✓

---

## M5-9. 실패 (수정 권장 — 경미)

### D-M5-1. [하] 소속 엣지 툴팁이 **존재하지 않는 i18n 키**를 참조한다

**파일**: `static/ui/src/pages/projectDetail/dashboard/widgets/TopologyWidget.jsx:151-158`

```js
edge: (data) => {
    const label = t(`dashboard.topology.legend.${data._edgeKind}`);   // ← ROOT_SPACE / SPACE_ISSUE 는 키가 없다
```

`dashboard.topology.legend` 에는 **관계 3종만** 있다(실측: `{SUBTASK, ISSUE_LINK, WORKFORCE_PARENT}`).
그런데 소속 엣지(`ROOT_SPACE`·`SPACE_ISSUE`)도 **화면에 그려지고**(`topologyGraph.js:136` 이 kind 로 거르지 않는다),
`buildForceGraphOption` 의 `tooltip.trigger:'item'`(`forceGraphOption.js:70`)은 **엣지에도 툴팁을 붙인다**.
→ 루트–스페이스 선이나 스페이스–이슈 선에 마우스를 올리면 번역이 없는 키가 그대로 문자열로 뜬다
(`t()` 는 미등록 키에 기본값이 없으면 키 자체 또는 빈 값을 돌려준다 — 어느 쪽이든 사용자에게 보일 값이 아니다).

전체 엣지 중 소속 엣지가 **가장 많다**(`SPACE_ISSUE` = 이슈 수만큼)이라 마주칠 확률이 낮지 않다.

**수정 방법 (둘 중 하나)**
1. 키 2개 추가 — `locales/kr|en/dashboard.json` 의 `topology.legend` 에 `ROOT_SPACE`("프로젝트 소속"/"Project"), `SPACE_ISSUE`("스페이스 소속"/"Space") → `npm run merge`. 범례에는 `RELATION_KINDS` 만 도는 `buildRelationLegend` 가 쓰이므로 **범례에 항목이 늘지 않는다**(관계 3분류 축 유지).
2. 또는 관계 엣지가 아니면 `null` 을 돌려 `graphTooltipFormatter` 기본값으로 떨어뜨린다(`graphTooltip.js:39`). 단 엣지의 `params.name` 은 비어 있어 **빈 툴팁 박스**가 뜨므로 1안이 낫다.

---

## M5-10. 관찰 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-M5-1** | `RelationGraphService.js:212-213` | `wbsParent === jiraParent` 이면서 **둘 다 집합 밖**일 때 `outOfScopeEdgeCount` 가 **+2** 된다(실제로는 관계 1개). 그릴 수 있는 경우에는 `:217` 이 중복을 제거하는데 못 그리는 경우에는 같은 병합 판정이 없다. 표시용 알림 수치라 데이터 영향 0 |
| **O-M5-2** | `TopologyWidget.jsx:169-173` | 커스텀 범례 건수는 **서버 전체값**(`graph.edgeKindCounts`)이라 상한·관계필터가 걸리면 **실제 그려진 엣지 수보다 크다**. 절단 사실은 배너가 알리므로 오해 소지는 낮지만, "범례 31 / 화면 12"가 될 수 있다. 필터 후 재집계로 바꾸면 "0건 항목을 지우지 않는다"는 규약과 충돌하므로 **현 선택이 더 낫다** — 기록만 |
| **O-M5-3** | `TopologyWidget.jsx:196-202` | 상한 배너의 `(shownIssues/totalIssues)` 가 **관계필터 감소분과 상한 감소분을 한 비율에 섞는다**(둘 다 켜진 경우). 관계필터 제외 건수는 별도 캡션(`:210-216`)으로 나오므로 정보 손실은 없다 |
| **O-M5-4** | `TopologyWidget.jsx` | 위젯 컴포넌트 자체에는 테스트가 없다(순수 모듈 `topologyGraph.js` 는 24케이스). "rollup 을 상한 **이전** 노드로 낸다"(`:56`)는 **코드 리딩으로만** 확인했다 — M6 는 같은 성질을 `portfolioAggregate.test.js` 가 고정하고 있어 비대칭이다. 회귀 위험이 신경 쓰이면 `rollupEffort(nodes)` 인자를 고정하는 한 줄 테스트로 충분 |
| **O-M5-5** | `topologyGraph.js:106` | `relationOnly` ON 에서 소속 이슈가 전부 걸러진 SPACE 노드도 **남는다**(뼈대 불가침 규칙의 귀결). 루트에만 매달린 빈 스페이스 노드가 보일 수 있다 — 의도된 동작 |
| **O-M5-6** | `useProjectRelationGraph.js:25` | `keepPreviousData: true` 는 TanStack Query v5 에서 무효(1차 O-4 와 동일, 레포 전역 관례). 이번 변경의 결함 아님 |

---

## M5-11. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **78 suites / 1217 tests 통과** (exit 0). `permissionMap.contract.test.js` 포함 → 신규 resolver 등록 확인 |
| 프론트 전량 | `cd static/ui && npx jest` | **82 suites / 1398 tests 통과, 스냅샷 1 통과** (exit 0). 골든 픽스처 무변경 = M6 회귀 0 |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `main.5852167f.js` **gzip 432,930B / budget 950,000B, withinBudget: true** |

세 수치 모두 백엔드 §11-7·프론트 §M5-5 와 **완전 일치**(재현됨).

---

## M5-12. 미검증 (추측으로 통과 처리하지 않음)

1. **force 배치 가독성** — 상한 300 노드 근처에서 실제로 읽히는지, `repulsion` 상한(400)·`layoutAnimation` 컷오프(150)가 적절한지는 실화면 판단이다. jsdom 에 레이아웃이 없어 jest 로는 검증 불가.
2. **이슈 노드 클릭(`router.open`)** — `useJiraSiteUrl()` 이 실제 사이트 URL 을 돌려주는지, Custom UI iframe 에서 `/browse/KEY` 가 열리는지는 배포 후 확인이 필요하다(코드 경로·`window.open` 미사용은 확인됨).
3. **다크 모드 범례·엣지 대비** — 관계 3종 색(팔레트 인덱스 0/3/5)이 다크에서 서로 구분되는지, 소속 엣지 `opacity 0.18` 이 너무 옅지 않은지.
4. **실 Jira 데이터에서의 `outOfScopeEdgeCount`·`truncated` 발동** — 800 상한과 구독 스페이스 복수 케이스는 실 프로젝트에서만 확인된다.

---

## M5-13. 재작업 지시 요약 (M5)

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| 권장 | frontend | `locales/kr\|en/dashboard.json` (`topology.legend`) + `npm run merge` | **D-M5-1.** `ROOT_SPACE`·`SPACE_ISSUE` 2키 추가. 소속 엣지 툴팁이 번역 없는 원시 키를 노출한다(`TopologyWidget.jsx:152`). 범례는 `RELATION_KINDS` 만 돌므로 3분류 축은 그대로 유지된다 |
| 선택 | backend | `src/resolver/projectDashboard/RelationGraphService.js:212-213` | **O-M5-1.** `wbs === jira` 이고 둘 다 집합 밖이면 `outOfScopeEdgeCount` 가 2 로 센다. 그릴 때(`:217`)와 같은 병합 판정을 여기에도 적용 |
| 선택 | frontend | `static/ui/src/pages/projectDetail/dashboard/widgets/TopologyWidget.jsx:56` | **O-M5-4.** "rollup 은 상한 이전 전체 노드로" 성질을 테스트로 고정(M6 는 이미 고정돼 있어 비대칭) |

---
---

# § M2 검증 (3차 추기) — 지연·임박 이슈 목록 + 이슈 규모 트리맵

> 검증 2026-08-13 / M5 커밋 `d4c5100` · 토폴로지 이동 `ce32208` 이후
> 기준: `02_frontend_report.md` **§M2**, `01_architect_design.md` §10 M2 · **§D4** · §11 함정 11·12, `02_backend_report.md` §2(이탈 B~E)
> 범위: **프론트 전용** — `insight.issues[]` 의 다른 슬라이스. 백엔드 변경 0
> 방법: 생산자·소비자 동시 읽기 + 테스트/빌드 전량. **코드 수정 0건.** 병행 작업 없음.

## M2-0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 8 영역 / 26 항목 | 지시된 중점 1~8 전부. 재정렬·조용한 제외·경로 이중화·권한 위반 **0건** |
| **실패(수정 권장, 경미)** | 1 | D-M2-1 트리맵 위젯의 **표 전환 뷰가 빈 표** |
| **관찰** | 4 | O-M2-1~4 |
| **미검증** | 3 | 실환경 E2E |

**결론: 배포 차단 사유 없음.** 백엔드 무변경이 루트 테스트 수치(78/1217, M5 검증과 동일)로 확인된다.

---

## M2-1. 재정렬 금지 (함정 11, 중점 1) — **통과**

| 축 | 실코드 | 판정 |
|---|---|---|
| filter 만 하는가 | `dashboardInsightAdapters.js:95-102` — 세 분기 전부 `Array.prototype.filter`. **`sort`·`reverse`·`slice` 호출 0** | ✓ 순서 보존은 `filter` 의 정의상 보장 |
| 위젯에서 재정렬하는가 | `IssueListWidget.jsx:51-54` `useMemo(() => filterRiskIssues(...))` 뿐. 컴포넌트 전체에 `sort` **0건** | ✓ |
| 기한을 재계산하는가 | `:96-100` 판정이 **`flags.includes('OVERDUE'/'DUE_SOON')`** 뿐. `dDay`·`dueDate` 비교로 판정하는 코드 **0건** (`dDay` 는 배지 표시·정렬값으로만 소비) | ✓ 타임존·기준일 이원화 없음 |
| **KPI 건수 ↔ 목록 건수 동일 출처** | 서버 `counts.overdue` = `DashboardInsightService.js:133-144 countFlags` 의 `'OVERDUE'` 계수 / 프론트 = **같은 `issues[].flags`** 필터. **같은 배열·같은 플래그**라 값이 갈릴 수 없다 | ✓ |
| "전체" 필터 = overdue + dueSoon | `WorkAssignmentRules.js:71-76` 이 `due < today` **else** `due <= limit` 구조라 **두 플래그는 상호배타**다 → `all` 건수 = `counts.overdue + counts.dueSoon` 정확히 일치(중복 계수 없음) | ✓ (교차 검증으로 확인) |
| done 이슈 취급 | 서버가 done 이슈에 `flags: []` 를 주므로(`DashboardInsightService.js:106-107`) KPI·목록 **양쪽에서 동일하게 빠진다** | ✓ |
| 테스트 고정 | `dashboardInsightAdapters.test.js:165`(서버 정렬 보존) · `:171`(flags 로만 판정) · `:177`(flags 결손 방어) | ✓ |

---

## M2-2. 조용한 제외 금지 (함정 12, 중점 2) — **통과**

| 항목 | 실코드 |
|---|---|
| 제외 판정 | `dashboardInsightAdapters.js:130-133` `typeof value !== 'number' \|\| !Number.isFinite(value) \|\| value <= 0` → **null·undefined·문자열·NaN·Infinity·0·음수 전부** 제외 |
| 제외 계수 | 같은 분기에서 `excludedCount += 1` 후 `continue` — 반환값에 `excludedCount`/`includedCount`/`total` 동봉(`:161-166`) ✓ |
| 캡션 | `ChartTemplate.js:424-430` — `chartData?.excludedCount > 0` 이면 `tFormat(t,'dashboard.treemap.excluded',{count})` 캡션. 절단 캡션과 **배열로 공존**(둘 다 뜰 수 있다) ✓ |
| `plannedMd: null` = 미산정 | `basis==='planned'` 일 때 `field='plannedMd'`(`:124`) → `null` 은 위 판정에서 제외된다. **`?? 0` 으로 0 막대를 그리지 않는다** ✓ |
| allExcluded 안내 | `ChartTemplate.js:479-481` `nodes.length === 0` → `t('dashboard.treemap.allExcluded')`("표시할 수 있는 이슈가 없습니다. 작업 시간 또는 계획 공수를 입력해 주세요.") ✓ 원인과 조치를 함께 말한다 |
| 타입명 없는 이슈 | `:136` `issue.issueTypeName ?? unknownType`("기타") — **버리지 않는다** ✓ |
| 옵션 함수 쪽 이중 필터 없음 | `treemapOption.js:9-12` 이 "제외는 호출부가 한다"를 명시하고 실제로 걸러내지 않는다 — 제외가 두 곳에서 일어나 계수와 어긋나는 사고 없음 ✓ |
| 테스트 고정 | `dashboardInsightAdapters.test.js:195`(0 제외 + 건수) · `:201`(planned null 제외) · `:209`("기타") · `:214`(전부 제외) · `:220`(음수·비유한수) · `:230`(issues 없으면 null) ✓ |

---

## M2-3. invoke 1회 유지 (중점 3) — **통과**

- 두 위젯 모두 `source:'issueInsight'`(`dashboardWidgets.js:47-48`) → `ChartTemplate.js:91` `isInsightSource` → `useDashboardInsight(project_id)` **같은 훅·같은 키**.
- `projectKeys.js` **이번 변경분에 없다**(`git status` 미등재) — 신규 쿼리키 **0**. 위젯 id 가 키에 섞이지 않는 M1 구조 그대로 ✓
- 트리맵 기준 토글(`actual`/`planned`)은 **같은 응답의 다른 필드**를 읽는 클라이언트 재계산이라 재조회 0 (`ChartTemplate.js:71-73` 주석 · `insightChartData` useMemo 의존성에 `treemapBasis` 만 추가) ✓
- 목록 필터 칩(전체/지연/임박)도 클라이언트 필터 — invoke 0 ✓
- 결과: `SummaryPanel` + progressStatus×n + plannedVsActual×m + **riskIssues×k + issueSize×j** 를 전부 얹어도 대시보드 진입당 `getDashboardIssueInsight` **1회** ✓

---

## M2-4. `optionFn` `isDark` 확장 무회귀 / 경로 이중화 (중점 4) — **통과**

**시그니처 변화 전파 범위 = 1곳뿐이다.** `optionFn({...chartData, t, isDark, ...extra})`(`ChartTemplate.js:290`)는 **`CHART_OPTION_MAP` 경유 호출 한 지점**이고, 옵션 함수를 직접 부르는 다른 4곳은 각자 객체 리터럴을 만든다 — 전수 grep 확인:

| 직접 호출부 | 영향 |
|---|---|
| `PortfolioUtilization.jsx:67` `pieChartOption({...})` | 무관(자기 인자) |
| `CostByIssueTable.jsx:125` `pieChartOption({...})` | 무관 |
| `TeamCompareBar.jsx:108` · `TeamRollupTable.jsx:65` `barChartOption({...})` | 무관 |

기존 5종은 **명명 파라미터를 구조분해**하므로(`barChartOption.js:21-25`, `calendarHeatmapOption.js:98-103` 등) 알지 못하는 `isDark` 키는 그냥 무시된다 → **동작 변화 0**. 기존 옵션 테스트(`chartOptionOrientation`·`calendarHeatmapCapacity`) 전량 통과로 실행 확인 ✓
(부수 효과: `option` useMemo 의존성에 `isDark` 가 들어가 **테마 전환 시 히트맵 옵션도 재생성**된다 — 개선 방향이지 회귀가 아니다.)

**경로 이중화 0 확인**

| 위젯 | renderer | `CHART_OPTION_MAP` 등록 | 판정 |
|---|---|---|---|
| `issueSize` | `echart` | **`treemap` 등록됨**(`chartOptionMap.js:23`) | ✓ 등록 없으면 백지 차트였다 |
| `riskIssues` | `issueList` | **미등록**(`'issueList' in CHART_OPTION_MAP === false`) | ✓ 렌더러 경로로만 존재 |

테스트가 양방향으로 고정한다: `dashboardWidgets.test.js:83-85`(issueList 미등록) · `:93-96`(**treemap 필수** — 이름을 박아 한 번 더) · `:22-35`(renderer==='echart' 정합 검사에 `issueSize:treemap` 이 포함돼 자동 검사) ✓
`riskIssues` 는 `item.chartType === 'issueList'` 라 `CHART_OPTION_MAP['issueList']` 가 `undefined` 지만 `ChartTemplate.js:277` `if (!optionFn) return {}` 로 떨어지고 ECharts 분기 자체를 타지 않는다 ✓

---

## M2-5. 목록 위젯 세부 (중점 5) — **통과**

| 항목 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| 상태 배지 | 서버 `statusName`(Jira 원문) + `statusColorName`(`DashboardInsightService.js:96-97`) | `IssueListWidget.jsx:93-95` `StatusComponent({status:{name, colorName}})` | ✓ `IssueComponent.js:55-56` 이 정확히 그 shape 을 받고, `colorName` 이 `null` 이어도 `STATUS_COLOR_MAP["medium-gray"]` 폴백 |
| `statusName` 부재 | `string\|null` | `:93` 삼항으로 `-` 표기 | ✓ |
| 담당자 null | `assignee: object\|null` | `:99-106` — `null` 이면 **"미배정"**(`riskIssues.unassigned`), 값이 비어 보이는 것과 구분 | ✓ `UserAvatar({displayName, avatarUrl})` 시그니처 일치(`UserAvatar.jsx:13`) |
| 이슈 클릭 | — | `:73` `IssueComponent` → `IssueComponent.js:14` `router.open(\`${context.siteUrl}/browse/${issueKey}\`)` | ✓ **`window.open` 0건**(Custom UI iframe 제약 준수) |
| truncated 캡션 | `insight.truncated` | `ChartTemplate.js:537` 이 prop 으로 전달 → `IssueListWidget.jsx:161-165` 위젯 하단 캡션 | ✓ |
| **캡션 중복 없음** | — | 셸 캡션은 `spec.renderer === 'echart'` 조건(`ChartTemplate.js:420`)이라 목록에서는 뜨지 않는다 — 위젯이 자기 자리에 그린다 | ✓ |
| 빈 상태를 셸이 가로채지 않음 | — | `ChartTemplate.js:478` `if (spec.renderer === 'issueList') return null` → 위젯이 `EmptyState` + **필터 칩 유지**(`:155-157`) | ✓ "지연 없음"에서 필터로 돌아갈 길이 남는다 |
| 기한 없는 이슈 | `dueDate: string\|null` | `:111-115` `noDue` 표기 | ✓ |

---

## M2-6. `tFormat` 관례 (중점 6) — **통과**

- `static/ui/src/utils/i18n.js` **실재**하며 시그니처 `tFormat(t, key, vars)` — `t(key)` 결과의 `{token}` 을 수동 치환하는 헬퍼(Forge `t()` 가 보간 미지원이라 만들어진 것).
- **기존 사용처 10+ 파일**(`ProjectScopeField`·`SalaryPolicySetting`·`TeamPage`·`UserEditModal`·`ProjectFilterDropdown` 등) — M2 가 새 관례를 만든 것이 아니라 **레포의 기존 패턴을 따랐다** ✓
- 사용처 2곳 모두 인자 형태가 맞다: `IssueListWidget.jsx:150` `tFormat(t,'dashboard.riskIssues.count',{count})` · `ChartTemplate.js:427` `tFormat(t,'dashboard.treemap.excluded',{count})`.
- 대응 번역값에 **`{count}` 토큰이 실재**한다: kr `"{count}건"`/`"값이 없는 이슈 {count}건 제외"`, en `"{count} issues"`/`"{count} issues without a value excluded"` ✓ (토큰이 없으면 치환이 조용히 no-op 된다 — 확인 완료)
- 기존 모듈(M1·M5·M6)의 문자열 결합은 **그대로 두었다** — 검증된 코드를 이유 없이 흔들지 않는 판단이 맞다.

---

## M2-7. i18n / 썸네일 (중점 7) — **통과**

- **정적 키 88개 전량**이 `ko-KR.json`·`en-US.json` 양쪽에 존재(누락 0). 동적 키도 개별 확인: `riskIssues.filter.{all,overdue,dueSoon}` · `treemap.basis.{actual,planned}` · `treemap.{unknownType,allExcluded,excluded}` · `chartOptions.{dataType,chartType}` 신규 4종 ✓
- kr/en **동수**: `dashboard` 127/127, `chartOptions` 47/47 ✓ (`riskIssues` 7키 · `treemap` 5키 트리)
- merge 산출물 반영 확인(위 조회가 곧 산출물 조회). `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음 ✓
- **하드코딩 한글 0건** — 신규·변경 3파일 렌더 문자열 전수 스캔(검출 2건은 JSX 주석) ✓
- **썸네일 PNG**: `treemap.png` 160×100 **353B**, `issueList.png` 160×100 **314B** — 유효 PNG, 기존 자산 중 최소급. CRA 인라인 임계(10KB) 아래라 data URI 로 들어가고 **main gzip 432,930B 로 M5 시점과 동일**(증가 0) ✓
- AddChartModal 경로 성립: `DATA_TYPES` 2종의 `allowedCharts`(`["issueList"]`/`["treemap"]`) ↔ `CHART_TYPES` 에 두 항목 추가 — 한쪽만 있으면 **차트 유형을 못 골라 위젯 생성 불가**였다 ✓

---

## M2-8. 회귀 — 토폴로지 최상단 이동(`ce32208`) (중점 8) — **통과**

- 커밋 범위가 **`ResourceTab.jsx` 1파일 / +19 −18** 뿐이다(다른 파일 0) — 위젯·집계·쿼리 로직 무변경 ✓
- 프론트 전량에서 **포트폴리오 골든 픽스처 스냅샷 통과**(`Snapshots: 1 passed`) + `costGate.test.js` · `portfolioAggregate.test.js`(급여 getter 트랩 포함) 통과 ✓
- `PORTFOLIO_CARDS.topology` 등록은 그대로라 접기 버튼이 죽지 않는다 ✓

**추가 확인 — M5 지적 D-M5-1 해소**: 소속 엣지 툴팁의 원시 키 노출이 수정됐다. `dashboard.topology.legend` 에 `ROOT_SPACE`("소속 (프로젝트 → 스페이스)") · `SPACE_ISSUE`("소속 (스페이스 → 이슈)") 2키가 **kr/en 양쪽에 추가**됐고, 범례 렌더는 여전히 `RELATION_KINDS` 만 돌아(`topologyGraph.js:174`) **3분류 축이 유지**된다 ✓

---

## M2-9. 실패 (수정 권장 — 경미)

### D-M2-1. [하] 트리맵 위젯의 **표 전환 뷰가 빈 표**다

**파일**: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:198-207`(rows) · `:503`(showToggle)

`issueSize` 는 `renderer:'echart'` 라 셸의 차트⇄표 토글이 **켜져 있다**(`showToggle={!notice && !isBusy && !isRelationSource && !isIssueListRenderer}`).
그런데 트리맵의 `chartData` shape 은 `{ nodes, excludedCount, includedCount, total, unit, basisLabel }` 이고, `rows` useMemo 는 이 형태를 모른다:

```js
const categories = chartData.categories || [];          // ← 트리맵에는 없다 → []
const values = chartData.seriesData?.[0]?.data || [];   // ← 없다 → []
return categories.map(...);                             // ← 항상 []
```

→ 표로 전환하면 **데이터가 있는데도 0행**이 되고, `CommonTable` 이 `emptyMessage` 없이 빈 상태를 그린다(문구도 비어 있다).
토폴로지(`isRelationSource`)와 목록(`isIssueListRenderer`)은 토글을 껐는데 **트리맵만 열려 있다.**

**수정 방법 (둘 중 하나)**
1. **권장** — `rows` 에 트리맵 분기를 추가한다. 트리맵 데이터는 1차원으로 펴기 쉽다(타입 → 이슈):
   ```js
   if (item.chartType === 'treemap') {
       return (chartData.nodes ?? []).flatMap((g) => g.children.map((c) => ({
           key: c.key, cells: [{ content: `${g.name} · ${c.key}` }, { content: c.value }],
       })));
   }
   ```
   값 컬럼 라벨은 **D-2 선례대로 MD 단위**로 — `head` 의 `isMdValued` 에 `item.dataType === 'issueSize'` 를 더하면 그대로 해결된다(값이 MD 다).
2. 또는 `showToggle` 에 `item.dataType !== 'issueSize'` 를 더해 토글을 끈다(토폴로지·목록과 같은 처리). 다만 트리맵은 표로 펴는 것이 자연스러워 1안이 낫다.

---

## M2-10. 관찰 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-M2-1** | `IssueListWidget.jsx:56-64` | head cell 에 **`isSortable` 이 없어** `resolveSortableColumns`(`tableSort.js:77` `if (!cell?.isSortable) return false`)가 전 컬럼을 정렬 불가로 판정한다 → `due`·`dday` 에 준 `sortValue`(`:116,122`)는 **현재 동작하지 않는 값**이다. 정렬 불가 자체는 "서버 정렬을 단일 진실로 둔다"(함정 11)와 정합적이라 **동작 문제는 없다**. 다만 프론트 리포트 §M2-4 의 "목록 정렬값" 서술이 실제와 어긋난다 — 정렬을 의도했다면 두 head cell 에 `isSortable:true`, 아니라면 `sortValue` 2줄과 리포트 서술을 정리 |
| **O-M2-2** | `ChartTemplate.js:424-430` + `:479` | 전부 제외된 트리맵에서 **본문 안내(`allExcluded`)와 하단 캡션(`N건 제외`)이 동시에** 뜬다. 중복이지만 서로 다른 정보(원인/건수)를 말하므로 해롭지 않다 |
| **O-M2-3** | `IssueListWidget.jsx:73` | `issueTypeIconUrl` 은 `string\|null` 인데 `IssueComponent` 가 `<Image src={null}>` 로 받는다(빈 아이콘 자리). 기존 호출부(작업관리·간트)와 **같은 패턴**이라 신규 결함은 아니다 |
| **O-M2-4** | `dashboardInsightAdapters.js:145-160` | 타입 그룹 정렬(`_sum` desc)은 **그룹 축**이라 함정 11(서버 이슈 정렬)과 무관하다 — 그룹 내부 자식은 서버 순서를 유지한다. 오해 방지용 기록 |

---

## M2-11. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **78 suites / 1217 tests 통과** (exit 0) — M5 검증 시점과 **완전 동일** = 백엔드 변경 0 의 실행 증거 |
| 프론트 전량 | `cd static/ui && npx jest` | **83 suites / 1439 tests 통과, 스냅샷 1 통과** (exit 0) |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `main.f159adb4.js` **gzip 432,930B / budget 950,000B** — M5 시점과 **동일**(썸네일 2장·트리맵 옵션은 대시보드 청크) |

세 수치 모두 프론트 리포트 §M2-5 와 일치(재현됨).

---

## M2-12. 미검증

1. **트리맵 가독성** — 이슈 수백 건에서 2단 블록이 실제로 읽히는지, `colorSaturation [0.35,0.7]` 이 타입 구분을 유지하는지는 실화면 판단(jsdom 은 렌더 결과가 없다).
2. **목록 위젯 클릭 → Jira 이동** — `router.open(siteUrl/browse/KEY)` 경로는 코드로 확인했으나 실제 이동은 배포 후 확인.
3. **다크 모드 트리맵** — `isDark` 전달 경로와 팔레트 분기는 테스트로 고정됐지만 실제 대비는 실화면 확인 필요.

---

## M2-13. 재작업 지시 요약 (M2)

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| 권장 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:198-207` (+ `head` 의 `isMdValued`) | **D-M2-1.** 트리맵 표 전환 뷰가 빈 표다. `rows` 에 `chartType === 'treemap'` 분기(nodes→children flatten) 추가 + 값 컬럼 라벨을 MD 로. 또는 `showToggle` 에서 `issueSize` 제외 |
| 선택 | frontend | `static/ui/src/pages/projectDetail/dashboard/widgets/IssueListWidget.jsx:56-64` | **O-M2-1.** `sortValue` 가 inert 다(head 에 `isSortable` 없음). 정렬 의도면 `isSortable:true` 추가, 아니면 `sortValue` 2줄 제거 + 리포트 §M2-4 서술 정정 |

---
---

# § M3 검증 (4차 추기) — 진척 추이(S-curve) + 비용 소진

> 검증 2026-08-13 / M2 커밋 이후
> 기준: `02_frontend_report.md` **§M3**, `01_architect_design.md` §10 M3 · §D2 · §D5 · §D7 · §11 함정 6·7
> 범위: 프론트 전용(백엔드 변경 0). **구현자가 지시와 다르게 간 판단 2건이 검증의 핵심.**
> 방법: 생산자·소비자 동시 읽기 + **이동 전/후 diff 동치 대조** + 테스트/빌드 전량. **코드 수정 0건.**

## M3-0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 6 영역 / 24 항목 | 중점 1~6 전부. **진척도 탭 회귀 0**, LEVEL_BAND 경계 변경이 **노출을 넓히지 않음** 확인 |
| **실패(수정 권장, 경미)** | 2 | D-M3-1 coworker 준비 창에서 스켈레톤 대신 "데이터 없음" / D-M3-2 기본 위젯 높이가 차트 최소 높이보다 작다 |
| **관찰** | 5 | O-M3-1~5 |
| **미검증** | 3 | 실화면 E2E |

**결론: 배포 차단 사유 없음.** 판단 2건 모두 **타당하다**(아래 M3-1·M3-2에 근거를 실코드로 대조).

---

## M3-1. 판단 1 — 진척도 탭 데이터 경로 이동 (중점 1) — **통과 (회귀 0)**

### 이동 전/후 동치 대조 (diff 수준)

| 축 | 이동 전 (`ProgressPage.jsx` 인라인, `git show HEAD`) | 이동 후 (`useProjectProgressSummary.js` + 탭 호출) | 판정 |
|---|---|---|---|
| coworker 쿼리키 | `jiraKeys.coworkerField()` | **동일**(`:33`) | ✓ |
| coworker queryFn | `getCustomFieldId(CustomFieldId.coworkerIdField)` | **동일**(`:34`) | ✓ |
| coworker staleTime | `1000*60*30` | **동일**(`:35`) | ✓ |
| coworker enabled | (없음 = 항상) | `enabled`(탭 호출은 **기본값 `true`** → `enabled: true` = 항상) | ✓ **동치** |
| 진척 쿼리키 | `projectKeys.progress(project_id)` | **동일**(`:39`) | ✓ 새 키 없음 |
| 파라미터 | `{ projectId: project_id, coworkerFieldId }` | **동일**(`:40-42`) — `coworkerFieldId` 포함 | ✓ |
| enabled | `!!project_id && isCoworkerReady` | `enabled && !!projectId && isCoworkerReady` → 탭에서 `true && …` | ✓ **동치** |
| keepPreviousData | `true` | **동일**(`:44`) | ✓ |
| staleTime | `1000*60*5` | **동일**(`:45`) | ✓ |
| 반환 소비 | `data`/`isLoading`/`isError` + `isCoworkerReady` | 훅이 **네 값을 그대로 반환**(`:48-53`), 탭이 같은 이름으로 구조분해(`ProgressPage.jsx:29`) | ✓ |

**탭의 로딩/에러/빈 상태 분기 무변경**: `ProgressPage.jsx:38` `if (isLoading || !isCoworkerReady)` → 벤토 스켈레톤, `:59` `isError || (data && !isSuccess)` → 에러 SectionMessage, `:65` `!hasPeriod`, `:71` `!hasEffort` — **분기 4개가 이동 전과 글자 그대로 같다**(diff 가 조회 블록만 걷어냈다). ✓

**단일 호출부 확인(전수 grep)**: `invoke('getProjectProgressSummary'` 는 **`useProjectProgressSummary.js:39` 한 곳뿐**이다. 나머지 매치는 주석·테스트·쿼리키 설명뿐 ✓
비용 쪽도 동일: `invoke('getProjectCostSummary'` = `useProjectCostSummary.js:38` 한 곳 ✓ (함정 6 준수 — `ChartTemplate` 이 직접 부르지 않는다)

**신규 훅이 기존 `useProjectCostSummary` 와 동형인가** — 두 파일을 나란히 읽었다: import 목록·coworker 선행 쿼리·`enabled` 옵션·반환 4필드까지 **구조가 같다**. 새 관례를 만든 것이 아니라 **검증된 선례를 복제**한 것이라 리뷰 비용이 낮다 ✓

**판정**: 지시("원 경로 무수정")와 달랐지만 **의도(탭과 숫자 일치·호출부 단일화)를 더 강하게 지키는 방향**이고, 동치성이 위 표대로 성립한다. 되돌릴 이유가 없다.

---

## M3-2. 판단 2 — LEVEL_BAND 경계 변경 (중점 2) — **통과 (노출 확대 없음)**

### `isAllowed` 변경의 실제 효과 (위젯별 진리표)

| 위젯 | 변경 전 | 변경 후 | 차이 |
|---|---|---|---|
| `salary` | `canReadCost && !isLevelBand` | `canRead('PROJECT_COST')` **AND** `!isLevelBand`(`hiddenOnLevelBand`) | **동일** ✓ 함정 7 유지 |
| `costBurnUp` | (M3 이전엔 존재하지 않음) | `canRead('PROJECT_COST')` 만 | 신규 — 아래 검증 |
| `plannedVsActual`·`progressTrend` | `canRead('REPORT')` | **동일** | ✓ |
| `relationGraph` | `canRead('PROJECT')` | **동일** | ✓ |
| `requires:null` 위젯 전부 | 통과 | **동일** | ✓ |

→ **기존 위젯의 판정은 한 건도 바뀌지 않았다.** 일반화가 기존 규칙을 잃지 않았음을 코드로 확인.

### "costBurnUp 은 LEVEL_BAND 에서도 비용 탭이 보여 준다"는 근거 대조 — **사실 확인**

| 확인 대상 | 실코드 | 결과 |
|---|---|---|
| 서버가 정책으로 마스킹하는가 | `ProjectCostService.js:142-171` — `monthlyCost`(`allocateMonthlyCost`)·`plannedBudgetLine`·`currency` 는 **정책과 무관하게 무조건 산출**된다. `policy` 는 캐시 키 대조(`:75`)와 응답의 `salaryPolicy` 표기(`:184`)에만 쓰인다 | **마스킹 없음** |
| 게이트 | `PermissionMap.js:255` `getProjectCostSummary: R('PROJECT_COST','detail')` — 위젯 `requires` 와 **같은 값** | 동일 게이트 |
| 비용 탭이 LEVEL_BAND 에서 번업을 그리는가 | `CostPage.jsx:136-147` — `<CostBurnUp data={data} />` 가 **정책 분기 없이** 렌더된다. `isLevelBand` 는 경고 문구(`:109`)와 정책 칩(`:130`)만 바꾼다 | **그대로 보여 준다** |
| 위젯이 탭보다 더 내주는가 | 같은 resolver·같은 훅·같은 쿼리키(`projectKeys.cost`)의 **같은 응답**을 `CostBurnUp` 무수정 컴포넌트에 넘긴다. 소비 필드는 `currency`/`monthlyCost`/`plannedBudgetLine`(`CostBurnUp.jsx:16-18`) — **개인 급여 필드 접근 0** | **추가 노출 0** |

🔴 **결론: LEVEL_BAND 설치에서 `costBurnUp` 위젯이 노출하는 데이터는 비용 탭이 이미 같은 권한으로 보여 주는 월별 집계와 동일하다.** 서버 응답 자체가 정책과 무관하므로 위젯을 막아도 **서버 노출은 그대로**이고, 막으면 "탭에선 보이는데 위젯은 못 만든다"는 반대쪽 함정만 생긴다. 판단이 옳다.

### 함정 7 회귀 테스트 실재 — **확인**

`constants/__test__/dashboardWidgets.test.js:91-98`
```js
const blocked = Object.entries(WIDGET_SPEC).filter(([, spec]) => spec.hiddenOnLevelBand).map(([key]) => key);
expect(blocked).toEqual(['salary']);
expect(WIDGET_SPEC.costBurnUp.hiddenOnLevelBand).toBeUndefined();
```
**양방향으로 고정**돼 있다 — `salary` 에서 플래그가 빠져도, 다른 위젯에 잘못 붙어도 깨진다 ✓

---

## M3-3. 쿼리키 공유 (중점 3) — **통과**

| 축 | 탭 | 위젯 | 판정 |
|---|---|---|---|
| 진척 | `projectKeys.progress(projectId)` — **탭도 훅 경유**(같은 코드 한 줄) | 같은 훅 | ✓ 키·파라미터 **동일 코드**라 어긋날 수 없다 |
| 비용 | `projectKeys.cost(projectId)` — `CostPage`·팀 분석 탭이 `useProjectCostSummary` 경유 | 같은 훅 | ✓ |
| 키 팩토리 형태 | `projectKeys.js:87-88` `progress: (projectId) => ['projectProgress', projectId]` / `cost: (projectId) => ['projectCost', projectId]` — **인자 1개**라 호출 형태가 갈릴 여지가 없다 | ✓ |
| `coworkerFieldId` 가 키에 섞였는가 | 두 훅 모두 **키에 넣지 않고** `enabled` 로 준비를 기다린다 | ✓ 키가 갈려 캐시 2벌이 되는 사고 없음 |
| 신규 쿼리키 | **0** — `projectKeys.js` 이번 변경분에 없다 | ✓ `queryKeyContract.test.js` 통과 |

**같은 키 + 같은 파라미터 + 같은 훅** 이므로 탭을 먼저 본 사용자에게 위젯은 5분간 왕복 0이다(§D7 대응 3). 캐시 2벌 위험 없음.

---

## M3-4. 권한 거부·실패 처리 (중점 4) — **통과**

| 상황 | 실코드 | 판정 |
|---|---|---|
| 프론트 권한 게이트 | `ChartTemplate.js:87` `isPermissionDenied = !!spec.requires && !canRead(spec.requires)` → `:510` `dashboard.widget.denied.{REPORT\|PROJECT_COST}` | ✓ 조회 자체를 하지 않는다(`enabled: … && !isPermissionDenied`) |
| 서버 거부 | `:518-520` `reusedTabData?.success === false` → 같은 안내 | ✓ |
| **쿼리 reject** | 같은 줄에서 `isProgressError`/`isCostError` 소비 — **D-1 선례 이행** | ✓ |
| 대시보드 전체 불파괴 | 안내는 `WidgetNotice` 로 **위젯 본문에만** 남는다(`:594` 이하 렌더 트리). 예외를 throw 하지 않는다 | ✓ F16 규약 |
| 로딩 | `isReusedTabBusy` → `CardBodySkeleton variant="chart"`(스피너 0) | ✓ (단 D-M3-1 참조) |
| 데이터 없음 | `ProgressSCurve.jsx:22-29` · `CostBurnUp.jsx:25-33` 이 각자 "데이터 없음" 그래픽을 갖는다 | ✓ 크래시 없음 — `data?.` 옵셔널 체이닝 확인 |

---

## M3-5. 원 컴포넌트 무수정 / 레이아웃 (중점 5) — **통과 (1건 우려는 D-M3-2)**

- **`ProgressSCurve.jsx` · `CostBurnUp.jsx` 는 `git status` 변경 목록에 없다** = 무수정 ✓ `ChartTemplate.js:21-22` 가 **원본을 import** 한다(복제 0, `progressQueryWiring.test.js:57` 이 고정).
- 래퍼는 `<div style={{width:'100%',height:'100%',overflow:'hidden'}}>` 한 겹뿐(`:623-630`) — 원본 스타일에 손대지 않았다 ✓
- 두 컴포넌트는 `display:flex; flex-direction:column; height:100%` 라 부모를 채운다(`ProgressSCurve.jsx:213`·`CostBurnUp.jsx:115`) ✓ 셸의 `flex:1; minHeight:0` 사슬과 맞물린다.
- ⚠ 다만 내부 ECharts 에 **`minHeight: 240`** 이 걸려 있어(`ProgressSCurve.jsx:206`·`CostBurnUp.jsx:108`) 기본 위젯 크기에서 하단이 잘릴 산술적 근거가 있다 → **D-M3-2**.

---

## M3-6. heavy 배지 · 회귀 가드 (중점 6) — **통과**

- i18n: `dashboard.modal.heavyBadge`("무거움"/"Heavy") · `dashboard.widget.heavy`(한 줄 안내) · `chartOptions.dataType.{progressTrend,costBurnUp}` · `chartOptions.chartType.{sCurve,burnUp}` — **전부 kr/en 존재** ✓ kr/en **동수**(`dashboard` 131/131, `chartOptions` 55/55) ✓
- 배지 노출 축: `isHeavyWidget()` 단일 함수(`dashboardWidgets.js:113`)를 알약·설명 두 자리가 함께 본다 — 판정 복제 0 ✓ `heavy` 목록이 정확히 `['costBurnUp','progressTrend']` 임을 테스트가 고정(`:139-144`) ✓
- **`projectTeamAnalysisWiring.test.js`** — 프론트 전량 통과에 포함(비용 invoke 단일 호출부 유지) ✓ ⚠ 이 가드는 **파일 텍스트를 훑으므로 주석 표현까지 걸린다** — 구현자가 주석을 우회 표현으로 바꿨을 뿐 **가드를 약화시키지 않았음**을 확인했다(`ChartTemplate.js:178-183` 주석에 호출 형태가 없다).
- **`queryKeyContract.test.js`** — 통과(신규 키 0) ✓
- 썸네일 PNG: `sCurve.png` 160×100 **555B**, `burnUp.png` 160×100 **407B** — 유효 PNG, 인라인 임계 아래 ✓
- `DATA_TYPES` 2종 ↔ `CHART_TYPES` 2종(`sCurve`/`burnUp`) 짝 확인 — 한쪽만 있으면 차트 유형을 못 골라 위젯 생성 불가였다 ✓ 둘 다 `CHART_OPTION_MAP` **미등록**(renderer 전용 경로, `:148-150` 테스트 고정) ✓
- 하드코딩 한글 **0건**(신규·변경 4파일 스캔 — 검출 1건은 `AddChartModal.jsx:256` 의 **기존** 코드, 1차 리포트 O-5)

---

## M3-7. 실패 (수정 권장 — 경미)

### D-M3-1. [하] `coworkerFieldId` 준비 창에서 **스켈레톤 대신 "데이터 없음"** 이 뜬다

**파일**: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:484-486`

```js
const isReusedTabBusy = isReusedTabRenderer && !isPermissionDenied
    && (isProgressSource ? isProgressLoading : isCostLoading);
```

훅의 본 쿼리는 `enabled: enabled && !!projectId && isCoworkerReady` 라 **coworker 필드가 준비되기 전에는 비활성**이다.
TanStack Query v5 에서 비활성 쿼리는 `isLoading === false` 다 — 설치 패키지에서 실측 확인:
`node_modules/@tanstack/query-core/build/modern/queryObserver.js:310` `const isLoading = isPending && isFetching;`
(비활성 → `isFetching:false` → `isLoading:false`).

→ 그 창에서 `isReusedTabBusy` 가 **false**, `notice` 도 null 이므로 `<ProgressSCurve data={undefined}>` 가 렌더되어
컴포넌트 자체의 **"데이터 없음"** 그래픽이 잠깐 뜬다(크래시는 없다 — 두 컴포넌트 모두 `data?.` 가드 확인).

**진척도 탭은 이 창을 막는다**: `ProgressPage.jsx:38` `if (isLoading || !isCoworkerReady)` → 스켈레톤.
**위젯만 그 가드를 빠뜨렸다.** 훅이 이미 `isCoworkerReady` 를 반환하므로(`useProjectProgressSummary.js:52`) 한 줄이면 된다.

> 실사용 창은 짧다 — `DashboardPage` 가 같은 `jiraKeys.coworkerField()` 키를 이미 조회하므로 대개 캐시 적중이다.
> 그래도 **첫 진입(캐시 콜드)에서는 "데이터 없음" → 차트로 바뀌는 깜빡임**이 보인다. "값이 없다"는 거짓 신호라 스켈레톤과 다르다.

**수정 방법**
```js
const { data: progressData, isLoading: isProgressLoading, isError: isProgressError,
        isCoworkerReady: isProgressCoworkerReady } = useProjectProgressSummary(...);
// busy 판정에 추가
const isReusedTabBusy = isReusedTabRenderer && !isPermissionDenied
    && ((isProgressSource ? isProgressLoading : isCostLoading) || !coworkerReady);
```

### D-M3-2. [하] 기본 위젯 높이가 두 차트의 `minHeight: 240` 보다 **작다** — 하단 잘림

**파일**: `static/ui/src/constants/dashboardWidgets.js:66-74`(defaultSize) / `ProgressSCurve.jsx:206` · `CostBurnUp.jsx:108`(minHeight)

그리드 설정은 `rowHeight: 30`, `margin: [8,8]`(`DashboardPage.jsx:275,283`, react-grid-layout **2.2.3** 이 `gridConfig` 를 지원함을 패키지에서 확인). 카드 높이 = `30h + 8(h−1)` = `38h − 8`.
`ChartCard` 는 `padding:16px`(상하 32) + 제목 줄(≈24~28) 을 먹는다 → **본문 ≈ 카드 − 약 60px**.

| 위젯 | 기본 크기 | 카드 높이 | 본문 가용 | 차트 최소 | 차이 |
|---|---|---|---|---|---|
| `costBurnUp` | 6×**6** | 220px | ≈160px | **240px** | **−80px** |
| `progressTrend` | 8×**7** | 258px | ≈198px (InfoTip 줄 −32 → ≈166px) | **240px** | **−74px** |

`overflow:hidden` 이라 레이아웃이 무너지지는 않지만 **x축 라벨·표 전환 영역이 잘릴 수 있다.**
기존 위젯들은 ECharts 에 `minHeight` 가 없어(`ChartTemplate` 의 `height:100%`) 이 문제가 없었다 — **M3 에서 처음 생긴 조합**이다.

**수정 방법** — 기본 크기를 올린다(본문 ≥ 240 이려면 `38h − 68 ≥ 240` → **h ≥ 9**):
`progressTrend: { w:8, h:10 }` · `costBurnUp: { w:6, h:9 }` 정도. 사용자가 줄이면 잘리는 것은 그때의 선택이고, **만들자마자 잘린 상태**는 피해야 한다.
(대안: 위젯 경로에서만 `minHeight` 를 해제 — 다만 원 컴포넌트를 건드려야 해서 무수정 원칙과 충돌한다.)

---

## M3-8. 관찰 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-M3-1** | `ChartTemplate.js:518-520` | 서버 오류(`{success:false}` 의 **비권한 원인** 포함)와 쿼리 reject 를 **"권한이 필요합니다"** 로 안내한다. M5 토폴로지는 같은 자리에서 `dashboard.topology.error` 를 쓴다 — **두 위젯의 관례가 갈린다.** 일시적 5xx 에서 "권한 없음"이라 말하면 사용자가 관리자에게 잘못된 요청을 한다. 기존 `dashboard.insight.error` 같은 일반 오류 키를 쓰거나 신규 1키 추가를 권장 |
| **O-M3-2** | `ChartTemplate.js:521-522` | `if (reusedTabData?.success !== true) return null; return null;` — 두 분기가 같은 값이라 **죽은 조건**이다. 의도(로딩 후 데이터 미도착 시 무안내)는 아래 `return null` 이 이미 처리한다 |
| **O-M3-3** | `useProjectProgressSummary.js:35` | coworker 선행 쿼리에도 `enabled` 를 걸어 **토폴로지·목록 등 다른 위젯에서는 아무 쿼리도 돌지 않는다** — `useProjectCostSummary` 와 같은 형태이고 올바르다(기록: 이 한 줄이 없으면 위젯 수만큼 무의미한 훅 인스턴스가 활성화된다) |
| **O-M3-4** | `AddChartModal.jsx:256` | 하드코딩 한글(`… 를 먼저 선택해주세요`) — **기존 코드**(1차 리포트 O-5), 이번 변경 아님 |
| **O-M3-5** | `useProjectProgressSummary.js:44` | `keepPreviousData: true` 는 v5 에서 무효(레포 전역 관례를 그대로 복제). **이동 전 코드에도 있던 값**이라 동치성 유지 관점에서는 오히려 맞다 — 정리한다면 전역 이슈로 |

---

## M3-9. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **78 suites / 1217 tests 통과** (exit 0) — M2·M5 검증과 **동일 수치** = 백엔드 변경 0 |
| 프론트 전량 | `cd static/ui && npx jest` | **84 suites / 1453 tests 통과, 스냅샷 1 통과** (exit 0). `projectTeamAnalysisWiring`·`queryKeyContract`·포트폴리오 골든 포함 |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `main.0012c20c.js` **gzip 432,941B / budget 950,000B**(M2 대비 +11B — 썸네일 2장·레지스트리 증가분) |

세 수치 모두 프론트 리포트 §M3-5 와 일치(재현됨).

---

## M3-10. 미검증

1. **위젯 카드 안에서의 실제 렌더 높이** — D-M3-2 는 그리드 상수·패딩·`minHeight` 로 계산한 **산술적 근거**다. jsdom 에 레이아웃이 없어 실제 잘림 정도는 브라우저에서만 확인된다.
2. **REPORT/PROJECT_COST 회수 설치의 실화면** — 안내 문구·대시보드 불파괴는 코드로 확인했으나 권한 세트를 실제로 바꾼 확인은 미수행.
3. **왕복 0 확인** — 진척도 탭 → 대시보드 순서로 열었을 때 네트워크 탭에서 재조회가 없는지(키 공유는 코드로 확인, 실측 미수행).

---

## M3-11. 재작업 지시 요약 (M3)

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| 권장 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:484-486` | **D-M3-1.** busy 판정에 `isCoworkerReady` 를 넣는다(훅이 이미 반환). 지금은 coworker 준비 전 창에서 스켈레톤 대신 **"데이터 없음"** 이 뜬다 — 탭은 `isLoading \|\| !isCoworkerReady` 로 막고 있다 |
| 권장 | frontend | `static/ui/src/constants/dashboardWidgets.js:66-74` | **D-M3-2.** 기본 크기를 `progressTrend 8×10` · `costBurnUp 6×9` 수준으로 상향. 현재 기본값은 본문 가용 높이(≈160~198px)가 차트 `minHeight:240` 보다 작아 **만들자마자 하단이 잘린다** |
| 선택 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:518-520` | **O-M3-1.** 서버 오류·reject 를 "권한 필요"로 안내한다. 일반 오류 문구로 분리(M5 토폴로지 관례와 통일) |
| 선택 | frontend | `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:521-522` | **O-M3-2.** 죽은 분기 정리 |

---
---

# § M4 검증 (5차 추기) — 커스텀 필터 + 템플릿 개편 (시리즈 마지막)

> 검증 2026-08-13 / M3 이후. **이번은 백엔드 + 프론트 양쪽 변경.**
> 기준: `02_backend_report.md` **§12**(계약·설계 차이 4건·프론트 주의 9항), `02_frontend_report.md` **§M4**,
> `01_architect_design.md` §2-4 · §3-6 · §5-1 · §7 · §D6 · §11 함정 8·11·12
> 방법: **왕복 계약 글자 단위 대조**(프론트 생성물 ↔ 서버 화이트리스트) + 쓰기 경로 대칭 + 실행 전량. **코드 수정 0건.**

## M4-0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 9 영역 / 34 항목 | 중점 1~9 전부. FilterDef 왕복·쓰기 대칭·마이그레이션 안전성 **불일치 0** |
| **실패(수정 권장, 경미)** | 1 | D-M4-1 템플릿 `x` 누적 커서가 **선배치 후검사**라 마지막 위젯이 12열 밖에 놓인다 |
| **관찰** | 6 | O-M4-1~6 |
| **미검증** | 4 | 배포 순서·E2E |

**결론: 배포 차단 사유 없음.** 백엔드 §12-9 의 확인 요청(예외 삼킴 제거)은 **유지 권장** — 프론트 실패 토스트가 그 위에서만 동작한다.

---

## M4-1. FilterDef 왕복 (중점 1) — **통과**

### 필드명·값 글자 단위 대조

| 축 | 프론트 (`dashboardFilter.js`) | 서버 (`DashboardFilter.js`) | 일치 |
|---|---|---|---|
| 배열 축 | `ARRAY_AXES = ['assignee','statusCategory','issueType','priority']`(`:23`) | `FILTER_ARRAY_KEYS` **동일 4개**(`:30`) | ✓ |
| 단일 축 | `DUE_OPTIONS = ['ANY','OVERDUE','DUE_SOON','NO_DUE']`(`:18`) · `ESTIMATE_OPTIONS = ['ANY','HAS','NONE']`(`:19`) | `FILTER_ENUMS.due` · `.estimate` **동일**(`:34-35`) | ✓ |
| 허용 키 전체 | `createEmptyFilter()` = `{v, assignee, statusCategory, issueType, priority, due, estimate}`(`:32-40`) | `FILTER_ALLOWED_KEYS = ['v', ...배열4, ...enum2]`(`:46-50`) — **집합이 정확히 같다** | ✓ |
| 버전 | `v: 1`(숫자) 골격에 박아 호출부가 빠뜨릴 수 없다 | `filter.v !== 1` 거부(`:78`, `'1'`·`2`·부재 전부) | ✓ |
| 상한 | `FILTER_LIMITS = {maxItems:20, maxLength:100}`(`:29`) | `MAX_FILTER_ARRAY_LENGTH=20` · `MAX_FILTER_STRING_LENGTH=100`(`:39-40`) | ✓ **같은 수** |
| `__ME__` | `ME_TOKEN='__ME__'`(`:16`) | `FILTER_ME_TOKEN='__ME__'`(`:43`) — 서버는 **해석하지 않고 문자열 보관** | ✓ |

### 빈 축 생략 / 해제 표현

- 프론트 `toStoredFilter`(`:53-65`): 빈 배열 축은 **키를 만들지 않고**, `due`/`estimate` 가 `'ANY'` 면 생략. `v` 밖에 없으면 **`null` 반환**(`:64`).
- 서버: 미지정 축은 결과에서 **빠진다**(`:87,104` `if (value === undefined) continue`), 빈 배열은 **그대로 보존**(`:99`) → 왕복이 정확하다.
- 🔴 **해제가 `filter: null` 로 간다**(빈 객체 아님) — 두 진입점 모두 확인:
  `FilterEditModal.jsx:38` `onSave(toStoredFilter(draft))` · `AddChartModal.jsx:93` `toStoredFilter(filterDraft)`.
  서버는 `filter ?? null` 일 때 **검증을 타지 않고** NULL 저장(`ProjectDashboardService.js:673`, `serializeFilterDef:118`) ✓
  (`{}` 를 보냈다면 `v` 부재로 `DASHBOARD_FILTER_INVALID` — 그 경로가 코드에 없다.)
- UI 상한 차단: `FilterBuilder.jsx:68,72,93,120,134` — 20개째 이후 칩을 **비활성**(서버가 부분 통과 없이 전량 거부하므로 고르기 전에 막는 것이 맞다) ✓

---

## M4-2. add/update 쓰기 경로 대칭 (중점 2) — **통과**

| 경로 | 검증 진입 |
|---|---|
| `addChart` | `validateChart`(`ProjectDashboardService.js:726` `if (chart.filter != null) chart.filter = validateFilterDef(chart.filter)`) + `insertChart`(`:650` `serializeFilterDef` 내부에서 재검증) |
| `updateChartFilter` | `updateChartFilterService`(`:674` `serializeFilterDef(filter ?? null)`) |

→ **두 경로가 같은 `validateFilterDef` 하나를 본다** ✓ (CLAUDE.md 「읽기↔쓰기 검증 대칭」 준수)

**불량 입력 6종 × 2경로 테스트 실재** — `__test__/ChartFilterPersistence.test.js:157-173`
```js
test.each([['알 수 없는 키',{v:1,sprint:3}], ['버전 불일치',{v:2,…}], ['배열 상한 초과',21개],
          ['문자열 상한 초과',101자], ['enum 위반',{due:'SOON'}], ['배열 아님',{priority:'High'}]])
```
각 케이스가 `updateChartFilterService` 거부 + **`mockExecuteQuery` 미호출**(DB 미접촉) + **같은 필터를 `addChartService` 에 넣어도 같은 코드로 거부**를 함께 단언한다 ✓

**`addChart` 의 filter 미지정 경로가 기존 9컬럼 INSERT 그대로인가 — 통과 (배포 순서 함정 8 대응)**

| 확인 | 실코드 |
|---|---|
| 9컬럼 문 무변경 | `ProjectDashboard.INSERT` **diff 없음**(추가만 있고 수정 없음) ✓ |
| 분기 | `ProjectDashboardRepository.js:52` `if (chartData.filterJson == null)` → `INSERT`(9), 아니면 `INSERT_WITH_FILTER`(10) ✓ |
| 테스트 | `ChartFilterPersistence.test.js:67`(9컬럼·파라미터 9개) · `:75`(`filter:null` 도 9컬럼) · `:83`(10번째가 직렬화 JSON) ✓ |

→ **v018 마이그레이션 전에도 기존 위젯 7종 생성이 정상 동작**하고, 실패 가능성이 커스텀 필터 위젯 하나로 격리된다. 설계 §3-6 의 "10컬럼으로 재정의"를 따르지 않은 것이 **더 안전한 선택**이다.

---

## M4-3. 에러 판별 (중점 3) — **통과**

| 축 | 생산자 | 소비자 |
|---|---|---|
| 코드 위치 | `LogicalError(500,'Internal Server Error','DASHBOARD_FILTER_INVALID')`(`DashboardFilter.js:62`) — 3인자 관례라 코드가 **`cause`** 에 실린다 | `DashboardPage.jsx:222` `const cause = res?.error?.cause;` → `cause === 'DASHBOARD_FILTER_INVALID'` 분기 ✓ |
| `error.code` 오사용 | 항상 `500` | **쓰지 않는다**(grep: `error.code` 참조 0) ✓ |
| 안내 | — | `DASHBOARD_FILTER_INVALID` → `dashboard.customFilter.error.invalid`, 그 외 → `…error.save`(둘 다 kr/en 존재) ✓ |
| `DASHBOARD_ID_REQUIRED` | `ProjectDashboardService.js:672` | 별도 분기 없이 일반 저장 실패 문구로 떨어진다 — FilterEditModal 이 `item.i` 를 항상 넘기므로 도달 경로가 없다(수용) |
| 거부 사유 문자열 | `console.warn` 로그로만(`:61`) | 응답에 없음 — 프론트가 코드로만 분기하므로 계약 일치 ✓ |

---

## M4-4. `addChart` 실패 처리 (중점 4) — **통과**

- **백엔드**: `addChartDataRepository` 의 `catch` 가 `throw e`(`ProjectDashboardRepository.js:76-79`) — 과거엔 삼켜서 `{success:true}` 가 나갔다. `bulkUpdateLayoutsRepository`(U8)와 같은 결함을 같은 방향으로 고쳤다 ✓ 테스트 `ChartFilterPersistence.test.js:119`(INSERT 실패 전파)로 고정.
- **프론트**: `DashboardPage.jsx:169-177` `applyResult(res)` — `res?.success` 아니면 `dashboard.toast.addChartFail` 오류 토스트.
  🔴 **두 경로 모두 이 함수를 탄다**: 템플릿(`:190`) · 커스텀(`:198`) — 한쪽만 처리해 다른 쪽이 조용히 실패하는 구조가 아니다 ✓
- 성공 시에만 `dashboardInfo`·`dashboardData` invalidate ✓ (실패 시 캐시를 흔들지 않는다)

---

## M4-5. `__ME__` fail-close (중점 5) — **통과**

`dashboardFilter.js:155-168`
```js
const assignees = rawAssignees.map(v => v === ME_TOKEN ? myAccountId : v).filter(v => v != null);
const isAssigneeAxisActive = !isEmptyAxis(rawAssignees);
if (isAssigneeAxisActive && !assignees.includes(issue?.assignee?.accountId)) return false;
```
- 해석 실패한 `__ME__` 는 **버려진다**(`.filter(v => v != null)`) → `null` 이 목록에 남아 **미배정 이슈와 매칭되는 사고**가 구조적으로 불가능.
- 축을 골랐는데 해석 결과가 비면 `includes` 가 항상 false → **아무것도 매칭하지 않는다**(fail-close). "내 이슈만"이 "전체"나 "미배정"으로 둔갑하지 않는다.
- `issue?.assignee?.accountId` 에 **`?? null` 폴백이 없다** ✓ (있으면 미배정이 다시 매칭된다)

**테스트 실재**: `utils/__test__/dashboardFilter.test.js:82`(🔴 현재 사용자를 모르면 아무도 매칭하지 않는다) · `:87`(미배정 이슈는 담당자 축에 걸리지 않는다) · `:72`(치환) · `:77`(OR 결합) ✓

---

## M4-6. 클라이언트 필터 정합 (중점 6) — **통과**

| 규약 | 실코드 |
|---|---|
| 축 내부 OR | `matchesAxis`(`:134-138`) `values.includes(actual)` ✓ |
| 축 사이 AND | `applyFilterDef`(`:167-175`) 각 축이 `return false` 로 조기 탈출 ✓ |
| 빈 축 = 필터 안 함 | `isEmptyAxis` 가 **부재·빈 배열을 함께** 처리(`:42,136`) ✓ (§12-8 8) |
| 🔴 정렬 보존 | `list.filter(...)` 하나뿐 — **`sort` 호출 0**(파일 전체 확인). 서버 `sortQueueItems` 순서 유지(함정 11) ✓ 테스트가 고정 |
| 기한 판정 | `matchesDue`(`:119-125`) — `OVERDUE`/`DUE_SOON` 은 **서버 `flags`**, `NO_DUE` 만 `dueDate == null`. 날짜 재비교 **0** ✓ KPI 건수와 갈리지 않는다 |
| 산정 판정 | `matchesEstimate`(`:127-132`) `plannedMd != null` — **`0` 은 "산정됨"** ✓ `?? 0` 없음 |
| `filter_json` 소비 | `DashboardPage.jsx:81` `filter: row.filter_json ?? null` — **`JSON.parse` 0건**(서버가 `parseStoredFilter` 로 객체\|null 통일) ✓ |
| 조건 없음 안내 | `ChartTemplate.js:527-529` `hasAnyCondition` false → `dashboard.customFilter.noCondition` 캡션(고장이 아님을 밝힌다) ✓ |
| 미리보기 = 저장본 | `FilterBuilder` 와 위젯이 **같은 `applyFilterDef`** 를 쓴다 → "미리보기 12건인데 만들면 9건"이 불가능 ✓ |

---

## M4-7. 템플릿 (중점 7) — **1건 실패(D-M4-1) 외 통과**

### §7 표 대비 구성 — 일치

| 키 | 구성(실코드) | heavy | 판정 |
|---|---|---|---|
| `health`(1순위) | progressStatus(pie 4×5) + riskIssues(issueList 6×7) + plannedVsActual(bar 4×5) | 없음 | ✓ |
| `scale` | issueSize(treemap 6×7) + progressStatus(bar 4×5) | 없음 | ✓ |
| `workforce` | role + level (유지) | 없음 | ✓ |
| `issue` | issue + **assignee 추가** | 없음 | ✓ |
| `salary` | salary (유지) | 없음 | ✓ |
| `deepDive`(맨 끝) | progressTrend(sCurve 8×10) + costBurnUp(burnUp 6×10) | **2종 전부** | ✓ 분리 확인 |

**heavy 가 기본 템플릿에 없음**을 테스트가 고정(`dashboardWidgets.test.js` — `withHeavy` 목록이 정확히 `['deepDive']`, 1순위가 `health` 이고 그 구성에 heavy 0) ✓
템플릿 dataType 존재·chartType ⊂ allowedCharts 정합도 테스트로 고정 ✓ 기존 3종(workforce·issue·salary) 개편은 **차트 추가 1건뿐**이라 회귀 없음 ✓

### 게이트 — 표시와 제출이 같은 목록

`AddChartModal.jsx:70-72`
```js
const templates = TEMPLATES(t)
    .map(tpl => ({ ...tpl, charts: tpl.charts.filter(c => isAllowed(c.dataType)) }))
    .filter(tpl => tpl.charts.length > 0);
```
- 카드 렌더가 **이 배열**을 돌고(`:177`) `setSelectedTemplate(tpl)`(`:182`) 도 그 원소를 담으므로, `handleSubmit` 이 제출하는 `value.charts` 는 **걸러진 목록**이다 ✓
  (표시만 거르고 원본을 제출하면 권한 없는 차트가 함께 생성돼 "만들자마자 안내 문구만 뜨는 위젯"이 남는다 — 그 경로가 없다.)
- 판정 축은 위젯 선택과 **같은 `isAllowed`**(`requires` + `hiddenOnLevelBand`) ✓

### `x` 누적 폭 배치 — **실패 (D-M4-1)** — 아래 M4-10 참조

---

## M4-8. 마이그레이션 (중점 8) — **통과**

| 항목 | 확인 |
|---|---|
| 등록 3단 | `ddl/project.sql.js:36-48`(정의) → `ddl/index.js:1`(re-export) → `migrate.js:56`(**체인 맨 끝** enqueue) ✓ |
| 이름 | `v018_alter_project_dashboard_add_filter_json` — v017 다음 번호, 기존 규약(`vNNN_alter_<table>_add_<col>`)과 형태 일치 ✓ 번호 충돌 없음(v017 이 직전) |
| 멱등 | `ALTER TABLE project_dashboard ADD COLUMN IF NOT EXISTS filter_json JSON NULL` — 재실행 안전(Forge SQL 무트랜잭션) ✓ |
| CREATE 본문 | **무변경**(v012/v013/v015/v017 관례) — 신규 설치는 CREATE→ALTER 둘 다 실행해 결과 동일 ✓ |
| `getChartInfo` 정규화 | `ProjectDashboardService.js:88-92` 가 `parseStoredFilter` 로 **모든 행**에 `filter_json` 키를 채운다 → 문자열(TiDB)·객체·컬럼 부재(마이그레이션 전) 3형태를 **object\|null 하나로 흡수** ✓ 깨진 JSON 은 예외 대신 `null` + 경고(`DashboardFilter.js:128-140`) — 대시보드가 죽지 않는다 |
| 테스트 | `ChartFilterPersistence.test.js:176`(문자열→객체) · `:186`(마이그레이션 전에도 키 존재·null) · `:199`(깨진 JSON → null) ✓ |
| 읽기 회귀 | `SELECT *`(QueryBuilder 기본값)라 컬럼 부재에서도 실패하지 않는다 ✓ |

---

## M4-9. i18n / 하드코딩 (중점 9) — **통과**

- **정적 키 147개 전량**이 `ko-KR.json`·`en-US.json` 양쪽에 존재(누락 0). 동적 키 10종(`builder.statusOption.{new,indeterminate,done}` · `dueOption.{ANY,OVERDUE,DUE_SOON,NO_DUE}` · `estimateOption.{ANY,HAS,NONE}`)도 **전량 존재** ✓
- 신규 키 확인: `dashboard.customFilter.*` · `dashboard.toast.addChartFail` · `chartOptions.template.{health,scale,deepDive}` · `template.issue.charts.assignee` · `chartOptions.dataType.customFilter` ✓
- kr/en **동수**: `dashboard` 158/158, `chartOptions` 68/68 ✓ merge 산출물 반영 확인
- `{count}` 보간은 `tFormat` 사용(M2 관례) ✓
- **하드코딩 한글 0건**(신규 5파일 스캔 — 검출 1건은 JSX 주석)

---

## M4-10. 실패 (수정 권장 — 경미)

### D-M4-1. [하] 템플릿 `x` 누적 커서가 **선배치 후검사**라 마지막 위젯이 12열 밖에 놓인다

**파일**: `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:184-189`

```js
const created = createItem(chart, idx, cursorX);
cursorX = cursorX + created.w > 12 ? 0 : cursorX + created.w;   // ← 검사가 "다음" 커서에만 적용된다
```

위젯은 **항상 현재 `cursorX` 에 먼저 놓이고**, 12열 초과 검사는 그 다음 위젯의 커서에만 반영된다. 실제 템플릿 폭으로 계산하면:

| 템플릿 | 배치 |
|---|---|
| `health` (4·6·4) | ①x=0,w=4 → ②x=4,w=6(=10 OK) → ③**x=10, w=4 → x+w=14 > 12** ❌ |
| `deepDive` (8·6) | ①x=0,w=8 → ②**x=8, w=6 → x+w=14 > 12** ❌ |
| `scale`(6·4) · `workforce`(4·4) · `issue`(4·4) · `salary`(4) | 정상 |

**실제 증상(라이브러리 동작까지 확인)**: react-grid-layout 2.2.3 의 `correctBounds`(`dist/chunk-A5WIFECI.js`)가
```js
if (l.x + l.w > bounds.cols) { l.x = bounds.cols - l.w; }
```
로 클램프하고 compactor 가 충돌을 아래로 밀어낸다 → **겹쳐 그려지지는 않는다.** 다만
① 의도한 "다음 줄 접힘"이 아니라 **클램프 + 하강**으로 자리가 정해지고, ② `onLayoutChange` 가 그 위치를 **그대로 저장**한다.
즉 6개 중 2개 템플릿이 사용자가 보게 될 배치와 다른 자리에 생긴다.

**추가로, 접힘 경로 자체도 미완이다**: 커서가 `0` 으로 돌아가도 `y` 는 `nextY` 로 **고정**이라(`:172`) 접힌 위젯이 첫 위젯과 같은 행 같은 열에 놓인다. 현재 템플릿 구성에서는 그 경로가 발동하지 않지만(항상 마지막 항목에서만 초과), 폭 구성이 바뀌면 즉시 드러난다.

**수정 방법** — 배치 **전에** 검사하고 행을 넘긴다:
```js
let cursorX = 0, rowY = nextY, rowH = 0;
const newItems = value.charts.map((chart, idx) => {
    const { w, h } = chart.size ?? getWidgetDefaultSize(chart.dataType);
    if (cursorX + w > 12) { cursorX = 0; rowY += rowH; rowH = 0; }   // 먼저 접는다
    const created = { ...createItem(chart, idx, cursorX), y: rowY };
    cursorX += w; rowH = Math.max(rowH, h);
    return created;
});
```
**테스트 보강 권장**: 현재 `dashboardWidgets.test.js` 는 "폭이 섞인 템플릿은 `size` 를 명시한다"만 검사하고 **배치 산술은 검사하지 않는다** — 그래서 이 결함이 통과했다. `모든 템플릿에서 x+w ≤ 12` 를 고정하면 재발이 막힌다.

---

## M4-11. 관찰 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-M4-1** | `ProjectDashboardService.js:663-670` 주석 | `updateChartFilter` 는 payload 에 `project_id` 가 없어 `project:'inherited'` 스코프 검증이 **skip** 된다(구현자가 스스로 문서화). 다만 주석이 "`updateChartTitle`·`updateChartLayout` 과 동일한 기존 한계"라고 적었는데 **`updateChartLayout` 은 payload 에 `project_id` 가 있어 스코프가 검증된다** — 선례는 `updateChartTitle` 하나다. 영향: DASHBOARD write 를 가진 사용자가 **dashboard_id 를 알면** 자기 스코프 밖 위젯의 필터를 바꿀 수 있다(데이터 노출이 아니라 변조). 계약(§2-1)이 `{dashboard_id, filter}` 로 고정돼 이번에 넓히지 않은 판단은 수용 가능하나, 후속에서 `project_id` 를 함께 받는 편이 낫다 |
| **O-M4-2** | `ProjectDashboardService.js:726` + `:650` | `addChart` 경로에서 filter 가 **두 번 검증**된다(`validateChart` → `serializeFilterDef`). 멱등이라 무해하고, 두 번째가 "저장 직전 최종 관문"이라 오히려 안전한 쪽 |
| **O-M4-3** | `AddChartModal.jsx` | 템플릿 게이트가 일부 차트만 걸러 남기면 카드 이름과 실제 구성이 달라진다(예: PROJECT_COST 없는 사용자에게 `deepDive` 가 1차트 템플릿이 됨). 만들 수 없는 위젯을 안 만드는 쪽이 옳으므로 수용 — 기록만 |
| **O-M4-4** | `ChartCard.jsx:161` · `:152` | `CrossIcon label="삭제"`(**기존**) 하드코딩과 신규 `FilterIcon label="filter"` 가 섞였다. 둘 다 aria 라벨이고 기존 관례를 따른 것이지만 언어가 갈린다 |
| **O-M4-5** | `migrate.js:56-57` | enqueue 체인 마지막에 세미콜론이 없다(ASI 로 동작, **기존 스타일 그대로**). 다음 마이그레이션 추가 시 같은 자리에 이어 붙이면 문제 없음 |
| **O-M4-6** | `DashboardFilter.js:60-63` | 거부 사유가 `console.warn` 서버 로그로만 남는다. 메모리 노트 「진단 로그는 백엔드 console.log 금지」와 겹쳐 보이지만, 이건 **진단 로그가 아니라 프로그래밍 오류 기록**이고 정상 경로에서는 찍히지 않는다 — 수용 |

---

## M4-12. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **80 suites / 1271 tests 통과** (exit 0). M3 시점 78/1217 대비 **+2 suites / +54 tests** = M4 백엔드 신규 테스트(`DashboardFilter` 27 + `ChartFilterPersistence` 21 등) 반영 · `permissionMap.contract` 통과(= `updateChartFilter` 정상 등록) |
| 프론트 전량 | `cd static/ui && npx jest` | **85 suites / 1497 tests 통과, 스냅샷 1 통과** (exit 0) |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `main.128123a1.js` **gzip 432,939B / budget 950,000B** |

세 수치 모두 백엔드 §12-7 · 프론트 §M4-6 과 일치(재현됨).

---

## M4-13. 미검증

1. **v018 마이그레이션 전 배포 창의 실제 동작** — 기존 위젯 생성 정상 / 커스텀 필터 위젯만 실패 토스트, 라는 설계는 코드·테스트로 확인했으나 **실제 배포 순서에서의 확인은 미수행**. 백엔드 §12-6 의 "배포 후 커스텀 필터 위젯 1건 생성 확인" 절차를 반드시 수행할 것.
2. **필터 편집 → 저장 → 목록 즉시 갱신** — `dashboardInfo` invalidate 경로는 코드로 확인, 실화면 미확인.
3. **`__ME__` 위젯을 다른 사용자가 볼 때** 그 사람 이슈가 나오는지(저장은 토큰, 해석은 클라이언트) — 다중 사용자 확인 필요.
4. **템플릿 생성 시 실제 배치** — D-M4-1 은 그리드 상수와 RGL 소스로 계산한 결과다. 최종 렌더 위치는 브라우저에서만 확인된다.

---

## M4-14. 재작업 지시 요약 (M4)

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| 권장 | frontend | `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:184-189` | **D-M4-1.** 폭 초과 검사를 **배치 전**으로 옮기고 접힘 시 `y` 도 다음 행으로 넘긴다. 현재 `health`·`deepDive` 의 마지막 위젯이 `x+w=14` 로 생성돼 RGL 이 클램프·하강시킨 자리가 저장된다 |
| 권장 | frontend | `static/ui/src/constants/__test__/dashboardWidgets.test.js` | **D-M4-1 재발 방지.** "모든 템플릿에서 누적 배치 결과가 `x+w ≤ 12`" 를 고정. 현재 테스트는 `size` 선언 여부만 본다 |
| 선택 | backend | `src/resolver/projectDashboard/ProjectDashboardService.js:663-670` | **O-M4-1.** 주석의 선례 서술 정정(`updateChartLayout` 은 `project_id` 를 받아 스코프가 검증된다). 후속에서 `updateChartFilter` 도 `project_id` 를 함께 받는 것을 검토 |
| — | 리더 | — | 백엔드 §12-9(예외 삼킴 제거) — **유지 권장.** 프론트 실패 토스트가 그 위에서만 동작하고, 되돌리면 저장 실패가 다시 조용해진다 |

---
---

# § M7 + 전부 추가 검증 (6차 추기)

> 검증 2026-08-14 / M4 이후 추가 2건
> 기준: `02_backend_report.md` **§13**(스페이스 계층 백엔드), `02_frontend_report.md` **§전체 추가**·**§M7**
> 범위: M7(포트폴리오 토폴로지 스콥 탭 이관 + 4계층화) · "전부 추가" 버튼
> 방법: 정합 불변식 추적 + 배포 순서 폴백 **실경로 검증** + 이관 완결성 + 실행 전량. **코드 수정 0건.**

## M7-0. 판정 요약

| 분류 | 건수 | 내용 |
|------|------|------|
| **통과** | 8 영역 / 30 항목 | 정합 불변식·경계면·이관 완결성·전부 추가 6~8 전부 |
| **실패(수정 권장)** | 2 | **D-M7-1 [중하] 폴백 판정이 실경로에서 항상 참** / D-M7-2 [하] 소스에 raw NUL 바이트 → git 바이너리 취급 |
| **관찰** | 4 | O-M7-1~4 |
| **미검증** | 3 | 배포 순서·실화면 |

**결론: D-M7-1 은 커밋 전 수정 권장.** 데이터 파손은 없으나 **백엔드 리포트 §13-7 이 "막았다"고 적은 실패 모드(조용한 기능 격하)가 실제로는 막히지 않는다.**

---

## M7-1. 정합 불변식 `Σ spaces = issueSummary` (중점 1) — **통과**

| 축 | 실코드 |
|---|---|
| 단일 출처 | `ProgressCalculator.js:57-61` `classifyStatusKey(statusKey)` 신규 export — `isDone` → `'done'`, `isTodo`(= `'new'` **또는 `null`**) → `'todo'`, 나머지 `'inProgress'` |
| `issueSummary` 쪽 | `computeStatusDistribution`(`:129-138`)이 3분기 if/else 를 **`classifyStatusKey` 호출로 교체** — 순수 리팩터(동작 동일) ✓ |
| 스페이스 롤업 쪽 | `PortfolioAggregator.computeSpaceRollup` 이 **같은 함수 호출**(`entry[classifyStatusKey(issuesNorm[idx]?.statusKey ?? null)] += 1`) ✓ |
| 판정 복제 | `statusKey === 'done'` 류 재구현 **0건** — 두 집계가 갈릴 지점이 없다 ✓ |
| 리팩터 무회귀 | 기존 `computeStatusDistribution` 테스트 + `PortfolioAggregator` 기존 테스트 전량 통과 = 동작 무변경 증명 ✓ |

**`statusKey: null` → todo 접힘 일치**: `isTodo = (k) => k === 'new' || k == null`(`:46`)이 **한 곳**에만 있고 두 집계가 그 함수를 공유한다. 백엔드 테스트가 이 케이스를 포함해 불변식을 고정(§13-9 ①②) ✓

**프론트도 같은 불변식을 고정한다**: `portfolioAggregate.test.js` 가 스페이스 3종 합 = `issueSummary`, `spaceKey:null` 버킷 유지, 혼합(4계층+3계층) 케이스에서 `done` 합 45 / `todo` 합 33 을 단언 ✓ — **백엔드 집계와 프론트 조립 양쪽에서 고정**돼 있다.

---

## M7-2. 배포 순서 (중점 2) — **마이그레이션 통과 / 폴백 판정 실패(D-M7-1)**

### v019 등록 — 통과

| 항목 | 확인 |
|---|---|
| 3단 등록 | `ddl/portfolioSnapshot.sql.js:56-69`(정의) → `ddl/index.js:4`(re-export) → `migrate.js:63`(**체인 맨 끝**) ✓ |
| 이름 | `v019_alter_portfolio_snapshot_add_spaces_json` — v018 다음, 규약 일치, 중복 없음(테스트로 고정) ✓ |
| 멱등 | `ADD COLUMN IF NOT EXISTS spaces_json JSON NULL` ✓ |
| CREATE 본문 | **무변경**(v012/v015/v017/v018 관례) ✓ |
| SELECT 명시 컬럼 | `SELECT_ALL_WITH_SPACES` 에 `spaces_json` 포함(`PortfolioSnapshotQuery.js` diff `:112`) → 마이그레이션 후 읽기 정상 ✓ 기존 `SELECT_ALL`·`UPSERT` **무변경**(폴백용으로 보존) ✓ |
| UPSERT 컬럼 순서 | 신규 23컬럼이 구 22컬럼과 **같은 순서 + 끝에 `spaces_json`** → 파라미터 배열 재사용이 안전(테스트 ⑦로 고정) ✓ |
| 서비스 정규화 | `PortfolioDashboardService.js:248` `spaces: toArray(parseJson(r.spaces_json, []))` — **항상 배열**, 컬럼 부재·구 스냅샷·비배열 3형태를 `[]` 로 접는다 ✓ |

### 🔴 폴백 판정의 좁음 — **실패 (D-M7-1, 아래 M7-7)**

---

## M7-3. 경계면 — `projects[].spaces` ↔ 프론트 소비 (중점 3) — **통과**

| 계약 | 생산자 | 소비자 |
|---|---|---|
| 항상 배열 | `PortfolioDashboardService.js:248` `toArray(...)` | `portfolioAggregate.js:590` `Array.isArray(p.spaces) ? p.spaces : []` — **이중 방어**(계약을 믿되 대비) ✓ |
| `spaceKey: null` 허용 | `computeSpaceRollup` 이 불명 이슈를 **버리지 않고** null 버킷에 넣는다(정렬 시 맨 뒤) | `portfolioAggregate.js:698` `space.spaceKey ?? '__none__'` 로 **노드를 만들고**, 위젯이 `unassignedSpace`("미지정") 라벨 + `opacity 0.6` 으로 구분한다 — **필터로 버리지 않는다** ✓ (버렸다면 화면 합계가 `issueSummary` 와 어긋난다) |
| 건수 단위 | `done/inProgress/todo` = 이슈 **건수**(공수·금액 아님) | `PortfolioTopology.jsx` 가 **건수 전용 sizer 를 따로** 만든다(`createNodeSizer(spaceNodes.map(s => s.count), {maxSize:54})`) — 인력(MD)·프로젝트(MD) sizer 와 **분리** ✓ 단위가 다른 값이 한 스케일에서 크기를 비교당하지 않는다 |
| 혼합 허용 | — | `spaces.length === 0` 인 프로젝트만 3계층으로 떨어뜨리고 나머지는 4계층(`:686-690`) — 과도기에 새 데이터가 낭비되지 않는다 ✓ |

### 🔴 상태 노드 id 에 `ownerId` 포함 — **통과 (테스트 실재)**

```js
const id = `status:${ownerId}:${statusKey}`;   // ownerId = `space:<projectId>:<spaceKey>` | `project:<projectId>`
```
개편 전 id 는 `status:${projectId}:${statusKey}` 였다 — 스페이스가 2개면 **같은 id 가 두 번** 생겨 ECharts 가 엣지를 엉뚱한 노드에 붙인다. `ownerId` 를 넣어 구조적으로 막았고, 테스트가 `expect(new Set(ids).size).toBe(ids.length)` 로 **중복 0** 을 고정한다 ✓
스페이스 id 에도 `projectId` 가 들어가 있어(`space:${projectId}:${spaceKey}`) 서로 다른 RMS 프로젝트가 같은 Jira 스페이스를 쓸 때도 노드가 섞이지 않는다 ✓

---

## M7-4. 이관 완결성 (중점 4) — **통과**

| 항목 | 확인 |
|---|---|
| ResourceTab 제거 | import·BentoTile·`PortfolioTopology` 참조 **전부 삭제**. `pages/portfolio/tabs/` 전역 grep 결과 토폴로지 참조는 **ScopeTab 에만** 존재 ✓ 잔존 0 |
| ScopeTab 최상단 | `ScopeTab.jsx:31` — `BentoGrid` 의 **첫 타일**(`span=6 rows=2`) ✓ 상단 프로젝트 필터에 그대로 반응(탭 규약 유지) |
| `portfolioCards` 키 | Scope 블록으로 **위치만 옮기고 값은 `topology` 그대로**(`portfolioCards.js:19-24`) → **localStorage 접힘 상태 보존** ✓ (키를 바꿨다면 사용자가 접어 둔 기억이 초기화된다) |
| 골든 스냅샷 | 프론트 전량에서 `Snapshots: 1 passed` ✓ 기존 포트폴리오 집계 회귀 0 |
| `costGate.test.js` | 전량 실행에 포함, 통과 ✓ |
| **급여 무관 실증** | `PortfolioSpaceRollup.test.js:129-131` — 롤업 결과를 `JSON.stringify` 한 뒤 `['salary','cost','budget','Md','effort']` **5개 문자열이 하나도 없음**을 단언 ✓ 눈으로 보는 대신 **직렬화로 고정**했다 → `costMasked` 분기·`stripMemberCost` 대상이 아님이 실행으로 증명된다 |

---

## M7-5. 폴백 UI (중점 5) — **통과**

| 상황 | 동작 |
|---|---|
| 전 프로젝트 `spaces` 빈 배열 | `hasSpaceLayer:false` + `isSpaceLayerUnavailable:true`(`portfolioAggregate.js:673-674`) → 위젯이 **3계층**(프로젝트→상태 직결)으로 그리고 `portfolio.topology.spaceUnavailable` **안내 배너**("스페이스 계층은 다음 집계 후 표시됩니다") ✓ |
| 프로젝트 0개 | `projects.length > 0 && !hasSpaceLayer` 조건이라 **`false`** → 배너 없음 ✓ (빈 화면에 폴백 캡션이 뜨면 혼란스럽다) 테스트가 `buildPortfolioTopology([]).isSpaceLayerUnavailable === false` 로 고정 |
| 일부만 스페이스 보유 | `hasSpaceLayer:true` → **배너 없이 혼합 렌더** ✓ 테스트로 고정 |
| 배너 톤 | `info: true` 로 경고색이 아니라 보조색 — 고장이 아니라 상태 안내라는 표시 ✓ |

---

## M7-6. "전부 추가" (중점 6·7·8) — **통과**

| 항목 | 확인 |
|---|---|
| **판정 공유** | `selectBulkAddDataTypes({ isAllowed, existingDataTypes })` 가 `isAllowed` 를 **주입받는다**. 호출부(`AddChartModal.jsx`)가 넘기는 것은 위젯 목록·템플릿 게이트와 **같은 `isAllowed` 함수 그 자체** — 판정 두 벌이 구조적으로 불가능 ✓ 테스트가 `salary`(PROJECT_COST)·`plannedVsActual`(REPORT)·`relationGraph`(PROJECT) 제외를 고정 |
| `customFilter` 제외 | `excludeFromBulkAdd: true` **한 위젯만**. 테스트: `keys` 에 `customFilter` 없음 + 길이 = `WIDGET_SPEC` −1 ✓ |
| 기존 dataType 스킵 | `!existing.has(key)` + `existingDataTypes={chartItems.map(i => i.dataType)}`(DashboardPage) ✓ 테스트로 고정 |
| 건너뛴 건수 표기 | `bulkSkipped` 를 모달에 노출 + 토스트에 병기(`bulkAddedWithSkip`) — **조용히 빼지 않는다** ✓ (`DATA_TYPES` 기준 계산인데 두 목록의 키 집합이 같음을 확인 — 누락 0) |
| `defaultChartType ⊂ allowedCharts` | **전 위젯 정합 테스트 실재**(`🔴 모든 위젯의 defaultChartType 이 그 위젯의 allowedCharts 안에 있다`) + 성격별 기본값 9종 개별 고정 + 폴백(`'pie'`) ✓ 밖의 값이면 `renderer:'echart'` 에서 **백지 차트**(F12)가 되는 자리다 |
| **15종 최대 배치** | `dashboardWidgets.test.js:308-313` — `selectBulkAddDataTypes()` 전량을 `placeTemplateCharts` 로 배치해 `x + w <= 12` 를 단언 ✓ 배치는 **D-M4-1 에서 고친 공용 함수 재사용**(`dashboardLayout.js:23-44` — 놓기 **전** 판정 + `rowY += rowHeight`)이라 좌표 규칙이 두 벌이 아니다 |
| addChart 실패 토스트 | `type === "all"` 경로가 **M4 의 `applyResult`** 를 그대로 탄다(`DashboardPage.jsx`) → 실패 시 `dashboard.toast.addChartFail`, 성공 시에만 대량 추가 토스트 ✓ |
| i18n | 정적 키 76개 전량 kr/en 존재(누락 0), 신규 10키(`modal.option.all`·`modal.all.*`·`toast.bulkAdded{,WithSkip}`·`topology.layer.spaces`·`unassignedSpace`·`spaceUnavailable`) 확인. kr/en **동수**(`dashboard` 165/165, `portfolio` 284/284) ✓ `{count}`·`{skipped}` 보간은 `tFormat` ✓ |
| 하드코딩 한글 | **0건**(검출 2건은 JSX 주석 1 + `AddChartModal.jsx:389` 의 **기존** 코드) ✓ |

---

## M7-7. 실패 (수정 권장)

### D-M7-1. [중하] `spaces_json` 폴백 판정이 **실경로에서 항상 참**이다 — 좁힘이 성립하지 않는다

**파일**: `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js:21-24`

```js
const isMissingSpacesColumn = (e) => {
    const msg = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`;
    return msg.includes(SPACES_COLUMN);   // SPACES_COLUMN = 'spaces_json'
};
```

의도는 §13-7 에 명시돼 있다 — *"아무 오류에나 폴백하면 일시 장애가 조용한 기능 격하로 바뀐다… 컬럼명이 오류 메시지에 있을 때만 폴백한다."*
그런데 **호출 경로가 그 전제를 깨뜨린다**:

```js
// src/rdb/query/CommonQuery.js:40-42
} catch (e) {
    throw new SqlError(e.code, `query: ${query}, params: ${params.toString()}`, e)
}
// src/error/SqlError.js — class SqlError extends Error { constructor(code, message, error){ super(message); … } }
```

`executeQuery` 는 **SQL 전문을 `e.message` 에 넣어** 던진다. 그리고 `UPSERT_WITH_SPACES` · `SELECT_ALL_WITH_SPACES` 의 SQL 텍스트에는 **`spaces_json` 이 들어 있다**(각각 INSERT 컬럼/UPDATE 절, SELECT 컬럼 목록).
→ 그 두 문에서 발생한 **모든 오류**(연결 끊김·타임아웃·데드락·제약 위반)의 `message` 가 `spaces_json` 을 포함한다
→ `isMissingSpacesColumn(e)` 가 **항상 `true`** → **항상 폴백**.

**결과 (마이그레이션 후에도 계속 유효한 문제)**
- **쓰기**: 일시적 DB 장애로 23컬럼 UPSERT 가 실패하면 조용히 22컬럼 문으로 재시도한다. 그것이 성공하면 스냅샷이 **spaces 없이 저장**되고 남는 흔적은 `console.warn` 뿐이다. 다음 배치까지 대시보드는 3계층 폴백 배너를 띄우는데, 운영자는 **원인을 알 수 없다** — 정확히 §13-7 이 막으려던 "조용한 기능 격하".
- **읽기**: 일시 장애가 `spaces: []` 로 둔갑해 **DB 문제를 UI 폴백이 가린다.**
- 부수: 실패마다 쿼리를 2회 실행한다(장애 시점에 부하 2배).

**왜 테스트가 못 잡았나** — `PortfolioSpacesPersistence.test.js:11-14` 가 `executeQuery` 를 **통째로 mock** 하고 `new Error('connection reset')` / `new Error('timeout')` 같은 **정제된 오류**를 주입한다. 실경로가 씌우는 `SqlError` 래핑을 거치지 않으므로 "다른 오류는 전파한다"가 통과한다.
> 이 프로젝트에 **같은 계열 전례**가 있다: `work-bulk-apply` 검증의 F-1/R-F1 — `requestJira` 가 요청 파라미터를 `error.message` 에 에코해 `isTimeTrackingUnsupportedError` 가 항상 참이 됐고, 테스트가 정제된 1단 객체를 주입해 통과했다. **같은 함정을 다시 밟았다.**

**수정 방법** — 래퍼 메시지가 아니라 **원본 드라이버 오류**를 본다. `SqlError` 는 `this.cause = e`(원본)를 보관한다:
```js
const isMissingSpacesColumn = (e) => {
    const raw = e?.cause;                        // executeQuery 가 감싼 원본 드라이버 오류
    const msg = String(raw?.message ?? '');
    // MySQL/TiDB: 1054 Unknown column 'spaces_json' in 'field list'
    return msg.includes('Unknown column') && msg.includes(SPACES_COLUMN);
};
```
(가능하면 `raw?.code === 1054` 병행. Forge SQL 의 code shape 은 배포 로그로 한 번 확인할 것.)
**테스트는 반드시 `executeQuery` 가 실제로 만드는 2단 오류 모양**(`SqlError('…', 'query: <SQL 전문 …spaces_json…>, params: …', rawError)`)으로 고정할 것 — 현재처럼 정제된 오류를 주입하면 수정 후에도 같은 구멍이 남는다.

### D-M7-2. [하] `PortfolioAggregator.js` 에 **raw NUL 바이트**가 들어가 git 이 바이너리로 취급한다

**파일**: `src/resolver/portfolioDashboard/PortfolioAggregator.js` (offset 7898)

```js
const mapKey = spaceKey ?? ' __UNKNOWN__';   // ← 이 자리에 이스케이프가 아니라 **실제 NUL 바이트**가 들어 있다
```

`Buffer.indexOf(0)` = **7898**(HEAD 버전은 `-1` = 없음) → **이번 변경으로 유입**됐다.
git 은 파일 앞 8000바이트 안에 NUL 이 있으면 바이너리로 판정한다 → 실제로 `git diff` 가 **`Binary files a/… and b/… differ`** 만 출력한다(이번 검증에서 그 파일만 diff 를 볼 수 없어 `node` 로 우회해 읽었다).

**영향**: 런타임 동작은 정상이다(NUL 은 유효한 JS 문자·Map 키라 테스트도 통과한다). 문제는 **코드 리뷰·`git blame`·머지 충돌 해결이 이 파일에서 불가능해진다**는 것 — 앞으로 이 파일을 건드리는 모든 작업에 비용이 붙는다.

**수정 방법**: 같은 런타임 값을 유지하려면 **이스케이프 시퀀스로 쓴다**(소스는 ASCII 6자):
```js
const mapKey = spaceKey ?? '\\u0000__UNKNOWN__';   // ← 소스에 문자 그대로  
```
또는 충돌 위험이 없는 평범한 센티넬(`'__UNKNOWN__'`, Jira 프로젝트 key 규칙상 충돌 불가)로 바꾼다. 어느 쪽이든 **NUL 바이트를 파일에서 제거**하는 것이 목적이다.

---

## M7-8. 관찰 (회귀 아님)

| # | 위치 | 내용 |
|---|------|------|
| **O-M7-1** | `PortfolioSnapshotRepository.js:60-77, 82-95` | D-M7-1 의 부수효과 — 실패 시 항상 2회 실행이라 장애 시점에 쿼리 부하가 2배가 된다. 판정을 좁히면 함께 해소된다 |
| **O-M7-2** | `PortfolioAggregator.computeSpaceRollup` | `rawIssues[idx]` ↔ `issuesNorm[idx]` **인덱스 정렬 의존**이다(주석에 명시). 호출부가 `map` 결과를 그대로 넘기므로 현재는 안전하나, 한쪽을 필터링하는 변경이 들어오면 조용히 어긋난다 — 인덱스 대신 이슈 키로 묶으면 그 위험이 사라진다 |
| **O-M7-3** | `portfolioAggregate.js:695` | 스페이스 노드는 `total > 0` 일 때만 만든다. 전 스페이스가 0건인 프로젝트는 스페이스도 상태 노드도 없이 그려지는데, 백엔드 불변식(Σ spaces = issueSummary) 덕분에 그 경우 `issueSummary` 도 0 이라 **누락이 아니다**(확인함) |
| **O-M7-4** | `ScopeTab.jsx:31` | 토폴로지가 스콥 탭 최상단으로 오면서 기존 위젯 4종이 한 칸씩 밀렸다. 사용자 지시대로이고 `cardId` 로 접힘 상태는 보존되지만, 자원 탭을 쓰던 사용자에겐 위젯이 "사라진" 것으로 보인다 — 릴리스 노트에 이동 사실을 적을 것 |

---

## M7-9. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **82 suites / 1297 tests 통과** (exit 0). M4 시점 80/1271 대비 +2 suites(`PortfolioSpaceRollup` 10 · `PortfolioSpacesPersistence` 12 등) · 급여 회귀 가드(`PortfolioCostGate`·`PortfolioAggregatorSalaryPolicy`)와 `computeStatusDistribution` 기존 테스트 통과 = `classifyStatusKey` 추출 무회귀 |
| 프론트 전량 | `cd static/ui && npx jest` | **86 suites / 1532 tests 통과, 스냅샷 1 통과** (exit 0). 프론트 리포트의 1522 보다 10건 많다(리포트 작성 후 추가분) |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `main.f0f33fbf.js` **gzip 432,937B / budget 950,000B** |

⚠ **테스트 전량 통과가 D-M7-1 을 부정하지 않는다** — 그 테스트가 `executeQuery` 를 mock 해 실경로의 오류 래핑을 우회하기 때문이다(§M7-7 참조).

---

## M7-10. 미검증

1. **v019 마이그레이션 전 실제 배포 창** — 폴백이 배치·대시보드를 살리는지. 코드·테스트로 확인했으나 실제 순서 미검증. (D-M7-1 을 고쳐도 이 경로는 유지된다.)
2. **4계층 실화면 가독성** — 스페이스가 프로젝트당 여러 개일 때 force 배치가 읽히는지, 미지정 노드의 `opacity 0.6` 이 구분되는지.
3. **"전부 추가" 15종 실배치** — `x+w ≤ 12` 는 단위 테스트로 고정했으나 15개를 한 번에 만든 뒤의 실제 화면·첫 로딩 체감(heavy 2종 포함)은 미확인.

---

## M7-11. 재작업 지시 요약

| 우선 | 담당 | 파일:라인 | 내용 |
|------|------|----------|------|
| **권장(커밋 전)** | backend | `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js:21-24` | **D-M7-1.** 폴백 판정을 래퍼 메시지가 아닌 **원본 오류(`e.cause`)** 기준으로 좁힌다. 현재는 `executeQuery` 가 SQL 전문을 `message` 에 넣어 **모든 오류가 폴백을 발동**시킨다 — §13-7 이 막으려던 "조용한 기능 격하"가 그대로 성립한다. 테스트는 **실제 `SqlError` 래핑 모양**으로 고정할 것 |
| 권장 | backend | `src/resolver/portfolioDashboard/PortfolioAggregator.js` (offset 7898) | **D-M7-2.** 소스에 섞인 **raw NUL 바이트** 제거(이스케이프 시퀀스 또는 평범한 센티넬로). 현재 git 이 이 파일을 **바이너리로 취급**해 diff·blame·머지가 불가능하다 |
| 선택 | backend | `PortfolioAggregator.computeSpaceRollup` | **O-M7-2.** 인덱스 정렬 의존을 이슈 키 기준으로 바꾸면 후속 변경에 안전해진다 |
| 문서 | — | 릴리스 노트 | **O-M7-4.** 토폴로지가 자원 탭 → 스콥 탭으로 이동했음을 명시(사용자에겐 "사라진" 것으로 보인다) |

---

## M8 — 스콥 토폴로지 드릴다운 통합 검증 (2026-08-14)

### 통과

| 경계면 | 생산자 | 소비자 | 근거 |
|---|---|---|---|
| Resolver 등록·권한 | `src/index.js:77` → `registerPortfolioDashboardController` | `PortfolioDashboardController.js:28-29` | `getPortfolioSpaceIssues`가 `guardedDefine`으로 등록되고 `PermissionMap.js:261`의 `R('REPORT', 'detail')`에 매핑됨. |
| 성공 응답 shape | `PortfolioIssueService.js:104-112` | `PortfolioTopology.jsx:103-108,63-92` | 서비스가 `projectId, spaceKey, hourRate, scanned, truncated, orderedByTimeSpent, issues[]`를 반환하고, `guardedDefine`의 `responseWrapper`(`permissionGuard.js:179`)가 `{ success, content }`로 감싼다. 프론트는 성공 확인 후 정확히 `result.content`만 소비한다. `issues[]` DTO 필드도 `PortfolioIssueService.js:44-60`과 테이블 소비 위치가 일치한다. |
| 스코프·Jira 보안 | `PortfolioIssueService.js:69-98` | `PortfolioIssueFetcher.js:37-41,56-59,134-145` | `principal` 누락 fail-close, `scopedProjectIds` 재검증, `viewerId` 캐시 분리, space key allowlist 및 `as:'user'` 요청을 확인. |
| Jira 실패 partial fallback (명시적 예외) | `PortfolioIssueFetcher.js:155-157` | `PortfolioTopology.jsx:63-92` | `_workspace/dashboard-enhance/02_backend_report.md`와 `PortfolioSpaceIssues.test.js:317-323`의 확정 계약대로 Jira 검색 실패는 wrapper error가 아니라 빈 `issues[]` 성공 응답으로 폴백한다. UI는 빈 결과를 정상 `EmptyState`로 표시한다. |
| Query key·미지정 스페이스 | `portfolioKeys.js:3-7` | `PortfolioTopology.jsx:102-110,338-345,55-61` | `portfolioKeys.spaceIssues(projectId, spaceKey)` factory를 사용하고, `spaceKey:null` 선택에는 안내만 렌더하며 `enabled:false`로 invoke하지 않는다. |
| 5분 클라이언트 캐시 | `portfolioKeys.js:6` | `PortfolioTopology.jsx:102-114` | `staleTime: 1000 * 60 * 5`를 재확인했다. 동일 `(projectId, spaceKey)` 재선택은 5분 동안 React Query 캐시를 사용한다. |
| 테이블·Jira 링크 | `PortfolioTopology.jsx:72-92` | `IssueComponent.js:10-27` | `CommonTable`에 이슈·상태·담당자·실적/계획을 표시하며, 이슈 키는 `router.open(${siteUrl}/browse/${issueKey})`로 Jira를 연다. |
| i18n 원천·병합 | `locales/kr/portfolio.json:394-408`, `locales/en/portfolio.json:395-408` | `locales/ko-KR.json:1785-1799`, `locales/en-US.json:1786-1800` | M8 `issuePanel` 키가 원천 kr/en과 병합 산출물에 모두 존재한다. |

### 실패

없음. 최초 발견한 1분 TTL은 `PortfolioTopology.jsx:114`에서 5분으로 정정되었고, Jira 검색 실패의 빈 결과는 M8 백엔드 확정 계약상 의도된 partial fallback이다.

### 미검증

- 실제 Jira Cloud에서 `asUser()` 결과가 사용자별로 필터되는지와 `ORDER BY timespent DESC`의 운영 동작은 로컬 검증 범위 밖이다.
- 백엔드 전체 Jest는 이번 M8 검증 실행 범위에서 수행하지 않았다. 다만 `src/resolver/portfolioDashboard/__test__/PortfolioSpaceIssues.test.js:106-382`에 allowlist·스코프·asUser·상한·DTO·캐시 테스트가 존재하는 것은 정독으로 확인했다.

### 실행 검증

| 명령 | 결과 |
|---|---|
| `static/ui: npm test -- --runInBand` | 통과 (exit 0) |
| `static/ui: CI=true npm run build` | 통과 (exit 0, gzip 432,936B / 950,000B) |
| `forge lint` | 통과 (exit 0). PermissionLinter의 `Unknown product` 경고는 있었으나 lint 결과는 `No issues found`. |
---

## M8 후속 — 상태 노드 이슈 전개 통합 재검증 (2026-08-14)

### 통과

| 경계면 | 생산자 | 소비자 | 근거 |
|---|---|---|---|
| optional `statusKey` 계약·입력 차단 | `PortfolioIssueService.js:74-81` | `PortfolioTopology.jsx:124-140` | `done`/`inProgress`/`todo`만 허용한다. `{ projectId, spaceKey:null, statusKey }`는 허용하고 `spaceKey:null`·`statusKey` 없음은 `SPACE_KEY_REQUIRED`로 거부한다. |
| JQL 범위 | `PortfolioIssueFetcher.js:70-76,151-168` | `PortfolioSpaceIssues.test.js:131-161` | 스페이스가 있으면 `project = <spaceKey>`를, 없으면 생략해 RMS 프로젝트 전체를 status category로 제한한다. statusKey는 allowlist 매핑으로만 JQL에 삽입하며 캐시 키도 `spaceKey`와 `statusKey`를 모두 포함한다. |
| resolver wrapper·권한 | `PortfolioDashboardController.js:28-29`, `PermissionMap.js:261`, `permissionGuard.js:179` | `PortfolioTopology.jsx:130-137` | `guardedDefine` + `R('REPORT','detail')` 등록을 유지하고, 프론트는 `success` 확인 후 `result.content`만 소비한다. 서비스는 principal 누락 fail-close 및 `scopedProjectIds` 재검증을 유지한다(`PortfolioIssueService.js:89-105`). |
| 상태 클릭 → 그래프 전개 | `PortfolioIssueService.js:112-120` | `PortfolioTopology.jsx:228-289,380-393` | 상태 노드 클릭이 `{ projectId, spaceKey, statusKey }`로 invoke하고 `content.issues`를 `issue:<key>` 노드 및 해당 status 노드의 edge로 렌더한다. 이슈 클릭은 `router.open(${siteUrl}/browse/<key>)`를 사용한다. |
| 사람 계층 제거·3색 상태 | `portfolioAggregate.js:614-671` | `PortfolioTopology.jsx:51-64,158-165,228-237,346-354` | topology 반환값에 people/personProjectEdges가 없고, 상태는 done/inProgress/todo 전용 category·색상(녹색/주황/파랑)으로 렌더된다. 차트 호출부만 `force:{ repulsion:300, edgeLength:[100,200], gravity:0.04 }`를 오버라이드한다. |
| actualMd 기반 이슈 크기 | `PortfolioIssueService.js:49-65` | `PortfolioTopology.jsx:188-191,239-247` | 백엔드 DTO의 `actualMd`를 `createNodeSizer` 입력과 issue node `symbolSize`에 동일하게 사용한다. |
| query key·i18n | `portfolioKeys.js:3-7` | `PortfolioTopology.jsx:124-140`, `locales/kr/portfolio.json:406-416`, `locales/en/portfolio.json:404-414` | query key가 `(projectId, spaceKey, statusKey)`를 모두 포함하며 5분 staleTime을 사용한다. `issueGraph` 원천 번역과 병합 결과 `ko-KR.json:1801-1811`, `en-US.json:1801-1811`을 확인했다. |

### 실패

없음.

### 미검증

- 실제 Jira Cloud의 statusCategory 명칭/사용자별 asUser 가시성 및 ECharts force 전개 체감은 로컬 단위·빌드 검증 범위 밖이다.
- `PortfolioTopology`의 실제 클릭 이벤트를 마운트하는 컴포넌트 테스트는 별도로 존재하지 않아, 상태 클릭→invoke→그래프 갱신은 코드 교차 검증으로만 확인했다.

### 실행 검증

| 명령 | 결과 |
|---|---|
| `npx jest src/resolver/portfolioDashboard/__test__/PortfolioSpaceIssues.test.js --runInBand` | **1 suite / 60 tests 통과** (exit 0) |
| `static/ui: npm test -- --runInBand` | **통과** (exit 0) |
| `static/ui: CI=true npm run build` | **통과** (exit 0, gzip 432,937B / 950,000B) |
| `forge lint` | **통과** (exit 0). Forge CLI 구버전·PermissionLinter `Unknown product` 경고는 있으나 `No issues found`. |
## M8 실화면 결함 수정 최종 교차검증 (2026-08-14)

### 통과

| 경계면 | 생산자 | 소비자 | 근거 |
|---|---|---|---|
| Resolver 성공 envelope | `src/resolver/portfolioDashboard/PortfolioDashboardController.js:28-31` | `static/ui/src/pages/portfolio/widgets/PortfolioTopology.jsx:46-52,64` | Controller가 서비스 DTO를 `{ content: ... }`로 감싸고, `ResponseWrapper.js:9-14`가 이를 `{ success:true, content:<DTO> }`로 spread한다. UI는 `success` 확인 뒤 `result.content`, 이어서 `result.content.issues`만 소비한다. 서비스 DTO의 `issues`는 `PortfolioIssueService.js:112-120`에서 생성된다. |
| zero-count 스페이스 보존 | `static/ui/src/pages/portfolio/utils/portfolioAggregate.js:632-638` | `PortfolioTopology.jsx:66,81,87` | `spaces[]` 항목마다 count와 무관하게 `spaceNodes` 및 `projectSpaceEdges`를 추가한다. 상태 노드만 `portfolioAggregate.js:620-627`에서 `count > 0`으로 제한하므로 count 0 스페이스도 triangle 및 프로젝트→스페이스 edge로 보인다. 회귀 테스트는 `portfolioAggregate.test.js:327-334`가 고정한다. |
| 배포 후 데이터 조건 | `src/rdb/schema/migrate.js:61-63`, `src/rdb/schema/ddl/portfolioSnapshot.sql.js:66-68` | `PortfolioDashboardController.js:14-16`, `manifest.yml:50-56,112-118` | v019 `spaces_json` 컬럼 적용 뒤 새 스냅샷 집계가 필요하다. 배포 후 REPORT write 권한 사용자가 `triggerPortfolioAggregation`을 호출해 큐 consumer(`queue/consumer.js:114-122`)를 완료시키거나, 일 단위 `portfolio-snapshot` scheduled trigger를 기다려야 한다. 기존 NULL/구 스냅샷은 재집계 전 스페이스 데이터를 제공하지 않는다. |

### 실패

없음.

### 미검증

- 실제 Forge 배포 후 v019 마이그레이션 실행 및 큐 재집계 완료 여부는 로컬 검증 범위 밖이다.

### 실행 검증

| 명령 | 결과 |
|---|---|
| `npx jest src/resolver/portfolioDashboard/__test__/PortfolioSpaceIssues.test.js --runInBand` | **1 suite / 60 tests 통과** (exit 0) |
| `static/ui: npm test -- --runInBand src/pages/portfolio/utils/__test__/portfolioAggregate.test.js src/utils/queryKey/queryKeyFactories.test.js src/utils/__test__/jiraIssueUrl.test.js` | **3 suites / 46 tests 통과** (exit 0) |
| `static/ui: CI=true npm run build` | **통과** (exit 0) |

---
