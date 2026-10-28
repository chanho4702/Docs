# RFC-171 Project Subscription 상세 검증 리포트

- 검증일: 2026-08-04
- 검증 범위: `_workspace/project-subscription/01_architect_design.md`, 기존 리뷰, commits `eaaf08d`, `a59371c`, 현재 subscription 관련 working-tree 변경
- 분류 기준: **통과 / 실패 / 미검증**
- 최종 판정: **실패 — P0 2건, P1 7건의 release blocker가 남아 있음**
- 검증 방식: resolver/trigger/queue 생산자와 UI/Jira/SQL/KVS 소비자를 양쪽에서 교차 비교

## 1. 요약

설계 v2가 지적한 핵심 위험을 코드 구조로 옮긴 부분은 분명하다. `(source_type, source_id)` PK, 공통 JQL builder, SCAN 후 APPLY, `generation`, queue batch, 응답 wrapper와 query-key factory는 구현되어 있다. 전체 Jest와 production build도 통과한다.

그러나 안전성의 전제가 실제 동시성 모델과 맞지 않는다. 서로 다른 source도 같은 issue를 포함할 수 있으므로 source-level exclusivity는 issue-level ownership을 보장하지 않는다. 또한 preview는 source 접근 검증 없이 `asApp`으로 issue key/summary를 반환한다. 두 건 모두 배포 전 차단해야 하는 P0이다.

그 밖에 scheduled query의 `baseline_at` 누락, 실행 경계를 넘는 mutable pagination, Jira Software scope 누락, sweep lease 부재, 일반 resolver 안에서의 20초 backfill scan, async queue partial acceptance 미처리 때문에 데이터 누락·잘못된 편입·저장 후 응답 timeout·영구 RUNNING job이 가능하다. 테스트 통과는 이 경계들을 다루지 않으므로 release 근거가 될 수 없다.

## 2. 실패

### P0-1. preview가 Jira source 권한을 검증하지 않고 `asApp` 데이터와 summary를 노출한다

