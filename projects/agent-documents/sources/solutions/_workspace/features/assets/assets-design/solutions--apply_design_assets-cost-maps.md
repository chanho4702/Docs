# MovesEye 적용 설계 — Assets 개편 · Costs · Maps

> 원천: `_workspace/features/assets/assets-design/demo_analysis_assets-cost-maps.md` (데모 관찰 명세)의 후속 **적용 설계서**
> 작성일: 2026-07-09 · 대상: `moveseye-be-spring` + `moveseyee_fe`
> 이번 세션 = **설계 문서만**(구현은 승인 후 별도). Phase 1(Assets) 상세, Phase 2/3(Costs·Maps) 개요.

## 확정 방향 (2026-07-09 사용자 결정)

| 항목 | 결정 |
|---|---|
| 범위·순서 | **Assets 먼저** 데모 모습으로 개편 → 이후 Costs → Maps. 지금은 Phase1 상세 + 2/3 개요 |
| Assets 화면 | **데모 레이아웃 채택 + 본제품 데이터로**. 채울 수 있는 값부터 매핑, 빈 필드는 단계적 확장 |
| Assets 분류축 | 데모의 cloud/onprem 대신 **기기유형(device_type 태그)** 채택 — zabbix 자산은 기존 `zabbix_data.tags`에서 즉시 파생 |
| Maps 지도 타일 | **MapLibre GL JS + OpenFreeMap** 채택 — 배포가 폐쇄망일 수 있어 자체 호스팅 가능한 오픈소스 조합. 레거시 Mapbox는 재작성 |
| 산출물 | 이 문서(_workspace). 구현은 다음 세션 fullstack-feature |

---

## 0. 현재 본제품 vs 데모 — 출발점

**이미 구현된 것 (건드릴 대상)**
- **Assets v2** 완성: BE Spring `asset/`(V5 + 9 API), FE `pages/asset/`(신규). 모델 = `source`(zabbix/custom) · `zabbix_data`(host/groups/interfaces/inventory/tags 스냅샷) · `custom_properties` · `notes` · `excluded`(soft delete) · `asset_activity`. 상세 live 보강(available·activeProblemCount). ([[assets-core-devdesign]])
- **Maps 레거시 씨앗**: `pages/asset/MapViewList.tsx`(Mapbox, `asset-legacy` 사용) + `ServerLocationList.tsx`(`/server-locations` CRUD, Mapbox). asset 라우트 하위(`mapview`·`serverlocation`)에 살아있음. FE 스택에 **Mapbox GL v2 + MapLibre GL v5 + react-map-gl 모두 설치됨**.
- **AWS 모듈**: EC2/CloudWatch 연동 코드 존재(자격증명 하이브리드 [[aws-cred-single-source]]). Cost Explorer/CUR 연동은 없음.

**없는 것**
- Costs 전무. Network Map(그래프)·클러스터 스코프 전무.

**핵심 통찰 — 데모 온프렘 필드는 대부분 Zabbix inventory에 이미 있다**
Zabbix 7.0 표준 host inventory(~70필드)에 데모 온프렘 상세 필드 상당수가 존재한다:
`deployment_status`, `date_hw_purchase/install/expiry/decomm`, `location_lat`·`location_lon`, `site_rack`·`site_address_a/b/c`·`site_city`, `vendor`·`model`·`serialno_a/b`·`hardware`·`os`·`software`, `contract_number`·`installer_name`, `host_networks`·`host_netmask`·`host_router`.
→ 데모의 **Lifecycle 날짜 · Deployment · Location 좌표 · Rack · Vendor/Model/Serial · Network**는 신규 컬럼 없이 **기존 `zabbix_data.inventory`로 채울 수 있다**.
→ **진짜 신규 저장은 소수**: ① Cost 금액($) ② Owner ③ Lifecycle 상태. 분류축인 **기기유형·Coverage는 기존 데이터에서 즉시 파생**(신규 저장 불필요), AWS 클라우드 식별은 AWS 자산일 때만 선택 저장 — 아래 매핑 참조.

---

## Phase 1 — Assets 개편 (상세)

### 1.1 개념 매핑 — 데모 축 → 본제품 데이터 원천

