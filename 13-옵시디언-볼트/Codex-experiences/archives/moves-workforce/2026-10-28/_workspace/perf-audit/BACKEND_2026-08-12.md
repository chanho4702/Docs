# 백엔드(src/) 비효율·고비용 로직 감사 — 2026-08-12

- 대상 소스: `develop` @ `f6e521c` 기준 작업 트리 (`src/` 프로덕션 코드 전체)
- 방법: grep 전수 + 정독. 호출부↔피호출부 동시 읽기로 호출 횟수를 **식으로** 산출. DDL과 쿼리를 대조해 인덱스 정합 확인. **코드 수정 없음**
- 추측 배제: 코드에서 읽은 상수·루프 구조·DDL 선언만 근거로 삼았다. 확인 불가한 것은 「미검증」에 남겼다

> **심각도** — **P1** 사용자 체감/비용 큼 · **P2** 조건부·중간 · **P3** 사소

## 제외(재보고 안 함)

| 항목 | 근거 |
|------|------|
| 자원 분석의 프로젝트 단위 1회 페치 + KVS 캐시(Forge SQL 적재 배제) | 의도적 결정 |
| 워크로그 페처 기능별 격리(공통 경로 수정 금지) | 의도적 결정 — 격리된 페처 **내부**의 비효율만 지적한다 |
| 리컨실 예산 200건 절단 / `applyDefaultEstimate` 상한 / 백필 job 상태 기계 | `_workspace/subscription-audit/AUDIT_2026-08-11.md` 기보고 |
| 구독 도메인 일반 | 위 감사 완료 — **비용 관점 신규 지적만** 실었다 |

## 기호

`P` 활성 프로젝트 수 · `I_p` 프로젝트 이슈 수 · `M_p` 프로젝트 인원 수 · `w_i` 이슈 i 워크로그 건수 ·
`U` 등록 사용자 수 · `W` 대시보드 위젯 수 · `B` 큐 배치 수 · `S` 화면 진입 시 동시 invoke 수.

대입 예시는 **P=30 · I=5,000(평균 I_p≈167) · 상세 대상 프로젝트 1,000이슈 · U=500** 기준.

## 테이블 규모 (DDL·코드 실측)

| 테이블 | 행 수 규모 | 근거 |
|---|---|---|
| `users` | 등록 인원, 10²~10³ | `MAX_USER_CANDIDATES=1000`(`TeamService.js:65`), `TEAM_SCOPE_WARN_THRESHOLD=2000`(`PrincipalResolver.js:59`) |
| `projectusers` | Σ(프로젝트 × 투입 인원) | 1회 배정 상한 `TEAM_ASSIGN_MAX=500` |
| `project` | 10¹~10² | — |
| `portfolio_project_snapshot` | 활성 프로젝트당 1행 (+JSON 3컬럼) | PK = `project_id` |
| `gantt_folder_issue` | 이슈 수에 비례 | PK = `issue_key` |

> **워크로그 SQL 테이블은 존재하지 않는다.** `src/rdb/schema/ddl/worklog.js` 는 전체가 주석이고 `ddl/index.js` 에 미등록이다. 워크로그는 전부 Jira REST 경유이므로 **"워크로그 테이블 N+1" 축은 해당 없음**이다.

---

## 요약

| 심각도 | 건수 | 항목 |
|--------|------|------|
| **P1** | 8 | A-1 워크로그 추가조회 페이지 20 · A-2 진척/비용 캐시 무효 · A-3 대시보드 위젯별 전량 스캔 · A-4 `checkJobCompletion` O(B²) · A-5 포트폴리오 배치 무증분 · A-6 가드 고정비 × invoke 수 · A-7 마스터 사전 서버 캐시 부재 · A-8 `BIN_TO_UUID()` 로 PK 인덱스 무력화 |
| **P2** | 17 | B-1 ~ B-17 |
| **P3** | 15 | C-1 ~ C-15 |

**가장 싼 큰 개선**: `maxResult: 20` → `100` 상수 한 글자 (A-1) — `/myWork` 진입 Jira 호출 **275 → 65 (−77%)**.
**두 번째**: `WHERE BIN_TO_UUID(p.project_id) = ?` → `WHERE p.project_id = UUID_TO_BIN(?)` (A-8) — 프로젝트 상세 4개 탭의 전량 조인 제거.

---

# P1

## A-1. 워크로그 추가 조회가 페이지 크기 20으로 순차 — API 기본값 100을 버리고 5배를 더 부른다

- **생산자(API)**: `C:\CloudJira\moves-workforce\src\api\jira\worklog\WorklogApi.js:4` — `maxResult = 100` 이 기본값
- **소비자 ①**: `C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:114-135`
- **소비자 ②**: `C:\CloudJira\moves-workforce\src\resolver\utils\worklog\WorklogService.js:209-230`

```js
// MyWorkService.jsx:118-122 / WorklogService.js:213-217 — 문자 그대로 같은 복사본 2벌
while (true) {
    const res = await getWorkLogByIssueKey({
        issueIdOrKey: issueKey,
        startAt: currentStartAt,
        maxResult: 20});          // ← 기본값 100을 굳이 20으로 낮춘다
```

검색 응답의 인라인 워크로그 상한(`worklog.maxResults`, 통상 20)을 **페이지 크기로 오인해 재사용**한 것으로 보인다. 두 값은 무관하다 — `startAt` 만 20에서 시작하면 되고 페이지 크기는 100이어도 된다.

- **비용**: 워크로그 200건 이슈 1개 = `ceil((200−20)/20)` = **Jira 9회 순차**. `maxResult:100` 이면 `ceil(180/100)` = **2회**.
  `/myWork` 진입에 이슈 200건 중 30건이 워크로그 200건 초과 → 검색 1 + **270회**(`pLimit(5)` → 54라운드). 수정 후 **61회**(12라운드).
- **대조군이 이미 리포 안에 있다**: `ResourceWorklogFetcher.js:6,37-50` · `ProjectCalendarService.js:11,17-34` 는 `EXTRA_PAGE_SIZE = 100` + **병렬**이다. myWork/공통 두 경로만 옛 방식으로 남았다.
- **수정 방향**: `maxResult: 100`. 여력이 되면 `ProjectCalendarService.fetchExtraWorklogs` 형태(offset 목록 → `Promise.all`)로 병렬화까지.

## A-2. 진척도·비용 탭의 10분 KVS 캐시가 **Jira 호출을 한 건도 줄이지 못한다**

- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:49-52` → `:199-215` (`buildIssuesArray`)
- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:66-90` → `:206-218` (`buildByIssue`)

```js
// ProjectProgressService.js:49-52 — 캐시 hit 인데도…
if (cached && new Date(cached.expireTime) >= new Date()) {
    const issues = await buildIssuesArray({ projectId, coworkerFieldId, hourRate });   // ↓
    return assembleResponse(cached.value, issues, thresholdPP);
}
// :200-204 — 가장 비싼 두 페치를 그대로 다시 한다
const [holidayResult, worklogs, rawIssues] = await Promise.all([
    getPublicHolidayListService(),
    getResourceProjectWorklogs({ projectId }),                // 워크로그 전량
    fetchAllProjectIssues({ projectId, coworkerFieldId }),    // 이슈 전량
]);
```

`issues[]`/`byIssue[]` 가 KVS 값 상한(240KiB) 때문에 캐시에서 빠져 있고, 그걸 재구성하려면 결국 원본을 다시 페치해야 하는 구조다. `ProjectCostService.js:70-71` 주석이 이미 인지하고 있다 — *"이 경로는 이미 워크로그·이슈 전량을 재페치하므로"*.

