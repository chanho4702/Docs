# QA — 자산 현황 대시보드 (정적 경계면 검증)

> 산출 2026-08-26 · Claude(`integration-qa`) · 티켓 **ZM-116**
> 대상: BE `C:\worktrees\zm-116-be` · FE `C:\worktrees\zm-116-fe` (격리 worktree, 둘 다 미커밋)
> 계약 정본: [features/assets/asset-dashboard/contract_asset-dashboard.md](contract_asset-dashboard.md) v1.1 · 설계: [features/assets/asset-dashboard/devdesign_asset-dashboard.md](devdesign_asset-dashboard.md)
> 범위: **정적 대조만**. 앱 기동·브라우저·실호출 없음(런타임 행위는 `functional-qa` 몫).
> 코드 수정 없음 — 아래는 전부 보고다.

## 요약

| 결과 | 수 |
|---|---:|
| **PASS** | 8 항목 / 세부 27 |
| **FAIL** | **6건** (HIGH 0 · MEDIUM 2 · LOW 4) |

보조 근거로 돌린 것(정적 범위 내 빌드·테스트):

| 실행 | 결과 |
|---|---|
| FE `npx tsc --noEmit` | **clean(0 error)** — 계약 §5 실측 payload 픽스처가 `: TAssetDashboard`로 박혀 있어 **BE 실제 응답이 FE 타입에 들어가는지 tsc가 강제**한다 |
| FE `npx jest` (대시보드 5스위트) | **59 passed / 0 failed** |
| BE `./gradlew :test --tests com.dmove.moveseye.asset.* --tests com.dmove.moveseye.cost.*` | **230 tests, 0 failure, 0 error** (`AssetQualityTagFilterTest`·`CostServiceTest`·`CostDashboardServiceTest` 포함) |

---

## FAIL 목록

### F1. `bySourceCoverage.customLinked` 딥링크가 **구조적으로 항상 0건**에 착지한다 — MEDIUM / **FE**

| 항목 | 값 |
|---|---|
| 위치 | `moveseyee_fe/src/pages/asset/dashboard/AssetDashboardPage.tsx:186-193` (`customLinked` 세그먼트 `onSelect`) |
| 기대 | "MovesEye · 호스트 연결" 조각을 누르면 목록에 **같은 집합**(custom + `linked_hostid` 있음)이 뜬다 |
| 실제 | `goToList({ source: "custom", coverage: "monitored" })` → **결과 0건 보장** |

근거(BE):

- `AssetDerivation.coverage(String source, String status)` — `moveseye-be-spring/src/main/java/com/dmove/moveseye/asset/AssetDerivation.java:35`
  ```java
  return Asset.SOURCE_ZABBIX.equals(source) && ZABBIX_STATUS_ENABLED.equals(status)
          ? COVERAGE_MONITORED : COVERAGE_UNMONITORED;
  ```
- custom 자산은 생성·수정 경로 두 곳 모두 `AssetDerivation.coverage(Asset.SOURCE_CUSTOM, null)`로 저장한다
  (`AssetService.java:218`, `AssetService.java:288`) → **custom 자산의 `coverage`는 언제나 `"unmonitored"`**.
- 반면 집계기는 custom을 coverage가 아니라 **연결 여부**로 가른다
  (`AssetDashboardAggregator.bySourceCoverage`, `AssetDashboardAggregator.java:167-178` — `AssetQualityPolicy.hostUnlinked(a)`).

즉 `customLinked`(연결된 custom)와 `?source=custom&coverage=monitored`(존재할 수 없는 조합)는 서로 다른 축이다.
dev 실측이 `customLinked = 0`이라 왕복 검증에서 드러나지 않았다 — **custom 자산 하나를 호스트에 연결하는 순간
"1건"이라고 써 놓은 조각이 빈 목록으로 착지한다**(설계가 막으려는 "화면이 거짓을 말한다"의 전형).

권고: 이 조각은 목록에 정확한 축이 없다. `qualityTag`는 "연결 **없음**"만 표현하므로
(a) 클릭을 떼거나, (b) M2에 `hostLinked=true` 축을 요청하거나, (c) 툴팁으로 "목록 축 없음"을 안내한다.

