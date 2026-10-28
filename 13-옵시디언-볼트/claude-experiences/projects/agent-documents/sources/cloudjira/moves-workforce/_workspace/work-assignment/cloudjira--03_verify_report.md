# 작업 배정 (Work Assignment) — 통합 정합성 검증 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **검증 기준**: `01_architect_design.md` §2 경계면 계약 (단일 진실 원천)
- **대조 대상**: `02_backend_report.md` / `02_frontend_report.md` **주장** vs **실제 소스 코드**
- **판정 원칙**: 리포트 주장과 코드가 다르면 **코드를 우선**하고 그 사실을 명시했다.

## 총평

| 구분 | 건수 |
|---|---|
| **통과** | 31 |
| **실패 (수정 필요)** | **0** |
| **경고 / 개선 권고** (동작에는 문제 없음) | 6 |
| **미검증 (E2E — forge deploy 후 확인)** | 7 |

**경계면 불일치 0건.** 백엔드가 실제로 반환하는 필드명·중첩 구조와 프론트의 `res.content.*` 접근 경로를
필드 단위로 전수 대조한 결과 불일치가 없었다. 두 리포트의 주장은 **전부 코드로 재확인되었고 거짓 주장은 없었다**
(테스트 수치 301 / 126 / 56 / 25까지 직접 재현 일치).

---

## A. 경계면 교차 비교 (생산자 ↔ 소비자 동시 읽기)

### A-0. 래핑 계약 — **통과**

| 생산자 | 소비자 |
|---|---|
| `WorkAssignmentService.js:310` `return { content: {...} }` → `responseWrapper`(`ResponseWrapper.js:18` `{success:true, ...result}`) | `useWorkAssignmentBoard.js:29-33` `if (!res?.success \|\| !res?.content) throw` → `return res.content` |
| `WorkAssignmentService.js:395` 동일 | `useWorkAssignmentPool.js:23-27` 동일 |
| `WorkAssignmentWriter.js:114` 동일 | `useAssignWorkItem.js:36-42` 동일 |

- 3개 모두 `content` 래핑(`data` 아님) ✅ (설계 §2.4-1)
- 3개 모두 프론트가 `res.success === false` 분기를 처리 ✅
- 실패 시 `res.error.code`를 `Error.code`로 승격(`useAssignWorkItem.js:39`) → `AssignmentPage.jsx:136`에서 소비 ✅

### A-1. `getWorkAssignmentBoard` → `BoardContent` 필드 단위 대조 — **통과**

| 필드 | 생산자 (파일:라인) | 소비자 (파일:라인) | 판정 |
|---|---|---|---|
| `meta.companyScopeVisible` | `WorkAssignmentService.js:241,316` (`isSatisfied(principal, RESOURCE_MANAGEMENT:read)`) | `AssignmentCandidateTable.jsx:40`, `CandidatePanel.jsx:67`, `AssignmentPage.jsx:183` | ✅ |
| `meta.poolAvailable` | `:317` (`= companyScopeVisible`) | `AssignmentPage.jsx:64`(enabled), `CandidatePanel.jsx:31`(토글 노출) | ✅ |
| `meta.issueScanned` / `issueTruncated` | `:318-319` | `WorkQueuePanel.jsx:57` | ✅ |
| `meta.queueTruncated` | `:320` | `WorkQueuePanel.jsx:50` | ✅ |
| `meta.snapshotAggregatedAt` | `:321` `toISO(snapshotRow?.aggregated_at)` | `AssignmentPage.jsx:182`, `ScopeSplitCell.jsx:46` | ✅ (포맷 리스크는 §미검증-4) |
| `meta.rollupAggregatedAt` | `:322` `ctx?.lastAggregatedAt` | `AssignmentPage.jsx:184` | ✅ |
| `meta.thresholds.{externalLoadRatio,projectFocusRatio}` | `:323` ← `WorkAssignmentRules.js:20-25` | `GapSignalBadge.jsx:29,31` | ✅ 이름 일치 |
| **`meta.maxProjectIssues`** (additive) | `:325` = `MAX_PROJECT_ISSUES`(3000) | `WorkQueuePanel.jsx:60` | ✅ **이름 일치** |
| **`meta.maxQueueItems`** (additive) | `:326` = `MAX_QUEUE_ITEMS`(300) | `WorkQueuePanel.jsx:53` | ✅ **이름 일치** |
| `meta.bands` | `:324` | 미사용(프론트 리포트에 명시) | ✅ 계약 위반 아님 |
| `requiredSkills[]` `{id,name,category}` | `:306-308` ← `ctx.skillMap`(`ResourceManagementService.js:73`이 `{id,name,category}` Map 생성) | 미사용 | ✅ 타입 일치 확인 |
| `queue[]` 전 필드 | `WorkAssignmentIssueFetcher.js:135-161` `toQueueItem` | `WorkQueueItem.jsx:42,79,83,100,105,110,117,126,131,150` | ✅ |
| `queue[].dDay` | `WorkAssignmentRules.js:41-47` | `WorkQueueItem.jsx:25-30` (`0` → `dday.today` 별도 처리) | ✅ |
| `queue[].assignee` (nullable) | `:151` `n.assigneeRef`(없으면 null) | `WorkQueueItem.jsx:126` `item?.assignee ?`, `AssignActionCell.jsx:29` `!!selectedItem?.assignee &&` | ✅ **옵셔널 체이닝** |
| `projectLoad[]` 7수치 | `WorkAssignmentIssueFetcher.js:205-251` | `poolJoin.js:14-22` `LOAD_FIELDS` **7개 전부 동일 이름**, `patchAssignmentCache.js:151-174` | ✅ |
| `candidates[].{score,matchedCount,requiredCount}` | `WorkAssignmentService.js:200-203` | `AssignmentCandidateTable.jsx:103,106` | ✅ |
| `candidates[].{matchedSkills,missingSkills}` `{id,name}` | `:204-205` | `AssignmentCandidateTable.jsx:145-150` (`s.id`,`s.name`) | ✅ |
| `candidates[].project.util` (**대부분 null**) | `:170-171` | `ScopeSplitCell.jsx:44` `scope.util == null ? '-' : ...` | ✅ **'-' 폴백 존재** |
| **`candidates[].company` (null 가능)** | `:175-187` (`companyScopeVisible` false면 `null`) | `AssignmentCandidateTable.jsx:127-129` `c.company?.utilBand` / `c.company?.projectCount ?? null`, `ScopeSplitCell.jsx:41` `if (!scope) return dash`, `GapSignalBadge.jsx:33` `company?.projectCount ?? 0` | ✅ **전 지점 옵셔널 체이닝** |
| `candidates[].signals[]` | `:209` (company null이면 `[]` — `WorkAssignmentRules.js:120`) | `AssignmentCandidateTable.jsx:136`, `GapSignalBadge.jsx:42` | ✅ 프론트 재계산 없음 |
| `candidates[].loadSplitRatio` | `:189-191` | 미사용(프론트 리포트에 명시) | ✅ |

