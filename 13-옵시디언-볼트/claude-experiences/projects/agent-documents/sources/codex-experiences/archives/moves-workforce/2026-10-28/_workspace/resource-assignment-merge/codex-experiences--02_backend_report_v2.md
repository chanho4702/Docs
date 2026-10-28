# 자원관리 재편 v2 — 백엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **설계서**: `_workspace/resource-assignment-merge/01_architect_design_v2.md` (§2 경계면 계약 / §3 페처·서비스·SQL / §9 백엔드 체크리스트)
- **범위**: 신규 resolver **2건**(N1 카드 SQL / N2 지표 Jira 배치) + 신규 SQL 1쿼리 + 신규 격리 페처 1 + 신규 서비스 1 + PermissionMap 2키. v1 권한 OR grant 3건은 기구현·유효(무변경). **§9 = 사용자 피드백 반영(전체 프로젝트·isClosed·skill category·N2 필터).**
- **테스트**: `npm test` → **18 suites / 331 tests 전부 통과** (§9 반영 후. 315 기준 회귀 0).

> §1의 N1/N2 응답 shape은 **실제 구현 코드에서 그대로 옮긴 값**이다. 프론트는 이 문서만 보고 조인/소비 경로를 확정하면 된다.

---

## 1. 신규 resolver 실제 응답 shape (글자 그대로)

두 resolver 모두 `guardedDefine` → `responseWrapper` 통과 → 프론트 수신 `{ success:true, content:{...} }`.
실패 시 `{ success:false, error:{ name, code, message, cause } }`.

| # | resolver | 입력 payload | 권한 | 프론트 훅/쿼리키 |
|---|---|---|---|---|
| N1 | `getAssignmentProjectCards` | `{}` | `OR([PROJECT read, RESOURCE_MANAGEMENT read], 'list')` | `useAssignmentProjectCards` / `assignmentKeys.cards()` |
| N2 | `getAssignmentProjectMetrics` | `{}` | `OR([PROJECT read, RESOURCE_MANAGEMENT read], 'list')` | `useAssignmentProjectMetrics` / `assignmentKeys.projectMetrics()` |

### 1.1 `getAssignmentProjectCards` → `res.content` (N1, SQL 즉시 · Jira 무접촉)

```js
{
  cards: [ Card ],          // end_date asc 정렬(null endDate 는 맨 뒤), 항상 배열
  generatedAt: string       // ISO
}
```

```js
// Card — 좌측 프로젝트 카드 1건 (지표 없음, N2 로 조인)
Card = {
  projectId: string,             // uuid (N2.metrics[].projectId 와 조인 키)
  projectName: string|null,
  statusKey: string|null,        // project_status_key
  statusName: string|null,       // KVS status 라벨 (statusKey 없거나 미매칭 → null)
  statusColor: string|null,      // KVS status 색 (StatusBadge 용)
  isClosed: boolean,             // ★ §9 추가 — 프로젝트 상태가 최종(종료) 상태인지 (status-only, endDate 무관)
  startDate: string|null,        // 'yyyy-MM-dd'
  endDate: string|null,          // 'yyyy-MM-dd'
  requiredSkills: [ { id: string, name: string, category: string } ]
                                 // ★ §9 확장 — category 추가. 항상 배열([]), name/category 미해석 시 id/'' 폴백
}
```

- **지표(미배정/임박/지연)는 여기 없다** — N2 로 lazy hydrate.
- **전체 프로젝트**(활성/종료/일정오버 포함) = `getAllProjectsRepository` (§9 변경 — 날짜 필터 없음). 프론트가 `isClosed`/`endDate` 로 필터.
- **scope 일관**: `scopedProjectIds(principal)` 적용 → MEMBER_ONLY 사용자는 소속 프로젝트 카드만 받는다.

### 1.2 `getAssignmentProjectMetrics` → `res.content` (N2, Jira 배치 hydrate)

```js
{
  metrics: [ Metric ],      // 항상 배열
  meta: {
    generatedAt: string,          // ISO
    projectsScanned: number,      // 실제 페치한 프로젝트 수(상한 슬라이스 후)
    projectsTruncated: boolean,   // 활성 프로젝트가 MAX_ACTIVE_PROJECTS(80) 초과로 잘림
    dueSoonDays: number           // 카드 라벨 툴팁용(기본 7, settings 유래 — 배정 큐와 동일 임계)
  }
}
```

```js
// Metric — 프로젝트 1건 지표 (Card.projectId 로 조인)
Metric = {
  projectId: string,             // uuid — Card.projectId 조인 키
  unassignedCount: number,       // flags UNASSIGNED (assignee 없음 AND coworkers 빈 — 이슈 프로퍼티 판정)
  dueSoonCount: number,          // flags DUE_SOON  (오늘 <= dueDate <= 오늘+dueSoonDays)
  overdueCount: number,          // flags OVERDUE   (dueDate < 오늘)
  openTotal: number,             // 열린 이슈 총수(statusCategory != Done, 참고)
  truncated: boolean             // 이 프로젝트 열린 이슈가 MAX_OPEN_ISSUES(1500) 초과로 잘림
}
```

