# 전사 통합 대시보드 (Portfolio Dashboard) 설계서

> 슬러그 `portfolio-dashboard` · feature-architect · 2026-06-01
> 단일 진실 원천: backend / frontend / verifier 는 본 문서(특히 §2 경계면 계약)를 기준으로 작업한다.

---

## 1. 개요 / 영향 범위

PMO/경영진이 **모든 프로젝트를 가로질러(across)** 인력·공수·진척·리스크를 한 화면에서 조망하는 신규 최상위 화면. 기존 `projectDetail/dashboard`(단일 프로젝트)와 **별개 층위**.

데이터 전략은 요구사항에서 확정됨: **사전 집계(Scheduled Trigger 배치) → 스냅샷 적재 → 대시보드는 스냅샷만 조회**. 온디맨드 전 프로젝트 집계는 금지(256MB/타임아웃).

| 축 | 신규/수정 | 내용 |
|----|----------|------|
| 백엔드 (조회) | 신규 도메인 | `src/resolver/portfolioDashboard/` (Controller/Service/Repository) — 스냅샷만 읽음 |
| 백엔드 (배치) | 신규 핸들러 | `src/resolver/portfolioDashboard/PortfolioAggregator.js` + `src/trigger/portfolioSnapshot.js` (manifest scheduledTrigger 등록) |
| DB | 신규 SQL 테이블 | `portfolio_project_snapshot` (프로젝트별 1행) + KVS 엔티티 `portfolioRollup`(전사 롤업/메타). migrate.js enqueue 추가 |
| 프론트 | 신규 최상위 라우트 | `/dashboard` → `static/ui/src/pages/portfolio/PortfolioDashboardPage.jsx` + 위젯 + 사이드바 진입점 |
| i18n | 신규 파일 | `locales/kr/portfolio.json` · `locales/en/portfolio.json` (merge) |
| 권한 | 재사용 | `canRead('REPORT')` 게이트 (진척도 탭과 동일 PAGE_ID) |

**산식은 전부 기존 재사용**(진척 3층·MM·가동률). 신규 계산은 전사 롤업·가동률 분포 버킷·리스크 정렬 기준뿐(§7).

---

## 2. 경계면 계약 (★ 이 설계의 단일 진실)

`responseWrapper`는 서비스 반환 객체를 **루트로 펼친다**(`{ success:true, ...result }`). content 래핑 없음 — 진척도 페이지와 동일. 프론트는 `res.success`, `res.kpi`, `res.projects` 를 루트에서 직접 읽는다.

### 2.1 조회 resolver (대시보드 — 스냅샷만 읽음, 무거운 계산 없음)

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시, 루트 펼침) | 대응 프론트 훅/쿼리키 |
|--------------|-------------|-----------------------------------|---------------------|
| `getPortfolioDashboard` | `{}` | `{ success:true, lastAggregatedAt, aggregateStatus, kpi:{...}, projects:[{...}], utilization:{...}, effortTrend:[{...}] }` | `useQuery` / `portfolioKeys.dashboard()` |
| `triggerPortfolioAggregation` | `{}` | `{ success:true, started:true, lastAggregatedAt }` | `useMutation` (수동 재집계 버튼) |

> `getPortfolioDashboard` 는 **단일 호출로 전 위젯 데이터를 한 번에** 반환한다(스냅샷이 이미 적재돼 있어 가볍기 때문 — 위젯별 분할 호출 불필요). 스냅샷이 아직 없으면 `aggregateStatus:'EMPTY'` + 빈 배열을 반환(에러 아님).

#### 2.1.1 응답 필드 상세 (글자 그대로)