### F2. `bySourceCoverage.customUnlinked` 딥링크가 **custom 전체**를 연다 — MEDIUM / **FE**

| 항목 | 값 |
|---|---|
| 위치 | `AssetDashboardPage.tsx:199-207` |
| 기대 | 조각 값(=미연결 custom 수)과 목록 `total`이 일치 |
| 실제 | `?source=custom&coverage=unmonitored` → **모든 custom 자산**(연결·미연결 무관, F1과 같은 근거) → `total = customLinked + customUnlinked` |

dev는 `customLinked=0, customUnlinked=1`이라 우연히 1 = 1로 맞았다.
권고: `?source=custom&qualityTag=host_unlinked`로 교체하면 v1.1에서 신설된 정확한 축에 착지한다
(`AssetQualityPolicy.hostUnlinked`와 **같은 판정** — 계약 §3 공유 표).

### F3. 소유자 미지정 딥링크 2곳이 `savedView=ownership`을 쓴다(판정이 미묘하게 다름) — LOW / **FE**

| 항목 | 값 |
|---|---|
| 위치 | `AssetDashboardPage.tsx:388-390`(KPI 타일) · `AssetDashboardPage.tsx:449-455`(소유자 차트 "미지정" 조각) |
| 기대 | 대시보드 `kpi.ownerMissing`(11) = 목록 `total` |
| 실제 | 대시보드 판정 `AssetQualityPolicy.ownerMissing` = `isBlank`(공백만 있는 값도 미지정) vs 목록 `savedView=ownership` SQL = `a.owner_name IS NULL OR a.owner_name = ''` (`AssetRepository.java:123`) |

공백 문자만 든 `owner_name`이 있으면 대시보드는 세고 목록은 안 센다. 실데이터에 그런 값이 없어 지금은 같다.
v1.1에서 **정확한 축이 생겼다**(`?qualityTag=owner_missing`, 작업 큐·완성도 막대는 이미 이 축을 쓴다 —
`AssetDashboardPage.tsx:66-68`, `:86`). 두 링크만 옛 축에 남아 있어 같은 화면 안에서 축이 두 벌이다.

### F4. `ASSET_ERROR_CODE.INVALID_QUALITY_TAG`가 선언만 되고 소비처가 없다 — LOW / **FE**

| 항목 | 값 |
|---|---|
| 위치 | `moveseyee_fe/src/constants/asset.ts:64` (선언) — `grep`상 소비 0건 |
| 기대 | 계약 §1대로 BE가 **HTTP 400 + `ASSET_INVALID_QUALITY_TAG`**를 주는 경로를 FE가 알아보고 "이 필터 값이 유효하지 않다"를 말한다 |
| 실제 | 상수만 있고 분기 없음. 같은 상수 집합의 다른 코드는 `AssetFormModal.tsx:382·386·391·409`에서 실제로 소비된다 |

BE 매핑은 확인됨(정상): `SearchAssetListDto.qualityTagFilter()`가 `new ApiError(ErrorCode)` → `ApiError.java:18`이
`HttpStatus.BAD_REQUEST` 기본값 → **400 + errorCode** (계약 §1 일치).
발생 경로는 손으로 고친 URL·태그 코드 변경 후 남은 북마크 정도라 빈도는 낮다. 다만 지금은 목록이
일반 에러로 떨어져 **원인이 `qualityTag`라는 사실이 화면에 안 나온다**.

### F5. `palette.ts` — `readableTextOn`의 JSDoc이 새 함수 위로 밀렸다 — LOW / **FE**

| 항목 | 값 |
|---|---|
| 위치 | `moveseyee_fe/src/constants/palette.ts:552-580` |
| 기대 | 주석은 설명하는 함수 바로 위 |
| 실제 | 기존 `readableTextOn` 설명 블록(`antd <Tag color="#hex">는 글자를 무조건 흰색으로…`) **바로 뒤에** `tagPresetChartColor`의 새 JSDoc이 삽입돼, 주석 두 개가 연달아 붙고 `readableTextOn`은 주석 없이 남았다 |

