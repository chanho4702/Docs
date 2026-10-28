# API 계약 — Geo Maps(지리 맵 / MapLibre 호스트 배치 작도)

> 대상: `moveseye-be-spring` (Spring Boot 3.3) · 패키지 `com.dmove.moveseye.geomap`
> 기준: **실제 구현 코드가 진실**(GeoClusterController + GeoClusterService + GeoCoordinateResolver + GeoDiagramValidator + dto 9종 + domain 2종(GeoCluster/GeoDiagram) + Flyway V8). 설계서 `devdesign_geo-maps.md`(2026-07-15 확정)는 방향성.
> 소비자: api-contract-sync · fe-engineer(`moveseyee_fe` — `services/geomap.api.ts`·`types/geoMap.ts`·`hooks/useGeoMap.ts` 신규 예정)
> 참조: 이 계약은 `features/maps/network-maps/contract_network-maps.md`(V7)를 미러링한다. **핵심 차이는 좌표를 문서에 저장하지 않고 Zabbix 인벤토리에서 해석**한다는 점.

## 개정 이력
| 버전 | 날짜 | 변경 |
|---|---|---|
| v1 | 2026-07-15 | 최초 산출(1차 — CRUD + main 지정 + centroid 목록 + 좌표 해석 + live 오버레이 2종 + Element Palette 후보, 9개 EP). diagram-as-document(jsonb), 좌표 미저장(인벤토리 해석), 낙관적 잠금, hostid 서버 재추출, 저장 시 좌표 불변식, 물리 삭제. |
| v2 | 2026-07-28 | **좌표 편집 EP #10 신설**(`PATCH /geo-clusters/host-coordinate`) — 지도에서 바꾼 좌표를 **원천(Zabbix 인벤토리)에 기록**하고 asset 스냅샷까지 동기화. 에러코드 `GEOMAP_INVALID_COORDINATE` 추가(6종). #9는 상한 500건으로 잘림(LIMIT 도입) + hostid 중복 제거. #8은 호스트별 알람을 배치 1회로 조회(N+1 제거, 응답 shape 불변). |

---

## 0. 공통 응답 규약 (전 엔드포인트)

모든 응답은 `ApiResult<T>`로 래핑되며 **성공/실패 모두 HTTP 200**(미인증 401만 실제 상태코드). 기존 FE 계약 보존 규칙.

### 성공 envelope
```jsonc
{ "status": "success", "code": 200, "data": <T>, "syncTime": "..." }
```
- `message`/`errorCode`는 성공 시 생략(NON_NULL 래퍼). `syncTime`은 전역 인터셉터 주입(문자열/null), `data`와 별개.

### 비즈니스 에러 envelope (HTTP 200)
```jsonc
{ "status": "error", "code": 400, "errorCode": "GEOMAP_XXX", "message": "GEOMAP_XXX" }
```
- 이 도메인은 **권한 거부(requireAdmin)가 없다** — 전 EP 인증 사용자면 통과(문서 성격, 네트워크맵과 동일 예외). 따라서 `code:403`은 발생하지 않는다.
- **미인증**: JWT 필터/`@VisitorIdCheck` 단계에서 **HTTP 401** 선행(컨트롤러 도달 전).
- **@NotBlank 검증 실패**(생성 시 name 누락): Spring validation → HTTP 200 + `code:400` + 검증 메시지("name is required", `errorCode` 없음).
- ⚠️ **`GEOMAP_HOST_NO_COORDINATE`만 `data`를 동봉**한다(아래 §2 에러표 참조):
  ```jsonc
  { "status": "error", "code": 400, "errorCode": "GEOMAP_HOST_NO_COORDINATE",
    "message": "GEOMAP_HOST_NO_COORDINATE", "data": { "hostids": ["300","401"] } }
  ```
  위반(좌표 없는) hostid 목록이 `data.hostids`에 담긴다. FE는 이걸로 "이 호스트들은 Zabbix 인벤토리 좌표가 없어 배치할 수 없다"를 안내.

