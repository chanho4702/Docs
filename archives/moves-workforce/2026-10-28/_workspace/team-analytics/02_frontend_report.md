# team-analytics — 프론트엔드 구현 리포트 (P1-b)

작성: 2026-08-03 · 슬러그 `team-analytics` · 단계 **P1-b (FE 기반) 만**
설계서: `01_architect_design.md` (§A-0 색인 · §7-3 · §7-4 · §7-5 · §8-1 · §8-2 · §8-3 · §8-4 · §13-3 · §14)
선행: `02_backend_report.md` (P1-a 실제 응답 shape)

> 🔴 **화면 변화 0.** 라우트·탭·위젯을 하나도 추가하지 않았다. P1-c/d/e(A·B·C 화면)와 P2 는 미착수.

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| 신규 파일 | 7개 (소스 4 + 테스트 3) |
| 수정 파일 | 5개 (전부 무회귀 — 근거 §6) |
| 테스트 | **45 suites / 733 tests 전부 통과** (기준선 41 / 650 → +4 suites / +83 tests, **회귀 0**) |
| 빌드 | `npm run build` 성공 (신규 경고 0 — 기존 node_modules source-map 경고만) |
| i18n | **추가 키 없음** → merge 는 `prebuild` 로 실행됐고 `locales/` diff 0 (§7) |
| 화면 동작 | **변화 없음** (근거 §6) |

⚠ **기준선 정정**: 태스크 지시문의 "34 suites / 614 tests" 는 실측과 달랐다 — 작업 전 실측은 **41 suites / 650 tests** 이며 전부 유지된다.

---

## 1. 추출한 hook / adapter 의 실제 시그니처

### 1-1. `pages/projectDetail/analysisReport/resource/resourceMembersAdapter.js` (신규 · 순수 · React 없음)

```js
// 상수 — 이 유닛에서 **여기에만** 정의된다(정적 검사로 감시)
export const TEAM_FILTER_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE     = 10;
export const USER_MAP_MAX          = 100;
export const VIEW_MODE_MEMBER = 'member';
export const VIEW_MODE_TEAM   = 'team';

// ①②③⑥ 조회 계획 + 상한 강등
resolveFetchPlan({ viewMode, page, teamKey, totalMemberCount })
  → { isTeamFilterActive, isFullFetch, pagesize, effectivePage,
      isTeamFilterUnavailable, effectiveViewMode, isTeamView }

// ③④⑤ 팀 필터 (상한 초과 시 teamKey 를 null 로 무력화 — 현행 그대로)
resolveMemberTeamFilter({ teamTree, teamKey, includeDescendants, isTeamFilterUnavailable })
  → { mode: 'all'|'unassigned'|'keys', keys: Set }
applyTeamFilter(rows, filter) → rows[]

// ⑧ getUser 활성 조건
shouldFetchUserMap({ userIdCount, isTeamView }) → boolean

// ⑩ {success:false} → throw   (메시지 = `${fnName} failed`, 백엔드 message 우선)
unwrapInvoke(res, fnName) → res

// ⑨ 행 조립 (hasOwnProperty 3단 — 명시적 null 보존)
buildAnalysisMap(data) → Map<accountId, member>
resolveBaseMmDays(data, startDate, endDate) → number | null
resolveMonthMm(monthMmMap, startDate) → number
buildMembers({ userList, analysisMap, data, baseMmDays }) → members[]
buildPages({ totalMemberCount, isFullFetch }) → number[]
```

> `resolveFetchPlan` 은 **두 단계를 한 함수로** 낸다. `isFullFetch`/`pagesize`/`effectivePage` 는
> **요청 시점 값**이라 `viewMode` **원본**으로 계산하고, `effectiveViewMode`/`isTeamFilterUnavailable` 은
> **응답의 총 인원**이 있어야 나온다. 훅은 이 함수를 `totalMemberCount: 0` 으로 한 번(요청용),
> 응답 후 실제 값으로 한 번(렌더용) 호출한다 — 순수 함수라 두 번 불러도 안전하다.

### 1-2. `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js` (신규)

