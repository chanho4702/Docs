# 비용 분석(cost-analysis) 설계서

> 슬러그: `cost-analysis` · 작성: feature-architect · 2026-06-09
> 단일 진실 원천. backend/frontend/verifier는 §2 경계면 계약 표를 글자 그대로 구현·검증한다.
> 기존 코드 실독 기반 (PortfolioAggregator / ProjectProgressService / ResourceWorklogFetcher / IssueAnalysisService / portfolioAggregate / ProgressCalculator).

---

## 1. 결정 요약 (핵심 — 모든 위젯의 단일 근간)

### 1-1. 실집행 비용 안분 기준 → **(a) 시간경과 안분 채택. (c) 진척 안분은 CPI/EAC 계산용 보조 신호로 병기.**

- **확정식 (멤버 실집행):** `actualCost(member) = salary × elapsedRatio`
  여기서 `elapsedRatio = min(1, 경과근무일 / 전체근무일)` = **프로젝트 단위 `scheduleRate`** (이미 `computeScheduleRate`/`scheduleRate`로 산출, 스냅샷·진척서비스 양쪽에 존재).
  → 멤버 단위 안분이지만 elapsedRatio가 전원 동일하므로 **프로젝트 실집행 = Σsalary × scheduleRate = totalSalary × scheduleRate**.
- **근거:**
  1. requirement 2절 권장 출발점이 (a)이고, 기존 배치가 근무일/일정률(`scheduleRate`)을 이미 계산 → **zero 추가연산**.
  2. (b) 공수 안분은 "멤버별 계획 effortMd"가 데이터에 없음(projectusers에 계획공수 컬럼 부재) → 채택 불가.
  3. (c) 진척 안분(`salary × completionRate`)은 EVM의 EV(획득가치)와 동형이라 **CPI/EAC에는 (c)를 EV로 쓰되**, "실집행(AC, 돈이 나간 정도)"의 기본 표기는 시간경과(a)로 둔다. 즉 **소진율=시간경과 기반, 효율(CPI)=진척/시간경과 비교**로 의미 분리. 이 분리가 A6/A7의 정보가치를 만든다.
- **EVM 매핑 (A6/A7 전용 보조):**
  - `BAC`(완료시 총예산) = `totalSalary` (=Σsalary, 계획예산)
  - `AC`(실집행) = `totalSalary × scheduleRate` ← (a)
  - `EV`(획득가치) = `totalSalary × completionRate` ← (c)
  - `CPI = EV / AC = completionRate / scheduleRate` (AC=0 가드 → null)
  - `EAC = BAC / CPI = totalSalary × scheduleRate / completionRate` (CPI=0/completionRate=0 가드 → null)
  - `소진율(burnRate) = AC / BAC = scheduleRate`
  - 잔여예산 = `BAC − AC = totalSalary × (1 − scheduleRate)`

### 1-2. A8 이슈별 비용 안분 → **워크로그 비중 안분 (1-1과 정합).**

- **확정식:** `issueCost = Σ_member( memberActualCost × (해당이슈에서 그 멤버 워크로그초 ÷ 그 멤버 전체 워크로그초) )`
  - `memberActualCost = salary × scheduleRate` (1-1과 동일 기준).
  - 멤버 전체 워크로그초 = 0 인 멤버(워크로그 미기록)는 그 멤버 비중 분배에서 제외(분모 0 가드) → 비용 미배분.
  - `MD당단가(issue) = issueCost ÷ issueActualMd` (issueActualMd = 이슈 실투입MD = Σ 그 이슈 워크로그초/denom; 0 가드 → null).
- **근거:** salary를 진척/시간이 아닌 "워크로그 기록 위치"로 이슈에 내리는 것은 requirement 4-(4)에서 명시한 기준이며, **개인 비용 표시가 아니라 작업(이슈) 해상도**라 6절 미채택 원칙과 충돌 안 함.
- **데이터 출처(신규 페치 0):** `getResourceProjectWorklogs({projectId})` 가 이미 `{issueKey, issueSummary, accountId, timeSpentSeconds}` flat 행을 반환 → 멤버별·이슈별 초 집계 가능. 멤버 salary는 `getProjectMemberRows` 또는 summary로 조달.

### 1-3. Portfolio 스냅샷 vs 온디맨드 분리

