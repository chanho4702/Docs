# 구독 편입 이슈 등록이력 보완 — 통합 검증 리포트

> 검증 기준: `01_architect_design.md` §8(V1~V9) + §2 경계면 계약/불변식 R1~R6
> 대상 구현: `02_backend_report.md`(B1~B9) / `02_frontend_report.md`(F1~F6)
> 검증일: 2026-08-11 / 브랜치 `develop` (작업 트리 미커밋 상태)
> 검증 방식: 생산자·소비자 **양쪽 동시 읽기** + 전역 grep + 테스트/빌드 실행

## 총평

> **최종 판정: 전체 통과** (2026-08-11 재검증 — F-1 수정 확인)

| 분류 | 건수 | 항목 |
|------|------|------|
| **통과** | 9 / 9 (V1~V9) + 수동 경로 회귀 + 마커 리터럴 일치 + **F-1 수정 확인** | §1, §2 |
| **실패** | **0건** | 최초 지적 1건(F-1 공유 예산 경합)은 백엔드 수정으로 해소 — §2 |
| **미검증** | 2 | §3 (실제 Jira 환경 E2E, 큐 컨슈머 실행 경로) |

기능 자체(V1~V9)는 설계대로 전부 맞다. 1차 검증에서 **기존 기능(`applyDefaultEstimate`)과 예산을
공유하는 지점에 새 호출을 앞에 끼워 넣어** 기존 기능이 조용히 죽는 경로를 발견했고(설계서 §8 표 밖 —
설계는 recorder **자신의** 비용만 검토했다), 백엔드가 호출 순서를 뒤집어 해소했다. 재검증에서 순서·조건·
인자·`.catch()`·V1/V2/V3 무회귀와 루트 테스트 1110건 통과를 직접 확인했다.

---

## 1. 통과 항목

### V1 — 기록 호출 4지점 전부 (통과)

`recordAssignedDateOnce` 전역 grep = **호출 5건**(정의·테스트·주석 제외).

| # | 호출 지점 | issueIds | budget | `.catch()` |
|---|----------|----------|--------|-----------|
| 1 | `src/queue/consumer.js:191` | `issueIds`(event.body ≤50) | 없음 | ✔ :195 |
| 2 | `src/resolver/projectSubscription/SubscriptionBackfill.js:109` | `eligible.map(i => i.issueId)` | ✔ :112 | ✔ :114 |
| 3 | `src/trigger/onIssueCreated.js:68` | `[evt.issueId]` | 없음 | ✔ :72 |
| 4 | `src/resolver/projectSubscription/SubscriptionSweeper.js:184` (`sweepSubscription` 내부, `if (apply.tagged > 0)` :183) | `eligible.map(i => i.issueId)` | ✔ :187 | ✔ :189 |
| 5 | `src/resolver/projectIssue/ProjectUsersService.js:420` (수동 위임) | payload | 없음 | — (호출부 IssueAddModal 이 try/catch) |

전 지점이 `extra: {assignedVia: ASSIGNED_VIA.SUBSCRIPTION}`(수동만 `extra: (prev)=>({assignedById...})`)를 쓴다.

### V2 — 형제 경로 우회 없음 (통과)

`setAppFieldValueForIssues` / `applyTagging` / `sweepSubscription` 호출 지점 전수 대조:

| 태깅 실행 지점 | 기록 커버 | 확인 |
|---------------|----------|------|
| `consumer.js:182` | #1 | 같은 `try` 블록 안, 태깅 직후 |
| `SubscriptionBackfill.js:98` (`applyTagging`) | #2 | `result.tagged > 0` 블록 안 |
| `SubscriptionSweeper.js:122` (`applyTagging` 내부) | #2·#4 | 호출자 양쪽에 삽입 |
| `SubscriptionSweeper.js:170` (`sweepSubscription` 내 `applyTagging`) | #4 | 바로 다음 블록 |
| `onIssueCreated.js:58` | #3 | 태깅 직후 |
| `subscriptionReconcile.js:74` → `sweepSubscription` | #4 경유 | 트리거 코드 무변경 |
| **`ProjectSubscriptionService.js:571` → `sweepSubscription` (수동 "지금 동기화")** | **#4 경유** | ★ 설계 의도대로 `sweepSubscription` **내부** 삽입이라 수동 동기화도 자동 커버. 트리거에 넣었을 때 생겼을 우회 없음 |
| `ProjectUsersService.js:278/293` | 해당 없음 | 구독 경로 아님(수동 등록/해제). 등록은 별도 `recordIssueAssignedDate` resolver 로 기존 그대로 |

