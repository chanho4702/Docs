# Moves Workforce 구독 하위 작업·팀장 후보 누락 (2026-09-22)

## 구독 조건
복수 `issueTypeIds`는 frontend state, SQL JSON, JQL `in (...)`까지 정상 보존됐다. 누락 원인은 `includeSubtasks=true`가 별도 술어를 추가하지 않던 데 있었다. 타입 필터가 존재하면 하위 타입 ID가 whitelist 밖이라 배치 JQL과 생성 이벤트 판정에서 제외됐다.

결합 규칙을 다음과 같이 고정했다.
- 타입 필터 + 하위 포함: `(선택 타입 OR subTaskIssueTypes())`
- 타입 필터 + 하위 제외: 선택 타입만
- 타입 필터 없음 + 하위 제외: `not in subTaskIssueTypes()`

배치 스윕과 `IssueEventMatcher`가 같은 규칙을 사용해야 새 이슈와 정기 동기화 결과가 갈리지 않는다.

## 팀원 골라 담기
팀장은 SQL `users.team_key`와 KVS `team.leaderAccountId`를 합쳐 후보를 만든다. 후보 조회가 60초 캐시 팀 인덱스를 사용하고 Repository가 별도로 인덱스를 읽으면 팀장 변경 직후 누락될 수 있다.

후보 조회는 `loadTeamIndexFresh()`를 사용하고, 해당 인덱스를 `findUsersByTeamKeys(..., { teamIndex })`와 실제 일괄 추가 검증까지 전달한다. 팀 상세도 이미 읽은 fresh index를 Repository에 전달한다.

## 연결
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-skills-ux-2026-09-22|moves-workforce-project-skills-ux-2026-09-22]]
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-subscription-sync-field-authority-2026-09-22|moves-workforce-subscription-sync-field-authority-2026-09-22]]

## 독립 검토에서 확인한 경계 사례
Claude 교차 검토에서 배치 JQL과 이벤트 판정의 경계가 한 번 더 갈리는 조합을 찾았다. 하위 작업 타입을 직접 선택하고 `includeSubtasks=false`로 둔 경우 JQL은 선택 타입을 포함하지만 이벤트 매처가 모든 하위 작업을 거부했다. 타입을 명시한 경우 선택값을 우선하도록 이벤트 매처를 맞췄다.

기존 구독은 새 JQL 의미가 적용돼도 `watermark` 이전 이슈를 다시 보지 않는다. `v024_reset_subtask_subscription_watermark`가 `issue_type_ids IS NOT NULL`인 구독의 `watermark`와 `sweep_cursor`를 한 번 비우고, `baseline_at`은 유지한다. `include_subtasks=1`만 대상으로 삼으면 하위 작업 타입을 직접 선택한 `include_subtasks=0` 구독이 빠지므로 타입 필터 구독 전체가 대상이어야 한다.

팀 전체 투입에서는 후손을 포함해 먼저 조회한 뒤 `team_key`로 직속만 거르면, 상위 팀장이 하위 팀 SQL 소속 행으로 먼저 합쳐져 직속 대상에서 빠질 수 있다. 전체 모드는 실제 투입 범위의 팀 키만 Repository에 넘겨 팀장 보정 행의 `team_key`가 요청 팀으로 만들어지게 한다. 담당 팀 현황·후보·쓰기 검증은 모두 같은 fresh team index를 전달한다.
