# QA — Assets 데모 개편 Phase 1 · BE↔FE 경계면 정합성 (정적 대조)

> 검증자: integration-qa / 2026-07-09 · 방식: 정적 교차 대조(런타임 아님, 앱 미기동)
> 기준: `contract_assets-demo-reshape.md` + `apply_design_assets-cost-maps.md §1`
> 대상 커밋 상태의 BE(`moveseye-be-spring/asset`) ↔ FE(`moveseyee_fe` asset)

## 결론 요약

- 🔴 **깨짐(breaking) 0건.** 응답 6개 shape(Summary/ListItem/Detail/LiveInfo/LiveProblem + 요청 Create/Update/Sync)이 FE 타입과 **필드명·타입·옵셔널·enum 값·래퍼 깊이 전부 1:1 일치**.
- 🟡 주의 3건 / 🟢 정보 3건 — 전부 **FE 단독 이슈이거나 Phase 2 대기분**이라 현재 화면 파손 없음.
- **cloud_data / cost_data 키 대조 결론: 일치(자기정합).** BE는 free-form Record를 **입력 그대로 저장/직렬화**하므로 키의 진실원천은 FE 상수(`constants/asset.ts`)다. 폼이 쓰는 키 = 상세가 읽는 키 라운드트립이 일관 → **키 불일치로 인한 "-" 표시 버그 없음**. (단 아래 🟡2·🟡3의 소수 orphan/미채움 키 예외)

---

## 1. cloud_data / cost_data 키 대조표 (★최중요 포인트)

BE 저장 경로: `CreateAssetReqDto.cloudData/costData` → `Asset.cloudData/costData`(`@JdbcTypeCode JSON`) → `AssetDetailDto.cloudData/costData`. **키 정의·변형 없이 verbatim 저장.** 따라서 키 정합은 순수 FE 상수 간 라운드트립 문제.

### cost_data (전부 일치 ✅)
| 키 | 폼 write (`AssetFormModal` COST_GROUP) | 상세 read (`AssetDetailFieldGroups` cost) | savedView/BE 참조 |
|---|---|---|---|
| purchase_cost | ✅ | ✅ | — |
| maintenance_cost | ✅ | ✅ | — |
| lease_cost | ✅ | ✅ | — |
| depreciation_cost | ✅ | ✅ | — |
| residual_value | ✅ | ✅ | — |

폼·상세 모두 동일한 `ASSET_DETAIL_COMMON_GROUPS`(origin=cost) 배열을 소비 → 구조적으로 불일치 불가. **완전 일치.**

### cloud_data
| 키 | 폼 write (`ASSET_CLOUD_FORM_FIELDS`) | 상세 read (`ASSET_DETAIL_CLOUD_GROUPS`) | BE 참조 | 정합 |
|---|---|---|---|---|
| account | ✅ | ✅ | — | ✅ |
| region | ✅ | ✅ | — | ✅ |
| resource_id | ✅ | ✅ | — | ✅ |
| arn | ✅ | ✅ | — | ✅ |
| vpc | ✅ | ✅ | — | ✅ |
| subnet | ✅ | ✅ | — | ✅ |
| security_groups | ✅ | ✅ | — | ✅ |
| private_ip | ✅ | ✅ | — | ✅ |
| exposure | ✅ | ✅ | `AssetRepository` savedView `public_access`: `cloud_data->>'exposure' ILIKE 'exposed%'` | ✅ |
| **state** | ✅ (폼만) | ✗ | — | 🟡2 orphan |
| **account_name** | ✗ | ✅ (상세만) | — | 🟡3 미채움 |
| **partition** | ✗ | ✅ (상세만) | — | 🟡3 미채움 |
| **dns_name** | ✗ | ✅ (상세만) | — | 🟡3 미채움 |

- `exposure` 키가 폼→저장→BE savedView 쿼리까지 **동일 키명으로 일관** → public_access 프리셋 정상 동작 확인.
- 겹치는 9개 클라우드 키는 폼 입력값이 상세에서 그대로 표시됨(불일치 없음).

---

## 2. 응답/요청 shape 1:1 대조 (전부 일치 ✅)

