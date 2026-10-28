# 03 통합 검증 리포트 — 프로젝트 삭제 백그라운드화 (2026-10-06)

기준: `01_architect_design.md`(경계면 계약), `02_backend_report.md`, `02_frontend_report.md`, 작업 트리 소스(`git diff` + 신규 파일). 코드 수정 없음.

## 요약

| 분류 | 건수 |
|---|---|
| 통과 | 6개 축 전부 (경계면 · 동시성/멱등 · 보안 장벽 · 효율 · manifest · Forge SQL) + 실행 4종 |
| 실패 | **0** |
| 보류(실사용 빈도 낮음, 이유 명시) | 5 |
| 미검증 | 3 (실배포·E2E 필요) |

실행 결과:
- 루트 `npm test`: **148 suites / 2005 tests 통과**
- `static/ui` `npm test`: **159 suites / 2592 tests 통과**
- `static/ui` `CI=true npm run build`: 성공, bundle:check main 491,522B gzip / panel 329,459B (예산 내)
- `forge lint`: **No issues found** (PermissionLinter "Unknown product" 경고는 기존 환경 문제, 이번 변경과 무관)

---

## 1. 경계면 — 통과

### 1-1. 응답 shape (생산자 ↔ 소비자)

| resolver | 생산자 | 소비자 | 결과 |
|---|---|---|---|
| `deleteProject` | `ProjectDeletionService.js:41-45` `statusDto` → `{content:{deletion: dto}}`, `guardedDefine` 이 `{success:true, ...}` 로 감쌈 (`ProjectController.js:20`) | `ProjectList.jsx:110-133`, `useKanbanMutations.js:263-298` → `readDeletionResult(res, projectId)` (`projectDeletionState.js:37-45`) 가 `result.content.deletion` 을 꺼내고 `success!==true` 분기 | 일치 |
| `getProjectDeletionStatus` | 같은 `statusDto` (`ProjectDeletionService.js:162-166`) | `fetchDeletionStatus` (`projectDeletionState.js:20-26`) → 같은 `readDeletionResult` | 일치 |

- `readDeletionResult` 의 검증(`projectId` 일치·status enum·`retryable` boolean·`completed === (status==='COMPLETED')`)이 백엔드 `dto`(`ProjectDeletionService.js:27-40`)의 `completed: status==='COMPLETED'`, `retryable: status!=='COMPLETED'` 와 정확히 맞는다.
- 프론트가 쓰는 필드(`status`, `completed`, `retryable`, `lastError.code/stage`, `blockedIssueCount`, `issueCounts.unlinked/discovered`, `attempt`)가 모두 `dto` 에 있다.
- 함수 매핑: `PermissionMap.js:112` `deleteProject: W('PROJECT','none')`, `:113` `getProjectDeletionStatus: R('PROJECT','none')` 등록 확인 → PermissionMap 변경 필요 없음. `'none'` 이라 SQL 단계에서 `project_users` 가 지워진 뒤에도 가드에서 막히지 않고, 서비스의 `assertDeletionAccess` 가 `requested_by` + `write` 로 요청자를 통과시킨다(`ProjectDeletionService.js:151-160`).
- 서비스 내부 소비자: `deleteProjectService`/`getProjectDeletionStatusService` 의 import 는 `ProjectController.js` 한 곳뿐. 제거된 심볼(`probeProjectDeletionIssueAsApp`, `findRetryableDeletionIssues`, `markIssuePropertyCleared`, `markIssueFieldCleared`, `markDeletionIssue`, `RETRYABLE_ISSUES`, `CLAIM`)은 `src/` 비테스트 코드에 남은 참조 없음.

### 1-2. 상태별 분기 (백엔드 전이 ↔ 프론트 동작)

| status | 백엔드가 설정하는 곳 | `deletionTickAction` | 모달 | 일치 |
|---|---|---|---|---|
| `DISCOVERING` | `Service.js:120`, `:143`(일시 오류 + lastError) | `advance` (2.5s `deleteProject`) | 스피너 + `preparingHint`, 429/5xx 면 `delayed` | O |
| `UNLINKING` | `Service.js:136`, `Worker.js:221`(일시 오류 + lastError) | `poll` (5s 상태 조회, 12회째 kick) | `backgroundHint` + `issueProgress` + `delayed` | O |
| `SQL_CLEANUP` | `Service.js:137`, `Worker.js:195` | `poll` | `backgroundHint` | O |
| `BLOCKED_JIRA_ACCESS` | `Service.js:132`(stage DISCOVER), `Worker.js:190`(방어) | `null` (정지) | 에러 블록 + 재시도 | O |
| `FAILED` | `Service.js:146`, `Worker.js:186/218/225` | `null` | 에러 블록 + 재시도 | O |
| `COMPLETED_WITH_WARNINGS` | `Worker.js:206` | `null` | 에러 블록 + 재시도 | O |
| `COMPLETED` | `Worker.js:212` | — | 폴링 경로 `setDeletion(null)` + `onCompleted`(`useProjectDeletionLoop.js:96-98`), mutation 경로 `completeDeletion`/`completeCardDeletion` | O |

