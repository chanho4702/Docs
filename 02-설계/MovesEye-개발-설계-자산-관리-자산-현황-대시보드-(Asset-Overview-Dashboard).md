# MovesEye 개발 설계 — 자산 관리 > 자산 현황 대시보드 (Asset Overview Dashboard)

> 작성 2026-08-26 · Claude · **v1 → 사용자 지시로 즉시 구현 착수(2026-08-26)** · 티켓 **ZM-116**
> 미결 Q1~Q9는 **§11의 "제안(기본값)"으로 확정**하고 M1을 진행한다(사용자: "설계 완료되면 하네스로 구현").
> 🔒 **격리 작업**(사용자: "다른 세션 영향 안 받게"): 레포별 git worktree `C:\worktrees\zm-116-be`(브랜치 `ZM-116`, base `3cc08ea`) · `C:\worktrees\zm-116-fe`(`ZM-116`, base `ba018f0`). 런타임 **BE :3001 / FE :5174**(메인 체크아웃의 :3000/:5173은 다른 세션 사용 중). 메인 체크아웃(`C:\solutions\moveseye-be-spring`·`moveseyee_fe`)에는 쓰지 않는다.
> 상위 설계: [devdesign_assets-core.md](%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC-Assets-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84%EC%84%9C-%28v2%29.md)(자산 모델) · [devdesign_asset-cost.md](MovesEye-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC-%EB%B9%84%EC%9A%A9-%28Cost-Monitoring%29.md)(비용 대시보드 — 이 문서의 **형제 화면**)
> 기획 원문: [design_assets-management.md](MovesEye-%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%28Assets%29-%EB%A9%94%EB%89%B4-%ED%86%B5%ED%95%A9-%EC%84%A4%EA%B3%84-%EC%A0%95%EC%9D%98%EC%84%9C.md) §3.1 "요약 지표"
> 데이터 실측: dev 프로필 5433 도커 DB, 2026-08-26 (§2)

---

## 🎯 이 화면의 목적

> **관리자가 "우리가 무엇을 얼마나 갖고 있고, 그 기록이 얼마나 믿을 만하며, 지금 뭘 손봐야 하는가"를 한 화면에서 답하게 한다.**

자산 관리 메뉴에는 이미 **비용 대시보드**(`/asset/cost?tab=dashboard`)가 있다. 그 화면은 **돈**의 질문
("얼마어치 샀고 / 지금 얼마 나가고 / 앞으로 얼마 더 나가는가")에 답한다.
이 화면은 **구성·품질·상태**의 질문에 답한다. 두 화면이 같은 것을 두 번 보여주면 안 된다 — 경계는 §0.2.

### 0.1 관리자가 이 화면에 와서 묻는 다섯 가지

| # | 질문 | 섹션 | 답이 되는 데이터 |
|---|---|---|---|
| Q-A | **무엇을 얼마나 갖고 있나** — 분류·소스·그룹·OS·소유자·위치별 구성 | A. 구성 | `asset` 컬럼 + `zabbix_data.groups/inventory` |
| Q-B | **어디까지 관리(모니터링)되고 있나** — 커버리지·연결 공백 | A. 구성 / D. 운영 | `coverage`, `linked_hostid`, Zabbix 실시간 |
| Q-C | **기록이 믿을 만한가** — 미분류·소유자 미지정·인벤토리 비어 있음·비용 미입력·동기화 지연 | **C. 데이터 품질(핵심)** | 필드 채움률, `inventory_mode`, `last_synced_at`, `cost_data` |
| Q-D | **생애주기상 어디에 있나** — 상태 분포·연식·만료 경과/임박 | B. 생애주기 | `lifecycle_status`, 취득일 폴백체인, `expiry_date` |
| Q-E | **최근 무엇이 바뀌었나** — 등록·수정·제외·동기화 추이 | E. 변화 | `asset_activity` |

### 0.2 🔴 비용 대시보드와의 경계 (중복 금지 규칙)

| 축 | 자산 현황 대시보드(이 문서) | 비용 대시보드(기존) |
|---|---|---|
| 자산 **수**의 분포(분류·소유자·그룹·OS…) | ✅ 여기 | ❌ (금액 분포만) |
| 금액(취득원가·상각·유지비·예상 비용·장부가) | ❌ 링크만 | ✅ 거기 |
| 만료(경과/30/60/90) | ✅ **건수**만, 생애주기 축으로 · 같은 계산기(`CostParamResolver`) | ✅ 건수+금액 노출(검토 후보 태그) |
| 검토/작업 큐 | ✅ **관리 품질** 사유(미분류·소유자·인벤토리·연결·동기화) | ✅ **비용** 사유(미입력·급증·상각끝유지비) |
| 비용 미입력 | 건수 1개(완성도 항목) → 비용 미입력 큐로 링크 | 본체 |

> `owner_missing`·`host_unlinked` 태그는 비용 검토 후보에도 들어 있다. **여기서는 기본 사유로, 거기서는 부가 사유**로 남긴다 — 양쪽 정의는 같은 판정 함수를 공유해야 한다(§5.6).

---

## 1. 출발점 — 이미 있는 것 / 없는 것

### 1.1 이미 있는 것 (그대로 쓴다)

