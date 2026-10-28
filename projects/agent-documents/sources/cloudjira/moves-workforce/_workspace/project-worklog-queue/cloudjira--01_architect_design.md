# 수동 프로젝트 Worklog Queue 완료 설계서

## 1. 개요 / 영향 범위

### 목표와 설계 결정

`startProjectWorklogBatch`는 활성 RMS 프로젝트마다 `project-worklog-project-queue` event를 push하지만, 현재 manifest에는 이 queue의 consumer/function이 없고 handler도 없다. 또한 기존 `SchedulerService`에는 Worklog를 읽은 결과를 저장하는 로직이 없다.

현 코드에서 **실제 Worklog 집계 결과를 저장하는 단일 출처**는 `src/resolver/portfolioDashboard/PortfolioAggregator.js`의 `aggregateOneProject()`와 `upsertSnapshot()`이다. 이 함수는 프로젝트 기간의 Worklog를 `getResourceProjectWorklogs(..., as: 'app')`로 읽어 `portfolio_project_snapshot`에 actual MD/MM, 월·주 공수 등을 upsert한다. 따라서 이 RFC는 별도의 cache 형식이나 집계식을 만들지 않는다. `aggregateOneProject()`의 단일 프로젝트 실행 경로를 추출하여 consumer가 재사용한다.

전사 `portfolioRollup:current`(가동률·문제 Issue 등)은 프로젝트 하나의 부분 실행만으로 정확히 재계산할 수 없으므로 consumer가 갱신하지 않는다. 이는 전체 `aggregateAllProjects()`/`portfolio-aggregation-queue`의 책임으로 유지한다. 수동 Worklog batch가 보장하는 결과는 **각 대상 프로젝트 snapshot의 Worklog 기반 수치 갱신**이다.

### 영향 범위

- 백엔드
  - 수정: `src/resolver/scheduler/SchedulerService.js`, `SchedulerController.js`
  - 수정: `src/resolver/portfolioDashboard/PortfolioAggregator.js` (기존 단일 프로젝트 집계·저장 경로를 export 가능한 service로 추출)
  - 수정: `src/queue/consumer.js` (project Worklog consumer export 추가)
  - 수정: `src/utils/queueUtil.js` (event별 concurrency key가 필요할 때만 지원)
  - 수정: `src/index.js` (queue handler export)
  - 수정: `manifest.yml` (function 및 consumer 등록)
  - 수정: `src/utils/errors/ErrorCodes.js` (입력 오류 코드만 추가)
- 프론트
  - 현재 `startProjectWorklogBatch`를 invoke하는 화면/훅은 없다. 따라서 이번 범위에 신규 버튼이나 polling UI는 없다.
  - 향후 호출자는 아래 응답의 `queuedCount`만으로 “완료” toast를 내지 않고 “대기열 등록”으로 표시한다.
- DB
  - MySQL schema 변경 없음. 기존 `portfolio_project_snapshot` UPSERT를 사용한다.
  - KVS schema 변경 없음. 기존 `job`/`job_batch` custom entity로 요청별 진행·실패를 보인다.
- i18n
  - 호출 UI가 현재 없으므로 이번 변경에는 UI 문자열과 locale 변경이 없다.

## 2. 경계면 계약 (가장 중요)

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `startProjectWorklogBatch` | `{}`만 허용. payload는 무시한다. | `{ success: true, appJobId: string \| null, queuedCount: number, accepted: boolean }`<br/>- 대상 없음: `{ appJobId: null, queuedCount: 0, accepted: true }`<br/>- push 성공: `{ appJobId: 'project-worklog-…', queuedCount: n, accepted: true }` | 현재 호출처 없음. 추후 `invoke('startProjectWorklogBatch')`는 `queuedCount > 0`일 때 “등록됨”, `0`일 때 “대상 없음”만 표시한다. `accepted`가 false인 응답은 만들지 않는다. queue push 실패는 기존 `responseWrapper`의 `{ success:false,error }`로 전달한다. |
| `getUploadJobStatus` (기존 재사용) | `{ jobId: appJobId }` | `{ success: true, content: { job: { id, total, totalBatches, processed, failed, status } \| null } }` | 현재 Worklog 전용 UI 없음. 향후 상태 UI는 `job.status === RUNNING/COMPLETED/PARTIAL`만 사용한다. |

