# 정적 경계면 QA — 자산 관리 × 클라우드 통합 (ZM-119)

> 수행 2026-08-26 · `integration-qa` · **정적 대조만**(앱 기동·브라우저·실호출 없음 — functional-qa 몫)
> 대상: BE `C:\worktrees\zm-119-be`(브랜치 `ZM-119`, 전량 **미커밋 워킹트리**) · FE `C:\worktrees\zm-119-fe`(전량 **미커밋 워킹트리**)
> 계약 정본: [features/assets/asset-cloud/contract_asset-cloud.md](contract_asset-cloud.md) v1.1 · 설계 [features/assets/asset-cloud/devdesign_asset-cloud.md](devdesign_asset-cloud.md)
> ⚠️ 양쪽 다 `git diff ZM-79...HEAD` / `master...HEAD`는 **비어 있다** — 변경이 커밋되지 않아 `git status` 기준으로 대조했다.

## 종합

| 구분 | 결과 |
|---|---|
| 검증 항목 8개 | **PASS 6 · PARTIAL 2**(항목 4 라우트 · 항목 5 i18n) |
| 세부 판정 | **PASS 38 · FAIL 8**(HIGH 0 · MEDIUM 2 · LOW 6) |
| 실행 검증 | `npx tsc -p tsconfig.contract.json` **exit 0** · 관련 jest 8스위트 **88 tests green** |
| 🔴 차단급(HIGH) | **없음** |

---

## 1. FAIL 목록

### F1. cloud 커버리지 딥링크가 자기 주석과 어긋난다 — MEDIUM / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/pages/asset/dashboard/AssetDashboardPage.tsx:222-229` |
| 기대 | `cloudLinked` 조각 클릭 → `?source=cloud&coverage=monitored`. 바로 위 주석이 **"cloud는 coverage 축이 진짜다 … 딥링크가 집계와 같은 집합을 연다"**고 못박았고(계약 §3-9 · BE `CloudAssetDerivation.coverage`가 `linked_hostid != null → monitored`로 파생한다), 짝인 `cloudUnlinked`는 `coverage=unmonitored`를 싣는다 |
| 실제 | `goToList({ [QueryParamKeys.SOURCE]: "cloud" })` — coverage 없이 **cloud 전체**를 연다. 계약 §6.4 실측 모집단(cloudLinked 0 / cloudUnlinked 1)에서 "AWS · 감시 중 **0**"을 눌러도 목록에 1건이 뜬다 |
| 참고 | `customLinked`는 축이 없어서 넓게 보내되 **툴팁으로 그 사실을 밝힌다**(`source_custom_linked_tooltip`). cloud에는 그 툴팁도 없어 사용자가 넓어진 걸 알 방법이 없다 |
| 수정 제안 | `[QueryParamKeys.COVERAGE]: "monitored"` 추가 |

### F2. 구 경로 리다이렉트가 `CloudInfraGate` **안**에 있다 — MEDIUM / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/routes/routes.tsx:494-536`(부모 블록) · `530-535`(리다이렉트 자식) · `pages/cloud-infra-monitoring/components/CloudInfraGate.tsx:25-51` |
| 기대 | 계약/설계 U1 의도 = "북마크·기존 링크를 살린다" → `/cloud-infra-monitoring/cost` 진입 시 **조건 없이** `/asset/cost?tab=cloud`로 replace |
| 실제 | 부모 element가 `PageWrapper(permissionKey=AWS_RESOURCES) > CloudInfraGate > DashboardLayout`이라 리다이렉트 자식이 렌더되기 **전에** 게이트가 가로챈다. ① AWS 미구성(`isGated`) 사용자 → 리다이렉트 대신 게이트 카드, 주소는 구 경로 그대로 ② `useCloudStatus` 로딩 동안 Skeleton이 먼저 그려져 리다이렉트가 지연 ③ `awsResources.view` 없는 사용자 → 권한 거부 화면(이전 대상인 Cloud 탭은 `cost.cloud_tab.no_permission`으로 **더 정확히** 안내한다) |
| 검증 공백 | `src/__tests__/cloudCostRedirect.test.tsx:26-42`가 `CloudCostPage`를 게이트 **밖에서** 단독 렌더해 이 경로를 못 잡는다 |
| 완화 요인 | 게이트 카드도 "설정 > 클라우드 인프라"로 보내므로 사용자가 길을 잃지는 않는다 → HIGH 아님 |
| 수정 제안 | 리다이렉트 라우트를 게이트 밖(최상위 라우트 배열)으로 빼거나, `CloudInfraGate`가 이 경로만 통과시키게 한다 |

