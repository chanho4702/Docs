# 전사 통합 대시보드 (Portfolio Dashboard) — 백엔드 구현 리포트

> backend-engineer · 2026-06-02 · 단일 진실: `01_architect_design.md` v3 (§12 Backend 체크리스트 전량 구현)

---

## 1. 구현한 resolver 함수 + 실제 응답 shape (★ 프론트 소비 기준 — 글자 그대로)

`responseWrapper` 가 서비스 반환을 루트로 펼친다 → `{ success:true, ...result }`. content 래핑 없음.
프론트는 `res.success`, `res.projects` 등을 **루트에서 직접** 읽는다.

### 1.1 `getPortfolioDashboard` — 입력 `{}`

성공 시 (OK / PARTIAL) 실제 응답:

```jsonc
{
  "success": true,
  "lastAggregatedAt": "2026-06-01T06:00:00.000Z",  // ISO string. 최초 미집계 시 null
  "aggregateStatus": "OK",                          // "OK" | "EMPTY" | "PARTIAL"

  "projects": [                                     // risk_score DESC 정렬
    {
      "projectId": "uuid-string",                   // BIN_TO_UUID 됨
      "projectName": "결제 플랫폼",
      "statusKey": "status-in-progress",            // null 가능
      "statusName": "IN PROGRESS",                  // read-time status KVS 조인. 미매칭 시 null
      "statusColor": "blue",                        // read-time 조인. 미매칭 시 null
      "startDate": "2026-01-01",                    // DATE (드라이버 반환형 그대로 — 주의 §5)
      "endDate": "2026-06-30",                      // DATE. null 가능(무기한 프로젝트 — 실데이터 부재 전제)

      "completionRate": 0.58,                       // 0~1 (round2)
      "scheduleRate": 0.71,                         // 0~1 (round2)
      "diffPercentPoint": -13.0,                    // (완성-일정)*100 %p
      "diagnosisStatus": "delayed",                 // read-time: diagnoseStatus(diff, threshold) → delayed|caution|normal
      "plannedTotalMd": 320.0,
      "actualTotalMd": 290.5,
      "actualMm": 14.5,                             // = actualTotalMd / 20 (round1)
      "riskScore": 13.0,                            // = max(0, -diffPercentPoint)
      "riskProjectFlag": true,                      // read-time: diagnosisStatus === 'delayed'
      "issueSummary": { "done": 40, "inProgress": 12, "todo": 18 },

      "memberCount": 8,
      "totalSalary": 38000000,                      // Number (DECIMAL → Number 변환). Σ members[].salary
      "avgUtilization": 0.83,                        // 프로젝트 내 평균 (이중계상 무관)

      "aggregatedAt": "2026-06-01T06:00:00.000Z",   // 이 행의 마지막 갱신 시각 (ISO)
      "isStale": false,                             // read-time: aggregatedAt < lastAggregatedAt → true (PARTIAL 노후 행)

      "members": [                                  // members_json 파싱. 빈 배열 가능
        {
          "accountId": "5f1a…",
          "displayName": "홍길동",                  // getBulkJiraUsersApi. 미상 시 accountId 폴백
          "roleKey": "role-bbbb",                   // null 가능
          "levelKey": "level-2",                    // null 가능
          "salary": 5200000,                        // 월. null/0 → 0 (★민감, §5)
          "effortMd": 18.5                          // 이 프로젝트 워크로그 totalMd. 없으면 0
          // ※ effectiveMmDays/utilization 은 저장 안 함 (가동률은 글로벌 블록 사용)
        }
      ],

      "monthlyEffort": [                            // monthly_effort_json 파싱. 빈 배열 가능
        { "month": "2026-01", "md": 42.0 },
        { "month": "2026-02", "md": 51.5 }
      ]
    }
  ],

  "roleMeta":  { "role-aaaa": "PL", "role-bbbb": "Developer" },   // key→name. 빈 객체 가능
  "levelMeta": { "level-1": "주니어", "level-2": "미들" },         // key→name. 빈 객체 가능

  "salaryBuckets": [                                // 경계 정의만 (카운트 아님 — 프론트가 카운트)
    { "bucket": "0-3M",  "min": 0,       "max": 3000000 },
    { "bucket": "3M-5M", "min": 3000000, "max": 5000000 },
    { "bucket": "5M-7M", "min": 5000000, "max": 7000000 },
    { "bucket": "7M+",   "min": 7000000, "max": null }
  ],

  "utilization": {                                  // ★필터 무관 글로벌 (read-time 버킷팅)
    "buckets": [
      { "band": "under",  "label": "과소",   "count": 8 },   // < utilizationUnderBand(기본 0.7)
      { "band": "normal", "label": "적정",   "count": 17 },  // under ~ over
      { "band": "over",   "label": "과부하", "count": 6 }    // ≥ utilizationOverBand(기본 1.1)
    ],
    "totalPeople": 31,                              // 고유 인원 수
    "avgUtilization": 0.79                          // 고유 인원 평균 (round2)
  },

  "problemIssues": [                                // ★필터 무관 · 전 프로젝트 TOP50. severity DESC
    {
      "projectId": "uuid-string",
      "projectName": "프로젝트 A",
      "issueKey": "PROJ-123",
      "summary": "결제 모듈 리팩터링",
      "assignee": "홍길동",                          // displayName. null 가능
      "delayDays": 12,                              // x축. >0
      "effortDiff": 4.5,                            // y축. (actual-planned) MD
      "statusKey": "indeterminate",                 // null 가능
      "severity": 16.5                              // = delayDays*1 + max(effortDiff,0)*2
    }
  ]
}
```

