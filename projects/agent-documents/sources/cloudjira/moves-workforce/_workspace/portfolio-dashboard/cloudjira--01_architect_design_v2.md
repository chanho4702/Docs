# 전사 통합 대시보드 (Portfolio Dashboard) 설계서 — v2

> 슬러그 `portfolio-dashboard` · feature-architect · 2026-06-01 (v2)
> 단일 진실 원천: backend / frontend / verifier 는 본 문서(특히 §2 경계면 계약)를 기준으로 작업한다.
> **v2 변경 요지**: 정보구조 3섹션 재편 + 신규 위젯 3종(롤/레벨 분포·급여 분석 2종·문제이슈 버블) + 인건비/롤·레벨 분포 스키마 확장 + 문제이슈 TOP N 저장 위치 결정 + 경계면 계약 9위젯으로 확장 + MVP 재조정. v1 대비 변경/추가는 §0 요약 참조.

---

## 0. v1 → v2 변경/추가 요약 (★ 리뷰용)

| # | 영역 | v1 | v2 변경/추가 | 결정 근거 |
|---|------|----|----|----|
| 1 | 정보구조 | 위젯 6종 평면 배치 | **3섹션 재편**(전사요약 / 프로젝트비교 / 리스크·문제) | 요구 §6-A 정보구조 |
| 2 | 위젯 수 | 6 | **9**(+롤레벨분포, +급여2종, +문제이슈버블) | 요구 §6-A B |
| 3 | KPI | activeProjectCount/totalActualMm/avgCompletionRate/riskProjectCount | **+ totalSalary**(전사 월 인건비) | 요구 §A 섹션1 |
| 4 | 스냅샷 SQL | 진척·MM·가동률 컬럼 | **+ total_salary, + role_dist(JSON), + level_dist(JSON)** 컬럼 | 요구 §C — JSON 컬럼 채택(근거 §4.2.1) |
| 5 | rollup KVS | kpi/utilization/effortTrend | **+ salaryHistogram(버킷), + totalSalary** | 작고 고정 → KVS 적합 |
| 6 | 문제이슈 | 없음 | **별도 SQL 테이블 `portfolio_problem_issue`** (TOP N=**50건**) | 가변 배열 KVS 금지 원칙(§4.3 근거). N 상한 50 |
| 7 | projectusers | 미사용 | **배치가 per-project GROUP BY로 role/level/salary 집계**(SQL 1방, 워크로그 무관) | 요구 §D — 신규 per-project 그룹 쿼리 |
| 8 | 차트 옵션 | 기존 재사용 | **stackChartOption 정규화 옵션 확장** + **신규 scatterChartOption(버블)** | 요구 §B-1·B-3, 기존 옵션엔 정규화·scatter 없음(확인됨) |
| 9 | 경계면 계약 | 6필드 | **+ kpi.totalSalary, projects[].totalSalary/roleDistribution/levelDistribution, salaryHistogram, problemIssues, roleMeta/levelMeta** | 요구 §E |
| 10 | 보류 항목 | — | **작업 분포 위젯 = 보류(§10)**, 가동률 분포 = P2 강등 권고(§9) | 요구 §F |
| 11 | MVP | P0~P2(6위젯) | **9위젯 P0/P1/P2 재정렬**(§9) | 요구 §G |

**v1에서 유지(변경 없음)**: 배치 구조(PortfolioAggregator/scheduledTrigger/fire-and-forget 수동트리거), SQL vs KVS 1차 경계(프로젝트행=SQL·롤업=KVS), read-time diagnosis/status 조인, 가동률 read-time 버킷팅(utilizationValues[] 저장), 활성프로젝트 정의(날짜기준), 권한 REPORT 게이트, 라우트 `/dashboard`.

---

## 1. 개요 / 영향 범위

PMO/경영진이 **모든 프로젝트를 가로질러(across)** 인력·공수·진척·**인건비**·리스크를 한 화면에서 조망하는 신규 최상위 화면. 기존 `projectDetail/dashboard`(단일 프로젝트)와 **별개 층위**.

데이터 전략(요구 확정): **사전 집계(Scheduled Trigger 배치) → 스냅샷 적재 → 대시보드는 스냅샷만 조회**. 온디맨드 전 프로젝트 집계 금지(256MB/타임아웃).

| 축 | 신규/수정 | 내용 |
|----|----------|------|
| 백엔드 (조회) | 신규 도메인 | `src/resolver/portfolioDashboard/` (Controller/Service/Repository) — 스냅샷만 읽음 |
| 백엔드 (배치) | 신규 핸들러 | `PortfolioAggregator.js` + `src/trigger/portfolioSnapshot.js` (manifest scheduledTrigger 등록) |
| DB | 신규 SQL 테이블 ×2 | `portfolio_project_snapshot`(프로젝트별 1행, **+인건비·롤/레벨 분포 JSON**) + **`portfolio_problem_issue`**(문제이슈 TOP N행) + KVS `portfolioRollup`(전사 롤업·히스토그램·메타). migrate.js enqueue 추가 |
| 프론트 | 신규 최상위 라우트 | `/dashboard` → `static/ui/src/pages/portfolio/` (3섹션 + 위젯 9종 + 사이드바 진입점) |
| 차트 | 옵션 1수정+1신규 | `stackChartOption` 정규화 옵션 추가, **`scatterChartOption.js` 신규**(버블) |
| i18n | 신규 파일 | `locales/kr/portfolio.json` · `locales/en/portfolio.json` (merge) |
| 권한 | 재사용 | `canRead('REPORT')` 게이트 |

**산식은 전부 기존 재사용**(진척 3층·MM·가동률·진단·확정지연). 신규 계산은 전사 롤업·가동률 버킷·리스크 정렬·**인건비 Σ·급여 히스토그램·문제이슈 추출**뿐(§7).

---

## 2. 경계면 계약 (★ 이 설계의 단일 진실)

`responseWrapper` 는 서비스 반환 객체를 **루트로 펼친다**(`{ success:true, ...result }`). content 래핑 없음 — 진척도 페이지와 동일. 프론트는 `res.success`, `res.kpi`, `res.projects` 등을 루트에서 직접 읽는다.

### 2.1 조회 / 트리거 resolver

| resolver 함수 | 입력 | 응답 shape (success 시, 루트 펼침) | 대응 프론트 훅/쿼리키 |
|--------------|------|-----------------------------------|---------------------|
| `getPortfolioDashboard` | `{}` | `{ success, lastAggregatedAt, aggregateStatus, kpi, projects:[…], roleMeta, levelMeta, utilization, effortTrend:[…], salaryHistogram:[…], problemIssues:[…] }` | `useQuery` / `portfolioKeys.dashboard()` |
| `triggerPortfolioAggregation` | `{}` | `{ success, started:true, lastAggregatedAt }` | `useMutation` (수동 재집계) |

> `getPortfolioDashboard` 는 **단일 호출로 전 9위젯 데이터를 한 번에** 반환한다(스냅샷이 이미 적재돼 가볍기 때문). 스냅샷이 없으면 `aggregateStatus:'EMPTY'` + 빈 배열들 반환(에러 아님).

### 2.2 응답 필드 상세 (★ 글자 그대로 — 구현·검증 기준)