```js
const {
    // ── 설계서 §7-3 계약 ─────────────────────────────────────────────
    members,                 // 조인·폴백 완료 (teamKey/teamName/totalMd/effectiveMmDays 포함)
    userMap,                 // accountId → Jira user (팀 모드·상한 초과 시 {})
    totalMemberCount,
    isFullFetch,
    isTeamFilterUnavailable, // 🔴 계약 필드명 그대로. `isOverMemberLimit` 는 쓰지 않았다
    effectiveViewMode,       // 🔴 상한 초과 시 이미 'member' — 렌더는 이것만 본다
    baseMmDays, monthMm,
    isLoading,               // = isUserLoading || isAnalysisLoading
    isUserError, isAnalysisError,   // 🔴 **통합 isError 없음** (정적 검사로 감시)

    // ── 현행 화면 보존에 필요한 additive 필드 ────────────────────────
    rawUserList,             // 팀 셀렉트 옵션 원천 (필터 **전** 목록)
    userList, pages, teamFilter,
    monthMmMap, hourRate,
    isUserLoading, isAnalysisLoading, isUserMapLoading,
} = useProjectResourceMembers({
    projectId, startDate, endDate,
    viewMode,             // 'member' | 'team' — 페이지가 소유한 state (훅은 소유하지 않는다)
    page, teamKey, includeDescendants,
});
```

**상태 소유권**(§7-3 그대로): 훅은 `viewMode` state 를 소유하지 않고 `effectiveViewMode` 를 **반환**한다.
렌더 가드는 훅이, `useEffect` state 복귀는 페이지가 책임진다 — **이중 방어 유지**.

**설계서 계약에 없는 additive 필드를 추가한 이유**: 계약의 `isLoading` 단일 필드로는 현행 화면을 그릴 수 없다.
`ResourceAnalysisTable`/`TeamTable` 이 `isLoading`·`isUserMapLoading`·`isAnalysisLoading` **3개를 각각** prop 으로 받고,
`ResourceAnalysisChart` 가 `monthMmMap`·`hourRate` 를 쓴다. 계약 필드는 전부 그대로 두고 **덧붙이기만** 했다.

**소비 shape (백엔드 계약 준수)** — 이 훅은 신규 resolver 를 부르지 않는다. 기존 2종을 그대로 쓴다:
`findProjectusersByProjectId` → `res.rows[]`(루트 스프레드) / `getResourceAnalysisList` → `res.members[]`·`res.baseMmDays`·`res.monthMmMap`·`res.effectiveDays`·`res.hourRate`(루트 스프레드).
**`res.content` 을 쓰지 않는다** — 두 resolver 모두 `responseWrapper` 스프레드형이다(§3-0).

### 1-3. `pages/portfolio/utils/teamComparison.js` — `teamMetricsByTeam` 신규 export

```js
teamMetricsByTeam(selected, memberTeamMap, teamMeta, utilizationPeople, {
    unassignedLabel, unknownTeamLabel,
    scope,   // 🔴 필수 { allowedTeamKeys: Set|Array|null, includeUnassigned: boolean } — 없으면 throw
}) → {
    rows,             // 표시용 병합 행 (아래 필드 전부)
    flatGroups,       // rollupTeamTree 에 **그대로** 넣는 평면 그룹 (members: [] 고정)
    memberIdsByTeam,  // Map<teamKey|null, Set<accountId>>
    scopedTeamKeys,   // Set<teamKey|null>
    hasUtilizationData,
}
```
`rows[i]` = `teamKey, teamName, isUnassigned, hasName, memberCount, effortMd, salary, completionRate,
utilization, delayedShare, riskScoreWeighted, bands{idle,normal,over,red,unknown},
bandIdle~bandUnknown, utilMemberCount, investedMd, availMd, completionWeighted, completionDenom,
delayedEffortMd, riskWeighted, riskDenom, missing`

### 1-4. `utils/team/rollupTeamTree.js` — 옵션 확장

```js
rollupTeamTree(flatGroups, teamMeta, {
  unassignedLabel = '', unknownTeamLabel = '',
  sumFields   = ['investedMd','availMd'],                                    // 기본 = 현행
  ratioFields = [{field:'utilization',numerator:'investedMd',denominator:'availMd'}],
  allowedTeamKeys,     // 🔴 필수. Set|Array|null(무제한). undefined → throw
  includeUnassigned,   // 🔴 필수. boolean.            아니면 throw
})
totalOrgStats(nodes, { sumFields, ratioFields })   // 기본값 동일 → 무인자 호출 무변경
```

