# project_team orphan 정합성 보정 설계서

## 1. 개요 / 영향 범위

`project_team`은 Forge SQL에서 FK를 강제하지 않는 `(project_id, team_key)` 연결 테이블이다. 현재 생성은 `setProjectTeamsService`의 팀 존재 검증 뒤 upsert로만 이루어지고, 삭제는 아래 두 경로에 이미 연결되어 있다.

- 프로젝트 삭제: `ProjectDeletionService.cleanupSql()`이 부모 `project` 삭제 전 `deleteProjectTeamsByProjectSafe(projectId)`를 수행한다. `null`(테이블 미준비/미수행)은 saga 실패로 전환되어 부모 삭제를 진행하지 않는다.
- 팀 삭제: `deleteTeamService()`가 KVS 팀 마스터 삭제 전 `deleteProjectTeamsByTeamSafe(teamKey)`를 수행한다. 일반 SQL 오류는 전파되어 팀 마스터 삭제를 막고, 미마이그레이션 테이블만 `null`로 허용한다.

따라서 이번 P2의 최소 변경은 기존 cascade를 재구현하지 않는다. 이미 존재할 수 있는 **삭제된 project를 가리키는 SQL orphan**을 배포 시 1회 정리하고, 조회/집계가 orphan을 정상 프로젝트처럼 표시하지 않도록 경계를 명확히 한다. KVS에만 존재하는 team 마스터와 SQL의 교차 전체 정리는 read 경로에서 수행하면 안 되므로, 별도 운영 보정으로 분리한다.

- 백엔드: `ProjectTeamQuery/Repository`, SQL migration, `StorageQuery/StorageService` 및 관련 테스트.
- 프론트: 필수 변경 없음. 기존 `getProjectTeams`의 `name: null`은 이미 "삭제된 팀 연결 잔존"을 숨기지 않고 표현한다.
- DB: `v023` SQL migration 1개(프로젝트 parent 없는 `project_team` 행만 삭제). KVS schema 변경 없음.
- i18n: 없음.

## 2. 경계면 계약 (가장 중요)

이번 보정은 새 사용자 공개 resolver를 만들지 않는다. 기존 응답 shape는 유지한다.

| resolver 함수 | 입력 파라미터 | success 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `getProjectTeams` | `{ projectId }` | `{ success: true, content: { teams: [{ teamKey, name: string\|null, isPrimary, memberCount, assignedMemberCount }], assignmentReady: boolean } }` | `useProjectTeams` / `projectKeys.projectTeams(projectId)` |
| `setProjectTeams` | `{ projectId, teamKeys, primaryTeamKey }` | `{ success: true, content: { savedCount: number } }` | `useSetProjectTeams` / 동일 키 invalidate |
| `deleteProject` | `{ project_id }` | 기존 `{ success: true, content: { deletion } }`; 실패·차단도 기존 `deletion.status/sqlSteps/lastError` DTO | `ProjectList`, Kanban의 기존 deletion polling |
| `deleteTeam` | `{ teamKey }` | 기존 `{ success: true, content: { detachedUserCount, reparentedTeamCount, removedProjectAssignCount, permissionLostCount, inheritanceChangedCount } }` | `useTeamEditModal` |
| `getStorageUsage` | 없음 | 기존 `StorageUsage`; `projects[]`에는 현재 `project` 테이블에 존재하는 프로젝트만 포함 | Storage 페이지 기존 query |

새 에러/새 권한 항목은 만들지 않는다. migration 오류는 기존 `runMigration()`의 `SqlError` 경로로 배포를 실패시킨다. 삭제 중 `project_team` cleanup 미수행은 기존 `PROJECT_DELETION_SQL_STEP_FAILED` 상태 DTO로 재시도 가능하게 남긴다.

## 3. 백엔드 설계

### 3-1. 미래 orphan 방지: 기존 경로 유지 및 회귀 고정

다음 구현은 이미 올바른 정책이므로 변경 대신 테스트로 고정한다.

