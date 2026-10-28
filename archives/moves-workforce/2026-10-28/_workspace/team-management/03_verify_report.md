# 팀(Team) 기능 — 통합 정합성 검증 리포트 (P0 + P1)

> **⚠ 이 문서는 3차 갱신본이다. 절 번호가 곧 검증 회차다.**
>
> | 절 | 회차 | 대상 | 최종 판정 |
> |---|---|---|---|
> | §1~§6 | 1차 | **P0** | 실패 3(F1/F2/F3) · 관찰 8 — **수정 전 상태의 기록. 이력으로만 읽을 것** |
> | §7 | 2차 | **P0 재검증** | F1/F2/F3/O1 **전부 닫힘** / 신규 실패 1(F4, Low-Medium) / 관찰 4 |
> | §8 | 3차 | **P1(권한 확장)** | 실패 0 / 관찰 7 / 미검증 9 — 배포 판정 충족 |
> | §9 | 4차 | **실기동 수정 4건** | 수정 4건 전부 통과 / 신규 실패 1(RT-F1, Medium — 기존 잠재) / 관찰 5 |
> | §10 | 5차 | **P2-a(프로젝트-팀 배정)** | 검증 대상 4건 전부 통과 / 신규 실패 1(P2a-F1, Medium — 잠재) / 관찰 6 |
> | §11 | 6차 | **P2-b(N7 팀 업무 분석 + N5 캘린더)** | 검증 대상 5순위 중 4 통과 / 신규 실패 1(P2b-F1, Medium) / 관찰 4 |
> | **§12** | **7차** | **P2-c(N6 팀 비교 + U12 인건비 게이트)** | **게이팅 7지점·백엔드·N6 전부 통과** / 신규 실패 2 — **1건은 배포 차단** |
>
> ## 🚩 배포 차단 1건 — **P2c-F1**(§12-1)
> `HEAD` 가 `src/permission/CostAccess.js` 를 import 하는데 그 파일이 **커밋되지 않았다.**
> import 그래프 2,040 간선 전수 확인 결과 **깨진 것은 이 1건**이고, 하필 `src/index.js`(manifest `resolver` 엔트리)에서
> 도달 가능한 경로라 **clean checkout 시 전 resolver 가 로드 실패**한다. 파일이 디스크에 있어 로컬 682건은 전부 통과한다.
> → **[§12-9 배포 전 필수 조치](#12-9--배포-전-필수-조치-목록)** 를 수행하기 전 배포 금지.
>
> **누적 미해결 4건** (P2a-F1 은 §11-1 에서 해소 확인)
> - **P2c-F1**(§12-1) 🚨 배포 차단 — 위 참조.
> - **P2c-F2**(§12-2) — 게이팅 7지점을 **하나씩 실제로 제거**해보니 회귀 가드가 **6/7만 검출**. #2 는 이웃 게이트를 빌려 통과한다.
> - **RT-F1**(§9-2) — `getBulkJiraUsersApi` 가 청크 실패 시 `[]` 원소를 섞어 "항상 배열" 계약을 깨고 4개 도메인에서 `TypeError`.
> - **P2b-F1**(§11-4) — 팀 소계가 `todo/inProgress/done` 을 합산하는데 coworker 참여자마다 +1 되어 **중복 계상**된다.
> 네 건 모두 **빌드·테스트가 전부 초록인 상태에서** 교차 대조·변이 검증으로만 드러났다.
>
> 검증은 매 회차 **실제 소스를 로드해 실행**했다 — P1 권한 판정 52건, 시드 프리셋 29건,
> P2-a 테이블 부재 31건 · 팀 롤업 26건, P2-b 실응답 롤업 28건 · N7 권한 축 29건,
> P2-c 게이팅 변이 7건 · 백엔드 게이트 19건 · N6 27건, 랜덤 대조 3만여 건.

---

## (1차) 검증 리포트 — 초판 기록

> 작성: 2026-07-27 / integration-verifier
> 입력: `01_architect_design.md`(§3 경계면 계약 / §9 P0 / §14), `02_backend_report.md`, `02_frontend_report.md`, **실제 소스**
> 방법: 리포트 주장은 근거로 쓰지 않았다. 모든 항목을 생산자·소비자 소스를 **같이 열어** 대조했고, 일부는 실행 시뮬레이션으로 확인했다.

**판정 요약(1차): 실패 3 / 관찰 8 / 미검증 6. 나머지 통과.**
P0 계약(C1 read-merge · 팀 필터 3상태 · 빈 집합 가드 · 권한 매핑 · i18n · 무회귀)은 **전부 통과**했다.
실패 3건은 **모두 하나의 근본 원인**(사이클 응답의 자기모순) 또는 **캐시 read-after-write** 로, 정상 데이터 흐름이 아니라 **이상 데이터 복구 경로**와 **쓰기 직후 화면**에 몰려 있다.

---

## 1. 실패 (FAIL)

### F1 (High) — 사이클이 기록되면 **팀 트리에서 해당 서브트리가 통째로 사라진다**

**경계면**: `getTeamList.content.teams[].parentTeamKey` (생산) ↔ `buildTeamTree` (소비)

| 위치 | 코드 | 값 |
|---|---|---|
| 생산 | `src/resolver/backoffice/team/TeamService.js:118` | `parentTeamKey: team.parentTeamKey ?? null` — **KVS raw 값** |
| 생산 | `src/resolver/backoffice/team/TeamService.js:119` | `depth: index.depthOf.get(...) ?? 0` — **사이클 강등이 반영된 값(0)** |
| 소비 | `static/ui/src/backoffice/page/team/buildTeamTree.js:42-46` | `byKey.get(node.parentTeamKey)` 로 **재연결** |

`buildTeamIndex`(`TeamTree.js:106-109`)는 사이클 노드를 **내부 `parentOf` 에서만** 루트로 강등한다. 응답에 실리는 `parentTeamKey` 는 원본 그대로다. 즉 응답이 **자기모순**이다 — `depth:0`(루트)인데 `parentTeamKey` 가 non-null.

프론트는 `depth` 가 아니라 `parentTeamKey` 로 트리를 만들기 때문에 **백엔드가 끊어놓은 사이클을 그대로 복원**하고, 사이클 구성원과 그 후손이 `roots` 에서 사라진다.

**실측(시뮬레이션, `buildTeamTree.js` 원본 로드)**
```
입력 teams: a(parent=b), b(parent=a), c(parent=a), d(parent=null)   ← getTeamList 응답 재현
roots        : ["d"]
rendered rows: ["d"]           ← a, b, c 가 화면에서 완전히 소실
```
경고 배너(`hasCycle`)는 뜨지만, **정작 고쳐야 할 팀을 트리에서 선택할 수 없어 편집 모달에 도달할 방법이 없다.** 읽기 측 사이클 방어(루트 강등 + `cycleKeys` 노출)의 목적이 프론트에서 무효화된다.

> 참고: dangling parentTeamKey(존재하지 않는 부모)는 `byKey.get()` 이 undefined 라 프론트도 루트로 승격한다 — **정상**(시뮬레이션 확인: `["x","d"]`). 문제는 **상호 참조 사이클**뿐이다.

**부정확한 주석**: `buildTeamTree.js:15-19` 는 "사이클은 백엔드가 이미 끊어(cycleKeys) 루트로 강등해 내려주지만" 이라고 적었으나 **사실이 아니다.** 이 잘못된 전제가 결함의 원인이다.

**테스트 공백**: `buildTeamTree.test.js:136,185` 의 "사이클이 있어도 종료한다" 2건은 `collectAncestorKeys` / `collectSelfAndDescendantKeys` 만 검증한다. **`buildTeamTree` 자체에 사이클 입력을 넣는 테스트가 없다.**

**수정(권장 — 생산 측)**
```js
// TeamService.js getTeamListService (그리고 getTeamOptionsService 도 동일)
const demoted = new Set(index.cycleKeys);
...
parentTeamKey: demoted.has(team.teamKey) ? null : (team.parentTeamKey ?? null),
```
→ `depth` 와 `parentTeamKey` 가 같은 사실을 말하게 된다. 추가로 프론트 `buildTeamTree` 에 **조상 체인 재방문 시 루트 승격** 방어를 넣고, 위 입력(a↔b + c)으로 회귀 테스트를 추가할 것.

---

### F2 (Medium) — 사이클/손상 부모 노드의 편집 모달이 **상위 팀 이름 대신 UUID** 를 표시한다

**경계면**: `findTeamById.content.ancestors` (생산) ↔ 편집 모달의 "상위 팀" 라벨 유도 (소비)

| 위치 | 코드 |
|---|---|
| 생산 | `TeamService.js:173-178` — `ancestors = pathOf.slice(0,-1)`. 강등 노드는 `pathOf=[self]` → **`ancestors = []`** |
| 생산 | `TeamService.js:206` — `team.parentTeamKey` 는 **raw 유지(non-null)** |
| 소비 | `useTeamEditModal.js:61` — `parentTeam = ancestors.length ? ancestors[ancestors.length-1] : null` |
| 소비 | `useTeamEditModal.js:65-67` — `parent: team.parentTeamKey ? { value: team.parentTeamKey, label: parentTeam?.name ?? team.parentTeamKey } : null` |

**프론트 리포트 §4-1의 "루트 팀이면 `ancestors=[]` 이고 `parentTeamKey` 도 null 이라 분기가 겹치지 않는다" 는 거짓이다.**
`ancestors=[]` ∧ `parentTeamKey != null` 인 상태가 존재한다 — **사이클 구성원 / 자기참조 / dangling parent** 3종.
이 경우 `parentTeam` 이 `null` 이라 `?? team.parentTeamKey` 폴백이 걸려 Select 에 **`"team-3f2a-9c1e-…"` 원시 UUID** 가 렌더된다.

3케이스 검증 결과:

| 케이스 | `ancestors` | `team.parentTeamKey` | 라벨 | 판정 |
|---|---|---|---|---|
| 루트 팀 | `[]` | `null` | (Select 비어 있음) | ✅ 정상 |
| 깊이 1 | `[root]` | `root` | `root.name` | ✅ 정상 (마지막 원소 = 직속 부모, `pathOf` 정의상 항상 성립) |
| 깊이 N | `[root,…,parent]` | `parent` | `parent.name` | ✅ 정상 |
| **사이클/자기참조/dangling** | `[]` | `"team-…"` | **원시 UUID** | ❌ |

부수 증상: `TeamDetailPanel.jsx:94-95` 가 같은 노드를 `t('team.tree.root')` 로 표기한다(사이클 노드를 "최상위 팀"이라고 오표기).

**수정**: F1 과 근본 원인이 같다. F1 수정(강등 노드의 `parentTeamKey` 를 null 로 정규화)을 `findTeamById` 에도 적용하거나, **더 나은 방법으로 `findTeamById.content.team` 에 `parentTeamName` 을 직접 실어 보내면** 프론트의 유도 자체가 사라진다(계약 표에 없던 필드지만 **추가만**이라 무회귀).

---

### F3 (Medium) — 팀 CRUD 직후 목록이 **최대 60초 옛 데이터**일 수 있다 (read-after-write)

| 위치 | 내용 |
|---|---|
| `TeamTreeCache.js:22` | `TTL_MS = 60 * 1000` |
| `TeamTreeCache.js:57-66` | `getTeamIndex()` — 모듈 스코프 캐시 |
| `TeamTreeCache.js:68-72` | `invalidateTeamIndex()` — **호출된 인스턴스에만 적용**(파일 주석이 스스로 명시) |
| `TeamService.js:97 / 151 / 224` | `getTeamListService` · `findTeamByIdService` · `getTeamOptionsService` 전부 **캐시 읽기** |
| `UserService.js:135` | `roleLevelMap()` → `getTeamIndex()` (사용자 목록의 `teamName`) |

프론트는 write 성공 즉시 `TeamPage.refreshTeams()`(`TeamPage.jsx:92-100`)로 refetch 하지만, Forge 는 컨테이너가 다중 인스턴스라 **다른 warm 컨테이너로 라우팅되면 방금 만든/지운 팀이 그대로 나온다.**

구체적 발현:
1. 팀 생성 → 목록에 없음 → 사용자가 다시 생성 → `addTeamService` 는 fresh 로드(`TeamService.js:248`)라 **`TEAM_NAME_DUPLICATED`** 거부 → "만든 적 없는데 중복이라고 한다".
2. 팀원 배치 직후 사용자 목록의 팀 컬럼이 `-` 로 보임(`teamMap` 이 stale).
3. 팀 삭제 직후 트리에 유령 팀이 남음.

설계서 §R1 은 "읽기 경로(`resolvePrincipal`, `getTeamList`, 분석 화면)는 캐시를 계속 쓴다"고 명시했으므로 **구현은 설계를 지켰다.** 다만 그 근거(90초 stale 수용)는 전부 **권한 판정** 맥락이며, **CRUD 화면 자신의 read-after-write 는 설계서에서 분석되지 않았다.** 그래서 설계 결함으로 보고한다.

**수정(저비용)**: `getTeamListService` / `findTeamByIdService` 만 `loadTeamIndexFresh()` 로 전환한다.
- 백오피스 팀 화면은 트래픽이 극소(조직 개편 시에만)라 KVS 커서 루프 1회 추가 비용이 무시 가능하다 — 이미 `addTeam`/`updateTeam`/`deleteTeam` 이 같은 근거로 fresh 로드를 쓴다(§R1 M1).
- `getTeamOptions` 와 `UserService.roleLevelMap()` 의 팀 이름 맵은 **캐시 유지**(사용자 목록 조회마다 도는 경로 — L2 근거 그대로).

---

## 2. 미검증 (로컬에서 증명 불가 — 배포/E2E 필요)

| # | 항목 | 확인 방법 |
|---|---|---|
| U-1 | KVS `cursor()` / `nextCursor` **런타임** 동작 (`CustomEntityManager.findAllPaged`) | 팀 100개 초과 상태에서 `getTeamList` 호출 → 전량 수집·`truncated:false` 확인 |
| U-2 | KVS integer attribute `sortOrder` 에 **0 저장** 시 422 여부 | `forge tunnel` 에서 최초 `addTeam` 1회 |
| U-3 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` TiDB 동작 | v012 선례 있음. `runMigration` 로그로 `v013_alter_users_add_team_key` 확인 |
| U-4 | `forge deploy` 선행(KVS `team` 엔티티 선언) 없이는 `addTeam` 422 | 배포 순서 준수 여부 |
| U-5 | 배포 후 **커스텀 권한 세트에 `TEAM_MANAGEMENT` 를 수동 부여**해야 함 (`migrateFrom` 미지정 — 의도) | Jira ADMINISTER 보유자만 즉시 접근. 운영 안내 필요 |
| U-6 | 실 UI E2E 전반(트리 성능 100팀+, `getTeamOptions` 실패 시 fail-soft UX, 팀원 배치 페이지네이션) | tunnel/스테이징 |

**F1/F2 는 미검증이 아니다** — 순수 함수 시뮬레이션과 소스 대조로 로컬에서 증명했다.

---

## 3. 관찰 (구현·운영 영향 있으나 P0 차단 아님)

| # | 위치 | 내용 |
|---|---|---|
| O1 | `JiraUserSelect.jsx:60-86` ↔ `useTeamEditModal.js:68-75` | **다중 shape 재사용.** `UserSingleValue` 는 `data.{name,avatarUrl,email}` 을 읽는데, 편집 모달이 손으로 만든 leader 객체에는 **`email` 이 없다**(옵션 로더 `:19-25` 는 넣는다). → 저장된 팀장에 이메일 줄이 안 보이다가, 드롭다운에서 다시 고르면 보인다. `data.email &&` 가드가 **에러 없이 삼킨다**. `avatarUrl`(`['24x24']`)·`name` 은 일치. 저위험이나 과거 `ScopeSplitCell` 과 동형 패턴이라 기록 |
| O2 | `components/dropdown/BackofficeDropdown.jsx:48-97` | 팀 항목이 **없다**(사이드바에만 있음). `common.backoffice.workforceSetting.team.description` 키를 추가해 놓고 **아무도 쓰지 않는다** → 원래 추가하려던 것이 누락된 정황. (skill 도 동일 누락 — 기존 갭) |
| O3 | `locales/kr\|en/team.json` | 미사용 키 7종: `team.tree.title`, `team.col.{name,parent,leader,memberCount}`, `team.placeholder.leader`, `team.myTeam.title`(P1 "내 팀" 섹션 키) |
| O4 | `TeamRepository.js:26` | `findAccountIdsByTeamKeys` 는 P0 에서 **호출부 0**(테스트만). P1/P2 선행 구현 |
| O5 | `UserPage.jsx:161-164` | StatCard 4개 중 team 만 `t('user.stat.team')`, 나머지 3개는 하드코딩 `"Permission"/"Role"/"Level"`. 시각적 불일치 |
| O6 | `UserService.js:709` | `getUserMetaCount.team` 의 `name:'Unassigned'` 미번역. 기존 role/level/permission 규약 준수이며 프론트가 사전 고지(§4-4 #3) — 별건 |
| O7 | `useTeamEditModal.js:82` | 초기화 effect 의존성에 `permissionOptions` 포함. `getPermissionList` 가 **실패**하면 `useRoleLevelPermissions` 의 `permissions` 기본값 `[]` 이 매 렌더 새 참조가 되어 폼이 계속 초기화될 수 있다(에러 상황 한정) |
| O8 | `useUserEditModal.js:85-87` **(기존 결함)** | role/level/permission 옵션 조회가 **실패**하면 initData 가 전부 `null` 이 되고, 저장 시 `?? null` 로 **실제 해제**된다. `team` 은 `findUserByAccountId` 응답에서 직접 유도(`:90-92`)해 이 함정을 피했다 — **잘한 부분**. 다만 P1 에서 `permission_key = NULL` 이 "팀 상속"이 되면 이 기존 함정의 위험도가 올라간다. **P1 착수 전 처리 권고** |

---

## 4. 통과 (근거만 짧게)

### C1 read-merge 불변식 — **SQL 레벨까지 성립** ✅

| 층 | 확인 |
|---|---|
| SQL | `UserQuery.js:27-37` `UPDATE_USER_WITH_SALARY` = `SET role_key, level_key, permission_key, salary, team_key, updated_id WHERE account_id`. **users 의 변경 가능 컬럼 전부**를 덮어쓴다 → 서비스가 전 컬럼을 채우면 불변식이 SQL 까지 이어진다 |
| 서비스 | `UserService.js:411-433` `pick(incoming, current) = incoming === undefined ? current : incoming` → 5필드 전부. `undefined`=보존 / `null`=해제 구분 유지 |
| 분기 제거 | `UPDATE_USER`(team_key 미갱신) 는 **미사용**. `updateUserRepository` import 제거 확인(`UserService.js:2-13`) |
| 테스트 | `UpdateUserMerge.test.js:36-48` 이 **bind 인덱스 0..6 를 실제 쿼리 순서와 대조**하고, 8케이스(미전달 보존 / 명시 null 해제 / 현재값 NULL 보존 / UPDATE 미발행)를 단언 |
| INSERT | `UserQuery.INSERT` 7 placeholder ↔ `addUserService` params 7개(`UserService.js:331-338`) **순서 일치**. `INSERT_USER_IF_NOT_EXISTS`(엑셀 큐 벌크, 3컬럼) **무변경** → 업로드 경로 무회귀 |

**`invoke("updateUser")` 호출부 — 직접 grep 결과 프론트 전체 1곳** (`useUserEditModal.js:118`). `invoke("addUser")` 도 1곳(`useUserRegistrationModal.js:46`, INSERT 라 함정 없음). 프론트 리포트의 "전수 확인" 주장 **재확인 완료**.
`?? null` 은 **4필드 전부** 적용됨(`useUserEditModal.js:120-123`), `salary` 는 `''`/null 을 명시 null 로 변환(`:124`).

### 팀 필터 3상태 — `null` 유입 경로 **0** ✅

| 경로 | 코드 | 결과 |
|---|---|---|
| Select clear | `UserSearchFilter.jsx:109-113` `changeTeam(null)` → `team: null` | 백엔드 `searchParams.team?.value` → `undefined` = 전체 ✅ |
| 초기값 | `UserSearchFilter.jsx:47` `team: null` | 동일 ✅ |
| 필터 초기화 | `UserSearchFilter.jsx:117` `resetAll` — `permission`/`team` 보강됨 | ✅ (기존 `permission` 누락 결함도 함께 정정) |
| 팀 미지정 | `TeamSelect.jsx:60` `value: TEAM_FILTER_NONE` (`constants/team.js:20` = `'__NONE__'`) ↔ `TeamTree.js:29` `'__NONE__'` | **글자 그대로 동일** ✅ |
| 엑셀 | `UserSearchFilter.jsx:125` `invoke('downloadExcel', searchParams)` → `downloadExcelService` `team?.value ?? undefined`(`UserService.js:548`) | ✅ |
| 팀원 배치 모달 | `useTeamMemberAssignModal.js:42-46` — **truthy 일 때만 `team` 키를 넣는다** | ✅ |
| URL 파라미터 | 없음 | ✅ |

백엔드 `applyTeamFilter`(`UserRepository.js:16-19`)가 3상태를 정확히 구분한다(`'__NONE__'`→`whereRaw('team_key IS NULL')`, 그 외 `whereEq`).
**방어 확인**: 만에 하나 `{value:null}` 이 들어와도 `UserService.js:48` 의 `?? … ?? undefined` 체인이 "전체"로 수렴한다 — **잘못된 부분필터가 되는 경로는 없다.**

### 빈 배열 함정 — 전 지점 가드 ✅

`QueryBuilder.js:40-46`(`whereIn([])` 조건 폐기) · `:34-38`(`whereEq(null)` 조건 폐기) 를 직접 확인한 뒤 신규 팀 쿼리 5종을 대조:

| 함수 | 가드 | UPDATE/DELETE 전사 오염 |
|---|---|---|
| `findAccountIdsByTeamKeys` | `TeamRepository.js:27` `if (!teamKeys?.length) return []` | — (SELECT) |
| `findUsersByTeamKey` | `:44` | — |
| `moveUsersToTeam` | `:74` `return NOOP_UPDATE` | **차단** ✅ |
| `clearTeamOfUsers` | `:86` | **차단** ✅ |
| `clearTeamByTeamKey` | `:95` | **차단** ✅ |

- 서비스 층 이중 방어: `assignUsersToTeamService`(`TeamService.js:433`), `unassignUsersFromTeamService`(`:444`).
- `deleteTeam` cascade(`:392-409`)는 `clearTeamByTeamKey(teamKey)` — `teamKey` 는 진입부에서 이미 존재 검증됨. 자식 재부모화는 `manager.save` 개별 호출. **WHERE 없는 대량 UPDATE 경로 없음.**
- 테스트가 반환값이 아니라 **`executeQuery` mock 0회 호출**까지 단언(`TeamRepository.test.js:25-60`) — 가드 없이 우연히 통과하는 것을 막는다.

### 8 resolver 응답 shape ↔ 프론트 접근 경로 ✅

| resolver | 생산 (파일:라인) | 소비 (파일:라인) | 판정 |
|---|---|---|---|
| `getTeamList` | `TeamService.js:132-142` `{teams,unassignedCount,hasCycle,cycleKeys,truncated,limits}` | `useTeamTree.js:31-42` | ✅ (`parentTeamKey` 만 F1) |
| `findTeamById` | `TeamService.js:201-219` `{team,ancestors,children,members}` | `useTeamDetail.js:34-42`, `TeamDetailPanel.jsx` | ✅ (F2 제외) |
| `getTeamOptions` | `TeamService.js:236` `{options,truncated}` | `useTeamOptions.js:30-35` | ✅ |
| `addTeam` | `:282` `{teamKey}` | `useTeamRegistrationModal.js:38` | ✅ |
| `updateTeam` | `:337` `{}` → `{success:true}` | `useTeamEditModal.js:111-120` (`success` 만 확인) | ✅ |
| `deleteTeam` | `:411-419` 5카운트 | `useTeamEditModal.js:137-146` (0 이 아닌 항목만 문장) | ✅ `removedProjectAssignCount` 미노출도 타당 |
| `assignUsersToTeam` | `:438` `{movedCount}` | `useTeamMemberAssignModal.js:90` | ✅ |
| `unassignUsersFromTeam` | `:449` `{removedCount}` | `TeamPage.jsx:111` | ✅ |
| `getUserMetaCount` | `UserService.js:692-697` — **`content` 래퍼 없음, 루트** | `UserPage.jsx:156` `meta?.team` | ✅ 래핑 단계 일치 |
| `getUserListWithPaging` | `content` = **배열**, `page` = 루트 | `UserListPaging.jsx:61,103`, `useTeamMemberAssignModal.js:63-64` | ✅ 팀 resolver 와 다른 래핑을 양쪽 다 정확히 인지 |
| `findUserByAccountId` | 루트 `teamKey/teamName`(`UserService.js:301-303`) | `useUserEditModal.js:64` `{success,...data}` 스프레드 | ✅ |

- 모든 팀 훅이 **`res?.success` 를 먼저 확인**한 뒤 `res.content` 를 읽는다.
- `getUserListWithPaging.content[i].userId` = `row.account_id` → `assignUsersToTeam.accountIds` 로 그대로 전달. 필드명 일관 ✅

### 다중 shape 재사용 컴포넌트 감사 ✅ (O1 제외)

| 컴포넌트 | 넘어오는 shape | 참조 필드 | 판정 |
|---|---|---|---|
| `TeamSelect` | ① 옵션(`{value,label,depth,parentTeamKey}`) ② 사용자 응답 유도(`{value,label}` — depth 없음) ③ ancestors 유도(`{value,label}`) ④ `__NONE__` 센티넬(`{value,label,depth:0}`) | `formatOptionLabel` 의 `option.depth` | ✅ **`meta.context==='menu'` 일 때만** depth 를 읽는다(`TeamSelect.jsx:76-82`). 선택된 값 렌더에는 depth 가 쓰이지 않아 조용한 오표기 없음 |
| `UserAvatar` | members / candidates / leader | `avatarUrl`, `displayName` — **호출부가 명시 전달** | ✅ |
| `StatCard` | permission / role / level / **team** | `{id,name,count}` | ✅ `mapCountWithMeta`(`UserService.js:704-722`)가 4축 모두 동일 shape 생성 |
| `JiraUserSelect` | 옵션 로더 결과 / 편집 모달 수기 객체 | `name`,`avatarUrl`,`email` | ⚠ **O1** — `email` 누락 |

### 서비스 내부 소비자 (계약 변경 함수 전역 grep) ✅

`updateUserService` · `getUserListWithPagingService` · `findUserByAccountIdService` · `addUserService` · `downloadExcelService` · `getUserMetaCountService` 를 `src/` 전역 grep 한 결과 **소비자는 `UserController` 뿐**이며 다른 도메인 Service 의 import/호출은 **0건**이다. (`getProjectStatusListService` 유형 회귀 없음)

부수 확인:
- `TeamService` 가 `UserService.userMap` 을 새로 import 하지만 `userMap` **시그니처·반환 불변**(`UserService.js:151-165`), 다른 소비자(`ResourceManagementService.js:62,334`) 무영향.
- **순환 import 없음**: `UserService → TeamTreeCache / TeamRepository`, `UserRepository → TeamTree`, `TeamService → UserService`. `UserService` 는 `TeamService` 를 import 하지 않는다.

### 권한 · 계약 테스트 ✅

- 신규 8키 **전부** `PermissionMap.js:60-71` 등록. read 3종은 `USER_MANAGEMENT read` 로도 OR 개방(사용자 관리 화면의 팀 컬럼/필터가 조용히 죽지 않게).
- `ResourceCatalog.js:62-63` `TEAM_MANAGEMENT` 추가(16→17키). `migrateFrom` 미지정 = 권한 자동 확대 없음(의도).
- **deny-by-default 성립 확인**: `PrincipalResolver.js:19,68` 이 `getSeedPages('admin')` / `mergeSetPages` 로 **카탈로그 전 키를 항상 채운다** → 기존 커스텀 세트는 `defaultForNew:ff` = `{read:false,write:false}`. `usePermissionStore.canRead/canWrite` 의 `?? false` 와 일치.
- 계약 테스트가 **실제로 잡는다**: `permissionMap.contract.test.js:42-50` 이 등록집합↔매핑집합 양방향 일치를 단언. M7 반영으로 등록 목록이 `src/index.js` 의 `CONTROLLER_REGISTRARS` **단일 소스**가 됐고 테스트가 이를 import(`:16`) → "둘 다 빠뜨리면 통과"하던 사각지대 제거 확인.
- 프론트 게이트 일치: `TeamPage.jsx:65-66` `canRead/canWrite('TEAM_MANAGEMENT')`, `Sidebar.jsx:99` `permission:'TEAM_MANAGEMENT'`.

### P0 범위 준수 + 기존 수정분 보존 ✅

| 항목 | 확인 |
|---|---|
| **DnD 없음** | `grep draggable\|onDragStart\|onDrop` → 팀 프론트 전체에서 `TeamTreePanel.jsx:18` 의 **금지 주석 1건만** |
| P1/P2/P3 코드 | `TEAM_ONLY`·`teamLead`·`isTeamLead`·`scopeTeamKeys`·`project_team`·`addTeamMembersToProject`·`TeamLeadFieldPolicy`·`permissionSource` 전역 grep → **주석 5건 외 코드 0건** |
| `PrincipalResolver.js` | **git status 미변경** — 1줄도 안 바뀜. P0 배포 판정 근거 성립 ✅ |
| `usePermissionStore` | 미확장(P1) ✅ |
| U11 cascade | `UserService.js:363-372` — projectusers → user_schedule → user_skills → users **순서 그대로**. `UserDeleteCascade.test.js` 통과 |
| U10 `ProjectUsersQuery` salary 제거 | 파일 **미변경**(git status) |
| U8 `bulkUpdateLayoutsRepository` 예외 전파 | `ProjectDashboardRepository` **미변경** |
| U9 `ProjectDashboardService` `PROJECT_COST` 게이트 | **미변경** |
| `src/permission/ProjectScope.js`(C2) | 미생성 — 설계서상 P1. **P0 은 `TEAM_ONLY` 를 도입하지 않으므로 미발현** ✅ |

### i18n ✅

- **kr/en 키 대칭 (한쪽만 있는 키 0건)**: `team` 66/66, `common` 105/105, `user` 87/87, `permission` 51/51.
- 프론트 팀·사용자 화면에서 참조하는 **`t()`/`tFormat()` 키 167종 전부** `ko-KR.json`·`en-US.json` **양쪽에 존재**(자동 스크립트 대조, 누락 0).
- `ResourceCatalog` 가 참조하는 `common.pages.team`·`permission.desc.TEAM_MANAGEMENT` 반영 확인 → 권한 관리 페이지에 키 문자열 노출 없음.
- **`npm run merge` 재실행 후 산출물 변화 없음**(diff 동일 124줄) → `ko-KR.json`/`en-US.json` **수기 편집 없음**. `locales/script/*.json`(빈 스텁) 미사용.
- `{count}` 등 치환 토큰은 전부 `utils/i18n.js` 의 `tFormat` 으로 소비(Forge `t()` 미지원 우회) — 전 호출부 확인.
- 미사용 키 7종은 O3.

### 쿼리키 / invalidate ✅

- 신규 3키 전부 `backofficeKeys` 팩토리(`backofficeKeys.js:16-19`). **인라인 배열 0건.**
- `teamOptions()=["teams","options"]` 가 `teams()=["teams"]` 의 하위라 prefix invalidate 로 함께 무효화됨(의도, 주석 명시). React Query 상 서로 다른 쿼리로 정상 분리.
- invalidate 소유가 `TeamPage.refreshTeams()` 1곳(`TeamPage.jsx:92-100`) — 모달 내부 invalidate 0건(리포 계약 준수). 대상에 `userKeys.all` 포함 → `userKeys.meta()`/`list()` 도 함께 갱신(StatCard·팀 컬럼) ✅

### DB / manifest ✅

- `ALTER_USERS_ADD_TEAM_KEY` = `ADD COLUMN IF NOT EXISTS team_key VARCHAR(50) NULL` (멱등), `migrate.js:38-39` **체인 맨 아래에만** v013 추가 — 기존 v001~v012 이름·순서 불변 ✅
- `manifest.yml` KVS `team` 엔티티 7 attributes + `indexes: - name`(→ `findAllPaged('name')` 와 일치) ✅
- `SEED_VERSION` 7→8 ✅
- `TEAM_*` 8 에러코드 등록. `TEAM_HAS_CHILDREN` 은 예약(미사용, 주석 명시)

### 알고리즘 검증 (경계값) ✅

- 깊이: `addTeam` `depth > MAX_TEAM_DEPTH`(`TeamService.js:263`) ↔ `updateTeam` `nextDepth + subtreeHeight > MAX_TEAM_DEPTH`(`:320`) — **동일 상한, 서브트리 높이 합산까지 반영**(설계서보다 엄격, 타당)
- 팀 수: `>= MAX_TEAMS` 거부(`:251`) ↔ `findAllPaged(maxItems=MAX_TEAMS)` + `truncated` = 커서 잔존 시에만 true(`CustomEntityManager.js:110-119`) → **500개 정상 상태에서 `truncated:false`** ✅ off-by-one 없음
- `nearestAncestorWith`(`TeamTree.js:207-223`)는 **자기 자신을 포함**(`path` 마지막이 self) → `deleteTeam` 의 `permissionLostCount` 산출(`TeamService.js:368`)이 "자기 팀 세트를 상속받던 인원"을 정확히 센다 ✅
- `deleteTeam` cascade 순서 = 자식 재부모화 → 소속 해제 → 마스터 삭제 (`:396-407`). 중간 실패 시 마스터가 남아 재실행 멱등 ✅

---

## 5. 실행 검증 (원문 — 종료코드 `cmd /c "… & echo %errorlevel%"` 로 재측정)

```
# 백엔드 (루트)
> cmd /c "npx jest --ci > %TEMP%\be_test.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0

Test Suites: 26 passed, 26 total
Tests:       434 passed, 434 total
Snapshots:   0 total
Time:        8.46 s
Ran all test suites.
```

```
# 프론트 테스트 (static/ui)
> cmd /c "npx jest --ci > %TEMP%\fe_test.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0

Test Suites: 22 passed, 22 total
Tests:       279 passed, 279 total
Snapshots:   1 passed, 1 total
Time:        8.049 s
Ran all test suites.
```

```
# 프론트 빌드 (static/ui, prebuild 가 merge 자동 실행)
> cmd /c "npm run build > %TEMP%\fe_build.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0

The bundle size is significantly larger than recommended.
The build folder is ready to be deployed.
```

```
# i18n merge (재실행 → 산출물 무변화 확인)
> cmd /c "npm run merge > %TEMP%\merge_out.txt 2>&1 & echo MERGE_EXIT=%errorlevel%"
MERGE_EXIT=0

git diff --stat -- locales/ko-KR.json locales/en-US.json
 locales/en-US.json | 124 +++++++++
 locales/ko-KR.json | 124 +++++++++
 2 files changed, 248 insertions(+)      ← 재실행 전후 동일 = 수기 편집 없음
```

**빌드·테스트 전부 통과했으나 F1/F2 는 런타임 shape 불일치라 여기서 잡히지 않는다.** 교차 비교로만 드러난 결함이다.

---

## 6. 담당별 조치 요청

### backend-engineer (우선)
1. **F1** — `TeamService.getTeamListService:118` (및 `getTeamOptionsService`) 에서 `index.cycleKeys` 에 포함된 팀의 `parentTeamKey` 를 **`null` 로 정규화**한다. `depth` 가 이미 강등을 반영하므로 응답 자기모순 해소.
2. **F2** — `findTeamByIdService` 응답 `content.team` 에 **`parentTeamName` 필드 추가**(필드 추가만 = 무회귀). 프론트의 `ancestors` 유도를 제거할 수 있다. 병행해 `:206` 도 F1 과 같은 정규화.
3. **F3** — `getTeamListService` / `findTeamByIdService` 를 `loadTeamIndexFresh()` 로 전환. `getTeamOptions` 와 `UserService.roleLevelMap()` 은 캐시 유지.
4. (P1 착수 전) 백엔드 리포트 §4-1 의 stale `team.leaderAccountId` fail-open, 그리고 본 리포트 **O8**(옵션 조회 실패 시 permission_key 해제) 처리.

### frontend-engineer
1. **F1 방어** — `buildTeamTree` 에 조상 체인 재방문 시 루트 승격 로직 추가 + **`a(parent=b), b(parent=a), c(parent=a), d` 입력으로 회귀 테스트 추가**(현재 `buildTeamTree` 자체의 사이클 테스트가 없다). `buildTeamTree.js:15-19` 주석의 잘못된 전제도 정정.
2. **F2 후속** — 백엔드가 `parentTeamName` 을 실어주면 `useTeamEditModal.js:61,65-67` 의 ancestors 유도를 그것으로 교체. `TeamDetailPanel.jsx:94-95` 의 "최상위 팀" 표기를 `hasCycle` 노드에서 분기.
3. **O2** — `BackofficeDropdown` 에 `/backoffice/team` 항목 추가(추가해 둔 `…team.description` 키 소비). skill 누락도 같이 처리할지 리더 판단.
4. **O1** — `useTeamEditModal` 의 leader 객체에 `email` 추가(가능하면 `findTeamById.members[]`/leader 응답에 이메일이 없으므로 백엔드 협의 또는 미표시 확정).
5. **O3/O5** — 미사용 키 정리 또는 P1 이관 명시, StatCard 제목 4개 통일.

---
---

# 7. 재검증 (2026-07-27, 2차) — F1/F2/F3/O1 수정 반영

> 입력: `02_backend_report.md` 2차 개정(§0-A·§1·§3-A), `02_frontend_report.md` §5, **실제 소스**
> 방법: 1차와 동일 — 리포트 주장을 근거로 쓰지 않고 소스로 확인했다. F1 은 **양쪽 순수 함수를 실제로 로드해
> 랜덤 4000건 대조**했고, F2 의 "value 유지" 주장은 **저장 경로를 payload 조립 → SQL 까지 따라가** 검증했다.

## 7-0. 최종 판정

| 항목 | 판정 | 한 줄 근거 |
|---|---|---|
| **F1** 사이클 서브트리 소실 | **닫힘** | 백엔드 3종 전부 `effectiveParentKey` 사용 확인 + 랜덤 4000건에서 **노드 소실 0 / 백엔드-프론트 부모배치 불일치 0** |
| **F2** 상위 팀 라벨 UUID | **닫힘** | `parentTeamName` 생산 확인, `ancestors` 유도 제거 확인, `toParentOption` 4 shape 실행 확인 |
| **F3** read-after-write stale | **닫힘** | 읽기 3종 `loadTeamIndexFresh()` 확인 + `getTeamIndex()`/`roleLevelMap()` **실제로 무변경** 확인 |
| **O1** leader `email` 누락 | **닫힘** | 생산(`TeamService.js:238`) → 조립(`useTeamEditModal.js:87`) → 소비(`UserSingleValue`) 전 경로 연결 확인 |
| **O7** 폼 반복 초기화 | 닫힘 | `initializedKeyRef` 로 팀당 1회 고정, 모달 닫힘 시 해제 |
| **O8-동형** 팀 권한세트 조용한 해제 | 닫힘 (테스트 미고정 → N3) | 주장이 **사실**이고 수정이 실제로 막는다 |
| **O2** 백오피스 드롭다운 | **내(검증자) 오탐이었다** | `<BackofficeDropdown` **0건** — 렌더되지 않는 죽은 컴포넌트. 프론트 판단이 옳다 |
| **O5** StatCard 제목 | 프론트 주장 사실 | git diff 상 3줄은 context(무변경). P0 밖 판정 타당 |
| **O3** 미사용 i18n 키 | 프론트 반박이 옳다 | 동적 참조 허용 스캔에서 team.json **미사용 0건**, `TRANSLATED_CODES` 6코드 전부 kr/en 존재 |
| **신규 F4** | **새 결함 (Low-Medium)** | 같은 UUID-라벨 함정이 **사용자 수정 모달**에 그대로 남아 있다 |

---

## 7-1. F1 — 닫힘

### 생산 측 (백엔드)

| 위치 | 확인 |
|---|---|
| `TeamTree.js:57-171` | `buildTeamIndex` 가 `parentOf`(강등 반영 유효 부모)와 `demotedKeys`(사이클 U 자기참조 U 손상 부모키)를 반환 |
| `TeamTree.js:155-157` | `demotedKeys = parentOf !== normalizeParent(raw)` — 3종 강등을 전부 포착하는 **파생 정의**(수기 열거 아님) |
| `TeamTree.js:177` | `effectiveParentKey(index, teamKey)` |
| `TeamService.js:129` | `getTeamList` → `parentTeamKey: effectiveParentKey(...)` OK |
| `TeamService.js:230` | `findTeamById` → `parentTeamKey: parentKey`(= `effectiveParentKey`) OK |
| `TeamService.js:268` | `getTeamOptions` → `parentTeamKey: effectiveParentKey(...)` OK |
| `TeamService.js:132, 232` | 원본은 `rawParentTeamKey` 로 분리 OK |

**전역 grep 결과 `team.parentTeamKey` 를 응답에 직접 싣는 경로는 `rawParentTeamKey` 2곳뿐**이다. "raw 가 응답에 실리는 경로 없음"이라는 백엔드 주장은 **사실**.

### 실측 (양쪽 순수 함수를 실제로 로드해 실행)

```
[1] 백엔드 getTeamList 응답(정규화 후) — 입력 a(parent=b), b(parent=a), c(parent=a), d
    [{"k":"a","p":null,"raw":"b","d":0},{"k":"b","p":null,"raw":"a","d":0},
     {"k":"c","p":"a","raw":"a","d":1},{"k":"d","p":null,"raw":null,"d":0}]
    demotedKeys = ["a","b"]  cycleKeys = ["a","b"]
    프론트 렌더 노드 = ["a","c","b","d"]      <- 1차에서는 ["d"] 였다. 4팀 전원 렌더

[2] 백엔드가 raw 를 흘린 경우(회귀 상황) 프론트 렌더 노드 = ["a","c","b","d"]
    <- 프론트 단독 방어만으로도 소실되지 않는다(이중 방어가 실제로 작동)

[3] 랜덤 4000건 (자기참조 20% / 손상 부모키 10% / 임의 부모 60% — 사이클 다발)
    노드 소실 0건 / 백엔드 effectiveParentKey <-> 프론트 buildTeamTree 부모배치 불일치 0건
```

### 이중 구현 divergence 분석 (코디네이터 지시 항목)

두 곳에 규칙이 있으므로 갈라질 수 있는 지점을 구조적으로 따졌다:

| 차이 | 백엔드 `buildTeamIndex` | 프론트 `findCycleMemberKeys` | 결과 |
|---|---|---|---|
| 사이클 탐지 입력 | **정규화된 `parentOf`** | **raw `parentTeamKey`** | 자기참조는 양쪽 다 강등(BE=parentOf 정규화, FE=길이 1 사이클 + `parentKey !== node.teamKey` 이중), 손상 부모키는 양쪽 다 루트(BE=`!byKey.has`, FE=`byKey.get()===undefined`) → **동일** |
| `settled` 처리 | 사이클 구성원 **제외**(`if (!cycleKeys.has(k))`) | 사이클 구성원 **포함**(`path.forEach`) | FE 는 `if (settled.has(startKey)) continue` 로 재시작을 건너뛰는데, 그 노드는 이미 `onCycle` 에 있어 손실 없음 → **동일** |
| 강등 범위 | 사이클 **위의 노드만**(비사이클 자식은 아래 유지) | 동일 | **동일** |

→ **랜덤 4000건에서 갈라지는 입력을 찾지 못했다.** 구조적으로도 갈라질 수 없다.
정상 경로에서는 프론트 방어가 아예 발동하지 않는다(백엔드가 이미 `null` 로 정규화해 보내므로 `findCycleMemberKeys` 가 빈 집합을 돌려준다) — **무회귀도 확인**.

### 회귀 가드

- 백엔드 `TeamTree.test.js:158-166` — **`depth === 0` 인 모든 노드는 `parentOf` 가 null 이다** 를 불변식으로 단언. F1 을 만든 자기모순 그 자체를 잠근다. 그 밖에 `TeamService.test.js:138,147` 이 `getTeamList`/`getTeamOptions` 응답에 같은 정규화가 적용되는지 확인.
- 프론트 `buildTeamTree.test.js` 사이클 5케이스(정상 트리 무개입 포함).
- `buildTeamTree.js:15-26` 주석 정정 확인 — 이전의 잘못된 전제("백엔드가 강등해 내려준다")가 **이제 참**이고, 그럼에도 방어를 남기는 근거(F1 의 실패 양상이 조용함)를 명시.

---

## 7-2. F2 — 닫힘 (단, 동형 잔존 1건 = F4)

| 위치 | 확인 |
|---|---|
| `TeamService.js:231` | `parentTeamName: parentKey ? index.byKey.get(parentKey)?.name ?? null : null` — **유효 부모 기준**이라 `parentTeamKey` 와 항상 짝이 맞는다 |
| `TeamService.js:233` | `isDemoted: index.demotedKeys.includes(teamKey)` |
| `useTeamEditModal.js:38-39` | `ancestors` **구조분해 자체를 제거** |
| `useTeamEditModal.js:79` | `parent: toParentOption(team, t('team.form.unknownParent'))` |
| `buildTeamTree.js:200-206` | `toParentOption` — `label: name || fallbackLabel`, `value: team.parentTeamKey` |
| `TeamDetailPanel.jsx:99-104` | `team.isDemoted` 분기로 강등 노드를 "최상위"로 오표기하지 않음 (1차 부수 증상 해소) |

### 프론트 판단 검증 — "null 을 돌려주면 상위 팀이 조용히 해제된다" 는 **사실이다**

저장 경로를 payload 조립부터 SQL 까지 따라갔다:

1. `useTeamEditModal.js:129` — `parentTeamKey: editValues.parent?.value ?? null`
   → `toParentOption` 이 `null` 을 돌려주면 `editValues.parent === null` → payload 는 **명시적 `null`**
2. `TeamService.js:340` — `const nextParentKey = pick(payload.parentTeamKey, current.parentTeamKey) || null`
   → `pick(null, ...)` 은 `null` (미전달이 아니라 **명시적 해제**)
3. `TeamService.js:361` — `teamManager().save(..., parentTeamKey: nextParentKey)` → `toRecord` 가 빈 문자열로 저장 → **루트로 확정**

→ 라벨을 모른다는 이유로 `null` 을 돌려줬다면, 관리자가 **설명만 고쳐 저장해도 상위 팀이 사라진다.**
프론트가 `value` 를 유지한 판단은 **옳고, 라벨 결함보다 나쁜 결함을 막았다.**

**불변식 고정 확인**
- 프론트 `buildTeamTree.test.js` — "이름을 몰라도 value 는 parentTeamKey 를 유지한다" + 이름 누락/null/빈문자열 3케이스
- 백엔드 `TeamService.test.js:184-196` — `test.each` 로 강등 3종에서 `parentTeamKey`/`parentTeamName` 이 **둘 다 null 로 짝이 맞고** `isDemoted:true`, `rawParentTeamKey` 는 보존

**실행 확인** (`toParentOption` 4 shape)
```
이름 있음        : {"value":"p1","label":"개발본부"}
이름 null        : {"value":"p1","label":"FB"}      <- UUID 아님, value 유지
이름 키 자체 없음 : {"value":"p1","label":"FB"}
이름 빈문자열     : {"value":"p1","label":"FB"}
부모 없음(루트)   : null
```

---

## 7-3. F3 — 닫힘

| 항목 | 주장 | 실측 |
|---|---|---|
| `getTeamList` | fresh | `TeamService.js:107` `loadTeamIndexFresh()` OK |
| `findTeamById` | fresh | `TeamService.js:169` OK |
| `getTeamOptions` | fresh (범위 확대) | `TeamService.js:258` OK — 확대 근거("상위 팀 Select 를 채우므로 방금 만든 팀 밑에 하위 팀을 만들 수 없다")는 **타당**. 조직 개편의 연속 생성이 정상 맥락이다 |
| `getTeamIndex()` TTL 60초 | 무변경 | `TeamTreeCache.js:22,67-76` — 로직·TTL 그대로 |
| `UserService.roleLevelMap()` | 무변경 | `UserService.js:135` 여전히 `getTeamIndex()` |

**전역 grep 으로 `getTeamIndex` 잔존 소비자 2곳 확인**: `UserService.js:135`(목록), `UserService.js:274`(단건 조회). 팀 도메인에서는 **0곳** — 주장 전부 사실.

### KVS 호출량 증가 검증 (코디네이터 지시 항목)

백엔드 주장 "프론트 React Query 캐싱이 위에 있어 페이지 로드당 1회" 를 프론트 코드로 검증:

| 훅 | 쿼리키 | staleTime | 마운트 지점 |
|---|---|---|---|
| `useTeamTree` | `backofficeKeys.teams()` | 60초 | `TeamPage` + `useTeamEditModal` → **동일 키라 React Query 가 dedup** |
| `useTeamDetail` | `backofficeKeys.findTeams(k)` | 30초 | `TeamPage` + `useTeamEditModal` → dedup |
| `useTeamOptions` | `backofficeKeys.teamOptions()` | 5분 | `TeamSelect` 전 인스턴스(`UserSearchFilter`·사용자 등록/수정 모달·팀 등록/편집 모달·팀원 배치 모달) → **전부 동일 키라 1회** |

**목록 조회마다 커서 루프가 도는 경로는 생기지 않았다.** 결정적 근거: 사용자 목록(`getUserListWithPaging`)의 팀 이름은 `roleLevelMap()` → `getTeamIndex()`(**캐시**)에서 오고, `getTeamOptions` 는 페이지네이션·필터 조작으로 재호출되지 않는다(쿼리키에 page/filter 가 없다). 팀 화면의 fresh 호출은 **페이지 로드 + write 후 invalidate 시점**뿐이다. 주장 성립.

- 백엔드 회귀 가드: `TeamService.test.js:203-212` "F3 — 팀 읽기 3종은 캐시를 우회한다".
- **남은 stale(수용)**: `roleLevelMap()`/`findUserByAccountIdService` 의 60초 창. 백엔드가 "표시만의 문제"로 문서화했으나 **그 표시가 UUID 로 새는 지점이 하나 있다 → F4**.

---

## 7-4. O1 — 닫힘 (다중 shape 격차 해소)

전 경로 연결 확인:
`TeamService.js:238` `leaderEmail: leader?.emailAddress ?? null`
→ `useTeamEditModal.js:87` `email: team.leaderEmail ?? null`
→ `TeamEditModal.jsx:108` `<JiraUserSelect value={editValues.leader} ...>`
→ `JiraUserSelect.jsx:60-86` `UserSingleValue` 의 `data.email`

| 필드 | 옵션 로더(`JiraUserSelect.jsx:19-25`) | 편집 모달 조립(`useTeamEditModal.js:81-89`) |
|---|---|---|
| `value` / `label` / `name` / `avatarUrl` | 있음 | 있음 |
| `email` | 있음 | **있음 (신규 — 격차 해소)** |

→ 두 shape 의 참조 필드 집합이 **완전히 일치**한다. 1차에 지적한 "조용히 삼켜지는 필드"는 남아 있지 않다.

---

## 7-5. 신규 필드 4종 경계면 교차 대조

| 필드 | 생산 (파일:라인) | 소비 (파일:라인) | 판정 |
|---|---|---|---|
| `demotedKeys` | `TeamService.js:153` (getTeamList) | `useTeamTree.js:40` → `TeamPage.jsx:80,89-92,210` → `TeamTreePanel.jsx:35,40,90,149` | 연결됨 |
| `isDemoted` | `TeamService.js:233` (findTeamById.team) | `TeamDetailPanel.jsx:99` | 연결됨 |
| `leaderEmail` | `TeamService.js:238` | `useTeamEditModal.js:87` → `JiraUserSelect` | 연결됨 |
| `parentTeamName` | `TeamService.js:231` | `buildTeamTree.js:204` → `useTeamEditModal.js:79` | 연결됨 |
| **`rawParentTeamKey`** | `TeamService.js:132` **및** `:232` (양쪽) | **없음** | **생산만 — N1** |

- **프론트가 읽는데 백엔드가 안 주는 필드: 0건.** `findTeamById.content.team` 의 14필드를 소비 코드와 전수 대조했다(`sortOrder` 는 생산·미소비지만 `updateTeam` 이 미전달로 보존하므로 정상).
- `useTeamTree.js:40` 의 `content.demotedKeys ?? content.cycleKeys ?? []` 폴백은 **백엔드 미배포 상태에서도 사이클만은 표시**되게 하는 안전장치로 타당.
- `TeamTreePanel.jsx:40` 도 `demotedKeys.length ? demotedKeys : cycleKeys` 로 동일 폴백 — 이중이지만 무해.

---

## 7-6. 신규 실패 F4 (Low-Medium) — 같은 UUID-라벨 함정이 사용자 수정 모달에 남아 있다

**경계면**: `findUserByAccountId` 루트 `teamName` (생산) <-> 사용자 수정 모달의 팀 Select 값 (소비)

| 위치 | 코드 |
|---|---|
| 생산 | `src/resolver/backoffice/user/UserService.js:274` — `const teamIndex = user.team_key ? await getTeamIndex() : null;` <- **캐시(TTL 60초). F3 에서 의도적으로 유지** |
| 생산 | `UserService.js:302` — `teamName: user.team_key ? teamIndex?.byKey.get(user.team_key)?.name ?? null : null` |
| 소비 | `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js:91` — **`label: userData.teamName ?? userData.teamKey`** |

**발현**: 팀을 만들고 60초 안에 사용자를 그 팀에 배치한 뒤 사용자 수정 모달을 열면, 요청이 캐시가 warm 한 **다른 Forge 인스턴스**로 갈 때 `teamName: null` 이 되어 Select 에 **`team-3f2a-9c1e-...` 원시 UUID** 가 렌더된다.

- 백엔드 2차 리포트 §0-A F3 은 이 잔존 stale 을 "**표시만의 문제** — 팀 이름 컬럼이 잠시 비어 보일 수 있다"로 문서화했다. 사용자 **목록**은 `UserListPaging.jsx:72` 가 `?? '-'` 라 실제로 비어 보이지만, **수정 모달은 비지 않고 UUID 를 보여준다.** 리포트가 예측한 증상과 실제가 다르다.
- 프론트가 F2 대응으로 세운 규칙("라벨에 teamKey(UUID)를 절대 쓰지 않는다" — `buildTeamTree.js:192`)이 **형제 지점에 적용되지 않았다.**
- **심각도가 F2 보다 낮은 이유**: `value` 는 `userData.teamKey` 로 유지되므로 저장해도 팀이 해제되지 않는다(`useUserEditModal.js:123` `teamKey: editValues.team?.value ?? null`). **표시 결함에 그친다.**

**수정**
```js
// useUserEditModal.js:90-92
team: userData.teamKey
    ? { value: userData.teamKey, label: userData.teamName || t('team.form.unknownParent') }  // 또는 user.form.unknownTeam 신설
    : null,
```
`||` 를 써서 빈 문자열도 폴백에 태우고, **`value` 는 그대로 둔다**(F2 와 같은 불변식). 회귀 가드가 필요하면 `toParentOption` 처럼 순수 함수로 뽑을 것.

> 대안(더 근본적): `findUserByAccountIdService` 도 `loadTeamIndexFresh()` 로 바꾸면 원인이 사라진다. 다만 이 경로는 사용자 수정 모달을 열 때마다 호출되므로 F3 에서 캐시를 유지한 판단(L2)과 충돌한다 — **프론트 라벨 폴백이 더 싸다.**

---

## 7-7. 프론트가 스스로 고친 O8-동형 — 주장이 사실이고, 수정이 실제로 막는다

**주장 검증(수정 전 코드 기준)**: `permission: permissionOptions.find(p => p.value === team.permissionKey) ?? null`

1. `permissionOptions` = `(permissions ?? []).map(...)`, `permissions` 는 `useRoleLevelPermissions` 의 `useQuery({data: permissions = []})`.
2. `getPermissionList` **실패** 시 `data === undefined` → `permissions = []` → `find` → `undefined` → `?? null` → **`permission: null`**
3. 저장: `useTeamEditModal.js:131` `permissionKey: editValues.permission?.value ?? null` → 명시적 `null`
4. `TeamService.js:359` `permissionKey: pick(null, current.permissionKey)` = `null` → `toRecord` → **팀 권한 세트 해제**

→ **사실이다.** 그리고 P1 에서 팀 `permissionKey` 는 팀원 권한 상속의 원천이므로, 이 조용한 해제는 **그 팀 전원의 실효 권한을 날린다.** F2 보다 파급이 크다.

**수정 확인** (`useTeamEditModal.js:91-99`): `team.permissionKey` 가 있으면 **항상 객체를 만들고** label 만 3단 폴백(`옵션 라벨 -> team.permissionName -> t('team.form.unknownPermission')`)한다.
→ `value` 가 항상 보존되므로 **해제 경로가 사라졌다.**
부수 확인: 초기화 effect 에서 `loadingPermissions` 대기 조건이 빠졌지만, 옵션 로딩 전에도 `team.permissionName` 폴백이 정확한 이름을 준다 — **문제 없다.**

**O7 확인**: `initializedKeyRef`(`:47,72-73,112`) 로 팀당 1회 초기화. 모달 닫힘 시 해제. `TeamPage.jsx:246` 이 `key={"edit:" + selectedTeamKey}` 로 리마운트하므로 팀 전환도 안전.

---

## 7-8. 프론트 미반영 2건 + 부분 미반영 1건 — 근거 검증

| 항목 | 프론트 주장 | 검증 결과 |
|---|---|---|
| **O2** | `BackofficeDropdown` 은 어디서도 렌더되지 않는다 | **사실. 내 지적이 오탐이었다.** `grep "<BackofficeDropdown"` → **0건**. `Backoffice.jsx:4`·`MainPage.jsx:3` 은 **import 만** 한다. 나는 import + 고아 i18n 키를 보고 렌더를 추정했고, JSX 사용을 확인하지 않았다. **추가 확인**: `common.backoffice.workforceSetting.*.description` 은 team 뿐 아니라 **user/role/level/status/permission 전부** 이 죽은 컴포넌트가 유일 소비처라 **6세트 모두 고아**다 — team 것만 지우면 오히려 비대칭이 된다. 프론트 판단이 옳다. 죽은 컴포넌트 + 고아 키 정리는 **P0 밖 별건** |
| **O5** | StatCard 제목 하드코딩은 팀 도입 이전부터 존재 | **사실.** `git diff UserPage.jsx` 에서 `"Permission"/"Role"/"Level"` 3줄은 **context(무변경)**, `t('user.stat.team')` 줄만 추가분. P0 밖 판정 타당 |
| **O3** | `error.TEAM_*` 키는 템플릿 리터럴 동적 참조라 정적 grep 오탐 | **사실.** `teamErrors.js:21` 이 `team.error.` + code 로 조립. `TRANSLATED_CODES` 6코드(`TEAM_NOT_FOUND`·`NAME_REQUIRED`·`NAME_DUPLICATED`·`CYCLE_DETECTED`·`DEPTH_EXCEEDED`·`LIMIT_EXCEEDED`) **전부 kr/en 양쪽에 존재, 누락 0**. `TEAM_MEMBER_SELECTION_EMPTY` 는 정적 참조로 사용 중. `TEAM_KEY_REQUIRED` 미매핑은 의도(서버 message 노출). 동적 참조를 허용한 재스캔에서 **team.json 미사용 키 0건** — O3 완전 해소 |

---

## 7-9. 회귀 확인 — 전부 유지

| 항목 | 실측 |
|---|---|
| **C1 read-merge (SQL 레벨)** | `UserQuery.js:27-37` `UPDATE_USER_WITH_SALARY` = SET `role_key, level_key, permission_key, salary, team_key, updated_id` (users 변경 가능 컬럼 전부) <-> `UserService.js:413-424` `pick()` 5필드 <-> `:425-433` bind 7인자 **순서 동일**. `UPDATE_USER` 미사용 유지. `invoke("updateUser")` 프론트 **여전히 1곳**(`useUserEditModal.js:118`), `?? null` 4필드 유지 |
| **팀 필터 3상태** | `UserRepository.js:16-19` `applyTeamFilter` 무변경. 프론트 `{value:null}` 생성 경로 **0건**(`UserSearchFilter.jsx:50,111,117` 전부 `team: null`=키 부재 처리 / `useTeamMemberAssignModal.js:41-45` 조건부 삽입 유지). 센티넬 `'__NONE__'` 양측 동일(`TeamTree.js:29` <-> `constants/team.js:20`) |
| **빈 집합 가드** | `TeamRepository.js:27,44,74,86,95` 5함수 가드 무변경. `TeamService.test.js:379-407` 이중 방어 테스트 유지 |
| **P0 범위** | `TEAM_ONLY`/`teamLead`/`isTeamLead`/`scopeTeamKeys`/`addTeamMembersToProject`/`getProjectTeams`/`TeamLeadFieldPolicy`/`permissionSource` 전역 grep → **코드 0건**(`TeamTreeCache.js:5` 주석 1건뿐) |
| **DnD** | `draggable`/`onDragStart`/`onDrop`/`onDragOver` → **금지 주석 1건 외 0건** |
| **`PrincipalResolver`** | `git status` **무출력 = 1줄도 안 바뀜.** P0 배포 판정 근거 유지 |
| **U11 cascade** | `UserService.js:365-368` 4단계 순서(projectusers -> user_schedule -> user_skills -> users) 유지 |
| **U7~U10** | `ProjectUsersQuery.js`·`projectDashboard/` `git status` **무출력 = 무변경** |
| **권한 8키** | `PermissionMap.js:62-72` 8키 유지, 계약 테스트 통과 |
| **i18n** | team 63/63 · common 105/105 · user 87/87 · permission 51/51 **전부 대칭**. **프론트 전체 1511 참조 키** 스캔 → 팀 관련 누락 **0건**. merge 재실행 후 산출물 변화 없음(121줄 = O3 8키 제거 반영) |

> 전 프로젝트 스캔에서 **팀과 무관한 기존 i18n 누락 2건**을 발견했다 — `level.modal.edit.label.title`(`ProjectStatusEditModal.jsx`), `upload.error`(`JobPollingManager.jsx`). 두 파일 모두 이번 작업에서 손대지 않았다. **별건.**

---

## 7-10. 실행 검증 (원문 — `cmd /c "... & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\be2.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 26 passed, 26 total
Tests:       449 passed, 449 total        <- 434 -> 449 (+15). 리포트 주장 449 일치
Snapshots:   0 total
```
```
> cmd /c "npx jest --ci > %TEMP%\fe2.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 22 passed, 22 total
Tests:       291 passed, 291 total        <- 279 -> 291 (+12). 리포트 주장 291 일치
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\bd2.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.
  Failed to parse source map from '...@atlaskit/analytics-next-stable-react-context/src/context.ts'
  Failed to parse source map from '...@atlaskit/analytics-next-stable-react-context/src/index.ts'
  Failed to parse source map from '...marklassian/index.ts'
The build folder is ready to be deployed.
```
```
> cmd /c "npm run merge > %TEMP%\m2.txt 2>&1 & echo MERGE_EXIT=%errorlevel%"
MERGE_EXIT=0
git diff --stat -- locales/ko-KR.json locales/en-US.json
 locales/en-US.json | 121 +++++
 locales/ko-KR.json | 121 +++++          <- 재실행 후 변화 없음 = 수기 편집 없음
```
경고 3건은 node_modules 소스맵 누락(팀 기능 착수 이전부터 존재, 우리 코드 경고 0건) — 1차와 동일.

**빌드·테스트는 F4 를 잡지 못한다**(런타임 표시 결함). 교차 대조로만 드러났다.

---

## 7-11. 신규 관찰 (2차)

| # | 심각도 | 내용 |
|---|---|---|
| **N1** | 경미 | **`rawParentTeamKey` 생산-무소비.** `getTeamList`·`findTeamById` 양쪽에 실리지만 프론트 소비처 0. 양 리포트가 "복구 UX 는 P0 밖"이라 의도적이라고 명시했으므로 수용하되, **필드를 분리한 근거(강등 사유 설명)가 미실현**이다. P1 까지 소비처가 생기지 않으면 제거를 검토할 것 |
| **N2** | 경미 | **강등 노드 편집 시 조용한 데이터 수리.** 백엔드가 `parentTeamKey: null` 을 주므로, 관리자가 강등 노드의 **이름만 고쳐 저장해도** raw 로 남아 있던 깨진 부모 키가 `null` 로 확정된다(`useTeamEditModal.js:129` -> `TeamService.js:340`). 읽기 전 경로에서 이미 루트였으므로 영향은 중립~긍정(복구)이지만, `rawParentTeamKey` 를 화면에 노출하지 않는 현 상태에서는 관리자가 "원래 상위가 X 였다"는 정보를 **되찾을 수 없게 된다.** N1 을 소비하면 함께 해소 |
| **N3** | 경미 | **O8-동형 수정에 회귀 테스트가 없다.** `toParentOption`(F2)은 순수 함수로 뽑아 7케이스로 고정했지만, permission 값 조립은 `useTeamEditModal` 안에 인라인이라 같은 함정이 재발해도 테스트가 못 잡는다. 같은 방식으로 `toPermissionOption(team, options, fallback)` 을 뽑을 것을 권고 |
| **N4** | 별건 | 팀과 무관한 기존 i18n 누락 2건(§7-9 각주) |

---

## 7-12. 미검증 (2차에서도 동일 — 배포/E2E 필요)

1차 §2 의 U-1 ~ U-6 은 **전부 그대로 유효**하다. 2차 수정으로 추가된 항목:

| # | 항목 | 확인 방법 |
|---|---|---|
| U-7 | **강등 노드의 복구 경로 실기동** — 백엔드가 `parentTeamKey:null` 로 내려 트리 최상위에 나타나고, 선택 -> 편집 모달에서 상위 팀을 다시 지정할 수 있는가(F1 이 막았던 경로) | 이상 데이터를 인위적으로 만들어야 재현. 로컬은 순수 함수 테스트로만 고정 |
| U-8 | `demotedKeys`/`isDemoted` **표시 경로**(경고 아이콘·배너·강등 문구) | 위와 동일 — 이상 데이터 필요 |
| U-9 | `getTeamOptions` fresh 전환 후 **실 KVS 지연**(팀 100개+ 커서 루프) 체감 | 실데이터 |
| U-10 | `leaderEmail` — Jira 개인정보 설정으로 `emailAddress` 가 없을 때 `null` 폴백 | 배포 환경 |

---

## 7-13. 담당별 조치 요청 (2차)

### frontend-engineer — 필수 1건
1. **F4** — `useUserEditModal.js:91` 의 `label: userData.teamName ?? userData.teamKey` 를 **UUID 를 쓰지 않는 폴백**으로 교체한다(`value` 는 유지). F2 에서 세운 규칙을 형제 지점에 적용하는 것이다. §7-6 참조.
2. (권장) **N3** — permission 값 조립을 `toParentOption` 처럼 순수 함수로 뽑아 회귀 테스트로 고정.

### backend-engineer — 필수 0건
1. (권장) **N1** — `rawParentTeamKey` 를 P1 까지 소비하지 않을 거면 제거하거나, `TeamDetailPanel` 의 강등 문구에 "원래 상위: X" 한 줄을 붙이도록 프론트와 합의(백엔드 변경 0).

### 리더 판단
- **O2 후속**: `BackofficeDropdown` 은 렌더되지 않는 죽은 컴포넌트다. 컴포넌트 + `common.backoffice.workforceSetting.*.description` 고아 6세트 정리를 별건으로 처리할지.
- **U-5(1차)** 재확인: 배포 후 커스텀 권한 세트에 `TEAM_MANAGEMENT` 를 수동 부여해야 한다(`migrateFrom` 미지정 — 의도). 운영 안내 필요.

---
---

# 8. P1 검증 (2026-07-27) — 권한 확장 (TEAM_ONLY · 팀 상속 · 팀장)

> 입력: `02_backend_report.md` **P1 절**(§P1-0 계약 5건 · §P1-1~3 · §P1-4 D1~D6 · §P1-7), `02_frontend_report.md` **P1 절**, `01_architect_design.md` §R2/§R3/§R6/§9 P1/§14
> 기준: **설계서보다 백엔드 리포트가 우선**(백엔드가 설계서 오류 6건을 정정). 리포트 주장은 근거로 쓰지 않고 **소스로 확인**했다.
> 핵심 방법: `PrincipalResolver` · `permissionGuard` · `TeamLeadFieldPolicy` · `ProjectScope` · `TeamTree` · `ResourceCatalog` 를 **babel 로 실제 로드**해 I/O 계층만 스텁으로 대체하고 **권한 판정 조합 52건을 실행**했다. 프론트 순수 함수도 실물 로드해 JSON 직렬화까지 확인했다.

## 8-0. 판정 요약

**실패 0 / 관찰 7 / 미검증 9.**
P1 의 보안 핵심(R2 개인 우선 · 팀 상속 · TEAM_ONLY fail-close · 팀장 write 범위 · stale 팀장 차단 · allowlist deny-by-default)은 **전부 통과**했고, 특히 **D4(자기 팀 동료 write 차단)** 와 **D5(전 리소스 false)** 는 실행으로 증명했다.
관찰 7건은 전부 **fail-close 방향이거나 현재 미발현**이며, 그중 1건(P1-O1)만 운영 판단이 필요하다.

| 검증 축 | 결과 |
|---|---|
| 권한 판정 매트릭스 (실행) | **52/52 PASS** |
| 프론트 순수 함수 (실행) | **14/15 PASS** (1건은 raw 입력 전용 divergence → P1-O4) |
| D1~D6 정정 근거 | 6건 전부 **타당** |
| C2 통합 | 통합 완료. 검출기는 **역사적 형태 1종만** 잡는다 → P1-O3 |
| P1-N2 (전 권한 상실 차단) | **JSON 직렬화 레벨까지 유효** |
| H1 (팀장 진입점 선행 read) | 4개 호출 전부 열림 — **재확인 완료** |
| P0 무회귀 | **전부 유지** |
| 실행 | BE 550 / FE 326 / build — **전부 EXIT=0** |

---

## 8-1. 권한 판정 매트릭스 — 실제 소스를 로드해 실행

I/O(Jira `/mypermissions` · users SQL · KVS permission · projectusers SQL · 팀 인덱스 로드)만 스텁으로 바꾸고 **판정 코드는 전부 실물**을 썼다. 픽스처 조직:

```
root(세트 SET_ROOT)
 ├ div(세트 없음, 리더=lead-1)
 │   ├ teamA(세트 SET_A)
 │   └ teamB(세트 없음)
 └ other(세트 없음)
```

| # | 조합 | 기대 | 실측 |
|---|---|---|---|
| 1 | admin | 전권 · `projectScope:'ALL'` · `scopedProjectIds=null` | PASS |
| 1c | admin + users 행 有 | 팀 정보 표시용으로 채움 (`teamKey='teamA'`) | PASS |
| 1d | admin + users 행 無 + stale 리더 | `isTeamLead:false` | PASS |
| 2 | 개인 세트 有 + 팀 세트 有 | **개인 우선**, `source='personal'`, **합집합 아님** — KVS `findById` **1회만** | PASS |
| 3 | 개인 `NULL` + 조상 팀 세트 有 | `source='team'`, 가장 가까운 조상 세트 | PASS |
| 4 | 개인 `NULL` + 체인에 세트 없음 | `source='none'` ∧ **17/17 리소스 전부 false** ∧ KVS 조회 0회 ∧ `isUser:true` | PASS |
| 5 | 팀 미소속 + TEAM_ONLY | `scopedProjectIds` **`[]`**(전사 아님) ∧ pairs 쿼리 **0회** | PASS |
| 5e | 팀 소속 + TEAM_ONLY | `scopeTeamKeys = ['div','teamA','teamB']`(자기팀+후손) | PASS |
| 6 | 팀장(div 리더, teamB 소속) | `leadingScopeTeamKeys=['div','teamA','teamB']` — 하위 포함 write 허용, **범위 밖(root 소속) 거부**, 대상 불명 거부 | PASS ×7 |
| 7 | 미등록 사용자(users 행 없음) + stale `leaderAccountId` | `isUser:false` ∧ `isTeamLead:false` ∧ **`getTeamIndex` 호출 0회** | PASS ×4 |

> 전체 로그는 `=== 52/52 PASS ===`. 아래 D 검증도 같은 실행에 포함돼 있다.

---

## 8-2. D1~D6 — 백엔드가 설계서와 다르게 구현한 6건

### D4 (최우선) — `leadingScopeAccountIds` 분리 ✅ **권한 상승 차단 확인**

설계서 §R3 은 같은 절에서 "`scopeTeamKeys` 를 write 판정에 쓰면 과대하다"고 하면서 예시 코드는 `teamScopeAccountIds`(= `scopeTeamKeys` 기반)를 썼다 — **자기모순**. 백엔드가 `leadingScopeAccountIds` 를 신설해 분리했다.

**결정적 시나리오를 실행했다** — `lead-2` 는 `teamA` 의 리더이면서 소속은 `teamB`(리더가 아닌 팀):

| 실측 | 값 |
|---|---|
| `scopeTeamKeys` (읽기) | `['teamB','teamA']` |
| `leadingScopeTeamKeys` (write) | `['teamA']` ← **분리됨** |
| `teamScopeAccountIds` | `['lead-2','mateB','mateA']` |
| `leadingScopeAccountIds` | `['mateA']` ← **mateB 미포함** |
| `isTeamLeadOver(setUserSkills, {accountId:'mateB'})` | **`false`** ← ★ 자기 팀 동료에게 write 불가 |
| `isTeamLeadOver(setUserSkills, {accountId:'mateA'})` | `true` ← 리더인 팀 팀원에게만 허용 |

또한 **비팀장**(`peer`, teamA 소속)은 같은 팀 `mate` 에게도 `false`. 코드 근거: `permissionGuard.js:92,104` 가 `leadingScopeAccountIds`/`leadingScopeTeamKeys` 만 참조하고 `teamScopeAccountIds` 는 **write 판정에서 전혀 쓰이지 않는다**(전역 확인).
→ **D4 정정은 타당하며, 정정하지 않았다면 실제 권한 상승이었다.**

### D5 — `permissionSource:'none'` 은 `allFalsePages()` ✅

설계서 §R2 는 `mergeSetPages([])` 를 "사실상 전부 false"라고 적었다. **실행으로 반증했다**:

```
mergeSetPages([]) 결과 중 true 인 키 = PUBLIC_HOLIDAY_MANAGEMENT
```
`ResourceCatalog.js` 의 `PUBLIC_HOLIDAY_MANAGEMENT.defaultForNew = {read:true}` 때문이다. 실제 구현은 `PrincipalResolver.js:280` 이 `allFalsePages()` 를 쓰고, 매트릭스 4b 에서 **17/17 키 전부 false** 를 확인했다. → **D5 정정 타당.**

### D2 — allowlist 가 `project_id`(snake) ✅

`TeamLeadFieldPolicy.js:41` `['project_id','accountId']`. 실행 확인:
```
applyTeamLeadFieldPolicy('removeProjectMemberByAccount',
  {project_id:7, accountId:'a', salary:999, permissionKey:'ADMIN', 미래필드:1}, 'TEAM_LEAD')
→ payload = {"project_id":7,"accountId":"a"}   dropped = ["salary","permissionKey","미래필드"]
```
실제 payload 가 snake 임을 소비 측에서 재확인: `ProjectUsersService.js:removeProjectMemberByAccountService({project_id, accountId})`. `projectId`(camel)는 allowlist 에 **없다**. → 설계서대로였다면 팀장 경로가 **항상 실패**(H2 재발)였을 것. **정정 타당.**

### D3 — allowlist 를 가드 1곳에서, **스코프 검증 다음에** ✅

`permissionGuard.js:136` `enforceProjectScope(principal, meta, req.payload)` → **그 다음** `:145` `applyTeamLeadFieldPolicy(...)` 로 `req.payload` 재할당. 순서 확인.
반대였다면 `removeProjectMemberByAccount` 의 `project_id` 가 allowlist 통과 전에 사라져 `pid=undefined` → 스코프 검증 skip 이 됐을 것이다. **현재 순서가 옳다.**

### D1 — teamLead 축 4키 (P2 1건 연기) ✅
실행 확인: 축 보유 키 = `['findTeamById','removeProjectMemberByAccount','getUserSkills','setUserSkills']`, allowlist 미등재 **0건**. `addTeamMembersToProject` 는 allowlist 에만 선등재(P2 예약) — `PERMISSION_MAP` 에 없으므로 계약 테스트 "(2) 고아 매핑 없음"과 충돌하지 않는다(BE 550건 통과로 확인). **타당.**

### D6 — `toRecord` 를 `TeamTreeCache` 로 이동 + re-export ✅
`TeamTreeCache.js:54` 정의, `TeamService.js:69` `export { toRecord }` re-export. `UserService → TeamLeadership → TeamTreeCache` 로 순환 없음(`TeamLeadership.js` 는 `UserService` 를 import 하지 않는다). **타당.**

---

## 8-3. 팀장 stale 참조 (fail-open 차단) ✅

### (a) 데이터 정합성 — cascade 0단계

`UserService.deleteByUserIdService` 실측:
```
0. clearTeamLeadershipOfUser(accountId)   ← 신규(KVS 역참조)
1. ProjectUsersQuery.DELETE_BY_ACCOUNT_ID
2. UserSchedule.DELETE_BY_ACCOUNT_ID
3. SkillMappingQuery.DELETE_USER_SKILLS_BY_ACCOUNT
4. deleteByAccountId            (users, 부모)
```
**기존 4단계의 순서·호출이 1바이트도 바뀌지 않았다.** `UserDeleteCascade.test.js` 는 BE 550건 안에서 통과.
0단계를 맨 앞에 둔 근거("KVS 실패 시 파괴적 SQL 0줄, 재시도 가능")도 코드와 일치한다.

### ⚠ 빈 문자열 저장 여부 — **저장하지 않는다** ✅ (코디네이터 지적 항목)

`TeamLeadership.js:48` 이 `toRecord({ ...team, leaderAccountId: null })` 를 거친다.
`TeamTreeCache.js:62-65` 의 `toRecord` 는 **값이 있을 때만 속성을 싣는다**:
```js
if (team.leaderAccountId) record.leaderAccountId = String(team.leaderAccountId);
```
→ `null` 이면 **속성 자체가 생략**되어 `''` 가 저장될 경로가 없다. (KVS 는 빈 문자열을 거부한다 — `Value for attribute "..." cannot be empty`.) 백엔드가 P0 권고문의 `''` 표기를 정정한 것이 코드에 반영됐다.

### (b) 판정 방어 — 미등록 사용자는 계산 자체를 안 한다 ✅ **주장 사실 확인**

`PrincipalResolver.js:241-255` 의 미등록 분기는 `resolveTeamContext` 를 호출하지 않고 `emptyTeamContext()` 를 쓴다.
**실행 확인**(매트릭스 7c): stale `leaderAccountId` 가 KVS 에 남아 있는 상태로 `resolvePrincipal` 호출 →
`isTeamLead:false` ∧ `leadingTeamKeys:[]` ∧ **`getTeamIndex` 호출 0회**.
admin 경로(`:205-211`)도 `users` 행이 있을 때만 팀 컨텍스트를 채운다(매트릭스 1d). → **"조회 0회"까지 실측으로 확인.**

---

## 8-4. C2 `normalizeScope` 통합 ✅ (검출기 한계 = P1-O3)

`src/permission/ProjectScope.js` 신설(`PROJECT_SCOPES` + `normalizeScope`). 4지점 전환 실측:

| 지점 | 확인 |
|---|---|
| `PrincipalResolver.js:39,304` | import + 호출 |
| `PermissionService.js:10` + **5개 호출**(`:24,40,56,96,137`) | import + 호출 |
| `SeedData.js:13,57`(Member 시드) | import + 호출 |
| `SeedData.js:98`(커스텀 세트 전수 순회) | 호출 |

전역 grep 결과 `MEMBER_ONLY` 리터럴 삼항 **0건**(남은 `=== 'MEMBER_ONLY'` 2곳은 분기 조건이지 정규화가 아니다).
실행 확인: `PROJECT_SCOPES.every(s => normalizeScope(s)===s)` ∧ `normalizeScope('TEAM_ONLY')==='TEAM_ONLY'` ∧ 미지값 → `'ALL'`.

**검출기를 일부러 위반시켜 확인**(코디네이터 지시) — 결과는 P1-O3 참조.

---

## 8-5. P1-N2 — 프론트가 "전 권한 상실" 경로를 실제로 막았는가 ✅

`userFormOptions.js` 순수 함수 4종을 **실물 로드해 실행**했다. 코디네이터 질문에 대한 답:

> **Q. 옵션 조회 실패(`[]`) 상태에서 저장하면 payload 에 무엇이 나가는가? `undefined` 인가 `null` 인가? JSON 직렬화 후를 보라.**

| 상황 | `permissionKey` | JSON 직렬화 후 |
|---|---|---|
| 개인 세트 보유 + 옵션 실패 | `'SET-abc'` (**원래 키 보존**) | `{"...","permissionKey":"SET-abc",...}` |
| 폼 미초기화(`permission=null`) | **`undefined`** | **`{"id":"u1"}` — 키가 사라진다** ✅ |
| 사용자가 "팀 상속" 명시 선택 | `null` | `{"id":"u1","permissionKey":null}` (의도된 상속 전환) |
| 이미 팀 상속인 사용자 + 옵션 실패 | `null`(무변화) | 동일 |

→ **`undefined` 는 JSON 직렬화에서 키가 실제로 소멸**하므로 백엔드 read-merge 가 현재값을 보존한다. "폼이 아직 안 찼다"가 "팀 상속으로 바꿔라"로 전달되는 경로가 **없다.**
`role/level/team` 도 `toKeyedOption` 이 키를 보존하므로(A2) 검증 O8 이 role/level 에 대해서도 닫혔다.
센티넬 `__TEAM_INHERIT__` 이 서버로 새지 않는 것도 확인.

### C1 read-merge 계약이 깨지지 않았는가 ✅

`useUserEditModal.js:188-192` 실측:
```js
roleKey:       editValues.role?.value       ?? null,   // 유지
levelKey:      editValues.level?.value      ?? null,   // 유지
permissionKey: toPermissionKeyPayload(editValues.permission),   // ← 권한만 교체
teamKey:       editValues.team?.value       ?? null,   // 유지
```
- role/level/team 은 **선택을 비우면 여전히 `null`(해제)** 로 나간다(실행 확인 G).
- 권한만 규칙이 다른 이유는 P1 에서 `permission_key=NULL` 의 의미가 "리셋"→"팀 상속"으로 바뀌었기 때문이며, `undefined`(보존)/`null`(해제) **규약 자체는 그대로**다. `isClearable` 제거로 "비우기"라는 경로 자체가 사라졌다(`UserEditModal.jsx`).
- SQL 레벨 재확인: `UPDATE_USER_WITH_SALARY` 가 `role_key/level_key/permission_key/salary/team_key/updated_id` 6컬럼을 SET 하고, `UserService.js:448-451` `pick()` 5필드 → `:459` bind 7인자 **순서 동일**. **C1 무회귀.**

---

## 8-6. §R7 미리보기 이중 구현 — 실물 대조 ✅ (한계 = P1-O4)

`resolveInheritedPermission`(프론트) ↔ `nearestAncestorWith`(백엔드)를 **양쪽 실물 로드해 랜덤 대조**했다(자기참조 20% / 손상 부모키 10% / 임의 부모 60%).

```
표본 18,044건 (이상 데이터 포함 트리 3,579개)
  정규화 parentTeamKey 입력  → 불일치 0건    ← 프로덕션 getTeamList 응답(F1 이후)
  raw parentTeamKey 입력     → 불일치 282건  ← 전부 사이클 데이터
```
→ **프로덕션 입력에서는 완전 동치.** 백엔드 규칙이 바뀌면 FE 테스트가 백엔드 모듈을 직접 import 하므로 즉시 깨진다(설계서 요구 충족).

### `static/ui/jest.config.js` transform 변경 — 기존 291건에 영향 없음 ✅

- 인라인 presets 가 `.babelrc` 와 **프로그램적으로 동일**함을 확인(문자열 비교 `true`).
- `transformIgnorePatterns: node_modules/(?!(@forge)/)` 는 그대로라 백엔드 파일(`src/...`)이 정상 변환된다.
- `testMatch` 는 `rootDir`(=`static/ui`) 범위라 **백엔드 테스트 파일이 프론트 실행에 딸려오지 않는다** — FE 24 suites / 326건으로 확인(백엔드 33 suites 와 별개).
- 291 → 326 (+35), 실패 0. **구조적으로 안전.**

---

## 8-7. `/my-page` 팀장 진입점 (H1) ✅ **선행 read 재확인 완료**

H1 은 "축을 write 에만 붙이고 선행 read 를 확인하지 않아" 생긴 결함이었다. **직접 재확인했다:**

| 호출 | 소스 | PermissionMap | Member 팀장 통과 |
|---|---|---|---|
| `findTeamById` | `useMyTeam` → `useTeamDetail` | `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` + **`teamLead.teamTargets:['teamKey']`**(`:73`) | ✅ 팀장 축 |
| `getUserSkills` | `UserSkillEditModal.jsx:32` | `OR[...]` + **`teamLead.accountTargets:['accountId']`**(`:264`) | ✅ 팀장 축 |
| `getSkillList` (스킬 카탈로그) | `SkillMultiSelect.jsx:34` | **`'PUBLIC'`**(`:250`) | ✅ |
| `setUserSkills` | `UserSkillEditModal.jsx:47` | `W(RESOURCE_MANAGEMENT)` + **`teamLead.accountTargets:['accountId']`**(`:268`) | ✅ 팀장 축 |

→ **읽기 → 편집 → 저장 경로가 끊기지 않는다.** 프론트 주장이 사실임을 독립 확인.

### UI 가 축과 정확히 일치하는가 ✅
`MyTeamSection.jsx` 의 버튼은 **스킬 편집 1종뿐**이다(grep 확인). 직무·등급·급여·권한 편집 버튼, 프로젝트 배정 버튼 **모두 없음** → "누르면 서버가 거부하는" 조용한 실패가 없다.
`useMyTeam` 은 `getTeamList` 를 쓰지 않고 `leadingTeamKeys`(store) + `findTeamById` 만 쓴다 — 팀장 축이 없는 resolver 를 부르지 않는다.

### allowlist 오탐 토스트 없음 ✅
- `setUserSkills` payload = `{accountId, skillIds}` ↔ allowlist `['accountId','skillIds']` → `droppedFields=[]`
- `getUserSkills` payload = `{accountId}` ↔ allowlist `['accountId']` → `[]`
- `findTeamById` payload = `{teamKey}` ↔ allowlist `['teamKey']` → `[]`

### 스코프 정합 ✅
`findTeamById.members[]` 는 `findUsersByTeamKey(teamKey)` = **직속 소속자**뿐이고, `teamKey ∈ leadingScopeTeamKeys` 이므로 그 인원은 전부 `leadingScopeAccountIds` 에 있다 → 목록에 보이는 사람은 전원 스킬 편집이 통과한다(불일치 없음).

---

## 8-8. `droppedFields` / 마스킹 배선 ✅

| resolver | 서버 위치 | 배선 | 프론트 |
|---|---|---|---|
| `updateUser` | `content.droppedFields` (`UserService.js:475`) | `UserController` `({payload, droppedFields}) => updateUserService({...payload, droppedFields})` | `useUserEditModal:207` `notifyDroppedFields` |
| `setUserSkills` | 루트 | `ResourceManagementController` | `UserSkillEditModal:57` |
| `removeProjectMemberByAccount` | 루트 (`ProjectUsersService`) | `ProjectUsersController` | `ProjectAssignmentBoard` |
| `findUserByAccountId` | `grantedBy` 전달 → `MASKED_FOR_TEAM_LEAD=['salary','permissionKey']` `null` 마스킹(`UserService.js:321-329`, **키 삭제 아님**) | 축 없음 → 호출 지점 0 | 조치 없음 |

- `extractDroppedFields` 가 **두 위치를 모두** 본다(실행 확인 4/4).
- `{...payload, droppedFields}` 는 가드 값이 뒤에 와서 **클라이언트가 보낸 동명 키를 덮어쓴다** — 위조 불가. ✓
- `updateUserService` 시그니처가 `droppedFields = []` 를 받아 `{content:{droppedFields}}` 로 반환. 기존 유일 호출부는 `res.success` 만 보므로 **무회귀.**

---

## 8-9. 관찰 (실패 아님 — 전부 fail-close 이거나 현재 미발현)

| # | 심각도 | 내용 |
|---|---|---|
| **P1-O1** | **Medium — 리더 판단** | **팀장의 `removeProjectMemberByAccount` 는 프로젝트 축으로 제한되지 않는다.** `meta.project='inherited'` 지만 `enforceProjectScope` 는 `scopedProjectIds(principal)===null` 이면 skip 하고(`permissionGuard.js:41`), **Member 시드의 기본 `projectScope` 는 `'ALL'`**(`SeedData.js:57` — 최초 시드에서 `normalizeScope(undefined)='ALL'`). 서비스에도 추가 검사가 없다(`ProjectUsersService.removeProjectMemberByAccountService`). ⇒ **Member 세트 팀장은 자기 팀원을 *아무 프로젝트에서나* 배정 취소할 수 있다.** 인원 축(`leadingScopeAccountIds`)은 지켜지므로 남의 팀원은 못 건드리고, 되돌릴 수 있는 작업이라 파괴적이진 않다. 설계서 §R3 이 이 키를 유지하기로 한 결정 자체는 지켜졌으므로 **설계 위반은 아니다** — 다만 blast radius 가 어디에도 문서화돼 있지 않다. 선택지: (a) 수용하고 명문화, (b) 운영에서 Member 를 `TEAM_ONLY`/`MEMBER_ONLY` 로 설정, (c) `teamLead` 축에 프로젝트 스코프 요구를 추가 |
| **P1-O2** | Low | **`permissionSource:'none'` 인 팀장은 팀장 권한도 잃는다.** `PrincipalResolver` 6단계 조기 반환이 8단계(`fillTeamScopeAccounts`)를 건너뛰어 `leadingScopeAccountIds` 가 `null` 로 남고, `isTeamLeadOver` 가 `allowed.size===0` 으로 거부한다. **fail-close 라 안전**하지만 "팀장인데 아무것도 안 되는" 상태의 원인이 화면에 설명되지 않는다(FE-P1-3 와 같은 뿌리) |
| **P1-O3** | Low | **C2 정적 검출기는 역사적 형태 1종만 잡는다.** 일부러 위반을 만들어 실측: 원본 삼항(한 줄/줄바꿈/쌍따옴표) **검출 O**, 주석 제외 **정상**. 그러나 `['ALL','MEMBER_ONLY'].includes(scope) ? scope : 'ALL'` · `if (s !== 'MEMBER_ONLY') s='ALL'` · 백틱 리터럴 · 상수 경유 **4형태 전부 검출 X**. 즉 "재복제 0건"은 그 정규식이 아는 형태에 한한 주장이고, 자기검증 테스트는 "정규식이 죽지 않았다"만 보장한다. 보완: import 기반 검사(이미 있는 3번째 테스트)를 **4지점 외 파일이 자체 정규화를 하지 않는지**까지 넓히거나 ESLint 규칙화 |
| **P1-O4** | Low | **§R7 미러는 "정규화된 입력" 전제에서만 백엔드와 동치다.** 실측: 프로덕션 입력 18,044건 **0 불일치**, raw 입력 **282건 불일치**(전부 사이클, 방향은 **fail-open** — 미리보기는 "상속됨"이라 하는데 서버는 `none`). FE 대조 테스트 픽스처에 **사이클 케이스가 없다**(dangling `orphan` 만) → P0 F1 정규화가 되돌려지면 이 테스트는 통과한 채로 미리보기가 거짓말한다. 보완: 미러에 **같은 파일에 이미 있는 `findCycleMemberKeys`** 를 적용하거나, 픽스처에 사이클을 넣고 "정규화 입력 전제"를 계약으로 명시 |
| **P1-O5** | Low | **§R3-B 의 "마스킹 적용 대상 없음"은 더 이상 정확하지 않다.** `findTeamById` 에는 teamLead 축이 있고, 그 `content.team` 에는 P0 에서 `permissionKey`/`permissionName` 이, F2/O1 에서 `leaderEmail` 이 추가됐다. 팀장 경로로 **팀의 권한세트 키·이름과 팀장 이메일이 노출**된다. 사용자 재무정보가 아니고 팀장은 그 팀의 리더이므로 위험은 낮고, `MyTeamSection` 은 이 필드들을 **표시하지 않는다**(실측). 규칙 문구를 갱신하거나 마스킹 적용 여부를 명시할 것 |
| **P1-O6** | Low (잠재) | **`isTeamLeadOver` 의 2축 OR 은 "해석된 축만" 검증한다.** 한 resolver 에 `accountTargets` 와 `teamTargets` 를 **둘 다** 붙이면 호출자가 쉬운 축만 채워 어려운 축을 우회할 수 있다(`anyAxisResolved` 가 true 면 통과). **P1 에는 두 축을 동시에 가진 키가 0개**라 현재 미발현. 설계서 §R3 예시는 `addTeamMembersToProject` 에 두 축을 동시에 쓰므로 **P2 착수 전에** "선언된 모든 축이 해석돼야 통과"로 바꿀지 결정할 것 |
| **P1-O7** | 정보 | 프론트 리포트의 `permission 60/60` 은 실제 **61/61**(`previewUnknown` 추가 후 재계수 누락). 무해 |

---

## 8-10. P0 무회귀 — 전부 유지 ✅

| 항목 | 실측 |
|---|---|
| C1 read-merge (SQL 레벨) | `UPDATE_USER_WITH_SALARY` 6 SET 컬럼 ↔ `pick()` 5필드 ↔ bind 7인자 순서 동일. `invoke("updateUser")` **여전히 1곳** |
| 팀 필터 3상태 | `TEAM_FILTER_NONE='__NONE__'` 양측 동일, `applyTeamFilter` 무변경, `{value:null}` 생성 경로 0 |
| `toRecord` 빈 문자열 저장 | 4개 선택 속성 전부 `if (값) record.x = ...` — **저장 0** |
| `whereIn([])` 가드 | `TeamRepository.js:27,50,99,111` + `ProjectUsersRepository.js:102` (신규 `findProjectIdsByAccountsRepository` 포함) |
| `toParentOption` value 보존 | `buildTeamTree.js:245` 미변경 |
| P2/P3 코드 | 코드 0건 (`TeamLeadFieldPolicy` P2 예약 1줄 + 주석 1건은 의도) |
| **DnD** | **0건** (금지 주석 1건뿐) |
| U11 cascade | 기존 4단계 순서 불변(0단계만 앞에 추가) |
| U7~U10 | `ProjectUsersQuery` 는 **추가만**(`FIND_PROJECT_IDS_BY_ACCOUNTS`), `FIND_BY_PROJECT_ID`/`UPDATE_BY_KEY_WITH_PARAMS` 미변경. `projectDashboard/` 무변경 |
| S4 무회귀 | 소비자 6파일 중 5파일 `git status` **무출력 = 무변경**(`permissionGuard` 만 P1 로 변경, `enforceProjectScope` 로직은 동일) |
| i18n | team 65/65 · common 105/105 · user 89/89 · permission 61/61 · myPage 120/120 **전부 대칭**. 프론트 전체 **1,527 참조 키** 중 팀/권한 관련 누락 **0건**. `npm run merge` 재실행 전후 **해시 동일** = 수기 편집 없음 |

> 팀과 무관한 기존 i18n 누락 2건(`level.modal.edit.label.title`, `upload.error`)은 P0 리포트에 이미 기록한 별건.

---

## 8-11. 실행 검증 (원문 — `cmd /c "... & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\p1be.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 33 passed, 33 total
Tests:       550 passed, 550 total        <- 리포트 주장 550 일치 (456 -> 550, +94)
Snapshots:   0 total
```
```
> cmd /c "npx jest --ci > %TEMP%\p1fe.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 24 passed, 24 total
Tests:       326 passed, 326 total        <- 리포트 주장 326 일치 (291 -> 326, +35)
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\p1bd.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.        (node_modules 소스맵 3건 — 팀 기능 이전부터 존재)
The build folder is ready to be deployed.
```
```
> cmd /c "npm run merge > %TEMP%\p1m.txt 2>&1 & echo MERGE_EXIT=%errorlevel%"
MERGE_EXIT=0
ko-KR.json / en-US.json 재실행 전후 해시 동일 = True
```

**빌드·테스트는 P1-O1/O4/O6 을 잡지 못한다** — 전부 교차 대조와 실행 시뮬레이션으로만 드러났다.

---

## 8-12. 미검증 (배포/E2E 필요)

| # | 항목 | 확인 방법 |
|---|---|---|
| P1-U1 | **TEAM_ONLY 실기동** — 세트에 지정 + 팀원 배치 후 프로젝트 목록이 실제로 좁혀지는가 | 스테이징. 로컬은 매트릭스 mock 으로만 고정 |
| P1-U2 | **팀장 축 실기동** — Member 세트 팀장이 `/my-page` "내 팀"에서 팀원을 보고 스킬을 저장하는가 | 팀장 계정 필요 |
| P1-U3 | **90초 stale 창**(TeamTree 60 + principal L1 30) 실측 | 배포 후 관측 |
| P1-U4 | `SEED_VERSION 8` 시드 후 커스텀 세트의 `projectScope=TEAM_ONLY` 보존 | 배포 후 KVS 확인 |
| P1-U5 | `permissionSource:'none'` 사용자의 실제 화면(로그인은 되는데 전부 안 보임) | 배포 후 |
| P1-U6 | 리더 겸임(2팀 이상) 팀장의 팀 선택기 UX (FE-P1-2) | 실데이터 |
| P1-U7 | `findUserByAccountId` 마스킹 — 축이 없어 **현재 발현 경로 0**. 축 추가 시 자동 동작 여부 | 축 추가 시 |
| P1-U8 | 팀장이 `removeProjectMemberByAccount` 를 실제로 통과하는가(P1-O1 의 blast radius 실측 포함) | 스테이징 |
| P1-U9 | P0 §2 U-1~U-6(KVS 커서 · integer 0 저장 · ALTER · deploy 순서 · TEAM_MANAGEMENT 수동 부여) — **여전히 유효** | 배포 |

---

## 8-13. 리더 판단 요청 5건에 대한 검증 사실

| # | 항목 | 검증으로 확인한 사실 |
|---|---|---|
| **P1-N1** | `mergeSetPages([])` 가 전부 false 가 아니다 | **실측: true 로 남는 키는 `PUBLIC_HOLIDAY_MANAGEMENT` 하나뿐이다.** 즉 KVS 세트 로드 실패 시 노출되는 것은 **공휴일 목록 조회 1건**이다. fail-close 로 바꿔도 잃는 기능이 거의 없고, 유지해도 노출면이 매우 좁다 — **어느 쪽을 골라도 위험이 낮음**을 수치로 확인했다. 다만 `permissionSource:'none'` 신규 경로는 이미 `allFalsePages()` 라 두 경로의 규칙이 **다르다**는 점만 인지할 것 |
| **P1-N2** | 프론트가 막았는가 | **막았다.** JSON 직렬화 레벨까지 확인(§8-5). 백엔드가 추가로 할 일 없다는 판단에 동의 |
| **FE-P1-1** | `useTeamTree` 재시도 4회 | `ProjectScopeField.jsx:46` 은 **`enabled: isTeamOnly`** 라 관리자가 TEAM_ONLY 를 고르는 순간에만 호출된다(상시 아님). 같은 훅을 `TeamPage`·`useUserEditModal` 도 쓰므로 `retry:false` 를 훅에 박으면 3곳이 함께 바뀐다 → **`retry` 를 훅 옵션으로 노출해 호출부별로 정하는 편**이 부작용이 없다 |
| **FE-P1-2** | `leadingTeams:[{teamKey,name}]` 추가 비용 | **매우 낮다.** `PrincipalResolver.resolveTeamContext` 가 이미 `index.byKey` 를 손에 들고 있어 `leadingTeamKeys.map(k => ({teamKey:k, name:index.byKey.get(k)?.name ?? null}))` 로 **추가 조회 0회**에 만들 수 있다. `userPermissionCheck.team` 은 이미 5키를 싣고 있어 필드 추가만으로 끝난다 |
| **FE-P1-3** | `permissionSource:'none'` 안내 부재 | **이 상태는 P1 에서 새로 도달 가능해졌다.** P0 까지는 `addUserService` 가 `permission?.value ?? getMemberId()` 로 항상 Member 를 채워 사실상 불가능했고, P1 의 "팀 상속" 옵션이 생기면서 관리자가 만들 수 있게 됐다. `inheritPreview` 가 **만드는 순간**에는 경고하지만, **이미 그 상태가 된 당사자**에게는 아무 안내가 없다(로그인은 되는데 전 화면이 비어 보인다). 마이페이지 "내 권한" 한 줄 추가를 권고 — store 셀렉터(`getPermissionSource`)는 이미 있다 |

---

## 8-14. 담당별 조치 요청 (P1)

### 필수 — **0건**
P1 은 배포 판정 기준(권한 판정 정확성)을 충족한다.

### 권장
**backend-engineer**
1. **P1-O6** — P2 `addTeamMembersToProject` 에 두 축(`accountTargets`+`teamTargets`)을 동시에 붙일 계획이라면, 그 전에 `isTeamLeadOver` 를 "선언된 모든 축이 해석돼야 통과"로 바꿀지 결정할 것. 지금 바꾸면 P1 동작은 불변이다(두 축을 가진 키가 0개).
2. **P1-O5** — §R3-B 규칙 문구를 갱신하거나 `findTeamById` 의 `permissionKey`/`permissionName`/`leaderEmail` 을 TEAM_LEAD 경로에서 마스킹할지 명시.
3. **FE-P1-2** — `userPermissionCheck.team.leadingTeams` 추가(추가 조회 0회).

**frontend-engineer**
1. **P1-O4** — `resolveInheritedPermission` 에 같은 파일의 `findCycleMemberKeys` 를 적용하고, `inheritedPermission.test.js` 픽스처에 **사이클 케이스**를 추가.
2. **FE-P1-3** — `permissionSource:'none'` 안내 1줄(마이페이지).

### 리더 판단
- **P1-O1** — 팀장의 배정 취소가 프로젝트 축으로 제한되지 않는 점을 수용할지(§8-9).
- **P1-N1** — `mergeSetPages([])` 의 `PUBLIC_HOLIDAY_MANAGEMENT` 를 fail-close 로 바꿀지(노출면은 공휴일 조회 1건).
- **P1-O3** — C2 검출기를 ESLint 규칙 등으로 강화할지.
- **FE-P1-1** — `useTeamTree` 의 `retry` 를 옵션화할지.

---
---

# 9. 실기동 수정 검증 (2026-07-28) — 4건

> 입력: `02_backend_report.md` **§P1-C**(시드 프리셋), `02_frontend_report.md` **§P1-J·§P1-K**, 실제 소스
> 성격이 다르다 — 앞선 P0/P1 은 신규 구현 검증이었지만 이번은 **배포된 코드에서 실제로 터진 것**과 그 파급이다.
> 공통 API 변경이 섞여 있어 **팀 기능 밖(포트폴리오·작업배정·이슈 협업자)** 까지 대조했다.

## 9-0. 판정 요약

**실패 1 / 관찰 5 / 미검증 6.** 수정 4건 자체는 **전부 의도대로 동작**하며, 실패 1건은 같은 함수를 감사하다 나온 **기존 잠재 결함**(이번 수정이 만든 회귀는 아니나 새 계약 선언과 모순).

| # | 대상 | 판정 | 근거 |
|---|---|---|---|
| 1 | `getBulkJiraUsersApi` 배열 통일 | **통과** (+ RT-F1 발견) | 소비자 9호출부/7파일 추출식을 소스에서 옮겨 실행 — 객체를 기대하는 소비자 **0건** |
| 2 | 팀 상세 에러 UI | **통과** (관찰 2) | `err.code` 보존·retry 정책·배선 확인 |
| 3 | 시드 프리셋 4종 | **통과** | `SeedData.js` 실제 로드 **29/29 PASS**. manifest 선언 **불필요**(422 위험 없음) |
| 4 | 팀 권한 미지정 경고 | **통과** | **12/12 PASS** + 백엔드 규칙 대조 랜덤 12,031건 **불일치 0** |
| — | P0/P1 회귀 | **전부 유지** | 권한 매트릭스 52/52 재통과, i18n 대칭, merge 멱등 |
| — | 실행 | BE **591** / FE **364** / build **EXIT=0** | 주장 수치 전부 일치 |

> 부수 확인: **P1-O4(§R7 미러의 raw 입력 divergence)가 완전히 닫혔다** — 재측정 결과 raw 입력 불일치 **282건 → 0건**(§9-5).

---

## 9-1. `getBulkJiraUsersApi` 반환 타입 통일 — 소비자 전수 대조 ✅

### 대조 방법
`src/` 전역 grep 으로 호출부 **9개(7파일)** 를 찾고, 각 소비자의 **추출식을 소스에서 글자 그대로 옮겨** 구/신 반환값에 적용해 실행했다.

| 소비자 | 추출 패턴 | 빈 입력 **수정 전** | 빈 입력 **수정 후** |
|---|---|---|---|
| `UserService` ×4 (`:160,231,275,608`) | `(x ?? []).flatMap(r => r?.values ?? r?.data?.values ?? r ?? [])` | 💥 `TypeError: flatMap is not a function` | 정상 0건 |
| `CoworkerResolver:33` / `IssueApi:73` | `(results \|\| []).forEach(res => (res?.values \|\| []).forEach(...))` | 💥 `TypeError: forEach is not a function` | 정상 0건 |
| `ProjectUsersService:295` | `jiraResults.forEach(res => res?.values?.forEach(...))` — **가드 없음** | 💥 `TypeError: forEach is not a function` | 정상 0건 |
| `PortfolioAggregator.flattenBulkUsers` | `Array.isArray(res) ? res : []` | 정상 0건 | 정상 0건 |
| `ProjectService:191` | `Array.isArray(b) ? b.flatMap(...) : (b?.values ?? [])` | 정상 0건 | 정상 0건 |
| `WorkAssignmentIssueFetcher.resolveUserRefMap` | `Array.isArray(r) ? r : [r]` | 정상 0건 | 정상 0건 |

### 코디네이터 질문에 대한 답

**Q1. `PortfolioAggregator` / `WorkAssignmentIssueFetcher` 는 배열 통일 후에도 정상인가?**
→ **정상.** 둘 다 `Array.isArray` 분기라 **수정 전후 결과가 동일**하다(빈 입력 0건, 정상 입력 1건, 실행 확인). 우회 코드를 지우지 않은 것도 옳다 — RT-F1 때문에 여전히 필요하다.

**Q2. `{values:[]}` 객체를 기대하는 소비자가 남아 있는가?**
→ **0건.** 6개 패턴 전부 배열 입력에서 데이터 추출에 성공한다(실행 확인). 객체 전용 접근만 하는 소비자는 없다.
테스트 mock 도 전수 확인했다 — `TeamService.test.js:61`·`UpdateUserMerge.test.js:30` 은 `[]`, `PortfolioAggregatorAsApp.test.js:19` 는 `[{values:[]}]`. **전부 배열**이라 새 계약과 일치한다.
(신규 테스트의 진단 "mock 이 배열을 반환해 그 분기가 미검증이었다"도 `TeamService.test.js:61` 에서 실증됐다 — 팀 상세 버그가 로컬에서 안 잡힌 이유가 정확히 이것이다.)

**Q3. 팀 기능 밖 도메인의 회귀는?**
→ **없다.** 포트폴리오(`flattenBulkUsers`)·작업배정(`resolveUserRefMap`)·이슈 협업자(`CoworkerResolver`/`IssueApi`) 전부 배열에서 정상 동작한다.

### 추가 수확
`ProjectUsersService.getProjectUserWithScrollService:295` 는 **가드가 없는 `forEach`** 라 `accountIds` 가 비면(행은 있는데 `account_id` 가 전부 falsy) 같은 TypeError 가 났다. 이번 수정으로 **함께 닫혔다.**

---

## 9-2. ❌ **RT-F1 (Medium)** — "항상 배열" 계약이 **부분 실패 시 깨진다**

수정된 JSDoc 은 `@returns {Promise<Array<{values: Array}>>}` 라고 **선언**하지만, 비어 있지 않은 입력에서 **청크 1개가 실패하면 그 계약이 성립하지 않는다.**

**근거 (`src/api/jira/util/RequestJiaJson.js`)**
```js
if (!res.ok) { ...; if (fallback !== undefined) return fallback; }   // :22-26  → []
if (!text) return null;                                             // :29     → null
catch (e) { ...; if (fallback !== undefined) return fallback; }      // :33-36  → []
```
`getBulkJiraUsersApi` 의 청크 루프는 `fallback: []` 로 호출하고 그 결과를 `results.push(res)` 한다(`UserApi.js:47-55`).
→ 반환 배열의 원소가 **`[]` 또는 `null`** 이 될 수 있다: `[[], { values:[...] }]`

**왜 위험한가 — `[].values` 는 `undefined` 가 아니다**
`Array.prototype.values` **함수**이며 truthy 다. 그래서 `res?.values ?? []` / `res?.values || []` 가 **함수를 값처럼 통과시킨다.**

| 소비자 | `[]` 원소가 섞였을 때 |
|---|---|
| `CoworkerResolver:33`, `IssueApi:73` | `(res?.values \|\| []).forEach` → **TypeError 💥** |
| `ProjectUsersService:295` | `res?.values?.forEach` → **TypeError 💥** |
| `PortfolioAggregator.flattenBulkUsers` | `for...of (c?.values ?? [])` → **`function is not iterable` 💥** |
| `WorkAssignmentIssueFetcher` | TypeError → try/catch 흡수 → **전 사용자 이름이 accountId 로 퇴화**(조용한 품질 저하) |
| `UserService` ×4, `ProjectService` | 함수가 flatMap 결과에 섞여 **key `undefined` 인 쓰레기 Map 엔트리**(예외 없음, 조용함) |

실행 확인: 혼합 입력(`[[], {values:[…]}]`)에서 **6패턴 전부 실패**(4개 예외 / 2개 조용한 오염).

**분류 근거**
- 이번 수정이 **만든 회귀는 아니다** — `fallback: []` 는 미변경이고 이 경로는 이전에도 같았다.
- 그러나 **이번 수정이 선언한 계약("항상 `[{values:[]}]`")이 거짓**이고, 신규 회귀 테스트 `BulkUsersApiShape.test.js` 는 **빈 입력(Jira 호출 없음) 경로만** 5+3건 덮어 이 구멍을 잡지 못한다. 같은 함수·같은 종류의 문제라 이번 회차에서 닫는 것이 맞다.

**발현 조건**: Jira `GET /rest/api/3/user/bulk` 가 한 청크라도 **429(rate limit) / 5xx / 401** 을 반환. 100명 초과 조회(청크 2개 이상)에서 확률이 올라간다.

**수정 (`src/api/jira/user/UserApi.js` 청크 루프)**
```js
const res = await requestJiraJson({ ... });
// 실패 청크는 fallback([]) 이나 null 로 오므로 계약 형태로 정규화한다.
//   ⚠ [].values 는 undefined 가 아니라 Array.prototype.values(함수)라 소비자가 그대로 삼킨다.
results.push(res && !Array.isArray(res) && Array.isArray(res.values) ? res : { values: [] });
```
+ `BulkUsersApiShape.test.js` 에 **"청크 1개 실패"** 케이스 추가(`requestJiraJson` mock 이 `[]` 를 반환하는 시나리오).

---

## 9-3. 팀 상세 에러 UI ✅ (관찰 2건)

| 확인 항목 | 결과 |
|---|---|
| `useTeamDetail` 이 `err.code` 를 보존하는가 | ✅ `useTeamDetail.js:37-39` — `const err = new Error(...); err.code = res?.error?.code;` |
| `teamErrorMessage` 가 그 code 로 번역을 고르는가 | ✅ `teamErrors.js:21` `t('team.error.'+code)`, 미매핑은 서버 message |
| `NON_RETRYABLE` 즉시 에러 | ✅ 5코드(`TEAM_NOT_FOUND`·`TEAM_KEY_REQUIRED`·`PERMISSION_DENIED`·`PERMISSION_UNMAPPED`·`PERMISSION_PROJECT_SCOPE_DENIED`) → `retry` false |
| 그 외 1회만 재시도 | ✅ `failureCount < 1` (총 2회 시도) |
| `TeamDetailPanel` 배선 | ✅ `isLoading` 분리, `isError`/`error`/`onRetry(=refetch)` 를 `TeamPage.jsx:237-240` 에서 전달 |
| `common.button.retry` | ✅ ko `"다시 시도"` / en `"Retry"` 양쪽 존재 |

### Q. **`!team` 인데 에러가 아닌 경우**에도 에러 화면이 뜬다 — 옳은가? → **옳지 않다. 같은 리포에 더 나은 패턴이 이미 있다.**

같은 훅(`useTeamDetail`)을 쓰는 `MyTeamSection.jsx:89-96` 은 **3분기**다:
```jsx
{isError ? <SectionMessage appearance="error">…</SectionMessage>
 : !team ? <빈 상태 문구 t('myPage.team.empty')>
 : <콘텐츠>}
```
`TeamDetailPanel.jsx` 는 `isError || !team` 으로 **둘을 합쳤다.** 같은 데이터인데 두 화면의 판정이 갈린다 → **RT-O1**.

- 현재 3개 호출부에서 `!team ∧ !isError ∧ !isLoading` 은 **도달 불가**하다(쿼리가 항상 enabled 이고, 백엔드는 성공 시 `content.team` 을 반드시 싣는다 — 없으면 `TEAM_NOT_FOUND` 를 던진다). 그래서 **지금은 실패가 아니다.**
- 다만 TanStack Query v5 는 **데이터가 있는 상태에서 refetch 가 최종 실패하면 `status:'error'` 이면서 `data` 를 유지**한다. `staleTime: 30초` 라 창 포커스·재마운트마다 refetch 가 돌 수 있어, **일시적 네트워크 실패로 이미 보고 있던 팀 상세가 통째로 에러 화면으로 바뀐다.**

---

## 9-4. 시드 권한 프리셋 4종 ✅ — `SeedData.js` 를 실제 로드해 실행 (**29/29 PASS**)

KVS(top-level)와 `CustomEntityManager` 만 인메모리 스텁으로 대체하고 `addPresetPermissionSeed` / `migratePermissionSets` / `addPermissionSeed` 를 **실물로** 돌렸다.

### 갱신 정책 — 원장 방식이 실제로 동작한다

| 시나리오 | 실측 |
|---|---|
| 최초 실행 | 4종 생성 · 전부 `edit:true` · pages **17/17 카탈로그 전 키** · 원장 `{PM,PMO,TeamLead,TeamMember: true}` |
| **2회 실행** | **프리셋 save 0회** ∧ **원장 재기록 0회**(변화 없으면 쓰지 않는다) |
| **조직이 수정** | `name='우리회사PM'` · `projectScope='MEMBER_ONLY'` · `PROJECT_COST` 닫음 → **전부 유지** |
| **1종 삭제** | 부활 **X** (save 0) |
| **전부 삭제** | 부활 **X** (save 0) |
| 원장 키 삭제 | 다시 제공됨(§P1-C6 #2 의 문서화된 복구 절차와 일치) |
| 같은 **id** 존재 | 덮어쓰지 않음 ∧ 원장에는 기록(재시도 안 함) |
| 같은 **이름** 존재 | 생성 안 함 ∧ 원장 기록 |
| **이름 스캔 실패** | **생성 0 ∧ 원장 `undefined` ∧ `kvs.set` 0회** — 오염 없음 |

### `TEAM_ONLY` 보존 — **생성 직후 + migrate 통과 후 양쪽 확인**

| 시점 | Team Lead | Team Member | 기존 커스텀 세트 |
|---|---|---|---|
| 생성 직후 | `TEAM_ONLY` ✅ | `TEAM_ONLY` ✅ | — |
| `migratePermissionSets` 통과 후 | `TEAM_ONLY` ✅ | `TEAM_ONLY` ✅ | `TEAM_ONLY` ✅ |

`normalizeScope`(C2 단일 출처)가 `PROJECT_SCOPES.includes` 방식이라 격하되지 않는다. `migratePermissionSets` 는 `name === 'Admin'|'Member'` 만 제외하므로 **프리셋 4종도 이 순회를 통과**하는데, 그래도 scope·`edit:true`·`name`·pages 가 전부 보존됨을 실측했다.

### `migratePermissionSets` 무회귀
- 구 카탈로그 세트(TEAM_MANAGEMENT 키 없음)에 **누락 키 보충** ✅ (17/17)
- 신규 키 기본값 = `defaultForNew`(닫힘) ✅
- Admin/Member 는 건드리지 않음(`edit:false` 유지) ✅

### 구성표 검증
SETTINGS **10키 전부 닫힘**(4종 × 전 키) ✅ / `PROJECT_COST` 는 PM(rw)·PMO(r) 만 ✅ / **Lead↔Member 차이는 `RESOURCE_MANAGEMENT` 하나** ✅ / PMO·Lead·Member 는 **write 0** ✅ / `SEED_VERSION` 8→9 ✅ / 테스트 22건 ✅

### ⚠ manifest 선언 — **불필요. 배포 422 위험 없음** (코디네이터 최대 우려)

`permission_preset_provisioned` 은 `kvs.get(key)` / `kvs.set(key, obj)` = **top-level KVS** 다.
`app.storage.entities` 선언이 필요한 것은 **`kvs.entity(name)` 커스텀 엔티티 API** 뿐이다.

| 근거 | 확인 |
|---|---|
| **같은 파일의 선례** | `SeedData.js:26,30` 의 `kvs.get('seed_version')` / `kvs.set('seed_version', …)` — **manifest 미선언 상태로 운영 중** |
| 객체 저장 선례 | `PortfolioSnapshotRepository.js:78` `kvs.set(ROLLUP_KEY, meta)` (객체) |
| manifest 실측 | `permissions.scopes` 에 **`storage:app` 존재**(:315). `entities` 12종(role·team·level·skill·permission·status·status_link·settings·holiday·job·job_batch·job_fail)에 top-level 키는 **하나도 없다** |
| grep | `seed_version` / `permission_preset_provisioned` / ROLLUP 키 → manifest **0건** |

→ **KVS 빈 문자열(U3) 건과는 계열이 다르다.** 그건 *엔티티 attribute 값* 제약이었고, 이건 *엔티티 자체를 쓰지 않는* 경로다.

---

## 9-5. 팀 권한 미지정 경고 ✅ (**12/12 PASS**)

`resolveTeamPermissionEffect` 를 실물 로드해 코디네이터 체크리스트를 전부 실행했다.

| 요구 | 실측 |
|---|---|
| **팀 목록 없이 확정되는 경우가 unknown 으로 새지 않는가** | ① 이 팀에 세트 지정 → `own`(로딩/실패 플래그가 켜져 있어도) ✅ ② **미지정 + 최상위 팀 → `none`/warning**(가장 흔한 케이스) ✅ |
| **로딩 중** | `null` — **아무 주장도 하지 않는다** ✅ |
| **조회 실패** | `unknown`/info ✅ |
| **상위 팀이 로드된 목록에 없음**(부분 로드·`truncated`) | `unknown` ✅ |
| 목록이 비었는데 플래그가 없는 경우 | `unknown` (거짓 "없음" 금지) ✅ |
| **자기 팀의 저장된 세트를 섞지 않는가** | ✅ **부모부터 탐색**(`resolveInheritedPermission(list, parentTeamKey)`). 대조군으로 self 부터 부르면 옛 값(`B`)이 나오는 것까지 실증 — 편집 모달에서 세트를 방금 비운 상황에서 "상속됨 B" 오표시가 발생하지 않는다 |
| 확정 분기 | 상속됨(`hq/PM` 로 올라감) ✅ / 상속 없음(체인에 세트 0) → warning ✅ |

### 백엔드 `nearestAncestorWith` 와 규칙이 갈라지지 않는가
프론트 경고 판정(own/none/inherited)을 **실효 권한 키로 환원**해 백엔드 실물과 대조:
```
랜덤 12,031건 (자기참조·손상 부모키·사이클 포함) → 불일치 0건
```
합성이 백엔드의 "self 포함 상향 탐색"과 정확히 동치다(① 이 self 를 담당하고 ③ 이 조상을 담당).
호출부 배선도 확인 — 등록 모달(`TeamRegistrationModal.jsx:50-60`, `defaultParentTeamKey` 폴백 포함)·편집 모달(`useTeamEditModal.js:129-138`) **둘 다 폼의 라이브 값**을 넘긴다.

### 부수 확인 — **P1-O4 완전 해소** ✅
`resolveInheritedPermission` 이 `findCycleMemberKeys`(**`buildTeamTree` 와 같은 헬퍼** — 사이클 판정이 두 벌로 갈라지지 않는다)를 써서 사이클 구성원에서 탐색을 끊는다(`buildTeamTree.js:218,234`).
재측정: **raw `parentTeamKey` 입력 불일치 282건 → 0건**, 정규화 입력 0건 (표본 17,755건 / 이상 데이터 트리 3,577개).

---

## 9-6. 관찰

| # | 심각도 | 내용 |
|---|---|---|
| **RT-O1** | Low | **`TeamDetailPanel` 의 `isError \|\| !team` 합침.** 같은 훅을 쓰는 `MyTeamSection.jsx:89-96` 은 이미 3분기(에러/빈 상태/콘텐츠)다. 또한 v5 는 데이터 보유 상태에서 refetch 최종 실패 시 `status:'error'` + `data` 유지라, `staleTime:30초` 환경에서 **일시 장애로 보고 있던 상세가 통째로 에러 화면이 된다.** 권고: `isError && !team` → 전면 에러 / `isError && team` → 콘텐츠 유지 + 상단 배너 / `!team && !isError` → 빈 상태 |
| **RT-O2** | Low | **새 에러 화면의 가장 흔한 케이스가 영문으로 나온다.** `PERMISSION_DENIED` 는 `NON_RETRYABLE` 에는 있으나 `teamErrors.TRANSLATED_CODES` 에는 없어 서버 원문(`You do not have permission to perform this action`)이 그대로 렌더된다. `team.error.PERMISSION_DENIED` 1키 추가 + 집합 등재면 끝 |
| **RT-O3** | Low | **형제 훅 `useTeamTree` 에는 retry 정책도 `err.code` 보존도 적용되지 않았다**(`useTeamTree.js:24` — `new Error(message)` 만). 기본 3회 재시도가 그대로라, 권한 없는 관리자가 `/backoffice/permission` 에서 TEAM_ONLY 를 고르면 여전히 **4회 거부**(FE-P1-1). 같은 도메인의 두 훅이 서로 다른 재시도 정책을 갖게 됐다 |
| **RT-O4** | Low | `addPresetPermissionSeed` 의 이름 스캔이 `findAll()`(**100건 하드캡**)이다. 권한 세트가 100개를 넘는 조직에서는 이름 유일성 판정이 불완전해져 중복 이름 세트를 만들 수 있고, 그 세트는 편집 시 `NAME_DUPLICATED` 로 막힌다. `migratePermissionSets` 도 같은 한계(기존). 팀 도메인은 `findAllPaged` 를 쓰므로 선례는 있다 |
| **RT-O5** | 정보 | 주석 노후화 2건 — `PortfolioAggregator.js:65-67`("빈입력={values:[]} 객체")·`WorkAssignmentIssueFetcher.js:175`. **코드(`Array.isArray` 우회)는 RT-F1 때문에 여전히 필요하므로 두고 주석만 갱신** |

---

## 9-7. P0/P1 회귀 — 전부 유지 ✅

| 항목 | 실측 |
|---|---|
| **C1 read-merge (SQL 레벨)** | `UPDATE_USER_WITH_SALARY` 6 SET 컬럼 ↔ `pick()` 5필드(`:448-454`) ↔ bind 7인자. `invoke("updateUser")` **1곳** |
| **팀 필터 3상태** | `TEAM_FILTER_NONE='__NONE__'` 양측 동일 |
| **`toRecord` 빈 문자열 0** | 선택 속성 4개 전부 `if (team.x) record.x = …` |
| **`whereIn([])` 가드** | `TeamRepository` 4곳 + `ProjectUsersRepository` 1곳 |
| **D4 `leadingScope` 분리** | `permissionGuard.js:92,104` — write 판정은 `leadingScope*` 만 참조 |
| **팀장 stale cascade** | `UserService.js:398` 0단계 `clearTeamLeadershipOfUser` + 기존 4단계 순서 불변 |
| **`PrincipalResolver`** | P1 판정 매트릭스 **52/52 재통과**(실제 소스 로드 실행) — 권한 판정 무회귀 |
| **P1-N2 프론트** | 순수 함수 harness **15/15**(P1 시점 14/15 → O4 해소로 15/15) |
| **U7~U11** | `ProjectUsersQuery` 추가만(`FIND_PROJECT_IDS_BY_ACCOUNTS`), `FIND_BY_PROJECT_ID`/`UPDATE_BY_KEY_WITH_PARAMS` 미변경 |
| **DnD** | 금지 주석 1건 외 **0건** |
| **P2/P3 코드** | `TeamLeadFieldPolicy` 의 P2 예약 1줄 외 **0건** |
| **i18n** | team 69/69 · common 106/106 · user 89/89 · permission 61/61 · myPage 120/120 **전부 대칭**. 프론트 **1,528 참조 키** 중 팀/권한 관련 누락 **0건**. `common.button.retry`(ko/en) + `team.permission.effect.{own,none,inherited,unknown}`(ko/en) 전부 존재. merge 재실행 전후 **해시 동일** |

> 팀과 무관한 기존 누락 2건(`level.modal.edit.label.title`, `upload.error`)은 P0 리포트에 기록한 별건.

---

## 9-8. 실행 검증 (원문 — `cmd /c "… & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\rt_be.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 35 passed, 35 total
Tests:       591 passed, 591 total        <- 주장 591 일치 (569 -> 591, +22)
```
```
> cmd /c "npx jest --ci > %TEMP%\rt_fe.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 25 passed, 25 total
Tests:       364 passed, 364 total        <- 주장 364 일치 (326 -> 364, +38)
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\rt_bd.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                   (node_modules 소스맵 3건 — 기존)
The build folder is ready to be deployed.
```
```
> cmd /c "npm run merge > %TEMP%\rt_m.txt 2>&1 & echo MERGE_EXIT=%errorlevel%"
MERGE_EXIT=0
ko-KR.json / en-US.json 재실행 전후 해시 동일 = True
```

⚠ **테스트 통과를 빌드 성공의 근거로 쓰지 않았다** — 프론트 빌드를 별도로 실행해 `EXIT=0` 과 `The build folder is ready` 를 직접 확인했다(코디네이터가 겪은 "테스트 364건 통과 + 빌드만 실패" 사례 대응).
그리고 **빌드·테스트는 RT-F1 을 잡지 못한다** — 실패 청크 시나리오는 실행 시뮬레이션으로만 드러났다.

---

## 9-9. 미검증 (배포/E2E 필요)

| # | 항목 | 확인 방법 |
|---|---|---|
| RT-U1 | **`permission_preset_provisioned` 실기동** — `kvs.set` 이 실제로 성공하는가. 선례(`seed_version`)로 강하게 뒷받침되나 실측은 아니다 | `SEED_VERSION 9` 반영 후 KVS 확인 |
| RT-U2 | 시드 실행 후 실제 KVS 상태(프리셋 4종 + 원장) 및 권한 관리 화면 노출 | 배포 후 |
| RT-U3 | 팀 상세 에러 화면 실기동 — 권한 거부 계정에서 문구·재시도 버튼 | 스테이징 |
| RT-U4 | **RT-F1 발현** — Jira bulk 429/5xx 재현 시 4개 도메인 예외 | 부하/장애 주입 |
| RT-U5 | 실기동 원인이었던 **팀원 0명 + 팀장 미지정 새 팀** 상세 조회 정상화 | 배포 후 재현 |
| RT-U6 | E1/E2 노출(§P1-C2) — PM 의 전사 인건비, Team Lead 의 전사 인원 명단을 조직이 실제로 조정하는지 | 운영 |

> P0 §2 U-1~U-6, P1 §8-12 P1-U1~U9 는 **여전히 유효**하다.
> §P1-C2 E3(`PUBLIC_HOLIDAY_MANAGEMENT` 4종 전부 닫힘 = 기능 손실 없음)는 코드로 확인했다 — `getPublicHolidayList: 'PUBLIC'`(`PermissionMap.js:196`)이라 공휴일 데이터는 권한과 무관하게 조회된다. 이 키가 여는 것은 백오피스 메뉴 노출뿐이다. **주장 사실.**

---

## 9-10. 담당별 조치 요청

### backend-engineer — 권장 1건
1. **RT-F1** — `getBulkJiraUsersApi` 청크 루프에서 실패 결과를 `{ values: [] }` 로 정규화하고, `BulkUsersApiShape.test.js` 에 "청크 1개 실패" 케이스를 추가한다(§9-2). 지금은 선언된 계약이 참이 아니고, 4개 도메인에서 예외가 난다.
2. (선택) **RT-O4** — `addPresetPermissionSeed` 의 이름 스캔을 `findAllPaged` 로.

### frontend-engineer — 권장 3건
1. **RT-O1** — `TeamDetailPanel` 의 `isError || !team` 을 `MyTeamSection` 과 같은 3분기로. 특히 `isError && team` 에서 콘텐츠를 버리지 않도록.
2. **RT-O2** — `team.error.PERMISSION_DENIED` 추가 + `TRANSLATED_CODES` 등재.
3. **RT-O3** — `useTeamTree` 에도 `err.code` 보존 + retry 정책(또는 `retry` 옵션화 — FE-P1-1 과 함께 처리).
4. (정보) **RT-O5** — 주석 2곳 갱신(코드는 유지).

### 리더 판단
- **RT-F1 을 이번 배포에 포함할지** — 팀 기능과 무관한 3개 도메인(포트폴리오·이슈 협업자·프로젝트 인력 스크롤)에 영향이 있어 별건 핫픽스로 빼도 무방하다.
- §P1-C2 **E1/E2** 노출 수용 여부(백엔드가 이름 붙여 남긴 항목).
- 배포 후 **원장 키 삭제만이 프리셋 재제공 경로**라는 점(§P1-C6 #2)의 운영 안내.

---
---

# 10. P2-a 검증 (2026-07-28) — 프로젝트-팀 배정 + 팀 축 응답 확장

> 입력: `02_backend_report.md` **§P2-a**(0~6), `02_frontend_report.md` **§P2-a**, `01_architect_design.md` §3/§9/§16, `05_fable_review_p2.md`
> 방법: 리포트 주장을 근거로 쓰지 않고 소스로 확인했다. 1순위(배포순서 방어)는 **`TableReadiness`·`ProjectTeamRepository`·`PrincipalResolver` 를 실물로 로드하고 `executeQuery` 만 스텁해 "테이블 부재"를 시뮬레이션**했다.

## 10-0. 판정 요약

**실패 1 / 관찰 6 / 미검증 6.** 검증 대상 4건은 **전부 의도대로 동작**한다.
실패 1건은 **아직 소비자가 없는 유틸의 계약 불일치**(P2-b/c 착수 시 즉시 발현하는 지뢰)다.

| 순위 | 대상 | 판정 | 근거 |
|---|---|---|---|
| **1** | 배포순서 방어 (`TableReadiness`) | **통과** | 실행 **31/31 PASS** — 참조 경로 전수 6개, U8 준수, 1146 오탐 방지, 프로브 캐시 |
| **2** | `removedProjectAssignCount` `number\|null` | **통과** | 소비자 1곳, `null`/`0`/`>0` **3분기** |
| **3** | `?? 0` 삼킴 | **통과** | 실행 **26/26 PASS** — 지표 경로 `?? 0` **0건** |
| **4** | "모른다"≠"없다" | **통과** | `hasWeightedMetrics` 구버전→false 실증, `assignmentReady` 3분기 |
| **5** | 프론트 판단 2건 | **둘 다 타당** | `getTeamList` grant 실측으로 확인, 쿼리키 분리 확인 |
| **6** | 백엔드 E1~E6 | **전부 타당** | 캐시 키·병합 경로·teamLead 축 실측 |
| — | 회귀 | **전부 유지** | 대시보드 프론트 **무변경**(P2-c 단독 롤백 가능) |
| — | 실행 | BE **640** / FE **426** / build **EXIT=0** | 주장 수치 전부 일치 |

---

## 10-1. 🔴 1순위 — 배포 순서 의존 방어 (실행 **31/31 PASS**)

### `project_team` 참조 경로 — 전수 확인

전역 grep 결과 **6개**다(리포트 §P2-a-0 표와 일치). raw Repository 함수를 파일 밖에서 호출하는 곳은 **`setProjectTeams` 하나뿐**이다.

| # | 경로 | 사용 함수 | 미준비 시 |
|---|---|---|---|
| 1 | `deleteTeam` cascade (`TeamService.js:452`) | `deleteProjectTeamsByTeamSafe` | `null`(미수행) — 팀 삭제는 계속 |
| 2 | **`PrincipalResolver` TEAM_ONLY** (`:331`) | `findProjectIdsByTeamKeysSafe` | `[]` — P1 동작으로 degrade |
| 3 | `deleteProject` cascade (`ProjectService.js:102`) | `deleteProjectTeamsByProjectSafe` | `null` — 8단계 계속 |
| 4 | `getProjectTeams` (`ProjectTeamService.js:74`) | `findTeamsByProjectSafe` | `null` → `assignmentReady:false` |
| 5 | `getTeamMemberCandidates` (`:178`) | `findTeamsByProjectSafe` | 거부(fail-close) |
| 6 | `setProjectTeams` (`:139,142`) | **raw**(의도) | 에러 전파 — 저장이 조용히 안 되는 것이 더 나쁘다 |

→ **방어 밖 경로 0건.** `ProjectTeamQuery.COUNT_ALL` 은 정의만 있고 소비자가 없다(→ P2a-O1).

### 테이블 부재를 실제로 시뮬레이션한 결과

```
--- 1) 프로브 ---
1a 테이블 없음 → false          1b 있음 → true
1c ★ true 는 캐시된다(재프로브 0)           probe=1 유지
1d ★ false 는 캐시하지 않는다               probe=2
1e ★ 마이그레이션 후 자동 복구(캐시 초기화 없이 true)
1f 프로브 자체 실패 → false(안전측)

--- 2) Safe 래퍼 (테이블 부재) ---
2a findTeamsByProjectSafe        → null   (모름)     예외 없음
2b ★ findProjectIdsByTeamKeysSafe → []    (P1 동작)  예외 없음
2c deleteProjectTeamsByTeamSafe  → null   (미수행 ≠ 0건)
2d deleteProjectTeamsByProjectSafe → null
2e ★ 프로브가 막아 project_team SQL 이 **아예 발행되지 않는다**   발행=0
2f 테이블 있음 → 실제 값 1 (0/null 아님)
```

### ★ `PrincipalResolver` — 권한 판정이 죽지 않는가

```
5a ★★ 테이블 부재에도 예외 없음
5b ★ P1 동작으로 degrade — projectusers 축만          scoped=["proj-A"]
5c ★ 전사 노출 아님(스코프가 넓어지지 않는다)
5d 테이블 있음 → 합집합 완성                          scoped=["proj-A","proj-B"]
5e 합집합 중복 제거                                   scoped=["proj-A"]
5f ★ 팀 미소속 TEAM_ONLY → 0건 fail-close ∧ SQL 미발행  scoped=[] sql=0
```
→ **여기서 던지면 권한 판정 전체가 죽는다**는 위험이 실제로 차단됐다. degrade 방향이 **좁아지는 쪽**이라 권한 구멍이 없다.

### ★ U8 준수 — 다른 에러를 삼키는가

```
3a 레이스(프로브 통과 후 DROP) — 테이블 부재 시그니처는 흡수 → null
3b ★ Deadlock(code 1213)        → **재throw**  (삼키지 않음)
3c ★ 권한 에러(ER_ACCESS_DENIED) → **재throw**  (권한 판정 경로에서도 삼키지 않음)
```

### ★ `1146` 을 메시지에서 찾지 않는가 (오탐 방지)

```
4a code 1146(number) / 4b '1146'(string) / 4c ER_NO_SUCH_TABLE·42S02 / 4d cause.code → 전부 검출
4e 드라이버 원문 "doesn't exist" → 검출
4f ★ 감싼 message "…params: team-1146abcd-…" → **오탐 안 함**   ← UUID 우연 포함 시나리오
4g ★ 감싼 message 의 "doesn't exist" → **오탐 안 함**(cause 만 본다)
4h 무관한 에러(1213) / Error / null → false
```
→ 백엔드 주장("숫자 코드를 메시지에서 찾지 않는다")이 **실행으로 확인**됐다. `isMissingTableError` 는 `error.cause?.code ?? error.code` 와 **`cause.message` 만** 본다(감싼 `message` 미사용).

### 빈 집합 가드 (L3)
```
6a 빈 teamKeys → [] ∧ SQL 미발행 ∧ 프로브도 미발행   (IN () 문법오류 방지)
6b 빈 teams   → INSERT 미발행
```

---

## 10-2. 2순위 — `deleteTeam.removedProjectAssignCount` (`number | null`) ✅

**전역 grep: 소비자는 1곳뿐**이다 — `useTeamEditModal.js:204-207`.

```js
if (content.removedProjectAssignCount === null) {
    lines.push(t('team.delete.assignSkipped'));          // 미수행 안내
} else if ((content.removedProjectAssignCount ?? 0) > 0) {
    lines.push(tFormat(t, 'team.delete.assignRemoved', { count: ... }));
}
```
- **`null`(미수행) / `0`(대상 없음) / `>0`(실제 정리)** 3분기 ✓
- **"0건 정리됨"이라고 말하는 경로가 없다** ✓ (`0` 은 아무 문장도 덧붙이지 않는다)
- 다른 소비자 0건 — 백엔드 테스트 2곳 외에는 이 훅뿐

생산 측도 `deleteProjectTeamsByTeamSafe` 가 `null`(테이블 없음) / `rowsAffected`(실제) 를 구분해 반환하고, `TeamService.js:452` 가 그대로 응답에 싣는다 ✓

---

## 10-3. 3순위 — `?? 0` 삼킴 (실행 **26/26 PASS**)

`aggregateByTeam` 을 실물 로드해 코디네이터 체크리스트를 전부 실행했다.

| 요구 | 실측 |
|---|---|
| **기여 행 0 → `null`(집계 전)이지 `0` 이 아닌가** | ✅ sumField·avgField 둘 다 `null` |
| **분모 합 0 → `null`**(Infinity 방지) | ✅ `investedMd:0, availMd:0` → `utilization: null` |
| **실제 값 0 과 "모름" 구분** | ✅ 실제 `0` 은 `0` 으로 나오고 `missing` 에 세지 않는다 |
| 부분 결측 | ✅ 있는 값만 합산 + `missing[field]` 로 인원 수 노출 |
| 분자만 있고 분모 없음 | ✅ 비율에 기여하지 않는다(왜곡 방지) |
| **`avgFields` 가 3필드만 — 산술평균 옵션 없음** | ✅ `{field}` 만 주면 **`null`**(조용히 산술평균으로 대체되지 않는다) |
| 가중이 산술평균보다 정확 | ✅ `[100/100, 0/0]` → 가중 **1.0**(산술평균이면 0.5) |
| 팀 미소속 | ✅ 숨기지 않음(합=전체), `null`/`''` 동일 그룹, 항상 마지막 |
| UUID 라벨 금지 | ✅ 이름 없는 팀에 `teamKey` 를 쓰지 않는다 |
| 이상 입력 | ✅ 문자열 `'10'`·`NaN`·`Infinity` 전부 "모름" 취급 |

### "남은 `?? 0` 5곳은 서버가 항상 number 로 보장하는 카운트뿐" — **사실**

| 위치 | 필드 | 서버 보장 |
|---|---|---|
| `ProjectTeamBar.jsx:123,146` | `memberCount` / `assignedMemberCount` | `ProjectTeamService` 가 `counts.get(k) ?? 0`, `assignedByTeam.get(k) ?? 0` 로 **항상 number** |
| `ProjectTeamEditModal.jsx:65` | `savedCount` | `targets.length` |
| `TeamMemberPickModal.jsx:83-84` | `addedCount` / `skippedCount` | 산술 결과 |
| `TeamMemberPickModal.jsx:169` | `assignedCount` | **`total != null` 가드 안**에서만 도달(:165). 훅은 `typeof === 'number' ? … : null` 로 "조회 전"을 `null` 로 구분 |
| (기존) `ProjectUserPanel.jsx:77` | `total_count` | P2-a 이전부터 존재 |

→ **지표(`investedMd`/`availMd`/`utilization`) 경로에 `?? 0` 은 0건.** 전역 grep 확인.

---

## 10-4. 4순위 — "모른다"를 "없다"로 말하지 않는가 ✅

| 항목 | 실측 |
|---|---|
| **`hasWeightedMetrics` 구버전 응답 → `false`** | ✅ `PortfolioDashboardService.js:194-205` 가 `investedMd ?? null` / `availMd ?? null` 로 **정규화한 뒤** `every(p => p.availMd !== null)` 를 본다. 실행 확인: 옛 스냅샷 → **false**, 새 스냅샷 → true, 혼재 → **false**, 빈 명단 → false |
| 프론트 판정 | ✅ `hasWeightedMetrics(u) = u?.hasWeightedMetrics === true` — 필드 부재·`1`·`'yes'` 전부 **false**(fail-close) |
| **가동률 옛 스냅샷 → `null`(0 아님)** | ✅ `investedMd:null, availMd:null` 로 나간다. **0% 로 그리는 경로 없음**(프론트 소비자가 아직 0이고, `aggregateByTeam` 은 `null` 을 낸다) |
| **`assignmentReady` 3분기** | ✅ `ProjectTeamBar.jsx:68-85` — `!assignmentReady` → `team.project.notReady` / `teams.length===0` → `team.project.empty` / else 칩 목록. 편집 버튼도 `canEdit && assignmentReady` 로 잠근다 |
| 훅 계약 | ✅ `useProjectTeams.js:41` `assignmentReady: content.assignmentReady === true` (구버전 응답 → false, fail-close) |
| `emptyShape` 동기화 | ✅ `teamMeta:{}`, `memberTeamMap:{}`, `utilization.hasWeightedMetrics:false` 전부 포함 — 빈 응답에서만 키가 없는 shape 분기가 없다 |
| 후보 수 "조회 전" | ✅ `useTeamMemberCandidates.js:51-52` `typeof === 'number' ? … : null` |

---

## 10-5. 5순위 — 프론트가 다르게 한 2건

### ① `getTeamList` 대신 `getTeamOptions` — **타당** ✅

`PermissionMap` 실측:
```
getTeamList    : OR[TEAM_MANAGEMENT read, USER_MANAGEMENT read]                      (:68)
getTeamOptions : OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r, RESOURCE_MANAGEMENT r,
                    REPORT r, PROJECT r]                                             (:77-78)
```
진입 grant 실측:
```
getResourceOverview          : R('RESOURCE_MANAGEMENT')     (:266)
getResourceAnalysisList      : R('REPORT','detail')          (:219)
findProjectusersByProjectId  : R('PROJECT','detail')         (:132)
```
→ `/resource`·프로젝트 상세에 도달할 수 있는 grant 셋 중 **어느 것도 `getTeamList` 를 통과시키지 못한다.**
시드 프리셋 4종(PM·PMO·Team Lead·Team Member)은 **SETTINGS 계열이 전부 닫혀 있어**(§9-4 검증) `TEAM_MANAGEMENT`/`USER_MANAGEMENT` read 가 없다 → 프리셋 사용자는 전원 거부된다.
**"항상 거부" 는 엄밀히는 "SETTINGS read 를 겸하지 않는 한"** 이지만, 그게 정확히 프리셋 4종의 상태다. → **좋은 판단.**
`getTeamOptions` 는 `{value,label,depth,parentTeamKey}` 를 주므로 계층 판정에 부족함이 없고, `teamFilter.js:normalizeTeams` 가 `teamKey`/`value` 두 shape 을 모두 흡수한다 ✓

### ② 분석 리포트 팀 필터 `pagesize:500` 전량 조회 — **타당** ✅

| 검증 | 결과 |
|---|---|
| 10건 페이징 상태에서 현재 페이지만 필터하면 조용한 오답인가 | ✅ 그렇다. 전량 조회 전환이 옳다 |
| **인력 탭 캐시와 분리** | ✅ 인력 탭 `['projectUsers', id, page]`(3요소) ↔ 분석 `['projectUsers', id, effectivePage, pagesize]`(**4요소**) → 충돌 없음. `invalidateQueries(['projectUsers', id])` 는 **prefix 매칭이라 양쪽 모두 무효화** ✓ |
| **500 초과 시 필터 비활성화가 동작하는가** | ✅ `isTeamFilterUnavailable = totalMemberCount > 500` → Select `isDisabled` (:378) + `SectionMessage`(`team.analysis.tooManyMembers`, :396) + `resolveTeamFilter(..., null, ...)` 로 필터 무력화. **잘린 결과를 필터한 것처럼 보여주지 않는다** ✓ |
| 팀 옵션 라벨 | ✅ `u.teamKey && u.teamName` 둘 다 있을 때만 옵션 생성(UUID 라벨 금지) |

---

## 10-6. 6순위 — 백엔드가 설계서와 다르게 한 6건 ✅ 전부 타당

| # | 판정 | 실측 근거 |
|---|---|---|
| **E1** `getResourceAnalysisList` 에 팀 미추가 | **타당** | 캐시 키 `ResourceList:${projectId}:${startDate}:${endDate}`(`ResourceAnalysisService.js:73`) — **팀 차원 없음**, TTL 10분(`:140`). 병합 경로 실측: `ResourceAnalysisPage.jsx:259-261` 이 **행 축(`findProjectusersByProjectId`)에서 `teamKey`/`teamName` 을 가져오고** 지표만 `analysisMap`(accountId Map)에서 병합한다. 캐시에 구우면 팀 이동이 10분 얼어붙는 것이 사실이고, 행 축에 이미 팀이 있으므로 **불필요하다** |
| **E2** 500 상한을 `targets` 에 | **타당** | `ProjectTeamService.js` 가 두 모드 모두 `targets` 확정 후 `if (targets.length > TEAM_ASSIGN_MAX)` 로 검사. 타임아웃은 INSERT 행 수에서 오므로 전체 모드도 동일 위험. 개별 선택으로 나눌 recourse 있음 |
| **E3** `addTeamMembersToProject` teamLead 축 미부착 | **타당** | `PermissionMap` 실측: teamLead 축 보유 키는 **3개뿐**(`findTeamById`·`getUserSkills`·`setUserSkills`). `addTeamMembersToProject` 는 `OR[PROJECT w, RESOURCE_MANAGEMENT w] + 'inherited'`. `leadingProjectIds` 없이 열면 P1-O1 결함 재생산이 맞다 |
| **E4** `assignmentReady` 추가 | **타당** | §10-4 참조 |
| **E5** `hasWeightedMetrics` 추가 | **타당** | 소비처마다 재도출하면 갈린다. 서버 1회 판정 + 프론트가 `=== true` 로 그대로 사용 |
| **E6** `getResourceAllocationGraph.teamKey` 미구현 | **타당** | 설계서가 `(선택)` 표기. 소비처 0 |

> **부수 확인 — P1-O1 이 해소됐다.** P1 검증에서 지적한 "팀장의 `removeProjectMemberByAccount` 가 프로젝트 축으로 제한되지 않는다"는, 그 resolver 의 teamLead 축이 **제거**되면서 닫혔다(teamLead 키 4 → 3). 재개방 조건도 `P2a-U5` 에 기록돼 있다.

---

## 10-7. ❌ **P2a-F1 (Medium, 잠재)** — `aggregateByTeam` 의 `teamMeta` 계약이 두 생산자 어느 쪽과도 맞지 않는다

**JSDoc 선언** (`static/ui/src/utils/team/aggregateByTeam.js:41`)
```
@param {object} [options.teamMeta]  `{ [teamKey]: { name } }` — 행에 이름이 없을 때의 출처
```
**소비 코드** (`:88`)
```js
group.teamName = fromRow || teamMeta?.[teamKey]?.name || null;
```

**실제 생산자는 두 가지이고, 둘 다 이 shape 이 아니다** (둘 다 설계서 §3 그대로다 — 생산 측 잘못이 아니다):

| 생산자 | 실제 shape | 근거 |
|---|---|---|
| `getPortfolioDashboard.teamMeta` | **`{ "<teamKey>": "<name>" }`** (값이 **문자열**) | `PortfolioDashboardService.js:111` `[t.teamKey, t.name]` / 설계서 :774 |
| `getResourceOverview.content.teamMeta` | **`[{ id, name, parentTeamKey, depth }]`** (**배열**) | `ResourceManagementService.js:148-152` / 설계서 :772 |

**실행 결과 — 두 shape 모두 팀명이 "팀 미지정" 으로 오표기된다**
```
① 포트폴리오 { key:"이름" } → [{"teamKey":"t1","teamName":"팀 미지정"},{"teamKey":"t2","teamName":"팀 미지정"}]
② 리소스   [{id,name}]     → [{"teamKey":"t1","teamName":"팀 미지정"},{"teamKey":"t2","teamName":"팀 미지정"}]
③ JSDoc 의 { key:{name} }  → [{"teamKey":"t1","teamName":"개발팀"},{"teamKey":"t2","teamName":"영업팀"}]   ← 이것만 동작
```
원인: `out.teamName = group.teamKey == null ? unassignedLabel : (group.teamName ?? unassignedLabel)`(`:129-131`) —
**이름을 못 찾으면 `teamKey` 가 있는데도 "팀 미지정" 라벨을 붙인다.** `teamKey` 는 non-null 이므로 화면은 실재하는 팀을 "미지정"으로 그린다.

**왜 지금은 안 터지는가**: `aggregateByTeam` 의 **프로덕션 소비자가 0**이다(전역 grep — 테스트뿐). N6·N7 은 P2-b/c 다.
**왜 그래도 실패로 분류하는가**:
1. 이 파일의 존재 이유가 **"조용한 오표기 방지"**(`?? 0` 삼킴, `ScopeSplitCell` 사건)인데, 그 실패 모드를 자기 API 에 갖고 있다.
2. P2-b/c 구현자는 JSDoc 대로 응답을 그대로 넘길 것이고, **에러 없이 전 팀이 "팀 미지정"** 이 된다.
3. `getPortfolioDashboard.utilization.people[]` 에는 `teamKey`/`teamName` 이 **아예 없다**(`PortfolioDashboardService.js:194-201`). 팀 연결은 별도 루트 필드 `memberTeamMap`(accountId→teamKey)로만 가능하다 → P2-c 는 행을 미리 매핑해야 하므로 `teamMeta` 의존도가 오히려 높다.

**수정(택1)**
- (a) `teamMeta` 접근을 두 shape 모두 흡수하도록 정규화한다(권장 — 생산자를 건드리지 않는다):
  ```js
  const nameOf = (meta, key) => {
      if (!meta || !key) return null;
      if (Array.isArray(meta)) return meta.find(t => t?.id === key)?.name ?? null;
      const v = meta[key];
      return typeof v === 'string' ? v : (v?.name ?? null);
  };
  ```
- (b) 또는 JSDoc 을 실제 생산자 shape 로 고치고 호출부가 변환해 넘기도록 명시한다.
- 어느 쪽이든 **`teamKey` 가 있는데 이름을 못 찾은 경우를 `unassignedLabel` 과 구분**할 것(예: `null` 을 두고 화면이 폴백 문구를 고르게).
- 회귀 가드: 두 생산자 shape 을 그대로 넣는 테스트 2건 추가.

**부수(같은 원인)** — `ResourceOverviewTab.jsx:77` 의 `teamMeta?.[p.teamKey]?.name` 은 **배열에 키 접근**이라 항상 `undefined` 다(실행 확인). 주석은 "행 > 응답 teamMeta 순" 2단 폴백을 주장하지만 **2단째가 죽은 코드**다. 오늘은 `p.teamName` 이 같은 인덱스에서 항상 채워져 무해하고, 이름을 못 찾으면 옵션을 만들지 않으므로(UUID 라벨 금지) 사용자 피해는 없다.

---

## 10-8. 관찰

| # | 심각도 | 내용 |
|---|---|---|
| **P2a-O1** | 정보 | `ProjectTeamQuery.COUNT_ALL` 은 정의만 있고 소비자 **0건**(주석에 "선택 — 저장공간 모니터링"). `/backoffice/storage` 가 쓰지 않는다. 죽은 쿼리 |
| **P2a-O2** | Low | 분석 리포트에서 **인원이 500을 넘어선 뒤에는 팀 필터를 해제할 수 없다.** `isTeamFilterUnavailable` 이 Select 를 `isDisabled` 로 잠그는데, 이미 `teamKey` 가 설정돼 있으면 `isTeamFilterActive` 가 계속 true → `pages=[]` 로 페이지네이션이 숨겨진 채 첫 500행에 갇힌다. 도달하려면 필터를 켠 상태에서 인원이 500을 넘어야 해 확률은 매우 낮다. 권고: `isTeamFilterUnavailable` 일 때 `teamKey` 를 `null` 로 리셋 |
| **P2a-O3** | Low | `getTeamMemberCandidates` 의 fail-close 가 `(await findTeamsByProjectSafe(projectId)) ?? []` 에 **의존**한다(`ProjectTeamService.js:178`). `null`(모름) → `[]` → `allowed` 공집합 → 거부라서 **결과는 옳지만**, "모름"을 "배정 없음"으로 접은 뒤 우연히 fail-close 가 되는 구조다. 이 파일의 다른 곳(`:76-78`)은 `assignmentReady` 로 명시 분기한다. 명시 분기 권고 |
| **P2a-O4** | Low | 분석 리포트 쿼리키가 4요소(`…, effectivePage, pagesize`)가 되면서 **팀 필터가 꺼진 상태(pagesize=10)에서도** 인력 탭(3요소) 캐시를 재사용하지 못한다 → 같은 데이터를 한 번 더 페치. 충돌 방지 방향이라 안전하지만 중복 조회 1회가 상시 발생 |
| **P2a-O5** | 정보 | `useTeamMemberCandidates.js:96` 이 `['teamMemberCandidates', projectId]` 인라인 배열로 prefix invalidate 한다(팩토리는 4요소 키만 제공). 동작은 정상이나 `projectKeys` 에 prefix 헬퍼가 없어 인라인이 남았다 |
| **P2a-O6** | 해소 | **P1-O1 이 닫혔다** — `removeProjectMemberByAccount` 의 teamLead 축이 제거되어(teamLead 키 4→3) "팀장이 자기 팀원을 아무 프로젝트에서나 배정 취소" 경로가 사라졌다. 재개방 조건은 `P2a-U5` 에 기록됨 |

---

## 10-9. 회귀 — 전부 유지 ✅

| 항목 | 실측 |
|---|---|
| **C1 read-merge (SQL 레벨)** | `UPDATE_USER_WITH_SALARY` SET 6컬럼 + WHERE 1 = 7 플레이스홀더 ↔ `pick()` **5필드** ↔ `invoke("updateUser")` **1곳** |
| **팀 필터 3상태** | `TEAM_FILTER_NONE='__NONE__'` 양측 동일. `{value:null}` 생성 경로 0 |
| **`toRecord` 빈 문자열 0** | 선택 4필드 전부 `if (team.x)` 조건부 |
| **`whereIn([])` 가드** | `TeamRepository` 5 · `ProjectUsersRepository` 1 · **`ProjectTeamRepository` 3**(신규) |
| **`leadingScopeAccountIds` 분리(D4)** | `permissionGuard.js` 4참조 — write 판정은 `leadingScope*` 만 |
| **cascade** | 팀 삭제 5단계(자식 재부모화 → 소속 해제 → **project_team(Safe)** → 마스터 → invalidate) / 프로젝트 삭제 9단계(8=project_team Safe) / 사용자 삭제 0~4단계 |
| **`toParentOption` value 보존** | `buildTeamTree.js` `if (!value) return null` 유지 |
| **`limits` 리터럴 0** | 프론트에 `maxTeams`/`maxDepth` 상수 **0건** |
| **DnD** | 금지 주석 1건 외 **0건** |
| **P2-b/P2-c 코드 0** | `static/ui/src/pages/portfolio/` **git status 무출력 = 무변경** ✓ → **P2-c 단독 롤백 가능**. `aggregateByTeam` 프로덕션 소비자 **0건**. `teamMeta`/`memberTeamMap` 프론트 소비 0건 |
| **U7~U12** | `FIND_BY_PROJECT_ID` 에 LEFT JOIN 을 넣었으나 **`salary` 미포함**(U10 유지) ✓, LEFT JOIN 이라 고아 `projectusers` 행도 유지 ✓ |
| **i18n** | team 105/105 · common 106/106 · user 89/89 · permission 61/61 · myPage 121/121 · resource 139/139 **전부 대칭**. **점(.) 포함 키 0건** ✓. 참조 키 **1,561종** 중 팀 관련 누락 0. merge 재실행 전후 **해시 동일** |

> 팀과 무관한 기존 누락 2건(`level.modal.edit.label.title`, `upload.error`)은 이전 절에 기록한 별건.

---

## 10-10. 실행 검증 (원문 — `cmd /c "… & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\p2_be.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 37 passed, 37 total
Tests:       640 passed, 640 total        <- 주장 640 일치 (593 -> 640, +47)
```
```
> cmd /c "npx jest --ci > %TEMP%\p2_fe.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 27 passed, 27 total
Tests:       426 passed, 426 total        <- 주장 426 일치 (364 -> 426, +62)
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\p2_bd.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.        (node_modules 소스맵 3건 — 기존)
The build folder is ready to be deployed.
```
```
> cmd /c "npm run merge > %TEMP%\p2_m.txt 2>&1 & echo MERGE_EXIT=%errorlevel%"
MERGE_EXIT=0
ko-KR.json / en-US.json 재실행 전후 해시 동일 = True
```

⚠ **테스트 통과를 빌드 성공의 근거로 쓰지 않았다** — 프론트 빌드를 별도 실행해 `EXIT=0` 과 `The build folder is ready` 를 직접 확인했다.
그리고 **빌드·테스트는 P2a-F1 을 잡지 못한다** — `aggregateByTeam` 의 자체 테스트 39건은 **JSDoc 이 명시한 shape 으로만** 호출하므로 생산자와의 불일치가 드러나지 않는다. 교차 대조로만 나왔다.

---

## 10-11. 미검증 (배포/E2E 필요)

| # | 항목 | 확인 방법 |
|---|---|---|
| **P2a-U1** | **`information_schema` 프로브의 Forge SQL 실동작** — 로컬은 전부 mock 이다. `StorageService` 선례가 있어 가능성은 높으나 **실측한 적이 없다.** 프로브가 실패하면 `false` → 팀 배정 기능 전체가 조용히 비활성 | 배포 후 `forge logs` 에서 `[TableReadiness]` 부재 확인 |
| **P2a-U2** | **Forge SQL 이 내려주는 실제 테이블 부재 `error.code`** — 코드 4종 + 원문 3패턴으로 넓게 잡았으나 실측 불가. 프로브가 1차 방어라 여기 걸릴 일은 레이스뿐 | 배포 후 |
| **P2a-U3** | `v014` 실행 + `project_team` 실동작(배정 저장/조회/cascade) | 스테이징 |
| **P2a-U4** | `utilizationPeople` **KVS 240KiB 한도** — 2필드로 레코드당 ≈+30%. `console.info` 로 크기만 남긴다(캡 없음) | 2000명 규모 배치 |
| **P2a-U5** | **TEAM_ONLY 스코프가 넓어지는 영향** — 담당 배정만 있고 개별 투입이 없는 프로젝트가 새로 보이기 시작한다. 의도된 변경이나 실사용자 체감 미확인 | 배포 후 |
| **P2a-U6** | P0 §2 U-1~U-6 · P1 §8-12 · §9-9 RT-U1~U6 — **여전히 유효** | — |

---

## 10-12. 담당별 조치 요청

### frontend-engineer — 권장 1건 (P2-b/c 착수 **전**)
1. **P2a-F1** — `aggregateByTeam` 의 `teamMeta` 를 두 실제 생산자 shape(포트폴리오 `{key:"이름"}`, 리소스 `[{id,name}]`)을 흡수하도록 정규화하고, **`teamKey` 가 있는데 이름 미해결인 경우를 `unassignedLabel` 과 구분**할 것. 두 생산자 shape 을 그대로 넣는 회귀 테스트 2건 추가(§10-7).
2. (선택) **P2a-O2** — 500 초과 시 `teamKey` 리셋. **P2a-O4** — 팀 필터 비활성 시 인력 탭과 같은 3요소 키를 쓰도록.

### backend-engineer — 권장 0건 (필수 0)
1. (선택) **P2a-O1** — `ProjectTeamQuery.COUNT_ALL` 을 `/backoffice/storage` 에 연결하거나 제거.
2. (선택) **P2a-O3** — `getTeamMemberCandidates` 의 `?? []` 를 `assignmentReady` 처럼 명시 분기로.

### 리더 판단
- **배포 절차**(§P2-a-0 표 1~4단계)를 이번엔 반드시 지킬 것. 방어가 들어갔지만 **`assignmentReady:false` 동안 팀 배정 기능은 실제로 잠긴다**(읽기·쓰기 모두).
- **P2a-U1** 이 이번 방어의 유일한 미검증 전제다 — 프로브가 Forge SQL 에서 동작하지 않으면 `false` 로 떨어져 **마이그레이션을 실행해도 기능이 안 켜진다**(캐시는 `true` 만 하므로 영구 degrade 는 아니고 매번 재프로브한다). 배포 직후 `forge logs` 로 `[TableReadiness]` 메시지 유무를 먼저 확인할 것.
- TEAM_ONLY 스코프 확대(§P2a-U5)를 사용자에게 사전 공지할지.

---
---

# 11. P2-b 검증 (2026-07-28) — N7(내 팀 업무 분석) + N5(캘린더 팀 필터)

> 입력: `02_backend_report.md` §P2-b, `02_frontend_report.md` §P2-b, `01_architect_design.md` §3 N5·N7 · §16, `03_verify_report.md` §10
> 방법: 리포트 주장을 근거로 쓰지 않고 소스로 확인했다. 1·2순위는 **`aggregateByTeam`·`MyTeamAnalysisService`·`permissionGuard` 를 실물로 로드해 백엔드 실응답 shape 으로 실행**했다.

## 11-0. 판정 요약

**실패 1 / 관찰 4 / 미검증 6.**

| 순위 | 대상 | 판정 | 근거 |
|---|---|---|---|
| **1** | `aggregateByTeam` 첫 실사용 | **통과** | 실행 **28/28** — 배열 `teamMeta` 흡수 확인, **P2a-F1 재발 없음** |
| **2** | 권한 축(N7 `grants:[]` + teamLead) | **통과** | 실행 **29/29** — 인원 축 `leadingScope*`, 재무 0건, `teamKey` 이중 방어 |
| **3** | N5 캘린더 | **통과** | 그룹키·`+1일` diff 무변경, 맵 원천 `projectusers ⋈ users`, degrade |
| **4** | 롤업 제외 2건 | **1건 타당 / 1건 ❌** | `projectCount` 제외 타당 · **`todo/inProgress/done` 을 합산한 것이 결함**(P2b-F1) |
| **5** | "모른다"≠"없다" | **통과** | `hasWeightedMetrics===false` → 가동률 축 전체 `-`, `utilBand` 미사용(grep 0) |
| — | 회귀 · P2-c 격리 | **전부 유지** | 대시보드 표면 무변경, `costMasked`/`CostAccess` **0건** |
| — | 실행 | BE **669** / FE **461** / build **EXIT=0** | 주장 수치 일치 |

---

## 11-1. 🔴 1순위 — `aggregateByTeam` 의 첫 실사용 (실행 **28/28 PASS**)

P2a-F1 이 정확히 이 축의 shape 불일치였으므로, **JSDoc shape 이 아니라 백엔드 N7 실응답 형태**로 호출했다.
옵션도 `MyTeamAnalysisPanel.jsx:50-56` 과 **글자 그대로 동일**하게 맞췄다.

### 백엔드가 내보내는 배열 `teamMeta` 를 프론트가 실제로 흡수하는가 — **한다** ✅

```
1a ★ teamMeta **배열**([{id,name,parentTeamKey,depth}])을 그대로 넘겨도 팀명이 해석된다
     → [{"k":"dev","n":"개발팀"},{"k":"front","n":"프론트팀"}]
1b ★ 전 팀이 "팀 미지정"으로 오표기되지 않는다      (P2a-F1 의 발현 형태)
1c hasName=true, isUnassigned=false
1d 행의 teamName 이 우선(행 > teamMeta)
```
`normalizeTeamMeta` 3형태 전수 확인: 배열 `{id,name}` ✅ / 객체·문자열값(포트폴리오·캘린더) ✅ / 객체·객체값(구 JSDoc) ✅ / **알 수 없는 형태 → 빈 Map, 던지지 않는다** ✅

### `missing` · `isUnassigned` / `hasName` 이 UI 까지 도달하는가 — **한다** ✅

| 산출 | 도달 지점 |
|---|---|
| `missing[field]` | `MetricCell`(`:139-154`) — `missing > 0` 이면 값 옆 경고색 `*` + 툴팁 `myPage.team.analysis.partial`(`{count}명 제외`) |
| `hasName === false` | `TeamSubtotalTable` `:177-179` — 톤을 낮춰 미소속과 시각적으로 구분 |
| `isUnassigned` | 같은 분기에서 미소속은 정상 톤 유지 |

**`unknownTeamLabel` 함정 확인**: 패널이 `t('team.form.unknownTeam')` 을 **실제로 넘긴다**(`:55`).
넘기지 않으면 `teamName` 이 **빈 문자열**이 되는 것을 실행으로 확인했다(3d) — 즉 이 인자는 필수이고, 패널이 지켰다.

### "이름 모름" vs "팀 없음" 구분 ✅
```
3a ★ 이름 모름   → "(알 수 없는 팀)" , hasName=false, isUnassigned=false
3b 진짜 미소속   → "팀 미지정"       , isUnassigned=true
3c ★ 라벨에 teamKey(UUID)를 쓰지 않는다
```

### `?? 0` — 신규 2파일 **코드 0건** ✅
`grep "?? 0"` → `useMyTeamAnalysis.js:25`·`MyTeamAnalysisPanel.jsx:26` **주석 2건뿐**. 훅은 `null` 을 가공하지 않고 그대로 통과시킨다.
실행 확인: rollup 부재 → `effortMd:null`·`utilization:null`(0 아님) + `missing:{effortMd:2, utilization:2}`, 부분 결측 → 있는 값만 합산 + `missing:1`, 가중 `Σ/Σ = 0.5`(산술평균 아님).

---

## 11-2. 2순위 — 권한 축 (실행 **29/29 PASS**)

### 인원 축이 `leadingScopeAccountIds` 인가 — **그렇다** ✅

`lead` 가 `teamA` 의 리더이면서 소속은 `teamB`(리더 아님)인 시나리오를 실행했다:

| 실측 | 값 |
|---|---|
| `members` | `["memA","memA1"]` (리딩 팀 + 후손만) |
| **`teamB` 동료(`mateB`)** | **미포함** ★ |
| `scope.teamKeys` | `["teamA","teamA1"]` |

`MyTeamAnalysisService.js:61-62` 가 `leadingScopeTeamKeys`/`leadingScopeAccountIds` 만 읽고
`teamScopeAccountIds`(읽기용, 자기 소속 팀 포함)를 **전혀 참조하지 않는다**(전역 확인). D4 와 같은 과대 권한 없음.

**3중 방어 전부 동작 확인**
```
2a ★ 리딩이 아닌 teamKey(teamB) 요청 → 교집합이 비어 빈 결과      (payload 로 확대 불가)
2b teamKey 미지정 → 리딩 스코프 전체, teamB 는 여전히 제외
3a ★ 인덱스엔 teamA 인데 leadingScopeAccountIds 에 없는 인원 → users 재교집합에서 탈락
```

**빈 집합 가드(C3)**: 팀장이 아니거나 리딩 인원 0명 → **SQL 0회 · KVS 0회**(팀 인덱스 조회조차 안 함) ✅
`principal` 자체가 `undefined` 여도 던지지 않는다 ✅ 빈 결과의 루트 키 집합이 정상 경로와 **1:1** ✅

### 재무 필드 부재 — **직렬화 문자열 0건** ✅
`users` 행에 `salary:99999999`·`annual_salary:12345`·`salary_type` 을 심어 서비스를 돌린 뒤 응답 전체를 직렬화해 검사:
```
5a ★ 재무 흔적 발견 = []   (salary/annualSalary/salaryType/cost/값 문자열 전부 미검출)
5b 멤버 키 18개가 계약과 정확히 일치
```

### `teamKey` 없이 호출되는 경로가 있는가 — **없다** ✅
```
7a N7 meta = { grants: [], project:'none', teamLead:{ teamTargets:['teamKey'] } }
7b ★ teamKey 없이 → isTeamLeadOver = false  (= PERMISSION_DENIED)
7d ★ 리딩 아닌 팀 → 거부      7e 비팀장 → 거부
7f allowlist 는 teamKey 만 통과(evil·accountIds 드롭)
```
프론트 이중 방어 실측: 훅 `enabled: enabled && !!teamKey`(`useMyTeamAnalysis.js:39`) + 패널 마운트 조건
`{selectedTeamKey && <MyTeamAnalysisPanel/>}`. 쿼리키도 `myPageKeys.teamAnalysis(teamKey)` 로 teamKey 포함 ✅

### 계약 테스트 완화가 과한가 — **주 구멍은 없다** ✅ (미세 틈 → P2b-O2)
```
8a grants:[] + teamLead 없음  → 여전히 **거부**된다      ← 백엔드 주장대로
8b grants:[] + teamLead 있음  → 허용(의도)
8c ⚠ grants:[] + teamLead:{} (축 0개) → 테스트를 **통과**한다
8d …런타임은 fail-close(아무도 통과 못 함) — 보안 구멍은 아니다
```

---

## 11-3. 3순위 — N5 캘린더 ✅

### 그룹 키에 `teamKey` 가 들어갔는가 / `+1일 보정`이 바뀌었는가 — **둘 다 아니다** ✅

`git diff static/ui/src/pages/projectDetail/calender/useProjectWorkersSchedule.js` 실측:
- 그룹 키 `` `${schedule_start_date}__${schedule_end_date}__${schedule_type}` ``(`:60`) — **diff 에 `-` 로 등장하지 않음**
- `end: addDaysToDateString(first.schedule_end_date, 1)`(`:74`) — **동일하게 무변경**
- 변경분은 `filtered` 단계(`:52-56`)와 `useMemo` 의존성 배열뿐

### 회귀 가드가 실제로 분열을 잡는가 — **단언은 유효, 다만 훅을 지키지 못한다** (→ P2b-O1)
```
정상 그룹키      → 이벤트 2건 (테스트 기대치)
teamKey 넣은 경우 → 이벤트 4건 → toHaveLength(2) 단언은 **깨진다** ✓
```
단언 자체는 분열을 검출할 능력이 있다. 다만 테스트가 `useProjectWorkersSchedule` 을 import 하지 않고
`groupEvents` 로 **그룹핑을 재구현**하므로, **훅**의 그룹 키가 바뀌어도 테스트는 통과한다(P2b-O1).

### `memberTeamMap` 원천 ✅
```sql
SELECT DISTINCT pu.account_id, u.team_key
FROM projectusers pu JOIN users u ON u.account_id = pu.account_id
WHERE pu.project_id IN (...) AND u.team_key IS NOT NULL
```
- **워크로그 작성자가 아니라 프로젝트 인력** ✅ → 휴가만 있고 워크로그가 없는 사람도 맵에 들어온다
- `INNER JOIN` + `team_key IS NOT NULL` → **미소속자는 행 자체가 없다** = 키 부재 ✅
- Repository 진입부 빈 배열 가드 + `filter(r => r.account_id && r.team_key)` 이중 ✅
- 소비 측 `matchesTeamFilterByAccount` 가 `map[id] === undefined` 를 "팀 미지정"으로 다룬다(테스트 9건 고정) ✅

### degrade ✅
- 백엔드: 팀 축 조달 실패 → `catch` → `{ memberTeamMap:{}, teamMeta:{} }` + `console.error`(조용히 넘기지 않음). **캘린더 본체는 그대로 산다** (`ProjectCalendarService.js:138-140`)
- 조기 반환(`:81`)도 `{ data: [], memberTeamMap: {}, teamMeta: {} }` — 루트 키 집합 1:1 ✅
- 프론트: `isTeamAxisAvailable = teamOptions.length > 0` → **false 면 Select 자체를 렌더하지 않고**(`ProjectCalender.jsx:304`) 훅에 `teamFilter: null` 을 넘긴다 ✅

---

## 11-4. ❌ **P2b-F1 (Medium)** — `todo/inProgress/done` 은 사람 간 **가산적이지 않다**

`MyTeamAnalysisPanel.jsx:52`
```js
sumFields: ['effortMd', 'todoCount', 'inProgressCount', 'doneCount'],
```
프론트가 `projectCount` 를 제외한 근거는 **"두 팀원이 같은 프로젝트면 중복 계상"** 이다. **같은 논리가 이 세 필드에도 그대로 적용되는데 적용되지 않았다.**

**근거 (`src/resolver/resourceManagement/ResourceLoadFetcher.js`)**
```js
// :57-58  JQL — assignee 뿐 아니라 coworker 도 잡는다
`(assignee in (${ids}) OR movesRmsCoworkers in (${ids})) AND …`

// :291-306
const participants = new Set();
if (assigneeId) participants.add(assigneeId);
for (const c of coworkers) if (c) participants.add(c);
for (const pid of participants) {
    if (cat === 'new') cur.todoCount += 1;          // ← 참여자 **each** 에게 +1
    else if (cat === 'indeterminate') cur.inProgressCount += 1;
    else if (cat === 'done') cur.doneCount += 1;
    cur.spentSeconds += perSpent;                   // ← 이쪽은 participantCount 로 **나눠서** 담는다
    cur.remainingSeconds += perRem;
}
```

| 필드 | 사람 간 합산 시 | 이유 |
|---|---|---|
| `spentSeconds` / `remainingSeconds` | **가산적** ✅ | `perSpent = spent / participantCount` 로 균등 분할 |
| `effortMd`(= `investedMd`) | **가산적** ✅ | 포트폴리오 배치의 워크로그 작성자 기준 |
| **`todoCount` / `inProgressCount` / `doneCount`** | **❌ 중복 계상** | 이슈 1건이 참여자 수만큼 +1 된다 |

⇒ 같은 팀의 두 사람이 한 이슈에 함께 참여하면 팀 소계가 **그 이슈를 2번 센다.**
`coworker` 는 이 앱의 **1급 커스텀 필드**(manifest 정의 + `movesRmsCoworkers` JQL alias)라 예외 상황이 아니다.
따라서 리포트가 근거로 적은 **"이슈 담당자는 1명이라 팀원 간 가산적이다"는 사실이 아니다.**

**왜 지금까지 안 드러났는가**: 전역 grep 결과 기존 소비자(`ResourceOverviewTable`·`LoadSummaryCards`·`CompanyResourceTable`·`ProjectDetailPanel`·`ScopeSplitCell`)는 **전부 사람별로 표시**만 한다.
**P2-b 의 팀 소계가 이 값들을 사람 간에 합산하는 최초 지점**이다.

**영향**: 팀장이 보는 "내 팀 업무 분석"의 To Do / In Progress / Done 소계가 부풀려진다. 보안 문제는 아니지만
그 패널의 존재 이유가 "팀원들이 어떻게 일하고 있는지"이므로 **틀린 숫자를 그 목적 그대로 보여준다.**
(팀원 행 `:238` 의 개별 값은 정상이다 — 소계 행만 틀린다.)

**수정(택1)**
- (a) 세 필드를 `sumFields` 에서 빼고 `projectCount` 와 같이 `-` 로 둔다 — **자기 논리와 일관**되고 즉시 적용 가능.
- (b) 백엔드가 assignee 전용 카운트를 별도 필드로 내려주고 그것만 합산한다.
- (c) 합산은 유지하되 열 머리글/툴팁에 "참여 기준(공동 작업 시 중복 가능)"을 명시한다.
- 어느 쪽이든 `spentSeconds`/`effortMd` 는 그대로 두면 된다(가산적).

---

## 11-5. 4·5순위 — 나머지 판단

### `completionRate` 제외 — **현 계약상 타당. 단 "구현 불가능"은 아니다** ⚠

프론트 주장("서버가 분자·분모를 주지 않는다")은 **응답 기준으로 사실**이다. `avgFields` 는 가중 전용이고
산술평균은 설계가 금지하므로, **현재 응답만으로는 계산할 수 없다** — 제외 판단은 옳다.

다만 코디네이터 질문("정말 구현 불가능한가")에는 **아니다**가 답이다:
- `fetchAssignedLoadByAccounts` 는 이미 **`spentSeconds`/`remainingSeconds` 를 계정별로 반환**한다(`ResourceLoadFetcher.js:250,325`).
- `MyTeamAnalysisService.js:144` 가 그 두 값으로 `completionRate` 를 계산한 뒤 **원본 두 값을 버린다.**
- 즉 **응답에 2필드를 추가하면** `avgFields: {field:'completionRate', numerator:'spentSeconds', denominator:'totalSeconds'}` 로 가중 완수율이 바로 나온다. 새 조회·새 계산 0.
→ 리더 판단 재료로 기록한다(프론트도 "리더 판단"으로 올림).

### `projectCount` 제외 — **타당** ✅
`selectActiveProjectCounts` 는 계정별 참여 프로젝트 수라, 같은 프로젝트에 두 팀원이 있으면 중복 계상된다. 제외가 맞다.

### "모른다"를 "없다"로 말하지 않는가 ✅
| 항목 | 실측 |
|---|---|
| `hasWeightedMetrics === false` → 가동률 축 전체 `-` | `TeamSubtotalTable:186-190` — util 열이 `<Dash/>`. 팀원 표도 `:234` `hasWeightedMetrics && m.utilization != null ? pct : <Dash/>` |
| **`utilBand` 배지** | 패널 전체 grep → **`utilBand` 참조 0건**. 배지를 아예 그리지 않는다(주장 사실) |
| 구버전 응답 | 훅 `content.hasWeightedMetrics === true` → 필드 부재 시 **false**(fail-close) |
| 서버 판정 | `rows.length > 0 && rows.every(r => r.availMd !== null)` — 한 명이라도 null 이면 false(실행 확인) |
| **"가동률 0인 팀"** | 렌더 경로 **없음** — `aggregateByTeam` 이 `null` 을 내고, `MetricCell` 은 `value == null → <Dash/>`, 그 위에 `hasWeightedMetrics` 게이트가 하나 더 있다 |

---

## 11-6. 관찰

| # | 심각도 | 내용 |
|---|---|---|
| **P2b-O1** | Low-Medium | **N5 회귀 가드가 훅을 지키지 못한다.** `teamFilterByAccount.test.js` 는 `teamFilter`·`constants/team` 만 import 하고 그룹핑을 **로컬에 재구현**(`groupEvents`)한다. 따라서 `useProjectWorkersSchedule.js:60` 의 그룹 키에 `teamKey` 가 들어가도 **테스트는 통과한다**. 단언 자체는 분열을 검출할 능력이 있음(시뮬: 2건 → 4건). §R7 미러(P1-O4)에서 백엔드 실물을 import 해 해결한 것과 같은 계열. 권고: 그룹 키 생성을 순수 헬퍼(`scheduleGroupKey(s)`)로 추출해 훅과 테스트가 **같은 함수**를 쓰게 할 것 |
| **P2b-O2** | Low | **계약 테스트 완화의 미세 틈** — `if (!meta.teamLead)` 는 `teamLead: {}`(축 0개)를 통과시킨다. 런타임은 `isTeamLeadOver` 가 `anyAxisResolved=false` 로 **fail-close** 하므로 보안 구멍은 아니고, "아무도 호출할 수 없는 죽은 resolver"가 조용히 등록될 뿐이다. 권고: `teamLead` 가 있으면 `accountTargets`/`teamTargets` 중 **1개 이상이 비지 않았는지**까지 단언 |
| **P2b-O3** | 정보 | `completionRate` 팀 소계는 **서버 2필드 추가로 즉시 가능**하다(§11-5). 값이 이미 계산 경로에 있고 버려진다 |
| **P2b-O4** | Low | `getMyTeamWorkAnalysis` 는 `grants: []` 라 **관리자(isAdmin)도 `leadingScopeAccountIds=[]` 면 빈 결과**를 받는다(M-3 의도). 화면은 팀장에게만 마운트되므로 현재 문제 없으나, 조직 관리자가 임의 팀 분석을 요구하면 **별도 resolver** 가 필요하다(PermissionMap 주석에 이미 기록됨) |

---

## 11-7. 회귀 — 전부 유지 ✅

| 항목 | 실측 |
|---|---|
| **C1 read-merge** | SQL 플레이스홀더 7 ↔ `pick()` 5필드 ↔ `invoke("updateUser")` **1곳** |
| **팀 필터 3상태** | `TEAM_FILTER_NONE='__NONE__'` 양측 1건씩. `{value:null}` 생성 경로 0 |
| **`toRecord` 빈 문자열 0** | 선택 4필드 전부 조건부 |
| **`whereIn([])` 가드** | `TeamRepository` 5 · `ProjectTeamRepository` 3 · `ProjectUsersRepository` **2**(N5 신규 포함) |
| **`TableReadiness` 4경로** | Safe 래퍼 4종 유지 |
| **`leadingScope` 분리** | `permissionGuard` 4참조 — write/축 판정은 `leadingScope*` 만 |
| **cascade** | 팀·프로젝트·사용자 삭제 순서 불변 |
| **`normalizeTeamMeta`** | 3형태 흡수 유지(실행 확인) |
| **`?? null` 4필드** | `useUserEditModal` 7건 유지 |
| **`limits` 리터럴** | 프론트 `maxTeams`/`maxDepth` 상수 **0건** |
| **DnD** | 팀·마이페이지·캘린더·프로젝트 인력 표면 **0건**(금지 주석 1건). 나머지 3파일은 기존 간트/작업트리/관계도로 **미접촉** |
| **P2-c 격리** | `git status -- pages/portfolio pages/projectDetail/dashboard` **무출력** · `costMasked`/`CostAccess`/`PortfolioTeamComparison`/`PortfolioTeamDist` **0건** → **단독 롤백 가능** ✅ |
| **i18n** | team 105/105 · myPage 136/136 · projectDetail 339/339 · resource 139/139 · common 106/106 · user 89/89 · permission 61/61 **전부 대칭**. **키 안에 점 0건** ✅. 참조 키 **1,576종** 중 팀 관련 누락 0 |

> 팀과 무관한 기존 누락 2건(`level.modal.edit.label.title`, `upload.error`)은 이전 절에 기록한 별건.

---

## 11-8. 실행 검증 (원문 — `cmd /c "… & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\pb_be.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 39 passed, 39 total
Tests:       669 passed, 669 total        <- 주장 669 일치 (640 -> 669, +29)
```
```
> cmd /c "npx jest --ci > %TEMP%\pb_fe.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 28 passed, 28 total
Tests:       461 passed, 461 total        <- 주장 461 일치 (448 -> 461, +13)
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\pb_bd.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.        (node_modules 소스맵 3건 — 기존)
The build folder is ready to be deployed.
```

⚠ **테스트 통과를 빌드 근거로 쓰지 않았다** — 빌드를 별도 실행해 `EXIT=0` 을 직접 확인했다.
그리고 **빌드·테스트는 P2b-F1 을 잡지 못한다** — `aggregateByTeam` 은 넘겨받은 필드를 성실히 더할 뿐이고,
"그 필드가 사람 간 가산적인가"는 `ResourceLoadFetcher` 의 참여자 루프를 열어봐야 나온다.

---

## 11-9. 미검증 (배포/E2E 필요)

| # | 항목 |
|---|---|
| **P2b-U1** | **N7 실기동** — 실제 팀장 계정으로 `/my-page` 진입 시 `getMyTeamWorkAnalysis` 가 통과하는지(로컬은 principal mock) |
| **P2b-U2** | `fetchAssignedLoadByAccounts` 의 Jira JQL 실호출(`movesRmsCoworkers` alias 포함) — 팀 인원만으로 좁혔을 때의 실제 응답 시간 |
| **P2b-U3** | N5 캘린더 실기동 — 팀 필터 적용 시 통합 이벤트가 실제로 분열하지 않는지(로컬은 순수 함수 재현) |
| **P2b-U4** | `getProjectCalendarWorklog` 루트 2필드 추가에 따른 응답 크기 증가(대형 프로젝트) |
| **P2b-U5** | P2b-F1 의 실제 영향 규모 — 조직에서 coworker 를 얼마나 쓰는지에 비례한다 |
| **P2b-U6** | P0 §2 · P1 §8-12 · §9-9 · §10-11 의 미검증 항목 — **여전히 유효** |

---

## 11-10. 담당별 조치 요청

### frontend-engineer — 권장 1건 (배포 전)
1. **P2b-F1** — `sumFields` 에서 `todoCount`/`inProgressCount`/`doneCount` 를 빼거나(=`projectCount` 와 동일 처리) 열에 "참여 기준(중복 가능)"을 명시할 것. 자기 논리와의 일관성 기준으로는 **빼는 쪽**이 맞다(§11-4).
2. (선택) **P2b-O1** — 그룹 키 생성을 순수 헬퍼로 추출해 훅과 회귀 테스트가 같은 함수를 쓰게 할 것.

### backend-engineer — 권장 0건 (필수 0)
1. (선택) **P2b-O3** — `completionRate` 팀 소계를 원하면 멤버 행에 `spentSeconds`/`remainingSeconds`(또는 `totalSeconds`)를 추가. 새 조회·새 계산 없이 2필드다.
2. (선택) **P2b-O2** — 계약 테스트에서 `teamLead` 의 축이 1개 이상인지까지 단언.

### 리더 판단
- **P2b-F1 을 이번 배포에 포함할지** — 팀 소계 3열의 정확성 문제다. 프론트 1줄 수정으로 "표시 안 함"으로 바꿀 수 있다.
- **`completionRate` 팀 소계**(P2b-O3) 를 백엔드 2필드 추가로 살릴지 — 설계서 §3 이 요구한 항목이다.
- P2-c 는 **단독 롤백 가능 상태가 유지되고 있다**(§11-7 확인). 착수 순서 자유.

---
---

# 12. P2-c 검증 (2026-07-28) — N6 대시보드 팀 비교 + U12 포트폴리오 인건비 게이트

> 입력: `02_backend_report.md` §P2-c(00·0·1·2), `02_frontend_report.md` §P2-c(A~G), `01_architect_design.md` §16, `05_fable_review_p2.md`
> **P2 마지막 단계이자 유일하게 기존 동작을 축소하는 변경.** 잘못 나가면 "전 사용자에게 ₩0 상시 노출"이라는 **지금보다 나쁜 상태**가 된다.
> 방법: 게이팅 7지점을 **실제로 하나씩 제거해 테스트가 실패하는지** 확인했고(변이 검증, 원복 무결성 해시로 확인), 백엔드·N6 순수함수는 실물 로드해 실행했다.

## 12-0. 판정 요약

**실패 2 / 관찰 4 / 미검증 5. 배포 차단 항목 1건.**

| 순위 | 대상 | 판정 | 근거 |
|---|---|---|---|
| **0** | 깨진 HEAD | **🚨 실패 (Critical · 배포 차단)** | import 그래프 **2,040 간선 전수** — 깨진 것은 **정확히 1건**, 그리고 그것이 **전 resolver 로드 경로**에 있다 |
| **1** | 게이팅 7지점 | **통과** | 7지점 전부 소스에 실재 · #3 정렬 가중 제외 **사실** · #6 렌더 소비자 0 **사실** |
| **2** | 회귀 가드 검출력 | **❌ 실패 (Medium)** | 변이 검증 **6/7** — **#2 는 게이팅을 지워도 통과한다** |
| **3** | N6 위젯 | **통과** | 실행 **27/27** — 단일 롤업 · 3층 규칙 · 합계 보존 · 비율축 null |
| **4** | 백엔드 게이트 | **통과** | 실행 **19/19** — 키 부재 · 직렬화 0건 · `emptyShape` 1:1 · `CostAccess` fail-close |
| **5** | `portfolioAggregate.js` 분리 | **통과** | `git diff`/`git status` **무출력 = 무변경** |
| — | 회귀 | **전부 유지** | i18n 대칭 + 점 포함 키 0 |
| — | 실행 | BE **682** / FE **525** / build **EXIT=0** | 주장 수치 일치 |

---

## 12-1. 🚨 **P2c-F1 (Critical · 배포 차단)** — HEAD 가 clean checkout 되지 않는다

### 전수 확인 결과 — 깨진 import 는 **정확히 1건**

`git ls-tree HEAD` 로 741개 파일 목록을 만들고, HEAD 커밋 내용에서 **상대경로 import/require/jest.mock 2,040 간선**을 추출해 HEAD 안에서 해석했다.

```
HEAD 파일수=741 / 상대 import 줄=2040 / 간선=2040
=== HEAD 에 없는 대상을 import 하는 지점 ===
  src/resolver/projectDashboard/ProjectDashboardService.js
      → '../../permission/CostAccess'   (해석: src/permission/CostAccess)
```
→ 백엔드 리포트의 **"HEAD 가 import 하는 미추적 파일은 이것 하나뿐"** 주장은 **사실**이다.
나머지 미추적 5개(`PortfolioCostGate.test.js`·`costGate.test.js`·`teamComparison.test.js`·`teamComparison.js`·`PortfolioTeamComparison.jsx`)는 HEAD 코드가 **참조하지 않는다**(`git grep` on HEAD → 0건).

### ⚠ 영향은 "대시보드만"이 아니다 — **전 resolver 가 죽는다**

```
manifest.yml  resolver.function → index.handler
  src/index.js:15   import { registerProjectDashboardController } from "./resolver/projectDashboard/ProjectDashboardController"
  ProjectDashboardController.js:7  import { ... } from "./ProjectDashboardService"
  ProjectDashboardService.js:9     import { canReadCost, COST_DENIED_REASON } from "../../permission/CostAccess"   ← HEAD 에 없음
```
`src/index.js` 는 manifest 의 **`resolver` 핸들러 엔트리**다. 그 모듈 그래프에서 해석 실패가 나면
**앱의 모든 resolver 호출이 실패**한다(권한 체크·팀·프로젝트 전부). 부분 장애가 아니다.

### 로컬로는 절대 안 잡힌다 (확인)
파일이 디스크에 있으므로 `npm test` 682건이 전부 통과한다(이번 회차에도 통과했다).
이번 회차에 반복된 "배포 후에만 드러나는 계열"(U3 KVS 빈 문자열 · `v014` 테이블 부재)과 같은 유형이며, 이번엔 **git 인덱스 축**에서 났다.

### 다른 축도 확인했다 — manifest 핸들러
| 엔트리 | 핸들러 | HEAD |
|---|---|---|
| `resolver` / `runMigration` / `portfolioSnapshot` | `index.*` | `src/index.js` ✅ |
| `uploadUsers` / `aggregatePortfolio` | `queue/consumer.*` | ✅ |
| `onInstall` | `trigger/onInstall.onInstall` | ✅ |
| `demoSeed` | `trigger/demoSeed.runDemoSeed` | **HEAD 에 없음** — 단, **manifest 에서 주석 처리**(`manifest.yml:91-92`, `:108-110`) + `.gitignore:62` 로 의도적 제외 → **문제 없음** |

→ **manifest 축에는 실제 문제가 없다.** 유일한 결함은 `CostAccess.js` 다.

### 조치 (§12-9 배포 전 필수 조치 #1 참조)

---

## 12-2. ❌ **P2c-F2 (Medium)** — 회귀 가드가 **#2 게이팅 제거를 잡지 못한다**

코디네이터 지시대로 **게이팅을 하나씩 실제로 제거**하고 `costGate.test.js` 를 돌린 뒤 원복했다.

```
── 0) 원본 상태 costGate 테스트 = 통과
  PASS      #1 필터바 합계 칩       제거 → 테스트 실패함(검출 O) · 해당 지점 명시
  **FAIL**  #2 종합개요 salary 컬럼 제거 → 테스트 **통과함(검출 X ❌)**
  PASS      #3 Cost 신호등          제거 → 실패함(검출 O)
  PASS      #4 풀 수치표 salary     제거 → 실패함(검출 O)
  PASS      #5 Cost 탭              제거 → 실패함(검출 O)
  PASS      #6 salaryBuckets 전달   제거 → 실패함(검출 O)
  PASS      #7 N6 인건비 축         제거 → 실패함(검출 O)
── 원복 무결성: ✅ 전 파일 바이트 동일 (sha256 대조)
=== 검출 6/7 ===
```

### 원인 — **이웃 게이트를 빌려 통과한다** (실측 재현)

`isGated` 는 토큰이 나온 줄에서 **LOOKBACK 6줄**을 창으로 잡아 `GATE` 정규식을 본다.
#2 의 토큰 `portfolio.table.salary` 는 `PortfolioTsrSignalTable.jsx:103` **한 줄에만** 있는데,
그 창(97~103)에 **#3 의 게이트(`:99`)** 가 들어온다:

```
 97| { key: "s", content: t("portfolio.overview.colScope") },
 98| { key: "r", content: t("portfolio.overview.colResource") },
 99| ...(costMasked ? [] : [{ key: "c", content: t("portfolio.cost.tsr.costSignal") }]),   ← #3 의 게이트
100| { key: "completion", ... },
101| { key: "schedule", ... },
102| { key: "utilization", ... },
103| { key: "salary", content: t("portfolio.table.salary"), isSortable: true },            ← #2 게이팅 제거됨
   → GATE 정규식 매치: true   (게이팅된 것으로 **오판**)
```

- **라이브 결함은 아니다** — #2 의 실제 게이팅은 소스에 실재한다(`:103`·`:148` 둘 다 `costMasked ? [] : …`).
- 그러나 프론트가 **이미 두 번 고친 뒤에도 남아 있는 구멍**이고, 하필 "전 사용자에게 ₩0" 을 막는 **유일한 방어선**의 감시 장치다. 다음 사람이 #2 게이팅을 지워도 CI 는 초록이다.

### 권고 — 합성 스니펫이 아니라 **실파일 변이**로 검증

현재 "검출력 확인" 테스트 3건은 **손으로 만든 문자열**을 넣어 `isGated` 가 false 인지 본다.
그래서 "이웃 게이트" 상황이 재현되지 않는다. 아래로 바꾸면 #2 가 즉시 잡힌다:

```js
const GATE_SYNTAX = [ /* 지점별 실제 게이팅 문자열 → 언게이트 등가물 */ ];
it.each(GATE_SYNTAX)('%s — 실파일에서 게이팅을 제거하면 검사가 실패한다', (label, file, token, from, to) => {
    const mutated = read(file).replace(from, to);       // 실파일 내용을 메모리에서 변이
    expect(isGated(mutated, token).ok).toBe(false);     // ← #2 는 여기서 true 가 나와 실패한다
});
```
(즉시 임시 조치로는 `#2` 의 토큰을 **같은 줄의 게이트까지 요구**하도록 좁히는 것도 가능하다 — 검증 결과 `#2`·`#4`·`#6` 은 같은 줄 게이팅이라 통과하고, `#1`·`#3`·`#5` 는 블록 게이팅이라 별도 규칙이 필요하다.)

