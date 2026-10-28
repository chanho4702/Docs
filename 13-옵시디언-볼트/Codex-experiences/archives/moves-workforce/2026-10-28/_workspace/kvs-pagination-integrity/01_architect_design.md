# KVS 페이지네이션 무결성 설계서

## 1. 개요 / 영향 범위

Forge KVS `getMany()`는 한 요청에서 최대 100건만 반환하고 `nextCursor`로 다음 페이지를 제공한다. 현재 `CustomEntityManager.findAll()`, `findByField()`, `findByWhere()`는 이 cursor를 버린다. 따라서 101번째 레코드부터 목록, 이름/날짜 중복 판정, seed/migration, 실패·batch 정리에서 조용히 제외된다.

이 작업은 기존 resolver 이름과 일반 성공 DTO의 배열 필드를 유지한다. 완전성이 필요한 내부 계산·mutation은 상한 초과 시 fail-close하며, 관리 화면처럼 부분 표시가 허용되는 조회만 `truncated:true`를 명시적으로 전달하고 경고를 보인다.

- 백엔드
  - `src/nosql/query/CustomEntityManager.js`: 공통 cursor 수집 helper 보강 (`findByFieldPaged` 추가, 기존 `findAllPaged`/`findByWherePaged`의 공통 정책 사용).
  - 신규 `src/nosql/query/KvsPaginationPolicy.js`: page size, 엔티티별 최대 수, `truncated` fail-close 변환을 단일 출처로 둔다.
  - `role`, `level`, `skill`, `permission`, `holiday`, `status`, `status_link`, `job_fail`, `job_batch`의 Service 및 `src/seed/SeedData.js`.
  - 기존 Controller resolver 이름·`PermissionMap`·`src/index.js` 등록은 변경하지 않는다.
- 프런트
  - Role/Level/Permission/PublicHoliday/ProjectStatus 목록 hook과 UserPage 실패 목록 및 `FailListModal`.
  - 기존 `backofficeKeys`·`userKeys`를 그대로 쓴다. 이 기능은 같은 목록을 더 완전하게 읽는 것이므로 새 query key를 만들지 않는다.
- DB/KVS
  - Custom Entity schema 및 SQL migration 없음.
  - KVS 레코드 형식 변경 없음.
- i18n
  - 이 저장소에는 `backoffice.json`이 없으므로 목록 경고는 각각 `locales/{kr,en}/role.json`, `level.json`, `permission.json`, `publicHoliday.json`, `projectStatus.json`에 추가한다. 실패 목록 경고는 `user.json`에 추가한다. 생성본 `ko-KR.json`/`en-US.json`은 직접 수정하지 않고 `npm run merge`로 갱신한다.

## 2. 경계면 계약 (가장 중요)

`responseWrapper`가 service 반환값에 `success`를 붙이는 현재 규약을 유지한다. 배열을 쓰는 기존 소비자는 `data`/`rows`/`results`를 그대로 읽는다. 조회 응답에만 최상위 `truncated`와 `limits`를 추가한다.

