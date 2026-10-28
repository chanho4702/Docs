# 작업 배정 (Work Assignment) — 백엔드 구현 리포트

- **일자**: 2026-07-22
- **브랜치**: RFC-160
- **설계서**: `_workspace/work-assignment/01_architect_design.md` (§2 경계면 계약 기준)
- **테스트**: `npm test` → **16 suites / 301 tests 전부 통과** (신규 `WorkAssignmentRules.test.js` 56건 포함)

> 이 문서의 §1 응답 shape은 **실제 구현 코드에서 그대로 옮긴 값**이다. 프론트는 이 문서만 보고 소비 경로를 확정하면 된다.

---

## 1. 구현한 resolver 함수 + 실제 응답 shape

세 함수 모두 `guardedDefine` → `responseWrapper` 를 통과한다.
프론트가 `invoke()`로 최종 수신하는 객체는 **`{ success: true, content: {...} }`** (실패 시 `{ success:false, error:{ name, code, message, cause } }`).

| # | resolver | 입력 payload | 권한 | 파일 |
|---|---|---|---|---|
| 1 | `getWorkAssignmentBoard` | `{ projectId }` | `R('PROJECT','detail')` | `WorkAssignmentService.js` |
| 2 | `getWorkAssignmentPool` | `{ projectId }` | `R('RESOURCE_MANAGEMENT','detail')` | `WorkAssignmentService.js` |
| 3 | `assignWorkItem` | `{ projectId, issueId?, issueKey?, assigneeAccountId?, coworkerAccountIds? }` | `W('PROJECT','inherited')` | `WorkAssignmentWriter.js` |

### 1.1 `getWorkAssignmentBoard` → `res.content`

```js
{
  projectId: string,                 // 요청 그대로(uuid)
  projectName: string|null,          // 조회 실패 시 null
  generatedAt: string,               // ISO

  meta: {
    companyScopeVisible: boolean,    // RESOURCE_MANAGEMENT read 보유(admin 은 항상 true)
    poolAvailable: boolean,          // === companyScopeVisible
    issueScanned: number,            // 프로젝트 패스로 읽은 이슈 수 (Jira 실패 시 0)
    issueTruncated: boolean,         // MAX_PROJECT_ISSUES(3000) 초과로 중단
    queueTruncated: boolean,         // MAX_QUEUE_ITEMS(300) 초과로 잘림
    snapshotAggregatedAt: string|null,  // portfolio_project_snapshot.aggregated_at (ISO 또는 드라이버 문자열)
    rollupAggregatedAt: string|null,    // KVS rollup lastAggregatedAt
    thresholds: {                    // 1차에서는 항상 이 기본값
      dueSoonDays: 7,
      externalLoadRatio: 0.4,
      projectFocusRatio: 0.8,
      multiProjectMin: 3
    },
    bands: { under: number, over: number, red: number } | null,  // settings 유래(기본 0.7/1.1/1.3)
    maxProjectIssues: 3000,          // ★ 계약 추가(additive) — truncated 안내 문구용
    maxQueueItems: 300               // ★ 계약 추가(additive)
  },

  requiredSkills: [ { id: string, name: string, category: string } ],

  queue: [ QueueItem ],              // ★ 7.1 변경 — done 제외한 "전체 열린 이슈"(flags 무관), 최대 300
  projectLoad: [ ProjectLoadRow ],   // 프로젝트 내 참여자 전원(멤버 여부 무관) — pool 조인용
  candidates: [ Candidate ]          // project_users 기반, 서버 랭킹 적용
}
```

**`QueueItem`** (키 순서까지 실제 코드 그대로)

