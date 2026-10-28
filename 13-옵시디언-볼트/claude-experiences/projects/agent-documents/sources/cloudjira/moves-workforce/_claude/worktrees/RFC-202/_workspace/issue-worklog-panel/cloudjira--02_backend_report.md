# RFC-202 백엔드 구현 리포트 — 이슈 워크로그 패널 (연결 표식 + 백필)

작성: 2026-09-22 (backend-engineer). 설계서: `_workspace/issue-worklog-panel/01_architect_design.md`
worktree: `.claude/worktrees/RFC-202` (모든 경로는 이 루트 기준)

---

## 1. 구현 파일 목록

### 신규

| 파일 | 내용 |
|---|---|
| `src/api/jira/issue/IssueLinkPropertyApi.js` | 표식 프로퍼티(`movesRmsLink`) read/write/delete/bulk. `IssuePropertyApi.js` 는 **무변경** |
| `src/api/jira/field/ProjectLinkWriter.js` | 연결 쓰기 관문 — 앱 필드 + 표식을 항상 함께 쓴다 (`p-limit` 동시 5) |
| `src/resolver/backoffice/setting/IssueLinkBackfillService.js` | 백필 잡 시작/진행률 + 프로젝트별 이슈 id 수집(`collectLinkedIssueIds`) |
| `src/api/jira/issue/__test__/IssueLinkPropertyApi.test.js` | B4·B5·B6 |
| `src/api/jira/field/__test__/ProjectLinkWriter.test.js` | B1·B2·B3 |
| `src/api/jira/field/__test__/ProjectLinkPaths.contract.test.js` | B7·B10 — 관문 우회 금지 allowlist 계약 |
| `src/resolver/projectIssue/__test__/ProjectLinkPaths.test.js` | L1·U1·B11 |
| `src/trigger/__test__/onIssueCreatedLink.test.js` | L5 |
| `src/resolver/backoffice/setting/__test__/IssueLinkBackfillService.test.js` | B12 |
| `src/queue/__test__/IssueLinkBackfillConsumer.test.js` | 백필 컨슈머(성공/실패/재시도/멱등/라이선스) |

### 수정

| 파일 | 변경 |
|---|---|
| `src/utils/errors/ErrorCodes.js` | `ISSUE_LINK_PROPERTY_READ/WRITE/DELETE`, `ISSUE_LINK_BULK`, `ISSUE_LINK_BACKFILL_NO_PROJECT` 추가 |
| `src/api/jira/field/FieldApi.js` | `isProjectIdFieldRef(fieldIdOrKey, as)` 추가 (projectId ↔ coworker 판정) |
| `src/resolver/projectIssue/ProjectUsersService.js` | L1 분기 + U1 교체 |
| `src/resolver/projectSubscription/SubscriptionSweeper.js` | L2 `applyTagging` 교체 + 표식 요청을 budget 에 반영 |
| `src/resolver/projectSubscription/SubscriptionBackfill.js` | L3 — 주석만(applyTagging 경유라 코드 변경 없음) |
| `src/queue/consumer.js` | L4 교체 + `backfillIssueLinks` 컨슈머 신규 |
| `src/trigger/onIssueCreated.js` | L5 교체 |
| `src/resolver/project/ProjectDeletionService.js` | U2 `deleteIssueLink(id,'app')` 1줄 + `safeErrorCode` 정규식에 `ISSUE_LINK_PROPERTY_DELETE_` prefix 추가 |
| `src/resolver/projectSubscription/ProjectSubscriptionService.js` | U3 — **주석만**(정책 유지 근거 명시) |
| `src/resolver/backoffice/setting/SettingController.js` | `guardedDefine` 2건 |
| `src/permission/PermissionMap.js` | `backfillIssueLinkMarkers: W('SETTINGS')`, `getIssueLinkBackfillStatus: R('SETTINGS')` |
| `src/queue/QueueKeys.js` | `ISSUE_LINK_BACKFILL_QUEUE_KEY = 'issue-link-backfill-queue'` |
| `manifest.yml` | `consumer.issue-link-backfill-consumer` + `function.backfillIssueLinks`(600s) |
| `src/resolver/project/__test__/ProjectDeletionService.test.js` | B9 3케이스 추가 + `IssueLinkPropertyApi` mock |
| `src/resolver/projectSubscription/__test__/SubscriptionSweeper.test.js` | 표식 mock + L2 표식 write 단정 추가 |

