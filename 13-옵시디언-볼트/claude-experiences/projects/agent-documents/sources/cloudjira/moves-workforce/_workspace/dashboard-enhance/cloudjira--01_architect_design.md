# 프로젝트 상세 대시보드 강화 설계서

> 작성: feature-architect / 2026-08-13
> 대상 요구사항: `_workspace/dashboard-enhance/00_input/requirement.md` (기능 7건)
> 조사 기준 소스: `develop` @ `8dd1002`
> **이 문서가 backend/frontend의 단일 진실 원천이다.** §2 경계면 계약을 바꿀 때는 양쪽에 통지한다.

---

## 0. 조사로 확정된 사실 (설계 근거)

설계 판단의 근거가 된 코드 사실을 먼저 못박는다. 구현 중 "왜 이렇게 했나"가 나오면 이 절을 본다.

| # | 사실 | 확인 위치 | 설계 영향 |
|---|------|----------|----------|
| F1 | 포트폴리오 스냅샷 테이블은 `PRIMARY KEY (project_id)` 의 **upsert 테이블**이다. `completion_rate`/`schedule_rate`/`diff_percent_point` 는 매일 **덮어쓰기**되고 과거값이 소실된다. 날짜 컬럼이 PK에 없다. | `src/rdb/schema/ddl/portfolioSnapshot.sql.js`, `src/rdb/query/PortfolioSnapshotQuery.js` (`UPSERT` = `ON DUPLICATE KEY UPDATE` 전 컬럼) | **진척률(완성률)의 시계열 추이는 산출 불가.** §D2 판정 참조 |
| F2 | 진척도 탭에는 **이미 S-curve(공수 누적 추이)가 있다.** `effort.plannedCumulative`(영업일 선형 계획선, 계산 생성) + `effort.actualCumulative`(워크로그 일별 누적) | `src/resolver/projectProgress/ProjectProgressService.js:78-80`, `static/ui/src/pages/projectDetail/progress/ProgressSCurve.jsx` | 추이 위젯은 **새 스냅샷 없이** 이 데이터를 재사용한다 |
| F3 | `completion.cumulative` 는 **항상 빈 배열**이다 — 이슈 상태전이 이력이 없어 일별 완성진척 산출 불가(진척도 설계에서 이미 확정된 한계) | `ProjectProgressService.js:130` 주석 | "완성 진척률 추이"는 제공하지 않는다. 대체안 §D2 |
| F4 | `getProjectProgressSummary` 의 **KVS 10분 캐시는 Jira 왕복을 하나도 줄이지 못한다.** 캐시 hit 경로 `buildIssuesArray()` 가 워크로그·이슈를 전량 재페치한다 | `ProjectProgressService.js:49-53`, `:199-215` | 진척 서비스를 위젯마다 호출하면 위젯 수만큼 전량 페치가 난다 → §D3 |
| F5 | `getProjectCostSummary` 도 동일. 캐시 hit 경로 `buildByIssue` 가 워크로그+이슈 전량 재페치, 게다가 `loadSalaryPolicyContext()` KVS read 1회 추가 | `src/resolver/projectCost/ProjectCostService.js:66-90` | 비용 위젯은 "무거운 위젯"으로 분류·표기 |
| F6 | `ProgressCalculator.js` 는 **Forge 의존 0의 순수 모듈**이고 이미 `projectCost`·`portfolioDashboard` 가 도메인 밖에서 재사용 중이다 | `src/resolver/projectProgress/ProgressCalculator.js`, `ProjectCostService.js:10`, `PortfolioAggregator.js:13-20` | **산식 복제 금지 요구를 이 모듈 재사용으로 충족.** 진척률 숫자가 탭과 갈릴 수 없다 |
| F7 | `WorkAssignmentRules.js` 에 `computeQueueFlags`(OVERDUE/DUE_SOON/UNASSIGNED/NO_ESTIMATE) · `computeDDay` · `sortQueueItems` 가 순수 함수로 있다. `dueSoonDays` 기본 7 | `src/resolver/workAssignment/WorkAssignmentRules.js:41-84,190-216` | 지연·임박 판정 산식을 새로 쓰지 않는다 |
| F8 | 레포 전체에 **`duedate` JQL 술어가 0건**이다. 지연/임박 판정은 전부 애플리케이션 사이드 | 전수 grep | 지연 목록도 JQL이 아니라 이슈 배열 필터로 만든다 |
| F9 | `getProjectIssuesByFilter` 가 요청하는 fields 에 `timetracking, statusCategory, duedate, assignee, issuetype` 가 **이미 전부 포함**돼 있다. 단 `priority` 는 없다 | `src/api/jira/issue/IssueApi.js:327` | 신규 위젯 5종의 재료가 **이슈 1패스**로 전부 나온다. priority 때문에 전용 페처 필요(§D3) |
| F10 | 공통 페처 수정 금지 원칙이 코드 주석으로 명문화돼 있다. `ProjectParticipantFetcher.js` 는 "소비처가 늘면 여기서 분기하지 말고 전용 페처를 새로 만들라"고 명시 | `ProjectParticipantFetcher.js:10-11`, `WorkAssignmentIssueFetcher.js:3-5` | 대시보드 전용 페처를 신규 작성한다 |
| F11 | `ProjectParticipantFetcher` 는 **모듈 스코프 Promise 캐시(TTL 60초, 키 `viewerId::projectId`)** 로 위젯 간 중복 페치를 흡수한다. viewerId 없으면 캐시 미사용(fail-safe) | `ProjectParticipantFetcher.js:41-111` | 이 패턴을 그대로 차용(§3-2) |
| F12 | `CHART_OPTION_MAP` = `{pie,bar,line,heatmap,lineStack}`. **맵에 없는 chartType은 에러 없이 백지 차트**가 된다 | `ChartTemplate.js:40-46`, `constants/dashboardTypes.js:26-30` 주석 | treemap 옵션 파일 신규 필수. 목록/S-curve/BurnUp 은 아예 ECharts 경로를 타면 안 된다 → 렌더러 분기 도입 |
| F13 | `project_dashboard` 테이블 컬럼 9개(`dashboard_id, project_id, dashboard_title, chart_type, data_type, pos_x, pos_y, width, height`). 필터 정의를 담을 자리가 없다 | `src/rdb/schema/ddl/project.sql.js:17-33` | 커스텀 필터는 컬럼 추가 필요(v018) |
| F14 | 컬럼 추가 전례 4건(v012/v013/v015/v017) 전부 `ADD COLUMN IF NOT EXISTS` + NULL 허용 멱등 ALTER. 최신 번호는 **v017** | `src/rdb/schema/migrate.js`, `ddl/*.sql.js` | 다음은 `v018_...` |
| F15 | 시드 기본값: `DASHBOARD` member=`{read:true,write:false}`, `REPORT` member=`{read:true,write:false}`, `PROJECT_COST` member=`{read:false,write:false}` | `src/permission/ResourceCatalog.js:42-53` | 신규 위젯 권한 경계 §D5 |
| F16 | salary 차단은 2단(권한 `canReadCost` → 정책 `canShowIndividualSalary`), **예외를 던지지 않고 `{denied, reason}` 을 반환**한다. 이미 배치된 위젯이 대시보드 전체를 깨지 않게 하려는 의도 | `ProjectDashboardService.js:184-201` | 신규 위젯의 거부 표현도 같은 규약을 따른다 |
| F17 | `invoke('getProjectCostSummary')` 호출부는 `useProjectCostSummary.js` 하나뿐이어야 한다 — 회귀 가드 테스트가 강제 | `static/ui/src/pages/projectDetail/analysisReport/team/__test__/projectTeamAnalysisWiring.test.js:117` | 비용 위젯은 **그 훅을 재사용**해야 한다. 새 invoke 추가 금지 |
| F18 | 이슈 링크 표준은 `router.open(\`${siteUrl}/browse/${key}\`)` 이고 공용 컴포넌트 `IssueComponent` 가 있다. `window.open` 은 레포 전체 0건 | `static/ui/src/components/issue/IssueComponent.js`, `ProgressRiskTable.jsx:80` | 목록 위젯은 `IssueComponent` 재사용 |
| F19 | `getChartInfo` 는 `QueryBuilder().from('project_dashboard')` 로 **컬럼 목록 없는 SELECT** 를 만든다 | `ProjectDashboardRepository.js:15-30` | 신규 컬럼이 추가되면 조회는 자동 반영. INSERT만 수정 필요 |
| F20 | `LogicalError` 호출 시그니처가 도메인마다 다르다. projectDashboard 는 `(500, "Internal Server Error", "CODE")`, projectProgress 는 `('CODE', 'message')` | `ProjectDashboardService.js:560`, `ProjectProgressService.js:37` | **신규 코드는 projectDashboard 도메인의 3인자 형태를 따른다**(같은 파일 안에서 갈리지 않게). 통일은 이번 범위 밖 |

---

## 1. 개요 / 영향 범위

### 1-1. 설계의 한 문장

> 신규 위젯 5종(상태분포·계획대비실적·트리맵·지연임박목록·커스텀필터)의 재료는 **전부 같은 이슈 배열 하나**에서 나온다. 그래서 **위젯마다 부르지 않고, 대시보드당 1회 부르는 신규 resolver `getDashboardIssueInsight` 를 만들고 프론트가 공유 쿼리키 하나로 구독**한다. 무거운 2종(진척 추이·비용 소진)은 기존 resolver를 그대로 재사용하되 "무거운 위젯"으로 분리한다.

### 1-2. 영향 범위

**백엔드**
- 신규 파일 3: `src/resolver/projectDashboard/DashboardIssueFetcher.js`, `DashboardInsightService.js`, `src/permission/ReportAccess.js`
- 수정 파일 5: `ProjectDashboardController.js`(+3 resolver), `ProjectDashboardService.js`(addChart filter 전달), `ProjectDashboardRepository.js`(INSERT 10컬럼 + filter update), `src/rdb/query/ProjectDashboard.js`(INSERT/UPDATE_FILTER), `src/permission/PermissionMap.js`(+3 키)
- 신규 resolver 3: `getDashboardIssueInsight`, `updateChartFilter`, (M4) `addChart` 는 기존 함수 확장
- **`getChartDataById` 의 `data_type` 분기는 확장하지 않는다** — 근거 §D3

**프론트**
- 신규 파일 8: `constants/dashboardWidgets.js`(렌더러/데이터소스 레지스트리), `hooks/useDashboardInsight.js`, `dashboard/widgets/IssueListWidget.jsx`, `StatusDistributionWidget.jsx`, `PlannedVsActualWidget.jsx`, `IssueTreemapWidget.jsx`, `dashboard/modal/FilterBuilder.jsx`, `components/chart/echart/options/treemapOption.js`
- 수정 파일 5: `ChartTemplate.js`(렌더러 분기), `summary/SummaryPanel.jsx`(KPI 3타일 추가), `modal/AddChartModal.jsx`(필터 빌더 + 권한 필터 일반화), `constants/dashboardTypes.js`(DATA_TYPES/CHART_TYPES/TEMPLATES 확장), `utils/queryKey/projectKeys.js`(키 2개 추가)
- 재사용(수정 없음): `ProgressSCurve.jsx`, `CostBurnUp.jsx`, `useProjectCostSummary.js`, `IssueComponent.js`, `CommonTable`, `ChartCard`, `EchartPanel`, `KpiTile`

**DB**
- MySQL `project_dashboard` 에 `filter_json JSON NULL` 컬럼 1개 추가 (마이그레이션 `v018`)
- KVS 변경 **없음** (manifest attributes 수정 불필요)

**i18n**
- `locales/kr/dashboard.json` · `locales/en/dashboard.json` 확장
- `locales/kr/chartOptions.json` · `locales/en/chartOptions.json` 확장
- ⚠ `locales/script/*.json` 은 빈 스텁 — merge 소스가 아니다. 추가 후 `cd static/ui && npm run merge`

---

## 2. 경계면 계약 (최우선 산출물)

### 2-1. resolver 계약표

| resolver 함수 | 신규/기존 | 입력 파라미터 | 응답 shape (success 시, 루트 스프레드) | PermissionMap 등록 | 대응 프론트 훅 / 쿼리키 | 모듈 |
|---|---|---|---|---|---|---|
| `getDashboardIssueInsight` | **신규** | `{ project_id }` | §2-2 | `R('DASHBOARD','detail')` | `useDashboardInsight(project_id)` / `projectKeys.dashboardInsight(project_id)` | M1 |
| `updateChartFilter` | **신규** | `{ dashboard_id, filter }` (`filter`: §2-4 FilterDef 또는 `null`) | `{ success:true }` (본문 없음 — `updateChartTitle` 관례) | `W('DASHBOARD','inherited')` | `invoke` 직접 + `projectKeys.dashboardInfo` invalidate | M4 |
| `addChart` | **기존 확장** | `{ project_id, charts:[{ i, dataType, chartType, chartName, x,y,w,h, **filter?** }], type }` | 기존과 동일(저장된 chartData 배열) | 기존 `W('DASHBOARD','inherited')` 유지 | 기존 `DashboardPage.handleAddChart` | M4 |
| `getChartInfo` | **기존 무변경** | `{ project_id }` | `{ rows: [{ dashboard_id, project_id, dashboard_title, chart_type, data_type, pos_x, pos_y, width, height, **filter_json** }] }` — F19에 의해 컬럼 추가만으로 자동 반영 | 기존 유지 | 기존 `projectKeys.dashboardInfo` | M4 |
| `getSummaryData` | **기존 무변경** | `{ project_id }` | 기존 그대로 (`total_salary` 게이팅 불변) | 기존 유지 | 기존 `projectKeys.summary` | M1 |
| `getProjectProgressSummary` | **기존 무변경** | `{ projectId, coworkerFieldId }` | 기존 그대로 | 기존 `R('REPORT','detail')` **유지 — 넓히지 않는다**(§D5) | `projectKeys.progress(project_id)` — **진척도 탭과 동일 키 공유** | M3 |
| `getProjectCostSummary` | **기존 무변경** | `{ projectId, coworkerFieldId }` | 기존 그대로 | 기존 `R('PROJECT_COST','detail')` 유지 | **`useProjectCostSummary(projectId)` 훅 재사용**(F17) / `projectKeys.cost` | M3 |
| `getChartDataById` | **기존 무변경** | 기존 | 기존 | 기존 | 기존 | — |

> ⚠ **`getChartDataById` 를 확장하지 않는 것이 이 설계의 핵심 결정이다.** 근거 §D3.

### 2-2. `getDashboardIssueInsight` 응답 shape (정확)

```jsonc
{
  "success": true,

  "generatedAt": "2026-08-13T04:12:33.000Z",   // ISO. 위젯 하단 "기준 시각" 표기용
  "hourRate": 8,                                // settings.hourRate (MD 환산 분모)
  "dueSoonDays": 7,                             // 임박 판정 창(현재는 항상 기본값 7)
  "scanned": 412,                               // 스캔한 이슈 수
  "truncated": false,                           // MAX_INSIGHT_ISSUES(2000) 초과로 잘렸는지

  "project": {
    "startDate": "2026-01-05",                  // string|null (project_dashboard GETSUMMARY)
    "endDate":   "2026-09-30",                  // string|null
    "dDay":      48,                            // number|null — endDate - today (일). 음수=초과
    "elapsedRatio": 0.71                        // number|null — 달력일 기준 경과 비율(0~1). KPI 보조 표기용
  },

  "counts": {
    "total": 412,
    "done": 180, "inProgress": 95, "todo": 137,
    "overdue": 23,        // dueDate < today AND statusKey !== 'done'
    "dueSoon": 11,        // today <= dueDate <= today+dueSoonDays AND statusKey !== 'done'
    "unassigned": 8,      // assignee 없음 AND coworkers 없음 AND statusKey !== 'done'
    "noEstimate": 64      // plannedMd == null AND statusKey !== 'done'
  },

  "statusDistribution": {                        // computeStatusDistribution 결과 그대로
    "byCount":  { "done": 180, "inProgress": 95, "todo": 137 },
    "byEffort": { "doneMd": 210.5, "inProgressMd": 88.0, "todoMd": 143.5 }
  },

  "issues": [                                    // 전량(캡 2000). 목록·트리맵·커스텀필터가 이 배열 하나를 공유
    {
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "issueTypeName": "Task",
      "issueTypeIconUrl": "https://.../task.png",   // string|null
      "statusKey": "indeterminate",                 // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",
      "statusColorName": "yellow",                  // string|null — StatusComponent 배지 색
      "priorityName": "High",                       // string|null
      "priorityId": "2",                            // string|null
      "assignee": { "accountId": "5b1…", "displayName": "홍길동", "avatarUrl": "https://…" }, // |null
      "dueDate": "2026-08-01",                      // string|null
      "dDay": -12,                                  // number|null — computeDDay
      "plannedMd": 3.5,                             // number|null (originalEstimateSeconds 없으면 null)
      "actualMd": 5.0,                              // number — timeSpentSeconds 기반, 없으면 0
      "flags": ["OVERDUE"]                          // computeQueueFlags 결과. done 이슈는 항상 []
    }
  ],

  // ── ▼ REPORT read 가 없으면 이 키 자체가 응답에 없다 (§D5, total_salary 선례) ──
  "metrics": {
    "completionRate": 0.62,      // computeCompletion(issues).rate — 진척도 탭 '완성 진척률'과 동일 값
    "scheduleRate":   0.71,      // computeScheduleRate — 진척도 탭 '일정 진척률'과 동일 값
    "diffPercentPoint": -9.0,    // computeDiagnosisRates.diffPercentPoint (%p)
    "effortVsCompletion": 4.2,   // %p
    "status": "delayed",         // diagnoseStatus(diff, settings.progressThreshold ?? 5)
    "plannedTotalMd": 442.0,
    "actualTotalMd":  318.5
  }
}
```

**실패 시**: `{ success:false, error:{ name, code, message, cause } }` (표준)

**계약 규약 3가지 (양쪽 다 지킬 것)**
1. `metrics` 는 **키 부재 = 미제공**이다. 프론트는 `?? 0` / `?? {}` 를 쓰지 말고 `'metrics' in data` 로 판정해 해당 타일·위젯을 **렌더하지 않는다**. (`total_salary` 선례 — `SummaryPanel.jsx:39` 주석 참조)
2. `issues[].plannedMd` 의 `null` 은 "계획 미입력"이지 0이 아니다. 트리맵·계획대비실적은 §D4 규칙으로 처리한다.
3. `truncated:true` 면 모든 집계가 과소값이다. 위젯 하단에 경고 캡션을 반드시 노출한다(조용한 절단 금지).

### 2-3. 위젯 레지스트리 (프론트 단일 확장점)

`static/ui/src/constants/dashboardWidgets.js` — **신규 위젯을 추가할 때 손대는 유일한 파일.**

```js
// dataType → { source, renderer, requires, defaultSize }
export const WIDGET_SPEC = {
  // 기존 7종 — 전부 chartDataById / echart
  role:     { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:4,h:5} },
  level:    { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:4,h:5} },
  team:     { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:4,h:5} },
  salary:   { source:'chartDataById', renderer:'echart', requires:'PROJECT_COST', defaultSize:{w:4,h:5} },
  assignee: { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:4,h:5} },
  issue:    { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:4,h:5} },
  worklog:  { source:'chartDataById', renderer:'echart', requires:null,           defaultSize:{w:6,h:6} },

  // 신규 — M1
  progressStatus:  { source:'issueInsight', renderer:'echart',    requires:null,           defaultSize:{w:4,h:5} },
  plannedVsActual: { source:'issueInsight', renderer:'echart',    requires:'REPORT',       defaultSize:{w:4,h:5} },
  // 신규 — M2
  riskIssues:      { source:'issueInsight', renderer:'issueList', requires:null,           defaultSize:{w:6,h:7} },
  issueSize:       { source:'issueInsight', renderer:'echart',    requires:null,           defaultSize:{w:6,h:7} },
  // 신규 — M3 (무거운 위젯)
  progressTrend:   { source:'progress',     renderer:'sCurve',    requires:'REPORT',       defaultSize:{w:8,h:7}, heavy:true },
  costBurnUp:      { source:'cost',         renderer:'burnUp',    requires:'PROJECT_COST', defaultSize:{w:6,h:6}, heavy:true },
  // 신규 — M4
  customFilter:    { source:'issueInsight', renderer:'issueList', requires:null,           defaultSize:{w:6,h:7}, hasFilter:true },
};
```

- `source` — 어느 쿼리를 구독할지. `ChartTemplate` 의 유일한 분기 축.
- `renderer` — `echart`(CHART_OPTION_MAP 경유) | `issueList` | `sCurve` | `burnUp`.
  **`renderer:'echart'` 인 위젯의 `chartType` 은 반드시 `CHART_OPTION_MAP` 에 있어야 한다**(F12 백지 차트 함정).
- `requires` — 위젯 노출/데이터 조건 리소스 키. `AddChartModal` 필터 + 위젯 denied 안내 양쪽이 이 값을 본다.
- `heavy` — AddChartModal 에 "조회가 무거움" 배지 표시 + 기본 템플릿에서 제외.

### 2-4. FilterDef 계약 (M4, `filter_json` 에 저장되는 값)

```jsonc
{
  "v": 1,                                   // 스키마 버전. 미래 확장 시 마이그레이션 훅
  "assignee":       ["5b1abc…", "__ME__"],  // accountId[] | 특수값 '__ME__'(현재 사용자, 클라이언트에서 해석)
  "statusCategory": ["new", "indeterminate"],
  "issueType":      ["Bug", "Task"],        // issuetype **name** 기준(응답에 name만 실림)
  "priority":       ["High", "Highest"],    // priority **name** 기준
  "due":            "OVERDUE",              // 'ANY'|'OVERDUE'|'DUE_SOON'|'NO_DUE'  (단일 선택)
  "estimate":       "ANY"                   // 'ANY'|'HAS'|'NONE'
}
```

- 모든 키는 **선택**. 없거나 빈 배열이면 그 축은 필터하지 않는다.
- 배열 축은 **OR**, 축 사이는 **AND**.
- **원문 JQL 문자열은 저장하지 않는다.** 근거 §D6.
- 서버 검증: `updateChartFilter`/`addChart` 가 `v===1` 확인 + 화이트리스트 키만 남기고 나머지 **폐기**(무시하지 말고 제거해서 저장). 알 수 없는 키가 있으면 `LogicalError(500,"Internal Server Error","DASHBOARD_FILTER_INVALID")`.
- 배열 길이 상한 각 축 20, 문자열 길이 상한 100. 초과 시 위 에러.

---

## 3. 백엔드 설계

### 3-1. 계층 분해

```
src/resolver/projectDashboard/
├── ProjectDashboardController.js   (수정) +getDashboardIssueInsight, +updateChartFilter
├── DashboardInsightService.js      (신규) 오케스트레이션 + 집계 + metrics 게이팅
├── DashboardIssueFetcher.js        (신규) 대시보드 전용 이슈 1패스 + 모듈 캐시
├── ProjectDashboardService.js      (수정) addChartService 가 chart.filter 를 통과시킴 + validateFilterDef
└── ProjectDashboardRepository.js   (수정) INSERT 10컬럼, updateChartFilterRepository 추가
src/permission/ReportAccess.js      (신규) canReadReport / REPORT_DENIED_REASON
src/rdb/query/ProjectDashboard.js   (수정) INSERT 재정의, UPDATE_FILTER 추가
src/rdb/schema/ddl/project.sql.js   (수정) ALTER_PROJECT_DASHBOARD_ADD_FILTER_JSON
src/rdb/schema/ddl/index.js         (수정) re-export
src/rdb/schema/migrate.js           (수정) v018 enqueue
src/permission/PermissionMap.js     (수정) +2 키
src/index.js                        무변경 (CONTROLLER_REGISTRARS 그대로 — 컨트롤러 신규 없음)
```

### 3-2. `DashboardIssueFetcher.js` (신규)

**왜 전용 페처인가**: `getProjectIssuesByFilter` 는 공통 경로라 수정 금지(F10)인데 `priority` 필드가 필요하다(F9). `fetchAllProjectIssues` 로 감싸면 priority 를 못 받는다. → `WorkAssignmentIssueFetcher` 와 같은 방식으로 **전용 1패스 페처를 새로 쓴다**.

```js
// 공개 API
export const MAX_INSIGHT_ISSUES = 2000;
export const getDashboardIssues = async ({ projectId, viewerId = null, as = 'user' })
  // → { issues: RawJiraIssue[], scanned: number, truncated: boolean }
export const invalidateDashboardIssues = () => {…}   // 테스트/명시적 초기화
```

- **JQL**: `moves_RMS_projectId = "${projectId}"` — 스코프는 JQL 술어가 담당(앱 커스텀필드를 fields로 되받지 않으므로 `fieldsByKeys` 불필요, `WorkAssignmentIssueFetcher.js:8` 근거). **Done 26주 창을 쓰지 않는다** — 대시보드는 전체 이슈 분포를 그려야 하므로 오래된 Done 이슈가 빠지면 상태분포·트리맵이 거짓이 된다.
- **fields**: `summary,timetracking,assignee,status,statusCategory,duedate,issuetype,priority`
  **properties**: `[MOVES_PROPERTY_KEY]` — coworkers 로 UNASSIGNED 판정(팀 관리형 지원, F: `IssuePropertyApi`)
  `customfield_10015`(시작일)는 **넣지 않는다** — 쓰는 위젯이 없다. 페이로드 절약.
- **페이징**: `maxResults=100` + `nextPageToken` do-while. `MAX_INSIGHT_ISSUES` 초과 시 중단하고 `truncated:true`.
- **컨텍스트**: `as:'user'` 고정 (asApp 지양).
- **모듈 스코프 Promise 캐시** — `ProjectParticipantFetcher.js` 패턴 그대로 복제:
  - TTL 60초, 엔트리 **1개만** 유지(메모리 상수 고정, 256MB 방어)
  - 키 `${viewerId}::${projectId}`, **viewerId 없으면 캐시 미사용**(가시 범위 혼입 방지 fail-safe)
  - **값이 아니라 Promise 를 담는다** (동시 invoke 첫 진입에서도 페치 1벌)
  - loader 실패는 캐시하지 않는다
  - ⚠ **KVS 캐시를 두지 않는다.** 근거: F4/F5 에서 확인했듯 progress·cost 의 KVS 10분 캐시는 issues 를 담지 못해 **Jira 왕복 절감이 0** 이었다. 같은 실수를 반복하지 않는다. 240KiB 상한상 2000건 issues 를 KVS에 담을 수도 없다.

### 3-3. `DashboardInsightService.js` (신규)

```js
export const getDashboardIssueInsightService = async ({ project_id, principal }) => { … }
```

처리 순서:

1. `project_id` 없으면 `LogicalError(500,"Internal Server Error","PROJECT_ID_REQUIRED")` (F20 — 이 도메인 3인자 형태)
2. **병렬 조달** (`Promise.all`)
   - `getSettingDataService()` → `hourRate`(기본 8), `progressThreshold`(기본 5) — KVS 1
   - `getPublicHolidayListService()` → holidaySet — KVS 0~1 (60초 사전 캐시)
   - `getSummaryDataService({ project_id })` → `start_date/end_date` — **MySQL 1**
     ⚠ `total_salary` 는 읽되 **응답에 싣지 않는다**(이 resolver 는 재무 축이 아니다)
   - `getDashboardIssues({ projectId: project_id, viewerId: principal?.accountId ?? null })` — **Jira ⌈N/100⌉**
3. `issuesNorm = raw.map(normalizeIssue)` — **`ProgressCalculator.normalizeIssue` 재사용**(F6)
4. 위젯용 평면화 `toInsightIssue(raw, norm, todayYmd, dueSoonDays)`
   - `normalizeIssue` 가 만들지 않는 `priorityName/priorityId/issueTypeName/statusColorName` 만 raw 에서 추가로 뽑는다
   - `plannedMd = norm.plannedSeconds != null ? round1(plannedSeconds/(hourRate*3600)) : null`
     `actualMd  = round1(actualSeconds/(hourRate*3600))`
     — **진척도 탭 `buildIssuesFromNorm` 과 동일 식**(`ProjectProgressService.js:165-166`)
   - `flags = computeQueueFlags({assignee, coworkers, dueDate, originalEstimateSeconds, remainingEstimateSeconds}, {todayYmd, dueSoonDays})` — done 이슈는 호출하지 않고 `[]`
   - `dDay  = computeDDay(dueDate, todayYmd)`
5. **집계 — 전부 순수 함수 재사용 (산식 복제 금지 요구 충족)**
   - `statusDistribution = computeStatusDistribution(issuesNorm, hourRate)`
   - `counts` — done/inProgress/todo 는 `statusDistribution.byCount` 를 그대로 쓴다(두 번 세지 않는다). overdue/dueSoon/unassigned/noEstimate 는 `flags` 카운트
   - `project.dDay` — `endDate` 와 `todayYmd` 로 계산(`computeDDay(endDate, todayYmd)` 재사용)