- **프로젝트 상세(A): 온디맨드.** 단일 프로젝트라 `ProjectProgressService` 와 동형의 신규 resolver 1개 + KVS 10분 캐시. (across 집계 아님 → 허용)
- **Portfolio(B): 스냅샷 재사용 — 백엔드 zero-touch.** 비용 위젯에 필요한 입력(`totalSalary`, `scheduleRate`, `completionRate`, `monthlyEffort`, `members[salary/roleKey/levelKey]`, `startDate/endDate`)이 **모두 기존 스냅샷·`getPortfolioDashboard` 응답에 이미 존재**. → **PortfolioAggregator·스냅샷 스키마·resolver 전부 변경 없음.** 프론트 `portfolioAggregate.js`에 비용 순수함수만 추가하고 CostTab 위젯 교체.

### 1-4. 프로젝트 상세 비용 탭 — **신규 최상위 탭 (신규 resolver).**

- `projectDetailTabs` 에 `projectCost` 탭 신규 추가(진척 탭과 동급 형제). 진척/리소스 리포트 서브탭에 끼워넣지 않음 — A는 7개 위젯의 독립 화면이라 전용 탭이 정합.
- 신규 resolver `getProjectCostSummary` 1개로 A1~A8 전부 충당(단일 페치 세트 재사용).

### 1-5. 통화·반올림 규칙

- 통화: `settings.currency` (기본 KRW). 백엔드는 **raw 숫자(원 단위)만** 반환. 표기(₩, M 단위 축약, 천단위 콤마)는 **프론트 포매터 단일화** (`static/ui/src/pages/portfolio/utils/` 또는 신규 `utils/costFormat.js`).
- 비용 숫자: 백엔드 `Math.round`(원 단위 정수). 비율(소진율/CPI 등): 소수 둘째자리(`round2`).

---

## 2. 경계면 계약 표 (단일 진실)

### 2-A. 프로젝트 상세 — 신규 resolver

응답은 **content 래핑 없이 루트 직접 노출** (`ProjectProgressService` 관례 그대로: `res.success` + 필드 루트 spread). responseWrapper가 `{success:true, ...result}` 로 펼침.

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시, 루트 spread) | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `getProjectCostSummary` | `{ projectId, coworkerFieldId }` | 아래 블록 | `useQuery(projectKeys.cost(projectId))` → `invoke('getProjectCostSummary', {projectId, coworkerFieldId})` |

```
// responseWrapper 펼침 후 프론트가 받는 객체 (data.success === true)
{
  success: true,
  currency: "KRW",                       // settings.currency
  project: { startDate: "2026-01-01"|null, endDate: "2026-06-30"|null, memberCount: 12 },
  rates: {
    scheduleRate: 0.62,                  // 0~1, round2 (=elapsedRatio, 안분계수)
    completionRate: 0.55,                // 0~1, round2
    burnRate: 0.62                       // = AC/BAC = scheduleRate (소진율)
  },
  // A1 / A2 — 요약 KPI + 계획 vs 실집행
  budget: {
    plannedBudget: 360000000,            // BAC = Σsalary = totalSalary (정수, 원)
    actualCost: 223200000,               // AC = plannedBudget × scheduleRate
    remaining: 136800000,                // plannedBudget − actualCost
    earnedValue: 198000000               // EV = plannedBudget × completionRate (A7/A6 참고치)
  },
  // A6 / A7 — EVM 효율·예측
  evm: {
    cpi: 0.89,                           // EV/AC, round2, null 가능(AC=0)
    eac: 404494382,                      // BAC/CPI, 정수, null 가능(cpi null/0)
    etc: 181294382,                      // EAC − AC (잔여 예측), null 가능
    overBudget: true,                    // eac > plannedBudget (null 이면 false)
    overrunAmount: 44494382              // max(eac − plannedBudget, 0), null 이면 0
  },
  // A3 — 월별 비용 소진(Burn-up)
  monthlyCost: [                         // monthlyEffort 비중 안분: actualCost × (month md / Σmd)
    { month: "2026-01", actual: 32000000, cumulative: 32000000 },
    { month: "2026-02", actual: 41000000, cumulative: 73000000 }
  ],
  plannedBudgetLine: 360000000,          // 예산선(수평) — 프론트가 monthlyCost 위에 그림
  // A5 — 역할/레벨별 비용 분포
  byRole: [                              // roleKey 그룹
    { key: "role-be"|null, planned: 120000000, actual: 74400000, memberCount: 4 }
  ],
  byLevel: [                             // levelKey 그룹 (동일 shape, key=levelKey)
    { key: "lvl-senior"|null, planned: 200000000, actual: 124000000, memberCount: 6 }
  ],
  // A8 — 이슈별 비용 & MD당 단가
  byIssue: [                             // issueCost desc 정렬, 비용>0 만
    {
      issueKey: "PROJ-12",
      summary: "결제 모듈",
      actualMd: 18.5,                    // 이슈 실투입MD (round1)
      cost: 23400000,                    // Σmember 안분 (정수)
      costPerMd: 1264865                 // cost/actualMd 정수, null 가능
    }
  ]
}
```

