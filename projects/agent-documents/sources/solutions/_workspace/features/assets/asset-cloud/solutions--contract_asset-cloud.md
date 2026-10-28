# API 계약 — 자산 관리 × 클라우드 통합 (ZM-119, BE M1)

> 산출 2026-08-26 · Claude(be-engineer) · 티켓 **ZM-119** · 브랜치 `ZM-119`(worktree `C:\worktrees\zm-119-be`, base `ZM-79@0e2aad5`)
> 설계 정본: [features/assets/asset-cloud/devdesign_asset-cloud.md](solutions--devdesign_asset-cloud.md) M1
> 토대 계약: [features/assets/asset-dashboard/contract_asset-dashboard.md](../asset-dashboard/solutions--contract_asset-dashboard.md) · [features/assets/asset-cost/contract_asset-cost.md](../asset-cost/solutions--contract_asset-cost.md) · [features/assets/assets-core/contract_assets-core.md](../assets-core/solutions--contract_assets-core.md)
> 실측: dev 프로필 **:3001 / 5433 도커 DB**(자산 80건 = zabbix 78 + custom 1 + **cloud 1**), 2026-08-26.
> ✅ **AWS 실연동 검증 완료** — 실 EC2(`i-06ac35f551a92b5b1` / `ec2-tokyo` / ap-northeast-1)가 5분 배치로 자산 등록되는 것부터 `GET /costs/cloud`·양쪽 대시보드까지 실왕복으로 확인했다. §6의 샘플은 **전부 실측값**이다.
>
> **개정 v1.1 (2026-08-26)** — ① 초판의 "AWS 실연동 미검증 · 선재 문제" 서술은 **오진이었다**(내가 기동 스크립트를 구 Nest `.env`로 바꿔 놓아 CLOUD 시크릿이 안 풀린 것. 정본은 Spring `.env`). 실측 결과로 전면 정정. ② 배치↔수동 동기화 경합 결함 수정(§5-10) + `reason`에 `SYNC_FAILED` 추가.

---

## 0. 이 문서가 다루는 변경 한눈에

