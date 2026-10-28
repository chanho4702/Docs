# 팀(Team) 기능 P0/P1/P2 — 백엔드 구현 리포트

> **📍 절 구성**: `# P0`(마스터/소속) → `# P1`(권한 확장) → `# P1-B`(검증 후속 O1·O3) → `# P1-C`(권한 세트 시드)
> → `# P2-a`(프로젝트-팀 배정) → `# P2-b`(N7 내 팀 분석 + N5 캘린더 팀 필터) → **`# P2-c`(N6 팀 비교 + U12 인건비 게이트)**.
>
> **🚨 최우선 — §P2-c-00: HEAD 가 깨져 있다.** 작업 중 커밋이 편집 중간 상태를 잡아가
> `ProjectDashboardService.js` 가 **미추적 파일 `CostAccess.js` 를 import** 한다. clean checkout 시 앱 로드 실패.
> 로컬 테스트(682건 통과)로는 잡히지 않는다. 조치는 §P2-c-00.
>
> **🔴 배포 담당자 필독 2건**
> 1. **§P2-a-0** — `v014` 마이그레이션과 코드 배포 순서 문제로 **실기동 장애가 났다.**
> 2. **§P2-c-0** — **기존 동작이 축소된다.** 일반 사용자 대다수가 `/dashboard` 에서 인건비를 못 보게 된다.
>    **서버만 배포하고 프론트 게이팅을 안 내면 "₩0" 이 상시 노출된다** — 지금보다 나쁜 상태다.
>
> **프론트가 먼저 읽을 것**: §P1-0(P1 계약 5건) · §P2-a-1(P2-a — 기존 계약 변경 1건 + 신규 resolver 4종)
> · §P2-b-0(P2-b — 신규 resolver 1종 + 캘린더 2필드 + 🔴 반드시 지킬 3가지)
> · **§P2-c-1(P2-c — `costMasked` + 급여 3필드 키 제거 + H-2 `teamMeta` 3층 규칙)**.
> - `# P1-B`·`# P1-C` 는 응답 계약 변경 0건이다.
> - `# P1-B` 요지: `removeProjectMemberByAccount` 팀장 축을 **P2 로 연기**(판단 근거 3 + blast radius 표),
>   C2 재복제 검출기를 **5패턴으로 보강**(실제 파일을 심어 실효성 확인).
> - `# P1-C` 요지: 대표 역할 세트 **4종(PM/PMO/Team Lead/Team Member) 시드**. `SEED_VERSION` 8→9.
>   **최초 1회만 생성**하며 조직이 지우면 되살리지 않는다(별도 프로비저닝 원장). 운영 안내는 §P1-C6.

---

# P0 — 팀 마스터 + 소속

> 작성: 2026-07-27 / backend-engineer (**2차 개정** — 통합 검증 F1/F2/F3 대응 반영)
> 입력: `01_architect_design.md`(§3 경계면 계약, §9 P0, §12/13/14), `03_verify_report.md`(통합 검증)
> 범위: **P0(팀 마스터 + 소속) 백엔드만.** P1(TEAM_ONLY·팀 상속·팀장) / P2(프로젝트 배정) / P3(심화 분석·DnD)는 손대지 않았다.

---

## 0-A. 2차 개정 (통합 검증 F1/F2/F3 대응) — **프론트 재작업 필요 여부**

> 검증 리포트: `03_verify_report.md` — 실패 3건은 전부 백엔드 응답이 근본 원인이었다. **3건 모두 백엔드에서 수정했다.**

### 🟢 프론트 **필수 재작업: 1건** (F2 후속) / 🟡 **선택(권장): 2건**

| # | 프론트 조치 | 필수? | 내용 |
|---|---|---|---|
| 1 | `useTeamEditModal` 의 **`ancestors` 유도 제거** | **필수** | `findTeamById.content.team.parentTeamName` 을 직접 쓴다. 아래 F2 참조 — 유도 코드를 남겨두면 UUID 노출이 그대로 남는다 |
| 2 | `buildTeamTree` 사이클 방어 + 회귀 테스트 | 권장 | **백엔드 수정만으로 F1 은 해소된다**(응답에 사이클이 더 이상 실리지 않는다). 다만 방어는 이중으로 두는 편이 낫고, 검증자가 지적한 `buildTeamTree.js:15-19` **주석의 잘못된 전제는 이제 참이 되었으니** 주석은 그대로 둬도 된다 |
| 3 | `TeamDetailPanel` 의 "최상위 팀" 오표기 분기 | 권장 | 강등 노드 판별용으로 `team.isDemoted` · `teams[].demotedKeys` 를 새로 실어 보낸다(아래) |

**프론트 응답 소비 코드가 깨지는 변경은 없다.** 전부 **필드 추가** 또는 **이상 데이터에서만 값이 바뀌는 정규화**다. 정상 트리에서는 응답이 1바이트도 달라지지 않는다.

### F1 (High) — 사이클 노드의 `parentTeamKey` 를 `null` 로 정규화 ✅

**근본 원인**: `buildTeamIndex` 는 사이클 노드를 **내부 `parentOf` 에서만** 루트로 강등하고, 응답에는 KVS raw `parentTeamKey` 를 그대로 실었다. 그래서 `depth:0`(루트)인데 `parentTeamKey` 가 non-null 인 **자기모순 응답**이 나갔고, 프론트가 `parentTeamKey` 로 트리를 재구성하며 사이클을 복원해 서브트리가 화면에서 사라졌다.

**수정**:
1. `TeamTree.buildTeamIndex` 가 **유효 부모 맵 `parentOf`** 와 **강등 목록 `demotedKeys`** 를 반환한다. 헬퍼 `effectiveParentKey(index, teamKey)` 신설.
2. `getTeamList` · `getTeamOptions` · `findTeamById` 가 **전부 `effectiveParentKey()` 를 쓴다.** raw 값을 응답에 싣는 경로가 없어졌다.
3. 원본 부모는 **별도 필드 `rawParentTeamKey`** 로 분리했다(한 필드에 두 의미를 담지 않는다). 사이클 복구 UX 에서 "원래 상위: X" 를 설명할 수 있다.

→ `depth` 와 `parentTeamKey` 가 **같은 사실**을 말한다. 검증자의 실측 입력(`a↔b`, `c(parent=a)`, `d`)으로 회귀 테스트를 걸었다(§3-A).

**강등 대상 3종**(`demotedKeys`): 사이클 구성원 · 자기참조 · 손상 부모키(dangling). `cycleKeys` 는 이 중 사이클만이므로 `demotedKeys ⊇ cycleKeys` 다.

### F2 (Medium) — `findTeamById.content.team.parentTeamName` 추가 ⚠ **경계면 계약 변경**

**계약 표(설계서 §3)에 없던 필드를 추가한다. 필드 추가만이라 무회귀지만 프론트가 소비 경로를 바꿔야 한다.**

```js
// findTeamById.content.team — 신규 4필드
parentTeamName: "개발본부" | null,    // ★ 프론트는 ancestors 유도를 버리고 이 값을 쓴다
rawParentTeamKey: "team-…" | null,   // 진단용 원본(강등 사유 설명)
isDemoted: false,                    // 사이클/자기참조/손상으로 루트 강등됐는가
leaderEmail: "a@b.com" | null,       // O1 대응
```

- `parentTeamName` 은 **유효 부모 기준**이라 `parentTeamKey` 와 항상 짝이 맞는다. 강등 노드는 둘 다 `null`.
- 프론트는 `useTeamEditModal.js:61,65-67` 의 `ancestors[ancestors.length-1]` 유도와 `?? team.parentTeamKey` 폴백을 **삭제**하고:
  ```js
  parent: team.parentTeamKey ? { value: team.parentTeamKey, label: team.parentTeamName } : null,
  ```
  → 원시 UUID 가 렌더될 경로가 사라진다. (백엔드 정규화만으로도 강등 노드는 `parentTeamKey:null` 이라 UUID 는 안 나오지만, 유도 코드가 남아 있으면 향후 같은 함정이 재발한다.)
- `ancestors` 는 그대로 둔다(브레드크럼 용도).

### F3 (Medium) — 팀 CRUD 읽기 3종을 캐시 우회로 전환 ✅

**판단: 검증자 제안 (b)를 택하되 범위를 하나 넓혔다.**

| resolver | 변경 | 근거 |
|---|---|---|
| `getTeamList` | `getTeamIndex()` → **`loadTeamIndexFresh()`** | 팀 생성 직후 목록에 안 보이고 → 재생성 → `TEAM_NAME_DUPLICATED`("만든 적 없는데 중복") |
| `findTeamById` | → **`loadTeamIndexFresh()`** | 수정 직후 상세가 옛 값 |
| `getTeamOptions` | → **`loadTeamIndexFresh()`** ← *검증자는 캐시 유지를 제안했으나 바꿨다* | **이 목록이 팀 등록/편집 모달의 "상위 팀" Select 를 채운다.** 캐시를 두면 "방금 만든 팀 밑에 하위 팀을 만들 수 없는" 60초 구간이 남는다 — 조직 개편은 연속 생성이 정상 사용 맥락이라 CRUD 화면의 read-after-write 결함이 그대로다. 프론트가 React Query 로 한 번 더 캐싱하므로 실제 호출은 페이지 로드당 1회이고, 팀 화면은 트래픽이 극소다 |
| `UserService.roleLevelMap()` | **캐시 유지(변경 없음)** | 사용자 목록 조회마다 도는 경로(L2). 여기서 캐시를 빼면 페이지네이션·필터 조작마다 KVS 커서 루프가 돈다 |
| `getTeamIndex()` 자체 (TTL 60초) | **변경 없음** | P1 권한 판정이 쓸 캐시다. 설계서 §R1 의 90초 stale 수용은 그 맥락이며 건드리지 않았다 |

**남은 stale 노출(수용, 문서화)**: 팀을 만든 직후 60초 안에 그 팀에 인원을 배치하면 **사용자 목록의 팀 이름 컬럼**이 잠시 비어 보일 수 있다. 소속(`teamKey`) 자체는 users SQL 에서 fresh 하게 오므로 **표시만의 문제**이고, 필터·집계는 정확하다.

**선택하지 않은 대안**: (a) 쓰기 응답에 갱신 목록을 실어 프론트가 캐시 패치 — 프론트 작업이 늘고, 목록/상세/옵션 3종을 각 write 응답에 실어야 해 계약이 비대해진다. (c) invalidate 만 — 다중 인스턴스에서 호출 인스턴스에만 적용돼 **문제를 해결하지 못한다**(이미 하고 있고, 그것만으로 부족해서 F3 가 났다).

### O1 (경미) — `leaderEmail` 을 응답에 실었다 ✅ (백엔드에서 처리)

`JiraUserSelect.UserSingleValue` 가 `data.email` 을 읽는데 편집 모달이 손으로 만든 leader 객체엔 없었다. `findTeamById.content.team.leaderEmail` 을 추가했으니 프론트는 leader 객체 조립 시 이 값을 넣으면 된다.
- 권한상 문제 없음: `findTeamById` 는 `TEAM_MANAGEMENT`/`USER_MANAGEMENT` read 게이트이고, 같은 게이트의 `searchUser` 가 이미 `emailAddress` 를 반환한다(`UserService.mapUser`).
- Jira 개인정보 설정에 따라 `emailAddress` 가 없으면 `null` 이다(에러 아님).
- `members[]` 에는 추가하지 않았다 — 팀원 목록은 `JiraUserSelect` 를 쓰지 않아 소비처가 없다.

---

## 0. 최상단 고지 — 계약과 달라진 점 / 프론트가 반드시 알아야 할 것

### ⚠ A. `updateUser` 의 "선택 해제"는 프론트가 `?? null` 을 보내야 한다 (설계서 §4-9의 무회귀 주장 정정)

설계서 §4-9는 read-merge 전환이 "**기존 호출부 무회귀** — 현재 프론트는 5필드를 항상 보내므로 동작이 100% 동일"이라고 적었다. **이 문장은 절반만 맞다.**

`useUserEditModal.js:104-108` 실측:
```js
roleKey:       editValues.role?.value,        // ← 선택을 비우면 role === null → 값은 undefined
permissionKey: editValues.permission?.value,
salary: editValues.salary === '' ? null : Number(editValues.salary),   // salary 만 명시적 null
```
- 기존 동작: `undefined → null` 이라 **선택을 비우면 컬럼이 해제**됐다.
- read-merge 후: `undefined = 미전달 = 보존` 이므로 **선택을 비워도 해제되지 않는다.**

**불변식을 훼손하지 않고 고치는 유일한 방법은 호출부 수정이다.** 프론트는 P0에서 이 모달을 어차피 수정하므로(팀 Select 추가), 아래처럼 **명시적 null** 을 보내야 한다:
```js
roleKey:       editValues.role?.value       ?? null,
levelKey:      editValues.level?.value      ?? null,
permissionKey: editValues.permission?.value ?? null,
teamKey:       editValues.team?.value       ?? null,   // 신규
```
→ `null` = 해제, 키 자체를 안 보냄 = 보존. **P0 프론트 필수 항목이다.**

### B. 그 외 계약 대비 차이 (전부 "설계서 미기재분 보강" 또는 "P2 의존 항목")

| 항목 | 설계서 | 실제 구현 | 이유 |
|---|---|---|---|
| `deleteTeam.removedProjectAssignCount` | `project_team` 삭제 건수 | **항상 `0`** (키는 존재) | `project_team` 테이블은 P2(v014)다. P0에는 테이블이 없어 대상이 0건. shape 은 계약대로 유지 |
| `getTeamList.teams[]` | 필드 목록만 명시 | `sortOrder` 를 **응답에 포함** | 계약 표의 `updateTeam` 입력에 `sortOrder` 가 있는데 읽을 경로가 없었다(편집 모달이 현재값을 알 수 없음) |
| `getTeamList` / `findTeamById` / `getTeamOptions` 의 `parentTeamKey` | KVS 원본 | **유효 부모(강등 반영)** + 원본은 `rawParentTeamKey` 로 분리 | **F1** — 정상 트리에서는 값이 동일하다. 이상 데이터에서만 달라진다 |
| `getTeamList` | — | `demotedKeys` 추가 | **F1** — `cycleKeys` 는 사이클만 담아 자기참조·손상 부모키를 프론트가 식별할 수 없었다 |
| `findTeamById.content.team` | — | `parentTeamName` · `rawParentTeamKey` · `isDemoted` · `leaderEmail` 추가 | **F2 · O1** — §0-A 참조. **프론트 소비 경로 변경 필요(필수 1건)** |
| `addTeam` 이름 중복 검사 | `findByWhere('name', name)` 패턴 재사용 | **즉시 로드한 인덱스로 검사** | M1 규칙(쓰기 경로는 캐시를 쓰지 않는다)에 따라 이미 전량을 fresh 로드한다. 같은 데이터를 KVS 에 한 번 더 물을 이유가 없다 |
| `updateTeam` | — | **미전달 필드 보존(read-merge)** | C1 불변식과 같은 원칙. payload 일부만 보내는 프론트 호출에서 설명/팀장/정렬이 날아가지 않는다 |
| `downloadExcel` | 팀 필터 적용 대상 | 필터 + **엑셀에 `Team` 컬럼 추가** | 필터만 걸고 결과에 팀이 없으면 사용자가 확인할 수 없다 |

### C. 배포 순서 (반드시 지킬 것)

1. **`forge deploy` 를 먼저 한다.** `manifest.yml` 에 KVS `team` 엔티티를 선언했다. 미배포 상태에서 `addTeam` 을 호출하면 **422 semantic error** 가 난다.
2. `runMigration`(v013)은 `init-db` 스케줄 트리거 · `onInstall` · `ensureSeed()` 3경로에서 자동 실행된다. `ADD COLUMN IF NOT EXISTS` 라 멱등.
3. `SEED_VERSION` 을 7 → 8 로 올렸다. 첫 `userPermissionCheck` 호출 시 `ensureSeed()` 가 시드 Admin/Member 를 재생성하고 커스텀 세트에 `TEAM_MANAGEMENT:{false,false}` 를 보충한다.
   - Jira ADMINISTER 보유자는 `PrincipalResolver` 가 `getSeedPages('admin')`(카탈로그 파생)을 쓰므로 **재시드 전에도 즉시 통과**한다.

---

## 1. 구현한 resolver — 함수명 + 실제 응답 shape (글자 그대로)

> 공통: `guardedDefine` 이 `responseWrapper` 를 흡수한다. 서비스는 `{ content: ... }` 를 반환하고
> 최종 응답은 `{ success:true, content:{...} }`. 실패는 `{ success:false, error:{ name, code, message, cause } }`.
> 프론트는 **반드시 `res?.success` 를 먼저 확인**한 뒤 `res.content` 를 읽는다.

### 1-1. 신규 8종 — `src/resolver/backoffice/team/TeamController.js`

#### `getTeamList` — payload `{}`
```js
{
  success: true,
  content: {
    teams: [                          // 트리 전위 순회(루트→자식, sortOrder→name 정렬). 평면 배열이다.
      {
        teamKey: "team-<uuid>",
        name: "개발팀",
        parentTeamKey: "team-<uuid>" | null,   // ★ 유효 부모(강등 반영). 루트/강등 노드면 null — depth 와 항상 정합
        rawParentTeamKey: "team-<uuid>" | null,// KVS 원본. 강등되지 않았으면 parentTeamKey 와 동일
        depth: 0,                              // 루트 = 0
        sortOrder: 0,
        description: "설명" | null,
        leaderAccountId: "5b10..." | null,
        leaderName: "홍길동" | null,            // Jira 조회 실패/미지정이면 null (에러 아님)
        leaderAvatarUrls: { "48x48": "..." } | null,
        permissionKey: "permission-<uuid>" | null,
        permissionName: "Member" | null,
        memberCount: 3,                        // 그 팀 직속 인원
        descendantMemberCount: 12              // 자기 팀 포함 서브트리 전체 인원
      }
    ],
    unassignedCount: 5,                        // team_key IS NULL 인원 수
    hasCycle: false,
    cycleKeys: [],                             // 사이클에 속한 teamKey
    demotedKeys: [],                           // 루트로 강등된 전체 집합 = 사이클 ∪ 자기참조 ∪ 손상 부모키 (⊇ cycleKeys)
    truncated: false,                          // MAX_TEAMS 도달로 수집이 잘렸는가(정상 상태에선 항상 false)
    limits: { maxDepth: 10, maxTeams: 500 }    // M6 — 프론트는 여기서만 읽고 리터럴 상수를 두지 않는다
  }
}
```