```js
{
  issueId: string|null,              // Jira 숫자 id 를 String() 한 값
  issueKey: string|null,             // "DWEB-12"
  summary: string,                   // 없으면 ''
  issueTypeName: string|null,
  issueTypeIconUrl: string|null,
  projectKey: string|null,           // ★ 7.2 추가 — Jira 프로젝트 키 "DWEB" (프론트 필터용)
  projectName: string|null,          // ★ 7.2 추가 — Jira 프로젝트명
  projectAvatarUrl: string|null,     // ★ 7.5 추가 — Jira 프로젝트 아이콘(16x16), 없으면 null
  statusName: string|null,
  statusCategoryKey: 'new'|'indeterminate'|'done'|null,
  dueDate: string|null,              // 'yyyy-MM-dd'
  originalEstimateSeconds: number,   // 없으면 0
  remainingEstimateSeconds: number,  // 없으면 0 (분할 전 이슈 원본)
  timeSpentSeconds: number,          // 없으면 0 (분할 전 이슈 원본)
  assignee: UserRef|null,
  coworkers: [ UserRef ],            // 항상 배열(빈 배열 가능)
  participantCount: number,          // max(1, (assignee?1:0) + coworkers.length)
  flags: [ 'UNASSIGNED'|'OVERDUE'|'DUE_SOON'|'NO_ESTIMATE' ],  // ★ 7.1 변경 — 빈 배열 [] 가능(정상 이슈). 전체 열린 이슈가 큐에 옴
  dDay: number|null                  // dueDate - today (일). 음수=지연. dueDate 없으면 null
}

UserRef = { accountId: string, displayName: string, avatarUrls: object|null }
```

**`ProjectLoadRow`** (균등분할 후 1인 기대 몫)

```js
{
  accountId: string,
  assignedCount: number,       // 관여 건수(분할 안 함) = todo+inProgress+done
  todoCount: number,
  inProgressCount: number,
  doneCount: number,           // 최근 26주(updated) 한정
  spentSeconds: number,        // perHead 합 (소수 가능)
  remainingSeconds: number,    // perHead 합 (소수 가능)
  completionRate: number|null  // spent/(spent+remaining), 분모 0 → null
}
```

**`Candidate`**

```js
{
  accountId: string,
  displayName: string,         // 미해석 시 accountId 폴백(항상 string)
  avatarUrls: object|null,
  roleName: string|null,
  levelName: string|null,
  isMember: boolean,           // board=true / pool=false

  coverage: number,            // 0~1 (요구스킬 0건이면 0)
  score: number,               // Math.round(coverage*100)
  matchedCount: number,
  requiredCount: number,
  matchedSkills: [ { id: string, name: string } ],
  missingSkills: [ { id: string, name: string } ],

  project: {
    assignedCount: number,
    todoCount: number,
    inProgressCount: number,
    doneCount: number,
    spentSeconds: number,
    remainingSeconds: number,
    completionRate: number|null,
    util: number|null,               // 일 배치 스냅샷 members_json[].utilization — 대개 null
    utilSource: 'snapshot'|null      // util 이 null 이면 항상 null
  },

  company: {                         // ★ companyScopeVisible=false 이면 이 객체 전체가 null
    util: number|null,               // KVS rollup utilizationPeople
    utilBand: 'idle'|'normal'|'over'|'red'|'unknown',
    projectCount: number,
    todoCount: number,
    inProgressCount: number,
    doneCount: number,
    spentSeconds: number,
    remainingSeconds: number,
    completionRate: number|null
  } | null,

  loadSplitRatio: number|null,       // project.remaining / company.remaining (company null 또는 분모 0 → null)
  signals: [ 'EXTERNAL_OVERLOAD'|'EXTERNAL_OVERLOAD_ESTIMATED'|'MULTI_PROJECT'|'PROJECT_FOCUSED'|'NO_CAPACITY_DATA' ]
                                     // company null 이면 항상 []
}
```

### 1.2 `getWorkAssignmentPool` → `res.content`

```js
{
  projectId: string,
  generatedAt: string,               // ISO
  candidates: [ Candidate ],         // isMember:false 만. project.* 는 전부 0 / null
                                     // company 는 항상 채워짐(이 resolver 자체가 RESOURCE_MANAGEMENT read 요구)
  truncated: boolean,                // ★ 계약 추가(additive) — 300명 상한으로 잘렸는지
  totalPoolSize: number,             // ★ 계약 추가(additive) — 절단 전 비멤버 총 수
  maxPoolAccounts: 300               // ★ 계약 추가(additive)
}
```

- `candidates[].project` 는 **전부 0/null** 로 내려간다(프로젝트 이슈 패스를 재실행하지 않음).
  프론트가 `board.projectLoad` 를 accountId 로 조인해 `project.*` 만 덮어쓴다.
- `signals` / `loadSplitRatio` 는 **project.remainingSeconds=0 기준의 서버 값**이다. 조인 후 프론트에서 재계산하지 않는다(규칙 이원화 방지).

### 1.3 `assignWorkItem` → `res.content`

