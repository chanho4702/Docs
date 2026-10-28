# 프로젝트 구독(RFC-171) 전면 감사 — 2026-08-11

- 대상 소스: `develop` @ `f6e521c` 기준 작업 트리
- 방법: 경계면 교차 비교(생산자/소비자 동시 읽기) + 정적 추적. **코드 수정 없음**
- 테스트 실행: `npx jest src/resolver/projectSubscription` (4 suites / 74 tests **통과**), `npx jest test/permission` (7 suites / 167 tests **통과**), `cd static/ui && npx jest src/pages/projectDetail/issue` (2 suites / 30 tests **통과**)
- 제외(재보고 금지 항목, 별도 진행 중): ① `findAppFieldIdByName` 이름 매칭 모호성 → 앱 필드 write 403, ② 편입 이슈 `movesRms.assignedAt` 미기록, ③ IssueAddModal 체크박스 리마운트

> 심각도 기준 — **P0** 운영장애 / **P1** 데이터 정합 / **P2** UX·성능 / **P3** 사소

---

## 요약

| 심각도 | 건수 | 항목 |
|--------|------|------|
| P0 | 0 | — |
| P1 | 4 | F-1 백필 job 미완결, F-2 재시도 조건 오판, F-3 배치 IS EMPTY 미재확인, F-4 기본 예상시간 200건 절단 |
| P2 | 5 | F-5 generation 재생성 구멍, F-6 lifetime_tagged 이중 집계, F-7 큐 백필 진행/완료 무통보, F-8 소스 검색 무디바운스, F-9 job KVS 영구 잔류 |
| P3 | 7 | F-10 ~ F-16 |

---

## P1 — 데이터 정합

### F-1. 배치가 영구 실패하면 백필 job 이 영원히 `RUNNING` 으로 남는다 (job 상태 기계)

- **생산자**: `src/queue/consumer.js:179-208`
- **완결 판정**: `src/queue/consumer.js:231-257` (`checkJobCompletion`)
- **job 생성**: `src/resolver/projectSubscription/SubscriptionBackfill.js:145-152`

```js
// consumer.js:195-208
} catch (e) {
    failCount = issueIds.length;
    console.error('[SUBSCRIPTION BACKFILL] batch write 실패', key, e);
    throw e;   // retryCondition 이 판정
} finally {
    if (!failCount) {                       // ← 실패한 배치는 여기서 아무것도 하지 않는다
        await jobBatchManager.saveTTL(key, {... done: true});
        await checkJobCompletion(appJobId, totalBatches);
    }
}
```

- **문제 시나리오**: 구독 생성 시 백필 ON, 대상 800건 → 16배치 적재. 배치 3이 앱 필드 write 403(또는 400/5xx)으로 실패 → `failCount>0` 이므로 `job_batch` 레코드가 **저장되지 않고** `checkJobCompletion` 도 호출되지 않는다. 이후 배치 4~16이 성공해도 `checkJobCompletion` 은 `doneBatches.length < totalBatches` 에서 매번 조기 return 한다 → `job.status` 는 **영구 `RUNNING`**, `processed`/`failed` 는 **0으로 고정**. 실제 15/16 배치가 처리됐는데 기록상 0건이다.
- 같은 구멍이 **라이선스 차단 조기 return**(`consumer.js:136-139`)과 **`issueIds` 빈 배열 조기 return**(`consumer.js:146`)에도 있다 — 둘 다 배치를 done 처리하지 않고 나간다.
- 운영 장애로 번지지 않는 유일한 이유는 **이 job 을 읽는 소비자가 없기 때문**이다(F-7 참조). 즉 지금은 "조용한 미완결"이고, 나중에 진행률 UI 를 붙이는 순간 P0 로 승격된다.
- **수정 방향**: 실패/스킵 경로도 배치를 종결시킨다 — `catch` 에서 `jobBatchManager.saveTTL(key, {processedCount:0, failCount:issueIds.length, done:true})` 후 `checkJobCompletion` 을 호출하고 나서 재던지거나(재시도는 `existingBatch.done` 으로 흡수됨 — 단 이 경우 "재시도 가능 실패"와 "영구 실패"를 구분해야 하므로, 재시도 소진 시점에만 종결시키는 편이 정확하다), 최소한 라이선스/빈 배열 조기 return 두 곳은 즉시 done 처리한다.

