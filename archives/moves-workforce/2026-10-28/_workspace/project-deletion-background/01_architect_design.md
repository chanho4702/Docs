# 프로젝트 삭제 백그라운드화 + Jira 호출 효율화 설계서

> 입력: `00_input/requirement.md` (2026-10-06). 참고: `_workspace/project-deletion-hardening/01_architect_design.md`(체크포인트·lease·requested_by 재시도 정책 — 전부 유지).
> 원칙: 최소 변경. 신규 resolver 없음, DDL 무변경, 상태 enum·DTO shape 무변경. 결정마다 「근거」 한 줄.

## 1. 개요 / 영향 범위

**핵심 구조 — 2단 분담**

| 단계 | 실행 주체 | 권한 | 하는 일 | 화면 유지 필요 |
|---|---|---|---|---|
| ① 준비(PREPARE) | resolver `deleteProject` (기존 이어 호출 2.5s) | asUser + asApp | 발견(asApp JQL) → 행 적재(`UNVERIFIED`) → **asUser 접근 판정** → BLOCKED 있으면 **쓰기 전에** 정지 | 예 (보통 1~2회 호출로 끝남) |
| ② 실행(EXECUTE) | 큐 컨슈머 `projectDeletion` (600s, 이어달리기) | asApp 만 | 연결 재확인(일괄) → 프로퍼티 DELETE(병렬) → 재확인 → 필드 일괄 비우기 → SQL 10단계 → 캐시 → 완료 | 아니오 |

근거: 컨슈머엔 사용자 컨텍스트가 없으므로 asUser 판정은 ①에서 끝내고 결과(`issue_state`)를 DB에 남긴다. 컨슈머는 `PENDING`(=판정 통과) 행만 쓴다.

| 축 | 변경 |
|---|---|
| 백엔드 | `ProjectDeletionService.js`(① 재구성 + ② 분리), 신규 `ProjectDeletionWorker.js`(컨슈머 본체), 신규 `deletionJiraRetry.js`(삭제 전용 재시도), `ProjectDeletionRepository/Query.js`(쿼리 추가), `IssueApi.js`(app 연결 확인 export 1개), `queue/consumer.js`(얇은 export 1개), `QueueKeys.js` |
| 공용 래퍼 | `RequestJiaJson.js`·`IssuePropertyApi.deleteIssueProperty`·`IssueLinkPropertyApi.deleteIssueLink`·`AppFieldValueApi.setAppFieldValues` — **에러 객체에 `retryAfterMs` 필드만 부착**(동작 무변경) |
| 프론트 | `projectDeletionState.js`, `ProjectDeletionStatusModal.jsx`, `ProjectList.jsx`, `ProjectDetailDrawer.jsx`(라벨), `ProjectKanbanBoard.jsx`, `useKanbanMutations.js`, `KanbanCard.jsx`(배지·라벨) |
| DB | 테이블 무변경. `issue_state` 값에 `UNVERIFIED` 추가(VARCHAR(32)라 DDL 불필요). `steps_json` 키 `accessVerified`·`queueSeq` 추가(JSON이라 DDL 불필요) |
| manifest | consumer `project-deletion-consumer` / queue `project-deletion-queue` / function `projectDeletion`(timeoutSeconds 600) |
| i18n | `locales/kr/project.json`·`locales/en/project.json` 에 6키 |
| 권한 | `PermissionMap` 무변경(신규 resolver 없음). `assertDeletionAccess` 무변경 |

## 2. 경계면 계약

### 2-1. resolver (shape 무변경)

| resolver 함수 | 입력 | 응답 (success) | 프론트 소비 |
|---|---|---|---|
| `deleteProject` | `{ project_id: string }` | `{ success:true, content:{ deletion: DeletionDTO } }` — 기존과 동일 | `ProjectList` mutation, `useKanbanMutations.deleteCardMutation` (준비 단계 이어 호출 / 재시도 / 재진입 / 주기적 kick) |
| `getProjectDeletionStatus` | `{ project_id: string }` | `{ success:true, content:{ deletion: DeletionDTO } }` — 기존과 동일 | **신규 소비**: 백그라운드 단계 폴링 (`projectDeletionState.fetchDeletionStatus`) |