---

## 12-3. 1순위 — 게이팅 7지점 소스 확인 ✅

프론트 표를 믿지 않고 소스에서 직접 확인했다.

| # | 파일:라인 | 실측 |
|---|---|---|
| **1** | `PortfolioFilterBar.jsx:127` | `{!costMasked && ( … ₩{…totalSalary…} )}` — 칩 하나만 숨김 ✅ |
| **2** | `PortfolioTsrSignalTable.jsx:103`(head) · `:148`(cell) | `...(costMasked ? [] : [{ key:"salary" … }])` — **컬럼째 제거** ✅ |
| **3** | 〃 `:99`(head) · `:142-144`(cell) | Cost 신호등 컬럼 제거 ✅ |
| **3-정렬** | 〃 `:52-56` | `const levelsOf = (sig) => (costMasked ? [time, scope, resource] : [… , resource.costLevel])` — **정렬 가중에서도 `costLevel` 제외** ✅ **주장 사실** |
| **4** | `PortfolioProjectTable.jsx:54`(head) · `:92`(cell) | salary 컬럼 제거 ✅ (고아 아님 — `PortfolioTsrSignalTable:173` 이 렌더) |
| **5** | `ComparisonTabs.jsx:99-104` | `active==="cost" && (costMasked ? <안내문구> : <CostTab …/>)` — 탭 유지 + 안내 ✅ |
| **6** | `PortfolioDashboardPage.jsx:169` | `salaryBuckets={costMasked ? [] : data?.salaryBuckets ?? []}` ✅ |
| **7** | `teamComparison.js:64-78` + 위젯 | `availableTeamAxes(costMasked)` 로 축 제거 + `resolveTeamAxis` MD 폴백 ✅ |

