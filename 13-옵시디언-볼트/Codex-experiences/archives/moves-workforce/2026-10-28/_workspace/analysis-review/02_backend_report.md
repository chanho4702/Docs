# 02_backend_report.md — analysis-review 백엔드 구현 리포트

> backend-engineer · 2026-06-11 · (리더가 에이전트 반환 메시지에서 파일로 중계)

## 1. 수정 파일 · 함수 목록

| 파일 | 함수/위치 | 변경 |
|---|---|---|
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | import | `getMonthMmMap` 추가 import |
| 동 | `computeGlobalUtilization` (순수함수) | **P1-1**: `projEnd`를 `today`로 클램프(미래 endDate → today). 종료 프로젝트는 전체기간 유지 |
| 동 | `aggregateOneProject` | **P1-1**: `baseMmDays = elapsedWorkDays`(전체 `totalWorkDays` → 경과근무일), 연차차감(`leaveMap`)도 `elapsedEnd` 기준으로 통일. **P1-2**: `actualMm = actualTotalMd / avg(getMonthMmMap(startDate, elapsedEnd))` (기존 `/20` 하드코딩 제거) |
| `src/seed/SeedData.js` | `addSettingSeed` | **P2-1**: settings 시드에 `scopeTodoAmberRatio: 0.3`, `scopeTodoRedRatio: 0.6` 추가(기존 `{...settings, ...exists}` 병합으로 신규 키만 보충) |
| `src/resolver/backoffice/setting/SettingService.js` | `updateSettingService` | **P2-1**: 인자/병합에 `scopeTodoAmberRatio`, `scopeTodoRedRatio` 추가(null-가드 spread, 기존 패턴 동일) |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `getPortfolioDashboardService`, `emptyShape` | **P2-1**: `DEFAULT_SCOPE_AMBER=0.3`/`DEFAULT_SCOPE_RED=0.6` 상수, settings 폴백(`scopeAmber/scopeRed`), 응답 루트에 `scopeBands: { amber, red }` 추가(empty/정상 양쪽) |
| `manifest.yml` | `settings` entity | **P2-1**: `scopeTodoAmberRatio: float`, `scopeTodoRedRatio: float` 속성 2개 추가(기존 utilizationBand 속성과 동형) |
| `src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js` | — | P1-1 today 클램프 케이스 2개 + P1-2 동적 분모 케이스 2개 추가 |

**컨트롤러 등록**: 신규 컨트롤러 없음. `getPortfolioDashboard`는 `PortfolioDashboardController.js`에 이미 `responseWrapper`로 등록되어 있고 `src/index.js`도 무변경. (값·필드만 변경)

**범위 외 미구현(확정대로)**: Q5 costBands(P2-3) — 미구현. Q4 monthlyBurn — 백엔드 무변경. P1-3/P1-4/P2-2/P2-5(프론트 i18n·렌더)는 backend 범위 아님.

## 2. `getPortfolioDashboard` 실제 응답 shape 전체 (글자 그대로)

프론트는 `invoke('getPortfolioDashboard')` → `result.content`로 아래 객체를 받음(responseWrapper가 `{ success:true, content:<아래> }`로 감쌈).

