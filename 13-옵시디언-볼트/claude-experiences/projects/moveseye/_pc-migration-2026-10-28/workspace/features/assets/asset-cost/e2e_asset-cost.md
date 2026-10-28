# E2E — 자산 비용(Cost) M1 런타임 행위 검증

> 수행: functional-qa · 2026-07-30 · **앱 실제 기동** (BE Spring :3000 + FE Vite :5173 + Chrome)
> 대상 DB: **실 dev DB** `localhost:5432/dmove` (postgres/<dev-pw>) · 프로필 없음(기본)
> 입력: `_workspace/features/assets/asset-cost/contract_asset-cost.md` · `_workspace/features/assets/asset-cost/devdesign_asset-cost.md` · `_workspace/features/assets/asset-cost/qa_asset-cost.md`
> 재현 헤더: 모든 API 호출에 `x-visitor-id: qa-cost-e2e-001` + HttpOnly 쿠키(`admin` / `<dev-admin-pw>`)

---

## ⚠️ 이 검증이 실 dev DB에 남긴 변경 (전부 명시)

| 변경 | 상태 |
|---|---|
| **Flyway V14·V15·V16·V17이 실 dev DB에 적용됨** (기존 스키마 버전 V13 → **V17**) | 되돌리지 않음(의도된 스키마 전진). V17은 추가 전용·멱등 |
| 임시 비관리자 계정 `__qa_cost_e2e_user__`(id 110) 생성 | **삭제 완료** (`DELETE /users`) |
| 테스트 자산 `__QA_COST_E2E_TEST_ASSET__`(id 78) 생성 | **하드 삭제 완료** (`delete from asset where id=78`, asset_activity CASCADE) |
| 실자산 id 1(10.220.0.73)에 비용 데이터 입력 | **`cost_data = {}` 로 원복 완료** (`clearFields` 8필드) |
| 실자산 id 66(10.220.0.10)에 취득가액 입력 | **`cost_data = {}` 로 원복 완료** |
| 기기분류 `server` 기본값 5년/정액 → 7년/정률 변경 | **5년/정액으로 원복 완료** (`updated_at`만 갱신 잔존) |
| `POST /assets/sync?mode=add_update` 실행 → **자산 1건 신규 추가(id 79 `test-chkim`)**, 1건 스냅샷 갱신 | 되돌리지 않음 — 실 Zabbix에 존재하는 호스트의 정상 미러이고, 삭제는 soft(excluded)뿐이라 되돌리는 쪽이 더 오염됨 |
| `asset_activity` 감사 로그 다수(테스트 편집분) | 자산 78분은 CASCADE 삭제, 자산 1·66분은 잔존(감사 로그 특성상 삭제하지 않음) |

**최종 확인**: 자산 전건 `cost_data = '{}'`, 기기분류 6종 전부 `straight_line`/5, 테스트 계정·자산 부재.

---

# 1. 🎯 실측 수치 (설계 리스크 #1 — "HW 탭이 첫날 쓸모 있는가")

> `GET /costs/hw?limit=100` · `GET /costs/hw/incomplete?limit=100` 1회 호출 결과 + DB 전수 대조.
> 기준 시점: 검증 착수 직후(테스트 데이터 투입 전).

## 1.1 모집단

| 항목 | 값 |
|---|---|
| `asset` 전체 | **75건** |
| excluded=true | **1건** (id 64 `lavence_pc`) |
| HW 탭 모집단(excluded 제외) | **74건** |
| source 분포 | zabbix 74 / custom 0 |
| platform 분포 | hw 74 / **cloud 0** (`cloud_data.resource_id` 보유 0건) |

## 1.2 🔴 상각 계산 가능 자산 — **0건 (0%)**

| 항목 | 건수 | 비율 |
|---|---|---|
| **취득가액(`purchase_cost`) 보유** | **0** | **0%** |
| 상각이 계산되는 자산(`depreciationStatus = active/completed`) | **0** | 0% |
| **`notApplicable`(상각 불가)** | **74** | **100%** |
| `notStarted` | 0 | — |

`widgets.depreciationMethodMix` = `{straightLine:0, decliningBalance:0, completed:0, notApplicable:74}`

## 1.3 상각 불가 사유 분포 (`incompleteReasons`)

| 사유 코드 | 건수 | 비고 |
|---|---|---|
| `purchase_cost_missing` (취득가액 없음) | **74 (100%)** | 상각 불가의 유일한 원인 |
| `purchase_cost_invalid` (파싱 실패) | **0** | 한글 단위·원문 오염 자체가 없음 |
| `purchase_cost_zero` | **0** | |
| `purchase_cost_negative` | **0** | |
| `acquisition_date_missing` (취득일 후보 전무) | **74 (100%)** | 상각 불가는 아니나 **큐에서 빠지지 않는 사유** |
| `acquisition_date_invalid` | 0 | |
| `depreciation_rate_missing` | 0 | |
| `warnings` (전 종류) | **0** | 데이터 품질 경고가 붙을 값 자체가 없음 |

DB 전수 확인: **`asset.cost_data`가 75건 전부 `'{}'`** (`cost_data ? 'purchase_cost'` = 0건, `maintenance_cost`·`lease_cost`도 0건).

## 1.4 🔴 취득일 — **74/74(100%)가 `created_at` 폴백(추정)**

| `acquisitionDateSource` | 건수 |
|---|---|
| `manual` (cost_data) | 0 |
| `inventory_purchase` (`date_hw_purchase`) | **0** |
| `inventory_install` (`date_hw_install`) | **0** |
| **`created_at` (등록일 추정)** | **74 (100%)** |

`acquisitionEstimated = true` **74건 전부** → 화면 전 행에 `취득일 추정` 뱃지.

**원인 실측 — Zabbix 인벤토리가 사실상 비어 있다.** `zabbix_data->'inventory'`에 실제로 존재하는 키를 전수 집계한 결과:

| 인벤토리 키 | 보유 자산 수 |
|---|---|
| `name` | 35 |
| `os` | 34 |
| `location_lat` / `location_lon` | 7 / 7 |
| `serialno_a` | 2 |
| `model` | 2 |
| `software` | 2 |
| `asset_tag` | 1 |
| **`date_hw_purchase` / `date_hw_install` / `date_hw_expiry`** | **0 / 0 / 0** |
| **`location` / `vendor`** | **0 / 0** |

`inventory_mode`: 자동(1) 38건 · 수동(0) 4건 · **비활성(-1) 33건**.

## 1.5 유지보수·리스·만료

| 항목 | 건수 |
|---|---|
| 유지보수 금액 보유 | **0** |
| 리스 금액 보유 | **0** |
| 만료일(`expiryDate`) 보유 | **0** |
| 수동 연 상각액(`depreciation_cost`) 보유 | 0 |
| 잔존가액 수동값 보유 | 0 |

## 1.6 KPI / 위젯 실측값

```
kpi     = { hwTotal: 0, changeRate: null, forecast: 0, expiryExposure: 0, incompleteCount: 74 }
expiryWindow          = { within30: 0, within60: 0, within90: 0 }
lifecycleCostMix      = [ { name: "active", amount: 0 } ]
spendByOwner          = [ { name: null,     amount: 0 } ]
depreciationMethodMix = { straightLine: 0, decliningBalance: 0, completed: 0, notApplicable: 74 }
renewalCandidates     = []
GET /costs/hw/incomplete → total 74  (= 모집단 100%)
```

기기유형 분포: `null` 73건 · `server` 1건 → **기기분류 기본값 경로(`*Source: classification`)를 타는 자산은 1건뿐**, 나머지 73건은 전역 기본값(`default`).
우선순위: 전건 `medium`(score 25, basis `["link","missing_cost"]`).

## 1.7 판정

> **HW 탭은 현재 데이터로는 "빈 화면"이다.** KPI 4개 중 3개가 0/`null`, 위젯 4개가 전부 0, 표 74행이 모두 `상각 불가`·`취득일 추정`.
> 유효하게 동작하는 화면 요소는 **미입력 큐(74건 = 전량)** 하나뿐이며, 이 화면의 첫날 가치는 전적으로 **수기 입력 동선**에 달려 있다.
> 값 자체는 정확하다 — 계산 엔진·API·화면은 전부 정상 동작하며(§2~§5), 문제는 **입력 데이터가 0%**라는 것이다.

**후속 의사결정에 직접 물리는 세 가지 사실**

1. **인벤토리 자동 채움은 기대할 수 없다.** `date_hw_purchase`가 0건이라 "Zabbix 인벤토리에서 취득일을 끌어온다"는 폴백 2·3단계는 이 환경에서 **한 번도 발동하지 않는다**. 취득일은 100% 수기 입력이거나 등록일 추정이다.
2. **취득가액만 채워도 미입력 큐가 비지 않는다.** `acquisition_date_missing`이 74건 전부에 붙어 있고 이는 `incompleteReasons`에 실리므로, 취득가액을 전부 입력해도 KPI `비용 정보 미입력`은 **74건 그대로**다(런타임 실측: 자산 1건에 취득가액만 저장 → 사유가 `취득일 없음` 하나로 줄었을 뿐 큐에 잔류, KPI 74 유지). 큐를 0으로 만들려면 74건 전부에 **취득일까지** 수동 입력해야 한다. 설계 §5 표대로의 동작이지만, "미입력 큐를 비운다"는 운영 목표와 어긋난다 — 정책 재확인 대상.
3. **만료·교체 관련 지표는 전부 死지표다.** `expiryExposure`·`expiryWindow`·`renewalCandidates`는 `date_hw_expiry`(0건)에만 의존하며 **화면에서 입력할 수 없다**(비용 편집 폼에 만료일 필드 없음 → `PATCH /costs/hw` 화이트리스트에도 없음). Zabbix 인벤토리를 채우지 않는 한 영구히 0이다.

---

# 2. A. 기동 · 스키마 · 회귀

## A-1. V17 적용 — **PASS**

```
o.f.core.internal.command.DbMigrate : Current version of schema "public": 13
  → Migrating to "14 - asset linked hostid index"
  → Migrating to "15 - scheduler setting"
  → Migrating to "16 - scheduler run log"
  → Migrating to "17 - cost depreciation"
Successfully applied 4 migrations, now at version v17
```

