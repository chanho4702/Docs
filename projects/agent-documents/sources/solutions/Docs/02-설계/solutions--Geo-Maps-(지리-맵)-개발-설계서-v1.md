# Geo Maps (지리 맵) — 개발 설계서 v1

> 정본 스펙: `claude-experiences/projects/moveseye/geo-maps-design-spec.md` (Confluence ZM 01-3)
> 참조 구현: `devdesign_network-maps.md`(Cluster=문서 패턴 원형), `devdesign_assets-core.md`(좌표 원천·live 패턴)
> 작성: 2026-07-15 · 상태: 구현 완료. **2026-07-28 개정 — 좌표 편집 도입(D1 함의 갱신, §6 참조)**

---

## 0. 확정 결정 (3대 갈래 — 다음 세션이 뒤집으면 안 됨)

| # | 결정 | 내용 | 근거 |
|---|------|------|------|
| D1 | **좌표 원천 = Zabbix 인벤토리** | 신규 lat/lng 컬럼을 만들지 않는다. `location_lat`/`location_lon`(Zabbix host inventory)을 정본으로, 자산 동기화가 `asset.zabbix_data.inventory`에 원본 키 그대로 스냅샷한다. Geo Maps는 이 인벤토리 좌표를 **읽기만** 한다. | 사용자 지시("자빅스 인벤토리의 위도·경도에 다 지정") + 자산이 이미 `selectInventory=extend`로 캡처(`AssetSyncService.parseInventory`가 키 보존) |
| D2 | **지도 엔진 = MapLibre GL + OpenFreeMap** | `maplibre-gl` v5(이미 설치) + OpenFreeMap 타일(무료·무API키·셀프호스팅 가능). mapbox 하드코딩 토큰 제거 방향. | 스펙 명시 + 사용자 선택 |
| D3 | **Geo Maps가 '지리 맵' 메뉴 슬롯 대체** | 신규 Geo Maps로 `geo_maps` 메뉴를 교체. `ServerLocationList`·`MapViewList`는 메뉴 이탈(라우트 존치 후 후속 정리). 좌표 관리가 Zabbix로 이관되므로 ServerLocation의 좌표 CRUD 역할은 불필요해짐. | 사용자 선택 + 스펙 '흡수 예정' |

### D1의 함의 (반드시 설계에 반영)
- **좌표 입력처 = Zabbix.** `asset.zabbix_data`는 **동기화 소유(읽기 전용)** — MovesEye에서 좌표를 고치려면 Zabbix 쓰기(host.update inventory)가 필요하고 이는 자산 스펙상 2차 로드맵이었다.
  - 🔄 **2026-07-28 개정**: 사용자 요청으로 그 2차 항목을 **당겨서 구현**했다. 좌표 편집은 여전히 **원천(Zabbix 인벤토리)을 바꾼다** — 문서 오버라이드를 만들지 않으므로 D1(좌표 원천 단일)은 유지된다. §6 참조.
- 스펙의 "자산에 좌표 없으면 Cluster 추가 불가"는 **"좌표를 부여한 뒤 추가"로 대체**됐다(2026-07-28) — 좌표 없는 호스트도 팔레트에서 고를 수 있고, 지도 클릭/위경도 입력으로 좌표를 부여하면서 배치된다.
- 좌표는 **문자열**로 들어온다(`"37.5665"`). BE에서 `Double` 파싱 + 범위검증(lat∈[-90,90], lng∈[-180,180]). 실패 시 "좌표 없음"으로 취급.

---

## 1. 개념 모델 — Cluster = 저장 문서

스펙의 화면 3종을 데이터로 환원하면:

```
Clustering Map (랜딩)  = 저장된 Cluster '목록'을 지도 위에 요약 렌더
   │  (각 Cluster를 소속 호스트 좌표 '중앙값' 핀으로 표시 + 호스트수·최고severity 뱃지)
   ▼  핀 선택
Cluster Detail (상세)  = 한 Cluster의 Geo Map (읽기 전용, Severity/Display 필터, 핀 상세 팝업)
   │  Edit 버튼
   ▼
Cluster Create/Edit    = 이름·설명 + Element Palette(호스트/호스트그룹 검색·추가) + Link 연결
```

