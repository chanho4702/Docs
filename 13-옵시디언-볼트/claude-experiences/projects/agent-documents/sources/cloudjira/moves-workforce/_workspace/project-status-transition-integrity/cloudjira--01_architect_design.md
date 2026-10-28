# 프로젝트 상태 전이 정합성 및 Kanban 최소 보정 설계서

## 1. 개요 / 영향 범위

### 감사 결론과 보정 원칙

- `updateProject`와 `updateFromKanban`은 전이 그래프를 읽어 검증하지만, 실제 `UPDATE project`에는 이전 상태 조건이 없다. 두 요청이 같은 기존 상태를 읽으면 늦게 끝난 요청이 앞 요청을 무조건 덮어쓴다.
- `deleteProjectStatus`는 연결이 없는(isolated) 상태를 즉시 삭제한다. 그 상태에 배정된 프로젝트가 있으면 `project.project_status_key`가 존재하지 않는 KVS 상태를 가리킨다. Kanban의 `applyProjectListToDataSource`는 해당 카드를 조용히 버린다.
- Kanban 추가 상태는 클라이언트가 보내는 `prev` 객체를 신뢰하고, 상태 링크의 끝(tail)인지 확인하지 않는다. 동시 추가 또는 오래된 화면으로 추가하면 분기 링크를 만들 수 있다.
- Kanban은 상태가 0개일 때 첫 컬럼을 만들 수 없고, 컬럼 삭제 성공 시 항상 `prevStatusId`가 있다고 가정한다. 삭제 가능한 분리 상태의 UX가 이에 맞지 않는다.

범위는 상태 그래프·프로젝트 상태 참조·Kanban 컬럼/이동 UX만이다. 권한, 대규모 Kanban 재설계, DB 스키마/마이그레이션은 변경하지 않는다. 기존 resolver 이름과 성공 응답의 responseWrapper 외형은 유지한다.

- 백엔드: `projectStatus` 상태 그래프 쓰기와 `project` 상태 변경 CAS.
- 프론트: `projectKanban`의 첫 컬럼/상태 삭제/충돌 안내 및 낙관적 갱신 보정.
- DB: `project` 테이블 변경 없음. 조건부 UPDATE SQL 3개 추가/변경.
- KVS: `status`, `status_link` schema 변경 없음.
- i18n: 상태 재시도·대체 상태 필요·동시 변경 안내 키만 `locales/kr/projectStatus.json`, `locales/en/projectStatus.json`에 추가하고 `npm run merge` 실행.

## 2. 경계면 계약 (가장 중요)

모든 표의 성공 결과는 공통 `responseWrapper`가 감싼다. 아래 content는 service 반환값 기준이다.

| resolver 함수 | 입력 파라미터 | 성공 content | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `updateProject` | 기존 `{project_id, project_name, project_status_key, start_date, end_date, total_budget}` | 기존 SQL 결과 그대로 | `ProjectModal.saveMutation` / `invalidateProjectViews` |
| `updateFromKanban` | 기존 `{project_id, project_status_key}` 또는 `{project_id, project_name}` | 기존 `undefined` 유지 | `useKanbanMutations.cardMoveMutation` / `kanbanQueryKeys` |
| `addProjectStatusFromKanban` | 기존 `{name, prev}`. 첫 컬럼일 때만 `prev` 생략 허용 | 기존 `{id}` 유지 | `addColumnMutation` / `kanbanQueryKeys`, `statusKeys.all` |
| `deleteProjectStatus` | 기존 `{id}` | 기존 `{prevStatusId}` 유지. 삭제 상태가 graph initial이면 `prevStatusId`에 **승계 대상인 다음 상태 ID**를 넣는다. 프로젝트가 없는 isolated 상태면 `{prevStatusId: null}` | `deleteColumnMutation` / `kanbanQueryKeys`, `invalidateProjectViews`, `invalidateStatusViews` |
| `setStatusLink` | 기존 `{edges}` | 기존 `undefined` 유지 | `ProjectStatusFlow` / `statusKeys.all` |
| `getProjectStatusExistLink` | 없음 | 기존 `{rows: [{id,name,color,order}]}` 유지. `order` 없는 상태를 반환하지 않는 현행 범위 유지 | `ProjectKanbanBoard` / `kanbanQueryKeys` |

