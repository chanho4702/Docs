# 02 백엔드 구현 리포트 — 프로젝트 삭제 백그라운드화 (2026-10-06)

설계서 `01_architect_design.md` §3 구현. 신규 resolver 없음, DDL 무변경, `PermissionMap`·`src/index.js` 무변경. 커밋 안 함.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/resolver/project/ProjectDeletionService.js` | ① 준비 단계로 재구성: 발견(재시도 포함) → UNVERIFIED 판정 루프(`verifyIssueAccess`, 150행/회, asUser 50×p-limit(3) → 안 보인 id만 asApp 50) → BLOCKED 면 정지 / 아니면 `accessVerified` 기록 + UNLINKING 또는 SQL_CLEANUP + queueSeq+1 → lease 해제 → 적재. 백그라운드 상태는 `kickIfStale`만. 예산 12s, 일시 오류 소진 시 DISCOVERING 유지 |
| `src/resolver/project/ProjectDeletionWorker.js` (신규) | ② 회차 `runProjectDeletionRound`, `unlinkBatch`(§3-3 a~f), `cleanupSql`·CACHE 루프 이전(로직 무변경), `enqueueDeletionRound`, 공용 헬퍼(`stepsOf`, `countsOf`, `safeErrorCode`, `token`, `hasTime`, `BACKGROUND_STATUSES`) |
| `src/resolver/project/deletionJiraRetry.js` (신규) | `withJiraRetry`, `TransientJiraError`(LogicalError 상속, `transient: true`) |
| `src/resolver/project/ProjectDeletionQuery.js` | `UPSERT_ISSUES`(UNVERIFIED 적재), `ISSUES_BY_STATE`, `MARK_ISSUES_STATE`, `REQUEUE_UNVERIFIED`, `MARK_PROPERTY_MANY`, `MARK_FIELD_MANY`, `CLAIM_FOR(seconds)`, `CLAIM_STALE`, `QUEUE_SEQ` 추가. 호출처 없어진 `CLAIM`·`RETRYABLE_ISSUES`·`MARK_PROPERTY`·`MARK_FIELD`·`MARK_ISSUE` 제거 |
| `src/resolver/project/ProjectDeletionRepository.js` | `claimDeletionLease(projectId, token, seconds=55)`, `claimStaleDeletionLease`, `setDeletionQueueSeq`, `findDeletionIssuesByState`, `markDeletionIssues`, `requeueUnverifiedIssues`, `markIssuesPropertyCleared`, `markIssuesFieldCleared`. 단건 함수 3개 제거 |
| `src/api/jira/issue/IssueApi.js` | `findLinkedProjectDeletionIssueIdsAsApp` export 추가, `probeProjectDeletionIssueAsApp` 삭제 |
| `src/api/jira/util/RequestJiaJson.js` | `retryAfterMsOf(res)` export, `requestJiraJson`·`postJiraJson` HTTP 에러에 `retryAfterMs` 부착(그 외 동작 무변경) |
| `IssuePropertyApi.deleteIssueProperty`, `IssueLinkPropertyApi.deleteIssueLink`, `AppFieldValueApi.setAppFieldValues` | 에러에 `retryAfterMs` 부착만 |
| `src/queue/QueueKeys.js` | `PROJECT_DELETION_QUEUE_KEY = 'project-deletion-queue'` |
| `src/queue/consumer.js` | `projectDeletion` export (`{retry:false}`, uuid·seq 유효성 실패 시 return) |
| `manifest.yml` | consumer `project-deletion-consumer` / queue `project-deletion-queue` / function `projectDeletion`(handler `queue/consumer.projectDeletion`, timeoutSeconds 600) |
| 테스트 | `ProjectDeletionService.test.js` 재작성(20), `ProjectDeletionWorker.test.js` 신규(9), `ProjectDeletionIssueApi.test.js`(probe 테스트 제거, app 연결 확인 1건), `ProjectLinkPaths.contract.test.js`(allowlist·U2 대상 파일을 Worker 로) |

## 2. 응답 shape (글자 그대로 — 기존과 동일)

`deleteProject` / `getProjectDeletionStatus` 입력 `{ project_id: string }`, 성공 응답:

```js
{
  success: true,
  content: {
    deletion: {
      projectId: 'uuid',
      status: 'DISCOVERING' | 'UNLINKING' | 'SQL_CLEANUP' | 'BLOCKED_JIRA_ACCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS' | 'COMPLETED',
      stage: 'DISCOVER' | 'UNLINK' | 'SQL' | 'PROJECTUSERS' ... 'PROJECT' | 'CACHE' | 'DONE',
      completed: boolean,            // status === 'COMPLETED'
      retryable: boolean,            // status !== 'COMPLETED'
      blockedIssueCount: number,
      attempt: number,
      issueCounts: { discovered: number, pending: number, unlinked: number, inaccessible: number, failed: number },
      sqlSteps: { projectUsers, dashboard, snapshot, ganttLink, ganttIssue, ganttFolder, projectSkills, projectTeam, projectSubscription, project },  // 각 'DONE' | 'PENDING'
      lastError: { code: string, stage: string | null } | null,
      updatedAt: string | null,
    }
  }
}
```

의미 변경(shape 불변):
- `issueCounts.pending` = `PENDING + UNVERIFIED`.
- `lastError` 는 **진행 중 상태에서도** non-null 일 수 있다: `DISCOVERING`(준비 단계 일시 오류, stage `'DISCOVER'`) 또는 `UNLINKING`(컨슈머 일시 오류, stage `'UNLINK'`). 코드는 `PROJECT_DELETION_JIRA_HTTP_429` / `PROJECT_DELETION_JIRA_HTTP_5xx`. 프론트는 진행 중일 때 "지연 안내"로만 표시.
- `BLOCKED_JIRA_ACCESS` 의 `stage` 는 이제 `'DISCOVER'`(쓰기 전에 차단). 종전은 `'UNLINK'`.
- 준비 단계 비일시 실패의 `FAILED` stage 는 `'DISCOVER'`.

실패(권한 등)는 종전 그대로 `{ success:false, error:{ name, code, message, cause } }`.

## 3. 상태 전이와 프론트 호출

| status | 주체 | 프론트가 할 일 |
|---|---|---|
| `DISCOVERING` | resolver(①) — 호출해야만 진행 | 2.5s 후 `deleteProject` 재호출(기존 advance). lastError 있으면 지연 안내 |
| `UNLINKING`, `SQL_CLEANUP` | 큐 컨슈머(②) — 화면 불필요 | 5s 간격 `getProjectDeletionStatus` 폴링. 12회마다 1회 `deleteProject`(서버는 lease 없음 + 5분 무갱신일 때만 재적재, 아니면 상태만 반환 — 일하지 않음) |
| `BLOCKED_JIRA_ACCESS`, `FAILED`, `COMPLETED_WITH_WARNINGS` | 정지 | 재시도 버튼 → `deleteProject` (FAILED·BLOCKED 행을 다시 판정 후 재진행) |
| `COMPLETED` | 종료 | 모달 닫기 + 성공 토스트 + invalidate |

`deleteProject` 첫 호출이 DISCOVERING 을 건너뛰고 바로 `UNLINKING`/`SQL_CLEANUP` 를 반환할 수 있다(이슈가 적으면 1회 호출로 준비 완료). 반대로 구버전 진행 중 삭제(UNLINKING 이지만 `accessVerified` 없음)에 `deleteProject` 를 부르면 `DISCOVERING` 으로 되돌아가 판정부터 다시 한다 — 프론트는 status 로만 분기하면 된다.

## 4. 설계 대비 차이

1. **구버전 보정 조건 변경 — `steps_json.prepareV2` 키 추가.** 설계의 조건(`!accessVerified && discover=='DONE' && project!='DONE'` 이면 PENDING 포함 재판정)은 신버전 삭제가 판정 루프 도중 예산 소진으로 DISCOVERING 반환할 때마다 판정 끝난 PENDING 을 되돌려, 큰 프로젝트는 판정이 끝나지 않는다. 그래서 "lease 획득 후 `prepareV2` 없으면 PENDING·FAILED·BLOCKED → UNVERIFIED 1회 + `prepareV2:'DONE'` 기록"으로 바꿨다. 신규 삭제는 첫 호출에서 행이 없어 무연산. 이후 재시도는 설계대로 FAILED·BLOCKED 만 재판정. 또한 백그라운드 분기는 `accessVerified==='DONE'` 일 때만 탄다(구버전 UNLINKING 이 판정 없이 컨슈머로 가지 않게).
2. 컨슈머 일시 오류 한도: 설계는 `transientRounds+1 >= 10` 이면 FAILED. 구현은 **진행이 있었던 회차는 카운트 0으로 리셋**하고, 진행 없는 회차가 연속 10회면 FAILED.
3. 큐 이벤트 유효성(uuid 정규식·seq 정수)은 `consumer.js` 에서 검사(정규식이 그 파일에 있음). Worker 는 신뢰.
4. 적재 실패(`push` throw)는 삼킨다 — resolver kick(프론트 12회째 호출)이 5분 뒤 복구. 컨슈머가 throw 하면 상태 기록 없이 유실되므로.
5. `deletionJiraRetry.test.js` 는 만들지 않았다(지시: 핵심 케이스만). 429 재시도·지연 재적재는 Worker·Service 테스트에서 실제 `withJiraRetry` 로 검증.

## 5. 테스트 결과

루트 `npm test`: **Test Suites: 148 passed, 148 total / Tests: 2005 passed, 2005 total**.

추가·갱신 핵심 케이스:
- ① 3갈래 판정, BLOCKED 시 Jira 쓰기 0·적재 0(재시도도 유지), 통과 시 seq+1 → release → push 순서, 재시도 시 FAILED 만 재판정, 구버전 PENDING 1회 재판정, 429 소진 시 DISCOVERING+lastError, 백그라운드 상태에서 일하지 않음 / stale 일 때만 재적재, cursor 400·예산 이어 하기·권한 범위(기존 유지)
- ② 정상 완료(필드 일괄 1회), 프로퍼티 후 이동 시 필드 미기록, 필드 비일시 실패 개별 분리, 429 소진 → PENDING 유지 + delay 60 재적재(seq+1, transientRounds 1), 10회째 FAILED, 예산 소진 seq+1 이어달리기, lease 실패 시 같은 seq 지연 재적재, seq 불일치·라이선스 정지 무동작

## 6. 배포 전 확인 필요

- `forge deploy` 로 consumer/function 추가 반영(manifest 변경).
- 앱 필드 다건 PUT 부분 실패 의미, `delayInSeconds`·`CLAIM_STALE` 300s 의 실측.
- Forge SQL 의 `JSON_SET(steps_json, '$.queueSeq', ?)` 가 숫자를 문자열로 저장해도 비교는 `Number()` 로 흡수함.