**`src/index.js` 무변경** — 신규 컨트롤러를 만들지 않고 `SettingController` 에 합류시켰다(`CONTROLLER_REGISTRARS` 변경 없음).
**DB 무변경** — MySQL 스키마·KVS 엔티티·`manifest.storage` 전부 그대로(진행률은 기존 `job`/`job_batch`/`job_fail` 재사용).

---

## 2. resolver 응답 shape (실제 구현 — 프론트가 읽는 값)

> 둘 다 `guardedDefine` 등록이므로 성공 응답은 서비스 반환값을 **루트에 스프레드**한다 → `{ success: true, content: {...} }`.
> 실패는 전 리포 공통 `{ success: false, error: { name, code, message, cause } }`.

### 2-1. `backfillIssueLinkMarkers` — payload `{}` (인자 없음)

```js
// 새 잡을 시작했을 때
{ success: true, content: { jobId: 'issue-link-backfill-<uuid>', projectCount: 12, alreadyRunning: false } }

// 이미 도는 백필이 있을 때 — 새로 시작하지 않고 그 잡을 돌려준다(단일 실행)
{ success: true, content: { jobId: 'issue-link-backfill-<uuid>', projectCount: 12, alreadyRunning: true } }

// 프로젝트가 0건일 때 — 잡을 만들지 않는다
{ success: true, content: { jobId: null, projectCount: 0, alreadyRunning: false } }
```
- `jobId` 는 **`null` 일 수 있다** → 프론트는 `jobId` 가 null 이면 폴링을 시작하지 말고 "대상 없음"으로 끝내야 한다.
- **`alreadyRunning: true`** 면 이미 진행 중인 잡이다 → 그 `jobId` 로 폴링만 붙이면 된다(중복 실행 아님을 안내해도 좋다).
- `projectCount` = 진행률의 분모(`total`)와 같은 수다(프로젝트 1건 = 배치 1건).
- 큐 적재 실패 시 `{ success:false, error.code:'ISSUE_LINK_BACKFILL_ENQUEUE_FAILED' }` — 잡은 `FAILED` 로 닫히므로 재실행이 가능하다.
- 권한: `W('SETTINGS')`, `project: 'none'`.

### 2-2. `getIssueLinkBackfillStatus` — payload `{ jobId: string }`

```js
{ success: true, content: { status: 'RUNNING' | 'DONE' | 'FAILED', total: 12, processed: 7, failed: 1 } }
```
- `status` 매핑(실제 구현): KVS `job.status` 가 `RUNNING`→`RUNNING`, `COMPLETED`/`PARTIAL`→`DONE`, `FAILED`→`FAILED`, 그 외/미상→`RUNNING`.
  즉 **`PARTIAL` 은 `DONE` + `failed > 0`** 으로 내려온다 → i18n `setting.issueLinkBackfill.done`("완료 (실패 {failed}건)")이 그대로 맞는다.
- **`jobId` 의 잡이 없으면(TTL 만료·미지의 id) `{ status:'DONE', total:0, processed:0, failed:0 }`** 이다. 존재하지 않는 잡을 RUNNING 으로 주면 프론트가 영구 폴링하므로 의도적으로 DONE 이다.
- `jobId` 누락/공백 → `{ success:false, error.code:'JOB_ID_REQUIRED' }`.
- KVS 조회 실패 → `error.code:'JOB_STATUS_READ_FAILED'`.
- 권한: `R('SETTINGS')`, `project: 'none'`.