### 1-5. 기타 신규

| 파일 | 내용 |
|---|---|
| `utils/team/teamAnalyticsFields.js` | `ADDITIVE_SUM_FIELDS`·`NON_ADDITIVE_FIELDS`·`WEIGHTED_AVG_FIELDS`·`BAND_COUNT_FIELDS`·`bandCountField()`·`bandsMatchUtilMembers()` |
| `utils/queryKey/teamAnalyticsKeys.js` | `all` + `scope()` **2개만** |
| `stores/usePermissionStore.js` | `EMPTY_TEAM.teamAnalyticsScope = 'NONE'` + `getTeamAnalyticsScope()` getter. **스토어 로직 무변경** (`res.team` 경로 그대로 — 백엔드 리포트 §2-2 확인) |

---

## 2. characterization 10항목 — 무엇을 고정했나 + 설계서와 달랐던 부분

파일: `pages/projectDetail/analysisReport/resource/__test__/resourceAnalysisPage.characterization.test.js` (**32 tests**)

**설계서를 믿지 않고 `ResourceAnalysisPage.jsx` 현행 소스를 직접 읽어 대조했다.** 아래 "현행 동작" 열은 전부 실코드 기준이다.

| # | 고정한 현행 동작 | 설계서 대비 |
|---|---|---|
| ① | 인별 기본: `pagesize=10`(`DEFAULT_PAGE_SIZE`), `effectivePage=page`, `pages=⌈total/10⌉` | 일치 |
| ② | 팀 모드: `isFullFetch=true` → `pagesize=500`, `effectivePage=1`, `pages=[]` | 일치 |
| ③ | 팀 **필터**가 켜지면 **뷰 모드와 무관하게** `isFullFetch=true`. 단 `effectiveViewMode` 는 여전히 `'member'` | 일치 (후자는 설계서에 없어 명시 추가) |
| ④ | `TEAM_FILTER_NONE = '__NONE__'` 3상태(전체 `null` / 특정 팀 / 미소속). `null` 로 뭉개지 않는다 | 일치 |
| ⑤ | `includeDescendants` → `collectSelfAndDescendantKeys` 로 후손까지 키 집합 확장 | 일치 |
| ⑥ | `total > 500` → `isTeamFilterUnavailable`. 팀 모드가 인별로 **강등**. **렌더 가드(`effectiveViewMode`) + `useEffect` state 복귀 둘 다.** 경계 500 은 초과 아님 | 일치 |
| ⑦ | 배너 = `(isUserError \|\| isAnalysisError)` / 표 차단 = **`isTeamView && isAnalysisError` 뿐**. 인별이거나 `isUserError` 만이면 **표는 그려진다** | 일치 (설계서가 초안을 이미 정정한 그대로) |
| ⑧ | `enabled: userIds.length > 0 && !isTeamView && userIds.length <= 100` | 일치 |
| ⑨ | `effectiveMmDays` = `hasOwnProperty` 3단(`a` → `ed` → `defaultEffective`). **명시적 `null` 보존**. `baseMmDays:null` 도 끝까지 살아남는다 | 일치 |
| ⑩ | 두 `invoke` 의 `{success:false}` → **throw**. `undefined`/`null` 응답도 throw | 일치 |

### 🔴 설계서 10항목 표에 **없던** 현행 동작 1건 (직접 발견 → 테스트로 고정)

> **상한(500명) 초과 시 팀 뷰뿐 아니라 팀 필터도 무력화된다.**
> `resolveTeamFilter(teamTree, isTeamFilterUnavailable ? null : teamKey, includeDescendants)` (현행 `:208`)
> — 설계서 ⑥ 은 "팀 모드가 인별로 되돌려진다"만 적었다. 필터 무력화가 빠지면 추출 시 조용히 사라졌을 동작이다.
> → `resolveMemberTeamFilter` 의 `isTeamFilterUnavailable` 인자로 이전하고 테스트로 고정했다
> (`'상한 초과에서는 팀 필터도 무력화된다'`).

