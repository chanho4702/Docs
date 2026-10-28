# 전사 통합 대시보드 (Portfolio Dashboard) — 통합 정합성 검증 리포트

> integration-verifier · 2026-06-02 · 기준: `01_architect_design.md` v3 §2 경계면 계약
> 방법: 백엔드 생산자(resolver/service/aggregator/query) ↔ 프론트 소비자(page/widget/util) **양쪽 동시 읽기** 교차 비교 + jest/build 실행
> 종합 판정: **배포 가능 (차단 이슈 0건, 코스메틱 1건만 권고)**

---

## 통과 (PASS)

### A. 경계면 — 응답 shape ↔ 소비 경로 (★ 핵심)

| # | 항목 | 생산자 (파일:라인) | 소비자 (파일:라인) | 결과 |
|---|------|-------------------|-------------------|------|
| 1 | **루트 펼침 소비** | `PortfolioDashboardController.js:8` responseWrapper → 루트 `{success,...result}` | `PortfolioDashboardPage.jsx:45-46` `data?.success===true` / `data.projects`, :92-99 `data.roleMeta/levelMeta/salaryBuckets/utilization/problemIssues` 루트 직접 | ✅ content 래핑 없음, 양쪽 일치 |
| 2 | **projects[] 필드** | `PortfolioDashboardService.js:110-139` (projectId/projectName/statusName/completionRate/scheduleRate/diffPercentPoint/diagnosisStatus/plannedTotalMd/actualTotalMd/actualMm/riskScore/riskProjectFlag/issueSummary/memberCount/totalSalary/avgUtilization/aggregatedAt/isStale/members/monthlyEffort) | 테이블 `PortfolioProjectTable.jsx:57-104`, 요약 `portfolioAggregate.js:28-48`, 리스크 `:184-194` | ✅ 키·camelCase 100% 일치, 오타 없음 |
| 3 | **members[] 6필드** | service `:137` `parseJson(r.members_json)` → aggregator `:268-275` `{accountId,displayName,roleKey,levelKey,salary,effortMd}` (effectiveMmDays/utilization 미저장) | 재집계 `roleLevelDistribution`(roleKey/levelKey), `salaryHistogram`(accountId/salary), `workDistribution`(effortMd) — `portfolioAggregate.js:56-178` | ✅ 6필드만 사용. 없는 effectiveMmDays/utilization 참조 **없음** |
| 4 | **★필터 무관 위젯** | `utilization`·`problemIssues` 글로벌 | `PortfolioUtilization.jsx:18` `{utilization}`만 받음(selectedProjects 미수령), `PortfolioProblemBubble.jsx:12` `{problemIssues}` 원본 직접. `PeopleCostTab.jsx:53` `badge="noFilter"`, `RiskSection` 문제버블 noFilter 배지 | ✅ selectedIds 재집계 안 함, "필터 무관" 배지 부착 |
| 5 | **utilization 구조** | service `:146-151` `{buckets:[{band,label,count}],totalPeople,avgUtilization}` (read-time `bucketize` :50-62) | `PortfolioUtilization.jsx:21-32,59-62` buckets/totalPeople/avgUtilization 소비 | ✅ 일치 |
| 6 | **triggerPortfolioAggregation** | service `:180-192` `{started:true, lastAggregatedAt}` fire-and-forget | `PortfolioDashboardPage.jsx:35-43` useMutation + 8초 후 invalidate | ✅ 일치 |
| 7 | **빈/EMPTY·실패 분기** | service `:64-73` `emptyShape`(success:true, 빈 배열/객체, salaryBuckets 기본경계) | page `:69` `isError\|\|(data&&!isSuccess)` → 에러, `:74` `aggregateStatus==='EMPTY'` → 위젯 숨김+안내 (헤더 `PortfolioHeader.jsx:68-72`) | ✅ EMPTY 를 에러로 처리 안 함 |
| 8 | **queryKey 팩토리** | — | `portfolioKeys.js:5` `dashboard:()=>['portfolio','dashboard']`, page `:29` 사용. 인라인 키 없음 | ✅ |

### B. 재사용 함수 경계면 (필드명 실코드 대조)