### 2-3. 패널이 쓰는 기존 resolver — **백엔드 변경 0**

`getSettingData` / `getPublicHolidayList` / `userPermissionCheck` / `findProjectById` 전부 계약·구현 그대로다(설계 §2-B 표가 유효).

### 2-4. 표식 프로퍼티의 실제 저장 형태 (프론트가 `properties.movesRmsLink` 로 읽는 값)

```json
{ "linked": true, "projectId": "11111111-1111-1111-1111-111111111111" }
```
- `projectId` 는 **항상 문자열**이다(숫자 id 가 와도 `String()`).
- 해제는 **키 삭제**다 → 해제된 이슈의 `properties.movesRmsLink` 는 응답에 없다(`undefined`). `linked:false` 라는 값은 **절대 저장하지 않는다** → 프론트 판정은 설계 그대로 `properties.movesRmsLink?.linked !== true` 로 두면 된다.

---

## 3. 연결/해제 경로 교체 — 전/후 대조표

| # | 위치 | 교체 전 | 교체 후 |
|---|---|---|---|
| L1 | `ProjectUsersService.updateProjectIdFieldService` | `setAppFieldValueForIssues({fieldIdOrKey: customFieldId, issueIds, value: rawValue})` (projectId·coworker 겸용) | `isProjectIdFieldRef(customFieldId)` 판정 후 ▸ projectId+값 → `writeProjectLink({fieldIdOrKey, issueIds, projectId})` ▸ projectId+빈값 → `clearProjectLink(...)` ▸ coworker(배열) → **기존 `setAppFieldValueForIssues` 유지** |
| L2 | `SubscriptionSweeper.applyTagging` | `setAppFieldValueForIssues({... value: String(projectId)})`, `budget.spend(1)` | `writeProjectLink({fieldIdOrKey: fieldId, issueIds: chunk, projectId})`, `budget.spend(1 + markerWritten + markerFailed.length)` |
| L3 | `SubscriptionBackfill.enqueueSubscriptionBackfill` | `applyTagging(...)` | **코드 변경 없음** — L2 경유라 표식이 자동으로 따라온다(주석만 추가). 계약 테스트가 "직접 필드 write 없음"을 고정 |
| L4 | `queue/consumer.backfillSubscription` | `setAppFieldValueForIssues({... value: String(sub.projectId)})` | `writeProjectLink({fieldIdOrKey: fieldId, issueIds, projectId: sub.projectId})` (retry 판정 불변 — 표식은 throw 하지 않는다) |
| L5 | `trigger/onIssueCreated` | `setAppFieldValueForIssues({... issueIds:[evt.issueId]})` | `writeProjectLink({fieldIdOrKey: fieldId, issueIds:[evt.issueId], projectId: sub.projectId})` (트리거는 여전히 throw 하지 않는다) |
| L6 | `AppFieldValueApi.setAppFieldValues/ForIssues` | — | **무변경**(coworker write 도 쓰는 저수준 관문이라 여기서 분기하지 않는다) |
| U1 | `ProjectUsersService.deleteProjectIssueService` | `setAppFieldValueForIssues({... value: ''})` | `clearProjectLink({fieldIdOrKey: customFieldId, issueIds})` |
| U2 | `ProjectDeletionService.unlinkOneBatch` | `deleteIssueProperty(id,'app')` → `markIssuePropertyCleared` | `deleteIssueProperty(id,'app')` → **`deleteIssueLink(id,'app')`** → `markIssuePropertyCleared` (둘 다 끝나야 체크포인트가 찍히므로 중단 시 재시도됨) |
| U3 | `ProjectSubscriptionService.deleteProjectSubscriptionService` | 아무것도 되돌리지 않음 | **무변경**(주석만). 필드가 남아 연결이 유지되는 현행 정책에 표식도 맞춘다 |