| 항목 | 위치 | 재사용 방식 |
|---|---|---|
| 자산 요약 8지표 | `GET /assets/summary` → `AssetSummaryDto` | KPI 행의 total/monitored/unmonitored/lifecycleReview/lastSyncedAt 정의 그대로 |
| 목록 필터 8축(URL query) | `AssetListPage.tsx` · `SearchAssetListDto` | **차트 클릭 → 목록 딥링크**의 착지점. 이미 `useQueryParams`라 추가 작업 없음 |
| savedView 4종 | `unmonitored` / `public_access` / `hardware_eol` / `ownership` | 작업 큐 → 목록 이동 시 그대로 사용 |
| 기기분류 마스터(색 포함) | `device_classification` (`code·name·color·sort_order`) | 분류 차트의 순서·색·라벨 정본 |
| 자산 상세 실시간 보강 | `AssetService.java:426-476` `LiveInfo`(available/activeProblemCount/status 4값) | D 섹션은 **같은 판정 규칙을 벌크로** 돌린다 |
| 취득일·만료일 폴백체인 | `cost/calc/CostParamResolver` | 연식·만료 집계가 비용 화면과 **같은 날짜**를 보게 하는 유일한 방법 |
| 비용 대시보드 카드 골격·팔레트 | `pages/asset/cost/components/*`, `constants/cost.ts`, `constants/palette.ts` | 카드·도넛·막대·테이블 규격 재사용 |
| 홈 위젯 `asset_kpi` | `pages/home/widgets/asset/AssetKpiWidget.tsx` | M2에서 이 화면의 요약 위젯 2종 추가 후보(§9) |

### 1.2 없는 것 (신규)

- **자산 축 group-by 집계 EP가 하나도 없다.** `/assets/summary`는 스칼라 8개뿐 → `GET /assets/dashboard` 신설(§6).
- **전체 자산 활동 피드 EP 없음**(`/assets/{id}/activities`만) → 대시보드 응답에 포함.
- 자산 축 벌크 실시간 상태(호스트 N대 가용성·problem 수) EP 없음 → 대시보드 응답 `live` 섹션(부분 성공).
- 라우트 `/asset/dashboard` · 메뉴 항목 · 화면 도움말 1건.

### 1.3 🔴 실측이 설계를 바꾼 지점 — "컬럼 존재 ≠ 값 존재" ([[asset-cost-design]] 교훈 재확인)

dev DB(79건)의 채움 상태를 보면 **"분포 차트"만으로는 화면이 성립하지 않는다.**
`vendor` 1건·`model` 3건·`serialno_a` 3건·`location` 0건인데 벤더별/모델별 도넛을 그리면 조각이 하나뿐이다.
그래서 이 화면의 **본체는 C. 데이터 품질**이고, 구성 차트는 전부 **"미입력" 조각을 1급 값**으로 갖는다(§4.3 규칙).
설치 고객 초기 상태도 이와 같을 것이다 — 인벤토리를 채우게 만드는 화면이어야 값이 생긴다.

---

## 2. 데이터 실측 프로필 (dev 5433, 2026-08-26)

| 항목 | 값 | 설계 영향 |
|---|---|---|
| 자산 수 | zabbix 78 · custom 1 · excluded 0 | 규모 작음. 집계는 Java 메모리 처리로 충분(§8.3) |
| `device_type` | **notClassified 62 / server 16 / network 1** | 미분류 78% — 분류 차트는 미분류를 강조(emphasis) 형태로 |
| `coverage` | monitored 75 · unmonitored 4 | custom 1 + disabled 호스트 3 |
| `lifecycle_status` | active 54 · planned 9 · retired 8 · expired 8 | 4값, 상태색 사용 가능 |
| `owner_name` | 5개 팀 13~14건 + **null 11** | "미지정" 조각 필수 |
| `linked_hostid` | 78 연결 / 1 미연결 | custom 자산의 연결 공백 태그 |
| `inventory_mode` | **-1(비활성) 33** · 0(수동) 7 · 1(자동) 38 · null 1 | 🔴 **33건은 동기화해도 인벤토리가 영영 안 들어온다** → 품질 큐 `inventory_disabled` 사유 신설 |
| inventory 채움 | name 35 · os 35 · lat/lon 19 · serial 3 · model 3 · vendor 1 · location **0** · date_hw_* **0** | 벤더/모델/위치 차트는 "완성도"로만 의미 있음 |
| `cost_data` | purchase_cost·acquisition_date·useful_life 68 · expiry_date 55 · maintenance 24 · lease 14 | 취득연도 차트는 `cost_data.acquisition_date`가 주 원천(인벤토리 date_hw_purchase 0건) |
| 호스트그룹 | Linux servers 41 · Discovered hosts 34 · DB 7 · Windows 6 … 23개 그룹 | 🔴 **다중 소속**(41+34+… > 79) — 그룹 차트 합은 자산 수와 다름을 화면에 명시 |
| 태그 | `device-type:서버` 32 · `device_type:server` 15 · `OS:존재` 30 | 분류 태그 키가 두 벌(`device-type` vs `device_type`) — 62건 미분류의 **원인**. 품질 큐 사유로 노출 |
| `asset_activity` | updated 157 · created 80 · excluded/restored 1 · **synced 0** | 배치 동기화 이력이 0 → 변화 추이는 사용자 활동 중심, synced는 마커로 |
| `created_at` | 전부 2026-07 | 월별 신규 등록 추이는 dev에선 평평 — 30일 일별 활동으로 대체 |

---

## 3. 데이터 소스 정리

### 3.1 집계 모집단

`asset WHERE excluded = false` + 헤더 필터 선적용(비용 대시보드와 동일 원칙 — "n건 기준" 표시).
`excludedCount`는 KPI 보조 수치로만.

### 3.2 차원(dimension)과 원천