`costMasked` 파생도 확인: `PortfolioDashboardPage.jsx:68` `const costMasked = data?.costMasked === true;` — **`=== true`** 라 구버전 응답(필드 부재)은 `false`… ⚠ 이 방향은 **fail-open** 이 아니라 **fail-close 의 반대**다. 다만 서버가 `costMasked` 를 **항상** 내려주고(§12-5 3e 확인) 구버전 서버와 신버전 프론트를 섞어 배포하지 않는 한 문제가 없다 → §12-9 배포 순서 참조.

### #3 정렬이 오신호에 좌우되는가 — **아니다** ✅
`levelsOf` 가 `costMasked` 일 때 `sig.resource.costLevel` 을 배열에서 아예 뺀다(`:54-56`), 그리고 `useMemo` 의존성에 `costMasked` 가 들어 있다(`:69`). 컬럼만 감추고 순서는 0원 기준으로 흔들리는 상황이 발생하지 않는다.

### #6 은 방어적 차단이 맞는가 — **맞다** ✅
`salaryBuckets` 전달 경로 실측: `PortfolioDashboardPage:169` → `ComparisonTabs:26`(prop 선언) → **그 아래 전달처 없음**.
유일 소비처 `PortfolioSalaryHistogram.jsx` 는 외부 참조 **0건**(고아). → **현재 렌더 소비자 0** 주장 **사실**.
그래도 차단해 둔 것은 고아가 되살아났을 때 게이트가 이미 있게 하는 조치로 타당하다.

