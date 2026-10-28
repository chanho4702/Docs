# Frontend 구현 보고

## 변경 범위

- `static/ui/src/pages/projectKanban/useKanbanMutations.js`
  - `updateFromKanban`의 `PROJECT_STATUS_CONFLICT`, `STATUS_TRANSITION_NOT_ALLOWED`, `STATUS_GRAPH_CONFLICT`는 낙관적 이동을 `ctx.prev`로 되돌리고 project/status/kanban query를 무효화한다.
  - `deleteProjectStatus` 성공의 실제 wrapper 최상위 `res.prevStatusId`를 사용한다.
  - successor가 있으면 해당 컬럼으로 카드 캐시를 이동시키고, `prevStatusId: null`이면 카드 이동 없이 컬럼만 제거한다.
  - `STATUS_REPLACEMENT_REQUIRED` 및 graph/status conflict 오류는 캐시를 다시 읽고 서버 오류 문구를 표시한다.
- `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx`
  - 상태가 0개일 때 컬럼 너비를 `100%`로 계산해 0 나누기를 막는다. 기존 `lastCol: null` 호출로 첫 상태 생성 요청을 보낸다.
  - 오래된 프로젝트 추가 로드에도 responseWrapper 실패를 확인하고, 존재하지 않는 상태를 참조하면 조용히 카드를 버리지 않고 invalidate 후 오류를 표시한다.
- `static/ui/src/pages/projectKanban/utils/buildData.js`
  - 상태 컬럼 없는 프로젝트를 조용히 제외하지 않고 query failure로 처리해 React Query 재시도 및 기존 보드 유지 경로를 사용한다.

## Backend responseWrapper 소비 계약

| Resolver | 성공 소비 | 오류 소비 |
| --- | --- | --- |
| `updateFromKanban` | `{ success: true }` | `result.error.code`를 `Error.cause`로 보존 후 rollback/invalidate |
| `addProjectStatusFromKanban` | `result.id` | `result.success === false` |
| `deleteProjectStatus` | `result.prevStatusId` | `result.error.code`, `result.error.message` |

`src/utils/ResponseWrapper.js`는 service 결과를 `content`로 감싸지 않고 최상위에 spread한다. 따라서 설계/백엔드 보고서의 `content` 표기는 실제 runtime contract와 다르며, UI는 기존 runtime contract를 유지했다.

## i18n

새 키는 추가하지 않았다. 사용자 변경인 root locale 파일을 수정하지 않고, 기존 공용 오류 문구와 backend 오류 message를 사용했다.

## 검증

- `npm test -- --runInBand src/pages/projectKanban/__test__/useKanbanMutations.test.js src/pages/projectKanban/__test__/ProjectKanbanBoard.test.js src/pages/projectKanban/__test__/buildData.test.js`
  - 3 suites, 12 tests 통과
- `CI=true npm run build`
  - 통과. 기존 Browserslist 및 dependency source-map 경고만 발생.
- `git diff --check` 통과.