| 검증 | 결과 |
|---|---|
| `device_classification.default_depreciation_method` | 존재 · `varchar` · DEFAULT `'straight_line'` ✅ |
| `device_classification.default_useful_life_years` | 존재 · `integer` · DEFAULT `5` ✅ |
| `depreciation_rate` 행 수 | **14행** (2~15년) ✅ |
| 상각률 값 | 2:0.7770 3:0.6320 4:0.5280 5:0.4510 6:0.3940 7:0.3490 8:0.3130 9:0.2840 10:0.2590 11:0.2390 12:0.2210 13:0.2060 14:0.1930 15:0.1820 — **설계 §2.3 표와 전건 일치** ✅ |
| 기존 6개 기기분류 행 | 전부 `straight_line`/5로 백필 ✅ |

> ⚠️ V14~V16도 함께 적용됐다(실 dev DB가 V13에 머물러 있었음). 전부 추가 전용이며 기동·기존 화면에 이상 없음.

## A-2. 기존 기능 회귀 — **PASS**

| 흐름 | 결과 |
|---|---|
| `GET /assets?limit=2` | 200, 정상 페이로드 |
| `GET /assets/1` (상세) | 200, zabbixData/inventory 정상 |
| `GET /assets/summary` | 200 `{total:75, zabbixCount:75, excludedCount:1, ...}` |
| `GET /settings/device-classifications` | 200, **기존 9필드 불변 + 신규 2필드만 추가** (계약 §6.1대로) |
| FE `/asset/list` · `/asset/list/{id}` | 렌더 정상, 무한 스피너 없음 |
| FE 기기분류 관리(설정) | 소급 경고 흐름 포함 정상 (E절 참조) |
| FE 홈 / 로그인 / 사이드바 | 정상 |

---

# 3. C. 상각 계산 정확성 (런타임 손계산 대조)

## C-1. 실데이터 상각 자산 — **0건이라 대조 대상 없음** → 실자산에 값을 넣어 대조

실 dev DB에 상각이 계산되는 자산이 하나도 없어(§1.2), **실자산 id 1(10.220.0.73)** 에 값을 넣고 대조한 뒤 원복했다.

입력: 취득가액 4,500,000 / 취득일 2024-03-01 / 내용연수 4년 / 정액법(기본값) / 유지보수 120,000 월액 / 리스 600,000 연액 · 조회기간 2026-07

| 항목 | 손계산 | API 응답 | 판정 |
|---|---|---|---|
| 월 상각비 | 4,500,000 ÷ 48 = **93,750** | 93,750 | ✅ |
| 상각누계액(2024-03~2026-07, 29개월) | 93,750 × 29 = **2,718,750** | 2,718,750 | ✅ |
| 장부가액 | 4,500,000 − 2,718,750 = **1,781,250** | 1,781,250 | ✅ |
| 기간 유지보수 | 월액 그대로 **120,000** | 120,000 | ✅ |
| 기간 리스 | 600,000 ÷ 12 = **50,000** | 50,000 | ✅ |
| 합계 | **263,750** | 263,750 | ✅ |
| 드릴다운 연차표 | 2024=10개월(부분) / 2025~2027=12개월 / 2028=2개월(부분), 최종 장부가 **1,000** | 동일 | ✅ |

**PASS** — 취득월 산입·월할·부분연도 묶음·기본 잔존가액 정산 전부 설계 §2.2와 일치.

## C-2. 정률법 테스트 자산 — **PASS**

테스트 자산 id 78 · 취득가액 10,000,000 / 취득일 2026-01-15 / **정률법** / 5년
`GET /costs/hw/78/depreciation`

| 검증 항목 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 스케줄 길이 | **정확히 60개월** | `months.length = 60` (2026-01 ~ 2030-12) | ✅ |
| 최종 장부가액 | **1,000원** | 마지막 월 `bookValue: 1000` | ✅ |
| 총 상각액 | 10,000,000 − 1,000 = 9,999,000 | 월 상각비 합 **9,999,000** | ✅ |
| `decliningRate` | 0.451 (DB 상각률표) | `0.451` | ✅ |
| 1차 연차 월 상각비 | 10,000,000×0.451÷12 = **375,833** | 375,833 | ✅ |
| **최종(5차) 연차 월 상각비 > 직전(4차)** | 전액 정산 특성 | 4차 **62,189** → 5차 **75,618** (증가) | ✅ |

연차별(fiscalYearIndex) 실측: 1차 375,833/월(합 4,509,996) → 2차 206,333(2,475,996) → 3차 113,277(1,359,324) → 4차 62,189(746,268) → **5차 75,618(907,416, 기초 908,416 − 하한 1,000을 12개월 균등 정산)**.
드릴다운 연차 표(역년 묶음)에도 2030년 `annualDepreciation 907,416`이 그대로 노출되며, 급증이 화면에서 확인된다(계약 §8 "버그 아님" 그대로).

## C-2b. 정액법 전환 — **PASS**

같은 자산을 `PATCH {"depreciationMethod":"straight_line"}` 로 전환

| 검증 | 결과 |
|---|---|
| 월 상각비 일정 | distinct 값이 **`[166667, 165647]`** — 59개월 동일(166,667) + 마지막 달 정산(165,647) ✅ |
| 손계산 | 10,000,000÷60 = 166,666.67 → 166,667 · 마지막 = 10,000,000 − 166,667×59 − 1,000 = **165,647** ✅ |
| 총합 / 최종 장부가 | 9,999,000 / **1,000** ✅ |
| `decliningRate` | `null` (정액법) ✅ |

## C-3. 수동 오버라이드(§2.6) — **PASS (경고 1건 오탐 — F-1 참조)**

| 단계 | 요청 | 결과 | 판정 |
|---|---|---|---|
| 수동 연액 설정 | `PATCH {"depreciationCost":1200000}` | `depreciationSource: "manual"`, 기간 상각비 **100,000**(=1,200,000÷12), 누계 700,000(7개월), 장부 9,300,000 | ✅ |
| 스케줄 | — | 100개월(2026-01~2034-04), 최종 장부 **1,000**, 마지막 역년 `monthCount 4 / isPartialYear true` | ✅ (§2.6 "취득가액 소진까지") |
| 계산값 복귀 | `PATCH {"clearFields":["depreciationCost"]}` | `depreciationSource: "calculated"`, 기간 상각비 **166,667**로 복귀, `costInput.depreciationCost: null` | ✅ |

---

# 4. D. 쓰기 흐름 (결정 #10)

| # | 검증 | 결과 | 판정 |
|---|---|---|---|
| D-1 | `PATCH /costs/hw/{id}` 응답이 **재계산된 그 행** | 취득가액 변경 즉시 `periodDepreciation`·`accumulatedDepreciation`·`bookValue`·`periodTotalCost` 전부 새 값. `?periodStart=&periodEnd=` 컨텍스트도 반영 | ✅ |
| D-2 | `asset_activity` 기록 | 매 저장마다 `{action:"updated", actorName:"admin", changes:[{field:"costData", before, after}]}` 1행. before/after가 cost_data JSON 원문 diff | ✅ |
| D-3 | 화이트리스트 밖 키 | `{"bogusField":1}` → **HTTP 200** + `{"status":"error","code":400,"errorCode":"COST_UNKNOWN_FIELD"}` | ✅ |
| D-3b | 미지 `clearFields` 키 | `{"clearFields":["nopeField"]}` → 동일하게 `COST_UNKNOWN_FIELD` | ✅ |
| D-4 | **동기화가 사용자 입력을 덮지 않는가** | 아래 별도 | ✅ |
| D-5 | 비관리자 403 | **검증 불가** — 아래 별도 | ⚠️ |

## D-4. 동기화 불변식(V6 편집 소유권) — **PASS (HIGH 회귀 없음)**

```
1) PATCH /costs/hw/1  {purchaseCost:4500000, acquisitionDate:"2024-03-01", usefulLifeYears:4,
                       maintenanceCost:120000, maintenanceCostPeriod:"monthly",
                       leaseCost:600000, leaseCostPeriod:"yearly", currency:"KRW"}
2) POST /assets/sync  {"mode":"add_update"}      → {added:1, updated:1, total:2}
3) GET /costs/hw?keyword=10.220.0.73&periodStart=2026-07&periodEnd=2026-07
```

동기화 **후** 응답:
```json
{"id":1,"purchaseCost":4500000,"acquisitionDate":"2024-03-01","usefulLifeYears":4,
 "periodDepreciation":93750,"periodMaintenanceCost":120000,"periodLeaseCost":50000,
 "periodTotalCost":263750,
 "costInput":{"purchaseCost":4500000,"acquisitionDate":"2024-03-01","usefulLifeYears":4,
              "maintenanceCost":120000,"maintenanceCostPeriod":"monthly",
              "leaseCost":600000,"leaseCostPeriod":"yearly","currency":"KRW",...}}
```
**전 필드 동일. 사용자 비용 입력이 `add_update` 동기화에 살아남았다.**

> `mode` 없이 호출하면 `ASSET_INVALID_SYNC_MODE`(HTTP 200 + code 400) — 유효값은 `add_only` / `add_update`.

## D-5. 권한(비관리자 403) — ❌ **검증 불가 (환경 제약)**

- 실 dev DB의 비관리자 계정(`guest`·`chanho`·`Admin`)은 전부 **ZABBIX 플랫폼 + `password IS NULL`** 이라 직접 로그인 불가.
- `POST /users`로 DMOVE 전용 USER(`__qa_cost_e2e_user__`, id 110)를 만들어 로그인은 성공(`userRole: "USER"`)했으나, **모든 API가 401 `INVALID_TOKEN`** 으로 막혀 `AdminAccessChecker`(403 분기)까지 도달하지 못했다.
- 원인: `JwtAuthFilter.resolveAuthToken`(`auth/security/JwtAuthFilter.java:97-137`)이 **ADMIN이 아닌 계정에는 Zabbix API 토큰을 요구**한다. Zabbix 미연동 계정은 토큰을 얻지 못해 `UnauthorizedError`로 떨어진다.
- **cost 고유 문제가 아님을 확인**: 같은 토큰으로 `/users/my-profile`·`/assets` 도 동일하게 401. **선재하는 전역 동작**이다.
- 정적 근거는 integration-qa P-7에서 이미 확인됨(403 → HTTP 200 + body code 403 → FE `error.forbidden` 토스트).
- **후속 필요**: Zabbix 연동 USER 계정(실 비밀번호)이 확보되면 재검증.