#### `findTeamById` — payload `{ teamKey }`
```js
{
  success: true,
  content: {
    team: {
      teamKey, name,
      parentTeamKey: string | null,            // 유효 부모(강등 반영)
      parentTeamName: string | null,           // ★ F2 신규 — 프론트는 ancestors 유도 대신 이 값을 쓴다
      rawParentTeamKey: string | null,         // ★ 신규 — KVS 원본(강등 사유 설명용)
      isDemoted: false,                        // ★ 신규 — 사이클/자기참조/손상으로 루트 강등됐는가
      sortOrder: 0,
      description: string | null,
      leaderAccountId: string | null,
      leaderName: string | null,
      leaderEmail: string | null,              // ★ O1 신규 — Jira 개인정보 설정에 따라 null 일 수 있다
      leaderAvatarUrls: object | null,
      permissionKey: string | null,
      permissionName: string | null
    },
    ancestors: [ { teamKey, name } ],          // 루트 → 부모 순서. 루트 팀·강등 노드면 []
    children:  [ { teamKey, name, memberCount } ],
    members:   [ {
      accountId, userName, userAvatarUrls,     // Jira 조회 실패 시 userName/Avatar = null
      roleKey, roleName, levelKey, levelName,  // 미지정이면 각각 null
      isLeader: false
    } ]
  }
}
```
에러: `teamKey` 미전달 → `TEAM_KEY_REQUIRED`, 없는 팀 → `TEAM_NOT_FOUND`.

#### `getTeamOptions` — payload `{}`
```js
{ success: true, content: {
    options: [ { value: "team-<uuid>", label: "개발팀", depth: 1, parentTeamKey: "team-<uuid>"|null } ],
    truncated: false
} }
```
`parentTeamKey` 는 `getTeamList` 와 동일하게 **유효 부모(강등 반영)** 다.

#### `addTeam` — payload `{ name, parentTeamKey?, leaderAccountId?, permissionKey?, description? }`
```js
{ success: true, content: { teamKey: "team-<uuid>" } }
```
에러: `TEAM_NAME_REQUIRED` / `TEAM_NAME_DUPLICATED` / `TEAM_NOT_FOUND`(상위 팀 없음) / `TEAM_DEPTH_EXCEEDED` / `TEAM_LIMIT_EXCEEDED`.

#### `updateTeam` — payload `{ teamKey, name?, parentTeamKey?, leaderAccountId?, permissionKey?, description?, sortOrder? }`
```js
{ success: true }        // content 없음
```
- **미전달(키 부재) 필드는 변경되지 않는다. 명시적 `null` 은 해제다.**
- 에러: `TEAM_KEY_REQUIRED` / `TEAM_NOT_FOUND` / `TEAM_NAME_REQUIRED` / `TEAM_NAME_DUPLICATED` / `TEAM_CYCLE_DETECTED` / `TEAM_DEPTH_EXCEEDED`.
- 깊이 검증은 **서브트리 높이까지 합산**한다(자기 깊이만 보면 자식이 한계를 넘는다).

#### `deleteTeam` — payload `{ teamKey }`
```js
{ success: true, content: {
    detachedUserCount: 5,          // team_key 가 해제된 인원
    reparentedTeamCount: 2,        // 조부모로 승격된 직속 하위 팀 수
    removedProjectAssignCount: 0,  // ★ P0 에서는 항상 0 (project_team 은 P2)
    permissionLostCount: 2,        // 해제 인원 중 '팀 상속'이라 전 권한을 잃는 인원 (H5)
    inheritanceChangedCount: 3     // 후손 팀 상속자 중 실효 세트가 바뀌는 인원 (H5)
} }
```
- `permissionLostCount` 정의(설계서보다 엄격): `permission_key IS NULL` 인 팀원 중 **현재 실제로 상속받고 있던** 인원만 센다. 조상 체인에 세트가 하나도 없어 원래부터 권한이 없던 사람은 "잃은" 것이 아니므로 제외한다.
- `inheritanceChangedCount`: 삭제 후 트리를 시뮬레이션(자식 재부모화 반영)해 후손 팀별 `nearestAncestorWith` 결과를 전후 비교하고, 달라진 팀의 상속자 수를 합산한다.

#### `assignUsersToTeam` — payload `{ teamKey, accountIds: [] }`
```js
{ success: true, content: { movedCount: 3 } }
```
- 빈 배열이면 **UPDATE 를 발행하지 않고** `{ movedCount: 0 }`. 중복/falsy accountId 는 제거 후 전달.
- 에러: `TEAM_KEY_REQUIRED` / `TEAM_NOT_FOUND`.

#### `unassignUsersFromTeam` — payload `{ accountIds: [] }`
```js
{ success: true, content: { removedCount: 3 } }
```
- 빈 배열이면 UPDATE 미발행 + `{ removedCount: 0 }`.

### 1-2. 기존 resolver 응답 확장 (필드 추가만, 기존 필드 불변)

| resolver | 추가 | 위치 |
|---|---|---|
| `getUserListWithPaging` | `teamKey: string\|null`, `teamName: string\|null` | `content[i]` — `roleKey/roleName` 바로 다음 |
| `findUserByAccountId` | `teamKey: string\|null`, `teamName: string\|null` | 루트 반환 객체 |
| `getUserMetaCount` | `team: [{ id, name, count }]` | 루트. `id:null, name:'Unassigned'` = 팀 미지정(role/level/permission 과 동일 규약) |
| `addUser` | 입력 `formData.team = { value }` 또는 `formData.teamKey` 수용 | payload |
| `updateUser` | 입력 `teamKey` 수용 (`null` = 해제) | payload |
| `downloadExcel` | 입력 `team = { value }` 필터 + 엑셀 `Team` 컬럼 | payload / 파일 |

`getUserMetaCount` 실제 응답:
```js
{ success: true, permission: [...], role: [...], level: [...], team: [ { id: "team-<uuid>"|null, name: "개발팀"|"Unassigned", count: 3 } ] }
```
(이 resolver 는 `content` 래퍼가 없다 — 기존 구조 그대로 유지)

### 1-3. 팀 필터 입력 규약 (3상태 — `null` 금지)

`getUserListWithPaging` 은 `searchParams.team?.value` 를, `downloadExcel` 은 `team?.value` 를 읽는다.

| 값 | 의미 | 백엔드 처리 |
|---|---|---|
| 키 부재 / `undefined` | 전체 | 조건 미적용 |
| `'team-<uuid>'` | 해당 팀 | `whereEq('team_key', key)` |
| `'__NONE__'` | **팀 미지정** | `whereRaw('team_key IS NULL')` |

**`null` 을 보내면 필터가 조용히 사라져 전체가 반환된다**(`QueryBuilder.whereEq` 가 null 을 조건 무시로 처리). 프론트 Select 의 "팀 미지정" 옵션 `value` 는 문자열 `'__NONE__'` 이어야 한다. 백엔드 단일 출처: `src/resolver/backoffice/team/TeamTree.js` 의 `TEAM_FILTER_NONE`.

### 1-4. 권한 매핑 (`PermissionMap`) — 전 8키 등록 완료

```js
getTeamList:            OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read']]),
findTeamById:           OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read']]),
getTeamOptions:         OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read'],
                            ['RESOURCE_MANAGEMENT','read'], ['REPORT','read'], ['PROJECT','read']]),
addTeam / updateTeam / deleteTeam / assignUsersToTeam / unassignUsersFromTeam: W('TEAM_MANAGEMENT'),
```
- 카탈로그 신규 키 `TEAM_MANAGEMENT` (SETTINGS 섹션, `USER_MANAGEMENT` 바로 다음). 16 → **17키**.
- `migrateFrom` 미지정 — 기존 `USER_MANAGEMENT` write 보유자에게 팀 편집 권한이 자동으로 생기지 않는다.
- 프론트 게이트: `canRead('TEAM_MANAGEMENT')` / `canWrite('TEAM_MANAGEMENT')`.

---

## 2. 변경/신규 파일 목록

### 신규 (9)
| 파일 | 내용 |
|---|---|
| `src/resolver/backoffice/team/TeamTree.js` | 순수 함수 — `buildTeamIndex`(→ `parentOf`·`demotedKeys` 포함) / `descendantsOf` / **`effectiveParentKey`** / `isDescendant` / `nearestAncestorWith` / `subtreeHeight` / `flattenTeamIndex`, 상수 `MAX_TEAM_DEPTH`(10) · `MAX_TEAMS`(500) · `TEAM_FILTER_NONE`('__NONE__') |
| `src/resolver/backoffice/team/TeamTreeCache.js` | `getTeamIndex()`(TTL 60초 읽기 캐시) / `loadTeamIndexFresh()`(쓰기 검증용 즉시 로드) / `invalidateTeamIndex()` / `toTeam()` |
| `src/resolver/backoffice/team/TeamRepository.js` | `users.team_key` SQL 6종 + **빈 집합 가드** |
| `src/resolver/backoffice/team/TeamService.js` | 비즈니스 로직 8종 |
| `src/resolver/backoffice/team/TeamController.js` | `registerTeamController(resolver)` — guardedDefine 8 |
| `src/resolver/backoffice/team/__test__/TeamTree.test.js` | 계층/사이클/깊이/후손 + **nearestAncestorWith 정규 케이스표 P1~P8** |
| `src/resolver/backoffice/team/__test__/TeamRepository.test.js` | **C3 빈 집합 가드 — SQL 미발행까지 단언** |
| `src/resolver/backoffice/team/__test__/TeamService.test.js` | addTeam 가드 · updateTeam 사이클/깊이 · deleteTeam cascade 순서 + H5 카운트 |
| `src/resolver/backoffice/user/__test__/UpdateUserMerge.test.js` | **C1 read-merge 불변식 — repository mock 인자 레벨** |

### 수정 (11)
| 파일 | 변경 |
|---|---|
| `manifest.yml` | KVS `team` 엔티티 선언(attributes 7 + `indexes: - name`). 11 → **12 엔티티** |
| `src/rdb/schema/ddl/users.sql.js` | `ALTER_USERS_ADD_TEAM_KEY` 추가 |
| `src/rdb/schema/ddl/index.js` | 위 export 추가 |
| `src/rdb/schema/migrate.js` | `v013_alter_users_add_team_key` **체인 맨 아래에만** 추가(기존 이름/순서 불변) |
| `src/rdb/query/UserQuery.js` | `INSERT` 에 `team_key` / `UPDATE_USER_WITH_SALARY` 에 `team_key` / 신규 `TEAM_COUNT`·`TEAM_INHERIT_COUNT`·`UPDATE_TEAM_BY_ACCOUNTS`·`CLEAR_TEAM_BY_TEAM_KEY` / `UPDATE_USER` 는 `@deprecated` 주석만 |
| `src/nosql/query/CustomEntityManager.js` | `findAllPaged(indexName, pageLimit, maxItems)` 추가. **기존 `findAll()` 무변경** |
| `src/permission/ResourceCatalog.js` | `TEAM_MANAGEMENT` 카탈로그 엔트리 |
| `src/permission/PermissionMap.js` | team 8키 |
| `src/utils/errors/ErrorCodes.js` | `TEAM_*` 8코드 |
| `src/trigger/onInstall.js` | `SEED_VERSION` 7 → 8 |
| `src/index.js` | **`CONTROLLER_REGISTRARS` 배열 export (M7)** + `registerTeamController` |
| `src/resolver/backoffice/user/UserRepository.js` | `applyTeamFilter`(3상태) + `findUsersPagedRepository`/`findUsersRepository` 팀 필터 |
| `src/resolver/backoffice/user/UserService.js` | **C1 read-merge** + 팀 필드 전반 |
| `test/permission/permissionMap.contract.test.js` | 컨트롤러 28개 import/호출 복제를 `CONTROLLER_REGISTRARS` import 1줄로 대체 |

### 보존 확인 (되돌리지 않았음)
- `UserService.deleteByUserIdService` 의 **U11 앱 레벨 cascade** — 순서(projectusers → user_schedule → user_skills → users) 그대로. `UserDeleteCascade.test.js` 4건 계속 통과.
- `ProjectUsersQuery.FIND_BY_PROJECT_ID` / `UPDATE_BY_KEY_WITH_PARAMS` 의 `salary` 제거(U10) — 미접촉.
- `ProjectDashboardRepository.bulkUpdateLayoutsRepository` 예외 전파(U8) — 미접촉.
- `PrincipalResolver` — **1줄도 바꾸지 않았다.** P0 배포 판정("기존 권한 판정 코드 무변경") 충족.

---

## 3. `npm test` 결과 (원문 — 2차 개정 후)

실행: `npm test` (루트, jest)

```
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js (6.027 s)
PASS test/permission/permissionMap.contract.test.js (7.197 s)

Test Suites: 26 passed, 26 total
Tests:       449 passed, 449 total
Snapshots:   0 total
Time:        10.528 s
Ran all test suites.
```

- 착수 시점 **361 → 1차 434 → 2차 개정 449** (+15는 F1/F2/F3 회귀 가드). 실패 0, 스킵 0. **회귀 없음.**
- `StorageService.test.js` 의 `console.error` 출력은 **의도된 폴백 경로 테스트**의 기존 로그다(테스트는 PASS). 이번 변경과 무관.

### 3-A. F1/F2/F3 회귀 가드 (신규 15건) — **빌드·테스트로 안 잡히는 런타임 shape 불일치를 고정한다**

