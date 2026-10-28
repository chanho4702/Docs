# API 계약 — 자산관리(Assets) 코어 (V6 데모 개편 반영)

> 대상: `moveseye-be-spring` (Spring Boot 3.3) · 패키지 `com.dmove.moveseye.asset`
> 기준: **실제 구현 코드가 진실**(AssetController + dto 9종 + AssetDerivation + domain). 설계서(`devdesign_assets-core.md`)는 방향성 참조.
> 소비자: api-contract-sync · fe-engineer(`moveseyee_fe` `services/asset.api.ts`·`types/asset.ts`·`hooks/useAsset.ts`)

## 개정 이력
| 버전 | 날짜 | 변경 |
|---|---|---|
| v1 | 2026-07-08 | 최초 산출(자산 코어 1차, 단순 스냅샷 모델). |
| **v2** | **2026-07-13** | **V6 "데모 개편" 반영 — 분류 축(deviceType/coverage/resourceType/lifecycleStatus/deploymentStatus/owner) + 클라우드/비용 확장(cloudData/costData) + savedView 프리셋 + summary KPI 3종 + live 우측 패널 확장을 실제 코드 기준으로 재산출. offset 페이지네이션 정확성 수정(OffsetBasedPageRequest) 반영. footgun 명문화.** |

> ⚠️ v1 대비 응답 DTO가 **가산적으로 확장**됐다(기존 필드명/타입 불변, 필드 추가). FE의 기존 필드 읽기는 안전하나, 신규 필드(KPI·컬럼·필터·live 패널)를 쓰려면 FE 타입 보강 필요.

---

## 0. 공통 응답 규약 (전 엔드포인트)

모든 응답은 `ApiResult<T>`로 래핑되며 **성공/실패 모두 HTTP 200**(단, 인증 실패 401만 실제 상태코드). 기존 FE 계약 보존 규칙이다.

### 성공 envelope
```jsonc
{ "status": "success", "code": 200, "data": <T>, "syncTime": "..." }
```
- `message`/`errorCode`는 성공 시 생략(NON_NULL 래퍼). `syncTime`은 전역 인터셉터 주입(문자열/null), `data`와 별개.

### 비즈니스 에러 envelope (HTTP 200)
```jsonc
{ "status": "error", "code": 400, "errorCode": "ASSET_XXX", "message": "ASSET_XXX" }
```
- **권한 거부**: `AdminAccessChecker.requireAdmin` → `ForbiddenError` → `{status:"error", code:403, message:"Access Denied"}` (errorCode 없음/null).
- **미인증**: JWT 필터/`@VisitorIdCheck` 단계에서 **HTTP 401** 선행(컨트롤러 코드 도달 전).

### Pagination envelope (목록/이력의 `data`)
```jsonc
{ "items": [ <item>... ], "total": <number> }   // limit/offset 필드 없음. total은 countQuery로 산출(정확).
```

