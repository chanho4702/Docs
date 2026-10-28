# 구독 편입 이슈 등록이력 보완 — 설계서

> 입력: `_workspace/subscription-assigned-history/00_input/requirement.md`
> 기준 소스: `develop` / `f6e521c` (2026-08-11 조사)
> 성격: 소규모 보완. **신규 resolver 없음 / 신규 페이지 없음 / DB(MySQL·KVS) 변경 없음 / manifest 변경 없음.**

---

## 1. 개요 / 영향 범위

구독으로 자동 편입된 이슈는 `moves_RMS_projectId` 필드만 태깅될 뿐 이슈 프로퍼티(`movesRms`)의
등록일이 비어 있어, 작업 이력 탭에서 "추적 전"으로 표시되고 정렬 끝으로 밀린다.
**태깅 성공 직후 등록일 + 구독 마커를 기록**하고, 프론트는 마커를 "구독"으로 표시한다.

| 축 | 내용 |
|----|------|
| 백엔드 | 신규 공용 모듈 1개(`src/api/jira/issue/AssignedDateRecorder.js`) + **호출 지점 4곳** 삽입. 기존 `recordIssueAssignedDateService`는 이 모듈에 **위임(순수 추출)** — 동작·응답 불변 |
| 프론트 | `taskHistory` 탭 등록자 셀 분기 + `coworkerProperty.js` getter 1개 + `taskHistory.transform.js` 필드 1개 |
| DB | **변경 없음** (Jira 이슈 엔티티 프로퍼티에만 기록) |
| manifest | **변경 없음** — `jira:entityProperty.values`는 *인덱스/searchAlias* 선언이며, 선언하지 않은 path 도 저장·조회된다. `assignedVia`는 JQL 검색 대상이 아니므로 선언 불필요 (KVS attributes 규칙과 혼동 금지) |
| i18n | `locales/kr/taskHistory.json`, `locales/en/taskHistory.json` (키 2개) |
| 권한 | **변경 없음** — 새 resolver가 없으므로 `PermissionMap` 등록 대상 없음 |

### ★ 조사에서 드러난 사실 — 경로는 4개가 아니라 **5개**다

요구사항은 4경로를 지목했으나, `sweepSubscription()`을 호출하는 곳이 **2곳**이다.

| # | 태깅 실행 지점 | 호출자 |
|---|---------------|--------|
| 1 | `src/queue/consumer.js` `backfillSubscription` → `setAppFieldValueForIssues` 직접 | 큐 컨슈머 |
| 2 | `src/resolver/projectSubscription/SubscriptionBackfill.js` 즉시 처리 → `applyTagging` | 구독 생성 resolver |
| 3 | `src/trigger/onIssueCreated.js` → `setAppFieldValueForIssues` 직접 | 이슈 생성 트리거 |
| 4 | `src/resolver/projectSubscription/SubscriptionSweeper.js` `sweepSubscription` → `applyTagging` | `src/trigger/subscriptionReconcile.js:74` (시간별 리컨실) |
| 5 | 〃 (같은 함수) | **`src/resolver/projectSubscription/ProjectSubscriptionService.js:571` `runSubscriptionSyncNowService`(수동 "지금 동기화")** |

→ **삽입은 4곳**이지만, 4번 삽입을 `subscriptionReconcile.js`가 아니라 **`sweepSubscription()` 내부**에
넣어야 5번(수동 동기화)까지 같은 판정을 통과한다. 트리거 쪽에 넣으면 수동 동기화로 편입된 이슈만
등록일이 비는 **형제 경로 우회**가 그대로 남는다 (CLAUDE.md 「동일 데이터 다중 경로」 교훈과 동형).

### 왜 `applyTagging()` 안이 아니라 호출 지점인가

`applyTagging`은 2·4번만 공유하고 1·3번은 `setAppFieldValueForIssues`를 직접 부른다. 즉 어차피
funnel 이 아니다. 게다가 이 리포지토리에는 **정확히 같은 형태의 선례**가 있다 —
`applyDefaultEstimate`(편입 후 best-effort 부수 효과)가 consumer.js:189 / SubscriptionBackfill.js:107 /
SubscriptionSweeper.js:178 / onIssueCreated.js:67 **네 곳에서 명시 호출**된다.
등록일 기록은 그 바로 옆줄에 같은 모양으로 붙는다(대조·검증이 쉽다).