- **부분 성공**: 특정 프로젝트 Jira 실패 → 그 projectId 의 Metric 을 `{unassignedCount:0, dueSoonCount:0, overdueCount:0, openTotal:0, truncated:false}` 로 채우고 계속(throw 안 함). 프론트는 "지표 미상"이 아니라 0 으로 표기하되 `meta` 로 스캔 여부를 판단.
- **조인**: 프론트가 `Map(projectId → Metric)` 으로 Card 에 병합. Metric 미도착(로딩 중) → 카드 지표 자리에 스켈레톤/`-`.
- **flag 규칙 단일 원천**: `WorkAssignmentRules.computeQueueFlags` 를 **import 재사용**한다(복제 없음). 카드 지표와 배정 화면 `board.queue` 목록이 항상 동일 규칙으로 산출된다. 미배정 판정은 `normalizeIssue` 로 coworker 프로퍼티(`properties.movesRms.coworkers`)를 읽어 assignee·coworker 둘 다 없는 진짜 미배정만 카운트한다.

---

## 2. 신규/수정 파일 목록

### 신규
| 파일 | 역할 |
|---|---|
| `src/resolver/workAssignment/AssignmentMetricsFetcher.js` | **격리 경량 페처** — `fetchProjectOpenFlags` / `fetchAllProjectMetrics`(p-limit 4) + 순수 집계기 `aggregateOpenFlags` |
| `src/resolver/workAssignment/AssignmentProjectService.js` | `getAssignmentProjectCardsService`(N1 SQL) / `getAssignmentProjectMetricsService`(N2 Jira 배치) |
| `src/resolver/workAssignment/__test__/AssignmentMetricsFetcher.test.js` | 집계 순수함수 jest 11건 |

### 수정 (전부 추가만 — 기존 로직 무변경)
| 파일 | 변경 |
|---|---|
| `src/rdb/query/SkillMappingQuery.js` | `SELECT_SKILLS_BY_PROJECTS(count)` 추가 (UUID_TO_BIN IN 다건, BIN_TO_UUID 반환) |
| `src/resolver/workAssignment/WorkAssignmentController.js` | `guardedDefine` 2건 추가(`({principal}) => svc(principal)`) |
| `src/permission/PermissionMap.js` | 2키 추가 (`getAssignmentProjectCards`/`getAssignmentProjectMetrics`) |
| `test/permission/permissionMap.contract.test.js` | 신규 2키 매핑 고정 계약 1건 추가 |

### 무수정 확인 (제약 준수 — git diff 0)
`ResourceLoadFetcher.js` / `WorkAssignmentIssueFetcher.js` / `WorkAssignmentRules.js` / `WorkAssignmentService.js` / `WorkAssignmentWriter.js` / `IssueApi.js` — **v2에서 한 줄도 안 고침**(전부 import 재사용). 공통 이슈 페처(`getProjectIssuesByFilter`/`getProjectGanttIssues`/`getBulkIssuesByProject`/`getProjectIssuesByUser`) 무접촉.
`src/index.js` **무변경** — 신규 resolver 2건은 기존 `registerWorkAssignmentController` 안에 추가돼 이미 등록·계약 테스트 커버됨.
DB 스키마/마이그레이션/manifest 변경 **없음**.

---

## 3. 제약 준수 확인

| 제약 | 준수 방식 |
|---|---|
| flag 규칙 단일 원천 | 지표 집계가 `computeQueueFlags` **import 재사용** (규칙 복제 0). `aggregateOpenFlags` 는 `normalizeIssue`(coworker 프로퍼티) + `computeQueueFlags` 로만 판정 |
| 공통 페처 무수정 | `AssignmentMetricsFetcher.js` 신규 격리. 기존 페처 diff 0 |
| fieldsByKeys 함정 회피 | `fetchProjectOpenFlags` fields = `['status','statusCategory','duedate','assignee']` — 앱 커스텀필드(`moves_RMS_projectId`) 없음. 스코프는 JQL 술어 `moves_RMS_projectId = "<uuid>"` 단일 |
| 상한/동시성/truncated | 프로젝트당 `MAX_OPEN_ISSUES=1500`(초과 → `Metric.truncated`), 배치 `MAX_ACTIVE_PROJECTS=80`(초과 → `meta.projectsTruncated`), `p-limit(4)` 병렬 |
| 부분 성공 | 프로젝트별 Jira 실패 → 카운트 0 폴백(throw 안 함). SQL(카드)만 전파 |
| scope 일관 | N1/N2 모두 `getAllProjectsRepository(scopedProjectIds(principal))` → MEMBER_ONLY 소속만 (§9: 전체 프로젝트로 확장, scope 유지) |
| as:'user' | 페치 컨텍스트 asUser(asApp 지양) |

