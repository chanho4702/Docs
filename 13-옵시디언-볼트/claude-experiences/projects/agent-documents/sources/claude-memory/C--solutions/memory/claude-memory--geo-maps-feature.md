---
name: geo-maps-feature
description: "지리 맵(Geo Maps) 2026-07-15 설계+구현+QA 완료, 2026-07-28 좌표 편집 도입+검토 결함 12건 수정. Cluster=저장문서(네트워크맵 V7 패턴 복제), 좌표=Zabbix 인벤토리 location_lat/lon(신규 컬럼 없음, 편집도 원천에 씀), MapLibre GL+OpenFreeMap, BE V8+V14+API10, FE 3화면+2D/3D토글. **2026-07-29 커밋·푸시 완료(BE 38ae4d4 / FE 8261d7a)**. 옵시디언 정리: projects/moveseye/2026-07-29-geo-maps.md"
metadata:
  node_type: memory
  type: project
  originSessionId: c06aaee4-8b61-47ea-9fd6-e05882deea82
  modified: 2026-07-29T06:07:55.419Z
---

2026-07-15 **Geo Maps(지리 맵) 설계+구현+QA 완료**(fullstack-feature 1패스). 정본 설계 `_workspace/devdesign_geo-maps.md`(v1), 계약 `features/maps/geo-maps/contract_geo-maps.md`, QA `qa_geo-maps.md`+`e2e_geo-maps.md`. 스펙 출처 Confluence ZM 01-3(`claude-experiences/projects/moveseye/geo-maps-design-spec.md`).

**3대 확정 결정(뒤집지 말 것)**:
- **D1 좌표 원천 = Zabbix 인벤토리 `location_lat`/`location_lon`** — 신규 lat/lng 컬럼 안 만듦. 자산 동기화가 `asset.zabbix_data.inventory`에 원본 키로 스냅샷(AssetSyncService.parseInventory 키 보존) → geomap이 읽기만. **좌표 편집=Zabbix에서**(asset zabbixData는 동기화 소유 읽기전용, Zabbix 쓰기는 2차 로드맵). 스펙 "좌표 없으면 배치 불가"가 자연 성립. 사용자 지시로 확정("자빅스 인벤토리 위도경도에 다 지정").
- **D2 지도 = MapLibre GL v5(설치됨) + OpenFreeMap**(무료·무API키, `https://tiles.openfreemap.org/styles/liberty`, `VITE_GEOMAP_STYLE_URL` override). mapbox 아님. 3D 건물 없음.
- **D3 Geo Maps가 '지리 맵' 메뉴 슬롯 대체** — SideNav `geo_maps` 링크 serverlocation→`/asset/geo-map`. ServerLocationList·MapViewList는 메뉴 이탈·라우트 존치(후속 정리).

**개념 모델**: `Cluster` = 사용자 저장 문서 = 네트워크맵 `NetworkArchitecture`와 1:1 → **V7 패턴 그대로 복제**(is_main 부분유니크, baseUpdatedAt 낙관적잠금+saveAndFlush, ActorResolver 감사, live 트랜잭션 밖+안전폴백, 1MB 상한, freeform round-trip). **유일한 차이**: 노드 위치를 문서에 저작 안 함 — `diagram_json.hosts`엔 hostid만, lat/lng는 인벤토리에서 해석(신규 `GeoCoordinateResolver`). Clustering Map=저장 클러스터 목록을 중앙값 핀으로 지도 렌더(자동 공간군집 아님).

**BE(moveseye-be-spring)**: Flyway **V8** `geo_cluster` 단일테이블 + `com.dmove.moveseye.geomap` 패키지(GeoCluster/GeoDiagram domain, GeoCoordinateResolver, GeoClusterService, GeoDiagramValidator 순수, Controller, repository, dto 9종) + ErrorCode GEOMAP_ 5종 + AssetRepository에 `findByLinkedHostidIn`·`searchGeoCandidates` 추가. **API 9개**: 1 GET /geo-clusters(list+centroid), 2 GET /geo-clusters/live(overview), 3 POST, 4 GET /{id}(detail+resolvedHosts), 5 PATCH /{id}(잠금), 6 DELETE, 7 PATCH /{id}/main, 8 GET /{id}/live(host), 9 GET /geo-clusters/host-candidates?keyword=&groupId=(팔레트, hasCoordinate 플래그). 단위테스트 32건. 빌드/테스트 통과.