### F-2. `retryCondition` 이 실제로 발생하는 재시도 대상 에러를 대부분 놓친다

- **생산자(에러 형태)**: `src/api/jira/field/AppFieldValueApi.js:61-68` — `ForgeAPIError('APP_FIELD_WRITE_' + status, ...)`, `src/api/jira/util/RequestJiaJson.js:15-16` — 네트워크 예외를 `ForgeAPIError('Request Jira Error', 'url: ...', e)` 로 감싸 **원문 메시지를 `cause` 로 밀어넣는다**
- **소비자(판정)**: `src/queue/consumer.js:210-220`

```js
retryCondition: (error) => (
    error?.status === 429                          // ForgeAPIError 에는 status 가 없다(code 만 있음) → 항상 false
    || String(error?.code ?? '').includes('429')   // APP_FIELD_WRITE_429 → 유일하게 동작하는 조건
    || error?.message?.includes('rate')
    || error?.message?.includes('timeout')         // 네트워크 원문은 cause 에 있어 매칭되지 않는다
    || error?.message?.includes('ECONNRESET')
    || error?.message?.includes('field not found')
),
```

- **문제 시나리오 (a)**: Jira 앱 필드 API 가 **503/502/500** 을 반환 → 코드가 `APP_FIELD_WRITE_503` → 어느 조건에도 걸리지 않음 → 재시도 없이 배치 유실 + F-1 로 job 영구 미완결. 5xx 는 재시도의 교과서적 대상인데 빠져 있다.
- **문제 시나리오 (b)**: `requestJiraJson` 경로에서 발생한 소켓 타임아웃/ECONNRESET 은 `message` 가 `url: /rest/api/3/...` 로 **덮어써지고** 원문은 `error.cause.message` 에 있다. `retryCondition` 은 `cause` 를 보지 않으므로 'timeout'/'ECONNRESET' 조건은 **사실상 죽은 코드**다.
- **수정 방향**: 판정을 `code`·`message`·`cause.message` 3단으로 확장하고, 상태코드 기반 화이트리스트(429, 5xx)를 코드에서 파싱해 판단한다. `isDuplicateSourceError`/`isMissingTableError` 가 이미 `cause` 우선으로 보는 관행이 있으므로 같은 헬퍼 형태로 뽑는 것이 일관적이다.

### F-3. 큐 백필이 태깅 직전에 `IS EMPTY` 를 재확인하지 않아 수동 등록을 덮어쓴다 (동시성)

- **대상 고정**: `src/resolver/projectSubscription/SubscriptionBackfill.js:80-84`(SCAN) → `:129-161`(큐 적재)
- **소비 시점 write**: `src/queue/consumer.js:181-185` — `issueIds` 를 **그대로** write
- **경쟁 상대**: `src/resolver/projectIssue/ProjectUsersService.js:270-283` (`updateProjectIdFieldService`) — 수동 등록은 `IS EMPTY` 를 보지 않고 무조건 덮어쓴다

- **문제 시나리오**: 사용자 A가 스페이스 S 구독을 백필 ON 으로 생성 → 1,600건 스캔 → 32배치가 `concurrencyLimit:2` 로 수 분간 소비된다. 그 사이 사용자 B가 프로젝트 P2 의 작업 등록 모달에서 S의 이슈 X를 수동 등록(= `moves_RMS_projectId = P2`). 배치 payload 의 `issueIds` 는 **스캔 시점 스냅샷**이라 X를 그대로 포함 → 컨슈머가 `value: sub.projectId`(P1)로 덮어쓴다. 결과: B가 방금 등록한 이슈가 아무 안내 없이 P1 로 넘어가고, P2 의 공수·비용 집계에서 사라진다.
- 설계서가 "충돌 건너뛰기(C1)는 쿼리 술어라 모든 경로에 자동 적용"이라고 선언한 보장이(`SubscriptionJqlBuilder.js:7-9`) **큐 경로에서만 깨진다** — 스캔과 write 사이 시간이 초 단위가 아니라 분 단위이기 때문이다. 컨슈머는 구독 상태(generation)는 재검증하면서 **이슈 소유 상태는 재검증하지 않는다**.
- **수정 방향**: 컨슈머에서 write 직전에 배치 단위 1회 재확인 — `id in (...) AND moves_RMS_projectId IS EMPTY` 로 조회해 교집합만 write(배치당 검색 1회 추가). 인덱스 지연이 걱정되면 `getIssueOwnershipHints` 와 같은 DB 기반 판정 대신, 최소한 **스캔 시각과 소비 시각의 간극이 큰 배치만** 재확인해도 된다.

