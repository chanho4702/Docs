# QA — 자산 비용(Cost) M1 경계면 정합성 (정적)

> 수행: integration-qa · 2026-07-30 · 앱 미기동(정적 대조만)
> 삼각 대조: `_workspace/features/assets/asset-cost/contract_asset-cost.md` ↔ `moveseye-be-spring/.../cost/**` ↔ `moveseyee_fe/src/**`
> 런타임 행위(실제 저장/렌더/정렬 화면)는 functional-qa 담당.

---

## 0. 결론 요약

| 심각도 | 건수 |
|---|---|
| HIGH | **0** |
| MEDIUM | 4 |
| LOW | 7 |
| PASS(중점 확인 항목) | 10 |

**중점 위험 지점 4개(costInput 3중 일치 · null 규약 · undefined/null 분기 · enum 어휘)는 전부 PASS다.**
발견된 MEDIUM은 전부 **FE 측 표시/에러 처리** 문제이며 데이터 손상 경로는 없다.

---

## 1. 발견 사항

### [MEDIUM] M-1. 조회(GET) 에러가 FE에서 조용히 삼켜져 "0원 · 0건" 화면이 된다 — 책임: FE

- **BE 근거**
  - `GlobalExceptionHandler.java:27-35` — `ApiError`는 **HTTP 200** + body `{status:"error", code:400, errorCode:"..."}` 로 나간다(`ResponseEntity.ok`).
  - `cost/dto/SearchCostHwDto.java:100-116` — `periodStart > periodEnd` 면 `COST_INVALID_QUERY_PERIOD` throw.
- **FE 근거**
  - `services/cost.api.ts:75-84` — `getHwList`/`getIncomplete`는 `unwrapEnvelope`를 거치지 않고 envelope를 그대로 반환(조회 관례).
  - `hooks/useDmoveQuery.ts:23-27` — `envelope.data`만 꺼낸다. 에러 envelope면 `data === undefined`, **react-query는 성공으로 간주**하고 `isError=false`.
  - `hooks/useCostPeriod.ts:92-99` `setCustomRange` — start/end 순서 검증 없음. `components/CostPeriodHeader.tsx:62-87` — 두 DatePicker에 `disabledDate` 없음.
- **어긋나는 점**: 사용자 지정 기간에서 시작월 > 종료월을 고르면 BE가 400을 내지만 화면은 KPI 전부 0원, 표 0건, 에러 메시지 없음 — "비용 데이터가 없다"로 오독된다. `ASSET_NOT_FOUND`(EP5)는 `CostHwDepreciationPage.tsx:123-132`가 Empty로 흡수해 그나마 낫다.
- **권고**: (a) 조회 queryFn에도 envelope 실패 판정을 넣어 throw(→ `isError` 활성) 하거나 (b) 최소한 두 DatePicker에 `disabledDate`로 역전을 막을 것. (a)가 근본이다.

### [MEDIUM] M-2. 자산 편집 경로의 PATCH 응답이 기간 컨텍스트 없이 비용 목록 캐시를 덮어쓴다 — 책임: FE

- **BE 근거**: `CostController.java:88-96` — `periodStart`/`periodEnd` 미지정이면 `SearchCostHwDto.parse`(118-127)가 **당월**로 해석해 그 기준으로 행을 재계산해 돌려준다.
- **FE 근거**
  - `pages/asset/components/AssetFormModal.tsx:436` — `updateCostAsync({ assetId, body })` — **`period` 미전달**.
  - `hooks/useCost.ts:84-112` — `setQueriesData({ queryKey: [COST_QUERY_KEY.HW_LIST] }, ...)` 는 부분키 매칭이라 **모든 기간 변형의 캐시**에 적용된다.
- **어긋나는 점**: "최근 3개월"로 비용 탭을 보던 캐시가 살아있는 상태에서 자산 목록의 편집 모달로 비용을 저장하면, 그 행만 **당월** 수치(periodDepreciation/periodTotalCost/bookValue/costChangeRate)로 바뀐다. KPI 합계와 행 합이 어긋나며 화면에 아무 표시가 없다. 비용 탭 자체의 인라인 편집/모달은 `period`를 넘기므로(`CostHwTable.tsx:105`, `CostEditModal.tsx:90`) 정상.
- **권고**: `useUpdateCostData`가 `period`를 못 받았으면 `setQueriesData` 대신 `invalidateQueries([HW_LIST])` 하도록 분기.

### [MEDIUM] M-3. 금액 컬럼이 클라이언트에서 **문자열 정렬**로 다시 뒤섞인다 — 책임: FE

- **BE 근거**: `CostService.java:570-584` — `purchaseCost`/`bookValue`/`periodDepreciation`/`totalCost`는 숫자 비교자로 정렬해 페이지를 내린다.
- **FE 근거**
  - `hooks/useTableColumns.tsx:39` — `sorter: item.sorter ? item.sorter : stringSorter(dataIndex)` (컬럼이 `sorter`를 명시하지 않으면 **로컬 문자열 비교자**가 붙는다).
  - `utils/index.ts:1045-1049` — `String(a[key]).localeCompare(String(b[key]))`.
  - `pages/asset/cost/components/CostHwTable.tsx` — `purchaseCost`(193-221) · `periodDepreciation`(306-312) · `bookValue`(324-332) · `periodTotalCost`(391-415) 에 `sorter: false`가 **없다**(다른 컬럼들은 명시해 뒀다).
  - `hooks/useTableColumns.tsx:31-37` — URL에 sortBy/sortDirection이 있으면 `sortOrder`를 controlled로 주입 → antd가 로컬 comparator를 적용한다.
- **어긋나는 점**: 사용자가 금액 헤더로 정렬하면 서버는 숫자순 페이지를 주는데 antd가 그 페이지를 사전식으로 재정렬한다(예: `9,000,000` 이 `45,000,000` 보다 뒤). 페이지 내 순서만 틀리므로 눈에 잘 안 띈다.
- **확인 수준**: 코드 근거로는 확실. **실제 화면 재현은 functional-qa 확인 필요**(antd 버전별 controlled sortOrder 처리).
- **권고**: 서버 정렬 컬럼은 `sorter: true`(서버 정렬 명시)로 두거나 숫자 비교자를 명시.

### [MEDIUM] M-4. 정렬 불가한 컬럼이 정렬 가능하게 보인다 — `depreciationMethod` — 책임: FE