```js
{
  issueId: string|null,
  issueKey: string|null,
  applied: { assignee: boolean, coworkers: boolean },   // 실제로 write 를 시도한 항목
  item: QueueItem,          // §1.1 과 완전히 동일한 shape (write 후 단건 GET 으로 확정, flags/dDay 재계산 포함)
  previous: {               // write 직전 서버 실측값 — 프론트 delta 계산 기준점
    assigneeAccountId: string|null,
    coworkerAccountIds: [ string ],
    participantCount: number,
    remainingEstimateSeconds: number,
    spentSeconds: number,                              // ← 이름 주의: item 쪽은 timeSpentSeconds
    statusCategoryKey: 'new'|'indeterminate'|'done'|null
  }
}
```

> ⚠️ `item.flags` 가 빈 배열일 수 있다(배정 완료로 큐 이탈). `patchAssignmentCache` 는 이 경우 큐에서 제거한다.
> ⚠️ write 후 재조회는 **단건 `GET /rest/api/3/issue/{k}`** 만 사용했다. `search/jql` 재조회는 코드에 없다(인덱스 지연).

---

## 2. 신규 / 수정 파일 목록

### 신규
| 파일 | 역할 |
|---|---|
| `src/resolver/workAssignment/WorkAssignmentController.js` | `registerWorkAssignmentController(resolver)` — `guardedDefine` 3건 |
| `src/resolver/workAssignment/WorkAssignmentService.js` | board / pool 조립, 전사 스코프 부분 마스킹 |
| `src/resolver/workAssignment/WorkAssignmentIssueFetcher.js` | **프로젝트 전용 이슈 패스(격리 모듈)** + `aggregateProjectLoad` / `normalizeIssue` / `toQueueItem` / `resolveUserRefMap` |
| `src/resolver/workAssignment/WorkAssignmentWriter.js` | `assignWorkItemService` — assignee PUT + coworker merge + 단건 GET 재조회 |
| `src/resolver/workAssignment/WorkAssignmentRules.js` | **순수함수**(IO 0) — 임계/flags/신호/랭킹/정렬/균등분할 |
| `src/resolver/workAssignment/__test__/WorkAssignmentRules.test.js` | jest 56건 |

### 수정 (전부 추가만 — 기존 로직 무변경)
| 파일 | 변경 |
|---|---|
| `src/index.js` | import + `registerWorkAssignmentController(resolver)` |
| `src/permission/PermissionMap.js` | 3키 추가 (`getWorkAssignmentBoard` / `getWorkAssignmentPool` / `assignWorkItem`) |
| `src/utils/errors/ErrorCodes.js` | `ASSIGNMENT_*` 4개 추가 (마지막 항목에 콤마 보정) |
| `src/api/jira/issue/IssueApi.js` | `assignIssueApi` / `getIssueForAssignmentApi` **추가 export만** |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `SELECT_BY_PROJECT_ID` 추가 |
| `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js` | `getSnapshotByProjectId` 추가(실패 시 null 폴백) |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `buildPeopleContext` 앞에 `export` 키워드만 추가 (시그니처·반환·호출부 무변경) |
| `test/permission/permissionMap.contract.test.js` | 신규 컨트롤러 import + 등록 (안 하면 orphan 매핑으로 계약 테스트 실패) |
| `jest.config.js` | `testPathIgnorePatterns` 에 `<rootDir>/.claude/` 추가 (§3 참조) |

### 무수정 확인 (제약 준수)
`ResourceLoadFetcher.js` / `IssuePropertyApi.js` / `ProjectUsersService.js` / `getProjectIssuesByFilter` / `getProjectGanttIssues` / `getBulkIssuesByProject` / `getProjectIssuesByUser` — **한 줄도 고치지 않았고, import 로만 재사용**했다.
manifest / DDL / migrate 변경 **없음**.

---

## 3. `npm test` 결과

```
Test Suites: 16 passed, 16 total
Tests:       301 passed, 301 total
```

- 신규 `WorkAssignmentRules.test.js` = **56 passed**
  (플래그 4종 + 경계값, 신호 5종 + 임계 경계 0.4·0.8·3·2.5배, `company:null` 마스킹, 랭킹 tiebreaker 6단계, 큐 정렬, 균등분할 공식, 날짜 유틸)
- `test/permission/permissionMap.contract.test.js` **통과** → 등록 3건 ↔ 매핑 3키 일치 확인됨.