---

## 2. 경계면 계약 (가장 중요)

신규 resolver가 없으므로 경계면은 **resolver 응답 shape 이 아니라 이슈 프로퍼티 `movesRms` 의 shape**이다.
백엔드가 생산하고 프론트가 `properties: ['movesRms']` 로 받아 소비한다.

### 2-1. `movesRms` 프로퍼티 shape (확정)

```jsonc
{
  "coworkers":     ["accountId", ...],   // 기존. 이번 변경과 무관 (merge 로 보존)
  "assignedAt":    "2026-08-11",         // date-only(yyyy-MM-dd). 인덱스/JQL 정렬용 (searchAlias: movesRmsAssignedAt)
  "assignedAtIso": "2026-08-11T04:12:33.123Z", // ISO 원본. 화면 표시용
  "assignedById":  "5b10a2...",          // 수동 등록 경로만. 구독 경로는 **키 자체를 쓰지 않는다**
  "assignedVia":   "subscription"        // ★ 신규. 구독 편입 경로만 기록. 수동/기존 이슈는 키 없음
}
```

### 2-2. 필드 공존 규칙 (구현자가 지켜야 할 불변식)

| 규칙 | 내용 |
|------|------|
| R1 | `assignedVia` 는 **`'subscription'` 한 값만** 쓴다. 수동 경로는 이 키를 **쓰지도 지우지도 않는다** |
| R2 | 구독 경로는 `assignedById` 를 **쓰지 않는다**. `...prev` 스프레드로 기존 값이 있으면 보존될 뿐 새로 넣지 않는다 (배치/트리거는 asApp 컨텍스트라 사람 accountId 가 없다) |
| R3 | `assignedAt` 이 이미 있으면 **전체 skip** — `assignedVia` 도 쓰지 않는다. "최초 등록 시점·등록자 유지"가 두 경로 공통 정책 |
| R4 | 따라서 **`assignedById` 와 `assignedVia` 는 동시에 새로 생기지 않는다.** 단, 과거에 프로젝트에서 해제된 뒤(프로퍼티는 남고 projectId 만 비워짐) 재편입되는 이슈는 R3 에 막혀 옛 `assignedById` 를 유지한다 → **프론트는 사용자 우선** 분기 |
| R5 | 쓰기는 항상 `readIssueProperty` → `{...prev, ...patch}` → `writeIssueProperty`(read-merge-write). `coworkers` 등 타 키 보존 |
| R6 | `assignedAt` 은 반드시 `slice(0,10)` date-only. ISO 를 넣으면 date 인덱스가 깨진다 |

### 2-3. 생산 ↔ 소비 대조표

| 프로퍼티 필드 | 생산(백엔드) | 소비(프론트) | 화면 결과 |
|--------------|-------------|-------------|-----------|
| `assignedAt` (date-only) | `AssignedDateRecorder.recordAssignedDateOnce` (구독 4지점) / `recordIssueAssignedDateService` (수동) | JQL `ORDER BY movesRmsAssignedAt DESC` (`TaskHistoryTable.buildJql`) | 최근 등록 순 정렬에 구독 이슈도 포함 |
| `assignedAtIso` | 〃 | `getIssueAssignedAtIso` → `normalizeIssue.assignedAtIso` | 등록일시 컬럼 `YYYY-MM-DD HH:mm` (없으면 "추적 전") |
| `assignedById` | 수동 경로만 | `getIssueAssignedById` → `normalizeIssue.assignedById` → `useUserInfos` lookup | 등록자 컬럼 `<UserAvatar>` |
| **`assignedVia`** | **구독 4지점만, 값 `'subscription'`** | **`getIssueAssignedVia`(신규) → `normalizeIssue.assignedVia`** | **등록자 컬럼 "구독" 배지** |
| (셋 다 없음) | — | — | 등록자 `-`, 등록일시 "추적 전" (기존 동작 유지) |

프론트 등록자 셀 분기 우선순위(고정):
`assignedById→user 조회 성공` **>** `assignedVia === 'subscription'` **>** `-`

---

## 3. 백엔드 설계

### 3-1. 신규 모듈 — `src/api/jira/issue/AssignedDateRecorder.js`

