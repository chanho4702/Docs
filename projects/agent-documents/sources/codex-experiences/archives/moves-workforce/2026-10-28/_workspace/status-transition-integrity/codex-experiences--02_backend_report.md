# P1-1 backend 구현 보고

## 구현 범위

- `src/resolver/backoffice/projectStatus/ProjectStatusTransitionService.js`
  - `loadStatusGraph()`는 `status`와 `status_link`를 paged 조회하고 `assertComplete`로 KVS partial 결과를 fail-close 처리한다.
  - replacement edge의 endpoint, self-loop, duplicate, in/out branching, cycle을 서버에서 검증한다.
  - `assertAllowedProjectStatusTransition()`은 동일 상태 no-op, 빈 graph의 기존 호환 동작, 명시된 forward edge만 허용한다.
- `updateProjectService`는 현재 프로젝트 상태와 요청 상태가 다를 때 공통 transition validator를 거친 후 기존 SQL update를 호출한다.
- `updateFromKanban` controller가 Forge `context`를 전달하고, `updateProjectPartialService`가 공개 resolver 호출(context 존재)에만 같은 validator를 적용한다. context 없는 기존 내부 상태 migration은 이번 P1-1 범위 밖이므로 기존 동작을 유지한다.
- `setStatusLinkService`는 기존 link를 삭제하기 전에 snapshot과 replacement graph를 검증한다. invalid 요청은 저장을 시작하지 않는다. replacement write가 중간에 실패하면 현재 남은 partial link를 제거하고 기존 snapshot을 복구한다. 복구 실패는 `STATUS_LINK_RESTORE_FAILED`와 원래 write/restore error cause로 명시적으로 전파한다.

## resolver / 실제 응답 shape

기존 `guardedDefine`와 `responseWrapper` 계약을 바꾸지 않았다.

| resolver | 성공 | 실패 |
|---|---|---|
| `updateProject` | 기존 SQL 결과가 `responseWrapper`를 통해 `{ success: true, ...result }` | `{ success: false, error: { code: STATUS_NOT_FOUND | STATUS_TRANSITION_NOT_ALLOWED, ... } }` |
| `updateFromKanban` | 기존과 같이 `undefined` service 결과를 wrapper가 성공 응답으로 직렬화 | `{ success: false, error: { code: STATUS_NOT_FOUND | STATUS_TRANSITION_NOT_ALLOWED, ... } }` |
| `setStatusLink` | 기존과 같이 빈 성공 결과 | `{ success: false, error: { code: STATUS_LINK_INVALID | STATUS_LINK_BRANCHING | STATUS_LINK_CYCLE | STATUS_GRAPH_INVALID | STATUS_LINK_RESTORE_FAILED, ... } }` |

KVS 조회가 상한에 걸리면 세 resolver 모두 `KVS_COLLECTION_LIMIT_EXCEEDED`로 fail-close 한다.

## 검증

`npm test -- --runInBand src/resolver/backoffice/projectStatus/__test__/ProjectStatusTransitionService.test.js src/resolver/backoffice/projectStatus/__test__/ProjectStatusLinkCompensation.test.js`

- PASS: 2 suites, 5 tests
- 검증: 정방향/동일 상태 전이, invalid replacement edge, KVS partial fail-close, replacement write 실패 시 기존 graph 복구, 복구 실패의 명시적 오류 전파