### A-2. `getWorkAssignmentPool` → `PoolContent` — **통과**

| 필드 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| `candidates[]` (`project.*` 전부 0/null) | `WorkAssignmentService.js:381-393` (`projectLoad:null, projectUtil:null`) | `useWorkAssignmentPool.js:33-36` → `poolJoin.js:38-53` board.projectLoad 조인 | ✅ |
| **`truncated`** (additive) | `:401` | `useWorkAssignmentPool.js:38`, `CandidatePanel.jsx:76` | ✅ **이름 일치** |
| **`totalPoolSize`** (additive) | `:402` | `useWorkAssignmentPool.js:39`, `CandidatePanel.jsx:81` | ✅ **이름 일치** |
| **`maxPoolAccounts`** (additive) | `:403` = 300 | `useWorkAssignmentPool.js:40`, `CandidatePanel.jsx:80` | ✅ **이름 일치** |

- 절단(`MAX_POOL_ACCOUNTS`)이 **Jira 배치 호출 전**에 적용됨(`:371-377`) → 상한 방어가 실제로 비용을 줄인다 ✅
- `getWorkAssignmentPool`은 프로젝트 이슈 패스를 실행하지 않음 ✅ (설계 §2.2 준수 — `fetchProjectIssuePass` 호출 0건)

### A-3. `assignWorkItem` → `AssignResult` — **통과 (핵심 항목)**

**`previous.spentSeconds` ↔ `item.timeSpentSeconds` 이름 차이 — 프론트가 정확히 구분해 읽는다.**

| 생산자 | 소비자 |
|---|---|
| `WorkAssignmentWriter.js:27-34` `toPrevious()` → `spentSeconds: n.timeSpentSeconds` | `patchAssignmentCache.js:80` `prevPerSpent: num(previous.spentSeconds) / prevHeads` |
| `WorkAssignmentIssueFetcher.js:150` `item.timeSpentSeconds` | `patchAssignmentCache.js:82` `nextPerSpent: num(item.timeSpentSeconds) / nextHeads` |

두 필드를 **교차해서 읽는 실수가 없다**. `patchAssignmentCache.test.js`가 이 분리를 전용 케이스로 고정하고 있음(20건 중 포함, 실행 통과 확인).

| 필드 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| `issueId` / `issueKey` | `Writer.js:116-117` | `patchAssignmentCache.js:132-137` (둘 중 하나만 맞아도 매칭) | ✅ |
| `applied` | `:118` | 미사용(리포트에 명시) | ✅ |
| `item` (= QueueItem, flags/dDay 재계산) | `:109-112` | `patchAssignmentCache.js:140-147` (`flags.length===0` → 큐 제거) | ✅ |
| `previous.{assigneeAccountId,coworkerAccountIds}` | `:28-29` | `patchAssignmentCache.js:65-67` | ✅ |
| `previous.participantCount` | `:30` | `:72` (`Math.max(1, ...)` 재-clamp) | ✅ |
| `previous.statusCategoryKey` | `:32` | `:83`, `:106` (`STATUS_COUNT_FIELD` 매핑) | ✅ |