**빈 상태 (`aggregateStatus:"EMPTY"`)** — 메타 없음/최초 미집계/활성 0건:

```jsonc
{
  "success": true,
  "lastAggregatedAt": null,           // 또는 직전 EMPTY 배치 시각
  "aggregateStatus": "EMPTY",
  "projects": [],
  "roleMeta": {},
  "levelMeta": {},
  "salaryBuckets": [ /* 기본 경계 4개 (위와 동일) */ ],
  "utilization": { "buckets": [], "totalPeople": 0, "avgUtilization": 0 },
  "problemIssues": []
}
```

**실패 시 (공통 wrapper):** `{ success:false, error:{ name, code, message, cause } }`. 프론트는 `data?.success !== true` 분기.

### 1.2 `triggerPortfolioAggregation` — 입력 `{}`

fire-and-forget. `aggregateAllProjects()` 를 await 하지 않고 백그라운드 실행 후 즉시 응답:

```jsonc
{
  "success": true,
  "started": true,
  "lastAggregatedAt": "2026-06-01T06:00:00.000Z"   // 직전 값(ISO). 최초면 null
}
```

프론트는 `lastAggregatedAt` 변화(또는 폴링 후 refetch)로 완료 감지. 동시 실행 가드(stale-lock)는 배치 내부 처리 — 트리거는 항상 `started:true` 반환(이미 진행 중이면 내부에서 skip).

---

## 2. 생성 / 수정한 파일

### 생성
| 파일 | 역할 |
|------|------|
| `src/rdb/schema/ddl/portfolioSnapshot.sql.js` | `CREATE_PORTFOLIO_SNAPSHOT_TABLE`(members_json/monthly_effort_json 포함) + `CREATE_PORTFOLIO_PROBLEM_ISSUE_TABLE` |
| `src/rdb/query/PortfolioSnapshotQuery.js` | UPSERT / SELECT_ALL / PROBLEM_DELETE_ALL·INSERT·SELECT_TOP / MEMBER_ROWS |
| `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js` | upsertSnapshot / getAllSnapshots / replaceProblemIssues / getProblemIssues / getProjectMemberRows / getRollupMeta / setRollupMeta(kvs 직접 키) |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | aggregateOneProject / aggregateAllProjects + 순수함수(riskScore/severity/flattenBulkUsers/computeProblemIssues/mergeIntervals/computeGlobalUtilization/mapProjectRow) |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | getPortfolioDashboardService / triggerAggregationService + SALARY_BUCKET_BOUNDS + read-time 버킷팅 |
| `src/resolver/portfolioDashboard/PortfolioDashboardController.js` | registerPortfolioDashboardController |
| `src/trigger/portfolioSnapshot.js` | runPortfolioSnapshot (얇은 어댑터) |
| `src/api/jira/field/FieldApi.js` | getCoworkerFieldIdApi (Jira `/field` name 매칭) |
| `src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js` | jest 20 케이스 |

### 수정
| 파일 | 변경 |
|------|------|
| `src/rdb/schema/ddl/index.js` | 두 DDL export 추가 |
| `src/rdb/schema/migrate.js` | import 추가 + v006/v007 `.enqueue` (v005 주석 자리 이어붙임) |
| `src/resolver/resourceAnalysis/ResourceAnalysisService.js` | `computeLeaveDeductionMap` → `export const` 승격 (호출부 무변경) |
| `src/resolver/backoffice/setting/SettingService.js` | updateSettingService 에 utilizationUnderBand/OverBand 병합 |
| `src/seed/SeedData.js` | settings 시드에 utilizationUnderBand(0.7)/OverBand(1.1) 기본값 |
| `src/index.js` | import + registerPortfolioDashboardController + `export { runPortfolioSnapshot }` |
| `manifest.yml` | function `portfolioSnapshot`(timeoutSeconds 600) + scheduledTrigger `portfolio-snapshot`(day) + settings entity 에 utilizationUnderBand/OverBand 속성 |

---

## 3. `npm test` 결과

```
Test Suites: 3 passed, 3 total
Tests:       41 passed, 41 total   (기존 21 + 신규 20)
```

신규 20 케이스: riskScore / severity / flattenBulkUsers(배열·빈입력·폴백) / mapProjectRow /
mergeIntervals(겹침·인접·분리·무효) / computeProblemIssues(기한초과·지연완료·제외·severity정렬) /
computeGlobalUtilization(단일·기간중첩 이중계상 미발생·연차차감·고유인원) /
computeLeaveDeductionMap(승격 회귀: 연차·반차). **전부 통과.**

