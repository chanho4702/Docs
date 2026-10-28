# QA — 자산관리(Assets) 코어 · BE↔FE 경계면 정합성 (정적 shape)

> 검증: integration-qa / 2026-07-08 · 방식: 정적 코드/타입 교차 대조(앱 미기동)
> 대상 BE: `moveseye-be-spring` `com.dmove.moveseye.asset` (Controller/DTO/domain)
> 대상 FE: `moveseyee_fe` `types/asset.ts`·`services/asset.api.ts`·`hooks/useAsset.ts`·`pages/asset/**`
> 기준 계약: `_workspace/contract_assets-core.md`

## 결론: 불일치 0건 — 전 항목 정합 확인

9개 엔드포인트의 경로·메서드·쿼리/바디·응답 shape·언랩 깊이·에러 계약·enum 상수 모두 계약과 코드가 1:1 일치한다. 실질 버그(필드 오타/타입 불일치/과다 언랩/에러 오인) 없음. 하단 §참고에 비결함 관찰 2건만 정보성 기록.

---

## 1. 엔드포인트별 경로·메서드·파라미터

| # | 계약 | BE 매핑 | FE api 함수 | 판정 |
|---|---|---|---|---|
| 1 | GET /assets | `@GetMapping` (@RequestMapping "/assets") | `getList` `API.get("/assets",{params})` | 정합 |
| 2 | GET /assets/summary | `@GetMapping("/summary")` | `getSummary` `/assets/summary` | 정합 |
| 3 | GET /assets/{id} | `@GetMapping("/{id}")` | `getDetail` `/assets/${id}` | 정합 |
| 4 | GET /assets/{id}/activities | `@GetMapping("/{id}/activities")` limit/offset | `getActivities` `/assets/${id}/activities`,{params} | 정합 |
| 5 | POST /assets | `@PostMapping` | `createAsset` `POST /assets` | 정합 |
| 6 | PATCH /assets/{id} | `@PatchMapping("/{id}")` | `updateAsset` `PATCH /assets/${id}` | 정합 |
| 7 | DELETE /assets/{id} | `@DeleteMapping("/{id}")` deleteFromZabbix | `excludeAsset` `DELETE /assets/${id}` | 정합(§참고1) |
| 8 | PATCH /assets/{id}/restore | `@PatchMapping("/{id}/restore")` | `restoreAsset` `PATCH /assets/${id}/restore` | 정합 |
| 9 | POST /assets/sync | `@PostMapping("/sync")` | `syncAssets` `POST /assets/sync` | 정합 |

- GET /assets 쿼리(`SearchAssetListDto`: limit/offset/keyword/searchField/source/groupName/includeExcluded/sortBy/sortDirection) ↔ FE `TAssetListParams` 필드명·옵셔널 완전 일치.

## 2. 응답 DTO 필드 대조

| DTO | BE 필드(타입) | FE 타입 | 판정 |
|---|---|---|---|
| AssetListItemDto | id, source, name, zabbixHostid, groupNames[], inventoryType, inventoryOs, tagCount(int), customPropertyCount(int), excluded, lastSyncedAt, updatedAt | TAssetListItem | 정합 |
| AssetSummaryDto | total, zabbixCount, customCount, excludedCount(long), lastSyncedAt | TAssetSummary | 정합 |
| AssetDetailDto | id, source, name, zabbixHostid, zabbixData, inventoryMode, customProperties[], notes, excluded, lastSyncedAt, createdAt, updatedAt, live, recentActivities[] | TAssetDetail | 정합 |
| LiveInfo | available(String), activeProblemCount(long) | TAssetLive{available,activeProblemCount:number} | 정합 |
| AssetActivityDto | id, assetId, action, actorType, actorName, changes[], createdAt | TAssetActivity | 정합 |
| AssetActivityChange | field, before, after | TAssetActivityChange | 정합 |
| AssetZabbixData | host, visibleName, status, groups[], interfaces[], inventory(Map<String,String>), tags[] | TAssetZabbixData | 정합 |
| ─ Group | groupid, name | TAssetZabbixGroup | 정합 |
| ─ Interface | type, ip, dns, port, main | TAssetZabbixInterface | 정합 |
| ─ Tag | tag, value | TAssetZabbixTag | 정합 |
| AssetCustomProperty | key, value | TAssetCustomProperty | 정합 |
| SyncAssetsResDto | added, updated, skipped, total(int), syncedAt(String) | TSyncResult | 정합 |

- **Lombok is-접두 함정 없음**: 모든 응답 DTO는 record(BE) — getter 접두 변형 무관, 필드명 그대로 직렬화. `excluded`는 record 컴포넌트라 JSON 키 `excluded` 보존(FE도 excluded). 문제 없음.
- **중첩 컬렉션 non-null 보장**: BE가 groups/interfaces/tags/inventory/changes/customProperties를 null 대신 빈 컬렉션으로 방어(record accessor 오버라이드·from()). FE는 배열/객체로 소비해도 안전.
- **날짜/스칼라 문자열 계약**: 날짜 필드 전부 `@JsonFormat` 문자열 → FE `string|null`. zabbixData/inventory/live 하위 스칼라 전부 String/Map<String,String> → FE `string|null`·`Record<string,string>`. status/inventoryMode 문자열 계약 준수(상세 페이지 `statusToCommon`이 "0"/"1" 문자열 비교). 정합.