`DeletionDTO` (필드·타입 기존 그대로):
```
{ projectId, status, stage, completed, retryable, blockedIssueCount, attempt,
  issueCounts:{ discovered, pending, unlinked, inaccessible, failed },
  sqlSteps:{ projectUsers..project: 'DONE'|'PENDING' }, lastError:{code,stage}|null, updatedAt }
```
의미 변경 2건(shape 불변):
- `issueCounts.pending` = `PENDING + UNVERIFIED` 개수. 근거: UNVERIFIED도 "아직 처리 안 됨"이고 프론트에 새 필드를 만들지 않기 위해.
- `lastError` 가 **진행 중 상태(DISCOVERING/UNLINKING)** 에서도 non-null 일 수 있다 — 일시 오류(429/5xx) 후 자동 재시도 대기 중임을 뜻함. 프론트는 진행 중 상태에서 lastError를 "지연 안내"로만 표시.

### 2-2. 상태 enum — 값 무변경, 주체만 명시

| status | 주체 | 프론트 동작 |
|---|---|---|
| `DISCOVERING` (PENDING 포함) | resolver(①) | 2.5s 후 `deleteProject` 재호출(기존) |
| `UNLINKING`, `SQL_CLEANUP` | 컨슈머(②) | 5s 간격 `getProjectDeletionStatus` 폴링, 12회마다 1회는 `deleteProject`(stale kick) |
| `BLOCKED_JIRA_ACCESS`, `FAILED`, `COMPLETED_WITH_WARNINGS` | 정지 | 재시도 버튼 → `deleteProject` |
| `COMPLETED` | 종료 | 모달 닫고 성공 토스트 + `invalidateProjectViews` |

`stage` 값도 기존(`DISCOVER/UNLINK/SQL/CACHE/DONE` + SQL 세부 stage) 그대로.

### 2-3. 큐 이벤트 계약 (백엔드 내부)

queue key `project-deletion-queue` (`QueueKeys.PROJECT_DELETION_QUEUE_KEY`), body:
```
{ projectId: string(uuid), seq: integer >= 1, transientRounds: integer >= 0 }
```
- 적재: `createQueue(KEY).push([{ body, delayInSeconds? }])` 직접 호출(지연 필요). `pushQueueEvents`는 delay 미지원이라 쓰지 않음.
- 유효성: uuid 정규식(`consumer.js` 의 `PROJECT_WORKLOG_UUID_RE` 재사용) + seq 정수. 불일치 이벤트는 조용히 return.
- concurrency key 미사용. 근거: 같은 프로젝트 배타는 lease가 보장, 여러 프로젝트 동시 삭제는 드묾.

### 2-4. 이슈 행 상태 (`project_deletion_issue.issue_state`, 내부)

```
UNVERIFIED ──(asUser 보임)──────────────▶ PENDING ──(컨슈머 해제 완료/연결 없음)──▶ DONE
     │──(asUser 안 보임 + app 기준 연결됨)─▶ BLOCKED_INACCESSIBLE
     └──(asUser 안 보임 + app 기준 연결 없음)▶ DONE
PENDING ──(비일시 Jira 오류)──▶ FAILED
재시도(resolver): BLOCKED_INACCESSIBLE·FAILED ──▶ UNVERIFIED (다시 판정)
```
근거: "판정 통과" 표식을 행 상태 자체로 두면 별도 컬럼·커서 없이 `WHERE issue_state='UNVERIFIED' LIMIT n` 반복만으로 진행이 보장된다(판정된 행은 반드시 UNVERIFIED를 벗어남).

## 3. 백엔드 설계

### 3-1. resolver 단계 (`deleteProjectService` 재구성)

```
deleteProjectService(payload, principal, context)
  [기존 그대로] 입력 검증 · assertDeletionAccess · context 신원 일치 · 최초면 markProjectDeleting + createDeletion
  deletion = findDeletion
  if status ∈ {UNLINKING, SQL_CLEANUP}:            ← 백그라운드 단계: 일하지 않는다
      kickIfStale(projectId); return statusDto
  if status == COMPLETED: return statusDto
  claim lease 55s (기존 CLAIM) → 실패면 statusDto
  re-read deletion (기존 패턴)
  try:
    if status ∈ {FAILED, BLOCKED_JIRA_ACCESS}: requeueUnverified(BLOCKED·FAILED → UNVERIFIED)
    if !steps.accessVerified && steps.discover=='DONE' && steps.project!='DONE':
        requeueUnverified(PENDING·FAILED·BLOCKED → UNVERIFIED)   ← 배포 시점 진행 중이던 구버전 삭제 1회 보정
    setDeletionState(DISCOVERING, DISCOVER)
    discover: 페이지(asApp, 100건) → upsert(UNVERIFIED) → cursor checkpoint   (기존 discover 그대로, upsert 상태만 변경)
    verify loop: rows = UNVERIFIED LIMIT 150 → verifyIssueAccess(rows) 반복, hasTime 검사
    예산 소진 → return statusDto (DISCOVERING, 프론트가 이어 호출)
    counts.BLOCKED_INACCESSIBLE > 0 → setDeletionState(BLOCKED_JIRA_ACCESS, DISCOVER, ACCESS_BLOCKED); return
    markDeletionSqlStepDone(accessVerified)
    next = (PENDING>0) ? (UNLINKING, UNLINK) : (SQL_CLEANUP, SQL)
    setDeletionState(next)                          ← COMPLETED_WITH_WARNINGS 재시도도 여기로(SQL_CLEANUP)
    seq = (steps.queueSeq ?? 0) + 1; setQueueSeqLeased(seq, lease)
  finally: releaseDeletionLease
  release 후 enqueue({projectId, seq, transientRounds:0})   ← 반드시 release 뒤 (컨슈머가 lease에 막히지 않게)
  return statusDto
```

