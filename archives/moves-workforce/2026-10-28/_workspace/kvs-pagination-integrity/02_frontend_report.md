# KVS pagination integrity — frontend report

## Implemented

- Role, Level, Permission, Public Holiday queries now preserve the backend list metadata in the shared React Query cache as `{ items, truncated, maxItems }`.
- Existing dropdown, quick-add, salary-policy, and calendar consumers unwrap only `items`, so the shared `backofficeKeys` contract remains consistent across pages.
- Project Status and Status Link queries preserve their `truncated` metadata and show the same warning when either source is partial.
- User bulk-upload failure list consumes `{ results, truncated, limits }`, displays the partial-result warning in both the page and modal, and keeps the existing count based on displayed items.
- Added `KvsTruncatedWarning` to make incomplete KVS lists explicit without adding cursor navigation to this RFC.
- `useJobStore.cleanupJob` now keeps local job tracking when either cleanup resolver rejects or returns `{ success:false }`; this preserves a safe retry path when batch cleanup is fail-closed.

## verifier F3 보완 (2026-08-31)

- 일반 `ProjectPage`의 project-status query가 배열만 cache하던 경로를 `{items, truncated, maxItems}` 형태로 바꿨다.
- partial status collection이면 프로젝트 목록 상단에 `KvsTruncatedWarning`을 표시한다. 생성·수정 modal에는 기존처럼 수집된 status만 전달하되, 사용자가 불완전 상태를 알지 못한 채 작업하지 않도록 한다.
- `ProjectPageStatusMetadata.test.jsx`가 `rows/truncated/limits`를 cache DTO로 빠짐없이 변환하는 회귀를 검증한다.

## Backend response shapes consumed

- Catalog/holiday: `{ success, data, truncated, limits: { maxItems } }`
- Project status: `{ success, rows, truncated, limits: { maxItems } }`
- Status links/failure list: `{ success, results, truncated, limits: { maxItems } }`
- Job cleanup: `{ success, data: { deletedCount } }`; `success:false` is treated as failed cleanup.

## i18n

- Added source keys in `locales/kr/common.json` and `locales/en/common.json` under `common.backoffice.kvs`.
- Ran `static/ui` `npm run merge`; generated `ko-KR.json` and `en-US.json` were updated. The merge printed the existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning only.

## Verification

- Passed: `npm test -- --runInBand src/stores/__test__/useJobStore.test.js src/utils/queryKey/salaryBandInvalidation.test.js`
  - 2 suites, 5 tests passed.
- `CI=true npm run build` was started after merge, but was stopped before exit/bundle-budget output at coordinator request. Final build exit: **UNVERIFIED**.
- Full frontend test suite: **UNVERIFIED** in this phase.