**payload 방향 계약 (설계 §2.4-4)**

| 규약 | 프론트 구현 | 판정 |
|---|---|---|
| `projectId` 필수 | `useAssignWorkItem.js:29` — 훅이 주입(호출부가 빠뜨릴 수 없음) | ✅ |
| `issueId`/`issueKey` 둘 다 | `:30-31` + `AssignmentPage.jsx:112` | ✅ |
| **`undefined`(미변경) ≠ `null`(해제)** | `useAssignWorkItem.js:34-35` **`'assigneeAccountId' in vars`** 로 키 존재 여부 판정 / `AssignmentPage.jsx:118` 해제 시 `null` 명시 | ✅ **정확히 구현** (서버 `Writer.js:56` `!== undefined` 와 정합) |
| `coworkerAccountIds` 전체 교체 | `AssignmentPage.jsx:121,123` (`[...new Set([...현재, 신규])]` / `filter`) | ✅ |

### A-4. resolver 이름 ↔ 등록 매핑 — **통과**

| invoke 이름 (프론트) | `guardedDefine` 등록 | `PERMISSION_MAP` | `src/index.js` |
|---|---|---|---|
| `getWorkAssignmentBoard` (`useWorkAssignmentBoard.js:27`) | `WorkAssignmentController.js:13` | `PermissionMap.js:222` `R('PROJECT','detail')` | `src/index.js:32,68` 등록됨 |
| `getWorkAssignmentPool` (`useWorkAssignmentPool.js:22`) | `:17` | `:224` `R('RESOURCE_MANAGEMENT','detail')` | 동일 |
| `assignWorkItem` (`useAssignWorkItem.js:37`) | `:21` | `:227` `W('PROJECT','inherited')` | 동일 |

- 설계 §3.7과 **완전 일치**. `test/permission/permissionMap.contract.test.js`(등록집합↔맵키집합)에 신규 컨트롤러가 등록되어 자동 검증됨 — 직접 실행 통과 확인.
- `inherited` + payload에 `projectId` 필수 → `permissionGuard.js:42-49` `enforceProjectScope`가 실제로 동작한다 ✅ (설계가 지적한 `updateIssueCoworkers`의 §10-8 한계를 이 경로에서는 해소)

### A-5. 쿼리키 팩토리 — **통과**

`static/ui/src/utils/queryKey/assignmentKeys.js` 신규 팩토리(`all`/`board`/`pool`). 인라인 배열 사용 0건.
`resourceKeys` 확장이 아닌 별도 팩토리(설계 §4.3 준수) — `/resource` 무효화와 격리됨.
예외: `hourRate` 조회는 **기존 관행 키** `['getSettingData']` 재사용(`AssignmentPage.jsx:69`) — 다른 5개 화면과 동일 캐시 공유이므로 신규 키를 만드는 것이 오히려 중복 페치가 된다. **정당한 재사용으로 판정**.

---

## B. 서비스 내부 소비자 전수 확인 (2026-07-13 회귀 사례 대응)

### B-1. `ResourceManagementService.buildPeopleContext` — **통과**

`git diff` 결과 변경은 **`export` 키워드 1개 + 주석 1줄뿐**. 시그니처·본문·반환 shape 전부 무변경.

`grep -rn "buildPeopleContext" src/` 전수:
| 호출 지점 | 소비 형태 | 영향 |
|---|---|---|
| `ResourceManagementService.js:136` | `{people,bands,lastAggregatedAt,aggregateStatus}` 구조분해 | 무영향 |
| `ResourceManagementService.js:176` | `Promise.all` 내부 | 무영향 |
| `ResourceManagementService.js:428` | `Promise.all` 내부 | 무영향 |
| `WorkAssignmentService.js:232,354` (신규) | `ctx.people / ctx.skillMap / ctx.bands / ctx.lastAggregatedAt` | 반환 필드가 실제로 전부 존재함을 `ResourceManagementService.js:115-121`에서 확인 |

→ **반환 계약을 바꾸지 않았으므로 회귀 없음.** `npm test` 16/16 통과로 재확인.

### B-2. `PortfolioSnapshotQuery` / `PortfolioSnapshotRepository` — **통과 (과거 회귀 지점, 집중 확인)**