| 테스트 | 대상 | 단언 |
|---|---|---|
| `TeamTree.test.js` › F1 — parentOf/demotedKeys | `buildTeamIndex` | 사이클(a↔b) 두 노드 모두 `parentOf=null` ∧ `depth=0` / 사이클 구성원의 **자식 c 는 강등되지 않는다**(`parentOf='a'`, depth 1) / 자기참조·손상 부모키도 `demotedKeys` 포함 / **불변식: `depth===0` ⇔ `parentOf===null`** (전 노드 순회) |
| `TeamService.test.js` › F1 | `getTeamList`, `getTeamOptions` | **검증 리포트의 실측 입력 그대로**(`a(parent=b), b(parent=a), c(parent=a), d`) → 사이클 노드 `parentTeamKey:null` · 원본은 `rawParentTeamKey` 로만 노출 / **응답 전 행에서 `depth`↔`parentTeamKey` 정합** / **4팀 전부 응답에 남는다**(프론트에서 소실될 수 없다) |
| `TeamService.test.js` › F2 | `findTeamById` | 정상/루트/**사이클·자기참조·손상 부모키 3종**(`test.each`) → `parentTeamKey`·`parentTeamName` 이 **둘 다 null 로 짝이 맞고** `isDemoted:true`, `rawParentTeamKey` 는 보존 → **UUID 가 라벨 자리에 올 조합(`ancestors=[]` ∧ `parentTeamKey≠null`)이 더 이상 생성되지 않는다** |
| `TeamService.test.js` › F3 | 읽기 3종 | `loadTeamIndexFresh` **3회 호출** ∧ `getTeamIndex` **0회 호출**. 캐시 mock 은 호출되면 **throw** 하도록 만들어, 실수로 캐시 경로를 타면 값으로도 호출 단언으로도 잡힌다 |

### 3-B. 전체 신규 테스트 내역
| 파일 | 건수 | 핵심 |
|---|---|---|
| `TeamTree.test.js` | 32 | P1~P8 정규 케이스표 전건 / **F1 강등 정합성 5건** / 사이클 3노드 순환 종료 / 깊이 초과 제외 + `console.error` |
| `TeamRepository.test.js` | 20 | 5함수 × 빈값 3종 → **`executeQuery` mock 호출 0회** 단언 + 정상 입력 시 파라미터 순서 |
| `TeamService.test.js` | 27 | **F1 4건 · F2 5건 · F3 1건** / cascade 순서 `['save:teamA','save:teamB','clearUsers','delete:div']` / 500 off-by-one / 서브트리 높이 깊이 검증 / H5 카운트 |
| `UpdateUserMerge.test.js` | 8 | C1 불변식 (미전달 보존 · 명시적 null 해제 · UPDATE 미발행 조건) |

---

## 4. 설계서와 달라진 점 · 미구현 · 발견한 문제

### 4-1. 발견한 문제 — **팀 도입이 `users` 에 만드는 새 참조 (U11 관련 판단)**

> 지시: "팀 도입으로 `users` 에 자식이 늘어나는지 확인하고, 늘어난다면 U11 cascade 에 반영할지 판단해 근거를 남겨라."

**판단: P0 에서는 U11 cascade 를 변경하지 않는다. 단, P1 착수 전에 반드시 처리해야 할 항목 1건이 생겼다.**

| 방향 | 실태 | 판정 |
|---|---|---|
| `users` 의 **자식 행** | `users.team_key` 는 users **자기 행의 컬럼**이다. 사용자를 지우면 함께 사라진다. 새 자식 테이블 없음(`project_team` 은 P2이고 project↔team 매핑이라 users 의 자식이 아니다) | **U11 cascade 변경 불필요** ✅ |
| `users` 를 **가리키는 참조** | KVS `team.leaderAccountId` 가 accountId 를 가리킨다. 사용자 삭제 시 **stale 한 leaderAccountId 가 남는다** | P0 영향은 표시뿐 — `leaderName` 이 Jira 조회로 채워지므로 "이미 나간 사람이 팀장으로 보인다" 수준 |

**⚠ 그러나 P1 에서는 권한 문제가 된다.** P1 의 `principal.leadingTeamKeys` 는 `team.leaderAccountId === context.accountId` 로 계산된다. 백오피스에서 사용자를 삭제해도 **Jira 계정은 살아 있으므로**, stale leaderAccountId 를 가진 사람은 `users` 행이 없는데도 **`isTeamLead: true` 로 판정되어 팀장 권한을 유지한다.** 이는 "계정을 지웠는데 권한이 남는" fail-open 이다.

→ **P1 착수 전 처리 권고 (둘 중 하나):**
1. `deleteByUserIdService` 에 "삭제 대상이 리더인 팀의 `leaderAccountId` 를 `''` 로 정리" 단계를 추가(U11 cascade 확장). KVS 전량 로드 1회 + 해당 팀만 save. 사용자 삭제는 빈도가 낮아 비용 무시 가능.
2. 또는 `PrincipalResolver` 에서 `leadingTeamKeys` 를 계산할 때 **`users` 행 존재를 전제**로 한다(비등록 사용자는 어차피 `isUser:false` 경로).

P0 범위를 넘고 P1 권한 코드에 손대는 일이라 **이번에는 넣지 않았다.** 아키텍트/리더 판단 요청.

### 4-2. 설계서 서술 정정 2건

| 대상 | 설계서 | 정정 |
|---|---|---|
| §4-9 | read-merge 는 "기존 호출부 무회귀 — 프론트가 5필드를 항상 보내므로 동작 100% 동일" | **부분적으로만 맞다.** `?.value` 는 선택 해제 시 `undefined` 를 만들므로 "해제" 동작이 사라진다. 프론트가 `?? null` 로 보내야 한다(§0-A) |
| §4-9 | "SQL 무변경(`UPDATE_USER`/`UPDATE_USER_WITH_SALARY` 그대로)" | `team_key` 를 저장해야 하므로 `UPDATE_USER_WITH_SALARY` 에 컬럼 1개를 추가했다. 설계서의 취지(동적 SET 조립기를 만들지 않는다)는 지켰다. `UPDATE_USER` 는 미사용 전환(`@deprecated` 주석) |

### 4-3. 구현 판단 (설계서에 없어 내가 정한 것)

1. **`updateTeam` 의 깊이 검증에 서브트리 높이를 합산한다.** 설계서는 노드 깊이만 언급했으나, 높이 2짜리 서브트리를 깊이 9 아래로 옮기면 손자가 11이 된다. 자기 깊이만 보면 통과해 버린다. → `nextDepth + subtreeHeight(index, teamKey) > MAX_TEAM_DEPTH` 로 거부. 테스트 있음.
2. **`buildTeamIndex` 의 사이클 처리는 "사이클 구성원 전원 루트 강등"이다.** 설계서는 "해당 노드를 루트로 강등"이라고만 했다. 한 노드만 끊으면 나머지 사이클이 남을 수 있어 전원 강등으로 확정했다. 결과적으로 `descendantsOf(a)` 가 자기 자신만 반환해 **fail-close** 규정과 일치한다(P8 테스트).
3. **`permissionLostCount` 를 "현재 실제로 상속받던 인원"으로 좁혔다.** 원래 권한이 없던 사람까지 "잃었다"고 세면 삭제 확인 모달의 경고가 늑대소년이 된다.
4. **팀 이름 정렬 키는 `sortOrder → name → teamKey`.** 동점 시 순서가 흔들리면 프론트 트리가 매 조회마다 재배치된다.
5. **`TEAM_FILTER_NONE` 상수를 `TeamTree.js` 에 두었다.** 팀 도메인의 의존성 없는 모듈이라 `UserRepository` 가 import 해도 순환이 생기지 않는다. 별도 상수 파일을 만드는 것보다 파일 수가 적다.

### 4-4. 미구현 (P0 범위 밖 — 의도적)

- `src/permission/ProjectScope.js` (C2) — **P1 항목.** 현재 `PrincipalResolver:32` · `PermissionService:13` · `SeedData:54,93` 의 리터럴 삼항 4곳은 **그대로 두었다.** P0 은 `TEAM_ONLY` 를 도입하지 않으므로 발현하지 않는다. **P1 착수 전 필수.**
- `TeamLeadFieldPolicy.js` · `isTeamLeadOver` · `principal` 8필드 확장 (P1)
- `project_team` 테이블(v014) · `ProjectTeamController` 4종 (P2) — 그래서 `deleteTeam.removedProjectAssignCount` 가 0 고정이다.
- `getTeamMemberCandidates` / `addTeamMembersToProject` (P2)
- i18n — 백엔드가 만들지 않는다. **프론트가 `locales/kr|en/team.json` 신규 + `common.json` 에 `common.pages.team`, `permission.json` 에 `permission.desc.TEAM_MANAGEMENT` 를 추가하고 `npm run merge` 를 돌려야 한다.** 이 두 키는 `ResourceCatalog` 가 참조하므로 **누락 시 권한 관리 페이지에 팀 항목 라벨이 키 문자열로 노출된다.**

### 4-5. 미확정 (확인 필요)

| # | 항목 | 현재 대응 |
|---|---|---|
| 1 | KVS `cursor()` / `nextCursor` 의 **런타임** 동작 | 타입 정의로는 확인됐고(§10 U2) `findAllPaged` 를 그 전제로 구현했다. 실제 500개 초과 데이터로 검증한 적은 없다 — 팀이 100개를 넘길 때 최초 실환경 확인 필요 |
| 2 | KVS 정수 attribute `sortOrder` 에 0 저장 | 다른 엔티티(`status.order`)가 integer 를 쓰고 있어 문제 없을 것으로 본다. tunnel 최초 `addTeam` 에서 422 여부만 확인하면 된다 |
| 3 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 의 TiDB 지원 | `v012_alter_projectusers_add_salary_type` 이 같은 문법으로 이미 운영 중이라 선례가 있다 |

---

## 5. 다음 단계(프론트)로 넘기는 체크리스트

### 5-A. 2차 개정분 (F1/F2/F3 대응 후속)

- [ ] **[필수] `useTeamEditModal` 의 `ancestors` 유도 제거** → `team.parentTeamName` 사용 (§0-A F2). `?? team.parentTeamKey` 폴백도 함께 삭제
- [ ] [권장] `TeamDetailPanel` 의 "최상위 팀" 표기를 `team.isDemoted` 로 분기(사이클 노드를 최상위로 오표기하지 않게)
- [ ] [권장] `buildTeamTree` 사이클 방어 + `a(parent=b), b(parent=a), c(parent=a), d` 회귀 테스트. **백엔드 수정으로 이 입력은 더 이상 발생하지 않지만** 이중 방어로 둘 것. `buildTeamTree.js:15-19` 주석의 전제("백엔드가 이미 루트로 강등해 내려준다")는 **이제 사실이 되었다**
- [ ] [선택] `useTeamEditModal` 의 leader 객체에 `team.leaderEmail` 반영 (O1)
- [ ] [선택] 트리 상단 경고에 `demotedKeys` 활용 — `hasCycle` 외에 자기참조·손상 부모키도 같은 배너로 노출 가능

### 5-B. 1차 분 (유지)

- [ ] **`useUserEditModal` 의 `updateUser` payload 에 `?? null` 적용** (§0) — 안 하면 "직무 선택 해제"가 동작하지 않는다
      *(검증 리포트 §4 에서 4필드 전부 적용 확인됨 — 완료로 판단)*
- [ ] 팀 Select 의 "팀 미지정" 옵션 `value` 는 **문자열 `'__NONE__'`** (null 금지)
- [ ] `getTeamList.content.limits` 를 읽어 쓰고, `maxDepth`/`maxTeams` 리터럴 상수를 프론트에 두지 않는다
- [ ] `hasCycle` / `truncated` 는 **둘 다 경고 배너**로 노출(숨기지 않는다)
- [ ] `deleteTeam` 성공 토스트에 `permissionLostCount` · `inheritanceChangedCount` 를 문장으로 표시
- [ ] `getUserMetaCount.team` 은 `content` 래퍼 없이 **루트**에 있다(`res.team`)
- [ ] `locales/kr|en` 에 `common.pages.team` · `permission.desc.TEAM_MANAGEMENT` 필수 추가 후 `npm run merge`

---
---

# P1 — 권한 확장 (TEAM_ONLY · 팀 상속 · 팀장)

> 작성: 2026-07-27 / backend-engineer
> 입력: `01_architect_design.md` §9 P1 · §R2 · §R3/R3-A/R3-B/R3-C · §14(H1 재설계), `03_verify_report.md` §7
> 범위: **P1 백엔드만.** P2(프로젝트 배정) / P3(심화 분석·DnD)는 손대지 않았다.

## P1-0. 응답 계약 변경 — **프론트 필독 (5건, 전부 필드 추가)**

**깨지는 변경은 없다.** 전부 추가 또는 이상 경로 한정이라 기존 소비 코드는 그대로 동작한다.

| # | resolver | 변경 | 프론트 조치 |
|---|---|---|---|
| 1 | `userPermissionCheck` | **`team` 블록 추가** (아래 shape) | **필수** — `usePermissionStore` 에 `team` 상태 + `isTeamLead()` 추가 |
| 2 | `updateUser` | `{success:true}` → **`{success:true, content:{droppedFields:[]}}`** | 권장 — 비어있지 않으면 경고 토스트(§R3-C 안전망). RESOURCE 경로는 **항상 `[]`** 라 안 해도 무회귀 |
| 3 | `setUserSkills` | 루트에 **`droppedFields:[]`** 추가 | 권장 — 위와 동일 |
| 4 | `removeProjectMemberByAccount` | 루트에 **`droppedFields:[]`** 추가 | 권장 — 위와 동일 |
| 5 | `findUserByAccountId` | `grantedBy==='TEAM_LEAD'` 일 때 `salary`·`permissionKey` 를 **`null` 로 마스킹**(키 삭제 아님) | 없음 — **현재 호출 지점 0**(팀장 축이 이 resolver 에 없다). 규칙만 선반영 |

`projectScope` 는 값 도메인이 **`'ALL' | 'MEMBER_ONLY' | 'TEAM_ONLY'`** 로 넓어졌다(필드 형태 불변).

```js
// userPermissionCheck 응답 — 기존 4필드 불변 + team 1블록
{
  success: true,
  isUser: true,
  name: "Member",
  projectScope: "ALL" | "MEMBER_ONLY" | "TEAM_ONLY",
  pages: [ { pageId: "TEAM_MANAGEMENT", value: { read:false, write:false } }, ... ],
  team: {                                   // ★ 신규. 팀 미소속·비팀장이어도 **키는 항상 존재**한다
    teamKey: "team-<uuid>" | null,
    teamName: "개발팀" | null,
    isTeamLead: false,
    leadingTeamKeys: [],                    // 내가 리더인 팀(직속). 후손은 포함하지 않는다
    permissionSource: "personal" | "team" | "none"
  }
}
```

> `permissionSource` 의미: `personal` = `users.permission_key` 사용 / `team` = 조상 팀에서 상속 /
> `none` = **어느 쪽도 없어 전 리소스 false**(로그인은 되는데 아무것도 안 보이는 상태 — UI 가 이 값으로 안내할 수 있다).

---

## P1-1. 작업 1 — 팀장 stale 참조 (a)+(b) 둘 다 구현

내가 P0 리포트 §4-1 에서 보고한 fail-open(계정을 지웠는데 팀장 권한이 남는다)을 **2중으로** 막았다.

### (a) 데이터 정합성 — U11 cascade 확장

`src/resolver/backoffice/team/TeamLeadership.js` 신설 → `clearTeamLeadershipOfUser(accountId)`.

```
deleteByUserIdService
  0. clearTeamLeadershipOfUser   <- 신규. KVS team.leaderAccountId 역참조 정리
  1. projectusers
  2. user_schedule
  3. user_skills
  4. users (부모)
```

**0단계를 맨 앞에 둔 근거** (요청받은 판단 항목 — "KVS 실패가 SQL 삭제를 막아야 하는가?" → **막아야 한다**):
1. 실패해도 **파괴적 SQL 이 한 줄도 실행되지 않아** 완전히 재시도 가능하다.
2. 반대 순서면, users 행이 사라진 뒤 KVS 정리가 실패했을 때 **재시도를 촉발할 단서가 없다** — 사용자가 목록에서 이미 사라져 아무도 다시 누르지 않는다. 나머지 4단계는 사용자 행이 남아 재시도 경로가 살아 있지만 **이 단계만은 그렇지 않다.**
3. 예외를 삼키지 않는다(U8 교훈). KVS 가 죽었으면 삭제를 멈추는 편이 안전하다.

**기존 4단계의 순서·호출은 1바이트도 바뀌지 않았다.** U11 테스트 4건 그대로 통과 + 신규 3건 추가.

주의 — 코디네이터 지적 반영: 내 P0 권고문은 "`''` 로 정리"라고 적혀 있었다. **틀렸다** — KVS 가 빈 문자열을 거부한다(U3 정정). `toRecord` 를 거쳐 **속성 자체를 생략**한다. `TeamLeadership.test.js` 가 "어떤 속성도 빈 문자열이 아니다"를 단언한다.

### (b) 판정 방어 — "어쩌다 안전"을 "보장된 것"으로 승격

`PrincipalResolver` 에서 **`users` 행이 확인된 뒤에만** 팀 컨텍스트를 계산한다(`resolveTeamContext`).
미등록 사용자 분기는 팀 인덱스를 **조회조차 하지 않고** `emptyTeamContext()` 를 반환한다.

- 지적대로 이것은 원래 "자동 충족될 수도 있는" 성질이었다 → **코드 주석 2곳 + 테스트 2건으로 고정**했다:
  - `users 행이 없으면 stale leaderAccountId 가 있어도 팀장이 되지 않는다` — `isTeamLead:false` ∧ `leadingTeamKeys:[]` ∧ **`getTeamIndex` 호출 0회**(계산 자체를 안 하는 것이 방어의 본체)
  - `admin 도 users 행이 없으면 팀장이 되지 않는다` — admin 경로도 같은 규칙
- **admin 도 팀 정보를 채운다**(설계서 미기재 결정): `users` 행이 있으면 표시용으로만 채운다. 권한 판정에는 안 쓰이지만(전권 바이패스), 팀장인 admin 이 `/my-page` "내 팀" 섹션에 도달하지 못하는 UX 구멍을 막는다. 실패해도 admin 동작에 영향 없도록 try/catch.

---

## P1-2. 작업 2 — C2 `normalizeScope` 4곳 통합

`src/permission/ProjectScope.js` 신설 (`PROJECT_SCOPES` + `normalizeScope`). **리터럴 삼항 0건.**

| 지점 | 상태 |
|---|---|
| `PrincipalResolver.js:32` (판정) | import 전환 |
| `PermissionService.js:13` (저장) | import 전환 |
| `SeedData.js:54` (Member 시드) | import 전환 |
| `SeedData.js:93` (커스텀 세트 전수 순회) | import 전환 |

**계약 테스트 13건** (`test/permission/projectScope.contract.test.js`):
- 왕복 보존 (`PROJECT_SCOPES.every(s => normalizeScope(s) === s)`) + TEAM_ONLY 격하 안 됨
- **정적 재복제 검사** — `src/` 전역 `.js/.jsx` 를 읽어 리터럴 삼항 패턴 0건 단언
  - **주석은 제외**한다(설계 의도를 설명하는 문서에까지 걸리면 규칙을 쓸 수 없다)
  - **검출기 자기검증 테스트를 함께 넣었다** — 위반 문자열을 넣으면 실제로 잡히는지 확인한다. 없으면 "정규식이 아무것도 안 잡는데 통과"가 가능하다
- 4지점 import 존재 검사 + `SeedData` 안에서 `normalizeScope` 호출 **2회 이상**(한 곳만 고치는 실수 방지)

---

## P1-3. 작업 3 — P1 본체

### 구현 항목

| 항목 | 상태 |
|---|---|
| `PrincipalResolver` — principal 팀 필드 10개, R2 fallback, `scopedProjectIds` TEAM_ONLY(S4) | 완료 |
| `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNTS(count)` + Repository (**빈 배열 가드**) | 완료 |
| `TeamRepository.findAccountTeamPairsByTeamKeys` (**빈 배열 가드**) | 완료 |
| `permissionGuard.isTeamLeadOver` (accountTargets + teamTargets) + OR 분기 + `req.grantedBy` | 완료 |
| `TeamLeadFieldPolicy.js` — allowlist, **미등록 resolver 전부 드롭** | 완료 |
| `PermissionMap` teamLead 축 **4키** (설계서 5키 중 1건은 P2 — 아래 D1) | 완료 |
| 서비스 `droppedFields` 3종 + `findUserByAccountId` 마스킹 | 완료 |
| `userPermissionCheck` `team` 블록 | 완료 |
| 테스트 (판정 매트릭스 · allowlist · 가드 배선 · 계약) | 94건 추가 |

### principal 신규 필드 (기존 8필드 전부 불변)

```js
teamKey, teamName, teamPath,            // 소속
leadingTeamKeys, isTeamLead,            // 팀장(직속)
scopeTeamKeys,                          // (자기팀+후손) ∪ (팀장팀+후손)  — 읽기 스코프
leadingScopeTeamKeys,                   // 팀장팀+후손                    — write 판정 전용
teamScopeAccountIds,                    // scopeTeamKeys 소속 인원 (조건부, 아니면 null)
leadingScopeAccountIds,                 // leadingScopeTeamKeys 소속 인원 (조건부, 아니면 null)
permissionSource                        // 'personal' | 'team' | 'none'
```

`memberProjectIds` 는 **필드명 유지 + 의미만 확장**(소비자 무변경): TEAM_ONLY 면 팀원들의 `projectusers` 프로젝트 합집합.

### S4 — `scopedProjectIds` 한 곳만 고쳤다

```js
if (principal.projectScope === 'MEMBER_ONLY') return principal.memberProjectIds || [];
if (principal.projectScope === 'TEAM_ONLY')   return principal.memberProjectIds || [];
```
→ 기존 소비자 6파일(`enforceProjectScope`, `PortfolioDashboardService`, `IssueAnalysisService`, `ProjectCalendarService`, `ProjectService`, `AssignmentProjectService`) **코드 1줄도 안 바뀌었다**(git diff 확인).

### 요청받은 판단 1 — P1 과도기(`projectusers` 경로만)에 권한 구멍이 있는가

**없다. 근거:**
- `TEAM_ONLY` 로 산출되는 집합은 `MEMBER_ONLY ⊆ TEAM_ONLY ⊆ ALL` 이다. P2 의 `project_team` 합집합이 빠져 있으므로 **의도보다 좁다.**
- 좁은 쪽으로 틀리면 "팀이 담당으로 배정됐지만 아무도 개별 투입되지 않은 프로젝트가 안 보인다" = **fail-close**. 사용자에겐 불편이지 노출이 아니다.
- 반대 방향(넓어지는) 경로가 없음을 확인했다: `memberProjectIds` 의 입력은 `teamScopeAccountIds` 뿐이고, 그 입력은 `scopeTeamKeys` 뿐이며, 그것은 자기 팀·리더 팀의 후손 집합뿐이다. **payload 등 외부 입력이 섞이는 지점이 없다.**

### 요청받은 판단 2 — `whereIn(col, [])` fail-open 이 실제로 막혔는가

§R6 표의 "팀 미소속 TEAM_ONLY = 0건 fail-close" 가 성립하도록 **3중**으로 막고 테스트로 고정했다.

| 지점 | 가드 | 빈 입력 시 |
|---|---|---|
| `PrincipalResolver.fillTeamScopeAccounts` | `scopeTeamKeys.length === 0` 이면 즉시 빈 배열 | **쿼리 미발행** |
| `TeamRepository.findAccountTeamPairsByTeamKeys` | 진입부 `if (!teamKeys?.length) return []` | 쿼리 미발행 |
| `ProjectUsersRepository.findProjectIdsByAccountsRepository` | 진입부 `if (!targets.length) return []` | 쿼리 미발행 (`generateInClause(0)` 은 `IN ()` **문법 오류**라 방향이 반대 — 그래도 막는다) |

테스트: `팀 미소속 TEAM_ONLY → 대상 0명, 프로젝트 0건` 에서 pairs 조회 **호출 0회** + `scopedProjectIds(p)` 가 빈 배열임을 함께 단언한다.

---

## P1-4. 설계서와 달라진 점 (전부 코드 근거 있음)

| # | 설계서 | 실제 구현 | 근거 |
|---|---|---|---|
| **D1** | `teamLead` 축 **5키**(`addTeamMembersToProject` 포함) | **4키** — `addTeamMembersToProject` 는 **P2 로 연기** | 그 resolver 는 **P2 에 신설**된다. P1 에 매핑만 넣으면 계약 테스트 "(2) 고아 매핑 없음"이 **즉시 실패**한다(등록집합에 없으므로). allowlist 에는 **선등재**해 뒀다 — P2 에서 등재를 잊으면 resolver 가 통째로 죽는 시끄러운 실패가 나기 때문 |
| **D2** | `removeProjectMemberByAccount` allowlist = `['projectId','accountId']` | **`['project_id','accountId']`** | 실제 payload 가 snake_case 다(`ProjectUsersService.js:93`, `ProjectAssignmentBoard.jsx:168` 실측). 설계서대로면 `project_id` 가 드롭돼 **팀장 경로가 항상 실패** — **H2 와 정확히 같은 실패 모드**. 계약 테스트로 고정(`project_id` 포함 ∧ `projectId` 미포함) |
| **D3** | allowlist 를 **서비스**에서 적용 | **가드 1곳**(`permissionGuard.guard`)에서 적용 | 서비스마다 호출하게 두면 언젠가 하나가 빠지고 **그 resolver 만 조용히 열린다**. H3 가 정확히 "빠뜨리면 통과"를 문제 삼았으므로 구조적으로 불가능하게 만드는 편이 일관된다. 서비스는 `req.droppedFields` 를 받아 응답에 싣기만 한다. **순서 고정**: 스코프 검증 → allowlist 적용(반대면 projectId 가 사라져 스코프 검증이 무력화된다) |
| **D4** | `isTeamLeadOver` 가 `principal.teamScopeAccountIds` 사용 | **`leadingScopeAccountIds`(신규) 사용** | 설계서 §R3 자체가 모순이었다 — 같은 절에서 "`scopeTeamKeys` 를 write 판정에 쓰면 과대하다"고 하면서 코드는 `teamScopeAccountIds`(= scopeTeamKeys 기반)를 쓴다. 그대로 두면 **자기 팀 동료(리더 아님)에게 write 가 열린다.** 두 집합을 분리하되 **SQL 은 1회**로 유지했다(team_key 를 함께 받아 JS 에서 분할). 테스트로 고정: `리더가 아닌 자기 팀 동료는 거부한다` |
| **D5** | `permissionSource:'none'` → `mergeSetPages([])` → "사실상 전부 false" | **`allFalsePages()`** | "사실상"이 아니다 — `PUBLIC_HOLIDAY_MANAGEMENT` 의 `defaultForNew` 는 `{read:true}` 라 `mergeSetPages([])` 는 **전부 false 가 아니다**(`ResourceCatalog.js:73`). 설계서 §R2 가 명시한 "전 리소스 false"를 실제로 만족시키려면 `allFalsePages()` 여야 한다. 기존 "세트 로드 실패" 경로는 **건드리지 않았다**(무회귀) |
| **D6** | (없음) | `toRecord` 를 `TeamService` → `TeamTreeCache` 로 이동 + re-export | `UserService → TeamLeadership → TeamService → UserService` **순환 import** 회피. `TeamTreeCache` 에는 이미 역방향 `toTeam` 이 있어 자연스러운 자리다. 코디네이터가 만든 `TeamRecord.test.js` 는 **import 경로를 바꾸지 않아도 통과**하도록 re-export 를 남겼다 |

---

## P1-5. 신규/변경 파일

### 신규 (9)
| 파일 | 내용 |
|---|---|
| `src/permission/ProjectScope.js` | C2 — `PROJECT_SCOPES` + `normalizeScope` 단일 출처 |
| `src/permission/TeamLeadFieldPolicy.js` | R3-A — allowlist + `applyTeamLeadFieldPolicy` |
| `src/resolver/backoffice/team/TeamLeadership.js` | 작업1(a) — `clearTeamLeadershipOfUser` |
| `src/resolver/backoffice/team/__test__/TeamLeadership.test.js` | 6건 — U3 빈문자열 함정 포함 |
| `test/permission/projectScope.contract.test.js` | 13건 — C2 왕복 + 정적 재복제 검사(+ 검출기 자기검증) |
| `test/permission/teamLead.contract.test.js` | 30건 — meta 계약 · allowlist · `isTeamLeadOver` 매트릭스 |
| `test/permission/principalResolver.test.js` | 20건 — R2/S4/stale/fail-close 판정 매트릭스 |
| `test/permission/guardTeamLead.integration.test.js` | 12건 — 가드 배선(다른 테스트가 못 잡는 구간) |
| `test/permission/userPermissionCheck.test.js` | 9건 — `team` 블록 계약 |

### 수정 (14)
| 파일 | 변경 |
|---|---|
| `src/permission/PrincipalResolver.js` | 팀 컨텍스트 · R2 fallback · TEAM_ONLY · `scopedProjectIds` |
| `src/permission/permissionGuard.js` | `isTeamLeadOver` · `grantedBy` · allowlist 적용 · `guard(meta, name)` |
| `src/permission/PermissionMap.js` | teamLead 축 4키 + meta 형태 문서화 |
| `src/resolver/backoffice/permission/PermissionService.js` | `normalizeScope` import · `team` 블록 |
| `src/seed/SeedData.js` | `normalizeScope` import (2지점) |
| `src/resolver/backoffice/user/UserService.js` | 0단계 cascade · `droppedFields` · R3-B 마스킹 |
| `src/resolver/backoffice/user/UserController.js` | `grantedBy` / `droppedFields` 전달 |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | `findProjectIdsByAccountsRepository`(빈 배열 가드) |
| `src/resolver/projectIssue/ProjectUsersService.js` · `ProjectUsersController.js` | `droppedFields` |
| `src/resolver/resourceManagement/ResourceManagementService.js` · `Controller.js` | `droppedFields` |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_PROJECT_IDS_BY_ACCOUNTS(count)` |
| `src/resolver/backoffice/team/TeamRepository.js` · `TeamTreeCache.js` · `TeamService.js` | 쌍 조회 추가 · `toRecord` 이동/re-export |

### 보존 확인 (P0 무회귀)
- **C1 read-merge** — `UpdateUserMerge.test.js` 8건 → **11건**(droppedFields 3건 추가). `pick()` 로직 무변경
- **팀 필터 3상태** — `'__NONE__'` 센티넬 미변경
- **`toRecord` 속성 생략** — `TeamRecord.test.js` 7건 통과. `TeamService.test.js` 는 **실물 `toRecord`** 를 쓰도록 mock 조정(mock 하면 U3 회귀를 못 잡는다)
- **U7~U11** — `deleteByUserIdService` 기존 4단계 순서 불변, `ProjectDashboardRepository` · `ProjectUsersQuery.FIND_BY_PROJECT_ID` 미변경
- **P0 계약** — 팀 8 resolver 응답 shape 무변경

---

## P1-6. `npm test` 결과 (원문)

```
Test Suites: 33 passed, 33 total
Tests:       550 passed, 550 total
Snapshots:   0 total
Time:        7.9 s
Ran all test suites.
```

- P1 착수 시점 **456 → 550** (+94). 실패 0, 스킵 0. **회귀 없음.**

| 테스트 | 건수 | 고정 대상 |
|---|---|---|
| `principalResolver.test.js` | 20 | R2 3분기 · 합집합 금지 · **stale leaderAccountId fail-close** · 팀 미소속 TEAM_ONLY 0건 · `leadingScope` vs `scope` 분리 · admin 경로 |
| `teamLead.contract.test.js` | 30 | meta 형태 · allowlist 등재(H3) · **미등록 resolver 전부 드롭** · **미래 필드 자동 차단** · snake_case 키(H2) · `isTeamLeadOver` 12케이스 |
| `guardTeamLead.integration.test.js` | 12 | 가드 배선 — grant OR 팀장 축, `grantedBy`, **allowlist 가 서비스 도달 전에 적용**, RESOURCE 경로 동일 참조 |
| `projectScope.contract.test.js` | 13 | C2 왕복 · 정적 재복제 0건 · 검출기 자기검증 |
| `userPermissionCheck.test.js` | 9 | `team` 블록 계약 · 기존 4필드 무회귀 |
| `TeamLeadership.test.js` | 6 | **빈 문자열 저장 안 함(U3)** · 다른 속성 보존 · 즉시 로드 |
| `UserDeleteCascade.test.js` | +3 | 0단계가 **SQL 보다 먼저** · KVS 실패 시 SQL 0줄 |
| `UpdateUserMerge.test.js` | +3 | `content.droppedFields` 항상 존재 · payload 오염 없음 |

---

## P1-7. 미구현 · 발견한 문제 · 미확정

### 미구현 (범위 밖 — 의도적)
- **프론트 P1 전량** — `usePermissionStore.team`/`isTeamLead()`, `/my-page` "내 팀" 섹션(팀장 축의 **유일한 진입점** — 없으면 팀장 축은 서버 판정만 남는다), 권한 Select "팀 상속" 옵션 + 실효 권한 미리보기, TEAM_ONLY 옵션 + `peopleWarning` 배너, `droppedFields` 토스트, i18n
- **P2**: `project_team`(v014), `ProjectTeamController` 4종, `addTeamMembersToProject` 의 teamLead 축(D1)
- **H4(내 팀원만 조회)** — 설계서가 **비목표로 선언**한 항목. 인원 축엔 `scopedProjectIds` 같은 단일 병목이 없어 5개 서비스에 행 필터가 필요하다

### 발견한 문제 (신규 2건)

| # | 내용 | 판단 |
|---|---|---|
| **P1-N1** | **`mergeSetPages([])` 는 "전부 false"가 아니다.** `PUBLIC_HOLIDAY_MANAGEMENT.defaultForNew = {read:true}` 라, 권한 세트 로드가 **실패**했을 때(KVS 에러 등) 사용자는 공휴일 조회 권한을 갖는다. 기존 경로라 **건드리지 않았다**(무회귀 우선). `permissionSource:'none'` 신규 경로만 `allFalsePages()` 를 쓴다 | 리더 판단 요청 — "로드 실패 = 전부 false"로 바꾸면 fail-close 가 일관되지만, KVS 일시 장애 때 전 사용자가 잠기는 트레이드오프가 있다 |
| **P1-N2** | **`updateUser` 로 `permission_key = NULL`(팀 상속)을 저장하는 순간 O8 함정의 위험도가 올라간다.** 검증 리포트 O8: `useUserEditModal` 이 role/level/permission 옵션 조회에 **실패**하면 initData 가 전부 `null` 이 되고, 저장 시 `?? null` 로 **실제 해제**된다. P0 까지는 "권한이 리셋"이었지만 P1 부터는 **"팀 상속으로 전환 → 상속 세트 없으면 전 권한 상실"** 이 된다 | **프론트 필수 처리 권고** — 옵션 로딩 실패 시 저장을 막거나, `originalValues` 를 응답에서 직접 유도(팀 Select 가 이미 쓰는 방식). 백엔드는 `undefined`(보존)/`null`(해제)을 정확히 구분하므로 서버 측에서 더 할 수 있는 게 없다 |

### 미확정 (배포/E2E 필요)
| # | 항목 | 확인 방법 |
|---|---|---|
| P1-U1 | **TEAM_ONLY 실기동** — 권한 세트에 TEAM_ONLY 지정 + 팀원 배치 후 프로젝트 목록이 실제로 좁혀지는가 | 스테이징. 로컬은 mock 매트릭스로만 고정 |
| P1-U2 | **팀장 축 실기동** — Member 세트 팀장이 `findTeamById`/`getUserSkills`/`setUserSkills` 를 실제로 통과하는가. **프론트 `/my-page` "내 팀" 섹션이 없으면 검증 자체가 불가** | 프론트 P1 완료 후 |
| P1-U3 | **90초 stale 창** — 팀장 해제·팀 이동 직후 최대 90초(TeamTree 60 + principal L1 30) 옛 권한 유지. 설계서가 명시적으로 수용한 값이나 **실측한 적이 없다** | 배포 후 관측 |
| P1-U4 | `SEED_VERSION 8` 시드 후 **커스텀 세트의 `projectScope` 가 TEAM_ONLY 로 보존**되는가(C2 완결 조건의 실기동 확인) | 배포 후 KVS 확인 |

---

# P1-B — 검증 후속 조치 (O1 · O3)

> 작성: 2026-07-28 / backend-engineer
> 입력: P1 검증 결과(실패 0 / 판정 조합 52건 통과) + 지적 2건. **P0+P1 배포 상태에서의 수정**이다.

## P1-B0. 응답 계약 변경 — **없음**

프론트가 이미 소비 중이라 shape 은 하나도 건드리지 않았다.

| 대상 | 변경 | 프론트 영향 |
|---|---|---|
| `removeProjectMemberByAccount` **응답** | **무변경**. 루트 `droppedFields` 유지(항상 `[]`) | 없음 |
| `removeProjectMemberByAccount` **권한 축** | 팀장 축(`teamLead`) **제거** — 아래 O1 | **없음**(팀장이 도달할 수 있는 UI 경로가 애초에 0이었다. 근거는 O1-③) |
| 그 외 resolver | 무변경 | 없음 |

---

## P1-B1. O1 — `removeProjectMemberByAccount` 팀장 축을 **P2 로 연기**

### 결론

**연기한다.** 코디네이터 판단(비대칭 논거)에 동의하며, **추가 근거 2개**를 직접 확인해 붙인다.

### 근거 ① — 프로젝트 축을 P1 에서 좁힐 방법이 실제로 없다 (후보를 전부 열어봤다)

| 후보 정의 | 구현 가능? | 판정 |
|---|---|---|
| **"내 팀원이 참여한 프로젝트"** (`findProjectIdsByAccountsRepository(leadingScopeAccountIds)`) | 가능(기존 쿼리 재사용) | ❌ **공허하다(vacuous).** 제거 대상은 **정의상 그 프로젝트의 `projectusers` 행**이다. 즉 대상이 존재한다는 사실 자체가 조건을 항상 충족시킨다 → **아무것도 막지 못하는 검사**. 통과율 100% 인 가드를 넣으면 "제한했다"는 착각만 남는다 |
| **"팀장 본인이 참여한 프로젝트"** (`findProjectIdsByAccountRepository(principal.accountId)`) | 가능 | ⚠ 비공허하고 실제로 좁혀지지만 **P2 에서 `project_team` 기준으로 바뀐다.** 배포된 앱의 **write 축 의미를 두 번 흔드는** 것이 되고, 전환 시 일부 팀장이 권한을 잃거나 얻는 조용한 마이그레이션이 생긴다 |
| **"자기 팀이 담당 배정된 프로젝트"** (`project_team`) | **불가 — P2 테이블** | 이것이 설계 의도에 맞는 유일한 정의다 |

→ 올바른 정의는 P2 에 있고, P1 에서 낼 수 있는 대안은 **공허하거나 재이주를 유발**한다.

### 근거 ② — 비대칭 (코디네이터 지적, 동의)

`addTeamMembersToProject`(추가)를 D1 에서 같은 이유로 P2 로 미뤘다. **추가는 막고 제거는 여는** 상태이며, 심지어 **파괴적인 쪽(제거)이 먼저 열려 있었다.**

### 근거 ③ — **팀장이 도달할 수 있는 UI 경로가 0이다** (내가 새로 확인한 사실)

이 축을 닫는 비용이 정확히 0임을 확인했다.

| 경로 | 실측 | 팀장(Member 세트) 도달? |
|---|---|---|
| 유일한 프론트 호출부 `ProjectAssignmentBoard.jsx:169` (`/resource` 프로젝트 배정 탭) | `RESOURCE_MANAGEMENT` read 게이트 | ❌ Member = `{read:false}` |
| `/my-page` "내 팀" 섹션 (`MyTeamSection.jsx`) | 이 resolver 를 **호출하지 않는다.** 문서 주석에 축으로 적혀 있으나 실제 `invoke` 0건이고, 주석 스스로 "배정 취소는 프로젝트 상세 인력 탭에 이미 있다"고 적었다 | ❌ |
| 프로젝트 상세 인력 탭의 삭제 버튼 (`ProjectUserPanel.jsx:180`) | **다른 resolver 다** — `deleteProjectUsersByKey`(`project_member_id` 기반, `W('PROJECT','inherited')`, **팀장 축 없음**). Member 는 `PROJECT` read 만 보유 | ❌ |

> ⚠ **설계서 §R3 의 "removeProjectMemberByAccount 는 유일하게 동작한다"는 서술은 사실이 아니었다.**
> 인력 탭의 실제 제거 버튼은 `deleteProjectUsersByKey` 이고, 이 resolver 는 자원관리 탭 전용이다.
> 즉 P1 의 이 축은 **UI 로 전달된 기능이 0이면서 direct invoke 로만 도달 가능한 write 표면**이었다.
> **H1(선행 read 미확인)과 같은 계열의 실수**이며, 이번엔 "열어놨는데 아무도 못 쓰는" 쪽이 아니라
> "아무도 못 쓰는데 위험만 남는" 쪽으로 나타났다.

### Blast radius 문서화 (지적의 핵심 — 지금까지 없었다)

**현재 팀장 축 3키의 최대 피해 범위.** 대상 인원 축은 전부 `leadingScopeAccountIds`(내가 리더인 팀 + 후손 소속자)로 좁혀지며, 검증에서 `lead-2` 시나리오로 실측 확인됐다(자기 소속 팀 동료 `mateB` 는 제외).

| resolver | 종류 | 대상 범위 | 최대 피해 | 되돌릴 수 있나 |
|---|---|---|---|---|
| `findTeamById` | read | `leadingScopeTeamKeys` 의 팀 1개 | 그 팀의 **팀원 명단**(accountId·이름·아바타·직무·등급). **급여·권한세트·이메일은 응답에 없다** | — (읽기) |
| `getUserSkills` | read | `leadingScopeAccountIds` 1명 | 그 팀원의 `skillIds` 목록 | — (읽기) |
| `setUserSkills` | **write** | `leadingScopeAccountIds` 1명 | **스킬 전량 덮어쓰기**(DELETE 후 재INSERT). 잘못 쓰면 그 팀원의 스킬이 비워진다 | ✅ 관리자/본인이 재입력하면 원상복구. **파생 데이터가 없다**(자원관리 적합도 계산 입력일 뿐) |
| ~~`removeProjectMemberByAccount`~~ | ~~write~~ | ~~인원: 팀원 / **프로젝트: 전사 무제한**~~ | ~~**전 프로젝트에서 자기 팀원의 `projectusers` 행 삭제.** 그 행은 `role_key`·`level_key`·**`salary`·`salary_type`(투입급여)** 을 보유하므로, 되돌리려면 급여 정보를 다시 입력해야 한다(원래 값은 소실). 비용 분석·가동률 집계의 입력이라 **파생 지표까지 흔들린다**~~ | ❌ **비가역에 가깝다** → **그래서 닫았다** |

> 요약: 남은 3키는 **읽기 2 + 되돌릴 수 있는 쓰기 1**이고 전부 인원 축으로 좁혀진다. 닫은 1키만이
> **비가역 쓰기 + 프로젝트 축 무제한** 이었다. "자기 팀 관리"라는 역할 정의를 넘는 것은 그 하나뿐이다.

### 변경 내용

| 파일 | 변경 |
|---|---|
| `src/permission/PermissionMap.js` | `removeProjectMemberByAccount` 에서 `teamLead` 제거. **grants·`project:'inherited'` 는 무변경**(기존 관리자·자원관리자 경로 무회귀) |
| `src/permission/TeamLeadFieldPolicy.js` | allowlist 항목은 **선등재로 유지**(D1 방식). 계약 방향이 `teamLead 보유 키 ⊆ allowlist` 라 여분 등재는 테스트를 깨지 않는다 |
| `ProjectUsersService/Controller` 의 `droppedFields` | **유지.** 이미 배포된 응답 shape 이고(항상 `[]`), P2 에서 축을 열 때 그대로 쓴다 |

### 회귀 가드 (재발 방지)

- `removeProjectMemberByAccount 에는 팀장 축이 없다 (P2 까지 — 프로젝트 축 제한 불가)` — 축 부재 + `project:'inherited'` + grants 2개 동시 단언. **프로젝트 축 제한 없이 다시 열면 실패**한다
- `P1 팀장 축은 정확히 3키다` — 목록 고정
- `%s 에는 팀장 축이 없다` 목록에 `removeProjectMemberByAccount`·`deleteProjectUsersByKey` 추가
- `P2 예약 2키는 allowlist 에만 있고 PermissionMap 에는 축이 없다`

### P2 착수 시 할 일 (인계)

1. `project_team` 신설 후 `principal.leadingProjectIds`(= 내가 리더인 팀이 담당 배정된 프로젝트) 산출
2. `removeProjectMemberByAccount` 에 `teamLead: { accountTargets:['accountId'] }` 재부여 **+ 프로젝트 축 검증 추가**
   — `enforceProjectScope` 는 `projectScope==='ALL'` 이면 skip 되므로 **그것에 의존하지 말 것.** 팀장 경로 전용 검증이 필요하다
3. `addTeamMembersToProject` 도 같은 시점에 축 부여(allowlist 는 이미 등재됨)

---

## P1-B2. O3 — C2 재복제 검출기 보강

### 문제

기존 검출기는 `'MEMBER_ONLY' ?` 한 패턴만 봐서 **지적된 4형태를 전부 놓쳤다.** C2 는 놓치면 **권한 축소 의도가 확대로 뒤집히는**(`PrincipalResolver` 누락 시 fail-open) 항목이라 약한 가드는 의미가 없다.

### 조치 — 5패턴으로 확장 + 자기검증 케이스 승격

| # | 패턴 | 잡는 형태 |
|---|---|---|
| P1 | `['"\`]MEMBER_ONLY['"\`]\s*\?` | 원본 삼항 (한 줄/줄바꿈/쌍따옴표) |
| **P2** | `\?[^;{}]{0,200}:\s*['"\`]ALL['"\`]` | **`includes(...) ? scope : 'ALL'`** — 폴백이 `'ALL'` 인 삼항 전반 |
| **P3** | `if (…'MEMBER_ONLY'…) … = 'ALL'` | **`if (s !== 'MEMBER_ONLY') s = 'ALL';`** |
| **P4** | 백틱 안의 스코프 리터럴 | **`` `…MEMBER_ONLY…ALL…` ``** — 문자열 조립 우회 |
| **P5** | `const/let/var X = '<스코프값>'` | **상수 경유** (`const FALLBACK = 'ALL';`) |

부수 개선:
- **주석 제거 후 공백을 1칸으로 접는다** → 줄바꿈으로 흩어진 삼항도 잡힌다(기존엔 `[^;\n]` 때문에 못 잡았다)
- `ProjectScope.js` 는 **정의처 자신**이라 제외한다(`includes(scope) ? scope : 'ALL'` 이 곧 정답이라 P2 에 스스로 걸린다)
- 위반 시 **어느 패턴에 걸렸는지**를 함께 출력(`파일 → P3 if 가드 대입`)

### 자기검증 — 4형태를 케이스로 승격

기존 자기검증 구조를 `test.each` 7케이스로 확장했다(원본 3 + **O3 지적 4**). 여기에 오탐 방지 2건을 더했다:
- 주석(라인/블록)은 잡지 않는다
- `normalizeScope(scope)` · `{ projectScope: 'ALL' }`(객체 속성) 같은 **정상 코드는 잡지 않는다**

### 검출기 실효성 — **실제 파일을 심어 확인했다**

단위 자기검증만으로는 "파일 스캔 배선"이 동작하는지 증명되지 않는다. `src/permission/` 에 지적된 4형태 중 하나(`if (s !== 'MEMBER_ONLY') s = 'ALL';')를 담은 파일을 실제로 만들어 테스트를 돌렸다:

```
- Array []
+ Array [
+   "permission\__o3probe.js → P3 if 가드 대입",
+ ]
Tests: 1 failed, 20 passed
```
→ **잡는다.** 확인 후 probe 파일은 삭제했고, 재실행 시 21건 전부 통과한다.

### ⚠ 못 잡는 것 (테스트 파일 주석에 명시)

**"이 검사를 통과했다고 안전한 것은 아니다."** 정규식으로는 원리상 불가능한 형태가 있다:
- 동적 조립 (`'MEMBER' + '_ONLY'`, `SCOPES[i]`)
- 다른 모듈의 상수를 import 해서 폴백
- switch / 객체 맵 기반 폴백 (P5 가 일부만 잡는다)
- 값이 함수 인자로 흘러가 **다른 파일**에서 폴백되는 경우

→ 최종 보증은 이 검사가 아니라 **(a) 4지점 `ProjectScope` import 존재 검사 + (b) 왕복 보존 테스트 + (c) 코드리뷰** 다. 이 검사는 "가장 흔한 복붙 형태를 막는 그물"이지 증명이 아니다 — 읽는 사람이 그것을 알도록 파일 상단에 적었다.

---

## P1-B3. `npm test` 결과 (원문)

```
Test Suites: 33 passed, 33 total
Tests:       562 passed, 562 total
Snapshots:   0 total
Ran all test suites.
```

- P1 완료 시점 **550 → 562** (+12: O3 자기검증 7 + 오탐방지 2 + O1 회귀 가드 3). 실패 0. **회귀 없음.**

### 무회귀 확인
| 항목 | 확인 |
|---|---|
| C1 read-merge | `UpdateUserMerge.test.js` 11건 통과 |
| `toRecord` 빈 문자열 저장 0 | `TeamRecord.test.js` 7건 · `TeamLeadership.test.js` 6건 통과 |
| `whereIn([])` 가드 | `TeamRepository.test.js` 20건 · `principalResolver.test.js` 팀 미소속 TEAM_ONLY 케이스 통과 |
| U7~U11 · cascade 5단계 순서 | `UserDeleteCascade.test.js` 7건 통과(0단계 우선 포함) |
| 팀장 축 인원 제한(D4) | `teamLead.contract.test.js` 통과 — `leadingScopeAccountIds` 기준 유지 |
| 응답 계약 | 변경 0 (§P1-B0) |

---

## P1-B4. 남은 판단 (리더)

| # | 내용 |
|---|---|
| **B-1** | **팀장의 배정 취소 기능은 현재 어떤 경로로도 제공되지 않는다.** P1 이전부터 그랬고(근거 ③) 이번에 축만 정리했다. 팀장에게 이 기능이 실제로 필요하면 **P2 에서 `project_team` + 프로젝트 축 검증 + `/my-page` 버튼**을 한 세트로 열어야 한다 — 셋 중 하나라도 빠지면 다시 "못 쓰거나 위험한" 상태가 된다 |
| **B-2** | P1-N1(`mergeSetPages([])` 가 공휴일 read 를 연다) · P1-N2(옵션 로딩 실패 시 팀 상속 오전환)는 **여전히 미처리**다. §P1-7 참조 |

---

# P1-C — 대표 역할 권한 세트 시드 4종

> 작성: 2026-07-28 / backend-engineer
> 요청: 실기동 — 조직이 처음부터 권한 세트를 손으로 만들어야 하는 문제. 시드가 Admin/Member 2개뿐이었다.
> `SEED_VERSION` **8 → 9**. **응답 계약 변경 0건**(신규 데이터만 추가된다).

## P1-C0. 최종 구성표 (17키 카탈로그 기준)

코디네이터 제안을 **조정 없이 채택**했다. 검토 중 명명할 가치가 있는 노출 3건은 아래 §P1-C2 에 남긴다.

| 카탈로그 키 | 섹션 | **PM** | **PMO** | **Team Lead** | **Team Member** |
|---|---|---|---|---|---|
| DASHBOARD | WORKFORCE | rw | r | r | r |
| REPORT | WORKFORCE | rw | r | r | r |
| KANBAN | WORKFORCE | rw | r | r | r |
| PROJECT | WORKFORCE | rw | r | r | r |
| PROJECT_GANTT | WORKFORCE | rw | r | r | r |
| **PROJECT_COST** | WORKFORCE | **rw** | **r** | — | — |
| **RESOURCE_MANAGEMENT** | WORKFORCE | rw | r | **r** | — |
| SETTINGS | SETTINGS | — | — | — | — |
| USER_MANAGEMENT | SETTINGS | — | — | — | — |
| **TEAM_MANAGEMENT** | SETTINGS | — | — | **—** | — |
| ROLE / LEVEL / SKILL / PERMISSION / PROJECT_STATUS / PUBLIC_HOLIDAY / STORAGE | SETTINGS | — | — | — | — |
| **`projectScope`** | | `ALL` | `ALL` | **`TEAM_ONLY`** | **`TEAM_ONLY`** |
| **`edit`** | | `true` | `true` | `true` | `true` |

- id: `permission-PM` · `permission-PMO` · `permission-TeamLead` · `permission-TeamMember`
- `pages` 는 **`CATALOG` 를 순회해 프리셋마다 명시적으로 판정**한다 → 카탈로그에 새 키가 늘어도
  `defaultForNew` 에 기대지 않고 각 프리셋이 값을 정한다(**새 키가 조용히 열리지 않는다**).
- **Team Lead 와 Team Member 의 차이는 `RESOURCE_MANAGEMENT` 하나뿐이다**(테스트로 고정). 팀장 판정 자체는
  권한세트가 아니라 `team.leaderAccountId` 관계에서 파생되므로(§R3), 세트로 구분할 축이 원래 없다.

## P1-C1. 갱신 정책 — **최초 1회 생성, 재생성 금지**

Admin/Member 와 **정반대 정책**이다. 이 구분이 이번 작업의 핵심이다.

| | Admin / Member | **프리셋 4종** |
|---|---|---|
| `edit` | `false` (불변 시드) | **`true`** (조직이 조정) |
| 시드 실행 시 | **매번 카탈로그에서 재생성**(드리프트 제거) | **최초 1회만 생성** |
| 조직이 수정하면 | 다음 bump 때 덮어써짐(의도) | **유지된다** |
| 조직이 삭제하면 | 다음 bump 때 부활 | **부활하지 않는다** |

### "존재 여부" 판정 — 왜 세트 존재로 판정하지 않았는가

**세트 존재 여부로 판정하면 관리자가 지운 세트가 다음 `SEED_VERSION` bump 때 되살아난다.**
삭제는 명시적 의사표시인데 시드가 그것을 무시하게 된다.

→ **별도의 프로비저닝 원장(top-level KVS `permission_preset_provisioned`)** 을 둔다.
값은 `{ 'permission-PM': true, ... }` 이고, **세트를 지워도 원장은 남으므로** "한 번 제공했다"는
사실이 삭제와 무관하게 보존된다. (top-level KVS 에 객체를 저장하는 선례: `LicenseGuard`, `PortfolioSnapshotRepository`)

### 생성을 건너뛰는 3가지 경우 (전부 "손대지 않는다")

| # | 조건 | 처리 | 이유 |
|---|---|---|---|
| ① | 원장에 기록됨 | 즉시 skip | **이미 제공했다. 지웠어도 되살리지 않는다** ★ |
| ② | 같은 **id** 가 이미 존재 | 덮어쓰지 않고 원장만 표시 | 수동 생성/이전 배포 흔적을 보존 |
| ③ | 같은 **이름**이 이미 존재 | 만들지 않고 원장만 표시 | 이름 유일성(`addPermissionService.checkDuplicated`)과 충돌하면 **관리자가 그 세트를 편집할 때 `NAME_DUPLICATED` 로 막힌다** |

- 원장은 **마지막에 1회** 기록한다. 중간 실패 시 다음 실행에서 ②(id 존재)가 흡수하므로 중복 생성이 없다.
- **이름 스캔(`findAll`)이 실패하면 아무것도 만들지 않는다** — 이름 유일성을 판정할 수 없는 상태에서
  생성하면 편집 불가 세트를 만들게 된다. **중복 생성보다 미생성이 안전하다**(원장도 오염시키지 않는다).

### `projectScope` 는 `normalizeScope`(C2 단일 출처)를 거친다

`TEAM_ONLY` 프리셋 2종은 여기서 `'ALL'` 로 격하되면 **통째로 무의미해진다.** 저장 시 C2 에서 통합한
`ProjectScope.normalizeScope` 를 통과시키고, 생성 직후와 `migratePermissionSets` 통과 후 양쪽에서
`TEAM_ONLY` 보존을 테스트로 단언한다.

## P1-C2. 검토 결과 — 조정 0건, 노출 3건 명명

구성을 그대로 채택했다. 다만 **blast radius 를 이름 붙여 남긴다** — 조직이 알고 쓸 수 있어야 한다.

| # | 노출 | 성격 | 조직이 끄는 법 |
|---|---|---|---|
| **E1** | **PM = `PROJECT_COST` rw + `projectScope: ALL`** → **전사 모든 프로젝트의 인건비 열람 + 투입급여 편집**(`updateProjectMemberSalary`). 4종 중 **가장 넓다** | 역할 정의상 의도적 | PM 이 프로젝트별로 나뉜 조직이라면 **`projectScope` 를 `MEMBER_ONLY` 로 바꾸는 것을 권한다**(권한 관리 화면에서 토글). 그러면 자기가 `projectusers` 에 등록된 프로젝트로 좁혀진다 |
| **E2** | **Team Lead = `RESOURCE_MANAGEMENT` read** → `/resource` 인력현황에서 **전사 인원 명단**(이름·직무·등급·스킬·가동률)이 보인다. `TEAM_ONLY` 는 **프로젝트 축만** 좁히고 인원 축은 좁히지 않는다(H4 가 "내 팀원만 조회"를 **비목표로 선언**했다) | **알려진 한계의 발현.** 설계서 §14 H4 는 "시드 Member 가 RESOURCE/USER_MANAGEMENT read 를 갖지 않아 **grant 로 실질 통제된다**"고 적었는데, 이 프리셋은 그 통제를 스스로 연다 | 이 grant 는 **팀장 실무에 필요하지 않다** — 스킬 조회/편집은 `teamLead` 축이 이미 열고, 진입점 `/my-page` "내 팀"에는 권한 게이트가 없다. 전사 명단 노출이 부담이면 **`RESOURCE_MANAGEMENT` 를 끄면 된다**(그러면 Team Member 와 동일해진다) |
| **E3** | **`PUBLIC_HOLIDAY_MANAGEMENT` 가 4종 전부 닫힘** — 시드 Member 는 `read:true` 라 **기존 Member 보다 좁다** | 의도적("SETTINGS 계열 전부 닫는다") | **기능 손실 없음**을 확인했다: `getPublicHolidayList` 는 `'PUBLIC'` 매핑이라 공휴일 데이터는 권한과 무관하게 조회된다. 이 키가 여는 것은 **백오피스 페이지/메뉴 노출뿐**이다 |

> E2 에 대한 내 판단: 이것을 이유로 `RESOURCE_MANAGEMENT` 를 빼면 **Team Lead 와 Team Member 가 완전히 동일해져**
> 프리셋 2종이 구분 불가능해진다("왜 같은 세트가 둘이지"). H4 는 이미 **비목표 선언 + 운영 규칙 + 경고 배너**로
> 처리된 기존 한계이고, 프리셋이 새 구멍을 만드는 것이 아니라 그 한계를 가진 역할을 제공하는 것이다.
> `edit:true` 라 조직이 끌 수 있으므로 **끄는 법을 문서화하는 쪽**을 택했다.

## P1-C3. 변경 파일

| 파일 | 변경 |
|---|---|
| `src/seed/SeedData.js` | `PRESET_PERMISSION_SETS` 정의 + `addPresetPermissionSeed()` 신설, `runSeed()` 에 등록(`addPermissionSeed` 다음, `migratePermissionSets` 앞). `CATALOG` import 추가 |
| `src/trigger/onInstall.js` | `SEED_VERSION` 8 → 9 |
| `src/seed/__test__/PresetPermissionSeed.test.js` | **신규 22건** |

`runSeed()` 순서를 `addPresetPermissionSeed → migratePermissionSets` 로 둔 이유: 프리셋이 생성된 **같은 실행**에서
카탈로그 키 보충 로직을 통과하게 해, 최초 생성분과 기존분의 상태가 갈라지지 않게 한다.

## P1-C4. 테스트 (22건)

| 그룹 | 고정 대상 |
|---|---|
| 최초 실행 | 4종 생성 · **전부 `edit:true`** · pages 가 카탈로그 전 키 포함 |
| 구성 | **SETTINGS 4종 전부 닫힘** · TEAM_MANAGEMENT 팀장에게도 없음 · PROJECT_COST 는 PM/PMO 만 · PMO/Lead/Member 는 write 0 · **Lead↔Member 차이는 RESOURCE_MANAGEMENT 하나** · TEAM_ONLY 보존 |
| **갱신 정책** | **2회 실행 시 save 호출 0** · **조직이 조정한 pages/scope/name 유지** · **삭제한 세트 부활 안 함** · **전부 삭제해도 부활 안 함** |
| 충돌 회피 | 같은 id 존재 시 덮어쓰지 않음 · 같은 이름 존재 시 생성 안 함 · **충돌로 건너뛴 것도 원장 기록(재시도 안 함)** · 이름 스캔 실패 시 아무것도 만들지 않고 **원장도 오염 안 됨** |
| `migratePermissionSets` 무회귀 | 조정값 보존 + 누락 키 보충 · **TEAM_ONLY 격하 안 됨(C2)** · `edit:true` 유지 |

## P1-C5. `npm test` 결과 (원문)

```
Test Suites: 35 passed, 35 total
Tests:       591 passed, 591 total
Snapshots:   0 total
Ran all test suites.
```

- 착수 시점 **569 → 591** (+22). 실패 0. **회귀 없음.**
- 무회귀 확인: `toRecord` 빈 문자열 0(`TeamRecord`·`TeamLeadership`) · C1(`UpdateUserMerge` 11건) ·
  `whereIn([])` 가드(`TeamRepository` 20건) · U7~U11 cascade 5단계(`UserDeleteCascade` 7건) ·
  `migratePermissionSets` 기존 동작(신규 3건으로 추가 고정) · 권한 계약(`permissionMap.contract` 등 109건)

## P1-C6. 운영 안내 (배포 시 필요)

1. **`SEED_VERSION` 9 반영은 첫 `userPermissionCheck` 호출 시**(`ensureSeed`) 또는 install/upgrade 트리거에서 일어난다.
2. 프리셋은 **한 번만** 생성된다. 조직이 지운 뒤 다시 받고 싶다면 **원장 키
   `permission_preset_provisioned` 를 지워야** 한다(의도적으로 자동화하지 않았다 — 삭제 의사를 존중하는 것이 기본값).
3. **`TEAM_ONLY` 프리셋(Team Lead/Team Member)을 실제로 쓰려면 팀 소속이 필요하다.**
   팀 미소속 사용자에게 이 세트를 주면 `scopedProjectIds` 가 빈 배열이 되어 **프로젝트가 0건으로 보인다**(fail-close, 의도).
   `/backoffice/team` 에서 팀 배치를 먼저 해야 한다.
4. 팀장 기능(`/my-page` "내 팀")은 **세트가 아니라 `team.leaderAccountId` 지정**으로 켜진다. Team Lead 세트를
   줬다고 팀장이 되는 것이 아니다.
5. E1/E2(§P1-C2)는 조직 상황에 따라 권한 관리 화면에서 조정할 것.

---

# P2-a — 프로젝트-팀 배정 + 팀 축 응답 확장

> 작성: 2026-07-28 / backend-engineer
> 범위: **P2-a 만.** P2-b(N7·N5) / P2-c(N6·U12)는 손대지 않았다. `PortfolioTeamDist`(L-4 제외)도 만들지 않았다.
> `SEED_VERSION` 변경 없음. **DB 마이그레이션 `v014` 신규.**

## 🔴 P2-a-0. 배포 순서 — 반드시 지킬 것

**실기동 장애가 났다.** 작업 중 코드가 배포되어 `v014` 미실행 상태에서 `deleteTeam` 이
`project_team` 을 지우려다 실패했고, **팀 삭제 전체가 막혔다.**

```
query: DELETE FROM project_team WHERE team_key = ? , params: team-f480c974-...
팀 삭제 처리 정상적이지 않음
```

### 근본 원인 — 코드 배포와 스키마 생성이 분리돼 있다

`forge deploy`(코드)와 `runMigration`(스키마)은 **다른 시점에 일어난다.**
마이그레이션은 `init-db` 스케줄 트리거 · `onInstall` · `ensureSeed()` **3경로에서만** 돌기 때문에,
**배포 직후 첫 요청이 신규 테이블을 참조하면 즉시 터진다.**
로컬 테스트는 스키마가 이미 있다고 가정하므로 **이 계열은 배포 후에만 드러난다**(KVS 빈 문자열 U3 와 같은 계열).

### 배포 절차

| 순서 | 작업 | 확인 방법 |
|---|---|---|
| 1 | `forge deploy` | — |
| 2 | **마이그레이션 실행을 앞당긴다** | 앱의 **아무 페이지나 열면** `userPermissionCheck` → `ensureSeed()` → `runMigration()` 이 돈다. 또는 `onInstall`(업그레이드 시 자동) / `init-db` 스케줄 트리거(hourly) 대기 |
| 3 | `v014_create_project_team_table` 실행 확인 | `forge logs` 에 `Applied migrations:` 목록. 또는 `/backoffice/storage` 에서 `project_team` 테이블이 보이는지 |
| 4 | 팀 배정 기능 사용 | — |

### 2~3을 건너뛰어도 **앱이 깨지지 않도록** 방어를 넣었다

`src/rdb/schema/TableReadiness.js` 신규 — `information_schema` 프로브(`StorageService` 가 이미 쓰는 검증된 경로)로
테이블 존재를 판정하고, **존재가 확인된 뒤에만** 쿼리를 발행한다.

| 경로 | 테이블 미준비 시 동작 | 근거 |
|---|---|---|
| **`deleteTeam` cascade** | 배정 정리를 **건너뛰고 팀 삭제는 계속**. `removedProjectAssignCount: null` | 배정 정리 실패가 팀 삭제를 막으면 안 된다. 고아 행이 남는 것보다 팀을 못 지우는 게 나쁘다 |
| **`PrincipalResolver` TEAM_ONLY** | 팀 담당 축을 빼고 **P1 동작(projectusers 경로만)으로 graceful degrade** | ★ **여기서 던지면 권한 판정 전체가 죽는다.** 스코프가 좁아지는 방향이라 권한 구멍 없음(fail-close) |
| **`deleteProject` cascade** | 배정 정리를 건너뛰고 삭제 계속 | 8단계 순차 cascade 라 여기서 던지면 **부모 project 가 안 지워진다** |
| `getProjectTeams` | `teams: []` + **`assignmentReady: false`** | "모른다"를 "배정 없음"으로 말하지 않는다 |
| `getTeamMemberCandidates` | **거부**(`TEAM_NOT_IN_PROJECT_SCOPE`) | 보안 검사이므로 "모를 때 통과"는 선택지가 아니다(fail-close) |
| `setProjectTeams` (쓰기) | **에러 전파** | 저장이 조용히 안 되는 것이 더 나쁘다 |

**설계 원칙 2가지를 지켰다:**
1. **모든 SQL 에러를 삼키지 않는다**(U8). 흡수 대상은 **테이블 부재 시그니처만**이고(`1146` / `ER_NO_SUCH_TABLE` / `42S02` / 드라이버 원문 `doesn't exist`), 그 외는 **전부 재throw** 한다. 회귀 테스트로 고정했다.
   - 숫자 코드 `1146` 을 **메시지에서 찾지 않는다** — `executeQuery` 가 감싼 `message` 에는 쿼리 본문과 파라미터가 통째로 들어 있어 UUID 에 우연히 포함될 수 있다. 코드 필드와 **드라이버 원문 메시지**만 본다.
2. **`null`(미수행)과 `0`(대상 없음)을 구분**한다. 흡수한 경우 `console.error` 를 남긴다.

**프로브 캐시**: `true` 만 캐시한다. `false` 를 캐시하면 마이그레이션이 나중에 돌아도 계속 미준비로 남는다 → **마이그레이션 후 자동 복구**된다(테스트로 고정).

---

## P2-a-1. 응답 계약 변경 — **프론트 필독**

### ⚠ 기존 계약이 바뀐 것 (1건)

| resolver | 변경 | 영향 |
|---|---|---|
| `deleteTeam` | `content.removedProjectAssignCount` 가 **`number \| null`** 이 됐다 (P0/P1 에서는 항상 `0`) | **이미 배포된 응답이다.** `null` = 마이그레이션 미실행으로 **정리를 건너뜀**, `0` = 대상 없음. 프론트 토스트가 `count > 0` 로 분기하고 있으면 그대로 동작하지만, **`null` 일 때 "배정 정리는 건너뛰었습니다"를 안내하는 것을 권장**한다 |

### 필드 추가만 (기존 필드 불변)

| resolver | 추가 | 위치 |
|---|---|---|
| `getPortfolioDashboard` | `teamMeta`, `memberTeamMap` | **루트** (`content` 래퍼 없음) |
| `getPortfolioDashboard` | `utilization.people[].investedMd`, `.availMd`, `utilization.hasWeightedMetrics` | `utilization` |
| `getResourceOverview` | `content.teamMeta`, `content.people[].teamKey/teamName` | — |
| `getResourceProfile` | `content.profile.teamKey/teamName` | — |
| `findProjectusersByProjectId` | 행에 `team_key`(SQL 원본) + `teamKey`/`teamName`(camelCase) | `rows[]` |

### 신규 resolver 4종

```js
// getProjectTeams — payload { projectId }
{ success: true, content: {
    teams: [ {
        teamKey: "team-<uuid>",
        name: "개발팀" | null,          // 삭제된 팀이 배정에 남아 있으면 null (행을 숨기지 않는다)
        isPrimary: false,
        memberCount: 3,                 // 팀 **직속** 인원
        assignedMemberCount: 2          // 그중 이미 projectusers 에 있는 수
    } ],
    assignmentReady: true               // false = v014 미실행("배정 없음"이 아니라 "모름")
} }
```
> `memberCount` / `assignedMemberCount` 는 **둘 다 직속 기준**이다. 두 값이 같은 모집단이어야
> "N명 추가 가능"(= 차이)이 성립한다. 후손까지 보려면 `getTeamMemberCandidates` 의 `total`/`assignedCount` 를 쓴다.

```js
// setProjectTeams — payload { projectId, teamKeys: [], primaryTeamKey }
{ success: true, content: { savedCount: 2 } }
```
> `teamKeys: []` = **담당 팀 전량 해제**(정상 동작). `primaryTeamKey` 는 반드시 `teamKeys` 안에 있어야 한다
> (아니면 `TEAM_NOT_FOUND` — 조용히 무시하면 화면과 저장값이 갈린다).
> ⚠ **트랜잭션 없음** — DELETE 후 INSERT 실패 시 담당 팀이 빈 상태로 남는다. 같은 payload 재실행으로 완전 복구(멱등).

```js
// getTeamMemberCandidates — payload { projectId, teamKey, includeDescendants }
{ success: true, content: {
    candidates: [ {
        accountId, userName, userAvatarUrls,
        roleKey, roleName, levelKey, levelName,
        teamKey, teamName,
        alreadyAssigned: false          // **서버가 판정한다** (프론트 교차 금지)
    } ],
    total: 12,
    assignedCount: 5
} }
```

```js
// addTeamMembersToProject — payload { projectId, teamKey, includeDescendants, accountIds }
{ success: true, content: { addedCount: 3, skippedCount: 1, requestedCount: 4 } }
```
> `skippedCount` 는 **"이미 배정돼 있어 건너뜀"만** 뜻한다(정상·멱등). 스코프 위반은 전체 거부되므로 절대 섞이지 않는다.

**에러**: `TEAM_MEMBER_SELECTION_EMPTY` · `TEAM_MEMBER_NOT_IN_SCOPE`(**`error.cause` 에 위반 accountId 배열**) ·
`TEAM_ASSIGN_BATCH_TOO_LARGE` · `TEAM_NOT_FOUND` · `TEAM_NOT_IN_PROJECT_SCOPE` · `ASSIGNMENT_PROJECT_ID_REQUIRED`

### 권한 동작 변경 — TEAM_ONLY 스코프가 **넓어진다**

`memberProjectIds`(TEAM_ONLY) = (팀원들이 `projectusers` 에 있는 프로젝트) **∪** (팀이 `project_team` 에 담당 배정된 프로젝트).
P1 은 앞쪽만 쓰는 **의도된 과도기 fail-close** 였고 여기서 설계 의도(§R3)에 도달한다.
→ TEAM_ONLY 사용자에게 **담당 배정만 있고 개별 투입이 없는 프로젝트가 새로 보이기 시작**한다.

---

## P2-a-2. N1 입력 규약 구현

| `accountIds` | 모드 | `includeDescendants` | 대상 |
|---|---|---|---|
| 키 부재 / `null` | 팀 전체 | **적용됨** | `true`면 후손 포함, `false`면 직속만 |
| 길이 ≥ 1 | 개별 선택 | **무시됨** | `accountIds` 그대로 |
| `[]` | — | — | **거부** (`TEAM_MEMBER_SELECTION_EMPTY`) |

- **검증 집합은 모드와 무관하게 항상 후손까지**다. 개별 선택 UI 가 하위 팀을 펼쳐 보여주므로 후손 인원이 들어오는 것은 정상이다. 팀 트리 **밖** 인원은 어느 모드에서도 통과하지 못한다.
- 스코프 밖 1명이라도 섞이면 **요청 전체 거부**(부분 성공 없음) + `error.cause` 에 위반 목록.
- 검증은 **캐시를 우회한 즉시 로드**(M1/M5).
- 결과물은 **`projectusers` 행 추가뿐**이다. `project_team` 은 건드리지 않는다(§R4 별개 축).
  `insertProjectusersService` 를 어댑터 1줄로 재사용 → 기존 단건 추가와 의미가 **100% 동일**.

---

## P2-a-3. 설계서와 달라진 점 (근거 포함)

| # | 설계서 | 실제 구현 | 근거 |
|---|---|---|---|
| **E1** | `getResourceAnalysisList` 행에 `teamKey`/`teamName` 추가 | **추가하지 않았다** | 이 응답은 **KVS 10분 캐시**(`ResourceList:{pid}:{start}:{end}`)이고 캐시 키에 팀이 없다 → **팀 이동이 10분간 얼어붙는다.** 그리고 **불필요하다**: 설계서 §3 P3 스스로 "행은 `findProjectusersByProjectId`, 지표는 `getResourceAnalysisList` 에서 와서 accountId Map 으로 병합된다"고 적었고, **행 축에 이미 팀이 실린다**(실측: `ResourceAnalysisPage.jsx:108,143`). 느리게 변하는 차원을 빠른 캐시에 굽지 않는다 |
| **E2** | `TEAM_ASSIGN_BATCH_TOO_LARGE` 는 `accountIds.length > 500` | **최종 대상(targets) > 500** 으로 양쪽 모드에 적용 | 타임아웃 위험은 payload 크기가 아니라 **INSERT 행 수**에서 온다. 전체 모드도 동일하게 위험하다. 500명 초과 팀은 **개별 선택 모드로 나눠 실행**하면 되므로 recourse 가 있다(fail-close) |
| **E3** | `addTeamMembersToProject` 에 `teamLead` 축 부여 | **부여하지 않았다**(P2-b 이후) | 프로젝트 축을 좁히려면 `principal.leadingProjectIds`(project_team 기반)가 필요하다. 그것 없이 열면 **O1 에서 닫은 결함**("자기 팀원을 아무 프로젝트에서나 조작")을 그대로 재생산한다. allowlist 에는 이미 선등재돼 있다 |
| **E4** | (없음) | `getProjectTeams` 에 **`assignmentReady`** 추가 | 배포↔마이그레이션 시차에서 "모른다"를 "배정 없음"으로 말하지 않기 위해 |
| **E5** | (없음) | `utilization.hasWeightedMetrics` 추가 | 소비처(N6·N7·`/resource`)마다 "가중 롤업 가능한 스냅샷인가"를 재도출하면 판정이 갈린다. 서버가 한 번 정한다 |
| **E6** | `getResourceAllocationGraph` 사람 노드에 `teamKey` (선택) | **미구현** | 설계서가 `(선택)` 으로 표기했고 P2-a 프론트 체크리스트에도 `(선택)` 이다. 소비처가 생길 때 추가 — 지금 넣으면 검증 대상만 늘어난다 |

### 프론트가 담당하는 P2-a 항목 (백엔드 범위 밖)

- **`static/ui/src/utils/team/aggregateByTeam.js` 순수 함수 + 테스트** — 팀 롤업은 프론트 층이다(§3 결정 3).
  `avgFields` 는 **가중 전용** `{field, numerator, denominator}`, 가동률은 `{ field:'utilization', numerator:'investedMd', denominator:'availMd' }`.
  ⚠ `investedMd`/`availMd` 가 **`null` 일 수 있다**(배치 미실행). **`?? 0` 으로 채우지 말 것** — 그 순간 "가동률 0%"라는 거짓 숫자가 된다. `hasWeightedMetrics === false` 면 지표를 그리지 말고 "집계 전"을 표기한다.
- 프로젝트상세 인력 탭 UI(담당 팀 뱃지·팀 컬럼·골라 담기 모달), `/resource` 팀 필터, 쿼리키 2종

---

## P2-a-4. 신규/변경 파일

### 신규 (9)
| 파일 | 내용 |
|---|---|
| `src/rdb/schema/ddl/projectTeam.sql.js` | `CREATE_PROJECT_TEAM_TABLE` |
| `src/rdb/query/ProjectTeamQuery.js` | 6쿼리 |
| `src/rdb/schema/TableReadiness.js` | **배포↔마이그레이션 시차 방어** — `isTableReady` / `isMissingTableError` |
| `src/resolver/projectTeam/ProjectTeamRepository.js` | 빈 배열 가드(L3) + **Safe 래퍼 4종** |
| `src/resolver/projectTeam/ProjectTeamService.js` | 4서비스 (N1 규약 포함) |
| `src/resolver/projectTeam/ProjectTeamController.js` | `registerProjectTeamController` |
| `src/resolver/projectTeam/__test__/ProjectTeamRepository.test.js` | 15건 |
| `src/resolver/projectTeam/__test__/ProjectTeamService.test.js` | 26건 |

### 수정 (13)
| 파일 | 변경 |
|---|---|
| `src/rdb/schema/ddl/index.js` · `migrate.js` | `v014_create_project_team_table` (체인 맨 아래에만) |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_BY_PROJECT_ID` 에 users LEFT JOIN(`team_key`) · `FIND_ACCOUNT_IDS_BY_PROJECT` 신규 |
| `src/utils/errors/ErrorCodes.js` | `TEAM_*` 4코드 |
| `src/permission/PermissionMap.js` | ProjectTeam 4키 |
| `src/index.js` | `registerProjectTeamController` (CONTROLLER_REGISTRARS 단일 소스) |
| `src/permission/PrincipalResolver.js` | TEAM_ONLY **합집합 완성** (Safe 래퍼 사용) |
| `src/resolver/project/ProjectService.js` | cascade 8단계에 `project_team` 삽입(Safe) |
| `src/resolver/backoffice/team/TeamService.js` | cascade 3단계 실제 구현(Safe, `null` 구분) |
| `src/resolver/backoffice/team/TeamRepository.js` | `findUsersByTeamKeys` · `findAllMemberTeamPairs` 신규(빈 집합 가드) |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | **`investedMd`/`availMd` 2필드** + 직렬화 크기 `console.info` |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | 루트 `teamMeta`/`memberTeamMap` + `utilization` 확장 + **`emptyShape` 동기화** |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `people[].teamKey/teamName` · `content.teamMeta` · `profile.teamKey/teamName` |
| `src/resolver/projectIssue/ProjectUsersService.js` | 인력 행 `teamKey`/`teamName` |

### 무회귀 확인
- `util` 값·산식 **불변**(테스트로 고정) → 기존 가동률 소비자 전부 무회귀
- `FIND_BY_PROJECT_ID` 에 JOIN 을 넣었지만 **`salary` 는 여전히 SELECT 하지 않는다**(U10 유지). LEFT JOIN 이라 users 행이 없는 고아 projectusers 도 목록에서 사라지지 않는다
- C1 read-merge · 팀 필터 3상태 · `toRecord` 빈 문자열 0 · `whereIn([])` 가드 · `leadingScopeAccountIds` 분리 · cascade 순서 · U7~U11 전부 통과

---

## P2-a-5. `npm test` 결과 (원문)

```
Test Suites: 37 passed, 37 total
Tests:       640 passed, 640 total
Snapshots:   0 total
Ran all test suites.
```

- P2-a 착수 시점 **593 → 640** (+47). 실패 0. **회귀 없음.**

| 테스트 | 건수 | 고정 대상 |
|---|---|---|
| `ProjectTeamService.test.js` | 26 | **N1 5케이스 전부** · L1 teamKey 검증(배정 팀/후손/미배정 거부/관리자 예외) · setProjectTeams 전량 교체·대표팀 검증 · 즉시 로드(M1) |
| `ProjectTeamRepository.test.js` | 15 | **빈 배열 가드(L3) — SQL 미발행** · **테이블 부재 4경로 degrade** · **레이스 흡수는 테이블 부재만, 그 외는 전파** · 프로브 캐시(true 만) |
| `PortfolioAggregator.test.js` | +4 | 2필드 적재 · **`util` 산식 불변** · 필드 집합 고정 · **가중이 산술평균보다 정확함** |
| `principalResolver.test.js` | +1 | TEAM_ONLY **합집합**(중복 제거) · 담당 배정만 있는 프로젝트 노출 · 빈 입력 L3 가드 |
| `TeamService.test.js` | +1 | cascade 4단계 순서 · `removedProjectAssignCount` 실제 값 |

---

## P2-a-6. 미확정 · 인계

| # | 항목 |
|---|---|
| **P2a-U1** | **`v014` 실기동 확인** — `information_schema` 프로브가 Forge SQL 에서 기대대로 동작하는지(로컬은 mock). `StorageService` 가 같은 쿼리를 쓰고 있어 가능성은 높지만 **실측한 적이 없다** |
| **P2a-U2** | **테이블 부재 에러 시그니처** — Forge SQL 이 실제로 내려주는 `error.code` 값을 모른다. 코드 매칭 4종 + 드라이버 원문 메시지 3패턴으로 넓게 잡았으나, **프로브가 1차 방어**라 여기 걸릴 일은 레이스뿐이다 |
| **P2a-U3** | `utilizationPeople` **KVS 240KiB 한도** — 2필드로 레코드당 ≈+30%. 배치가 크기를 `console.info` 로 남긴다(캡 아님). 2000명 ≈120KB 예상이나 실측 필요 |
| **P2a-U4** | P2-b 착수 시 `computeCompletionRate` 는 **`WorkAssignmentRules.js:96`(이미 export)을 import** 할 것 — 세 번째 복사본 금지(L-5) |
| **P2a-U5** | P2-b/c 에서 `addTeamMembersToProject`·`removeProjectMemberByAccount` 에 `teamLead` 축을 열려면 **`leadingProjectIds`(project_team 기반) + 프로젝트 축 검증**을 **함께** 넣어야 한다. `enforceProjectScope` 는 `projectScope==='ALL'` 이면 skip 되므로 **그것에 의존하지 말 것** |

---

# P2-b — N7(내 팀 업무 분석) + N5(캘린더 팀 필터)

> 작성: 2026-07-28 / backend-engineer
> 범위: **P2-b 만.** P2-c(N6 대시보드 비교 · U12 인건비 게이트)는 **파일 하나도 건드리지 않았다** — 단독 롤백 단위 보존.
> DB 마이그레이션 없음. `SEED_VERSION` 변경 없음. **신규 테이블/KVS 엔티티 없음** → 배포 순서 제약 없다.

## P2-b-0. 응답 계약 — **프론트 필독**

### 신규 resolver 1종

```js
// getMyTeamWorkAnalysis — payload { teamKey }
{ success: true, content: {
    members: [ {
        accountId, displayName, avatarUrls,
        teamKey, teamName, isLeader,
        roleName, levelName,

        utilization: 0.85 | null,     // ①글로벌 가동률. **null = 집계 전/rollup 부재**
        utilBand: "over" | "normal" | "idle" | "unknown",
        investedMd: 17 | null,
        availMd: 20 | null,
        effortMd: 17 | null,          // = investedMd (배치가 이미 MD 단위)

        completionRate: 0.75 | null,  // 분모 0 이면 null (UI 는 '-')
        todoCount, inProgressCount, doneCount, projectCount
    } ],
    teamMeta: [ { id, name, parentTeamKey, depth } ],   // ★ 배열 형태 (getResourceOverview 와 동일)
    scope: { teamKeys: ["dev","front"], memberCount: 2, includesDescendants: true },
    lastAggregatedAt: "2026-07-28T00:00:00.000Z" | null,
    aggregateStatus: "OK" | "PARTIAL" | null,
    hasWeightedMetrics: false
} }
```

### 🔴 프론트가 반드시 지킬 3가지

| # | 규칙 | 안 지키면 |
|---|---|---|
| **1** | **`teamKey` 를 항상 보낸다** | `teamLead.teamTargets:['teamKey']` 가 대상을 해석하지 못하면 `isTeamLeadOver` 가 **fail-close 로 거부**한다(대상 불명 → 거부). `grants: []` 라 팀장에게는 이 축이 **유일한 통과 경로**다 → `teamKey` 없으면 **PERMISSION_DENIED**. 리딩 팀이 1개여도 그 키를 보낼 것 (`leadingTeamKeys[0]`) |
| **2** | **`utilization`/`investedMd`/`availMd` 에 `?? 0` 을 쓰지 않는다** | `null` 은 "집계 전 또는 rollup 부재"다. `0` 으로 채우면 **"가동률 0%"라는 거짓 숫자**가 된다. `hasWeightedMetrics === false` 면 지표를 그리지 말고 `aggregateStatus`/`lastAggregatedAt` 로 "집계 전"을 표기한다 |
| **3** | **팀 롤업은 `aggregateByTeam` 으로만** 한다 | 서버는 팀 합계를 **의도적으로 내려주지 않는다**(§3 결정 3). 롤업 구현이 둘이 되면 `/dashboard`(N6)와 값이 갈린다. 가동률은 가중 `{field:'utilization', numerator:'investedMd', denominator:'availMd'}` |

- **재무 필드 없음** — `salary`·`annualSalary`·인건비 일절 없다(§R3-B). 테스트가 직렬화 문자열까지 검사해 고정한다.
- `teamMeta` 는 **배열 형태**다(`getResourceOverview` 와 동일). 프론트 `normalizeTeamMeta`(P2a-I)가 세 shape 을 흡수하므로 그대로 넘기면 된다.

### 기존 resolver 응답 확장 (필드 추가만)

| resolver | 추가 | 위치 |
|---|---|---|
| `getProjectCalendarWorklog` | **`memberTeamMap`**, **`teamMeta`** | **루트** (`data` 와 나란히) |

```js
// getProjectCalendarWorklog — 루트. getPortfolioDashboard 와 **글자 그대로 같은 형태**(공용 관용구)
{
  success: true,
  data: [ ... ],                                   // 기존 — 무변경
  memberTeamMap: { "<accountId>": "<teamKey>" },   // 팀 미소속자는 **키가 없다**(null 값 금지)
  teamMeta:      { "<teamKey>": "<팀 이름>" }       // roleMeta/levelMeta 와 동형 객체 맵
}
```

> ⚠ `getPortfolioDashboard` 의 `teamMeta` 는 **객체 맵**, `getResourceOverview`·`getMyTeamWorkAnalysis` 는
> **배열**이다. 통일하지 않는다 — 엔드포인트마다 인접 필드 관례를 따르는 것이 설계 규칙이고,
> 프론트 `normalizeTeamMeta` 가 이미 세 형태를 흡수한다.

### 권한 매핑 변경

| resolver | 변경 |
|---|---|
| `getMyTeamWorkAnalysis` | **신규** — `{ grants: [], project:'none', teamLead:{ teamTargets:['teamKey'] } }` |
| `getResourceProfile` | 기존 `R('RESOURCE_MANAGEMENT')` **유지** + `teamLead:{ accountTargets:['accountId'] }` 추가 |

`getResourceProfile` 은 **기존 grant 를 그대로 두고 축만 더했다** → 자원관리자 경로 완전 무회귀.
팀장은 새 축으로 통과하며, payload 는 allowlist 로 `['accountId']` 만 남는다.

---

## P2-b-1. 착수 즉시 처리한 계약 테스트 확장

`permissionMap.contract.test.js` 의 **`meta.grants.length > 0`** 단언이 `grants: []` 를 거부해
resolver 등록 즉시 640 이 깨졌다. 조건부로 완화했다:

```js
// teamLead 단독 축 매핑은 빈 grants 가 정상.
// 단 **둘 다 없는 매핑은 아무도 통과할 수 없으므로** 여전히 금지한다.
if (!meta.teamLead) {
    expect(meta.grants.length).toBeGreaterThan(0);
}
```

---

## P2-b-2. N7 구현 — 인원 축이 **구조적으로** 제한된다

```js
const leadingTeamKeys   = principal.leadingScopeTeamKeys ?? [];    // 리딩 팀 + 후손
const leadingAccountIds = principal.leadingScopeAccountIds ?? [];  // 그 인원

// ① payload teamKey → 후손 전개
const requested = teamKey ? descendantsOf(index, teamKey, {includeSelf:true}) : leadingTeamKeys;
// ② ★ 서버가 항상 교집합 — payload 만 믿지 않는다
const scopeTeamKeys = requested.filter(k => leadingSet.has(k));
// ③ users 조회 후 인원 축 재교집합 — 팀 이동으로 인덱스와 users 가 어긋나도 범위를 넘지 않는다
const members = userRows.filter(r => leadingAccountIds.has(r.account_id));
```

**읽기용 `teamScopeAccountIds`(자기 소속 팀 포함)를 쓰지 않는다** — 그것을 쓰면 "내가 팀원인 팀"의
동료 분석까지 열려 과대하다. D4 에서 같은 혼동이 권한 상승이 될 뻔했다.
테스트로 고정: `소속만 하고 리더가 아닌 팀은 조회 범위에 들어오지 않는다`.

**빈 집합 가드(C3)**: 팀장이 아니거나 리딩 인원이 0명이면 **쿼리를 하나도 발행하지 않는다**
(팀 인덱스 조회조차 하지 않는다). 테스트로 단언.

**신규 계산 0**: `fetchAssignedLoadByAccounts` · `selectActiveProjectCounts` · `getRollupMeta` ·
`computeCompletionRate`(**`WorkAssignmentRules.js` 의 export 된 쪽을 import** — L-5, 세 번째 복사본 금지) ·
`classifyUtilBand` + `resolveBands`. 전부 기존 함수다.
`getResourceLoadSummary` 보다 **오히려 가볍다** — 그쪽은 전 사용자를 훑지만 N7 은 팀 인원만 본다.

---

## P2-b-3. N5 구현 — 설계서 주장 2건을 **실제로 확인했다**

| 설계서 주장 | 실측 | 판정 |
|---|---|---|
| "`PermissionMap` 수정 0줄 — `getTeamOptions` grant OR 에 `['PROJECT','read']` 가 이미 있다" | `PermissionMap.js:77-78` 에 실제로 있다 | **사실** ✅ 0줄 수정 |
| "팀 필터는 **행 필터링 단계**, `+1일 보정`은 **이벤트 조립 단계**라 접점이 없다" | `useProjectWorkersSchedule.js` — 필터 `:40-41`(`filtered`) → 그룹 키 `:47` → **`+1일 보정` `:61`**. 필터가 엄격히 **앞** 단계다 | **사실** ✅ |
| 그룹 키 = `` `${start}__${end}__${type}` `` (teamKey 없음) | `:47` 그대로 | **사실** ✅ |

→ **백엔드는 날짜 로직에 한 글자도 닿지 않았다.** 프론트는 필터를 `:40` `filtered` 단계에만 얹으면 되고,
그룹 키·`first` 선택 로직은 건드리지 말 것(M-5: 날짜가 틀어지는 게 아니라 **통합 이벤트가 분열해 중복 렌더**된다).

**일정 resolver(`getAllProjectWorkersSchedule`, `mySchedule` 도메인)는 무변경**이다.
맵 하나로 두 소스를 덮는다 — 거기에 같은 필드를 넣으면 마이페이지 일정 경로까지 오염되고 §8-3 카테고리 C 재발이다.

**맵 원천은 `projectusers ⋈ users`**(워크로그 작성자가 **아니다**). 워크로그가 없고 휴가만 있는 사람이
맵에서 빠지면 그 사람 일정이 "팀 미지정"으로 오분류된다. `INNER JOIN` + `team_key IS NOT NULL` 로
**미소속자는 행 자체가 나오지 않게** 쿼리 레벨에서 규약을 강제했다.

**L-1 조기 반환 동기화**: 스코프 교집합이 비는 분기도 `{ data: [], memberTeamMap: {}, teamMeta: {} }` 를
반환한다 — 루트 필드 집합이 경로별로 갈리면 소비 측이 두 shape 을 만난다. 테스트로 키 집합 동일을 단언.

**degrade**: 팀 축 조달(SQL·KVS) 실패가 **캘린더 전체를 죽이지 않는다**. 워크로그가 본체고 팀은 필터 보조이므로
빈 맵으로 진행하고 `console.error` 를 남긴다(조용히 넘어가지 않는다).

---

## P2-b-4. 설계서와 달라진 점

| # | 설계서 | 실제 | 근거 |
|---|---|---|---|
| **F1** | N7 응답에 `hasWeightedMetrics` 없음 | **추가** | 가중 롤업 가능 여부를 소비처마다 재도출하면 판정이 갈린다. P2-a 의 E5(포트폴리오)와 **같은 이유·같은 필드명**으로 맞췄다 |
| **F2** | N7 `teamMeta` 형태 미지정 | **배열 `{id,name,parentTeamKey,depth}`** | `getResourceOverview` 와 같은 분석 계열이고 계층 정보를 담을 수 있다. 프론트 `normalizeTeamMeta` 가 흡수한다(P2a-I) |
| **F3** | `selectActiveProjectCounts`·`resolveBands` 는 private | **export 승격** | N7 이 같은 지표·같은 밴드를 써야 한다. 복사하면 같은 사람이 화면마다 다른 밴드가 된다(§8-3 C 계열). **값·동작 무변경** |

**설계서 항목 중 미구현**: 없음. (`computeCompletionRate` export 승격은 L-5 에서 **철회**됐고 이미 export 된 쪽을 import 했다.)

---

## P2-b-5. 신규/변경 파일

### 신규 (4)
| 파일 | 내용 |
|---|---|
| `src/resolver/myPage/MyTeamAnalysisService.js` | N7 서비스 |
| `src/resolver/myPage/__test__/MyTeamAnalysisService.test.js` | 18건 |
| `src/resolver/projectCalendar/__test__/ProjectCalendarTeamAxis.test.js` | 9건 |

### 수정 (8)
| 파일 | 변경 |
|---|---|
| `test/permission/permissionMap.contract.test.js` | `grants.length > 0` 을 **`teamLead` 없을 때만** 적용 |
| `test/permission/teamLead.contract.test.js` | 팀장 축 3키 → **5키** + N7 2건 형태 단언 |
| `src/permission/PermissionMap.js` | `getMyTeamWorkAnalysis` 신규 · `getResourceProfile` 축 추가 |
| `src/permission/TeamLeadFieldPolicy.js` | allowlist 2키 등재(미등재 시 payload 통째 드롭 — H3) |
| `src/resolver/myPage/MyPageController.jsx` | `getMyTeamWorkAnalysis` 등록 |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `selectActiveProjectCounts`·`resolveBands` export 승격 |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_MEMBER_TEAMS_BY_PROJECTS(count)` 신규 |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | `findMemberTeamsByProjectsRepository`(빈 배열 가드) |
| `src/resolver/projectCalendar/ProjectCalendarService.js` | 루트 팀 축 2필드 + 조기 반환 동기화 + degrade |

### P2-c 파일 미접촉 (단독 롤백 보존)

**P2-b 변경 집합에 포트폴리오/대시보드 파일이 하나도 없다**(작업트리 diff 로 확인).

⚠ 정확히 말하면: `PortfolioDashboardService.js`·`PortfolioAggregator.js` 는 **P2-a 에서 수정됐고 이미 커밋됐다**(`3a7ee41`).
P2-b 는 그 파일들을 **추가로 건드리지 않았다**. P2-c 가 손댈 표면 — **U12 인건비 게이트**(`salary`/`totalSalary`/`salaryBuckets`
키 삭제 + `costMasked`) · **`CostAccess.js`**(미생성) · `portfolioAggregate.js` · N6 비교 위젯 축 — 은 **전부 원상태**다.

---

## P2-b-6. `npm test` 결과 (원문)

```
Test Suites: 39 passed, 39 total
Tests:       669 passed, 669 total
Snapshots:   0 total
Ran all test suites.
```

- P2-b 착수 시점 **640 → 669** (+29). 실패 0. **회귀 없음.**

| 테스트 | 건수 | 고정 대상 |
|---|---|---|
| `MyTeamAnalysisService.test.js` | 18 | **인원 축 leadingScope 제한**(소속만 한 팀 배제 · payload 로 확대 불가 · users 재교집합) · **빈 집합 시 쿼리 0** · **null 유지(`?? 0` 금지)** · `hasWeightedMetrics` 부분집계 판정 · **재무 필드 부재(직렬화 검사)** · teamMeta 배열 형태 · 빈/정상 경로 루트 키 동일 |
| `ProjectCalendarTeamAxis.test.js` | 9 | `memberTeamMap` 형태 · **미소속자 키 부재** · `teamMeta` 객체 맵 · **원천이 프로젝트 인력** · **조기 반환 루트 키 1:1** · degrade(SQL/KVS 실패) |
| `teamLead.contract.test.js` | +2 | N7 `grants:[]` + `teamLead` 단독 · `getResourceProfile` 기존 grant 유지 |

### 무회귀 확인
C1 read-merge · 팀 필터 3상태 · `toRecord` 빈 문자열 0 · `whereIn([])`/`IN ()` 가드 ·
`leadingScope` vs `scope` 분리 · cascade 5단계 · **`TableReadiness` 4경로** · U7~U12 — 전부 통과.

---

## P2-b-7. 미확정 · 인계

| # | 항목 |
|---|---|
| **P2b-U1** | **`aggregateByTeam` 의 첫 실사용이다.** 내가 내보내는 `teamMeta`(배열)·`utilization`/`investedMd`/`availMd`(null 가능)를 프론트가 실제로 돌려봐야 한다. P2a-F1 이 정확히 이 축의 불일치였다 |
| **P2b-U2** | **`teamKey` 필수**(위 규칙 1). 프론트가 빠뜨리면 팀장에게 **PERMISSION_DENIED** 가 나간다 — 빈 화면이 아니라 에러다. 관리자(`isAdmin`)는 grants 우회로 통과하지만 `leadingScopeAccountIds=[]` 라 빈 결과를 받는다(M-3 의도) |
| **P2b-U3** | N5 프론트: 필터를 **`useProjectWorkersSchedule.js:40` `filtered` 단계에만** 얹고 그룹 키(`:47`)·`+1일 보정`(`:61`)은 건드리지 말 것. 회귀 가드로 "필터 전후 살아남은 이벤트의 `start`/`end` 바이트 동일"을 단언할 것 |
| **P2b-U4** | N7 실기동 미검증 — 실제 팀장 계정으로 `/my-page` 진입 시 `getMyTeamWorkAnalysis` 가 통과하는지(로컬은 principal mock) |
| **P2b-U5** | P2-c 착수 시 `CostAccess.js` 신규 + U12 게이트. **이번 회차에 대시보드 파일을 하나도 안 건드렸으므로 롤백 단위가 깨끗하다** |

---

# P2-c — N6(대시보드 팀별 비교) + U12(포트폴리오 인건비 게이트)

## 🚨 P2-c-00. 커밋 상태 경고 — **HEAD 가 깨져 있다 (즉시 조치 필요)**

작업 중 커밋(`a6e602e`·`f9eeb78`)이 **내 편집 중간 상태를 잡아갔다.**

```
HEAD:src/resolver/projectDashboard/ProjectDashboardService.js:9
    import {canReadCost, COST_DENIED_REASON} from "../../permission/CostAccess";

$ git cat-file -e HEAD:src/permission/CostAccess.js
fatal: path 'src/permission/CostAccess.js' exists on disk, but not in 'HEAD'
```

**→ HEAD 를 clean checkout(신규 clone·CI)하면 존재하지 않는 모듈을 import 해 앱 전체가 로드에 실패한다.**

⚠ **로컬 테스트로는 절대 잡히지 않는다** — 파일이 디스크에 있어 682건이 전부 통과한다.
이번 회차에 반복된 "배포 후에만 드러나는 계열"(U3·`v014`)과 같은 유형이며, 이번엔 **git 인덱스 축**에서 났다.

### 조치 (미커밋 상태로 남겨둔다 — 커밋은 요청받지 않았다)

정확히 **2개 파일**을 추적에 추가하면 해소된다. 전수 확인 결과 **HEAD 가 import 하는 미추적 파일은 이것 하나뿐**이다:

```bash
git add src/permission/CostAccess.js \
        src/resolver/portfolioDashboard/__test__/PortfolioCostGate.test.js \
        src/resolver/portfolioDashboard/PortfolioDashboardService.js
```

| 파일 | 상태 | 비고 |
|---|---|---|
| `src/permission/CostAccess.js` | **미추적** | 🚨 HEAD 가 import 함 — **이것이 원인** |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | 미커밋 수정 | U12 게이트 본체 |
| `src/resolver/portfolioDashboard/__test__/PortfolioCostGate.test.js` | 미추적 | U12 회귀 가드 |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | **이미 커밋됨** | 깨진 import 를 가진 쪽 |

---

> 작성: 2026-07-28 / backend-engineer
> 범위: **P2-c 백엔드.** DB 마이그레이션 없음 · `SEED_VERSION` 변경 없음 · 신규 테이블/KVS 없음 → **배포 순서 제약 없다.**
> N6 위젯·`teamComparison` 순수함수·프론트 게이팅 7지점은 **프론트 담당**(§P2-c-4).

## 🔴 P2-c-0. 기존 동작 축소 — 누가 무엇을 못 보게 되는가

**의도된 보안 수정이며 회귀가 아니다.** 다만 **배포 노트에 반드시 적어야 한다.**

### 누가

| 대상 | `PROJECT_COST read` | 영향 |
|---|---|---|
| Jira 관리자(`isAdmin`) | 바이패스 | **영향 없음** |
| 시드 **Admin** 세트 | `t` | **영향 없음** |
| 프리셋 **PM** / **PMO** | `rw` / `r` | **영향 없음** |
| **시드 Member** | `ff` | 🔴 **아래 전부 사라진다** |
| 프리셋 **Team Lead** / **Team Member** | `ff` | 🔴 **아래 전부 사라진다** |
| 커스텀 세트 | `defaultForNew: ff` | 🔴 명시적으로 켜지 않았으면 사라진다 |

> 즉 **`REPORT read` 는 있는데 `PROJECT_COST read` 는 없는 사용자** — 시드 구성상 **일반 사용자 대다수**다.

### 무엇을 (전부 `/dashboard` 전사 통합 대시보드)

| # | 위치 | 사라지는 것 |
|---|---|---|
| 1 | `PortfolioFilterBar` 합계 칩 | `₩{totalSalary}M` — **모든 탭에서 상시 노출되던 자리** |
| 2 | 종합 개요 `PortfolioTsrSignalTable` | salary 컬럼 |
| 3 | 종합 개요 Cost 신호등 | `costLevel`/`cpi`/`burnRate` — `totalSalary` 기반이라 0원 기준 오신호가 된다 |
| 4 | 풀 수치표 `PortfolioProjectTable` | salary 컬럼 |
| 5 | **Cost 탭 전체** | KPI·초과랭크·산점도 |
| 6 | `ComparisonTabs` | `salaryBuckets` 뷰 |
| 7 | **N6 팀 비교 위젯** | 인건비 축(축 선택지에서 제거, 정렬은 MD 폴백) |

### 무엇은 그대로인가

프로젝트 목록·지표·완성률·일정률·리스크·문제이슈·**가동률**·**투입 공수(MD)**·**완수율**·팀 축(`teamMeta`/`memberTeamMap`) —
**인건비 축만 제거**한다. **화면 전체를 막지 않는다.**

### ⚠ 서버만 하고 프론트를 안 하면 "₩0" 이 표시된다

**서버 필드 제거는 필요조건이지 충분조건이 아니다.** 프론트 급여 소비부가 전부 `?? 0` 폴백이라
(`portfolioAggregate.js` 8곳 + `PortfolioSalaryByProject.jsx:65`), JS 에서
**`undefined ?? 0` 과 `null ?? 0` 은 똑같이 `0`** 이다 → **키를 지워도 "₩0" 이라는 거짓 숫자가 그대로 나온다.**

> **거짓 숫자를 실제로 막는 방어선은 서버가 아니라 `costMasked` 기반 UI 게이팅**이다.
> 프론트 7지점(§P2-c-4)을 **같은 배포에 함께 내야 한다.**

---

## P2-c-1. 응답 계약 변경 — **프론트 필독**

### `getPortfolioDashboard` (루트 직접 — `content` 래퍼 **없음**)

```js
// PROJECT_COST read 보유 — 기존과 100% 동일 + costMasked 1필드
{
  success: true,
  lastAggregatedAt, aggregateStatus, projects, roleMeta, levelMeta,
  teamMeta, memberTeamMap,              // P2-a
  salaryBuckets: [ ... ],               // 그대로
  costMasked: false,                    // ★ 신규
  utilization, utilizationBands, scopeBands, problemIssues
}

// PROJECT_COST read 없음 — 급여 3필드가 **키 자체로 사라진다**
{
  success: true,
  lastAggregatedAt, aggregateStatus,
  projects: [ {
      ...,
      // ❌ totalSalary  — 키 없음
      members: [ { accountId, displayName, roleKey, levelKey, effortMd, utilization } ]
      //                 ❌ salary — 키 없음
  } ],
  roleMeta, levelMeta, teamMeta, memberTeamMap,
  // ❌ salaryBuckets — 키 없음
  costMasked: true,                     // ★ 이것으로 UI 를 게이팅한다
  utilization, utilizationBands, scopeBands, problemIssues
}
```

| 필드 | 규칙 |
|---|---|
| `costMasked` | **항상 존재**(`boolean`). `emptyShape()` 에도 있다 |
| `salaryBuckets` · `projects[].totalSalary` · `projects[].members[].salary` | `costMasked===true` 면 **키 자체가 없다**(`null` 아님) |

- **`emptyShape()` 도 같은 규칙**을 따른다 — `costMasked` 는 **하드코딩 `false` 가 아니라 `!canReadCost(principal)`** 다(L-2).
  하드코딩하면 프론트가 인건비 UI 를 열어둔 채 빈 응답을 기다린다. **빈 응답과 정상 응답의 루트 키 집합이 같음**을 테스트로 고정.
- ⚠ **`content` 로 감싸지 않는다.** 이 응답은 루트 직접 노출이다(`getProjectCostSummary` 와 같은 함정).

### H-2 — `teamMeta` 3층 규칙 (프론트가 다르게 구현하지 않도록 명시)

| 층 | 정의 | 스코프 | 서버/프론트 |
|---|---|---|---|
| **`teamMeta`** | 이름 사전. `{ "<teamKey>": "<name>" }` — **전체 팀** | 좁히지 않는다 | **서버** |
| **`memberTeamMap`** | `{ "<accountId>": "<teamKey>" }` — **전 사용자**(미소속자는 키 부재) | 좁히지 않는다 | **서버** |
| **선택지(옵션)** | `projects[].members[]`(**이미 스코프 적용됨**)의 accountId → `memberTeamMap` 사상 → 등장하는 teamKey 집합 | **여기서만 좁힌다** | **프론트** |

> **서버는 관례대로 넓게 주고, 스코프 일치는 클라이언트 파생 규칙이 보장한다.**
> - **`teamMeta` 키를 순회해 옵션을 만들면 전체 팀이 나온다 — 절대 그렇게 하지 말 것.**
> - **`utilization.people[]` 을 옵션 소스로 쓰지 말 것** — 이 배열은 **필터 무관 글로벌**이라 스코프 밖 사람이 섞여 있다(M-1).
> - 팀 이름·소속은 비민감 판정이므로 넓게 주는 것이 노출이 아니다(H4 에서 "TEAM_ONLY 는 인원 축을 좁히지 않는다"로 이미 선언).

---

## P2-c-2. `CostAccess.js` 승격 — 동작 차이 0 을 확인했다

```js
// src/permission/CostAccess.js (신규)
export const COST_DENIED_REASON = 'PROJECT_COST_REQUIRED';
export const canReadCost = (principal) =>
    principal?.isAdmin === true || principal?.resourceMap?.PROJECT_COST?.read === true;
```

| 확인 항목 | 결과 |
|---|---|
| 백엔드 복사본 개수 | **1개**(`ProjectDashboardService.js:135`). N6 가 만들면 2번째였다 (L-6 정정 — 초안의 "3번째"는 과장) |
| 승격식 | **문자 그대로 동일**. `=== true` 비교라 `isAdmin:1`·`read:'yes'` 같은 truthy 는 통과하지 않는다 — 테스트로 고정 |
| `principal` 부재 | `undefined === true` → false = **fail-close**. 기존과 동일 |
| `reason` 문자열 | U7 이 쓰던 `'PROJECT_COST_REQUIRED'` **글자 그대로 재사용**(프론트 분기가 이미 존재) |
| 기존 호출부 | `ProjectDashboardService` 의 private 복사본을 import 로 **대체**. `SalaryChartGate.test.js` 통과(무회귀) |

---

## P2-c-3. 설계서 주장 2건을 **실제로 확인했다**

설계서가 외부 검토서를 정정한 부분이라 직접 재실측했다.

| 주장 | 실측 | 판정 |
|---|---|---|
| 검토서: "`PortfolioProjectTable` 은 고아라 무관" → **설계서: 고아가 아니다** | `PortfolioTsrSignalTable.jsx:11` 에서 import, **`:165` 에서 렌더**(신호등 ⇄ 풀 수치표 토글) | **설계서가 맞다** ✅ 게이팅 대상 #4 는 실재한다. 검토서대로 갔으면 이 컬럼이 "₩0" 으로 남았다 |
| 코디네이터 초안: "급여 전용 위젯 2개도 게이팅" → **설계서: 진짜 고아다** | `PortfolioSalaryByProject`·`PortfolioSalaryHistogram` 외부 참조 **0건** | **설계서가 맞다** ✅ 죽은 코드를 게이팅하면 커버리지 착각만 생긴다 → §10 U16(고아 위젯 정리)로 분리 |

---

## P2-c-4. 프론트 담당 (백엔드 범위 밖)

**서버는 원본을 없앴을 뿐이다. 거짓 숫자를 막는 것은 프론트다.**

### 게이팅 7지점 (`costMasked === true` 일 때)

| # | 파일 | 조치 |
|---|---|---|
| 1 | `PortfolioFilterBar.jsx:119-121` | 합계 칩 **숨김** |
| 2 | `PortfolioTsrSignalTable.jsx:97,140` | salary 컬럼 **제거** |
| 3 | `PortfolioTsrSignalTable.jsx:53,57,81,136` | Cost 신호등(`costLevel`/`cpi`/`burnRate`) **제거** |
| 4 | `PortfolioProjectTable.jsx:52,90` | salary 컬럼 **제거** (⚠ 고아 아님) |
| 5 | Cost 탭 3위젯 | **안내 문구로 대체**(빈 차트 금지) |
| 6 | `ComparisonTabs` `salaryBuckets` | 미전달 + 해당 뷰 숨김 |
| 7 | N6 팀 비교 위젯 인건비 축 | 축 선택지 **제거** + 정렬 **MD 폴백** |

`costMasked` 를 `PortfolioFilterBar`·`PortfolioTsrSignalTable`(→`PortfolioProjectTable`)·`ComparisonTabs` 에 prop 으로 내린다.

### N6 위젯

- `portfolioAggregate.js` 에 **`teamComparison(selected, memberTeamMap, teamMeta, utilizationPeople, { axis, topN })`** 순수함수 1개.
  ⚠ **`utilizationPeople` 인자가 반드시 필요하다**(M-1) — 가동률(①글로벌)은 `projects[]` 가 아니라 `utilization.people[]` 에서 온다.
  `costByRoleLevel`(`:468-491`)이 **가장 가까운 템플릿**이고 `keyField` 만 `teamKey` 로 바꾸면 된다.
- **4축**: 가동률(가중 `Σ investedMd / Σ availMd`) · 투입 공수(**MD**, MM 아님) · 완수율(B, 팀 MD 가중) · 인건비(`costMasked` 면 제거)
- **🔴 가동률만 프로젝트 필터에 반응하지 않는다**(항상 전사) — 분모 `availMd` 가 전 프로젝트 참여 구간 union 이라 부분집합 재계산이 불가능하다. **전용 InfoTip 필수**: "가동률은 전사 기준이며 프로젝트 선택의 영향을 받지 않습니다."
- **미선택 시**: 상위 10팀 + **`기타(N개 팀)`** + `팀 미지정`(마지막). **`기타` 묶음은 합계 보존용**이다 — 잘라내기만 하면 "팀 소계 합 ≠ 전체"가 되어 §R6 결함과 같아진다.
- **인원수는 accountId dedup, 공수·인건비는 dedup 하지 않는다**(프로젝트별 기여의 합). 이 비대칭을 InfoTip 에 명시하지 않으면 "인원 10명인데 인건비 15명분"으로 보인다.
- 배치 미실행 구간: `investedMd`/`availMd` 가 `null` → **0% 로 그리지 말고** `aggregateStatus`/`lastAggregatedAt` 로 "집계 전" 표기.
- `TeamSelect` 는 **`isMulti` 1건만** 추가(신규 prop 0). 옵션 축소는 기존 **`excludeValues`** 로 한다 — 파생 옵션 주입은 `depth`/`parentTeamKey` 가 없어 계층 들여쓰기가 사라진다(M-4).
- `PortfolioTeamDist`(구성비)는 **범위 제외**(L-4). 만들지 말 것.

---

## P2-c-5. 신규/변경 파일

### 신규 (2)
| 파일 | 내용 |
|---|---|
| `src/permission/CostAccess.js` | `canReadCost` + `COST_DENIED_REASON` — 재무 열람 판정 단일 출처 |
| `src/resolver/portfolioDashboard/__test__/PortfolioCostGate.test.js` | 13건 |

### 수정 (2)
| 파일 | 변경 |
|---|---|
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `stripMemberCost` + 급여 3필드 조건부 제거 + `costMasked` + `emptyShape` 동기화 |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | private `canReadCost` 복사본 → `CostAccess` import 로 대체(동작 무변경) |

### 서비스 내부 소비자 확인
`getPortfolioDashboardService` 를 `src/` 전역 grep → **소비자는 `PortfolioDashboardController` 뿐**이다.
`getProjectStatusListService` 유형(백엔드 내부 소비자 누락) 회귀 없음.

---

## P2-c-6. `npm test` 결과 (원문)

```
Test Suites: 40 passed, 40 total
Tests:       682 passed, 682 total
Snapshots:   0 total
Ran all test suites.
```

- P2-c 착수 시점 **669 → 682** (+13). 실패 0. **회귀 없음.**

| 테스트 그룹 | 고정 대상 |
|---|---|
| `CostAccess` 승격 | admin/PROJECT_COST read → true · **principal 부재 fail-close** · **truthy 우회 차단**(`isAdmin:1`, `read:'yes'`) · reason 문자열 |
| U12 미보유 응답 | **급여 3필드 키 부재 + 직렬화 문자열에 `salary` 0건** · `costMasked:true` · **급여 외 필드 무변경** |
| U12 보유 응답 | admin·PROJECT_COST read 둘 다 **완전 무변경** |
| `emptyShape` | 권한별 `salaryBuckets` 유무 · `costMasked` 값 · **빈/정상 루트 키 집합 동일** |
| P2-a 무회귀 | `teamMeta`/`memberTeamMap` 은 권한과 무관하게 항상 실린다(재무가 아니다) |

---

## P2-c-7. 미확정 · 인계

| # | 항목 |
|---|---|
| **P2c-U1** | 🔴 **프론트 게이팅 7지점을 같은 배포에 함께 내야 한다.** 서버만 배포하면 `?? 0` 폴백 때문에 **"₩0"·"₩0M" 이 상시 노출**된다 — 지금보다 나쁜 상태다 |
| **P2c-U2** | **배포 노트 필요** — §P2-c-0 의 "누가/무엇을" 표를 그대로 쓸 것. 일반 사용자 대다수가 대시보드에서 인건비를 못 보게 된다 |
| **P2c-U3** | `getPortfolioDashboard` 외에 **다른 경로로 급여가 새는지**는 이번 범위에서 확인하지 않았다. 알려진 잔존: **U10**(`findProjectusersByProjectId` 의 `projectusers.salary`) — P0 에서 SELECT 제거로 이미 닫혔고, `getProjectSalaryList`/`getProjectCostSummary` 는 원래 `PROJECT_COST` 게이트다 |
| **P2c-U4** | §10 **U16** — 고아 위젯 `PortfolioSalaryByProject`·`PortfolioSalaryHistogram` 삭제 권고. 되살아나면 게이트 없이 급여가 노출된다 |
| **P2c-U5** | N6 위젯·`teamComparison` 실기동 미검증(프론트 미구현). `utilizationPeople` 인자 누락 시 가동률 축이 **계산 불가**임에 주의 |