**핵심**: `Cluster`는 사용자가 만드는 **저장 문서**다 = 네트워크 맵의 `NetworkArchitecture`와 1:1 대응. 별도의 "자동 공간 군집 알고리즘"이 아니다. → V7 패턴을 그대로 복제하되, **좌표를 문서에 저장하지 않고 인벤토리에서 해석**한다는 점만 다르다.

| 관심사 | 네트워크 맵(V7) | Geo Maps(V8) — 차이 |
|--------|----------------|---------------------|
| 문서 저장 | jsonb `diagram_json` 단일 컬럼 | 동일 (`geo_cluster.diagram_json`) |
| 노드 위치 | 사용자가 캔버스 x/y **저작** | **저작 안 함** — hostid만 저장, lat/lng는 인벤토리에서 해석 |
| main 지정 | `is_main` 부분 유니크 | 동일 (스펙 "Set as main map") |
| 동시편집 | `baseUpdatedAt` 낙관적 잠금 + `saveAndFlush` | 동일 |
| 감사 | `ActorResolver` (admin username null 회피) | 동일 |
| live | 트랜잭션 밖 Zabbix + 안전 폴백 | 동일 |
| 크기 상한 | 1MB 직렬화 검증 | 동일 |

---

## 2. BE 설계 (moveseye-be-spring, Spring 단일)