### ⚠️ 기존 테스트 실패 1건 — 원인과 조치(신규 코드 무관)
구현 전부터 `npm test` 는 **22개 suite 가 실패**하고 있었다. 전부 `.claude/worktrees/RFC-168/` 아래 파일이다.
- 원인: 에이전트 작업용 git worktree(`.gitignore` 의 `/.claude/` 대상)가 **자체 `package.json` 을 가져** 루트 `.babelrc` 가 적용되지 않는다 → `SyntaxError: Cannot use import statement outside a module` 로 파싱 단계에서 실패.
- 신규 코드와 무관(그 디렉토리는 구 브랜치의 별도 체크아웃이며 내 diff에 포함되지 않음).
- 조치: `jest.config.js` 의 `testPathIgnorePatterns` 에 `<rootDir>/.claude/` 추가. 이후 16/16 통과.
  (실제 소스는 루트 `src/` 사본이 이미 동일 테스트를 돌리고 있어 커버리지 손실 없음 — 같은 파일이 2번 돌던 것.)

---

## 4. 설계서와 달라진 점 (전부 additive, 계약 축소 없음)

| # | 설계 | 실제 | 이유 |
|---|---|---|---|
| 1 | `meta` 에 상한값 없음 | `meta.maxProjectIssues`, `meta.maxQueueItems` 추가 | `queue.truncated` i18n 문구(`상위 {n}건만 표시`)에 프론트가 상수를 하드코딩하지 않게 하기 위함 |
| 2 | `PoolContent = {projectId, generatedAt, candidates}` | `truncated`, `totalPoolSize`, `maxPoolAccounts` 추가 | §3.4-3 이 "초과 시 잘라내고 truncated" 라고만 하고 응답 필드를 정의하지 않았다. 잘린 사실을 프론트가 알 방법이 없어 추가 |
| 3 | 임계는 `buildPeopleContext` 의 settings 로 resolve | `getSettingDataService()` 를 **별도 병렬 호출**해 resolve | 실제 `buildPeopleContext` 는 `{people,bands,lastAggregatedAt,aggregateStatus,skillMap}` 만 반환하고 **settings 원본을 반환하지 않는다**. `ctx.settings` 로 읽으면 항상 undefined → 읽기 경로가 죽은 코드가 된다. KVS 1회 read 추가로 해결 |
| 4 | `toQueueItem` 위치 미정 | `WorkAssignmentIssueFetcher.js` 에 배치 | `normalizeIssue` 와 짝이라 같은 모듈. Service·Writer 양쪽이 import |
| 5 | 큐 정렬은 서비스 인라인 | `WorkAssignmentRules.sortQueueItems` 순수함수로 분리 | 테스트 가능성(정렬 규칙도 계약이다) |
| 6 | — | `jest.config.js` 수정 | §3 참조. 신규 기능과 무관하나 `npm test` 를 실사용 가능한 상태로 되돌리기 위해 |

**계약을 어긴 곳은 없다.** §2.1/§2.2/§2.3 의 모든 필드가 같은 이름·같은 타입으로 존재한다.

---

## 5. 프론트가 주의해야 할 점

### 5.1 null 가능 필드 (옵셔널 체이닝 필수)
| 경로 | null 발생 조건 | 권장 폴백 |
|---|---|---|
| `candidates[].company` | `meta.companyScopeVisible === false` | 전사 컬럼 자리에 `assignment.scope.companyLocked` |
| `candidates[].company.util` | rollup 미집계 계정 | `'-'` (utilBand 는 `'unknown'` 으로 채워짐) |
| `candidates[].project.util` | **대부분 null** (스냅샷 미집계 프로젝트) | `'-'` + `meta.snapshotAggregatedAt` 툴팁 |
| `candidates[].project.utilSource` | util 이 null 이면 항상 null | — |
| `*.completionRate` | 분모(spent+remaining) 0 | `'-'` |
| `candidates[].loadSplitRatio` | company null 또는 전사 잔여 0 | 배지 미표기 |
| `meta.bands` | settings 조회 실패 | 프론트 기본 밴드 |
| `meta.snapshotAggregatedAt` / `meta.rollupAggregatedAt` | 집계 이력 없음 | `assignment.meta.noAggregate` |
| `queue[].issueId` / `issueKey` | Jira 응답 이상(사실상 없음) | 행 skip |
| `queue[].dDay` / `dueDate` | 기한 없음 | `assignment.queue.dday.none` |
| `content.projectName` | 프로젝트 조회 실패 | 헤더에서 생략 |

