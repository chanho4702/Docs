# 자원관리 재편 v2 — [인력 현황 | 프로젝트 배정] 설계서

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **슬러그**: `resource-assignment-merge` (v2)
- **입력**: `_workspace/resource-assignment-merge/00_input/requirement_v2.md`
- **폐기**: v1(`01_architect_design.md`의 셀렉터형 ProjectAssignmentTab). 사용자 거부 — "프로젝트 선택을 해서 나오는 메뉴는 안 됨".
- **전제 자산**: work-assignment `02_backend_report.md` §1 계약(board/pool/assign) + v1 권한 OR grant 3건(기구현·315 통과).

> **핵심 구조**: 프로젝트 배정 탭 = 좌우 2분할, **진입 즉시 양쪽 표시**.
> 좌 = 프로젝트 카드 목록(SQL 즉시 + 지표 lazy hydrate), 우 = 전사 인원 테이블(overview 재사용, 선택 시 적합도·신호 하이드레이트), 배정 = 인원 행 [배정] → 작업 선택 모달.
> **신규 백엔드 = resolver 2건**(카드 SQL·지표 Jira 배치). board/pool/assign/overview/loadSummary/setProjectSkills 는 **무변경 재사용**.

---

## 0. 조사 결과 요약 (실측)

| 확인 항목 | 실제 코드 | 설계 반영 |
|---|---|---|
| `approximate-count` / count JQL 전례 | `grep` 결과 **0건**. search/jql 은 전부 `nextPageToken`(total 미제공) 방식(`WorkAssignmentIssueFetcher:83`, `ResourceLoadFetcher`) | §3 — JQL count 후보 배제 근거 |
| 프로젝트 이슈 패스 | `fetchProjectIssuePass(projectId)` — JQL 술어 `moves_RMS_projectId = "<uuid>"` 단일 프로젝트, fields 에 앱 커스텀필드 **미포함**(fieldsByKeys 무관), coworker=`properties.movesRms`. Done 26주 포함(부하용, 무거움) | §3 — 경량 변형 신규 페처의 원본 패턴 |
| flags 산출 규칙 | `computeQueueFlags(base, {todayYmd,dueSoonDays})` — UNASSIGNED(assignee 없음 AND coworkers 빈)·OVERDUE·DUE_SOON·NO_ESTIMATE. **coworker 미배정 판정은 이슈 프로퍼티 필요**(JQL count 불가) | §3 — 지표는 이슈 페치 후 서버 flag 집계 |
| 전사 people 배치 | `buildPeopleContext()` → people[{util,utilBand,skills,roleName,levelName}], rollup KVS 캐시 read(신규 페치 없음). `getResourceOverviewService`/`getResourceLoadSummaryService` 가 재사용 | §4 — 우측 목록 = overview+loadSummary 무변경 재사용 |
| board candidates | work-assignment 계약 — `candidates[]{coverage,score,signals,matchedSkills,missingSkills,company,project}`, 서버 랭킹. pool=비멤버 | §4 — 선택 시 people ⋈ (board멤버+pool비멤버) 조인 |
| board queue | `queue[]{issueId,issueKey,summary,flags,dDay,assignee,coworkers,...}` done 제외 전체 열린 이슈 | §5 — 작업 선택 모달 소스 |
| 프로젝트 등록/수정 폼 | `pages/project/modal/ProjectModal.jsx` — `{isOpen,onClose,toast,editId,projectStatus,onSaved}`. `canWrite('PROJECT')` 게이트, Field: name/status/start/end/budget. editId 있으면 수정 | §6 — editId 시 요구스킬 편집 섹션 추가 |
| 요구스킬 편집 | `RequiredSkillEditor{projectId}` + `setProjectSkills`(W PROJECT detail). skill_mapping SQL write(인덱스 지연 없음) | §6 — ProjectModal(수정)에 통합 |
| AllocationGraph | `getResourceAllocationGraph` → {projects,members,links}. `AllocationGraph{projects,members,links,onMemberClick}`, `useResourceAllocation{includeClosed}` | §7 — 인력 현황 탭 하단 접이식 이동 |
| v1 산출물 실측 | `resource/assignment/ProjectAssignmentTab.jsx` **파일만 존재**(미커밋). 권한 OR 3건은 코디네이터 확인 기구현·315 통과 | §8 — ProjectAssignmentTab 폐기, 권한 유지 |
| SkillMappingQuery | `SELECT_SKILL_IDS_BY_PROJECT`(단건) 존재. **다건 IN 쿼리 없음** | §3 — `SELECT_SKILLS_BY_PROJECTS(count)` 신규 추가 |

---

## 1. 개요 / 영향 범위

