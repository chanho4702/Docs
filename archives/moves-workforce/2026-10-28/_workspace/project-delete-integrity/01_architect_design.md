# 프로젝트 삭제 무결성 설계서

## 1. 개요 / 영향 범위

### 목표와 핵심 원칙

- Jira Issue, worklog, 댓글, 첨부파일과 Jira 네이티브 필드는 절대 삭제하거나 수정하지 않는다.
- RMS 프로젝트를 삭제하기 전에, 해당 프로젝트를 가리키는 모든 `moves_RMS_projectId` 앱 필드와 `movesRms` Issue property를 해제한다.
- Forge SQL에는 트랜잭션/FK cascade를 신뢰할 수 없으므로, 삭제를 하나의 요청 안에서 "모두 성공 또는 모두 롤백"으로 가장하지 않는다. 영속된 단계 상태를 기준으로 재개하는 saga로 만든다.
- `deleteProject`의 기존 호출 계약(`{ project_id }`)은 유지한다. 같은 호출은 **완료 전 상태에 한해** 최초 실행과 재시도를 겸하며, 완료 전에는 성공 토스트/낙관적 제거를 하지 않는다. 완전 완료 후에는 deletion row를 즉시 삭제하므로 동일 project ID의 새 호출은 기존처럼 `PROJECT_NOT_FOUND`가 된다.
- 새 Queue는 사용하지 않는다. 현재 Queue consumer 누락 P1이 별도 미해결이므로, 제한된 작업량의 resolver 재호출로 진행하고 브라우저 종료 후에도 같은 호출로 재개한다.

### 영향 범위

| 영역 | 변경 대상 | 내용 |
|---|---|---|
| Backend | `project/ProjectController.js`, `ProjectService.js`, `ProjectRepository.js` | 삭제 요청을 생성/재개하는 상태 기계 및 기존 10단계 cascade의 단계 영속화 |
| Backend | 신규 `project/ProjectDeletionService.js`, `ProjectDeletionRepository.js`, `ProjectDeletionQuery.js` | 작업 lease, Jira 해제, SQL child cleanup, 상태 DTO 조립 |
| Backend | `api/jira/issue/IssueApi.js`, `IssuePropertyApi.js`, `AppFieldValueApi.js` | 앱 권한 discovery/필드 해제, 사용자 가시성 확인, Issue property DELETE helper |
| Backend | Issue를 RMS 프로젝트에 편입·변경하는 기존 경로 | 프로젝트가 `DELETING`이면 추가/재배정/속성 갱신을 fail-close (`updateProjectIdField`, subscription sweep/backfill, coworker/WBS/assigned-date 등) |
| Backend | `PermissionMap.js`, `ErrorCodes.js` | `getProjectDeletionStatus` 권한 및 삭제 상태 오류 코드 |
| DB | `project` ALTER, 신규 deletion 2 테이블, `migrate.js`, `ddl/index.js` | 삭제 중 신규 연결 차단, 단계/Issue별 재개 상태를 MySQL에 영속 |
| Frontend | `pages/project/ProjectList.jsx`, `pages/projectKanban/useKanbanMutations.js` 및 공통 삭제 UI | 삭제 중/실패 상태 표시, 완료 때만 목록 제거, 재시도 |
| Frontend | `utils/queryKey/projectKeys.js` | 삭제 상태 query key 및 프로젝트 목록/칸반 invalidation 확장 |
| i18n | `locales/kr/project.json`, `locales/en/project.json` | 삭제 진행·실패·재시도·Jira 접근 차단 문구 |

`src/index.js`에는 새 controller가 아니라 기존 `registerProjectController`에 추가한 resolver만 `CONTROLLER_REGISTRARS`의 현행 등록 경로로 노출한다. 새 resolver는 반드시 `guardedDefine`로 정의하고 PermissionMap에 먼저 선언한다.

## 2. 경계면 계약 (가장 중요)