---

# 5. E. 기기분류 기본값 + 소급 재계산

## E-1. `cost-impact` — **PASS**

| 요청 | 응답 | 실제 DB | 판정 |
|---|---|---|---|
| `GET /settings/device-classifications/1/cost-impact` (server) | `{code:"server", affectedAssets:1, totalAssets:2}` | server 자산 2건(id 78·79), 그중 78은 자산별 오버라이드(방법+연수) 보유 → 기본값을 실제로 쓰는 건 79뿐 | ✅ |
| id 3 (security) | `{code:"security", affectedAssets:1, totalAssets:1}` | Zabbix server 1건, 오버라이드 없음 | ✅ |
| id 9999 | HTTP 200 + `DEVICE_CLASSIFICATION_NOT_FOUND` | | ✅ |
| 자산 78의 오버라이드를 `clearFields`로 제거 후 재조회 | `affectedAssets: 1 → 2` | 즉시 반영 | ✅ |

## E-2. 소급 재계산(설계 §2.7) — **PASS (정책대로 과거 기간도 바뀐다)**

자산 78의 오버라이드를 비워 기기분류 기본값을 따르게 한 뒤, `server` 기본값을 변경:

| 조회 기간 | 변경 전 (5년 / 정액) | **변경 후 (7년 / 정률)** | 원복 후 |
|---|---|---|---|
| **2026-03 (과거)** | 상각비 166,667 · 누계 500,001 · 장부 9,499,999 | **290,833 · 872,499 · 9,127,501** | 166,667 · 500,001 · 9,499,999 |
| 2026-07 (현재) | 166,667 · 1,166,669 · 8,833,331 | **290,833 · 2,035,831 · 7,964,169** | — |
| `usefulLifeSource`/`depreciationMethodSource` | `classification` | `classification` | `classification` |

손계산 대조: 10,000,000 × 0.349(7년 정률) ÷ 12 = **290,833** ✅
**과거 기간(2026-03)의 수치가 실제로 바뀌었다** — 설계 §2.7 "항상 현재 파라미터 기준 재계산" 정책이 런타임에서 그대로 성립한다. 화면에도 `현재 상각 기준으로 산출된 값입니다(기준시각)` 안내가 표시된다.

## E-3. 기기분류 검증·시스템 행 — **PASS**

| 요청 | 결과 |
|---|---|
| `PUT` `defaultUsefulLifeYears: 16` | HTTP 200 + `COST_INVALID_USEFUL_LIFE` ✅ |
| `PUT` `defaultUsefulLifeYears: 1` | HTTP 200 + `COST_INVALID_USEFUL_LIFE` ✅ |
| `PUT` `defaultDepreciationMethod: "bogus"` | HTTP 200 + `COST_INVALID_DEPRECIATION_METHOD` ✅ |
| `is_system: true` 행(server)의 상각 기본값 수정 | **허용됨** (계약 §6.2대로) ✅ |

> ℹ️ `PUT`은 `name`이 `@NotBlank` 필수다(상각 필드만 보내면 Bean Validation 실패 `"공백일 수 없습니다"`). 계약 §6.2의 "미지정=미변경"은 상각 2필드에만 해당한다 — 계약서 문구 보강 권고(FE는 폼 전체를 보내므로 영향 없음).

---

# 6. F. 에러 · 경계

| # | 케이스 | 응답 | 판정 |
|---|---|---|---|
| F-1 | `periodStart=2026-08&periodEnd=2026-03` | **HTTP 200** + `{"status":"error","code":400,"errorCode":"COST_INVALID_QUERY_PERIOD"}` | ✅ |
| F-1b | 잘못된 형식 `periodStart=2026-13` | 동일하게 `COST_INVALID_QUERY_PERIOD` | ✅ |
| F-1c | `/costs/hw/incomplete`에 역전 기간 | HTTP 200 정상 응답(기간 파라미터 무시) | ✅ 계약 §2대로 |
| F-2 | `GET /costs/hw/999999/depreciation` | HTTP 200 + `ASSET_NOT_FOUND` | ✅ |
| F-2b | `PATCH /costs/hw/999999` | HTTP 200 + `ASSET_NOT_FOUND` | ✅ |
| F-3 | `includeExcluded` 모집단 전환 | 미지정/`false` → **total 75** · `true` → **total 76**(excluded id 64 회색 행 등장). **KPI `incompleteCount`는 두 경우 모두 74로 불변** | ✅ 계약 §1대로 |
| F-3b | `/costs/hw/incomplete?includeExcluded=true` | total 74 (excluded 미포함 고정) | ✅ 계약 §2대로 |

## PATCH 검증 에러 전수 (전부 HTTP 200 + body code 400)

| 요청 | `errorCode` |
|---|---|
| `{"purchaseCost":-5}` | `COST_INVALID_AMOUNT` ✅ |
| `{"usefulLifeYears":20}` | `COST_INVALID_USEFUL_LIFE` ✅ |
| `{"depreciationMethod":"sum_of_years"}` | `COST_INVALID_DEPRECIATION_METHOD` ✅ |
| `{"acquisitionDate":"15-01-2026"}` | `COST_INVALID_DATE` ✅ |
| `{"maintenanceCostPeriod":"quarterly"}` | `COST_INVALID_COST_PERIOD` ✅ |
| `{"bogusField":1}` / `{"clearFields":["nopeField"]}` | `COST_UNKNOWN_FIELD` ✅ |

## 필터 · 정렬 (API)

| 쿼리 | 결과 | 판정 |
|---|---|---|
| `sortBy=purchaseCost&sortOrder=desc` | 10,000,000 → 4,500,000 → null들 (숫자 내림차순) | ✅ |
| `sortBy=purchaseCost&sortOrder=asc` | null들 먼저 → 4,500,000 → 10,000,000 | ✅ |
| `costStatus=complete` / `incomplete` | total 2 / 74 | ✅ |
| `depreciationMethod=straight_line` / `declining_balance` | 76 / 0 (**해석된** 방법 기준 — 취득가액 없는 행도 포함) | ✅ 계약 §1대로 |
| `deviceType=server` | total 2, KPI가 필터 모집단 기준으로 축소(166,667) | ✅ |
| `keyword=ZaBbIx` | total 4 (대소문자 무시 부분 일치) | ✅ |
| `priority=low` | total 2 | ✅ |
| 3개월 기간 `2026-05~2026-07` | `period.previousStart/End = 2026-02/2026-04` (직전 동일 길이), `changeRate: 0`(직전 기간 금액 동일 — 손계산 일치) | ✅ |
| `spendByOwner` | `[{name:null, amount:791250}, {name:"qa-e2e", amount:500001}]` 내림차순 | ✅ |

---

# 7. G. FE 화면 (Chrome 실브라우저)

> 🟢 **과거의 "Chrome MCP가 localhost 탭을 못 연다" 이슈는 이번에 재현되지 않았다.** `http://localhost:5173` 로그인부터 전 화면 조작까지 정상 수행됐다.

| # | 검증 | 결과 | 판정 |
|---|---|---|---|
| G-1 | `/asset/cost` 3탭 | `대시보드` → "비용 대시보드는 예산 기능과 함께 제공될 예정입니다(M2)." · `클라우드 비용` → "...AWS Cost Explorer 연동과 함께 제공될 예정입니다(M3)." · `HW 비용` → 데이터 렌더 | ✅ |
| G-1b | HW 탭 KPI ↔ API 일치 | 화면 `₩430,417` = API `kpi.hwTotal 430417` (테스트 데이터 투입 상태) | ✅ |
| G-2 | **무한 스피너 없음** | 목록·드릴다운·미입력 큐 전부 `.ant-spin-spinning = 0`, `.ant-skeleton = 0` | ✅ |
| G-3 | 드릴다운 + 브레드크럼 | `/asset/cost/hw/1` · 브레드크럼 **홈 / 자산 / 비용 / HW / 10.220.0.73** (4단, `replacePathBreadcrumb` 정상 — 스켈레톤 잔류 없음) | ✅ |
| G-3b | **뒤로가기 시 기간·필터·탭 유지** | 복귀 URL `?tab=hw&periodPreset=custom&periodStart=2026-05&periodEnd=2026-07&costStatus=complete&limit=10&offset=0` 전부 보존, 헤더 `2026-05 ~ 2026-08` 및 KPI 재현 | ✅ |
| G-4 | 인라인 편집 → 그 행만 갱신 | 유지보수 120,000→200,000 저장 → 해당 행만 `₩600,000` / 합계 `₩1,031,250`로 교체, 다른 행 불변, 토스트 "비용 정보를 저장했습니다." | ✅ (단 KPI는 미갱신 — L-2) |
| G-5 | 미입력 큐 칩 → 사유 → 편집 동선 | KPI `미입력 자산 보기` → URL `costView=incomplete` → 사유 태그(`취득가액 없음`/`취득일 없음`) + 저장 원문 컬럼 → `비용 정보 입력` 모달(소급 경고 포함) → 저장 시 **큐 행이 실시간 갱신**(사유 1개로 축소, 저장 원문 `3000000` 노출) | ✅ |
| G-6 | 자산 폼에서 비용 저장 | 자산 수정 모달의 `비용 정보` 섹션(+소급 경고) → 저장 시 **별도 `costData` PATCH가 발생**(asset_activity에 자산 PATCH와 분리된 `costData` diff 2행), DB에 값 반영 | ✅ (단 화면 갱신 누락 — M-2) |
| G-7 | **i18n raw key 노출 0** | 목록·드릴다운·미입력 큐·편집 모달·자산 폼·대시보드/클라우드 탭·브레드크럼 전 화면에서 `cost.`/`depreciation.`/`asset.`/`common.` 패턴 **전건 0** | ✅ |
| G-8 | 상각 불가 자산 드릴다운 | `상각 불가` 태그 + `상각을 계산할 수 없습니다` + 사유 2개 + `표시할 상각 스케줄이 없습니다.` + 연차표 `데이터가 없습니다.` | ✅ |
| G-9 | 없는 자산 드릴다운 | `이 자산의 상각 정보를 찾을 수 없습니다.` + `비용 화면으로` 버튼 | ✅ |