### 날짜 직렬화
- 엔티티 유래 날짜(`lastSyncedAt`·`createdAt`·`updatedAt`·`activity.createdAt`)는 `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` → 예 `"2026-07-08T05:13:45.076Z"`. null 가능 필드는 `null`.
- `POST /assets/sync` 응답의 `syncedAt`은 이미 문자열로 만들어진 값(동일 ISO-UTC 포맷). 동기화가 기록한 엔티티 `lastSyncedAt`과 **같은 UTC 순간**(단일 `Instant`에서 파생, UTC 벽시계 저장).
- ⚠️ `createdAt`/`updatedAt`은 `@CreationTimestamp`/`@UpdateTimestamp`(JVM 기본존)로 생성 → **서버가 UTC일 때만** `'Z'` 표기와 값이 일치(CLAUDE.md #4 전역 UTC 전제). `lastSyncedAt`만 명시적 UTC 정규화됨(둘이 섞여 있으니 비UTC 서버에선 어긋날 수 있음).

---

## 1. 공유 타입 (중첩 DTO)

### AssetZabbixData  (`zabbixData` — 상세/생성/수정에서 노출·입력)
```ts
type TAssetZabbixData = {
  host: string | null;
  visibleName: string | null;
  status: string | null;       // "0"(enabled)|"1"(disabled) 문자열 / custom=null
  groups: { groupid: string | null; name: string | null }[];
  interfaces: { type: string | null; ip: string | null; dns: string | null; port: string | null; main: string | null }[];
  inventory: Record<string, string>;   // Zabbix 표준 inventory 키→값(값 있는 것만). custom=사용자 Map
  tags: { tag: string | null; value: string | null }[];
};
```
- 하위 스칼라는 전부 Zabbix 원값을 **문자열**로 보존(숫자도 문자열). 컬렉션은 항상 배열(빈 배열 가능, null 아님 — record accessor가 non-null 보장).

### AssetCustomProperty
```ts
type TAssetCustomProperty = { key: string | null; value: string | null };
```

### AssetActivityChange  (activity.changes 원소)
```ts
type TAssetActivityChange = { field: string; before: string | null; after: string | null };
```

### AssetActivity (`AssetActivityDto`)
```ts
type TAssetActivity = {
  id: number;
  assetId: number;
  action: "created" | "updated" | "excluded" | "restored" | "synced";  // ⚠️ "synced"는 현재 미생성(footgun ④)
  actorType: "user" | "system";       // 1차는 전부 "user"
  actorName: string | null;
  changes: TAssetActivityChange[];     // updated만 비지 않음, 그 외 []
  createdAt: string;                   // ISO
};
```

---

## 2. 엔드포인트

공통 헤더: `Authorization: Bearer <token>`, `x-visitor-id`(@VisitorIdCheck). prefix `/assets`.
권한: **U**=인증 사용자, **A**=관리자(`userRole ∈ {ADMIN, SUPER_ADMIN}`, roleid 아님 — `AdminAccessChecker.requireAdmin`).

| # | Method | Path | 권한 |
|---|---|---|---|
| 1 | GET | `/assets` | U |
| 2 | GET | `/assets/summary` | U |
| 3 | GET | `/assets/{id}` | U |
| 4 | GET | `/assets/{id}/activities` | U |
| 5 | POST | `/assets` | A |
| 6 | PATCH | `/assets/{id}` | A |
| 7 | DELETE | `/assets/{id}` | A |
| 8 | PATCH | `/assets/{id}/restore` | A |
| 9 | POST | `/assets/sync` | A |

---

### 1) GET `/assets` — 목록 · U
Query params (`@ModelAttribute SearchAssetListDto`, 전부 옵셔널):

| param | 타입 | 기본 | 비고 |
|---|---|---|---|
| `limit` | int | 20 | 1~100 클램프(≤0 또는 null → 20, >100 → 100) |
| `offset` | int | 0 | 음수/null → 0. **임의 값 정확 적용**(배수 아니어도 됨 — footgun ③) |
| `keyword` | string | — | blank이면 검색 없음(trim) |
| `searchField` | string | `name` | `name`\|`host`\|`group`\|`serial`\|`tag`\|`owner`. 미지원 → `name`. **serial=inventory.serialno_a, owner=inventory.poc_1_name(⚠️ owner 필터/응답 owner와 다른 원천), group/tag=jsonb ILIKE** |
| `source` | string | — | `zabbix`\|`custom`. 그 외/blank → 무시 |
| `groupName` | string | — | zabbixData.groups[].name **정확 일치**(대소문자 구분) |
| `includeExcluded` | boolean | false | false면 `excluded=false`만 |
| `sortBy` | string | `updatedAt` | `name`\|`source`\|`lastSyncedAt`\|`updatedAt`\|`deviceType`\|`coverage`\|`resourceType`\|`lifecycle`(=`lifecycleStatus`)\|`deployment`(=`deploymentStatus`)\|`owner`(=`ownerName`). 미지원 → `updatedAt`. (2차 정렬키 `id DESC` 항상 append) |
| `sortDirection` | string | `desc` | `asc`\|`desc` |
| `deviceType` | string | — | `server`\|`network`\|`security`\|`database`\|`hardware`\|`notClassified` 컬럼 정확 일치. blank → 무시 |
| `coverage` | string | — | `monitored`\|`unmonitored` 컬럼 정확 일치. blank → 무시 |
| `resourceType` | string | — | resource_type 컬럼 정확 일치. blank → 무시 |
| `lifecycle` | string | — | lifecycle_status 컬럼 정확 일치. blank → 무시 |
| `deployment` | string | — | deployment_status 컬럼 정확 일치. blank → 무시 |
| `owner` | string | — | owner_name 컬럼 **정확 일치**(⚠️ searchField=owner의 inventory.poc_1_name ILIKE와 별개). blank → 무시 |
| `savedView` | string | — | 프리셋 4종(아래). 그 외/blank → 무시 |

**savedView 프리셋**(하드코딩 파생, 데이터 없으면 0건 정상):
- `unmonitored` → `coverage = 'unmonitored'`
- `public_access` → `cloud_data->>'exposure' ILIKE 'exposed%'`
- `hardware_eol` → `lifecycle_status = 'expired'`
- `ownership` → `owner_name IS NULL OR owner_name = ''`

`data`: `Pagination<AssetListItemDto>` — `{ items: TAssetListItem[], total: number }`
```ts
type TAssetListItem = {
  // ── v1 기존 12필드 ──
  id: number;
  source: "zabbix" | "custom";
  name: string;
  zabbixHostid: string | null;
  groupNames: string[];            // zabbixData.groups[].name 평탄화
  inventoryType: string | null;    // zabbixData.inventory["type"]
  inventoryOs: string | null;      // zabbixData.inventory["os"]
  tagCount: number;                // zabbixData.tags 길이
  customPropertyCount: number;     // customProperties 길이
  excluded: boolean;
  lastSyncedAt: string | null;     // ISO
  updatedAt: string;               // ISO
  // ── V6 추가 8필드 ──
  deviceType: string | null;       // 미파생 시 null(⚠️ zabbix는 notClassified 기본, custom 미설정은 null)
  resourceType: string | null;     // entity.resourceType ?? inventory["type"] (파생 폴백)
  location: string | null;         // zabbixData.inventory["location"]
  owner: string | null;            // ⚠️ entity.ownerName의 응답 별칭(요청은 ownerName — footgun ①)
  coverage: string | null;         // "monitored"|"unmonitored" — 응답 전용 파생 필드(footgun ②)
  linkedHostName: string | null;   // zabbixData.visibleName || zabbixData.host
  lifecycleStatus: string | null;  // 기본 "active"
  deploymentStatus: string | null; // 응답 전용 파생 필드(inventory.deployment_status 매핑, footgun ②)
};  // 총 20필드
```
에러: 파라미터 바인딩 실패 시 HTTP 200 + code 400.

---

### 2) GET `/assets/summary` — 요약 · U
`data`: `AssetSummaryDto` — **8필드**(v1은 5필드, monitored/unmonitored/lifecycleReview 추가)
```ts
type TAssetSummary = {
  total: number;            // 전체(excluded 포함)
  zabbixCount: number;      // source=zabbix
  customCount: number;      // source=custom
  excludedCount: number;    // excluded=true
  monitored: number;        // coverage=monitored (excluded 제외)  ★V6
  unmonitored: number;      // coverage=unmonitored (excluded 제외) ★V6
  lifecycleReview: number;  // lifecycle_status != 'active' (excluded 제외) ★V6
  lastSyncedAt: string | null;   // 전 자산 중 max(lastSyncedAt). 동기화 자산 없으면 null
};
```
- ⚠️ `monitored + unmonitored ≤ (total − excludedCount)` — coverage가 null인 자산(pre-V6 미백필 등)은 어느 쪽에도 안 잡힘.

---

### 3) GET `/assets/{id}` — 상세 · U
Path `id`(int). `data`: `AssetDetailDto` — **24필드**(v1 13 + V6 확장 + live/recentActivities)
```ts
type TAssetDetail = {
  // ── v1 기존 ──
  id: number;
  source: "zabbix" | "custom";
  name: string;
  zabbixHostid: string | null;
  zabbixData: TAssetZabbixData;
  inventoryMode: string | null;    // "-1"|"0"|"1" 등 문자열
  customProperties: TAssetCustomProperty[];
  notes: string | null;
  excluded: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // ── V6 확장 ──
  deviceType: string | null;
  coverage: string | null;         // 응답 전용 파생
  lifecycleStatus: string | null;  // 기본 active
  deploymentStatus: string | null; // 응답 전용 파생
  resourceType: string | null;     // entity.resourceType ?? inventory["type"]
  owner: string | null;            // ⚠️ ownerName 응답 별칭(footgun ①)
  linkedHostid: string | null;     // zabbix 자산은 zabbix_hostid와 동일
  linkedHostName: string | null;   // visibleName || host
  cloudData: Record<string, unknown>;  // 비어있으면 {} (null 아님)
  costData: Record<string, unknown>;   // 비어있으면 {} (null 아님)
  // ── 실시간/이력 ──
  live: TAssetLive | null;
  recentActivities: TAssetActivity[];   // 최근 5건(최신순)
};

type TAssetLive = {   // LiveInfo — v1은 {available, activeProblemCount} 2필드 → V6 6필드
  available: "available" | "unavailable" | "unknown";
  activeProblemCount: number;
  status: "Healthy" | "Degraded" | "Unavailable" | "Unknown";  // ★V6 파생(available+problem 기반)
  groups: string[];                       // ★V6 호스트그룹명(live host.get)
  lastCheck: string | null;               // ★V6 최신 아이템 수집 ISO(없으면 null)
  openProblems: TAssetLiveProblem[];       // ★V6 활성 problem 목록(최대 50)
};

type TAssetLiveProblem = { eventid: string | null; name: string | null; severity: string | null; clock: string | null };  // clock=ISO-UTC
```
- `live`: source=zabbix일 때만 Zabbix 실시간 보강(host.get + problem.get, try-catch). **호출 실패/미가동 시 `null`**. custom 자산은 항상 `null`.
- `status` 파생: available=unavailable→`"Unavailable"`, unknown→`"Unknown"`, 그 외 problem 있으면 `"Degraded"` 없으면 `"Healthy"`.
- 에러: 없는 id → `ASSET_NOT_FOUND`.

---

### 4) GET `/assets/{id}/activities` — 이력 목록 · U
Path `id`(int). Query: `limit`(기본 20, 1~100 클램프), `offset`(기본 0, 음수→0, **임의 값 정확 적용**).
`data`: `Pagination<AssetActivityDto>` — `{ items, total }` (최신순). 에러: 없는 id → `ASSET_NOT_FOUND`.

---

### 5) POST `/assets` — custom 자산 생성 · **A**
Body (`CreateAssetReqDto`, 12필드):
```ts
type TCreateAssetReq = {
  name: string;                              // 필수(@NotBlank; 서비스도 blank 시 ASSET_NAME_REQUIRED)
  zabbixData?: TAssetZabbixData | null;      // 미지정 시 빈 스냅샷
  inventoryMode?: string | null;
  customProperties?: TAssetCustomProperty[]; // key 중복 금지
  notes?: string | null;
  // ── V6 (custom 사용자 소유) ──
  deviceType?: string | null;                // 미지정 시 저장값 null(⚠️ zabbix 동기화는 notClassified)
  resourceType?: string | null;              // 미지정 시 inventory["type"]로 파생
  linkedHostid?: string | null;
  lifecycleStatus?: string | null;           // 미지정 시 "active"
  ownerName?: string | null;                 // ⚠️ 요청은 ownerName(응답은 owner — footgun ①)
  costData?: Record<string, unknown> | null; // 미지정 시 {}
  cloudData?: Record<string, unknown> | null;// 미지정 시 {}
};
```
- `source`는 서버가 항상 `custom` 강제(요청에 실려도 무시). `coverage`는 항상 `unmonitored`, `deploymentStatus`는 inventory.deployment_status(없으면 `deployed`)로 **서버 파생**(요청 불가).
- `data`: `AssetDetailDto`(`live=null`, `recentActivities=[]`). Activity `created` 기록.
- 에러: 403 · `name` blank → @NotBlank code 400 또는 `ASSET_NAME_REQUIRED` · `ASSET_DUPLICATE_PROPERTY_KEY`.

---

### 6) PATCH `/assets/{id}` — 수정 · **A**
Path `id`(int). Body (`UpdateAssetReqDto`, 12필드 — null=미변경):
```ts
type TUpdateAssetReq = {
  name?, zabbixData?, inventoryMode?, customProperties?, notes?,
  deviceType?, resourceType?, linkedHostid?, lifecycleStatus?, ownerName?, costData?, cloudData?  // 타입은 Create와 동일
};
```
**편집 소유권 분리(서비스 강제)**:
- **사용자 소유(zabbix+custom 공통, 항상 편집 가능)**: `customProperties`·`notes`·`lifecycleStatus`·`ownerName`·`costData`·`cloudData`.
- **동기화/파생 소유(zabbix 자산에선 편집 거부)**: 스냅샷 `name`·`zabbixData`·`inventoryMode`, 분류 캐시 `deviceType`·`resourceType`·`linkedHostid`.
  - **zabbix 자산**에 위 필드가 하나라도 실리면 → `ASSET_ZABBIX_READ_ONLY`(저장·이력 없음). (`touchesSnapshot()` = name/zabbixData/inventoryMode, `touchesDerivedClassification()` = deviceType/resourceType/linkedHostid)
  - **custom 자산**: 위 필드도 전부 편집 가능. 저장 후 `coverage`(항상 unmonitored)·`deploymentStatus`(inventory 재파생)는 **서버가 재계산**.
- 실제 변경점이 있을 때만 Activity `updated`(diff `changes[]`) 기록. 변경 없으면 no-op(이력 미기록).
- `data`: `AssetDetailDto`(live=null, recentActivities=[]).
- 에러: 403 · `ASSET_NOT_FOUND` · `ASSET_ZABBIX_READ_ONLY` · `ASSET_DUPLICATE_PROPERTY_KEY`.

---

### 7) DELETE `/assets/{id}` — 관리대상 제외(soft delete) · **A**
Path `id`(int). Query: `deleteFromZabbix`(boolean, 기본 false).
- `excluded=true`. Activity `excluded`. `data`: `AssetDetailDto`.
- `deleteFromZabbix=true` → `ASSET_ZABBIX_DELETE_NOT_SUPPORTED`(2차 미지원, 조회조차 안 함).
- 에러: 403 · `ASSET_NOT_FOUND` · `ASSET_ZABBIX_DELETE_NOT_SUPPORTED`.

---

### 8) PATCH `/assets/{id}/restore` — 제외 복원 · **A**
Path `id`(int). Body 없음. `excluded=false`. Activity `restored`. `data`: `AssetDetailDto`. 에러: 403 · `ASSET_NOT_FOUND`.

---

### 9) POST `/assets/sync` — 동기화 · **A**
Body (`SyncAssetsReqDto`):
```ts
type TSyncAssetsReq = {
  mode: "add_only" | "add_update";   // 필수
  groupIds?: string[] | null;        // null/빈배열=전체 호스트그룹
};
```
- 동작: Zabbix `host.get`(groupids 옵션, selectGroups/Interfaces/Inventory=extend/Tags) → `zabbix_hostid` upsert.
  - 신규 → `source=zabbix` 생성 + Activity `created`(actorType=user). 파생(deviceType/coverage/resourceType/deploymentStatus/linkedHostid) 동기화 계산, lifecycle="active".
  - 기존 + `add_update` → 스냅샷(name·zabbixData·inventoryMode·lastSyncedAt) + 파생 캐시 갱신. **customProperties/notes/excluded/lifecycle/owner/cost/cloud 불변**. 이력 미기록.
  - 기존 + `add_only` → skip.
  - `excluded=true` → mode 불문 무조건 skip(제외 유지).
  - Zabbix에서 사라진 호스트(DB엔 있음) → 1차 무처리.
- **트랜잭션**: 전체 단일 트랜잭션. Zabbix 호출은 DB 쓰기 전 수행 — 실패 시 예외 전파 + DB 무변경(롤백).
- `data`: `SyncAssetsResDto`
```ts
type TSyncResult = {
  added: number;    // 신규 생성
  updated: number;  // 스냅샷 갱신
  skipped: number;  // excluded + add_only의 기존 자산
  total: number;    // added+updated+skipped (= host.get 조회 호스트 수)
  syncedAt: string; // ISO-UTC 문자열(끝 "Z")
};
```
- 에러: 403 · `mode` 미지정/오타 → `ASSET_INVALID_SYNC_MODE`(Zabbix 미호출) · Zabbix 실패 시 그 예외(대개 `INVALID_TOKEN`/HTTP200 or 401).

---

## 3. 에러코드 요약 (전부 ApiError → HTTP 200 + code 400 + errorCode=문자열)

| errorCode | 발생 |
|---|---|
| `ASSET_NOT_FOUND` | 존재하지 않는 id (3·4·6·7·8) |
| `ASSET_NAME_REQUIRED` | 생성 시 name blank(서비스 레벨). @NotBlank가 먼저 잡으면 code 400 + 검증 메시지 |
| `ASSET_ZABBIX_READ_ONLY` | zabbix 자산에 스냅샷/분류캐시 필드 수정 시도 (6) |
| `ASSET_DUPLICATE_PROPERTY_KEY` | customProperties key 중복 (5·6) |
| `ASSET_ZABBIX_DELETE_NOT_SUPPORTED` | DELETE `?deleteFromZabbix=true` (7) |
| `ASSET_INVALID_SYNC_MODE` | sync mode 누락/오타 (9) |
| `ASSET_SOURCE_IMMUTABLE`·`ASSET_ZABBIX_CREATE_NOT_ALLOWED` | ErrorCode에 정의됨(방어용). 현 경로에선 source 강제·POST=custom 전용으로 선차단되어 직접 노출 드묾 |
| (권한) | `AdminAccessChecker` 거부 → **errorCode 없이** code 403 + message `"Access Denied"` (5~9) |

---

## 4. FE 반영 메모 & footgun

### footgun (반드시 인지)
1. **응답 `owner` ↔ 요청 `ownerName` 필드명 비대칭**: 목록/상세 응답은 `owner`, Create/Update 요청은 `ownerName`. FE 폼↔표시 매핑 필요.
2. **응답 전용 파생 필드**: `coverage`·`deploymentStatus`·`owner`(그리고 목록의 `location`·`linkedHostName`·`resourceType` 폴백)는 서버 파생이라 **요청 바디에 대응 필드가 없거나 이름이 다르다**. `coverage`는 요청 불가(source·status로 서버 결정), `deploymentStatus`는 `zabbixData.inventory.deployment_status`에서 파생(직접 요청 불가), `owner`는 요청 `ownerName`의 응답 별칭.
3. **offset 정확 적용(2026-07-13 수정)**: `OffsetBasedPageRequest` 도입으로 목록/이력 `offset`이 **임의 정수로 정확히** 적용된다(과거엔 `offset/limit` 정수 나눗셈으로 limit 배수로 내림 → 예: limit20·offset25가 offset20으로 어긋남). 이제 FE가 배수가 아닌 offset(무한스크롤 증분 등)을 보내도 정확. `total`은 countQuery로 별도 산출.
4. **활동 액션 `synced`는 현재 미생성**: 동기화 생성 자산은 `created`, 동기화 갱신은 이력 미기록. `synced`는 enum/타입에만 존재하는 **2차 sync_run 예약값**(FE는 방어적으로 포함하되 실제로는 안 옴).
5. **searchField=`owner`(inventory.poc_1_name ILIKE) ≠ `owner` 필터(owner_name 컬럼 정확일치) ≠ 응답 `owner`(ownerName)**: 세 곳의 owner가 서로 다른 원천이다.

### 소비 규약
- 성공 소비는 `useDmoveQuery` 언랩 2겹 후 `data`(위 `<T>`) 직접 수신 — 목록/이력은 `{items,total}`, 상세/변경은 `TAssetDetail`, 동기화는 `TSyncResult`.
- `zabbixData`·`live`·`inventory` 스칼라가 전부 **문자열**(숫자 아님). `inventory`·`cloudData`·`costData`는 객체(빈값 `{}`), 컬렉션은 빈 배열(null 아님).
- `live`는 zabbix 자산이라도 `null` 가능(Zabbix 미가동) → optional 처리 필수. `live.lastCheck`도 null 가능.
- 변경성 동작(생성/수정/제외/복원/동기화) 버튼은 관리자(`isSuperRole`)에게만. 비관리자 호출은 HTTP 200 이지만 `status:"error", code:403`.

---

## 🔄 FE 요청사항

> COLLAB.md §3 규약. Codex는 작업 시작 시 이 섹션을 먼저 확인한다.

- [x] **(2026-08-03, Claude) A-1 — `POST /assets`가 HTTP 500을 낸다(custom 자산 생성 불가)** 🔴

  dev 프로필 BE(:3000, 도커 DB 5433)에서 custom 자산 생성이 전부 실패한다.

  - 재현: `POST /assets` 에 **`{"name":"__mock_min_test__"}`** (최소 payload)만 보내도 동일.
  - 응답: `HTTP 500` + `{"statusCode":500,"message":"Internal server error"}`
    — 이 API의 에러 계약(200 + body `code`)도 아니고, `GlobalExceptionHandler`를 타지 않은 형태다.
  - 같은 세션·같은 쿠키로 `GET /assets`(200) · `GET /costs/hw`(200) · `GET /costs/hw/template`(200) ·
    `POST /costs/hw/bulk-upload`(200, 79행 전건 성공)은 **정상** — 인증·DB·BE 기동 문제가 아니라 이 EP 한정이다.
  - PK 시퀀스 고갈은 아니다: `asset_id_seq.last_value=164` > `max(asset.id)=155` (실측).
  - 영향: 자산 관리의 custom 자산 등록 화면이 동작하지 않는다. 목업 데이터 투입도 이 경로로는 막힌다.
  - 확인 필요: BE 스택트레이스(이 프로세스는 Claude가 띄우지 않아 stdout 접근 불가).

  **범위 한정 (2026-08-03 추가 실측)** — 결함은 **`POST` 경로 한정**이다:
  - ✅ `PATCH /assets/{id}` 는 **정상**(200). `notes`·`ownerName`·`lifecycleStatus`·`resourceType`·`costData`
    전부 반영되고 `asset_activity` diff도 남는다. 자산 79건 일괄 PATCH를 **79/79 성공**으로 실측했다.
  - ✅ `GET /assets/{id}`(= 같은 `AssetDetailDto` 조립) · `GET /assets/{id}/activities` 도 200.
    → `AssetDetailDto.from()` 직렬화나 인증·DB 문제가 아니라 **생성 경로(`AssetService.create`)에 한정**된다.
  - `POST`는 **순수 ASCII 최소 본문**(`{"name":"mock_min_ascii_probe"}`)에서도 500이다 — 본문 내용과 무관하다.

  > ⚠️ **오탐 주의(조사자에게)**: Git Bash에서 `curl -d '{"notes":"한글"}'` 처럼 **인라인 한글**을 보내면
  > cp949로 나가 BE가 UTF-8 파싱에 실패해 **500**이 난다. 이건 BE 결함이 아니라 클라이언트 인코딩 문제다.
  > 재현 시 `--data-binary @file`(UTF-8 파일) 또는 `\uXXXX` 이스케이프를 쓸 것 — 둘 다 200이다.

  - **(2026-08-03, Codex) 반영 완료:** `AssetService.create`가 생략된 `customProperties`를 DB의 JSONB
    `NOT NULL` 컬럼에 명시적 `null`로 INSERT하던 원인이었다. 생성 경로에서만 `[]`로 정규화했다.
  - **런타임 확인:** dev DB에서 최소 본문 `{ "name": "..." }`으로 HTTP 200, 응답 `customProperties=[]`를 확인했다.
    PATCH에서 `customProperties` 생략은 기존의 "미변경" 의미를 그대로 유지한다.

- [x] **(2026-08-03, Codex → Claude · 2026-08-05 처리) A-2 — 자산 생성 요청 타입의 Zabbix 생성 필드 동기화**

  BE `CreateAssetReqDto`에는 `createInZabbix?: boolean`과 `zabbixHost?: HostCreateReqDto`가 있고
  `AssetFormModal`도 두 필드를 조건부 spread로 이미 전송하지만, FE `TCreateAssetReq`와 본 계약의 요청 타입에는 빠져 있다.
  FE 타입에 `createInZabbix?: boolean`, `zabbixHost?: THostCreateReq`를 추가해 현재의 타입 우회를 제거할 것.

  - **처리:** `TCreateAssetReq`에 두 필드 추가. `zabbixHost`는 BE와 같이 **호스트 등록 관리의
    `THostCreateReq`를 재사용**한다(규칙이 두 화면에서 갈라지지 않게).
  - 🔴 **타입을 붙이자 실제 불일치가 드러났다.** `interface`에 `null`이 실릴 수 있는데
    `THostCreateReq.interface`는 `THostInterfaceReq | undefined`다. 원인은 조건부 spread를
    `f(x) ? { interface: f(x) } : {}` 로 쓴 것 — TS가 **두 호출을 같은 값으로 좁히지 못해**
    `null`이 타입에 남았고, 함수도 두 번 실행되고 있었다. 한 번만 계산해 `?? undefined`로 넘기도록 수정.
    **조건부 spread는 excess property check를 우회하므로 이 불일치가 그동안 조용히 통과했다.**
