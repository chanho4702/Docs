# 백엔드 구현 리포트 — dashboard-enhance **M1 · 히트맵 capacity · M5 · M4 · M7 · M8**

> 작성: backend-engineer / 2026-08-13
> 근거: `01_architect_design.md` §2·§3·§D5·§10(M1)·§11, `01a_leader_decisions.md`,
>       `00_input/addendum_heatmap.md`(사용자 추가 요청)
> 범위: **M1 백엔드 + 히트맵 `capacity` 백엔드.** M4(`updateChartFilter`, DDL v018, `filter_json`)는 **손대지 않았다.**
> 프론트 파일은 **한 줄도 건드리지 않았다**(병행 `work-bulk-apply` 충돌 회피).
>
> **프론트가 읽어야 할 응답 계약 5곳**: §2(M1 insight) · §10(히트맵 capacity) · **§11(M5 관계 토폴로지)** ·
> **§12(M4 커스텀 필터 — `updateChartFilter`·`addChart.filter`·`getChartInfo.filter_json`)** ·
> **§13(M7 포트폴리오 스페이스 계층 — `getPortfolioDashboard.projects[].spaces`)** ·
> **§14(M8 스콥 토폴로지 드릴다운 — `getPortfolioSpaceIssues`)**.
> ⚠ §11 은 `addendum_topology.md` **보강 4**(사용자 구조 정정)를 반영했다 — **설계서 §13-2-B 의 T1 응답
> 예시는 더 이상 유효하지 않다.** §11-2 가 확정 계약이고 §11-3 이 차이표다.

---

## 1. 구현한 resolver

| resolver | 등록 위치 | PermissionMap | 입력 |
|---|---|---|---|
| `getDashboardIssueInsight` | `ProjectDashboardController.js` (`registerProjectDashboardController` 맨 끝, `guardedDefine`) | `getDashboardIssueInsight: R('DASHBOARD', 'detail')` | `{ project_id }` |

- `guardedDefine` 사용 (`resolver.define` + `responseWrapper` 조합 **아님**).
- **`principal` 전달함** — `({payload, principal}) => getDashboardIssueInsightService({...payload, principal})`.
- `src/index.js` **무변경** (신규 컨트롤러 파일이 없음 — 기존 컨트롤러에 함수만 추가).
- `PermissionMap.js` 섹션 주석 개수 `8 → 9` 갱신.

---

## 2. 실제 응답 shape (**구현된 것 그대로**)

프론트는 `invoke('getDashboardIssueInsight', { project_id })` 로 부른다.
`responseWrapper` 가 **루트 스프레드**한다 → `result.content` 가 **아니라** `result.<key>` 로 직접 접근한다.

```jsonc
{
  "success": true,

  "generatedAt": "2026-08-13T04:12:33.000Z",   // string, new Date().toISOString()
  "hourRate": 8,                                // number — settings.hourRate || 8
  "dueSoonDays": 7,                             // number — 항상 7 (상수 DUE_SOON_DAYS)
  "scanned": 412,                               // number
  "truncated": false,                           // boolean — MAX_INSIGHT_ISSUES(2000) 초과 여부

  "project": {
    "startDate": "2026-01-05",   // string|null
    "endDate":   "2026-09-30",   // string|null
    "dDay":      48,             // number|null  (endDate - today, 일. 음수 = 초과)
    "elapsedRatio": 0.75         // number|null  (0~1, 소수 2자리 반올림, 달력일 기준)
  },

  "counts": {
    "total": 412,
    "done": 180, "inProgress": 95, "todo": 137,
    "overdue": 23, "dueSoon": 11, "unassigned": 8, "noEstimate": 64
  },

  "statusDistribution": {
    "byCount":  { "done": 180, "inProgress": 95, "todo": 137 },
    "byEffort": { "doneMd": 210.5, "inProgressMd": 88.0, "todoMd": 143.5 }
  },

  "issues": [                    // 서버가 이미 정렬해 보낸다(§3 참조). 전량, 캡 2000
    {
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "issueTypeName": "Task",                      // string|null
      "issueTypeIconUrl": "https://.../task.png",   // string|null
      "statusKey": "indeterminate",                 // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",                       // string|null
      "statusColorName": "yellow",                  // string|null
      "priorityName": "High",                       // string|null
      "priorityId": "2",                            // string|null (숫자여도 문자열로 변환)
      "assignee": { "accountId": "5b1…", "displayName": "홍길동", "avatarUrl": "https://…" }, // object|null
      "dueDate": "2026-08-01",                      // string|null
      "dDay": -12,                                  // number|null
      "plannedMd": 3.5,                             // number|null  ← null = "계획 미입력", 0 아님
      "actualMd": 5.0,                              // number (항상 숫자, 없으면 0)
      "flags": ["OVERDUE"]                          // string[] — done 이슈는 항상 []
    }
  ],

  // ── ▼ REPORT read 가 없으면 이 키 **자체가 응답에 없다** ──
  "metrics": {
    "completionRate": 0.623,     // number
    "scheduleRate":   0.714,     // number
    "diffPercentPoint": -9.1,    // number (%p, 소수 1자리)
    "effortVsCompletion": 4.2,   // number (%p, 소수 1자리)
    "status": "delayed",         // 'delayed'|'caution'|'normal'
    "plannedTotalMd": 442.0,     // number (소수 1자리)
    "actualTotalMd":  318.5      // number (소수 1자리)
  }
}
```

**실패 시**: `{ success:false, error:{ name, code, message, cause } }`
`project_id` 누락 → `error.cause === 'PROJECT_ID_REQUIRED'`, `error.code === 500`
(이 도메인의 `LogicalError(500, "Internal Server Error", "CODE")` 3인자 관례 — F20. `code` 가 아니라 **`cause`** 에 코드가 실린다.)

### 2-1. ⚠ 설계서 §2-2 와 **다른 점** (프론트가 반드시 볼 것)

| # | 항목 | 설계서 | 실제 구현 | 사유 |
|---|---|---|---|---|
| **A** | `metrics.completionRate` / `scheduleRate` 자릿수 | 예시가 `0.62` / `0.71`(2자리로 읽힘) | **소수 3자리** (`0.623`) | 진척도 탭(`ProjectProgressService.js:128,132`)이 `round1(rate*100)/100` = **3자리** 반올림이다. 요구 #1("탭과 숫자가 다르면 신뢰 붕괴")을 만족하려면 반올림식까지 같아야 한다. **프론트는 표시할 때 `toFixed(1)` 등으로 직접 포맷할 것** (`(rate*100).toFixed(1)` → `62.3%`) |
| **B** | `counts.noEstimate` 정의 | 주석: `plannedMd == null AND statusKey !== 'done'` | `computeQueueFlags` 의 **`NO_ESTIMATE` flag 카운트** (`originalEstimateSeconds===0 AND remainingEstimateSeconds===0`) | 설계 §3-3 5단계가 "overdue/dueSoon/unassigned/noEstimate 는 flags 카운트"로 명시. 산식을 새로 쓰지 않기 위해 flags 를 단일 출처로 삼았다. **차이**: 원 산정이 없는데 잔여 산정만 있는 이슈는 `noEstimate` 로 세지 않는다(그 이슈는 `plannedMd:null` 이지만 flags 에 `NO_ESTIMATE` 가 없다) |
| **C** | `issues[].statusName` | 예시 `"진행 중"` | `fields.status.name` 우선 (→ 실제 상태명) | `ProgressCalculator.normalizeIssue` 의 `statusName` 은 `statusCategory.name`("In Progress")을 우선해 배지 라벨로 거칠다. 배지에 쓰라는 설계 의도(`statusColorName` 동반)를 따라 raw 상태명을 준다 |
| **D** | `issues[]` 정렬 | 설계 §10 은 M2 항목 | **M1 에 포함해 구현** (`sortQueueItems`) | 리더 지시(§11 함정 11 — 프론트 정렬 복제 방지). 프론트는 **필터만** 하고 순서는 서버 순서를 그대로 쓸 것 |
| **E** | `priorityId` | `"2"` | `String(f.priority.id)` — Jira 가 숫자를 줘도 문자열 | FilterDef(M4)의 축 값이 문자열이라 타입을 고정 |

정렬 순서(= `WorkAssignmentRules.sortQueueItems`):
**OVERDUE → DUE_SOON → UNASSIGNED → 나머지 → dueDate asc(없으면 뒤) → key asc**

### 2-2. 계약 규약 (§2-2 그대로 지켜짐)

1. `metrics` 는 **키 부재 = 미제공**. 프론트는 `?? 0` / `?? {}` 금지, **`'metrics' in data`** 로 판정해 타일·위젯을 렌더하지 않는다.
2. `plannedMd: null` 은 "계획 미입력"이지 0이 아니다.
3. `truncated:true` 면 모든 집계가 과소값 — 경고 캡션 필수.

---

## 3. 신규/변경 파일

### 신규 (3 + 테스트 2)

| 경로 | 내용 |
|---|---|
| `src/permission/ReportAccess.js` | `canReadReport(principal)`, `REPORT_DENIED_REASON = 'REPORT_REQUIRED'`. `CostAccess.js` 와 문자 그대로 같은 형태(`=== true` 엄격 비교, `principal` 누락 = fail-close) |
| `src/resolver/projectDashboard/DashboardIssueFetcher.js` | `getDashboardIssues({projectId, viewerId, as})`, `invalidateDashboardIssues()`, `MAX_INSIGHT_ISSUES = 2000` |
| `src/resolver/projectDashboard/DashboardInsightService.js` | `getDashboardIssueInsightService({project_id, principal})`, `DUE_SOON_DAYS = 7` |
| `src/resolver/projectDashboard/__test__/DashboardInsight.test.js` | 게이팅·집계·정렬·폴백 25 케이스 |
| `src/resolver/projectDashboard/__test__/DashboardIssueFetcher.test.js` | 페이징·상한·캐시 키·실패 12 케이스 |

### 수정 (2)

| 경로 | 변경 |
|---|---|
| `src/resolver/projectDashboard/ProjectDashboardController.js` | `DashboardInsightService` import + `guardedDefine(resolver, 'getDashboardIssueInsight', …)` 1건 추가 (**principal 전달**) |
| `src/permission/PermissionMap.js` | `getDashboardIssueInsight: R('DASHBOARD','detail')` 추가, 섹션 주석 `8 → 9` |

### 건드리지 않은 것 (확인 완료)

- **공통 페처 무변경** — `getProjectIssuesByFilter` / `fetchAllProjectIssues` / `getBulkIssuesByProject` / `ProjectParticipantFetcher` 에 fields 를 **추가하지 않았다**(§11 함정 5). `priority` 는 전용 페처가 자기 fields 로 갖는다.
- `getProjectProgressSummary` / `getProjectCostSummary` 의 PermissionMap 무변경(§D5 — 넓히면 DASHBOARD-only 사용자가 진척도 탭 데이터를 통째로 받는다).
- `getChartDataById` 의 `data_type` 분기 무확장(§D3).
- `src/index.js`, DDL, `manifest.yml`, KVS 스키마, i18n, 프론트 전부 무변경.

---

## 4. 권한 경계 (§D5 구현 결과)

| 데이터 | 게이트 | 구현 |
|---|---|---|
| `issues[]`, `counts`, `statusDistribution`, `project`, `truncated` | `DASHBOARD read`(가드) | 가드만 |
| `metrics` | `DASHBOARD read` **AND** `REPORT read` | `canReadReport(principal)` false → **블록을 계산하지 않고 키를 뺀다** |

- `principal` 부재 → `canReadReport(undefined)` = false → **metrics 제거**(fail-close). 테스트로 고정.
- 게이트는 **페치보다 먼저** 판정한다 → REPORT 가 없는 호출에서는 일정 진척률에만 쓰이는 **공휴일 KVS 조회를 하지 않는다**(`SalaryChartGate` 의 "권한 없으면 Repository 를 호출하지 않는다" 관례). 계약 영향 없음.
- `getSummaryDataService` 의 `total_salary` 는 **읽되 응답에 싣지 않는다**(이 resolver 는 재무 축이 아님). 테스트로 고정.
- 형제 resolver 우회 점검: `metrics` 와 같은 지표를 내주는 다른 경로는 `getProjectProgressSummary` 하나뿐이고 그쪽은 이미 `R('REPORT','detail')` 다. 신규 우회로를 만들지 않았다.

---

## 5. 성능 (§D3/§D7)

- **전용 페처** `moves_RMS_projectId = "<uuid>"` 1패스, `maxResults=100` + `nextPageToken` do-while, `as:'user'`.
  fields: `summary,timetracking,assignee,status,statusCategory,duedate,issuetype,priority` / properties: `[movesRms]`.
  **Done 26주 창 없음**(전체 분포를 그려야 하므로). `customfield_10015` 미요청.
- **모듈 스코프 Promise 캐시** — TTL 60s, **엔트리 1개**, 키 `${viewerId}::${projectId}`, **viewerId 없으면 캐시 미사용**, **Promise 를 담아** 동시 진입에서도 페치 1벌, **실패 미캐시**. KVS 캐시 **없음**(§0-2 근거).
- 상한 `MAX_INSIGHT_ISSUES = 2000` 초과 시 페이지 루프 중단 + `truncated:true`.
- Jira 검색 실패 → `{issues:[],scanned:0,truncated:false}` **부분 폴백**(throw 안 함) → 서비스가 빈 집계를 정상 응답으로 내보낸다. 대시보드 전체가 깨지지 않는다.
- 한 호출당: Jira `⌈N/100⌉` · MySQL 1(`getSummaryData`) · KVS 1(settings) + 1(holiday, REPORT 보유 시만).

---

## 6. 재사용한 순수 모듈 (산식 복제 0건)

