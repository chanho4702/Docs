---
name: project-deletion-background
description: "프로젝트 삭제 백그라운드화(RFC-217 커밋 7e62730 develop, 배포·E2E 전) — 준비(발견+asUser 판정)는 resolver, 연결 해제·SQL 정리는 큐 컨슈머 이어달리기, 시간별 스윕 복구"
metadata:
  node_type: memory
  type: project
  originSessionId: 94e0bdc2-1d78-4fdf-9e21-cb393f43d646
  modified: 2026-10-06T14:40:40.949Z
---

연결 작업이 많으면 삭제가 실패/장시간이던 문제(429 재시도 없음 + 이슈당 Jira 5~7회 직렬)를 2026-10-06 재구성. **RFC-217 커밋 7e62730(develop 직접, 2026-10-07), 푸시·배포·E2E 전.** 산출물 `_workspace/project-deletion-background/`.

- 준비 단계(`deleteProject` resolver, 사용자 컨텍스트): 발견 → 요청자 asUser 접근 판정(행 `UNVERIFIED`→PENDING/BLOCKED/DONE). 차단 1건이면 **쓰기 전에** BLOCKED. 판정자는 `steps_json.verifiedBy` 로 고정 — 요청자가 바뀌면 전부 재판정(두 사람 판정 합산 우회 방지).
- 실행 단계: 큐 `project-deletion-queue` 컨슈머 `ProjectDeletionWorker` (회차 480초, lease 600초, `queueSeq` CAS로 사슬 1개 보장, 429/5xx는 `deletionJiraRetry` 후 60초 지연 재투입, 진전 없는 10회면 FAILED).
- 효율: 상태 확인 JQL 일괄(reconcileIssues ≤50, 팀 관리형은 GET에 앱 필드 없음), 프로퍼티 DELETE p-limit 5, 필드 비우기 50건 PUT.
- 복구: 프론트 5초 폴링 12회마다 kick + scheduledTrigger `project-deletion-sweep`(시간별).
- 배포 후 확인할 것: 앱 필드 다건 PUT 부분 실패 동작, 큐 delayInSeconds 실동작. Codex 지적 중 "429 대기 중 재연결 이슈 덮어쓰기"는 보류.

**Why:** 사용자 지시 "백그라운드에서 돌게 하고 효율적으로".
**How to apply:** 삭제 관련 수정 시 asUser 판정은 resolver 단계에만 있다는 점(컨슈머엔 사용자 컨텍스트 없음)을 유지할 것. 관련: [[project-forge-sql-no-fk-cascade]] [[feedback-no-asapp]]