### V3 — 기록 실패가 본 작업을 죽이지 않음 (통과)

- `AssignedDateRecorder.js:86-105` — 이슈별 `try/catch`가 read/write 예외를 전부 흡수하고 `skipped++`.
  `Promise.all` 에 넘기는 태스크가 reject 되지 않으므로 **함수는 throw 하지 않는다**. 신규 테스트
  `AssignedDateRecorder.test.js:87-105`(read 500 / write 500)가 이를 고정한다.
- `consumer.js:191` 은 `try` 블록 안에 있으나 recorder 가 throw 하지 않아 `failCount`(:207)·
  `retryCondition`(:221-228) 판정에 영향 없다. 추가로 `.catch()`(:195)가 이중 안전장치.
- `onIssueCreated.js` 는 함수 전체가 catch-all(:84-87)이라 트리거 재시도 폭주 위험 없음.
- 참고(무해): `AssignedDateRecorder.js:84` 의 `budget?.exhausted()` 와 :66-73 정규화는 try 밖이다.
  `createBudget()` 산출 객체만 전달되므로 실현 가능한 throw 는 없고, 호출부 `.catch()`가 마지막 방어선이다.

### V4 — skip 가드 (통과)

`AssignedDateRecorder.js:88-91`: `prev = read` → `if (prev?.assignedAt) { skipped++; return; }` 가
`patch` 계산(:91)·`write`(:94)보다 **앞**이다. 따라서 재편입 이슈는 `assignedAt`·`assignedAtIso`·
`assignedById` 가 그대로 남고 `assignedVia` **도 붙지 않는다**(R3·R4).
테스트 `AssignedDateRecorder.test.js:54-67` — PUT 0회 단언.

### V5 — 프로퍼티 계약 준수 (통과, R1~R6 전부)

| 규칙 | 근거 |
|------|------|
| R1 `assignedVia`='subscription' 단일값 | `AssignedDateRecorder.js:29` 상수 단일 출처, 전 호출부가 이 상수 사용 |
| R2 구독 경로 `assignedById` 미기록 | write body 는 `{...prev, assignedAt, assignedAtIso, ...patch}`(:94-99), patch 에 `assignedById` 없음. 테스트 `:51` `expect('assignedById' in body).toBe(false)` |
| R3 기존 `assignedAt` 이면 전체 skip | 위 V4 |
| R4 동시 신규 생성 없음 | R3 의 귀결 — 새로 쓰는 순간엔 `prev.assignedAt` 이 없고 patch 는 한쪽만 담는다 |
| R5 read-merge-write | `readIssueProperty(id,'app')`(:88) → 스프레드(:95) → `writeIssueProperty`(:94). 테스트 `:69-85` `coworkers` 보존 |
| R6 date-only | `dateOnly = isoNow.slice(0,10)`(:77), 테스트 `:48` `/^\d{4}-\d{2}-\d{2}$/` |

`IssuePropertyApi.js:4-14` 스키마 주석도 `assignedVia` + 공존 규칙으로 갱신됨(B8).

### V6 — 프론트 3분기 우선순위 (통과)

`static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx:128-153`

```jsx
const assignedUser = it.assignedById ? userMap[it.assignedById] : null;   // 128
const viaSubscription = it.assignedVia === ASSIGNED_VIA_SUBSCRIPTION;    // 131
...
content: assignedUser ? <UserAvatar .../>
       : viaSubscription ? <SemanticBadge appearance="neutral">{t('taskHistory.table.assignedBySubscription')}</SemanticBadge>
       : <span ...>-</span>                                              // 149-152
```

