# 상태 전이 무결성 설계서

## 1. 개요 / 영향 범위

### 목표

RMS 프로젝트의 `project.project_status_key` 변경은 서버가 보관하는 `status_link(from -> to)` 그래프의 허용 간선만 통과하게 한다. 현재 React Flow의 클라이언트 검사는 직접 `invoke()` 및 일반 프로젝트 수정 경로를 막지 못하므로 보안 경계가 될 수 없다.

### 우선순위 높은 우회 경로

| 우선순위 | 현재 경로 | 현재 문제 | 설계 조치 |
|---|---|---|---|
| P1-1 | `updateProject` -> `updateProjectService` | 상세 모달에서 임의 `project_status_key`로 변경 가능 | 현재 프로젝트 상태와 목표 상태를 조회해 공용 transition validator 적용 |
| P1-1 | `updateFromKanban` -> `updateProjectPartialService` | 카드 drag/drop이 그래프 밖 상태로 이동 가능 | 위와 같은 공용 validator 적용 |
| P1-1 | `setStatusLink` -> `setStatusLinkService` | UI만 DAG/단일 in/out을 검사하고 서버는 임의 edge를 저장 | 서버에서 endpoint, self-loop, 중복, 단일 in/out, cycle, 전체 상태 포함 여부 검증 |
| P1-2 | `addProjectStatusFromKanban` | 요청의 `prev` 객체를 신뢰해 임의 상태에서 새 상태를 연결 가능 | 실제 저장된 predecessor 확인 및 tail 상태만 append 허용 |
| P1-2 | `insertProject` | 존재하지 않는 상태 key를 저장할 수 있음 | 상태 존재만 검증한다. 생성은 전이가 아니며, 칸반의 어느 컬럼에서나 카드 추가를 지원하는 현행 UX를 보존한다. |
| P1-2 | `deleteProjectStatus` | 상태 삭제에 따른 기존 프로젝트 역방향 이동은 일반 전이와 성격이 다름 | 삭제 서비스 안의 명시적 구조 복구 경로로만 유지하고, 그래프 일관성 확인 후 predecessor로 이동 |

### 범위 밖임을 명시하는 항목

Jira issue 자체의 workflow status 변경은 Jira workflow 권한과 Jira REST가 담당하며, RMS `status_link` 그래프와 같은 도메인이 아니다. Gantt task/issue의 날짜·부모·선후행 mutation도 `project_status_key`를 쓰지 않는다. 이번 수정은 RMS **프로젝트 상태** 전이에 한정하며, Jira issue status를 별도로 제어하지 않는다.

### 영향 파일

- Backend: `src/resolver/project/ProjectService.js`, `ProjectController.js`, `ProjectRepository.js`, `src/resolver/backoffice/projectStatus/ProjectStatusService.js`, `ProjectStatusController.js`, `src/utils/errors/ErrorCodes.js`.
- Backend 신규 공용 모듈(권장): `src/resolver/backoffice/projectStatus/ProjectStatusTransitionService.js` 또는 동 도메인의 `ProjectStatusGraph.js`.
- Tests: `src/resolver/backoffice/projectStatus/__test__/ProjectStatusTransitionService.test.js`, `src/resolver/project/__test__/ProjectStatusTransition.test.js`, 필요 시 controller/PermissionMap 계약 테스트.
- Frontend: 기존 `static/ui/src/pages/projectKanban/useKanbanMutations.js`, `ProjectModal.jsx`, `ProjectStatusFlow.jsx`의 invoke 계약은 유지한다. 서버 오류 code를 구분 표시하기로 결정할 때에만 해당 파일과 `locales/kr|en`을 수정한다.
- DB/KVS schema/manifest: 변경 없음. `status`, `status_link` 기존 entity와 `from` index를 사용한다.

## 2. 경계면 계약

성공 응답은 현행 `responseWrapper`를 통해 `{ success: true, ...serviceResult }`가 된다. 실패는 throw한 `LogicalError`가 `{ success: false, error: { code, message, ... } }`로 직렬화된다.