---

## 4. PermissionMap 변경 (프론트 게이트 미러링용)

| resolver | grant |
|---|---|
| `getAssignmentProjectCards` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')` |
| `getAssignmentProjectMetrics` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')` |

- `getActiveProjects`(v1 확장)와 **동일 정책** — 자원관리 통합 탭 진입자(`canRead('RESOURCE_MANAGEMENT')`)가 PROJECT read 없어도 카드/지표를 본다.
- project mode `'list'` — 가드는 principal 부착만, 서비스가 `scopedProjectIds` 로 MEMBER_ONLY 소속만 필터(스코프 무약화 없음).

---

## 5. SQL 신규 쿼리

```sql
-- SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS(count)
-- params: [...projectIds(uuid)]  → 행: { project_id(uuid 문자열), skill_id }
SELECT BIN_TO_UUID(project_id) AS project_id, skill_id
FROM project_skills
WHERE project_id IN (UUID_TO_BIN(?), ... n개)
```
- 기존 단건 `SELECT_SKILL_IDS_BY_PROJECT` 를 IN 다건으로 확장. UUID 바인딩은 `INSERT_PROJECT_SKILLS`(`UUID_TO_BIN(?)` 반복) 관례와 일치. `BIN_TO_UUID` 로 문자열 project_id 반환 → Card.projectId(uuid)와 조인 정합.

---

## 6. 집계 순수함수 테스트 (jest 11건)

`aggregateOpenFlags(rawIssues, opts, cap)` — Jira 목킹 없이 순수 검증:
- 미배정 = assignee 없음 AND coworkers 빈 / 담당자 있으면 아님
- **★ coworker 케이스**: 담당자 없어도 협업자 있으면 미배정 아님 (JQL count 로는 불가능한 판정 — 설계 §3 채택 근거)
- 지연(dueDate < today), 마감임박(오늘~+7 경계 포함/초과 배제)
- 한 이슈 미배정+지연 동시 → 두 카운트 독립 증가
- 복합 집합 카운트, cap 초과 → truncated:true + cap개까지만, cap 정확 일치 → truncated 아님, 빈 입력

---

## 7. `npm test` 결과

```
Test Suites: 17 passed, 17 total
Tests:       326 passed, 326 total
```
- 신규 `AssignmentMetricsFetcher.test.js` 11건 + 권한 계약 신규 1건 통과.
- 기존 315 → 326, work-assignment/gantt/resource OR 등 회귀 0.

---

## 8. 프론트 주의사항 (핵심)

1. **조인 키는 `projectId`(uuid)** — Card.projectId ↔ Metric.projectId 동일 체계(둘 다 BIN_TO_UUID / getActiveProjectsRepository uuid). `Map(projectId → Metric)` 병합.
2. **N2 는 비차단 hydrate** — 카드(N1)를 먼저 그리고 지표는 배경 로드. Metric 미도착 시 카드 지표 자리는 스켈레톤/`-`. `useAssignmentProjectMetrics` 는 `refetchOnWindowFocus:false` 권장(§10-F2).
3. **부분 성공 = 0** — 프로젝트별 Jira 실패는 `{...0, truncated:false}` 로 온다. "지표 미상"과 구분하려면 `meta.projectsScanned`/`projectsTruncated` 로 판단.
4. **truncated 2종** — `Metric.truncated`(프로젝트당 1500 초과), `meta.projectsTruncated`(활성 80 초과). 각각 카드/목록 레벨 안내.
5. **requiredSkills 는 항상 배열**(빈 배열 가능), `name` 은 미해석 시 id 폴백(항상 string). `statusName`/`statusColor` 는 null 가능('-' 폴백).
6. **배정 후 미배정 수 갱신**: 설계 §5 대로 `patchProjectMetric`(낙관 패치)로 `assignmentKeys.projectMetrics()` 캐시의 해당 projectId `unassignedCount` 를 조정하라. N2 재조회(invalidate)는 인덱스 지연이라 지양 — 자연 갱신(staleTime) + 낙관 패치 병행.
7. **board/pool/assign 계약 무변경** — work-assignment `02_backend_report.md` §1(§7 반영분: `projectKey`/`projectName`/`projectAvatarUrl`, flags 빈 배열 가능) 그대로. `content` 래핑, `candidates[].company` null 가능, assign payload `projectId` 필수, assign 경로 invalidate 금지.

---

## 9. 사용자 피드백 반영 (2026-07-23) — N1 additive 확장