- **비용(1,000이슈 프로젝트, 캐시 hit·miss 무관 동일)**:
  `fetchAllProjectIssues` = `ceil(1000/100)` = **검색 10회** + `getResourceProjectWorklogs` = 검색 1회 + `Σ ceil((w_i−20)/100)`.
  워크로그 20건 초과 이슈가 100건이면 **총 111회 Jira 호출**. 캐시가 절약하는 것은 **JS 집계 CPU뿐**이다.
- 진척도 탭과 비용 탭은 같은 두 페치를 **각각** 수행한다 → 한 사용자가 두 탭을 열면 222회 (B-14).
- **수정 방향**: (a) 캐시 대상을 뒤집는다 — `issues[]`/`byIssue[]` 를 별도 KVS 키로 **청크 분할 저장**(240KiB 상한 회피), 또는 (b) `ProjectRaw:{projectId}` 5분 TTL 공유 캐시를 두고 진척·비용·byIssue 재구성이 **같은 원시 페치 결과 위에서 계산만** 한다. (b)가 탭 간 중복(B-14)까지 함께 없앤다.

## A-3. 프로젝트 대시보드 — 위젯 하나가 이슈 전량 스캔 1벌, 그것도 **동일 쿼리를 2벌**

- **소비자**: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:59-79` — 위젯 **1개당 `invoke('getChartDataById')` 1회**
- **생산자**: `C:\CloudJira\moves-workforce\src\resolver\projectDashboard\ProjectDashboardService.js:265-276`
- **중복의 실체**: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:14` vs `:95`

```js
// IssueApi.js:14  (getAssigneeStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
// IssueApi.js:95  (getIssueParticipantStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
```

**URL이 문자 단위로 같다.** 두 함수는 같은 데이터를 각자 전량 페이지 루프로 긁어와 집계만 다르게 한다(담당자별 건수 / 이슈별 참여자 수). `getChartDataset`(`:176-211`)이 이 둘을 별개 `dataType`(`assignee` / `issue`)으로 분기하므로 두 위젯이 같이 놓이면 **같은 스캔이 2벌** 나간다. 워크로그 위젯만 10분 KVS 캐시가 있고(`WorklogService.js:26-47`) assignee/issue 위젯에는 캐시가 **없다**.

- **비용(1,000이슈 프로젝트)**: assignee 위젯 1개 = 검색 **10회**. assignee + issue 두 위젯 = **20회**(그중 10회 완전 중복).
  `level`/`role`/`team` 위젯은 각각 KVS 마스터 사전 스캔 1~2회씩(A-7과 곱해진다).
  위젯 `W` 개 대시보드 = resolver invoke `W` 회 → 가드 고정비도 `W` 배(A-6).
- **수정 방향**: ① `getAssigneeStats`/`getIssueParticipantStats` 를 **1패스 페처 + 2집계**로 합친다(공통 페처 격리 원칙에 맞게 `projectDashboard` 전용 페처 신설). ② 워크로그 위젯과 동일하게 `Assignee:{projectId}` 10분 KVS 캐시를 붙여 위젯 간·재방문 간 중복을 흡수한다.

## A-4. 큐 완료 판정이 배치마다 전량 fan-in — KVS 읽기가 배치 수의 **제곱**

`C:\CloudJira\moves-workforce\src\queue\consumer.js:240-249` (호출부 `:93`, `:154`, `:215`)

```js
const checkJobCompletion = async (appJobId, totalBatches) => {
    const batchResults = await Promise.all(
        Array.from({ length: totalBatches }, (_, i) =>
            jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
    const doneBatches = batchResults.filter(b => b?.done);
    if (doneBatches.length < totalBatches) return;   // ← 대부분 여기서 조기 return
```

**배치가 하나 끝날 때마다** 전체 배치 상태를 다시 읽는다. 필요량은 `B`인데 실제는 `B×B`.

- **비용**: `KVS_reads = B × (B+1) ≈ B²`
  - 사용자 엑셀 업로드 (`UserService.js:587` `chunk(items, 20)` → `B = ceil(U/20)`):
    U=1,000 → B=50 → **2,550회** · U=5,000 → B=250 → **62,750회** · U=10,000 → B=500 → **250,500회**
  - 구독 백필 (`SubscriptionBackfill.js` `BATCH_SIZE=50` → `B = ceil(N/50)`):
    N=2,000 → B=40 → **1,640회** · N=10,000 → B=200 → **40,200회**
  - `concurrencyLimit`(3/2) 때문에 동시에 여러 벌이 같은 fan-in을 돈다. 재시도가 끼면 더 늘어난다.
- **수정 방향**: 같은 파일 계열의 `getJobBatchService`(`JobService.js:73-80`)가 이미 쓰는 `findByWhere('jobId', appJobId)` **인덱스 조회 1회**로 교체(B>100이면 커서 페이징 필요). 또는 완료 판정을 마지막 배치에서만 수행.

## A-5. 포트폴리오 일 배치가 **증분 없이** 전 프로젝트 전 기간을 매일 재페치

- `C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:276-281`
- 워크로그 초과분 루프: `C:\CloudJira\moves-workforce\src\resolver\resourceAnalysis\ResourceWorklogFetcher.js:35-50`

```js
const [projectUserRows, worklogs, scheduleRows, rawIssues] = await Promise.all([
    getProjectMemberRows(projectId),
    getResourceProjectWorklogs({ projectId, startDate, endDate, as: 'app' }),  // startDate = 프로젝트 시작일
    getProjectWorkersScheduleRepository({ projectId, startDate, endDate }),
    fetchAllProjectIssues({ projectId, coworkerFieldId, as: 'app' }),          // 이슈 전량
]);
```

"어제 이후 변경분" 판정이 어디에도 없다. 변경 여부와 무관하게 모든 활성 프로젝트를 **매일 전 기간 전량 재계산**한다.

- **비용 식(1회 실행 = 1일)**
  ```
  Jira = Σ_p [ 1(워크로그 검색) + ceil(I_p/100) + ceil(M_p/100) ]  +  Σ_{i : w_i>20} ceil((w_i−20)/100)
  SQL  = 1 + 3P
  ```
  대입(P=30, I_p≈167, M_p≈8): 기본항 = 30 × (1+2+1) = **120 Jira 호출**, SQL 91.
  문제는 마지막 항이다. 워크로그 20건 초과 이슈마다 최소 1회가 붙고 `w_i` 는 프로젝트가 늙을수록 단조 증가한다 —
  5,000 이슈 중 10%가 20건 초과면 **+500회/일**, 30%면 **+1,500회/일**로 기본항의 4~12배가 되어 배치 비용을 지배한다.
  이 비용은 **프로젝트 수명 내내 매일 반복**된다(2년 프로젝트면 같은 워크로그를 730회 재페치).
- **수정 방향**: 스냅샷에 `lastAggregatedAt` 을 두고 `updated >= lastAggregatedAt` 카운트 검색 1회로 무변경 프로젝트를 건너뛴다. 또는 워크로그 조회 창을 증분 창으로 좁히고 누적분은 스냅샷에 합산 보존한다.

## A-6. 권한 가드 고정비가 **화면 진입 invoke 수만큼 곱해진다**

- `C:\CloudJira\moves-workforce\src\permission\permissionGuard.js:119-150` — 모든 guarded resolver가 `resolvePrincipal` 통과
- `C:\CloudJira\moves-workforce\src\permission\PrincipalResolver.js:207-215`, `:218`