`setAppFieldValueForIssues` **직접 호출자는 3곳**으로 고정되며, 계약 테스트가 allowlist 를 강제한다:
`ProjectLinkWriter.js`(관문) / `ProjectUsersService.js`(coworker 분기) / `ProjectDeletionService.js`(saga 체크포인트).
→ 새 연결 경로가 생겨 직접 호출하면 `ProjectLinkPaths.contract.test.js` 가 즉시 실패한다.

---

## 4. 관문 계약 (백엔드 내부 소비자용)

```js
// src/api/jira/field/ProjectLinkWriter.js
writeProjectLink({ fieldIdOrKey, issueIds, projectId, as = 'app', batchSize })
  → { fieldWritten: number, markerWritten: number, markerFailed: string[] }     // 필드 실패 시에만 throw
clearProjectLink({ fieldIdOrKey, issueIds, as = 'app', batchSize })
  → { fieldWritten: number, markerCleared: number, markerFailed: string[] }     // 필드 실패 시에만 throw
```

```js
// src/api/jira/issue/IssueLinkPropertyApi.js
MOVES_LINK_PROPERTY_KEY = 'movesRmsLink'
BULK_ENTITY_LIMIT = 10000 / BULK_TASK_POLL_INTERVAL_MS = 2000 / BULK_TASK_TIMEOUT_MS = 60000
readIssueLink(issueIdOrKey, as = 'user')            → Object   // 200→value, 404→{}
writeIssueLink(issueIdOrKey, projectId, as = 'app') → true     // PUT 전체교체 {linked:true, projectId:String}
deleteIssueLink(issueIdOrKey, as = 'app')           → true     // 404→true(멱등)
bulkSetIssueLink({ issueIds, projectId, as = 'app',
                   pollIntervalMs?, pollTimeoutMs?, sleep? }) → true
//   PUT /issue/properties/movesRmsLink + filter.entityIds → 303 은 **접수**다
//   → Location 의 task 를 COMPLETE 까지 폴링(상한 60초). 미완료·실패·task 조회 실패는 throw
awaitBulkTask(client, taskId, opts) / taskIdFromLocation(location)
buildLinkValue(projectId) / normalizeEntityIds(ids)            // 순수 헬퍼(테스트·재사용)
```

```js
// src/resolver/backoffice/setting/IssueLinkBackfillService.js
BACKFILL_WORK_BUDGET_MS = 480_000 / BACKFILL_POINTER_KEY = 'IssueLinkBackfill:current'
collectLinkedIssueIds(projectId, { cursor, deadlineAt })
  → { issueIds: string[], nextPageToken: string|null, completed: boolean }   // 건수 cap 없음
enqueueBackfillContinuation({ appJobId, batchId, batchIndex, totalBatches, projectId, cursor, issuesSoFar })
```

---

## 5. 설계 이탈 / 설계에 없던 결정

