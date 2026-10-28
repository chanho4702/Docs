# MovesEye Demo 분석 — Assets · Costs · Maps (이관 기준 문서)

> 원천: https://moveseye-demo.vercel.app (Vercel SPA, 클라이언트 렌더링)
> 분석일: 2026-07-09 · 방법: Claude Chrome 확장으로 각 페이지 순회 캡처
> 목적: 데모의 Assets / Costs / Maps 화면을 MovesEye 본제품(`moveseyee_fe` + `moveseye-be-spring`)으로 이관하기 위한 **문서화**(이번 세션은 구현 아님)
> 데모 데이터 규모: 자산 20건(cloud 9 / onpremise 11 성격), Host 16대, AWS 계정 1(moveseye-prod), 소유자 6명

---

## 0. 데모 전체 IA (네비게이션)

좌측 사이드바 그룹 구조:

- **Dashboards** (= /overview)
- **MONITORING**: Problems · Hosts
- **INVENTORY**: **Assets · Costs · Maps(Network Maps · Geo Maps)**  ← 본 문서 대상
- **MANAGEMENT**: Triggers · Reports · Administrations · MyPage

> 참고: 본제품에는 이미 Assets v2가 구현됨([[assets-core-devdesign]]). 데모의 Assets는 본제품 v2 모델(source=zabbix/custom, Linked Host, inventory 필드)과 **개념이 거의 일치**한다. 반면 **Costs·Maps는 본제품 자산 설계서 §8의 2차 로드맵 항목**이라 이번 분석이 그 착수 입력이 된다.

> ⚠️ **데모 백엔드 = Notion API** (대시보드 하단 노출: "Notion token is configured and the API is reachable. Notion credentials are kept server-side in Vercel Functions."). 즉 데모의 모든 데이터(자산·비용·맵·문제)는 **Notion DB에 시드**되어 Vercel Functions로 서빙된다. 본제품 이관 시 이 데이터는 참고용 목업일 뿐 — 실제 원천은 Zabbix/AWS/MovesEye DB로 대체된다.

---

## 0.5 Dashboards `/overview` (모니터링 개요)

데모 진입 화면. 본제품의 `/overview`(Default.tsx 대시보드)와 대응하는 **모니터링 운영 요약** 페이지.

**상단 필터 바**:
- 검색: "Search problem, host, owner, impact"
- 시간범위: Last 15m / Last 1h / Last 24h
- All severities: Critical / High / Medium / Low
- All host groups: API Services / Web Delivery / Worker Platform
- **[Refresh]** + 활성 필터 칩(Range: Last 1h · Severity: All · Host group: All)

**KPI 카드 4개**: `Open problems(4)` · `Critical problems(1)` · `Impacted hosts(4, "2 hosts degraded/critical")` · `Monitoring coverage(90%, "Inventory records with linked coverage")`

**막대 위젯 3개**:
- `Severity distribution`: Critical / High / Medium / Low / Info (건수)
- `Host posture`: Critical / Degraded / Healthy (건수)
- `Signal flow`: Open / Acknowledged / Unmonitored (건수)

**리스트/테이블**:
- `Open problem flow` (+[View queue]): 최근 문제 흐름 — severity 뱃지 + 제목 + "on {host}" + 시각(GMT+9)
- `Unstable hosts`: Degraded/Critical 호스트 카드 — 상태 뱃지 + host + "group / location"
- `Open problems` 테이블 (+[View all]): ID(PRB-xxx) · Problem · Severity · Status(Open/Acknowledged/Suppressed) · Host · Updated

> 이관 메모: 대시보드는 **Assets/Costs/Maps가 아닌 Monitoring 도메인**이며, 본제품에 이미 유사 개요 화면 존재. `Monitoring coverage 90%`·`Impacted hosts`는 **자산↔Host coverage 링크**(§1.2 Monitoring coverage)를 집계한 값 → 자산 모델과 연결점. Problem/Severity/Host posture는 기존 Zabbix Problem·Host 상태로 충족 가능.

---

## 1. Assets

### 1.1 목록 페이지 `/assets`

**헤더**: 제목 `Assets` + 부제 "20 inventory records across cloud and on-premises assets." + 우상단 액션 **[Import Excel] [Create asset]**

**KPI 카드 4개**: `Total assets 20` · `Monitored 18` · `Unmonitored 2` · `Lifecycle review 0`

**Saved views**(저장된 필터 프리셋, 카운트 뱃지): `Unmonitored (2)` · `Public access review (1)` · `Hardware EOL (0)` · `Ownership review (20)`

**검색바**: "Search asset, tag, owner, location, Host, serial"

