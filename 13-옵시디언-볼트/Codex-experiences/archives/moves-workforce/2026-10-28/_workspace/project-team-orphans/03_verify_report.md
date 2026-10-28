# project_team orphan 정합성 검증 보고서

## 결과

**통과**. 이번 범위에서 resolver 응답 계약이나 기존 cascade와 충돌하는 불일치는 발견되지 않았습니다.

## 통과

### 1. v023 migration 대상과 멱등성

- 생산자: `src/rdb/schema/ddl/projectTeam.sql.js:22`의 `DELETE_ORPHAN_PROJECT_TEAM_ROWS`는 `project_team pt`를 기준으로 `project p`에 `LEFT JOIN`하고 `p.project_id IS NULL`만 삭제합니다. 따라서 parent가 존재하는 행이나 KVS team master 부재 행은 삭제하지 않습니다.
- 등록: `src/rdb/schema/ddl/index.js:7` export와 `src/rdb/schema/migrate.js:69`의 고정 migration key `v023_cleanup_orphan_project_team_rows`가 연결돼 있습니다. v022 뒤에 enqueue되어 `project_team` 생성 migration(v014) 이후에 실행됩니다.
- 대상이 0건이어도 DML은 성공하므로 재실행 시에도 같은 조건으로 0건 삭제하는 멱등 동작입니다.

### 2. Storage attribution 경계

- 생산자: `src/resolver/storage/StorageQuery.js:23`의 `PROJECT_NAMES`는 현재 `project` 테이블의 id/name만 제공합니다.
- 소비자: `src/resolver/storage/StorageService.js:28-38`은 name truthiness가 아니라 `projectIds` membership으로 귀속 여부를 판정합니다.
  - 존재하지 않는 `project_id`와 `null`은 `projects[]`에서 제외되고, 전체 바이트에서 제외된 assigned 합계를 뺀 `unassignedBytes`로 귀속됩니다.
  - 존재하는 프로젝트의 빈 이름(`''`)은 id가 집합에 있으므로 `projects[]`에 `name: ''`로 유지됩니다.
- 회귀 테스트: `StorageService.test.js`가 두 경우 모두 검증했습니다.

### 3. 기존 project/team cascade 정합성

- 프로젝트 삭제 생산자: `src/resolver/project/ProjectDeletionService.js:106-112`은 parent `project` 삭제 전에 `deleteProjectTeamsByProjectSafe(projectId)`를 실행하고, `null`(미수행)이면 parent 삭제 및 step-done 이전에 실패 상태로 전환합니다.
- 팀 삭제 생산자: `src/resolver/backoffice/team/TeamService.js:606-608`은 KVS team master 삭제 전에 `deleteProjectTeamsByTeamSafe(teamKey)`를 await합니다. missing-table의 `null`만 기존 호환 경로로 통과하며, 일반 SQL 오류는 master 삭제 전파 차단됩니다.
- `setProjectTeamsService`는 `src/resolver/projectTeam/ProjectTeamService.js:121`에서 fresh team index 검증 후 upsert → primary 갱신 → stale delete 순서를 유지합니다. `getProjectTeamsService`는 `:73`에서 남은 unknown team을 `name: null` 행으로 보존합니다.

### 4. DTO·프론트 소비 정합성

- `getProjectTeams` 생산자 `ProjectTeamService.js:73-109`의 `{ content: { teams, assignmentReady } }`와 소비자 `static/ui/src/hooks/useProjectTeams.js:27-29`의 `res.content` unwrap이 일치합니다.
- `setProjectTeams`의 `{ content: { savedCount } }`는 기존 mutation이 그대로 받고, 같은 `projectKeys.projectTeams(projectId)` (`static/ui/src/utils/queryKey/projectKeys.js:103`)를 invalidate합니다.
- Storage DTO는 `projects[]`/`unassignedBytes` 필드가 유지되므로 프론트 계약 변경이 없습니다.

### 5. 집중 실행 검증

```text
npm test -- --runInBand --runTestsByPath \
  src/resolver/project/__test__/ProjectDeletionService.test.js \
  src/resolver/backoffice/team/__test__/TeamService.test.js \
  src/resolver/storage/__test__/StorageService.test.js \
  src/resolver/projectTeam/__test__/ProjectTeamService.test.js \
  src/resolver/projectTeam/__test__/ProjectTeamRepository.test.js

Test Suites: 5 passed, 5 total
Tests:       114 passed, 114 total
```

`StorageService`의 console.error 출력은 breakdown 실패 fallback을 의도적으로 주입하는 기존 테스트 케이스에서 발생한 것이며 테스트는 통과했습니다.

## 실패

없음.

## 미검증

- 실제 Forge SQL/TiDB 인스턴스에서 v023 DDL을 적용하는 배포 검증은 수행하지 않았습니다. 단위 테스트와 정적 SQL 검토만 완료했습니다.
- 이 작업 범위에는 프론트 변경이 없으므로 frontend build 및 Forge lint는 RFC 묶음 최종 검증 단계로 남깁니다.