설계 §2-3 고정 순서(사용자 > 구독 > `-`)와 일치. `accountIds`(:104-107)·`useUserInfos`·
`assignedAt` 셀·`tracked` 판정 무변경 확인.

데이터 공급 경로도 정상: `fetchPage` 가 `properties: ['movesRms']`(:68)를 요청하므로 `assignedVia` 가
응답에 실려 온다(별도 필드 요청 불필요).

**배지 컴포넌트 이탈은 검증상 문제 없음** — `@atlaskit/lozenge` 는 실제로 미설치이고
`components/lozenge/SemanticBadge.jsx:15` 주석이 "미설치 환경용 경량 구현"임을 명시한다.
`appearance="neutral"` = `color.background.neutral`(SemanticBadge.jsx:22)로 Lozenge `default` 와 동톤.
(참고: `SemanticBadge` 는 `textTransform:'uppercase'`(:36) 라 영문에서 `SUBSCRIPTION` 으로 보인다 —
기존 배지들과 동일한 표기라 결함 아님.)

### V7 — 소비 경로 단일성 (통과)

`static/ui/src` 전역 grep(`properties.movesRms` / `properties?.[MOVES`) 결과, 실제 접근 코드는
`utils/jiraApi/coworkerProperty.js:22,26,30,37` **네 getter 뿐**이고 나머지 매치는 전부 주석이다.
`taskHistory.transform.js:39,68` 은 `getIssueAssignedVia` 경유, `TaskHistoryTable.jsx:131` 은
정규화된 `it.assignedVia` 를 읽는다. 인라인 접근 0건.

### 마커 문자열 리터럴 일치 (통과)

| 측 | 파일:라인 | 값 |
|----|-----------|-----|
| 백엔드 | `src/api/jira/issue/AssignedDateRecorder.js:29` | `export const ASSIGNED_VIA = { SUBSCRIPTION: 'subscription' };` |
| 프론트 | `static/ui/src/utils/jiraApi/coworkerProperty.js:33` | `export const ASSIGNED_VIA_SUBSCRIPTION = 'subscription';` |

글자 그대로 동일. 양쪽 주석이 서로를 상호 참조해 표류를 막고 있음.

### V8 — 테스트/빌드 (통과, 3종 전부 실행)

```
# 루트 (검증자 직접 실행)
npm test
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total     Time: 36.585 s

# 프론트 테스트
cd static/ui && CI=true npm test
Test Suites: 66 passed, 66 total
Tests:       1110 passed, 1110 total     Snapshots: 1 passed

# 프론트 빌드 (prebuild=merge 포함, CI=true)
cd static/ui && CI=true npm run build
The build folder is ready to be deployed.
> bundle:check
{"file":"static/js/main.92f3ff04.js","rawBytes":3690963,"gzipBytes":895146,"budgetBytes":950000,"withinBudget":true}
```

`recordIssueAssignedDate.test.js`·`SubscriptionSweeper.test.js` 무회귀 확인(둘 다 `git diff` 무변경 + 통과).
번들 예산 내, 신규 의존성 없음.

### V9 — i18n (통과)

```
locales/kr/taskHistory.json:33   "assignedBySubscription": "구독"
locales/en/taskHistory.json:33   "assignedBySubscription": "Subscription"
locales/ko-KR.json:2986          "assignedBySubscription": "구독"
locales/en-US.json:2986          "assignedBySubscription": "Subscription"
```

`git diff --stat locales/` = 4파일 각 1줄 추가 → `ko-KR.json`/`en-US.json` 은 merge 산출물 외
직접 수정 흔적 없음. 호출부 `TaskHistoryTable.jsx:151` `t('taskHistory.table.assignedBySubscription')`
와 키 경로 일치(`taskHistory` 파일명 + `table` 블록 + 키). 툴팁 키는 설계상 선택이라 미추가 — 참조하는
코드도 없으므로 미사용 키/미정의 키 모두 없음.

### 추가 — 수동 등록 경로 회귀 (통과)

