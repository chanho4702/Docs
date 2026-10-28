# team-analytics — 백엔드 구현 리포트 (P1-a)

작성: 2026-08-03 · 슬러그 `team-analytics` · 단계 **P1-a (BE 기반) 만**
설계서: `_workspace/team-analytics/01_architect_design.md` (§A 규범 부록 · §3-0 · §5-2 · §6-2 · §6-3 · §13-1)

> 🔴 **다음 단계(frontend)가 읽어야 할 것: §2 응답 shape.** 아래 shape 은 **실제 구현 기준**이며
> 설계 계약과의 차이는 §5 에 전부 적어 두었다(차이 없음 — 계약 그대로 구현됨).

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| 신규 resolver | `getTeamAnalyticsScope` **1개** |
| 기존 응답 확장(additive) | `userPermissionCheck` → 루트 `team.teamAnalyticsScope` / `getPortfolioDashboard` → `utilization.people[].utilBand` |
| 신규 파일 | 7개 (소스 3 + 테스트 4, 아래 §4) |
| DB 변경 | **없음** (MySQL 테이블 0 · KVS 엔티티 0 · `manifest.yml` 무변경) |
| 신규 ErrorCode | **없음** |
| 테스트 | **56 suites / 849 tests 전부 통과** (기준선 52 / 768 → +4 suites / +81 tests, 회귀 0) |
| P1-b 이후 | **손대지 않음** (프론트·A/B/C 화면·P2 배치 전부 미착수) |

---

## 1. resolver 계약 (프론트가 그대로 쓴다)

| resolver | 상태 | payload | 서비스 반환 | **프론트 소비 경로** |
|---|---|---|---|---|
| `getTeamAnalyticsScope` | 신규 | `{}` (없음) | `{ content: {...} }` | **`res.content.*`** |
| `userPermissionCheck` | 확장 | — | 루트 스프레드 | **`res.team.teamAnalyticsScope`** |
| `getPortfolioDashboard` | 확장 | `{}` | 루트 스프레드 | **`res.utilization.people[].utilBand`** |

### 🔴 `res.content` 과 `res.team` 을 헷갈리지 말 것

`src/utils/ResponseWrapper.js` 는 `return { success: true, ...result }` — **스프레드**다.

- `TeamAnalyticsService` 는 `{ content: {...} }` 를 반환한다 → 최종 응답은 `{ success:true, content:{...} }` → **`res.content.scopeMode`**
- `PermissionService.userPermissionCheckService` 는 `{ isUser, name, projectScope, pages, team }` 을 반환한다 → 최종 응답은 `{ success:true, isUser, …, team:{...} }` → **`res.team.teamAnalyticsScope`**
- **`res.content.team` 은 존재하지 않는다.** (`userPermissionCheck.test.js` 에 `expect(res).not.toHaveProperty('content')` 로 고정해 두었다)

---

## 2. 실제 응답 shape (글자 그대로)

### 2-1. `getTeamAnalyticsScope`

```js
// invoke('getTeamAnalyticsScope')   ← payload 없음
{
  success: true,
  content: {
    // ── 스코프 판정 (서버 소유 — 프론트 재판정 금지) ────────────────────
    scopeMode: 'ALL' | 'LEADING' | 'NONE',
    visibleTeamKeys: ['team-uuid-1', 'team-uuid-2'],  // NONE → []
    includeUnassigned: true,                          // ALL → true / LEADING·NONE → false
    unassignedCount: 4,                               // includeUnassigned===false → null (0 아님)

    // ── 팀 트리 (가시 팀만 · 전위 순회 순서 · 부모 절단 반영) ───────────
    teams: [
      {
        teamKey: 'team-uuid-1',
        id: 'team-uuid-1',            // teamKey 와 같은 값(rollupTeamTree/normalizeTeamMeta 호환 별칭)
        name: '개발본부',
        parentTeamKey: null,          // 가시 집합 밖을 가리키면 null 로 절단
        depth: 0,                     // 가시 트리 기준 재계산값
        leaderAccountId: '5b10a...',  // 없으면 null
        leaderName: '홍길동',          // 없거나 Jira 조회 실패 시 null
        memberCount: 12,              // users.team_key 직속 조직 인원
        descendantMemberCount: 30     // 자기 + 후손 조직 인원 (비가시 후손도 포함)
      }
    ],

    // ── 표시/진단 메타 ─────────────────────────────────────────────────
    myTeamKey: 'team-uuid-2',         // 없으면 null
    leadingTeamKeys: ['team-uuid-2'], // 직속만 (principal.leadingTeamKeys)
    isTeamLead: true,
    hasCycle: false,
    truncated: false,
    limits: { maxDepth: 10, maxTeams: 500 },
    membershipBasis: 'CURRENT'
  }
}
```