```jsonc
{
  "success": true,
  "lastAggregatedAt": "2026-06-01T18:30:00.000Z",  // ISO. KVS rollup.lastAggregatedAt. null 가능(최초 미집계)
  "aggregateStatus": "OK",      // "OK" | "EMPTY" | "PARTIAL"

  // ── 섹션1: 전사 요약 KPI (KVS rollup.kpi, riskProjectCount만 read-time 덮어씀) ──
  "kpi": {
    "activeProjectCount": 12,
    "totalActualMd": 1840.5,
    "totalActualMm": 92.0,
    "totalPlannedMd": 2100.0,
    "avgCompletionRate": 0.62,    // 0~1
    "riskProjectCount": 3,        // read-time (diagnosisStatus==='delayed' 카운트)
    "totalSalary": 412000000      // ★v2 신규. 전 프로젝트 월 인건비 Σ(Σ projectusers.salary). 통화는 settings.currency
  },

  // ── 섹션2: 프로젝트 비교 — 현황 테이블 + 롤/레벨 분포 차트가 함께 소비 ──
  "projects": [                   // portfolio_project_snapshot 매핑. 정렬: risk_score desc
    {
      "projectId": "uuid-string",
      "projectName": "프로젝트 A",
      "statusKey": "status-xxxx",
      "statusName": "진행중",       // 조회 시 status KVS 조인
      "statusColor": "blue",
      "startDate": "2026-01-01",   // null 가능
      "endDate": "2026-06-30",
      "completionRate": 0.58,      // 0~1
      "scheduleRate": 0.71,        // 0~1
      "diffPercentPoint": -13.0,   // (완성-일정)*100 %p
      "diagnosisStatus": "delayed",// read-time threshold 적용
      "plannedTotalMd": 320.0,
      "actualTotalMd": 290.5,
      "actualMm": 14.5,
      "memberCount": 8,
      "avgUtilization": 0.83,      // 0~1
      "riskProjectFlag": true,
      "issueSummary": { "done": 40, "inProgress": 12, "todo": 18 },
      "riskScore": 13.0,
      "totalSalary": 38000000,     // ★v2 신규. 이 프로젝트 월 인건비 Σ(projectusers.salary)
      "roleDistribution": {        // ★v2 신규. {roleKey: count}. 롤 분포 100%막대가 소비
        "role-aaaa": 3, "role-bbbb": 4, "role-cccc": 1
      },
      "levelDistribution": {       // ★v2 신규. {levelKey: count}. 레벨 토글 시 소비
        "level-1": 2, "level-2": 4, "level-3": 2
      }
    }
  ],

  // 롤/레벨 이름 매핑 사전 (조회 시 KVS role/level 엔티티 조인 — 키→이름).
  "roleMeta":  { "role-aaaa": "PL", "role-bbbb": "Developer", "role-cccc": "QA" },   // ★v2 신규
  "levelMeta": { "level-1": "주니어", "level-2": "미들", "level-3": "시니어" },        // ★v2 신규

  // ── 섹션2: 가동률 분포 (read-time 버킷팅) ──
  "utilization": {
    "buckets": [
      { "band": "under",  "label": "과소",  "min": 0,   "max": 0.7, "count": 5 },
      { "band": "normal", "label": "적정",  "min": 0.7, "max": 1.1, "count": 22 },
      { "band": "over",   "label": "과부하", "min": 1.1, "max": null,"count": 4 }
    ],
    "totalPeople": 31,
    "avgUtilization": 0.86
  },

  // ── 섹션2: 전사 공수 추이 (월별) ──
  "effortTrend": [
    { "month": "2026-01", "monthlyMd": 210.0, "cumulativeMd": 210.0, "cumulativeMm": 10.5 }
  ],

  // ── 섹션2: 급여 구간 분포 히스토그램 (★v2 신규, 전사) ──
  "salaryHistogram": [            // 고정 버킷 경계는 배치가 settings.currency 기준 산정(§7-7)
    { "bucket": "0-3M",  "min": 0,       "max": 3000000, "count": 4 },
    { "bucket": "3M-5M", "min": 3000000, "max": 5000000, "count": 11 },
    { "bucket": "5M-7M", "min": 5000000, "max": 7000000, "count": 9 },
    { "bucket": "7M+",   "min": 7000000, "max": null,    "count": 3 }
  ],

  // ── 섹션3: 문제 이슈 버블/산점도 (★v2 신규, 전사 TOP N=50) ──
  "problemIssues": [              // portfolio_problem_issue 매핑. severity desc 정렬, 최대 50건
    {
      "projectId": "uuid-string",
      "projectName": "프로젝트 A",
      "issueKey": "PROJ-123",
      "summary": "결제 모듈 리팩터링",
      "assignee": "홍길동",        // displayName, null 가능
      "delayDays": 12,            // x축. dueDate 초과 일수(기한초과 미완료/지연완료). >0 = 지연
      "effortDiff": 4.5,          // y축. 공수편차 MD (actual - planned). >0 = 초과
      "statusKey": "indeterminate",
      "severity": 16.5            // 정렬·버블 크기용 점수(§7-8)
    }
  ]
}
```

> **실패 시(공통)**: `responseWrapper` 가 `{ success:false, error:{ name, code, message, cause } }` 반환. 프론트는 `data?.success !== true` 분기.

### 2.3 배치 핸들러 (resolver 아님)

| 함수 | 트리거 | 동작 |
|------|--------|------|
| `runPortfolioSnapshot(event, context)` | manifest scheduledTrigger (`portfolio-snapshot`, interval: day) | 활성 프로젝트 순회 집계 → `portfolio_project_snapshot` upsert + **`portfolio_problem_issue` 재적재** + KVS `portfolioRollup` set |
| `triggerPortfolioAggregation` (resolver) | 프론트 수동 버튼 | `runPortfolioSnapshot` 로직 fire-and-forget 호출 후 즉시 응답(§3.4) |

---

## 3. 배치 설계

### 3.1 위치 / 이름

```
src/trigger/portfolioSnapshot.js          # runPortfolioSnapshot (얇은 어댑터)
src/resolver/portfolioDashboard/
  ├─ PortfolioDashboardController.js       # registerPortfolioDashboardController(resolver)
  ├─ PortfolioDashboardService.js          # getPortfolioDashboardService, triggerAggregationService
  ├─ PortfolioAggregator.js                # aggregateAllProjects/aggregateOneProject/computePortfolioRollup … (순수+조립)
  └─ PortfolioSnapshotRepository.js        # SQL upsert/select(2테이블) + KVS rollup get/set
src/rdb/query/PortfolioSnapshotQuery.js
src/rdb/schema/ddl/portfolioSnapshot.sql.js
```

### 3.2 집계 로직 (기존 서비스 재사용 + v2 인력/급여/문제이슈 추가)