데모는 v2에 없는 **분류 축**(기기유형·Coverage·Lifecycle·Deployment·Owner·Resource)으로 목록을 필터·표시한다. 각 축을 "지금 채울 수 있는 값 / 신규 저장 / 단계적"으로 분류한다.

> **⚠️ Platform 축 교체 (2026-07-09 사용자 결정)**: 데모의 cloud/onpremise 분류는 **채택하지 않는다**. 대신 **호스트그룹 상세 탭의 "기기유형(device_type)"** 을 1차 분류축으로 쓴다. 기기유형은 Zabbix 호스트 태그 `device_type`(값: `server`/`network`/`security`/`database`/`hardware`, 태그 0개·2개 이상이면 `notClassified`)에서 파생되며 — **이 태그는 이미 자산 v2 `zabbix_data.tags`에 저장돼 있어 zabbix 자산은 지금 바로 파생 가능**(신규 저장·동기화 불필요). `HostService`의 기존 분류 로직(`DEVICE_TYPES` 상수·getCategory)과 동일 기준을 공유한다.

| 데모 축 | 데모 값 | 본제품 매핑 | 채움 시점 |
|---|---|---|---|
| **기기유형(Device type)** ← Platform 대체 | server/network/security/database/hardware/notClassified | **파생**: `zabbix_data.tags`의 `device_type` 값. HostService와 동일 규칙(1개만·유효값이면 그 값, 아니면 notClassified). custom 자산은 사용자 선택 필드 | ✅ 즉시(zabbix) / custom=입력 |
| **Coverage** | monitored / unmonitored | **지금 파생 가능**: source=zabbix & host status=enabled → monitored, 그 외 → unmonitored. v2 `zabbixData.status` + live.available 활용 | ✅ 즉시 |
| **Resource / HW** | ec2·rds·server·network_device… | inventory `type`/`type_full`(세부 기종). 기기유형(대분류)의 하위 상세로 표시 | ✅ 즉시 |
| **Location** | 물리 경로 | inventory `location`·`site_address_a/b/c`·`site_rack` 조합 | ✅ 즉시 |
| **Owner** | 사람(name/role/scope) | 신규. MovesEye User 참조 or 자유입력. 1차는 custom 필드/컬럼 | ⚠️ 신규 |
| **Lifecycle** | active/planned/retired/expired | 신규 컬럼(기본 active). 날짜(purchase/install/expiry)는 inventory `date_hw_*`로 보강 | ⚠️ 신규(상태) + ✅ 날짜 |
| **Deployment** | deployed/maintenance… | inventory `deployment_status`에 매핑(값 표준화). 없으면 기본 deployed | ✅ 즉시(표준화) |
| **Linked Host** | 연결 Host | source=zabbix면 **자기 자신이 호스트**(zabbix_hostid). custom/onprem이 별도 호스트에 연결되는 데모식은 신규 `linked_hostid` | zabbix ✅ / custom ⚠️ 신규 |

> **"본제품 데이터로" 원칙 적용**: 기기유형·Coverage·Deployment·온프렘 상세는 **즉시 채운다**. Owner·Lifecycle 상태·클라우드 식별은 신규 저장이 필요해 **빈 값 허용 + 단계적**. 화면은 데모와 동일 레이아웃으로 만들되, 데이터 없는 셀은 `renderDisplayValue`("-")로 표시(죽은 UI 아님, 채워지면 자동 표시).

### 1.2 데이터 모델 변경 — Flyway `V6__asset_demo_fields.sql`

기존 V5 `asset`는 수정 금지(적용 완료). **신규 V6로 컬럼 추가**(멱등 `ADD COLUMN IF NOT EXISTS`). 대원칙: **자유 확장 필드는 jsonb 하나에**, 필터·정렬·집계에 쓰는 축만 실제 컬럼으로 승격.

