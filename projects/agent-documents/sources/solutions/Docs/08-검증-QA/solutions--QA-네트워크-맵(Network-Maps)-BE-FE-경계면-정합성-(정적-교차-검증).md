# QA — 네트워크 맵(Network Maps) BE↔FE 경계면 정합성 (정적 교차 검증)

> 검증자: integration-qa (정적 shape 대조 전용, 런타임 검증은 functional-qa 담당) · 2026-07-13
> 대조 3자: `contract_network-maps.md` ↔ `moveseye-be-spring/.../networkmap/**` ↔ `moveseyee_fe/.../networkmap·types·services·hooks·constants`
> 결론: **경계면 대체로 정합**. shape/타입/필드명/래퍼 깊이/에러코드/쿼리키 모두 PASS. 실질 finding 1건(F1, FE, MEDIUM — setMain 후 baseUpdatedAt 미갱신) + 확인 권장 노트 2건.

---

## 1. 경로 · 메서드 · 요청 body (7개 EP)

| # | EP | BE (Controller) | FE (networkmap.api.ts) | 판정 |
|---|---|---|---|---|
| 1 | GET `/network-architectures` | `@GetMapping` (클래스 `@RequestMapping("/network-architectures")`) L47 | `getList` `API.get(baseUrl)` L47-49 | PASS |
| 2 | POST `/network-architectures` | `@PostMapping` `@Valid CreateReqDto` L55-58 | `create` `API.post(baseUrl, data)` L71-75 | PASS |
| 3 | GET `/network-architectures/{id}` | `@GetMapping("/{id}")` L64 | `getDetail`/`fetchDetail` L53-63 | PASS |
| 4 | PATCH `/network-architectures/{id}` | `@PatchMapping("/{id}")` `@Valid UpdateReqDto` L74-78 | `update` `API.patch(/{id}, data)` L78-86 | PASS |
| 5 | DELETE `/network-architectures/{id}` | `@DeleteMapping("/{id}")` L84 | `remove` `API.delete(/{id})` L89-93 | PASS |
| 6 | PATCH `/network-architectures/{id}/main` | `@PatchMapping("/{id}/main")` body 없음 L94 | `setMain` `API.patch(/{id}/main)` body 없음 L96-100 | PASS |
| 7 | GET `/network-architectures/{id}/live` | `@GetMapping("/{id}/live")` L105 | `getLive` `API.get(/{id}/live)` L66-68 | PASS |

**요청 body 필드 대조**
- **Create** (BE `CreateNetworkArchitectureReqDto` L18-23): `name`(@NotBlank), `description`(옵셔널) ↔ FE `TCreateNetworkArchitectureReq` `{name, description?}` + `CreateArchitectureModal` L31-34 `{name: trim, description: trim||null}`. **PASS**. name 필수/description nullable 일치.
- **Update** (BE `UpdateNetworkArchitectureReqDto` L23-35): `name`/`description`/`diagramJson`/`baseUpdatedAt` 전부 옵셔널 ↔ FE `TUpdateNetworkArchitectureReq` 동일 4필드 + `persist` L440-447 `{name, description, diagramJson, baseUpdatedAt}`. **PASS**.
  - footgun #2 준수: FE는 `linkedHostids`를 body에 **넣지 않음**(persist body 4필드만) → 서버 재추출 규약과 일치. `extractLinkedHostids`(diagram.ts L114)는 "참고용"으로만 export, 전송 안 함. **PASS**.
- 인증 헤더: axios request 인터셉터(axiosInstance.ts L40-48)가 전 요청에 `Authorization: Bearer`+`x-visitor-id` 주입 ↔ 컨트롤러 `@SecurityRequirement(bearer)`+`@VisitorIdCheck`. **PASS**.

---

## 2. 응답 shape (BE record 직렬화명 ↔ FE 타입 ↔ 컴포넌트 접근)

### 2-1. 목록 envelope `{items, total}` (EP1)
- BE `ApiResult<PaginationResponseDto<ListItemDto>>`. `PaginationResponseDto`(L11-13) Lombok `@Getter`: `items`(List)→`getItems()`→JSON `items`, `total`(long)→`getTotal()`→JSON `total`. ↔ FE `TNetworkArchitectureListRes {items, total}` (networkmap.ts L98-101). ↔ `NetworkMapListPage` L28 `data?.items`, L124 `data?.total`. **PASS**.