**`teams[]` 원소의 키 집합은 정확히 9개다** (테스트로 고정):
`depth` `descendantMemberCount` `id` `leaderAccountId` `leaderName` `memberCount` `name` `parentTeamKey` `teamKey`

**`content` 의 루트 키 집합은 정확히 12개이며 `NONE` 응답과 정상 응답이 완전히 동일하다** (테스트로 고정):
`scopeMode` `visibleTeamKeys` `includeUnassigned` `unassignedCount` `teams` `myTeamKey` `leadingTeamKeys` `isTeamLead` `hasCycle` `truncated` `limits` `membershipBasis`
→ 프론트가 두 shape 을 만나 옵셔널 체이닝 누락으로 죽는 경로가 없다.

#### `scopeMode === 'NONE'` 응답 (에러가 아니다)

```js
{ success: true, content: {
    scopeMode: 'NONE',
    visibleTeamKeys: [],
    includeUnassigned: false,
    unassignedCount: null,          // 🔴 0 이 아니다 (모름 ≠ 없음)
    teams: [],
    myTeamKey: <principal.teamKey ?? null>,     // principal 에서 무료로 읽는 값이라 채운다
    leadingTeamKeys: <principal.leadingTeamKeys ?? []>,
    isTeamLead: <!!principal.isTeamLead>,
    hasCycle: false,
    truncated: false,
    limits: { maxDepth: 10, maxTeams: 500 },
    membershipBasis: 'CURRENT'
} }
```

🔴 **정확한 표현: "principal 해석 이후 추가 조회 0회"** (외부 검토 정정).
서비스는 팀 인덱스(KVS)·인원 SQL·Jira bulk 를 **한 번도 호출하지 않는다**(테스트로 고정).
다만 **resolver 전체로 보면 조회가 0 은 아니다** — `guardedDefine` 이 핸들러보다 먼저
`resolvePrincipal(req.context)` 를 수행하므로 인증/권한 해석 비용(Jira `/mypermissions` ·
`users` SQL · KVS `permission` · 팀 인덱스, L1 캐시 hit 시 0회)은 그대로 든다.
그 비용은 이 resolver 고유가 아니라 **모든 가드 경로의 공통 비용**이다.

#### 계약 불변식 — 전부 테스트로 고정됨

| # | 불변식 | 테스트 |
|---|---|---|
| 1 | `teams[].teamKey` 배열 ≡ `visibleTeamKeys` (순서까지 동일) | ✅ ALL/LEADING 양쪽 |
| 2 | `NONE` → `teams:[]`·`visibleTeamKeys:[]`·`unassignedCount:null`, **에러 아님**, principal 해석 이후 추가 조회 0회 | ✅ |
| 3 | 가시 집합 밖 `parentTeamKey` → `null` 절단 + `depth` 가시 트리 기준 재계산 | ✅ (LEADING 에서 `team-dev.parentTeamKey===null`·`depth===0`, `team-fe.depth===1`) |
| 4 | `includeUnassigned===false` → `unassignedCount === null` | ✅ |
| 5 | `truncated`/`hasCycle` 이 true 여도 `teams` 를 비우지 않는다 | ✅ |

---

### 2-2. `userPermissionCheck` (확장 — additive)

```js
// 최종 응답 (루트 스프레드 — content 없음)
{
  success: true,
  isUser, name, projectScope, pages,
  team: {
    teamKey, teamName, isTeamLead, leadingTeamKeys, permissionSource,
    teamAnalyticsScope: 'ALL' | 'LEADING' | 'NONE'      // ← 신규 (P1-a)
  }
}
```