### 1.1 기능 (확정 구조 — 변경 금지)
- **좌측 = 프로젝트 카드 목록**(진입 즉시, 세로 나열): 이름·상태·기간 + 미배정/마감임박/지연 수 + 요구 스킬 칩(읽기). 클릭=선택.
- **우측 = 전사 인원 테이블**(항상 표시): 기본 가동률·부하·스킬 / 선택 시 적합도·신호 컬럼 활성화 + 재정렬.
- **배정 = 인원 행 [배정] → 작업 선택 모달**(선택 프로젝트 큐) → 담당/협업 지정.

### 1.2 백엔드 (신규 resolver 2건 + SQL 1쿼리)
- 신규 `getAssignmentProjectCards` (SQL 즉시), `getAssignmentProjectMetrics` (Jira 배치 hydrate).
- 신규 페처 `AssignmentMetricsFetcher.js`(경량·격리), 신규 서비스 `AssignmentProjectService.js`.
- 신규 SQL `SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS(count)`.
- PermissionMap 2키 추가. `WorkAssignmentController`에 guardedDefine 2건 추가.
- **무변경 재사용**: board/pool/assign/overview/loadSummary/setProjectSkills, `buildPeopleContext`, `computeQueueFlags`, `fetchProjectIssuePass` 패턴.
- **v1 권한 OR grant 3건 유지**(기구현).

### 1.3 프론트
- 신규 `pages/resource/assignment/ProjectAssignmentBoard.jsx`(좌우 2분할 셸, v1 ProjectAssignmentTab **폐기 대체**) + 하위 컴포넌트(§4).
- 수정 `ResourcePage.jsx`(2탭), `ProjectModal.jsx`(요구스킬 섹션), `ResourceOverviewTab.jsx`(관계도 하단 흡수).
- 재사용(무수정): `useWorkAssignmentBoard/Pool`, `useAssignWorkItem`, `patchAssignmentCache`, `ConfirmModal`, `useResourceOverview/LoadSummary`, `AllocationGraph`/`useResourceAllocation`, `RequiredSkillEditor`.
- 제거: `ProjectAssignmentTab.jsx`(v1), `match/*`, `allocation/AllocationTab`, `allocation/AllocationFilters`.

### 1.4 DB
- 신규 스키마 없음. 신규 SELECT 1쿼리(skill_mapping IN)뿐. 마이그레이션 없음.

### 1.5 i18n
- 수정 `locales/kr|en/resource.json`(탭 라벨 + `assignment.*` 신규), `locales/kr|en/project.json`(요구스킬 필드 라벨). merge.

---

## 2. 경계면 계약 (신규 2건 shape 확정 + 무변경 재사용)

모든 신규 resolver 는 `guardedDefine`→`responseWrapper` 통과 → 프론트 수신 `{ success, content }`.

| # | resolver | 입력 | success 시 응답 | 권한 | 대응 프론트 |
|---|---|---|---|---|---|
| N1 | `getAssignmentProjectCards` | `{}` | `{ content: { cards:[Card], generatedAt } }` | `OR([PROJECT r, RESOURCE_MANAGEMENT r],'list')` | `useAssignmentProjectCards` / `assignmentKeys.cards()` |
| N2 | `getAssignmentProjectMetrics` | `{}` | `{ content: { metrics:[Metric], meta } }` | `OR([PROJECT r, RESOURCE_MANAGEMENT r],'list')` | `useAssignmentProjectMetrics` / `assignmentKeys.projectMetrics()` |
| — | `getWorkAssignmentBoard` | `{ projectId }` | `content: BoardContent` **무변경** | OR read `'detail'`(기구현) | 선택 시 `useWorkAssignmentBoard` |
| — | `getWorkAssignmentPool` | `{ projectId }` | `content: PoolContent` **무변경** | `RESOURCE_MANAGEMENT r 'detail'` | 선택 시 `useWorkAssignmentPool` |
| — | `assignWorkItem` | `{ projectId, issueId?, issueKey?, assigneeAccountId?, coworkerAccountIds? }` | `content: AssignResult` **무변경** | OR write `'inherited'`(기구현) | 모달 `useAssignWorkItem`→`patchAssignmentCache` |
| — | `getResourceOverview` / `getResourceLoadSummary` | `{}` | `content.people` / `content.load` **무변경** | `RESOURCE_MANAGEMENT r` | 우측 기본 |
| — | `setProjectSkills` / `getProjectSkills` | `{ projectId[, skillIds] }` | `data` **무변경** | W/OR `PROJECT` | ProjectModal |