### 2-2. ListItem 필드 (EP1 items[])
| BE record 컴포넌트 (ListItemDto) | 타입/직렬화 | FE `TNetworkListItem` | 컴포넌트 접근 | 판정 |
|---|---|---|---|---|
| `id` | Integer→number | `id: number` | `record.id` | PASS |
| `name` | String | `name` | `dataIndex:"name"` | PASS |
| `description` | String\|null | `description: string\|null` | `renderDisplayValue` | PASS |
| `nodeCount` | int→number | `nodeCount` | `record.nodeCount` L77 | PASS |
| `edgeCount` | int→number | `edgeCount` | `record.edgeCount` L78 | PASS |
| `isMain` | **Boolean** record 컴포넌트→JSON `isMain` | `isMain: boolean` | `record.isMain` L57 | PASS(노트 N1) |
| `updatedAt` | `@JsonFormat(SSS'Z')`→string | `updatedAt: string` | `dayjs(value)` L85 | PASS |
| `updatedBy` | String\|null | `updatedBy: string\|null` | `renderDisplayValue` | PASS |

### 2-3. Detail 필드 (EP2·3·4·6 응답 = `TNetworkDetail`)
| BE record (DetailDto L16-28) | 직렬화 | FE `TNetworkDetail` (networkmap.ts L104-117) | 판정 |
|---|---|---|---|
| `id` Integer | number | `id: number` | PASS |
| `name` String | string | `name` | PASS |
| `description` String | string\|null | `description: string\|null` | PASS |
| `diagramJson` NetworkDiagram | object | `diagramJson: TNetworkDiagram` | PASS(§3) |
| `linkedHostids` List\<String\> | string[] | `linkedHostids: string[]` | PASS |
| `nodeCount` int | number | `nodeCount` | PASS |
| `edgeCount` int | number | `edgeCount` | PASS |
| `isMain` **Boolean** | JSON `isMain` | `isMain: boolean` | PASS(N1) |
| `createdBy` String | string\|null | `createdBy: string\|null` | PASS |
| `updatedBy` String | string\|null | `updatedBy: string\|null` | PASS |
| `createdAt` LocalDateTime `@JsonFormat` | string | `createdAt: string` | PASS |
| `updatedAt` LocalDateTime `@JsonFormat` | string | `updatedAt: string` | PASS |

Detail 소비: `NetworkMapEditorPage.applyDetail` L102-111 (`diagramJson`/`name`/`description`/`isMain`/`updatedAt`), `persist` L448-449 (`updatedAt`/`isMain`), `CreateArchitectureModal` L31 (`detail.id`). 접근 필드명 전부 존재. **PASS**.

### 2-4. Live 응답 원소 (EP7 = `TNetworkLiveItem[]`)
| BE record (NetworkLiveItemDto L12-16) | 직렬화 | FE `TNetworkLiveItem` (L78-83) | 컴포넌트 접근 | 판정 |
|---|---|---|---|---|
| `hostid` String | string | `hostid: string` | `toLiveMap`/`useLiveItem` | PASS |
| `available` String | "available\|unavailable\|unknown" | `available: TNetworkAvailable` | `content.tsx` L19, PropertyPanel L206 | PASS |
| `openProblemCount` **long** | number | `openProblemCount: number` | `content.tsx` L22, L226 | PASS |
| `worstSeverity` String\|null | "0"~"5"\|null | `worstSeverity: string\|null` | `content.tsx` L23-25 → `NETMAP_SEVERITY_COLOR["0"..."5"]` | PASS |

- BE `getLive` L152 `worst = agg[1] >= 0 ? String.valueOf(agg[1]) : null` → "0"~"5" 문자열 또는 null. FE `NETMAP_SEVERITY_COLOR` 키 "0"~"5"(constants L56-63)로 정확히 매핑. **PASS**.
- BE hostid distinct(LinkedHashSet, Validator L58) → live 배열 hostid 1건 ↔ FE `toLiveMap`(liveOverlay L18-26)이 hostid→item Map으로 만들어 캔버스 모든 동일 노드 일괄 매핑. **PASS**.
- 폴백: BE Zabbix 실패 시 `available:"unknown", count:0, worstSeverity:null`(항상 배열 반환). FE `live?.available ?? "unknown"`, `live?.openProblemCount ?? 0`(content L19-22) — 배열 순회 + optional 이중 방어. **PASS**.