| resolver | 입력 | 성공 응답 | 검증/실패 code | 프론트 |
|---|---|---|---|---|
| `insertProject` | 현행 `{ project_name, project_status_key, start_date, end_date, total_budget }` | 현행 SQL 결과 유지 | `STATUS_NOT_FOUND` | `ProjectModal` 변경 불필요 |
| `updateProject` | 현행 `{ project_id, project_name, project_status_key, start_date, end_date, total_budget }` | 현행 SQL 결과 유지 | `STATUS_NOT_FOUND`, `STATUS_TRANSITION_NOT_ALLOWED` | `ProjectModal` 변경 불필요 |
| `updateFromKanban` | 현행 `{ project_id, project_status_key? , project_name? }` | 현행 `undefined` service 결과 유지 | `STATUS_NOT_FOUND`, `STATUS_TRANSITION_NOT_ALLOWED` | `useKanbanMutations`의 기존 rollback 유지 |
| `setStatusLink` | 현행 `{ edges: [{ source, target }] }` | 현행 빈 성공 결과 유지 | `STATUS_LINK_INVALID`, `STATUS_LINK_CYCLE`, `STATUS_LINK_BRANCHING` | `ProjectStatusFlow` 변경 불필요 |
| `addProjectStatusFromKanban` | 호환 유지 `{ name, prev: { id, order } }` (`prev.order`는 신뢰하지 않음) | 현행 `{ id }` | `STATUS_NOT_FOUND`, `STATUS_PREDECESSOR_NOT_TAIL` | `useKanbanMutations` 변경 불필요 |
| `deleteProjectStatus` | 현행 `{ id }` | 현행 `{ prevStatusId }` 또는 isolated status의 빈 결과 유지 | `STATUS_NOT_FOUND`, `STATUS_GRAPH_INVALID` | 기존 cache invalidation 유지 |

신규 ErrorCodes는 `ErrorCodes.js`에 선언한다. UI 문자열을 추가하지 않는다면 error code는 일반 실패 toast로 노출되어 현행 계약을 보존한다.

## 3. 백엔드 설계

### 3-1. 공용 graph snapshot 및 validator

`ProjectStatusTransitionService`는 `status`와 `status_link`를 `findAllPaged`/`findByFieldPaged` + `assertComplete`로 읽어 하나의 snapshot을 만든다. 호출자는 KVS 절단 상태에서 전이를 허용해서는 안 된다.

- `loadStatusGraph()` -> `{ statusById, edges, incomingById, outgoingById, graphConfigured }`.
- 모든 edge의 `from`/`to`가 `statusById`에 존재하는지 확인한다. 없으면 `STATUS_GRAPH_INVALID` fail-close.
- `validateReplacementEdges(edges, statusIds)`:
  - 배열인지, `source`/`target`이 non-empty string인지 확인.
  - source/target은 기존 status여야 하며 self-loop, 동일 edge 중복을 거부한다.
  - 각 node의 out-degree와 in-degree는 각각 최대 1이다. 이 제품의 상태 flow UI/삭제 재배선은 선형 workflow 전제이므로 branch/merge를 허용하지 않는다.
  - 전체 edge에 DFS/Kahn cycle 검사를 적용한다.
  - 그래프가 비어 있는 상태(모든 status가 isolated)는 허용한다. 일부만 연결된 isolated status도 현행 add/delete 동작 호환을 위해 허용하되, 연결된 component 내부의 구조만 위 규칙을 충족해야 한다.
- `assertAllowedProjectStatusTransition({ currentStatusId, nextStatusId, graph })`:
  - 목표 상태 존재는 필수.
  - `current === next`는 재시도/동시 클릭의 idempotent no-op로 허용한다.
  - 그래프가 비어 있으면 현행 호환을 위해 존재하는 상태 간 변경을 허용한다.
  - 그래프가 있으면 정확히 `(current, next)` edge가 있어야 한다. 역방향, skip, isolated/미존재 target은 `STATUS_TRANSITION_NOT_ALLOWED`.

