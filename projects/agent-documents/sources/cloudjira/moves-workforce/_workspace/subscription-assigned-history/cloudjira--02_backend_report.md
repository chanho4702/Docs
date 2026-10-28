# 구독 편입 이슈 등록이력 보완 — 백엔드 구현 리포트

> 설계서: `_workspace/subscription-assigned-history/01_architect_design.md` §7 backend (B1~B9)
> 구현일: 2026-08-11 / 브랜치 `develop`
> **신규 resolver 없음** → `src/index.js`·`PermissionMap.js`·`manifest.yml` **무변경**(설계대로).

---

## 1. 구현 파일 목록

| B# | 파일 | 종류 | 요약 |
|----|------|------|------|
| B1 | `src/api/jira/issue/AssignedDateRecorder.js` | **신규** | `ASSIGNED_VIA`, `recordAssignedDateOnce` |
| B2 | `src/resolver/projectIssue/ProjectUsersService.js` | 수정 | `recordIssueAssignedDateService` → B1 위임(순수 추출). import 정리(`pLimit`·`readIssueProperty`·`writeIssueProperty` 제거, `mergeIssueProperty`만 유지) |
| B3 | `src/queue/consumer.js` | 수정 | 큐 백필 배치 태깅 직후 기록 삽입 |
| B4 | `src/resolver/projectSubscription/SubscriptionBackfill.js` | 수정 | 즉시 처리(≤50건) 태깅 직후 기록 삽입 |
| B5 | `src/trigger/onIssueCreated.js` | 수정 | 이슈 생성 즉시 편입 직후 기록 삽입 |
| B6 | `src/resolver/projectSubscription/SubscriptionSweeper.js` | 수정 | `sweepSubscription` **내부**에 기록 삽입 |
| B7 | `src/api/jira/issue/__test__/AssignedDateRecorder.test.js` | **신규** | 5케이스 |
| B8 | `src/api/jira/issue/IssuePropertyApi.js` | 수정 | 상단 스키마 주석에 `assignedVia` + 공존 규칙 명시 |

---

## 2. 신규 모듈 계약 — `AssignedDateRecorder.js`

```js
export const ASSIGNED_VIA = { SUBSCRIPTION: 'subscription' };

export const recordAssignedDateOnce = async ({
    issueIds,               // Array<string|number> | string | number | null
    extra,                  // object | ((prev:object) => object)  — 선택
    concurrency = 5,
    maxPerRun = 200,
    budget,                 // SubscriptionSweeper.createBudget — 선택
    logPrefix = '[assignedDate]',
} = {}) => { /* ... */ };
```

**반환 shape (글자 그대로):**

```js
{ recorded: number, skipped: number, capped: number }
```

- 빈 입력 → `{ recorded: 0, skipped: 0, capped: 0 }`
- `capped = 정규화된 id 수 - maxPerRun` (음수 없음). 초과분은 **호출하지 않는다**
- **절대 throw 하지 않는다** — 이슈별 `try/catch` 로 흡수, 실패는 `console.error(logPrefix, id, e?.message)` + `skipped++`
- 컨텍스트 `'app'` 고정, 동시성 `pLimit(concurrency)`
- `isoNow`/`dateOnly` 는 **호출당 1회** 계산 → 같은 배치는 같은 시각

---

## 3. `movesRms` 이슈 프로퍼티에 실제로 쓰는 shape (글자 그대로)

PUT body 는 항상 `{ ...prev, assignedAt, assignedAtIso, ...patch }` 이다.

### 3-1. 구독 편입 4경로 (`extra = { assignedVia: ASSIGNED_VIA.SUBSCRIPTION }`)

```jsonc
{
  "coworkers":     ["5b10a2...", "..."],          // prev 에 있던 경우만 (merge 보존)
  "assignedAt":    "2026-08-11",                  // date-only, yyyy-MM-dd
  "assignedAtIso": "2026-08-11T04:12:33.123Z",    // new Date().toISOString()
  "assignedVia":   "subscription"                 // 값은 이 하나뿐
}
```
→ **`assignedById` 키는 body 에 존재하지 않는다** (`prev` 에 있었으면 스프레드로 보존될 뿐 새로 넣지 않는다).
테스트에서 `expect('assignedById' in body).toBe(false)` 로 고정했다.

