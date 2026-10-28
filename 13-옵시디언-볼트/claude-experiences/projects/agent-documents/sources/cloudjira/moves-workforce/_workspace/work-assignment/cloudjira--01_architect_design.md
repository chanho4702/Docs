# 작업 배정 (Work Assignment) 설계서

- **일자**: 2026-07-22
- **브랜치**: RFC-160
- **슬러그**: `work-assignment`
- **입력**: `_workspace/work-assignment/00_input/requirement.md`
- **배치**: 프로젝트 상세 > `projectUser`(인력) 부모탭 > 3번째 서브탭 `projectAssignment`

> 이 문서의 **§2 경계면 계약**이 backend / frontend / integration-verify의 단일 진실 원천이다.
> 계약 변경 시 반드시 양쪽에 통지한다.

---

## 0. 조사 결과 요약 (추측 아님 — 실제 코드 확인)

| 확인 항목 | 실제 코드 | 설계 반영 |
|---|---|---|
| `fetchAssignedLoadByAccounts(accountIds)` | `ResourceLoadFetcher.js:299` — 반환 `Map<accountId, {todoCount,inProgressCount,doneCount,spentSeconds,remainingSeconds}>`, CHUNK 50 / p-limit 3, JQL `(assignee in (..) OR movesRmsCoworkers in (..)) AND (statusCategory != Done OR updated >= "-26w")` | **무수정 재사용**(전사 부하) |
| `fetchInProgressLoadByAccounts` / `fetchInProgressIssuesForAccount` | 동 파일 (v1) | 사용 안 함(Match·드로어 전용, 회귀 방지) |
| `LOAD_DONE_WINDOW` | `'-26w'` 모듈 상수 (`ResourceLoadFetcher.js:26`) | 프로젝트 패스도 **동일 창** 사용(값은 신규 모듈에 자체 상수로 복제 — 원본 미수정) |
| 균등분할 규칙 | `participantCount = max(1, (assignee?1:0) + coworkers.length)`, `perHead = seconds / participantCount`, **건수는 분할 안 함** | 프로젝트 패스에 **동일 규칙 그대로** 적용 |
| coworker JQL | manifest `jira:entityProperty` alias `movesRmsCoworkers` (필드 조회 불필요) | 그대로 사용 |
| coworker 프로퍼티 read | `issue.properties.movesRms.coworkers` (`MOVES_PROPERTY_KEY='movesRms'`) | 그대로 |
| **coworker write 기존 코드** | **있음** — `ProjectUsersService.updateIssueCoworkersService` (`:334`)가 `mergeIssueProperty(issueId,{coworkers:ids})` 호출. resolver `updateIssueCoworkers` = `W('PROJECT','inherited')` | resolver는 **무수정**. 신규 write는 동일 헬퍼 `mergeIssueProperty`를 직접 재사용(타 서비스 응답 계약에 의존 안 함) |
| **assignee write 기존 코드** | 백엔드에 **없음**. 프론트만 `executeRequest('assignIssue')` → `PUT /rest/api/3/issue/{key}/assignee` (`requestJira.js:45`) | 백엔드 `assignIssueApi` **신규 추가**(IssueApi.js에 export 추가만) |
| 프로젝트 이슈 조회 JQL | 전부 `moves_RMS_projectId = "<uuid>"` **JQL 술어**로 스코프 (`IssueApi.js:14,95,151,353,403`) | 동일 패턴 |
| `fieldsByKeys` | **백엔드 경로에는 한 곳도 없음**(`src/` 전역 0건). 프론트 직접 호출(`ProjectIssueTable`, `TaskHistoryPage` 등)에만 존재 | §5-1 참조 — 우리 경로는 **불필요**(앱 필드를 fields로 요청하지 않음) |
| 권한 카탈로그 | `ResourceCatalog.js` 14키. `PROJECT`, `RESOURCE_MANAGEMENT` 존재 | **신규 키 불필요** |
| `guardedDefine` | `req.principal` 부착 후 handler 호출. `isSatisfied(principal, meta)` export됨 | 부분 마스킹에 재사용 |
| 프로젝트별 가동률 | `PortfolioAggregator.js:366` — `members_json[].utilization` (일 배치 스냅샷) | §5-1-C 참조(실시간 산출은 불가, 스냅샷 재사용) |
| manifest scopes | `read:jira-work`, `write:jira-work`, `write:app-data:jira` 이미 존재 | **manifest 변경 불필요** |
| `ResourceProfileDrawer` 게이트 | `useResourceProfile.js:19` — `canRead('RESOURCE_MANAGEMENT')`로 enabled. resolver도 `R('RESOURCE_MANAGEMENT')` | §4-6 제약 — 드로어는 RESOURCE_MANAGEMENT read 보유자만 |

---

## 1. 개요 / 영향 범위

### 1.1 기능 요약
좌측 = 프로젝트 작업 큐(미배정/마감임박/지연), 우측 = 후보 인력 **이중 스코프**(프로젝트 내 / 전사) 테이블 + 스킬 커버리지 + 괴리 신호 배지.
로우 클릭 → `ResourceProfileDrawer`. 후보 행에서 선택 작업에 **담당자 지정 / 협업자 추가** 실행(쓰기).

### 1.2 백엔드
- **신규 도메인** `src/resolver/workAssignment/`
- resolver 3종: `getWorkAssignmentBoard`(읽기) / `getWorkAssignmentPool`(읽기, 온디맨드) / `assignWorkItem`(쓰기)

### 1.3 프론트
- 신규 `static/ui/src/pages/projectDetail/assignment/`
- 수정 `static/ui/src/constants/tabs.js` — `projectUser.children`에 3번째 항목 추가
- 신규 쿼리키 팩토리 `static/ui/src/utils/queryKey/assignmentKeys.js`

### 1.4 DB
- **신규 테이블/엔티티 없음. 마이그레이션 없음.**
- 읽기 재사용: `projectusers`(SQL), `skill_mapping`(SQL), `portfolio_project_snapshot`(SQL), `settings`·`portfolioRollup:current`(KVS)
- 추가는 **SELECT 쿼리 1개**(`PortfolioSnapshotQuery.SELECT_BY_PROJECT_ID`)뿐

### 1.5 i18n
- 신규 `locales/kr/assignment.json` + `locales/en/assignment.json`
- 수정 `locales/kr/projectDetail.json` + `locales/en/projectDetail.json` (탭 라벨 1키)

### 1.6 manifest
- **변경 불필요.** 근거: assignee write / 이슈 프로퍼티 write 모두 `write:jira-work`로 커버(이미 선언), 신규 KVS 엔티티·속성 없음, 신규 SQL 테이블 없음, 신규 모듈(UI/트리거) 없음.
- 단 §6-2의 임계값 **설정화를 후속에서 등재**할 경우 `settings` 엔티티 `attributes`에 키 선언 + `forge deploy` 필요(KVS 스키마 미선언 시 422). 1차 범위에서는 **읽기만 대비**하고 등재하지 않는다.

---

## 2. 경계면 계약 (최우선 — 단일 진실 원천)

모든 resolver는 `guardedDefine`로 등록되며 `responseWrapper`가 `{ success:true, ...result }`를 만든다.
아래 "응답 shape"은 **서비스 반환값**이며, 프론트가 받는 최종 객체는 `{ success:true, content:{...} }`이다.
실패는 `{ success:false, error:{ name, code, message, cause } }`.

| # | resolver 함수 | 입력 payload | success 시 응답 shape | 권한(PermissionMap) | 대응 프론트 훅 / 쿼리키 |
|---|---|---|---|---|---|
| 1 | `getWorkAssignmentBoard` | `{ projectId }` | `{ content: BoardContent }` | `R('PROJECT','detail')` | `useWorkAssignmentBoard(projectId)` / `assignmentKeys.board(projectId)` |
| 2 | `getWorkAssignmentPool` | `{ projectId }` | `{ content: PoolContent }` | `R('RESOURCE_MANAGEMENT','detail')` | `useWorkAssignmentPool(projectId, enabled)` / `assignmentKeys.pool(projectId)` |
| 3 | `assignWorkItem` | `{ projectId, issueId, issueKey, assigneeAccountId?, coworkerAccountIds? }` | `{ content: AssignResult }` | `W('PROJECT','inherited')` | `useAssignWorkItem(projectId)` (useMutation) → `patchAssignmentCache` |

### 2.1 `BoardContent` (resolver #1)

```js
{
  projectId: string,              // uuid (요청 그대로)
  projectName: string|null,
  generatedAt: string,            // ISO
  meta: {
    companyScopeVisible: boolean, // RESOURCE_MANAGEMENT read 보유 여부 (false면 candidates[].company === null)
    poolAvailable: boolean,       // = companyScopeVisible (전사 풀 토글 노출 여부)
    issueScanned: number,         // 프로젝트 패스로 읽은 이슈 수
    issueTruncated: boolean,      // MAX_PROJECT_ISSUES(3000) 초과로 중단됐는지
    queueTruncated: boolean,      // MAX_QUEUE_ITEMS(300) 초과로 잘렸는지
    snapshotAggregatedAt: string|null, // portfolio_project_snapshot.aggregated_at (프로젝트 내 util 출처 시각)
    rollupAggregatedAt: string|null,   // KVS rollup lastAggregatedAt (전사 util 출처 시각)
    thresholds: {                 // §6-2 — 프론트 툴팁/배지 라벨 계산에 사용
      dueSoonDays: number,        // 기본 7
      externalLoadRatio: number,  // 기본 0.4
      projectFocusRatio: number,  // 기본 0.8
      multiProjectMin: number     // 기본 3
    },
    bands: { under: number, over: number, red: number }  // settings 유래(가동률 밴드)
  },
  requiredSkills: [ { id: string, name: string, category: string } ],  // 프로젝트 요구 스킬
  queue: [ QueueItem ],
  projectLoad: [ ProjectLoadRow ],   // 프로젝트 내 참여자 전원(멤버 여부 무관) — pool 조인용
  candidates: [ Candidate ]          // project_users 기반 후보(서버 랭킹 적용)
}
```