```jsonc
{
  "success": true,
  "lastAggregatedAt": "2026-06-01T18:30:00.000Z",  // ISO. 스냅샷 기준 시각(KVS rollup.lastAggregatedAt). null 가능(최초 미집계)
  "aggregateStatus": "OK",      // "OK" | "EMPTY" | "PARTIAL"  (PARTIAL = 일부 프로젝트 집계 실패)

  // 참고: KVS rollup.payload 에는 위 utilization.buckets 대신 utilizationValues:[0.83,0.7,...] (고유 인원별 가동률 배열)을 저장한다.
  //       조회 service가 settings 의 band 경계로 read-time 버킷팅하여 아래 utilization.buckets 를 생성한다(§5.3).

  "kpi": {                       // 전사 롤업 (KVS rollup에서 그대로)
    "activeProjectCount": 12,    // 집계 대상(활성) 프로젝트 수
    "totalActualMd": 1840.5,     // 전사 누적 실투입 MD
    "totalActualMm": 92.0,       // 전사 누적 실투입 MM (= Σ projectActualMm)
    "totalPlannedMd": 2100.0,    // 전사 계획 MD 합
    "avgCompletionRate": 0.62,   // 활성 프로젝트 완성률 단순 평균 (0~1)
    "riskProjectCount": 3        // diagnosisStatus==='delayed' 프로젝트 수
  },

  "projects": [                  // portfolio_project_snapshot 행을 매핑 (정렬: riskScore desc → 기본)
    {
      "projectId": "uuid-string",
      "projectName": "프로젝트 A",
      "statusKey": "status-xxxx",          // KVS status 엔티티 키
      "statusName": "진행중",               // 조회 시 status KVS에서 조인(이름은 캐시 안 함)
      "statusColor": "blue",
      "startDate": "2026-01-01",            // null 가능
      "endDate": "2026-06-30",
      "completionRate": 0.58,               // 0~1 (층2 완성률, ProgressCalculator)
      "scheduleRate": 0.71,                 // 0~1 (층3 일정률)
      "diffPercentPoint": -13.0,            // (완성-일정)*100, %p
      "diagnosisStatus": "delayed",         // "normal"|"caution"|"delayed" (read-time threshold 적용)
      "plannedTotalMd": 320.0,
      "actualTotalMd": 290.5,
      "actualMm": 14.5,                     // 프로젝트 투입 MM
      "memberCount": 8,
      "avgUtilization": 0.83,               // 프로젝트 평균 가동률 0~1 (실투입MD/가용MD 평균)
      "riskProjectFlag": true,              // diagnosisStatus==='delayed'
      "issueSummary": { "done": 40, "inProgress": 12, "todo": 18 },  // 상태 분포 개수
      "riskScore": 13.0                     // 정렬용 점수 (§7 신규 정의)
    }
  ],

  "utilization": {               // 전사 인력 가동률 분포 (신규 집계, §7)
    "buckets": [                 // ★ read-time 버킷팅: rollup.utilizationValues[]를 settings band 경계로 분류 (threshold와 동일 원칙)
      { "band": "under",  "label": "과소", "min": 0,    "max": 0.7, "count": 5 },
      { "band": "normal", "label": "적정", "min": 0.7,  "max": 1.1, "count": 22 },
      { "band": "over",   "label": "과부하","min": 1.1, "max": null,"count": 4 }
    ],
    "totalPeople": 31,           // 가동률 분포 모수(중복 제거된 고유 인원 수, §8-Q5)
    "avgUtilization": 0.86
  },

  "effortTrend": [               // 전사 누적 투입 MM 추세 (월별)
    { "month": "2026-01", "monthlyMd": 210.0, "cumulativeMd": 210.0, "cumulativeMm": 10.5 },
    { "month": "2026-02", "monthlyMd": 260.0, "cumulativeMd": 470.0, "cumulativeMm": 23.5 }
  ]
}
```

> **실패 시(공통)**: `responseWrapper` 가 `{ success:false, error:{ name, code, message, cause } }` 반환. 프론트는 `data?.success !== true` 로 분기(진척도 페이지와 동일).

### 2.2 배치 핸들러 (resolver 아님 — Scheduled Trigger / 수동 트리거가 호출)

| 함수 | 트리거 | 동작 |
|------|--------|------|
| `runPortfolioSnapshot(event, context)` | manifest scheduledTrigger (`portfolio-snapshot`, interval: day) | 활성 프로젝트 순회 집계 → `portfolio_project_snapshot` upsert + KVS `portfolioRollup` set |
| `triggerPortfolioAggregation` (resolver) | 프론트 수동 버튼 | 내부적으로 `runPortfolioSnapshot` 로직을 **fire-and-forget**으로 호출하고 즉시 응답(§3.4) |

---

## 3. 배치 설계

### 3.1 위치 / 이름

```
src/trigger/portfolioSnapshot.js          # export const runPortfolioSnapshot = async (event, context) => {...}
src/resolver/portfolioDashboard/
  ├─ PortfolioDashboardController.js       # registerPortfolioDashboardController(resolver)
  ├─ PortfolioDashboardService.js          # getPortfolioDashboardService (조회), triggerAggregationService
  ├─ PortfolioAggregator.js                # aggregateAllProjects() — 배치 핵심 로직(트리거에서 import)
  └─ PortfolioSnapshotRepository.js        # SQL upsert/select + KVS rollup get/set
```

`runPortfolioSnapshot` 은 얇은 어댑터로, 실제 로직은 `PortfolioAggregator.aggregateAllProjects()` 에 둔다(트리거·수동 양쪽이 공유, 단위 테스트 가능).

### 3.2 집계 로직 (기존 서비스 재사용)

```
aggregateAllProjects():
  1. projects = getActiveProjectsService()        # 기존: start<=오늘<=end (ProjectRepository.getActiveProjectsRepository)
     → "활성 프로젝트" 정의는 §8-Q4 참조
  2. settings = getSettingDataService()           # hourRate, progressThreshold
     holidays = getPublicHolidayListService()     # 1회만 조회 후 전 프로젝트 공유
     statusList = getProjectStatusListService()   # statusName/color 매핑용(스냅샷엔 key만, 조회 시 조인)
  3. const limit = pLimit(2)                       # 프로젝트 동시성 2 (워크로그 페처 내부가 이미 5 동시성 → 곱 10 상한)
     results = await Promise.allSettled(
        projects.map(p => limit(() => aggregateOneProject(p, settings, holidays)))
     )
  4. perProject = 성공분만 → portfolio_project_snapshot upsert(트랜잭션 아님, 행 단위 upsert)
     failedCount = 실패분 → 로그(Sentry). 부분 실패여도 성공분은 적재(§3.3)
  5. rollup = computePortfolioRollup(perProject)   # 전사 KPI + 가동률 분포 + 공수 추세 (신규 §7)
     KVS portfolioRollup.set('current', { ...rollup, lastAggregatedAt: now, aggregateStatus })
```