### Queue event 계약

```js
{
  body: {
    appJobId: 'project-worklog-<uuid>',
    batchId: '<appJobId>-batch-<index>',
    batchIndex: 0,
    totalBatches: 3,
    projectId: '<UUID v4>'
  },
  concurrency: {
    key: 'project-worklog:<projectId>',
    limit: 1
  }
}
```

- `appJobId`, `batchId`, `batchIndex`, `totalBatches`, `projectId`는 모두 필수다.
- `projectId`는 UUID 형식이어야 하며, `batchIndex`는 `0 <= batchIndex < totalBatches` 정수여야 한다.
- `batchId`는 반드시 `${appJobId}-batch-${batchIndex}`와 일치해야 한다. 임의 queue event를 정상 작업으로 기록하지 않기 위한 검증이다.
- producer의 queue key와 manifest consumer queue key는 모두 상수 `PROJECT_WORKLOG_QUEUE_KEY = 'project-worklog-project-queue'` 하나를 import해 사용한다. manifest는 import할 수 없으므로 manifest 계약 테스트가 이 상수와 YAML 값을 비교한다.

## 3. 백엔드 설계

### 3.1 Producer: `SchedulerService`

1. `getActiveProjectsService()`로 활성 프로젝트를 읽는다. 이 resolver는 `SETTINGS` 권한의 전역 작업이므로 `principal` 범위로 제한하지 않는다.
2. 활성 프로젝트가 없으면 queue를 만들거나 job을 만들지 않고 `{appJobId:null, queuedCount:0, accepted:true}`를 반환한다.
3. 대상이 있으면 `crypto.randomUUID()`로 `appJobId`를 만들고, `job` entity에 다음을 **`saveTTL`(기존 공통 30시간 TTL)** 로 먼저 저장한다. 이 작업에는 전용 상태 UI가 없으므로 upload의 무기한 `save()` 패턴을 복제하지 않는다.

```js
{
  id: appJobId,
  total: projectIds.length,
  totalBatches: projectIds.length,
  processed: 0,
  failed: 0,
  status: 'RUNNING'
}
```

4. 프로젝트 하나를 event 하나/batch 하나로 만들고 queue에 push한다. project별 key인 `project-worklog:${projectId}`, `limit:1`을 사용한다. 서로 다른 프로젝트는 Forge consumer의 `timeoutSeconds:600` 범위 내에서 최대 2개까지 병렬 처리한다.
5. 모든 chunk push가 성공했을 때만 `{appJobId, queuedCount: projectIds.length, accepted:true}`를 반환한다.
6. push 중 실패하면 producer는 throw한다. 이 경우 성공 여부가 불명확한 job record를 UI가 추적하지 않도록 resolver는 `appJobId`를 응답하지 않는다. 남은 `RUNNING` job은 TTL로 정리한다. **부분 push를 성공으로 반환하지 않는다.**

`pushQueueEvents()`는 기존 호출 호환성을 유지한다. `concurrencyKey`가 문자열이면 현행 동작을 유지하고, 함수이면 item별 `concurrency.key`를 계산하도록 최소 확장한다. 다른 queue producer의 payload/동시성은 바꾸지 않는다.

### 3.2 Consumer: `queue/consumer.projectWorklog`

manifest function handler는 `queue/consumer.projectWorklog`가 아니라 기존 단일 파일 구조에 맞춰 `queue/consumer.projectWorklogBatch` export를 가리킨다.

처리 순서:

1. `isLicenseBlocked()`이면 Jira·SQL을 호출하지 않고 작업을 retry하지 않는다. 해당 batch를 `processedCount:0, failCount:0, done:true`로 끝내고 최종 job을 `COMPLETED`로 수렴시킨다. 라이선스 정책의 명시적 `INACTIVE`만 차단한다.
2. event body를 위 계약대로 검증한다. 잘못된 body는 재시도해도 정상화되지 않으므로 `job_fail`에 **프로젝트 ID가 아닌 batchId와 오류 코드만** 기록하고, batch를 `failCount:1, done:true`로 저장한다. handler는 throw하지 않는다.
3. `job_batch.findById(batchId)`가 이미 `done:true`이면 아무 집계도 다시 수행하지 않고 job 완료 여부만 재계산 후 return한다. Forge event at-least-once delivery의 멱등성 경계다.
4. `findActiveProjectByIdRepository(projectId)`로 프로젝트가 여전히 활성인지 재검증한다.
   - 삭제됐거나 종료/시작 전이 됐으면 stale event다. 오류가 아니라 `processedCount:0, failCount:0, done:true`로 종료한다.
5. 프로젝트별 집계 service를 호출한다.

```js
aggregateAndPersistOneProject({ project })
// 공통 context 1회: settings, holidays, coworkerFieldId, salaryPolicyContext
// aggregateOneProject(project, ...context) -> upsertSnapshot(snapshot)
// portfolioRollup:current는 변경하지 않음
```

`aggregateOneProject()`의 Worklog fetch, `as:'app'`, `p-limit(5)`, 계산식은 수정하지 않는다. scheduled/queue invocation에는 user context가 없으므로 기존 문서화된 batch 예외인 `asApp()`을 그대로 사용한다.

6. 성공 시 `job_batch`에 `{jobId:appJobId, processedCount:1, failCount:0, done:true}`를 저장한다.
7. Jira 429/timeout/ECONNRESET 및 Forge 일시 오류는 `createConsumerHandler`의 최대 3회 재시도를 적용한다. 최종 시도까지 실패하면 `job_fail` + `{processedCount:0,failCount:1,done:true}`를 기록하고 throw하지 않아 job이 영구 `RUNNING`으로 남지 않게 한다. 영구 오류(잘못된 project, SQL validation 등)도 같은 terminal-failure 기록 후 retry하지 않는다.
8. terminal batch마다 기존 `checkJobCompletion`을 export 가능한 공용 `finalizeJobIfComplete()`로 분리해 호출한다. `job_batch`를 paged 조회하고 `processed`/`failed`를 합산해 전체가 끝나면 `COMPLETED` 또는 `PARTIAL`로 저장한다. `findAll()`은 사용하지 않는다.

### 3.3 기존 코드 재사용/분리

| 기존 코드 | 사용 방식 |
|---|---|
| `PortfolioAggregator.aggregateOneProject` | 집계 계산 단일 출처. signature와 산식은 유지한다. |
| `PortfolioSnapshotRepository.upsertSnapshot` | 각 project의 멱등 MySQL UPSERT. |
| `ResourceWorklogFetcher.getResourceProjectWorklogs` | 기존 page/동시성 제한 Worklog fetch를 그대로 재사용한다. |
| `queueUtil.createQueue`, `pushQueueEvents`, `createConsumerHandler` | producer/consumer 공통. item별 concurrency와 final failure hook만 최소 확장한다. |
| `job`, `job_batch`, `job_fail` custom entities | DDL/manifest schema 추가 없이 진행·실패 가시성에 재사용한다. |
| `checkJobCompletion` | `queue/consumer.js` 내부 함수에서 named export 가능한 공통 finalizer로 추출한다. upload/subscription 동작은 변경하지 않는다. |

### 3.4 오류 코드

`ErrorCodes`에 아래만 추가한다.

- `PROJECT_WORKLOG_BATCH_INVALID_EVENT`: body 형식, UUID, batch 식별자 불일치
- `PROJECT_WORKLOG_BATCH_PROJECT_NOT_ACTIVE`: consumer 시점에 더는 활성 프로젝트가 아님. stale event로 terminal skip 처리하며 사용자에게 resolver 오류로 노출하지 않는다.