```js
// QueueItem — 좌측 큐 1건 (flags 가 1개 이상인 "열린" 이슈만 포함)
QueueItem = {
  issueId: string,                 // Jira 숫자 id (문자열)
  issueKey: string,                // "DWEB-12"
  summary: string,
  issueTypeName: string|null,
  issueTypeIconUrl: string|null,
  statusName: string|null,
  statusCategoryKey: 'new'|'indeterminate'|'done'|null,
  dueDate: string|null,            // 'yyyy-MM-dd'
  originalEstimateSeconds: number, // 0 가능
  remainingEstimateSeconds: number,// 0 가능 (분할 전 이슈 원본)
  timeSpentSeconds: number,
  assignee: UserRef|null,
  coworkers: [ UserRef ],
  participantCount: number,        // max(1, (assignee?1:0)+coworkers.length)
  flags: [ 'UNASSIGNED'|'OVERDUE'|'DUE_SOON'|'NO_ESTIMATE' ],
  dDay: number|null                // dueDate - today (일). 음수=지연. dueDate 없으면 null
}

UserRef = { accountId: string, displayName: string, avatarUrls: object|null }
```

```js
// ProjectLoadRow — 프로젝트 내 부하(균등분할 후 1인 기대 몫)
ProjectLoadRow = {
  accountId: string,
  assignedCount: number,      // 관여 이슈 건수(분할 안 함) = todo+inProgress+done
  todoCount: number,
  inProgressCount: number,
  doneCount: number,          // 최근 26주 updated 한정
  spentSeconds: number,       // perHead 합
  remainingSeconds: number,   // perHead 합
  completionRate: number|null // spent/(spent+remaining), 분모 0이면 null
}
```

```js
// Candidate — 우측 후보 1행 (이중 스코프)
Candidate = {
  accountId: string,
  displayName: string,
  avatarUrls: object|null,
  roleName: string|null,
  levelName: string|null,
  isMember: boolean,          // project_users 소속 여부 (board=true, pool=false)

  // 스킬 매칭 (computeCoverage 재사용)
  coverage: number,           // 0~1
  score: number,              // Math.round(coverage*100)
  matchedCount: number,
  requiredCount: number,
  matchedSkills: [ { id, name } ],
  missingSkills: [ { id, name } ],

  // 프로젝트 내 스코프
  project: {
    assignedCount: number,
    todoCount: number,
    inProgressCount: number,
    doneCount: number,
    spentSeconds: number,
    remainingSeconds: number,
    completionRate: number|null,
    util: number|null,        // 일 배치 스냅샷 members_json[].utilization (없으면 null) — §5-1-C
    utilSource: 'snapshot'|null
  },

  // 전사 스코프 — companyScopeVisible=false 이면 null
  company: {
    util: number|null,        // KVS rollup utilizationPeople
    utilBand: 'idle'|'normal'|'over'|'red'|'unknown',
    projectCount: number,     // 참여중(미종료) 프로젝트 수
    todoCount: number,
    inProgressCount: number,
    doneCount: number,
    spentSeconds: number,
    remainingSeconds: number,
    completionRate: number|null
  } | null,

  // 괴리 신호
  loadSplitRatio: number|null,  // project.remainingSeconds / company.remainingSeconds (분모 0 → null)
  signals: [ 'EXTERNAL_OVERLOAD'|'EXTERNAL_OVERLOAD_ESTIMATED'|'MULTI_PROJECT'|'PROJECT_FOCUSED'|'NO_CAPACITY_DATA' ]
}
```

### 2.2 `PoolContent` (resolver #2 — 전사 인력 풀 확장분)

```js
{
  projectId: string,
  generatedAt: string,
  candidates: [ Candidate ]   // isMember:false 만. project.* 는 전부 0/null 로 채워 내려보냄
                              // → 프론트가 board.projectLoad 로 accountId 조인해 덮어쓴다(§4-4)
}
```
- **프로젝트 이슈 패스를 실행하지 않는다.** 비멤버가 이 프로젝트 이슈에 참여 중인 경우의 프로젝트 내 부하는 `board.projectLoad`에 이미 들어있으므로 프론트에서 조인한다. (Jira 패스 중복 제거)

### 2.3 `AssignResult` (resolver #3 — 캐시 패치 계약)

**write 직후 `search/jql` 재조회 금지**(인덱스 지연). 서버가 write 후 **단건 `GET /rest/api/3/issue/{key}`**(검색 인덱스 무관·즉시 일관, `ProjectIssueTable.searchByIssueId`의 검증된 패턴)로 최신값을 읽어 아래를 반환한다. 프론트는 **이 응답만으로** 캐시를 패치한다.

```js
{
  issueId: string,
  issueKey: string,
  applied: { assignee: boolean, coworkers: boolean },   // 실제로 write 한 항목
  item: QueueItem,          // §2.1 과 동일 shape (재조회로 확정된 최신값, flags/dDay 재계산 포함)
  previous: {               // 델타 계산용 — 서버가 write 직전 상태를 담아 돌려준다
    assigneeAccountId: string|null,
    coworkerAccountIds: [ string ],
    participantCount: number,
    remainingEstimateSeconds: number,
    spentSeconds: number,
    statusCategoryKey: 'new'|'indeterminate'|'done'|null
  }
}
```

- `item.remainingEstimateSeconds` / `item.participantCount` / `item.statusCategoryKey` + `previous.*` 조합으로 프론트가 **후보 행의 project.* 를 delta 패치**할 수 있다(§4-5).
- `item.assignee` / `item.coworkers` 는 `getBulkJiraUsersApi` 1회로 displayName·avatarUrls까지 resolve해서 내려준다(프론트 추가 조회 불필요).

### 2.4 계약 위반 방지 체크 (integration-verify 기준)

1. 세 resolver 모두 **`content` 래핑**(`{content:{...}}`)이다. `data` 래핑 아님.
2. `candidates[].company`는 **null이 될 수 있다**. 프론트는 반드시 옵셔널 체이닝.
3. `project.util`은 **거의 항상 null일 수 있다**(스냅샷 미집계 프로젝트). '-' 폴백 필수.
4. `assignWorkItem`은 `assigneeAccountId`/`coworkerAccountIds` 중 **최소 1개**가 있어야 한다(둘 다 `undefined`면 `ASSIGNMENT_NO_CHANGE`). `assigneeAccountId: null`은 "미배정으로 해제"를 의미하며 유효 입력이다 — `undefined`와 구분할 것.
5. 백엔드 내부 소비자 없음(신규 도메인). 단 `buildPeopleContext` export 추가는 `ResourceManagementService` 내부 호출부와 동작이 동일해야 한다(시그니처·반환 무변경).

---

## 3. 백엔드 설계

### 3.1 파일 배치

| 파일 | 신규/수정 | 역할 |
|---|---|---|
| `src/resolver/workAssignment/WorkAssignmentController.js` | 신규 | `registerWorkAssignmentController(resolver)` — `guardedDefine` 3건 |
| `src/resolver/workAssignment/WorkAssignmentService.js` | 신규 | board / pool 조립, 부분 마스킹 |
| `src/resolver/workAssignment/WorkAssignmentIssueFetcher.js` | 신규 | **프로젝트 전용 이슈 패스**(격리 모듈) |
| `src/resolver/workAssignment/WorkAssignmentWriter.js` | 신규 | assignee PUT + coworker merge + 단건 GET 재조회 + user resolve |
| `src/resolver/workAssignment/WorkAssignmentRules.js` | 신규 | **순수함수**(jest 대상): flags/신호/랭킹/임계 |
| `src/resolver/workAssignment/__test__/WorkAssignmentRules.test.js` | 신규 | 순수함수 단위 테스트 |
| `src/index.js` | 수정 | import + `registerWorkAssignmentController(resolver)` |
| `src/permission/PermissionMap.js` | 수정 | 3키 추가 |
| `src/utils/errors/ErrorCodes.js` | 수정 | 에러코드 4개 추가 |
| `src/api/jira/issue/IssueApi.js` | 수정(**추가 export만**) | `assignIssueApi`, `getIssueForAssignmentApi` |
| `src/rdb/query/PortfolioSnapshotQuery.js` | 수정(추가) | `SELECT_BY_PROJECT_ID` |
| `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js` | 수정(추가) | `getSnapshotByProjectId(projectId)` |
| `src/resolver/resourceManagement/ResourceManagementService.js` | 수정(**export 키워드만**) | `buildPeopleContext` 를 export |
| `src/resolver/resourceManagement/ResourceLoadFetcher.js` | **무수정** | `fetchAssignedLoadByAccounts`만 import |
| `src/api/jira/issue/IssuePropertyApi.js` | **무수정** | `mergeIssueProperty` import |
| `src/resolver/projectIssue/ProjectUsersService.js` | **무수정** | `updateIssueCoworkers` resolver 그대로 존치 |

