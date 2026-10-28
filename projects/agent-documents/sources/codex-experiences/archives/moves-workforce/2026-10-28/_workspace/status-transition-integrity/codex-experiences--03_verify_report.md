# P1-1 상태 전이 무결성 통합 재검증

검증 기준: `01_architect_design.md`, 갱신된 `02_backend_report.md`·`02_frontend_report.md`, 현재 워킹트리.

## 통과

### F1 보정 — status link replacement의 복구 경로

- 생산자: `src/resolver/backoffice/projectStatus/ProjectStatusService.js:305-358`
- `setStatusLinkService()`는 쓰기 전에 `loadStatusGraph()`/`validateReplacementEdges()`로 replacement graph를 검증한다.
- `saveStatusLink()`는 기존 link snapshot을 보관하고, 새 link 저장 중 실패하면 현재 partial link를 제거한 뒤 snapshot을 다시 저장한다(`340-350`). 정상 복구되면 원래 write error를 다시 전파한다(`358`).
- 복구 과정까지 실패하면 `ErrorCodes.STATUS_LINK_RESTORE_FAILED`(`src/utils/errors/ErrorCodes.js:23`)를 `LogicalError`로 전파하므로 responseWrapper가 명시적 실패 envelope로 직렬화한다.
- `ProjectStatusLinkCompensation.test.js`가 replacement write 실패 후 원래 graph 복구와 restore 실패 code를 모두 검증한다.

### F2 보정 — 칸반 카드 이동 실패 응답 rollback

- 생산자: `src/resolver/project/ProjectController.js:32` → `ProjectService.js:251-266`. validator의 `LogicalError`는 responseWrapper를 통해 `{success:false,error}`로 반환된다.
- 소비자: `static/ui/src/pages/projectKanban/useKanbanMutations.js:11-17,51-56`.
- `requireKanbanMoveSuccess()`가 `success !== true` envelope를 `error.cause`를 보존한 Error로 전환한다. 따라서 TanStack Query의 기존 `onError`(`91-94`)가 `ctx.prev`를 즉시 복원하고 공통 오류 toast를 표시한다.
- 성공 envelope는 원본 객체를 그대로 반환하므로 기존 `onSuccess` 및 cache invalidation 계약을 유지한다.

### 공용 transition validator·KVS·등록 계약

- `updateProject`: `ProjectController.js:26` → `ProjectService.js:167-182`.
- `updateFromKanban`: `ProjectController.js:32` → `ProjectService.js:245-267`.
- `setStatusLink`: `ProjectStatusController.js:30` → `ProjectStatusService.js:305-316`.
- 세 경로 모두 공용 validator를 사용하며, `ProjectStatusTransitionService.js:10-19`는 paged status/status_link 결과에 `assertComplete()`를 적용해 partial KVS 결과를 fail-close 한다.
- ErrorCode 선언, `CONTROLLER_REGISTRARS`, PermissionMap/guardedDefine의 등록·응답 envelope 계약도 유지된다.

## 실패

없음. 이전 F1/F2는 보정되어 재현 경로가 해소됐다.

## 미검증 / 범위 외

- 전체 backend/frontend build 및 Forge lint는 이번 집중 재검증 범위에서 실행하지 않았다.
- `insertProject`, `addProjectStatusFromKanban`, `deleteProjectStatus`의 graph 규칙 강화와 SQL compare-and-set은 P1-2 또는 후속 무결성 범위다. 특히 `src/rdb/query/ProjectQuery.js:88-93`의 `UPDATE_STATUS`에는 current-status predicate가 없어 동시 요청 TOCTOU는 아직 SQL 레벨에서 차단하지 않는다.

## 실행 결과

| 명령 | 결과 |
| --- | --- |
| `npm test -- --runInBand src/resolver/backoffice/projectStatus/__test__/ProjectStatusTransitionService.test.js src/resolver/backoffice/projectStatus/__test__/ProjectStatusLinkCompensation.test.js` | 통과: 2 suites, 5 tests |
| `Set-Location static/ui; npm test -- --runInBand src/pages/projectKanban/__test__/useKanbanMutations.test.js` | 통과: 1 suite, 2 tests |
| `npm test -- --runInBand test/permission/permissionMap.contract.test.js` | 기존 검증 통과: 1 suite, 24 tests |
