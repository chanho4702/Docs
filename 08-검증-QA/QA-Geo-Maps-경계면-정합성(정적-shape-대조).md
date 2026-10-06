# QA — Geo Maps 경계면 정합성(정적 shape 대조)

> 검증자: integration-qa · 일자: 2026-07-15 · 방식: **정적 교차 대조**(앱 미기동, 런타임/E2E는 functional-qa 몫)
> 기준: `contract_geo-maps.md`(9 EP) · BE `moveseye-be-spring/geomap/*` · FE `moveseyee_fe`(geomap.api.ts / useGeoMap.ts / geoMap.ts / geoDiagram.ts / 소비 페이지)

## 결론: **경계면 CLEAN** — 불일치 0 (HIGH 0 / MEDIUM 0 / LOW 0)

9개 엔드포인트의 경로·메서드·쿼리파라미터·요청/응답 shape·필드명·옵셔널/nullable·래퍼 깊이·언랩 깊이·에러코드·낙관적 잠금·freeform 왕복을 전수 대조한 결과 BE↔FE가 1:1 일치한다. 수정 라우팅 불필요.

---

## EP별 대조표

| # | 경로/메서드 | BE 산출 | FE 소비 | 판정 |
|---|---|---|---|---|
| 1 | `GET /geo-clusters` | `ApiResult<List<GeoClusterListItemDto>>` (plain 배열) | `getList(): T[]` → `useGeoClusterList` `useDmoveQuery<TGeoClusterListItem[]>` | 일치 |
| 2 | `GET /geo-clusters/live` | `ApiResult<List<GeoClusterOverviewLiveDto>>` (plain 배열) | `getOverviewLive(): T[]` → `useDmoveQuery<TGeoClusterOverviewLive[]>` | 일치 |
| 3 | `POST /geo-clusters` | body `CreateGeoClusterReqDto` → `ApiResult<GeoClusterDetailDto>` | `create()` `.then(unwrapEnvelope)` → `TGeoClusterDetail` | 일치 |
| 4 | `GET /geo-clusters/{id}` | `ApiResult<GeoClusterDetailDto>` | `getDetail(): TGeoClusterDetail` → `useDmoveQuery<TGeoClusterDetail>` | 일치 |
| 5 | `PATCH /geo-clusters/{id}` | body `UpdateGeoClusterReqDto` → `ApiResult<GeoClusterDetailDto>` | `update()` `.then(unwrapEnvelope)` → `TGeoClusterDetail` | 일치 |
| 6 | `DELETE /geo-clusters/{id}` | `ApiResult<Void>` (data null) | `remove(): null` `.then(unwrapEnvelope)` | 일치 |
| 7 | `PATCH /geo-clusters/{id}/main` | `ApiResult<GeoClusterDetailDto>` | `setMain()` `.then(unwrapEnvelope)` → `TGeoClusterDetail` | 일치 |
| 8 | `GET /geo-clusters/{id}/live` | `ApiResult<List<GeoHostLiveDto>>` (plain 배열) | `getLive(): T[]` → `useDmoveQuery<TGeoHostLive[]>` | 일치 |
| 9 | `GET /geo-clusters/host-candidates?keyword=&groupId=` | `@RequestParam(required=false) keyword, groupId` → `ApiResult<List<HostCandidateDto>>` (plain 배열) | `buildCandidatesQuery` `keyword=`/`groupId=` → `useDmoveQuery<THostCandidate[]>` | 일치 |

## 응답 DTO 필드 대조 (BE record ↔ FE type)

- **GeoClusterListItemDto** `{id,name,description,hostCount,linkCount,centroid,isMain,updatedAt,updatedBy}` ↔ **TGeoClusterListItem** — 필드/타입/nullable 완전 일치. `int→number`, `LocalDateTime@JsonFormat→string`, `centroid` nullable ↔ `TCentroid|null`.
- **GeoClusterDetailDto** `{id,name,description,diagramJson,linkedHostids,resolvedHosts,hostCount,linkCount,isMain,createdBy,updatedBy,createdAt,updatedAt}` ↔ **TGeoClusterDetail** — 13필드 완전 일치.
- **GeoClusterOverviewLiveDto** `{clusterId,worstSeverity,openProblemCount(long)}` ↔ **TGeoClusterOverviewLive** — 일치(`long→number`, `worstSeverity` nullable).
- **GeoHostLiveDto** `{hostid,available,openProblemCount(long),worstSeverity}` ↔ **TGeoHostLive** — 일치. `available` 유니언 `"available"|"unavailable"|"unknown"`(TGeoAvailable) ↔ BE `resolveAvailable` 출력 3값 동일.
- **HostCandidateDto / ResolvedHostDto** `{hostid,name,hostgroups,lat,lng,hasCoordinate}` ↔ **THostCandidate / TResolvedHost** — 일치. `Double→number|null`, `hasCoordinate:boolean`.
- **CentroidDto** `{lat,lng}` ↔ **TCentroid** — 일치. (FE 소비 `centroid.lng/lat`, BE 필드명 `lat/lng` 동일)
- **요청 DTO**: `CreateGeoClusterReqDto{name(@NotBlank),description}` ↔ `TCreateGeoClusterReq{name,description?}` / `UpdateGeoClusterReqDto{name,description,diagramJson,baseUpdatedAt}`(전 옵셔널) ↔ `TUpdateGeoClusterReq`(전 옵셔널) — 일치.