### 3.2 `WorkAssignmentIssueFetcher.js` — 프로젝트 전용 이슈 패스 (핵심)

> ⚠️ `getProjectIssuesByFilter` / `getProjectGanttIssues` / `getBulkIssuesByProject` / `getProjectIssuesByUser` **절대 수정 금지**. 여기서만 조회한다.

```
상수
  DONE_WINDOW      = '-26w'      // ResourceLoadFetcher.LOAD_DONE_WINDOW 와 동일 값(원본 미수정 → 자체 상수)
  PAGE_SIZE        = 100
  MAX_PROJECT_ISSUES = 3000      // 초과 시 중단 + truncated:true (256MB 방어)

export fetchProjectIssuePass(projectId, as='user')
  JQL : moves_RMS_projectId = "<projectId>"
        AND (statusCategory != Done OR updated >= "-26w")
  API : POST /rest/api/3/search/jql  (postJiraJson, as:'user')
  body: {
    jql,
    fields: ['summary','status','statusCategory','duedate','timetracking','assignee','issuetype'],
    properties: ['movesRms'],
    maxResults: 100,
    nextPageToken?
  }
  루프: nextPageToken 소진 또는 MAX_PROJECT_ISSUES 도달까지
  반환: { issues: RawIssue[], scanned: number, truncated: boolean }
       실패 시 { issues:[], scanned:0, truncated:false } 부분 폴백(throw 안 함)
```

- **`fieldsByKeys` 불필요.** fields 리스트에 앱 커스텀필드(`moves_RMS_projectId`)를 **넣지 않기** 때문. 프로젝트 식별은 JQL 술어가 담당한다. (§5-1 근거)
- **1패스로 큐 + 프로젝트 부하를 동시에 만족**한다(추가 페치 없음).
  - 큐: `statusCategoryKey !== 'done'` 인 이슈에서 flags 계산
  - 부하: 전체(Done 26주 포함)에서 참여자별 집계

집계 함수(동일 모듈):
```
export aggregateProjectLoad(issues) -> Map<accountId, ProjectLoadRow>
  이슈마다:
    coworkers       = issue.properties.movesRms.coworkers ?? []
    hasAssignee     = !!issue.fields.assignee
    participantCount= max(1, (hasAssignee?1:0) + coworkers.length)     // ResourceLoadFetcher 와 동일
    perSpent        = timeSpentSeconds / participantCount
    perRem          = remainingEstimateSeconds / participantCount
    participants    = Set(assignee.accountId, ...coworkers)            // 중복 제거
    각 participant 에:
      statusCategory.key 로 todo/inProgress/done +1 (분할 안 함)
      assignedCount +1, spentSeconds += perSpent, remainingSeconds += perRem
  completionRate = spent/(spent+remaining), 분모 0 → null
```
> **주의**: 이슈에 참여자가 0명(미배정)이면 `participants`가 비어 어떤 계정에도 계상되지 않는다 — 의도된 동작(미배정 작업은 큐에만 나타남).

### 3.3 `WorkAssignmentRules.js` — 순수함수 (jest 대상, IO 없음)

```js
// 임계값 해석 — settings 우선, 없으면 기본값 (resolveBands 와 동일 패턴)
export const DEFAULT_ASSIGNMENT_THRESHOLDS = {
  dueSoonDays: 7, externalLoadRatio: 0.4, projectFocusRatio: 0.8, multiProjectMin: 3,
};
export const resolveAssignmentThresholds = (settings) => ({
  dueSoonDays:       settings?.assignmentDueSoonDays       ?? 7,
  externalLoadRatio: settings?.assignmentExternalLoadRatio ?? 0.4,
  projectFocusRatio: settings?.assignmentProjectFocusRatio ?? 0.8,
  multiProjectMin:   settings?.assignmentMultiProjectMin   ?? 3,
});

// 큐 flag 계산 (프론트 패치와 공유하는 규칙 — 동일 로직을 프론트에도 미러링)
export const computeQueueFlags = (item, { todayYmd, dueSoonDays }) => string[]
//   UNASSIGNED : assignee 없음 AND coworkers 비어있음
//   OVERDUE    : dueDate != null AND dueDate < todayYmd
//   DUE_SOON   : dueDate != null AND todayYmd <= dueDate <= todayYmd + dueSoonDays
//   NO_ESTIMATE: originalEstimateSeconds === 0 AND remainingEstimateSeconds === 0
//   (done 이슈는 호출 전에 제외)

export const computeLoadSplitRatio = (projectRemaining, companyRemaining) =>
  companyRemaining > 0 ? projectRemaining / companyRemaining : null;

export const computeSignals = ({ project, company, loadSplitRatio }, th) => string[]
export const rankAssignmentCandidates = (candidates) => Candidate[]
```

**신호(배지) 규칙 — 구체 수치 확정**

| 신호 | 조건 | tone | 의미 |
|---|---|---|---|
| `EXTERNAL_OVERLOAD` | `company.utilBand ∈ {over, red}` **AND** `loadSplitRatio != null && loadSplitRatio <= externalLoadRatio(0.4)` | danger | **핵심 탐지 목표** — "이 프로젝트만 보면 여유, 밖에서 과부하" |
| `EXTERNAL_OVERLOAD_ESTIMATED` | `company.util == null`(rollup 미집계) **AND** `company.remainingSeconds >= project.remainingSeconds * 2.5` **AND** `company.projectCount >= multiProjectMin(3)` | warning | 가동률 실적 없이 잔여작업량으로만 추정한 약한 신호 |
| `MULTI_PROJECT` | `company.projectCount >= multiProjectMin(3)` | warning | 다중 프로젝트 분산 |
| `PROJECT_FOCUSED` | `loadSplitRatio != null && loadSplitRatio >= projectFocusRatio(0.8)` | info | 이 프로젝트에 집중된 인력 |
| `NO_CAPACITY_DATA` | `company.util == null` **AND** `company.remainingSeconds === 0` | neutral | 판단 근거 부족 |

- `company === null`(권한 마스킹) 이면 **신호는 빈 배열**, `loadSplitRatio`는 null.
- `utilBand`는 `classifyUtilBand(util, bands)` (`ResourceMatch.js`) **재사용** — 밴드 경계(0.7/1.1/1.3)는 이미 `settings.utilization*Band`로 설정화되어 있으므로 **하드코딩 아님**.
- **설정화 판단**: 신규 4개 임계는 `resolveAssignmentThresholds(settings)`로 **읽기 경로를 먼저 만들되**, 1차에서는 `settings` 엔티티/manifest/설정 UI에 등재하지 않는다(항상 기본값). 근거 — (a) manifest `attributes` 미선언 키는 KVS 저장 시 422, 등재는 `forge deploy` 동반, (b) 신규 기능이라 튜닝 근거(실데이터)가 아직 없다, (c) 읽기 경로가 이미 있으므로 후속 등재 시 백엔드 코드 변경 0. `meta.thresholds`로 프론트에 내려 배지 툴팁이 "전사 잔여의 40% 이하" 같은 실제 수치를 표기한다.

**랭킹 규칙** (`rankAssignmentCandidates`)
> `ResourceMatch.rankCandidates`는 **재사용하지 않는다.** 그 함수는 평면 `util/remainingEstimateSeconds/inProgressCount`(전사)만 보며, 이 화면은 "프로젝트 내 여유 + 괴리 페널티"가 1순위라 정렬 의도가 다르다. 억지로 필드를 평면화해 맞추는 것보다 전용 순수함수가 정직하다.

정렬 우선순위(전부 tiebreaker 체인):
1. `coverage` desc (스킬 적합도 — 배정의 본질)
2. `signals.includes('EXTERNAL_OVERLOAD')` 인 후보를 뒤로 (false < true)
3. `company.utilBand` 서열 asc — `idle(0) < unknown(1) < normal(2) < over(3) < red(4)` (company null이면 1로 취급)
4. `project.remainingSeconds` asc (프로젝트 내 여유)
5. `project.assignedCount` asc
6. `displayName` `localeCompare` asc

### 3.4 `WorkAssignmentService.js` — 조립

#### `getWorkAssignmentBoardService({ projectId }, principal)`

