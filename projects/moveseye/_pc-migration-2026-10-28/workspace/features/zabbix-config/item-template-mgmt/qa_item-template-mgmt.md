# QA — Zabbix 아이템·템플릿 관리 (item-template-mgmt) 정적 경계면 검증

- **검증 유형**: 정적 교차 대조(경로/메서드/필드명/타입/옵셔널/래퍼 깊이/에러 계약). 런타임 미기동.
- **검증일**: 2026-07-20
- **대조 3원천**: `features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md` ↔ BE `zabbix/manage/**` ↔ FE `zabbix-item-template.*` + 페이지 8종
- **총평**: **PASS** — HIGH/MEDIUM 불일치 0건. LOW(정보성/기존패턴) 3건. functional-qa 진행 가능.

---

## 1. 엔드포인트 검증 매트릭스 (EP별 PASS/FAIL)

| # | EP | BE 경로/메서드 | FE api URL/메서드 | 요청 | 응답 shape | 판정 |
|---|---|---|---|---|---|---|
| 1-1 | 아이템 목록 | GET `/zabbix-manage/items` `@ModelAttribute` | GET `zabbix-manage/items` params | hostid/templateid/search/status/limit/offset | `PagedListDto<ManagedItemDto>` | PASS |
| 1-2 | 아이템 상세 | GET `/zabbix-manage/items/{itemid}` | GET `zabbix-manage/items/{itemid}` | path | `ManagedItemDto` | PASS(주3) |
| 1-3 | 아이템 생성 | POST `/zabbix-manage/items` | POST `zabbix-manage/items` | `ItemCreateReqDto` | `ManagedItemDto` | PASS |
| 1-4 | 아이템 수정 | PUT `/zabbix-manage/items/{itemid}` | PUT 동일 | `ItemUpdateReqDto` | `ManagedItemDto` | PASS |
| 1-5 | 상태 토글 | PATCH `/zabbix-manage/items/{itemid}/status` | PATCH 동일 | `ItemStatusReqDto{enabled}` | `ItemStatusResDto` | PASS |
| 1-6 | 아이템 삭제 | DELETE `/zabbix-manage/items` (body) | DELETE `zabbix-manage/items` `{data:body}` | `ItemDeleteReqDto{itemIds}` | `ItemDeleteResDto` | PASS |
| 2-1 | 템플릿 목록 | GET `/zabbix-manage/templates` | GET `zabbix-manage/templates` | search/groupids/limit/offset | `PagedListDto<ManagedTemplateDto>` | PASS |
| 2-2 | 템플릿 상세 | GET `/zabbix-manage/templates/{templateid}` | GET 동일 | path | `ManagedTemplateDetailDto` | PASS |
| 2-3 | 템플릿 생성 | POST `/zabbix-manage/templates` | POST 동일 | `TemplateCreateReqDto` | `ManagedTemplateDto` | PASS |
| 2-4 | 템플릿 수정 | PUT `/zabbix-manage/templates/{templateid}` | PUT 동일 | `TemplateUpdateReqDto` | `ManagedTemplateDto` | PASS |
| 2-5 | 템플릿 삭제 | DELETE `/zabbix-manage/templates` (body) | DELETE `{data:body}` | `TemplateDeleteReqDto{templateIds}` | `TemplateDeleteResDto` | PASS |
| 2-6 | 호스트 연결 | POST `/zabbix-manage/templates/{templateid}/link` | POST 동일 | `TemplateLinkReqDto{hostIds}` | `TemplateLinkResDto` | PASS |
| 2-7 | 호스트 해제 | POST `/zabbix-manage/templates/{templateid}/unlink` | POST 동일 | `TemplateLinkReqDto{hostIds,clear}` | `TemplateLinkResDto` | PASS |
| 2-8 | 템플릿 그룹 | GET `/zabbix-manage/template-groups` `@RequestParam` | GET `params:{keyword,limit}` | keyword/limit | `TemplateGroupRefDto[]` | PASS |

> 경로축: BE 아이템 컨트롤러 클래스 `@RequestMapping("/zabbix-manage/items")`, 템플릿 컨트롤러 `@RequestMapping("/zabbix-manage")` + 메서드 `/templates`·`/template-groups`. FE `baseUrl="zabbix-manage"`(axios baseURL `/api/v1` 접두, host-manage와 동일 규약). 15개 경로/메서드 전부 일치.

