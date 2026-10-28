# Dashboard deletion failure — frontend report

## 구현

- `ProjectKanbanBoard.jsx`에 활성 삭제 단계(`PENDING`, `DISCOVERING`, `UNLINKING`, `SQL_CLEANUP`)의 continuation effect를 추가했다.
- 진행 응답(`completed: false`)은 2.5초 후 `deleteCardMutation.mutate({ projectId, taskId: `task-${projectId}` })`로 다음 batch를 요청한다.
- effect cleanup에서 timer를 해제하며, mutation pending 중에는 새 timer를 만들지 않는다.
- `FAILED`, `BLOCKED_JIRA_ACCESS`, `COMPLETED_WITH_WARNINGS`, `COMPLETED`는 자동 재시도하지 않아 기존 `ProjectDeletionStatusModal`의 수동 Retry/rollback 안내를 그대로 사용한다.

## 경계면 소비

`useKanbanMutations`가 `deleteProject`의 `{ success, content: { deletion } }` 응답에서 `deletion`을 `onCardDeletionProgress`로 전달한다. 이 컴포넌트는 그 `ProjectDeletionDto`의 `projectId`, `status`만 소비한다.

## i18n

변경 없음. 기존 삭제 진행/Retry 번역 키를 재사용한다. merge 실행 불필요.

## 검증

```powershell
Set-Location static/ui
npm test -- --runInBand src/pages/projectKanban/__test__/ProjectKanbanBoard.test.js
```

- PASS: 1 suite, 6 tests
- `UNLINKING` 2.5초 continuation payload, terminal 상태 미재시도, pending guard 및 timer cleanup을 검증했다.