```
0) 검증: projectId 없으면 LogicalError(ASSIGNMENT_PROJECT_ID_REQUIRED)
1) [선행 SQL, 수 ms] memberRows = executeQuery(ProjectUsersQuery.FIND_BY_PROJECT_ID, [projectId])
                     memberIds  = distinct(account_id)
2) [병렬 — Promise.all]  ← 전사 배치 + 프로젝트 배치 동시 실행 (요구 §4-6)
     a. fetchProjectIssuePass(projectId)                       // Jira 프로젝트 패스
     b. fetchAssignedLoadByAccounts(memberIds)                 // Jira 전사 배치 (무수정 재사용)
     c. buildPeopleContext()                                   // role/level/skill/rollup/settings/userMap 1회 조립
     d. executeQuery(SkillMappingQuery.SELECT_SKILL_IDS_BY_PROJECT, [projectId])
     e. getSnapshotByProjectId(projectId)                      // 프로젝트 내 util (스냅샷)
     f. executeQuery(ProjectUsersQuery.FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS(n), memberIds)
     g. findProjectByIdRepository([projectId])                 // projectName
   (a·b 는 서로 독립 → 순차 대기 없음. c~g 는 SQL/KVS 라 부하 낮음)
3) companyScopeVisible = isSatisfied(principal, { grants:[{resource:'RESOURCE_MANAGEMENT', action:'read'}] })
   // principal.isAdmin 이면 isSatisfied 가 true 를 반환하므로 관리자는 항상 전사 노출
4) projectLoadMap = aggregateProjectLoad(pass.issues)
5) queue = pass.issues
     .filter(statusCategory.key !== 'done')
     .map(toQueueItem)                          // UserRef resolve 는 6) 에서 일괄
     .filter(item => item.flags.length > 0)
     .sort(OVERDUE → DUE_SOON → UNASSIGNED → dueDate asc → issueKey asc)
     .slice(0, MAX_QUEUE_ITEMS=300)             // 초과 시 queueTruncated:true
6) user resolve: queue 의 assignee 는 fields 에 이미 포함(displayName/avatar 有).
   coworker accountId 는 resolveCoworkerUsersMap(queue 대상 이슈, 'user') 1회 bulk (N+1 없음)
7) candidates = memberIds.map(...)
     person = ctx.people.find(accountId)         // roleName/levelName/util/utilBand/skills
     coverage = computeCoverage(requiredIds, person.skills.map(s=>s.id))   // 재사용
     project = projectLoadMap.get(accountId) ?? 0-채움
       project.util = snapshot.members_json.find(m=>m.accountId).utilization ?? null
     company = companyScopeVisible ? { ...loadMap.get(accountId), util, utilBand, projectCount } : null
     loadSplitRatio = computeLoadSplitRatio(project.remainingSeconds, company?.remainingSeconds ?? 0)
     signals = company ? computeSignals(...) : []
   → rankAssignmentCandidates(candidates)
8) projectLoad = [...projectLoadMap.values()]    // 멤버 여부 무관 전원(pool 조인용)
9) return { content: { ... } }
```

**부분 성공 폴백** — Jira 패스 실패(a) → `queue:[]`, `projectLoad:[]`, `meta.issueScanned:0`(throw 안 함). 전사 배치 실패(b) → 각 후보 company 카운트 0. 스냅샷 없음(e) → `project.util: null`. **SQL 실패만 전파**(throw).

#### `getWorkAssignmentPoolService({ projectId }, principal)`

```
1) memberIds = project_users accountId (SQL)
2) [병렬] buildPeopleContext() / SELECT_SKILL_IDS_BY_PROJECT / FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS
3) poolIds = ctx.people.map(accountId) - memberIds
   ⚠️ poolIds.length 상한 MAX_POOL_ACCOUNTS = 300 (초과 시 coverage desc → util asc 로 잘라내고 truncated)
4) fetchAssignedLoadByAccounts(poolIds)         // 무수정 재사용 (50 청크 × p-limit 3)
5) candidates = poolIds.map(...)  isMember:false, project.* = 0/null
   company 는 항상 채움(이 resolver 자체가 RESOURCE_MANAGEMENT read 요구)
   loadSplitRatio / signals 는 project.remainingSeconds=0 기준으로 계산
   → rankAssignmentCandidates
```
- **프로젝트 이슈 패스 실행 안 함**(board가 이미 수행). 비멤버가 이 프로젝트 이슈에 참여 중이면 `board.projectLoad`에 잡히므로 프론트에서 조인 후 signals를 재계산하지 않고 **project 수치만 덮어쓴다**(신호는 board 기준 유지 — 서버/프론트 규칙 이원화 방지를 위해 프론트에서 `computeSignals` 미러 구현은 하지 않는다).

### 3.5 `WorkAssignmentWriter.js` — 배정 실행 (write 경로 2종)

```
assignWorkItemService({ projectId, issueId, issueKey, assigneeAccountId, coworkerAccountIds }, principal)

0) 검증
   - projectId 없음            → LogicalError(ASSIGNMENT_PROJECT_ID_REQUIRED)
   - issueId 와 issueKey 둘 다 없음 → LogicalError(ASSIGNMENT_ISSUE_REQUIRED)
   - assigneeAccountId === undefined && coworkerAccountIds === undefined
                                → LogicalError(ASSIGNMENT_NO_CHANGE)
   - coworkerAccountIds 가 배열이 아니면 → LogicalError(ASSIGNMENT_INVALID_COWORKERS)
   - issueKey 형식 검증: /^[A-Za-z0-9_-]+$/ (IssueApi.ISSUE_KEY_RE 와 동일 정책)

1) previous 확보 — 단건 GET (write 전)
   getIssueForAssignmentApi(issueKey ?? issueId)
     GET /rest/api/3/issue/{k}?fields=summary,status,statusCategory,duedate,timetracking,assignee,issuetype
         &properties=movesRms
     as:'user'                    // 검색 인덱스 무관 → 즉시 일관
   → previous { assigneeAccountId, coworkerAccountIds, participantCount,
                remainingEstimateSeconds, spentSeconds, statusCategoryKey }

2) write (순차 — 두 write 가 같은 이슈를 건드리므로 병렬 금지)
   a. assigneeAccountId !== undefined 이면
        assignIssueApi(issueKey ?? issueId, assigneeAccountId, 'user')
        → PUT /rest/api/3/issue/{k}/assignee   body: { accountId: assigneeAccountId }  (null = 미배정)
        ★ as:'user' (asApp 지양). 실패 시 throw → responseWrapper 가 직렬화
   b. coworkerAccountIds !== undefined 이면
        mergeIssueProperty(issueId ?? issueKey, { coworkers: coworkerAccountIds.filter(Boolean) })
        ★ IssuePropertyApi 의 as='app' 기본값 유지 — 프로퍼티 write 는 앱 컨텍스트가 기존 정책
          (updateIssueCoworkersService 와 완전히 동일한 호출. resolver 는 재사용하지 않고 헬퍼만 재사용)

3) 재조회 — 단건 GET 1회 (2)와 동일 함수)
   ★ search/jql 재조회 금지(인덱스 지연). 단건 GET 은 인덱스를 타지 않는다.

4) user resolve — getBulkJiraUsersApi([...coworkerIds], 'user') 1회
   assignee 는 GET 응답 fields.assignee 에 displayName/avatarUrls 포함

5) item = toQueueItem(재조회 결과) + computeQueueFlags(item, {todayYmd, dueSoonDays})
   return { content: { issueId, issueKey, applied, item, previous } }
```

**Jira 권한**: assignee write는 `as:'user'`라 호출자에게 Jira `ASSIGN_ISSUES` 권한이 필요하다. 프론트가 `useJiraProjectPermissions(projectKey).canAssignIssues`로 **사전 가드**(기존 `ensureJiraPermission` 패턴 재사용, `null`이면 시도 허용). 서버는 Jira 4xx를 `ForgeAPIError`로 그대로 전파.

### 3.6 에러 코드 (`ErrorCodes.js` 추가)

```js
// 작업 배정 (work-assignment)
ASSIGNMENT_PROJECT_ID_REQUIRED: 'ASSIGNMENT_PROJECT_ID_REQUIRED',
ASSIGNMENT_ISSUE_REQUIRED:      'ASSIGNMENT_ISSUE_REQUIRED',
ASSIGNMENT_NO_CHANGE:           'ASSIGNMENT_NO_CHANGE',
ASSIGNMENT_INVALID_COWORKERS:   'ASSIGNMENT_INVALID_COWORKERS',
```
기존 재사용: `PERMISSION_DENIED`, `PERMISSION_PROJECT_SCOPE_DENIED`, `ForgeAPIError`(Jira 4xx/5xx).

### 3.7 `PermissionMap.js` 추가

```js
// ── WorkAssignment (WorkAssignmentController, 3) ──────────────────────────
// 판단(읽기)은 프로젝트 상세 권한 기준. 전사 스코프 컬럼/풀은 서비스가 principal 로 부분 마스킹(§3.4-3).
getWorkAssignmentBoard: R('PROJECT', 'detail'),
// 전사 인력 풀 확장 — 자원관리 read 필수 + 프로젝트 스코프 검증
getWorkAssignmentPool:  R('RESOURCE_MANAGEMENT', 'detail'),
// 배정 실행 — payload 에 projectId 를 반드시 포함시켜 inherited scope 검증이 실제로 걸리게 한다
assignWorkItem:         W('PROJECT', 'inherited'),
```
- **신규 카탈로그 키 불필요.** 근거: 분리 기준 3가지(민감도/사용자군/write 의미) 중 어느 것도 충족하지 않는다 — 배정 실행은 "프로젝트 데이터 편집"이라 `PROJECT` write와 의미가 같고, 전사 지표는 이미 `RESOURCE_MANAGEMENT`가 담당한다.
- `assignWorkItem`은 `updateIssueCoworkers`(`W('PROJECT','inherited')`, payload에 projectId 없어 scope 검증 불가 — §10-8 한계)와 달리 **payload에 projectId를 필수로 두어 한계를 해소**한다.
- `test/permission/permissionMap.contract.test.js`(등록집합 ↔ 맵키집합 대조)가 자동으로 3키를 검증한다.

### 3.8 `src/index.js` 등록

```js
import { registerWorkAssignmentController } from "./resolver/workAssignment/WorkAssignmentController";
...
registerWorkAssignmentController(resolver);
```

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트 트리