성공이나 데이터 부족 시: `project.startDate|endDate` null → 프론트 `noPeriod` 안내. `budget.plannedBudget===0` → `empty` 안내(진척 페이지 `hasEffort` 패턴 동일).

### 2-B. Portfolio — 백엔드 변경 없음 (기존 `getPortfolioDashboard` 응답 재사용)

신규 resolver 없음. 프론트 `portfolioAggregate.js` 순수함수가 기존 `projects[]` (members/monthlyEffort/totalSalary/scheduleRate/completionRate/diagnosisStatus 동봉)에서 재집계.

| 프론트 순수함수 (신규, portfolioAggregate.js) | 입력 | 출력 shape | 소비 위젯 |
|---|---|---|---|
| `costKpi(selected)` | projects[] | `{ totalBudget, totalActual, burnRate }` | B1 PortfolioCostKpi |
| `costPlannedActual(selected)` | projects[] | `{ categories:[name], planned:[..], actual:[..] }` | B2 PortfolioCostPlannedActual |
| `costOverrunRank(selected, n=10)` | projects[], n | `[{ name, projectId, cpi, burnRate, completionRate, overrun:boolean }]` (cpi asc / 위험순) | B3 PortfolioCostOverrunRank |
| `costProgressScatter(selected)` | projects[] | `[{ name, projectId, burnRate, completionRate, quadrant:'highCostLowProg'|... }]` | B4 PortfolioCostScatter |
| `monthlyBurnRate(selected)` | projects[] | `{ months:[YYYY-MM], data:[전사 월별 실집행] }` (월별 안분 합산) | B5 PortfolioMonthlyBurn |
| `costByRoleLevel(selected, axis, meta)` | projects[], 'role'|'level', meta | `{ categories:[label], planned:[..], actual:[..] }` (전사 key 그룹) | B6 PortfolioCostByRoleLevel |

> B7(T/S/R Cost 신호): 기존 `tsrSignals()` 의 `resource` 블록에 cost 신호 **필드 추가**(아래 §4-3). resolver 무변경.

각 함수의 비용 계산은 프론트에서 프로젝트별 `actual = totalSalary × scheduleRate`, `cpi = completionRate/scheduleRate` 로 산출(백엔드와 동일식 — 단일 진실은 본 설계서 §1).

---

## 3. 백엔드 설계

### 3-1. 신규: 프로젝트 상세 비용 (도메인 `projectCost`)

```
src/resolver/projectCost/
  ProjectCostController.js     // registerProjectCostController(resolver) — getProjectCostSummary 등록
  ProjectCostService.js        // 페치 오케스트레이션 + 캐시 + assemble
  CostCalculator.js            // 순수함수 (jest 대상) — Forge 의존 0
```

- **`CostCalculator.js` 순수함수 (jest 대상):**
  - `allocateActualCost(totalSalary, scheduleRate)` → AC
  - `computeBudget(totalSalary, scheduleRate, completionRate)` → `{plannedBudget, actualCost, remaining, earnedValue}`
  - `computeEvm(plannedBudget, actualCost, earnedValue)` → `{cpi, eac, etc, overBudget, overrunAmount}` (가드 포함)
  - `allocateMonthlyCost(monthlyEffort, actualCost)` → `[{month, actual, cumulative}]` (md 비중 안분, Σmd=0 가드 → 균등 0)
  - `groupCostByKey(members, scheduleRate, keyField)` → `[{key, planned, actual, memberCount}]` (members[].salary 기반)
  - `allocateIssueCost(worklogRows, memberSalaryMap, scheduleRate, hourRate)` → `[{issueKey, summary, actualMd, cost, costPerMd}]`
    - 단계: (1) 멤버별 총초 `Σ`, (2) (멤버,이슈)별 초, (3) issueCost = Σmember( salary×scheduleRate × issueSec/memberTotalSec ), (4) issueActualMd = Σ issueSec/denom.