| 차원 | 원천 | 정규화 |
|---|---|---|
| 기기분류 | `asset.device_type` | `device_classification` 마스터 순서·색·라벨. `notClassified`는 항상 마지막·회색 |
| 소스×커버리지 | `source` × `coverage` | 3구간: `zabbix·monitored` / `zabbix·unmonitored`(호스트 disabled) / `custom` |
| 호스트그룹 | `zabbix_data.groups[].name` | 다중 소속 그대로 카운트, Top 10 + "그 외 N그룹" |
| OS 계열 | `zabbix_data.inventory.os` | 🔴 raw 문자열(`Linux 5.14.0-…`, `Windows Server 2019…`) → **계열 정규화 규칙**(§5.3): Linux / Windows / Unix / 네트워크OS / 기타 / 미입력 |
| 소유자 | `owner_name` | null → "미지정" |
| 위치 | `inventory.location` → 없으면 `site_city` → `site_address_a` | 전부 없으면 "미입력" |
| 생애주기 | `lifecycle_status` | active / planned / retired / expired |
| 배포 상태 | `deployment_status` | 실측 전부 `deployed` → **M1 차트 제외**, 필터만 |
| 취득연도 | `CostParamResolver` 취득일 (`cost_data.acquisition_date` → `date_hw_purchase` → `date_hw_install`) | 🔴 `created_at` 폴백(추정)은 **제외**하고 "취득일 미상"으로 센다 — 등록일을 연식으로 오인시키면 안 됨 |
| 만료 구간 | `CostParamResolver` 만료일 (`cost_data.expiry_date` → `date_hw_expiry`) | 경과 / ≤30 / ≤60 / ≤90 / 90일 초과 / 미상 — **경과와 예정 분리**(비용 대시보드 판정 동일) |

### 3.3 품질(완성도) 필드 — 자산당 10항목

| # | 항목 | 채움 판정 | 실측 채움 | 조치 경로 |
|---|---|---|---|---|
| 1 | 기기분류 | `device_type ≠ notClassified` | 17/79 | 목록 `?deviceType=notClassified` → 호스트 태그 편집 / custom은 자산 편집 |
| 2 | 소유자 | `owner_name` 비어 있지 않음 | 68/79 | 목록 `?savedView=ownership` |
| 3 | 위치 | §3.2 위치 규칙 | 0/79 | Zabbix 인벤토리 `location` (호스트 관리 인벤토리 편집) |
| 4 | 시리얼 | `inventory.serialno_a` | 3/79 | 〃 `serialno_a` |
| 5 | 벤더/모델 | `vendor` **and** `model` | 1/79 | 〃 |
| 6 | OS | `inventory.os` | 35/79 | 〃 (자동 인벤토리면 템플릿이 채움) |
| 7 | 취득일 | §3.2 취득일(추정 제외) | 68/79 | 비용 HW 탭 인라인 편집 |
| 8 | 취득가액 | `cost_data.purchase_cost` | 68/79 | 〃 |
| 9 | 만료일 | §3.2 만료일 | 55/79 | 〃 |
| 10 | 지리 좌표 | `location_lat` **and** `location_lon` | 19/79 | 지리 맵 좌표 편집 |

> 가중치는 **균등**(1항목 = 10%)에서 시작한다. 실무에서 "시리얼이 벤더보다 중요"가 확인되면 가중치 표를 설정으로 뺀다 — **Q4**.
> custom 자산도 같은 10항목을 본다(`zabbix_data`를 사용자 입력으로 채우는 단일 렌더 원칙 — assets-core §1).

### 3.4 실시간(live) 데이터 — 모니터링 자산만

| 값 | 원천 | 규칙 |
|---|---|---|
| 가용성 | `InventoryPort.listHosts`(interfaces.available) | 인터페이스 종합: 하나라도 `1`이면 available, 전부 `2`면 unavailable, 그 외 unknown — **상세 화면 규칙과 동일** |
| 활성 problem 수 | `AlertPort` (problem.get by hostids) | 심각도 최댓값도 함께 |
| 상태 4값 | `AssetService` 파생 규칙 재사용 | Healthy / Degraded(available + problem>0) / Unavailable / Unknown |

호출은 **벌크 2회**(host.get 1 + problem.get 1), 결과는 60초 캐시(홈 요약과 동일 TTL). 실패 시 `live = null`(부분 성공, 500 금지).

---

## 4. 화면 설계

### 4.1 IA · 라우트 · 메뉴

```
자산 관리
├── 대시보드          /asset/dashboard        ← 신설. 메뉴 첫 항목(진입 기본값은 Q1)
├── 자산 목록         /asset/list
├── 비용             /asset/cost
└── 맵               /asset/network-map · /asset/geo-map
```

- `routes.ts` `PATH_ROOTS_ASSET.dashboard`, `SideNav.tsx` `nav-group-assets` 첫 항목(아이콘 `DashboardOutlined`), `MobileSideNav` 동반.
- 🔴 **필터는 전부 URL query**(`deviceType·groupName·owner·lifecycle·source·coverage`) — App.tsx가 navigate마다 리마운트하므로 로컬 state 금지([[fe-page-remount-on-navigate]]). 비용 대시보드와 같은 `useQueryParams` 패턴.
- 이 화면엔 **기간 선택이 없다**(현재 스냅샷 화면). 유일한 시간축은 E 섹션의 고정 30일.
- 드릴다운 신규 화면 **없음** — 모든 클릭은 기존 화면으로 착지: 자산 목록(필터 query) · 자산 상세 · 비용 HW 탭 · 호스트 상세.

### 4.2 레이아웃 (데스크톱 12컬럼, 위→아래 = 질문 순서)