| resolver 함수 | 입력 | 성공 응답 shape | 대응 프런트 훅/쿼리키 |
|---|---|---|---|
| `getRoleList` | 없음 | `{ success:true, data: Role[], truncated:boolean, limits:{ maxItems:number } }` | `useRoleList` / `backofficeKeys.roles()` |
| `getLevelList` | 없음 | `{ success:true, data: Level[], truncated:boolean, limits:{ maxItems:number } }` (Controller의 salary gate 후에도 metadata 보존) | `useLevelList` 및 quick-add / `backofficeKeys.levels()` |
| `getPermissionList` | 없음 | `{ success:true, data: PermissionSet[], truncated:boolean, limits:{ maxItems:number } }` | `usePermissionList` / `backofficeKeys.permissions()` |
| `getPublicHolidayList` | 없음 | `{ success:true, data: Holiday[], truncated:boolean, limits:{ maxItems:number } }` | `usePublicHolidayList` / `backofficeKeys.publicHolidays()` |
| `getProjectStatusList` | 없음 | `{ success:true, rows: Status[], truncated:boolean, limits:{ maxItems:number } }` | `ProjectStatusPage`, `ProjectPage` / 기존 `projectKeys` |
| `getStatusLink` | 없음 | `{ success:true, results: StatusLink[], truncated:boolean, limits:{ maxItems:number } }` | `ProjectStatusPage` (현재 `results` 소비 유지) |
| `getAllFailList` | 없음 | `{ success:true, results: JobFail[], truncated:boolean, limits:{ maxItems:number } }` | `UserPage`, `FailListModal` / `userKeys.failList()` |
| `getFailList` | `{ jobId }` | `{ success:true, results: JobFail[], truncated:boolean, limits:{ maxItems:number } }` | 현재 직접 UI 소비 없음; future-safe 계약 |
| `getJobBatch` | `{ jobId }` | `{ success:true, results: JobBatch[], truncated:boolean, limits:{ maxItems:number } }` | 현재 직접 UI 소비 없음; future-safe 계약 |
| `removeFailJobList` | `{ jobId }` | `{ success:true, data:{ deletedCount:number } }` | 기존 호출 호환 (반환값 미사용) |
| `removeJobBatch` | `{ jobId }` | `{ success:true, data:{ deletedCount:number } }` | `useJobStore.cleanupJob` / 기존 호출 호환 |

상한에 도달했지만 다음 cursor가 남으면 `truncated:true`이다. 이번 범위는 UI cursor 이동을 추가하지 않으므로 `nextCursor`를 resolver 계약에 노출하지 않는다. 목록 화면은 상위 `maxItems`만 표시한다는 경고를 반드시 보인다.

완전한 데이터가 전제인 내부 서비스, seed/migration, 중복 검사, 삭제는 partial 결과를 사용하지 않는다. 이 경우 성공 DTO 대신 표준 오류 `{ success:false, error:{ code:'KVS_COLLECTION_LIMIT_EXCEEDED' } }`를 반환한다. 이 오류는 데이터가 실제로 존재하지 않는 오류가 아니므로 재시도로 우회하지 않으며 관리자에게 정리/분할 조치를 요구한다.

## 3. 백엔드 설계

### 3.1 공통 cursor·상한 정책

`KvsPaginationPolicy.js`를 다음 단일 출처로 신설한다.

```js
export const KVS_PAGE_SIZE = 100;
export const CATALOG_MAX_ITEMS = 5000; // role, level, skill, permission
export const HOLIDAY_MAX_ITEMS = 5000;
export const STATUS_MAX_ITEMS = 5000;
export const STATUS_LINK_MAX_ITEMS = 5000;
export const JOB_RECORD_MAX_ITEMS = 5000; // job_fail, job_batch
```

- 100은 Forge KVS page 상한이다. 호출부가 임의로 100보다 큰 limit를 넣지 않는다.
- 5,000은 256MB runtime에서 단일 설정성 collection을 한 resolver에 수집하는 보수적 상한이다. 상한이 정책인 이상 `truncated`를 잃지 않는다.
- Role/Level/Skill/Permission은 같은 `CATALOG_MAX_ITEMS`를 목록, quick-add/bulk 이름 검사, 단건 add/update 중복 검사에 모두 사용한다. 따라서 “목록에는 없지만 저장은 이름 중복”이 생기지 않는다.
- `assertComplete({ entity, truncated })`가 `KVS_COLLECTION_LIMIT_EXCEEDED` `LogicalError`를 던진다. 이 작업에서 새 error code와 en/kr error message mapping을 추가한다.
- `CustomEntityManager`에는 `findByFieldPaged(indexName, pageLimit, maxItems)`를 추가한다. 내부 알고리즘은 `findAllPaged`/`findByWherePaged`와 동일하게 cursor를 반복하고 `{ results, truncated }`를 반환한다. 가능하면 private `collectPaged(buildQuery, ...)`로 세 함수의 구현을 공유한다. legacy `findAll/findByField/findByWhere`의 의미는 바꾸지 않는다. 이번에 식별된 production caller만 paged API로 교체한다.
- 매 페이지 결과를 push한 뒤 `nextCursor` 존재와 `maxItems` 도달을 함께 확인한다. 마지막 페이지가 정확히 5,000건이고 cursor가 없으면 `truncated:false`여야 한다.