동작 영향 없음(export·시그니처 변경 0 — 아래 §8 PASS 참조). 순수 문서 결함.

### F6. `activity` 섹션의 모집단이 필터 유무로 달라진다 — LOW / **BE**(계약 미규정)

| 항목 | 값 |
|---|---|
| 위치 | `AssetDashboardService.buildActivity` — `AssetDashboardService.java:271-283` |
| 실제 | 필터 없음 → `aggregateDailyCounts(fromAt)` / `findTop10ByOrderByIdDesc()` = **전 자산**(excluded 자산의 이력 포함). 필터 있음 → 모집단 id 한정(excluded 제외) |

같은 위젯이 "필터 하나 걸었을 뿐인데" 모집단 정의가 바뀐다(제외 자산 이력이 빠진다).
계약 §2는 `activity`의 모집단을 규정하지 않아 **위반은 아니다**. 다만 §3 모집단 규칙(`excluded=false`)이
다른 모든 섹션에 걸려 있어 여기만 예외인 것이 설명되지 않는다 — 계약에 한 줄 못 박기를 권고.

> 참고(FAIL 아님, 같은 성격): `population.excludedCount`는 `assetRepository.countByExcludedTrue()`로
> **필터와 무관한 전역 수**다(`AssetDashboardService.java:79`). 계약 §2가 "제외 자산 수"라고만 적어 위반은
> 아니지만, 필터가 걸린 화면에서 `total`(필터 후)과 `excludedCount`(전역)의 기준이 다르다.

---

## PASS 상세

### 1. 계약 §2 TS ↔ Java DTO ↔ FE `types/asset.ts` 삼자 대조 — PASS

`AssetDashboardResDto.java`(레코드 22개)와 `types/asset.ts`의 `TAssetDashboard*` 전 필드를 1:1 대조했다.
**필드 누락·오타·타입 불일치·optional 어긋남 0건.**

| 섹션 | Java | FE | 결과 |
|---|---|---|---|
| 루트 | 9필드 | 9필드 | ✅ |
| `population` | 3 | 3 | ✅ |
| `kpi` | 16 | 16 | ✅ (`lastSyncedAt` nullable 양쪽 일치) |
| `composition` | 8 | 8 | ✅ |
| `DeviceTypeCount` | `code·name·**colorPreset**·active·count` | 동일 | ✅ v1.1 rename 반영 완료 |
| `SourceCoverage` | 4 | 4 | ✅ |
| `lifecycle` | `byStatus(5)·byAcquisitionYear(3)·acquisitionUnknownCount·beyondUsefulLifeCount·expiry(6)` | 동일 | ✅ `byStatus.other`(§6-3) 포함 |
| `quality` | `completeness(4)·workQueue(8)·workQueueTotal·tagCounts` | 동일 | ✅ |
| `live` | `asOf·statusCounts(4)·topProblemAssets(8)` + **nullable** | `TAssetDashboardLive \| null` | ✅ |
| `activity` | `daily(6)·recent(8)` | 동일 | ✅ |
| `filterOptions` | 2 | 2 | ✅ |

**결정적 근거**: 계약 §5의 실측 payload가 `src/__tests__/fixtures/assetDashboardContractSample.ts`에
`: TAssetDashboard` 타입 주석과 함께 들어 있고 `tsc --noEmit`이 clean이다. TS의 초과 프로퍼티 검사 덕에
이 픽스처는 **"BE가 보내는 모든 키가 타입에 있고, 타입에 없는 키는 하나도 없다"**를 동시에 증명한다.

#### 1a. enum 문자열 집합 — PASS