**필터 드롭다운** (+ Reset):
| 필터 | 옵션 |
|---|---|
| All platforms | cloud, onpremise |
| All coverage | monitored, unmonitored |
| All resource / HW | Cloud resource, cloudfront, ecs, network_device, rds, s3, security_appliance, server, storage_device |
| All lifecycle | active (데모 데이터엔 active만) |
| All deployment | deployed, maintenance |
| All providers | AWS |
| All owners | Hana Kim, Jiwoo Han, Joon Lee, Mina Park, Minseok Jung, Sora Choi |

**테이블 "Asset inventory"** (Showing 20 of 20, 서버/클라 정렬·페이지네이션):
| 컬럼 | 내용 | 비고 |
|---|---|---|
| Asset | 자산명 + asset-id(예: asset-1006) | →상세 링크, 정렬 |
| Platform | cloud / onpremise | 정렬 |
| Resource / HW | Cloud resource, network_device, rds, s3, ecs, cloudfront … | 정렬 |
| Provider / location | cloud=AWS / onprem=물리 위치 경로(예: "Busan DR Center / Network room / Rack B2") | 정렬 |
| Owner | 소유자명 (미지정=빈값) | 정렬 |
| Coverage | ● monitored / ● unmonitored (점 색상) | 정렬 |
| Linked Host | 연결 Host명(예: web-prod-03, *.moveseye.local) | →Host 링크, 정렬 |
| Lifecycle | `active` 뱃지 | 정렬 |
| Deployment | `deployed` / `maintenance` 뱃지 | 정렬 |
| Tags | key:value 태그 / "No tags" | — |

페이지네이션: Rows per page 10 · Page 1 of 2.

### 1.2 자산 상세 `/assets/{assetId}`

- **상단 네비**: `‹ Back to Assets` · 중앙 위치표시 "15 of 20 in Assets" · `‹ Previous` / `Next ›` (목록 순서로 순회)
- **레코드 헤더**: 라벨 `ASSET RECORD` + 자산명 + breadcrumb(`platform / resource / owner / provider / Linked Host`) + 상태 뱃지 3종(`monitored` `active` `deployed`) + 우상단 **[Archive] [Edit asset]**
- **요약 바**: Asset ID · Asset tag · Resource/HW · Linked Host(링크) · Provider/location · Owner
- **Object attributes** — 필드 그룹이 platform/resource 유형에 따라 **동적**. 상단에 `N fields` 카운트.

  **클라우드 자산 (예 asset-1006, 26 fields)**:
  - `Common fields - Basic information`: Asset ID, Name, Platform, Owner ID, Owner name, Discovered by(예: aws_config), Notes
  - `Lifecycle`: Lifecycle status, Deployment status
  - `Monitoring coverage`: Monitoring coverage, Linked at, Linked Host ID
  - `Cloud resource - AWS identification`: AWS account ID, account name, partition(aws), region(ap-northeast-2), resource ID, ARN
  - `Cloud resource - Service and compute`: Resource name, Resource state(running)
  - `Cloud resource - Network`: VPC ID, Subnet ID, Security group IDs, Private IP, DNS name, Internet exposure(Exposed/…)

  **온프레미스 자산 (예 asset-1020, 32 fields)**:
  - `Common fields - Basic information`: Asset ID, Name, Platform, Last synced at, Discovered by(예: discovery)
  - `Lifecycle`: Lifecycle status, Deployment status
  - `Monitoring coverage`: Monitoring coverage, Linked at, Linked Host ID
  - `On-premises HW - HW information`: HW type, Vendor(예 Arista), Model(예 7050SX3), Serial number A
  - `On-premises HW - Cost information`: Purchase cost, Maintenance cost, Lease/rental cost, Depreciation cost, Residual value (값 없으면 "Not captured") ← **Costs 탭과 직접 연결되는 원천**
  - `On-premises HW - Location information`: Location, Location address A/B/C, latitude, longitude, Floor, Room, Rack number, Rack unit ← **Geo Maps 좌표 원천**
  - `On-premises HW - Network`: Host networks(예 10.50.10.0/24), Host netmask, Host router

- **우측 패널 `Monitoring coverage`**: Coverage · Linked Host(링크) · Host ID · Status(Healthy/Degraded…) · Group(Host group) · Last check · Open Problems(수) · **[Open linked Host]** 버튼
- **Activity 타임라인**: 시각(GMT+9) · 이벤트명 · `ACTOR`(행위자명 + 유형 System/Integration/User) · 설명. 예: "Lifecycle milestone captured / Asset Lifecycle Rule / System", "Cloud inventory sync completed / AWS Inventory Sync / Integration", "Asset record created / Inventory Administrator / User".

