# 팀(Team) 개념 도입 설계서 — 구현 직전 게이트 리뷰

> 검토: 2026-07-27 / fable (검토자, 작성자와 분리)
> 대상: `_workspace/team-management/01_architect_design.md` (1차 리뷰 7건 + 2차 N1~N4 반영본)
> 방식: 설계서 주장을 코드베이스에서 실측 대조. 설계서는 수정하지 않음.

---

## 0. 판정 요약

| 심각도 | 건수 | 요지 |
|---|---|---|
| **Blocker (구현 전 반드시 해결)** | 3 | C1 allowlist가 "차단"이 아니라 "NULL 쓰기"가 됨 / C2 `normalizeScope` 3중 구현 → TEAM_ONLY가 조용히 ALL로 격하 / C3 `whereIn([])`이 조건을 통째로 버려 스코프가 fail-**open** |
| **High** | 5 | H1 팀장 write 5키의 진입 경로가 전부 막혀 있음 / H2 `insertProjectusers` targets 키 불일치 / H3 allowlist 미등록 시 기본 통과 / H4 "내 팀원만 조회"(D2-①) 미구현·미선언 / H5 팀 삭제 시 조용한 전권 상실 |
| **Medium** | 8 | M1 쓰기 검증이 stale 캐시 기반 / M2 "팀 평균 가동률" 산식 화면별 불일치 / M3 "팀 미지정" 필터가 전체를 반환 / M4 마스킹의 실효성 / M5 N1 전체거부 오탐·진단부재 / M6 상수 드리프트 / M7 계약 테스트 사각 / M8 read 마스킹에 가시성 신호 없음 |
| **Low / 확인 필요** | 3 | L1~L3 |

**구조 결정(S1~S8, R1~R7) 자체는 재검토 불필요하다.** 저장소 선택, 앱 레벨 재귀, 개인 오버라이드, 별개 축(S5), 스냅샷 무변경(S6)은 코드와 대조해도 타당하다. 아래 결함은 전부 **구조가 아니라 접합부**에서 나온다 — 설계서가 "기존 X를 재사용한다"고 쓴 지점에서 X의 실제 시맨틱이 가정과 달랐다.

---

## 1. Blocker

### C1. `updateUserService`의 "미전달 = NULL" 시맨틱과 allowlist 드롭이 결합해 **팀원의 `permission_key`를 지운다**

**근거 (실측)**
- `src/rdb/query/UserQuery.js:29-37` — `UPDATE_USER`는 `role_key`, `level_key`, `permission_key`를 **무조건 SET** 한다. 부분 갱신 쿼리가 아니다.
- `src/resolver/backoffice/user/UserService.js:343-347` — `const safePermissionKeyKey = permissionKey === undefined ? null : permissionKey`. 즉 **키가 없으면 명시적 NULL**.

**무슨 일이 벌어지나**

설계서 §R3-A는 `TEAM_LEAD_WRITE_ALLOWLIST.updateUser = ['id','roleKey','levelKey']`로 좁힌 payload를 서비스에 넘긴다. `permissionKey`는 payload에서 사라진다 → `undefined` → `null` → **`permission_key = NULL`로 UPDATE**.

결과: 팀장이 팀원의 직무만 바꿔도 그 팀원의 개인 권한세트가 사라진다. R2에 따라 그 사람은 팀 상속으로 넘어가고, 조상 체인에 `permissionKey`가 없으면 `permissionSource:'none'` = **전 리소스 false**. 설계서 §R3-A의 불변식 — "allowlist에 없는 키는 존재 자체가 무시된다" — 이 서비스 계층에서 성립하지 않는다. **드롭이 무시가 아니라 삭제다.**

**같은 함정이 P0에서 먼저 터진다**
P0은 `updateUser`가 `teamKey`를 수용하도록 확장한다(§3 "P0 기존 resolver 응답 확장" 표). 그런데 현재 프론트 `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js:103-109`는 `{id, roleKey, levelKey, permissionKey, salary}` 4필드만 보낸다. 같은 패턴으로 `teamKey`를 처리하면 **기존 사용자 수정 모달의 저장 한 번에 그 사용자의 팀 소속이 NULL로 날아간다.** P1의 팀장 경로보다 먼저, 관리자의 일상 조작에서 발생한다.

**왜 설계서의 테스트가 이걸 못 잡나**
§R3-A/§9 P1의 보안 테스트는 `applyTeamLeadFieldPolicy(...)`의 **반환값만** 검증한다(`payload`에 3키, `droppedFields`에 4키). 정책 함수는 정확히 명세대로 동작하므로 테스트는 통과한다. 결함은 그 다음 단계에 있다.

**고침**
1. `updateUserService`를 **부분 갱신**으로 전환. 리포에 이미 선례가 있다 — `ProjectUsersQuery.UPDATE_BY_KEY_WITH_PARAMS:63-71`의 `CASE ? WHEN '' THEN col ELSE ? END` 패턴. 다만 이는 "명시적 null로 해제" 동작을 바꾸므로 기존 호출부(사용자 수정 모달) 회귀 검토가 필요하다.
2. 또는 최소 범위 대안: `grantedBy === 'TEAM_LEAD'` 전용으로 **role/level만 SET 하는 신규 쿼리 키**를 하나 두고 그쪽으로 분기. allowlist는 그대로 유지.
3. **테스트를 정책 함수가 아니라 서비스 경계로 올릴 것**: "팀장 경로로 `updateUser` 호출 후 대상 사용자의 `permission_key`·`salary`·`team_key`가 호출 전과 동일하다"를 DB 레벨(또는 repository mock 인자 레벨)에서 단언.