`verifyIssueAccess(projectId, ids)` — ①의 유일한 판정 함수(재시도·구버전 보정도 같은 함수):
1. ids를 50개씩 나눠 `findAccessibleProjectDeletionIssueIdsAsUser` (기존 함수, reconcileIssues ≤50) — `p-limit(3)`.
2. 안 보이는 id만 `findLinkedProjectDeletionIssueIdsAsApp`(신규 export, 같은 JQL을 asApp) 50개씩.
3. 일괄 갱신: 보임 → `PENDING`, 안 보임∧app연결 → `BLOCKED_INACCESSIBLE`(code `PROJECT_DELETION_JIRA_ACCESS_BLOCKED`), 안 보임∧연결없음 → `DONE`. (`MARK_ISSUES_STATE(n)`, `issue_state <> 'DONE'` 조건)

근거: BLOCKED 판정을 **어떤 쓰기보다 먼저** 끝내 "요청자가 못 보는 이슈는 건드리지 않는다" 장벽을 ① 안에 가둔다(현행보다 엄격 — 현행은 배치 중 일부를 쓰고 나서 BLOCKED로 멈춤).

**큰 발견(수천 건) 분할:** 발견은 list+upsert만(페이지당 ~0.5s, 15s에 ~2,500건), 판정은 150행/회차 병렬(asUser 50×3). 예산 소진 시 DISCOVERING 반환 → 프론트 2.5s 이어 호출. 진행은 `discoverCursor`(기존) + `UNVERIFIED` 상태로 영속되므로 창을 닫았다 다시 열어도 이어진다. 5,000건 ≈ 4~5회 호출(1분 내외). 근거: 사용자 컨텍스트가 필요한 구간만 화면에 남기고 그 구간을 최소화.

**resolver 25초 초과 방지:** `WORK_BUDGET_MS` 15000 → **12000**, 각 Jira 호출 직전 `hasTime` 검사(기존), resolver 내 재시도는 대기가 deadline 안에 들어갈 때만 1회(§3-4). 일시 오류가 소진되면 FAILED가 아니라 `setDeletionState(DISCOVERING, DISCOVER, PROJECT_DELETION_JIRA_HTTP_xxx)` 후 반환 → 프론트가 계속 이어 호출. 근거: 개별 호출 시간은 제어 불가하므로 예산 여유(13초)로 흡수.

**`kickIfStale(projectId)`** — 백그라운드 단계에서 큐 사슬이 끊겼을 때(적재 실패·라이선스 정지·컨슈머 비정상 종료) 복구:
- `CLAIM_STALE`: lease가 비었거나 만료 **그리고** `updated_at < NOW - 300s` 일 때만 55s lease 획득.
- 성공 시 seq+1 저장(lease CAS) → release → enqueue. 실패 시 아무것도 안 함.
- 근거: 살아 있는 컨슈머는 lease(600s)를 쥐고 있고, 회차 사이에도 `updated_at`이 갱신되므로 정상 사슬을 건드리지 않는다. seq 증가로 옛 사슬은 자동 폐기.

### 3-2. 컨슈머 회차 (`ProjectDeletionWorker.runProjectDeletionRound(body)`)

`queue/consumer.js`: `export const projectDeletion = createConsumerHandler(e => runProjectDeletionRound(e?.body), { retry: false });`
근거: Forge 재전달(InvocationError)을 쓰지 않는다 — 일시 오류는 회차 내부 재시도 + 지연 재적재로 직접 다루고, 그 밖의 예외는 FAILED로 기록해야 사용자에게 보인다. 재전달 후 최종 throw 시 상태 기록이 유실되는 기존 패턴의 약점을 피함.