- BLOCKED 의 stage 가 `UNLINK` → `DISCOVER` 로 바뀌었지만 모달 stageKey 목록(`ProjectDeletionStatusModal.jsx:26`)·`reportDeletionFailure` stages 에 `DISCOVER` 가 이미 있어 영향 없음.
- 백엔드는 `PENDING` status 를 내지 않지만 프론트의 `PREPARING_STATUSES` 에 남아 있는 것은 무해.

### 1-3. 진행 중 lastError 를 실패로 오판하는 곳 — 없음

`lastError` 소비처 전수(`grep lastError static/ui/src`):
- `ProjectDeletionStatusModal.jsx:36` 에러 블록은 `!isActive` 에서만.
- `isDeletionDelayed`(`projectDeletionState.js:17`)는 진행 중 + `JIRA_HTTP_(429|5xx)` 에서만 안내 한 줄.
- `reportDeletionFailure.js:11` 는 `FAILED/BLOCKED/COMPLETED_WITH_WARNINGS` 일 때만 Sentry 전송.
- `useKanbanMutations.js:287-296`, `ProjectList.jsx:113-128` 은 `res.success`/`completed` 로만 분기.
- 백엔드는 회차·준비 시작 시 lastError 를 지운다(`Worker.js:172`, `Service.js:120`) → 일시 오류가 회복되면 안내가 사라진다.

### 1-4. 재진입·닫기

- 목록 `deletion_state` 는 `ProjectQuery` SELECT(라인 35/49)에서, 칸반 `deletionState` 는 `buildData.js:75/101` 에서 공급 → 배지·재진입 라벨의 입력 실재.
- 재진입은 `canWrite` 게이트 안(`ProjectDetailDrawer.jsx:173`, `KanbanCard.jsx:117` `canWriteProject`). 서버도 `W('PROJECT')`.
- 칸반 resume 의 `onMutate` 가 `{}` 를 돌려 `setQueryData(kanbanQueryKeys, undefined)` 가 되는 경로: TanStack v5 `queryClient.setQueryData` 는 `data === undefined` 면 무동작(`query-core/build/modern/queryClient.js:99-102` 확인) → 카드 유지.
- 닫기 후 늦은 응답: `closedId` 로 가려짐, 타이머는 `visible` 변화로 cleanup(`useProjectDeletionLoop.js:81-104`). `advance`(useMutation `mutate`, v5 에서 안정 참조)·`setDeletion`(setState)이 안정적이라 effect 가 렌더마다 재시작되지 않는다.
- i18n 6키: `locales/kr/project.json`·`locales/en/project.json` 에 추가, merge 결과가 `ko-KR.json`·`en-US.json` 에 반영됨. `issueProgress` 의 `{done}/{total}` 은 `tFormat`(`utils/i18n.js:14`) 토큰 형식과 일치.

## 2. 동시성·멱등 — 통과