- **`ProjectCostService.getProjectCostSummaryService({projectId, coworkerFieldId})`:**
  - 캐시키 `ProjectCost:{projectId}`, KVS 10분 TTL (진척 서비스와 동일 정책). 캐시엔 rate/budget/byRole/byLevel/monthlyCost 저장, **byIssue·members raw는 캐시 제외**(payload 상한 — 진척 서비스가 issues[]를 캐시서 뺀 패턴 동일). 캐시 hit 시 worklog만 재페치해 byIssue 재구성.
  - 병렬 페치(Promise.all): `getSettingDataService()`, `getSummaryDataService({project_id})`(totalSalary/기간/memberCount), `getProjectMemberRows(projectId)`(salary/roleKey/levelKey/accountId), `getResourceProjectWorklogs({projectId})`, `fetchAllIssues(projectId, coworkerFieldId)`(완성률용).
  - 진척률(completionRate)·일정률(scheduleRate)은 `ProgressCalculator` 의 `normalizeIssue`/`computeCompletion`/`computeScheduleRate` + `getWorkdaysInRange`/`buildHolidayMap` 재사용(진척 서비스와 동일 산식 — 일관성 보장). **계산 로직 복붙 아니라 import 재사용.**
  - **재사용 import 출처:** `../projectProgress/ProgressCalculator`, `../resourceAnalysis/ResourceWorklogFetcher`, `../projectDashboard/ProjectDashboardService`(getSummaryDataService), `../portfolioDashboard/PortfolioSnapshotRepository`(getProjectMemberRows — 단, projectCost가 portfolio에 의존하는 결합이 싫으면 동일 쿼리 `PortfolioSnapshotQuery.MEMBER_ROWS` 를 직접 호출하는 얇은 repo 신설 가능. **권장: getProjectMemberRows 재사용**), `../backoffice/setting/SettingService`, `../backoffice/publicHoliday/PublicHolidayService`, `../../api/jira/issue/IssueApi`(getProjectIssuesByFilter), `../../api/jira/field/FieldApi` 불필요(coworkerFieldId는 프론트 전달).
- **에러:** projectId 없으면 `LogicalError('PROJECT_ID_REQUIRED', ...)` (진척 서비스 동일). responseWrapper가 직렬화.
- **`src/index.js` 등록:** import `registerProjectCostController` + 호출 1줄 추가(54번 라인 뒤).

### 3-2. Portfolio 백엔드 — **변경 없음 (zero-touch).**

- `PortfolioAggregator`, `portfolio_project_snapshot` 스키마, `getPortfolioDashboard` 응답 모두 무변경. 필요한 비용 입력 전부 기존 응답에 존재(검증 완료).

---

## 4. 프론트엔드 설계

### 4-1. 프로젝트 상세 비용 탭 (A)

```
static/ui/src/pages/projectDetail/cost/
  CostPage.jsx                 // ProgressPage.jsx 와 동형 셸 (coworkerFieldId useQuery → invoke → 상태분기)
  CostKpiHeader.jsx            // A1 요약 KPI 타일 4개 (예산/실집행/소진율/잔여)
  CostPlanActualBar.jsx        // A2 계획 vs 실집행 막대 (ECharts)
  CostBurnUp.jsx               // A3 월별 누적 실집행 vs 예산선 (ECharts line + markLine)
  CostByRoleLevel.jsx          // A5 역할/레벨 토글 누적막대 (planned/actual)
  CostEvmCard.jsx              // A6+A7 EAC/CPI 카드 + 초과경보 배지
  CostIssueTable.jsx           // A8 이슈별 비용·MD당단가 (DynamicTable, cost desc)
  CostPage.css
```

