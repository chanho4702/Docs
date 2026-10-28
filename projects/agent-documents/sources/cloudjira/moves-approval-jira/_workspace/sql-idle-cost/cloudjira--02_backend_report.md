# sql-idle-cost — 백엔드 보고서 (1회차, 2026-10-10)

설계 충돌 없음. 불변식 4(CAS `rev = rev + 1`)·리스 겹침 방지·"미완주 시 watermark 미전진"·트리거 무 throw 를 모두 유지했다.
resolver 추가·변경 없음(3단계 등록 무관). 마이그레이션 추가 없음(최댓값 v048 그대로). 프론트 무변경.

## 1. 유휴 SQL 전·후

조건: 사용자 0명·Jira 이벤트 0건, 스키마 준비, 잡 행·커서 존재, 처리 대상 0건.
"전"은 `codex-review.md` 의 코드 추적·모의 실행 수치(warm = readiness 캐시 있음 / cold = 없음).
"후"는 `src/trigger/__test__/idleSqlBudget.test.js` 가 실제 서비스를 모의 executeQuery 로 돌려 센 값(KVS 마커 현재 상태).

| 작업 | 전: 실행당 SQL | 전: 주기 | 전: 하루 | 후: 실행당 SQL | 후: 주기 | 후: 하루 |
|---|---:|---|---:|---:|---|---:|
| 전환 자동 적용 복구 | 5 / cold 19~20 | 5분 | 1,440 / 5,760 | **4** | 일 1(큐) | 4 |
| 워크포스 게시(미연동·차단) | 10 / cold 13~14 | 5분 | 2,880 / 4,032 | **2** (관문 1 + 로그 정리 1) · 정책 OFF·키 없음 **1** | 일 1(큐) | 1~2 |
| 워크포스 게시(연동·유휴) | 12 / cold 15~16 | 5분 | 3,456 / 4,608 | **12** (관문 1 + 대조 4 + tick 7) | 일 1(큐) | 12 |
| 만료 이어받기(5분) / 일일 만료 | 2 (5분) + 일일 ~13 | 5분+일 | ~590 | **10** (리스 1, 정책 1, 만료·임박 4, 보존 정리 3, 해제 1) | 일 1(큐) | 10 |
| 타임시트 자동 마감 + 누락 보정 | 13 | 시간 | 312 | **5** (존재 2, 기준점 UPDATE 1, 고아 정리 2) | 일 1(큐) | 5 |
| 워크로그 이력 누락 보정 | 11 (+Jira 2) | 시간 | 264 (+Jira 48) | **6** (+Jira 2) | 일 1(큐) | 6 (+Jira 2) |
| 일일 트리거 본체 | 마이그레이션 러너 2(+α) | 일 | ~2 | **0** (마커 현재면 러너도 안 부름) | 일 1 | 0 |
| **하루 합계(미연동)** | | | **약 5,500 (warm) ~ 11,500 (cold)** | | | **27 (+Jira 2)** |
| **하루 합계(연동·유휴)** | | | 약 6,000 ~ 12,100 | | | **37 (+Jira 2)** |

테스트로 고정한 상한: expiry ≤10, transition-apply ≤4, timesheet ≤5, worklog-history ≤6, workforce 미연동 ≤2 / 차단 ≤1 / 연동 ≤12,
일일 트리거 본체 0, 미연동 하루 합계 ≤27. information_schema 0회도 단언한다.

마커가 없거나 다를 때(배포 직후 첫날 등)는 기존 information_schema 경로로 폴백한다 — 이 경우만 콜드 비용이 붙는다(테스트로 확인).

## 2. 큐 fan-out 구조

```
scheduledTrigger approval-sweep (day) → index.runSweep
  ├ trustSchemaMarker() — KVS schema:version == LATEST_MIGRATION 이면 마이그레이션 생략, 아니면 runMigration()
  └ queue('approval-sweep-queue').push([ {body:{job, round:0, cloudIdHint}} × 5 ])   ← push 1회
       실패 시: 같은 호출에서 작업마다 INLINE_BUDGET_MS=5초로 순차 실행, 누적 INLINE_TOTAL_MS=15초 넘으면 나머지 생략(로그만)

consumer sweep-job-consumer (queue approval-sweep-queue) → index.runSweepJob
  └ runSweepJobOnce(job, {round, budgetMs: JOB_BUDGET_MS=20초})
       trustSchemaMarker() → 작업 실행 → {complete}
       complete=false && round < MAX_CONTINUATIONS(3) → 같은 job 을 round+1, delayInSeconds=10 으로 push(실패는 로그만)
       절대 throw 하지 않음, 반환값 없음(InvocationError 재시도 방지)
```