| # | 항목 | 내용과 이유 |
|---|---|---|
| D1 | `writeProjectLink`/`clearProjectLink` 에 **`fieldIdOrKey` 인자 추가** | 설계 §4-4 의 시그니처는 `{issueIds, projectId, as}` 였지만 필드 write 에 field id 가 반드시 필요하다. 호출부(L1~L5)는 이미 field id 를 해석해 갖고 있고, 관문이 내부에서 `getProjectIdFieldIdApi` 를 다시 부르면 "필드 없음"을 특수 처리하는 기존 경로들(컨슈머는 throw, 트리거는 return)의 의미가 바뀐다 → 인자로 받는다. **동작 이탈은 없다.** |
| D2 | `clearProjectLink` 반환 키는 `markerCleared` | 삭제에 `markerWritten` 은 오독을 만든다. `markerFailed` 는 동일. |
| D3 | `FieldApi.isProjectIdFieldRef` 신설 | 설계는 "fieldIdOrKey 가 projectIdField 인 경우에만"이라고만 했다. 프론트는 key 형식(`{appId}__{envId}__projectIdField`)을 보내므로 접미사로 정확히 갈리고, 해석된 `customfield_xxxxx` 가 오는 경우만 실제 필드 id 와 대조한다(캐시됨). **판정 불가는 `false`** — 표식 누락은 백필이 흡수하지만, coworker write 에 표식이 잘못 붙으면 연결 안 된 이슈에 패널이 뜬다(더 나쁜 실패). |
| D4 | L1 에 "projectId 필드 + 빈 값 → `clearProjectLink`" 분기 추가 | 설계 표에는 없지만 같은 resolver 로 필드를 비울 수 있는 형태(문자열 `''`)라 표식만 남는 우회가 생긴다. 읽기↔쓰기 대칭 규칙에 맞춰 막았다. |
| D5 | `ProjectDeletionService.safeErrorCode` 정규식 확장 | `ISSUE_LINK_PROPERTY_DELETE_403/429` 가 기존 `ISSUE_PROPERTY_DELETE_*` 와 **같은 방식으로** `PROJECT_DELETION_JIRA_HTTP_{status}` 로 축약되도록 prefix 1개 추가. 없으면 표식 실패만 뭉뚱그린 `UNLINK_FAILED` 가 되어 진단이 갈린다. |
| D6 | **L2 스윕 budget 이 표식 요청을 계산에 넣는다** | 표식은 이슈당 1요청이라 50건 청크의 비용이 1 → 51 로 늘어난다. 정확히 계상하지 않으면 시간별 리컨실이 요청 예산(600)을 실제로는 초과한다(429 위험). 결과: **한 번의 스윕이 태깅하는 양이 줄어든다(대략 500~550건/주기)**. 남은 이슈는 다음 주기가 다시 잡는다(`IS EMPTY` 라 멱등, 영구 누락 없음). 대량 편입의 정상 경로는 큐 백필(L4, 배치당 50건·invocation 분리)이라 체감 영향은 작다. 설계 §5-5 "새 구조를 만들지 않는다"를 따랐다. |
| D7 | 백필 대상 = **전 프로젝트**(종료 포함) | 설계는 "활성+종료 전"이라고 썼지만 종료된 프로젝트의 이슈도 여전히 연결돼 있고 이슈 화면에서 공수를 볼 이유가 있다. `getAllProjectsRepository(scopedProjectIds(SYSTEM_PRINCIPAL))` (=전체) 를 쓴다. `SYSTEM_PRINCIPAL` 을 **명시**한다 — `scopedProjectIds(undefined)` 는 0건 fail-close 라 빠뜨리면 조용히 아무 일도 안 한다(RFC-198). |
| D8 | `collectLinkedIssueIds` 의 프로젝트당 상한 `MAX_ISSUES_PER_PROJECT = 30000` | 무한 페이징을 막는다. 초과 시 `capped: true` 로 알리고(조용히 자르지 않는다) 재실행이 나머지를 채운다(멱등). |
| D9 | 백필 컨슈머는 실패해도 **배치를 done 으로 닫는다** | 한 프로젝트가 막혀 job 이 RUNNING 에 영구 잔류하면 진행률이 끝나지 않는다. `job_fail` 에 사유를 남기고 `failCount:1` 로 닫아 `status:'DONE', failed:n` 이 되게 한다(일시 오류는 최대 3회 재시도 후). |
| D10 | `jira:entityProperty` 블록 **미추가** | 설계 §3-3 의 기본 방침(미선언)을 따랐다. dev 실측(E2E V1)에서 `displayConditions` 가 미선언 프로퍼티를 못 읽으면 설계서에 준비된 블록을 추가해야 한다 — **배포 검증 필수 항목**. |

### 5-1. Codex 검토 반영 (2차 수정)