`aggregateOneProject(project, settings, holidays)` 은 **진척도 서비스의 캐시 미스 경로를 그대로 차용**:
- `getResourceProjectWorklogs({ projectId })` — 전용 병렬 페처(p-limit 5), 공통 경로 미수정
- `fetchAllIssues(projectId, coworkerFieldId)` — nextPageToken 루프 (ProjectProgressService 패턴)
- `getSummaryDataService({ project_id })` — 기간·멤버수·인건비
- `getProjectWorkersScheduleRepository` — 연차/반차(가동률 분모 보정)
- `ProgressCalculator`: `normalizeIssue` → `computeEffortTotals` / `computeCompletion` / `computeScheduleRate` / `computeDiagnosisRates` / `computeStatusDistribution`
- 가동률: `ResourceAnalysisService` 의 가동률 산식 재사용(effectiveMmDays = baseMmDays − leaveDeduction, 인당 totalMd/effectiveMmDays)

> **coworkerFieldId**: 배치는 프론트 컨텍스트가 없으므로 백엔드에서 직접 조달해야 한다. `fetchCustomFieldId('moves_RMS_coworkers')` 헬퍼 필요(IssueApi/UserApi 인근에 신설하거나 기존 조회 API 재사용). backend-engineer 가 manifest customField `coworkerIdField` 의 실제 필드 ID를 Jira `/field` 조회로 얻는 헬퍼를 구현한다.

### 3.3 부분 실패 처리

- `Promise.allSettled` 로 프로젝트 단위 격리 — 한 프로젝트 실패가 전체를 중단시키지 않음.
- 성공분만 upsert. 실패분은 직전 스냅샷 행을 그대로 유지(삭제하지 않음) → 화면엔 직전 값 + `aggregateStatus:'PARTIAL'` 노출.
- 실패 0건 → `'OK'`, 활성 프로젝트 0건 → `'EMPTY'`.
- 개별 프로젝트 실패는 `console.error` + Sentry 캡처(기존 SentryConfig 패턴 참조).

### 3.4 수동 재집계 트리거 — **제공함 (MVP 포함)**

근거: 배치 주기가 일 1회라 "방금 워크로그 입력했는데 반영 안 됨" 불만이 예상됨. 진척도/리소스는 온디맨드라 즉시성이 있으나 본 대시보드는 스냅샷이라 새로고침 수단이 필수.

- resolver `triggerPortfolioAggregation` → `aggregateAllProjects()` 를 **await 하지 않고** 호출(fire-and-forget) 후 즉시 `{ started:true, lastAggregatedAt(직전값) }` 반환.
  - 이유: Forge resolver 25s 타임아웃. 전 프로젝트 집계는 그 안에 못 끝날 수 있음.
  - 프론트는 버튼 클릭 후 일정 시간 뒤 `getPortfolioDashboard` 재조회(폴링 또는 수동 새로고침)로 갱신 확인. `lastAggregatedAt` 변화로 완료 감지.
- **동시 실행 가드**: KVS `portfolioRollup` 에 `aggregating:true` 플래그 + 시작시각. 이미 집계 중이면 새 트리거 무시(중복 방지).

### 3.5 manifest.yml 등록 (추가분)

```yaml
function:
  # ...기존...
  - key: portfolioSnapshot
    handler: trigger/portfolioSnapshot.runPortfolioSnapshot
    timeoutSeconds: 600        # 전 프로젝트 집계 — 큐 미사용, 단일 장기 실행

scheduledTrigger:
  # ...기존 init-db...
  - key: portfolio-snapshot
    function: portfolioSnapshot
    interval: day              # 매일 1회 (§8-Q3). Forge interval enum: hour|day|week
```

> 큐(`@forge/events`) 미사용 결정: 활성 프로젝트 규모가 수십 개 수준이고 `timeoutSeconds:600` + 프로젝트 2동시성이면 단일 핸들러로 충분. 규모가 수백 개로 커지면 SchedulerService의 큐 패턴(프로젝트별 이벤트 fan-out)으로 전환(후속). `index.js` 의 named export 로 핸들러 노출 필요: `export { runPortfolioSnapshot } from './trigger/portfolioSnapshot'`.

---

## 4. DB / 스냅샷 스키마 설계

### 4.1 SQL vs KVS 경계 (근거와 함께 확정)

| 데이터 | 저장소 | 근거 |
|--------|--------|------|
| **프로젝트별 스냅샷 행** (가변 N행, 정렬·필터 대상) | **SQL** `portfolio_project_snapshot` | (1) 프로젝트 수가 가변(수십~수백) → KVS 단일 엔트리에 배열로 넣으면 payload 한도 위험. (2) `project` 테이블이 이미 MySQL이라 FK·조인 자연스러움. (3) 정렬(riskScore)·`activeProjectCount` 같은 집계가 SQL에 적합. (4) 행 단위 upsert로 부분 실패 격리. |
| **전사 롤업/메타** (단일 객체) | **KVS** `portfolioRollup` (id `'current'`) | (1) 항상 1개 객체(KPI·가동률 분포·공수 추세·lastAggregatedAt·aggregating 플래그). (2) 크기 작고 고정 → KVS 1엔트리에 적합(진척도 캐시와 동일 발상). (3) `aggregating` 동시실행 가드 플래그를 가볍게 set/get. (4) DDL 마이그레이션 불필요. |

> **KVS payload 한도 회피 원칙**(진척도에서 검증됨): 큰 가변 배열(projects[])은 KVS에 넣지 않는다 → SQL 채택의 결정적 근거. 롤업은 작고 고정이라 KVS.

### 4.2 SQL DDL 초안 — `src/rdb/schema/ddl/portfolioSnapshot.sql.js`