### 3-2. 프로젝트 상태 mutation 단일화

- `insertProjectService`는 지정 상태의 존재만 확인한 뒤 insert한다. 신규 생성은 이전 상태가 없는 동작이며, `ProjectKanbanBoard`가 어느 column에서든 `ProjectModal(selectedStatus)`를 열 수 있는 현행 UX를 보존한다.
- `updateProjectService`는 대상 project를 먼저 읽고, 요청 status가 기존 값과 다를 때만 공용 validator를 실행한 후 `updateProjectRepository`를 호출한다.
- `updateProjectPartialService`도 같은 helper를 호출한다. `project_name`만 바꾸는 요청은 graph snapshot을 읽지 않고 기존 동작을 보존한다.
- `updateProjectPartialService`에 `actor`를 전달해 `getCurrentUserApi()` 재조회 대신 controller `context.accountId`를 사용한다. controller는 `guardedDefine(... ({ payload, context }) => ...)`로 전달한다. 내부 상태 삭제용 이동에는 resolver context가 없으므로 별도 내부 함수(`moveProjectsForDeletedStatus`)를 사용한다.
- 상태 변경 DML은 TOCTOU를 줄이기 위해 `ProjectQuery.UPDATE_STATUS`에 기존 `project_status_key` predicate를 추가하는 방안을 권장한다. rowsAffected=0이면 최신 상태를 다시 읽어 no-op인지 판단하고, 아니면 `STATUS_TRANSITION_NOT_ALLOWED`로 fail-close 한다. 이로써 검증 후 동시 이동으로 그래프를 우회하지 않는다.

### 3-3. 상태 graph 관리

- `setStatusLinkService`는 delete-before-save하지 않는다. 먼저 request edge 전체를 `validateReplacementEdges`로 검사한 다음, 기존 link와 diff를 계산해 저장한다. KVS가 transaction을 제공하지 않으므로 write 실패 시 기존 graph를 복구하는 compensation을 수행하고, compensation도 실패하면 명시적으로 error를 전파한다.
- `saveStatusOrder`는 validated graph의 topological order만 받는다. status가 snapshot에 없을 때 `existing.value`를 참조하지 않도록 validator가 선행한다.
- `addProjectStatusFromKanbanService`는 `prev.id`의 존재 및 graph snapshot을 검증한다. graph가 구성되어 있을 때 predecessor는 outgoing edge가 없는 tail이어야 한다. 순서는 client `prev.order` 대신 저장된 tail order 또는 graph topological order에서 계산한다.
- `deleteProjectStatusService`는 삭제 대상 존재를 확인한다. 연결된 status라면 validator가 보장한 단일 incoming/outgoing 구조에서만 predecessor를 구한다. 해당 status의 프로젝트를 predecessor로 옮기는 것은 **상태 사전 제거를 위한 시스템 migration**이므로 일반 forward transition validator를 적용하지 않는다. 이 내부 우회는 public resolver가 아닌 service private helper에서만 호출한다. 삭제/재배선 전 graph invalid면 `STATUS_GRAPH_INVALID`로 중단한다.

### 3-4. 권한 및 등록

- 기존 resolver 이름과 `PermissionMap` 항목을 유지하므로 registrar/권한 mapping 추가는 없다.
- `updateProject`와 `updateFromKanban`의 `guardedDefine` project scope는 그대로 사용한다. transition validator는 권한 판정 뒤의 domain integrity 계층이다.
- `demoSeed`의 `update-project`는 manifest에서 주석 처리된 demo webtrigger이므로 production mutation surface가 아니다. 재활성화할 경우에도 seed-only bypass를 명시하고 production resolver를 호출하지 않게 유지한다.

## 4. 프론트엔드 설계

서버 요청/성공 shape가 바뀌지 않으므로 필수 프론트 변경은 없다.