- `PortfolioSnapshotQuery.js`: `SELECT_BY_PROJECT_ID` **키 추가만**. 기존 키(`MEMBER_ROWS`, `DELETE_BY_PROJECT_ID`, 랭킹 쿼리 등) 문자열 무변경.
- `PortfolioSnapshotRepository.js`: `getSnapshotByProjectId` **함수 추가만**(`:48-63`). 기존 export(`getAllSnapshots`, `getProjectMemberRows`, `getRollupMeta`, …) 시그니처·본문 무변경.

기존 소비자 전수(`grep -rn "PortfolioSnapshotRepository"`):
| 소비자 | 사용 함수 | 영향 |
|---|---|---|
| `PortfolioAggregator.js:26` | 기존 함수만 | 무영향 |
| `PortfolioDashboardService.js:8` | 기존 함수만 | 무영향 |
| `ProjectCostService.js:7` | `getProjectMemberRows` | 무영향 |
| `ResourceManagementService.js:20` | `getRollupMeta` | 무영향 |
| `__test__/PortfolioAggregatorAsApp.test.js:24` | `jest.mock` 전체 팩토리 목 | 신규 함수를 참조하지 않으므로 무영향 — **테스트 실행으로 확인** |

→ **PortfolioDashboard 계열 회귀 없음.** `PortfolioAggregator.test.js` / `PortfolioAggregatorAsApp.test.js` 모두 통과.

### B-3. `IssueApi.js` — **통과**

`git diff` 훅 헤더 `@@ -484,4 +484,46 @@` → **파일 말미 추가만**. 기존 함수(`getProjectIssuesByFilter`, `getProjectGanttIssues`, `getBulkIssuesByProject`, `getProjectIssuesByUser`, `getAssigneeStats`, `deleteIssueLink` …) **한 줄도 변경 없음**.
신규 함수가 쓰는 `putJiraJson` / `requestJiraJson` / `route` / `MOVES_PROPERTY_KEY`는 **이미 파일 상단에서 import 되어 있음**(`IssueApi.js:1-4`) → 누락 import 없음. 순환 참조 없음(`IssuePropertyApi.js`는 `IssueApi`를 import 하지 않음).

---

## C. 제약 준수 검증 (리포트 주장이 아니라 코드로 확인)

| # | 제약 | 검증 방법 | 결과 |
|---|---|---|---|
| **C-1** | 공통 이슈 페처 무수정 | `git status` — `ResourceLoadFetcher.js` **미변경 목록에 없음**. `getProjectIssuesByFilter`/`getProjectGanttIssues`/`getBulkIssuesByProject`/`getProjectIssuesByUser`는 전부 `IssueApi.js` 내부이며 diff는 말미 추가만(B-3) | **통과** |
| **C-2** | `invalidateQueries` 금지 | `grep -rn "invalidateQueries" static/ui/src/pages/projectDetail/assignment/` → **3건 전부 주석**(`patchAssignmentCache.js:6`, `useAssignWorkItem.js:17,50`). 실행 코드 0건. `assignmentKeys`를 assignment 디렉토리 밖에서 참조하는 코드 0건. 전역 `invalidateQueries()`(무인자)/`resetQueries`/`queryClient.clear()` 도 코드베이스 0건 | **통과** |
| **C-3** | `refetchOnWindowFocus:false` | `useWorkAssignmentBoard.js:33`, `useWorkAssignmentPool.js:30` — **둘 다 적용** | **통과** |
| **C-4** | write 후 `search/jql` 재조회 없음 | `grep "search/jql" src/resolver/workAssignment/` → `WorkAssignmentIssueFetcher.js:66`(읽기 전용 보드 패스)만. `WorkAssignmentWriter.js`의 히트는 **주석 2줄뿐**. 실제 write 전/후 조회는 `getIssueForAssignmentApi`(단건 GET, `IssueApi.js:520-527`) 2회 | **통과** |
| **C-5** | assignee write = `as:'user'` | `WorkAssignmentWriter.js:84` `assignIssueApi(target, ... , 'user')` → `IssueApi.js:499-506` `putJiraJson({as, ...})`. coworker 프로퍼티만 `mergeIssueProperty` 기본값 `app` 유지(기존 정책) | **통과** |
| **C-6** | `moves_RMS_projectId`를 `fields`에 넣지 않음 | `WorkAssignmentIssueFetcher.js:58` `fields: ['summary','status','statusCategory','duedate','timetracking','assignee','issuetype']` — **앱 커스텀필드 없음**. 스코프는 `:47` JQL 술어. `IssueApi.js:523` 단건 GET도 동일. `fieldsByKeys` 미사용이 정당함을 확인 | **통과** |
| **C-7** | 기존 공용 컴포넌트 수정 0건 | `git status` — `ResourceProfileDrawer.jsx` / `UtilBadge.jsx` / `WorkloadCell.jsx` / `AssignedIssueCell.jsx` / `CompletionBar.jsx` / `SkillTags.jsx` / `StatusBadge.jsx` / `InfoTip.jsx` / `CommonTable.jsx` / `UserAvatar.jsx` / `ConfirmModal.jsx` / `useJiraEditGuards.js` **전부 변경 목록에 없음**. 각 컴포넌트 시그니처를 직접 읽어 전달 props와 대조 → 전부 일치(`ResourceProfileDrawer:54`, `InfoTip:12`, `StatusBadge:15`, `UtilBadge:17`, `AssignedIssueCell:20`, `WorkloadCell:27`, `SkillChip:18`, `UserAvatar:12`, `CommonTable:20`, `ConfirmModal:17`) | **통과** |
| **C-8** | 권한 가드 등록 | A-4 참조. 계약 테스트 실행 통과 | **통과** |
| **C-9** | 균등분할 공식 일치 | `WorkAssignmentRules.js:92-93` `max(1,(hasAssignee?1:0)+coworkers.length)` ↔ `ResourceLoadFetcher.js:41` **동일 식**. 집계 로직(`aggregateProjectLoad` `:225-244`) ↔ `fetchAssignedLoadForChunk` `:254-279` — 참여자 Set 중복 제거·건수 미분할·초 단위만 분할까지 **동일** | **통과** |
| **C-10** | Done 창 일치 | `WorkAssignmentIssueFetcher.js:30` `DONE_WINDOW='-26w'` ↔ `ResourceLoadFetcher.js:26` `LOAD_DONE_WINDOW='-26w'` (원본 무수정, 값 복제) | **통과** |
| **C-11** | 동시성 / N+1 | 전사 배치는 원본 `p-limit(3)` 그대로 재사용. 프로젝트 패스는 **단일 순차 페이지 루프**(설계 §5-6대로 p-limit 불필요). coworker user resolve는 페이지 루프 **밖에서 1회 bulk**(`WorkAssignmentService.js:268`, `Writer.js:100`) — N+1 없음 | **통과** |
| **C-12** | 상한 방어 | 이슈 3000(`Fetcher.js:34,74`), 큐 300(`Service.js:44,257`), 풀 300(`Service.js:46,371`) — 3종 모두 truncated 플래그를 응답에 노출하고 프론트가 안내 문구로 소비 | **통과** |