### F3. 표 컬럼 헤더 2개의 i18n 키가 kr/en 양쪽에 **없다** — LOW / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/pages/asset/cost/components/CloudEstimateTable.tsx:46` `t("instance")` · `components/CloudWasteTable.tsx:44` `t("resource")` |
| 기대 | 루트 키 `instance`·`resource`가 `locales/kr.json`·`en.json`에 존재 |
| 실제 | 양쪽 모두 **정의 없음**(전수 스캔: 이 두 개 외 신규 참조 키 374개는 kr/en 모두 존재) → 헤더에 원문 키가 그대로 렌더된다 |
| 참고 | 구 `CloudCostPage`에서 그대로 옮겨 온 **선재 결함**이다(`git show HEAD:…/CloudCostPage.tsx:83,161`). `t("resource")`는 `VPCDetail.tsx:123`에도 남아 있다. 화면 이전이 고칠 타이밍이었다 |

### F4. 일괄 업로드 행 에러코드 목록에 신규 코드 누락(문서) — LOW / **BE**

| | |
|---|---|
| 위치 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/cost/dto/CostBulkUploadResDto.java:23-26` |
| 기대 | `RowResult.errorCode`의 `@Schema` 열거에 `ASSET_COST_NOT_APPLICABLE` 포함(계약 §3-13 — 업로드 행 실패로 리포트) |
| 실제 | 열거가 종전 8종 그대로. 동작은 정상(`ApiError(ErrorCode)` → message=code → `processRow` catch → `RowResult.errorCode`, FE `costEditing.ts:390-392`가 이미 매핑) — **Swagger 계약만 drift** |

### F5. 자산 편집 모달의 클라우드 비용 카드가 권한 게이트 없이 조회한다 — LOW / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/pages/asset/cost/components/CloudAssetCostCard.tsx:26-30`(호출) ← `components/AssetCostSection.tsx:73-75` ← `AssetFormModal.tsx:900-908` |
| 기대 | `GET /costs/cloud`는 `cloudInfraMonitoring.awsResources.view` 축이다(계약 §1). `CloudCostTab.tsx:48-51`은 권한·`isReady`를 확인하고 `enabled`를 끈다 |
| 실제 | `enabled = !!resourceId` 하나뿐. 권한 없는 관리자가 cloud 자산을 편집하면 200+body `403`이 오고 `CostApiError`로 떨어져 카드가 조용히 `asset_cloud.cost_unavailable`("아직 수집된 추정 비용이 없습니다")로 그려진다 — **사실이 아닌 안내**(권한 문제인데 수집 문제로 읽힌다) + 모달 열 때마다 무의미한 왕복 1회 |
| 수정 제안 | `CloudCostTab`과 같은 권한/`useCloudStatus` 판정을 `enabled`에 넣고, 막힌 경우 사유를 적는다 |

### F6. `?resourceId=`가 낭비 표에서 EBS·EIP 항목을 원리적으로 지운다 — LOW / **BE**