1. `ProjectDeletionService.cleanupSql()`에서 `projectSkills` 다음, 부모 `project` 전 `deleteProjectTeamsByProjectSafe(projectId)`가 실행되어야 한다.
2. 반환값이 `null`이면 `markDeletionSqlStepDone('projectTeam')` 전에 throw한다. 따라서 테이블이 없거나 cleanup이 미수행된 상태에서 부모만 삭제해 orphan을 새로 만들 수 없다.
3. `deleteTeamService()`는 KVS `manager.delete(teamKey)` 전에 `deleteProjectTeamsByTeamSafe(teamKey)`를 호출한다. missing-table 이외 오류는 전파되어 team master 삭제가 일어나지 않아야 한다.
4. `setProjectTeamsService()`의 target team fresh-index 검증과 마지막 `deleteStaleProjectTeamsRepository()` 순서는 유지한다. 사용자가 프로젝트 담당 팀을 다시 저장하면 해당 프로젝트의 오래된/삭제된 team_key 행도 stale 행으로 제거된다.

### 3-2. 과거 project orphan 정리: migration v023

`src/rdb/schema/ddl/projectTeam.sql.js`에 상수 하나를 추가하고 `ddl/index.js`, `migrate.js`에 `v023_cleanup_orphan_project_team_rows`라는 **고정된 migration 이름**으로 enqueue한다.

SQL은 project parent를 기준으로만 정리한다. TiDB의 DELETE JOIN 호환 형태를 사용한다.

```sql
DELETE pt
FROM project_team pt
LEFT JOIN project p ON p.project_id = pt.project_id
WHERE p.project_id IS NULL
```

- 대상이 없어도 성공하는 멱등 DML이다.
- `project_team`이 v014에서 생성된 뒤이므로 migration 순서상 table 존재가 보장된다.
- project 삭제 saga의 `project_deletion`/`project_deletion_issue`는 진행 중 deletion의 재시도 원장이다. 이 migration에서 이 테이블들을 건드리지 않는다.
- `team_key` orphan은 SQL만으로 KVS team 존재 여부를 안전하게 판단할 수 없으므로 이 migration에서 삭제하지 않는다. KVS 부분 목록/장애를 "없는 팀"으로 오판해 정상 배정을 지우는 fail-open을 피한다.

### 3-3. 조회 및 Storage attribution

`getProjectTeams`는 현재처럼 team index에 없는 key를 `name: null`로 반환한다. 이를 빈 팀 목록으로 바꾸거나 자동 삭제하지 않는다. read resolver가 데이터를 수정하면 조회 실패/부분 KVS 결과가 삭제로 확대될 수 있다.

`getStorageUsage`의 `computeProjectBreakdown()`은 현재 이름 매핑에 없는 project id도 `projects[]`에 넣는다. 이는 project 삭제 중간 상태와 영구 SQL orphan을 정상 프로젝트처럼 보여 준다. 아래 중 하나로 최소 보정한다.

- `nameRows`에서 얻은 `project_id`만 유효 프로젝트 집합으로 본다.
- `row.project_id`가 null이거나 유효 집합에 없으면 `acc`에 넣지 않는다. 해당 바이트는 기존 `unassignedBytes`에 남는다.
- 정상 프로젝트인데 `project_name`이 비어 있는 경우도 유효하다. 존재 판정은 `name` truthiness가 아니라 `project_id` membership으로 한다.

이 정책은 `project_team`뿐 아니라 다른 project-scope child table의 과거 orphan도 Storage "프로젝트별" 목록에서 오인 표시하지 않는다. 개별 row-count SQL에 `JOIN project`를 중복 추가하지 않아 쿼리 정의를 단순하게 유지한다.

### 3-4. team_key orphan의 운영 정리 전략

현재/향후 발생은 team deletion cascade가 막는다. 과거 데이터의 전량 정리는 이번 P2의 자동 migration 범위에서 제외한다.