```js
// :207-215 — 캐시는 buildPrincipal 이 **끝난 뒤에만** 채워진다
const cached = cache.get(accountId);
if (cached && cached.expireAt > Date.now()) return cached.value;
const principal = await buildPrincipal(accountId);   // ← 동시 진입 시 전원이 여기로 들어온다
cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });

// :218 — 비admin(대다수)에게도 Jira REST 왕복이 무조건, 그리고 users SQL(:255)과 직렬로 선행한다
const isAdmin = await isAdministrator();      // asUser GET /rest/api/3/mypermissions
```

30초 L1 캐시(`:62`)는 **화면 진입 사이**에만 듣고 **진입 그 순간**에는 듣지 않는다. React Query가 resolver를 동시에 `S`개 쏘면 `S`개 전부 `buildPrincipal` 을 돈다.

- **비용(캐시 미스 1회당)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
  `/backoffice/users` 진입(동시 invoke 6개) = Jira **6회** + SQL **6회** + KVS **12회**가 순수 가드 고정비.
  그 화면 전체 Jira 호출 7회 중 **6회(86%)** 가 가드다.
- **수정 방향(효과 큰 순)**:
  1. `isAdministrator()` 와 `getUserInfoService()` 를 `Promise.all` 로 병렬화 — 왕복 2단 → 1단 (둘은 독립).
  2. 캐시 값을 `Promise` 로 저장해 in-flight dedup. **단 컨테이너가 갈리면 듣지 않는다**(미검증 참조) — 그래서 1번이 먼저다.
  3. admin 판정을 별도 짧은 TTL로 분리해 비admin 경로의 Jira 왕복을 제거.

## A-7. 마스터 사전(role/level/skill/permission/status/holiday)에 서버 캐시가 없다 — 화면 진입마다 전량 스캔

`getTeamIndex()` 만 60초 모듈 TTL 캐시를 갖는다(`backoffice/team/TeamTreeCache.js:95-104`). 나머지는 호출마다 KVS를 친다.

| 서비스 | 위치 | 1회 KVS 비용 |
|---|---|---|
| `getRoleListService` | `backoffice\role\RoleService.js:36` | `findAll()` 1 |
| `getLevelListService` | `backoffice\level\LevelService.js:86` | `findAll()` 1 |
| `getSkillListService` | `backoffice\skill\SkillService.js:58` | `findAllPaged` **2** (프리셋 141건) |
| `getProjectStatusListService` | `backoffice\projectStatus\ProjectStatusService.js:78` | 1 |
| `getPublicHolidayListService` | `backoffice\publicHoliday\PublicHolidayService.js:34` | 1 |
| `getSettingDataService` | `backoffice\setting\SettingService.js:11` | `findById` 1 |

- **비용 ① `/backoffice/users` 진입**: `roleLevelMap()`(`UserService.js:151-171`)이 `getUserListWithPaging`·`getUserMetaCount`(`:785`) 두 경로에서 각각 호출되고, 프론트가 `getRoleList`/`getLevelList`/`getPermissionList` 를 또 독립 호출 → **role 3 + level 3 + permission 3 = KVS 9회**(필요분 3회).
- **비용 ② `/resource` 인력현황 진입**: `buildPeopleContext`(`ResourceManagementService.js:59-77`)가 role 1 + level 1 + skill 2 + settings 1 + rollup 1 = 6회, 프론트 `SkillMultiSelect.jsx:34` 가 `getSkillList` **2회 더**(방금 서버가 읽은 것과 동일 데이터) = **9회, 그중 3회 순수 중복**.
- **비용 ③ 프로젝트 대시보드**: `getLevelChartData`/`getRoleChartData`(`ProjectDashboardService.js:213-231`)가 위젯마다 호출 → level/role 위젯 `W` 개면 `findAll` **W회**. 같은 파일 `:114-120` 이 `salaryPolicy` 는 "루프 밖 1회"로 명시적으로 호이스팅했는데 level/role은 남았다.
- **수정 방향**: `TeamTreeCache` 와 동형의 모듈 스코프 60초 TTL 캐시를 role/level/skill/permission/status/holiday/setting에 도입. 전부 저변경 사전이고 60초 stale 수용 선례가 이미 있다. 쓰기 경로는 `loadTeamIndexFresh` 처럼 캐시를 우회한다.

## A-8. `WHERE BIN_TO_UUID(p.project_id) = ?` — PK 인덱스를 함수로 무력화

`C:\CloudJira\moves-workforce\src\rdb\query\ProjectDashboard.js:16`

```sql
FROM project p LEFT JOIN projectusers pu ON p.project_id = pu.project_id
WHERE BIN_TO_UUID(p.project_id) = ?          -- ← 인덱스 컬럼에 함수를 씌워 비교
GROUP BY p.project_id
```

인덱스 컬럼을 함수로 감싸면 PK를 못 탄다. **앱 전체에서 이 한 곳만** 이 형태다 — 나머지 전 쿼리는 `project_id = UUID_TO_BIN(?)` 로 인덱스를 탄다(`grep "WHERE BIN_TO_UUID" src/rdb` 유일 매치, 검증 완료).

- **호출부 4곳** — 프로젝트 상세의 **대시보드·비용·진척도·급여 탭 진입마다** 발생한다:
  `ProjectDashboardController`(요약 카드) · `ProjectCostService.js:102` · `ProjectProgressService.js:58` · `ProjectUsersService.js:171`
- **비용**: 호출 1회당 `project` 전 행 스캔 + `projectusers` 전량 조인 후 필터. 프로젝트 100개 × 평균 인원 20명이면 **1행을 얻으려 약 2,000행을 조인**한다(정상이면 PK 1행 + 인덱스 20행).
- **덤**: 이 쿼리가 만드는 `total_salary` 를 진척도는 **쓰지도 않는다** — `ProjectDashboardService.js:37` 주석이 직접 *"진척도 페이지는 total_salary 를 쓰지도 않는다 = 100% 낭비"* 라고 적어 뒀는데, 그 값을 만들기 위한 조인+`SUM`+`GROUP BY` 는 그대로 돈다.
- **수정 방향**: `WHERE p.project_id = UUID_TO_BIN(?)` (파라미터·반환 shape 불변). 추가로 진척/비용은 `findProjectByIdRepository`(PK 1행 lookup)로 갈아타고 인원 수는 이미 페치한 `memberRows.length` 에서 취한다(B-5).

---

# P2

## B-1. `getBulkIssuesByProject` — `maxResults=5000` 단일 요청, `nextPageToken` 루프 없음

`C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:177-198`

```js
const url = route`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=worklog`;  // 기본 5000
const result = await requestJiraJson({ as, url, ... });
return result?.issues || [];      // nextPageToken 을 읽지도, 루프하지도 않는다
```

같은 파일의 `getProjectIssuesByFilter`·`getProjectGanttIssues` 는 `nextPageToken` do-while 루프를 도는데 이 경로만 단발이다. 호출 1회로 싸 보이지만 **`fields=worklog` 를 최대 5,000이슈분 한 번에** 받는다 — 이슈당 인라인 워크로그 20건 × 5,000 = 최대 10만 엔트리가 `memoryMB: 256` 함수 하나에 들어오고, 포트폴리오 배치는 `PROJECT_CONCURRENCY=2` 라 두 프로젝트분이 동시 상주한다. 반대로 Jira가 페이지를 잘라 주면 **초과분이 조용히 누락**되어 공수가 과소 집계된다(어느 쪽이든 손해).