| # | 지적 | 수정 |
|---|---|---|
| B1 | `deleteProjectIssueService` 가 클라이언트 `customFieldId` 를 검증 없이 `clearProjectLink` 에 넘겨, 다른 앱 필드(coworker)를 비우고 표식까지 지울 수 있었다 | L1 과 **같은 판정 함수**(`isProjectIdFieldRef`)를 쓰고 아니면 `projectScopeDenied()` 로 거부. 읽기↔쓰기 검증을 공용 함수로 공유하는 규칙 준수. 테스트: coworker key·미상 customfield id 둘 다 거부 + `clearProjectLink` 미호출 |
| B2 | bulk PUT 의 `303` 은 **접수**일 뿐인데 즉시 성공 처리 → 실제로 한 건도 안 써졌는데 백필이 "완료"로 끝날 수 있었다 | `Location` 의 task 를 `GET /rest/api/3/task/{id}` 로 **2초 간격·최대 60초** 폴링. `COMPLETE` 만 성공, `FAILED/CANCELLED/DEAD/CANCEL_REQUESTED`·예산 초과·task 조회 실패(404 포함)는 throw → 컨슈머가 `job_fail` 기록 후 `PARTIAL`. `2xx`(동기 완료)는 task 를 보지 않는다. ⚠ 에러 message 에 `timeout` 단어를 쓰지 않는다(컨슈머 `retryCondition` 이 문자열로 일시 오류를 판정해 불필요한 재시도가 붙는다) |
| B3 | 프로젝트당 30,000건 cap 이 매 실행마다 **첫 페이지부터 같은 구간**을 읽어 초과분이 영구 누락 | cap 제거 + **시간 예산 이어달리기**. `collectLinkedIssueIds(projectId,{cursor,deadlineAt})` 가 `{issueIds, nextPageToken, completed}` 를 주고, 컨슈머는 예산(480초) 소진 시 `enqueueBackfillContinuation` 으로 **같은 batchId/batchIndex** 로 재적재한다(배치를 닫지 않으므로 잡은 RUNNING 유지, `checkJobCompletion` 키 규칙도 그대로). 페이지당 최소 1회는 반드시 요청해 전진을 보장하고, 커서가 전진하지 않으면 `ISSUE_LINK_BACKFILL_CURSOR_STUCK` 으로 즉시 실패(무한 루프 방지) |
| B4 | job 생성 후 enqueue 실패 시 `RUNNING` 유령 잡이 TTL 까지 남는다 / 중복 실행 가능 | enqueue 실패 시 잡을 `FAILED` 로 닫고 포인터를 지우고 `ISSUE_LINK_BACKFILL_ENQUEUE_FAILED` 전파. **단일 실행** — 평문 KVS 포인터(`IssueLinkBackfill:current`, TTL 1일)가 가리키는 잡이 RUNNING 이면 새로 만들지 않고 그 `jobId` + `alreadyRunning:true` 를 돌려준다. `job` 커스텀 엔티티에 속성을 못 붙이므로(422) 포인터는 `kvs.set` 을 쓴다(`PortfolioSnapshotRepository.ROLLUP_KEY` 전례) → **manifest storage 여전히 무변경** |

> `ProjectSubscriptionService.js:557` 의 `getProjectIdFieldIdApi()` authority 지적은 develop 의 다른 커밋(`af667bf`)이
> 이미 `'app'` 으로 고친 부분이라 이 worktree 에서 건드리지 않았다(머지 시 합쳐진다).

---

## 6. 테스트 결과

### 6-1. 백엔드 전체 (`npx jest`, 루트)