```
┌ 헤더: 제목 · "n건 기준" · 마지막 동기화 HH:mm (지연이면 ⚠) · [동기화](admin) · [자산 목록] ─────────┐
│ 필터 행: 기기분류 ▾ · 호스트그룹 ▾ · 소유자 ▾ · 생애주기 ▾ · 소스 ▾ · 커버리지 ▾ · [초기화]          │
├ KPI 행 (stat tile ×6) ──────────────────────────────────────────────────────────────────────────┤
│ 관리 자산 | 모니터링 커버리지 % | 미분류 | 소유자 미지정 | 생애주기 검토 | 데이터 완성도 %            │
├ A. 구성 ────────────────────────────────────────────────────────────────────────────────────────┤
│ [기기분류별 (6)]      [소스×커버리지 (6)]                                                         │
│ [호스트그룹 Top10 (4)] [OS 계열 (4)]  [소유자별 (4)]                                              │
├ B. 생애주기 ────────────────────────────────────────────────────────────────────────────────────┤
│ [생애주기 상태 (4)]   [취득연도별 연식 (4)]   [만료 구간 (4)]                                     │
├ C. 데이터 품질 ── 🔴 이 화면의 본체 ─────────────────────────────────────────────────────────────┤
│ [필드별 완성도 (5)]   [관리 작업 큐 — 테이블 (7)]                                                 │
├ D. 운영 연결 ───────────────────────────────────────────────────────────────────────────────────┤
│ [모니터링 자산 상태 (4)]  [문제 있는 자산 Top10 — 테이블 (8)]                                     │
├ E. 최근 변화 ───────────────────────────────────────────────────────────────────────────────────┤
│ [30일 활동 추이 (7)]  [최근 활동 10건 (5)]                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

괄호 = 컬럼 폭. 모바일은 전부 12(세로 스택). 섹션 D는 `live=null`이면 "실시간 조회 실패" 카드 1개로 접힌다.

### 4.3 위젯 명세

차트 형태는 `dataviz` 스킬의 form 규칙을 따랐다 — **한 숫자면 stat tile, 부분-전체는 6조각 이하 도넛 또는 가로 누적막대, 크기 비교는 가로 막대(단일 색), 시간은 라인/막대**. 도넛은 근접값 비교용으론 쓰지 않는다.

**공통 규칙**
- 🔴 **"미입력/미지정/미상" 조각은 항상 존재**하고 회색(de-emphasis)·마지막 순서. 값이 0이면 숨기지 않고 0으로 표기.
- 모든 조각/막대 클릭 → 자산 목록 딥링크(표 마지막 열). 딥링크에 대응하는 목록 필터가 없는 차원(OS·위치·연식·만료)은 **M1에서 클릭 없음**(툴팁만) — 목록 필터 확장은 M2(§10).
- 색: 기기분류는 `device_classification.color`(AntD preset → 팔레트 매핑), 나머지 범주는 `CHART_SERIES` 고정 순서, 상태는 `HEALTH`/`SEVERITY` 상태색 + 아이콘·라벨(색만으로 구분 금지 — [[design-system-and-help]]).
- 카드 골격은 `CostDonutCard`류를 일반화한 `AssetChartCard`(제목 · "n건 기준" 부제 · 빈 상태 · 내보내기 없음).

#### KPI 행

| 타일 | 값 | 보조 | 클릭 |
|---|---|---|---|
| 관리 자산 | `total`(excluded 제외) | `zabbix n · custom n · 제외 n` | `/asset/list` |
| 모니터링 커버리지 | `monitored/total %` | `unmonitored n` | `?coverage=unmonitored` |
| 미분류 | `notClassified` 건수 | 비율 | `?deviceType=notClassified` |
| 소유자 미지정 | 건수 | 비율 | `?savedView=ownership` |
| 생애주기 검토 | `lifecycle ≠ active` 건수 | `planned n · retired n · expired n` | `?savedView=hardware_eol`(expired) — 나머지는 lifecycle 필터 |
| 데이터 완성도 | 자산별 10항목 채움률의 **평균 %** | 100% 자산 n건 | C 섹션으로 스크롤 |

#### A. 구성

| 위젯 | 형태 | 데이터 | 규칙 | 클릭 |
|---|---|---|---|---|
| 기기분류별 자산 | **가로 막대**(분류색, 미분류 회색) — 도넛 대신 막대인 이유: 미분류 78%라 나머지가 근접값이 되어 도넛으로 비교 불가 | `byDeviceType[]` | 마스터 `sort_order`, 비활성 분류에 남은 자산은 "(비활성) 이름"으로 표시 | `?deviceType=` |
| 소스 × 커버리지 | **가로 누적막대 1줄**(3구간) + 각 구간 수치 | `bySourceCoverage` | zabbix·monitored / zabbix·unmonitored(호스트 비활성) / custom(연결 n·미연결 n) | `?source=` `?coverage=` |
| 호스트그룹 Top 10 | 가로 막대(단일 색, 내림차순) | `byHostGroup[]` + `otherGroupCount` | 🔴 부제 "자산은 여러 그룹에 속할 수 있어 합계가 자산 수와 다릅니다" | `?groupName=` |
| OS 계열 | 가로 막대(단일 색) | `byOsFamily[]` | §5.3 정규화, 기타·미입력 포함 | 없음(M2) |
| 소유자별 | 가로 막대(단일 색, 미지정 회색) | `byOwner[]` | Top 10 + 그 외 | `?owner=` |

> 위치별·벤더별은 **M1에서 뺀다**(실측 0~1건). 완성도 막대가 "위치 0%"로 그 사실을 더 정직하게 말한다. 채움률이 30%를 넘는 설치본에선 의미가 생기므로 M2 위젯 후보(§10).

#### B. 생애주기

| 위젯 | 형태 | 데이터 | 규칙 | 클릭 |
|---|---|---|---|---|
| 생애주기 상태 | 가로 누적막대 1줄(4구간, 상태색+라벨) | `byLifecycle` | active=good · planned=중립 · retired=muted · expired=warning | `?lifecycle=` |
| 취득연도별 연식 | **세로 막대**(연도 오름차순, 단일 색) + "취득일 미상 n" 배지 | `byAcquisitionYear[]`, `acquisitionUnknownCount` | 🔴 `created_at` 추정은 미상으로. 기기분류 기본 내용연수(`default_useful_life_years`)를 넘긴 연도 구간은 **emphasis**(진한 색)로 "내용연수 경과 n건" | 없음(M2) |
| 만료 구간 | 가로 막대 5+1(상태색) | `expiry{expired,within30,within60,within90,beyond90,unknown}` | 경과 = `< today`, 예정 = `today ≤ d ≤ today+N` **분리** — 비용 대시보드와 같은 계산기 | `/asset/cost?tab=dashboard`(금액은 거기) |

#### C. 데이터 품질 — 🔴 본체

| 위젯 | 형태 | 데이터 | 규칙 | 클릭 |
|---|---|---|---|---|
| 필드별 완성도 | **가로 막대 10줄, 채움률 오름차순**(가장 비어 있는 것이 위) · 막대 = 채움 % · 우측 "n / total" | `completeness.fields[]` | 단일 색(sequential). 30% 미만은 라벨에 ⚠ | 각 줄 → §3.3 조치 경로 |
| 관리 작업 큐 | `DmoveTable`, **자산당 1행 + 사유 태그 복수**, 총건수 = distinct 자산 | `workQueue[]` | 사유·정렬 §5.6. 기본 20행 + "목록에서 전체 보기" | 자산명 → 상세, 태그 → 해당 필터 목록 |

#### D. 운영 연결 (모니터링 자산만 · 실시간)

| 위젯 | 형태 | 데이터 | 규칙 | 클릭 |
|---|---|---|---|---|
| 모니터링 자산 상태 | 가로 누적막대 1줄(4구간, HEALTH 상태색+아이콘) | `live.statusCounts` | Healthy / Degraded / Unavailable / Unknown — 상세와 같은 규칙. 부제 "HH:mm:ss 기준, 60초 캐시" | Unavailable → `?coverage=monitored`+상세 |
| 문제 있는 자산 Top 10 | 테이블: 자산 · 분류 · 소유자 · 상태 · 활성 problem 수 · 최고 심각도 | `live.topProblemAssets[]` | problem 수 내림차순 → 심각도 | 자산 상세 / 호스트 상세 |

> 이 섹션은 모니터링 화면의 축약이 아니라 **"자산 렌즈로 본 운영 상태"** — 소유자·분류가 붙어 "DBA팀 자산 중 2대 다운" 같은 문장을 만들 수 있게 한다. Zabbix 장애 시 카드 1개로 접힘(§3.4).

#### E. 최근 변화 (고정 30일)

| 위젯 | 형태 | 데이터 | 규칙 | 클릭 |
|---|---|---|---|---|
| 30일 활동 추이 | 세로 누적막대(일별) — 4계열 created/updated/excluded/restored, `synced`는 markPoint | `activity.daily[]` | 0건 날도 축에 존재(빈 날 생략 금지) | 없음 |
| 최근 활동 10건 | 리스트: 시각 · 자산명 · 행위 · 행위자 · 변경 필드 요약 | `activity.recent[]` | `changes[]` 첫 2필드 + "+n" | 자산 상세 |

---

## 5. 판정 규칙 (여기를 어기면 화면이 거짓을 말한다)

### 5.1 모집단·필터
- 필터 선적용 후 집계. `filterOptions`는 **필터 적용 전** 모집단에서 추출(비용 대시보드 계약 규칙 동일 — 적용 후로 뽑으면 다른 값으로 갈아탈 수 없다).
- 그룹 필터 `groupName`은 정확 일치(목록과 동일).

### 5.2 완성도 점수
- 자산 점수 = 채운 항목 수 / 10. KPI = 자산 점수 평균(모집단). "100% 자산 n건"은 보조.
- 항목별 채움률 = 채운 자산 수 / 모집단.
- 🔴 **`inventory_mode = -1` 자산은 인벤토리 5항목(위치·시리얼·벤더/모델·OS·좌표)이 동기화로 채워질 수 없다.** 점수에서 빼지 않는다(관리자가 채워야 할 공백은 공백이다) — 대신 작업 큐 사유 `inventory_disabled`로 원인을 알려준다.

### 5.3 OS 계열 정규화 (M1 최소 규칙, 대소문자 무시, 첫 매치 우선)
`windows` → Windows · `linux|ubuntu|centos|rocky|debian|red hat|rhel|suse|alma` → Linux · `aix|solaris|hp-ux|freebsd` → Unix · `ios|nx-os|junos|routeros|fortios|pan-os` → 네트워크 OS · `vmware|esxi` → 하이퍼바이저 · 그 외 비어 있지 않음 → 기타 · 비어 있음 → 미입력. 규칙 표는 BE 상수 1곳(`OsFamilyNormalizer`), 미매치 raw 상위 5개를 응답 `osUnmatchedSamples`로 내려 규칙 보강 근거로 쓴다 — **Q5**.

### 5.4 연식
- 연도 = 취득일의 연도. 취득일이 `created_at` 추정이면 **미상**.
- 내용연수 경과 = `today ≥ 취득일 + 분류 기본 내용연수`(자산별 `useful_life_years` 오버라이드 우선 — `CostParamResolver`와 같은 해석). 경과 건수는 KPI가 아니라 연식 차트의 강조 + 부제.

### 5.5 동기화 신선도
- `staleSync = now − max(last_synced_at) > 24h`(기본값, **Q7**). 헤더에 ⚠ + "마지막 동기화 n시간 전". 동기화 자산이 0이면 표시 없음.

### 5.6 관리 작업 큐 — 사유 태그와 정렬

| 태그 | 판정 | 조치(태그 클릭 착지) |
|---|---|---|
| `unclassified` | `device_type = notClassified` | 목록 `?deviceType=notClassified` |
| `classification_tag_mismatch` | zabbix 자산이고 태그에 `device-type`·`devicetype` 등 **유사 키**만 있고 `device_type` 키가 없음 | 목록 동일 필터 + 툴팁 "태그 키를 `device_type`으로" (dev 실측: `device-type:서버` 32건이 미분류 원인) |
| `owner_missing` | `owner_name` 비어 있음 | `?savedView=ownership` |
| `host_unlinked` | `source=custom` and `linked_hostid` 없음 | `?coverage=unmonitored&source=custom` |
| `host_disabled` | `source=zabbix` and `zabbix_data.status='1'` | `?coverage=unmonitored&source=zabbix` |
| `inventory_disabled` | `inventory_mode = '-1'` | 호스트 관리(인벤토리 활성화) — M1은 안내만, M2 일괄 활성화 액션 |
| `inventory_sparse` | 인벤토리 5항목 중 채운 것 ≤ 1 **and** `inventory_mode ≠ -1` | 호스트 관리 인벤토리 편집 |
| `cost_missing` | `purchase_cost` 또는 취득일 없음 | 비용 HW 탭 미입력 큐(기존 `/costs/hw/incomplete`와 같은 판정 함수 공유) |
| `expired` | 만료일 `< today` | 비용 대시보드 |
| `stale_asset` | `updated_at`·`last_synced_at` 모두 90일 초과(M2 후보) | — |

- 정렬: **태그 수 내림차순 → 모니터링 자산 우선 → 이름**. (비용 큐의 priorityScore 같은 가중 점수는 사유 성격이 균질해서 M1엔 과함 — 태그 수로 충분.)
- 🔴 `owner_missing`·`host_unlinked`·`cost_missing`은 비용 대시보드 `reviewCandidates`에도 있다. **판정 함수를 공유**(`asset/quality/AssetQualityPolicy`)해 두 화면의 건수가 갈리지 않게 한다.

### 5.7 그룹 다중 소속
그룹 차트 합 ≠ 자산 수. 부제로 명시하고, 툴팁은 "이 그룹 자산 n / 전체 m".

---

## 6. API 계약 초안 — `GET /assets/dashboard`

인증 사용자 전원(목록·요약과 동일). 쿼리: `deviceType · groupName · owner · lifecycle · source · coverage`(목록 `SearchAssetListDto` 어휘 그대로).

```ts
interface AssetDashboardResDto {
  generatedAt: string;                     // ISO
  population: { total: number; excludedCount: number; filtered: boolean };  // "n건 기준"
  kpi: {
    total: number; zabbixCount: number; customCount: number;
    monitored: number; unmonitored: number; coveragePct: number;           // 소수 1자리, total 0이면 0
    unclassified: number; ownerMissing: number;
    lifecycleReview: number; planned: number; retired: number; expired: number;
    completenessAvgPct: number; completeCount: number;                     // 10/10 자산 수
    lastSyncedAt: string | null; staleSync: boolean;
  };
  composition: {
    byDeviceType:     { code: string; name: string; color: string; active: boolean; count: number }[]; // 마스터 순서, notClassified 마지막
    bySourceCoverage: { zabbixMonitored: number; zabbixUnmonitored: number; customLinked: number; customUnlinked: number };
    byHostGroup:      { name: string; count: number }[];   // Top 10 내림차순
    otherGroupCount:  number;                               // Top 10 밖 그룹 수
    byOsFamily:       { family: string; count: number }[];  // 고정 순서: Windows·Linux·Unix·네트워크OS·하이퍼바이저·기타·미입력
    osUnmatchedSamples: string[];                           // 기타로 떨어진 raw 상위 5
    byOwner:          { name: string | null; count: number }[];  // null=미지정, Top 10
    otherOwnerCount:  number;
  };
  lifecycle: {
    byStatus: { active: number; planned: number; retired: number; expired: number };
    byAcquisitionYear: { year: number; count: number; beyondUsefulLife: number }[];  // 오름차순, 빈 연도 0 포함
    acquisitionUnknownCount: number;                        // created_at 추정 포함
    beyondUsefulLifeCount: number;
    expiry: { expired: number; within30: number; within60: number; within90: number; beyond90: number; unknown: number };
  };
  quality: {
    completeness: { field: AssetQualityField; filled: number; total: number; pct: number }[];  // pct 오름차순
    workQueue: {
      assetId: number; name: string; source: 'zabbix' | 'custom'; deviceType: string | null;
      owner: string | null; coverage: 'monitored' | 'unmonitored';
      reasonTags: AssetQualityTag[];        // §5.6
      linkedHostid: string | null;
    }[];
    workQueueTotal: number;                 // distinct 자산 수(응답은 상위 50)
    tagCounts: Record<AssetQualityTag, number>;
  };
  live: {                                   // 🔴 실패 시 null (부분 성공)
    asOf: string;
    statusCounts: { healthy: number; degraded: number; unavailable: number; unknown: number };
    topProblemAssets: { assetId: number; name: string; deviceType: string | null; owner: string | null;
                        status: string; activeProblemCount: number; maxSeverity: string | null; linkedHostid: string }[];
  } | null;
  activity: {
    daily: { date: string; created: number; updated: number; excluded: number; restored: number; synced: number }[]; // 30일, 빈 날 0
    recent: { id: number; assetId: number; assetName: string; action: string; actorType: string;
              actorName: string | null; changedFields: string[]; createdAt: string }[];  // 10건
  };
  filterOptions: { owners: string[]; hostGroups: string[] };  // 🔴 필터 적용 전 모집단. 기기분류·생애주기·소스·커버리지는 고정 목록
}
type AssetQualityField = 'deviceType'|'owner'|'location'|'serial'|'vendorModel'|'os'|'acquisitionDate'|'purchaseCost'|'expiryDate'|'geo';
type AssetQualityTag = 'unclassified'|'classification_tag_mismatch'|'owner_missing'|'host_unlinked'|'host_disabled'
                     |'inventory_disabled'|'inventory_sparse'|'cost_missing'|'expired';