```
aggregateAllProjects():
  1. projects   = getActiveProjectsService()      # 날짜기준(start<=오늘<=end) — 기존 재사용
  2. settings   = getSettingDataService()         # hourRate, currency, progressThreshold, band값
     holidays   = getPublicHolidayListService()   # 1회 조회 후 공유
     statusList = getProjectStatusListService()   # (조회 시 조인용. 배치엔 key만 저장)
  3. limit = pLimit(2)
     results = await Promise.allSettled(
        projects.map(p => limit(() => aggregateOneProject(p, settings, holidays)))
     )
  4. perProject = 성공분 → portfolio_project_snapshot upsert (행 단위, 인건비/롤레벨 JSON 포함)
     allProblemIssues = 성공분 perProject[].problemIssueCandidates 평탄화
       → severity desc 정렬 → TOP 50 슬라이스 → portfolio_problem_issue 전량 삭제 후 재삽입(§4.2.2)
     allSalaries     = 성공분 perProject[].salaries 평탄화 (히스토그램 모수)
     failedCount     = 실패분 → Sentry
  5. rollup = computePortfolioRollup(perProject, allSalaries, settings)
       # KPI(+totalSalary) + utilizationValues + effortTrend + salaryHistogram
     KVS portfolioRollup.set('current', { ...rollup, lastAggregatedAt, aggregateStatus })
```

`aggregateOneProject(project, settings, holidays)` — v1 진척도 캐시미스 경로 + **v2 인력 집계 추가**:

| 단계 | 모듈 | v1/v2 |
|------|------|-------|
| 워크로그 | `getResourceProjectWorklogs({projectId})` (전용 병렬 페처 p-limit 5) | v1 |
| 이슈 전체 | `fetchAllIssues(projectId, coworkerFieldId)` (nextPageToken 루프) | v1 |
| 진척 계산 | `ProgressCalculator`: normalizeIssue/computeCompletion/computeScheduleRate/computeEffortTotals/computeDiagnosisRates/computeStatusDistribution | v1 |
| 가동률 | `ResourceAnalysisService` 산식 + `workday.js` | v1 |
| 요약(기간) | `getSummaryDataService({project_id})` | v1 |
| 연차 | `getProjectWorkersScheduleRepository` | v1 |
| **인력 분포·인건비** | **`PortfolioSnapshotRepository.getProjectMemberAggregate(projectId)`** — projectusers GROUP BY role_key/level_key + Σ salary (SQL 1방, §3.2.1) | **★v2** |
| **문제이슈 추출** | `computeProblemIssues(normalizedIssues, lastWorklogDateMap, hourRate)` 순수함수(§7-8) | **★v2** |

> **coworkerFieldId**: 배치는 프론트 컨텍스트가 없으므로 백엔드에서 직접 조달. `fetchCustomFieldId('moves_RMS_coworkers')` 헬퍼(Jira `/field` 조회). v1과 동일.

#### 3.2.1 projectusers 인력 집계 — 재사용 경로 확정 (요구 §D)

확인된 기존 자산(`src/resolver/projectIssue/ProjectUsersRepository.js`):
- `groupByRoleRepository(project_id)` → `[{name: role_key, value: count}]`  (단일 프로젝트)
- `groupByLevelRepository(project_id)` → `[{name: level_key, value: count}]`
- `getSalaryRepository(project_id)` → `[{salary}]`
- 쿼리 상수(`src/rdb/query/ProjectUsersQuery.js`): `GET_SALARY`, `FIND_BY_PROJECT_ID` (컬럼: role_key/level_key/salary 확인)

**결정**: 배치는 프로젝트마다 위 3쿼리를 따로 호출하지 않고 **신규 단일 쿼리 1방**으로 묶는다(라운드트립 절감). `PortfolioSnapshotQuery.MEMBER_AGGREGATE` 신설:

```sql
SELECT
  role_key,
  level_key,
  COUNT(*)    AS cnt,
  SUM(salary) AS salary_sum
FROM projectusers
WHERE project_id = UUID_TO_BIN(?)
GROUP BY role_key, level_key;
```

→ Repository `getProjectMemberAggregate(projectId)` 가 결과를 접어 반환:
`{ roleDistribution:{key:cnt}, levelDistribution:{key:cnt}, totalSalary:Σsalary_sum, memberCount:Σcnt, salaries:[...] }`.
- `roleDistribution`/`levelDistribution` 은 role_key·level_key 축으로 각각 재합산(쿼리는 (role,level) 조합 그룹이므로 앱단에서 두 축으로 접음).
- `salaries[]`(개별 급여)는 전사 히스토그램 모수로 rollup 단계에서 수집. **개별 급여 값은 스냅샷 행·응답에 저장/노출하지 않음**(민감·불필요).

> 이 SQL은 워크로그 페치와 **완전 무관**(가벼운 단일 조회). 배치 비용 영향 미미. 기존 `groupByRole/LevelRepository`(단일프로젝트 화면 전용)는 그대로 두고 본 배치용 통합 쿼리를 신설(공통 경로 미수정 원칙).

### 3.3 부분 실패 처리 (v1 유지 + v2 보강)

`allSettled` 프로젝트 단위 격리. 성공분만 upsert, 실패분은 직전 스냅샷 행 유지 → `aggregateStatus:'PARTIAL'`. 실패 0 → `'OK'`, 활성 0건 → `'EMPTY'`. 개별 실패는 `console.error` + Sentry.
- **문제이슈 테이블**: 성공분 기준 전량 재적재(`DELETE ALL → INSERT 성공분 TOP50`). 단 활성 0건/전량 실패면 DELETE 생략(기존 행 유지).

### 3.4 수동 재집계 트리거 (v1 유지 — MVP 포함)

fire-and-forget. resolver `triggerPortfolioAggregation` 는 `aggregateAllProjects()` 를 await하지 않고 호출 후 즉시 `{started:true, lastAggregatedAt(직전값)}` 반환. KVS `aggregating` 플래그 동시 실행 가드. 프론트는 `lastAggregatedAt` 변화로 완료 감지.

### 3.5 manifest.yml 등록 (v1 유지)

```yaml
function:
  - key: portfolioSnapshot
    handler: trigger/portfolioSnapshot.runPortfolioSnapshot
    timeoutSeconds: 600
scheduledTrigger:
  - key: portfolio-snapshot
    function: portfolioSnapshot
    interval: day
```
`index.js` named export: `export { runPortfolioSnapshot } from './trigger/portfolioSnapshot'`.

---

## 4. DB / 스냅샷 스키마 설계

### 4.1 저장소 경계 (v2 갱신)

| 데이터 | 저장소 | 근거 |
|--------|--------|------|
| 프로젝트별 스냅샷 행 (가변 N행, 정렬·필터) **+인건비·롤/레벨 분포** | **SQL** `portfolio_project_snapshot` | 가변 N행·정렬·조인 → SQL. KVS payload 한도 회피. |
| **문제 이슈 TOP N(≤50)** | **SQL** `portfolio_problem_issue` | §4.3 — N=50 × 문자열(issueKey/summary/assignee) 배열은 KVS payload 한도에 부담. SQL 행으로 안전·정렬 용이. |
| 전사 롤업/메타 + 급여 히스토그램 + totalSalary | **KVS** `portfolioRollup`('current') | 항상 1개 작은 고정 객체. 히스토그램은 버킷 ≤ ~8개 고정 → 작음. |

### 4.2 SQL DDL — `src/rdb/schema/ddl/portfolioSnapshot.sql.js`