| | |
|---|---|
| 위치 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/cost/CostCloudService.java:93-97` |
| 기대 | 계약 §1은 `resourceId`를 "인스턴스 단건 — 자산 상세의 클라우드 비용 카드용"으로만 정의하고 `waste` 동작은 규정하지 않았다 |
| 실제 | `waste`도 `w.resourceId()`로 같이 거른다. `UNATTACHED_EBS`(volumeId)·`UNUSED_EIP`(publicIp)는 인스턴스 id와 절대 같지 않아 **항상 0건**이고, `STOPPED_INSTANCE_EBS`(instanceId)만 남는다 |
| 판단 | 자산 상세 카드는 `waste`를 그리지 않으므로 현재 화면 영향 없음. **"낭비가 안 보인다"가 나중에 결함으로 재보고되지 않게** 기록 |

### F7. cloud 자산에서 "미수집" 표기가 `account`·`arn`에만 붙는다 — LOW / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/constants/asset.ts:280`(`ASSET_CLOUD_UNCOLLECTED_KEYS = ["account","arn"]`) · `:288-299`(그룹 필드) · `pages/asset/components/AssetDetailFieldGroups.tsx:36-45` |
| 기대 | 동기화가 **채울 수 없는 칸**은 일관되게 "미수집"으로 표기(계약 §5-3의 취지) |
| 실제 | 같은 그룹의 `account_name`·`partition`도 BE `AssetCloudData`가 **키 자체를 만들지 않는** 값인데(§4 스키마에 없음) `-`로 그려진다 → 한 카드 안에서 같은 성격의 빈칸이 두 가지로 보인다 |

### F8. 탭 전환이 Cloud 탭 필터를 URL에 남긴다 — LOW / **FE**

| | |
|---|---|
| 위치 | `moveseyee_fe/src/pages/asset/AssetCostPage.tsx:27-36` |
| 기대 | 탭을 바꾸면 그 탭 전용 상태를 정리한다(이미 `offset`·`sortBy`·`sortDirection`·`costView`는 리셋한다) |
| 실제 | Cloud 탭의 `region`·`status`·`owner`·`assetLinked`는 남는다. 다른 탭이 같은 키를 안 쓰므로 **오작동은 없고**(전수 확인), 돌아오면 필터가 부활하는 정도 |

### (참고) 기능 밖 변경 1건 — LOW / **BE**

`git status`에 `D start_3001.ps1`. ZM-119 범위 밖 삭제다 — 커밋 전 의도 확인 필요.

---

## 2. 항목별 판정

### 항목 1 — 계약 §2·§3 삼자 대조(TS ↔ Java DTO ↔ FE types) : **PASS**

| 대조 | 결과 |
|---|---|
| `CostCloudResDto` ↔ `TCostCloudRes` | collection 3 · summary 12 · instance 17 · waste 5 · filterOptions 3 — **필드명·타입·null 전부 일치** |
| `SyncAssetsResDto`/`CloudSyncResultDto` ↔ `TSyncResult`/`TSyncCloudResult` | 일치. 최상위 4카운트 = Zabbix 구간 의미 보존, `cloud`는 `\| null`(옵셔널 아님) |
| `AssetListItemDto` ↔ `TAssetListItem` | `cloudResourceId`·`region` 추가 일치. `AssetListItemDto.cloudRegion()`이 `isCloud()` 가드로 custom 오염 차단(계약 §2.5) |
| `AssetDetailDto` ↔ `TAssetDetail` | `cloudResourceId` 추가 일치 |
| `AssetDashboardResDto` ↔ FE 타입 | `kpi.cloudCount` · `bySourceCoverage.cloudLinked/cloudUnlinked` 일치(6구간) |
| `CostDashboardResDto.cloud` ↔ `TCostDashboardCloud` | 5필드 일치, FE도 `\| null`(옵셔널 아님) |
| **🔴 NON_NULL** | 관련 DTO 7종 전부 `@JsonInclude` **0건**, 전역 `default-property-inclusion` 설정도 **없음** → 키 항상 존재. FE가 전부 `\| null`로 선언한 것과 정합 |
| enum 어휘 | `source` 3값 ✅ · `cloud.reason` 4+null ✅ · `billingState` 3값 ✅ · `collection.reason` 2+null(엔진 `CloudCostEstimateService:193-195` 실코드 대조) ✅ · `link_basis` 3값 ✅ · `clearFields` 1값 ✅ · 에러코드 3종 ✅ |
| 🔴 `failedRegionCount`(number) vs `failedRegions`(string[]) | 분리 유지 확인. BE `intOf(rawCollection.get("failedRegions"))` → `failedRegionCount:int`, sync 쪽은 `List<String>`. FE도 `TCostCloudCollection.failedRegionCount:number` / `TSyncCloudResult.failedRegions:string[]`이고 `CloudCostTab.tsx:134`가 `> 0` 비교(`.map()` 없음) |