| 모듈 | 사용 함수 |
|---|---|
| `projectProgress/ProgressCalculator` | `normalizeIssue`, `computeStatusDistribution`, `computeCompletion`, `computeEffortTotals`, `computeScheduleRate`, `computeDiagnosisRates`, `diagnoseStatus` |
| `workAssignment/WorkAssignmentRules` | `computeQueueFlags`, `computeDDay`, `sortQueueItems` |
| `utils/workday` | `buildHolidayMap`, `getWorkdaysInRange` (진척도 탭과 동일 절차 `ProjectProgressService.js:87-93`) |

MD 환산식은 진척도 탭 `buildIssuesFromNorm` 과 동일: `plannedSeconds/(hourRate*3600)` 소수 1자리.

---

## 7. 테스트 결과

```
$ npx jest src/resolver/projectDashboard test/permission
Test Suites: 11 passed, 11 total
Tests:       216 passed, 216 total

$ npm test            (루트 전량)
Test Suites: 74 passed, 74 total
Tests:       1160 passed, 1160 total
Time:        30.993 s
```

**실패 0건.** `test/permission/permissionMap.contract.test.js`(등록집합 ↔ 매핑집합 대조) 포함 통과 —
신규 resolver 가 `PermissionMap` 에 정상 등록됐음을 계약 테스트가 확인한다.

신규 테스트가 고정한 것:
① REPORT 없음 → `metrics` 키 부재 · 공휴일 KVS 미조회
② `principal` 누락 → fail-close
③ `truncated` 전달
④ `completionRate` == `computeCompletion(normalizeIssue(...))` (반올림식 포함)
⑤ 페처 폴백 시 빈 집계 정상 응답
⑥ counts(done/inProgress/todo는 statusDistribution 재사용, flags 4종) · done 이슈 flags `[]` · coworkers 있으면 UNASSIGNED 아님
⑦ 서버측 정렬 순서 · `plannedMd:null` 보존 · `total_salary` 미노출
⑧ 페처: 페이징 · 2000 상한 · 캐시 키(viewerId/projectId 별) · 동시 진입 1벌 · viewerId 없으면 캐시 미사용 · 실패 미캐시 · fields 에 `priority` 포함

---

## 8. 다음 단계(frontend)가 주의할 것

1. **응답은 루트 스프레드다.** `result.content.counts` 아님 → `result.counts`. (`result.success` 확인 후 사용)
2. **`'metrics' in data`** 로 판정. `data.metrics?.completionRate ?? 0` 쓰지 말 것 — 부재와 0이 구분되지 않는다.
3. `metrics.completionRate` 는 **0~1 소수 3자리**다. 퍼센트 표시는 프론트가 `(v*100).toFixed(1)`.
4. `issues[]` 는 **이미 정렬돼 있다.** `sortQueueItems` 를 프론트에 복제하지 말 것. 필터만 한다.
5. `plannedMd` 는 `null` 가능 — 트리맵/계획대비실적에서 `?? 0` 금지(§D4 제외 규칙 + `excludedCount`).
6. `truncated:true` 면 경고 캡션(`dashboard.summaryPanel.truncatedWarn` / `insight.truncated`).
7. `useDashboardInsight` 에 **`coworkerFieldId` 를 넣지 말 것** — 백엔드가 이슈 프로퍼티로 읽으므로 불필요하고, 넣으면 선행 쿼리에 묶여 첫 렌더가 한 왕복 늦어진다.
8. `dueSoonDays`(=7)는 응답에 실려 있으니 문구에 하드코딩하지 말 것.

---

## 9. 남은 M1 백엔드 이슈

**없음.** 설계서 §10 M1 백엔드 체크리스트 8항목 전부 완료.
M2 백엔드 항목(`issues[]` 정렬)도 리더 지시로 **이번에 선반영**했다 — M2 착수 시 백엔드 변경 불필요.

---

# 10. 워크로그 히트맵 `capacity` (addendum_heatmap, 사용자 추가 요청)

## 10-1. 무엇을 바꿨나

`getChartDataById` 의 **worklog + heatmap 분기 응답에만** 일일 용량 정보를 동봉한다.
resolver 신규 없음, PermissionMap 변경 없음, 입력 파라미터 변경 없음.

| 항목 | 값 |
|---|---|
| resolver | `getChartDataById` (**기존, 무변경**) |
| 입력 | `{ project_id, dashboard_id, data_type:'worklog', chart_type:'heatmap', startDate?, endDate? }` — 기존 그대로 |
| PermissionMap | `R('DASHBOARD','detail')` — **변경 없음** |
| 영향 분기 | `chart_type === 'heatmap'` **만**. `lineStack` 은 무변경(테스트로 고정) |

## 10-2. 실제 응답 shape (**구현된 것 그대로**)

```jsonc
// invoke('getChartDataById', { project_id, dashboard_id, data_type:'worklog', chart_type:'heatmap' })
{
  "success": true,
  "dashboard_id": "w-1",
  "chartData": {
    "data": [ ["2026-08-01", 36000], ["2026-08-02", 7200] ],   // [날짜, 초] — 기존 그대로 (무변경)
    "year": "2026",                                            // 기존 그대로 (무변경)

    // ── ▼ 산출 가능할 때만 존재하는 키 ──
    "capacity": {
      "memberCount": 5,           // number, > 0 — 요약 타일의 "투입 인원"과 동일 값
      "hourRate": 8,              // number, > 0 — settings.hourRate
      "dailyCapacityHours": 40    // number — memberCount × hourRate (소수 1자리 반올림)
    }
  }
}
```

> `data` 의 값은 **초(seconds)** 다(기존과 동일). `capacity.dailyCapacityHours` 는 **시간(hours)** 이다.
> 비율 계산 시 프론트가 단위를 맞춰야 한다: `ratio = seconds / (dailyCapacityHours * 3600)`.
> — 기존 필드를 건드리지 않는다는 제약 때문에 단위가 섞였다. **이 한 줄이 가장 밟기 쉬운 함정이다.**

**`capacity` 키가 없는 경우 (= 기존 절대 구간으로 폴백)**

| 상황 | 결과 |
|---|---|
| `total_member_count` 가 0 | 키 부재 |
| 프로젝트 행 없음(요약 rows 비어 있음 → memberCount 0) | 키 부재 |
| `settings.hourRate` 가 없거나 0/음수/비유한수 | 키 부재 |
| 요약·설정 조회 실패(예외) | 키 부재 + `console.error` 로그. **히트맵 자체는 정상 렌더** |

⚠ **`0` 이나 `null` 을 채우지 않는다.** `metrics`·`total_salary` 와 같은 규약이다 —
프론트는 `chartData.capacity?.dailyCapacityHours ?? 8` 처럼 쓰지 말고
**`'capacity' in chartData`**(또는 `chartData.capacity != null`)로 판정해 폴백 여부를 정한다.

## 10-3. 숫자 일치 보장 (요구의 핵심)

> "인원수 출처: 대시보드 요약의 투입 인원(total_member_count)과 동일 산정 — 숫자가 요약 타일과 달라지면 안 됨"

`projectusers` 를 다시 세지 않는다. **`getSummaryDataService({project_id})` 를 그대로 호출**한다.
→ 같은 SQL(`ProjectDashboard.GETSUMMARY` 의 `COUNT(DISTINCT pu.account_id)`), 같은 서비스 함수.
`getSummaryData` resolver(요약 타일)와 **같은 경로**이므로 산정이 갈릴 수 없다.

`hourRate` 는 `getSettingDataService()` — M1 insight 가 쓴 것과 **같은 단일 출처**다. 새 설정 항목 없음.

## 10-4. 추가 왕복 비용

| 분기 | 추가 비용 |
|---|---|
| `worklog` + **heatmap** | **MySQL 1회**(`GETSUMMARY`) + **KVS 1회**(settings) |
| `worklog` + `lineStack` | **0** (분기에 들어가지 않는다) |
| 그 외 모든 data_type | **0** |

- 두 조회는 `aggregateByDateService`(워크로그 집계)와 **`Promise.all` 로 병렬**이라 지연 증가는 두 경로 중 느린 쪽에 흡수된다.
- 프론트는 위젯당 `invoke('getChartDataById')` 1회이므로 **히트맵 위젯 1개당 MySQL 1 + KVS 1**이다.
  히트맵을 2개 얹으면 2배가 된다(현재 구조상 위젯 간 hoist 지점이 없다 — `getChartDataService` 의
  `salaryPolicy` 처럼 루프 밖으로 빼려면 두 서비스의 시그니처를 바꿔야 해서 범위 밖으로 뒀다).
  실사용에서 같은 프로젝트에 히트맵을 여러 개 두는 경우가 없어 수용한다.
- Jira 왕복 **증가 0**.

## 10-5. 변경 파일

| 경로 | 변경 |
|---|---|
| `src/resolver/projectDashboard/ProjectDashboardService.js` | `getSettingDataService` import 추가 · `resolveHeatmapCapacity(project_id)` 신규(비공개) · `formatWorklogChartData` 의 `heatmap` case 만 수정(블록 스코프로 감싸고 `capacity` 조건부 스프레드). 사용처가 사라진 `let data;` 제거 |
| `src/resolver/projectDashboard/__test__/WorklogHeatmapCapacity.test.js` | 신규 — 10 케이스 |

**건드리지 않은 것**: `lineStack` 분기, `aggregateByDateService`, `calendarHeatmapOption.js`(프론트),
PermissionMap, Controller, DDL, locales. 프론트·i18n 은 **한 줄도 수정하지 않았다.**

## 10-6. 테스트 결과

```
$ npx jest src/resolver/projectDashboard
Test Suites: 5 passed, 5 total
Tests:       59 passed, 59 total

$ npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total

$ npm test            (루트 전량)
Test Suites: 75 passed, 75 total
Tests:       1170 passed, 1170 total
Time:        52.965 s
```

**실패 0건.** 신규 테스트가 고정한 것:
① `memberCount × hourRate = dailyCapacityHours` · ② `memberCount` 가 `getSummaryDataRepository`(GETSUMMARY)에서 옴 ·
③ `hourRate` 가 settings 에서 옴 · ④ 기존 `data`/`year` 무변경 · ⑤ MySQL 요약 1회만 ·
⑥ 인원 0 / 행 없음 / hourRate 없음 / 조회 실패 4케이스 모두 **키 부재**(히트맵은 정상 렌더) ·
⑦ `lineStack` 은 capacity 미부착 + 요약·설정을 **읽지도 않음**

## 10-7. 프론트가 할 일 (백엔드는 끝났다)

1. `calendarHeatmapOption({ data, year, capacityHours })` — `capacityHours` 미전달 시 **기존 pieces 그대로**.
2. `ChartTemplate.js` 에서 `chartData.capacity` 존재 시에만 `capacityHours: chartData.capacity.dailyCapacityHours` 전달.
   **`?? 8` 같은 기본값 주입 금지** — 키 부재가 곧 "절대 구간 폴백" 신호다.
3. **단위 변환**: `data[i][1]` 은 초, `dailyCapacityHours` 는 시간. 비율은 `sec / (hours*3600)`.
4. 구간은 요구대로 `0 / >0~25% / 25~50% / 50~75% / 75~100% / 100%+`, 라벨은 시간 환산값으로 표시
   (5명×8h → `~10h / ~20h / ~30h / ~40h / 40h+`). 툴팁에 시간 + 용량 대비 % 병기.
5. i18n 신규 키는 `locales/kr|en` 에 추가 후 `npm run merge` — **merge 실행 시점은 리더가 조율**(§D8).

---

# 11. M5 — 관계 토폴로지 `getProjectRelationGraph` (T1)

> 기준: `01_architect_design.md` §13 + `01a_leader_decisions.md`(Q5·Q7) +
>       **`00_input/addendum_topology.md` 「보강 4」(사용자 T1 구조 정정)**
> ⚠ **보강 4 가 설계서 §13-2-B 의 T1 구조를 대체한다.** 아래 §11-2 가 확정 계약이다.
> 범위: **M5 백엔드만.** 프론트·locales 무변경. M6(포트폴리오)은 설계상 백엔드 0건이라 작업 없음.

## 11-1. 구현한 resolver

| resolver | 등록 위치 | PermissionMap | 입력 |
|---|---|---|---|
| `getProjectRelationGraph` | `ProjectDashboardController.js` (`guardedDefine`, 맨 끝) | **`R('PROJECT','detail')`** | **`{ projectId }`** |

- ⚠ **이 컨트롤러에서 유일하게 `DASHBOARD` 가 아닌 매핑**이다(§13-D8 · 리더 Q7 승인).
  내주는 것이 작업관리/간트가 소유한 데이터(이슈 계층·링크)라 그 화면들과 같은 게이트를 쓴다.
  `DASHBOARD read` 로 열면 PROJECT 를 회수한 설치에서 대시보드 위젯이 그 데이터를 **우회 노출**한다.
  시드 Member 는 `PROJECT read=true` → 기본 설치 영향 0.
- ⚠ **입력 키가 `projectId`** 다(M1 insight 는 `project_id`). `project:'detail'` 스코프 검증이
  `payload.projectId ?? payload.project_id` 를 읽으므로 둘 중 하나여야 하고 §13-D8 이 `projectId` 로 고정했다.
  **프론트는 훅에서 흡수하고 호출부에 노출하지 말 것.**
- `principal` 전달함 — 전용 페처 캐시 키(viewerId).
- `src/index.js` 무변경. `PermissionMap.js` 섹션 주석 `9 → 10` 갱신.

## 11-2. 실제 응답 shape (**구현된 것 그대로**)

`invoke('getProjectRelationGraph', { projectId })` → 루트 스프레드(`result.nodes`, `result.content` 아님).

**계층 3단** — 루트(무브스 RMS 프로젝트) → **SPACE(Jira 프로젝트/스페이스)** → ISSUE.