### 2.1 `Card` (N1 — SQL 즉시, Jira 무접촉)
```js
Card = {
  projectId: string,          // uuid
  projectName: string,
  statusKey: string|null,
  statusName: string|null,
  statusColor: string|null,   // StatusBadge 색
  startDate: string|null,     // 'yyyy-MM-dd'
  endDate: string|null,
  requiredSkills: [ { id: string, name: string } ]   // skill_mapping ⋈ skill(KVS). 없으면 []
}
```
- 정렬: 서버가 `end_date asc`(마감 임박 프로젝트 우선). 프론트 재정렬 가능.
- **지표(미배정/임박/지연)는 여기 없음** — N2 로 lazy hydrate(§3).

### 2.2 `Metric` (N2 — Jira 배치 hydrate)
```js
Metric = {
  projectId: string,          // Card.projectId 와 조인 키
  unassignedCount: number,    // flags UNASSIGNED (assignee 없음 AND coworkers 빈)
  dueSoonCount: number,       // flags DUE_SOON  (오늘..+dueSoonDays)
  overdueCount: number,       // flags OVERDUE   (dueDate < today, 열린 이슈)
  openTotal: number,          // 열린 이슈 총수(참고)
  truncated: boolean          // 프로젝트당 MAX_OPEN_ISSUES 초과로 잘림
}
meta = {
  generatedAt: string,
  projectsScanned: number,
  projectsTruncated: boolean, // 활성 프로젝트가 MAX_ACTIVE_PROJECTS 초과
  dueSoonDays: 7              // 카드 라벨 툴팁용
}
```
- **부분 성공**: 특정 프로젝트 Jira 실패 → 그 projectId 의 Metric 을 `{unassignedCount:0,...,truncated:false}` 로 채우고 계속(throw 안 함). 프론트는 "지표 미상"이 아니라 0 으로 표기하되 `meta` 로 스캔 여부 판단.
- **조인**: 프론트가 `Map(projectId → Metric)` 으로 Card 에 병합. Metric 미도착(로딩 중) → 카드 지표 자리에 스켈레톤/`-`.

### 2.3 무변경 계약 리마인더 (work-assignment §5 유효)
`content` 래핑 / `candidates[].company` null 가능 / `assignWorkItem` payload 에 `projectId` 필수 / **assign 캐시는 `patchAssignmentCache` 패치만(invalidate 금지)** / board `refetchOnWindowFocus:false`.

---

## 3. 좌측 카드 지표 데이터 소스 — 판정 (최우선 과제)

### 결론: **후보 C(lazy hydrate) + 프로젝트별 경량 이슈 페치**. A·B 배제.

| 후보 | 내용 | 판정 |
|---|---|---|
| **A. JQL count × 3지표 × N** | 프로젝트당 미배정/임박/지연 3개 count JQL | **배제** — ① coworker 미배정(assignee 없음 AND coworkers 빈)은 **이슈 프로퍼티**라 JQL count 로 신뢰 불가(`movesRmsCoworkers is EMPTY` 미검증), ② search/jql 은 total 미제공, `approximate-count` 사용 전례 0건(미검증 API 리스크), ③ 3N 콜 > 후보C 의 N 콜 |
| **B. 단일 JQL IN + 서버 되나누기** | `moves_RMS_projectId IN (...)` 후 프로젝트별 집계 | **배제** — 되나누기하려면 응답에서 프로젝트 식별 필요 → `moves_RMS_projectId` 를 fields 요청(**fieldsByKeys 함정**, [[project_forge_field_key_fieldsbykeys]]) 또는 project 네이티브(1 RMS=N Jira 라 불가). 마이페이지 다중프로젝트 함정과 동일 |
| **C. lazy hydrate + 프로젝트별 경량 페치** | 카드 목록은 SQL 즉시, 지표는 프로젝트별 단일 JQL 술어로 열린 이슈만 페치→서버 flag 집계 | **채택** |

### 채택 근거
1. **되나누기 불필요**: 프로젝트별 **단일 JQL 술어**(`fetchProjectIssuePass` 검증 패턴) → fieldsByKeys 무관, 팀 관리형 안전([[project_team_managed_field_gap]]).
2. **정확한 미배정 판정**: 이슈를 받아 `computeQueueFlags` **재사용**(coworker 프로퍼티 포함) → assignee·coworker 둘 다 없는 진짜 미배정만 카운트. 규칙이 board 와 **완전히 일치**(이원화 없음).
3. **경량**: 카드 지표는 **열린 이슈만**(`statusCategory != Done`) 필요 → 부하 페치(Done 26주 포함)보다 가볍다. fields 최소(`status,statusCategory,duedate,assignee` + `properties:[movesRms]`).
4. **즉시 렌더**: 카드 목록(SQL)이 먼저 그려져 "빈 화면" 금지 요구 충족. 지표는 배경 hydrate(인력 현황 `overview`+`loadSummary` 비차단 패턴과 동형).

