# MovesEye 자산관리(Assets) 메뉴 — 통합 설계 정의서

> 작성일: 2026-07-03
> 원천: Confluence ZM(MovesEye) 스페이스 기획 문서 5건 스캔·통합
>
> | # | 문서 | 상태 |
> | --- | --- | --- |
> | 1 | [01. Assets (자산 관리)](https://dmove.atlassian.net/wiki/spaces/ZM/pages/37183258710) | 2026-05-31 수정 |
> | 2 | [01-1. Cost (비용 모니터링) - 컨셉](https://dmove.atlassian.net/wiki/spaces/ZM/pages/37190828047) | 2026-05-31 수정 |
> | 3 | [01-2. Maps (맵 뷰)](https://dmove.atlassian.net/wiki/spaces/ZM/pages/37188538436) | 작성 중(live doc) |
> | 4 | [[자산목록] 엑셀업로드](https://dmove.atlassian.net/wiki/spaces/ZM/pages/37098684437) | 참고(연계) |
> | 5 | [자산관리 기능 (Zabbix Inventory)](https://dmove.atlassian.net/wiki/spaces/ZM/pages/36902731850) | 초안(연계) |
>
> ⚠️ **미스캔 자료(화이트보드 3건)** — MCP로 접근 불가. 확정 전 확인 필요:
> - Assets User Flow: `wiki/spaces/ZM/whiteboard/37188472147`
> - Assets 조회 API Sequence: `wiki/spaces/ZM/whiteboard/37188896497`
> - Cost 사용 흐름: `wiki/spaces/ZM/whiteboard/37194530900`
>
> 데모: https://moveseye-demo.vercel.app/assets · /costs · /maps/network

---

## 1. 전체 구조

자산관리 메뉴는 3개 서브 도메인으로 구성된다.

```
자산관리 (Assets 메뉴)
├── Assets   : 자산 인벤토리 CRUD + Host 연결 + Excel 업로드 + Zabbix Inventory 동기화 + Activity
├── Costs    : 비용 모니터링 (Dashboard / HW Costs / Cloud Costs / Cloud Cost Detail)
└── Maps     : 맵 뷰 (Network Maps[2D 토폴로지] / Geo Maps[지리] / Clustering Map)
```

### 1.1 핵심 도메인 개념

| 개념 | 정의 |
| --- | --- |
| **Asset(자산)** | 회사가 보유/운영하는 인프라 인벤토리 레코드. Cloud + On-premise 통합 관리 |
| **Host(호스트)** | 모니터링 대상. 운영 지표·Problem·템플릿과 연결됨 (기존 MovesEye 모니터링 도메인) |
| **Cost(비용)** | Asset에 연결되는 비용 레코드 (HW: 구매/유지보수/리스, Cloud: 사용량 기반) |

### 1.2 관계 모델

```
Asset ── 0:1 or 1:1 ── Host        (linkedHostId; Asset:Host = 1:0 / 0:1 가능)
Asset ── 1:N ── Cost               (cost.assetId; HW 필드에는 역방향 costId 존재)
Asset ── 1:N ── ActivityLog        (생성·수정·연결·동기화·보관 이력)
Maps  ── 참조 ── Host / HostGroup / Trigger   (Asset의 location(위경도)은 Geo Maps 좌표 소스)
```

- **Asset ↔ Host 구분이 설계의 축**: 모니터링되는 자산(monitored)과 커버리지 공백 자산(unmonitored)을 구분해 보여주고, 모니터링이 필요하면 Host Detail로 이동시킨다.
- 탐색 흐름: `Asset 목록 → Asset Detail → Linked Host → Host Detail → 운영지표/Problem` (+ 역방향 Cost → Asset/Host Detail).

---

## 2. 데이터 정의

### 2.1 Asset 공통 필드

`*` = 필수. "시스템" = 사용자 입력이 아닌 MovesEye 내부 처리 값.

| 구분 | 필드 | 설명 | obj 연결 | 시스템 | 생성/편집 입력 |
| --- | --- | --- | --- | --- | --- |
| 기본 | id (assetId) | Asset 식별자 | | ✅ | |
| | name\* | 자산명 | | | ✅ |
| | assetTag | 자산 태그 | | | ✅ |
| | platform\* | 운용 플랫폼 구분 | | | ✅ |
| | ownerId | 담당 User/Team ID | ✅ | ✅ | ✅ (존재하는 User/Team 선택) |
| | ownerName | 담당 표시명 | | ✅ | |
| | lastSyncedAt | 마지막 동기화 시점 | | ✅ | |
| | discoveredBy | 수집 경로 | | ✅ | |
| | notes | 메모 | | | ✅ |
| Lifecycle | lifecycleStatus\* | 수명주기 상태 | | | ✅ |
| | deploymentStatus | 배포/운영 상태 | | | ✅ |
| 커버리지 | monitoringCoverage\* | Host 연결 여부 | | ✅ (연결 여부로 자동 산출) | |
| | linkedAt | Host 연결 일시 | | ✅ | |
| | linkedHostId | 연결 Host ID | ✅ | ✅ | |

### 2.2 사용자 지정 필드 (Custom Field)

- 형식: `${key}:${value}` — `Map<K, V>`
- key: `string` / value: `string | number | date | datetime`
- 예: key `점검예정일시` → value `2026-05-27T13:52:00`

### 2.3 주요 enum

| 필드 | 값 | 필터 사용 |
| --- | --- | --- |
| platform | `onpremise`, `cloud` | ✅ |
| discoveredBy | `manual`, `aws_config`, `aws_api`, `discovery` | |
| lifecycleStatus | `active`, `planned`, `retired` (+ `expired`? **미확정**) | |
| deploymentStatus | `planned`, `deployed`, `maintenance`, `retired`, `failed` | |
| monitoringCoverage | `monitored`, `unmonitored` | ✅ |
| hwType | `server`, `network_device`, `storage_device`, `security_appliance`, `load_balancer`, `power_device`, `rack`, `environmental_device`, `other` | |
| awsResourceType | `ec2`, `rds`, `s3`, `elb`, `vpc`, `cloudfront`, `route53`, `lambda`, `ecs`, `eks`, `elasticache`, `dynamodb`, `opensearch`, `sqs`, `sns`, `api_gateway`, `efs`, `ebs`, `other` | |
| resourceState | `running`, `stopped`, `available` | |

### 2.4 온프레미스 HW 필드

| 구분 | 필드 |
| --- | --- |
| HW 정보 | dateHwPurchase(구매일), dateHwInstall(설치일), dateHwExpiry(만료/EOL), dateHwDecomm(폐기예정일), hwType, vendor, provider/supplier, model, serialNumberA/B, macAddress, hardware(요약), hardwareFull(상세), contractNumber, installerName |
| SW 정보 | os, osFull, software, softwareFull |
| Location | location, siteAddressA/B/C, locationLat(경도), locationLon(위도), floor, room, rackNumber, rackUnit |
| Network | hostNetworks(대역), hostNetmask, hostRouter |
| 비용 | costId (obj 연결 ✅) |

> locationLat/Lon은 Geo Maps의 핀 좌표 소스로 재사용된다 (§5.3).

### 2.5 클라우드 리소스 필드 (AWS 기준)

| 구분 | 필드 |
| --- | --- |
| AWS 식별 | awsAccountId(12자리), awsAccountName, awsRegion, availabilityZone, awsResourceType, awsResourceId, awsArn |
| 서비스/컴퓨팅 | resourceName(Name tag), resourceState, instanceType, resourceClass, engine, engineVersion, resourceCreatedAt |
| 네트워크 | vpcId, subnetId, securityGroupIds[], networkInterfaceIds[], privateIp, publicIp, dnsName, internetExposure |
| 관계 | relatedAwsResources (AWS Config/API로 확인) |

> **AWS 자동 수집으로 불러온 데이터는 수정 불가.**

### 2.6 Validation 규칙

1. 필수값: `name`, `platform`, `lifecycleStatus` (+ `monitoringCoverage`는 시스템 산출).
2. `linkedHostId` 입력 시 실제 Host 존재 검증 — 없는 Host 연결은 차단.
3. enum 필드는 지정된 값만 허용.
4. HW 날짜 순서 검토: `dateHwPurchase <= dateHwInstall <= dateHwExpiry <= dateHwDecomm`.

### 2.7 Cost 데이터 필드

**공통**

| 구분 | 필드 | 설명 |
| --- | --- | --- |
| 비용 공통 | id | Cost ID |
| | costPeriodStart / costPeriodEnd | 집계 기간 |
| | costAmount | 선택 기간 비용 |
| | currency | 통화 (USD, KRW 등) |
| | previousCostAmount | 비교 기간 비용 |
| | costChangeRate | 기준 기간 대비 변화율 |
| | forecastCostAmount | 월말 예상 비용 |
| | costPriority | 확인 우선순위 (high/medium/low) |
| | lastSyncedAt | 마지막 동기화 |
| 예산 | budgetAmount, budgetPeriodStart/End | 기간 예산 |
| 연결 | assetId | Asset 데이터 연결 |

**HW 전용**: purchaseCostAmount(구매), maintenanceCostAmount(유지보수), leaseCostAmount(리스/임대), depreciationCostAmount(감가상각), residualCostAmount(잔존가액)

**Cloud 전용**: usageType(과금 유형, 예 `BoxUsage:m6i.large`), operation(예 `RunInstances`), usageAmount, usageUnit, rate(단가), cloudUsageQuantity(기간 사용량 합), cloudUsageUnit(hours/GB/GB-month), cloudCostStatus(`increasing` / `budget risk` / `adjustment candidate`)

### 2.8 Activity Log

| 분류 | 기록 정보 |
| --- | --- |
| 공통 | 행위 주체 (User 또는 System) |
| 생성 | 생성일시(datetime), Asset 명 |
| 필드 변경(수동) | 입력한 변경 값 (동기화 시: 수정 전/후 비교) |
| 필드 변경(시스템) | 시스템으로부터 받은 변경 값 (예: linked Host 변경) |
| 필드 변경(동기화) | 동기화일시(datetime), 자산 명 |

기록 트리거: 생성 성공, Host 연결 성공, Zabbix 동기화 완료, Archive 처리 성공. (레퍼런스: Atlassian Assets Activity)

---

## 3. Assets 기능 정의

### 3.1 화면 구성 (3종)

**① Assets 목록**
- 영역: 헤더(제목·설명·Excel 가져오기·자산 생성) / 요약 지표(전체·모니터링 중·unmonitored·라이프사이클 검토) / 검색·필터·프리셋(저장된 보기) / 테이블 / 페이지네이션
- 테이블 컬럼: 자산, 플랫폼, 리소스/하드웨어, 제공자/위치, 소유자, 커버리지, 연결된 호스트, 라이프사이클, 배포 상태, 태그
- 상호작용: 자산명 클릭→상세, 연결 호스트 클릭→Host Detail, 검색(자산명·태그·소유자·위치·호스트·시리얼), 필터, 저장된 보기, 초기화, 생성/Excel 진입
- 상태: 초기 전체 목록 / 필터 결과 / 빈 결과 안내 / 로딩 / **unmonitored 자산은 목록에서 구분 표시**

**② Asset Detail** (HW 화면 / Cloud 화면 분기)
- 영역: 헤더(이름·ID·상태 배지·수정) / 요약(플랫폼·유형·제공자/위치·소유자) / 모니터링 연결(연결 Host·커버리지) / 자산 세부(유형별 속성) / 운영 정보(라이프사이클·배포·태그) / 관련 정보(관련 Problems·연결 Host·최근 변경 이력)
- 상태 분기: 기본 / unmonitored(연결 Host 없음) / Cloud 자산 / HW 자산 / 관련 Problem 없음

**③ Create/Edit Asset**
- 영역: 헤더(저장·취소) / 기본 정보 / 소유 정보 / 위치·제공자 / 모니터링 연결(Host 선택) / 라이프사이클 / 태그
- **platform 선택에 따라 Cloud 입력 ↔ HW 입력 폼 분기**
- 수정 모드: 기존 값 로드, assetId 등 식별 값은 읽기 전용 가능
- 유효성 안내: 필수 누락·형식 오류 인라인 표시

### 3.2 기능 요구사항 (기획서 표 요약)

| 구분 | 요구사항 핵심 |
| --- | --- |
| **Assets 목록** | ① 목록 조회 ② 검색(자산명·태그·유형·소유자·위치·연결Host·시리얼) ③ 필터(platform, monitoringCoverage, lifecycleStatus, deploymentStatus — 다중 선택 시 교집합) ④ 10개 이상 시 페이지네이션(`page`,`pageSize`,`sort`) ⑤ 상세 이동 |
| **Asset Detail** | ① assetId 단건 조회 ② linkedHostId 존재 시 Host 요약(ID·이름·상태·마지막 동기화·열린 Problem summary) 표시 ③ 없으면 no linked Host 상태 ④ Activity log 표시 |
| **Create** | ① 생성 → 생성 결과 반환·목록/상세 갱신 ② 필수·enum 검증(위반 시 저장 안 하고 validation 오류) ③ Host 연결 선택(Excel 업로드 시엔 미선택) ④ linkedHostId 실존 검증 ⑤ tag 입력(`<key:value>` 목록, 목록/상세 구분에 활용) ⑥ 생성 성공 시 Activity 기록 |
| **Import Excel** | ⑦ Excel 업로드로 생성 ⑧ 2행 이상 bulk 생성 지원 |
| **Edit** | ① 수정·갱신 ② 기존 값 로드 ③ 필수·enum 검증 ④ linked Host 변경/해제 ⑤ Host 실존 검증 ⑥ tag 추가·수정·제거 |
| **Link Host** | ① 연결 가능 Host 후보 조회(검색어/'연결 가능' 필터) ② 후보에 요약 정보 포함(Host ID·이름·상태·Host group·기존 Asset 연결 여부) ③ 상세에 Host 운영 요약(ID·이름·tag·상태·최근 동기화/체크 일시) ④ 연결 성공 시 Activity 기록 |
| **Zabbix Inventory 동기화** | ① 동기화로 추가된 기존 Asset은 중복 추가 금지 — 신규만 추가, 기존은 상세 갱신만 ② 동기화 완료 시 Activity 기록 |
| **Archive** | ① archived 상태 전환 또는 기본 목록 제외 ② 처리 성공 시 Activity 기록 |

### 3.3 Excel 업로드 (연계 문서 반영)

- 업로드 타입 2종: **`zabbix`** (Zabbix 데이터 추가 + 사용자 custom data 추가) / **`custom`** (Zabbix 무관, custom data만 추가)
- 실패 가이드: **중복 등록은 "이미 존재함" 표시**, 등록 **성공/실패 카운트** 리포트
- Excel 업로드 시 연결 Host는 선택하지 않음 (§3.2 Create ③)

### 3.4 Zabbix Inventory 동기화 (연계 문서 반영 — 초안 단계)

수집 파이프라인:

```
Host OS/Process → Zabbix Agent(Item/UserParameter) → Item 수집 → Inventory Field 매핑
→ Zabbix Inventory 자동 갱신 → MovesEye Asset Front/API
```

| 항목 | 원칙 |
| --- | --- |
| 데이터 소스 | OS/프로세스 실측 |
| 저장 위치 | Zabbix Inventory로 단일화 |
| 식별 | Item key → Inventory 매핑 |
| 서버 역할 | 프로세스 존재 여부로 WEB/WAS/DB 자동 판별 |

- 기본 매핑: Hostname=`system.hostname`, OS=`system.uname`, OS Version=`system.sw.os`, H/W Vendor=`hw.vendor`(UserParameter·dmidecode·root 필요), Serial=`hw.serial`
- 역할 탐지 item key: `web.detect/version`(apache·nginx·iis), `was.detect/version/home`(tomcat·weblogic·jboss·jeus·websphere), `db.detect/version/port`(mysql·postgres·oracle pmon·mssql)
- **Zabbix 7.0 제약: Inventory Custom Field 미지원(8.0+) → 기본 시스템 Field 사용, Front에서 표시 형식만 변경**
- 운영: Item Key Naming Rule 고정(고객사 판매 고려), Inventory Field 변경 금지, dmidecode 최소 권한 sudo, Agent AllowKey 제한

### 3.5 AWS 클라우드 자산 수집

- **등록 방식 2종** (platform=cloud일 때 `registrationMethod` 필드 노출):
  - `manual` 수동 등록: §2.5 필드 직접 입력 (단일/소수 자산)
  - `import` 자동 수집: AWS 계정 연동 정보 입력 → AWS Config/API로 자동 수집
- 수집 구조: **AWS Config를 1차 인벤토리 소스** + 서비스별 API(Describe/List/Get)로 상세 보강. Config 미지원 리소스는 서비스 API 또는 Cloud Control API 보완. 글로벌 리소스/리전별 조회 차이는 리소스 유형별 수집 정책으로 별도 정의.
- 수집 방식 옵션: AWS Config / Config Aggregator(멀티 계정·리전) / 서비스별 API / Resource Explorer(검색 보조) / CloudTrail·EventBridge(변경 이벤트 감지)
- 인증: **운영 환경에서는 IAM Role 기반 AssumeRole 우선** (중앙 서비스가 각 계정의 수집용 Role을 AssumeRole). Access Key는 차선.
- import 시 입력 데이터: awsAccountId / authType·roleArn·externalId·credentialRef / regions·includeGlobalResources·services·resourceTypes·excludeResourceTypes / collectionMode·tagCollectionEnabled
- 안정성: 페이지네이션·호출 제한·권한 오류·리전 비활성화·일시 실패 고려. **수집 실패 시 기존 데이터 즉시 삭제 금지** — 수집 상태·오류 사유 기록으로 정합성 유지.
- 동기화·변경 관리(전체 주기 동기화 + CloudTrail/EventBridge 증분 + 미발견 상태 후 정책 삭제 + Config 변경 이력): **보류 — 필요 여부 논의 필요**

---

## 4. Costs 기능 정의

### 4.1 개요

운영 비용 가시화: "어디에 비용이 쓰이나", "무엇이 증가에 영향을 주나", "조정 가능한 항목은 무엇인가".

| 운영 질문 | 확인 내용 |
| --- | --- |
| 이번 달 비용이 왜 늘었는가 | 전월 대비 증가한 서비스·자산그룹·계정·태그·리전·계약 항목 |
| 어떤 비용부터 확인해야 하는가 | 증가 폭·절감 가능성·영향 자산·운영 중요도 비교 |
| HW/Cloud 비용 구분 | HW=보유·수명주기 비용, AWS=사용량·소비 패턴 비용 |
| 비용↔운영 연결 | 자산 상세·호스트 상세·문제 상세로 이어지는 근거 탐색 |

레퍼런스: ServiceNow HAM/CCM, AWS Cost Explorer, Flexera One, IBM Apptio Cloudability, ManageEngine AssetExplorer

### 4.2 화면 구성 (4종)

| 화면 | 주요 영역 | 테이블/필터 |
| --- | --- | --- |
| **Dashboard** | 요약 KPI(전체/HW/Cloud/변화/예상), 비용 추이, 증가 항목, 우선 검토(review queue), HW/Cloud 진입 링크 | 필터: 기간·플랫폼·소유자·계정·리전·우선순위 |
| **HW Costs** | 요약(총비용·변화·예상·만료예정), 라이프사이클 분포, 소유자별 분포, 갱신/교체/폐기 후보, HW 테이블 | 컬럼: Asset, HW유형, 소유자, 위치, 구매/유지보수/임대 비용, 만료일, 라이프사이클, 연결Host, 우선순위. 필터: 기간·소유자·위치·HW유형·라이프사이클·우선순위 |
| **Cloud Costs** | 요약(총비용·변화·예상·예산위험), 추이·예산 비교, 서비스/계정/상태별 분포, Cloud 테이블 | 컬럼: AWS리소스, 계정, 서비스/유형, 리전, 사용량, 현재비용, 변화율, 예상비용, 상태, 우선순위. 필터: 기간·계정·서비스·리전·리소스상태·우선순위 |
| **Cloud Cost Detail** | 헤더(리소스ID·계정·서비스·리전·상태), 요약(현재비용·변화·사용량·예상), 비용/사용량 추이, 사용유형 구성, 라인아이템 테이블, 관련 정보(연결 Asset·Problem·소유자) | 라인아이템 컬럼: Usage type, Operation, Usage amount, Unit, Rate, Cost. **뒤로가기 시 이전 필터 유지** |

### 4.3 모니터링 지표 (계산식 확정분)

**Dashboard**

| 지표 | 산정 | 차트 |
| --- | --- | --- |
| Total cost | `costAmount` 합계 | KPI tile |
| HW cost / Cloud cost | `platform==='hw'` / `'cloud'` 항목의 costAmount 합 | KPI tile |
| Change rate | `(현재-이전)/이전 * 100` | KPI tile |
| Forecast | `forecastCostAmount ?? costAmount` 합계 | KPI tile |
| Budget risk | 예측/현재 비용 > 매칭 예산인 항목 수 | KPI tile |
| Increase impact | `max(0, costAmount - previousCostAmount)` 합계 | KPI tile |
| Optimization candidates | `adjustment candidate`·`idle`·`unattached`·`stopped` 카운트 | KPI tile |
| Lifecycle exposure | HW 중 `dateHwExpiry` 90일 이내 costAmount 합 | KPI tile |
| Budget and forecast review | `forecast 합 / budgetAmount * 100` | Progress bar |
| Cost movement | previous/total/forecast 각 합산 비교 | Horizontal bars |
| Platform allocation | HW 합 vs Cloud 합 | Donut |
| Spend by owner | owner 기준 그룹 합, 상위 5 | Donut |
| Increase impact Top N | 증가액 내림차순 상위 5 | Donut |
| Optimization opportunities | 후보 비용의 30%를 예상 절감액으로 산정 | Horizontal bars |
| Dashboard review queue | 예산위험·최적화후보·만료임박·증가율·우선순위 점수 정렬 상위 N | 테이블 |

**HW Costs**: HW total, Change rate, Forecast, Expiry exposure(90일 이내), Expiry window(30/60/90일 구간 bar), Lifecycle cost mix(도넛, 없으면 `No lifecycle`), Spend by owner(없으면 `No owner`), Renewal candidates(만료 90일 이내 ∨ lifecycle review/expiring/retiring/idle ∨ `costChangeRate > 10` 점수화 상위 5)

**Cloud Costs**: Cloud total, Change rate, Forecast, Budget risk(건수), Optimization candidates(건수), Budget and forecast review(progress), Increase impact Top N(bar 상위5), Resource state review(도넛, 없으면 `No state`), Optimization opportunities(30% 추정), Spend by service(`awsResourceType` 기준, 없으면 `No service`), Spend by account(없으면 `No account`), Adjustment candidates(상위 5 테이블)

**Cloud Cost Detail**: Cost and usage trend(previous/cost/forecast 비교), Unit cost(`costAmount / cloudUsageQuantity`), Usage type composition(도넛), Line item cost basis(테이블)

### 4.4 기능 요구사항 (1–18 요약)

| 구분 | # | 요구사항 핵심 |
| --- | --- | --- |
| 공통 | 1 | 기간 기준 조회 → KPI·그래프·목록 갱신 |
| | 2 | 검색·정렬 (costAmount, costChangeRate, forecastCostAmount, costPriority, maintenanceCostAmount, assetId.dateHwExpiry, cloudUsageQuantity, usageAmount) |
| | 3 | 현재 조회 조건 **CSV 내보내기** |
| | 4 | 배분 뷰 — HW: 소유자/자산유형/위치, Cloud: 계정/서비스/리전 |
| Overview | 5 | HW+Cloud 전체 현황 (총·HW·Cloud·전월 대비·월말 예상) |
| | 6 | 증가·예산초과 가능 항목 우선 노출 |
| | 7 | **운영 연결 정보 부족 항목 노출** (소유자 미지정, 연결 Host 없는 HW, 식별 정보 부족 Cloud 항목) |
| HW | 8–9 | 유형·소유자·위치·수명주기·vendor·만료일 기준 비용/관리 대상 확인 |
| | 10 | Asset Detail로 이동 (assetId 존재 시) |
| Cloud | 11 | 계정·서비스·리전 기준 좁혀 보기 |
| | 12 | 월간 누적 + 월말 예상 + 예산 초과 가능성 |
| | 13 | 증가 영역·변화율·조정 후보·우선순위 |
| | 14 | Cloud Cost Detail 이동 (awsResourceId 존재 시) |
| Detail | 15 | 리소스 비용 요약 (ID·서비스·계정·리전·비용·전월비·사용량·예상) |
| | 16 | 비용·사용량 변화 그래프 |
| | 17 | 과금 유형별 비용 구성 (instance hours, data transfer, attached EBS 등) |
| | 18 | 라인아이템 표 (usageType, operation, 사용량, 단위, 단가, 비용) |

### 4.5 비용 데이터 수집 경로 (AWS)

| 소스 | 용도 | 제약 |
| --- | --- | --- |
| Cost Explorer `GetCostAndUsage` | 기간별 metric, account/service/region/tag 그룹, 일/월 추이 | |
| Cost Explorer `GetCostAndUsageWithResources` | 리소스 수준 metric (RESOURCE_ID 그룹) | **최근 14일 제한**, hourly는 EC2 한정 |
| AWS Data Exports / CUR 2.0 | 라인아이템(비용 산정 근거) | S3 전달, 최초 지연 있음, **일 단위 refresh (실시간 아님)** |
| AWS Config / 서비스 API | 리소스 메타데이터(맥락) | 비용 데이터 아님 |

---

## 5. Maps 기능 정의

> 상태: **Network Maps 완료 / Geo Maps 진행 중** (문서 자체가 live doc — 화면 예시·데이터 요구사항 섹션 미작성)

### 5.1 Maps 공통

- 명칭: Topology Maps → **Network Maps**로 변경. 기존 Zabbix Map 기반 확장.
- 배치 요소(elements): **호스트 / 호스트 그룹(그룹 1개 또는 그룹 내 호스트들) / 트리거** — 한 맵에 여러 종류 혼합 배치 가능.
- 배치 방법:
  1. **수동(기본)** — Zabbix Map 기반이되 자유도를 낮춰 수작업 축소
  2. **자동(지원 예정)** — 1단계: 호스트 그룹·IP 대역 단위 자동 그룹핑(연결 정보 없음) → 2단계: Excel/CSV + Zabbix Map API로 연결(link) 정보 보강 → 3단계: 잔여 수작업
- 연결(link) 정보: `type(host|host group|trigger)`, `id`, `source_id`, `target_id`, `label`(연관관계 텍스트 또는 수식으로 latest data 표시), `color`
  - color는 **4단계(normal/warning/critical/disaster) 색상 preset**을 만들고 preset id 참조 방식 제안
- 권한: 보기 권한 / 수정 권한 2단계.

### 5.2 Network Maps (2D 토폴로지)

- 목적: 배치 요소 간 연결(연관) 관계 표시. Zabbix Maps 기능을 따르되 **커스텀 간소화로 복잡성 축소**.
- 레퍼런스: Zabbix Maps, Datadog Device Topology, ServiceNow Dependency Views, SolarWinds Intelligent Maps
- **맵 생성 흐름**:
  1. 목록 화면 → [맵 생성] → 기본 설정 화면: `이름 / 소유자 / 최소 심각도 / 공유 대상` (추후 수정 가능, 소유자·공유 대상 복수 선택)
     - 최소 심각도 = 맵 배치 요소와 연관된 장애 중 표시할 최소 심각도 단계
     - 공유 대상 = 열람/수정 권한자 지정
  2. [추가/완료] → 배치 화면 → [맵 요소 추가]
- **수동 배치**: 요소 정보 `종류(type) / id / 아이콘(등록된 이미지 중 선택) / 좌표(X,Y)` 입력. 좌표는 즉시 반영 + 마우스 드래그 조정(실시간 반영). 요소 2개 동시 선택 시 [연결 추가]/[연결 삭제] — 연결 정보는 공통 규격.
- **자동 배치**: §5.1 자동 방법을 따름.
- 좌표·캔버스: 좌표는 (x,y) **정수 저장**(계산 반올림 여부 미정). 캔버스 크기 지정 vs 동적 로딩 **결정 필요** (Zabbix는 Width×Height 직접 지정).
- 호스트 그룹 배치: '그룹 1개'(그룹 노드만) vs '그룹 내 호스트들'(일정 간격 자동 배치 — **간격 계산 기준 미정**) 선택.
- 표시 레이어(아래→위): 요소 < Link < 레이블 < Problem.

### 5.3 Geo Maps (지리 맵)

- 목적: 위경도 기반으로 자산의 물리적/지리적 위치와 상태·관계 확인. "위치를 먼저 본다" (↔ Network Maps는 "관계를 먼저 본다").
- 렌더링 합의: **3D 오브젝트 다량 사용 지양** (건물 제거). 지도 + **핀(📍)** + 연결선 + 정보. 위경도 기반 표시를 3D처럼 보이도록 조정. **사용자가 등록한 요소(호스트·호스트그룹)만 표시.**
- 맵 리소스: [OpenFreeMap](https://openfreemap.org/) (라이선스 확인됨)
- 확인 시나리오: 해당 지역 IDC의 자산 / 같은 위치의 Open Problem 수 / 사이트의 Host+Asset 한눈에 / 현재 위치에서 관계선 확인
- **공통 대비 예외 규칙** (상충 시 아래 우선):
  - **트리거 배치 미지원** — 호스트/호스트그룹만. 트리거 대신 호스트의 **Problem 발생 아이콘을 1차 표시**, 호스트 선택 시 문제 상세 확인.
  - 첫 진입 화면에 N개 호스트 표시(depth 설정), 한 화면 최대 M개 (**N·M 값 미정**)
  - 핀 + 호스트 이름 표기. 동일 좌표 다중 호스트: 이름 목록 표기(줄바꿈, **최대 5개 + 말줄임**)
  - 핀 클릭 → **우측 사이드 패널**에 호스트 요약 (동일 좌표 2개 이상이면 구분선 목록, **10개 이상이면 페이지네이션**)

### 5.4 Clustering Map

- Geo Maps 등록 정보 기준의 집계/통계 뷰 (배치 기능 없음). Geo Maps의 하위/내부 기능이자 **진입점**.
- Clustering Map 선택 → Geo Maps 진입. **페이지 리로드 없이 내부 화면 전환** 희망.
- 공통 규칙을 따르지 않음(보조 지표). 맵 시작점·화면 배율 기준 미정.

---

## 6. 미확정·공백 항목 (개발 착수 전 확인 필요)

| # | 항목 | 출처 | 비고 |
| --- | --- | --- | --- |
| 1 | 화이트보드 3건 미반영 (Assets User Flow / 조회 API Sequence / Cost 사용 흐름) | 본 문서 상단 | 브라우저로 확인 후 본 문서에 보강 필요 |
| 2 | Assets 생성/편집 API Sequence 미정의 ("x" 표기) | 01. Assets | 조회 시퀀스만 화이트보드 존재 |
| 3 | `lifecycleStatus`의 `expired` 포함 여부 | 01. Assets | enum 확정 필요 |
| 4 | AWS 동기화·변경 관리(전체/증분/삭제 정책) | 01. Assets | **보류** — 필요 여부 논의 |
| 5 | Budget(예산) 등록·관리 화면/기능 미정의 | 01-1. Cost | budgetAmount 필드만 존재 |
| 6 | Cost 데이터의 수집 주기·적재 파이프라인 미정의 | 01-1. Cost | CUR은 일 단위 refresh 전제 |
| 7 | Maps: 화면 예시·데이터 요구사항 섹션 공백 | 01-2. Maps | live doc 작성 중 |
| 8 | Network Maps: 캔버스 크기(지정 vs 동적), 그룹 내 호스트 간격 기준, 좌표 반올림 | 01-2. Maps | 성능 고려 결정 필요 |
| 9 | Geo Maps: N(첫 화면)·M(최대) 호스트 수, Clustering Map 시작점·배율 | 01-2. Maps | |
| 10 | Zabbix Inventory 동기화 문서는 초안(2025-12-30) — Assets 기획과 필드 매핑 정합 필요 | 자산관리 기능 | Zabbix 7.0 Custom Inventory Field 미지원 제약 |
| 11 | Excel 업로드 템플릿 컬럼 정의 미상세 (type: zabbix/custom 구분만 확인) | 엑셀업로드 | |

## 7. 기존 MovesEye 코드베이스 접점 (개발 관점 메모)

- **Host/HostGroup 도메인 재사용**: Asset↔Host 연결, Link Host 후보 조회, Host 요약(상태·Problem summary)은 기존 모니터링 BE(zabbix sync·host.get) 위에 얹는다. 호스트 JSONB 중첩 구조는 자산관리 정규화 필요성이 기존 진단(2026-06-02 Zabbix Sync 감사)에서 제기된 바 있음.
- **Problem 연동**: Asset Detail의 "관련 Problems", Geo Maps의 Problem 아이콘은 기존 problem 조회 경로 재사용.
- **신규 외부 연동**: AWS(Config·서비스 API·Cost Explorer·CUR)은 전부 신규. AssumeRole 인증 체계, 수집 상태 관리 테이블 설계 필요.
- **신규 엔티티**: `asset`(+HW/Cloud 확장), `cost`(+line item), `budget`, `activity_log`, `map`(+element·link·color preset), 사용자 지정 필드(Map<K,V>).