```

- 응답 래핑·에러 형식은 기존 `/assets/*` 관례. `live`만 null 허용, 나머지는 DB 집계라 항상 채움.
- 계약 확정본은 구현 시 `_workspace/contract_asset-dashboard.md`로 산출(`api-contract-sync` 대상).

---

## 7. FE 구조

```
src/pages/asset/dashboard/
├── AssetDashboardPage.tsx               // 헤더·필터(URL)·섹션 조립, useAssetDashboard(params)
├── components/
│   ├── AssetDashboardFilter.tsx         // CostDashboardFilter 골격 재사용(옵션은 filterOptions)
│   ├── AssetKpiRow.tsx                  // Statistic 6타일 (CostHwKpiRow 패턴)
│   ├── AssetChartCard.tsx               // 공용 카드(제목·부제 n건·빈 상태·height 상수)
│   ├── AssetHBarCard.tsx                // 가로 막대 (분류/그룹/OS/소유자/완성도 공용, 색 모드 prop)
│   ├── AssetStackedBarCard.tsx          // 1줄 누적막대 (소스×커버리지/생애주기/live 상태)
│   ├── AssetAcquisitionYearCard.tsx     // 세로 막대 + emphasis
│   ├── AssetExpiryCard.tsx
│   ├── AssetWorkQueueTable.tsx          // DmoveTable(loading prop 필수 — [[fe-dmovetable-loading-spinner]])
│   ├── AssetLiveStatusCard.tsx · AssetProblemAssetsTable.tsx
│   ├── AssetActivityTrendCard.tsx · AssetRecentActivityList.tsx
│   └── AssetQualityTags.tsx             // 사유 태그 렌더(CostReviewTags 패턴)
services/asset.api.ts  (+getAssetDashboard) · hooks/useAsset.ts (+useAssetDashboard, staleTime 60s)
types/asset.ts (+TAssetDashboard*) · constants/asset.ts (+차트 높이·태그 라벨·OS 계열 순서)
locales/kr.json · en.json  (assetDashboard.* — 🔴 루트 키 중복 주의 [[home-landing-page]])
```

- ECharts 옵션은 `useEchartsTheme` + `usePalette`. 도넛 미사용(전부 막대) → `CostDonutCard`는 안 쓴다.
- 딥링크는 `navigate({pathname: PATH_ROOTS_ASSET.list, search})` — 목록이 이미 URL 필터를 읽는다.
- 화면 도움말 1건 추가(도움말 레지스트리 관례 — [[design-system-and-help]]).
- 테스트: 훅 언랩 깊이(payload 직접 — [[fe-usedmovequery-unwrap]]), KPI 계산 없음(전부 BE 값 표시), 딥링크 query 생성 단위 테스트, `live=null` 렌더 분기.

---

## 8. BE 구조 (`moveseye-be-spring`, 마이그레이션 없음)

```
asset/
├── AssetController        (+ GET /assets/dashboard)
├── dashboard/
│   ├── AssetDashboardService      // 모집단 로드 → 집계기 순차 호출 → DTO 조립. live는 try/catch → null
│   ├── AssetDashboardAggregator   // composition/lifecycle/quality 순수 함수(List<Asset> → 섹션 DTO)
│   ├── OsFamilyNormalizer         // §5.3 규칙 상수
│   └── AssetLiveStatusResolver    // InventoryPort.listHosts + AlertPort 벌크, 60초 캐시, AssetService 파생 규칙 이관
├── quality/
│   └── AssetQualityPolicy         // §3.3 완성도 + §5.6 태그. 🔴 CostService의 owner_missing/host_unlinked/미입력 판정을 여기로 모아 공유
└── dto/AssetDashboardResDto
```

### 8.3 집계 방식
- **Java 메모리 집계**: 모집단(`excluded=false` + 필터)을 한 번 로드해 순수 함수로 섹션을 만든다. jsonb 차원(그룹·인벤토리·태그)이 많아 SQL group-by를 차원마다 쓰면 쿼리 8개에 jsonb 전개가 반복된다. 1만 건까지는 이 방식이 단순하고 빠르다(비용 대시보드도 같은 방식). 그 이상은 **Q8**.
- 취득일·만료일·내용연수는 `CostParamResolver`를 그대로 호출(폴백체인 복제 금지 — 두 화면 숫자가 갈린다).
- `activity.daily`는 SQL(`date_trunc('day')` group by action) — 이건 단순.
- `live`: 모니터링 자산의 `linked_hostid` 집합으로 벌크 조회. 캐시 키는 hostid 집합 해시(필터가 달라도 부분집합이면 재계산 — M1은 단순히 전체 모니터링 자산 기준으로 1회 캐시 후 필터는 메모리에서 적용).
- 권한: 읽기 전원. 헤더 [동기화] 버튼은 기존 `POST /assets/sync`(ADMIN).

---

## 9. 홈 위젯 연계 (M2)

| 타입 | 내용 | 원천 |
|---|---|---|
| `asset_classification` | 기기분류별 가로 막대 소형 | `/assets/dashboard`.composition.byDeviceType |
| `asset_quality` | 완성도 % + 작업 큐 건수 + 상위 3태그 | 〃 quality |

기존 `asset_kpi` 유지. 홈 위젯 카탈로그 FE 상수 + BE enum 양쪽 갱신·`HomeWidgetsCatalogTest` 갱신 필요([[home-widget-dashboard]]).

---

## 10. 구현 단계

| 단계 | 범위 | 산출 |
|---|---|---|
| **M1** | EP 1개 + 화면 1개: KPI·A(위치/벤더 제외)·B·C·D·E, 딥링크는 목록 필터가 있는 차원만, 작업 큐 M1 태그 9종(`stale_asset` 제외), `inventory_disabled`는 안내만 | `contract_asset-dashboard.md` · FE/BE · 정적 QA + 런타임 QA(dev 5433, `live` 실측) · `review_asset-dashboard.md`(코덱스 검수) |
| **M2** | 목록 필터 확장(`osFamily·acquisitionYear·expiryWindow`) → 나머지 차트 클릭 · 위치/벤더 위젯(채움률 30% 게이트) · 인벤토리 일괄 활성화 액션 · 홈 위젯 2종 · `stale_asset` | — |
| **M3(후보)** | 스냅샷 테이블로 **자산 수·완성도의 시간 추이**(지금은 현재 스냅샷만이라 "지난달보다 나아졌나"에 답 못 함) — 일 배치 1행 | `asset_daily_snapshot` |

---

## 11. 리스크 · 미결

| # | 항목 | 제안(기본값) | 결정 |
|---|---|---|---|
| Q1 | 메뉴 위치 — 자산 관리 **첫 항목 "대시보드"** vs 자산 목록 상단 탭 | 첫 항목. 목록은 작업 화면이라 상단에 차트 5줄이 붙으면 매번 스크롤 | ⏳ |
| Q2 | D 섹션(실시간 운영 연결) 포함 여부 — Zabbix 호출 2회·모니터링 화면과의 중복 | 포함(60초 캐시·부분 성공). "자산 렌즈"라 소유자·분류가 붙는 게 차별점 | ⏳ |
| Q3 | 만료 구간을 여기도 두는가(비용 대시보드 중복) | 건수만·같은 계산기·금액은 링크 | ⏳ |
| Q4 | 완성도 10항목 균등 가중치 | 균등 시작, 가중치는 설정화 보류 | ⏳ |
| Q5 | OS 계열 정규화 규칙 위치 | BE 상수 + `osUnmatchedSamples`로 보강 | ⏳ |
| Q6 | 홈 위젯 2종 | M2 | ⏳ |
| Q7 | 동기화 지연 임계 24h — `asset_sync` 배치 주기를 모른다(실측 synced 이력 0건) | 24h, 배치 주기 확인 후 조정 | ⏳ |
| Q8 | 집계 상한 — 자산 1만 건 초과 설치본 | M1 메모리 집계, 초과 시 SQL 전환 | ⏳ |
| Q9 | `classification_tag_mismatch` 유사 키 목록(`device-type`·`devicetype`·`DeviceType`) | 3개 + 대소문자 무시 | ⏳ |
| R1 | 그룹 다중 소속 합계 오해 | 부제·툴팁 명시(§5.7) | 설계 반영 |
| R2 | "미입력" 조각이 모든 차트를 지배해 화면이 잿빛 | 의도된 것 — 이 화면의 일이 그것을 줄이는 것. 대신 C 섹션을 본체로 두어 조치 경로를 준다 | 설계 반영 |
| R3 | 비용 화면과 판정 불일치(소유자 미지정·미입력 건수) | `AssetQualityPolicy` 공유(§5.6) — CostService 리팩터 동반 | 구현 시 확인 |

---

## 11.1 구현 중 확정·변경 (2026-08-26, 하네스 실행)

| 항목 | 결정 | 근거 |
|---|---|---|
| Q1~Q9 | 전부 "제안(기본값)" 채택 | 사용자 지시("설계 완료되면 하네스로 구현") |
| `byOsFamily.family`(한글) | → `name` 코드 7종(`windows·linux·unix·network_os·hypervisor·other·unknown`), 라벨은 FE i18n | BE가 한글을 내리면 en 로케일이 깨진다 |
| 만료 6구간 | **배타적**(합 = 자산 수) | 분포 막대라 누적이면 합이 total을 넘는다(비용 화면은 누적 유지) |
| `lifecycle.byStatus` | `other` 추가 | 없으면 `planned+retired+expired ≠ lifecycleReview` 가능 |
| `generatedAt`·`live.asOf` | 진짜 UTC. `lastSyncedAt`·`createdAt`은 기존 관례(로컬+Z) 유지 | 비용 `basisDate` +9h 결함 재발 방지 — 계약 §4 |
| `host_unlinked` | `source=custom` 조건 제거(`linked_hostid` 부재만) | 비용 화면과 같은 함수를 쓰기 위해(결과 동일) |
| `byDeviceType.color` | → `colorPreset`(AntD preset 이름) + FE `tagPresetChartColor()` | hex로 오해해 일부 막대만 칠해지던 실제 버그(F-1) |
| **M2 항목 선반영** — `GET /assets?qualityTag=<9종>` | M1에 편입. 작업 큐 태그·완성도 막대 전부 이 축으로 딥링크 | 가장 많이 눌릴 태그(`inventory_*` 66/79)가 갈 곳이 없었다(F-2). 구현은 정책으로 id 집합 → `id IN` (SQL 술어 복제 금지, Q8 상한 동일) |
| 헤더 [동기화] | → [새로고침] | 동기화 모달이 목록에 이미 있어 쓰기 UI 중복 |
| 딥링크 | 현재 대시보드 필터 동반, `savedView` 충돌 축 제거 | 떼면 "62건 눌렀는데 목록 78건" |
| KPI 생애주기 검토 클릭 | 목록 대신 B 섹션 앵커 | 목록 `lifecycle`이 단일 값이라 "active 아닌 것" 재현 불가(F-4 미채택) |
| 만료 차트 클릭 | 경과 구간만 `qualityTag=expired`, 나머지는 비용 화면 | `expiryWindow` 목록 축은 M2 유지(F-3) |
| OS 계열·태그 코드 집합 | BE·FE 사본 — 변경 시 계약서 개정 의무 | F-5 |

## 12. 참고

- 비용 대시보드 계약 §5-D `contract_asset-cost.md:593` — 판정 규칙 표 형식·`filterOptions` 원칙·부분 성공 관례를 그대로 따랐다.
- 자산 목록 필터·savedView: `moveseye-be-spring/.../asset/dto/SearchAssetListDto.java`, `AssetRepository.java:115-132`
- 실시간 보강 규칙: `asset/AssetService.java:426-476`
- 취득·만료 폴백: `cost/calc/CostParamResolver.java:16-20, 143, 182`
- 팔레트: `moveseyee_fe/src/constants/palette.ts`(`CHART_SERIES`·`HEALTH`·`SEVERITY`), 카드 규격 `constants/cost.ts:344-373`
- 차트 형태·색 규칙: `dataviz` 스킬(form 우선, 상태색은 아이콘·라벨 동반, 도넛은 근접값 비교 금지)