---

## D. `jest.config.js` 변경 타당성 — **통과 (정당한 변경)**

`jest.config.js:11-14` `testPathIgnorePatterns`에 `<rootDir>/.claude/` 추가.

**직접 검증한 근거:**

1. `.claude/worktrees/RFC-168/`는 **RFC-168 브랜치의 별도 git worktree**이며 `.gitignore`의 `/.claude/` 대상이다(커밋 대상 아님).
2. 그 안의 **백엔드 테스트 13개 파일 전부가 루트 `src/`·`test/`에 동일 경로로 존재**한다 — 실측 대조:
   - worktree 백엔드 테스트: `CommonQuery`, `GanttFolderService`, `GanttFolderValidationService`, `GanttMapper`, `GanttValidationService`, `PortfolioAggregator`, `PortfolioAggregatorAsApp`, `CostCalculator`, `EffectiveSalary`, `recordIssueAssignedDate`, `ProgressCalculator`, `ResourceMatch`, `StorageService`, `permissionMap.contract` (14)
   - 루트: 위 14개 **전부 존재** + `MyPageService`, `WorkAssignmentRules`(신규 2개는 worktree에 없음)
   - → **worktree에만 있고 루트에 없는 백엔드 테스트는 0건. 커버리지 손실 없음.**
3. worktree의 `static/ui/**` 테스트 4개도 루트 `static/ui`에 동일 파일이 존재하며, 루트 `static/ui`는 원래부터 백엔드 jest 대상이 아니다(`testPathIgnorePatterns`의 기존 항목 `<rootDir>/static/ui/`). 즉 **worktree 경로만 잘못 스캔되고 있던 것**이 정상화됐다.
4. 제외 전에는 22개 suite가 `SyntaxError: Cannot use import statement outside a module`로 실패했다는 백엔드 리포트 주장 → worktree가 자체 `package.json`을 가져 루트 `.babelrc`가 적용되지 않는 구조임을 확인해 **주장이 사실임을 뒷받침**.

**판정: 실패 아님.** 기능 범위 밖 수정이지만 `npm test`를 실사용 가능 상태로 되돌리는 정당한 조치이며 커버리지 손실이 없다.

> ⚠️ **개선 권고 (C-경고-1)**: `testPathIgnorePatterns`는 **테스트 실행만** 막고 haste-map 스캔은 막지 않아, 아직 아래 경고가 남는다.
> ```
> jest-haste-map: duplicate manual mock found: @forge/bridge
>   * <rootDir>\static\ui\__mocks__\@forge\bridge.js
>   * <rootDir>\.claude\worktrees\RFC-168\static\ui\__mocks__\@forge\bridge.js
> ```
> **수정 방법**: `jest.config.js`에 `modulePathIgnorePatterns: ["<rootDir>/.claude/"]` 를 **추가**하면 경고까지 사라진다(테스트 결과에는 영향 없음).