위치 근거: 이 디렉토리는 이미 `CoworkerResolver.js`·`ProjectIssuesFetcher.js` 같은
"이슈 API 위의 얇은 오케스트레이션"을 담고 있다. queue/trigger/resolver 어디서든 도메인 교차 없이
import 할 수 있고, 무거운 `ProjectUsersService.js` 를 트리거 번들로 끌고 들어가지 않는다.

```js
/** 구독 편입 마커 값 — 백엔드 단일 출처 */
export const ASSIGNED_VIA = { SUBSCRIPTION: 'subscription' };

/**
 * 등록일 최초 1회 기록 (best-effort / 비차단).
 * @param {object}   p
 * @param {string[]} p.issueIds     대상 이슈 id
 * @param {object|((prev:object)=>object)} [p.extra]  assignedAt/assignedAtIso 외 추가 patch
 * @param {number}   [p.concurrency=5]
 * @param {number}   [p.maxPerRun=200]  이번 실행 상한(초과분은 기록 안 함)
 * @param {object}   [p.budget]      SubscriptionSweeper.createBudget (있으면 exhausted 확인 + spend)
 * @param {string}   [p.logPrefix='[assignedDate]']
 * @returns {Promise<{recorded:number, skipped:number, capped:number}>}  ★ 절대 throw 하지 않는다
 */
export const recordAssignedDateOnce = async ({ issueIds, extra, concurrency = 5,
                                               maxPerRun = 200, budget, logPrefix }) => { ... }
```

동작(현행 `recordIssueAssignedDateService`:417-451 과 동일한 로직을 그대로 옮긴다):

1. `ids = 배열 정규화 → String → filter(Boolean)`. 빈 배열이면 즉시 `{recorded:0,skipped:0,capped:0}`
2. `isoNow = new Date().toISOString()`, `dateOnly = isoNow.slice(0,10)` — **호출당 1회 계산**(같은 배치는 같은 시각)
3. `maxPerRun` 초과분은 잘라내고 `capped` 에 개수만 담는다
4. `pLimit(concurrency)` 로 병렬. 이슈별로:
   - `budget?.exhausted()` 면 skip(+`budget` 미소진 시 `spend(2)`)
   - `prev = await readIssueProperty(id, 'app')`
   - `if (prev?.assignedAt) { skipped++; return; }` ← R3 가드
   - `patch = typeof extra === 'function' ? extra(prev) : (extra ?? {})`
   - `await writeIssueProperty(id, { ...prev, assignedAt: dateOnly, assignedAtIso: isoNow, ...patch }, 'app')`
   - `recorded++`
5. 이슈별 `try/catch` — 실패는 `console.error(logPrefix, id, e?.message)` 후 `skipped++`.
   **함수 자체는 절대 throw 하지 않는다** (호출부의 `.catch()` 는 방어용 이중 안전장치)

컨텍스트는 **`'app'` 고정**. 배치·트리거에 사용자 컨텍스트가 없고, 수동 경로도 이미 `'app'` 이다
(`ProjectUsersService.js:433`). 프로퍼티 write 권한은 앱 컨텍스트로 나간다(IssuePropertyApi 헤더 주석).

#### `maxPerRun` 상한의 의미 (설계 판단, 구현자 인지 필요)

리컨실/수동 동기화는 한 구독당 최대 2,000건까지 태깅할 수 있다. 기록은 이슈당 **read+write 2콜**이라
전량 기록하면 리컨실 예산(`MAX_REQUESTS=600`)을 즉시 태운다. → `maxPerRun=200` +
`budget` 인지로 제한한다. **상한을 넘겨 기록되지 못한 이슈는 다음 스윕이 다시 잡지 않는다**
(태깅된 이슈는 `IS EMPTY` 대상에서 빠지므로). 즉 등록일이 영구 공란으로 남는다.
이는 `applyDefaultEstimate`(`MAX_PER_RUN=200`)가 이미 안고 있는 동일한 한계이며, 대량 편입의
정상 경로는 큐 백필(배치당 50건, 전량 기록됨)이므로 **수용한다**. 상한을 키우는 것은 예산 재설계와
함께 해야 하는 별건이다.

### 3-2. 기존 수동 경로 — `recordIssueAssignedDateService` 위임 (순수 추출)

`src/resolver/projectIssue/ProjectUsersService.js:417-451` 를 다음으로 축약한다.