---

# 8. integration-qa 이관 항목 판정 — **4건 전부 NOT REPRODUCED**

| 이관 항목 | 런타임 판정 | 근거 |
|---|---|---|
| **M-3** 금액 컬럼이 클라이언트 문자열 정렬로 뒤섞임 | ❌ **재현 안 됨** | 취득가액 헤더 정렬 실측 — DESC: `10,000,000 → 4,500,000`, ASC: `4,500,000 → 10,000,000` (문자열 정렬이면 정반대). 현재 소스 `CostHwTable.tsx`는 **전 컬럼이 `sorter`를 명시**(`serverSorter = true` 또는 `false`)하며 68-77줄에 이 함정을 막는 주석까지 있다 |
| **M-4** `depreciationMethod` 정렬 UI가 켜져 있음 | ❌ **재현 안 됨** | `CostHwTable.tsx:267-269` 상각방법 컬럼에 `sorter: false` 존재. 화면에서도 정렬 화살표 없음 |
| **M-1** 기간 역전 시 조용한 0원 화면 | ❌ **재현 안 됨** | URL로 `periodStart=2026-08&periodEnd=2026-03` 강제 주입 → FE가 **자동 정규화**해 `2026-03 ~ 2026-08`로 조회·표시(₩3,062,502, 손계산 일치). `useCostPeriod.ts:51 normalizeRange` + `CostPeriodHeader.tsx:70,86 disabledDate` **2중 방어** |
| **M-2** 자산 편집 모달 저장이 타 기간 캐시 오염 | ❌ **재현 안 됨** | 3개월 캐시 보유 상태에서 자산 폼으로 비용 저장 → 비용 탭 복귀 시 해당 행이 **3개월 기준값**(450,000 = 150,000×3), KPI 1,481,250 = 행 합과 일치. `useCost.ts:100-152`가 `matchesPeriod` predicate로 같은 기간만 교체하고 **period 미전달(자산 폼) 시 전체 무효화**하도록 이미 수정돼 있다 |
| **CostEditModal 연속 오픈 값 잔류** | ❌ 잔류 없음 | 다른 자산 모달을 열 때마다 제목·초기값이 정확히 교체됨(`destroyOnHidden` + `open` 가드 정상) |
| **정률 최종 연차 급증 표기** | ✅ 정상 표기 | 드릴다운 연차 표에 2030년 `₩907,416`이 그대로 노출(직전 연도 746,268 대비 증가) |

> integration-qa 보고서(2026-07-30 정적) 이후 FE에서 해당 4건이 이미 수정된 것으로 보인다.

---

# 9. 발견 사항

## [MEDIUM] M-1. `manual_exceeds_purchase` 경고가 수동 연액 자산 대부분에서 **오탐**으로 뜬다 — 책임: **BE**

**재현**
```bash
PATCH /costs/hw/{id}  {"depreciationCost": 1200000}     # 취득가액 10,000,000
→ "warnings": ["manual_exceeds_purchase"]
```
**실제**: 스케줄은 100개월에 걸쳐 정상 소진되고 최종 장부가액이 정확히 하한 1,000원 — **초과·조기 종료가 전혀 아니다.**
**기대**: 수동 연액 누적이 취득가액을 실제로 **초과**할 때만 경고.

**원인** — `cost/calc/DepreciationCalculator.java:156-161`
```java
long dep = Math.min(monthly, book - floor);
if (dep < monthly) {
    warnings.add(WARN_MANUAL_EXCEEDS_PURCHASE);   // ← 마지막 달 절삭에서 항상 참
}
```
마지막 달은 `(취득가액 − 하한)`이 월액으로 나누어떨어지지 않으면 **반드시** 절삭되므로 경고가 붙는다. 즉 **정상 종료가 곧 경고**다.

**실증**: 연액을 정확히 나누어떨어지게(`1,199,880` → 월 99,990, 9,999,000 ÷ 99,990 = 100 딱 떨어짐) 주면 `warnings: []` — 절삭 여부가 유일한 트리거임이 확인됨.

**영향**: 화면에 `수동값이 취득가액을 초과해 조기 종료됨` 경고 태그가 상시 노출돼 신뢰를 깎는다. 계약 §5 warnings 어휘가 의미를 잃는다.
**권고**: 마지막 달 절삭(정상 종료)과 진짜 초과를 구분 — 예: 스케줄이 **`MAX_MANUAL_MONTHS`에 걸려 잘렸거나** `monthly > (purchaseCost − floor)`인 경우로 한정.

---

## [MEDIUM] M-2. 자산 편집 모달에서 비용을 저장해도 **자산 상세 화면의 `비용 정보`가 갱신되지 않는다** — 책임: **FE**

**재현**
1. `/asset/list/{id}` → `편집` → `비용 정보` 섹션 `구매 비용` 10,000,000 → 12,000,000 → `저장`
2. 토스트 `작업이 성공적으로 완료되었습니다.` 표시, DB·감사로그에는 **12,000,000 정상 반영**
3. 그런데 뒤 화면의 `비용 정보 · 구매 비용`은 **여전히 `10000000`**
4. 페이지 새로고침(F5) → `12000000`으로 정상 표시

**원인** — `hooks/useCost.ts:146-153` `useUpdateCostData.onSuccess`는 `COST_QUERY_KEY.HW_LIST`·`HW_INCOMPLETE`·`HW_DEPRECIATION`만 무효화한다. **자산 상세/목록 쿼리 키는 대상에 없다.**

**영향**: 방금 저장한 사용자가 옛 값을 보고 "저장이 안 됐다"고 판단해 재편집한다. 자산 폼은 §8.9가 지정한 정식 입력 경로 중 하나다.
**권고**: `onSuccess`에 자산 상세/목록 쿼리 키 무효화 추가.

---

## [LOW] L-1. `period.basisDate`가 **로컬 시각을 `Z`로 표기**해 화면에 +9시간 미래 시각이 뜬다 — 책임: **BE**

**재현**: 서버 로컬 16:40:32(KST)에 `/asset/cost` 진입 → 헤더에 `현재 상각 기준으로 산출된 값입니다(2026-07-31 01:40:32)` — **다음 날 새벽**.

**원인** — `cost/CostService.java:109`
```java
ISO_UTC.format(LocalDateTime.now(clock).toInstant(ZoneOffset.UTC))
```
KST 벽시계 값을 UTC로 간주해 직렬화 → 실제 instant보다 9시간 앞선 문자열. FE `dayjs(basisDate)`가 다시 로컬(+9)로 변환하며 오차가 그대로 노출된다.

**성격**: 이 프로젝트의 전역 관례(`moveseye-be-spring/CLAUDE.md §3-4 "날짜는 UTC 전제"`)와 같은 부류로, `asset_activity.createdAt`도 동일한 스큐를 보인다(자산 이력에 `2026-07-31 01:36:31` 표시). **cost가 새로 만든 문제는 아니지만**, 하필 §2.7 소급 정책의 신뢰 장치(기준 시각)라 눈에 띈다. `AssetSyncService.syncedAt`은 진짜 UTC를 내므로 앱 내에서도 비일관.
**권고**: `Instant.now(clock)` 사용(또는 앱 전역 정리 과제로 편입).

---

## [LOW] L-2. 인라인 저장 후 **KPI·위젯이 갱신되지 않아 "행 합 ≠ KPI"** 상태가 화면에 남는다 — 책임: **FE (의도된 트레이드오프, 표시 없음)**

**재현**: 3개월 기간 · `costStatus=complete`(2행) → 첫 행 유지보수 120,000→200,000 인라인 저장
- 행 합계: `₩1,031,250 + ₩500,001 = ₩1,531,251`
- **KPI `HW 총비용`: `₩1,291,251` (저장 전 값 그대로)** — 서버 실제값은 `1,531,251`
- 헤더 `새로고침` 클릭 → `₩1,531,251`로 정정

**성격**: `useCost.ts:81-83` 주석이 "KPI/위젯은 모집단 집계라 이 응답만으로 재계산할 수 없으므로 갱신하지 않는다 — 새로고침 버튼 제공"이라고 **명시한 설계 결정**이다. 다만 화면에는 "KPI가 옛 값"이라는 단서가 전혀 없어, 사용자가 합계 불일치를 데이터 오류로 오인할 수 있다.
**권고**: 저장 후 KPI 영역에 stale 표시(흐림/`갱신 필요` 뱃지)를 주거나, 저장 성공 토스트에 새로고침 안내를 덧붙일 것.

---

## [LOW] L-3. `PUT /settings/device-classifications/{id}` 응답의 `updatedAt`이 **갱신 전 값** — 책임: **BE**

**재현**: 16:37:59에 PUT → 응답 `updatedAt: "2026-07-22T18:02:22.959Z"`(이전 값). 다음 PUT의 응답에서야 `2026-07-30T16:37:59` 가 나온다(한 스텝 지연). `GET`으로 재조회하면 정상.
**원인 추정**: `@UpdateTimestamp` flush 전에 DTO를 매핑(`saveAndFlush` 미사용 — [[network-maps-design]]의 낙관적 잠금 교훈과 같은 부류).
**영향**: 낮음(FE가 응답의 updatedAt을 표시 갱신에 쓰면 한 박자 늦음).

---

## [LOW] L-4. `POST /assets`에 `customProperties`를 생략하면 **HTTP 500** — 책임: **BE (cost 무관 · 선재)**