### 항목 2 — 쿼리/바디 파라미터 문자 단위 : **PASS**

- `GET /costs/cloud`: FE `cost.api.ts:117` `API.get("/costs/cloud", { params })` ← `TCostCloudParams{resourceId, region, state, owner, assetLinked}` ↔ BE `SearchCostCloudDto` 동명 5필드(`@ModelAttribute`). 클래스 base `@RequestMapping("/costs")` + `@GetMapping("/cloud")` = `/costs/cloud` ✅
- URL 어휘 `linked/unlinked` → `assetLinkedToParam`(`constants/cost.ts:404-412`)이 **전송 직전 boolean 변환**, 미지정은 `undefined`(axios가 키 자체를 뺀다) ✅ 문자열을 그대로 실었으면 Spring `Boolean` 바인딩이 깨졌을 자리다
- `POST /assets/sync`: `{mode, groupIds, sources}` ↔ `SyncAssetsReqDto` 동명. 미지정/빈 배열 → `includesZabbix()` true(레거시 호환) ✅ FE도 빈 선택 시 `["zabbix"]`로 접는다(`SyncOptionsModal.tsx:handleSubmit`) — 양쪽 폴백 동일
- `PATCH /assets/{id}` `clearFields` + `linkedHostid` **동봉 규칙**:
  - FE: `withUnlink()`(`AssetFormModal.tsx:378-382`)가 해제 예약 시 **body에서 `linkedHostid`를 제거**하고 `clearFields`만 싣는다 ✅
  - BE: 동봉돼도 결정적이다 — cloud 분기가 `updateCustomClassification(...linkedHostid)` **뒤에** `applyClearFields`를 호출해 **해제가 이긴다**(`AssetService.java:299-303`). zabbix 분기는 `touchesDerivedClassification()`이 먼저 걸려 `ASSET_ZABBIX_READ_ONLY`(FE가 애초에 안 보냄) ✅
  - 허용값 밖 → 소스 분기 **이전에** `ASSET_INVALID_CLEAR_FIELD`(`AssetService.java:261-264`) ✅ · 이미 미연결이면 no-op(`applyClearFields` early return) ✅

### 항목 3 — `npm run typecheck:contract` 실측 : **PASS**

- `tsconfig.contract.json`: `extends: ./tsconfig.json` + `include: ["src","src/__tests__/fixtures"]` + `exclude: ["src/__tests__/**/*.test.ts(x)"]`. **자식 `exclude`가 부모의 `exclude:["src/__tests__"]`를 통째로 대체**하므로 픽스처가 실제로 들어온다
- `tsc --listFiles` 실측: `src/__tests__/fixtures/assetCloudContractSample.ts`·`assetDashboardContractSample.ts` **포함**, `*.test.ts(x)` **0건** — 의도대로 동작
- 실행 결과 **exit 0**
- 픽스처 값 ↔ 계약 §6 대조: §6.1 전체·§6.1 필터(`instances:[]`인데 `summary.instanceCount:1`)·§6.2 목록 1행·§6.3 `cloudData` 21키·§6.4 6구간(75+3+0+1+0+1=80)·§6.5 cloud 섹션·§6.7 레거시 sync — **전부 글자 단위 일치**
- ⚠️ `ASSET_CLOUD_DATA_SAMPLE`만 `Record<string, unknown>` 타입이라 게이트 강도가 낮다(`cloudData` 컬럼 타입이 그것이라 불가피 — 계약 §4)

### 항목 4 — 라우트·메뉴 : **PARTIAL**(F2)