| DTO(BE) | FE 타입 | 결과 |
|---|---|---|
| `AssetSummaryDto`(total/zabbixCount/customCount/excludedCount/monitored/unmonitored/lifecycleReview/lastSyncedAt) | `TAssetSummary` | ✅ 8필드 동일 |
| `AssetListItemDto`(+deviceType/resourceType/location/owner/coverage/linkedHostName/lifecycleStatus/deploymentStatus) | `TAssetListItem` | ✅ 20필드 동일 |
| `AssetDetailDto`(+deviceType/coverage/lifecycleStatus/deploymentStatus/resourceType/owner/linkedHostid/linkedHostName/cloudData/costData) | `TAssetDetail` | ✅ 24필드 동일 |
| `LiveInfo`(available/activeProblemCount/status/groups/lastCheck/openProblems) | `TAssetLive` | ✅ 6필드 동일 |
| `LiveProblem`(eventid/name/severity/clock) | `TAssetLiveProblem` | ✅ 4필드 동일 |
| `CreateAssetReqDto` / `UpdateAssetReqDto` | `TCreateAssetReq` / `TUpdateAssetReq` | ✅ 동일 |
| `SyncAssetsResDto` | `TSyncResult` | ✅ v2 보존(added/updated/skipped/total/syncedAt) |

- 옵셔널: 신규 필드 전부 BE nullable(String/Map) ↔ FE `| null`. `cloudData/costData`만 `AssetDetailDto.from`에서 null→`Map.of()`(`{}`) 보장 ↔ FE `Record<...>`(non-null) — 일치.
- `live.status`/`available` 리터럴 유니온 값 대소문자까지 BE 반환값(`resolveStatus`/`resolveAvailable`)과 FE 타입·`ASSET_LIVE_STATUS_TAG_COLOR` 키 동일.
- `severity` = Zabbix 원값 문자열("0"~"5"), FE `string|null` — 일치. openProblems 상한 BE `LIVE_PROBLEM_LIMIT=50` ↔ 계약/타입 주석 "최대 50" 일치.

## 3. enum 값 문자열 일치 (전부 일치 ✅)