- **탭 등록:** `static/ui/src/constants/tabs.js` `projectDetailTabs` 에 `projectCost` 항목 추가(`projectProgress` 형제, 아이콘 `@atlaskit/icon/core/billing` 또는 `coins`). `canRender: () => canReadReport` 동일 게이트(권한 인자 이미 시그니처에 존재).
- **쿼리키:** `static/ui/src/utils/queryKey/projectKeys.js` 의 `projectKeys` 객체에 `cost: (projectId) => ['projectCost', projectId]` 추가.
- **호출:** `invoke('getProjectCostSummary', { projectId: project_id, coworkerFieldId })`. 응답 루트 직접 소비(`data.success`, `data.budget`, ...). 상태분기: `noPeriod`(project.startDate/endDate 없음) / `empty`(budget.plannedBudget===0) / 정상 — ProgressPage 패턴 복제.
- **차트:** ECharts(`echarts-for-react`) — 기존 진척/포트폴리오 위젯과 동일 라이브러리. 통화 포맷은 신규 `static/ui/src/utils/costFormat.js`(`formatCurrency(v, currency)`, `formatM(v)` ₩M 축약).

### 4-2. Portfolio CostTab 고도화 (B)

- **`portfolioAggregate.js`** 에 §2-B 의 6개 순수함수 추가(기존 파일 끝에 append, 기존 함수 무수정).
- **`tabs/CostTab.jsx`** 전면 교체: 기존 2개 위젯(SalaryByProject/SalaryHistogram) → B1~B6 위젯 그리드. (기존 salary 위젯은 Resource 성격이라 유지하되 Cost탭에선 제거; 보존 원하면 ResourceTab로 이동 — **권장: CostTab에서 비용 위젯으로 교체, 기존 salary 위젯 파일은 삭제 안 하고 미참조로 둠**).
- **신규 위젯 파일** (`static/ui/src/pages/portfolio/widgets/`):
  - `PortfolioCostKpi.jsx` (B1), `PortfolioCostPlannedActual.jsx` (B2), `PortfolioCostOverrunRank.jsx` (B3, DynamicTable), `PortfolioCostScatter.jsx` (B4, ECharts scatter 사분면), `PortfolioMonthlyBurn.jsx` (B5, line), `PortfolioCostByRoleLevel.jsx` (B6, 누적막대 + role/level 토글).
  - 모두 `WidgetCard` + `useMemo`로 순수함수 호출(추가 invoke 0) — 기존 위젯 관례 동일.
- **`CostTab` props:** 현재 `{selectedProjects, salaryBuckets}` → `{selectedProjects, roleMeta, levelMeta, currency}` 로 확장. `ComparisonTabs` 에서 `roleMeta/levelMeta` 이미 보유 → CostTab 호출부에 전달 추가. currency는 `data.currency`가 portfolio 응답에 없음 → §6 참조(기본 'KRW' 상수 + 추후 설정연동).

### 4-3. B7 — T/S/R Cost 신호 (tsrSignals 확장)

- `portfolioAggregate.js` 의 `tsrSignals()` 반환의 `resource` 블록에 **필드 추가**(기존 필드 보존):
  `resource: { ...기존, burnRate, cpi, costLevel }`
  - `burnRate = scheduleRate`, `cpi = completionRate/scheduleRate`(가드 null)
  - `costLevel`: `cpi != null && cpi < 1 → 'red'` / `소진율 > 진척률 + α(0.1) → 'amber'` / else `'green'`.
- `PortfolioTsrSignalTable.jsx` 에 Cost 신호 컬럼(또는 resource 셀 내 배지) 추가. 기존 행 구조 유지.

### 4-4. 권한

- A 탭: `canReadReport`(projectDetailTabs 인자, 기존). B: 페이지 자체가 `canRead('REPORT')` 게이트(기존) — 추가 권한 불필요.

### 4-5. salary 입력 기준 명시 (인원관리 UX) — **사용자 요청(2026-06-09)**

> salary가 "프로젝트 기간 동안 해당 인원에게 들어가는 **총 비용**(월급 아님)"임을 **입력 지점에서** 사용자에게 고지한다. 비용 분석의 모든 숫자가 이 입력 의미에 의존하므로, 오입력(월급 입력) 방지가 데이터 신뢰의 근간.

