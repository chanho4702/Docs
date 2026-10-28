# MovesEye 개발 설계 — 자산 관리 > 비용 (Cost Monitoring)

> 기획 원천: Confluence `01-1. Cost (비용 모니터링) - 컨셉` (ZM/37190828047, 최종수정 2026-05-31)
> 선행 문서: `_workspace/features/assets/assets-design/demo_analysis_assets-cost-maps.md`(데모 관찰) · `_workspace/features/assets/assets-design/apply_design_assets-cost-maps.md`(§Phase2 개요)
> 작성일: 2026-07-30 · **개정: 2026-07-30 (fable 5 검토 반영 — HIGH 3건 해소)** · 대상: `moveseye-be-spring` + `moveseyee_fe`
> **🔴 2026-08-04 개정** — 사용자 설계 재검토로 **예산(§3.3·§8.7) 미채택**, **Dashboard(§8.3) 전면 개정**(상각·만료 불일치 노출 + 필터 세분화). 결정 #6도 함께 철회. 근거: `plan_cost-dashboard.md` §0.
> 상태: **설계(구현 전)**. Phase 2(Costs)의 상세 설계 정본이며 apply_design §Phase2 개요를 대체한다.

## 🎯 이 화면의 목적 (2026-07-30 사용자 규정 — 모든 설계 판단의 최상위 기준)

> **"우리가 관리하고 있는 자산 데이터를 비용 측면에서 관리하는 것"**

범용 FinOps·클라우드 청구 분석 도구가 아니다. **이미 자산으로 등록·관리 중인 대상을 비용이라는 렌즈로 다루는 화면**이다. 여기서 두 가지가 따라온다:

1. **무게중심은 자산의 비용 생애주기** — 취득 → 상각 → 유지보수 → 만료 → 교체/폐기 판단. AWS 청구 분석은 부차적이다.
2. **"관리"는 쓰기를 포함한다** — 조회만 하는 화면이 아니다. 비용 정보를 **채워 넣고 고치는 동선**이 화면 안에 있어야 한다(결정 #10).

---

## 0. 확정 사항 (2026-07-30 사용자 결정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | **감가상각** | **정액법·정률법 둘 다 구현.** HW 비용의 핵심 = 상각 스케줄 계산 |
| 2 | 상각 기준 지정 단위 | **기기유형별 기본값 + 자산별 예외**(오버라이드) |
| 3 | 계산 규칙 | **한국 세무 기준** — 정액법 `취득가액×(1/내용연수)`, 정률법 `미상각잔액×법정상각률`, 잔존가액 0·기본 잔존가액 0원, 월할상각 |
| 4 | 기존 수동 필드 | **계산값이 정본, 수동 입력값은 오버라이드**(화면에 "수동" 표기) |
| 5 | HW 기간축 | **월별 배분 계산**(스냅샷 테이블 없음). previous/current/forecast를 계산으로 산출 |
| 6 | 예산·우선순위 | ~~예산 설정 화면 신설~~ → **2026-08-04 철회, 예산 미채택**(§8.3 개정 참조) + **costPriority는 BE 자동 산정** |
| 7 | IA | **`/asset/cost` 한 페이지 내 3탭**(Dashboard·HW·Cloud) + 드릴다운. 메뉴 구조 변경 없음 |
| 8 | Cloud(AWS) | 설계에는 포함, **구현은 HW 우선**. Cost Explorer 어댑터는 껍데기까지 만들고 키 확보 시 활성화 |
| **9** | **소급 재계산** | **항상 현재 파라미터 기준 재계산.** 과거 수치도 현재 기준으로 다시 계산된 값임을 **정책으로 선언하고 화면에 명시**. 스냅샷·전진법 미채택 |
| **10** | **입력 동선** | **HW 목록 인라인 편집 + 미입력 자산 큐**를 M1 필수로. 비용 탭이 조회 전용이 아니다 |
| **11** | **HW 모집단** | **excluded(관리대상 제외) 자산만 빼고 전 자산.** platform 파생으로 거르지 않는다 |

---

## 1. 출발점 — 이미 있는 것 / 없는 것

### 1.1 이미 있는 것 (그대로 쓴다)

| 자산 | 위치 | 비고 |
|---|---|---|
| 메뉴·라우트 `/asset/cost` | `routes.tsx:596-597`, SideNav | 페이지는 `Empty` 플레이스홀더(`AssetCostPage.tsx`) — 껍데기만 교체 |
| **HW 비용 원천 5필드** | `asset.cost_data` jsonb (V6) | `purchase_cost`·`maintenance_cost`·`lease_cost`·`depreciation_cost`·`residual_value`. ⚠️ **값이 문자열이다** — §1.3 참조 |
| 소유자 | `asset.owner_name` (V6) | 문서 `ownerId/ownerName` 대응 |
| 라이프사이클 | `asset.lifecycle_status` (V6) | 문서 `lifecycleStatus` 대응 |
| 위치·벤더·모델 | inventory `location`·`vendor`·`model` | HW 탭 필터축. FE 상수 `ASSET_INVENTORY_FIELDS`에 이미 노출 |
| 연결 호스트 | `asset.linked_hostid` (V6, V14 인덱스) | "연결된 Host" 컬럼 |
| AWS 식별 | `asset.cloud_data` jsonb (V6) | Cloud 비용↔자산 조인키 |
| 기기유형 마스터 | `device_classification` (V13) | **상각 기본값을 붙일 자리** |
| 스케줄러 설정 | `scheduler_setting` (V15) + 실행로그 (V16) | Cloud 수집 배치를 job으로 추가 |
| AWS 자격증명 | `aws` 모듈 하이브리드 체인 | DB `Setting(CLOUD)` 우선 → `.env`/IAM 표준 체인 |
| 자산 스냅샷 그릇 | `AssetZabbixData.inventory` = `Map<String,String>` | **값이 있는 Zabbix 표준 inventory 키를 전부 담는다**(`AssetZabbixData.java:13,23`). 날짜 키도 원리상 여기 실린다 |

### 1.2 없는 것 (신규)

- **상각 계산 엔진** — 정액/정률, 월할, 기본 잔존가액
- **상각 파라미터** — 상각방법·내용연수, 유지보수/리스료의 **금액 주기**(월/연/일시)
- **숫자 검증·정규화** — 아래 §1.3
- **날짜 필드 취급 일체** — 아래 §1.3
- ~~**예산 저장소**~~(2026-08-04 미채택), **비용 도메인 패키지(`cost/`)**, 비용 API 전체, FE 비용 화면 전체
- **AWS Cost Explorer 연동** — SDK 의존성조차 없음. 현재 `ec2`·`cloudwatch`만 (`build.gradle.kts:57-59`)

### 1.3 🔴 상각 엔진의 입력 계층 — 검토에서 드러난 현실 (2026-07-30 실사)

설계 초안이 **"있다"의 정도를 과대평가**했던 지점이다. 코드 실사 결과:

**(A) `cost_data` 값은 전부 문자열이다**
- 자산 폼의 비용 5필드는 평문 `<Input>`(`AssetFormModal.tsx:697`), `cleanRecord`가 문자열 그대로 전송
- BE는 `Map<String,Object>`를 **무검증 저장**(`Asset.java:127`, `AssetService.java:203`)
- 즉 DB의 `purchase_cost`는 `"45000000"`이고, 사용자가 `"4,500만원"`을 넣어도 그대로 들어간다
- → **숫자 정규화·검증과 폼 교체가 M1 필수**(§3.1, §10 M1)

**(B) `date_hw_*` 날짜 키는 코드 어디서도 다루지 않는다**
- `date_hw_purchase`·`date_hw_install`·`date_hw_expiry` — **BE·FE 전체 grep 0건**
- FE `ASSET_INVENTORY_FIELDS`(11필드)·상세 필드그룹 어디에도 없어 **표시도 입력도 안 된다**
- 단, §1.1대로 `inventory`는 표준 키 전체를 담는 맵이므로 **Zabbix에 값이 있으면 데이터는 이미 자산에 들어와 있다**. 문제는 셋:
  1. 실제로 채워져 있는지 **한 번도 확인된 적 없음** → 리스크 #1 실측 대상
  2. FE가 노출하지 않아 사용자가 존재를 모름
  3. **custom 자산은 입력 경로 자체가 없음**
- → M1에서 (a) 날짜 3키를 자산 상세/폼에 노출, (b) 취득일 폴백 체인 확정(§2.1), (c) 문자열 날짜 파싱 규칙 확정

**(C) inventory 값도 전부 `Map<String,String>`** — 날짜든 금액이든 파싱은 불가피하다.

### 1.4 기획 문서와 본제품의 어긋남 — 3건

| # | 문서 | 본제품 | 해소 방침 |
|---|---|---|---|
| 1 | `platform = hw \| cloud` 를 1차 분류축으로 사용 | 2026-07-09 결정으로 cloud/onprem 분류를 **기기유형(device_type)으로 대체**함 | 비용 화면 한정으로 **표시용 파생**만 되살린다. 단 **HW 모집단을 platform으로 거르지 않는다**(결정 #11) — §6.1 |
| 2 | 비용이 `costPeriodStart/End`를 가진 **레코드**로 존재하는 전제 | `cost_data`는 자산당 정적 금액 1벌 | 결정 #5 — **조회 시점 계산**으로 기간축을 만든다. 저장소 신설 없음(Cloud만 캐시) |
| 3 | `costPriority`가 저장된 필드 | 없음 | 결정 #6 — **BE 자동 산정**(§6.3) |

---

## 2. 감가상각 계산 엔진 (핵심)

> HW 비용 탭의 심장. `취득가액 → 연차별 상각 스케줄 → 월 상각비`를 산출한다.

### 2.1 입력 파라미터와 폴백 체인 (확정)

| 파라미터 | 우선순위 (앞이 우선) | 없을 때 |
|---|---|---|
| 취득가액 | `cost_data.purchase_cost` (숫자 정규화 후) | **상각 계산 제외** → 목록에 `상각 불가` 뱃지 + 사유(`취득가액 없음`) |
| **취득일** | ① `cost_data.acquisition_date`(수동, **최우선**) → ② inventory `date_hw_purchase` → ③ inventory `date_hw_install` → ④ `asset.created_at` | ④까지 오면 **상각 불가가 아니라 계산하되** 목록·드릴다운에 `취득일 추정(등록일 기준)` 표기 |
| **만료일** *(2026-07-31 M1 보강)* | ① `cost_data.expiry_date`(수동, **최우선**) → ② inventory `date_hw_expiry` | 없음(null) — 만료 지표(Expiry window·exposure·Renewal candidates)·costPriority 만료 요소에서 제외. **zabbix 자산의 inventory는 동기화 소유라 사용자 입력은 취득일과 같은 이유로 cost_data에 둔다**(초안은 입력 경로가 없어 만료 지표가 구조적으로 0이 되는 결함이었음) |
| 상각방법 | `cost_data.depreciation_method` → `device_classification.default_depreciation_method` → `straight_line` | — |
| 내용연수 | `cost_data.useful_life_years` → `device_classification.default_useful_life_years` → `5` | — |
| 잔존가액 | `cost_data.residual_value`(수동) → 세무 기준 **0 + 기본 잔존가액 0원** | — |

> 🔴 초안의 §2.1/§3.1이 취득일 우선순위를 서로 다르게 서술했던 모순을 위 표로 확정한다. **수동 입력이 항상 이긴다**(§2.6 오버라이드 관례와 일관).

**숫자 정규화 규칙** (금액 공통)
- 콤마·공백·통화기호(`₩`, `원`, `$`) 제거 후 파싱. `"45,000,000원"` → `45000000` 허용
- `만원`·`억` 같은 한글 단위는 **허용하지 않는다**(오해석 위험) → 파싱 실패 처리
- 파싱 실패 / 음수 / `0` → **상각 불가**, 사유를 응답에 실어 목록에서 필터·수정 가능하게 한다

**날짜 파싱 규칙**
- 허용: `yyyy-MM-dd` · `yyyy.MM.dd` · `yyyy/MM/dd` · `yyyyMMdd` · `yyyy-MM`(→ 해당 월 1일)
- 실패 시 다음 폴백 단계로 내려간다(체인 중단 아님)
- 미래 날짜는 그대로 인정하되 `상각 개시 전`으로 분류(당기 상각비 0)

### 2.2 정액법 (straight-line)

```
총 상각대상액 = 취득가액 - 잔존가액(기본 0)
총 상각월수   = 내용연수 × 12
월 상각비     = 총 상각대상액 / 총 상각월수        (전 기간 동일)
상각 개시월   = 취득월 (취득한 달을 1개월로 산입)
```
- 상각은 **취득월부터 N개월간의 월 시퀀스**로 계산한다(역년 경계와 무관 — 초안의 "연 상각비/12" 모호성 제거).
- 마지막 달에 **기본 잔존가액 0원**을 남기고 종료(마지막 달 상각비 = 잔여액 − 1,000).
- 연차별 표(§2.5)는 이 월 시퀀스를 **역년(1~12월) 기준으로 묶어** 표시한다. 취득연도·최종연도는 부분 연도(`isPartialYear=true`).

### 2.3 정률법 (declining balance)

```
연차 k의 기초 미상각잔액 = 취득가액 - (k-1)차까지 상각누계액
연차 k의 연 상각비        = 기초 미상각잔액 × 법정상각률(내용연수)     (k < 내용연수)
연차 k의 월 상각비        = 연차 k 연 상각비 / 12
최종 연차(k = 내용연수)   = 기초 미상각잔액 - 1,000원을 전액 월할 정산  ← 2026-07-30 정정
종료 조건                 = min(내용연수 도달, 미상각잔액 ≤ 1,000원) 중 먼저 오는 쪽
                            (잔액 ≤ 1,000원이 먼저면 (잔액 - 1,000)만 상각 후 조기 종료)
```

> 🔴 **최종 연차 정산(2026-07-30 정정, M1 구현 반영)**: 초안의 종료 조건("잔액 ≤ 1,000원")만으로는
> 법정상각률표의 특성상(내용연수 경과 시 잔존 ~5%가 남는 표) 스케줄이 내용연수를 넘어 ~3배까지 연장된다
> (5년 정률 → 실제 ~15년). 잔존가액 0 원칙(결정 #3)의 세무 실무 처리대로 **내용연수 마지막 연차에
> 미상각잔액을 전액 정산**하고 종료한다(기본 잔존가액 0원만 잔존). 최종 연차 상각비가 통상치보다 커지는
> 것이 정상이며, 5년 장비가 15년간 상각비를 계상해 만료·교체 판단이 왜곡되는 것을 막는다.

- **연차의 기준은 취득월이다** — 역년이 아니라 `취득월 + 12개월` 단위로 1차·2차·3차를 센다. 이렇게 하면 취득연도 안분이라는 별도 규칙이 사라지고, 어떤 달을 조회해도 "이 달은 몇 차 연도인가"가 명확히 결정된다.
- 화면 표시는 §2.2와 동일하게 **역년 기준으로 묶어** 보여준다(연차 경계가 연중이면 한 역년에 두 연차의 월이 섞이며, 이는 정상이다).
- 정률법은 연차가 바뀔 때마다 월 상각비가 **감소**한다 → HW 탭 `Change rate`가 0이 아닌 주된 이유(§6.2).

> 🔴 초안의 "취득 연도는 월할 안분 + 월 상각비 = 연 상각비/12" 이중 서술을 **취득월 기준 연차**로 일원화했다. 사업연도(역년) 기준 세무신고와의 대사가 필요하면 그때 별도 리포트로 다룬다 — 이 화면의 목적은 세무신고가 아니라 자산 관리다.

**법정상각률 테이블 (설계 기본값)**

| 내용연수 | 상각률 | 내용연수 | 상각률 |
|---|---|---|---|
| 2년 | 0.777 | 9년 | 0.284 |
| 3년 | 0.632 | 10년 | 0.259 |
| 4년 | 0.528 | 11년 | 0.239 |
| 5년 | 0.451 | 12년 | 0.221 |
| 6년 | 0.394 | 13년 | 0.206 |
| 7년 | 0.349 | 14년 | 0.193 |
| 8년 | 0.313 | 15년 | 0.182 |

- ⚠️ **회계팀 확인 권장**: 법인세법 시행규칙 상각률표의 통용값이다. 세무자료 대사가 목적이라면 착수 전 1회 검증할 것.
- 표에 없는 내용연수는 **입력 단계에서 막는다**(2~15년만 허용). 근사식 폴백은 두지 않는다 — 근사값이 화면에 섞이면 신뢰가 깨진다.
- 테이블은 **DB로 분리**(`depreciation_rate`)해 세법 개정·정정에 대응한다. **V17(M1)에 넣는다** — 정률법 엔진이 M1이므로.

### 2.4 기기유형별 기본값 (시드 제안)

| 기기유형 | 기본 상각방법 | 기본 내용연수 |
|---|---|---|
| server / network / security / database / hardware / notClassified | 정액법 | 5년 |

전부 동일한 보수적 시드로 시작한다(도입 즉시 값이 튀지 않게). 기기분류 관리 화면에서 조정하는 것이 정상 운영 경로다.

### 2.5 산출물 — 상각 스케줄

자산 1건에 대해 **월 시퀀스**를 만들고, 화면용으로 역년 묶음 행을 낸다:

```
월 시퀀스: { yearMonth, depreciation, accumulated, bookValue, fiscalYearIndex }
역년 행:   { year, openingBookValue, annualDepreciation, accumulatedDepreciation,
             closingBookValue, monthCount, isPartialYear }
```

- HW 목록에는 **선택 기간에 해당하는 월 상각비 합계**만 싣는다.
- 자산 클릭 → **상각 스케줄 드릴다운**: 연차별 표 + 장부가액 추이 차트 + 파라미터 출처 표시(기기유형 기본값 / 자산별 예외 / 수동 오버라이드 / 추정 취득일).
- 계산은 **stateless·결정적**이다 → 스냅샷 저장 없이 과거·미래 어느 기간이든 조회 가능(결정 #5). **단 §2.7의 소급 재계산 정책이 함께 적용된다.**

### 2.6 수동 오버라이드 (결정 #4)

`cost_data.depreciation_cost`(연액) 또는 `residual_value`에 값이 있으면 계산값 대신 그 값을 쓴다. 상호작용을 명시한다:

| 상황 | 거동 |
|---|---|
| `depreciation_cost`만 있음 | **연액 정액 상각으로 간주.** 월 상각비 = 값/12. 스케줄은 취득가액을 이 연액으로 나눠 소진할 때까지 생성하고, 잔여가 `residual_value`(없으면 1,000원) 이하가 되면 종료 |
| `residual_value`만 있음 | 계산 방식(정액/정률)은 유지하되 **상각 하한을 이 값으로** 설정(기본 잔존가액 0원 대신) |
| 둘 다 있음 | 위 두 규칙을 함께 적용 — 연액 정액 상각 + 하한 = `residual_value` |
| 수동 연액 누적이 취득가액 초과 | **초과 시점에 상각 종료**(음수 장부가액 금지). 드릴다운에 `수동값이 취득가액을 초과해 조기 종료됨` 경고 |
| 취득가액 없이 수동 연액만 있음 | 월 비용은 계산 가능(값/12)하나 **장부가액·상각누계액은 표시하지 않음**(기준액 부재) |

- 응답에 `depreciationSource: "calculated" | "manual"` 을 실어 화면에서 뱃지로 구분한다.
- 자산 폼에 "계산값 사용(기본) / 직접 입력" 토글을 두고, 직접 입력 시 계산값을 placeholder로 보여 대사할 수 있게 한다.

### 2.7 🔴 소급 재계산 정책 (결정 #9)

상각 계산의 입력에는 **현재 시점의** 내용연수·상각방법·기기유형 기본값·excluded 플래그가 들어간다. 따라서 파라미터를 바꾸면 **이미 본 과거 월의 수치도 바뀐다.**

**채택 정책: 항상 현재 파라미터 기준 재계산.**

- 이 화면의 모든 과거 수치는 "**지금 설정으로 다시 계산한 값**"이다. 회계의 전진법(변경 시점 이후만 반영)과 다르다.
- **화면에 명시한다** — 기간 헤더 옆에 `현재 상각 기준으로 산출된 값입니다` 안내와 파라미터 기준일 표시.
- 파라미터를 바꾸는 화면(자산 폼, 기기분류 관리)에 **변경 시 경고**를 띄운다: `이 변경은 과거 기간의 비용 수치에도 소급 반영됩니다.`
- 영향 범위가 넓은 **기기분류 기본값 변경**은 저장 전에 `영향받는 자산 N건`을 보여준다.
- 트레이드오프: 과거 시점에 캡처한 보고서와 숫자가 달라질 수 있다. 자산 76대 규모에서 스냅샷 테이블·배치를 늘리는 비용보다 낫다고 판단했다. 규모가 커지거나 회계 대사 요구가 생기면 월 마감 스냅샷(리포트 스냅샷 패턴)으로 승격한다.
- **excluded 자산**도 같은 원리로 과거 합계에서 사라진다 → §6.1의 모집단 규칙에 명시.

### 2.8 엣지케이스 처리 요약

| 케이스 | 거동 |
|---|---|
| 취득가액 없음/0/음수/파싱 실패 | 상각 불가 + 사유 표기, **미입력 큐에 편입**(§8.4) |
| 취득일 전부 없음 | `created_at` 폴백 + `추정` 표기 |
| 취득일이 미래 | `상각 개시 전`, 당기 상각비 0 |
| 상각 완료 자산 | 월 상각비 0, 장부가액 = 기본 잔존가액. 목록에 `상각 완료` 뱃지 (유지보수·리스료는 계속 계상) |
| 내용연수 도중 변경 | §2.7 정책대로 **전 기간 소급 재계산** |
| 자산 excluded / 복원 | excluded는 집계 제외(§6.1), 복원 시 과거 포함으로 되돌아감 |
| 중고 취득 | 별도 규칙 없음 — 사용자가 내용연수를 짧게 입력해 표현한다(설계 범위 밖으로 명시) |
| 기간이 여러 연차에 걸침 | 월 시퀀스 합산이므로 자연히 처리됨 |
| 폐기 시 기본 잔존가액 처리 | **범위 밖**(폐기 회계 처리는 하지 않는다) |

---

## 3. 데이터 모델

### 3.1 `cost_data` jsonb 스키마 확장 (마이그레이션 불필요)

```jsonc
{
  // 기존(V6) — ⚠️ 현재 DB에는 문자열로 저장돼 있다(§1.3-A). 읽기 시 정규화한다.
  "purchase_cost":      45000000,
  "maintenance_cost":   3600000,
  "lease_cost":         0,
  "depreciation_cost":  null,     // 수동 오버라이드(연액). null이면 계산값
  "residual_value":     null,     // 수동 오버라이드. null이면 세무 기준(0 + 기본 잔존가액)

  // 신규 — 상각 파라미터(자산별 예외. null이면 기기유형 기본값)
  "depreciation_method":  "declining_balance",  // "straight_line" | "declining_balance"
  "useful_life_years":    5,                    // 2~15 (표 범위)
  "acquisition_date":     "2024-03-15",         // 수동 취득일 — 폴백 체인 최우선(§2.1)
  "expiry_date":          "2027-06-30",         // 수동 만료일 — inventory date_hw_expiry보다 우선(§2.1, 2026-07-31 보강)

  // 신규 — 금액 주기(⚠️ 없으면 월액/연액 구분 불가)
  "maintenance_cost_period": "yearly",          // "monthly" | "yearly" | "onetime"
  "lease_cost_period":       "monthly",
  "currency":                "KRW"
}
```

**쓰기 규약 (M1에서 도입)**
- 숫자 필드는 FE에서 `InputNumber`, enum 필드는 `DSelect`로 **입력 단계에서 타입을 강제**한다.
- BE는 저장 시 `cost_data` 키를 **화이트리스트 검증**한다(알 수 없는 키·잘못된 enum 값 거부). 기존 자유 jsonb 관용은 유지하되 위 키만 검증 대상.
- 기존 문자열 데이터는 **읽기 시 정규화로 흡수**(일괄 마이그레이션 없음). 정규화 실패분은 미입력 큐로 노출돼 사용자가 고친다 — 결정 #10의 동선이 곧 데이터 정정 경로다.

> 🔴 **금액 주기는 필수 설계 요소다.** 기존 데이터는 `yearly`로 간주(가장 흔한 계약 단위)하고 화면에 `주기 미지정 → 연액 가정` 안내를 띄운다.

### 3.2 `V17__cost_depreciation.sql` (M1)

```sql
-- 기기유형별 상각 기본값
ALTER TABLE device_classification
  ADD COLUMN IF NOT EXISTS default_depreciation_method varchar(32) DEFAULT 'straight_line',
  ADD COLUMN IF NOT EXISTS default_useful_life_years   integer     DEFAULT 5;

-- 법정상각률표(§2.3) — 코드 상수 대신 DB. 정률법 엔진이 M1이므로 V17에 둔다.
CREATE TABLE IF NOT EXISTS depreciation_rate (
    useful_life_years integer PRIMARY KEY,
    rate              numeric(6,4) NOT NULL
);
INSERT INTO depreciation_rate (useful_life_years, rate) VALUES
  (2,0.777),(3,0.632),(4,0.528),(5,0.451),(6,0.394),(7,0.349),(8,0.313),
  (9,0.284),(10,0.259),(11,0.239),(12,0.221),(13,0.206),(14,0.193),(15,0.182)
ON CONFLICT (useful_life_years) DO NOTHING;
```
- 기존 6종 시드는 DEFAULT로 자동 충족(별도 UPDATE 불필요).
- 기기분류 관리 화면(`/settings/device-classifications`)에 2컬럼 추가 — **화면 신설이 아니라 필드 추가**.

### 3.3 ~~`V18__cost_budget.sql`~~ (M2) — 🔴 **2026-08-04 보류(미채택)**

> **예산을 M2에서 뺐다.** 감가상각비는 통제할 수 있는 지출이 아니라(취득가액·내용연수가 정해지면
> 매월 상각액이 이미 결정된다) 예산 대비 비교로 할 수 있는 일이 없다. 이 기능의 목적은
> "자산과 그 소모 비용의 **확인**"이지 통제가 아니다 — 예산은 축이 다르다.
> 아래 스키마는 **만들지 않는다.** 유지보수·리스처럼 결정을 바꿀 수 있는 지출에 예산이 필요해지면
> 그때 이 설계를 되살린다. 상세 근거: `plan_cost-dashboard.md` §0.
> (마이그레이션 번호도 무효 — V18·V19는 비동기 업로드 job/heartbeat이 선점했다.)

<details><summary>보류된 원안 스키마</summary>


```sql
CREATE TABLE IF NOT EXISTS cost_budget (
    id            bigserial PRIMARY KEY,
    scope         varchar(16)  NOT NULL,          -- 'total' | 'hw' | 'cloud' | 'owner'
    scope_key     varchar(255),                   -- scope='owner'일 때 owner_name. 그 외 NULL
    period        char(7)      NOT NULL,          -- 'yyyy-MM' (월 예산 고정)
    amount        numeric(18,2) NOT NULL,
    currency      varchar(8)   NOT NULL DEFAULT 'KRW',
    note          varchar(500),
    created_at    timestamp    NOT NULL DEFAULT now(),
    updated_at    timestamp    NOT NULL DEFAULT now(),
    updated_by    varchar(255)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_budget_scope_period
  ON cost_budget (scope, COALESCE(scope_key,''), period);
```
- 초안의 `period_start`/`period_end` 쌍은 월 고정이라 과잉이었다 → `period char(7)` 단일 컬럼.
- ⚠️ `scope_key = owner_name`(자유 텍스트)이라 **소유자명을 바꾸면 예산 연결이 끊긴다.** 소유자 변경 시 경고하거나, `owner_user_id`(V6 예약 컬럼)로 승격할 때 함께 정리한다 — LOW 리스크로 등재(§11-8).

</details>

### 3.4 `V19__cloud_cost.sql` (M3)

Cost Explorer는 **요청당 $0.01 과금** → **일 1회 배치 수집 → DB 캐시 → 화면은 캐시만 읽는다.**

```sql
-- grain A: 월/일 × 계정 × 서비스 × 리전 — 장기 비교(전월 대비)용
CREATE TABLE IF NOT EXISTS cloud_cost_agg (
    id           bigserial PRIMARY KEY,
    period_start date        NOT NULL,
    period_end   date        NOT NULL,
    granularity  varchar(8)  NOT NULL,       -- 'DAILY' | 'MONTHLY'
    account_id   varchar(64),
    account_name varchar(255),
    service      varchar(128),
    region       varchar(64),
    cost_amount  numeric(18,6) NOT NULL,
    usage_amount numeric(24,6),
    usage_unit   varchar(64),
    currency     varchar(8)  NOT NULL DEFAULT 'USD',
    collected_at timestamp   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_cost_agg
  ON cloud_cost_agg (period_start, granularity, COALESCE(account_id,''), COALESCE(service,''), COALESCE(region,''));

-- grain B: 일 × 리소스 × usageType × operation — 리소스 상세/라인아이템. ⚠️ 최근 14일만
CREATE TABLE IF NOT EXISTS cloud_cost_resource (
    id             bigserial PRIMARY KEY,
    usage_date     date         NOT NULL,
    resource_id    varchar(512) NOT NULL,
    account_id     varchar(64),
    service        varchar(128),
    region         varchar(64),
    usage_type     varchar(255),
    operation      varchar(128),
    usage_amount   numeric(24,6),
    usage_unit     varchar(64),
    rate           numeric(18,8),
    cost_amount    numeric(18,6) NOT NULL,
    currency       varchar(8)   NOT NULL DEFAULT 'USD',
    resource_state varchar(32),
    collected_at   timestamp    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_cost_resource_date ON cloud_cost_resource (usage_date);
CREATE INDEX IF NOT EXISTS idx_cloud_cost_resource_rid  ON cloud_cost_resource (resource_id);
```

> **grain을 둘로 나눈 이유**: `GetCostAndUsageWithResources`는 **최근 14일만** 조회 가능하다. 즉 **리소스 단위로는 "전월 대비"를 만들 수 없다.** 월 비교는 grain A로만 제공하고, 리소스 화면에는 최근 14일 추이를 보여주며 제약을 명시한다.

### 3.5 스케줄러 job 추가

```sql
INSERT INTO scheduler_setting (job_key, enabled, schedule_type, at_hour, at_minute, options) VALUES
  ('cloud_cost_sync', FALSE, 'daily', 5, 0, '{"lookbackDays":14,"granularity":"DAILY"}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;
```
- **`enabled=false`로 시드** — 자격증명 없이 매일 실패 로그를 쌓으면 안 된다.

---

## 4. 통화 처리 (⚠️ 미확정 — 가정 명시)

HW는 KRW, AWS는 **USD**. `Total cost = HW + Cloud`에 환산이 필요하다.

- 설정에 **기준통화(기본 KRW)** + **고정 환율(USD→KRW)** 1개. 외부 환율 API 호출 없음(**폐쇄망 배포 가능성** — Maps에서 OpenFreeMap을 고른 것과 같은 이유)
- 환산값에는 `기준환율 1,380원 (2026-07-30 기준)`처럼 **환율과 기준일을 병기**
- 곤란하면 Dashboard Total만 "HW ₩ / Cloud $" 병기 모드로 폴백

> M3 착수 전까지 HW 단독(KRW)이라 **HW 구현을 막지 않는다.**

---

## 5. AWS Cost Explorer 연동 (M3)

### 5.1 수집 경로

| 용도 | API | 제약 |
|---|---|---|
| 월/일 × 계정·서비스·리전 | `ce:GetCostAndUsage` | **요청당 $0.01** → 배치 1일 1회 |
| 리소스 단위 | `ce:GetCostAndUsageWithResources` | **최근 14일만**. hourly는 EC2 한정 |
| 라인아이템 상세 | CUR 2.0 / Data Exports (S3) | 전달 지연·일 단위 refresh. **2차 검토**(1차는 WithResources의 usageType/operation으로 대체) |
| 리소스 상태 | 기존 `aws` 모듈 EC2 API + AWS Config | 비용 API 아님. `resource_state` 보강용 |

### 5.2 구현 형태

- 의존성: `implementation("software.amazon.awssdk:costexplorer")` (BOM 2.28.29 포함)
- 자격증명: **기존 하이브리드 체인 재사용**. 추가 IAM 권한만: `ce:GetCostAndUsage`, `ce:GetCostAndUsageWithResources`
- 배치가 캐시 테이블에 upsert. 화면 API는 **DB만 읽는다**(과금·레이트 리스크 0)
- **자격증명 부재 시**: 배치 disabled, Cloud 탭은 "AWS 비용 수집이 설정되지 않았습니다 + 설정 안내" 빈 상태. **에러가 아니라 미구성 안내**

### 5.3 Cloud 비용 ↔ 자산 연결

- 조인키: `cloud_cost_resource.resource_id` ↔ `asset.cloud_data.resource_id`
- **자산에 없는 AWS 리소스도 표시한다** — AWS에 있는데 자산 등록이 안 된 것은 문서 기능요구 #7("운영 연결 정보 부족")의 핵심 사례이자, 이 화면 목적("관리")에 정확히 부합한다. 매칭 실패 시 `linkedAsset: null` + `자산 미등록` 뱃지 + **자산 등록 바로가기**

---

## 6. 지표 산정

### 6.1 모집단과 공통 파생 (결정 #11)

```
HW 탭 모집단 = excluded=false 인 전 자산            // platform으로 거르지 않는다
             + 조회 파라미터 includeExcluded=true 면 제외자산도 포함(회색 행)
Cloud 탭 모집단 = cloud_cost_* 캐시의 전 레코드      // 자산 등록 여부와 무관

platform(표시용 파생) = cloud_data.resource_id 가 있으면 'cloud', 아니면 'hw'
   ⚠️ 초안의 "cloud_data 비어있지 않으면 cloud"는 위험하다 — cloud_data는 폼에서 자유 입력
      10필드라 온프렘 자산에 한 필드만 실수로 채워도 cloud로 넘어간다.
      resource_id 존재로 좁히고, 그래도 이 값은 표시·필터에만 쓰고 모집단은 거르지 않는다.

costAmount(HW) = 월상각비 + 월유지보수비 + 월리스료   (선택 기간 월수만큼 합산)
   월유지보수비 = maintenance_cost / (yearly ? 12 : monthly ? 1 : onetime ? 총 상각월수)
   ⚠️ onetime + 취득일 없음 → 배분 불가 → 해당 항목만 0 처리하고 사유 표기
costAmount(Cloud) = cloud_cost_agg 합계(기간 필터)
previousCostAmount = 동일 계산을 직전 동일 길이 기간에 적용
costChangeRate = previous=0 이면 null(FE는 '신규'), 아니면 (current-previous)/previous*100
forecastCostAmount:
   HW    = 기간 말까지의 결정적 계산값
   Cloud = 경과일 일평균 × 기간 총일수(선형 외삽)
```

> 🔴 **`costChangeRate`의 previous=0 분모 주의.** 신규 취득 자산·신규 리소스는 무한대가 된다. `null`로 내리고 FE는 "신규"로 표기.

### 6.2 HW의 Change rate가 0이 아닌 이유

정액법만 있으면 월 비용이 일정해 변화율이 항상 0이다. 실제 변동 요인은 넷 — 화면 해석에 필요하니 명시한다:
1. **정률법 자산의 연차 전환**(가장 큰 요인) — 미상각잔액 감소로 상각비 하락
2. 상각 완료(내용연수 도달) → 해당 자산 상각비 0으로 낙하
3. 신규 취득 / 자산 excluded
4. 유지보수 계약 금액 변경
5. **(추가)** §2.7 소급 재계산 — 파라미터 변경으로 과거·현재가 동시에 이동

### 6.3 costPriority 자동 산정 (결정 #6)

| 요소 | 조건 | 점수 | 필요 단계 |
|---|---|---|---|
| ~~예산 초과 위험~~ | ~~forecast > 매칭 예산~~ | ~~+40~~ | 🔴 **2026-08-04 철회** — 예산 미채택(§3.3). 이 요소는 산정에서 뺀다 |
| 증가 폭 | `>20%` +30 / `>10%` +15 | +30/+15 | M1 |
| 만료 임박 | `date_hw_expiry` 30일 내 +25 / 90일 내 +10 | +25/+10 | M1 |
| 최적화 후보 | idle·unattached·stopped·adjustment candidate | +20 | M3 |
| 운영 연결 누락 | owner 없음 또는 linked host 없음 | +10 | M1 |
| **비용 정보 누락** | 취득가액/취득일 없어 상각 불가 | **+15** | M1 |
| 금액 규모 | 전체 비용 상위 10% | +10 | M1 |

- `≥50 = high`, `≥25 = medium`, 나머지 `low`. **임계값은 상수로 분리**해 운영 중 조정.
- **M1에서는 M1 요소만으로 산정**하고, 응답에 `priorityBasis: ["change","expiry","link","missing_cost","amount"]`를 실어 무엇으로 판정했는지 드러낸다(M2·M3에서 요소가 늘면 점수가 올라가는 것이 정상임을 설명 가능하게).
- **"비용 정보 누락" 요소는 신규 추가다** — 목적이 "자산을 비용 측면에서 관리"인 이상, 비용을 모르는 자산이야말로 우선 검토 대상이다.

### 6.4 문서 지표 커버리지

| 화면 | 문서 지표 수 | M1(HW) | M2(+Dashboard) | M3(+Cloud) |
|---|---|---|---|---|
| Dashboard | 18 | — | 14 | 18 |
| HW Costs | 8 | **8** | 8 | 8 |
| Cloud Costs | 11 | — | — | 11 |
| Cloud Detail | 4 | — | — | 4 (`previousCostAmount`는 14일 제약 명시) |

---

## 7. API 계약 (신규 `cost/` 패키지)

기존 자산 9EP는 **건드리지 않는다**(계약 보존).

| # | Method · Path | 용도 | 단계 |
|---|---|---|---|
| 1 | ~~`GET /costs/summary`~~ → **`GET /costs/dashboard`** | 🔴 **2026-08-04 개정** — 예산·movement·allocation 대신 **지출 축** KPI/위젯/검토후보(§8.3). EP 1개로 통합 | M2 |
| 2 | ~~`GET /costs/trend`~~ | 🔴 **통합** — 향후 12개월 예상은 `/costs/dashboard` 응답에 포함(별도 EP 불필요) | M2 |
| 3 | ~~`GET /costs/review-queue`~~ | 🔴 **통합** — 검토 후보 테이블도 `/costs/dashboard` 응답에 포함(자산당 1행 + 복수 사유 태그) | M2 |
| 4 | `GET /costs/hw` | HW 비용 목록 + KPI + 위젯 | **M1** |
| 5 | `GET /costs/hw/{assetId}/depreciation` | 상각 스케줄 드릴다운 | **M1** |
| 6 | **`PATCH /costs/hw/{assetId}`** | **비용 정보 인라인 편집**(취득가액·취득일·**만료일**·상각방법·내용연수·유지보수/리스+주기) | **M1** |
| 7 | **`GET /costs/hw/incomplete`** | **비용 정보 미입력 자산 큐** | **M1** |
| 7a | **`GET /costs/hw/template`** *(2026-07-31 추가)* | **일괄 업로드 템플릿** — 자산 목록 프리필 CSV(UTF-8+BOM, raw attachment) | **M1** |
| 7b | **`POST /costs/hw/bulk-upload`** *(2026-07-31 추가)* | **비용 정보 일괄 업로드** — 파싱→검증(EP6과 단일 경로)→적용, 행 단위 커밋(부분 성공)+행별 결과 리포트 | **M1** |
| 8 | `GET /costs/cloud` | Cloud 목록 + KPI + 위젯 | M3 |
| 9 | `GET /costs/cloud/resources/{resourceId}` | Cloud Cost Detail | M3 |
| 10 | `GET /costs/export` | CSV 내보내기(현재 필터) | M4 |
| 11 | ~~`GET`·`PUT /settings/cost-budgets`~~ | 🔴 **철회** — 예산 미채택(§3.3·§8.7) | — |
| 12 | `POST /costs/cloud/sync` | 수동 수집 트리거 | M3 |

**EP 6 주의**: 비용 필드는 **사용자 소유 영역**이므로 기존 `Asset.updateUserOwned(...)`(`Asset.java:204`)를 재사용한다. 동기화가 덮지 않는다는 V6 편집 소유권 불변식을 그대로 따르며, **자산 활동 로그(`asset_activity`)에 변경 이력을 남긴다.**

**공통 쿼리 파라미터**: `periodStart`·`periodEnd`(기본=당월) · `platform` · `owner` · `deviceType` · `location` · `lifecycle` · `vendor` · `includeExcluded` · `depreciationMethod` · `costStatus`(complete|incomplete) · `awsAccountId` · `service` · `region` · `resourceState` · `priority` · `keyword` · `sortBy`·`sortOrder` · `offset`·`limit`

**권한**: 조회 = 인증 사용자. **편집(EP 6)·~~예산(11)~~·수집 트리거(12) = `AdminAccessChecker.requireAdmin`** — `@RolesGuarded`는 쓰지 않는다(admin 계정이 roleid NULL이라 막힌다. BE CLAUDE.md §3-2 🔴)

**응답 규약**: BE 실체는 `ApiResult<T>`(`common/response/ApiResult.java:19`) + `PaginationResponseDto<T>`(FE 쪽 타입명이 `TResponse`/`TResponseList`다 — 혼동 주의). 403은 HTTP 200 + body code 유지.

---

## 8. 화면 설계

### 8.1 IA (결정 #7)

```
/asset/cost                      → 3탭 컨테이너 (기본 Dashboard, M1 단계에선 HW)
  ?tab=dashboard | hw | cloud    → 탭 상태는 URL query   ⚠️ 로컬 useState 금지
/asset/cost/hw/:assetId          → 상각 스케줄 드릴다운
/asset/cost/cloud/:resourceId    → Cloud Cost Detail
```

- 🔴 **탭·필터·기간은 전부 URL query.** `App.tsx`가 `key=location.key`로 navigate마다 페이지를 리마운트하므로 로컬 state는 드릴다운 왕복에서 날아간다([[fe-page-remount-on-navigate]]).
- 🔴 **3단 경로는 `replacePathBreadcrumb` 필수** — Geo Maps에서 겪은 함정([[geo-maps-feature]]).

### 8.2 공통 헤더

기간 선택(당월/전월/최근 3개월/사용자 지정) · 검색 · 필터 칩 · 새로고침 · CSV 내보내기 · **`현재 상각 기준으로 산출된 값입니다` 안내**(§2.7)

### 8.3 Dashboard 탭 (M2) — 🔴 **2026-08-04 개정(2차: 지출 축)**

> 1차 개정에서 예산을 뺐고, **2차에서 화면 언어를 지출 축으로 재정렬**했다.
> 본질은 **"관리 중인 장비들의 비용을 추적·관리"** 이므로 회계 언어(장부가액·상각 완료)를 전면에 두지 않는다.
> 상세 근거·Codex 설계검토 반영 내역: `plan_cost-dashboard.md` §0·§2, `design-review_cost-dashboard.md`.

- **KPI**: 총 취득원가 · **이번 기간 총 자산비용** · 향후 12개월 예상 비용 · **연간 유지비(유지보수+리스)** · 비용 미입력
  - 🔴 `hwTotal`은 상각비가 **아니라** 상각+유지보수+리스의 **총합**이다. "상각비"로 부르면 거짓이 된다.
  - 🔴 **비현금(상각)과 현금성(유지보수·리스)을 화면에서 분리**한다. 총액 하나로 뭉치면 실제 나가는 돈이 안 보인다.
- **위젯**: 향후 12개월 월별 예상 비용(상각/유지보수/리스 구분) · 비용 구성 · 돈이 몰린 곳(분류별·소유자별)
  · **만료 현황(경과 / 30·60·90일 예정 — 분리)**
  - 🔴 M1 `expiryWindow`는 **경과분을 포함**한다. 그대로 "임박"으로 쓰면 오래전 만료 자산이 섞인다.
    경계: `today <= expiryDate <= today + 90d`.
- **검토 후보(테이블 1개로 통합)**: 자산당 **한 행 + 복수 사유 태그**, 총건수는 distinct 자산 기준.
  태그 = `비용 미입력` · **`상각 끝 · 유지비 지속`**(가장 행동 가능) · `만료 경과` · `만료 임박`.
  - ❌ **"상각·만료 불일치" 경고는 넣지 않는다.** `expiryDate`에 보증·리스 종료가 섞여 있어 **차이가 정상일 수 있다**.
    만료 유형(`expiryType`) 구분은 실무에 없어(사용자 확인) 만들지 않는다.
- **필터**: `deviceType`·`owner`·`lifecycle` 기본 노출 + `location`·`vendor`·`costStatus` 접기.
  모집단에 선적용 후 집계(M1 동일 · excluded 제외). **"n건 기준" 표시**. 기간은 필터 영역 안에.

**판정 규칙**

| 항목 | 규칙 |
|---|---|
| 상각 완료 | `depreciationStatus === 'completed'` — 🔴 "장부가 0"이 **아니다**. 기본 잔존가액 0원이 남아 0이 되지 않는다(`DepreciationCalculator.MEMO_VALUE`). 잘못 잡으면 완료 자산이 **0건**이 된다 |
| 장부가액 | 기간 말 값 → 화면 표기는 **"기준월 말 장부가액"**(기간 가변 화면에서 "현재"는 거짓) |
| `bookValue=null` | 장부가액 지표**에서만** 제외 + `n건 제외` 표시. 상각비·유지보수비까지 통째로 빼지 않는다 |
| 집계 제외 건수 | API가 지표별로 제공(`bookValueIncluded/ExcludedCount`, `expiryKnown/UnknownCount` 등) |

### 8.4 HW Costs 탭 (**M1 — 이 기능의 본체**)

- **KPI**: HW total · Change rate · Forecast · Expiry exposure · **비용 정보 미입력 N건**
- **위젯**: Expiry window(30/60/90일) · Lifecycle cost mix(도넛) · Spend by owner(도넛) · **상각방법 구성**(도넛: 정액/정률/상각완료/상각불가) ← 문서에 없는 추가. 상각을 1급 개념으로 올린 결과
- **테이블 `Renewal candidates`**: 갱신·교체 후보 Top N
- **메인 테이블 `자산별 비용`**: Asset · 기기유형 · 소유자 · 위치 · 라이프사이클 · 만료일 · **취득가액 · 취득일 · 상각방법 · 내용연수 · 당기 상각비 · 상각누계액 · 장부가액** · 유지보수 · 리스 · 합계 · 연결 Host · 우선순위
- **🆕 인라인 편집 (결정 #10)**: 취득가액·취득일·상각방법·내용연수·유지보수/리스+주기를 **행에서 바로 수정**(EP 6). 저장 즉시 그 행의 상각비가 재계산돼 갱신된다. 권한 없는 사용자는 읽기 전용
- **🆕 미입력 큐 (결정 #10)**: `비용 정보 없는 자산 N건` 필터 칩 → 상각 불가 자산만 모아 보여주고 사유(취득가액 없음 / 취득일 없음 / 파싱 실패)를 표시. **여기가 데이터를 채우는 주 동선이다**
- **드릴다운 `/asset/cost/hw/:assetId`**: 연차별 상각 스케줄 표 + 장부가액 추이 차트 + 파라미터 출처 표시 + **[자산 상세 열기] [비용 정보 수정]**

### 8.5 자산 도메인 왕복 연결 (목적 부합 — 신규)

비용 화면이 자산 관리의 일부로 작동하려면 양방향이어야 한다:
- 자산 상세의 `Cost information` 그룹에 **[비용 상세 보기]** → `/asset/cost/hw/:assetId`
- 상각 드릴다운 → **[자산 상세 열기]**, **[비용 정보 수정]**(자산 편집 모달의 Cost 섹션으로 직행)
- HW 목록의 `상각 불가` 행 → 클릭 시 인라인 편집 활성화(모달 왕복 없이)
- 필터축은 자산 목록과 어휘를 공유한다(deviceType·owner·lifecycle·location). coverage·deployment는 비용 판단에 쓰이지 않아 **의도적으로 제외**한다

### 8.6 Cloud Costs 탭 / Cloud Cost Detail (M3)

문서 §Cloud Costs 그대로. KPI 5종 + 위젯 5종 + `Adjustment candidates` + `AWS cost drivers`. Detail은 헤더 메타(리소스 ID·계정·서비스·리전·상태·**단가**) + 비용/사용량 추이(**최근 14일** 명시) + usageType 구성 도넛 + 라인아이템 표 + 관련 정보(연결 자산·Problem·소유자). 미구성 시 안내 빈 상태(§5.2).

### 8.7 ~~예산 설정 화면~~ (M2) — 🔴 **2026-08-04 철회**

예산 미채택에 따라 **이 화면은 만들지 않는다**(§3.3·§8.3 참조). 설정 메뉴에 항목을 추가하지 않는다.

<details><summary>철회된 원안</summary>

- 위치: **설정 > 비용 예산**(신규)
- 월 선택 + 전체/HW/Cloud 예산 + 소유자별 예산 행 추가·삭제 + 다음 달 복사
- 관리자만 편집, 일반 사용자 조회

</details>

### 8.8 기기분류 관리 화면 확장 (M1)

`설정 > 기기분류 관리`에 **기본 상각방법 · 기본 내용연수** 2컬럼 추가. **저장 시 `영향받는 자산 N건 · 과거 기간 수치도 소급 반영됩니다` 경고**(§2.7).

### 8.9 자산 편집 폼 개선 (M1)

- 비용 5필드를 **`InputNumber`로 교체**(§1.3-A 해소) + 상각 파라미터 3필드·주기 2필드 추가
- 날짜 3키(`date_hw_purchase`·`date_hw_install`·`date_hw_expiry`)를 상세 필드그룹·폼에 **노출**(§1.3-B 해소). zabbix 자산은 읽기전용(동기화 소유), custom 자산은 입력 가능
- "계산값 사용 / 직접 입력" 토글(§2.6)

### 8.10 차트

기존 ECharts 스택. `dataviz` 스킬 기준, 기존 팔레트 재사용.

---

## 9. 교차 관심사

- **i18n**: `cost.*`·`depreciation.*` 신규 키를 **en/kr 양쪽**에(⚠️ kr.json 누락이 반복 사고 지점). 기존 `asset_cost.*` 키 재사용
- **금액 포맷**: 통화기호 + 천단위. **⚠️ `formatBytes` 계열 금지**([[fe-traffic-bps-not-bytes]]와 같은 부류의 사고)
- **테이블**: `DmoveTable` + `useTableColumns`. 🔴 **`loading` prop 필수** — 안 넘기면 무한 스피너([[fe-dmovetable-loading-spinner]])
- **BE 규약**: `cost/` 수직 분할 패키지. Zabbix 직접 호출 금지(인벤토리는 `InventoryPort` 경유). Flyway는 **새 파일로만**
- **감사**: 비용 편집(EP 6)은 `asset_activity`에 기록 — "누가 언제 취득가액을 바꿨나"가 관리의 일부다
- **성능**: 자산 전량 상각 계산 = 자산 수 × 상각월수 루프. 76대 규모에선 무시할 수준. 수천 대로 커지면 기간별 결과를 Redis 캐시(`RedisClientService`)

---

## 10. 구현 단계

| M | 범위 | 산출물 | 선행 |
|---|---|---|---|
| **M1** | **상각 엔진 + HW 탭 + 입력 동선** | V17(기기유형 기본값 + 상각률표), `cost_data` 스키마·검증(+`expiry_date`), **숫자/날짜 정규화 유틸**, 상각 계산기 + 단위테스트(정액/정률/월할/기본 잔존가액/수동 오버라이드/§2.8 엣지 전건), EP 4·5·6·7 + **7a·7b(일괄 업로드 — 2026-07-31 추가: dev 실측 취득가액 0%라 건별 손입력만으로는 목적 달성 불가)**, HW 탭 + **인라인 편집 + 미입력 큐** + 드릴다운, 자산 폼 개선(InputNumber·날짜 3키·상각 파라미터), 기기분류 화면 필드 추가 + 소급 경고, 자산↔비용 왕복 링크 | 없음 — **바로 착수 가능** |
| **M2** | **Dashboard 탭(지출 축)** — 🔴 2026-08-04 개정 | **마이그레이션 없음**(예산 미채택). `GET /costs/dashboard` 1개로 통합(EP 1·2·3 흡수, 11 철회), Dashboard 탭, priority에서 예산 요소 제거 | M1 |
| **M3** | Cloud | V19(캐시), costexplorer SDK + 수집 배치 + 스케줄러 job, EP 8·9·12, Cloud 탭 + Detail | **AWS 자격증명(`ce:*`)**, 통화 정책(§4) |
| **M4** | 마감 | CSV export(EP 10), 우선순위 임계값 튜닝, 문서 기능요구 18건 대조, E2E | M1~M3 |

각 M은 `fullstack-feature` 스킬(be-engineer → api-contract-sync → fe-engineer → integration-qa → functional-qa)로 수행한다.

---

## 11. 리스크 · 미확정

| # | 항목 | 영향 | 대응 |
|---|---|---|---|
| 1 | 🔴 **취득가액·취득일·만료일 데이터 공백** | 상각 계산 입력 자체가 없어 HW 탭이 빈 화면 | **착수 전 dev DB 실측 필수** — `cost_data.purchase_cost`, inventory `date_hw_purchase`·`date_hw_expiry` 각각 채워진 자산 수. 결정 #10의 인라인 편집·미입력 큐가 이미 대응책이지만, 공백률이 높으면 M1에 엑셀 일괄 업로드를 추가 검토 |
| 2 | 🔴 **기존 `cost_data`가 문자열** | 파싱 실패 시 조용한 계산 제외 | §3.1 정규화 규칙 + 실패분을 미입력 큐로 노출(사용자가 고치는 경로 확보) |
| 3 | **소급 재계산 정책의 부작용** | 과거 시점 보고서와 숫자 불일치 | §2.7 — 정책 선언 + 화면 명시 + 변경 시 경고. 회계 대사 요구가 생기면 월 마감 스냅샷으로 승격 |
| 4 | 법정상각률표 정확성 | 세무 자료와 숫자 불일치 | DB 테이블로 분리(§3.2) + 회계팀 1회 검증. 표 범위 밖 내용연수는 입력 차단 |
| 5 | AWS 자격증명 미확보 | M3 착수 불가 | M1·M2가 독립이라 **HW는 막히지 않음**. 배치는 disabled 시드 |
| 6 | `WithResources` 14일 제약 | 리소스 단위 전월 대비 불가 | grain 분리(§3.4) + 화면 명시. 필요 시 CUR 2.0 검토 |
| 7 | 통화·환율 | Total cost 합산 근거 | §4 가정으로 진행, M3 착수 전 확정 |
| 8 | 예산 `scope_key=owner_name` | 소유자명 변경 시 예산 연결 끊김 | 소유자 변경 경고. `owner_user_id`(V6 예약) 승격 시 정리 |
| 9 | Cost Explorer 과금 | 요청당 $0.01 | 일 1회 배치 + DB 캐시. 화면은 AWS 직접 호출 안 함 |
| 10 | 유지보수비 주기 미지정 | 연액/월액 해석 | `yearly` 가정 + 화면 안내 + 폼에서 주기 명시 입력 |

---

## 12. 개정 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-30 | 초안 — Confluence 기획 + 사용자 결정 #1~#8 반영 |
| 2026-07-31 | **M1 마무리 보강 2건(구현 반영)** — ① **비용 정보 일괄 업로드 신설**(EP 7a `GET /costs/hw/template`·7b `POST /costs/hw/bulk-upload`): 런타임 QA 실측에서 dev 자산 74건 전부 취득가액 0% — 건별 손입력만으로는 목적("자산을 비용 측면에서 관리") 달성 불가. 템플릿은 자산 목록 프리필 CSV(UTF-8+BOM·RFC4180 — 선행 내보내기 관례 부재로 M1 관례 수립), 검증은 EP6과 단일 경로(CostValueParser+CostDataValidator 재사용), 행 단위 커밋(부분 성공)+행별 결과 리포트, 미존재/excluded 행은 실패로 리포트. ② **만료일 입력 경로 신설**(설계 누락 결함): 만료일이 화면·API 어디에도 입력 불가라 Expiry window·exposure·Renewal candidates가 구조적으로 영구 0이었다 → `cost_data.expiry_date` 추가(§2.1 폴백 체인: 수동 최우선 → inventory `date_hw_expiry` — zabbix inventory는 동기화 소유라 사용자 입력은 cost_data에), 화이트리스트·PATCH·업로드 템플릿·만료 지표·costPriority 만료 요소 연결 |
| 2026-07-30 | **M1 구현 중 정정** — §2.3 정률법 종료 조건 보완: "잔액 ≤ 1,000원"만으로는 스케줄이 내용연수를 ~3배 초과 연장되는 누락 발견(상각률표는 내용연수 경과 시 잔존 ~5% 전제) → **최종 연차에 기초 미상각잔액 − 1,000원 전액 월할 정산 후 종료**로 확정(결정 #3 잔존가액 0 원칙에 정합). 종료 = min(내용연수 도달, 잔액 ≤ 1,000원). BE `DepreciationCalculator` 반영·테스트 검증(5년 정률 = 정확히 60개월) |
| 2026-07-30 | **개정(fable 5 검토 반영)** — HIGH 3건 해소: ① 취득일/만료일 원천 실태 정정 + 폴백 체인·파싱 규칙 확정(§1.3-B, §2.1) ② `cost_data` 문자열 실태 반영 + 정규화·검증 설계(§1.3-A, §3.1) ③ **소급 재계산 정책 신설**(§2.7, 결정 #9). 그 외: 정률법 월할 공식을 취득월 기준 연차로 일원화(§2.3), 상각률표를 V18→**V17**로 이동(시퀀싱 모순 해소), HW 모집단·platform 파생 규칙 명문화(§6.1, 결정 #11), **인라인 편집·미입력 큐 M1 승격**(§8.4, 결정 #10), 자산↔비용 왕복 연결 신설(§8.5), 엣지케이스 표 신설(§2.8), 수동 오버라이드 상호작용 확정(§2.6), priority에 "비용 정보 누락" 요소 추가·M1 부분 산정 명시(§6.3), 예산 `period` 단일 컬럼화(§3.3), `TResponse`→`ApiResult` 정정(§7) |

---

## 13. 참고

- 기획: Confluence `01-1. Cost (비용 모니터링) - 컨셉` (ZM/37190828047)
- 데모: https://moveseye-demo.vercel.app/costs (Notion 백엔드 목업 — 참고용)
- 선행 설계: `_workspace/features/assets/assets-design/apply_design_assets-cost-maps.md`(§Phase2) · `_workspace/features/assets/assets-core/devdesign_assets-core.md`
- 관련 메모리: [[assets-core-devdesign]] · [[device-classification-feature]] · [[aws-cred-single-source]] · [[fe-page-remount-on-navigate]] · [[fe-dmovetable-loading-spinner]] · [[geo-maps-feature]]