```jsonc
{
  "success": true,
  "generatedAt": "2026-08-13T06:20:11.000Z",
  "hourRate": 8,                   // number — actualMd/plannedMd 를 만든 분모
  "scanned": 412,                  // number
  "truncated": false,              // boolean — MAX_TOPOLOGY_ISSUES(800) 초과로 페이지 루프를 끊었는지
  "spaceCount": 2,                 // number — 등장한 Jira 스페이스 수
  "outOfScopeEdgeCount": 3,        // number — 끝점이 페치 집합 밖이라 그리지 못한 엣지 수

  "project": { "projectId": "9f3c…", "projectName": "차세대 포털" },   // projectName: string|null

  "nodes": [
    // ── 루트: 항상 정확히 1개, 항상 nodes[0] ──
    { "id": "project", "kind": "PROJECT", "name": "차세대 포털", "degree": 2 },

    // ── 중간: Jira 스페이스. 이슈 등장 순서로 만들어진다(구독 스페이스 복수 가능) ──
    { "id": "space:DWEB", "kind": "SPACE", "key": "DWEB", "name": "웹 개발", "degree": 41 },

    // ── 리프: 이슈 ──
    { "id": "issue:DWEB-142", "kind": "ISSUE",
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "projectKey": "DWEB",                       // string|null — 소속 스페이스(그룹핑/색 지정용)
      "projectName": "웹 개발",                    // string|null
      "issueTypeName": "Task",                    // string|null
      "issueTypeIconUrl": "https://…",            // string|null
      "isSubtask": false,                         // boolean — issuetype.subtask
      "statusKey": "indeterminate",               // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",                     // string|null  ← fields.status.name (배지 라벨)
      "statusColorName": "yellow",                // string|null
      "assignee": { "accountId": "5b1…", "displayName": "홍길동" },  // object|null — avatarUrl 없음(§13-D6)
      "actualMd": 5.0,                            // number ★ 노드 크기 재료. 투입 없으면 0
      "plannedMd": 3.5,                           // number|null — 툴팁용. null = 미산정(0 아님)
      "degree": 3 }
  ],

  "edges": [
    // ── 소속 2종 ──
    { "id": "ROOT_SPACE:project>space:DWEB",  "kind": "ROOT_SPACE",  "source": "project",    "target": "space:DWEB" },
    { "id": "SPACE_ISSUE:space:DWEB>issue:DWEB-142",
      "kind": "SPACE_ISSUE", "source": "space:DWEB", "target": "issue:DWEB-142" },

    // ── 이슈 간 관계 3분류 (범례 축) ──
    { "id": "SUBTASK:issue:DWEB-100>issue:DWEB-142",
      "kind": "SUBTASK",          "source": "issue:DWEB-100", "target": "issue:DWEB-142" },
    { "id": "WORKFORCE_PARENT:issue:DWEB-90>issue:DWEB-142",
      "kind": "WORKFORCE_PARENT", "source": "issue:DWEB-90",  "target": "issue:DWEB-142" },
    { "id": "ISSUE_LINK:10432",
      "kind": "ISSUE_LINK", "source": "issue:A", "target": "issue:B",
      "typeName": "Blocks",           // ★ 색·범례 구분의 키. Blocks 포함 전 타입. string|null
      "relation": "blocks",           // 표시 문구. ⚠ 판정에 쓰지 말 것. string|null
      "linkId": "10432" }             // string|null
  ],

  "edgeKindCounts": {                 // ★ 5키가 **항상 모두** 있다(없는 종류는 0)
    "ROOT_SPACE": 2, "SPACE_ISSUE": 412,
    "SUBTASK": 41, "ISSUE_LINK": 31, "WORKFORCE_PARENT": 5
  },
  "linkTypeNames": ["Blocks", "Cloners", "Relates"]   // 등장한 ISSUE_LINK typeName, 오름차순 정렬
}
```

**실패 시**: `{ success:false, error:{ name, code, message, cause } }`
`projectId` 누락 → `error.cause === 'PROJECT_ID_REQUIRED'`(3인자 `LogicalError` 관례 — 코드가 `code` 가 아니라 **`cause`**).

### 방향 계약
| kind | source | target |
|---|---|---|
| `ROOT_SPACE` | `"project"`(루트) | `space:<KEY>` |
| `SPACE_ISSUE` | `space:<KEY>` | `issue:<KEY>` |
| `SUBTASK` | **부모**(Jira parent) | 자식 |
| `WORKFORCE_PARENT` | **부모**(앱 wbsParent) | 자식 |
| `ISSUE_LINK` | outward 쪽(예: Blocks = **선행**) | inward 쪽(후행) |

## 11-3. ⚠ 설계서 §13-2-B 와 **다른 점** (프론트가 반드시 볼 것)

보강 4 로 **구조 자체가 바뀌었다.** 설계서 §13-2-B 의 T1 응답 예시는 더 이상 유효하지 않다.

| # | 항목 | 설계서 §13-2-B | **실제(보강 4 반영)** | 사유 |
|---|---|---|---|---|
| **A** | 계층 | 프로젝트 → (폴더) → 이슈. 부모 없는 이슈는 `ROOT` 엣지로 중심에 직결 | **프로젝트 → SPACE(Jira 프로젝트) → 이슈** 3단. `ROOT` 폐기, `ROOT_SPACE`+`SPACE_ISSUE` 신설 | 보강 4 사용자 지시("무브스아이 → 프로젝트 → 연결된 이슈") |
| **B** | 엣지 종류 | 9종(`PARENT_WORKFORCE`/`PARENT_JIRA`/`PARENT_JIRA_SHADOWED`/`BLOCKS`/`FOLDER_CHILD`/`FOLDER_MEMBER`/`FOLDER_LINK`/`ROOT`/`ISSUE_LINK`) | **5종**(`ROOT_SPACE`/`SPACE_ISSUE`/`SUBTASK`/`ISSUE_LINK`/`WORKFORCE_PARENT`) | 보강 4 가 이슈 간 관계를 **3분류로 확정**(하위이슈/연결이슈/워크포스 연결이슈) |
| **C** | `BLOCKS` 분리 | 별도 kind. `ISSUE_LINK` 에서 제외하는 중복 제거를 서버가 수행(규약 1) | **kind 폐기.** Blocks 는 `ISSUE_LINK` 안에서 `typeName:'Blocks'` 로 구분 | 보강 4: "연결이슈 = Blocks 포함 전 타입, 타입명 툴팁". **이원화가 사라져 중복 자체가 구조적으로 불가능**해졌다 → 규약 1의 목적("같은 관계가 두 엣지로 중복되지 않는다")은 충족. `linkId` dedup(규약 3)은 **그대로 필수**이며 이제 전 타입이 이 경로 하나를 타므로 더 중요하다 |
| **D** | `PARENT_JIRA_SHADOWED` | wbsParent 에 가려진 Jira 상위를 별도 종류로 표기(기본 숨김) | **폐기.** 부모가 다르면 `SUBTASK` + `WORKFORCE_PARENT` **둘 다** 정상 엣지로 나간다 | 사용자가 정한 범례 축이 3분류다. "가려짐"은 그 축에 없는 개념 |
| **E** | 부모 병합 | `effectiveParent = wbs ?? jira`(하나만 채택) | **둘 다 낸다.** 단 `wbsParent === jiraParent` 면 같은 관계이므로 `WORKFORCE_PARENT` **하나만** | 보강 4: "같은 관계가 두 엣지로 중복되지만 않으면 된다" |
| **F** | 노드 크기 재료 | (없음) → 보강 2 는 `plannedMd` | **`actualMd`(투입 시간) 필수.** `plannedMd` 는 툴팁용으로 병기 | 보강 4 가 보강 2 를 대체: "노드 크기 = 투입된 시간, 그래야 **비용이 큰 노드**를 확인할 수 있다" |
| **G** | 폴더 | FOLDER 노드 + 3 엣지 + SQL 3쿼리 | **전부 제거** | 보강 4 가 폴더를 엣지 3분류에서 **제외**하고 "표시 여부는 프론트 재량, **과설계 금지**"라고 못박았다. 새 계층에서 이슈의 부모는 스페이스라, 폴더까지 남기면 한 이슈가 두 부모에 매달려 3분류 범례가 흐려진다. **`GanttFolderRepository` 는 그대로 있으므로 되돌리는 비용은 작다**(Promise.all 항목 + 분기 하나) |
| **H** | `nodes[].degree` | ISSUE 노드에만 표기 | **PROJECT·SPACE·ISSUE 전부에 항상 있다** | 프론트 기본 필터가 `degree >= 1` 인데 키가 없으면 `undefined >= 1` = false → **루트·스페이스 노드가 통째로 사라진다** |
| **I** | 루트 `hourRate`, `spaceCount` | 계약에 없음 | **추가** | `hourRate` 없이는 "5.0 MD" 가 무엇으로 나온 값인지 설명할 수 없다. `spaceCount` 는 "스페이스 1개면 중간층을 접는다" 같은 판단에 쓰인다(노드 배열을 세지 않아도 되게) |
| **J** | 엣지 `id` | `PARENT_WORKFORCE:DWEB-100>DWEB-142`(바 키) | `${kind}:${source}>${target}` — **노드 id 기준**으로 통일. `ISSUE_LINK:${linkId}` 만 예외 | id 는 불투명 키라 값 자체에 의미가 없고, 규칙이 갈리면 디버깅에서 헷갈린다 |

**보강 4 가 명시적으로 금지한 것 — 지켰다**: 루트·스페이스 노드의 **산하 투입 합을 서버가 집계하지 않는다.**
프론트가 `nodes` 를 `projectKey` 로 묶어 `actualMd` 를 더하면 된다. 서버가 또 세면 같은 수를 두 곳에서 유지하게 된다.

## 11-4. 링크 분류·중복 방지 (서버가 수행 — 프론트 이중 필터 금지)

| 규칙 | 구현 |
|---|---|
| 연결이슈는 **전 타입 1종** | `issuelinks` 를 타입 구분 없이 `ISSUE_LINK` 로 낸다. Blocks 도 여기 포함(`typeName:'Blocks'`). **프론트에서 Blocks 를 따로 빼거나 다시 거르지 말 것** |
| 타입 판정은 `typeName` | `relation`(outward/inward 문구)은 로케일·커스텀 링크타입에서 깨진다 — 표시용으로만 싣는다 |
| `linkId` dedup | dedup 키 `ISSUE_LINK:${linkId}`, 없으면 `ISSUE_LINK:${typeName}:${src}>${tgt}` 폴백. **없으면 모든 링크가 2개로 그려진다**(Jira 가 양쪽 이슈에 실어 보낸다) |
| 부모 중복 금지 | `wbsParent === jiraParent` → `WORKFORCE_PARENT` 하나만. 다르면 둘 다(서로 다른 관계) |
| 빈 wbsParent 정규화 | 빈 문자열/공백은 **해제**로 본다(`GanttMapper` 와 동일) |
| 자기참조 폐기 | `source === target` 링크는 버린다(범위 밖으로 세지 않는다 — 무효 데이터다) |
| 집합 밖 엣지 | 상위(wbs/jira) · 링크 3경로에서 끝점 멤버십 검사. 실패 시 그리지 않고 `outOfScopeEdgeCount += 1` |

⚠ **선후행(Blocks)에 "앱/Jira" 출처 배지를 달지 말 것**(§13-D2, WORK_VIEWS §6-1). Jira 네이티브 링크 그 자체라
어디서 만들었는지 **데이터에 근거가 없다**. `WORKFORCE_PARENT` 만 앱 저장소라 "워크포스" 표기가 사실이다.

## 11-5. 왕복 비용 — 설계 예측 대조 (**실측**)

| 자원 | 설계 예측(§13-5) | **실제** | 차이 사유 |
|---|---|---|---|
| Jira REST | `min(⌈N/100⌉, 8)` | **`min(⌈N/100⌉, 8)`** ✅ 일치 | 상한 800 / 페이지 100 |
| MySQL | 3 (폴더 3쿼리) | **1** | 보강 4 로 **폴더를 그리지 않게 되어 3쿼리가 사라졌고**, 계약에 있는 `project.projectName` 조회 1회(`findProjectByIdRepository`, 단순 PK 조회)가 들어왔다 → 3 → 1 |
| KVS | 0 | **1** | `hourRate`(settings) — `actualMd`/`plannedMd` 환산 분모. 보강 4 의 노드 크기 요구를 반영한 결과 |
| 서버 캐시 | 모듈 Promise 캐시 60s | ✅ 동일 | 키 `viewerId::projectId`, 엔트리 1개 |

- **3개 조달이 단일 `Promise.all`** 이라 지연은 가장 느린 경로(Jira 페이지 루프)에 흡수된다.
- 프로젝트명 조회는 **best-effort** — 실패해도 `projectName:null` 로 그래프는 그린다.
- Jira 검색 실패 → 부분 폴백 → **PROJECT 노드 1개만 있는 정상 응답**(위젯이 깨지지 않는다).
- 위젯 1개당 invoke 1회. 프론트 `staleTime` 5분 + 서버 60초 캐시로 반복 진입을 흡수.

**대시보드 진입 합계**(§13-5 표 유효): N=200 → +2, N=500 → +5, N=2000 → **+8(상한 발동, `truncated` 배너)**.
**페이로드**는 설계 추정(≈280KB)보다 작다 — 폴더 노드/엣지가 빠졌고 노드당 필드도 적다.

## 11-6. 변경 파일

### 신규 (3 + 테스트 2)

| 경로 | 내용 |
|---|---|
| `src/resolver/projectDashboard/TopologyIssueFetcher.js` | `getTopologyIssues`, `invalidateTopologyIssues`, `MAX_TOPOLOGY_ISSUES = 800` |
| `src/resolver/projectDashboard/RelationGraphService.js` | `getProjectRelationGraphService`(오케스트레이션) + **`buildRelationGraph`(순수 함수)** + `EDGE_KINDS`, `PROJECT_NODE_ID` |
| `src/resolver/projectDashboard/singleEntryPromiseCache.js` | `createSingleEntryPromiseCache({ttlMs})` — 캐시 규칙 단일 출처(아래 참조) |
| `src/resolver/projectDashboard/__test__/RelationGraph.test.js` | 27 케이스 |
| `src/resolver/projectDashboard/__test__/TopologyIssueFetcher.test.js` | 12 케이스 |