- **대상 입력 지점 3곳:**
  1. **프로젝트 인력 패널** `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` — salary 컬럼(`projectDetail.user.table.head.3`, InlineEdit). **핵심 대상.** 테이블 헤더 셀에 도움말 아이콘(`@atlaskit/icon/core/status-information` 또는 `information`) + `@atlaskit/tooltip` `Tooltip` 으로 기준 문구 노출. (헤더 `content`를 `<span>라벨 <Tooltip>…<HelpIcon/></Tooltip></span>` 형태로 교체.)
  2. **백오피스 사용자 등록** `static/ui/src/backoffice/page/user/modal/regist/UserRegistrationModal.jsx` — `<Field name="salary">` 에 Atlaskit `Field` 의 도움말(라벨 옆 도움말 아이콘+Tooltip, 또는 Field children 아래 `<HelperMessage>` 한 줄) 추가.
  3. **백오피스 사용자 수정** `static/ui/src/backoffice/page/user/modal/edit/UserEditModal.jsx` — `<FieldBlock label=…>` salary 블록에 동일 도움말 추가.
- **문구(공통, 단일 i18n 키 재사용):**
  - KO: `프로젝트 기간 동안 해당 인원에게 들어가는 총 비용입니다. 월급이 아닙니다.`
  - EN: `Total cost incurred for this member over the project period — not a monthly salary.`
- **구현 노트:** 기존 입력 동작(InlineEdit/Textfield/formatNumber 파싱)은 **무변경**. 도움말 표기만 비침습적으로 추가. 3곳이 같은 문구이므로 i18n 키 1개(`cost.salaryBasis.help`)를 공유.
- **모듈 귀속:** 프론트 작업 M2-b(아래 §7 신규 행). 비용 탭(A)과 독립적으로 검증 가능(단순 UI 문자열·툴팁).

---

## 5. i18n