```sql
CREATE TABLE IF NOT EXISTS portfolio_project_snapshot (
    project_id          BINARY(16),
    project_name        VARCHAR(100),
    project_status_key  VARCHAR(50)  NULL,
    start_date          DATE         NULL,
    end_date            DATE         NULL,

    completion_rate     DOUBLE       DEFAULT 0,
    schedule_rate       DOUBLE       DEFAULT 0,
    diff_percent_point  DOUBLE       DEFAULT 0,
    planned_total_md    DOUBLE       DEFAULT 0,
    actual_total_md     DOUBLE       DEFAULT 0,
    actual_mm           DOUBLE       DEFAULT 0,
    member_count        INT          DEFAULT 0,
    avg_utilization     DOUBLE       DEFAULT 0,
    risk_score          DOUBLE       DEFAULT 0,

    issue_done          INT          DEFAULT 0,
    issue_in_progress   INT          DEFAULT 0,
    issue_todo          INT          DEFAULT 0,

    total_salary        DECIMAL(18,2) DEFAULT 0,   -- ★v2 월 인건비 Σ
    role_dist           JSON          NULL,         -- ★v2 {roleKey:count}
    level_dist          JSON          NULL,         -- ★v2 {levelKey:count}

    aggregated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (project_id),
    INDEX (risk_score)
);
```

> `diagnosis_status`/`status_name`/`color` 는 저장하지 않고 조회 시 read-time 산출·조인(v1 원칙 유지).

#### 4.2.1 롤/레벨 분포: JSON 컬럼 vs 별도 정규화 테이블 — **JSON 컬럼 채택 (근거)**

| 후보 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **JSON 컬럼**(`role_dist`/`level_dist`) | 프로젝트 1행에 분포 동봉 → 조회 1쿼리로 projects[] 완성. 분포는 **프로젝트 행과 1:1 종속**이고 MVP 위젯(100%정규화 막대)은 **프로젝트별 분포**라 across 집계 불요. upsert 단순. | 전사 롤별 총합을 SQL GROUP BY로 못 뽑음(앱단 합산 필요) | **채택** |
| 별도 테이블 `portfolio_project_role`(project_id, role_key, cnt) | 전사 롤별 SQL 집계 용이, 정규화 정석 | 조회 시 조인+그룹 필요, 행 폭증, upsert delete-insert 복잡, MVP 위젯 미요구 | 미채택(후속 전사 롤 합계 위젯 생기면 재검토) |

> 롤/레벨 분포 위젯은 x=프로젝트, 스택=롤/레벨인 **프로젝트별 100% 정규화 누적막대**. 데이터가 프로젝트 행에 종속된 JSON이 자연스럽다. 전사 롤 총합 across 집계가 필요해지면 그때 정규화 테이블 추가(후속).
> MySQL 8 / Forge SQL JSON 컬럼 지원. 적재 `JSON.stringify`, 조회 시 드라이버 반환형(객체 vs 문자열) 확인 후 안전 파싱.

#### 4.2.2 문제이슈 테이블 — `portfolio_problem_issue` (★v2 신규)

```sql
CREATE TABLE IF NOT EXISTS portfolio_problem_issue (
    seq           INT AUTO_INCREMENT,
    project_id    BINARY(16),
    project_name  VARCHAR(100),
    issue_key     VARCHAR(50),
    summary       VARCHAR(255),
    assignee      VARCHAR(100) NULL,
    delay_days    INT          DEFAULT 0,    -- x축
    effort_diff   DOUBLE       DEFAULT 0,    -- y축 (MD, actual-planned)
    status_key    VARCHAR(30)  NULL,
    severity      DOUBLE       DEFAULT 0,    -- 정렬·버블크기
    aggregated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seq),
    INDEX (severity)
);
```
- **행 상한 N=50**: 배치가 전사 후보를 severity desc 정렬 후 **상위 50건만** 삽입. 버블 차트는 50점이면 충분(과밀 방지). 코드 상수 `PORTFOLIO_PROBLEM_ISSUE_TOP_N = 50`.
- 재적재: 매 배치 `DELETE FROM portfolio_problem_issue` 후 ≤50행 `INSERT`(작은 테이블, 트랜잭션 불요. 전량 실패 시 DELETE 생략 — §3.3).

### 4.3 문제이슈 TOP N 저장 위치 — SQL 결정 근거 (요구 §C 핵심)

> v1 교훈: "큰 가변 배열은 KVS 금지". 문제이슈 50건 × (projectName/issueKey/summary≤255/assignee/delayDays/effortDiff/severity) ≈ 행당 수백 byte → 50건이면 수십 KB. KVS 단일 엔트리 payload 한도에 **경계선**이라 안전마진 부족 + rollup에 동봉 시 rollup 전체가 비대해짐.
> **결정: 별도 SQL 테이블 `portfolio_problem_issue`.** 근거 (1) 가변·문자열 다수 → KVS 부적합, (2) severity 정렬 INDEX, (3) projects 테이블과 동일 SQL 영역이라 일관, (4) N 상한으로 행 수 고정(≤50)이라 SQL 비용 미미.
> rollup(KVS)에는 **요약 카운트만** 동봉 가능(`problemIssueCount`, 선택) — 배열은 넣지 않음.

### 4.4 마이그레이션 등록 — `src/rdb/schema/migrate.js`

`ddl/index.js` 에 두 DDL export 추가 후:
```js
.enqueue('v006_create_portfolio_snapshot_table', CREATE_PORTFOLIO_SNAPSHOT_TABLE)
.enqueue('v007_create_portfolio_problem_issue_table', CREATE_PORTFOLIO_PROBLEM_ISSUE_TABLE)
```
(기존 v005 다음. migrationRunner 멱등 — `IF NOT EXISTS` + 이력. `init-db` scheduledTrigger 자동 실행, 별도 배포 액션 불필요.)

### 4.5 KVS 엔티티 — `portfolioRollup` (v2 payload 확장)

manifest `storage.entities`(v1과 동일 구조, payload 내용만 확장):
```yaml
- name: portfolioRollup
  attributes:
    id:      { type: string }   # 'current'
    payload: { type: any }
  indexes: [ id ]
```
payload 객체:
```jsonc
{
  "kpi": { …, "totalSalary": 412000000 },     // ★v2 totalSalary 포함
  "utilizationValues": [0.83, 0.7, …],         // read-time 버킷팅 원천(고유 인원 1인 1값)
  "avgUtilization": 0.86,
  "effortTrend": [ { "month":"2026-01", … } ],
  "salaryHistogram": [ { "bucket":"3M-5M", "min":…, "max":…, "count":11 } ],  // ★v2
  "lastAggregatedAt": "…", "aggregateStatus": "OK", "aggregating": false
}
```
> `CustomEntityManager('portfolioRollup').save('current', {...})` / `findById('current')`. (raw `kvs.set/get` 도 허용 — backend-engineer 통일, 권장 CustomEntityManager.)

---

## 5. 백엔드 구조

### 5.1 디렉토리 / 등록

```
src/resolver/portfolioDashboard/
  PortfolioDashboardController.js
  PortfolioDashboardService.js
  PortfolioAggregator.js
  PortfolioSnapshotRepository.js
src/trigger/portfolioSnapshot.js
src/rdb/query/PortfolioSnapshotQuery.js
src/rdb/schema/ddl/portfolioSnapshot.sql.js   # 두 CREATE 모두 export
```
`src/index.js`:
```js
import { registerPortfolioDashboardController } from "./resolver/portfolioDashboard/PortfolioDashboardController";
export { runPortfolioSnapshot } from "./trigger/portfolioSnapshot";
// …
registerPortfolioDashboardController(resolver);
```