### 고아 위젯 2종을 게이팅하지 않은 것이 옳은가 — **옳다** ✅
`PortfolioSalaryByProject` · `PortfolioSalaryHistogram` 전역 grep → **외부 참조 0건**(자기 파일·테스트 제외).
죽은 코드를 게이팅하면 커버리지 착각만 생긴다. 대신 **"여전히 고아인지"를 감시하는 테스트**가 실재한다(`costGate.test.js:217-224`) — 되살아나면 실패한다. 좋은 처리다.

---

## 12-4. 3순위 — N6 위젯 (실행 **27/27 PASS**)

| 요구 | 실측 |
|---|---|
| **`aggregateByTeam` 단일 롤업** | `teamComparison.js` 내 `aggregateByTeam(` **2회**(스코프 집계 + 가동률) — 별도 reduce 롤업 경로 **없음** ✅ |
| **`NON_ADDITIVE_FIELDS` 준수** | `sumFields: ['effortMd','salary']` — **카운트류 합산 0건** ✅ P2b-F1 재발 없음. 비율 2축은 전부 `avgFields` 가중 |
| **`기타` 묶음이 합계를 보존** | 13팀 → 상위10 + 기타1 = 11행, 표시합 91 = 실제합 91 ✅ `salary` 도 합산(가산 축) |
| **비율 축은 묶어 합산하지 않는다** | 기타 행의 `completionRate`·`utilization` = **`null`** ✅ (숫자를 만들어내지 않는다) |
| 팀 미지정 | 숨기지 않고 **항상 마지막** ✅ |
| dedup 비대칭 | 인원수는 accountId dedup(1명), 공수는 프로젝트별 기여 합(15) ✅ |
| **가동률 "집계 전"** | people 없음 → `hasUtilizationData:false` ∧ 값 **`null`**(0% 아님) ✅ |
| 가동률 필터 무반응 고지 | 위젯이 `hasUtilizationData` 분기 + `SectionMessage` 보유 ✅ |
| **#7 축 게이팅** | `costMasked` 면 축 목록에서 `salary` 제거 · 현재 축이 salary 면 `effortMd` 폴백 ✅ · `salary` 키 부재 시 **0 아니라 null** ✅ |
| 게이팅 우회 금지 | 위젯이 `axes.map(` 을 쓰고 `TEAM_COMPARISON_AXES.map(` 은 **쓰지 않는다** ✅ |

