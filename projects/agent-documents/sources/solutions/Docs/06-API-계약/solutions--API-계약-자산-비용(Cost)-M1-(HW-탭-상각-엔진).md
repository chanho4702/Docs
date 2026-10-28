# API 계약 — 자산 비용(Cost) M1 (HW 탭 + 상각 엔진)

> 산출: be-engineer 2026-07-30 · 최종 갱신 2026-08-03(FE 요청 R-1~R-5: 비동기 업로드 job 계약 · 4-2d 작업 복구 EP 추가) · 설계 정본: `_workspace/designs/devdesign_asset-cost.md`
> BE: `moveseye-be-spring` `com.dmove.moveseye.cost/` + `setting/classification` 확장 · Flyway `V17__cost_depreciation.sql`·`V18__cost_bulk_upload_job.sql`
> 범위: 설계 §7의 **EP 4·5·6·7(M1)** + **`GET /costs/dashboard`(M2, §5-D)** + 일괄 업로드(템플릿/업로드) + 기기분류 상각 기본값 API. M2 Dashboard는 §5-D로 구현(예산은 2026-08-04 미채택). M3(Cloud)는 미구현.

---

## 0. 응답 래퍼 깊이 (읽고 시작할 것)

BE는 모든 응답을 `ApiResult<T>`로 감싼다: `{ status, code, data: T, syncTime? }`.
**FE는 axios 인터셉터 + `useDmoveQuery`가 2겹을 벗겨 소비자 훅은 `T`(payload)를 직접 받는다**
([[fe-usedmovequery-unwrap]] — `data.data` 접근은 과다 언랩). 아래 "응답"은 전부 **언랩 후의 `T`**다.

**에러도 HTTP 200으로 나간다** (`GlobalExceptionHandler` — 이 프로젝트의 의도된 계약, "정상화" 금지):

- 검증/도메인 에러(`COST_*`·`ASSET_NOT_FOUND` 등 전부): **HTTP 200** + body
  `{ status: "error", code: 400, errorCode: "<ERROR_CODE>", message: "<ERROR_CODE>" }`
  (`errorCode`와 `message`에 같은 코드 문자열. `data`는 null이면 생략).
- 권한 거부(비관리자 PATCH 등): **HTTP 200** + body `{ status: "error", code: 403, message: "Access Denied" }` (`errorCode` 없음).
- Bean Validation(@Valid) 실패: **HTTP 200** + body `{ status: "error", code: 400, message: "<제약 메시지 \n join>" }` (`errorCode` 없음).
- **401(미인증/세션 만료)만 실제 HTTP 상태코드**로 나간다. 처리 불능 예외(500)도 실제 500 + `{ statusCode: 500, message: "Internal server error" }`(래퍼 아님).
- 따라서 FE 에러 분기는 HTTP 상태가 아니라 **body의 `status`/`code`/`errorCode`** 기준이어야 한다
  (성공 판정: `status === "success"`).

**금액은 전부 KRW 원 단위 정수(number)다.** `formatBytes` 계열 금지 — 통화 포맷터 사용.

---

## 1. `GET /costs/hw` — HW 비용 목록 + KPI + 위젯

조회 권한: 인증 사용자 전원.

### 쿼리 파라미터 (전부 옵션)