- 기존 5필드 **1바이트도 안 바뀜.** 추가 필드 1개뿐.
- `accountId` 부재 fail-close 경로 / `principal` 에 팀 필드가 없는 과도기 경로 → **`'NONE'`**.
- 값은 `TeamAnalyticsService` 와 **같은 함수**(`resolveTeamAnalyticsScope`)가 만든다 → **판정 로직의 드리프트는 불가능**하다.
  ⚠ 다만 "두 응답이 **항상** 동일"은 사실이 아니다 — 정확한 조건은 §3-4 참조.

**프론트 소비 (P1-b 참고)**: `usePermissionStore` 는 `res.team` 을 그대로 쓰고 있으므로 **스토어 로직 변경 없이** `EMPTY_TEAM` 에 `teamAnalyticsScope: 'NONE'` 필드 1개 + getter 1개만 추가하면 된다.

---

### 2-3. `getPortfolioDashboard` (확장 — additive)

```js
utilization: {
  buckets, totalPeople, avgUtilization, hasWeightedMetrics,
  people: [{
    accountId, displayName, util, investedMd, availMd,
    utilBand: 'idle' | 'normal' | 'over' | 'red' | 'unknown'   // ← 신규 (P1-a)
  }]
}
```

- 임계값은 `settings` 의 `utilizationUnderBand`(0.7) / `utilizationOverBand`(1.1) / `utilizationRedBand`(1.3).
  이 서비스가 **이미 조회 중인 settings** 를 쓰므로 **추가 I/O 0**.
- 🔴 `util === null` 또는 `undefined`(집계 전) → **`'unknown'`**. **`'idle'`(0%)로 분류하지 않는다.**
- 밴드 값은 `res.utilizationBands = { utilUnder, utilOver, utilRed }` 로도 계속 내려간다 → 프론트는 **자체 분류기를 만들지 말고 `utilBand` 를 그대로 읽는다**.
- `emptyShape` 은 `people: []` 이라 변경 불필요. 루트 키 집합 1:1 규약 유지(기존 `PortfolioCostGate.test.js` 통과).
- P2 필드(`monthlyEffort`·`trendReady`·`hasMemberMonthlyEffort`·`trendMonths`·`trendCoverage`·`trendUnavailableReason`)는 **이번에 구현하지 않았다.**

---

## 3. 권한 판정 (§5-2)

### 3-1. 단일 출처 — `src/permission/TeamAnalyticsScope.js`

```js
export const TEAM_ANALYTICS_SCOPES = Object.freeze(['ALL', 'LEADING', 'NONE']);
export const ORG_WIDE_RESOURCES = Object.freeze(['TEAM_MANAGEMENT', 'USER_MANAGEMENT', 'RESOURCE_MANAGEMENT']);
export const resolveTeamAnalyticsScope = (principal) => 'ALL' | 'LEADING' | 'NONE';
```

판정 순서 (구현 그대로):
```
1) !principal                                                        → 'NONE'   (fail-close)
2) principal.isAdmin === true                                        → 'ALL'
3) ORG_WIDE_RESOURCES 중 하나라도 read === true
   && principal.projectScope === 'ALL'                               → 'ALL'
4) principal.isTeamLead === true                                     → 'LEADING'
5) 그 외                                                              → 'NONE'
```

**소비처는 정확히 2곳** — `userPermissionCheckService`, `TeamAnalyticsService`.
둘 다 이 함수를 호출한다. 삼항 복제 없음.

**정적 검사의 한계 (검토자 코멘트 반영)**: `src/` 전역 `'LEADING'` 리터럴 0건 검사는 **현재 사고 유형
(복붙 삼항)에는 실효가 있으나 증명은 아니다.** 문자열 조합(`'LEAD' + 'ING'`)·상수 배열 인덱스
(`TEAM_ANALYTICS_SCOPES[1]`)·다른 모듈 경유 폴백은 잡지 못한다. 최종 보증은 이 검사가 아니라
**소비처 2곳의 import 존재 검사 + 조합표 테스트 + 코드리뷰**다. (강화하지 않는다 — 오탐 비용이 크다.)

### 3-2. 조합표 #1~#10 — 전부 테스트로 고정