### ⚠️ 목록은 plain 배열 (네트워크맵과 다름)
- 네트워크맵 목록은 `{ items, total }`(PaginationResponseDto)였지만, **Geo Maps의 리스트 EP들(#1,#2,#8,#9)은 `data`가 곧 JSON 배열**이다(`{items,total}` 래핑 없음). 설계서 §2.4 표를 그대로 따름.

### 날짜 직렬화
- `createdAt`·`updatedAt` = `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` → 예 `"2026-07-15T05:13:45.076Z"`.
- ⚠️ **낙관적 잠금 핵심**: 응답 `updatedAt` 문자열을 그대로 보관했다가 PATCH `baseUpdatedAt`으로 돌려보낸다(문자열 동등 비교). 파싱/재포맷하지 말 것 — 원본 문자열 그대로 왕복.

---

## 1. 공유 타입 (중첩 DTO)

### GeoDiagram (`diagramJson` — 상세/수정에서 노출·입력)
MapLibre 기반 저장 문서. 서버는 **구조를 강제하지 않고 freeform으로 보존**한다(link 색/방향/라벨, viewport 카메라 임의 필드 손실 없이 round-trip). **좌표는 저장하지 않는다** — host 원소는 `{hostid}`만.
```ts
type TGeoDiagram = {
  hosts: TGeoHost[];        // 필수 배열(수정 시 null/누락 → GEOMAP_INVALID_DIAGRAM)
  links: TGeoLink[];        // 필수 배열(동일)
  viewport?: {              // 자유 형태(서버 무검증). MapLibre 카메라.
    longitude: number; latitude: number; zoom: number;
    bearing?: number; pitch?: number;
  } | Record<string, unknown>;
};

// host 원소: 서버가 강제하는 건 hostid(문자열)뿐. 그 외 필드는 자유(서버 보존만).
type TGeoHost = {
  hostid: string;           // ★ 필수. 없거나 공백이면 GEOMAP_INVALID_DIAGRAM. 좌표는 저장 안 함(인벤토리 해석)
  [k: string]: unknown;     // FE 커스텀 필드 자유(round-trip 보존)
};

// link 원소: 서버 무검증(freeform). round-trip 전량 보존.
type TGeoLink = {
  id: string;
  source: string;           // hostid (관례: source→target 방향)
  target: string;           // hostid
  label?: string; color?: string; lineStyle?: string;
  [k: string]: unknown;     // 자유
};
```
- ⚠️ **좌표 미저장 원칙**: 인벤토리 좌표가 바뀌면 지도도 따라야 하므로 문서엔 hostid만. lat/lng는 조회 시 `resolvedHosts`/`centroid`/`host-candidates`로 별도 수신.
- **linkedHostids**(파생 캐시): 저장 시 서버가 `hosts[].hostid`에서 재추출(중복 제거·등장순서). 클라이언트가 보낸 값은 무시.
- **같은 hostid 중복 배치 허용**(캐시는 distinct).

### Centroid (`centroid` — 목록에서만)
```ts
type TCentroid = { lat: number; lng: number };   // 소속 호스트 '유효 좌표' 산술평균. 좌표 있는 멤버 0이면 null
```

### ResolvedHost (`resolvedHosts[]` — 상세에서만)
멤버 호스트별 해석 좌표·이름·그룹. 상세 진입 시 함께 내려 FE가 호스트별 자산조회 왕복을 안 하게.
```ts
type TResolvedHost = {
  hostid: string;
  name: string | null;        // 자산 미존재(미동기화) 시 null
  hostgroups: string[];       // 소속 호스트그룹명 목록(자산 스냅샷 groups 기준)
  lat: number | null;         // 인벤토리 location_lat. 좌표 없으면 null
  lng: number | null;         // 인벤토리 location_lon. 좌표 없으면 null
  hasCoordinate: boolean;     // ★ false면 지도 렌더 불가(좌표 유실/미동기화). lat/lng null과 동반
};
```

---

## 2. 에러 코드 (6종, ErrorCode enum)

| errorCode / message | code | 발생 위치 | 의미 | data |
|---|---|---|---|---|
| `GEOMAP_NOT_FOUND` | 400 | detail/update/delete/setMain/live(#4~8) | 해당 id 클러스터 없음 | — |
| `GEOMAP_CONFLICT` | 400 | update(#5) | `baseUpdatedAt` ≠ 서버 `updatedAt`(다른 사용자 선수정) | — |
| `GEOMAP_INVALID_DIAGRAM` | 400 | update(#5) | hosts/links 배열 누락(null) 또는 host 원소 hostid 없음/공백, 또는 직렬화 불가 | — |
| `GEOMAP_TOO_LARGE` | 400 | update(#5) | diagramJson 직렬화 > 1MB(1,048,576 bytes) | — |
| `GEOMAP_HOST_NO_COORDINATE` | 400 | update(#5) | 배치 hostid 중 인벤토리 좌표 해석 실패한 것이 있음 | `{ "hostids": string[] }` 위반 목록 |
| `GEOMAP_INVALID_COORDINATE` | 400 | 좌표 편집(#10) | hostid 공백, 또는 lat/lng가 null·NaN·무한대·범위 밖(lat ±90, lng ±180) | — |

- 검증 순서(update): 잠금(CONFLICT) → 크기(TOO_LARGE) → 구조(INVALID_DIAGRAM) → 좌표 불변식(HOST_NO_COORDINATE). 실패 시 즉시 반환(저장 없음).

---

## 3. 엔드포인트 (base `/geo-clusters`, 전 EP `@SecurityRequirement bearer` + `@VisitorIdCheck`)

### #1 · `GET /geo-clusters` — 클러스터 목록(클러스터링맵 요약)
- 요청: 없음.
- 응답 `data`: **`TGeoClusterListItem[]`** (plain 배열). main 최상단 고정, 그다음 최근 수정순.
```ts
type TGeoClusterListItem = {
  id: number;
  name: string;
  description: string | null;
  hostCount: number;          // linkedHostids.length (distinct hostid)
  linkCount: number;          // diagram.links.length
  centroid: TCentroid | null; // 소속 호스트 유효 좌표 평균(요약 핀 위치). 좌표 있는 멤버 0 → null
  isMain: boolean;
  updatedAt: string;          // ISO "…Z"
  updatedBy: string | null;
};
```

### #2 · `GET /geo-clusters/live` — 클러스터링맵 요약 live(핀 색상)
- 요청: 없음. (트랜잭션 밖 Zabbix; 실패 시 클러스터별 안전 폴백.)
- 응답 `data`: **`TGeoClusterOverviewLive[]`** (plain 배열, 클러스터당 1건).
```ts
type TGeoClusterOverviewLive = {
  clusterId: number;
  worstSeverity: string | null;   // 멤버 전체 중 최악 Zabbix severity "0"~"5". 문제 없음/폴백 → null
  openProblemCount: number;       // 멤버 전체 오픈(recent) Problem 총합. 폴백 → 0
};
```
- 멤버 hostid 0개 클러스터는 `{clusterId, null, 0}`(Zabbix 미호출).

### #3 · `POST /geo-clusters` — 클러스터 생성(빈 문서)
- 요청 body `CreateGeoClusterReqDto`:
```ts
type TCreateGeoClusterReq = {
  name: string;              // @NotBlank ("name is required"). 중복 허용. 서버가 trim.
  description?: string | null;
};
```
- 응답 `data`: **`TGeoClusterDetail`**(빈 문서 — diagram=empty, linkedHostids=[], resolvedHosts=[]).
- 생성 흐름(권장): Create → 응답 id로 `/asset/geo-map/:id/edit` 이동 후 PATCH로 채움(네트워크맵과 동일).

### #4 · `GET /geo-clusters/{id}` — 상세(+resolvedHosts)
- 요청: path `id`(number).
- 응답 `data`: **`TGeoClusterDetail`**.
```ts
type TGeoClusterDetail = {
  id: number;
  name: string;
  description: string | null;
  diagramJson: TGeoDiagram;         // 전체 문서(hosts/links/viewport)
  linkedHostids: string[];          // 서버 재추출·중복제거
  resolvedHosts: TResolvedHost[];   // ★ 멤버별 좌표/이름/그룹(hasCoordinate 포함). 빈 문서면 []
  hostCount: number;                // linkedHostids.length
  linkCount: number;                // links.length
  isMain: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;                // ISO "…Z"
  updatedAt: string;                // ISO "…Z"  ← 낙관적 잠금 base
};
```
- 없는 id → `GEOMAP_NOT_FOUND`.

### #5 · `PATCH /geo-clusters/{id}` — 부분 수정(잠금·검증)
- 요청 body `UpdateGeoClusterReqDto`(모든 필드 옵셔널, null=미변경):
```ts
type TUpdateGeoClusterReq = {
  name?: string | null;             // null=미변경
  description?: string | null;      // null=미변경, ""로 비우기 가능
  diagramJson?: TGeoDiagram | null; // 실리면 검증+교체, linkedHostids 서버 재추출
  baseUpdatedAt?: string | null;    // 직전 조회 updatedAt(ISO). 서버 값과 불일치 시 GEOMAP_CONFLICT. null이면 잠금 생략
};
```
- 응답 `data`: **`TGeoClusterDetail`**(갱신본, resolvedHosts 포함, fresh `updatedAt`).
- 에러: `GEOMAP_NOT_FOUND` / `GEOMAP_CONFLICT` / `GEOMAP_TOO_LARGE` / `GEOMAP_INVALID_DIAGRAM` / `GEOMAP_HOST_NO_COORDINATE`(data.hostids).
- ⚠️ **좌표 불변식(서버 강제)**: `diagramJson`이 실리면 배치된 **모든 hostid가 인벤토리 좌표를 해석할 수 있어야** 저장된다. 위반 시 `GEOMAP_HOST_NO_COORDINATE` + 위반 hostid 목록. → FE는 host-candidates에서 `hasCoordinate=true`인 호스트만 배치하도록 유도(호스트그룹 추가 시 좌표 없는 멤버는 클라이언트에서 스킵).
- ⚠️ **연속 저장**: 응답의 `updatedAt`을 그대로 다음 `baseUpdatedAt`으로 재사용(saveAndFlush로 fresh 반환 — false conflict 없음).

### #6 · `DELETE /geo-clusters/{id}` — 물리 삭제
- 요청: path `id`. 응답 `data`: `null`(성공 envelope, data 없음). 없는 id → `GEOMAP_NOT_FOUND`.

### #7 · `PATCH /geo-clusters/{id}/main` — main 지정
- 요청: path `id`(body 없음). 트랜잭션 내 기존 main 해제 후 지정(최대 1개).
- 응답 `data`: **`TGeoClusterDetail`**(isMain=true). 없는 id → `GEOMAP_NOT_FOUND`.
- main 해제 API는 없음(다른 클러스터를 main으로 지정하면 이전 것은 자동 해제).

### #8 · `GET /geo-clusters/{id}/live` — 상세 오버레이 host live
- 요청: path `id`. (트랜잭션 밖 Zabbix; 실패 시 안전 폴백.)
- 응답 `data`: **`TGeoHostLive[]`** (plain 배열, linkedHostids 각 hostid당 1건).
```ts
type TGeoHostLive = {
  hostid: string;
  available: "available" | "unavailable" | "unknown";  // 인터페이스 available 종합. 폴백 → "unknown"
  openProblemCount: number;                             // 오픈(recent) Problem 수. 폴백 → 0
  worstSeverity: string | null;                        // 최악 Zabbix severity "0"~"5". 없음/폴백 → null
};
```
- 멤버 hostid 0개 → `[]`(Zabbix 미호출). 없는 id → `GEOMAP_NOT_FOUND`.
- ⚠️ FE는 hostid 단위 결과를 받아, **동일 좌표 호스트들의 핀 색을 render-time에** severity 최고값으로 결정(BE는 좌표 집계 안 함).

### #9 · `GET /geo-clusters/host-candidates?keyword=&groupId=` — Element Palette 후보
- 요청 query(둘 다 옵셔널):
  - `keyword?: string` — 자산명 / zabbix host 별칭 / visibleName 부분일치(ILIKE, 서버가 `%kw%` 감쌈). 미지정 시 전체.
  - `groupId?: string` — 호스트그룹 **groupid**(Zabbix groupid, 자산 스냅샷 `groups[].groupid` 일치). 미지정 시 그룹 필터 없음.
- 응답 `data`: **`THostCandidate[]`** (plain 배열, 자산명 오름차순). 제외(excluded) 자산·linked_hostid 없는 자산은 제외.
```ts
type THostCandidate = {
  hostid: string;             // asset.linked_hostid
  name: string;               // 자산명
  hostgroups: string[];       // 소속 호스트그룹명 목록
  lat: number | null;         // 인벤토리 location_lat. 없으면 null
  lng: number | null;
  hasCoordinate: boolean;     // ★ false면 배치 불가(팔레트에서 비활성+사유 안내). lat/lng null 동반
};
```
- ⚠️ **좌표 없는 후보도 반환**한다(`hasCoordinate=false`). FE 개별 추가 시 비활성, 호스트그룹 일괄 추가 시 좌표 있는 것만 추가하고 "N개 추가, M개 제외(좌표 없음)" 요약.
- ⚠️ **후보 원천 = MovesEye 자산 DB 스냅샷**(Zabbix 라이브 아님). 미동기화 호스트는 후보에 안 뜸 → 자산 동기화 선행 필요. 호스트그룹 **목록** 자체는 이 EP가 주지 않으므로(groupId 필터만), FE는 기존 호스트그룹 조회 EP를 사용.

---

### #10 · `PATCH /geo-clusters/host-coordinate` — 멤버 호스트 좌표 편집 (v2 신설)
- 요청 body: `{ hostid: string, lat: number, lng: number }` (전부 필수)
- 응답 `data`: **`TResolvedHost`** — 쓰기 후 스냅샷에서 **재해석한** 값.
- 동작: `host.update`로 인벤토리 `location_lat`/`location_lon` 갱신 → `AssetSyncService.syncOne`으로 asset 스냅샷 즉시 동기화 → 재해석 반환. 구현은 `HostManageService.updateInventoryLocation`에 위임(감사 로그 `host_change_log` ACTION_UPDATE 남음).
- ⚠️ **원천을 바꾼다** — 지도 전용 오버라이드가 아니다. 자산·호스트 화면의 좌표도 같이 바뀌며 되돌리기는 없다.
- ⚠️ 서버가 **소수 6자리로 반올림**해 저장하므로 보낸 값과 응답 값이 다를 수 있다. 응답 좌표를 정본으로 쓸 것(핀이 튀지 않게).
- ⚠️ `inventory_mode`가 disabled(-1)인 호스트는 **manual(0)로 전환**하며 저장한다(automatic은 그대로 둔다).
- 좌표가 없던 호스트도 이 EP로 좌표를 부여하면 배치 가능해진다 → `hasCoordinate=false` 후보의 배치 경로.

---

## 4. FE 소비 시 주의(footgun 요약)

1. **목록/live/후보는 plain 배열** — `data`를 `{items,total}`로 언랩하지 말 것(네트워크맵과 다름).
2. **에러는 HTTP 200 + body** — axios status 200이어도 `status:"error"`면 실패. 특히 `GEOMAP_HOST_NO_COORDINATE`는 `data.hostids`(위반 목록) 파싱.
3. **좌표는 문서에 없다** — 지도에 핀 찍으려면 상세의 `resolvedHosts`(lat/lng/hasCoordinate) 또는 후보의 lat/lng를 써야 함. `diagramJson.hosts`엔 hostid만.
4. **저장 전 좌표 검증** — 배치 hostid 전부 `hasCoordinate=true`여야 PATCH 성공. 좌표 없는 호스트를 넣으면 `GEOMAP_HOST_NO_COORDINATE`로 전체 저장 실패(부분 저장 아님).
   - v2부터 FE는 "막는" 대신 **#10으로 좌표를 부여**한 뒤 배치한다(지도 클릭 또는 위경도 직접 입력).
   - 🔴 **좌표를 나중에 잃은 배치 호스트**(인벤토리에서 삭제/자산 미동기화)는 핀으로 안 그려지므로 제거 UI가 없으면 그 클러스터가 영구 저장 불가가 된다 → 편집기는 `missingCoordinateHostids`를 배너로 노출하고 "위치 지정 / 제거"를 제공해야 한다.
5. **낙관적 잠금 왕복** — 상세/수정 응답의 `updatedAt` 문자열을 원본 그대로 보관 → PATCH `baseUpdatedAt`. 파싱/재포맷 금지.
6. **freeform round-trip** — link의 color/lineStyle/label, viewport의 bearing/pitch 등 커스텀 필드는 서버가 보존한다. serialize/deserialize 양쪽에서 필드 유실 없게(네트워크맵 marker 유실 교훈 재현 주의).
7. **isMain은 키 그대로 `isMain`** — record 컴포넌트라 Lombok is-접두 함정 없음.
8. **groupId는 Zabbix groupid**(자산 PK 아님, 호스트그룹명 아님).

---

## 5. 구현 파일 맵(참고)
- 컨트롤러: `geomap/GeoClusterController.java`
- 서비스: `geomap/GeoClusterService.java` (CRUD·main·live·centroid·좌표 불변식)
- 좌표 해석: `geomap/GeoCoordinateResolver.java` (asset.zabbix_data.inventory location_lat/lon 파싱, 범위검증)
- 검증(순수): `geomap/GeoDiagramValidator.java`
- 도메인: `domain/GeoCluster.java`, `domain/GeoDiagram.java`
- DTO(9): `geomap/dto/{CreateGeoClusterReqDto, UpdateGeoClusterReqDto, GeoClusterListItemDto, GeoClusterDetailDto, GeoClusterOverviewLiveDto, GeoHostLiveDto, HostCandidateDto, CentroidDto, ResolvedHostDto}`
- 리포지토리: `geomap/repository/GeoClusterRepository.java` (+ `asset/repository/AssetRepository`에 `findByLinkedHostidIn`·`searchGeoCandidates` 추가)
- Flyway: `db/migration/V8__geo_cluster.sql` (**파일만 생성 — dev DB 적용은 QA/사용자 몫**)
- 에러코드: `common/exception/ErrorCode.java` (GEOMAP_* 5종 추가)
- Swagger: 태그 `Geo Maps`, `/v3/api-docs` · `/api`(Swagger UI)