작업(`src/trigger/sweepJobs.js` `SweepJob`):

| job | 실행 | complete 판정 |
|---|---|---|
| `expiry` | `ExpiryService.sweep({budgetMs})` — 만료·임박·독촉·감사/알림 보존 정리 | `summary.complete`(= !incomplete) |
| `transition-apply` | `runTransitionApplySweep({budgetMs})` | `!failed && complete` |
| `timesheet` | round 0 만 `recordAutoCloses()` → `TimesheetDriftService.sweep({budgetMs: 남은 시간})` (순서 보존) | drift `summary.complete` |
| `worklog-history` | `WorklogHistoryRecorder.sweep({budgetMs})` | `summary.complete` |
| `workforce` | `WorkforcePublisher.runDaily({round, cloudIdHint, budgetMs})` — 관문 1회 → (round 0) 대조 `verifyPublished`(예산 1/3) → 게시 `tick`(남은 예산) | tick `complete`(배출 한 페이지 꽉 참·예산 소진·펼침/스캔 미완주면 false. WRITE_DENIED·CLOUD_ID_UNKNOWN 은 true — 다시 돌아도 같다) |

재시도 상한: 작업당 하루 최대 1 + 3 = 4 실행. 그래도 남으면 리스 행의 cursor 가 다음 날로 넘긴다(watermark 미전진).

리스 쉼(`next_run_at`) 규칙 변경 — 이어달리기가 곧바로 다시 잡을 수 있게 **미완주(PARTIAL·FAILED)는 쉬지 않는다**(now + 0).
완주(OK)는 기존 쉼 유지(JobLease·drift 50분, expiry 20시간, verify 20시간, transition 0).

## 3. 유휴 쿼리 제거 — 바뀐 곳

| 파일 | 변경 |
|---|---|
| `src/rdb/schema/TableReadiness.js` | `primeTableReadiness` 는 한 번 채웠거나 스키마가 현재로 확인됐으면 조회 안 함. `areColumnsReady(table, cols)` 신설 — information_schema.columns 1회로 일괄. `isColumnReady` 는 그 래퍼. `markSchemaCurrent`/`isSchemaMarkedCurrent` — 설치 id(`getAppContext().installationAri.installationId`) 키로 "현재 스키마" 확인 상태 보관, 확인된 설치에서 마이그레이션 DDL 테이블은 프로브 생략 |
| `src/rdb/schema/migrate.js` | 마이그레이션 목록을 배열 `MIGRATIONS` 로(이름·순서 불변, 계약 테스트 통과). `LATEST_MIGRATION`·`SCHEMA_TABLES`·`SCHEMA_MARKER_KEY='schema:version'`·`trustSchemaMarker()` export. `applyMigrations` 가 `run()` 성공 뒤에만 마커 기록 + in-process 표시 |
| `src/resolver/worklogHistory/JobLease.js` | `claimJobLease(query, jobKey, now, leaseMs)` 신설: 조건부 UPDATE 1회 → 0행이면 INSERT IGNORE → 1행 삽입 때만 UPDATE 재시도. `JobLease.acquire` 는 획득 성공 시에만 cursor/watermark SELECT 1회. release 는 OK 만 restMs |
| `src/resolver/approval/ExpiryService.js` | `acquireLease` → `claimJobLease`. `sweep({continuation})` 분기 삭제 → `sweep({budgetMs})`, 반환에 `complete`. 하위 커서 저장은 값이 같으면 생략, 있으면 UPDATE 1회·없을 때만 INSERT. 예산 40초 → 20초 |
| `src/resolver/timesheet/TimesheetDriftService.js` | 리스 → `claimJobLease`. 타임시트·마감이 하나도 없으면 리스 없이 `advanceIdleWatermarks`(UPDATE 1문장, `next_run_at <= now` 조건으로 남의 리스 비켜 감). `sweep({budgetMs})`, `complete` 반환 |
| `src/resolver/worklogHistory/WorklogHistoryRecorder.js` | 사이트 이력(KVS)이 켜져 있으면 하위 범위 인덱스·인증 추적 조회(SQL 2회) 생략. `sweep({budgetMs})`, `complete` 반환 |
| `src/resolver/workforce/WorkforcePublisher.js` | `gate(policy)`: 정책 OFF·암호 불가·서명키 없음(SQL 0) / 저장소 미준비 / **검증 수신 이력 없음 → `NOT_LINKED`**(SQL 1). 막히면 리스·펼침·스캔·배출 전부 생략(스캔 커서는 그 자리 — 다시 열리면 커서부터 따라잡음). 스캔 커서가 그대로면 `writeCursor` 생략. `touchKidMismatch` 는 KVS `approval:link:publishedKid` 와 kid 가 다를 때만(한도 200 미만으로 끝나면 마커 기록). `runDaily` 신설. `PublishState.NOT_LINKED` 추가(tick 요약 전용, 화면 상태 API 무변경) |
| `src/resolver/workforce/WorkforceLinkRepository.js` | `acquireLease` → `claimJobLease`, **boolean 반환**(호출부는 진리값만 썼다). `writeCursor` UPDATE 우선·0행일 때만 INSERT. `hasAnyVerifiedInbound()` 신설 |
| `src/resolver/transition/TransitionRepository.js` | `ready()` 컬럼 12개를 `areColumnsReady` 1회로(주입된 columnReady 만 있는 테스트는 기존처럼 건별) |
| `src/resolver/settings/SettingsRepository.js` | `getPolicy()` 인스턴스 캐시 TTL 60초(`POLICY_CACHE_TTL_MS`), 얕은 복사 반환, `setValue`(→ `savePolicy`·`setApprovers` 등 모든 쓰기)가 즉시 무효화. `invalidatePolicyCache()` export |

