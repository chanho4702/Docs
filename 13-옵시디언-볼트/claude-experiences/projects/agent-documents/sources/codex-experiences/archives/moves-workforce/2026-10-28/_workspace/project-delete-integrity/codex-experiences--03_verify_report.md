# 프로젝트 삭제 무결성 — 재검증 보고서

검증일: 2026-08-31

## 통과

### F1 — 접근 불가 Issue가 SQL cleanup을 우회하지 않음

- 생산자: `src/resolver/project/ProjectDeletionQuery.js:9`의 `RETRYABLE_ISSUES`는 `PENDING`, `FAILED`, `BLOCKED_INACCESSIBLE`을 모두 재조회 대상으로 삼는다.
- 소비자: `ProjectDeletionService.js:67-76`은 매 재시도마다 asUser 접근성을 재확인한다. `:151-155`는 집계에 접근 불가 행이 하나라도 있으면 `BLOCKED_JIRA_ACCESS`로 반환하고 SQL 단계에 진입하지 않는다.
- 회귀: `src/resolver/project/__test__/ProjectDeletionService.test.js`의 접근 불가 snapshot 테스트가 두 번의 요청 모두 차단되고 SQL mock이 호출되지 않음을 확인한다.

### F2 — transient Jira unlink 실패가 facet 단위로 재시도됨

- 생산자: `ProjectDeletionService.js:79-80`은 실패/차단 행을 `PENDING`으로 전환하되 `property_cleared_at`·`field_cleared_at`은 보존한다.
- 소비자: `:86-97`은 완료된 facet을 건너뛰고 남은 property/field만 처리한다.
- 회귀: transient unlink 실패 테스트가 두 번째 요청에서 property 재시도, field 1회 처리, SQL cleanup 완료를 검증한다.

### F3 — `DELETING` 중 Issue 메타데이터 write가 fail-close됨

- 공용 생산자: `ProjectDeletionRepository.js:23-26`의 `assertProjectAcceptsIssueMetadata`.
- 소비자: `ProjectUsersService.js:289-299`(RMS project field의 현재·새 프로젝트), `:434-436`(coworker), `:461-463`(assigned date), `WorkAssignmentWriter.js:56-58`, `SubscriptionSweeper.js:107-110`, `GanttService.js:238-240`에서 모두 `PROJECT_DELETING`으로 차단한다.
- 회귀 대상: Issue field/date, subscription, assignment, Gantt 테스트를 집중 실행했다.

### F4 — 프런트 import 및 완료 판단 계약

- `static/ui/src/pages/project/ProjectList.jsx:9-10`이 `useMutation`, `invoke`를 import한다.
- 생산자: `ProjectDeletionService.js:26-42`가 `attempt`, `issueCounts`, `sqlSteps`, `lastError`, `updatedAt`을 포함한 `DeletionStatus` DTO를 조립한다.
- 소비자: `ProjectList.jsx:110-119`, `useKanbanMutations.js:245-258`는 `content.deletion.completed === true`일 때만 성공 UI/cache invalidation을 수행한다.
- query key: `projectDeletionKeys.status(projectId)`가 factory로 정의돼 있다. 진행 재개는 status polling 대신 동일 mutation의 bounded advance로 구현된다.

### F5/F6 — 단계 상태 및 최초 생성 경쟁 조건

- `ProjectDeletionQuery.js:4`는 `INSERT ... ON DUPLICATE KEY UPDATE`로 생성 경쟁을 멱등 처리하고, 뒤의 lease claim만 한 요청을 진행시킨다.
- `ProjectDeletionService.js:104-121`은 각 SQL 삭제 후 JSON step/state를 기록한다. SQL 오류 후 재호출은 idempotent DELETE를 다시 수행한다.
- 회귀: lease 미획득, 정상 완료 시 작업 행 제거, SQL 단계 실패 후 재시도 테스트가 통과했다.

### 등록·권한·번역

- `ProjectController.js:21-22`는 두 resolver를 `guardedDefine`으로 정의한다.
- `PermissionMap.js:109-110`에 `deleteProject`(PROJECT write/detail), `getProjectDeletionStatus`(PROJECT read/detail)가 등록돼 있다.
- `locales/kr/project.json`, `locales/en/project.json`에 진행·차단·재시도 문구가 있으며 generated locale 파일도 merge 결과를 포함한다.
- deletion DTO/UI는 Jira Issue key/summary를 반환·표시하지 않는다.

## 실행 검증

| 구분 | 결과 | 근거 |
|---|---|---|
| P1 집중 backend | 통과 | 11 suites, 115 tests (`ProjectDeletionService`, Issue field/date, subscription, assignment, Gantt) |
| backend 전체 Jest | 미검증 | 전체 실행은 다수 suite PASS 출력 후 이 환경이 최종 summary/exit code를 반환하지 않았다. 후속 process는 종료됨. |
| frontend 전체 Jest | 미검증 | 다수 suite PASS 출력 후 이 환경이 최종 summary/exit code를 반환하지 않았다. 후속 process는 종료됨. |
| CI frontend build | 통과 | `CI=true npm run build` 후 `static/ui/build/asset-manifest.json` 생성(11:38:55), 이어 `npm run bundle:check` 통과 (`gzipBytes` 435,981 / budget 950,000). |
| forge lint | 미검증 | `forge lint`는 안내 banner 뒤 이 환경에서 최종 결과를 반환하지 않았다. lint worker process는 종료됨. |
| diff whitespace | 통과 | `git diff --check` 오류 없음. |

집중 테스트의 console output은 기존 의도적 failure-path mock(500/429, Forge fetch stub 미구성) 로그이며 테스트 자체는 성공했다.

## 미검증/권고

- 실제 Jira 개발 사이트에서 접근 불가 Issue → 권한 부여 후 재시도, 100건 초과 discovery page, Forge SQL migration v020~v022 적용을 확인해야 한다.
- 전체 Jest와 `forge lint`는 CI에서 최종 exit code를 다시 회수해 확인한다. 현 실행 환경의 출력 수집 제약 때문에 이를 통과로 간주하지 않는다.

## 판정

**P1 프로젝트 삭제 saga의 코드·경계면은 배포 준비 상태입니다.** 치명 결함 F1~F6은 재검증에서 해소됐고 집중 회귀 115개가 통과했습니다. 단, 배포 승인 전 CI에서 backend/frontend 전체 Jest와 `forge lint`의 최종 exit code를 확인해야 합니다.
