# API 계약 — 자산관리(Assets) 데모 개편 Phase 1 (v2 확장)

> 산출: be-engineer / 2026-07-09 · 대상: `moveseye-be-spring`
> 기준: **실제 구현 코드**(`com.dmove.moveseye.asset` + `domain.Asset` + `common.util.DeviceTypeResolver`).
> 기반 계약: `contract_assets-core.md`(v2, 9 EP) — **경로·응답 골격·에러코드·권한 모두 보존**. 본 문서는 **추가/변경 필드만** 정의.
> 소비자: api-contract-sync · fe-engineer(`services/asset.api.ts`·`types/asset.ts`·`hooks/useAsset.ts`).
> 빌드/테스트: `build -x test` 통과 + `test` 전체 통과(Asset/Sync/DeviceTypeResolver 포함).

---

## 0. 공통 규약 — v2와 동일(변경 없음)

- 응답 래퍼 `ApiResult<T>`, 성공/비즈니스에러 모두 **HTTP 200**(401만 실제 상태코드), 권한거부=200+code403.
- 페이지네이션 `{ items, total }`. 날짜 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`(UTC).
- 권한: 조회=인증 사용자(U), 변경=관리자(A, `AdminAccessChecker.requireAdmin`, userRole 기준).
- **v2의 모든 기존 필드는 그대로 유지**. 아래는 순수 **추가**이며 기존 필드 제거·의미변경 없음.

---

## 1. 파생·소유권 규칙 (신규 필드의 채움/편집 규칙)

### device_type 파생 (공용 유틸 `common.util.DeviceTypeResolver`)
`zabbix_data.tags` 중 `device_type` 태그가 **정확히 1개**이고 그 값(lowercase)이 유효 6종
(`server`|`network`|`security`|`database`|`hardware`|`notClassified`)이면 그 값, 그 외(0개·2개↑·유효값 아님·빈값)는 `notClassified`.
HostService의 기존 분류 로직과 규칙 공유(중복 제거). **동기화가 채우는 캐시**(zabbix 자산 사용자 편집 불가). custom 자산은 사용자 입력.

### coverage 파생
`source=zabbix && zabbix host status='0'(enabled)` → `monitored`, 그 외 → `unmonitored`. custom 자산은 항상 `unmonitored`. 동기화/생성/수정 시 재계산되는 캐시.

### deployment_status 파생
`zabbix_data.inventory.deployment_status` 값, 없으면 기본 `deployed`. 동기화/생성/수정 시 재계산.

### resource_type
`zabbix_data.inventory.type`(세부 기종). custom 생성 시 요청값 우선, 없으면 inventory type.

### 편집 소유권 (PATCH/POST)
| 필드 | zabbix 자산 | custom 자산 |
|---|---|---|
| `name`·`zabbixData`·`inventoryMode`(스냅샷) | ❌ 거부(ASSET_ZABBIX_READ_ONLY) | ✅ |
| `deviceType`·`resourceType`·`linkedHostid`(분류 캐시) | ❌ 거부(ASSET_ZABBIX_READ_ONLY) | ✅ |
| `lifecycleStatus`·`ownerName`·`costData`·`cloudData`(사용자 소유) | ✅ | ✅ |
| `coverage`·`deploymentStatus` | 직접 편집 불가(파생) | 직접 편집 불가(파생, custom은 inventory에서 재계산) |

> ⚠️ zabbix 자산 PATCH에 `deviceType`/`resourceType`/`linkedHostid` 중 하나라도 실리면 스냅샷과 동일하게 `ASSET_ZABBIX_READ_ONLY`(200+code400). 기존 name/zabbixData/inventoryMode 거부 규칙에 **분류 캐시가 추가**된 것(가법적, 기존 FE 호출 무영향).

`owner`는 1차 자유입력(`ownerName`)만. `owner_user_id`는 컬럼만 예약(요청/응답 미노출, 로직 미사용).

### savedView 프리셋 (하드코딩 파생 조건)
| enum | 조건 |
|---|---|
| `unmonitored` | `coverage = 'unmonitored'` |
| `public_access` | `cloud_data->>'exposure' ILIKE 'exposed%'` (cloud_data 없으면 0건 — 정상) |
| `hardware_eol` | `lifecycle_status = 'expired'` (없으면 0건 — 정상) |
| `ownership` | `owner_name IS NULL OR owner_name = ''` (owner 미지정 검토) |

데이터 원천이 없으면 **0건이어도 정상**(빈 프리셋 허용).

---

## 2. 엔드포인트별 변경 (v2 대비 델타)

### EP2. `GET /assets/summary` — U
`AssetSummaryDto` — **유지**: `total`·`zabbixCount`·`customCount`·`excludedCount`·`lastSyncedAt`.
**추가**:
```ts
monitored: number;        // coverage='monitored' (excluded 제외)
unmonitored: number;      // coverage='unmonitored' (excluded 제외)
lifecycleReview: number;  // lifecycle_status != 'active' (excluded 제외)
```
> monitored/unmonitored/lifecycleReview는 excluded=false만 집계. coverage 미파생(동기화 전) 자산은 어느 쪽에도 안 잡힘(합이 total보다 작을 수 있음).

### EP1. `GET /assets` — U
**추가 쿼리 파라미터**(전부 옵셔널, blank=무시):
| param | 타입 | 비고 |
|---|---|---|
| `deviceType` | string | 정확 일치(server\|network\|security\|database\|hardware\|notClassified) |
| `coverage` | string | monitored\|unmonitored |
| `resourceType` | string | 정확 일치(inventory type) |
| `lifecycle` | string | lifecycle_status 정확 일치 |
| `deployment` | string | deployment_status 정확 일치 |
| `owner` | string | owner_name **정확 일치** |
| `savedView` | string | unmonitored\|public_access\|hardware_eol\|ownership. 미지원/blank=무시 |

**`sortBy` 추가 지원값**: 기존 `name`\|`source`\|`lastSyncedAt`\|`updatedAt` + `deviceType`\|`coverage`\|`resourceType`\|`lifecycle`(=lifecycleStatus)\|`deployment`(=deploymentStatus)\|`owner`(=ownerName). 미지원 → `updatedAt`.
기존 파라미터(`limit`/`offset`/`keyword`/`searchField`/`source`/`groupName`/`includeExcluded`/`sortDirection`)는 **그대로 유지**.

**`AssetListItemDto` — 추가 필드**(기존 필드 전부 유지):
```ts
deviceType: string | null;       // 미파생 시 null
resourceType: string | null;     // resource_type, 없으면 inventory type 폴백
location: string | null;         // inventory.location
owner: string | null;            // owner_name
coverage: string | null;         // monitored|unmonitored, 미파생 시 null
linkedHostName: string | null;   // zabbixData.visibleName(없으면 host)
lifecycleStatus: string | null;  // 기본 active
deploymentStatus: string | null; // 없으면 null
```
기존 유지: `id`·`source`·`name`·`zabbixHostid`·`groupNames`·`inventoryType`·`inventoryOs`·`tagCount`·`customPropertyCount`·`excluded`·`lastSyncedAt`·`updatedAt`.

### EP3. `GET /assets/{id}` — U
**`AssetDetailDto` — 추가 필드**(기존 필드 전부 유지):
```ts
deviceType: string | null;
coverage: string | null;
lifecycleStatus: string | null;   // 기본 active
deploymentStatus: string | null;
resourceType: string | null;      // 없으면 inventory type 폴백
owner: string | null;             // owner_name
linkedHostid: string | null;      // zabbix 자산은 zabbix_hostid와 동일
linkedHostName: string | null;
cloudData: Record<string, unknown>;  // 비어있으면 {} (null 아님)
costData: Record<string, unknown>;   // 비어있으면 {} (null 아님)
```
기존 유지: `id`·`source`·`name`·`zabbixHostid`·`zabbixData`·`inventoryMode`·`customProperties`·`notes`·`excluded`·`lastSyncedAt`·`createdAt`·`updatedAt`·`recentActivities`.

**`live` 확장**(source=zabbix만, 실패 시 여전히 `null`). 기존 `available`·`activeProblemCount` 유지 + 추가:
```ts
live: {
  available: "available" | "unavailable" | "unknown";  // 유지
  activeProblemCount: number;                           // 유지 (= openProblems 원소 수)
  status: "Healthy" | "Degraded" | "Unavailable" | "Unknown";  // 신규 파생
  groups: string[];                    // 신규: 호스트그룹명
  lastCheck: string | null;            // 신규: 최신 아이템 lastclock ISO, 없으면 null
  openProblems: {                      // 신규: 활성 problem 목록(최대 50)
    eventid: string | null;
    name: string | null;
    severity: string | null;           // Zabbix 원값 문자열("0"~"5")
    clock: string | null;              // ISO-UTC
  }[];
} | null;
```
> status 파생: available='unavailable'→Unavailable, 'unknown'→Unknown, 문제 없으면 Healthy, 있으면 Degraded.

### EP5. `POST /assets` — A (custom 생성)
`CreateAssetReqDto` — 기존(`name`*·`zabbixData`?·`inventoryMode`?·`customProperties`?·`notes`?) + **추가**(모두 옵셔널):
```ts
deviceType?: string;       // custom 사용자 소유
resourceType?: string;     // 없으면 inventory type 폴백
linkedHostid?: string;
lifecycleStatus?: string;  // 없으면 'active'
ownerName?: string;
costData?: Record<string, unknown>;
cloudData?: Record<string, unknown>;
```
응답 `AssetDetailDto`(coverage='unmonitored', deployment=inventory 파생/기본 deployed, live=null, recentActivities=[]).

### EP6. `PATCH /assets/{id}` — A
`UpdateAssetReqDto` — 기존 필드 + **추가**(모두 옵셔널, null=미변경): `deviceType`?·`resourceType`?·`linkedHostid`?·`lifecycleStatus`?·`ownerName`?·`costData`?·`cloudData`?.
소유권 규칙은 §1 표 참조. custom 자산은 수정 시 coverage/deployment 재파생. 응답 `AssetDetailDto`.

### EP9. `POST /assets/sync` — A
요청/응답 shape **변경 없음**(`SyncAssetsReqDto`/`SyncAssetsResDto` 동일). 동작만 확장: upsert 시 `device_type`(tags 파생)·`coverage`(status 파생)·`deployment_status`(inventory)·`resource_type`(inventory type)·`linked_hostid`(=hostid) 채움. 사용자 소유 필드(lifecycle/owner/cost/cloud)는 갱신에서 보존.

### EP4·7·8 (activities/delete/restore) — 변경 없음.

---

## 3. 에러코드 — v2와 동일

추가 없음. `ASSET_ZABBIX_READ_ONLY`의 **트리거가 확장**됨: zabbix 자산에 스냅샷(name/zabbixData/inventoryMode) 또는 분류 캐시(deviceType/resourceType/linkedHostid) 편집 시도 시 발생(200+code400).

---

## 4. 데이터모델(Flyway V6) — 참고

`asset` 테이블 추가 컬럼(멱등 ADD COLUMN IF NOT EXISTS): `device_type`·`coverage`·`resource_type`·`lifecycle_status`(DEFAULT 'active')·`deployment_status`·`owner_name`·`owner_user_id`(int, 예약)·`linked_hostid`·`cloud_data`(jsonb '{}')·`cost_data`(jsonb '{}'). 인덱스 `idx_asset_device_type`/`idx_asset_coverage`/`idx_asset_lifecycle`.

## 5. FE 반영 메모
- 신규 필드 전부 **nullable**(동기화 전/custom 미입력 시 null). `cloudData`/`costData`만 예외로 `{}` 보장(null 아님).
- `live.openProblems[].severity`는 Zabbix 원값 문자열, `clock`/`lastCheck`는 ISO. `groups`는 항상 배열.
- savedView는 목록 필터 프리셋 파라미터. 4종 카운트는 각 프리셋으로 `GET /assets?savedView=...&limit=1` 호출해 `total`로 얻거나, FE에서 필터 적용.