### F-4. 기본 예상 시간이 스윕당 200건에서 잘리고, 잘린 분은 **영구 미적용**된다

- **상한**: `src/resolver/projectSubscription/DefaultEstimateApplier.js:28`(`MAX_PER_RUN = 200`), 적용 위치 `:50` — `ids.slice(0, MAX_PER_RUN)`
- **호출부**: `src/resolver/projectSubscription/SubscriptionSweeper.js:178-184` — `eligible` 전량(최대 2,000건)을 넘긴다

```js
/** 한 번의 스윕에서 예상 시간을 채울 최대 이슈 수. 초과분은 다음 주기가 가져간다. */  // ← 이 전제가 틀렸다
const MAX_PER_RUN = 200;
```

- **문제 시나리오**: 기본 예상 시간 8h 로 구독한 스페이스에 한 시간 동안 500건이 생성됨 → 리컨실 1회가 500건을 태깅하고, 그중 **앞 200건에만** `originalEstimate` 를 채운다. 나머지 300건은 이미 `moves_RMS_projectId` 가 채워졌으므로 **다음 스윕의 대상 JQL(`... IS EMPTY`)에서 영구히 빠진다** → 예상 시간이 영원히 비어 있다. 주석이 말하는 "다음 주기가 가져간다"는 스윕 대상 선정 방식과 모순된다.
- 백필 큐 경로는 배치가 50건이라 이 상한에 닿지 않는다. **리컨실/수동 동기화 경로에서만** 발현한다.
- **수정 방향**: (a) 예상 시간 적용 대상을 태깅 결과와 분리해 별도 큐/워크리스트로 넘기거나, (b) `applyDefaultEstimate` 가 상한 초과분을 호출부에 알려(`{applied, failed, skipped}`) 스윕을 미완주(PARTIAL)로 만들어 다음 주기에 이어달리게 한다. (c) 최소한 상한 초과 사실을 로그·`last_error` 로 노출해 조용한 누락을 없앤다.

---

## P2 — UX·성능·정합 리스크

### F-5. `generation` 은 행 단위라 **해제 후 재구독**하면 잔여 배치가 stale 로 걸러지지 않는다

- **판정**: `src/queue/consumer.js:157-171`
- **generation 기본값**: `src/rdb/schema/ddl/projectSubscription.sql.js:43` (`generation INT NOT NULL DEFAULT 1`), INSERT 는 generation 을 명시하지 않는다(`ProjectSubscriptionQuery.js:79-85`)

```js
const stale = !sub || sub.isActive === false
    || String(sub.projectId) !== String(projectId)
    || Number(sub.generation) !== Number(generation);
```

- **문제 시나리오**: 스페이스 S를 **백필 ON·전체 타입**으로 구독(1,200건 적재, 24배치가 큐에 남음) → 사용자가 "잘못 골랐다"며 즉시 해제하고, **같은 프로젝트**로 S를 **Bug 타입만·백필 OFF** 로 재구독. 새 행의 `generation` 은 다시 1이고 `projectId` 도 같으므로 잔여 배치가 **stale 로 판정되지 않는다** → 옛 규칙(전체 타입·baseline 없음)으로 수집된 1,200건이 그대로 태깅된다. 사용자가 명시적으로 취소한 편입이 실행되는 셈이고, 편입은 되돌릴 수 없다(해제해도 태깅은 유지 — 설계 §12-5).
- 백필 옵션은 수정 화면에서 바꿀 수 없으므로(`SubscriptionEditForm.jsx:18-20`) **해제 후 재구독이 유일한 방법**이다 = 이 경로는 예외적 조작이 아니라 정상적인 사용자 흐름이다.
- **수정 방향**: 배치 payload 에 `subscribedAt`(또는 구독 인스턴스 UUID)을 함께 실어 stale 판정에 포함한다. `generation` 을 단조 증가 값(예: epoch ms)으로 바꾸는 것도 같은 효과다.