### 설계서 라인 참조와 실제 파일의 차이 (전부 ±1~6줄, 동작 차이 없음)

| 설계서 표기 | 실제 (작업 전 파일) |
|---|---|
| `:193` `isTeamFilterUnavailable` | `:194` |
| `:198-206` 렌더 가드 + effect | `:201-205` |
| `:277-305` `analysisMap` 조인 | `:277-304` |
| `:307-353` MM 폴백 | `:307-359` |
| `:510-511` 배너 / `:526` 표 차단 | `:511` / `:526` ✅ |

### 추출 전 / 후 동일 통과 — 실행 순서 그대로

1. `resourceMembersAdapter.js` 작성(현행 코드의 축자 이전) → characterization 32 tests 작성
2. **페이지를 아직 건드리지 않은 상태에서 실행 → 32/32 PASS** (= 현행 동작이 그대로 녹음됐음의 확인)
3. `useProjectResourceMembers.js` 작성 → `ResourceAnalysisPage.jsx` 를 훅으로 교체
4. **같은 테스트 파일을 1바이트도 고치지 않고 재실행 → 32/32 PASS**
5. 그 다음에야 단일화 정적 검사(`resourceAdapterSingleSource.test.js`)를 추가 — 이것만 **추출 이후 전용**이다(파일 상단에 명시)

⑦·⑥ 의 렌더 조건은 순수 함수로 표현할 수 없어(이 리포에는 `@testing-library/react` 가 없다)
**`ResourceAnalysisPage.jsx` 소스 정적 단언**으로 고정했다 — 이 조건들은 추출 후에도 JSX 에 그대로 남으므로
같은 단언이 **양쪽에서 통과**한다:
- `/\(isUserError \|\| isAnalysisError\)/` 존재
- `/isTeamView && isAnalysisError/` 존재
- `/\bconst\s+isError\s*=/` **부재** (통합 금지)
- `setViewMode(VIEW_MODE_MEMBER)` 를 부르는 `useEffect` 존재

---

## 3. 스코프 필수화로 바꾼 소비처

| # | 파일 | 변경 | 근거 |
|---|---|---|---|
| 1 | `pages/resource/organization/OrganizationTab.jsx` | `rollupTeamTree` 옵션에 `allowedTeamKeys: null, includeUnassigned: true` **2줄 추가**. 그 외 무변경 | 전사 조직도 — 의도적 무제한(§8-3) |
| 2 | `pages/portfolio/utils/teamComparison.js` 내부 B1 경로 | `teamComparison()` 이 `teamMetricsByTeam(..., { scope: { allowedTeamKeys: null, includeUnassigned: true } })` 를 내부 전달 | B1 현행 동작 보존. **호출부(`PortfolioTeamComparison`) 시그니처 무변경** |
| 3 | `utils/team/__test__/rollupTeamTree.test.js` | 공통 helper `rollupFrom` 에 `allowedTeamKeys: null, includeUnassigned: true` 기본값 추가 (`...options` 로 덮어쓰기 가능) | §13-3 — **케이스 본문 무변경** |

**전수 확인**: `static/ui/src` 전역 grep 결과 `rollupTeamTree(` 호출부는 **`OrganizationTab` 1곳 + 테스트 3파일**뿐,
`teamMetricsByTeam(` 호출부는 **`teamComparison()` 1곳 + 테스트 2파일**뿐이다. 누락된 소비처 없음.

### throw 범주 구분은 지켰다 (§8-1)

| 상황 | 처리 | 확인 |
|---|---|---|
| 사이클 · 고아 · 이름 모름 · 빈 입력 | **던지지 않는다**(현행 유지) | `rollupTeamTree.test.js` 기존 케이스 전부 무수정 통과 |
| `allowedTeamKeys`/`includeUnassigned` 미전달 | **throw** | 신규 케이스 |

기존 fail-soft 방어(`resolveParent` 사이클 가드, `visited` 최후 보루, `normalizeTeamMeta` 3형태 흡수)는 **하나도 제거하지 않았다.**

---

## 4. 기존 테스트 3분류 처리 (§14-17)