- **소비처**: `WorklogService.js:133`, `ResourceWorklogFetcher.js:75`(→ 진척/비용/포트폴리오 전부), `ProjectService.js:272`
- **같은 결함이 `getProjectIssuesByUser`(`IssueApi.js:206-264`)·`getIssuesByWorklogAuthor`(`:272-315`)에도 있다** — 둘 다 `maxResults=5000` 단발. 대조군 `ResourceLoadFetcher.fetchInProgressIssuesForAccount:95-125` 는 `maxResults=100` + 루프를 제대로 돈다.
- **수정 방향**: `maxResults=100` + `nextPageToken` 루프(기존 패턴 재사용). 페이지 단위로 워크로그를 접어 넣으면 상주 메모리가 상수화된다.

## B-2. `getMyIssueList` — 프론트가 안 쓰는 `worklog` 를 통째로 실어 보낸다

- **생산자**: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:251`(`fields` 에 `worklog` 포함) → `C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:204-215`(`data: issues` 원본 그대로)
- **소비자**: `static/ui/src/pages/myWork/table/useMyIssueTable.js:18`, `static/ui/src/pages/myPage/hooks/useMyPageIssues.js:30`

두 소비자 모두 워크로그를 쓰지 않는다(myPage는 `statusCategory.key` 로 완료 판정만 — `useMyPageIssues.js:11-14` 주석). 그런데 `fields` 가 `getProjectWorklogService`(워크로그가 **필요한** 경로)와 공유돼 한쪽 기준으로 고정돼 있다.

- **비용**: 이슈 500건 × (인라인 워크로그 최대 20건 × author/avatarUrls 객체) → **수 MB 응답**. `/myWork` 는 기본 진입 화면이다.
- **수정 방향**: `getProjectIssuesByUser` 에 `fields` 인자를 열고(기본값 현행 유지 = 무회귀) `getMyIssueListService` 만 `worklog` 를 뺀 집합을 넘긴다.

## B-3. `job_fail` — TTL도 없고 삭제 경로가 **동작하지 않는다**

- **저장**: `C:\CloudJira\moves-workforce\src\queue\consumer.js:54`, `:66` — `jobFailManager.save(...)` (`job`/`job_batch` 는 `saveTTL` 30h 인데 여기만 `save`)
- **삭제**: `C:\CloudJira\moves-workforce\src\resolver\utils\job\JobService.js:66-68`

```js
// JobService.js:67 — findByWhere 가 주는 행은 {key, value} 라 item.id 는 undefined
await Promise.all(items.map(item => jobManager.delete(item.id)));
// :93 — 같은 파일의 job_batch 는 item.key 를 쓴다. 두 함수가 갈렸다
await Promise.all(items.map(item => jobManager.delete(item.key)));
```

저장 payload(`consumer.js:54-58`)에도 `id` 필드가 없다. 게다가 프론트는 `removeFailJobList` 를 호출하지 않는다(`static/ui/src/stores/useJobStore.js:73-74` 는 `removeJobBatch`/`removeJob` 만).

- **비용**: 실패 1건 = KVS 엔트리 1개 **영구 잔존**. 1,000명 업로드에서 미존재 이메일 5%면 회당 50건, 주 1회 운영이면 연 2,600건.
- **수정 방향**: `item.key` 로 정정 + `saveTTL` 적용.

## B-4. 포트폴리오 스냅샷을 전 프로젝트 완료 **후** 일괄 저장 — 타임아웃 시 그날 계산 전량 소실

`C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:506-530`

```js
const settled = await Promise.allSettled(projectRows.map(p => limit(() => aggregateOneProject(...))));
...
for (const s of succeeded) { await upsertSnapshot(s.snapshot); }   // ← 전부 끝난 뒤에야 첫 write, 그것도 1행씩 직렬
```

- **비용/시간**: `T ≈ (P / PROJECT_CONCURRENCY) × T_project`. 프로젝트당 8~15초면 P=30 → 120~225s(여유), **P=80 → 320~600s**, P=100 → 500~750s로 `timeoutSeconds: 600` 경계를 넘는다. 타임아웃 시 upsert 루프에 도달하지 못해 **성공 계산분까지 전량 폐기**되고 `finally` 의 락 해제도 실행되지 않아 `STALE_LOCK_MS`(900s) 동안 락이 남는다. 체크포인트가 없어 재시도도 처음부터다.
  SQL은 프로젝트당 3회(멤버 + 일정 + upsert) = **3P회**. P=100이면 300회, upsert 100회는 완전 직렬이라 RTT 30ms 가정 시 그것만 3초.
- **수정 방향**: `aggregateOneProject` 성공 즉시 `upsertSnapshot` 으로 부분 결과를 확정한다. 멤버·일정 조회는 `project_id IN (...)` 다건 버전으로 2회로 축소하고, upsert는 `PortfolioSnapshotQuery.UPSERT` 가 이미 `ON DUPLICATE KEY UPDATE` 이므로 다행 `VALUES` 로 묶는다.

## B-5. 진척도·비용이 쓰지도 않는 집계를 위해 무거운 요약 쿼리를 부른다

- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:100-106`
- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:56-61`

```js
const [holidayResult, summary, memberRows, worklogs, rawIssues] = await Promise.all([
    ...,
    getSummaryDataService({ project_id: projectId }),   // A-8의 비-sargable 전량 조인
    getProjectMemberRows(projectId),                     // projectusers ⋈ users 전 행 — 같은 테이블 2번째 조회
    ...
]);
```

`summary` 에서 실제로 쓰는 값은 `start_date`/`end_date`/`total_member_count`(`:112-114`)뿐이고 `total_salary` 는 `members` 로 재계산해 버린다(`:136`). 인원 수는 `memberRows.length` 로 나오고 날짜는 `ProjectQuery.FIND_BY_ID`(PK, 조인 없음)로 나온다.

- **비용**: 비용 탭 캐시 miss 1회당 `projectusers` 를 2번 읽고 그중 1번은 전량 스캔. 진척도 탭도 동일.
- **수정 방향**: `getSummaryDataService` → `findProjectByIdRepository` 로 교체, 인원 수는 `memberRows` 에서 취한다.

## B-6. `users` 의 필터·정렬 컬럼에 인덱스가 하나도 없다

DDL: `C:\CloudJira\moves-workforce\src\rdb\schema\ddl\users.sql.js:1-26` — `PRIMARY KEY (account_id)` 가 **유일한 인덱스**. `ALTER_USERS_ADD_TEAM_KEY` 주석이 *"인덱스는 두지 않는다 — users 는 소규모"* 로 의도를 밝힌다. `migrate.js` 전체에 `CREATE INDEX`/`ADD INDEX` 가 없다(검증 완료).

| 인덱스 없는 컬럼 | 사용처 |
|---|---|
| `team_key` (WHERE/IN/IS NULL/GROUP BY) | `TeamRepository.js:116-127, 139-152, 158-170, 180-192`, `UserQuery.TEAM_COUNT`·`TEAM_INHERIT_COUNT`·`CLEAR_TEAM_BY_TEAM_KEY`, `UserRepository.js:16-19` |
| `role_key`/`level_key`/`permission_key` | `UserRepository.js:248-305`, `:168-213`, `ROLE/LEVEL/PERMISSION_COUNT` |
| `created_at` (ORDER BY) | `UserRepository.js:198, 234`, `TeamRepository.js:165, 186, 249` |

- **비용**: 위 전부가 전 행 스캔 + filesort. U=1,000이면 개별로는 감당되나 **한 화면이 여러 번 친다** — `getProjectTeamsService`(`ProjectTeamService.js:76-98`)는 담당 팀 탭 1회 진입에 `countUsersByTeam()`(전량 GROUP BY) + `findUsersByTeamKeys()`(전량 스캔) + `findUserRowsByAccountIds` 2회를 발생시켜 **users 전량 스캔 2회**가 된다.
- **수정 방향**: `team_key` 에 인덱스 1개 추가(멱등 `ALTER`, v018). role/level/permission 은 백오피스 전용이라 후순위.

## B-7. 전 행 로드 후 앱단 권한 필터 — 팀장이 10명을 보려고 전사를 읽는다

- `C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:437-441` — `FIND_ALL_ALLOCATIONS`(전 프로젝트 × 전 배정 인원, WHERE 없음) 후 `allRows.filter(r => visible.has(r.account_id))`
- `:391-396` — `findUsersRepository({})` 전량 후 `.filter(id => !visible || visible.has(id))`

- **비용**: TEAM_ONLY/LEADING 스코프 사용자가 자기 팀 10명만 볼 권한인데 `projectusers` Σ(프로젝트×인원) 전량 + `users` 전량을 서버 메모리로 끌어올린다. 프로젝트 100 × 인원 20이면 **2,000행을 읽어 10행을 남긴다**.
- `findUsersRepository` 는 `whereIn('account_id', users)` 를 이미 지원하고 `principal.leadingScopeAccountIds` 가 그 목록이다.
- **수정 방향**: `visible` 이 `null` 이 아닐 때 accountId 집합을 `IN` 절로 밀어 넣는다. **⚠ `QueryBuilder.whereIn([])` 은 조건을 통째로 버려 fail-open 이므로 빈 배열 가드 필수** — `TeamRepository.js:1-13` 주석의 C3 규약을 그대로 따를 것.

## B-8. `getResourceProfile` — 한 사람 드로어를 열려고 전사 컨텍스트를 통째로 재조립

`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:285-295`

```js
const [ctx, inProgressIssues, historyRes, roleListRes, statusRes, assignedMap, projectCountMap] = await Promise.all([
    buildPeopleContext(),   // 전 사용자 SQL + Jira bulk + KVS 6종 + 스킬 매핑 SQL
    ...
]);
const person = ctx.people.find((p) => p.accountId === accountId) ?? null;   // 1명만 쓴다
```

`buildPeopleContext`(`:53-77`)는 `SELECT * FROM users ORDER BY created_at DESC`(WHERE 없음) 전량 + `SELECT_SKILLS_BY_ACCOUNTS(N)` + `userMap(userRows)`(Jira bulk `ceil(N/100)`회)를 수행한다.

- **비용(U=1,000)**: 드로어 1회당 users 전량 스캔(1,000행, `salary` 포함 전 컬럼) + user_skills `IN`(1,000 플레이스홀더) + **Jira bulk 10회**. 실사용 1행 — 낭비율 999/1,000.
- 같은 요청에서 `role` 을 **2번** 스캔한다: `buildPeopleContext` 내부(`:70`) + `:289` 의 `getRoleListService()`. `ctx.people[i].roleName` 이 이미 해석돼 있다.
- **수정 방향**: 프로필 전용 경량 분기(`findUsersRepository({users:[accountId]})` + `SELECT_SKILL_IDS_BY_ACCOUNT`), `skillMap`(KVS)만 공유. 중복 `getRoleListService()` 제거.

## B-9. 경량 쿼리가 있는데 무거운 쿼리로 accountId만 뽑는다

`C:\CloudJira\moves-workforce\src\resolver\workAssignment\WorkAssignmentService.js:81-84`

```js
const { rows = [] } = await executeQuery(ProjectUsersQuery.FIND_BY_PROJECT_ID, [projectId]);
return [...new Set((rows ?? []).map((r) => r.account_id).filter(Boolean))];
```

`FIND_BY_PROJECT_ID`(`ProjectUsersQuery.js:36-52`)는 `LEFT JOIN users` + `COUNT(1) OVER()` 윈도우 함수 + 10개 컬럼을 반환한다. 필요한 건 `account_id` 하나뿐이고 **정확히 그 용도의 `FIND_ACCOUNT_IDS_BY_PROJECT`(`:129-133`)가 이미 존재**하며 `ProjectTeamService.js:59` 는 그걸 쓴다.

- **비용**: `getWorkAssignmentBoard`·`getWorkAssignmentPool` 두 resolver가 진입마다 불필요한 users 조인 + 윈도우 함수. 인원 50명이면 50행 × 10컬럼 + users 50회 조인 → 50행 × 1컬럼으로 축소 가능.
- **수정 방향**: `FIND_ACCOUNT_IDS_BY_PROJECT` 로 교체.

## B-10. `onIssueCreated` — 구독과 무관한 사이트 전 이슈 생성마다 라이선스 KVS 조회가 먼저 돈다

`C:\CloudJira\moves-workforce\src\trigger\onIssueCreated.js:37-42`

```js
if (!(await isProjectSubscriptionReady())) return;   // 1) SQL (콜드 isolate 시)
if (await isLicenseBlocked()) return;                // 2) KVS get (+TTL 만료 시 License API)
const sub = await findSubscriptionBySourceRepository('SPACE', evt.projectId);  // 3) SQL
if (!sub) return;                                    // ← 대부분의 이슈는 여기서 끝
```

구독이 **하나도 없는 스페이스의 이슈**여도 2)까지 반드시 실행된다.

- **비용(미매칭 이슈 1건당)**: KVS 1 + SQL 1~2(콜드 isolate면 `information_schema` 1회 추가 — `TableReadiness.js:36-53` 의 `readyTables` 는 isolate 수명 캐시).
  이슈 300건/일 → KVS 300 + SQL 300~600회/일. 2,000건/일 사이트면 KVS 2,000 + SQL 최대 4,000회/일.
  라이선스 API 자체는 KVS 캐시 TTL(1h)로 ≤24회/일이나 **UNAVAILABLE 에 빠지면 TTL 60s라 ≤1,440회/일 + 매번 KVS write** 로 뛴다.
- **수정 방향**: 순서를 `findSubscriptionBySource → isLicenseBlocked` 로 바꾼다(라이선스는 실제 write 직전에만 확인해도 경계가 같다).

## B-11. 리컨실 watermark 정체 시 매시간 전량 재스캔으로 되돌아간다

- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionSweeper.js:206`, `:220`
- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionJqlBuilder.js:211-214`

```js
const completed = scan.completed && apply.failed === 0;
...  watermark: completed ? startedAt : null,
...
if (mode === 'RECONCILE' && sub.watermark) parts.push(`updated >= "${lower}"`);   // watermark 없으면 하한 없음
```

정상 완주 경로는 증분 창이라 시간당 1페이지로 싸다(**통과**). 그러나 APPLY가 1건이라도 실패하면(앱 필드 권한/지속 429) `completed=false` → watermark 미전진 → 다음 주기 JQL에서 **증분 하한이 사라져 baseline 이후 전량을 다시 훑는다.**

- **비용**: 정체 구독 1건당 `min(대상수, MAX_SCAN_ISSUES=2000)/100` = 최대 20 검색/시간 → **480 검색/일/구독**. `SWEEP_BATCH_SIZE=20` 구독이 함께 정체되면 하루 최대 9,600 검색이 편입 0건으로 소모되고, `MAX_REQUESTS=600` 예산을 정체 구독이 독식해 정상 구독이 밀린다.
- **수정 방향**: apply 실패가 **부분**이면 성공분 기준으로 watermark를 전진시키거나(실패분은 `IS EMPTY` 로 다시 잡히므로 안전), 연속 실패 구독을 백오프로 잠시 제외한다.

## B-12. `getPublicHolidayListService` 가 100건 하드캡 — 비용·진척도 숫자가 조용히 틀어진다

`C:\CloudJira\moves-workforce\src\resolver\backoffice\publicHoliday\PublicHolidayService.js:34`

```js
const rows = (await queryManager.findByField('by-date')).results;   // CustomEntityManager.js:47 — limit 기본 100
```

`findAll()` 100건 하드캡과 **같은 함정이 `findByField` 에도 남아 있다.** 한국 공휴일 연 15~19건 + 대체공휴일/사내 휴무를 넣으면 **5~6년치**에서 상한 도달.

- **영향 경로**: `ProjectCostService.js:101`, `ProjectProgressService.js:57`·`:201`, `IssueAnalysisService.js:39`·`:186`, `ResourceAnalysisService.js`, `PortfolioAggregator.js:493` — 전부 영업일/MD 산식의 입력이다.
- **수정 방향**: `findAllPaged('by-date', 100, N)`.

## B-13. `findUserByAccountIdService` — 독립 호출 4~5단 직렬

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:281-322`