### 2.1 Flyway `V8__geo_cluster.sql` (현재 최신 V7 → 다음 V8)
```sql
CREATE TABLE IF NOT EXISTS geo_cluster (
    id             serial PRIMARY KEY,
    name           varchar NOT NULL,
    description    varchar,
    diagram_json   jsonb   NOT NULL DEFAULT '{"hosts":[],"links":[],"viewport":{"longitude":127.0,"latitude":37.5,"zoom":6}}'::jsonb,
    linked_hostids jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- 서버가 diagram에서 재추출한 파생 캐시
    is_main        boolean NOT NULL DEFAULT false,
    created_by     varchar,
    updated_by     varchar,
    created_at     timestamp NOT NULL DEFAULT now(),
    updated_at     timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_cluster_main ON geo_cluster (is_main) WHERE is_main = true;
CREATE INDEX IF NOT EXISTS idx_geo_cluster_updated_at ON geo_cluster (updated_at);
```
> 주의(CLAUDE.md #7): 적용된 마이그레이션 수정 금지, `IF NOT EXISTS`로 멱등. 공유 dev DB.

### 2.2 문서 스키마 (`GeoDiagram` record, jsonb)
```
GeoDiagram {
  hosts:  [ { hostid: string } ]                 // 배치 멤버(좌표는 저장 안 함 — 인벤토리 해석)
  links:  [ { id, source: hostid, target: hostid,
              label?, color?, lineStyle?, ... } ] // source→target 방향, freeform 보존
  viewport: { longitude, latitude, zoom, bearing?, pitch? }  // MapLibre 카메라
}
```
- **좌표 미저장 원칙**: 인벤토리 좌표가 바뀌면 지도도 따라 움직여야 하므로 문서엔 hostid만. lat/lng는 조회 시 해석.
- 네트워크맵처럼 **freeform round-trip 보존**(서버는 최소 규약만 검증: hosts/links 배열 존재, hostid 문자열, node.hostid 유효, 1MB). link 커스텀 필드(색/방향/라벨)는 통과.

### 2.3 좌표 해석기 `GeoCoordinateResolver` (신규 핵심)
```java
@Component
class GeoCoordinateResolver {
    // hostids → { hostid: LatLng } (좌표 없는 호스트는 결과에서 제외)
    Map<String, LatLng> resolve(Collection<String> hostids);   // asset.zabbix_data.inventory 읽기
    // 후보 목록용: 좌표 유무 플래그 포함
    List<HostCandidate> candidates(String keyword, String groupId);
}
record LatLng(double lat, double lng) {}
record HostCandidate(String hostid, String name, List<String> hostgroups,
                     Double lat, Double lng, boolean hasCoordinate) {}
```
- 원천: `AssetRepository`로 `linked_hostid IN (hostids)` 조회 → `zabbixData.inventory().get("location_lat"/"location_lon")` 파싱.
- 파싱 규칙: `Double.parseDouble` + 범위검증. 실패/부재 → 좌표 없음.
- **DB만 조회**(Zabbix 왕복 없음) — 자산 스냅샷 모델과 일관, 빠름. (대안: Zabbix `host.get selectInventory` 라이브 조회 — 스냅샷이 최신이 아닐 우려 시 폴백 옵션으로만.)
- 미동기화 호스트(자산 미존재)는 좌표 없음 → 스냅샷 최신화 필요.

### 2.4 API 엔드포인트 (base `/geo-clusters`, `@SecurityRequirement bearer`, `@VisitorIdCheck`)
전 엔드포인트 **인증 사용자 허용**(문서 성격, `requireAdmin` 미부착 — 네트워크맵과 동일 예외). 응답 `ApiResult<>` 래핑. 업무에러는 HTTP 200 + body code(계약 보존, CLAUDE.md #1).

| # | 메서드 | 경로 | 요청 | 응답 | 트랜잭션 |
|---|--------|------|------|------|---------|
| 1 | GET | `/geo-clusters` | — | `List<GeoClusterListItemDto>` (id,name,desc,hostCount,linkCount,**centroid**,isMain,updatedAt,updatedBy) | @Tx (좌표해석 DB only) |
| 2 | GET | `/geo-clusters/live` | — | `List<GeoClusterOverviewLiveDto>` (clusterId,worstSeverity,openProblemCount) — 클러스터링맵 색상 | **밖** |
| 3 | POST | `/geo-clusters` | `CreateGeoClusterReqDto`(name,desc) | `GeoClusterDetailDto` (빈 문서) | @Tx |
| 4 | GET | `/geo-clusters/{id}` | — | `GeoClusterDetailDto` (diagramJson + linkedHostids + **resolvedHosts**: hostid→{lat,lng,name,hostgroups}) | @Tx |
| 5 | PATCH | `/geo-clusters/{id}` | `UpdateGeoClusterReqDto`(name?,desc?,diagramJson?,baseUpdatedAt) | `GeoClusterDetailDto` | @Tx + `saveAndFlush` |
| 6 | DELETE | `/geo-clusters/{id}` | — | `Void` (물리삭제) | @Tx |
| 7 | PATCH | `/geo-clusters/{id}/main` | — | `GeoClusterDetailDto` (기존 main 해제 후 지정) | @Tx |
| 8 | GET | `/geo-clusters/{id}/live` | — | `List<GeoHostLiveDto>` (hostid,available,openProblemCount,worstSeverity) — 상세 오버레이 | **밖** |
| 9 | GET | `/geo-clusters/host-candidates?keyword=&groupId=` | — | `List<HostCandidateDto>` (hostid,name,hostgroups,lat,lng,hasCoordinate) — Element Palette | @Tx |

- **#4 resolvedHosts**: 상세 진입 시 멤버 호스트 좌표를 함께 내려 FE가 호스트별 자산조회 왕복을 안 하게. `hasCoordinate=false`(인벤토리 좌표 유실) 호스트는 지도에 못 그리므로 별도 표기.
- **#9 host-candidates**: 팔레트 검색. 좌표 없는 후보도 반환하되 `hasCoordinate=false`로 표시(추가 시 거부 UX). 호스트그룹 추가는 이 목록을 groupId로 조회→좌표 있는 멤버만 추가.
- **저장(#5) 시 서버 검증**: 배치된 모든 hostid가 좌표 해석되는지 확인. 좌표 없는 hostid 포함 시 `GEOMAP_HOST_NO_COORDINATE`(위반 hostid 목록 동봉)로 거부 — 불변식 서버 강제.

### 2.5 live 오버레이 (V7 `getLive` 복제)
- `#8 /{id}/live`: `linked_hostids` → `host.get`(가용성 배치 1회) + 호스트별 `problem.get`(recent, severity) → `{available, openProblemCount, worstSeverity}`. Zabbix 실패 시 안전 폴백(available="unknown", count=0, severity=null).
- `#2 /live`(클러스터링맵): 각 Cluster의 멤버 hostid 집합에 대해 worstSeverity·openProblemCount 집계.
- **좌표별 핀 severity**: FE가 동일 좌표 호스트들의 live severity 중 최고값으로 핀 색 결정(BE는 hostid 단위 제공, 좌표 집계는 render-time).

### 2.6 패키지 `com.dmove.moveseye.geomap`
```
domain/GeoCluster.java          (NetworkArchitecture 미러: name,description,diagramJson,linkedHostids,isMain,createdBy,updatedBy,ts)
domain/GeoDiagram.java          (record: hosts,links,viewport + empty()/hostsOrEmpty())
geomap/GeoClusterService.java   (getList,getOverviewLive,getDetail,create,update,delete,setMain,getLive,getHostCandidates + assertNotConflict/assertWithinSizeLimit/assertAllHostsHaveCoordinate)
geomap/GeoCoordinateResolver.java
geomap/GeoDiagramValidator.java (extractHostids, validate — 순수)
geomap/GeoClusterController.java
geomap/repository/GeoClusterRepository.java (findAllByOrderByIsMainDescUpdatedAtDesc, @Modifying clearMain)
geomap/dto/*  (Create/Update Req, ListItem, Detail, OverviewLive, HostLive, HostCandidate)
```
- 감사: `ActorResolver.resolve(currentUser)` 재사용(admin username null 회피 — 필수).
- 에러코드 추가: `GEOMAP_NOT_FOUND`, `GEOMAP_CONFLICT`, `GEOMAP_INVALID_DIAGRAM`, `GEOMAP_TOO_LARGE`, `GEOMAP_HOST_NO_COORDINATE`.
- 낙관적 잠금: `@Version` 아님 — `updatedAt` 문자열 비교 + `saveAndFlush`로 최신 updated_at 반환(V7 B1 교훈: flush 전 DTO 생성하면 stale updatedAt로 연속저장 false conflict).
- cross-package 의존 `geomap → asset(AssetRepository)`: 좌표 해석 위해 허용(asset는 안정 모듈).

---

## 3. FE 설계 (moveseyee_fe, React19)

### 3.1 라우트/메뉴 (D3)
```
constants/routes.ts  PATH_ROOTS_ASSET
  geoMap:        /asset/geo-map            → GeoMapClusteringPage (랜딩=Clustering Map)
  geoMapDetail:  /asset/geo-map/:id        → GeoMapClusterDetailPage
  geoMapEditor:  /asset/geo-map/:id/edit   → GeoMapClusterEditorPage
  (Create: [Create cluster] → POST 빈 문서 → /asset/geo-map/:id/edit 이동, 네트워크맵과 동일 흐름)
```
- SideNav `asset > maps`의 `geo_maps` 링크를 `serverlocation` → `geoMap`으로 교체.
- `serverlocation`·`mapview` 라우트는 존치(메뉴 이탈), 후속 세션에서 최종 제거 결정. i18n `geo_maps` 라벨 재사용.

### 3.2 모듈 구조 `src/pages/asset/geomaps/`
```
GeoMapClusteringPage.tsx     (랜딩: 지도 + 클러스터 핀 + Cluster scope 패널 + Create)
GeoMapClusterDetailPage.tsx  (상세: 지도 + 호스트 핀/링크 + Severity/Display 필터 + 핀 상세 팝업 + Edit/Set-main)
GeoMapClusterEditorPage.tsx  (생성/편집: 이름·설명 + Element Palette + Link mode + Inspector)
map/
  MapCanvas.tsx              (maplibre-gl 래퍼, OpenFreeMap 스타일, 공용 카메라/컨트롤)
  ClusterPinLayer.tsx        (저장 클러스터 → 중앙값 핀, count+worstSeverity)
  HostPinLayer.tsx           (좌표집계 핀: severity색·Problem뱃지·호스트수뱃지, 레이어순서 Pin<Link<Problem)
  LinkLayer.tsx              (host–host 라인, source→target, 동일좌표쌍 1선)
components/
  ClusterScopePanel.tsx  SeverityFilter.tsx  DisplayFilter.tsx
  PinDetailPanel.tsx         (우측 팝업: Problems/Hosts/Assets 탭 + Detail 바로가기, 동일좌표 10↑ 페이지네이션)
  ElementPalette.tsx         (Host/Host group 탭 검색, 좌표없음 후보 비활성+사유)
  InspectorPanel.tsx  CreateClusterModal.tsx  GeoMapTopBar.tsx
```
- **순수 헬퍼(지도 런타임 미의존 → 단위테스트, 네트워크맵 17테스트 전략 재현)**:
  - `geoAggregate.ts` — 호스트[]를 좌표키(round 6자리)로 집계 → 핀[]. count·worstSeverity·hostList.
  - `centroid.ts` — 좌표 평균(클러스터 중앙값).
  - `geoDiagram.ts` — serialize/deserialize(hosts/links/viewport). **round-trip 보존 양쪽 명시**(V7 marker 유실 교훈).
  - `coordinate.ts` — 인벤토리 문자열 파싱/범위검증.
  - `linkVisibility.ts` — Severity/Display 필터 후 "양 endpoint 핀 모두 보이는 link만" 계산.

### 3.3 서비스/훅/키 (격리 관례)
- `services/geomap.api.ts` (엔드포인트 9개) — envelope 언랩 이원화(조회=useDmoveQuery 2겹, mutation=service throw `GeoMapApiError`), V7 패턴 복제.
- `hooks/useGeoMap.ts` — `useGeoClusterList/Overview/Detail/Live`, `useCreate/Update/Delete/SetMainGeoCluster`, `useGeoHostCandidates(keyword,groupId)`.
- `constants/queryKey.ts` — **`GEOMAP_QUERY_KEY`** 신설(asset/netmap 키와 공유 금지).
- `constants/geoMap.ts` — severity 색상표, OpenFreeMap 스타일 URL, 기본 viewport, 좌표키 정밀도.
- 낙관적 잠금: 상세 `updatedAt` 원본 보관 → PATCH `baseUpdatedAt` 왕복, conflict 시 Alert 배너(새로고침/덮어쓰기).

### 3.4 지도 엔진 (D2)
- `maplibre-gl` v5(설치됨) 직접 사용. 스타일: OpenFreeMap 공개 URL(예 `https://tiles.openfreemap.org/styles/liberty` 또는 `positron`) — **API키 불필요**. `VITE_GEOMAP_STYLE_URL`로 override 허용(폐쇄망 셀프호스팅 대비).
- 3D 건물 오브젝트 없음(스펙 확정). pitch 최소, 핀 중심 2.5D 룩.
- 참조 구현 `components/Map/3DMapChart.tsx`(maplibre+MapTiler 데모)에서 초기화 패턴만 차용, 타일 원천은 OpenFreeMap으로 교체.
- 핀/링크: GeoJSON source + symbol/line layer 또는 React marker. 클러스터링맵의 밀집영역은 maplibre 네이티브 클러스터링 옵션 검토(단 "Cluster=저장문서" 개념과 혼동 방지 — 네이티브 클러스터는 순수 시각 밀집 처리로만).

---

## 4. 스펙 미확정 2건 — 처리안

| 스펙 항목 | 처리안(권장) |
|-----------|-------------|
| **M (한 화면 최대 호스트 수)** | **하드 캡 제거.** 좌표 집계 핀 + viewport culling + (밀집 시) maplibre 네이티브 클러스터링으로 대체 → 고정 M 불필요. 대신 한 Cluster 멤버가 매우 많으면(예 >500) 경고만. |
| **좌표 없는 호스트(특히 Host group 추가)** | **전부 거부(all-or-nothing) 아님 → 부분 추가.** 개별 호스트 추가: 좌표 없으면 거부 + 사유 팝업. 호스트그룹 추가: 멤버 확장 → 좌표 있는 것만 추가, 좌표 없는 N개는 스킵하고 "N개 추가, M개 제외(좌표 없음)" 요약 표시. Zabbix 좌표 미지정이 원인이므로 Zabbix 인벤토리 입력 안내. |

---

## 5. 구현 순서(제안) & 산출물

1. **BE** — V8 마이그레이션 → `geomap` 패키지(엔티티·resolver·서비스·컨트롤러·DTO·validator) → 단위테스트(validator·resolver·service, V7 수준). 계약서 `contract_geo-maps.md` 산출.
2. **계약 동기화** — Swagger(`/v3/api-docs`) ↔ FE 타입 대조.
3. **FE** — 라우트/메뉴 교체 → services/hooks/keys → MapCanvas(OpenFreeMap) → 3화면(Clustering/Detail/Editor) → 순수헬퍼+테스트.
4. **QA** — integration-qa(경계면 shape) → functional-qa(실 Zabbix: 인벤토리 좌표 보유 호스트로 배치·집계·live·필터 E2E). **선결**: dev의 실 자산 중 `location_lat/lon` 보유 호스트 존재 여부 확인(없으면 Zabbix 인벤토리에 몇 건 지정 후 재동기화).

**미해결/확인 필요(구현 착수 시)**:
- dev Zabbix 호스트 인벤토리에 좌표가 실제로 입력돼 있는지(스펙·사용자는 있다고 함 → QA 전 실데이터 확인).
- 좌표 원천을 자산 스냅샷으로 할지 Zabbix 라이브로 할지 최종(기본: 스냅샷, 성능·일관성 우선).
- `ServerLocationList`/`MapViewList` 라우트 최종 제거 시점(1차는 존치).

---

## 부록: 재사용 패턴 매핑

| 관심사 | 참조(V7 네트워크맵) | 위치 |
|--------|--------------------|------|
| Cluster=문서 jsonb | NetworkArchitecture / NetworkDiagram | `domain/*`, `@JdbcTypeCode(SqlTypes.JSON)` |
| main 부분유니크 | uq index + clearMain + setMain | V7 DDL / repository / service |
| 낙관적 잠금 | updatedAt 비교 + saveAndFlush | assertNotConflict (B1 교훈) |
| 감사 | ActorResolver | `auth/security/ActorResolver.java` |
| live 트랜잭션 밖 | getLive + 안전 폴백 | `NetworkArchitectureService.getLive` |
| 파생 캐시 재추출 | extractHostids(서버 정본) | NetworkDiagramValidator |
| FE 격리/언랩/잠금 | NETMAP_QUERY_KEY, envelope 이원화, baseUpdatedAt | networkmap.api.ts / useNetworkMap.ts |
| 순수헬퍼 테스트 | diagram.ts 등 17테스트 | pages/asset/networkmap/*.ts |
| **좌표 해석(신규)** | 없음 — asset 인벤토리에서 신설 | GeoCoordinateResolver ← asset.zabbix_data.inventory |


---

## 6. 좌표 편집 (2026-07-28 개정)

### 6.1 결정

| # | 결정 | 내용 |
|---|------|------|
| D4 | **좌표 편집은 원천을 쓴다** | 지도에서 바꾼 좌표는 `host.update`로 Zabbix 인벤토리 `location_lat`/`location_lon`에 기록하고, `AssetSyncService.syncOne`으로 asset 스냅샷을 즉시 갱신한다. 문서(`diagram_json`)에는 여전히 좌표를 저장하지 않는다 → **D1 불변**. 대안(문서 오버라이드)은 좌표 원천이 둘로 갈려 "지도에선 A, 자산 화면에선 B"가 되므로 기각. |
| D5 | **좌표 없는 호스트도 배치 가능** | 팔레트가 사전 차단하던 것을 풀고, 고르면 배치 대기 상태가 된다. 지도 클릭 지점 또는 직접 입력한 위경도를 좌표로 부여한 뒤 문서에 편입한다. |
| D6 | **편집 진입점 3개** | ① 핀 드래그(단일 호스트 핀만 — 집계 핀은 대상이 모호) ② Inspector 위경도 숫자 입력 ③ 배치 대기 중 지도 클릭/직접 입력. |

### 6.2 구현

- BE: `PATCH /geo-clusters/host-coordinate` (EP #10) → `GeoClusterService.updateHostCoordinate` → **`HostManageService.updateInventoryLocation`에 위임**(host 도메인의 쓰기 경로·감사 로그·자산 동기화를 재사용). `@Transactional` 미부착(외부 HTTP 왕복 포함).
- 검증: null/NaN/무한대/범위 밖 → `GEOMAP_INVALID_COORDINATE`(Zabbix 호출 전에 차단). 저장은 소수 6자리 반올림 + 지수표기 금지(`BigDecimal.toPlainString`).
- `inventory_mode` disabled(-1) 호스트는 manual(0)로 전환하며 저장(automatic은 유지 — 좌표는 아이템 매핑 대상이 아니라 수동 값이 보존된다).
- FE: `CoordinateEditor`(위경도 입력) + `HostPinLayer`의 draggable 마커 + 편집기 배치 대기 배너. 좌표 상태를 ref→state로 승격(좌표만 바뀌어도 핀이 다시 그려져야 하므로).

### 6.3 함께 해소한 결함(2026-07-28 검토)

| 등급 | 내용 |
|---|---|
| HIGH | `getLive`가 호스트마다 알람을 조회하던 N+1 → `HostLiveAggregator.problemAggByHost` 배치 1회(응답 shape 불변) |
| HIGH | 편집기가 저장된 viewport를 절대 복원 못 하던 문제(자식 지도 생성 effect가 부모보다 먼저 실행) → 문서 뷰포트를 렌더 중 계산 |
| HIGH | 미저장 이탈 경고 부재 → `beforeunload` + 이탈 확인 모달 |
| MED | **클러스터 잠김** — 좌표를 잃은 배치 호스트는 핀이 없어 제거도 못 하는데 저장은 계속 실패 → 배너에 "위치 지정 / 전부 제거" |
| MED | `"NaN"` 좌표가 범위 가드를 통과해 centroid 전체를 오염 → 유한성 검사 선행 |
| MED | 팔레트 후보 무제한 조회 → LIMIT 500 + `asset.linked_hostid` 인덱스(V14) + LIKE 메타문자 이스케이프 |
| MED | 같은 hostid에 자산이 둘이면 좌표 해석이 비결정적 → 좌표 가진 자산 우선 + 후보 dedup |
| MED | 삭제·이름 수정 UI 부재(BE는 지원) → 목록 Popconfirm 삭제, 편집기 제목 인라인 수정 |
| MED | 지도 로드 실패가 무음(영구 회색 화면) → `map.on("error")` + 배너 |
| MED | 핀 상세 페이지네이션이 핀 변경 시 리셋 안 됨 / 마커가 매 렌더 재생성 / live 새로고침 경로 없음 |
| LOW | zoom 0(전 세계 뷰)이 기본값으로 덮이던 문제 — 무효값만 보정하도록 계약 변경(테스트 동반 수정) |
