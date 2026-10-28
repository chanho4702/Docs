# Project deletion backend verifier remediation

- `BLOCKED_INACCESSIBLE`, `FAILED`, `PENDING` Issue row를 모두 retry 대상으로 다시 조회한다. retry마다 `asUser` 접근성을 재확인하고, 접근 불가 row가 하나라도 남으면 SQL cleanup으로 진행하지 않는다.
- 접근 가능한 `FAILED`/`BLOCKED_INACCESSIBLE` row는 unlink 전에 `PENDING`으로 되돌린다. property/field 완료 시각은 유지하므로 이미 성공한 facet은 다시 쓰지 않는다.
- `project_deletion_issue` 집계에 `BLOCKED_INACCESSIBLE`가 남아 있으면 `BLOCKED_JIRA_ACCESS` 상태로 반환하며 SQL cascade를 차단한다.
- 삭제 진행 중 Issue metadata write 차단을 `updateProjectIdFieldService`, `updateIssueCoworkersService`, `recordIssueAssignedDateService`, subscription tagging, Gantt WBS property write, work assignment에 연결했다. 차단 응답은 `PROJECT_DELETING`이다.
- 삭제 상태 DTO는 `attempt`, `issueCounts`, `sqlSteps`, `lastError`, `updatedAt`을 포함한다. SQL child 단계가 완료될 때마다 `steps_json`에 `DONE`을 기록한다.
- deletion 작업 생성 INSERT를 duplicate-key-safe upsert로 변경했다. 동시에 시작된 요청은 같은 작업 row를 로드한 뒤 lease 경쟁으로 직렬화된다.

## Regression tests

`npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/projectIssue/__test__/updateProjectIdFieldScope.test.js src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js src/resolver/projectSubscription/__test__/SubscriptionSweeper.test.js src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js src/resolver/gantt/__test__/GanttScheduleUpdate.test.js`

- 6 suites, 38 tests passed.
- Saga coverage: inaccessible snapshot retry has zero SQL writes; transient unlink follows `FAILED → PENDING → DONE`; lease contention; completed work-row removal; SQL-step transient failure retry.