```sql
-- 데모식 분류 축 — 목록 필터/정렬/KPI 집계에 쓰므로 실제 컬럼으로 승격
-- device_type: zabbix 자산은 zabbix_data.tags에서 파생돼 동기화가 채우는 캐시 컬럼(사용자 미편집).
--              custom 자산만 사용자 선택. (cloud/onprem 대신 채택 — 2026-07-09)
ALTER TABLE asset ADD COLUMN IF NOT EXISTS device_type       varchar;      -- server|network|security|database|hardware|notClassified
ALTER TABLE asset ADD COLUMN IF NOT EXISTS coverage          varchar;      -- 'monitored'|'unmonitored' (동기화/파생 시 갱신 캐시)
ALTER TABLE asset ADD COLUMN IF NOT EXISTS resource_type     varchar;      -- ec2|rds|server|network_device...
ALTER TABLE asset ADD COLUMN IF NOT EXISTS lifecycle_status  varchar DEFAULT 'active';
ALTER TABLE asset ADD COLUMN IF NOT EXISTS deployment_status varchar;      -- inventory 매핑/표준화
ALTER TABLE asset ADD COLUMN IF NOT EXISTS owner_name        varchar;      -- 1차 자유입력(2차 user FK)
ALTER TABLE asset ADD COLUMN IF NOT EXISTS owner_user_id     integer;      -- 2차: MovesEye User 참조(nullable)
ALTER TABLE asset ADD COLUMN IF NOT EXISTS linked_hostid     varchar;      -- custom 자산이 별도 호스트에 연결(zabbix 자산은 zabbix_hostid와 동일)
-- 자유 확장(필터 안 쓰는 풍부 필드) — 비용(2차), 클라우드/위치 확장(있을 때만)
ALTER TABLE asset ADD COLUMN IF NOT EXISTS cloud_data        jsonb NOT NULL DEFAULT '{}'::jsonb;  -- AWS 자산일 때만: account/arn/region/vpc/subnet/sg/private_ip/exposure
ALTER TABLE asset ADD COLUMN IF NOT EXISTS cost_data         jsonb NOT NULL DEFAULT '{}'::jsonb;  -- Phase2 원천: purchase/maintenance/lease/depreciation/residual
CREATE INDEX IF NOT EXISTS idx_asset_device_type ON asset (device_type);
CREATE INDEX IF NOT EXISTS idx_asset_coverage    ON asset (coverage);
CREATE INDEX IF NOT EXISTS idx_asset_lifecycle   ON asset (lifecycle_status);
```

> `provider`(AWS 등)는 cloud/onprem 축을 뺐으므로 필수 컬럼에서 제외 — 필요 시 `cloud_data.provider`로 보관. Resource type도 별도 컬럼 대신 기기유형+inventory `type`로 표현(중복 축 제거).

**편집 소유권 규칙 확장**(v2 원칙 유지): `zabbix_data`·`device_type`·`coverage`·`deployment_status`(태그/inventory 파생분)는 **동기화 소유**. `lifecycle_status`·`owner_*`·`cost_data`·`cloud_data`(수동분)는 **사용자 소유**. 동기화가 사용자 분류를 덮지 않는다. (custom 자산은 device_type도 사용자 소유)

**Saved views**: 데모의 큐레이션 프리셋(Unmonitored / Public access review / Hardware EOL / Ownership review). 1차는 **하드코딩된 파생 필터 프리셋**(DB 저장 없이 FE 상수 + BE 쿼리 조건)으로 데모 4종 재현. 사용자 정의 저장 뷰는 2차(별도 `asset_saved_view` 테이블).

### 1.3 API 변경 (v2 계약 확장 — 파괴적 변경 최소화)

기존 9개 엔드포인트 경로·응답 골격 유지, **필드 추가**만. FE가 소비 중이므로 제거 금지.

| # | EP | 변경 |
|---|---|---|
| 2 | `GET /assets/summary` | KPI 재구성: 기존 total/zabbix/custom/excluded **유지** + **추가** `monitored`·`unmonitored`·`lifecycleReview`(만료임박/검토대상 수). 데모 카드 4종 = Total·Monitored·Unmonitored·LifecycleReview 로 FE 표시(zabbix/custom은 부가) |
| 1 | `GET /assets` | 필터 파라미터 추가: `deviceType`·`coverage`·`resourceType`·`lifecycle`·`deployment`·`owner`. `sortBy`에 신규 컬럼 추가. `savedView`(enum: unmonitored\|public_access\|hardware_eol\|ownership) 프리셋 파라미터 |
| 1 | `AssetListItemDto` | 컬럼 추가: `deviceType`·`resourceType`(inventory type)·`location`·`owner`·`coverage`·`linkedHostName`·`lifecycleStatus`·`deploymentStatus`(데모 테이블 컬럼과 1:1) |
| 3 | `GET /assets/{id}` | `AssetDetailDto`에 `deviceType`·`coverage`·`lifecycleStatus`·`deploymentStatus`·`owner`·`cloudData`·`costData`·`linkedHost` 추가. live 보강에 데모 우측 패널용 `status`·`group`·`lastCheck`·`openProblems` 확대(기존 available·activeProblemCount 확장) |
| 5·6 | `POST/PATCH /assets` | 신규 필드 편집 수용. zabbix 자산도 사용자-소유 신규 필드(lifecycle·owner·cost)는 편집 허용(스냅샷·device_type은 read-only 유지). custom 자산은 device_type도 편집 |
| — | `POST /assets/sync` | 동기화 시 `zabbix_data.tags`→`device_type` 파생 + inventory→`deployment_status`·날짜 파생 + `coverage` 재계산 |