- **FE 근거**: `CostHwTable.tsx:242-270` — 상각방법 컬럼에 `sorter: false`가 없어 정렬 UI가 켜진다. 반면 `constants/cost.ts:166-178` `COST_SORT_FIELD_MAP`에는 `depreciationMethod` 항목이 없다.
- **BE 근거**: `SearchCostHwDto.java:72-74` `SORTABLE`에도 `depreciationMethod`는 없다(계약 §1 sortBy 목록과 일치).
- **어긋나는 점**: 헤더를 누르면 화살표는 켜지고 URL에 `sortBy=depreciationMethod`가 기록되지만, `CostHwTab.tsx:57-59`가 매핑 실패로 `undefined`를 만들어 **서버 정렬은 기본값(totalCost desc)으로 되돌아간다.** 사용자에겐 "정렬이 안 먹는" 컬럼.
- **권고**: 해당 컬럼에 `sorter: false` 추가.

---

### [LOW] L-1. 계약서의 에러 HTTP 상태가 실제와 다르다(문서 결함) — 책임: BE(계약서)

- 계약 §0/§4는 "검증/도메인 에러: **HTTP 400** + body errorCode"라고 적었으나, 실제는 `GlobalExceptionHandler.java:27-35`의 `ResponseEntity.ok(...)` → **HTTP 200 + body code 400 + errorCode**다(401만 실제 상태코드 — `moveseye-be-spring/CLAUDE.md §3-1`).
- FE 영향 없음: `cost.api.ts:42-53 unwrapEnvelope`가 `status==="error"` 및 `code!==200`을 둘 다 보고 `CostApiError`를 던진다. 다만 `toApiError`(55-72, 실제 4xx용)는 cost EP에서 **사실상 죽은 코드**다.
- 권고: 계약서 §0/§4 문구 정정(에러 표의 "HTTP 400" → "HTTP 200 + body code 400").

### [LOW] L-2. `costInput.*Period`가 계약이 선언한 enum 밖 원문을 낼 수 있다 — 책임: BE

- BE `CostService.java:519,521` — `rawStoredValue(cost, "maintenance_cost_period")` / `"lease_cost_period"` : **저장 원문 그대로**.
- 계약 §1은 `maintenanceCostPeriod: 'monthly'|'yearly'|'onetime'|null`, FE `types/cost.ts:92,94`도 union.
- 구 데이터에 `"quarterly"` 같은 값이 있으면 편집 폼 DSelect(`CostEditModal.tsx:202-208`)에 매칭 옵션이 없어 **원문 코드가 그대로 노출**된다. 계산 자체는 `CostService.java:412-417`이 yearly로 가정 + `*_period_invalid_assumed_yearly` 경고를 실어 안전.
- 권고: BE에서 무효 주기값은 `null`로 정규화하거나, 계약에 "무효 원문 가능"을 명시.

### [LOW] L-3. 무효한 `useful_life_years` 원문은 편집 폼에서 보이지도, 지울 수도 없다 — 책임: BE/FE

- BE `CostService.java:517` — `parseInteger` 실패 시 `costInput.usefulLifeYears = null`(원문 미노출). `depreciation_method`는 `rawStoredValue`라 보이는데(519) 이쪽만 비대칭.
- FE `costEditing.ts:189-195` — next(빈칸)·previous(null) 둘 다 empty → body에도 `clearFields`에도 안 실린다.
- 결과: `cost_data.useful_life_years = "abc"` 가 영구 잔류하고 `useful_life_invalid_ignored` 경고(`CostParamResolver.java:184-186`)가 UI로는 해소 불가.
- 권고: EP7의 `rawPurchaseCost` 관례대로 무효 원문을 함께 내리거나, 무효 시 미입력 사유로 승격.

### [LOW] L-4. KPI `incompleteCount`와 미입력 큐 행 수가 필터 조건에서 어긋난다 — 책임: BE

- `CostService.java:604-606` — `aggregation`(= **priority 필터까지 적용된** 모집단) 기준.
- `CostService.java:206-212 getIncomplete` — priority 필터는 적용하지 않는다(`applyFilters`만).
- 우선순위 필터를 건 상태에서 KPI 카드의 "N건"과 큐를 열었을 때의 행 수가 달라진다. 계약 §1은 "미입력 큐 크기"라고만 적어 어느 쪽이 정본인지 불명확.

### [LOW] L-5. EP7 `rawAcquisitionDate`가 inventory 유래 무효값을 못 보여준다 — 책임: BE

- `CostService.java:221` — `rawStoredValue(costData, "acquisition_date")` 즉 **cost_data 값만**. 계약 §2 문구와는 일치.
- 그런데 `acquisition_date_invalid` 사유는 inventory `date_hw_purchase`/`date_hw_install`가 깨졌을 때도 붙는다(`CostParamResolver.java:127-153`). 이 경우 큐 화면(`CostIncompleteTable.tsx:104-111`)은 `-`만 보여줘 "무엇이 왜 실패했는지 드러낸다"는 계약 §7-7 취지가 살지 않는다.
- `Resolved.rawAcquisitionDate`(체인 원문, `CostParamResolver.java:66,230`)가 이미 있으나 미사용.

### [LOW] L-6. 관리자 판정 어휘가 BE와 다르다 — 책임: FE

- BE `AdminAccessChecker.java:41-47` — `userRole ∈ {ADMIN, SUPER_ADMIN}`.
- FE `hooks/useIsSuperRole.ts` — `userRole === EUserRole.ADMIN || role?.type === EZabbixType.SUPER_ADMIN`(뒤쪽은 **Zabbix 역할 타입**). `enums/common.ts:154-157` `EUserRole`에는 SUPER_ADMIN이 없다.
- Zabbix Super admin이지만 `userRole=USER`인 계정은 편집 버튼이 보이고 저장 시 403 → `costEditing.ts:279`가 `error.forbidden` 토스트로 흡수. 파괴적이지 않고 기존 SideNav 관례와 동일하므로 정보성.

### [LOW] L-7. 미사용 상수 / 페이지 크기 삼중 불일치 — 책임: FE

- `constants/cost.ts:184 COST_DEFAULT_PAGE_SIZE = 20` — **어디서도 사용되지 않는다**(전수 grep 0건).
- 실제 기본 페이지 크기는 `components/Table/DmoveTable.tsx:96,162`의 **10**이고, BE 기본은 20(`SearchCostHwDto.java:68`). DmoveTable이 마운트 시 URL에 `limit=10`을 쓰므로 실 요청은 항상 명시돼 오동작은 없다.