```js
export const recordIssueAssignedDateService = async ({issueIds, accountId}) => {
    const {recorded, skipped} = await recordAssignedDateOnce({
        issueIds,
        extra: (prev) => ({ assignedById: accountId ?? prev?.assignedById ?? null }),
        logPrefix: '[recordIssueAssignedDate] fail → skip',
    });
    return {recorded, skipped};   // 응답 shape 불변 (capped 는 노출하지 않는다)
};
```

- **정책은 무변경**이다(요구 §4). 마커를 쓰지 않고 `assignedById` 를 기록하는 동작이 그대로다.
  옮기는 것은 구현 위치뿐이며, 이렇게 해야 가드·merge·date-only 규칙이 **한 벌**로 유지된다.
- `maxPerRun` 기본값 200 은 수동 등록(모달 다중 선택)에서 도달할 일이 없다. 도달이 걱정되면
  이 호출에만 `maxPerRun: Infinity` 를 넘긴다 — **구현자 판단으로 명시적으로 넘길 것**.
- 기존 테스트 `src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js` 는
  `@forge/api` 를 모듈 레벨에서 mock 하므로 **수정 없이 그대로 통과해야 한다**. 통과하지 않으면
  추출이 순수하지 않은 것이니 되돌리고(수동 경로 원본 유지) 신규 모듈만 구독 경로에 쓴다 — 이것이 폴백이다.

### 3-3. 삽입 지점 4곳 (파일:라인)

공통 호출 형태:

```js
await recordAssignedDateOnce({
    issueIds: <해당 경로의 이슈 id 배열>,
    extra: { assignedVia: ASSIGNED_VIA.SUBSCRIPTION },
    logPrefix: '<경로 로그 프리픽스>',
    budget,                    // 있는 경로만
}).catch(e => console.error('<프리픽스> 등록일 기록 실패(무시)', e));
```

| # | 파일 | 삽입 위치 | issueIds | budget | 주의 |
|---|------|----------|----------|--------|------|
| 1 | `src/queue/consumer.js` | **186행 `await incrementTaggedRepository(...)` 바로 다음**, 188행 `if (sub.defaultEstimateSeconds)` 앞 (같은 `try` 블록 안) | `issueIds` (event.body, ≤50) | 없음 | `try` 안이지만 recorder 가 throw 하지 않으므로 `failCount`/재시도 판정에 영향 없다. 방어용 `.catch()` 필수 |
| 2 | `src/resolver/projectSubscription/SubscriptionBackfill.js` | **105행 `await incrementTaggedRepository(...)` 다음**, 107행 `if (sub.defaultEstimateSeconds)` 앞 (`if (result.tagged > 0)` 블록 안) | `eligible.map(i => i.issueId)` (≤50) | `budget` 전달 | 즉시 처리 상한이 50 이라 단일 청크 — `tagged>0` 이면 전량 태깅 성공 |
| 3 | `src/trigger/onIssueCreated.js` | **63행 `await incrementTaggedRepository(sub.sourceType, sub.sourceId, 1)` 다음**, 67행 `if (sub.defaultEstimateSeconds)` 앞 | `[evt.issueId]` | 없음 | 사이트 전 이슈 생성 핫패스지만, 여기까지 오는 것은 **구독 매칭·태깅에 성공한 이슈뿐**이라 추가 비용은 편입 1건당 2콜 |
| 4 | `src/resolver/projectSubscription/SubscriptionSweeper.js` | **`sweepSubscription` 내 178행 `if (apply.tagged > 0 && sub.defaultEstimateSeconds)` 블록 바로 앞** (169-174행 `applyTagging` 결과 직후) | `eligible.map(i => i.issueId)`, 조건 `apply.tagged > 0` | `budget` 전달 | ★ 여기 넣어야 리컨실 트리거(`subscriptionReconcile.js:74`) **와** 수동 동기화(`ProjectSubscriptionService.js:571`)가 동시에 커버된다 |

> 4번의 정밀도 트레이드오프: `applyTagging` 은 성공한 이슈 id 목록을 반환하지 않고 개수만 준다
> (`{tagged, failed, errors}`). 청크 일부가 실패한 경우 실패분까지 기록 대상에 포함될 수 있다.
> 결과는 "태깅은 다음 스윕에 되고 등록일은 이번 스윕 시각" 정도의 오차(최대 1주기)이고 값은 덮이지
> 않으므로(R3), **`applyTagging` 반환 계약을 바꾸지 않는다**. 계약 변경은 기존 테스트
> (`__test__/SubscriptionSweeper.test.js`)를 건드리는 비용 대비 이득이 없다.