| 축 | 확인 |
|----|------|
| 응답 shape | `ProjectUsersService.js:420-428` 이 `{recorded, skipped}` 만 반환(`capped` 미노출) — 계약 불변 |
| `assignedById` 기록 | `extra: (prev) => ({assignedById: accountId ?? prev?.assignedById ?? null})`(:422) — 원본 로직과 동일. `assignedVia` 는 쓰지도 지우지도 않음 |
| 상한 회귀 방지 | `maxPerRun: Infinity`(:424) 명시 → 수동 등록은 요청 전량 기록(기존 동작 유지). 설계 §3-2 의 구현자 판단 사항을 올바르게 처리 |
| 기존 테스트 | `src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js` **무수정 통과**(5케이스: date-only·merge·read실패·write실패·accountId 없으면 null) → 추출이 순수함이 입증됨. 설계 폴백 미발동 |
| 소비자 계약 | `ProjectUsersController.js:39-40` `guardedDefine(resolver,'recordIssueAssignedDate',...)` 무변경, `PermissionMap.js:140` `recordIssueAssignedDate: W('PROJECT','inherited')` 무변경, 프론트 `IssueAddModal.jsx:116` `invoke('recordIssueAssignedDate', {issueIds})` 무변경 |
| 부수 정리 | `pLimit`·`readIssueProperty`·`writeIssueProperty` import 제거, `mergeIssueProperty` 유지(`updateIssueCoworkers`:399 가 계속 사용) — 미사용/누락 import 없음 |

---

## 2. 실패 항목 → **전건 수정 확인 (2026-08-11 재검증)**

### F-1. 스윕·백필 공유 예산 경합 — **수정 확인 (통과)**

> **재검증 결과 (2026-08-11, 백엔드 수정 후)**
>
> 지적대로 recorder 블록이 `applyDefaultEstimate` **뒤로** 이동됐다. 최종 순서:
>
> | 파일 | `applyDefaultEstimate` | `recordAssignedDateOnce` | 순서 |
> |------|------------------------|--------------------------|------|
> | `SubscriptionSweeper.js` | `:179-185` (`if (apply.tagged > 0 && sub.defaultEstimateSeconds)`) | `:197-204` (`if (apply.tagged > 0)`) | ✔ estimate → recorder |
> | `SubscriptionBackfill.js` | `:108-114` (`if (sub.defaultEstimateSeconds)`) | `:120-125` | ✔ estimate → recorder (둘 다 `if (result.tagged > 0)` :105 블록 안) |
>
> **조건·인자·`.catch()` 보존 확인**
> - Sweeper: 조건 `apply.tagged > 0`(:197) 그대로, 인자 `issueIds: eligible.map(i => i.issueId)` / `extra: {assignedVia: ASSIGNED_VIA.SUBSCRIPTION}` / `budget` / `logPrefix` 전부 동일, `.catch()`(:203) 유지.
> - Backfill: `if (result.tagged > 0)` 블록 안 유지, `budget`(:123) 전달 유지, `.catch()`(:125) 유지.
> - `git diff --stat src/resolver/projectSubscription/` = **32 insertions / 0 deletions** → 기존
>   `applyDefaultEstimate` 블록은 한 줄도 건드리지 않고 recorder 블록만 뒤에 추가된 형태다(순수 이동).
> - 이동 근거가 코드 주석으로 남았다(`SubscriptionSweeper.js:187-189`, `SubscriptionBackfill.js:116-118`)
>   — "예상 시간은 놓치면 영구 누락, 등록일은 best-effort" 우선순위가 문서화됨.
> - `consumer.js:191` / `onIssueCreated.js:68` 은 budget 미전달 경로라 무변경 — 올바른 판단.
>
> **V1/V2/V3 무회귀 재확인**
> - V1: `recordAssignedDateOnce(` 호출 = 여전히 **5건**(consumer:191 / onIssueCreated:68 /
>   ProjectUsersService:420 / SubscriptionBackfill:120 / SubscriptionSweeper:198).
> - V2: recorder 가 여전히 `sweepSubscription` **내부**(:198)에 있으므로 리컨실 트리거
>   (`subscriptionReconcile.js:74`)와 수동 "지금 동기화"(`ProjectSubscriptionService.js:571`) **양쪽 모두**
>   커버된다. 형제 경로 우회 없음.
> - V3: 두 지점 모두 `.catch()` 유지 + recorder 자체 throw 없음(모듈 무변경) → 비차단 계약 그대로.
>   순서 이동은 `apply.tagged`/`result.tagged` 등 반환 계약에 영향을 주지 않는다.
>
> **테스트 (검증자 직접 재실행)**
> ```
> npm test
> Test Suites: 70 passed, 70 total
> Tests:       1110 passed, 1110 total     Time: 15.109 s
> ```
>
> → **F-1 해소. 현재 실패 항목은 없다.**
>
> 잔여 권고(선택, 비차단): 순서가 다시 뒤집히는 회귀를 막고 싶다면
> `SubscriptionSweeper.test.js:54-59` 의 `callOrder` 패턴으로 "estimate 가 recorder 보다 먼저"를
> 고정하는 케이스 1개를 추가할 수 있다. 현 테스트는 이 순서를 검사하지 않는다.