### 5.2 Controller

```js
resolver.define('getPortfolioDashboard', responseWrapper(async () => getPortfolioDashboardService()));
resolver.define('triggerPortfolioAggregation', responseWrapper(async () => triggerAggregationService()));
```

### 5.3 조회 Service (`getPortfolioDashboardService`) — v2 확장

```
1. rollup = repo.getRollup()                        # KVS 'current'
   if (!rollup) return EMPTY shape
     (kpi zeros(+totalSalary:0), projects:[], roleMeta:{}, levelMeta:{},
      utilization 빈, effortTrend:[], salaryHistogram:[], problemIssues:[])
2. rows        = repo.getAllSnapshots()             # SQL, risk_score desc (role_dist/level_dist/total_salary 포함)
   problemRows = repo.getProblemIssues()            # ★v2 SQL, severity desc, ≤50
3. settings   = getSettingDataService()             # progressThreshold + utilizationUnderBand/OverBand
   statusList = getProjectStatusListService()       # status 조인
   roleList   = getRoleListService()                # ★v2 key→name (roleMeta)
   levelList  = getLevelListService()               # ★v2 key→name (levelMeta)
4. utilization = bucketize(rollup.utilizationValues, under, over)   # read-time
5. projects = rows.map(r => ({
     …, statusName/Color(조인), diagnosisStatus(diffPP, threshold), riskProjectFlag,
     issueSummary, totalSalary:r.total_salary,
     roleDistribution: parseJson(r.role_dist), levelDistribution: parseJson(r.level_dist),
   }))
6. roleMeta  = Object.fromEntries(roleList.data.map(x => [x.id, x.name]))
   levelMeta = Object.fromEntries(levelList.data.map(x => [x.id, x.name]))
7. problemIssues = problemRows.map(매핑)             # delayDays/effortDiff/severity 등
8. riskProjectCount = projects.filter(d==='delayed').length
   kpi = { ...rollup.kpi, riskProjectCount }        # totalSalary는 rollup.kpi에 이미 포함
9. return { lastAggregatedAt, aggregateStatus, kpi, projects, roleMeta, levelMeta,
            utilization, effortTrend: rollup.effortTrend,
            salaryHistogram: rollup.salaryHistogram, problemIssues }
```

> 진척도와 동일 원칙: threshold/이름 의존 값(diagnosisStatus·riskCount·roleMeta/levelMeta·status 이름·가동률 버킷)은 캐시하지 않고 read-time.

### 5.4 재사용 모듈 경로 (구현자 참조)

| 용도 | 모듈 |
|------|------|
| 활성 프로젝트 | `src/resolver/project/ProjectService.js` → `getActiveProjectsService` |
| 워크로그 병렬 페처 | `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` → `getResourceProjectWorklogs` |
| 이슈 전체 수집 | `src/api/jira/issue/IssueApi.js` → `getProjectIssuesByFilter` (nextPageToken 루프는 ProgressService 패턴) |
| 진척 계산(순수) | `src/resolver/projectProgress/ProgressCalculator.js` (normalizeIssue/computeCompletion/computeScheduleRate/computeEffortTotals/computeDiagnosisRates/computeDelayConfirmed/computeStatusDistribution/diagnoseStatus) |
| MM/가동률 | `src/resolver/resourceAnalysis/ResourceAnalysisService.js` + `src/utils/workday.js` |
| 프로젝트 요약 | `src/resolver/projectDashboard/ProjectDashboardService.js` → `getSummaryDataService` |
| 인원 스케줄(연차) | `src/resolver/mySchedule/MyScheduleRepository.js` → `getProjectWorkersScheduleRepository` |
| **인력 분포·인건비** ★v2 | `PortfolioSnapshotRepository.getProjectMemberAggregate`(신규, `MEMBER_AGGREGATE`). 참조 기존: `src/resolver/projectIssue/ProjectUsersRepository.js`(groupByRole/Level/getSalary) + `src/rdb/query/ProjectUsersQuery.js` |
| **롤/레벨 이름** ★v2 | `src/resolver/backoffice/role/RoleService.js` → `getRoleListService`, `…/level/LevelService.js` → `getLevelListService` (둘 다 `{data:[{id,name,…}]}`) |
| 설정/공휴일/상태 | `getSettingDataService`(`…/setting/SettingService.js`) / `getPublicHolidayListService` / `getProjectStatusListService` |
| 동시성 | `p-limit` |

### 5.5 에러 케이스 (v1 + v2)

| 상황 | 처리 |
|------|------|
| 스냅샷/롤업 없음 | 에러 아님 — `aggregateStatus:'EMPTY'` + 빈 배열들 |
| 개별 프로젝트 실패 (배치) | `allSettled` 격리, Sentry, 직전 행 유지, `'PARTIAL'` |
| projectusers/문제이슈 조회 실패 (배치) | 해당 프로젝트 집계 실패로 격리(전체 중단 안 함) |
| SQL 조회 실패 (조회) | `SqlError` throw → responseWrapper 직렬화 |
| role/level 메타 조회 실패 (조회) | roleMeta/levelMeta 빈 객체 폴백(차트는 key 노출) |
| 동시 집계 충돌 | KVS `aggregating` 가드 |

---

## 6. 프론트엔드 구조

### 6.1 라우트 / 네비게이션 (v1 유지)

`App.jsx`: `<Route path="/dashboard" element={<PortfolioDashboardPage />} />`
`Sidebar.jsx` mainItems 진입점 추가 + **mainItems 에 `permission` 필터 적용**(`canRead('REPORT')` 없으면 메뉴 숨김).

### 6.2 페이지/위젯 구조 — 3섹션 재편 (★v2)

```
static/ui/src/pages/portfolio/
  PortfolioDashboardPage.jsx          # 권한 게이트 + 단일 useQuery + 3섹션 배치
  PortfolioHeader.jsx                 # lastAggregatedAt 기준시각 + 재집계 버튼 + status 배너
  sections/
    SummarySection.jsx                # 섹션1
    ComparisonSection.jsx             # 섹션2
    RiskSection.jsx                   # 섹션3
  widgets/
    PortfolioKpiCards.jsx             # [섹션1] KPI 5장(프로젝트N·총MM·총인건비·평균진척·리스크건수)
    PortfolioProjectTable.jsx         # [섹션2] 현황 테이블(★중심, 드릴다운)
    PortfolioRoleLevelDist.jsx        # [섹션2] ★v2 롤/레벨 100%정규화 누적막대 + 롤/레벨 토글
    PortfolioSalaryByProject.jsx      # [섹션2] ★v2 프로젝트별 총인건비 막대
    PortfolioSalaryHistogram.jsx      # [섹션2] ★v2 급여 구간 분포 히스토그램
    PortfolioEffortTrend.jsx          # [섹션2] 전사 공수 추이 line
    PortfolioUtilization.jsx          # [섹션2] 가동률 분포 (P2 권고, 접기/토글)
    PortfolioRiskTop.jsx              # [섹션3] 리스크 TOP 프로젝트
    PortfolioProblemBubble.jsx        # [섹션3] ★v2 문제이슈 버블/산점도
  PortfolioDashboard.css
```

### 6.3 권한 게이트 (v1 유지)

`PortfolioDashboardPage.jsx` 진입부: `if (!canRead('REPORT')) return <SectionMessage warning>…</SectionMessage>`. 이중 방어(사이드바 숨김 + 페이지 가드).