| 점검 | 근거 | 결과 |
|---|---|---|
| 사슬 단일성 | 적재 전 `QUEUE_SEQ` 를 **lease CAS** 로 저장(`Service.js:139`, `Worker.js:168`, `Service.js:101`), 컨슈머는 `isRoundOf` 로 seq 불일치 폐기(`Worker.js:64, 232, 241`) — lease 획득 전·후 2회 확인 | O |
| 큐 중복 전달 | 같은 seq 두 건: 하나가 lease, 다른 하나는 delay 60 재적재(`Worker.js:234-236`) → 첫 회차가 seq+1 저장 → 재적재분 폐기 | O |
| resolver kick ↔ 컨슈머 | `CLAIM_STALE` 은 lease 만료/없음 **그리고** `updated_at` 5분 경과(`Query.js:7`). `updated_at` 은 `ON UPDATE CURRENT_TIMESTAMP`(`project.sql.js` DDL) 이고 release(lease_token→NULL)가 항상 값을 바꾸므로 정상 사슬 직후 kick 불가. 지연 60s 재적재 < 300s | O |
| resolver prepare ↔ 컨슈머 | prepare 중 status 는 `DISCOVERING` → 컨슈머 `isRoundOf` 탈락. `UNLINKING` 설정(`Service.js:136`)과 seq 저장(`:139`) 사이에 옛 seq 이벤트가 와도 lease 가 resolver 에 있어 재적재 → 이후 seq 불일치로 폐기 | O |
| lease 를 쥔 채 적재 금지 | resolver: `finally release` → `enqueue`(`Service.js:192-195`), kick 동일(`:102-103`), 컨슈머 동일(`Worker.js:242-246`) | O |
| 600s lease ↔ timeout | `ROUND_LEASE_SECONDS = 600`(`Worker.js:37`) = manifest `timeoutSeconds: 600`, 회차 예산 480s(`:36`) — 120s 여유. `unlinkBatch` 는 내부에 `hasTime` 검사가 없어 마지막 배치가 예산을 넘길 수 있으나 `withJiraRetry` 가 deadline 뒤 대기를 거부하므로 초과분은 배치 1개(최대 프로퍼티 DELETE 100회/병렬 5) 수준 | O |
| resolver 25s | 예산 12s(`Service.js:48`), 재시도 대기 ≤2s·deadline 검사, lease 55s > 25s | O |
| 영구 단절 경로 | 컨슈머 적재 실패·비정상 종료·라이선스 정지 시 사슬이 끊기지만, 모든 경우 status 는 `UNLINKING/SQL_CLEANUP` + `accessVerified=DONE` 으로 남고 lease 는 만료되므로 `kickIfStale` 조건을 반드시 다시 만족한다 → **영구 단절 없음**(단, 복구 트리거가 화면에 있음 — 보류 B-1) | O |
| 진행 보장 | `UNVERIFIED` 판정 루프: 판정된 행은 반드시 UNVERIFIED 를 벗어남(`Service.js:88-90`). `PENDING` 해제 루프: 모든 행이 DONE/FAILED 로 빠지거나 `TransientJiraError` 로 회차 종료(`Worker.js:67-126`, `MARK_FIELD_MANY` 가 DONE 동시 설정 `Query.js:19`) → 무한 루프 없음 | O |
| 일시 오류 상한 | 진행 없는 회차 연속 10회 → FAILED(`Worker.js:216-219`) | O |

## 3. 보안 장벽 — 통과

| 점검 | 근거 | 결과 |
|---|---|---|
| 컨슈머는 PENDING 행만 쓴다 | 쓰기 대상 조회는 `findDeletionIssuesByState(…,'PENDING',50)`(`Worker.js:177`) 하나. 행 삽입은 `UNVERIFIED`(`Query.js:13`), `PENDING` 은 `verifyIssueAccess` 의 asUser 보임 판정에서만 부여(`Service.js:88`). 쓰기 직전 app 연결 재확인(`Worker.js:69, 102`) | O |
| BLOCKED 는 어떤 쓰기보다 먼저 | 판정 루프 완료 후 BLOCKED>0 이면 정지·적재 없음(`Service.js:131-134`), 컨슈머도 UNVERIFIED/BLOCKED 잔존 시 SQL 진입 거부(`Worker.js:189-192`) | O |
| 재시도 재판정 | `FAILED`/`BLOCKED_JIRA_ACCESS` 재시도 → `FAILED`·`BLOCKED_INACCESSIBLE` 행을 UNVERIFIED 로(`Service.js:117-118`) → 같은 판정 함수 | O |
| 구버전 보정(prepareV2) | `prepareV2` 미기록이면 PENDING·FAILED·BLOCKED 전부 UNVERIFIED 로 1회(`Service.js:113-116`). 구버전 백그라운드 status 는 `accessVerified` 가 없어 kick 분기(`:184`)·조기 반환(`:111`)을 타지 않고 반드시 prepare 로 들어간다. 컨슈머는 `queueSeq` 없는 행을 `Number(undefined)===seq` 불일치로 폐기 → **판정 우회 없음** | O |
| 형제 경로 | 같은 데이터를 바꾸는 진입점은 `deleteProject` 하나(쓰기)와 큐 컨슈머(사용자 입력 없음, seq·uuid 검증 `consumer.js:430-433`) | O |
| 권한 | `kickIfStale` 도 `assertDeletionAccess(write)` + 신원 일치 뒤(`Service.js:172-186`) | O |

## 4. 효율 — 통과