### 신규 페처 `AssignmentMetricsFetcher.js` (격리 — 공통 페처 무수정)
```
상수  PAGE_SIZE=100  MAX_OPEN_ISSUES=1500(프로젝트당)  MAX_ACTIVE_PROJECTS=80  CONCURRENCY=4

export fetchProjectOpenFlags(projectId, as='user')
  JQL : moves_RMS_projectId = "<projectId>" AND statusCategory != Done
  API : POST /rest/api/3/search/jql
  body: { jql, fields:['status','statusCategory','duedate','assignee'],
          properties:['movesRms'], maxResults:100, nextPageToken? }
  루프: nextPageToken 소진 or MAX_OPEN_ISSUES 도달(→truncated)
  집계: 이슈마다 normalizeIssue(축약) → computeQueueFlags 재사용
        unassigned/dueSoon/overdue += flag 포함 여부
  반환: { projectId, unassignedCount, dueSoonCount, overdueCount, openTotal, truncated }
  실패: { ...0, truncated:false } 부분 폴백(throw 안 함)

export fetchAllProjectMetrics(projectIds, as='user')
  p-limit(CONCURRENCY) 로 projectIds.slice(0,MAX_ACTIVE_PROJECTS) 병렬
  반환: { metrics:[...], projectsScanned, projectsTruncated }
```
- **공통 이슈 페처(getProjectIssuesByFilter/Gantt/Bulk/ByUser·ResourceLoadFetcher) 절대 무수정**. 이 화면 지표는 여기서만.
- `normalizeIssue`/`computeQueueFlags` 는 `WorkAssignmentIssueFetcher`/`WorkAssignmentRules` 에서 **import 재사용**(coworker·flag 규칙 단일 원천).

### 신규 서비스 `AssignmentProjectService.js`
```
getAssignmentProjectCardsService(principal)   // SQL 즉시
  1) rows = getActiveProjectsRepository(scopedProjectIds(principal))   // 재사용, scope 필터
  2) statusList = getProjectStatusListService()  (KVS)  → status 라벨/색 map
  3) projectIds = rows.map(project_id)
     skillRows = executeQuery(SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS(n), projectIds)  // 신규 IN
     skillList = getSkillListService()  (KVS) → skillId→name
  4) cards = rows.map(조립: status 라벨/색 + requiredSkills[])
     정렬 end_date asc
  return { content:{ cards, generatedAt } }

getAssignmentProjectMetricsService(principal)  // Jira 배치 hydrate
  1) rows = getActiveProjectsRepository(scopedProjectIds(principal))
  2) { metrics, projectsScanned, projectsTruncated } = fetchAllProjectMetrics(rows.map(project_id))
  3) dueSoonDays = resolveAssignmentThresholds(getSettingDataService()).dueSoonDays  // 재사용(기본 7)
  return { content:{ metrics, meta:{ generatedAt, projectsScanned, projectsTruncated, dueSoonDays } } }
```
- 두 resolver 모두 `getActiveProjectsRepository(scoped)` 를 호출 → **MEMBER_ONLY 사용자는 소속 프로젝트만** 카드/지표를 본다(scope 일관, 보안 유지).

### 신규 SQL `SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS(count)`
```sql
SELECT BIN_TO_UUID(project_id) AS project_id, skill_id
FROM skill_mapping
WHERE project_id IN (UUID_TO_BIN(?), ... n개)
```
(기존 `SELECT_SKILL_IDS_BY_PROJECT` 단건 패턴을 IN 다건으로 확장. UUID 바인딩 방식은 기존 쿼리 관례 확인 후 일치시킬 것 — 구현자 검증 포인트.)

---

## 4. 우측 전사 인원 + 적합도 조인 (과제 2)

### 4.1 데이터 소스
- **선택 전(기본)**: `getResourceOverview`(people: util/utilBand/skills/role/level) + `getResourceLoadSummary`(loadMap: 부하 카운트) **무변경 재사용** — 인력 현황 탭과 동일 배치(중복 페치 없이 React Query 캐시 공유).
- **선택 시(프로젝트 클릭)**: `useWorkAssignmentBoard(projectId)`(멤버 candidates: coverage/score/signals/matchedSkills/missingSkills) + `useWorkAssignmentPool(projectId, enabled)`(비멤버 candidates) 로드.
  - 진입 게이트가 `canRead('RESOURCE_MANAGEMENT')` 라 **pool 은 항상 호출 가능**(board.meta.poolAvailable=true 전제 — 요구 명시).