### ★ 3층 규칙(H-2) — 선택지가 스코프에서만 나오는가 ✅
```
2a ★ teamMeta 에만 있는 팀(유령팀)  → 등장하지 않는다
2b ★ utilization.people[] 에만 있는 팀(영업팀) → 등장하지 않는다   ← M-1 필터 무관 글로벌 혼입 차단
2c 스코프 팀만 등장 = ["개발팀","프론트팀"]
2d 가동률 **값**은 전사 people 에서 오되 **표시 대상**은 스코프로 제한
```
구현 근거: `teamComparison.js:104-131` 이 `projects[].members[]` 를 순회해 `scopedTeamKeys` 를 만들고,
가동률 행은 `:152` 에서 `.filter(r => scopedTeamKeys.has(r.teamKey))` 로 좁힌다.
→ **TEAM_ONLY 사용자가 보지 못하는 팀을 고를 수 있는 경로가 없다.** H-2 성립.

---

## 12-5. 4순위 — 백엔드 게이트 (실행 **19/19 PASS**)

| 요구 | 실측 |
|---|---|
| **급여 3필드가 키 자체로 없는가** | `salaryBuckets` ✅ · `projects[].totalSalary` ✅ · `members[].salary` ✅ — 셋 다 `in` 연산자로 부재 확인 |
| **직렬화 문자열 확인** | `123456789`(totalSalary)·`987654321`(salary)·`totalSalary`·`salaryBuckets`·`"salary"` → **발견 0건** ✅ |
| **`emptyShape()` 도 동일한가 / 루트 키 1:1** | 빈 응답과 정상 응답의 루트 키 집합 **완전 일치**(deny·allow 각각) ✅ `aggregateStatus,costMasked,lastAggregatedAt,levelMeta,memberTeamMap,problemIssues,projects,roleMeta,scopeBands,teamMeta,utilization,utilizationBands` |
| **`costMasked` 가 하드코딩이 아닌가** | `PortfolioDashboardService.js:127` `const costMasked = !canReadCost(principal)` → `emptyShape(…, costMasked)`(`:131`) ✅ 빈 응답에서도 principal 반영 |
| `costMasked` 항상 존재 | 두 경로 모두 `typeof === 'boolean'` ✅ |
| admin | 마스킹 안 됨 ✅ |
| **인건비 외 축 보존** | deny 응답에도 `utilization`·`teamMeta`·`memberTeamMap`·`problemIssues` 유지, `members[].effortMd`/`utilization` 유지 ✅ |