---

## E. i18n — **통과**

| 항목 | 결과 |
|---|---|
| 신규 네임스페이스 | `locales/kr/assignment.json` / `locales/en/assignment.json` — **각 83키** |
| **kr / en 키 집합 동일성** | 플랫 키 83개를 정렬 후 `diff` → **완전 일치 (차이 0)** |
| **코드 사용 키 → 로케일 존재 여부** | 정적 54키 + 동적 확장 23키(`queue.flag.{4}`, `signal.label.{5}`, `signal.tip.{5}`, `confirm.{4}.title/body`=8) = **사용 77키 전수 대조 → 누락 0건** |
| 동적 키 확장 검증 | `AssignmentPage.jsx:39-44` `CONFIRM_KEY` 매핑(`addCoworker→coworker`, `removeCoworker→coworkerRemove`)이 로케일 키(`confirm.coworker.*`, `confirm.coworkerRemove.*`)와 일치 확인 |
| `projectDetail.tabs.assignment` | kr `"작업 배정"` / en `"Work Assignment"` — `constants/tabs.js:100` 에서 사용 ✅ |
| **merge 반영** | `locales/ko-KR.json` / `locales/en-US.json` 에 `assignment` 네임스페이스 **83키 반영 확인** + `projectDetail.tabs.assignment` 존재 확인 |
| ko-KR/en-US 직접 수정 여부 | `merge.js`(`locales/script/merge.js`)를 재실행해도 **추가 drift 없음** → 직접 편집 흔적 없음 ✅ |
| `locales/script/*.json`(빈 스텁)에 넣는 실수 | 없음 ✅ |
| 재사용 컴포넌트가 요구하는 기존 키 | `common.toast.title.success`/`.Fail`, `common.toast.description.error`, `resource.util.none`, `resource.band.*`, `resource.overview.*` — 전부 존재 확인 ✅ |

> ⚠️ **경고 (C-경고-2, 사소)**: **미사용 로케일 키 6개** — `tab.label`, `candidate.poolLoading`, `scope.member`, `scope.companyUtil`, `signal.none`, `action.currentAssignee`.
> 동작에는 영향 없다(사장 키). `tab.label`은 탭 라벨을 `projectDetail.tabs.assignment`로 쓰기로 해 중복이 된 것이다. 정리하거나 그대로 두어도 무방.

---

## F. 테스트 / 빌드 실행 결과 (직접 재현)

| 명령 | 결과 | 리포트 주장 | 일치 |
|---|---|---|---|
| 루트 `npx jest` | **Test Suites 16 passed / 16, Tests 301 passed / 301** | 16 / 301 | ✅ |
| 루트 (신규만) `npx jest src/resolver/workAssignment` | **56 passed / 56** | 56 | ✅ |
| `static/ui` `react-scripts test --watchAll=false` | **12 passed / 12, 126 passed / 126, Snapshots 1 passed** | 12 / 126 | ✅ |
| `static/ui` (신규만, `--testPathPattern=assignment`) | **2 suites / 25 passed** | 20 + 5 = 25 | ✅ |
| `static/ui` `npm run build` | **Compiled with warnings** — 빌드 성공, 산출물 생성 | 동일 | ✅ |

**빌드 경고 분석 (신규 코드 유래 여부 판별):**
경고는 3건 전부 `node_modules` 소스맵 결손 — `@atlaskit/analytics-next-stable-react-context/src/context.ts`, `.../src/index.ts`, `marklassian/index.ts`.
그 외 `MODULE_TYPELESS_PACKAGE_JSON`(prebuild의 `locales/script/merge.js` ESM 경고)는 기존부터 존재.
→ **신규 코드 유래 경고(미사용 변수·훅 의존성 배열 등) 0건.** 프론트 리포트 주장과 일치.

> ⚠️ **주의 (C-경고-3)**: 빌드 통과 ≠ 정상 동작. 위 A절의 경계면 대조가 실제 검증이며, 남은 런타임 리스크는 §미검증에 정리했다.

---

## 경고 / 개선 권고 (동작 문제 없음 — 실패 아님)