### 3.2 caller별 교체 표

| 위치 | 현재 절단 호출 | 변경 | truncation 처리 |
|---|---|---|---|
| `RoleService.loadRoleList`, `LevelService.loadLevelList`, `PermissionService.getPermissionListService`, `SkillService.loadSkillList` | `findAll()` 또는 기존 paged 일부 | `findAllPaged('name', KVS_PAGE_SIZE, CATALOG_MAX_ITEMS)` | CRUD 화면 응답 metadata에 전달. 내부 dictionary 소비는 `assertComplete` 후에만 반환. |
| Role/Level/Skill/Permission `checkDuplicated` | `findByWhere('name', name)` | `findByWherePaged('name', name, ..., CATALOG_MAX_ITEMS)` | `assertComplete` 후 자기 ID 제외 검사. |
| `PermissionService.getMemberId` | 이름 where | 고정 seed key `findById('permission-Member')` | cursor 불필요, 없으면 `undefined` 유지. |
| `PublicHolidayService.loadPublicHolidayList` | `findByField('by-date')` | `findByFieldPaged('by-date', ..., HOLIDAY_MAX_ITEMS)` | CRUD 응답은 metadata 제공; MD/MM·비용·진척도 등 내부 `getPublicHolidayListService`는 완전성 요구로 `assertComplete`한다. |
| Holiday 날짜 중복 검사 | `findByWhere('by-date', date)` | `findByWherePaged(..., HOLIDAY_MAX_ITEMS)` | `assertComplete` 후 중복 판정. |
| `ProjectStatusService.loadProjectStatusList` | `findAll()` | `findAllPaged('name', ..., STATUS_MAX_ITEMS)` | 화면은 metadata; 상태 이름/order를 쓰는 내부 서비스는 `assertComplete`. |
| 상태 삭제, link 저장/재정렬/조회 (`deleteProjectStatusService`, `saveStatusLink`, `saveStatusOrder`, `getStatusLinkService`) | `findByField('name'/'from')` | status=`findByFieldPaged`, link=`findByFieldPaged` | mutation은 모두 `assertComplete` 후 삭제·재결선·order update. 조회는 `truncated`를 응답. |
| 상태 이름 중복 검사 | `findByWhere('name', name)` | `findByWherePaged(..., STATUS_MAX_ITEMS)` | `assertComplete` 후 중복 판정. |
| `SeedData.addPresetPermissionSeed` | permission `findAll()` | `findAllPaged(..., CATALOG_MAX_ITEMS)` | ledger를 변경하기 전에 `assertComplete`; 초과면 preset을 만들지 않고 seed version도 올리지 않는다. |
| `SeedData.migratePermissionSets` | permission `findAll()` | `findAllPaged(..., CATALOG_MAX_ITEMS)` | migration write loop 전에 `assertComplete`; partial migration 금지. |
| `SeedData.addStatusLink` | 고정 이름 `findByWhere()` 3회 | `findById('status-todo'/'status-in-progress'/'status-done')` | seed ID가 고정이므로 cursor query 제거. |
| `JobService.getFailListService`, `getAllFailListService`, `getJobBatchService` | `findByWhere`/`findByField` | 해당 paged helper + `JOB_RECORD_MAX_ITEMS` | 결과 및 `truncated/limits` 반환. |
| `removeFailJobListService`, `removeJobBatchService` | 첫 100만 읽어 delete | `findByWherePaged(..., JOB_RECORD_MAX_ITEMS)` | `assertComplete` 후 key만 20개씩 bounded parallel delete, `{deletedCount}` 반환. partial delete 금지. |

`findByFilterExists()`는 이번 문제의 `findAll/findByField/findByWhere` 범위 밖이다. 다만 status ordered-list 사용처가 100건을 넘는 문제는 상태 graph P1에서 별도 점검한다. 이 설계의 구현자는 해당 helper를 무관하게 전면 변경하지 않는다.

### 3.3 dictionary cache와 fail-close