| 검사 | 결과 |
|---|---|
| 구 경로 → 새 탭 리다이렉트(`Navigate replace`) | ✅ 코드상 존재 — 단 **게이트 안**이라 미구성 사용자에겐 안 걸린다 → **F2** |
| `/asset/cost?tab=cloud` 탭 파라미터 | ✅ `QueryParamKeys.TAB="tab"` · `COST_TAB.CLOUD="cloud"` · 미지 값이면 기본 탭 폴백 |
| 절대경로 자식 라우트 함정 | ✅ `cloudCost = "/cloud-infra-monitoring/cost"`가 부모 `path`로 **시작**하므로 RRv6 규칙 위반 아님(선재 구조 그대로) |
| SideNav 항목 제거 | ✅ `SideNav.tsx:254-255` 제거 + "되살리지 말 것" 주석 |
| MobileSideNav | ✅ 애초에 cloud-cost 항목이 **없다**(파일 무변경, grep 0건) — 누락 아님 |
| `navSearchEntries` 옛 경로 잔존 | ✅ 0건(신규 `asset-cost-cloud` 항목이 `?tab=cloud`+`AWS_RESOURCES` 권한으로 대체). 회귀 테스트로 고정됨 |
| `page-guide` 옛 경로 잔존 | ✅ 0건. `asset_cost`에 `ec2` 용어 추가 |
| 전 소스 옛 경로 참조 | ✅ 실링크 0건(남은 것은 `routes.ts` 정의 1곳 + 주석 3곳) |

### 항목 5 — i18n : **PARTIAL**(F3)

- kr/en **신규 키 대칭 ✅** — 양쪽 각각 +87줄, 신규 키 비대칭 0
- 잔존 비대칭 17건은 전부 **선재**(`discovery_management.preprocessing_param1.*` 6 / `generate_report_detail` 등 11) — ZM-119 무관
- **중복 키 0** — 토크나이저 기반 전 깊이 검사(루트·중첩 모두)
- 코드 참조 키 존재: 신규/수정 18파일에서 추출한 **376키 중 374키 존재**, 미존재 2건이 **F3**
- 삭제한 `cost.tab_cloud_coming_soon` 참조 잔존 **0**(유일한 등장은 "없어야 한다"를 확인하는 `AssetCostPage.test.tsx:100`의 `queryByText`)

### 항목 6 — BE 판정 규칙 코드 대조(계약 §3 16항 + §7) : **PASS 16/16**

