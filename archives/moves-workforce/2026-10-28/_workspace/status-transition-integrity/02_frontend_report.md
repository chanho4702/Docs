# P1-1 상태 전이 무결성 프론트엔드 보고

## 구현

- 소유 파일: `static/ui/src/pages/projectKanban/useKanbanMutations.js`
- `cardMoveMutation.mutationFn`이 `updateFromKanban`의 responseWrapper를 `requireKanbanMoveSuccess()`로 검증한다.
- `{ success: false, error }`는 `Error`로 throw하며 `error.cause`에 backend error envelope를 보존한다. 따라서 TanStack Query의 기존 `onError`가 `ctx.prev` Kanban 캐시를 즉시 복원하고 공통 실패 toast를 표시한다.
- `{ success: true }`는 원본 responseWrapper 객체를 그대로 반환한다. 성공 toast와 invalidate 계약은 변경하지 않았다.

## 소비 경계면

- 요청: `invoke("updateFromKanban", { project_id, project_status_key })`
- 성공: `{ success: true, ...serviceResult }` (`serviceResult`는 현재 `undefined` 가능)
- 실패: `{ success: false, error: { code, message, ... } }`

## i18n

- 기존 공통 실패 toast를 재사용했다. 번역 키 추가 및 merge는 불필요하다.

## 검증

- `static/ui/src/pages/projectKanban/__test__/useKanbanMutations.test.js` 추가: 성공 envelope 보존, `success:false`의 throw 및 cause 보존을 검증.
- `cd static/ui && npm test -- --runInBand src/pages/projectKanban/__test__/useKanbanMutations.test.js`: PASS (1 suite, 2 tests)