| # | orgSignal | projectScope | isTeamLead | isAdmin | 판정 | 테스트 |
|---|---|---|---|---|---|---|
| 1 | — | (ALL/TEAM_ONLY/MEMBER_ONLY 전부) | (무관) | ✅ | **ALL** | ✅ |
| 2 | ✅ | `ALL` | ❌ | ❌ | **ALL** | ✅ (org 3종 각각) |
| 3 | ✅ | `ALL` | ✅ | ❌ | **ALL** | ✅ (org 3종 각각) |
| 4 | ✅ | `TEAM_ONLY` | ✅ | ❌ | **LEADING** | ✅ (org 3종 각각) |
| 5 | ✅ | `TEAM_ONLY` | ❌ | ❌ | **NONE** | ✅ (org 3종 각각) |
| 6 | ✅ | `MEMBER_ONLY` | ❌ | ❌ | **NONE** | ✅ (org 3종 각각) |
| 7 | ❌ | `ALL` | ✅ | ❌ | **LEADING** | ✅ |
| 8 | ❌ | `ALL` | ❌ | ❌ | **NONE** | ✅ |
| 9 | ❌ | `TEAM_ONLY` | ❌ | ❌ | **NONE** | ✅ |
| 10 | `principal` 이 `null`/`undefined` | — | — | — | **NONE** | ✅ |

**프리셋 이름 기준 테스트는 만들지 않았다** (설계서 지시대로 — 프리셋은 `edit:true`·최초 1회 생성이라 운영값을 보장하지 못한다).

추가 회귀 가드(테스트):
- 🔴 `REPORT read` 단독 + `projectScope ALL`(= 시드 `Member`) → **`NONE`**. REPORT 로 전 팀을 열지 않는다.
- 🔴 `RESOURCE_MANAGEMENT read` + `projectScope TEAM_ONLY` + 팀장(= 프리셋 `Team Lead`) → **`LEADING`**. `projectScope==='ALL'` 조건이 빠지면 여기가 `ALL` 이 되어 팀장이 전 팀으로 승격된다.
- org 신호는 `read` 기준이다(write 만 있으면 신호 아님).
- truthy 우회 차단 — `isAdmin: 1`, `isTeamLead: 'yes'`, `read: 'yes'` 전부 `NONE`.

### 3-3. `PermissionMap` 엔트리 (1건만 추가)

```js
getTeamAnalyticsScope: OR([['REPORT', 'read'], ['RESOURCE_MANAGEMENT', 'read'], ['TEAM_MANAGEMENT', 'read']], 'none'),
```
- **grant = 진입 게이트일 뿐 "볼 수 있는 팀 범위"가 아니다.** `REPORT read` 만 가진 사용자는 가드를 통과하지만 서비스가 `scopeMode:'NONE'`(빈 트리)을 돌려준다.
- `project` mode 는 `'none'` — 프로젝트 데이터가 아니다(팀 마스터 + 조직 인원 수).
- `getProjectTeams` grant 확장은 **철회 그대로 반영** (§3-3) — 손대지 않았다.

### 3-4. 🔴 "두 소비처가 항상 동일"의 정확한 조건 (외부 검토 정정)

**판정 로직은 단일 함수라 드리프트가 불가능하다. 그러나 "두 응답의 `scopeMode` 가 항상 같다"는 명제는 틀렸다.**

| 축 | 인정하는 org 신호 |
|---|---|
| `resolveTeamAnalyticsScope` (판정) | `TEAM_MANAGEMENT` · `USER_MANAGEMENT` · `RESOURCE_MANAGEMENT` |
| `PermissionMap.getTeamAnalyticsScope` (진입 grant) | `REPORT` · `RESOURCE_MANAGEMENT` · `TEAM_MANAGEMENT` — **`USER_MANAGEMENT` 없음** |

→ **`USER_MANAGEMENT read` 만 있고 `REPORT`/`RESOURCE_MANAGEMENT`/`TEAM_MANAGEMENT` read 가 전부 없는**
사용자(+ `projectScope==='ALL'`)는:
- `userPermissionCheck.team.teamAnalyticsScope` → **`'ALL'`**
- `getTeamAnalyticsScope` 호출 → **`PERMISSION_DENIED`** (가드에서 거부)