| 항목 | 생산자 필드 | 소비(aggregator) | 결과 |
|------|-----------|------------------|------|
| 워크로그 페처 | `ResourceWorklogFetcher.js:15-21` `{issueKey,accountId,date,timeSpentSeconds}` | `PortfolioAggregator.js:253-256`(date/accountId/timeSpentSeconds), `:320`(issueKey) | ✅ |
| normalizeIssue | `ProgressCalculator.js:26-40` `{key,statusKey,dueDate,plannedSeconds,actualSeconds,assignee{displayName}}` | `computeProblemIssues` `:86-118` (statusKey==='done', dueDate, actual/plannedSeconds, assignee?.displayName) | ✅ statusCategory.key='done' 정합 |
| computeStatusDistribution | `ProgressCalculator.js:119` `byCount.{done,inProgress,todo}` | aggregator `:346-348` `statusDist.byCount.*` | ✅ |
| computeLeaveDeductionMap (export 승격) | `ResourceAnalysisService.js:35` `Map<account_id,{days,deduction}>`, 입력 `{account_id,schedule_start_date,schedule_end_date,work_ratio}` | aggregator `:191,306` `.get(accId)?.deduction`, dedup키 `:208` 동일 필드 | ✅ Map.get 사용, 필드 일치 |
| getActiveProjectsService | `ProjectRepository.js:143-155` `{rows}`, project_id=BIN_TO_UUID, SELECT * snake_case | aggregator `:412-413` `activeResult.rows.map(mapProjectRow)` (`:217-223` snake→camel) | ✅ {rows} 언래핑·매핑 정합 |
| getBulkJiraUsersApi 비일관 | 정상=`[{values}]`/빈입력=`{values:[]}` | `flattenBulkUsers` `:57-66` 배열가드+.values | ✅ |
| getProjectWorkersScheduleRepository | `MyScheduleRepository.jsx:58-61` `rows[]` (account_id/schedule_*) | aggregator `:246` 직접 사용 → leave/dedup | ✅ |
| schedule row 분배 | aggregator `:176-179` `row.account_id` 매칭 | user_schedule 컬럼 account_id | ✅ |

### C. SQL / 컬럼 경계면

- `PortfolioSnapshotQuery.UPSERT`(20 컬럼) ↔ `upsertSnapshot` 파라미터 20개(`PortfolioSnapshotRepository.js:17-38`) **개수·순서 일치**. `members_json`/`monthly_effort_json` = `JSON.stringify`. ✅
- `SELECT_ALL`(BIN_TO_UUID project_id, aggregated_at 포함) ↔ service `:101-139` snake_case 읽기 일치. ✅
- `MEMBER_ROWS`(account_id/role_key/level_key/salary, projectusers, UUID_TO_BIN) — 워크로그 무관 신규 단일 조회. 기존 groupBy*/getSalary 미사용. ✅
- `PROBLEM_INSERT/SELECT_TOP` ↔ replaceProblemIssues/getProblemIssues ↔ service `:153-163` 매핑 일치. ✅

### D. 등록 정합

- `src/index.js:25,29,54` `registerPortfolioDashboardController` import+등록 + `export { runPortfolioSnapshot }`. ✅
- `manifest.yml` function `portfolioSnapshot`(handler `index.runPortfolioSnapshot`, timeout 600) + scheduledTrigger `portfolio-snapshot`(interval day). ✅ (handler 경로는 index re-export 패턴 — 백엔드 리포트 §4-2 명시, runMigration 과 동일 관례)
- `migrate.js:6,22-23` v006/v007 enqueue + ddl import. ✅
- `App.jsx:21,60` `/dashboard` 라우트. `Sidebar.jsx:55-67` mainItems 진입점 + `.filter(permission===null||isReadable)` (REPORT). ✅

### E. 성능 / 규약

- 공통 페치 경로 **미수정**: 워크로그는 `getResourceProjectWorklogs`(전용 병렬 페처 p-limit 5)만 사용, 인원은 신규 `MEMBER_ROWS`. groupByRole/Level/getSalary 미터치. ✅
- 위젯 재집계 전부 `useMemo`(RoleLevelDist:15, Salary*/EffortTrend/WorkDist/Utilization 동일), 추가 invoke 없음 — 단일 useQuery 1회 호출. ✅
- `responseWrapper` 누락 resolver 없음(Controller 2함수 모두 래핑). ✅
- 배치 동시성 `pLimit(2)` + allSettled 격리 + stale-lock(`aggregatingStartedAt`+STALE_LOCK_MS 900s) + finally clear. ✅

### F. i18n

- `locales/kr/portfolio.json`·`en/portfolio.json` 작성, `setting.json` 에 `utilization.*` 추가. ko-KR/en-US **직접수정 없이 merge 반영 확인**:
  - `ko-KR.json.portfolio.{loadError, section.comparisonHint, utilization.totalPeople, problem.delayUnit}` 모두 존재(merge 산출 확인됨).
  - `en-US.json.portfolio.title='Portfolio Dashboard'`, `ko setting.utilization.*` 존재. ✅