E2E 사용자 피드백 2건 반영. **전부 additive이며 기존 필드 제거·이름변경 없음.**

### 9.1 카드 목록을 전체 프로젝트로 확장 + `isClosed` 추가

- **변경 전**: N1/N2 가 `getActiveProjectsRepository` (`start_date <= CURDATE() AND end_date >= CURDATE()`) 기반 → 종료/일정오버 프로젝트가 카드에서 통째로 빠졌다.
- **변경 후**: 신규 `getAllProjectsRepository(memberProjectIds)` (날짜 필터 없음, scope 유지) 로 **전체 프로젝트**를 내려준다. 프론트가 디폴트로 "최종 상태 아님 AND 일정오버 아님"만 표시하되 전체 조회도 가능(필터는 프론트).
- **`Card.isClosed: boolean` 추가** — 프로젝트 상태가 **최종(종료) 상태인지**. **status-only 판정**이며 endDate(일정 오버)는 포함하지 않는다. 일정오버는 프론트가 `Card.endDate < today` 로 별도 판정한다(사용자가 두 조건을 구분 요구).
  - 판정은 `ResourceManagementService.isTerminalStatus({statusKey, statusName})` **재사용**(복제 금지). 기존 `isProjectClosed`(status-done 키 + 종료계열 이름 정규식 + endDate)에서 **status 부분만 추출해 export**했고, `isProjectClosed` 는 이제 `isTerminalStatus(...) || endDate<today` 로 위임한다 → **behavior 무변경**.
- 정렬은 기존 **end_date asc 유지**(null endDate 는 맨 뒤).

### 9.2 `requiredSkills` 에 `category` 추가

- `[{id, name}]` → **`[{id, name, category}]`**. 스킬 마스터(KVS `getSkillListService().data` = `{id, name, category}`)에서 category 를 함께 매핑(`buildPeopleContext` 의 skillMap 조립과 동일 패턴).
- `category` 미해석 시 `''` 폴백(항상 string). 프론트가 직군별 그룹핑에 사용.

### 9.3 N2 지표 배치 대상 = 열린(비 isClosed) 프로젝트만

- 전체 프로젝트로 늘리면 Jira 배치 비용이 커진다 → **N2 는 `!isTerminalStatus` 프로젝트만** 페치한다. 최종 상태 프로젝트 카드는 지표가 오지 않아 프론트에서 '-' 로 자연스럽게 표기(Metric 미도착 = 스켈레톤/'-' 기존 규칙 그대로).
- **일정오버지만 최종 상태가 아닌 프로젝트는 포함**한다(열린 작업이 남아있을 수 있음).
- `MAX_ACTIVE_PROJECTS(80)` 상한·`p-limit(4)`·프로젝트당 `MAX_OPEN_ISSUES(1500)` 상한 **그대로 유지**.
- N2 는 status 라벨 해석을 위해 `getProjectStatusListService()` 를 추가로 병렬 호출(카드 필터링용).

### 9.4 변경 파일 (§9)
| 파일 | 변경 |
|---|---|
| `src/resolver/project/ProjectRepository.js` | `getAllProjectsRepository(memberProjectIds)` 추가(날짜필터 없는 scope 조회) |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `isTerminalStatus` 추출·export, `isProjectClosed` 가 위임(behavior 무변경) |
| `src/resolver/workAssignment/AssignmentProjectService.js` | N1: 전체조회 + `isClosed` + skill `category`. N2: `!isTerminalStatus` 필터 + status 서비스 병렬 |
| `src/resolver/resourceManagement/__test__/isTerminalStatus.test.js` | 신규 — status-only 판정 5건(키/이름 한영/진행/무값/endDate 무관) |

### 9.5 프론트 주의 (§9 추가분)
1. **카드는 이제 전체 프로젝트** — 디폴트 뷰는 `!card.isClosed && !(card.endDate && card.endDate < today)` 로 필터. "전체 보기" 토글 시 전량 표시.
2. **`isClosed` 는 status-only** — 일정오버(endDate 지남)는 별개다. 두 필터를 각각 적용해야 사용자 요구("최종 상태가 아니고 일정 오버가 아닌")를 만족한다.
3. **`requiredSkills[].category`** 로 직군별 그룹핑. category `''`(미분류) 가능.
4. **닫힌 프로젝트 카드는 지표(Metric)가 안 온다** → 지표 자리 '-'. 이는 정상(로딩 실패 아님). `meta.projectsScanned` 는 열린 프로젝트 수만 센다.

### 9.6 테스트
```
Test Suites: 18 passed, 18 total
Tests:       331 passed, 331 total
```
신규 `isTerminalStatus.test.js` 5건 + 기존 회귀 0(326→331). `isProjectClosed` 위임 리팩터가 기존 `ResourceMatch`/자원관리 테스트에 영향 없음 확인.