오류는 wrapper의 기존 `{success:false,error:{code,message}}` 형태를 그대로 쓴다. 신규 코드:

- `PROJECT_STATUS_CONFLICT`: 읽은 뒤 다른 요청이 상태를 바꿔 CAS가 0행. 사용자는 최신 상태를 다시 읽어야 한다.
- `STATUS_REPLACEMENT_REQUIRED`: 프로젝트가 있는 isolated 상태는 자동 승계 대상이 없어서 삭제 불가.
- `STATUS_GRAPH_CONFLICT`: Kanban 추가의 `prev`가 더 이상 현재 graph tail이 아니거나 첫 컬럼 조건이 깨진 경우.

## 3. 백엔드 설계

### 3-1. 단일 상태 그래프 판정 재사용

대상: `src/resolver/backoffice/projectStatus/ProjectStatusTransitionService.js`

- `loadStatusGraph()` 결과에 다음 순수 helper를 추가한다.
  - `getInitialStatusIds(graph)`: `incomingById`가 없는 상태 ID 목록.
  - `getTerminalStatusIds(graph)`: `outgoingById`가 없는 상태 ID 목록.
  - `assertStatusGraphMutationAllowed(...)`: 변경 전 graph와 후보 edge를 `validateReplacementEdges`로 검증한다.
- 상태 그래프의 현재 불변식(존재하지 않는 endpoint 금지, self link/중복/분기/cycle 금지)을 단일 출처로 유지한다. disconnected chain/isolated status는 기존 데이터와 호환되므로 이 작업에서 금지하지 않는다.
- `setStatusLinkService`는 링크를 저장하기 직전 후보 edges를 검증하고, 저장 직후 재조회한 그래프도 검증한다. KVS 쓰기 보상 실패는 기존 `STATUS_LINK_RESTORE_FAILED`를 유지한다.

### 3-2. 상태 추가 및 첫 Kanban 컬럼

대상: `src/resolver/backoffice/projectStatus/ProjectStatusService.js`

- `addProjectStatusService`: 저장 전 `loadStatusGraph()`으로 현 상태가 유효한지 확인한다. 새 상태는 edge가 없으므로 후보 graph도 유효함을 명시적으로 확인한다. 일반 Backoffice 추가 계약은 변경하지 않는다.
- `addProjectStatusFromKanbanService({name, prev})`:
  1. 서버에서 전체 status/graph를 새로 읽고 pagination complete를 확인한다.
  2. status가 0개면 `prev` 없이 최초 상태를 `order: 1`로 저장한다. 링크는 만들지 않는다.
  3. status가 있으면 `prev.id`가 현재 graph의 terminal이고, 해당 KVS 상태가 존재하며, 보드의 마지막 `order` 상태인지 서버 기준으로 확인한다. 아니면 `STATUS_GRAPH_CONFLICT`.
  4. 새 상태 저장 → 후보 edge(`prev.id -> newId`) 검증 → 링크 저장 순서로 수행한다. 링크 저장 실패 시 새 status를 보상 삭제한다.
  5. 저장 뒤 `loadStatusGraph()` 재검증 및 dictionary invalidation을 한다.
- `prev.order`는 신뢰하지 않는다. 서버가 계산한 마지막 order + 1을 사용한다.

### 3-3. 상태 삭제와 기존 프로젝트 승계

대상: `src/resolver/backoffice/projectStatus/ProjectStatusService.js`, `src/resolver/project/ProjectService.js`, `src/resolver/project/ProjectRepository.js`, `src/rdb/query/ProjectQuery.js`

삭제의 승계 규칙을 명확히 한다.

| 삭제 상태 위치 | 프로젝트 승계 대상 | 허용 여부 |
|---|---|---|
| middle (`incoming`+`outgoing`) | 이전 상태 (`incoming.from`) | 허용, 기존 방향 유지 |
| terminal (`incoming`만) | 이전 상태 | 허용 |
| initial (`outgoing`만) | 다음 상태 (`outgoing.to`) | 허용. 이 상태가 삭제 후 새 initial이 됨 |
| isolated | 없음 | 프로젝트가 없을 때만 허용. 프로젝트가 있으면 `STATUS_REPLACEMENT_REQUIRED` |