| 규칙 | 근거 |
|---|---|
| ①upsert 키 = instanceId | `V36__asset_cloud.sql` 부분 유니크 `uq_asset_cloud_resource_id` + `Asset.cloudResourceId` |
| ②**사용자 필드 불가침** | `Asset.applyCloudSnapshot`(name·cloudData·resourceType·deployment·coverage·lastSyncedAt **만** 기록) — `ownerName`·`notes`·`customProperties`·`costData`·`deviceType` 세터 없음. `create()`에서만 `deviceType="server"`. lifecycle은 `forceLifecycle` 경로로 분리 |
| ③dirty check | `update()`가 `diff()` 비었으면 `return false`(save·이력 없음). 비교에서 `first_seen_at` 제외(`comparableBody`). 관측 시각은 `touchLastSyncedAt` **벌크 UPDATE**(@UpdateTimestamp 우회) |
| ④missing = 성공 리전만 | `markMissing`이 `region==null \|\| failedRegions.contains \|\| !okRegions.contains` → skip. 이미 `missing`이면 이력 재기록 안 함. `okRegions = byRegion.keySet()`이고 **0대 리전도 항목이 들어온다**(`collectRegion`이 빈 `rawInstances`로 성공 반환) → 오탐/누락 없음 |
| ⑤매치 실패 ≠ 해제 | `resolveLink`: `match.isEmpty()` → `keep`. 교체는 `INSTANCE_ID_EXACT`일 때만 |
| ⑥lifecycle 강제 | `lifecycleOverride`: terminated/missing → retired, 복구는 현재값이 `retired`일 때만 active |
| ⑦custom 충돌 skip | `findCustomByCloudResourceIds`(신규 후보만·빈 목록이면 미호출) → `recordCustomConflict` + `hasRecentSyncNote`로 반복 방지. source 자동 변경 없음 |
| ⑧excluded | upsert 모집단 `findBySource(SOURCE_CLOUD)`에 **포함**, 처리 시 `skipped++`. `markMissing`도 excluded 제외 |
| ⑨coverage 축 | `CloudAssetDerivation.coverage(linkedHostid)` 별도. `AssetDerivation.coverage`에 cloud 유입 차단 주석 + 집계기 분기(`AssetDashboardAggregator:180-198`) |
| ⑩연식 = `launch_time` | `AssetDashboardAggregator.acquisitionYear()`가 cloud면 `AssetCloudData.launchTimeOf` 앞 4자리, 실패 시 null → `acquisitionUnknownCount`. `byAcquisitionYear`도 같은 함수 사용 |
| ⑪품질 태그 미적용 | `AssetQualityPolicy.reasonTags`: `inventory_disabled`·`inventory_sparse`·`cost_missing`을 `!cloud` 가드. `classification_tag_mismatch`는 함수 자체가 `!isZabbix() → false`라 cloud 미적용 ✅. `owner_missing`·`host_unlinked`·`unclassified`·`expired`는 그대로 적용 ✅ |
| ⑫HW 모집단 `source != cloud` | `computeRows()` cloud continue → `/costs/hw`·`/costs/dashboard`·`/costs/hw/incomplete`(모두 computeRows 경유) + `CostBulkUploadService` 템플릿 `.filter(a -> !a.isCloud())` — **4곳 전부** |
| ⑬cost_data 쓰기 거부 | `CostService.updateCostData` 첫 줄 `ASSET_COST_NOT_APPLICABLE` → PATCH `/costs/hw/{id}`·업로드 행 동시 커버. `AssetService` cloud 분기도 `req.getCostData()!=null`이면 동일 코드 |
| ⑭derivePlatform | 축을 `cloud_data.resource_id` → `asset.isCloud()`로 교체(`CostService:1126-1134`) |
| ⑮통화 미합산 | BE: `CostDashboardResDto.cloud`가 별도 섹션(KPI 합산 없음). FE: `CostDashboardTab.tsx:266-296`이 **별도 Col 카드** + null이면 미렌더(0으로 안 그림) |
| ⑯권한 | `/costs/cloud`만 `requireView("cloudInfraMonitoring","awsResources")`. 대시보드는 `hasView`로 **부분 성공**(권한 없으면 cloud=null, HW는 정상) |
| §3-G PATCH 3분기 | zabbix/cloud/custom 3분기 존재, cloud는 `touchesSnapshot() \|\| resourceType \|\| cloudData` → `ASSET_CLOUD_READ_ONLY`, coverage를 `CloudAssetDerivation`으로 재파생(custom 규칙 유입 차단) |
| §3-G `manual_cleared` | `Asset.clearLink(coverage, cloudData)` + `AssetService.applyClearFields`가 **기존 맵 복사 후 키 하나만 교체**(record round-trip 아님 → 미지 키 보존). `resolveLink`가 `unlinked && manual_cleared && !instanceIdExact` → 재연결 차단, `INSTANCE_ID_EXACT`는 예외 통과 |
| 에러 → HTTP | `GlobalExceptionHandler.handleApiError` = **200 + body code/errorCode**(계약 관례 일치) |

### 항목 7 — 패키지 의존 방향·순환·트랜잭션 : **PASS**