### `CostAccess.js` 승격 — 동작 차이 0 ✅
```js
export const canReadCost = (principal) =>
    principal?.isAdmin === true || principal?.resourceMap?.PROJECT_COST?.read === true;
```
- `principal` 누락 → **false**(fail-close) ✅
- **truthy 통과 없음** — `isAdmin:1`·`read:'yes'`·`read:1` 전부 **false** ✅ (`=== true` 비교)
- `COST_DENIED_REASON === 'PROJECT_COST_REQUIRED'` — U7 문자열 **글자 그대로 재사용** ✅
- 복사본 잔존 여부: `ProjectDashboardService.js:137` 에 "복사본을 만들지 말 것" 주석만 남고 로직은 import 로 대체 ✅

---

## 12-6. 5순위 — `teamComparison` 별도 파일 분리 ✅

```
$ git diff --stat  -- static/ui/src/pages/portfolio/utils/portfolioAggregate.js
$ git status --porcelain -- static/ui/src/pages/portfolio/utils/portfolioAggregate.js
  (둘 다 무출력 = 무변경)
```
→ 주장 **사실**. `portfolioAggregate.js`(P0~P2-b 공용 500줄 모듈)를 건드리지 않아 **P2-c 롤백 diff 가 다른 위젯과 얽히지 않는다.** 판단 타당.

