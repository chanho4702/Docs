# Backend 구현 보고

## 변경 범위

- `updateProject`, `updateFromKanban` 상태 변경은 현재 상태를 WHERE 절에 포함한 SQL CAS로 갱신한다.
- 상태값이 실제로 바뀌는 full update와 partial update에서 `rowsAffected !== 1`이면 `PROJECT_STATUS_CONFLICT`를 반환한다.
- 프로젝트 생성 시 `project_status_key`가 현재 상태 사전에 없으면 `STATUS_NOT_FOUND`로 거부한다.
- Kanban 상태 추가는 빈 보드의 최초 컬럼(`prev` 없음)을 서버에서 허용하고, 그 외에는 현재 graph의 terminal status만 `prev`로 허용한다. `prev.order`는 신뢰하지 않고 서버의 최대 order로 계산한다.
- 상태 삭제는 initial status의 프로젝트를 successor로 재배치하고, 프로젝트가 있는 isolated status는 `STATUS_REPLACEMENT_REQUIRED`로 거부한다. 재배치 중 CAS 충돌 또는 이후 link/status/order KVS 변경 실패 시 이전에 재배치한 project를 역방향 CAS로 복구한다. 복구 자체가 실패하면 `STATUS_PROJECT_REASSIGN_RESTORE_FAILED`를 반환한다.
- link replacement 전후 graph 유효성을 검사한다.

## Resolver 계약

기존 resolver 이름과 responseWrapper 계약은 변경하지 않았다.

- `updateProject`: 기존 SQL 결과. stale 상태면 wrapper error `PROJECT_STATUS_CONFLICT`.
- `updateFromKanban`: 기존 `undefined`. stale 상태면 wrapper error `PROJECT_STATUS_CONFLICT`.
- `addProjectStatusFromKanban`: `{id}`. stale/non-terminal `prev` 또는 빈 보드에 `prev` 전달 시 `STATUS_GRAPH_CONFLICT`.
- `deleteProjectStatus`: `{prevStatusId}`. initial 삭제 시 successor ID, isolated 및 무참조 삭제 시 `null`; 참조 isolated 상태는 `STATUS_REPLACEMENT_REQUIRED`.
- `setStatusLink`: 기존 `undefined`; graph invalidity는 기존 status graph error contract 유지.

## 검증

- `npm test -- --runInBand src/resolver/backoffice/projectStatus/__test__/ProjectStatusTransitionService.test.js src/resolver/backoffice/projectStatus/__test__/ProjectStatusLinkCompensation.test.js`
  - 2 suites, 5 tests 통과.
- `npm test -- --runInBand src/resolver/backoffice/projectStatus/__test__/ProjectStatusDeleteCompensation.test.js`
  - 1 suite, 2 tests 통과. SQL 재배정 이후 KVS 삭제 실패와 역방향 CAS 복구 실패를 각각 검증.
- `npm test -- --runInBand src/resolver/backoffice/projectStatus src/resolver/project --passWithNoTests`
  - 32 suites, 478 tests 통과.
- `git diff --check` 통과.