### 수정 (3)

| 경로 | 변경 |
|---|---|
| `ProjectDashboardController.js` | `getProjectRelationGraph` 등록 1건(**principal 전달**, 입력 키 `projectId`) |
| `src/permission/PermissionMap.js` | `getProjectRelationGraph: R('PROJECT','detail')` + 섹션 주석 `9 → 10` |
| `DashboardIssueFetcher.js` | **캐시 로직만** `singleEntryPromiseCache` 로 교체(동작 무변경) |

> **캐시 헬퍼를 뽑은 이유**: `ProjectParticipantFetcher` → `DashboardIssueFetcher`(M1) 로 복제된 패턴을
> 토폴로지가 **3번째로** 복제할 참이었다. 이 규칙은 보안 성질을 갖는다(**viewerId 없으면 캐시 미사용**
> = 가시 범위 혼입 방지). N중 복제되면 한쪽만 고쳤을 때 어느 페처가 남의 데이터를 흘리는지 알 수 없다.
> `DashboardIssueFetcher` 의 기존 캐시 테스트 11케이스가 그대로 통과해 **동작 무변경이 증명된다**.
> `ProjectParticipantFetcher`(`src/api/jira/`)는 쓰기 경로가 이미 무효화를 호출하고 있어 **건드리지 않았다**.

### 건드리지 않은 것 (확인 완료)

- **공통 페처 무변경** — `getProjectIssuesByFilter` / `fetchAllProjectIssues` / `getProjectGanttIssues` /
  `getBulkIssuesByProject` / `ProjectParticipantFetcher` (§11 함정 5).
- **간트 무변경** — 보강 4 로 폴더를 빼면서 `GanttFolderRepository` 의존까지 사라져 **간트 도메인 참조가 0** 이 됐다.
  `getProjectGanttData` 응답 계약·낙관 패치 무영향(§13-D1 (B) 기각 준수).
- `getDashboardIssueInsight` 응답 계약 무변경(§13-D1 (C) 기각 준수 — insight 에 issuelinks 를 얹지 않았다).
- `src/index.js`, DDL, `manifest.yml`, KVS, 프론트, locales 전부 무변경.

## 11-7. 테스트 결과

```
$ npx jest src/resolver/projectDashboard
Test Suites: 7 passed, 7 total
Tests:       99 passed, 99 total

$ npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total

$ npm test            (루트 전량)
Test Suites: 78 passed, 78 total
Tests:       1217 passed, 1217 total
Time:        32.94 s
```

**실패 0건.** `permissionMap.contract.test.js` 통과 = 신규 resolver 가 `PermissionMap` 에 정상 등록됨.

신규 테스트가 고정한 것:
① 계층 3단(스페이스 노드 생성·복수 스페이스·등장 순서·이슈에 projectKey 동봉·스페이스 불명 시 루트 직결)
② 관계 3분류(SUBTASK / WORKFORCE_PARENT / ISSUE_LINK 전 타입) · `EDGE_KINDS` 에 `BLOCKS` 없음
③ 중복 금지(wbs==jira → 1개, 부모 다르면 2개, `linkId` 양방향 dedup, id 없을 때 폴백, 자기참조 폐기, 공백 wbs 해제)
④ `actualMd` 투입 환산·투입 없으면 0 · `plannedMd` 미산정 null · **산하 합을 서버가 집계하지 않음**
⑤ 집합 밖 상위 2 + 링크 2 = `outOfScopeEdgeCount` 4
⑥ `degree` 균일 제공·엣지 수 일치 · 아바타 미포함 · `edgeKindCounts` 5키
⑦ 서비스: `PROJECT_ID_REQUIRED` · 페처 폴백 시 PROJECT 노드 1개 · `truncated` 전달 · SQL 실패 폴백 ·
   viewerId 전달/null · **SQL 1회 + KVS 1회(폴더 쿼리 없음)**
⑧ 페처: 페이징 · 800 상한 + 중단 · fields 에 `issuelinks/parent/project/timetracking` 있고 간트 전용 필드 없음 ·
   캐시 키/동시진입/미사용/실패 미캐시 · **insight 페처와 캐시 엔트리 비공유**

## 11-8. 다음 단계(frontend)가 주의할 것

1. **입력 키는 `projectId`** — insight 는 `project_id` 다. 훅에서 흡수하고 호출부에 노출하지 말 것.
2. **범례 축은 3개**(하위이슈 `SUBTASK` / 연결이슈 `ISSUE_LINK` / 워크포스 연결이슈 `WORKFORCE_PARENT`)
   + 소속 2종(`ROOT_SPACE`·`SPACE_ISSUE`). 소속 엣지는 얇은 중립선으로 두고 3분류에 색을 쓰는 편이 읽힌다.
3. **Blocks 를 따로 빼지 말 것.** `ISSUE_LINK` 안의 `typeName === 'Blocks'` 다. 타입별 색이 필요하면
   `linkTypeNames` 로 범례를 만들고 `typeName` 으로 매핑한다(`relation` 은 표시 문구라 로케일에서 깨진다).
4. **노드 크기 = `actualMd`**(투입). `plannedMd` 가 아니다 — 보강 4 에서 바뀌었다.
   `actualMd === 0` 은 "투입 없음" → **디폴트 크기 고정**(0 축소·숨김 금지). sqrt + 최소/최대 클램프.
5. **루트·스페이스 노드 크기**는 프론트가 `nodes` 를 `projectKey` 로 묶어 `actualMd` 를 합산해 만든다
   (서버가 주지 않는다 — 보강 4 명시).
6. `degree` 는 **모든 노드**에 있다. `degree >= 1` 기본 필터를 걸어도 루트·스페이스는 살아 있다.
7. **알림 4종 전부 표기**(§13-D10): `truncated` · 프론트 `hiddenCount`(300 상한) · `outOfScopeEdgeCount` · 고립 제외 건수.
8. `edgeKindCounts` 는 5키가 항상 있으므로 `?? 0` 불필요. 0 이면 "이 타입 없음"이 **사실**이다.
9. 위젯 게이트는 `WIDGET_SPEC.requires:'PROJECT'` — 서버 매핑(`R('PROJECT','detail')`)과 **같은 값**(판정 두 벌 금지).
10. `renderer:'forceGraph'` 이므로 `chartType:'graph'` 를 **`CHART_OPTION_MAP` 에 등록하지 말 것**. 대신 M1 의
    `dashboardWidgets.test.js` 정합 검사를 **`renderer === 'echart'` 로 스코프 축소**해야 거짓 실패가 안 난다(§13 함정 16).
11. `ThemedECharts` 경유 필수 — `echarts-for-react` 직접 import 시 다크 테마가 조용히 no-op 된다(§13 함정 23).
12. 이슈 노드 클릭은 `IssueComponent` 와 같은 `router.open`. 스페이스·루트 노드는 무반응(툴팁만).

## 11-9. 리더 확인이 필요한 판단 1건

**폴더를 응답에서 뺐다**(§11-3 G). 보강 4 의 "폴더는 엣지 3분류에서 제외 · 표시 여부는 프론트 재량 · **과설계 금지**"를
"이번 범위에서 빼라"로 해석했다. 프론트가 폴더 그룹핑을 그리기로 하면 되돌려야 하는데, 비용은
`Promise.all` 항목 3개 + 노드/엣지 분기 하나(약 40줄)이고 `GanttFolderRepository` 는 그대로 있다.
**이견이 있으면 알려달라 — 되돌리는 것이 싸다.**

## 11-10. 남은 M5 백엔드 이슈

**없음.** §13-8 M5 백엔드 체크리스트를 보강 4 반영본으로 전부 완료했다.
M6(포트폴리오 토폴로지)은 설계상 **백엔드 변경 0건**이라 백엔드 작업이 없다.

---

# 12. M4 — 커스텀 필터 저장 (`filter_json` · `updateChartFilter`)

> 기준: `01_architect_design.md` §2-4(FilterDef 계약) · §3-6(저장 경로) · §5-1(DDL) · §D6(빌더 결정)
> 범위: **M4 백엔드만.** `src/` 외 파일 무변경(프론트·locales 미접촉 — M3 프론트 병행 작업과 충돌 없음).

## 12-1. 마이그레이션

| 항목 | 값 |
|---|---|
| 이름 | **`v018_alter_project_dashboard_add_filter_json`** |
| 순번 근거 | `migrate.js` 최신이 `v017_alter_project_subscription_add_default_estimate` → 다음은 v018. **번호 충돌 없음**(구독이 v015→v016 재번호했던 전례 확인, 이후 순번 연속) |
| DDL | `ALTER TABLE project_dashboard ADD COLUMN IF NOT EXISTS filter_json JSON NULL` |
| 멱등성 | `ADD COLUMN IF NOT EXISTS` + NULL 허용 → **재실행 안전**(Forge SQL 은 트랜잭션이 없으므로 필수) |
| 등록 | `ddl/project.sql.js`(정의) → `ddl/index.js`(re-export) → `migrate.js` 체인 **맨 끝** enqueue |

- `CREATE TABLE` 본문은 **건드리지 않았다**(v012/v013/v015/v017 관례). 신규 설치는 CREATE → ALTER 를 둘 다 실행해 결과가 같다.
- ⚠ **이름은 배포 후 절대 변경 금지** — `migrationRunner` 가 이름으로 실행 여부를 판정한다.

## 12-2. resolver 계약 (**구현된 것 그대로**)

### `updateChartFilter` (신규) — ⚠ **O-M4-1 로 입력이 바뀌었다**

| 항목 | 값 |
|---|---|
| 입력 | **`{ project_id: string, dashboard_id: string, filter: FilterDef \| null }`** |
| PermissionMap | `W('DASHBOARD','inherited')` (`updateChartLayout` 과 같은 게이트) |
| 성공 응답 | **`{ success: true }`** — 본문 없음(`updateChartTitle` 관례) |
| 실패 | `{ success:false, error:{ name, code, message, cause } }` |

> 🔴 **프론트 호출부 변경 필요**: 설계서 §2-1 의 `{ dashboard_id, filter }` 에서 **`project_id` 가 추가**됐다.
> 검증 관찰 O-M4-1(변조 범위) 대응이며, 넘기지 않으면 `PROJECT_ID_REQUIRED` 로 **거부**된다.
> `updateChartLayout` 이 이미 `project_id` 를 넘기고 있으므로 같은 자리에서 같은 값을 쓰면 된다.

- `filter: null` 또는 **키 자체를 생략**하면 **필터 해제**(컬럼에 NULL 저장). 이때는 검증을 타지 않는다.
- `project_id` 누락/빈 문자열 → `error.cause === 'PROJECT_ID_REQUIRED'` (**fail-close**)
- `dashboard_id` 누락 → `error.cause === 'DASHBOARD_ID_REQUIRED'`
- 그 프로젝트의 위젯이 아니거나 없음 → `error.cause === 'DASHBOARD_CHART_NOT_FOUND'`
- FilterDef 불량 → `error.cause === 'DASHBOARD_FILTER_INVALID'`
- ⚠ 에러 코드는 `error.code` 가 아니라 **`error.cause`** 에 실린다(이 도메인의 3인자 `LogicalError` 관례 F20).
  `error.code` 는 항상 `500`, `error.message` 는 항상 `"Internal Server Error"` 다.

**검증 순서**(먼저 걸리는 것이 이긴다): `PROJECT_ID_REQUIRED` → `DASHBOARD_ID_REQUIRED` →
`DASHBOARD_FILTER_INVALID` → `DASHBOARD_CHART_NOT_FOUND` → UPDATE.
필터 검증이 소유 대조보다 먼저라 **불량 입력은 DB 를 한 번도 건드리지 않는다.**

### `addChart` (기존 확장)

| 항목 | 값 |
|---|---|
| 입력 | `{ project_id, charts: [{ i, dataType, chartType, chartName, x, y, w, h, **filter?** }], type }` |
| 응답 | 기존과 동일(저장된 chartData 배열). `filter` 를 넘겼으면 **검증·재조립된 값**이 그 안에 들어 있다 |
| PermissionMap | 기존 `W('DASHBOARD','inherited')` 유지 |

### `getChartInfo` (기존, 응답에 1필드 추가)

```jsonc
{ "success": true,
  "rows": [
    { "dashboard_id": "w-1", "project_id": "…", "dashboard_title": "…",
      "chart_type": "issueList", "data_type": "customFilter",
      "pos_x": 0, "pos_y": 0, "width": 6, "height": 7,
      "filter_json": { "v": 1, "assignee": ["__ME__"], "due": "OVERDUE" }   // object | null
    }
  ] }
```

⚠ **`filter_json` 은 항상 존재하고 `object | null` 이다.** 두 가지를 서버가 고정했다(§12-4 A·B 참조):
- Forge SQL(TiDB) JSON 컬럼이 드라이버에 따라 **문자열/객체로 갈릴 수 있어** 객체로 통일한다.
- v018 마이그레이션 전에는 컬럼 자체가 없어 키가 빠지므로, **항상 채워** 마이그레이션 상태와 무관하게 shape 이 같다.
- 깨진 JSON(수동 편집·구버전)은 예외를 던지지 않고 `null`(= 필터 없음) + 경고 로그로 떨어뜨린다.

## 12-3. FilterDef v1 검증 규칙 (§2-4)

**허용 키 7개**: `v` · `assignee` · `statusCategory` · `issueType` · `priority` · `due` · `estimate`