6. **metrics 게이팅** — `canReadReport(principal)` 이 false 면 이 블록을 **만들지도 않는다**(SalaryChartGate 관례: 계산조차 하지 않음)
   - `completion = computeCompletion(issuesNorm)`
   - `effortTotals = computeEffortTotals(issuesNorm, hourRate)`
   - `scheduleRate = computeScheduleRate(elapsedWorkDays, totalWorkDays)` — `getWorkdaysInRange(src/utils/workday.js)` 재사용, 진척도와 동일 경로
   - `diagnosis = computeDiagnosisRates(completion.rate, scheduleRate, effortRate)` + `diagnoseStatus(diff, progressThreshold)`
7. 반환 (§2-2 shape). `success` 는 `guardedDefine` 이 붙인다.

**Controller 등록**

```js
// ProjectDashboardController.js
guardedDefine(resolver, 'getDashboardIssueInsight',
    ({ payload, principal }) => getDashboardIssueInsightService({ ...payload, principal }));

guardedDefine(resolver, 'updateChartFilter',
    ({ payload }) => updateChartFilterService(payload));
```

> `principal` 전달은 **필수**다. 빠뜨리면 `canReadReport(principal)` 가 fail-close 로 항상 false 가 되어 metrics 가 조용히 사라진다 — `getChartDataById` 가 principal 을 넘기는 것과 같은 이유(`ProjectDashboardController.js:43-45`).

### 3-4. `src/permission/ReportAccess.js` (신규)

`CostAccess.js` 와 **문자 그대로 같은 형태**로 만든다(판정 단일 출처 원칙).

```js
export const REPORT_DENIED_REASON = 'REPORT_REQUIRED';
export const canReadReport = (principal) =>
    principal?.isAdmin === true || principal?.resourceMap?.REPORT?.read === true;
```

- `=== true` 엄격 비교(truthy 우회 차단), `principal` 누락 시 **fail-close**.
- ⚠ 이 판정을 서비스 안에 private 복사본으로 만들지 말 것(`CostAccess` 승격 선례 §16 C4).

### 3-5. PermissionMap 등록 (누락 시 런타임 `PERMISSION_UNMAPPED`)

```js
// ── ProjectDashboard (ProjectDashboardController, 10) ──  ← 주석의 개수도 갱신할 것
getDashboardIssueInsight: R('DASHBOARD', 'detail'),
updateChartFilter:        W('DASHBOARD', 'inherited'),
```

- `getProjectProgressSummary` / `getProjectCostSummary` 의 등록은 **변경하지 않는다**(§D5).
- 계약 테스트 `test/permission/permissionMap.contract.test.js` 가 등록집합↔맵키집합을 대조하므로 누락 시 즉시 실패한다.

### 3-6. 커스텀 필터 저장 경로 (M4)

**`src/rdb/query/ProjectDashboard.js`**
```js
INSERT: `INSERT INTO project_dashboard
   (dashboard_id, project_id, dashboard_title, chart_type, data_type, pos_x, pos_y, width, height, filter_json)
   VALUES (?, UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?)`,   // ← 10번째 추가
UPDATE_FILTER: `UPDATE project_dashboard SET filter_json = ? WHERE dashboard_id = ?`,
```
**`ProjectDashboardRepository.addChartDataRepository`** — params 배열 끝에 `chartData.filter ? JSON.stringify(chartData.filter) : null`

**`ProjectDashboardService.validateChart`** — 기존 검증 유지 + `if (chart.filter != null) chart.filter = validateFilterDef(chart.filter)`

**`validateFilterDef(filter)`** (신규 순수 함수, `DashboardInsightService.js` 또는 별도 `DashboardFilter.js`)
- `filter.v !== 1` → `LogicalError(500,"Internal Server Error","DASHBOARD_FILTER_INVALID")`
- 화이트리스트 키(`assignee,statusCategory,issueType,priority,due,estimate`)만 남기고 **나머지 키 제거**
- 각 배열 ≤20 항목, 각 문자열 ≤100자, `due` ∈ `{ANY,OVERDUE,DUE_SOON,NO_DUE}`, `estimate` ∈ `{ANY,HAS,NONE}`
- 위반 시 위 에러. **부분 통과 없음**(조용히 잘라 저장하면 사용자가 만든 것과 다른 필터가 남는다)

> ⚠ 이 검증은 **`addChart` 와 `updateChartFilter` 양쪽이 같은 함수를 호출**해야 한다. 한쪽만 검증하면 다른 경로로 우회된다(CLAUDE.md 「읽기↔쓰기 검증 대칭」).

### 3-7. 에러 케이스

| 상황 | 처리 | 코드 |
|---|---|---|
| `project_id` 누락 | throw | `PROJECT_ID_REQUIRED` |
| Jira 검색 실패 | **부분 폴백** — `{issues:[], scanned:0, truncated:false}` 반환 후 서비스는 빈 집계를 정상 응답으로 내보낸다(`WorkAssignmentIssueFetcher` 선례). 대시보드 전체가 깨지지 않게 | — |
| REPORT read 없음 | 예외 없음. `metrics` **키 미포함** | (프론트가 타일 미렌더) |
| PROJECT_COST read 없음 (비용 위젯) | 기존 `getProjectCostSummary` 가드가 `{success:false, error}` 반환 → 위젯이 안내 문구 | `PERMISSION_DENIED` |
| REPORT read 없음 (진척 추이 위젯) | 기존 `getProjectProgressSummary` 가드가 거부 → 위젯이 안내 문구 | `PERMISSION_DENIED` |
| FilterDef 불량 | throw | `DASHBOARD_FILTER_INVALID` |
| 프로젝트 미소속 | `guardedDefine` `project:'detail'` 이 차단 | `PERMISSION_PROJECT_SCOPE_DENIED` |

### 3-8. `src/index.js`

**변경 없음.** 신규 Controller 파일이 없고 기존 `registerProjectDashboardController` 안에 resolver 를 추가하므로 `CONTROLLER_REGISTRARS` 배열은 그대로다.

---

## 4. 프론트엔드 설계

### 4-1. 데이터 조달 — 공유 쿼리 1개

`static/ui/src/hooks/useDashboardInsight.js` (신규)

```js
export const useDashboardInsight = (projectId, { enabled = true } = {}) =>
  useQuery({
    queryKey: projectKeys.dashboardInsight(projectId),
    queryFn: () => invoke('getDashboardIssueInsight', { project_id: projectId }),
    enabled: enabled && !!projectId,
    staleTime: 1000 * 60 * 5,
    keepPreviousData: true,
  });
```

**이것이 비용 설계의 핵심이다.** `SummaryPanel` + `progressStatus` + `plannedVsActual` + `riskIssues` + `issueSize` + `customFilter` × m 개가 **전부 같은 쿼리키를 구독**하므로 TanStack Query 가 dedupe 하여 대시보드 진입당 `invoke` 는 **정확히 1회**다. 위젯을 몇 개 얹어도 늘지 않는다.

> ⚠ `coworkerFieldId` 를 인자로 넣지 **않는다**. 백엔드가 coworker 를 이슈 프로퍼티에서 읽으므로 불필요하고, 넣으면 `jiraKeys.coworkerField()` 선행 쿼리에 묶여 첫 렌더가 한 왕복 늦어진다.

### 4-2. `ChartTemplate.js` 수정 — 렌더러/소스 분기

현재 구조(단일 `getChartDataById` + `CHART_OPTION_MAP`)에 **분기 1개**를 도입한다.

```
ChartTemplate({item, project_id, coworkerFieldId})
  spec = WIDGET_SPEC[item.dataType] ?? WIDGET_SPEC_FALLBACK   // 미등록 dataType 방어
  ├ source==='chartDataById' → 기존 useQuery(projectKeys.dashboardItem(...))   ← 기존 코드 그대로
  ├ source==='issueInsight'  → useDashboardInsight(project_id)
  ├ source==='progress'      → useQuery(projectKeys.progress(project_id), invoke('getProjectProgressSummary',{projectId, coworkerFieldId}))
  └ source==='cost'          → useProjectCostSummary(project_id)               ← F17 준수, 새 invoke 금지

  renderer 분기
  ├ 'echart'    → <ECharts option={CHART_OPTION_MAP[chartType]({...data, t, isDark})}/>  + 기존 테이블 뷰
  ├ 'issueList' → <IssueListWidget .../>
  ├ 'sCurve'    → <ProgressSCurve data={progressData}/>       ← 기존 컴포넌트 무수정 재사용
  └ 'burnUp'    → <CostBurnUp data={costData}/>               ← 기존 컴포넌트 무수정 재사용
```

**변경 상세**
- `CHART_OPTION_MAP` 에 `treemap: treemapOption` 추가
- 옵션 함수 호출을 `optionFn({...chartData, t})` → `optionFn({...chartData, t, isDark})` 로 변경. `isDark = useColorMode()`.
  이유: treemap 은 `categoricalPalette(isDark)` 를 써야 다크 테마에서 색이 맞다(`chartPalette.js` 규약). 기존 5개 옵션 함수는 추가 인자를 무시하므로 **회귀 없음**.
- 기존 테이블 뷰(`head`/`rows` 하드코딩 분기)는 `renderer==='echart'` 인 경우에만 유지. `issueList`/`sCurve`/`burnUp` 은 각자 표를 갖고 있으므로 `EchartPanel` 의 `showToggle={false}`.
- `spec.requires` 가 있고 `!canRead(spec.requires)` 이거나 응답이 `{success:false}` / `{denied:true}` 면 **위젯 본문에 안내 문구**를 그린다(대시보드 전체를 깨지 않는다 — F16 규약).
- `metrics` 를 쓰는 위젯(`plannedVsActual`)은 `'metrics' in data` 가 false 면 같은 안내 문구.

### 4-3. 신규 위젯 컴포넌트

**`IssueListWidget.jsx`** (M2, `riskIssues` · `customFilter` 공용)
- 입력: `{ insight, mode: 'risk'|'filter', filter }`
- `mode==='risk'`: `insight.issues` 에서 `flags.includes('OVERDUE') || flags.includes('DUE_SOON')` 필터 → `sortQueueItems` 와 동일 우선순위(OVERDUE → DUE_SOON → dueDate asc → key asc)로 정렬
  - **프론트에 정렬 로직을 복제하지 말 것.** `WorkAssignmentRules.sortQueueItems` 는 백엔드 모듈이므로, 프론트는 이미 존재하는 미러(`static/ui/src/pages/.../queueFlags.js`)가 있으면 그것을, 없으면 **정렬을 서버가 해서 보내는 순서 그대로** 쓴다.
    → **결정: 서버가 `issues[]` 를 이미 정렬해 보낸다** (§3-3 5단계 뒤에 `sortQueueItems` 적용). 프론트는 필터만 한다.
- `mode==='filter'`: `applyFilterDef(insight.issues, filter, myAccountId)` (신규 순수 함수, `utils/dashboardFilter.js`)
- 컬럼: 이슈키(`IssueComponent`) · 요약 · 상태(`StatusComponent`) · 담당자 · 기한 · D-day 배지
- 테이블은 `components/table/CommonTable` 재사용. 헤더 우측에 **건수 배지**(`{n}건`)
- 행 클릭 = `IssueComponent` 의 `router.open` (F18). `window.open` 금지
- 빈 결과: `components/chart/EmptyState`

**`StatusDistributionWidget`/`PlannedVsActualWidget`/`IssueTreemapWidget`** — 실제로는 `renderer:'echart'` 이므로 별도 컴포넌트가 아니라 **`chartData` 어댑터 함수**다. `ChartTemplate` 이 `insight` → 차트 데이터로 변환한다:

```js
// utils/dashboardInsightAdapters.js (신규)
toStatusDistributionChartData(insight, chartType, mode /* 'byCount'|'byEffort' */)
   → pie:  { data:[{name,value}] } / bar: { categories:[], seriesData:[{data:[]}] }   ← 기존 formatChartData 형태와 동일
toPlannedVsActualChartData(insight)
   → { categories:['계획','실적'], seriesData:[{data:[plannedTotalMd, actualTotalMd]}] }
toTreemapData(insight, basis /* 'actual'|'planned' */)
   → { nodes:[{name: issueTypeName, children:[{name:`${key} ${summary}`, value, key}]}], excludedCount }
```

> 어댑터를 프론트에 두는 이유: `insight` 응답을 서버에서 위젯 형태별로 가공하면 위젯이 늘 때마다 서버 응답 shape 이 부풀고 계약이 흔들린다. **서버는 정규 데이터 1벌, 프론트는 표현 변환**으로 경계를 고정한다.

**`treemapOption.js`** (신규, `components/chart/echart/options/`)
- 2단 트리맵: `issuetype` → `issue`. 근거 §D4
- 색: `categoricalPalette(isDark)` — 상위 노드(issuetype) 인덱스로 색 배정, 하위는 명도 변주(`visualMin/visualMax` 대신 `colorSaturation`)
- `tooltip.formatter` 에 `${key} ${summary} · ${value} MD` + 계획 기준일 땐 단위 명시
- `label.show` 는 상위 레벨만, `upperLabel` 로 issuetype 헤더
- **`t` 를 받아 라벨을 번역**한다(옵션 함수 시그니처 관례)

### 4-4. `SummaryPanel.jsx` 수정 — KPI 3타일 추가

기존 3타일(인원·기간·인건비)은 **그대로 두고** `useDashboardInsight` 를 추가 구독한다.

| 타일 | 값 | 출처 | 조건부 렌더 |
|---|---|---|---|
| 진척률 | `metrics.completionRate` → `62.0%` | insight | `'metrics' in insight` 일 때만 |
| 남은 기간 | `project.dDay` → `D-48` / `D+12`(초과, danger 색) / `-`(기간 미설정) | insight | 항상 |
| 지연 이슈 | `counts.overdue` → `23건` (0 초과면 `valueColor=danger`) | insight | 항상 |

- 타일 개수는 현재 `tileCount` 계산식(2 또는 3)을 **동적 배열 length** 로 바꾼다. `total_salary` 부재 로직은 **손대지 않는다**(RFC-163 규약 유지).
- 로딩 중에는 기존과 동일하게 `"..."` 를 넣는다. **`?? 0` 금지** — `metrics` 부재와 로딩 중은 다르다.
- ⚠ 그리드가 최대 6타일이 되므로 `SUMMARY_ITEM` 의 `h:2` 를 `h:3` 으로 올리고 `repeat(auto-fit, minmax(180px,1fr))` 로 바꾼다(좁은 화면에서 2줄로 접힘).

### 4-5. `AddChartModal.jsx` 수정

1. **권한 필터 일반화** — 현재 salary 하드코딩(`allowSalaryWidget`)을 `WIDGET_SPEC[key].requires` 기반 공통 술어로 바꾼다.
   ```js
   const isAllowed = (dataType) => {
       const req = WIDGET_SPEC[dataType]?.requires;
       if (req === 'PROJECT_COST') return canRead('PROJECT_COST') && !isLevelBand;  // 기존 salary 규칙 보존
       if (req) return canRead(req);
       return true;
   };
   ```
   ⚠ `salary` 의 `isLevelBand` 조건은 **반드시 보존**한다. 일반화하면서 빠뜨리면 LEVEL_BAND 설치에서 만들 수 없는 위젯이 다시 노출된다.
   ⚠ 이것은 **UX 일 뿐**이고 실차단은 서버다(기존 주석 유지).
2. **`heavy` 배지** — `heavy:true` 위젯 카드에 "조회가 무거움" 태그 + 툴팁(`dashboard.modal.heavyHint`)
3. **필터 빌더** — `dataType === 'customFilter'` 선택 시 `<FilterBuilder/>` 노출. 제출 시 `submit({type:'custom', value:{dataType, chartType, chartName, filter}})`
4. **기본 크기** — `DashboardPage.handleAddChart.createItem` 이 `w:4,h:5` 하드코딩인데, `WIDGET_SPEC[dataType].defaultSize` 를 쓰도록 바꾼다. 목록/트리맵/S-curve 가 4×5 에 들어가면 읽을 수 없다.
5. **템플릿 다중 차트 크기** — 템플릿 항목별로 `defaultSize` 를 쓰고 `x` 배치를 누적 폭 기준으로 계산한다(현재 `(idx*4)%12` 고정 → 폭이 다른 위젯이 섞이면 겹친다).

**`FilterBuilder.jsx`** (신규)
- 담당자: `ProjectUserSelect`(기존 컴포넌트) 재사용 + "나" 칩(`__ME__`)
- 상태: 세그먼트 3개(할 일/진행 중/완료) 다중 선택
- 이슈 타입 · 우선순위: `insight.issues` 에서 **실제 등장하는 값만** 추려 옵션 생성 → 없는 값을 고를 수 없다(빈 결과 방지, 추가 조회 0)
- 기한: 라디오 4(전체/기한초과/7일 이내/기한없음)
- 산정: 라디오 3(전체/있음/없음)
- 하단에 **실시간 매칭 건수 미리보기** — `insight` 가 이미 클라이언트에 있으므로 서버 왕복 없이 즉시 표시. 이 UX가 구조화 필터를 택한 실질 이득이다(§D6)

### 4-6. 쿼리키 팩토리 추가

`static/ui/src/utils/queryKey/projectKeys.js`
```js
dashboardInsight: (projectId) => ['dashboardInsight', projectId],
```
- **인라인 키 금지** — `queryKeyContract.test.js` 가 계약을 검사한다.
- 무효화: 필터 저장·차트 추가/삭제 후 `dashboardInfo` 와 함께 무효화할 필요는 **없다**(insight 는 차트 구성과 무관한 이슈 데이터). 수동 새로고침(`ChartCard.onRefresh`)은 `dashboardInsight` 도 대상에 포함시킨다.

### 4-7. Zustand 스토어

**변경 없음.** `usePermissionStore.canRead` 를 읽기만 한다. 새 스토어를 만들지 않는다.

### 4-8. 로딩 표현

- 신규 위젯은 전부 `ChartCard` 의 `isLoading` + `skeleton="chart"|"table"` 을 쓴다(스피너 금지, RFC-178).
- ⚠ `DashboardPage.jsx:248` · `ChartTemplate.js:266` 의 기존 `LoadingBar` 잔존은 **이번 범위에서 건드리지 않는다**. 스켈레톤 전환은 별건(범위 비대 방지). 단 **신규 위젯에는 `LoadingBar` 를 쓰지 않는다**.

---

## 5. DB 설계

### 5-1. `project_dashboard` 컬럼 추가 (M4 전용)

**`src/rdb/schema/ddl/project.sql.js`** 에 추가
```js
/**
 * 커스텀 필터 위젯(FilterDef v1) 저장. NULL = 필터 없는 기존 위젯(하위호환).
 * JSON 을 쓰는 이유: 축이 6개이고 각각 배열이라 정규화하면 조인 테이블이 생기는데,
 * 조회는 항상 "이 위젯의 필터 전체"라 부분 질의가 필요 없다. portfolio_project_snapshot 의
 * members_json/monthly_effort_json 과 같은 판단이다.
 */
export const ALTER_PROJECT_DASHBOARD_ADD_FILTER_JSON = `
    ALTER TABLE project_dashboard
    ADD COLUMN IF NOT EXISTS filter_json JSON NULL
`;
```

**`src/rdb/schema/ddl/index.js`** — re-export 추가
**`src/rdb/schema/migrate.js`** — 체인 **맨 끝**에
```js
.enqueue('v018_alter_project_dashboard_add_filter_json', ALTER_PROJECT_DASHBOARD_ADD_FILTER_JSON)
```
- 최신 번호가 v017 이므로 v018. **이름은 배포 후 절대 변경 금지**(재실행됨).
- `CREATE TABLE` 본문은 건드리지 않는다(v015/v017 관례). 신규 설치는 CREATE→ALTER 순으로 둘 다 실행돼 결과가 같다.

**⚠ 배포 순서 리스크 (구현자가 반드시 인지할 것)**
`TableReadiness.js` 는 테이블 **존재**만 프로브하고 **컬럼 단위 프로브가 없다**. 마이그레이션이 돌기 전에 10컬럼 `INSERT` 가 실행되면 `addChart` 가 실패한다.
- 마이그레이션 실행 경로: `scheduledTrigger init-db`(**interval: hour**) + `on-install`/`on-upgrade` 트리거.
- `forge deploy` 후 `avi:forge:upgraded:app` 이 즉시 발화하므로 실질 노출 창은 짧지만 0은 아니다.
- **대응**: M4 배포 후 `addChart` 로 커스텀 필터 위젯 1건을 실제로 만들어 보고 성공을 확인한 뒤 사용자에게 공지한다. 조회(`getChartInfo`)는 `SELECT *`(F19)라 컬럼 부재 시에도 실패하지 않으므로 읽기 회귀는 없다.

### 5-2. KVS

**변경 없음.** 신규 엔티티도, 신규 속성도 없다 → `manifest.yml` 의 `app.storage.entities` 수정 불필요, 422 semantic error 위험 없음.

### 5-3. 신규 스냅샷 테이블

**만들지 않는다.** 근거 §D2.

---

## 6. 핵심 설계 결정 (근거)

### D1. 진척률 KPI 는 진척도 탭과 어떻게 같은 숫자가 되는가

요구 #1의 "숫자가 탭과 다르면 신뢰 붕괴"에 대한 답.

**같은 순수 함수 · 같은 입력을 쓴다.**
- 산식: `ProgressCalculator.computeCompletion(issuesNorm)` — 진척도 탭이 쓰는 바로 그 함수(F6)
- 입력: `normalizeIssue(rawIssue)` — 진척도 탭이 쓰는 바로 그 정규화 함수
- 원천 필드: `timetracking.originalEstimateSeconds` / `timeSpentSeconds` / `statusCategory.key` — 동일
- `hourRate`: `getSettingDataService()` 동일 출처
- 일정 진척률: `getWorkdaysInRange(src/utils/workday.js)` + `computeScheduleRate` 동일

**남는 차이 1가지 (알려진 한계, 문서화 필요)**
진척도 탭은 `fetchAllProjectIssues`(`ORDER BY created DESC`, 전량)를, insight 는 자체 페처(정렬 없음, 전량, 캡 2000)를 쓴다. **모집단이 같으므로 집계는 동일**하다. 단 이슈가 2000건을 넘으면 insight 만 `truncated` 로 잘려 진척률이 갈린다.
→ **대응**: `truncated:true` 면 프론트가 진척률 타일에 경고 아이콘 + `dashboard.kpi.truncatedWarn` 툴팁을 붙인다. 조용히 다른 숫자를 보여주지 않는다.

### D2. 진척률 추이 — 산출 가능성 판정

**판정 요약**

| 요구된 것 | 판정 | 근거 | 제공 방식 |
|---|---|---|---|
| **완성 진척률(completion.rate)의 일별 추이** | ❌ **산출 불가** | 이슈 상태전이 이력이 없다(F3). 포트폴리오 스냅샷도 progress 를 덮어써 과거값이 없다(F1) | 제공하지 않음 |
| **공수(MD) 누적 추이 = S-curve** | ✅ **산출 가능, 신규 개발 불필요** | 계획선은 `generatePlanLine`(영업일 선형, 페치 0), 실적선은 워크로그 일별 누적(F2). 진척도 탭에 이미 구현·검증돼 있다 | **`progressTrend` 위젯 = `ProgressSCurve` 컴포넌트 + `getProjectProgressSummary` 재사용** |
| 대체안 — 현재 시점 진척 구성 | ✅ | `statusDistribution.byEffort`(MD 기준) | **`progressStatus` 위젯의 "공수 기준" 토글** (M1, 비용 0) |

**새 스냅샷 스케줄러는 신설하지 않는다.** 비용을 명시하면:
- 필요한 것: `(project_id, snapshot_date)` PK 신규 테이블 + DDL + 마이그레이션 + 일 1회 전 프로젝트 진척 재계산 배치
- 배치 비용: 프로젝트당 `1 + ⌈N/100⌉ + E` Jira 왕복 × 전 프로젝트. 기존 `runPortfolioSnapshot`(`interval: day`, `timeoutSeconds:600`, `PROJECT_CONCURRENCY:2`)에 얹으면 타임아웃 여유를 잠식한다
- 데이터가 쌓이기 전(설치 직후 ~수주)에는 차트가 비어 사용자에게는 "고장난 위젯"으로 보인다
- **결론: 얻는 것(완성률 일별선)이 S-curve 로 대체 가능한 데 비해 비용·리스크가 크다. 최후 수단으로 남기고 이번 범위에서 제외.**
  후속 RFC 후보로 "진척 이력 테이블" 을 §9 미래 확장에 기록한다.

### D3. `getChartDataById` 확장 vs 신규 resolver — **신규 resolver**

기존 `getChartDataById` 는 **위젯 1개당 invoke 1회** 구조다(`ChartTemplate.js:59-81`, 쿼리키에 `item.i` 포함).
신규 위젯 5종은 전부 **같은 이슈 배열**이 필요하다.

| 방식 | 대시보드 진입 Jira 왕복 (위젯 k개, N=500 기준) | 판정 |
|---|---|---|
| (A) `getChartDataById` 에 case 추가 | `k × ⌈N/100⌉` = 5개 위젯이면 **25회** (직렬 페이지 루프라 지연이 선형 누적) | ❌ |
| (B) (A) + 모듈 스코프 캐시 | Forge 는 인스턴스가 여러 개라 **적중이 확률적**. 최악 25회 | ❌ 결정적이지 않음 |
| (C) **신규 `getDashboardIssueInsight` + 프론트 공유 쿼리키** | **5회** (위젯 수와 무관). TanStack Query dedupe 는 인스턴스와 무관하게 결정적 | ✅ |

**(C) 채택.** 부수 효과로 커스텀 필터가 서버 왕복 없이 즉시 반응하는 UX 이득까지 얻는다(§D6).
(B)의 모듈 캐시는 **버리지 않고 함께 둔다** — 위젯 새로고침·탭 재진입 같은 반복 invoke 를 60초 흡수한다. 단 그것을 1차 방어선으로 삼지는 않는다.

**대가(정직하게 기록)**: 대시보드 위젯이 두 가지 데이터 조달 경로를 갖게 된다. 이를 흩뜨리지 않으려고 `WIDGET_SPEC` 레지스트리(§2-3)를 단일 확장점으로 둔다. 신규 위젯 추가 시 손대는 파일은 레지스트리 1개 + (필요 시) 어댑터 1개다.

### D4. 트리맵 크기 기준 — **기본 = 실투입(actualMd), 토글로 계획(plannedMd) 제공**

| 기준 | 채택 여부 | 근거 |
|---|---|---|
| **실투입 `actualMd`** (`timetracking.timeSpentSeconds`) | ✅ **기본** | ① 사용자 원문의 "디스크 usage" 은유는 **실제로 차지한 양**이다. 계획은 "차지할 예정"이지 usage 가 아니다. ② `timeSpentSeconds` 는 값이 없으면 0으로 항상 숫자다. ③ 진척도 탭이 `plannedMd == null` 을 "완성률 측정불가"로 따로 처리할 만큼 **계획 미입력이 흔하다**(`ProgressRiskTable.jsx:27-29`) — 계획 기준을 기본으로 하면 상당수 프로젝트에서 트리맵이 텅 빈다 |
| 계획 `plannedMd` | ✅ **토글** | 데이터가 같은 응답에 **이미 둘 다 실려 있다**. 토글은 클라이언트 재계산이라 **추가 페치 0** — 과설계가 아니라 공짜다 |
| 둘 다 동시 표시(면적=계획, 색=실투입/계획) | ❌ | 한 그림에서 두 축을 읽게 하면 "가장 큰 이슈"라는 원래 질문이 흐려진다. 과설계 |

**0 / null 처리 규칙 (양 기준 공통)**
- 값이 `null` 이거나 `<= 0` 인 이슈는 **트리맵에서 제외**한다. ECharts treemap 에서 0 노드는 렌더되지 않거나 좌표가 붕괴한다.
- 제외 건수를 `excludedCount` 로 세어 위젯 하단에 캡션으로 표시: `계획 미입력·미투입 {n}건 제외`.
  **조용히 빼지 않는다** — "내 이슈가 왜 안 보이지"가 반복된다.
- 전부 제외되어 노드가 0개면 `EmptyState` + 안내(`dashboard.treemap.allExcluded`).

**계층 = `issuetype` → `issue` 2단**
- 1단 평면이면 이슈 수백 개가 좁쌀이 되어 "가장 큰 이슈"를 못 읽는다.
- `issuetype` 은 이미 fields 에 있고 카디널리티가 낮아(보통 3~6) 상위 블록이 안정적이다.
- `assignee` 를 상위로 두는 안은 기각: 담당자 미배정 이슈가 큰 블록을 만들고, 담당자 분포는 이미 `assignee` 위젯이 있다.