---

## 2. 중점 확인 항목 판정 (PASS)

### ✅ P-1. `costInput` 3중 일치 (요청 항목 1)
- BE: 단일 빌더 `CostService.buildCostInput`(511-525)이 **EP4**(`buildItem` 507) · **EP5**(`getDepreciationDetail` 159) · **EP7**(`getIncomplete` 223) 세 곳에 동일하게 쓰인다. DTO도 하나(`CostHwItemDto.CostInputDto` 66-78)를 세 응답이 공유(`CostIncompleteItemDto.java:23`, `DepreciationDetailResDto.java:24`).
- FE: 타입 하나(`types/cost.ts:86-98 TCostInput`), 변환 하나(`costEditing.ts:66-81 toEditValues`)로 세 화면 초기화 — 목록 인라인(`CostHwTable.tsx:92`), 드릴다운(`CostHwDepreciationPage.tsx:338`), 미입력 큐(`CostIncompleteTable.tsx:155`).
- **해석값(`params`/해석 필드)에서 역복원하는 우회 잔재 없음.** 전수 확인.

### ✅ P-2. undefined(미변경) vs null(클리어) 분기 (요청 항목 3)
- FE `costEditing.ts:185-203`: `next === undefined` → skip(폼이 안 다루는 필드), `nextEmpty && !previousEmpty` → `clearFields.push(key)`, 그 외 변경분만 body.
- BE `CostDataValidator.validateAndMerge:60-123`: `clearFields`를 먼저 처리해 키 제거, 이후 `null` 필드는 미변경으로 건너뜀. **정확히 맞물린다.**
- **`clearFields` 어휘 대조**: FE가 넣는 키는 `TUpdateCostDataReq`의 camelCase로 고정(`costEditing.ts:198` 주석대로 런타임 미지 키 불가). BE `CAMEL_TO_SNAKE`(38-49)의 11개 키를 전수 대조 — `purchaseCost·maintenanceCost·leaseCost·depreciationCost·residualValue·depreciationMethod·usefulLifeYears·acquisitionDate·maintenanceCostPeriod·leaseCostPeriod·currency` 전부 존재. 미지 키 → `COST_UNKNOWN_FIELD` 경로 발동 없음.
- 인라인 편집(8필드만 렌더)에서 `manualDepreciation`/`depreciationCost`/`residualValue`가 `undefined`로 남아 **조용히 지워지지 않음**을 확인: `form.getFieldsValue()`(`CostHwTable.tsx:98`)는 등록된 Form.Item만 반환하고, `costEditing.ts:117-124`가 `managesManualDepreciation`으로 한 번 더 가드한다.
- 모달에서 "계산값 사용" OFF → `clearFields: ['depreciationCost']` 경로 성립(`costEditing.ts:120-124` + `CostEditModal.tsx:233-253`).

### ✅ P-3. null 규약 — `?? 0` 오염 없음 (요청 항목 2)
- `changeRate`/`costChangeRate` null=신규: `utils/currency.ts:74-80`이 null을 그대로 되돌리고, `CostHwKpiRow.tsx:35,52` 와 `CostHwTable.tsx:396-411`이 0%와 구분해 '신규' 태그/라벨로 렌더.
- `bookValue`/`accumulatedDepreciation` null: `CostHwTable.tsx:319-331`이 `value === null` 명시 분기 → `-`. (`?? 0` 아님)
- `currentMonthDepreciation`·`decliningRate`·`purchaseCost` null: `CostHwDepreciationPage.tsx:237-245,285,288-293` 전부 명시 분기.
- KPI의 `?? 0`(`CostHwKpiRow.tsx:43,63,73,83`)은 **kpi 객체 자체가 로딩 중 undefined일 때의 폴백**이며, 해당 필드들은 BE에서 primitive `long`/`int`(`CostHwListResDto.java:20,22-24`)라 null이 오지 않는다 — 의미를 뭉개지 않는다.

### ✅ P-4. enum·코드 어휘 전수 대조 (요청 항목 4)
| 축 | BE 출처 | FE 대응 | 결과 |
|---|---|---|---|
| depreciationMethod (2) | `DepreciationInput.METHOD_*` / `CostParamResolver.isValidMethod` | `constants/cost.ts:61-70`, `types/cost.ts:21` | 일치 |
| `*_period` (3) | `CostDataValidator.PERIOD_VALUES:51`, `CostService:412` | `constants/cost.ts:73-80`, `types/cost.ts:24` | 일치 |
| priority level (3) | `CostPriorityPolicy:95` | `constants/cost.ts:97-110` | 일치 |
| priority basis (5) | `CostPriorityPolicy:31-35` | i18n `cost.priority_basis.*` (`CostBadges.tsx:76`) | 일치 |
| `*Source` asset/classification/default | `CostParamResolver:32-34` | `types/cost.ts:34`, `CostBadges.tsx:104-110` | 일치 |
| acquisitionDateSource (4) | `CostParamResolver:35-38` | `types/cost.ts:27-31`, `CostHwDepreciationPage.tsx:252` | 일치 |
| residualValueSource (2) | `CostService.java:152` | `types/cost.ts:279`, `CostHwDepreciationPage.tsx:280` | 일치 |
| depreciationSource (2) | `Resolved.depreciationSource:89-91` | `types/cost.ts:37`, `CostBadges.tsx:131-146` | 일치 |
| depreciationStatus (4) | `CostService.java:332-348` | `constants/cost.ts:119-124` | 일치 |
| incompleteReasons (7) | `CostParamResolver:41-47` | `constants/cost.ts:130-147` | 일치 |
| warnings (14) | `CostParamResolver:50-53` + `CostService:398,410,415,425` + `DepreciationCalculator` | i18n `cost.warning.*` / `cost.warning_short.*` | 일치 |
| errorCode (8) | `ErrorCode.java:98,165-177` | `constants/cost.ts:150-159` | 일치 |

