# KVS pagination integrity — backend report

## 구현 범위

- `KvsPaginationPolicy.js`: page size(100), collection별 5,000 상한, `assertComplete`, 목록 metadata helper를 추가했다.
- `CustomEntityManager.findByFieldPaged()`를 추가했다. 기존 `findAllPaged`/`findByWherePaged`와 같이 cursor를 끝까지 수집하고 `{ results, truncated }`를 반환한다.
- Role, Level, Permission, Skill, Holiday, Project Status/Status Link의 목록·중복·변경 경로를 paged helper로 전환했다.
- 내부 dictionary 소비(Role/Level/Skill/Holiday/Status)는 truncated 상태에서 `KVS_COLLECTION_LIMIT_EXCEEDED`로 fail-close한다. 화면용 fresh 목록은 기존 배열 필드에 metadata를 더해 반환한다.
- Permission preset/permission migration은 전체 수집 완료 전에는 seed를 진행하지 않는다. 고정 Member/Status seed lookup은 ID lookup으로 바꿨다.
- Job fail/batch 조회는 `results`, `truncated`, `limits`를 반환하며, 삭제는 truncation 시 중단하고 KVS row `key`를 20개씩 삭제한다. 성공 응답은 `{ data: { deletedCount } }`다.

## 실제 응답 shape

- `getRoleList`, `getLevelList`, `getPermissionList`, `getPublicHolidayList`: `{ success:true, data: Array, truncated:boolean, limits:{maxItems:5000} }`
- `getProjectStatusList`: `{ success:true, rows: Array, truncated:boolean, limits:{maxItems:5000} }`
- `getStatusLink`, `getAllFailList`, `getFailList`, `getJobBatch`: `{ success:true, results: Array, truncated:boolean, limits:{maxItems:5000} }`
- `removeFailJobList`, `removeJobBatch`: `{ success:true, data:{deletedCount:number} }`

## 검증

- `npm test -- --runInBand src/resolver/backoffice/level/__test__/LevelSalaryBand.test.js` — 1 suite, 12 tests passed.
- `npm test -- --runInBand src/seed/__test__/PresetPermissionSeed.test.js` — 1 suite, 22 tests passed.

기존 test mock은 새 paged API를 명시하도록 갱신했다. 다른 backend/frontend 통합 검증은 verifier 단계에서 수행한다.

## verifier F1~F2 보완 (2026-08-31)

- `getRoleListService`와 `getLevelListService`는 dictionary cache에 넣기 전에 `assertComplete`를 호출한다. 따라서 내부 사용자·팀·비용 계산 경로는 5,000건을 초과한 catalog을 부분 데이터로 해석하지 않는다.
- Permission은 내부용 `getPermissionListService`를 complete-only 경로로 만들고, 관리자 목록 전용 `getPermissionListFreshService`를 분리했다. `getPermissionList` resolver는 fresh 경로를 사용해 기존 `{data, truncated, limits}` 계약을 유지한다.
- 회귀: `CatalogDictionaryCompleteness.test.js`는 role/level/permission 각각 `truncated:true`에서 `KVS_COLLECTION_LIMIT_EXCEEDED`로 중단하는지, permission fresh 목록은 partial metadata를 보존하는지 검증한다.