- 발견 신호: `getProjectTeams.content.teams[]`의 `name === null`. 이 값은 UI가 숨기지 않으며, 담당 팀 편집에서 재저장하면 stale deletion으로 해당 프로젝트 행이 정리된다.
- 일괄 복구가 필요해지면 별도 RFC로 `TEAM_MANAGEMENT write` 전용 운영 resolver를 설계한다. `loadTeamIndexFresh()`가 `truncated === false`인 경우에만 유효 teamKey 집합을 만들고, 그때만 repository bulk delete를 허용한다. `truncated` 또는 KVS 오류면 **0건 삭제 + 명시적 실패**여야 한다.
- 이 일괄 repair는 read resolver, Storage 조회, migration에 숨겨 넣지 않는다. KVS와 SQL의 비원자적 전체 정리는 권한·감사·재시도 UX가 필요한 별도 운영 mutation이다.

## 4. 프론트엔드 설계

필수 변경 없음.

- `useProjectTeams`는 기존처럼 `assignmentReady === true`만 정상으로 취급하고, `name: null`을 삭제/필터링하지 않는다.
- `ProjectTeamEditModal`에서 저장하는 기존 흐름이 stale 행 정리 경로가 된다. 새 query key, Zustand 상태, i18n 문자열을 추가하지 않는다.
- Storage 화면은 기존 `projects[]` 소비 shape를 그대로 사용한다. orphan 바이트는 프로젝트 카드가 아닌 `unassignedBytes`로 이동하므로 UI 계약 변경이 없다.

## 5. DB 설계

| 대상 | 변경 | 이유 |
|---|---|---|
| `project_team` | `v023_cleanup_orphan_project_team_rows` 1회 멱등 DELETE JOIN | FK 없는 과거 project orphan 제거 |
| `project_team` schema | 변경 없음 | PK `(project_id, team_key)` 및 `team_key` index로 충분 |
| KVS `team` | 변경 없음 | SQL migration이 KVS 존재성을 신뢰해 삭제하지 않음 |

FK/`ON DELETE CASCADE`를 새로 추가하지 않는다. Forge SQL/TiDB 환경에서 이를 강제할 수 없고, 현재 앱 레벨 삭제 saga가 재시도·상태 보고를 담당한다.

## 6. i18n 키 목록

없음. 새 UI/새 사용자 노출 문구가 없다.

## 7. 구현 작업 분해 및 테스트 계획

### backend

- [ ] `projectTeam.sql.js`에 orphan-project cleanup DDL 상수 추가.
- [ ] `ddl/index.js` export 및 `migrate.js`의 **v023 고정 이름** enqueue 추가.
- [ ] `ProjectDeletionService.test.js`: `projectTeam` cleanup이 부모 delete 전이고, `null`이면 부모 delete/step-done이 실행되지 않으며 deletion 상태가 재시도 가능하게 남는지 확인.
- [ ] `TeamService.test.js`: project_team cleanup SQL 오류 시 `manager.delete()`가 호출되지 않는지, missing-table `null`만 기존 정책대로 팀 삭제가 진행되는지 확인.
- [ ] migration/DDL 단위 테스트 또는 migration enqueue 순서 검증: v014 이후 v023, DELETE JOIN이 `project_team`과 `project`를 parent 조건으로만 연결하는지 확인.
- [ ] `StorageService.test.js`: 이름 매핑에 없는 `project_id` 행(특히 `project_team`)은 `projects[]`에 나타나지 않고 `unassignedBytes`에 남는지 확인. 이름이 빈 정상 project id는 남는지도 확인.

### frontend

- [ ] 코드 변경 없음.
- [ ] 기존 `useProjectTeams`/담당 팀 편집 smoke test로 `name:null` 행이 클라이언트에서 조용히 제거되지 않는지만 확인.

### 검증 명령

```powershell
npm test -- --runInBand --runTestsByPath src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/backoffice/team/__test__/TeamService.test.js src/resolver/storage/__test__/StorageService.test.js
forge lint
```

변경 파일에 프론트 코드가 없으므로 이번 단위 작업에서 frontend build는 필수 게이트가 아니다. RFC 묶음 최종 통합 시에는 AGENTS.md의 전체 backend/frontend/build/lint 순서를 수행한다.
