# Backend 구현 보고

## 구현 범위

- `v023_cleanup_orphan_project_team_rows` migration을 추가했습니다. `project_team`에서 parent `project`가 없는 행만 TiDB 호환 `DELETE ... LEFT JOIN`으로 제거하며, 대상이 없어도 멱등적으로 성공합니다.
- `computeProjectBreakdown()`은 `findProjectNames()`가 반환한 현재 project ID 집합에 있는 행만 `projects[]`로 귀속합니다. 이름이 빈 문자열이어도 ID가 현재 project이면 유지하고, ID가 없거나 `null`인 행은 `unassignedBytes`에 남깁니다.
- 기존 `getProjectTeams`는 team index에 없는 `teamKey`를 `name: null`로 반환하고, `setProjectTeams`는 fresh index 검증 뒤 stale row를 마지막에 제거하는 동작을 확인했습니다.
- 기존 프로젝트/팀 삭제 경로는 `project_team` cleanup 결과가 `null`이면 각각 설계된 호환/차단 규칙을 따릅니다. 회귀 테스트를 보강했습니다.

## 응답 계약

- 새 resolver는 없습니다.
- `getProjectTeams`: `{ content: { teams: [{ teamKey, name: string|null, isPrimary, memberCount, assignedMemberCount }], assignmentReady: boolean } }`
- `getStorageUsage`: 기존 `StorageUsage` shape 유지. 현재 project가 아닌 breakdown 행은 `projects[]`에 포함하지 않고 `unassignedBytes`로 산정합니다.

## 검증

```text
npm test -- --runInBand --runTestsByPath src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/backoffice/team/__test__/TeamService.test.js src/resolver/storage/__test__/StorageService.test.js src/resolver/projectTeam/__test__/ProjectTeamService.test.js

Test Suites: 4 passed, 4 total
Tests:       95 passed, 95 total
```
