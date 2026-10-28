# 비용 분석(cost-analysis) — 통합 정합성 검증 리포트 (M1+M2+M2-b+M3)

> 작성: integration-verifier · 2026-06-09 · 슬러그 `cost-analysis`
> 기준: `01_architect_design.md §2 경계면 계약`(단일 진실). 양쪽 소스 동시 읽기로 교차 비교.
> 판정 원칙: 존재 확인이 아니라 **글자 그대로 일치** 확인. 실제 파일/명령 결과로만 판정.

---

## 0. 종합 결과

| 구분 | 건수 |
|---|---|
| **통과(PASS)** | 경계면 14개 항목 전부 + 테스트 3종 |
| **실패(FAIL)** | **0** |
| **미검증(N/V)** | 1 (실 Forge invoke E2E — 런타임 필요) |

**치명적 불일치 없음.** 프로젝트 상세(A) resolver 응답 shape ↔ 프론트 접근 경로, Portfolio(B) 안분식 ↔ 백엔드 동일식, i18n 키, 쿼리키, M2-b salary 도움말, Portfolio zero-touch 전부 일치. 백엔드 jest 66/66, 프론트 jest 48/48, 빌드 성공.

---

## 1. 경계면 일치 검증 표 (계약 ↔ 백엔드 반환 ↔ 프론트 접근)

### 1-A. 프로젝트 상세 `getProjectCostSummary` (content 래핑 없는 루트 spread)

| 계약 필드(§2-A) | 백엔드 반환 (생산자) | 프론트 접근 (소비자) | 판정 |
|---|---|---|---|
| `success` (루트) | `responseWrapper` `{success:true, ...result}` (`ProjectCostController.js:6`) | `CostPage.jsx:46` `data?.success === true` | ✅ 일치 |
| `currency` | `ProjectCostService.js:142` 루트 | `CostKpiHeader.jsx:15` `data?.currency` 등 전 위젯 | ✅ |
| `project.{startDate,endDate,memberCount}` | `ProjectCostService.js:142` | `CostPage.jsx:47` `data?.project?.startDate/endDate` (noPeriod 분기) | ✅ |
| `rates.{scheduleRate,completionRate,burnRate}` | `ProjectCostService.js:143-147` round2 | `CostKpiHeader.jsx:17` `data?.rates?.burnRate` | ✅ |
| `budget.{plannedBudget,actualCost,remaining,earnedValue}` | `CostCalculator.computeBudget` (`:32`) | `CostKpiHeader.jsx:16,28,37`, `CostPage.jsx:48` `plannedBudget` (empty 분기) | ✅ |
| `evm.{cpi,eac,etc,overBudget,overrunAmount}` (cpi/eac/etc null 가능) | `CostCalculator.computeEvm` (`:53`) AC=0→cpi null, cpi≤0→eac null | `CostEvmCard.jsx:24-28` 각 필드 + **null 가드** (`cpi==null?'-'`, eac/etc 동일) | ✅ null 가드 존재 |
| `monthlyCost[].{month,actual,cumulative}` + `plannedBudgetLine` | `allocateMonthlyCost`(`:69`), `:151` | `CostBurnUp.jsx` `monthlyCost[].{month,cumulative}`, `plannedBudgetLine` | ✅ |
| `byRole[]/byLevel[].{key,planned,actual,memberCount}` (key null 가능) | `groupCostByKey`(`:92`) key=null 그룹 | `CostByRoleLevel.jsx:29,36-38` `data?.byRole/byLevel`, `g.key==null?'-'` | ✅ null 가드 존재 |
| `byIssue[].{issueKey,summary,actualMd,cost,costPerMd}` (costPerMd null 가능, cost desc, cost>0) | `allocateIssueCost`(`:123`) cost>0 필터·desc 정렬·costPerMd null | `CostIssueTable.jsx:28-57` 각 필드 + `costPerMd==null?'-'` 가드, 백엔드 정렬 그대로 | ✅ null 가드 존재 |
| `noPeriod` 분기 = startDate/endDate 없음 | scheduleRate=0 경로, project.startDate null 반환 | `CostPage.jsx:47,63` `!hasPeriod` → `cost.noPeriod` | ✅ 백엔드 실반환과 일치 |
| `empty` 분기 = plannedBudget===0 | totalSalary=0 시 plannedBudget=0 | `CostPage.jsx:48,69` `!hasBudget` → `cost.empty` | ✅ |
| 실패 분기 `success===false`/`error` | `LogicalError('PROJECT_ID_REQUIRED')` → 직렬화 | `CostPage.jsx:57` `data && !isSuccess` → `cost.error` | ✅ 처리됨 |
| 함수 매핑 | `src/index.js:26,56` import+`registerProjectCostController(resolver)` | `CostPage.jsx:37` `invoke('getProjectCostSummary', {projectId, coworkerFieldId})` | ✅ fnName·파라미터 일치 |
| 쿼리키 | — | `projectKeys.js:23` `cost:(projectId)=>['projectCost',projectId]` ↔ `CostPage.jsx:36` `projectKeys.cost(project_id)` | ✅ 팩토리 정의·사용 일치 |