---

### C2. `normalizeScope`가 **3곳에 중복 구현**되어 있고, P1 체크리스트는 그중 하나만 고친다 → TEAM_ONLY가 조용히 `ALL`로 격하 (fail-**open**)

**근거 (실측 — 전부 독립 리터럴 삼항)**

| # | 위치 | 역할 | 미수정 시 결과 |
|---|---|---|---|
| 1 | `src/permission/PrincipalResolver.js:32` | **판정** — `set.projectScope` → `principal.projectScope` | TEAM_ONLY 세트 → `'ALL'` → 해당 사용자가 **전 프로젝트를 보게 됨** |
| 2 | `src/resolver/backoffice/permission/PermissionService.js:13` | 저장 (`addPermission`/`updatePermission:97`/`updatePermissionScope:138`) | TEAM_ONLY 저장 자체가 안 됨 |
| 3 | `src/seed/SeedData.js:93` (+ `:54` Member 전용) | 시드 마이그레이션 — 커스텀 세트를 **덮어쓴다** | `runSeed()` 실행 시 전사 TEAM_ONLY가 `'ALL'`로 리셋 |

설계서 §9 P1 체크리스트는 **`PermissionService.normalizeScope`(#2)만** 열거한다. #1과 #3은 §8 영향도 표에도 없다.

**왜 Blocker인가**
- #1 누락은 **권한 축소 의도가 권한 확대로 뒤집히는** 유일한 시나리오다. 관리자가 "이 세트는 자기 팀만 보게" 설정했는데 실제로는 전사가 보인다. 설계서 전체를 관통하는 fail-close 원칙의 정반대다. 게다가 화면상으로는 정상(권한 페이지에 TEAM_ONLY가 선택돼 보임)이라 발견이 늦다.
- #3 누락은 **시한폭탄**이다. `SeedData.js:93`의 `migratePermissionSets()`는 `runSeed()`에서 무조건 실행되고(`SeedData.js:15`), `runSeed()`는 `SEED_VERSION` bump 때마다 돈다. P1에서 TEAM_ONLY를 도입한 뒤 **다음 기능이 SEED_VERSION을 올리는 순간** 전 커스텀 세트의 TEAM_ONLY가 조용히 ALL로 돌아간다. `:54`는 Member 세트에 대해 동일(TEAM_ONLY로 설정된 Member가 ALL로).

**이건 설계서가 지목한 "이중 구현" 2건(§D 카테고리)에 들어있지 않다.** 설계서는 프론트↔백엔드 축만 봤고, 백엔드 내부의 같은 규칙 3중 복제는 놓쳤다.

**고침**
1. `PROJECT_SCOPES` 상수 + `normalizeScope()`를 **한 파일**(예: `src/permission/ProjectScope.js`)로 승격하고 세 곳이 전부 import. 리터럴 삼항을 남기지 말 것.
2. 계약 테스트 2개 추가:
   - `PROJECT_SCOPES`의 모든 값이 `normalizeScope`를 통과해 자기 자신으로 나온다(신규 스코프 추가 시 자동 검출).
   - `src/` 전역 grep으로 `'MEMBER_ONLY' ? ... : 'ALL'` 형태의 리터럴 삼항이 0건임을 단언(재복제 방지).
3. §9 P1 "배포 가능 판정"에 **"PrincipalResolver·SeedData 양쪽 정규화가 TEAM_ONLY를 보존한다"를 완결 조건으로 명시**.

---

### C3. `whereIn(col, [])`은 조건을 **통째로 생략**한다 → 팀 스코프가 빈 집합일 때 fail-**open**

**근거**
`src/rdb/query/QueryBuilder.js:40-46`
```js
whereIn(col, values) {
    if (values == null) return this;
    const arr = Array.isArray(values) ? values : [values];
    if (arr.length === 0) return this;      // ← 조건 없이 통과
```

설계서 §4-2는 `findAccountIdsByTeamKeys(teamKeys)`를 `QueryBuilder.from('users').whereIn('team_key', teamKeys)`로 규정한다.

**무슨 일이 벌어지나**
`scopeTeamKeys = []`인 상태(팀 미소속 TEAM_ONLY 사용자, 또는 §R1의 사이클 강등으로 스코프가 비는 경우)에서 이 함수가 호출되면 `WHERE` 절이 없는 `SELECT * FROM users` → **전사 accountId 반환** → `teamScopeAccountIds` = 전원 → `memberProjectIds` = 전 프로젝트.

설계서 §R6 표는 이 상황을 정확히 반대로 적고 있다:
> `projectScope = TEAM_ONLY`, 팀 미소속 | `scopeTeamKeys = []` → `memberProjectIds = []` → 목록 0건 … **fail-close 준수**

**실제로는 fail-open이다.** 설계서는 "`teamScopeAccountIds`는 `isTeamLead`이거나 `TEAM_ONLY`일 때만 채운다"고만 적고, **빈 배열 가드는 어디에도 없다.**

**고침**
1. `findAccountIdsByTeamKeys` 진입부에 `if (!teamKeys?.length) return [];` — repository 레벨에서 명시. 상위 호출부 방어에 의존하지 말 것(호출부가 늘어난다).
2. 단위 테스트: 빈 배열 입력 → 빈 결과 **그리고 SQL 미발행**(executeQuery mock 호출 0회).
3. 같은 함정 점검: `FIND_PROJECT_IDS_BY_ACCOUNTS(count)` + `generateInClause(count)`의 `count === 0` 경로가 문법 오류를 내는지, 조건 없는 전체 조회가 되는지 확인 필요. (`src/rdb/query/CommonQuery.js`)
4. **설계서 §R6 표의 "fail-close 준수" 문장은 근거가 없는 상태다.** 가드를 넣은 뒤에야 참이 된다.

---

## 2. High

### H1. 팀장 write 축 5키 중 **실제로 동작하는 경로가 사실상 없다** — 선행 read가 전부 막혀 있음

설계서 §R3은 팀장에게 5개 resolver를 연다. 각각의 진입 경로를 실측했다.

| resolver | 선행 read | teamLead 축 | 팀장(Member 세트) 보유 여부 | 결과 |
|---|---|---|---|---|
| `setUserSkills` (§R3 "팀장의 핵심 실무") | `getUserSkills` = OR[RESOURCE_MANAGEMENT read, USER_MANAGEMENT read] (`PermissionMap.js:228`) | **없음** | Member는 `RESOURCE_MANAGEMENT: {read:false,write:false}` (`ResourceCatalog.js:54`) | **읽기 거부** |
| `updateUser` (roleKey/levelKey) | `getRoleList`/`getLevelList` = OR[X_MANAGEMENT read, USER_MANAGEMENT read] (`PermissionMap.js:50,58`) | 없음 | 둘 다 없음 | **직무/등급 Select가 빈 채로 렌더** |
| `findUserByAccountId` | 진입점 `/backoffice/users` 목록 = `getUserListWithPaging` R('USER_MANAGEMENT') | 목록엔 없음 | 없음 | **목록을 못 봐서 편집 모달에 도달 불가** |
| `insertProjectusers` | — | targets 키 불일치 | — | **H2 참조 (항상 거부)** |
| `removeProjectMemberByAccount` | 인력 탭(PROJECT read) | 정상 | Member는 PROJECT read=true | ✅ 유일하게 동작 |

**추가 확인**
- 스킬 편집 진입 화면 `static/ui/src/pages/resource/overview/UserSkillEditModal.jsx:31`은 `getUserSkills`로 현재 스킬을 로드한 뒤 `setUserSkills`로 전량 덮어쓴다. 만약 read만 어떤 경로로 통과시키고 write를 열면, **로드 실패 시 `skillIds`가 `[]`로 남아 저장 시 스킬이 전멸**한다. 부분 개방은 더 위험하다.
- `/resource` 페이지 자체가 `RESOURCE_MANAGEMENT` 게이트(`Sidebar.jsx:79`)라 팀장은 화면에 들어가지도 못한다.
- `/backoffice/users`의 `UserPage.jsx`에는 **read 게이트가 없다**(132행에 `canWrite("USER_MANAGEMENT")`만 존재). 직접 URL 진입은 되지만 목록 resolver가 거부하므로 빈 화면이 된다. **즉 §R3-C의 1차 방어("팀장 경로면 급여·권한·팀 입력란 미렌더")는 팀장이 도달할 수 없는 화면에 구현된다.**

**결론**: D2-② "팀장 역할"은 현재 설계대로 구현하면 **서버 판정축만 생기고 사용자에게 열리는 기능은 배정 취소 1건뿐**이다. P2 착수 전에 아래를 결정해야 한다.

**고침**
1. **팀장 전용 진입 화면을 먼저 정한다.** 가장 자연스러운 곳은 `/backoffice/team`의 `TeamDetailPanel` 팀원 목록(이미 P0에 있고, `TEAM_MANAGEMENT` read가 아니라 "내가 리더인 팀"이면 열리게 별도 게이트를 두면 된다).
2. 그 화면이 쓰는 **read resolver 전부에 `teamLead` 축을 동반 부여**한다 — 최소 `getUserSkills`, `getRoleList`, `getLevelList`. 축을 write에만 붙이면 반드시 이 패턴이 재발한다.
3. 설계서에 규칙으로 못박을 것: **"팀장 축을 write resolver에 부여할 때, 그 화면이 호출하는 read resolver의 grant를 함께 확인한다."** §8 "특별 주의"에 4번 항목으로 추가할 가치가 있다.

---

### H2. `insertProjectusers`의 `teamLead.targets:['accountIds']`가 실제 payload 키와 불일치 → 팀장은 **항상 거부**

**근거**
- 서비스 시그니처: `src/resolver/projectIssue/ProjectUsersService.js:30` — `({project_id, jiraUser}, {accountId})`
- 프론트 호출 2곳 모두 `jiraUser: [{ value: accountId }]` 형태:
  - `static/ui/src/pages/projectDetail/user/UserAddModal.jsx:14`
  - `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:138-140`

설계서 §R3 표와 §4-6은 `teamLead:{ targets:['accountIds'] }`로 지정한다. payload에 `accountIds` 키가 없으므로 `isTeamLeadOver`의 `targets`가 빈 배열 → `if (targets.length === 0) return false` → 팀장 경로가 절대 열리지 않는다.

`['jiraUser']`로 고쳐도 안 된다 — 원소가 `{value}` **객체**라 `allowedSet.has(obj)`가 false다. 설계서의 `isTeamLeadOver` 추출 로직(`Array.isArray(v) ? push(...v)`)은 문자열 배열만 가정한다.

fail-close 방향이라 보안 사고는 아니지만, **계약 표가 틀렸고 그대로 구현하면 조용히 죽는 기능**이다.

**고침 (택1)**
- (권장) `insertProjectusers`를 팀장 축에서 **제외**하고, 팀원 배정은 N1의 `addTeamMembersToProject`(payload가 `accountIds` 문자열 배열이라 추출이 자연스럽다)로만 연다. 진입점도 그쪽이 명확하다.
- 또는 `targets`에 추출기를 허용: `teamLead:{ targets:[{ key:'jiraUser', pick: v => v?.value }] }`. 단 이러면 정책 표현이 복잡해지고 H3의 위험이 커진다.

---

### H3. allowlist가 **미등록 resolver에 대해 "전부 통과"** → 설계서가 스스로 비판한 블랙리스트와 같은 실패 모드

**근거 (설계서 §R3-A 코드 초안)**
```js
const allow = TEAM_LEAD_WRITE_ALLOWLIST[resolverName];
if (!allow) return { payload, droppedFields: [] };   // ← 미등록 = 무제약
```

설계서는 블랙리스트를 기각하며 이렇게 썼다:
> **새 컬럼의 기본값이 "통과"가 되기 때문이다.**

그런데 같은 성질이 **resolver 축에 그대로 남아 있다.** 새 resolver에 `teamLead` 축을 붙이면서 `TEAM_LEAD_WRITE_ALLOWLIST`에 키 등록을 잊으면, 그 resolver의 payload는 **전 필드가 통과**한다. 컬럼 축은 막았지만 resolver 축은 안 막았다.

지금은 `setUserSkills`/`insertProjectusers`/`removeProjectMemberByAccount`가 "payload에 민감 필드가 없어 제약 불필요"라는 이유로 의도적 미등록이다. 그 판단 자체는 현재 payload 기준으로 맞다. 문제는 **그 판단이 코드에 고정되지 않는다**는 것이다. 나중에 `setUserSkills`에 필드가 하나 늘면 자동으로 통과한다.

**고침**
1. 기본을 뒤집는다: `if (!allow) return { payload: {}, droppedFields: Object.keys(payload ?? {}) }` — 미등록이면 전부 드롭. 그리고 현재 무제약인 3개는 `['accountId','skillIds']` 식으로 **명시 등록**한다. 그래야 "제약 없음"이 판단의 결과로 기록된다.
2. 계약 테스트: `PERMISSION_MAP`에 `teamLead`가 있는 모든 키가 `TEAM_LEAD_WRITE_ALLOWLIST`에도 존재한다(불일치 시 실패). H2 같은 키 불일치도 이 테스트 형태로 일부 잡을 수 있다.

---

### H4. 요구사항 D2-①의 절반 — **"내 팀원만 조회"**가 설계 어디에도 구현되지 않고, 비목표 선언도 없다

**요구사항 원문** (`00_input/requirement.md:20-21`)
> **데이터 범위 제한 (TEAM_ONLY)** — … 내 팀이 참여한 프로젝트·**내 팀원만** 조회 가능.

**설계서의 처리**: S4는 TEAM_ONLY를 `scopedProjectIds()` 내부에서 흡수한다 — 이건 **프로젝트 축 전용**이다. `principal.scopeTeamKeys`는 산출되지만 **사람 목록 필터에는 어디에서도 쓰이지 않는다.** `teamScopeAccountIds`는 §R3에서 "팀장 write 대상"으로만 정의된다.

**노출되는 화면**: `getResourceOverview`/`getResourceProfile`/`getResourceAllocationGraph`(전부 `R('RESOURCE_MANAGEMENT')`, `project: 'none'`), `getUserListWithPaging`(`R('USER_MANAGEMENT')`), `getWorkAssignmentPool`. TEAM_ONLY 사용자가 이 중 하나라도 read를 가지면 **전사 인원이 그대로 보인다.**

설계서 §R6 표는 TEAM_ONLY의 결과를 "목록 0건"으로만 서술하는데, 이는 프로젝트 목록 이야기다. 사람 목록에 대해서는 **아무 말도 하지 않는다.**

**고침 (지금 결정해야 함 — P2에서 되돌아온다)**
- (a) **비목표로 명시 선언**한다: "TEAM_ONLY는 프로젝트 축 스코프이며 인원 목록은 좁히지 않는다. 인원 열람은 `RESOURCE_MANAGEMENT`/`USER_MANAGEMENT` grant가 통제한다." — 근거를 붙이면 이것도 합리적 선택이다(S4의 무회귀 이점을 지킬 수 있다).
- (b) 또는 서버 필터를 넣는다. 단 이건 **응답 필드 추가가 아니라 행 필터**라 §8이 전제한 "필드 추가만" 무회귀 논증이 깨진다. 단계·위험 등급 재산정 필요.

어느 쪽이든 설계서에 한 줄이 있어야 한다. 지금은 요구사항이 반쯤 사라진 상태다.

---

### H5. 팀 삭제 / 재부모화가 팀 상속자에게 **조용한 전권 상실**을 일으킨다 — 경고 설계의 비대칭

**근거**: §4-3 `deleteTeam` 2단계 `UPDATE users SET team_key = NULL WHERE team_key = ?`

`permission_key IS NULL`(= 팀 상속) 상태인 팀원은 팀이 사라지는 순간 `permissionSource:'none'` → **전 리소스 false**. 로그인은 되는데 아무것도 안 보인다.

설계서는 같은 종류의 위험에 대해 두 곳에서 경고를 설계했다 — §R6(TEAM_ONLY 전환 시 미소속자 N명 경고 배너), §R7(팀 상속 선택 시 실효 권한 미리보기). **그런데 삭제·재부모화에는 없다.** `deleteTeam` 응답의 `detachedUserCount`는 "몇 명이 해제됐다"만 알려주고 "그중 N명이 모든 권한을 잃었다"는 말하지 않는다.

재부모화도 같다: 삭제되는 중간 팀이 `permissionKey` 보유자였다면, 그 후손 팀의 상속자들은 실효 권한이 **말없이 조부모 세트로 바뀐다**(넓어질 수도, 좁아질 수도 있다).

**고침**
1. 삭제 확인 모달 앞에 영향 미리보기. **추가 resolver 불필요** — §R7 미리보기와 정확히 같은 데이터(`getTeamList`의 `teams[].parentTeamKey/permissionKey` + `findTeamById`의 `members[]`)로 프론트에서 계산 가능하고, 같은 `buildTeamTree.js` 순수 함수를 쓴다.
2. `deleteTeam` 응답에 `permissionLostCount`, `inheritanceChangedCount` 추가(§R3-C의 "조용한 실패 금지"와 동일 원칙).
3. 부수 확인 필요: 팀장 본인이 그 팀에서 제거되거나 팀이 삭제되면 `leadingTeamKeys`가 비어 `isTeamLead:false`가 된다 — 이건 자연히 fail-close라 문제없다. 다만 §R1의 90초 stale 창 동안 팀장 권한이 살아 있다는 점은 설계서가 이미 명시했다(수용).

---

## 3. Medium

### M1. `updateTeam`의 사이클/깊이 가드가 **최대 60초 stale 인덱스**를 근거로 판정한다

§R1은 `TeamTreeCache`가 "권한 판정의 입력"임을 정직하게 명시했다. 그러나 **쓰기 검증의 입력이기도 하다**는 점은 다루지 않았다. 설계서 스스로 "`invalidateTeamIndex()`는 호출된 인스턴스에만 적용된다"고 밝혔으므로:

1. 인스턴스 A에서 `A → B` 이동 (A의 캐시만 갱신)
2. 곧이어 인스턴스 B로 라우팅된 요청에서 `B → A` 이동 → B의 캐시엔 아직 옛 부모 → **사이클 미검출 → 데이터에 사이클 기록**

동시 관리자 2명이 필요 없다. **한 사람이 빠르게 두 번 옮기기만 하면 된다.** N2의 낙관적 DnD는 "조직개편 시 여러 팀을 연속으로 옮기는 것이 사용 맥락"이라고 명시했으므로 발생 확률이 낮지 않다.

읽기 측 방어(루트 강등 + `hasCycle`)가 있어 치명적이진 않다 — 하지만 사용자에겐 "정상적으로 옮겼는데 트리가 깨졌다"로 나타나고, `hasCycle` 배너는 원인을 설명하지 못한다.

**고침**: `addTeam`/`updateTeam`/`deleteTeam`의 검증만 **캐시를 우회한 즉시 로드**로 한다(`buildTeamIndex(await findAllPaged())`). 팀 쓰기는 빈도가 극히 낮아 비용이 무시 가능하다. 설계서에 **"쓰기 경로는 `TeamTreeCache`를 쓰지 않는다"**를 §R1 캐시 문단에 명문화할 것. (읽기 90초 stale은 그대로 수용.)

### M2. "팀 평균 가동률"이 **화면마다 다른 산식** — 카테고리 B의 실제 사례

| 위치 | 설계서 지시 | 실제 계산 |
|---|---|---|
| §R5 표 #1 `/resource` 인력현황 | "팀별 … **평균 가동률**" | util 원천이 배치 rollup의 **인당 값**(`ResourceManagementService.js:76` `utilizationPeople[].util`) → 팀 집계는 자연히 **산술평균** |
| §R5 표 #2 포트폴리오 | "팀별 **평균 가동률**" | 동상 |
| §6-8 N3-1 인력 분석 리포트 | "가동률은 `ΣtotalMd / ΣeffectiveMmDays`로 **재계산**(개인 가동률의 평균이 아니다 — 인원별 분모가 다르므로 **평균을 내면 틀린다**)" | 가중 Σ/Σ |

**설계서가 한 곳에서 "평균은 틀렸다"고 선언하고 다른 곳에서 평균을 지시한다.** 같은 팀·같은 기간인데 `/resource`와 프로젝트 리포트의 숫자가 다르게 나온다. §N4가 "전사 vs 프로젝트별은 스코프가 달라 값이 다른 것이 정상"이라고 정리한 것과는 **다른 문제**다 — 이건 스코프가 아니라 산식이 다른 것이다.

**고침**: 가중 Σ/Σ로 통일. `aggregateByTeam`의 `avgFields`를 **"가중평균 전용"으로 정의**하고 단순평균 옵션을 API에 아예 두지 않는다(두면 언젠가 쓰인다). 배치 rollup에 분모(`effectiveMmDays`)가 없어 가중이 불가능하면 **라벨을 분리**하고(`팀 인원 평균 가동률` vs `팀 가동률`) InfoTip에 산식을 적는다.

### M3. "팀 미지정" 필터가 **조용히 전체를 반환**한다

`src/rdb/query/QueryBuilder.js:34-38` — `whereEq(col, value)`는 `null`/`undefined`면 조건을 버린다.

§8은 이 성질을 **완화책**으로 적었다("`whereEq`는 `undefined/null`이면 조건을 무시하므로 기존 호출부 무변경"). 맞다. 그런데 같은 성질이 §R6의 요구와 정면 충돌한다:
> 분석 화면의 팀 필터 | "팀 미지정" 항목을 **명시적 옵션으로 제공**(`teamKey: null` 그룹). 숨기지 않는다 — 숨기면 합계가 안 맞는다

사용자가 "팀 미지정"을 고르면 `whereEq('team_key', null)` → 조건 없음 → **전 사용자 목록**이 나온다. 필터가 걸린 줄 알고 숫자를 읽게 된다.

**고침**: 센티넬(`'__NONE__'`) → repository에서 `whereRaw('team_key IS NULL')` 분기하거나 `QueryBuilder.whereIsNull(col)` 추가. **§3 계약 표에 팀 필터 입력값 도메인을 명시할 것**: `teamKey: string | '__NONE__' | undefined(=전체)`. 이 세 상태를 구분하지 않으면 프론트/백엔드가 반드시 갈린다.

### M4. R3-B 마스킹의 실효성 — 같은 사람의 재무 정보가 **인접 경로로 이미 열려 있다**

- `findProjectusersByProjectId` = `R('PROJECT','detail')` (`PermissionMap.js:89`)
- Member 세트는 `PROJECT: {read:true}` (`ResourceCatalog.js:49`)
- `ProjectUsersQuery.FIND_BY_PROJECT_ID:28-43`은 `salary`(투입급여)를 그대로 SELECT

즉 팀장(=일반 Member)은 **이미 프로젝트 인력 탭에서 팀원의 투입급여를 본다.** `users.salary`(연봉)만 마스킹하는 §R3-B는 방향은 옳지만 "재무 민감은 팀장에게 열지 않는다"는 선언을 충족하지 못한다.

이 문제는 P3-A에서 **확대**된다: N3-2가 인력 탭 팀 소계의 인건비 컬럼만 `canRead('PROJECT_COST')`로 게이팅하는데, **원본 행의 `salary`는 게이트 없이 계속 나간다**. 소계는 가리고 원자료는 보여주는 게이팅이 된다.

**고침**: 새 기능은 아니므로 U7~U9와 같은 급의 **기존 결함으로 §10에 기록**하고, N3-2 게이팅의 한계를 각주로 명시. (근본 수정은 별도 과제 — `findProjectusersByProjectId`의 salary를 `PROJECT_COST` read 없으면 마스킹하는 것이 정석이나, 급여 관리 탭·배정 보드가 같은 응답을 소비하므로 회귀면이 넓다.)

### M5. N1의 "1명이라도 밖이면 전체 거부"는 **정상 흐름에서 오탐**하고, 진단 정보가 없다

후보 목록(`getTeamMemberCandidates`)과 서버 검증(`descendantsOf`)이 **서로 다른 시점의 팀 인덱스**를 본다 — `TeamTreeCache` 60초 + React Query staleTime. 팀 이동·재부모화 직후, 또는 다른 관리자가 동시에 팀을 옮기면, 사용자가 화면에서 고른 사람이 서버 검증에서 탈락해 **요청 전체가 거부**된다.

설계서는 이 경우를 "클라이언트 버그이거나 위변조 시도"로 규정하는데, **정상적인 조직 개편 중에도 발생한다.** 게다가:
- 에러가 `TEAM_MEMBER_NOT_IN_SCOPE` 단일 코드이고 **어떤 계정이 문제인지 실리지 않는다.** 최대 500명 목록에서 사용자가 범인을 찾을 방법이 없다.
- i18n 문구 "선택한 인원 중 이 팀 소속이 아닌 사람이 있습니다"는 위변조 뉘앙스라, 정상 오탐 시 사용자를 혼란시킨다.

**고침**
1. `error.cause`에 위반 `accountId` 배열을 담고, 프론트가 해당 행을 하이라이트 + 자동 새로고침 유도.
2. 검증 시 팀 인덱스를 **캐시 우회 즉시 로드**(M1과 동일 처방 — 쓰기 경로 공통 규칙으로 묶으면 둘 다 해결).
3. 문구 정정: "N명의 팀 소속이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요."

전체 거부 정책 자체는 유지에 찬성한다(부분 성공이 더 나쁘다). 문제는 진단 가능성이다.

### M6. C1~C10 정규 케이스표는 **상수 드리프트를 못 잡는다**

§6-7은 "파일 경계상 픽스처를 공유할 수 없으므로 본 설계서의 표가 정규 출처"라고 정직하게 인정했다. 그런데 `MAX_TEAM_DEPTH = 10`은 프론트(`resolveTeamTreeDrop.js`)와 백엔드(`TeamTree.js`)에 **각각 리터럴로 존재**하게 된다.

백엔드만 12로 바꾸면: 백엔드 C8/C9 테스트는 함께 갱신되고, 프론트 테스트는 **여전히 통과한다**(10 기준에서도 초과이므로). 결과는 "서버는 허용하는데 UI가 막는" 조작 불가 — 대조 테스트가 있어도 못 잡는다.

**고침 (구조적 — 테스트보다 강함)**: 서버가 `getTeamList` 응답에 `content.limits: { maxDepth, maxTeams }`를 실어 보내고 프론트가 그 값을 쓴다. **상수 이중화 자체가 사라진다.** `truncated`/`hasCycle`을 응답에 실은 것과 같은 발상이다.

§R7의 상속 미리보기는 사정이 다르다 — 그건 상수가 아니라 **규칙 자체의 이중 구현**이라 동일 픽스처 대조 테스트가 최선이다. 설계서의 처방이 맞다. 다만 그 테스트가 실제로 갈림을 잡으려면 **"가장 가까운 조상 우선"이 깨지는 케이스**(중간 조상에 세트 있음 + 루트에도 세트 있음, 조상 체인 중간에 팀 미존재/사이클)가 픽스처에 반드시 포함돼야 한다. 현재 설계서에는 이 케이스표가 없다(C1~C10은 DnD 전용). **§R7용 정규 케이스표를 별도로 만들 것.**

### M7. 계약 테스트가 `teamLead` 축을 **검증하지 못한다**

- `test/permission/permissionMap.contract.test.js:131` "각 엔트리는 … 형태" 테스트는 추가 키를 허용만 한다. `teamLead.targets`가 **실제 payload 키인지**는 정적으로 알 수 없다 → **H2가 정확히 이 사각지대에서 나왔다.**
- 신규 resolver 12종의 매핑 누락은 (1)(2) 테스트가 잡는다 — **단, `collectRegisteredNames()`(:44-83)에 신규 컨트롤러 2줄을 추가했을 때만.** 설계서 §4-5는 "계약 테스트 동시 수정 필수 … 추가하지 않으면 (2) 고아 매핑 없음 테스트가 깨진다"고 썼는데, **부정확하다.** 컨트롤러를 등록 목록에 넣지 않으면 그 함수들은 `registeredSet`에 없고, `PermissionMap`에도 안 넣었다면 두 집합 모두에 없으므로 **테스트는 통과한다.** 런타임에서만 `PERMISSION_UNMAPPED`로 죽는다.

**고침**: 컨트롤러 등록 목록을 `src/index.js`에서 배열로 export 하고 테스트가 그것을 import 한다. 그러면 "index.js에 등록했는데 테스트 목록에 빠뜨림"이 구조적으로 불가능해진다. 지금은 같은 목록이 두 파일에 손으로 복제돼 있다 — **이것도 이중 구현이다.**

### M8. read 마스킹에는 **가시성 신호가 없다** (§R3-C의 비대칭)

§R3-C는 write의 조용한 실패를 `droppedFields`로 해결했다. 그런데 read 마스킹(§R3-B)에는 대응 신호가 없다.

팀장이 팀원 상세에서 `salary: null`을 보면 **"급여가 미입력됐다"와 "가려졌다"를 구분할 수 없다.** 설계서는 "팀장 경로에서는 해당 입력란 자체를 렌더하지 않는다"로 처리하려 하지만, H1에 따라 그 화면에 도달할 수 없고, 도달하더라도 프론트는 여전히 `grantedBy`를 모른다 — write에서 지적된 문제가 read에서 그대로 남았다.

**고침**: 응답에 `masked: ['salary','permissionKey']`를 함께 싣는다(`grantedBy==='RESOURCE'`면 `[]`). `droppedFields`와 완전 대칭이 되고, 프론트 게이팅과 서버 정책의 불일치를 양방향으로 검출할 수 있다.

---

## 4. Low / 확인 필요

**L1. `getTeamMemberCandidates`의 열람 범위** — `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'detail')`이면 프로젝트 스코프만 검증되고 `teamKey`는 검증되지 않는다. PROJECT read 보유자가 임의 팀 키로 **그 팀 전원의 이름·직무·등급**을 조회할 수 있다. §4-6의 "팀 이름은 민감정보가 아니다" 논리를 인원 명단까지 확장할지는 별개 판단. 최소한 "요청 `teamKey`가 해당 프로젝트에 배정된 팀이거나 요청자의 `scopeTeamKeys` 내"로 좁힐지 결정할 것. — **확인 필요(정책 판단)**

**L2. `getUserMetaCount.team` / 팀 이름 맵의 KVS 호출 경로** — §8은 "`roleLevelMap`에 팀 맵"이라고만 적었다. `roleLevelMap()`(`UserService.js:112-128`)은 `getUserListWithPagingService` → `prepareUserMappingContext`에서 **사용자 목록 조회마다** 호출된다. 여기에 무캐시 `findAllPaged()`를 넣으면 목록 조회마다 KVS 커서 루프가 돈다. **`TeamTreeCache`(60초) 재사용을 설계서에 명시할 것.**

**L3. 단계 독립 배포 논증 — 결론은 성립하나 조건이 붙는다**

| 조합 | 판정 | 조건 |
|---|---|---|
| P0만 | 권한 판정 무변경 주장은 **맞다**. 단 **C1의 `teamKey` NULL 덮어쓰기가 P0에 이미 들어있다** — 관리자 일상 조작에서 P0에서 터진다 | C1 선결 |
| P0+P1 | TEAM_ONLY UI가 열리는데 `PrincipalResolver.normalizeScope` 미수정이면 **C2로 fail-open** | C2 선결. P1 완결 조건에 명시 |
| P0+P1+P2 (P3 없이) | **깨지는 화면 없음.** N1은 P3와 무관하게 완결된다(결과물이 `projectusers` 행 추가뿐, `project_team` 미접촉 → S5 유지) — 이 논증은 코드로 확인했고 성립한다 | — |
| P3-B 단독 | 프론트 전용·백엔드 의존 0 주장 **성립**(`updateTeam`은 P0에 존재). 언제 배포해도 무방 | M6의 `limits` 응답을 P0에 넣어두면 더 깔끔 |
| P1 과도기 규칙 (TEAM_ONLY = `projectusers` 경로만) | **권한 구멍 없음.** `project_team` 합집합을 빼면 스코프가 **좁아지는** 방향 = fail-close | 단, §9 P1 체크리스트에 `ProjectTeamRepository.findProjectIdsByTeamKeys` 항목이 남아 있어(괄호로 "P1에서는 호출 안 함"이라고만 적힘) 구현자가 P2 테이블을 참조하는 코드를 미리 넣을 여지가 있다. **항목 자체를 P2로 옮길 것** |

---

## 5. 잘 된 부분 (코드 대조 결과 주장이 정확했던 것)

지면을 아끼기 위해 짧게 적는다. 아래는 **실측으로 확인했고 그대로 진행해도 되는** 것들이다.

- **N1의 `insertProjectusersService` 재사용 근거 정확.** `ProjectUsersQuery.INSERT:4-27`은 실제로 `INSERT ... SELECT ... WHERE NOT EXISTS(...) AND account_id IN`이라 완전 멱등이고, `users.role_key/level_key/salary`를 복사한다. "기존 단건 추가와 의미 100% 동일"은 참이다.
- **N3-3의 "백엔드 3줄" 주장 정확.** `CostCalculator.groupCostByKey:92-108`은 `m[keyField] ?? null`이라 `'teamKey'` 교체만으로 `byRole`/`byLevel`과 동형 shape이 나오고, **팀 미지정이 `key:null` 그룹으로 자동 처리**된다.
- **`byIssue[].byMember` 롤업 금지 경고의 근거가 정확하다** — top-down `Σsalary×scheduleRate`와 worklog 기반 배분은 총액이 실제로 어긋난다.
- **플랫폼 제약 실측 일치**: KVS 엔티티 11종(`manifest.yml`) → 12종, 한도 내. `migrate.js:36`의 마지막이 `v012`이므로 `v013`/`v014` 번호 정확. `ResourceCatalog` 16키 → 17 정확. `migrateFrom` 미지정 판단(권한 자동 확대 차단) 타당.
- **`responseWrapper`(`src/utils/ResponseWrapper.js:16-21`)의 `{success:true, ...result}` 스프레드 계약**과 §3의 `{success:true, content:{...}}` 규약이 정합. `updateUser`에 `content` 추가는 실제로 무회귀.
- **S6(스냅샷 무변경) 근거 4가지 전부 타당.** 특히 "팀 이동이 다음 일 배치까지 반영되지 않는다"는 read-time 조인 채택의 결정적 근거로 옳다.
- **§R1의 캐시 stale 재작성**(1차 리뷰 #3 반영분)은 정직하고 정확하다. "정확성은 캐시에 의존하지 않는다를 이 캐시에 쓰지 말 것"이라는 금지 조항은 좋은 문서화다. — 다만 **쓰기 경로**까지는 다루지 않았다(M1).
- **트랜잭션 부재 인식이 일관적이다.** "원자적"을 전제한 곳은 발견되지 않았다. `deleteTeam`의 순차 멱등 순서(자식→부모)는 `deleteProjectService`(`ProjectService.js:88-105`)의 확립된 패턴과 정확히 동형이고, `is_primary` 유일성을 DB 제약이 아니라 서비스가 보장한다고 명시한 것도 옳다.

---

## 6. 착수 전 처리 순서 (권고)

1. **C1 · C2 · C3** — 코드 수정 없이 설계서 조항만으로 해소 불가. 세 건 다 "설계서가 참이라고 적은 문장이 코드에서 거짓"인 경우다. 수정 방침을 확정한 뒤 P0 착수.
2. **H4** — 요구사항 커버리지 판단. 비목표 선언이든 구현이든 **지금** 정해야 단계 산정이 흔들리지 않는다.
3. **H1 · H2 · H3** — P2 착수 전. 팀장 기능의 진입 화면을 먼저 정하지 않으면 서버 축만 만들고 끝난다.
4. **M1 · M5** — "팀 쓰기 경로는 캐시를 우회한다"는 한 줄 규칙으로 둘 다 해결된다.
5. **M2 · M3 · M6 · M8** — 계약 표·i18n·응답 필드 수준의 수정이라 비용이 낮다. 지금 넣는 편이 싸다.
6. **M4 · L1 · L2 · L3** — 문서화/정책 판단.

> 마지막으로: 이 설계서는 1차 리뷰 7건을 성실히 반영했고, 자기 한계를 숨기지 않는 태도(캐시 stale, 팀 이동 귀속, U7~U9 기존 결함 보고)가 일관된다. 위 결함들은 **설계 능력의 문제가 아니라 "재사용한다"고 선언한 기존 코드의 시맨틱을 끝까지 열어보지 않은 데서 나왔다.** C1(UPDATE가 NULL을 쓴다), C2(정규화가 3벌이다), C3(빈 IN이 조건을 버린다) 셋 다 해당 파일을 한 번 더 읽었으면 잡혔을 것이다. 향후 설계 단계에 **"재사용 대상 함수의 미전달/빈값 시맨틱을 확인한다"**를 체크 항목으로 넣을 것을 권한다.