`readDictionary()`에는 완성된 DTO만 캐시한다. `loadRoleList`/`loadLevelList`/`loadProjectStatusList`/`loadPublicHolidayList`는 `{ items, truncated }` 형태의 private loader로 정리하고:

- `get*ListFreshService`는 `{data|rows:items, truncated, limits}`로 화면에 전달한다.
- `get*ListService` (내부 계산/매핑용)는 `assertComplete` 후 현재와 같은 `{data|rows:items}`만 반환한다. 따라서 기존 호출자가 `truncated`를 잊어도 불완전 계산을 할 수 없다.
- Controller의 level salary gate는 `{...res, data:...}` spread로 metadata를 보존한다.

### 3.4 Job 삭제의 안전성

`removeFailJobList`/`removeJobBatch`는 `truncated:true`일 때 한 건도 delete하지 않는다. complete 결과만 `row.key`를 대상 키로 쓰며(현재 fail 삭제의 잘못된 `item.id` 사용도 함께 바로잡음), `deleteInChunks(keys, 20)`으로 Forge 호출 폭주를 막는다. 중간 delete 실패는 성공 count를 숨기지 않고 표준 오류로 전파한다. 재시도는 남은 키를 다시 전량 읽어 수행한다.

## 4. 프런트엔드 설계

- 목록 hook은 query 결과를 배열만 반환하지 말고 `{items, truncated, maxItems}`를 보존한다. 기존 table row mapping은 `items`만 사용한다.
- Role, Level, Permission, PublicHoliday, ProjectStatus 페이지는 `truncated`일 때 table 위에 warning flag를 표시한다. 편집/quick-add/bulk 추가는 막지 않되, 서버 duplicate mutation이 동일 상한에서 `KVS_COLLECTION_LIMIT_EXCEEDED`를 돌려주면 해당 오류를 toast로 보여 준다.
- PublicHoliday는 화면에서 partial 목록을 표시할 수 있지만, 계산성 화면은 backend가 fail-close하므로 과소 MD/MM 값을 보이지 않는다.
- `UserPage`의 `getAllFailList` query는 `{items, truncated, maxItems}`를 저장한다. 버튼 count는 로드된 `items.length`만 쓰고 `truncated`일 때 `+` 또는 경고 문구를 함께 보인다. `FailListModal` 상단에 “처음 N건만 표시” flag를 표시한다. modal 내부 `CommonTable.rowsPerPage=10`은 클라이언트 표시 페이징일 뿐 KVS cursor paging이 아님을 유지한다.
- Job cleanup store는 resolver가 `{data:{deletedCount}}`를 반환해도 기존처럼 결과를 요구하지 않는다. 단 `Promise.allSettled`가 실패 응답(`success:false`)을 fulfilled로 취급할 수 있으므로 `cleanupJob`는 wrapper success를 검사하고 실패 시 `forgetJob`하지 않도록 보정한다. 이 변경은 batch가 5,000건을 초과할 때 local tracking만 지워져 재시도 기회를 잃는 것을 막는다.
- 새 query key, Zustand persistent schema, route, 권한 추가 없음.

## 5. DB 설계

- MySQL table/migration 없음.
- `manifest.yml` Custom Entity 속성·index 변경 없음. `findByFieldPaged('by-date')`, `findByWherePaged('by-date', value)`는 이미 선언된 `holiday.by-date`, status/permission/role/level/skill의 `name`, `status_link.from`, job entity의 `jobId` indexes만 사용한다.
- `seed_version`은 migration 전체가 완료될 때만 `ensureSeed()`가 갱신하는 현행 흐름을 유지한다. permission collection이 상한 초과하면 `runSeed()`가 throw하여 version을 기록하지 않으며, 다음 install/upgrade에서 안전하게 재시도한다.

## 6. i18n 키 목록

각 source locale(kr/en)에 다음 키를 추가한다. 첫 키는 각 목록 파일(role/level/permission/publicHoliday/projectStatus)의 기존 page/table namespace에, 두 번째는 `user` 실패 목록 namespace에, 세 번째는 `common.json` 오류 mapping namespace에 둔다.