### F-6. `lifetime_tagged` 이중 집계 — 동시/연속 동기화 + 검색 인덱스 지연

- **증가 지점 3곳**: `ProjectSubscriptionQuery.js:109-115`(`UPDATE_SWEEP_COMPLETED`), `:122-128`(`UPDATE_SWEEP_PARTIAL`), `:139-143`(`INCREMENT_TAGGED`)
- **호출부**: `ProjectSubscriptionService.js:578-586`(수동 동기화), `trigger/subscriptionReconcile.js:78-91`, `queue/consumer.js:186`, `trigger/onIssueCreated.js:63`

- **문제 시나리오 (a)**: 사용자가 "지금 동기화"를 연달아 2회 누른다(버튼이 `SubscriptionTab.jsx:140-147` 과 `SubscriptionSummaryBar.jsx:132-141` 두 군데 있다). Jira 검색 인덱스 지연([[project_jira_search_index_lag]])으로 두 번째 스윕이 방금 태깅한 이슈를 **여전히 `IS EMPTY` 로** 다시 잡는다 → 값은 같아 멱등이지만 `lifetime_tagged` 는 2배가 된다. 화면의 "누적 N건 편입"(`SubscriptionList.jsx:100`)이 실제 편입 수를 초과한다.
- **문제 시나리오 (b)**: 수동 동기화와 시간별 리컨실이 겹치면 같은 이슈 집합을 양쪽이 세어 같은 결과가 된다. 구독 단위 잠금이 없다.
- **문제 시나리오 (c)**: `onIssueCreated` 는 at-least-once 라 이벤트 재전송 시 `incrementTaggedRepository(+1)` 이 반복된다(태깅 자체는 멱등).
- 영향은 **표시 지표 왜곡에 한정**되고 편입 데이터 자체는 안전하다 → P2.
- **수정 방향**: `lifetime_tagged` 를 "실제로 값이 비어 있던 이슈에 write 한 수"로 좁히려면 write 전 재확인(F-3의 수정과 동일 지점)이 필요하다. 최소한 수동 동기화 버튼에 진행 중 재진입 차단(현재 `isPending` 은 각 컴포넌트 로컬 mutation 이라 두 버튼이 서로를 막지 못한다)을 두고, 표시 문구에 근사치임을 명시한다.

### F-7. 큐로 넘어간 백필은 진행률·완료를 **아무도 알려주지 않는다**

- **생산자**: `SubscriptionBackfill.js:163` → `{enqueued:true, appJobId, totalIssues}` 반환, 서비스가 `content.backfill` 로 내려준다(`ProjectSubscriptionService.js:453-458`)
- **소비자**: `SubscriptionTab.jsx:56-62` — `bf.appJobId` 를 **읽지 않는다**. `useJobStore.addJob` 호출부는 `static/ui/src/backoffice/page/user/modal/upload/UploadUserModal.jsx:64` 하나뿐이며, `JobPollingManager.jsx:15-110` 은 사용자 업로드 전용 문구(`common.upload.*`)와 `userKeys` 무효화만 수행한다.