```
Test Suites: 123 passed, 123 total
Tests:       1668 passed, 1668 total
```
> 실행 명령: `npx jest --testPathPatterns "(src|test)[\\/].*" --testPathIgnorePatterns "static"`
>
> ⚠ **인수 없는 `npx jest` 는 `static/ui/**` 의 프론트 테스트까지 스캔해 60여 suite 가 "Test suite failed to run"** 으로 뜬다.
> 원인은 `jest.config.js` 의 `testPathIgnorePatterns: ["<rootDir>/static/ui/"]` 가 Windows 절대경로(백슬래시)에
> 정규식으로 매칭되지 않기 때문이고(패턴의 `\C`·`\m` 등이 이스케이프로 먹힌다), 실패 사유는 전부
> `SyntaxError: Cannot use import statement outside a module` — 루트 `.babelrc` 가 자체 package.json 을 가진
> `static/ui` 에 적용되지 않는 **기존 환경 문제**다. 이번 변경과 무관하며(`src/` 만 건드렸다) 프론트 테스트는
> `cd static/ui && npm test` 로 돌려야 한다. 이 리포트의 수치는 백엔드 대상만 걸러 낸 것이다.

### 6-2. 설계 §9-1 항목별

| # | 대상 | 결과 | 테스트 위치 |
|---|---|---|---|
| B1 | `writeProjectLink` 필드 1회 + 표식 N회, 반환 shape | ✅ | `field/__test__/ProjectLinkWriter.test.js` |
| B2 | 표식 실패 → throw 없이 `markerFailed` / 필드 실패 → throw + 표식 미실행 | ✅ | 같은 파일 (순서 단정 포함) |
| B3 | `clearProjectLink` 필드 `''` + 표식 DELETE, 404 성공 취급 | ✅ | 같은 파일 |
| B4 | write body = `{linked:true, projectId:'<string>'}` (숫자도 문자열화) | ✅ | `issue/__test__/IssueLinkPropertyApi.test.js` |
| B5 | `filter.entityIds`(숫자), 10,000 초과 분할, 303 성공 | ✅ | 같은 파일 |
| B6 | authority — write/delete/bulk `app` 기본, read `user` 기본, 잘못된 값 `ForgeAPIError` | ✅ | 같은 파일 |
| B7 | 연결 경로 전수(L1~L5) | ✅ | 소스 계약(`ProjectLinkPaths.contract.test.js`, allowlist 3개 고정) + 동작(L1 `projectIssue/__test__/ProjectLinkPaths.test.js`, L2 `SubscriptionSweeper.test.js`, L5 `trigger/__test__/onIssueCreatedLink.test.js`) |
| B8 | `deleteProjectIssueService` → `clearProjectLink` | ✅ | `projectIssue/__test__/ProjectLinkPaths.test.js` |
| B9 | 삭제 saga 가 `movesRms`+`movesRmsLink` 둘 다 삭제, 체크포인트 멱등 | ✅ | `project/__test__/ProjectDeletionService.test.js` (3케이스 추가) |
| B10 | 구독 해제는 표식을 지우지 않는다 | ✅ | `ProjectLinkPaths.contract.test.js` |
| B11 | coworker 분기는 표식을 쓰지 않는다 | ✅ | `projectIssue/__test__/ProjectLinkPaths.test.js` (빈 배열 케이스 포함) |
| B12 | 백필 서비스 — 큐 push·job 생성·응답 shape·status 축약 | ✅ | `backoffice/setting/__test__/IssueLinkBackfillService.test.js` |
| 추가 | 백필 컨슈머 — bulk write·0건 no-op·실패 시 배치 닫힘(PARTIAL)·429 재시도·멱등·라이선스 | ✅ | `queue/__test__/IssueLinkBackfillConsumer.test.js` |
| B1′ | "제외"가 projectId 필드가 아닌 참조를 거부 | ✅ | `projectIssue/__test__/ProjectLinkPaths.test.js` |
| B2′ | bulk 303 → task COMPLETE 성공 / FAILED·CANCELLED·DEAD 실패 / 예산 초과 실패 / task 404 실패 / Location 없음 실패 / 2xx 는 task 미조회 | ✅ | `issue/__test__/IssueLinkPropertyApi.test.js` |
| B3′ | cursor 이어받기·예산 소진 시 커서 반환·커서 정지 감지·같은 batchId 재적재·컨슈머가 배치를 닫지 않음 | ✅ | `setting/__test__/IssueLinkBackfillService.test.js`, `queue/__test__/IssueLinkBackfillConsumer.test.js` |
| B4′ | RUNNING 잡 재사용(`alreadyRunning`)·종료된 잡 뒤 새 시작·enqueue 실패 시 FAILED+포인터 삭제+전파 | ✅ | `setting/__test__/IssueLinkBackfillService.test.js` |
| B13 | 신규 resolver 2개가 `PERMISSION_MAP` 에 등재 | ✅ | 기존 `test/permission/permissionMap.contract.test.js` 통과(양방향 계약) |

