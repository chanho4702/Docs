# 팀(Team) 개념 도입 설계서

> 작성: 2026-07-27 / feature-architect
> 입력: `_workspace/team-management/00_input/requirement.md` (단일 진실 원천)
> 확정 결정 D1~D4는 재논의하지 않는다. 본 설계서는 D1~D4를 전제로 R1~R7을 결정한다.
> **§3 경계면 계약 표가 backend / frontend / verifier의 단일 진실 원천이다.**

---

## 0. 요약 — 핵심 결정 8줄

| # | 결정 | 근거(요약) |
|---|------|-----------|
| S1 | 팀 마스터는 **KVS `team` 엔티티**, `users.team_key VARCHAR(50)` 컬럼, `project_team` MySQL 테이블 | `skill` 선례와 완전 동형(마스터=KVS, 다대다 매핑=MySQL). CLAUDE.md 저장소 선택 기준 준수 |
| S2 | 계층 롤업은 **앱 레벨 재귀**, 재귀 CTE 미채택 | 마스터가 KVS라 SQL 재귀 자체가 불가 + Forge SQL 제한 키워드 목록 비공개 + 리포 내 CTE 선례 0 |
| S3 | 권한 우선순위 = **개인 오버라이드 → 팀 fallback**(합집합 아님) | 합집합은 최소권한 위반·감사 불가. 팀 우선은 개인 예외 표현 불가 |
| S4 | `TEAM_ONLY`는 **`scopedProjectIds()` 내부에서 흡수** | 기존 소비자 6파일 무변경으로 스코프 확장 (최대 무회귀) |
| S5 | 프로젝트-팀 배정과 `projectusers`는 **별개 축**, 자동 동기화 없음 | 트랜잭션 부재 + `projectusers`가 투입급여/salary_type을 보유 → 자동생성 시 값 불명 |
| S6 | `portfolio_project_snapshot` **스키마 변경 없음** | 팀은 프로젝트 속성이 아닌 인원 속성. read-time 조인이 항상 최신이고 재집계 불필요 |
| S7 | 팀 미소속자는 기존 동작 **완전 무회귀**(ALL/MEMBER_ONLY 경로 무영향) | 마이그레이션 후 전원 `team_key=NULL` |
| S8 | 3단계 분할 **P0(마스터/소속) → P1(권한) → P2(배정/분석)**, 각각 독립 배포 | P0만 배포해도 기존 권한 판정 로직 1줄도 안 바뀜 |

---

## 1. 개요 / 영향 범위

### 1-1. 백엔드
| 구분 | 내용 |
|------|------|
| 신규 도메인 | `src/resolver/backoffice/team/` — `TeamController.js`, `TeamService.js`, `TeamRepository.js`, `TeamTree.js`(순수 함수), `TeamTreeCache.js` |
| 신규 쿼리 | `src/rdb/query/ProjectTeamQuery.js` (P2) |
| 신규 권한 정책 | `src/permission/TeamLeadFieldPolicy.js` (P1) — TEAM_LEAD write **allowlist** 단일 소스 (§R3-A) |
| 수정 | `src/permission/PrincipalResolver.js`, `permissionGuard.js`, `PermissionMap.js`, `ResourceCatalog.js`, `src/index.js`, `src/rdb/schema/ddl/`, `migrate.js`, `manifest.yml`, `src/trigger/onInstall.js`(SEED_VERSION), `src/nosql/query/CustomEntityManager.js`(findAllPaged 추가) |
| resolver 신규 | P0 8종, P2 4종(N1 `getTeamMemberCandidates` 포함), **P3 0종** = **총 12종** (전부 `PermissionMap` 등록 필수 — 누락 시 deny-by-default + 계약 테스트 실패) |
| resolver 응답 확장 | `userPermissionCheck`(P1), `getUserMetaCount`(P0), `getUserListWithPaging`(P0), `getResourceOverview`(P2), `getPortfolioDashboard`(P2) — **전부 필드 추가만, 기존 필드 불변** |

### 1-2. 프론트
| 구분 | 내용 |
|------|------|
| 신규 페이지 | `/backoffice/team` — `static/ui/src/backoffice/page/team/` |
| 수정 페이지 | `/backoffice/users`(팀 컬럼·필터·StatCard), `/backoffice/permission`(TEAM_ONLY 옵션), `/resource` 인력현황(팀 필터·컬럼), `/dashboard`(팀 위젯·필터), `프로젝트상세>인력`(담당 팀·일괄추가) |
| 스토어 | `usePermissionStore` — `team` 상태 + `isTeamLead()` 추가 |
| 쿼리키 | `backofficeKeys`에 팀 3키, `projectKeys`에 `projectTeams` 1키 |
| 라우팅 | `App.jsx` 1줄, `Sidebar.jsx` `backofficeItems` 1항목 |

### 1-3. DB
| 저장소 | 변경 |
|--------|------|
| KVS | 엔티티 **`team` 신규 1종** (현재 11종 → 12종, 20종 한도 내). manifest `attributes` 선언 필수 |
| MySQL | `users` **ALTER ADD COLUMN `team_key`** (v013), `project_team` **신규 테이블**(v014, P2). 앱 테이블 11종 → 12종 (200 한도 내) |
| 스냅샷 | `portfolio_project_snapshot` **변경 없음** (근거 §5-R5) |

### 1-4. i18n
신규: `locales/kr/team.json` + `locales/en/team.json`
수정: `common.json`, `permission.json`, `user.json`, `resource.json`, `portfolio.json`, `projectDetail.json` (kr/en 양쪽)
→ 이후 `cd static/ui && npm run merge` 필수. `locales/ko-KR.json`·`en-US.json` 직접 수정 금지.

---

## 2. R1~R7 결정과 근거

### R1. 계층 롤업 범위 — **하위 팀 포함(descendant rollup)**

**결정**
- `TEAM_ONLY` 스코프는 **자기 팀 + 모든 후손 팀**을 포함한다. 팀장은 추가로 **자신이 리더인 팀 + 그 후손**을 포함한다(두 집합의 합집합).
- 최대 깊이 `MAX_TEAM_DEPTH = 10`. 초과 서브트리는 롤업에서 제외 + `console.error` 로그.
- 순환 참조 방지 2중:
  - **쓰기 시 차단** — `updateTeam`에서 새 `parentTeamKey`가 자기 자신이거나 자기 후손이면 `TEAM_CYCLE_DETECTED` 거부. 깊이 초과 시 `TEAM_DEPTH_EXCEEDED` 거부.
  - **읽기 시 방어** — `buildTeamIndex()`가 조상 추적 `Set`으로 사이클을 감지하면, 해당 노드를 **루트로 강등**하고 `hasCycle:true`를 응답에 실어 보낸다. 사이클 서브트리의 `scopeTeamKeys` 산출은 **자기 팀만 포함**(fail-close — 넓게 보지 않는다).

**TiDB 재귀 CTE 확인 결과 — 미채택**

| 확인 항목 | 결과 |
|-----------|------|
| TiDB 엔진 자체 | `WITH RECURSIVE`는 TiDB **v5.1부터 지원**(MySQL 8.0 호환 CTE). 즉 엔진 레벨에서는 가능성이 있음 |
| Forge SQL 공식 문서 | `sql-limitations` 페이지는 **404**(존재하지 않음). `limits-sql`/`storage-reference/sql` 어디에도 CTE·WITH·RECURSIVE 언급 **없음**. "restricted keywords 전체 목록은 Forge SQL query policy 참조"라고만 되어 있고 **해당 문서 URL은 404** → 공식 확인 불가 |
| 리포 내 선례 | `src/` 전역 grep `WITH RECURSIVE` / `WITH ... AS (` → **0건**. CTE를 쓰는 코드가 하나도 없음 |
| 실행 제약 | Forge SQL SELECT 타임아웃 5초, 쿼리당 메모리 16MiB, "각 SQL 문은 단일 쿼리만" (CTE는 단일 문이라 이 제약은 무관) |

→ **미확정 — 확인 필요** 항목이지만, **설계는 이 확인 결과와 무관하게 앱 레벨 재귀를 채택**한다. 이유 3가지:
1. **S1에 따라 팀 마스터가 KVS에 있다.** 재귀 CTE는 SQL 테이블에만 적용 가능하므로 애초에 선택지가 아니다.
2. 문서화되지 않은 기능에 권한 판정 경로를 의존시키는 것은 fail-close 원칙과 충돌한다(정책 변경 시 전 사용자 권한 판정이 죽는다).
3. 팀 수는 O(10~100)이므로 전체 로드 후 인메모리 트리 구성이 재귀 CTE보다 빠르다.

**확인 방법(원한다면)**: `forge tunnel` 상태에서 임시 resolver를 하나 만들어
`executeQuery("WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t WHERE n < 5) SELECT SUM(n) AS s FROM t")`
를 실행 → `s = 15`면 지원. 결과와 무관하게 본 설계는 변경하지 않는다(참고 정보로만).

**앱 레벨 재귀 + 캐시 전략**

```
src/resolver/backoffice/team/TeamTree.js   — 순수 함수 (테스트 대상)
  buildTeamIndex(teams) → {
      byKey:        Map<teamKey, team>,
      childrenOf:   Map<teamKey, teamKey[]>,
      depthOf:      Map<teamKey, number>,
      pathOf:       Map<teamKey, teamKey[]>,   // 루트→자기
      rootKeys:     teamKey[],
      hasCycle:     boolean,
      cycleKeys:    teamKey[],
  }
  descendantsOf(index, teamKey, { includeSelf = true }) → teamKey[]
  isDescendant(index, ancestorKey, candidateKey) → boolean
  nearestAncestorWith(index, teamKey, predicate) → team | null   // 팀 권한세트 상향 탐색

src/resolver/backoffice/team/TeamTreeCache.js
  getTeamIndex()          — 모듈 스코프 캐시, TTL 60초. miss 시 KVS 전량 로드 후 buildTeamIndex
  invalidateTeamIndex()   — 모든 team write 직후 호출
```

**캐시 특성 — 권한 판정의 stale 허용치 (명시적 한계, 리뷰 반영 2026-07-27)**

`TeamTreeIndex`는 순수 최적화가 아니다. **`scopeTeamKeys` 산출과 `nearestAncestorWith`(팀 권한세트 fallback)의 입력**이므로 권한 판정의 정확성에 직접 관여한다. 정확히 다음과 같이 이해할 것:

> **권한 판정은 최대 90초 stale 을 수용한다** (기존 principal 캐시와 동일 성질).
> 내역: `TeamTreeCache` TTL 60초 + `PrincipalResolver` L1 TTL 30초 = 최악 90초.

- Forge는 컨테이너가 다중 인스턴스이므로 `invalidateTeamIndex()`는 **호출된 인스턴스에만** 적용된다. 다른 인스턴스는 자기 TTL이 만료될 때까지 옛 트리를 쓴다.
- 구체적 노출: 팀장 해제·팀 이동·팀 권한세트 변경 직후 최대 90초 동안 **옛 권한이 살아 있다**.
- 이것을 수용하는 근거: 기존 `PrincipalResolver`가 이미 "권한 변경 최대 ~30초 지연 전파(수용)"를 명문화하고 있고, 팀 도입은 그 성질을 30초에서 90초로 늘릴 뿐 **새로운 종류의 위험을 만들지 않는다**. 즉시 회수가 필요한 상황(퇴사 등)은 Jira 계정 비활성화가 1차 통제 수단이며, 그 경로는 캐시를 타지 않는다(`context.accountId` 자체가 사라짐).
- **"정확성은 캐시에 의존하지 않는다"는 표현을 이 캐시에 쓰지 말 것.** 그 문구는 `PrincipalResolver` L1 캐시(같은 입력 → 같은 결과)에만 해당한다.

**쓰기 경로는 캐시를 쓰지 않는다 — M1 대응 (읽기 90초 stale은 그대로 수용)**

위 stale 논의는 **읽기**에 대한 것이다. `TeamTreeIndex`는 **쓰기 검증(`updateTeam`의 사이클·깊이 판정)의 입력이기도 하며**, 여기서는 stale이 데이터 손상으로 이어진다.

> 시나리오 (동시 관리자 2명이 필요 없다 — **한 사람이 빠르게 두 번 옮기면 된다**)
> 1. 인스턴스 A에서 `A → B` 이동. A의 캐시만 무효화된다.
> 2. 곧이어 인스턴스 B로 라우팅된 요청에서 `B → A` 이동. B의 캐시엔 아직 옛 부모가 남아 있다 → **사이클 미검출 → 사이클이 데이터에 기록된다.**
>
> N2의 낙관적 DnD가 "조직개편 시 여러 팀을 연속으로 옮기는 것"을 사용 맥락으로 명시했으므로 발생 확률이 낮지 않다. 읽기 측 방어(루트 강등 + `hasCycle` 배너)가 있어 치명적이진 않지만, 사용자에겐 "정상적으로 옮겼는데 트리가 깨졌다"로 나타나고 배너는 원인을 설명하지 못한다.

**규칙: `addTeam` · `updateTeam` · `deleteTeam` · `addTeamMembersToProject`의 검증은 `getTeamIndex()`를 쓰지 않고 `buildTeamIndex(await findAllPaged())`로 즉시 로드한다.**
- 팀 쓰기는 빈도가 극히 낮아(조직 개편 시에만) KVS 커서 루프 1회 추가 비용이 무시 가능하다.
- `addTeamMembersToProject`가 포함된 이유는 M5 — 후보 목록과 서버 검증이 서로 다른 시점의 인덱스를 보면 정상 흐름에서 오탐이 난다(§3 N1 참조).
- 읽기 경로(`resolvePrincipal`, `getTeamList`, 분석 화면)는 **캐시를 계속 쓴다.** 90초 stale 수용은 변경 없다.

**팀 수 상한 / 커서 페이징**: `CustomEntityManager.findAll()`은 `.index('name').limit(100).getMany()` 고정으로 **100건 하드 캡**이다(커서 미사용). 팀은 100개를 넘길 수 있으므로 커서 루프 헬퍼를 추가한다. 커서 페이징 지원은 **실측 확인 완료**(§10 U2).

```
findAllPaged(indexName = 'name', pageLimit = 100, maxItems = MAX_TEAMS)
  → nextCursor 가 없을 때까지 반복 수집
  → 반환: { results, truncated }        // truncated = maxItems 도달로 중단됐는가
```
- 기존 `findAll()`은 **변경하지 않는다**(다른 도메인 회귀 방지). 신규 메서드만 추가.

**경계값 정의 (off-by-one 명시)** — `MAX_TEAMS = 500`을 단일 상수로 두고 양쪽이 같은 값을 참조한다.

| 지점 | 규칙 | 팀이 정확히 500일 때 |
|---|---|---|
| `addTeam` 가드 | 현재 팀 수 `>= MAX_TEAMS` 이면 `TEAM_LIMIT_EXCEEDED` 거부 (`>` 아님) | **501번째 생성 거부.** 500개는 정상 상태 |
| `findAllPaged` | `maxItems = MAX_TEAMS` 까지 수집. 수집 수가 `maxItems`에 도달했고 `nextCursor`가 **남아 있을 때만** `truncated: true` | 500개 전부 수집, `nextCursor` 없음 → **`truncated: false`** |

→ 두 규칙이 같은 상수를 보므로 "생성은 됐는데 트리에서 안 보이는" 구간이 존재하지 않는다. `truncated: true`는 **상수를 낮췄거나 KVS에 앱 외부 경로로 데이터가 들어온 이상 상황**에서만 발생한다.

**truncation 시 처리 — R1의 깊이 초과 처리와 동형 (silent truncation 금지)**

깊이 초과가 `console.error` + 서브트리 제외 + `hasCycle`/경고 노출이었던 것과 **같은 3요소**를 적용한다:
1. `console.error('[TeamTree] truncated: collected=%d, maxItems=%d — 트리가 불완전합니다', n, maxItems)`
2. `buildTeamIndex`는 수집된 부분집합으로 정상 동작한다. 잘린 방향은 **fail-close**(스코프가 좁아짐)이므로 권한 확대 사고는 아니다 — 다만 사용자에게는 "왜 우리 팀이 안 보이지"로 나타난다.
3. **응답에 실어 보낸다** — `getTeamList` 응답 `content.truncated: boolean`, `getTeamOptions` 응답 `content.truncated: boolean`. 프론트는 `truncated:true`면 트리 상단에 경고 배너를 띄운다(`hasCycle` 배너와 동일 위치·동일 컴포넌트).

→ 이로써 `truncated`는 `hasCycle`과 나란한 "데이터 이상 신호" 축이 된다. **둘 다 숨기지 않는다.**

### R2. 권한 우선순위 — **개인 오버라이드, 팀은 fallback**

**결정**
```
resolvePermissionSet(user, teamIndex):
  1. users.permission_key 가 NOT NULL      → 그 세트 사용            (source: 'personal')
  2. NULL 이고 team_key 가 있으면          → 자기 팀부터 루트 방향으로 상향 탐색,
                                             permissionKey 가 있는 가장 가까운 조상 팀의 세트 (source: 'team')
  3. 어느 쪽도 없으면                       → 전 리소스 false          (source: 'none', fail-close)
```
- **합집합 아님.** 한 번에 하나의 세트만 적용된다. `projectScope`도 그 세트의 값을 그대로 쓴다(스코프가 두 출처에서 섞이는 경우가 원천 차단됨).
- 세트 조회 실패(KVS 에러 등)는 기존과 동일하게 `mergeSetPages([])` → `defaultForNew` → 사실상 전부 false. fail-close 유지.

**근거**
- **합집합 기각**: 권한을 확대 방향으로만 움직인다. 팀에 넓은 세트를 붙이는 순간 그 팀 전원의 개인 제한이 조용히 무력화되고, "이 사람이 왜 이게 보이지"를 추적할 수 없다. 최소권한 원칙 위반.
- **팀 우선 기각**: 특정 개인에게 임시 상향/하향을 주는 운영 요구를 표현할 수 없다.
- **개인 우선 채택**: 판정 결과가 결정적이고 단일 출처라 감사 가능하다. `principal.permissionSource`로 어느 경로였는지 응답에 노출해 디버깅·표시에 쓴다.

**현행 데이터와의 정합 (중요)**
현재 `users.permission_key`는 사실상 항상 채워져 있다 — `addUserService`는 `permission?.value ?? await getMemberId()`, 엑셀 업로드도 `permissionMemberKey`를 강제한다. 따라서 **P1 배포 직후 팀 상속은 아무에게도 발동하지 않는다(= 무회귀)**. 팀 상속을 실제로 쓰려면 사용자 편집 UI에서 권한을 명시적으로 "팀 상속"으로 선택해 `permission_key = NULL`로 저장할 수 있어야 한다 → P1 백오피스 UI 작업에 포함. 신규 사용자 기본값은 **기존대로 Member 유지**(기본값 변경은 회귀 위험).

### R3. 팀장 판정의 가드 통합

**principal 확장** (`src/permission/PrincipalResolver.js`)
```js
{
  // ── 기존 (전부 불변) ──
  accountId, isAdmin, isUser, name, pages, resourceMap, projectScope, memberProjectIds,

  // ── 신규 ──
  teamKey:             string | null,   // 소속 팀 (users.team_key)
  teamName:            string | null,
  teamPath:            string[],        // 루트→자기 팀 키 배열. 미소속이면 []
  leadingTeamKeys:     string[],        // 내가 leaderAccountId 인 팀(직속). 없으면 []
  isTeamLead:          boolean,         // leadingTeamKeys.length > 0
  scopeTeamKeys:       string[],        // (자기팀+후손) ∪ (팀장팀+후손). 미소속·비팀장이면 []
  teamScopeAccountIds: string[] | null, // 팀장 write 대상. 아래 조건에서만 채움, 아니면 null
  permissionSource:    'personal' | 'team' | 'none',
}
```
- `memberProjectIds`의 **의미를 확장**한다(필드명은 유지 — 소비자 무변경):
  - `MEMBER_ONLY` → 본인이 `projectusers`에 있는 project_id (현행 그대로)
  - `TEAM_ONLY` → `project_team`에 `scopeTeamKeys`로 배정된 project_id **∪** `scopeTeamKeys` 소속 팀원들이 `projectusers`에 있는 project_id
  - 그 외 → `null`
- `teamScopeAccountIds`는 **`isTeamLead === true` 이거나 `projectScope === 'TEAM_ONLY'` 일 때만** 채운다. 그 외에는 `null`(= 쿼리 미발생).

**`scopedProjectIds()` 확장 — 이것이 R3/R4/R5를 관통하는 핵심**
```js
export const scopedProjectIds = (principal) => {
    if (!principal || principal.isAdmin) return null;
    if (principal.projectScope === 'MEMBER_ONLY') return principal.memberProjectIds || [];
    if (principal.projectScope === 'TEAM_ONLY')   return principal.memberProjectIds || [];
    return null;
};
```
이 한 곳만 고치면 **기존 소비자 6개 파일이 코드 1줄도 바뀌지 않은 채** TEAM_ONLY를 지원한다:
`permissionGuard.js`(enforceProjectScope), `PortfolioDashboardService.js:91`, `IssueAnalysisService.js:122`, `ProjectCalendarService.js:69`, `ProjectService.js:58,150,165,224`, `AssignmentProjectService.js:63,118`.
→ **회귀 위험 최소화의 결정적 근거.** 새 스코프 축을 서비스마다 분기시키지 않는다.

**`PermissionMap`의 팀장 표현 — 새 판정축 `teamLead`**

팀장은 보통 Member 세트라 `USER_MANAGEMENT.write`가 없다. 즉 리소스 grant만으로는 절대 통과할 수 없다. 따라서 **grants와 병렬인 OR 축**을 하나 추가한다(`TEAM_LEAD`를 카탈로그 리소스 키로 만들지 **않는다** — 팀장은 권한세트로 부여하는 것이 아니라 `team.leaderAccountId` 관계에서 파생되므로 리소스가 아니다).

```js
// PermissionMap 확장 형태 (기존 3형태에 옵션 필드 1개 추가)
{ grants:[{resource,action}], project, teamLead?: { targets: string[] } }
```
- `targets`는 payload에서 대상 accountId를 꺼낼 **키 이름의 명시적 화이트리스트**다. 추측 추출 금지(fail-close). 예: `updateUser`는 `['id']`, `setUserSkills`는 `['accountId']`.

**`permissionGuard.js` 변경**
```js
// 신규 — 팀장 경로 판정 (동기, principal 에 이미 적재된 집합만 사용)
export const isTeamLeadOver = (principal, meta, payload) => {
    if (!meta?.teamLead) return false;
    if (!principal?.isTeamLead) return false;
    const allowed = principal.teamScopeAccountIds;
    if (!allowed || allowed.length === 0) return false;      // 대상 집합 없음 → 거부
    const allowedSet = new Set(allowed);

    const targets = [];
    for (const key of meta.teamLead.targets) {
        const v = payload?.[key];
        if (Array.isArray(v)) targets.push(...v.filter(Boolean));
        else if (v) targets.push(v);
    }
    if (targets.length === 0) return false;                   // 대상 불명 → 거부(fail-close)
    return targets.every(id => allowedSet.has(id));
};

export const guard = (meta) => (handler) => async (req) => {
    const principal = await resolvePrincipal(req.context);

    const bySet  = isSatisfied(principal, meta);
    const byLead = !bySet && isTeamLeadOver(principal, meta, req.payload);

    if (!bySet && !byLead) throw new PermissionError(ErrorCodes.PERMISSION_DENIED, '...');

    enforceProjectScope(principal, meta, req.payload);   // 무변경 (TEAM_ONLY 는 scopedProjectIds 가 흡수)

    req.principal = principal;
    req.grantedBy = bySet ? 'RESOURCE' : 'TEAM_LEAD';    // 서비스가 추가 축소를 원할 때 참고
    return handler(req);
};
```
- 팀장 경로(`byLead`)로 통과했다면 **대상 검증이 이미 끝난 상태**이므로 서비스는 추가 검사 없이 진행 가능하다.
- 리소스 세트로 통과했다면(`bySet`) 팀 제한 없이 전체 대상 — 기존 관리자 동작 그대로 **무회귀**.
- `enforceTeamScope`라는 별도 함수를 만들지 않고 `isTeamLeadOver`를 grant 판정에 통합한 이유: 팀장은 "권한이 있는데 범위가 좁은" 게 아니라 "관계 때문에 비로소 권한이 생기는" 축이다. `enforceProjectScope`(통과 후 범위 축소)와는 성질이 다르다.

#### 팀장 축의 진입 화면을 먼저 정한다 — **H1 대응 (재설계)**

**실측된 문제**: 초안이 팀장에게 연 5개 resolver 중 **실제로 도달 가능한 것이 1개뿐**이었다. 팀장은 보통 Member 세트인데, 그 화면들의 **선행 read가 전부 막혀 있다.**

| resolver | 선행 read의 grant | Member 보유? | 결과 |
|---|---|---|---|
| `setUserSkills` | `getUserSkills` = OR[RESOURCE_MANAGEMENT read, USER_MANAGEMENT read] (`PermissionMap.js:228`) | 둘 다 `{read:false}` (`ResourceCatalog.js:54,60`) | **읽기 거부** |
| `updateUser`(직무·등급) | `getRoleList`/`getLevelList` = OR[X_MANAGEMENT read, USER_MANAGEMENT read] (`:50,58`) | 전부 false | **Select가 빈 채로 렌더** |
| `findUserByAccountId` | 진입점 `/backoffice/users` 목록 = `R('USER_MANAGEMENT')` | false | **목록을 못 봐 모달에 도달 불가** |
| `insertProjectusers` | — | — | **H2: targets 키 불일치로 항상 거부** |
| `removeProjectMemberByAccount` | 인력 탭 = `PROJECT read` | `{read:true}` (`:49`) | ✅ 유일하게 동작 |

추가로 `/resource`는 `RESOURCE_MANAGEMENT` 게이트라 팀장이 진입조차 못 하고, `/backoffice/*`는 전부 조직 관리자용이다. 즉 **§R3-C의 프론트 1차 방어("팀장 경로면 급여·권한 입력란 미렌더")는 팀장이 도달할 수 없는 화면에 구현될 뻔했다.**

> **원인**: 팀장 축을 **write resolver에만** 부여하고, 그 화면이 호출하는 **read resolver의 grant를 확인하지 않았다.** 이것을 §8 특별 주의에 규칙으로 못박는다.

**결정: 팀장 전용 진입점은 `/my-page`의 "내 팀" 섹션이다.** (신규, P1)

| 후보 | 판정 |
|---|---|
| `/backoffice/team` `TeamDetailPanel` | ❌ `TEAM_MANAGEMENT` read 게이트(Sidebar + 페이지). 팀장에게 열려면 백오피스 경계가 무너진다 |
| `/resource` 인력 현황 | ❌ `RESOURCE_MANAGEMENT` 게이트. 열면 전사 인원이 함께 열린다(H4와 충돌) |
| **`/my-page` "내 팀" 섹션** | ✅ **권한 게이트가 없는 개인 화면**이라 팀장이 반드시 도달한다. `usePermissionStore.isTeamLead()`가 P1에 이미 추가되므로 섹션 노출 조건이 자연스럽다. §R5 표 #8에 이미 "팀장이면 팀원 요약"이 있어 그 확장이다. **백오피스 경계를 훼손하지 않는다 — 팀장은 자기 팀만, 백오피스는 조직 전체** |

#### 팀장 축 최종 목록 (5키 → **범위를 좁히고 실제로 열리게 한다**)

`teamLead` 메타를 **두 종류의 대상 축**으로 확장한다. 각 키는 **명시적 화이트리스트**이며 추측 추출은 없다.

```js
teamLead: {
  accountTargets: ['accountId'],  // payload 키 → accountId. principal.teamScopeAccountIds 로 검증
  teamTargets:    ['teamKey'],    // payload 키 → teamKey.   principal.leadingScopeTeamKeys 로 검증
}
```
- `principal.leadingScopeTeamKeys` 신규 = **내가 리더인 팀 + 그 후손**(`scopeTeamKeys`의 부분집합. `scopeTeamKeys`는 소속팀까지 포함하므로 write 판정에 쓰면 자기 팀 전체에 write가 열려 과대하다).
- 두 축 중 **하나라도 해석되면** 그 축을 검증하고, **어느 축도 해석되지 않으면 거부**(fail-close, 기존 규칙 유지).

| resolver | 축 | 근거 |
|---|---|---|
| `findTeamById` | `teamTargets:['teamKey']` | **내 팀 상세 조회.** `/my-page` "내 팀" 섹션의 데이터 원천. `members[]`에 accountId·이름·직무·등급이 있어 팀원 목록에 충분하다 |
| `getUserSkills` | `accountTargets:['accountId']` | 스킬 편집의 **선행 read** — H1의 핵심 교훈. write와 반드시 동반 부여 |
| `setUserSkills` | `accountTargets:['accountId']` | 스킬 편집 (팀장의 핵심 실무) |
| `addTeamMembersToProject` | `accountTargets:['accountIds']` | 팀원 배정. payload가 **문자열 배열**이라 추출이 자연스럽다 (H2 대체) |
| `removeProjectMemberByAccount` | `accountTargets:['accountId']` | 배정 취소. 기존에 유일하게 동작하던 경로 — 유지 |

**초안에서 제거한 3키와 근거**

| 제거 | 근거 |
|---|---|
| `updateUser` (직무·등급) | **직무·등급은 인사 마스터 데이터로 조직 관리자(`USER_MANAGEMENT`) 소관**이다. 열려면 `getRoleList`/`getLevelList`까지 팀장에게 열어야 하는데, 그 두 키는 대상(target)이 없는 전역 목록이라 "팀장이면 무조건 통과"라는 검증 불가능한 축이 생긴다. **팀장의 실무는 스킬과 배정이다.** 부수 효과로 C1의 팀장 분기가 통째로 사라져 §R3-A의 위험면이 크게 준다 |
| `findUserByAccountId` | 진입점(`/backoffice/users` 목록)이 `USER_MANAGEMENT`라 도달 불가. 그리고 이 resolver는 **`salary`·`permissionKey`를 그대로 반환**한다(§R3-B). `findTeamById.members[]`로 필요한 정보가 충족되므로 **아예 열지 않는 것이 마스킹보다 강한 보호**다 |
| `insertProjectusers` | **H2**: 실제 payload가 `{project_id, jiraUser:[{value}]}`라 `targets:['accountIds']`가 매칭되지 않아 **항상 거부**된다(`ProjectUsersService.js:30`, `UserAddModal.jsx:14`, `ProjectAssignmentBoard.jsx:138`). `['jiraUser']`로 바꿔도 원소가 `{value}` **객체**라 `allowedSet.has(obj)`가 false다. 추출기(`pick: v => v.value`)를 도입하면 정책 표현이 복잡해지고 H3 위험이 커진다. → **N1의 `addTeamMembersToProject`로 대체**한다(payload가 문자열 배열, 진입점도 명확) |

**의도적 제외 (유지)**: `updateProjectMemberSalary`, `getProjectSalaryList`, `deleteByUserId`, `addUser`, `updateUser` — 재무 민감(`PROJECT_COST`) 및 계정 생명주기·인사 마스터는 팀장에게 열지 않는다.

**규칙 (§8 특별 주의 4번으로 승격)**: **팀장 축을 write resolver에 부여할 때, 그 화면이 호출하는 read resolver의 grant를 반드시 함께 확인하고 동반 부여한다.** 축을 write에만 붙이면 H1이 재발한다. 그리고 **부분 개방은 전면 차단보다 위험하다** — 예: `UserSkillEditModal`은 `getUserSkills`로 현재 스킬을 로드한 뒤 `setUserSkills`로 **전량 덮어쓴다.** read만 막고 write를 열면 `skillIds`가 `[]`로 남아 **저장 시 스킬이 전멸**한다.

#### R3-A. TEAM_LEAD write 필드 제약 — **allowlist** (리뷰 반영 2026-07-27)

> **블랙리스트(=특정 필드만 드롭) 방식은 채택하지 않는다. 권한 상승 구멍이다.**
> `updateUser` payload에 `permissionKey`가 실리면 팀장이 팀원을 Admin 세트로 승격시킬 수 있고, `teamKey`가 실리면 팀원을 다른 팀으로 빼돌릴 수 있다. 그리고 `users`에 컬럼이 추가될 때마다 드롭 목록을 갱신해야 하는 시한폭탄이다 — **새 컬럼의 기본값이 "통과"가 되기 때문이다.**

**규칙**: `req.grantedBy === 'TEAM_LEAD'` 이면, 서비스는 payload에서 **아래 allowlist에 명시된 키만** 취하고 **나머지는 전부 버린다.** 화이트리스트에 없는 키는 존재 자체가 무시된다.

```js
// src/permission/TeamLeadFieldPolicy.js (신규) — 정책을 가드 옆에 두어 단일 소스로 관리
export const TEAM_LEAD_WRITE_ALLOWLIST = Object.freeze({
    // 팀장 축이 붙은 모든 resolver 를 "제약 없음"이라도 반드시 등재한다 (H3).
    setUserSkills:                Object.freeze(['accountId', 'skillIds']),
    addTeamMembersToProject:      Object.freeze(['projectId', 'teamKey', 'includeDescendants', 'accountIds']),
    removeProjectMemberByAccount: Object.freeze(['projectId', 'accountId']),
    getUserSkills:                Object.freeze(['accountId']),
    findTeamById:                 Object.freeze(['teamKey']),
});

/** grantedBy 가 TEAM_LEAD 일 때만 payload 를 allowlist 로 좁힌다. 미등록 resolver 는 전부 드롭. */
export const applyTeamLeadFieldPolicy = (resolverName, payload, grantedBy) => {
    if (grantedBy !== 'TEAM_LEAD') return { payload, droppedFields: [] };

    // ★ 미등록 = 전부 차단 (H3). "통과"를 기본값으로 두지 않는다.
    const allow = TEAM_LEAD_WRITE_ALLOWLIST[resolverName] ?? [];

    const next = {};
    const dropped = [];
    for (const [k, v] of Object.entries(payload ?? {})) {
        if (allow.includes(k)) next[k] = v;
        else dropped.push(k);           // ← 새 컬럼이 생겨도 자동으로 "차단" 쪽에 떨어진다
    }
    return { payload: next, droppedFields: dropped };
};
```

**두 축 모두 deny-by-default다 — H3 대응**

초안은 컬럼 축만 막고 **resolver 축은 `if (!allow) return { payload }`로 전부 통과**시켰다. 이는 이 설계서가 블랙리스트를 기각하며 든 논거("새 것의 기본값이 통과가 된다")와 **정확히 같은 실패 모드**다. 지금은 `setUserSkills` 등이 "payload에 민감 필드가 없어 제약 불필요"라 의도적 미등록이었지만, **그 판단이 코드에 고정되지 않아** 나중에 필드가 하나 늘면 자동 통과한다.

→ **미등록 resolver는 payload 전체를 드롭한다.** 그리고 제약이 필요 없는 것들도 **명시 등재**해 "제약 없음"이 판단의 결과로 기록되게 한다. 등재를 잊으면 그 resolver는 **동작하지 않는다**(시끄러운 실패) — 조용히 열리는 것보다 낫다.

- **불변식 (두 겹)**: ① `users`에 새 컬럼이 생겨도 allowlist를 손대지 않는 한 팀장은 쓸 수 없다. ② `PermissionMap`에 새 `teamLead` 축을 붙여도 allowlist에 등재하지 않으면 **아무 필드도 통과하지 않는다.**
- **계약 테스트 (P1 필수)**: `PERMISSION_MAP`에서 `teamLead`를 가진 **모든 키**가 `TEAM_LEAD_WRITE_ALLOWLIST`에도 존재한다. 불일치 시 실패 → H2 유형의 키 오타도 부분적으로 잡힌다.
- **필드 테스트 (P1 필수)**: `applyTeamLeadFieldPolicy('setUserSkills', { accountId, skillIds, salary, permissionKey, 미래필드 }, 'TEAM_LEAD')` → 2키만 남고 3키 드롭. `grantedBy:'RESOURCE'`면 원본 그대로.
- `droppedFields`는 UX 조항(§R3-C)에서 응답에 실린다.

> **§4-9(C1)와의 관계**: allowlist 드롭은 payload에서 키를 **제거**한다. 그런데 `updateUserService`가 "미전달 = NULL"이었으므로 **드롭이 삭제가 되는** 결함이 있었다. §4-9의 read-merge 불변식("payload에 없는 필드는 변경되지 않는다")이 확립되어야 allowlist가 비로소 "차단"으로 동작한다. **두 조항은 함께여야 성립한다.** (현 설계에서 `updateUser`는 팀장 축에서 제거됐지만, 불변식 자체는 P0에서 필요하다.)

#### R3-B. TEAM_LEAD read 마스킹 — **제거보다 약한 보호이므로 "차단"으로 승격 (3차 갱신)**

> **갱신 요지**: `findUserByAccountId`는 H1(도달 불가)·§R3-B(재무 노출) 두 이유로 **팀장 축에서 완전히 제거**됐다(위 표). 열지 않는 것이 마스킹보다 강한 보호이므로, 아래 마스킹 조항은 **현 시점 호출 지점이 0이다.**
>
> 그럼에도 조항을 삭제하지 않고 **일반 규칙으로 승격해 남긴다**: **"팀장 축(`teamLead`)을 read resolver에 부여할 때, 그 응답에 `salary`·`permissionKey` 등 재무·권한 필드가 있으면 `grantedBy==='TEAM_LEAD'`에서 `null`로 마스킹한다(키 삭제 금지)."** 현재 팀장 축이 붙은 read 2종(`findTeamById`, `getUserSkills`)의 응답에는 해당 필드가 없어 **적용 대상이 없다.**
>
> **M8(마스킹 가시성 신호 `masked:[]`)도 같은 이유로 적용 대상이 없어 미반영**한다. 향후 마스킹이 실제로 도입되면 `droppedFields`와 대칭으로 `masked:[]`를 함께 넣는다.
>
> ⚠ **단, 재무 정보 노출 자체가 해소된 것은 아니다** — `findProjectusersByProjectId`(`R('PROJECT','detail')`, Member는 `PROJECT read=true`)가 `projectusers.salary`(투입급여)를 그대로 반환한다. 즉 팀장은 이미 프로젝트 인력 탭에서 팀원의 투입급여를 본다. 이는 **팀 도입 이전부터 존재한 기존 결함**이며 §10 U10에 기록했다.

<details>
<summary>원 조항 (호출 지점 0, 규칙 참조용 보존)</summary>

##### (원) TEAM_LEAD read 마스킹 — `findUserByAccountId`

**문제(실측 확인됨)**: `src/resolver/backoffice/user/UserService.js:226` `findUserByAccountIdService`의 반환 객체는 다음을 **그대로 싣는다**.
```js
/* 급여 */
salary: user.salary,
roleKey: user.role_key,
levelKey: user.level_key,
permissionKey: user.permission_key
```
→ `updateUser`의 write는 막아놓고 `findUserByAccountId`의 read는 열어둔 상태였다. **"재무 민감은 팀장에게 열지 않는다"는 선언과 모순이므로 반드시 막는다.**

**결정**
| 필드 | TEAM_LEAD 경로 | 근거 |
|---|---|---|
| `salary` | **`null`로 마스킹** | 연봉은 `PROJECT_COST` 급 재무 민감정보다. 팀장 역할의 정의(D2-②: 스킬·직무·배정 관리)에 급여 열람은 포함되지 않는다. 필드를 **삭제하지 않고 `null`로 둔다** — 프론트가 `salary` 키의 존재를 전제하고 있어 삭제하면 형태가 갈라진다(§8 "필드 추가만" 원칙의 이면) |
| `permissionKey` | **`null`로 마스킹** | write allowlist에서 막은 것을 read로 우회 정찰할 수 있으면 안 된다. 어떤 팀원이 어떤 권한세트인지는 조직 관리자 정보이며, 팀장이 편집할 수 없는 값을 볼 이유가 없다. **마스킹한다** |
| `permissionName` | (응답에 없음) | — |
| `roleKey` / `levelKey` | **그대로 노출** | 팀장이 편집할 수 있는 필드(allowlist)이므로 읽을 수 있어야 한다. 민감하지 않다 |
| `teamKey` / `teamName` | **그대로 노출** | 팀장이 자기 팀원을 조회하는 맥락이라 정보 가치가 없다 |
| 나머지(이름/아바타/생성·수정자·일시) | 그대로 | |

```js
// UserService.findUserByAccountIdService 말미 — grantedBy 를 인자로 받아 적용
const MASKED_FOR_TEAM_LEAD = ['salary', 'permissionKey'];
if (grantedBy === 'TEAM_LEAD') {
    for (const k of MASKED_FOR_TEAM_LEAD) dto[k] = null;
}
```
- `UserController`가 `guardedDefine(resolver, 'findUserByAccountId', ({ payload, grantedBy }) => findUserByAccountIdService({ ...payload, grantedBy }))` 로 전달한다.
- **`grantedBy === 'RESOURCE'`(기존 `USER_MANAGEMENT` read 보유자) 경로는 완전 무변경** — 기존 백오피스 사용자 관리 화면에 회귀가 없다.
- **테스트(P1 필수)**: `grantedBy: 'TEAM_LEAD'` → `salary === null && permissionKey === null && roleKey !== null`. `grantedBy: 'RESOURCE'` → 4필드 전부 원값.
- 마스킹은 **응답 조립 시점 1곳**에서만 한다. 서비스 내부 계산(있다면)은 원값을 쓰되 밖으로 나가는 DTO만 가린다.

</details>

#### R3-C. 드롭/마스킹의 가시성 — 조용한 실패 금지 (리뷰 반영 2026-07-27)

**문제**: 팀장이 급여를 입력하고 저장 → `{ success:true }` 응답 → 실제로는 드롭됨. 저장됐다고 믿게 된다. 프론트는 `grantedBy`를 알 방법이 없다. R3-A를 allowlist로 바꾸면서 드롭 대상이 `salary` 하나에서 여러 개로 늘었으므로 **더 중요해졌다.**

**2중 대응 (둘 다 한다)**
1. **서버 — 응답에 실어 보낸다.** `updateUser` 응답을 `{ success:true }` → `{ success:true, content:{ droppedFields:[] } }` 로 확장한다. 정상 경로(`RESOURCE`)에서는 항상 `[]`이므로 **기존 소비 코드에 회귀가 없다**(필드 추가만).
2. **프론트 — 애초에 입력란을 숨긴다.** 사용자 편집 모달이 `usePermissionStore.isTeamLead()`가 true이고 `canWrite('USER_MANAGEMENT')`가 false이면(= 팀장 경로로만 진입한 상태) **급여·권한·팀 입력란을 렌더하지 않는다.** 이것이 1차 방어이고, 1번은 안전망이다.
   - 그럼에도 `droppedFields`가 비어있지 않게 오면 경고 토스트를 띄운다(`team.error.fieldsDropped`). 프론트 게이팅이 서버 정책과 어긋났다는 신호이므로 삼키지 않는다.

> 원칙: **프론트 숨김은 UX, 서버 allowlist는 보안.** 둘 중 하나만 하지 않는다. 프론트 숨김이 뚫려도 서버가 막고, 서버가 막은 사실을 프론트가 사용자에게 알린다.

**성능 예산** (비admin cold principal, 캐시 미스 기준)

| 사용자 유형 | 기존 | 신규 | 증분 |
|---|---|---|---|
| ALL 스코프 · 비팀장 (**대다수**) | Jira 1 + users SQL 1 + KVS 1 | 동일 + `getTeamIndex()` | **KVS 0~1회** (60초 모듈 캐시 공유 → 워밍 후 사실상 0) |
| MEMBER_ONLY · 비팀장 | + projectusers SQL 1 | 동일 | 0 |
| TEAM_ONLY | — | + users SQL 1(팀원) + project_team SQL 1 + projectusers SQL 1 | +3 SQL |
| 팀장(스코프 무관) | — | + users SQL 1(팀원) | +1 SQL |

- 계층 재귀 결과는 `TeamTreeCache`가 **인덱스 통째로** 캐싱하므로 principal마다 재계산하지 않는다(`descendantsOf`는 O(서브트리)의 순수 메모리 연산).
- `PrincipalResolver`의 기존 30초 L1 캐시가 principal 전체를 담으므로 위 증분은 30초에 1회만 발생한다. **30초 캐시로 흡수된다.**
- `teamScopeAccountIds` 상한 **2000명**. 초과 시 `TEAM_SCOPE_TOO_LARGE` 에러로 fail-close(넓게 보여주는 방향으로 잘라내지 않는다).

**상한을 한쪽에만 건 이유 — `memberProjectIds`에는 캡이 없다 (리뷰 반영 2026-07-27)**

`teamScopeAccountIds`(사람)에는 2000 캡이 있는데 TEAM_ONLY의 `memberProjectIds`(프로젝트)에는 캡이 없다. 의도된 비대칭이며 근거는 다음과 같다.

| 축 | 상한 | 상한을 결정하는 것 |
|---|---|---|
| `teamScopeAccountIds` | **2000 (명시적 캡 필요)** | Jira 사이트의 사용자 수. 앱이 통제하지 못하며 대기업이면 수만 명이 될 수 있다. 본부 하나가 수천 명이면 `IN` 절이 실제로 위험해진다 → **외생적으로 무한** |
| `memberProjectIds` | **캡 없음 (구조적으로 유계)** | `project` 테이블의 행 수. 프로젝트는 앱이 만드는 엔티티이고 Forge SQL 1GiB / 200테이블 제약 하에서 실무상 O(100~1000) 규모다. 게다가 이 배열은 **두 출처의 합집합이지만 project_id 집합의 부분집합**이라 전체 프로젝트 수를 절대 넘을 수 없다 → **내재적으로 유계** |

→ 즉 캡이 없는 게 아니라 **`project` 테이블 크기가 곧 캡**이다. 별도 상수를 두면 "프로젝트가 늘었을 뿐인데 권한이 fail-close로 죽는" 더 나쁜 실패 모드가 생긴다.

**단, 관측은 남긴다**: `memberProjectIds.length > 1000` 이면 `console.warn('[PrincipalResolver] TEAM_ONLY scope is unusually wide: %d projects', n)`. 캡이 아니라 신호다 — 이 경고가 실제로 뜨기 시작하면 그때 스코프 산출을 `IN` 절에서 조인 기반으로 바꾸는 것을 검토한다(현 시점 불필요).

### R4. 프로젝트-팀 배정과 `projectusers`의 관계 — **별개 축으로 공존**

**결정**
- 팀을 프로젝트에 배정해도 `projectusers`에 **자동 추가하지 않는다.**
- `project_team` = **조직 차원의 담당 배정**("이 프로젝트는 어느 팀이 맡는가"). 표시·필터·권한 스코프용.
- `projectusers` = **실제 투입 인력**(공수·비용의 원천). 지금과 동일하게 유일한 SSOT.
- 실용적 브릿지: 팀 배정 UI에 **"이 팀의 팀원 N명을 인력으로 추가"** 명시적 버튼(`addTeamMembersToProject`) 제공. 1회성 벌크 삽입이며 이후 두 축은 독립. 자동 동기화가 아니다.

**근거**
1. **트랜잭션 부재**: 팀원 입/퇴사·팀 이동마다 `projectusers`를 동기화해야 하는데, Forge SQL은 트랜잭션이 없어 부분 실패 시 유령 행이 남는다. 그리고 어떤 행이 "팀 파생"이고 어떤 행이 "개인 배정"인지 구분할 출처 컬럼이 없어(추가하면 스키마·전 소비 코드 변경) 무엇을 지울지 판정 불가하다.
2. **`projectusers`가 개인 고유 속성을 보유**: `role_key`, `level_key`, `salary`(투입급여), `salary_type`(PROJECT|ANNUAL). 팀 배정으로 자동 생성하면 이 값들을 무엇으로 채울지 근거가 없고, 비용 계산(`EffectiveSalary`/`CostCalculator`/`PortfolioAggregator`)이 즉시 왜곡된다.
3. **소비 코드가 너무 넓다**(아래 전수 조사). 자동 추가는 이 전부에 회귀를 뿌린다.

**화면에서 두 출처를 합치는 규칙**
| 화면 | 규칙 |
|---|---|
| 프로젝트 상세 > 인력 탭 | 목록은 **`projectusers` 그대로**(무변경). 헤더에 담당 팀 뱃지 표시, 행에 그 사람의 소속 팀 컬럼 추가 |
| 분석(자원관리/포트폴리오/비용/리소스분석) | 팀 차원 = **투입 인력의 소속 팀(`users.team_key`)** 기준. `project_team`은 쓰지 않는다 |
| 프로젝트 목록/필터 | 팀 필터 = `project_team` 기준(담당 팀으로 프로젝트 찾기) |
| 권한 스코프(TEAM_ONLY) | 두 출처의 **합집합** — `project_team` 배정 ∪ 팀원의 `projectusers`. 근거: 마이그레이션 직후 `project_team`이 비어 있으므로 합집합이 아니면 TEAM_ONLY 사용자가 아무것도 못 본다 |

> 규칙 요약: **분석의 팀 축은 사람에서 나오고, 프로젝트 필터의 팀 축은 배정에서 나온다.** 한 컴포넌트에 두 종류 팀 객체를 넘기지 말 것(과거 `ScopeSplitCell` 회귀 사례 참조).

#### `projectusers` 소비 코드 전수 영향도 (파일 단위)

**결론: 아래 전부 무변경. `projectusers` 스키마·쿼리·응답 shape 어느 것도 건드리지 않는다.**

| 파일 | 용도 | 변경 |
|---|---|---|
| `src/rdb/schema/ddl/projectusers.sql.js` | DDL + salary_type ALTER | 무변경 |
| `src/rdb/query/ProjectUsersQuery.js` | 15키 | **키 1개 추가만** — `FIND_PROJECT_IDS_BY_ACCOUNTS(count)` (기존 `FIND_PROJECT_IDS_BY_ACCOUNT` 불변) |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | 12 export | **함수 1개 추가만** — `findProjectIdsByAccountsRepository(accountIds)` |
| `src/resolver/projectIssue/ProjectUsersService.js` | 인력 CRUD 10종 | 무변경. `addTeamMembersToProject`가 `insertProjectusersService`를 **재사용**(신규 삽입 로직 없음) |
| `src/resolver/projectIssue/ProjectUsersController.js` | resolver 12종 | 무변경 |
| `src/permission/PrincipalResolver.js` | `findProjectIdsByAccountRepository` | **변경**(TEAM_ONLY 분기 추가) |
| `src/resolver/workAssignment/WorkAssignmentService.js` | 멤버 accountId, 활성 프로젝트 수 | 무변경 |
| `src/resolver/resourceManagement/ResourceManagementService.js` | 참여이력·Overview·관계도 | **응답 필드 추가만**(`people[].teamKey/teamName`, `content.teamMeta`) |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | 등급/역할별 인원·급여 분포 | 무변경 |
| `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js` | `getProjectMemberRows` | 무변경 |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `MEMBER_ROWS` | **P3: `u.team_key` SELECT 추가**(컬럼 추가만, 시그니처 불변 — 파일 주석이 이 확장을 이미 허용) |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | 배치 members 조립 | **무변경**(§R5 근거) |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | read-time 조인 | **응답 필드 추가만**(`teamMeta`, `memberTeamMap`) |
| `src/resolver/projectCost/EffectiveSalary.js` | **P3: `resolveMemberSalaries` 반환에 `teamKey` 추가** | **M** — 포트폴리오 스냅샷(`PortfolioAggregator`)·급여 관리 탭(`getProjectSalaryListService`)이 공유한다. **필드 추가는 안전, 환산식 변경은 3개 도메인 파급** → 환산식 절대 불변 |
| `src/resolver/projectCost/ProjectCostService.js` | **P3: `byTeam` 1줄 추가** (응답 루트 + KVS 캐시) | **L** — `content` 래퍼 없는 루트 구조 유지 |
| `src/resolver/projectCost/CostCalculator.js` | **무변경** — `groupCostByKey`에 `'teamKey'`를 넘기기만 한다 | — |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | **P3: `getChartDataset`에 `case 'team'` + `getTeamChartData`** | **L** — switch `default`가 `[]`라 구버전 호환. `getChartDataService`(U9 버그 경로)는 건드리지 않는다 |
| `src/resolver/myWork/MyWorkRepository.jsx` · `MyWorkService.jsx` | 내 프로젝트 목록 | 무변경 |
| `src/rdb/query/UserSchedule.js` · `src/resolver/mySchedule/MyScheduleRepository.jsx` | 프로젝트 인력 일정 | 무변경 |
| `src/rdb/query/ProjectDashboard.js` (`GETSUMMARY`) | 인원수/총급여 | 무변경 |
| `src/resolver/storage/StorageQuery.js` | 테이블별 행수 | **선택적 추가** — `project_team` 행수 집계 1행 |
| `src/resolver/project/ProjectService.js` `deleteProjectService` | cascade 삭제 | **변경** — `project_team` DELETE 1단계 추가 (§4-3) |
| `src/resolver/project/ProjectRepository.js` | cascade repo | **함수 1개 추가** — `deleteProjectTeamsByProjectRepository` |
| `src/trigger/demoSeed.js` | 시드/리셋 | **선택적** — reset에 `project_team` DELETE 추가(누락해도 무해, 기존에도 `project_dashboard`/`project_skills`를 안 지움) |
| 프론트 15개 파일 (`ProjectUserPanel`, `UserAddModal`, `ProjectAssignmentBoard`, `SalaryManagementPage`, `ProjectUserSelect`, `JiraUserSelect` 등) | invoke 소비 | **무변경**. 인력 탭에 팀 컬럼 추가만 별도 |
| 테스트 3종 (`StorageService.test`, `recordIssueAssignedDate.test`, `PortfolioAggregatorAsApp.test`) | | 무변경 |

**부수 발견(설계 범위 밖, 리더 보고용)**: `UserRepository.deleteByAccountId`는 `users`만 지우고 `projectusers` 자식 행을 지우지 않아 고아 행이 남는다. 팀 도입으로 악화되지는 않지만(팀은 `users.team_key` 컬럼이라 계정과 함께 사라짐), 같은 회차에 고칠 가치가 있다.

### R5. 기존 분석 화면 확장 범위

**`portfolio_project_snapshot` 스키마 변경 — 불필요. 배치(`PortfolioAggregator`) 변경 없음.**

근거 4가지:
1. **축이 다르다.** 스냅샷은 `PRIMARY KEY (project_id)`, 즉 프로젝트 1행이다. 팀은 프로젝트에 N:M이므로 스칼라 컬럼으로 넣을 수 없고, 넣으면 행이 곱해지거나 대표팀 1개로 정보가 손실된다.
2. **팀은 인원 속성이다.** `members_json[i]`에 `teamKey`를 넣는 것은 가능하지만, 그러면 **팀 이동이 다음 일 배치(최대 24시간)까지 반영되지 않는다.** 조직 개편 직후 대시보드가 옛 팀으로 보이는 것은 명백한 결함이다.
3. **read-time 조인이 더 싸고 항상 최신이다.** `PortfolioDashboardService`가 `users` 1회 SELECT로 `accountId → team_key` 맵을 만들면 끝난다(`roleMeta`/`levelMeta`를 이미 read-time 조인으로 만들고 있는 것과 동일 패턴).
4. **스키마를 바꾸면 전체 재집계가 필요하다** — 기존 행은 `teamKey`가 없어 프론트 폴백이 필요해지고, 재집계 전까지 화면이 반쪽이 된다.

→ **결정: 스냅샷 무변경. 팀 차원은 전부 read-time 조인 + 클라이언트 필터.**

**팀 차원을 넣을 화면 (구체적 열거)**

| # | 화면 | 팀 UI | 백엔드 변경 | 팀 단위로 재집계할 지표 | 단계 |
|---|------|-------|------------|----------------------|------|
| 1 | `/resource` **인력 현황 탭**<br/>`pages/resource/overview/` | `ResourceFilters`에 팀 Select 1개 + "하위 팀 포함" 체크박스, 테이블에 팀 컬럼 | `getResourceOverview` → `content.people[].teamKey/teamName`, `content.teamMeta[]` 추가 | 인원수, 평균 가동률, 가동률 밴드 분포(idle/normal/over/red), 스킬 보유 분포 | **P2** |
| 2 | `/dashboard` **포트폴리오 Resource 탭**<br/>`pages/portfolio/tabs/ResourceTab.jsx` | `PortfolioFilterBar`에 팀 멀티셀렉트, 신규 위젯 `PortfolioTeamDist`(= `PortfolioRoleLevelDist` 동형) | `getPortfolioDashboard` → 루트에 `teamMeta`, `memberTeamMap` 추가 | 팀별 인원수, 팀별 투입 MD 합, 팀별 평균 가동률 | **P2** |
| 3 | `/dashboard` **포트폴리오 Cost 탭**<br/>`widgets/PortfolioCostByRoleLevel.jsx` | 그룹핑 축 토글에 "팀" 추가 | 위와 동일(추가 없음) | 팀별 인건비 합, 팀별 1인당 인건비 | **P2** |
| 4 | 프로젝트 상세 > **분석리포트 > 리소스 분석**<br/>`pages/projectDetail/analysisReport/resource/` | 인력 테이블에 팀 컬럼 + 팀 필터(클라이언트) | `getResourceAnalysisList` → 행에 `teamKey/teamName` 추가 | (재집계 없음 — 표시·필터만) | **P2** |
| 5 | 프로젝트 상세 > **인력 탭**<br/>`pages/projectDetail/user/ProjectUserPanel.jsx` | 헤더에 담당 팀 뱃지, 행에 소속 팀 컬럼, "팀원 일괄 추가" 버튼 | `getProjectTeams`(신규), `findProjectusersByProjectId` 행에 `teamKey/teamName` 추가 | (재집계 없음) | **P2** |
| 6 | `/backoffice/users` | 팀 컬럼 + 팀 필터 + 팀 StatCard | `getUserListWithPaging` → `teamKey/teamName`, `getUserMetaCount` → `team` 블록 | 팀별 인원수 | **P0** |
| 7 | `/resource` **배정 현황(관계도)**<br/>`pages/resource/allocation/` | 노드 색을 팀으로, 팀 필터 | `getResourceAllocationGraph` → 노드에 `teamKey` | (재집계 없음) | **P2 후반 — 선택** |
| 8 | `/my-page` | "내 팀" 표시, 팀장이면 팀원 요약 | `userPermissionCheck`의 `team` 재사용(추가 resolver 0) | (재집계 없음) | **P1 부수** |

**팀 단위로 재집계하지 않는 지표 (명시적 비목표)**
완성률·일정률·`diffPercentPoint`·`riskScore`·`scheduleRate` 등 **프로젝트 단위 진척 지표는 팀으로 분해하지 않는다.** 한 프로젝트를 여러 팀이 공유하므로 진척을 팀에 배분하려면 공수 비율 가정이 필요하고, 그 가정이 지표를 왜곡한다. UI에서 팀 필터를 걸면 **해당 팀 인원이 1명 이상 투입된 프로젝트로 목록을 좁힐 뿐**, 프로젝트 지표 자체는 프로젝트 전체 값 그대로 보여준다. 이 사실을 InfoTip으로 명시한다.

**필터 구현 위치**: 자원관리·포트폴리오의 기존 필터가 전부 클라이언트 사이드다. 팀 필터도 동일하게 클라이언트 `useMemo`로 구현하며 **resolver 시그니처를 바꾸지 않는다**(응답에 `teamKey`만 실리면 충분).

### R6. 마이그레이션 · 초기 데이터

**기존 데이터 영향**
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS team_key VARCHAR(50) NULL` → 기존 전 행 `NULL` = 팀 미소속. `salary_type` ALTER 선례와 동일 패턴이되 `NOT NULL DEFAULT` 대신 **NULL 허용**(팀 미소속이 정상 상태이므로).
- 기존 KVS·기존 테이블 데이터 변환 **없음**. 재집계 **없음**.

**팀 미소속자의 권한·분석 노출 규칙**

| 상황 | 동작 |
|------|------|
| `projectScope = ALL`, 팀 미소속 | **기존과 완전 동일**(팀 로직이 판정에 개입하지 않음) |
| `projectScope = MEMBER_ONLY`, 팀 미소속 | **기존과 완전 동일** |
| `projectScope = TEAM_ONLY`, 팀 미소속 | `scopeTeamKeys = []` → `memberProjectIds = []` → 목록 0건, detail 전부 `PERMISSION_PROJECT_SCOPE_DENIED`.<br/>⚠ **이 fail-close는 §4-2의 빈 집합 가드가 있어야만 성립한다.** 가드가 없으면 `whereIn([])`이 조건을 버려 **정반대로 fail-open**이 된다(C3). 가드는 선택 사항이 아니라 이 표의 전제다 |
| 개인 권한 미지정(NULL) + 팀 미소속 | 전 리소스 false (`permissionSource:'none'`) — 미등록 사용자와 동일 처리 |
| 분석 화면의 팀 필터 | "팀 미지정" 항목을 **명시적 옵션으로 제공**(`teamKey: null` 그룹). 숨기지 않는다 — 숨기면 합계가 안 맞는다 |
| 팀 관리 페이지 | 상단에 "팀 미지정 N명" 카운트 + 클릭 시 일괄 배치 모달 |

**운영 가드(UI)**: 백오피스 권한 페이지에서 어떤 세트의 `projectScope`를 `TEAM_ONLY`로 바꿀 때, 그 세트를 쓰는 사용자 중 팀 미소속자가 N명이면 **경고 배너**를 띄운다("N명이 아무 프로젝트도 볼 수 없게 됩니다"). 차단은 하지 않음(의도적 설정일 수 있음).

#### TEAM_ONLY의 적용 축 — **"내 팀원만 조회"는 비목표로 선언한다 (H4 대응)**

요구사항 D2-①은 "내 팀이 참여한 프로젝트·**내 팀원만** 조회 가능"이라고 적혀 있다. 본 설계는 **앞의 절반(프로젝트 축)만 구현하고, 뒤의 절반(인원 축)은 명시적 비목표로 선언한다.**

> **`TEAM_ONLY`는 프로젝트 축 스코프다. 인원 목록을 좁히지 않는다.**
> 인원 열람 통제는 `RESOURCE_MANAGEMENT` / `USER_MANAGEMENT` grant가 담당한다.

**근거**
1. **S4의 무회귀 이점이 인원 축에서는 성립하지 않는다.** 프로젝트 축은 `scopedProjectIds()` 한 곳을 고쳐 기존 소비자 6파일이 무변경이었다. 인원 축에는 그런 단일 병목이 없어 `getResourceOverview`·`getResourceProfile`·`getResourceAllocationGraph`·`getUserListWithPaging`·`getWorkAssignmentPool` 각각에 **행 필터**를 넣어야 한다. 이는 §8이 전제한 "필드 추가만" 무회귀 논증을 정면으로 깨뜨리고 위험 등급을 전면 재산정하게 만든다.
2. **grant로 이미 실질 통제가 된다.** 위 노출 화면들은 전부 `RESOURCE_MANAGEMENT` 또는 `USER_MANAGEMENT` read를 요구한다. 두 키는 시드 Member에서 **모두 `{read:false, write:false}`**다(`ResourceCatalog.js:54,60`). 즉 TEAM_ONLY 세트에 이 두 키를 주지 않으면 전사 인원 목록에 **애초에 접근할 수 없다.**
3. 남는 경로는 프로젝트 인력 탭(`findProjectusersByProjectId`, `PROJECT read` + `project:'detail'`)인데, 이는 **프로젝트 스코프로 이미 좁혀진다** — TEAM_ONLY 사용자는 자기 팀 프로젝트만 열 수 있으므로 거기 보이는 인원은 정의상 "내 팀이 참여한 프로젝트의 인력"이다. 요구의 취지에서 크게 벗어나지 않는다.

**운영 규칙(권한 페이지에 명시)**: **TEAM_ONLY 세트에는 `RESOURCE_MANAGEMENT` / `USER_MANAGEMENT` read를 부여하지 않는다.** 부여 시 권한 페이지에서 경고를 띄운다 — `permission.scope.TEAM_ONLY.peopleWarning`.
> "이 세트에 자원관리·사용자관리 조회 권한을 함께 주면 **전사 인원 목록**이 보입니다. TEAM_ONLY는 프로젝트 범위만 제한합니다."

**후속 검토 대상**: 인원 축 스코프가 실제로 필요하다고 판명되면 별도 단계(P4)로 다룬다. 그때는 `principal.teamScopeAccountIds`가 이미 산출돼 있으므로 필터 주입만 하면 되나, 위 5개 서비스의 회귀 검증이 본체가 된다.

**시드 데이터**
- **팀 마스터 시드 없음.** 조직 구조는 고객마다 다르므로 기본 팀을 만들지 않는다. `runSeed()`에 `addTeamSeed()`를 추가하지 않는다.
- **`SEED_VERSION` 7 → 8 은 필수.** 이유: `ResourceCatalog`에 `TEAM_MANAGEMENT`를 추가하면
  (a) `addPermissionSeed()`가 카탈로그에서 파생 재생성하는 Admin/Member 세트에 새 키를 넣어야 하고,
  (b) `migratePermissionSets()`가 커스텀 세트에 `defaultForNew`를 보충해야 한다.
  `runSeed()`는 `version >= SEED_VERSION`이면 스킵되므로 bump 없이는 둘 다 실행되지 않는다.
  → `src/trigger/onInstall.js`의 `export const SEED_VERSION = 8;`
  (Jira ADMINISTER 보유자는 `isAdmin` 바이패스라 무관하지만, **'Admin' 권한세트만 부여받은 비-Jira-admin**이 팀 관리에서 막히는 것을 방지하기 위해 필요하다.)
- `runSeed()` 자체 코드 변경은 없음(카탈로그가 바뀌면 자동 반영).

**배포 순서 (중요)**: `manifest.yml`의 KVS `team` 엔티티 선언은 `forge deploy` 없이는 반영되지 않는다(미선언 필드 저장 시 422 semantic error). **manifest → deploy → 코드 순서**를 반드시 지킬 것.

### R7. 백오피스 UI

**신규 `/backoffice/team`** — 좌 트리 / 우 상세 2패널 (프로젝트상세 작업관리 '트리' 뷰와 동일 골격)
```
TeamPage.jsx                       canRead('TEAM_MANAGEMENT') 게이트 → NoPermissionPage
 ├ <Backoffice subtitle description/>
 ├ 상단 바: [팀 미지정 N명] 뱃지 · (canWrite &&) [+ 팀 추가]
 └ 2패널 split (PANEL_HEIGHT='80vh')
    ├ TeamTreePanel.jsx      계층 트리 (접기/펼치기, 선택). DnD는 P0 비목표 — 상위 팀은 편집 모달에서 변경
    └ TeamDetailPanel.jsx    선택 팀: 이름/상위팀/팀장/권한세트/설명 + 팀원 목록 + [팀원 배치] [수정] [삭제]
 ├ modal/regist/TeamRegistrationModal.jsx  (+ useTeamRegistrationModal.js)
 ├ modal/edit/TeamEditModal.jsx            (+ useTeamEditModal.js) — 삭제 포함(ConfirmModal 사용)
 └ modal/member/TeamMemberAssignModal.jsx  (+ useTeamMemberAssignModal.js) — 미소속/타팀 사용자 검색 후 이동
buildTeamTree.js                   순수 함수 (build/flatten/collectParentIds) — 테스트 대상
```
- 트리 build/flatten은 **반드시 순수 함수로 분리**(`buildWorkTree.js` 선례). DnD는 P0에서 넣지 않는다(순환 검증 UX 비용 대비 이득 낮음).
- 모달 props는 리포 계약 고정: `{ isOpen, onClose, onSuccess }` (+ 편집은 `teamKey`). `invalidateQueries` 책임은 **페이지가 소유**.

**기존 `/backoffice/users` 확장** (P0)
- 테이블 팀 컬럼 추가, 검색바에 팀 Select 추가, StatCard 4번째(팀) 추가
- 등록/수정 모달에 팀 Select 추가

**기존 `/backoffice/permission` 확장** (P1)
- `projectScope` 옵션에 `TEAM_ONLY` 추가 + 위 경고 배너
- **팀 권한세트 할당 UI는 권한 페이지가 아니라 팀 관리 페이지에 둔다** — 팀 권한세트는 `team` 레코드의 `permissionKey` 속성이므로 팀 편집 모달의 Select 하나로 끝난다. 권한 페이지에는 참고용으로 "이 세트를 쓰는 팀 N개"만 표시.
- 사용자 편집 모달의 권한 Select에 **"팀 상속" 옵션**(= `permission_key = NULL`) 추가 → R2의 fallback을 실제로 쓸 수 있게 하는 유일한 진입점.

**"팀 상속" 선택 시 실효 권한 미리보기 (리뷰 반영 2026-07-27)**

R6에서 `TEAM_ONLY` 전환에는 경고 배너를 설계했으면서 "팀 상속" 선택에는 대칭되는 가드가 없었다. **같은 종류의 조용한 권한 상실이다**: `permission_key = NULL`로 저장했는데 그 사용자의 팀부터 루트까지 어느 조상 팀에도 `permissionKey`가 없으면 `permissionSource: 'none'` → **전 리소스 false**로 떨어진다.

→ 사용자 편집 모달에서 권한 Select 값이 "팀 상속"일 때 **아래에 한 줄 미리보기를 렌더한다.**

| 상황 | 표시 | 톤 |
|---|---|---|
| 조상 체인에서 세트를 찾음 | `현재 상속받게 될 권한: {세트명} ({조상 팀명})` | 안내 |
| 팀은 있는데 체인에 세트 없음 | `상속받을 권한이 없습니다 — 모든 권한을 잃게 됩니다.` | **경고** |
| 팀 미소속 | `팀에 소속되지 않아 상속받을 권한이 없습니다 — 모든 권한을 잃게 됩니다.` | **경고** |

- **추가 resolver 불필요.** 프론트가 이미 가진 두 데이터로 계산한다: `getTeamOptions`/`getTeamList`의 `teams[]`(각 팀의 `parentTeamKey`·`permissionKey`·`permissionName`)와 편집 대상의 `teamKey`. 조상 체인 상향 탐색은 `buildTeamTree.js`의 순수 함수를 재사용한다(백엔드 `nearestAncestorWith`와 **동일 규칙**).
- **주의 — 규칙 이중 구현**: 프론트 미리보기와 백엔드 `nearestAncestorWith`가 어긋나면 "미리보기는 A라는데 실제로는 B" 사고가 난다. 미리보기는 **표시 전용**이고 최종 판정은 서버다. 두 구현이 같은 규칙(가장 가까운 조상 우선, 깊이 10 제한)을 따르는지 P1 테스트에서 동일 픽스처로 대조한다.
- 차단은 하지 않는다(의도적 설정일 수 있음) — `TEAM_ONLY` 경고 배너와 동일한 정책.

---

## 3. 경계면 계약 표 (단일 진실 원천)

> **응답 규약**: 모든 team resolver 서비스는 `{ content: ... }` 를 반환하고, `responseWrapper`가 `{ success:true, ...result }`로 스프레드하므로 **최종 응답은 `{ success:true, content:{...} }`** 이다.
> 실패 시는 전역 규약대로 `{ success:false, error:{ name, code, message, cause } }`.
> 프론트는 **반드시 `res?.success`를 먼저 확인**한 뒤 `res.content`를 읽는다(`{success, ...rest}` 스프레드 계약 회귀 선례 있음).

### P0 — 팀 마스터 + 소속

| resolver | 입력 payload | 응답 shape (success, 글자 그대로) | 프론트 훅 / 쿼리키 |
|---|---|---|---|
| `getTeamList` | `{}` | `{ success:true, content:{ teams:[{ teamKey, name, parentTeamKey, depth, sortOrder, description, leaderAccountId, leaderName, leaderAvatarUrls, permissionKey, permissionName, memberCount, descendantMemberCount }], unassignedCount, hasCycle, cycleKeys, truncated }}` | `useTeamTree()` / `backofficeKeys.teams()` |
| `findTeamById` | `{ teamKey }` | `{ success:true, content:{ team:{ teamKey, name, parentTeamKey, sortOrder, description, leaderAccountId, leaderName, leaderAvatarUrls, permissionKey, permissionName }, ancestors:[{ teamKey, name }], children:[{ teamKey, name, memberCount }], members:[{ accountId, userName, userAvatarUrls, roleKey, roleName, levelKey, levelName, isLeader }] }}` | `useTeamDetail(teamKey)` / `backofficeKeys.findTeams(teamKey)` |
| `getTeamOptions` | `{}` | `{ success:true, content:{ options:[{ value, label, depth, parentTeamKey }], truncated }}` | `useTeamOptions()` / `backofficeKeys.teamOptions()` |
| `addTeam` | `{ name, parentTeamKey, leaderAccountId, permissionKey, description }` | `{ success:true, content:{ teamKey }}` | `useTeamRegistrationModal()` — mutation |
| `updateTeam` | `{ teamKey, name, parentTeamKey, leaderAccountId, permissionKey, description, sortOrder }` | `{ success:true }` | `useTeamEditModal()` — mutation |
| `deleteTeam` | `{ teamKey }` | `{ success:true, content:{ detachedUserCount, reparentedTeamCount, removedProjectAssignCount, permissionLostCount, inheritanceChangedCount }}` | `useTeamEditModal()` — mutation |
| `assignUsersToTeam` | `{ teamKey, accountIds:[] }` | `{ success:true, content:{ movedCount }}` | `useTeamMemberAssignModal()` — mutation |
| `unassignUsersFromTeam` | `{ accountIds:[] }` | `{ success:true, content:{ removedCount }}` | `useTeamMemberAssignModal()` — mutation |

`null` 규약 (모호성 제거):
- `parentTeamKey`: 루트 팀이면 **`null`**(응답). KVS 저장은 빈 문자열 `''`, 서비스가 응답 조립 시 `|| null`로 정규화.
- `leaderAccountId` / `permissionKey` / `description`: 미지정이면 **`null`**.
- `leaderName` / `leaderAvatarUrls`: Jira 조회 실패 또는 리더 미지정이면 **`null`**(에러 아님).
- `depth`: 루트 = **`0`**.
- `memberCount`: 그 팀 직속 인원. `descendantMemberCount`: **자기 팀 포함** 서브트리 전체 인원.
- `truncated`: `findAllPaged`가 `MAX_TEAMS` 도달로 중단됐는가. **정상 상태에서는 항상 `false`**이며 키는 항상 존재한다(§R1 경계값 정의). `true`면 프론트가 `hasCycle`과 동일한 경고 배너를 띄운다.
- `getTeamList` 응답에 **`content.limits: { maxDepth, maxTeams }`**가 함께 실린다(M6). 프론트는 깊이·개수 한계를 **여기서만** 읽고 리터럴 상수를 두지 않는다. P3-B의 DnD 판정도 이 값을 인자로 받는다.
- `permissionLostCount`(`deleteTeam`): 해제된 팀원 중 `permission_key IS NULL`(팀 상속)이라 **전 권한을 잃게 된 인원 수**. `inheritanceChangedCount`: 후손 팀 상속자 중 **실효 권한 세트가 바뀐 인원 수**(H5).

#### 팀 필터 입력값 도메인 (M3 대응 — 3상태를 반드시 구분)

`whereEq(col, null)`은 **조건을 통째로 버린다**(`QueryBuilder.js:34-38`). 따라서 "팀 미지정" 필터를 `teamKey: null`로 보내면 **필터가 사라져 전체가 반환된다.** 사용자는 필터가 걸린 줄 알고 숫자를 읽게 된다. §R6이 "팀 미지정을 명시적 옵션으로 제공한다"고 했으므로 이 경로는 실제로 쓰인다.

> **팀 필터 파라미터의 값 도메인은 정확히 3상태다.**

| 값 | 의미 | 백엔드 처리 |
|---|---|---|
| `undefined` (키 부재) | **전체** (필터 미적용) | `whereEq` 생략 |
| `'<teamKey>'` | 해당 팀 | `whereEq('team_key', key)` |
| `'__NONE__'` (센티넬) | **팀 미지정** | **`whereRaw('team_key IS NULL')`** — `whereRaw`는 `QueryBuilder`에 이미 존재(`:58-62`)하므로 신규 메서드 불필요 |

- `null`을 이 파라미터에 **절대 보내지 않는다.** 프론트 Select의 "팀 미지정" 옵션 `value`는 `'__NONE__'` 문자열이다.
- 적용 대상: `getUserListWithPaging`, `downloadExcel`, 그리고 팀 필터를 받는 모든 신규/기존 목록 resolver.
- `whereIn`은 `null`/`''`를 걸러내지만(`:48`) `'__NONE__'`은 통과시키므로, **`whereIn` 경로에 센티넬을 섞지 않도록** 팀 필터는 단일값 파라미터로만 받는다.

### P1/P2 — 기존 resolver 응답 확장 (TEAM_LEAD 경로 전용)

| resolver | 변경 | 조건 | 프론트 |
|---|---|---|---|
| `updateUser` | `{ success:true }` → `{ success:true, content:{ droppedFields:[] } }` | **항상** 키 존재. `grantedBy==='RESOURCE'`면 언제나 `[]` (기존 소비 코드 무회귀) | 비어있지 않으면 경고 토스트(`team.error.fieldsDropped`) |
| `findUserByAccountId` | `salary`·`permissionKey`가 **`null`로 마스킹** | `grantedBy==='TEAM_LEAD'` 일 때만. `'RESOURCE'` 경로 완전 무변경 | 팀장 경로에서는 해당 입력란 자체를 렌더하지 않음(§R3-C) |

> **verifier 주의**: 이 두 건은 "필드 추가/값 마스킹"이므로 shape은 불변이다. `findUserByAccountId`에서 `salary` 키를 **삭제하지 않는다**(삭제하면 `RESOURCE`/`TEAM_LEAD` 두 경로의 응답 형태가 갈라져 §8-2 "다중 shape 재사용 컴포넌트" 회귀 패턴에 걸린다).

### P0 — 기존 resolver 응답 확장 (필드 추가만, 기존 필드 불변)

| resolver | 추가 필드 | 위치 |
|---|---|---|
| `getUserListWithPaging` | `teamKey`, `teamName` | `content[i]` (`mapUserRowsToDto` 반환 객체) |
| `findUserByAccountId` | `teamKey`, `teamName` | 루트 반환 객체 |
| `getUserMetaCount` | `team: [{ id, name, count }]` (`id:null` = Unassigned, `mapCountWithMeta` 규약 동일) | 루트 |
| `addUser` / `updateUser` | 입력에 `teamKey` 수용 (`null` 허용) | payload |

### P1 — 권한 확장 (신규 resolver 0)

| resolver | 입력 | 응답 shape (변경분만) | 프론트 |
|---|---|---|---|
| `userPermissionCheck` | `{}` (PUBLIC) | 기존 `{ isUser, name, projectScope, pages }` + **`team:{ teamKey, teamName, isTeamLead, leadingTeamKeys:[], permissionSource }`** | `usePermissionStore.loadPermissions()` → `team` 상태 + `isTeamLead()` |

- `projectScope`는 값 도메인이 `'ALL' | 'MEMBER_ONLY' | 'TEAM_ONLY'`로 **확장**된다(필드 형태 불변).
- 팀 미소속이면 `team: { teamKey:null, teamName:null, isTeamLead:false, leadingTeamKeys:[], permissionSource:'personal' }`. **`team` 키 자체는 항상 존재**(프론트 optional chaining 부담 제거).

### P2 — 프로젝트-팀 배정

| resolver | 입력 payload | 응답 shape (success, 글자 그대로) | 프론트 훅 / 쿼리키 |
|---|---|---|---|
| `getProjectTeams` | `{ projectId }` | `{ success:true, content:{ teams:[{ teamKey, name, isPrimary, memberCount, assignedMemberCount }] }}` | `useProjectTeams(projectId)` / `projectKeys.projectTeams(projectId)` |
| `setProjectTeams` | `{ projectId, teamKeys:[], primaryTeamKey }` | `{ success:true, content:{ savedCount }}` | mutation → `invalidateQueries(projectKeys.projectTeams(projectId))` |
| `getTeamMemberCandidates` | `{ projectId, teamKey, includeDescendants }` | `{ success:true, content:{ candidates:[{ accountId, userName, userAvatarUrls, roleKey, roleName, levelKey, levelName, teamKey, teamName, alreadyAssigned }], total, assignedCount }}` | `useTeamMemberCandidates(projectId, teamKey, includeDescendants)` / `projectKeys.teamMemberCandidates(projectId, teamKey, includeDescendants)` |
| `addTeamMembersToProject` | `{ projectId, teamKey, includeDescendants, accountIds }` | `{ success:true, content:{ addedCount, skippedCount, requestedCount }}` | mutation → `projectKeys.projectTeams` + 인력 탭 목록 + `teamMemberCandidates` invalidate |

- `assignedMemberCount`(`getProjectTeams`): 그 팀 인원 중 이미 `projectusers`에 있는 수 (버튼의 "N명 추가 가능" 표시용).
- `alreadyAssigned`(`getTeamMemberCandidates`): 이 사람이 이미 `projectusers`에 있는가. **서버가 판정한다** — 프론트가 두 목록을 교차시키면 구현이 갈린다.

#### N1. `addTeamMembersToProject` 입력 규약 (2차 요구 반영 2026-07-27) — 모호성 제거

**두 모드가 하나의 resolver를 공유한다. `accountIds`의 존재 여부가 모드를 결정한다.**

| `accountIds` | 모드 | `includeDescendants` | 배정 대상 |
|---|---|---|---|
| `undefined` / `null` (키 부재) | **팀 전체** | **적용됨** | `true`면 `teamKey` + 모든 후손 팀의 인원, `false`면 `teamKey` 직속 인원만 |
| 길이 ≥ 1 배열 | **개별 선택** | **무시됨** (명시 선택이 항상 이긴다) | `accountIds` 그대로 |
| `[]` (빈 배열) | — | — | **`TEAM_MEMBER_SELECTION_EMPTY` 거부** |

- **빈 배열을 "전체"로 해석하지 않는다.** 체크박스를 모두 해제한 상태에서 실행 버튼이 눌리는 UI 버그가 곧바로 "팀 전원 배정"으로 폭발하기 때문이다. 의도 없는 대량 변경은 거부한다(fail-close).
- `includeDescendants` 기본값 `false`.

**서버 검증 (fail-close, 부분 성공 없음)**
```
allowedAccountIds = descendantsOf(teamIndex, teamKey, { includeSelf:true })
                    에 속한 팀들의 users.team_key 소속 인원   ← 모드와 무관하게 항상 후손까지
```
1. `teamKey`가 존재하지 않으면 `TEAM_NOT_FOUND`.
2. 개별 선택 모드에서 `accountIds` 중 **하나라도** `allowedAccountIds`에 없으면 → **요청 전체를 `TEAM_MEMBER_NOT_IN_SCOPE`로 거부.** 스코프 밖 인원을 조용히 건너뛰지 않는다(§R3-C의 "조용한 실패 금지"와 동일 원칙).
   - **전체 거부 정책은 유지한다** — 부분 성공이 더 나쁘다(무엇이 반영됐는지 사용자가 알 수 없다).
   - ⚠ **그러나 이것은 위변조뿐 아니라 정상 흐름에서도 발생한다 (M5).** 후보 목록(`getTeamMemberCandidates`)과 서버 검증은 **서로 다른 시점의 팀 인덱스**를 볼 수 있다(React Query staleTime + `TeamTreeCache`). 조직 개편 중이거나 다른 관리자가 동시에 팀을 옮기면 화면에서 고른 사람이 검증에서 탈락한다. 따라서:
     - **검증은 캐시를 우회한 즉시 로드로 한다** (§R1 쓰기 경로 규칙에 `addTeamMembersToProject` 포함 — M1과 같은 처방).
     - **`error.cause`에 위반 `accountId` 배열을 담는다.** 최대 500명 목록에서 단일 에러 코드만 주면 사용자가 범인을 찾을 수 없다. 프론트는 해당 행을 하이라이트하고 목록 새로고침을 유도한다.
     - **문구를 위변조 뉘앙스에서 정상 오탐 뉘앙스로 바꾼다** — "선택한 인원 중 이 팀 소속이 아닌 사람이 있습니다"(❌) → **"{count}명의 팀 소속이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요."**(✅)
3. `accountIds.length > 500`이면 `TEAM_ASSIGN_BATCH_TOO_LARGE`. 근거: Forge 요청 1MiB / INSERT 타임아웃 10초. UI는 500명 초과 팀에서 페이지 단위로 나눠 실행한다.

> **검증 집합이 항상 후손까지인 이유**: 개별 선택 UI는 "팀 + 하위 팀"을 트리로 펼쳐 보여주고 거기서 고르게 한다. 따라서 후손 인원이 `accountIds`에 들어오는 것은 **정상**이다. `includeDescendants`는 "전체 모드에서 어디까지 담을지"만 결정하며, 검증 범위와는 별개 축이다. 팀 트리 **밖**의 인원은 어느 모드에서도 절대 통과하지 못한다.

**구현 — 기존 자산 재사용 (S5 유지, 별도 저장 축 없음)**
- 결과물은 **`projectusers` 행 추가뿐**이다. `project_team`은 건드리지 않는다(담당 팀 배정과 인력 투입은 별개 축 — §R4).
- `insertProjectusersService({ project_id, jiraUser }, { accountId })`를 **그대로 호출**한다. 시그니처가 `jiraUser: [{ value: accountId }]`이므로 어댑터 1줄:
  `jiraUser: targets.map(id => ({ value: id }))`
- `ProjectUsersQuery.INSERT`가 `INSERT ... SELECT ... WHERE NOT EXISTS(...) AND account_id IN (...)` 구조라 **완전 멱등**이고, `users.role_key / level_key / salary`를 `projectusers`로 복사한다 → **기존 단건 추가와 의미가 100% 동일**. 새 의미를 만들지 않는다.
- 카운트 산출: `addedCount = result.rowsAffected ?? 0`, `requestedCount = targets.length`, `skippedCount = requestedCount - addedCount`.
  `skippedCount`는 **"이미 배정돼 있어 건너뜀"만을 뜻한다**(정상·멱등). 스코프 위반으로 인한 누락은 위 2번에서 이미 전체 거부되므로 이 숫자에 절대 섞이지 않는다.
- `insertProjectusersService`는 미등록 사용자에 `UNREGISTERED_USER`를 던지지만, 팀원은 정의상 `users` 행이 있어야 `team_key`를 가질 수 있으므로 이 경로는 발생하지 않는다(방어적으로 남겨둔다).

### P2 — 분석 화면 응답 확장 (필드 추가만)

| resolver | 추가 필드 | 위치 |
|---|---|---|
| `getResourceOverview` | `teamKey`, `teamName` | `content.people[i]` |
| `getResourceOverview` | `teamMeta: [{ id, name, parentTeamKey, depth }]` | `content` |
| `getResourceProfile` | `teamKey`, `teamName` | `content.profile` |
| `getPortfolioDashboard` | `teamMeta: { "<teamKey>": "<name>" }` (roleMeta/levelMeta와 동형 객체 맵) | 루트 |
| `getPortfolioDashboard` | `memberTeamMap: { "<accountId>": "<teamKey|null>" }` | 루트 |
| `getResourceAnalysisList` | `teamKey`, `teamName` | 인력 행 |
| `findProjectusersByProjectId` | `teamKey`, `teamName` | 행 |
| `getResourceAllocationGraph` | `teamKey` | 사람 노드 (선택) |
| `getProjectCalendarWorklog` | `memberTeamMap`, `teamMeta` (**N5**) | 루트 (`data`와 나란히) |
| `getPortfolioDashboard` | `costMasked: boolean` (**N6 — U12 동반 수정**) | 루트 |

> **`memberTeamMap` / `teamMeta`는 이 설계서의 공용 관용구다.** `getPortfolioDashboard`·`getProjectCalendarWorklog` 두 곳이 **글자 그대로 같은 형태**를 쓴다. 새로 발명하지 말 것.
> - `memberTeamMap: { "<accountId>": "<teamKey>" }` — **팀 미소속자는 키를 넣지 않는다**(`null` 값 금지). 조회 측은 `memberTeamMap[accountId] ?? null`로 읽는다. 근거: U3에서 배운 것과 같은 계열 — **없음을 빈 값으로 표현하지 말고 부재로 표현한다.**
> - `teamMeta: { "<teamKey>": "<name>" }` — `roleMeta`/`levelMeta`와 동형 객체 맵(`PortfolioDashboardService`의 기존 관례).

#### 팀 지표 단일 정의 (P2 증분, 2026-07-28) — **N6·N7과 다음 회차 `/resource` 조직 현황이 공유하는 계약**

> 이번 회차부터 **팀 단위 지표를 쓰는 화면이 셋**이 된다: ① `/my-page` 내 팀(N7, 자기 팀 한정) ② `/dashboard` 팀 비교(N6, 전사) ③ `/resource` 조직 현황(다음 회차, 전사).
> **스코프만 다르고 산식은 같아야 한다.** 아래가 그 단일 계약이다. 세 화면은 이것만 소비하고 **자체 계산을 하지 않는다.**

**🔴 실측 결과 — "이미 단일"이 아니었다. 가동률 3종 · 완수율 4종 · MM 환산 3종이 공존한다**

전수 조사(`src/`+`static/ui/src/`) 결과, 같은 이름의 지표가 **서로 다른 분모**로 계산되고 있었다. 팀 축을 붙이기 전에 **어느 것을 쓸지 확정**해야 한다.

**가동률 — 3종**

| # | 위치 | 분자 | 분모 | 사람당 값 개수 |
|---|---|---|---|---|
| **①글로벌** | `PortfolioAggregator.computeGlobalUtilization`(`:172-215`) | Σ 전 프로젝트 워크로그 MD | **참여 구간 union**의 근무일 − 휴가. 진행중은 오늘로 클램프 | **1개** (전사 기준) |
| **②프로젝트 내** | `PortfolioAggregator.js:353-358` | 그 프로젝트 워크로그 MD | **그 프로젝트 경과 근무일** − 휴가, 하한 0.1 | 참여 프로젝트 수만큼 |
| **③분석탭** | `ResourceAnalysisTable.jsx:111-115` (**프론트 실시간**) | 조회기간 워크로그 MD | **조회기간 전체 근무일** − 휴가. **클램프 없음** | 조회 단위 |

②와 ③은 진행중 프로젝트에서 **반드시 다른 값**을 낸다(경과분 vs 전체분). 그런데 UI 라벨은 셋 다 "가동률"이다.

> **결정 A — 팀 가동률은 ①글로벌만 쓴다.**
> ②는 **사람당 값이 여러 개**라 팀 롤업이 정의되지 않는다(한 사람이 3개 프로젝트에 있으면 util이 3개다. 평균? 합? 어느 것도 의미가 없다). ③은 프로젝트/기간 스코프 전용이다.
> **①만이 "사람당 정확히 1값"이라 팀 단위로 합산 가능**하다.
>
> ⚠ **이 결정이 §N6의 초안을 정정한다.** 초안은 N6가 `projects[].members[].utilization`(=②)을 쓴다고 적었는데, 그러면 N7(①)과 **같은 팀·같은 기간에 다른 값**이 나온다. 포트폴리오 응답에는 **①도 함께 실려 있다**(`utilization.people[]`, `PortfolioDashboardService.js:164-185`) → **N6는 `utilization.people[]`을 쓴다.** `projects[].members[].utilization`은 프로젝트별 막대(`memberUtilization`) 전용으로 남긴다.

**투입 공수 — MD는 단일, MM은 3종**

| 단위 | 상태 |
|---|---|
| **MD** = `sec / (hourRate × 3600)` | **정의 단일**(`CALCULATION.md:13` 문서화). 코드상 ~15곳 복제지만 **값이 전부 동일** — 드리프트 위험만 있고 현재 divergence 0 |
| **MM** | **분모 3종** — ⓐ경과기간 월평균 근무일(`actual_mm`, 배치, **이슈 timetracking 기반**) ⓑ조회기간 월평균 근무일(분석탭, **워크로그 기반**) ⓒ달력 30.4375일(`EffectiveSalary.js:12`, 급여 월할 전용) |

> **결정 B — 팀 공수 축은 MM이 아니라 MD를 쓴다.**
> MM 분모가 **기간에 의존**하므로 프로젝트를 가로질러 합산하면 정의가 성립하지 않는다(각 프로젝트의 분모가 다르다). ⓐ와 ⓑ는 **분자 출처(이슈 timetracking vs 워크로그)마저 다르다.**
> **MD는 가산적이고 정의가 단일**하다. 라벨은 **`투입 공수(MD)`**.
> ⚠ 요구는 "투입 공수(MM)"였으나 **MM으로는 팀 합산이 성립하지 않는다**는 실측 근거로 MD를 택한다. 화면에 MM이 꼭 필요하면 **팀 단위 MM은 제공하지 않고** 프로젝트 단위 `actual_mm`을 그대로 보여준다(합산하지 않는다).

**완수율 — 4종 (이름 충돌)**

| # | 산식 | 위치 | 주체 |
|---|---|---|---|
| **A** | `spent / (spent + remaining)` | `ResourceManagementService.js:261` **및 `WorkAssignmentRules.js:96` — 동일 코드 2벌 복제** | 사람 |
| **B** | `Σ(progress × planned) / Σ planned` (미산정 이슈 제외) | `ProgressCalculator.computeCompletion` → 스냅샷 `completion_rate` | 프로젝트 |
| **C** | `done / total` (**건수**) | `useMyPageStats.js:59` (프론트 전용) | 사람 |
| **D** | `aggregateprogress.percent` | Jira 원시 | 이슈 |

**🔴 이름 충돌 경고 — "완수율"이 두 개다**

`computeCompletionRate`(사람의 작업 완수율, `spent/(spent+remaining)`)와 스냅샷 `completion_rate`(프로젝트 진척률)는 **주체도 분모도 다른 별개 지표인데 이름이 같다.** 세 화면에 팀 축을 붙이면서 이 둘을 섞으면 즉시 값이 갈린다.

| 화면 | 쓸 지표 | 표기 라벨 |
|---|---|---|
| N7 `/my-page` 내 팀 | **A**(사람, `spent/(spent+remaining)`) | `팀원 평균 완수율` |
| N6 `/dashboard` 팀 비교 | **B**(프로젝트, 팀 공수 가중) | **`팀 참여 프로젝트 평균 완수율`** — `팀의 완수율`이라고 쓰지 말 것 |

> **결정 C — A와 B를 한 화면에 나란히 놓지 않는다.** 둘은 주체(사람/프로젝트)도 분모도 다르다. 같은 표에 두면 사용자가 비교 가능한 값으로 오해한다.
> **A의 모수 주의**: `fetchAssignedLoadByAccounts`는 `LOAD_DONE_WINDOW = '-26w'`로 **Done 이슈를 최근 26주만** 분모에 넣는다(`ResourceLoadFetcher.js:26`). N7은 이 창을 그대로 쓰므로 **"최근 26주 기준"임을 InfoTip에 명시**한다 — 안 쓰면 오래된 프로젝트 인원의 완수율이 부당하게 높아 보인다.
> **`computeCompletionRate`가 2곳에 복제**돼 있다(`ResourceManagementService.js:261`, `WorkAssignmentRules.js:96`). 값은 같지만 한쪽만 고치면 갈라진다 → **§8-3 C6 등재**. N7은 **새로 만들지 말고 둘 중 하나를 import**한다(통합은 별도 과제).

**결정 D — 팀 가동률은 ①의 가중 `ΣinvestedMd / ΣavailMd` (M2 결론 상향)**

§6-8의 M2 대응은 "포트폴리오 응답에 인당 분모가 없으니 `팀 인원 평균 가동률`(산술평균)로 라벨을 분리한다"였다. **실측 결과 그 전제가 틀렸다 — 분모 `availMd`는 ①이 이미 계산하고 있고, 응답에 싣지 않을 뿐이다.**

```js
// PortfolioAggregator.js:211-213 — 현재
const util = availMd > 0 ? round2(p.investedMd / availMd) : 0;
people.push({ accountId: accId, util });

// 변경 (2필드 추가만. util 값·산식 불변 → 기존 소비자 전부 무회귀)
people.push({ accountId: accId, util, investedMd: round2(p.investedMd), availMd: round2(availMd) });
```

- **팀 가동률 = `Σ investedMd / Σ availMd`** (가중, ① 기반). N6·N7·다음 회차 `/resource` 동일.
- ⚠ **②·③에는 이 결정을 적용하지 않는다.** ②(`members[].utilization`)는 프로젝트별 막대 전용, ③(분석탭)은 프로젝트·기간 스코프 전용으로 **현행 유지**한다. 셋을 통합하는 것은 이번 범위가 아니며(회귀면이 P2를 크게 넘는다), **팀 축에는 ①만 쓴다**는 규칙으로 divergence를 회피한다.
- **산술평균은 오히려 틀린 값을 낸다**: 해당 기간에 어떤 프로젝트에도 참여하지 않은 사람은 `availMd === 0 → util = 0`이 되어 **팀 평균을 부당하게 끌어내린다.** 가중 `Σ/Σ`는 분모에 0을 더하므로 이 사람을 자연히 제외한다 → **가중이 정확성 면에서도 우월하다.**
- ⚠ **KVS 값 240KiB 제한 관측 필요**: `utilizationPeople`는 인원수에 비례한다. 2필드 추가로 레코드당 약 +30%(≈45B → ≈60B). 2000명 기준 ≈120KB로 한도 내지만, **배치가 `utilizationPeople` 직렬화 크기를 `console.info`로 남긴다**(캡이 아니라 신호 — §R3의 `TEAM_SCOPE_WARN_THRESHOLD`와 같은 취급).
- 이 변경으로 §6-8 M2의 **라벨 분리(`팀 가동률` vs `팀 인원 평균 가동률`)는 불필요해진다.** 단일 이름 **`팀 가동률`**을 쓴다. (M2가 요구한 것은 "같은 이름으로 다른 값을 주지 말 것"이었고, 이제 같은 값을 준다.)

**결정 2 — 캐노니컬 필드명**

`/resource`는 `people[].util`, 포트폴리오는 `members[].utilization`으로 **이미 이름이 갈려 있다.**

| 필드 | 캐노니컬 | 처리 |
|---|---|---|
| 가동률 | **`utilization`** | **신규 응답(N7)은 `utilization`을 쓴다.** `/resource`의 기존 `people[].util`은 **그대로 둔다**(변경 시 회귀 위험이 이득보다 크다). P3-A에서 `/resource`에 팀 그룹핑을 붙일 때 `util → utilization` 매핑 1줄을 어댑터에서 한다 |
| 분자/분모 | **`investedMd` / `availMd`** | 신규 |
| 공수 | **`effortMd`** | 포트폴리오가 이미 쓰는 이름. N7도 동일 |
| 사람 완수율 | **`completionRate`** | 이미 동일 |

**결정 3 — 계층별 단일 구현 (계산과 롤업을 분리한다)**

| 층 | 단일 구현 | 위치 |
|---|---|---|
| **개인 지표 계산** | 배치 `computeGlobalUtilization` + `computeCompletionRate` + `MD = sec/(hourRate×3600)` | **백엔드.** 신규 코드 0 — 기존 함수를 재사용한다 |
| **팀 롤업** | **`aggregateByTeam()` 순수 함수 1개** (§6-8에서 P3-A용으로 이미 설계) → **P2로 앞당긴다** | **프론트.** N6·N7이 같은 함수를 쓴다 |

- `aggregateByTeam`의 `avgFields`는 **가중 전용**(`{field, numerator, denominator}`) — §6-8 M2 규칙 그대로. 가동률은 `{ field:'utilization', numerator:'investedMd', denominator:'availMd' }`.
- **`computeCompletionRate`는 승격이 불필요하다 (L-5)** — `WorkAssignmentRules.js:96`의 복사본이 **이미 export돼 있다.** N7은 **그쪽을 import**한다. `ResourceManagementService.js:261`의 private 복사본은 그대로 둔다(통합은 §8-3 C6의 별도 과제). **어느 쪽을 import할지 지정하는 것이 핵심** — 지정하지 않으면 구현자가 세 번째 복사본을 만든다.
- **MD 환산 8곳 복제는 이번 회차에 통합하지 않는다.** 값이 전부 동일해 현재 결함이 없고, 8곳을 건드리는 회귀면이 P2 범위를 넘는다. **§8-3에 카테고리 C5(드리프트 위험)로 등재**만 하고 별도 과제로 남긴다 — 새 코드는 반드시 기존 상수식을 그대로 쓴다.

#### N5. 프로젝트 캘린더 팀별 필터 (P2 증분, 2026-07-28)

**대상**: `pages/projectDetail/calender/` — `ProjectCalender.jsx` · `useProjectCalender.js` · `useProjectWorkersSchedule.js`

**실측 전제 (직접 확인)**

| 항목 | 실측 결과 |
|---|---|
| 캘린더 데이터 소스 | **2개다.** ① 워크로그 `getProjectCalendarWorklog` (`R('PROJECT','list')`) ② 일정·휴가 `getAllProjectWorkersSchedule` (`R('PROJECT','detail')`, `mySchedule` 도메인) |
| 응답 래퍼 | **둘 다 `{ data: [...] }`** — `content` 아님. 팀 도메인 규약을 여기 적용하지 말 것 |
| 워크로그 이벤트의 사람 축 | `data[].fields.worklog.worklogs[].author.accountId` (Jira 이슈 raw shape) |
| 일정 이벤트의 사람 축 | `data[].account_id` (`user_schedule` row) |
| **인원 필터가 이미 있다** | `ProjectCalender.jsx:103-107`(워크로그) · `useProjectWorkersSchedule.js:40-42`(일정) — **양쪽 다 `selectedAccountIds` 클라이언트 필터** |
| **`+1일 보정` 위치** | `useProjectWorkersSchedule.js:61` `end: addDaysToDateString(first.schedule_end_date, 1)` — **프론트, 일정 경로에만** 존재 |

**설계 — 날짜 로직에 손대지 않는다**

> 팀 필터는 **어떤 이벤트를 포함할지**만 결정한다. 이벤트의 `start`/`end` 계산에는 **일절 관여하지 않는다.**

- `+1일 보정`은 `useProjectWorkersSchedule.js:61`의 **이벤트 조립 단계**에 있고, 팀 필터는 그 **이전 단계(행 필터링)**에 들어간다. 기존 `selectedAccountIds` 필터가 정확히 그 자리(`:40-42`)에 있으므로 **같은 자리에 조건 하나를 AND로 추가**한다.
- 보정 유틸 `addDaysToDateString`(`utils/TimeUtils.js:55-66`)은 **순수 함수**이고 필터와 상태를 공유하지 않는다. 워크로그 쪽도 `filteredWorklogs`(필터, `:91-122`)와 `event`(날짜 계산, `:125-168`)가 **별도 `useMemo`로 이미 분리**돼 있다 → 팀 필터는 `filteredWorklogs`에만 얹는다.
- ⚠ **금지 — 그룹 키에 `teamKey`를 넣지 말 것.** **필터는 반드시 `:40` `filtered` 단계에서만** 걸고 그룹핑 키·`first` 선택 로직은 한 글자도 건드리지 않는다.

> **🔴 근거 정정 (M-5, 실측 반박 수용).** 초안은 "그룹 키에 팀을 추가하면 `first`가 바뀌면서 `end`가 달라진다 — '연차 -6MD' 계열"이라고 적었다. **사실이 아니다.**
> 그룹 키는 `` `${schedule_start_date}__${schedule_end_date}__${schedule_type}` ``(`:47`)로 **`end` 문자열 자체가 키의 성분**이다. 한 그룹의 모든 행은 동일한 `schedule_end_date`를 가지므로, 키에 `teamKey`를 덧붙여 그룹이 쪼개져도 **각 조각의 `first.schedule_end_date`는 변할 수 없다.** 주장된 날짜 사고는 발생하지 않는다.
>
> **실제 위험은 다른 것이다**: 여러 사람이 같은 기간·같은 타입으로 묶인 **통합 이벤트가 팀별로 쪼개져 캘린더에 중복 렌더**된다(`users` 배열이 분할되어 AvatarStack이 여러 개로 나뉜다). `dayMaxEvents={3}` 환경에서 가시성을 되찾으려는 필터가 오히려 이벤트 수를 늘리는 역효과다.
> **처방(필터를 `:40`에만)은 그대로 유효**하나, **검증된 것처럼 서술된 가짜 함정은 다음 설계에서 "전례"로 인용될 때 해를 끼친다**(U3·"유일하게 동작한다" 전례와 같은 유형).
- 회귀 가드: `useProjectWorkersSchedule.test.js`에 **"팀 필터 적용 전후로 살아남은 각 이벤트의 `start`/`end`가 바이트 단위로 동일하다"**를 단언한다.

**팀 축 조달 — `memberTeamMap` 1개로 두 소스를 모두 덮는다**

- **`getProjectCalendarWorklog` 응답 루트에만 `memberTeamMap`·`teamMeta`를 추가**한다. 일정 resolver(`getAllProjectWorkersSchedule`)는 **무변경**.
- 근거: ① 두 소스는 **같은 프로젝트의 같은 사람들**이므로 맵 하나면 충분하다 ② 일정 resolver는 `mySchedule` 도메인 소속이라 캘린더 전용 필드를 넣으면 마이페이지 일정 경로까지 오염된다 ③ 두 resolver에 같은 필드를 넣는 것은 §8-3 카테고리 C 재발이다.
- 맵의 원천은 **워크로그 작성자가 아니라 프로젝트 인력(`projectusers ⋈ users`)**이다. 워크로그가 없는데 휴가만 있는 사람이 맵에서 빠지면 그 사람의 일정이 "팀 미지정"으로 오분류된다.
- 프론트는 `useProjectCalender`가 받은 `memberTeamMap`을 `useProjectWorkersSchedule`에 **prop으로 내려준다**(일정 훅이 따로 fetch 하지 않는다).
- **조기 반환 분기에도 같은 필드를 싣는다 (L-1)** — `getProjectCalendarWorklogService`는 스코프 교집합이 비면 `{ data: [] }`를 **조기 반환**한다(`ProjectCalendarService.js:75-77`). 여기에 `memberTeamMap`/`teamMeta`를 빠뜨리면 **루트 필드 집합이 경로별로 갈린다.** `emptyShape()`에 적용한 1:1 원칙을 이 분기에도 그대로 적용해 **`{ data: [], memberTeamMap: {}, teamMeta: {} }`**를 반환한다.
- **선택 팀 인원이 이 프로젝트에 없을 때 (L-7)** — `TeamSelect`는 전체 팀 옵션을 주므로 이 프로젝트와 무관한 팀을 고를 수 있다. 그러면 캘린더가 통째로 빈다. **"선택한 팀의 인원이 이 프로젝트에 없습니다" 빈 상태 문구**를 표시한다(`projectDetail.calendar.teamNoMember`). 옵션 자체를 좁히지 않는 이유: 캘린더는 단일 프로젝트라 `excludeValues` 계산에 프로젝트 인력 목록을 따로 불러와야 하고, 그 비용이 빈 상태 문구보다 크다.

**필터 UI·규약**

- 공용 `TeamSelect`(P1 산출물, `components/select/TeamSelect.jsx`) + `useTeamOptions()` 재사용. **새 Select를 만들지 않는다.** 배치는 기존 두 필터 옆 세 번째 박스(`ProjectCalender.jsx:243-257`, `maxWidth:200`).
- **`PermissionMap` 수정 0줄** — `getTeamOptions`의 grant OR에 이미 `['PROJECT','read']`가 포함돼 있고(`PermissionMap.js:77-78`) 캘린더 진입자는 `PROJECT read`를 갖는다. 신규 resolver를 만들지 않으므로 deny-by-default에도 걸리지 않는다.
- **쿼리키에 `teamKey`를 넣지 않는다.** 넣으면 팀을 바꿀 때마다 Jira JQL + 이슈별 워크로그 페이지네이션이 전부 재실행된다(명백한 성능 퇴행). 필터는 `useMemo` 술어에만 들어가므로 **네트워크 요청 증가 0, 캐시 파편화 0**이고, `ProjectCalender.jsx:207-209`·`:235-237`의 하드코딩 invalidate 2곳도 **그대로 유효**하다.
- **단일 선택으로 둔다**(기존 두 필터는 멀티지만 팀은 단일). 근거: "지금 어느 팀의 일정을 보는가"는 단일 질문이고, `TeamSelect`가 현재 단일 선택 구현이라 확장 없이 쓸 수 있다. (N6의 포트폴리오 비교는 멀티가 필요하므로 거기서 `isMulti`를 확장한다 — §N6 참조.)
- **실사용 정당성**: 공용 FullCalendar 래퍼가 `dayMaxEvents={3}`이라(`components/calendar/FullCalendar.jsx`) 인원이 많은 프로젝트는 대부분의 이벤트가 "+N more"에 가려진다. 팀 필터는 장식이 아니라 **가시성 복구 수단**이다.
- 팀 필터 3상태 규약 그대로: `undefined`(전체) / `'<teamKey>'` / `'__NONE__'`(팀 미지정). **`null` 금지.** 센티넬은 `constants/team.js`의 `TEAM_FILTER_NONE`을 import(문자열 리터럴 재작성 금지).
- 인원 필터(`ProjectUserSelect`)와는 **AND**로 결합한다. 둘 다 걸면 교집합.
- **하위 팀 포함 토글은 넣지 않는다. 항상 후손을 포함한다.**
  근거: ① §11 가정 5가 기본값을 "포함 켜짐"으로 이미 정했다 ② 한 프로젝트의 인력은 실무상 O(10)이라 본부/팀 구분의 실익이 거의 없다 ③ 캘린더 툴바에 이미 `ProjectUserSelect`·`ProjectIssueSelect`·날짜 네비게이션이 있어 컨트롤을 더 늘리면 과밀하다. `/resource`(전사 규모)는 토글이 유의미하지만 **단일 프로젝트 캘린더는 아니다** — 화면 성격에 따른 의도적 비대칭이며, 이 판단을 InfoTip 없이 두지 말고 Select placeholder에 "(하위 팀 포함)"을 명시한다.
- 후손 전개는 `useTeamOptions()`의 `options[].parentTeamKey`로 **클라이언트에서** 계산한다(`buildTeamTree` 재사용). 서버 왕복 없음.

#### N6. 통합 대시보드 팀별 비교 + 팀 멀티셀렉트 (P2 증분, 2026-07-28)

> **팀 멀티셀렉트(기존 P2 항목)와 팀별 비교 위젯(N6)은 한 덩어리다.** 둘의 상호작용을 아래에서 확정한다 — 구현자가 추측하지 않게.

**실측 전제 (직접 확인)**

| 항목 | 실측 결과 |
|---|---|
| 응답 래퍼 | **`content` 없음. 루트 직접 노출** (`{success, lastAggregatedAt, aggregateStatus, projects, roleMeta, levelMeta, salaryBuckets, utilization, utilizationBands, scopeBands, problemIssues}`). `getProjectCostSummary`와 같은 함정 — **`content`로 감싸지 말 것** |
| `emptyShape()` | 루트 필드 집합이 정상 경로와 **1:1 동일**. **신규 루트 필드는 `emptyShape()`에도 반드시 추가**해야 한다(누락 시 데이터 없는 환경에서 프론트가 `undefined` 접근) |
| 사람 단위 데이터 | `projects[].members[] = { accountId, displayName, roleKey, levelKey, salary, effortMd, utilization }` — **`teamKey` 없음** |
| `memberTeamMap`/`teamMeta` | **미구현**(P2 설계 항목, `src/`·`static/ui/src/` 전역 grep 0건) |
| 필터 아키텍처 | **완전 클라이언트.** 서버 payload 없음(`invoke("getPortfolioDashboard", {})`), 위젯은 `selectedProjects`만 받아 `utils/portfolioAggregate.js` 순수함수로 재집계 |
| 축 토글 선례 | `PortfolioRoleLevelDist`(분포) / `PortfolioCostByRoleLevel`(비용) — `useState('role'\|'level')` + `keyField` 분기 + `portfolioAggregate.js` 순수함수 |
| **인건비 게이트** | **없다.** `getPortfolioDashboard: R('REPORT','list')`이고 시드 Member는 `REPORT: {read:true}` → **`projects[].members[].salary`(개인 유효급여)와 `projects[].totalSalary`가 이미 전 사용자에게 나가고 있다.** U7 수정이 이 경로를 덮지 못했다 → **U12로 신규 등록** |

**⚠ 인건비 축의 전제 — U12를 함께 닫지 않으면 게이트가 무의미하다**

N6의 인건비 축만 `PROJECT_COST`로 가리고 `members[].salary`를 raw로 계속 내려보내면, **프론트가 그 raw 값으로 팀별 인건비를 그대로 계산할 수 있다.** 파생 축을 가리는 것은 원본이 같은 payload에 없을 때만 통제다.

> **따라서 N6의 인건비 축과 U12 수정은 분리 불가능한 한 단위다.**

```js
// src/permission/CostAccess.js (신규) — 재무 열람 판정의 단일 출처
export const COST_DENIED_REASON = 'PROJECT_COST_REQUIRED';
export const canReadCost = (principal) =>
    principal?.isAdmin === true || principal?.resourceMap?.PROJECT_COST?.read === true;
```
- `ProjectDashboardService.js:135-136`의 **private `canReadCost` 복사본을 이 파일로 승격**하고 import 로 대체한다(승격식은 문자 그대로 동일 — 동작 차이 0). 백엔드 복사본은 **현재 1개뿐이므로 N6가 만들면 2번째**다(L-6 정정 — 초안의 "3번째"는 과장). 그래도 §8-3 카테고리 C 재발이므로 **C4로 등재.**
- `reason` 문자열은 U7이 이미 쓰는 **`'PROJECT_COST_REQUIRED'`를 글자 그대로 재사용**한다(프론트 분기가 이미 존재).
- `getPortfolioDashboardService`에서 `canReadCost(principal) === false`이면:
  - `projects[].members[]`에서 **`salary` 키를 제거**하고, `projects[].totalSalary`·루트 `salaryBuckets`도 **키 제거**한다.
  - 루트에 **`costMasked: true`** 를 싣는다(권한 있으면 `false`). §R3-C "조용한 실패 금지".
  - `emptyShape()`에도 `costMasked` 추가 — 값은 **하드코딩 `false`가 아니라 `!canReadCost(principal)`**로 채운다(L-2).

> **🔴 근거 정정 (H-1, 실측 반박 수용).** 초안은 "`null`은 `Σ`에서 `0`이 되어 거짓 숫자를 만들지만 **키 삭제는 다르다**"고 적었다. **이 코드베이스에서는 거짓이다.**
> `portfolioAggregate.js`의 급여 소비는 **전부 `?? 0` 폴백**이다 — 실측 **9곳**: `:37`, `:91`, **`:106` `seen.set(m.accountId, m.salary ?? 0)`**, `:301`, `:324`, `:355`, `:373`, **`:477`(`costByRoleLevel` — `teamComparison`의 템플릿)**, `PortfolioSalaryByProject.jsx:65`.
> JS에서 `undefined ?? 0`과 `null ?? 0`은 **동일하게 `0`**이다. 즉 **키 삭제도 "₩0"이라는 거짓 숫자를 똑같이 만든다.** CLAUDE.md에 기록된 **`ScopeSplitCell` 사건과 정확히 같은 `?? 0` 삼킴 유형**이다.
>
> **키 삭제 결정 자체는 유지한다** — 다만 근거는 바뀐다: **"원본 데이터를 payload에서 제거해 프론트의 재계산 자체를 차단한다"**(파생 축 게이팅이 무의미해지는 것을 막는 본래 목적). **거짓 숫자를 실제로 막는 방어선은 서버가 아니라 `costMasked` 기반 UI 게이팅이다.**
> ⚠ **서버 필드 제거는 필요조건이지 충분조건이 아니다.** 잘못된 근거를 남겨두면 다음 설계에서 그대로 인용된다(§R3 자기모순 전례).

**프론트 게이팅 지점 — 전수 (실측. `costMasked === true`일 때)**

| # | 위치 | 조치 | 비고 |
|---|---|---|---|
| 1 | `PortfolioFilterBar.jsx:119-121` 합계 칩 `₩{totalSalary/1e6}M` | **칩 숨김** | **모든 탭에서 항상 보이는 위치.** 안 가리면 "₩0M"이 상시 노출 |
| 2 | `PortfolioTsrSignalTable.jsx:97,140` salary 컬럼 | **컬럼 제거** | 종합 개요(페이지 셸) — Cost 탭 밖이라 "탭 대체"로 안 덮인다 |
| 3 | `PortfolioTsrSignalTable.jsx:53,57,81,136` Cost 신호등(`costLevel`/`cpi`/`burnRate`) | **신호 제거** | `portfolioAggregate.js:301-305`가 `totalSalary` 기반이라 **0원 기준 오신호** |
| 4 | **`PortfolioProjectTable.jsx:52,90` salary 컬럼** | **컬럼 제거** | ⚠ **검토서가 "고아"로 잘못 분류한 파일이다.** 실측: `PortfolioTsrSignalTable.jsx:11`에서 import되어 **`:165`에서 렌더**된다(신호등 ⇄ 풀 수치표 토글). **살아 있다** |
| 5 | Cost 탭 전체(`PortfolioCostKpi`·`PortfolioCostOverrunRank`·`PortfolioCostScatter`) | **안내 문구로 대체** | 빈 차트 금지 |
| 6 | `ComparisonTabs`의 `salaryBuckets` | **미전달 + 해당 뷰 숨김** | 루트 응답 필드라 **서버에서 함께 제거**한다(위) |
| 7 | N6 팀 비교 위젯 인건비 축 | **축 선택지 제거** + 정렬 폴백 MD | |

- `costMasked`를 **`PortfolioFilterBar`·`PortfolioTsrSignalTable`(→`PortfolioProjectTable`)·`ComparisonTabs`에 prop으로 내린다.**
- **`PortfolioSalaryByProject`·`PortfolioSalaryHistogram`은 게이팅 대상이 아니다** — 실측 결과 **어디서도 import되지 않는 고아 위젯**(외부 참조 0건)이다. 죽은 코드를 게이팅하면 커버리지가 있다는 착각만 생긴다. 대신 **§10 U16으로 "고아 위젯 2종 정리" 과제 등재**.
- ⚠ **기존 동작 축소 범위가 초안보다 넓다** — Cost 탭뿐 아니라 **종합 개요의 신호등·수치표와 필터바 칩**까지 Member에게 사라진다. 배포 노트에 이 범위를 정확히 적는다.
- ⚠ **이것은 기존 동작의 축소다** — 지금 Cost 탭을 보던 Member 사용자가 못 보게 된다. **의도된 보안 수정이며 회귀가 아니다**. 다만 배포 노트에 명시가 필요하다(리더 판단 항목).

**팀 멀티셀렉트 ↔ 비교 위젯 상호작용 (확정)**

> **팀 멀티셀렉트는 하나의 선택으로 두 가지를 동시에 한다: (a) 대시보드 프로젝트 스코프를 좁히고, (b) 비교 위젯의 비교 대상 팀을 정한다.**

| 질문 | 결정 | 근거 |
|---|---|---|
| 팀 선택이 프로젝트 목록을 좁히는가 | **예.** `projects.filter(p => p.members.some(m => memberTeamMap[m.accountId] ∈ 선택팀))` | §R5가 이미 정한 규약(팀 필터는 프로젝트 목록만 좁히고 프로젝트 지표는 분해하지 않는다). `portfolio.team.projectMetricNote` InfoTip 그대로 |
| 팀 선택이 비교 대상도 정하는가 | **예.** 비교 위젯 행 = 선택된 팀들 | 선택하지 않은 팀이 비교표에 나오면 "팀A를 골랐는데 팀B가 보인다"가 된다 |
| **(a)가 (b)의 숫자를 잘라내지 않는가** | **잘라내지 않는다 — 무손실이다.** 팀의 구성원은 자기가 속한 프로젝트에서만 공수를 만든다. 따라서 "선택 팀이 1명이라도 있는 프로젝트"로 좁혀도 **선택 팀의 합계는 전량 보존**된다 | 이 성질 덕에 (a)+(b)를 한 컨트롤로 묶는 것이 안전하다 |
| 프로젝트 멀티셀렉트와의 관계 | **AND — 단 MD·완수율·인건비 3축에만 해당한다.** | InfoTip에 "합계는 현재 프로젝트 선택 범위 기준"을 명시 |
| **🔴 가동률 축은 예외 (M-1)** | **가동률은 프로젝트 선택에 반응하지 않는다. 항상 전사 값이다.** | ①글로벌은 `utilization.people[]`에서 오고 이 배열은 **필터 무관 글로벌**이다(`PortfolioDashboardService.js:163` 주석 "필터 무관 글로벌", `meta.utilizationPeople` 직결). 분모 `availMd`가 **전 프로젝트 참여 구간 union**이라 프로젝트 부분집합으로 재계산할 수 없다 — ②로 재계산하면 사람당 값이 여러 개가 되어 롤업이 깨진다(결정 A). **한 위젯에서 3축은 필터에 반응하고 1축은 안 하는 비대칭**이므로 **가동률 축에 전용 InfoTip 필수**: "가동률은 전사 기준이며 프로젝트 선택의 영향을 받지 않습니다." 없으면 "필터를 걸었는데 가동률이 안 변한다"는 버그 리포트가 된다 |
| **아무 팀도 선택하지 않았을 때** | **전체 팀을 대상으로 하되, 현재 지표 축 기준 내림차순 상위 10팀 + `기타(N개 팀)` 묶음 행 1개 + `팀 미지정` 행을 항상 마지막에 표시** | 빈 상태는 발견성이 낮고, 최대 500팀을 나란히 놓는 것은 무의미하다. **`기타` 묶음을 두는 이유는 합계 보존** — 잘라내기만 하면 "팀 소계의 합 ≠ 전체"가 되어 §R6에서 "팀 미지정을 숨기면 합계가 안 맞는다"고 한 것과 같은 결함이 된다 |
| 상위 N 정렬 기준 | **현재 선택된 지표 축의 값 desc.** 인건비 축이 `costMasked`로 없으면 **공수(MD) 축으로 폴백** | 축을 바꾸면 순위도 바뀌는 것이 자연스럽다 |
| N 값 | **기본 10, 사용자가 조절하지 않는다**(상수) | 컨트롤을 늘리지 않는다. 특정 팀을 보려면 멀티셀렉트로 고르면 된다 |
| **'팀 미지정'을 선택할 수 있는가 (L-3)** | **예. `TeamSelect`에 `includeNoneOption`을 켠다** | 미선택 기본 표에 `팀 미지정` 행이 이미 있으므로, 선택 모드에서만 못 고르면 **두 모드의 대상 집합이 달라져** 사용자가 혼란스럽다. 선택 시 필터 술어는 `memberTeamMap[accountId] === undefined`(키 부재)로 판정한다 — `'__NONE__'`은 **UI 센티넬일 뿐 `memberTeamMap`의 값이 아니다**(팀 미소속자는 키 자체가 없다, §3 관용구) |
| **TEAM_ONLY 사용자의 선택지** | **아래 H-2 소절의 3층 규칙**을 따른다 | 초안("teamMeta에 등장하는 팀만")은 **`teamMeta` 구성이 미정의**라 보장이 구현자 해석에 달려 있었다 |
| 그 선택지에 다른 팀이 섞이는 것은 정보 노출인가 | **아니다.** TEAM_ONLY 사용자의 스코프 프로젝트에는 타 팀 인원도 투입돼 있고, 그 사람들은 이미 프로젝트 인력 목록에서 보인다(**H4에서 "TEAM_ONLY는 인원 축을 좁히지 않는다"로 이미 선언**). 일관된 동작이다 | H4 결정과 정합 |

**비교 위젯 4지표 — 전부 기존 정의 재사용, 새 지표 0**

> **⚠ 아래 표는 3차 실측(§3 팀 지표 단일 정의)으로 정정됐다.** 초안은 `projects[].members[].utilization`(②프로젝트 내 산식)과 MM을 쓴다고 적었으나, 둘 다 **팀 롤업이 정의되지 않는다.**

| 축 | 산식 | 원천 (정정) | 주의 |
|---|---|---|---|
| **가동률/부하** | **가중 `Σ investedMd / Σ availMd`** | **`utilization.people[]`** (=①글로벌, `PortfolioDashboardService.js:164-185`). **`projects[].members[].utilization`(②)을 쓰지 말 것** | ②는 **사람당 값이 여러 개**(참여 프로젝트 수만큼)라 팀 합산이 정의되지 않고, N7(①)과 값이 갈린다. ①은 사람당 1값 |
| **투입 공수(MD)** | `Σ members[].effortMd` (프로젝트 가로질러 합산) | `projects[].members[].effortMd` | **MM이 아니라 MD다.** MM은 분모가 기간 의존이라 프로젝트를 가로질러 합산할 수 없고, `actual_mm`(이슈 timetracking)과 분석탭 MM(워크로그)은 **분자 출처마저 다르다**(§3 결정 B). 사람이 여러 프로젝트에 있으면 **합산이 맞다**(기여의 합) |
| **진척·완수율** | 팀이 참여한 프로젝트들의 `completionRate`(B)를 **팀 투입 MD로 가중평균** | `projects[].completionRate` + 팀 MD | ⚠ 라벨은 **`팀 참여 프로젝트 평균 완수율`** — `팀의 완수율`이 아니다(§R5 원칙). N7의 `팀원 평균 완수율`(A)과 **한 화면에 나란히 놓지 않는다**(§3 결정 C) |
| **인건비** | `Σ members[].salary` (계획) / `Σ round(salary × p.scheduleRate)` (실적) | `members[].salary` | **`costMasked`면 축 자체를 감춘다.** 산식은 `portfolioAggregate.costByRoleLevel`(`:468-491`)과 동일 — `keyField`만 `teamKey`로 |

- **`utilization.people[]`에도 `memberTeamMap`이 필요하다** — 이 배열은 accountId 기준이므로 P2-a에서 추가하는 `memberTeamMap`으로 팀을 붙인다. `projects[].members[]`와는 별개 경로다.

- **인원수 축의 dedup 규약**: 한 사람이 여러 프로젝트에 있으면 **`accountId`로 dedup**한다(`salaryHistogram`이 이미 쓰는 정책, `portfolioAggregate.js:101-109`). 공수·인건비는 dedup 하지 않는다(프로젝트별 기여의 합이므로). **이 비대칭을 InfoTip에 명시**한다 — 안 하면 "인원 10명인데 인건비가 15명분"으로 보인다.
- 집계 함수는 `portfolioAggregate.js`에 **`teamComparison(selected, memberTeamMap, teamMeta, utilizationPeople, { axis, topN })`** 순수함수 1개로 추가한다.
  ⚠ **`utilizationPeople` 인자가 반드시 필요하다 (M-1)** — 초안 시그니처에는 없었고, 그대로 구현하면 **가동률 축을 계산할 수 없다**(①은 `selected`(=`projects[]`)가 아니라 `utilization.people[]`에서 온다). 축별로 입력 모집단이 다르다는 사실을 시그니처가 드러내야 한다.
- **P2-a 배포 후 다음 배치 실행 전까지 `people[]`에 `investedMd`/`availMd`가 없다.** N7과 동일하게 **`aggregateStatus`/`lastAggregatedAt`로 "집계 전" 표기**하고, 가동률 축은 값 대신 안내를 보여준다(0%로 그리지 않는다 — 거짓 숫자 금지). `roleLevelDistribution`(`:56-82`)/`costByRoleLevel`(`:468-491`)과 동형 — 후자는 `keyField`만 `teamKey`로 바꾸면 되는 **가장 가까운 템플릿**이다.
**H-2. `teamMeta`·`memberTeamMap`·선택지의 역할 분리 (3층 규칙 — 명문화)**

초안은 세 곳에서 **상충하는 서술**을 했다: "`roleMeta`와 동형(= KVS 전체 role → 전체 팀)" / "`users` 1회 SELECT(= 전 사용자)" / "`teamMeta`에 등장하는 팀만 옵션(= 스코프 축소 전제)". `scopedProjectIds`가 좁히는 것은 **`projects[]`뿐**이므로(`PortfolioDashboardService.js:156-158`), 관례대로 구현하면 **TEAM_ONLY 사용자의 멀티셀렉트에 스코프 밖 팀이 전부 노출·선택 가능**해진다 — N6가 `getTeamOptions`를 기각한 바로 그 상태가 재현된다.

> **역할을 층으로 분리한다. 세 개는 서로 다른 것이며 같은 규칙을 공유하지 않는다.**

| 층 | 정의 | 스코프 | 근거 |
|---|---|---|---|
| **`teamMeta`** | **이름 사전일 뿐이다.** `{ "<teamKey>": "<name>" }`, **전체 팀** | 좁히지 않는다 | `roleMeta`/`levelMeta` 관례 유지. 이름 사전이 넓은 것은 무해하다(팀 이름은 §4-6에서 비민감 판정) |
| **`memberTeamMap`** | `{ "<accountId>": "<teamKey>" }`, **전 사용자**(팀 미소속자는 키 부재) | 좁히지 않는다 | 팀 소속은 비민감(**H4에서 "TEAM_ONLY는 인원 축을 좁히지 않는다"로 이미 선언**). 좁히면 `users` 조회에 스코프 로직이 들어가 §8 "필드 추가만" 무회귀 논증이 깨진다 |
| **선택지(옵션)** | **`projects[].members[]`(이미 스코프 적용됨)의 `accountId`를 `memberTeamMap`으로 사상해 실제 등장하는 `teamKey` 집합** | **여기서만 좁힌다** | 서버는 관례대로 구현하고, **스코프 일치는 클라이언트 파생 규칙이 보장**한다. `teamMeta` 키를 순회하면 전체 팀이 나오므로 **절대 그렇게 하지 않는다** |

- **`utilization.people[]`도 같은 규칙을 따른다** — 이 배열은 **필터 무관 글로벌**이라(M-1) 스코프 밖 사람이 섞여 있다. 옵션 파생 소스는 **`projects[].members[]`뿐**이다(`utilization.people[]`을 옵션 소스로 쓰지 말 것).

**M-4. `TeamSelect`의 옵션 소스 충돌 — `excludeValues` prop으로 해결(신규 prop 불필요)**

`TeamSelect`는 **내부에서 `useTeamOptions()`를 호출**하고 옵션 주입 prop이 없다(`TeamSelect.jsx:53`). "파생 옵션"과 구조가 충돌한다. **그러나 실측 결과 `excludeValues` prop이 이미 존재한다**(`:55` `excluded = new Set(excludeValues ?? [])`, `:58` 필터 적용).

> **결정: `options` 주입 prop을 신설하지 않고 기존 `excludeValues`를 쓴다.**
> ```js
> const scopeTeamKeys = new Set(scopedProjects.flatMap(p => p.members.map(m => memberTeamMap[m.accountId]).filter(Boolean)));
> const excludeValues = allTeamOptions.filter(o => !scopeTeamKeys.has(o.value)).map(o => o.value);
> <TeamSelect isMulti excludeValues={excludeValues} ... />
> ```
- **이 방식이 파생 옵션 주입보다 우월한 이유**: 파생 소스(`teamMeta`)는 flat `{key:name}`이라 **`depth`/`parentTeamKey`가 없어 계층 들여쓰기(`formatOptionLabel`, `:76-82`)가 사라진다.** `excludeValues`는 `useTeamOptions()`의 원본 옵션을 그대로 쓰므로 **계층 표현이 보존된다.**
- **`TeamSelect` 변경은 `isMulti` 지원 1건뿐**이다("새 Select를 만들지 않는다" 원칙 유지, 신규 prop 0).

- **`TeamSelect`에 `isMulti` 지원을 추가한다** (P2 작업 항목). 현재는 단일 선택 구현이고 `...rest` 스프레드가 있어 `isMulti` 전달 자체는 가능하나, **`value` 정규화(배열)와 `formatOptionLabel`(depth 들여쓰기)이 멀티에서 동작하는지 검증이 필요**하다. 포트폴리오 필터바의 기존 프로젝트 멀티셀렉트와 UX를 맞춘다. **N5(캘린더)는 단일을 쓰므로 기존 동작이 깨지지 않아야 한다** — `isMulti` 미지정 시 현행과 100% 동일함을 테스트로 고정.
- 위젯 배치: **`ResourceTab`에 `PortfolioTeamComparison` 신규.** 인건비 축은 같은 위젯의 축 토글로 제공하되 `costMasked`면 선택지에서 제거.
- **`PortfolioTeamDist`(구성비)는 P2 범위에서 제외한다 (L-4).** §R5 표 #2가 P2로 약속했으나 §9 체크리스트에 생성 항목이 없었다 — **누락이 아니라 범위 조정**으로 확정한다. 근거: `PortfolioTeamComparison`(나란히 비교, 4축)이 구성비 정보를 **포함**하고, 위젯 2개를 동시에 내면 P2-c의 blast radius가 커진다. 구성비 전용 뷰가 실제로 요구되면 **비교 위젯의 표시 모드 토글**(막대 ⇄ 도넛)로 추가한다 — 별도 위젯을 만들지 않는다.
- **팀 이동 귀속**: "현재 소속 기준"(§6-8 공통 규칙). `team.analysis.currentMembershipNote` InfoTip을 이 위젯에도 단다.

#### N7. `/my-page` 내 팀 — 팀원 업무 분석 (P2 증분, 2026-07-28)

**요구**: "팀장이라면 내 팀원들 + 내 하위 그룹 인원들이 어떻게 일하고 있는지에 대한 분석."

| resolver | 입력 payload | 응답 shape (success, 글자 그대로) | 프론트 훅 / 쿼리키 |
|---|---|---|---|
| `getMyTeamWorkAnalysis` | `{ teamKey }` | `{ success:true, content:{ members:[{ accountId, displayName, avatarUrls, teamKey, teamName, roleName, levelName, isLeader, utilization, utilBand, investedMd, availMd, effortMd, completionRate, todoCount, inProgressCount, doneCount, projectCount }], teamMeta, scope:{ teamKeys, memberCount, includesDescendants:true }, lastAggregatedAt, aggregateStatus }}` | `useMyTeamAnalysis(teamKey)` / `myPageKeys.teamAnalysis(teamKey)` |

- `utilization`·`investedMd`·`availMd`가 **`null`일 수 있다**(배치 미실행 또는 그 사람이 rollup에 없음). `lastAggregatedAt`/`aggregateStatus`를 함께 실어 프론트가 "데이터 없음"과 "가동률 0"을 구분하게 한다(§R3-C 조용한 실패 금지).
- `completionRate`는 분모 0이면 **`null`**(`computeCompletionRate` 규약 그대로). UI는 `-`.
- **재무 필드 없음** — `salary`·`annualSalary`·인건비 일절 싣지 않는다(§R3-B "팀장에게 재무를 열지 않는다").

**결정 1 — 신규 resolver 1개 (기존 resolver에 축을 붙이지 않는다)**

| 후보 | 판정 |
|---|---|
| `getResourceOverview` / `getResourceLoadSummary`에 `teamLead` 축 추가 | ❌ **두 resolver 모두 payload에 인자가 없다**(`getResourceOverview()`, `getResourceLoadSummary()`). 대상 없는 `teamLead` 축은 "팀장이면 무조건 통과"가 되어 **전사 인원이 열린다** — 백엔드가 §P1-C에서 E2로 명명한 노출 그 자체다. 서비스에서 `grantedBy`로 행을 걸러낼 수는 있으나, 같은 응답이 grant 경로에 따라 다른 행 집합을 반환하게 되어 검증이 어렵고 실수 한 번이면 전사가 샌다 |
| **신규 `getMyTeamWorkAnalysis`** | ✅ **인원 축이 구조적으로 제한된다** — 서비스가 `principal.leadingScopeAccountIds`만 입력으로 쓰므로 payload를 어떻게 조작해도 범위가 넓어지지 않는다. **fail-close가 코드 구조에서 나온다** |

- `PermissionMap`: **`getMyTeamWorkAnalysis: { grants: [], project:'none', teamLead: { teamTargets: ['teamKey'] } }`** — **`teamLead` 단독 축 (M-3 반영)**
  - `teamTargets:['teamKey']` → `principal.leadingScopeTeamKeys` 검증. **팀장은 자기가 리더인 팀(+후손)만** 통과.
  - ⚠ **초안의 `grants:[RESOURCE_MANAGEMENT read]` 유지 근거를 철회한다 (M-3).** "관리자도 자기 팀을 볼 수 있게"라고 적었으나, 결정 3이 "서버는 **항상** `leadingScopeAccountIds`와 교집합"이므로 **리더가 아닌 관리자는 `leadingScopeAccountIds = []` → 항상 빈 결과**다(`PrincipalResolver.js:71,128`). grants가 실제로 열어주는 것은 **빈 섹션뿐**이다. 반대로 관리자가 실제 리더라면 `teamLead` 축만으로 이미 통과한다.
  - 관리자에게 임의 팀을 열려면 `grantedBy==='RESOURCE'` 분기가 필요한데, 그것은 **결정 1이 "같은 응답이 grant 경로에 따라 다른 행 집합을 반환한다"며 스스로 기각한 구조**다. → **(a) grants 제거, `teamLead` 단독**으로 확정한다. fail-close 일관이고 화면 노출 조건(`isTeamLead()`)과도 정확히 일치한다.
  - **조직 관리자의 임의 팀 분석이 실제 요구로 확인되면** `/backoffice/team` 또는 다음 회차 `/resource` 조직 현황 탭에서 **`TEAM_MANAGEMENT`/`RESOURCE_MANAGEMENT` 축의 별도 resolver**로 제공한다(같은 resolver에 두 스코프를 겹치지 않는다).
  - ⚠ **계약 테스트 주의**: `grants: []`는 `permissionMap.contract.test.js`의 "`meta.grants.length > 0`" 단언에 걸린다. **`teamLead`가 있으면 `grants` 빈 배열을 허용**하도록 테스트를 확장해야 한다(P2-b 작업 항목).
- **`TEAM_LEAD_WRITE_ALLOWLIST`에 `getMyTeamWorkAnalysis: ['teamKey']` 등재 필수** — H3에서 "미등록 = 전부 드롭"으로 뒤집었으므로 등재하지 않으면 **payload가 통째로 비어 동작하지 않는다**(시끄러운 실패).

**결정 2 — 하위 그룹 포함 범위: `leadingScopeAccountIds`를 그대로 쓴다**

- `PrincipalResolver`가 이미 산출한다(`:109-112` `leadingTeamKeys.flatMap(descendantsOf(..., {includeSelf:true}))` → `fillTeamScopeAccounts`가 accountId로 변환).
- **이미 후손 포함**이므로 추가 계산이 없다. `scopeTeamKeys`(소속 팀 포함)가 아니라 **`leadingScopeTeamKeys`(리딩 팀만)**를 쓰는 것이 핵심 — 전자를 쓰면 "내가 팀원인 팀"의 동료 분석까지 열려 과대하다(§R3의 write 판정과 같은 이유).
- 빈 집합(`[]`)이면 **쿼리를 발행하지 않고 빈 결과**를 반환한다(C3 규칙).
- `teamKey`를 여러 팀 중 하나로 좁혀 볼 수 있게 payload로 받되, **서버는 항상 `leadingScopeAccountIds`와 교집합**을 취한다(payload만 믿지 않는다).

**결정 3 — 지표는 전부 재사용. 신규 계산 0**

`getResourceLoadSummaryService`(`:284-316`)와 **같은 함수들을 같은 순서로 호출하되 `accountIds`만 좁힌다.**

```js
const accountIds = principal.leadingScopeAccountIds ?? [];
if (!accountIds.length) return { content: { members: [], ... } };   // 빈 집합 가드

const [loadMap, projectCountMap, rollupMeta, userRows, jiraUserMap] = await Promise.all([
    fetchAssignedLoadByAccounts(accountIds),   // 기존 — Jira 배치
    selectActiveProjectCounts(accountIds),     // 기존
    getRollupMeta(),                           // 기존 — utilization 원천(KVS 읽기)
    findUsersByAccountIds(accountIds),         // team_key/role/level
    /* getBulkJiraUsersApi */                  // 기존 — 이름/아바타
]);
// utilization = rollupMeta.utilizationPeople 에서 조회(재계산 없음)
// completionRate = computeCompletionRate(spent, remaining)  ← export 승격해 재사용
// effortMd = investedMd (배치가 이미 MD 단위로 산출)
```
- **`getResourceLoadSummary`보다 오히려 가볍다** — 그쪽은 `findUsersRepository({})`로 전 사용자를 훑지만 N7은 팀 인원만 본다. Jira 배치 비용이 인원수에 비례하므로 **전사 대비 큰 절감**.
- 새 지표를 만들지 않으므로 `/dashboard`·`/resource`와 값이 갈릴 수 없다.

**결정 4 — 개인 드릴다운은 기존 드로어를 재사용한다 (H1 감사 통과)**

H1의 교훈에 따라 **화면이 호출하는 read resolver를 전수 확인했다.**

| `/resource` 인력 드로어가 호출하는 것 | 매핑 | 팀장 접근 |
|---|---|---|
| `getResourceProfile({accountId})` | `R('RESOURCE_MANAGEMENT')` | ❌ → **`teamLead:{ accountTargets:['accountId'] }` 추가 필요** |
| `getSettingData` | **`'PUBLIC'`** (`PermissionMap.js:160`) | ✅ |
| (그 외) | — | 없음. `getRoleList`·`getSkillList`는 **서비스 내부에서** 호출되어 클라이언트 grant 불필요 |

→ **클라이언트 호출은 정확히 2개**이고, 하나는 PUBLIC이다. `getResourceProfile`에 축 하나만 추가하면 드로어가 그대로 동작한다. **H1이 재발하지 않는다.**

- `getResourceProfile`의 응답은 **단일 인물 데이터만** 담는다(`profile`/`load`/`inProgressIssues`/`experience`) — 내부적으로 `buildPeopleContext()`가 전 사용자를 로드하지만 **응답에는 타인이 실리지 않음을 확인**했다. 축을 열어도 전사 노출이 없다.
- ⚠ 단 `getResourceProfile`은 재무 필드가 없음을 **재확인**했다(`profile`에 `salary` 없음). 향후 이 응답에 급여가 추가되면 팀장에게 새어나가므로 **§R3-B 일반 규칙**("팀장 축 read resolver에 재무 필드가 생기면 마스킹")의 적용 대상으로 등재한다.
- `TEAM_LEAD_WRITE_ALLOWLIST`에 `getResourceProfile: ['accountId']` 등재 필수(H3).

**결정 5 — 카드 구성 (소속 팀 vs 리딩 팀)**

§11 U5에서 **팀장이 자기 리딩 팀 소속이 아닐 수 있음을 허용**했다(본부장이 하위 팀 리더인 경우). 따라서 둘을 **분리해 보여준다.**

```
[내 팀]  카드
 ├ (항상) 소속: {myTeamName}          ← usePermissionStore.getTeamName(), 추가 조회 0
 │        팀 미소속이면 이 줄을 만들지 않는다(현행 유지)
 └ (isTeamLead 일 때만) 리딩 팀 섹션
      ├ 팀 선택(리딩 팀 2개 이상일 때) + [팀장] 뱃지
      ├ ▸ 팀 요약 4지표 — 팀 가동률(가중) · 총 투입 MD · 평균 완수율 · 진행중 작업 수
      ├ ▸ 팀원 테이블 — 이름/직무/등급/가동률/진행중/완수율/참여PJ + [스킬] [상세]
      └ ▸ 하위 팀 포함 표시("하위 팀 N개 포함, 총 M명")
```
- **소속 팀 줄은 팀장에게도 보여준다.** 리딩 팀과 소속 팀이 다를 수 있고, 다른 경우 그 사실 자체가 사용자에게 의미 있는 정보다. 같으면 중복으로 보이므로 **`myTeamKey === selectedTeamKey`이면 소속 줄을 숨긴다.**
- 팀 요약 4지표는 **`aggregateByTeam`으로 계산**한다(N6과 같은 함수). 서버가 팀 합계를 내려주지 않는 이유: 롤업 구현이 둘이 되면 `/dashboard`와 값이 갈린다.
- `아무 하위 팀도 없고 팀원이 나뿐`이면 요약을 숨기고 테이블만 보여준다(1인 팀에 평균은 무의미).

**결정 6 — 범위 밖 (명시)**

- **인건비·급여 축 없음**(§R3-B).
- **프로젝트 배정/해제 없음** — `addTeamMembersToProject`는 P2 코어, `removeProjectMemberByAccount`는 P1-B에서 P2로 연기됐다. N7은 **읽기 전용 분석 + 기존 스킬 편집**만이다.
- 팀원 간 비교 랭킹 없음 — 인사평가 오용 소지가 있고 요구에 없다.

#### 키/이름 동봉 규칙 (verifier 판정 기준)

이 리포는 두 관례가 공존한다. **엔드포인트마다 인접 필드의 관례를 따른다** — 통일하려 하지 말 것(기존 코드를 건드리게 되어 회귀 위험이 커진다).

| 관례 | 대상 | 근거 |
|---|---|---|
| `teamKey` + `teamName` 둘 다 | `getUserListWithPaging`, `findUserByAccountId`, `findProjectusersByProjectId`, `getResourceOverview`, `getTeamMemberCandidates` | 같은 객체에 이미 `roleKey`+`roleName`, `levelKey`+`levelName`이 나란히 있다 |
| `teamKey`만 (프론트가 메타 훅으로 매핑) | `getResourceAnalysisList.members[]`, `getProjectCostSummary.byTeam[]` | 이 객체들엔 이름 필드가 아예 없다(전부 지표 숫자 또는 `{key,...}`). `CostByRoleLevel`이 `useRoleLevel()`로 `key→name`을 매핑하는 기존 패턴 그대로 |
| 서버가 이름으로 치환 | 대시보드 `team` dataType | `normalizeLabelRows(rows, labelMap)`가 role/level에서 이미 그렇게 한다 |

### P3 — 프로젝트별 팀 심화 분석 (N3) · 신규 resolver 0

> **P3는 신규 resolver를 하나도 만들지 않는다.** 전부 기존 resolver의 응답 확장 + 프론트 집계다. 따라서 `PermissionMap`·`ResourceCatalog`·계약 테스트 변경이 없다.

| resolver | 변경 | 응답 shape (추가분, 글자 그대로) | 프론트 |
|---|---|---|---|
| `getResourceAnalysisList` | **변경 없음** ✅ | — | 아래 근거 참조 |
| `getProjectCostSummary` | **루트에 `byTeam` 추가** | `byTeam:[{ key, planned, actual, memberCount }]` — **`byRole`/`byLevel`과 완전 동일 shape** | `CostByRoleLevel`을 role/level/team 3-way 토글로 확장 |
| `findProjectusersByProjectId` | 행에 필드 2개 (**P2에서 이미 추가됨** — P3 추가 변경 0) | 행에 `teamKey`, `teamName` | 인력 탭 팀 그룹핑 + 인력 분석 리포트 팀 축 |
| `getChartDataById` | `data_type: 'team'` 분기 추가 | `chartType`에 따라 기존 `formatChartData` 계약 그대로:<br/>pie → `{ data:[{ name, value, avatarUrl:null }] }`<br/>bar·line → `{ categories:[...], seriesData:[{ data:[...] }] }` | 대시보드 '팀별 기여' 위젯 |

**`getResourceAnalysisList`를 건드리지 않는 이유 (실측 기반)**
`ResourceAnalysisPage`는 **행 축과 지표 축이 이미 분리**되어 있다 — 행은 `findProjectusersByProjectId`(페이징)에서 오고, 지표는 `getResourceAnalysisList`(기간 전체 1회, KVS 10분 캐시)에서 와서 `accountId` Map으로 병합된다. **P2에서 `findProjectusersByProjectId` 행에 이미 `teamKey`/`teamName`이 실리므로, 팀 축에 필요한 정보를 프론트가 전부 갖고 있다.**
→ 부수 효과 2가지: (1) `ResourceList:${projectId}:${startDate}:${endDate}` **캐시 키를 확장할 필요가 없다**(축을 서버가 모르므로), (2) 팀 이동이 워크로그 캐시 10분에 갇히지 않고 즉시 반영된다.

- **`getProjectCostSummary`는 `content` 래퍼가 없다.** 응답이 `{ success, currency, project, rates, budget, evm, monthlyCost, plannedBudgetLine, byRole, byLevel, byIssue }` 루트 구조이므로 `byTeam`도 **루트에 붙인다.** 팀 도메인의 `content` 규약을 여기 적용하지 말 것(기존 소비 코드가 전부 깨진다).
- `getProjectCostSummary`는 KVS 10분 캐시(`ProjectCost:${projectId}`)를 쓴다. `byTeam`은 `byRole`/`byLevel`과 함께 캐시되므로 팀 이동 반영이 최대 10분 지연 — 분석 화면이므로 수용(권한 판정의 90초와 별개 축).

---

## 4. 백엔드 설계

### 4-1. 계층 분해

```
src/resolver/backoffice/team/
  TeamController.js     registerTeamController(resolver) — guardedDefine 만
  TeamService.js        비즈니스 로직 (KVS team + users SQL 조합, Jira 사용자 조인)
  TeamRepository.js     users.team_key 관련 SQL (팀원 조회/이동/해제/카운트)
  TeamTree.js           순수 함수 — buildTeamIndex / descendantsOf / isDescendant / nearestAncestorWith
  TeamTreeCache.js      getTeamIndex() TTL 60초 모듈 캐시 + invalidateTeamIndex()
  __test__/TeamTree.test.js   사이클·깊이·후손 산출 테스트 (필수)

src/resolver/projectTeam/            (P2)
  ProjectTeamController.js / ProjectTeamService.js / ProjectTeamRepository.js
src/rdb/query/ProjectTeamQuery.js    (P2)
```

**재사용할 기존 자산 (새로 만들지 말 것)**
| 필요 | 재사용 대상 |
|---|---|
| KVS CRUD | `customEntityManager('team')` — `save/findById/findByWhere/delete` |
| 이름 중복 검사 | `PermissionService.checkDuplicated` 패턴 (`findByWhere('name', name)` 후 key 비교) |
| Jira 사용자 벌크 조회 | `UserService.userMap(rows)` (export 되어 있음) |
| 권한세트 이름 맵 | `PermissionService.getPermissionListService()` |
| role/level 이름 맵 | `getRoleListService()` / `getLevelListService()` |
| **팀 이름 맵** | **`TeamTreeCache.getTeamIndex()` (60초 캐시)를 재사용한다 — L2.** `roleLevelMap()`(`UserService.js:112`)은 `prepareUserMappingContext`를 거쳐 **사용자 목록 조회마다** 호출되므로, 여기에 무캐시 `findAllPaged()`를 넣으면 목록 조회마다 KVS 커서 루프가 돈다. **쓰기 경로만 캐시를 우회한다**(§R1 M1 규칙) |
| 사용자 조회/필터 | `UserRepository.findUsersRepository` / `findUsersPagedRepository` (QueryBuilder `whereEq('team_key', ...)` 추가) |
| 팀원 프로젝트 배정 | `ProjectUsersService.insertProjectusersService` (P2 일괄 추가에서 그대로 호출) |
| 페이징 응답 형태 | `getUserListWithPagingService`의 `{ content, page:{...} }` |

### 4-2. `TeamRepository` 신규 SQL (전부 신규 — 기존 쿼리 불변)

`UserQuery`에 키 추가(기존 키 불변):
```js
TEAM_COUNT: `
    SELECT COALESCE(team_key, 'NONE') AS team, COUNT(*) AS count
    FROM users GROUP BY COALESCE(team_key, 'NONE')`,
UPDATE_TEAM_BY_ACCOUNTS: `UPDATE users SET team_key = ?, updated_id = ? WHERE account_id IN `, // + generateInClause
CLEAR_TEAM_BY_TEAM_KEY:  `UPDATE users SET team_key = NULL WHERE team_key = ?`,
```
`TeamRepository` export:
| 함수 | 하는 일 |
|---|---|
| `findAccountIdsByTeamKeys(teamKeys)` | **빈 배열 가드 필수 (C3)** — `if (!teamKeys?.length) return [];` 후 `QueryBuilder.from('users').whereIn('team_key', teamKeys)` |
| `findUsersByTeamKey(teamKey)` | 팀원 전체 행 |
| `countUsersByTeam()` | `UserQuery.TEAM_COUNT` |
| `moveUsersToTeam(accountIds, teamKey, updatedId)` | 벌크 UPDATE |
| `clearTeamOfUsers(accountIds, updatedId)` | `team_key = NULL` 벌크 |
| `clearTeamByTeamKey(teamKey)` | 팀 삭제 시 소속 해제 |

#### 빈 집합 가드 — **C3 (Blocker) 대응. 설계서의 핵심 안전 주장이 뒤집혀 있었다.**

**실측된 문제** (`src/rdb/query/QueryBuilder.js:40-55`)
```js
whereIn(col, values) {
    if (values == null) return this;
    const arr = Array.isArray(values) ? values : [values];
    if (arr.length === 0) return this;        // ← 조건이 통째로 사라진다
    ...
    if (!list) return this;                   // ← null/'' 만 있어도 마찬가지
```
`whereEq(col, value)`도 동일하다 — `null`/`undefined`면 조건을 버린다(`:34-38`).

**따라서 `scopeTeamKeys = []`(팀 미소속 TEAM_ONLY 사용자, 또는 §R1 사이클 강등으로 스코프가 빈 경우)에서 `findAccountIdsByTeamKeys([])`를 호출하면 `WHERE` 절 없는 `SELECT * FROM users` → 전사 accountId → `memberProjectIds` = 전 프로젝트.** §R6 표가 "fail-close 준수"라고 적은 자리가 **실제로는 fail-open**이었다.

**규칙: 빈 집합은 쿼리를 발행하지 않고 빈 결과를 반환한다. Repository 진입부에서 막는다.**
- 호출부 방어에 의존하지 않는다 — 호출부는 늘어나고 언젠가 하나가 빠진다.
- **`QueryBuilder` 자체는 고치지 않는다.** 근거: `whereIn`/`whereEq`의 "빈값 = 조건 무시"는 `findUsersPagedRepository`·`findUsersRepository`·`findProjectRepository` 등 **기존 다수 호출부가 선택적 필터로 의존하는 동작**이다(`whereEq('role_key', null)` = 직무 필터 미적용). 여기를 바꾸면 검색 필터 전반이 회귀한다. **위험한 것은 QueryBuilder가 아니라 "스코프 축소용으로 쓰면서 빈 집합을 넘기는 것"이므로, 그 지점에서 막는 것이 정확한 처방이다.**

**신규 쿼리 전수 점검 결과**

| 신규 지점 | 빈 입력 시 | 조치 |
|---|---|---|
| `findAccountIdsByTeamKeys(teamKeys)` | **fail-open** (전사 반환) | ✅ 진입부 `return []` 가드 |
| `findProjectIdsByAccountsRepository(accountIds)` (`FIND_PROJECT_IDS_BY_ACCOUNTS` + `generateInClause(count)`) | **SQL 문법 오류** — `generateInClause(0)`은 `"()"` 를 만들어 `IN ()` 이 된다(실측: `src/rdb/query/CommonQuery.js:49-52`). fail-open이 아니라 **시끄러운 실패** | ✅ 진입부 `return []` 가드 (에러를 내지 않기 위해) |
| `findProjectIdsByTeamKeys(teamKeys)` (P2, `project_team`) | `whereIn` 사용 시 fail-open | ✅ 진입부 `return []` 가드 |
| `moveUsersToTeam(accountIds, ...)` / `clearTeamOfUsers(accountIds, ...)` | UPDATE에 WHERE가 사라지면 **전 사용자 갱신** — 가장 위험 | ✅ 진입부 `return { rowsAffected: 0 }` 가드 **필수** |
| `UserQuery.TEAM_COUNT` | 입력 없음 | 해당 없음 |

> 검토서가 "확인 필요"로 남긴 `generateInClause(0)` 경로는 위와 같이 **문법 오류(fail-close)** 로 확인됐다. `whereIn`과 실패 방향이 반대이므로 두 경로를 같은 규칙으로 뭉뚱그리지 말 것.

**단위 테스트 (P1 필수)**: 각 함수에 빈 배열 입력 → 빈 결과 **그리고 `executeQuery` mock 호출 0회**. 반환값만 보면 가드가 없어도 우연히 통과할 수 있으므로 **SQL 미발행을 반드시 단언**한다.

### 4-3. 앱 레벨 cascade (트랜잭션·FK·ON DELETE CASCADE 전부 없음)

**`deleteTeam(teamKey)` — 순차 멱등 DELETE/UPDATE. 자식 → 부모 순서.**
`deleteProjectService`(`ProjectService.js:89-106`)의 확립된 패턴을 그대로 따른다.
```
1. 자식 팀 재부모화   — 각 자식의 parentTeamKey = 삭제 팀의 parentTeamKey (조부모로 승격, 고아 방지)
2. 소속 사용자 해제   — UPDATE users SET team_key = NULL WHERE team_key = ?     (멱등)
3. 프로젝트 배정 삭제 — DELETE FROM project_team WHERE team_key = ?             (멱등, P2)
4. 팀 마스터 삭제     — customEntityManager('team').delete(teamKey)             (부모, 마지막)
5. invalidateTeamIndex()   (best-effort)
```
- 1번을 "자식도 함께 삭제"로 하지 않는 이유: 조직 개편에서 중간 관리 계층만 없애는 것이 일반적이고, 재귀 삭제는 트랜잭션 없이 부분 실패 시 복구가 불가능하다. **하위 팀 통째 삭제는 UI에서 하위부터 순차 삭제**로 유도.

**삭제·재부모화의 조용한 권한 상실 — H5 대응**

`permission_key IS NULL`(= 팀 상속, R2) 상태인 팀원은 팀이 사라지는 순간 `permissionSource:'none'` → **전 리소스 false**가 된다. 로그인은 되는데 아무것도 안 보인다. 재부모화도 같다 — 삭제되는 중간 팀이 `permissionKey` 보유자였다면 그 **후손 팀의 상속자들은 실효 권한이 말없이 조부모 세트로 바뀐다**(넓어질 수도, 좁아질 수도 있다).

설계서는 같은 종류의 위험에 §R6(TEAM_ONLY 전환 경고)·§R7(상속 선택 미리보기) 두 곳에서 경고를 설계해 놓고 **삭제·재부모화에만 빠뜨렸다.** `detachedUserCount`는 "몇 명이 해제됐다"만 말하고 "그중 N명이 모든 권한을 잃었다"는 말하지 않는다.

1. **삭제 확인 모달 앞에 영향 미리보기.** **추가 resolver 불필요** — §R7 미리보기와 정확히 같은 데이터(`getTeamList`의 `teams[].parentTeamKey/permissionKey` + `findTeamById`의 `members[]`)로 프론트가 계산하고, **같은 `buildTeamTree.nearestAncestorWith` 순수 함수**를 쓴다(위 P1~P8 케이스표가 이 계산도 함께 보증한다).
2. **`deleteTeam` 응답에 `permissionLostCount`, `inheritanceChangedCount` 추가** — §R3-C "조용한 실패 금지"와 동일 원칙. 삭제 후 토스트가 "팀원 5명 해제, **그중 2명이 모든 권한을 잃었습니다**"까지 말한다.
3. 팀장 본인이 그 팀에서 제거되거나 팀이 삭제되면 `leadingTeamKeys`가 비어 `isTeamLead:false`가 된다 — **자연히 fail-close라 문제없다.** 다만 §R1의 90초 stale 창 동안 팀장 권한이 살아 있다(이미 명시·수용).
- 중간 단계 실패 시: 다음 호출에서 같은 순서로 재실행하면 남은 것만 지워진다(멱등). 4번이 마지막이므로 팀 마스터가 남아 있으면 재시도 가능하다.

**`deleteProjectService` 확장 (P2)** — 기존 8단계 사이에 삽입:
```
... 3. deletePortfolioSnapshotByProjectRepository
+++ 3.5 deleteProjectTeamsByProjectRepository   → project_team          (신규)
    4. deleteGanttFolderLinksByProjectRepository
...
```

### 4-4. 에러 코드 (`src/utils/errors/ErrorCodes.js` 추가)

| 코드 | 발생 조건 | 에러 클래스 |
|---|---|---|
| `TEAM_NOT_FOUND` | 대상 팀 없음 | `LogicalError` |
| `TEAM_NAME_REQUIRED` | 이름 미입력 | `LogicalError` |
| `TEAM_NAME_DUPLICATED` | 이름 중복 (`NAME_DUPLICATED` 재사용도 가능하나 메시지 구분 위해 분리) | `LogicalError` |
| `TEAM_CYCLE_DETECTED` | 상위 팀이 자기 자신 또는 자기 후손 | `LogicalError` |
| `TEAM_DEPTH_EXCEEDED` | 깊이 > `MAX_TEAM_DEPTH`(10) | `LogicalError` |
| `TEAM_LIMIT_EXCEEDED` | 팀 수 > 500 (또는 KVS 캡) | `LogicalError` |
| `TEAM_HAS_CHILDREN` | (미사용 예정 — 재부모화로 처리. 정책 변경 시 대비해 예약) | — |
| `TEAM_LEADER_NOT_MEMBER` | 팀장이 그 팀 소속이 아님 — **경고만, 거부 안 함**(본부장이 하위 팀 리더인 경우 정상) | (사용 안 함) |
| `TEAM_SCOPE_TOO_LARGE` | `teamScopeAccountIds` > 2000 | `PermissionError` |
| `TEAM_MEMBER_SELECTION_EMPTY` | `addTeamMembersToProject`에 `accountIds: []` (빈 배열) — 의도 없는 전체 배정 방지 (N1) | `LogicalError` |
| `TEAM_MEMBER_NOT_IN_SCOPE` | `accountIds`에 대상 팀 트리 밖 인원 포함 — 요청 전체 거부 (N1) | `LogicalError` |
| `TEAM_ASSIGN_BATCH_TOO_LARGE` | `accountIds.length > 500` (N1) | `LogicalError` |
| `PERMISSION_TEAM_SCOPE_DENIED` | (예약) 팀장 대상 검증 실패 시 별도 코드가 필요해지면 | `PermissionError` |

팀장 대상 검증 실패는 **별도 코드를 쓰지 않고 기존 `PERMISSION_DENIED`로 통일**한다 — 어떤 계정이 내 팀인지/아닌지가 에러 코드로 새어나가지 않게 하기 위함(정보 노출 최소화).

### 4-5. `src/index.js` 등록

```js
import {registerTeamController} from "./resolver/backoffice/team/TeamController";      // P0
import {registerProjectTeamController} from "./resolver/projectTeam/ProjectTeamController"; // P2
...
registerTeamController(resolver);
registerProjectTeamController(resolver);
```
**계약 테스트 동시 수정 필수** — `test/permission/permissionMap.contract.test.js`의 import + `collectRegisteredNames()`에 두 줄 추가하지 않으면 "(2) 고아 매핑 없음" 테스트가 깨진다.

#### 등록 목록의 이중 관리 제거 — M7 대응

**검토서 지적의 정정**: 위 문장이 "부정확하다"는 지적은 **부분적으로만 맞다.** §4-6이 `PermissionMap` 등재를 의무화하므로, 구현자가 매핑을 넣고 테스트 목록을 빠뜨리면 그 키들은 `mappedSet`에만 있고 `registeredSet`에 없어 **"(2) 고아 매핑 없음"이 실제로 실패한다.** 위 문장은 그 경로에서 참이다.

**다만 검토서가 지적한 사각지대는 실재한다** — **둘 다 빠뜨리면** 두 집합 모두에 없으므로 테스트가 통과하고, 런타임에서만 `PERMISSION_UNMAPPED`로 죽는다. 그리고 더 근본적으로, **같은 컨트롤러 목록이 `src/index.js`와 테스트 파일에 손으로 복제돼 있다 — 이것 자체가 §8-3 카테고리 C2(백엔드 내부 목록 복제)다.**

→ **구조적 해소**: `src/index.js`가 컨트롤러 등록 함수 배열을 export 하고, 테스트가 그것을 import 한다.
```js
// src/index.js
export const CONTROLLER_REGISTRARS = [
    registerUserController, registerRoleController, /* … */,
    registerTeamController, registerProjectTeamController,   // 신규는 여기 한 곳만
];
CONTROLLER_REGISTRARS.forEach(register => register(resolver));
```
```js
// test/permission/permissionMap.contract.test.js
import { CONTROLLER_REGISTRARS } from '../../src/index';
const collectRegisteredNames = () => { const names=[]; const mock={define:(n)=>{names.push(n); return mock;}};
    CONTROLLER_REGISTRARS.forEach(r => r(mock)); return names; };
```
이러면 "index.js에 등록했는데 테스트 목록에서 빠뜨림"이 **구조적으로 불가능**해진다. 이 리팩터는 **P0에 포함**한다(신규 컨트롤러 2종을 넣기 전에 하는 것이 싸다).

⚠ **`teamLead.targets`가 실제 payload 키인지는 계약 테스트가 정적으로 알 수 없다 — H2가 정확히 이 사각지대에서 나왔다.** 완전한 해소는 불가능하므로, §R3-A의 "`teamLead` 보유 키 ⊆ `TEAM_LEAD_WRITE_ALLOWLIST`" 테스트로 **키 이름 오타를 부분 검출**하고, 나머지는 §8 특별 주의 4번(선행 read + payload 키 실측)에 의존한다.

### 4-6. `PermissionMap` 추가

```js
// ── Team (TeamController, 8) ──────────────────────────────────────────────
getTeamList:            OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read']]),
findTeamById:           OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read']]),
getTeamOptions:         OR([['TEAM_MANAGEMENT','read'], ['USER_MANAGEMENT','read'],
                            ['RESOURCE_MANAGEMENT','read'], ['REPORT','read'], ['PROJECT','read']]),
addTeam:                W('TEAM_MANAGEMENT'),
updateTeam:             W('TEAM_MANAGEMENT'),
deleteTeam:             W('TEAM_MANAGEMENT'),
assignUsersToTeam:      W('TEAM_MANAGEMENT'),
unassignUsersFromTeam:  W('TEAM_MANAGEMENT'),

// ── ProjectTeam (ProjectTeamController, 4) — P2 ──────────────────────────
getProjectTeams:         OR([['PROJECT','read'],  ['RESOURCE_MANAGEMENT','read']],  'detail'),
getTeamMemberCandidates: OR([['PROJECT','read'],  ['RESOURCE_MANAGEMENT','read']],  'detail'),
setProjectTeams:         OR([['PROJECT','write'], ['RESOURCE_MANAGEMENT','write']], 'inherited'),
addTeamMembersToProject: OR([['PROJECT','write'], ['RESOURCE_MANAGEMENT','write']], 'inherited'),
```
**`getTeamMemberCandidates`의 `teamKey` 검증 (L1 대응)** — grant가 `project:'detail'`이라 **프로젝트 스코프만 검증되고 `teamKey`는 검증되지 않는다.** 그대로 두면 `PROJECT read` 보유자가 임의 팀 키로 **그 팀 전원의 이름·직무·등급**을 조회할 수 있다. §4-6이 "팀 **이름**은 민감정보가 아니다"라고 한 논리를 **인원 명단**까지 확장하지는 않는다.
→ **서비스에서 `teamKey`를 다음 중 하나로 제한한다. 아니면 `TEAM_NOT_IN_PROJECT_SCOPE` 거부.**
1. 요청 `teamKey`가 그 프로젝트의 `project_team`에 배정된 팀(또는 그 후손), **또는**
2. 요청자가 `TEAM_MANAGEMENT` read 보유(조직 관리자)

UI 흐름이 "프로젝트에 팀 배정 → 그 팀에서 골라 담기"이므로 1번이 정상 경로이고, `setProjectTeams`가 선행한다. 2번은 백오피스 관리자의 예외 경로다.

`getTeamMemberCandidates`가 `TEAM_MANAGEMENT`가 아니라 **프로젝트 축 grant**를 쓰는 이유: 개별 인원 선택 UI의 진입점은 프로젝트 상세 인력 탭이다. 프로젝트 관리자가 `USER_MANAGEMENT`/`TEAM_MANAGEMENT` read를 갖고 있지 않은 경우가 일반적이므로, `findTeamById`(백오피스용)를 재사용하면 **선택 목록이 조용히 비어버린다.** 별도 resolver를 두는 비용보다 이 실패가 크다. 응답도 백오피스용보다 좁다(급여·권한세트 미포함).
`getTeamOptions`의 grant가 넓은 이유: 분석 화면의 팀 필터 셀렉트가 이걸 쓰는데, 그 화면 진입자는 `REPORT`/`RESOURCE_MANAGEMENT`만 가진 경우가 많다. 팀 이름은 민감정보가 아니며 `TEAM_MANAGEMENT` read를 요구하면 필터가 조용히 비어 버린다(과거 자원관리 통합 탭에서 동일 유형의 grant OR 확장 선례).

`teamLead` 축 추가 (P2):
```js
updateUser:                   { ...W('USER_MANAGEMENT'), teamLead:{ targets:['id'] } },
findUserByAccountId:          { ...R('USER_MANAGEMENT'), teamLead:{ targets:['accountId'] } },
setUserSkills:                { ...W('RESOURCE_MANAGEMENT'), teamLead:{ targets:['accountId'] } },
insertProjectusers:           { ...OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']],'inherited'),
                                teamLead:{ targets:['accountIds'] } },
removeProjectMemberByAccount: { ...OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']],'inherited'),
                                teamLead:{ targets:['accountId'] } },
```
기존 계약 테스트의 "각 엔트리는 PUBLIC/SELF 또는 `{grants, project}` 형태" 검사는 **추가 키를 허용**하므로 깨지지 않는다. 다만 `teamLead` 전용 신규 테스트를 추가한다(§7).

### 4-7. `ResourceCatalog` 추가

```js
{ key: 'TEAM_MANAGEMENT', section: 'SETTINGS',
  labelKey: 'common.pages.team', descriptionKey: 'permission.desc.TEAM_MANAGEMENT',
  covers: ['백오피스 팀 관리(/backoffice/team)', '팀 소속 배치'],
  admin: t, member: ff, defaultForNew: ff },
```
- 위치: SETTINGS 섹션, `USER_MANAGEMENT` 바로 다음(정의 순서 = 프론트 노출 순서).
- 분리 기준 충족: (b) 대상 사용자군이 다름 — 팀 편성은 조직 관리자 업무이고 사용자 계정 관리와 담당이 갈린다. (c) write 의미가 다름 — 계정 생성/삭제와 조직 편성은 별개 리스크.
- `migrateFrom` **지정하지 않음** — 기존 `USER_MANAGEMENT` write 보유자에게 팀 편집 권한이 자동으로 생기면 안 된다(권한 확대는 명시적이어야 함). `defaultForNew: ff` = 기존 커스텀 세트는 전부 false로 시작.
- 카탈로그 키 수 16 → **17**.

### 4-8. `projectScope` 정규화 단일화 — **C2 (Blocker) 대응**

**실측된 문제**: `scope === 'MEMBER_ONLY' ? 'MEMBER_ONLY' : 'ALL'` 리터럴 삼항이 **4곳에 독립 복제**되어 있다. `TEAM_ONLY`를 넣으면 **전부 `'ALL'`로 격하**된다.

| # | 위치 | 역할 | 미수정 시 결과 |
|---|---|---|---|
| 1 | `src/permission/PrincipalResolver.js:32` | **판정** | TEAM_ONLY 세트 → `'ALL'` → **권한 축소 의도가 권한 확대로 뒤집힌다**(fail-**open**) |
| 2 | `src/resolver/backoffice/permission/PermissionService.js:13` | 저장 | TEAM_ONLY 저장 자체가 안 됨 |
| 3 | `src/seed/SeedData.js:54` | Member 시드 | TEAM_ONLY Member가 ALL로 리셋 |
| 4 | `src/seed/SeedData.js:93` | **커스텀 세트 전수 순회** (`migratePermissionSets`) | **시한폭탄** — 다음 `SEED_VERSION` bump 때 전사 커스텀 세트의 TEAM_ONLY가 조용히 ALL로 리셋 |

#1은 화면상 정상으로 보인다(권한 페이지에 TEAM_ONLY가 선택돼 있음)는 점에서 특히 위험하다. #4는 P1 배포 후 **다음 기능이 SEED_VERSION을 올리는 순간** 발현한다.

**결정: `src/permission/ProjectScope.js` 신규 파일로 승격하고 4곳 전부 import. 리터럴 삼항을 하나도 남기지 않는다.**

```js
// src/permission/ProjectScope.js — projectScope 값 도메인의 단일 출처
export const PROJECT_SCOPES = Object.freeze(['ALL', 'MEMBER_ONLY', 'TEAM_ONLY']);

/** 허용값이 아니면 'ALL' 폴백(현행 동작 보존). 신규 스코프는 이 배열에만 추가한다. */
export const normalizeScope = (scope) =>
    PROJECT_SCOPES.includes(scope) ? scope : 'ALL';
```

**계약 테스트 2건 (P1 필수)**
1. `PROJECT_SCOPES.every(s => normalizeScope(s) === s)` — 신규 스코프 추가 시 격하를 자동 검출.
2. **재복제 방지 정적 검사** — `src/` 전역에서 `'MEMBER_ONLY' ?` 형태의 리터럴 삼항이 **0건**임을 단언(파일 읽어 정규식 매칭). 이 규칙이 없으면 같은 복제가 재발한다.

**§9 P1 배포 가능 판정에 완결 조건으로 명시**: "`PrincipalResolver`·`PermissionService`·`SeedData`(2곳) 네 지점이 모두 `ProjectScope.js`를 import 하고, TEAM_ONLY가 왕복(저장→시드 순회→판정)에서 보존된다."

> 이 항목은 **§8-3 이중 구현 지점 등록부**에 **카테고리 C1**로 등재했다. 1·2차 설계는 프론트↔백엔드 축만 이중 구현으로 인식했고, 백엔드 내부의 같은 규칙 N중 복제라는 축을 놓쳤다.

### 4-9. `updateUser`의 "미전달 = NULL" 시맨틱 — **C1 (Blocker) 대응. P0 선결 항목.**

**실측된 문제**
```sql
-- src/rdb/query/UserQuery.js:29  UPDATE_USER
UPDATE users SET role_key = ?, level_key = ?, permission_key = ?, updated_id = ? WHERE account_id = ?;
```
```js
// src/resolver/backoffice/user/UserService.js:343-347
const safePermissionKeyKey = permissionKey === undefined ? null : permissionKey
```
→ **부분 갱신 쿼리가 아니다.** payload에 키가 없으면 `undefined` → `null` → **해당 컬럼이 NULL로 덮어써진다.**

**이것은 P1이 아니라 P0 문제다.** P0에서 `updateUser`가 `teamKey`를 수용하도록 확장하는데, 기존 프론트(`useUserEditModal.js`)는 `{id, roleKey, levelKey, permissionKey, salary}` 5필드만 보낸다. 같은 패턴으로 `teamKey`를 추가하면 **관리자가 직무만 바꿔 저장해도 그 사용자의 팀 소속이 NULL로 사라진다.** 팀장 경로보다 먼저, 관리자의 일상 조작에서 발현한다.

#### 불변식 (P0에서 확립, 이후 모든 단계가 의존)

> **`updateUser` payload에 없는 필드는 변경되지 않는다.**

기존 "명시적 `null`로 해제" 동작과 구분이 필요하므로, **`undefined`(미전달)와 `null`(명시적 해제)을 반드시 다르게 취급**한다. 현재 서비스는 둘을 동일하게 뭉개고 있고 그것이 결함의 원인이다.

#### 채택안 — **서비스 레벨 read-merge (동적 SQL 조립 아님)**

```js
// updateUserService 진입부
const current = (await findByAccountId(id))?.rows?.[0];
if (!current) throw new LogicalError(ErrorCodes.USER_NOT_FOUND, ErrorCodes.USER_NOT_FOUND);

// 미전달(undefined) → 현재값 보존 / 명시적 null → 해제
const pick = (incoming, currentValue) => (incoming === undefined ? currentValue : incoming);

const nextRoleKey       = pick(roleKey,       current.role_key);
const nextLevelKey      = pick(levelKey,      current.level_key);
const nextPermissionKey = pick(permissionKey, current.permission_key);
const nextTeamKey       = pick(teamKey,       current.team_key);
const nextSalary        = pick(salary,        current.salary);
```

**세 대안 중 이것을 고른 근거**

| 대안 | 판정 |
|---|---|
| A. `UPDATE_USER`를 동적 SET 조립로 전환 | ❌ SQL 문자열 조립이 늘고, `QueryBuilder`에 UPDATE 지원이 없어 신규 조립기를 만들어야 한다 |
| B. `CASE ? WHEN '' THEN col ELSE ? END`(`ProjectUsersQuery.UPDATE_BY_KEY_WITH_PARAMS` 선례) | ❌ 빈 문자열을 센티넬로 쓰므로 **"명시적 null로 해제"를 표현할 수 없다.** 권한 해제(팀 상속 전환, R2)가 바로 그 동작이라 치명적 |
| **C. 서비스 read-merge (채택)** | ✅ SQL 무변경(`UPDATE_USER`/`UPDATE_USER_WITH_SALARY` 그대로), `undefined`/`null` 구분이 JS 레벨에서 자연스럽다, 읽기 1회 추가는 사용자 편집이라 비용 무시 가능, **기존 호출부 무회귀**(현재 프론트는 5필드를 항상 보내므로 동작이 100% 동일) |

- `salary` 분기(`UPDATE_USER` vs `UPDATE_USER_WITH_SALARY`)도 이 병합 결과로 판정한다 — `nextSalary`가 `current.salary`와 같으면 굳이 salary 쿼리를 쓸 필요가 없지만, **단순함을 위해 항상 `UPDATE_USER_WITH_SALARY`를 쓰고 병합된 값을 넣는 것을 권장**한다(분기 자체가 결함의 온상이었다).
- `addUser`는 INSERT라 이 문제가 없다(미전달 = NULL이 올바른 초기값).

#### 테스트를 서비스 경계로 올린다 (기존 §R3-A 테스트의 사각지대)

기존 설계의 보안 테스트는 `applyTeamLeadFieldPolicy`의 **반환값만** 검증했다. 정책 함수는 명세대로 동작하므로 통과하고, 결함은 그 다음 단계(서비스→SQL)에 있었다. **테스트 지점을 옮긴다.**

- [ ] `updateUser({ id, roleKey })` 호출 → repository에 전달된 인자에서 `permission_key`·`salary`·`team_key`가 **호출 전 값과 동일**함을 단언 (repository mock 인자 레벨)
- [ ] `updateUser({ id, permissionKey: null })` → `permission_key`가 **실제로 NULL**로 전달됨을 단언 (팀 상속 전환이 계속 동작해야 한다)
- [ ] 위 두 케이스를 `teamKey`에 대해서도 반복

> **일반 규칙 (§8 특별 주의에 추가)**: "재사용한다"고 선언한 기존 함수는 **미전달·빈값 시맨틱을 반드시 열어본다.** C1(UPDATE가 NULL을 쓴다)·C3(빈 IN이 조건을 버린다)이 같은 원인에서 나왔다.

---

## 5. DB 설계

### 5-1. KVS `team` 엔티티 — `manifest.yml` `app.storage.entities` 추가

```yaml
      - name: team
        attributes:
          id:
            type: string
          name:
            type: string
          parentTeamKey:
            type: string
          leaderAccountId:
            type: string
          permissionKey:
            type: string
          description:
            type: string
          sortOrder:
            type: integer
        indexes:
          - name
```
- 저장 레코드 예:
  `{ id:'team-<uuid>', name:'개발팀', parentTeamKey:'team-<본부uuid>', leaderAccountId:'5b10...', permissionKey:'permission-Member', description:'', sortOrder:0 }`
- **`parentTeamKey`는 루트일 때 `''`(빈 문자열)로 저장**한다. `null`/미설정 필드는 KVS 인덱스·스키마 검증에서 취급이 불명확하므로 회피. 응답 조립 시 `|| null`로 정규화한다(§3 null 규약).
- 키 생성: `team-${crypto.randomUUID()}` (기존 `job-${crypto.randomUUID()}` 선례).
- **`indexes: - name` 필수** — 없으면 `findAll()`/`findByWhere('name', ...)`가 모두 실패한다(`settings`/`job`이 인덱스 없어 `findAll` 불가한 선례).
- KVS 엔티티 11종 → **12종** (20종 한도 내, 여유 8).
- **manifest 변경은 `forge deploy` 후에야 반영된다.** 미선언 필드 저장 시 422 semantic error.

### 5-2. MySQL — `users.team_key` 컬럼 추가 (P0)

`src/rdb/schema/ddl/users.sql.js`에 추가:
```js
// 팀 도입 — 사용자 소속 팀(KVS team 엔티티 key). 단일 소속(D1) 이므로 스칼라 컬럼 1개.
// role_key / level_key / permission_key 와 완전 동형. NULL = 팀 미소속(정상 상태, 하위호환).
// 인덱스는 두지 않는다 — users 는 소규모이고 role_key/level_key 에도 인덱스가 없다(선례 일치).
export const ALTER_USERS_ADD_TEAM_KEY = `
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS team_key VARCHAR(50) NULL
`;
```

### 5-3. MySQL — `project_team` 테이블 (P2)

`src/rdb/schema/ddl/projectTeam.sql.js` 신규:
```js
// 프로젝트 ↔ 팀 담당 배정 (D3). project_skills / user_skills 와 동형의 다대다 매핑 테이블.
// 마스터(team)는 KVS 이므로 team_key 는 VARCHAR(50) 문자열 키. project_id 는 BINARY(16).
// FK/CASCADE 는 TiDB 미강제 → 선언하지 않고 앱레벨 멱등 DELETE 로 처리(§4-3).
export const CREATE_PROJECT_TEAM_TABLE = `
    CREATE TABLE IF NOT EXISTS project_team (
        project_id  BINARY(16)  NOT NULL,
        team_key    VARCHAR(50) NOT NULL,
        is_primary  TINYINT(1)  NOT NULL DEFAULT 0,

        created_id  VARCHAR(100),
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (project_id, team_key),
        INDEX (team_key)
    );
`;
```
- `is_primary`: 주 담당 팀 1개 표시(대표 팀 뱃지용). **DB 레벨 유일성 강제는 하지 않는다**(트랜잭션 없음) — `setProjectTeams`가 프로젝트 단위로 전량 DELETE 후 재삽입하므로 서비스가 보장한다.
- 행 수 추정: 프로젝트 200 × 평균 팀 2 = 400행 → 1GiB 한도에 무의미한 수준.
- 앱 테이블 11종(`project`, `project_dashboard`, `users`, `user_schedule`, `projectusers`, `portfolio_project_snapshot`, `gantt_folder`, `gantt_folder_issue`, `gantt_folder_link`, `user_skills`, `project_skills`) → **12종** (200 한도 내).

### 5-4. 마이그레이션 등록

`src/rdb/schema/ddl/index.js`:
```js
export { CREATE_USERS_TABLE, CREATE_USER_SCHEDULE_TABLE, ALTER_USERS_ADD_TEAM_KEY } from './users.sql';
export { CREATE_PROJECT_TEAM_TABLE } from './projectTeam.sql';   // P2
```
`src/rdb/schema/migrate.js` — **체인 맨 아래에만 추가. 기존 enqueue 이름·순서는 절대 변경 금지**(이름이 실행 이력 키):
```js
    .enqueue('v012_alter_projectusers_add_salary_type', ALTER_PROJECTUSERS_ADD_SALARY_TYPE)
    // 팀 도입 — 사용자 소속 팀 컬럼(멱등 ADD COLUMN IF NOT EXISTS, NULL = 미소속)
    .enqueue('v013_alter_users_add_team_key', ALTER_USERS_ADD_TEAM_KEY)
    // 팀 도입 P2 — 프로젝트↔팀 담당 배정 매핑
    .enqueue('v014_create_project_team_table', CREATE_PROJECT_TEAM_TABLE)
```
마이그레이션은 `init-db` 스케줄 트리거(hourly) · `onInstall` · `ensureSeed()` 3경로에서 자동 실행된다.

### 5-5. 기존 데이터 영향 요약

| 대상 | 영향 |
|---|---|
| `users` 기존 전 행 | `team_key = NULL` 추가. 기존 컬럼·값 불변. 모든 기존 SELECT `*` 소비 코드는 필드 하나가 늘 뿐 무해 |
| `projectusers` | **없음** |
| `portfolio_project_snapshot` | **없음** (재집계 불필요) |
| KVS 기존 11 엔티티 | **없음** |
| `permission` KVS 세트 | `SEED_VERSION 8` bump 시 `addPermissionSeed`가 Admin/Member 재생성(카탈로그 파생 — Member의 `projectScope` 커스텀 값은 패턴 A가 보존), `migratePermissionSets`가 커스텀 세트에 `TEAM_MANAGEMENT:{false,false}` 보충 |
| 롤백 | DDL은 `IF NOT EXISTS` 멱등. 앱 코드를 되돌리면 `team_key`/`project_team`은 아무도 읽지 않는 inert 상태로 남는다(데이터 손실 없음) |

---

## 6. 프론트엔드 설계

### 6-1. 신규 파일

```
static/ui/src/backoffice/page/team/
  TeamPage.jsx
  TeamTreePanel.jsx
  TeamDetailPanel.jsx
  useTeamTree.js                     useQuery(backofficeKeys.teams()) → invoke('getTeamList')
  useTeamDetail.js                   useQuery(backofficeKeys.findTeams(k)) → invoke('findTeamById')
  buildTeamTree.js                   순수: buildTeamTree / flattenTree / collectParentIds
  __test__/buildTeamTree.test.js
  modal/regist/TeamRegistrationModal.jsx + useTeamRegistrationModal.js
  modal/edit/TeamEditModal.jsx       + useTeamEditModal.js       (삭제 포함, ConfirmModal 사용)
  modal/member/TeamMemberAssignModal.jsx + useTeamMemberAssignModal.js

static/ui/src/components/select/TeamSelect.jsx      공용 — getTeamOptions 소비, depth 들여쓰기 라벨
```

### 6-2. 쿼리키 팩토리 (인라인 키 금지)

`static/ui/src/utils/queryKey/backofficeKeys.js` 추가:
```js
    teams: () => ["teams"],
    findTeams: (teamKey) => ["findTeam", teamKey],
    teamOptions: () => ["teams", "options"],
```
`static/ui/src/utils/queryKey/projectKeys.js` — `projectKeys` 객체에 추가:
```js
    projectTeams: (projectId) => ['projectTeams', projectId],
```
invalidate 책임은 **페이지가 소유**(모달 내부에서 invalidate 금지 — 리포 확립 규약).
팀 write 후 invalidate 대상: `backofficeKeys.teams()`, `backofficeKeys.teamOptions()`, `userKeys.all`(팀 컬럼 반영).

### 6-3. Zustand — `usePermissionStore` 확장 (P1)

```js
  // 신규 상태
  team: { teamKey: null, teamName: null, isTeamLead: false, leadingTeamKeys: [], permissionSource: 'none' },

  // loadPermissions 내부
  set({ ..., team: res?.team ?? { teamKey:null, teamName:null, isTeamLead:false,
                                 leadingTeamKeys:[], permissionSource:'none' } });

  // 신규 셀렉터
  isTeamLead: () => get().team?.isTeamLead ?? false,
  getTeamKey: () => get().team?.teamKey ?? null,
```
- `projectScope`는 필드 그대로, 값에 `'TEAM_ONLY'`가 추가될 뿐. 기존 `getProjectScope()` 무변경.
- **주의**: `isTeamLead()`는 **표시용 게이팅에만** 쓴다. 실제 차단은 서버 가드가 담당한다(기존 `canRead/canWrite` 주석과 동일 원칙). 팀장 전용 버튼을 프론트에서 숨기더라도, 서버가 최종 판정한다.

### 6-4. 권한 게이트

| 화면 | 게이트 |
|---|---|
| `/backoffice/team` | `canRead('TEAM_MANAGEMENT')` → false면 `<NoPermissionPage/>`. 쓰기 버튼은 `canWrite('TEAM_MANAGEMENT')` |
| Sidebar 항목 | `backofficeItems`에 `permission: 'TEAM_MANAGEMENT'` → 기존 `.filter(isReadable)`가 자동 처리 |
| 프로젝트상세 인력 탭 팀 배정 UI | `canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')` (`insertProjectusers` 게이트 미러링) |
| 분석 화면 팀 필터 | 게이트 없음 — `getTeamOptions`가 실패하면 필터를 숨긴다(fail-soft, 화면은 살아 있음) |

### 6-5. 라우팅 / 네비게이션

`App.jsx`: `import TeamPage from "./backoffice/page/team/TeamPage";` + `<Route path="/backoffice/team" element={<TeamPage />} />`
`layout/Sidebar.jsx` `backofficeItems`: `{ key:'/backoffice/team', icon:<PeopleGroupIcon label="Team"/>, label:t('common.backoffice.workforceSetting.team.title'), permission:'TEAM_MANAGEMENT' }` — `/backoffice/users` 바로 다음.

### 6-6. 트리 UI 구현 방침

- `pages/projectDetail/work/`의 트리 뷰 패턴을 복제: **build/flatten을 순수 함수로 분리** + `collapsedIds`는 로컬 `Set` state + `rows = useMemo(() => flattenTree(tree, collapsedIds))`.
- `hasCycle:true` / `truncated:true`가 오면 트리 상단에 경고 배너 + `cycleKeys` 노드에 아이콘 표시(데이터 이상을 숨기지 않는다).

### 6-7. N2. 팀 트리 드래그앤드롭 (2차 요구 반영 2026-07-27)

#### 라이브러리 선정 — **신규 의존성 0. 기존 native DnD 선례를 복제한다.**

실측 결과(`static/ui/package.json` + `node_modules` + `npm ls`):

| 후보 | 실측 | 판정 |
|---|---|---|
| **기존 트리 DnD 선례** `pages/projectDetail/work/TreeStructurePanel.jsx` + `resolveTreeDrop.js`(+테스트 20케이스) | **라이브러리 없는 순수 HTML5 native DnD.** 판정이 순수 함수로 분리돼 있고 `isDescendantNode`(순환 가드)까지 구현됨 | ✅ **채택** |
| `@atlaskit/pragmatic-drag-and-drop@1.7.7` (+`-hitbox@1.1.0`, `-react-drop-indicator@3.2.12`) | `node_modules`에 **이미 설치됨**(transitive: `side-nav-items`·`modal-dialog`·`navigation-system`·`dynamic-table`·`react-kanban-kit`가 끌어옴). 단 `package.json` 직접 의존 아님 = **phantom dependency** | ⚠️ 보류 — 형제 순서 재정렬이 필요해질 때만 |
| `@atlaskit/tree` (구 Atlassian 트리 DnD) | **미설치**, 그리고 deprecated | ❌ |
| `react-dnd` / `@hello-pangea/dnd` / `react-beautiful-dnd` | **전부 미설치** | ❌ 신규 설치 불필요 |

**결정: `resolveTreeDrop.js` 패턴 복제 → `resolveTeamTreeDrop.js`.** 근거:
1. **의존성 추가 0, 번들 증가 0, 빌드 설정 변경 0.** 번들 크기 경고가 이미 상시 발생 중(echarts+apexcharts+fullcalendar+xyflow+mdxeditor+svar-gantt 동거)이고 CI에 임계값 게이트가 없어 **막지는 않지만**, 대안이 0바이트인데 라이브러리를 얹을 이유가 없다.
2. 선례가 **팀 트리와 같은 요구 범위**(부모 재지정 only, 형제 순서 없음)를 정확히 다룬다.
3. 실전 함정이 이미 해결돼 있다 — Firefox 대응(`dataTransfer.setData('text/plain', id)`가 없으면 드래그가 시작조차 안 됨), `dropTargetId` 3-상태 인코딩(`undefined`=없음 / `null`=루트 드롭존 / `string`=노드), 권한 게이트를 **모든 핸들러 진입부에 중복 배치**.
4. 판정이 순수 함수라 DOM 없이 테스트가 붙는다(선례 20케이스).

> **범위 제한 — 형제 순서 재정렬(before/after 삽입선)은 P3-B 범위에서 제외한다.** 선례의 드롭 인디케이터는 "이 노드 안으로(into)" 하이라이트만 있고 형제 사이 삽입선이 없다. 조직도의 형제 순서는 개편 빈도 대비 가치가 낮고, `team.sortOrder`는 편집 모달에서 조정 가능하다. 순서 재정렬이 나중에 요구되면 그때 `@atlaskit/pragmatic-drag-and-drop`·`-hitbox`·`-react-drop-indicator` 3종을 **`package.json`에 명시적으로 승격**해 쓴다(디스크에 이미 있어 설치 비용 0, 다만 phantom dependency 상태로 import 하는 것은 금지 — `react-kanban-kit`이 버전을 올리거나 빠지면 깨진다).

#### 드롭 판정 — 순수 함수 `resolveTeamTreeDrop.js`

```
resolveTeamTreeDrop({ draggedKey, dropTargetKey, teamIndex }) → { type:'moveTeam', teamKey, parentTeamKey } | null
```
`null`을 반환하면 **조용히 무시**한다(에러 토스트 없음) — 선례와 동일. 다음 5가지가 `null`이다:

| # | 조건 | 이유 |
|---|---|---|
| 1 | `draggedKey === dropTargetKey` | 자기 자신 |
| 2 | `isDescendantTeam(teamIndex, draggedKey, dropTargetKey)` | **순환**(자기 후손 아래로 이동) |
| 3 | `teamIndex.byKey.get(draggedKey).parentTeamKey === dropTargetKey` | 무변화 |
| 4 | `dropTargetKey === null && 이미 루트` | 무변화 |
| 5 | `depthOf(dropTargetKey) + subtreeHeight(draggedKey) + 1 > MAX_TEAM_DEPTH` | **깊이 10 초과** |

- `isDescendantTeam`은 선례 `isDescendantNode`와 동일하게 **`visited` Set으로 손상 데이터의 무한 루프까지 방어**한다(§R1의 사이클 방어와 같은 원칙).
- 5번은 선례에 없는 팀 전용 규칙이다. **드래그하는 노드의 서브트리 높이**까지 더해야 한다 — 단일 노드만 보면 깊은 서브트리를 옮길 때 서버에서만 거부되어 롤백이 발생한다.

#### 드롭 불가 영역의 시각적 구분 (요구사항 명시 항목)

선례의 3신호 + 팀 전용 1신호:

| 신호 | 구현 |
|---|---|
| ① 드래그 소스 | `opacity: 0.45` |
| ② 드롭 가능 타깃 | `background: token('color.background.selected.hovered')` + `outline: 1px solid token('color.border.selected')` |
| ③ 루트 드롭존 | 드래그 중에만 나타나는 점선 박스(`team.tree.dropToRoot`) |
| ④ **드롭 불가 타깃 (신규)** | `onDragOver`에서 `resolveTeamTreeDrop`이 `null`이면 **`e.dataTransfer.dropEffect = 'none'`** + `cursor: not-allowed` + `background: token('color.background.disabled')`. 즉 **판정 함수를 hover 시점에도 호출**해 드롭 전에 불가를 보여준다 |

> ④가 요구사항의 "드롭 불가 영역을 시각적으로 구분"에 대한 답이다. 선례는 hover 시 판정을 하지 않고 drop 시점에만 하므로, **이 부분만 선례를 확장한다.**

#### 이중 방어와 규칙 이중 구현 위험 (§R7 미리보기와 동일 문제)

- **프론트 사전 차단**: `resolveTeamTreeDrop` (위 5규칙)
- **서버 최종 검증**: `updateTeam`의 `TEAM_CYCLE_DETECTED` / `TEAM_DEPTH_EXCEEDED` (§R1, P0에 이미 존재)
- 프론트는 서버 규칙의 **부분집합이어야 한다**(프론트가 더 관대하면 롤백이, 더 엄격하면 조작 불가가 발생).
- **대조 테스트 필수** — §R7 미리보기와 **동일한 방식**으로 처리한다. 아래 정규 케이스 표를 양쪽 테스트가 공유한다(파일 경계상 픽스처 파일을 공유할 수 없으므로 **본 설계서의 표가 정규 출처**다).

| # | 트리 | drag → drop | 프론트 기대 | 서버 기대 |
|---|---|---|---|---|
| C1 | A(루트) | A → A | `null` | `TEAM_CYCLE_DETECTED` |
| C2 | A > B | B → A | `null` (무변화) | 성공(멱등, 값 동일) |
| C3 | A > B | A → B | `null` (순환) | `TEAM_CYCLE_DETECTED` |
| C4 | A > B > C | A → C | `null` (순환, 2단계) | `TEAM_CYCLE_DETECTED` |
| C5 | A, B(둘 다 루트) | B → A | `{moveTeam, B, A}` | 성공 |
| C6 | A > B, C(루트) | B → null(루트) | `{moveTeam, B, null}` | 성공 |
| C7 | A(루트, 이미) | A → null | `null` (무변화) | 성공(멱등) |
| C8 | 깊이 10 체인 D1..D10, X(루트) | X → D10 | `null` (깊이 초과) | `TEAM_DEPTH_EXCEEDED` |
| C9 | 깊이 9 체인, X에 자식 2단 | X → D9 | `null` (서브트리 높이 포함 초과) | `TEAM_DEPTH_EXCEEDED` |
| C10 | 사이클 손상 데이터(A>B>A) | B → C | `null` + 무한루프 없음 | `TEAM_CYCLE_DETECTED` |

- 테스트 위치: 프론트 `static/ui/src/backoffice/page/team/__test__/resolveTeamTreeDrop.test.js`, 백엔드 `src/resolver/backoffice/team/__test__/TeamTree.test.js`.
- **C2/C7이 프론트 `null` ↔ 서버 성공으로 갈리는 것은 의도적이다.** 프론트는 "변화 없음이니 요청을 보내지 않는다", 서버는 "요청이 오면 멱등하게 성공"이다. 모순이 아니다.

**상수는 서버가 내려준다 — M6 대응 (케이스표보다 강한 처방)**

정규 케이스표는 **규칙**의 갈림은 잡지만 **상수**의 드리프트는 못 잡는다. `MAX_TEAM_DEPTH`가 프론트·백엔드에 각각 리터럴로 존재하면, 백엔드만 10 → 12로 바꿔도 **프론트 테스트는 여전히 통과한다**(10 기준에서도 초과이므로). 결과는 "서버는 허용하는데 UI가 막는" 조작 불가이고, 대조 테스트로는 검출되지 않는다.

> **`getTeamList` 응답에 `content.limits: { maxDepth, maxTeams }`를 실어 보내고 프론트는 그 값만 쓴다. 프론트에 상수 리터럴을 두지 않는다.**

- `truncated`·`hasCycle`을 응답에 실은 것과 같은 발상 — **상수 이중화 자체가 사라지므로 테스트로 지킬 필요가 없다.**
- **P0에 넣는다.** P3-B(DnD)에서 처음 필요해지지만, P0의 `getTeamList` 계약에 미리 포함시키면 P3-B가 백엔드 변경 0으로 유지된다(§9 P3-B의 "프론트 전용" 주장이 그때 가서 깨지지 않는다).
- `resolveTeamTreeDrop({ ..., limits })`는 `limits.maxDepth`를 인자로 받는 순수 함수로 둔다.

**§R7 상속 미리보기의 정규 케이스표 (별도 필요 — C1~C10은 DnD 전용)**

§R7의 미리보기는 상수가 아니라 **규칙 자체의 이중 구현**이라 동일 픽스처 대조가 최선이다. 다만 그 테스트가 실제로 갈림을 잡으려면 **"가장 가까운 조상 우선"이 깨지는 케이스**가 반드시 포함돼야 한다. 아래를 프론트 `buildTeamTree.nearestAncestorWith` 테스트와 백엔드 `TeamTree.nearestAncestorWith` 테스트가 공유한다.

| # | 트리 (세트 보유 표시) | 대상 | 기대 |
|---|---|---|---|
| P1 | Root(세트X) > Div(**세트A**) > Team(세트X) | Team | **A** (가장 가까운 조상) |
| P2 | Root(**세트R**) > Div(**세트A**) > Team(세트X) | Team | **A** — 루트가 아니라 **가까운 쪽**이 이긴다 |
| P3 | Root(**세트R**) > Div(세트X) > Team(세트X) | Team | **R** (중간이 비면 계속 상향) |
| P4 | Root(세트X) > Div(세트X) > Team(세트X) | Team | **null** → "모든 권한 상실" 경고 |
| P5 | Team(**세트T**, 루트) | Team | **T** (자기 자신 포함) |
| P6 | 팀 미소속 (`team_key = null`) | — | **null** → "팀 미소속" 경고 |
| P7 | Root > Div(**세트A**) > Team, 단 `parentTeamKey`가 **존재하지 않는 키**를 가리킴 | Team | **null** + `console.error` (손상 데이터 — 조상 탐색이 조용히 성공하면 안 된다) |
| P8 | 사이클 A>B>A, B에 **세트B** | A | **null** 또는 자기 세트만. **무한 루프 없음**(visited Set) |

P2와 P7이 핵심이다 — 초안에 이 두 케이스가 없었으면 "루트 우선"으로 잘못 구현해도, 손상 데이터에서 조용히 넓은 권한을 줘도 테스트가 통과했을 것이다.

#### 낙관적 업데이트 — **채택. 단 스냅샷 롤백 필수.**

```js
useMutation({
  mutationFn: ({ teamKey, parentTeamKey }) => invoke('updateTeam', { teamKey, parentTeamKey }),
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: backofficeKeys.teams() });
    const previous = queryClient.getQueryData(backofficeKeys.teams());
    queryClient.setQueryData(backofficeKeys.teams(), (old) => applyMoveLocally(old, vars));
    return { previous };                       // ← 롤백용 스냅샷
  },
  onError: (err, vars, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(backofficeKeys.teams(), ctx.previous);
    console.error('[TeamTree] 프론트 사전 차단과 서버 규칙 불일치', err);  // 이중 구현이 어긋났다는 신호
    showErrorToast(t(`team.error.${err.code}`));
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: backofficeKeys.teams() }),
});
```
- **채택 근거**: 조직개편 시 여러 팀을 연속으로 옮기는 것이 이 기능의 사용 맥락이다. 매번 왕복을 기다리면 쓸 수 없다.
- **롤백 근거**: 서버가 최종 판정자다(§R1). 프론트 사전 차단이 완벽하다면 `onError`는 **발생하지 않아야 정상**이므로, 발생하면 `console.error`로 이중 구현 불일치를 개발 중에 잡는다.
- `onSettled`의 `invalidateQueries`가 항상 서버 상태로 수렴시킨다 — 낙관적 패치가 틀렸어도 최종 상태는 서버가 이긴다.
- **`updateTeam`은 부분 갱신을 지원해야 한다.** DnD는 `{ teamKey, parentTeamKey }`만 보낸다. 이름·팀장·권한세트를 함께 보내지 않으므로, 서비스는 **미전달 필드를 기존 값으로 보존**해야 한다(`{...set, parentTeamKey}` 패턴 — `updatePermissionScopeService` 선례와 동일). 이 조항을 놓치면 드래그 한 번에 팀 이름이 날아간다.

#### 모달 상위 팀 Select — **유지한다(제거 금지)**

1. 팀 **생성** 시에는 드래그할 노드가 아직 없으므로 부모 지정에 반드시 필요하다.
2. **접근성 대체 경로** — DnD는 키보드/스크린리더 사용자에게 접근 불가하다. Select가 유일한 동등 수단이다.
3. 두 경로가 같은 `updateTeam` resolver·같은 서버 검증을 쓰므로 유지 비용이 거의 없다.

#### 단계 배치 — **P3-B로 분리할 것을 역제안한다**

| 판단 축 | 내용 |
|---|---|
| P0의 배포 가능 판정 | "팀을 만들고, 계층을 세우고, 사람을 배치할 수 있다" — **모달 Select만으로 100% 충족.** DnD는 순수 UX 개선이다 |
| 백엔드 결합 | **없음.** 서버 가드(`TEAM_CYCLE_DETECTED`/`TEAM_DEPTH_EXCEEDED`)와 `updateTeam`은 P0에 이미 있다. P3-B는 **프론트 전용 증분** |
| 구현량 | 선례 복제라 처음 우려보다 낮다(~300줄 + 테스트 10케이스). 다만 hover 판정(④), 깊이 사전 계산, 낙관적 롤백, 대조 테스트가 붙어 트리 자체보다는 크다 |
| P0의 현재 부피 | KVS 엔티티 + DDL + resolver 8종 + 페이지·트리·상세·모달 3종 + 사용자 페이지 확장 + 카탈로그 키 + SEED bump — **이미 크다** |

→ **권고: P3-B.** 다만 백엔드 의존이 0이므로, **P0 진행 중 여력이 생기면 순서 변경 없이 P0으로 승격 가능하다**(P3-B를 먼저 배포해도, 나중에 배포해도 다른 단계에 영향이 없다). 이 유연성이 분리의 추가 이점이다.

### 6-8. N3. 프로젝트별 팀 심화 분석 (2차 요구 반영 2026-07-27)

> **대상은 프로젝트 상세 대시보드다.** 전사 `/dashboard`의 `PortfolioTeamDist`(P2, N4)와 **다른 화면**이다. 이름이 비슷하므로 구현 시 혼동 금지 — 전자는 `pages/projectDetail/dashboard/`, 후자는 `pages/portfolio/widgets/`.

#### 대원칙 — 팀 지표를 새로 정의하지 않는다. 집계 구현은 축마다 **단 하나**다.

| 축 | 단일 구현 | 위치 | 쓰는 화면 |
|---|---|---|---|
| 표시용 롤업(인원·MD·MM·가동률) | **`aggregateByTeam()`** 순수 함수 (신규, 프론트 1개) | `static/ui/src/utils/team/aggregateByTeam.js` | N3-1, N3-2 |
| 비용 | **`groupCostByKey()`** (기존, 백엔드) | `src/resolver/projectCost/CostCalculator.js:92` | N3-3 |
| 대시보드 위젯 | **`formatChartData()`** (기존, 백엔드) | `ProjectDashboardService.js:289` | N3-4 |

```js
// aggregateByTeam.js — 순수 함수. 테스트 필수.
aggregateByTeam(rows, { teamMeta, sumFields, avgFields })
  → [{ teamKey, teamName, memberCount, ...sums, ...avgs, members:[...] }]
```
- `teamKey === null` → `{ teamKey:null, teamName: t('team.unassigned.label') }` 그룹으로 묶고 **항상 마지막에 정렬**한다. `mapCountWithMeta`의 `{id:null, name:'Unassigned'}` 규약과 동일 축이다.

**`avgFields`는 가중평균 전용이다 — M2 대응 (산식 불일치 제거)**

초안은 §R5 표(#1 `/resource`, #2 포트폴리오)에서 "팀별 **평균 가동률**"을 지시하면서, §6-8 N3-1에서는 "개인 가동률의 **평균을 내면 틀린다**"고 정반대로 선언했다. **같은 팀·같은 기간인데 화면마다 다른 숫자가 나온다.** (§N4가 정리한 "전사 vs 프로젝트별은 스코프가 달라 값이 다르다"와는 **다른 문제** — 이건 스코프가 아니라 산식이 다른 것이다.)

> **통일: 비율 지표는 전부 가중 Σ분자/Σ분모로 계산한다. 단순 산술평균은 쓰지 않는다.**

- `aggregateByTeam`의 `avgFields`는 **`{ field, numerator, denominator }` 형태만 받는다.** 단순평균 옵션을 **API에 아예 두지 않는다** — 두면 언젠가 쓰인다.
  예: 가동률 = `{ field:'utilization', numerator:'totalMd', denominator:'effectiveMmDays' }`
- **~~분모를 못 구하는 화면의 처리~~ → 3차 갱신(2026-07-28): 라벨 분리는 더 이상 필요 없다.**

> **이 문단의 전제("배치 rollup에 분모가 없다")가 실측으로 틀렸음이 확인됐다.**
> `PortfolioAggregator.computeGlobalUtilization`(`:203-213`)은 분모 `availMd`(참여 구간 union의 근무일 − 휴가 차감)를 **이미 계산하고 있고, `utilizationPeople[]`에 싣지 않을 뿐이다.**
> → **2필드(`investedMd`·`availMd`)를 응답에 추가**하면 모든 화면이 가중 `Σ/Σ`를 쓸 수 있다. `util` 값과 산식은 불변이라 기존 소비자는 무회귀다.
> **결론: 단일 이름 `팀 가동률` = 가중 `Σ investedMd / Σ availMd`.** 산술평균 변형과 `team.metric.avgMemberUtil.*` 라벨은 **폐기**한다. 상세 근거는 **§3 "팀 지표 단일 정의"** 참조 — 그쪽이 정본이다.
>
> 부수 근거: 산술평균은 오히려 **틀린 값**을 낸다. 해당 기간에 프로젝트 참여가 없는 사람은 `availMd = 0 → util = 0`이 되어 팀 평균을 부당하게 끌어내리는데, 가중 `Σ/Σ`는 분모에 0을 더해 자연히 제외한다.

`aggregateByTeam`의 `avgFields`는 **가중 전용**을 유지한다(단순평균 옵션을 API에 두지 않는다는 규칙은 그대로 유효하다).
- **팀 미소속자를 숨기지 않는다.** 숨기면 팀 소계의 합이 전체 합과 달라져 사용자가 숫자를 신뢰할 수 없게 된다.
- `issueCount`는 **합산하지 않는다**(팀원 여러 명이 같은 이슈에 워크로그를 남기면 중복 계상된다). 팀 행에서는 `-`로 표기하거나 "고유 이슈 수"가 필요하면 별도 계산이 필요함을 명시 — 현 설계에서는 **표기 생략**.

#### ⚠ 비용은 프론트 롤업으로 만들면 안 된다 (실측 근거)

`byIssue[].byMember[{accountId, cost}]`를 프론트에서 accountId로 롤업하면 팀별 비용을 만들 수 있어 보이지만, **그 합계는 `byRole`/`byLevel`의 합과 일치하지 않는다.**
- `allocateIssueCost`는 (a) `cost <= 0` 이슈를 버리고, (b) `salary == null` 멤버를 제외하며, (c) 워크로그가 없는 멤버는 아예 등장하지 않는다.
- 반면 `byRole`/`byLevel`의 `actual`은 `Σ(유효급여) × scheduleRate`(top-down)라 **전 멤버를 포함**한다.
→ 두 축의 총액이 어긋나 "역할별 합 ≠ 팀별 합"이 화면에 그대로 노출된다. **반드시 서버 `groupCostByKey(members, scheduleRate, 'teamKey')`를 쓴다.**

#### N3-1. 인력 분석 리포트 — 그룹핑 축 전환 (인별 ↔ 팀별)

- 대상: `pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx` + `ResourceAnalysisTable.jsx`
- **백엔드 변경 0** (위 계약 표 근거).
- 축 토글은 기존 선례 2개 중 하나를 그대로 이식: `PortfolioRoleLevelDist.jsx`의 `useState('role'|'level')` + `ToggleBtn` 패턴, 또는 공용 `components/toggle/ViewModeToggle.jsx`(`MyWorklogPanel`이 flat⇄grouped로 **같은 `CommonTable`에 head/rows만 갈아끼우는** 선례). **후자를 권장** — 테이블 교체가 아니라 데이터 교체라 회귀면이 좁다.
- 팀 모드 컬럼: `팀명 / 인원수 / 총 MM / 총 MD / 총 시간 / 평균 가동률`. `totalMd`·`totalHours`·`effectiveMmDays`는 합산, 가동률은 `ΣtotalMd / ΣeffectiveMmDays`로 **재계산**(개인 가동률의 평균이 아니다 — 인원별 분모가 다르므로 평균을 내면 틀린다).
- **페이징 경계 문제(필수 처리)**: 행 소스 `findProjectusersByProjectId`가 10건 페이징이라 팀 집계가 현재 페이지에만 걸린다. → **팀 모드에서는 `pagesize: 500`으로 전량 조회**하고 페이지네이션 UI를 숨긴다. 프로젝트 인원은 실무상 O(10~100)이라 안전하며 백엔드 변경이 없다. 500명 초과 프로젝트는 팀 모드를 비활성화하고 안내 문구를 띄운다.

#### N3-1(이슈) — **범위에서 제외한다. 근거를 남긴다.**

요구는 "분석리포트(인력/이슈)"였으나 **이슈 분석 리포트의 팀 축은 제공하지 않는다.**
1. **팀 귀속 자체가 정의 불가** — 이슈는 `assignee` 1명 + `coworkers[]` 다중이라 "이 이슈는 어느 팀 것"이 결정되지 않는다. 배분하려면 공수 비율 가정이 필요하고, 그것은 §R5에서 프로젝트 진척을 팀에 배분하지 않기로 한 것과 **동일한 종류의 왜곡**이다.
2. **기술적으로도 막힌다** — 이슈 리포트는 Jira JQL **커서 페이징**이라 현재 페이지(10~50건)만 메모리에 있다. 클라이언트 그룹핑이 불가능하고, 서버 집계를 만들면 "P3 신규 resolver 0" 원칙이 깨진다.
3. **요구사항 D3에서 이슈→팀 배정은 이미 명시적 비목표**다.
→ 대안: 이슈 리포트는 현행 유지. 팀 관점의 공수는 **인력 분석 리포트(N3-1)**가 이미 답한다.

#### N3-2. 인력 탭 — 팀 그룹핑 + 소계

- 대상: `pages/projectDetail/user/ProjectUserPanel.jsx`
- **"접어 보기"는 `TreeTable`(`components/table/TreeTable.jsx`, `@atlaskit/table-tree`)로 구현한다.** `CommonTable`/`CursorPagingTable`은 그룹 헤더·collapsible row를 **지원하지 않으며 리포 내 선례가 0건**이다(수동 구현은 신규 발명이므로 배제). `TreeTable`은 `items[].children` + `hasChildren`으로 네이티브 접기를 제공하고 `MyIssueTable.jsx`에 사용 선례가 있다.
- 트리 구조: **팀 = 부모 노드(소계 행)**, **인원 = 자식 노드**. 팀 소계 = `인원수 / 투입 MM / 인건비`.
  - 단 **인건비 소계는 비용 탭 권한(`PROJECT_COST`)이 있을 때만 표시**한다. 인력 탭은 `PROJECT` 권한으로 열리므로, 여기에 비용을 무조건 노출하면 `PROJECT_COST` 분리(§ResourceCatalog 분리 기준 (a) 재무 민감)가 무의미해진다. `canRead('PROJECT_COST')`로 컬럼 자체를 제거.
  - ⚠ **이 게이팅의 한계를 명시한다 (M4)**: **원본 행의 `salary`(투입급여)는 게이트 없이 계속 응답에 실린다**(U10 — 기존 결함). 즉 소계는 가리는데 원자료는 보이는 비대칭이 남는다. N3-2가 이 결함을 **만들지는 않지만 해소하지도 못한다.** 근본 수정은 U10의 별도 과제이며, 그때 소계 게이팅도 함께 재검토한다. 여기서 원본 `salary`까지 마스킹하려 들면 급여 관리 탭·배정 보드가 같은 응답을 소비해 회귀면이 P3-A 범위를 넘는다.
- 기본 모드는 **평면(기존)**, 토글로 팀 그룹 모드 진입 — 기존 화면의 기본 동작을 바꾸지 않는다(무회귀).

#### N3-3. 비용 탭 — 팀별 분해

- 백엔드 변경 3줄 규모, **계산 로직 신규 작성 0**:
  1. `PortfolioSnapshotQuery.MEMBER_ROWS`에 `u.team_key` SELECT 추가 (컬럼 추가만 — 주석이 "기존 소비부는 추가 컬럼을 무시해도 안전. 시그니처 불변"이라고 이미 명시)
  2. `EffectiveSalary.resolveMemberSalaries` 반환 객체에 `teamKey: row.team_key ?? null` 추가 (**순수 추가** — 이 함수는 포트폴리오 스냅샷·급여 관리 탭도 공유하므로 환산식은 절대 건드리지 않는다)
  3. `ProjectCostService`에 `const byTeam = groupCostByKey(members, scheduleRate, 'teamKey');` 1줄 + 응답/캐시에 `byTeam` 포함
- 프론트: `CostByRoleLevel.jsx`를 `useState('role'|'level'|'team')` 3-way로 확장. `metaMap`은 role/level과 동형으로 `useTeamOptions()`에서 만든다(`useRoleLevel()` 패턴). **컴포넌트를 복제하지 말고 확장**할 것 — 복제하면 축마다 렌더가 갈린다.
- 파일명은 `CostByRoleLevel.jsx` 유지(리네이밍은 불필요한 diff). 내부 라벨만 3축으로.

#### N3-4. 프로젝트 대시보드 — '팀별 기여' 위젯

**경로 A(사용자 추가형 dataType)를 채택한다. 경로 B(하드코딩 고정 위젯)는 배제한다.**

배제 근거 — 실측된 **무음 저장 실패 버그**: `DashboardPage.handleSaveLayout`은 `l.i !== "summary"` **단 하나만** 필터한다. 하드코딩 위젯 id가 섞이면 `bulkUpdateLayoutsRepository`가 DB에 없는 `dashboard_id`를 INSERT 시도하고, 그 쿼리는 `project_id`를 `UUID_TO_BIN()` 없이 평문으로 BINARY(16)에 넣어 statement 전체가 실패한다. 그런데 `catch`가 예외를 삼키고 `console.error`만 하므로 **서비스는 정상 반환 → "저장되었습니다" 토스트가 뜨는데 배치는 하나도 저장되지 않는다.** 경로 A는 이 코드에 아예 닿지 않는다.

구현 지점 (5곳):
1. `static/ui/src/constants/dashboardTypes.js` `DATA_TYPES`에 `{ key:'team', label, description, allowedCharts:['pie','bar','line'] }` 추가. (선택) `TEMPLATES.workforce.charts`에 항목 추가.
2. `ProjectDashboardService.getChartDataset` switch에 `case 'team': return await getTeamChartData(project_id, chartType, startDate, endDate);`
3. `getTeamChartData` 신규 — **기존 집계를 재사용**한다:
   - 소스: `aggregateByUserService({ projectId, startDate, endDate })` — `[{accountId, seconds}]` 반환, **KVS 10분 캐시 내장, 신규 워크로그 페치 0**. (현재 `ProjectDashboardService`에 import만 되어 있고 미사용 상태라 배선만 하면 된다.)
   - `users.team_key`로 롤업 → MD 환산(`seconds / (hourRate*3600)`, `hourRate`는 `getSettingDataService`) → `normalizeLabelRows(rows, teamMap)` → `formatChartData(rows, chartType)`
   - **지표 정의: 팀별 투입 공수(MD).** "기여"의 의미가 인원 수가 아니라 공수라는 판단. 인원 수 축은 N3-2 인력 탭 소계가 담당한다.
4. `ChartTemplate.js` — `CHART_OPTION_MAP`은 **수정 불필요**(pie/bar/line 재사용). 단 `worklog` dataType처럼 **날짜 필터가 필요**하므로 `isUserFilterChart` 옆에 `isDateFilterChart` 계열 분기에 `'team'`을 포함시키고 queryKey에 `startDate/endDate`를 넣는다.
5. i18n `locales/kr|en/chartOptions.json`에 `chartOptions.dataType.team.{label,description}`

**호환성**: 새 `dataType`을 추가해도 기존 프로젝트의 저장된 레이아웃에는 해당 행이 없으므로 **아무것도 보이지 않고 기존 배치가 깨지지 않는다**(`items`가 항상 DB rows에서 재구성됨). 구버전 클라이언트가 모르는 `data_type`을 만나도 서버 `default: return []` → `noData` 메시지로 안전하게 처리된다. **새 `chartType`은 추가하지 않는다** — `CHART_OPTION_MAP`에 없는 chartType은 `option={}`이 되어 **에러 없이 백지 차트**가 되기 때문이다.

**비용 축을 넣지 않는다**: 현재 `salary` dataType이 `PROJECT_COST`가 아니라 **`DASHBOARD` read만으로 조회된다**(기존 권한 구멍 — §10 U7 참조). 팀 위젯에 인건비를 넣으면 이 구멍을 확대 재생산한다. 팀 위젯은 **공수(MD)만** 다룬다.

#### N3 공통 — 팀 이동과 과거 공수의 귀속 (필수 고지)

**규칙: 모든 팀 집계는 `users.team_key`의 "현재 값" 기준이다.**

사람이 프로젝트 진행 중 팀을 옮기면, 그 사람이 **이전 팀에 있을 때 쌓은 공수·비용까지 새 팀으로 옮겨간다.** `users.team_key`는 현재 소속만 보관하고, 팀 이동 이력 추적은 요구사항 §5에서 **명시적 비목표**이기 때문이다.

- 이것은 결함이 아니라 **선언된 한계**다. 이력을 추적하려면 `team_membership_history(account_id, team_key, from, to)` 테이블과 워크로그 시점별 조인이 필요하고, 그것은 별도 기능(HR 축)이다.
- **사용자에게 반드시 알린다** — N3-1·N3-2·N3-3·N3-4 **네 화면 모두**에 InfoTip을 단다. 키: `team.analysis.currentMembershipNote`.
  > "팀 집계는 인력의 **현재 소속** 기준입니다. 기간 중 팀을 이동한 인력의 과거 실적도 현재 팀에 합산됩니다."
- 이 고지는 §R5에서 "완성률·일정률을 팀으로 분해하지 않는다"를 InfoTip으로 알리기로 한 것과 **같은 원칙**(산출 한계를 숨기지 않는다).

---

## 7. i18n 키 목록

### 신규 `locales/kr/team.json` / `locales/en/team.json`

| 키 | kr | en |
|---|---|---|
| `team.page.title` | 팀 관리 | Team Management |
| `team.page.description` | 조직 계층과 팀 소속을 관리합니다. | Manage the organization hierarchy and team membership. |
| `team.tree.title` | 조직도 | Organization |
| `team.tree.empty` | 등록된 팀이 없습니다. | No teams registered. |
| `team.tree.root` | 최상위 | Top level |
| `team.tree.cycleWarning` | 순환 참조가 감지된 팀이 있습니다. 상위 팀 설정을 확인하세요. | A circular reference was detected. Please check the parent team settings. |
| `team.tree.truncatedWarning` | 팀 수가 조회 한도를 초과해 일부만 표시됩니다. 관리자에게 문의하세요. | Too many teams to load; showing a partial list. Please contact an administrator. |
| `team.detail.empty` | 좌측에서 팀을 선택하세요. | Select a team on the left. |
| `team.detail.members` | 팀원 | Members |
| `team.detail.children` | 하위 팀 | Sub-teams |
| `team.detail.leader` | 팀장 | Team lead |
| `team.detail.noLeader` | 미지정 | Not assigned |
| `team.col.name` | 팀명 | Team |
| `team.col.parent` | 상위 팀 | Parent team |
| `team.col.leader` | 팀장 | Team lead |
| `team.col.permission` | 팀 권한 | Team permission |
| `team.col.memberCount` | 인원 | Members |
| `team.col.descendantMemberCount` | 하위 포함 인원 | Incl. sub-teams |
| `team.col.description` | 설명 | Description |
| `team.form.name` | 팀명 | Team name |
| `team.form.parent` | 상위 팀 | Parent team |
| `team.form.leader` | 팀장 | Team lead |
| `team.form.permission` | 팀 권한 세트 | Team permission set |
| `team.form.permissionHint` | 개인 권한이 지정되지 않은 팀원에게만 적용됩니다. | Applied only to members whose personal permission is unset. |
| `team.form.description` | 설명 | Description |
| `team.placeholder.name` | 팀명을 입력하세요 | Enter a team name |
| `team.placeholder.parent` | 최상위 팀으로 생성 | Create as a top-level team |
| `team.placeholder.leader` | 팀장을 선택하세요 | Select a team lead |
| `team.button.add` | 팀 추가 | Add team |
| `team.button.edit` | 수정 | Edit |
| `team.button.delete` | 삭제 | Delete |
| `team.button.assignMembers` | 팀원 배치 | Assign members |
| `team.button.unassign` | 소속 해제 | Remove from team |
| `team.modal.regist.title` | 팀 추가 | Add team |
| `team.modal.edit.title` | 팀 수정 | Edit team |
| `team.modal.member.title` | 팀원 배치 | Assign members |
| `team.modal.member.hint` | 사용자는 하나의 팀에만 속합니다. 다른 팀 소속자를 선택하면 이 팀으로 이동합니다. | A user belongs to exactly one team. Selecting a user from another team moves them here. |
| `team.unassigned.label` | 팀 미지정 | No team |
| `team.unassigned.count` | 팀 미지정 {count}명 | {count} without a team |
| `team.delete.confirm.title` | 팀 삭제 | Delete team |
| `team.delete.confirm.message` | 이 팀을 삭제하면 하위 팀은 상위 팀으로 이동하고, 팀원은 팀 미지정 상태가 됩니다. | Deleting this team moves its sub-teams up to the parent and leaves its members without a team. |
| `team.delete.success` | 팀을 삭제했습니다. (팀원 {detached}명 해제) | Team deleted. ({detached} members unassigned) |
| `team.filter.label` | 팀 | Team |
| `team.filter.all` | 전체 팀 | All teams |
| `team.filter.includeDescendants` | 하위 팀 포함 | Include sub-teams |
| `team.project.title` | 담당 팀 | Assigned teams |
| `team.project.primary` | 주 담당 | Primary |
| `team.project.addMembers` | 팀원 일괄 추가 | Add all members |
| `team.project.addMembers.result` | {added}명 추가, {skipped}명 건너뜀 | {added} added, {skipped} skipped |
| `team.project.empty` | 배정된 팀이 없습니다. | No teams assigned. |
| `team.error.TEAM_NOT_FOUND` | 팀을 찾을 수 없습니다. | Team not found. |
| `team.error.TEAM_NAME_REQUIRED` | 팀명을 입력하세요. | Team name is required. |
| `team.error.TEAM_NAME_DUPLICATED` | 이미 존재하는 팀명입니다. | This team name already exists. |
| `team.error.TEAM_CYCLE_DETECTED` | 상위 팀으로 자기 자신이나 하위 팀을 지정할 수 없습니다. | A team cannot be its own parent or a descendant of itself. |
| `team.error.TEAM_DEPTH_EXCEEDED` | 팀 계층은 최대 10단계까지 가능합니다. | Team hierarchy supports up to 10 levels. |
| `team.error.TEAM_LIMIT_EXCEEDED` | 생성 가능한 팀 수를 초과했습니다. | The maximum number of teams has been reached. |
| `team.error.fieldsDropped` | 권한이 없어 일부 항목({fields})은 저장되지 않았습니다. | Some fields ({fields}) were not saved due to insufficient permissions. |

### 기존 파일 추가 키 (kr/en 양쪽)

| 파일 | 키 | kr | en |
|---|---|---|---|
| `common.json` | `common.pages.team` | 팀 관리 | Team Management |
| `common.json` | `common.backoffice.workforceSetting.team.title` | 팀 관리 | Team Management |
| `permission.json` | `permission.desc.TEAM_MANAGEMENT` | 조직 계층·팀 소속·팀장 지정을 관리합니다. | Manage the org hierarchy, team membership, and team leads. |
| `permission.json` | `permission.scope.TEAM_ONLY` | 내 팀만 | My team only |
| `permission.json` | `permission.scope.TEAM_ONLY.desc` | 내 팀과 하위 팀이 참여한 프로젝트만 조회합니다. | Only projects involving my team and its sub-teams. |
| `permission.json` | `permission.scope.TEAM_ONLY.warning` | 팀 미지정 사용자 {count}명은 아무 프로젝트도 볼 수 없게 됩니다. | {count} users without a team will not see any projects. |
| `permission.json` | `permission.inherit.team` | 팀 권한 상속 | Inherit from team |
| `permission.json` | `permission.inherit.preview` | 현재 상속받게 될 권한: {name} ({team}) | Will inherit: {name} (from {team}) |
| `permission.json` | `permission.inherit.previewNone` | 상속받을 권한이 없습니다 — 모든 권한을 잃게 됩니다. | Nothing to inherit — this user will lose all permissions. |
| `permission.json` | `permission.inherit.previewNoTeam` | 팀에 소속되지 않아 상속받을 권한이 없습니다 — 모든 권한을 잃게 됩니다. | No team assigned, so there is nothing to inherit — this user will lose all permissions. |
| `user.json` | `user.col.team` | 팀 | Team |
| `user.json` | `user.form.team` | 팀 | Team |
| `user.json` | `user.filter.team` | 팀 | Team |
| `user.json` | `user.stat.team` | 팀 | Team |
| `resource.json` | `resource.filter.team` | 팀 | Team |
| `resource.json` | `resource.col.team` | 팀 | Team |
| `portfolio.json` | `portfolio.widget.teamDist.title` | 팀별 인력 분포 | Headcount by team |
| `portfolio.json` | `portfolio.filter.team` | 팀 | Team |
| `portfolio.json` | `portfolio.groupBy.team` | 팀별 | By team |
| `portfolio.json` | `portfolio.team.projectMetricNote` | 프로젝트 지표는 팀으로 분해되지 않습니다. 팀 필터는 해당 팀 인력이 투입된 프로젝트만 추립니다. | Project-level metrics are not split by team. The team filter narrows the project list only. |
| `projectDetail.json` | `projectDetail.user.col.team` | 팀 | Team |

### 2차 요구(N1~N3) 추가 키

| 파일 | 키 | kr | en |
|---|---|---|---|
| `team.json` | `team.project.selectMembers` | 팀원 골라 담기 | Pick members |
| `team.json` | `team.project.selectedCount` | {selected}/{total}명 선택됨 | {selected} of {total} selected |
| `team.json` | `team.project.alreadyAssigned` | 이미 배정됨 | Already assigned |
| `team.json` | `team.error.TEAM_MEMBER_SELECTION_EMPTY` | 배정할 팀원을 1명 이상 선택하세요. | Select at least one member to assign. |
| `team.json` | `team.error.TEAM_MEMBER_NOT_IN_SCOPE` | 선택한 인원 중 이 팀 소속이 아닌 사람이 있습니다. | Some selected users do not belong to this team. |
| `team.json` | `team.error.TEAM_ASSIGN_BATCH_TOO_LARGE` | 한 번에 최대 500명까지 배정할 수 있습니다. | You can assign up to 500 members at once. |
| `team.json` | `team.tree.dndHint` | 팀을 드래그해 다른 팀 아래로 옮길 수 있습니다. | Drag a team to move it under another team. |
| `team.json` | `team.tree.dropToRoot` | 여기에 놓으면 최상위 팀이 됩니다. | Drop here to make it a top-level team. |
| `team.json` | `team.tree.dropNotAllowed` | 이 위치로는 옮길 수 없습니다. | This team cannot be moved here. |
| `team.json` | `team.analysis.currentMembershipNote` | 팀 집계는 인력의 현재 소속 기준입니다. 기간 중 팀을 이동한 인력의 과거 실적도 현재 팀에 합산됩니다. | Team totals use each person's current team. Work done before a transfer is counted under their current team. |
| `team.json` | `team.analysis.groupByTeam` | 팀별 | By team |
| `team.json` | `team.analysis.groupByMember` | 인별 | By person |
| `team.json` | `team.analysis.tooManyMembers` | 인원이 500명을 초과해 팀별 보기를 사용할 수 없습니다. | Team view is unavailable for projects with over 500 members. |
| `team.json` | `team.analysis.subtotal` | 소계 | Subtotal |
| `cost.json` | `cost.axis.team` | 팀별 | By team |
| `chartOptions.json` | `chartOptions.dataType.team.label` | 팀별 기여 | Contribution by team |
| `chartOptions.json` | `chartOptions.dataType.team.description` | 팀별 투입 공수(MD)를 비교합니다. | Compare effort (MD) contributed by each team. |

### 3차 외부 검토(C1~C3, H1~H5, M1~M8) 추가 키

| 파일 | 키 | kr | en |
|---|---|---|---|
| `team.json` | `team.error.TEAM_MEMBER_NOT_IN_SCOPE` **(문구 교체 — M5)** | {count}명의 팀 소속이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요. | {count} member(s) changed teams. Refresh the list and try again. |
| `team.json` | `team.error.TEAM_NOT_IN_PROJECT_SCOPE` | 이 프로젝트에 배정되지 않은 팀입니다. | This team is not assigned to the project. |
| `team.json` | `team.delete.preview.permissionLost` | 이 팀이 삭제되면 팀 권한을 상속받던 {count}명이 **모든 권한을 잃습니다.** | {count} member(s) inheriting team permissions will lose all access. |
| `team.json` | `team.delete.preview.inheritanceChanged` | 하위 팀의 {count}명은 상속 권한이 상위 팀 기준으로 바뀝니다. | {count} member(s) in sub-teams will inherit from the parent team instead. |
| `team.json` | `team.myTeam.title` | 내 팀 | My team |
| `team.json` | `team.myTeam.leadBadge` | 팀장 | Team lead |
| `team.json` | `team.myTeam.manageMembers` | 팀원 관리 | Manage members |
| `team.json` | `team.metric.teamUtil.note` | 팀 가동률 = 팀원 투입 MD 합 ÷ 팀원 가용일 합(가중). | Team utilization = Σ member MD ÷ Σ member available days (weighted). |
| `team.json` | `team.metric.avgMemberUtil.note` | 팀원 개인 가동률의 산술평균입니다. 팀 가동률과 값이 다를 수 있습니다. | Arithmetic mean of each member's utilization. May differ from team utilization. |
| `permission.json` | `permission.scope.TEAM_ONLY.peopleWarning` | 이 세트에 자원관리·사용자관리 조회 권한을 함께 주면 **전사 인원 목록**이 보입니다. TEAM_ONLY는 프로젝트 범위만 제한합니다. | Granting resource/user read alongside this set exposes the full people directory. TEAM_ONLY limits project scope only. |

### P2 증분(N5·N6, 2026-07-28) 추가 키

기존 `team.filter.label`("팀")·`team.filter.all`("전체 팀")·`team.unassigned.label`("팀 미지정")은 **P1에서 이미 생성됨** — 재사용한다.

| 파일 | 키 | kr | en |
|---|---|---|---|
| `projectDetail.json` | `projectDetail.calendar.teamFilter` | 팀 (하위 팀 포함) | Team (incl. sub-teams) |
| `portfolio.json` | `portfolio.team.comparison.title` | 팀별 비교 | Team comparison |
| `portfolio.json` | `portfolio.team.comparison.empty` | 비교할 팀 데이터가 없습니다. | No team data to compare. |
| `portfolio.json` | `portfolio.team.axis.utilization` | 가동률 | Utilization |
| `portfolio.json` | `portfolio.team.axis.effort` | 투입 공수(MD) | Effort (MD) |
| `portfolio.json` | `portfolio.team.axis.progress` | 참여 프로젝트 평균 완수율 | Avg. completion of joined projects |
| `portfolio.json` | `portfolio.team.axis.cost` | 인건비 | Labor cost |
| `portfolio.json` | `portfolio.team.others` | 기타 ({count}개 팀) | Others ({count} teams) |
| `portfolio.json` | `portfolio.team.topNNote` | 팀을 선택하지 않으면 상위 {n}개 팀만 표시하고 나머지는 "기타"로 묶습니다. | With no team selected, the top {n} teams are shown and the rest are grouped as "Others". |
| `portfolio.json` | `portfolio.team.dedupNote` | 인원수는 중복 인원을 한 번만 셉니다. 공수·인건비는 프로젝트별 기여를 모두 합산합니다. | Headcount counts each person once. Effort and cost sum every project contribution. |
| `portfolio.json` | `portfolio.team.progressNote` | 팀이 참여한 프로젝트들의 완수율을 팀 투입 공수로 가중평균한 값입니다. **팀 자체의 완수율이 아닙니다.** | Effort-weighted average completion of the projects a team joined — not the team's own completion rate. |
| `portfolio.json` | `portfolio.cost.masked` | 인건비를 볼 권한이 없습니다. (비용 권한 필요) | You do not have permission to view labor cost. |
| ~~`team.json`~~ | ~~`team.metric.avgMemberUtil.*`~~ | **폐기** — 가중 `Σ/Σ`로 통일되어 산술평균 변형이 사라졌다(§3 결정 D) | — |

### N7(내 팀 분석) 추가 키 — 2026-07-28

| 파일 | 키 | kr | en |
|---|---|---|---|
| `myPage.json` | `myPage.team.analysis.title` | 팀원 업무 현황 | Team workload |
| `myPage.json` | `myPage.team.analysis.util` | 팀 가동률 | Team utilization |
| `myPage.json` | `myPage.team.analysis.effort` | 총 투입 공수(MD) | Total effort (MD) |
| `myPage.json` | `myPage.team.analysis.completion` | 팀원 평균 완수율 | Avg. member completion |
| `myPage.json` | `myPage.team.analysis.inProgress` | 진행중 작업 | In progress |
| `myPage.json` | `myPage.team.analysis.scope` | 하위 팀 {teams}개 포함 · 총 {members}명 | Incl. {teams} sub-teams · {members} people |
| `myPage.json` | `myPage.team.analysis.noData` | 집계 데이터가 아직 없습니다. (배치 미실행) | No aggregated data yet (batch has not run). |
| `myPage.json` | `myPage.team.analysis.staleNote` | {date} 기준 집계값입니다. | Aggregated as of {date}. |
| `myPage.json` | `myPage.team.analysis.completionNote` | 완수율은 최근 26주 내 완료 작업을 기준으로 합니다. | Completion is based on work finished within the last 26 weeks. |
| `myPage.json` | `myPage.team.analysis.detail` | 상세 | Details |
| `myPage.json` | `myPage.team.myTeamLabel` | 소속 | Member of |
| `team.json` | `team.metric.teamUtil.note` | 팀 가동률 = 팀원 투입 MD 합 ÷ 팀원 가용일 합(가중 평균). 참여 프로젝트가 없는 인원은 자동 제외됩니다. | Team utilization = Σ member MD ÷ Σ member available days. People with no project participation are excluded. |

### 3차 외부 검토(P2) 추가 키 — 2026-07-28

| 파일 | 키 | kr | en |
|---|---|---|---|
| `portfolio.json` | `portfolio.team.utilGlobalNote` | 가동률은 **전사 기준**이며 프로젝트 선택의 영향을 받지 않습니다. 나머지 지표는 선택 범위 기준입니다. | Utilization is company-wide and does not respond to the project filter. Other metrics follow the current selection. |
| `portfolio.json` | `portfolio.team.notAggregated` | 아직 집계되지 않았습니다. (배치 실행 후 표시) | Not aggregated yet — available after the next batch run. |
| `portfolio.json` | `portfolio.cost.maskedSection` | 비용 정보를 볼 권한이 없어 이 영역이 숨겨졌습니다. | This section is hidden because you lack permission to view cost data. |
| `projectDetail.json` | `projectDetail.calendar.teamNoMember` | 선택한 팀의 인원이 이 프로젝트에 없습니다. | No members of the selected team are on this project. |

**워크플로우**: 위 키를 `locales/kr/*.json` + `locales/en/*.json`에 추가 → `cd static/ui && npm run merge` → `ko-KR.json`/`en-US.json` 생성. **`locales/script/*.json`은 빈 스텁이라 거기 넣으면 반영되지 않는다. `ko-KR.json`/`en-US.json` 직접 수정 금지.**

---

## 8. 기존 코드 영향도 + 회귀 위험 등급

등급: **H**=높음(권한/집계 핵심 경로) / **M**=중간 / **L**=낮음(순수 추가)

### 백엔드

| 파일 | 변경 | 위험 | 완화 |
|---|---|---|---|
| `src/permission/PrincipalResolver.js` | principal 8필드 추가, `scopedProjectIds` TEAM_ONLY 분기, 권한세트 fallback | **H** | ALL/MEMBER_ONLY 경로를 코드상 **분기 이전에 조기 반환**시켜 기존 경로가 새 코드에 닿지 않게 한다. 기존 반환 필드 8개는 절대 변경 금지. 단위 테스트: ALL/MEMBER_ONLY/TEAM_ONLY×(팀있음/없음)×(팀장/아님) 매트릭스 |
| `src/permission/permissionGuard.js` | `isTeamLeadOver` 추가, `guard`에 OR 분기, `req.grantedBy` | **H** | `meta.teamLead`가 없으면 `isTeamLeadOver`가 즉시 `false` → 기존 140키 중 5키 외에는 코드 경로 동일. `isSatisfied`는 **시그니처·동작 무변경** |
| `src/permission/PermissionMap.js` | 11키 추가 + 5키에 `teamLead` 부가 | **M** | 기존 grants/project 값 불변. 계약 테스트가 누락을 즉시 검출 |
| `src/permission/ResourceCatalog.js` | `TEAM_MANAGEMENT` 1키 추가 (16→17) | **M** | `mergeSetPages`가 런타임 완전성 보장. `migrateFrom` 미지정으로 권한 자동 확대 차단 |
| `src/trigger/onInstall.js` | `SEED_VERSION` 7→8 | **M** | `addPermissionSeed`는 Member `projectScope` 커스텀 값을 보존(패턴 A). Admin 세트는 결정적 재생성이므로 안전 |
| `src/nosql/query/CustomEntityManager.js` | `findAllPaged` **추가만** (`{results, truncated}` 반환) | **L** | 기존 `findAll` 미변경 → 타 도메인 무영향 |
| `src/rdb/schema/ddl/users.sql.js` + `ddl/index.js` + `migrate.js` | ALTER 1건 (+P2 테이블 1건) | **L** | `IF NOT EXISTS` 멱등. 기존 enqueue 이름 불변 |
| `src/rdb/query/UserQuery.js` | 키 3개 추가 | **L** | 기존 11키 불변 |
| `src/rdb/query/ProjectUsersQuery.js` | 키 1개 추가 | **L** | 기존 15키 불변 |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | 함수 1개 추가 | **L** | |
| `src/permission/TeamLeadFieldPolicy.js` (**신규**) | `TEAM_LEAD_WRITE_ALLOWLIST` + `applyTeamLeadFieldPolicy` (P1) | **H** | 권한 상승 방어의 단일 지점. allowlist이므로 신규 컬럼은 기본 차단. 전용 테스트 필수(§9 P1) |
| `src/resolver/backoffice/user/UserService.js` | DTO에 `teamKey/teamName`, `roleLevelMap`에 팀 맵, `getUserMetaCount`에 `team`, **`updateUser` allowlist+`droppedFields`(P1)**, **`findUserByAccountId` TEAM_LEAD 마스킹(P1)** | **H** | 기존 필드 불변(추가/마스킹만). `grantedBy==='RESOURCE'` 경로는 코드상 조기 반환으로 새 로직에 닿지 않게 한다. `mapUserRowsToDto` 회귀 시 사용자 목록 전체 영향이므로 스냅샷 테스트 권장 |
| `src/resolver/backoffice/user/UserRepository.js` | `findUsersPagedRepository`/`findUsersRepository`에 팀 필터 3상태 분기 | **M** | `whereEq`는 `undefined/null`이면 조건을 무시하므로 **기존 호출부는 무변경**. 단 "팀 미지정"은 `null`이 아니라 **센티넬 `'__NONE__'` + `whereRaw('team_key IS NULL')`**로 처리해야 한다(M3) — `null`을 넘기면 필터가 조용히 사라진다 |
| `src/permission/ProjectScope.js` (**신규**) | `PROJECT_SCOPES` + `normalizeScope` 단일화, 4곳 import (P1) | **H** | C2. 미완료 시 TEAM_ONLY가 `'ALL'`로 격하되어 **fail-open**. 특히 `SeedData.js:93`은 `SEED_VERSION` bump 때마다 도는 시한폭탄 |
| `src/seed/SeedData.js` | `:54`·`:93` 리터럴 삼항 → `normalizeScope` import (P1) | **H** | 동상 |
| `src/index.js` | `CONTROLLER_REGISTRARS` 배열 export (P0) | **L** | M7. 등록 목록 이중 관리 제거 |
| `src/resolver/project/ProjectService.js` `deleteProjectService` | cascade 1단계 추가 (P2) | **M** | 삭제 순서 중간 삽입. 실패해도 멱등 재실행 가능 |
| `src/resolver/project/ProjectRepository.js` | cascade 함수 1개 추가 (P2) | **L** | |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `buildPeopleContext`에 팀 맵 + `people[]`에 2필드 (P2) | **M** | `findUsersRepository({})`가 `SELECT *`라 `team_key`가 자동으로 실려 온다 → 쿼리 변경 불필요. `roleNameMap` 조립 패턴을 그대로 복제 |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | 루트에 `teamMeta`/`memberTeamMap` (P2) | **M** | 스냅샷 **테이블**(`portfolio_project_snapshot`) 계약 불변이 회귀 방어의 핵심(S6 유지). ⚠ **단 P2-a는 배치를 수정한다** — `computeGlobalUtilization`에 `investedMd`/`availMd` 2필드 추가(§3 결정 D). `util` 값·산식은 불변이라 기존 소비자 무회귀 |
| `src/resolver/resourceAnalysis/ResourceAnalysisService.js` | 행에 2필드 (P2) | **L** | |
| `src/resolver/projectIssue/ProjectUsersService.js` | `findProjectusersByProjectIdService` 행에 2필드 (P2) | **M** | 급여 탭·배정 보드가 같은 응답을 소비하므로 **필드 추가만** 엄수 |
| `src/index.js` | import + 등록 2줄 | **L** | |
| `src/utils/errors/ErrorCodes.js` | 코드 8개 추가 | **L** | |
| `manifest.yml` | KVS `team` 엔티티 1종 | **M** | deploy 순서 준수 필요(미선언 필드 저장 시 422) |
| `test/permission/permissionMap.contract.test.js` | import·등록 2줄 추가 | **H(빌드)** | 누락 시 즉시 테스트 실패 — 이것이 안전망이다 |

### 프론트

| 파일 | 변경 | 위험 |
|---|---|---|
| `static/ui/src/stores/usePermissionStore.js` | `team` 상태 + 셀렉터 2개 (P1) | **M** — 앱 부트 경로. `res.team` 부재 시 기본값 폴백 필수 |
| `static/ui/src/App.jsx` | 라우트 1줄 | **L** |
| `static/ui/src/layout/Sidebar.jsx` | `backofficeItems` 1항목 | **L** |
| `static/ui/src/utils/queryKey/backofficeKeys.js` · `projectKeys.js` | 키 4개 추가 | **L** |
| `static/ui/src/backoffice/page/user/*` | 팀 컬럼·필터·StatCard (P0) | **M** |
| `static/ui/src/backoffice/page/permission/*` | TEAM_ONLY 옵션·경고 (P1) | **M** |
| `static/ui/src/pages/resource/overview/*` | 팀 필터·컬럼 (P2) | **M** |
| `static/ui/src/pages/portfolio/*` | 팀 필터·위젯 (P2) | **M** |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | 담당 팀·팀 컬럼·일괄추가 (P2) | **M** |

### 특별 주의 — 과거 회귀 패턴 재발 방지

1. **`{success, ...rest}` 스프레드 계약**: 프론트는 반드시 `if (!res?.success) throw` 후 `res.content`를 읽는다. `res.content`를 먼저 읽고 `?? []`로 삼키면 에러가 조용히 사라진다(프로젝트 페이지 상태 미표시 사건).
2. **다중 shape 재사용 컴포넌트**: `TeamSelect`·팀 컬럼 셀에 **`project_team` 유래 팀 객체**와 **`users.team_key` 유래 팀 객체**를 섞어 넘기지 말 것. 두 팀 객체는 필드가 다르다(`isPrimary`/`assignedMemberCount`는 전자에만 존재). 참조 필드가 한쪽에만 있으면 `?? 0`이 결함을 삼킨다(`ScopeSplitCell` 사건).
3. **서비스 내부 소비자**: `getResourceOverview` 등 응답 계약을 바꾸는 경우, 해당 서비스 함수명을 `src/` 전역 grep해 **백엔드 내부 호출 지점**까지 확인할 것(`getProjectStatusListService` 계약 변경 회귀 사건). 특히 `buildPeopleContext`는 `getResourceOverviewService`·`getResourceProfileService` 두 곳이 소비한다.
4. **팀장 축(`teamLead`)을 write resolver에 부여할 때, 그 화면이 호출하는 read resolver의 grant를 함께 확인하고 동반 부여한다.** 축을 write에만 붙이면 서버 판정축만 생기고 사용자에게는 아무것도 열리지 않는다(H1: 초안 5키 중 4키가 선행 read 차단으로 죽어 있었다). **부분 개방은 전면 차단보다 위험하다** — `UserSkillEditModal`은 `getUserSkills`로 로드한 뒤 `setUserSkills`로 전량 덮어쓰므로, read만 막고 write를 열면 저장 시 스킬이 전멸한다.
5. **"재사용한다"고 선언한 기존 함수는 미전달·빈값·경계 시맨틱을 반드시 열어본다.** 3차 검토의 Blocker 3건이 전부 이 한 가지 원인에서 나왔다 — C1(`UPDATE_USER`가 미전달을 **NULL로 쓴다**), C2(`normalizeScope`가 **4벌 복제**돼 신규 값을 격하한다), C3(`whereIn([])`이 **조건을 통째로 버린다**). 셋 다 해당 파일을 한 번 더 읽었으면 잡혔다. 구조가 아니라 **접합부**에서 나온 결함이다.
6. **`payload` 키 이름은 실제 호출부에서 확인한다.** `insertProjectusers`는 `accountIds`가 아니라 `jiraUser:[{value}]`였다(H2). 계약 표에 적힌 키가 실제와 다르면 가드는 **조용히 fail-close**되어 기능이 죽는다 — 테스트로도 정적 검출이 어렵다.

### 8-3. 이중 구현 지점 등록부 (§D)

같은 규칙·상수가 두 곳 이상에 존재하는 지점을 **전부 등록**한다. 하나가 바뀌고 다른 하나가 안 바뀌면 조용히 갈린다. **가능하면 구조적으로 제거하고, 불가능하면 대조 테스트로 묶는다.**

| # | 축 | 지점 | 해소 방식 | 단계 |
|---|---|---|---|---|
| **A1** | 프론트 ↔ 백엔드 (**규칙**) | 상속 권한 미리보기 `nearestAncestorWith` — 프론트 `buildTeamTree.js` ↔ 백엔드 `TeamTree.js` | ⚠️ **제거 불가**(프론트가 즉시 미리보기를 해야 함) → **정규 케이스표 P1~P8 대조 테스트**(§6-7). 서버가 최종 판정자 | P1 |
| **A2** | 프론트 ↔ 백엔드 (**규칙**) | DnD 드롭 판정 `resolveTeamTreeDrop` ↔ `updateTeam` 사이클/깊이 가드 | ⚠️ **제거 불가**(사전 차단 UX) → **정규 케이스표 C1~C10 대조 테스트**(§6-7). 프론트는 서버 규칙의 **부분집합**이어야 함 | P3-B |
| **B1** | 프론트 ↔ 백엔드 (**상수**) | `MAX_TEAM_DEPTH`, `MAX_TEAMS` | ✅ **구조적 제거** — `getTeamList.content.limits`로 서버가 내려주고 프론트는 리터럴을 두지 않는다(M6) | P0 |
| **C1** | 백엔드 내부 (**규칙 N중 복제**) | `normalizeScope` 리터럴 삼항 **4벌** — `PrincipalResolver:32`, `PermissionService:13`, `SeedData:54`, `SeedData:93` | ✅ **구조적 제거** — `src/permission/ProjectScope.js` 단일화 + **재복제 방지 정적 검사**(§4-8) | P1 |
| **C2** | 백엔드 내부 (**목록 복제**) | 컨트롤러 등록 목록 — `src/index.js` ↔ `permissionMap.contract.test.js` | ✅ **구조적 제거** — `CONTROLLER_REGISTRARS` 배열 export/import(M7) | P0 |
| **C3** | 백엔드 내부 (**정책 ↔ 매핑**) | `PERMISSION_MAP`의 `teamLead` 키 ↔ `TEAM_LEAD_WRITE_ALLOWLIST` 키 | ⚠️ 부분 해소 — **포함 관계 계약 테스트**(H3). `targets`가 실제 payload 키인지는 **정적 검증 불가**(H2가 이 사각지대) → §8-2 규칙 6에 의존 | P1 |
| **D1** | 백엔드 ↔ 백엔드 (**지표**) | 팀 비용 = 서버 `groupCostByKey` **only**. 프론트 `byIssue[].byMember` 롤업 **금지** | ✅ 설계로 제거 — 총액이 어긋나는 근거를 §6-8에 명시 | P3-A |
| **D2** | 화면 ↔ 화면 (**지표**) | 가동률 — 가중 `Σ/Σ` vs 산술평균 | ✅ **3차 갱신: 산술평균 자체를 폐기**해 제거 — 분모 `availMd`가 배치에 이미 있으므로 **단일 이름 `팀 가동률` = 가중 `Σ/Σ`**. 라벨 분리(`팀 인원 평균 가동률`)는 **폐기**됐다(§3 결정 D) | P2 |
| **C4** | 백엔드 내부 (**규칙 복제**) | 재무 열람 판정 `canReadCost` — `ProjectDashboardService.js:135` private 복사본. N6가 포트폴리오에 2번째를 만들려던 참 | ✅ **구조적 제거** — `src/permission/CostAccess.js`로 승격, 기존 복사본은 import 로 대체(N6) | P2 |
| **B2** | 프론트 ↔ 백엔드 (**센티넬 상수**) | 팀 필터 `'__NONE__'` — 백엔드 `TeamTree.TEAM_FILTER_NONE` ↔ 프론트 `constants/team.js` | ⚠️ **제거 불가**(런타임 경계) → 양쪽 모두 **상수 파일에서만 정의**, 리터럴 재작성 금지. 신규 화면(N5·N6)은 반드시 import | P2 |
| **C5** | 백엔드 내부 (**산식 복제**) | `MD = seconds / (hourRate × 3600)` — `IssueAnalysisService`(4) · `PortfolioAggregator`(2) · `ProjectCostService`(1) · `ResourceAnalysisService`(1) = **8곳 동일 복제** | ⚠️ **이번 회차에 통합하지 않는다** — 8곳 값이 전부 동일해 **현재 divergence 0**이고, 8곳을 건드리는 회귀면이 P2 범위를 넘는다. `projectProgress/CALCULATION.md:13`에 규약이 문서화돼 있어 드리프트 위험만 남는다. **신규 코드는 기존 상수식을 그대로 쓴다**. 별도 과제 | (별도) |
| **D3** | 화면 ↔ 화면 (**지표 이름 충돌**) | **"완수율"이 두 개** — `computeCompletionRate`(사람: `spent/(spent+remaining)`) ↔ 스냅샷 `completion_rate`(프로젝트 진척) | ✅ **라벨 분리로 제거** — N7은 `팀원 평균 완수율`, N6은 `팀 참여 프로젝트 평균 완수율`. **`팀의 완수율`이라는 표현 금지**(§3 팀 지표 단일 정의) | P2 |
| **D4** | 층 분리 (**롤업**) | 팀 단위 롤업 — N6(포트폴리오)·N7(마이페이지)·다음 회차 `/resource` 3곳 | ✅ **구조적 단일화** — 개인 지표는 **백엔드**(기존 함수 재사용), 팀 롤업은 **프론트 `aggregateByTeam()` 순수함수 1개**. 두 층이 겹치지 않으므로 구현이 갈릴 자리가 없다. N7 서버가 팀 합계를 내려주지 **않는** 이유가 이것 | P2 |
| **C6** | 백엔드 내부 (**산식 복제**) | `computeCompletionRate` — `ResourceManagementService.js:261` **과** `WorkAssignmentRules.js:96`에 **동일 코드 2벌** | ⚠️ **이번 회차에 통합하지 않는다**(값 동일, 통합 시 두 도메인 회귀 검증 필요) → **N7은 새로 만들지 말고 둘 중 하나를 import.** 통합은 별도 과제 | P2 |
| **D5** | 화면 ↔ 화면 (**지표 분기**) | **가동률 3종** — ①글로벌(`computeGlobalUtilization`) / ②프로젝트내(`PortfolioAggregator:353-358`) / ③분석탭(프론트 실시간). 셋 다 UI 라벨이 "가동률" | ⚠️ **통합하지 않는다**(회귀면이 P2를 크게 넘는다) → **"팀 축에는 ①만 쓴다"는 규칙으로 회피.** ②는 프로젝트별 막대, ③은 프로젝트/기간 스코프 전용으로 현행 유지. **N6가 ②를 쓰려던 초안을 정정했다** | P2 |
| **D6** | 화면 ↔ 화면 (**단위 분기**) | **MD→MM 환산 3종** — 경과기간 월평균 / 조회기간 월평균 / 달력 30.4375일 | ✅ **회피** — 팀 축은 **MD만** 쓴다(가산적·정의 단일). 팀 단위 MM은 제공하지 않는다(§3 결정 B) | P2 |

> **카테고리 C(백엔드 내부 복제)는 3차 검토에서 처음 등장했다.** 1·2차 설계는 프론트↔백엔드 축(A·B)만 이중 구현으로 인식했고, **백엔드 내부의 같은 규칙 N중 복제**라는 축을 놓쳤다. C2 Blocker가 정확히 여기서 나왔다.

---

## 9. 단계 분할 (P0 / P1 / P2 / P3-A / P3-B) — 각 단계 독립 배포 가능

### P0 — 팀 마스터 + 소속 (권한 로직 0줄 변경)

**목표**: 팀을 만들고, 계층을 세우고, 사람을 배치할 수 있다. 권한 판정에는 **아무 영향 없음**.

백엔드
- [ ] **🔴 C1 선결 — `updateUserService` read-merge 전환** (§4-9). "payload에 없는 필드는 변경되지 않는다" 불변식 확립. **이걸 먼저 하지 않으면 `teamKey` 수용 즉시 관리자 일상 조작에서 팀 소속이 NULL로 날아간다.** `undefined`(보존) ≠ `null`(해제) 구분 필수
- [ ] **🔴 C1 테스트 — repository mock 인자 레벨**: `updateUser({id, roleKey})` 후 `permission_key`·`salary`·`team_key`가 호출 전과 동일 / `updateUser({id, permissionKey:null})` → 실제 NULL 전달
- [ ] **M7 — `src/index.js`에 `CONTROLLER_REGISTRARS` 배열 export**, 계약 테스트가 import (신규 컨트롤러 넣기 전에 하는 것이 싸다)
- [ ] `manifest.yml` KVS `team` 엔티티 선언 → **`forge deploy` 선행**
- [ ] `CustomEntityManager.findAllPaged` 추가 (기존 `findAll` 불변) — `{ results, truncated }` 반환, `MAX_TEAMS` 단일 상수를 `addTeam` 가드와 공유 (§R1 경계값)
- [ ] `ddl/users.sql.js` `ALTER_USERS_ADD_TEAM_KEY` + `ddl/index.js` + `migrate.js` `v013`
- [ ] `UserQuery`에 `TEAM_COUNT` / `UPDATE_TEAM_BY_ACCOUNTS` / `CLEAR_TEAM_BY_TEAM_KEY`
- [ ] `src/resolver/backoffice/team/` — `TeamTree.js`(순수) → `TeamTreeCache.js` → `TeamRepository.js` → `TeamService.js` → `TeamController.js`
- [ ] **🔴 C3 — Repository 빈 집합 가드 5종** (§4-2): `findAccountIdsByTeamKeys`·`moveUsersToTeam`·`clearTeamOfUsers` 등 진입부 `if (!arr?.length) return ...`. **테스트는 반환값 + `executeQuery` mock 호출 0회를 함께 단언**
- [ ] **쓰기 경로 캐시 우회** (M1) — `addTeam`/`updateTeam`/`deleteTeam` 검증은 `buildTeamIndex(await findAllPaged())` 즉시 로드. 읽기는 캐시 유지
- [ ] `getTeamList` 응답에 **`content.limits: { maxDepth, maxTeams }`** (M6 — P3-B가 백엔드 변경 0을 유지하려면 P0에 있어야 함)
- [ ] `deleteTeam` 응답에 **`permissionLostCount`·`inheritanceChangedCount`** (H5)
- [ ] `nearestAncestorWith` 테스트 — **§6-7 P1~P8 정규 케이스표**(특히 P2 "가까운 조상이 루트를 이긴다", P7 "손상 부모키 → null + error 로그")
- [ ] `ResourceCatalog`에 `TEAM_MANAGEMENT` (16→17), `onInstall.SEED_VERSION` 7→8
- [ ] `PermissionMap`에 team 8키, `ErrorCodes` 8개
- [ ] `src/index.js` 등록 + **계약 테스트 import/등록 2줄**
- [ ] `UserService` — 목록/단건/메타에 `teamKey/teamName/team` 추가, `addUser`/`updateUser`가 `teamKey` 수용
- [ ] `UserRepository` — `whereEq('team_key', ...)` 필터
- [ ] 테스트: `TeamTree.test.js`(사이클·깊이·후손), PermissionMap 계약 테스트 통과

프론트
- [ ] `backofficeKeys` 3키, `App.jsx` 라우트, `Sidebar` 항목
- [ ] `backoffice/page/team/` 페이지·트리·상세·모달 3종·`buildTeamTree.js`(+테스트)
- [ ] `components/select/TeamSelect.jsx`
- [ ] `/backoffice/users` 팀 컬럼·필터·StatCard·등록/수정 모달 팀 Select
- [ ] `locales/kr|en/team.json` 신규 + `common.json`·`user.json`·`permission.json` 추가 → `npm run merge`

**배포 가능 판정**: 기존 권한 판정 코드 무변경. 팀을 안 쓰면 아무것도 달라지지 않는다.
**단, C1은 예외다** — `teamKey` 수용이 P0에 있으므로 §4-9 read-merge가 **P0 완결 조건**이다. 이것 없이 P0을 배포하면 팀을 쓰지 않아도(사용자 수정 모달을 쓰기만 해도) 회귀가 발생한다.

### P1 — 권한 확장 (TEAM_ONLY · 팀 상속 · 팀장)

**목표**: 팀이 권한을 결정한다.

백엔드
- [ ] `PrincipalResolver` — `getTeamIndex()` 연동, principal 8필드, 권한세트 fallback(R2), `scopedProjectIds` TEAM_ONLY(S4)
- [ ] `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNTS(count)` + Repository 함수 (**빈 배열 가드 필수** — `generateInClause(0)`은 `IN ()` 문법 오류)
- [ ] **P1 과도기 규칙**: TEAM_ONLY = **`projectusers` 경로만**(팀원 개인 배정 합집합). `project_team` 합집합은 P2에서 추가한다. 스코프가 **좁아지는** 방향이라 권한 구멍 없음(fail-close). ⚠ `ProjectTeamRepository.findProjectIdsByTeamKeys`는 **P1 항목이 아니다** — P2 테이블이 없으므로 이 시점에 코드를 넣지 말 것(L3)
- [ ] **🔴 C2 선결 — `src/permission/ProjectScope.js` 신규 + 4곳 import** (`PrincipalResolver:32`, `PermissionService:13`, `SeedData:54`, `SeedData:93`). 리터럴 삼항 0건
- [ ] **🔴 C2 테스트 2건** — ① `PROJECT_SCOPES.every(s => normalizeScope(s) === s)` ② `src/` 전역에 `'MEMBER_ONLY' ?` 리터럴 삼항 0건(정적 검사)
- [ ] `permissionGuard` — `isTeamLeadOver`(accountTargets + teamTargets) + OR 분기 + `req.grantedBy`
- [ ] `principal.leadingScopeTeamKeys` 신규(내가 리더인 팀 + 후손. `scopeTeamKeys`와 구분 — 후자를 write 판정에 쓰면 과대)
- [ ] `PermissionMap` — **5키에 `teamLead` 부가**(`findTeamById`/`getUserSkills`/`setUserSkills`/`addTeamMembersToProject`/`removeProjectMemberByAccount`). **`updateUser`·`findUserByAccountId`·`insertProjectusers`는 부여하지 않는다**(H1·H2 — §R3 근거)
- [ ] **H3 — `TeamLeadFieldPolicy.js`의 미등록 resolver = 전부 드롭**, 위 5키 전부 명시 등재
- [ ] **H3 계약 테스트** — `PERMISSION_MAP`의 `teamLead` 보유 키 ⊆ `TEAM_LEAD_WRITE_ALLOWLIST`
- [ ] `PermissionService.userPermissionCheckService` — `team` 블록 추가
- [ ] **`src/permission/TeamLeadFieldPolicy.js` 신규** — `TEAM_LEAD_WRITE_ALLOWLIST` + `applyTeamLeadFieldPolicy` (§R3-A). **블랙리스트 금지 + 미등록 resolver 전부 드롭**
- [ ] `setUserSkillsService` / `addTeamMembersToProjectService` / `removeProjectMemberByAccountService` — allowlist 적용 후 `content.droppedFields` 반환 (§R3-C)
- [ ] 해당 `Controller` — `grantedBy` 전달
- [ ] 테스트: principal 매트릭스, `isTeamLeadOver` 화이트리스트/빈대상/배열대상/**teamTargets**, `teamLead` meta 형태 계약 테스트
- [ ] **테스트(보안 필수)**: `applyTeamLeadFieldPolicy('setUserSkills', {...salary, permissionKey, 미래필드})` → 2키만 통과 / **미등록 resolver → payload 전부 드롭**

프론트
- [ ] `usePermissionStore` `team` 상태 + `isTeamLead()`/`getTeamKey()`
- [ ] `/backoffice/permission` — `TEAM_ONLY` 옵션 + 미소속자 경고 배너
- [ ] `/backoffice/users` 권한 Select에 **"팀 상속"**(= `permission_key = NULL`) 옵션
- [ ] **`/backoffice/users` 편집 모달 — "팀 상속" 선택 시 실효 권한 미리보기 1줄** (§R7, 상속 세트 없으면 경고 톤)
- [ ] **`/backoffice/users` 편집 모달 — 팀장 경로(`isTeamLead() && !canWrite('USER_MANAGEMENT')`)면 급여·권한·팀 입력란 미렌더** (§R3-C 1차 방어)
- [ ] **`updateUser` 응답의 `droppedFields`가 비어있지 않으면 경고 토스트** (§R3-C 안전망). 조용히 삼키지 말 것
- [ ] `/backoffice/team` 편집 모달에 팀 권한세트 Select
- [ ] **`/my-page` "내 팀" 섹션 신설 — 팀장 축의 유일한 진입점** (H1). `isTeamLead()`일 때만 노출. `findTeamById`(teamTargets)로 팀원 목록 → 스킬 편집(`getUserSkills`+`setUserSkills`) → 배정/해제. **권한 게이트가 없는 개인 화면이라 팀장이 반드시 도달한다**
- [ ] `/backoffice/permission` — TEAM_ONLY 선택 시 **`peopleWarning`** 배너(H4 운영 규칙: RESOURCE_MANAGEMENT/USER_MANAGEMENT read를 함께 주면 전사 인원이 보인다)
- [ ] 팀 필터 Select의 "팀 미지정" 옵션 `value = '__NONE__'` (**`null` 금지** — M3)
- [ ] `permission.json`·`team.json`·`user.json` 키 추가 → merge

**배포 가능 판정**: `TEAM_ONLY`를 아무 세트에도 지정하지 않고 팀장을 지정하지 않으면 기존과 동일 동작.
**완결 조건 (C2)**: `PrincipalResolver`·`PermissionService`·`SeedData`(2곳) 네 지점이 모두 `ProjectScope.js`를 import 하고, **TEAM_ONLY가 왕복(저장 → 시드 순회 → 판정)에서 보존**된다. 하나라도 남으면 TEAM_ONLY가 `'ALL'`로 격하되어 **권한 축소 의도가 권한 확대로 뒤집힌다.**

### P2 — 프로젝트 배정 + 분석 팀 차원

**목표**: 팀이 프로젝트를 담당하고, 분석이 팀으로 갈라진다.

> **⚠ P2 + N5 + N6 + N7은 한 회차로는 과하다. 아래 3단계로 나눠 낸다.**
> **설계는 셋을 함께 했다** — 지표 단일 정의(§3)를 한 번에 확정해야 세 화면이 갈리지 않기 때문이다. **구현만 나눈다.**

| 단계 | 내용 | 근거 | 선행 |
|---|---|---|---|
| **P2-a** (먼저) | 프로젝트-팀 배정 + 인력관리 팀 필터·팀별 추가(N1) + 분석 화면 `teamKey` 응답 확장 + **`utilizationPeople`에 `investedMd`·`availMd` 2필드** | **나머지 전부의 전제를 깐다.** 사용자 요구 1번(인력관리)을 직접 충족하고, N6·N7이 쓸 팀 축(`memberTeamMap`)과 가동률 분모를 여기서 만든다. 순수 추가라 회귀면이 가장 좁다 | — |
| **P2-b** | **N7**(`/my-page` 내 팀 분석) + **N5**(캘린더 팀 필터) | 둘 다 **blast radius가 가장 작다** — N7은 `/my-page` 전용(신규 resolver 1 + 축 1), N5는 백엔드 1필드 + 프론트 필터. **기존 화면의 동작을 하나도 바꾸지 않는다.** 사용자 체감이 크고 롤백도 쉽다 | P2-a(`aggregateByTeam`) |
| **P2-c** (마지막, 단독) | **N6**(대시보드 팀 비교) + **U12**(포트폴리오 인건비 게이트) | **유일하게 기존 동작을 축소하는 변경**이다 — 지금 Cost 탭을 보던 Member가 못 보게 된다. 배포 커뮤니케이션이 필요하고, 다른 것과 묶으면 **롤백 단위가 커진다.** 단독으로 내야 문제 시 이것만 되돌린다 | P2-a(`memberTeamMap`) |

**N7을 먼저 낼 수도 있다** — N7은 P2-a의 산출물 중 `investedMd`/`availMd`와 `aggregateByTeam`만 필요하고 `project_team` 테이블에는 의존하지 않는다. 빠른 성과가 필요하면 **P2-a의 배치 2필드만 먼저 떼어 P2-b를 앞당길 수 있다.** 다만 그 경우에도 **P2-c는 항상 마지막**이다.

백엔드
- [ ] `ddl/projectTeam.sql.js` + `migrate.js` `v014`
- [ ] `src/resolver/projectTeam/` 3계층 + `ProjectTeamQuery`
- [ ] **`getTeamMemberCandidates`** — 팀(+후손) 인원 + `alreadyAssigned` 서버 판정 (N1)
- [ ] **`addTeamMembersToProject` 2모드** — `accountIds` 유무로 전체/개별 분기, 빈 배열 거부, 스코프 위반 전체 거부, 500 상한 (N1 §3)
- [ ] `PermissionMap`에 **4키**, `src/index.js` 등록 + 계약 테스트 2줄
- [ ] 테스트(N1): `accountIds` 미지정→전체 / 지정→`includeDescendants` 무시 / `[]`→`TEAM_MEMBER_SELECTION_EMPTY` / 스코프 밖 1명 섞임→전체 거부 / 501명→`TEAM_ASSIGN_BATCH_TOO_LARGE`
- [ ] `deleteProjectService` cascade에 `project_team` 삽입
- [ ] `PrincipalResolver` TEAM_ONLY에 `project_team` 합집합 추가 + **`findProjectIdsByTeamKeys` 빈 배열 가드**(L3 — P1이 아니라 여기서 처음 등장)
- [ ] `addTeamMembersToProject` — `insertProjectusersService` 재사용
- [ ] 응답 확장: `getResourceOverview`, `getResourceProfile`, `getPortfolioDashboard`, `getResourceAnalysisList`, `findProjectusersByProjectId`
- [ ] `StorageQuery`에 `project_team` 행수 (선택), `demoSeed.resetApp`에 DELETE (선택)

**N5 — 프로젝트 캘린더 팀별 필터 (백엔드 1건)**
- [ ] `getProjectCalendarWorklog` 응답 루트에 **`memberTeamMap`·`teamMeta`** 추가. 원천은 **`projectusers ⋈ users`**(워크로그 작성자가 아니다 — 휴가만 있고 워크로그가 없는 사람이 "팀 미지정"으로 오분류된다)
- [ ] `memberTeamMap`은 **팀 미소속자의 키를 넣지 않는다**(`null` 값 금지, U3 교훈)
- [ ] `getAllProjectWorkersSchedule`·`PermissionMap`·`getTeamOptions` **전부 무변경**

**지표 단일 정의 — P2-a 선결 (§3 "팀 지표 단일 정의")**
- [ ] 🔴 `PortfolioAggregator.computeGlobalUtilization`(`:211-213`) — `people.push({ accountId, util, investedMd, availMd })` **2필드 추가**. `util` 값·산식 불변 → 기존 소비자 무회귀
- [ ] 배치가 `utilizationPeople` 직렬화 크기를 `console.info`로 기록(**KVS 값 240KiB 한도** 관측. 캡 아님)
- [ ] `PortfolioDashboardService`의 `utilization.people[]`에도 2필드 전달
- [ ] `computeCompletionRate` **export 승격**(현재 private). **새로 만들지 말 것** — 이미 2벌 복제돼 있다(§8-3 C6)
- [ ] 프론트 `utils/team/aggregateByTeam.js` **순수함수 + 테스트**를 P3-A에서 **P2로 앞당김**. `avgFields`는 가중 전용(`{field, numerator, denominator}`)

**N6 — 통합 대시보드 팀별 비교 + 팀 멀티셀렉트 (백엔드 3건)**
- [ ] **`src/permission/CostAccess.js` 신규** — `canReadCost` + `COST_DENIED_REASON`. `ProjectDashboardService.js:135`의 private 복사본을 **이 파일 import로 대체**(3번째 복사본 금지, §8-3 C4)
- [ ] **🔴 U12 — `getPortfolioDashboard` 인건비 게이트.** `canReadCost === false`면 `projects[].members[].salary`·`projects[].totalSalary`·**루트 `salaryBuckets`** 키 삭제 + 루트 `costMasked: true`. **N6 인건비 축과 분리 불가능한 한 단위**
- [ ] `getPortfolioDashboard` 루트에 **`memberTeamMap`(전 사용자)·`teamMeta`(전체 팀)** 추가 — **스코프를 좁히지 않는다**(§H-2 3층 규칙). 스냅샷 **테이블** 무변경 = S6 유지
- [ ] **`emptyShape()`에도 `memberTeamMap`·`teamMeta`·`costMasked` 3키 전부 추가.** `costMasked`는 **하드코딩 `false`가 아니라 `!canReadCost(principal)`** (L-2)
- [ ] 테스트: `PROJECT_COST` 미보유 principal → **응답에 `salary`/`totalSalary`/`salaryBuckets` 키 부재 + `costMasked:true`**
  ⚠ **"급여를 조회조차 하지 않음" 단언은 쓰지 말 것 (H-1)** — U7은 급여가 **별도 쿼리**였지만 포트폴리오의 salary는 `getAllSnapshots()`가 통째로 읽는 **`members_json` 안에 있다**(`PortfolioAggregator.js:294-304` 적재, `PortfolioDashboardService.js:150` parse). **읽은 뒤 제거하는 것만 가능**하므로 그 단언은 **구현 불가능**하다

프론트
- [ ] `projectKeys.projectTeams` + `projectKeys.teamMemberCandidates`, `useProjectTeams` / `useTeamMemberCandidates`
- [ ] 프로젝트상세 인력 탭 — 담당 팀 뱃지·팀 컬럼·**팀원 일괄 추가 + "팀에서 골라 담기" 모달**(체크박스, `alreadyAssigned` 비활성 표시, 선택 0명이면 실행 버튼 비활성 — 서버 `TEAM_MEMBER_SELECTION_EMPTY`에 도달하지 않게 1차 방어)
- [ ] `/resource` 인력현황 팀 필터·컬럼(+ 하위 포함 토글)
- [ ] 리소스 분석 리포트 팀 컬럼·필터
- [ ] (선택) 배정 관계도 노드 팀 색상

**N7 — `/my-page` 내 팀 팀원 업무 분석 (백엔드 2건)**
- [ ] **신규 `getMyTeamWorkAnalysis({teamKey})`** — 인원 축을 `principal.leadingScopeAccountIds`로 **구조적 제한**(payload 조작으로 넓힐 수 없음). 빈 집합이면 쿼리 미발행(C3)
- [ ] 지표는 **전부 재사용**: `fetchAssignedLoadByAccounts` · `selectActiveProjectCounts` · `getRollupMeta`(①가동률) · `computeCompletionRate`(A). **신규 계산 0**
- [ ] `PermissionMap`: **`{ grants: [], project:'none', teamLead:{ teamTargets:['teamKey'] } }`** — **`teamLead` 단독 축**(M-3: grants는 비리더 관리자에게 빈 결과만 열어주므로 무의미)
- [ ] **계약 테스트 확장** — `permissionMap.contract.test.js`의 "`meta.grants.length > 0`" 단언이 `grants: []`를 거부한다. **`teamLead`가 있으면 빈 `grants`를 허용**하도록 수정
- [ ] `computeCompletionRate`는 **`WorkAssignmentRules.js:96`(이미 export)을 import** — 승격 불필요, 세 번째 복사본 금지 (L-5)
- [ ] **`getResourceProfile`에 `teamLead:{ accountTargets:['accountId'] }` 추가** — 드릴다운 드로어 재사용. **H1 감사 완료**: 드로어의 클라이언트 호출은 `getResourceProfile` + `getSettingData`(**PUBLIC**) 2개뿐이고 응답에 타인이 실리지 않음을 확인
- [ ] **`TEAM_LEAD_WRITE_ALLOWLIST`에 2키 등재 필수** — `getMyTeamWorkAnalysis: ['teamKey']`, `getResourceProfile: ['accountId']`. 미등재 시 H3 규칙에 따라 **payload가 통째로 드롭되어 동작하지 않는다**
- [ ] **재무 필드 일절 없음**(§R3-B) — `salary`/`annualSalary`/인건비
- [ ] 테스트: 비팀장 거부 / 리딩 팀 아닌 `teamKey` 거부 / `leadingScopeAccountIds` 빈 집합 → 빈 결과 + SQL 미발행 / 응답에 재무 필드 부재

**N7 프론트 — 내 팀 분석**
- [ ] `myPageKeys.teamAnalysis(teamKey)` + `useMyTeamAnalysis`
- [ ] `MyTeamSection` 확장 — **소속 팀 줄은 팀장에게도 표시**(리딩 팀과 다를 수 있음, §11 U5). `myTeamKey === selectedTeamKey`면 중복이므로 숨김
- [ ] 팀 요약 4지표는 **`aggregateByTeam`으로 계산**(N6과 같은 함수). 서버가 팀 합계를 내려주지 않는다(§8-3 D4)
- [ ] 팀원 테이블 + `getResourceProfile` 드로어 재사용. **1인 팀이면 요약 숨기고 테이블만**
- [ ] `utilization === null`(배치 미실행)을 **"가동률 0"과 구분** — `aggregateStatus`/`lastAggregatedAt` 표기. ⚠ 기존 `/resource`는 `util=null`을 `available=true`로 취급하므로 같은 실수를 하지 말 것
- [ ] InfoTip: `팀원 평균 완수율`은 **최근 26주 Done 기준**(`LOAD_DONE_WINDOW`) 명시 / `currentMembershipNote`(현재 소속 기준)

**N5 프론트 — 캘린더 (백엔드 의존 1건뿐)**
- [ ] `ProjectCalender.jsx`에 `TeamSelect`(**단일**) 3번째 필터 박스 추가 + `selectedTeamKey` 로컬 state
- [ ] `filteredWorklogs`(`:91-122`) 술어에 팀 조건 AND. **`event` useMemo(`:125-168`)는 무변경**
- [ ] `useProjectWorkersSchedule`에 `memberTeamMap`·`selectedTeamKey`를 **prop으로 전달**(일정 훅이 따로 fetch 하지 않는다). 필터는 **`:40` `filtered` 단계에서만**
- [ ] **🔴 그룹 키(`start__end__type`)와 `first` 선택 로직은 한 글자도 건드리지 않는다** — `end` 계산 입력이 바뀐다
- [ ] `TEAM_FILTER_NONE`을 `constants/team.js`에서 import(리터럴 재작성 금지), 후손 전개는 `useTeamOptions().options[].parentTeamKey`로 클라이언트 계산
- [ ] 테스트: 팀 필터 전후 각 이벤트 `start`/`end` 동일 / `'__NONE__'` 선택 시 팀 미소속자만 / 인원 필터와 AND

**N6 프론트 — 포트폴리오 (팀 멀티셀렉트 + 비교 위젯을 한 덩어리로)**
- [ ] `TeamSelect`에 **`isMulti` 지원 추가** + `isMulti` 미지정 시 현행 동작 100% 동일함을 테스트로 고정(N5가 단일을 쓴다)
- [ ] `PortfolioFilterBar`에 팀 멀티셀렉트 추가. **`TeamSelect`의 기존 `excludeValues` prop으로 스코프 밖 팀을 제외**한다(M-4). 스코프 = `projects[].members[]` ∘ `memberTeamMap`에서 파생 — **`teamMeta` 키를 순회하지 말 것**(전체 팀이 나온다, §H-2 3층 규칙). `options` 주입 prop은 신설하지 않는다(계층 들여쓰기 보존)
- [ ] `TeamSelect`에 **`includeNoneOption`** 켜기 — '팀 미지정' 선택 가능(L-3). 필터 술어는 `memberTeamMap[accountId] === undefined`
- [ ] `costMasked`를 **`PortfolioFilterBar`·`PortfolioTsrSignalTable`(→`PortfolioProjectTable`)·`ComparisonTabs`에 prop으로 전달**
- [ ] `usePortfolioFilter`에 `selectedTeamKeys` 추가 — **프로젝트 스코프 축소 + 비교 대상 지정을 동시에** 수행(§N6 표)
- [ ] `portfolioAggregate.js`에 **`teamComparison(selected, memberTeamMap, teamMeta, utilizationPeople, {axis, topN})`** 순수함수 + 테스트. **`utilizationPeople` 인자 필수**(M-1 — 없으면 가동률 축을 계산할 수 없다)
- [ ] **가동률 축 전용 InfoTip** — "가동률은 전사 기준이며 프로젝트 선택의 영향을 받지 않습니다"(M-1: 3축은 필터에 반응하고 가동률만 안 하는 비대칭)
- [ ] 배치 미실행 구간(`investedMd`/`availMd` 부재) 폴백 — `aggregateStatus`로 "집계 전" 표기, **0%로 그리지 않는다**
- [ ] `ResourceTab`에 **`PortfolioTeamComparison`** 위젯 신규(`PortfolioRoleLevelDist` 축 토글 패턴 복제). `PortfolioTeamDist`(구성비)와 **별개 위젯**
- [ ] 미선택 시 **상위 10팀 + `기타(N개 팀)` 묶음 + `팀 미지정` 마지막 행**(합계 보존)
- [ ] **`costMasked === true` 게이팅 7지점 전수 적용** (§N6 표) — 필터바 합계 칩 / `TsrSignalTable` salary 컬럼 / `TsrSignalTable` Cost 신호등 / **`ProjectTable` salary 컬럼** / Cost 탭 안내 대체 / `ComparisonTabs` salaryBuckets / 비교 위젯 인건비 축. 정렬 폴백은 **공수(MD)**
- [ ] InfoTip 3종: `projectMetricNote`(프로젝트 지표 미분해) / 인원수 dedup ↔ 공수 비-dedup 비대칭 / `currentMembershipNote`(현재 소속 기준)
- [ ] `resource.json`·`portfolio.json`·`projectDetail.json`·`team.json` 키 추가 → merge

**배포 가능 판정**: `project_team`이 비어 있으면 담당 팀 UI는 빈 상태로 보이고 나머지는 전부 정상.

### P3-A — 프로젝트별 팀 심화 분석 (N3) · 신규 resolver 0

**목표**: 프로젝트 상세에서 "이 프로젝트에서 각 팀이 얼마나 일했는지"를 본다.
**선행 조건**: P2 (인력 행에 `teamKey`/`teamName`이 실려 있어야 함).

백엔드 (3파일, 계산 로직 신규 0)
- [ ] `PortfolioSnapshotQuery.MEMBER_ROWS`에 `u.team_key` SELECT 추가 (컬럼 추가만, 시그니처 불변)
- [ ] `EffectiveSalary.resolveMemberSalaries` 반환에 `teamKey` 추가 (**순수 추가**. 환산식은 절대 불변 — 포트폴리오 스냅샷·급여 관리 탭이 공유)
- [ ] `ProjectCostService` — `groupCostByKey(members, scheduleRate, 'teamKey')` 1줄 + 응답/KVS 캐시에 `byTeam` 포함
- [ ] `ProjectDashboardService` — `getChartDataset`에 `case 'team'` + `getTeamChartData`(기존 `aggregateByUserService` 재사용, 신규 페치 0)
- [ ] `getResourceAnalysisList` **변경 금지** (프론트가 이미 팀 정보를 갖고 있음 — 캐시 키 확장 불필요)

프론트
- [ ] **`utils/team/aggregateByTeam.js` 순수 함수 + 테스트** (표시용 롤업의 단일 구현. `teamKey:null`=Unassigned 마지막 정렬, `issueCount` 합산 금지)
- [ ] N3-1 인력 분석 리포트 — `ViewModeToggle`로 인별↔팀별, 팀 모드는 `pagesize:500` 전량 조회 + 페이지네이션 숨김, 가동률 `ΣtotalMd/ΣeffectiveMmDays` 재계산
- [ ] N3-2 인력 탭 — `TreeTable`(팀=부모/인원=자식) 팀 그룹 모드 토글, 소계(인원·MM·인건비). **인건비 컬럼은 `canRead('PROJECT_COST')`일 때만**
- [ ] N3-3 비용 탭 — `CostByRoleLevel.jsx`를 role/level/team **3-way로 확장**(복제 금지), `useTeamOptions()`로 메타 매핑
- [ ] N3-4 대시보드 — `dashboardTypes.js` `DATA_TYPES`에 `team` 추가 + `ChartTemplate.js` 날짜 필터 분기에 `'team'` 포함. **새 `chartType`은 추가하지 않는다**(`CHART_OPTION_MAP` 미등록 시 백지 차트)
- [ ] **4개 화면 전부에 `team.analysis.currentMembershipNote` InfoTip**
- [ ] `team.json`·`cost.json`·`chartOptions.json` 키 추가 → merge

**의도적 제외**: 이슈 분석 리포트의 팀 축 (§6-8 근거 3가지).
**배포 가능 판정**: P3-A를 배포하지 않아도 P2까지가 완결이다. 팀 컬럼·필터·배정은 P2에서 이미 동작한다.

### P3-B — 팀 트리 드래그앤드롭 (N2) · 프론트 전용, 백엔드 변경 0

- [ ] `resolveTeamTreeDrop.js` 순수 함수 (5규칙: 자기자신/순환/무변화/루트무변화/**깊이+서브트리높이 초과**)
- [ ] `TeamTreePanel.jsx`에 native DnD 배선 — `draggable` + `dataTransfer.setData('text/plain', key)`(**Firefox 필수**) + `dropTargetKey` 3-상태(`undefined`/`null`/`string`) + 모든 핸들러 진입부 `canWrite` 게이트
- [ ] 시각 4신호 — 소스 `opacity:.45` / 가능 타깃 하이라이트+아웃라인 / 루트 드롭존 점선 / **불가 타깃 `dropEffect='none'`+`not-allowed`** (hover 시점에 판정 함수 호출)
- [ ] `useMutation` 낙관적 업데이트 — `onMutate` 스냅샷 → `onError` 롤백 + `console.error`(이중 구현 불일치 신호) → `onSettled` invalidate
- [ ] **`updateTeam` 부분 갱신 보존 확인** — DnD는 `{teamKey, parentTeamKey}`만 보낸다. 미전달 필드가 기존 값으로 보존되지 않으면 드래그 한 번에 팀 이름이 날아간다
- [ ] 모달 상위 팀 Select **유지**(생성 시 필수 + 접근성 대체 경로)
- [ ] `__test__/resolveTeamTreeDrop.test.js` — §6-7의 **C1~C10 정규 케이스 표** 사용, 백엔드 `TeamTree.test.js`와 동일 케이스로 대조
- [ ] `team.json` DnD 키 3개 → merge

**배포 가능 판정**: 프론트 전용이고 백엔드 의존이 0이므로 **어느 시점에 배포해도 무방**하다. P0 여력이 있으면 P0으로 승격 가능.

---

## 10. 미확정 항목 (확인 필요)

| # | 항목 | 영향 | 확인 방법 | 미확인 시 대응 |
|---|------|------|-----------|---------------|
| U1 | Forge SQL의 `WITH RECURSIVE` 지원 여부 | **없음** (설계가 의존하지 않음) | tunnel에서 `WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT SUM(n) AS s FROM t` 실행 → `15` | 그대로 진행 (앱 레벨 재귀) |
| ~~U2~~ | ~~`kvs.entity().query().getMany()`의 `nextCursor` / `.cursor()` 지원~~ | — | — | **✅ 확인 완료 (리더, 2026-07-27) — 지원됨.** 아래 근거 참조. 팀 상한 축소 불필요, `findAllPaged` 설계 그대로 진행 |
| ~~U3~~ | ~~KVS attribute에 `null`/미설정 값 저장 시 422 여부~~ | — | — | **❌ 이 가정은 틀렸다. 실기동으로 반증됨 (2026-07-27). 아래 정정 참조** |

### ⚠️ U3 정정 — KVS는 빈 문자열을 **거부**한다 (실기동 반증, 2026-07-27)

이 설계서는 "`null`/미설정은 KVS 취급이 불명확하니 **빈 문자열 `''`로 저장해 회피**한다"를 기본 방침으로 삼았다(§5-1 포함).
**정반대였다.** P0 배포 후 **루트 팀 최초 생성**에서 즉시 실패했다:

```
Value for attribute "parentTeamKey" cannot be empty
```

루트 팀은 상위가 없으므로 `parentTeamKey`가 `''`가 되고, KVS가 이를 거부한다.
`leaderAccountId` · `permissionKey` · `description`도 동일한 함정이었다(팀장·설명 없이 생성하면 순차 발현).

**올바른 방침: 빈 값이면 속성 자체를 생략한다.**

```js
// src/resolver/backoffice/team/TeamService.js  toRecord()
const record = { id, name, sortOrder };            // 필수만 항상 실는다
if (team.parentTeamKey) record.parentTeamKey = String(team.parentTeamKey);
if (team.leaderAccountId) record.leaderAccountId = String(team.leaderAccountId);
// permissionKey, description 동일
```

- 읽기 쪽은 손댈 필요가 없다 — `TeamTree.normalizeParent`가 `undefined`를 `null`로 정규화하고, 응답 조립도 `?? null`을 쓴다.
- KVS `save`는 **전체 덮어쓰기**이므로 속성을 생략하면 그 값이 사라진다 = **해제**. 의도한 동작이다.

**왜 449개 테스트가 이걸 못 잡았는가 (더 중요한 교훈)**

기존 테스트 2건이 **틀린 동작을 명시적으로 고정**하고 있었다:
```js
test('정상 생성 — parentTeamKey 는 빈 문자열로 저장하고 ...')
expect(record).toMatchObject({ parentTeamKey: '', leaderAccountId: '', permissionKey: '' });
expect(record.permissionKey).toBe('');   // "KVS 저장은 '' (응답 조립 시 null 로 정규화)"
```
설계서의 잘못된 가정 → 구현 → 테스트 순으로 굳어져, **테스트가 통과할수록 결함이 확정되는** 구조였다.
플랫폼 제약을 mock 으로 대체한 테스트는 그 제약을 검증하지 못한다.

→ 회귀 가드를 `src/resolver/backoffice/team/__test__/TeamRecord.test.js`(7건)로 신설하고,
   **"어떤 속성도 빈 문자열로 저장되지 않는다"** 를 불변식으로 단언한다.

**P1·P2 적용 지침**: 새 KVS 엔티티(`project_team` 등)를 추가할 때 선택 필드를 `|| ''`로 채우지 마라.
동일 함정이 재발한다. 값이 없으면 키를 넣지 않는다.
| U4 | `mapCountWithMeta`의 `'NONE'` 규약이 `team`에도 그대로 맞는지 | `getUserMetaCount.team` | `UserService.mapCountWithMeta` 코드 확인 | 이미 `row[keyName]==='NONE' → {id:null,name:'Unassigned'}` 처리 확인됨 — 그대로 사용 |
| U5 | 팀장이 자기 팀 소속이 아닌 경우 허용 여부 (본부장이 하위 팀 리더) | UX | 사용자 확인 | **허용**(거부하지 않음). `leadingTeamKeys`는 `team_key`와 독립 계산되므로 설계상 문제 없음 |
| U6 | 조직 개편 시 팀 이동 이력 필요 여부 | 요구사항 §5에서 **비목표**로 명시됨 | — | 추적 안 함. **현재 소속 기준 집계 + InfoTip 고지**(§6-8) |
| U7 | 대시보드 `salary` dataType이 `PROJECT_COST`가 아닌 **`DASHBOARD` read만으로 급여 분포를 노출** | 기존 권한 구멍(팀 도입과 무관) | `PermissionMap.js` `getChartDataById: R('DASHBOARD','detail')` + `ProjectDashboardService.getSalaryChartData` 확인됨 | **본 설계 범위 밖.** 팀 위젯에 비용 축을 넣지 않아 확대는 막았다. 별도 수정 과제로 리더에게 보고 |
| U8 | `bulkUpdateLayoutsRepository`의 무음 저장 실패(신규 `dashboard_id` INSERT 시 `project_id` 평문 → statement 실패를 `catch`가 삼킴) | 기존 버그(팀 도입과 무관) | `ProjectDashboardRepository.js` 확인됨 | **본 설계 범위 밖.** N3-4가 경로 A를 택해 이 코드에 닿지 않는다. 별도 수정 과제 |
| U9 | `ProjectDashboardService.getChartDataService`가 스코프에 없는 `startDate/endDate` 참조 → 호출 시 ReferenceError | 기존 버그. 현재 프론트가 이 resolver를 실제로 호출하지 않아 미발현 | 코드 확인됨 | **N3-4는 `getChartDataById` 경로만 쓴다.** 이 경로를 건드리지 말 것 |
| U10 | `findProjectusersByProjectId`(`R('PROJECT','detail')`)가 `projectusers.salary`(투입급여)를 **게이트 없이 반환**. Member는 `PROJECT read=true`이므로 **일반 사용자가 프로젝트 인력 탭에서 동료의 투입급여를 본다** | 기존 결함(팀 도입과 무관). §R3-B의 "재무 민감은 팀장에게 열지 않는다"가 인접 경로로 이미 새고 있음 | `PermissionMap.js:89`, `ProjectUsersQuery.FIND_BY_PROJECT_ID:28-43`, `ResourceCatalog.js:49` 확인됨 | **본 설계 범위 밖.** 근본 수정(`PROJECT_COST` read 없으면 salary 마스킹)은 급여 관리 탭·배정 보드가 같은 응답을 소비해 회귀면이 넓다. **N3-2 각주로 한계 명시**(아래) |
| U11 | `UserRepository.deleteByAccountId`가 `users`만 삭제하고 `projectusers` 자식 행을 남긴다 | 기존 결함(§R4 조사 중 발견) | 코드 확인됨 | 본 설계 범위 밖. 같은 회차 수정 권장 |

### U2 확인 근거 (2026-07-27, 리더)

`node_modules/@forge/kvs` 타입 정의 실측:

```ts
// out/query.d.ts
export declare class KvsQueryBuilder implements QueryBuilder {
    where(property: 'key', condition: WhereClause): this;
    cursor(cursor: string): this;        // ← 커서 입력 지원
    limit(limit: number): this;
    getMany<T>(): Promise<ListResult<T>>;
}

// out/interfaces/types.d.ts
export interface ListResult<T> {
    results: Result<T>[];
    nextCursor?: string;                 // ← 다음 커서 반환
}
```

`cursor()` 입력과 `nextCursor` 반환이 모두 존재하므로 **커서 페이징이 완전히 지원된다.**
→ `CustomEntityManager.findAllPaged` 는 `nextCursor` 가 없을 때까지 루프하는 형태로 구현하면 되고,
   팀 수 상한을 100으로 축소할 필요가 없다. 기존 `findAll()` 의 `limit(100)` 하드캡은 그대로 두고
   신규 함수만 추가하는 설계 방침도 유효하다.

---

## 11. 가정 (요구사항에 명시되지 않아 설계자가 정한 것)

1. 팀 이름은 **전역 유일**하다(같은 이름의 팀을 두 부서에 만들 수 없음). 근거: KVS `name` 인덱스 기반 중복 검사가 role/level과 동일 패턴이고, 트리에서 동명 팀은 사람에게도 혼란스럽다.
2. 팀 삭제 시 하위 팀은 **조부모로 승격**한다(재귀 삭제 아님).
3. 팀장은 **한 팀에 1명**(`leaderAccountId` 스칼라). 복수 팀장은 이번 범위 밖.
4. `is_primary` 주 담당 팀은 프로젝트당 **최대 1개**이며 서비스가 보장한다(DB 제약 아님).
5. 팀 필터의 기본 동작은 **"하위 팀 포함 = 켜짐"** (본부 선택 시 산하 전체가 보이는 것이 자연스럽다는 R1의 근거와 일관).
6. `getTeamOptions`는 캐시 친화적으로 `staleTime: 5분`을 권장한다(role/level 목록과 동일 성격).

---

## 12. 리뷰 반영 이력 (2026-07-27)

리뷰 결과 **구조 결정(S1~S8, R1~R7)은 전부 승인**되어 변경하지 않았다. 아래 7건만 반영했다.
(§10 U2 — KVS 커서 페이징 실측 결과는 리더가 직접 갱신한 것으로, 본 반영 대상이 아니며 손대지 않았다.)

| # | 심각도 | 지적 | 반영 섹션 | 반영 내용 |
|---|--------|------|-----------|-----------|
| 1 | **반드시 수정** | TEAM_LEAD `updateUser`가 blacklist(salary 드롭) 방식 — `permissionKey`/`teamKey` 권한 상승 구멍 + 신규 컬럼이 기본 "통과"가 되는 시한폭탄 | **§2 R3 → 신규 `R3-A` 소절**<br/>(§4-4 아래, `teamLead` resolver 표 직후) | **allowlist로 전면 전환.** `src/permission/TeamLeadFieldPolicy.js` 신규 파일 + `TEAM_LEAD_WRITE_ALLOWLIST = { updateUser: ['id','roleKey','levelKey'] }` + `applyTeamLeadFieldPolicy()` 코드 초안. `salary`/`permissionKey`/`teamKey` 미포함이 핵심이며 **신규 컬럼은 자동으로 차단 쪽에 떨어진다**는 불변식을 명문화. §8 영향도에 신규 파일 추가(위험 H), §9 P1에 전용 보안 테스트 2건 추가 |
| 2 | **배포 전 확인 필수** | `findUserByAccountId`의 teamLead read로 `salary`가 실제 노출 (write는 막고 read는 뚫림) | **§2 R3 → 신규 `R3-B` 소절**<br/>+ §3 "P1/P2 기존 resolver 응답 확장" 표 | `grantedBy==='TEAM_LEAD'`일 때 **`salary`·`permissionKey`를 `null`로 마스킹**. `permissionKey`도 마스킹하기로 **결론**(근거: write allowlist에서 막은 것을 read로 우회 정찰하는 경로 차단, 편집 불가한 값을 볼 이유 없음). `roleKey`/`levelKey`/`teamKey`는 노출 유지(팀장이 편집 가능한 필드). **키 삭제 금지, `null` 할당**(두 경로 응답 형태 분기 방지). `RESOURCE` 경로 완전 무변경 명시 |
| 3 | **배포 전 확인 필수** | "정확성은 캐시에 의존하지 않는다" 문구가 사실과 다름 — 캐시가 권한 판정의 입력 | **§2 R1 → "캐시 특성" 문단 전면 재작성** | 지적된 문구로 교체: **"권한 판정은 최대 90초 stale 을 수용한다(기존 principal 캐시와 동일 성질)"**. 내역(TeamTree 60초 + principal L1 30초 = 90초) 명시, 구체적 노출 시나리오(팀장 해제·팀 이동·권한세트 변경) 서술, 수용 근거(기존 30초 지연 전파가 이미 명문화됨 / 즉시 회수는 Jira 계정 비활성화가 1차 통제이며 캐시를 타지 않음) 추가. **"정확성은 캐시에 의존하지 않는다"를 이 캐시에 쓰지 말라**는 금지 조항 명기 |
| 4 | 중 | `findAllPaged` maxItems 500 silent truncation + `addTeam` 가드와의 off-by-one 미검증 | **§2 R1 → "팀 수 상한 / 커서 페이징" 문단 재작성**<br/>+ §3 계약 표 2행 + §9 P0 체크리스트 + §7 i18n | `MAX_TEAMS = 500` **단일 상수**를 `addTeam`과 `findAllPaged`가 공유. 경계값 표로 off-by-one 명시(가드는 `>= MAX_TEAMS` 거부 → 500개는 정상 / 500개 수집 시 `nextCursor` 없음 → `truncated:false`) → **"생성은 됐는데 트리에서 안 보이는" 구간 부재 증명**. R1 깊이 초과와 **동형 3요소** 적용: `console.error` + fail-close 계속 동작 + **응답 `truncated:true`** → 프론트 경고 배너(`hasCycle`과 동일 위치). `getTeamList`/`getTeamOptions` 계약에 `truncated` 추가, i18n `team.tree.truncatedWarning` 추가 |
| 5 | 중 | salary 조용한 드롭 — `success` 응답에 실제로는 미저장, 프론트가 `grantedBy`를 알 수 없음 | **§2 R3 → 신규 `R3-C` 소절**<br/>+ §3 계약 표 + §9 P1 프론트 3항목 + §7 i18n | **2중 대응.** (1) 서버: `updateUser` 응답을 `{success:true, content:{droppedFields:[]}}`로 확장, `RESOURCE` 경로는 항상 `[]`이라 무회귀. (2) 프론트: 팀장 경로(`isTeamLead() && !canWrite('USER_MANAGEMENT')`)면 **급여·권한·팀 입력란 자체를 미렌더**(1차 방어), 그럼에도 `droppedFields`가 오면 경고 토스트(안전망, 삼키지 않음). 원칙 명문화: **"프론트 숨김은 UX, 서버 allowlist는 보안 — 둘 중 하나만 하지 않는다."** i18n `team.error.fieldsDropped` 추가 |
| 6 | 경미 | "팀 상속" 선택 시 실효 권한 미리보기 부재 — TEAM_ONLY 경고와 비대칭 | **§2 R7 → "팀 상속 선택 시 실효 권한 미리보기" 문단 신설**<br/>+ §9 P1 프론트 1항목 + §7 i18n 3키 | 권한 Select가 "팀 상속"일 때 한 줄 미리보기: 상속 세트 있음(안내) / 팀은 있는데 세트 없음(경고) / 팀 미소속(경고) 3분기. **추가 resolver 0** — `getTeamList`의 `parentTeamKey`·`permissionKey`·`permissionName` + 대상의 `teamKey`로 프론트 계산, `buildTeamTree.js` 순수 함수 재사용. **규칙 이중 구현 위험**을 명시하고 백엔드 `nearestAncestorWith`와 동일 픽스처 대조 테스트를 P1에 지정. 차단은 안 함(TEAM_ONLY 배너와 동일 정책) |
| 7 | 경미 | `teamScopeAccountIds`엔 2000 캡, `memberProjectIds`엔 무상한 — 비대칭 근거 부재 | **§2 R3 → "성능 예산" 직후 "상한을 한쪽에만 건 이유" 문단 신설** | 의도된 비대칭임을 표로 근거화: `teamScopeAccountIds`는 **Jira 사이트 사용자 수에 좌우돼 외생적으로 무한**(대기업 본부 = 수천 명) → 명시적 캡 필요. `memberProjectIds`는 **`project` 테이블 행 수의 부분집합이라 내재적으로 유계**(Forge SQL 1GiB 제약 하 O(100~1000)) → **`project` 테이블 크기가 곧 캡**. 별도 상수를 두면 "프로젝트가 늘었을 뿐인데 권한이 fail-close로 죽는" 더 나쁜 실패 모드가 생김. 대신 **관측만 남김** — `> 1000`이면 `console.warn`(캡이 아니라 신호) |

### 반영 후 새로 생긴 구현 산출물 (backend/frontend 인계용)

| 산출물 | 위치 | 단계 | 출처 |
|---|---|---|---|
| `TeamLeadFieldPolicy.js` (신규 파일) | `src/permission/` | P1 | #1 |
| `findUserByAccountIdService` 마스킹 분기 | `src/resolver/backoffice/user/UserService.js` | P1 | #2 |
| `updateUser` `content.droppedFields` | 동상 | P1 | #5 |
| `findAllPaged` `{results, truncated}` + `MAX_TEAMS` 상수 | `src/nosql/query/CustomEntityManager.js` | P0 | #4 |
| `getTeamList`/`getTeamOptions` 응답 `truncated` | `src/resolver/backoffice/team/TeamService.js` | P0 | #4 |
| 팀장 경로 입력란 미렌더 + `droppedFields` 토스트 | `static/ui/src/backoffice/page/user/` 편집 모달 | P1 | #5 |
| "팀 상속" 실효 권한 미리보기 | 동상 | P1 | #6 |
| `truncated` 경고 배너 | `static/ui/src/backoffice/page/team/TeamTreePanel.jsx` | P0 | #4 |
| i18n 신규 5키 | `team.json`(2), `permission.json`(3) — kr/en 양쪽 | P0·P1 | #4·#5·#6 |
| 보안 테스트 2건 (allowlist 불변식 / read 마스킹) | `test/permission/` | P1 | #1·#2 |

---

## 13. 신규 요구 반영 (2026-07-27 2차) — N1~N4

기존 구조 결정(S1~S8, R1~R7)과 1차 리뷰 반영분(§R3-A/B/C, §12)은 **전부 그대로 유지**했다. 아래는 증분만이다.
**단계 배치**: P2 = 원안 + N1 / **P3-A 신설** = N3 / **P3-B 신설** = N2 / N4 = 추가 작업 없음.

| # | 요구 | 반영 섹션 | 결정 요약 |
|---|---|---|---|
| **N1** | 프로젝트 팀 배정에 **개별 인원 선택** 경로 추가 | **§3 P2 계약 표 → `N1. addTeamMembersToProject 입력 규약` 소절 신설**<br/>+ §4-4 에러 3종 + §4-6 PermissionMap 4키 + §9 P2 체크리스트 + §7 i18n 6키 | **`accountIds` 유무가 모드를 결정**하는 단일 resolver. 미지정→팀 전체(`includeDescendants` 적용) / 배열→개별(**`includeDescendants` 무시**) / **`[]`→거부**(체크 해제 상태의 실행이 전원 배정으로 폭발하는 것을 차단). 검증 집합은 **모드와 무관하게 항상 후손 포함**(개별 선택 UI가 하위 팀까지 펼쳐 보여주므로) — 팀 트리 **밖** 인원이 1명이라도 섞이면 **요청 전체 거부**(부분 성공 없음, §R3-C "조용한 실패 금지"와 동일 원칙). 500명 상한. **결과물은 `projectusers` 행 추가뿐**(S5 유지, 별도 저장 축 없음), `insertProjectusersService`를 어댑터 1줄로 재사용. 선택 목록용 **`getTeamMemberCandidates` 1종 신설** — `findTeamById`는 `USER_MANAGEMENT` grant라 PM에게 목록이 조용히 비어버리므로 프로젝트 축 grant로 별도 제공 |
| **N2** | 팀 구조 편집 **드래그앤드롭** | **§6-7 `N2. 팀 트리 드래그앤드롭` 신설**<br/>+ §9 **P3-B 신설** + §7 i18n 3키 | **라이브러리 실측 결과: 신규 의존성 0.** 이미 프로덕션에 **동일 구조의 트리 DnD 선례**(`TreeStructurePanel.jsx` + 순수함수 `resolveTreeDrop.js` + 20케이스 테스트, **라이브러리 없는 HTML5 native**)가 있어 `resolveTeamTreeDrop.js`로 복제한다. `@atlaskit/pragmatic-drag-and-drop@1.7.7`(+hitbox 1.1.0, drop-indicator 3.2.12)은 **transitive로 이미 설치돼 있으나** phantom dependency라 **형제 순서 재정렬이 필요해질 때만** 명시 승격. 드롭 불가 5규칙 + **hover 시점 판정으로 `dropEffect='none'`/`not-allowed` 시각 구분**(선례를 이 부분만 확장). 서버 `TEAM_CYCLE_DETECTED`/`TEAM_DEPTH_EXCEEDED`와 **이중 방어**, §R7 미리보기와 동일하게 **C1~C10 정규 케이스 표**로 프론트·백엔드 대조 테스트. **낙관적 업데이트 채택 + `onMutate` 스냅샷 롤백**(조직개편은 연속 이동이 사용 맥락이라 왕복 대기 불가). 모달 Select **유지**(생성 시 필수 + 접근성 대체 경로). **배치: P3-B로 분리 역제안** — P0의 배포 판정을 모달 Select만으로 충족하고 백엔드 의존이 0이라 언제 배포해도 무방(P0 여력 시 승격 가능) |
| **N3-1** | 분석리포트 그룹핑 축 (인별↔팀별) | **§3 P3 계약 표 + §6-8 `N3-1`** | **인력 리포트만 적용, 백엔드 변경 0.** 실측 결과 `ResourceAnalysisPage`는 행 축(`findProjectusersByProjectId`)과 지표 축(`getResourceAnalysisList`)이 이미 분리돼 accountId로 병합하므로, P2에서 행에 실린 `teamKey`만으로 충분하다 → **KVS 캐시 키 확장 불필요 + 팀 이동 즉시 반영**. 축 토글은 공용 `ViewModeToggle`(`MyWorklogPanel`의 flat⇄grouped 선례) 이식. **페이징 경계 문제**: 행이 10건 페이징이라 팀 모드에서 `pagesize:500` 전량 조회 + 페이지네이션 숨김. 가동률은 인원별 분모가 달라 **평균이 아니라 `ΣtotalMd/ΣeffectiveMmDays`로 재계산** |
| **N3-1(이슈)** | 이슈 리포트 팀 축 | **§6-8 `N3-1(이슈) — 범위에서 제외` 소절** | **제외 + 근거 명시.** (a) 이슈는 `assignee` 1명 + `coworkers[]` 다중이라 **팀 귀속이 정의 불가** — 배분하려면 공수 비율 가정이 필요하고 §R5에서 거부한 왜곡과 동종, (b) Jira **커서 페이징**이라 클라이언트 그룹핑 불가·서버 집계는 "P3 신규 resolver 0" 위반, (c) D3에서 이슈→팀 배정이 이미 명시적 비목표 |
| **N3-2** | 인력 탭 팀 그룹핑 + 소계 | **§6-8 `N3-2`** + §9 P3-A | **`TreeTable`(`@atlaskit/table-tree`) 재사용** — `CommonTable`/`CursorPagingTable`은 그룹 헤더·접기를 **지원하지 않고 리포 내 선례 0건**(수동 구현은 신규 발명이라 배제), `TreeTable`은 `items[].children`로 네이티브 접기를 제공하고 `MyIssueTable` 사용 선례가 있다. 팀=부모(소계)/인원=자식. **인건비 소계는 `canRead('PROJECT_COST')`일 때만** 노출(인력 탭은 `PROJECT` 권한으로 열리므로 무조건 노출 시 `PROJECT_COST` 분리가 무의미해짐). 기본은 평면 모드 유지(무회귀) |
| **N3-3** | 비용 탭 팀별 분해 | **§6-8 `N3-3`** + §3 P3 계약 + §8 영향도 | **계산 로직 신규 0.** `groupCostByKey(members, scheduleRate, 'teamKey')` — 기존 함수에 keyField만 바꿔 넣으면 `byRole`/`byLevel`과 **완전 동일 shape**의 `byTeam`이 나온다. 백엔드 3줄(`MEMBER_ROWS`에 `u.team_key` / `resolveMemberSalaries`에 `teamKey` / 서비스 1줄). **`getProjectCostSummary`는 `content` 래퍼가 없으므로 `byTeam`도 루트에 붙인다.** 프론트는 `CostByRoleLevel.jsx`를 **3-way로 확장(복제 금지)**. ⚠ **프론트에서 `byIssue[].byMember`를 롤업해 팀 비용을 만들면 안 된다** — worklog 기반(0비용 이슈·급여 null·무워크로그 멤버 제외)이라 top-down `Σsalary×scheduleRate`인 `byRole`/`byLevel`과 **총액이 어긋난다** |
| **N3-4** | 프로젝트 대시보드 팀 위젯 | **§6-8 `N3-4`** + §3 P3 계약 + §10 U8·U9 | **위젯 레지스트리가 없다** — 위젯은 `project_dashboard` **DB 행**이고, 추가는 `DATA_TYPES`에 `dataType` 하나 등록하는 일이다(**경로 A**). **경로 B(하드코딩 고정 위젯)는 배제** — `handleSaveLayout`이 `"summary"` 하나만 필터해서 신규 id가 `bulkUpdateLayoutsRepository`의 INSERT 경로를 타고, `project_id`를 `UUID_TO_BIN()` 없이 평문으로 넣어 statement가 실패하는데 **`catch`가 삼켜 "저장되었습니다" 토스트만 뜨는 무음 실패**가 실측됨. 지표는 **팀별 투입 공수(MD)** — 기존 `aggregateByUserService`(KVS 10분 캐시 내장, 현재 import만 되고 미사용) 재사용, 신규 페치 0. **새 `chartType`은 추가 안 함**(`CHART_OPTION_MAP` 미등록 시 에러 없이 백지 차트). **비용 축 배제** — `salary` dataType이 `DASHBOARD` read만으로 열리는 기존 권한 구멍(U7)을 확대 재생산하지 않기 위함 |
| **N3 공통** | 팀 이동 시 과거 공수 귀속 | **§6-8 `N3 공통` 소절** | **"현재 소속 기준 집계"를 규칙으로 선언**하고 **4개 화면 전부에 InfoTip**(`team.analysis.currentMembershipNote`). `users.team_key`는 현재 값만 보관하고 이력 추적은 §5 비목표이므로, 이전 팀에서 쌓은 공수도 새 팀에 합산된다 — 결함이 아니라 **선언된 한계**이며 §R5의 "완성률을 팀으로 분해하지 않음" InfoTip과 같은 원칙 |
| **N4** | 전사 분석 유지 | — (§R5 P2 그대로) | **추가 작업 없음.** 지표 정의 일관성 확인 결과: `PortfolioTeamDist`(전사)는 **프로젝트 스냅샷 + `memberTeamMap` read-time 조인**, N3(프로젝트별)은 **해당 프로젝트의 `projectusers`/워크로그**. 스코프가 달라 값이 다른 것이 정상이며, 둘 다 **팀 귀속 기준은 `users.team_key` 현재 값으로 동일**하다. 혼동 방지를 위해 §6-8 서두에 "전사 `PortfolioTeamDist`와 다른 화면"을 명시 |

### 2차 요구로 새로 생긴 산출물

| 산출물 | 위치 | 단계 | 출처 |
|---|---|---|---|
| `getTeamMemberCandidates` resolver | `src/resolver/projectTeam/` | P2 | N1 |
| `addTeamMembersToProject` 2모드 + 에러 3종 | 동상 + `ErrorCodes.js` | P2 | N1 |
| 팀원 개별 선택 모달 | `pages/projectDetail/user/` | P2 | N1 |
| `resolveTeamTreeDrop.js` 순수 함수 + 테스트(C1~C10) | `backoffice/page/team/` | P3-B | N2 |
| `TeamTreePanel` native DnD + 4시각신호 + 낙관적 롤백 | 동상 | P3-B | N2 |
| `utils/team/aggregateByTeam.js` 순수 함수 + 테스트 | `static/ui/src/utils/team/` | P3-A | N3-1·2 |
| `byTeam` (`groupCostByKey` 재사용) | `ProjectCostService.js` | P3-A | N3-3 |
| `getTeamChartData` (`aggregateByUserService` 재사용) | `ProjectDashboardService.js` | P3-A | N3-4 |
| `DATA_TYPES`에 `team` | `constants/dashboardTypes.js` | P3-A | N3-4 |
| i18n 신규 17키 | `team.json`(14), `cost.json`(1), `chartOptions.json`(2) | P2·P3 | N1·N2·N3 |

### 리더 보고 — 본 설계 범위 밖의 기존 결함 3건 (§10 U7~U9)

조사 중 발견했다. 팀 도입과 무관하며 본 설계는 **셋 다 건드리지 않고 우회**했다. 별도 과제로 판단 요청.

| # | 결함 | 영향 |
|---|------|------|
| U7 | 대시보드 `salary` dataType이 `PROJECT_COST`가 아닌 **`DASHBOARD` read만으로 급여 분포를 노출** | 재무 민감정보 노출. `PROJECT_COST` 키 분리가 이 경로에서 무력화됨 |
| U8 | `bulkUpdateLayoutsRepository` — 신규 `dashboard_id` INSERT 시 `project_id`가 평문으로 BINARY(16)에 들어가 statement 실패, `catch`가 삼켜 **"저장되었습니다"만 뜨는 무음 실패** | 대시보드 배치 저장이 조용히 유실될 수 있음 |
| U9 | `getChartDataService`가 스코프에 없는 `startDate/endDate` 참조 → 호출 시 ReferenceError | 현재 프론트가 호출하지 않아 미발현. 이 경로를 쓰는 순간 터짐 |
| U10 | `findProjectusersByProjectId`가 `projectusers.salary`(투입급여)를 **게이트 없이** 반환. Member는 `PROJECT read=true` | **일반 사용자가 프로젝트 인력 탭에서 동료 투입급여를 본다.** `PROJECT_COST` 분리가 이 경로에서 무력화됨 |
| U11 | `UserRepository.deleteByAccountId`가 `projectusers` 자식 행을 남긴다 | 고아 행 누적 |
| **U12** | **`getPortfolioDashboard`(`R('REPORT','list')`)가 `projects[].members[].salary`(개인 유효급여)와 `projects[].totalSalary`를 게이트 없이 반환.** 시드 Member는 `REPORT: {read:true}` | **U7과 같은 계열의 구멍이 포트폴리오 경로에 그대로 남아 있다.** U7 수정이 프로젝트 대시보드만 덮었다. **N6 인건비 축과 분리 불가능** → P2에서 함께 닫는다(위 체크리스트) |
| **U13** | 워크로그 다일 이벤트 계산(`ProjectCalender.jsx:140-145`, `WorklogPage.jsx:168`에 **복제**)이 `new Date('yyyy-mm-dd')`(UTC 파싱)+`setDate`+`toISOString()`을 쓴다 — `TimeUtils.addDaysToDateString:63`의 `'T00:00:00'` 로컬 파싱 규약과 불일치 | **✅ 사실 확인. 값이 틀어지는 시나리오까지 구성됨(3차 검토)**: **DST 시간대 뷰어**(예: `America/New_York`)가 **봄 전환을 가로지르는** 다일 이벤트를 볼 때 — `2027-03-10` 시작 5일 → UTC 파싱 후 로컬 3-09 19:00 EST → `setDate(+5)` → 3-14 19:00 EDT = UTC 3-14 23:00 → `toISOString` → **3-14**(기대 3-15, **1일 축소**). **KST는 DST가 없어 오프셋이 왕복 상쇄되므로 미발현** — 그래서 지금까지 안 잡혔다. 별도로 `days = Math.round(sec/(hourRate·3600))`은 시간대 무관 왜곡(`1d 4h`=12h 로그가 **2일 이벤트**로 렌더, `hourRate` 변경 시 과거 로그 전체가 어긋남). N5는 이 블록에 닿지 않는다(필터는 앞 단계) → **별도 과제** |
| **U14** | `tabs.js:55` `projectDetailTabs(t, project_id, toast, ...)`에 **`context` 인자 자체가 없고** `:130`이 `<ProjectCalender project_id toast/>`만 렌더 | **✅ 사실. 단 "크래시"는 과장이었다(3차 검토 정정)** — `getMyScheduleList`의 `enabled: !!context?.accountId`(`ProjectCalender.jsx:79`)가 **항상 false**인 것은 맞다. 드래그는 **크래시가 아니라 `onEventDrop`의 try/catch(`:193-214`)가 `context.timezone` TypeError를 삼키고 `revert()`** — **조용한 항상 실패**다(§R3-C가 금지한 유형). **추가 결함**: `context`를 넣어도 `:202` `event.extendedProps.started`는 **존재하지 않는 필드**(`extendedProps`는 `{issue, worklog}`)라 시간 재계산이 별도로 깨져 있다 → **U14 수정 시 함께 볼 것** |
| **U15** | 캘린더 탭이 `projectKeys` 팩토리를 쓰지 않고 인라인 문자열 키 **5종** 사용(`'coworkerFieldId'`·`'getProjectWorklog'`·`'getSettingData'`·`'getMyScheduleList'`·`'getAllProjectWorkersSchedule'`). invalidate 2곳(`:207-209`,`:235-237`)이 키를 **하드코딩 중복** | ✅ 사실 확인. 리포 규약("새 쿼리키는 반드시 팩토리") 위반. **N5는 쿼리키를 건드리지 않으므로 범위 밖** — 정리 기회로만 기록 |
| **U16** | `PortfolioSalaryByProject`·`PortfolioSalaryHistogram`이 **어디서도 import되지 않는 고아 위젯**(외부 참조 0건, 실측) | 급여를 렌더하는 코드가 죽은 채 남아 있다. **U12 게이팅 대상이 아니다**(죽은 코드를 게이팅하면 커버리지 착각만 생긴다). 되살아나면 게이트 없이 급여가 노출되므로 **삭제 권고** — 별도 정리 과제 |

---

## 14. 외부 검토 반영 (2026-07-27 3차) — Blocker 3 / High 5 / Medium 8 / Low 3

검토서: `_workspace/team-management/04_fable_review.md` (수정하지 않음 — 검토 기록 보존).
**구조 결정(S1~S8, R1~R7)과 1·2차 반영분(§12·§13)은 그대로 유지**했다. Blocker 3건은 **직접 코드로 재실측해 전부 사실임을 확인**했다.

### Blocker — 전부 반영

| # | 지적 | 판정 | 반영 섹션 | 반영 내용 |
|---|---|---|---|---|
| **C1** | allowlist 드롭이 "차단"이 아니라 **NULL 쓰기**가 된다 | **✅ 사실 (재실측)** — `UserQuery.js:29` `UPDATE_USER`가 `permission_key`를 **무조건 SET**, `UserService.js:343` `permissionKey === undefined ? null`. **P0에서 먼저 터진다**(`teamKey` 수용) | **§4-9 신설**<br/>+ §R3-A 말미 + §8 영향도 + §9 **P0 최상단** | **불변식 명문화: "payload에 없는 필드는 변경되지 않는다."** `undefined`(보존) ≠ `null`(해제) 구분. **채택안 = 서비스 read-merge** — 동적 SQL(대안 A)은 조립기 신설이 필요하고, `CASE ? WHEN ''`(대안 B, `ProjectUsersQuery` 선례)은 빈 문자열 센티넬이라 **"명시적 null로 해제"를 표현 못 해** 팀 상속 전환(R2)이 죽는다. read-merge는 SQL 무변경·기존 호출부 무회귀. **테스트를 정책 함수에서 서비스 경계(repository mock 인자)로 이동** |
| **C2** | `normalizeScope`가 흩어져 TEAM_ONLY가 조용히 ALL로 격하 | **✅ 사실 (재실측) — 검토서는 3곳이라 했으나 실제는 4곳**: `PrincipalResolver:32`, `PermissionService:13`, `SeedData:54`, `SeedData:93` | **§4-8 신설**<br/>+ §8 영향도 + §9 P1 + §D 카테고리 C | `src/permission/ProjectScope.js` 단일화, **4곳 전부 등재**. `PROJECT_SCOPES` 배열 + `includes` 방식으로 전환(신규 스코프 추가 시 자동 지원). **계약 테스트 2건** — ① 모든 스코프가 왕복 보존 ② `src/` 전역 리터럴 삼항 0건 정적 검사(재복제 방지). **§9 P1 배포 완결 조건에 명시** |
| **C3** | `whereIn([])`이 조건을 버려 스코프가 fail-**open** | **✅ 사실 (재실측)** `QueryBuilder.js:45`. §R6의 "fail-close 준수"가 **정반대** | **§4-2 "빈 집합 가드" 신설**<br/>+ §R6 표 정정 + §9 P0 | **Repository 진입부 가드**(호출부 의존 금지). **`QueryBuilder`는 고치지 않는다** — "빈값=조건 무시"는 `findUsersPagedRepository` 등 다수 호출부가 **선택적 필터로 의존**하는 동작이라 고치면 검색 전반이 회귀한다. 위험한 건 QueryBuilder가 아니라 **스코프 축소용으로 쓰며 빈 집합을 넘기는 것**. **신규 쿼리 5종 전수 점검표** 작성. 테스트는 **SQL 미발행(mock 호출 0회)까지 단언** |

> **검토서가 "확인 필요"로 남긴 C3-3을 실측 완료**: `generateInClause(0)`은 `"()"`를 만들어 `IN ()` → **SQL 문법 오류(시끄러운 실패)**다. `whereIn([])`의 fail-open과 **실패 방향이 반대**이므로 두 경로를 같은 규칙으로 뭉뚱그리지 않도록 표에 분리 기재했다.

### High — 4건 반영, 1건 부분반영(비목표 선언)

| # | 지적 | 판정 | 반영 |
|---|---|---|---|
| **H1** | 팀장 write 5키 중 **실제 동작 1개** (선행 read 전부 차단) | **✅ 사실 (재실측)** `PermissionMap.js:228,50,58` + `ResourceCatalog.js:54,60`에서 Member가 `RESOURCE/USER/ROLE/LEVEL_MANAGEMENT` 전부 `read:false` 확인 | **§R3 재설계.** **진입점을 `/my-page` "내 팀" 섹션으로 확정** — `/backoffice/team`(TEAM_MANAGEMENT 게이트)·`/resource`(RESOURCE_MANAGEMENT 게이트)는 열면 백오피스/전사 경계가 무너진다. `/my-page`는 **권한 게이트가 없는 개인 화면**이라 팀장이 반드시 도달한다. **선행 read를 동반 부여**(`getUserSkills`, `findTeamById`). §8 특별주의 **4번 규칙**으로 승격 + "부분 개방이 전면 차단보다 위험"(스킬 전멸 시나리오) 명시 |
| **H2** | `insertProjectusers` targets 키 불일치 → 항상 거부 | **✅ 사실 (재실측)** `ProjectUsersService.js:30`이 `{project_id, jiraUser}`, 호출부 2곳 모두 `jiraUser:[{value}]` | **`insertProjectusers`를 팀장 축에서 제거.** `['jiraUser']`로 고쳐도 원소가 **객체**라 `has()`가 false이고, 추출기 도입은 H3 위험을 키운다. → **N1의 `addTeamMembersToProject`로 대체**(payload가 문자열 배열, 진입점도 명확). §8 특별주의 **6번 규칙** 추가 |
| **H3** | allowlist 미등록 resolver는 전부 통과 = 블랙리스트와 같은 실패 모드 | **✅ 사실.** 내가 컬럼 축만 막고 resolver 축을 놓쳤다 | **§R3-A 코드 초안 수정** — `?? []`로 **미등록 = 전부 드롭**. 제약 불필요한 것들도 **명시 등재**(등재를 잊으면 동작하지 않는 시끄러운 실패). **계약 테스트**: `teamLead` 보유 키 ⊆ allowlist |
| **H4** | D2-① "내 팀원만 조회"가 미구현·미선언 | **✅ 사실** | **§R6에 비목표 명시 선언 (부분반영, 옵션 (a) 채택).** 근거: ① 인원 축엔 `scopedProjectIds` 같은 단일 병목이 없어 5개 서비스에 **행 필터**가 필요 → §8의 "필드 추가만" 무회귀 논증이 깨진다 ② 노출 화면이 전부 `RESOURCE/USER_MANAGEMENT` read를 요구하는데 **시드 Member는 둘 다 false**라 grant로 실질 통제된다 ③ 남는 경로(프로젝트 인력 탭)는 프로젝트 스코프로 이미 좁혀진다. **운영 규칙 + 권한 페이지 경고 배너**(`peopleWarning`)로 보완. 필요 시 P4로 분리 |
| **H5** | 팀 삭제/재부모화의 **조용한 전권 상실** | **✅ 사실.** §R6·§R7엔 경고를 설계하고 삭제에만 빠뜨린 비대칭 | **§4-3에 조항 추가.** 삭제 확인 모달 앞 영향 미리보기(**추가 resolver 0** — §R7과 같은 데이터·같은 `nearestAncestorWith` 재사용), `deleteTeam` 응답에 **`permissionLostCount`·`inheritanceChangedCount`**(§3 계약 표 갱신) |

### Medium — 7건 반영, 1건 미반영(대상 없음)

| # | 지적 | 반영 |
|---|---|---|
| **M1** | 쓰기 검증이 stale 캐시 기반 → **한 사람이 빠르게 두 번 옮기면 사이클 기록** | ✅ **§R1에 "쓰기 경로는 캐시를 쓰지 않는다" 규칙 신설.** `addTeam`/`updateTeam`/`deleteTeam`/`addTeamMembersToProject`는 `buildTeamIndex(await findAllPaged())` 즉시 로드. 팀 쓰기는 빈도가 극히 낮아 비용 무시 가능. **읽기 90초 stale은 그대로 수용** |
| **M2** | "팀 평균 가동률" 산식이 화면마다 다름 (내가 한 곳에선 "평균은 틀렸다"고 선언하고 다른 곳에선 평균을 지시) | ✅ **§6-8에 통일 규칙.** `aggregateByTeam.avgFields`를 **`{field, numerator, denominator}` 가중 전용**으로 정의하고 **단순평균 옵션을 API에서 제거**(두면 언젠가 쓰인다). 배치 rollup에 분모가 없어 가중 불가한 화면은 **라벨을 분리**(`팀 가동률` vs `팀 인원 평균 가동률`) + 각각 InfoTip에 산식 명시. 같은 이름으로 다른 값을 주는 것만 금지<br/>⚠ **[§16에서 폐기]** "분모가 없다"는 전제가 실측으로 반증됐다(`availMd`가 배치에 이미 존재) → **라벨 분리 폐기, 단일 이름 `팀 가동률` = 가중 `Σ/Σ`**. 정본은 **§3 결정 D** |
| **M3** | "팀 미지정" 필터가 조용히 전체 반환 (`whereEq(col, null)`) | ✅ **§3에 팀 필터 3상태 도메인 명시** — `undefined`(전체) / `'<key>'` / **`'__NONE__'` 센티넬**. `whereRaw('team_key IS NULL')`로 처리(`whereRaw`는 `QueryBuilder:58`에 **이미 존재** → 신규 메서드 불필요). **`null` 전송 금지**를 프론트 체크리스트에도 등재 |
| **M4** | 마스킹 실효성 — 재무 정보가 인접 경로로 이미 열려 있음 | ✅ **§10 U10으로 기존 결함 기록** + **N3-2 게이팅의 한계를 각주로 명시**("소계는 가리는데 원자료는 보이는 비대칭이 남는다"). 근본 수정은 회귀면이 P3-A를 넘어 별도 과제 |
| **M5** | N1 전체 거부가 **정상 흐름에서 오탐**하고 진단 정보 없음 | ✅ **§3 N1 규약에 3항 추가** — ① 검증을 **캐시 우회 즉시 로드**(M1과 같은 처방) ② **`error.cause`에 위반 accountId 배열** → 프론트가 해당 행 하이라이트 ③ **문구를 위변조 뉘앙스에서 정상 오탐 뉘앙스로 교체**. **전체 거부 정책 자체는 유지**(부분 성공이 더 나쁘다 — 검토자도 동의) |
| **M6** | C1~C10 케이스표가 **상수 드리프트를 못 잡는다** | ✅ **`getTeamList` 응답에 `content.limits:{maxDepth, maxTeams}`** — 프론트는 이 값만 쓰고 리터럴 상수를 두지 않아 **이중화 자체가 사라진다**. **P0에 넣어** P3-B의 "백엔드 변경 0"을 유지. 추가로 **§R7 상속 미리보기용 정규 케이스표 P1~P8 신설**(C1~C10은 DnD 전용이었다) — 특히 **P2(가까운 조상이 루트를 이긴다)·P7(손상 부모키 → null + error)**가 없으면 잘못 구현해도 테스트가 통과한다 |
| **M7** | 계약 테스트가 `teamLead` 축을 검증 못 함 + 등록 목록 이중 관리 | ✅ **부분 정정 후 반영.** 검토서의 "§4-5 문장이 부정확하다"는 **부분적으로만 맞다** — §4-6이 `PermissionMap` 등재를 의무화하므로 "매핑은 넣고 테스트 목록을 빠뜨림" 경로에서는 실제로 (2)가 실패한다. **다만 "둘 다 빠뜨림" 사각지대는 실재**하고, 더 근본적으로 **같은 목록이 두 파일에 복제**돼 있다(§D 카테고리 C). → **`src/index.js`가 `CONTROLLER_REGISTRARS` 배열 export, 테스트가 import**. P0에 포함. `teamLead.targets`의 정적 검증 불가는 한계로 명시 |
| **M8** | read 마스킹에 가시성 신호(`masked:[]`) 없음 | ⚠️ **미반영 — 대상이 사라졌다.** H1/H2 대응으로 `findUserByAccountId`가 **팀장 축에서 제거**되어 마스킹 호출 지점이 0이 됐다. 현재 팀장 축 read 2종(`findTeamById`, `getUserSkills`)의 응답에는 재무·권한 필드가 없다. **§R3-B를 일반 규칙으로 승격해 보존**하고, 향후 마스킹이 실제 도입되면 `droppedFields`와 대칭으로 `masked:[]`를 함께 넣도록 명시했다 |

### Low — 3건 반영

| # | 지적 | 반영 |
|---|---|---|
| **L1** | `getTeamMemberCandidates`가 `teamKey`를 검증하지 않아 임의 팀 명단 조회 가능 | ✅ **§3에 검증 규칙 추가** — `teamKey`가 ① 그 프로젝트의 `project_team` 배정 팀(또는 후손)이거나 ② 요청자가 `TEAM_MANAGEMENT` read 보유. 아니면 `TEAM_NOT_IN_PROJECT_SCOPE`. "팀 **이름**은 비민감"이라는 §4-6 논리를 **인원 명단까지 확장하지 않는다**고 명시 |
| **L2** | `roleLevelMap`에 무캐시 `findAllPaged`를 넣으면 목록 조회마다 KVS 커서 루프 | ✅ **§4-1 재사용 표에 명시** — 팀 이름 맵은 **`TeamTreeCache.getTeamIndex()`(60초) 재사용**. 쓰기 경로만 캐시 우회(M1과 정합) |
| **L3** | P1 체크리스트에 P2 테이블 참조 항목이 남아 있음 | ✅ **P1 항목에서 제거하고 P2로 이동.** P1 과도기 규칙(`projectusers` 경로만 = fail-close 방향)을 명시적 항목으로 승격 |

### 검토서에 대한 반론 / 정정

무비판 수용을 피하기 위해 다음 3건은 **검토서 서술을 정정**했다.

| 대상 | 검토서 서술 | 정정 |
|---|---|---|
| C2 | "**3곳**에 중복 구현" | 실측 결과 **4곳**이다 — `SeedData.js:54`(Member 시드)를 표에서 각주로만 다뤘으나, 이는 독립된 리터럴 삼항이고 Member 세트의 TEAM_ONLY를 격하시키므로 **동등한 수정 대상**이다. §4-8 표에 4행으로 등재 |
| C3-3 | `generateInClause(0)` 경로는 "**확인 필요**" | 실측 완료 — `"()"`를 만들어 `IN ()` **SQL 문법 오류**다. `whereIn([])`의 fail-open과 **실패 방향이 반대**이므로 같은 규칙으로 묶지 않고 표에 분리 기재 |
| M7 | §4-5의 "테스트가 깨진다"는 서술이 "**부정확하다**" | **부분적으로만 맞다.** `PermissionMap` 등재가 의무이므로 "매핑만 넣고 테스트 목록 누락" 경로에서는 (2) 고아 매핑 테스트가 **실제로 실패한다**. 검토서가 지적한 것은 "**둘 다** 누락" 사각지대이며 그것은 사실이다. 두 경로를 구분해 기술하고, 구조적 해소(배열 export)를 채택 |

### 3차 검토로 새로 생긴 산출물

| 산출물 | 위치 | 단계 | 출처 |
|---|---|---|---|
| `updateUserService` read-merge + 서비스 경계 테스트 | `src/resolver/backoffice/user/UserService.js` | **P0** | C1 |
| Repository 빈 집합 가드 5종 + SQL 미발행 테스트 | `src/resolver/backoffice/team/TeamRepository.js` 등 | **P0** | C3 |
| `CONTROLLER_REGISTRARS` 배열 export | `src/index.js` + 계약 테스트 | **P0** | M7 |
| `getTeamList.content.limits` | `TeamService.js` | **P0** | M6 |
| `deleteTeam` `permissionLostCount`/`inheritanceChangedCount` + 삭제 미리보기 | `TeamService.js` + 프론트 | **P0** | H5 |
| `nearestAncestorWith` 정규 케이스표 P1~P8 | 프론트·백엔드 테스트 | P0/P1 | M6 |
| `src/permission/ProjectScope.js` + 4곳 import + 계약 테스트 2건 | `src/permission/` | **P1** | C2 |
| `principal.leadingScopeTeamKeys` | `PrincipalResolver.js` | P1 | H1 |
| `/my-page` "내 팀" 섹션 (팀장 축 유일 진입점) | `static/ui/src/pages/myPage/` | P1 | H1 |
| `TeamLeadFieldPolicy` 미등록=전부드롭 + 5키 명시등재 + 계약 테스트 | `src/permission/` | P1 | H3 |
| 팀 필터 `'__NONE__'` 센티넬 + `whereRaw` 분기 | `UserRepository.js` + 프론트 Select | P0/P1 | M3 |
| `aggregateByTeam.avgFields` 가중 전용 + 지표 라벨 분리 | `utils/team/` + InfoTip | P3-A | M2 |
| i18n 추가 10키 | `team.json`(9), `permission.json`(1) | P0~P3 | H4·H5·M2·M5·L1 |

### 착수 전 처리 순서 (검토서 §6 권고 수용)

1. **C1 · C3 · M7 · M6 · H5 → P0 착수 전.** C1은 `teamKey` 수용과 같은 커밋에 있어야 하고, C3는 §R6의 안전 주장이 성립하기 위한 전제다.
2. **C2 → P1 착수 전.** 미완료 시 TEAM_ONLY가 fail-open.
3. **H4 → 지금 확정됨**(비목표 선언). 단계 산정이 흔들리지 않는다.
4. **H1 · H2 · H3 → P1/P2 착수 전.** `/my-page` "내 팀" 섹션을 P1에 넣지 않으면 팀장 축은 서버 판정축만 남는다.
5. **M1 · M5 → "팀 쓰기 경로는 캐시를 우회한다" 한 줄 규칙으로 둘 다 해결됨.**
6. **M2 · M3 · M4 · M8 · L1~L3 → 계약·i18n·문서 수준. 반영 완료.**

---

## 15. P2 증분 설계 (2026-07-28) — N5 · N6 *(N7은 §16, 외부 검토 반영은 §17)*

> **P0+P1은 구현·검증·배포 완료.** 이 절은 **P2 착수 전 증분**이며 전면 재설계가 아니다.
> 사용자 요구 4건 중 2건(인력관리 팀별 필터·추가 / 분석리포트 팀 인사이트)은 **P2·P3-A에 이미 설계돼 있어 그대로 간다.** 신규는 N5·N6 2건이다.
> **범위: P2 전체 + N5 + N6 + N7.** P3와 조직 현황 탭(`/resource`)은 이번 범위가 아니다.
> (이 절은 N5·N6 시점에 작성돼 머리말이 "신규 2건"으로 남아 있었다. **N7은 §16에서 추가**됐고 P2-b의 절반이다 — 3차 검토 M-2 정정.)

### 반영 위치

| # | 요구 | 반영 섹션 | 결정 요약 |
|---|---|---|---|
| **N5** | 프로젝트 캘린더 팀별 필터 | **§3 P2 절 → `N5.` 소절 신설**<br/>+ §9 P2 체크리스트(백엔드 1·프론트 6) + §7 i18n 1키 + §10 U13~U15 | **백엔드 1건뿐** — `getProjectCalendarWorklog` 루트에 `memberTeamMap`·`teamMeta` 추가. 캘린더는 **데이터 소스가 2개**(워크로그 + 일정)인데 **맵 하나로 둘 다 덮는다**(일정 resolver는 `mySchedule` 도메인이라 손대면 마이페이지까지 오염 + §8-3 C 재발). `PermissionMap`·`getTeamOptions`·`getAllProjectWorkersSchedule` **전부 무변경**(`getTeamOptions` grant OR에 `PROJECT read`가 이미 있음). **쿼리키에 팀을 넣지 않는다**(Jira JQL 재조회 = 성능 퇴행). 하위 팀 포함 토글은 **넣지 않고 항상 포함**(§11 가정 5 + 단일 프로젝트 인력 O(10) + 툴바 과밀) |
| **N5 안전** | allDay `end` exclusive 사고 방지 | 동상 | 팀 필터는 **행 필터링 단계**에만 들어가고 `+1일 보정`(`useProjectWorkersSchedule.js:61`)은 **이벤트 조립 단계**라 접점이 없다. 기존 `selectedAccountIds` 필터가 이미 그 자리(`:40-42`)에 있다. **🔴 절대 금지 조항 명시** — 그룹 키(`start__end__type`)에 `teamKey`를 넣으면 `first`가 바뀌어 `end`가 달라진다(정확히 "연차 -6MD" 계열). 회귀 가드: **필터 전후 `start`/`end` 바이트 동일** 단언 |
| **N6** | 통합 대시보드 팀별 비교 (4지표 전부) | **§3 P2 절 → `N6.` 소절 신설**<br/>+ §9 P2 체크리스트(백엔드 5·프론트 9) + §8-3 C4·B2 + §7 i18n 12키 + §10 U12 | 응답이 **`content` 무래퍼 루트 직접**임을 실측 확인(`getProjectCostSummary`와 같은 함정) → 신규 필드는 **루트에**, 그리고 **`emptyShape()`에도 반드시 추가**(루트 필드 집합이 정상 경로와 1:1). 집계는 **완전 클라이언트**(서버 payload 없음)이므로 서버는 축 데이터만 주고 `portfolioAggregate.js`에 순수함수 1개 추가. 4지표 전부 **기존 정의 재사용, 신규 지표 0** |
| **N6 리스크** | 인건비 축 게이팅 | 동상 + §10 **U12 신규** | **실측: 게이트가 전혀 없다.** `getPortfolioDashboard: R('REPORT','list')`이고 시드 Member는 `REPORT read=true` → **개인 유효급여(`members[].salary`)와 `totalSalary`가 이미 전 사용자에게 나가는 중.** U7 수정이 프로젝트 대시보드만 덮었다. **⚠ 핵심 판단: N6 인건비 축과 U12는 분리 불가능한 한 단위다** — 원본 `salary`가 같은 payload에 남아 있으면 프론트가 그대로 팀별 인건비를 계산할 수 있어 파생 축 게이팅이 **무의미**하다. → `canReadCost` false 시 **키 삭제**(`null` 아님 — `null`은 `Σ`에서 `0`이 되어 "비용 0원"이라는 거짓 숫자를 만든다) + 루트 `costMasked:true`. `canReadCost`는 `src/permission/CostAccess.js`로 **승격**(N6가 3번째 복사본을 만들 뻔했다 → §8-3 C4) |
| **N6 관계** | 팀 멀티셀렉트(기존 P2) ↔ 비교 위젯 | **§N6 "상호작용 (확정)" 표** — 두 항목을 §3에서 **한 덩어리로 기술** | **하나의 선택으로 둘 다 한다: (a) 프로젝트 스코프 축소 + (b) 비교 대상 지정.** 안전한 이유: 팀 구성원은 자기가 속한 프로젝트에서만 공수를 만들므로 "선택 팀이 1명이라도 있는 프로젝트"로 좁혀도 **선택 팀의 합계는 무손실**이다. 프로젝트 멀티셀렉트와는 AND |
| **N6 기본값** | 미선택 시 표시 | 동상 | **상위 10팀 + `기타(N개 팀)` 묶음 + `팀 미지정` 마지막 행.** 빈 상태는 발견성이 낮고 최대 500팀 나열은 무의미하다. **`기타` 묶음을 두는 이유는 합계 보존** — 잘라내기만 하면 "팀 소계 합 ≠ 전체"가 되어 §R6의 "팀 미지정을 숨기면 합계가 안 맞는다"와 같은 결함이 된다. 정렬은 **현재 지표 축 desc**, 인건비가 `costMasked`면 공수(MD) 폴백 |
| **N6 스코프** | TEAM_ONLY 사용자의 선택지 | 동상 | **선택지를 응답 `teamMeta`에서 파생한다.** `getTeamOptions`(전체 팀)를 쓰면 **"보이지 않는 팀을 고를 수 있는"** 상태가 되어 이번 회차에 반복된 "모른다를 없다로 말하지 마라"를 위반한다. 서버가 이미 `scopedProjectIds`로 응답을 좁혔으므로 데이터 파생이 스코프와 자동 일치하고 **서버 변경 0**. 스코프 프로젝트에 섞인 타 팀이 옵션에 보이는 것은 **H4에서 "TEAM_ONLY는 인원 축을 좁히지 않는다"로 이미 선언**한 동작과 정합 |
| **N4(재확인)** | 전사 분석 지표 일관성 | §6-8 · §N6 · **§3(정본)** | `PortfolioTeamComparison`(나란히 비교)과 `PortfolioTeamDist`(구성비)는 **별개 위젯**. ⚠ **이 행의 원 서술("인당 분모가 없어 가중 불가 → 라벨 분리")은 §16에서 폐기됐다** — 분모 `availMd`가 배치에 이미 있음이 실측 확인되어 **단일 이름 `팀 가동률` = 가중 `Σ investedMd / Σ availMd`**를 쓴다(§3 결정 D). 3차 검토 M-2 정정 |

### 이번 증분에서 새로 발견한 기존 결함 4건 (§10 U12~U15)

| # | 결함 | 본 설계와의 관계 |
|---|---|---|
| **U12** | 포트폴리오 응답의 개인 급여 무게이트 노출 | **P2에서 함께 닫는다**(N6와 분리 불가) |
| U13 | 워크로그 다일 이벤트 계산의 UTC/로컬 파싱 불일치(2곳 복제, `hourRate`+`Math.round` 포함) | **"-6MD" 계열과 가장 인접.** N5는 닿지 않음 → 별도 과제 |
| U14 | `tabs.js`가 `ProjectCalender`에 `context` 미전달 → `getMyScheduleList` 항상 disabled, 드래그 이동 크래시 | N5와 무관, 같은 파일 |
| U15 | 캘린더가 `projectKeys` 팩토리 미사용(인라인 키 5종 + invalidate 하드코딩 2곳) | N5는 쿼리키를 안 건드림 → 정리 기회로만 기록 |

### 설계 원칙 재적용 (이번 회차에 틀렸던 것들)

이번 증분은 앞선 회차에서 **내가 틀렸던 4가지**를 규칙으로 되먹여 작성했다.

| 과거 오류 | 이번 적용 |
|---|---|
| **U3** — "KVS 빈 값은 `''`로 저장" (정반대였다) | `memberTeamMap`에 **팀 미소속자 키를 넣지 않는다**(`null` 값 금지). **없음은 빈 값이 아니라 부재로 표현**한다 |
| **§R3 자기모순** — 같은 절에서 규칙과 예시 코드가 어긋남 | `costMasked` 처리에서 **`null` 할당이 아니라 키 삭제**를 택한 이유를 §R3-B의 "키 삭제 금지"와 **명시적으로 대조**해 적었다(반대 이유로 반대 결론임을 밝힘) |
| **"유일하게 동작한다"가 사실이 아니었다** | 캘린더·포트폴리오의 **응답 래퍼·필터 아키텍처·권한 매핑·+1일 보정 위치를 전부 파일·라인 단위로 실측**한 뒤 썼다. `getTeamOptions` grant에 `PROJECT read`가 **이미 있다**는 것도 확인 후 "PermissionMap 0줄"이라고 적었다 |
| **§4-9 "기존 호출부 무회귀"가 절반만 맞았다** | `TeamSelect`에 `isMulti`를 추가하면서 **"`isMulti` 미지정 시 현행 100% 동일"을 테스트로 고정**하는 항목을 체크리스트에 넣었다(N5가 단일을 쓰므로 여기서 깨지면 캘린더가 죽는다) |

---

## 16. N7 추가 + 지표 단일 정의 확정 (2026-07-28)

> 요구: **"팀장이라면 내 팀원들 + 내 하위 그룹 인원들이 어떻게 일하고 있는지에 대한 분석."**
> 범위: **P2 + N5 + N6 + N7.** 설계는 넷을 함께 했고(지표 정의를 한 번에 확정해야 하므로) **구현은 3단계로 나눈다**(§9 P2 서두).

### 반영 위치

| # | 항목 | 반영 섹션 | 결정 요약 |
|---|---|---|---|
| **N7-1** | 신규 resolver vs 기존 축 추가 | **§3 → `N7.` 소절 신설** + §9 P2 체크리스트 + §7 i18n 12키 | **신규 `getMyTeamWorkAnalysis` 1개.** `getResourceOverview`·`getResourceLoadSummary`는 **payload에 인자가 없어** `teamLead` 축을 붙이면 "팀장이면 무조건 통과" = **전사 인원 노출(E2)** 이 된다. 신규 resolver는 인원 축이 `principal.leadingScopeAccountIds`로 **구조적으로 제한**되어 payload 조작으로 넓힐 수 없다 — **fail-close가 코드 구조에서 나온다** |
| **N7-2** | 지표 재사용 | 동상 | `getResourceLoadSummaryService`와 **같은 함수를 같은 순서로 호출하되 `accountIds`만 좁힌다**(`fetchAssignedLoadByAccounts`·`selectActiveProjectCounts`·`getRollupMeta`·`computeCompletionRate`). **신규 계산 0.** 오히려 기존보다 가볍다 — 그쪽은 전 사용자를 훑지만 N7은 팀 인원만 본다 |
| **N7-3** | 하위 그룹 포함 범위 | 동상 | **`leadingScopeAccountIds`를 그대로 쓴다** — 이미 후손 포함(`descendantsOf(..., {includeSelf:true})`). `scopeTeamKeys`(소속 팀 포함)가 아니라 **`leadingScopeTeamKeys`(리딩 팀만)** 기반이어야 한다 — 전자면 "내가 팀원인 팀"의 동료 분석까지 열려 과대하다. `teamKey`를 payload로 받되 **서버가 항상 교집합**을 취한다 |
| **N7-4** | 드릴다운 — H1 감사 | 동상 | **`getResourceProfile`에 `accountTargets` 축 추가로 기존 드로어 재사용.** H1의 교훈대로 **호출 체인을 전수 확인**했다 — 클라이언트 호출은 `getResourceProfile` + `getSettingData`(**`'PUBLIC'`**) **2개뿐**이고, 응답에 타인이 실리지 않음도 확인. **H1이 재발하지 않는다** |
| **N7-5** | 재무 축 배제 | 동상 | 응답에 `salary`·`annualSalary`·인건비 **일절 없음**(§R3-B). `getResourceProfile`도 재무 필드 부재를 재확인했고, 향후 추가되면 마스킹 대상임을 §R3-B 일반 규칙에 등재 |
| **N7-6** | 소속 팀 vs 리딩 팀 | 동상 (결정 5) | **소속 팀 줄을 팀장에게도 보여준다.** §11 U5에서 둘이 다를 수 있음을 허용했고, 다른 경우 그 사실 자체가 의미 있는 정보다. **같으면 중복이므로 숨긴다**(`myTeamKey === selectedTeamKey`) |

### 지표 단일 정의 — 이번 회차의 핵심 산출물

**§3에 "팀 지표 단일 정의" 절을 신설**했다. 세 화면(N7 `/my-page` · N6 `/dashboard` · 다음 회차 `/resource`)이 이것만 소비한다.

**⚠ 전수 조사 결과 "이미 단일"이 아니었다 — 내 초안 전제가 틀렸다.**

| 지표 | 실측 | 결정 |
|---|---|---|
| **가동률** | **3종.** ①글로벌(참여구간 union 근무일) / ②프로젝트내(프로젝트 경과 근무일) / ③분석탭(조회기간 전체, 클램프 없음). **UI 라벨은 셋 다 "가동률"** | **팀 축에는 ①만 쓴다.** ②는 **사람당 값이 여러 개**라 팀 롤업이 정의되지 않는다. **🔴 이것이 §N6 초안을 정정한다** — 초안은 N6가 `projects[].members[].utilization`(②)을 쓴다고 적었고, 그대로 갔으면 N7(①)과 **같은 팀·같은 기간에 다른 값**이 나왔다. 포트폴리오 응답에 ①도 실려 있다(`utilization.people[]`) |
| **가동률 분모** | `availMd`를 배치가 **이미 계산하지만 응답에 싣지 않는다** | **2필드(`investedMd`·`availMd`) 추가** → 세 화면이 **가중 `Σ/Σ`** 사용. `util` 값·산식 불변이라 무회귀. **§6-8 M2의 라벨 분리(`팀 인원 평균 가동률`)는 폐기** |
| **공수** | MD는 정의 단일(~15곳 복제지만 값 동일). **MM은 분모 3종**(경과기간/조회기간/달력 30.4375) + 분자 출처마저 다름(이슈 timetracking vs 워크로그) | **팀 축은 MD만 쓴다.** MM은 분모가 기간 의존이라 프로젝트를 가로질러 **합산이 성립하지 않는다.** 요구는 "투입 공수(MM)"였으나 **실측 근거로 MD로 변경** |
| **완수율** | **4종.** A `spent/(spent+remaining)`(사람) / B `Σ(progress×planned)/Σplanned`(프로젝트) / C `done/total`(건수, myPage 프론트) / D Jira 원시. **A 자체가 2곳에 복제** | N7=A(`팀원 평균 완수율`), N6=B(`팀 참여 프로젝트 평균 완수율`). **한 화면에 나란히 놓지 않는다.** A는 **최근 26주 Done 창**(`LOAD_DONE_WINDOW`)이 적용되므로 InfoTip 필수 |
| **층 분리** | — | **개인 지표=백엔드(기존 함수 재사용), 팀 롤업=프론트 `aggregateByTeam()` 순수함수 1개.** 두 층이 겹치지 않아 구현이 갈릴 자리가 없다. **N7 서버가 팀 합계를 내려주지 않는 이유가 이것** |

**§8-3에 신규 등재 4건**: C6(`computeCompletionRate` 2벌 복제) · D5(가동률 3종) · D6(MM 3종) · (기존 C5 MD 복제).
→ **셋 다 이번 회차에 통합하지 않는다.** 통합 회귀면이 P2를 크게 넘고 현재 값 divergence가 없거나 스코프가 다르다. **"팀 축에는 ①/MD/A만 쓴다"는 규칙으로 회피**하고 별도 과제로 남긴다.

### 구현 단계 분할 (§9 P2 서두)

| 단계 | 내용 | 근거 |
|---|---|---|
| **P2-a** | 프로젝트-팀 배정 + N1 + `teamKey` 응답 확장 + **가동률 2필드** + `aggregateByTeam` | **나머지 전부의 전제.** 요구 1번(인력관리)을 직접 충족. 순수 추가라 회귀면 최소 |
| **P2-b** | **N7 + N5** | **blast radius 최소** — 기존 화면 동작을 하나도 바꾸지 않는다. 체감 크고 롤백 쉽다 |
| **P2-c** | **N6 + U12**(인건비 게이트) | **유일하게 기존 동작을 축소**한다(Member가 Cost 탭을 못 보게 됨). 배포 커뮤니케이션 필요 → **단독으로 내야 롤백 단위가 작다** |

**N7을 앞당길 수 있다** — N7은 `project_team` 테이블에 의존하지 않고 P2-a 산출물 중 **가동률 2필드 + `aggregateByTeam`만** 필요하다. 빠른 성과가 필요하면 그 둘만 떼어 P2-b를 먼저 낸다. **다만 P2-c는 항상 마지막이다.**

### 코디네이터 수정분 반영

`MyTeamSection`의 `if (!isTeamLead) return null` → 비팀장도 소속 팀 표시로 고친 것을 **N7 카드 구성에 통합**했다(결정 5). 팀 미소속 시 섹션 미생성도 그대로 유지한다.

---

## 17. 외부 검토 반영 (P2, 2026-07-28) — High 2 / Medium 5 / Low 7

검토서: `_workspace/team-management/05_fable_review_p2.md` (수정하지 않음 — 검토 기록 보존).
*(§16이 N7 설계로 이미 사용 중이라 이 절은 §17로 둔다.)*
**High 2건은 직접 재실측해 반영했다. 그 과정에서 검토서와 코디네이터 메시지의 사실 오류를 각 1건씩 정정했다.**

### High — 2건 반영

| # | 지적 | 판정 | 반영 | 결정 |
|---|---|---|---|---|
| **H-1** | U12 "키 삭제" 방어 논리가 허위 + 게이팅 지점 열거 불완전 | **✅ 사실 (재실측)** — `?? 0` 폴백 **9곳** 확인(`portfolioAggregate.js:37,91,106,301,324,355,373,477` + `PortfolioSalaryByProject:65`). `undefined ?? 0 === null ?? 0 === 0` → **키 삭제도 "₩0" 거짓 숫자를 똑같이 만든다.** `ScopeSplitCell` 사건과 같은 유형 | **§N6 U12 문단 재작성** + §9 체크리스트 + §10 U16 + §7 i18n 3키 | **키 삭제 결정은 유지, 근거를 정정**("Σ 거짓 숫자 방지" → **"원본 제거로 프론트 재계산 차단"**). **실제 방어선은 `costMasked` UI 게이팅**임을 명문화하고 **소비 지점 7개를 전수 표로** 열거. 테스트 단언을 **"조회조차 하지 않음"(구현 불가) → "응답에 키 부재 + `costMasked:true`"**로 교체 |
| **H-2** | `teamMeta` 구성이 3가지로 상충 → TEAM_ONLY 스코프 보장이 구현 해석에 달림 | **✅ 사실** — `scopedProjectIds`가 좁히는 것은 `projects[]`뿐(`PortfolioDashboardService.js:156-158`) | **§N6에 "3층 규칙" 소절 신설** + §9 체크리스트 | **역할을 층으로 분리**: `teamMeta`=**이름 사전(전체 팀)** / `memberTeamMap`=**전 사용자** / **선택지만** `projects[].members[]`(스코프 적용됨) ∘ `memberTeamMap`에서 파생. 서버는 관례대로 구현하고 **스코프 일치는 클라이언트 파생 규칙이 보장**한다. `utilization.people[]`은 **필터 무관 글로벌**이라 옵션 소스로 쓰지 말 것을 명시 |

### Medium — 5건 전부 반영

| # | 지적 | 반영 |
|---|---|---|
| **M-1** | 가동률 축 모집단이 다른데 상호작용 표가 4축 일괄 AND + `teamComparison` 시그니처로 계산 불가 | ✅ **상호작용 표에 가동률 예외 행 신설** — "프로젝트 선택에 반응하지 않는다(항상 전사)". 분모 `availMd`가 **전 프로젝트 참여 구간 union**이라 부분집합 재계산이 불가능함을 근거로 명시. **시그니처에 `utilizationPeople` 인자 추가**. 배치 미실행 구간 폴백(`aggregateStatus`, **0%로 그리지 않음**)도 N6에 명시. 전용 InfoTip 키 추가 |
| **M-2** | §3 갱신이 §15·§8·§8-3·i18n에 미전파 | ✅ **6곳 전부 정정** — §15 N4 행(라벨 분리 폐기 명시) / §8-3 D2 / i18n `axis.effort` **MM→MD** / 정렬 폴백 3곳 MM→MD / §8 영향표 "배치 무변경"→**"스냅샷 테이블 무변경, 단 P2-a는 배치 수정"** / §15 머리말 범위에 **N7 추가** |
| **M-3** | N7 `grants:[RESOURCE_MANAGEMENT read]` 유지 근거 불성립 | ✅ **(a) 채택 — `grants: []`, `teamLead` 단독 축.** 비리더 관리자는 `leadingScopeAccountIds=[]`(`PrincipalResolver.js:71,128`)라 grants가 열어주는 것은 **빈 섹션뿐**이고, 실제 리더면 `teamLead`만으로 통과한다. `grantedBy` 분기는 **결정 1이 스스로 기각한 구조**라 쓰지 않는다. 관리자 열람이 실요구면 **별도 resolver**로. ⚠ **계약 테스트의 `grants.length > 0` 단언 확장** 항목 추가 |
| **M-4** | `TeamSelect`가 옵션 소스를 내부 고정 — "teamMeta 파생 옵션"과 충돌 | ✅ **검토서 처방(옵션 주입 prop 신설)보다 나은 해법을 택했다** — `TeamSelect`에 **`excludeValues` prop이 이미 존재**한다(`:55,:58`). 이걸 쓰면 **신규 prop 0**이고, 원본 옵션을 그대로 쓰므로 **`depth`/`parentTeamKey` 계층 들여쓰기가 보존**된다(파생 옵션은 flat `{key:name}`이라 계층이 사라진다는 검토자 지적을 정면 해결). `TeamSelect` 변경은 **`isMulti` 1건뿐** |
| **M-5** | "그룹 키에 teamKey 금지"의 **근거가 허위** | ✅ **수용 — 근거만 정정, 처방 유지.** 그룹 키가 `` `${start}__${end}__${type}` ``이라 **`end`가 키 성분**이므로 그룹이 쪼개져도 `first.schedule_end_date`는 불변 → 날짜 사고는 발생하지 않는다. **실제 위험은 다인 통합 이벤트의 분열 중복 렌더**(`dayMaxEvents={3}` 환경에서 필터가 오히려 이벤트를 늘리는 역효과)로 교체. **"검증된 것처럼 서술된 가짜 함정은 다음 설계에서 전례로 인용될 때 해를 끼친다"**를 명기 |

### Low — 7건 (6건 반영, 1건 범위 조정)

| # | 반영 |
|---|---|
| **L-1** | ✅ 캘린더 **조기 반환 분기**(`ProjectCalendarService.js:75-77`)에도 `memberTeamMap`/`teamMeta`를 실어 루트 필드 집합 1:1 유지 |
| **L-2** | ✅ `emptyShape()`의 `costMasked`를 **하드코딩 `false`가 아니라 `!canReadCost(principal)`**로 명시 |
| **L-3** | ✅ **'팀 미지정' 선택 가능**(`includeNoneOption`). 미선택 기본 표에 이미 있는데 선택 모드에서만 못 고르면 두 모드의 대상 집합이 갈린다. 술어는 `memberTeamMap[accountId] === undefined` |
| **L-4** | ⚠️ **범위 조정으로 확정** — `PortfolioTeamDist`(구성비)를 **P2에서 제외**한다. 누락이 아니라 판단: 비교 위젯(4축)이 구성비 정보를 포함하고, 위젯 2개 동시 투입은 P2-c의 blast radius를 키운다. 필요하면 **비교 위젯의 표시 모드 토글**(막대 ⇄ 도넛)로 추가 |
| **L-5** | ✅ **"export 승격" 철회** — `WorkAssignmentRules.js:96` 복사본이 **이미 export**돼 있다. N7은 **그쪽을 import**한다고 지정(지정하지 않으면 세 번째 복사본이 생긴다) |
| **L-6** | ✅ "3번째 복사본" → **"2번째"**로 정정(백엔드 `canReadCost` 복사본은 1개뿐) |
| **L-7** | ✅ N5에 **"선택 팀 인원이 이 프로젝트에 없음"** 빈 상태 문구 추가. 옵션을 좁히지 않는 이유(프로젝트 인력 목록 추가 조회 비용 > 문구)도 명시 |

### 검토서 / 코디네이터 메시지에 대한 반론 2건

무비판 수용을 피하기 위해 **양쪽 모두의 사실 오류를 실측으로 정정**했다.

| 대상 | 서술 | 실측 정정 |
|---|---|---|
| **검토서 H-1** | `PortfolioSalaryByProject`·`PortfolioSalaryHistogram`·**`PortfolioProjectTable`**은 "어디서도 import되지 않는 **고아 위젯**이라 무관하다(확인 완료)" | **`PortfolioProjectTable`은 고아가 아니다.** `PortfolioTsrSignalTable.jsx:11`에서 import되어 **`:165`에서 렌더**된다(신호등 ⇄ 풀 수치표 토글). **salary 컬럼이 `:52,:90`에 살아 있다** → **게이팅 대상 4번으로 추가**했다. 검토서대로 갔으면 이 컬럼이 "₩0"으로 남았다 |
| **코디네이터 메시지** | 급여 관련 **7개 파일 전부**를 게이팅 대상으로 열거하라. "급여 전용 위젯이 2개나 있다 — 위젯 자체를 렌더하지 않아야 한다" | **`PortfolioSalaryByProject`·`PortfolioSalaryHistogram`은 진짜 고아**(외부 참조 **0건**, 실측)다. **죽은 코드를 게이팅하면 커버리지가 있다는 착각만 생긴다.** 게이팅 대상에서 제외하고 **§10 U16(고아 위젯 삭제 권고)으로 분리**했다. 실제 게이팅 대상은 **7지점**이되 구성이 다르다(필터바 칩 · TsrSignal salary · TsrSignal cost신호 · **ProjectTable salary** · Cost 탭 · ComparisonTabs `salaryBuckets` · 비교 위젯 축) |

**추가 발견**: 루트 응답 필드 **`salaryBuckets`도 재무 데이터**인데 초안·검토서 어느 쪽도 게이팅 대상에 넣지 않았다 → **서버 키 삭제 대상에 추가**했다.

### §10 사실 확인 정정 반영

| # | 정정 |
|---|---|
| **U13** | 발현 조건 구체화 — **DST 시간대 뷰어가 봄 전환을 가로지르는 다일 이벤트**에서 1일 축소(`2027-03-10` +5d → 3-14). **KST는 DST가 없어 오프셋 왕복 상쇄로 미발현** — 그래서 지금까지 안 잡혔다는 설명 추가 |
| **U14** | **"크래시" → "조용한 항상 실패"로 정정** — `onEventDrop`의 try/catch(`:193-214`)가 TypeError를 삼키고 `revert()`. **추가 결함 발견**: `context`를 넣어도 `:202` `extendedProps.started`가 **존재하지 않는 필드**라 시간 재계산이 별도로 깨져 있다(`extendedProps`는 `{issue, worklog}`) |
| **U15** | 인라인 키 5종 파일·라인 명시 |
| **U16** | **신규** — 고아 위젯 2종. 되살아나면 게이트 없이 급여가 노출되므로 삭제 권고 |

### 착수 순서 (검토서 §6 권고 수용)

1. **H-1 · H-2 → 반영 완료.** 둘 다 설계서의 열거·정의 보강이라 코드 구조 변경이 없었다.
2. **M-2 → 같은 커밋에서 처리 완료**(기계적 정정 6곳).
3. **M-3 · M-4 → P2-b·P2-c 착수 전 반영 완료.**
4. **M-1 · M-5 · L → 반영 완료.** L-4만 범위 조정으로 처분.