### 6.4 데이터 조회 (단일 호출, v1 유지)

```jsx
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: portfolioKeys.dashboard(),
  queryFn: () => invoke('getPortfolioDashboard', {}),
  staleTime: 1000 * 60 * 5,
});
const isSuccess = data?.success === true;
// data.kpi / projects / roleMeta / levelMeta / utilization / effortTrend / salaryHistogram / problemIssues
```
수동 재집계: `useMutation({ mutationFn: () => invoke('triggerPortfolioAggregation', {}) })`.

### 6.5 쿼리키 팩토리 (신규) — `static/ui/src/utils/queryKey/portfolioKeys.js`

```js
export const portfolioKeys = {
  all: ['portfolio'],
  dashboard: () => ['portfolio', 'dashboard'],
};
```

### 6.6 위젯 ↔ 응답 필드 매핑 (★ 9위젯으로 갱신)

| # | 섹션 | 위젯 | 소비 필드 | 차트/표 |
|---|------|------|----------|--------|
| 1 | 1 | PortfolioKpiCards | `kpi.{activeProjectCount,totalActualMm,totalSalary,avgCompletionRate,riskProjectCount}` | KPI 카드 5 |
| 2 | 2 | PortfolioProjectTable | `projects[]`(name/status/memberCount/actualMm/totalSalary/completionRate/scheduleRate/avgUtilization/diagnosisStatus) | Atlaskit `DynamicTable`, 행클릭 `navigate('/project/'+projectId)` |
| 3 | 2 | PortfolioRoleLevelDist ★ | `projects[].roleDistribution` 또는 `.levelDistribution` + `roleMeta`/`levelMeta` (토글) | **stackChartOption(normalize:true)** — x=프로젝트, 스택=롤/레벨, 100% |
| 4 | 2 | PortfolioSalaryByProject ★ | `projects[].{projectName,totalSalary}` | `barChartOption` |
| 5 | 2 | PortfolioSalaryHistogram ★ | `salaryHistogram[]` | `barChartOption`(구간 막대) |
| 6 | 2 | PortfolioEffortTrend | `effortTrend[]`(cumulativeMm) | `lineChartOption` / `stackedLineChartOption` |
| 7 | 2 | PortfolioUtilization (P2) | `utilization.buckets[]`, `utilization.avgUtilization` | `barChartOption`/`pieChartOption` |
| 8 | 3 | PortfolioRiskTop | `projects.filter(riskProjectFlag).slice(0,N)` | 리스트(이미 risk_score desc 정렬) |
| 9 | 3 | PortfolioProblemBubble ★ | `problemIssues[]`(delayDays=x, effortDiff=y, severity=size, projectName/issueKey/summary/assignee=tooltip) | **scatterChartOption(신규)** 버블, 우상단 위험 |

### 6.7 차트 옵션 — 수정 1 + 신규 1 (★v2)

확인된 기존 옵션 디렉토리 `static/ui/src/components/chart/echart/options/`: barChart/barLine/calendarHeatmap/line/pie/radar/**stack**/stackedLine. **scatter(버블) 없음, stack 정규화 없음**(현재 `stackChartOption` 은 단순 `stack:'total'` bar만 — 확인됨).

1. **`stackChartOption.js` 확장** — 100% 정규화 옵션 추가(하위호환 유지):
```js
export function stackChartOption({ categories=[], seriesData=[], normalize=false }) {
  return {
    tooltip: { trigger:'axis', axisPointer:{type:'shadow'},
      valueFormatter: normalize ? (v)=> (v*100).toFixed(1)+'%' : undefined },
    legend: { top:'5%' },
    grid: { left:'3%', right:'4%', bottom:'3%', containLabel:true },
    xAxis: { type:'category', data:categories },
    yAxis: normalize
      ? { type:'value', max:1, axisLabel:{ formatter:(v)=>(v*100)+'%' } }
      : { type:'value' },
    series: seriesData.map(item => ({
      name:item.name, type:'bar', stack:'total',
      data: item.data,   // normalize=true 시 위젯이 0~1 비율로 전달
      label: normalize ? { show:true, formatter:(p)=> p.value>0.05 ? (p.value*100).toFixed(0)+'%' : '' } : undefined,
    })),
  };
}
```
> 정규화는 **프론트 위젯에서 비율 계산 후 전달**(프로젝트별 컬럼 합으로 나눠 0~1). PortfolioRoleLevelDist 가 `roleDistribution`(개수)을 정규화. 기존 호출부(`stack` 단순 사용처)는 `normalize` 기본 false라 **호환 유지**.

2. **`scatterChartOption.js` 신규** — 버블(`type:'scatter'`, `symbolSize=f(severity)`), x=delayDays, y=effortDiff, 우상단 위험. tooltip에 issueKey/summary/assignee/projectName. 위험 사분면 강조는 markArea/visualMap(선택).

### 6.8 차트 재사용 (v1 유지)

기존 `IssueAnalysisChart`/`ResourceAnalysisChart`(ECharts, `echarts-for-react`) 패턴·테마 동일. ApexCharts 미사용(요구 확정).

---

## 7. 재사용 vs 신규 계산식

### 재사용 (그대로 — 신규 정의 금지)
- 완성률 `computeCompletion`, 일정률 `computeScheduleRate`, 진단 `computeDiagnosisRates`/`diagnoseStatus`, 공수 totals `computeEffortTotals`, 상태분포 `computeStatusDistribution`, **확정지연 `computeDelayConfirmed`**(문제이슈 지연완료 delayDays 원천) — 전부 `ProgressCalculator.js`
- MM/가동률: `effectiveMmDays = baseMmDays − leaveDeduction`, 인당 가동률 `totalMd/effectiveMmDays` — `ResourceAnalysisService.js` + `workday.js`
- 1MD = `settings.hourRate` 시간 — `workday.js`