- 생산자: `src/permission/PermissionMap.js:346`, `src/resolver/projectSubscription/ProjectSubscriptionService.js:198-233`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/useSubscriptionPreview.js:34-43`
- 설계 계약: `_workspace/project-subscription/01_architect_design.md:29`, `:380-387`, `:782`
- 불일치: `previewSubscriptionMatches`는 RMS `PROJECT/detail` read만 확인한다. SPACE source에 대해 `assertSourceAccessible()`을 호출하지 않은 채 count 3회와 sample search를 모두 `as: 'app'`으로 수행한다. sample은 issue id/key/summary/type까지 반환한다.
- 재현: 사용자 U에게 RMS 프로젝트 P read 권한은 주되 Jira project S의 Browse Projects 권한은 제거한다. U가 `previewSubscriptionMatches({ projectId:P, sourceType:'SPACE', sourceId:S })`를 직접 invoke하면 app이 S를 볼 수 있는 경우 S의 count와 최대 10개 issue key/summary가 반환된다.
- 영향: 사용자 권한을 우회한 Jira issue metadata 유출이다. Jira search는 Browse Projects와 issue-level security가 적용되는 API이며, `asApp` 결과를 사용자 응답으로 전달하면 confused-deputy가 된다. [Jira issue search 권한 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- 원인: create에만 둔 source gate가 preview 경계에는 재사용되지 않았고, preview 실행 주체를 background와 같은 `asApp`으로 통일했다.
- 수정: preview 시작 시 `assertSourceAccessible()`을 필수 호출한다. preview count/sample은 `asUser`로 실행하고, create 시 별도로 exact background dependency(SPACE meta 또는 BOARD meta+configuration+filter)를 `asApp`으로 검증한다. 권한/429/5xx는 0건으로 폴백하지 말고 typed failure로 반환한다.
- 필수 테스트: `asUser` source GET=403, `asApp` search=200 fixture에서 search가 호출되지 않고 `SUBSCRIPTION_SOURCE_FORBIDDEN`이 반환되는 service contract test. issue-level security로 sample이 누출되지 않는 integration test도 필요하다.

### P0-2. source-level PK는 겹치는 source 간 issue 소유권 덮어쓰기를 막지 못한다

- 생산자: `src/rdb/schema/ddl/projectSubscription.sql.js:50`, `src/resolver/projectSubscription/SubscriptionJqlBuilder.js:131-132`, `src/resolver/projectSubscription/SubscriptionSweeper.js:120-124`, `src/trigger/onIssueCreated.js:56-60`
- 소비자: Jira app custom field `moves_RMS_projectId`, `src/api/jira/field/AppFieldValueApi.js:55-67`
- 설계 계약/가정: `_workspace/project-subscription/01_architect_design.md:83-96`, `:125`, `:781`
- 불일치: PK는 같은 source의 중복만 막는다. `SPACE A`, `BOARD B(filter contains A)`, 서로 다른 board 두 개는 동일 issue를 포함할 수 있다. 두 sweep가 동시에 `IS EMPTY`를 읽은 뒤 PUT하면 app-field write는 조건부/CAS가 아니므로 마지막 writer가 앞선 RMS project를 덮어쓴다. SCAN과 APPLY 사이의 수동 등록도 같은 방식으로 덮인다.
- 재현: P1이 `SPACE A`, P2가 A issue를 포함하는 `BOARD B`를 구독하게 하고 두 SCAN이 issue X를 모두 읽은 시점에 barrier를 건다. P1 APPLY 후 P2 APPLY를 재개하면 X의 최종 값은 P2다. 순서를 바꾸면 P1이 된다.
- 영향: project별 작업·원가·진척 집계의 핵심 foreign ownership이 비결정적으로 바뀌는 silent cross-project data corruption이다. 설계의 “source 전역 배타가 same safety를 준다”는 전제가 성립하지 않는다.
- 원인: ownership identity가 source인데 실제 충돌 단위는 issue다. Jira app-field PUT에는 expected-current-value 조건이 없다.
- 수정: `issue_id` unique claim/assignment ledger 또는 단일 직렬 allocator를 도입한다. claim에는 owner project, source, generation, 상태를 두고 atomic conditional SQL로 first-wins를 결정한 뒤 Jira write를 수행하며, write 실패는 retry 가능한 상태로 남겨 reconcile한다. 1GiB 우려는 예상 issue 수×row size와 retention/compaction 정책으로 수치화해야 하며 안전성 삭제의 근거로 쓰면 안 된다. 최소한 APPLY 직전 current field re-read도 필요하지만 이것만으로 CAS가 되지는 않는다.
- 필수 테스트: 겹치는 SPACE/BOARD, 서로 다른 BOARD, 수동 등록 vs sweep를 barrier로 동시 실행해 한 owner만 claim하고 loser가 Jira PUT을 하지 않는 concurrency test. Jira PUT 성공/SQL 상태 기록 실패 및 반대 순서의 recovery test도 필요하다.

### P1-1. scheduled target projection에서 `baseline_at`이 빠져 backfill=false가 무력화된다

- 생산자: `src/rdb/query/ProjectSubscriptionQuery.js:45-52`
- 소비자: `src/resolver/projectSubscription/ProjectSubscriptionRepository.js:40-71`, `src/trigger/subscriptionReconcile.js:55-90`, `src/resolver/projectSubscription/SubscriptionJqlBuilder.js:152-160`
- 설계 계약: `_workspace/project-subscription/01_architect_design.md:167-174`, `:805`
- 불일치: `FIND_SWEEP_BATCH`만 `baseline_at`을 SELECT하지 않는다. `toSubscription()`은 missing 값을 null로 만들고, RECONCILE JQL과 exact `filterByBaseline()`이 created 하한을 모두 생략한다.
- 재현: backfill=false 구독을 T에 생성하고, T 이전 생성됐으나 최근 26시간 안에 updated된 미소속 issue를 둔다. scheduled query로 읽은 subscription을 sweep하면 issue가 편입된다.
- 영향: 사용자가 명시적으로 제외한 과거 issue가 자동 편입된다.
- 원인: 동일 domain object를 만드는 세 SELECT 중 sweep 전용 projection만 필드가 빠졌고 repository projection contract test가 없다.
- 수정: `FIND_SWEEP_BATCH`에 `baseline_at`을 추가하고 SELECT column list를 공통 fragment로 통합한다.
- 필수 테스트: query text 또는 repository fixture에 non-null `baseline_at`을 넣어 scheduled domain object와 최종 JQL/filter가 이를 유지하는 contract test.

### P1-2. partial SCAN 후 APPLY하고 opaque cursor를 저장해 다음 실행에서 issue를 영구 건너뛸 수 있다

- 생산자: `src/resolver/projectSubscription/SubscriptionSweeper.js:53-88`, `:145-180`
- 소비자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:446-453`, `src/trigger/subscriptionReconcile.js:94-106`
- 설계 계약: `_workspace/project-subscription/01_architect_design.md:25-26`, `:296-312`, `:779`
- 불일치: 2,000건 cap/예산 소진 시 `nextPageToken`과 앞쪽 items를 함께 반환한다. `sweepSubscription()`은 scan이 미완료여도 그 items를 즉시 APPLY하고, 호출자는 token을 저장한다. APPLY가 `IS EMPTY` 결과집합의 앞부분을 제거한 다음 호출에서 변경된 결과집합에 이전 token을 재사용한다.
- 재현: 2,100개 empty issue를 100개 page로 응답시키고 2,000개 시점에 token을 반환한다. 첫 실행이 2,000개를 태깅한 뒤 같은 token으로 축소된 query를 재개하도록 Jira mock을 구성하면 마지막 100개를 읽지 않는다.
- 영향: cap 또는 runtime budget에 걸리는 큰 source에서 일부 issue가 영구 누락될 수 있다.
- 원인: “한 invocation 안에서 SCAN→APPLY”만 지켰고, SCAN snapshot이 invocation 경계를 넘을 때도 immutable해야 한다는 조건을 빠뜨렸다.
- 수정: (a) scan 완료 전 issue ID snapshot을 durable storage에 보관하고 완료 뒤 APPLY하거나, (b) partial APPLY 후 cursor를 폐기하고 다음 실행은 첫 page부터 다시 시작한다. 태깅된 앞쪽은 `IS EMPTY`에서 사라져 (b)도 전진한다. 변경된 결과집합에 opaque token을 재사용하면 안 된다.
- 필수 테스트: cap, deadline, 429 각 partial 종료 후 두 번째 invocation까지 연결해 전체 issue set이 정확히 한 owner에게 도달하는 test. 현재 `SubscriptionSweeper.test.js`는 한 invocation 내부 순서만 본다.