### 3-4. 에러 처리

- 신규 `ErrorCodes` **없음**. 이 기능은 어떤 경우에도 에러를 상류로 올리지 않는다.
- 개별 실패는 `console.error` 만 남긴다(요구 §"진단 로그" — 성공 로그를 남기지 않는다).
- `src/index.js` 등록 변경 **없음**, `PermissionMap` 변경 **없음**.

### 3-5. 백엔드 테스트 (신규 1파일)

`src/api/jira/issue/__test__/AssignedDateRecorder.test.js` — 기존
`recordIssueAssignedDate.test.js` 의 `@forge/api` mock 패턴을 그대로 복제한다.

1. `assignedAt` 없는 이슈에 `assignedAt`(date-only) + `assignedAtIso` + `assignedVia:'subscription'` write, `assignedById` **키가 body 에 없음**
2. `assignedAt` 있는 이슈는 skip (PUT 0회) — 수동 등록 후 구독 재편입 시 미덮어씀
3. `coworkers` merge 보존
4. read/write 실패 시 throw 하지 않고 `skipped` 집계
5. `maxPerRun` 초과분 `capped` 집계

---

## 4. 프론트엔드 설계

신규 페이지·라우트·스토어·쿼리키 **없음**. React Query 키 변경 없음(`projectKeys.taskHistory` 그대로).
권한 체크 변경 없음(작업 이력 탭 진입 권한 그대로).

### 4-1. `static/ui/src/utils/jiraApi/coworkerProperty.js` — getter 추가

```js
/** 구독 편입 마커 값(백엔드 AssignedDateRecorder.ASSIGNED_VIA 와 같은 문자열). */
export const ASSIGNED_VIA_SUBSCRIPTION = 'subscription';

/** 편입 경로 마커('subscription') 또는 null. 수동 등록·도입 전 이슈는 null. */
export const getIssueAssignedVia = (issue) =>
    issue?.properties?.[MOVES_PROPERTY_KEY]?.assignedVia ?? null;
```
(파일 상단 프로퍼티 스키마 주석에 `assignedVia` 한 줄 추가)
**인라인 `issue.properties` 접근 금지 규약**에 따라 소비처는 반드시 이 getter만 쓴다.

### 4-2. `taskHistory.transform.js`

- `import` 에 `getIssueAssignedVia` 추가
- `export const assignedVia = (issue) => getIssueAssignedVia(issue);` (기존 `assignedBy`/`assignedAt` 과 동형)
- `normalizeIssue` 반환에 `assignedVia: assignedVia(issue),` 추가 (50-63행)
- 헤더 주석의 프로퍼티 스키마 설명에 `assignedVia` 한 줄 추가
- `buildBurnup`/`buildInsight`/`transformTaskHistory` **로직 변경 없음**
- 기존 `taskHistory.transform.test.js` 는 `normalizeIssue` 결과를 `toEqual` 로 비교하는 케이스가 있으면
  키 추가로 깨질 수 있다 — **구현자는 이 테스트를 먼저 확인하고 필요한 만큼만 기대값을 보강**한다

### 4-3. `TaskHistoryTable.jsx` — 등록자 셀 분기 (핵심)

**141-146행** `{ key: 'assignedBy', ... }` 셀만 바꾼다.

```jsx
// 124행 근처 rows useMemo 안
const assignedUser = it.assignedById ? userMap[it.assignedById] : null;
const viaSubscription = it.assignedVia === ASSIGNED_VIA_SUBSCRIPTION;
...
{
    key: 'assignedBy',
    content: assignedUser
        ? <UserAvatar response={assignedUser} />
        : viaSubscription
            ? <Lozenge appearance="default">{t('taskHistory.table.assignedBySubscription')}</Lozenge>
            : <span style={{ color: token("color.text.subtle", "#6B778C") }}>-</span>,
}
```