import 해상도 스모크 테스트(Service/Controller/Trigger/Aggregator, Forge 모듈 mock)도 통과 확인 후 제거.

---

## 4. 설계서와 다르게 구현한 부분 + 이유

1. **`actualMm` 산식** — 설계서에 명시적 공식이 없어 `actualTotalMd / 20`(월 20영업일 통상치)로 구현. 화면 표시값(요약 라인 Σ actualMm)에만 쓰이며 정밀 MM 분모가 필요하면 추후 settings.monthRate 연동 가능. **프론트는 projects[].actualMm 를 그대로 합산**(재계산 금지).

2. **manifest function handler 경로** — 설계서 §3.5 는 `trigger/portfolioSnapshot.runPortfolioSnapshot` 표기였으나, 기존 `runMigration` 패턴(`handler: index.runMigration`)과 일관되게 **`handler: index.runPortfolioSnapshot`** 로 등록(index.js 가 named re-export). 동작 동일.

3. **백엔드 Sentry 캡처** — 프로젝트에 서버측 Sentry 헬퍼가 없어(`SentryConfig` 는 DSN 노출용 resolver 1개뿐) 배치 부분실패 격리는 `console.error` + `Promise.allSettled` 로 구현. 설계서 "console.error + Sentry" 중 실제 코드에 존재하는 console.error 채택.

4. **`getBulkJiraUsersApi` 반환형** — 실제 코드 재확인 결과 빈 입력 시 `{ values: [] }`(객체), 정상 시 `[{values:[…]}]`(배열) 비일관 확정. `flattenBulkUsers` 가 `Array.isArray` 가드 + `.values` 평탄화로 양쪽 흡수(설계서 §3.2.1 그대로).

5. **`getActiveProjectsRepository`** — 실제 반환 `{ rows }` (project_id 는 selectRaw 로 이미 BIN_TO_UUID 적용). `activeResult.rows` 언래핑 후 `mapProjectRow` 로 snake→camel. 설계서 교정 ①과 일치.

설계 계약의 응답 shape(§2.2)과 **필드명·구조는 100% 일치**한다. 위 1~3은 내부 산출/등록 방식 차이로 프론트 소비에는 영향 없음.

---

## 5. 프론트엔드가 알아야 할 주의사항

1. **가동률(`utilization`)은 필터 무관 글로벌** — selectedIds 와 무관하게 `utilization.buckets[]` 를 그대로 렌더. 절대 members[] 로 재집계하지 말 것(members[]에 effectiveMmDays/utilization 없음 — 의도된 제거). "필터 무관" 배지 필수.

2. **`problemIssues[]` 도 필터 무관** — 항상 전 프로젝트 TOP50. selectedIds 무시. "필터 무관" 배지 필수.

3. **`isStale` 배지** — PARTIAL 시 일부 행이 직전 값(노후). `project.isStale === true` 면 현황 테이블에 "어제 값" Lozenge + `aggregatedAt` 툴팁. 신/구 혼재 비교 함정 방지.

4. **빈/EMPTY 상태** — `aggregateStatus === 'EMPTY'` 면 projects/problemIssues 빈 배열, roleMeta/levelMeta 빈 객체, utilization 카운트 0. salaryBuckets 만 기본 경계 제공. 에러 아님(`success:true`). 헤더에 "아직 집계된 데이터가 없습니다" 안내.

5. **재집계 버튼** — `triggerPortfolioAggregation` 은 즉시 `started:true` 반환. 실제 완료는 백그라운드. 응답의 `lastAggregatedAt` 는 **직전 값**이므로, 완료 감지는 일정 시간 후 `getPortfolioDashboard` refetch 하여 `lastAggregatedAt` 갱신 확인.

6. **급여 민감 데이터** — `members[].salary` 가 raw 로 응답에 포함됨(히스토그램/인건비 재집계용). REPORT 권한 게이트로 1차 차단됨. 차트는 카운트/합계만 노출.

7. **dedup 합산** — 요약 라인 인원 수·급여 히스토그램은 고유 `accountId` 기준 dedup(한 인원이 여러 프로젝트 참여). totalSalary·actualMm 는 프로젝트 단위 단순 Σ.

8. **필드 타입 주의** — `startDate`/`endDate`/`aggregatedAt` 은 백엔드에서 ISO 문자열화(aggregatedAt) 또는 DATE 문자열로 내려감. `totalSalary` 는 Number. `members`/`monthlyEffort` 는 파싱 완료된 배열(프론트 추가 JSON.parse 불필요).

9. **settings 가동률 band** — `utilizationUnderBand`(0.7)/`utilizationOverBand`(1.1)는 settings KVS 에 기본 시드. 백오피스 SettingPage UI 입력은 프론트 단계 작업(updateSettingService 가 이미 두 필드 병합 지원).
