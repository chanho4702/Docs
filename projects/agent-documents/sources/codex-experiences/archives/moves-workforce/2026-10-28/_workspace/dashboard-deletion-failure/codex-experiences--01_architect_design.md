# Dashboard 프로젝트 삭제 실패 처리 설계서

## 1. 개요 / 영향 범위

### 확인된 문제

프로젝트 삭제는 한 번의 `deleteProject` 호출에서 Jira 연결 이슈를 최대 50건만 unlink한다. 남은 이슈가 있으면 backend는 성공 응답 안에 `deletion.status = UNLINKING`과 `completed = false`를 반환한다.

- 프로젝트 목록(`ProjectList`)은 활성 삭제 상태를 받으면 2.5초 뒤 같은 mutation을 다시 호출하므로 다음 batch로 진행한다.
- Dashboard Kanban(`ProjectKanbanBoard`)은 같은 상태 모달을 열지만 재호출 effect가 없다. 활성 상태 모달에는 Retry 버튼도 없으므로, 50건을 초과한 프로젝트는 `UNLINKING` 표시에서 영구히 멈춘다.
- Kanban mutation은 optimistic card 제거 후 미완료 응답에서 이전 cache를 복구하는 점은 올바르다. 따라서 진행 중인 카드를 실제 삭제된 것처럼 유지하지 않는다.

### 최소 변경 범위

- Backend: API/DB/schema 변경 없음. 이미 존재하는 `deleteProject`의 재호출 가능 saga 계약을 그대로 사용한다.
- Frontend: `ProjectKanbanBoard.jsx`에 목록 화면과 동일한 활성 상태 재호출 effect를 추가한다. `useKanbanMutations.js`의 rollback/invalidate 동작은 변경하지 않는다.
- 공용 UI: `ProjectDeletionStatusModal.jsx`는 변경하지 않는다. 활성 상태는 자동 진행하고, `FAILED`/`BLOCKED_JIRA_ACCESS`/`COMPLETED_WITH_WARNINGS`만 사용자가 Retry를 누른다.
- DB/i18n: 변경 없음.

## 2. 경계면 계약 (가장 중요)

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 흐름 |
|---|---|---|---|
| `deleteProject` | `{ project_id: string }` | `{ success: true, content: { deletion: ProjectDeletionDto } }` | Kanban `deleteCardMutation`; `completed === false`이면 상태 저장 후 활성 상태에 한해 같은 mutation 재호출 |
| `getProjectDeletionStatus` | `{ project_id: string }` | `{ success: true, content: { deletion: ProjectDeletionDto } }` | 이번 최소 수정에서는 신규 호출하지 않음. 화면 재진입 복구 기능이 별도 요구될 때만 사용 |

`ProjectDeletionDto`의 이번 흐름에서 필요한 필드는 다음과 같다.

```js
{
  projectId: string,
  status: 'PENDING' | 'DISCOVERING' | 'UNLINKING' | 'SQL_CLEANUP'
        | 'FAILED' | 'BLOCKED_JIRA_ACCESS' | 'COMPLETED_WITH_WARNINGS' | 'COMPLETED',
  completed: boolean,
  retryable: boolean,
  stage: string,
  attempt: number,
  issueCounts: { discovered: number, pending: number, unlinked: number, inaccessible: number, failed: number },
  lastError: { code: string, stage: string | null } | null,
}
```

응답 원칙:

- `invoke()`의 업무 실패는 reject가 아니라 `{ success: false, error }`로 resolve될 수 있다. Kanban mutation은 이를 실패로 취급해 기존 card cache를 복구하고 오류 toast를 보여야 한다.
- `{ success: true, completed: false }`는 실패가 아니다. 카드 cache를 복구하고 진행 상태 모달을 유지한 뒤 활성 상태에서만 다음 batch를 요청한다.
- `{ success: true, completed: true }`에서만 삭제 성공 toast 및 목록/kanban invalidation 결과로 card가 사라진다.

## 3. 백엔드 설계

변경 없음.

현재 `ProjectDeletionService.deleteProjectService`는 lease, Jira 접근 불가 차단, batch unlink, SQL cleanup, cache cleanup warning 및 retry 상태를 모두 `ProjectDeletionDto`로 반환한다. Dashboard의 정지 문제는 해당 응답을 소비한 뒤 다음 batch를 요청하지 않는 frontend 제어 흐름 문제다.

구현 중 backend 계약을 바꾸지 말아야 할 사항:

- `UNLINKING`/`SQL_CLEANUP`의 `completed: false`를 error response로 바꾸지 않는다. 목록 화면의 continuation과 호환되지 않는다.
- `BLOCKED_JIRA_ACCESS`는 SQL cleanup 이전의 terminal 사용자 조치 상태로 유지한다. 접근 불가 Jira 이슈가 남은 경우 삭제를 강행하지 않는다.
- `COMPLETED_WITH_WARNINGS`는 SQL 삭제 완료 후 KVS cache cleanup만 재시도하는 상태이므로 `retryable: true`를 보존한다.