- **문제 시나리오**: 1,600건 백필 → "가져오는 중" 토스트 1회가 전부. 큐가 수 분 뒤 완료돼도 **완료 알림도, 작업 목록 캐시 무효화도 없다**(`useSubscriptions.js:102-104` 는 `backfill.applied` 일 때만 무효화). 사용자는 이슈가 들어왔는지 알 수 없어 새로고침을 반복하거나 "실패했다"고 판단한다. 실패했을 때도 마찬가지로 침묵한다(F-1 과 결합).
- **수정 방향**: `appJobId` 를 `useJobStore.addJob` 에 등록하고 `JobPollingManager` 를 job 종류별 문구/무효화로 분기(현재는 upload 전용 하드코딩)하거나, 구독 전용 경량 폴링을 둔다. 후자를 택하면 F-1 의 job 종결 처리가 **선행 조건**이다(영원히 RUNNING 인 job 을 폴링하게 된다).

### F-8. 소스 검색이 매 키 입력마다 resolver 를 호출한다

- **소비자**: `SourceSelect.jsx:59` — `onInputChange={(text) => setQuery(text)}`
- **훅**: `useSubscriptions.js:62-72` — `subscriptionKeys.sources(projectId, sourceType, query)` 가 입력마다 새 키
- **서버 비용**: `ProjectSubscriptionService.js:204-214` — 호출마다 Jira `project/search` 1회 + `findSourceOwnersRepository` 1회 + `findProjectNamesRepository` 1회

- **문제 시나리오**: "marketing" 을 타이핑하면 9회의 `getSubscriptionSourceOptions` 가 나가고 각각 Jira 검색 + SQL 2회를 유발한다. 같은 파일 계열의 미리보기는 `useSubscriptionPreview.js:26` 에서 300ms 디바운스를 쓰고 있어 **한 기능 안에서 관행이 갈렸다**.
- **수정 방향**: `useDebounce(query, 300)` 를 `useSourceOptions` 호출 지점에 적용(미리보기와 동일 패턴).

### F-9. 미완결 백필 job 이 TTL 없이 KVS 에 영구 잔류한다

- `SubscriptionBackfill.js:145-152` 는 `jobManager.save`(**TTL 없음**), 종결은 `consumer.js:251-256` 의 `saveTTL`(30h)에서만 붙는다(`CustomEntityManager.js:15-36`).
- **문제 시나리오**: F-1 로 job 이 종결되지 않으면 `job` 엔티티가 **영구 보존**된다. 백필 실패가 반복되면 KVS 엔티티가 단조 증가하고, 정리 경로는 `useJobStore.cleanupJob`(사용자 업로드 폴링에서만 호출) 뿐이라 구독 job 에는 도달하지 않는다.
- **수정 방향**: 생성 시점부터 `saveTTL` 을 쓴다(진행 중 job 도 30h 면 충분 — 큐 소비는 그보다 훨씬 짧다).

---

## P3 — 사소