<details>
<summary>최초 지적 원문 (수정 전 기준) — 이력 보존</summary>

#### F-1. 스윕·백필 공유 예산 경합 — `applyDefaultEstimate` 가 영구 누락될 수 있다 (실패)

**위치(생산 측)**
- `src/resolver/projectSubscription/SubscriptionSweeper.js:183-190` (recorder) ↔ `:194-199` (`applyDefaultEstimate`)
- `src/resolver/projectSubscription/SubscriptionBackfill.js:105-122` (recorder :109-114 ↔ estimate :116-122)

**불일치 내용**

recorder 를 `applyDefaultEstimate` **앞**에 넣었는데, 둘은 **같은 `budget` 객체를 공유**한다.
recorder 는 이슈당 `spend(1)`×2(read/write, `AssignedDateRecorder.js:87,93`)를 소모하고
`maxPerRun` 기본 200 이라 **한 번에 최대 400 요청**을 먹는다. 예산 규모는:

| 경로 | 예산 | recorder 최대 소모 |
|------|------|-------------------|
| 수동 "지금 동기화" (`ProjectSubscriptionService.js:66` `MANUAL_SYNC_BUDGET = {maxRequests: 40}`) | **40** | 이슈 20건이면 전액 소진 |
| 구독 생성 즉시 백필 (`SubscriptionBackfill.js:48` `SCAN_BUDGET = {maxRequests: 40}`) | **40** | 즉시 처리 상한이 50건이라 흔히 전액 소진 |
| 시간별 리컨실 (`subscriptionReconcile.js:31` `MAX_REQUESTS = 600`, 구독 20건 공유) | 600 | 구독 1건이 최대 400 |

예산이 소진되면 뒤따르는 `applyDefaultEstimate` 는 `DefaultEstimateApplier.js:57`
`if (budget?.exhausted()) break;` 로 **대상 조회 자체를 건너뛰고 `[]` 를 반환**해 예상 시간을 적용하지 못한다.
그런데 그 이슈들은 이미 태깅됐으므로 스윕 JQL(`moves_RMS_projectId IS EMPTY`)의 결과집합에서 빠진다
→ **다음 주기가 다시 잡지 않는다 = 기본 예상 시간이 영구 미적용.**
리컨실에서는 예산 조기 소진으로 같은 사이클의 **나머지 구독 처리량**도 함께 줄어든다
(`subscriptionReconcile.js:68-71` 에서 루프 중단 — 누락은 아니고 다음 주기로 이월).

즉, 새 부수 효과(등록일)를 **기존 부수 효과(기본 예상 시간)보다 앞에 놓아** 우선순위를 뒤집었다.
설계서 §3-1 은 recorder 자신의 비용만 검토했고 `applyDefaultEstimate` 와의 예산 경합은 다루지 않았다.
큐 컨슈머(`consumer.js`)·이슈생성 트리거(`onIssueCreated.js`)는 budget 을 쓰지 않으므로 무관하다.