### 1.3 Add Asset 폼 `/assets/create` (전용 페이지, 모달 아님)

상단 요약 바에 실시간 상태: `Mode: Add Asset` · `Platform` · `Lifecycle` · `Linked Host` · `Changed fields N`. 우측에 **Draft fields**(변경 필드 실시간 추적) 패널.

**공통 섹션**:
- `Identity`: Asset name, Asset tag(key:value 추가형 — "Existing keys are replaced when added again"), Notes
- `Ownership`: Owner(드롭다운, 각 항목 "이름 / role / scope"), Contact
- `Lifecycle`: Lifecycle status(active/planned/retired/expired), Deployment status(planned/deployed/maintenance/retired/failed), Purchase date, Install date, Expiry/EOL date, Decommission date
- `Platform`: Asset platform(**Cloud / On-premises** 라디오 — 이하 필드 세트를 전환) + provider/HW type
- `Monitoring coverage`: Linked Host(드롭다운, "host / hostid / Status / Group")

**Cloud 선택 시 — `Cloud resource fields`**:
- Registration method(Manual / Import ← Excel/AWS import 드래프트)
- AWS account ID, AWS region, Availability Zone, AWS resource ID, AWS ARN
- Resource name, Resource state(running/stopped/available), Instance type, Engine, Engine version
- VPC ID, Subnet ID, Security group IDs, Network interface IDs, Private IP, Public IP, DNS name, Internet exposure
- Related AWS resource(드롭다운 — 기존 리소스 연관)
- AWS resource type 옵션: ec2, rds, s3, elb, vpc, cloudfront, route53, lambda, ecs, eks, elasticache, dynamodb, opensearch, sqs, sns, api_gateway, efs, ebs, other

**On-premises 선택 시 — `On-premises asset fields`**:
- HW type: server, network_device, storage_device, security_appliance, load_balancer, power_device, rack, environmental_device, other
- Vendor, Supplier, Model, Serial number A, Serial number B, MAC address
- Hardware, Hardware full, OS, OS full, Software, Software full
- Location address A/B/C, Location latitude, Location longitude, Floor, Room, Rack number, Rack unit
- Contract number, Installer name
- Host networks, Host netmask, Host router

하단 액션: **[Validate] [Create Asset] [Reset] [Cancel]**

### 1.4 본제품 v2 대비 갭 (이관 시 검토)
- 데모의 필드 세트가 본제품 v2보다 **훨씬 풍부**(AWS identification 6필드, On-prem Cost 5필드, Location 11필드). 본제품 v2 `AssetZabbixData`는 groups/interfaces/inventory/tags 스냅샷 중심 → **inventory 표준키에 이 필드들을 매핑**할지, 별도 컬럼으로 승격할지 결정 필요.
- 데모는 **On-prem Cost 필드(purchase/maintenance/lease/depreciation/residual)를 자산에 내장** → 아래 Costs 탭의 HW 원천. 본제품 v2엔 없음 → 신규.
- 데모 Discovered by / Registration method(Manual/Import/discovery/aws_config) = 본제품 v2 `source`(zabbix/custom) + 동기화 개념과 대응하나 세분화됨.
- Saved views(Unmonitored/Public access review/Hardware EOL/Ownership review) = 본제품엔 없는 **큐레이션 프리셋** 기능.

---

## 2. Costs `/costs` (3 탭: Summary · HW Costs · Cloud Costs)

부제: "HW and Cloud cost review connected to Assets, Hosts, and AWS resource evidence."
공통 검색: "Search owner, asset, account, service, resource"
공통 필터: All platforms(HW/Cloud) · All priorities(High/Medium/Low) · 정렬(Cost amount/Change rate/Forecast cost/Priority)

### 2.1 Summary 탭 `/costs`
**KPI 1행**: Total cost($14,755) · HW cost($11,320) · Cloud cost($3,435) · Change rate(+14.9%) · Forecast($15,352 Month-end estimate)
**KPI 2행**: Budget risk(1, "+59% forecast burn") · Increase impact($1,910, current−previous) · Optimization candidates(0) · Lifecycle exposure($0.00, HW near expiry)
**위젯**:
- `Budget and forecast review`: 월 총 운영예산 대비 진행 막대(예 $26,000, "N records forecast above budget")
- `Cost movement`: Previous / Current / Forecast 막대 + "Increase impact / decrease offset"
- `Platform allocation`: HW vs Cloud 분할
- `Spend by owner`: 소유자별 지출 순위
- `Increase impact Top N`: 증가폭 상위 자산/리소스
- `Optimization opportunities`: 최적화 후보(없으면 안내문)
**테이블 `Dashboard review queue`** (Top 6 of 12): Cost driver(이름+메타) · Platform(hw/cloud) · Cost · Change(%) · Forecast · Priority(high/medium/low) · Budget(Budget risk / Within budget)