### D5. 권한 경계 — "가드 통과 ≠ 데이터 범위 확정" 적용

**시드 기본값**(F15): `DASHBOARD` member read=**true**, `REPORT` member read=**true**, `PROJECT_COST` member read=**false**.
문제는 관리자가 REPORT 를 회수하고 DASHBOARD 만 남긴 설치다. 그때 대시보드 위젯이 분석 리포트 데이터를 그대로 내보내면 **형제 resolver 우회**가 된다(CLAUDE.md 「동일 데이터 다중 경로」).

**결정한 경계**

| 데이터 | 게이트 | 근거 |
|---|---|---|
| `issues[]`(상태·기한·담당자·개별 MD), `counts`, `statusDistribution` | `DASHBOARD read` 만 | 이 값들은 **Jira 에서 asUser 로 이슈를 보면 그대로 보이는 것**이다. 앱이 게이트키퍼가 아니다. 여기에 자물쇠를 다는 것은 연극이다 |
| `metrics`(완성률·일정률·diff·진단상태·계획/실적 총 MD) | `DASHBOARD read` **AND** `REPORT read` | 이건 **진척도 탭이 소유한 판단 지표**다. REPORT 를 회수한 설치에서 대시보드로 새어나가면 안 된다 |
| 진척 추이(S-curve) 위젯 | 기존 `getProjectProgressSummary` 가드(`REPORT read`) 그대로 | **PermissionMap 을 넓히지 않는다.** 넓히면 DASHBOARD-only 사용자가 진척도 탭 데이터 전체를 받게 되는데, 그게 정확히 막으려는 것이다 |
| 비용 소진 위젯 | 기존 `getProjectCostSummary` 가드(`PROJECT_COST read`) 그대로 | 동일 |

**구현 규약**
- `metrics` 는 `canReadReport(principal)` 이 false 면 **계산하지도 않고 키를 빼서** 반환한다. `null` 이나 `0` 을 넣지 않는다(`total_salary` 선례).
- `principal` 이 없으면 **fail-close**(= metrics 제거). Controller 가 `principal` 전달을 빠뜨려도 조용히 열리지 않는다.
- 프론트 `AddChartModal` 의 필터는 **UX 일 뿐**이다. 서버가 최종 판정이라는 기존 주석 규약을 유지한다.

**알려진 잔여 노출 (수용, 문서화)**
`issues[].plannedMd`/`actualMd` 를 합치면 `metrics.plannedTotalMd`/`actualTotalMd` 를 클라이언트에서 역산할 수 있다. 완성률(가중 평균)도 마찬가지다.
→ 게이트를 유지하는 이유는 **기본 UI 에서 그 지표를 보여주지 않기 위해서**이고, 원시 이슈 데이터는 어차피 Jira 권한으로 열려 있으므로 이 잔여 노출은 **의도적으로 수용**한다. 완전 차단을 원하면 `issues[]` 자체를 REPORT 뒤로 옮겨야 하는데, 그러면 지연 목록·트리맵까지 REPORT 가 필요해져 위젯 대부분이 죽는다.

### D6. 커스텀 필터 — **구조화 필터 빌더** (원문 JQL 기각)

| 축 | 원문 JQL | 구조화 빌더 | 판정 |
|---|---|---|---|
| **보안** | 프로젝트 범위를 `moves_RMS_projectId="X" AND (userJql)` 로 감싸도 **탈출 가능**하다. `SubscriptionJqlBuilder.js:82-87` 이 이미 밟은 문제: `status = Done) OR (project = 10002` 형태로 괄호를 깨면 스코프 술어가 OR 밖으로 밀려난다. 방어하려면 괄호 균형·`ORDER BY`·컨텍스트 함수 검증(`validateExtraJql` 241줄 상당)을 이식해야 하고, 그래도 완전하지 않다 | 서버가 술어를 조립하지 않는다. **필터는 이미 받아온 이슈 배열에 적용될 뿐**이라 스코프 탈출 개념 자체가 없다 | **빌더** |
| **비용** | 위젯마다 자기 JQL 검색이 필요 → 필터 위젯 m 개면 **+m × ⌈M/100⌉ Jira 왕복**. 필터를 고칠 때마다 재조회 | `insight.issues` 를 클라이언트에서 필터 → **추가 왕복 0**, 필터 변경도 즉시 | **빌더** |
| **UX** | JQL 을 아는 사용자만 쓴다. 오타 시 에러 메시지가 Jira 원문이라 해독 불가 | 드롭다운 선택. **매칭 건수 실시간 미리보기**가 공짜로 된다(데이터가 이미 손에 있으므로) | **빌더** |
| 표현력 | 높다 | 6축으로 제한 | 원문 JQL 우세 — 하지만 사용자가 든 예시("내가 담당자인 버그", "우선순위 High")는 **6축으로 전부 표현된다** |

**v1 범위 (자른 선)**
- ✅ 축 6개: 담당자(+`__ME__`) · 상태 카테고리 · 이슈 타입 · 우선순위 · 기한(4택1) · 산정 유무(3택1)
- ✅ 표시 형태: **목록 + 헤더 건수 배지** (`riskIssues` 와 렌더러 공유 — 구현 비용 거의 0)
- ✅ 저장: `project_dashboard.filter_json`
- ✅ 편집: `updateChartFilter`

**v1 에서 하지 않는 것 (명시적 제외)**
| 하지 않는 것 | 이유 |
|---|---|
| 원문 JQL 입력 | 위 표. 필요해지면 §9 |
| 라벨·컴포넌트·스프린트·버전 필터 | 페처 fields 확장이 필요하고 페이로드가 커진다. 요청에 없다 |
| 날짜 범위 직접 입력(생성일/수정일) | `insight` 에 해당 필드가 없다. 축을 늘리려면 fields 확장 |
| 필터 결과를 차트(분포)로 보기 | 목록으로 충분. 분포가 필요하면 `progressStatus` 위젯이 있다 |
| 필터 프리셋 공유·즐겨찾기 | 대시보드 위젯 자체가 저장 단위다 |
| 여러 프로젝트 교차 필터 | 이 대시보드는 단일 프로젝트 스코프다 |

### D7. 호출 비용 — 수치

기호: `N` = 프로젝트 이슈 수, `E` = 인라인 워크로그(보통 20건)를 초과하는 이슈 수.

**위젯별 한계 비용 (대시보드 진입 1회 기준)**

| 위젯 / 구성 | Jira REST | MySQL | KVS | 비고 |
|---|---|---|---|---|
| 기존 SummaryPanel | 0 | 1 | 1~2 | 현행 |
| 기존 `assignee`/`issue` 위젯 (합) | `⌈N/100⌉` | 0 | 0 | 60초 모듈 캐시 공유 |
| **`getDashboardIssueInsight` (M1~M2·M4 전 위젯 공용)** | **`⌈N/100⌉`** | **1** | **1~2** | 위젯 수와 **무관**. 60초 모듈 캐시 |
| `progressTrend` 위젯 1개 (M3) | **`1 + ⌈N/100⌉ + E`** | 1 | 3~4 | F4 — KVS 캐시로 줄지 않음 |
| `costBurnUp` 위젯 1개 (M3) | **`1 + ⌈N/100⌉ + E`** | 2 | 4~5 | F5 |

**시나리오별 합계 (직렬 페이지 루프라 지연은 왕복 수에 거의 선형)**

| 시나리오 | N=200, E=10 | N=500, E=30 | N=2000, E=100 |
|---|---|---|---|
| 현행 대시보드(assignee+issue) | 2 | 5 | 20 |
| **M1+M2+M4 전부 얹음 (신규 위젯 6개)** | **2 + 2 = 4** | **5 + 5 = 10** | **20 + 20 = 40** |
| + `progressTrend` 추가 | 4 + 13 = **17** | 10 + 36 = **46** | 40 + 121 = **161** |
| + `costBurnUp` 까지 추가 | 17 + 13 = **30** | 46 + 36 = **82** | 161 + 121 = **282** |

**해석과 대응**
- **M1·M2·M4 는 현행 대시보드 대비 왕복이 2배가 되는 선에서 멈춘다** (insight 1패스가 추가될 뿐). 이슈 2000건에서 20→40회. 수용 가능.
- **M3 두 위젯이 지배적 비용이다.** 이건 신규 결함이 아니라 **진척도 탭·비용 탭의 기존 비용을 대시보드로 끌어온 것**이며, 그 캐시가 Jira 왕복을 못 줄인다는 구조적 문제(F4/F5)에서 온다. 감사 항목 A-2(진척·비용 캐시 재설계)가 해결하기 전에는 개선할 수 없다.
- **대응**:
  1. `WIDGET_SPEC.heavy:true` → AddChartModal 에 "조회가 무거움" 배지. 사용자가 알고 얹게 한다.
  2. M3 위젯을 **기본 템플릿에서 제외**한다(§7 템플릿 설계). 별도 "일정·비용 심층" 템플릿으로 분리.
  3. `progressTrend` 는 `projectKeys.progress(project_id)` 를 **진척도 탭과 공유**하므로, 사용자가 그 탭을 먼저 봤다면 5분간 공짜다. 마찬가지로 `costBurnUp` 은 비용 탭·팀 분석 탭과 `projectKeys.cost` 를 공유한다.
  4. `truncated` 상한(2000)으로 최악값이 무한히 커지지 않게 묶는다.

**메모리(256MB)**: insight 응답은 이슈 1건당 대략 200~250B(JSON). 2000건 ≈ 400~500KB. 서버 측 raw Jira 이슈 배열은 그보다 크지만 페이지 단위로 필요한 필드만 남겨 누적한다. 모듈 캐시는 **엔트리 1개 고정**이라 상주 메모리가 상수로 묶인다.

### D8. 모듈 분할

요구사항 권고안(M1 KPI+상태분포+지연목록 → M2 트리맵+계획대비실적 → M3 추이+비용 → M4 필터+템플릿)을 **한 군데만 바꾼다**: 지연 목록을 M1→M2 로, 계획대비실적을 M2→M1 로 옮긴다.

**근거**: M1 은 "insight 인프라를 세우고 그것으로 기존 렌더러(`echart`)만 써서 검증"하는 단계여야 한다. 지연 목록은 **신규 렌더러(`issueList`)** 를 요구하므로 M1 에 넣으면 인프라 결함과 렌더러 결함이 섞여 원인 분리가 어렵다. 계획대비실적은 기존 `bar` 옵션을 그대로 쓰므로 M1 에 적합하다.

| 모듈 | 범위 | 신규 렌더러 | DB | 독립 배포 | 검증 초점 |
|---|---|---|---|---|---|
| **M1** | `getDashboardIssueInsight` + `DashboardIssueFetcher` + `ReportAccess` + `WIDGET_SPEC` 레지스트리 + `useDashboardInsight` + **KPI 3타일** + `progressStatus` + `plannedVsActual` | 없음 (`echart` 재사용) | 없음 | ✅ | 진척률이 진척도 탭과 **동일한지 실측 비교**. `metrics` 게이팅(REPORT 회수 시 타일 사라짐). 위젯 k개 얹어도 invoke 1회인지 네트워크 탭 확인 |
| **M2** | `issueList` 렌더러 + `riskIssues` 위젯 + `treemapOption` + `issueSize` 위젯 | `issueList` | 없음 | ✅ (M1 선행 필요 — 같은 응답의 다른 슬라이스) | 백지 차트 함정(F12) 회피 확인. 트리맵 제외 건수 캡션. 이슈 링크 `router.open` 동작 |
| **M3** | `sCurve`·`burnUp` 렌더러 + `progressTrend`·`costBurnUp` 위젯 + heavy 배지 | `sCurve`, `burnUp` | 없음 | ✅ (M1 선행 — 레지스트리) | **권한 회귀**: REPORT/PROJECT_COST 회수 시 위젯이 안내 문구를 내고 대시보드가 깨지지 않는지. `useProjectCostSummary` 훅 재사용(F17 가드 테스트 통과) |
| **M4** | DDL v018 + `filter_json` + `updateChartFilter` + `FilterBuilder` + `customFilter` 위젯 + **템플릿 개편** | 없음 (M2의 `issueList` 재사용) | **✅ v018** | ✅ (M1·M2 선행) | 마이그레이션 후 `addChart` 성공 확인(§5-1 리스크). FilterDef 검증이 add/update 양쪽 대칭인지 |

**병행 작업 주의**: `work-bulk-apply` 가 `pages/projectDetail/issue/`, `gantt/useGanttMutations.js`, `utils/useJiraUserInfos.js`, `locales/kr|en/projectDetail.json` 을 수정 중이다.
- 본 설계의 프론트 변경은 `pages/projectDetail/dashboard/` · `components/chart/` · `constants/` · `hooks/` 로 **파일 충돌이 없다**.
- i18n 은 `dashboard.json` · `chartOptions.json` 에만 손대므로 `projectDetail.json` 과 충돌하지 않는다.
- 단 **`npm run merge` 산출물(`ko-KR.json`/`en-US.json`)은 공유 파일**이다. 두 작업이 동시에 merge 하면 충돌한다 → 리더가 merge 실행 시점을 조율할 것.

---

## 7. 템플릿 강화 설계 (요구 #7)