### 1.4 화면 매핑 — 데모와 최대한 동일하게

기존 컴포넌트(`DmoveTable`·`DmoveTableFilter`·`Show`·`useTableColumns`)로 데모 레이아웃을 재현. **데모 구조를 목표로, 본제품 위젯으로 조립**.

#### (A) 목록 `/asset/list` — `AssetListPage.tsx` 개편
- **헤더**: 제목 `Assets` + 부제("N inventory records…") + 우상단 **[동기화][자산 생성]**(기존 유지) + 데모의 **[Import Excel]**(2차 — 1차 미노출).
- **KPI 카드 4개** — `AssetSummaryHeader.tsx` 개편: 현재 total/zabbix/custom/excluded → **Total · Monitored · Unmonitored · Lifecycle review**(데모 동일). zabbix/custom 카운트는 카드 아래 서브텍스트로 보존.
- **Saved views 바**(신규): 4개 프리셋 칩 + 카운트 뱃지. 클릭 시 `savedView` 파라미터로 목록 필터.
- **필터 드롭다운**(데모 세트로 확장): **기기유형(Device type)**·Coverage·Resource/HW(inventory type)·Lifecycle·Deployment·Owner. 기존 source·includeExcluded 필터는 유지(고급/부가). 기기유형 옵션은 `HostService.DEVICE_TYPES` 상수와 동일 6종.
- **테이블 컬럼**(데모 순서로 재구성): Asset(명+asset-id, →상세) · **기기유형** · Resource/HW(inventory type) · Location · Owner · **Coverage(● 점 색상)** · Linked Host(→Host) · Lifecycle 뱃지 · Deployment 뱃지 · Tags. 현재의 "inventory type/os·tag count" 컬럼은 이 세트로 대체.
- 정렬·페이지네이션·제외행 회색 처리(기존)·권한(`isSuperRole` 변경버튼) 유지.

#### (B) 상세 `/asset/list/:id` — `AssetDetailPage.tsx` 개편
- **상단 네비**: `‹ Back` + (데모의 "15 of 20" 순회 네비는 2차 — 목록 순서 상태 필요).
- **레코드 헤더**: `ASSET RECORD` 라벨 + 자산명 + breadcrumb(기기유형/resource/owner/Linked Host) + **상태 뱃지 3종**(coverage·lifecycle·deployment) + 우상단 [Archive(=제외)][Edit].
- **요약 바**: Asset ID · Asset tag · 기기유형·Resource/HW · Linked Host(링크) · Location · Owner.
- **Object attributes — 필드 그룹**(데모 핵심). cloud/onprem 분기 대신 **inventory 기반 공통 그룹**을 렌더하고, AWS 자산이면 클라우드 그룹을 추가:
  - `HW information`(vendor/model/serialno ← inventory) · `Cost information`(purchase/maintenance/… ← `cost_data`, 없으면 "Not captured") · `Location`(lat/lon/site_rack/site_address ← inventory) · `Network`(host_networks/netmask/router ← inventory). **대부분 기존 inventory로 즉시 채움**.
  - `AWS identification`/`Cloud network`(account/ARN/region/VPC/subnet/SG/exposure ← `cloud_data`) — **`cloud_data`가 있을 때만 표시**(AWS 자산). 없으면 그룹 자체 숨김(빈 그룹 안 그림).
  - 그룹 상단 `N fields` 카운트 표시(데모 동일).
