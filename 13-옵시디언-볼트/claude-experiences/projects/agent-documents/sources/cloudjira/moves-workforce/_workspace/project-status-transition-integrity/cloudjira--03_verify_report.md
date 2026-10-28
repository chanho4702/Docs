# 상태 전이·Kanban 통합 검증 리포트

검증 기준: `01_architect_design.md`, 최신 backend/frontend 변경분 및 실제 resolver 응답 규약.

## 통과

### Resolver · 프론트 응답 계약

- 생산자: `src/utils/ResponseWrapper.js:11-14`는 성공 결과를 `{ success: true, ...result }`로 최상위 spread 한다.
- 소비자: `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx:103-118`는 상태 목록을 `statusRes.rows`, 프로젝트 목록을 `projectRes.content`에서 읽는다. 두 서비스의 반환값(`{ rows }`, `{ content }`)과 일치한다.
- 소비자: `static/ui/src/pages/projectKanban/useKanbanMutations.js:124-170, 189-239`는 add/delete 결과의 최상위 `id`, `prevStatusId` 및 `success`를 읽는다. `addProjectStatusFromKanbanService`와 `deleteProjectStatusService`의 반환 계약과 일치한다.
- resolver 등록: `ProjectStatusController.js`와 `ProjectController.js`의 invoke 이름이 각각 Kanban 소비자와 일치하며, 모두 `guardedDefine`로 등록됐다. `PermissionMap`에도 기존 항목이 존재한다.

### 상태 그래프 · CAS · 삭제 보상

- `ProjectStatusTransitionService.js`가 dangling/self/branch/cycle edge를 차단하며, `ProjectService.js:189,296`은 status 변경을 조건부 SQL update로 처리한다. Repository의 `UPDATE_IF_STATUS_CURRENT` / `UPDATE_STATUS_IF_CURRENT`은 `deletion_state = 'ACTIVE'`와 현재 status를 함께 조건으로 둔다.
- 초기 상태 삭제는 successor로, middle/terminal 상태 삭제는 predecessor로 재배정한다. isolated 상태에 프로젝트가 있으면 `STATUS_REPLACEMENT_REQUIRED`, 없으면 `{ prevStatusId: null }`을 반환한다.
- KVS status/link/order 쓰기 실패 후에는 `ProjectStatusService.js:14-31, 285-338`의 역방향 `replaceProjectStatusService` CAS 보상으로 이전 프로젝트 상태를 복구한다. 보상 자체 실패는 `STATUS_PROJECT_REASSIGN_RESTORE_FAILED`로 명시한다.
- 전용 회귀: `ProjectStatusDeleteCompensation.test.js`가 KVS 삭제 실패 시 역방향 CAS 호출과 보상 실패 코드를 검증했다.

### Kanban UI 경계

- 0개 column은 `getKanbanColumnWidth(..., 0, ...) => '100%'`로 나눗셈 0을 피하고, 첫 column 요청은 `prev: null`을 보낸다.
- 카드 이동 실패는 `requireKanbanMoveSuccess`가 wrapper 실패를 예외로 승격하고 기존 cache로 rollback한다. status conflict는 프로젝트·status query를 무효화한다.
- column 삭제는 successor/precedessor의 `prevStatusId`에 카드 cache를 옮기며, `null`이면 column만 제거한다.
- `applyProjectListToDataSource`는 status column이 없는 project를 조용히 누락시키지 않고 query error로 전환한다.

### 실행 검증

- backend 전체: `npm test -- --runInBand` — 109 suites, 1,464 tests 통과.
- backend 집중: `ProjectStatusDeleteCompensation`, `ProjectStatusTransitionService` — 2 suites, 5 tests 통과.
- frontend 전체: 99 suites, 1,649 tests 통과.
- frontend CI build: `CI=true npm run build` 통과. dependency source-map/Browserslist 경고만 존재.
- Forge: build 완료 후 `forge lint` 재실행 결과 `No issues found`. (build와 병렬로 실행한 첫 lint는 build 디렉터리 재생성 순간의 `index.html` 부재로 실패했으므로 최종 판정에는 반영하지 않음.)

## 실패

### Kanban 상태 충돌 전용 i18n 문구 미반영

- 설계: `01_architect_design.md` 6절은 `projectStatus.kanban.statusConflict`, `graphConflict`, `replacementRequired`, `orphanStatus`의 kr/en source locale 추가를 요구한다.
- 실제: `static/ui/src/pages/projectKanban/useKanbanMutations.js:198`은 `res.error.message` 또는 generic failure를 노출하고, 위 네 key는 `locales/kr`, `locales/en`에 존재하지 않는다.
- 영향: `STATUS_REPLACEMENT_REQUIRED` 등 서버 code가 사용자에게 그대로 보일 수 있어 Kanban의 충돌 안내 UX가 설계보다 불명확하다.
- 수정: 두 source locale에 key를 추가하고 `useKanbanMutations.js`의 code별 toast를 해당 `t()` key로 매핑한 뒤 `npm run merge`를 실행한다. 생성본 locale은 직접 수정하지 않는다.

## 미검증

- 실제 Jira UI에서 동시 관리자 조작(CAS conflict), initial/isolated column 삭제, KVS 장애를 재현하는 E2E는 이 실행 환경에 인증된 브라우저·KVS fault injection이 없어 수행하지 못했다. 단위/통합 mock 회귀로 대체 검증했다.