```
findByAccountId(SQL) → getBulkJiraUsersApi(Jira) → getTeamIndex(KVS) → resolveSalaryPolicySafe(KVS) → getLevelListService(KVS)
```

뒤 3개는 서로 독립인데 `await` 로 줄세워져 있다.

- **비용**: 사용자 편집 모달 열기 = 왕복 4~5단(가드 포함 6단). `Promise.all` 로 묶으면 2단.
- **수정 방향**: 1행 SQL 이후 나머지를 `Promise.all`.

## B-14. `getCurrentUserApi()` 로 Jira `/myself` 를 부르는데 `context.accountId` 가 이미 있다

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:393`, `:482`, `:561` ·
`C:\CloudJira\moves-workforce\src\resolver\backoffice\team\TeamService.js:636`, `:647` ·
`C:\CloudJira\moves-workforce\src\resolver\project\ProjectService.js:245`

`PrincipalResolver.js` 헤더 주석이 스스로 *"accountId 는 context 에서 취득(Jira /myself 불필요)"* 라고 적어 놓았는데, 쓰기 서비스 6곳은 `created_id`/`updated_id` 하나 얻으려고 Jira를 한 번 더 친다.

- **비용**: `addUser`·`updateUser`·`uploadUsersExcelWithQueue`·`assignUsersToTeam`·`unassignUsersFromTeam`·`updateProjectPartial` **각 1회 불필요한 Jira 왕복**(후속 쓰기와 직렬).
- **수정 방향**: 컨트롤러가 `context.accountId`(또는 `principal.accountId`)를 서비스에 넘긴다.

## B-15. 상태 삭제/정렬이 SQL·KVS N+1 순차 — 여기에 B-14가 곱해진다

`C:\CloudJira\moves-workforce\src\resolver\backoffice\projectStatus\ProjectStatusService.js:166-217`, `:275-295`, `:327-356`

```js
for (const project of projectList) { await updateProjectPartialService(data); }   // :168
for (const link of linksToDelete)  { await linkManager.delete(link.key); }        // :191
```

`saveStatusOrder`/`saveStatusLink` 도 전량 삭제 후 전량 저장을 순차 루프로 한다.

- **비용**: 상태에 프로젝트 200개가 물려 있으면 UPDATE **200회 순차**. 그리고 `updateProjectPartialService` 는 B-14의 `/myself` 를 매번 부르므로 **Jira 200회**까지 붙는다.
- 저빈도 경로(조직 세팅 변경)라 P2. **수정 방향**: `WHERE project_status_key = ?` 단일 UPDATE로 치환.

## B-16. `/resource` 화면이 전 사용자 명부를 **세 resolver가 각각** 조립한다

`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:206`(`buildPeopleContext`), `:390-401`(`findUsersRepository({})` 재조회), `:432-459`(`userMap` 재호출)

프론트는 진입 시 `getResourceOverview` · `getResourceLoadSummary` · `getResourceAllocationGraph` 를 각각 invoke한다(`useResourceOverview.js:20`, `useResourceLoadSummary.js:23`, `allocation/useResourceAllocation.js:21`).

- **비용(U=500)**: 사용자 전량 SQL **3회** + Jira user bulk **최대 10회**(overview 5 + allocation 5) + 가드 고정비 ×3.
- **수정 방향**: 세 resolver를 한 진입 단위로 합치거나 `buildPeopleContext` 결과를 60초 TTL KVS 캐시로 공유한다.

## B-17. 진척도·비용·포트폴리오가 **같은 원시 데이터를 각자** 페치한다

`ProjectProgressService.js:56-61` · `ProjectCostService.js:100-106` · `PortfolioAggregator.js:276-281` 이 모두 `fetchAllProjectIssues` + `getResourceProjectWorklogs` 를 같은 프로젝트에 대해 독립 수행한다.

- **비용(1,000이슈 프로젝트)**: 진척도 탭 111회 + 비용 탭 111회 + 야간 배치 111회 = **하루 333회 이상**, 전부 같은 데이터.
- **수정 방향**: A-2의 (b) — `ProjectRaw:{projectId}` 공유 캐시. 세 소비자가 한 번의 페치를 나눠 쓴다.

---

# P3

| # | 위치 | 내용 | 수정 방향 |
|---|------|------|-----------|
| C-1 | `src\resolver\myWork\MyWorkService.jsx:18-22` | role/level/status를 **id마다 개별 `findById`**(KVS N+1, 동시성 제한 없음, 3중 `Promise.all` 중첩). 프로젝트 30개·distinct 16종이면 KVS get 16회 — 목록 서비스 3회면 충분 | `getRoleListService`+`getLevelListService`+`getProjectStatusListService` 로 교체(`UserService.roleLevelMap()` 과 같은 패턴) |
| C-2 | `manifest.yml:113-115` + `src\rdb\schema\migrate.js:55-63` | `init-db` 스케줄이 **hour**. 매시간 마이그레이션 이력 SQL 2회 + 적용분 없어도 `list()` 전량 로그 17줄 = 48 SQL/일 + 408줄/일. `onInstall` 이 이미 설치·업그레이드 시 `runMigration` 을 돈다 | `interval: day` + `executed` 있을 때만 로그 |
| C-3 | `src\api\jira\field\FieldApi.js:51-63` | `getCoworkerFieldIdApi` 가 같은 파일 `findAppFieldIdByName`(`:12,21-37`)의 `fieldIdCache` 를 쓰지 않고 매번 `/rest/api/3/field` 전량을 받는다. 게다가 유일 호출부(`PortfolioAggregator.js:494`)가 넘긴 값은 `getProjectIssuesByFilter` 의 fields 조립에 **쓰이지 않고**(`IssueApi.js:355-358` 주석) `normalizeIssue` 도 인자를 안 받는다 = 배치당 1회 사표(死票) 호출(대형 사이트 응답 수백 KB) | 호출 제거, 또는 `findAppFieldIdByName` 경로로 통일 |
| C-4 | `src\api\jira\user\UserApi.js:54-73` | `getBulkJiraUsersApi` 의 100개 청크 루프가 **직렬**. U=1,000이면 Jira 10회 순차. `TeamService.fetchCandidateProfiles:326-353` 은 같은 상황을 `pLimit(4)` 로 병렬화해 뒀다 | 청크 루프를 `pLimit` 병렬로 |
| C-5 | `src\utils\license\LicenseGuard.js:112-134` | `ResponseWrapper.js:7` 이 모든 resolver를 감싸므로 production에서 `context.license.active` 부재 시 **invoke 1건당 KVS get 1회**. `PrincipalResolver` 는 같은 문제를 30초 L1로 막았는데 여기엔 L1이 없다 | KVS TTL을 미러링하는 모듈 스코프 L1 추가 |
| C-6 | `src\resolver\backoffice\role\RoleService.js:36` · `level\LevelService.js:86` | 목록은 `findAll()`(100캡)인데 같은 도메인 quick-add는 `CatalogBulkService.js:32` 에서 `findAllPaged('name',100,5000)` 로 전량을 본다. **skill만 고쳐졌고**(`SkillService.js:58`) role/level은 남았다 — "목록엔 없는데 저장은 거부"의 같은 구조 | 상한 상수를 공유하는 `findAllPaged` 로 통일 |
| C-7 | `src\seed\SeedData.js:160`, `:206` | 프리셋 이름 충돌 판정·`migratePermissionSets` 가 `findAll()`(100캡). 권한 세트 100개 초과 시 초과분이 **조용히 마이그레이션에서 누락**(카탈로그 키 보충·고아 정리·projectScope 보정 미적용) | `findAllPaged` |
| C-8 | `src\resolver\projectDashboard\ProjectDashboardService.js:559-568` | `saveCharts` 가 차트마다 `await insertChart` 순차. 같은 파일 계열 `bulkUpdateLayoutsRepository`(`ProjectDashboardRepository.js:89-113`)는 이미 다행 `VALUES`+`ON DUPLICATE KEY` 패턴을 갖고 있다 | 그 패턴 재사용해 INSERT 1회로 |
| C-9 | `src\resolver\backoffice\user\UserService.js:778-785` | 4개 카운트 쿼리를 `Promise.all` 로 돌린 뒤 `await roleLevelMap()` 을 따로 기다린다(의존 없음) | 같은 `Promise.all` 에 합류 |
| C-10 | `src\rdb\query\QueryBuilder.js:3` (`_select = ['*']`) | `.select()` 없이 `.from('users')` 만 부른 곳 8곳(`UserRepository.js:23-33, 38-49, 61-89, 168-213`, `TeamRepository.js:69-76, 162-170, 183-192, 212-215`). `role_key`/`team_key`/`account_id` 만 쓰는 소비자가 대부분인데 `salary` 까지 전송된다. `ProjectUsersQuery.FIND_BY_PROJECT_ID` 는 급여 누출을 막으려 컬럼을 명시했는데(`:28-35` 주석) users 직접 조회 경로엔 그 규율이 없다. **성능보다 게이팅 견고성 관점** | 소비 필드만 `.select(...)` 명시 |
| C-11 | `src\queue\consumer.js:45-70` | 실패 항목마다 `await jobFailManager.save(...)` 순차. 배치 20건 전량 실패 시 KVS write 20회 직렬 | 실패 목록을 모아 `Promise.all` |
| C-12 | `src\resolver\utils\worklog\WorklogService.js:189-205` | `normalizeWorklog` 가 워크로그 엔트리마다 `issue:issue`, `worklog:log` **원본 객체 전체**를 붙인다. 현 소비자(3개 aggregate 함수)가 전부 버려 실해는 없으나, 이 배열이 응답으로 나가는 소비자가 생기면 O(n²) 직렬화가 된다 | 집계 필드만 남긴다(`ResourceWorklogFetcher.js:15-21` 가 이미 그 형태) |
| C-13 | `UserService.js:446-448` · `UserRepository.js:66-78`·`:189-201` · `GanttFolderService.js:168·170`, `:258-260` | 서로 독립인 쿼리의 직렬 await(삭제 cascade 3건, count↔list, 폴더 조회 2~3연속). 각 왕복 1~2회 절감 | `Promise.all`. 단 `users` 삭제는 앞 3건 이후여야 한다 |
| C-14 | `src\resolver\storage\StorageQuery.js:37` | `SELECT BIN_TO_UUID(project_id), COUNT(*) FROM project GROUP BY project_id` — `project_id` 가 PK라 `cnt` 는 **언제나 1**. 전 행 스캔 + 그룹핑이 무의미(나머지 5개 스펙은 정당한 다행 집계) | 단순 `COUNT(*)` 또는 제거 |
| C-15 | `src\rdb\query\CommonQuery.js:11-13`, `UserRepository.js:61-89`·`168-213` | deep `OFFSET` 페이징. 현 규모(users ≤10³)에서는 문제 아니나, 커서 방식(`getProjectUserWithScrollRepository:165-202`)이 이미 구현돼 있어 **관례가 갈려 있다** | 규모 증가 시 커서로 통일 |

---

# 통과 (확인했고 문제 없음)

> 침묵을 "미검증"으로 오독하지 않도록 명시한다.

## 인덱스 정합 (DDL 실측 대조)

`projectusers`(`INDEX(project_id, account_id)` + `INDEX(account_id)`) · `project_team`(PK 복합 + `INDEX(team_key)`) · `user_skills`/`project_skills`(PK 복합 + `INDEX(skill_id)`) · `gantt_folder`(`INDEX(project_id)`, `INDEX(project_id, parent_folder_id)`) · `gantt_folder_issue`(PK `issue_key` + `INDEX(project_id)`, `INDEX(folder_id)`) · `gantt_folder_link`(PK 3컬럼 + 3보조) · `portfolio_project_snapshot`(PK `project_id` + `INDEX(risk_score)` ← `SELECT_ALL ORDER BY risk_score DESC` 와 정확히 일치) · `project_dashboard`(`INDEX(project_id)`) · `user_schedule`(`INDEX(account_id)` + `UNIQUE(account_id, schedule_start_date, schedule_type)` ← `FIND_BY_PROJECT_ID` 날짜 범위까지 커버)
→ **전부 WHERE/JOIN/ORDER BY 컬럼과 정합.** 예외는 `users`(B-6)뿐이다.

## 나머지 축

| 축 | 확인 내용 | 판정 |
|----|----------|------|
| **DB N+1 (다건 조회)** | `SkillMappingQuery.SELECT_SKILLS_BY_ACCOUNTS/BY_PROJECTS`, `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNTS`·`FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`·`FIND_MEMBER_TEAMS_BY_PROJECTS`, `ProjectTeamQuery.FIND_PROJECT_IDS_BY_TEAM_KEYS`, `UserQuery.UPDATE_TEAM_BY_ACCOUNTS` — 전부 `IN` 절 팩토리로 1회 조립. 인당/프로젝트당 반복 쿼리는 B-4(배치)를 빼면 없다 | **통과** |
| **bulk write** | `addUsersBulk`(다행 INSERT IGNORE), `bulkInsertUsers`, `UPSERT_NON_PRIMARY_BULK`, `INSERT_USER_SKILLS(n)`, `INSERT_PROJECT_SKILLS(n)`, `bulkUpdateLayoutsRepository` — 전부 다행 문장. 엑셀 업로드 큐(`consumer.js:82`)도 배치당 1 INSERT | **통과** |
| **p-limit 동시성 제한** | 프로젝트 집계(2), 워크로그 초과 페이지(5), 구독 APPLY(2)·기본추정(2)·소스메타(3), 등록일 기록(5), 팀 후보 프로필(4), 인력부하 배치(3), myWork/캘린더(5) — 대량 병렬 지점에 전부 상한 | **통과** |
| **배치의 공통 자원 호이스팅** | `PortfolioAggregator.js:490-509` 가 settings·holiday·coworkerFieldId·`policyCtx` 를 루프 **밖 1회**로 조달해 프로젝트별 주입. 주석이 *"aggregateOneProject 안에서 로드하면 프로젝트 수 × KVS 왕복 = 성능 사고"* 라고 못박아 뒀다 — 모범 사례 | **통과** |
| **`resolvePrincipal` 조회 수** | 30초 L1 + KVS는 `permission` `findById` 1회, 팀 스코프 조회는 `isTeamLead \|\| TEAM_ONLY` 일 때만(`:151-158`), 두 프로젝트 id 조회는 `Promise.all`(`:402-404`) | **통과**(동시 진입 시 캐시 미적중은 A-6) |
| **`TeamTreeCache`** | 60초 TTL, 쓰기 경로만 `loadTeamIndexFresh`. 팀 100개 이하면 miss 시 KVS 1회 | **통과** |
| **coworker resolve N+1** | `CoworkerResolver.js:20-40` 이 페이지 전체 coworker id를 dedup 해 **요청당 bulk 1회**. 카운트만 필요한 소비처는 쓰지 말라는 경고가 주석에 있고 실제로 progress/cost/portfolio는 `accountId[].length` 만 쓴다 | **통과** |
| **인력 부하 배치(`ResourceLoadFetcher`)** | accountId 50개 청크 × `pLimit(3)`, POST search + `nextPageToken` 루프, 청크 단위 실패 격리, 그룹 집계를 **추가 Jira 0회**로 같은 패스에서 수집(`:264-347`) | **통과** |
| **팀 후보 프로필(`TeamService.js:326-353`)** | 100개 청크 `pLimit(4)` 병렬 + 청크 단위 실패 격리. 1,000명 = Jira 10회/3라운드 | **통과** |
| **`MyTeamAnalysisService.js:101-109`** | 7개 독립 호출을 하나의 `Promise.all`, 인원 축을 `leadingScopeAccountIds` 로 **먼저 좁힌 뒤** 조회(B-7이 지향해야 할 형태) | **통과** |
| **`mySchedule/*` 전체** | 전부 단건 SQL. 루프·N+1·Jira 호출 0건 | **통과** |
| **`storage/*` 전체** | 총 SQL 8회(`information_schema` 1 + 프로젝트명 1 + 행수 6개 **병렬**), 개별 try/catch 격리 | **통과**(C-14 제외) |
| **`MyPageService.jsx`** | 저장소를 읽지 않는 순수 엑셀 포매터, `MAX_ROWS=20000` 상한 | **통과** |
| **`ProjectCalendarService` / `ResourceWorklogFetcher`** | 초과 워크로그를 `EXTRA_PAGE_SIZE=100` offset 목록 → `Promise.all` 병렬. **A-1이 지향해야 할 형태** | **통과** |
| **`GanttService.getProjectGanttData`** | 전용 페처 1패스 + 폴더 3쿼리 병렬 + coworker bulk 1회. issuelinks를 search 응답에 inline으로 받아 per-issue 호출 0 | **통과** |
| **판정 모듈** | `permissionGuard`·`ResourceCatalog`·`TeamAnalyticsScope`·`TeamLeadFieldPolicy`·`ProjectScope`·`CostAccess` 전부 **I/O 0 순수 모듈** | **통과** |
| **`SkillService.js:58`** | `findAllPaged('name', 100, CATALOG_MAX_ITEMS)` 로 100건 캡 회피 + bulk 경로와 상한 상수 공유 | **통과**(role/level은 C-6) |
| **중복 이름 검증 4종** | 전부 `findByWhere` 인덱스 동등검색 1회. 전량 스캔 아님 | **통과** |
| **`PortfolioSnapshotQuery.SELECT_ALL` 의 JSON 3컬럼** | `SELECT *` 남용으로 의심했으나 `PortfolioDashboardService.js:242-244` 가 `members_json`/`monthly_effort_json`/`weekly_effort_json` 을 전부 소비 — 정당 | **통과** |
| **`ProjectService` 삭제 cascade 10연속 직렬** | 병렬화 가능해 보이나 TiDB 트랜잭션 부재 하에서 "자식 → 부모" 순서가 재시도 안전성의 경계이며 주석이 근거를 명시 | **통과**(의도된 직렬) |
| **`TableReadiness` 프로브** | `true` 만 모듈 캐시 → 컨테이너당 1회 `information_schema` 조회. 배포-마이그레이션 시차 방어로 의도됨 | **통과** |
| **TTL 있는 KVS 캐시** | `ProjectProgress`/`ProjectCost`(10분), `ResourceAnalysis`(5·10분), `WorklogService`(10분), 라이선스(1h/1분) 모두 TTL 지정 — 무한 누적 없음. `ProjectService.js:105·110` 이 프로젝트 삭제 시 파생 캐시 키를 명시 delete | **통과**(캐시 **효과**는 A-2) |
| **`onIssueCreated` 폭주 방어** | 구독 미존재 시 **Jira 호출 0회** 조기 종료. 절대 throw 하지 않아 재시도 폭주 없음 | **통과**(순서는 B-10) |
| **수동 재집계 CTA** | 큐 1이벤트만 넣고 `aggregatingStartedAt` 락이 중복 실행 차단 — 연타로 비용이 배증하지 않는다 | **통과** |
| **스케줄 주기 대비 총량** | 포트폴리오 = day 1회, 리컨실 = hour 24회. 위 식 이상의 숨은 배수 없음 | **통과**(init-db hour는 C-2) |
| **리컨실 정상 경로** | watermark `updated >=` 증분 창으로 구독당 시간당 검색 1~2페이지. 20구독 ≈ 480~960 검색/일로 예산(600/실행) 대비 여유 | **통과**(정체 시는 B-11) |
| **워크로그 SQL 테이블 축** | `ddl/worklog.js` 전체 주석 + `ddl/index.js` 미등록 = 테이블 미존재. 워크로그 DB N+1 축은 **해당 없음** | **해당 없음** |

---

# 미검증 (이 감사로 확정할 수 없는 것)

| 항목 | 사유 |
|------|------|
| Forge가 **동시 invoke를 같은 컨테이너로 보내는지** | 모듈 스코프 캐시(`PrincipalResolver` L1, `TeamTreeCache`, `fieldIdCache`)의 실효 적중률이 여기 달려 있다. 컨테이너가 갈리면 in-flight dedup으로도 A-6의 배수를 못 막는다 — **그래서 A-6의 1순위 수정은 dedup이 아니라 `isAdministrator` 병렬화**로 잡았다 |
| `/rest/api/3/search/jql` 의 `maxResults` 실효 상한 | B-1의 `maxResults=5000` 이 실제로 5,000건을 돌려주는지(메모리 위험) 잘리는지(조용한 누락) 코드로 확정 불가. **어느 쪽이든 페이지 루프 부재는 결함**이라는 결론은 성립 |
| TiDB의 실제 실행 계획 | A-8·B-6은 표준 SQL 원리(비-sargable 술어, 인덱스 부재)에 근거한다. TiDB 옵티마이저가 어떻게 처리하는지는 `EXPLAIN` 실측이 필요하다 |
| 실제 사이트의 `w_i` 분포 | A-1/A-5의 배수는 "워크로그 20건 초과 이슈 비율"에 선형이다. 10%/30% 두 가지로 제시했을 뿐 실측이 아니다 |
| 각 화면의 실제 위젯 수 `W` | A-3/A-7의 대시보드 배수는 사용자가 배치한 위젯 수에 비례. 시드 기본 대시보드 구성은 확인하지 않았다 |
| KVS/SQL 왕복의 실제 지연(ms) | 호출 **횟수**만 셌다. "몇 초 빨라지는가"는 배포 환경 실측 필요 |
| 프론트 React Query 캐시가 흡수하는 재호출 비율 | `staleTime` 이 걸린 쿼리(대시보드 위젯 5분 등)는 재방문 시 서버를 안 친다. 본 감사 수치는 **cold 진입 1회** 기준 |