| 구분 | 파일 | 결과 |
|---|---|---|
| **무수정 통과 필수** | `teamComparison.test.js` (30 tests) | ✅ **1바이트도 안 고쳤다.** `teamComparison()` 이 `teamMetricsByTeam().rows` 에서 **현행 9키 + missing 4키만** 골라 조립하므로 신규 필드가 새어 나가지 않는다 |
| | `aggregateByTeam.test.js` · `resourceTeamFields.test.js` · `costGate.test.js` · `portfolioAggregate.test.js`(스냅샷 포함) · `teamFilter*.test.js` · `teamPermissionEffect.test.js` | ✅ 전부 무수정 통과 |
| **수정 허용 (2케이스 한정)** | `rollupTeamTree.test.js` — `rollupTeamTree()` / `rollupTeamTree(null,null)` → `[]` 단언 | ✅ throw 단언으로 교체 + "스코프를 넘긴 빈 입력은 여전히 `[]`" 케이스를 **새로 추가**해 원래 의도(빈 입력에 던지지 않는다)를 보존. **같은 파일의 나머지 20 케이스는 무수정 통과** |
| **신규 작성 필수(선행)** | characterization 10항목 | ✅ 32 tests, 추출 전/후 동일 통과 |

---

## 5. §8-4 필드 분류 — 정본 준수 확인

`utils/team/teamAnalyticsFields.js` 가 §8-4 를 **글자 그대로** 옮겼고, `__test__/teamAnalyticsFields.test.js`(16 tests)가 감시한다.

- `bandIdle`~`bandUnknown` + `utilMemberCount` → **ADDITIVE** ✅
- `memberCount` → **NON_ADDITIVE** ✅ — 주석에 **"합산하면 틀려서가 아니라 `toDirectStats` 전용 경로가 이미 처리하므로 generic `sumFields` 에 넣으면 이중 처리"** 라고 이유를 명시
- `flatGroups[].members` → **빈 배열 고정**, 두 축 모두 `includeMembers: false` ✅ (테스트가 단언)
- **A/B 경로의 `stats.bands` 는 전부 0** 임을 테스트로 못 박음 — "읽지 말 것"의 기계적 근거
- `Σband* === utilMemberCount` 를 **모든 노드의 direct·total 양쪽**에서 단언 ✅
- `utilMemberCount ≠ memberCount` 를 **일부러 다르게** 만든 픽스처로 고정(두 모집단이 다름을 오해하지 못하게)
- 비율 4종의 분자·분모가 전부 ADDITIVE 임을 단언 (아니면 Σ/Σ 재계산 불가)
- `delayedEffortMd` 정상 행 = **알려진 `0`** (§8-2 a) ✅ — `null` 로 두면 분모까지 잃어 지연5+정상5 가 100% 가 된다

**`?? 0` 스캔(§14-8)**: 신규 코드에서 `investedMd`/`availMd`/`salary`/`effortMd` 에 `?? 0`·`?? []` 없음.
`?? 0` 을 쓴 곳은 **카운터뿐**(`memberIdsByTeam.get()?.size`, `missing.*`) — 전부 "알려진 0".

---

## 6. 🔴 화면 동작이 하나도 바뀌지 않았다는 근거