KVS 마커 규약:
- 키 `schema:version`, 값 = 현재 코드의 마지막 마이그레이션 이름(지금 `v048_create_approval_export_entry`).
- 기록: `applyMigrations()` 가 `migrationRunner.run()` 성공 뒤에만(onInstall·일일 트리거·resolver `ensureMigratedOnce` 3경로 모두). KVS 쓰기 실패는 삼킨다(폴백일 뿐).
- 신뢰: 트리거·consumer 의 `trustSchemaMarker()` 가 **값이 정확히 같을 때만**. 다르면(구버전이 낮춰 썼거나 새 마이그레이션 미적용) false → information_schema 폴백, 일일 트리거는 마이그레이션 실행.
- 신뢰 범위: 마이그레이션 DDL 의 `CREATE TABLE IF NOT EXISTS` 테이블만. 모르는 이름은 여전히 프로브. 컬럼은 그 테이블이면 준비로 본다(코드가 프로브하는 컬럼은 모두 ALTER 마이그레이션 산물).
- resolver 경로 `ensureMigratedOnce` 는 그대로(성공 시 in-process 표시가 덤으로 생김).

## 4. 앱 실행 시 처리(요구 3)

추가 구현 없음. 확인한 기존 경로:
- 결정: `ApprovalService.decide` — PENDING 이고 `now >= expiresAt` 이면 `expireOverdue` 후 `REQUEST_NOT_PENDING` (`src/resolver/approval/ApprovalService.js:862-866`).
- 재요청: 열린 요청 생성 전에 지난 마감 요청을 만료(`ApprovalRepository` `expires_at <= ?` 조회, 240·251행).
- 업무함: `expires_at < CURRENT_TIMESTAMP` 기한 초과 필터·`expiresAt` 응답(`InboxRepository.js:53-58`, `InboxService.js:172`).
- 전환 자동 적용: 결정 직후 `TransitionExecutor.apply` await(codex 검토 확인).
resolver 응답 후 fire-and-forget 은 넣지 않았다.

## 5. manifest

- `scheduledTrigger`: `five-minute-sweep`·`timesheet-sweep`·`worklog-history-sweep` 삭제, `approval-sweep`(day) 하나.
- `consumer` 신설: `sweep-job-consumer` / queue `approval-sweep-queue` / function `runSweepJob`. `timeoutSeconds` 미지정.
- `function`: `runFiveMinuteSweep`·`runTimesheetSweep`·`runWorkforcePublish`(원래도 참조 없는 고아였다)·`runWorklogHistorySweep` 삭제, `runSweepJob` 추가.
- scope·egress 무변경 → major 아닐 것으로 예상(미검증 S4). `--upgrade` 는 모듈 변경이라 필요.
- `package.json`: `@forge/events ^2.1.7` 추가(`@forge/api` 7.2.2 와 짝). `package-lock.json` 갱신.
- `forge lint`: **No issues found** (CLI 13.4.0).