| 파라미터 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `periodStart` | `string` `yyyy-MM` | 당월 | 기간 시작 월 |
| `periodEnd` | `string` `yyyy-MM` | 당월 | 기간 끝 월(포함). `start > end` → HTTP 200 + body code 400 `COST_INVALID_QUERY_PERIOD` |
| `platform` | `'hw' \| 'cloud'` | — | 표시용 파생 필터(모집단은 platform으로 안 거름 — 결정 #11) |
| `owner` | `string` | — | 소유자명 정확 일치 |
| `deviceType` | `string` | — | 기기유형 code |
| `location` | `string` | — | inventory location 정확 일치 |
| `lifecycle` | `string` | — | lifecycle_status |
| `vendor` | `string` | — | inventory vendor 정확 일치 |
| `includeExcluded` | `boolean` | `false` | true면 제외 자산도 행 포함(회색 행). **KPI/위젯 집계에서는 항상 제외** |
| `depreciationMethod` | `'straight_line' \| 'declining_balance'` | — | **해석된**(폴백 적용 후) 방법 기준 필터 |
| `costStatus` | `'complete' \| 'incomplete'` | — | incomplete = `incompleteReasons` 비어있지 않음 |
| `priority` | `'high' \| 'medium' \| 'low'` | — | 자동 산정 우선순위 필터 |
| `keyword` | `string` | — | 자산명 부분 일치(대소문자 무시) |
| `sortBy` | `string` | `totalCost` | `totalCost·name·deviceType·owner·lifecycle·purchaseCost·acquisitionDate·expiryDate·bookValue·periodDepreciation·priority` |
| `sortOrder` | `'asc' \| 'desc'` | `desc` | |
| `limit` | `number` | 20 | 1~100 클램프 |
| `offset` | `number` | 0 | |

### 응답 `CostHwListResDto`

```ts
interface CostHwListResDto {
  items: CostHwItemDto[];       // offset/limit 적용 페이지
  total: number;                // 필터 적용 후 전체 행 수
  kpi: CostHwKpiDto;            // 필터 적용 모집단(페이지 아님) 기준, excluded 제외
  widgets: CostHwWidgetsDto;    // 동일 기준
  period: CostPeriodDto;
}

interface CostHwKpiDto {
  hwTotal: number;              // 선택 기간 HW 총비용(원)
  changeRate: number | null;    // 직전 동일 길이 기간 대비 %(소수 2자리). 직전=0이면 null → 'ㅡ' 또는 '신규'
  forecast: number;             // HW는 결정적 계산 → hwTotal과 동일 값
  expiryExposure: number;       // 오늘~90일 내 만료(경과분 포함) 자산 수
  incompleteCount: number;      // 미입력 큐 크기
}

interface CostHwWidgetsDto {
  expiryWindow: { within30: number; within60: number; within90: number };  // 누적(30⊆60⊆90), 경과 포함
  lifecycleCostMix: CostNamedAmountDto[];    // 금액 내림차순
  spendByOwner: CostNamedAmountDto[];        // 금액 내림차순 전체 — FE가 Top5 절단. 소유자 없음 name=null
  depreciationMethodMix: {                   // 도넛: 정액/정률/상각완료/상각불가 (자산 수)
    straightLine: number;                    // 수동 연액 오버라이드는 정액에 포함(§2.6 연액 정액 간주)
    decliningBalance: number;
    completed: number;
    notApplicable: number;
  };
  renewalCandidates: CostHwItemDto[];        // 만료일 보유 자산, 만료 임박순 Top5
}

interface CostNamedAmountDto { name: string | null; amount: number }

interface CostPeriodDto {
  start: string;          // 'yyyy-MM'
  end: string;
  previousStart: string;  // 비교 기간(직전 동일 길이)
  previousEnd: string;
  basisDate: string;      // ISO — '현재 상각 기준으로 산출된 값입니다' 표기용(§2.7 소급 재계산 정책)
}
```

### `CostHwItemDto` (목록 1행 · PATCH 응답 · renewalCandidates 공용)

```ts
interface CostHwItemDto {
  id: number;
  name: string;
  source: 'zabbix' | 'custom';
  deviceType: string | null;
  owner: string | null;
  location: string | null;
  vendor: string | null;
  lifecycleStatus: string | null;
  platform: 'hw' | 'cloud';                 // cloud_data.resource_id 존재 시에만 cloud
  excluded: boolean;                        // includeExcluded=true일 때만 true 행 등장(회색 행)
  linkedHostid: string | null;
  linkedHostName: string | null;
  expiryDate: string | null;                // 폴백 체인 해석: cost_data.expiry_date(수동, 최우선) → inventory date_hw_expiry. 'yyyy-MM-dd'
  expiryDateSource: 'manual' | 'inventory' | null;  // 만료일 없으면 null. 만료 지표·우선순위 만료 요소가 이 체인을 탄다

  // ---- 상각 파라미터(해석 결과 + 출처) ----
  purchaseCost: number | null;              // 정규화 취득가액(원). 없음/0/음수/파싱실패 → null
  rawPurchaseCost: string | null;           // 저장 원문("4,500만원" 등) — 파싱 실패분 수정 폼용
  acquisitionDate: string;                  // 'yyyy-MM-dd' (created_at 폴백 포함 — 항상 존재)
  acquisitionDateSource: 'manual' | 'inventory_purchase' | 'inventory_install' | 'created_at';
  acquisitionEstimated: boolean;            // true → '취득일 추정(등록일 기준)' 뱃지
  depreciationMethod: 'straight_line' | 'declining_balance';
  depreciationMethodSource: 'asset' | 'classification' | 'default';
  usefulLifeYears: number;                  // 2~15
  usefulLifeSource: 'asset' | 'classification' | 'default';
  depreciationSource: 'calculated' | 'manual';  // manual = depreciation_cost 오버라이드('수동' 뱃지 §2.6)
  depreciationStatus: 'active' | 'completed' | 'notStarted' | 'notApplicable';

  // ---- 선택 기간 금액(원) ----
  periodDepreciation: number;               // 기간 상각비 합
  accumulatedDepreciation: number | null;   // 기간 말 누계. null = 기준액 부재(취득가액 없이 수동 연액만 §2.6)
  bookValue: number | null;                 // 기간 말 장부가액. 위와 동일 null 규약
  periodMaintenanceCost: number;
  periodLeaseCost: number;
  periodTotalCost: number;                  // = 상각 + 유지보수 + 리스
  costChangeRate: number | null;            // 직전 기간 대비 %. null = 신규(직전 0)

  priority: {                               // §6.3 — M1 요소만으로 산정
    level: 'high' | 'medium' | 'low';       // ≥50 high, ≥25 medium
    score: number;
    basis: ('change' | 'expiry' | 'link' | 'missing_cost' | 'amount')[];
  };

  incompleteReasons: string[];              // 아래 §5 사유 코드. 비어있지 않으면 미입력 큐 대상
  warnings: string[];                       // 아래 §5 경고 코드
  currency: string;                         // 기본 'KRW'

  // ---- 인라인 편집 round-trip(자산에 저장된 값만, 기본값 미포함) ----
  // 🔴 CostInputDto는 EP4(목록/PATCH 응답)·EP5(드릴다운)·EP7(미입력 큐) 세 곳에 동일 shape로 실린다
  //    — FE는 같은 편집 컴포넌트를 재사용하면 되고, 어디서 열든 저장된 원본 입력값으로 초기화된다.
  costInput: {
    purchaseCost: number | null;
    acquisitionDate: string | null;         // cost_data.acquisition_date 원문
    expiryDate: string | null;              // cost_data.expiry_date 원문(수동값만 — inventory 폴백값 미포함)
    depreciationMethod: string | null;      // 자산별 오버라이드만(없으면 null = 기본값 따름)
    usefulLifeYears: number | null;
    maintenanceCost: number | null;
    maintenanceCostPeriod: 'monthly' | 'yearly' | 'onetime' | null;
    leaseCost: number | null;
    leaseCostPeriod: 'monthly' | 'yearly' | 'onetime' | null;
    depreciationCost: number | null;        // 수동 연 상각액
    residualValue: number | null;           // 수동 잔존가액(상각 하한)
    currency: string | null;
  };
}
```

---

## 2. `GET /costs/hw/incomplete` — 비용 정보 미입력 자산 큐

조회 권한: 인증 사용자 전원. 쿼리 파라미터는 §1과 동일 세트를 받되 의미 있는 것은
`limit`·`offset`·`deviceType`·`owner`·`keyword`·`lifecycle` 등 필터류(기간·정렬 파라미터는 무시해도 무방).
정렬은 자산명 오름차순 고정. **모집단은 excluded=false만**(제외 자산은 큐에 안 나옴).

### 응답 `PaginationResponseDto<CostIncompleteItemDto>`

```ts
interface CostIncompleteListRes {
  items: CostIncompleteItemDto[];
  total: number;
}

interface CostIncompleteItemDto {
  id: number;
  name: string;
  source: 'zabbix' | 'custom';
  deviceType: string | null;
  owner: string | null;
  reasons: string[];                 // §5 사유 코드
  rawPurchaseCost: string | null;    // 저장 원문 — 수정 폼 초기값
  rawAcquisitionDate: string | null; // cost_data.acquisition_date 저장 원문(무효값 포함)
  warnings: string[];                // 🆕(2026-07-31 D-3) §5 경고 코드 — EP4의 warnings와 동일 어휘.
                                     //   큐 모달에서도 무효 저장 원문 정정/제거 UI(invalidStoredFields)가 성립
  costInput: CostInputDto;           // 편집 모달 초기값 — §1의 costInput과 완전 동일 shape(항상 non-null)
}
```

---

## 3. `GET /costs/hw/{assetId}/depreciation` — 상각 스케줄 드릴다운

조회 권한: 인증 사용자 전원. 미존재 자산 → HTTP 200 + body code 400 `ASSET_NOT_FOUND`.
상태 기준월은 **당월**(기간 파라미터 없음 — 스케줄은 전 기간이 통째로 온다).

### 응답 `DepreciationDetailResDto`

```ts
interface DepreciationDetailResDto {
  assetId: number;
  name: string;
  deviceType: string | null;
  params: {
    purchaseCost: number | null;
    rawPurchaseCost: string | null;
    acquisitionDate: string;             // 'yyyy-MM-dd'
    acquisitionDateSource: 'manual' | 'inventory_purchase' | 'inventory_install' | 'created_at';
    acquisitionEstimated: boolean;
    depreciationMethod: 'straight_line' | 'declining_balance';
    depreciationMethodSource: 'asset' | 'classification' | 'default';
    usefulLifeYears: number;
    usefulLifeSource: 'asset' | 'classification' | 'default';
    residualValue: number;               // 상각 하한 — 수동값 또는 기본 잔존가액 1000
    residualValueSource: 'manual' | 'default';
    decliningRate: number | null;        // 정률법일 때만(예: 0.451). DB 상각률표 값
    depreciationSource: 'calculated' | 'manual';
    currency: string;
  };
  depreciationStatus: 'active' | 'completed' | 'notStarted' | 'notApplicable';
  incompleteReasons: string[];
  warnings: string[];
  currentMonthDepreciation: number | null;  // 당월 상각비. 상각 불가면 null. 수동 연액만이면 값/12
  years: DepreciationYearRowDto[];          // 역년(1~12월) 묶음 표. 상각 불가면 []
  months: DepreciationMonthRowDto[];        // 월 시퀀스(차트용). 상각 불가·수동연액만이면 []
  costInput: CostInputDto;                  // 🆕 [비용 정보 수정] 모달 초기값 — §1의 costInput과 완전 동일 shape(항상 non-null)
}

interface DepreciationYearRowDto {
  year: number;                    // 역년
  openingBookValue: number;        // 기초 장부가액
  annualDepreciation: number;      // 해당 역년 상각비 합
  accumulatedDepreciation: number; // 역년 말 누계
  closingBookValue: number;        // 역년 말 장부가액
  monthCount: number;              // 해당 역년의 상각 월수
  isPartialYear: boolean;          // 취득연도·최종연도 부분 연도
}

interface DepreciationMonthRowDto {
  yearMonth: string;               // 'yyyy-MM'
  depreciation: number;
  accumulated: number;
  bookValue: number;
  fiscalYearIndex: number;         // 취득월 기준 연차(1차·2차… — 역년 아님, §2.3). 정률 연차 전환 표시용
}
```

---

## 4. `PATCH /costs/hw/{assetId}` — 비용 정보 인라인 편집

**권한: 관리자 전용**(`AdminAccessChecker` — 비관리자는 HTTP 200 + body `code:403`).
저장은 `Asset.updateUserOwned` 경유(사용자 소유 영역 — 동기화가 덮지 않음) + `asset_activity`에
`{field:"costData", before, after}` diff 기록.

쿼리(옵션): `periodStart`·`periodEnd`(`yyyy-MM`) — 응답 행 재계산의 기간 컨텍스트. 기본 당월.
**목록 화면의 현재 기간을 그대로 넘겨야 행 교체가 자연스럽다.**

### 요청 body `UpdateCostDataReqDto` — 부분 수정(보낸 필드만 변경)

```ts
interface UpdateCostDataReqDto {
  purchaseCost?: number;          // ≥0 (음수 → COST_INVALID_AMOUNT). 소수는 원 단위 반올림 저장
  maintenanceCost?: number;       // ≥0
  leaseCost?: number;             // ≥0
  depreciationCost?: number;      // 수동 연 상각액(오버라이드). ≥0
  residualValue?: number;         // 수동 잔존가액(상각 하한). ≥0
  depreciationMethod?: 'straight_line' | 'declining_balance';
  usefulLifeYears?: number;       // 2~15만 허용(상각률표 범위 — 밖이면 COST_INVALID_USEFUL_LIFE)
  acquisitionDate?: string;       // yyyy-M-d·yyyy.M.d·yyyy/M/d(월·일 1~2자리, 구분자 주변 공백 허용)·yyyyMMdd·yyyy-MM, ISO 저장
  expiryDate?: string;            // 🆕 수동 만료일(취득일과 동일 포맷). inventory date_hw_expiry보다 우선 — 만료 지표 입력 경로
  maintenanceCostPeriod?: 'monthly' | 'yearly' | 'onetime';
  leaseCostPeriod?: 'monthly' | 'yearly' | 'onetime';
  currency?: string;              // 최대 8자
  clearFields?: string[];         // 값 제거 — 위 필드명(camelCase) 그대로. 예: ['depreciationCost']
}
```

- 🔴 **body에 위 목록 밖의 키를 실으면 `COST_UNKNOWN_FIELD`**(HTTP 200 + body code 400 — §0) (조용히 버리지 않는다 — 화이트리스트 검증 §3.1).
- "계산값 사용" 토글 OFF→ON(수동 해제)은 `clearFields: ['depreciationCost']` (필요 시 `'residualValue'` 추가).

### 응답: `CostHwItemDto` (§1과 동일 shape — 저장 직후 재계산된 그 행)

### 에러

전부 **HTTP 200** + body `{ status:"error", code:400, errorCode:"<코드>", message:"<코드>" }` (§0 참조):

| errorCode | 조건 |
|---|---|
| `ASSET_NOT_FOUND` | 자산 없음 |
| `COST_UNKNOWN_FIELD` | 화이트리스트 밖 body 키 / 미지 clearFields |
| `COST_INVALID_DEPRECIATION_METHOD` | 방법 enum 밖 |
| `COST_INVALID_USEFUL_LIFE` | 내용연수 2~15 밖 |
| `COST_INVALID_AMOUNT` | 금액 음수, currency 형식 위반 |
| `COST_INVALID_DATE` | 취득일 파싱 불가 |
| `COST_INVALID_COST_PERIOD` | 주기 enum 밖 |
| (body `code:403`, errorCode 없음) | 비관리자 — message "Access Denied" |

---

## 4-2. 비용 정보 일괄 업로드 (2026-08-03 비동기 job 계약으로 전환)

**권한: 아래 3개 EP 모두 관리자 전용**(비관리자 → HTTP 200 + body code 403). 클래스 공통으로 `x-visitor-id` 헤더 필수.

### 4-2a. `GET /costs/hw/template` — 업로드 템플릿 다운로드

🔴 **이 EP만 `ApiResult` 래퍼가 아니다** — raw **CSV 파일**(HTTP 200, `Content-Type: text/csv; charset=UTF-8`,
`Content-Disposition: attachment; filename="cost-hw-template.csv"`). FE는 axios **blob 다운로드**로 처리해야
한다(인증 쿠키·`x-visitor-id`가 필요하므로 `window.open` 불가). 단, 권한 거부 시에는 관례대로 JSON
(`{code:403}`)이 오므로 blob 응답의 타입 분기에 주의.

- 형식: **UTF-8 + BOM, RFC4180**(콤마·따옴표 포함 값은 `"..."` 인용, 줄바꿈 CRLF). 코드베이스에 선행
  내보내기 관례가 없어 이 형식을 M1 관례로 수립.
- 내용: **현재 자산(excluded 제외, id 오름차순)을 미리 채운다.** 사용자는 금액만 적어 올리면 된다.
- 헤더(1행, 고정 순서):
  ```
  assetId,name,deviceType,purchaseCost,acquisitionDate,expiryDate,depreciationMethod,usefulLifeYears,
  maintenanceCost,maintenanceCostPeriod,leaseCost,leaseCostPeriod,depreciationCost,residualValue,currency
  ```
  - `assetId` = 키(수정 금지) · `name`/`deviceType` = 읽기 참고용(업로드 시 무시)
  - 비용 컬럼은 저장값을 프리필하되 🔴 **모든 컬럼에서 "재업로드하면 통과할 값만" 싣는다**(2026-07-31 D-1):
    금액 파싱 불가·음수, 날짜 파싱 불가("2024년 3월"), enum 밖 방법/주기, 2~15 밖 연수, 공백/8자 초과
    통화는 전부 **빈칸**. 날짜는 ISO(yyyy-MM-dd)로 정규화해 싣는다.
  - **기본 계약: 템플릿 출력을 그대로 다시 업로드하면 전건 성공한다**(빈칸=미변경). 무효 저장 원문 자체는
    미입력 큐(rawPurchaseCost 등)와 `warnings`로 확인·정정한다.

### 4-2b. `POST /costs/hw/bulk-upload` — 비동기 작업 접수

요청: `multipart/form-data`, 파트 이름 **`file`**(CSV 파일).

- 파일은 HTTP 요청 종료 전에 `cost_bulk_upload_job.file_content`에 영속화하고, BE는 행 처리를 기다리지 않고
  **즉시 접수 응답**을 반환한다. axios 60초 timeout 이후에도 저장만 진행되는 불일치를 제거한 계약이다.
- 동일 사용자(`TokenUserInfo.id` 우선)는 `queued|running` 작업을 **1개만** 가질 수 있다. 중복 접수는 거부한다.
- `consumes` 제한을 두지 않는다. multipart가 아닌 요청·`file` 파트 누락·빈 파일은 모두
  HTTP 200 + body code 400 `COST_UPLOAD_EMPTY`로 수렴한다(500/415 아님).
- **파일 크기 상한 10MB**(`spring.servlet.multipart.max-file-size`).
  🔴 `max-request-size`는 **11MB**로 1MB 여유를 둔다(2026-08-03 N-2) — 이 값은 파일뿐 아니라
  multipart boundary·part 헤더까지 포함해서, 두 값을 같게 두면 **정확히 10MB인 파일이 거부된다**.
  즉 계약이 보장하는 것은 **"파일 10MB"** 이고 요청 총량은 그보다 조금 크게 허용된다.
  초과는 `MaxUploadSizeExceededException` → **HTTP 200 + body code 400 `COST_UPLOAD_FILE_TOO_LARGE`**로
  정규화된다(전용 매핑이 없으면 catch-all 500이 되어 이 API의 에러 계약과 어긋난다).
  파일 전체를 메모리에 올린 뒤 `bytea`로 영속화하는 구조라 상한을 크게 잡지 않는다 —
  더 큰 입력이 필요하면 저장 구조부터 재검토 대상이다.

**접수 응답** (`ApiResult` 2겹 언랩 후 payload):

```ts
interface CostBulkUploadAcceptedDto {
  jobId: string;                   // UUID
  status: 'queued';                // ApiResult 최상위 status와 다른, payload의 작업 상태
  expiresAt: string;               // ISO. 최초 접수 기준 24h; 완료 시점에 다시 24h로 연장됨
}
```

> ⚠️ raw 응답에는 `ApiResult.status: 'success'`와 `data.status: 'queued'`가 함께 있다.
> FE는 2겹 언랩 후 payload의 `status`를 작업 상태로 사용한다.

**접수 단계 에러** (HTTP 200 + body code 400):

| errorCode | 조건 |
|---|---|
| `COST_UPLOAD_EMPTY` | non-multipart·`file` 누락·빈 파일 |
| `COST_UPLOAD_ALREADY_RUNNING` | 같은 사용자의 작업이 이미 `queued|running` |
| `COST_UPLOAD_QUEUE_FULL` | 비용 업로드 전용 bounded executor가 포화됨 |
| `COST_UPLOAD_FILE_TOO_LARGE` | 파일이 **10MB**를 넘음(또는 요청 총량이 11MB 초과) (2026-08-03 F-6·N-2) |

### 4-2d. `GET /costs/hw/bulk-upload/current` — 내 최근 작업 복구 (2026-08-03 신설, Claude)

요청 사용자의 **만료되지 않은 가장 최근 작업 1건**을 반환한다. **상태로 거르지 않는다.**

```ts
// 언랩 후 payload — 작업이 없으면 nullish(undefined)
type CostBulkUploadCurrentRes = CostBulkUploadJobDto | null | undefined;
```

- **작업이 없는 것은 정상**이라 에러가 아니다(화면이 매번 실패를 처리하지 않게).
- 🔴 **raw 응답에는 `data` 필드가 아예 없다**(2026-08-03 F-3 정정). 서비스는 `null`을 반환하지만
  `ApiResult`가 클래스 수준 `@JsonInclude(NON_NULL)`이라 직렬화에서 빠져 `{status,code}`만 나간다.
  따라서 **`data === null`로 판정하면 안 된다** — 언랩 후 소비자에게는 `undefined`로 도착한다.
  FE는 `isSuccess && data == null`(nullish)로 본다.
- 권한은 4-2b·c와 동일(관리자).

**왜 상태로 안 거르나 (설계 근거)**

`queued|running`만 찾으면 **새로고침하는 사이에 완료된 작업의 리포트를 영영 못 보여준다.**
진행 중이면 진행 상태를, 그 사이 끝났으면 완료 리포트를 그대로 이어서 보여주기 위해 상태 무관으로 둔다.

🔴 **이 EP가 없으면 사용자가 갇힌다.** jobId는 화면 state에만 있어 새로고침·페이지 이동에 사라지는데,
그 상태에서 재업로드하면 `COST_UPLOAD_ALREADY_RUNNING`만 나오고 **그 작업에 접근할 방법이 없다**
(접수 거부 응답에는 jobId가 실리지 않는다). FE는 localStorage 보관 + 이 EP 두 겹으로 복구한다
— 보관값은 즉시 복구용, 이 EP는 다른 브라우저·기기까지 커버하는 근본 경로다.

> ℹ️ 경로 우선순위: `/current`는 `{jobId}`(UUID)보다 **먼저 선언**한다. 'current'는 UUID로 변환되지 않아
> 변수 경로에 먼저 잡히면 400이 된다.

### 4-2c. `GET /costs/hw/bulk-upload/{jobId}` — 진행률·완료 리포트 조회

요청 사용자가 접수한 작업만 조회한다(다른 사용자의 UUID도 `COST_UPLOAD_JOB_NOT_FOUND`). FE는 접수 뒤 이 EP를
폴링하여 완료를 보고한다. 기존 알림벨(`/event/bells`)은 Zabbix 장애 전용이라 이 작업을 섞지 않는다.

```ts
interface CostBulkUploadJobDto {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  filename?: string;
  total: number;                   // CSV 검증/파싱 전에는 0
  processed: number;
  successCount: number;
  failureCount: number;
  results?: {
    rowNumber: number;             // 파일의 물리 줄 번호(1-base)
    assetId: number | null;
    assetName: string | null;
    success: boolean;
    errorCode: string | null;
  }[];                             // terminal(succeeded|failed)일 때만 존재; failed면 부분 결과일 수 있음
  errorCode?: string;              // 작업 전체 실패 사유. succeeded/진행 중이면 생략
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;               // 완료 시각부터 24h 보존
}
```

**작업 상태·복구 정책:**

- `queued → running → succeeded|failed` 단방향. 행 실패가 섞여도 파일 처리가 끝났으면 `succeeded`이며,
  행별 실패는 `failureCount/results[].errorCode`로 표현한다.
- **검증은 인라인 편집(EP6)과 단일 경로** — 금액 정규화(`"45,000,000원"` 허용, 한글 단위 거부)·enum·
  2~15 범위·날짜 포맷 판정이 PATCH와 동일하다.
- 날짜는 `yyyy-M-d`·`yyyy.M.d`·`yyyy/M/d`(월·일 1~2자리, 구분자 주변 공백 허용)와 기존
  `yyyyMMdd`·`yyyy-MM`을 허용한다. 혼합 구분자(`2024-3/1`)와 달력 위반은 거부한다.
- **빈 칸 = 미변경**(PATCH의 null과 동일). 값 제거는 CSV로 불가 — 인라인 편집의 `clearFields` 사용.
- 🔴 **트랜잭션 = 행 단위 커밋(부분 성공 허용)**: 행마다 독립 트랜잭션으로 저장한다. 실패 행이 있어도
  성공 행은 이미 저장돼 있다(전건 롤백 아님). 결과 리포트로 행별 재시도를 안내할 것.
- 미존재 `assetId`·excluded 자산 행은 **실패로 리포트**(조용히 건너뛰지 않음). 완전 빈 행만 무시.
- 각 성공 행은 EP6과 동일하게 `Asset.updateUserOwned` 경유 + `asset_activity` 이력 기록.
- 서버 재시작 시 아직 `queued`인 작업은 재개한다. `running`이던 작업은 앞선 성공 행의 중복 적용을 막기 위해
  재실행하지 않고 `failed + COST_UPLOAD_JOB_INTERRUPTED`로 종결한다.
- 🔴 **단, 중단 처리 대상은 "lease가 끊긴" running뿐이다**(2026-08-03 F-2). worker는 행마다
  `heartbeat_at`을 갱신하고, 기동 sweep은 그 신호가 **5분** 넘게 끊긴 작업만 고른다.
  (전역 `running`을 쓸어담으면 롤링 배포에서 새 인스턴스가 **정상 처리 중인 다른 인스턴스의 작업**을 죽인다.)
- 🔴 **terminal 전이는 기대 상태가 `running`일 때만 성공한다**(조건부 UPDATE). 선점에 실패하면 worker는
  결과를 쓰지 않고 물러난다 — 이미 종결된 작업을 덮어 `failed → succeeded`로 되돌리는 역전을 막는다.
- 🔴 **저장 순서: 결과 → 상태**(2026-08-03 재검수 F-2). 결과 필드를 먼저 쓰고 마지막에 상태를 전이한다.
  반대 순서면 두 쓰기 사이에 조회한 사용자가 **"terminal인데 결과가 빈"** 상태를 보고, 두 번째 쓰기가
  실패하면 그대로 굳는다. 이 순서에서 중간 상태는 `running` + 결과 채워짐이라
  "results는 terminal일 때만" 계약과 어긋나지 않는다.
- 🔴 **fencing**: worker의 진행률 갱신은 `status='running'` 조건부 UPDATE다. **0행이면 lease를 잃은 것**이므로
  worker가 즉시 중단한다. 이게 없으면 job은 `failed`인데 그 worker가 남은 행을 계속 커밋한다.
- 🔴 기동 sweep의 stale 종결도 **조건(상태+heartbeat)을 담은 단일 UPDATE**다. SELECT 후 detached save는
  그 사이 살아 있던 worker가 쓴 최신 상태를 뒤늦게 덮어쓴다.
- queued 재개는 DB의 조건부 상태 갱신으로 원자적으로 claim하므로 다중 인스턴스가 같은 작업을 중복 실행하지 않는다.
- 진행 중에는 고정 크기 카운터만 갱신하고 `results` 전체는 terminal 시 한 번 저장한다(대용량에서 JSONB 누적 재기록 방지).
- terminal 결과는 완료 후 24시간 조회 가능하다. 만료 뒤 7일 동안은 `COST_UPLOAD_JOB_EXPIRED`로 구분하고,
  이후 물리 정리되면 `COST_UPLOAD_JOB_NOT_FOUND`가 된다.

**작업/행 에러 어휘:**

| errorCode | 수준 | 조건 |
|---|---|---|
| `COST_UPLOAD_JOB_NOT_FOUND` | 조회 | 작업 없음 또는 다른 사용자 작업 |
| `COST_UPLOAD_JOB_EXPIRED` | 조회 | 완료 결과 24h 보존 기간 경과 |
| `COST_UPLOAD_INVALID_HEADER` | 작업 전체(`failed`) | `assetId` 컬럼 누락 또는 템플릿 밖의 알 수 없는 컬럼 |
| `COST_UPLOAD_EMPTY` | 작업 전체(`failed`) | 파일에 데이터 행이 없음 |
| `COST_UPLOAD_JOB_FAILED` | 작업 전체(`failed`) | 처리 중 예기치 않은 예외 |
| `COST_UPLOAD_JOB_INTERRUPTED` | 작업 전체(`failed`) | 서버 재시작으로 running 작업 중단 |
| `COST_UPLOAD_QUEUE_FULL` | 작업 전체(`failed`) | 서버 재시작 복구 중 전용 executor 포화로 queued 작업 재실행 불가 |
| `COST_UPLOAD_INVALID_ROW` | 행 | assetId 셀이 비었거나 숫자가 아님 |
| `ASSET_NOT_FOUND` | 행 | 미존재 assetId |
| `COST_ASSET_EXCLUDED` | 행 | 관리대상 제외 자산(복원 후 재업로드 안내) |
| `COST_INVALID_AMOUNT`·`COST_INVALID_DATE`·`COST_INVALID_DEPRECIATION_METHOD`·`COST_INVALID_USEFUL_LIFE`·`COST_INVALID_COST_PERIOD` | 행 | EP6과 동일 검증 어휘 |

---

## 5. 사유/경고 코드 어휘 (i18n 키로 매핑할 것)

**incompleteReasons / reasons** (미입력 큐 사유 — §8.4):

| 코드 | 의미 | 상각 불가? |
|---|---|---|
| `purchase_cost_missing` | 취득가액 없음 | ✅ |
| `purchase_cost_invalid` | 취득가액 파싱 실패(한글 단위 등) | ✅ |
| `purchase_cost_zero` | 취득가액 0 | ✅ |
| `purchase_cost_negative` | 취득가액 음수 | ✅ |
| `acquisition_date_missing` | 취득일 후보 전무 → 등록일 추정 | ❌(계산은 함, 추정 표기) |
| `acquisition_date_invalid` | 취득일 후보가 있으나 전부 파싱 실패 → 등록일 추정 | ❌(계산은 함) |
| `depreciation_rate_missing` | 정률법인데 상각률표에 해당 연수 없음(방어) | ✅ |

**warnings** (계산은 진행, 데이터 품질 고지):

| 코드 | 의미 |
|---|---|
| `maintenance_period_assumed_yearly` / `lease_period_assumed_yearly` | 주기 미지정 → 연액 가정(§3.1 '주기 미지정 → 연액 가정' 안내) |
| `maintenance_period_invalid_assumed_yearly` / `lease_period_invalid_assumed_yearly` | 주기 값이 enum 밖 → 연액 가정 |
| `maintenance_cost_invalid` / `lease_cost_invalid` | 금액 파싱 실패 → 해당 항목 0 처리 |
| `maintenance_onetime_no_acquisition_date` / `lease_onetime_no_acquisition_date` | onetime 배분 불가 → 0 |
| `manual_exceeds_purchase` | 수동 연액 페이스가 과해 **내용연수 전에** 취득가액 소진 → 조기 종료(§2.6). 마지막 달 절삭·반올림 잔차는 정상 종료라 이 경고가 붙지 않는다(2026-07-30 오탐 정정) |
| `purchase_not_above_floor` | 취득가액 ≤ 하한 — 상각할 것 없음 |
| `depreciation_method_invalid_ignored` / `useful_life_invalid_ignored` / `residual_value_invalid_ignored` / `manual_depreciation_invalid_ignored` | 저장된 오버라이드 값이 무효 → 무시하고 폴백 |
| `expiry_date_invalid_ignored` | **수동**(cost_data.expiry_date) 만료일이 파싱 불가 — clearFields로 제거/정정 가능한 값에만 경고한다. **inventory(date_hw_expiry) 무효는 경고 없이** 만료일 없음 처리(동기화 소유라 이 화면에서 지울 수 없음 — 2026-07-31 D-2. FE는 이 경고를 clearFields 후보로 안전하게 매핑 가능) |

---

## 6. 기기분류 상각 기본값 (기존 CRUD 확장 + 신규 EP)

### 6.1 `DeviceClassificationDto`에 필드 2개 추가 (GET/POST/PUT/reorder 응답 공통, **추가만** — 기존 필드 불변)

```ts
interface DeviceClassificationDto {
  // ...기존 필드(id·code·name·nameEn·color·sortOrder·isSystem·active·updatedAt) 그대로...
  defaultDepreciationMethod: string | null;  // 'straight_line' | 'declining_balance'. V17 이후 기본 'straight_line'
  defaultUsefulLifeYears: number | null;     // 2~15. V17 이후 기본 5
}
```

### 6.2 `POST /settings/device-classifications` · `PUT /settings/device-classifications/{id}` 요청에 옵션 필드 추가

```ts
{ name: string;                                                       // PUT에서도 @NotBlank 필수
  defaultDepreciationMethod?: 'straight_line' | 'declining_balance';  // 상각 필드만 PUT 미지정=미변경
  defaultUsefulLifeYears?: number }                                   // 상각 필드만 PUT 미지정=미변경, 2~15 밖 → 오류
```
- 위반 시 `COST_INVALID_DEPRECIATION_METHOD` / `COST_INVALID_USEFUL_LIFE` (HTTP 200 + body code 400 — §0).
- **is_system 행도 상각 기본값은 수정 허용**(active 보호 규칙과 별개 — 운영 조정이 정상 경로).
- POST에서 미지정 시 `straight_line`/5로 저장(시드와 동일).

### 6.3 신규 `GET /settings/device-classifications/{id}/cost-impact` — 소급 경고용 (관리자 전용)

```ts
interface DeviceClassificationCostImpactResDto {
  code: string;
  affectedAssets: number;  // 이 유형이면서(excluded 제외) 자산별 오버라이드가 불완전해 기본값을 실제로 쓰는 자산 수
  totalAssets: number;     // 이 유형의 전체 자산 수(excluded 제외)
}
```
FE는 기본값 저장 전에 이 값을 조회해
`이 변경은 과거 기간의 비용 수치에도 소급 반영됩니다 · 영향받는 자산 N건` 경고를 띄운다(§2.7·§8.8).
미존재 id → HTTP 200 + body code 400 `DEVICE_CLASSIFICATION_NOT_FOUND`. 비관리자 → HTTP 200 + body code 403.

---

## 7. FE 구현 주의사항

1. **소급 재계산 안내(§2.7)**: 모든 수치는 "지금 설정으로 다시 계산한 값". 기간 헤더 옆에
   `현재 상각 기준으로 산출된 값입니다` + `period.basisDate` 표기. 파라미터 편집 UI(자산 폼·기기분류)에 소급 경고.
2. **`changeRate`/`costChangeRate` null = '신규'** (직전 기간 0). 0과 null을 구분해 렌더할 것.
3. **`accumulatedDepreciation`·`bookValue` null** = 취득가액 없이 수동 연액만 있는 자산(§2.6) — 'ㅡ' 표시.
4. **`excluded: true` 행**은 `includeExcluded=true`일 때만 온다. 회색 행 + KPI에 포함 안 됨 안내.
5. **인라인 편집 폼 초기값은 `costInput`**(자산별 저장값만)을 쓰고, 화면 표시는 해석 필드
   (`depreciationMethod` 등 + `*Source` 뱃지)를 쓴다 — 비운 필드는 기본값을 따른다는 UX가 성립한다.
   `costInput`은 **EP4·EP5·EP7 세 응답에 동일 shape**로 실린다(2026-07-30 FE 피드백 반영) —
   해석값(`params`)에서 역복원하는 우회는 쓰지 말 것(유지보수·리스·수동 연액이 복원되지 않는다).
6. **PATCH에 목록의 `periodStart`/`periodEnd`를 그대로 전달**해야 응답 행이 현재 화면 기간 기준으로 온다.
7. **미입력 큐가 데이터 정정 경로다(결정 #10)** — `rawPurchaseCost`·`rawAcquisitionDate`를 폼 초기값/문제 표시에 사용.
8. `expiryWindow`는 **누적 카운트**(within30 ⊆ within60 ⊆ within90)이며 이미 경과한 만료도 포함된다.
9. `spendByOwner`는 전체가 내림차순으로 오므로 FE가 Top5 + 기타로 절단. `name: null` = 소유자 미지정.
10. 금액 포맷: KRW 통화기호+천단위. **formatBytes 계열 금지**([[fe-traffic-bps-not-bytes]] 부류 사고 방지).
11. 탭·필터·기간은 URL query로([[fe-page-remount-on-navigate]]), 3단 경로 드릴다운은 `replacePathBreadcrumb` 필수.
12. 기존 자산 9EP(`/assets/**`)는 **변경 없음**. 자산 편집 모달의 costData 자유 맵 경로도 그대로다 —
    단 비용 필드는 가급적 신규 PATCH(`/costs/hw/{id}`)로 보내야 검증·정규화·이력의 이득을 받는다(§8.9 폼 개선 시 반영).
13. **만료일 입력은 `expiryDate`(PATCH/업로드)로** — inventory `date_hw_expiry`는 zabbix 동기화 소유라
    직접 쓰면 다음 동기화가 덮는다. 수동값이 항상 inventory보다 우선(`expiryDateSource` 뱃지로 구분).
14. **일괄 업로드 동선(§4-2)**: 템플릿 다운로드는 blob 방식(인증 쿠키+`x-visitor-id` 필요, `window.open` 불가).
    업로드 결과는 부분 성공 — `results`의 실패 행(rowNumber·errorCode)을 표로 보여주고 재시도를 안내할 것.

---

## 8. 구현 노트(설계 대비 확정 사항)

- **정률법 종료(2026-07-30 정정)**: `min(내용연수 도달, 잔액 ≤ 하한)` 중 먼저 오는 쪽. 상각률표는 내용연수
  경과 시 잔존 ~5%가 남는 표이므로, 잔존가액 0 원칙(결정 #3)에 따라 **최종 연차에 기초 미상각잔액 − 하한을
  전액 월할 정산**한다 — 5년 정률 자산은 정확히 60개월에 종료되고 최종 연차 월 상각비가 통상치보다 커진다(정상).
  FE는 최종 연차 상각비 급증을 버그로 오인하지 말 것(드릴다운 연차 표에서 그대로 보인다).
- **HW forecast = hwTotal**: 월할 결정적 계산이라 기간 전체 계산값과 동일(§6.1 문언 그대로).
- **KPI/위젯 집계 기준**: "필터 적용 후" 모집단(페이지 아님), excluded 상시 제외.
- **onetime 주기 배분**: 내용연수×12개월로 취득월부터 균등 배분. 취득일은 created_at 폴백까지 있어 사실상 항상 배분 가능.
- 상각률표는 DB `depreciation_rate`(V17 시드 2~15년). 코드 상수 없음.

---

## 5-D. `GET /costs/dashboard` — 자산 비용 대시보드 (M2, 2026-08-04 신설)

조회 권한: 인증 사용자 전원. 쿼리 파라미터는 **§1(`GET /costs/hw`)과 동일**한 필터를 받는다
(`periodStart`·`periodEnd`·`owner`·`deviceType`·`location`·`lifecycle`·`vendor`·`costStatus` 등).
모집단·필터·계산은 **EP4와 같은 경로**를 쓴다 — 두 화면의 숫자가 갈리면 안 되기 때문이다.

> 🔴 **화면 언어는 지출 축이다.** 이 기능의 본질은 "관리 중인 장비들의 비용을 추적·관리"이므로
> 장부가액·상각 완료 같은 회계 개념을 전면에 두지 않는다. 설계 §8.3 · `plan_cost-dashboard.md` §2.

```ts
interface CostDashboardResDto {
  kpi: {
    totalPurchaseCost: number;      // 총 취득원가
    periodTotalCost: number;        // 🔴 상각 + 유지보수 + 리스의 **총합**. 상각비가 아니다
    periodDepreciation: number;     //   그중 상각비(비현금)
    periodRecurring: number;        //   그중 유지보수+리스(현금성)
    forecast12mTotal: number;       // 향후 12개월 예상 총비용
    annualRecurringCost: number;    // 연간 유지비(유지보수+리스)
    incompleteCount: number;
    totalAssetCount: number;        // 집계 모집단(필터 후·excluded 제외)
    bookValueIncludedCount: number; // 장부가액 집계 포함 건수
    bookValueExcludedCount: number; //   〃 제외 건수(기준액 부재)
    bookValueTotal: number;         // 기준월 말 장부가액 합(제외분 미포함)
    expiryKnownCount: number;
    expiryUnknownCount: number;
    previousTotalCost: number;      // 직전 동일 길이 기간 총비용
    changeAmount: number;           // = periodTotalCost − previousTotalCost (음수면 감소)
    changeRate: number | null;      // 🔴 null = 직전 0(= '신규'). 0%가 아니다
  };
  widgets: {
    monthlyHistory: MonthlyAmount[];   // 기준월 **포함** 직전 12개월 실적
    monthlyForecast: MonthlyAmount[];  // 기준월 **다음 달부터** 12개월 예상
    // MonthlyAmount = { month: 'yyyy-MM'; depreciation; maintenance; lease; total }
    // 🔴 history 마지막 = 기준월 = KPI periodTotalCost. forecast 첫 달과 빈틈·중복이 없어야 한다
    //    (한 축에 그리므로 어긋나면 시간이 거짓말한다)
    costComposition: { depreciation: number; maintenance: number; lease: number };
    spendByDeviceType: { name: string | null; amount: number }[];
    spendByOwner:      { name: string | null; amount: number }[];  // name=null은 미지정
    expiryStatus: { expired: number; within30: number; within60: number; within90: number };
    increaseImpact: {               // 직전 대비 증가액 Top5. 🔴 증가분만(감소는 제외)
      assetId: number; name: string; deviceType: string | null; owner: string | null;
      currentCost: number; previousCost: number; increase: number;   // = max(0, current − previous)
    }[];
  };
  reviewCandidates: {
    assetId: number; name: string; deviceType: string | null; owner: string | null;
    reasonTags: string[];          // missing_cost | depreciated_but_recurring | expired |
                                   // expiring_soon | cost_surge | owner_missing | host_unlinked
    periodTotalCost: number;
    annualRecurringCost: number;
    expiryDate: string | null;     // yyyy-MM-dd
    depreciationStatus: string;
    changeRate: number | null;     // 직전 대비 %. null = 신규
    linkedHostName: string | null; // 근거 탐색 진입점(Host Detail)
    priorityLevel: string | null;  // high | medium | low
    priorityScore: number;
  }[];
  filterOptions: {                 // 필터 드롭다운 후보값 — 🔴 **필터 적용 전** 모집단 기준
    owners: string[];              //   (적용 후로 뽑으면 하나를 고른 순간 후보가 그 하나로 줄어
    locations: string[];           //    다른 값으로 갈아탈 수 없다)
    vendors: string[];             //   기기분류·생애주기·비용상태는 고정 목록이라 없다
  };
  period: CostPeriodDto;           // §1과 동일(basisDate 포함)
}
```

### 🔴 판정 규칙 (설계검토 반영 — 여기를 어기면 화면이 거짓을 말한다)

| 항목 | 규칙 | 어겼을 때 |
|---|---|---|
| **`periodTotalCost`** | 상각+유지보수+리스 **총합**(M1 `hwTotal`과 동일 정의) | "상각비"로 부르면 유지보수·리스가 섞인 값을 상각비라 표시하게 된다 |
| **상각 완료** | `depreciationStatus === 'completed'` | "장부가 0"으로 잡으면 **기본 잔존가액 0원**이 남아 완료 자산이 **0건**이 된다 |
| **장부가액** | 기간 말 값 → 화면 표기는 **"기준월 말 장부가액"** | 기간 가변 화면에서 "현재"라고 하면 거짓 |
| **`bookValue=null`** | 장부가액 지표**에서만** 제외 + 건수 노출 | 0으로 세면 "가치 없음"으로 왜곡. 상각비·유지비까지 빼면 그 자산이 통째로 사라진다 |
| **만료 구간** | `expired`(< today)와 예정(`today ≤ d ≤ today+N`)을 **분리** | M1 `expiryWindow`는 경과분 포함 — 그대로 "임박"으로 쓰면 오래전 만료 자산이 섞인다 |
| **검토 후보** | 자산당 **1행 + 복수 `reasonTags`** | 위젯을 쪼개면 같은 자산이 여러 곳에 반복된다 |
| **`filterOptions`** | 필터 **적용 전** 모집단에서 추출 | 적용 후로 뽑으면 `owner=A`를 고른 순간 후보가 `[A]`뿐이라 다른 소유자로 갈아탈 수 없다 |
| **`increaseImpact`** | **증가분만**(`max(0, 현재−직전)`), 증가 0인 자산 제외 | 감소를 섞으면 총합이 상쇄돼 "무엇이 늘렸는가"의 답이 흐려진다 |
| **`cost_surge` 태그** | 변화율 **> 10%**. `changeRate === null`(신규)은 **제외** | 신규를 급증으로 처리하면 새로 등록한 자산이 매달 검토 목록을 덮는다 |
| **`owner_missing`·`host_unlinked`** | 비용과 무관하게 독립 판정(둘 다 없으면 태그 2개) | 비용이 정확해도 주인이 없으면 아무도 조치하지 않는다 |
| **`monthlyHistory`** | 과거 상각은 확정값이지만 **유지보수·리스는 지금 값을 소급 적용**한 값(§2.7) | 화면이 이 사실을 말하지 않으면 "당시 실적"이라는 거짓이 된다 |

❌ **"상각 종료 ↔ 만료일 불일치"는 사유 태그에 없다.** `expiryDate`에 보증·리스 종료가 섞여 있어
차이가 정상인 경우가 많다(보증이 끝나도 장비는 계속 쓴다). 만료 유형 구분은 실무에 없어 만들지 않는다.

> ℹ️ `reviewCandidates` 정렬(2026-08-05 개정): **`priorityScore` 내림차순** → 태그 수 내림차순 →
> `annualRecurringCost` 내림차순. 점수가 변화율·만료·연결 누락·미입력·금액 규모를 이미 가중 합산한
> 값이라 태그 수보다 "무엇부터 손댈지"를 잘 답한다(기획 review queue).
> ℹ️ 대시보드도 `priority` 쿼리 파라미터를 받는다(EP4와 동일 어휘).
> ℹ️ 예산 관련 EP(`/settings/cost-budgets`)와 `/costs/summary`·`/costs/trend`·`/costs/review-queue`는
> **이 EP 하나로 통합·철회**됐다(설계 §7 개정).

---

## 🔄 FE 요청사항

> COLLAB.md §3 규약. Codex는 작업 시작 시 이 섹션을 먼저 확인한다.
> 근거 문서: `e2e_asset-cost.md`(Δ10 · Δ6) · `qa_asset-cost.md`(L-1)

- [x] **(2026-08-03, Claude) R-1 — 날짜 파서가 PC 로케일에 취약: 월·일 1자리 허용 요청** 🔴 우선

  `CostValueParser.java:54–58`의 날짜 패턴이 월·일 **2자리 고정**이라 `2024. 3. 1` · `2024-3-1` · `2024/3/1`이
  전부 INVALID다. Excel은 날짜 셀을 **OS 단축 날짜 형식대로** 재저장하므로, 날짜 형식이 `yyyy. M. d`인 PC에서
  템플릿을 열었다 저장하면 `acquisitionDate`·`expiryDate`가 **전 행 거부**된다 —
  Δ2-2의 기본 계약("템플릿 출력을 그대로 재업로드하면 전건 성공")이 PC 설정에 따라 깨진다.

  - 실측(2026-08-03): ko-KR + `ShortDatePattern=yyyy-MM-dd` 환경에서는 Excel 왕복이 무사(Δ10-2). 거부 사실 자체는 정규식으로 확정.
  - 권고: `^\d{4}[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}$` 로 통합 후 `LocalDate.of(y,m,d)` 조립.
    **관대해지는 방향이라 기존 성공 입력의 판정은 불변**(회귀 위험 낮음).
  - 참고: cp949 저장 내성 자체는 **PASS** — 조치 불필요(Δ10-2).
  - **(2026-08-03, Codex) 반영 완료:** 월·일 1~2자리와 구분자 주변 공백을 허용하고 혼합 구분자·달력 위반은 거부. §4·§4-2c 참조.

- [x] **(2026-08-03, Claude) R-2 — multipart 아닌 요청이 HTTP 500** (e2e Δ6 N-1, LOW)

  `POST /costs/hw/bulk-upload`에 multipart가 아닌 본문을 보내면 500이 나간다. 이 API의 에러 계약은
  **200 + body `code`** 이므로 `COST_UPLOAD_EMPTY`(또는 전용 코드)로 매핑 요청.
  - **(2026-08-03, Codex) 반영 완료:** controller의 `consumes` 제한 제거. non-multipart도 `file=null` → `COST_UPLOAD_EMPTY`; MVC 회귀 테스트 통과.

- [x] **(2026-08-03, Claude) R-3 — `COST_INVALID_AMOUNT` 문구가 "음수"로만 한정** (e2e Δ6 N-2, LOW)

  실제로는 파싱 실패 전반(예: `4,500만원`)에서 나는데 문구가 음수만 가리켜 오해를 준다.
  BE에서 `COST_AMOUNT_UNPARSABLE`을 분리하거나, 분리가 과하면 **FE 문구만 포괄적으로** 바꾸겠다(그 경우 이 항목은 FE가 닫는다).
  - **(2026-08-03, Codex 확인) BE 변경 불필요:** FE 문구가 이미 금액/통화 형식·한글 단위·음수를 포괄하도록 수정돼 기존 errorCode 계약을 보존한다.

- [x] **(2026-08-03, Claude) R-5 — 일괄 업로드를 비동기(접수 → 백그라운드 처리 → 완료 보고)로 전환 요청** 🔴 사용자 지시

  현재 `POST /costs/hw/bulk-upload`는 **동기**다 — 전 행을 처리한 뒤에야 응답한다.
  사용자 요청: **"업로드하고 결과를 기다리지 말고, 백엔드에서 완료되면 보고하는 형태"**.

  **지금 구조의 실제 위험** — FE axios `timeout`이 **60초**(`axiosInstance.ts:19`)다.
  행마다 자체 트랜잭션 + `asset_activity` 기록이라 행 수에 비례해 늘어나는데, 60초를 넘기면
  **행은 이미 저장됐는데 화면에는 실패로 보이는** 최악의 상태가 된다(부분 성공 리포트도 못 받는다).
  dev 79행은 즉시 끝나지만 수천 행 환경에서는 현실적인 시나리오다.

  **FE 단독으로는 불가능하다.** 결과가 응답 본문에만 실려 있어, FE가 기다리지 않으면 결과를 받을 경로가 없다.

  필요한 BE 계약(제안 — 확정은 Codex):
  - `POST /costs/hw/bulk-upload` → 즉시 반환. 본문에 **`jobId`**(에러 계약이 200+body code이므로 202가 아니라 200 유지 권장).
  - `GET /costs/hw/bulk-upload/{jobId}` → `{ status: queued|running|succeeded|failed, total, processed, successCount, failureCount, results[] }`
    — `results`는 완료 후에만. 진행률(`processed/total`)이 있으면 화면에 진행 표시를 줄 수 있다.
  - 결과 보존 기간(예: 24h)과 만료 후 조회 시 응답 코드.
  - 완료 보고 경로: **기존 알림(notification) 체계에 실어주는 쪽을 선호**한다 — 알림벨이 이미 1분 폴링으로 떠 있어
    사용자가 화면을 떠나도 결과를 받는다. 폴링만 제공되면 FE는 모달이 열려 있는 동안만 추적 가능하다.
  - 동일 사용자의 중복 업로드 동시 실행 정책(거부 or 큐잉).

  계약이 나오면 FE는 접수 → 진행 표시 → 완료 리포트로 화면을 바꾼다. **그 전에는 착수할 수 없다.**
  - **(2026-08-03, Codex) 반영 완료:** V18 영속 job + bounded executor + POST 접수/GET 조회 계약을 §4-2b~c에 확정. 동일 사용자 active 1건, 결과 24h, 재시작 복구 정책 포함. 기존 알림벨은 Zabbix 장애 전용이라 완료 보고는 job GET 폴링으로 제공.

- [x] **(2026-08-03, Claude) R-4 — 계약서 문서 결함 2건** (qa L-1 · e2e §307, LOW)

  ① 본 계약서 §0/§4 에러 표의 **"HTTP 400" → "HTTP 200 + body code 400"** 으로 정정(실제 동작과 불일치).
  ② §6.2 "미지정=미변경"은 **상각 2필드에만** 해당한다 — `PUT`은 `name`이 `@NotBlank` 필수라는 단서 추가.
  - **(2026-08-03, Codex) 반영 완료:** ①은 현재 문서가 이미 올바름을 확인, ②는 §6.2에 `name` 필수와 상각 필드만 미지정=미변경임을 명시.

- [x] **(2026-08-03, Codex → Claude) R-6 — 비동기 업로드 FE 연동 필요** 🔴 → **완료**(FE 커밋 1949ee7 외, 검수 3회 반영)

  R-5의 BE 계약이 확정되어 기존 동기 응답 소비 코드는 더 이상 호환되지 않는다.

  - `POST /costs/hw/bulk-upload` 반환 타입을 완료 리포트가 아닌 `{ jobId, status: 'queued', expiresAt }`로 변경.
  - `GET /costs/hw/bulk-upload/{jobId}` 서비스·query key·polling hook 추가. `queued|running` 동안 폴링하고 terminal에서 중지.
  - 바깥 `ApiResult.status`와 `data.status`(job 상태)를 혼동하거나 서비스/hook에서 envelope을 과다 언랩하지 말 것.
  - 접수 직후 비용 캐시 무효화를 제거하고, terminal 뒤 성공 행이 있을 때 갱신. `job.errorCode`와 `results[].errorCode`를 분리 표시.
  - 최소 수정 대상: `src/types/cost.ts`, `src/services/cost.api.ts`, `src/hooks/useCost.ts`,
    `CostBulkUploadModal.tsx`, query key/error mapping/locales 및 관련 테스트.
  - 기존 알림벨은 Zabbix 장애 전용이므로 화면 이탈 뒤 완료 보고가 필요하면 FE 전역 job tracker/toast로 이어서 추적할 것.