`guardedDefine`/response wrapper 적용 후의 성공 응답을 기재한다. `success: true`는 "상태 조회/한 번의 bounded advance가 정상 처리됨"이고, **프로젝트 삭제 완료를 뜻하지 않는다**. 프론트는 반드시 `content.deletion.status === 'COMPLETED'`일 때만 완료 처리한다.

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `deleteProject` (기존, 변경) | `{ project_id: string }` | `{ success: true, content: { deletion: DeletionStatus } }` | `useProjectDeletionMutation` / `projectDeletionKeys.status(projectId)` |
| `getProjectDeletionStatus` (신규) | `{ project_id: string }` | `{ success: true, content: { deletion: DeletionStatus \| null } }` | `useProjectDeletionStatus` / `projectDeletionKeys.status(projectId)` |

```ts
type DeletionStatus = {
  projectId: string,
  status: 'PENDING' | 'DISCOVERING' | 'UNLINKING' | 'SQL_CLEANUP' |
          'FAILED' | 'BLOCKED_JIRA_ACCESS' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS',
  stage: 'LOCK' | 'DISCOVER' | 'UNLINK_ISSUES' | 'PROJECTUSERS' |
         'DASHBOARD' | 'SNAPSHOT' | 'GANTT_LINK' | 'GANTT_ISSUE' |
         'GANTT_FOLDER' | 'SKILLS' | 'TEAM' | 'SUBSCRIPTION' |
         'PROJECT' | 'CACHE' | null,
  completed: boolean,                  // status === COMPLETED only
  retryable: boolean,                  // FAILED/BLOCKED/진행 중 true, COMPLETED false
  attempt: number,
  issueCounts: {
    discovered: number,
    pending: number,
    unlinked: number,
    inaccessible: number,
    failed: number,
  },
  sqlSteps: {
    projectUsers: 'PENDING' | 'DONE', dashboard: 'PENDING' | 'DONE',
    snapshot: 'PENDING' | 'DONE', ganttLink: 'PENDING' | 'DONE',
    ganttIssue: 'PENDING' | 'DONE', ganttFolder: 'PENDING' | 'DONE',
    projectSkills: 'PENDING' | 'DONE', projectTeam: 'PENDING' | 'DONE',
    projectSubscription: 'PENDING' | 'DONE', project: 'PENDING' | 'DONE',
  },
  lastError: { code: string, stage: string } | null, // Jira body/Issue key/개인정보는 반환하지 않음
  updatedAt: string,
};
```

- `PROJECT_DELETION_IN_PROGRESS`/`PROJECT_DELETION_RETRY_REQUIRED` 같은 진행 상태는 wrapper error가 아니라 위 DTO로 반환한다. 그래야 UI가 실패 단계를 숨기지 않는다.
- 잘못된 UUID, 현재 프로젝트/삭제 기록 모두 없음, 권한 없음, deletion 상태 레코드 자체를 쓰지 못한 인프라 오류만 `success:false` error로 반환한다.
- 과거 client의 `res.success`만 확인하는 동작을 깨지 않기 위해 status DTO는 `content`에 두되, 이번 구현에서 두 삭제 UI는 `completed`를 필수 확인하도록 함께 바꾼다.

## 3. 백엔드 설계

### 3-1. 권한 및 상태 잠금

1. `deleteProject`는 `PermissionMap.deleteProject`의 현행 `W('PROJECT', 'detail')`를 유지한다. Controller를 `({ payload, principal, context }) => deleteProjectService(payload, principal, context)`로 변경한다. `detail` 검증과 서비스의 실제 project row 확인이 모두 필요하다.
2. 최초 호출은 `project.deletion_state = 'ACTIVE'`인 행만 `DELETING`으로 CAS update한다. 같은 프로젝트의 이미 존재하는 deletion record는 새 작업을 만들지 않고 재개한다.
3. `project_deletion`의 `(project_id)` PK와 `lease_token`, `lease_expires_at`을 사용한다. `UPDATE ... WHERE lease_expires_at < NOW() OR lease_token = ?`가 1행일 때만 advance한다. 다른 요청은 현재 DTO를 반환하며 병렬 cascade를 수행하지 않는다.
4. `DELETING` 프로젝트는 모든 RMS Issue 연결 write에서 차단한다. 최소 적용점은 `updateProjectIdFieldService`, subscription의 즉시 편입과 reconcile/backfill, `updateIssueCoworkersService`, `recordIssueAssignedDateService`, Gantt property write다. 각 경로는 **현재 Issue의 기존 RMS project와 대상 RMS project 모두** `assertProjectAcceptsIssueMetadata(projectId)`로 확인한다. 이 검증이 없으면 discovery 뒤 새 Issue가 붙거나, 재배정된 Issue의 새 `movesRms` property를 삭제할 수 있다.
5. 읽기는 허용하되, `findProject`/칸반 DTO에 `deletion_state`를 포함한다. 삭제 진행 중 프로젝트는 목록에서 숨기지 않고 `DELETING` 배지와 재시도 진입점으로 보인다.