### 신규 계산 (본 기능 — `PortfolioAggregator.js` 순수 함수, jest 단위테스트)
1. **전사 롤업 `computePortfolioRollup(perProject[], allSalaries[], settings)`**: activeProjectCount=length, totalActualMd/Mm/PlannedMd=Σ, avgCompletionRate=mean(단순평균; 후속 계획공수 가중 옵션), **totalSalary=Σ perProject.totalSalary** ★v2.
2. **리스크 정렬 `riskScore`** = `max(0, -diffPercentPoint)`. 정렬 desc, 동점 endDate asc.
3. **가동률 분포 버킷**(read-time): band 경계 `settings.utilizationUnderBand`(0.7)/`utilizationOverBand`(1.1). 배치는 인당 `utilizationValues[]` 저장(고유 인원 1인 1값 = Σ실투입MD/Σ가용MD), 조회가 분류. (v1 §7-3 유지)
4. **전사 공수 추세 `effortTrend`**(월별): 전 프로젝트 워크로그 `YYYY-MM` 합산 → 누적.
5. **★v2 인건비**: `totalSalary`(프로젝트)=Σ projectusers.salary(MEMBER_AGGREGATE), 전사 `kpi.totalSalary`=Σ프로젝트.
6. **★v2 롤/레벨 분포**: `roleDistribution`/`levelDistribution` = MEMBER_AGGREGATE 결과를 role축·level축으로 각각 `{key:count}` 로 접음. 이름은 **저장 안 함**(조회 시 roleMeta/levelMeta 조인 — 이름 변경이 스냅샷에 박히지 않게, status 패턴과 동일).
7. **★v2 급여 히스토그램 `computeSalaryHistogram(allSalaries[], currency)`**: 전 프로젝트 개별 급여 배열을 **고정 버킷**으로 카운트. 버킷 경계는 통화 기준 **코드 상수**(예 KRW: 0/3M/5M/7M+). 후속 settings 관리. **개별 급여 값은 응답에 노출하지 않음**(카운트만).
8. **★v2 문제이슈 추출 `computeProblemIssues(normalizedIssues, lastWorklogDateMap, hourRate)`**:
   - 대상: (a) **기한초과 미완료** = `dueDate < 오늘 && statusKey !== 'done'` → delayDays = 오늘−dueDate; (b) **지연완료** = Done인데 `computeDelayConfirmed` 로직상 완료일−dueDate>0 → delayDays = 그 값. 둘 다 delayDays>0.
   - effortDiff(MD) = `(actualSeconds − plannedSeconds)/(hourRate*3600)` (plannedSeconds null이면 0). >0=공수초과.
   - **severity** = `delayDays*1.0 + max(effortDiff,0)*2.0` (지연·초과 가중 합. 우상단=고severity). 가중치 코드 상수(후속 settings 검토).
   - 프로젝트별 후보 반환 → 배치가 전사 평탄화 후 severity desc TOP **50**.

> 신규 계산은 전부 순수 함수 분리. 인건비/급여 분포·문제이슈 severity 는 Forge 의존 없어 jest 대상.

---

## 8. 열린 질문 — 설계 결정 (v1 유지 + v2 추가)

| # | 질문 | 결정 |
|---|------|------|
| Q1 | 라우트/네비 | `/dashboard` 신규 + 사이드바 mainItems(permission REPORT) |
| Q2 | 저장소 경계 | 프로젝트행=SQL `portfolio_project_snapshot`(+인건비·롤레벨JSON), **문제이슈=SQL `portfolio_problem_issue`(≤50)**, 롤업·히스토그램=KVS |
| Q3 | 배치 주기 | scheduledTrigger day + 수동 재집계(fire-and-forget) |
| Q4 | 활성 프로젝트 | 날짜기준(`start≤오늘≤end`), status 필터 없음 (사용자 확정) |
| Q5 | 가동률 모수 | 고유 인원 1인 1값(Σ실투입MD/Σ가용MD) |
| Q6 | MVP 위젯 | §9 |
| **Q7 ★v2** | 롤/레벨 분포 저장 | **JSON 컬럼**(프로젝트 행 1:1 종속, MVP는 across 집계 불요 — §4.2.1) |
| **Q8 ★v2** | 문제이슈 TOP N | **SQL 테이블, N=50**(가변·문자열 배열 → KVS 부적합 — §4.3) |
| **Q9 ★v2** | 급여 버킷 경계 / 노출 | 버킷 경계 = **코드 상수**(통화별), 후속 settings화. **급여 노출 권한 분리는 후속 검토**(현 REPORT 게이트 유지, 개별 급여 미노출) |

### 사용자 확정 (2026-06-01)
- 활성 프로젝트 = 날짜 기준만. 가동률 band = settings 관리(`utilizationUnderBand`0.7/`utilizationOverBand`1.1 신규 필드, 백오피스 설정 UI). 차트 = ECharts 단일.

---

## 9. MVP 범위 — 9위젯 우선순위 재정렬 (★v2)

| 우선 | 섹션 | 위젯 | 포함 | 근거 |
|------|------|------|------|------|
| P0 | 1 | 전사 KPI 카드(+총인건비) | ✅ | 한눈 요약, 롤업에 존재 |
| P0 | 2 | 프로젝트별 현황 테이블(+드릴다운, 인원/MM/인건비/진척/가동률/리스크) | ✅ | 핵심 가치(across+상세) |
| P0 | — | 기준시각 헤더 + 수동 재집계 | ✅ | 스냅샷 신선도 필수 |
| P1 | 3 | 리스크 TOP | ✅ | projects 정렬 재사용, 저비용 |
| P1 | 2 | **롤/레벨 분포 비교(정규화 누적막대)** ★ | ✅ | 요구 2차 핵심. SQL 1방 집계 |
| P1 | 2 | **프로젝트별 총 인건비(막대)** ★ | ✅ | 요구 2차 핵심. totalSalary 직접 |
| P1 | 3 | **문제이슈 버블** ★ | ✅ | 요구 2차 핵심. severity TOP50 |
| P2 | 2 | **급여 구간 분포 히스토그램** ★ | ⚠️ 후순위 | 인건비 막대보다 부가. salaryHistogram 집계 추가 |
| P2 | 2 | 전사 공수 추이(line) | ⚠️ 여유 시 | 월별 추세 부가 |
| **P2(강등)** | 2 | **인력 가동률 분포** | ⚠️ **권고: P2/접기** | 위젯 9종으로 화면 빡빡(요구 §F). 인력관점 가치 있으나 v2 신규 위젯에 밀림. **접기/탭 토글 배치 권고** |

**1차 릴리스 = P0 + P1(롤레벨분포·인건비막대·문제버블·리스크TOP 포함).** P2(급여히스토그램·공수추이·가동률분포)는 여유 시 또는 후속.

> **가동률 분포 권고(요구 §F)**: 섹션2가 이미 (테이블·롤레벨·인건비·급여분포·공수추이)로 과밀. 가동률 분포는 **P2 강등 + 섹션2 내 접기(또는 KPI 인근 소형 도넛)**로 우선순위 낮춰 배치 권고. **제거는 아님**(데이터 모델·집계는 유지). 최종 배치는 사용자 확인 필요.

---

## 10. 보류 / 미정 항목 (요구 §F — MVP 제외)

| 항목 | 상태 | 메모 |
|------|------|------|
| **작업 분포 위젯** | **보류 — 후속**(사용자 "고민 중") | 후보: 이슈타입별 / 인원·롤별 작업량 / 상태별. 추가 페치 없이 집계 가능(이미 normalizeIssue·status 분포 보유). MVP 제외, 데이터 모델 미반영. 확정 시 스냅샷 `taskDistribution` JSON 또는 rollup 추가로 확장. |
| **급여 노출 권한 분리** | **후속 검토** | 현 REPORT 게이트 유지. 급여 민감 → 별도 권한 플래그 분리는 후속. 응답엔 개별 급여 미노출(합계·구간 카운트만)으로 1차 위험 완화. |
| 가동률 분포 위젯 | **P2 강등(유지)** | §9 권고. 제거 아님. |
| 급여 버킷 settings화 | 후속 | MVP는 코드 상수. |
| 전사 롤 총합 위젯(across role 합계) | 후속 | 생기면 `portfolio_project_role` 정규화 테이블 도입(§4.2.1). |
| 큐 fan-out 배치 | 후속 안전판 | 활성 프로젝트 수백 규모 시 SchedulerService 큐 패턴 전환. |

---

## 11. i18n 키 — `locales/kr/portfolio.json` (en 동형, 직접 ko-KR/en-US 수정 금지 → merge)