---

## 3. diagram_json 구조 — BE Validator ↔ FE serialize (★ 최대 리스크)

BE `NetworkDiagramValidator.validate` (L35-51) 요구:
1. `diagram != null && nodes != null && edges != null` (배열 존재)
2. 모든 `node.type ∈ {host, shape, group}` (소문자, trim)
3. `type=="host"` 노드는 hostid 필수 — `data.hostid` 우선, 없으면 top-level `hostid` (L78-87)
4. 크기: 직렬화 > 1MB(`MAX_DIAGRAM_BYTES=1_048_576`, Service L49·249-251) → `NETMAP_TOO_LARGE`

FE `serializeDiagram` (diagram.ts L54-66) 산출 payload:
- `nodes: serializeNodes` L17-34 → 각 노드 `{id, type:(node.type ?? "shape"), position, data:(node.data ?? {})}` + 옵션 parentId/extent/width/height/style. **배열 항상 생성**. ✓조건1·2
- `edges: serializeEdges` L37-51 → **배열 항상 생성**. ✓조건1
- host 노드 hostid: `addHostNode` (Editor L185-200) `data:{hostid: host.hostid, ...}` — 항상 `data.hostid`에 주입. 편집 패널은 hostid 편집 미노출(라벨만) → 유실 경로 없음. ✓조건3
- `viewport:{x,y,zoom}` → BE `NetworkDiagram.viewport` `Map<String,Object>` freeform 수용. ✓

**transient strip 후 필수 필드 잔존 확인**: `serializeNodes`는 `id/type/position/data`(+영속 옵션)만 복사하고 `selected/dragging/measured` 등 transient는 미복사(diagram.ts 주석 L2-3·L17). 그럼에도 BE 필수(`type`, host의 `data.hostid`)는 보존됨. **PASS**.

**1MB 상한 처리**: FE `persist` L433-438 `new Blob([JSON.stringify(diagram)]).size > NETMAP_DIAGRAM_MAX_BYTES(1024*1024=1048576)`이면 전송 차단 + `too_large` 메시지. BE는 `objectMapper.writeValueAsBytes().length > 1_048_576`로 최종 강제. 양쪽 동일 바이트 임계·동일 strict `>`. FE 선경고 + BE 최종검증 이중화. **PASS**.

**round-trip 보존**: BE `NetworkDiagram`(record, `@JsonIgnoreProperties(ignoreUnknown=true)`) nodes/edges를 `List<Map<String,Object>>`로 보존 → parentId/extent/width/height/style/data 하위키 전부 왕복. FE `deserializeNodes` L69-83이 동일 키 복원. **PASS**.