| # | 종류 | 대상 | 요약 |
|---|---|---|---|
| A | **신규 EP** | `GET /costs/cloud` | 추정 + 자산 조인 + 실청구 대조를 한 응답으로 |
| B | **변경 EP** | `POST /assets/sync` | 요청 `sources[]`, 응답 `cloud{}` 추가 |
| C | **변경 EP** | `GET /costs/dashboard` | 응답에 `cloud` 섹션(nullable) 추가 |
| D | **변경 EP** | `GET /assets/dashboard` | `kpi.cloudCount` · `bySourceCoverage.cloudLinked/cloudUnlinked` · 연식 축 cloud 규칙 |
| E | **변경 DTO** | `GET /assets`(목록) | `cloudResourceId` · **`region`** 추가, `source=cloud` 필터 허용 |
| F | **변경 DTO** | `GET /assets/{id}`(상세) | `cloudResourceId` 추가 |
| G | **계약 변경** | `PATCH /assets/{id}` | cloud 자산 편집 규칙 신설(에러 2종) |
| H | **계약 변경** | `PATCH /costs/hw/{id}` · 업로드 · HW 모집단 | cloud 자산 제외/거부(결정 #11 개정) |
| I | 신규 스키마 | `V36__asset_cloud.sql` | `asset.cloud_resource_id` + 부분 유니크 |

### 🔴 FE가 먼저 알아야 할 3가지

1. **`source`에 `'cloud'`가 추가됐다.** 자산 목록/상세/대시보드가 다루는 소스가 2개 → **3개**다.
   `source === 'zabbix' ? A : B` 형태의 2분기가 있으면 전부 cloud를 custom으로 오인한다.
2. **신규 필드는 값이 없어도 키가 사라지지 않는다.** 이 응답 DTO들에는 `@JsonInclude(NON_NULL)`이
   **없다** — `cloud: null`, `region: null`, `cloudResourceId: null`이 그대로 내려온다(§2.6 실측).
   따라서 `'cloud' in data`는 항상 true다. **널 판정은 키 존재가 아니라 값으로** 해야 한다.
3. **`collection.failedRegions`는 없다.** 설계 초안의 `string[]` 대신 **`failedRegionCount: number`**다
   (이유 §2.1의 🔴).

---

## 1. A. 신규 — `GET /costs/cloud`

| 항목 | 값 |
|---|---|
| 메서드·경로 | `GET /costs/cloud` |
| 권한 | 🔴 **`cloudInfraMonitoring.awsResources.view`** — 자산 비용의 다른 탭(인증 사용자 전원)과 **축이 다르다**. 원천 데이터(`/cloud-infras/cost-estimate`)와 같은 권한을 쓴다. 없으면 `ForbiddenError` → **HTTP 200 + body `code:403`**(레포 관례) |
| 게이트 | + `CloudCredentialsResolver.requireConfigured()` — 미구성이면 `CLOUD_NOT_CONFIGURED`. 🔴 **`collection.state=disabled`로 강등하지 않는다**: `/cloud-infras/**` 전 조회 EP가 이미 이 계약을 쓰고 FE가 그 코드로 설정 화면을 안내한다. 여기만 다르게 하면 같은 원인에 두 가지 화면이 생긴다 |
| 헤더 | `x-visitor-id` 필수 + accessToken 쿠키 |
| 응답 래핑 | `{ status, code, data, syncTime }` |
| AWS 호출 | 추정 엔진의 무료 `Describe*` 팬아웃(EC2·EBS·EIP) + Price List(캐시). **CloudWatch·Cost Explorer 호출 0** — 실청구는 DB만 읽는다 |
| 컨트롤러·서비스 | `cost/CostController#getCloudCosts` · `cost/CostCloudService` |

### 쿼리 파라미터 (전부 옵셔널 · blank = 미적용)

| 파라미터 | 타입 | 의미 |
|---|---|---|
| `region` | string | 리전 정확 일치 |
| `state` | string | EC2 상태 정확 일치(`running`·`stopped`…) |
| `owner` | string | **자산** 소유자 정확 일치(미등록 인스턴스는 owner=null이라 걸리지 않는다) |
| `assetLinked` | boolean | `true`=자산 등록된 것만 · `false`=미등록만 · 미지정=전부 |
| `resourceId` | string | 인스턴스 단건 — 자산 상세의 클라우드 비용 카드용 |

🔴 **필터는 `instances`·`waste`만 거른다.** `summary`와 `filterOptions`는 **필터 적용 전** 모집단으로 계산한다.
(리전을 고르는 순간 "이번 달 총 추정"이 그 리전 값으로 바뀌면 요약과 표가 서로 다른 뜻이 된다. 후보값도
적용 후로 뽑으면 다른 리전으로 갈아탈 수 없다.)

#### 🔴 필터별로 `waste`에 적용되는 규칙이 다르다 (QA F6 결정)

| 필터 | `instances` | `waste` |
|---|---|---|
| `region` | 적용 | **적용** |
| `state` · `owner` · `assetLinked` | 적용 | **미적용** — 낭비 행에는 인스턴스 상태·소유자·자산 연결 축이 없다 |
| `resourceId` | 적용 | **적용하되 "그 인스턴스에 귀속되는 종류"만**(= `STOPPED_INSTANCE_EBS`) |

**`resourceId` 단건 조회에서 `waste`가 좁아지는 이유**: 낭비 3종의 `resourceId`는 **서로 다른
네임스페이스**다 — `STOPPED_INSTANCE_EBS`만 instanceId이고, `UNATTACHED_EBS`는 volumeId,
`UNUSED_EIP`는 퍼블릭 IP다. 자산 상세의 비용 카드에 **계정 전체의** 미부착 EBS·미사용 EIP를 얹으면
그 인스턴스가 쓰지도 않는 돈을 그 인스턴스 것처럼 말하게 된다(미부착 EBS는 정의상 어떤 인스턴스에도
붙어 있지 않고, AWS는 "예전에 어디 붙어 있었는지"를 주지 않는다).

> 판정은 **종류를 명시적으로 검사**한다. id 비교만 두면 "형식이 안 겹쳐서 우연히 걸러진다"에 기대게 되고,
> 종류가 늘 때 그 우연이 깨져도 아무도 눈치채지 못한다.

🔴 **FE 주의 — 자산 상세 카드에서 `summary.wasteMonthlyUsd`를 쓰지 말 것.** `summary`는 위 규칙대로
**필터 적용 전 계정 전체** 값이다. 단건 카드에는 `waste[]`의 합만 쓴다.

---

## 2. 응답 타입 (Java 필드와 1:1)

### 2.1 `GET /costs/cloud` → `CostCloudResDto`

```ts
interface CostCloudResDto {
  collection: {
    state: 'ok' | 'partial';
    reason: 'PRICING_UNAVAILABLE' | 'EC2_UNAVAILABLE' | null;
    /** 🔴 리전 '이름 목록'이 아니라 '개수'다. 아래 주 참조 */
    failedRegionCount: number;
  };
  summary: {
    estimatedMtdUsd: number | null;      // 이번 달 누적 추정(컴퓨트 가동시간 + EBS 일할)
    projectedMonthUsd: number | null;    // 월말 예상(running이 이대로 한 달)
    wasteMonthlyUsd: number | null;
    basis: 'ON_DEMAND';                  // 🔴 항상 이 값 — RI/SP·데이터전송 미반영을 화면이 명시할 것
    instanceCount: number;               // terminated 제외
    assetLinkedCount: number;
    assetUnlinkedCount: number;          // = instanceCount − assetLinkedCount
    billedMtdUsd: number | null;
    billingState: 'ok' | 'disabled' | 'unavailable';
    diffPct: number | null;              // (추정−실청구)/실청구×100, 소수 1자리
  };
  instances: CostCloudInstance[];
  waste: CostCloudWaste[];
  filterOptions: {                       // 🔴 필터 적용 전 모집단
    regions: string[];                   // 오름차순
    states: string[];
    owners: string[];                    // null·공백 제외
  };
}

interface CostCloudInstance {
  // ── 추정 엔진 그대로 ──
  instanceId: string;
  name: string;                          // Name 태그, 없으면 '-'(추정 엔진의 폴백)
  region: string;
  instanceType: string;
  os: 'Linux' | 'Windows';
  state: string;                         // running | stopped | pending | ...
  runningHours: number;                  // 이번 달, 스냅샷 개수 × 5분
  hourlyUsd: number | null;              // 단가 조회 실패 시 null
  computeMtdUsd: number | null;
  ebsGb: number;
  ebsMonthlyUsd: number | null;
  projectedMonthUsd: number | null;
  // ── 자산 조인(ZM-119 신설) ──
  assetId: number | null;                // null = 자산 미등록 → '지금 동기화' 유도 대상
  assetName: string | null;
  owner: string | null;
  lifecycle: string | null;              // active | retired | ...
  assetExcluded: boolean;                // 등록은 됐지만 관리대상 제외된 자산
}

interface CostCloudWaste {
  kind: 'UNATTACHED_EBS' | 'UNUSED_EIP' | 'STOPPED_INSTANCE_EBS';
  resourceId: string;
  region: string;
  detail: string;
  monthlyUsd: number | null;             // 단가 미상이면 null
}
```

> 🔴 **`failedRegionCount`가 개수인 이유.** 설계 초안(§5.3)은 `failedRegions: string[]`이었다. 그런데 이 값의
> 출처인 `CloudCostEstimateService.estimate()`는 실패 리전의 **이름을 보존하지 않고 개수만** 센다
> (`collection.failedRegions: number`). 이름을 실으려면 추정 엔진을 고쳐야 하는데, 그 엔진은 EC2 개요 화면이
> 이미 쓰고 있고 이번 작업의 원칙이 **"추정 엔진·실청구 코드는 수정하지 않는다 — 조합만"**이다.
> 그래서 값은 개수로 두되 **이름을 `failedRegions`로 부르지 않았다** — 배열로 오해하면 `.map()`이 터진다.
> ⚠️ `POST /assets/sync`의 `cloud.failedRegions`는 **진짜 이름 배열**이다(그쪽은 우리 코드가 만든다). 헷갈리기 쉬운 지점.

> **`billingState` 3값을 뭉치지 않은 이유.** `disabled`는 사용자가 **켤 수 있는** 상태(유료 API 옵트인 꺼짐),
> `unavailable`은 켜졌는데 이번 달 적재분이 없어 **기다리거나 권한을 봐야 하는** 상태다. 화면이 다른 안내를 해야 한다.

### 2.2 B. `POST /assets/sync`

**요청** — `SyncAssetsReqDto`

```ts
interface SyncAssetsReqDto {
  mode: 'add_only' | 'add_update';      // 기존 그대로(zabbix 구간에만 의미)
  groupIds?: string[];                  // 기존 그대로(zabbix 구간에만 적용)
  /** 🔴 필드 부재 = ["zabbix"](레거시 호환). 빈 배열은 부재가 아니다 — 아래 표 */
  sources?: ('zabbix' | 'cloud')[];     // 대소문자 무시, 공백 trim
}
```

#### 🔴 `sources` 판정 표 (QA D1 정정)

| 보낸 값 | 결과 |
|---|---|
| **필드 없음**(`undefined`) | `["zabbix"]`로 호환 처리 — 이 필드를 모르는 기존 호출이 갑자기 AWS를 훑으면 안 된다 |
| `["zabbix"]` | Zabbix만 |
| `["cloud"]` | 클라우드만 |
| `["zabbix","cloud"]` | 둘 다(독립 트랜잭션) |
| **`[]`(명시적 빈 배열)** | ❌ **`ASSET_SYNC_NO_SOURCE`** |
| `["  ", null]`(공백만) | ❌ **`ASSET_SYNC_NO_SOURCE`**(정규화 후 선택 0건) |
| `["zabix"]` · `["zabbix","gcp"]` | ❌ **`ASSET_INVALID_SYNC_SOURCE`**(하나라도 미지 값이면 **부분 수행하지 않는다**) |
| `[" Cloud "]` | ✅ `cloud`로 정규화(trim + 소문자) |

> 🔴 **빈 배열을 부재와 같게 취급하지 않는 이유.** 부재는 "이 필드를 모른다"이고, 빈 배열은 화면이
> **"아무 소스도 고르지 않았다"를 명시적으로 보낸 것**이다. 둘을 같게 두면 사용자가 체크박스를 모두
> 해제하고 실행했을 때 **고르지 않은 Zabbix 전체 동기화(dev 실측 76건)가 조용히 돌아간다**
> — 아무 일도 안 일어난 줄 알았는데 자산이 갱신돼 있다.
>
> **에러 형태는 `ASSET_INVALID_SYNC_MODE`와 동일**: HTTP **200** + body `{"status":"error","code":400,
> "errorCode":"ASSET_SYNC_NO_SOURCE"}`. FE는 HTTP 상태가 아니라 `errorCode`로 분기해야 한다.
> **검증은 Zabbix 조회 전**에 끝나므로 거부된 요청은 **아무것도 건드리지 않는다**.
>
> **FE 권장**: 소스 체크박스를 모두 해제하면 실행 버튼을 비활성화하는 편이 낫다 — 이 에러는
> 마지막 방어선이지 정상 동선이 아니다.

**응답** — `SyncAssetsResDto`

```ts
interface SyncAssetsResDto {
  // 🔴 최상위 4개는 Zabbix 구간 값 그대로다(의미 불변). 클라우드를 합산하지 않는다 —
  //    기존 토스트가 이 숫자를 읽고 있어 합치면 화면이 조용히 거짓말한다.
  added: number;
  updated: number;
  skipped: number;
  total: number;                        // = added + updated + skipped (Zabbix)
  syncedAt: string;                     // ISO 'yyyy-MM-ddTHH:mm:ss.SSSZ'(UTC)
  /** sources에 cloud를 넣지 않았으면 null */
  cloud: CloudSyncResult | null;
}

interface CloudSyncResult {
  added: number;                        // 신규 cloud 자산
  updated: number;                      // 🔴 '값이 실제로 바뀐' 것만 (관측 시각만 바뀐 회차는 0)
  missing: number;                      // 이번 회차에 안 보여 missing 처리
  skipped: number;                      // excluded 자산 + custom 자산 충돌
  reason: 'AWS_NOT_CONFIGURED' | 'AWS_UNAVAILABLE' | 'SYNC_FAILED' | 'PARTIAL_REGIONS' | null;
  failedRegions: string[];              // 🔴 이쪽은 진짜 '이름' 배열
}
```

| `reason` | 뜻 | 화면 안내 |
|---|---|---|
| `null` | 정상 | 결과 카운트 표시 |
| `AWS_NOT_CONFIGURED` | 자격증명이 아예 없음 | "설정 > 클라우드 인프라에서 키를 등록하세요" |
| `AWS_UNAVAILABLE` | **AWS 단계** 실패 — 자격증명 해석 불가(저장된 시크릿 복호화 실패 등) 또는 리전 조회 전체 실패 | "저장된 자격증명을 읽지 못했습니다 — 설정에서 다시 입력" |
| `SYNC_FAILED` | **저장 단계** 실패 — AWS 조회는 성공했다 | "잠시 후 다시 시도" (🔴 자격증명·네트워크를 의심하게 만들지 말 것) |
| `PARTIAL_REGIONS` | **일부** 리전 수집 실패(성공 리전 ≥1) | `failedRegions` 나열 + "해당 리전 자산은 이번 회차에서 제외" |

> 🔴 **성공 리전 0 + 실패 ≥1은 `PARTIAL_REGIONS`가 아니라 `AWS_UNAVAILABLE`이다**(코덱스 🔴3).
> 하나도 못 봤는데 "일부만 됐다"고 말하면 사용자는 나머지가 반영된 줄 안다. 이 경우 missing 판정도 없다.

> 🔴 **`AWS_UNAVAILABLE`과 `SYNC_FAILED`를 나눈 이유**: 초판은 두 단계를 한 catch로 묶어 **DB 유니크 충돌을
> "AWS를 쓸 수 없음"으로 보고**했고, 그 때문에 원인을 자격증명에서 찾게 만들었다(2026-08-26 실제 오진).

🔴 **클라우드 구간의 실패가 HTTP 500이 되지 않는다.** 같은 요청의 Zabbix 구간은 이미 성공했을 수 있고,
500이면 사용자가 그 결과를 못 본다. 두 구간은 **독립 트랜잭션**이다(실측: §6.2).

### 2.2-b. `GET /costs/hw/{assetId}/depreciation` — `source`·`platform` 추가 (FE-5)

```ts
interface DepreciationDetailResDto {
  assetId: number;
  name: string;
  source: 'zabbix' | 'custom' | 'cloud';   // 🔴 신설(FE-5)
  platform: 'hw' | 'cloud';                // 🔴 신설 — source에서 파생
  deviceType: string;
  /* …이하 기존 필드 그대로… */
}
```

⚠️ **정상 응답에서 `source==='cloud'`인 경우는 없다** — cloud 자산은 이 EP 자체가
`ASSET_COST_NOT_APPLICABLE`로 거부되기 때문이다(§3-12/코덱스 🔴4). 따라서 이 필드는 **화면 분기용이
아니라 표시·로깅용**이고, FE가 원했던 "추가 왕복 없이 cloud 판정"은 실질적으로 **에러 코드가 답한다**.
`GET /costs/hw`의 목록 행에도 `platform`이 이미 있으므로 드릴다운 진입 전에 이미 알 수 있다.

### 2.3 C. `GET /costs/dashboard` — `cloud` 추가

```ts
interface CostDashboardResDto {
  kpi: …;  widgets: …;  reviewCandidates: …;  filterOptions: …;  period: …;   // 기존 그대로
  /** 🔴 항상 키가 있고 값이 null일 수 있다(부분 성공) */
  cloud: {
    projectedMonthUsd: number | null;
    estimatedMtdUsd: number | null;
    instanceCount: number;
    billedMtdUsd: number | null;      // 옵트인 꺼짐이면 null
    state: 'ok' | 'partial';          // 추정 수집 상태
  } | null;
}
```

`cloud === null`이 되는 조건 **3가지 전부**(에러 아님, HW 대시보드는 정상 렌더):
1. `cloudInfraMonitoring.awsResources.view` 권한 없음
2. AWS 미구성
3. 추정 조회 실패(자격증명 복호화 실패 포함)

🔴 **통화 합산 금지.** HW는 KRW 상각·유지비, cloud는 USD 사용량 추정이다. 하나의 총액으로 뭉치면 그 숫자는
아무 뜻도 없다. **카드 2개를 나란히** 놓는다. 기획의 `Platform allocation` 도넛도 금액이 아니라 **자산 수** 기준.

### 2.4 D. `GET /assets/dashboard` 변경분

```ts
// kpi
kpi.cloudCount: number;               // 신설. 🔴 total = zabbixCount + customCount + cloudCount
kpi.completenessExcludedCount: number; // 🔴 신설 — 완성도 집계에서 뺀 자산 수(사유: source=cloud)

// composition.bySourceCoverage — 4구간 → 6구간
bySourceCoverage: {
  zabbixMonitored: number;
  zabbixUnmonitored: number;
  customLinked: number;
  customUnlinked: number;
  cloudLinked: number;                // 신설 — Zabbix 호스트가 연결됨(= 지표를 받고 있다)
  cloudUnlinked: number;              // 신설 — AWS엔 있는데 우리가 안 보고 있음
}
// 🔴 여섯 값의 합 = 모집단. 누적막대를 그릴 때 한 구간을 빠뜨리면 total과 어긋난다.
```

🔴 **완성도 집계는 cloud 자산을 모수에서 뺀다**(코덱스 🟡5). 완성도 10항목 중 5개
(`location`·`serial`·`vendorModel`·`os`·`geo`)는 **Zabbix 인벤토리에서만** 오는데 cloud 자산에는 그 축이
아예 없다. 그대로 세면 EC2가 늘 때마다 평균이 떨어져 **"관리가 나빠지고 있다"는 거짓 신호**가 된다.

| 값 | 모수 |
|---|---|
| `kpi.completenessAvgPct` · `kpi.completeCount` | cloud 제외 |
| `quality.completeness[].filled` · `.total` · `.pct` | cloud 제외(**KPI와 같은 모수** — 갈리면 화면이 자기모순) |
| `kpi.completenessExcludedCount` | 뺀 건수(사유는 `source=cloud` 하나) |
| `kpi.total` · 작업 큐 · `tagCounts` · 나머지 전 섹션 | **cloud 포함**(빼는 것은 완성도뿐) |

> FE는 완성도 카드에 "클라우드 자산 n건 제외" 부제를 붙일 수 있다.

`lifecycle.byAcquisitionYear` / `acquisitionUnknownCount`의 **cloud 규칙**(§3-8 참조): cloud 자산은
취득일이 아니라 `cloud_data.launch_time`의 연도로 센다. 화면 라벨은 "**가동 시작일**"로 구분 표기할 것.

### 2.5 E·F. 자산 목록·상세 DTO

```ts
// AssetListItemDto (GET /assets 의 items[]) — 2개 추가
cloudResourceId: string | null;   // source=cloud의 EC2 instanceId. 그 외 소스는 null
region: string | null;            // 🔴 source=cloud일 때만 cloud_data.region. 그 외는 무조건 null

// AssetDetailDto (GET /assets/{id}) — 1개 추가
cloudResourceId: string | null;
// cloudData: Map<string, unknown> — 기존 필드지만 source=cloud면 §3의 스키마로 채워진다
```

> **`region`을 custom 자산에서도 읽지 않은 이유**(FE 요청 1 답변): custom 자산의 `cloud_data`는 사용자가
> 아무 값이나 넣을 수 있는 자유 형식이다. 거기서 리전을 읽으면 목록이 **검증되지 않은 문자열을 리전인 것처럼**
> 표시하게 된다. 따라서 `source === 'cloud'`가 아니면 null이며, FE의 "없으면 location 폴백"은 그대로 유효하다.

**필터**: `GET /assets?source=cloud` · `GET /assets/dashboard?source=cloud` 둘 다 허용값에 `cloud` 추가.
(그 외 값은 종전대로 **조용히 무시**하고 필터 미적용.)

### 2.6 nullability — 키 생략은 없다 (FE 요청 3 답변)

이 레포의 `@JsonInclude(NON_NULL)`은 **DTO별 옵트인**이고(`ApiResult` 래퍼 자체와 일부 DTO만),
`CostDashboardResDto` · `AssetDashboardResDto` · `AssetListItemDto` · `AssetDetailDto` · `CostCloudResDto` ·
`SyncAssetsResDto`에는 **붙어 있지 않다**. 따라서:

| 필드 | 키 존재 | 값 |
|---|---|---|
| `CostDashboardResDto.cloud` | **항상** | 객체 또는 `null` |
| `AssetDashboardResDto.kpi.cloudCount` | **항상** | number (0 포함) |
| `bySourceCoverage.cloudLinked` / `cloudUnlinked` | **항상** | number (0 포함) |
| `AssetListItemDto.cloudResourceId` / `region` | **항상** | string 또는 `null` |
| `SyncAssetsResDto.cloud` | **항상** | 객체 또는 `null` |
| `CostCloudResDto.summary.*` nullable들 | **항상** | number 또는 `null` |

실측(§6.1): `'cloud' in data === true`, `data.cloud === null`.

---

## 3. 🔴 판정 규칙 (어기면 화면이 거짓을 말한다)

| # | 항목 | 규칙 | 근거 |
|---|---|---|---|
| 1 | **upsert 키** | `asset.cloud_resource_id = instanceId`. Name 태그로 매칭 **금지**(중복·변경이 흔하다) | 설계 §7 · `Ec2ZabbixMatcher`와 동일 원칙 |
| 2 | **사용자 필드 불가침** | 동기화가 `owner_name`·`notes`·`custom_properties`·`cost_data`·**생성 후** `device_type`·(사용자가 지정한) `linked_hostid`를 **절대 쓰지 않는다** | §7 |
| 3 | **변경 없으면 저장 없음** | 관측 시각을 뺀 값이 동일하면 **엔티티 save도 활동 이력도 없다**. 관측 시각은 `last_synced_at` **벌크 UPDATE**로만 찍어 `updated_at`을 흔들지 않는다 | R1 — 5분 배치가 목록 "최근 변경"을 EC2로 덮는 것 방지 |
| 4 | **missing 판정 범위** | 수집에 **성공한 리전**의 자산만. 실패 리전·리전 정보 없는 자산은 손대지 않는다. 이미 `missing`이면 이력을 다시 남기지 않는다 | §4.1·§4.3 |
| 5 | **연결 해제 금지** | 매치 실패(매칭기 콜드·Zabbix 장애·후보 0건)는 **해제가 아니다** — 기존 `linked_hostid`·`link_basis` 유지. 교체는 **`INSTANCE_ID_EXACT`로 다른 호스트가 확정될 때만**(IP 근거는 기존 연결을 못 뒤집는다) | §4.4 — 깜빡임도 미연결만큼 나쁘다 |
| 6 | **lifecycle 강제/복구** | `terminated`·`missing` → `retired`로 덮되 **우리가 실제로 바꿨을 때만** `cloud_data.lifecycle_forced_by_sync=true` 표식을 세운다. 복구(`active`)는 **그 표식이 있고 현재 값이 여전히 `retired`일 때만** 하고 표식을 지운다. 🔴 사용자가 스스로 `retired`로 둔 자산(표식 없음)은 **되돌리지 않는다** | §4.3 · 코덱스 🔴1 |
| 6-1 | **표식 해제 시점** | 사용자가 PATCH로 `lifecycleStatus`를 바꾸면 표식을 지운다 — 그 순간부터 그 값은 사용자 것이다 | 코덱스 🔴1 |
| 6-2 | **동시 쓰기** | `asset.version`(V37) 낙관적 잠금. 배치는 충돌 시 **재조회 후 1회 재시도**(재시도가 사용자의 최신 값을 보므로 해제·표식이 되살아나지 않는다), PATCH는 `ASSET_CONFLICT` | 코덱스 🔴2 |
| 7 | **custom 충돌** | 사용자가 손으로 만든 custom 자산의 `cloud_data.resource_id`가 같으면 **cloud 자산을 만들지 않고 skip** + 그 custom 자산에 활동 메모 1회(같은 메모 반복 금지). **자동으로 source를 cloud로 바꾸지 않는다**(편집 소유권이 다르다) | §3.1 |
| 8 | **excluded** | `excluded=true`인 cloud 자산은 동기화가 건너뛴다(soft delete 유지). upsert 조회 모집단에는 **포함**한다 — 빼면 "없음"으로 오판해 같은 instanceId를 재생성하다 유니크 제약에 걸린다 | §4.2 |
| 9 | **coverage 축이 다르다** | zabbix: host status. **cloud: `linked_hostid` 유무**. custom: 연결 여부 | §3.3 |
| 10 | **연식 축** | cloud는 취득일 대신 `cloud_data.launch_time` 연도. 없으면 `acquisitionUnknownCount`로 | §5.5 |
| 11 | **품질 태그 미적용** | cloud 자산에는 `inventory_disabled`·`inventory_sparse`·`cost_missing`·`classification_tag_mismatch`를 **달지 않는다**(채울 수 없는 항목이라 큐가 거짓 작업으로 찬다). `owner_missing`·`host_unlinked`·`unclassified`·`expired`는 **그대로 적용** | §5.5 |
| 12 | **HW 모집단** | `GET /costs/hw`·`/costs/dashboard`·`/costs/hw/incomplete`·업로드 템플릿의 모집단에서 `source='cloud'` **제외** | 결정 #11 개정 |
| 13 | **cost_data 쓰기 거부** | cloud 자산에 `cost_data`를 쓰면 `ASSET_COST_NOT_APPLICABLE`. 일괄 업로드도 같은 경로라 **행 실패**로 리포트 | 결정 #11 개정 |
| 14 | **platform 파생** | `derivePlatform`의 축이 `cloud_data.resource_id` 유무 → **`source === 'cloud'`**로 교체 | §5.3 |
| 15 | **통화** | KRW(HW) · USD(Cloud) **합산 금지**. 대시보드는 나란히 | §7 |
| 16 | **권한** | Cloud 비용 데이터 = `awsResources.view`. 자산 목록에서 **cloud 자산 행 자체는** 자산 권한으로 보인다(메타는 비밀이 아니다) | §7 |

### 3-G. `PATCH /assets/{id}` — cloud 자산 편집 규칙 (신설)

`source='cloud'`는 zabbix도 custom도 아닌 **세 번째 분기**다. (이 분기가 없으면 custom 경로로 떨어져
사용자가 넣은 `cloud_data`를 다음 회차가 덮고, coverage가 custom 규칙으로 재파생돼 **연결된 EC2가
unmonitored로 뒤집힌다** — 실제로 그렇게 만들 뻔했다.)

| 요청 필드 | cloud 자산에서 |
|---|---|
| `name` · `zabbixData` · `inventoryMode` · `resourceType` · `cloudData` | 🔴 **거부** → `ASSET_CLOUD_READ_ONLY` |
| `costData` | 🔴 **거부** → `ASSET_COST_NOT_APPLICABLE` |
| `lifecycleStatus` | 편집 가능 — 🔴 저장 시 `cloud_data.lifecycle_forced_by_sync` 표식을 **지운다**(그 순간부터 그 값은 사용자 것이고, 동기화가 되돌리지 않는다) |
| `ownerName` · `notes` · `customProperties` | 편집 가능(사용자 소유) |
| `deviceType` | 편집 가능 — 동기화는 **생성 시에만** `server`를 넣고 이후 사용자 값을 이긴다 |
| `linkedHostid` | 편집 가능(값 지정) — 저장 후 `coverage`를 즉시 재파생한다. `null`은 여전히 "미변경"이며, **해제는 `clearFields`로 한다**(아래) |
| `clearFields` | 🔴 **신설(FE-2)** — `["linkedHostid"]`. 아래 표 참조 |

#### `clearFields` — 연결 해제 (🔴 M1 필수, FE-2 채택)

```ts
// PATCH /assets/{id}
{ "clearFields": ["linkedHostid"] }
```

| 항목 | 값 |
|---|---|
| 허용값 | **M1은 `"linkedHostid"` 하나.** 그 밖의 값은 `ASSET_INVALID_CLEAR_FIELD`로 **거부**(조용히 무시하면 "지웠는데 그대로"가 되어 기능이 없던 때와 증상이 같다) |
| 적용 소스 | **zabbix · custom · cloud 전부**(요청 형태를 소스마다 다르게 만들지 않는다) |
| 효과 | `linked_hostid = null` + `coverage` 재파생 + 활동 이력 `{field:"linkedHostid", before:"10001", after:null}` |
| cloud 추가 효과 | 🔴 `cloud_data.link_basis = "manual_cleared"` — **다음 5분 배치가 같은 IP 근거로 되붙이지 못하게** 하는 금지 표식이다. 이게 없으면 해제 버튼이 아무 일도 하지 않은 것과 같아진다 |
| 재연결 예외 | `INSTANCE_ID_EXACT`(Zabbix 호스트명이 instanceId거나 `aws.instanceId` 태그)로 확정되면 **재연결한다** — 사람이 명시한 식별자는 오연결일 수 없다. 이때 `link_basis`는 `INSTANCE_ID_EXACT`로 교체돼 표식이 풀린다 |
| 이미 미연결 | **no-op** — 저장도 이력도 없다(빈 이력 금지) |
| ⚠️ zabbix 자산 | 해제는 되지만 **다음 동기화가 되돌린다**(그 소스의 `linked_hostid`는 `zabbix_hostid` 파생값이라 사용자 소유가 아니다). 화면이 이 사실을 안내할 것 |

> **(b) `linkedHostid: ""`를 해제로 해석하는 안을 택하지 않은 이유**: "빈 값 = 삭제"는 사용자가 실수로
> 저장 버튼을 누른 폼에서도 발동한다. 지우는 것은 **명시적으로** 말하게 한다.

**신규 에러 코드 3종** (레포 관례상 **HTTP 200 + body `code`/`errorCode`**):

| errorCode | 언제 |
|---|---|
| `ASSET_CLOUD_READ_ONLY` | cloud 자산의 동기화 소유 필드를 편집하려 함 |
| `ASSET_COST_NOT_APPLICABLE` | cloud 자산에 `cost_data`를 쓰려 함(PATCH `/assets/{id}` · PATCH `/costs/hw/{id}` · 일괄 업로드 행) |
| `ASSET_INVALID_CLEAR_FIELD` | `clearFields`에 허용 목록 밖 필드명(M1: `linkedHostid`만) |
| `ASSET_SYNC_NO_SOURCE` | `POST /assets/sync`에 `sources: []`(또는 공백만) — 고른 소스가 0건 |
| `ASSET_INVALID_SYNC_SOURCE` | `sources`에 `zabbix`/`cloud` 밖의 값 |
| `ASSET_CONFLICT` | 🔴 낙관적 잠금 충돌(body `code:409`) — 배치가 먼저 같은 자산을 바꿨다. 화면은 "다시 불러온 뒤 저장" 안내 |

---

## 4. `cloud_data` 스키마 (source=cloud · 동기화 소유)

`asset.cloud_data`(jsonb) 컬럼 타입은 **바뀌지 않았다**(`Map<string, unknown>`). custom 자산의 자유 형식과
목록 검색 쿼리(`cloud_data->>'exposure'`)를 지키기 위해서다. cloud 자산일 때 채워지는 키는 아래로 고정된다
(Java: `asset/cloud/AssetCloudData`).

| 키 | 값 | FE 상수 |
|---|---|---|
| `resource_type` | 고정 `"ec2"` | 🆕 확장 필요 |
| `resource_id` | instanceId(= `cloudResourceId` 컬럼) | 기존 |
| `region` | 리전명 | 기존 |
| `availability_zone` | | 🆕 |
| `instance_type` · `platform_details` · `architecture` | | 🆕 |
| `state` | `pending`·`running`·`stopping`·`stopped`·`shutting-down`·`terminated`·**`missing`** | 🆕 |
| `launch_time` | ISO 문자열(연식 축이 쓴다) | 🆕 |
| `vpc` · `subnet` | vpcId · subnetId | 기존 |
| `security_groups` | 🔴 **쉼표로 이은 문자열**(배열 아님 — 기존 폼 키를 그대로 렌더하기 위해) | 기존 |
| `private_ip` · `public_ip` · `dns_name` | | `public_ip`만 🆕 |
| `exposure` | `"exposed:public-ip"` \| `"private"` — 기존 savedView `public_access` 필터가 이 값을 읽는다 | 기존 |
| `name_tag` · `tags` | Name 태그 · 전체 태그 맵(object) | 🆕 |
| `first_seen_at` | 최초 관측 ISO(생성 시 1회 고정) | 🆕 |
| `link_basis` | `"INSTANCE_ID_EXACT"` \| `"IP_EXACT"`(자동 연결 근거) \| **`"manual_cleared"`**(사용자가 해제 — 근거가 아니라 재연결 금지 표식) | 🆕 |
| `account` · `arn` | 🔴 **현재는 항상 없음(null)** — §5 참조 | 기존 |

🔴 **`last_seen_at`은 `cloud_data`에 없다.** "마지막으로 관측한 시각"의 정본은 **`asset.last_synced_at` 컬럼**이다
(목록·상세 DTO에 이미 있는 필드). 설계 §3.2에는 jsonb 키로 적혀 있었지만 그대로 두면 (a) 회차마다 값이 바뀌어
dirty check가 매번 "변경"이 되고(R1 위배) (b) 저장을 건너뛴 회차엔 컬럼과 jsonb가 **서로 다른 시각**을 말하게 된다.
값이 둘이면 화면은 둘 중 하나로 거짓말한다. `first_seen_at`은 생성 시 1회 고정이라 jsonb에 남는다.

**🆕 표시가 붙은 키는 FE `constants/asset.ts`의 `ASSET_DETAIL_CLOUD_GROUPS` 확장이 필요하다**
(설계 §3.2의 "차이 나는 키는 FE 상수를 확장"). 기존 키(`account`·`region`·`resource_id`·`arn`·`vpc`·`subnet`·
`security_groups`·`private_ip`·`dns_name`·`exposure`)는 **설계 표기(`account_id`·`vpc_id`…) 대신 폼 키를 채택**했다
— 같은 뜻의 키가 둘이 되면 상세 화면이 자산마다 다른 칸을 그린다.

---

## 5. 설계 대비 바뀐 점

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| 1 | `cloud_data.last_seen_at` (§3.2) | **폐기** — `asset.last_synced_at` 컬럼이 정본 | R1(dirty check)과 정면 충돌. 값이 둘이면 하나는 거짓 |
| 2 | `cloud_data.account_id`·`vpc_id`·`subnet_id`·`security_group_ids[]` (§3.2) | `account`·`vpc`·`subnet`·`security_groups`(쉼표 문자열) | 기존 수동 폼 키를 따르라는 §3.2 후단 규칙 |
| 3 | `account`·`arn` 채움 (§3.2) | 🔴 **항상 null** | 계정 id는 `Reservation.ownerId`에만 있는데 게이트웨이가 예약을 인스턴스 목록으로 평탄화하며 잃는다. ENI의 `ownerId`로 대신 만들지 **않았다** — 공유 VPC에서 남의 계정 ENI가 붙으면 **틀린 계정의 ARN**이 자산에 박힌다. 빈 칸이 틀린 값보다 낫다. (M2: 게이트웨이가 예약 정보를 보존하도록 먼저 수정) |
| 4 | `collection.failedRegions: string[]` (§5.3) | `failedRegionCount: number` | 추정 엔진이 이름을 보존하지 않음 + "추정 엔진 수정 금지" 원칙. 이름으로 오해되지 않게 필드명도 바꿈 |
| 5 | `cloud.reason` 2값 (§4.1) | **`AWS_UNAVAILABLE` 추가** | 저장된 시크릿 복호화 실패가 500이 되어 **Zabbix 구간 결과까지 삼켰다**(dev DB 실측). "안 넣었다"와 "깨졌다"는 안내가 달라야 한다 |
| 6 | `CostDashboardResDto.cloud` 조립 위치 | 서비스가 아니라 **컨트롤러**가 `withCloud()`로 붙임 | 클라우드 요약은 AWS HTTP 왕복이다. `@Transactional(readOnly=true)` 안에서 부르면 그 왕복 내내 DB 커넥션을 점유한다(자산 상세·자산 대시보드와 같은 판단) |
| 7 | — | `AssetListItemDto.region` 신설 | FE 요청 1 |
| 8 | `aws/spi/InstanceSnapshotListener` 주입 | `List<>` → **`ObjectProvider<>`** | 🔴 `CloudSnapshotService` ↔ `CloudAssetSyncService`가 서로를 생성자에서 요구해 `BeanCurrentlyInCreationException`으로 **앱이 아예 안 떴다**(실측). ObjectProvider는 호출 시점 해석이라 생성 순환이 끊긴다 |
| 10 | §6.1 "회차는 겹치지 않는다" | **upsert 직렬화 + 유니크 충돌 1회 재시도** | 그 불변식을 <b>수동 경로에 강제하지 않아</b> 배치(15초)와 겹치면 둘 다 생성 → 유니크 위반. §7-2 참조 |
| 20 | §4.3 "직전 강제값이 그대로면 복구" | **`lifecycle_forced_by_sync` 표식 기반 복구** | 현재 값이 retired라는 사실만으론 사용자의 폐기와 우리의 강제를 구분 못 한다 — 사용자가 폐기한 멀쩡한 인스턴스를 5분 뒤 되살렸다(코덱스 🔴1) |
| 19 | — | **`asset.version` 낙관적 잠금(V37)** + 배치 재시도 / PATCH `ASSET_CONFLICT` | PATCH↔배치 lost update로 해제·표식이 소리 없이 되살아났다(코덱스 🔴2). 선택 근거는 아래 |
| 18 | 전 리전 실패도 `PARTIAL_REGIONS` | 성공 0 & 실패 ≥1 → `AWS_UNAVAILABLE` | 하나도 못 봤는데 "일부만 됐다"는 거짓(코덱스 🔴3) |
| 17 | — | `GET /costs/hw/{id}`·상각 스케줄 EP에서 cloud 거부 | 모집단에서만 뺐더니 **단건 fallback이 0원짜리 가짜 상각표**를 만들었다(코덱스 🔴4) |
| 16 | — | 완성도 집계에서 cloud 제외 + `completenessExcludedCount` | 못 채우는 항목으로 평균을 깎으면 거짓 신호(코덱스 🟡5) |
| 15 | — | 수동 sync도 `Ec2ZabbixMatcher.indexInstances` 갱신 | 안 하면 색인이 콜드라 IP 매칭이 fail-closed로 통째로 죽는다(코덱스 🟡6) |
| 14 | `sources` 미지정이면 `["zabbix"]` (§4.5) | **부재만** 레거시 호환. 빈 배열·미지 값은 400 | QA D1. 빈 배열을 부재로 접으면 고르지 않은 76건 동기화가 조용히 돈다 |
| 13 | — | `?resourceId=` 단건 조회 시 `waste`를 인스턴스 귀속 종류로 한정(규칙 명시) | QA F6. 기존 구현도 결과는 같았지만 **id 네임스페이스가 안 겹치는 우연**에 기대고 있었다 |
| 12 | — | `PATCH /assets/{id}`에 `clearFields` 신설 | FE-2 채택. §3-5(동기화는 자동 해제 안 함) + `null`=미변경이 맞물려 **오연결을 아무도 못 끊는** 상태였다 |
| 11 | `cloud_data.first_seen_at` = `LocalDateTime.toString()` | **`yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`** | 타임존 지시자가 없으면 JS `new Date()`가 <b>로컬 시각</b>으로 읽어 KST에서 9시간 어긋난다(나노초 9자리도 비표준). 실측값 `2026-08-26T08:24:28.053023300`이 그 상태였다 |
| 9 | — | `GET /costs/dashboard`에서 `isConfigured()` 직접 호출 제거 | 그 메서드가 **예외를 던질 수 있어** HW 비용 대시보드까지 500이 됐다(실측 후 수정, §6.2) |

---

## 6. 실제 응답 샘플 — 🔴 **전부 실측**(dev :3001 / 5433, 실 AWS, 2026-08-26)

모집단: 자산 **80건** = zabbix 78 + custom 1 + **cloud 1**. cloud 자산은 5분 배치가 만든
`ec2-tokyo`(id **176**, `i-06ac35f551a92b5b1`, ap-northeast-1, t2.micro, running).

### 6.1 `GET /costs/cloud`

```json
{"status":"success","code":200,"data":{
  "collection": {"state":"ok","reason":null,"failedRegionCount":0},
  "summary": {
    "estimatedMtdUsd":1.09, "projectedMonthUsd":11.86, "wasteMonthlyUsd":0.0,
    "basis":"ON_DEMAND",
    "instanceCount":1, "assetLinkedCount":1, "assetUnlinkedCount":0,
    "billedMtdUsd":null, "billingState":"disabled", "diffPct":null
  },
  "instances": [{
    "instanceId":"i-06ac35f551a92b5b1", "name":"ec2-tokyo", "region":"ap-northeast-1",
    "instanceType":"t2.micro", "os":"Linux", "state":"running",
    "runningHours":29.33, "hourlyUsd":0.0152, "computeMtdUsd":0.45,
    "ebsGb":8, "ebsMonthlyUsd":0.77, "projectedMonthUsd":11.86,
    "assetId":176, "assetName":"ec2-tokyo", "owner":null, "lifecycle":"active",
    "assetExcluded":false
  }],
  "waste": [],
  "filterOptions": {"regions":["ap-northeast-1"], "states":["running"], "owners":[]}
},"syncTime":null}
```

`billingState:"disabled"`는 **유료 API 옵트인(Cost Explorer)이 꺼져 있어서**다
(`/cloud-infras/status` → `paidFeatures.costExplorer:false`). 에러가 아니다.

**필터 실측** — 필터는 표만 거르고 요약·후보값은 그대로:

| 요청 | `instances` 길이 | `summary.instanceCount` | `filterOptions.regions` |
|---|---:|---:|---|
| (없음) | 1 | 1 | `["ap-northeast-1"]` |
| `?assetLinked=false` | **0** | **1** | **`["ap-northeast-1"]`** |
| `?region=us-east-1` | **0** | **1** | `["ap-northeast-1"]` |
| `?resourceId=i-06ac35f551a92b5b1` | 1 | 1 | `["ap-northeast-1"]` |

### 6.2 `GET /assets?source=cloud` (total 1)

```json
{"id":176,"source":"cloud","name":"ec2-tokyo","zabbixHostid":null,
 "groupNames":[],"inventoryType":null,"inventoryOs":null,
 "tagCount":0,"customPropertyCount":0,"excluded":false,
 "lastSyncedAt":"2026-08-26T08:24:43.236Z","updatedAt":"2026-08-26T17:24:33.331Z",
 "deviceType":"server","resourceType":"ec2","location":null,"owner":null,
 "coverage":"unmonitored","linkedHostName":null,
 "lifecycleStatus":"active","deploymentStatus":"deployed",
 "cloudResourceId":"i-06ac35f551a92b5b1","region":"ap-northeast-1"}
```

> `location:null` + `region:"ap-northeast-1"` — FE 요청 1의 폴백이 정확히 이 모양을 전제한다.
> `coverage:"unmonitored"`는 이 EC2가 Zabbix에 없어서다(자동 연결 후보 0건). 결함이 아니다.

### 6.3 `GET /assets/176` 의 `cloudData` (동기화가 채운 전체)

```json
{"resource_type":"ec2","resource_id":"i-06ac35f551a92b5b1",
 "region":"ap-northeast-1","availability_zone":"ap-northeast-1c",
 "instance_type":"t2.micro","platform_details":"Linux/UNIX","architecture":"x86_64",
 "state":"running","launch_time":"2025-04-14T05:34:26Z",
 "vpc":"vpc-0e68e571baa20e270","subnet":"subnet-0a12c05410ac63af8",
 "security_groups":"sg-08c302f54437b62be",
 "private_ip":"172.31.6.3","public_ip":"35.79.226.94",
 "dns_name":"ec2-35-79-226-94.ap-northeast-1.compute.amazonaws.com",
 "exposure":"exposed:public-ip",
 "name_tag":"ec2-tokyo","tags":{"Name":"ec2-tokyo"},
 "first_seen_at":"2026-08-26T08:24:28.053Z"}
```

`account`·`arn`·`link_basis`는 **키 자체가 없다**(값이 없으면 키를 넣지 않는다 — §4).
⚠️ `first_seen_at`은 위 형식이 **수정 후** 값이다. 실측 당시 값은 `2026-08-26T08:24:28.053023300`(Z 없음)이었고
그대로 두면 FE가 9시간 어긋나게 읽는다 — §5-11로 수정했다(**이 수정은 재기동 후 새로 생성되는 자산부터 적용**).

### 6.4 `GET /assets/dashboard`

```json
"kpi": { "total":80, "zabbixCount":78, "customCount":1, "cloudCount":1, ... },
"composition": { "bySourceCoverage": {
  "zabbixMonitored":75, "zabbixUnmonitored":3,
  "customLinked":0, "customUnlinked":1,
  "cloudLinked":0, "cloudUnlinked":1 } },
"lifecycle": { "byAcquisitionYear":[ ..., {"year":2025,"count":6,"beyondUsefulLife":0}, ... ],
               "acquisitionUnknownCount":11 },
"quality": { "tagCounts": {
  "unclassified":62, "classification_tag_mismatch":29, "owner_missing":12,
  "host_unlinked":2, "host_disabled":3, "inventory_disabled":33,
  "inventory_sparse":33, "cost_missing":11, "expired":12 } }
```

🔴 **판정 규칙이 이 숫자로 실증된다**:
- 합계: `78+1+1 = 80` · `75+3+0+1+0+1 = 80` (누적막대 6구간 합 = 모집단)
- **연식(§3-10)**: cloud 자산의 `launch_time`이 2025-04이라 **2025 구간에 들어갔다**.
  `acquisitionUnknownCount`는 cloud 등록 전(11)과 **그대로 11** — 미상으로 새지 않았다.
- **품질 태그(§3-11)**: cloud 자산이 하나 늘었는데 `inventory_disabled`·`inventory_sparse`(33)·
  `cost_missing`(11)은 **그대로**이고, `owner_missing`(11→**12**)·`host_unlinked`(1→**2**)만 +1이다.
  → 못 채우는 태그는 안 달고, 채울 수 있는 공백은 그대로 잡는다.

### 6.5 `GET /costs/dashboard` · `GET /costs/hw`

```json
"cloud": {"projectedMonthUsd":11.86,"estimatedMtdUsd":1.09,"instanceCount":1,
          "billedMtdUsd":null,"state":"ok"}
```

🔴 **`GET /costs/hw`의 `total` = 79** (자산 80 − cloud 1). 결정 #11 개정(§3-12)이 실측으로 확인됐다.

### 6.6 dirty check (§3-3)

배치 1회차 `added=1`, **2회차 `added=0 updated=0 missing=0 skipped=0`** — 값이 안 바뀌었으므로
저장도 활동 이력도 없다. `updated_at`은 1회차 시각(`17:24:33.331`)에 멈춰 있고
`lastSyncedAt`만 앞으로 간다(`08:24:43.236Z`).

### 6.7 AWS 없는 경로 (초판 실측, 여전히 유효)

`POST /assets/sync {"mode":"add_only"}` (레거시 — `sources` 없음) → Zabbix만 수행, `cloud: null`
```json
{"added":0,"updated":0,"skipped":76,"total":76,
 "syncedAt":"2026-08-26T07:57:48.375Z","cloud":null}
```

---

## 7. 검증 상태

| 항목 | 상태 |
|---|---|
| 빌드 · 전체 테스트 | ✅ `gradlew cleanTest test` **1559 tests / 0 fail**(착수 baseline 1477 → **+82**) |
| V36 Flyway 적용 | ✅ 실기동 `now at version v36` |
| **실 AWS → cloud 자산 등록** | ✅ 5분 배치가 `i-06ac35f551a92b5b1` → 자산 id 176 생성(§6) |
| **`GET /costs/cloud` 실응답** | ✅ 자산 조인 `assetLinkedCount:1` 포함(§6.1) |
| **필터 4종 실왕복** | ✅ 표만 좁히고 요약·후보값은 모집단 유지(§6.1 표) |
| **결정 #11 개정** | ✅ `/costs/hw` total **79** = 자산 80 − cloud 1 |
| **품질 태그 미적용** | ✅ cloud +1인데 `inventory_*`·`cost_missing` 불변, `owner_missing`·`host_unlinked`만 +1 |
| **연식 launch_time 규칙** | ✅ 2025 구간 편입, `acquisitionUnknownCount` 불변(11) |
| **dirty check(R1)** | ✅ 2회차 `added=0 updated=0 missing=0 skipped=0`, 이력 없음 |
| 대시보드 2종 신규 필드 | ✅ 실왕복(§6.4·§6.5) |
| 레거시 `POST /assets/sync`(sources 없음) | ✅ 실왕복, `cloud:null` |
| 동기화 규칙 24종(생성·dirty check·사용자 필드 보존·missing·연결·custom 충돌·excluded·리스너·**직렬화**·**재시도**·**FE-2 해제/재연결**) | ✅ 단위 테스트 |
| `CostCloudService` 15종(조합·필터·실청구 대조 + **F6 waste 귀속 3종**) | ✅ 단위 테스트 |
| **`sources` 판정 6종**(부재·빈 배열·공백만·미지 값·부분 미지·정규화) | ✅ 단위 테스트 |
| **코덱스 🔴1** lifecycle 표식(사용자 retired 보존 / 시스템 retired 복구 / 사용자 값 미주장) | ✅ 단위 테스트 3종 |
| **코덱스 🔴2** 낙관적 잠금 재시도가 사용자 해제를 되돌리지 않음 | ✅ 단위 테스트 |
| **코덱스 🔴3** 전 리전 실패 → `AWS_UNAVAILABLE` | ✅ 단위 테스트 |
| **코덱스 🔴4** 단건 비용 EP 2종 cloud 거부 | ✅ 단위 테스트 |
| **코덱스 🟡5** 완성도 모수 제외 + 작업 큐는 유지 | ✅ 단위 테스트 2종 |
| **코덱스 🟡6** 수동 sync 색인 갱신 / 부분 실패 시 콜드 | ✅ 단위 테스트 2종 |
| 🔴 **V37 Flyway 적용** | ❌ **미검증** — 재기동 필요 |
| `clearFields` PATCH 5종 | ✅ 단위 테스트 |
| 🔴 **`clearFields` 런타임** | ❌ **미검증** — :3001은 이 EP가 없는 구 jar다. **재기동 필요** |
| 🔴 **경합 수정 런타임** | ❌ **미검증**(단위 테스트로 락 검출력까지 실증) — **재기동 필요** |
| 🔴 **`first_seen_at` Z 표기** | ❌ **미검증** — 재기동 후 **새로 생성되는** 자산부터 적용(기존 176은 옛 표기 유지) |

### 🔴2 선택 근거 — (a) 낙관적 잠금을 택했다

코덱스가 제시한 두 안 중 **(a) `@Version` + 배치 재시도 / PATCH `ASSET_CONFLICT`**를 택했다.

- **(b) cloud 소유 컬럼만 부분 UPDATE**는 배치가 엔티티 mutation을 버려야 하는데, 그러면
  `applyCloudSnapshot`/`linkHost`/`forceLifecycle`이 죽고 **기존 동기화 테스트 20여 건이 엔티티 상태를
  더 이상 검증할 수 없게 된다**(전부 저장 인자 검증으로 재작성). 게다가 `cloud_data` 자체가
  `link_basis`를 품고 있어 "링크만 조건부"가 성립하지 않는다 — jsonb 부분 병합 SQL이 필요해지고,
  그건 :3001 재기동 금지 상태에서 **런타임으로 확인할 수 없는 코드**다.
- **(a)의 위험은 blast radius**(Asset을 쓰는 다른 경로가 새로 예외를 던짐)인데, 그건 지금까지
  **조용한 lost update였던 것이 보이게 되는 것**이라 방향이 옳다. 새 예외가 500으로 새지 않도록
  `GlobalExceptionHandler`에 `OptimisticLockingFailureException → ASSET_CONFLICT`(200 + code 409)
  마지막 그물을 두었다.
- 🔴 `AssetService.update`는 **`saveAndFlush`**여야 한다 — `save`면 UPDATE가 트랜잭션 커밋(프록시 경계,
  메서드 밖) 시점에 나가 **catch가 못 잡고 500으로 샌다**(네트워크 맵에서 겪은 함정).
- ⚠️ `touchLastSyncedAt` 벌크 UPDATE는 version을 올리지 않는다 — 관측 시각만 찍는 무해한 갱신이고,
  올리면 배치가 자기 자신과 충돌한다.

### 🔴 실측으로 잡힌 M1 차단급 결함 — 배치 ↔ 수동 동기화 경합 (수정 완료)

**증상**: 기동 직후 `POST /assets/sync {"sources":["cloud"]}` 첫 호출이 `reason:"AWS_UNAVAILABLE"`.
바로 다시 부르면 정상. 자동 배치는 성공 — 자격증명 문제가 아니었다.

**원인**(로그가 8ms 차이로 못박았다):
```
17:24:33.355 [scheduling-2]     Cloud asset sync (batch): added=1
17:24:33.363 [nio-3001-exec-7]  ERROR: duplicate key ... "uq_asset_cloud_resource_id"
17:24:33.377 [nio-3001-exec-7]  cloud asset sync (manual) failed
```
`cloud_snapshot` 배치는 리전 17개 팬아웃에 **14.9초**가 걸린다. 그 창 안에 수동 동기화가 들어오면
둘 다 `findBySource`로 "이 인스턴스는 아직 자산이 없다"를 읽고 **둘 다 `create()`** → 먼저 커밋한
쪽이 이기고 나머지는 유니크 제약에 걸린다. 하필 **새 인스턴스가 처음 등록되는 순간에만** 나므로
"AWS 동기화 버튼을 처음 눌렀을 때만 실패"로 보인다.

**진짜 원인은 문서와 코드의 불일치다**: 설계 §6.1에 "회차는 겹치지 않는다"고 적어 놓고
**수동 경로에는 그 불변식을 강제하지 않았다**.

**수정 3가지**:
1. **upsert 직렬화** — AWS 조회는 락 밖에서 끝나므로 잠기는 구간은 DB 트랜잭션뿐이다.
   (락을 빼면 회귀 테스트가 `expected: 1 but was: 2`로 실패하는 것까지 확인 — 검출력 실증)
2. **유니크 위반 1회 재시도** — 다중 인스턴스에서는 JVM 락이 안 통한다. 재시도는 상대가 커밋한 행을
   보고 **생성이 아닌 갱신 경로로 수렴**하므로 1회면 충분하다. 사용자에겐 실패로 보이지 않는다.
3. **`SYNC_FAILED` 분리** — DB 충돌을 `AWS_UNAVAILABLE`로 보고해 **원인을 자격증명에서 찾게 만든**
   오진을 없앴다(§2.2 표).

### ℹ️ 초판의 오진 정정

초판은 "AWS 실연동 미검증 · `/costs/cloud` 500은 선재 문제"라고 적었다. **사실이 아니었다** —
내가 기동 스크립트를 **구 Nest `moveseye-be/.env`**(다른 `CREDENTIAL_ENCRYPTION_KEY`)를 읽도록
바꿔 놓아 CLOUD 시크릿이 복호화되지 않았던 것이다. 정본은 **Spring `.env`**이며, 그 키로 띄우면
`/cloud-infras/status`가 `ready`이고 모든 클라우드 경로가 정상이다(§6 전체가 그 상태의 실측).

⚠️ 교훈으로 남긴다: **"환경이 원래 그렇다"는 진단은 내가 그 환경을 바꾸지 않았을 때만 유효하다.**

---

## 8. 구현 파일

**신규**
```
src/main/resources/db/migration/V36__asset_cloud.sql
src/main/java/com/dmove/moveseye/aws/spi/InstanceSnapshotListener.java
src/main/java/com/dmove/moveseye/asset/cloud/AssetCloudData.java
src/main/java/com/dmove/moveseye/asset/cloud/CloudAssetDerivation.java
src/main/java/com/dmove/moveseye/asset/cloud/CloudAssetSyncService.java
src/main/java/com/dmove/moveseye/asset/dto/CloudSyncResultDto.java
src/main/java/com/dmove/moveseye/cost/CostCloudService.java
src/main/java/com/dmove/moveseye/cost/dto/CostCloudResDto.java
src/main/java/com/dmove/moveseye/cost/dto/SearchCostCloudDto.java
src/test/java/com/dmove/moveseye/asset/cloud/CloudAssetSyncServiceTest.java        (18)
src/test/java/com/dmove/moveseye/cost/CostCloudServiceTest.java                    (12)
src/test/java/com/dmove/moveseye/aws/CloudSnapshotListenerNotificationTest.java    (4)
```
(그 밖에 기존 테스트에 추가: `AssetServiceTest` +5 · `CostServiceTest` +3 ·
 `AssetQualityPolicyTest` +3 · `AssetDashboardAggregatorTest` +4)
```
```

**변경**
```
engine-api/.../common/exception/ErrorCode.java          (+ASSET_CLOUD_READ_ONLY, +ASSET_COST_NOT_APPLICABLE,
                                                         +ASSET_INVALID_CLEAR_FIELD)
aws/CloudSnapshotService.java                           (리전별 성공/실패 추적 · 리스너 통지 · fetchInstances)
asset/domain/Asset.java                                 (SOURCE_CLOUD, cloudResourceId,
                                                         applyCloudSnapshot/forceLifecycle/linkHost/clearLink)
asset/repository/AssetRepository.java                   (findByCloudResourceId(In), findBySource, findCustomByCloudResourceIds, touchLastSyncedAt)
asset/repository/AssetActivityRepository.java           (findTop1ByAssetIdAndActionOrderByIdDesc)
asset/AssetActivityService.java                         (actorType 지정 오버로드 · recordSyncNote · hasRecentSyncNote)
asset/AssetSyncService.java                             (sources 분기 · 클라우드 구간 조립)
asset/AssetService.java                                 (update의 cloud 분기 · applyClearFields — FE-2)
asset/AssetDerivation.java                              (cloud 경고 주석)
asset/quality/AssetQualityPolicy.java                   (cloud 태그 미적용)
asset/dashboard/AssetDashboardAggregator.java           (cloudCount · cloudLinked/Unlinked · acquisitionYear)
asset/dto/{AssetListItemDto, AssetDetailDto, AssetDashboardResDto, SyncAssetsReqDto, SyncAssetsResDto,
           SearchAssetListDto, SearchAssetDashboardDto, UpdateAssetReqDto(+clearFields)}.java
cost/{CostService, CostController, CostBulkUploadService}.java
cost/dto/CostDashboardResDto.java                       (+CloudSummary, +withCloud)
src/test/java/.../{CostServiceTest, CostCloudServiceTest, CostControllerMvcTest,
                   AssetQualityPolicyTest, AssetDashboardAggregatorTest, AssetDashboardFixtures}.java
```

---

## 🔄 FE 요청사항

<!-- FE에서 필요한 BE 변경을 여기에 남긴다. BE가 검토 후 회신한다. -->

### FE-1. `collection.failedRegionCount` → 리전 이름도 함께 (우선순위 낮음, M2)

**현상**: 부분 수집 배너에 "리전 2곳을 조회하지 못했습니다"까지만 쓸 수 있다. 사용자는 **어느 리전을
다시 봐야 하는지** 알 수 없고, 그 리전 인스턴스가 목록에서 통째로 빠진 것도 확인할 방법이 없다.

**요청**: `failedRegionCount`는 그대로 두고 `failedRegions: string[]`을 **추가**로 실어 줄 수 있는지.
(§5-4의 "추정 엔진 수정 금지" 원칙은 이해했다 — 엔진을 못 고치면 이 요청은 M2로 미뤄도 된다.
`POST /assets/sync`는 이미 이름 배열을 주므로 **동기화 경로만이라도 이름을 볼 수 있다**는 점은 확인했다.)

**FE 현재 처리**: 개수만 표시. 배열로 오해할 여지가 없게 i18n 키도 `failed_region_count`로 지었다.

**→ 조치: M2로 미룬다(BE 변경 없음). 판단 근거**
- 이름을 실으려면 `CloudCostEstimateService`가 실패 리전 이름을 보존하도록 고쳐야 하는데, 그 엔진은
  **EC2 개요 화면(`/cloud-infras/cost-estimate`)이 이미 쓰고 있다**. 이번 작업의 원칙은 "조합만" —
  자산 비용 탭 하나 때문에 두 화면의 공용 엔진을 건드리면 회귀 범위가 이 티켓 밖으로 나간다.
- 🔴 그리고 **지금 고쳐도 반쪽이다**: 추정 엔진의 `runParallel`은 실패를 `null`로만 표시하고
  리전 이름과의 대응을 잃는다(`POST /assets/sync` 쪽은 우리가 그 대응을 인덱스로 잡아 두었기 때문에
  이름을 줄 수 있는 것이다). 엔진에 같은 인덱스 대응을 넣는 것이 M2 작업의 실체다.
- 그때까지 **"어느 리전인지"는 동기화 경로가 답한다** — 배너에 "자산 동기화를 실행하면 실패한 리전 이름을
  확인할 수 있습니다" 정도의 안내가 가능하다(같은 자격증명·같은 리전 목록을 쓴다).

---

### FE-2. cloud 자산의 `linkedHostid` **연결 해제** 경로 (우선순위 중간)

**현상**: §3-G의 ⚠️대로 `linkedHostid: null`은 "미변경"이라 편집 폼에서 값을 비워도 연결이 끊기지 않는다.
그런데 §3-5는 동기화가 연결을 **절대 자동 해제하지 않는다**고 못박았고, 해제 권한은 사용자에게만 있다.
결과적으로 **한 번 잘못 붙은 연결을 아무도 끊을 수 없다** — 오연결이 영구화된다.
(IP 매칭으로 붙은 링크가 실제로 다른 호스트였을 때가 이 경로다. `link_basis`가 `IP_EXACT`인 건들.)

**요청**: 아래 중 하나.
- (a) `PATCH /assets/{id}`에 `clearFields: ["linkedHostid"]` 지원 (비용 EP의 `clearFields`와 같은 관례), 또는
- (b) `linkedHostid: ""`(빈 문자열)를 해제로 해석.

**FE 현재 처리**: 폼에서 비우면 그냥 저장되지 않는다(사용자에겐 "저장했는데 그대로"로 보인다).
BE 회신 전까지 이 칸에 "지금은 해제할 수 없다"는 안내를 붙일지 판단 보류 — 회신 오면 즉시 배선한다.

**↳ FE 반영 (2026-08-26, 개정 계약 §3-G `clearFields` 채택본 기준)**: 자산 편집 폼의 연결 호스트 칸에
Popconfirm "연결 해제" 액션을 붙여 `PATCH {clearFields:["linkedHostid"]}`를 다른 변경과 **한 요청에**
실어 보낸다(해제 예약 시 모순되는 `linkedHostid`는 body에서 제거). 소스별 결과 안내 3종
(zabbix="다음 동기화가 되돌립니다" / cloud="IP 매칭 재연결 차단, instanceId 근거는 재연결" /
custom="미감시가 됩니다"), 이미 미연결이면 버튼 미노출(BE no-op이라 눌러도 아무 일이 없다),
`ASSET_INVALID_CLEAR_FIELD` 매핑. 테스트 9종(`AssetUnlinkHost.test.tsx`). **보류 안내 문구는 이걸로 닫았다.**

**→ 조치: (a) 채택·구현 완료. M1에 포함.** 계약은 **§3-G의 `clearFields` 절**이 정본이다.

- 요청 형태: `PATCH /assets/{id}` 본문에 `{"clearFields":["linkedHostid"]}`. 다른 편집 필드와 함께 보내도 된다.
- **(b) 빈 문자열 안은 채택하지 않았다** — "빈 값 = 삭제"는 실수로 저장한 폼에서도 발동한다.
- 🔴 **BE가 추가로 한 일**: 해제만으로는 부족했다. 다음 5분 배치가 "미연결이네" 하고 **같은 IP 근거로
  다시 붙이면** 해제 버튼이 아무 일도 안 한 것이 된다. 그래서 cloud 자산은 `cloud_data.link_basis`에
  `manual_cleared` 표식을 심어 IP 근거 재연결을 막는다. **단 `INSTANCE_ID_EXACT`는 재연결을 허용한다** —
  Zabbix 호스트명이 instanceId이거나 `aws.instanceId` 태그가 달린 경우로, 사람이 명시한 식별자라
  오연결일 수 없다. (이 두 경로가 회귀 테스트로 고정돼 있다.)
- **FE가 알아야 할 것**: 해제 후 `link_basis`가 `"manual_cleared"`인 자산은 "사용자가 연결을 끊음"으로
  표시할 수 있다(자동 미연결과 구분된다). zabbix 자산에 이 기능을 쓰면 **다음 동기화가 되돌린다** —
  그 소스의 `linked_hostid`는 파생값이라 사용자 소유가 아니다. 화면이 안내할 것.
- 🔴 **재기동 필요** — :3001의 구 jar에는 이 EP가 없다.

---

### FE-3. `cloud_data.tags`(전체 태그 맵) 표시 (우선순위 낮음, M2)

**현상**: §4의 `tags`는 object다. 자산 상세의 클라우드 필드 그룹은 값을 **한 줄 문자열**로 그리는 구조라
그대로 넣으면 `[object Object]`가 찍힌다. 그래서 이번엔 상세 그룹에서 **뺐다**(수집은 되는데 안 보인다).

**요청**: BE 변경은 불필요하다 — FE에 태그 전용 UI(키·값 테이블)가 필요한 것이고 M2로 잡았다.
**기록 목적**: "태그가 응답에 있는데 화면에 없다"가 결함으로 재보고되지 않게 남긴다.

**→ 확인. BE 조치 없음.** 판단에 동의한다. 실측값도 object다(§6.3의 `"tags":{"Name":"ec2-tokyo"}`).
⚠️ 한 가지만 덧붙인다: `name_tag`는 **별도 스칼라 키로 이미 나가고 있다**(§4) — 상세 화면에서 가장 자주
필요한 Name 태그는 `tags` UI를 기다리지 않고 지금 바로 그릴 수 있다. `tags`는 나머지 전체 맵이다.

---

### FE-5. `GET /costs/hw/{id}/depreciation` 응답에 `source`(또는 `platform`) 추가 (우선순위 중간)

**현상**: 런타임 QA D2 수정으로 **cloud 자산이면 상각 드릴다운 화면을 열지 않도록** 막았다
(계약 §3-12로 HW 모집단에서 빠진 자산인데 화면이 존재하면, 사용자가 상각 폼을 전부 채우고
저장에서야 `ASSET_COST_NOT_APPLICABLE`로 거부당한다).

그런데 `DepreciationDetailResDto`에는 `source`·`platform`이 **없다**(BE DTO 확인). 그래서 FE가
`GET /assets/{id}`를 **한 번 더 읽어** 판정한다 — 드릴다운 1건짜리 화면이라 감수했지만 왕복 1회가
순수 낭비다.

**요청**: `DepreciationDetailResDto`에 `source`(`zabbix|custom|cloud`) 한 필드 추가. 그러면 FE는
추가 조회를 지운다.

**FE 현재 처리**: `useAssetDetail(assetId)` 병행 조회 + `source === 'cloud'` 판정
(`CostHwDepreciationPage.tsx`). 필드가 오면 그 자리에서 교체 가능하도록 판정 지점을 한 곳에 모아 뒀다.

---

### FE-5. 상각 스케줄 응답에 `source`/`platform`이 없어 추가 왕복이 필요하다

**→ 조치: 채택·구현 완료.** `DepreciationDetailResDto`에 `source`(zabbix|custom|cloud)와
`platform`(hw|cloud)을 추가했다(§2.2-b).

🔴 다만 **이 필드로 cloud를 분기할 일은 없다**는 점을 함께 알린다. 같은 검수 라운드의 🔴4 수정으로
cloud 자산은 이 EP에서 `ASSET_COST_NOT_APPLICABLE`로 **거부**되므로, 정상 응답의 `source`가 `cloud`인
경우가 존재하지 않는다. 즉 FE가 실제로 필요한 판정은 **에러 코드**가 답한다.

- 추가 왕복이 정말 필요한 지점은 **드릴다운 진입 전**인데, 거기서 쓰는 `GET /costs/hw` 목록 행에는
  `platform`이 이미 있다(그리고 cloud 자산은 그 목록의 모집단에서 아예 빠진다 — §3-12).
- 그래도 필드를 넣은 이유는 **응답만 보고 무엇에 대한 상각표인지 알 수 있게** 하기 위해서다
  (로그·버그 리포트·캡처에서 자산을 되짚을 때).

### FE-4. (질문 아님 · 공유) 계약 픽스처 타입 게이트가 **동작하지 않고 있었다**

ZM-116의 "픽스처에 `: TAssetDashboard`를 박아 두면 tsc가 계약 어긋남을 잡는다"는 전제가 FE 레포에서
**실제로는 아무 데서도 실행되지 않았다**:
- `tsconfig.json`이 `exclude: ["src/__tests__"]` → 기본 `tsc`가 픽스처를 안 본다
- `isolatedModules: true` → ts-jest도 전사만 하고 타입을 안 본다

이번 대조에서 `kpi.cloudCount`·`bySourceCoverage.cloudLinked/cloudUnlinked` 누락이 `tsc`·`jest`
**양쪽을 통과**해서 드러났다. FE에 `tsconfig.contract.json` + `npm run typecheck:contract`를 추가해
게이트를 실제로 돌게 했다(앱 소스 + 픽스처만 검사, 테스트 본문 제외). BE 조치 불필요.

**→ 확인. 공유 감사하다.** BE 쪽에도 같은 종류의 함정이 있어 대칭으로 적어 둔다:
`IntegrationTestSupport` 계열 IT는 **DB가 없으면 skip**된다(리포트에는 남는다). "테스트가 있다"와
"테스트가 돌았다"가 갈리는 구조가 양쪽 레포에 하나씩 있는 셈이다 —
CI에 붙일 때 FE는 `typecheck:contract`를, BE는 그 skip을 실패로 승격해야 게이트가 실제로 선다.