- **우측 `Monitoring coverage` 패널**: Coverage · Linked Host(링크) · Host ID · Status(Healthy/Degraded) · Group · Last check · Open Problems · **[Open linked Host]**. → live 보강 확대분으로 채움(기존 available·activeProblemCount 확장).
- **Activity 타임라인**: `AssetActivityList.tsx` 재사용(기존). 데모의 ACTOR 유형(System/Integration/User) = 기존 actor_type(user/system)로 대응, Integration은 동기화 액션에 매핑.

#### (C) 생성/수정 폼 — `AssetFormModal.tsx` 개편 (데모는 전용 페이지, 본제품은 모달 유지 가능)
- 섹션: **Identity**(name·tag·notes) · **Ownership**(owner·contact) · **기기유형/분류**(device_type 셀렉트 6종 — custom 자산만 편집, zabbix는 태그 파생 읽기전용) · **Lifecycle**(status·deployment·purchase/install/expiry 날짜) · **HW/Location/Network**(inventory 필드) · **Monitoring coverage**(Linked Host 드롭다운).
- AWS 자산 옵션(체크 시 표시): AWS account/region/resource id/ARN/state/VPC/subnet/SG/IP/exposure(→ `cloud_data`). cloud/onprem 라디오는 없앰(기기유형이 분류축).
- zabbix 자산 수정: 스냅샷·device_type은 읽기전용 뱃지(태그 파생), 신규 사용자-소유 필드(lifecycle·owner·cost)는 편집 가능.
- 하단: [Validate][Create/Save][Reset][Cancel].

### 1.5 Phase 1 구현 단계 (승인 후, fullstack-feature)

| P | 담당 | 내용 |
|---|---|---|
| 1 | be-engineer | V6 마이그레이션 + 도메인 확장(device_type/coverage/lifecycle/owner/cloud_data/cost_data) + summary KPI 확장 + 목록 필터/컬럼/savedView + 상세 필드그룹·live 확대 + 동기화 파생(tags→device_type, coverage, deployment) + 편집 소유권 확장 + 테스트. **device_type 파생은 `HostService` 기존 로직과 규칙 공유(중복 구현 금지 — 공용 유틸 추출 검토)** |
| 2 | api-contract-sync | 확장 DTO ↔ FE 타입 대조 |
| 3 | fe-engineer | AssetSummaryHeader(4카드)·Saved views·필터 세트·테이블 컬럼·상세 동적 필드그룹·우측 coverage 패널·폼 섹션/플랫폼 라디오. i18n(en/kr) |
| 4 | integration-qa → functional-qa | 경계면 대조 → dev E2E: 동기화 후 coverage/deployment 채움 확인, 필터·saved view, 상세 그룹 렌더, 폼 편집 소유권 |

---

## Phase 2 — Costs (개요)

부제: "HW and Cloud cost review connected to Assets, Hosts, and AWS resource evidence." 3탭(Summary·HW·Cloud).

### 데이터 원천
- **HW 원천 = 자산 `cost_data`**(Phase1에서 컬럼 확보): purchase/maintenance/lease/depreciation/residual + inventory 만료일(`date_hw_expiry`). 자산당 1행 → HW Costs 테이블·Renewal candidates.
- **Cloud 원천 = AWS 사용량**: 계정/서비스/리전/리소스별 비용. 본제품엔 수집 경로 **없음** → AWS **Cost Explorer(ce:GetCostAndUsage) 또는 CUR** 연동 신규. [[aws-cred-single-source]] 자격증명 재사용(EC2/CloudWatch와 동일 체인).
- **파생 지표**(Budget/Forecast/Change rate/Priority): 예산 테이블(월 예산) + **이전월 스냅샷** 필요 → 배치 스냅샷 모델(리포트 스냅샷 [[hostgroup-report-feature]] 패턴 참고).

### 신규 저장 (개요 — V7+)
- `cost_budget`(월 예산, platform/owner별) · `cost_snapshot`(월별 자산·리소스 비용 스냅샷, previous/current 비교용) · AWS 비용은 수집 캐시 테이블 or 온디맨드.