| 규칙 | 동작 | 위반 시 |
|---|---|---|
| 객체여야 함 | 배열·문자열·null 거부 | `DASHBOARD_FILTER_INVALID` |
| `v === 1`(숫자) | `2`, `'1'`, `undefined` 전부 거부 | 동일 |
| 화이트리스트 밖 키 | **거부**(조용히 잘라 저장하지 않는다) | 동일 |
| 배열 축 4종 | 배열이어야 하고 **길이 ≤ 20**, 원소는 **비어 있지 않은 문자열 ≤ 100자** | 동일 |
| `due` | `ANY` \| `OVERDUE` \| `DUE_SOON` \| `NO_DUE` | 동일 |
| `estimate` | `ANY` \| `HAS` \| `NONE` | 동일 |
| 미지정 축 | 결과에서 **빠진다**(없는 축을 `ANY` 로 채우지 않는다) | — |
| 빈 배열 | **그대로 보존**(그 축을 필터하지 않는다는 뜻 — 왕복 정확성) | — |
| `__ME__` | 서버는 해석하지 않고 **문자열로 저장만** 한다(해석은 클라이언트) | — |

**두 장치를 함께 둔다** — 목적이 다르다:
1. 반환값은 입력을 스프레드하지 않고 **화이트리스트 키로 새로 조립**한다 → 설계에 없는 키가 DB 에 **구조적으로** 저장될 수 없다.
2. 그와 별개로 알 수 없는 키가 오면 **거부**한다 → "사용자가 만든 것과 다른 필터가 저장된 줄 모르는 상황"을 막는다(§3-6 "부분 통과 없음").

⚠ **`addChart` 와 `updateChartFilter` 가 같은 `validateFilterDef` 를 탄다.** 한쪽만 검증하면 다른 경로로
우회된다(CLAUDE.md 「읽기↔쓰기 검증 대칭」 — `assertTeamInProjectScope` 전례). 테스트가 **같은 불량 입력 6종을
두 경로에 각각 넣어** 같은 코드로 거부되는지 고정한다.

## 12-4. ⚠ 설계서와 다른 점

| # | 항목 | 설계서 | 실제 구현 | 사유 |
|---|---|---|---|---|
| **A** | INSERT | §3-6: **9컬럼 `INSERT` 를 10컬럼으로 재정의** | **9컬럼 `INSERT` 유지 + `INSERT_WITH_FILTER`(10컬럼) 별도 추가.** 필터가 없으면 `filter_json` 컬럼을 **아예 건드리지 않는다** | §11 함정 8 / §5-1 배포 순서 리스크의 **직접 대응**. `TableReadiness` 는 테이블 존재만 프로브하고 컬럼 프로브가 없어, v018 이 돌기 전에 10컬럼 INSERT 가 실행되면 `addChart` 가 **통째로** 실패한다 — 필터를 쓰지 않는 기존 위젯 7종까지. 기본 경로를 9컬럼으로 두면 마이그레이션 전에도 기존 위젯 생성이 정상 동작하고, 실패 가능성이 커스텀 필터 위젯 하나로 격리된다 |
| **B** | `getChartInfo` | §2-1 F19: "컬럼 추가만으로 자동 반영, 조회 무변경" | `SELECT *` 라 **자동 반영되는 것은 맞다**(확인함 — `QueryBuilder._select` 기본값 `['*']`). 다만 `filter_json` 을 **객체\|null 로 정규화**하고 **항상 키를 채우도록** 1줄 추가 | TiDB JSON 컬럼의 문자열/객체 양형 + 마이그레이션 전 키 부재. 프론트가 세 형태(문자열/객체/undefined)를 분기하게 두면 언젠가 한쪽에서 깨진다 |
| **C** | `addChartDataRepository` 에러 | (언급 없음) | **`catch` 가 예외를 삼키던 것을 전파로 고쳤다** | 기존 코드는 실패해도 undefined 를 반환해 `responseWrapper` 가 `{success:true}` 를 내보냈다 — 프론트가 "저장되었습니다"를 띄우고 사용자는 새로고침 전까지 유실을 알 수 없다. `bulkUpdateLayoutsRepository` 가 U8 에서 이미 고친 **같은 결함**이고, 하필 이번에 추가되는 10컬럼 INSERT 실패(마이그레이션 전)를 **조용히 성공으로 둔갑**시키는 자리다. ⚠ **이건 M4 요구 밖의 추가 수정이다** — 되돌리길 원하면 알려달라 |
| **D** | 에러 detail | §3-6 (언급 없음) | 거부 사유 문자열은 **서버 로그(`console.warn`)로만** 남기고 응답에는 코드만 실린다 | `LogicalError` 가 3인자라 detail 을 실을 자리가 없다. FilterBuilder 가 입력을 제약하므로 여기 걸리는 것은 사용자 실수가 아니라 프로그래밍 오류다 — 그때 원인을 알 수 있어야 한다 |
| **E** | `updateChartFilter` 입력 | §2-1: `{ dashboard_id, filter }` | **`{ project_id, dashboard_id, filter }`** + 소유 대조 + SQL 스코프 | **검증 관찰 O-M4-1**. 상세 §12-4-1 |

### 12-4-1. O-M4-1 — 변조 범위 방어 3중

`dashboard_id` 만 받으면 `permissionGuard.enforceProjectScope` 가 payload 에서 대상 프로젝트를 찾지 못해
**스코프 검증이 조용히 통과**한다. `updateChartLayout` 과 같은 방식으로 `project_id` 를 받아 닫았다.

| 층 | 장치 | 무엇을 막나 | 한계 |
|---|---|---|---|
| ① 가드 | payload 에 `project_id` 가 있어 `project:'inherited'` 검증이 **실제로 동작** | MEMBER_ONLY principal 이 미소속 프로젝트를 지정하는 것 | `scopedProjectIds(principal) === null`(ALL 스코프)이면 원래 적용되지 않는다 |
| ② fail-close | `project_id` 없으면 **거부**(`PROJECT_ID_REQUIRED`) | ①을 인자 생략으로 무력화하는 것 | — |
| ③ 소유 대조 + SQL | `FIND_BY_DASHBOARD_ID` 로 소속 확인 후 `UPDATE ... WHERE dashboard_id=? AND project_id=UUID_TO_BIN(?)` | **ALL 스코프 principal** 이 남의 프로젝트 위젯 id 를 넣는 것 (①이 못 막는 구간의 유일한 방어선) | — |

- ②를 "인자가 없으면 검사하지 않는다"로 되돌리면 **정확히 원래 결함의 형태**가 된다. 테스트로 고정했다.
- **소유 대조에 SELECT 1회를 쓴 이유**: `WHERE` 만으로도 남의 위젯은 안 바뀌지만 **조용한 no-op** 이 된다.
  MySQL 의 `affectedRows` 는 "값이 실제로 바뀐 행"이라 같은 필터를 다시 저장하면 0 이 나와
  "못 찾음"과 구분되지 않는다 → `rowsAffected` 로는 판정할 수 없다. 필터 저장은 드문 쓰기라 비용이 무의미하다.
- 비용: `updateChartFilter` 1회당 **MySQL 2**(SELECT 1 + UPDATE 1).

**백로그(이번 범위 밖)**: `updateChartTitle` 이 같은 한계를 그대로 갖고 있다(`{dashboard_id, title}` 만 받아
스코프 검증 skip + `UPDATE_TITLE` 의 `WHERE` 에 `project_id` 없음). 같은 3중 방어를 적용하면 되지만
프론트 호출부 변경이 함께 필요해 별건으로 남긴다. `updateChartLayout`·`removeChart` 는 이미 `project_id` 를 받는다.

## 12-5. 변경 파일

### 신규 (1 + 테스트 2)

| 경로 | 내용 |
|---|---|
| `src/resolver/projectDashboard/DashboardFilter.js` | `validateFilterDef` · `serializeFilterDef` · `parseStoredFilter` + 상수(`FILTER_ALLOWED_KEYS`, `FILTER_ARRAY_KEYS`, `FILTER_ENUMS`, `MAX_FILTER_ARRAY_LENGTH`, `MAX_FILTER_STRING_LENGTH`, `FILTER_ME_TOKEN`). **Forge 의존 0 순수 모듈** |
| `src/resolver/projectDashboard/__test__/DashboardFilter.test.js` | 검증 경계 27 케이스 |
| `src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js` | 저장 경로·대칭·정규화 21 케이스 |

### 수정 (8)

| 경로 | 변경 |
|---|---|
| `src/rdb/schema/ddl/project.sql.js` | `ALTER_PROJECT_DASHBOARD_ADD_FILTER_JSON` 추가(NULL 허용·JSON 채택 근거 주석) |
| `src/rdb/schema/ddl/index.js` | re-export 1건 |
| `src/rdb/schema/migrate.js` | import + `v018_...` enqueue(체인 맨 끝) |
| `src/rdb/query/ProjectDashboard.js` | `INSERT_WITH_FILTER`(10컬럼) · `UPDATE_FILTER`(project_id 스코프) · `FIND_BY_DASHBOARD_ID` 추가. **기존 `INSERT` 무변경** |
| `ProjectDashboardRepository.js` | `addChartDataRepository` 조건 분기(9/10컬럼) + 예외 전파, `updateChartFilterRepository`·`existsChartInProjectRepository` 신규 |
| `ProjectDashboardService.js` | `validateChart` 에 filter 검증, `insertChart` 가 `filterJson` 직렬화, `updateChartFilterService` 신규(O-M4-1 3중 방어), `getChartInfoService` 정규화 |
| `ProjectDashboardController.js` | `updateChartFilter` 등록 1건 |
| `src/permission/PermissionMap.js` | `updateChartFilter: W('DASHBOARD','inherited')` + 섹션 주석 `10 → 11` |

**건드리지 않은 것**: `src/index.js`(신규 컨트롤러 없음), KVS·`manifest.yml`, 프론트, locales, 다른 도메인 전부.

## 12-6. 배포 순서 주의점 (구현자·배포자가 반드시 인지)

1. **마이그레이션 실행 경로**: `scheduledTrigger init-db`(**interval: hour**) + `on-install`/`on-upgrade` 트리거.
   `forge deploy` 후 `avi:forge:upgraded:app` 이 즉시 발화하므로 실질 노출 창은 짧지만 **0은 아니다**.
2. **노출 창에서 무슨 일이 일어나는가** (§12-4 A 의 완화 덕분에):
   - 기존 위젯 7종 생성 → **정상**(9컬럼 INSERT, 새 컬럼 미접촉)
   - 위젯 조회·배치·제목 변경 → **정상**(`SELECT *`, 컬럼 부재 시 `filter_json: null`)
   - 커스텀 필터 위젯 생성 / `updateChartFilter` → **실패**하고 `{success:false}` 로 **드러난다**(§12-4 C 덕분에 조용히 성공하지 않는다)
3. **배포 후 확인 절차**: 마이그레이션 완료 후 커스텀 필터 위젯 1건을 실제로 만들어 성공을 확인한 뒤 사용자에게 공지(§5-1).
4. 읽기 회귀는 없다 — `getChartInfo` 가 `SELECT *` 라 컬럼 부재에서도 실패하지 않는다.

## 12-7. 테스트 결과

```
$ npx jest src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js
Tests:       24 passed, 24 total

$ npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total

$ npm test            (루트 전량, O-M4-1 보강 반영본)
Test Suites: 80 passed, 80 total
Tests:       1275 passed, 1275 total
Time:        23.97 s
```

**실패 0건.** `permissionMap.contract.test.js` 통과 = `updateChartFilter` 가 정상 등록됨.

신규 테스트가 고정한 것:
① 버전(`v!==1` 전 형태) · 비객체 입력 거부
② 화이트리스트 밖 키 거부 + 허용 키 목록이 계약과 일치 + **반환값이 재조립임**(입력 배열 참조도 끊긴다)
③ 배열 20/문자열 100 경계(20·100 통과, 21·101 거부) · 비문자열/빈 문자열 원소 거부 · 배열 아님 거부
④ `due`/`estimate` enum 전량 통과 + 도메인 밖 거부 + 미지정 축 결과 제외
⑤ 빈 배열·`__ME__` 보존 · §2-4 예시 전체 왕복 일치
⑥ `addChart`: 필터 없으면 **9컬럼 INSERT**(파라미터 9개) · 있으면 10컬럼 + 10번째가 직렬화 JSON ·
   불량 필터는 **DB 를 건드리기 전에** 거부 · INSERT 실패 전파
⑦ `updateChartFilter`: 정상 저장(UPDATE 파라미터에 `project_id` 포함) · `null`/미지정 = 해제(NULL) ·
   `dashboard_id` 누락 · **불량 입력 6종을 두 경로(add/update)에 각각 넣어 같은 코드로 거부**되는지
⑧ **O-M4-1**: `project_id` 누락·빈 문자열 fail-close · 타 프로젝트 위젯 → `DASHBOARD_CHART_NOT_FOUND`
   (소유 대조에서 끊겨 **UPDATE 미실행**) · `UPDATE_FILTER`/`FIND_BY_DASHBOARD_ID` SQL 이 `project_id` 로 좁혀져 있음
⑨ `getChartInfo`: 문자열→객체 통일 · 마이그레이션 전에도 `filter_json` 키 존재(null) · 깨진 JSON 은 null

## 12-8. 다음 단계(frontend)가 주의할 것

0. 🔴 **`updateChartFilter` 호출 시 `project_id` 를 반드시 넘길 것**(O-M4-1로 계약 변경).
   `invoke('updateChartFilter', { project_id, dashboard_id, filter })`. 빠뜨리면 `PROJECT_ID_REQUIRED` 로 거부된다.
   `updateChartLayout` 이 이미 같은 값을 넘기고 있으므로 그 자리에서 그대로 쓰면 된다.
1. **`updateChartFilter` 응답에 본문이 없다** — `{success:true}` 뿐이다. 저장 후 화면은 `projectKeys.dashboardInfo` invalidate 로 갱신한다.
2. **에러 코드는 `error.cause`** 에 있다(`error.code` 는 항상 500). 분기 키는 `PROJECT_ID_REQUIRED` ·
   `DASHBOARD_ID_REQUIRED` · `DASHBOARD_CHART_NOT_FOUND` · `DASHBOARD_FILTER_INVALID`.