### P1-3. BOARD REST 호출에 필요한 Jira Software granular scopes가 manifest에 없다

- 생산자: `src/resolver/projectSubscription/SubscriptionSourceApi.js:75-97`, `:127-185`, `:205-217`
- 권한 선언 소비자: `manifest.yml:356-365`
- 불일치: manifest에는 `read:jira-work`만 있고 board list/meta/configuration에 필요한 Jira Software scopes가 주석 처리되어 있다. 공식 문서는 Jira Software가 classic scope를 지원하지 않는다고 명시하며, board list에는 `read:board-scope:jira-software`+`read:project:jira`, configuration에는 `read:board-scope.admin:jira-software`가 필요하다. [Jira Software scopes](https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jsw/), [Board REST API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/)
- 재현: 현재 manifest로 development install 후 BOARD options 또는 configuration resolver를 호출한다. 정상 site에서도 401/403 또는 unavailable fallback이 예상된다.
- 영향: BOARD 구독 생성·미리보기·scheduled reconcile이 설치 환경에서 동작하지 않을 가능성이 높다.
- 원인: “classic과 granular를 섞으면 reject될 수 있다”는 미검증 가정으로 필수 scope를 제외했다. 공식 scope 문서는 endpoint별 granular scope 추가를 지시한다.
- 수정: 실제 호출 목록에 맞춰 최소 scopes를 추가하고 `forge lint`, deploy, upgrade install을 수행한다. board/meta/config/filter 각각을 asUser/asApp로 smoke test한다.
- 필수 테스트: manifest scope contract test와 설치 site에서 board list/config/filter 200, private board 403를 구분하는 smoke test.

### P1-4. scheduled/manual sweep에 lease와 generation-conditional commit이 없어 중복·낡은 실행이 상태와 필드를 덮는다