### ✅ P-5. i18n 키 실재 (요청 항목 9)
- 동적 조립 키(사유 7 · 경고 14 × 2 · basis 5 · priority 3 · param_source 3 × 2 · status 4 · method 2 · acquisition_source 4 · residual_source 2) **전건**을 `locales/en.json`·`kr.json` 양쪽에서 확인 — **누락 0**.
- 정적 `t("...")`·`labelKey`·컬럼 `key`(= 제목 i18n 키) 689건 전수 검사 — **누락 0**. BE 코드 어휘를 그대로 키로 쓰는 지점(`cost.reason.<code>`, `depreciation.method_<code>`, `depreciation.status_<code>`)도 전부 존재.

### ✅ P-6. 래퍼 언랩 깊이 (요청 항목 5)
- 1겹: `services/axiosInstance.ts:85` `return response.data` → `ApiResult` envelope.
- 2겹: `hooks/useDmoveQuery.ts:23-27` `envelope.data`.
- 소비처는 payload 직접 수신(`CostHwTab.tsx:114-116` `hwData?.items`/`hwData?.widgets`, `CostHwDepreciationPage.tsx:134`). **`data.data` 과다 언랩 0건.**
- mutation은 `cost.api.ts:101-107`에서 `unwrapEnvelope` 1회만(useDmoveQuery 미경유) — 정확.
- 캐시 조작(`useCost.ts:87-110`)도 envelope 구조를 보존한 채 `data` 안쪽만 교체 — 소비자 언랩이 깨지지 않는다.

### ✅ P-7. 에러 계약 정규화 (요청 항목 6)
- 403(HTTP 200 + body 403): `AdminAccessChecker.requireAdmin` → `ForbiddenError` → `GlobalExceptionHandler:27-35` → body `{status:"error", code:403, message:"Access Denied"}`. FE `unwrapEnvelope:44-51`이 잡아 `CostApiError{code:403}`, `costEditing.ts:279`가 **errorCode 분기보다 먼저** code를 보고 `error.forbidden`으로 매핑. 정확.
- 검증 에러: body `errorCode`가 `ErrorCode` 문자열과 동일(`GlobalExceptionHandler:30`) → `costErrorMessageKey:280-297` 7개 분기 전부 대응, 미지 코드는 `cost.error_save_failed` 폴백.
- ⚠️ 조회 경로만 미흡 → **M-1**.

### ✅ P-8. 쿼리 파라미터 이름 일치 (요청 항목 7)
`periodStart · periodEnd · platform · owner · deviceType · location · lifecycle · vendor · includeExcluded · depreciationMethod · costStatus · priority · keyword · sortBy · sortOrder · limit · offset` 17개 전부 `SearchCostHwDto` 필드명과 1:1(`types/cost.ts:217-235` ↔ `SearchCostHwDto.java:20-70`).
`QueryParamKeys`(enums/common.ts:87-136)의 URL 키도 동일 어휘. `sortOrder`는 `CostHwTab.tsx:60-62`에서 소문자 변환 후 전송 → BE `ascending()`(91-93)은 `equalsIgnoreCase`라 안전. `includeExcluded`는 `"true"`/미전송 2값(`CostHwTab.tsx:75-76`) → BE Boolean 바인딩 정상.

### ✅ P-9. 자산 폼 비용 저장 경로 변경 (요청 항목 8) — **비대칭은 실제 문제를 만들지 않는다**
- **사실 확인 1**: 편집 시 `AssetFormModal.tsx:327` `costData: null` → BE `Asset.updateUserOwned:204-218`이 `costData != null`일 때만 대입하므로 **미변경**이 맞다. 데이터 소실 없음. ✅
- **사실 확인 2**: 생성 시 `POST /assets`의 `costData`는 `CostDataValidator`를 타지 않는다(밸리데이터 javadoc 31-33이 그 사실을 명시).
- **판정**: 이 UI에서는 잘못된 enum이 들어갈 경로가 없다 — `costEditing.ts:248-274 costValuesToCostData`가 화이트리스트 snake_case 키만(11키 중 currency 제외 10키), 값은 `AssetCostSection.tsx`의 InputNumber/DSelect/DatePicker로 타입·범위가 강제된 것만 쓴다. `manualDepreciation`(폼 전용 토글)도 cost_data에 새지 않음(269-271).
- **만약 우회 경로로 잘못된 값이 들어가면**: `CostParamResolver.resolve:156-194`가 무효 method/years를 **무시하고 기기분류→전역 기본값으로 폴백**하며 `depreciation_method_invalid_ignored`/`useful_life_invalid_ignored` 경고를 응답에 싣는다. **상각 계산은 정상 진행되고 화면엔 경고 태그가 뜬다 — 계산 붕괴·데이터 손상 없음.**
- 남는 실질 영향은 **L-3**(무효 원문이 편집 폼에서 안 보이고 지울 수도 없음) 하나뿐이다.

### ✅ P-10. 경로·메서드·응답 shape 필드 전수 대조
- 경로 5개 일치: `GET /costs/hw` · `GET /costs/hw/incomplete` · `GET /costs/hw/{assetId}/depreciation` · `PATCH /costs/hw/{assetId}` · `GET /settings/device-classifications/{id}/cost-impact` (`CostController.java:52,62,72,84`, `DeviceClassificationController.java:107`).
- `CostHwItemDto` 33필드 · `CostHwListResDto`(kpi 5 · widgets 5 · period 5) · `CostIncompleteItemDto` 9필드 · `DepreciationDetailResDto`(params 14 · yearRow 7 · monthRow 5) — **필드명·nullable 전건 일치**, 오타 0.
- **Lombok `is`-접두 함정 확인**: `DepreciationDetailResDto.YearRowDto.isPartialYear`(52)는 Lombok 클래스가 아니라 **Java record**다. Jackson `RecordNaming`이 컴포넌트명을 그대로 프로퍼티명으로 쓰므로 JSON 키는 `isPartialYear`로 보존되고 FE(`types/cost.ts:294`, `CostHwDepreciationPage.tsx:103`)와 일치. (Lombok POJO였다면 `partialYear`로 깎였을 자리 — 안전.)
- 기기분류 확장: `DeviceClassificationDto` 2필드 **추가만**(기존 불변), is_system 행도 상각 기본값 수정 허용(`DeviceClassificationService.java:121-127`), 검증은 cost와 동일 어휘 `COST_INVALID_*`(134-141). FE 타입(`types/device-classification.ts:29-30,42-43,55-56`)·폼·소급 경고 흐름(`DeviceClassificationManagement.tsx:125-168`) 계약 §6과 일치.

---

## 3. functional-qa로 넘기는 항목