### 4.2 조인 (신규 순수함수 `mergeMatch.js` — jest 대상)
```
buildMatchMap(board, pool) -> Map(accountId → MatchInfo)
  source = [...(board?.candidates ?? []), ...(pool?.candidates ?? [])]
  각 candidate → { coverage, score, matchedCount, requiredCount,
                   matchedSkills, missingSkills, signals, company }
  // 멤버(board)가 pool 과 겹치면 board 값 우선(멤버가 더 정확)

hydratePeople(people, matchMap, selected) -> Row[]
  people.map(p => ({ ...p, match: selected ? (matchMap.get(p.accountId) ?? EMPTY_MATCH) : null }))
  // EMPTY_MATCH = { score:null, signals:[], matchedSkills:[], missingSkills:[], coverage:null }
```
- **신호 재계산 절대 금지**: `signals` 는 board/pool 서버값을 **그대로** 표시(§ 규칙 이원화 방지). 프론트는 배지 렌더만.
- **정렬**: 선택 시 `score desc → util asc(idle 우선) → displayName`. 이는 **표시 순서**일 뿐 신호/커버리지 재계산이 아님(허용).

### 4.3 우측 테이블 컬럼 (배정 관점 컴팩트)
| 컬럼 | 내용 | 선택 전 | 선택 시 | 컴포넌트 |
|---|---|---|---|---|
| 인력 | 아바타+이름+(비멤버 "외부" 칩) | ✓ | ✓ | `UserAvatar` |
| 직무/등급 | roleName/levelName | ✓ | ✓ | — |
| 가동률 | util+band | ✓ | ✓ | `UtilBadge` |
| 부하 | 진행/잔여MD/완수율 | ✓ | ✓ | `AssignedIssueCell`+`WorkloadCell` |
| 스킬 | 보유 스킬 칩 | ✓ | matched/missing 강조 | `SkillChip` |
| **적합도** | score% + matched/required | — | **활성** | `StatusBadge` |
| **신호** | signals 배지(서버값) | — | **활성** | `GapSignalBadge` |
| 배정 | [배정] 버튼 | (프로젝트 미선택 시 비활성) | ✓ | `AssignActionCell`(신규 소형) |

- 로우 클릭 → `ResourceProfileDrawer`(canReadResource 진입 전제라 항상 열림).

---

## 5. 작업 선택 모달 (과제 3)

### 5.1 흐름
인원 행 [배정] 클릭 → `WorkPickerModal` 오픈(선택 프로젝트의 `board.queue`) → 작업 선택 → 담당/협업 선택 → 확인 → `assignWorkItem`.

### 5.2 설계
```
WorkPickerModal({ isOpen, project, candidate, queue, onAssign, onClose })
  - 소스: board.queue (이미 §4 선택 시 로드됨 — 추가 페치 없음)
  - 필터(모달 내): 기본 '미배정 우선' 세그먼트(전체/미배정/마감임박/지연)
       → assignment/queue/queueFilter 의 filterQueue 재사용(순수함수)
  - 작업 행: issueKey·summary·상태·D-day·현재 담당/협업 아바타 (WorkQueueItem 재사용 가능)
  - 작업 선택 후 액션: [담당자 지정] / [협업자 추가]
       → runAssign 로직 재사용(AssignmentPage §runAssign):
         assign  = { issueId, issueKey, assigneeAccountId: candidate.accountId }
         coworker= { issueId, issueKey, coworkerAccountIds: [...기존, candidate.accountId] } (set 시맨틱)
  - 확인 = ConfirmModal 재사용, 비멤버 경고(assignment.warn.notMember) 재사용
```
- **모달 내 작업 필터**: 기본 **미배정 우선**(요구 §3). `DEFAULT_QUEUE_FILTER`(=미배정) 재사용. 사용자가 전체로 전환 가능.
- **write/캐시**: `useAssignWorkItem(projectId)` + `patchAssignmentCache` **무변경 재사용**. board 캐시(`assignmentKeys.board(projectId)`) 패치 → 모달 queue·우측 부하 즉시 반영. **invalidate 금지**(인덱스 지연).
- **좌측 카드 지표 갱신**: 배정으로 unassignedCount 가 준다. **낙관적 패치 선택** — `assignmentKeys.projectMetrics()` 캐시에서 해당 projectId 의 `unassignedCount` 를 `AssignResult.applied`/flag 변화로 -1 조정(순수함수 `patchProjectMetric`). Jira 재조회는 인덱스 지연이라 하지 않고 자연 갱신(staleTime) + 낙관 패치 병행.

---

## 6. 프로젝트 등록/수정 폼에 요구 스킬 통합 (과제 4)

### 위치
`pages/project/modal/ProjectModal.jsx` — `/project` 목록·칸반에서 열리는 등록/수정 모달. `editId`·`onSaved`·`canWrite('PROJECT')` 보유.

