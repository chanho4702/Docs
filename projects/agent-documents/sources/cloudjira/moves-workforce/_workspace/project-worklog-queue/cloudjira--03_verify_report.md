# Project Worklog Queue — 통합 검증 보고서

## 결론

**통과.** F1을 보정한 뒤 정상 경로와 malformed event의 terminal-failure 경로를 다시 교차 검증했다. lint·CI build·실제 Forge runtime은 별도 미검증으로 남는다.

## 통과

### 1. Producer → Queue event 계약

- 생산자: `src/resolver/scheduler/SchedulerService.js:19-46`
  - `job`을 TTL로 먼저 만들고, 프로젝트별 `batchId`, `batchIndex`, `totalBatches`, `projectId`를 만든다.
  - 빈 목록은 `{ appJobId: null, queuedCount: 0, accepted: true }`를 반환한다.
- event 조립: `src/utils/queueUtil.js:28-42`
  - `appJobId`를 각 event body에 추가하고, item별 concurrency key를 보존한다.
- 소비자 검증: `src/queue/consumer.js:33-40, 163-201`
  - 동일한 필수 필드와 `${appJobId}-batch-${batchIndex}` 규칙, UUID를 검증한다.
- 회귀 테스트: `src/resolver/scheduler/__test__/SchedulerService.test.js`
  - 빈 목록/프로젝트별 event/concurrency/manifest 계약을 포함해 통과했다.

### 2. Queue key → manifest function → handler export 계약

- queue 상수: `src/queue/QueueKeys.js:1` = `project-worklog-project-queue`.
- producer: `SchedulerService.js:30`에서 해당 상수를 사용한다.
- consumer 등록: `manifest.yml:61-63`.
- function handler: `manifest.yml:95-97` = `queue/consumer.projectWorklogBatch`.
- 실제 export: `src/queue/consumer.js:163`, `src/index.js:43`.

동일한 queue key와 handler 이름으로 연결돼 있다.

### 3. 단일 프로젝트 집계와 기존 portfolio batch의 분리

- consumer: `src/queue/consumer.js:192-201`이 consumer 시점의 활성 프로젝트만 읽어 `aggregateAndPersistOneProject`을 호출한다.
- 집계 service: `src/resolver/portfolioDashboard/PortfolioAggregator.js:510-527`은 snapshot만 UPSERT하고 `portfolioRollup:current`를 쓰지 않는다.
- 기존 전체 batch는 별도 `aggregateAllProjects` 경로를 유지한다.
- 테스트: `PortfolioAggregator*.test.js` 3 suite 39 tests를 포함한 집중 실행이 통과했다.

### 4. Resolver/권한/응답 shape

- `SchedulerController.js:9`는 `guardedDefine`을 사용한다.
- `PermissionMap.js:214`의 `startProjectWorklogBatch: W('SETTINGS')`와 일치한다.
- `ResponseWrapper.js:3-21`은 service 반환을 `content`로 한 번 더 감싸지 않고 `{ success: true, ...result }`로 반환한다.
- 그러므로 성공 응답은 설계대로 `{ success: true, appJobId, queuedCount, accepted }`다.

### 5. Frontend 경계

- `static/ui/src` 전체에서 `startProjectWorklogBatch` 호출은 없다.
- 따라서 이번 RFC에 frontend invoke·query key·i18n 변경이 없는 설계와 일치한다.
- 관련 frontend Jest: 3 suite, 29 tests 통과.

### 6. 집중 테스트

다음 backend 집중 실행은 성공했다.

```powershell
npm test -- --runInBand src/resolver/scheduler/__test__/SchedulerService.test.js src/queue/__test__/ProjectWorklogBatch.test.js src/queue/__test__/JobCompletion.test.js src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js src/resolver/portfolioDashboard/__test__/PortfolioAggregatorSalaryPolicy.test.js src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js
```

결과: **6 suite, 56 tests 통과**.

## F1 재검증 통과

### 잘못된 `batchId` event의 canonical terminal failure

- identity 생성: `src/queue/consumer.js:26-41`
  - `appJobId`, 정수 `batchIndex`, 유효한 `totalBatches`에서 canonical key `${appJobId}-batch-${batchIndex}`만 만든다.
- invalid-event 처리: `src/queue/consumer.js:180-189`
  - 외부 event의 `batchId`를 저장 key로 신뢰하지 않고, 식별 가능한 경우 canonical key로만 terminal failure를 기록한다.
- 완료 판정: `src/queue/consumer.js:398-434`
  - canonical key 집합만 집계하므로 해당 batch는 `failCount: 1`로 반영되어 최종 job이 `PARTIAL`이 된다.
- 회귀 테스트: `src/queue/__test__/ProjectWorklogBatch.test.js:87-103`
  - foreign `batchId`에 `job_batch`/`job_fail` write가 없음을 확인한다.
  - canonical batch가 `done: true, failCount: 1`로 저장되고 job은 `{ status: 'PARTIAL', failed: 1 }`가 됨을 확인한다.

다음 재검증은 성공했다.

```powershell
npm test -- --runInBand src/queue/__test__/ProjectWorklogBatch.test.js src/resolver/scheduler/__test__/SchedulerService.test.js src/queue/__test__/JobCompletion.test.js
```

결과: **3 suite, 18 tests 통과**.

## 미검증

- `forge lint`: backend 보고서에서 실행 시작 prompt만 확인됐고, 이 환경에서 최종 exit code를 회수한 근거가 없다.
- `CI=true npm run build`: 이번 backend-only RFC에서는 UI 파일 변경 및 invoke caller가 없지만, 최종 build exit code 근거가 없다.
- Forge development 사이트: manifest deploy 후 실제 queue delivery, retry count, Jira 429/timeout, license INACTIVE, migration 적용은 실행 환경이 없어 검증하지 못했다.