---

## 12-7. 관찰

| # | 심각도 | 내용 |
|---|---|---|
| **P2c-O1** | 정보 | `ComparisonTabs.jsx:26` 이 `salaryBuckets` prop 을 **선언만 하고 어디에도 전달하지 않는다**(죽은 prop). 유일 소비처가 고아라 무해하지만, 고아 위젯 2종과 함께 U16 정리 대상 |
| **P2c-O2** | Low | 프론트 `costMasked = data?.costMasked === true` 는 **필드가 없으면 `false`(=마스킹 안 함)** 다. 서버가 항상 내려주므로 현재는 안전하지만, **서버를 롤백하고 프론트만 신버전으로 두면 "게이트가 열린 채 급여 키도 없는" 상태**가 되어 `?? 0` 이 살아난다. §12-9 배포/롤백 순서를 지킬 것 |
| **P2c-O3** | 정보 | `demoSeed` manifest 엔트리는 **주석 처리**(`manifest.yml:91-92`,`:108-110`) + `.gitignore:62` 로 의도적 제외. "manifest 가 참조하는 핸들러가 HEAD 에 없다"는 유형의 **실제 문제는 없다**(확인 완료) |
| **P2c-O4** | 정보 | 프론트가 "마스킹 후 집계 함수가 0을 만든다"를 테스트로 증명한 것은 **사실이며 중요하다** — 서버 키 삭제만으로는 부족하고 게이팅이 유일한 방어선임을 코드로 고정했다. 이 테스트는 유지할 것 |