| 축 | BE 원천 | FE 상수 | 결과 |
|---|---|---|---|
| device_type 6종 | `DeviceTypeResolver.DEVICE_TYPES` = server/network/security/database/hardware/**notClassified** | `ASSET_DEVICE_TYPE_OPTIONS`·`TAssetDeviceType` 동일 | ✅ camelCase까지 동일 |
| coverage | `AssetDerivation` monitored/unmonitored | `ASSET_COVERAGE_OPTIONS` | ✅ |
| lifecycle | 기본 `active`(free string) | active/planned/retired/expired | ✅ 집합 정합 |
| deployment | 기본 `deployed`(inventory verbatim) | deployed/maintenance/planned/retired/failed | ✅ 집합 정합(🟢1 참조) |
| savedView 4종 | `SearchAssetListDto.SAVED_VIEWS` | `ASSET_SAVED_VIEWS`·`TAssetSavedView` | ✅ |

## 4. 요청 파라미터명 (전부 일치 ✅)

FE `TAssetListParams` / `QueryParamKeys`(deviceType/coverage/resourceType/lifecycle/deployment/owner/savedView/sortBy/sortDirection/limit/offset/keyword/searchField/source/groupName/includeExcluded)
↔ BE `SearchAssetListDto`(@ModelAttribute) 필드명 **완전 동일**. `QueryParamKeys` enum 값도 `"deviceType"` 등 정확히 일치해 URL→listParams→BE 바인딩 체인 정상.
`sortBy` 지원값: BE `sortColumn()` switch가 deviceType/coverage/resourceType/lifecycle/deployment/owner(+lifecycleStatus/deploymentStatus/ownerName 별칭) 처리 ↔ FE `TAssetSortBy` 동일.

## 5. useDmoveQuery 언랩 깊이 (정합 ✅)

- BE: `ApiResult<T>` = `{ status, code, data:<payload>, ... }`(HTTP 200).
- FE Layer1: axios 인터셉터 `response.data` → ApiResult 봉투 반환.
- FE Layer2: `useDmoveQuery`가 `envelope.data` 추출 → **소비자는 payload 직접 수신**.
  - 목록: payload = `PaginationResponseDto{items,total}` ↔ `TResponseList`(items/total) — `data.items`·`data.total` 소비 정상.
  - 요약/상세: payload = DTO 직접. `over-unwrap(data.data) 없음` 확인.
- Mutation(create/update/exclude/restore/sync): `.then(unwrapEnvelope)`로 봉투 1겹만 벗겨 payload 반환 + status/code 검사로 403→200 비즈니스에러 throw. 정합.

## 6. 기존 v2 계약 보존 (파괴적 변경 없음 ✅)

기존 9 EP 경로·기존 필드 전부 유지, 신규는 순수 add-only. `ASSET_ZABBIX_READ_ONLY` 트리거 확장(분류 캐시 편집 거부)은 가법적 — 기존 FE 호출(name/zabbixData/inventoryMode만) 무영향. `AssetFormModal.buildUpdateReq`가 zabbix 자산엔 스냅샷/분류 필드를 아예 안 실어(userOwned만) read-only 규칙과 정합.

---

## 발견 사항 (심각도별)

| # | 심각도 | 항목 | BE 출처 | FE 출처 | 기대 | 실제 | 책임 | 권장 |
|---|---|---|---|---|---|---|---|---|
| 🟡1 | 주의 | cloud `state` 폼 orphan | — | `constants/asset.ts:239`(FORM_FIELDS) vs `:206-231`(DETAIL_GROUPS) | 폼에 입력한 값은 상세에서 보여야 | 폼은 `state` write하나 상세 그룹에 `state` 없음 → 저장돼도 상세 미표시 | fe | DETAIL_CLOUD_GROUPS(AWS identification 등)에 `state` 추가하거나 폼에서 제거 |
| 🟡2 | 주의 | 상세 전용 cloud 키 미채움 | — | `constants/asset.ts:212,213,227`(account_name/partition/dns_name) | 값 표시 | 폼 입력 경로·BE 자동 채움 없음 → Phase1에선 항상 "-" | fe | Phase2 AWS 동기화 전까지 의도된 placeholder면 유지, 아니면 폼에 추가 |
| 🟡3 | 주의 | owner 검색 vs 필터 데이터원천 상이 | `AssetRepository.java:76,109`(searchField=owner→`inventory.poc_1_name`) | `AssetListPage`(owner 필터→`owner` param, 옵션은 `item.owner`) | 동일 owner 개념 | 키워드검색(owner)=inventory poc_1_name, 필터(owner)=owner_name 컬럼 → 서로 다른 소스 | be/fe | v2 계승분. 혼선 방지 위해 라벨 구분 또는 searchField owner를 owner_name 대상으로 통일 검토 |
| 🟢1 | 정보 | deployment 값 free-form | `AssetDerivation.deployment`(inventory verbatim/기본 deployed) | `ASSET_DEPLOYMENT_OPTIONS`(5종) | — | Zabbix inventory의 비표준 deployment_status 값이 오면 FE는 raw+default 색으로 렌더(크래시 없음) | — | 필요 시 매핑/표준화 추가(계약 §1.1 "표준화" 미구현) |
| 🟢2 | 정보 | lifecycleReview NULL 제외 | `AssetRepository.countByExcludedFalseAndLifecycleStatusNot` (`<> 'active'`) | `AssetSummaryHeader` | !=active 집계 | SQL NULL 시맨틱상 lifecycle_status=NULL 행은 미집계. BE가 항상 기본 active 세팅해 실무상 무해 | — | 유지 |
| 🟢3 | 정보 | groupName/includeExcluded/source 등 v2 필터 유지 | `SearchAssetListDto` | `TAssetListParams` | — | 정상 유지 | — | — |

---

## 재검증 필요(런타임/후속)
- functional-qa: 동기화 후 coverage/deployment/device_type 실채움, savedView 4종 카운트 실쿼리, 상세 필드그룹 렌더·live 패널, 폼 편집 소유권(zabbix 자산 분류 필드 read-only 거부) 실동작 검증 권장.
- 🟡1/🟡2 cloud 키 orphan/미채움은 fe-engineer 판단(placeholder 유지 vs 정리) 필요.