```sql
CREATE TABLE IF NOT EXISTS portfolio_project_snapshot (
    project_id          BINARY(16),
    project_name        VARCHAR(100),
    project_status_key  VARCHAR(50)  NULL,
    start_date          DATE         NULL,
    end_date            DATE         NULL,

    completion_rate     DOUBLE       DEFAULT 0,   -- 0~1
    schedule_rate       DOUBLE       DEFAULT 0,   -- 0~1
    diff_percent_point  DOUBLE       DEFAULT 0,   -- (완성-일정)*100
    planned_total_md    DOUBLE       DEFAULT 0,
    actual_total_md     DOUBLE       DEFAULT 0,
    actual_mm           DOUBLE       DEFAULT 0,
    member_count        INT          DEFAULT 0,
    avg_utilization     DOUBLE       DEFAULT 0,   -- 0~1
    risk_score          DOUBLE       DEFAULT 0,   -- 정렬용

    issue_done          INT          DEFAULT 0,
    issue_in_progress   INT          DEFAULT 0,
    issue_todo          INT          DEFAULT 0,

    aggregated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (project_id),
    INDEX (risk_score)
);
```

> `diagnosis_status` 는 **저장하지 않는다**. 진척도 패턴(§ProgressCalculator)을 따라 `diff_percent_point` 만 적재하고, 조회 resolver에서 `settings.progressThreshold` 를 read-time 적용해 `diagnosisStatus` 산출(`diagnoseStatus(diffPP, threshold)`). 임계치 변경이 재집계 없이 즉시 반영됨.
> `status_name`/`color` 도 저장하지 않고 조회 시 status KVS에서 조인(이름 변경이 스냅샷에 박히지 않게).

upsert 쿼리(`PortfolioSnapshotQuery.UPSERT`, `INSERT ... ON DUPLICATE KEY UPDATE` — bulkUpdateLayoutsRepository 패턴 차용):

```sql
INSERT INTO portfolio_project_snapshot
  (project_id, project_name, project_status_key, start_date, end_date,
   completion_rate, schedule_rate, diff_percent_point, planned_total_md,
   actual_total_md, actual_mm, member_count, avg_utilization, risk_score,
   issue_done, issue_in_progress, issue_todo)
VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  project_name=VALUES(project_name), project_status_key=VALUES(project_status_key),
  start_date=VALUES(start_date), end_date=VALUES(end_date),
  completion_rate=VALUES(completion_rate), schedule_rate=VALUES(schedule_rate),
  diff_percent_point=VALUES(diff_percent_point), planned_total_md=VALUES(planned_total_md),
  actual_total_md=VALUES(actual_total_md), actual_mm=VALUES(actual_mm),
  member_count=VALUES(member_count), avg_utilization=VALUES(avg_utilization),
  risk_score=VALUES(risk_score), issue_done=VALUES(issue_done),
  issue_in_progress=VALUES(issue_in_progress), issue_todo=VALUES(issue_todo);
```

select(`SELECT_ALL`): `SELECT BIN_TO_UUID(project_id) AS project_id, ... FROM portfolio_project_snapshot ORDER BY risk_score DESC;`

### 4.3 마이그레이션 등록 — `src/rdb/schema/migrate.js`

`ddl/index.js` 에 `export { CREATE_PORTFOLIO_SNAPSHOT_TABLE } from './portfolioSnapshot.sql'` 추가 후:

```js
.enqueue('v006_create_portfolio_snapshot_table', CREATE_PORTFOLIO_SNAPSHOT_TABLE)
```

(기존 `v005` 다음 번호. migrationRunner 가 멱등 — `IF NOT EXISTS` + 이력 관리. manifest `init-db` scheduledTrigger(hour)가 자동 실행하므로 별도 배포 액션 불필요.)

### 4.4 KVS 엔티티 — `portfolioRollup`

manifest.yml `storage.entities` 에 추가:

```yaml
- name: portfolioRollup
  attributes:
    id:        { type: string }   # 항상 'current'
    payload:   { type: any }       # 롤업 전체 객체(KPI/utilization/effortTrend/lastAggregatedAt/aggregateStatus/aggregating)
  indexes:
    - id
```

> `CustomEntityManager` 의 `save('current', { id:'current', payload })` / `findById('current')` 사용. 진척도가 raw `kvs.set/get` 을 쓰는 것과 달리, 여기선 엔티티 매니저 패턴(설정성 단일 객체)을 따른다. 단순화를 위해 raw `kvs.set('portfolioRollup:current', payload)` 도 허용 가능 — backend-engineer 가 둘 중 하나로 통일(권장: CustomEntityManager, 설정성 KVS 규칙 §데이터 저장소 기준).

---

## 5. 백엔드 구조

### 5.1 디렉토리 / 등록

```
src/resolver/portfolioDashboard/
  PortfolioDashboardController.js   # registerPortfolioDashboardController(resolver)
  PortfolioDashboardService.js      # getPortfolioDashboardService, triggerAggregationService
  PortfolioAggregator.js            # aggregateAllProjects, aggregateOneProject, computePortfolioRollup
  PortfolioSnapshotRepository.js    # upsertSnapshot, getAllSnapshots, getRollup, setRollup
src/trigger/portfolioSnapshot.js    # runPortfolioSnapshot (얇은 어댑터)
src/rdb/query/PortfolioSnapshotQuery.js
src/rdb/schema/ddl/portfolioSnapshot.sql.js
```

`src/index.js` 추가:
```js
import { registerPortfolioDashboardController } from "./resolver/portfolioDashboard/PortfolioDashboardController";
export { runPortfolioSnapshot } from "./trigger/portfolioSnapshot";   // 트리거 핸들러 노출
// ...
registerPortfolioDashboardController(resolver);
```