### 3-2. Jira unlink 단계

단계 순서는 반드시 **discovery 완료 → Issue별 property 삭제 → field 해제 → 재-discovery → SQL cleanup**이다. field를 먼저 비우면 retry 시 property의 소속을 안전하게 검증할 수 없다.

1. **Discovery (asApp, 플랫폼 예외)**
   - 신규 `listProjectDeletionIssuesAsApp(projectId, nextPageToken)`은 `moves_RMS_projectId = "{uuid}"` JQL로 100개씩 끝까지 검색해 `issue.id`, `issue.key`, Jira project key만 저장한다.
   - app-managed/readOnly custom field의 bulk value API는 `asApp()`만 가능하므로 이 조회/field write는 문서화된 플랫폼 예외다. discovery 결과의 Issue key/summary는 resolver 응답이나 로그에 내보내지 않는다.
   - 모든 페이지를 `project_deletion_issue`에 UPSERT한 후에만 `UNLINKING`으로 전환한다. 페이지 중 실패하면 `FAILED/DISCOVER`로 남아 SQL cleanup을 시작하지 않는다.
2. **사용자 가시성 재확인 (asUser)**
   - 최대 50개 `PENDING` Issue마다 `asUser()` JQL로 `(id IN ...) AND moves_RMS_projectId = "{projectId}"`를 확인한다.
   - JQL에 없는 snapshot Issue는 `BLOCKED_INACCESSIBLE`로 기록한다. 사용자에게 Issue key는 노출하지 않고 개수만 보여 준다. 이미 다른 값으로 이동해 JQL에 없는 것이 명백하면 `SKIPPED_NOT_LINKED`로 완료 처리하되, 새 소속의 property는 절대 건드리지 않는다.
3. **해제 (asApp, 사용자 검증 직후에만)**
   - 현재도 target project인 각 Issue에 대해 `DELETE /rest/api/3/issue/{id}/properties/movesRms`를 먼저 호출한다. 404는 이미 해제된 멱등 성공이다. 새 `deleteIssueProperty` helper는 4xx/5xx를 `ForgeAPIError`로 전파한다.
   - property DELETE 성공 후 `setAppFieldValueForIssues(..., value: '')`로 `moves_RMS_projectId`를 해제한다. 기존 `deleteProjectIssueService`의 빈 문자열 해제 계약을 그대로 사용한다. `null`로 바꾸지 않는다.
   - 각 facet(`property_cleared_at`, `field_cleared_at`)을 별도 저장한다. 두 요청 사이 실패해도 다음 실행에서 property DELETE(404 성공) 후 field만 재시도된다.
   - app write 전에 asUser 가시성 및 target field 일치를 확인했으므로, 앱 권한이 Jira business Issue를 무단 변경하는 범위를 피한다. native Issue field는 어느 단계에서도 호출하지 않는다.
4. **재-discovery**
   - 모든 snapshot row가 해결된 뒤 asApp JQL을 한 번 더 전량 수행한다. 0건일 때만 SQL cleanup으로 간다. 이 확인이 없으면 이전 실행 중 늦게 도착한 subscription/재시도 write가 orphan으로 남을 수 있다.
   - `BLOCKED_INACCESSIBLE` 또는 `FAILED`가 하나라도 있으면 `BLOCKED_JIRA_ACCESS` 또는 `FAILED`에서 멈춘다. parent project와 SQL children을 지우지 않는다.