### 3-2. 수동 등록 경로 (`recordIssueAssignedDateService`, 정책 무변경)

```jsonc
{
  "coworkers":     ["..."],                       // merge 보존
  "assignedAt":    "2026-08-11",
  "assignedAtIso": "2026-08-11T04:12:33.123Z",
  "assignedById":  "5b10a2..."                    // accountId ?? prev.assignedById ?? null
}
```
→ **`assignedVia` 키를 쓰지도 지우지도 않는다.**

### 3-3. 불변식 확인 (R1~R6)

| 규칙 | 구현 상태 |
|------|-----------|
| R1 `assignedVia`는 `'subscription'` 한 값 | ✔ `ASSIGNED_VIA` 상수 단일 출처 |
| R2 구독 경로는 `assignedById` 미기록 | ✔ 테스트로 고정 |
| R3 `prev.assignedAt` 있으면 **전체 skip**(`assignedVia`도 미기록) | ✔ read 직후 가드, PUT 0회 |
| R4 `assignedById`·`assignedVia` 동시 신규 생성 없음 | ✔ R3의 귀결 |
| R5 read-merge-write | ✔ `readIssueProperty` → `{...prev, ...}` → `writeIssueProperty` |
| R6 `assignedAt`은 `slice(0,10)` date-only | ✔ 테스트 정규식 `/^\d{4}-\d{2}-\d{2}$/` |

---

## 4. 삽입 지점 4곳 — 실제 최종 위치

| # | 파일:라인 | 앵커 | issueIds | budget | logPrefix |
|---|-----------|------|----------|--------|-----------|
| 1 | `src/queue/consumer.js:189-195` | `await incrementTaggedRepository(...)`(187) 다음, `if (sub.defaultEstimateSeconds)`(197) 앞 — 같은 `try` 블록 | `issueIds` (event.body, ≤50) | 없음 | `[SUBSCRIPTION BACKFILL] 등록일 기록 실패(무시)` |
| 2 | `src/resolver/projectSubscription/SubscriptionBackfill.js:108-114` | `if (result.tagged > 0)`(106) 블록 안, `incrementTaggedRepository`(107) 다음 | `eligible.map(i => i.issueId)` (≤50) | ✔ 전달 | `[SUBSCRIPTION BACKFILL] 등록일 기록 실패(무시)` |
| 3 | `src/trigger/onIssueCreated.js:66-72` | `incrementTaggedRepository(sub..., 1)`(64) 다음, `if (sub.defaultEstimateSeconds)`(77) 앞 | `[evt.issueId]` | 없음 | `[SUBSCRIPTION EVENT] 등록일 기록 실패(무시)` |
| 4 | `src/resolver/projectSubscription/SubscriptionSweeper.js:176-189` | `sweepSubscription` 내 `applyTagging`(170-175) 직후, `if (apply.tagged > 0 && sub.defaultEstimateSeconds)`(191) 앞. 조건 `if (apply.tagged > 0)` | `eligible.map(i => i.issueId)` | ✔ 전달 | `[SUBSCRIPTION] 등록일 기록 실패(무시)` |

import 추가 위치: `consumer.js:14`, `SubscriptionBackfill.js:24`, `onIssueCreated.js:20`, `SubscriptionSweeper.js:20`, `ProjectUsersService.js:18`.

전 지점에 방어용 `.catch(e => console.error(...))` 부착(모듈 자체가 throw하지 않는 이중 안전장치).

### V1/V2 자체 검증 결과 (grep)

`recordAssignedDateOnce` 호출 지점 = **5건** (구독 4 + 수동 위임 1). 설계 §8 V1 충족.

구독 태깅을 실행하는 지점을 전수 grep(`setAppFieldValueForIssues(` / `applyTagging(` / `sweepSubscription(`)한 결과:

| 태깅 지점 | 기록 커버 |
|-----------|-----------|
| `consumer.js:182` | ✔ #1 |
| `SubscriptionBackfill.js:98` (`applyTagging`) | ✔ #2 |
| `SubscriptionSweeper.js:170` (`applyTagging`, `sweepSubscription` 내) | ✔ #4 |
| `onIssueCreated.js:58` | ✔ #3 |
| `subscriptionReconcile.js:74` → `sweepSubscription` | ✔ #4 경유 |
| **`ProjectSubscriptionService.js:571` → `sweepSubscription` (수동 "지금 동기화")** | ✔ **#4 경유** — 형제 경로 우회 없음 |
| `ProjectUsersService.js:278/293` (`updateProjectIdFieldService`/`deleteProjectIssueService`) | 구독 경로 아님(수동 작업 등록/해제). 수동 등록은 별도로 `recordIssueAssignedDateService` 호출 — 기존 동작 그대로 |

---

## 5. 테스트 결과

### 5-1. 루트 전체 `npm test`

```
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
Snapshots:   0 total
Time:        26.575 s
```

### 5-2. 무회귀 확인 (설계 B9 지정 대상 + 신규)

```
PASS src/api/jira/issue/__test__/AssignedDateRecorder.test.js          (신규 5케이스)
PASS src/resolver/projectSubscription/__test__/SubscriptionSweeper.test.js
PASS src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js  ← 무수정 통과
Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total
```

**`recordIssueAssignedDate.test.js` 는 한 글자도 고치지 않고 통과했다** → 추출이 순수했음이 확인됐고,
설계 §3-2 의 폴백(수동 경로 원복)은 **발동하지 않았다**.

### 5-3. 신규 테스트 5케이스

1. 등록일 없는 이슈 → date-only `assignedAt` + `assignedAtIso` + `assignedVia:'subscription'` write, `assignedById` 키 부재
2. `assignedAt` 있는 이슈 → 전체 skip, PUT 0회 (수동 등록 후 재편입 미덮어씀)
3. `coworkers` merge 보존
4. read 실패 / write 실패 모두 throw 없이 `skipped` 집계 (read 실패 이슈는 PUT 시도조차 안 함)
5. `maxPerRun` 초과분 `capped` 집계 + 초과분 미호출

---

## 6. 설계 대비 이탈 / 구현 판단

| # | 항목 | 설계 | 구현 | 사유 |
|---|------|------|------|------|
| D1 | budget 소진 | "`budget` 미소진 시 `spend(2)`" | **호출 직전 `spend(1)` × 2회**(read 앞, write 앞) | skip(등록일 기존) 케이스는 read 1콜만 나가므로 정확히 과금된다. 총량은 설계와 동일(최대 2), 예산 소진은 오히려 더 정확. 실패 시 중복 과금 없음 |
| D2 | 수동 경로 `maxPerRun` | "도달 걱정되면 `Infinity` — 구현자 판단으로 명시" | **`maxPerRun: Infinity` 명시** | 수동 등록의 기존 동작(요청 전량 기록)을 상한으로 조용히 바꾸지 않기 위해. `{recorded, skipped}` 응답 불변 보장 |
| D3 | `ProjectUsersService` import | 언급 없음 | `pLimit`·`readIssueProperty`·`writeIssueProperty` **import 제거**(추출로 미사용화), `mergeIssueProperty` 유지 | 미사용 import 잔류 방지. `mergeIssueProperty` 는 `updateIssueCoworkers`(399행)에서 계속 쓴다 |
| D4 | Sweeper 삽입 조건 | `apply.tagged > 0` | 동일. 단 `defaultEstimateSeconds` 조건과 **분리된 독립 `if` 블록** | 등록일 기록은 예상시간 설정 여부와 무관하게 항상 필요 |

**설계 대비 기능적 이탈은 없다.** 프로퍼티 shape·응답 shape·삽입 지점·throw 금지 계약 전부 설계 그대로다.

---

## 7. 프론트엔드에 전달할 사실 (F1~F3 소비 계약)

- 마커 값 문자열: **`'subscription'`** (`AssignedDateRecorder.ASSIGNED_VIA.SUBSCRIPTION`)
  → `coworkerProperty.js` 의 `ASSIGNED_VIA_SUBSCRIPTION` 을 이 문자열과 **글자 그대로** 맞출 것
