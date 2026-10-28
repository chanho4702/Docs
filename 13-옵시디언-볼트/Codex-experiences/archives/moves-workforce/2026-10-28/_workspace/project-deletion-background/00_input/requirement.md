# 프로젝트 삭제 백그라운드화 + Jira 호출 효율화 (2026-10-06)

## 사용자 요청
"연결한 작업이 많을 때 프로젝트 삭제 문제 발생" → 원인 분석 후 사용자 지시: **백그라운드에서 돌게 하고 효율적으로**.

## 현행 구조 (src/resolver/project/ProjectDeletionService.js)
- resolver `deleteProject` 1회 = 15초 예산(WORK_BUDGET_MS). 단계: DISCOVER(asApp JQL 100건 페이지) → UNLINK(50건 배치) → SQL cleanup(10단계) → CACHE(KVS) → COMPLETED.
- 체크포인트: `project_deletion`(status/steps_json/lease 55s) + `project_deletion_issue`(issue_state PENDING/DONE/FAILED/BLOCKED_INACCESSIBLE, property_cleared_at, field_cleared_at).
- 프론트(`pages/project/ProjectList.jsx:142`, `pages/projectKanban/useKanbanMutations.js`)가 2.5초마다 `deleteProject` 재호출해 이어간다. 모달(`ProjectDeletionStatusModal`)은 진행 중 닫기 불가. 페이지 이탈 시 진행 중단 → 프로젝트 `deletion_state=DELETING` 잔류.

## 확인된 원인
1. **재시도 없음**: `RequestJiaJson.js`·`IssuePropertyApi.deleteIssueProperty`·`AppFieldValueApi` 모두 429/5xx 즉시 throw → `unlinkOneBatch` 가 해당 이슈 FAILED + throw → 상태 FAILED → 프론트 자동 진행 중단. 작업 많을수록 429 확률 증가.
2. **이슈당 직렬 호출 과다**: probe(GET 이슈, 팀 관리형은 앱 필드 생략 → reconcile JQL 추가) → `movesRms` DELETE → `movesRmsLink` DELETE → probe 재확인 → `setAppFieldValueForIssues` 를 **1건씩**. 이슈당 Jira 5~7회 → 15초에 6~10건. 1,000건이면 100회+ 왕복, 20~30분, 화면 유지 필수.
3. BLOCKED 1건이면 전체 BLOCKED_JIRA_ACCESS (의도된 장벽 — 유지).
4. 15초 예산이 호출 사이에서만 검사 → 느린 Jira 에서 resolver 25초 초과 가능.

## 요구사항
- 무거운 unlink·SQL 정리를 **@forge/events 큐 컨슈머(timeoutSeconds 600)** 에서 이어달리기로 처리. 사용자가 화면을 닫아도 끝까지 진행.
- Jira 호출 효율화: 필드 비우기 일괄(앱 필드 API 는 issueIds 다건 지원, APP_FIELD_BATCH_SIZE=50), 상태 확인 일괄(bulkfetch 또는 JQL 배치, reconcileIssues ≤50), 프로퍼티 DELETE 제한 병렬(p-limit), 429/5xx 는 Retry-After 존중한 재시도 후에도 실패하면 **치명 실패가 아닌 "다음 회차 재시도"**로.
- 프론트: 삭제 요청 후 모달을 닫을 수 있게(백그라운드 진행 안내), 진행 상태는 `getProjectDeletionStatus` 폴링. 목록/칸반에서 삭제 중 프로젝트 표시·재시도 진입 경로 확인.

## 제약 (반드시 지킬 것)
- **사용자 접근 장벽 유지**: 현재 `findAccessibleProjectDeletionIssueIdsAsUser`(asUser) 로 "삭제 요청자가 볼 수 없는 이슈는 건드리지 않는다(BLOCKED)". 큐 컨슈머에는 사용자 컨텍스트가 없다 → asUser 판정은 resolver(사용자 호출) 단계에서 끝내고 결과를 DB 에 기록, 컨슈머는 asApp 쓰기만 한다는 방향을 우선 검토. asApp 은 기존 예외 경로(아키텍처 문서 열거) 범위 안이어야 한다.
- 이어달리기 선례: `IssueLinkBackfillService.enqueueBackfillContinuation` + `queue/consumer.backfillIssueLinks`(예산 소진 시 같은 큐에 커서 담아 재투입), `QueueKeys.js`. 큐/컨슈머 추가는 manifest `consumer` + `function` 등록.
- 멱등·재개: 기존 lease(`claimDeletionLease`)·체크포인트 재사용. 큐 중복 전달·동시 resolver 호출과 경합 없게.
- 라이선스 INACTIVE 면 컨슈머 진행 중단(`isLicenseBlocked` 선례).
- Forge SQL: LIMIT 바인딩 불가, SELECT 안 서브쿼리 거부(메모리), 트랜잭션 없음.
- 과잉 구현 금지(사용자 피드백): 주석·테스트·부가 UI 부풀리지 말 것. 기존 상태 enum·DTO 계약은 가능한 유지.
- 기존 테스트: `src/resolver/project/__test__/ProjectDeletion*.test.js` 갱신.
- 이전 하드닝 설계 참고: `_workspace/project-deletion-hardening/01_architect_design.md`.