**항상 배열(절대 null 아님)**: `queue`, `projectLoad`, `candidates`, `requiredSkills`, `queue[].coworkers`, `candidates[].signals`, `matchedSkills`, `missingSkills`.
**항상 string**: `candidates[].displayName`, `queue[].coworkers[].displayName` (해석 실패 시 accountId 로 채움).

### 5.2 `assignWorkItem` 호출 규약 (중요)
1. **`projectId` 를 반드시 payload 에 넣어라.** 빠지면 `ASSIGNMENT_PROJECT_ID_REQUIRED` 로 즉시 거부되고, 권한 가드의 프로젝트 스코프 검증도 무력화된다.
2. `issueId` 또는 `issueKey` 중 최소 1개 필요. **둘 다 주는 것을 권장**한다 — assignee write 는 `issueKey ?? issueId`, coworker 프로퍼티 write 는 `issueId ?? issueKey` 를 쓴다(기존 `updateIssueCoworkersService` 와 동일하게 숫자 id 선호).
3. **`undefined` 와 `null` 은 다르다.**
   - `assigneeAccountId` 를 **아예 보내지 않으면**(= `undefined`) assignee 미변경.
   - `assigneeAccountId: null` 은 **"담당 해제"** 라는 유효 입력이다.
   - `@forge/bridge` invoke 는 JSON 직렬화라 `undefined` 키는 자동으로 사라진다 → "미변경" 의도라면 키 자체를 넣지 마라. (`{ assigneeAccountId: undefined }` 를 넣어도 결과는 같지만 명시적으로 빼는 편이 안전하다.)
4. `coworkerAccountIds` 는 **전체 교체(set 시맨틱)** 다. "협업자 추가" 는 프론트가 `[...현재 coworkers, 신규]` 를 만들어 보내야 한다. 배열이 아니면 `ASSIGNMENT_INVALID_COWORKERS`.
5. 둘 다 `undefined` 면 `ASSIGNMENT_NO_CHANGE`.
6. **캐시 무효화 금지.** `invalidateQueries(assignmentKeys.*)` 를 쓰면 `search/jql` 이 옛 값을 되돌려 화면이 롤백된다. 응답의 `item` + `previous` 로 `setQueryData` 패치만 할 것. `refetchOnWindowFocus:false` 필수.

### 5.3 에러 코드 목록 (`res.error.code`)
| 코드 | 발생 지점 | 프론트 처리 |
|---|---|---|
| `ASSIGNMENT_PROJECT_ID_REQUIRED` | 3 resolver 공통 | 개발 오류 — 토스트 |
| `ASSIGNMENT_ISSUE_REQUIRED` | `assignWorkItem` (id/key 없음, 형식 위반, 이슈 미존재) | `toast.assign.error` |
| `ASSIGNMENT_NO_CHANGE` | `assignWorkItem` (변경 없음) | 조용히 무시 가능 |
| `ASSIGNMENT_INVALID_COWORKERS` | `assignWorkItem` (배열 아님) | 개발 오류 |
| `PERMISSION_DENIED` | 가드 (권한 미충족) | 버튼 비활성 / 안내 |
| `PERMISSION_PROJECT_SCOPE_DENIED` | 가드 (비소속 프로젝트) | 안내 |
| `PERMISSION_UNMAPPED` | (발생 불가 — 매핑 완료) | — |
| Jira 4xx/5xx | `ForgeAPIError` (name=`ForgeAPIError`, code=HTTP status 등) | `toast.jiraPermission.assign` (403 시). Jira `ASSIGN_ISSUES` 권한 부족이 대표 케이스 |
| `LICENSE_INACTIVE` | responseWrapper 공통 | 기존 처리 |