### 5.2 Controller

```js
resolver.define('getPortfolioDashboard', responseWrapper(async () => getPortfolioDashboardService()));
resolver.define('triggerPortfolioAggregation', responseWrapper(async () => triggerAggregationService()));
```

### 5.3 조회 Service (`getPortfolioDashboardService`)

```
1. rollup = PortfolioSnapshotRepository.getRollup()    # KVS portfolioRollup 'current'
   if (!rollup) return { lastAggregatedAt:null, aggregateStatus:'EMPTY', kpi:{...zeros}, projects:[], utilization:{buckets:[],totalPeople:0,avgUtilization:0}, effortTrend:[] }
2. rows = PortfolioSnapshotRepository.getAllSnapshots() # SQL, riskScore desc
3. settings = getSettingDataService()                  # progressThreshold + utilizationUnderBand/utilizationOverBand (read-time)
   statusList = getProjectStatusListService()          # statusName/color 조인
   # 가동률 버킷 read-time 생성: rollup.utilizationValues[] 를 settings band 경계로 분류
   utilization = bucketize(rollup.utilizationValues, settings.utilizationUnderBand ?? 0.7, settings.utilizationOverBand ?? 1.1)
   # → { buckets:[{band,label,min,max,count}], totalPeople: values.length, avgUtilization: rollup.avgUtilization }
4. projects = rows.map(r => ({
     ...매핑...,
     statusName: statusMap[r.project_status_key]?.name,
     statusColor: statusMap[...]?.color,
     diagnosisStatus: diagnoseStatus(r.diff_percent_point, settings.progressThreshold ?? 5),
     riskProjectFlag: (그 결과 === 'delayed'),
     issueSummary: { done:r.issue_done, inProgress:r.issue_in_progress, todo:r.issue_todo },
   }))
5. riskProjectCount = projects.filter(diagnosisStatus==='delayed').length  # read-time 재계산(threshold 반영)
   kpi = { ...rollup.kpi, riskProjectCount }   # riskProjectCount만 read-time 덮어씀
6. return { lastAggregatedAt: rollup.lastAggregatedAt, aggregateStatus: rollup.aggregateStatus,
            kpi, projects, utilization, effortTrend: rollup.effortTrend }   # utilization 은 read-time 버킷팅 결과(3번)
```

> 진척도와 동일 원칙: **threshold 의존 값(diagnosisStatus/riskCount)은 캐시하지 않고 read-time 적용**.

### 5.4 재사용 모듈 경로 (구현자 참조)

| 용도 | 모듈 |
|------|------|
| 활성 프로젝트 | `src/resolver/project/ProjectService.js` → `getActiveProjectsService` |
| 워크로그 병렬 페처 | `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` → `getResourceProjectWorklogs` |
| 이슈 전체 수집 | `src/api/jira/issue/IssueApi.js` → `getProjectIssuesByFilter` (nextPageToken 루프는 ProgressService 패턴 복제) |
| 진척 계산(순수) | `src/resolver/projectProgress/ProgressCalculator.js` (normalizeIssue/computeCompletion/computeScheduleRate/computeEffortTotals/computeDiagnosisRates/computeStatusDistribution/diagnoseStatus) |
| MM/가동률 | `src/resolver/resourceAnalysis/ResourceAnalysisService.js` 산식 + `src/utils/workday.js` (getWorkdaysInRange/buildHolidayMap) |
| 프로젝트 요약 | `src/resolver/projectDashboard/ProjectDashboardService.js` → `getSummaryDataService` |
| 인원 스케줄(연차) | `src/resolver/mySchedule/MyScheduleRepository.js` → `getProjectWorkersScheduleRepository` |
| 설정/공휴일/상태 | `getSettingDataService` / `getPublicHolidayListService` / `getProjectStatusListService` |
| 동시성 | `p-limit` (이미 의존성) |
| 큐(미사용, 향후) | `src/utils/queueUtil.js` |

### 5.5 에러 케이스

| 상황 | 처리 |
|------|------|
| 스냅샷/롤업 없음 | 에러 아님 — `aggregateStatus:'EMPTY'` 반환 |
| 개별 프로젝트 집계 실패 (배치) | `allSettled` 격리, 로그+Sentry, 직전 행 유지, `'PARTIAL'` |
| SQL 조회 실패 | `SqlError` throw → responseWrapper 가 `{success:false,error}` |
| 동시 집계 충돌 | KVS `aggregating` 플래그로 가드, 중복 무시 |

---

## 6. 프론트엔드 구조

### 6.1 라우트 / 네비게이션 진입점 — **`/dashboard` 신규 (§8-Q1)**

`static/ui/src/App.jsx` `<Routes>` 에 추가:
```jsx
<Route path="/dashboard" element={<PortfolioDashboardPage />} />
```

`static/ui/src/layout/Sidebar.jsx` `mainItems` 최상단에 추가(My Work 위 또는 Projects 위):
```js
{ key: '/dashboard', icon: <DashboardIcon label="Dashboard"/>, label: t('portfolio.nav'), permission: 'REPORT' }
```
> `mainItems` 는 현재 `permission:null` 만 있으나, 사이드바는 `isReadable(item.permission)` 필터를 backofficeItems 에만 적용 중. **mainItems 에도 동일 필터를 적용**하도록 `mainItems` 도 `.filter(item => item.permission===null || isReadable(item.permission))` 추가 필요(frontend-engineer 가 처리). 이로써 `canRead('REPORT')` 없는 사용자는 메뉴 자체가 숨겨짐.