### 2.2 HW Costs 탭 `/costs/hw`
부제: "Owned Asset cost and lifecycle review."
**KPI**: HW total($11,320) · Change rate(+14.3%) · Forecast($11,680) · Expiry exposure($0.00, "N contracts/warranties in review window")
**위젯**: `Expiry window`(Within 30 / 31-60 / 61-90 days 금액) · `Lifecycle cost mix`(도넛, lifecycle별) · `Spend by owner`(도넛)
**테이블 `Renewal candidates`** (Top N): Renewal candidate · Owner · Lifecycle · Expiry(날짜/No expiry) · Change · Cost · Linked Host(연결/Unlinked)
**필터**: All owners · All locations · All lifecycle · All vendors(Dell/HPE/Palo Alto Networks/Pure Storage/Supermicro)
**테이블 `Owned Asset cost targets`**: Asset cost · Owner · Location · Lifecycle · Vendor · Expiry · **Cost · Purchase · Maintenance · Lease · Depreciation · Residual** · Linked Host
→ 원천은 §1.2 온프레미스 자산의 `On-premises HW - Cost information` 필드.

### 2.3 Cloud Costs 탭 `/costs/cloud`
부제: "AWS usage cost exploration by account, service, region, and resource."
**KPI**: Cloud total($3,435) · Change rate(+16.6%) · Forecast($3,672) · Budget risk(0) · Optimization candidates(0)
**위젯**: `Budget and forecast review`(클라우드 예산) · `Increase impact Top N`(리소스별 증가 USD) · `Resource state review`(도넛 running/available) · `Spend by service`(도넛: AmazonRDS/EC2/ECS/APIGateway/ELB/S3) · `Spend by account`(도넛: moveseye-prod)
**테이블 `Adjustment candidates`**(조정 후보, 없으면 empty): Adjustment candidate · Account · Service · State · Cost status · Cost · Opportunity
**필터**: All accounts(moveseye-prod) · All services(AmazonAPIGateway/EC2/ECS/RDS/S3/ElasticLoadBalancing) · All regions(ap-northeast-2) · All states(available/running)
**테이블 `AWS cost drivers`**: AWS resource · Account · Service · Region · State · Cost · Budget(Within budget/Budget risk)

### 2.4 이관 메모
- **HW 원천 = 자산의 On-prem Cost 필드**, **Cloud 원천 = AWS 사용량(계정/서비스/리전/리소스)**. 본제품엔 AWS 비용 수집 경로 필요 — [[aws-cred-single-source]](EC2+CloudWatch 자격증명 하이브리드)와 연결, Cost Explorer/CUR 연동 검토.
- Budget/Forecast/Priority/Change rate는 파생 계산 필드 — 예산 테이블 + 이전월 스냅샷 필요.
- 본제품 자산 설계서 §8-4("정의서 Costs·AWS 수집 접점 재평가")의 구체 요구가 여기 대응.

---

## 3. Maps `/maps` (Network Maps · Geo Maps)

### 3.1 Network Maps `/maps/network`
목록 부제: "Maps are generated from placed Hosts, Host groups, Triggers, link records, and open Problem evidence."
- 상단: 검색("Search map name or summary") · 필터(All problem states) · **[Create map]**
- **목록 테이블** (예 3 maps): Map(이름+요약) · Network("N nodes / M links") · Problems(오픈 수 뱃지) · Updated(시각)
  - 예: "Network edge monitoring"(8 nodes/6 links, 0) · "Checkout service network path"(13/13, 3) · "Network operations overview"(17/18, 3)