| # | 위치 | 내용 | 권고 |
|---|---|---|---|
| **C-경고-1** | `jest.config.js:11-14` | haste-map 중복 mock 경고 잔존 | `modulePathIgnorePatterns: ["<rootDir>/.claude/"]` 추가 |
| **C-경고-2** | `locales/kr\|en/assignment.json` | 미사용 키 6개 | 정리(선택) |
| **C-경고-3** | — | 빌드 통과가 동작 보장 아님 | E2E 체크리스트 수행 |
| **C-경고-4** | `AssignmentCandidateTable.jsx:185-197` | `canReadResource === false`일 때 `assignment.drawer.locked` 문구가 테이블 상단에 **항상** 노출된다(Tooltip 내용과 표시 텍스트가 동일해 툴팁이 무의미) | UX 판단 사항. 아이콘+툴팁 형태로 축약하거나 그대로 유지 |
| **C-경고-5** | `ScopeSplitCell.jsx:84-89` → `WorkloadCell.jsx:30-32` | `completionRate == null`(추정 0인 후보)이면 `WorkloadCell`이 **spent/remaining 자체를 렌더하지 않고 '-'만** 표시한다. 프로젝트 스코프 후보 다수가 여기 해당할 수 있다 | 재사용 컴포넌트의 기존 계약이므로 **수정하지 말 것**(회귀 위험). 필요 시 `AssignmentCandidateTable`에서 별도 텍스트를 덧붙이는 방식 권장 |
| **C-경고-6** | 커밋 위생 | 작업 트리에 **이 기능과 무관한 미커밋 변경**이 섞여 있다: `constants/tabs.js`의 작업탭 그룹 개편(`ProjectWorkPanel` 도입·간트 탭 제거·`projectDetailTabs` 시그니처에서 `canReadGantt` 제거), `ProjectDetailTabs.jsx`, `MyPage.jsx`(레이아웃 `Inline`→`div`), `GanttPage.jsx`, `PortfolioCostOverrunRank.jsx`, `pages/projectDetail/work/`(신규). **파일 mtime 대조 결과 `MyPage.jsx`(07-22 17:24)는 설계서 완성(17:27)보다 앞서므로 이 기능 산출물이 아니다.** 프론트 리포트가 "수정 2파일"이라 한 것은 **이 기능 범위 내에서는 사실**이다 | 커밋 시 work-assignment 변경분과 선행 작업분을 **분리**할 것. `tabs.js`는 두 작업이 겹치므로 hunk 단위 분리 필요 |

---

## 미검증 (E2E — `forge deploy` 후 실화면 확인 필요)

로컬에서 증명 불가능한 항목이다. **추측으로 통과 처리하지 않았다.**

| # | 항목 | 확인 방법 | 실패 시 징후 |
|---|---|---|---|
| **E2E-1** | `assignIssueApi` PUT `/issue/{k}/assignee` (`as:'user'`) 실제 성공 | 후보 행 [담당자 지정] → Jira 이슈에서 담당자 반영 확인 | 403 → `assignment.toast.jiraPermission.assign` 토스트. Jira `ASSIGN_ISSUES` 권한 확인 |
| **E2E-2** | 배정 직후 **캐시 패치**가 화면에 즉시 반영 (인덱스 지연 회피) | 배정 → 큐 항목/후보 프로젝트 수치가 **재조회 없이** 즉시 갱신되는지 | 값이 원복되면 어딘가에서 재조회가 발생하는 것 |
| **E2E-3** | `getIssueForAssignmentApi`의 `route` 템플릿 URL 인코딩 | 단건 GET이 `fields`/`properties`를 정상 반환하는지(콤마가 `%2C`로 인코딩됨) | 기존 `getProjectIssuesByFilter`(`IssueApi.js:358-361`)가 **동일 패턴으로 운영 중**이라 위험은 낮으나 실호출 1회 확인 권장 |
| **E2E-4** | `meta.snapshotAggregatedAt` 포맷 | `AssignmentPage.jsx:172` / `ScopeSplitCell.jsx:46` 의 `new Date(at).toLocaleString()` 이 `Invalid Date`를 내지 않는지 | 드라이버가 `'2026-07-22 03:00:00'` 문자열을 주면 V8은 파싱하나 표준 보장은 아님. 기존 포트폴리오 화면은 문자열을 그대로 출력한다(`PortfolioProjectTable.jsx:72`) — 신규 동작이라 확인 필요 |
| **E2E-5** | 전사 풀 토글 성능 | 최대 300명 × Jira 배치(50청크 × p-limit 3 = 6청크) 응답 시간 | 체감 지연 시 `MAX_POOL_ACCOUNTS` 하향 검토 |
| **E2E-6** | 프로젝트 패스 JQL(`moves_RMS_projectId = "<uuid>"`)이 팀 관리형 프로젝트에서도 동작 | 팀 관리형 프로젝트 상세에서 큐가 채워지는지 | 빈 큐 + `meta.issueScanned === 0`이면 JQL 인덱스 문제(설계 §5-1-B 가정 검증) |
| **E2E-7** | 권한 조합별 화면 | ① PROJECT read만: 전사 컬럼 locked·풀 토글 미노출·드로어 클릭 불가 ② +RESOURCE_MANAGEMENT read: 전사 컬럼·신호·풀 노출 ③ PROJECT write 없음: 배정 버튼 disabled ④ MEMBER_ONLY 비소속 프로젝트: `PERMISSION_PROJECT_SCOPE_DENIED` | 마스킹이 새면 서버 `isSatisfied` 판정 확인(`WorkAssignmentService.js:241`) |