### 화면 (데모 3탭 재현)
- **Summary**: KPI 2행(Total/HW/Cloud/Change/Forecast · Budget risk/Increase impact/Optimization/Lifecycle exposure) + 위젯(예산·movement·platform allocation·spend by owner·increase top N) + `Dashboard review queue` 테이블.
- **HW Costs**: KPI + Expiry window/Lifecycle mix/Spend by owner + Renewal candidates + Owned asset cost targets(자산 cost 필드 직결).
- **Cloud Costs**: KPI + Budget/Increase top N/Resource state/Spend by service·account + Adjustment candidates + AWS cost drivers.
- 차트는 **dataviz 스킬 + ECharts**(기존 스택), 도넛·막대. 라우트 `/cost`(또는 asset 하위 탭).

### Phase 2 난이도: **상** — 핵심 리스크는 AWS 비용 수집 경로(권한·비용 API 레이트·리전)와 예산/스냅샷 배치. 자산 cost_data는 Phase1에서 이미 준비됨.

---

## Phase 3 — Maps (개요)

### 3.1 Network Maps (신규, 난이도 상)
- 원천: Host / Host group / Trigger / Problem(**기존 모니터링 도메인 재사용**) + **링크 레코드·노드 배치(신규 저장)**.
- 신규 저장: `network_map`(맵 메타·main 여부) · `network_map_node`(placed host/group/trigger + 좌표) · `network_map_link`(엣지 + severity). CRUD + [Set as main] + [Edit].
- 화면: 그래프 캔버스(노드=Host/Group/Trigger, 엣지, Problem 경로 강조, severity 범례) + 우측 동적 상세 패널(OPERATING CONTEXT·TRIGGER SOURCE·LINK SOURCE·PROBLEM ATTACHMENT). 
- 렌더 기술 후보: 기존 **ECharts graph 시리즈**(force/그래프) 재사용 가능 → 신규 라이브러리 최소화 권장.

### 3.2 Geo Maps (부분 존재, 난이도 중상)
- **레거시 자산화**: 이미 `ServerLocationList`(`/server-locations` CRUD) + `MapViewList`(자산 좌표를 서버위치에 매핑, Mapbox)가 있음. 데모의 **클러스터 스코프 = 서버위치 묶음**으로 확장하면 재사용도 높음.
- 위치 좌표 원천 = 자산 inventory `location_lat`·`location_lon`(Phase1에서 상세 노출). **위치 팝업의 Assets 탭이 자산↔위치↔Host 핵심 연결**.
- 신규 저장: `geo_cluster`(스코프=위치 묶음) + 위치별 Problems/Hosts/Assets 집계. 마커 severity = 위치 내 호스트 상태 롤업.
- 화면: 좌측 Cluster scopes 리스트 + 우측 지도(마커) + 마커 팝업(Problems·Hosts·Assets 탭) + Map controls(severity 체크·Display 토글).

### 3.3 지도 타일 기술 — **MapLibre GL JS + OpenFreeMap 채택** (2026-07-09 사용자 결정)