**사용자 노출 결함은 아니다.** A 화면·사이드바의 프론트 게이트가 `canRead('REPORT') && teamAnalyticsScope !== 'NONE'`
이라, `REPORT read` 가 없는 이 사용자에게는 **메뉴 자체가 뜨지 않는다**(§A-2). B 팀 탭도 `getPortfolioDashboard`
(`R('REPORT','list')`)를 먼저 요구하므로 도달하지 않는다.

#### 판단: `USER_MANAGEMENT` 를 grant 에 **추가하지 않는다**

1. **설계서 §3-3 이 grant 를 명시적으로 3종으로 고정했다.** 이 문서는 3차 외부 검토를 거친 단일 진실 원천이고,
   grant 확장은 백엔드가 단독으로 결정할 사항이 아니다(초안의 `getProjectTeams` 확장도 같은 이유로 철회됐다).
2. **추가해도 아무도 화면에 도달하지 못한다.** 프론트 게이트가 `REPORT read` 를 요구하므로,
   grant 만 넓히면 "resolver 는 열렸는데 메뉴는 없는" 죽은 경로가 하나 늘 뿐이다.
   실제로 열려면 **grant + 프론트 게이트를 한 쌍으로** 바꿔야 한다 — 그건 §A-2 권한 표의 변경이다.
3. **좁은 쪽이 fail-close 다.** 지금 상태의 실패 모드는 "권한 있는 것처럼 표시됐는데 거부"이고,
   반대(grant 만 확장)의 실패 모드는 "의도보다 넓게 열림"이다. 전자가 안전하다.

→ **P1-c(사이드바 배선) 시점의 architect 결정 사항으로 남긴다.** 프론트는 **`teamAnalyticsScope` 단독으로
게이팅하지 말고 반드시 `canRead('REPORT') &&` 를 함께 걸어야 한다**(설계서 §A-2 그대로). 그러면 이 비대칭이
사용자에게 보이지 않는다.

---

## 4. 변경/신규 파일

### 신규

| 파일 | 내용 |
|---|---|
| `src/permission/TeamAnalyticsScope.js` | `resolveTeamAnalyticsScope` · `TEAM_ANALYTICS_SCOPES` · `ORG_WIDE_RESOURCES`. **순수 함수, I/O 0** |
| `src/resolver/teamAnalytics/TeamAnalyticsController.js` | `registerTeamAnalyticsController(resolver)` — `guardedDefine(resolver, 'getTeamAnalyticsScope', ({principal}) => …)` |
| `src/resolver/teamAnalytics/TeamAnalyticsService.js` | `getTeamAnalyticsScopeService(principal)` — §6-2 처리 순서 |
| `test/permission/teamAnalyticsScope.contract.test.js` | 조합표 #1~#10 + 회귀 가드 + **재복제 방지 정적 검사** |
| `src/resolver/teamAnalytics/__test__/TeamAnalyticsService.test.js` | 불변식 1~5 + 성능(호출 횟수) + shape |
| `src/resolver/portfolioDashboard/__test__/PortfolioUtilBand.test.js` | `utilBand` 경계·`unknown`·settings 연동·무회귀 |
| `src/resolver/backoffice/team/__test__/MemberTeamPairs.test.js` | **단일 소속 불변식** — 원본 pairs 의 `accountId` 유일성 (§6) |

**Repository 없음** — 기존 `TeamTreeCache` / `TeamRepository.countUsersByTeam` / `UserService.userMap` 을 재사용한다(설계서 §1-1 대로).

### 수정 (전부 additive)

| 파일 | 변경 |
|---|---|
| `src/index.js` | `registerTeamAnalyticsController` import + `CONTROLLER_REGISTRARS` 배열 마지막에 추가 (배열 한 곳만 수정) |
| `src/permission/PermissionMap.js` | `getTeamAnalyticsScope` 엔트리 **1건** |
| `src/resolver/backoffice/permission/PermissionService.js` | `TeamAnalyticsScope` import + `EMPTY_TEAM_BLOCK.teamAnalyticsScope='NONE'` + 반환 `team` 에 `teamAnalyticsScope: resolveTeamAnalyticsScope(principal)` |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `classifyUtilBand` import + `people` 매핑에 `utilBand` 1필드 |
| `test/permission/userPermissionCheck.test.js` | 기존 `toEqual` 4곳에 `teamAnalyticsScope` 추가 + 신규 describe 1개 |