- `aws → asset|cost` import **0건**(grep 실측). 역방향만 존재: `asset.cloud → aws`(3) · `cost → aws`(4)
- `InstanceSnapshotListener`가 `aws.spi`에 있고 구현은 `asset.cloud` — 방향 보존
- `ObjectProvider` 근거 타당: `CloudSnapshotService` ↔ `CloudAssetSyncService`가 서로를 생성자에서 요구(수동 경로가 `fetchInstances()`를 부른다) → 지연 해석으로 순환 차단. `listeners()` null 방어는 Mockito `@InjectMocks` 대응
- 트랜잭션 경계: `CloudSnapshotService.collect()`는 **`@Transactional`이 아니다**(같은 클래스에서 `@Transactional`은 `cleanup`뿐) → 리스너가 배치 트랜잭션 안에서 돌지 않는다. upsert는 `TransactionTemplate`로 자기 트랜잭션을 연다 ✅
- 예외 격리: `notifyListeners`가 try/catch로 삼켜 스냅샷 배치를 죽이지 않는다 ✅ 매칭 색인 교체 **뒤** 호출(warm 색인 사용) ✅
- 경합 수정: `synchronized(upsertLock)` + `DataIntegrityViolationException` 1회 재시도(재시도는 상대 커밋 행을 보고 갱신 경로로 수렴) ✅
- ⚠️ 참고(LOW·정보): `touchLastSyncedAt`이 `@Modifying(clearAutomatically=true)`인데 `flushAutomatically`는 미지정 — Hibernate auto-flush(질의 공간 겹침)에 의존한다. 현재 호출은 upsert **마지막 단계**라 안전하지만, 호출 위치가 앞으로 오면 미플러시 변경이 clear로 유실될 수 있다. `flushAutomatically = true` 명시를 권한다

### 항목 8 — FE 관례 : **PASS**

| 검사 | 결과 |
|---|---|
| 언랩 깊이 | ✅ `CostService.getCloudCost` → `passThroughEnvelope`는 이름대로 **envelope를 흘려보내고**(타입만 T로 캐스팅) 실패 시 `CostApiError` throw, 실제 언랩은 `useDmoveQuery`가 1회 — `getDashboard`/`getHwList`와 **완전 동일 패턴**. 과다/과소 언랩 없음 |
| `services/cloud-infra.ts` 자체 unwrap 혼용 | ✅ 혼용 없음. `CloudBillingCard`는 종전대로 `useDmoveQuery<TResponse<…>>` 직접 사용, 신규 코드는 `CostService` 경유로 통일 |
| `DmoveTable loading` | ✅ `CloudEstimateTable:36` · `CloudWasteTable:23` 모두 명시 전달(무한 스피너 함정 회피, 주석까지 남김) |
| URL state(로컬 useState 금지) | ✅ Cloud 탭 필터 4종 전부 `useQueryParams`. 로컬 `useState`는 모달 open(`syncOpen`)·해제 예약(`unlinkRequested`)뿐 — 데이터 결정 상태 아님 |
| 구 `CloudCostPage` 잔여/복제 | ✅ 16줄 `<Navigate replace>`만 남고 표·카드·컬럼 정의 **복제 0**(이동) |
| 쿼리 키 분리 | ✅ `COST_QUERY_KEY.CLOUD`를 `CLOUD_INFRAS_QUERY_KEY.COST_ESTIMATE`와 분리 + `useSyncAssets`가 동기화 후 무효화 |
| 소스 3분기 | ✅ `ASSET_SOURCE_OPTIONS`/`ASSET_SOURCE_TAG_COLOR`에 cloud 추가, 목록 필터를 상수에서 파생(하드코딩 2분기 제거) |
| 실행 검증 | ✅ jest 8스위트 88 tests green(`CloudCostTab` `AssetFormModalCloud` `AssetUnlinkHost` `SyncOptionsModalSources` `cloudCostRedirect` `AssetCostPage` `AssetDashboardPage` `CostDashboardTab`) |

---

## 3. 미검증(이 QA 범위 밖)

- **BE 컴파일·테스트 재실행 안 함** — 계약 §7의 `1537 tests / 0 fail`을 그대로 인용한다(전역 JAVA_HOME=JDK8·gradle 데몬 간섭 회피)
- 런타임 행위(`clearFields` 실왕복 · 경합 수정 · `first_seen_at` Z 표기 · 브라우저 렌더) → **functional-qa 몫**. 계약 §7이 이 3건을 "재기동 필요, 미검증"으로 남겨 뒀다
- F2의 게이트 가로채기는 **정적 판정**이다 — 실제 렌더 순서는 functional-qa가 확인하면 좋다