`constants/dashboardTypes.js` 의 `TEMPLATES(t)` 를 개편한다. 각 차트 항목에 `size` 를 추가한다(§4-5 #4·#5).

| 키 | 라벨 | 구성 | 게이트 | 비고 |
|---|---|---|---|---|
| `health` **(신규·기본 추천 1순위)** | 프로젝트 건강 | `progressStatus`(pie, 4×5) + `riskIssues`(issueList, 6×7) + `plannedVsActual`(bar, 4×5) | `plannedVsActual` 만 REPORT | **M3 위젯 없음 → 가볍다.** insight 1패스로 3위젯 |
| `scale` **(신규)** | 작업 규모 | `issueSize`(treemap, 6×7) + `progressStatus`(bar, 4×5) | 없음 | insight 공유 |
| `deepDive` **(신규)** | 일정·비용 심층 | `progressTrend`(sCurve, 8×7) + `costBurnUp`(burnUp, 6×6) | REPORT + PROJECT_COST | **heavy 배지.** 두 위젯 모두 조건 미충족이면 템플릿 자체를 숨긴다 |
| `workforce` (기존 유지) | 인력 분석 | role(pie) + level(pie) | 없음 | 변경 없음 |
| `issue` (기존 개편) | 업무 분포 | issue(pie) + **assignee(pie) 추가** | 없음 | 기존 1차트는 템플릿이라 부르기 빈약했다 |
| `salary` (기존 유지) | 비용 분석 | salary(bar) | PROJECT_COST + !LEVEL_BAND | **기존 게이팅 로직 그대로**(§4-5 #1 경고) |

**템플릿 게이트 규칙**: 템플릿에 포함된 차트 중 `requires` 를 만족하지 못하는 것이 있으면
- 만족하는 차트가 1개 이상 남으면 → **그 차트들만 생성**하고 템플릿은 노출
- 전부 불만족이면 → 템플릿 카드 자체를 숨김 (기존 `salary` 템플릿 동작과 동일한 결과)

---

## 8. i18n 키 목록

`locales/kr/*.json` + `locales/en/*.json` 에 추가 후 `cd static/ui && npm run merge`.
(⚠ `locales/ko-KR.json`·`en-US.json` 직접 수정 금지. `locales/script/*.json` 은 빈 스텁이라 넣어도 반영 안 됨.)

### 8-1. `locales/kr/dashboard.json` (기존 파일에 병합)

```jsonc
{
  "summaryPanel": {
    "title": {
      "progress": "진척률",              // en: "Progress"
      "dday": "남은 기간",                // en: "Remaining"
      "overdue": "지연 이슈"              // en: "Overdue issues"
    },
    "dday": {
      "remain": "D-{days}",              // en 동일
      "over": "D+{days}",
      "none": "기간 미설정",              // en: "No period set"
      "today": "D-Day"
    },
    "count": "건",                        // en: ""  ← 영문은 접미사 없음. 포맷터에서 분기
    "truncatedWarn": "이슈가 {max}건을 넘어 일부만 집계했습니다. 실제 값은 더 큽니다."
                                          // en: "Only the first {max} issues were counted. Actual values are higher."
  },

  "insight": {
    "error": "대시보드 데이터를 불러오지 못했습니다.",
    "empty": "집계할 이슈가 없습니다.",
    "asOf": "기준 {time}",
    "truncated": "이슈 {max}건까지만 집계됨"
  },

  "widget": {
    "denied": {
      "REPORT": "이 위젯은 분석 리포트 열람 권한이 필요합니다.",
      "PROJECT_COST": "이 위젯은 비용 열람 권한이 필요합니다.",
      "SALARY_POLICY_LEVEL_BAND": "급여 정책이 등급 밴드로 설정되어 개인 급여 위젯을 표시할 수 없습니다."
    },
    "heavy": "조회가 무거운 위젯입니다. 이슈가 많은 프로젝트에서는 로딩이 오래 걸릴 수 있습니다."
  },

  "statusDist": {
    "byCount": "건수 기준",
    "byEffort": "공수 기준",
    "done": "완료", "inProgress": "진행 중", "todo": "할 일"
  },

  "plannedVsActual": {
    "planned": "계획", "actual": "실적", "unit": "MD",
    "noPlan": "계획 공수가 입력된 이슈가 없습니다."
  },

  "riskIssues": {
    "title": "지연·임박 이슈",
    "filter": { "all": "전체", "overdue": "지연", "dueSoon": "임박" },
    "col": { "key": "이슈", "summary": "요약", "status": "상태", "assignee": "담당자", "due": "기한", "dday": "D-day" },
    "empty": "지연되거나 임박한 이슈가 없습니다.",
    "unassigned": "미배정",
    "noDue": "기한 없음"
  },

  "treemap": {
    "basis": { "actual": "실투입", "planned": "계획" },
    "unit": "MD",
    "excluded": "값이 없는 이슈 {count}건 제외",
    "allExcluded": "표시할 수 있는 이슈가 없습니다. 작업 시간 또는 계획 공수를 입력해 주세요.",
    "tooltip": "{key} · {value} MD"
  },

  "customFilter": {
    "title": "커스텀 필터",
    "matched": "{count}건 일치",
    "editFilter": "필터 편집",
    "noCondition": "조건이 설정되지 않았습니다. 전체 이슈를 표시합니다.",
    "builder": {
      "assignee": "담당자", "me": "나",
      "status": "상태",
      "issueType": "이슈 타입",
      "priority": "우선순위",
      "due": "기한",
      "dueOption": { "ANY": "전체", "OVERDUE": "기한 초과", "DUE_SOON": "7일 이내", "NO_DUE": "기한 없음" },
      "estimate": "계획 공수",
      "estimateOption": { "ANY": "전체", "HAS": "입력됨", "NONE": "미입력" },
      "preview": "현재 조건: {count}건",
      "reset": "조건 초기화"
    },
    "toast": { "saved": "필터가 저장되었습니다." },
    "error": { "invalid": "필터 조건이 올바르지 않습니다." }
  },

  "modal": {
    "heavyBadge": "무거움"
  }
}
```

### 8-2. `locales/kr/chartOptions.json` (기존 파일에 병합)

```jsonc
{
  "dataType": {
    "progressStatus":  { "label": "상태별 분포",   "description": "이슈를 완료/진행 중/할 일로 나눠 현재 진척 구성을 확인합니다. 건수 기준과 공수 기준을 전환할 수 있습니다." },
    "plannedVsActual": { "label": "계획 대비 실적", "description": "계획 공수(MD) 합계와 실제 투입 공수를 비교해 과소·과대 산정을 확인합니다." },
    "riskIssues":      { "label": "지연·임박 이슈", "description": "기한이 지났거나 7일 이내 마감인 미완료 이슈를 목록으로 보여줍니다." },
    "issueSize":       { "label": "이슈 규모",     "description": "어느 이슈가 가장 큰 작업량을 차지하는지 면적으로 비교합니다." },
    "progressTrend":   { "label": "진척 추이",     "description": "계획 누적 공수와 실제 누적 공수를 시간축으로 비교합니다(S-curve)." },
    "costBurnUp":      { "label": "비용 소진",     "description": "월별 누적 인건비와 예산선을 비교해 소진 속도를 확인합니다." },
    "customFilter":    { "label": "커스텀 필터",   "description": "담당자·상태·타입·우선순위·기한 조건을 직접 지정해 원하는 이슈만 모아 봅니다." }
  },
  "chartType": {
    "treemap":   { "label": "트리맵",   "description": "면적 크기로 항목 간 규모 차이를 한눈에 비교합니다." },
    "issueList": { "label": "목록",     "description": "이슈를 표 형태로 보여줍니다. 클릭하면 Jira 이슈로 이동합니다." },
    "sCurve":    { "label": "S-curve",  "description": "계획선과 실적선을 시간축으로 비교합니다." },
    "burnUp":    { "label": "번업",     "description": "누적 실집행과 예산선을 비교합니다." }
  },
  "template": {
    "health":   { "label": "프로젝트 건강", "charts": { "status": "상태별 분포", "risk": "지연·임박 이슈", "planned": "계획 대비 실적" } },
    "scale":    { "label": "작업 규모",     "charts": { "size": "이슈 규모", "status": "상태별 분포" } },
    "deepDive": { "label": "일정·비용 심층", "charts": { "trend": "진척 추이", "cost": "비용 소진" } },
    "issue":    { "charts": { "assignee": "담당자 분포" } }   // 기존 issue 템플릿에 항목 추가
  }
}
```

### 8-3. `locales/en/dashboard.json` · `locales/en/chartOptions.json`

**같은 키 트리를 영문으로 1:1 작성한다.** 키 누락은 화면에 키 문자열이 그대로 노출되므로, 구현자는 kr 파일을 복사해 값만 번역하고 **키 개수 일치를 확인**할 것.

⚠ `dashboard.summaryPanel.count`("건") 처럼 한국어 접미사 명사가 영문에 없는 항목은 **빈 문자열로 두지 말고** 포맷 문자열로 만든다: kr `"{count}건"` / en `"{count}"`. 빈 값은 "번역 누락"과 구분되지 않는다.

---

## 9. 하지 않는 것 (명시적 제외 · 미래 확장 후보)

이 목록은 "빠뜨린 것"이 아니라 **의도적으로 자른 것**이다. 리뷰에서 다시 올라오면 이 절을 근거로 답한다.

| 항목 | 이유 | 재검토 조건 |
|---|---|---|
| 완성 진척률의 **일별 추이** | 상태전이 이력 부재(F3) · 스냅샷 이력 부재(F1). 산출 불가 | 진척 이력 테이블 신설 RFC |
| **진척 이력 스냅샷 테이블·배치 신설** | §D2 비용 분석. S-curve 로 대체 가능 | 사용자가 "완성률 추이"를 명시 요구할 때 |
| 커스텀 필터의 **원문 JQL 입력** | §D6 보안·비용 | 6축으로 표현 안 되는 요구가 실제로 나올 때 |
| 필터 축 확장(라벨/컴포넌트/스프린트/버전/생성일) | 페처 fields·페이로드 증가. 요청에 없음 | 요청 발생 시 fields 1개씩 |
| 필터 결과의 분포 차트 | `progressStatus` 로 대체 | — |
| 위젯별 기간 필터(진척·상태 위젯에 날짜 범위) | 진척도가 "현재 시점 전체 스냅샷"이라는 기존 설계 결정과 충돌(`ProgressPage.jsx:21` 주석) | 진척도 탭이 기간 필터를 갖게 되면 함께 |
| 기존 `LoadingBar` → 스켈레톤 전환 | 범위 비대. 신규 위젯만 스켈레톤 사용 | 별건 UI 정리 |
| `getChartDataById` 의 `data_type` 확장 | §D3 | — |
| `getProjectProgressSummary` PermissionMap 확장 | §D5 우회 방지 | — |
| `LogicalError` 시그니처 통일 | F20 — 도메인 전반 리팩터링이라 범위 밖 | 코드 품질 감사 3~4단계 |
| 진척·비용 서비스의 캐시 재설계(F4/F5) | 감사 항목 A-2 의 소관. 여기서 손대면 진척도·비용·포트폴리오 3화면에 회귀 위험 | A-2 착수 시 |
| 위젯 간 필터 연동(크로스 필터링) | 과설계 | — |

---

## 10. 구현 작업 분해

### M1 — insight 인프라 + KPI + 상태분포 + 계획대비실적

**backend**
- [ ] `src/permission/ReportAccess.js` 신규 — `canReadReport`, `REPORT_DENIED_REASON`. `CostAccess.js` 와 동일 형태(`=== true`, fail-close)
- [ ] `src/resolver/projectDashboard/DashboardIssueFetcher.js` 신규 — 전용 1패스 + 모듈 Promise 캐시(TTL 60s, `viewerId::projectId`, 엔트리 1개, viewerId 없으면 캐시 미사용, 실패 미캐시). `MAX_INSIGHT_ISSUES=2000`, `truncated` 반환. fields §3-2. **공통 페처를 수정하지 않았는지 확인**
- [ ] `src/resolver/projectDashboard/DashboardInsightService.js` 신규 — §3-3 순서대로. `ProgressCalculator` 의 `normalizeIssue`/`computeCompletion`/`computeEffortTotals`/`computeStatusDistribution`/`computeScheduleRate`/`computeDiagnosisRates`/`diagnoseStatus` 재사용. `WorkAssignmentRules` 의 `computeQueueFlags`/`computeDDay`/`sortQueueItems` 재사용. **산식을 새로 쓰지 말 것**
- [ ] `metrics` 게이팅 — `canReadReport(principal)` false 면 **계산하지 않고 키 제외**
- [ ] `ProjectDashboardController.js` — `getDashboardIssueInsight` 등록, **`principal` 전달**
- [ ] `src/permission/PermissionMap.js` — `getDashboardIssueInsight: R('DASHBOARD','detail')` 추가 + 섹션 주석 개수 갱신
- [ ] 테스트: `__test__/DashboardInsight.test.js` — ① REPORT 없으면 `metrics` 키 부재 ② `principal` 누락 시 fail-close ③ `truncated` 플래그 ④ 진척률이 `computeCompletion` 과 동일값 ⑤ 페처 실패 시 빈 집계 정상 응답
- [ ] `npm test` 통과 (특히 `permissionMap.contract.test.js`)

**frontend**
- [ ] `constants/dashboardWidgets.js` 신규 — `WIDGET_SPEC` (§2-3). 기존 7종 포함
- [ ] `utils/queryKey/projectKeys.js` — `dashboardInsight` 추가. `queryKeyContract.test.js` 통과 확인
- [ ] `hooks/useDashboardInsight.js` 신규 (§4-1). **`coworkerFieldId` 넣지 말 것**
- [ ] `utils/dashboardInsightAdapters.js` 신규 — `toStatusDistributionChartData`, `toPlannedVsActualChartData`
- [ ] `ChartTemplate.js` — `spec.source` 분기 추가, `optionFn({...chartData, t, isDark})` 로 변경, `requires`/`denied`/`metrics 부재` 안내 분기
- [ ] `constants/dashboardTypes.js` — `DATA_TYPES` 에 `progressStatus`·`plannedVsActual` 추가(`allowedCharts` 는 `CHART_OPTION_MAP` 에 있는 것만)
- [ ] `AddChartModal.jsx` — 권한 필터 일반화(**`salary` 의 `isLevelBand` 조건 보존**), `defaultSize` 사용
- [ ] `DashboardPage.jsx` — `createItem` 이 `WIDGET_SPEC.defaultSize` 사용, `handleRefresh` 에 `dashboardInsight` 포함
- [ ] `summary/SummaryPanel.jsx` — KPI 3타일 추가(§4-4). `'metrics' in data` 판정, `?? 0` 금지, `total_salary` 로직 무변경, 그리드 `auto-fit` 전환, `SUMMARY_ITEM.h` 2→3
- [ ] i18n: `dashboard.json`(summaryPanel/insight/widget/statusDist/plannedVsActual) + `chartOptions.json`(dataType 2종) kr·en 양쪽 → `npm run merge`
- [ ] `CI=true npm run build` 통과

### M2 — 지연·임박 목록 + 트리맵

**backend**
- [ ] `DashboardInsightService` — `issues[]` 를 `sortQueueItems` 순서로 정렬해 반환(프론트 정렬 복제 방지, §4-3)
- [ ] (해당 없음 — 신규 resolver 없음)

**frontend**
- [ ] `components/chart/echart/options/treemapOption.js` 신규 — 2단(issuetype→issue), `categoricalPalette(isDark)`, `t` 라벨, tooltip 포맷
- [ ] `ChartTemplate.js` — `CHART_OPTION_MAP.treemap` 등록, `renderer:'issueList'` 분기 추가
- [ ] `dashboard/widgets/IssueListWidget.jsx` 신규 — `CommonTable` + `IssueComponent`(`router.open`) + `StatusComponent` + 건수 배지 + `EmptyState`. `window.open` 금지
- [ ] `utils/dashboardInsightAdapters.js` — `toTreemapData(insight, basis)` 추가. **값 ≤0 / null 제외 + `excludedCount` 반환**
- [ ] 트리맵 위젯 헤더에 `실투입 | 계획` 토글(`ViewToggleButtons` 재사용), 하단 제외 건수 캡션
- [ ] `constants/dashboardTypes.js` — `riskIssues`·`issueSize` 추가, `CHART_TYPES` 에 `treemap`·`issueList` 추가(이미지 에셋 필요 — 기존 `utils/image/` 관례)
- [ ] i18n: `riskIssues`·`treemap` 블록 kr·en → merge
- [ ] 검증: `allowedCharts` 에 넣은 chartType 이 전부 `CHART_OPTION_MAP` 또는 렌더러 분기에 있는지 **눈으로 확인**(F12 백지 차트)

### M3 — 진척 추이 + 비용 소진

**backend**
- [ ] **변경 없음.** `getProjectProgressSummary`·`getProjectCostSummary` 무수정, PermissionMap 무수정

**frontend**
- [ ] `ChartTemplate.js` — `source:'progress'`(`projectKeys.progress` 공유), `source:'cost'`(**`useProjectCostSummary` 훅 재사용, 새 invoke 금지 — F17**), `renderer:'sCurve'|'burnUp'` 분기
- [ ] `ProgressSCurve.jsx`·`CostBurnUp.jsx` **무수정 재사용**. 두 컴포넌트는 `data` prop 하나만 받으므로 그대로 꽂힌다
- [ ] `constants/dashboardTypes.js` — `progressTrend`·`costBurnUp` 추가, `sCurve`·`burnUp` chartType 추가
- [ ] `AddChartModal.jsx` — `heavy` 배지 + 툴팁
- [ ] 권한 회귀 확인: REPORT 회수 / PROJECT_COST 회수 상태에서 ① AddChartModal 에 안 보이고 ② 이미 배치된 위젯이 안내 문구를 내며 ③ **대시보드 전체가 깨지지 않는지**
- [ ] `projectTeamAnalysisWiring.test.js` 통과 확인(비용 invoke 단일 호출부 계약)
- [ ] i18n: `widget.denied.*`, `widget.heavy` kr·en → merge

### M4 — 커스텀 필터 + 템플릿 강화

**backend**
- [ ] `src/rdb/schema/ddl/project.sql.js` — `ALTER_PROJECT_DASHBOARD_ADD_FILTER_JSON` 추가(주석에 NULL 허용 근거 명시)
- [ ] `src/rdb/schema/ddl/index.js` — re-export
- [ ] `src/rdb/schema/migrate.js` — `v018_alter_project_dashboard_add_filter_json` 체인 **맨 끝**에 enqueue. 번호 중복 없는지 확인
- [ ] `src/rdb/query/ProjectDashboard.js` — `INSERT` 10컬럼으로 재정의, `UPDATE_FILTER` 추가
- [ ] `ProjectDashboardRepository.js` — `addChartDataRepository` params 10번째(`JSON.stringify(filter) | null`), `updateChartFilterRepository` 추가
- [ ] `DashboardFilter.js`(또는 `DashboardInsightService` 내) — `validateFilterDef` 순수 함수. **`addChart` 와 `updateChartFilter` 가 같은 함수를 호출**할 것(읽기↔쓰기 대칭)
- [ ] `ProjectDashboardService.js` — `validateChart` 에서 `chart.filter` 검증, `updateChartFilterService` 추가
- [ ] `ProjectDashboardController.js` — `updateChartFilter` 등록
- [ ] `PermissionMap.js` — `updateChartFilter: W('DASHBOARD','inherited')`
- [ ] 테스트: FilterDef 검증(버전 불일치·미지 키·길이 초과·enum 위반), add/update 양쪽이 같은 검증을 통과시키는지

**frontend**
- [ ] `utils/dashboardFilter.js` 신규 — `applyFilterDef(issues, filter, myAccountId)` 순수 함수. `__ME__` 해석, 축 내부 OR / 축 간 AND, 빈 축 무시
- [ ] `dashboard/modal/FilterBuilder.jsx` 신규 — §4-5. **옵션은 `insight.issues` 에서 실제 등장 값만** 추림. 실시간 매칭 건수 미리보기
- [ ] `AddChartModal.jsx` — `customFilter` 선택 시 빌더 노출, `submit` payload 에 `filter` 포함
- [ ] `ChartCard` 편집 모드에 "필터 편집" 진입점 → `updateChartFilter` 호출 후 `dashboardInfo` invalidate
- [ ] `IssueListWidget` — `mode:'filter'` 지원
- [ ] `constants/dashboardTypes.js` — `customFilter` 추가 + `TEMPLATES` 개편(§7, 항목별 `size`)
- [ ] `DashboardPage.handleAddChart` — 템플릿 다중 차트의 `x` 배치를 누적 폭 기준으로 계산(폭 혼재 시 겹침 방지)
- [ ] i18n: `customFilter.*`, `modal.heavyBadge`, `chartOptions.template.*` kr·en → merge
- [ ] **배포 후 확인**: 마이그레이션 완료 후 커스텀 필터 위젯 1건 실제 생성 성공(§5-1 리스크)

---

## 11. 구현자를 위한 함정 목록 (밟기 쉬운 것만)

1. **백지 차트 (F12)** — `DATA_TYPES.allowedCharts` 에 `CHART_OPTION_MAP` 에 없는 chartType 을 넣으면 **에러 없이** 빈 차트가 된다. 새 chartType 은 옵션 함수 또는 렌더러 분기까지 반드시 등록.
2. **`PERMISSION_UNMAPPED`** — 신규 resolver 를 `PermissionMap` 에 안 넣으면 런타임에 죽는다. 계약 테스트가 잡아주지만 로컬에서 `npm test` 를 돌려야 안다.
3. **`principal` 미전달** — `guardedDefine` 핸들러에서 `principal` 을 서비스로 안 넘기면 `canReadReport` 가 fail-close 로 항상 false → `metrics` 가 조용히 사라진다. 화면엔 에러가 안 뜬다.
4. **`?? 0` 로 부재를 0으로 만들기** — `metrics` 부재 / `plannedMd: null` / `truncated` 를 0·false 로 뭉개면 거짓 UI 가 된다. `total_salary` 선례(`SummaryPanel.jsx:31-43` 주석)를 읽고 시작할 것.
5. **공통 페처 수정** — `getProjectIssuesByFilter`·`fetchAllProjectIssues`·`getBulkIssuesByProject`·`ProjectParticipantFetcher` 에 fields 를 추가하고 싶어지는 순간이 온다. **하지 말 것.** 전용 페처에 넣는다.
6. **비용 위젯에 새 `invoke` 추가** — `projectTeamAnalysisWiring.test.js` 가 `invoke('getProjectCostSummary')` 호출부를 1개로 강제한다. `useProjectCostSummary` 훅을 써야 한다.
7. **`salary` 의 `isLevelBand` 조건 유실** — AddChartModal 권한 필터를 일반화하면서 빠뜨리기 쉽다. LEVEL_BAND 설치에서 만들 수 없는 위젯이 다시 노출된다.
8. **마이그레이션 전 10컬럼 INSERT** — §5-1. 배포 직후 `addChart` 를 실제로 눌러 확인.
9. **`locales/script/*.json` 에 번역 넣기** — 빈 스텁이라 merge 에 반영되지 않는다. `locales/kr/`·`locales/en/` 이다.
10. **`merge` 산출물 충돌** — `work-bulk-apply` 와 동시에 `npm run merge` 하면 `ko-KR.json`/`en-US.json` 이 충돌한다. 리더가 시점을 조율.
11. **`sortQueueItems` 를 프론트에 복제** — 백엔드가 정렬해서 보낸다. 프론트는 필터만.
12. **트리맵 0 노드** — 값 ≤0 을 걸러내지 않으면 좌표가 붕괴하거나 노드가 사라진다. 제외 건수는 반드시 캡션으로 노출.

---

## 12. 미해결 / 리더 확인 필요

| # | 항목 | 기본(보수적) 가정 | 확인 시 바뀌는 것 |
|---|---|---|---|
| Q1 | `MAX_INSIGHT_ISSUES` 상한을 2000 으로 두었다. 실제 운영 프로젝트의 최대 이슈 수를 모른다 | 2000 + `truncated` 경고 노출 | 최대치가 3000 이상이면 상한을 올리고 페이로드 영향(§D7 메모리) 재검토 |
| Q2 | KPI 진척률은 `metrics.completionRate`(완성 진척률) 로 잡았다. 사용자가 기대하는 "진척률"이 일정 진척률이나 공수 소진율일 수 있다 | 진척도 탭의 **주 지표인 완성 진척률**을 쓴다(탭과 숫자 일치가 최우선 요구였으므로) | 다른 지표를 원하면 타일 값만 교체(계약 변경 없음) |
| Q3 | 트리맵 상위 계층을 `issuetype` 으로 고정했다 | 고정. 토글 없음(과설계 방지) | 담당자/상태 기준을 원하면 토글 축 추가(데이터는 이미 있음, 비용 0) |
| Q4 | `dueSoonDays` 는 `WorkAssignmentRules` 기본값 7 고정. settings 노출 안 함 | 7 고정, 응답에 값을 실어 프론트가 문구에 사용 | 설정화하면 `resolveAssignmentThresholds(settings)` 를 태우면 됨 |

---

# 13. 토폴로지(관계 그래프) — T1 · T2

> 추가 근거: `00_input/addendum_topology.md` (2026-08-13 사용자 추가 요청)
> 기준 계약: `02_backend_report.md`(M1 확정 계약) · `01a_leader_decisions.md`
> **§1~§12 는 수정하지 않았다.** 이 절만 추가된다. 모듈 편입: **M5(T1) · M6(T2)**

---

## 13-0. 조사로 확정된 사실 (T1·T2 설계 근거)

| # | 사실 | 확인 위치 | 설계 영향 |
|---|------|----------|----------|
| **T-F1** | 레포 전체에서 `series.type:'graph'` 를 쓰는 파일은 **정확히 1개**다. "관계도 2건"은 같은 파일의 시간적 두 버전(2레이어 → 3레이어 in-place 개조)이고, **2레이어 구현은 파일로 남아 있지 않다**. `analysisReport/team/` 에는 관계도가 없다(`TeamCoverageTable` = 순수 테이블) | `static/ui/src/pages/resource/allocation/allocationGraphOption.js` (유일) | 재사용 대상은 **1건**. "팀 분석 3레이어 관계도"라는 별도 자산은 존재하지 않는다 |
| **T-F2** | 그 관계도는 **`layout:'none'` + 수동 3열 좌표**다(force/circular 아님). projectX=60/teamX=430/memberX=800, gapY=46, 팀 노드 y=팀원 centroid + `MIN_TEAM_GAP=42` 하향 push 로 교차 제거 | `allocationGraphOption.js` | 계층형 토폴로지(T2)에는 **그대로 값진 자산**, 자유 관계망(T1)에는 **무의미** |
| **T-F3** | `buildAllocationOption()` 은 `projects/members/links/memberTeamMap/teamNameMap` 도메인 필드와 i18n 키 `resource.allocation.*` 에 **하드결박**돼 있다. 제네릭 `{nodes,edges}` 어댑터가 없다. 테스트 10케이스가 3레이어 구조를 계약으로 고정 | `allocation/__test__/allocationGraphOption.test.js` | **그대로 재사용 불가.** 기존 파일은 이번 범위에서 **건드리지 않는다** |
| **T-F4** | 재사용 가치가 실제로 있는 것은 함수가 아니라 **패턴 3종**: ① 결정적 해시 컬러(`hashString`→`projectColor/memberColor/teamColor`, 필터로 목록이 바뀌어도 색이 안 튐) ② 상한+`hiddenCount` 배너+"전체 표시" 토글(`capAllocationScale`) ③ 툴팁 `esc()` + 노드/엣지 분기 formatter | `allocationScale.js`, `allocationGraphOption.js` | 이 3종만 **공용 모듈로 신설**해 T1·T2 가 공유 |
| **T-F5** | 이 관계도는 `categoricalPalette(isDark)` 를 **쓰지 않고** 자체 `PROJECT_PALETTE`(16색, DMOVE 틸 시작)를 쓴다 — 앱 팔레트 단일출처 정책의 **기존 예외** | `allocationGraphOption.js` | 신규 토폴로지는 **`chartPalette.js` 를 따른다**(§13-D5). 예외를 늘리지 않는다 |
| **T-F6** | 아바타는 `symbol:'image://'` + **프리-프로브 패턴**(`new Image()` onload 성공분만 `avatarOkSet` 에 넣어 승격, onerror 는 원형 폴백). 파일 주석에 "Forge 실환경 로드 여부는 배포 후 E2E 확인 필요"라고 **미확인 상태로 명시** | `AllocationGraph.jsx` L30-49 | T1·T2 **둘 다 아바타를 쓰지 않는다**(§13-D6) — 미검증 자산에 신규 기능을 걸지 않는다 |
| **T-F7** | `getProjectGanttData` 의 `links[]` 는 **`type.name === 'Blocks'` 만** 통과시킨다. `relates to`/`duplicates`/`clones`/커스텀 타입은 `GanttMapper.buildLinksFromIssueLinks` L24 에서 `continue` 로 **완전 폐기**되고 원본 `issuelinks` 도 응답에 남지 않는다. `links[].type` 은 `'FS'` **하드코딩 상수**(Jira 타입명 아님) | `src/resolver/gantt/GanttMapper.js` | **간트 데이터만으로는 요구된 "타입별 구분"을 만들 수 없다** |
| **T-F8** | 비-Blocks 링크를 얻는 유일한 기존 경로는 프론트 **온디맨드 단건 조회**다(`useIssueRelations` → `GET issue?fields=parent,subtasks,issuelinks`). 프로젝트 전량에 적용하면 **N+1** | `static/ui/src/pages/projectDetail/work/useIssueRelations.js` | 전량 토폴로지에 그대로 쓸 수 없다 |
| **T-F9** | 그러나 `search/jql` 은 `issuelinks` 를 **fields 로 인라인 반환한다** — `getProjectGanttIssues` 가 이미 그렇게 요청하고 있다(`IssueApi.js` L361-365). 즉 **1패스(⌈N/100⌉)로 전 타입을 받을 수 있고, 버리는 것은 매퍼다** | `IssueApi.js` | 전용 페처 1패스로 **N+1 없이** 전 타입 확보 가능 |
| **T-F10** | `tasks[]` 는 `jiraParent` · `wbsParent` · `effectiveParent` **세 값을 모두 실어 보낸다**. 부모는 출처 구분이 **가능**하다(선후행만 구분 불가) | `GanttMapper.buildTasksAndLinks` L169-177 | 상위 엣지는 워크포스/Jira 를 **정직하게 구분해 그린다** |
| **T-F11** | `getProjectGanttData` = `R('PROJECT','detail')`. 서버 캐시 없음(매 호출 Jira full scan). 비용 `⌈N/100⌉ + ⌈U/100⌉(coworker bulk) + SQL 4` | `PermissionMap.js` L249, `GanttService.js` | 토폴로지 전용 페처는 coworker 를 안 받으므로 **간트보다 싸다** |
| **T-F12** | **`getPortfolioDashboard` 응답에 T2 3계층 재료가 이미 전부 있다.** `projects[].members[]{accountId, displayName, roleKey, levelKey, effortMd, utilization}` = 인력 노드 + 인접 리스트, `projects[]{projectId, projectName, statusName, statusColor, memberCount, riskScore, diagnosisStatus, completionRate}` = 프로젝트 노드, `projects[].issueSummary{done,inProgress,todo}` = 이슈 계층 집계 | `PortfolioDashboardService.js` L297-326 | **T2 는 신규 resolver 0 · 신규 쿼리키 0 · 추가 왕복 0** |
| **T-F13** | 포트폴리오 진입 비용은 **SQL 2 + KVS 2~6, Jira REST 0**. 프론트는 **단일 `useQuery`**(`portfolioKeys.dashboard()`)로 전량을 받아 메모리에서 재집계한다 — 위젯이 늘어도 invoke 증가 0 | `PortfolioDashboardService.js` L162-170, `PortfolioDashboardPage.jsx` L63 | T2 위젯은 **props 로 데이터를 받는다**(기존 위젯 전체의 패턴) |
| **T-F14** | 아바타 URL 은 스냅샷에 **없다**. `flattenBulkUsers` 가 `{accountId: displayName}` 만 남기고 `avatarUrls` 를 버린다 | `PortfolioAggregator.js` L70-79 | T2 인력 노드는 **이니셜 폴백**(§13-D6) |
| **T-F15** | 개별 이슈 노드·사람↔이슈 엣지는 **없다**. `problemIssues[].assignee` 는 **displayName 문자열**이라 accountId 조인 불가. 이슈 raw 는 배치가 집계 후 버린다 | `PortfolioAggregator.js` L122-132 | T2 이슈 계층은 **프로젝트별 상태 집계 노드**로만 그린다(§13-D3) |
| **T-F16** | `resolveTeamAnalyticsScope` 가 **"🔴 `REPORT read` 만으로 전 팀을 열지 않는다"** 를 명문으로 금지한다. 시드 Member 는 `REPORT read=true` + `projectScope='ALL'` 이라 REPORT 로 열면 전 사용자가 전사 인력 데이터를 본다 | `src/permission/TeamAnalyticsScope.js` L21-23 | T2 가 `getResourceAllocationGraph`(=`R('RESOURCE_MANAGEMENT')`)를 REPORT 로 끌어오는 설계는 **금지**. §13-D4 로 회피 |
| **T-F17** | "자원(Resource)"은 최상위 섹션이 아니라 **`ComparisonTabs` 의 서브탭**이다. 그 탭의 BentoGrid 는 `roleLevel(3) / utilization(3) / workDist(6)` 3타일. 페이지 규약은 `portfolio.section.comparisonHint` = "모든 위젯이 위 필터에 반응합니다" | `pages/portfolio/tabs/ResourceTab.jsx`, `sections/ComparisonTabs.jsx` | "자원 아래" = **ResourceTab 의 `workDist` 아래 `BentoTile span=6`**(§13-D7) |
| **T-F18** | 포트폴리오 카드는 `portfolioCards.js` 에 `cardId` 를 등록해야 접기/`data-collapsed` 가 붙는다. 차트는 `ChartBox` → `ThemedECharts` 경유 필수(다크 테마·전체화면 `78vh`) | `pages/portfolio/utils/portfolioCards.js`, `widgets/ChartBox.jsx` | 등록 누락 시 죽은 접기 버튼(RFC-160 전례) |
| **T-F19** | `echarts` **6.1.0 전체 패키지**가 이미 의존성이고 `echarts-for-react` 가 통째로 import 한다. `graph`/`sankey`/`tree`/`treemap` 전부 **추가 의존성·추가 번들 비용 0**. 번들 예산은 main gzip 950KB 참고선(경고만)이고 echarts 는 이미 lazy 청크에 격리돼 있다 | `static/ui/package.json`, `ThemedECharts.js`, `scripts/check-bundle-budget.js` | "신규 의존성 금지" 제약은 **자동 충족**. 차트 종류 선택은 순수하게 표현력 문제 |

---

## 13-1. 차트 형식 선택 (ECharts 내 비교)

신규 의존성은 없다(T-F19). 선택 기준은 **그리려는 그래프의 위상**이다.

### T1 = 프로젝트·이슈 관계망 → **`graph` + `layout:'force'`**

그리려는 것은 **계층 1개가 아니다.** 부모-자식 트리(폴더 포함) 위에 선후행·기타 Jira 링크가 **교차로 얹힌 일반 그래프**이고, 사이클도 있을 수 있다(간트는 `detectDagCycle` 로 막지만 relates/duplicates 는 자유롭다).

| 후보 | 판정 | 근거 |
|---|---|---|
| **`graph` + `force`** | ✅ **채택** | 임의 위상(트리 + 교차 엣지 + 사이클)을 유일하게 표현한다. 엣지마다 `lineStyle`(색·선종·굵기)을 따로 줄 수 있어 **타입별 구분**이 정확히 요구대로 된다. `emphasis.focus:'adjacency'` 로 한 이슈의 관계망만 밝히는 상호작용이 공짜 |
| `graph` + `layout:'none'`(수동 좌표) | ❌ | 계층이 하나로 정해지지 않는다(폴더 소속과 이슈 부모가 서로 다른 축). 좌표를 손으로 정할 근거가 없다 |
| `graph` + `circular` | ❌ | 노드를 원주에 균등 배치 → 부모-자식 근접성이 사라져 구조가 안 읽힌다. 노드 200개면 라벨이 전부 겹친다 |
| `tree` / radial tree | ❌ | **단일 부모 트리 전용.** 노드는 부모를 하나만 가질 수 있어 Blocks·relates 같은 교차 엣지를 **그릴 방법이 없다**. 요구의 절반을 버리게 된다 |
| `sankey` | ❌ | **DAG 전용 + 노드가 계층에 고정**된다. 사이클이 있으면 렌더가 깨지고, 관계 타입이 7종인 상황에서 "흐름 폭"이 의미하는 바가 없다 |

`force` 파라미터: `repulsion` 은 노드 수에 비례(`Math.min(80 + n*1.2, 400)`), `edgeLength: [40, 120]`, `gravity: 0.06`, `layoutAnimation: n <= 150`(그 이상은 정지 배치 — 250노드에서 애니메이션이 프레임을 먹는다), `roam: true`, `draggable: true`.

### T2 = 인력·프로젝트·이슈 3계층 → **`graph` + `layout:'none'`(3열 계층 배치)**

이쪽은 **계층이 명확히 셋**이고 순서가 고정이다.

| 후보 | 판정 | 근거 |
|---|---|---|
| **`graph` + `layout:'none'` 3열** | ✅ **채택** | 계층이 고정이라 좌표를 정할 근거가 있다. **기존 배정 관계도(T-F2)와 같은 구조** → 좌표·centroid·교차 제거 알고리즘이 검증된 상태로 존재. 노드 클릭/툴팁/상한 상호작용이 자유롭다 |
| `sankey` | ❌ **결정적 결함** | 노드 높이가 **유입/유출 흐름 합**으로 자동 결정된다. 좌측 흐름 단위는 `effortMd`(공수), 우측은 **이슈 건수**로 **단위가 다르다** → 프로젝트 노드 높이가 `max(공수합, 건수합)` 이라는 무의미한 값이 되고, 폭이 거짓 비교를 만든다. 단위를 억지로 맞추면(둘 다 건수) 좌측이 "사람당 프로젝트 수"가 되어 원래 보고 싶던 투입량이 사라진다 |
| `graph` + `force` | ❌ | 계층이 명확한데 힘 기반으로 흩뜨리면 "인력→프로젝트→이슈" 라는 읽는 방향이 사라진다. 리렌더마다 배치가 달라 필터를 만질 때마다 그래프가 튄다 |
| `tree` | ❌ | 한 사람이 여러 프로젝트에 속한다(N:M) → 트리로 표현 불가 |

---

## 13-2. 경계면 계약

### 13-2-A. resolver 계약표 (§2-1 에 이어지는 추가분)

| resolver 함수 | 신규/기존 | 입력 | 응답 shape | PermissionMap | 대응 프론트 훅 / 쿼리키 | 모듈 |
|---|---|---|---|---|---|---|
| `getProjectRelationGraph` | **신규** | `{ projectId }` | §13-2-B | `R('PROJECT','detail')` | `useProjectRelationGraph(projectId)` / `projectKeys.relationGraph(projectId)` | **M5** |
| `getPortfolioDashboard` | **기존 무변경** | `{}` | 기존 그대로 | 기존 `R('REPORT','list')` **유지** | 기존 `portfolioKeys.dashboard()` — **위젯은 props 로 받는다** | **M6** |
| `getProjectGanttData` | **미사용** | — | — | — | T1 이 쓰지 않는다(§13-D1 기각 사유) | — |
| `getResourceAllocationGraph` | **미사용** | — | — | — | T2 가 쓰지 않는다(§13-D4 기각 사유) | — |

> **M6 은 백엔드 변경이 0건이다.** 신규 resolver·PermissionMap·DDL·KVS 전부 없음.

### 13-2-B. `getProjectRelationGraph` 응답 shape (정확)

`guardedDefine` 이 루트 스프레드한다 → `result.nodes` (`result.content.nodes` 아님).

```jsonc
{
  "success": true,
  "generatedAt": "2026-08-13T06:20:11.000Z",
  "scanned": 412,                  // 스캔한 이슈 수
  "truncated": false,              // MAX_TOPOLOGY_ISSUES(800) 초과로 페이지 루프를 끊었는지
  "outOfScopeEdgeCount": 3,        // 끝점이 페치 집합 밖이라 그리지 못한 엣지 수 (조용한 절단 금지)

  "project": { "projectId": "9f3c…", "projectName": "차세대 포털" },

  "nodes": [
    { "id": "project",                          // 중심 노드. 항상 정확히 1개, 항상 첫 원소
      "kind": "PROJECT",
      "name": "차세대 포털" },

    { "id": "folder:1a2b…",
      "kind": "FOLDER",
      "name": "공통 모듈",
      "parentFolderId": null,                   // string|null (루트)
      "sortOrder": 10 },

    { "id": "issue:DWEB-142",
      "kind": "ISSUE",
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "issueTypeName": "Task",                  // string|null
      "issueTypeIconUrl": "https://…",          // string|null
      "statusKey": "indeterminate",             // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",                   // string|null — fields.status.name (배지 라벨)
      "statusColorName": "yellow",              // string|null
      "assignee": { "accountId": "5b1…", "displayName": "홍길동" },  // object|null (avatarUrl 없음 — §13-D6)
      "degree": 3 }                             // 이 노드에 붙은 엣지 수(고립 노드 필터·상한 랭킹용)
  ],

  "edges": [
    { "id": "PARENT_WORKFORCE:DWEB-100>DWEB-142",
      "source": "issue:DWEB-100",               // 부모
      "target": "issue:DWEB-142",               // 자식
      "kind": "PARENT_WORKFORCE" },             // wbsParent 가 적용된 상위 (앱 저장)

    { "kind": "PARENT_JIRA",          "source": "issue:…", "target": "issue:…" },
                                                 // jiraParent 가 적용된 상위 (Jira 표준 필드)
    { "kind": "PARENT_JIRA_SHADOWED", "source": "issue:…", "target": "issue:…" },
                                                 // wbsParent 에 가려진 Jira 상위. 기본 숨김 토글

    { "kind": "BLOCKS", "source": "issue:A", "target": "issue:B" },
                                                 // 선후행. source=선행, target=후행 (GanttMapper 방향 계약과 동일)

    { "kind": "FOLDER_CHILD",  "source": "folder:x", "target": "folder:y" },   // 폴더 중첩
    { "kind": "FOLDER_MEMBER", "source": "folder:x", "target": "issue:C"  },   // 폴더 소속(앱 전용)
    { "kind": "FOLDER_LINK",   "source": "folder:x", "target": "issue:C",      // 폴더 끝점 선후행(앱 DB)
      "id": "FOLDER_LINK:folder:x>issue:C" },

    { "kind": "ROOT", "source": "project", "target": "issue:R" },
                                                 // 부모도 폴더도 없는 이슈를 중심에 붙인다

    { "id": "ISSUE_LINK:10432",
      "kind": "ISSUE_LINK",
      "source": "issue:A", "target": "issue:B",
      "typeName": "Relates",                     // ★ Jira 링크 타입명 — 색 구분의 키
      "relation": "relates to",                  // 표시 문구(방향별). ⚠ 판정에 쓰지 말 것
      "linkId": "10432" }
  ],

  "edgeKindCounts": {                            // 범례 옆 건수 + "이 타입 없음" 판정
    "PARENT_WORKFORCE": 5, "PARENT_JIRA": 41, "PARENT_JIRA_SHADOWED": 2,
    "BLOCKS": 12, "FOLDER_CHILD": 3, "FOLDER_MEMBER": 88, "FOLDER_LINK": 1,
    "ROOT": 24, "ISSUE_LINK": 19
  },
  "linkTypeNames": ["Relates", "Duplicate", "Cloners"]   // 등장한 ISSUE_LINK typeName 목록(정렬). 범례 생성용
}
```

**실패 시**: `{ success:false, error:{ name, code, message, cause } }`
`projectId` 누락 → `error.cause === 'PROJECT_ID_REQUIRED'` (§F20 — 이 도메인 3인자 `LogicalError` 관례)

**계약 규약 5가지 (양쪽 다 지킬 것)**

1. **`BLOCKS` 는 `ISSUE_LINK` 에 중복해서 넣지 않는다.** 백엔드가 `typeName === 'Blocks'` 를 `ISSUE_LINK` 에서 제외한다(프론트 `excludeBlocksLinks` 와 **같은 규약을 서버가 수행**). 프론트에서 다시 거르지 말 것 — 두 곳에서 거르면 한쪽을 고칠 때 다른 쪽이 남는다.
2. **`ISSUE_LINK` 타입 판정은 `typeName` 으로만 한다.** `relation`(`type.outward/inward`)은 로케일·커스텀 링크타입에서 깨진다(WORK_VIEWS §6-3).
3. **`ISSUE_LINK` 는 `linkId` 기준으로 서버가 dedup 한다.** Jira 는 같은 링크를 양쪽 이슈의 `issuelinks` 에 실어 보내므로 dedup 없으면 모든 링크가 2개로 그려진다.
4. **끝점이 페치 집합 밖인 엣지는 내보내지 않는다**(노드가 없으므로 ECharts 가 무시하거나 유령 노드를 만든다). 대신 `outOfScopeEdgeCount` 로 **몇 건을 못 그렸는지 반드시 알린다.**
5. `truncated:true` 면 그래프 전체가 부분이다 — 배너 필수.

### 13-2-C. WIDGET_SPEC 확장 (§2-3 / `constants/dashboardWidgets.js` 에 추가)

```js
// ── M5 — 관계 토폴로지 ─────────────────────────────────────────────────
projectTopology: {
    source: 'relationGraph',      // ★ 4번째 source. ChartTemplate 분기 추가
    renderer: 'forceGraph',       // ★ 5번째 renderer
    requires: 'PROJECT',          // 간트·작업관리와 같은 게이트(§13-D8)
    defaultSize: { w: 8, h: 8 },  // 관계망은 좁으면 못 읽는다
},
```

> ⚠ `renderer !== 'echart'` 이므로 `chartType:'graph'` 를 **`CHART_OPTION_MAP` 에 등록하지 않는다**(등록하면 두 경로가 생긴다). M1 이 만든 `__test__/dashboardWidgets.test.js` 의 "allowedCharts ↔ CHART_OPTION_MAP 정합" 검사는 **`renderer === 'echart'` 인 항목에만** 적용되도록 스코프를 좁혀야 한다 — 안 좁히면 M5 에서 그 테스트가 거짓 실패한다. **M5 작업 항목에 포함.**

### 13-2-D. T2 데이터 계약 (신규 resolver 없음 — 프론트 순수함수)

`static/ui/src/pages/portfolio/utils/portfolioAggregate.js` 에 순수함수 1개를 추가한다(기존 17개 함수와 같은 자리).

```js
/**
 * @param {Array} selectedProjects  필터 통과한 data.projects[]
 * @param {{maxProjects:number, maxPeople:number, showAll:boolean}} opts
 * @returns {{
 *   people:   [{ accountId, displayName, projectCount, totalEffortMd, avgUtilization }],
 *   projects: [{ projectId, projectName, statusName, statusColor, diagnosisStatus,
 *                riskScore, memberCount, completionRate, issueSummary }],
 *   statusNodes: [{ id, projectId, statusKey:'done'|'inProgress'|'todo', count }],
 *   personProjectEdges: [{ accountId, projectId, effortMd, utilization }],
 *   projectStatusEdges: [{ projectId, statusKey, count }],
 *   hiddenProjectCount: number, totalProjects: number,
 *   hiddenPeopleCount: number,  totalPeople: number
 * }}
 */
export const buildPortfolioTopology = (selectedProjects, opts) => { /* … */ };
```

- **`accountId` dedup 필수** — 한 사람이 여러 프로젝트에 있으면 `members[]` 에 중복 등장한다(기존 `summarizeSelection`·`salaryHistogram` 이 이미 같은 처리를 한다).
- `statusNodes` 는 **`count > 0` 인 것만** 만든다. 0건 상태 노드는 정보가 없고 좌표만 먹는다.
- **급여 필드에 손대지 않는다** — `members[].salary`, `projects[].totalSalary`, `salaryBuckets` 를 **읽지도 않는다**. 그래서 이 위젯은 `costMasked` 분기가 **구조적으로 불필요**하다(§13-D9).

---

## 13-3. 핵심 설계 결정

### D1. T1 의 데이터 출처 — **신규 전용 resolver** (간트 재사용 기각)

| 후보 | 추가 왕복 | 전 링크 타입 | 판정 |
|---|---|---|---|
| (A) `getProjectGanttData` 재사용 (`ganttKeys.data` 캐시 공유) | **0** (작업관리 탭 방문 시). 미방문 시 `⌈N/100⌉ + ⌈U/100⌉ + SQL 4` | ❌ **Blocks 만**(T-F7) | ❌ 요구 미충족 |
| (B) `getProjectGanttData` 응답에 `extraLinks[]` 추가 | 0 | ✅ | ❌ **위험** — 간트/트리의 낙관 패치(`setQueryData`, invalidate 금지)가 payload 를 재조립하므로 새 키가 패치 때마다 유실된다. `unwrapGanttPayload` 도 6필드만 뽑는다. 게다가 issuelinks 는 verbose 라 **간트·트리 로드가 통째로 무거워진다**(그들은 쓰지도 않는데) |
| (C) M1 `getDashboardIssueInsight` 확장 | 0 | ✅ | ❌ insight 는 **모든 대시보드 진입에서 호출**된다(KPI 타일). issuelinks·parent 를 얹으면 토폴로지 위젯이 없는 사용자까지 페이로드를 문다 |
| (D) 이슈별 `useIssueRelations` 반복 | `N` (N+1) | ✅ | ❌ 500이슈면 500회. 논외 |
| **(E) 신규 `getProjectRelationGraph` + 전용 페처** | `min(⌈N/100⌉, 8) + SQL 3` | ✅ | ✅ **채택** |

**(E) 채택 근거**
1. `search/jql` 이 `issuelinks` 를 인라인으로 준다(T-F9) → **N+1 없이** 전 타입 확보. 버려지던 것은 매퍼일 뿐이다.
2. 간트/트리가 계약으로 고정한 것(`GANTT.md`·`WORK_VIEWS.md`·낙관 패치)을 **한 줄도 건드리지 않는다.**
3. 전용 페처는 coworker resolve(`⌈U/100⌉`)·`timetracking`·`aggregateprogress`·`customfield_10015` 를 **요청하지 않으므로 간트보다 싸고 가볍다.**
4. 상한 800으로 Jira 왕복이 **최대 8회로 묶인다**(간트는 상한이 없다).

**대가**: 사용자가 작업관리 탭과 대시보드 토폴로지 위젯을 둘 다 보면 같은 프로젝트를 두 번 스캔한다. 두 탭은 서로 다른 화면이고 각각 5분 캐시라 실사용에서 겹치는 창이 좁다 — **수용**.

### D2. 관계의 "출처 표기" — WORK_VIEWS §6-1 준수 (거짓 구분 금지)

§6-1 이 금지하는 것은 **두 가지**다: ① 출처가 구분되는 척하는 UI ② 같은 Blocks 링크를 두 곳에 그리기.

| 엣지 종류 | 실제 저장소 | 출처 표기 | 근거 |
|---|---|---|---|
| `PARENT_WORKFORCE` | 이슈 프로퍼티 `movesRms.wbsParent` (앱) | **워크포스** 배지 OK | `wbsParent` 원본이 응답에 남는다(T-F10). 구분이 **사실이다** |
| `PARENT_JIRA` / `PARENT_JIRA_SHADOWED` | Jira 표준 `parent` 필드 | **Jira** 배지 OK | 동일 |
| `FOLDER_CHILD` / `FOLDER_MEMBER` / `FOLDER_LINK` | 앱 DB (`gantt_folder*`) | **워크포스** 배지 OK | 앱 전용 저장소가 맞다(§6-1 #3) |
| **`BLOCKS`(선후행)** | **Jira 네이티브 이슈 링크 `Blocks` 타입 그 자체** | 🔴 **앱/Jira 배지 금지** | §6-1 #1 — 간트에서 그렸는지 Jira 화면에서 만들었는지 **데이터에 근거가 없다** |
| `ISSUE_LINK:<typeName>` | Jira 네이티브 이슈 링크 | **Jira**, 타입명별 색 | — |

**범례 문구 규약**
- `BLOCKS` 범례 라벨은 **"선후행 (Jira 이슈 링크 · Blocks)"** 한 줄로 끝낸다. "앱에서 만든 선후행" 같은 라벨을 만들지 않는다.
- 위젯 하단 InfoTip 에 §6-1 의 안내를 **한 번만** 정직하게 적는다: *"선후행은 Jira 이슈 링크(Blocks)로 저장됩니다. 앱에서 만든 것과 Jira에서 만든 것은 구분되지 않습니다."*
- **중복 렌더 금지**: `BLOCKS` 는 `ISSUE_LINK` 에 넣지 않는다(계약 규약 1, 서버가 수행).

### D3. T2 이슈 계층 — **프로젝트별 상태 집계 노드** (개별 이슈 노드 불가)

`getPortfolioDashboard` 에 개별 이슈가 없다(T-F15). 선택지:

| 안 | 노드 수 | 비용 | 판정 |
|---|---|---|---|
| **프로젝트별 상태 노드** (`done`/`inProgress`/`todo` 중 count>0 인 것) | ≤ 3P | **0** | ✅ **채택** |
| 전역 상태 노드 3개 + 프로젝트마다 3엣지 | 3 | 0 | ❌ 3P 개 엣지가 전부 3점으로 수렴해 **교차가 극심**하다. 프로젝트별 분포를 노드 크기로 못 읽는다 |
| 개별 이슈 노드 | 수천 | **대규모**(신규 스냅샷 컬럼 + 배치 확장) | ❌ §13-4 제외 |
| `problemIssues` TOP50 을 이슈 노드로 + `assigneeAccountId` 1필드 추가 | 50 | 배치 재실행 필요 | ❌ §13-4 제외 — **부분 데이터가 오해를 만든다**("이 사람은 지연 이슈가 없네?"는 TOP50 밖이라는 뜻일 뿐) |

**채택안의 표현**: 상태 노드는 `symbolSize = f(count)`, 색은 `semanticChartColor`(done=success / inProgress=warning / todo=neutral) — **범주형 팔레트를 쓰지 않는다**(상태는 의미가 고정된 축이므로, `chartPalette.js` 규약). 라벨은 숨기고 툴팁에 `{프로젝트명} · {상태} {n}건`. 각 프로젝트의 상태 노드는 그 프로젝트 y좌표 근처에 배치 → **계층 2→3 교차 0.**

### D4. T2 인력 데이터 — **`getPortfolioDashboard` 만 쓴다** (`getResourceAllocationGraph` 기각)

`getResourceAllocationGraph` 는 `projects/members/links` 를 그대로 주는 **거의 완성된 재료**지만 **쓰지 않는다.**

**기각 사유 (권한)**: 그 resolver 는 `R('RESOURCE_MANAGEMENT')` 이고 시드 Member 는 `RESOURCE_MANAGEMENT read=false`, 반면 포트폴리오는 `R('REPORT','list')` 이고 Member 는 `REPORT read=true` 다.
- 포트폴리오에서 쓰려면 grant 를 넓혀야 하는데, `TeamAnalyticsScope` 가 **"🔴 REPORT read 만으로 전 팀을 열지 않는다 — 시드 Member 가 REPORT read=true + projectScope='ALL' 이라 REPORT 기준으로 열면 전 사용자가 전 팀 데이터를 본다"** 고 명문으로 금지한다(T-F16).
- 이것이 CLAUDE.md 의 「동일 데이터 다중 경로」 함정 그 자체다 — 인력 명부를 새 경로로 흘리는 것.
- 위젯을 `requires:'RESOURCE_MANAGEMENT'` 로 게이트하는 우회안도 있으나, **시드 Member 에게 위젯이 보이지 않아 기능이 사실상 죽는다.**

**채택**: `getPortfolioDashboard` 의 `projects[].members[]` 로 인력 노드를 만든다.
- 이 데이터는 **이미 REPORT read 로 그 페이지에 내려오고 있고**, 같은 페이지의 `PortfolioUtilization`·`PortfolioWorkDist`·`PortfolioRoleLevelDist` 3개 위젯이 **이미 사람 단위로 소비 중**이다. 신규 노출이 **0** 이다.
- → **권한 게이트 신설 없음, grant 확장 없음, 우회 경로 없음.**

### D5. 색 — `chartPalette.js` 를 따른다 (기존 관계도의 예외를 늘리지 않는다)

기존 배정 관계도는 자체 `PROJECT_PALETTE` 16색을 쓰는 **팔레트 단일출처 정책의 예외**다(T-F5). 신규 토폴로지는 그 예외를 확산시키지 않는다.

| 대상 | 색 |
|---|---|
| T1 이슈 노드 (상태별) | `semanticChartColor('success'\|'warning'\|'neutral', isDark)` — 완료/진행중/할일 |
| T1 폴더 노드 · 프로젝트 노드 | 중립색(캔버스라 `token()` 대신 hex 상수 — `chartPalette.js` 주석 규약) |
| T1 엣지 타입 9종 | `categoricalPalette(isDark)` 8색 + 중립 1 — **타입 → 색 매핑을 상수 테이블로 고정**한다(인덱스 순환에 맡기면 링크 타입이 추가될 때 기존 색이 전부 밀린다) |
| T2 프로젝트 노드 | `categoricalPalette(isDark)` + **결정적 해시**(`hashString(projectId) % 8`) — 필터로 목록이 바뀌어도 색이 안 튄다(T-F4 ①) |
| T2 상태 노드 | `semanticChartColor` |
| T2 인력 노드 | 중립 단색 + 테두리(다중 배정이면 굵게). 사람마다 색을 주면 100명에서 의미가 없다 |

`isDark` 는 `useColorMode()`, 렌더는 **반드시 `ThemedECharts`(T1) / `ChartBox`(T2) 경유**.

### D6. 아바타 — **T1·T2 둘 다 쓰지 않는다**

- T2: 스냅샷에 `avatarUrl` 자체가 없다(T-F14). 넣으려면 `flattenBulkUsers` 확장 + `members_json` 증가 + **다음 배치 전까지 옛 스냅샷엔 필드 부재**.
- T1: 이슈 노드에 담당자 아바타를 얹으면 상태 색이 사라진다(symbol 은 하나뿐). 상태가 더 중요하다.
- 공통: 기존 `image://` 프리-프로브 자산은 **"Forge 실환경 로드 여부 미확인"이라고 코드 주석이 스스로 밝힌 상태**다(T-F6). 미검증 자산 위에 신규 기능을 세우지 않는다.
- **대체**: 인력 노드는 `displayName` 라벨 + 이니셜(툴팁에 전체 이름). 요구사항의 "인력 노드는 이름/아바타 수준"을 **이름으로 충족**한다.

### D7. T2 배치 위치 — **ResourceTab 의 BentoGrid 안, `workDist` 아래**

"자원 아래"는 두 가지로 읽힌다(T-F17). **(A) `tabs/ResourceTab.jsx` 의 BentoGrid 에 `BentoTile span={6}` 추가**를 채택한다.

근거: 그 탭의 규약이 `portfolio.section.comparisonHint` = **"모든 위젯이 위 필터에 반응합니다"** 이고, 토폴로지야말로 프로젝트 필터로 노드를 줄여야 읽히는 위젯이다. `ComparisonTabs` 밖에 새 최상위 섹션을 만들면 **필터에 반응하지 않는 유일한 위젯**이 되어 규약이 깨진다.

- `portfolioCards.js` 의 Resource 블록에 **`topology: 'topology'` 등록 필수** — 누락 시 접기 버튼이 죽는다(T-F18, RFC-160 전례).
- 높이: 상단 2타일이 `ROW_CARD_HEIGHT=540` 으로 통일돼 있으므로 토폴로지는 `span=6` 전폭 + `rows` 로 세로 확장. `ChartBox` 의 전체화면(`78vh`)이 밀도 문제의 탈출구다.

### D8. T1 권한 — `R('PROJECT','detail')` (DASHBOARD 아님)

토폴로지가 내주는 것은 **작업관리/간트가 소유한 데이터**(이슈 계층·선후행·폴더)다. 그 화면들이 전부 `PROJECT` 게이트다(T-F11).

`DASHBOARD read` 로 등록하면 **PROJECT 를 회수한 설치에서 대시보드 위젯이 작업관리 데이터를 우회 노출**한다 — CLAUDE.md 「한 화면만 막으면 형제 resolver 로 우회된다」 그 자체.

- 시드 Member 는 `PROJECT read=true` 이므로 **기본 설치에서 실사용 영향 0**.
- `WIDGET_SPEC.requires:'PROJECT'` 로 AddChartModal 에서도 같은 값을 본다(판정 두 벌 금지).
- ⚠ `project:'detail'` 스코프가 동작하려면 payload 키가 `projectId` 또는 `project_id` 여야 한다. **입력은 `{ projectId }` 로 고정**한다(M1 insight 는 `project_id` 다 — 두 resolver 의 키가 다르니 훅에서 흡수하고 프론트 호출부에 노출하지 말 것).

### D9. T2 권한·비용 — 신규 게이트 0

- 데이터가 이미 페이지에 내려온 `getPortfolioDashboard` 응답이므로 **권한 판정이 페이지 진입 시 이미 끝나 있다**(`enabled: canRead('REPORT')`).
- **급여 필드에 손대지 않는다** → `costMasked` 분기 불필요, `costGating.js` 확장 불필요.
- 🔴 **읽어서는 안 되는 필드** (`?? 0` 하면 "₩0" 거짓 숫자가 된다): `members[].salary`, `projects[].totalSalary`, `salaryBuckets`, `salaryPolicy`, `tsrSignals(...).resource.*`.
  회귀 가드 `PortfolioCostGate.test.js` · `costGate.test.js` 가 이를 감시한다 — `members[]` 를 새로 소비하므로 **구현 후 이 두 테스트를 반드시 돌릴 것.**

### D10. 노드/엣지 상한과 집계 전략 (조용한 절단 금지)

기존 `capAllocationScale` 의 3원칙을 그대로 따른다: **① 상한 ② `hiddenCount` 반환 ③ 배너 + "전체 표시" 토글**. 그리고 **선정에만 정렬을 쓰고 원배열 순서는 보존**한다(순서를 바꾸면 좌표가 흔들려 그래프가 튄다).

**T1**

| 층 | 값 | 동작 |
|---|---|---|
| 서버 상한 | `MAX_TOPOLOGY_ISSUES = 800` | 페이지 루프 중단 + `truncated:true`. Jira 왕복이 **최대 8회로 묶인다** |
| 프론트 기본 필터 | **"관계 있는 이슈만"(`degree ≥ 1`) 기본 ON** | 실무 프로젝트는 고립 이슈가 대부분이다. 이 한 줄이 노드를 가장 크게 줄인다. 제외 건수는 캡션 표기 |
| 프론트 노드 상한 | `MAX_GRAPH_NODES = 300` (`degree` 내림차순, 동률은 `key` 오름차순으로 안정화) | 초과 시 `hiddenCount` 배너 + "전체 표시" 토글 |
| 엣지 캐스케이드 | 살아남은 노드 양 끝점인 엣지만 유지 | — |
| 알림 | `truncated` · `hiddenCount` · `outOfScopeEdgeCount` · 고립 제외 건수 **4가지를 전부 표기** | 배너 1줄 + 캡션 |

`force` 는 300노드까지가 실용 한계다(그 이상은 `layoutAnimation:false` 여도 초기 수렴이 수 초). 300을 넘겨 "전체 표시"를 누르면 애니메이션을 끄고 경고를 남긴다.

**T2**

| 층 | 값 | 동작 |
|---|---|---|
| 프로젝트 상한 | `MAX_TOPOLOGY_PROJECTS = 12` (`riskScore` 내림차순, 동률은 `projectName` 오름차순) | 3열 레이아웃은 프로젝트가 12를 넘으면 세로가 화면을 벗어난다. `hiddenCount` 배너 + "전체 표시" |
| 인력 캐스케이드 | 남은 프로젝트에 속한 `accountId` 만 (dedup 후) | — |
| 인력 상한 | `MAX_TOPOLOGY_PEOPLE = 120` (`totalEffortMd` 내림차순) | 초과분은 배너로 알림 |
| 상태 노드 | `count > 0` 인 것만 (≤ 3 × 남은 프로젝트) | — |
| 1차 축소 수단 | **페이지 상단 프로젝트 필터** | 위젯 안내 문구에 "위 필터로 프로젝트를 좁히면 더 잘 읽힙니다" |

### D11. 노드 클릭 동작

| 노드 | 동작 | 근거 |
|---|---|---|
| T1 `ISSUE` | `router.open(siteUrl + '/browse/' + key)` — **`IssueComponent` 와 같은 경로**. `window.open` 금지(§F18) | 요구사항 명시 |
| T1 `FOLDER` | 무반응(툴팁만) | 폴더는 Jira 개념이 아니라 열 곳이 없다. 죽은 클릭을 만들지 않는다 |
| T1 `PROJECT`(중심) | 무반응(툴팁에 프로젝트명·이슈 수) | 이미 그 프로젝트 화면 안이다 |
| T2 `PROJECT` | `navigate('/project/' + projectId)` — 프로젝트 상세로 | 포트폴리오에서 가장 자연스러운 드릴다운 |
| T2 `PERSON` | 무반응(툴팁: 이름 · 참여 프로젝트 수 · 총 투입 MD · 가동률) | 포트폴리오에는 `ResourceProfileDrawer` 가 없다. 없는 것을 여는 척하지 않는다 |
| T2 `STATUS` | 무반응(툴팁: 프로젝트 · 상태 · 건수) | 개별 이슈가 없으므로 열 대상이 없다(T-F15) |

### D12. 공용 그래프 모듈 — 신설하되 기존 관계도는 건드리지 않는다

`static/ui/src/components/chart/echart/graph/` 신설:

| 파일 | 내용 | 사용 |
|---|---|---|
| `graphColors.js` | `hashString(str)`, `deterministicColor(key, palette)` — 결정적 해시 컬러(T-F4 ①) | T2 |
| `capGraphScale.js` | `capByRank({items, edges, max, rankBy, showAll})` → `{items, edges, hiddenCount, total}` 제네릭 상한(T-F4 ②) | T1·T2 |
| `graphTooltip.js` | `esc()` + 노드/엣지 분기 formatter 골격(T-F4 ③) | T1·T2 |
| `forceGraphOption.js` | T1 옵션 빌더 (순수 함수, `{nodes, edges, t, isDark, visibleEdgeKinds}`) | T1 |
| `layeredGraphOption.js` | T2 옵션 빌더 (순수 함수, `{layers:[{key,x,nodes}], edges, t, isDark}`) | T2 |

**기존 `pages/resource/allocation/allocationGraphOption.js` 는 이번 범위에서 리팩터하지 않는다.**
근거: ① 테스트 10케이스가 3레이어 구조를 계약으로 고정하고 있다 ② 자원관리 화면은 이 작업과 무관한데 회귀 위험만 진다 ③ 병행 작업(`work-bulk-apply`) 중이라 충돌 면적을 넓히지 않는다.
→ **후속 통합 후보**로 §13-4 에 기록한다(배정 관계도를 `layeredGraphOption` 위로 이관).

> **소유권**: 공용 3종(`graphColors`/`capGraphScale`/`graphTooltip`)은 **먼저 착수하는 모듈이 만든다.** 세 파일 모두 순수 함수이고 작아 충돌 위험이 낮다. 동시 착수 시에는 **M5 가 소유**하고 M6 은 import 만 한다.

---

## 13-4. 하지 않는 것 (T1·T2 명시적 제외)

| 항목 | 이유 | 재검토 조건 |
|---|---|---|
| T1 선후행에 "앱/Jira" 출처 배지 | **데이터에 근거가 없다.** WORK_VIEWS §6-1 이 명시적으로 금지 | 앱이 자체 링크 저장소를 갖게 되면 |
| T1 그래프에서 관계 편집(드래그로 링크 생성/삭제) | 편집은 간트/트리가 소유한다. 대시보드 위젯이 write 를 가지면 낙관 패치·사이클 검증(`detectDagCycle`)까지 복제해야 한다 | — |
| T1 `getProjectGanttData` 확장(`extraLinks[]`) | §13-D1 (B) — 낙관 패치 유실 + 간트/트리 payload 비대 | — |
| T1 교차 프로젝트 / dangling 링크 그리기 | 상대 노드가 없어 그릴 수 없다. `outOfScopeEdgeCount` 로 **건수만** 알린다 | 상대 이슈를 "범위 밖" 유령 노드로 그릴지 — 사용자 피드백 후 |
| **T2 개별 이슈 노드** | 스냅샷에 이슈 raw 가 없다(T-F15). 넣으려면 신규 스냅샷 컬럼 + 배치 확장 + KVS 240KiB 압박. 이슈 수천 건 × 프로젝트 수는 렌더 한계도 넘는다 | 이슈 레벨 드릴다운이 실제 요구로 올라올 때 |
| **T2 사람 ↔ 이슈 직접 엣지** (`problemIssues[].assigneeAccountId` 1필드 추가) | 필드 추가 자체는 싸지만(추가 Jira 0) ① 배치 재실행 전까지 필드 부재 ② **TOP50 부분 데이터라 오해를 만든다** — "이 사람은 지연 이슈가 없다"가 아니라 "TOP50 밖"일 뿐 ③ 3계층 요구는 계층 연결로 이미 충족 | 지연 이슈 담당자 추적이 별도 요구로 올라올 때 |
| T2 아바타 이미지 노드 | §13-D6 — 스냅샷에 없고, 기존 `image://` 자산이 Forge 실환경 미검증 | 배정 관계도 아바타가 실환경에서 뜨는 것이 E2E 로 확인되면 |
| T2 팀 계층 추가(4계층: 팀-인력-프로젝트-이슈) | `teamMeta`/`memberTeamMap` 이 응답에 **있지만 프론트 미소비 고아 필드**다. 4계층은 3열도 빠듯한 폭에 열을 하나 더 넣는 것 | 3계층이 안착한 뒤 |
| 기존 배정 관계도(`allocationGraphOption.js`) 리팩터 | §13-D12 — 회귀 위험만 지고 이번 기능과 무관 | 공용 `layeredGraphOption` 안착 후 **후속 정리 RFC** |
| sankey / tree 차트 도입 | §13-1 비교표에서 기각. 신규 의존성 문제가 아니라 **위상 표현력 문제** | — |
| T1·T2 를 한 화면에서 연결(대시보드 위젯에서 포트폴리오로 드릴업) | 과설계 | — |

---

## 13-5. 호출 비용

기호: `N` = 프로젝트 이슈 수, `P` = 표시 프로젝트 수, `M` = dedup 인력 수.

### T1 (`getProjectRelationGraph`, 위젯 1개당)

| 자원 | 비용 |
|---|---|
| Jira REST | `min(⌈N/100⌉, 8)` — 상한 800으로 **8회 고정 상한** |
| MySQL | **3** (`gantt_folder` · `gantt_folder_issue` · `gantt_folder_link`, `Promise.all` 병렬 · best-effort) |
| KVS | **0** (권한 가드 principal 조회 제외) |
| 서버 캐시 | 모듈 스코프 Promise 캐시 TTL 60s, 키 `viewerId::projectId`, 엔트리 1개 — `DashboardIssueFetcher` 와 **동일 패턴** |

**대시보드 진입 합계 (§D7 표에 이어서)**

| 시나리오 | N=200 | N=500 | N=2000 |
|---|---|---|---|
| M1+M2+M4 (§D7 재게) | 4 | 10 | 40 |
| **+ 토폴로지 위젯 1개** | 4 + 2 = **6** | 10 + 5 = **15** | 40 + **8** = **48** (상한 발동) |
| + `progressTrend` 까지 | 6 + 13 = 19 | 15 + 36 = 51 | 48 + 121 = 169 |

> 토폴로지는 **N=2000 에서 오히려 insight(20회)보다 싸다** — 상한 800이 걸리기 때문. 대신 그때는 `truncated` 배너가 뜬다.

**페이로드**: 노드 800 × ~180B + 엣지 ~1500 × ~90B ≈ **280KB**. insight(2000이슈 ≈ 450KB)보다 작다.
**메모리**: 서버는 페이지 단위로 필요한 필드만 남겨 누적. 모듈 캐시는 엔트리 1개 고정.

### T2 (포트폴리오 토폴로지)

| 자원 | 비용 |
|---|---|
| Jira REST | **0** |
| MySQL | **0** |
| KVS | **0** |
| invoke | **0** — `getPortfolioDashboard` 응답을 **props 로 받는다**(T-F13, 기존 위젯 전체의 패턴) |
| 클라이언트 | `buildPortfolioTopology` 1회 — `useMemo` 로 `selectedProjects` 변경 시에만 재계산. 복잡도 `O(Σ members)` ≈ P×평균인원 |

> **T2 는 포트폴리오 진입 비용을 1도 늘리지 않는다.** 이것이 `getResourceAllocationGraph` 를 기각한 두 번째 이득이다(그쪽을 썼다면 MySQL 1 + Jira bulk `⌈M/100⌉` + KVS ~4 가 추가됐다).

---

## 13-6. i18n 키

### `locales/kr/dashboard.json` (M5, 기존 파일에 병합)

```jsonc
{
  "topology": {
    "title": "관계 토폴로지",
    "empty": "표시할 관계가 없습니다.",
    "isolatedHidden": "관계 없는 이슈 {count}건 숨김",
    "showIsolated": "관계 없는 이슈도 표시",
    "nodeCapped": "노드가 많아 상위 {shown}개만 표시했습니다(전체 {total}개).",
    "showAll": "전체 표시",
    "showTop": "상위 {max}개만",
    "truncated": "이슈 {max}건까지만 조회했습니다. 관계 일부가 빠졌을 수 있습니다.",
    "outOfScope": "다른 프로젝트·조회 범위 밖 이슈와 연결된 관계 {count}건은 그리지 않았습니다.",
    "perfWarn": "노드가 {count}개입니다. 배치 애니메이션을 끕니다.",
    "legend": {
      "title": "관계 종류",
      "parentWorkforce": "상위 (워크포스 지정)",
      "parentJira": "상위 (Jira)",
      "parentJiraShadowed": "가려진 Jira 상위",
      "blocks": "선후행 (Jira 이슈 링크 · Blocks)",
      "folderChild": "폴더 계층 (워크포스)",
      "folderMember": "폴더 소속 (워크포스)",
      "folderLink": "폴더 선후행 (워크포스)",
      "root": "프로젝트 직속",
      "issueLink": "Jira 링크"
    },
    "node": { "project": "프로젝트", "folder": "폴더", "issue": "이슈" },
    "status": { "done": "완료", "inProgress": "진행 중", "todo": "할 일" },
    "tooltip": {
      "assignee": "담당자",
      "unassigned": "미배정",
      "degree": "연결 {count}개",
      "issueCount": "이슈 {count}건"
    },
    "info": {
      "calc": "프로젝트에 연결된 이슈와 그 관계를 그립니다. 상위·폴더는 워크포스가 저장하고, 선후행·Jira 링크는 Jira 이슈 링크에 저장됩니다.",
      "interp": "선후행은 Jira 이슈 링크(Blocks)로 저장됩니다. 앱에서 만든 것과 Jira에서 만든 것은 구분되지 않습니다."
    }
  }
}
```

### `locales/kr/chartOptions.json` (M5, 기존 파일에 병합)

```jsonc
{
  "dataType": {
    "projectTopology": {
      "label": "관계 토폴로지",
      "description": "프로젝트에 연결된 이슈와 상위·폴더·선후행·Jira 링크 관계를 관계망으로 봅니다. 관계 종류별로 선 색이 다릅니다."
    }
  },
  "chartType": {
    "graph": { "label": "관계망", "description": "노드와 선으로 항목 사이의 관계를 표현합니다." }
  },
  "template": {
    "structure": {
      "label": "구조 파악",
      "charts": { "topology": "관계 토폴로지", "size": "이슈 규모" }
    }
  }
}
```

> `structure` 템플릿은 §7 표에 **추가**되는 항목이다(기존 6종은 그대로). 게이트: `topology`=PROJECT, `size`=없음.

### `locales/kr/portfolio.json` (M6, 기존 파일에 병합)

```jsonc
{
  "topology": {
    "title": "인력 · 프로젝트 · 작업 토폴로지",
    "desc": "누가 어느 프로젝트에 투입돼 있고 그 프로젝트의 작업이 어느 상태에 몰려 있는지 한 화면에서 봅니다.",
    "empty": "표시할 프로젝트가 없습니다. 위 필터를 확인해 주세요.",
    "layer": { "people": "인력", "projects": "프로젝트", "status": "작업 상태" },
    "projectCapped": "프로젝트가 많아 위험도 상위 {shown}개만 표시했습니다(전체 {total}개).",
    "peopleCapped": "인력이 많아 투입 상위 {shown}명만 표시했습니다(전체 {total}명).",
    "showAll": "전체 표시",
    "showTop": "상위만 표시",
    "filterHint": "위 프로젝트 필터로 범위를 좁히면 더 잘 읽힙니다.",
    "tooltip": {
      "person": "{name} · 참여 {projectCount}개 · 투입 {effortMd} MD",
      "personUtil": "가동률 {util}",
      "project": "{name} · 인원 {memberCount}명 · 진척 {completion}",
      "status": "{project} · {status} {count}건",
      "edgeEffort": "{name} → {project} · {effortMd} MD"
    },
    "status": { "done": "완료", "inProgress": "진행 중", "todo": "할 일" },
    "info": {
      "calc": "인력·프로젝트 연결은 프로젝트 투입 인력에서, 작업 상태 건수는 최근 집계 스냅샷에서 가져옵니다.",
      "interp": "선이 굵을수록 그 프로젝트에 많이 투입된 인력입니다. 여러 프로젝트에 걸친 인력은 선이 여러 개로 갈라집니다."
    }
  }
}
```

### `locales/en/*` — 같은 키 트리를 영문으로 1:1

⚠ 키 개수 일치를 확인할 것. `{count}건` 같은 한국어 접미사 항목은 en 에서 **빈 문자열로 두지 말고** 포맷 문자열로(`"{count} issues"`). 추가 후 `cd static/ui && npm run merge` — **실행 시점은 리더가 조율**(§D8 병행 작업).

---

## 13-7. 모듈 편입과 선후관계

| 모듈 | 범위 | 백엔드 | DB | 선행 | 독립 배포 |
|---|---|---|---|---|---|
| **M5 — T1 상세 토폴로지** | `getProjectRelationGraph` + `TopologyIssueFetcher` + 공용 `graph/` 3종 + `forceGraphOption` + `TopologyWidget` + WIDGET_SPEC 확장 + 템플릿 `structure` | **신규 resolver 1** | 없음 | **M1**(WIDGET_SPEC 레지스트리 · `ChartTemplate` renderer 분기) | ✅ |
| **M6 — T2 포트폴리오 토폴로지** | `buildPortfolioTopology` 순수함수 + 공용 `graph/` 3종 + `layeredGraphOption` + `PortfolioTopology` 위젯 + `portfolioCards.topology` | **0** | 없음 | **없음** | ✅ |

**M2~M4 와의 선후관계**

```
M1 (백엔드 완료 / 프론트 진행)
 ├─ M2 (목록 렌더러 + 트리맵)
 ├─ M3 (S-curve + BurnUp)
 ├─ M4 (커스텀 필터 + DDL v018)
 └─ M5 (토폴로지)          ← M1 만 선행. M2~M4 와 상호 독립(렌더러가 다름)

M6 (포트폴리오)             ← 어느 모듈에도 의존하지 않음
```

- **M5 는 M2~M4 와 순서를 다툴 필요가 없다.** 렌더러(`forceGraph`)·데이터 소스(`relationGraph`)·파일이 전부 다르다. 겹치는 파일은 `constants/dashboardWidgets.js`(추가만) · `ChartTemplate.js`(분기 추가) · `dashboardTypes.js`(추가만) 3개이고 전부 **append 성 변경**이다.
- **M6 은 이 파이프라인에서 가장 싸고 가장 독립적이다** — 백엔드 0, DDL 0, 추가 왕복 0, 다른 페이지. **M2~M4 보다 먼저 착수해도 무방하다.** 리더가 착수 순서를 정할 때 이 점을 고려할 것.
- **병행 작업 충돌**: M5 는 `pages/projectDetail/dashboard/` · `components/chart/echart/graph/`(신규) · `src/resolver/projectDashboard/`, M6 은 `pages/portfolio/`. `work-bulk-apply` 가 만지는 `pages/projectDetail/issue/` · `gantt/useGanttMutations.js` · `utils/useJiraUserInfos.js` 와 **파일 충돌 없음**. i18n 도 `dashboard.json`/`chartOptions.json`/`portfolio.json` 이라 `projectDetail.json` 과 겹치지 않는다(merge 산출물만 리더 조율).

---

## 13-8. 구현 작업 분해

### M5 — T1 프로젝트·이슈 관계 토폴로지

**backend**
- [ ] `src/resolver/projectDashboard/TopologyIssueFetcher.js` 신규
      - JQL `moves_RMS_projectId = "<uuid>"`, `maxResults=100` + `nextPageToken` do-while, `as:'user'`
      - fields `summary,status,statusCategory,issuetype,assignee,parent,issuelinks` + `properties=[movesRms]`
      - **`timetracking`·`aggregateprogress`·`customfield_10015`·coworker resolve 는 요청하지 않는다**(토폴로지가 쓰지 않음)
      - `MAX_TOPOLOGY_ISSUES = 800` 초과 시 중단 + `truncated:true`
      - 모듈 스코프 Promise 캐시(TTL 60s, 키 `viewerId::projectId`, 엔트리 1개, viewerId 없으면 미사용, 실패 미캐시) — `DashboardIssueFetcher` 와 동일 형태
      - Jira 실패 → `{issues:[],scanned:0,truncated:false}` 부분 폴백(throw 안 함)
      - ⚠ **공통 페처(`getProjectIssuesByFilter`/`fetchAllProjectIssues`/`getProjectGanttIssues`)를 수정하지 않았는지 확인**
- [ ] `src/resolver/projectDashboard/RelationGraphService.js` 신규
      - 노드: PROJECT 1 + FOLDER(`findFoldersByProjectRepository`) + ISSUE
      - 엣지 9종 조립. **`BLOCKS` 는 `ISSUE_LINK` 에서 제외**(계약 규약 1), `ISSUE_LINK` 는 `linkId` dedup(규약 3)
      - 부모: `wbsParent`(프로퍼티) vs `parent`(필드) → `PARENT_WORKFORCE` / `PARENT_JIRA` / `PARENT_JIRA_SHADOWED`. 병합 규칙은 `GanttMapper` 와 동일(`wbsParent(집합 내) ?? jiraParent(집합 내)`)
      - 폴더: `findFolderIssuesByProjectRepository`(소속) + `findFolderLinksByProjectRepository`(폴더 선후행). **best-effort** — 실패 시 `[]`/`{}` 폴백(간트와 동일)
      - `ROOT` 엣지: 부모도 폴더도 없는 이슈 → `project` 노드
      - 끝점이 집합 밖인 엣지는 **제외하고 `outOfScopeEdgeCount` 로 센다**(규약 4)
      - `degree` 계산, `edgeKindCounts`, `linkTypeNames`(정렬) 채우기
      - `Blocks` 판정은 **`type.name === 'Blocks'`** 로만(WORK_VIEWS §6-3). `GanttMapper.BLOCKS_TYPE_NAME` 과 값 일치 확인
- [ ] `ProjectDashboardController.js` — `guardedDefine(resolver, 'getProjectRelationGraph', ({payload, principal}) => …)`, **입력 키는 `projectId`**
- [ ] `src/permission/PermissionMap.js` — `getProjectRelationGraph: R('PROJECT','detail')` 추가 + ProjectDashboard 섹션 주석 개수 갱신(9 → 10)
- [ ] 테스트 `__test__/RelationGraph.test.js` — ① Blocks 가 ISSUE_LINK 에 중복되지 않음 ② `linkId` dedup ③ 부모 3종 분기(shadowed 포함) ④ 집합 밖 엣지 제외 + `outOfScopeEdgeCount` ⑤ 800 상한 + `truncated` ⑥ 폴더 조회 실패 시 폴백 ⑦ 페처 폴백 시 노드 1개(PROJECT)만 있는 정상 응답
- [ ] `npm test` (특히 `permissionMap.contract.test.js`)

**frontend**
- [ ] `components/chart/echart/graph/` 신규 — `graphColors.js` · `capGraphScale.js` · `graphTooltip.js` (공용 3종, **M5 소유**)
- [ ] `components/chart/echart/graph/forceGraphOption.js` 신규 — 순수 함수. `force` 파라미터는 §13-1, 색은 §13-D5(엣지 타입→색 **상수 테이블 고정**), `layoutAnimation: n <= 150`
- [ ] `utils/queryKey/projectKeys.js` — `relationGraph: (projectId) => ['projectRelationGraph', projectId]` 추가. `queryKeyContract.test.js` 통과 확인
- [ ] `hooks/useProjectRelationGraph.js` 신규 — `staleTime` 5분. **`coworkerFieldId` 넣지 말 것**
- [ ] `pages/projectDetail/dashboard/widgets/TopologyWidget.jsx` 신규
      - `ThemedECharts` 경유 필수(직접 `echarts-for-react` import 금지)
      - **커스텀 HTML 범례**(엣지 타입 색·선종 + 건수) — ECharts `legend` 는 노드 `categories` 에만 붙고 엣지 타입에는 못 붙는다. 노드 종류 토글은 ECharts legend, 엣지 종류 토글은 커스텀 범례 클릭
      - `PARENT_JIRA_SHADOWED` 는 **기본 숨김**(점선)
      - `degree ≥ 1` 필터 기본 ON + 토글, `MAX_GRAPH_NODES=300` 상한 + `hiddenCount` 배너 + 전체 표시
      - `truncated` · `outOfScopeEdgeCount` · 고립 제외 건수 **4가지 알림 전부 표기**
      - 이슈 노드 클릭 → `IssueComponent` 와 같은 `router.open` 경로(§13-D11). `window.open` 금지
      - `InfoTip` 에 §6-1 안내 1회(`topology.info.interp`)
- [ ] `ChartTemplate.js` — `source:'relationGraph'` + `renderer:'forceGraph'` 분기 추가
- [ ] `constants/dashboardWidgets.js` — `projectTopology` 항목 추가(§13-2-C)
- [ ] `__test__/dashboardWidgets.test.js` — **정합 검사를 `renderer === 'echart'` 인 항목으로 스코프 축소**(안 하면 M5 에서 거짓 실패)
- [ ] `constants/dashboardTypes.js` — `DATA_TYPES` 에 `projectTopology`, `CHART_TYPES` 에 `graph`(이미지 에셋 필요), `TEMPLATES` 에 `structure` 추가
- [ ] i18n `dashboard.json`(`topology.*`) + `chartOptions.json`(dataType·chartType·template) kr·en → `npm run merge`
- [ ] `CI=true npm run build`

### M6 — T2 포트폴리오 3계층 토폴로지 (백엔드 0)

**backend** — **없음.** resolver·PermissionMap·DDL·KVS·`manifest.yml` 전부 무변경.

**frontend**
- [ ] `components/chart/echart/graph/` 공용 3종 — **M5 가 이미 만들었으면 import 만**, 아니면 여기서 신설
- [ ] `components/chart/echart/graph/layeredGraphOption.js` 신규 — 3열 `layout:'none'`. 좌표 전략은 T-F2 를 참조(열 x 고정, `spread(idx,n)`, 중간층 y=연결 노드 centroid + 최소 간격 push)
- [ ] `pages/portfolio/utils/portfolioAggregate.js` — `buildPortfolioTopology(selectedProjects, opts)` 추가(§13-2-D). **`accountId` dedup 필수**, `count>0` 상태 노드만
- [ ] 🔴 **급여 필드 무접촉 확인** — `members[].salary` / `projects[].totalSalary` / `salaryBuckets` / `salaryPolicy` / `tsrSignals(...).resource.*` 를 **읽지 않는다**
- [ ] `pages/portfolio/widgets/PortfolioTopology.jsx` 신규 — `WidgetCard` + `ChartBox` 경유(다크·전체화면 78vh). 데이터는 **props**(신규 쿼리키 없음)
- [ ] `pages/portfolio/tabs/ResourceTab.jsx` — `workDist` **아래에** `<BentoTile span={6} cardId={PORTFOLIO_CARDS.topology}>` 추가
- [ ] `pages/portfolio/utils/portfolioCards.js` — Resource 블록에 `topology: 'topology'` **등록(누락 시 접기 버튼이 죽는다)**
- [ ] 상한 UI — 프로젝트 12(riskScore desc) · 인력 120(effortMd desc), `hiddenCount` 배너 + "전체 표시", 필터 안내 문구
- [ ] 프로젝트 노드 클릭 → `navigate('/project/'+projectId)`. 인력·상태 노드는 무반응(툴팁만)
- [ ] 테스트 — `utils/__test__/portfolioAggregate.test.js` 에 `buildPortfolioTopology` 케이스 추가(dedup · 0건 상태 노드 제외 · 상한/hiddenCount · **salary 키 미참조**)
- [ ] 🔴 **회귀 가드 실행**: `PortfolioCostGate.test.js` + `pages/portfolio/utils/__test__/costGate.test.js`
- [ ] i18n `portfolio.json`(`topology.*`) kr·en → `npm run merge`
- [ ] `CI=true npm run build`

---

## 13-9. 함정 목록 (T1·T2 추가분 — §11 에 이어서)

13. **선후행에 출처 배지를 달지 말 것.** 데이터에 근거가 없다(WORK_VIEWS §6-1). 상위·폴더는 달아도 되고, 선후행만 안 된다.
14. **`ISSUE_LINK` 를 `linkId` 로 dedup 하지 않으면 모든 Jira 링크가 2개로 그려진다** — Jira 가 같은 링크를 양쪽 이슈에 실어 보낸다.
15. **`Blocks` 판정을 `relation`(표시 문구)으로 하지 말 것.** 로케일·커스텀 링크타입에서 조용히 깨진다. `typeName === 'Blocks'` 만.
16. **`renderer:'forceGraph'` 인데 `chartType:'graph'` 를 `CHART_OPTION_MAP` 에 등록하지 말 것.** 두 경로가 생긴다. 대신 M1 의 정합 테스트를 `renderer==='echart'` 로 스코프 축소해야 거짓 실패가 안 난다.
17. **`portfolioCards.js` 등록 누락** — `cardId` 를 안 넣으면 접기 버튼이 그려지지만 아무 일도 안 한다(RFC-160 에서 실제로 밟은 "죽은 버튼").
18. **포트폴리오 위젯에 신규 `useQuery` 를 만들지 말 것.** 모든 위젯이 `props` 로 받는다 — 새 쿼리를 만들면 그 페이지의 "invoke 1회" 규약이 깨진다.
19. **`members[].salary` 를 `?? 0` 으로 읽지 말 것.** `costMasked` 시 **키 자체가 없어서** 0이 아니라 "모름"이다. 토폴로지는 아예 읽지 않는 것이 정답.
20. **`accountId` dedup 누락** — 한 사람이 3개 프로젝트에 있으면 인력 노드가 3개 생긴다.
21. **`layout:'none'` 에서 정렬로 원배열 순서를 바꾸지 말 것.** 상한 선정에만 정렬을 쓴다 — 순서를 바꾸면 y 좌표가 통째로 흔들려 필터를 만질 때마다 그래프가 튄다(`allocationScale.js` 주석).
22. **`force` 에 300노드 넘게 넣지 말 것.** `layoutAnimation:false` 여도 초기 수렴이 수 초다. 상한을 UI 로 노출하고 사용자가 넘기면 경고를 남긴다.
23. **`ThemedECharts`(T1) / `ChartBox`(T2) 를 우회하지 말 것.** `echarts-for-react` 직접 import 시 `theme='dark'` 가 **조용히 no-op** 되어 다크 모드에서 축·범례가 묻힌다.

---

## 13-10. 미해결 / 리더 확인 필요 (§12 에 이어서)

| # | 항목 | 기본(보수적) 가정 | 확인 시 바뀌는 것 |
|---|---|---|---|
| Q5 | T1 `MAX_TOPOLOGY_ISSUES=800` / `MAX_GRAPH_NODES=300`. 실측 없이 정한 값이다 | 800/300 + 배너 + 전체 표시 토글 | 실사용 프로젝트가 작으면 상한이 아예 발동 안 함. 크면 300에서 잘리는 빈도를 보고 조정(계약 변경 없음 — 상수만) |
| Q6 | T2 프로젝트 상한 12, 인력 상한 120 | riskScore/effortMd desc + 배너 | 3열 레이아웃 세로 길이는 실화면 확인 후 조정 |
| Q7 | T1 위젯이 `PROJECT read` 를 요구한다(§13-D8). `DASHBOARD read` 만 가진 사용자에게는 안 보인다 | 시드 Member 는 PROJECT read=true 라 기본 설치 영향 0 | PROJECT 를 회수한 커스텀 세트가 실제로 있다면 그 설치에서 위젯이 사라진다 — 의도된 동작 |
| Q8 | T2 이슈 계층을 "프로젝트별 상태 3노드"로 고정했다. 사용자가 기대한 "이슈"가 개별 이슈일 수 있다 | 집계 노드(데이터 한계 — T-F15). 위젯 InfoTip 에 한계를 명시 | 개별 이슈가 꼭 필요하면 §13-4 의 스냅샷 확장이 필요(대규모) |
| Q9 | 기존 배정 관계도(`allocationGraphOption.js`)를 공용 `layeredGraphOption` 위로 이관하지 않았다 | 이번 범위 밖(회귀 위험) | 후속 정리 RFC 로 분리 |

---

# 14. 스콥 토폴로지 실이슈화 — 단계적 전개(M8)

> 근거: `00_input/addendum_topology.md` **보강 5**(사용자 — M7 집계 노드 기각) + 리더 추가 지시(**단계적 호출/드릴다운 확정**)
> 기준 계약: `02_backend_report.md` §11(M5) · §13(M7) · `02_frontend_report.md` §M7(현 구현)
> **§1~§13 은 수정하지 않았다.** 이 절만 추가된다. 모듈: **M8**
> 🔴 **§13-D3(T2 이슈 = 프로젝트별 상태 집계 노드)은 이 절로 대체된다.** §13-10 Q8 이 그 위험을 예고했고 기각됐다.

---

## 14-0. 조사로 확정된 사실

| # | 사실 | 확인 위치 | 설계 영향 |
|---|------|----------|----------|
| **M8-F1** | 포트폴리오 스냅샷 배치는 **`as:'app'` 으로 집계한다.** 워크로그·이슈·사용자 페치 전부. 전용 테스트가 이를 **계약으로 고정**하고 있다 | `PortfolioAggregator.js:331-338`, `__test__/PortfolioAggregatorAsApp.test.js` | **A안(스냅샷에 이슈 저장)의 결정적 기각 사유** — asApp 수집물에는 호출자가 Jira 에서 볼 수 없는 이슈가 섞여 있다(§14-D1) |
| **M8-F2** | `getPortfolioDashboard` 는 `scopedProjectIds(principal)` 로 **`projects[]` 를 스코프 필터한다**(MEMBER_ONLY/TEAM_ONLY → `memberProjectIds`) | `PortfolioDashboardService.js:160-164` | 화면에 뜬 프로젝트 자체가 이미 스코프 안이다 |
| **M8-F3** | `guardedDefine` 의 `project:'detail'` 검증도 **같은 `scopedProjectIds` 를 호출한다** | `permissionGuard.js:40-46`, `PrincipalResolver.js:460-465` | 드릴다운 resolver 를 `project:'detail'` 로 걸면 **"화면에 뜬 프로젝트만 전개 가능"이 구조적으로 보장**된다(§14-D5) |
| **M8-F4** | 포트폴리오 응답은 이미 `problemIssues[]`(글로벌 TOP50, `issueKey`·`summary`·`assignee` 포함)를 **`R('REPORT','list')` 로 내보내고 있다** | `PortfolioDashboardService.js:307,337` | 이슈 **식별 정보**는 이미 REPORT 등급이다 — 드릴다운이 새로운 데이터 등급을 만들지 않는다 |
| **M8-F5** | 스냅샷 JSON 컬럼은 `members_json`·`monthly_effort_json`·`weekly_effort_json`·`spaces_json` 4개. `problem_issues_json` 같은 이슈 목록 컬럼은 **없다** | `ddl/portfolioSnapshot.sql.js` | A안은 신규 컬럼 + v020 필요 |
| **M8-F6** | `createSingleEntryPromiseCache` 는 **엔트리를 1개만** 유지한다 | `projectDashboard/singleEntryPromiseCache.js` | 스페이스를 여러 개 전개하면 서버 캐시가 스래싱한다 → **클라이언트 쿼리키 캐시가 1차 방어선**이어야 한다(§14-D4) |
| **M8-F7** | M5 이슈 노드 크기식(확정): `scaleNodeSize` = `round(16 + (maxSize-16) × sqrt(min(value/max,1)))`, **값이 없거나 ≤0 이면 `DEFAULT_NODE_SIZE = 14` 고정**. 이슈는 `createNodeSizer(issues.map(n=>n.actualMd))`(maxSize 기본 60) | `components/chart/echart/graph/capGraphScale.js`, `TopologyWidget.jsx` | M8 이슈 노드는 **이 식을 그대로** 쓴다(§14-D6) |
| **M8-F8** | M5 이슈 클릭은 `router.open(siteUrl + '/browse/' + key)` (`@forge/bridge`). 포트폴리오 프로젝트 클릭은 react-router `navigate('/project/:id')`. **`window.open` 은 Custom UI iframe 에서 동작하지 않는다** | `TopologyWidget.jsx`, `PortfolioTopology.jsx:278-285` | 두 관례가 **한 그래프 안에 공존**한다 → 클릭 대상별 동작표 필수(§14-D7) |
| **M8-F9** | M5 는 스페이스 색에 `assignDeterministicColors`(**충돌 해소**), 포트폴리오는 `deterministicColor`(충돌 허용)를 쓴다 | `graphColors.js` 소비처 | 이슈가 스페이스 색을 상속하려면 M8 도 **충돌 해소 쪽**으로 옮겨야 같은 색 두 스페이스가 안 생긴다 |
| **M8-F10** | `buildForceGraphOption` 의 라벨 규칙은 `symbolSize >= LABEL_MIN_SIZE(26)` 자동 표시. 노드가 자체 `label` 을 주면 **호출부가 이긴다**. `force.layoutAnimation = nodeCount <= ANIMATED_NODE_LIMIT(150)` | `graph/forceGraphOption.js` | 전개 후 노드가 150을 넘으면 **애니메이션이 자동으로 꺼진다** → 재안정화 흔들림이 오히려 줄어든다(§14-D8) |
| **M8-F11** | 현재 `buildPortfolioTopology` 상한: `TOPOLOGY_MAX_PROJECTS = 12`(riskScore desc), `TOPOLOGY_MAX_PEOPLE = 120`(totalEffortMd desc). `capByRank` 가 `hiddenCount`·`total` 을 항상 반환 | `portfolio/utils/portfolioAggregate.js:527-529` | 이슈 축 상한을 **같은 방식**으로 추가한다 |
| **M8-F12** | 현재 `statusNodes` 는 `count>0` 인 것만, id 는 `status:${ownerId}:${statusKey}`. 프론트 테스트가 **`Σ statusNodes.count === issueSummary`** 를 고정 | `portfolio/utils/__test__/portfolioAggregate.test.js` | 상태 노드를 걷어내면 이 불변식을 **`Σ spaceNodes.count === issueSummary`** 로 이관해야 한다(§14-D3) |
| **M8-F13** | `spaceNodes` 는 현재 `{id, projectId, spaceKey, spaceName, count}` 만 갖는다 — 상태별 3건수는 `statusNodes` 에만 있다 | 동상 | 상태 노드를 폐기하려면 `spaceNodes` 에 `done/inProgress/todo` 를 **옮겨 실어야** 정보 손실이 0이 된다 |
| **M8-F14** | 포트폴리오 위젯은 전부 **props** 로 데이터를 받는다("페이지 진입당 invoke 1회" 규약). `portfolioKeys` 에는 `dashboard()` 하나뿐 | `portfolioKeys.js`, `ScopeTab.jsx` | 드릴다운은 **그 규약의 첫 예외**다 — 진입이 아니라 **사용자 클릭이 유발**하므로 규약의 취지(진입 비용)는 지켜진다(§14-D2) |
| **M8-F15** | 스냅샷 배치: `interval: day`(**하루 1회**, 시각 지정 불가) · `timeoutSeconds: 600` · `PROJECT_CONCURRENCY = 2` · **`upsertSnapshot` 이 `for…await` 직렬 1행/쿼리** | `manifest.yml:99,116-118`, `PortfolioAggregator.js:51,566,588-590` | A안의 **쓰기 시간 병목**과 stale 폭(최대 24h)의 근거(§14-D1) |
| **M8-F16** | 🔴 `problemIssues[]`(글로벌 TOP50)는 **스코프 필터를 받지 않는다.** MEMBER_ONLY/TEAM_ONLY 사용자도 비소속 프로젝트의 `issueKey`·`summary`·`assignee` 를 최대 50건 본다. 코드 주석이 이를 **"한계"로 명시**하고 있다 | `PortfolioDashboardService.js:161(주석),306-307` | 이슈 식별 정보가 REPORT 등급인 것은 사실이나 **그 한계를 근거로 삼지 않는다.** M8 은 오히려 그보다 엄격하다(§14-D5) |
| **M8-F17** | 스토리지 한도 `DEFAULT_LIMIT_BYTES = 1 GiB`(env `STORAGE_LIMIT_BYTES` 오버라이드), 경고 80%·위험 90%(프론트 단일 정의). `StorageQuery.TABLE_STATS` 는 신규 테이블을 자동 계상하지만 **프로젝트별 분해는 `PROJECT_ROW_COUNTS` 배열에 수동 등록**해야 한다 | `resolver/storage/storageConstants.js`, `StorageQuery.js` | A안 채택 시 등록 누락하면 신규 테이블이 통째로 `unassignedBytes` 로 빠진다 |
| **M8-F18** | 현재 스냅샷 1행 크기 ≈ **3~20KB**(`members_json` 1~13KB + `weekly_effort_json` 1.6~4.7KB + 나머지). 프로젝트 100개 → **0.3~2MB = 예산의 0.03~0.2%**. `problem_issues_json` 컬럼은 **없다**(TOP50 은 KVS `portfolioRollup:current`) | `ddl/portfolioSnapshot.sql.js`, `PortfolioAggregator.js` | 현 스키마는 예산에 무시 가능. A안이 추가할 축의 기준선(§14-2) |

---

## 14-1. 설계의 한 문장

> 초기 뷰는 **M7 이 이미 저장해 둔 스페이스 집계**(추가 로드 0)로 그리고 스페이스 노드에 **이슈 건수**를 얹는다. 사용자가 **스페이스 노드를 클릭하면 그 스페이스의 실이슈만** `asUser` 로 온디맨드 페치해 전개한다. 즉 **M7 산출물은 폐기 대상이 아니라 초기 뷰의 재료로 승격**되고, 노드 폭발은 "전량을 어떻게 줄일까"가 아니라 **"애초에 안 그린다"** 로 해소된다.

---

## 14-2. 데이터 조달 비교 (A / B / C)

기호: `P` = 표시 프로젝트 수(≤12), `S` = 프로젝트당 스페이스 수, `M` = 클릭한 스페이스의 이슈 수, `N` = 프로젝트 이슈 수.

| | **A. 스냅샷에 이슈 저장** | **B. 온디맨드(채택)** | C1. M5 `getProjectRelationGraph` 재사용 | C2. 프론트 직접 Jira 호출 | **X. 초기 전량 로드**(리더 지시로 기각, 비교용) |
|---|---|---|---|---|---|
| 진입 비용 | 0 | **0** | 0 | 0 | `P × ⌈N/100⌉` ≈ **60회**(P=12,N=500) |
| 전개 1회 | 0 | **`⌈min(M,300)/100⌉` = 1~3회 Jira + KVS 1** | `min(⌈N/100⌉,8)` + SQL 1 + KVS 1 | `⌈M/100⌉` | (전개 개념 없음) |
| 저장 증가 | **+50MB**(10만 이슈, 500B/행) — 예산의 4.7%. **용량은 통과** | 0 | 0 | 0 | 0 |
| 배치 영향 | 🔴 **직렬 upsert 600초 초과** → bulk insert 개편 필요 | 없음 | 없음 | 없음 | 없음 |
| 신선도 | 🔴 **최대 24h stale**(`interval: day`) | **실시간** | 60s/5분 캐시 | 실시간 | 실시간 |
| 🔴 권한 | **asApp 수집물 → Jira 비공개 이슈 노출**(M8-F1) | **asUser → Jira 권한이 자연 필터** | asUser ✅ | asUser ✅ | asUser ✅ |
| 페이로드 | 응답 비대(전 프로젝트 이슈 동봉) | **~75KB/전개** | 800이슈 + `issuelinks` = 비대 | 소 | 매우 큼 |
| 판정 | ❌ | ✅ **채택** | ❌ | ❌ | ❌ |

### A안 — 저장 용량은 통과한다. 기각 사유는 권한과 배치다.

**행 크기 산정** (`normalizeIssue` 최소 필드 → 관계형 컬럼 매핑. `StorageService` 가 `data_length + index_length` 로 재므로 **인덱스 포함**으로 잡는다)

| 컬럼(제안) | 타입 | 실효 바이트 |
|---|---|---|
| `issue_key` | VARCHAR(50) | ~11 |
| `project_id` | BINARY(16) | 16 |
| `space_key` | VARCHAR(50) | ~7 |
| `summary` | VARCHAR(255) — **`problemIssues` 와 같은 255자 캡** | ~52~257 |
| `status_key` | VARCHAR(20) | ~9 |
| `assignee_account_id` | VARCHAR(128) | ~25~31 |
| `due_date`·`start_date` | DATE ×2 | 6 |
| `planned_seconds`·`actual_seconds` | INT ×2 | 8 |
| payload 소계 | | **~130(min) / ~330(max)** |
| + TiDB 행 오버헤드 + clustered PK + 보조 인덱스 2(`project_id`,`status_key`) | | ×2.0~2.5 |
| **실효 행 크기** | | **≈ 300B(낙관) / 500B(현실) / 800B(보수)** |

**수용 이슈 수** (1 GiB = `DEFAULT_LIMIT_BYTES`, 경고선 80%)

| 예산 배분 | 300B/행 | **500B/행** | 800B/행 |
|---|---|---|---|
| 30% (322MB) — 안전 운영 기준선 | 1.07M | **644K** | 403K |
| 50% (536MB) | 1.79M | 1.07M | 671K |
| 80% 경고선 (859MB) | 2.86M | 1.72M | 1.07M |

**현실 규모**: 프로젝트 100개 × 평균 1,000 이슈 = **10만 행 ≈ 50MB = 예산의 4.7%.**
(참고 기준선: 현재 스냅샷 전체가 프로젝트 100개에 0.3~2MB — M8-F18.)

→ **1 GiB 예산만 보면 A안은 넉넉히 통과한다.** 그러니 "용량이 커서 안 된다"는 논거는 쓰지 않는다. 위험 구간은 이슈 50만 건 이상 규모의 설치뿐이다. 실제 기각 사유는 다음이다:

1. 🔴 **권한 우회 (결정적)** — 배치는 `as:'app'` 이다(M8-F1, 전용 테스트가 계약으로 고정). 그 수집물에는 **호출자가 Jira 에서 볼 수 없는 이슈가 들어 있다.** 현재 스냅샷이 내주는 것은 건수·MD·가동률 같은 **집계 수치**라 개별 이슈 가시성 문제가 약하다. 이슈 목록 **전량**을 `REPORT read` 전원에게 내주면 **Jira 비공개 이슈의 키·요약이 그대로 샌다.** 요구사항이 지목한 "asUser 면 Jira 권한이 자연 필터"가 정확히 이 지점이다.
   ⚠ `problemIssues` TOP50 이 이미 같은 성질의 노출을 갖고 있지만(M8-F16), **그것은 코드 주석이 "한계"로 인정한 기지 결함이지 정당화 근거가 아니다.** "이미 새는 곳이 있으니 더 새도 된다"로 읽지 말 것.
2. 🔴 **배치가 시간 안에 못 끝낸다** — `upsertSnapshot` 은 지금 `for…await` **직렬 1행/쿼리**이고 `timeoutSeconds: 600`, `PROJECT_CONCURRENCY = 2` 다(M8-F15). 이슈 10만 행을 1행씩 넣으면 600초를 넘긴다. 해결하려면 `CommonQuery.generateValuesClause` 로 **멀티행 bulk insert(200~500행/문)** 를 도입하고 배치 쓰기 구조를 개편해야 한다 — 드릴다운 하나를 위해 **스냅샷 배치 전체를 손보는 일**이 된다.
3. **행 회전 정책이 필요하다** — 스냅샷은 프로젝트 단위 UPSERT지만 이슈는 삭제·이동된다. delete-then-insert 또는 고아행 정리가 없으면 **위 표가 무의미해지고 무한 누적**된다. 그 정리 로직은 신규 설계 대상이다.
4. **신선도** — `interval: day` 라 **최대 24시간 stale** 하다(M8-F15). 드릴다운의 질문은 "**지금** 무엇이 비용이 큰가"인데 오늘 만든 이슈가 안 보이고, 이미 삭제된 이슈를 클릭해 Jira 404 로 보낼 수 있다.
5. **성장 축을 하나 더 만든다** — 스토리지 모니터링(`/backoffice/storage`)을 만든 취지가 **Forge SQL 1 GiB 누적으로 앱이 정지하는 것을 예방**하는 것이다. 50MB 는 지금 작지만 이슈는 단조 증가하고, 화면 하나를 위해 전사 이슈를 복제 저장하는 것은 그 취지와 방향이 반대다. (`weekly_effort_json` 이 이미 기간에 선형으로 무제한 성장하는 축이다 — 축을 더 늘리지 않는다.)
6. **모니터링 등록 누락 위험** — 신규 테이블은 `TABLE_STATS` 에 자동 계상되지만 프로젝트별 분해는 `PROJECT_ROW_COUNTS` 수동 등록이 필요하다(M8-F17). 빠뜨리면 **가장 큰 테이블이 화면에서 `unassignedBytes` 로 숨는다.**

**A안의 유일한 장점**(배치가 이미 이슈를 페치하고 `aggregateOneProject` 반환 시 버리므로 **추가 Jira 왕복 0** — write 만 끼우면 된다)은 인정한다. 그러나 1·2번을 상쇄하지 못한다.

### C1 — M5 `getProjectRelationGraph` 재사용 기각

| 사유 | 내용 |
|---|---|
| **권한 축이 다르다** | `R('PROJECT','detail')`. 포트폴리오는 `REPORT` 다. 이 화면에서 부르면 PROJECT 를 회수한 설치에서 위젯이 죽거나, 열려고 grant 를 넓히면 §13-D8 이 막은 우회가 생긴다 |
| **스페이스 필터가 없다** | 스페이스 하나를 보려는데 프로젝트 전량(≤800)을 끌어온다 |
| **필요 없는 것을 무겁게 싣는다** | `issuelinks`·`parent`·`wbsParent` 로 만든 **관계 엣지 3분류**는 포트폴리오가 그리지 않는다. `issuelinks` 가 페이로드에서 가장 큰 항목이다 |
| **의미도 다르다** | M5 의 루트는 RMS 프로젝트 1개다. 포트폴리오는 이미 프로젝트·스페이스 노드를 갖고 있어 그 계층이 중복된다 |

### C2 — 프론트 직접 Jira 호출 기각

`utils/jiraApi` 로 프론트가 JQL 을 조립하면 `moves_RMS_projectId = "<uuid>"` 술어를 **클라이언트가 만든다**. 사용자가 콘솔에서 다른 uuid 를 넣으면 스코프 밖 프로젝트의 이슈를 조회할 수 있다(Jira 권한은 남지만 **앱의 프로젝트 스코프는 우회**). 서버 resolver 를 두면 `project:'detail'` 가드가 그것을 구조적으로 막는다(M8-F3).

---

## 14-3. 경계면 계약

### 14-3-A. resolver 계약표 (§13-2-A 에 이어지는 추가분)

| resolver 함수 | 신규/기존 | 입력 | 응답 shape | PermissionMap | 대응 프론트 훅 / 쿼리키 | 모듈 |
|---|---|---|---|---|---|---|
| `getPortfolioSpaceIssues` | **신규** | `{ projectId, spaceKey }` | §14-3-B | **`R('REPORT','detail')`** (§14-D5) | `usePortfolioSpaceIssues(projectId, spaceKey, {enabled})` / `portfolioKeys.spaceIssues(projectId, spaceKey)` | **M8** |
| `getPortfolioDashboard` | **기존 무변경** | `{}` | 기존 그대로(`spaces` 포함) | 기존 유지 | 기존 `portfolioKeys.dashboard()` — props | — |
| `getProjectRelationGraph` | **미사용** | — | — | — | M8 이 쓰지 않는다(§14-2 C1 기각) | — |

> **DDL 변경 없음. KVS 변경 없음. `manifest.yml` 변경 없음.** v019(`spaces_json`)는 그대로 쓴다.

### 14-3-B. `getPortfolioSpaceIssues` 응답 shape (정확)

`guardedDefine` 이 루트 스프레드한다 → `result.issues` (`result.content.issues` 아님).

```jsonc
{
  "success": true,

  "projectId": "9f3c…",          // 에코백 — 응답이 어느 요청의 것인지 프론트가 확인
  "spaceKey":  "DWEB",
  "hourRate":  8,                // MD 환산 분모(settings). 툴팁 "5.0 MD" 의 근거
  "scanned":   187,              // 실제로 받은 이슈 수
  "truncated": false,            // MAX_EXPAND_ISSUES(300) 초과로 페이지 루프를 끊었는지
  "orderedByTimeSpent": true,    // ORDER BY timespent 가 적용됐는지 (§14-D4 폴백 시 false)

  "issues": [
    {
      "key": "DWEB-142",
      "summary": "로그인 리팩터링",
      "issueTypeName": "Task",                  // string|null
      "issueTypeIconUrl": "https://…",          // string|null
      "statusKey": "indeterminate",             // 'new'|'indeterminate'|'done'|null
      "statusName": "진행 중",                   // string|null — fields.status.name
      "statusColorName": "yellow",              // string|null
      "assignee": { "accountId": "5b1…", "displayName": "홍길동" },  // object|null (avatarUrl 없음)
      "actualMd": 5.0,                          // number — 노드 크기 재료. 투입 없으면 0
      "plannedMd": 3.5                          // number|null — 툴팁용. null = 미산정(0 아님)
    }
  ]
}
```

**실패 시**: `{ success:false, error:{ name, code, message, cause } }`
- `projectId` 누락 → `cause === 'PROJECT_ID_REQUIRED'`
- `spaceKey` 누락/빈값 → `cause === 'SPACE_KEY_REQUIRED'`
- 스코프 밖 프로젝트 → `PERMISSION_PROJECT_SCOPE_DENIED`(가드가 판정)
- (이 도메인도 `LogicalError(500, 'Internal Server Error', 'CODE')` 3인자 관례 — 코드는 `code` 가 아니라 **`cause`**)

**계약 규약 6가지**

1. **`issues[]` 는 M5 이슈 노드의 부분집합이다.** 필드명·의미를 M5(`RelationGraphService`)와 **정확히 일치**시킨다 — 두 화면이 같은 이슈를 다른 이름으로 부르면 나중에 공용 렌더러를 못 만든다. **없는 것**: `id`(프론트가 `issue:${key}` 로 만든다) · `projectKey`/`projectName`(요청 파라미터가 곧 스페이스다) · `isSubtask`/`degree`(관계를 그리지 않는다).
2. **`plannedMd: null` 은 "미산정"이지 0이 아니다.** `?? 0` 금지.
3. **`actualMd` 는 항상 숫자다.** `0` 은 "투입 없음"이고 → 노드 크기 **기본값 14 고정**(축소·숨김 금지, 보강 2 사용자 지시).
4. **`truncated:true` 면 잘렸다** — 배너 필수. 조용한 절단 금지.
5. **`orderedByTimeSpent:false` 면 절단이 "투입 큰 순"이 아니다.** 이때 배너 문구를 달리해야 한다(§14-D4).
6. Jira 검색 실패 → **`{issues:[], scanned:0, truncated:false}` 부분 폴백**(throw 안 함). 전개가 실패해도 그래프 전체가 깨지지 않는다.

### 14-3-C. `buildPortfolioTopology` 반환 shape 변경 (프론트 순수함수)

**제거**

| 키 | 처분 |
|---|---|
| `statusNodes` | **폐기** — 정보는 `spaceNodes` 로 이전 |
| `ownerStatusEdges` | **폐기** |

**변경**

```js
spaceNodes: [{
  id, projectId, spaceKey, spaceName,
  count,                       // 기존 = done+inProgress+todo
  done, inProgress, todo,      // ★ 신규 — statusNodes 가 갖던 정보를 툴팁으로 이전(M8-F13)
}]
```

**신규(전개 상태 반영)**

```js
issueNodes: [{ id:`issue:${key}`, projectId, spaceKey, key, summary,
               issueTypeName, statusKey, statusName, statusColorName,
               assignee, actualMd, plannedMd }],
spaceIssueEdges: [{ spaceId, issueId }],
expandedSpaceIds: string[],          // 현재 전개된 스페이스 노드 id
hiddenIssueCount: number,            // 이슈 축 상한으로 가려진 수
totalExpandedIssues: number,         // 전개된 스페이스들의 이슈 총수(잘리기 전)
```

**입력 추가**: `buildPortfolioTopology(selected, { …기존, expandedIssues })`
`expandedIssues` = `Map<spaceNodeId, { issues: Issue[], truncated: boolean, orderedByTimeSpent: boolean, total: number }>`
→ **순수 함수 성질 유지**(fetch 는 위젯이 하고 결과만 넘긴다). 급여 필드 미참조 계약도 그대로.

**불변식 재정의** (M8-F12): 기존 `Σ statusNodes.count === issueSummary` →
**`Σ spaceNodes.count === issueSummary`** (스페이스 계층이 있을 때) — 테스트를 이 형태로 이관한다.
⚠ 전개된 이슈 노드 수는 상한·`truncated` 때문에 `count` 와 다를 수 있다. **`spaceNodes.count` 가 진실**이고 이슈 노드는 그 부분집합이다 — 이 관계를 테스트로 고정한다.

---

## 14-4. 핵심 설계 결정

### D1. 데이터 조달 = **B(온디맨드 asUser)** — §14-2 요약

권한(asApp 우회)·신선도·성장 축 3가지로 A 를 기각하고, 권한 축·페이로드로 C1/C2 를 기각했다.
**초기 전량 로드(X)** 는 리더 지시로 이미 기각됐고, 수치로도 진입 60회 vs 0회라 비교가 성립하지 않는다.

### D2. "진입당 invoke 1회" 규약과의 관계

포트폴리오는 **모든 위젯이 props 로 받는다**는 규약을 지켜 왔다(M8-F14, §13-D9). M8 은 그 규약의 **첫 예외**를 만든다.

정당화: 그 규약의 목적은 **"페이지를 여는 것"이 비싸지지 않게 하는 것**이다. 드릴다운 페치는 **진입이 아니라 사용자의 명시적 클릭이 유발**하므로 목적은 그대로 지켜진다. 화면을 열고 아무것도 클릭하지 않으면 추가 invoke 는 **정확히 0**이다.

⚠ 그래서 **초기 렌더에서 자동 전개를 하지 않는다.** "첫 스페이스는 미리 펼쳐 두면 친절하지 않나"는 유혹이 있는데, 그 순간 규약이 깨지고 진입 비용이 생긴다. **전개는 항상 사용자가 시작한다.**

### D3. M7 산출물 처리 — **승격 / 폐기 / 존치**

| 산출물 | 처분 | 근거 |
|---|---|---|
| `spaces_json` 컬럼 · **v019 마이그레이션** | 🟢 **승격(존치)** | 무용해지기는커녕 **초기 뷰의 유일한 재료**가 된다. "추가 로드 0"이 성립하는 이유가 이것이다. 되돌릴 이유가 없다 |
| `computeSpaceRollup`(백엔드 순수함수) | 🟢 존치 | 동상 |
| `classifyStatusKey`(§13-3 단일 출처) | 🟢 존치 | `Σ spaces = issueSummary` 불변식의 근거. 그 불변식은 §14-3-C 로 형태만 바뀌고 살아남는다 |
| `UPSERT_WITH_SPACES` / `SELECT_ALL_WITH_SPACES` + 컬럼 부재 폴백 | 🟢 존치 | 배포 과도기 방어. 무관 |
| `statusNodes` · `ownerStatusEdges`(프론트) | 🔴 **폐기(코드 삭제)** | 아래 |
| 상태 노드 렌더·`sizeStatus` sizer·상태 툴팁 분기 | 🔴 폐기 | 동상 |
| `isSpaceLayerUnavailable` 배너 + 혼합 허용 | 🟢 존치 | 구 스냅샷 과도기 방어는 여전히 필요 |

**"실이슈 미로드 시 집계 폴백으로 상태 노드를 남길 가치가 있는가" → 없다.**

1. **초기 뷰 자체가 이미 그 폴백이다.** 실이슈를 로드하지 않은 상태 = 스페이스 노드가 건수를 들고 서 있는 상태다. 집계 노드를 따로 둘 자리가 없다.
2. **정보 손실이 0이다.** 상태별 3건수는 `spaceNodes.{done,inProgress,todo}` 로 옮겨 툴팁에 그대로 나온다(M8-F13). 노드를 3배로 늘려 표현할 이유가 없다.
3. **드릴다운의 전제를 깬다.** 초기 뷰가 가벼워야 전개할 여유가 생긴다. 상태 노드를 남기면 초기 노드가 `+3×스페이스 수` 만큼 늘어 전개 전부터 붐빈다.
4. **전개 실패의 올바른 처리는 "되돌리기"다.** 집계 노드로 대체하는 것이 아니라 **전개 이전 상태로 복귀 + 에러 배너**다(§14-D9). 실패했는데 다른 모양이 나타나면 사용자는 무엇을 본 것인지 모른다.

### D4. 전개 단위 · 상한 · 선별

**전개 단위 = 스페이스 노드 1개.** 프로젝트 노드 클릭으로 산하 스페이스를 한꺼번에 펼치지 않는다.

| 후보 | 판정 | 근거 |
|---|---|---|
| **스페이스 클릭 → 그 스페이스 이슈만** | ✅ **채택** | 클릭 1회 = 페치 1회 = 예측 가능한 비용. 사용자가 건수를 **보고** 누른다(스페이스 노드에 건수가 적혀 있다) |
| 프로젝트 클릭 → 산하 스페이스 전체 | ❌ | ① 프로젝트 노드는 **이미 `/project/:id` 이동을 갖고 있다**(M8-F8) — 클릭 의미 충돌 ② 스페이스 S개면 페치 S회, 이슈 수백~수천을 한 번에 얹어 드릴다운의 이점이 사라진다 |
| 이슈 노드 클릭 → 관계 확장 | ❌ | 포트폴리오는 이슈 간 관계를 그리지 않는다(그건 M5 의 축이다). 이슈 클릭은 Jira 이동이다 |

**상한 (전부 `capByRank` + 배너 관례를 따른다 — 조용한 절단 금지)**

| 층 | 상수 | 동작 |
|---|---|---|
| 서버 페치 | `MAX_EXPAND_ISSUES = 300` | 페이지 루프 중단 + `truncated:true`. **Jira 왕복이 전개당 최대 3회로 묶인다** |
| 정렬 | JQL `ORDER BY timespent DESC` | 잘릴 때 **투입이 큰 것부터 남긴다** — 사용자 목적("비용 큰 노드 식별")과 정합. ⚠ 실패 시(§Q10) `ORDER BY` 없이 재시도하고 `orderedByTimeSpent:false` 로 알린다 |
| 프론트 스페이스당 | `MAX_ISSUES_PER_SPACE = 200` | `actualMd` desc → 동률은 `key` asc(결정적). 초과분 `hiddenIssueCount` |
| 프론트 전역 | `MAX_EXPANDED_ISSUES = 400` | 전개된 이슈 노드 총합 상한 |
| 동시 전개 | `MAX_EXPANDED_SPACES = 3` | 4번째 전개 시 **가장 오래 전개된 것을 자동으로 접고 배너로 알린다**(§14-D9) |

**왜 `actualMd` desc 로 고르는가**: 보강 4 가 노드 크기를 투입 시간으로 정한 목적이 "어떤 노드가 비용이 큰가"다. 잘라야 한다면 **그 목적에 가장 가까운 것을 남기는 것**이 유일하게 일관된 기준이다. 투입이 전부 0인 스페이스에서는 `key` asc 가 결정적 순서를 준다(같은 입력 → 같은 그림).

**전개 전 예고**: 스페이스 노드에 건수가 이미 적혀 있으므로, `count > MAX_ISSUES_PER_SPACE` 인 스페이스는 툴팁에 **"클릭 시 상위 200건만 표시됩니다"** 를 미리 보여준다. 누르고 나서 알게 하지 않는다.

**서버 캐시**: `createSingleEntryPromiseCache`(TTL 60s)를 **재사용**한다. ⚠ 엔트리가 1개라(M8-F6) 스페이스를 번갈아 전개하면 스래싱한다 — 그래서 **1차 방어선은 클라이언트 쿼리키 캐시**(`portfolioKeys.spaceIssues(projectId, spaceKey)`, `staleTime` 5분)다. 접었다 다시 펴는 것은 **invoke 0**이다. 서버 캐시는 동시 진입·중복 클릭을 흡수하는 2차 방어선이다.
> 헬퍼는 `projectDashboard/singleEntryPromiseCache.js` 에 있다. **복사하지 말고 import 한다**(복제 금지가 그 파일을 뽑은 이유다). 도메인이 갈리는 것이 거슬리면 `src/utils/` 로 승격하는 순수 이동이 가능하나, import 3줄이 바뀌므로 **이번 범위에서는 제자리 import** 를 권한다.

### D5. 권한 — `R('REPORT','detail')`

**결론부터**: 신규 grant 확장 0, 우회 경로 0.

| 축 | 판정 | 근거 |
|---|---|---|
| 리소스 | **`REPORT`** | ① 이 화면(포트폴리오)의 게이트가 REPORT 다 ② 이슈 **식별 정보**(키·요약·담당자)는 `problemIssues` 로 **이미 REPORT 등급**이다(M8-F4) — 새 데이터 등급을 만들지 않는다 ③ M5 가 `PROJECT` 를 요구한 이유(§13-D8)는 **이슈 계층·선후행·폴더 = 작업관리/간트가 소유한 관계 데이터**였다. **M8 은 관계를 하나도 내보내지 않는다**(§14-3-B 규약 1) → 그 근거가 적용되지 않는다 |
| 프로젝트 스코프 | **`'detail'`** | 🔴 **이것이 핵심이다.** `getPortfolioDashboard` 는 `scopedProjectIds(principal)` 로 `projects[]` 를 필터하고(M8-F2), `project:'detail'` 가드는 **문자 그대로 같은 함수**를 쓴다(M8-F3). → **화면에 뜨지 않은 프로젝트는 전개 요청 자체가 거부된다.** 두 판정이 갈릴 수 없다 |

🔴 **`problemIssues` 의 기지 한계를 답습하지 않는다.** `problemIssues[]` 는 글로벌 TOP50 이라 **스코프 필터를 받지 않고**, MEMBER_ONLY 사용자도 비소속 프로젝트의 이슈 키·요약을 본다(M8-F16 — 코드 주석이 "한계"로 인정한 상태다).
M8 의 드릴다운은 **그보다 엄격하다**: `project:'detail'` 가드가 스코프 밖 프로젝트를 거부하고(`PERMISSION_PROJECT_SCOPE_DENIED`), 그 위에 Jira `asUser` 가 한 겹 더 건다. **즉 M8 은 기존 구멍을 넓히는 것이 아니라, 처음부터 그 구멍이 없는 경로를 만든다.**
(`problemIssues` 자체의 스코프 누락은 M8 의 범위가 아니다 — 별건으로 남긴다. §14-10 Q16.)
| Jira 가시성 | **`as:'user'`** | 사용자가 Jira 에서 볼 수 없는 이슈는 검색 결과에 애초에 없다. 앱이 판정할 필요가 없는 부분은 **Jira 에 맡긴다** |
| `TeamAnalyticsScope` 금지 조항 | **저촉 없음** | 그 조항이 금지하는 것은 **"REPORT read 만으로 전 팀 인력 데이터를 여는 것"** 이다(§13-D4, T-F16). M8 은 **인력 데이터를 하나도 추가하지 않는다** — 인력 노드는 M6/M7 이 이미 그리던 것 그대로이고, 신규로 늘어나는 것은 **이슈**다. 인력↔이슈 엣지도 만들지 않는다 |
| 급여·원가 | **무접촉** | `issues[]` 에 금액 필드가 없다. `costMasked`·`stripMemberCost` 분기 불요. 회귀 가드(`PortfolioCostGate`·`costGate`)는 그대로 통과해야 한다 |

⚠ **`asApp` 을 쓰지 않는다.** 배치가 asApp 인 것은 스케줄 트리거에 사용자 컨텍스트가 없기 때문이고(M8-F1), 화면 조회 경로에서 asApp 을 쓰면 정확히 A안의 권한 문제를 그대로 들여오게 된다.

### D6. 이슈 노드 관례 — **M5 와 통일**

| 항목 | 값 | 출처 |
|---|---|---|
| 크기 | `createNodeSizer(issueNodes.map(n => n.actualMd))` → `round(16 + 44×sqrt(min(actualMd/max,1)))` | M8-F7. M5 와 **같은 함수·같은 상수** |
| 미투입(`actualMd <= 0`) | **`DEFAULT_NODE_SIZE = 14` 고정** — 축소·숨김 금지 | 보강 2 사용자 지시 |
| 색 | **자기 스페이스 카테고리 상속**(= 색이 곧 소속) | M5 `buildSpaceCategories` 와 같은 사상 |
| 라벨 | 자체 `label` 을 주지 않는다 → `symbolSize >= 26` 규칙에 위임(큰 이슈만 키 노출, 나머지는 호버) | M8-F10. webkit-dep 룩(보강 3) |
| 클릭 | `router.open(siteUrl + '/browse/' + key)` | M8-F8. **`navigate` 아님, `window.open` 금지** |
| 툴팁 | 키 · 요약 · 상태명 · 담당자 · 투입 MD · 계획 MD(미산정이면 "-") | M5 와 같은 항목 |

**⚠ 색 함수 통일 필요(M8-F9)**: 포트폴리오는 지금 `deterministicColor`(충돌 허용)를 쓴다. 이슈가 스페이스 색을 상속하려면 **`assignDeterministicColors`(충돌 해소)로 바꿔야** 같은 색 스페이스 두 개가 안 생긴다. 프로젝트 노드/엣지 색은 기존 `deterministicColor` 를 유지한다(프로젝트 축과 스페이스 축은 다른 팔레트 슬롯을 쓴다 — 팔레트 8색을 두 축이 나눠 쓰면 결국 겹치므로, **스페이스는 `offset` 을 준 슬롯**에서 배정한다).

### D7. 클릭 대상별 동작표 (충돌 해소)

한 그래프 안에서 **전개**와 **이동**이 공존하므로 대상별로 못박는다.

| 노드 | 클릭 | 재클릭 | 구현 |
|---|---|---|---|
| **인력** | 무반응(툴팁) | — | 열 대상이 없다(포트폴리오에 인력 드로어가 없다 — §13-D11) |
| **프로젝트** | `/project/:id` **이동** | — | **기존 동작 유지**(M8-F8). 바꾸면 회귀 |
| **스페이스** | **전개**(이슈 페치 + 노드 추가) | **접기** | M8 의 신규 동작. `spaceKey === null`(미지정)은 **전개 불가** — JQL 로 표현할 술어가 없다. 툴팁으로 안내 |
| **이슈** | Jira 이동 `router.open` | — | M5 와 통일(D6) |
| **엣지** | 무반응 | — | `params.dataType === 'edge'` 조기 반환(기존 관례) |

**전개 가능함을 어떻게 알리나**: 스페이스 노드에만 `symbol:'roundRect'` + 라벨에 건수(`{name} (n)`)를 표시하고, 전개된 스페이스는 **테두리를 굵게**(`borderWidth 2.5`) 한다. 커서 힌트는 ECharts 캔버스라 제한적이므로 **툴팁 마지막 줄에 "클릭하여 이슈 펼치기 / 접기"** 를 넣는다.
⚠ 3계층 폴백 프로젝트(`spaces` 없음)에는 스페이스 노드가 없어 전개할 대상이 없다 — 기존 `spaceUnavailable` 배너가 그 상태를 이미 설명한다. **프로젝트 노드를 전개 대상으로 승격하지 않는다**(D4 기각 사유 그대로).

### D8. ECharts 동적 전개와 force 재안정화

**옵션은 매번 전체를 다시 만든다(누적 append 아님).** ECharts 는 `series.data` 배열을 병합하지 않고 교체하므로, 상태(`expandedIssues` Map)에서 옵션을 재생성하는 현재 패턴을 그대로 쓴다. `notMerge` 는 **false**(echarts-for-react 기본) — 시리즈 인스턴스와 내부 레이아웃 상태를 유지하기 위해서다. `ChartBox` 가 `notMerge` 를 넘기지 않는지 확인하고, 넘긴다면 이 위젯만 false 로 둔다.

**위치 유지 전략 (3단)**

1. **좌표 스냅샷** — 전개 직전에 현재 노드 좌표를 읽어 둔다.
   ```
   chart.getModel().getSeriesByIndex(0).getData().getItemLayout(i)  // → [x, y]
   ```
   ⚠ **내부 API 다.** 반드시 `try/catch` 로 감싸고, 실패하면 2·3단을 건너뛰고 그냥 재배치한다(1회 흔들림 — 허용 가능한 열화).
2. **상위 3계층 고정** — 인력·프로젝트·스페이스 노드에 스냅샷 좌표를 `x`/`y` 로 주고 **`fixed: true`** 를 건다. ECharts force 는 `fixed` 노드를 움직이지 않는다. → **전개해도 기존 그림이 그대로 있고 이슈만 새로 자란다.**
3. **신규 노드 시드** — 이슈 노드의 초기 `x`/`y` 를 **부모 스페이스 노드 좌표 + 소량 지터**로 준다(force 는 `x`/`y` 를 초기 위치로 쓴다). 화면 밖에서 날아오지 않고 부모 주변에서 퍼진다.

**애니메이션**: `force.layoutAnimation = nodeCount <= 150` 규칙(M8-F10)에 의해 전개 후 노드가 150을 넘으면 **자동으로 꺼진다** — 재안정화 과정이 안 보이고 결과가 즉시 그려진다. 이 규칙이 마침 드릴다운에 유리하게 작동하므로 **바꾸지 않는다.**

**접기**: 해당 스페이스의 이슈 노드/엣지를 상태에서 제거하고 옵션을 재생성한다. 상위 3계층은 `fixed` 라 그대로 남는다 → **접어도 그림이 안 튄다.**

**필요한 소폭 변경 2건**(둘 다 순수 추가, 기존 소비처 무영향)
- `buildForceGraphOption` 이 노드의 `x`·`y`·`fixed` 를 **통과시키는지 확인**하고, 명시 매핑이라 누락된다면 통과를 추가한다.
- `ChartBox` 에 **`onChartReady` 패스스루** 추가(인스턴스 확보용). M5 는 `ThemedECharts` 를 직접 써서 이 문제가 없었지만, 포트폴리오는 `ChartBox` 의 다크·전체화면을 포기할 이유가 없다.

### D9. 알림 — 조용한 절단·조용한 실패 금지

| 상황 | 표기 |
|---|---|
| 서버 절단(`truncated`) | 배너: "스페이스 {name} 의 이슈 {total}건 중 {scanned}건만 조회했습니다." |
| 정렬 폴백(`orderedByTimeSpent:false`) | 위 배너에 덧붙임: "투입 시간 순 정렬을 적용하지 못했습니다 — 잘린 항목이 투입이 큰 것일 수 있습니다." |
| 프론트 스페이스 상한(`hiddenIssueCount`) | 배너: "투입 상위 {shown}건만 표시했습니다(전체 {total}건)." |
| 전역 이슈 상한 | 배너 + 신규 전개 거부 안내 |
| 4번째 전개로 자동 접힘 | 🔴 **자동 접기는 반드시 알린다**: "가독성을 위해 {spaceName} 전개를 접었습니다." (동시 3개 규칙 안내 포함) |
| 전개 실패(`success:false` / 빈 결과) | **전개 이전 상태로 복귀** + 에러 배너. 집계 노드 같은 다른 모양으로 대체하지 않는다(D3-4) |
| 스페이스 계층 부재 | 기존 `spaceUnavailable`(info 톤, "전체 표시" 버튼 비노출 — M7 판단 1 유지) |

기존 배너 블록은 `banners.some(b => !b.info)` 일 때만 "전체 표시" 버튼을 그린다(M7 판단 1). **전개 관련 배너는 대부분 `info` 가 아니라 잘림**이므로 버튼이 켜지는데, 그 버튼은 **프로젝트·인력 상한**용이다. 전개 상한에는 **별도 액션("더 보기")을 붙이지 않는다** — 200건 넘게 그리면 어차피 안 읽힌다. 대신 배너 문구가 프로젝트 필터로 좁히도록 유도한다.

---

## 14-5. 호출 비용

기호: `M` = 클릭한 스페이스의 이슈 수(초기 뷰에 **이미 표시되어 있다**).

| 동작 | Jira REST | MySQL | KVS | invoke |
|---|---|---|---|---|
| 포트폴리오 진입 | 0 | 2 | 2~6 | 1 (`getPortfolioDashboard`, 기존) |
| 스콥 탭 열기 | 0 | 0 | 0 | **0** (props) |
| **스페이스 전개 1회** | **`⌈min(M,300)/100⌉` = 1~3** | 0 | 1 (`hourRate`) | 1 |
| 접기 | 0 | 0 | 0 | 0 |
| 재전개(5분 내) | **0** | 0 | 0 | **0** (React Query `staleTime`) |
| 다른 스페이스 전개 | 위와 동일 | 0 | 1 | 1 |

**시나리오 (P=12 프로젝트, 프로젝트당 스페이스 2개, 스페이스당 이슈 250건)**

| 시나리오 | Jira 왕복 | 비고 |
|---|---|---|
| 열고 아무것도 안 누름 | **0** | 규약 유지(§14-D2) |
| 스페이스 1개 전개 | **3** | 250건 → 3페이지 |
| 3개 전개(동시 상한) | **9** | 사용자가 3번 클릭한 결과 |
| 3개 전개 후 전부 접었다 다시 펴기 | **9** (추가 0) | 클라이언트 캐시 |
| **참고 — 초기 전량 로드였다면** | **`12 × ⌈250×2/100⌉ = 60`** | **진입 시점에** 발생 |

**페이로드**: 전개당 300 이슈 × ~250B ≈ **75KB**. (M5 관계 그래프는 800 이슈 + `issuelinks` 라 이보다 훨씬 크다.)
**노드 수**: 초기 ~150(인력 120 + 프로젝트 12 + 스페이스 ~24) → 3개 전개 후 최대 **550**(+400 상한). `layoutAnimation` 이 150에서 자동으로 꺼져 렌더는 즉시다.
**메모리**: 서버는 단일 엔트리 캐시(엔트리 1개 고정). 클라이언트는 전개된 스페이스 수 × 300 이슈 ≈ 3 × 75KB = 225KB.

---

## 14-6. i18n 키

### `locales/kr/portfolio.json` — `topology.*` 확장

```jsonc
{
  "topology": {
    // ── 기존 키는 유지. 아래는 추가/변경 ──
    "layer": { "issues": "이슈" },                 // ★ 추가. "status"(작업 상태)는 제거

    "expand": {
      "hint": "클릭하여 이슈 펼치기",
      "collapseHint": "클릭하여 접기",
      "loading": "이슈를 불러오는 중…",
      "failed": "이슈를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      "empty": "이 스페이스에 표시할 이슈가 없습니다.",
      "unassignedSpaceNotExpandable": "소속이 확인되지 않은 이슈는 펼칠 수 없습니다.",
      "preWarn": "클릭 시 투입 상위 {max}건만 표시됩니다(전체 {total}건).",
      "autoCollapsed": "가독성을 위해 {name} 전개를 접었습니다. 한 번에 최대 {max}개까지 펼칠 수 있습니다.",
      "limitReached": "이슈 노드가 {max}개에 도달해 더 펼칠 수 없습니다. 다른 전개를 접거나 위 필터로 프로젝트를 좁혀 주세요.",
      "truncated": "{name} 의 이슈 {total}건 중 {scanned}건만 조회했습니다.",
      "unordered": "투입 시간 순 정렬을 적용하지 못했습니다 — 잘린 항목이 투입이 큰 이슈일 수 있습니다.",
      "issueCapped": "투입 상위 {shown}건만 표시했습니다(전체 {total}건)."
    },

    "tooltip": {
      "issueCount": "이슈",                         // ★ 스페이스 노드 건수
      "statusBreakdown": "완료 {done} · 진행 중 {inProgress} · 할 일 {todo}",  // ★ 상태 노드 대체
      "actualMd": "투입 공수",                       // ★ 이슈 노드
      "plannedMd": "계획 공수",
      "assignee": "담당자",
      "unassigned": "미배정",
      "notEstimated": "미산정"
    },

    "info": {
      // ★ 문구 갱신 — "작업 상태는 개별 이슈가 아니라 스페이스별 집계입니다" 문장을 **제거**하고
      //   드릴다운 설명으로 대체한다. 옛 문구가 남으면 지금 화면과 어긋난다.
      "calc": "인력·프로젝트 연결은 프로젝트 투입 인력에서, 스페이스별 이슈 건수는 최근 집계 스냅샷에서 가져옵니다. 스페이스를 펼치면 그 시점의 실제 이슈를 Jira에서 직접 조회합니다.",
      "interp": "스페이스 노드의 숫자는 그 Jira 프로젝트의 이슈 건수입니다. 노드를 클릭하면 실제 이슈가 펼쳐지고, 이슈 노드의 크기는 투입 시간이라 큰 원일수록 비용이 큰 작업입니다. 이슈를 클릭하면 Jira로 이동합니다."
    },

    "sizeNote": "원 크기 = 투입 공수(이슈)·이슈 건수(스페이스). 미산정은 기본 크기로 표시합니다."
  }
}
```

**제거할 키**: `topology.layer.status`, `topology.status.{done,inProgress,todo}`
→ ⚠ 상태 라벨은 `tooltip.statusBreakdown` 이 인라인으로 흡수한다. 다른 위젯이 `topology.status.*` 를 참조하지 않는지 **grep 후 제거**할 것(같은 파일 안 다른 섹션에 동명 키가 있을 수 있다).

### `locales/en/portfolio.json` — 같은 키 트리 1:1

키 개수 일치 확인. `{count}건` 류는 en 에서 빈 문자열 금지, 포맷 문자열로. 추가 후 `cd static/ui && npm run merge`(실행 시점은 리더 조율).

---

## 14-7. 모듈 계획

| 모듈 | 범위 | 백엔드 | DB | 선행 | 독립 배포 |
|---|---|---|---|---|---|
| **M8 — 스콥 토폴로지 실이슈화** | `getPortfolioSpaceIssues` + `PortfolioIssueFetcher` + `buildPortfolioTopology` 개정(상태 노드 폐기·이슈 축 신설) + `PortfolioTopology` 전개 UI | **신규 resolver 1** | **없음** (v019 그대로 사용) | **M7**(커밋 `90aef33` — `spaces_json` 이 초기 뷰 재료) | ✅ |

**다른 모듈과의 관계**
- **M5(상세 토폴로지)와 코드 의존이 없다.** 관례(크기식·클릭·색)만 맞춘다. M5 파일을 수정하지 않는다.
- **M6/M7 산출물 위에 올라간다.** 공용 `graph/` 4종(`capGraphScale`·`forceGraphOption`·`graphColors`·`graphTooltip`)을 그대로 쓴다.
- **v019 마이그레이션은 이미 나갔다.** M8 은 DDL 을 건드리지 않는다. `spaces_json` 이 비어 있는 과도기(배치 미실행)에는 기존 3계층 폴백 + `spaceUnavailable` 배너가 그대로 동작하고, **전개 대상이 없을 뿐 화면은 정상**이다.

---

## 14-8. 구현 작업 분해

### backend

- [ ] `src/resolver/portfolioDashboard/PortfolioIssueFetcher.js` **신규** — 전용 1패스
      - JQL `moves_RMS_projectId = "<uuid>" AND project = "<KEY>" ORDER BY timespent DESC`
      - ⚠ `spaceKey` 는 **JQL 문자열에 그대로 들어간다** → `"` 이스케이프/화이트리스트 검증 필수(Jira 프로젝트 키는 `[A-Z][A-Z0-9_]+` 형식이므로 **정규식 화이트리스트**로 막는 것이 가장 안전하다. 통과 못 하면 `SPACE_KEY_INVALID`)
      - fields `summary,status,statusCategory,issuetype,assignee,timetracking` — **`issuelinks`·`parent`·`project`·`properties` 를 요청하지 않는다**(관계를 그리지 않으므로)
      - `maxResults=100` + `nextPageToken`, `MAX_EXPAND_ISSUES = 300` 초과 시 중단 + `truncated:true`
      - `ORDER BY` 실패(400) 시 **ORDER BY 없이 1회 재시도** → `orderedByTimeSpent:false`. ⚠ **다른 오류는 그대로 전파**(아무 오류에나 폴백하면 조용한 기능 격하가 된다 — M7 D-M7-1 전례)
      - `as:'user'` 고정. Jira 실패 → `{issues:[],scanned:0,truncated:false}` 부분 폴백
      - `createSingleEntryPromiseCache`(TTL 60s) **import 재사용**(복사 금지), 키 `${viewerId}::${projectId}::${spaceKey}`, viewerId 없으면 캐시 미사용
      - ⚠ **공통 페처 무수정** 확인(`getProjectIssuesByFilter`/`fetchAllProjectIssues`/`getProjectGanttIssues`/`TopologyIssueFetcher`)
- [ ] `src/resolver/portfolioDashboard/PortfolioIssueService.js` **신규**
      - `getPortfolioSpaceIssuesService({ projectId, spaceKey, principal })`
      - `getSettingDataService()` → `hourRate`(기본 8). `actualMd = round1(timeSpentSeconds/(hourRate*3600))`, `plannedMd` 는 `originalEstimateSeconds` 없으면 **null**
      - MD 환산식은 M5·진척도 탭과 **동일**해야 한다(`ProgressCalculator` 관례)
      - 입력 검증: `PROJECT_ID_REQUIRED` / `SPACE_KEY_REQUIRED` / `SPACE_KEY_INVALID`
- [ ] `PortfolioDashboardController.js` — `guardedDefine(resolver, 'getPortfolioSpaceIssues', ({payload, principal}) => …)` **principal 전달**
- [ ] `src/permission/PermissionMap.js` — `getPortfolioSpaceIssues: R('REPORT','detail')` + PortfolioDashboard 섹션 주석 개수 `2 → 3`
- [ ] 테스트 `__test__/PortfolioSpaceIssues.test.js` — ① `spaceKey` 화이트리스트(JQL 주입 시도 거부) ② 페이징·300 상한·`truncated` ③ `ORDER BY` 폴백이 **400에서만** 발동 ④ MD 환산·`plannedMd:null` 보존 ⑤ Jira 실패 부분 폴백 ⑥ 캐시 키에 spaceKey 포함·viewerId 없으면 미사용 ⑦ fields 에 `issuelinks`/`parent` **없음** ⑧ 금액 필드 미포함
- [ ] `npm test` (특히 `permissionMap.contract.test.js`, `PortfolioCostGate.test.js`)

### frontend

- [ ] `utils/queryKey/portfolioKeys.js` — `spaceIssues: (projectId, spaceKey) => ['portfolio','spaceIssues', projectId, spaceKey]` 추가. `queryKeyContract.test.js` 통과 확인
- [ ] `hooks/usePortfolioSpaceIssues.js` **신규** — `enabled` 로 전개 시점에만 실행, `staleTime` 5분, `keepPreviousData:false`(전개 대상이 바뀌면 이전 결과를 보이면 안 된다)
- [ ] `pages/portfolio/utils/portfolioAggregate.js` — `buildPortfolioTopology` 개정(§14-3-C)
      - `statusNodes`·`ownerStatusEdges` **삭제**
      - `spaceNodes` 에 `done/inProgress/todo` 추가
      - `issueNodes`·`spaceIssueEdges`·`expandedSpaceIds`·`hiddenIssueCount`·`totalExpandedIssues` 신설
      - 이슈 축 상한을 `capByRank`(rankBy `actualMd` desc, tieBreak `key` asc)로 — **새 정렬 코드를 쓰지 말 것**
      - 🔴 **급여 필드 미참조 계약 유지**(getter trap 테스트가 실행 고정 중)
      - 순수 함수 유지 — fetch 는 위젯이 하고 결과 Map 만 받는다
- [ ] `pages/portfolio/widgets/PortfolioTopology.jsx` — 전개 UI
      - `expandedSpaces` state(순서 있는 Map — LRU 자동 접기용) + 스페이스 클릭 토글
      - 훅을 스페이스별로 호출할 수 없으므로(훅 규칙) **전개 슬롯 3개를 고정 훅 3개**로 두거나 `useQueries` 사용 — `useQueries` 권장
      - 상태 노드 렌더·`sizeStatus` **삭제**, 스페이스 라벨에 건수 표시
      - 이슈 노드: 크기 `createNodeSizer(actualMd)`, 색 = 스페이스 카테고리 상속, 라벨 미지정(자동 규칙 위임)
      - 클릭 분기(§14-D7): edge 무시 → `_kind==='project'` → navigate / `_kind==='space'` → 토글 / `_kind==='issue'` → `router.open`
      - `useJiraSiteUrl()` 로 siteUrl 확보(M5 와 동일)
      - 좌표 스냅샷 + 상위 3계층 `fixed:true` + 이슈 시드 좌표(§14-D8). **`try/catch` 로 감싸고 실패 시 그냥 재배치**
      - 배너 7종(§14-D9)
      - 색 함수를 스페이스 축만 `assignDeterministicColors` 로 전환(§14-D6 ⚠)
- [ ] `components/chart/echart/graph/forceGraphOption.js` — 노드 `x`/`y`/`fixed` **통과 확인**, 누락 시 통과 추가(순수 추가)
- [ ] `pages/portfolio/widgets/ChartBox.jsx` — `onChartReady` 패스스루 추가(추가 prop, 기존 소비처 무영향)
- [ ] 테스트 `portfolio/utils/__test__/portfolioAggregate.test.js` 개정
      - 🔴 불변식 이관: `Σ statusNodes.count === issueSummary` → **`Σ spaceNodes.count === issueSummary`**
      - `spaceKey:null` 보존(합계 유지) — 기존 케이스 유지
      - 이슈 노드 생성·`spaceIssueEdges` 연결·`issue:<key>` id 고유성
      - 이슈 상한(`actualMd` desc, 동률 `key` asc) + `hiddenIssueCount`
      - 전개 0개면 이슈 노드 0 · 초기 뷰 노드 수 = 인력+프로젝트+스페이스
      - **`spaceNodes.count` ≥ 그 스페이스의 이슈 노드 수** (상한/절단 관계)
      - 급여 getter trap 유지
- [ ] 🔴 회귀 가드 실행: `pages/portfolio/utils/__test__/costGate.test.js` + 루트 `PortfolioCostGate.test.js`
- [ ] i18n `portfolio.json` kr·en (§14-6, `topology.layer.status`·`topology.status.*` 제거 전 grep) → `npm run merge`
- [ ] `CI=true npm run build`

---

## 14-9. 함정 목록 (M8 추가분 — §13-9 에 이어서)

24. **`spaceKey` 를 JQL 에 그대로 넣지 말 것.** 정규식 화이트리스트(`^[A-Z][A-Z0-9_]{1,50}$`)로 막는다. 스코프 술어는 서버가 만들지만 **스페이스 술어는 클라이언트가 준 값**이다.
25. **`ORDER BY` 폴백을 넓게 잡지 말 것.** 400 이외의 오류(타임아웃·인증)에 폴백하면 조용한 기능 격하가 된다 — M7 D-M7-1 이 정확히 이 실수였다(`e.message` 판정이 모든 오류를 폴백시켰다).
26. **초기 렌더에서 자동 전개 금지.** "진입당 invoke 1회" 규약이 깨진다(§14-D2).
27. **`statusNodes` 를 지우면서 상태 정보를 같이 지우지 말 것.** `spaceNodes.{done,inProgress,todo}` 로 **옮겨야** 툴팁에서 살아남는다(M8-F13).
28. **불변식 테스트를 삭제하지 말 것.** `Σ statusNodes.count === issueSummary` 는 **형태만 바뀌어 살아남는다**(`spaceNodes`). 지우면 "이슈 수가 안 맞는다"를 잡을 그물이 사라진다.
29. **훅을 반복문에서 호출하지 말 것.** 전개가 가변 개수라 `useQuery` 를 map 으로 돌리면 훅 규칙 위반이다 — `useQueries` 를 쓴다.
30. **`getItemLayout` 은 내부 API 다.** `try/catch` 필수, 실패는 "재배치 1회"로 degrade. 없다고 기능을 막지 말 것.
31. **`fixed:true` 를 이슈 노드에 걸지 말 것.** 상위 3계층만 고정한다. 이슈까지 고정하면 부모 주변에 겹쳐 쌓인다.
32. **자동 접기를 조용히 하지 말 것.** 4번째 전개로 첫 전개가 사라지면 사용자는 자기가 뭘 잘못했는지 모른다 — 배너로 알린다.
33. **`window.open` 금지.** Custom UI iframe 에서 동작하지 않는다. 이슈 이동은 `router.open`, 앱 내 이동은 `navigate` — **한 그래프 안에 둘 다 있으니 헷갈리기 쉽다**(§14-D7 표).
34. **`spaceKey:null`(미지정) 노드를 전개 대상으로 두지 말 것.** JQL 술어가 없다. 클릭해도 아무 일이 없으면 죽은 클릭이다 — 툴팁으로 미리 알린다.
35. **`deterministicColor` 그대로 두면 스페이스 색이 겹친다.** 이슈가 스페이스 색을 상속하는 순간 겹침이 "다른 스페이스인데 같은 색"으로 보인다 — 스페이스 축만 `assignDeterministicColors` 로 옮긴다(M8-F9).

---

## 14-10. 미해결 / 리더 확인 필요 (§13-10 에 이어서)

| # | 항목 | 기본(보수적) 가정 | 확인 시 바뀌는 것 |
|---|---|---|---|
| **Q10** | **JQL `ORDER BY timespent DESC` 가 Jira Cloud 에서 동작하는지 미검증.** `timespent` 는 표준 JQL 필드지만 사이트 구성에 따라 거부될 수 있다 | 400 시 `ORDER BY` 없이 재시도 + `orderedByTimeSpent:false` 배너 | **구현 착수 시 dev 사이트에서 먼저 확인할 것.** 동작하면 절단이 "투입 큰 것부터 남김"이 되어 사용자 목적과 정합. 안 되면 절단이 임의 순서라 배너 문구가 더 중요해진다 |
| **Q11** | `getItemLayout` 내부 API 의존(§14-D8) | `try/catch` + 실패 시 재배치 1회로 degrade | ECharts 6 에서 시그니처가 다르면 좌표 유지 없이 재배치만 남는다(기능은 동작, 체감만 열화) |
| **Q12** | 상한 수치 — 서버 페치 300 / 스페이스당 표시 200 / 전역 400 / 동시 전개 3 | 위 값 + 배너 4종 | 실사용에서 스페이스당 이슈가 대개 50 이하면 상한이 발동하지 않는다. 수백 건이 흔하면 200을 낮추는 편이 읽힌다(상수만 변경, 계약 무영향) |
| **Q13** | 동시 전개 초과 시 **자동 접기(LRU)** vs **신규 전개 거부** | 자동 접기 + 배너 | 사용자가 "왜 내가 편 게 닫혔지"를 불편해하면 거부 방식으로 바꾼다(둘 다 배너 필요) |
| **Q14** | `getPortfolioSpaceIssues` 를 `R('REPORT','detail')` 로 등록(§14-D5). M5 는 같은 성질의 데이터를 `R('PROJECT','detail')` 로 둔다 | REPORT. 근거: 관계를 안 내보내고, 이슈 식별 정보는 `problemIssues` 로 이미 REPORT 등급 | 리더가 "이슈 목록은 무조건 PROJECT" 로 판단하면 `OR([['REPORT','read'],['PROJECT','read']],'detail')` 가 아니라 **`R('PROJECT','detail')`** 로 좁혀야 한다 — 그 경우 PROJECT 를 회수한 설치에서 전개가 막힌다(초기 뷰는 정상) |
| **Q15** | 포트폴리오 "진입당 invoke 1회" 규약에 예외를 만든다(§14-D2) | 사용자 클릭이 유발하므로 규약 취지는 유지 | 규약을 문자 그대로 지켜야 한다면 드릴다운 자체가 불가능하다 — 그때는 A안(스냅샷 저장)뿐이고 §14-2 의 권한·배치 문제를 감수해야 한다 |
| **Q16** | **M8 범위 밖 발견** — `problemIssues[]`(글로벌 TOP50)가 스코프 필터를 받지 않아 MEMBER_ONLY 사용자가 비소속 프로젝트 이슈 키·요약을 최대 50건 본다(M8-F16). 코드 주석이 "한계"로 인정한 기지 상태 | **이번 범위에서 손대지 않는다** — M8 은 이 경로를 쓰지도, 넓히지도 않는다 | 리더가 별건으로 판단하면 `PortfolioDashboardService` 에서 `scopedSet` 으로 `problemIssues` 도 필터하는 수정(수 줄)이 가능하다. 다만 "글로벌 TOP50" 이라는 위젯 의미가 바뀌므로 **제품 결정**이 먼저다 |