> **안분 확정식 일치(핵심):** 백엔드 `actualCost = round(totalSalary × scheduleRate)` (`CostCalculator.js:18-22,34`), `CPI = round2(EV/AC)` = `completionRate/scheduleRate` 동형 (`computeEvm:55`), A8 워크로그 비중 안분 (`allocateIssueCost:162` `salary×sr×(sec/memberSec)`). 설계 §1과 글자 일치.

### 1-B. Portfolio(B) 프론트 재집계 ↔ 백엔드 동일식

| 항목 | 백엔드(A) 식 | 프론트 `portfolioAggregate.js` 식 | 판정 |
|---|---|---|---|
| 프로젝트별 실집행 | `totalSalary × scheduleRate` | `projActual(p)` `:319` `round(totalSalary × scheduleRate)` | ✅ 동일식 |
| 프로젝트별 CPI | `EV/AC = completionRate/scheduleRate` (가드 null) | `projCpi(p)` `:327` `sr<=0→null; round2(completionRate/sr)` | ✅ 동일식·동일 가드 |
| 소진율 | `burnRate = scheduleRate` | `projBurnRate(p)` `:323` `round2(scheduleRate)` | ✅ |
| costLevel(B7) | (설계 §4-3) cpi<1→red / sr>cr+0.1→amber / green | `projCostLevel(p)` `:333` 동일 | ✅ |
| B1~B6 소비 | — | `costKpi/costPlannedActual/costOverrunRank/costProgressScatter/monthlyBurnRate/costByRoleLevel` 전부 위 헬퍼 재사용 | ✅ 단일 진실 일치 |
| B7 tsrSignals 소비 | `tsrSignals().resource.{burnRate,cpi,costLevel}` (`:299-301`) | `PortfolioTsrSignalTable.jsx:57-58,70` `sig.resource.{cpi,costLevel,burnRate}` | ✅ |

> **두 곳이 같은 비용을 다르게 계산하지 않음** — 백엔드 `getProjectCostSummary`(A)와 프론트 `portfolioAggregate`(B)가 `totalSalary×scheduleRate`·`completionRate/scheduleRate`로 동일. 불일치 없음.

### 1-C. M2-b salary 입력 기준 명시 (3곳)

| 입력 지점 | 도움말 적용 | 입력 동작 | 판정 |
|---|---|---|---|
| `ProjectUserPanel.jsx:64-75` salary 헤더 | `Tooltip content={t('cost.salaryBasis.help')}` + InformationIcon | InlineEdit 무변경(헤더 셀에만 비침습 추가) | ✅ |
| `UserRegistrationModal.jsx:148` | `<HelperMessage>{t('cost.salaryBasis.help')}</HelperMessage>` | Field 입력 무변경 | ✅ |
| `UserEditModal.jsx:185` | `<HelperMessage>{t('cost.salaryBasis.help')}</HelperMessage>` | Textfield 입력 무변경 | ✅ |