**픽스처 주의 반영**: 필드 판정 테스트는 실제 Jira 응답 형태를 쓴다 — `key` 접미사가 manifest key(`…__projectIdField`),
`name` 이 표시 이름(`moves_RMS_projectId`). 2026-09-22 사고(둘을 뒤집은 픽스처로 통과)를 재발시키지 않도록
`ProjectLinkPaths.test.js` 는 `FieldApi` 를 mock 하지 않고 **필드 목록만** 스텁해 실제 판정 로직을 통과시킨다.

---

## 7. 프론트가 알아야 할 것 (요약)

0. `backfillIssueLinkMarkers` 응답에 **`alreadyRunning: boolean` 이 추가됐다**(설계 계약 대비 필드 1개 추가).
   `true` 면 이미 진행 중인 잡이라 새로 시작되지 않았다 — 같이 온 `jobId` 로 폴링만 붙인다.
1. `backfillIssueLinkMarkers` 는 `content.jobId` 가 **null 일 수 있다**(프로젝트 0건) → 폴링을 시작하지 말 것.
2. `getIssueLinkBackfillStatus` 의 `status` 는 3값(`RUNNING|DONE|FAILED`)이고 **`PARTIAL` 은 `DONE`+`failed>0`** 으로 온다.
   존재하지 않는 jobId 도 `DONE`(전부 0)이다 → `status !== 'RUNNING'` 이면 폴링 종료.
3. 표식은 해제 시 **키가 삭제**된다 → `properties.movesRmsLink` 가 아예 없을 수 있다(`?.linked !== true` 판정 유지).
4. `movesRmsLink.projectId` 는 항상 문자열이다(딥링크 `/project/{projectId}` 에 그대로 쓸 수 있다).
5. 백필 UI 는 `/backoffice/setting` 의 기타 설정 카드에 붙이면 되고, 권한 게이트는 `SETTINGS`(실행=write, 조회=read)다.

## 8. 배포 전 확인이 필요한 것 (자동화 불가)

- **V1** `displayConditions.entityPropertyEqualTo` + `objectName` 이 **미선언** 프로퍼티(`movesRmsLink`)에서 평가되는가.
  안 되면 설계 §3-3 의 `jira:entityProperty` 블록 추가 + `forge deploy`(백엔드 추가 작업 ≈ 5줄).
- **V2** `PUT /rest/api/3/issue/properties/movesRmsLink` (asApp, `filter.entityIds`) 의 응답이 `303` + `Location: …/task/{id}` 인가.
  현재 구현은 `2xx` → 즉시 완료, `3xx` → Location 의 task 를 `COMPLETE` 까지 폴링(최대 60초), `4xx/5xx` → 실패다.
  Location 이 없거나 형식이 다르면 `ISSUE_LINK_BULK_TASK_UNKNOWN` 으로 배치가 실패하므로(백필만 영향, 연결 경로는 무관)
  실측 후 파서(`taskIdFromLocation`)를 맞춰야 한다.
- 백필 잡 1회 실행 후 기존 연결 이슈에 패널이 뜨는가(E8).