- 삭제 전 `loadStatusGraph()`을 사용하고 대상 status 존재 여부를 먼저 확인한다. 삭제 중 링크 endpoint가 사라지지 않도록 후보 링크(중간 삭제 시 bypass edge 포함)를 `validateReplacementEdges`로 미리 검증한다.
- `getProjectByStatusId` 결과 각각을 `updateProjectStatusIfCurrentRepository(projectId, deletedStatusId, replacementStatusId, accountId)`로 갱신한다. 반드시 `rowsAffected === 1`이어야 하며, 0이면 `PROJECT_STATUS_CONFLICT`로 실패시킨다.
- 링크/상태 KVS 변경 전에 SQL 승계를 마친다. SQL 중 일부가 성공한 뒤 충돌/실패하면, 이미 변경된 행만 반대 방향 CAS로 되돌린다. 보상도 실패하면 운영자가 조사할 수 있도록 기존 보상 실패 패턴과 같은 `LogicalError` 세부 원인을 담되 raw SQL을 프론트에 노출하지 않는다.
- SQL 승계가 끝난 뒤 링크 변경, status 삭제, order 재계산 순으로 처리한다. KVS 변경 실패 시 SQL 상태를 이전 상태로 CAS 보상한다. 모든 성공 종료 직전에 `loadStatusGraph()`로 재검증한다.
- 반환 `prevStatusId`는 UI 호환용 이름을 유지하되, initial 삭제 때에는 실제 승계 대상(다음 상태)을 반환한다. `deleteProjectStatus`의 호출자는 이를 단순 "이전"으로 해석하면 안 된다.

### 3-4. 프로젝트 상태 변경 CAS

대상: `src/rdb/query/ProjectQuery.js`, `src/resolver/project/ProjectRepository.js`, `src/resolver/project/ProjectService.js`

- `ProjectQuery.UPDATE_STATUS_IF_CURRENT`을 추가한다.
  ```sql
  UPDATE project
     SET project_status_key = ?, updated_id = ?
   WHERE project_id = UUID_TO_BIN(?)
     AND project_status_key <=> ?
     AND deletion_state = 'ACTIVE'
  ```
- 전체 수정도 상태 값이 실제로 바뀌는 경우 `ProjectQuery.UPDATE_IF_STATUS_CURRENT`를 사용한다. 이름/날짜/예산만 바꾸는 요청은 기존 `UPDATE`를 유지한다.
- `updateProjectService` 및 `updateProjectPartialService`는 다음 순서를 동일하게 쓴다: project read → graph read/전이 검증 → expected 상태를 WHERE에 넣은 conditional UPDATE → `rowsAffected !== 1`이면 `PROJECT_STATUS_CONFLICT`.
- `updateProjectPartialService`의 내부 상태 이전(상태 삭제 재배치)은 context가 없어도 서버 내부 호출임을 별도 옵션으로 명시한다. 현재의 `context` 유무로 검증을 건너뛰는 조건은 제거하고, 모든 상태 변경이 `assertAllowedProjectStatusTransition` 또는 삭제 승계 전용 검증 중 하나를 반드시 거치게 한다.
- `insertProjectService`는 초기 `project_status_key`가 `loadStatusGraph().statusById`에 존재하는지 확인한다. 새 프로젝트 생성은 전이가 아니므로 edge 방향 검증은 하지 않는다. 존재하지 않으면 `STATUS_NOT_FOUND`.

### 3-5. Resolver/Permission 등록

- 새 resolver는 없다. `ProjectStatusController.js`, `ProjectController.js`, `src/index.js`의 `CONTROLLER_REGISTRARS`, `PermissionMap.js` 변경은 불필요하다.
- 기존 `guardedDefine`와 PermissionMap 매핑을 그대로 이용한다. 외부 입력 검증을 service에 둔다.

## 4. 프론트엔드 설계

### 4-1. Kanban 컬럼 추가·표시

대상: `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx`, `static/ui/src/pages/projectKanban/useKanbanMutations.js`, `static/ui/src/pages/projectKanban/utils/buildData.js`