```
static/ui/src/pages/projectDetail/assignment/
├── AssignmentPage.jsx                 // 셸: 좌우 2분할(좌 38% / 우 62%), 선택 상태 소유
├── useWorkAssignmentBoard.js          // getWorkAssignmentBoard
├── useWorkAssignmentPool.js           // getWorkAssignmentPool (enabled = poolOpen && meta.poolAvailable)
├── useAssignWorkItem.js               // useMutation + 캐시 패치(무효화 금지)
├── patchAssignmentCache.js            // 순수함수 (jest 대상)
├── queueFlags.js                      // computeQueueFlags 프론트 미러(백엔드 규칙과 동일 — 패치 시 flags 재계산용)
├── queue/
│   ├── WorkQueuePanel.jsx             // 헤더 카운트 + 필터 + 리스트
│   ├── WorkQueueFilters.jsx           // 세그먼트: 전체 / 미배정 / 마감임박 / 지연  (클라이언트 필터)
│   └── WorkQueueItem.jsx              // 이슈키·요약·상태·D-day·잔여MD·현재 담당/협업자 아바타
└── candidate/
    ├── CandidatePanel.jsx             // 선택 작업 컨텍스트 헤더 + 스코프 토글 + 테이블
    ├── AssignmentCandidateTable.jsx   // 이중 스코프 테이블 (CommonTable)
    ├── ScopeSplitCell.jsx             // "프로젝트 | 전사" 나란히 셀
    ├── GapSignalBadge.jsx             // signals[] → StatusBadge + Tooltip(임계 수치 표기)
    └── AssignActionCell.jsx           // [담당자 지정] / [협업자 추가] 버튼 (write 게이트)
```

### 4.2 재사용 vs 신규

| 자산 | 경로 | 판정 |
|---|---|---|
| `CommonTable` | `components/table/CommonTable` | **재사용** |
| `UserAvatar` | `components/avatar/UserAvatar` | **재사용** |
| `UtilBadge` | `pages/resource/overview/UtilBadge.jsx` | **재사용** (전사 가동률 셀) |
| `AssignedIssueCell` | 동 | **재사용** (todo/inProgress/done 카운트, 프로젝트·전사 양쪽) |
| `WorkloadCell` | 동 | **재사용** (spent/remaining/진행도 바). props `{spentSeconds, remainingSeconds, completionRate, hourRate}` 그대로 |
| `CompletionBar` | 동 | **재사용** (완수율만 좁게 보일 때) |
| `SkillChip` | `pages/resource/overview/SkillTags.jsx` | **재사용** (matched/missing 칩) |
| `StatusBadge` | `pages/resource/StatusBadge.jsx` | **재사용** (신호 배지 기반) |
| `InfoTip` | `pages/projectDetail/progress/InfoTip.jsx` | **재사용** (지표 설명) |
| `ResourceProfileDrawer` | `pages/resource/overview/profile/` | **재사용** (§4-6 제약 참조) |
| `useJiraProjectPermissions` / `projectKeyOfIssue` | `utils/jiraApi/useJiraEditGuards.js` | **재사용** (assignee write 사전 가드) |
| `CandidateRankTable` | `pages/resource/match/` | **재사용 안 함** — 단일 스코프 9컬럼 전용, 이중 스코프로 개조하면 `/resource` 적합도 탭에 회귀 위험. 컬럼 셀 컴포넌트만 재사용하고 테이블은 신규 |
| `useProjectSkillMatch` | 동 | **재사용 안 함** — 커버리지가 board 응답에 이미 포함(추가 invoke 불필요) |
| `executeRequest('assignIssue')` (프론트 직접 Jira) | `utils/jiraApi/requestJira.js` | **사용 안 함** — 배정은 백엔드 `assignWorkItem` 단일 경로(권한 가드 + 응답 기반 캐시 패치 계약 때문). 프론트 직접 호출은 권한 게이트를 우회한다 |

### 4.3 쿼리키 (`utils/queryKey/assignmentKeys.js` 신규)

```js
export const assignmentKeys = {
    all: ['workAssignment'],
    board: (projectId) => ['workAssignment', 'board', projectId],
    pool:  (projectId) => ['workAssignment', 'pool',  projectId],
};
```
- 인라인 키 금지. 기존 `resourceKeys` 확장이 아니라 **별도 팩토리** — 프로젝트 상세 소유 데이터라 `/resource` 무효화와 섞이면 안 된다.

### 4.4 훅 계약

```js
// useWorkAssignmentBoard(projectId)
useQuery({
  queryKey: assignmentKeys.board(projectId),
  queryFn: async () => {
    const res = await invoke('getWorkAssignmentBoard', { projectId });
    if (!res?.success || !res?.content) throw new Error(res?.error?.code || 'NO_DATA');
    return res.content;
  },
  enabled: !!projectId,
  staleTime: 60_000,
  refetchOnWindowFocus: false,   // ★ 인덱스 지연 — 패치한 캐시를 옛 값으로 덮지 않기 위해 필수
})
// 반환: { queue, candidates, projectLoad, requiredSkills, meta, projectName, isLoading, isError }

// useWorkAssignmentPool(projectId, enabled)
//   enabled = poolOpen && board.meta.poolAvailable
//   반환 candidates 를 board.projectLoad(Map) 로 accountId 조인해 project.* 만 덮어쓴다.
//   (signals 는 서버 값 유지 — 프론트에서 규칙 재구현 금지)
```

### 4.5 배정 실행 + 캐시 패치 (인덱스 지연 대응 — **필수 규약**)

```js
// useAssignWorkItem(projectId)
const mutation = useMutation({
  mutationFn: async (vars) => {
    const res = await invoke('assignWorkItem', { projectId, ...vars });
    if (!res?.success || !res?.content) throw new Error(res?.error?.code || 'ASSIGN_FAILED');
    return res.content;                       // AssignResult
  },
  onSuccess: (result) => {
    queryClient.setQueryData(
      assignmentKeys.board(projectId),
      (prev) => patchAssignmentCache(prev, result),   // 순수함수
    );
    // ★ invalidateQueries 절대 금지 — search/jql 재조회는 옛 값을 되돌려 화면이 롤백된다
    //    (간트 상위지정 사건과 동일 함정. project_jira_search_index_lag)
  },
});
```

`patchAssignmentCache(board, result)` — **순수함수, jest 대상**

```
1) queue 갱신
   idx = board.queue.findIndex(q => q.issueId === result.issueId)
   - result.item.flags.length === 0  → 큐에서 제거 (배정 완료로 큐 이탈)
   - 그 외 → board.queue[idx] = result.item   (없으면 무시)

2) candidates delta (프로젝트 스코프만 — 전사 스코프는 배치 산출물이라 건드리지 않는다)
   prevIds = [previous.assigneeAccountId, ...previous.coworkerAccountIds].filter(Boolean) → Set
   nextIds = [item.assignee?.accountId, ...item.coworkers.map(c=>c.accountId)].filter(Boolean) → Set
   prevPerRem   = previous.remainingEstimateSeconds / max(1, previous.participantCount)
   prevPerSpent = previous.spentSeconds             / max(1, previous.participantCount)
   nextPerRem   = item.remainingEstimateSeconds     / max(1, item.participantCount)
   nextPerSpent = item.timeSpentSeconds             / max(1, item.participantCount)

   각 candidate(c) 에 대해:
     wasIn = prevIds.has(c.accountId);  isIn = nextIds.has(c.accountId)
     if (!wasIn && !isIn) continue
     p = { ...c.project }
     if (wasIn) { p.remainingSeconds -= prevPerRem; p.spentSeconds -= prevPerSpent;
                  p.assignedCount -= 1; decCount(p, previous.statusCategoryKey) }
     if (isIn)  { p.remainingSeconds += nextPerRem; p.spentSeconds += nextPerSpent;
                  p.assignedCount += 1; incCount(p, item.statusCategoryKey) }
     p.remainingSeconds = max(0, p.remainingSeconds); p.spentSeconds = max(0, p.spentSeconds)
     p.assignedCount = max(0, p.assignedCount)
     p.completionRate = (p.spentSeconds + p.remainingSeconds) > 0
                        ? p.spentSeconds / (p.spentSeconds + p.remainingSeconds) : null
     c.project = p
   // util / signals / loadSplitRatio 는 재계산하지 않는다 (전사 값이 불변이므로 규칙 이원화 회피).
   //  → 다음 자연 재조회(staleTime 60s 경과 후) 때 서버 값으로 정합.

3) board.projectLoad 도 같은 delta 를 적용 (pool 조인 일관성)
4) board.meta.patchedAt = new Date().toISOString()
```

**왜 서버가 `previous`를 돌려줘야 하는가**: 프론트 캐시의 `queue[idx]`가 이미 다른 패치로 변형됐을 수 있고, 다른 사용자가 그 사이 이슈를 수정했을 수도 있다. delta의 기준점은 **서버가 write 직전에 단건 GET으로 확인한 실제 값**이어야 정확하다. 이것이 `AssignResult.previous`의 존재 이유다.

### 4.6 권한 게이트 (프론트)