| 항목 | 근거 | 결과 |
|---|---|---|
| reconcileIssues ≤ 50 | 판정 `JQL_CHUNK=50`(`Service.js:51`), 실행 `UNLINK_BATCH=50`(`Worker.js:41`) | O |
| 이슈당 호출 | 50건당 JQL 2회 + 필드 PUT 1회 + 프로퍼티 DELETE 2×n(병렬 5) | O |
| 필드 PUT 50건 일괄 | `setAppFieldValueForIssues` 1회, 비일시 실패 시만 개별 분리(`Worker.js:105-122`) | O |
| p-limit | 판정 3(`Service.js:82`), 프로퍼티 5(`Worker.js:82`) | O |
| 429 Retry-After | `retryAfterMsOf`(`RequestJiaJson.js:10-13`) → `withJiraRetry` 가 우선 사용, `maxWaitMs` 상한, deadline 초과 시 즉시 Transient(`deletionJiraRetry.js:281-282`) | O |
| 공용 래퍼 동작 불변 | 5곳 모두 throw 여부·code·message·fallback 그대로, 에러 객체에 `retryAfterMs` 만 추가. `retryAfterMs` 를 읽는 곳은 `deletionJiraRetry.js` 뿐(grep). 에러 직렬화(`guardedDefine` `{name,code,message,cause}`)에 새 필드가 실리지 않음 | O |
| fieldId 조회 | 회차당 1회(`Worker.js:179` `??=`) | O |

## 5. manifest / 큐 키 — 통과

- consumer `project-deletion-consumer` → queue `project-deletion-queue` → function `projectDeletion` → handler `queue/consumer.projectDeletion`, `timeoutSeconds: 600` (`manifest.yml` diff) — 기존 `backfillIssueLinks` 와 같은 형식.
- `QueueKeys.PROJECT_DELETION_QUEUE_KEY = 'project-deletion-queue'` = manifest queue 값.
- `consumer.js:429-436` export 명 `projectDeletion` = handler 경로. `{retry:false}` 라 `createConsumerHandler` 는 예외를 그대로 던진다(Forge 재전달 없음, 설계 의도).
- `@forge/events` 2.0.18 `PushEvent{body, delayInSeconds}` 형식, delay 60 ≤ 900 상한.
- 프로젝트 id 는 `crypto.randomUUID()`(v4) → consumer UUID 정규식 통과.
- `forge lint`: No issues found.

## 6. Forge SQL 제약 — 통과

- LIMIT·INTERVAL 은 정수 검증 후 리터럴(`Query.js:5, 7, 15`) — 바인딩 없음.
- SELECT 목록 서브쿼리 없음. 신규 SQL 은 단순 UPDATE/SELECT + `IN (?,…)` (n ≤ 150).
- `JSON_SET(steps_json, '$.queueSeq', ?)` 은 기존 `STEP_DONE`·`DISCOVERY` 와 같은 함수(운영에서 이미 사용). 숫자가 문자열로 저장돼도 `Number()` 비교(`Worker.js:64`, `Service.js:100,138`)로 흡수.
- 트랜잭션 가정 없음 — 각 단계 멱등(`MARK_ISSUES_STATE` 는 `issue_state <> 'DONE'`, UPSERT 는 기존 상태 보존).

---

## 보류 (실사용에서 드묾 / 설계가 수용한 위험 — 고치지 않음)

| # | 내용 | 위치 | 보류 이유 |
|---|---|---|---|
| B-1 | 사슬이 끊겼을 때(적재 실패·컨슈머 비정상 종료·라이선스 정지) 복구 트리거는 화면 폴링의 12회째 kick 과 재진입뿐. 창을 닫은 뒤 끊기면 사용자가 「삭제 진행 상황」으로 다시 열 때까지 멈춘다(배지는 계속 「삭제 중」) | `Service.js:94-104`, `useProjectDeletionLoop.js:89` | 끊김 자체가 드물고 재진입 즉시 복구된다. 실측에서 빈도가 보이면 스케줄 트리거에 `BACKGROUND + stale` 스윕 1개를 추가하는 것으로 충분 |
| B-2 | 폴링 1회가 브리지 예외/`success:false` 면 `deletionFailure`(FAILED, stage REQUEST)로 바뀌어 추적이 멈추고 Sentry 에 error 로 1건 남는다. 서버는 계속 진행 중 | `projectDeletionState.js:20-26`, `useProjectDeletionLoop.js:93-100` | 재시도 버튼 → `deleteProject` 가 실제 상태(UNLINKING 등)를 돌려줘 즉시 복구. 기존 advance 실패 처리와 같은 동작 |
| B-3 | `deleteIssueProperty`·`deleteIssueLink`·`setAppFieldValues` 의 `requestJira` 자체 예외(네트워크)는 `'Request Jira Error'` 로 감싸지지 않아 일시 오류로 분류되지 않고 해당 행이 FAILED 가 된다 | `deletionJiraRetry.js:263-268`, `IssuePropertyApi.js:90`, `IssueLinkPropertyApi.js:150`, `AppFieldValueApi.js:57` | 설계 §3-4 범위(네트워크 = `RequestJiaJson` 경로)대로. FAILED → 재시도로 재판정 후 이어짐 |
| B-4 | 회차 시작의 `getProjectIdFieldIdApi('app')` 가 429 를 맞으면 재시도 없이 FAILED(UNLINK) | `Worker.js:179` | 회차당 1회 호출이라 드묾. 재시도로 복구 |
| B-5 | 컨슈머가 FAILED 를 기록하고 lease 를 놓기 전 몇 ms 사이에 사용자가 재시도하면 lease 실패로 같은 FAILED 가 다시 보인다 | `Service.js:189-190` | 한 번 더 누르면 진행. 창이 극히 짧음 |