### 5.4 기타
- **부분 성공 정책**: Jira 프로젝트 패스가 실패해도 throw 하지 않는다 → `queue:[]`, `projectLoad:[]`, `meta.issueScanned:0` 으로 내려온다. 프론트는 "에러"가 아니라 "빈 큐"로 표시해야 한다. `meta.issueScanned === 0 && candidates.length > 0` 이면 Jira 조회 실패를 의심할 수 있다.
- **전사 배치 실패** 시 `company.*` 카운트가 0 이 된다(company 객체 자체는 존재). `company === null` 과 구분할 것.
- `spentSeconds` / `remainingSeconds` 는 균등분할 결과라 **소수**다. MD 환산 시 반올림 필요.
- `previous.spentSeconds` ↔ `item.timeSpentSeconds` — **이름이 다르다**(설계서 그대로). delta 계산 시 혼동 주의.
- `pool` 은 `board.meta.poolAvailable === true` 일 때만 호출하라. false 인데 호출하면 `PERMISSION_DENIED`.
- 후보 로우 클릭 드로어는 `canRead('RESOURCE_MANAGEMENT')` 로 프론트에서 게이팅해야 한다(`getResourceProfile` resolver 가 그 권한을 요구하므로, 게이팅 없으면 빈 드로어가 열린다).

---

## 6. 성능·안전 제약 준수 확인

| 제약 | 준수 방식 |
|---|---|
| 공통 이슈 페처 무수정 | `WorkAssignmentIssueFetcher.js` 신규 격리. 기존 페처 파일 diff 0 |
| `ResourceLoadFetcher` 재사용은 import만 | `fetchAssignedLoadByAccounts` 만 import (파일 무변경) |
| write 후 `search/jql` 금지 | Writer 는 `getIssueForAssignmentApi`(단건 GET)만 사용 |
| assignee write = `as:'user'` | `assignIssueApi(..., 'user')`. coworker 프로퍼티만 `mergeIssueProperty` 기본값(`app`) 유지 |
| 앱 커스텀필드를 `fields` 로 요청 금지 | 프로젝트 패스 `fields` = `summary,status,statusCategory,duedate,timetracking,assignee,issuetype` — `moves_RMS_projectId` 없음. 스코프는 JQL 술어. `fieldsByKeys` 불필요 |
| 균등분할 공식 일치 | `computeParticipantCount(hasAssignee, coworkers) = max(1,(assignee?1:0)+coworkers.length)` — `ResourceLoadFetcher.computeShare` 와 동일(테스트로 고정) |
| Done 창 일치 | 프로젝트 패스 `DONE_WINDOW='-26w'` (원본 `LOAD_DONE_WINDOW` 와 동일 값, 자체 상수로 복제) |
| N+1 없음 | coworker/미해석 멤버 user resolve = 페이지 루프 밖 **1회 bulk** |
| 병렬화 | board = `Promise.all` 8종(Jira 프로젝트 패스 ‖ 전사 배치 ‖ SQL/KVS) |
| 상한 방어 | 이슈 3000 / 큐 300 / 풀 300, 각각 truncated 플래그 노출 |
| KVS 캐시 | 도입 안 함(배정 판단은 실시간성이 본질) |

---

## 7. E2E 피드백 반영 (2026-07-23) — 응답 shape 변경분

E2E 사용자 피드백 2건 반영. **둘 다 additive이며 기존 필드 제거·이름변경 없음.**

### 7.1 큐가 모든 열린 이슈를 포함하도록 변경 (필터 제거)

- **변경 전**: `queue` 는 `flags.length > 0` 인 이슈만 포함 → 담당자 있고 여유 있고 추정 입력된 정상 이슈가 큐에서 누락(재배정 불가).
- **변경 후**: `WorkAssignmentService.js` 큐 조립에서 **`flags.length > 0` 필터를 제거**했다. 이제 `queue` = **done 제외한 전체 열린 이슈**(최대 300).
- **`QueueItem.flags` 가 `[]`(빈 배열)일 수 있다** — 이것이 이제 유효 응답이다. `sortQueueItems` 가 flags 없는 이슈를 **뒤로**(OVERDUE→DUE_SOON→UNASSIGNED→나머지) 배치한다. 정렬 규칙 자체는 무변경.
- `queueTruncated` / `MAX_QUEUE_ITEMS(300)` 판정은 필터 제거 후 개수 기준으로 자연히 맞는다(확인 완료).
- **부하 집계(`aggregateProjectLoad`)·후보(`candidates`)·`projectLoad` 는 무영향** — 이슈 포함 범위(JQL)는 그대로이고 큐 조립 단계만 바뀌었다.