---

## 2. 응답 DTO 필드 대조 (1순위 — 오타/타입/nullable/Lombok is-접두)

### ManagedItemDto (record) — PASS
BE JSON 키 = record 컴포넌트명. FE `TManagedItem`과 16필드 전부 일치:
`itemid, hostid, hostName, name, key, type, valueType, status, delay, units, lastValue, lastClock, description, flags, interfaceid, templateid`.
- ⚠️ 케이싱 비대칭 `interfaceid`(소문자) vs `lastValue/lastClock`(카멜) — **양측이 동일하게 보존**(`ManagedItemDto` record `interfaceid` ↔ FE `interfaceid`). 함정 아님, PASS.
- `type/valueType/status/flags/templateid`는 BE `str()`로 Zabbix 원시 **문자열** 반환(`ZabbixItemManageService.toManagedItem` L263-279) ↔ FE 전부 `string`. PASS.
- nullable: `hostName/delay/units/lastValue/lastClock/description/interfaceid` → FE `| null`. `ApiResult`의 `@JsonInclude(NON_NULL)`은 **래퍼에만** 적용(중첩 DTO null은 null로 직렬화, ApiResult 주석 명시) → FE `string | null` 계약 유지. PASS.
- Lombok is-접두 함정 없음(record라 getter 변형 없음, boolean 필드 없음).

### ManagedTemplateDto / DetailDto — PASS
- 목록: `templateid, name, displayName, description, itemCount, linkedHostCount, groups` ↔ FE `TManagedTemplate` 일치.
- 상세: `+ linkedHosts, parentTemplates`, `- linkedHostCount` ↔ FE `TManagedTemplateDetail` 일치.
- `displayName`: BE `visible 없으면 host로 폴백`(L276/295) → 항상 non-null ↔ FE `string`(non-null). PASS.
- `groups/linkedHosts/parentTemplates`: BE 빈 리스트 반환(null 아님) ↔ FE 배열. PASS.
- 내부 원시키(`templategroups`, `parentTemplates`, select "count")는 서비스에서 올바르게 매핑(`groupDtos`, `countOf`).

### 참조/결과 DTO — PASS
- `TemplateGroupRefDto{groupid,name}`, `LinkedHostRefDto{hostid,name}`, `TemplateRefDto{templateid,name}` ↔ FE `TTemplateGroupRef/TLinkedHostRef/TTemplateRef` 일치.
- `ItemStatusResDto{itemid,status}`(status는 `String.valueOf(status)` 문자열) ↔ FE `TItemStatusRes{itemid,status:string}` 일치.
- `ItemDeleteResDto{itemids,count}` / `TemplateDeleteResDto{templateids,count}` ↔ FE 일치.
  - ⚠️ 요청은 `itemIds`/`templateIds`(카멜), 응답은 `itemids`/`templateids`(소문자) — **의도적 비대칭이 양측 정확히 미러링**. 함정 아님, PASS.
- `TemplateLinkResDto{templateid,hostIds,linkedHostCount}` ↔ FE `TTemplateLinkRes` 일치(`hostIds` 카멜 유지).

---

## 3. 요청 body/쿼리 대조 (이름/타입/필수·옵셔널)