- `ProjectStatusFlow.jsx`의 사전 UX 검사(cycle/one incoming/one outgoing)는 유지한다. 이는 피드백용이며 서버 검증을 대체하지 않는다.
- `useKanbanMutations.js`와 `ProjectModal.jsx`는 `success:false`일 때 이미 rollback/일반 오류 처리한다.
- 제품 요구가 오류 원인을 별도로 보여주도록 확정될 때에만 `STATUS_TRANSITION_NOT_ALLOWED` 및 graph validation code에 대한 toast i18n을 `locales/kr/projectStatus.json`, `locales/en/projectStatus.json`에 추가하고 `npm run merge`를 실행한다. 이번 P1의 최소 범위에는 포함하지 않는다.

## 5. DB / KVS 설계

- 새 테이블, KVS attribute, manifest 변경 없음.
- 권장 SQL 변경: `UPDATE_STATUS`를 `WHERE project_id = UUID_TO_BIN(?) AND project_status_key <=> ?` 형태의 compare-and-set으로 변경하고 `rowsAffected` alias를 사용한다. raw mock도 `{ rows: { affectedRows } }`를 재현한다.
- `status_link`는 `from` index만 있지만 전량 snapshot에서 `to` map을 메모리로 만들면 추가 index가 필요 없다.

## 6. i18n 키 목록

필수 추가 없음. 일반 실패 UX를 유지한다.

선택적 오류 세분화 UX가 승인될 경우:

- `projectStatus.transition.notAllowed`: `허용되지 않은 상태 전이입니다.` / `This status transition is not allowed.`
- `projectStatus.transition.graphInvalid`: `상태 흐름 설정이 유효하지 않습니다.` / `The status flow configuration is invalid.`

## 7. 정확한 테스트 계획

### `ProjectStatusTransitionService.test.js`

1. valid linear graph `todo -> doing -> done` snapshot을 정상 수용한다.
2. unknown source/target, self-loop, duplicate edge, out-degree 2, in-degree 2를 각각 거부한다.
3. 2-node cycle 및 긴 cycle을 거부한다.
4. no-edge graph과 isolated status는 현행 호환 정책대로 읽힌다.
5. `todo -> doing`은 허용, `doing -> todo`, `todo -> done`, unknown target은 `STATUS_TRANSITION_NOT_ALLOWED`; same-status는 허용한다.
6. paged collection `truncated:true`는 `KVS_COLLECTION_LIMIT_EXCEEDED`로 fail-close 한다.

### `ProjectStatusService.test.js`

1. `setStatusLinkService`가 invalid request일 때 기존 link를 한 건도 지우지 않는다.
2. valid replacement는 validation 후 기존 link를 정확히 diff/교체하고 status order를 갱신한다.
3. 저장 중 실패하면 기존 graph를 compensation하며, failure는 성공으로 반환하지 않는다.
4. `addProjectStatusFromKanbanService`가 unknown/non-tail predecessor를 거부하고 tail append만 허용한다.
5. `deleteProjectStatusService`는 invalid graph에서 project migration 전에 실패하고, valid middle/tail 삭제는 predecessor 이동 및 재배선을 수행한다.

### `ProjectStatusTransition.test.js`

1. `updateProjectService`가 프로젝트 상세 수정 시 graph 밖 target을 거부하며 repository update를 호출하지 않는다.
2. `updateProjectPartialService`가 카드 이동에서 같은 validator를 사용하고 이름만 수정 시 validator를 호출하지 않는다.
3. status 존재하지 않음, same status no-op, valid forward edge를 확인한다.
4. `insertProjectService`가 unknown status를 거부하고, 존재하는 어느 상태에서든 신규 카드 생성 UX를 보존한다.
5. CAS update가 0 rows인 경쟁 상황에서 최신 상태 재확인 후 no-op만 성공, 그 외는 fail-close 한다.

### 회귀 / 통합

1. `test/permission/permissionMap.contract.test.js`: 기존 registrar와 PermissionMap key 집합이 변하지 않는지 실행한다.
2. backend: `npm test -- --runInBand`.
3. frontend: `Set-Location static/ui; npm test -- --runInBand; CI=true npm run build`.
4. app root에서 `forge lint`.