- **신규 파일 `locales/script/cost.json`** (프로젝트 상세 A) + Portfolio 비용은 기존 `locales/kr|en/portfolio.json` 에 `portfolio.cost.*` 추가.
- 워크플로우(CLAUDE.md): `locales/kr/cost.json`·`locales/en/cost.json` 작성 후 `cd static/ui && npm run merge`. (script/*.json은 문서상 스텁 — 실제 merge 소스는 kr/en. 기존 portfolio.json도 kr/en에만 존재함을 확인.) **번역 실파일은 `locales/kr/cost.json`·`locales/en/cost.json` 신규 + `locales/kr/portfolio.json`·`locales/en/portfolio.json` 에 cost 키 append.**

**키 네임스페이스 (`cost.*`):**
```
cost.tab.label                 비용 분석 / Cost
cost.title                     비용 분석 / Cost Analysis
cost.error / cost.noPeriod / cost.empty   (진척 페이지 메시지 패턴)
cost.kpi.plannedBudget / actualCost / burnRate / remaining
cost.planActual.title / planned / actual
cost.burnup.title / budgetLine / cumulative
cost.roleLevel.title / byRole / byLevel / planned / actual
cost.evm.title / cpi / eac / etc / overBudget / cpiHint / eacHint
cost.issue.title / col.key / col.summary / col.actualMd / col.cost / col.costPerMd
cost.guide.*                   (안분기준 설명 — "실집행=계획×일정경과율" 1줄)
cost.salaryBasis.help          (§4-5 salary 입력 기준 — "프로젝트 기간 총 비용, 월급 아님". 3개 입력 지점 공유)
```

> ⚠️ §4-5 의 `cost.salaryBasis.help` 는 프로젝트 인력 패널·백오피스 사용자 등록/수정 모달이 **공유**한다. 비용 탭(A) 미사용 화면에서도 이 키를 참조하므로 merge 시 누락 주의.
**`portfolio.cost.*`:**
```
portfolio.cost.kpi.totalBudget / totalActual / burnRate
portfolio.cost.planActual.title/desc/info.calc/info.interp
portfolio.cost.overrunRank.title/desc/col.*
portfolio.cost.scatter.title/desc/quadrant.*
portfolio.cost.monthlyBurn.title/desc
portfolio.cost.byRoleLevel.title/desc/role/level
portfolio.cost.tsr.costSignal      (B7 컬럼 헤더)
```

---

## 6. DB / 마이그레이션 / manifest

- **DB 스키마 변경 없음.** `portfolio_project_snapshot` 무변경(비용 입력 전부 존재). 프로젝트 상세는 온디맨드+KVS 캐시(테이블 불필요).
- **마이그레이션 없음.** `migrate.js` 무영향.
- **manifest 변경 없음.** 신규 resolver `getProjectCostSummary` 는 기존 function 핸들러(`resolver`)에 `resolver.define` 로 등록되므로 manifest 모듈 추가 불필요. KVS/SQL 스토리지 정의 무변경.

---

## 7. 모듈 분할 제안 (incremental QA 지점)

| 모듈 | 범위 | 독립 QA 가능 지점 |
|---|---|---|
| **M1 백엔드-projectCost** | `src/resolver/projectCost/*` + index 등록 + jest(CostCalculator) | `npm test` (순수함수) → 단일 프로젝트 invoke 응답 shape 확인 |
| **M2 프론트-projectCost 탭(A)** | `pages/projectDetail/cost/*` + tabs.js + projectKeys + cost i18n | M1 응답 shape 의존. 탭 진입·KPI·차트 렌더 |
| **M2-b 프론트-salary 입력 기준 명시** | ProjectUserPanel salary 헤더 툴팁 + 백오피스 user 등록/수정 모달 도움말 + `cost.salaryBasis.help` i18n | **백엔드 무의존**, M1·M3과 병렬 가능. 툴팁 렌더·문구만 확인 |
| **M3 프론트-portfolio 비용(B)** | `portfolioAggregate.js` 함수 6개 + 위젯 6개 + CostTab 교체 + tsrSignals 확장 + portfolio.cost i18n | **백엔드 무의존** → M1과 병렬 가능. 기존 getPortfolioDashboard 응답으로 즉시 검증 |
| **M4 i18n merge** | kr/en cost.json + portfolio.json append → `npm run merge` | 빌드 전 1회 |

- **병렬성:** M1∥M3 (M3는 백엔드 무의존). M2는 M1 완료 후. M4는 M2/M3 UI 문자열 확정 후.
- **incremental:** M1 jest → M3 위젯(기존데이터) → M2 신규탭 순으로 점진 검증.

---

## 8. 리스크 / 미해결 가정

1. **scheduleRate 신선도(B):** Portfolio의 `scheduleRate`는 배치 스냅샷 시점 값 → 소진율이 "마지막 집계 시점" 기준(실시간 아님). 기존 진척/가동률 위젯도 동일 한계라 일관 — `isStale`/`lastAggregatedAt`로 이미 노출됨. 가정: 허용.
2. **completionRate=0 또는 scheduleRate=0 프로젝트(A/B):** CPI/EAC null 처리. 시작 전(scheduleRate=0) 프로젝트는 actualCost=0, CPI/EAC null → 위젯에서 "-" 표기. 검증 필요(실데이터).
3. **A8 워크로그 비중 안분의 멤버 매칭:** worklog `accountId` ↔ projectusers `account_id` 매칭. coworker만 있고 projectusers에 없는 작성자(외부 기여)는 salary 미상 → 비용 0 배분(분모서 제외). 가정: projectusers 등록 멤버만 비용 보유 — requirement 정합.
4. **currency 전사 단일 가정:** `settings.currency` 1개. 프로젝트별 통화 혼재 미지원(현 데이터 모델상 단일). Portfolio currency는 응답에 없어 프론트 상수 'KRW' 폴백 → 추후 settings 조회 위젯 추가 가능(현 범위 외).
5. **scheduleRate 안분의 멤버 투입기간 미반영:** (a)는 프로젝트 전체기간 경과율을 전 멤버에 균일 적용 → 중도 투입/철수 멤버의 실제 투입비율과 불일치 가능. projectusers에 멤버별 투입기간 컬럼이 없어 현 데이터로는 프로젝트 단위 균일이 최선. 한계 명시(설계 가정).
6. **EAC 음수/발산 가드:** completionRate가 매우 작고 scheduleRate가 큰 초기 지연 프로젝트는 EAC가 비현실적으로 큼 → 프론트에서 상한 표기(예: ">BAC ×3 이면 '예측 불가' 라벨) 권장. 백엔드는 raw 반환, 표기는 프론트.
