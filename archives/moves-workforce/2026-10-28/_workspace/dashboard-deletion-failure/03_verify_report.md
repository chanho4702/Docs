# Dashboard deletion failure — 통합 검증

## 통과

### 진행 상태 DTO → Kanban continuation 경계면

- 생산자: `static/ui/src/pages/projectKanban/useKanbanMutations.js:255-260`
  - `deleteProject`의 `{ success, content: { deletion } }` 응답에서 `completed !== true`일 때 optimistic cache를 복원하고, 성공 응답의 `content.deletion`만 `onCardDeletionProgress`로 전달한다.
- 소비자: `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx:62, 72-88`
  - 콜백이 `deletionStatus`로 DTO를 보존하고, active 상태에 한해 continuation effect로 연결된다.
  - bridge 실패는 기존 mutation에서 오류 toast/rollback으로 끝나므로 continuation이 만들어지지 않는다.

### continuation 계약

- `ProjectKanbanBoard.jsx:25-35`는 `PENDING`, `DISCOVERING`, `UNLINKING`, `SQL_CLEANUP`만 active로 허용한다.
- `ProjectKanbanBoard.jsx:32-35`의 payload는 `{ projectId, taskId: \`task-${projectId}\` }`이며, 확인 모달과 수동 Retry(`:335`, `:357-360`)의 mutation input 계약과 일치한다.
- `ProjectKanbanBoard.jsx:81-88`는 mutation pending이면 타이머를 만들지 않고, effect cleanup에서 생성된 2.5초 timer를 `clearTimeout` 한다.
- `FAILED`, `BLOCKED_JIRA_ACCESS`, `COMPLETED_WITH_WARNINGS`, `COMPLETED`는 active set에 없으므로 자동 재시도하지 않는다. 기존 `ProjectDeletionStatusModal`의 수동 Retry 계약을 유지한다.

### 기존 modal/cache 계약

- `useKanbanMutations.js:255-262`: 미완료 성공 응답은 실패로 취급하지 않고 cache만 rollback한 뒤 progress callback을 호출한다.
- `ProjectKanbanBoard.jsx:354-360`: modal에는 현재 DTO와 pending 상태를 전달하며, Retry도 동일한 canonical payload를 사용한다.
- i18n, backend resolver, `useKanbanMutations`의 invalidate/rollback 로직은 변경하지 않았다.

### 정적 검사

- `git diff --check` 대상 변경에서 공백 오류가 발견되지 않았다.
- 변경 범위는 `ProjectKanbanBoard.jsx`와 전용 Jest 파일이다. README/locales/기타 작업자 변경은 본 검증 범위에서 수정하지 않았다.

## 미검증

- 명령: `Set-Location static/ui; npm test -- --runInBand src/pages/projectKanban/__test__/ProjectKanbanBoard.test.js`
- 현재 공유 실행 환경에서 Jest가 출력 없이 종료되어 exit 결과를 수집할 수 없었다. 따라서 테스트 통과는 주장하지 않는다.
- 테스트 소스는 active `UNLINKING`의 2.5초 payload, 네 terminal 상태의 자동 재시도 금지, pending guard 및 timer cleanup을 직접 다룬다.

## 실패

- 없음. 정적 경계면 교차 비교에서 계약 불일치는 발견되지 않았다.