**배포 환경이 폐쇄망일 수 있음** → 외부 타일 서버(Mapbox·CARTO 공개 타일)에 의존하는 방식은 부적합. **MapLibre GL JS**(렌더러, FE에 v5 이미 설치) + **[OpenFreeMap](https://openfreemap.org/)**(타일) 조합을 채택한다.

| 기준 | MapLibre + OpenFreeMap (채택) | Mapbox (레거시) | MapLibre + CARTO/OSM(데모) |
|---|---|---|---|
| 폐쇄망 적합 | ✅ **자체 호스팅 가능**(OpenFreeMap 서버 온프렘 구축) | ✗ 토큰·외부 서버 | △ 공개 타일 외부 의존 |
| 토큰/비용 | 불필요(오픈소스·무료) | 토큰·과금 | 무료(공개 서버) |
| 데모 룩 | 근접(벡터 타일) | 상이 | 동일 |
| 본제품 현황 | MapLibre GL JS 이미 설치, react-map-gl 호환 | 레거시가 사용 중 | 〃 |

**핵심 이점 — OpenFreeMap 자체 호스팅**: 공개 인스턴스(`https://tiles.openfreemap.org/…`)를 바로 쓰거나, **폐쇄망이면 자체 서버(planetiler로 tile 생성 + 정적 호스팅)로 전환**해도 스타일 URL만 교체하면 됨. 스타일: OpenFreeMap 제공 프리셋(`liberty`/`bright`/`positron`).

**적용 지침**
- 렌더러: MapLibre GL JS (`maplibre-gl` v5, 문서 https://maplibre.org/maplibre-gl-js/docs/ ). 레거시 `MapViewList`/`ServerLocationList`의 **Mapbox → MapLibre 재작성**(react-map-gl은 maplibre 모드 지원 → 마커/팝업 API 유사).
- 타일 소스: 스타일 URL을 **환경변수/설정으로 주입**(`VITE_MAP_STYLE_URL`) → 공개 OpenFreeMap ↔ 자체 호스팅 무코드 전환. 기본값 = OpenFreeMap 공개 인스턴스.
- Mapbox 토큰(`pk.eyJ1Ijoi…`) 하드코딩 제거.
- ⚠️ 확인: 자체 호스팅 시 한국 영역 벡터 타일 생성 범위(전역 planet vs 한국 추출)·초기 구축 비용.

---

## 4. 교차 관심사

- **IA/네비게이션**: 데모는 INVENTORY 그룹에 Assets·Costs·Maps. 본제품은 현재 asset 라우트 하위에 list/detail/mapview/serverlocation. → 개편 시 **Assets(list/detail) · Costs · Maps(Network/Geo)** 로 사이드바 재편(`SideNav.tsx` `getItem`). 레거시 mapview/serverlocation는 Geo Maps로 흡수 or 존치 결정 필요.
- **권한**: v2 규칙 유지 — 조회=인증 사용자, 변경(동기화/생성/수정/제외/맵·클러스터 CRUD/예산 편집)=`isSuperRole`+`AdminAccessChecker.requireAdmin`. ([[report-management-feature]] 패턴)
- **i18n**: 신규 키 en/kr 양쪽(⚠️ kr.json 누락 주의). asset_field.* 최대 재사용 + device_type(기존 호스트그룹 기기유형 키 재사용)·coverage/lifecycle/deployment/cost/map 신규 키.
- **계약 보존**: v2 기존 9 EP 응답 골격 유지(필드 추가만), 파괴적 변경 금지 — FE 소비 중.

## 5. 미확정 — 착수 전 확인

| # | 항목 | 상태/제안 |
|---|---|---|
| 1 | ~~Platform(cloud/onprem) 분류~~ | ✅ **확정(07-09): 기기유형(device_type 태그)으로 대체.** zabbix 자산 즉시 파생 |
| 2 | ~~지도 타일~~ | ✅ **확정(07-09): MapLibre GL JS + OpenFreeMap(폐쇄망 시 자체 호스팅).** §3.3 |
| 3 | ~~Owner 모델~~ | ✅ **확정(07-09): 1차 자유입력(owner_name).** 2차 User FK(owner_user_id 예약) |
| 4 | Saved views — 하드코딩 프리셋 vs 사용자 저장 | 1차 데모 4종 하드코딩, 2차 저장 테이블 |
| 5 | Costs 배치/예산 UX(예산 입력 화면·스냅샷 주기) | 리포트 스냅샷 패턴 준용, Phase2에서 상세 |
| 6 | 레거시 MapViewList/ServerLocation 흡수 vs 존치 | Geo Maps로 흡수 + Mapbox→MapLibre 재작성 권장 |
| 7 | 상세 순회 네비("N of M") 1차 포함 여부 | 2차(목록 순서 상태 필요) |
| 8 | device_type 파생 유틸 공용화(HostService와 공유) | 공용 유틸 추출(중복 구현 금지) |

## 6. 요약 로드맵

| Phase | 영역 | 신규 저장 | 난이도 | 데모 일치 핵심 |
|---|---|---|---|---|
| **1** | Assets 개편 | V6 컬럼(device_type/coverage/lifecycle/owner/cloud_data/cost_data) | 중 | KPI 4종·Saved views·데모 컬럼·기기유형 분류·필드그룹·coverage 패널 |
| **2** | Costs | 예산·스냅샷 테이블 + AWS 비용 수집 | 상 | 3탭(Summary/HW/Cloud), cost_data 직결 |
| **3** | Maps | network_map(+node/link)·geo_cluster | 상(Geo 중상) | 그래프 맵·클러스터 스코프, 레거시 ServerLocation 재사용 |