- 생산자: `src/rdb/query/ProjectSubscriptionQuery.js:45-52`, `:99-117`, `src/trigger/subscriptionReconcile.js:55-106`
- 경쟁 소비자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:349-402`, `:410-466`
- 불일치: target SELECT는 claim/lease 없이 실행되고 status UPDATE도 `(source_type, source_id)`만 조건으로 한다. rule update는 generation을 올리지만 이미 읽은 scheduled/manual sweep는 APPLY 전에 generation/active/owner를 재검증하지 않는다. delete와도 경쟁한다. Forge는 scheduled trigger가 드물게 중복 invoke될 수 있으므로 app이 이를 처리해야 한다고 명시한다. [Scheduled trigger 문서](https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/)
- 재현: sweep가 old rule로 SCAN한 뒤 pause하고 update로 rule을 좁히거나 subscription을 삭제한다. old sweep를 재개하면 old rule 대상에 PUT하고, 이후 status UPDATE가 새 row 상태를 덮거나 삭제 후 write한다. 동일 scheduled invocation 두 개도 cursor/lifetime counter를 경합한다.
- 영향: pause/delete/update가 즉시 효력을 갖지 않고 낡은 규칙으로 편입되며 cursor/counter/status가 역행한다.
- 원인: `generation`이 queue consumer stale check에만 연결되고 reconcile/manual commit protocol에는 연결되지 않았다.
- 수정: atomic conditional lease(`lease_owner`, `lease_until`, `run_generation`)를 얻은 실행만 처리한다. APPLY 직전 row를 재확인하고 모든 sweep status UPDATE에 expected generation/owner/lease를 WHERE 조건으로 넣어 affected-row=1을 확인한다. delete/update는 lease revoke 또는 generation bump로 old runner를 무효화한다.
- 필수 테스트: duplicate scheduled, manual+scheduled, update-during-scan, delete-during-scan의 barrier concurrency test.

### P1-5. create가 저장 후 20초 동기 SCAN을 수행해 25초 resolver timeout에서 반쪽 성공이 된다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:312-336`, `src/resolver/projectSubscription/SubscriptionBackfill.js:31`, `:46-98`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/SubscriptionTab.jsx:40-63`
- 불일치: subscription INSERT 후 같은 일반 resolver에서 최대 20초/60 search request의 backfill SCAN, KVS save, queue push를 수행한다. Forge 일반 함수 최대 runtime은 25초이며 async event는 이 제한을 넘는 작업을 옮기는 용도다. [Async Events API](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/)
- 재현: Jira search page 응답을 각 400~500ms로 지연시키고 backfill=true create를 호출한다. INSERT는 성공하지만 scan/queue/response가 25초를 넘으면 client는 실패를 받고 재시도 시 `SOURCE_TAKEN`을 받는다. manual sync도 budget을 정확히 25초로 잡아 DB/status/response overhead가 없다(`ProjectSubscriptionService.js:58`, `:429-432`).
- 영향: 저장 성공 여부를 사용자가 알 수 없고 backfill은 시작되지 않을 수 있다. 재시도가 복구가 아니라 충돌로 보인다.
- 원인: “SCAN 선행”을 같은 user invocation에서 수행해야 한다고 해석했다.
- 수정: create는 rule과 idempotent backfill request/job row를 저장하고 seed event만 push한 뒤 즉시 `accepted`를 반환한다. 600초 consumer에서 SCAN→snapshot→batch push를 수행한다. manual sync도 async job으로 바꾸거나 deadline을 충분히 낮춰 안전한 partial response를 보장한다.
- 필수 테스트: timeout 직전/직후 fault injection으로 create retry가 동일 operation key의 같은 job을 반환하고 정확히 한 backfill workflow만 존재하는 test.

### P1-6. queue partial acceptance와 push 실패가 무TTL RUNNING job을 영구 고아로 만든다

- 생산자: `src/resolver/projectSubscription/SubscriptionBackfill.js:64-96`, `src/utils/queueUtil.js:19-40`
- 소비자: `src/queue/consumer.js:222-247`, `src/nosql/query/CustomEntityManager.js:15-31`
- 불일치: `totalBatches`인 RUNNING job을 TTL 없이 먼저 저장한 뒤 `queue.push()` 결과를 버린다. `PartialSuccessError`/`RateLimitError`를 처리하지 않는다. accepted되지 않은 batch가 하나라도 있으면 `checkJobCompletion()`은 영원히 `doneBatches < totalBatches`다. Forge async events는 push당 최대 50 events이고 partial success의 `failedEvents`를 별도 처리해야 한다. [Async event error handling](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api-error-handling/), [Async limits](https://developer.atlassian.com/platform/forge/limits-async-events/)
- 재현: 40 batch push에서 39 accepted, 1 failed인 `PartialSuccessError`를 발생시킨다. accepted batches 완료 뒤 job은 RUNNING이며 최초 `save()`에는 TTL이 없어 자동 정리되지 않는다.
- 영향: UI polling이 끝나지 않고 실제 backfill도 일부 누락된다. 운영자가 job을 식별·복구할 상태가 없다.
- 원인: push를 all-or-nothing으로 가정하고 앱 job state와 Forge job id/accepted event set을 연결하지 않았다.
- 수정: push result의 Forge `jobId`를 저장하고 partial failedEvents를 idempotently 재-push한다. 최종 실패 시 app job을 `FAILED/PARTIAL`로 종결하며 최초 RUNNING에도 TTL/heartbeat/deadline을 둔다. reconciler가 stale RUNNING job을 재개하거나 종료해야 한다.
- 필수 테스트: PartialSuccessError, RateLimitError, process crash after app-job save, process crash after push의 recovery test.

### P1-7. update와 BOARD 생성이 background에서 실제 필요한 권한을 끝까지 재검증하지 않는다

- 생산자: `src/resolver/projectSubscription/SubscriptionSourceApi.js:127-185`, `:230-271`, `src/resolver/projectSubscription/ProjectSubscriptionService.js:278-310`, `:349-379`
- 소비자: `src/trigger/subscriptionReconcile.js:81-90`
- 불일치: `assertSourceAccessible(BOARD)`는 board meta만 asUser/asApp로 읽는다. 실제 background dependency인 board configuration과 backing filter는 create에서 asUser로만 resolve한다. update는 `assertSourceAccessible()` 자체를 호출하지 않는다. 사용자가 source/filter 접근권한을 잃은 뒤에도 RMS write 권한만으로 app에 규칙 변경을 위임할 수 있다.
- 재현: app은 board meta를 보지만 private backing filter는 못 보도록 하거나, subscription 생성 후 editor의 Jira source 권한을 제거하고 update한다. update/create는 통과할 수 있으나 scheduled resolve는 403으로 계속 실패한다.
- 영향: confused-deputy 방어가 update에서 깨지고, 저장 즉시 실행 불가능한 BOARD subscription이 생성될 수 있다.
- 원인: “source accessible” 검증 범위가 meta endpoint로 축소되었고 create/update가 동일 gate를 사용하지 않는다.
- 수정: create와 update 모두 exact dependency graph를 asUser와 asApp에서 확인한다. BOARD는 meta+configuration+filter까지 확인하고 typed `SOURCE_FORBIDDEN`/`APP_NO_ACCESS`를 구분한다.
- 필수 테스트: user meta 200/config 403, app meta 200/filter 403, update 시 user access revoked 조합별 contract test.

### P2-1. manual sync의 backend 성공 envelope와 UI 성공 처리 계약이 어긋난다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:415-421`, `:455-466`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/useSubscriptions.js:143-149`, `SubscriptionTab.jsx:95-117`
- 불일치: 개별 sweep exception을 삼키고 `{ success:true, content:{status:'ERROR', completed:false} }`로 반환한다. UI는 resolver failure만 throw하며 content ERROR도 먼저 “0건” toast를 띄운 뒤 “partial” 안내만 한다. 명시한 source가 존재하지 않아도 0건 OK다.
- 영향: 권한·Jira·field write 실패가 정상 무편입으로 보이고 운영자가 원인을 알 수 없다.
- 수정: 전체 실패는 typed resolver failure, 일부 실패는 `failures:[{sourceType,sourceId,code}]`를 반환하고 UI가 warning/error로 표시한다. 명시 target not found는 `SUBSCRIPTION_NOT_FOUND`로 실패시킨다.
- 필수 테스트: 한 건/전부 실패 및 missing target에 대한 producer-consumer shape test와 toast assertion.

### P2-2. Jira 429 정책이 `Retry-After`와 지수 backoff/jitter를 구현하지 않는다

- 생산자: `src/api/jira/field/AppFieldValueApi.js:61-67`
- 소비자: `src/utils/queueUtil.js:49-70`, `src/queue/consumer.js:200-211`, `src/resolver/projectSubscription/SubscriptionSweeper.js:127-135`
- 불일치: field API error가 response headers를 버리고 consumer는 모든 retry를 60초로 고정한다. synchronous sweep는 429 batch를 failed로 끝낸다. Atlassian은 429의 `Retry-After` 준수와 exponential backoff+jitter를 권고한다. [Jira rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- 영향: 재시도가 너무 이르거나 동시에 몰려 반복 429를 만들고, scheduled/manual에서 복구 가능한 batch가 partial로 남는다.
- 수정: status/headers/retryAfter를 보존한 typed error를 사용하고, `max(serverRetryAfter, exponential+jitter)`로 retry한다. scheduled는 cursor를 안전하게 재시도하되 P1-2 수정과 결합한다.
- 필수 테스트: Retry-After 5/120, header 없음, 연속 429에 대한 delay 범위와 jitter test.

### P2-3. Jira PUT·SQL counter·KVS done marker가 원자적이지 않아 retry 때 통계가 중복/누락된다

- 생산자/소비자: `src/queue/consumer.js:147-197`, `src/resolver/projectSubscription/ProjectSubscriptionRepository.js:223-235`
- 불일치: Jira PUT → best-effort SQL increment → KVS done 순서다. PUT 후 KVS save 전에 crash하면 retry가 PUT과 increment를 반복한다. 반대로 SQL increment 실패는 삼키고 KVS done을 남겨 영구 undercount한다. completion 때마다 모든 batch KVS를 다시 읽어 총 O(B²) read도 발생한다(`consumer.js:222-247`).
- 영향: `lifetimeTagged`가 실제 편입과 불일치하고 큰 job에서 KVS 비용이 불필요하게 증가한다.
- 수정: batch ledger의 atomic state transition으로 통계를 한 번만 반영하고, 완료 카운터를 increment하거나 native Forge job stats를 사용한다. 화면 라벨도 “실제 신규 편입”인지 “write 요청 수”인지 계약을 정한다.
- 필수 테스트: Jira 성공 뒤 SQL/KVS failure, SQL failure, duplicate delivery, out-of-order batch completion fault-injection test.

### P2-4. 편입 후 backend KVS cache 무효화와 bounded polling이 없다

- 생산자: `src/resolver/projectProgress/ProjectProgressService.js:58-64`, `:156`, `src/resolver/projectCost/ProjectCostService.js:75-99`, `:205`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/useSubscriptions.js:31-37`, `:96-99`, `SubscriptionTab.jsx:48-58`
- 설계 계약: `_workspace/project-subscription/01_architect_design.md:562-567`, `:794`
- 불일치: frontend invalidate는 정상적인 TanStack prefix invalidation이지만, progress/cost resolver가 다시 읽는 10분 KVS cache는 subscription 어느 경로에서도 삭제하지 않는다. background backfill 완료 후에는 frontend invalidate/polling 자체도 없다.
- 영향: tagging 성공 뒤 work/progress/cost가 서로 다른 시점의 값을 최대 cache TTL 동안 보여준다. [TanStack Query invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- 수정: 공용 `invalidateProjectKvsCache(projectId)`를 subscription APPLY 성공/최종 job 완료에서 호출하고, app job status를 bounded polling한 뒤 관련 query prefixes를 invalidate한다. Jira enhanced search의 eventual consistency도 고려해 짧은 bounded refetch/reconcile을 둔다.
- 필수 테스트: pre-warmed KVS 상태에서 manual/backfill 완료 후 key 삭제 및 UI polling 종결·refetch assertion.

### P2-5. preview input/캐시가 `backfill`을 버려 설계와 실제 create가 다른 규칙을 보여준다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:198-212`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/SubscriptionForm.jsx:50-61`, `:251-258`, `useSubscriptionPreview.js:22-41`, `static/ui/src/utils/queryKey/projectKeys.js:133-139`
- 설계 계약: `_workspace/project-subscription/01_architect_design.md:452-465`, `:532-533`, `:559`
- 불일치: checkbox state가 preview hook의 rule/invoke/query key에 포함되지 않고 backend도 payload.backfill을 읽지 않는다. 화면은 의도적으로 언제나 “백필한다면” 수를 보여 주지만 v2 계약은 checkbox가 preview 위에서 count를 바꾸도록 명시한다.
- 영향: backfill=false로 저장할 사용자가 과거 전체 count를 실제 즉시 편입량으로 오해한다.
- 수정: 설계를 유지한다면 normalized rule, invoke, backend draft에 backfill을 포함하고 checkbox를 preview 위로 이동한다. 현재 UX를 택하려면 RFC와 라벨을 “과거 포함 시 예상”으로 명시적으로 변경하고 실제 신규분 preview를 별도 제공한다.
- 필수 테스트: 동일 source에서 backfill true/false query key와 count/JQL이 달라지는 hook+service contract test.

### P2-6. fail-open preview/JQL 검증이 장애를 정상 0건 또는 유효 규칙으로 바꾼다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:89-118`, `:223-233`
- 소비자: create/update/preview 전 경로
- 불일치: JQL parse API failure는 검증 통과로, approximate count 403/429/5xx는 0으로, sample 실패는 빈 배열로 바뀐다.
- 영향: invalid JQL이 저장되거나 Jira 장애/권한 실패가 “매칭 0건”으로 표시되어 사용자가 잘못된 구독을 확정한다.
- 수정: 문법 검증과 권한/transport 실패를 구분하되 둘 다 create/update를 fail-close한다. preview에는 `unavailable` typed 상태를 노출한다.
- 필수 테스트: parse null/403/429/5xx, count 403/429, sample failure 조합별 typed failure test.

### P2-7. SQL 제한·삭제 lifecycle·per-project limit가 원자적으로 보장되지 않는다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:263-275`, `src/resolver/project/ProjectService.js:92-108`
- 소비자: `src/rdb/query/ProjectSubscriptionQuery.js:56-74`
- 불일치: 프로젝트당 10개 제한은 COUNT 후 INSERT라 9개 상태의 서로 다른 source 동시 생성 두 건이 모두 통과해 11개가 된다. 프로젝트 삭제는 subscription을 포함한 자식 9종을 순차 삭제한 뒤 parent를 삭제하므로 뒤쪽 실패 시 살아 있는 project의 subscription만 사라질 수 있다. Forge SQL은 FK cascade를 지원하지 않고 statement당 query 하나만 허용한다. [Forge SQL 제한](https://developer.atlassian.com/platform/forge/storage-reference/sql/)
- 수정: limit은 project quota/slot row에 atomic conditional update를 두거나 DB가 강제할 수 있는 slot identity를 사용한다. project delete는 soft-delete + idempotent cleanup journal/state machine으로 재시작 가능하게 만든다. 단순 다중 statement를 transaction처럼 가정하면 안 된다.
- 필수 테스트: 9→동시 2 create, delete 단계별 fault injection 후 재시도해 최종 일관성을 회복하는 test.

### P2-8. source/list 경계에서 pagination과 query count 계약이 불완전하다

- 생산자: `src/resolver/projectSubscription/ProjectSubscriptionService.js:154-160`, `:165-193`
- 소비자: `static/ui/src/pages/projectDetail/issue/subscription/useSubscriptions.js:62-83`, `SourceSelect.jsx:35-47`
- 불일치: backend가 `nextCursor/isLast`를 반환하지만 hook/UI가 이를 버려 첫 100 SPACE/50 BOARD만 선택 가능하다. 구독 목록은 1 SQL 뒤 N개 source meta Jira call을 `Promise.all`로 동시 실행한다. `takenBy`는 design의 projectName 없이 projectId만 반환한다.
- 영향: source가 많은 site에서 선택 불가, 10개 구독 목록마다 최대 10 Jira call burst, “누가 사용 중인지” 설명 불가.
- 수정: source options를 `useInfiniteQuery`로 연결하고 cursor를 소비한다. list display meta는 bounded `p-limit`+짧은 KVS cache 또는 bulkable source별 cache를 사용하며 project name은 SQL join/bulk lookup으로 조달한다.
- 필수 테스트: 2-page source list, 10개 list의 최대 동시성, `takenBy.projectName` shape test.

### P2-9. UI의 source filter 및 rule editor가 backend 의미를 완전히 소비하지 않는다

- 생산자: subscription list/summary response
- 소비자: `static/ui/src/pages/projectDetail/issue/ProjectIssuePanel.jsx:57-64`, `:100-109`, `SubscriptionSummaryBar.jsx:84-126`, `SubscriptionForm.jsx:53-59`, `SubscriptionEditForm.jsx:24-38`
- 불일치: project 변경 시 `jqlMap`만 초기화하고 `forcedSpaceKeys`는 유지해 이전 project SPACE filter가 새 project에 주입된다. summary의 BOARD chip도 클릭 가능한 button이지만 상위 handler가 SPACE 외에는 즉시 return한다. backend가 지원하는 issueTypeIds는 create/edit UI 모두 제공하지 않는다.
- 영향: 프로젝트 전환 뒤 목록이 잘못 필터링되고 BOARD chip은 무반응이며 RFC rule 기능 일부가 UI에서 설정 불가하다.
- 수정: project 변경 시 forced filter를 reset하고 BOARD chip은 비활성/비클릭으로 표시하거나 board JQL filter 기능을 구현한다. source meta에서 issue types를 받아 create/edit selector를 제공한다.
- 필수 테스트: project A에서 SPACE 선택 후 project B 전환, BOARD chip click, issue type create→edit round-trip component test.

### P3-1. source 삭제와 Agile 장애 상태가 같은 code로 축약된다

- 생산자: `src/resolver/projectSubscription/SubscriptionSourceApi.js:139-147`, `:164-172`, `:251-266`
- 소비자: `src/trigger/subscriptionReconcile.js:108-116`, subscription status UI
- 불일치: board/config/filter 404가 `SUBSCRIPTION_AGILE_UNAVAILABLE`로 매핑되어 설계 C6의 `SOURCE_MISSING`과 플랫폼 장애를 구분하지 못한다.
- 수정: deleted board/filter의 404, scope/permission 403, Agile endpoint unavailable/5xx를 별도 typed status로 유지한다.
- 필수 테스트: 404/403/429/5xx status mapping table test.

### P3-2. board JQL `ORDER BY` 제거가 문자열 literal을 인식하지 못한다

- 생산자/소비자: `src/resolver/projectSubscription/SubscriptionJqlBuilder.js:59-60`, `src/resolver/projectSubscription/SubscriptionSourceApi.js:176-183`
- 불일치: 정규식이 quoted text 안의 `order by`도 그 지점부터 삭제한다.
- 영향: summary/text 검색 literal에 해당 문구가 있는 filter는 조용히 다른 JQL로 실행될 수 있다.
- 수정: Jira parse/AST 또는 quote-aware scanner로 top-level trailing ORDER BY만 제거한다.
- 필수 테스트: quoted phrase, escaped quote, nested function, 실제 trailing ORDER BY fixture.

### P3-3. 긴 board/extra JQL을 enhanced search GET query string으로 전송한다

- 생산자: `src/resolver/projectSubscription/SubscriptionSweeper.js:70-74`, `src/resolver/projectSubscription/ProjectSubscriptionService.js:227-231`
- 소비자: Jira enhanced search endpoint
- 불일치: extraJql만 1,000자이고 board filter JQL 길이는 별도 제한이 없는데 전체 JQL을 GET URL에 넣는다. Jira 문서는 query가 크면 POST search를 쓰라고 안내한다. [Jira issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- 수정: enhanced search POST body로 `jql`, `fields`, `maxResults`, `nextPageToken`을 전달한다.
- 필수 테스트: 4KB 이상 board JQL과 cursor pagination request shape test.

## 3. 통과

- **resolver 등록/권한/invoke 이름:** `ProjectSubscriptionController.js:20-41`, `src/index.js:36,86`, `PermissionMap.js:344-350`, frontend invokes가 7개 함수명에서 일치한다.
- **응답 unwrap:** backend service의 `{ content: ... }`는 `responseWrapper`를 거쳐 `{ success:true, content }`가 되고 frontend hooks는 `res.success` 확인 후 `res.content`를 소비한다.
- **source identity:** immutable numeric source id 검증과 `(source_type, source_id)` PK는 같은 source의 중복 owner를 DB에서 막는다. 단, P0-2의 issue overlap까지 막지는 않는다.
- **JQL 공통 경로:** SPACE/BOARD, `IS EMPTY`, issue types, subtask, extra JQL, baseline/watermark 조합은 `SubscriptionJqlBuilder`에 모였다. board는 filter JQL과 configuration `subQuery`를 결합한다.
- **queue 기본 한도:** push당 50 events, app-field batch 50, APPLY `p-limit(2)`가 적용되어 있다. 공식 async limit의 50 events/request와 맞는다. 단, P1-6/P2-2의 실패 처리 계약은 별도다.
- **TanStack Query key:** inline array 대신 `subscriptionKeys` factory를 사용하고 prefix invalidation도 공식 동작과 맞다.
- **i18n:** 현재 `locales/kr/subscription.json`, `locales/en/subscription.json`의 subscription keys가 `ko-KR.json`, `en-US.json`에 병합되어 있고 양 언어에 존재한다.
- **실행 검증:** root Jest 65 suites/1,057 tests, frontend Jest 64 suites/1,074 tests가 모두 통과했다. `npm run build:app`과 bundle budget도 통과했다(main gzip 273,115B / budget 1,625,293B). build에는 기존 Atlaskit source-map 누락/CSS order warning이 있다.

## 4. 미검증

- **`forge lint`:** app root에서 실행했으나 120초 동안 출력 없이 timeout되어 판정하지 않았다. 추측으로 통과 처리하지 않는다.
- **실제 설치 site scope/consent:** BOARD list/config/filter의 asUser/asApp 호출과 scope 추가 후 upgrade install은 수행하지 않았다. P1-3 수정 뒤 development site smoke test가 필요하다.
- **product event payload:** `IssueEventMatcher.js:81-87`은 baseline이 있는데 `createdAt`이 없으면 defer가 아니라 match로 진행한다. 실제 `avi:jira:created:issue` payload에서 `fields.created`, issuetype.subtask가 항상 오는지 capture하지 못했다. 누락 가능성이 확인되면 fail-close/defer로 수정해야 한다. [Jira product events](https://developer.atlassian.com/platform/forge/events-reference/jira/)
- **app-field batch 상한:** 공식 app-field API는 endpoint와 payload를 문서화하지만 issueIds의 명시적 최대 개수는 확인되지 않았다. 현재 50은 보수적 구현값이며 live 50-item smoke test가 필요하다. [Issue custom field values (apps)](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-custom-field-values--apps-/)
- **SQL 실행 계획:** `idx_subscription_sweep(is_active,last_synced_at)`가 `ORDER BY last_synced_at IS NULL DESC, last_synced_at ASC`에서 filesort 없이 쓰이는지 production-like 데이터의 `EXPLAIN`을 수행하지 않았다. query count는 subscription list가 1 SQL+N Jira, scheduled BOARD 1 SQL+board당 2 Jira+search/write임을 정적 확인했다.
- **live rate-limit/retry:** Jira가 이 endpoint 조합에 반환하는 실제 `Retry-After`, rate-limit reason, app-specific burst ceiling은 실호출하지 않았다. 구현은 header를 보존하도록 먼저 고친 뒤 429 smoke test가 필요하다.

## 5. 필수 회귀 테스트 묶음

현재 테스트가 통과해도 아래 경계는 비어 있다. release gate에 최소 다음 suites를 추가해야 한다.

1. `ProjectSubscriptionService.contract.test.js`: preview authority, create/update exact source dependency, success/error response shape, backfill input.
2. `ProjectSubscriptionRepository.contract.test.js`: 모든 SELECT projection parity(`baseline_at`, generation), conditional lease/status update affected rows.
3. `SubscriptionSweeper.crossInvocation.test.js`: cap/deadline/429 뒤 다음 invocation까지 연결한 no-skip 보장.
4. `SubscriptionOwnership.concurrency.test.js`: overlapping sources/manual action의 issue-level first-wins.
5. `SubscriptionBackfill.recovery.test.js`: partial push, duplicate delivery, crash points, stale RUNNING recovery, exactly-once stats.
6. frontend integration: error content 처리, job polling 후 cache invalidation, source infinite pagination, project 전환 filter reset.

P0와 P1을 해소하기 전에는 RFC-171을 production-ready로 판정할 수 없다.