- 코드 `t()` 호출 키 전수 대조: page `loadError`, ComparisonTabs `section.comparisonHint`, Utilization `totalPeople`, ProblemBubble `delayUnit` 등 **설계 §11 외 추가키도 전부 소스 json + merge 결과에 존재**. 누락 키 0건. ✅
- 설정 band UI(`EtcSetting.jsx:54-55` `utilizationUnderBand/OverBand`) → `updateSettingService`(`SettingService.js:12,21-22`) → 조회 service `:94-95` read-time band. 필드명 일관. ✅

### G. 테스트 / 빌드 실행

| 대상 | 명령 | 결과 |
|------|------|------|
| 백엔드 | `npm test` (jest) | **3 suites / 41 tests 전부 통과** (기존 21 + 신규 20: riskScore/severity/flattenBulkUsers/mapProjectRow/mergeIntervals/computeProblemIssues/computeGlobalUtilization/computeLeaveDeductionMap 회귀) |
| 프론트 | `react-scripts test --watchAll=false` | **5 suites / 36 tests + 1 snapshot 통과** (신규 portfolioAggregate 15, 골든 픽스처 스냅샷) |
| 프론트 | `npm run build` (prebuild merge 자동) | **컴파일 성공** ("build folder is ready") |

---

## 실패 (FAIL)

**경계면/데이터 정합 실패: 0건.** 백엔드 응답 shape(§2.2)과 프론트 소비 경로가 필드명·구조·중첩까지 100% 일치.

---

## 권고 (코스메틱 — 차단 아님)

| # | 파일:라인 | 내용 | 수정 방법 |
|---|----------|------|----------|
| C1 | `static/ui/src/pages/portfolio/widgets/PortfolioProblemBubble.jsx:45` | 버블 tooltip 의 지연일수 라인에서 `delayUnit`('일'/'d')을 값 **앞**에 배치 → "지연일수: 일 12" 로 어순 어색(데이터는 정상). | `...delayUnit...} ${p.value[0]}` 를 `${p.value[0]} ${tFormat(t,'portfolio.problem.delayUnit',{})}` 로 순서 교체. 단순 표시 문자열, 동작·정합 무관 |

---

## 미검증 (런타임 실데이터 필요)

| 항목 | 사유 |
|------|------|
| 실제 Jira 워크로그 totalMd / monthlyEffort 집계 **수치 정확도** | 배치 산식은 jest 단위(순수함수)로 검증됐으나, 실제 Jira 워크로그·이슈·연차 데이터로 돌린 end-to-end 수치는 런타임 데이터가 있어야만 확인 가능 |
| `computeGlobalUtilization` 의 매트릭스(다중 프로젝트 동일 인원) 합집합 분모 | jest 케이스(기간중첩 이중계상 미발생)는 통과. 실제 인원의 다중 프로젝트 참여 패턴에서의 정확도는 실데이터 필요 |
| payload 크기(members_json 동봉 단일 응답) | 설계 §4.2.1 추정(통상 수백KB)·jest 무관. 활성 프로젝트/인원 실규모에서 Forge invoke 응답 한도 초과 여부는 실배포 측정 필요(§13 명시 위험) |
| migrate v006/v007 실제 적용 + JSON 컬럼 드라이버 반환형 | DDL/enqueue 코드 정합은 확인. Forge SQL 엔진에서 실제 마이그레이션 실행 및 members_json 객체/문자열 반환형은 런타임 확인 필요(`parseJson` 양형 가드는 되어 있음) |
| 배치 stale-lock 자동복구 실동작 | 로직·jest 무관. 실제 배치 사망→STALE_LOCK_MS 경과 재진입은 런타임 시나리오 |

---

## 종합 판정

**배포 가능 (차단 이슈 0 / 수정 필요 0 / 코스메틱 권고 1).**

- 경계면 8대 점검(루트 펼침·projects[]·members[] 6필드·필터 무관 위젯·utilization 구조·trigger·EMPTY 분기·queryKey) **전부 일치**.
- 재사용 함수 7종 필드명 실코드 대조 **일치**(워크로그/normalizeIssue/statusDist/leaveDeduction/activeProjects/bulkUsers/schedule).
- 등록(index/manifest/migrate/route/sidebar)·성능 규약(공통 경로 미오염, useMemo, 단일 invoke)·i18n(merge 반영, 누락 0) **모두 충족**.
- 백엔드 41 + 프론트 36(+snapshot) 테스트 통과, 빌드 성공.
- 유일한 권고는 ProblemBubble tooltip 어순(C1) — 표시 문자열 한 줄, 데이터·정합 영향 없음. 배포 전 1줄 수정 권장.

**우선순위**: (배포 차단 없음) → 선택적으로 C1 1줄 수정 후 배포.