1. **M-3** — 금액 컬럼 헤더 정렬 시 페이지 내 순서가 실제로 뒤집히는지(antd controlled `sortOrder` + 함수형 `sorter` 동작).
2. **M-1** — 사용자 지정 기간을 역전 입력했을 때 실제 화면(0원 KPI + 빈 표 + 무경고).
3. **M-2** — 자산 편집 모달로 비용 저장 후 비용 탭(최근 3개월)으로 돌아갔을 때 그 행의 수치.
4. `CostEditModal`의 `destroyOnHidden` + `useEffect setFieldsValue` 타이밍 — 다른 자산으로 연속해서 열 때 이전 값 잔류 여부(정적으로는 정상).
5. 정률법 최종 연차 상각비 급증(계약 §8) 이 드릴다운 연차 표에 정상 표기되는지.

---
---

# 델타 검증 — 일괄 업로드 EP 2개 + 만료일 입력 경로 (2026-07-31)

> 수행: integration-qa · 2026-07-31 · 앱 미기동(정적 대조만)
> 범위: **델타만**. 계약 `features/assets/asset-cost/contract_asset-cost.md` §4-2(신규) + §1·§4·§5의 `expiry_date` 추가분.
> 이전 절의 M-1~M-4는 코디네이터가 런타임 NOT REPRODUCED로 클로즈 — 재검증하지 않았다.

## D-0. 델타 결론

| 심각도 | 건수 |
|---|---|
| HIGH | **0** |
| MEDIUM | **1** (D-1 — 템플릿 왕복) |
| LOW | 6 |
| PASS(중점 확인 항목) | 7 |

**중점 확인 6개 중 5개는 PASS다.** 가장 위험하다고 지목된 **CSV 왕복(헤더 계약 일치)은 통과**했고,
템플릿 다운로드의 **언랩 경로도 실제 인터셉터 코드로 확인해 FE 주장이 사실임을 검증**했다.
유일한 MEDIUM은 헤더가 아니라 **셀 값 프리필**에서 나왔다.

### 참고 — 이전 절 지적이 이번 델타에서 실제로 수정됐다
코디네이터는 M-1~M-4를 "런타임 NOT REPRODUCED"로 닫았지만, 코드는 그와 별개로 바뀌어 있다:
`passThroughEnvelope`(`cost.api.ts:66-69`) + 조회 실패 Alert(`CostHwTab.tsx:277-284`) 신설(M-1),
`serverSorter = true`(`CostHwTable.tsx:80`) 도입으로 문자열 로컬 정렬 제거(M-3),
`depreciationMethod` 컬럼 `sorter: false`(`CostHwTable.tsx:290`)(M-4),
`invalidStoredFieldsFromWarnings`/`invalidStoredCostFields`(`costEditing.ts:95-137`)로 이전 L-3 해소.
→ 델타 검증에서 이 4건은 **더 이상 재현 조건이 코드에 없다**.

---

## D-1. [MEDIUM] 템플릿이 무효 원문을 그대로 프리필해, 손대지 않은 행이 재업로드에서 실패한다 — 책임: BE

- **계약 근거**: §4-2a — "비용 컬럼은 **저장값을 정규화해 프리필**(costInput과 동일 값). 정규화 불가 원문
  (`"4,500만원"`)은 빈칸(**그대로 재업로드 시 실패 방지** — 원문은 미입력 큐에서 확인)".
- **BE 근거**: `CostBulkUploadService.java:107-118`이 `CostService.buildCostInput`(`CostService.java:513-527`)의
  값을 그대로 쓴다. 그런데 그 빌더는 컬럼마다 정규화 강도가 다르다.

| 템플릿 컬럼 | buildCostInput 처리 | 무효 원문이면 |
|---|---|---|
| purchaseCost · maintenanceCost · leaseCost · depreciationCost · residualValue | `amountOrNull` | **빈칸** ✅ |
| usefulLifeYears | `parseInteger` | **빈칸** ✅ |
| **acquisitionDate · expiryDate · depreciationMethod · maintenanceCostPeriod · leaseCostPeriod · currency** | `rawStoredValue` | **원문 그대로** ❌ |

- **어긋나는 점**: 레거시 `cost_data.acquisition_date = "2024년 3월"`(구 자산 폼은 전 필드가 자유 문자열이었다 —
  설계 §1.3-A) 같은 값이 템플릿 셀에 그대로 실려 내려온다. 사용자가 **그 셀을 건드리지 않고** 업로드하면
  `CostBulkUploadService:238` → `CostDataValidator.putDate:131-140` → **`COST_INVALID_DATE`로 그 행이 실패**한다.
  같은 구조로 `depreciationMethod`는 `COST_INVALID_DEPRECIATION_METHOD`, `*Period`는 `COST_INVALID_COST_PERIOD`.
- **왜 HIGH가 아닌가**: 행 단위 커밋이라 파일 전체가 죽지 않고, 실패 리포트에 사유가 나온다(데이터 손상 0).
- **왜 그래도 MEDIUM인가**: 템플릿을 다시 받아도 같은 원문이 또 실리므로 **bulk 경로로는 그 행을 영영
  성공시킬 수 없다**(인라인 편집으로만 해소). 게다가 사용자가 입력하지도 않은 셀 때문에 실패해 원인 추적이 어렵다.
  이 기능의 존재 이유가 "dev 취득가액 0% 대량 투입"인데, 정작 오염된 레거시 행이 걸린다.
- **권고**: 프리필에도 판정 경로를 태울 것 — `CostValueParser.parseDate` / `CostParamResolver.isValidMethod` /
  `CostDataValidator`의 `PERIOD_VALUES`로 검사해 무효면 빈칸. (대안: 계약 §4-2a 문구를 "금액·연수만 정규화"로 축소.)
- **확인 수준**: 코드 경로는 확실. **dev DB에 실제로 무효 원문이 있는지는 functional-qa 확인 필요.**

---

## D-2. [LOW] inventory 유래 만료일 오류가 저장할 때마다 무의미한 `clearFields`를 만든다 — 책임: BE/FE

- **BE**: `CostParamResolver.java:166-187` — 만료일 폴백 체인은 `cost_data.expiry_date` → `inventory.date_hw_expiry`
  이고, 경고는 `if (expiryDate == null && anyExpiryCandidate) warnings.add(WARN_EXPIRY_INVALID)` 로 **출처를 구분하지 않는다.**
  즉 `cost_data`엔 값이 없고 inventory `date_hw_expiry`만 깨져 있어도 `expiry_date_invalid_ignored`가 붙는다.