| # | 위치 | 내용 | 수정 방향 |
|---|------|------|-----------|
| F-10 | `subscriptionErrors.js:11-19` vs `locales/{kr,en}/subscription.json` | `SUBSCRIPTION_INVALID_ESTIMATE` 번역은 있는데 `TRANSLATED_ERROR_CODES` 에 없어 **번역이 죽어 있다**. 100시간 초과 입력 시 사용자는 일반 실패 문구 + 영문 원문(`default estimate too large: 400000s`)을 본다. 파일 주석은 "error 섹션과 반드시 일치"라고 선언한다 | Set 에 코드 추가(또는 번역 삭제). 계약 테스트로 고정 가능 |
| F-11 | `SubscriptionEditForm.jsx:125` | `t('common.clear')` 키가 `locales/kr/common.json`·`en/common.json` 어디에도 없다(merge 결과 `ko-KR.json`/`en-US.json` 확인). 아이콘 aria-label 에 키 문자열이 그대로 노출될 수 있다 | `common.clear` 추가 후 `npm run merge` |
| F-12 | `IssueOwnership.jsx:16-36` | `OwnershipBadge` 가 **어디서도 import 되지 않는다**(전역 grep 결과 정의부 1건). 이슈 목록 행에 소속 배지가 뜨지 않고, 사용자는 등록 버튼을 누른 뒤 `TakeoverConfirm` 단계에서야 "뺏어온다"는 사실을 안다 | `IssueAddModal.jsx:59-69` 의 `rows` 셀에 배지를 넣거나, 의도적 미사용이면 삭제 |
| F-13 | `subscriptionReconcile.js:78-82` | `if (result.completed)` 분기 안의 `result.capped ? 'PARTIAL' : 'OK'` 는 **도달 불가**다 — `scanSubscription` 은 capped 일 때 항상 `completed:false` 를 반환한다(`SubscriptionSweeper.js:67-69`) | 죽은 분기 정리(또는 capped 를 완주와 공존시키려면 스캐너 계약 변경) |
| F-14 | `ProjectSubscriptionService.js:549-555` | 특정 소스를 지정한 수동 동기화에서 그 소스가 내 프로젝트 구독이 아니면 `targets` 가 비고 **`status:'OK', completed:true`** 로 성공 응답한다. 프론트는 "편입 0건"으로 표시 → 오타/해제된 소스를 성공으로 오인 | 지정 대상이 없으면 `SUBSCRIPTION_NOT_FOUND` 로 거부 |
| F-15 | `ProjectSubscriptionService.js:331-332` | `conflictJql`/`mineJql` 에 `projectId` 를 **검증 없이 문자열 보간**한다(`requireProjectId` 는 truthy 검사만). 실행은 `asUser` 라 권한 우회는 없고 DB 경로는 `UUID_TO_BIN` 이 막지만, 조작된 값이 미리보기 JQL 을 깨뜨려 카운트가 조용히 0으로 떨어진다 | `projectId` UUID 형식 검증 추가 |
| F-16 | `ProjectSubscriptionService.js:455` | INSERT 직후 재조회가 실패하면 `toResponseItem(draft)` 로 폴백하는데 draft 에는 `isActive`·`subscribedAt`·`lastSync*` 가 없다 → 응답의 `isActive` 가 `undefined` 라 목록이 방금 만든 구독을 **"일시 중지"로 표시**한다(`SubscriptionList.jsx:78-82`). 직후 invalidate 로 자가 치유되지만 한 프레임 오표기 | draft 폴백에 기본값(`isActive:true`, `subscribedAt:now`) 부여 |

---

## 통과 (확인했고 문제 없음)

> 침묵 = 미검증 오독을 막기 위해 명시한다.