Jira/SQL 원본 오류는 새 문자열 error code로 감싸지 않는다. 재시도 조건 판정에 원본 `status`, `code`, `message`를 보존해야 한다.

### 3.5 resolver/권한/등록

- resolver 이름은 변경하지 않는다: `startProjectWorklogBatch`.
- `SchedulerController`는 `guardedDefine`를 유지하고 `principal`을 service에 전달하지 않는다. `PermissionMap`의 기존 `W('SETTINGS')` 선언이 전역 실행 권한의 단일 근거다.
- `src/index.js`의 resolver controller registrar 변경은 없다.
- `src/index.js`에 queue handler export를 추가한다.

```js
export { projectWorklogBatch } from './queue/consumer';
```

- `manifest.yml`:

```yaml
modules:
  consumer:
    - key: project-worklog-project-consumer
      queue: project-worklog-project-queue
      function: projectWorklogBatch
  function:
    - key: projectWorklogBatch
      handler: queue/consumer.projectWorklogBatch
      timeoutSeconds: 600
```

실제 파일 export와 YAML handler path는 동일하게 맞춘다. deploy 후 manifest 변경이므로 tunnel을 재시작한다.

## 4. 프론트엔드 설계

현재 UI에 호출 지점이 없으므로 이 RFC의 frontend source 변경은 없다. 수동 실행 버튼을 새로 추가하는 것은 범위 밖이다.

다만 기존/후속 UI가 resolver를 연결할 때 계약은 다음을 반드시 지킨다.

1. `invoke('startProjectWorklogBatch')` 결과의 `success === false`면 오류 toast를 낸다.
2. `success === true && queuedCount > 0`은 **“처리 완료”가 아니라 “{queuedCount}개 프로젝트가 대기열에 등록됨”**으로 표시한다.
3. `queuedCount === 0`은 활성 프로젝트가 없다는 정보 toast만 표시한다.
4. `appJobId` polling UI를 추가할 경우 기존 `JobPollingManager`를 그대로 재사용하면 안 된다. 이 컴포넌트는 user upload 전용 문구와 `userKeys` 무효화를 갖는다. 별도 `useProjectWorklogBatchJob`/query key를 만들거나, polling manager를 domain-neutral 계약으로 리팩터링하는 별도 RFC에서 처리한다.

## 5. DB 설계

### MySQL

- 신규 테이블/마이그레이션 없음.
- `portfolio_project_snapshot`의 기존 `UPSERT`가 projectId 기준으로 결과를 덮어쓴다. 같은 event가 재전달되어도 결과 row가 중복 생성되지 않는다.
- `findActiveProjectByIdRepository(projectId)`는 신규 read-only query다. `project` table에서 `project_id`, 이름, 상태, 시작/종료일을 읽되 `start_date <= CURDATE()` 및 `end_date >= CURDATE()` 조건을 SQL에서 강제한다. 반환은 0 또는 1행이다.

### KVS

- manifest storage entity 변경 없음.
- 기존 `job` / `job_batch` / `job_fail`을 쓴다.
- job/job_batch/job_fail은 `saveTTL`의 기존 공통 30시간 TTL을 적용한다. 정상 완료 이력의 장기 보존이나 새 관리자 목록은 구현하지 않는다.
- `job_fail.data`에는 Jira Issue key/title, 사용자 정보, 원본 Jira 오류 본문을 저장하지 않는다. `batchId`와 안전한 오류 code/message만 저장한다.

## 6. i18n 키 목록

이번 범위에는 신규 UI가 없으므로 없음.

후속 UI RFC에서 필요해질 후보(이번에 추가하지 않음):

| 키 | kr | en |
|---|---|---|
| `scheduler.projectWorklog.queued` | `{count}개 프로젝트의 워크로그 집계를 대기열에 등록했습니다.` | `Queued worklog aggregation for {count} projects.` |
| `scheduler.projectWorklog.empty` | `집계할 활성 프로젝트가 없습니다.` | `There are no active projects to aggregate.` |
| `scheduler.projectWorklog.failed` | `워크로그 집계 요청을 등록하지 못했습니다.` | `Could not queue worklog aggregation.` |