**`manifest.yml` 무변경.** KVS 신규 속성이 없어 `forge deploy` 스키마 반영이 필요 없다.

---

## 5. 처리 순서 / 성능 (§6-2 구현 결과)

```
guardedDefine → guard → resolvePrincipal(context)          ← 🔴 여기까지는 모든 가드 경로의 공통 비용
getTeamAnalyticsScopeService(principal)
 1. scopeMode = resolveTeamAnalyticsScope(principal)
 2. scopeMode === 'NONE' → 빈 shape 즉시 반환               ← 🔴 여기서부터 추가 조회 0회
 3. Promise.all([ getTeamIndex(), countUsersByTeam() ])     ← KVS(60초 캐시) 1 + SQL 1
 4. orderedKeys = flattenTeamIndex(index)                    ← 결정적 전위 순회
 5. visibleTeamKeys
      ALL      → orderedKeys 전체
      LEADING  → principal.leadingScopeTeamKeys ∩ index      ← 🔴 scopeTeamKeys 를 쓰지 않는다
 6. 부모 절단(가시 집합 밖 → null) + depth 1패스 재계산
 7. leaderName — userMap() bulk 1회 (try/catch, 실패 시 null 폴백 · 던지지 않는다)
 8. unassignedCount = ALL ? counts.get('NONE') ?? 0 : null
```

**principal 해석 이후** 서비스가 발생시키는 조회:

| 경로 | KVS | SQL | Jira |
|---|---|---|---|
| `NONE` | 0 | 0 | 0 |
| `ALL` / `LEADING` | 팀 인덱스 1회(캐시 hit 시 0) | `countUsersByTeam` 1회 | 리더 bulk 1회(리더 있을 때만) |

(가드의 `resolvePrincipal` 비용은 이 표에 포함되지 않는다 — 모든 가드 경로의 공통 비용이고
L1 캐시 30초 hit 시 0회다.)

`getTeamList` 보다 가볍다 — 권한 세트 조회 없음, `loadTeamIndexFresh()` 대신 60초 캐시 사용.

### 🔴 `leadingScopeTeamKeys` vs `scopeTeamKeys`

LEADING 은 **`principal.leadingScopeTeamKeys`**(내가 리더인 팀 + 후손)만 쓴다.
`scopeTeamKeys` 는 **자기 소속 팀까지** 포함하므로, 그걸 쓰면 리더가 아닌 사람의 동료 팀이 열린다.
테스트가 이를 고정한다 — 팀장 principal 에 `scopeTeamKeys: ['team-dev','team-fe','team-be','team-biz','team-root']` 를 주고 `visibleTeamKeys` 가 `['team-dev','team-fe','team-be']` 뿐임을 단언.

### 순환 import 확인 (§6-3)

`PortfolioDashboardService` → `resourceManagement/ResourceMatch.js` 로 `classifyUtilBand` 만 가져온다.
**`ResourceMatch.js` 는 import 가 하나도 없는 순수 모듈**이라 순환이 원천적으로 불가능하다.
`resolveBands`(= `ResourceManagementService`, 이쪽은 `portfolioDashboard/PortfolioSnapshotRepository` 를 import 한다)는 **가져오지 않았다.**
대신 `PortfolioDashboardService` 가 이미 settings 에서 뽑아 쓰던 `underBand`/`overBand`/`redBand` 3변수를 그대로 넘긴다 —
기본값이 `resolveBands` 와 동일(0.7 / 1.1 / 1.3)해 두 화면의 밴드 기준이 갈리지 않는다.
→ **분류기를 `src/utils/` 로 승격할 필요가 없었다.** 복제도 없다(분류 로직은 `classifyUtilBand` 하나뿐).

---

## 6. 테스트 결과

```
$ npm test        (루트, jest)

Test Suites: 56 passed, 56 total
Tests:       849 passed, 849 total
Snapshots:   0 total
Time:        38.5 s
```