- **FE**: `costEditing.ts:98` — 그 경고를 무조건 `expiryDate`(= cost_data 필드) 무효로 해석 →
  `costEditing.ts:266` `previousEmpty = isEmpty(null) && !invalidStored.has("expiryDate")` = **false** →
  사용자가 만료일 칸을 건드리지 않아도 `clearFields: ["expiryDate"]`가 실린다.
- **영향**: BE `CostDataValidator.java:67-74`의 `merged.remove("expiry_date")`는 없는 키라 **no-op — 데이터 손상 없음**.
  다만 (a) 변경이 없어도 PATCH가 나가 "변화 없으면 요청 생략" 최적화가 무력화되고, (b) `asset_activity`에
  빈 diff 이력이 쌓이며, (c) inventory 값이 깨져 있는 한 이 상태가 영구 반복된다.
- **권고**: BE가 경고를 출처별로 분리하거나(`expiry_date_invalid_ignored` = 수동값 전용), FE가
  `input.expiryDate !== null`일 때만 무효 필드로 승격.

## D-3. [LOW] 미입력 큐 편집 모달만 무효 원문을 지울 수 없다 — 책임: FE(+계약)

- `CostEditModal.tsx:57,93` — 무효 원문 판정은 `warnings` prop → `invalidStoredFieldsFromWarnings`.
- 드릴다운은 넘긴다(`CostHwDepreciationPage.tsx:351`), 인라인도 넘긴다(`CostHwTable.tsx:119`).
- **미입력 큐는 못 넘긴다** — `CostIncompleteTable.tsx:156-164`에 `warnings`가 없고, 넘길 수도 없다:
  `CostIncompleteItemDto`(BE `CostIncompleteItemDto.java:11-24`, 계약 §2)에 `warnings` 필드가 아예 없다.
- **결과**: 결정 #10이 "데이터 정정의 주 동선"이라 규정한 큐 화면에서만 무효 원문 해소가 안 된다.
- **권고**: EP7 응답에 `warnings` 추가(계약 §2 확장).

## D-4. [LOW] `invalidStoredCostFields`(자산 폼 경로)가 날짜 계열을 구조적으로 못 잡는다 — 책임: FE

- `costEditing.ts:121-130` pairs 8종에 `acquisition_date`·`expiry_date`가 없다. 넣어도 소용없다 —
  `costDataToCostInput:307-308`이 두 필드를 `text()`로 **원문 그대로** 담아 `parsed[key] === null` 판정이 성립하지 않는다.
- **결과**: 자산 편집 폼에서는 무효 날짜 원문을 지울 수 없다(경고 기반 경로를 쓰는 비용 화면과 비대칭).
- `depreciationMethod`·`*Period`는 원문이 폼 컨트롤에 값으로 보여 사용자가 직접 clear 가능 → 영향 없음.

## D-5. [LOW] `file` 파트 누락 시 `COST_UPLOAD_EMPTY`가 아니라 HTTP 500 — 책임: BE

- 계약 §4-2b 에러 표: "파일 없음/빈 파일/데이터 행 0 → `COST_UPLOAD_EMPTY`".
- BE `CostController.java:107` `@RequestParam("file") MultipartFile file`은 **required=true**라 파트가 없으면
  `MissingServletRequestPartException`이 먼저 난다. `GlobalExceptionHandler`에 전용 핸들러가 없어
  `handleUnknown` → **HTTP 500 `{statusCode:500, message:"Internal server error"}`**.
  `CostBulkUploadService.java:131`의 `file == null` 분기는 **도달 불가**.
- 같은 이유로 Boot 기본 `spring.servlet.multipart.max-file-size`(1MB) 초과도 500이다.
- FE는 항상 파트를 싣는다(`cost.api.ts:167-168`)므로 실사용 영향 없음 — 방어 경로 계약 불일치.

## D-6. [LOW] 빈 줄이 `rowNumber`를 밀어 Excel 줄 번호와 어긋난다 — 책임: BE

- `CostBulkUploadService.parseCsv:315-317,326-328`이 완전 빈 줄을 `rows`에서 **아예 제외**하고,
  `upload:167`은 `rows` 인덱스+1을 `rowNumber`로 쓴다.
- 중간에 빈 줄이 있으면 리포트 행 번호가 사용자가 Excel에서 보는 줄 번호보다 작아진다.
  계약이 "CSV **논리** 행 번호"라 위반은 아니지만, 리포트로 행을 찾아가는 동선에서 혼란.

## D-7. [LOW] 업로드 CSV 인코딩이 UTF-8 고정 — 책임: BE (정보성)

- `CostBulkUploadService.java:136` `new String(file.getBytes(), StandardCharsets.UTF_8)` 고정.
- 한국어 Windows Excel에서 "CSV(쉼표로 분리)"로 저장하면 CP949가 되어 `name`/`deviceType` 셀이 U+FFFD로 깨진다.
- **다만 그 두 컬럼은 업로드 시 무시되고**(`REFERENCE_COLUMNS`), 헤더·assetId·금액·enum은 전부 ASCII라
  **처리 자체는 성공한다.** 기능 영향 없음 — 결과 리포트의 `assetName`은 DB에서 다시 읽으므로 정상.

---

## D-P. 중점 확인 항목 판정 (PASS)

### ✅ DP-1. 템플릿 다운로드가 언랩 경로를 타지 않는다 — **인터셉터 코드로 직접 검증** (중점 1)
- **FE 주장 사실 확인**: `services/axiosInstance.ts:81-86` 응답 인터셉터의 성공 경로는
  `return response.data ?? response;` 뿐이다 — envelope 파싱·언랩 로직이 **없다**.
  `responseType:"blob"`이면 axios가 `response.data`에 `Blob`을 넣으므로 `cost.api.ts:146`의
  `API.get(...)`은 **Blob을 그대로** 반환한다. ✅ 주장대로다.
- **403 blob 분기도 성립**: `AdminAccessChecker.requireAdmin`(`CostController.java:89`) → `ForbiddenError` →
  `GlobalExceptionHandler.handleHttpError` → `ResponseEntity.ok(ApiResult)` = **HTTP 200 +
  `Content-Type: application/json`**(Jackson 컨버터). XHR blob 응답의 `Blob.type`은 Content-Type에서 오므로
  `cost.api.ts:150` `blob.type.includes("application/json")`이 참이 되고, `;charset=UTF-8` 접미사가 붙어도
  `includes`라 안전. → `text()` → `JSON.parse` → `CostApiError{code:403}` → `costEditing.ts:363`이
  `error.forbidden`으로 매핑 ✅