**정상(데이터 있음) shape:**
```jsonc
{
  "lastAggregatedAt": "2026-06-11T03:00:00.000Z",   // ISO string | null
  "aggregateStatus": "OK",                            // 'OK' | 'PARTIAL' | 'EMPTY'
  "projects": [
    {
      "projectId": "uuid",
      "projectName": "결제",
      "statusKey": "status-1",            // | null
      "statusName": "진행중",             // | null
      "statusColor": "blue",              // | null
      "startDate": "2026-01-01",
      "endDate": "2026-06-30",            // | null
      "completionRate": 0.62,
      "scheduleRate": 0.45,
      "diffPercentPoint": 17,
      "diagnosisStatus": "normal",
      "plannedTotalMd": 120,
      "actualTotalMd": 54,
      "actualMm": 2.7,                    // ★ P1-2: 동적 분모(월평균 근무일). 값만 정확화
      "riskScore": 0,
      "riskProjectFlag": false,
      "issueSummary": { "done": 10, "inProgress": 4, "todo": 6 },
      "memberCount": 5,
      "totalSalary": 25000000,
      "avgUtilization": 0.83,             // ★ P1-1: 경과기간 분모. 값만 정확화
      "aggregatedAt": "2026-06-11T03:00:00.000Z",  // | null
      "isStale": false,
      "members": [
        {
          "accountId": "acc-1",
          "displayName": "홍길동",
          "roleKey": "role-1",            // | null
          "levelKey": "level-1",          // | null
          "salary": 5000000,
          "effortMd": 12.0,
          "utilization": 0.83             // ★ P1-1 영향(경과기간 분모)
        }
      ],
      "monthlyEffort": [ { "month": "2026-01", "md": 20.0 } ],
      "weeklyEffort": [ { "week": "2026-01-05", "md": 5.0 } ]
    }
  ],
  "roleMeta": { "role-1": "개발자" },
  "levelMeta": { "level-1": "선임" },
  "salaryBuckets": [
    { "bucket": "0-3M", "min": 0, "max": 3000000 },
    { "bucket": "3M-5M", "min": 3000000, "max": 5000000 },
    { "bucket": "5M-7M", "min": 5000000, "max": 7000000 },
    { "bucket": "7M+", "min": 7000000, "max": null }
  ],
  "utilization": {
    "buckets": [
      { "band": "under", "label": "과소", "count": 2 },
      { "band": "normal", "label": "적정", "count": 5 },
      { "band": "over", "label": "과부하", "count": 1 }
    ],
    "totalPeople": 8,
    "avgUtilization": 0.91,
    "people": [ { "accountId": "acc-1", "displayName": "홍길동", "util": 1.2 } ]
  },
  "utilizationBands": { "utilUnder": 0.7, "utilOver": 1.1, "utilRed": 1.3 },
  "scopeBands": { "amber": 0.3, "red": 0.6 },   // ★★ 신규 추가 필드 (P2-1)
  "problemIssues": [
    {
      "projectId": "uuid", "projectName": "결제", "issueKey": "PAY-12",
      "summary": "...", "assignee": "홍길동", "delayDays": 10,
      "effortDiff": 0.1, "statusKey": "indeterminate", "severity": 20.0
    }
  ]
}
```

**EMPTY shape (집계 전/활성 프로젝트 0):**
```jsonc
{
  "lastAggregatedAt": null,
  "aggregateStatus": "EMPTY",
  "projects": [],
  "roleMeta": {},
  "levelMeta": {},
  "salaryBuckets": [ /* 위와 동일 4개 */ ],
  "utilization": { "buckets": [], "totalPeople": 0, "avgUtilization": 0, "people": [] },
  "utilizationBands": { "utilUnder": 0.7, "utilOver": 1.1, "utilRed": 1.3 },
  "scopeBands": { "amber": 0.3, "red": 0.6 },   // ★★ EMPTY에도 동일하게 존재 (기본값)
  "problemIssues": []
}
```

**프론트가 알아야 할 핵심:**
- `scopeBands`는 **루트 레벨** 신규 필드. `utilizationBands`와 **동형 패턴**(EMPTY/정상 모두 존재, settings 폴백 0.3/0.6). 설계서 §4 계약 #1대로 `PortfolioDashboardPage` → `ComparisonTabs` → `PortfolioTsrSignalTable`로 전달, `tsrSignals(projects, { ...utilizationBands, scopeAmber: scopeBands.amber, scopeRed: scopeBands.red })`로 합류. 키는 `amber`/`red`.
- `projects[].avgUtilization`·`projects[].members[].utilization`·`projects[].actualMm`는 **필드명·타입 무변경, 값만 정확화**. 프론트 소비 코드 무수정.

## 3. 값이 어떻게 달라지는가 (전/후 예시)

예시: start=2026-01-01, end=2099-12-31(진행중), 오늘=2026-06-11. 멤버 투입=12MD, 경과근무일≈110일, actualTotalMd=54.

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| `members[].utilization` (P1-1) | `12 / 전체근무일(≈수천)` ≈ **0.005** (구조적 과소) | `12 / 경과근무일(≈110)` ≈ **0.11** |
| 글로벌 `utilization.people[].util` (P1-1) | 합집합 분모에 미래기간 포함 → 과소 | 미래 endDate를 today로 클램프 |
| `actualMm` (P1-2) | `54 / 20` = **2.7** (고정) | `54 / 월평균근무일(예: 20.3)` ≈ **2.66** (Resource 탭과 동일 정의) |

- 종료 프로젝트(today > endDate): 값 변화 없음. 시작 전: 분모 max(0.1) 가드로 util≈0 (현행 유지). actualMm 분모 0 가드 → 0 반환.

## 4. npm test 결과 원문

```
Test Suites: 4 passed, 4 total
Tests:       70 passed, 70 total
Snapshots:   0 total
Time:        1.502 s, estimated 2 s
```

추가 4개 케이스(진행중 today 클램프 / 종료 전체기간 유지 / actualMm 동적 분모 / 빈 월맵 가드) 포함 전부 통과.

## 제약 준수
- 수정은 위 7개 파일로 한정(미커밋 변경 미간섭). 공통 페치 경로 무수정. shape 변경은 `scopeBands` 1개뿐.