## 중점 검증 항목

- **plain 배열 vs 래핑**: #1/#2/#8/#9 모두 BE `ApiResult<List<>>` + FE `useDmoveQuery<T[]>`로 배열 직접 소비. `{items,total}` 래핑 오소비 없음. #3~#7은 객체. ✓
- **언랩 깊이(2겹)**: axios 인터셉터 `return response.data`(1겹=envelope) → 조회는 `useDmoveQuery`가 `envelope.data`(2겹) 언랩, 변경성은 `unwrapEnvelope`가 2겹 언랩. 소비 페이지에 `data.data` 과다언랩 없음(`detail.resolvedHosts`, `o.clusterId`, `cluster.centroid.lng` 등 payload 필드 직접 접근). ✓
- **에러 경로**: BE `ApiError(map)` → `GlobalExceptionHandler` → `ApiResult.error(msg, code, errorCode).setData(data)`. HTTP 200 유지. mutation은 `unwrapEnvelope`가 `status==="error"‖code≠200` 검사 후 `GeoMapApiError` throw → react-query onError. ✓
- **GEOMAP_HOST_NO_COORDINATE data.hostids**: BE `Map.of("hostids", missing)` → envelope `data.hostids`. FE `GeoMapApiError`가 `errorCode===HOST_NO_COORDINATE`일 때 `data.hostids` 파싱해 `noCoordinateHostids`로 노출. 필드명·구조 일치. ✓
- **에러코드 5종**: BE `ErrorCode` `GEOMAP_{NOT_FOUND,CONFLICT,INVALID_DIAGRAM,TOO_LARGE,HOST_NO_COORDINATE}` ↔ FE `GEOMAP_ERROR_CODE` 문자열 5종 동일. ✓
- **낙관적 잠금 왕복**: BE `updatedAt` `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` → FE 문자열 원본 보관(`baseUpdatedAt` state, 파싱/재포맷 없음) → PATCH `baseUpdatedAt`. BE `assertNotConflict`가 동일 포맷 문자열 동등 비교. `saveAndFlush`로 fresh `updatedAt` 반환(false conflict 회피). 필드명/타입 왕복 일치. ✓
- **freeform round-trip**: BE `GeoDiagram(List<Map> hosts, List<Map> links, Map viewport)` freeform 보존 ↔ FE `serialize/deserializeGeoDiagram`이 host `{...h}`·link `{...l}`·viewport `{...vp}` 스프레드로 커스텀 필드(link color/lineStyle/label, viewport bearing/pitch) 전량 왕복. host는 hostid 문자열 강제(빈 원소 필터=BE INVALID_DIAGRAM 사전 차단). 빈 문서 viewport 기본값(127,37.5,6) BE `empty()` ↔ FE `GEOMAP_DEFAULT_VIEWPORT` 동일. ✓
- **isMain 키**: BE record `Boolean isMain`(Lombok is-접두 함정 없음) → JSON `isMain` ↔ FE `isMain`. ✓
- **nullable 옵셔널 가드**: contract-nullable `centroid`는 소비처(`GeoMapClusteringPage:45`, `ClusterPinLayer:33`) 모두 `if(centroid)` 가드 후 `.lng/.lat` 접근 — 널 역참조 없음. ✓
- **인증 헤더**: 전 EP `@SecurityRequirement(bearer)`+`@VisitorIdCheck`. FE 공통 `axiosInstance`가 Authorization·x-visitor-id 주입. ✓

## 참고(informational — 불일치 아님)

- 조회 훅(#4 getDetail / #8 getLive)은 `unwrapEnvelope`를 거치지 않으므로 `GEOMAP_NOT_FOUND` 에러 envelope(HTTP 200 + body)를 throw하지 않고 `data=undefined`로 흘린다. 이는 앱 전역 조회 패턴(인터셉터가 HTTP 200을 성공 처리)과 동일하며 네트워크맵과도 일관된 의도된 거동이다. false-success로 오염된 값이 소비되는 것은 아님(undefined). shape 불일치 아님 — 화면의 not-found UX 처리 여부는 functional-qa 런타임 검증 대상.

## 검증 파일(근거)

- BE: `geomap/GeoClusterController.java`, `GeoClusterService.java`, `GeoCoordinateResolver.java`, `dto/*.java`(9), `domain/GeoDiagram.java`·`GeoCluster.java`, `common/exception/{ApiError,ErrorCode,GlobalExceptionHandler}.java`, `common/response/ApiResult.java`
- FE: `services/geomap.api.ts`, `hooks/{useGeoMap.ts,useDmoveQuery.ts}`, `services/axiosInstance.ts`, `types/geoMap.ts`, `constants/{geoMap.ts,queryKey.ts}`, `pages/asset/geomaps/{geoDiagram.ts,geoResolve.ts,GeoMapClusteringPage.tsx,GeoMapClusterDetailPage.tsx,GeoMapClusterEditorPage.tsx,map/*,components/*}`