### 설계
- **수정(editId 존재) 시에만** 요구 스킬 섹션 노출. 근거: 신규 등록은 `insertProject` 가 project_id 를 생성하기 전이라 `setProjectSkills(projectId)` 를 걸 대상이 없다. 등록 → 저장 → 수정에서 스킬 지정(1스텝 추가는 수용, 복잡한 2단계 커밋 회피).
- budget Field 아래에 `editId && <RequiredSkillEditor projectId={editId} />` 삽입. RequiredSkillEditor 는 **자체 mutation/저장 버튼** 보유(폼 제출과 독립) → 프로젝트 필드 저장과 스킬 저장이 분리돼 안전.
- 편집 게이트: RequiredSkillEditor 기존 `canWrite('PROJECT')` 그대로. `setProjectSkills`=`W('PROJECT','detail')` 무변경.
- **배정 탭 카드의 스킬 칩은 읽기 전용**(N1.requiredSkills). 편집 진입점은 프로젝트 폼 단 하나로 일원화.
- i18n: `project.modal.requiredSkills` 라벨 추가.

> ⚠️ RequiredSkillEditor 는 v1 에서 `onSaved` prop 을 논의했으나 v2 에선 **배정 탭이 요구스킬을 편집하지 않으므로** board invalidate 연동이 불필요하다. ProjectModal 문맥에선 자체 `resourceKeys.projectSkills` invalidate 만으로 충분(카드 목록은 N1 재조회 시 자연 반영). onSaved 는 선택 사항.

---

## 7. 관계도 → 인력 현황 탭 (과제 5)

- `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation` **무수정 재사용**, **인력 현황 탭(`ResourceOverviewTab.jsx`) 하단**에 접이식 섹션으로 이동.
- 배치: 인력 테이블 아래 `▸ 배정 관계도` 토글(기본 접힘). `graphOpen` 시에만 `useResourceAllocation({includeClosed})` **온디맨드**(전사 배치 비용을 열 때만).
- 필터: 인력 현황은 전사 문맥이므로 `AllocationFilters`(상태/프로젝트 다중선택) **재사용** 가능 — 단 코드 위치를 overview 로 옮기거나 그대로 import. 판정: `AllocationFilters` 는 **인력 현황에서 재사용**(전사 관계도엔 필터가 유의미). → §8 제거 목록에서 제외.
- 드로어: 노드 클릭 → `ResourceProfileDrawer`(overview 가 이미 소유).
- **배정 탭에서는 관계도 완전 제거**(요구 §부가).

---

## 8. v1 산출물 처리 (과제 6) + 마이그레이션

### 폐기/제거
| 파일 | 사유 |
|---|---|
| `resource/assignment/ProjectAssignmentTab.jsx` (v1) | 셀렉터형 — 사용자 거부. `ProjectAssignmentBoard`(2분할)로 대체 |
| `match/ProjectMatchTab.jsx` | 배정 탭이 대체 |
| `match/CandidateRankTable.jsx` | 우측 전사 테이블(적합도 조인)이 대체 |
| `match/useProjectSkillMatch.js` | board.candidates 커버리지로 대체 |
| `allocation/AllocationTab.jsx` | 관계도가 인력 현황으로 이동(셸 불요) |

### 유지/이동/재사용
| 파일 | 처리 |
|---|---|
| `allocation/AllocationGraph`·`allocationGraphOption`·`useResourceAllocation`·`AllocationFilters` | **인력 현황 탭으로 이동·재사용**(무수정) |
| `match/RequiredSkillEditor` | **ProjectModal 로 재사용**(무수정) |
| 백엔드 권한 OR grant 3건 (getActiveProjects/board=+RESOURCE read, assign=+RESOURCE write) | **유효·기구현(315 통과) — 그대로 둔다** |
| 배정 게이트 `canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')` | v2 배정 모달에도 동일 적용 |
| `getProjectSkillMatch` resolver | 제거 안 함(계약 테스트 키 + 잠재 소비). 프론트 소비만 사라짐 |