기준선(작업 전): **52 suites / 768 tests 전부 통과** → 회귀 **0건**.
(태스크 지시문의 "기존 708개"는 실제 기준선과 달랐다 — 실측 768개이며 전부 유지된다.)

| 테스트 | 내용 | 결과 |
|---|---|---|
| `test/permission/teamAnalyticsScope.contract.test.js` | 조합표 #1~#10, REPORT 단독 차단, Team Lead 승격 차단, truthy 우회 차단, 값 도메인 동결, **정적 검사**(`'LEADING'` 리터럴 정의처 외 0건 + 소비처 2곳 import 확인) | ✅ |
| `src/resolver/teamAnalytics/__test__/TeamAnalyticsService.test.js` | ① NONE 추가 조회 0회 ② LEADING 이 `leadingScopeTeamKeys` 사용(`scopeTeamKeys` 미사용) ③ 부모 절단+depth 재계산 ④ `visibleTeamKeys ≡ teams[].teamKey` ⑤ LEADING `unassignedCount===null` + 리더 실패 폴백 + 사이클/truncated 전달 + shape 고정 | ✅ |
| `src/resolver/backoffice/team/__test__/MemberTeamPairs.test.js` | **단일 소속 불변식**(§6-1) — 원본 pairs `accountId` 유일성 + 중복 감지 + 맵 단계 검출력 0 증명 + 스키마/SQL 팬아웃 부재 | ✅ (7 tests) |
| `test/permission/userPermissionCheck.test.js` | `res.team.teamAnalyticsScope` 존재 + `resolveTeamAnalyticsScope` 와 동일 값 + `res.content` 부재 + 기존 4필드 무회귀 | ✅ |
| `test/permission/permissionMap.contract.test.js` | 등록집합 ↔ 맵키집합 1:1 (**무수정 자동 통과** — `CONTROLLER_REGISTRARS` 단일 소스 덕분) | ✅ |
| `test/permission/projectScope.contract.test.js` | 기존 정적 검사(`'ALL'` 폴백 삼항 재복제 0건)를 신규 파일들이 위반하지 않음 | ✅ |
| `src/resolver/portfolioDashboard/__test__/PortfolioUtilBand.test.js` | 밴드 경계 6종, `util null/undefined → 'unknown'`, settings 연동, people 기존 5필드 무회귀 | ✅ |
| `src/resolver/portfolioDashboard/__test__/PortfolioCostGate.test.js` | 기존 인건비 게이트 + 루트 키 1:1 (**무수정 통과**) | ✅ |

### 6-1. 단일 소속 불변식 — `accountId` 유일성 (설계 4차 수정 DoD)

**검사 지점을 백엔드 원본 pairs 로 잡았다.** 프론트 `assertSingleMembership(memberTeamMap)` 안은
**검출력이 0** 이다 — `PortfolioDashboardService.js:149` 의
`Object.fromEntries(memberTeamPairs.map(p => [p.accountId, p.teamKey]))` 가 **중복을 이미 조용히 덮은 뒤**라
프론트가 받는 맵에는 중복이 존재할 수 없고, 무엇을 검사하든 항상 통과한다.

`src/resolver/backoffice/team/__test__/MemberTeamPairs.test.js` 가 고정하는 것:

| # | 단언 | 의미 |
|---|---|---|
| 1 | `findAllMemberTeamPairs()` **반환 배열**의 `accountId` 가 전부 유일 | 원본 단계 검사 |
| 2 | 같은 `accountId` 가 두 팀으로 오면 **실패** | 다중 소속 도입 감지 게이트 |
| 3 | 같은 입력에서 `Object.fromEntries` 는 3행 → 2키로 줄고 **마지막 값이 이긴다** | **왜 맵이 아니라 배열을 봐야 하는지의 증명** |
| 4 | `users` 는 `PRIMARY KEY (account_id)`, `team_key` 는 **스칼라 컬럼 1개** | 구조적 근거(별도 매핑 테이블 아님) |
| 5 | 발행 SQL 이 `users` 단일 조회이며 **`JOIN`/`UNION` 없음** | 팬아웃 경로 부재 |
| 6 | `PortfolioDashboardService` 가 `findAllMemberTeamPairs()` 결과를 그대로 `Object.fromEntries` 한다 | 원본 소스가 한 곳뿐임을 고정 |