3. **`filter_json` 은 항상 `object | null`** 이다. `JSON.parse` 하지 말 것 — 서버가 이미 파싱했다.
4. **필터 해제는 `filter: null`** 로 보낸다(빈 객체 `{}` 는 `v` 가 없어 `DASHBOARD_FILTER_INVALID` 다).
5. **`v: 1` 을 반드시 포함**해 보낼 것. FilterBuilder 가 만드는 객체의 기본 골격에 넣어두면 실수가 없다.
6. 축 상한을 UI 에서도 막을 것(각 축 20개, 문자열 100자) — 서버는 **부분 통과 없이 전량 거부**한다.
7. `__ME__` 는 **클라이언트가 해석**한다(서버는 문자열로 보관만). `applyFilterDef(issues, filter, myAccountId)` 에서 치환.
8. 빈 배열 축은 "필터 안 함"이다. 서버가 빈 배열을 지우지 않고 그대로 돌려주므로 `(filter.assignee?.length ?? 0) === 0` 로 판정하면 두 형태(부재·빈배열)를 함께 처리할 수 있다.
9. **`addChart` 실패가 이제 드러난다**(§12-4 C) — `res.success === false` 분기를 반드시 처리할 것. 과거엔 실패해도 true 가 왔다.

## 12-9. 리더 확인이 필요한 판단 2건

**`addChartDataRepository` 의 예외 삼킴을 제거했다**(§12-4 C). M4 요구 범위 밖의 수정이지만,
이번에 추가되는 10컬럼 INSERT 가 마이그레이션 전에 실패할 때 **조용히 `{success:true}` 가 나가는 자리**라
함정 8 대응의 일부로 판단했다. 되돌리려면 `try/catch` 의 `throw e;` 한 줄을 지우면 된다.
부작용: 그동안 숨어 있던 다른 INSERT 실패도 이제 사용자에게 드러난다(의도된 것이지만 문의가 늘 수 있다).

**(2) `updateChartFilter` 입력 계약을 넓혔다**(§12-4 E / §12-4-1, O-M4-1 지시 반영).
설계서 §2-1 의 `{dashboard_id, filter}` → `{project_id, dashboard_id, filter}`.
**프론트 호출부 수정이 필요하다**(병행 에이전트 담당). 설계서 §2-1 표도 함께 갱신해 두는 편이 좋다.

## 12-10. 남은 M4 백엔드 이슈 · 백로그

**M4 범위: 없음.** §13-8 M4 백엔드 체크리스트 7항목(DDL·index·migrate·query·repository·validateFilterDef·
service/controller/PermissionMap) + O-M4-1 보강까지 전부 완료.

**백로그 1건 — `updateChartTitle` 의 동일 한계**(이번 범위 밖, 리더 지시로 기록만):
`{dashboard_id, title}` 만 받아 ① 가드의 `project:'inherited'` 스코프 검증이 skip 되고
② `UPDATE_TITLE` 의 `WHERE` 에 `project_id` 가 없다. `updateChartFilter` 와 **같은 3중 방어**를 적용하면
되지만 프론트 호출부 변경이 함께 필요해 별건으로 남긴다.
(`updateChartLayout`·`removeChart`·`addChart` 는 이미 `project_id` 를 받으므로 대상은 `updateChartTitle` 하나다.)

---

# 13. M7 — 포트폴리오 4계층 토폴로지: 스페이스 계층 데이터 (백엔드)

> 요구: 통합 대시보드 **스콥 탭**에 **워크포스 — 프로젝트 — 스페이스 — 이슈** 4계층 토폴로지.
> 기존 자원 탭 토폴로지(M6, 3계층)는 제거 예정(프론트 몫).
> 범위: **스페이스 계층 데이터의 백엔드 산출·저장·조달.** `src/` 만 수정, 프론트 무접촉.

## 13-1. 무엇을 추가했나

포트폴리오 스냅샷 배치(`runPortfolioSnapshot`)가 프로젝트마다 이미 전 이슈를 페치하고 있고,
그 응답 fields 에 **`project`(Jira 스페이스)가 이미 들어 있다**(`IssueApi.getProjectIssuesByFilter` 의 fields 목록).
즉 소속 스페이스는 손에 있고 **세기만 하면 됐다**.

| 자원 | 증가분 |
|---|---|
| **Jira REST** | **0회** — 기존 페치 루프에서 계수만. 공통 페처(`fetchAllProjectIssues`/`getProjectIssuesByFilter`) **무수정** |
| MySQL(쓰기) | 0 — 기존 `upsertSnapshot` 1문에 컬럼 1개 추가 |
| MySQL(읽기) | 0 — 기존 `SELECT_ALL` 에 컬럼 1개 추가 |
| KVS | 0 |
| `getPortfolioDashboard` invoke | 0 — **응답에 필드가 하나 늘 뿐**, 위젯은 기존대로 props 로 받는다 |

`runSubscriptionReconcile` 은 이 데이터와 무관해 **무접촉**이다(구독 정합성 스윕이라 스냅샷 집계 경로가 아니다).

## 13-2. 실제 응답 shape (**구현된 것 그대로**)

`getPortfolioDashboard` → `projects[]` 에 **`spaces` 1필드 추가**. 나머지 필드는 전부 무변경.

```jsonc
{
  "success": true,
  "projects": [
    {
      "projectId": "9f3c…", "projectName": "차세대 포털",
      "issueSummary": { "done": 180, "inProgress": 95, "todo": 137 },   // 기존 (무변경)

      // ── ▼ M7 신규. **항상 존재하고 항상 배열이다** ──
      "spaces": [
        { "spaceKey": "API",  "spaceName": "플랫폼 API", "done": 40,  "inProgress": 25, "todo": 30 },
        { "spaceKey": "DWEB", "spaceName": "웹 개발",     "done": 140, "inProgress": 70, "todo": 107 }
      ]
    }
  ]
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `spaceKey` | `string \| null` | Jira 프로젝트 key. **`null` = 소속 스페이스 불명**(이론상 — §13-4 참조) |
| `spaceName` | `string \| null` | Jira 프로젝트명(첫 등장 기준) |
| `done` / `inProgress` / `todo` | `number` | 이슈 **건수**. 공수·금액이 아니다 |

**정렬**: `spaceKey` 오름차순, `null` 은 맨 뒤. 결정적이라 스냅샷 diff 가 튀지 않는다.

**빈 배열이 되는 경우** (전부 정상, 프론트는 폴백하면 된다):
- v019 마이그레이션 전(컬럼 부재)
- **구 스냅샷** — 컬럼은 있지만 다음 배치 집계가 아직 안 돎
- 이슈가 0건인 프로젝트

## 13-3. 🔴 정합 불변식 — `Σ spaces = issueSummary`

**`spaces` 3개 필드의 합은 같은 프로젝트의 `issueSummary` 와 정확히 일치한다.**

이걸 보장하려고 상태 판정을 **단일 출처로 뽑았다**:

- `ProgressCalculator` 에 **`classifyStatusKey(statusKey)`** 를 신규 export 하고
  기존 `computeStatusDistribution`(= `issueSummary` 의 출처)이 그것을 쓰도록 바꿨다(동작 동일, 순수 리팩터).
- 스페이스 롤업도 **같은 함수**를 호출한다.

⚠ 여기서 `statusKey === 'done'` 같은 판정을 다시 쓰면 **`statusKey == null` 을 todo 로 접는 규칙**이 빠져
두 집계가 조용히 갈린다. 테스트가 그 케이스를 포함해 불변식을 고정한다.

## 13-4. 소속 스페이스 불명 이슈 (프론트가 주의할 것)

`fields.project` 는 항상 오므로 실무에서 나올 일이 없지만, 방어적으로 **버리지 않고 `spaceKey: null` 버킷**에 넣는다.
**버리면 §13-3 불변식이 깨지기 때문**이다.

🔴 **프론트는 이 항목을 버리지 말 것.** 노드로 그리기 어렵다면 "미지정"으로 묶어서라도 건수에 포함해야
화면 합계가 `issueSummary` 와 맞는다. 그냥 필터로 걸러내면 "이슈 수가 안 맞는다"는 문의가 생긴다.

## 13-5. 권한 — `costMasked` 게이팅 불요 (확인함)

`spaces` 는 **이슈 건수만** 담는다. 급여·단가·금액 필드를 **하나도 포함하지 않는다**
(`salary`/`totalSalary`/`Md`/`effort` 문자열이 직렬화 결과에 없음을 테스트로 고정).

따라서:
- `costMasked` 분기 **불필요** — `stripMemberCost` 대상도 아니다.
- 신규 권한 게이트 **0**. `getPortfolioDashboard` 의 기존 `R('REPORT','list')` 그대로.
- 회귀 가드 `PortfolioCostGate.test.js` 통과 확인(전량 실행에 포함).

## 13-6. 마이그레이션

| 항목 | 값 |
|---|---|
| 이름 | **`v019_alter_portfolio_snapshot_add_spaces_json`** |
| 순번 근거 | 직전이 M4 의 `v018_alter_project_dashboard_add_filter_json` → v019. 번호 중복 없음(테스트로 고정) |
| DDL | `ALTER TABLE portfolio_project_snapshot ADD COLUMN IF NOT EXISTS spaces_json JSON NULL` |
| 멱등성 | `IF NOT EXISTS` + NULL 허용 → 재실행 안전(Forge SQL 트랜잭션 없음) |
| 등록 | `ddl/portfolioSnapshot.sql.js` → `ddl/index.js` → `migrate.js` 체인 **맨 끝** |

`CREATE TABLE` 본문 **무변경**(v012/v015/v017/v018 관례). JSON 채택 근거는 `members_json` 과 동일 —
스페이스는 프로젝트당 소수이고 조회가 항상 "이 프로젝트의 스페이스 전체"라 부분 질의가 필요 없다.

## 13-7. 배포 순서 — **채택 방식과 근거**

M4(`project_dashboard`)와 **다른 방식**을 골랐다. 이유가 있다.

| | M4 (`filter_json`) | **M7 (`spaces_json`)** |
|---|---|---|
| 신규 컬럼을 쓰는 경우 | 커스텀 필터 위젯일 때만(**드묾**) | **모든 스냅샷 쓰기**(항상) |
| 읽기 SQL | `SELECT *`(QueryBuilder) → 컬럼 부재에도 무사 | **명시 컬럼 목록** → 컬럼 부재면 **조회 자체가 실패** |
| 채택 방식 | 기존 INSERT 보존 + 필터 있을 때만 신규 문 | **신규 문 우선 시도 + 컬럼 부재일 때만 구 문 폴백** |

M4 식 "기존 문 보존 + 조건 분기"는 M7 에 쓸 수 없다 — 분기 조건("spaces 가 있는가")이 **항상 참**이라
분기가 성립하지 않는다. 그래서 **try → 컬럼 부재 감지 → 구 문 재시도** 로 갔다.

**마이그레이션 전 창에서 무슨 일이 일어나나** (`TableReadiness` 는 테이블 존재만 프로브하고 컬럼 프로브가 없다):

| 경로 | 폴백 없이 | **폴백 있음(구현본)** |
|---|---|---|
| 스냅샷 배치 쓰기 | **배치 전체 사망** — spaces 와 무관한 진척·비용·가동률 집계까지 | 구 22컬럼 문으로 성공, spaces 만 빠짐(경고 로그) |
| 포트폴리오 대시보드 읽기 | **대시보드 전체 사망** | 구 SELECT 로 성공, `spaces: []` |
| 마이그레이션 후 | — | 첫 시도가 성공 → **추가 비용 0** |

⚠ **폴백 판정을 좁게 했다.** 컬럼 부재일 때만 재시도하고, 그 외(연결 끊김·타임아웃)는 **그대로 전파**한다.
아무 오류에나 폴백하면 일시 장애가 **조용한 기능 격하**로 바뀐다 — 배치가 계속 spaces 없이 써도 아무도 모른다.

> 🔴 **이 절의 초판 구현은 그 목표를 달성하지 못했다.** 판정을 `e.message` 로 했는데
> `executeQuery` 가 SQL 전문을 메시지에 넣어 던지는 탓에 **모든 오류가 폴백을 발동**시켰다.
> 검증 D-M7-1 로 잡혀 `e.cause`(원본 드라이버 오류) 기준으로 고쳤다 — **정정 내용은 §13-12** 참조.

## 13-8. 변경 파일

### 신규 (테스트 2)

| 경로 | 내용 |
|---|---|
| `src/resolver/portfolioDashboard/__test__/PortfolioSpaceRollup.test.js` | 롤업 정합·불명 스페이스·정렬·shape 10 케이스 |
| `src/resolver/portfolioDashboard/__test__/PortfolioSpacesPersistence.test.js` | 저장/조회 폴백·SQL 정합·마이그레이션 등록 12 케이스 |

### 수정 (8)

| 경로 | 변경 |
|---|---|
| `src/resolver/projectProgress/ProgressCalculator.js` | **`classifyStatusKey` 신규 export** + `computeStatusDistribution` 이 그것을 쓰도록 정리(동작 동일) |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | **`computeSpaceRollup` 신규**(순수 함수) + `snapshot.spaces` 추가 |
| `src/rdb/schema/ddl/portfolioSnapshot.sql.js` | `ALTER_PORTFOLIO_SNAPSHOT_ADD_SPACES_JSON` |
| `src/rdb/schema/ddl/index.js` | re-export 1건 |
| `src/rdb/schema/migrate.js` | import + `v019_...` enqueue(맨 끝) |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `UPSERT_WITH_SPACES`·`SELECT_ALL_WITH_SPACES` 추가. **기존 `UPSERT`/`SELECT_ALL` 무변경** |
| `PortfolioSnapshotRepository.js` | `upsertSnapshot`·`getAllSnapshots` 에 컬럼 부재 폴백 |
| `PortfolioDashboardService.js` | `projects[].spaces` 추가(`toArray(parseJson(...))`) |

### 건드리지 않은 것 (확인 완료)

- **공통 이슈 페처 무변경** — `fetchAllProjectIssues` / `getProjectIssuesByFilter`(§11 함정 5). `project` 는 원래 fields 에 있었다.
- `runSubscriptionReconcile`(구독 정합성 스윕) — 이 데이터와 무관해 무접촉.
- 급여·원가 경로 전부(`stripMemberCost`, `costGating`, `salary_policy`) 무변경.
- `SELECT_BY_PROJECT_ID`(작업 배정이 쓰는 1행 조회) 무변경 — spaces 를 쓰지 않으므로 컬럼을 추가하지 않았다.
- resolver·PermissionMap·KVS·`manifest.yml`·프론트·locales 전부 무변경.

## 13-9. 테스트 결과

```
$ npx jest src/resolver/portfolioDashboard
Test Suites: 7 passed, 7 total
Tests:       89 passed, 89 total

$ npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total

$ npm test            (루트 전량)
Test Suites: 82 passed, 82 total
Tests:       1297 passed, 1297 total
Time:        29.62 s
```

**실패 0건.** 급여 회귀 가드(`PortfolioCostGate`·`PortfolioAggregatorSalaryPolicy`)와
`computeStatusDistribution` 기존 테스트가 전부 통과 → `classifyStatusKey` 추출이 **동작 무변경**임이 증명된다.

신규 테스트가 고정한 것:
① **정합 불변식** — 상태 3종 × 스페이스 2종 혼합에서 `Σ spaces` = `issueSummary`
② `statusKey: null` 이 양쪽 모두 todo 로 접힘(판정을 복제하면 깨지는 지점) · 미지 카테고리는 양쪽 inProgress
③ 스페이스 불명 이슈를 버리지 않고 `spaceKey: null` 버킷 + 불변식 유지
④ 정렬(key asc, null 맨 뒤) · 항목 shape 5필드 · 같은 스페이스 병합 · **재무 문자열 미포함**
⑤ 신규 23컬럼 UPSERT 우선 + `spaces_json` 이 마지막 파라미터 · spaces 미전달 시 `[]`
⑥ 컬럼 부재 시 구 문 폴백(쓰기·읽기 각각) · **다른 오류는 전파**
⑦ 신규/구 UPSERT 컬럼 순서 동일 + `spaces_json` 만 끝에 · 플레이스홀더 23개 일치
⑧ v019 가 체인 맨 끝 · 멱등 ALTER · CREATE 본문 무변경 · 마이그레이션 이름 중복 없음

## 13-10. 다음 단계(frontend)가 주의할 것

1. **`spaces` 는 항상 존재하고 항상 배열**이다. `?? []` 불필요(해도 무해). 빈 배열 = "아직 집계 전"이니
   4계층 중 스페이스 층만 접고 나머지는 그리면 된다.
2. **`spaceKey: null` 항목을 버리지 말 것**(§13-4). 버리면 화면 합계가 `issueSummary` 와 어긋난다.
3. **`done/inProgress/todo` 는 건수**다. 공수(MD)가 아니다 — 노드 크기를 MD 로 잡던 M5·M6 규칙과 다르다.
   스페이스 노드 크기는 건수 합으로 잡거나, 프로젝트 노드처럼 별도 기준을 쓸 것.
4. `Σ spaces = issueSummary` 가 보장되므로 **프로젝트 노드의 이슈 수를 다시 계산하지 말고** `issueSummary` 를 쓰면 된다
   (두 곳에서 세면 언젠가 갈린다).
5. **구 스냅샷은 배치가 한 번 더 돌 때까지 빈 배열**이다(스케줄 트리거 `interval: day`). 배포 직후 화면에서
   스페이스가 안 보이는 것은 정상 — 안내 문구 또는 3계층 폴백을 준비할 것.
6. 자원 탭의 기존 3계층 토폴로지 제거 시 `portfolioCards.js` 등록도 함께 정리할 것(죽은 접기 버튼 방지 — §13 함정 17).
7. 신규 `useQuery` 를 만들지 말 것 — 기존 `portfolioKeys.dashboard()` 응답을 **props 로** 받는다(§13 함정 18).

## 13-11. 남은 M7 백엔드 이슈

**없음.** 요구 5항목(집계 확장 · `spaces_json` v019 · 읽기 정규화 · 배포 순서 · reconcile 무접촉) 전부 완료.
프론트(스콥 탭 4계층 위젯 + 자원 탭 3계층 제거)는 병행 예정.

---

## 13-12. 정정 — 검증 6차 지적 반영 (커밋 전)

`03_verify_report.md` 6차 절의 D-M7-1 · D-M7-2 · O-M7-2 를 반영했다. **§13-7 의 "좁게 판정한다"는 서술은
실제로 성립하지 않았다** — 아래 D-M7-1 이 그 정정이다.

### D-M7-1 [중하] 폴백 판정이 실경로에서 **항상 참**이었다 — 수정

**무엇이 틀렸나**
`CommonQuery.executeQuery` 는 실패를 이렇게 감싼다:

```js
throw new SqlError(e.code, `query: ${query}, params: ${params.toString()}`, e)
```

즉 **최상위 `message` 에 SQL 전문이 들어간다.** `spaces_json` 을 쓰는 문에서 실패하면 그 SQL 에
당연히 `spaces_json` 이 있으므로, 내가 넣었던 판정

```js
const msg = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`;
return msg.includes(SPACES_COLUMN);          // ← 연결 끊김·타임아웃도 전부 true
```

은 **모든 오류에서 참**이 된다. 결과적으로 일시 장애가 "spaces 없는 스냅샷"으로 조용히 격하되고
아무도 모른다 — §13-7 에서 막았다고 적은 바로 그 실패 모드를 코드가 그대로 갖고 있었다.
(`bulkApply.js` 의 `error?.cause ?? error` 와 같은 계열: **감싼 오류의 최상위 메시지를 신뢰하면 안 된다.**)

**수정본** — 원본 드라이버 오류(`e.cause`)만 본다:

```js
const UNKNOWN_COLUMN_CODES = new Set([1054, '1054', 'ER_BAD_FIELD_ERROR']);

const isMissingSpacesColumn = (e) => {
    const cause = e?.cause;
    if (!cause) return false;                                   // 감싸이지 않은 오류 → 폴백 안 함
    const causeMsg = String(cause.message ?? '');
    if (!causeMsg.includes(SPACES_COLUMN)) return false;        // 다른 컬럼/무관 오류 → 폴백 안 함
    return UNKNOWN_COLUMN_CODES.has(cause.code ?? e?.code) || /unknown column/i.test(causeMsg);
};
```

세 조건을 **모두** 만족할 때만 폴백한다: ① 원본 오류가 있고 ② 그 메시지가 `spaces_json` 을 언급하고
③ 코드가 Unknown column 계열이거나 메시지가 그렇게 말한다.

**테스트 재작성** — 정제된 `new Error(...)` 주입은 이 결함을 못 잡으므로 **실제 `SqlError` 2단 모양**으로 만든다:

```js
const wrapAsExecuteQueryDoes = (query, driverError) =>
    new SqlError(driverError.code, `query: ${query}, params: p1,RMS`, driverError);
```

고정한 케이스(쓰기·읽기 각각):
- 컬럼 부재(`cause.code = 1054`) → 구 문으로 폴백
- **연결 장애(`cause.code = 'ECONNRESET'`) → 폴백 없이 전파** ← 핵심 회귀 가드.
  테스트가 `expect(err.message).toContain('spaces_json')` 로 **전제(최상위 메시지에 SQL 이 섞인다)를 먼저 고정**해
  나중에 누가 message 매칭으로 되돌리면 즉시 깨지게 했다.
- `cause` 없는 오류 → 폴백 없음
- **다른 컬럼**의 Unknown column(`weekly_effort_json`) → 폴백 없음

**가드가 실제로 작동하는지 확인함**: 판정을 옛 버전으로 되돌려 실행하니 **4개 테스트가 실패**하고,
수정본에서는 15개 전부 통과했다(빈 껍데기 테스트가 아님을 실증).

### D-M7-2 [하] 소스에 raw NUL 바이트 — 제거

`PortfolioAggregator.js` offset 7898 의 `spaceKey ?? '\0__UNKNOWN__'` 에 NUL(0x00) 1바이트가 있어
git 이 파일을 **바이너리로 판정**했다(`Bin 26555 -> 29892 bytes`, diff·blame 불가).

**센티널을 없애서 고쳤다** — `Map` 은 `null` 을 키로 그대로 받는다:

```js
let entry = byKey.get(spaceKey);          // spaceKey 가 null 이어도 정상 동작
if (!entry) { … byKey.set(spaceKey, entry); }
```

- 센티널 문자열 자체가 사라져 **응답에 샐 가능성이 0** 이다(§13-2 의 `spaceKey: null` 계약 그대로).
  `JSON.stringify(spaces)` 에 `UNKNOWN` 이 없음을 테스트로 고정했고, null 이슈 2건이 **한 버킷으로 합쳐지는지**도 확인한다.
- 확인: `git diff -- src/resolver/portfolioDashboard/PortfolioAggregator.js` → **텍스트 diff (60 insertions)**.
  M7 이 만진 4개 파일 전부 NUL 0바이트.

### O-M7-2 인덱스 정렬 의존 — 가드 추가

`computeSpaceRollup(rawIssues, issuesNorm)` 은 같은 인덱스가 같은 이슈여야 한다. 한쪽만 필터링/정렬하면
상태가 엉뚱한 스페이스에 계상되는데 **합계는 그대로라 §13-3 정합 불변식 테스트로도 안 잡힌다.**

```js
if (rawIssues.length !== issuesNorm.length) {
    throw new Error(`[PortfolioAggregator] computeSpaceRollup index misalignment: raw=…, norm=…`);
}
```

주석에 "한쪽만 필터링 금지"를 명시했고, 길이 불일치 throw·정상 통과 2케이스를 고정했다.

### 정정 후 테스트

```
$ npx jest src/resolver/portfolioDashboard
Test Suites: 7 passed, 7 total
Tests:       94 passed, 94 total

$ npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total

$ npm test            (루트 전량)
Test Suites: 82 passed, 82 total
Tests:       1302 passed, 1302 total
Time:        20.286 s
```

**실패 0건.** 변경 파일은 §13-8 목록과 동일하다(신규 파일 없음 — 기존 3개 파일 수정 + 테스트 2개 보강).

---

# 14. M8 — 스콥 토폴로지 드릴다운 `getPortfolioSpaceIssues`

> 기준: `01_architect_design.md` §14 + `01a_leader_decisions.md` §14(Q10 실측 검증 완료 · Q12 상한 · Q14 권한 승인)
> 범위: **M8 백엔드만.** `src/` 만 수정, 프론트 무접촉.
> **DDL·KVS·`manifest.yml` 변경 없음.** M7 의 `spaces_json`·v019 는 **초기 뷰의 재료로 승격**되어 그대로 쓴다.

## 14-1. 구현한 resolver

| resolver | 등록 위치 | PermissionMap | 입력 |
|---|---|---|---|
| `getPortfolioSpaceIssues` | `PortfolioDashboardController.js` (`guardedDefine`, 맨 끝) | **`R('REPORT','detail')`** | `{ projectId, spaceKey }` |

- `PermissionMap` 섹션 주석 `2 → 3` 갱신.
- `principal` 전달함 — 스코프 재확인 + 전용 페처 캐시 키(viewerId).
- `src/index.js` 무변경(신규 컨트롤러 파일 없음).

## 14-2. 실제 응답 shape (**구현된 것 그대로**)

`invoke('getPortfolioSpaceIssues', { projectId, spaceKey })` → 루트 스프레드(`result.issues`).

```jsonc
{
  "success": true,

  "projectId": "9f3c…",          // 에코백 — 응답이 어느 요청의 것인지 프론트가 확인
  "spaceKey":  "DWEB",           // 에코백
  "hourRate":  8,                // number — actualMd/plannedMd 를 만든 분모
  "scanned":   187,              // number — 실제로 받은 이슈 수
  "truncated": false,            // boolean — MAX_EXPAND_ISSUES(300) 초과로 페이지 루프를 끊었는지
  "orderedByTimeSpent": true,    // boolean — ORDER BY timespent DESC 가 적용됐는지

  "issues": [
    {
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "issueTypeName": "Task",                  // string|null
      "issueTypeIconUrl": "https://…",          // string|null
      "statusKey": "indeterminate",             // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",                   // string|null — fields.status.name
      "statusColorName": "yellow",              // string|null
      "assignee": { "accountId": "5b1…", "displayName": "홍길동" },  // object|null — avatarUrl 없음
      "actualMd": 5.0,                          // number — 노드 크기 재료. 투입 없으면 0
      "plannedMd": 3.5                          // number|null — 툴팁용. null = 미산정(0 아님)
    }
  ]
}
```

**설계 §14-3-B 와 100% 일치한다 — 이번 절에는 계약 이탈이 없다.**

**실패 시**: `{ success:false, error:{ name, code, message, cause } }`

| 상황 | 판정 위치 | 프론트 분기 키 |
|---|---|---|
| `projectId` 누락 | 서비스 | `error.cause === 'PROJECT_ID_REQUIRED'` |
| `spaceKey` 누락/빈값 | 서비스 | `error.cause === 'SPACE_KEY_REQUIRED'` |
| `spaceKey` 형식 위반 | 서비스 | `error.cause === 'SPACE_KEY_INVALID'` |
| 스코프 밖 프로젝트 · `principal` 부재 | **가드 + 서비스** | `error.code === 'PERMISSION_PROJECT_SCOPE_DENIED'` |
| Jira 검색 실패 | — | **에러 아님.** `{issues:[], scanned:0, truncated:false}` 부분 폴백 |