| 대상 | 게이트 | 실패 시 |
|---|---|---|
| 탭 진입 | 프로젝트 상세 진입 자체가 `PROJECT` read (별도 `canRender` 불필요) | — |
| 전사 스코프 컬럼 | `board.meta.companyScopeVisible` (서버 판정) | 컬럼 자리에 `assignment.scope.companyLocked` 안내, 신호 배지 미표기 |
| 전사 인력 풀 토글 | `board.meta.poolAvailable` | 토글 미노출 |
| 배정 실행 버튼 | `usePermissionStore(s => s.canWrite('PROJECT'))` **AND** `useJiraProjectPermissions(projectKey).canAssignIssues !== false` | 버튼 disabled + Tooltip. Jira 권한이 `null`(미확인)이면 **허용**(서버 최종 판정) |
| **후보 로우 클릭 → 드로어** | `usePermissionStore(s => s.canRead('RESOURCE_MANAGEMENT'))` | 로우 클릭 비활성 + Tooltip `assignment.drawer.locked` |

> ⚠️ **드로어 제약(실제 코드 확인)**: `useResourceProfile`은 `canRead('RESOURCE_MANAGEMENT')`로 `enabled`를 막고, `getResourceProfile` resolver도 `R('RESOURCE_MANAGEMENT')`다. 따라서 `PROJECT` read만 가진 PM은 드로어를 열어도 빈 화면이 된다. `useResourceProfile`의 게이트를 완화하면 `/resource` 회귀 위험이 있으므로 **완화하지 않고 프론트에서 클릭 자체를 게이팅**한다.

### 4.7 `tabs.js` 수정

`projectDetailTabs`의 `projectUser.children` 배열 **끝에** 추가(순서: 인력 목록 → 급여 → 작업 배정):

```jsx
{
    key: 'projectAssignment',
    label: (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PersonAddIcon label="" />   {/* @atlaskit/icon/core/person-add — 미존재 시 PeopleGroupIcon */}
            {t('projectDetail.tabs.assignment')}
        </span>
    ),
    component: () => <AssignmentPage project_id={project_id} toast={toast} />,
},
```
- `canRender` 미지정(항상 노출). 근거: 읽기(판단)는 `PROJECT` read면 충분하고, 쓰기는 버튼 레벨에서 게이팅한다. `projectDetailTabs` 시그니처 **변경 불필요**.

### 4.8 Zustand 스토어
- **변경 없음.** `useI18nStore.t()` / `usePermissionStore.canRead|canWrite` 읽기만 사용. 선택 작업(`selectedIssueId`)·스코프 토글은 `AssignmentPage`의 로컬 `useState`(단일 화면 상태라 전역화 불필요).

### 4.9 화면 레이아웃 (우측 테이블 컬럼)

| # | 컬럼 | 내용 | 컴포넌트 |
|---|---|---|---|
| 1 | 인력 | 아바타 + 이름 + `isMember:false`면 "외부" 칩 | `UserAvatar` |
| 2 | 직무/등급 | `roleName / levelName` | — |
| 3 | 적합도 | `score%` + `matched/required` | `StatusBadge` |
| 4 | **프로젝트 내** | 할당 `assignedCount` · 상태 카운트 · 잔여 MD | `AssignedIssueCell` + `WorkloadCell` |
| 5 | **전사** | 가동률 배지 · 참여 프로젝트 수 · 잔여 MD | `UtilBadge` + `AssignedIssueCell` + `WorkloadCell` |
| 6 | 신호 | `signals[]` 배지(툴팁에 임계 수치) | `GapSignalBadge` (신규) |
| 7 | 스킬 | matched / missing 칩 | `SkillChip` |
| 8 | 배정 | [담당자] [협업자] | `AssignActionCell` (신규) |

4·5 컬럼을 **좌우로 붙여 배치**하고 컬럼 그룹 헤더에 "프로젝트 내 | 전사"를 명시해 괴리를 시각적으로 대비시킨다(요구 §2.2 "한 행에 나란히"의 구현).

---

## 5. 핵심 논점 판정

### 5-1. "프로젝트 내 부하" 산출 — **가능(A/B) / 부분 불가(C)**

#### A. 산출 경로 (가능)
JQL 술어 `moves_RMS_projectId = "<uuid>"` 로 프로젝트를 확정하고, 응답의 `assignee` + `properties.movesRms.coworkers`로 참여자를 집계한다. `ResourceLoadFetcher`와 **완전히 동일한 균등분할 규칙**을 적용하므로 프로젝트 값과 전사 값이 같은 단위로 비교된다(이 화면의 핵심 요건).

#### B. `fieldsByKeys` — 이 경로에는 **불필요**. 마이페이지 판정과의 차이 (코드로 확인)

| | 마이페이지(불가) | 작업 배정(가능) |
|---|---|---|
| 호출 함수 | `IssueApi.getProjectIssuesByUser` | 신규 `fetchProjectIssuePass` |
| JQL 스코프 | `(moves_RMS_projectId = A OR = B OR = C)` — **여러 프로젝트 한 번에** | `moves_RMS_projectId = "<단일 uuid>"` |
| 프로젝트 식별을 어디서 얻나 | **응답 fields의 `moves_RMS_projectId`** — 되나누기가 필요하므로 | **JQL 술어** — 되나누기가 불필요 |
| `fields` 리스트 | `...,moves_RMS_projectId` 포함 (`IssueApi.js:251`) | 앱 필드 **미포함** |
| `fieldsByKeys` | **없음** (`requestJiraJson` URL, `IssueApi.js:253`) → `getCustomFieldId`가 Forge key를 반환하므로 앱 필드가 **조용히 누락** | **불필요**(요청 자체를 안 함) |
| 결과 | RMS 프로젝트별 분해 불가 → `useMyContribution.js:7` 주석대로 이슈별/일자별 집계로 후퇴 | **프로젝트 스코프 확정** |

→ **우회 성립.** 부가로 `src/` 전역에 `fieldsByKeys` 사용이 **0건**임을 확인했다. 즉 "백엔드에서 앱 커스텀필드를 fields로 요청하는 경로는 전부 잠재 버그"이며, 우리 설계는 그 경로를 아예 만들지 않는 방식으로 회피한다.

부가 확인:
- **팀 관리형 프로젝트**: 앱 필드가 fields 응답에서 통째로 빠져도 **JQL 인덱스는 동작**하므로 이 경로는 안전(`project_team_managed_field_gap`과 일치). coworker도 `movesRmsCoworkers` alias + 이슈 프로퍼티라 커버된다.
- **잔존 리스크(신규 아님)**: dev/prod 앱이 한 사이트에 공존하면 JQL 필드명이 모호해진다(`project_forge_env_field_duplication`). 이는 기존 전 경로 공통 문제이며 본 설계가 새로 만드는 위험이 아니다 — 운영 사이트엔 단일 환경 앱만 설치.

#### C. **산출 불가 판정: "프로젝트 내 실시간 가동률(util)"**
- **불가 사유**: 가동률은 워크로그(실적 MD) ÷ 경과 근무일 이며, 프로젝트별로 실시간 산출하려면 프로젝트 워크로그 전량 페치 + 공휴일/연차 차감이 필요하다(`PortfolioAggregator`가 배치로 하는 일). 화면 진입마다 이를 수행하면 Forge 256MB/타임아웃 제약과 "공통 워크로그 페처 수정 금지" 원칙을 동시에 위반한다.
- **대안(채택)**: `portfolio_project_snapshot.members_json[].utilization` — 일 배치가 이미 **프로젝트별 멤버 가동률**을 계산해 저장하고 있다(`PortfolioAggregator.js:366`). 이를 `SELECT_BY_PROJECT_ID`로 1행 읽어 `candidate.project.util`에 채우고, `meta.snapshotAggregatedAt`으로 **집계 시각을 함께 노출**한다(stale 표기). 스냅샷 없으면 `null` → `'-'`.
- **결론**: 프로젝트 내 스코프의 **실시간 신뢰 지표는 건수/작업량/완수율**이고, 가동률은 **배치 유래 참고값**으로만 표기한다. 이 구분을 UI 툴팁(`assignment.tip.projectUtil`)에 명시한다.

### 5-2. 후보 인력 모집단 — **프로젝트 배정 인력 기본 + 전사 풀 온디맨드 확장**

| 안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| project_users만 | 계약/급여가 걸린 실제 투입 가능 인원, 응답·Jira 배치 비용이 인원 수에 비례해 저렴 | "밖에서 사람 데려오기" 불가 | **기본값** |
| 전사 전체 | 외부 투입 후보 탐색 가능 | 프로젝트 상세 진입마다 전사 배치(전 사용자 / 50 청크)가 돌아 상시 비용, 대부분의 방문에서 불필요, 전사 가동률 노출 권한이 다름 | 기본값 부적합 |
| **혼합(채택)** | 기본은 멤버, 토글 시 `getWorkAssignmentPool` 온디맨드 | resolver 2개 | **채택** |

근거:
1. **비용**: 전사 배치는 `fetchAssignedLoadByAccounts`가 50명 청크 × p-limit 3으로 Jira를 친다. 탭 진입마다 전 사용자를 도는 건 저빈도 액션에 상시 비용을 매기는 것이다.
2. **권한**: 전사 가동률은 `RESOURCE_MANAGEMENT`(Member 기본 `{read:false,write:false}`) 소관이다. 기본 화면을 전사로 두면 PM 다수가 빈 화면을 본다.
3. **의사결정 순서**: 실무는 "우리 팀 안에서 배정" → 안 되면 "밖에서 찾기" 순서다. UI가 그 순서를 따라야 한다.
4. **중복 제거**: pool은 프로젝트 이슈 패스를 재실행하지 않고 `board.projectLoad` 조인으로 해결한다(§3.4).