> ⚠️ **프론트 주의**: 클라이언트 세그먼트 필터(전체/미배정/마감임박/지연)는 `flags` 기반으로 걸면 된다. "전체" 탭은 이제 flags 유무와 무관하게 모든 열린 이슈를 보여준다. `flags:[]` 인 행도 렌더링해야 한다(배지 없이).

### 7.2 QueueItem 에 Jira 프로젝트 정보 추가 (프론트 프로젝트 필터용)

1 RMS 프로젝트에 여러 Jira 프로젝트 이슈가 섞이는 구조 대응. **`QueueItem` 에 2개 필드 additive 추가**:

```js
QueueItem = {
  // ... 기존 필드 전부 동일 ...
  projectKey: string|null,     // ★ 신규 — Jira 프로젝트 키 (예: "DWEB"). project 필드 없으면 null
  projectName: string|null,    // ★ 신규 — Jira 프로젝트명 (예: "D-Web"). 없으면 null
  // ... assignee, coworkers, participantCount, flags, dDay ...
}
```

- 두 필드는 `assignee`/`coworkers` 등 **기존 필드 사이가 아니라 `statusName` 앞**에 위치하지만, 프론트는 키로 접근하므로 순서 무관.
- **`assignWorkItem` 의 `AssignResult.item` 도 동일하게 `projectKey`/`projectName` 을 포함**한다. 단건 GET(`getIssueForAssignmentApi`) 의 `fields` 에도 `project` 를 추가해 두 경로(board 패스 / write 재조회)의 `toQueueItem` 결과 shape 을 일치시켰다 → **캐시 패치 시 shape 불일치 없음**.
- `project` 는 Jira **네이티브 필드**(앱 커스텀필드 아님)라 `fieldsByKeys` 무관 — 제약 위반 아님. `moves_RMS_projectId` 는 여전히 JQL 술어로만 스코프 확정.

### 7.3 변경 파일
| 파일 | 변경 |
|---|---|
| `src/resolver/workAssignment/WorkAssignmentService.js` | 큐 조립 `flags.length>0` 필터 제거 |
| `src/resolver/workAssignment/WorkAssignmentIssueFetcher.js` | 프로젝트 패스 `fields` 에 `project` 추가 / `normalizeIssue`·`toQueueItem` 에 `projectKey`·`projectName` 추가 |
| `src/api/jira/issue/IssueApi.js` | `getIssueForAssignmentApi` 의 `fields` 에 `project` 추가 |
| `__test__/WorkAssignmentRules.test.js` | flags 빈 이슈 포함+정렬 케이스 2건 추가 |

### 7.4 테스트
```
Test Suites: 16 passed, 16 total
Tests:       303 passed, 303 total   (workAssignment 58건, +2)
```
신규 고정 케이스: "flags 빈 이슈도 큐에 포함되며 flags 있는 이슈보다 뒤로 정렬", "flags 빈 이슈끼리 dueDate asc → issueKey asc".

### 7.5 QueueItem 에 프로젝트 아이콘 URL 추가 (2026-07-23, additive)

프론트 큐 프로젝트 필터에 프로젝트 아이콘 표시 요청. **`QueueItem` 에 1개 필드 additive 추가**:

```js
QueueItem = {
  // ... projectKey, projectName 다음 ...
  projectAvatarUrl: string|null,   // ★ 신규 — Jira 프로젝트 아이콘 URL(16x16). project.avatarUrls 없으면 null
}
```

- `normalizeIssue` / `toQueueItem` 에서 `f.project?.avatarUrls?.['16x16'] ?? null` 로 추출 (간트 `GanttMapper.js:108` 과 동일 패턴).
- 프로젝트 패스 fields 에는 §7.2 에서 이미 `project` 가 추가돼 있어 `avatarUrls` 가 응답에 실려온다 — **fields 추가 변경 없음**.
- **`assignWorkItem` 의 `AssignResult.item` 도 자동 포함**: write 재조회(`getIssueForAssignmentApi`, fields 에 `project` 有)가 같은 `normalizeIssue`/`toQueueItem` 을 거치므로 board 패스와 shape 일치. 단건 GET 의 `project` 필드도 `avatarUrls` 를 기본 포함(검증 완료).
- 변경 파일: `WorkAssignmentIssueFetcher.js`(normalize + toQueueItem 2줄). 기존 필드·테스트 무변경.
- `npm test` → 16 suites / **305 tests 통과**(회귀 없음).
