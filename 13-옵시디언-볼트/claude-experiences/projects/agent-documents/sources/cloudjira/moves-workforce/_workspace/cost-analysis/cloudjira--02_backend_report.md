# 비용 분석(cost-analysis) — 백엔드 구현 리포트 (M1)

> 작성: backend-engineer · 2026-06-09 · 슬러그 `cost-analysis`
> 범위: M1(프로젝트 상세 비용 resolver `getProjectCostSummary`)만. Portfolio(B)·스냅샷·manifest·migrate **무변경**.

---

## 1. 구현한 파일 목록

| 경로 | 역할 |
|---|---|
| `src/resolver/projectCost/CostCalculator.js` | 순수함수(Forge 의존 0, jest 대상). 안분/EVM/월별/그룹/이슈 안분 |
| `src/resolver/projectCost/ProjectCostService.js` | `getProjectCostSummaryService({projectId, coworkerFieldId})` — 병렬 페치 + KVS 10분 캐시 + assemble |
| `src/resolver/projectCost/ProjectCostController.js` | `registerProjectCostController(resolver)` — `resolver.define('getProjectCostSummary', responseWrapper(...))` |
| `src/resolver/projectCost/__test__/CostCalculator.test.js` | 순수함수 jest (안분/EVM 가드/이슈 안분 비중) |
| `src/index.js` | import + `registerProjectCostController(resolver)` 호출 1줄 추가 (54번 라인 뒤) |

**Portfolio 백엔드·`portfolio_project_snapshot`·manifest·migrate 무변경 확인.** 신규 도메인 `projectCost` 하나만 추가.

---

## 2. `getProjectCostSummary` 실제 응답 shape (프론트가 이걸 읽음)

- resolver 함수명: **`getProjectCostSummary`**, 입력 `{ projectId, coworkerFieldId }`.
- responseWrapper가 `{ success: true, ...result }`로 펼침 → **content 래핑 없이 루트 spread** (설계 §2-A 그대로).
- 내부 캐시 전용 필드(`_scheduleRate`/`_hourRate`)는 `assembleResponse`에서 **제거 후 반환** → 응답에 노출 안 됨.

```jsonc
{
  "success": true,
  "currency": "KRW",                       // settings.currency, 없으면 'KRW' 폴백
  "project": {
    "startDate": "2026-01-01",             // summary.start_date, 없으면 null
    "endDate": "2026-06-30",               // summary.end_date, 없으면 null
    "memberCount": 12                       // summary.total_member_count, 없으면 0
  },
  "rates": {
    "scheduleRate": 0.62,                  // 0~1, round2 (=elapsedRatio, 안분계수)
    "completionRate": 0.55,                // 0~1, round2 (ProgressCalculator.computeCompletion)
    "burnRate": 0.62                       // = scheduleRate (round2)
  },
  "budget": {
    "plannedBudget": 360000000,            // BAC = Math.round(totalSalary) (정수, 원)
    "actualCost": 223200000,               // AC = round(plannedBudget × scheduleRate)
    "remaining": 136800000,                // plannedBudget − actualCost
    "earnedValue": 198000000               // EV = round(plannedBudget × completionRate)
  },
  "evm": {
    "cpi": 0.89,                           // round2(EV/AC). AC=0 → null
    "eac": 404494382,                      // round(BAC/cpi). cpi null 또는 cpi<=0 → null
    "etc": 181294382,                      // eac − actualCost. eac null → null
    "overBudget": true,                    // eac > plannedBudget. eac null → false
    "overrunAmount": 44494382              // max(eac − plannedBudget, 0). eac null → 0
  },
  "monthlyCost": [                         // 워크로그→monthlyEffort(md) 비중으로 actualCost 안분
    { "month": "2026-01", "actual": 32000000, "cumulative": 32000000 },
    { "month": "2026-02", "actual": 41000000, "cumulative": 73000000 }
  ],
  "plannedBudgetLine": 360000000,          // = budget.plannedBudget (수평 예산선)
  "byRole": [                              // roleKey 그룹, key=null 가능
    { "key": "role-be", "planned": 120000000, "actual": 74400000, "memberCount": 4 }
  ],
  "byLevel": [                             // levelKey 그룹, 동일 shape (key=levelKey)
    { "key": "lvl-senior", "planned": 200000000, "actual": 124000000, "memberCount": 6 }
  ],
  "byIssue": [                             // cost desc 정렬, cost>0 인 이슈만
    {
      "issueKey": "PROJ-12",
      "summary": "결제 모듈",
      "actualMd": 18.5,                    // round1 (salary 보유 멤버 초만 집계)
      "cost": 23400000,                    // Σmember(salary×scheduleRate × issueSec/memberTotalSec), 정수
      "costPerMd": 1264865                 // round(cost/actualMd). actualMd<=0 → null
    }
  ]
}
```