```
runProjectDeletionRound({projectId, seq, transientRounds=0})
  body 유효성 실패 → return
  if isLicenseBlocked() → return                        (상태 무변경. 라이선스 복구 후 kick 으로 재개)
  d = findDeletion; status ∉ {UNLINKING, SQL_CLEANUP} → return
  steps.queueSeq !== seq → return                        (옛 사슬·중복 전달 폐기)
  claim lease 600s (CLAIM_FOR(600)) 실패 → enqueue(같은 body, delay 60) ; return
  re-read; status/seq 재확인 (불일치면 release 후 return)
  deadline = now + 480_000
  try:
    setDeletionState(현재 status, 현재 stage, null)      (직전 회차의 지연 lastError 해제)
    loop while hasTime:
      rows = PENDING LIMIT 50
      if rows: progressed |= await unlinkBatch(rows); continue
      counts: FAILED>0 → FAILED(UNLINK, UNLINK_FAILED) ; stop
              UNVERIFIED·BLOCKED>0 → BLOCKED_JIRA_ACCESS ; stop   (방어 — 정상 흐름에선 없음)
      SQL_CLEANUP 전환 → cleanupSql(기존) → CACHE(기존 루프) → removeDeletionIssues → COMPLETED ; stop
    예산 소진 → continue(seq+1, transientRounds:0)
  catch TransientJiraError e:
    transientRounds+1 >= 10 → FAILED(UNLINK, e.code)
    else setDeletionState(UNLINKING, UNLINK, e.code); continue(seq+1, transientRounds: progressed?0:+1, delay 60)
  catch other: 기존 catch 로직 그대로(FAILED + safeErrorCode, SQL 단계면 deletionStage)
  finally: (continue 시 seq 저장은 lease 안에서) release lease → 그 다음 enqueue
```
- `continue(...)` = lease 안에서 `setQueueSeqLeased(seq+1)` → finally에서 release → enqueue. 근거: 중복 전달·kick과 경합해도 seq CAS로 사슬이 하나만 남는다.
- 예산 480s / lease 600s(=함수 timeout) — lease는 갱신하지 않는다. 근거: 컨슈머가 살아 있는 동안 lease가 만료될 수 없고, 비정상 종료 시 최대 10분 뒤 kick으로 복구. 갱신 쿼리(rowsAffected 동일초 0 함정)를 만들 필요가 없음.
- `cleanupSql`·CACHE 루프·`removeDeletionIssues`·`setDeletionState(COMPLETED)` 는 기존 함수를 Worker로 옮겨 재사용(로직 무변경, deadline만 컨슈머 값).

### 3-3. `unlinkBatch(projectId, rows, fieldId)` — 효율화 본체

| 순서 | 호출 | 건수(50행 기준) | 근거 |
|---|---|---|---|
| a | `findLinkedProjectDeletionIssueIdsAsApp(projectId, ids)` — `POST /search/jql`, `id IN(..) AND moves_RMS_projectId="X"`, `reconcileIssues: ids` | 1 | 팀 관리형은 이슈 GET·bulkfetch 응답에서 앱 필드가 빠진다(`probeProjectDeletionIssueAsApp` 주석). JQL 인덱스는 팀 관리형에서도 동작하고 reconcileIssues(≤50)가 쓰기 직후 일관성을 준다 → 회사/팀 관리형 공통 1회. bulkfetch 기각 |
| b | 연결 없음(이동·해제·삭제) → `DONE` 일괄 | SQL 1 | 쓰기 없이 종료(이동 이슈 메타데이터 보존 — 하드닝 설계 유지) |
| c | `property_cleared_at` 없는 연결 행: `deleteIssueProperty(id,'app')` + `deleteIssueLink(id,'app')` 를 `p-limit(5)` | ≤100 (병렬 5) | bulk DELETE(`/issue/properties/{key}`)는 비동기 task·전부 아니면 전무·행별 재확인 불가로 기각. 5는 ProjectLinkWriter 관행 수준 |
| c' | 성공 id들 `property_cleared_at` 일괄 기록 | SQL 1 | |
| d | 프로퍼티 단계 끝난 행 재확인 = a와 같은 호출 | 1 | 프로퍼티 삭제 중 다른 프로젝트로 이동한 이슈의 새 연결 필드를 보존(현행 2차 probe와 같은 의미, 1회로 축약) |
| e | 여전히 연결 → `setAppFieldValueForIssues({fieldIdOrKey, issueIds, value:''})` 1회(50건) | 1 | 앱 필드 API 다건 지원(APP_FIELD_BATCH_SIZE=50) |
| e' | 실패가 **비일시**면 그 배치만 1건씩 재시도해 실패 이슈만 `FAILED` | (예외 시) ≤50 | 한 이슈 때문에 50건 전체가 막히지 않게. 일시 오류면 바로 TransientJiraError |
| f | 성공 id들 `field_cleared_at` + `DONE` 일괄 | SQL 1 | |