### 프론트 컴포넌트 트리 (신규/재사용/제거)
```
pages/resource/
├── ResourcePage.jsx                       [수정] 2탭(인력 현황 / 프로젝트 배정)
├── assignment/
│   ├── ProjectAssignmentBoard.jsx         [신규] 좌우 2분할 셸, 선택 상태 소유
│   ├── useAssignmentProjectCards.js       [신규] N1
│   ├── useAssignmentProjectMetrics.js     [신규] N2 (비차단 hydrate)
│   ├── patchProjectMetric.js              [신규 순수함수] 배정 후 미배정 -1 낙관 패치
│   ├── mergeMatch.js                       [신규 순수함수] people ⋈ board+pool
│   ├── projects/
│   │   ├── ProjectCardList.jsx            [신규] 세로 카드 목록
│   │   └── ProjectCard.jsx                [신규] 이름·상태·기간·지표·스킬칩(읽기)
│   ├── people/
│   │   └── CompanyResourceTable.jsx       [신규] 전사 인원 + 선택시 적합도/신호
│   └── modal/
│       └── WorkPickerModal.jsx            [신규] board.queue 작업 선택→담당/협업
│   └── ProjectAssignmentTab.jsx           [제거]
├── overview/
│   ├── ResourceOverviewTab.jsx            [수정] 하단 관계도 접이식 흡수
│   └── …                                   [무변경]
├── match/  → 전부 제거 (RequiredSkillEditor 는 project/modal 로 이동)
└── allocation/
    ├── AllocationGraph / allocationGraphOption / useResourceAllocation / AllocationFilters  [유지·인력현황 재사용]
    └── AllocationTab.jsx                  [제거]

재사용(무수정, 타 디렉토리):
  projectDetail/assignment/{useWorkAssignmentBoard,useWorkAssignmentPool,useAssignWorkItem,patchAssignmentCache,
                            queue/queueFilter, queue/WorkQueueItem, candidate/GapSignalBadge}
  components/modal/ConfirmModal, components/table/CommonTable, components/avatar/UserAvatar
```

### 쿼리키 (`utils/queryKey/assignmentKeys.js` 확장)
```js
assignmentKeys = {
  all: ['workAssignment'],
  board: (projectId) => ['workAssignment','board',projectId],   // 기존
  pool:  (projectId) => ['workAssignment','pool',projectId],     // 기존
  cards:          () => ['workAssignment','cards'],              // 신규 N1
  projectMetrics: () => ['workAssignment','projectMetrics'],     // 신규 N2
};
```

---

## 9. 백엔드 구현 체크리스트
- [ ] **B1** `SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS(count)` 추가 (UUID IN, 기존 바인딩 관례 일치)
- [ ] **B2** `AssignmentMetricsFetcher.js` 신규 — `fetchProjectOpenFlags`/`fetchAllProjectMetrics`(p-limit 4, 상한·부분폴백). `normalizeIssue`/`computeQueueFlags` import 재사용, 공통 페처 무수정
- [ ] **B3** `AssignmentProjectService.js` 신규 — `getAssignmentProjectCardsService`(SQL 조립) / `getAssignmentProjectMetricsService`(Jira 배치). `getActiveProjectsRepository(scoped)`·`getProjectStatusListService`·`getSkillListService`·`resolveAssignmentThresholds` 재사용
- [ ] **B4** `WorkAssignmentController.js` — `guardedDefine` 2건 추가 `({principal})=>svc(principal)`
- [ ] **B5** `PermissionMap.js` — 2키 추가: `getAssignmentProjectCards`/`getAssignmentProjectMetrics` = `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')`
- [ ] **B6** `permissionMap.contract.test.js` — 등록 2건 반영. 지표 flag 집계 순수함수 단위 테스트(미배정 coworker 케이스, 상한 truncated)
- [ ] **B7** `npm test` 통과

## 10. 프론트 구현 체크리스트
- [ ] **F1** `assignmentKeys.js` — `cards`/`projectMetrics` 추가
- [ ] **F2** `useAssignmentProjectCards.js`(즉시) / `useAssignmentProjectMetrics.js`(비차단, `refetchOnWindowFocus:false`)
- [ ] **F3** `mergeMatch.js` + 테스트 — buildMatchMap/hydratePeople(신호 재계산 없음)
- [ ] **F4** `patchProjectMetric.js` + 테스트 — 배정 후 미배정 -1 낙관 패치
- [ ] **F5** `projects/ProjectCard.jsx`·`ProjectCardList.jsx` — 지표 스켈레톤(metrics 로딩 중)·요구스킬 칩(읽기)·선택 하이라이트
- [ ] **F6** `people/CompanyResourceTable.jsx` — overview+loadSummary, 선택 시 적합도/신호 컬럼 활성+재정렬(`GapSignalBadge` 재사용)
- [ ] **F7** `modal/WorkPickerModal.jsx` — board.queue(미배정 우선 필터)·담당/협업·ConfirmModal·`useAssignWorkItem`+`patchAssignmentCache`
- [ ] **F8** `ProjectAssignmentBoard.jsx` — 좌우 2분할 셸, 선택 상태, board/pool 로드(선택 시), 드로어
- [ ] **F9** `ResourcePage.jsx` — 2탭, import 교체
- [ ] **F10** `ProjectModal.jsx` — editId 시 RequiredSkillEditor 섹션
- [ ] **F11** `ResourceOverviewTab.jsx` — 하단 관계도 접이식(AllocationGraph+Filters, 온디맨드)
- [ ] **F12** 제거 — `ProjectAssignmentTab.jsx`(v1)·`match/*`·`allocation/AllocationTab.jsx`
- [ ] **F13** i18n(§11) merge, `npm run build`