**맵 상세 `/maps/network/{slug}`**:
- 상단: `‹ Back to Network Maps` · 우상단 토글 **[Set as main map]** + **[Edit map]**
- **그래프 캔버스**: 노드 = Host(H 아이콘) / Host group(박스 컨테이너, 예 "Worker Platform", "Data Platform / No Hosts") / Trigger 노드 / cloud·server 리소스 노드. 노드에 IP·유형·`Status: Healthy/Warning/Critical` 표기. 링크(엣지)로 연결, Problem 발생 경로는 색상 강조. 줌 컨트롤(+/−) · `Map controls`. 하단 `SEVERITY` 범례: No problems / Information / Low / Medium / High / Critical.
- **우측 상세 패널**(선택 요소별 동적):
  - 헤더: 요소명 + `platform / severity`(예 "mixed / Warning") + 종류(Trigger/Host…)
  - 카운트: **LINKS · PROBLEMS · MEMBERS**
  - `OPERATING CONTEXT`: Element kind, Platform, Owner, Location, Source
  - `TRIGGER SOURCE`(트리거 선택 시): Trigger, Template(예 "Linux by Zabbix agent active"), Expression(예 `last(/…/vfs.fs.pused[/])>{$VFS.FS.PUSED.MAX.WARN}`), Last change, Problem
  - `LINK SOURCE`: 링크 severity + 영향 경로 설명 + affected Problems 수
  - `PROBLEM ATTACHMENT`: 연결 Problem 목록(severity, 제목, Possible cause)
  - `Problem overlay`: 선택 요소에 붙은 오픈 Problem(예: PRB-502 medium Acknowledged … / PRB-506 info Closed …) + **[Open Host]**

### 3.2 Geo Maps `/maps/geo`
부제: "Location-based Host status map for grouped locations, selected context, and operational drilldown."
- **좌측 `Cluster scopes`**: 검색("Search cluster or host") · "N scopes" · **클러스터 카드**(이름 + severity 뱃지 + "N locations · N hosts · N problems")
  - 예: Capital access cluster(critical, 2/2/2) · Southern operations and DR(medium, 5/6/1) · Central operations cluster(high, 3/3/1) · APAC cloud edge(info, 4/4/0)
- **우측 지도**: MapLibre(© CARTO · © OpenStreetMap), 한국 기반. 위치 마커(severity 색상).
- 우상단 **[Create cluster]**

**클러스터 상세 `/maps/geo?cluster=…`**:
- 상단: `‹ Back to clusters` · **[Set as main map]** + **[Edit cluster]**
- 지도에 스코프 내 위치 마커 표시(부제: "marker detail loads when a location is selected")
- **마커 클릭 → 위치 팝업**: 위치명(예 "Seoul Core IDC") + 경로("App hall A / Rack S12 / Location") + severity 뱃지 + **탭 3종: Problems · Hosts · Assets**(각 카운트). Problems 탭엔 Problem 카드(severity, 제목, Host, Possible cause).
- **지도 컨트롤 `Map controls`**:
  - `SEVERITY` 체크박스: No problems / Information / Average / Disaster / Not classified / Warning / High
  - `DISPLAY` 토글: Hosts · Problems · Links

### 3.3 이관 메모
- Network Map은 본제품 자산 설계서 §8-4의 "Maps 접점"에 해당. 노드 원천 = Host/Host group/Trigger/Problem(기존 모니터링 도메인) + 링크 레코드(신규 저장 필요). **맵 CRUD(Create/Edit/Set as main) + 노드 배치(placed Hosts) 저장 모델**이 신규 과제.
- Geo Map의 위치 좌표 원천 = 자산 On-prem `Location latitude/longitude`(§1.2). **위치 팝업의 Assets 탭이 자산↔위치↔Host를 잇는 핵심 연결**. 클러스터 = 위치 묶음(스코프) 저장 모델 신규.
- 지도 타일: MapLibre + CARTO/OSM (외부 타일). 본제품 도입 시 타일 소스·라이선스·오프라인/폐쇄망 여부 확인 필요.

---

## 4. 이관 우선순위·과제 요약

| 영역 | 본제품 현황 | 이관 난이도 | 핵심 신규 과제 |
|---|---|---|---|
| Assets | v2 구현됨([[assets-core-devdesign]]) | 중 | 데모의 풍부한 필드셋(AWS ident·On-prem Cost·Location 11필드) 매핑, Saved views, Import Excel |
| Costs | 없음(설계서 §8 2차) | 상 | HW 원천=자산 Cost필드 / Cloud 원천=AWS 사용량 수집([[aws-cred-single-source]]), 예산·예측·우선순위 파생 |
| Network Maps | 없음(§8 2차) | 상 | 맵 CRUD + 노드배치 저장 + Trigger/Problem 오버레이 + 링크 레코드 |
| Geo Maps | 없음(§8 2차) | 상 | 클러스터/위치 스코프 저장, 지도 타일(MapLibre) 도입, 위치↔Host↔Asset 연결 |

**미확인/후속 필요**:
- Edit(자산·맵·클러스터) / Import Excel / Create map / Create cluster 폼 상세는 미열람(필요 시 추가 캡처).
- 데모는 인증 없는 공개 데모라 권한·역할별 노출 차이는 확인 불가.
- 데모 소스코드 확보 시 라우트/컴포넌트/데이터모델을 코드에서 직접 대조하면 이관 정밀도 상승(현재는 렌더링 관찰 기반).