| DTO | BE validation | FE 타입/전송 | 판정 |
|---|---|---|---|
| ItemCreateReqDto | name/key `@NotBlank`, type/valueType `@NotNull(Integer)` | name/key/type/valueType 필수, type/valueType `number` | PASS |
| — 정수 전송 | type/valueType `Integer` | Select option value가 number, 편집 시 `Number(item.type)` (ItemFormDrawer L94/103/129) | PASS |
| — interfaceId | optional(미지정 시 자동해석) | FE 미전송(폼에 없음) → BE main agent 자동해석 | PASS |
| — masterItemId | optional | 생성+type=18일 때만 전송(L195) | PASS |
| ItemUpdateReqDto | 전부 optional | 전부 optional(FE는 name/key/type/valueType 항상 포함 — 부분수정 의미 유지) | PASS |
| ItemStatusReqDto | enabled `Boolean @NotNull` | `{enabled:boolean}` (ItemTab L165 → 훅) | PASS |
| ItemDeleteReqDto | itemIds `@NotEmpty` | `{itemIds:string[]}` | PASS |
| TemplateCreateReqDto | name `@NotBlank`, groupIds `@NotEmpty` | name/groupIds 필수, displayName/description/linkTemplateIds optional(생성만) | PASS |
| TemplateUpdateReqDto | 전부 optional, groupIds 주면 교체 | 전부 optional(TemplateFormDrawer L124-128) | PASS |
| TemplateDeleteReqDto | templateIds `@NotEmpty` | `{templateIds}` | PASS |
| TemplateLinkReqDto | hostIds `@NotEmpty`, clear `Boolean=false` | `{hostIds}`(link) / `{hostIds,clear}`(unlink, TemplateDetailDrawer L103/121) | PASS |
| ManagedItemListReqDto | status `Integer` | status `number` | PASS |
| ManagedTemplateListReqDto | groupids `List<String>` `@ModelAttribute` | `groupids:string[]`, `serializerObjParams`가 `groupids=10&groupids=11` 반복파라미터로 직렬화(brackets 제거) → List 바인딩 일치 | PASS |
| template-groups | `@RequestParam keyword,limit` | `params:{keyword,limit}` | PASS |

---

## 4. 공통 래퍼 언랩 깊이 — PASS (핵심 검증)

- BE: 모든 EP `new ApiResult<T>().success(payload)` → `{status:"success", code:200, data:payload}`. `ApiStatus` `@JsonValue` = 소문자 `"success"/"error"`.
- FE 1겹: `axiosInstance` response 인터셉터가 `return response.data`(= ApiResult envelope). (axiosInstance L85)
- FE 2겹(조회): `useDmoveQuery`가 `queryResponse.data`(envelope)에서 `.data` 추출 → 소비자는 payload 직접 수신. (useDmoveQuery)
- FE 2겹(변경): service의 `.then(unwrapEnvelope)`가 envelope에서 `.data` 추출. `unwrapEnvelope`는 envelope(1겹 언랩 결과)을 받아 `.data` 반환 → **과다/과소 언랩 없음**. (api L56-65)
- ✅ `data.data` 과다언랩 버그 없음. 조회는 useDmoveQuery, 변경은 unwrapEnvelope로 각각 정확히 1회 2겹 언랩.

---

## 5. 에러 계약 — PASS (변경 경로) / LOW (조회 경로)

- **변경(mutation)**: `unwrapEnvelope`가 `status==="error" || code!==200`이면 `ZabbixManageApiError` throw → react-query `onError`. FE `handleError`가 `code===403`→권한거부 메시지, 그 외 `error.message`(=errorCode 문자열) 표시. (ItemFormDrawer L144-157)
  - 403→HTTP200+body `code:403` 관례를 FE가 올바르게 실패로 판정(`hasFailureCode`). PASS.
  - 신규 ErrorCode 8종(`ITEM_NOT_FOUND/ITEM_TARGET_REQUIRED/ITEM_CREATE_FAILED/ITEM_IDS_REQUIRED/TEMPLATE_NOT_FOUND/TEMPLATE_CREATE_FAILED/TEMPLATE_IDS_REQUIRED/TEMPLATE_HOST_IDS_REQUIRED`) 전부 ErrorCode enum 존재(L122-129) → envelope.message로 내려와 FE에서 표시 가능. PASS.
  - Bean Validation 위반 메시지(`name is required` 등)도 envelope.message로 표시됨. PASS.
- **조회(query)**: 아래 LOW-1 참조.