## 11. i18n
### `locales/kr|en/resource.json`
| 키 | 조치 | kr / en |
|---|---|---|
| `tab.match`·`tab.allocation` | 제거 | — |
| `tab.assignment` | 추가 | 프로젝트 배정 / Project Assignment |
| `assignment.projects.title` | 추가 | 배정 대상 프로젝트 / Projects |
| `assignment.card.unassigned` | 추가 | 미배정 {n} / Unassigned {n} |
| `assignment.card.dueSoon` | 추가 | 마감임박 {n} / Due soon {n} |
| `assignment.card.overdue` | 추가 | 지연 {n} / Overdue {n} |
| `assignment.card.requiredSkills` | 추가 | 요구 스킬 / Required skills |
| `assignment.card.metricLoading` | 추가 | 집계 중… / Loading… |
| `assignment.people.title` | 추가 | 전사 인력 / Company resources |
| `assignment.people.selectPrompt` | 추가 | 프로젝트를 선택하면 적합도가 표시됩니다 / Select a project to see fit |
| `assignment.col.fit`·`col.signal`·`col.assign` | 추가 | 적합도·신호·배정 / Fit·Signal·Assign |
| `assignment.picker.title` | 추가 | 배정할 작업 선택 / Pick a work item |
| `assignment.picker.forMember` | 추가 | {name} 배정할 작업 / Work for {name} |
| `assignment.external` | 추가 | 외부 / External |
- 신호 배지 문구(`signal.*`)는 기존 `assignment.json`(work-assignment) **재사용** — 신규 불필요.
- `allocation.*`·`match.selectProject|requiredSkills|editRequired|placeholder|noRequired|save.success`(RequiredSkillEditor 사용분) **유지**. CandidateRankTable 전용 키는 미사용화(삭제 선택).

### `locales/kr|en/project.json`
| 키 | kr / en |
|---|---|
| `modal.requiredSkills` | 요구 스킬 / Required skills |

merge: `cd static/ui && npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.

## 12. 검증 포인트 (integration-verifier)
1. **신규 계약 shape** — N1 `content.cards[]`, N2 `content.metrics[]`(+meta). 프론트 조인 키 `projectId`(uuid) 일치.
2. **flag 규칙 단일 원천** — 지표 집계가 `computeQueueFlags` 재사용(미배정=assignee 없음 AND coworkers 빈). board 와 이원화 없는지.
3. **fieldsByKeys 미사용** — `fetchProjectOpenFlags` fields 에 앱 커스텀필드 없음(스코프는 JQL 술어).
4. **공통 페처 무수정** — getProjectIssuesByFilter/Gantt/Bulk/ByUser·ResourceLoadFetcher·fetchProjectIssuePass diff 0.
5. **신호 재계산 금지** — `mergeMatch` 가 signals 를 서버값 그대로 전달(재계산 코드 없음).
6. **invalidate 경계** — assign 경로는 `patchAssignmentCache`+`patchProjectMetric` 패치만. `invalidateQueries(assignmentKeys.board)` 0건.
7. **scope 일관** — N1/N2 가 `getActiveProjectsRepository(scopedProjectIds(principal))` 사용(MEMBER_ONLY 소속만).
8. **권한 OR 3건 유지** — board/getActiveProjects read OR, assign write OR. 프론트 배정 게이트 대칭.
9. **프로젝트 상세 회귀 없음** — `projectDetail/assignment/AssignmentPage` 무영향(재사용 훅만 import).
10. **build/test 통과**, i18n kr/en 대칭.

## 13. 가정·한계
1. 진입 게이트가 `canRead('RESOURCE_MANAGEMENT')` 라 이 화면 사용자는 pool·전사 지표 권한을 항상 보유(board.meta.poolAvailable=true 전제).
2. 카드 지표는 **열린 이슈 기준 실시간 페치**(스냅샷 아님). 프로젝트당 MAX_OPEN_ISSUES·활성 MAX_ACTIVE_PROJECTS 상한 초과 시 truncated 표기.
3. 지표는 lazy hydrate — 카드 렌더 후 수백 ms~수초 뒤 채워진다(비차단). 배정 후 미배정 수는 낙관 패치 + 자연 갱신.
4. 요구 스킬 편집은 **프로젝트 수정 폼 단일 진입점**(신규 등록 시엔 저장 후 수정에서). 배정 카드는 읽기 전용.
5. 신규 등록 프로젝트는 저장 즉시 활성 기간이면 카드에 나타나며 지표는 다음 metrics 조회에서 반영.