| 집합 | BE 정본 | FE 사본 | 결과 |
|---|---|---|---|
| OS 계열 7 | `OsFamilyNormalizer.FAMILIES` = windows·linux·unix·network_os·hypervisor·other·unknown | `ASSET_OS_FAMILY_ORDER`(`constants/asset.ts:294`) + `TAssetOsFamily` | ✅ 문자·순서 동일 |
| 품질 태그 9 | `AssetQualityPolicy.TAGS` | `TAssetQualityTag` + `ASSET_QUALITY_TAG_ORDER`(`constants/asset.ts:355`) | ✅ 9종 동일(순서는 FE가 시급도순 재정렬 — 의도된 것, 집합은 동일) |
| live status 4 | `HostLiveAggregator.STATUS_*` = Healthy·Degraded·Unavailable·Unknown | `TAssetLiveStatus`(`types/asset.ts:42`, 기존 타입 재사용) | ✅ |
| lifecycle 5 | `LifecycleStatusCounts(active·planned·retired·expired·other)` | 동일 | ✅ |
| actorType | `"user"\|"system"`(BE는 `String`) | `TAssetActorType` | ✅ |
| 완성도 10 | `AssetQualityPolicy.FIELDS` | `TAssetQualityField` + `ASSET_QUALITY_FIELD_LABEL_KEY` | ✅ |
| `activity.recent[].action` | `String`(열어 둠) | `string`(좁히지 않음) | ✅ 계약 §6·F-5 의도대로 |

#### 1b. 직렬화 shape(`@JsonInclude`·`@JsonFormat`) — PASS

- 🔴 이 레포의 교훈("NON_NULL은 DTO별로 다르다")을 겨냥해 확인: **`AssetDashboardResDto`에는 `@JsonInclude`가 없고
  전역 `default-property-inclusion` 설정도 없다**(`grep`으로 `src/main`·`engine-api/src/main`·yml 전수).
  → `live: null` · `byOwner[].name: null` · `workQueue[].owner/coverage/linkedHostid: null` ·
  `maxSeverity: null` · `assetName: null` · `actorName: null` · `lastSyncedAt: null`이 **키 생략이 아니라 `null`로 나간다**.
  FE 타입의 `| null`(≠ optional `?`)과 정확히 맞는다. 계약 §5 샘플과도 일치.
- `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")`는 `kpi.lastSyncedAt`·`activity.recent[].createdAt` **두 곳뿐**
  (계약 §4의 "서버 로컬 벽시계 + Z" 관례). `generatedAt`·`live.asOf`는 `ISO_UTC.format(clock.instant())`로
  **진짜 UTC**(`AssetDashboardService.java:60·102`). 계약 §4 두 기준 표와 정확히 일치.
  FE는 이 둘을 빼서 쓰지 않고 `kpi.staleSync` boolean을 그대로 소비한다(`AssetDashboardPage.tsx:322`) ✅.

### 2. FE 언랩 깊이 — PASS

- `AssetService.getDashboard`는 `API.get(...)`을 그대로 반환한다(`services/asset.api.ts:80-82`) —
  `getSummary`·`getDetail`과 **동일 관례**(axios 인터셉터가 1겹, `useDmoveQuery`가 1겹).
  변경성 EP만 쓰는 `unwrapEnvelope`를 GET에 잘못 얹지 않았다 ✅
- `useAssetDashboard`가 `useDmoveQuery<TAssetDashboard>`로 payload를 직접 타입한다(`hooks/useAsset.ts:86-95`) ✅
- 소비처 전수 확인: `data.kpi` · `data.composition` · `data.live` · `data.quality.workQueue` …
  **`data.data` 형태 0건**(`AssetDashboardPage.tsx` 전체) ✅
- 테스트 mock도 payload 직접: `useAssetDashboard.test.tsx`의
  `it("🔴 payload를 그대로 돌려준다 (data.data는 과다 언랩)")`가 `result.current.data`를 픽스처와 `toBe`로 잠갔다 ✅
- 캐시 무효화도 붙었다 — `invalidateList`에 `ASSET_QUERY_KEY.DASHBOARD` 추가(`hooks/useAsset.ts`) ✅

### 3. 쿼리 파라미터 6축 + `qualityTag` 문자 단위 일치 — PASS (딥링크 축은 F1·F2·F3 참조)