⚠ 앞의 3개는 `LogicalError` 3인자 관례라 코드가 `error.code`(항상 500)가 아니라 **`error.cause`** 에 실린다.
스코프 거부만 `ProjectScopeError` 라 **`error.code`** 에 실린다(`name === 'ProjectScopeDeniedError'`). 두 자리가 다르니 주의.

## 14-3. 권한 — 3중 (§14-D5)

| 층 | 장치 | 막는 것 |
|---|---|---|
| ① 가드 | `R('REPORT','detail')` → `enforceProjectScope` 가 payload 의 `projectId` 를 `scopedProjectIds(principal)` 로 검증 | MEMBER_ONLY/TEAM_ONLY 가 **화면에 뜨지 않은 프로젝트**를 전개하는 것 |
| ② 서비스 재확인 | **같은 `scopedProjectIds` 함수**를 다시 호출 + `principal` 부재는 **fail-close** | PermissionMap 이 언젠가 `'list'`/`'none'` 으로 바뀌어도 조용히 열리지 않음 |
| ③ Jira | `as:'user'` 고정 | 사용자가 Jira 에서 볼 수 없는 이슈는 검색 결과에 애초에 없음 |

- ②는 **판정 두 벌이 아니다** — 가드와 **문자 그대로 같은 함수**를 쓰므로 두 판정이 갈릴 수 없다.
  `getPortfolioDashboard` 가 `projects[]` 를 거를 때 쓰는 것도 같은 함수라, **화면 목록과 전개 가능 범위가 정의상 일치**한다.
- ⚠ `scopedProjectIds(undefined)` 는 `null`(= 제한 없음)을 돌려준다. 그것에 기대면 `principal` 전달 누락이
  곧 전면 개방이 되므로 **`principal` 자체가 없으면 먼저 거부**한다(테스트로 고정).
- **`asApp` 을 쓰지 않는다.** 배치가 asApp 인 것은 스케줄 트리거에 사용자 컨텍스트가 없기 때문이고,
  화면 조회에서 asApp 을 쓰면 A안이 기각된 바로 그 권한 문제(Jira 비공개 이슈 노출)를 그대로 들여온다.
- 🔴 `problemIssues[]` 의 기지 한계(글로벌 TOP50 이 스코프 필터를 받지 않음)를 **근거로 쓰지 않았다.**
  M8 은 그보다 엄격하다 — 별건 백로그(리더 Q16)는 그대로 남는다.
- **급여·원가 무접촉** — `issues[]` 에 금액 필드가 없다(`salary`/`cost`/`budget`/`totalSalary` 문자열이
  직렬화 결과에 없음을 테스트로 고정). `costMasked`·`stripMemberCost` 분기 불요, 회귀 가드 통과.

## 14-4. JQL 주입 방어 — 이스케이프가 아니라 **화이트리스트**

`spaceKey` 는 JQL 문자열에 그대로 들어간다. 따옴표 이스케이프로 막는 대신 **형식 자체를 강제**했다:

```js
export const SPACE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;
```

Jira 프로젝트 키는 대문자로 시작하는 영숫자/언더스코어라 정규식으로 완전히 표현되고, **그 집합에는
따옴표·공백·JQL 연산자가 존재할 수 없다.** 이스케이프 누락으로 뚫리는 경로를 원천 차단하는 쪽이 안전하다
(`SubscriptionJqlBuilder` 가 괄호 균형 검증으로 고생한 전례 — §D6).

- 서비스가 `SPACE_KEY_INVALID` 로 거부하고 **Jira 를 부르지 않는다.**
- **페처도 스스로 방어한다**(서비스를 우회해 직접 호출해도 빈 폴백). 테스트로 고정.
- 거부 케이스: `DWEB" OR project = "OTHER` · 공백 · 소문자 · 숫자 시작 · `AND` · 괄호 · 빈값 · 비문자열.

## 14-5. `ORDER BY` 폴백 — **400 에서만** (D-M7-1 교훈 적용)

절단 시 무엇이 남는지가 중요하므로 `ORDER BY timespent DESC` 로 **투입이 큰 것부터** 남긴다
(리더 Q10: 운영 사이트 실측으로 정상 동작 확인됨 — 폴백은 방어로만 유지).

```js
const isJqlRejected = (e) => e?.code === 400 || e?.code === '400';
```

⚠ **오류 메시지를 매칭하지 않는다.** M7 의 D-M7-1 이 정확히 그 함정이었다(감싼 오류의 message 에 원문이 들어가
어떤 오류든 매칭됐다). `postJiraJson` 은 HTTP 실패를 `new ForgeAPIError(res.status, …)` 로,
네트워크 실패를 `new ForgeAPIError('Request Jira Error', …)` 로 던지므로 **`code` 만 보면 구조적으로 갈린다.**

테스트로 고정한 것: 400 → 무정렬 1회 재시도 + `orderedByTimeSpent:false` /
**401·403·429·500·503·연결 오류 → 재시도 없음**(부분 폴백으로 끝남).

## 14-6. 왕복 비용 — 설계 예측 대조 (**실측**)

| 동작 | 설계 예측(§14-5) | **실제** | 일치 |
|---|---|---|---|
| 포트폴리오 진입 | Jira 0 | **Jira 0** — 초기 뷰는 `spaces_json`(M7) | ✅ |
| 스콥 탭 열기 | 0 | **0** — props | ✅ |
| **스페이스 전개 1회** | Jira `⌈min(M,300)/100⌉`=1~3 · MySQL 0 · KVS 1 · invoke 1 | **Jira 1~3 · MySQL 0 · KVS 1 · invoke 1** | ✅ |
| 접기 | 0 | **0**(서버 무관) | ✅ |
| 재전개(5분 내) | 0 | **0** — 클라이언트 쿼리키 캐시 | ✅ |

- KVS 1 = `getSettingDataService()`(hourRate). 이슈 페치와 **`Promise.all` 병렬**이라 지연은 Jira 쪽에 흡수된다.
- MySQL **0** — 스냅샷을 읽지 않는다. 초기 뷰가 이미 갖고 있는 정보로 클릭 대상이 정해지기 때문이다.
- 상한 300 → **전개당 Jira 최대 3회**. 사용자가 3개 전개해도 9회이고, 전량 로드(설계 비교표 X안)의 60회와 대비된다.
- 페이로드: 300 이슈 × ~250B ≈ **75KB/전개**(설계 추정과 동일 — 관계 필드를 빼서 더 작다).

**서버 캐시**: `createSingleEntryPromiseCache`(TTL 60s) **import 재사용**(복사 금지 — 그 파일을 뽑은 이유).
키 `${viewerId}::${projectId}::${spaceKey}`, viewerId 없으면 캐시 미사용.
⚠ 엔트리가 **1개뿐**이라 스페이스를 번갈아 전개하면 스래싱한다 — 의도된 것이다. **1차 방어선은 클라이언트
쿼리키 캐시**이고, 이 캐시는 동시 진입·중복 클릭을 흡수하는 2차 방어선이다(§14-D4).

## 14-7. 변경 파일

### 신규 (2 + 테스트 1)

| 경로 | 내용 |
|---|---|
| `src/resolver/portfolioDashboard/PortfolioIssueFetcher.js` | `getPortfolioSpaceIssues`(페치) · `invalidatePortfolioSpaceIssues` · `isValidSpaceKey` · `SPACE_KEY_PATTERN` · `MAX_EXPAND_ISSUES = 300` |
| `src/resolver/portfolioDashboard/PortfolioIssueService.js` | `getPortfolioSpaceIssuesService` — 입력 검증 · 스코프 재확인 · MD 환산 |
| `src/resolver/portfolioDashboard/__test__/PortfolioSpaceIssues.test.js` | 45 케이스 |

### 수정 (2)

| 경로 | 변경 |
|---|---|
| `PortfolioDashboardController.js` | `getPortfolioSpaceIssues` 등록 1건(**principal 전달**) |
| `src/permission/PermissionMap.js` | `getPortfolioSpaceIssues: R('REPORT','detail')` + 섹션 주석 `2 → 3` |

### 건드리지 않은 것 (확인 완료)

- **공통 페처 무변경** — `getProjectIssuesByFilter` / `fetchAllProjectIssues` / `getProjectGanttIssues` /
  `TopologyIssueFetcher` / `DashboardIssueFetcher`(§11 함정 5).
- **M7 산출물 전부 존치** — `spaces_json`·v019·`computeSpaceRollup`·`classifyStatusKey`·컬럼 부재 폴백.
  **초기 뷰의 유일한 재료**라 되돌릴 이유가 없다(§14-D3).
- `getPortfolioDashboard` 응답 계약·`PortfolioAggregator`·스냅샷 배치 무변경.
- `getProjectRelationGraph`(M5) 무접촉 — §14-2 C1 기각.
- DDL·KVS·`manifest.yml`·`src/index.js`·프론트·locales 전부 무변경.

## 14-8. 테스트 결과

```
$ npx jest src/resolver/portfolioDashboard/__test__/PortfolioSpaceIssues.test.js
Tests:       45 passed, 45 total

$ npx jest test/permission src/resolver/portfolioDashboard
Test Suites: 15 passed, 15 total
Tests:       306 passed, 306 total

$ npm test            (루트 전량)
Test Suites: 83 passed, 83 total
Tests:       1347 passed, 1347 total
Time:        14.746 s
```

**실패 0건.** `permissionMap.contract.test.js`(신규 resolver 등록) · `PortfolioCostGate.test.js`(급여 회귀) ·
`PortfolioAggregatorAsApp.test.js`(배치 asApp 계약) 전부 통과.

신규 테스트가 고정한 것:
① `spaceKey` 화이트리스트 — 정상 5종 통과 / **주입 시도 9종 거부**(따옴표 탈출·공백·소문자·숫자 시작·JQL 연산자·괄호·빈값·비문자열) ·
   서비스·페처 **양쪽**에서 Jira 미호출
② 입력 검증 3종 · **`principal` 부재 fail-close** · MEMBER_ONLY 비소속 거부 / 소속 통과 / admin 무제한
③ JQL 형태(`moves_RMS_projectId … AND project … ORDER BY timespent DESC`) · `as:'user'` ·
   **fields 에 `issuelinks`/`parent`/`project`/`properties` 없음**
④ 페이징 · **300 상한 + `truncated` + 상한 후 페이지 중단**
⑤ **`ORDER BY` 폴백이 400 에서만** — 401·403·429·500·503·연결 오류는 재시도 없음 · 폴백 시 `orderedByTimeSpent:false`
⑥ 응답 shape 전체 일치(§14-3-B) · **M5 에 있는 `id`/`projectKey`/`projectName`/`isSubtask`/`degree` 부재 확인** ·
   `actualMd` 0 / `plannedMd` null 보존 · `hourRate` 변경 시 환산 추종 · **금액 필드 미포함**
⑦ Jira 실패 시 빈 집계 정상 응답
⑧ 캐시 — 같은 키 재사용 · **spaceKey 다르면 재페치**(키 포함 확인) · viewerId 다르면 재페치 ·
   viewerId 없으면 미사용 · 동시 진입 1벌 · 서비스가 `principal.accountId` 를 넘기는지

## 14-9. 다음 단계(frontend)가 주의할 것

1. **전개는 항상 사용자가 시작한다.** 초기 렌더에서 자동 전개하지 말 것 — 그 순간 "진입당 invoke 1회" 규약이
   깨지고 진입 비용이 생긴다(§14-D2). 화면을 열고 아무것도 안 누르면 추가 invoke 는 **정확히 0**이어야 한다.
2. **에러 코드 자리가 둘이다.** 입력 검증 3종은 `error.cause`, 스코프 거부는 `error.code` 다(§14-2 표).
3. **`plannedMd: null` 은 미산정**이지 0이 아니다. `?? 0` 금지. **`actualMd: 0`** 은 "투입 없음" →
   노드 크기 **기본값 14 고정**(축소·숨김 금지).
4. **`truncated` 와 `orderedByTimeSpent` 를 함께 읽어야 배너 문구가 맞다.**
   `orderedByTimeSpent:false` 면 잘린 것이 "투입 큰 순"이 아니므로 문구를 달리해야 한다(§14-D9).
5. **`spaceKey === null`(미지정) 스페이스는 전개 불가**다 — JQL 로 표현할 술어가 없다. 서버가 `SPACE_KEY_INVALID`
   로 거부하므로 **클릭 자체를 막고 툴팁으로 안내**할 것(누르고 나서 알게 하지 않는다).
6. **1차 캐시는 프론트다.** `portfolioKeys.spaceIssues(projectId, spaceKey)` + `staleTime` 5분.
   접었다 펴는 것은 invoke 0이어야 한다 — 서버 캐시는 엔트리 1개라 스래싱하므로 여기에 기대면 안 된다.
7. `issues[]` 는 **M5 이슈 노드의 부분집합**이다. `id` 는 프론트가 `issue:${key}` 로 만든다.
   크기·색·라벨·클릭 관례는 M5 와 통일할 것(§14-D6).
8. M7 의 `spaces_json` 은 **살아 있다** — 초기 뷰(스페이스 노드 + 건수)의 유일한 재료다. 폐기 대상은
   프론트의 `statusNodes`·`ownerStatusEdges` 뿐이고, 상태별 3건수는 `spaceNodes.{done,inProgress,todo}` 로 옮긴다.

## 14-10. 남은 M8 백엔드 이슈

**없음.** §14-8 backend 체크리스트 5항목(전용 페처 · 서비스 · 컨트롤러 · PermissionMap · 테스트) 전부 완료.
설계 §14-3-B 계약과 **이탈 0**. DDL·KVS·manifest 변경 없음.

**백로그(리더 Q16, M8 범위 밖)**: `problemIssues[]`(글로벌 TOP50)가 스코프 필터를 받지 않는 기지 한계는
그대로 남아 있다. M8 은 그 한계를 **근거로 쓰지 않았고**(오히려 더 엄격하다), 별건으로 처리해야 한다.