**재현**
```bash
POST /assets {"name":"X","deviceType":"server","createInZabbix":false}
→ HTTP 500 {"statusCode":500,"message":"Internal server error"}
# BE 로그: null value in column "custom_properties" violates not-null constraint
```
`{"customProperties":[]}` 를 넣으면 정상 200. FE(`AssetFormModal.tsx:284,330`)는 항상 배열을 보내므로 화면에서는 드러나지 않지만, API 계약상 옵션 필드가 500을 내는 것은 결함이다(에러 계약 §0 위반 — 검증 에러는 200+code여야 함).

---

## [LOW] L-5. MovesEye 전용(DMOVE) 일반 USER 계정은 **로그인은 되지만 모든 API가 401** — 책임: **BE (cost 무관 · 선재)**

`JwtAuthFilter.resolveAuthToken`(`JwtAuthFilter.java:97-137`)이 비-ADMIN에 Zabbix API 토큰을 요구한다. `POST /users {createInZabbix:false}`로 만든 계정은 토큰이 없어 전 API 401.
**영향**: D-5(비관리자 403) 검증 불가의 직접 원인. 또한 "MovesEye 전용 계정" 기능 자체가 관리자 외에는 사실상 동작하지 않는다는 뜻이다.

---

## [LOW] L-6. `갱신·교체 후보` 위젯이 0건일 때 **20컬럼짜리 빈 표**로 큰 면적을 차지 — 책임: **FE (미관)**

`renewalCandidates`가 빈 배열이면 CostHwTable 전 컬럼(자산~작업 21개)의 헤더 + `데이터가 없습니다.` + 가로 스크롤바가 KPI 바로 아래에 그대로 렌더된다. 현재 데이터에서는 만료일 보유 자산이 0건이라 **항상 이 상태**다.
**권고**: 0건이면 컴팩트한 Empty 상태로 대체.

---

# 10. 검증하지 못한 항목 (사유 명시)

| 항목 | 사유 |
|---|---|
| **D-5 비관리자 403(HTTP 200 + body 403)** | 로그인 가능한 비관리자 계정이 실 dev DB에 없음 + L-5로 DMOVE 전용 USER는 401에 막힘. **정적으로는 integration-qa P-7에서 확인됨** |
| `expiryExposure` · `expiryWindow`(30/60/90 누적) · `renewalCandidates` Top5 | 만료일 보유 자산 **0건**, 화면·API 어디에서도 만료일을 입력할 수 없어 데이터 생성 불가 |
| `platform: "cloud"` 행 / Cloud 탭 데이터 | `cloud_data.resource_id` 보유 자산 0건 (M3 미구현) |
| `purchase_cost_invalid` / `_zero` / `_negative` 사유 태그의 화면 표기 | 실데이터 0건. (`PATCH` 검증은 음수를 `COST_INVALID_AMOUNT`로 거부하므로, 이 사유들은 **구 데이터·직접 DB 주입으로만** 발생 가능) |
| `costInput.*Period`에 enum 밖 원문이 오는 경우(integration-qa L-2) | 구 데이터 0건 |
| `useful_life_years` 무효 원문 잔류(integration-qa L-3) | 구 데이터 0건 |
| `limit` 1~100 클램프 | 총 76행이라 상한에 도달하지 않음(`limit=500` 요청 시 76행 반환 — 클램프 자체는 미확인) |
| `depreciation_rate_missing` 사유 | 2~15년 범위 밖은 입력 단계에서 막히므로 방어 코드에 도달 불가 |
| 스크린샷 기반 시각 검증(레이어/색상 등) | **사용자 지시에 따라 스크린샷 최소화** — DOM 어서션으로 대체. 또한 자동화 탭이 비활성 상태일 때 antd leave 애니메이션이 완료되지 않고 `Page.captureScreenshot`이 타임아웃되는 환경 아티팩트가 있어 시각 판정 신뢰도가 낮음(제품 결함 아님) |

---

# 11. 결론

| 구분 | 건수 |
|---|---|
| **HIGH** | **0** |
| MEDIUM | 2 (BE 1 · FE 1) |
| LOW | 6 (BE 4 · FE 2 — 이 중 2건은 cost와 무관한 선재 결함) |
| 검증 항목 PASS | **38** |
| 검증 불가 | 8 (전부 데이터 부재 또는 환경 제약, 사유 명시) |
| integration-qa 이관 4건 | **전부 NOT REPRODUCED**(이미 수정됨) |

## 총평 — **기능 PASS · 데이터 FAIL**

- **계산 엔진·API·화면은 전부 정상이다.** 정액법/정률법/수동 오버라이드/소급 재계산/쓰기 검증/에러 계약/동기화 불변식(V6)까지 손계산·DB 대조로 전건 일치했다. **HIGH 결함 0.** 특히 결정 #10의 핵심인 "동기화가 사용자 비용 입력을 덮지 않는가"는 `add_update` 동기화 후에도 8필드 전부 보존되어 **PASS**다.
- **그러나 실 dev DB의 비용 데이터 충족률은 0%다.** 74건 전부가 `상각 불가`, KPI 전부 0, 만료 관련 지표는 입력 경로조차 없다. **HW 탭이 첫날 쓸모 있으려면 74건에 대한 취득가액+취득일 수기 입력이 선행되어야 하며**, 그 규모(148개 필드)와 `acquisition_date_missing`이 큐를 비우지 못하게 하는 구조(§1.7-2)가 이 기능의 실제 채택 리스크다.
- 다음 조치 우선순위: ① M-1 오탐 경고 수정(BE) → ② M-2 캐시 무효화(FE) → ③ 취득일 미입력을 미입력 사유로 볼지 정책 재확인 → ④ 만료일 입력 경로 설계(현재 死지표).

---
---

# 📌 델타 검증 (2026-07-31) — 일괄 업로드 + 만료일 입력 경로 + 이전 결함 수정 확인

> 수행: functional-qa · 2026-07-31 · BE Spring :3000(재기동) + FE Vite :5173 + Chrome
> 대상 DB: 실 dev DB `localhost:5432/dmove` · 갱신 계약: `features/assets/asset-cost/contract_asset-cost.md` **§4-2**(신규 EP 2개) + `expiryDate` 추가
> 위 §1~§11(2026-07-30 초회 검증)은 원문 그대로 보존. 이 절은 **델타만** 다룬다.

## Δ0. 결론

| 구분 | 건수 |
|---|---|
| **이전 발견 수정 확인** | **6/6 전부 FIXED** |
| **HIGH** | **0** |
| **MEDIUM** | **0** |
| LOW (신규) | 2 |
| 정보성 (신규) | 2 |
| 델타 PASS 항목 | **31** |
| 검증 불가 | 5 (사유 명시) |
| **데이터 원복** | ✅ **백업과 diff 0 — 완전 원복** |
| Flyway 추가 적용 | **없음** (V17 유지 — 업로드 기능은 스키마 변경 없음) |

> **M1 종료 가능 판정.** 일괄 업로드가 "취득가액 0%"를 실제로 깨뜨렸고(KPI 0원 → 1,139,583원, 미입력 큐 74 → 68),
> 만료일 死지표 3종이 처음으로 값을 가졌으며(30/60/90 = 2/3/4건), 이전 MEDIUM 2건·LOW 4건이 전부 해소됐다.
> 남은 것은 LOW 2건(에러 계약 가장자리·문구)뿐이다.

---

## Δ1. 이전 발견 후속 — **6/6 FIXED**