- `addColumn`은 보드가 비었을 때 `lastCol: null`을 보내도록 하고, optimistic column의 `statusId`도 넣는다. 서버가 첫 상태를 생성한 뒤 그대로 ID 치환한다.
- 컬럼 폭 계산은 `kanbanColCount === 0`에서 나눗셈을 하지 않도록 별도 fallback(`100%` 또는 add button 폭 제외)을 둔다.
- Kanban 상태 목록은 기존처럼 `order`가 있는 컬럼만 사용한다. 다만 project row가 존재하는데 해당 status column이 없으면 `applyProjectListToDataSource`에서 조용히 버리지 않는다. 그 상태는 서버 정합성 오류이므로 query를 실패시켜 refetch하고, 계속되면 일반 오류 toast를 표시한다. 삭제 보정 후 이 경로는 정상 데이터에서 발생하지 않아야 한다.

### 4-2. 카드 이동과 충돌 UX

대상: `static/ui/src/pages/projectKanban/useKanbanMutations.js`

- `cardMoveMutation`의 현재 optimistic move/rollback 구조는 유지한다.
- wrapper error가 `PROJECT_STATUS_CONFLICT`, `STATUS_TRANSITION_NOT_ALLOWED`, `STATUS_GRAPH_CONFLICT`이면 `ctx.prev`로 rollback한 뒤 해당 i18n toast를 표시하고 `invalidateProjectViews(queryClient)`로 즉시 최신 보드를 읽는다.
- 성공 toast는 유지한다. 순서 변경은 현재 DB 모델에 없으므로 `taskAbove/taskBelow`는 UI 표시 순서에만 쓰인다는 기존 동작을 유지한다.

### 4-3. 컬럼 삭제 UX

대상: `static/ui/src/pages/projectKanban/useKanbanMutations.js`, `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx`

- 삭제 성공 후 `res.prevStatusId`가 있을 때만 삭제 카드들을 그 target 컬럼으로 옮기는 optimistic cache 보정을 수행한다. target 컬럼이 cache에 없으면 수동 조작하지 않고 invalidate한다.
- `prevStatusId === null`인 프로젝트 없는 isolated column은 카드를 옮기지 않고 컬럼만 제거한다.
- `STATUS_REPLACEMENT_REQUIRED`는 "이 상태에 프로젝트가 있어 대체 상태가 필요" toast를 보이고 캐시 전체 refetch한다.
- `STATUS_GRAPH_CONFLICT`/`PROJECT_STATUS_CONFLICT`도 최신 상태로 refetch한다. 기존 `STATUS_MIN_REQUIRED`, `PREV_STATUS_REQUIRED` 메시지는 호환을 위해 유지하되, initial 삭제가 허용되므로 `PREV_STATUS_REQUIRED`는 더 이상 일반 initial 삭제 안내에 사용하지 않는다.
- ConfirmModal의 문구는 기존 삭제 경고를 유지한다. 승계 대상이 자동 결정되는 구조이므로 삭제 확인 전에 별도 selector UI는 만들지 않는다.

### 4-4. Backoffice 상태 Flow

대상: `static/ui/src/backoffice/page/projectStatus/modal/flow/ProjectStatusFlow.jsx`, `static/ui/src/backoffice/page/projectStatus/ProjectStatusPage.jsx`

- Flow 저장의 `setStatusLink` 실패는 기존 modal을 닫지 않고 error toast를 보여준다.
- `STATUS_GRAPH_CONFLICT`와 기존 `STATUS_LINK_BRANCHING`, `STATUS_LINK_CYCLE`, `STATUS_GRAPH_INVALID`는 `statusKeys.all`을 invalidate하여 다른 관리자의 변경을 즉시 재표시한다.
- 그래프의 initial 상태는 "incoming edge가 없는 상태"로 파생될 뿐 별도 KVS 필드를 추가하지 않는다. 따라서 초기 상태 변경은 Flow edge 편집 결과로 자연스럽게 반영된다.

## 5. DB 설계

테이블/마이그레이션 변경 없음.

`project.project_status_key`에는 FK가 없으므로 서비스 계층에서 다음을 보장한다.

1. 생성 시 status 존재 확인.
2. 일반 변경 시 graph + SQL CAS 확인.
3. 상태 삭제 시 모든 참조 project를 조건부 승계하거나 삭제 거부.
4. DML 결과는 공통 계층의 `rowsAffected`만 읽고, 테스트 mock도 `{rows:{affectedRows}, rowsAffected}`로 재현.