### 6.2 페이지 구조

```
static/ui/src/pages/portfolio/
  PortfolioDashboardPage.jsx          # 권한 게이트 + 단일 useQuery + 위젯 배치
  widgets/
    PortfolioKpiCards.jsx             # 전사 KPI 카드 4개
    PortfolioProjectTable.jsx         # 프로젝트별 현황 테이블 (행 클릭 → /project/:id 드릴다운)
    PortfolioRiskTop.jsx              # 리스크 TOP 프로젝트
    PortfolioUtilization.jsx          # 가동률 분포 (막대/도넛)
    PortfolioEffortTrend.jsx          # 전사 공수 추이 (line)
    PortfolioHeader.jsx               # lastAggregatedAt 기준시각 + 수동 재집계 버튼
  PortfolioDashboard.css
```

### 6.3 권한 게이트 적용 지점

`PortfolioDashboardPage.jsx` 진입부 (진척도 탭의 `canRender` 와 동일 발상, 단 라우트는 직접 가드):
```jsx
const canRead = usePermissionStore(s => s.canRead);
if (!canRead('REPORT')) return <SectionMessage appearance="warning">{t('portfolio.noPermission')}</SectionMessage>;
```
이중 방어: (1) 사이드바 메뉴 숨김(§6.1), (2) 페이지 진입 가드.

### 6.4 데이터 조회 (단일 호출)

```jsx
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: portfolioKeys.dashboard(),
  queryFn: () => invoke('getPortfolioDashboard', {}),
  staleTime: 1000 * 60 * 5,
});
const isSuccess = data?.success === true;
// data.kpi / data.projects / data.utilization / data.effortTrend / data.lastAggregatedAt 직접 사용
```

수동 재집계:
```jsx
const mut = useMutation({
  mutationFn: () => invoke('triggerPortfolioAggregation', {}),
  onSuccess: () => { /* toast: 집계 시작됨, 잠시 후 새로고침 */ }
});
```

### 6.5 쿼리키 팩토리 (신규) — `static/ui/src/utils/queryKey/portfolioKeys.js`

```js
export const portfolioKeys = {
  all: ['portfolio'],
  dashboard: () => ['portfolio', 'dashboard'],
};
```
> 기존 `projectKeys`(projectDetail용)와 분리. 새 파일 신규 생성(CLAUDE.md 규칙: 쿼리키는 반드시 팩토리).

### 6.6 위젯 ↔ 응답 필드 매핑

| 위젯 | 소비 필드 | 비고 |
|------|----------|------|
| PortfolioKpiCards | `kpi.{activeProjectCount,totalActualMm,avgCompletionRate,riskProjectCount}` | 카드 4개 |
| PortfolioProjectTable | `projects[]` 전체 | `DynamicTable`(Atlaskit) 패턴, 행 클릭 `navigate('/project/'+projectId)` |
| PortfolioRiskTop | `projects[].filter(riskProjectFlag).slice(0,N)` | riskScore desc 이미 정렬됨 |
| PortfolioUtilization | `utilization.buckets[]` | ECharts/ApexCharts 막대 |
| PortfolioEffortTrend | `effortTrend[]` | line, cumulativeMm |
| PortfolioHeader | `lastAggregatedAt`, `aggregateStatus` | "기준 시각" + 재집계 버튼 |

### 6.7 차트 재사용

기존 `IssueAnalysisChart`/`ResourceAnalysisChart`(ECharts) 패턴 참조. 위젯은 신규 컴포넌트지만 차트 옵션 구성 방식·테마는 동일.

---

## 7. 재사용 vs 신규 계산식

### 재사용 (그대로 — 신규 정의 금지)
- 층2 완성률 `computeCompletion`, 층3 일정률 `computeScheduleRate`, 진단 `computeDiagnosisRates`/`diagnoseStatus`, 공수 totals `computeEffortTotals`, 상태분포 `computeStatusDistribution` — 전부 `ProgressCalculator.js`
- MM/가동률: `effectiveMmDays = baseMmDays − leaveDeduction`, 인당 가동률 `totalMd / effectiveMmDays` — `ResourceAnalysisService.js` + `workday.js`
- 1MD = `settings.hourRate` 시간, 1MM = 월 근무일 — `workday.js`

### 신규 계산 (본 기능에서 처음 정의 — 명시)
1. **전사 롤업 `computePortfolioRollup(perProject[])`**
   - `activeProjectCount` = perProject.length
   - `totalActualMd` = Σ actualTotalMd, `totalActualMm` = Σ actualMm, `totalPlannedMd` = Σ plannedTotalMd
   - `avgCompletionRate` = mean(completionRate) — **단순 평균**(가중 아님; MVP). 후속에 계획공수 가중 옵션 검토.
2. **리스크 정렬 점수 `riskScore`** (프로젝트 행에 저장)
   - 정의: `riskScore = max(0, -diffPercentPoint)` (완성이 일정보다 뒤진 %p. 양수일수록 위험). diffPP=−13 → score 13.
   - 정렬: riskScore desc. 동점 시 endDate asc(임박 우선) — 조회 시 보조 정렬.
   - 근거: 주 신호가 완성 vs 일정(차이)이라는 진척도 §판단①과 일관. 공수 초과는 보조라 MVP 점수엔 미반영(후속에 가중 합산 검토).