**재현 시나리오**: `defaultEstimateSeconds` 가 설정된 구독을 생성 → 대상 이슈 30건(즉시 처리 경로)
→ 태깅·등록일 기록은 되지만 예상 시간은 0건 적용되고, 이후 어떤 스윕도 이 이슈들을 재방문하지 않는다.

**수정 방법 (택1, 권장 순)**

1. **호출 순서 뒤집기(최소 변경·권장)** — 기존 기능에 예산 우선권을 돌려준다.
   - `SubscriptionSweeper.js`: `:183-190`(recorder 블록)을 `:194-199`(`applyDefaultEstimate` 블록) **뒤로** 이동.
   - `SubscriptionBackfill.js`: `:109-114`(recorder 블록)을 `:116-122`(estimate 블록) **뒤로** 이동.
   - 삽입 지점의 의미(태깅 성공 직후, `tagged > 0` 조건)는 그대로 유지된다.
2. **또는 예산 상한 연동** — 예산 있는 경로에서 recorder 가 남은 예산의 일부만 쓰게 한다.
   `createBudget` 에 `remainingRequests()`(`SubscriptionSweeper.js:39`)가 이미 있으므로
   `maxPerRun: Math.max(0, Math.floor((budget.remainingRequests() - RESERVE) / 2))` 형태로 전달.
   (1과 병행하면 가장 안전하나, 1만으로도 기존 동작은 복원된다.)

**담당**: backend. 프론트 영향 없음(프로퍼티 계약 불변).
**회귀 확인**: 수정 후 `src/resolver/projectSubscription/__test__/SubscriptionSweeper.test.js` 재실행
(현재도 통과하지만 이 케이스를 검사하지 않는다 — 순서 고정이 필요하면 `callOrder` 방식의
기존 테스트 패턴(`SubscriptionSweeper.test.js:54-59`)으로 1케이스 추가 권장).

*(→ 위 재검증 블록대로 방법 1로 수정 완료됨)*

</details>

---

## 3. 미검증 항목

| 항목 | 사유 |
|------|------|
| 실제 Jira 환경 E2E | 배포·실사이트 없이 확인 불가. 구독 편입 이슈가 작업 이력 탭에서 실제로 "구독" 배지 + 등록일시로 보이는지, `ORDER BY movesRmsAssignedAt DESC` 정렬에 편입 이슈가 섞여 들어오는지는 **배포 후 확인 필요**. (프로퍼티 write 는 앱 컨텍스트 권한이라 mock 으로는 권한 실패를 재현할 수 없다) |
| 큐 컨슈머 실행 경로(`consumer.js:191`) | 이 배치 경로에 대한 자동화 테스트가 리포지토리에 없어 **정적 검증만** 수행했다(코드 위치·throw 없음·`.catch()` 확인). 실행 검증은 배포 후 대량 백필로만 가능 |

> 위 2건은 이번 변경으로 새로 생긴 위험이 아니라 **검증 수단의 한계**다. 추측으로 통과 처리하지 않는다.

---

## 4. 참고 관찰 (수정 불요)

- `AssignedDateRecorder.js:66-68` 은 `.map(String).filter(Boolean)` 순서라 `null`/`undefined` id 가
  `'null'`/`'undefined'` 문자열로 남아 무용한 API 호출 1회가 나갈 수 있다. 다만 **원본 수동 경로도
  동일하게 raw 값을 그대로 넘겼고**(개선도 악화도 아님), 실패는 skip 으로 흡수된다. 방어를 넣으려면
  `.filter(v => v != null && v !== '').map(String)` 순으로 바꾸면 된다 — 이번 범위 밖.
- 설계 §4-5 의 의도된 부수 효과(구독 편입분이 `tracked` 로 분류되어 번업/scope creep 에 반영) 확인:
  `taskHistory.transform.js` 의 `tracked` 판정은 `assignedAtIso` 기준이며 로직 변경 없음. 코드 변경
  없이 자동 반영되는 것이 맞다.
- 소급 없음(과거 편입분은 계속 "추적 전")은 설계 §7 비목표대로이며 코드상 확인됨.