| 축 | 확인 내용 | 판정 |
|----|----------|------|
| **경계면 shape (성공)** | `getProjectSubscriptions` → `{content:{subscriptions}}` ↔ `useSubscriptions.js:44-51` `res.content.subscriptions`. `createProjectSubscription` → `{content:{subscription, backfill:{enqueued,applied,tagged,deferred,appJobId,totalIssues,isScanCapped}}}` ↔ `SubscriptionTab.jsx:48-65` 가 읽는 6개 필드 전부 생산부에 실재(`SubscriptionBackfill.js:87,117-124,163` + `ProjectSubscriptionService.js:441-450`). `previewSubscriptionMatches`·`getSubscriptionSourceOptions`·`getIssueOwnershipHints`·`getSourceIssueTypes`·`runSubscriptionSyncNow` 전부 필드 단위 대조 완료 | **통과** |
| **경계면 shape (실패)** | 모든 훅이 `if (!res?.success) throw toSubscriptionError(res, ...)` 로 `error.code`/`message`/`cause` 를 보존(`useSubscriptions.js:16-21`), UI 가 code 로 문구 선택. `success===false` 무시 지점 없음 | **통과** |
| **resolver 매핑** | 9개 함수 모두 `ProjectSubscriptionController.js` 에 `guardedDefine` 등록 + `src/index.js:36,86` `CONTROLLER_REGISTRARS` 포함. 프론트 `invoke()` 이름 9개 전부 일치(오탈자 없음) | **통과** |
| **권한 등록** | `PermissionMap.js:353-361` — 읽기 5 = `R('PROJECT','detail')`, 쓰기 4 = `W('PROJECT','detail')`. 미등록 함수 없음(deny-by-default 회피 없음). 계약 테스트 167건 통과 | **통과** |
| **읽기↔쓰기 대칭** | 쓰기 3종 모두 `current.projectId !== projectId` 소유 검증(`Service:474-477, 530-533`) + create 는 사전 조회 + PK 충돌 2중 방어. `assertSourceAccessible`(asUser+asApp) 게이트를 create·update·preview 가 **공유**하고, 면제는 "일시 중지만 하는 patch" 하나로 한정(`Service:486-494`) — 위임을 넓히지 않는 방향이라 타당 | **통과** |
| **동일 데이터 다중 경로** | 구독 목록을 내주는 경로는 `getProjectSubscriptions` 단일. 소스 메타는 `SubscriptionSourceApi` 단일 진입. 편입 대상 JQL 은 `buildSubscriptionJql` 이 이벤트·리컨실·백필·미리보기 4경로의 단일 진실 — 우회 경로 없음 | **통과** |
| **서비스 내부 소비자** | 구독 함수를 import 하는 백엔드 지점 전수: `ProjectService.js:136`(cascade 삭제), `consumer.js:10-13`, `onIssueCreated.js:20-25`, `subscriptionReconcile.js:17-24`. 모두 현재 반환 shape 과 일치 | **통과** |
| **라이선스 게이팅** | `isLicenseBlocked` 는 `LICENSE_STATES.INACTIVE` 만 차단(`LicenseGuard.js:191-194`) = `assertLicenseAllowed` 와 동일 경계, 정책(차단은 명시적 INACTIVE 하나)과 일치. 컨슈머·리컨실 양쪽 동일 적용 | **통과** (단 컨슈머의 차단 return 이 배치를 종결시키지 않는 점은 F-1) |
| **KVS 규약** | 빈 문자열 저장 없음(구독 저장 값은 전부 숫자/불리언/문자열, 선택 필드는 null 이며 KVS 가 아니라 SQL 로 간다). `job`(`manifest.yml:311-324`)·`job_batch`(`:325-338`) attributes 에 사용 필드 전부 선언됨(`done: boolean` 포함). `findAll()` 100건 하드캡 사용처 없음(전부 `findById`) | **통과** |
| **generation 무효화 (수정 경로)** | `UPDATE_RULE` 이 `generation = generation + 1`(`ProjectSubscriptionQuery.js:91-96`) → 컨슈머 stale 판정이 실제로 동작. 폐기된 배치는 백필 구독이 `baseline_at/watermark = NULL` 이라 첫 리컨실 전체 스캔이 회수 | **통과** (재구독 케이스만 F-5) |
| **소유 이전 / 해제 중 잔여 배치** | 해제 → `sub` null → stale, 타 프로젝트 재구독 → `projectId` 불일치 → stale. 둘 다 배치를 done 처리하고 완결 집계까지 호출(`consumer.js:164-171`) | **통과** |
| **watermark 안전성** | 미완주 시 `UPDATE_SWEEP_PARTIAL` 이 watermark 를 전진시키지 않음. 이벤트 경로(`INCREMENT_TAGGED`)는 watermark·`last_run_tagged` 를 건드리지 않음. 완주 시 "스캔 시작 시각"을 쓴다(`SubscriptionSweeper.js:150,200`) — 경계 유실 방지 방향으로 보수적 | **통과** |
| **SCAN/APPLY 분리·커서 미사용** | `IS EMPTY` 로 결과집합이 줄어드는 문제를 커서 폐기 + 매회 첫 페이지 재스캔으로 회피(`SubscriptionSweeper.js:152-160`) — 논리적으로 누락 없음 | **통과** |
| **JQL 인젝션 (extraJql)** | 괄호/따옴표 균형 검사(`hasBalancedParens`)를 **저장 시점과 조립 시점 양쪽**에서 수행(`SubscriptionJqlBuilder.js:194`) → 과거 저장분도 방어. `ORDER BY`·컨텍스트 함수 차단, 길이 1000 제한. `sourceId` 는 `/^\d+$/` 강제 | **통과** |
| **confused-deputy** | 미리보기 카운트·샘플이 전부 `asUser`(`Service:337-347`), 저장 규칙만 `asApp` 실행. create/update 가 `asUser`+`asApp` 이중 접근 검증. 소스 key/name 은 서버 조달(클라이언트 값 미사용) | **통과** |
| **쿼리키** | `subscriptionKeys` 6종 모두 `utils/queryKey/projectKeys.js:128-140` 팩토리. 인라인 배열 없음. 규칙 서명은 `normalizeSubscriptionRule` 로 정규화 | **통과** |
| **i18n** | `locales/kr/subscription.json` ↔ `locales/en/subscription.json` 키 집합 **완전 일치**(kr-only/en-only 0건), 병합 결과 `ko-KR.json`/`en-US.json` 의 `subscription` 네임스페이스와 **바이트 일치**(merge 실행됨). `subscription.status.*` 5종이 백엔드가 쓰는 상태값(OK/PARTIAL/ERROR/SOURCE_FORBIDDEN) 전부 포함. `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음 | **통과** (예외: F-11 `common.clear`) |
| **성능 패턴** | 목록 메타 조회 `pLimit(3)`(`Service:187`), APPLY `pLimit(2)`, 예상시간 `pLimit(2)`, 앱 필드 write 는 50건 순차 배치. 워크로그 공통 페치 경로 미수정. 리컨실 예산(요청 600 / 480s) + 수동 동기화 예산(40 / 12s, resolver 25s 한도 내) | **통과** |
| **비동기(큐) vs 즉시 응답** | 프론트가 즉시 응답에서 최종 결과를 읽는 오류 없음 — `applied` 일 때만 `tagged` 를 결과로 표시하고 `enqueued` 는 "진행 중"으로 분기(`SubscriptionTab.jsx:49-62`), 캐시 무효화도 `applied` 에 한정 | **통과** (다만 완료 통보 부재는 F-7) |
| **테이블 미준비 방어** | read 는 빈 결과, write/스윕은 fail-close(`ProjectSubscriptionRepository.js:86-113,150-161` + `Service:107-112`). 프로젝트 삭제 cascade 도 미준비 내성 | **통과** |
| **DB projection parity** | 모든 SELECT 가 `SUBSCRIPTION_COLUMNS` 상수 공유(`ProjectSubscriptionQuery.js:19-25`), 전용 테스트가 parity 를 고정(`SubscriptionQueryProjection.test.js`) | **통과** |
| **manifest 배선** | 컨슈머(`subscription-backfill-consumer`)·함수(`backfillSubscription`, 600s)·이벤트 트리거(`avi:jira:created:issue`)·스케줄(`subscription-reconcile`, hour) 전부 선언, 핸들러 경로가 실제 export 와 일치 | **통과** |
| **onIssueCreated 폭주 방어** | 절대 throw 하지 않음(재시도 폭주 차단), 구독 없으면 SQL 1회로 조기 종료, 테이블 준비 판정은 `true` 만 모듈 캐시(`TableReadiness.js:36`)라 반복 비용 낮음. 판정 불가는 `defer` 로 리컨실 위임 | **통과** |

---

## 미검증 (이 감사로 확인할 수 없는 것)

| 항목 | 사유 |
|------|------|
| Forge Queue 가 **throw 시 자동 재시도하는지** vs `InvocationError` 반환에만 재시도하는지 | 플랫폼 동작이라 코드로 확정 불가. **어느 쪽이든 F-1 의 결론(재시도 소진 후 배치가 done 처리되지 않아 job 이 영구 RUNNING)은 성립**한다 |
| `PUT /rest/api/3/app/field/{id}/value` 의 실제 배치 상한(현재 50 가정) | 공식 문서 미명시, 실호출 검증 필요(`AppFieldValueApi.js:26-30` 주석과 동일) |
| 앱 필드 write 403 의 실제 발생 빈도 | 제외 항목 ①과 얽혀 있어 별도 조치 대기 |
| 검색 인덱스 지연의 실제 크기(F-6 (a)의 재현 확률) | 배포 환경 실측 필요 |
| product trigger 페이로드의 실제 형태(`issue.fields.*` vs 평탄형) | `extractIssueEvent` 가 양쪽을 읽도록 방어돼 있으나 실배포 확인은 미수행 |