### 설계 계약 대비 차이점 (실제 구현값 우선)

설계 §2-A 응답 블록과 **필드명·중첩·타입 100% 일치**. 추가 메모:

1. **`byIssue[].actualMd`**: 설계 주석은 "Σ issueSec/denom"이나, **실제 구현은 salary를 보유한(=projectusers 등록) 멤버의 초만 합산**해 MD 산정(`billedSec`). 이유: salary 미상 멤버(외부 기여자)는 비용 분배에서 빠지므로(설계 §1-2·리스크 #3), cost와 actualMd의 분모를 일관시켜 `costPerMd`가 왜곡되지 않게 함. 모든 워커가 등록 멤버면 결과 동일.
2. **`cost>0` 필터**: cost가 0(전원 salary 미상/워크로그 0)인 이슈는 `byIssue`에서 제외(설계 §2-A "비용>0 만").
3. **데이터 부족 분기**: `project.startDate`/`endDate`가 null이면 scheduleRate=0 → actualCost=0, evm 전부 null. `budget.plannedBudget===0`(멤버 미등록)도 가능. 프론트가 `noPeriod`/`empty` 분기.
4. **에러**: `projectId` 없으면 `LogicalError('PROJECT_ID_REQUIRED', 'projectId is required')` throw → responseWrapper가 `{success:false, error:{code:'PROJECT_ID_REQUIRED', ...}}` 직렬화. (진척 서비스와 동일)

---

## 3. 재사용한 import 출처와 실제 반환형

| import | 출처 | 실제 반환형 (이번에 사용한 필드) |
|---|---|---|
| `computeCompletion`, `computeScheduleRate`, `normalizeIssue` | `../projectProgress/ProgressCalculator` | `computeCompletion(issuesNorm)` → `{ rate(0~1), weightedSec, planSecSum }`. `computeScheduleRate(elapsed, total)` → 0~1. 복붙 없이 import 재사용 |
| `getResourceProjectWorklogs` | `../resourceAnalysis/ResourceWorklogFetcher` | flat 행 `{ issueKey, issueSummary, accountId, date('YYYY-MM-DD'), timeSpentSeconds }`. **byIssue 안분·monthlyEffort 산출의 단일 원천** |
| `getSummaryDataService` | `../projectDashboard/ProjectDashboardService` | `{ project_id, project_name, start_date, end_date, total_member_count, total_salary }` (snake_case). **totalSalary/기간/memberCount 출처** |
| `getProjectMemberRows` | `../portfolioDashboard/PortfolioSnapshotRepository` | **snake_case 행** `{ account_id, role_key, level_key, salary }`. Service의 `normalizeMembers`에서 `{accountId, salary, roleKey, levelKey}`로 변환 후 `groupCostByKey`/`buildSalaryMap`에 투입 |
| `getSettingDataService` | `../backoffice/setting/SettingService` | KVS settings 객체 `{ currency, hourRate, ... }`. `currency`(폴백 'KRW'), `hourRate`(폴백 8) |
| `getPublicHolidayListService` | `../backoffice/publicHoliday/PublicHolidayService` | `{ data: [{ id, name, holidayDate, workRatio }] }` → `buildHolidayMap`으로 `{date:workRatio}` |
| `buildHolidayMap`, `getWorkdaysInRange` | `../../utils/workday` | scheduleRate 산식(전체/경과 근무일) — 진척 서비스와 동일 |
| `getProjectIssuesByFilter` | `../../api/jira/issue/IssueApi` | `fetchAllIssues` nextPageToken 루프(완성률용 이슈). 진척 서비스와 동일 패턴 |

### monthlyEffort 산출
프로젝트 상세는 **스냅샷이 아니라 온디맨드**라 monthlyEffort가 응답에 없음 → Service `buildMonthlyEffort(worklogs, hourRate)`가 워크로그 `date.substring(0,7)`로 월별 초 합산 후 md 환산(`PortfolioAggregator`와 동일 산식: `round1(sec/(hourRate*3600))`). 결과 `[{month:'YYYY-MM', md}]`를 `allocateMonthlyCost`에 투입.

### 캐시 정책 (설계 §3-1 준수)
- 캐시키 `ProjectCost:{projectId}`, KVS 10분 TTL.
- 캐시에 저장: `currency/project/rates/budget/evm/monthlyCost/plannedBudgetLine/byRole/byLevel` + 내부값 `_scheduleRate`/`_hourRate`.
- **캐시 제외**: `byIssue`, members raw, worklog raw.
- **캐시 hit 시**: `getProjectMemberRows` + `getResourceProjectWorklogs`만 재페치해 `byIssue`만 재구성(`_scheduleRate`/`_hourRate` 사용). 나머지는 캐시값 그대로. assemble에서 `_`필드 제거 후 반환.

---

## 4. `npm test` 결과 (루트 jest)

```
PASS src/resolver/projectCost/__test__/CostCalculator.test.js
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js

Test Suites: 4 passed, 4 total
Tests:       66 passed, 66 total
```

**전체 통과(66/66), 실패 0.** 신규 `CostCalculator.test.js` 케이스: allocateActualCost(반올림/0/null), computeBudget, computeEvm(정상/AC=0/completionRate=0→cpi=0→eac null/under-budget), allocateMonthlyCost(비중·Σmd=0·빈), groupCostByKey(role/level/null그룹), allocateIssueCost(단일·분산·다멤버·salary미상·총초0·빈).

---

## 5. 미해결 / 가정 (실데이터 의존)

1. **scheduleRate 균일 적용**(설계 §8-5): 프로젝트 전체기간 경과율을 전 멤버에 균일 적용. projectusers에 멤버별 투입기간 컬럼 없어 현 데이터로는 프로젝트 단위 균일이 최선. 한계 명시.
2. **completionRate=0 / scheduleRate=0**: 시작 전 프로젝트는 actualCost=0, evm 전부 null → 프론트 "-" 표기. **실데이터 invoke 검증 필요.**
3. **A8 멤버 매칭**: worklog `accountId` ↔ projectusers `account_id`. salary 미상 작성자(외부 기여)는 cost 분모서 제외(비용 0 배분) → 해당 이슈는 그 작성자 몫만큼 cost 누락 가능. requirement 정합(등록 멤버만 비용 보유).
4. **currency 전사 단일**: `settings.currency` 1개. 프로젝트별 통화 혼재 미지원(현 데이터 모델상 단일).
5. **EAC 발산 가드**: 백엔드는 raw 반환(상한 미적용). 초기 지연 프로젝트의 비현실적 큰 EAC 표기 제어는 프론트 책임(설계 §8-6).
6. **실 invoke 미수행**: 순수함수 jest는 통과. Forge 런타임에서 단일 프로젝트 invoke 응답 shape 확인은 verifier/E2E 단계 몫(M1 범위는 코드+jest까지).
