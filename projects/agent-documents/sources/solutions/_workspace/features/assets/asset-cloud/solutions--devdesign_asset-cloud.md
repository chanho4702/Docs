# MovesEye 개발 설계 — 자산 관리 × 클라우드(AWS) 통합: 클라우드 자산 + 비용 탭 이전 (ZM-119)

> 작성 2026-08-26 · Claude · **v1 (사용자 결정 반영, 구현 착수본)** · 티켓 **ZM-119**
> 이 문서는 **보강 설계**다 — 아래 기존 설계를 토대로 하며, 여기서 바꾸는 결정만 명시한다.
> - [devdesign_assets-core.md](../assets-core/solutions--devdesign_assets-core.md) — 자산 모델(source·편집 소유권·스냅샷·soft delete), 2차 로드맵 4("Costs·Maps·AWS 수집과의 접점 재평가")
> - [devdesign_asset-cost.md](../asset-cost/solutions--devdesign_asset-cost.md) — 비용 탭 3분할(Dashboard/HW/**Cloud M3**), §3.4 V19 cloud 테이블 초안, §5 CE, §5.3 Cloud 비용↔자산 연결, §8.6 Cloud Costs 탭
> - [devdesign_cloud-cost-optin.md](../../cloud/aws-monitoring/solutions--devdesign_cloud-cost-optin.md) — 과금 0 원칙·옵트인 프레임·P2 추정 엔진·**D6(EC2 자산 자동 생성 안 함)**
> - [design_assets-management.md](../assets-design/solutions--design_assets-management.md) — 기획 정본: §1.1 "Cloud + On-premise 통합 관리", §2.5 클라우드 리소스 필드, §4 Costs 4화면
> - [devdesign_asset-dashboard.md](../asset-dashboard/solutions--devdesign_asset-dashboard.md) — 자산 현황 대시보드(ZM-116)
> 🔒 **격리 작업**: worktree `C:\worktrees\zm-119-be`(브랜치 `ZM-119`, base `ZM-79@0e2aad5`) · `C:\worktrees\zm-119-fe`(`ZM-119`, base `master@7bc64d2`). 런타임 BE :3001 / FE :5174. 메인 체크아웃 쓰기 금지.

---

## 0. 사용자 결정 (2026-08-26)

| # | 결정 | 내용 |
|---|---|---|
| U1 | **클라우드 비용 화면을 자산 관리로 완전 이동** | `자산 관리 > 비용 > Cloud 탭`이 유일한 화면. 클라우드 인프라 메뉴의 "비용" 항목 제거, 구 경로 `/cloud-infra-monitoring/cost` → `/asset/cost?tab=cloud` 리다이렉트. EC2 개요의 실청구액 카드(`CloudBillingCard`)는 **요약 역할로 유지** |
| U2 | **EC2를 자산으로 자동 등록** — `source='cloud'` 신설 | 5분 스냅샷 배치에 얹어 upsert + 자산 목록 동기화 버튼에 AWS 옵션. **기존 D6 번복**(§1.1) |
| U3 | 실청구액(CE)의 인스턴스 귀속은 **이번엔 제외** | 자산별은 무료 추정, 실청구는 서비스 단위 대조(기존 D4 유지) |
| U4 | 기존 설계를 토대로 보강 | 새 개념을 만들지 않고 assets-core의 `source` 축·편집 소유권·soft delete, asset-cost의 탭 IA·`platform`·§5.3 연결 규칙을 그대로 확장 |

### 1.1 D6 번복 근거
D6(2026-08-25)는 "Asset.source(zabbix/custom) 축과 편집 소유권·동기화 로직 전반에 파급"을 이유로 자동 생성을 보류했다. 이번에 번복하는 근거:
1. 기획 정본 §1.1의 자산 정의가 처음부터 **"Cloud + On-premise 통합 관리"**이고 §2.5에 클라우드 리소스 필드가 정의돼 있다 — D6은 일정상 보류였지 설계상 배제가 아니다.
2. 파급은 assets-core의 규칙으로 흡수된다: **`cloud_data`는 동기화 소유, 사용자 필드는 사용자 소유**(zabbix 자산의 `zabbix_data`와 동일 구조) → 동기화가 사용자 입력을 지우지 않고, 편집 폼은 소유권별로 읽기 전용/편집 분기만 하면 된다.
3. 비용 탭 Cloud(M3)와 자산 대시보드가 **자산 ↔ EC2 연결 없이는 "자산 미등록" 뱃지만 가득한 화면**이 된다(asset-cost §5.3). 연결이 있어야 두 화면이 성립한다.

---

## 2. 출발점 — 이미 있는 것 / 없는 것

### 2.1 이미 있는 것 (그대로 쓴다)
| 항목 | 위치 | 재사용 |
|---|---|---|
| 5분 EC2 스냅샷 배치(무료 Describe*, 리전 병렬) | `aws/CloudSnapshotService`, job `cloud_snapshot` | 자산 upsert의 **입력** — AWS 추가 호출 0 |
| EC2↔Zabbix 매칭(INSTANCE_ID > IP, 양방향 유일, fail-closed) | `aws/Ec2ZabbixMatcher.matchFor(Instance)` | `linked_hostid` 자동 연결 |
| 추정 엔진(단가×가동시간+EBS, 낭비 3종) | `aws/CloudCostEstimateService`, `GET /cloud-infras/cost-estimate` | Cloud 탭 본체 데이터 |
| 실청구 배치·조회(서비스 단위, 옵트인) | `aws/CloudCostSyncService`·`CloudCostQueryService`, `GET /cloud-infras/costs` | Cloud 탭 대조 카드 |
| 자격증명·게이팅 | `CloudCredentialsResolver.requireConfigured`, `GET /cloud-infras/status` | 미구성 안내 분기 |
| 자산 모델·동기화 골격 | `asset/AssetSyncService`(upsert·활동 이력), `AssetDerivation`, `SyncOptionsModal`(FE) | cloud 동기화는 같은 골격 |
| 자산 상세의 클라우드 필드 폼 | FE `constants/asset.ts:262-273`(account/region/resource_id/…) | 읽기 전용 렌더로 전환 |
| 비용 탭 골격 | `AssetCostPage.tsx`(cloud 탭 = coming soon), `COST_TAB.CLOUD` | 탭 채우기 |
| 비용 `platform` 파생 | `CostService.derivePlatform`(cloud_data.resource_id 유무) | `source='cloud'` 기준으로 교체 |
| FE 클라우드 비용 화면 | `pages/cloud-infra-monitoring/aws-resources/CloudCostPage.tsx` + `components/CloudBillingCard.tsx` | 컴포넌트 이동(복제 금지) |

### 2.2 없는 것 (신규)
- `asset.source='cloud'` 값과 **클라우드 자산 upsert 키 컬럼**(`cloud_resource_id`) — V36
- `asset/cloud/CloudAssetSyncService` + 배치 훅 + 수동 동기화 옵션
- Cloud 탭 데이터 EP `GET /costs/cloud`(추정 + 자산 조인 + 실청구 요약을 한 응답으로)
- 자산 상세의 클라우드 비용 카드, 자산 대시보드·목록의 cloud 소스 반영
- 라우트 리다이렉트·메뉴 제거·도움말·내비 검색 항목 이전

### 2.3 실측(2026-08-26 코드 조사)이 결정한 것
- aws ↔ asset/cost **패키지 참조 0**. 의존 방향을 새로 정해야 순환이 안 생긴다(§6.1).
- 매칭 결과는 **메모리 캐시뿐**(재기동 시 소실) → 자산의 `linked_hostid`가 유일한 영속 기록이 된다. 매칭이 콜드(IP 색인 미준비)면 **연결을 지우지 않는다**(§4.4).
- `cloud_data.resource_id`의 생산자가 없어 `platform`은 항상 `hw`였다 → 이제 `source`로 판정.
- 자산 비용 HW 모집단은 "platform으로 거르지 않는다"(asset-cost 결정 #11)였다 — 진짜 cloud 자산이 생기면 **HW 탭 미입력 큐가 EC2로 가득 찬다** → 결정 #11 개정(§5.3).

---

## 3. 데이터 설계

### 3.1 `asset` 확장 — `V36__asset_cloud.sql` (착수 시 최신 번호 재확인 — 병행 세션이 선점할 수 있다)
```sql
ALTER TABLE asset ADD COLUMN IF NOT EXISTS cloud_resource_id varchar(128);   -- source=cloud 필수. EC2 instanceId
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_cloud_resource_id
    ON asset (cloud_resource_id) WHERE cloud_resource_id IS NOT NULL;      -- upsert 기준키(zabbix_hostid와 동형)
CREATE INDEX IF NOT EXISTS idx_asset_cloud_resource_type ON asset ((cloud_data->>'resource_type'));
```
- `source` 값 집합: `zabbix | custom | cloud`(`Asset.java` 상수 추가). 기존 `uq_asset_zabbix_hostid`와 대칭.
- 🔴 기존 데이터 이행 없음: 사용자가 손으로 만든 custom 자산에 `cloud_data.resource_id`가 들어 있어도 **자동으로 cloud 소스로 바꾸지 않는다**(소유권이 다르다). 동기화가 같은 instanceId를 만나면 **새 cloud 자산을 만들지 않고 건너뛰며** 활동 이력에 `skipped: custom 자산 충돌`을 남긴다 — 중복 등록 방지(기획 §3.2 "동기화 중복 추가 금지").

### 3.2 `cloud_data` 스키마 (source=cloud, 동기화 소유 — Java record `asset/cloud/AssetCloudData`)
| 키 | 원천(EC2 `Instance`) | 비고 |
|---|---|---|
| `resource_type` | 고정 `ec2` | M2에서 rds/ebs/eip 확장 |
| `resource_id` | `instanceId` | = `cloud_resource_id` 컬럼(조인용 중복 보관) |
| `account_id` | `ownerId`(예약 응답) | 없으면 null |
| `region` · `availability_zone` | 리전 팬아웃 값 · `placement.availabilityZone` | |
| `instance_type` · `platform_details` · `architecture` | 〃 | |
| `state` | `state.name` — `pending/running/stopping/stopped/shutting-down/terminated` + **`missing`**(§4.3) | |
| `launch_time` | ISO | 취득일 폴백 후보(§5.4) |
| `vpc_id` · `subnet_id` · `security_group_ids[]` | | |
| `private_ip` · `public_ip` · `dns_name` | 기본 ENI | |
| `exposure` | `public_ip` 있으면 `exposed:public-ip`, 아니면 `private` | 기존 savedView `public_access` 필터(`exposure ILIKE 'exposed%'`)가 그대로 동작 |
| `name_tag` · `tags{}` | Name 태그 · 전체 태그 맵 | |
| `first_seen_at` · `last_seen_at` | 동기화 시각 | |

기존 수동 폼 키(account/region/resource_id/arn/state/vpc/subnet/security_groups/private_ip/exposure)와 **이름을 맞춘다**(FE 상수가 그대로 렌더되도록). 차이가 나는 키는 FE 상수를 확장.

### 3.3 파생 규칙 (`AssetDerivation` 확장)
| 필드 | cloud 규칙 | 소유 |
|---|---|---|
| `name` | Name 태그 → 없으면 instanceId | 동기화(zabbix와 동일) |
| `device_type` | 생성 시 `server`(EC2는 서버) — 이후 사용자 편집 보존 | 생성 시만 |
| `resource_type` | `ec2` | 동기화 |
| `coverage` | `linked_hostid != null` → `monitored`, 아니면 `unmonitored` | 파생 캐시 |
| `deployment_status` | running→`deployed` · stopped/stopping→`maintenance` · pending→`planned` · shutting-down/terminated→`retired` · missing→`retired` | 동기화 |
| `lifecycle_status` | 생성 시 `active`; **terminated/missing이면 `retired`로 강제**(사용자 값 덮음 — 사라진 리소스를 active로 둘 수 없다). 그 외엔 사용자 소유 | 조건부 |
| `owner_name`·`notes`·`custom_properties`·`cost_data` | 사용자 소유 — 동기화가 **절대 건드리지 않음** | 사용자 |
| `zabbix_data` | 빈 record. 연결된 호스트 정보는 상세 화면이 `linked_hostid`로 실시간 보강(기존 `live`) | — |
| `inventory_mode` | null | — |

---

## 4. 동기화 설계

### 4.1 경로 2개, 코드 1개
```
[자동] cloud_snapshot 배치(5분) ─ 스냅샷 적재 후 ─▶ CloudAssetSyncService.sync(instancesByRegion, actor=system)
[수동] POST /assets/sync {sources:[zabbix|cloud]} ─▶ cloud 선택 시 ─▶ CloudSnapshotService.fetchInstances(전 리전) ─▶ 같은 sync()
```
- 자동 경로는 **AWS 추가 호출 0**(배치가 이미 받은 `Instance` 리스트를 넘긴다). 수동 경로만 Describe 1회 팬아웃(무료).
- 자격증명 미구성·`awsResources` 미설정 → 배치는 `skipped`(cloud_snapshot과 같은 규칙), 수동은 200 + `skipped: AWS_NOT_CONFIGURED`(에러 아님).
- 🔴 **부분 리전 실패 시 그 리전의 자산은 건드리지 않는다**(missing 판정 금지) — 스냅샷 배치의 `failedRegions`를 그대로 받는다.

### 4.2 upsert 규칙
1. `cloud_resource_id = instanceId`로 조회.
2. 없음 → **생성**: §3.3 생성 규칙, `first_seen_at`, 활동 `created`(actor=system, source cloud).
3. 있음 → `cloud_data`·`name`·`resource_type`·`deployment_status`·`last_seen_at` 갱신, lifecycle 조건부 강제. **변경이 있을 때만** `updated` 활동(변경 필드 diff — 매 5분 무의미한 이력 금지).
4. `excluded=true`인 cloud 자산은 **건너뛴다**(soft delete 유지 — zabbix와 동일).
5. §3.1의 custom 충돌은 skip + 이력.

### 4.3 사라진 인스턴스
- 성공한 리전에서 이번 스냅샷에 없는 cloud 자산 → `state='missing'`, `last_seen_at` 유지, lifecycle `retired`. 다시 나타나면 원상 복구(state 실값, lifecycle은 **사용자가 바꾸지 않았다면** `active`로 — 복구 판정은 "직전 강제값 == 현재값"일 때만).
- terminated는 AWS가 약 1시간 보여준 뒤 사라지므로 terminated → missing 순으로 자연 전이.
- 물리 삭제·자동 excluded는 **하지 않는다**(이력·비용 기록 보존, assets-core soft delete 원칙). 정리는 사용자가 목록에서 제외. M2: "missing 30일 초과 자동 제외" 옵션.

### 4.4 Zabbix 호스트 자동 연결
- 생성/갱신 시 `Ec2ZabbixMatcher.matchFor(instance)`(시스템 컨텍스트) → 매치면 `linked_hostid` 설정 + 활동 `updated`(field linkedHostid).
- 🔴 **매치 실패는 연결 해제가 아니다.** 매칭기가 콜드(IP 색인 미준비)·Zabbix 조회 실패·후보 0건일 때 기존 `linked_hostid`를 **유지**한다. 해제는 (a) 사용자가 편집 폼에서 지우거나 (b) INSTANCE_ID_EXACT 근거로 **다른** 호스트가 확정될 때만 교체. 오연결이 미연결보다 나쁘다는 매칭기 원칙과 대칭으로, **잦은 깜빡임도 미연결만큼 나쁘다**.
- 사용자가 손으로 연결한 값(`linked_hostid`를 폼에서 지정)은 `custom_properties`가 아니라 같은 컬럼이므로, 동기화가 덮는 조건을 **"현재 값이 null이거나 근거가 INSTANCE_ID_EXACT"**로 제한한다. (근거 저장: `cloud_data.link_basis`)

### 4.5 FE 동기화 UI
- `SyncOptionsModal`에 소스 체크박스 **Zabbix / AWS(EC2)** (AWS는 `useCloudStatus().isReady`일 때만 활성, 아니면 비활성 + "설정 > 클라우드 인프라" 안내).
- 결과 토스트: `zabbix {added,updated}` · `cloud {added,updated,missing,skipped}`.
- `POST /assets/sync` 요청 DTO에 `sources: string[]`(기본 `["zabbix"]` — 기존 호출 호환).

---

## 5. 비용 탭 이전 (Cloud)

### 5.1 IA
```
/asset/cost?tab=cloud            ← 유일한 클라우드 비용 화면 (기본 탭은 그대로 hw)
/cloud-infra-monitoring/cost     ← Navigate replace → /asset/cost?tab=cloud   (라우트·상수는 리다이렉트용으로만 존치)
```
- `SideNav` 클라우드 인프라 서브메뉴에서 `cloud-cost` 항목 **제거**(모바일 동반). 내비 검색 항목(`navSearchEntries`)·도움말(`page-guide`)의 경로를 자산 비용으로 이전.
- EC2 개요(`EC2Dashboard`)의 `CloudBillingCard`는 유지하되 카드 하단에 "자산 관리 > 비용에서 상세 보기" 링크.
- 홈 위젯 `cloud_fleet`의 낭비 요약 링크도 Cloud 탭으로.

### 5.2 Cloud 탭 구성 (기존 `CloudCostPage` 내용을 컴포넌트 단위로 **이동**, 복제 금지)
| 영역 | 내용 | 데이터 |
|---|---|---|
| 게이트 | AWS 미구성 → 빈 상태 + 설정 링크 · `awsResources.view` 없음 → 권한 안내 | `/cloud-infras/status` |
| 요약 StatCard 4 | 추정 MTD(USD) · 월말 예상 · 낭비 월액 · **자산 등록 커버리지**(자산 연결 n / 인스턴스 m) | `GET /costs/cloud` |
| 고지 | 온디맨드 기준·RI/SP·데이터전송 미반영(기존 `basis_notice`) + `PRICING_UNAVAILABLE` 강등 배너 | 〃 |
| 인스턴스별 추정 표 | 기존 컬럼 + **자산 컬럼**(자산명 링크 → 상세 / 미등록 뱃지 + "지금 동기화" 버튼(admin)) + 소유자 | 〃 |
| 낭비 진단 표 | 기존 그대로 | 〃 |
| 실청구액 카드 | `CloudBillingCard` 재사용(서비스 단위, 옵트인 잠금) + **추정 vs 실청구 MTD 대조 한 줄**("추정 $X · 실청구 $Y · 차이 Z%") — U3 | `/cloud-infras/costs` |
| 필터 | 리전 · 상태 · 소유자(자산 조인) · 자산 등록 여부 — URL query | |

### 5.3 BE `GET /costs/cloud` (신규, `cost/` 패키지)
```ts
interface CostCloudResDto {
  collection: { state: 'ok'|'partial'|'disabled'; reason: string|null; failedRegions: string[] };  // 추정 엔진 것 그대로
  summary: { estimatedMtdUsd; projectedMonthUsd; wasteMonthlyUsd; basis: 'ON_DEMAND';
             instanceCount; assetLinkedCount; assetUnlinkedCount;
             billedMtdUsd: number|null; billingState: 'ok'|'disabled'|'unavailable'; diffPct: number|null };
  instances: (CloudCostEstimateInstance & { assetId: number|null; assetName: string|null; owner: string|null; lifecycle: string|null })[];
  waste: CloudCostWaste[];
  filterOptions: { regions: string[]; owners: string[] };   // 필터 적용 전
}
```
- 구현: `CostCloudService` = `CloudCostEstimateService.estimate()`(aws) + `AssetRepository.findByCloudResourceIdIn(ids)`(asset) + `CloudCostQueryService.summary()`(aws, 옵트인 꺼짐이면 `billingState=disabled`). **추정 엔진·실청구 코드는 수정하지 않는다** — 조합만.
- 권한: `awsResources.view`(원천 데이터 권한과 동일) + `requireConfigured`. 자산 비용 화면의 다른 탭과 권한 축이 다르다는 점을 탭 게이트 문구로 안내.
- `?resourceId=` 단건 필터 — 자산 상세 비용 카드가 쓴다.
- 🔴 **결정 #11 개정**: HW 탭·비용 대시보드·미입력 큐·일괄 업로드의 모집단은 `source != 'cloud'`. cloud 자산에 `cost_data`를 넣는 경로(인라인 편집·업로드)는 **거부**(`ASSET_COST_NOT_APPLICABLE`) — 클라우드는 상각 대상이 아니다. `derivePlatform`은 `source=='cloud'`.

### 5.4 비용 대시보드(기존 M2)에 클라우드 축 추가 — 최소
- KPI 행에 카드 1개: **클라우드 월 추정(USD)** = `projectedMonthUsd` + 부제 "인스턴스 n · 실청구 MTD $Y(옵트인 시)" → 클릭 Cloud 탭.
- 🔴 **통화 합산 금지**: HW는 KRW 상각·유지비, Cloud는 USD 추정. 하나의 총액으로 뭉치지 않는다(asset-cost §4 통화 미확정 → 이번 결정: 나란히, 합산 없음). 기획의 `Platform allocation` 도넛은 **자산 수 기준**(HW n / Cloud m)으로만.
- 응답: `CostDashboardResDto.cloud: { projectedMonthUsd, estimatedMtdUsd, instanceCount, billedMtdUsd|null, state } | null`(AWS 미구성/권한 없음 → null, 부분 성공).

### 5.5 자산 상세(cloud)
- 클라우드 섹션: 동기화 소유라 **읽기 전용**(편집 폼에서 `source=cloud`면 cloud 필드 disabled + "AWS 동기화 값" 배지). 사용자 필드(소유자·메모·커스텀·분류·생애주기)는 편집 가능.
- 비용 섹션: `source=cloud`면 감가상각 폼 대신 **월 추정 카드**(시간단가·가동시간·컴퓨트 MTD·EBS·월말 예상, `GET /costs/cloud?resourceId=`) + Cloud 탭 링크. 추정 불가(강등)면 사유 표시.
- 취득일 폴백(§5.4 asset-cost `CostParamResolver`): cloud 자산은 **적용 안 함**(상각 대상 아님) — 자산 대시보드 연식 차트에서는 `launch_time`을 취득일로 쓴다(별도 규칙, "가동 시작일" 라벨).

---

## 6. 구조

### 6.1 패키지 의존 방향 (순환 금지)
```
aws  ←  asset(cloud sync: Ec2ZabbixMatcher·CloudSnapshotService·AwsReadOnlyGateway 사용)  ←  cost(CostCloudService: aws 추정/실청구 + asset 조인)
aws는 asset/cost를 참조하지 않는다(현재 0건 유지). CloudSnapshotService → 자산 동기화 호출은 **이벤트/콜백 인터페이스**(`aws/spi/InstanceSnapshotListener`)로 역전 — aws가 asset을 import하지 않게.
```
- `asset/cloud/CloudAssetSyncService implements InstanceSnapshotListener` — 스냅샷 배치가 리전별 성공 결과를 `onSnapshot(region, instances)`·`onRunCompleted(failedRegions)`로 통지.

### 6.2 BE 파일
```
aws/spi/InstanceSnapshotListener.java            (신규, 인터페이스)
aws/CloudSnapshotService.java                    (+listener 통지 — 최소 수정)
asset/cloud/{AssetCloudData, CloudAssetSyncService, CloudAssetDerivation}.java
asset/AssetService.java                          (+sync sources 분기), asset/dto/SyncAssetsReqDto(+sources), AssetSyncResultDto(+cloud 섹션)
asset/domain/Asset.java                          (+SOURCE_CLOUD, cloudResourceId), AssetRepository(+findByCloudResourceId(In))
asset/AssetDerivation.java                       (cloud 규칙)
asset/dashboard/*                                (bySourceCoverage에 cloud 2구간, 연식은 launch_time)
asset/quality/AssetQualityPolicy.java            (cloud 자산: inventory_* 태그 미적용, cost_missing 미적용)
cost/CostCloudService.java, cost/dto/CostCloudResDto.java, CostController(+GET /costs/cloud)
cost/CostService.java                            (모집단 source!=cloud, derivePlatform, cost_data 거부)
db/migration/V36__asset_cloud.sql
```

### 6.3 FE 파일
```
pages/asset/cost/CloudCostTab.tsx                 (신규 — CloudCostPage 내용 이동)
pages/asset/cost/components/{CloudEstimateTable, CloudWasteTable, CloudCostSummary, CloudBillingCompare}.tsx  (기존 CloudCostPage에서 분리 이동)
pages/cloud-infra-monitoring/components/CloudBillingCard.tsx  (유지, 링크 추가)
pages/cloud-infra-monitoring/aws-resources/CloudCostPage.tsx   (→ Navigate replace 리다이렉트만 남김)
pages/asset/components/{AssetCostSection(cloud 분기), AssetFormModal(cloud 읽기전용), SyncOptionsModal(sources)}.tsx
pages/asset/AssetListPage.tsx                     (source 필터 cloud, 배지)
pages/asset/dashboard/*                           (cloud 구간)
services/cost.api.ts(+getCloudCost) · services/asset.api.ts(sync sources) · types/cost.ts · types/asset.ts
constants/{routes.ts(리다이렉트 주석), cost.ts, asset.ts(cloud 키 확장), navSearchEntries.ts, page-guide.ts}
layouts/app/{SideNav, MobileSideNav}.tsx           (cloud-cost 항목 제거)
locales/kr.json · en.json                          (cloud_estimate 블록은 키 유지, 자산 비용 네임스페이스로 참조만)
```

---

## 7. 판정 규칙 (어기면 화면이 거짓)

| 항목 | 규칙 |
|---|---|
| upsert 키 | `cloud_resource_id`(instanceId). Name 태그로 매칭 금지(중복·변경 흔함 — 매칭기와 동일 원칙) |
| 사용자 필드 | 동기화가 `owner_name·notes·custom_properties·cost_data·device_type(생성 후)·lifecycle(강제 조건 외)`를 **절대 쓰지 않는다** |
| missing | 성공한 리전에서만 판정. 부분 실패 리전의 자산은 그대로 |
| 연결 해제 | 매치 실패 ≠ 해제. INSTANCE_ID_EXACT로 다른 호스트 확정 시에만 교체 |
| 활동 이력 | 변경 필드가 있을 때만 `updated`. 5분마다 빈 이력 금지 |
| 통화 | KRW(HW)·USD(Cloud) 합산 금지. 대시보드는 나란히 |
| HW 모집단 | `source != cloud`. cloud 자산 `cost_data` 쓰기 거부 |
| 추정 기준 | ON_DEMAND 고지 유지. 실청구 대조는 서비스 합계와만(인스턴스 귀속 없음 — U3) |
| 권한 | Cloud 탭 데이터 = `awsResources.view`. 자산 목록에서 cloud 자산 **행 자체는** 자산 권한으로 보임(메타는 비밀 아님) |
| 중복 | custom 자산에 같은 resource_id가 있으면 cloud 자산 생성 skip + 이력 |

---

## 8. 구현 단계

| 단계 | 범위 |
|---|---|
| **M1 (이번, ZM-119)** | V36 · cloud 소스 upsert(자동+수동) · Zabbix 자동 연결 · Cloud 탭 이전(+자산 조인·실청구 대조) · `GET /costs/cloud` · 비용 대시보드 KPI 1개 · 자산 상세 cloud 분기 · 목록/대시보드 cloud 반영 · 리다이렉트·메뉴·도움말 · 결정 #11 개정 |
| M2 | missing 30일 자동 제외 옵션 · RDS/EBS/EIP 자산화 · 클라우드 태그 → 기기분류/소유자 매핑 규칙 · 자산 대시보드 `cloud_missing` 태그 · Cloud Cost Detail 화면(기획 §4.2 4번째) |
| M3 | CE 리소스 귀속(옵트인, 14일) — U3 재론 시 |

---

## 8.1 구현 중 확정·변경 (2026-08-26, 하네스 실행 — 정본은 계약서 §5 표)

| 항목 | 결정 | 근거 |
|---|---|---|
| `cloud_data.last_seen_at` | **폐기** → `asset.last_synced_at`(벌크 UPDATE, `updated_at` 무접촉) | 회차마다 바뀌는 값이 jsonb에 있으면 dirty check(R1)가 매번 "변경" |
| `collection.failedRegions: string[]` | → `failedRegionCount: number` | 추정 엔진이 실패 리전 이름을 보존하지 않고 엔진 수정 금지. sync 쪽 `cloud.failedRegions`는 이름 배열(우리 코드) |
| `account`·`arn` | 항상 null(응답에 키 없음) | 게이트웨이 평탄화로 `Reservation.ownerId` 소실, ENI ownerId는 공유 VPC 오귀속 |
| `cloud_data` 키 | 기존 FE 폼 키 채택 + 신규 12키 | §3.2 후단 규칙 |
| 사유 코드 | `AWS_UNAVAILABLE`(AWS 단계) · `SYNC_FAILED`(저장 단계) 신설 | 첫 실측의 `AWS_UNAVAILABLE`이 사실은 **배치/수동 create 경합**(유니크 충돌)이었다 — 사유를 뭉치면 원인을 자격증명에서 찾게 된다 |
| 수동 ↔ 배치 경합 | upsert 직렬화 + 유니크 위반 1회 재시도 | 설계 §6.1 "회차는 겹치지 않는다"를 코드가 강제하지 않았음. 다중 인스턴스는 재시도에만 의존 |
| **연결 해제(FE-2)** | `PATCH /assets/{id}` `clearFields:["linkedHostid"]` 신설, cloud는 `cloud_data.link_basis=manual_cleared`로 IP 재연결 차단(INSTANCE_ID_EXACT는 재연결) | `linkedHostid:null`=미변경 + 동기화 자동 해제 금지 → 잘못 붙은 연결을 아무도 못 끊는 구멍 |
| `AssetListItemDto.region` | 추가(cloud만 값) | 목록 위치 칸 리전 표시 |
| 미구성 처리(`/costs/cloud`) | 강등이 아니라 `CLOUD_NOT_CONFIGURED` 에러 | 기존 `/cloud-infras/*` 관례와 동일 |
| i18n | `asset.cloud.*` 대신 `asset_cloud.*` | 루트 `asset`이 문자열 리프 |
| 계약 게이트 | `tsconfig.contract.json` + `npm run typecheck:contract` 신설 | ZM-116의 픽스처 게이트가 실제로 안 돌고 있었음(tsconfig가 `__tests__` 제외) |

## 9. 리스크 · 미결

| # | 항목 | 처리 |
|---|---|---|
| R1 | 5분마다 upsert가 `updated_at`을 흔들어 목록 정렬·"최근 변경"이 오염 | 변경 없으면 **저장하지 않는다**(dirty check) — `updated_at`·활동 이력 모두 |
| R2 | 병행 세션이 V36을 선점 | 착수 시 재확인, 번호만 밀기 |
| R3 | 매칭기 시스템 컨텍스트 호출이 배치에서 Zabbix 부하 | 매칭기 캐시 5분 = 배치 주기와 동일, 추가 호출 0 |
| R4 | dev DB(5433)엔 AWS 자격증명이 없을 수 있음 → 런타임 검증 범위 | 자격증명 있으면 실 EC2로, 없으면 `skipped` 경로 + 단위 테스트 픽스처로 검증하고 미검증 항목을 명시 |
| R5 | 공유 파일(SideNav·routes·locales) 병행 세션 충돌 | 리베이스 시 자동 병합 기대, 충돌 시 수동 |
| Q1 | cloud 자산 기본 `device_type` — `server` vs 새 분류 `cloud` | `server`(EC2는 서버). RDS 등은 M2에서 분류 추가 |
| Q2 | 수동 동기화 기본 체크 | Zabbix만(기존 동작 유지), AWS는 명시 선택 |