| 이름 | BE 대시보드 DTO | BE 목록 DTO | FE 타입 | FE URL 키 | 결과 |
|---|---|---|---|---|---|
| `deviceType` | `SearchAssetDashboardDto.deviceType` | `SearchAssetListDto.deviceType` | `TAssetDashboardParams.deviceType` | `QueryParamKeys.DEVICE_TYPE="deviceType"` | ✅ |
| `groupName` | ✅ | ✅ | ✅ | `GROUP_NAME="groupName"` | ✅ |
| `owner` | ✅ | ✅ | ✅ | `OWNER="owner"` | ✅ |
| `lifecycle` | ✅ | ✅ | ✅ | `LIFECYCLE="lifecycle"` | ✅ |
| `source` | ✅ | ✅ | ✅ | `SOURCE="source"` | ✅ |
| `coverage` | ✅ | ✅ | ✅ | `COVERAGE="coverage"` | ✅ |
| `qualityTag` | (없음 — 의도) | `SearchAssetListDto.qualityTag` | `TAssetListParams.qualityTag` | `QUALITY_TAG="qualityTag"` | ✅ |

- 대시보드 DTO가 목록의 `keyword·savedView·sortBy·limit·offset·includeExcluded`를 **선언하지 않는다**(계약 §1) ✅
- `deepLink.ts`가 만드는 키 = 목록 `AssetListPage`가 읽는 키. `AssetListPage.tsx:94`가
  `qualityTag: (params.qualityTag as TAssetQualityTag) || undefined`로 URL→API 전달 ✅
- **`savedView` 충돌 축 제거 규칙 있음** — `deepLink.ts:29-34` `SAVED_VIEW_CONFLICTS`
  (`ownership→owner` · `hardware_eol→lifecycle` · `unmonitored→coverage` 제거). 프리셋이 이미 그 축을
  결정하므로 함께 실으면 반드시 0건이 되는 조합을 막는다 ✅
- `offset=0` 강제 리셋(`deepLink.ts:69`) — 목록에 남은 offset을 물고 가서 "빈 페이지"가 뜨는 것을 막는다 ✅
- `null` override로 축을 지우는 규약이 `hasOwnProperty`로 구현돼 있다(`deepLink.ts:56-58`) —
  값 truthiness로 판단하면 "지우기"가 동작하지 않는다는 함정을 피했다 ✅
- 관련 회귀 테스트 `assetDashboardDeepLink.test.ts` 통과 ✅
- ℹ️ `qualityTag` 딥링크에는 충돌 축 제거 규칙이 없다. 다만 실제로 충돌할 조합(예: `owner=X` + `qualityTag=owner_missing`)은
  대시보드가 이미 필터된 모집단으로 태그를 세므로 그 태그 자체가 렌더되지 않거나, 완성도 막대의 경우
  "그 항목이 안 비어 있다"는 참인 0건이라 **거짓을 말하지 않는다** → FAIL로 올리지 않음.

### 4. i18n — PASS

스크립트로 전수 검증(`scratchpad/i18n_check.js`):

| 검사 | 결과 |
|---|---|
| `src/pages/asset/**` + `constants/asset.ts`의 `t("literal")` 전수 ↔ kr/en | **누락 0** (양쪽 모두) |
| `assetDashboard.*` 서브트리 키 수 | kr 145 / en 145, **kr-only 0 · en-only 0** |
| 동적 키 `assetDashboard.quality_tag.<9종>` | 9/9 kr·en 존재 ✅ |
| 동적 키 `assetDashboard.quality_tag_hint.<9종>` | 9/9 ✅ |
| 동적 키 `assetDashboard.os_family.<7종>` | 7/7 ✅ (+ 코드가 `defaultValue` 폴백까지 검) |
| 동적 키 `assetDashboard.quality_field.<10종>` | 10/10 ✅ |
| 템플릿 키 `assetDashboard.activity_${created\|updated\|excluded\|restored}` | 4/4 ✅ |
| 템플릿 키 `asset_activity.action.*` · `asset_source.*` · `asset_coverage.*` | 전부 존재 ✅ |
| 목록 필터 라벨 `asset_field.quality_tag` | kr "관리 상태" / en 존재 ✅ |
| `page_guide.asset_dashboard.{summary,detail}` | kr·en 존재 ✅ (`constants/page-guide.ts`에 엔트리 등록) |
| **루트 키 중복** | kr.json·en.json 모두 **0** ✅ |
| 태그 라벨 재사용 | 대시보드 작업 큐와 목록 필터가 **같은 키**(`assetQualityTagLabelKey`)를 쓴다 — `AssetListPage.tsx:224` ✅ |