## 4. 프론트엔드 설계

### `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx`

`ProjectList.jsx`의 기존 effect와 동일한 판단을 추가한다.

1. `deletionStatus`가 없거나 `deleteCardMutation.isPending`이면 아무 작업도 하지 않는다.
2. `status`가 `PENDING`, `DISCOVERING`, `UNLINKING`, `SQL_CLEANUP` 중 하나가 아니면 타이머를 만들지 않는다.
3. 2.5초 뒤 `deleteCardMutation.mutate({ projectId: deletionStatus.projectId, taskId: \`task-${deletionStatus.projectId}\` })`를 호출한다.
4. effect cleanup에서 timer를 해제한다.
5. dependency에는 `deletionStatus`와 mutation 객체(기존 목록과 같은 패턴)를 둔다.

카드가 미완료 중 `onSuccess`에서 복구되는 현행 `useKanbanMutations` 동작을 유지한다. 따라서 재호출 대상의 `taskId`는 현재 cache 존재 여부와 무관하게 안정적으로 만들 수 있다.

### 실패/모달/Toast 흐름

| 결과 | cache | 모달 | toast / 다음 행동 |
|---|---|---|---|
| bridge 예외 또는 `{ success: false }` | optimistic 이전 상태로 복구 | 열지 않음 | 실패 toast 1회, 사용자가 다시 삭제 시도 |
| `completed: false` + 활성 상태 | 이전 상태로 복구 | spinner 상태 유지 | toast 없음, 2.5초 후 자동 재호출 |
| `FAILED` | 이전 상태로 복구 | 실패 모달 | Retry 버튼으로 동일 mutation 재시도 |
| `BLOCKED_JIRA_ACCESS` | 이전 상태로 복구 | Jira 접근 차단 모달 | 권한/이슈 접근을 해결한 뒤 Retry |
| `COMPLETED_WITH_WARNINGS` | 이전 상태로 복구(프로젝트 row는 SQL에서 이미 제거됨) | cache warning 모달 | Retry는 cache cleanup 재시도; 성공한 invalidate 후 card 소멸 |
| `completed: true` | optimistic 삭제 유지 | 열지 않음 | 성공 toast, `invalidateProjectViews(queryClient)` |

`ProjectDeletionStatusModal`은 활성 상태에 버튼이 없는 의도된 UI다. 따라서 Kanban 자동 continuation이 이 설계의 필수 조건이다. `retryable === false`를 표시하는 새 UI나 모달 닫기 정책은 이번 P1의 범위를 벗어난다.

## 5. DB 설계

변경 없음. `project.deletion_state`, `project_deletion`, `project_deletion_issue` 및 v020~v022 migration을 재사용한다.

## 6. i18n 키 목록

변경 없음. 기존 `project.delete.progress.*`, `project.delete.toast.description.*` 키를 재사용한다.

## 7. 구현 작업 분해

### Frontend

- [ ] `ProjectKanbanBoard.jsx`에 활성 삭제 상태 continuation `useEffect` 추가.
- [ ] 2.5초 timer cleanup과 pending guard를 추가해 중복 mutation을 방지.
- [ ] 기존 `ProjectDeletionStatusModal` retry callback은 terminal/retryable status 용도로 유지.
- [ ] `ProjectKanbanBoard` 또는 분리 가능한 effect helper 테스트를 추가: `UNLINKING`은 2.5초 후 동일 `{projectId, taskId}` payload로 재호출하고, `FAILED`/`BLOCKED_JIRA_ACCESS`/`COMPLETED_WITH_WARNINGS`에서는 자동 호출하지 않음을 검증.
- [ ] 기존 `useKanbanMutations` test에 미완료 성공 응답이 optimistic cache를 복원하고 progress callback을 받는 회귀 테스트가 없으면 보강.

### Backend

- [ ] 코드 변경 없음.
- [ ] 기존 `ProjectDeletionService.test.js`의 50건 이상 batch continuation 가능 상태(`UNLINKING`, `completed: false`) 반환 회귀가 충분한지 확인하고, 없으면 service test만 보강한다. API shape/상태 전이는 변경하지 않는다.

### 검증

- [ ] `static/ui`: 해당 Jest 테스트 실행.
- [ ] backend: 삭제 saga 관련 Jest 테스트 실행.
- [ ] 수동 확인: 51개 이상의 연결 이슈가 있는 프로젝트를 Kanban에서 삭제하면 card가 복원된 상태로 진행 모달이 표시되고, 두 번째 batch가 자동 호출되어 완료 후 목록/kanban에서 제거된다.
- [ ] 수동 확인: Jira 접근 불가/일시 unlink 실패는 SQL cleanup을 수행하지 않고 해당 모달의 수동 Retry로만 재시도한다.