---

## 12-8. 회귀 — 전부 유지 ✅

| 항목 | 실측 |
|---|---|
| **C1 read-merge** | SQL 플레이스홀더 7 ↔ `pick()` 5필드 ↔ `invoke("updateUser")` **1곳** |
| **팀 필터 3상태** | `TEAM_FILTER_NONE='__NONE__'` 양측 1건씩 |
| **`toRecord` 빈 문자열 0** | 선택 4필드 조건부 |
| **`whereIn([])` 가드** | Team·ProjectTeam·ProjectUsers Repository 유지 |
| **`TableReadiness`** | Safe 래퍼 **4종** 유지 |
| **`leadingScope` 분리** | `permissionGuard` 4참조 |
| **`normalizeTeamMeta`** | export 유지(3형태 흡수) |
| **`NON_ADDITIVE_FIELDS`** | N6 `sumFields` 에 카운트 0건 |
| **`?? null` 4필드** | `useUserEditModal` 7건 |
| **`limits` 리터럴** | 프론트 0건 |
| **DnD** | 팀·마이페이지·포트폴리오·캘린더 표면 **0건**(금지 주석 1건) |
| **i18n** | portfolio 266/266 · team 105/105 · myPage 137/137 · projectDetail 339/339 · resource 139/139 · common 106/106 · user 89/89 · permission 61/61 **전부 대칭**. **키 안에 점 0건** ✅. 참조 키 **1,586종** 중 팀/인건비 관련 누락 0 |

> 팀과 무관한 기존 누락 2건(`level.modal.edit.label.title`, `upload.error`)은 이전 절 기록.

---

## 12-9. 🚩 **배포 전 필수 조치 목록**

| # | 조치 | 이유 | 확인 방법 |
|---|---|---|---|
| **1** | **`src/permission/CostAccess.js` 를 커밋에 포함한다** (§12-1) | HEAD 를 clean checkout 하면 **전 resolver 로드 실패** | 커밋 후 `git cat-file -e HEAD:src/permission/CostAccess.js` 가 성공해야 한다. 더 확실하게는 **임시 worktree 로 HEAD 를 뽑아 `npm test` 를 돌려볼 것** |
| **2** | 함께 커밋: `PortfolioDashboardService.js`(수정분) · `PortfolioCostGate.test.js` · P2-c 프론트 6파일 | 게이트 본체·회귀 가드·프론트 7지점이 흩어지면 반쪽 배포가 된다 | `git status --porcelain` 에 P2-c 산출물이 남지 않을 것 |
| **3** | **서버와 프론트를 같은 배포에 낸다** | 서버만 나가면 급여 키는 사라지는데 프론트 `?? 0` 이 살아 **"₩0" 상시 노출**(지금보다 나쁨). 프론트만 나가면 게이트는 있는데 서버가 급여를 계속 준다 | 배포 후 `PROJECT_COST read` 없는 계정으로 `/dashboard` 진입 — 칩·컬럼·Cost 탭·N6 축이 **사라져 있어야** 한다(₩0 이 아니라) |
| **4** | **롤백도 함께** 한다(서버 단독 롤백 금지) | P2c-O2 — 서버만 롤백하면 프론트 게이트가 열린 채 급여가 다시 흐른다 | 롤백 계획서에 명시 |
| **5** | 배포 노트에 **동작 축소**를 적는다 | 시드 Member·Team Lead·Team Member·대다수 커스텀 세트가 인건비 7지점을 **못 보게 된다**(의도된 보안 수정) | §P2-c-0 표를 그대로 인용 |
| **6** | (권장) **P2c-F2 회귀 가드 보강** | #2 게이팅을 지워도 CI 가 초록이다 — "₩0" 을 막는 유일 방어선의 감시 장치 | §12-2 의 실파일 변이 테스트로 교체 후, 7지점 변이 검증이 **7/7** 이 되는지 확인 |

---

## 12-10. 실행 검증 (원문 — `cmd /c "… & echo %errorlevel%"` 재측정)

```
> cmd /c "npx jest --ci > %TEMP%\pc_be.txt 2>&1 & echo BACKEND_EXIT=%errorlevel%"
BACKEND_EXIT=0
Test Suites: 40 passed, 40 total
Tests:       682 passed, 682 total        <- 주장 682 일치
```
```
> cmd /c "npx jest --ci > %TEMP%\pc_fe.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 31 passed, 31 total
Tests:       525 passed, 525 total        <- 주장 525 일치
Snapshots:   1 passed, 1 total
```
```
> cmd /c "npm run build > %TEMP%\pc_bd.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.        (node_modules 소스맵 3건 — 기존)
The build folder is ready to be deployed.
```

⚠ **테스트 통과를 빌드 근거로 쓰지 않았다** — 빌드를 별도 실행했다.
그리고 **이번 회차의 두 실패는 빌드·테스트가 전부 초록인 상태에서 나왔다**:
- **P2c-F1** 은 파일이 디스크에 있어 682건이 통과한다 → **git 인덱스**를 봐야 나온다.
- **P2c-F2** 는 테스트가 스스로를 통과시킨다 → **게이팅을 실제로 제거**해봐야 나온다.

---

## 12-11. 미검증 (배포/E2E 필요)

| # | 항목 |
|---|---|
| **P2c-U1** | **HEAD clean checkout 실동작** — 임시 worktree 로 HEAD 를 뽑아 `npm test`/`forge deploy` 가 실패하는지(현재는 import 그래프로만 증명). 조치 #1 후 성공하는지도 함께 |
| **P2c-U2** | `PROJECT_COST read` 없는 실계정으로 `/dashboard` 7지점이 실제로 사라지는지 |
| **P2c-U3** | N6 위젯 실기동 — 상위 10팀 + 기타 + 팀 미지정 렌더, 가동률 축 안내 문구 |
| **P2c-U4** | 인건비 축이 사라진 상태에서 Cost 탭 안내 문구가 실제로 보이는지(레이아웃 붕괴 없이) |
| **P2c-U5** | 이전 절들의 미검증 항목(§2 U-1~6 · §8-12 · §9-9 · §10-11 · §11-9) — **여전히 유효** |

---

## 12-12. 담당별 조치 요청

### 🚨 리더 — 배포 차단
1. **P2c-F1** — `CostAccess.js` 커밋 누락. §12-9 #1·#2 를 수행하기 전에는 **배포 금지**. clean checkout 시 전 resolver 가 죽는다.

### backend-engineer — 필수 0건
- 코드 자체는 검증 통과(19/19). 조치는 **커밋 범위**뿐이다(§12-9 #1·#2).

### frontend-engineer — 권장 1건
1. **P2c-F2** — `costGate.test.js` 의 검출력 보강. 합성 스니펫 대신 **실파일 변이**로 7지점을 검증하도록 교체(§12-2). 현재 #2 는 게이팅을 지워도 통과한다.
2. (선택) **P2c-O1** — `ComparisonTabs` 의 죽은 `salaryBuckets` prop 과 고아 위젯 2종을 U16 에서 함께 정리.