Issue 처리 예산은 resolver 1회에 최대 50건(필드 bulk 내부 batch 50)으로 고정한다. 작업량이 남으면 `status='UNLINKING', retryable:true`를 반환한다. frontend는 짧은 polling/재호출로 계속 진행하되, 탭 종료 후에는 다음 `deleteProject`가 같은 작업을 재개한다.

### 3-3. SQL cascade 및 cache 단계

Jira 재확인 완료 뒤 아래를 순서대로 실행한다. 각 query는 `WHERE project_id = UUID_TO_BIN(?)`의 멱등 DELETE를 유지하고, 성공한 뒤에만 `project_deletion.current_stage`/각 SQL step을 `DONE`으로 저장한다. 0 rows도 이미 처리된 정상 성공이다.

1. `projectusers`
2. `project_dashboard`
3. `portfolio_project_snapshot`
4. `gantt_folder_link`
5. `gantt_folder_issue`
6. `gantt_folder`
7. `project_skills`
8. `project_team` (`deleteProjectTeamsByProjectSafe`가 `null`을 반환하는 "테이블 미준비"는 성공으로 위장하지 말고 `FAILED/TEAM`으로 기록)
9. `project_subscription` (`deleteSubscriptionsByProjectSafe`도 동일)
10. `project` parent DELETE. rowsAffected=0은 이 workflow의 완료 전 상태에서는 `PROJECT_NOT_FOUND` 실패다. 정상 parent DELETE 뒤에는 상태 record도 제거되므로, 완료 뒤의 별도 재호출을 "완료 이력"으로 응답하지 않는다.
11. `ProjectProgress:{projectId}`, `ProjectCost:{projectId}` KVS delete.

KVS delete 실패는 SQL/Jira 데이터를 되돌릴 수 없으므로 `COMPLETED_WITH_WARNINGS/CACHE` 상태 record를 유지한다. UI는 성공 토스트 대신 "삭제는 완료되었으나 캐시 정리가 재시도 필요"를 표시하고, 같은 `deleteProject`는 cache 단계만 재시도한다. cache 재시도까지 성공하면 deletion record와 issue work row를 즉시 삭제한다. TTL로 회복될 수 있다는 이유로 조용히 성공 처리하지 않는다.

### 3-4. Repository / API 분해

- `ProjectDeletionRepository`
  - `startOrLoadDeletion(projectId, requestedBy)`; `claimDeletionLease`; `releaseLease`
  - `markProjectDeleting`; `findDeletionStatus`; `markStageDone`; `recordFailure`
  - `upsertDiscoveredIssues`; `findPendingDeletionIssues(limit)`; `markIssuePropertyCleared`; `markIssueFieldCleared`; `markIssueBlocked`; `countIssueStates`
  - `assertProjectAcceptsIssueMetadata(projectId)`는 ordinary Issue mutation에서 재사용할 read helper다.
- `ProjectDeletionService`
  - `advanceProjectDeletion({ projectId, principal, accountId })`: 위 상태 기계의 유일한 orchestration entry.
  - `unlinkDeletionIssueBatch`: Jira access 검증과 facet별 멱등 처리.
  - `runSqlCleanupStep`: 한 단계 단위로 결과/예외를 상태화.
- Jira adapter
  - `IssueApi.listProjectDeletionIssuesAsApp`은 삭제 workflow 외에 export하지 않는다.
  - `IssueApi.findAccessibleProjectDeletionIssueIdsAsUser`는 Issue key 대신 id Set만 반환한다.
  - `IssuePropertyApi.deleteIssueProperty(issueId, 'app')`; 404 idempotent success.
  - `AppFieldValueApi.clearProjectIdForIssueIds`는 value를 호출부가 임의로 조립하지 않도록 전용 wrapper로 제공한다.

### 3-5. 오류 코드

추가: `PROJECT_DELETION_NOT_FOUND`, `PROJECT_DELETION_IN_PROGRESS`, `PROJECT_DELETION_RETRY_REQUIRED`, `PROJECT_DELETION_JIRA_ACCESS_BLOCKED`, `PROJECT_DELETION_UNLINK_FAILED`, `PROJECT_DELETION_SQL_STEP_FAILED`, `PROJECT_DELETION_CACHE_CLEANUP_FAILED`, `PROJECT_DELETING`.