**외부 후보를 실제 배정할 때**: `project_users` 미등록 상태로 이슈만 배정된다. 배정 자체는 막지 않되(Jira 권한이 최종 판정) 확인 모달에 `assignment.warn.notMember`(프로젝트 인력에 추가 안내)를 띄운다. `insertProjectusers`는 백오피스 등록 사용자만 허용하므로 자동 추가는 하지 않는다.

### 5-3. 괴리 신호 — §3.3 표에 수치까지 확정. 설정화는 **읽기 경로만 선반영**(manifest 미등재).

### 5-4. write 경로 2종 — assignee는 **신규**(`PUT /issue/{k}/assignee`, `as:'user'`), coworker는 **기존 헬퍼 재사용**(`mergeIssueProperty`, `as:'app'`). `updateIssueCoworkers` resolver는 **무수정 존치**(다른 화면이 사용 중).

### 5-5. 인덱스 지연 — write 후 `search/jql` **금지**, 단건 GET 재조회 + `AssignResult{item, previous}` 응답 기반 캐시 패치. `invalidateQueries` 금지, `refetchOnWindowFocus:false`.

### 5-6. 성능 — 아래 표.

| 항목 | 값 | 근거 |
|---|---|---|
| 프로젝트 패스 페이지 | `maxResults=100` + `nextPageToken` 루프 | 기존 페처 관례 |
| 프로젝트 이슈 상한 | `MAX_PROJECT_ISSUES = 3000` | 256MB 방어. 초과 시 `issueTruncated:true` |
| 큐 상한 | `MAX_QUEUE_ITEMS = 300` | 응답 크기. 초과 시 `queueTruncated:true` |
| 전사 풀 상한 | `MAX_POOL_ACCOUNTS = 300` | Jira 배치 6청크 이내 |
| Done 창 | `-26w` | `LOAD_DONE_WINDOW`와 동일 |
| 동시성 | 전사 배치 = 기존 `p-limit(3)`, 프로젝트 패스 = 순차 페이지 루프(1패스) | 원본 무수정 |
| 병렬 | 프로젝트 패스 ‖ 전사 배치 ‖ SQL/KVS 조립 (`Promise.all`) | 요구 §4-6. 선행 SQL(멤버 id)은 수 ms라 병렬 대상 아님 |
| 공통 페처 | **전부 무수정** | `feedback_worklog_fetch_isolation` |
| KVS 캐시 | **도입 안 함** | 배정 판단은 실시간성이 본질(캐시하면 방금 배정한 결과가 안 보인다). Resource 분석류의 KVS 캐시 패턴은 여기 부적합 |

### 5-7. 권한 — §3.7. **신규 카탈로그 키 없음.** 읽기 `PROJECT`, 전사 확장 `RESOURCE_MANAGEMENT`, 쓰기 `PROJECT` write.

---

## 6. DB 설계

### 6.1 신규 스키마 **없음**, 마이그레이션 **없음**

### 6.2 추가되는 쿼리 1건 (`PortfolioSnapshotQuery.js`)

```js
// 작업 배정 — 프로젝트 내 멤버 가동률(members_json) 1행 조회
SELECT_BY_PROJECT_ID: `
    SELECT
        BIN_TO_UUID(project_id) AS project_id,
        members_json,
        avg_utilization,
        aggregated_at
    FROM portfolio_project_snapshot
    WHERE project_id = UUID_TO_BIN(?)
`,
```
`PortfolioSnapshotRepository.getSnapshotByProjectId(projectId)` → `rows[0] ?? null`. 쿼리 실패 시 `null` 폴백(부분 성공, throw 안 함).

### 6.3 읽기 재사용 목록

| 저장소 | 대상 | 용도 |
|---|---|---|
| MySQL | `projectusers` (`FIND_BY_PROJECT_ID`, `FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`) | 후보 모집단, 참여 프로젝트 수 |
| MySQL | `skill_mapping` (`SELECT_SKILL_IDS_BY_PROJECT`, `SELECT_SKILLS_BY_ACCOUNTS`) | 요구 스킬 / 보유 스킬 |
| MySQL | `portfolio_project_snapshot` (신규 SELECT) | 프로젝트 내 가동률 |
| KVS | `settings` | 가동률 밴드 + (후속) 배정 임계 |
| KVS | `portfolioRollup:current` | 전사 가동률 `utilizationPeople` |
| KVS | `role` / `level` / `skill` | 라벨 |

---

## 7. i18n 키 목록

### 7.1 신규 `locales/kr/assignment.json` / `locales/en/assignment.json`

| 키 | kr | en |
|---|---|---|
| `tab.label` | 작업 배정 | Work Assignment |
| `page.description` | 배정할 작업을 고르고, 프로젝트 내·전사 부하를 함께 보고 배정합니다 | Pick a work item and assign it with both in-project and company-wide load in view |
| `queue.title` | 배정 대상 작업 | Work queue |
| `queue.filter.all` | 전체 | All |
| `queue.filter.unassigned` | 미배정 | Unassigned |
| `queue.filter.dueSoon` | 마감임박 | Due soon |
| `queue.filter.overdue` | 지연 | Overdue |
| `queue.empty` | 배정이 필요한 작업이 없습니다 | No work items need assignment |
| `queue.truncated` | 작업이 많아 상위 {n}건만 표시합니다 | Showing top {n} items only |
| `queue.selectPrompt` | 좌측에서 작업을 선택하세요 | Select a work item on the left |
| `queue.flag.UNASSIGNED` | 미배정 | Unassigned |
| `queue.flag.OVERDUE` | 지연 | Overdue |
| `queue.flag.DUE_SOON` | 마감임박 | Due soon |
| `queue.flag.NO_ESTIMATE` | 추정없음 | No estimate |
| `queue.dday.left` | D-{n} | D-{n} |
| `queue.dday.over` | D+{n} | D+{n} |
| `queue.dday.none` | 기한없음 | No due date |
| `queue.currentAssignee` | 현재 담당 | Assignee |
| `queue.currentCoworkers` | 협업자 | Coworkers |
| `candidate.title` | 후보 인력 | Candidates |
| `candidate.forIssue` | {issueKey} 배정 후보 | Candidates for {issueKey} |
| `candidate.empty` | 후보 인력이 없습니다 | No candidates |
| `col.member` | 인력 | Member |
| `col.roleLevel` | 직무/등급 | Role / Level |
| `col.fit` | 적합도 | Fit |
| `col.projectScope` | 프로젝트 내 | In project |
| `col.companyScope` | 전사 | Company-wide |
| `col.signal` | 신호 | Signal |
| `col.skills` | 스킬 | Skills |
| `col.action` | 배정 | Assign |
| `scope.toggle.pool` | 전사 인력 풀 보기 | Show company-wide pool |
| `scope.member` | 프로젝트 인력 | Project member |
| `scope.external` | 외부 | External |
| `scope.companyLocked` | 전사 지표를 보려면 자원관리 조회 권한이 필요합니다 | Resource Management read permission is required to view company-wide metrics |
| `signal.EXTERNAL_OVERLOAD` | 전사 과부하 | Overloaded elsewhere |
| `signal.EXTERNAL_OVERLOAD.tip` | 이 프로젝트 잔여작업은 전사 잔여의 {ratio}% 이하인데 전사 가동률이 과부하 구간입니다 | In-project remaining work is under {ratio}% of company-wide remaining, while company-wide utilization is in the overload band |
| `signal.EXTERNAL_OVERLOAD_ESTIMATED` | 전사 과부하(추정) | Overloaded elsewhere (estimated) |
| `signal.EXTERNAL_OVERLOAD_ESTIMATED.tip` | 가동률 실적이 없어 잔여작업량으로 추정한 값입니다 | Estimated from remaining work only — no utilization actuals available |
| `signal.MULTI_PROJECT` | 다중 프로젝트 | Multi-project |
| `signal.MULTI_PROJECT.tip` | {n}개 프로젝트에 참여 중입니다 | Assigned to {n} projects |
| `signal.PROJECT_FOCUSED` | 이 프로젝트 집중 | Focused here |
| `signal.PROJECT_FOCUSED.tip` | 잔여작업의 {ratio}% 이상이 이 프로젝트입니다 | {ratio}% or more of remaining work is in this project |
| `signal.NO_CAPACITY_DATA` | 데이터 없음 | No data |
| `signal.NO_CAPACITY_DATA.tip` | 가동률·부하 실적이 없어 판단 근거가 부족합니다 | No utilization or load actuals to judge by |
| `action.assign` | 담당자 지정 | Set assignee |
| `action.addCoworker` | 협업자 추가 | Add coworker |
| `action.removeCoworker` | 협업자 해제 | Remove coworker |
| `action.unassign` | 담당 해제 | Unassign |
| `confirm.assign.title` | 담당자를 지정할까요? | Set assignee? |
| `confirm.assign.body` | {issueKey} 의 담당자를 {name} 님으로 지정합니다 | {name} will be set as the assignee of {issueKey} |
| `confirm.coworker.title` | 협업자를 추가할까요? | Add coworker? |
| `confirm.coworker.body` | {issueKey} 에 {name} 님을 협업자로 추가합니다 | {name} will be added as a coworker on {issueKey} |
| `warn.notMember` | 이 인력은 프로젝트 인력에 등록되어 있지 않습니다. 인력 목록에서 추가해 주세요 | This person is not registered as a project member. Please add them in the member list |
| `toast.assign.success` | 배정이 완료되었습니다 | Assignment completed |
| `toast.assign.error` | 배정에 실패했습니다 | Assignment failed |
| `toast.jiraPermission.assign` | 이 프로젝트에서 담당자를 지정할 Jira 권한이 없습니다 | You do not have Jira permission to assign issues in this project |
| `drawer.locked` | 인력 상세를 보려면 자원관리 조회 권한이 필요합니다 | Resource Management read permission is required to view the profile |
| `tip.projectUtil` | 프로젝트 내 가동률은 일 배치 집계값입니다({at} 기준). 실시간 값이 아닙니다 | In-project utilization comes from the daily batch (as of {at}) and is not real time |
| `tip.projectLoad` | 여러 명이 참여한 작업은 작업량을 참여 인원으로 균등 분할한 1인 기대 몫입니다(근사치) | For shared work items, workload is split evenly across participants (approximate) |
| `tip.companyLoad` | 열린 작업 전부 + 최근 26주 완료분 기준 | All open work items plus completions in the last 26 weeks |
| `meta.snapshotAt` | 프로젝트 집계 {at} | Project aggregated {at} |
| `meta.rollupAt` | 전사 집계 {at} | Company aggregated {at} |
| `meta.noAggregate` | 집계 이력 없음 | Not aggregated yet |