### 설계상 알려진 한계 (실패 아님 — 설계서 §9에 명시된 승인 사항)

1. **staleTime 60초 경과 후 자연 재조회 시 롤백 가능** — 배정 60초 후 탭 재진입하면 `search/jql` 인덱스 지연 값이 캐시를 덮을 수 있다(설계 §9-3에서 수용).
2. **pool 조인 후 `signals`/`loadSplitRatio`가 조인된 `project.*`와 논리적으로 어긋날 수 있다** — pool 후보의 신호는 `project.remainingSeconds=0` 기준 서버 값이며, 프론트는 수치만 덮어쓰고 신호는 재계산하지 않는다(설계 §3.4-3이 규칙 이원화 방지를 위해 의도한 동작). `poolJoin.js:9-10`에 명시되어 있음.
3. **`NO_ESTIMATE` 플래그 때문에 배정 후에도 큐에 남는 이슈가 많을 수 있다** — 추정치 없는 이슈는 담당자를 지정해도 `flags.length > 0`이라 큐에서 빠지지 않는다(설계상 "열린 작업" 정의에 부합).
4. **프로젝트 이슈 패스 부분 실패가 조용히 지나간다** — `postJiraJson`의 `fallback:{issues:[]}`(`Fetcher.js:68`) 때문에 중간 페이지 실패 시 `truncated` 없이 부분 데이터가 내려간다. 설계 §3.4의 "부분 성공 폴백" 정책 범위 내이나, `meta.issueScanned === 0 && candidates.length > 0`을 프론트가 감지 신호로 쓰라는 백엔드 리포트 §5.4 권고는 **아직 UI에 구현되지 않았다**(선택 사항).

---

## 설계서 대비 미구현 / 변경 항목 (전부 사유 타당 — 실패 아님)

| 설계 항목 | 실제 | 검증 판정 |
|---|---|---|
| **F5** `assignment/queueFlags.js` (프론트 flags 미러) | **미구현** | **타당.** 백엔드가 `AssignResult.item.flags`를 재계산해 내려주므로(`Writer.js:109-112`) 프론트 미러는 소비처 없는 죽은 코드가 되고, `dueSoonDays`·타임존 규칙만 이원화된다. 대신 필터 매칭을 `queue/queueFilter.js` 순수 모듈로 분리해 테스트함 |
| i18n `signal.{S}` + `signal.{S}.tip` | `signal.label.{S}` / `signal.tip.{S}` | **타당.** 같은 JSON 경로가 문자열이자 객체가 될 수 없다. 값은 설계 문구 그대로 |
| 협업자 버튼에도 Jira `canAssignIssues` 게이트 | **담당자 버튼만** 적용(`AssignActionCell.jsx:32-34`) | **타당.** 협업자는 이슈 **프로퍼티** write(`mergeIssueProperty`, `as:'app'`)라 Jira `ASSIGN_ISSUES`와 무관하다. 동일 게이트는 과잉 차단 |
| `CompletionBar` 재사용 | 미사용 | **타당.** `WorkloadCell`이 진행도 바를 포함 — 중복 표기 |
| 임계는 `buildPeopleContext`의 settings로 resolve | `getSettingDataService()` **별도 병렬 호출**(`Service.js:237,353`) | **타당하며 실제로 필요한 수정.** `buildPeopleContext` 반환값에 settings 원본이 없음을 `ResourceManagementService.js:115-121`에서 직접 확인 — 설계대로 했으면 `resolveAssignmentThresholds`가 항상 undefined를 받는 죽은 경로가 됐다 |
| `meta.maxProjectIssues/maxQueueItems`, `PoolContent.truncated/totalPoolSize/maxPoolAccounts` | 추가(additive) | **타당.** 프론트가 상한 상수를 하드코딩하지 않게 함. 계약 축소 없음, 프론트가 정확히 같은 이름으로 소비(A-1/A-2) |
| 큐 정렬 인라인 | `WorkAssignmentRules.sortQueueItems` 분리 | **타당.** 정렬도 계약 — 테스트 가능해짐 |

---

## 결론

- **경계면 실패 0건.** backend / frontend 재작업 필요 항목 **없음**.
- 두 구현 리포트의 주장은 테스트 수치·파일 diff·응답 shape까지 **전부 코드로 재확인되었으며 과장·허위 없음**.
- 과거 회귀 지점(`PortfolioSnapshotRepository` 내부 소비자, 공통 이슈 페처, `buildPeopleContext` 내부 호출부)은 **전역 grep 전수 확인 결과 전부 무영향**.
- 남은 리스크는 전부 **배포 후 확인(E2E-1 ~ E2E-7)** 영역이며, 로컬에서 증명 불가능하므로 미검증으로 분류했다.
- 선택 조치: C-경고-1(`modulePathIgnorePatterns`), C-경고-6(**커밋 분리 — 필수**).