`lastError`에는 코드와 stage만 넣고 Jira API body, Issue key, accountId는 저장/응답/console에 노출하지 않는다.

## 4. 프론트엔드 설계

### 컴포넌트와 상태

- `ProjectList`의 기존 ConfirmModal은 "Jira Issue는 남고 RMS 연결 정보만 해제된다"는 설명과 처리 중 상태를 표시한다. 확인 후 `useProjectDeletionMutation`을 호출한다.
- 신규 공용 `ProjectDeletionStatusModal` 또는 기존 ConfirmModal 확장:
  - `PENDING/DISCOVERING/UNLINKING/SQL_CLEANUP`: 단계명, aggregate count, spinner, 취소는 UI만 닫기(서버 작업은 남음).
  - `FAILED/BLOCKED_JIRA_ACCESS/COMPLETED_WITH_WARNINGS`: 실패 이유(민감 Issue 식별자 없음), `재시도` 버튼.
  - `COMPLETED`: 완료 toast, modal close, 그때 `invalidateProjectViews` 및 project detail 관련 prefix를 무효화.
- `ProjectList` 행과 KanbanCard는 `deletion_state==='DELETING'`을 배지로 보여 주고 일반 편집/새 삭제 confirm을 막는다. 삭제 버튼은 "삭제 재개"로 바꾼다.
- `useKanbanMutations.deleteCardMutation`의 기존 optimistic card 제거를 제거한다. `COMPLETED`일 때만 invalidation으로 자연스럽게 사라지며, incomplete/failed면 기존 card를 유지한다.
- `projectDeletionKeys = { status: projectId => ['projectDeletion', projectId] }`를 `projectKeys.js`에 추가한다. 완료/상태 변경 시 `projects`, `kanban`, `projectSummary`, 해당 `projectDeletion`을 함께 invalidate한다.

### UI 규칙

- 상태 poll은 `retryable && !isPending`일 때만 2~3초 간격으로 `getProjectDeletionStatus`를 조회하며, automatic advance는 최대 한 번씩 순차 호출한다. 429/bridge 오류 시 자동 무한 재시도하지 않고 재시도 버튼으로 전환한다.
- `res.success === true`여도 `deletion.completed !== true`면 성공 toast, route 이동, cache optimistic 제거를 하지 않는다.
- `BLOCKED_JIRA_ACCESS`에는 "연결된 Jira Issue를 볼 권한이 있는 프로젝트 관리자에게 재시도를 요청"한다고 안내한다. Issue key/제목은 보여 주지 않는다.

## 5. DB 설계

### `project` 상태 컬럼

신규 idempotent migration `v020_alter_project_add_deletion_state`:

```sql
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS deletion_state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS deletion_started_at TIMESTAMP NULL;
```

- 유효 값은 서비스가 `ACTIVE | DELETING`으로 제한한다.
- 상태 컬럼은 Issue 편입 write를 차단하는 빠른 단일 원천이다. deletion row만으로는 ordinary write 경로에서 불필요한 join/해석 오류가 생긴다.

### `project_deletion`

신규 `v021_create_project_deletion_table` (project FK를 걸지 않는다. parent 삭제 전의 in-progress/failed/blocked 상태와 parent 삭제 뒤 `COMPLETED_WITH_WARNINGS` cache 재시도를 유지해야 한다).

```sql
CREATE TABLE IF NOT EXISTS project_deletion (
  project_id BINARY(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  current_stage VARCHAR(32) NULL,
  requested_by VARCHAR(100) NOT NULL,
  attempt INT NOT NULL DEFAULT 0,
  lease_token VARCHAR(64) NULL,
  lease_expires_at TIMESTAMP NULL,
  last_error_code VARCHAR(80) NULL,
  last_error_stage VARCHAR(32) NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  INDEX (status), INDEX (lease_expires_at)
);
```