## 6. 인증 헤더 — PASS
- 두 컨트롤러 `@VisitorIdCheck` + `@SecurityRequirement`. 권한은 각 메서드 `AdminAccessChecker.requireAdmin`(userRole 기준, roleid=null admin 함정 회피 — CLAUDE.md 주의사항 #2 준수).
- FE는 `axiosInstance` 공통(withCredentials 쿠키 + x-visitor-id 요청 인터셉터). 기능별 추가 헤더 불필요. PASS.

---

## 7. 불일치 목록

**HIGH: 0건. MEDIUM: 0건.**

| ID | 심각도 | 책임 | 내용 | 근거 |
|---|---|---|---|---|
| LOW-1 | LOW(기존패턴) | FE/프레임워크 | GET 조회 EP는 `unwrapEnvelope`를 거치지 않아, HTTP200+body error(비관리자 403, `*_NOT_FOUND`) 시 `useDmoveQuery`가 throw 없이 `data=undefined` 반환 → 에러 미표시(빈 상태 렌더). 앱 전역 useDmoveQuery 관례로 본 기능 신규 결함 아님. 조회 화면은 권한 게이팅으로 진입하므로 403 실발생 가능성 낮고, 상세 NOT_FOUND는 빈 Drawer. | `useDmoveQuery.ts`, `zabbix-item-template.api.ts` L70-79(getItemList/getItem은 unwrap 미적용) |
| LOW-2 | LOW | FE | `getItem`(GET 아이템 상세) service 함수가 정의됐으나 소비 훅 없음(편집은 목록 row의 `TManagedItem` 직접 사용). 데드코드. | `zabbix-item-template.api.ts` L77; `useZabbixItemTemplate.ts`에 useItem 부재 |
| LOW-3 | LOW(코스메틱) | FE | `TTemplateGroupListParams` 타입 정의됐으나 `getTemplateGroups(keyword?,limit?)`는 위치인자 사용 — 타입 미참조. 동작 영향 없음. | `types` L206-210, `api` L191-196 |

> 계약서(features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md)는 BE/FE 코드와 전 항목 일치 — 계약서發 불일치 0건.

---

## 8. 최종 판정
- **PASS**. 경로·메서드·요청·응답·래퍼깊이·에러·인증 전 항목 정합. HIGH/MEDIUM 0.
- LOW 3건은 모두 비차단(기존 앱 패턴/데드코드/코스메틱).
- **functional-qa 진행 가능** — 런타임 행위(정수 전송 실제 수용, interfaceid 자동해석, link/unlink clear 동작, 403 실응답, Zabbix 원시문자열 표시 매핑) 검증 권장.

---

# 9. 템플릿 그룹 관리(§2-B, 2-9~2-13) + 키 조회(§1-1b) 경계면 검증 (2026-07-20 추가)

> 위 섹션(1~8)은 아이템·템플릿 13개 EP만 다룸(신규 §2-B·§1-1b 미포함). 본 섹션에서 신규 2기능 6개 EP를 추가 대조.
> BE: `ZabbixTemplateGroupManageController/Service`(신규 컨트롤러) + `ZabbixItemManageController.keys`. FE: `TemplateGroupList/FormModal/DeleteModal.tsx`, `ItemFormDrawer.tsx`(AutoComplete)+`KeyCatalogModal.tsx`.

## 9-1. 엔드포인트 매트릭스

| # | EP | BE 경로/메서드 | FE api URL/메서드 | 요청 | 응답 shape | 판정 |
|---|---|---|---|---|---|---|
| 1-1b | 키 자동완성 | GET `/zabbix-manage/items/keys` `@RequestParam` | GET `zabbix-manage/items/keys` params | hostid/templateid/search/limit | `List<ItemKeyDto>`(단순배열) | PASS |
| 2-9 | 그룹 관리목록 | GET `/zabbix-manage/template-groups/list` `@ModelAttribute` | GET `zabbix-manage/template-groups/list` params | search/limit/offset | `PagedListDto<ManagedTemplateGroupDto>` | PASS |
| 2-10 | 그룹 상세 | GET `/zabbix-manage/template-groups/{groupid}` | GET 동일 | path | `ManagedTemplateGroupDto` | PASS(주 LOW-4) |
| 2-11 | 그룹 생성 | POST `/zabbix-manage/template-groups` | POST `zabbix-manage/template-groups` | `TemplateGroupCreateReqDto{name}` | `ManagedTemplateGroupDto` | PASS |
| 2-12 | 그룹 수정 | PUT `/zabbix-manage/template-groups/{groupid}` | PUT 동일 | `TemplateGroupUpdateReqDto{name}` | `ManagedTemplateGroupDto` | PASS |
| 2-13 | 그룹 삭제 | DELETE `/zabbix-manage/template-groups` (body) | DELETE `{data:body}` | `TemplateGroupDeleteReqDto{groupIds}` | `TemplateGroupDeleteResDto{groupids,count}` | PASS |

**경로 분리 핵심 점검(요청받은 항목):**
- **관리목록 `/list` vs select `/template-groups`(§2-8) 분리 소비 — PASS.** 신규 컨트롤러 `@RequestMapping("/zabbix-manage/template-groups")`는 `GET ""`를 매핑하지 않음(관리목록은 literal `/list`) → 기존 select GET(`ZabbixTemplateManageController` 소재, `TemplateGroupRefDto[]`)과 경로 충돌 없음. FE도 `getTemplateGroupList`(→`/list`, `TManagedTemplateGroupListResponse`)와 `getTemplateGroups`(→`/template-groups`, `TTemplateGroupRef[]`)로 함수 분리, 각각 다른 payload 타입. PASS.
- **queryKey 분리 — PASS.** `TEMPLATE_GROUP_LIST:"ZabbixTemplateGroupList"`(관리목록) ≠ `TEMPLATE_GROUPS:"ZabbixTemplateGroups"`(select). 캐시 충돌 없음. (`queryKey.ts` L87·L89)
- **생성/삭제가 select GET과 같은 경로 공존 — PASS.** POST/DELETE `/template-groups`는 GET select와 HTTP 메서드가 달라 Spring이 메서드로 라우팅. FE도 동일 경로에 method만 다르게 호출.
- **키 조회 경로 `/items/keys` — PASS.** 초안 `/item-keys`에서 조정된 최종 경로 `/zabbix-manage/items/keys`로 BE·FE 일치. literal `/keys`가 `/{itemid}`보다 우선 매칭(Spring PathPattern 리터럴 우선) → 상세 EP와 충돌 없음(items /keys ↔ template-groups /list 동일 패턴).

## 9-2. 응답 DTO 필드 대조 (1순위)

### ItemKeyDto (record) — PASS
- BE `ItemKeyDto{key:String, name:String(nullable), type:String(nullable)}` ↔ FE `TItemKeyDto{key:string, name:string|null, type:string|null}`. 3필드 정확 일치.
- **`type`이 Zabbix 원시 문자열인지 — PASS.** 서비스 `itemKeys`가 `str(i.get("type"))`로 문자열 반환(`ZabbixItemManageService` L137), output에 `type` 포함(L118). FE `type:string|null`. host-manage 원시문자열 관례 유지.
- **페이징 래퍼 아님 — PASS.** BE `ApiResult<List<ItemKeyDto>>`(단순 배열), FE `Promise<TItemKeyDto[]>`. `PagedListDto` 아님. 계약 §1-1b 일치.
- key 기준 중복제거(`byKey.putIfAbsent`, L131-138), `limit` 클램프 후 반환. name/type은 같은 key 첫 항목 대표값 → nullable 정합.

### ManagedTemplateGroupDto (record) — PASS
- BE `{groupid:String, name:String, templateCount:int}` ↔ FE `TManagedTemplateGroup{groupid:string, name:string, templateCount:number}`. 3필드 일치.
- **`templateCount` 타입 — PASS(숫자).** BE `int` primitive(record L13), 서비스 `countOf()`가 selectTemplates "count"(문자열/숫자/배열)를 `int`로 환산(L185-200) → JSON은 숫자. FE `number`. **문자열/숫자 불일치 없음.** (2-9 매트릭스 요청 점검 항목 해소)
- 상세(2-10)·생성(2-11)·수정(2-12) 응답 모두 동일 `ManagedTemplateGroupDto`(templateCount 포함) ↔ FE 동일 타입 재사용. PASS.

### TemplateGroupDeleteResDto (record) — PASS
- BE `{groupids:List<String>, count:int}` ↔ FE `TTemplateGroupDeleteRes{groupids:string[], count:number}`. 일치.
- **요청/응답 카멜·소문자 미러링 — PASS.** 요청 `TemplateGroupDeleteReqDto.groupIds`(카멜) ↔ FE req `{groupIds}`; 응답 `groupids`(소문자) ↔ FE res `{groupids}`. 아이템/템플릿 삭제와 동일한 의도적 비대칭이 양측 정확히 미러링.

## 9-3. 요청 body/쿼리 대조

| DTO | BE validation | FE 타입/전송 | 판정 |
|---|---|---|---|
| ManagedTemplateGroupListReqDto | search/limit/offset(safeLimit 1~200, 기본20) `@ModelAttribute` | `{search,limit,offset}`(TemplateGroupList L37-41: URL `keyword`→`search`, offset/limit 숫자변환) | PASS |
| TemplateGroupCreateReqDto | name `@NotBlank("name is required")` | `{name}`(FormModal onFinish, name.trim()) | PASS |
| TemplateGroupUpdateReqDto | name `@NotBlank` | `{name}`(FormModal, 동일 모달 isEdit 분기) | PASS |
| TemplateGroupDeleteReqDto | groupIds `@NotEmpty("groupIds is required")` | `{groupIds:string[]}`(DeleteModal `groups.map(g=>g.groupid)`) | PASS |
| items/keys 쿼리 | hostid/templateid/search/limit `@RequestParam(required=false)` | `TItemKeyListParams{hostid,templateid,search,limit}` | PASS |

- **그룹 create/update `name` 필수 — PASS.** BE `@NotBlank`, FE 폼 `rules[{required:true}]`(FormModal L103-110) 양측 강제. 미입력 시 FE 폼검증 선차단, 우회 시 BE `name is required` envelope.message.
- **키 조회 스코프 필수(무스코프 금지 정책) — PASS.** BE는 hostid/templateid 둘 다 null이면 `ITEM_TARGET_REQUIRED` throw(`itemKeys` L111-113). FE `useItemKeys` enabled=`open && !!scopeId`(ItemFormDrawer L100) → 스코프 없이는 애초에 호출 안 함. 이중 방어.
- **ItemFormDrawer가 scopeId를 templateid로 전달 — PASS.** `useItemKeys(isHostScope?scopeId:undefined, isHostScope?undefined:scopeId, ...)`(L96-101): 호스트 스코프면 hostid=scopeId, 템플릿 스코프면 templateid=scopeId. 서비스 `getItemKeys`가 각각 매핑. 계약의 hostid 우선·조건필수 규칙과 정합.
- **limit — PASS.** FE 훅 `limit:50` 하드코딩(useZabbixItemTemplate L69), BE 기본 50(L114). 일치.

## 9-4. 래퍼 언랩 깊이 — PASS

- **조회(2-9 getTemplateGroupList / 1-1b getItemKeys) — 2겹 언랩 payload 직접 수신.** 두 함수 모두 `API.get(...)` 직반환(unwrapEnvelope 미적용), 훅 `useTemplateGroupList`/`useItemKeys`가 `useDmoveQuery`로 2겹째 언랩. `data.items`(TemplateGroupList L44)·`existingKeys.map`(ItemFormDrawer L173)로 payload 직접 소비 → **과다언랩(data.data) 없음.** PASS.
- **변경(2-11/2-12/2-13 create/update/delete group) — unwrapEnvelope로 envelope 실패 throw.** service 3함수 모두 `.then(unwrapEnvelope)`(api L235/246/256), 훅은 useMutation. `unwrapEnvelope`가 `status==="error"||code!==200`이면 `ZabbixManageApiError` throw → onError. **과소언랩 없음.** PASS.

## 9-5. 에러 계약 — PASS

- **그룹 삭제 거부(비어있지 않은/마지막 그룹 → Zabbix -32602 → code:400+원문) FE 노출 — PASS.** BE는 특별 ErrorCode 없이 Zabbix 원문을 code:400+message로 전달(서비스 주석 L30-31, BUG-2). FE `TemplateGroupDeleteModal.onError`: 403→권한거부 메시지, 그 외 `error instanceof ZabbixManageApiError && error.message`→`message.error(error.message)`로 Zabbix 원문 그대로 노출(DeleteModal L52-66). `ZabbixManageApiError.message = envelope.message`(api L57)로 원문 보존. PASS.
- **신규 ErrorCode(TEMPLATE_GROUP_*) FE 처리 가능 — PASS(단 LOW-5).** `TEMPLATE_GROUP_NOT_FOUND/CREATE_FAILED/IDS_REQUIRED` 3종 ErrorCode enum 존재(ErrorCode.java L132-134). mutation 경로에서 envelope.message로 내려와 `message.error`로 표시됨(크래시 없음). 단 FE i18n 미매핑 → 원시 코드 문자열 노출(LOW-5). 실발생 가능성 낮음(IDS_REQUIRED는 FE가 항상 배열 전송, NOT_FOUND는 삭제 경로 미검사, CREATE_FAILED는 드묾).
- **403→200 body code — PASS.** FormModal/DeleteModal 모두 `error.code === HTTP_STATUS.FORBIDDEN` 분기로 권한거부 국제화 메시지. `unwrapEnvelope`의 `hasFailureCode`(code!==200)가 403을 실패로 판정.

## 9-6. 인증 헤더 — PASS
- 신규 `ZabbixTemplateGroupManageController` `@VisitorIdCheck`+`@SecurityRequirement(bearer)`, 각 메서드 `AdminAccessChecker.requireAdmin`(userRole 기준, roleid=null admin 함정 회피). 키 조회는 `ZabbixItemManageController.keys`도 동일 `requireAdmin`(L72).
- FE는 `axiosInstance` 공통(withCredentials 쿠키 + x-visitor-id). 추가 헤더 불필요. PASS.

## 9-7. 카탈로그(정적) 확인
- `constants/zabbix-agent-keys.ts`(`ZABBIX_AGENT_KEY_CATALOG`)는 FE 내장 정적 카탈로그 — BE 대응 없음(경계면 대조 대상 아님). 존재 확인 완료. ItemFormDrawer/KeyCatalogModal은 카탈로그에서 `key`(+옵션 `valueType`) 필드만 소비, BE `ItemKeyDto`의 `key` 필드와는 별개(중복제거 병합용 `catalogKeys` Set에만 사용, ItemFormDrawer L189). 경계면 영향 없음.

## 9-8. 신규 불일치 목록 (§2-B·§1-1b)

**HIGH: 0건. MEDIUM: 0건.**

| ID | 심각도 | 책임 | 내용 | 근거 |
|---|---|---|---|---|
| LOW-4 | LOW | FE | `getTemplateGroupDetail`(2-10) service 함수·`TEMPLATE_GROUP_DETAIL` queryKey 정의됐으나 소비 훅 없음(편집은 목록 row의 `TManagedTemplateGroup` 직접 전달, TemplateGroupList `openEdit`). 데드코드, BE EP는 정상. | `api` L215-220; `useZabbixItemTemplate.ts`에 useTemplateGroupDetail 부재 |
| LOW-5 | LOW(i18n) | FE | `TEMPLATE_GROUP_NOT_FOUND/CREATE_FAILED/IDS_REQUIRED` 발생 시 FE i18n 미매핑으로 원시 코드 문자열이 `message.error`로 노출(원문형 Zabbix 메시지와 달리 사용자 친화적이지 않음). 크래시 아님, 실발생 가능성 낮음. | `FormModal`/`DeleteModal` onError, `locales` 미등록 |

> 계약서(§2-B, §1-1b, §10, §10-b)는 BE·FE 코드와 전 항목 일치 — 계약서發 불일치 0건.

## 9-9. 신규 2기능 최종 판정
- **PASS**. 템플릿 그룹 관리 5EP + 키 조회 1EP 전부 경로·메서드·요청·응답·래퍼깊이·에러·인증·스코프 정합. HIGH/MEDIUM 0.
- 요청받은 핵심 점검(관리목록/select 분리 소비·queryKey 분리·키 경로 `/items/keys`·templateCount 숫자형·groupIds 미러링·스코프 필수·무스코프 금지) **전항목 통과**.
- LOW-4/5는 비차단(데드코드/i18n 코스메틱).
- **functional-qa 진행 가능** — 런타임 검증 권장 항목: (1) 그룹 삭제 시 Zabbix 원문 메시지 실노출(비어있지 않은/마지막 그룹), (2) 키 자동완성이 스코프 내 실제 key_ 제안+카탈로그 병합, (3) templateCount 실집계값, (4) 그룹 생성→FE select(TEMPLATE_GROUPS) 캐시 무효화 반영.
