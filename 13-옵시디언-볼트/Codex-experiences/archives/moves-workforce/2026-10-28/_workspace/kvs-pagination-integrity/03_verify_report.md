# KVS pagination integrity — verification report

## PASS

### 1. 공용 cursor 수집

- Producer: `src/nosql/query/CustomEntityManager.js:102-215`
- Verified with: `src/nosql/query/__test__/CustomEntityManagerPagination.test.js`
- Result: `findAllPaged`, `findByFieldPaged`, `findByWherePaged` 모두 `100 + 100 + 1` 페이지를 cursor 순서대로 수집했고 101번째 레코드를 포함했다. `maxItems=150`인데 다음 cursor가 남은 경우 세 helper 모두 150개만 반환하고 `truncated:true`를 반환했다.

### 2. 관리자 목록 DTO ↔ UI 소비

| Producer | Consumer | Result |
|---|---|---|
| Role/Level/Permission/Holiday fresh service의 `{data, truncated, limits}` | 각 `use*List` hook 및 `KvsTruncatedWarning` | PASS — `data` array와 `limits.maxItems`를 올바르게 보존한다. |
| Status `{rows, truncated, limits}` / link `{results, truncated, limits}` | `ProjectStatusPage.jsx:28-62` | PASS — 두 source의 partial 상태를 합쳐 경고한다. |
| Job fail `{results, truncated, limits}` | `UserPage.jsx:139-151`, `FailListModal.jsx:35-41` | PASS — 목록과 modal 모두 partial 경고를 표시한다. |
| `removeJobBatch` wrapper response | `useJobStore.js:71-83` | PASS — reject 및 `{success:false}` 모두 local job tracking을 보존한다. |

### 3. 삭제/seed fail-close 구현

- `src/resolver/utils/job/JobService.js:53-85`: batch/failure 삭제 전 `assertComplete`를 호출하며 KVS `row.key`를 20개 단위로 삭제한다.
- `src/seed/SeedData.js:165-214`: preset 및 migration은 전체 permission collection을 수집한 뒤에만 write 한다.
- `src/resolver/backoffice/{role,level,skill,permission,publicHoliday,projectStatus}`: duplicate mutation은 paged lookup과 `assertComplete`를 사용한다.

### 4. 집중 실행

```text
npm test -- --runInBand \
  src/nosql/query/__test__/CustomEntityManagerPagination.test.js \
  src/resolver/backoffice/__test__/CatalogBulk.test.js \
  src/seed/__test__/PresetPermissionSeed.test.js \
  src/resolver/utils/job/__test__/JobService.test.js \
  src/resolver/backoffice/level/__test__/LevelSalaryBand.test.js

5 suites passed, 54 tests passed
```

`findAllPaged` truncated boundary test가 의도된 `console.error`를 출력했으며 test failure는 아니다.

## 보정 재검증 — PASS

### F1 — Role/Level 내부 dictionary fail-close

- `src/resolver/backoffice/role/RoleService.js:56-63`, `src/resolver/backoffice/level/LevelService.js:115-124`가 `load*List()` 결과에 먼저 `assertComplete`를 적용하고 완전한 `items`만 `readDictionary`에 전달한다.
- 따라서 `UserService`, `TeamService`, 급여·분석 서비스는 5,000건을 넘는 불완전 Role/Level 사전을 성공 데이터로 사용할 수 없다.

### F2 — Permission 내부/관리자 목록 경로 분리

- `src/resolver/backoffice/permission/PermissionService.js:32-47`의 내부 `getPermissionListService`는 `assertComplete`를 적용한다.
- `src/resolver/backoffice/permission/PermissionService.js:54-68`의 `getPermissionListFreshService`만 partial metadata를 관리자 목록에 전달하며, `PermissionController.js:1-14`가 resolver를 이 fresh 경로에 연결한다.
- User/Team 내부 소비는 complete 서비스만 import하므로 권한 해석이 partial collection을 허용하지 않는다.

### F3 — ProjectPage status metadata 보존

- Producer: `getProjectStatusList` → `{rows, truncated, limits}`.
- Consumer: `static/ui/src/pages/project/ProjectPage.jsx:53-76` → `toProjectStatusData()`가 `{items, truncated, maxItems}`로 정규화하고 `KvsTruncatedWarning`에 그대로 전달한다.
- Regression producer/consumer test: `static/ui/src/pages/project/__test__/ProjectPageStatusMetadata.test.jsx`.

## UNVERIFIED

- Holiday/Status/Job/Seed 각각에서 실제 101+ 행을 가진 manager mock으로 service-level cursor traversal 및 fail-close를 검증하는 회귀 테스트는 아직 없다. 현재 seed/catalog/job 기존 단위 테스트는 paged API 호출 shape만 mock으로 확인한다.
- F1/F2의 5,001건 service-level `KVS_COLLECTION_LIMIT_EXCEEDED` regression test는 아직 없다. 구현상 fail-close는 확인했지만 경계값 자동 검증을 보강할 여지가 있다.
- frontend focused test는 실행을 시작했으나 이 실행 환경에서 최종 Jest exit를 회수하지 못했다. `CI=true npm run build`, 전체 Jest, `forge lint`도 이 verifier 단계에서 미검증이다.
- 실제 Forge KVS의 `nextCursor` 및 5,000 상한 runtime 동작은 개발 사이트에서 미검증이다.