**브레드크럼 세그먼트 키 침범 — 없음.** 새 경로 세그먼트는 `dashboard` 하나이고,
`kr.json:408`의 루트 키 `"dashboard": "대시보드"`는 **이미 존재하던 키**다(SideNav가 `t("dashboard")`로 쓴다).
새 키를 만들어 기존 의미를 덮은 곳이 없다.

### 5. 라우트 등록·메뉴·권한 게이트 — PASS

- 🔴 "절대경로 자식 라우트가 부모 블록에 들어가면 앱이 안 뜬다"는 함정 확인 결과 **문제 없음**:
  `routes.tsx:864-880`의 부모는 `path: PATH_ROOTS_ASSET.root`(`/asset`)이고, 새 라우트
  `PATH_ROOTS_ASSET.dashboard`(`/asset/dashboard`)는 **부모 경로로 시작하는 절대경로**다 —
  형제인 `list`·`detail`·`cost`와 **완전히 같은 방식**이라 새로 도입된 패턴이 없다 ✅
- `constants/routes.ts:262` `dashboard: path(ROOTS_ASSET, "/dashboard")` — 기존 헬퍼 사용 ✅
- 메뉴: `SideNav.tsx:327-336`(아이콘 `DashboardOutlined`)·`MobileSideNav.tsx:336-342`에 **양쪽 다** 추가,
  자산 서브메뉴 **첫 항목**으로 순서 일치 ✅
- 권한 게이트: 자산 메뉴의 다른 항목과 동일하게 별도 가드 없음 = 계약 §1 "인증 사용자 전원, 관리자 가드 없음"과 일치.
  BE도 `AssetController#getDashboard`에 `@AdminOnly` 류 어노테이션 없이 클래스 레벨 `@VisitorIdCheck`만
  상속한다(`AssetController.java:77-86`) ✅ — BE·FE 게이트 세기가 같다.

### 6. `AssetQualityPolicy` 공유 — `CostService` 위임 등가 — PASS

리팩터 4+2곳을 diff로 한 줄씩 대조했다. **판정 결과가 달라지는 지점 0건.**

| 위치 | 이전 | 이후 | 등가 근거 |
|---|---|---|---|
| `buildReviewCandidates` `missing_cost` (`CostService.java:429`) | `!r.params.incompleteReasons().isEmpty()` | `AssetQualityPolicy.costMissing(...)` | 정책은 `reasons != null && !isEmpty()` — non-null에서 동일(null이면 이전엔 NPE, 이후엔 false = 더 안전) |
| `buildReviewCandidates` `owner_missing` (`:453`) | `isBlank(r.asset.getOwnerName())` | `AssetQualityPolicy.ownerMissing(r.asset)` | `CostService.isBlank`(`:1133`) = `s == null \|\| s.isBlank()` ↔ 정책 `asset == null \|\| isBlank(getOwnerName())` — **문자 단위 동일** |
| `buildReviewCandidates` `host_unlinked` (`:456`) | `isBlank(r.asset.getLinkedHostid())` | `AssetQualityPolicy.hostUnlinked(...)` | 동일 |
| `assignPriorities` (`:855`) | `isBlank(ownerName), isBlank(linkedHostid)` | `ownerMissing(...), hostUnlinked(...)` | 동일 + **인자 순서 보존**(`CostPriorityPolicy.evaluate(…, ownerMissing, hostUnlinked, …)`) |
| `getIncomplete` (`:592`) | `!incompleteReasons().isEmpty()` | `costMissing(...)` | 동일 |
| KPI `incompleteCount` (`:1018`) · 대시보드 KPI `incomplete`(`:232`) · `applyFilters` costStatus(`:958`) | 동일 술어 | `costMissing(...)` | 동일 |