결과: 이슈당 5~7회 직렬 → 50건당 Jira 약 3회 + 프로퍼티 DELETE 100회(병렬 5). 1,000건 기준 수 분, 화면 불필요.

행 단위 에러 규칙:
- 비일시 오류(401/403/400/404 외 4xx 등) → 해당 이슈만 `FAILED`(code = 기존 `safeErrorCode`), 배치 계속. DELETE 404는 기존대로 멱등 성공.
- 일시 오류(429/5xx/네트워크)가 재시도 소진 → 이미 성공한 체크포인트(c')는 기록한 뒤 `TransientJiraError` throw → 회차 종료·지연 재적재. 행은 PENDING 유지(다음 회차 재개).
- `getProjectIdFieldIdApi('app')` 는 회차당 1회만 조회(현행은 배치마다).

### 3-4. 재시도 — `src/resolver/project/deletionJiraRetry.js` (삭제 전용)

```
withJiraRetry(fn, { deadline, maxAttempts = 3, maxWaitMs })  →  fn 결과 | throw
  재시도 대상: 상태 429 또는 5xx (error.code 가 숫자 429/5xx 또는 문자열 접미 _429/_5xx), ForgeAPIError 'Request Jira Error'(네트워크)
  대기: error.retryAfterMs ?? (500ms × 2^n + 0~250ms 지터), min(대기, maxWaitMs)
  now + 대기 >= deadline 이면 대기하지 않고 즉시 TransientJiraError
  시도 소진 → TransientJiraError(code = PROJECT_DELETION_JIRA_HTTP_<status> | PROJECT_DELETION_JIRA_HTTP_503)
  재시도 대상이 아니면 원래 에러 그대로 throw
```
- resolver: `maxAttempts 2, maxWaitMs 2000`. 컨슈머: `maxAttempts 3, maxWaitMs 30000`.
- `TransientJiraError` 는 이 파일의 로컬 클래스(LogicalError 상속, `transient: true`). 신규 ErrorCode 없음 — 기존 `PROJECT_DELETION_JIRA_HTTP_xxx` 패턴 재사용(프론트 `deletionErrorKey` 가 이미 해석).

**공용 래퍼 변경 범위(명시):** 아래 5곳의 `!res.ok`/`status>=400` throw 지점에서 생성한 에러에 `error.retryAfterMs = retryAfterMsOf(res)` 를 **추가만** 한다(`Retry-After` 초 → ms, 없거나 파싱 불가면 undefined). throw 여부·code·message·fallback 동작은 그대로.
1. `RequestJiaJson.requestJiraJson` 2. `RequestJiaJson.postJiraJson` 3. `IssuePropertyApi.deleteIssueProperty` 4. `IssueLinkPropertyApi.deleteIssueLink`(`failure()` 호출부) 5. `AppFieldValueApi.setAppFieldValues`
- 헬퍼 `retryAfterMsOf(res)` 는 `RequestJiaJson.js` 에서 export.
- 근거: 재시도 **동작**은 삭제 경로에만 둔다(다른 경로 회귀 없음). Retry-After 값은 Response에서만 얻을 수 있어 래퍼에서 정보만 실어 나른다.

### 3-5. Repository / Query 추가 (`ProjectDeletionQuery.js`)

| 키 | SQL 요지 | 비고 |
|---|---|---|
| `UPSERT_ISSUES(n)` 수정 | `(project_id, issue_id, issue_state) VALUES (UUID_TO_BIN(?), ?, 'UNVERIFIED')…` ON DUPLICATE 그대로 | 재발견 시 기존 상태 보존 |
| `ISSUES_BY_STATE(state, limit)` | `SELECT issue_id, property_cleared_at, field_cleared_at FROM project_deletion_issue WHERE project_id=UUID_TO_BIN(?) AND issue_state=? ORDER BY issue_id LIMIT ${정수}` | LIMIT 리터럴(바인딩 불가). 기존 `RETRYABLE_ISSUES` 는 호출처가 사라지면 삭제 |
| `MARK_ISSUES_STATE(n)` | `UPDATE … SET issue_state=?, last_error_code=? WHERE project_id=UUID_TO_BIN(?) AND issue_state <> 'DONE' AND issue_id IN (?,…)` | n ≤ 150 |
| `REQUEUE_UNVERIFIED(statesN)` | `UPDATE … SET issue_state='UNVERIFIED', last_error_code=NULL WHERE project_id=UUID_TO_BIN(?) AND issue_state IN (?,…)` | 재시도·구버전 보정 |
| `MARK_PROPERTY_MANY(n)` / `MARK_FIELD_MANY(n)` | 기존 MARK_PROPERTY / MARK_FIELD 의 `issue_id IN (…)` 판 | |
| `CLAIM_FOR(seconds)` | 기존 CLAIM 의 `INTERVAL ${정수} SECOND` 판. `CLAIM = CLAIM_FOR(55)` | INTERVAL 도 리터럴 |
| `CLAIM_STALE` | `UPDATE … SET lease_token=?, lease_expires_at=+55s, attempt=attempt+1 WHERE project_id=UUID_TO_BIN(?) AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP) AND updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 300 SECOND)` | |
| `QUEUE_SEQ` | `UPDATE … SET steps_json = JSON_SET(steps_json, '$.queueSeq', ?) WHERE project_id=UUID_TO_BIN(?) AND lease_token=?` | lease CAS. rowsAffected≠1 이면 enqueue 하지 않음 |

모두 단순 UPDATE/SELECT — SELECT 목록 서브쿼리 없음, 트랜잭션 가정 없음(각 단계 멱등).
`accessVerified` 는 기존 `STEP_DONE`(`JSON_SET(…,'DONE')`) 재사용. DTO의 `sqlSteps` 는 `SQL_STEPS` 키만 노출하므로 새 키는 밖으로 나가지 않는다.

### 3-6. `IssueApi.js`

- `findLinkedProjectDeletionIssueIdsAsApp = (projectId, ids) => findProjectDeletionIssueIds(projectId, ids, 'app')` export 1줄 추가. 기존 private 함수가 이미 `as` 를 받는다.
- 호출부에서 50개 초과 금지(reconcileIssues 상한) — Worker/Service 가 50 단위로 자른다.
- `probeProjectDeletionIssueAsApp` 은 호출처가 없어지면 삭제(테스트 포함). 근거: 죽은 코드 방지.

asApp 범위: 발견·연결 확인·프로퍼티 DELETE·앱 필드 쓰기 모두 **기존 삭제 saga 의 asApp 예외 경로**와 동일한 API다. 새 asApp 범주 없음.

### 3-7. 에러 코드
신규 없음. 사용: `PROJECT_DELETION_JIRA_ACCESS_BLOCKED`, `PROJECT_DELETION_UNLINK_FAILED`, `PROJECT_DELETION_SQL_STEP_FAILED`, `PROJECT_DELETION_CACHE_CLEANUP_FAILED`, 파생 `PROJECT_DELETION_JIRA_HTTP_xxx`.

### 3-8. 등록
- `src/index.js` / `PermissionMap.js` 무변경(신규 resolver 없음).
- manifest:
```yaml
consumer:
  - key: project-deletion-consumer
    queue: project-deletion-queue
    function: projectDeletion
function:
  - key: projectDeletion
    handler: queue/consumer.projectDeletion
    timeoutSeconds: 600
```
- `QueueKeys.js`: `export const PROJECT_DELETION_QUEUE_KEY = 'project-deletion-queue';`

## 4. 프론트엔드 설계

### 4-1. 삭제 중 프로젝트 노출 (실제 쿼리 확인 결과)
- 목록: `ProjectQuery.FINDALL` 은 `deletion_state` 를 SELECT 하고 **필터하지 않는다** → DELETING 행이 목록에 보인다. 현재 화면에 표시는 없음.
- 칸반: `buildData.js` 가 `deletionState` 를 카드에 전달, `KanbanCard` 가 DELETING 이면 이름 편집만 막는다. 카드는 보인다.
- 상단 KPI(`SUMMARY`)도 DELETING 포함 — 변경하지 않음(삭제 완료 시 사라짐).
→ 서버 쿼리 변경 없음. 표시·재진입만 추가.

### 4-2. `projectDeletionState.js` (단일 판단 지점)
- `PREPARING = {PENDING, DISCOVERING}`, `BACKGROUND = {UNLINKING, SQL_CLEANUP}` 상수 export.
- `deletionTickAction(deletion)` → `'advance'`(PREPARING) | `'poll'`(BACKGROUND) | `null`.
- `fetchDeletionStatus(projectId)` → `readDeletionResult(await invoke('getProjectDeletionStatus', {project_id}), projectId)`.
- 근거: ProjectList 와 Kanban 이 같은 규칙을 쓰므로 판단을 한 곳에 둔다. React Query 를 쓰지 않으므로 쿼리키 신설 없음(기존도 타이머+invoke 패턴).

### 4-3. 타이머 동작 (ProjectList.jsx / ProjectKanbanBoard.jsx `scheduleProjectDeletionContinuation`)
- `advance`: 기존대로 2.5s 후 `deleteProject` mutate.
- `poll`: 5s 후 `fetchDeletionStatus`. 폴링 12회째마다 1회는 `deleteProject` mutate(서버가 stale 일 때만 kick, 아니면 상태만 반환). 결과 처리:
  - `completed` → 모달 닫기 + 성공 토스트 + `invalidateProjectViews`(기존 완료 처리와 동일 함수로 묶음).
  - 실패 응답 → 기존 `deletionFailure` (재시도 버튼 노출).
  - 그 외 → `setDeletionStatus(deletion)`.
- 모달을 닫으면 추적 중단 + `invalidateProjectViews`(배지 반영). 서버는 계속 진행.

### 4-4. `ProjectDeletionStatusModal.jsx`
- 닫기 허용: 모든 상태에서 `onClose` 동작. 진행 중 상태에도 푸터에 「닫기」 버튼. 요청이 진행 중일 때 닫으면, 그 뒤에 도착한 응답이 모달을 다시 열지 않도록 부모가 닫은 projectId 를 기억했다가 응답을 무시한다(사용자가 재진입하면 해제).
- PREPARING: 기존 메시지 + `progress.preparingHint`.
- BACKGROUND: 기존 메시지 + `progress.backgroundHint` + UNLINKING 일 때 `progress.issueProgress`(`{done}` = issueCounts.unlinked, `{total}` = issueCounts.discovered, `tFormat` 사용).
- 진행 중 + `lastError.code` 가 `PROJECT_DELETION_JIRA_HTTP_(429|5\d\d)` → `progress.delayed` 한 줄(에러 블록 아님).
- 정지 상태 렌더(에러 블록·재시도)는 기존 그대로.

### 4-5. 재진입 경로
- ProjectList: 프로젝트명 셀에 `deletion_state === 'DELETING'` 이면 Lozenge `project.delete.deletingBadge`. 드로어(`ProjectDetailDrawer`)의 삭제 버튼 라벨을 DELETING 이면 `project.delete.resume` 로, `onDelete` 처리에서 DELETING 이면 **확인 모달 없이** `deleteProjectMutation.mutate(id)` (= 상태 조회 + 필요 시 이어 하기/kick).
- Kanban: `KanbanCard` 에 같은 배지, 메뉴 항목 라벨 `project.delete.resume`. `handleDeleteCard` 가 DELETING 이면 확인 모달 없이 `deleteCardMutation.mutate({projectId, taskId, resume:true})`; `onMutate` 는 `resume` 이면 낙관적 카드 제거를 건너뛴다.
- 권한: 기존 `canWrite('PROJECT')` 게이트 그대로(재진입도 `deleteProject` = W('PROJECT')).

### 4-6. useKanbanMutations.js
- `deleteCardMutation.onMutate`: `resume` 플래그면 낙관 제거 생략.
- `onSuccess` 완료 처리 블록을 4-3 폴링 완료 처리에서도 쓰도록 콜백으로 노출(중복 구현 금지).

## 5. DB 설계
- DDL·마이그레이션 없음. 근거: `issue_state VARCHAR(32)`, `steps_json JSON` 이 이미 있어 새 값·키를 수용.
- `steps_json` 신규 키: `accessVerified: 'DONE'`(① 완료 표식), `queueSeq: number`(사슬 번호). 기존 키(`discover`, `discoverCursor`, SQL 10단계, `cacheProgress`, `cacheCost`, `projectDocs`) 무변경.
- KVS·manifest storage 무변경.

## 6. i18n 키 (`locales/kr/project.json`, `locales/en/project.json` → `npm run merge`)

| 키 | kr | en |
|---|---|---|
| `project.delete.progress.preparingHint` | 이슈 확인이 끝나면 삭제는 백그라운드에서 진행됩니다. 지금 창을 닫으면 확인이 일시 중지되며, 목록에서 다시 열면 이어집니다. | Deletion continues in the background once issue checks finish. Closing now pauses the checks; reopen it from the list to resume. |
| `project.delete.progress.backgroundHint` | 백그라운드에서 진행 중입니다. 창을 닫아도 삭제는 계속됩니다. | Running in the background. Deletion continues even if you close this window. |
| `project.delete.progress.issueProgress` | 연결 해제 {done} / {total}건 | Unlinked {done} / {total} |
| `project.delete.progress.delayed` | Jira 요청이 많아 잠시 후 자동으로 다시 시도합니다. | Jira is busy. Retrying automatically shortly. |
| `project.delete.deletingBadge` | 삭제 중 | Deleting |
| `project.delete.resume` | 삭제 진행 상황 | Deletion progress |

## 7. 구현 작업 분해

### backend
- [ ] `RequestJiaJson.js`: `retryAfterMsOf(res)` export, `requestJiraJson`·`postJiraJson` 에러에 `retryAfterMs` 부착
- [ ] `IssuePropertyApi.deleteIssueProperty`, `IssueLinkPropertyApi.deleteIssueLink`, `AppFieldValueApi.setAppFieldValues`: 에러에 `retryAfterMs` 부착
- [ ] `deletionJiraRetry.js`: `withJiraRetry`, `TransientJiraError`
- [ ] `IssueApi.js`: `findLinkedProjectDeletionIssueIdsAsApp` export, 미사용 `probeProjectDeletionIssueAsApp` 제거
- [ ] Query/Repository: §3-5 추가·수정, `RETRYABLE_ISSUES` 정리
- [ ] `ProjectDeletionService.js`: §3-1 (verifyIssueAccess, requeue, 구버전 보정, 예산 12s, 백그라운드 분기 + kickIfStale, release 후 enqueue)
- [ ] `ProjectDeletionWorker.js`: §3-2·3-3 (회차, unlinkBatch, cleanupSql/CACHE 이전)
- [ ] `QueueKeys.js`, `consumer.js` export, `manifest.yml` consumer/function
- [ ] 테스트(갱신 `ProjectDeletionService.test.js`, `ProjectDeletionRepository.test.js`; 신규 `ProjectDeletionWorker.test.js`, `deletionJiraRetry.test.js`):
  - ①: 발견 UNVERIFIED 적재 · 판정 3갈래 · BLOCKED 시 Jira 쓰기 0회·enqueue 없음 · 통과 시 seq+1 저장 후 release→enqueue 순서 · 재시도 시 BLOCKED/FAILED→UNVERIFIED · `accessVerified` 없는 진행 중 건 보정 · 백그라운드 상태에서 일하지 않음 + stale 일 때만 enqueue · 일시 오류 소진 시 DISCOVERING 유지
  - ②: seq 불일치 무시 · lease 실패 시 delay 재적재 · 라이선스 정지 시 무변경 · 연결 없음 DONE(쓰기 0) · 프로퍼티 후 이동 시 필드 미기록 · 필드 일괄 1회 · 필드 비일시 실패 시 개별 분리 · 행 FAILED 후 배치 계속 · 일시 소진 시 PENDING 유지·delay 60 재적재·10회 FAILED · 예산 소진 시 seq+1 이어달리기 · SQL→캐시→COMPLETED
  - 재시도: Retry-After 존중·상한·deadline 초과 시 즉시 Transient·비대상 에러 통과

### frontend
- [ ] `projectDeletionState.js`: 상수·`deletionTickAction`·`fetchDeletionStatus`
- [ ] `ProjectList.jsx` / `ProjectKanbanBoard.jsx`: advance/poll 분기, 12회째 kick, 완료 처리 공용화, 닫기 시 invalidate
- [ ] `ProjectDeletionStatusModal.jsx`: 닫기 허용·안내 문구·진행 건수·지연 안내
- [ ] `ProjectList.jsx`·`ProjectDetailDrawer.jsx`·`KanbanCard.jsx`: DELETING 배지·재진입 라벨·확인 없이 이어 하기
- [ ] `useKanbanMutations.js`: `resume` 시 낙관 제거 생략
- [ ] i18n 6키 + `npm run merge`
- [ ] 테스트 갱신: `projectDeletionFlow.test.jsx`, `ProjectKanbanBoard.test.js`, `useKanbanMutations.test.js`, `ProjectListStatus.test.jsx` — 상태별 advance/poll 분기, 백그라운드에서 닫기 가능, 폴링 완료 시 무효화, DELETING 재진입이 확인 모달을 건너뜀

## 8. 가정·잔여 위험
- 접근 판정 시점(①)과 실제 쓰기(②) 사이에 요청자의 이슈 권한이 바뀌는 경우는 반영하지 않는다(현행도 판정과 쓰기 사이 간격 존재, 백그라운드화로 간격이 늘어날 뿐).
- ① 판정 이후 app 이 특정 이슈를 볼 수 없게 되면 ②의 연결 확인에서 "연결 없음"으로 DONE 처리돼 연결 흔적이 남을 수 있다(드묾, 보류).
- `delayInSeconds` 와 `CLAIM_STALE` 300s 는 Forge 큐 지연 상한(900s) 안의 보수적 값. 실배포에서 사슬 끊김 빈도를 보고 조정.
- 앱 필드 API 다건 PUT 의 부분 실패 의미(한 건 실패 시 전체 실패 여부)는 문서에 없음 → e' 분리 경로로 흡수. 배포 검증 필요.