## 미검증 (실배포·E2E 필요)

1. Forge 큐 실동작 — `delayInSeconds` 지연 재적재, 컨슈머 600s 회차, 컨슈머에서 같은 큐 재적재(로컬 jest 는 `createQueue` mock).
2. 앱 필드 다건 PUT(`/app/field/{id}/value`, 50건)의 부분 실패 의미 — 개별 분리 경로(`Worker.js:110-122`)가 실제로 필요한지/동작하는지.
3. 실화면 — 모달 닫기 후 백그라운드 완료 → 목록·칸반 배지 소멸, 재진입 시 kick, 대규모(수천 건) 프로젝트의 준비 단계 이어 호출 횟수.

---
## 후속: Codex 검토 반영 (2026-10-06, 리더 직접 수정)
| # | 지적 | 조치 |
|---|---|---|
| 1 | 다음 회차 적재 실패·창 닫은 뒤 사슬 끊김 → 영구 정지 | **반영** — 시간별 scheduledTrigger `project-deletion-sweep` → `kickStaleDeletions`(접근 판정 끝난 백그라운드 삭제 중 lease 없음+5분 무갱신만 kick). 최악 지연 ~1시간 |
| 2 | 병렬 DELETE 진행 중 markFailed SQL 실패로 Promise.all 조기 reject → lease 해제 후 겹침 | **반영** — markFailed 실패를 모아 Promise.all 회수 뒤 throw |
| 3 | A·B 서로 다른 부분 가시성의 판정이 합쳐져 장벽 우회 | **반영** — `steps_json.verifiedBy` 고정, 요청자 바뀌면 PENDING 포함 전부 재판정 |
| 4 | 429 대기 중 이슈가 다른 프로젝트로 재연결되면 필드 PUT 이 새 연결을 지움 | **보류** — 같은 이슈가 삭제 중 프로젝트에서 수 초 재시도 창 안에 재연결돼야 함. 재시도 단위를 "재확인+PUT"으로 묶으면 해소 가능 |
| 5 | 12회째 kick 통신 실패가 UI FAILED 로 굳음 | **반영** — kick 을 mutation 대신 폴링 경로(`fetchDeletionStatus(id, true)`)로, 재시도 가능한 요청 실패는 상태 유지 |
추가: 폴링 1회 통신 실패도 상태 유지(권한 상실·기록 없음 등 retryable=false 는 표시).
검증: 루트 jest 2007 / 프론트 jest 2593 통과, `CI=true npm run build` 예산 이내, `forge lint` 이슈 없음.

## 후속 2: Codex 재검토 (2026-10-07)
이전 수정 1·2·3·5 효과 확인됨. 신규 2건 반영:
| # | 지적 | 조치 |
|---|---|---|
| R1 (P1) | 50건 일괄 판정 후 p-limit 대기 중 이동한 이슈의 새 프로젝트 프로퍼티(movesRms·movesRmsLink) 삭제 | 묶음(5건)마다 실행 직전 연결 재확인 후 DELETE. 재확인 일시 오류는 앞 묶음 cleared 기록 후 넘김. 테스트 추가 |
| R2 (P2) | 폴링 상태 유지 분기가 LICENSE_INACTIVE 등 서버 코드 실패까지 숨김 | 유지 대상을 통신 실패(`PROJECT_DELETION_REQUEST_FAILED`)로 한정. 테스트 추가 |
동시 실행·판정 우회·Forge SQL 위반·manifest 불일치는 추가 발견 없음. 루트 jest 2008 / 프론트 jest 2594 통과.