- 남아 있는 `isBlank(r.asset.getOwnerName())` 3곳(`:264`·`:373`·`:465`·`:1052`)은 **판정이 아니라 그룹핑 키**
  (`blank → null`)라 위임 대상이 아니다 — 올바른 판단 ✅
- **회귀 증거**: `CostServiceTest`·`CostDashboardServiceTest`·`CostPriorityPolicyTest` 포함 **BE 230 tests green**.
- 목록 필터와 대시보드가 같은 판정을 쓰는지는 `AssetQualityTagFilterTest`가
  "리포지토리에 넘어간 id 집합 = `tagCounts[X]`"로 9종 전부 잠갔다(green) ✅

### 7. 계약 §3 판정 규칙 표 ↔ 코드 — PASS

| §3 규칙 | 코드 | 결과 |
|---|---|---|
| 모집단 = `excluded=false` + 필터 선적용 | `AssetDashboardService.java:75-88` | ✅ |
| `filterOptions`는 **필터 적용 전** | `buildFilterOptions(allRows)` — `:104`·`:135-146` (`rows` 아님) | ✅ |
| "미입력" 조각 항상 존재 | `byOsFamily`=`FAMILIES.stream()` 7개 고정(`Aggregator:236-243`) · `byOwner` 끝에 `NamedCount(null, missing)` 무조건 add(`:271`) · `byDeviceType` 끝에 `notClassified` 무조건 add(`:154-161`) | ✅ 3/3 |
| `byDeviceType` 순서 = 마스터 → 잔존 code(`active:false`) → `notClassified` 마지막 | `Aggregator:126-161`(마스터 루프에서 notClassified만 건너뛰고 맨 끝에 추가) | ✅ |
| 비활성 분류는 남은 자산 있을 때만 | `if (!c.isActive() && count == 0) continue;`(`:139`) | ✅ |
| `otherGroupCount` = Top10 **밖 그룹 수** | `groupCounts(rows).size() - TOP_N`(`:198`) | ✅ (FE 문구도 "그 외 {{count}}개 그룹") |
| 취득일 = `CostParamResolver` 폴백 그대로 호출, `created_at` 추정은 연도 차트 제외 | `AssetQualityEvaluator.evaluate` `:99-105` → `byAcquisitionYear`가 `!hasKnownAcquisition()` continue(`:311-313`), 제외분은 `acquisitionUnknownCount`(`:288`) | ✅ |
| 내용연수: 추정 취득일이면 판정 안 함 | `AssetQualityEvaluator.java:110-111` (`!p.acquisitionEstimated() &&`) | ✅ |
| **만료 6구간 배타적**, 합 = 모집단 | `expiryBuckets`(`Aggregator:334-360`) — `unknown` / `< today` / `≤30` / `≤60` / `≤90` / else, if-else 사슬로 상호 배타 | ✅ |
| `expired` 경계 = `< today`(오늘 만료는 경과 아님) | `exp.isBefore(today)` · `AssetQualityPolicy.expired`도 `isBefore` | ✅ 비용 화면과 동일 경계 |
| 완성도 10항목 균등 가중 | `FIELDS.size()`를 분모로(`Aggregator:88-89`) | ✅ |
| `inventory_mode=-1`을 점수에서 빼지 않음 | `filledFields`에 조건 없음 + `TAG_INVENTORY_DISABLED`로 원인 표시 | ✅ |
| `inventory_sparse`는 `inventory_disabled`와 **겹치지 않음** | `if (inventoryDisabled) … else if (inventorySparse) …`(`Policy:206-214`) | ✅ |
| 작업 큐 = 자산당 1행 + 복수 태그, 정렬 태그수↓ → 모니터링 우선 → 이름 → id | `workQueueOrder()`(`Aggregator:406-416`) | ✅ 4단 정렬 그대로 |
| 상태 4값 = 자산 상세와 같은 규칙 | `HostLiveAggregator.statusOf` 신설 + `AssetService.resolveStatus` **삭제 후 위임**(`AssetService.java:493`) | ✅ 규칙 이중화 해소. 등가: 기존 `unknown` 분기 → `!AVAILABLE.equals(...)`이고 `resolveAvailable`이 3값만 반환(`:186-193`)하므로 동일 |
| 스냅샷에 없는 호스트 = Unknown | `live != null ? live.status() : STATUS_UNKNOWN`(`Service:181`) | ✅ |
| `live` 실패 = null(부분 성공, 500 금지) | try/catch → `return null`(`Service:163-172`), FE는 D 섹션만 접는다(`AssetDashboardPage.tsx:534-556`) | ✅ 양쪽 일치 |
| `activity.daily` 항상 30개(0건 날 포함) | `for (i=0; i<ACTIVITY_DAYS; i++)` 로 채움(`Service:296-302`) | ✅ |
| `changedFields`는 필드 이름만 | `map(AssetActivityChange::field)`(`Service:329-331`) | ✅ 값 미포함 |
| `completeness` pct 오름차순 | 안정 정렬(`Aggregator:396`) + FE가 한 번 더 정렬(`AssetDashboardPage.tsx:305-310`) | ✅ 이중 안전 |
| `tagCounts` 9키 항상 존재(0 포함) | `TAGS.forEach(tag -> tagCounts.put(tag, 0))` 선시딩(`Aggregator:376-377`) | ✅ |