| # | 화면 | 근거 |
|---|---|---|
| 1 | **인력 분석(`ResourceAnalysisPage`)** | JSX 를 **한 줄도 바꾸지 않았다.** 바뀐 것은 값의 **출처**뿐(로컬 `useQuery`/`useMemo` → 훅 반환). 렌더에 쓰이는 12개 값(`members`·`userMap`·`pages`·`isTeamFilterUnavailable`·`isTeamView`·`baseMmDays`·`monthMm`·`monthMmMap`·`hourRate`·3종 loading·2종 error)의 산출식이 축자 이전됐고 characterization 32 tests 가 그것을 고정한다. **쿼리키 4종 전부 동일**(`resourceAnalysisKeys.*`) → 캐시 분기·중복 조회 없음 |
| 2 | 〃 | 두 `useEffect` 순서·의존성 배열 유지. `isTeamView` 는 `effectiveViewMode === 'team'` 으로 **같은 값**(`!isTeamFilterUnavailable && viewMode === 'team'` 와 동치, 테스트로 단언) |
| 3 | **조직 현황(`OrganizationTab`)** | `rollupTeamTree` 반환의 **기존 6필드(`memberCount`·`investedMd`·`availMd`·`utilization`·`missingUtilization`·`bands`)가 키·값 모두 동일**. 무제한 스코프라 필터가 아무것도 거르지 않는다. 이 탭이 실제로 읽는 것은 `stats.missingUtilization`·`stats.bands` 2개뿐(grep 확인) — 둘 다 계산식 무변경. 신규 `missing` 키는 **읽는 코드가 없다**(additive) |
| 4 | **전사 대시보드 팀별 비교(B1)** | `teamComparison()` 반환이 **1바이트도 안 바뀜** — `teamComparison.test.js` 30 tests 무수정 통과가 기계적 증거. `PortfolioTeamComparison.jsx` **무수정**(테스트가 `allowedTeamKeys`/`teamMetricsByTeam` 부재를 단언) |
| 5 | **전 화면** | 라우트(`App.jsx`)·탭(`constants/tabs.js`)·사이드바(`Sidebar.jsx`) **무변경** — git diff 에 없음. 신규 UI 컴포넌트 0개 |
| 6 | **권한 스토어** | `EMPTY_TEAM` 에 필드 1개 + getter 1개 **추가만**. 기존 5필드·`loadPermissions` 로직·기존 getter 6종 무변경. 새 getter 를 **읽는 화면이 아직 없다** |
| 7 | **i18n** | 신규 키 0 → `ko-KR.json`/`en-US.json` diff 0 (§7) |
| 8 | **빌드** | `npm run build` 성공, 신규 경고 0 |

> ⚠ 다만 정직하게: **자동 렌더 테스트로 검증한 것은 아니다.** 이 리포에는 `@testing-library/react` 가 없어
> 컴포넌트를 마운트할 수 없다. 위 근거는 ① JSX 무변경(diff) ② 값 산출식의 축자 이전 + 순수 함수 테스트
> ③ 소스 정적 단언 ④ 기존 스위트 무수정 통과의 조합이다. **인력 분석 화면의 수동 확인은 여전히 권장**한다
> (팀 필터 3상태 · 하위 팀 포함 · 팀별 뷰 전환 · 페이지네이션 · 아바타).

---

## 7. i18n

**추가한 키가 없다.** P1-b 는 화면을 만들지 않으므로 §10 의 키(`teamAnalytics.json` 신규 · `portfolio.json`/`projectDetail.json` 추가)는
**해당 화면을 만드는 P1-c/d/e 에서 함께** 넣는 것이 맞다(쓰이지 않는 키를 미리 넣으면 어느 화면이 소비하는지 추적이 끊긴다).

- `locales/kr/*` · `locales/en/*` **무변경**
- `cd static/ui && npm run build` 의 `prebuild` 가 `npm run merge`(= `locales/script/merge.js`)를 실행했고,
  산출물 `ko-KR.json`/`en-US.json` 의 **git diff 가 0** 임을 확인했다 → 기존 번역 무손실
- `ko-KR.json`/`en-US.json` 을 직접 수정하지 않았다

---

## 8. 신규/수정 파일

### 신규 (7)

| 파일 | 내용 |
|---|---|
| `pages/projectDetail/analysisReport/resource/resourceMembersAdapter.js` | 순수 조립부 (①~⑩) |
| `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js` | 훅 (쿼리 4종 + 어댑터 조립) |
| `utils/team/teamAnalyticsFields.js` | 필드 분류 정본 + 밴드 헬퍼 |
| `utils/queryKey/teamAnalyticsKeys.js` | `all` + `scope()` |
| `pages/projectDetail/analysisReport/resource/__test__/resourceAnalysisPage.characterization.test.js` | **32 tests** — ①~⑩ |
| `pages/projectDetail/analysisReport/resource/__test__/resourceAdapterSingleSource.test.js` | **11 tests** — 어댑터 단일화 정적 검사(추출 후 전용) |
| `utils/team/__test__/teamAnalyticsFields.test.js` | **16 tests** — 분류 불변식 · Σband* · 행 합산≠실인원 |
| `utils/team/__test__/teamScopeLeak.test.js` | **22 tests** — 스코프 누출 + 정적 검사 3경로 |