```jsonc
{
  "nav": "전사 대시보드",
  "title": "전사 통합 대시보드",
  "noPermission": "이 페이지에 접근할 권한이 없습니다",
  "section": { "summary": "전사 요약", "comparison": "프로젝트 비교", "risk": "리스크/문제" },
  "header": {
    "lastAggregated": "기준 시각", "refresh": "지금 재집계",
    "refreshStarted": "재집계를 시작했습니다. 잠시 후 새로고침하세요",
    "statusPartial": "일부 프로젝트 집계 실패 — 직전 값 표시",
    "statusEmpty": "아직 집계된 데이터가 없습니다"
  },
  "kpi": {
    "activeProjects": "활성 프로젝트", "totalMm": "총 투입 MM",
    "totalSalary": "총 인건비", "avgCompletion": "평균 완성률", "riskProjects": "리스크 프로젝트"
  },
  "table": {
    "title": "프로젝트별 현황", "name": "프로젝트", "status": "상태",
    "members": "인원", "actualMm": "투입MM", "salary": "인건비",
    "completion": "완성%", "schedule": "일정%", "diff": "차이(%p)",
    "utilization": "가동률", "risk": "리스크", "empty": "표시할 프로젝트가 없습니다"
  },
  "roleLevel": {
    "title": "롤/레벨 분포", "toggleRole": "롤별", "toggleLevel": "레벨별",
    "empty": "인력 데이터가 없습니다"
  },
  "salary": {
    "byProjectTitle": "프로젝트별 인건비", "histogramTitle": "급여 구간 분포",
    "amountUnit": "원", "countUnit": "{count}명", "empty": "급여 데이터가 없습니다"
  },
  "risk": {
    "title": "리스크 TOP", "empty": "리스크 프로젝트가 없습니다",
    "badge": { "normal": "정상", "caution": "주의", "delayed": "지연" }
  },
  "problem": {
    "title": "문제 이슈", "x": "지연일수", "y": "공수편차(MD)",
    "delayDays": "지연일수", "effortDiff": "공수편차", "assignee": "담당자",
    "empty": "문제 이슈가 없습니다"
  },
  "utilization": {
    "title": "인력 가동률 분포", "under": "과소", "normal": "적정", "over": "과부하",
    "peopleUnit": "{count}명", "avg": "평균 가동률"
  },
  "effortTrend": { "title": "전사 공수 추이", "cumulativeMm": "누적 MM", "monthlyMd": "월 MD", "noData": "데이터가 없습니다" }
}
```
> en 동형 작성 후 `cd static/ui && npm run merge`. 가동률 band 설정 UI 라벨은 기존 `setting` 네임스페이스에 추가.

---

## 12. 구현 작업 분해

### Backend
- [ ] `ddl/portfolioSnapshot.sql.js`: `CREATE_PORTFOLIO_SNAPSHOT_TABLE`(+total_salary/role_dist/level_dist JSON) + `CREATE_PORTFOLIO_PROBLEM_ISSUE_TABLE`. `ddl/index.js` export. `migrate.js` v006/v007 enqueue
- [ ] `PortfolioSnapshotQuery.js`: snapshot UPSERT/SELECT_ALL, problem issue DELETE_ALL/INSERT/SELECT_TOP, **MEMBER_AGGREGATE**(projectusers GROUP BY role/level + Σsalary)
- [ ] `PortfolioSnapshotRepository.js`: upsertSnapshot, getAllSnapshots, replaceProblemIssues, getProblemIssues, **getProjectMemberAggregate**, getRollup/setRollup
- [ ] `PortfolioAggregator.js`: aggregateOneProject(진척/MM/가동률 + 인력집계 + computeProblemIssues), aggregateAllProjects(pLimit2/allSettled/TOP50), 순수함수 computePortfolioRollup(+totalSalary)/computeUtilizationValues/computeEffortTrend/**computeSalaryHistogram**/**computeProblemIssues**/riskScore/severity
- [ ] settings 스키마 `utilizationUnderBand`(0.7)/`utilizationOverBand`(1.1) 추가(시드 기본값 + `updateSettingService` 확장). 조회 service read-time `bucketize`
- [ ] coworkerFieldId 백엔드 조달 헬퍼(Jira `/field`)
- [ ] `trigger/portfolioSnapshot.js`(runPortfolioSnapshot)
- [ ] `PortfolioDashboardService.js`(getPortfolioDashboardService: 스냅샷+문제이슈+롤업 + read-time diagnosis + roleMeta/levelMeta 조인; triggerAggregationService: fire-and-forget + aggregating 가드)
- [ ] `PortfolioDashboardController.js` + `index.js` 등록(controller + runPortfolioSnapshot export)
- [ ] `manifest.yml`: function `portfolioSnapshot`, scheduledTrigger `portfolio-snapshot`(day), storage `portfolioRollup`
- [ ] jest: riskScore/버킷/롤업/**salaryHistogram**/**problemIssues severity** 단위테스트

### Frontend
- [ ] `utils/queryKey/portfolioKeys.js`
- [ ] `pages/portfolio/PortfolioDashboardPage.jsx`(canRead('REPORT') 가드 + 단일 useQuery + 3섹션)
- [ ] 섹션 3 + 위젯 9종(KpiCards/ProjectTable/**RoleLevelDist**/**SalaryByProject**/**SalaryHistogram**/EffortTrend/Utilization/RiskTop/**ProblemBubble**) + Header
- [ ] 차트옵션: `stackChartOption` normalize 옵션 추가, **`scatterChartOption.js` 신규**
- [ ] `App.jsx` 라우트 `/dashboard`
- [ ] `Sidebar.jsx` mainItems 진입점 + permission 필터 적용
- [ ] 백오피스 `SettingPage` 가동률 band(under/over) 입력 UI + 저장
- [ ] `locales/kr/portfolio.json` + `locales/en/portfolio.json` 작성 후 `npm run merge`

---

## 13. 핵심 위험 / 구현 주의

- **배치 타임아웃**: 활성 프로젝트·워크로그 규모 클수록 `timeoutSeconds:600` 부족 가능. pLimit(2) 유지. 인력 집계(MEMBER_AGGREGATE)는 가벼우니(워크로그 무관) 추가 부담 미미. 문제이슈 추출도 이미 페치한 이슈 재사용이라 추가 페치 없음. 초과 징후 시 큐 fan-out(후속).
- **공통 페치 경로 미수정**: 워크로그는 `getResourceProjectWorklogs`만. 인력은 신규 `MEMBER_AGGREGATE`(기존 groupBy* 미수정).
- **read-time 비캐시**: diagnosisStatus·statusName·riskProjectCount·**roleMeta/levelMeta 이름**·가동률 버킷 = read-time. 스냅샷엔 key/diff/분포 카운트만.
- **JSON 컬럼 파싱**: role_dist/level_dist 조회 시 드라이버 반환형(객체 vs 문자열) 확인 후 안전 파싱.
- **급여 민감성**: 개별 급여 값은 응답에 절대 노출하지 않음(프로젝트 Σ·구간 카운트만). 권한 분리는 후속.
- **문제이슈 N=50 상한**: 코드 상수 고정. 버블 과밀·KVS 회피 양쪽 목적. 변경 시 상수 1곳만.
- **fire-and-forget 한계**: 수동 트리거 응답은 "시작됨". 완료는 lastAggregatedAt 변화로 감지.