### 7.2 수정 `locales/kr/projectDetail.json` / `locales/en/projectDetail.json`

| 키 | kr | en |
|---|---|---|
| `tabs.assignment` | 작업 배정 | Work Assignment |

### 7.3 merge
`cd static/ui && npm run merge` (`locales/script/merge.js`) → `ko-KR.json` / `en-US.json` 생성.
**`ko-KR.json` / `en-US.json` 직접 수정 금지. `locales/script/*.json`은 빈 스텁이라 거기 넣으면 반영 안 됨.**

---

## 8. 구현 작업 분해

### 8.1 Backend 체크리스트

- [ ] **B1** `ErrorCodes.js` — `ASSIGNMENT_*` 4개 추가
- [ ] **B2** `IssueApi.js` — `assignIssueApi(issueIdOrKey, accountId, as='user')`(PUT `/issue/{k}/assignee`, `putJiraJson`) + `getIssueForAssignmentApi(issueIdOrKey, as='user')`(GET 단건, `properties=movesRms`) **추가만**. 기존 함수 무수정
- [ ] **B3** `PortfolioSnapshotQuery.js` — `SELECT_BY_PROJECT_ID` 추가 / `PortfolioSnapshotRepository.js` — `getSnapshotByProjectId` 추가(실패 시 null 폴백)
- [ ] **B4** `ResourceManagementService.js` — `buildPeopleContext` 앞에 `export` 추가 (시그니처·반환·기존 호출부 **무변경**)
- [ ] **B5** `WorkAssignmentRules.js` 신규 — `resolveAssignmentThresholds` / `computeQueueFlags` / `computeLoadSplitRatio` / `computeSignals` / `rankAssignmentCandidates` (§3.3)
- [ ] **B6** `__test__/WorkAssignmentRules.test.js` — flags 4종, 신호 5종 경계값(0.4·0.8·3·2.5배), `company:null` 케이스, 랭킹 tiebreaker 순서
- [ ] **B7** `WorkAssignmentIssueFetcher.js` 신규 — `fetchProjectIssuePass` / `aggregateProjectLoad` (§3.2). **공통 페처 무수정**, `fieldsByKeys` 미사용, `as:'user'`
- [ ] **B8** `WorkAssignmentWriter.js` 신규 — `assignWorkItemService` (§3.5). 검증 → previous GET → write(assignee 순차 coworker) → 재조회 GET → user resolve → `{item, previous, applied}`
- [ ] **B9** `WorkAssignmentService.js` 신규 — `getWorkAssignmentBoardService` / `getWorkAssignmentPoolService` (§3.4). `Promise.all` 병렬, `isSatisfied`로 전사 마스킹, 부분 성공 폴백
- [ ] **B10** `WorkAssignmentController.js` 신규 — `guardedDefine` 3건. board/pool은 `({payload, principal}) => svc(payload, principal)`, assign은 `({payload}) => svc(payload)`
- [ ] **B11** `PermissionMap.js` — 3키 추가 (§3.7)
- [ ] **B12** `src/index.js` — import + `registerWorkAssignmentController(resolver)`
- [ ] **B13** `npm test` — 신규 순수함수 테스트 + `permissionMap.contract.test.js` 통과 확인

### 8.2 Frontend 체크리스트

- [ ] **F1** `utils/queryKey/assignmentKeys.js` 신규 (§4.3)
- [ ] **F2** `locales/kr/assignment.json` + `locales/en/assignment.json` 신규, `projectDetail.json` 양쪽에 `tabs.assignment` 추가 → `npm run merge`
- [ ] **F3** `assignment/useWorkAssignmentBoard.js` — `staleTime:60_000`, **`refetchOnWindowFocus:false`**
- [ ] **F4** `assignment/useWorkAssignmentPool.js` — `enabled = poolOpen && meta.poolAvailable`, board.projectLoad 조인
- [ ] **F5** `assignment/queueFlags.js` — `computeQueueFlags` 프론트 미러(백엔드 §3.3과 규칙 동일)
- [ ] **F6** `assignment/patchAssignmentCache.js` + 테스트 — §4.5 delta 규칙(순수함수)
- [ ] **F7** `assignment/useAssignWorkItem.js` — `useMutation` + `setQueryData` 패치. **`invalidateQueries` 금지**
- [ ] **F8** `queue/WorkQueuePanel.jsx` / `WorkQueueFilters.jsx` / `WorkQueueItem.jsx` — 세그먼트 필터(클라이언트), 선택 하이라이트, truncated 안내
- [ ] **F9** `candidate/AssignmentCandidateTable.jsx` — `CommonTable` 8컬럼(§4.9), 프로젝트/전사 컬럼 그룹 대비
- [ ] **F10** `candidate/ScopeSplitCell.jsx` / `GapSignalBadge.jsx` / `AssignActionCell.jsx` 신규
- [ ] **F11** `AssignmentPage.jsx` — 2분할 셸, 선택 상태, `ResourceProfileDrawer` 연결(**`canRead('RESOURCE_MANAGEMENT')` 게이팅**), `useJiraProjectPermissions` 사전 가드, 확인 모달
- [ ] **F12** `constants/tabs.js` — `projectUser.children`에 `projectAssignment` 추가 (§4.7)
- [ ] **F13** `cd static/ui && npm run build` — prebuild merge 포함 통과 확인

### 8.3 검증 포인트 (integration-verifier 전달)

1. `content` 래핑 일치 — 3 resolver 모두 `{content:{...}}`, 프론트는 `res.content` 소비
2. `candidates[].company` **null 가능** — 프론트 옵셔널 체이닝 전수 확인
3. `project.util` **null 가능** — `'-'` 폴백
4. `assignWorkItem` payload에 `projectId` 포함 여부 (없으면 scope 검증이 무력화됨)
5. **`invalidateQueries(assignmentKeys.*)` 호출이 코드베이스에 0건**인지 grep
6. **공통 페처 무수정** — `getProjectIssuesByFilter` / `getProjectGanttIssues` / `getBulkIssuesByProject` / `getProjectIssuesByUser` / `ResourceLoadFetcher.js` diff 없음
7. `PERMISSION_MAP` 키 3개 ↔ `guardedDefine` 등록 3개 대조(계약 테스트)
8. 균등분할 상수 일치 — `aggregateProjectLoad`의 `participantCount` 공식이 `ResourceLoadFetcher.computeShare`와 동일한지
9. i18n — `assignment.*` 사용 키 전부가 kr/en 양쪽에 존재하는지, merge 산출물에 반영됐는지
10. `fieldsByKeys` — 신규 백엔드 코드가 앱 커스텀필드를 `fields`로 요청하지 않는지(요청한다면 `fieldsByKeys:true` 필수)

---

## 9. 가정 및 한계 (명시)

1. **프로젝트 내 가동률은 실시간이 아니다** — 일 배치 스냅샷(§5-1-C). UI에 집계 시각을 노출한다.
2. **전사 부하의 Done은 최근 26주만** 집계된다(`LOAD_DONE_WINDOW`). 프로젝트 패스도 동일 창이라 두 스코프의 비교 기준은 일치한다.
3. **캐시 패치는 프로젝트 스코프만 갱신**한다. 전사 스코프(util/신호)는 배치 산출물이라 배정 직후 값이 갱신되지 않으며, 다음 배치/재조회에서 정합된다.
4. **미배정 이슈는 어떤 계정에도 계상되지 않는다** — 큐에만 나타난다.
5. **Jira 권한이 최종 판정자다.** 앱 권한(`PROJECT` write)이 있어도 Jira `ASSIGN_ISSUES`가 없으면 서버가 4xx를 전파한다.
6. **배정 임계 4종은 1차에서 항상 기본값**이다(설정 UI/manifest 미등재). 읽기 경로만 선반영.
7. **동시 편집 충돌은 처리하지 않는다** — 다른 사용자가 같은 이슈를 동시에 바꾸면 마지막 write가 이긴다. `previous`가 write 직전 서버 값이라 delta 자체는 어긋나지 않는다.