## 3. 언랩 깊이 (과다 언랩 없음)

- axios 인터셉터: `return response.data` → ApiResult envelope 1겹 언랩.
- `useDmoveQuery`: `envelope.data` 2겹째 언랩 → 조회 훅 `data`는 payload 직접 수신.
- **조회**(getList/getSummary/getDetail/getActivities): 서비스가 envelope 반환 → useDmoveQuery가 2겹 언랩. 소비처 `data?.items`/`data?.total`(목록), `asset.*`(상세), `activities?.items`(이력) — **payload 직접 접근, data.data 과다 언랩 없음**. 정합.
- **변경성**(create/update/exclude/restore/sync): 서비스가 `.then(unwrapEnvelope)`로 payload 반환 + useMutation은 재언랩 안 함 → 소비처 `result.added`/`saved.id` 직접. 정합.

## 4. 에러 계약 (403→200 + body code)

- `unwrapEnvelope`: `status==="error"` **또는** `code!==200`이면 `AssetApiError` throw.
  - 권한거부 `{status:"error", code:403}`(errorCode 없음) → 두 조건 충족 → throw. FE `error.code===403`로 forbidden 메시지 분기(AssetFormModal/AssetListPage/SyncOptionsModal). 정합.
  - ApiError `{status:"error", code:400, errorCode:"ASSET_XXX"}` → throw + errorCode 보존 → `mapErrorToForm`이 errorCode로 폼 에러 매핑. 정합.
  - 성공 `{status:"success", code:200}` → 통과 후 `data` 반환. 정합.
- FE `ASSET_ERROR_CODE` 상수(NOT_FOUND/NAME_REQUIRED/ZABBIX_READ_ONLY/DUPLICATE_PROPERTY_KEY/ZABBIX_DELETE_NOT_SUPPORTED/INVALID_SYNC_MODE) ↔ 계약 §3 errorCode 6종 일치.

## 5. 요청 바디 정합

- **POST /assets**(`buildCreateReq`): name + zabbixData(host/visibleName/status/groups/interfaces/inventory/tags) + customProperties + notes → CreateAssetReqDto와 일치. source 미전송(서버 강제). 정합.
- **PATCH /assets/{id}**(`buildUpdateReq`): **zabbix 자산이면 `{customProperties, notes}`만 전송**(스냅샷 필드 미포함 → ASSET_ZABBIX_READ_ONLY 회피). custom 자산은 name/zabbixData/inventoryMode 포함. UpdateAssetReqDto.touchesSnapshot 계약과 정합.
- **POST /assets/sync**(`SyncOptionsModal`): `{mode, groupIds}`(빈배열→null) → SyncAssetsReqDto와 일치. 정합.

## 6. enum / 상수 정합

| 대상 | BE | FE | 판정 |
|---|---|---|---|
| source | zabbix\|custom | TAssetSource | 정합 |
| sync mode | add_only\|add_update (SyncAssetsReqDto 상수) | TAssetSyncMode / ASSET_SYNC_MODES | 정합 |
| searchField | name\|host\|group\|serial\|tag\|owner (SEARCH_FIELDS) | TAssetSearchField / ASSET_SEARCH_FIELDS | 정합 |
| sortBy | name\|source\|lastSyncedAt\|updatedAt | TAssetSortBy | 정합 |
| live available | available\|unavailable\|unknown | TAssetLiveAvailable / ASSET_LIVE_LABEL_KEY | 정합 |
| activity action | created\|updated\|excluded\|restored\|synced | TAssetActivityAction | 정합 |

---

## 참고 (비결함 관찰 — 수정 불필요)

1. **DELETE deleteFromZabbix 미전송(의도)**: BE는 `deleteFromZabbix`(기본 false) 쿼리를 받고 true면 `ASSET_ZABBIX_DELETE_NOT_SUPPORTED`. FE `excludeAsset`는 이 파라미터를 노출하지 않음(2차 미지원, 죽은 UI 금지 방침). 서버 기본값으로 안전 동작 — 계약 위반 아님.
2. **조회 서비스 함수 반환타입 표기**: `getDetail`/`getSummary`/`getList`/`getActivities`가 `Promise<TAssetDetail>` 등 payload 타입으로 선언돼 있으나 런타임 실제 반환은 envelope(2겹 언랩은 useDmoveQuery가 수행). 코드베이스 공통 관례(useDmoveQuery 언랩 전제)와 일치하며 런타임 정상. 변경성 함수는 `TApiEnvelope<T>`로 정확히 표기 후 unwrapEnvelope 적용. 타입 거짓말이나 기존 패턴 준수 — 결함 아님.
3. **groupName 필터 미배선**: BE·FE 타입 모두 `groupName` 지원하나 AssetListPage 목록 UI에는 배선 안 됨(옵셔널이라 shape 무해). 기능 범위 문제이지 계약 불일치 아님.