- 분기 순서는 §2-3 우선순위 고정 — 사용자 우선(R4 의 재편입 케이스에서 옛 등록자를 살린다)
- `Lozenge` 는 `@atlaskit/lozenge`(Atlaskit 네이티브 수렴 원칙, RFC-178). 색은 `appearance="default"` —
  상태 배지(`StatusComponent`)와 색으로 경쟁하지 않게 한다
- 툴팁을 붙일 경우 `@atlaskit/tooltip` 으로 `taskHistory.table.assignedBySubscriptionTip` 을 감싼다(선택)
- `accountIds`/`useUserInfos` 로직 **변경 없음** — `assignedById` 없는 구독 이슈는 애초에 lookup 대상이 아니다
- `등록일시` 셀·`tracked` 판정 **변경 없음** — 기록이 생기면 자동으로 "추적 전"에서 벗어난다

### 4-4. 등록자 필터 상호작용 — **없음 (확인 완료)**

`components/project/ProjectFilter.jsx` 의 필터는 텍스트 / 스페이스(project) / **담당자(assignee)** /
상태카테고리 4종이며 **등록자(assignedBy) 필터는 존재하지 않는다.** 또한 `TaskHistoryTable` 의 필터는
서버 JQL(`generateJQL`)로 나가므로, 클라이언트에서 "구독" 값만 거르는 필터는 애초에 넣을 수 없다.
→ 이번 범위에서 필터 관련 변경은 없다. (향후 "등록자=구독" JQL 필터가 필요해지면 manifest
`jira:entityProperty.values` 에 `assignedVia` + `searchAlias` 를 선언하고 `forge deploy` 해야 한다 — 별건.)

### 4-5. 부수 효과 (의도된 것, 코드 변경 없음)

구독 편입 이슈가 등록일을 갖게 되면서 `transformTaskHistory` 의 `tracked` 로 분류된다.
→ 번업 곡선과 인사이트의 "추가 공수(scope creep)"에 구독 편입분이 잡히고, "추적 전" 건수가 줄어든다.
구독 편입은 실제 스코프 증가이므로 **의도한 결과**다. 기존에 편입된 이슈는 소급되지 않으므로
이 변화는 **적용 시점 이후 편입분부터** 점진적으로 나타난다.

---

## 5. DB 설계

**해당 없음.** MySQL 테이블·KVS 엔티티·마이그레이션 모두 변경 없음.
저장소는 Jira 이슈 엔티티 프로퍼티(`movesRms`) 한 곳뿐이다.

---

## 6. i18n 키 목록

`locales/kr/taskHistory.json` / `locales/en/taskHistory.json` 의 **`table` 블록**에 추가.
추가 후 `cd static/ui && npm run merge` 실행 (`ko-KR.json`·`en-US.json` 직접 수정 금지).

| 키 | kr | en | 필수 |
|----|----|----|------|
| `table.assignedBySubscription` | `구독` | `Subscription` | 필수 |
| `table.assignedBySubscriptionTip` | `구독 규칙으로 자동 편입된 작업입니다.` | `Added automatically by a subscription rule.` | 선택(툴팁을 붙일 때만) |

호출은 `t('taskHistory.table.assignedBySubscription')`.

---

## 7. 구현 작업 분해

### backend

- [ ] B1. `src/api/jira/issue/AssignedDateRecorder.js` 신규 — `ASSIGNED_VIA`, `recordAssignedDateOnce` (§3-1). throw 금지, `'app'` 컨텍스트, `pLimit(5)`, `maxPerRun=200`, budget 인지
- [ ] B2. `src/resolver/projectIssue/ProjectUsersService.js:417-451` → B1 위임으로 축약 (§3-2). **응답 `{recorded, skipped}` 불변**. 기존 테스트 무수정 통과가 조건, 아니면 원복(폴백)
- [ ] B3. `src/queue/consumer.js:186` 다음 — 기록 호출 삽입 (issueIds, budget 없음)
- [ ] B4. `src/resolver/projectSubscription/SubscriptionBackfill.js:105` 다음 — 삽입 (eligible ids, budget 전달)
- [ ] B5. `src/trigger/onIssueCreated.js:63` 다음 — 삽입 (`[evt.issueId]`)
- [ ] B6. `src/resolver/projectSubscription/SubscriptionSweeper.js:178` 앞 — `sweepSubscription` 내부 삽입 (eligible ids, `apply.tagged > 0` 조건, budget 전달) ← 리컨실 + 수동 동기화 동시 커버
- [ ] B7. `src/api/jira/issue/__test__/AssignedDateRecorder.test.js` 신규 (§3-5, 5케이스)
- [ ] B8. `src/api/jira/issue/IssuePropertyApi.js` 상단 스키마 주석에 `assignedVia` 한 줄 추가 (계약 문서화)
- [ ] B9. 루트 `npm test` 통과 — 특히 `recordIssueAssignedDate.test.js`, `SubscriptionSweeper.test.js` 무회귀