부수 확인(설계 함정 회피가 실제로 되어 있음):
`Map.of()` 대신 `HashMap`/`LinkedHashMap`으로 `get(null)` NPE 회피(`Aggregator:122`, `Evaluator:57`) ·
중첩 삼항 언박싱 NPE 회피(`severityRank` `null → -1`, `Service:216-225`) ·
빈 `IN ()` Postgres 문법 오류 회피(`AssetService.java:90·118-124`, `Service:277-280`) ✅

### 8. 팔레트 `tagPresetChartColor` — PASS (문서 결함 F5만)

- `git diff src/constants/palette.ts` = **순수 추가**(import 1줄 + 함수 1개). 기존 export의
  시그니처·값·삭제 **0건**. `PALETTES`·`getPalette`·`setPaletteMode`·`readableTextOn` 모두 무변경 ✅
- 의존성 실재: `@ant-design/colors@^7.0.2`가 `package.json:22`에 이미 있다(새 패키지 추가 아님) ✅
- **다크 모드 분기 있음**: `mode === "dark" ? presetDarkPalettes : presetPalettes`(`palette.ts:578`) ✅
- 모드 전환 시 재계산됨: 기본 인자 `mode: TPaletteMode = activeMode`는 **호출 시점에 평가**되고,
  `setPaletteMode`가 `activeMode` 대입 **뒤에** 리스너를 통지하며(`palette.ts:542-548`),
  `usePalette`가 `useSyncExternalStore`로 그 통지를 구독한다 → 대시보드가 리렌더되며
  `deviceTypeItems`(렌더 본문에서 매번 계산, memo 없음)가 새 모드로 다시 계산된다 ✅
- `"default"`/null 폴백 → `palette.INK.muted`, 미지 preset도 같은 폴백 ✅ (ECharts에 잘못된 CSS 색이 갈 일 없음)
- FE가 실제로 이 변환을 통과시킨다: `AssetDashboardPage.tsx:159` `color: tagPresetChartColor(entry.colorPreset)` ✅
  (계약 F-1이 지적한 "preset 이름을 hex로 오해" 결함의 재발 방지가 코드와 테스트 양쪽에 있다)

---

## 검증하지 않은 것(범위 밖 — 다음 단계)

- **런타임 행위**: 브라우저 렌더·차트 클릭 실제 착지·다크 모드 실측 → `functional-qa`.
  특히 **F1·F2는 런타임에서 "0건 목록"으로 눈에 보이는 결함**이니 확인 대상 1순위다.
- BE 실 왕복(`GET /assets/dashboard`) 재실측 — 계약 §5는 be-engineer가 이미 실측했고,
  이 QA는 그 payload를 픽스처로 받아 정적 대조만 했다.
- FE 전체 테스트 스위트(대시보드 관련 5스위트만 실행) · BE 전체 모듈 테스트(`:test` 루트 모듈만 실행).