**구조 검증 순서**: BE는 크기(L99) → 구조(L100) 순 → 둘 다 위반 시 `TOO_LARGE` 우선(footgun #5). FE는 정상 편집 흐름에서 구조 위반 payload를 만들지 않으므로(host 항상 hostid) `INVALID_DIAGRAM`은 사실상 방어적. 그래도 FE `notifySaveError` L419-425가 `INVALID_DIAGRAM` 처리 보유. **PASS**.

---

## 4. 낙관적 잠금 (baseUpdatedAt 문자열 왕복)

| 항목 | BE | FE | 판정 |
|---|---|---|---|
| 원본 문자열 보관(파싱 금지) | `updatedAt` `@JsonFormat(SSS'Z')` (DetailDto L28) | `applyDetail` L107 `setBaseUpdatedAt(data.updatedAt)` 원본 그대로, 재포맷 없음 | PASS |
| 항상 동봉 | — | `persist` L446 `baseUpdatedAt: base` 항상 실음(별도 생략 경로 없음) | PASS |
| 비교 방식 | `assertNotConflict` L236-244: `ISO_UTC.format(entity.getUpdatedAt())`(동일 패턴)과 문자열 `.equals` | 서버가 재생성한 문자열과 비교 — FE는 왕복만 | PASS |
| 저장 후 갱신 | 응답 `updatedAt` 재발급 | `persist` L448 `setBaseUpdatedAt(detailRes.updatedAt)`, overwrite L470 `fetchDetail().updatedAt` | PASS |
| CONFLICT 코드 문자열 | `NETMAP_CONFLICT` (ErrorCode L106) | `NETMAP_ERROR_CODE.CONFLICT="NETMAP_CONFLICT"` (constants L7), Editor L411 매칭 | PASS |

패턴 동일성: DTO `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` == Service `ISO_UTC` 패턴 → 동일 LocalDateTime에서 동일 문자열 생성(SSS 밀리초 truncation도 양쪽 동일). **PASS**.

### 🟡 F1 (FE, MEDIUM) — setMain 이후 baseUpdatedAt 미갱신 → 후속 저장 시 false NETMAP_CONFLICT
- **BE**: `NetworkArchitectureService.setMain` L123-132 → `entity.setMainFlag(true, actor)`(`NetworkArchitecture.java` L105-108: `isMain`+`updatedBy` 변경) → `@UpdateTimestamp`(L79-81)로 **`updatedAt`이 갱신**되고, 응답 DTO에 새 `updatedAt` 포함.
- **FE**: `NetworkMapEditorPage.handleSetMain` L490-498은 응답 `res.isMain`만 반영(`setIsMain`)하고 **`res.updatedAt`을 `baseUpdatedAt`에 반영하지 않음**. 결과: 에디터가 보유한 `baseUpdatedAt`(직전 조회값 T0)은 stale, 서버는 T1. 이어서 [저장]하면 `baseUpdatedAt=T0 != 서버 T1` → 서버가 `NETMAP_CONFLICT` 반환(실제 충돌 아님).
- **차이**: setMain 응답 shape는 정상(`updatedAt` 존재). FE의 **응답 필드 소비 누락**(경계면 consumption gap).
- **수정 주체/제안(FE)**: `handleSetMain`에서 `setBaseUpdatedAt(res.updatedAt)` 추가(응답으로 잠금 기준 재동기화). 위치: `NetworkMapEditorPage.tsx` L492-493.
  ```ts
  const res = await setMainAsync(id ?? "");
  setIsMain(res.isMain);
  setBaseUpdatedAt(res.updatedAt); // ← 추가: setMain이 updatedAt을 bump하므로 잠금 기준 재동기화
  ```
- 비고: 실제 conflict는 런타임에 재현되므로 functional-qa 확인 권장(경계는 shape 정상, 소비 누락). BE 변경 불필요.

---

## 5. 에러코드 4종 · 언랩 깊이 · 403/200

**에러코드 문자열 대조** (BE `ErrorCode.java` L105-108 ↔ FE `NETMAP_ERROR_CODE` constants L5-10):

| BE enum | 문자열 | FE 키 | FE 문자열 | 판정 |
|---|---|---|---|---|
| `NETMAP_NOT_FOUND` | "NETMAP_NOT_FOUND" | `NOT_FOUND` | "NETMAP_NOT_FOUND" | PASS |
| `NETMAP_CONFLICT` | "NETMAP_CONFLICT" | `CONFLICT` | "NETMAP_CONFLICT" | PASS |
| `NETMAP_INVALID_DIAGRAM` | "NETMAP_INVALID_DIAGRAM" | `INVALID_DIAGRAM` | "NETMAP_INVALID_DIAGRAM" | PASS |
| `NETMAP_TOO_LARGE` | "NETMAP_TOO_LARGE" | `TOO_LARGE` | "NETMAP_TOO_LARGE" | PASS |

- `NETMAP_DUPLICATE_NAME` 미존재 확인: BE enum에 없음(이름 유니크 미강제, CreateReqDto 주석 L10-11) ↔ FE constants 주석 L4에도 "존재하지 않음" 명시. **PASS**.
- 403 없음: 이 도메인 `requireAdmin` 미적용(컨트롤러 주석 L31-33, 전 EP U) — 403 경로 자체 부재. **PASS**.

**언랩 깊이 (2겹 → payload 직접 수신)**:
- 1겹: axios 응답 인터셉터 `return response.data ?? response`(axiosInstance L60) → HTTP→ApiResult envelope.
- 2겹(조회): `useDmoveQuery`(useDmoveQuery.ts L22-27) `envelope.data` 추출 → 소비자는 payload 직접 수신.
- 조회 소비 검증: 목록 `data?.items`(ListPage L28), 상세 `detail.diagramJson`(Editor L102), live `toLiveMap(liveItems)`(Editor L97). **`data.data` 과다 언랩 없음**. **PASS**.
- 변경성(mutation): service가 `.then(unwrapEnvelope)`(networkmap.api L71-100)로 직접 1회 언랩(useDmoveQuery 미경유) → `TNetworkDetail`/`null` payload 반환. `unwrapEnvelope` L35-44는 `status==="error" || code!==200`이면 `NetworkMapApiError` throw(errorCode 보존) → onError로 전파. **PASS**.
- 명령형 상세 `fetchDetail`(L59-63)도 `.then(unwrapEnvelope)`로 payload 반환(conflict overwrite에서 `fresh.updatedAt` 접근). **PASS**.
- 403→200 envelope 오인 방지: BE 업무에러는 HTTP 200 + `{status:"error", code:400, errorCode}`. axios 인터셉터는 200이라 success로 흘리지만, mutation 경로의 `unwrapEnvelope`가 `status==="error"`/`code!==200`을 검사해 throw. **PASS**.

---

## 6. 쿼리키 네임스페이스 · invalidate 범위

- `NETMAP_QUERY_KEY`(queryKey.ts L153-158): `LIST="NetworkMapList"`, `DETAIL="NetworkMapDetail"`, `LIVE="NetworkMapLive"`, `HOST_SEARCH="NetworkMapHostSearch"`.
- `ASSET_QUERY_KEY`(L143-149) `"AssetList"`/`"AssetDetail"`… , `ASSET_LEGACY_QUERY_KEY`(L162-165) `"AssetLegacyList"`… , 기타 도메인 키 — **문자열 중복 0건**. **PASS** (footgun 쿼리키 분리 준수).
- invalidate 범위(useNetworkMap L67-73): `invalidateList`→`[LIST]`, `invalidateDetail`→`[DETAIL]`(prefix, 전 id detail). mutation onSuccess에서 생성=list만, 수정/main=list+detail. LIVE/HOST_SEARCH 미무효화(의도적: live는 수동 refetch, 검색은 keyword별 캐시). 교차오염 없음. **PASS**.

---

## 확인 권장 노트 (FAIL 아님)

### N1 (BE, 확인 권장) — `isMain` record Boolean 직렬화 키
- BE `ListItemDto`/`DetailDto`의 `isMain`은 **Java record 컴포넌트(Boolean)**다. record는 Jackson `RecordNaming`으로 컴포넌트명을 그대로 property로 쓰므로 JSON 키 = `isMain`(is-접두 stripping 미적용). 이는 BE CLAUDE.md #5의 **Lombok POJO** `boolean isXxx` 함정과 다른 경로다(엔티티 주석 `NetworkArchitecture.java` L35-36도 "JSON 키는 DTO가 결정"이라 명시). 정적 분석상 **PASS**.
- 다만 이 코드베이스의 #1 트랩이고 오배치 시 main 별표/상태 전멸이므로, `/v3/api-docs` 또는 실제 목록 응답에서 JSON 키가 `isMain`(≠`main`)인지 **1줄 런타임 확인 권장**. (functional-qa가 겸사 확인 가능.)

### N2 (앱 전역, 정보) — `useDmoveQuery` syncTime `Number()` 강제
- `useDmoveQuery` L27 `syncTime: Number(envelope?.syncTime)`. 계약 §0은 syncTime을 "문자열/null"로 규정 — ISO 문자열이면 `Number()`→`NaN`. `NetworkMapListPage`가 `syncTime`을 `DmoveTable`에 전달(L125). 네트워크맵 국한 이슈가 아니라 useDmoveQuery 공통 거동이며 기존 화면과 동일하므로 이 기능의 경계면 FAIL 아님. DmoveTable의 syncTime 표시 방어에 의존(런타임 표시 영향은 functional-qa 영역).

---

## 요약

- **경계면 정합**: 경로/메서드/요청·응답 필드/diagram_json 검증 통과 shape/낙관적 잠금 문자열 왕복/에러코드 4종/언랩 2겹/쿼리키 분리 — 모두 PASS.
- **실질 finding 1건**: **F1 (FE, MEDIUM)** — `handleSetMain`이 setMain 응답의 `updatedAt`을 `baseUpdatedAt`에 미반영 → 이후 저장에서 false `NETMAP_CONFLICT`. 수정: `NetworkMapEditorPage.tsx` L492에 `setBaseUpdatedAt(res.updatedAt)` 추가. BE 변경 불필요.
- **확인 권장 2건**: N1(record `isMain` JSON 키 런타임 확인), N2(syncTime Number 강제, 앱 전역·정보).