### frontend

- [ ] F1. `static/ui/src/utils/jiraApi/coworkerProperty.js` — `ASSIGNED_VIA_SUBSCRIPTION`, `getIssueAssignedVia` 추가 + 스키마 주석
- [ ] F2. `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` — `assignedVia` export + `normalizeIssue` 필드 추가
- [ ] F3. `TaskHistoryTable.jsx` 등록자 셀 3분기 (사용자 > 구독 Lozenge > `-`), `@atlaskit/lozenge` import
- [ ] F4. `locales/kr/taskHistory.json` + `locales/en/taskHistory.json` 키 추가 → `cd static/ui && npm run merge`
- [ ] F5. `taskHistory.transform.test.js` 기대값 확인/보강 (키 추가로 깨지는 경우만)
- [ ] F6. `cd static/ui && CI=true npm run build` 통과

### 비목표 (하지 않는다)

- 수동 등록 경로의 **정책** 변경 (마커 부여, `assignedById` 제거 등) — 없음
- 신규 resolver / `PermissionMap` 등록 / manifest 수정 — 없음
- **기존에 이미 편입된 이슈의 소급 기록** — 없음.
  판단: 향후 리컨실도 이를 보정하지 **않는다**. 리컨실 대상 JQL 이 `moves_RMS_projectId IS EMPTY`
  이므로 이미 태깅된 이슈는 스윕 결과집합에 다시 들어오지 않는다 → 과거 편입분은 영구히 "추적 전"으로
  남는다. 소급이 필요하면 별도 일회성 백필 작업이 필요하다(별건).
- 등록자 기준 필터/JQL searchAlias 추가 — 없음 (§4-4)

---

## 8. 검증 기준 (integration-verifier 용)

| # | 항목 | 확인 방법 |
|---|------|----------|
| V1 | 기록 호출이 **4지점 전부**에 있는가 | `recordAssignedDateOnce` 를 `src/` 전역 grep → consumer.js / SubscriptionBackfill.js / onIssueCreated.js / SubscriptionSweeper.js + ProjectUsersService.js(수동 위임) = 5건 |
| V2 | 형제 경로 우회가 없는가 | `setAppFieldValueForIssues`·`applyTagging` 호출 지점을 전수 grep 해, 구독 태깅을 하는 모든 지점 뒤에 기록이 붙었는지 대조. **수동 동기화(`runSubscriptionSyncNowService`)가 `sweepSubscription` 경유로 커버되는지 반드시 확인** |
| V3 | 기록 실패가 본 작업을 죽이지 않는가 | recorder 가 어떤 경로로도 throw 하지 않는지(내부 try/catch) + 호출부 `.catch()` 존재. 특히 consumer.js 의 `failCount`/`retryCondition` 판정에 영향 없음 |
| V4 | skip 가드 | 수동 등록 후 구독 재편입 시 `assignedAt`·`assignedById` 불변, `assignedVia` 도 안 붙음 |
| V5 | 프로퍼티 계약 준수 | 구독 write body 에 `assignedById` 키가 **없고**, `assignedAt` 이 `yyyy-MM-dd`, `coworkers` 보존 |
| V6 | 프론트 3분기 | 마커 이슈 → "구독" / `assignedById` 이슈 → 기존 아바타 / 둘 다 없음 → `-` 유지 |
| V7 | 소비 경로 단일성 | 프론트가 `issue.properties` 를 인라인 접근하지 않고 `getIssueAssignedVia` 만 쓰는가 |
| V8 | 빌드/테스트 | 루트 `npm test` + `cd static/ui && CI=true npm run build` |
| V9 | i18n | `locales/kr`·`locales/en` 양쪽에 키가 있고 `npm run merge` 결과 `ko-KR.json`/`en-US.json` 에 반영 |