SQL child-step 완료 여부는 `steps_json JSON NOT NULL`로 저장한다. 단계 수가 고정이고 조회도 operation 단위 1건뿐이므로 별도 step table보다 JSON이 적합하다.

### `project_deletion_issue`

신규 `v022_create_project_deletion_issue_table`:

```sql
CREATE TABLE IF NOT EXISTS project_deletion_issue (
  project_id BINARY(16) NOT NULL,
  issue_id VARCHAR(32) NOT NULL,
  issue_state VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  property_cleared_at TIMESTAMP NULL,
  field_cleared_at TIMESTAMP NULL,
  last_error_code VARCHAR(80) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, issue_id),
  INDEX (project_id, issue_state)
);
```

- Issue key, summary, Jira API error body는 DB에 저장하지 않는다. retry에는 immutable numeric issue ID만 필요하다.
- `COMPLETED`가 되면 `project_deletion_issue`를 먼저, `project_deletion`을 마지막으로 즉시 삭제한다. 따라서 이 테이블들은 감사 이력이나 완료 내역 저장소가 아니다.
- KVS를 operation 상태 저장소로 쓰지 않는다. Custom Entity의 eventual consistency/100건 제약은 삭제 재개 상태에 부적합하다.
- `ddl/index.js` export와 `migrate.js` enqueue 이름은 배포 후 변경하지 않는다.

## 6. i18n 키 목록

`locales/kr/project.json`, `locales/en/project.json`에 추가하고 `npm run merge`로 생성한다. `ko-KR.json`/`en-US.json`은 직접 수정하지 않는다.

| 키 | 한국어 | English |
|---|---|---|
| `project.delete.confirm.metadataNotice` | Jira 이슈는 삭제되지 않으며, Moves RMS 연결 정보만 해제됩니다. | Jira issues are preserved; only Moves RMS associations are removed. |
| `project.delete.progress.title` | 프로젝트 삭제 진행 | Project deletion in progress |
| `project.delete.progress.discovering` | 연결된 Jira 이슈를 확인하고 있습니다. | Checking linked Jira issues. |
| `project.delete.progress.unlinking` | Moves RMS 연결 정보를 해제하고 있습니다. | Removing Moves RMS associations. |
| `project.delete.progress.sqlCleanup` | 프로젝트 데이터를 정리하고 있습니다. | Cleaning up project data. |
| `project.delete.progress.retry` | 삭제 재시도 | Retry deletion |
| `project.delete.progress.blockedJiraAccess` | 연결된 Jira 이슈에 접근할 수 없어 삭제를 완료하지 못했습니다. 이슈를 볼 수 있는 관리자에게 재시도를 요청하세요. | Deletion cannot finish because linked Jira issues are not accessible. Ask an administrator who can view those issues to retry. |
| `project.delete.progress.failed` | 삭제가 완료되지 않았습니다. 진행 상태를 보존했으므로 다시 시도할 수 있습니다. | Deletion did not complete. Progress was saved and can be retried. |
| `project.delete.progress.cacheWarning` | 프로젝트는 삭제되었지만 캐시 정리가 완료되지 않았습니다. 다시 시도하세요. | The project was deleted, but cache cleanup did not complete. Retry it. |
| `project.delete.toast.completed` | 프로젝트와 Moves RMS 연결 정보가 삭제되었습니다. Jira 이슈는 유지됩니다. | The project and its Moves RMS associations were removed. Jira issues were preserved. |

## 7. 구현 작업 분해

### Backend

- [ ] `v020~v022` DDL, `ddl/index.js`, `migrate.js` 등록 및 migration 이름 고정
- [ ] Project list/kanban query에 `deletion_state` projection 추가
- [ ] `ProjectDeletionQuery/Repository/Service`와 CAS lease 구현
- [ ] 기존 `deleteProjectService`를 `advanceProjectDeletion` 위임 구조로 교체; 기존 child DELETE를 step helper로 재사용
- [ ] `getProjectDeletionStatus` controller/PermissionMap/`src/index.js` registrar 경로 등록
- [ ] asApp discovery + asUser batch verification + property DELETE + field clear adapter 구현
- [ ] existing Issue attachment/property write 전부에 `assertProjectAcceptsIssueMetadata` 적용
- [ ] `ErrorCodes`, response DTO mapper, 민감 정보 비노출 검토
- [ ] ProjectProgress/ProjectCost cache 실패 상태화