`src/index.js` export: `runSweep`, `runSweepJob`, `onInstall`, `onWorklogChanged`, `onIssueChanged`, `validateTransition`, `runMigration`, `handler`
(삭제: `runTransitionApplySweep`·`runFiveMinuteSweep`·`runTimesheetSweep`·`runWorkforcePublish`·`runWorklogHistorySweep`).

## 6. 반환 shape (프론트 소비 없음 — 트리거·consumer 내부)

```js
// runSweep (createRunSweep 반환 함수)
{ migrated: boolean, queued: string[], inline: [{ job, complete }], skipped: string[] }
// createSweepJobConsumer 반환 함수 (manifest 핸들러 runSweepJob 은 undefined 반환)
{ job, round, complete: boolean, continued: boolean, skipped?: 'UNKNOWN_JOB' }
// WorkforcePublisher.runDaily
{ gate: null | 'DISABLED'|'CRYPTO_UNAVAILABLE'|'KEY_NOT_CONFIGURED'|'STORAGE_NOT_READY'|'NOT_LINKED', verify, publish, purged, complete }
```

## 7. 테스트

- `npm test -- --runInBand`: **111 suites / 1512 tests 통과** (작업 전 108 / 1479).
- 신규: `src/trigger/__test__/runSweep.test.js`(트리거·consumer 9), `src/trigger/__test__/idleSqlBudget.test.js`(유휴 SQL 상한 12),
  `src/rdb/schema/__test__/TableReadiness.test.js`(일괄 컬럼·prime·마커 7), `src/resolver/settings/__test__/SettingsPolicyCache.test.js`(3).
- 대체: `runFiveMinuteSweep.test.js` 삭제 → 위 신규로. `PeriodLockWiring`(자동 마감 → 감지 순서)·`onWorklogChanged`(이력 보정 무 throw) 를 큐 작업 기준으로 고침.
- 수정: `JobLease.test`(UPDATE 우선 획득·미완주 무휴식), `ExpiryService.test`(continuation 분기 → 유휴 커서 쓰기 생략), `TimesheetDriftService.test`(타임시트 없음 = UPDATE 1문장), `WorkforcePublisher.test`(관문·kid 마커·NOT_LINKED).

## 8. 미검증

`04_spike_todo.md` S1~S9: consumer 실행 한도(25초 가정, codex 는 55초라 함), 큐 지연, `@forge/events@2.1.7` 런타임, major 여부, 큐 push scope, 중복 배달, 트리거 cloudId, 마커 기록 실측, `getAppContext` 가용성.

## 발견 (고치지 않음)

1. **관리자 "재게시" 체감 지연** — `WorkforceLinkService` 재게시는 큐만 재무장하고 실제 PUT 은 다음 일일 스윕이다. 예전엔 5분 안, 이제 최대 하루. 화면 문구가 "곧"을 약속하면 frontend 확인 필요.
2. **연동 판정 = 검증 수신 이력** — 워크포스가 설치돼 있어도 우리 쪽에서 워크포스 게시물을 한 번도 asUser 로 읽어 검증한 적이 없으면 게시하지 않는다(`NOT_LINKED`). 운영 지시대로 구현했지만, 워크포스가 "승인 게시물을 먼저 받아야 자기 게시물을 쓰는" 순서라면 교착이다 — 워크포스 리포 계약 확인 필요.
3. `JobLease.release` 는 소유 토큰 없이 `job_key` 만으로 UPDATE 한다(codex 지적). 작업 예산 20초 < 리스 2~10분이라 이번 구조에선 겹치지 않지만, consumer 한도를 늘릴 때 같이 봐야 한다.
4. `RetentionRepository` 의 컬럼 프로브 2개 쌍(50·69·174행)은 건별 그대로다(마커 현재면 0회라 유휴 비용 없음).
5. 핫패스 비용(`onWorklogChanged`·`onIssueChanged` 의 무관 이벤트 SQL)은 이번 범위 밖 — codex 검토 "빠진 비용원 5" 참고.
6. `AGENTS.md`·`CLAUDE.md` 의 스케줄 설명(5분·시간당)·`docs/DESIGN.md` 갱신은 리더 몫.