3곳 모두 단일 키 `cost.salaryBasis.help` 공유. 키는 `locales/kr|en/cost.json` 존재 + merged 반영 확인.

### 1-D. i18n 키 교차 확인

| 검사 | 결과 |
|---|---|
| `cost.*` t() 참조 키(58건, projectDetail/cost) | 전부 `locales/kr|en/cost.json` 존재 — **누락 0** |
| `portfolio.cost.*` t() 참조 키(CostTab+위젯6+TsrTable) | 전부 `locales/kr|en/portfolio.json` cost 네임스페이스 존재 — **누락 0** (en 필수 20키 missing NONE) |
| merge 반영 (`ko-KR.json`/`en-US.json`) | `cost.tab.label`, `cost.salaryBasis.help`, `cost.evm.cpi`, `portfolio.cost.{kpi.title,tsr.costSignal,overrunRank.colState,scatter.x,byRoleLevel.role,empty}` 등 — ko/en 둘 다 **missing NONE** |
| ko-KR/en-US 직접 수정 금지 | 준수 (merge 산출물) |

### 1-E. Portfolio 백엔드 zero-touch

| 대상 | git status/diff | 판정 |
|---|---|---|
| `PortfolioAggregator.js`, `portfolio_project_snapshot` 스키마, `getPortfolioDashboard`(Controller/Service), manifest.yml, `src/rdb/schema`(migrate), queue, trigger | **변경 없음** (`git status --porcelain` 출력 없음, `git diff --stat HEAD` 빈 결과) | ✅ 완전 zero-touch |
| 백엔드 전체 변경 | `M src/index.js`(등록 1줄) + `?? src/resolver/projectCost/`(신규) **만** | ✅ 설계 §3-2 준수 |

---

## 2. 테스트 / 빌드 실행 결과

| 실행 | 명령 | 결과 |
|---|---|---|
| 백엔드 jest | (루트) `npm test` | **PASS — 4 suites / 66 tests, 실패 0** (CostCalculator.test 포함) |
| 프론트 jest | `static/ui` `npx jest --ci` | **PASS — 5 suites / 48 tests / 1 snapshot, 실패 0** (portfolioAggregate.test 포함, tsrSignals 스냅샷 갱신 반영) |
| 프론트 빌드 | `static/ui` `npm run build` (prebuild merge 자동) | **성공 — "Compiled with warnings"**. cost 관련 에러/경고 0. 남은 경고는 기존 marklassian source-map · node 모듈 타입 경고(본 작업 무관) |

---

## 3. 미검증 (런타임 필요 — 추측 통과 안 함)

1. **실 Forge invoke E2E**: Forge 런타임에서 실제 프로젝트로 `getProjectCostSummary` 호출 시 응답 shape·KVS 10분 캐시 hit/miss 경로(byIssue 재구성)·실데이터 scheduleRate=0/completionRate=0 프로젝트의 evm null 표기는 본 정적 검증 범위 밖. 코드/소비 경로는 계약과 100% 정합하나, 실 데이터 동작 확인은 E2E 단계 몫.
   - 특히 확인 권장: ① 시작 전 프로젝트(scheduleRate=0) → actualCost=0, evm 전부 null, 프론트 "-"/배지 표기. ② 캐시 hit 시 `_scheduleRate`/`_hourRate`로 byIssue만 재구성되는지. ③ A5 byRole/byLevel key→name 매핑(`useRoleLevel`)이 실 role/level id와 매칭되는지.

---

## 4. 결론

- 경계면 정합성: **A(resolver↔프론트) / B(백엔드식↔프론트식) / M2-b(도움말) / i18n / 쿼리키 / zero-touch 전 항목 일치, 치명적 불일치 0.**
- 테스트·빌드 전부 통과.
- 잔여: 실 Forge invoke E2E 1건(런타임 의존, 미검증으로 명시).
- backend/frontend 재호출 불필요.