`deletion_state = 'ACTIVE'` predicate는 삭제 saga가 진행 중인 project를 Kanban/상태 변경에서 되살리거나 재배치하지 않게 한다.

## 6. i18n 키 목록

`locales/kr/projectStatus.json`

- `projectStatus.kanban.statusConflict`: "다른 사용자가 프로젝트 상태를 변경했습니다. 최신 상태를 다시 불러왔습니다."
- `projectStatus.kanban.graphConflict`: "상태 흐름이 변경되었습니다. 최신 보드에서 다시 시도하세요."
- `projectStatus.kanban.replacementRequired`: "이 상태에 프로젝트가 있어 대체 상태 없이 삭제할 수 없습니다."
- `projectStatus.kanban.orphanStatus`: "프로젝트 상태와 Kanban 컬럼이 일치하지 않습니다. 새로고침 후 다시 시도하세요."

`locales/en/projectStatus.json`

- 같은 키의 자연스러운 영어 문구.

생성 파일 `locales/ko-KR.json`, `locales/en-US.json`은 직접 수정하지 않고 `npm run merge`로 갱신한다.

## 7. 구현 작업 분해 및 테스트

### Backend 체크리스트

- [ ] `ProjectStatusTransitionService`에 initial/terminal 파생 helper와 후보 graph 검증을 추가한다.
- [ ] `ProjectStatusService`의 add/delete/set-link를 서버 재조회 기준으로 변경하고, Kanban 첫 컬럼·tail 검증·삭제 승계/보상을 구현한다.
- [ ] `ProjectQuery`와 `ProjectRepository`에 status CAS query/repository 함수를 추가한다.
- [ ] `ProjectService`의 insert/full/partial status 변경을 존재 검증 + graph 검증 + `rowsAffected` CAS로 통일한다.
- [ ] ErrorCodes와 backend unit tests를 보강한다.

필수 backend 테스트:

1. `updateProject`, `updateFromKanban` 각각에서 stale expected status의 conditional UPDATE가 0행이면 `PROJECT_STATUS_CONFLICT`.
2. 상태 삭제: middle/terminal은 predecessor, initial은 successor로 모든 project를 CAS 재배치한다.
3. isolated + project는 `STATUS_REPLACEMENT_REQUIRED`; isolated + no project는 삭제되고 `prevStatusId:null`.
4. 상태 삭제 중 어느 project CAS가 0행이면 이미 재배치한 project가 역-CAS 보상되고 KVS status/link는 남는다.
5. Kanban 첫 상태 추가, stale/non-terminal `prev` 추가 거부, link save 실패 시 새 status 보상 삭제.
6. `setStatusLink`의 branch/cycle/dangling endpoint와 저장 후 재검증.
7. 존재하지 않는 초기 `project_status_key`로 insert 거부.

### Frontend 체크리스트

- [ ] `useKanbanMutations`의 status conflict/error code별 rollback·refetch·toast를 추가한다.
- [ ] 첫 컬럼 추가와 0-column layout fallback을 추가한다.
- [ ] 컬럼 삭제의 `prevStatusId:null` 및 successor 승계를 안전하게 처리한다.
- [ ] `buildData`에서 orphan project status를 데이터 손실 없이 실패 처리한다.
- [ ] Flow 저장 실패 시 최신 graph invalidation을 확인한다.

필수 frontend 테스트:

1. 0개 컬럼에서 add 버튼이 나뉘기 0 없이 첫 상태 요청(`prev:null`)을 보낸다.
2. card move가 `PROJECT_STATUS_CONFLICT`면 원래 컬럼으로 rollback, 오류 toast, query invalidation.
3. initial-column 삭제 응답의 승계 target으로 카드가 이동한다.
4. isolated-column 삭제의 `prevStatusId:null`은 없는 컬럼 접근 없이 컬럼만 제거한다.
5. 삭제 실패 `STATUS_REPLACEMENT_REQUIRED`/`STATUS_GRAPH_CONFLICT`에서 optimistic state를 쓰지 않고 최신 보드를 불러온다.
6. project의 `project_status_key`에 matching column이 없으면 카드가 사라지지 않고 query failure path를 탄다.

### 검증 순서

1. `npm test -- --runInBand`
2. `Set-Location static/ui; npm test -- --runInBand; CI=true npm run build; Set-Location ../..`
3. `forge lint`