**FE(moveseyee_fe)**: `src/pages/asset/geomaps/` 3화면(GeoMapClusteringPage 랜딩 / GeoMapClusterDetailPage 상세 / GeoMapClusterEditorPage 편집) + map/(MapCanvas maplibre+OpenFreeMap, GeoMapContext, ClusterPinLayer/HostPinLayer/LinkLayer, pinElement) + components/(CreateClusterModal, ClusterScopePanel, SeverityFilter, DisplayFilter, PinDetailPanel Problems/Hosts/Assets탭, ElementPalette, InspectorPanel, GeoMapTopBar, **MapDimensionToggle**) + 순수헬퍼(coordinate/geoAggregate/centroid/linkVisibility/geoDiagram/geoResolve)+테스트 7suites. services/geomap.api.ts + hooks/useGeoMap.ts + **GEOMAP_QUERY_KEY**(격리) + constants/geoMap.ts. tsc/lint/jest 51suites/438tests 통과.

**계약 footgun(FE 소비 주의)**: ①목록/live/후보(#1,2,8,9)는 **plain 배열**(네트워크맵 {items,total}과 다름) → useDmoveQuery<T[]>. ②좌표는 문서에 없음 → 상세 resolvedHosts/후보 lat/lng로 별도 수신, geoResolve.ts가 결합. ③GEOMAP_HOST_NO_COORDINATE만 `data.hostids`(위반목록) 동봉, 저장 all-or-nothing → 팔레트가 hasCoordinate=false 사전차단. ④낙관적잠금: updatedAt 문자열 원본 보관→baseUpdatedAt(파싱금지). ⑤groupId=Zabbix groupid.

**미확정 2건 처리(설계 §4)**: M(최대호스트)=하드캡 제거(집계핀+viewport culling). 좌표없는 호스트=개별거부+사유, 호스트그룹=좌표있는것만 부분추가+"N개 추가 M개 제외" 요약(all-or-nothing 아님).

**2D/3D 전환**(사용자 요청, 같은날): MapLibre pitch로 구현(0=2D top-down, `GEOMAP_3D_PITCH`=50°=3D 원근). viewport bearing/pitch는 원래부터 MapCanvas가 저장·round-trip. UI만 신설 — `MapDimensionToggle`을 GeoMapTopBar extra 슬롯에 주입(상세·편집만, 랜딩은 TopBar/viewport저장 미배선이라 제외). easeTo({pitch,duration:400}), moveend 기존경로로 저장, pitch>10이면 3D 표시.

**QA 결과**: integration-qa 경계면 CLEAN(9EP 1:1, 불일치0). functional-qa **API 26/26·UI 11/11 PASS, 동작버그0** — V8 psql 멱등적용, dev asset 인벤토리 좌표 7건 실재, Fortigate 100D/TEST 동일좌표(37.505954,127.056107)로 집계핀 검증(4호스트→3핀 count=2, 실 Zabbix live KR28/JP7/Forti2 문제수·severity색 정확 일치), 낙관적잠금·좌표불변식·freeform왕복·물리삭제 전건 확인.

**⚠️ 배포 전 필수(F1, 코드버그 아님)**: dev `asset` 75건 전부 `linked_hostid`=NULL(linkedHostid 채우기 로직 도입 *이전* 스냅샷). geomap은 linked_hostid로 후보/좌표해석 → **현 상태 후보0건·배치불가**. **자산 동기화 1회 실행**하면 linked_hostid←zabbix_hostid 채워져 해소. QA는 임시 UPDATE 주입→검증→NULL 원복함.

**잔여**: BE/FE **미커밋**(네트워크맵 전례대로 사용자 확인 후). 미검증 소소: 호스트그룹 일괄추가 "N개 추가 M개 제외" 토스트 렌더·conflict FE Alert 배너 실노출(API레벨은 확인). Clustering 랜딩엔 2D/3D 토글·viewport저장 미배선(개요 읽기뷰).

---

## 2026-07-28 2차 — 좌표 편집 + 전면 검토 결함 수정 (2026-07-29 커밋·푸시 완료: BE `38ae4d4` / FE `8261d7a`)

**좌표 편집 도입(D4~D6, 설계서 §6 신설)** — 사용자 요청으로 "2차 로드맵"이던 Zabbix 쓰기를 당겨 구현. **오버라이드가 아니라 원천을 쓴다**(D1 유지): 신규 `PATCH /geo-clusters/host-coordinate`(EP #10) → `GeoClusterService.updateHostCoordinate` → **`HostManageService.updateInventoryLocation` 위임**(host.update inventory + `AssetSyncService.syncOne` + host_change_log 재사용) → 스냅샷 재해석 반환. 진입점 3개: 핀 드래그(단일 호스트 핀만), Inspector 위경도 입력, 배치 대기 중 지도 클릭/직접 입력. **좌표 없는 호스트도 배치 가능**해짐(팔레트 사전 차단 해제). 신규 `GEOMAP_INVALID_COORDINATE`, 소수 6자리 반올림(`BigDecimal.toPlainString` — 지수표기 방지), `inventory_mode` disabled(-1)면 manual(0)로 전환.

**🔴 교훈**:
- **NaN은 범위 비교를 전부 통과한다** — `lat < -90 || lat > 90`으로는 못 거른다. `Double.isFinite` 선행 필수. centroid 합산으로 번져 목록 응답 전체가 `"lat":"NaN"`(number 자리에 string)이 됐다.
- **자식 effect가 부모보다 먼저 실행된다** — 부모가 useEffect로 채우는 값을 자식이 마운트 시 읽으면 항상 undefined. 편집기가 저장된 viewport를 절대 복원 못 하던 원인(자식 MapCanvas의 지도 생성 effect). 렌더 중 계산으로 바꿔야 함.
- **좌표를 잃은 배치 호스트 = 클러스터 영구 잠김** — 핀으로 안 그려져 제거 UI가 없는데 저장 시엔 전송돼 `GEOMAP_HOST_NO_COORDINATE`로 계속 실패. 정적 shape 대조(integration-qa CLEAN)로는 안 잡히는 **상태 전이 결함**.
- **마커 레이어의 콜백은 deps에서 빼라(ref)** — 부모가 인라인 함수를 넘기면 지도 이동마다 전 마커가 파괴·재생성된다.
- **브레드크럼 스켈레톤 2개** = breadcrumb의 :id 자리 + `currentPage`(마지막 항목을 그대로 씀). 3단 경로 상세 페이지는 `replacePathBreadcrumb` 호출이 **필수**(안 하면 영구 스켈레톤). geomap 상세/편집이 빠뜨렸었다.
- antd v5의 deprecated는 **`Input`의 addonAfter만** — `InputNumber`의 addonAfter는 대상 아님(RetentionSettingForm·NetworkMapPropertyPanel은 손댈 필요 없음).

**함께 수정한 결함 12건**: getLive N+1(→`HostLiveAggregator.problemAggByHost` 배치 1회, 응답 불변) / 편집기 viewport 복원 / 미저장 이탈 경고 / 클러스터 잠김 배너 / NaN 좌표 / 후보 LIMIT 500+`asset.linked_hostid` 인덱스(**Flyway V14**)+LIKE 이스케이프 / 같은 hostid 중복 자산 시 좌표 가진 쪽 우선+후보 dedup / 삭제·이름수정 UI 신설 / 지도 로드 실패 배너 / 핀 상세 페이지 리셋 / OVERVIEW_LIVE 무효화 / zoom 0 보존(테스트 계약 변경).

**검증**: BE `gradlew test` BUILD SUCCESSFUL(좌표편집 2건·NaN·중복자산·LIKE/LIMIT·dedup 테스트 추가), FE tsc·eslint 클린 + jest 611 passed(geomap 7 suites 33건). ⚠️ 선재 실패 1 suite(`useGroupReportHostCompare` — `import.meta` jest 설정 이슈, geomap 무관). **런타임 미검증**(BE 재기동+V14 적용 필요).

**How to apply**: 후속 작업 시 devdesign_geo-maps.md(§6) + features/maps/geo-maps/contract_geo-maps.md(v2) 정본. 배포 전 자산 동기화 1회 필수. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--network-maps-design|network-maps-design]](V7 패턴 원형), [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--assets-core-devdesign|assets-core-devdesign]](좌표원천 inventory·live패턴), [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--nav-restructure-2026-07-13|nav-restructure-2026-07-13]](지리맵 슬롯), [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-dual-maintenance|be-dual-maintenance]](Spring 단일).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

지리 맵(Geo Maps) — 2026-07-15 설계+구현+QA, **2026-07-28 좌표 편집 도입+결함 12건 수정**(07-29 커밋·푸시 완료). Cluster=저장문서(네트워크맵 V7 복제), 좌표=Zabbix 인벤토리(편집도 원천에 씀, EP#10은 HostManageService 위임), MapLibre+OpenFreeMap, BE V8+V14+API10, FE 3화면. 🔴NaN은 범위비교 통과·자식effect가 부모보다 먼저·좌표잃은 배치호스트=클러스터 잠김·3단경로는 replacePathBreadcrumb 필수. ⚠️배포 전 자산 동기화 1회 필수(dev linked_hostid 전부 NULL이라 후보0건)