- **파일명**: 인터셉터가 `AxiosResponse`를 안 돌려줘 `Content-Disposition`을 못 본다는 FE 주석도 사실.
  상수 `COST_TEMPLATE_FILENAME = "cost-hw-template.csv"`(`constants/cost.ts:183`)와 BE
  `CostController.java:94`의 값이 **문자 단위 일치** ✅
- `file-saver`는 `package.json:46`(+ `@types` :80)에 실재 ✅
- 401 재시도(`axiosInstance.ts:110` `return API(original)`)도 원 config의 `responseType:"blob"`을 보존 ✅

### ✅ DP-2. CSV 왕복 계약 일치 — **이번 델타 최대 위험 지점, 통과** (중점 2)
- **생성 헤더**(`CostBulkUploadService.java:88-94`) = `assetId` + `REFERENCE_COLUMNS`(2) + `COST_COLUMNS`(12) = **15컬럼**,
  순서까지 계약 §4-2a와 동일:
  `assetId,name,deviceType,purchaseCost,acquisitionDate,expiryDate,depreciationMethod,usefulLifeYears,maintenanceCost,maintenanceCostPeriod,leaseCost,leaseCostPeriod,depreciationCost,residualValue,currency`
- **파서 화이트리스트**(`ALLOWED_COLUMNS:67-75`)는 **동일한 상수 3개(`COLUMN_ASSET_ID`·`REFERENCE_COLUMNS`·
  `COST_COLUMNS`)에서 조립**된다 — 헤더 정의가 두 벌 존재하지 않으므로 **생성한 템플릿은 정의상 자기 검증을 통과한다.** ✅
  (`COST_UPLOAD_INVALID_HEADER` 오탐 구조적 불가)
- **파싱은 헤더 이름 기준 맵**(`upload:163-166`)이라 사용자가 컬럼 순서를 바꾸거나 일부를 지워도 안전.
  트레일링 빈 헤더는 `!h.isEmpty()` 가드(`:152`)로 허용 — Excel 대비 ✅
- **BOM 왕복**: `BOM` 상수는 **단일 U+FEFF**(바이트 확인 완료). 생성은 선두에 붙이고(`:87`) 업로드는
  **파싱 전에** `startsWith`→`substring(1)`로 제거(`:140-142`) ✅
- **행 길이 불일치**: `c < header.size() && c < row.size()`(`:164`) — 짧은 행은 누락 컬럼이 곧 미변경,
  긴 행은 초과분 무시 ✅ / 완전 빈 행은 스킵(`:160-162`) ✅
- **RFC4180 인용**: `escapeCsv:274-282`(콤마·따옴표·개행 시 인용 + `""` 이스케이프) ↔
  `parseCsv:284-331`(인용 필드 내 콤마·개행·`""` 처리) 대칭 ✅

### ✅ DP-3. 업로드 검증 경로 단일성 — 주장 사실 (중점 3)
- `CostBulkUploadService.processRow:202`가 **EP6과 같은 메서드** `costService.updateCostData(assetId, req, currentUser)`를
  호출하고, 그 안에서 `CostDataValidator.validateAndMerge`가 돈다. **업로드 전용 화이트리스트·enum·범위·날짜
  판정이 따로 존재하지 않는다** ✅ (`updateUserOwned` + `asset_activity` 이력도 동일 경로로 자동 상속)
- 업로드 고유 전처리는 두 곳뿐이고 **둘 다 계약에 명시**돼 있으며, 판정은 validator에 위임한다:
  - 금액: `amount():247-257` — `CostValueParser.parseAmount`로 `"45,000,000원"` 허용(계약 §4-2b 문구),
    **음수 거부는 `CostDataValidator.putAmount:126-134`에 위임**(단일 경로 유지)
  - 내용연수: `:230-237` — 정수 파싱만, **2~15 범위는 `CostDataValidator:95-100`에 위임**(주석에도 명시)
- `clearFields`는 업로드로 도달 불가(빈칸=미변경, `cell():259-262`) — 계약 §4-2b와 일치 ✅
- **트랜잭션**: `CostBulkUploadService`에 `@Transactional`이 **없고** `CostService.updateCostData`는 REQUIRED →
  주입된 프록시 호출이라 **행마다 독립 트랜잭션** ✅ 계약의 "행 단위 커밋" 성립
- 미세 차이(정보성): 비숫자 `usefulLifeYears`가 업로드는 `COST_INVALID_USEFUL_LIFE`, PATCH는 Jackson
  역직렬화 실패(→500)로 갈린다. **업로드 쪽이 계약 표에 부합**하므로 문제 아님.

### ✅ DP-4. 만료일 3화면 규약 — **BE 응답까지 대조** (중점 4)
- **FE 주장("costInput.expiryDate는 수동값만, inventory 폴백 미포함") 사실 확인**:
  `CostService.buildCostInput:518` = `rawStoredValue(cost, "expiry_date")` — **cost_data만 읽고 inventory는 보지 않는다** ✅
- 표시용 `CostHwItemDto.expiryDate`는 폴백 해석 결과(`CostService.java:381-382,499` ← `CostParamResolver:166-184`),
  출처는 `expiryDateSource`(`manual`|`inventory`|null, `CostService.java:500`) — 계약 §1 line 115-116과 일치 ✅
- **3화면 동일 규약**: 인라인(`CostHwTable.tsx:220` `name="expiryDate"`) · 모달(`CostEditModal.tsx:175`) ·
  자산 폼(`AssetCostSection.tsx:86` `name={["cost","expiryDate"]}`)이 전부
  `toEditValues:74`(`parseCostDate(input.expiryDate)`) → `buildCostPatchBody:171-180, 207-213` 한 쌍을 탄다 ✅
- **inventory 만료일 보유 자산에서 오작동하지 않음**(질문의 핵심): `costInput.expiryDate = null` → 폼 빈칸 →
  사용자가 안 건드리면 next·previous 둘 다 empty → **body에 아무것도 안 실려 inventory 값이 그대로 유지된다** ✅
  (단 D-2 조건에서만 no-op `clearFields`가 붙는다 — 값은 여전히 안전)