3. **가동률 분포 버킷** (전사)
   - **band 경계는 settings 관리(확정, §8-Q 보강)**: `settings.utilizationUnderBand`(기본 0.7) / `settings.utilizationOverBand`(기본 1.1). under(<under) / normal(under~over) / over(≥over).
   - **버킷팅은 read-time**(threshold와 동일 원칙): 배치는 인당 가동률 값 배열 `utilizationValues[]` 만 rollup에 저장하고, 조회 service가 settings band로 분류해 buckets 카운트 생성 → band 변경이 다음 배치까지 안 막힘.
   - 모수: **고유 인원**(중복 제거). 인원이 여러 프로젝트에 참여 시 가동률은 **전 프로젝트 합산 실투입MD / 전 프로젝트 합산 가용MD**로 1인 1값 산출(§8-Q5). 즉 프로젝트별 가동률을 평균내지 않고, 인원 단위로 분자·분모를 합산. 배치의 `computeUtilizationValues(perProjectMemberData)` 가 인원 단위 합산 후 값 배열 반환.
4. **전사 공수 추세 `effortTrend`** (월별)
   - 전 프로젝트 워크로그를 월(`YYYY-MM`)별 합산 → 누적. `ResourceAnalysisService` 의 월별 집계 로직 차용하되 프로젝트 경계 없이 전사 합산.

> 신규 계산은 전부 `PortfolioAggregator.js` 의 순수 함수로 분리(Forge 의존 없는 부분은 jest 단위 테스트 — ProgressCalculator 처럼).

---

## 8. 요구사항 §7 열린 질문 — 설계 결정

| # | 질문 | 결정 | 근거 |
|---|------|------|------|
| Q1 | 라우트/네비 진입점 | **`/dashboard` 신규 최상위 + 사이드바 mainItems 진입점(permission REPORT)** | `/project` 는 이미 프로젝트 목록+칸반 탭. 전사 대시보드는 독립 개념이라 `/project` 하위/랜딩에 끼우면 의미 충돌. 신규 라우트가 사이드바 진입(My Work/Projects 와 동급)으로 가장 명확. |
| Q2 | 스냅샷 저장소 경계 | **프로젝트 행 = SQL `portfolio_project_snapshot`, 전사 롤업 = KVS `portfolioRollup`** | §4.1. 가변 N행·정렬·조인 → SQL. 단일 작은 객체 → KVS. KVS payload 한도 회피(진척도 검증). |
| Q3 | 배치 주기 + 수동 재집계 | **scheduledTrigger interval: day(매일 1회) + 수동 재집계 트리거 제공(fire-and-forget)** | 일 1회면 비용/신선도 균형. 즉시성 필요는 수동 버튼으로 보완(스냅샷 특성상 새로고침 수단 필수). |
| Q4 | "활성 프로젝트" 정의 | **`getActiveProjectsService` 기준 = start_date ≤ 오늘 ≤ end_date** (기존 구현 재사용) — **사용자 확정(2026-06-01): 날짜 기준만, status 필터 없음** | 이미 SchedulerService 가 동일 정의로 배치 대상 선정. 일관성·재사용. status 기준 제외는 도입 안 함. |
| Q5 | 가동률 모수(중복 인원) | **고유 인원 단위 1인 1값. 인원의 전 프로젝트 실투입MD 합 / 전 프로젝트 가용MD 합** | 프로젝트별 가동률 평균은 중복 인원을 과대/과소 집계. 인원 단위 합산이 "그 사람이 전사에서 얼마나 바쁜가"를 정확히 표현. |
| Q6 | MVP 위젯 우선순위 | §9 | — |

### 사용자 확정 (2026-06-01 — 보류 해제)
- **활성 프로젝트 정의**: **날짜 기준만**(`start≤오늘≤end`, 현 `getActiveProjectsService` 그대로). status 필터 도입 안 함.
- **가동률 band 경계값**: **settings 관리로 확정.** `settings.utilizationUnderBand`(기본 0.7) / `settings.utilizationOverBand`(기본 1.1) 신규 필드 추가. 백오피스 설정 페이지에 입력 UI 추가. 버킷팅은 read-time(§5.3·§7-3). → 작업 범위에 **settings 스키마 2필드 + 설정 UI** 추가(§10).

---

## 9. MVP 범위 (1차 릴리스 위젯 우선순위)

| 우선 | 위젯 | 포함 | 근거 |
|------|------|------|------|
| P0 | 전사 KPI 카드 | ✅ MVP | 한눈 요약, 데이터 이미 롤업에 존재 |
| P0 | 프로젝트별 현황 테이블 (+드릴다운) | ✅ MVP | 핵심 가치(across 조망 + 상세 진입). 스냅샷 행 직접 매핑 |
| P0 | 기준시각 헤더 + 수동 재집계 | ✅ MVP | 스냅샷 신선도 표기 필수 |
| P1 | 리스크 TOP | ✅ MVP | projects 정렬 재사용이라 저비용·고가치 |
| P1 | 가동률 분포 | ✅ MVP | 인력 관점 핵심. 신규 집계 필요하나 산식 재사용 |
| P2 | 전사 공수 추이 | ⚠️ MVP 포함하되 후순위 | 월별 추세는 부가 인사이트. 집계 비용 약간 추가(월별 워크로그 합산) |

**1차 릴리스 = P0+P1 전부 + P2(여유 시).** 히트맵(테이블의 시각 변형)은 테이블로 대체, 후속 고려.

---

## 10. 구현 작업 분해