- 프로퍼티 키: `movesRms` (`MOVES_PROPERTY_KEY`), 필드 경로 `properties.movesRms.assignedVia`
- 구독 편입 이슈는 **`assignedById` 가 없다** → `useUserInfos` lookup 대상이 아니며 셀 분기의 첫 조건에서 자연히 탈락
- 재편입(과거 수동 등록 → 프로젝트 해제 → 구독 재편입) 이슈는 **옛 `assignedById` 를 그대로 갖고 `assignedVia` 는 없다** → 설계 §2-3 우선순위(사용자 > 구독 > `-`)가 맞다
- `assignedAt` 은 항상 `yyyy-MM-dd`, 표시용 시각은 `assignedAtIso`
- 소급 없음 — 이 배포 **이후 편입분부터** 마커가 생긴다. 기존 편입 이슈는 계속 "추적 전"

---

## 8. 남은 범위 밖 사항 (건드리지 않음, 리더 지시)

별도 감사에서 나온 구독 기능 기존 결함(컨슈머 재시도 조건, job 완결 처리, `IS EMPTY` 재확인 등)은
이번 작업 범위가 아니므로 **수정하지 않았다.** 삽입만 수행했다.

---

## 9. 수정 이력 — 검증 지적 반영 (2026-08-11, 통합 검증 `03_verify_report.md` 실패 1건)

### 9-1. 지적 내용 (타당 — 수용)

recorder 호출을 `applyDefaultEstimate` **앞**에 둔 탓에 **같은 `budget` 을 공유하는 두 부수 효과의
우선순위가 뒤집혀 있었다.**

- recorder 는 이슈당 2요청을 쓴다(최대 `maxPerRun=200` × 2 = **400요청**).
- 수동 "지금 동기화"·즉시 백필의 예산은 **40요청**(`SCAN_BUDGET.maxRequests`)뿐이다.
- recorder 가 전액을 태우면 뒤이은 `DefaultEstimateApplier` 가 `findEmptyEstimateIssues` 첫 루프에서
  `budget?.exhausted()` 로 즉시 `break` → **예상 시간 0건 적용**.
- 해당 이슈는 이미 태깅됐으므로 `moves_RMS_projectId IS EMPTY` 스윕 결과집합에 다시 들어오지 않는다
  → **예상 시간이 영구 미적용**으로 남는다.

두 부수 효과의 성질이 다르다: **예상 시간은 이번 실행이 놓치면 영구 누락**이지만
**등록일은 best-effort 부가 정보**다(놓쳐도 화면이 "추적 전"으로 보일 뿐). 따라서 예산은 예상 시간이 먼저 쓴다.

### 9-2. 수정 내용 — 순서 이동만 (예산 로직 변경 없음)

| 파일 | 변경 | 최종 위치 |
|------|------|-----------|
| `src/resolver/projectSubscription/SubscriptionSweeper.js` | recorder 블록을 `applyDefaultEstimate` 블록 **뒤로 이동** + 우선순위 근거 주석 | `applyDefaultEstimate` **178-185** → `recordAssignedDateOnce` **192-204** |
| `src/resolver/projectSubscription/SubscriptionBackfill.js` | 동일 | `applyDefaultEstimate` **108-114** → `recordAssignedDateOnce` **116-126** |
| `src/queue/consumer.js` | **무변경** | budget 미전달 경로(예산 경합 없음) |
| `src/trigger/onIssueCreated.js` | **무변경** | budget 미전달 경로(편입 1건당 2콜) |

- 조건식·인자·`logPrefix`·`.catch()` 는 그대로다. **블록 순서만** 바꿨다.
- `maxPerRun` 을 `budget.remainingRequests()` 에 연동하는 선택 항목은 **하지 않았다**(리더 지시 5 — 과잉 방지).
  순서 이동만으로 "예상 시간이 예산을 먼저 쓴다"는 목적이 달성되고, 남은 예산이 없으면 recorder 는
  `budget.exhausted()` 로 조용히 `skipped` 처리된다(기존 동작).

### 9-3. 재검증

```
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
Time:        17.52 s
```

무회귀. §4 표의 삽입 지점 라인 번호는 이 이동으로 갱신됐다 — **§9-2 표가 최신 위치**다.