### Frontend

- [ ] `projectDeletionKeys`, `useProjectDeletionStatus`, `useProjectDeletionMutation` 작성
- [ ] Project list 삭제 confirm/status/retry UI 및 `deletion_state` 배지
- [ ] Kanban delete optimistic 제거와 재개 상태 UI
- [ ] 완료시에만 project/list/kanban/summary/detail cache invalidation 및 toast
- [ ] kr/en locale source 추가 후 merge

### 테스트 매트릭스

- [ ] 정상: 0 Issue, 1 Issue, 101 Issue(페이지/50건 batch 경계); property와 field 모두 해제 후 모든 SQL child 및 parent 제거
- [ ] Jira property 실패: field는 아직 유지, `FAILED`, 재시도 후 property/field 각각 한 번만 최종 완료
- [ ] Jira field 실패: property DELETE 404를 멱등 성공 처리하고 field 재시도
- [ ] asUser inaccessible Issue: Issue 식별자 미노출, SQL cleanup/parent delete 미실행, 접근 가능한 권한자로 retry 시 완료
- [ ] discovery 중 Jira 실패: child SQL 삭제 전 중단, retry가 discovery 재개
- [ ] 각 SQL child 단계 강제 실패: 이전 단계 DONE/현재 FAILED, 재시도 시 DONE 단계 재실행 없이 다음 단계부터 진행
- [ ] `project_team`/`project_subscription` 테이블 미준비 safe helper `null`: 성공 위장 없이 실패/재시도 상태
- [ ] 동시 delete 호출: 하나만 lease 획득, 다른 호출은 같은 상태 반환; 중복 child delete/Jira write 없음
- [ ] deleting 중 updateProjectIdField, subscription, coworker/WBS/assigned-date write: fail-close; 다른 ACTIVE 프로젝트 작업은 정상
- [ ] field가 다른 RMS project로 변경된 snapshot Issue: 새 프로젝트 property/field를 절대 삭제하지 않음
- [ ] cache delete 실패: parent 삭제는 완료되지만 `COMPLETED_WITH_WARNINGS`, retry cache-only; 성공 시 deletion/issue work row 즉시 삭제
- [ ] Controller/PermissionMap/response shape contract test; ProjectList와 Kanban이 `success:true + completed:false`에서 성공 UI를 표시하지 않는 test

## 8. 확정이 필요한 제품 결정

요구사항의 "Jira Issue는 보존" 정책은 그대로 확정했다. 다음은 구현 전에 제품 책임자가 승인해야 할 경계다.

1. **권장안: Jira 접근 불가 Issue가 하나라도 있으면 parent project 삭제를 막는다.** 앱이 asApp으로 모든 연결 Issue를 발견한 뒤, 삭제 요청자에게 asUser browse가 없는 Issue는 count만 표시하고 `BLOCKED_JIRA_ACCESS`로 멈춘다. 이 방식만 "삭제된 project UUID가 Jira에 남지 않는다"를 보장하면서 앱 권한의 무단 데이터 변경을 피한다. 반대안(asApp으로 무조건 해제)은 project 관리자에게 보이지 않는 Jira Issue의 app metadata를 변경하므로 권한 경계를 넓힌다.
2. **`COMPLETED_WITH_WARNINGS`의 운영 처리.** cache 삭제 실패는 데이터 orphan이 아니지만 완전 성공으로 표시하지 않는다. 자동 TTL 회복만 허용할지, UI 재시도를 제공할지 결정이 필요하다. 본 설계는 재시도 성공 즉시 상태 row를 삭제하는 후자를 권장한다.

완료 deletion audit/history 보존은 제품 결정으로 **하지 않는다**. `COMPLETED`와 cache 재시도까지 끝난 `COMPLETED_WITH_WARNINGS`는 operation/Issue work row를 즉시 제거하며, 별도 cleanup job이나 관리자 이력 화면을 만들지 않는다.