**이 테스트가 깨지면 통과시키려 고치지 말 것.** 팀 집계(`aggregateByTeam` / `rollupTeamTree` /
`teamMetricsByTeam`), A4 "참여 인원 dedup", §8-4 "후손 dedup 수의 단순 합" 이 전부 단일 소속 전제 위에
서 있다. 다중 소속이 도입되면 **집계 규약부터 재설계**해야 한다.

---

## 7. 설계 계약과의 차이

**없다.** §A-1 / §3-1 / §3-2 의 계약을 글자 그대로 구현했다.

명시해 둘 구현 판단 3가지(계약 위반은 아님):

1. **`NONE` 응답의 `myTeamKey`·`leadingTeamKeys`·`isTeamLead` 를 `null`/`[]`/`false` 로 비우지 않고 principal 값으로 채웠다.**
   설계서 불변식 2는 `teams`·`visibleTeamKeys`·`unassignedCount` 만 규정한다. 이 3필드는 principal 에서 **조회 없이** 읽히므로 "조회 0회" 규칙을 깨지 않고, 프론트가 `NONE` 안내 문구에 소속 팀명을 쓸 여지를 남긴다.
   → 프론트는 **`scopeMode === 'NONE'` 만으로 게이팅**하고 이 3필드를 데이터 유무 판단에 쓰지 말 것.
2. **`getTeamAnalyticsScope` 의 `PermissionMap` grant 순서**는 `REPORT` → `RESOURCE_MANAGEMENT` → `TEAM_MANAGEMENT` 로 넣었다(설계서 표기 순). OR 이므로 의미 차이 없음.
3. **`utilBand` 임계값 주입 방식** — `resolveBands(settings)` 를 import 하지 않고 이 서비스가 이미 계산 중인 3변수를 넘겼다(§5 순환 import 확인 참조). 결과값은 동일하다.

---

## 8. 다음 단계(P1-b)로 넘기는 메모

- **소비 경로 재확인**: A 화면·B 팀 탭은 `res.content.*`, 사이드바/페이지 게이트는 `res.team.teamAnalyticsScope`.
- `usePermissionStore` 는 이미 `res.team` 을 통째로 저장하는 구조라 **스토어 로직 변경 없이** `EMPTY_TEAM` 필드 1개 + getter 1개만 추가하면 된다.
- `limits`(`{maxDepth:10, maxTeams:500}`)를 서버가 실어 보내므로 **프론트에 팀 수/깊이 리터럴 상수를 두지 말 것**(M6).
- `unassignedCount` 는 `LEADING`/`NONE` 에서 **`null`** 이다. `?? 0` 금지 — Dash(`-`)로 렌더.
- `utilBand` 의 `'unknown'` 은 "집계 전"이지 "가동률 0%"가 아니다. 밴드 분포 위젯에서 별도 구간으로 표기할 것.
- `teams[]` 는 이미 **가시 트리 기준 depth/부모 절단이 끝난 상태**다. 프론트가 다시 절단·재계산하지 말 것.
- P2 필드(`monthlyEffort` 계열 6종)는 **아직 없다.** 프론트에서 존재 여부를 검사하지 말고 P2 배치 구현까지 추이 위젯을 만들지 말 것.
- 🔴 **A 사이드바/페이지 게이트는 `teamAnalyticsScope` 단독으로 걸지 말 것.** 반드시
  `canRead('REPORT') && teamAnalyticsScope !== 'NONE'` 로 건다(§A-2 그대로). 그래야 §3-4 의
  grant↔판정 비대칭(`USER_MANAGEMENT` 단독 보유자)이 사용자에게 보이지 않는다.
- **`assertSingleMembership(memberTeamMap)` 을 프론트에 만들지 말 것** — 검출력이 0 이다(§6-1).
  불변식은 백엔드 `MemberTeamPairs.test.js` 가 이미 지킨다.
- 배포 전 **§11-5 KVS 권한 세트 감사**는 여전히 필수다(누가 `ALL` 이 되는지는 코드가 아니라 운영 데이터가 정한다).