| # | 이전 발견 | 재현 시도 | 판정 |
|---|---|---|---|
| **M-1** | `manual_exceeds_purchase` 오탐(BE) | ① 10M/5년에 수동 연액 1,200,000 → **`warnings: []`**(예전엔 경고 발생). ② 10M/**10년**에 5,000,000 → 2년 만에 소진 → **`["manual_exceeds_purchase"]`**. ③ 10M/5년에 500,000(내용연수보다 오래 감) → **`[]`** | ✅ **FIXED** — 트리거가 "내용연수 전 조기 소진"으로 정확히 교체됨 |
| **M-2** | 자산 상세 비용 캐시 미갱신(FE) | `/asset/list/80` → 편집 → 구매 비용 10,000,000 → 7,777,000 저장 → **화면이 즉시 `7777000`으로 갱신**(새로고침 불필요). `이력` 섹션에도 방금의 costData diff가 즉시 표시 | ✅ **FIXED** — DETAIL·ACTIVITIES 무효화 확인 |
| **L-1** | `basisDate` +9h 오표기(BE) | 실제 UTC `2026-07-31T01:11:52Z` ↔ 응답 `basisDate: "2026-07-31T01:11:52.697Z"` **일치**. 화면도 `현재 상각 기준으로 산출된 값입니다(2026-07-31 10:15:31)` = 실제 로컬시각 | ✅ **FIXED** |
| **L-3** | 기기분류 `updatedAt` 한 스텝 지연(BE) | 값을 실제로 바꾼 PUT → 응답 `2026-07-31T10:12:17.400Z`, 직후 GET **동일**. 원복 PUT도 응답 == GET | ✅ **FIXED** (`saveAndFlush`) |
| **L-6** | 빈 위젯 / 드릴다운 빈 표(FE) | 상각 불가 자산 드릴다운(`/asset/cost/hw/20`) → `.ant-table` **0개**, `표시할 상각 스케줄이 없습니다.` Empty 블록 2개(차트·연차표) | ✅ **FIXED** |
| **L-2** | 인라인 저장 후 KPI stale 무표시(FE) | 인라인 저장 직후 KPI 위에 배너 노출: **"저장했습니다. 위 합계는 아직 저장 전 값입니다 — 새로고침하면 다시 계산됩니다."** + 새로고침 버튼 | ✅ **FIXED** |

> ⚠️ 잔존(전역 과제): `asset_activity.createdAt` 등 **엔티티 타임스탬프의 +9h 스큐는 그대로**다. 자산 상세 `이력`이 `2026-07-31 19:21:09`(실제 10:21 KST)로 표시된다. 이번 수정은 `basisDate` 한정이며, L-1에서 "앱 전역 관례"로 분류한 부분은 별도 과제로 남는다.

---

## Δ2. 🎯 A. 일괄 업로드 왕복 — **이 기능의 존재 이유가 성립한다**

### Δ2-1. `GET /costs/hw/template` — **PASS**

| 검증 | 실측 | 판정 |
|---|---|---|
| 래퍼 아님(raw attachment) | `Content-Type: text/csv;charset=UTF-8` · `Content-Disposition: attachment; filename="cost-hw-template.csv"` · `Content-Length: 2714` — ApiResult JSON 아님 | ✅ |
| **UTF-8 + BOM** | 선두 바이트 `EF BB BF` | ✅ |
| RFC4180 / CRLF | 줄바꿈 `\r\n` | ✅ |
| 헤더 15컬럼·고정 순서 | `assetId,name,deviceType,purchaseCost,acquisitionDate,expiryDate,depreciationMethod,usefulLifeYears,maintenanceCost,maintenanceCostPeriod,leaseCost,leaseCostPeriod,depreciationCost,residualValue,currency` — 계약 §4-2a와 **완전 일치** | ✅ |
| 자산 프리필 | **75행** = 전 자산(excluded `id 64` **제외**), **id 오름차순**, `name`·`deviceType` 채워짐 | ✅ |
| 비용 컬럼 프리필 | 데이터 투입 후 재조회 시 저장값이 실림(`1,10.220.0.73,,4500000,2024-03-01,2026-08-15,straight_line,4,120000,monthly,600000,yearly,,,KRW`) — 날짜 ISO 정규화, 금액 숫자만, `currency KRW` | ✅ |

### Δ2-2. 🔴 무손상 재업로드(D-1 기본 계약) — **PASS**

| 시나리오 | 결과 |
|---|---|
| 빈 템플릿(전 비용 컬럼 공란) 그대로 재업로드 | `totalRows 75 / success 75 / failure 0` ✅ |
| **데이터가 채워진 상태**의 템플릿 재다운로드 → 그대로 재업로드 | `totalRows 75 / success 75 / failure 0` ✅ |
| **레거시 무효 원문 보유 자산**의 템플릿 행 | 자산 16에 `purchase_cost:"4,500만원"` · `acquisition_date:"2024년 3월"` · `expiry_date:"2024년3월"` · `depreciation_method:"bogus"` · `useful_life_years:"99"` · `residual_value:"-5"` · `maintenance_cost_period:"quarterly"` · `currency:"TOOLONGCUR"`를 주입(`PATCH /assets` 자유맵 경로)한 뒤 템플릿 확인 → **`16,Haley,,,,,,,,,,,,,` 비용 컬럼 12개 전부 빈칸** ✅ |
| 무변경 행의 감사로그 오염 | `asset_activity` 86 → **86**(증가 없음) ✅ |

무효 원문 자체는 계약대로 미입력 큐(`rawPurchaseCost: "4,500만원"`)와 `warnings`로 노출된다.

### Δ2-3. 🎯 실제 값 업로드 — **KPI가 0에서 살아난다 (PASS, 손계산 전건 일치)**

자산 8건(id 1~8)에 취득가액·취득일·만료일·내용연수·상각방법(정액 7 + **정률 1**)을 채워 업로드 → `totalRows 8 / success 8 / failure 0`.

| KPI / 위젯 | 업로드 **전** | 업로드 **후** | 판정 |
|---|---|---|---|
| `hwTotal` | **0원** | **₩1,139,583** | ✅ 아래 행별 합계와 일치 |
| `changeRate` | `null` | **+7.89%** | ✅ (전월 1,056,250 — id 8이 2026-07 취득이라 전월 미포함) |
| `expiryExposure` | 0 | **4건** | ✅ |
| `expiryWindow` | 0 / 0 / 0 | **2 / 3 / 4** | ✅ 설계한 그대로 |
| `depreciationMethodMix` | 0/0/0/74 | **정액 7 · 정률 1** · 상각완료 0 · 불가 67 | ✅ |
| `renewalCandidates` | `[]` | **5건**(만료 임박순, 경과분 선두) | ✅ |
| 미입력 큐 | **74건** | **68건** | ✅ (§1.7-2 그대로 — 취득일까지 넣은 7건만 이탈) |

**행별 손계산 대조 (기간 2026-07)**

| id | 입력 | 기대 월 상각비 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | 4,500,000 / 2024-03-01 / 4년 / 정액 + 유지 120,000(월) + 리스 600,000(연) | 93,750 · 합계 263,750 | 93,750 / 263,750 | ✅ |
| 2 | 3,000,000 / 5년 | 3,000,000÷60 = 50,000 | 50,000 | ✅ |
| 3 | 2,400,000 / 4년 | 2,400,000÷48 = 50,000 | 50,000 | ✅ |
| 4 | 1,800,000 / 3년 | 1,800,000÷36 = 50,000 | 50,000 | ✅ |
| 5 | 9,600,000 / 8년 | 9,600,000÷96 = 100,000 | 100,000 | ✅ |
| **6** | 10,000,000 / 2026-01-15 / 5년 / **정률** | 10,000,000×0.451÷12 = **375,833** | 375,833 | ✅ |
| **7** | **`"12,000,000원"`**(인용+콤마+한글 통화기호) / 6년 / 정액 | 12,000,000÷72 = **166,667** | 166,667 | ✅ 금액 정규화 + RFC4180 인용 처리 |
| 8 | 5,000,000 / **취득일 공란** | `created_at`(2026-07-08) 폴백, 5년 → 83,333 | 83,333 (`acquisitionDateSource: created_at`) | ✅ |
| | **합계** | **1,139,583** | **1,139,583** | ✅ |

### Δ2-4. 부분 성공 + `rowNumber` 물리 줄 번호(D-6) — **PASS**

빈 줄 3개(3·5·13행)를 의도적으로 섞은 파일 업로드 → `totalRows 10 / success 2 / failure 8`

| 파일 줄 | 내용 | 응답 `rowNumber` | `errorCode` | DB 반영 |
|---|---|---|---|---|
| 2 | id 9 정상 | **2** | — (OK) | **저장됨** ✅ |
| 3 | (빈 줄) | 건너뜀 | — | — |
| 4 | id 10, 금액 `4500만원` | **4** | `COST_INVALID_AMOUNT` | `{}` 미변경 ✅ |
| 5 | (빈 줄) | 건너뜀 | — | — |
| 6 | assetId 999999 | **6** | `ASSET_NOT_FOUND` (`assetName: null`) | — ✅ |
| 7 | assetId 64(excluded) | **7** | `COST_ASSET_EXCLUDED` | `{}` 미변경 ✅ (조용한 스킵 아님) |
| 8 | id 11, 내용연수 99 | **8** | `COST_INVALID_USEFUL_LIFE` | `{}` ✅ |
| 9 | id 12, 취득일 `2024년3월` | **9** | `COST_INVALID_DATE` | `{}` ✅ |
| 10 | id 13, 방법 `sum_of_years` | **10** | `COST_INVALID_DEPRECIATION_METHOD` | `{}` ✅ |
| 11 | id 14, 주기 `quarterly` | **11** | `COST_INVALID_COST_PERIOD` | `{}` ✅ |
| 12 | assetId `notanumber` | **12** | `COST_UPLOAD_INVALID_ROW` (`assetId: null`) | — ✅ |
| 13 | (빈 줄) | 건너뜀 | — | — |
| 14 | id 15 정상 | **14** | — (OK) | **저장됨** ✅ |

**줄 번호가 Excel에서 보이는 물리 줄과 완전히 일치**하며, 빈 줄이 번호를 밀지 않는다. 행 단위 커밋(성공 2건 저장 · 실패 8건 미변경)도 DB로 확인. 계약 §4-2b 에러 표 **8종 전건 일치**.

### Δ2-5. 파일 전체 실패 — **5/6 PASS (1건 신규 LOW)**

| 케이스 | 응답 | 판정 |
|---|---|---|
| 헤더에 `assetId` 없음 | HTTP 200 + `COST_UPLOAD_INVALID_HEADER` | ✅ |
| 템플릿 밖 알 수 없는 컬럼 추가 | HTTP 200 + `COST_UPLOAD_INVALID_HEADER` | ✅ |
| 헤더만 있고 데이터 0행 | HTTP 200 + `COST_UPLOAD_EMPTY` | ✅ |
| 0바이트 빈 파일 | HTTP 200 + `COST_UPLOAD_EMPTY` | ✅ |
| **`file` 파트 누락(D-5)** | HTTP 200 + **`COST_UPLOAD_EMPTY`** (500 아님) | ✅ **FIXED** |
| multipart가 아닌 요청(`Content-Type: application/json`) | **HTTP 500** `{"statusCode":500,...}` | ❌ **신규 LOW N-1** |

---

## Δ3. B. 만료일 — **死지표 3종 해제 확인 (PASS)**

| # | 검증 | 결과 | 판정 |
|---|---|---|---|
| B-1 | 만료 지표가 처음으로 값을 갖는가 | 설계한 날짜(+15일 / +51일 / +81일 / 경과 / +305일)에 대해 `expiryWindow = {within30:2, within60:3, within90:4}`(누적, 경과분 포함), `expiryExposure: 4`, `renewalCandidates` 5건 임박순(경과분 선두) | ✅ |
| B-2 | `costPriority` 만료 요소 반영 | 만료일 보유 자산의 `priority.basis`에 **`expiry`** 등장, score 상승(예: 10 → 35, 임시자산 50/high) | ✅ |
| B-3a | inventory 폴백 | inventory `date_hw_expiry: "2026-08-20"` → `expiryDate: "2026-08-20"`, **`expiryDateSource: "inventory"`**, `costInput.expiryDate: null`(수동값만 실림 — 계약대로) | ✅ |
| B-3b | **수동이 inventory를 이기는가** | `PATCH {"expiryDate":"2026-09-05"}` → `2026-09-05` / **`manual`** | ✅ |
| B-3c | 수동 제거 시 inventory로 복귀 | `clearFields:["expiryDate"]` → `2026-08-20` / `inventory` | ✅ |
| **B-4a** | **inventory 만료일 무효 → 경고 없음(D-2)** | inventory `"2024년3월"` → `expiryDate: null`, `expiryDateSource: null`, **`warnings: []`** | ✅ **FIXED** |
| B-4b | 수동 만료일 무효 → 경고 있음 | cost_data `expiry_date: "2024년3월"` → **`warnings: ["expiry_date_invalid_ignored"]`** + `costInput.expiryDate`에 원문 노출(정정 가능) | ✅ |
| B-4c | 무효 inventory 위에 유효 수동 | `2026-10-05` / `manual`, 경고 소멸 | ✅ |

> `expiryDate`가 `PATCH /costs/hw` · 업로드 · 인라인 편집 3경로 모두에서 쓰기 가능해져, 초회 검증에서 "화면에서 입력할 수 없어 영구히 0"이라고 보고한 **§1.7-3 死지표 문제가 해소**됐다.

---

## Δ4. C. 세 편집 화면 규약 일치 (D-3) — **PASS**

무효 원문 6종을 보유한 자산(id 17, 미입력 큐 대상)으로 EP4(목록) · EP5(드릴다운) · EP7(미입력 큐) 세 응답을 대조:

| 검증 | 결과 |
|---|---|
| `costInput` 3중 동일 | **문자열 단위로 완전 동일** — `{purchaseCost:null, acquisitionDate:"2024년 3월", expiryDate:"2024년3월", depreciationMethod:"bogus", usefulLifeYears:99, maintenanceCostPeriod:"quarterly", residualValue:-5, ...}` ✅ |
| **EP7에 `warnings` 신설** | `hasOwnProperty('warnings') === true` ✅ |
| `warnings` 3중 동일 | 세 곳 모두 `["expiry_date_invalid_ignored","depreciation_method_invalid_ignored","useful_life_invalid_ignored","residual_value_invalid_ignored"]` ✅ |
| 무효 원문 삭제 동일 | 큐 경로에서 `clearFields` 6키 → `warnings: []`, `costInput` 전 필드 null, DB `{}` ✅ |
| `reasons` 일치 | EP4 `incompleteReasons` == EP7 `reasons` ✅ |

> 초회 검증의 **LOW L-3(무효 `useful_life_years` 원문이 폼에 보이지도, 지울 수도 없음)** 도 이로써 해소됐다 — `usefulLifeYears: 99` · `depreciationMethod: "bogus"` · `residualValue: -5` · `currency` 전부 `costInput`에 노출되어 정정 가능.

---

## Δ5. D. FE 화면 — **PASS**

| # | 검증 | 결과 |
|---|---|---|
| D-1 | 업로드 진입점 | 기간 헤더에 **`일괄 업로드`** 버튼 신설 ✅ |
| D-2 | 업로드 모달 | 안내("행 단위로 저장되므로 일부 행이 실패해도 성공한 행은 그대로 남습니다") + `템플릿 다운로드` + 템플릿 사용법 + **Dragger**("CSV 파일을 클릭해서 선택하거나 여기로 끌어다 놓으세요") ✅ |
| D-3 | 템플릿 다운로드 버튼 | 클릭 시 에러 토스트 / 콘솔 오류 없음(blob 경로) ✅ |
| D-4 | **부분 성공 리포트** | `10행 처리 — 2행 저장, 8행 실패` + **"성공한 행은 이미 저장됐습니다. 아래 목록의 행만 고쳐서 다시 올리세요 — 파일 전체를 다시 올릴 필요는 없습니다."** + 실패 행 표(`파일 줄` / `자산` / `사유`) + "줄 번호는 올린 파일의 실제 줄 번호와 같습니다" ✅ |
| D-5 | **파일 전체 실패 vs 행 실패 구분** | 전체 실패는 **빨간 Alert** — `파일 전체가 거부됐습니다 — 저장된 행이 없습니다` + `머리글 행이 템플릿과 다릅니다. 템플릿을 다시 내려받으세요.` + `적용된 행은 하나도 없습니다.` (행 실패 표와 명확히 구분) ✅ |
| D-6 | **만료일 출처 뱃지** | `2026-06-01 직접 입력`(manual) vs `2026-08-20 인벤토리`(inventory) ✅ |
| D-7 | 인라인 편집에 만료일 입력 | 편집 행에 만료일 DatePicker 존재 ✅ (커밋 검증은 도구 한계 — Δ7 참조) |
| D-8 | **KPI stale 힌트** | 저장 직후 `저장했습니다. 위 합계는 아직 저장 전 값입니다 — 새로고침하면 다시 계산됩니다.` 배너 + 새로고침 버튼 ✅ |
| D-9 | 경고 태그 즉시 반영 | 주기 없이 유지보수 60,000 저장 → `유지보수 연액 가정` 태그 + 월 5,000 반영 ✅ |
| D-10 | **i18n raw key 노출** | 목록 · 업로드 모달 · 결과 리포트 · 전체실패 Alert · 드릴다운 · 자산 상세 전 화면 **0건** ✅ |
| D-11 | **무한 스피너** | 전 화면 `.ant-spin-spinning = 0` ✅ |
| D-12 | 드릴다운 Empty | 상각 불가 자산에서 `.ant-table` 0개 + Empty 블록 ✅ |

---

## Δ6. 신규 발견

### [LOW] N-1. multipart가 아닌 요청은 여전히 **HTTP 500** — 책임: **BE**

```
POST /costs/hw/bulk-upload  -H "Content-Type: application/json" -d '{}'
→ HTTP 500 {"statusCode":500,"message":"Internal server error"}
```
D-5 수정이 **`file` 파트 누락**은 `COST_UPLOAD_EMPTY`로 잡지만, 요청이 multipart 자체가 아닌 경우(`HttpMediaTypeNotSupportedException` / `HttpMessageNotReadableException`)는 `GlobalExceptionHandler`가 처리하지 않아 500이 나간다. 계약 §0("검증 에러는 전부 HTTP 200 + body code")의 가장자리 이탈.
**같은 부류 재현**: 본문 인코딩이 깨진 JSON(`Invalid UTF-8 start byte`)도 `PATCH /assets`에서 500 — cost 고유가 아닌 **전역 핸들러 공백**이다.
**영향**: FE는 항상 multipart로 보내므로 실사용 영향 낮음. API 계약 일관성 문제.

### [LOW] N-2. `COST_INVALID_AMOUNT` 한글 문구가 "음수"로만 한정 — 책임: **FE(문구) 또는 BE(코드 세분화)**

업로드 결과 리포트에서 금액 파싱 실패(`4500만원`) 행의 사유가 **"금액은 음수일 수 없습니다."** 로 표시된다. `errorCode`는 `COST_INVALID_AMOUNT`로 정확하지만, 이 코드 하나에 **음수 · 파싱 실패 · currency 형식 위반** 세 원인이 매핑돼 있어 문구가 실제 원인을 오도한다. 사용자는 "음수가 아닌데?"라며 원인을 못 찾는다.
**권고**: 문구를 "금액을 읽을 수 없습니다(숫자·콤마만 사용, 한글 단위 불가)"처럼 포괄적으로 바꾸거나 `COST_AMOUNT_UNPARSABLE`을 분리.

### [정보] N-3. 엔티티 타임스탬프 +9h 스큐 잔존

`basisDate`는 수정됐지만 `asset_activity.createdAt` · `device_classification.updatedAt`은 여전히 로컬시각을 `Z`로 표기한다(자산 상세 `이력`에 `2026-07-31 19:21:09` — 실제 10:21 KST). 초회 L-1에서 "앱 전역 관례"로 분류한 부분이며 이번 수정 범위 밖. 별도 전역 과제로 남는다.

### [정보] N-4. 음수 유지보수/리스 금액은 경고 없이 0 처리

`lease_cost: "-100"` 저장 시 `periodLeaseCost: 0`으로 안전 처리되나 `lease_cost_invalid` 경고가 붙지 않는다(파싱 실패에만 경고). 데이터 손상은 없고 레거시 주입 경로로만 발생 가능.

---

## Δ7. 검증하지 못한 항목 (사유)

| 항목 | 사유 |
|---|---|
| **업로드 EP 2개의 비관리자 403 차단** | 초회 검증 §10과 동일 — 로그인 가능한 비관리자 계정이 실 dev DB에 없고, MovesEye 전용 USER는 `JwtAuthFilter`가 401로 막아 `AdminAccessChecker`에 도달 불가(LOW L-5, cost 무관 전역). **관리자 인증으로는 두 EP 모두 정상 동작 확인** |
| 인라인 편집의 **만료일 DatePicker 저장 커밋** | 자동화 도구가 antd DatePicker에 텍스트만 주입하면 Form에 커밋되지 않아(달력 클릭 필요) 저장이 no-op이 된다. **도구 한계이며 제품 결함 근거 아님** — 만료일 쓰기 자체는 API(PATCH) · 업로드 · 모달 경로로 검증 완료 |
| `갱신·교체 후보` 위젯 **0건일 때** Empty 처리 | 검증 중 만료일 데이터가 5건 존재해 0건 상태를 재현하지 않음. 동일 수정 범위인 드릴다운 빈 표 Empty로 간접 확인 |
| 템플릿 다운로드 **파일 실제 저장** | 브라우저 다운로드 폴더 접근 불가. 클릭 시 오류 없음 + API 레벨(바이트/헤더) 완전 검증으로 대체 |
| CSV **인코딩 변형 내성** | BOM 없음 / LF-only / **cp949(한국어 Windows Excel 기본 저장 인코딩)** 미시도. 🔴 사용자가 템플릿을 Excel로 열어 저장하면 cp949가 될 수 있어 **배포 전 1회 확인 권고** |

---

## Δ8. 데이터 변경 및 원복 — ✅ **완전 원복 (diff 0)**

**변경 전 백업**: 검증 착수 직후 `\copy (select id, cost_data from asset order by id)` → `_workspace/.qa_backup_costdata.csv` (76행, **전건 `{}`**).

| 대상 | 무엇을 바꿨나 | 원복 |
|---|---|---|
| 자산 **1,2,3,4,5,6,7,8** | 업로드로 취득가액·취득일·만료일·내용연수·상각방법·유지보수·리스·통화 입력 | `PATCH /costs/hw/{id}` `clearFields` 12키 → `{}` ✅ |
| 자산 **9, 15** | 부분 성공 테스트로 취득가액·취득일·내용연수·상각방법 입력 | 동일 ✅ |
| 자산 **16** | 레거시 무효 원문 8종 주입(`PATCH /assets` 자유맵) | `clearFields` → `{}` ✅ |
| 자산 **17** | 무효 원문 6종 주입(세 화면 대조용) | `clearFields` → `{}` ✅ |
| 자산 **10~14, 64** | (실패 행 — DB 미변경) | 변경 없음 확인 ✅ |
| 임시 자산 **id 80** `__QA_EXPIRY_FALLBACK_TMP__` | 만료일 폴백 체인 검증용 custom 자산 1건 생성(inventory `date_hw_expiry` 조작 포함) | **하드 삭제 완료** (`delete from asset where id=80`, asset_activity CASCADE) ✅ |
| 기기분류 `server` | `updatedAt` 갱신 검증차 7년/정률로 1회 변경 | **5년/정액으로 원복 완료**(6종 전부 `straight_line`/5 확인) ✅ |

**최종 검증**

```
$ diff .qa_backup_costdata.csv .qa_after_costdata.csv
NO DIFF — full revert verified

asset:                  total 76 · excluded 1 · cost_data <> '{}' → 0건
device_classification:  6종 전부 straight_line / 5
GET /costs/hw:          total 75 · hwTotal 0 · expiryWindow 0/0/0 · notApplicable 75 · incompleteCount 75
flyway_schema_history:  V17 (추가 적용 없음)
```

**잔존(의도)**: `asset_activity` 감사 로그에 이번 검증의 편집 이력이 남는다(감사 로그 특성상 삭제하지 않음). 새 자산 생성은 임시 1건뿐이며 정리 완료. 이전 세션에서 sync로 추가된 `id 79 test-chkim`은 실 Zabbix 호스트의 정상 미러라 그대로 둔다.

---

## Δ9. 델타 총평 — **M1 종료 가능**

- **일괄 업로드가 이 기능의 성립 조건을 실제로 충족시켰다.** 템플릿 왕복 계약(무손상 재업로드 = 전건 성공)이 **레거시 무효 원문이 있는 자산까지 포함해** 성립하고, 실제 값 8건 업로드로 KPI가 **0원 → 1,139,583원**, 미입력 큐 **74 → 68**로 움직였으며, 모든 수치가 손계산과 일치했다. 부분 성공 · `rowNumber` 물리 줄 번호 · 행 단위 커밋이 정확해 **74건 실입력 운영이 현실적으로 가능**해졌다.
- **만료일 死지표가 해제됐다.** `expiryDate` 쓰기 경로(PATCH · 업로드 · 인라인)와 폴백 체인(수동 > inventory), 무효값 경고 규칙(수동만 경고)이 전부 설계대로 동작하며, 만료 위젯 3종과 우선순위 만료 요소가 처음으로 값을 가졌다.
- **이전 발견 6건 전부 수정 확인.** MEDIUM 2건 · LOW 4건이 실제로 고쳐졌고, 델타에서 **HIGH · MEDIUM 0건**이다.
- 남은 LOW 2건은 배포 차단 사유가 아니다. **배포 전 권고 2가지**: ① N-2 금액 오류 문구 개선(입력 동선의 실사용 마찰) ② cp949로 저장된 CSV 내성 1회 확인(Excel 왕복이 실제 사용 시나리오다). → **②는 2026-08-03 실측 완료(Δ10). PASS.**

---

# 📌 Δ10. cp949 / Excel 왕복 내성 실측 (2026-08-03, Claude)

Δ7에서 "미시도"로 남긴 **배포 전 권고 ②**를 실 Excel(COM 자동화)로 해소한다.
BE 미기동 상태라 **HTTP 업로드가 아니라 파일 레벨 실측 + BE 파싱 로직 대조**로 수행했다(아래 한계 참조).

## Δ10-1. 방법

1. BE `generateTemplate()` 산출물과 **동일 형식**의 CSV 생성 — UTF-8 **+ BOM**, **CRLF**, 15컬럼
   (`assetId,name,deviceType` + `COST_COLUMNS` 12개), 한글 자산명 3행(`웹서버-운영1호` · `DB서버(주)` · `스위치-3층`).
2. **실 Excel 16.0**으로 열어 두 형식으로 재저장 — `xlCSV`(6) = **ANSI/cp949**, `xlCSVUTF8`(62).
3. 저장 결과를 **BE와 동일하게 디코딩**(`new String(bytes, StandardCharsets.UTF_8)` → BOM 스트립)한 뒤
   헤더 검증·셀 매핑·값 컬럼을 원본과 대조.

> 실측 환경: Windows 11 ko-KR, **`ShortDatePattern = yyyy-MM-dd`**. ← 이 값이 Δ10-3의 전제다.

## Δ10-2. 결과 — **PASS (cp949 저장해도 전건 성공한다)**

| 항목 | 원본(UTF-8+BOM) | **ANSI(cp949) 저장** | UTF-8 저장 |
|---|---|---|---|
| 선두 3바이트 | `EF BB BF` | **BOM 없음** → 헤더 첫 셀 `assetId` 온전 | `EF BB BF` |
| U+FFFD(디코딩 실패) | 0 | **19개 — 전부 `name` 컬럼** | 0 |
| **총 콤마 수** | 56 | **56 (구조 파괴 0)** | 56 |
| 헤더 셀 수 | 15 | 15 | 15 |
| 데이터 행 셀 수 | 15 / 15 / 15 | 15 / 15 / 15 | 15 / 15 / 15 |
| **값 컬럼 전건**(금액·날짜·enum·연수·통화) | 기준 | **전건 일치** | 전건 일치 |

**왜 안전한가 (우연이 아니라 구조적)**

- 깨지는 셀은 `name`·`deviceType` 둘뿐인데, 이 둘은 **`REFERENCE_COLUMNS`(업로드 시 무시)** 다 —
  `buildRequest()`가 읽지 않으므로 **깨진 원문이 DB로 흘러들지 않는다**.
- 값 컬럼은 전부 ASCII(숫자·`-`·`_`·영문 enum)라 cp949/UTF-8 어느 쪽으로 저장해도 바이트가 동일하다.
- cp949(UHC) trail byte 범위는 `0x41–0x5A / 0x61–0x7A / 0x81–0xFE` 로 **`,`(0x2C)·`"`(0x22)를 포함하지 않는다** →
  UTF-8 디코딩이 실패해 U+FFFD로 치환돼도 **구분자가 새로 생기거나 사라지지 않는다**(총 콤마 56 불변이 실증).
- ANSI 저장은 BOM을 붙이지 않으므로 `content.startsWith(BOM)` 스트립 로직과 무간섭이다.

→ **배포 전 권고 ② 해소. 별도 조치 불필요.**

## Δ10-3. 🔴 대신 발견 — 날짜 파서가 **PC 로케일에 취약**하다 (신규, 책임: BE)

`CostValueParser.java:54–58`의 날짜 패턴은 **월·일이 2자리 고정**이다:

```
DATE_DASH  ^\d{4}-\d{2}-\d{2}$    DATE_DOT     ^\d{4}\.\d{2}\.\d{2}$
DATE_SLASH ^\d{4}/\d{2}/\d{2}$    DATE_COMPACT ^\d{8}$    DATE_YEAR_MONTH ^\d{4}-\d{2}$
```

정규식 대조 실측:

| 입력 | 판정 |
|---|---|
| `2024-03-01` `2024.03.01` `2024/03/01` `20240301` `2024-03` | OK |
| **`2024. 3. 1`** (구 한국 Windows 기본 단축날짜) | **INVALID (거부)** |
| **`2024-3-1`** / **`2024/3/1`** / **`2024. 03. 01`** | **INVALID (거부)** |

Excel은 날짜 셀을 **OS 단축 날짜 형식대로** 다시 쓴다. 이번 PC는 `yyyy-MM-dd`라 왕복이 무사했지만,
날짜 형식이 `yyyy. M. d`인 PC에서 템플릿을 Excel로 한 번 열었다 저장하면
**`acquisitionDate`·`expiryDate`가 전 행 INVALID**가 된다.

- **영향**: Δ2-2가 세운 기본 계약 — *"템플릿 출력을 그대로 재업로드하면 전건 성공"* — 이 **PC 설정에 따라 깨진다.**
  값이 틀린 게 아니라 표기만 다른데 거부되므로, 사용자는 원인을 알기 어렵다(D-1이 해결한 문제의 재발 형태).
- **한계**: 이번 PC 로케일에서는 재현되지 않는다. 재현엔 OS 날짜 형식 변경 또는 해당 설정의 PC가 필요하다.
  다만 **거부된다는 사실 자체는 정규식만으로 확정적**이라 실측 없이도 성립한다.
- **권고**: 월·일 1자리 및 구분자 주변 공백을 허용 — 예 `^\d{4}[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}$` 로 통합하고
  `LocalDate.of(y,m,d)`로 조립. 관대해지는 방향이라 **기존 성공 입력의 판정은 바뀌지 않는다**(회귀 위험 낮음).
  → 계약서 `## 🔄 FE 요청사항` **R-1**로 이관.

## Δ10-4. 이 검증이 dev DB에 남긴 변경 — **없음**

파일 레벨 검증이라 **BE 미기동 · API 호출 0 · DB 접근 0**. 산출물은 전부 세션 스크래치패드에만 있다.

> ⚠️ **남은 한계**: 실제 `POST /costs/hw/bulk-upload` **HTTP 왕복은 미실행**이다(BE :3000 미기동, 협업 모드에서 BE 기동은 Codex 담당).
> 다만 업로드 경로의 인코딩 처리는 `new String(file.getBytes(), UTF_8)` 한 줄이 전부이고 이를 그대로 재현했으므로,
> multipart 계층이 바이트를 변형하지 않는 한 결과는 동일하다.