- PATCH 배선: `UpdateCostDataReqDto.java:50 expiryDate` ↔ `CostDataValidator.java:47`
  `expiryDate→expiry_date` ↔ `putDate:104`(취득일과 동일 포맷 검증) ↔ FE `types/cost.ts:272` ✅
- 정렬키 `expiryDate`도 BE `SORTABLE`·FE `COST_SORT_FIELD_MAP:200` 양쪽에 존재 ✅

### ✅ DP-5. 신규 errorCode·경고·i18n 전수 대조 (중점 5)
| 항목 | BE 발생 문자열 | FE 상수/키 | 결과 |
|---|---|---|---|
| `COST_UPLOAD_EMPTY` | `ErrorCode.java:183` | `constants/cost.ts:160` → `costEditing.ts:377` | 일치 |
| `COST_UPLOAD_INVALID_HEADER` | `ErrorCode.java:185` | `constants/cost.ts:161` → `costEditing.ts:379` | 일치 |
| `COST_UPLOAD_INVALID_ROW` | `ErrorCode.java:187` | `constants/cost.ts:162` → `costEditing.ts:381` | 일치 |
| `COST_ASSET_EXCLUDED` | `ErrorCode.java:181` | `constants/cost.ts:163` → `costEditing.ts:383` | 일치 |
| `expiry_date_invalid_ignored` | `CostParamResolver.java:60` | `costEditing.ts:98` + i18n | 일치 |
| `expiryDateSource` = `manual`\|`inventory` | `CostParamResolver.java:35,43` | `types/cost.ts:40`, `CostBadges.tsx:128,134` | 일치 |
- **i18n**: 신규 정적 키 + 동적 키(`cost.expiry_source.*`·`cost.expiry_source_hint.*`·
  `cost.warning(_short).expiry_date_invalid_ignored`) 포함 **673건 전수 검사 — en.json·kr.json 누락 0** ✅
- 업로드 리포트가 raw errorCode를 노출하지 않고 `costErrorMessageKey`로 번역(`CostBulkUploadModal.tsx:104-105`) ✅

### ✅ DP-6. 파일 전체 실패 vs 행 실패 분기가 맞물린다 (중점 6)
- **BE**: 파일 수준(`COST_UPLOAD_EMPTY`·`COST_UPLOAD_INVALID_HEADER`)은 `ApiError` **throw**
  (`upload:132,138,146,153,174`) → `GlobalExceptionHandler` → HTTP 200 + `{status:"error", code:400, errorCode}`.
  행 수준은 `processRow:204-210`이 `ApiError`를 잡아 `RowResult.errorCode`로 수렴 → **성공 envelope 안에** 실린다 ✅
- **FE**: `bulkUpload`(`cost.api.ts:170-176`)의 `unwrapEnvelope`가 실패 envelope를 `CostApiError`로 승격 →
  `CostBulkUploadModal.tsx:71-80` catch → `COST_UPLOAD_FILE_LEVEL_ERRORS`(`constants/cost.ts:171-174`) 포함
  여부로 **"파일을 고쳐 재업로드"(`bulk_upload_file_rejected`) vs 일반 실패** 분기 ✅
- 성공 envelope는 결과 화면으로 — 부분 성공 시 "성공분은 이미 저장됨"을 명시(`:199-213`) ✅ 행 단위 커밋 계약과 일치
- **캐시**: `useCostBulkUpload:181-195` — 행 교체가 불가하므로 `setQueriesData`가 아니라 무효화를 택했고
  (`HW_LIST`·`HW_INCOMPLETE`·`HW_DEPRECIATION` + `ASSET_QUERY_KEY.DETAIL`·`ACTIVITIES`),
  `successCount === 0`이면 재조회를 생략한다 ✅ 키는 `constants/queryKey.ts:190-194`에 실재

### ✅ DP-7. 라우팅·권한·multipart 배선
- `GET /costs/hw/template`은 리터럴 1세그먼트라 `/hw/{assetId}/depreciation`(2세그먼트)·`/hw/incomplete`와 충돌 없음.
  `/hw/{assetId}`는 PATCH 전용이라 GET 모호성 자체가 없다 ✅
- 두 EP 모두 첫 줄에서 `AdminAccessChecker.requireAdmin`(`CostController.java:89,108`) — 계약 §4-2 "관리자 전용" ✅.
  FE는 `isSuperRole`일 때만 진입 버튼 노출(`CostHwTab.tsx:269,370`)
- **multipart 파트명**: BE `@RequestParam("file")`(`:107`) ↔ FE `COST_UPLOAD_FILE_PART = "file"`(`constants/cost.ts:177`)
  → `formData.append(COST_UPLOAD_FILE_PART, file)`(`cost.api.ts:168`) ✅
- `consumes = MULTIPART_FORM_DATA_VALUE`(`:104`) ✅. axiosInstance(`:17-23`)에 기본 `Content-Type` 강제가 없어
  FormData 본문의 boundary 포함 헤더를 axios가 자동 설정 ✅. `x-visitor-id`도 동일 인터셉터로 실린다(`:41-44`) ✅

---

## D-F. functional-qa로 넘기는 항목 (델타)

1. **D-1** — dev DB에 무효 `acquisition_date`/`depreciation_method`/`*_period` 원문을 가진 자산이 실제로 있는지,
   템플릿을 받아 그대로 재업로드했을 때 손대지 않은 행이 실패하는지.
2. 템플릿 다운로드 실제 동작(Excel에서 한글 자산명이 깨지지 않는지 = BOM 적용 확인) + 비관리자 계정으로
   눌렀을 때 403 문구가 뜨는지(blob→JSON 분기 실전 확인).
3. Excel 왕복 후 금액 셀이 지수표기(`4.5E+07`)로 바뀌어 `COST_INVALID_AMOUNT`가 나는지
   (`CostValueParser.NUMERIC` 패턴은 지수표기를 거부한다).
4. 76행 업로드의 소요 시간이 axios `timeout: ONE_MINUTE`(`axiosInstance.ts:19`) 안에 들어오는지
   — 행마다 독립 트랜잭션 + `asset_activity` 기록이라 행 수에 비례한다.
5. 만료일을 수동 입력한 뒤 Expiry window·Renewal candidates·우선순위 `expiry` 요소가 실제로 움직이는지.