| 키 | kr | en |
|---|---|---|
| `backoffice.kvs.truncatedList` | `조회 한도({max})를 넘어 일부 항목만 표시합니다. 관리자가 데이터를 정리한 뒤 다시 시도해 주세요.` | `The collection exceeds the {max}-item limit. Only part of it is shown; ask an administrator to reduce it and try again.` |
| `backoffice.kvs.truncatedFailList` | `실패 내역이 조회 한도({max})를 넘어 처음 {shown}건만 표시합니다.` | `The failure list exceeds the {max}-item limit. Only the first {shown} items are shown.` |
| `backoffice.kvs.limitExceeded` | `데이터가 조회 한도를 초과해 안전하게 작업을 중단했습니다. 데이터를 정리한 뒤 다시 시도해 주세요.` | `The collection exceeds the safe retrieval limit, so the operation was stopped. Reduce the data and try again.` |

`KVS_COLLECTION_LIMIT_EXCEEDED`는 frontend error-code → `backoffice.kvs.limitExceeded` mapping에 추가한다. `npm run merge`를 실행해 생성 번역 파일을 갱신한다.

## 7. 구현 작업 분해

### Backend

- [ ] `KvsPaginationPolicy.js`에 상수와 `assertComplete`를 추가하고 `ErrorCodes.KVS_COLLECTION_LIMIT_EXCEEDED`를 등록한다.
- [ ] `CustomEntityManager`에 `findByFieldPaged`를 추가하고 세 paged helper의 cursor/truncated 경계를 단위 테스트한다.
- [ ] Role/Level/Skill/Permission의 list·duplicate path를 catalog 정책으로 통일한다. `getMemberId`는 fixed key lookup으로 바꾼다.
- [ ] Holiday list/duplicate path를 paged 처리하고 Fresh vs internal dictionary consumer의 complete/metadata 계약을 분리한다.
- [ ] Status/status_link 모든 `findByField/findAll/findByWhere` caller를 paged helper로 교체한다. 이번 PR은 graph 규칙 자체를 바꾸지 않는다.
- [ ] Seed permission preset/migration을 full collection 확인 뒤 수행하고 fixed status seed lookup을 `findById`로 교체한다.
- [ ] Job read/delete path를 paged 처리하고 complete 확인 후 chunk delete한다.
- [ ] affected service/controller unit tests의 custom entity mock에 `findAllPaged/findByFieldPaged/findByWherePaged`를 명시적으로 제공한다.

### Frontend

- [ ] 각 backoffice list hook/page에서 metadata를 보존하고 truncated warning을 렌더링한다.
- [ ] `UserPage`/`FailListModal`에 failure-list truncation 표시를 추가한다.
- [ ] `useJobStore.cleanupJob`에서 wrapper 실패 응답을 failure로 취급해 tracking을 유지한다.
- [ ] kr/en locale source 추가 후 `npm run merge`.

### 테스트·검증

- [ ] `CustomEntityManager` cursor test: 100+100+잔여 page, 정확히 max page(커서 없음) `truncated:false`, max 초과 `truncated:true`, where/field/all 세 종류.
- [ ] Role/Level/Skill/Permission: 101번째 목록이 보이고 101번째 이름이 duplicate로 거절되며 list와 duplicate가 같은 `CATALOG_MAX_ITEMS`를 전달하는 테스트.
- [ ] Permission seed/migration: 101+ custom sets가 모두 처리되고 `truncated:true`이면 seed ledger/seed_version 이전에 throw하는 테스트.
- [ ] Holiday: 101번째 날짜가 목록/계산 입력에 포함되고 상한 초과 시 계산 service가 fail-close하는 테스트.
- [ ] Status/link: 101번째 상태·link도 delete/reorder/get에 포함되며 truncated 상태에서 mutation이 delete/write 전에 중단하는 테스트.
- [ ] Job: 101번째 fail/batch 표시, `remove*`가 전량 key를 대상으로 삭제, truncated 상태에서 0건 delete, `item.id`가 아닌 `item.key` 삭제 테스트.
- [ ] frontend hook/modal warning 및 `cleanupJob` success:false regression test.
- [ ] `npm test -- --runInBand`, `static/ui`에서 `npm test -- --runInBand`, `CI=true npm run build`, app root `forge lint`.