### Backend
- [ ] `ddl/portfolioSnapshot.sql.js` + `ddl/index.js` export + `migrate.js` v006 enqueue
- [ ] `PortfolioSnapshotQuery.js` (UPSERT / SELECT_ALL)
- [ ] `PortfolioSnapshotRepository.js` (upsertSnapshot, getAllSnapshots, getRollup, setRollup)
- [ ] `PortfolioAggregator.js`: aggregateOneProject(진척/MM/가동률 재사용), aggregateAllProjects(pLimit 2, allSettled), computePortfolioRollup/computeUtilizationValues(인당 가동률 배열)/computeEffortTrend/riskScore (순수 함수 분리)
- [ ] settings 스키마에 `utilizationUnderBand`(기본 0.7)/`utilizationOverBand`(기본 1.1) 필드 추가(KVS settings 엔티티 + 시드 기본값). 조회 service의 read-time `bucketize`
- [ ] coworkerFieldId 백엔드 조달 헬퍼 (Jira `/field` 조회)
- [ ] `trigger/portfolioSnapshot.js` (runPortfolioSnapshot 어댑터)
- [ ] `PortfolioDashboardService.js` (getPortfolioDashboardService: 스냅샷+롤업 읽고 read-time diagnosis; triggerAggregationService: fire-and-forget + aggregating 가드)
- [ ] `PortfolioDashboardController.js` + `index.js` 등록(controller + runPortfolioSnapshot export)
- [ ] `manifest.yml`: function `portfolioSnapshot`, scheduledTrigger `portfolio-snapshot`(day), storage entity `portfolioRollup`
- [ ] jest: 순수 계산(riskScore/버킷/롤업) 단위 테스트

### Frontend
- [ ] `utils/queryKey/portfolioKeys.js`
- [ ] `pages/portfolio/PortfolioDashboardPage.jsx` (canRead('REPORT') 가드 + 단일 useQuery)
- [ ] 위젯 6종 (KpiCards/ProjectTable/RiskTop/Utilization/EffortTrend/Header)
- [ ] `App.jsx` 라우트 `/dashboard`
- [ ] `Sidebar.jsx` mainItems 진입점 + mainItems 에 permission 필터 적용
- [ ] 백오피스 설정 페이지(`SettingPage`)에 가동률 band(under/over) 입력 UI 추가 + 저장 연동
- [ ] `locales/kr/portfolio.json` + `locales/en/portfolio.json` 작성 후 `npm run merge` (+ 설정 UI용 키는 기존 setting 네임스페이스)

---

## 11. i18n 키 — `locales/kr/portfolio.json` (en 동형)

> 직접 `ko-KR.json`/`en-US.json` 수정 금지. 아래를 `locales/kr/`·`locales/en/` 에 추가 후 `cd static/ui && npm run merge`.

```jsonc
{
  "nav": "전사 대시보드",                    // en: "Portfolio"
  "title": "전사 통합 대시보드",
  "noPermission": "이 페이지에 접근할 권한이 없습니다",
  "header": {
    "lastAggregated": "기준 시각",
    "refresh": "지금 재집계",
    "refreshStarted": "재집계를 시작했습니다. 잠시 후 새로고침하세요",
    "statusPartial": "일부 프로젝트 집계 실패 — 직전 값 표시",
    "statusEmpty": "아직 집계된 데이터가 없습니다"
  },
  "kpi": {
    "activeProjects": "활성 프로젝트",
    "totalMm": "총 투입 MM",
    "avgCompletion": "평균 완성률",
    "riskProjects": "리스크 프로젝트"
  },
  "table": {
    "title": "프로젝트별 현황",
    "name": "프로젝트", "status": "상태", "completion": "완성%", "schedule": "일정%",
    "diff": "차이(%p)", "actualMm": "투입MM", "utilization": "가동률", "risk": "리스크",
    "members": "인원", "empty": "표시할 프로젝트가 없습니다"
  },
  "risk": {
    "title": "리스크 TOP", "empty": "리스크 프로젝트가 없습니다",
    "badge": { "normal": "정상", "caution": "주의", "delayed": "지연" }
  },
  "utilization": {
    "title": "인력 가동률 분포",
    "under": "과소", "normal": "적정", "over": "과부하",
    "peopleUnit": "{count}명", "avg": "평균 가동률"
  },
  "effortTrend": { "title": "전사 공수 추이", "cumulativeMm": "누적 MM", "monthlyMd": "월 MD", "noData": "데이터가 없습니다" }
}
```

---

## 12. 핵심 위험 / 구현 주의

- **배치 타임아웃**: 활성 프로젝트가 많고 각 프로젝트 워크로그가 크면 `timeoutSeconds:600` 도 부족할 수 있음. pLimit(2) 유지 + 프로젝트 수 모니터링. 초과 징후 시 큐 fan-out(SchedulerService 패턴)으로 전환 — 후속 안전판.
- **공통 페치 경로 미수정**: 워크로그는 반드시 `getResourceProjectWorklogs`(전용 병렬 페처)만 사용. myWork/dashboard 공통 경로 건드리지 않음(회귀 방지).
- **threshold/status 이름 비캐시**: diagnosisStatus·statusName·riskProjectCount 는 read-time. 스냅샷엔 diff_percent_point·status_key 만.
- **fire-and-forget 한계**: 수동 트리거 응답이 "시작됨"일 뿐 완료 보장 아님. 프론트는 lastAggregatedAt 변화로 완료 감지(폴링/수동 새로고침).