## 7. 구현 작업 분해

### Backend

- [ ] `SchedulerService`에 queue key 상수, UUID job 생성, `{appJobId, queuedCount, accepted}` 응답을 구현한다.
- [ ] queue push가 완료되기 전에는 성공 응답을 만들지 않는다.
- [ ] `pushQueueEvents`에 item별 concurrency key 지원을 추가하고 기존 문자열 호출 회귀를 막는다.
- [ ] `findActiveProjectByIdRepository`와 service-level active project mapper를 추가한다.
- [ ] `PortfolioAggregator`에서 공통 context 생성과 `aggregateAndPersistOneProject`를 추출한다. 전사 rollup KVS 갱신은 넣지 않는다.
- [ ] `queue/consumer.js`에 `projectWorklogBatch`를 추가하고 payload 검증, done short-circuit, active 재확인, terminal 성공/실패 기록을 구현한다.
- [ ] `createConsumerHandler`에 final failure 기록이 가능하도록 hook을 추가하거나, consumer 전용 wrapper에서 동등한 terminal 기록을 보장한다.
- [ ] `checkJobCompletion`을 paged 공용 finalizer로 분리하고 upload/subscription 회귀를 막는다.
- [ ] `src/index.js`, `manifest.yml`에 function/consumer를 등록한다.
- [ ] `ErrorCodes`에 두 batch 입력 코드만 추가한다.

### Frontend

- [ ] 현 호출처가 없는지 `rg "startProjectWorklogBatch" static/ui/src`로 다시 확인한다.
- [ ] 호출처가 새로 생긴 경우에만 queued/empty/error 표시를 추가한다. 완료 toast는 금지한다.
- [ ] job polling UI는 이번 RFC에 추가하지 않는다.

## 8. 테스트 매트릭스

| 구분 | 케이스 | 기대 결과 |
|---|---|---|
| producer | 활성 프로젝트 0개 | queue push/job 저장 없음, `queuedCount:0`, `accepted:true` |
| producer | 활성 프로젝트 N개 | N개의 projectId event, `total=N`, `totalBatches=N`, `queuedCount:N` |
| producer | queue push 실패 | resolver 실패, 성공 응답 없음 |
| contract | producer 상수와 manifest consumer `queue` | 정확히 같은 `project-worklog-project-queue` |
| contract | manifest `function`과 `queue/consumer` export | handler path/export가 존재 |
| consumer | 유효한 event + 활성 프로젝트 | 기존 `aggregateOneProject` 결과 snapshot upsert, batch done, job 완료 |
| consumer | 동일 event 재전달 | 기존 done batch를 감지; Jira fetch/UPSERT 재호출 없음 |
| consumer | 잘못된 UUID/batchId/index | Jira/SQL 집계 호출 없음, terminal fail batch와 `job_fail`만 기록 |
| consumer | 삭제·비활성화된 프로젝트 | stale skip으로 terminal done, 집계 호출 없음 |
| consumer | Jira 429/timeout | 최대 3회 재시도 후 성공하면 한 번만 done; 최종 실패면 `PARTIAL` |
| consumer | Jira 권한/비재시도 오류 | 재시도 없이 terminal fail, job이 `RUNNING`에 남지 않음 |
| consumer | license INACTIVE | Jira/SQL 집계 없이 terminal skip |
| regression | upload-users/subscription consumer | 기존 job completion/재시도 테스트가 통과 |

실행 검증:

```powershell
npm test -- --runInBand src/resolver/scheduler src/queue src/resolver/portfolioDashboard
forge lint
```

manifest 변경 후 development deploy 및 tunnel 재시작, 개발 Jira 사이트에서 Settings 권한 사용자로 실제 queue event와 snapshot 갱신을 확인한다.