*(테스트 4개 중 `teamScopeLeak`/`teamAnalyticsFields` 는 `utils/team/__test__/` 에, 나머지 2개는 resource `__test__/` 에)*

### 수정 (5)

| 파일 | 변경 |
|---|---|
| `utils/team/rollupTeamTree.js` | 필드 옵션화(`sumFields`/`ratioFields`) + 스코프 필수화 + 복원 루프 이중 방어 + `missing` additive |
| `utils/team/__test__/rollupTeamTree.test.js` | helper 에 scope 기본값 2줄 + 무인자 2케이스 → throw 단언 (본문 무변경) |
| `pages/portfolio/utils/teamComparison.js` | `teamMetricsByTeam` 신규 export + `teamComparison()` 이 내부 호출로 전환(반환 불변) |
| `pages/resource/organization/OrganizationTab.jsx` | `rollupTeamTree` 옵션 2줄 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx` | 조회·조립 블록(≈150줄) → 훅 호출. **JSX 무변경** |
| `stores/usePermissionStore.js` | `EMPTY_TEAM` 필드 1 + getter 1 |

---

## 9. 테스트 / 빌드 결과

```
$ cd static/ui && npm test          # ⚠ npx react-scripts test 는 moduleNameMapper 를 안 타 오탐

Test Suites: 45 passed, 45 total
Tests:       733 passed, 733 total
Snapshots:   1 passed, 1 total
Time:        18.7 s
```
기준선(작업 전 실측) **41 suites / 650 tests** → **회귀 0건**, 순증 +4 suites / +83 tests.

```
$ cd static/ui && npm run build
Compiled with warnings.          # node_modules source-map 경고(기존) 만. 신규 경고 0
The build folder is ready to be deployed.
```

---

## 10. 다음 단계(P1-c/d/e)로 넘기는 메모

- **어댑터 재구현 금지.** C(`ProjectTeamAnalysisPage`)는 `useProjectResourceMembers` 를 **그대로 import** 한다.
  `resourceAdapterSingleSource.test.js` 가 상수·판정의 두 벌 생성을 즉시 실패시킨다.
- **500명 초과 차단**은 훅의 **`isTeamFilterUnavailable`** 로 건다(계약 필드명 그대로). `effectiveViewMode` 로 렌더.
- **집계 함수는 이제 scope 없이 못 부른다.** 신규 위젯은 `teamMetricsByTeam(..., { scope })` /
  `rollupTeamTree(..., { allowedTeamKeys, includeUnassigned })` 를 **반드시** 넘긴다. `getTeamAnalyticsScope` 응답에서
  `allowedTeamKeys = new Set(content.visibleTeamKeys)`, `includeUnassigned = content.includeUnassigned` 를 만든다.
- **`stats.bands` 를 읽지 말 것** — A/B 경로에서 항상 전부 0 이다. `band*` 합산 필드 / `rows[].bands` 를 쓴다.
- **`memberCount` 를 `sumFields` 에 넣지 말 것** — 이중 처리된다(§8-4).
- `teamAnalyticsKeys.scope()` 는 만들어 뒀다. **`resourceAnalysisKeys` 재사용**이고 `projectKeys` 신규 금지.
- 사이드바/페이지 게이트는 **`canRead('REPORT') && getTeamAnalyticsScope() !== 'NONE'`** — 스토어 getter 준비 완료.
  단독 게이팅 금지(백엔드 리포트 §3-4 의 grant↔판정 비대칭).
- `unassignedCount` 는 `LEADING`/`NONE` 에서 **`null`** 이다. `?? 0` 금지 — Dash 로 렌더.
- **정적 검사 3경로가 이미 켜져 있다.** `pages/teamAnalytics/**`, `pages/portfolio/widgets/PortfolioTeam*.jsx`(**B1 제외**),
  `pages/portfolio/tabs/TeamTab.jsx` 를 만드는 순간 `aggregateByTeam(` 직접 호출 금지 + scope 인자 필수가 자동 적용된다.
  (B1 `PortfolioTeamComparison.jsx` 는 의도적 무제한이라 제외했고, 그 사실 자체를 테스트가 단언한다.)
- **i18n 은 P1-c/d/e 에서** §10 키를 `locales/kr|en/` 에 넣고 `npm run merge`.
