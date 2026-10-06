# API 계약 — 자산 현황 대시보드 (`GET /assets/dashboard`)

> 산출 2026-08-26 · Claude(be-engineer) · 티켓 **ZM-116** · 브랜치 `ZM-116`(worktree `C:\worktrees\zm-116-be`)
> 설계 정본: [devdesign_asset-dashboard.md](../02-%EC%84%A4%EA%B3%84/MovesEye-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC-%EC%9E%90%EC%82%B0-%ED%98%84%ED%99%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C-%28Asset-Overview-Dashboard%29.md) M1 · 형제 계약: [contract_asset-cost.md](API-%EA%B3%84%EC%95%BD-%EC%9E%90%EC%82%B0-%EB%B9%84%EC%9A%A9%28Cost%29-M1-%28HW-%ED%83%AD-%EC%83%81%EA%B0%81-%EC%97%94%EC%A7%84%29.md) §5-D
> 실측: dev 프로필 **:3001 / 5433 도커 DB**(자산 79건), 2026-08-26 — §5의 응답 샘플은 실제 왕복 결과다.
>
> **개정 v1.1 (2026-08-26)** — FE 요청 반영: **F-1 채택**(`byDeviceType[].color` → `colorPreset`) · **F-2 채택**(`GET /assets`에 `qualityTag` 필터 신설 → F-3도 해소). 미커밋 상태에서 반영해 호환성 부담 없음. F-4·F-5는 답변만(코드 변경 없음).

---

## 1. 엔드포인트

| 항목 | 값 |
|---|---|
| 메서드·경로 | `GET /assets/dashboard` |
| 권한 | **인증 사용자 전원**(목록·요약과 동일. 관리자 가드 없음) |
| 헤더 | `x-visitor-id` 필수(`@VisitorIdCheck` — `/assets/**` 공통) + accessToken 쿠키 |
| 응답 래핑 | `{ status, code, data, syncTime }` — `/assets/**` 공통 `ApiResult` |
| 에러 | 기존 관례(대부분 HTTP 200 + body code). **이 EP는 자체 에러 코드를 새로 만들지 않는다** |
| 컨트롤러 | `asset/AssetController#getDashboard` · 서비스 `asset/dashboard/AssetDashboardService` |

### 짝 엔드포인트 — `GET /assets?qualityTag=<태그>` (2026-08-26 신설, F-2)

작업 큐의 사유 태그를 **자산 목록에서 그대로 재현**하는 필터. 태그 9종 전부를 받으며 **단일 값**이다.

| 항목 | 값 |
|---|---|
| 허용 값 | `unclassified` · `classification_tag_mismatch` · `owner_missing` · `host_unlinked` · `host_disabled` · `inventory_disabled` · `inventory_sparse` · `cost_missing` · `expired` |
| 미지 값 | 🔴 **HTTP 200 + 바디 `code: 400`·`errorCode: ASSET_INVALID_QUALITY_TAG`** — HTTP 상태가 400이 <b>아니다</b>(이 레포의 에러 관례: 대부분 200 + 바디 code). FE는 `status`/`errorCode`로 판정해야 하며 HTTP 상태로 분기하면 오류를 놓친다. 거부하는 이유는, 조용히 무시하면 오타 난 딥링크가 "전체 목록"으로 착지해 사용자가 잘못된 집합을 진짜라고 믿기 때문이다.<br>실측 응답: `{"status":"error","code":400,"errorCode":"ASSET_INVALID_QUALITY_TAG","message":"ASSET_INVALID_QUALITY_TAG"}` |
| blank | 필터 미적용(무시) |
| 결합 | 목록의 다른 모든 필터·검색·정렬·페이지네이션과 **AND**. `total`도 필터 적용 후 값 |
| 모집단 | `excluded = false` (대시보드와 동일. `includeExcluded=true`와 함께 써도 태그 판정 대상은 관리 대상뿐) |

> 🔴 **구현이 SQL 술어가 아니다.** `expired`·`cost_missing`의 판정은 `CostParamResolver`의 폴백 체인
> (`cost_data` → inventory → `created_at`)에 걸려 있어 SQL로 옮기는 순간 대시보드 `tagCounts`와 목록 건수가
> 갈린다. 그래서 목록도 **대시보드와 같은 판정기**(`AssetQualityEvaluator`)를 돌려 매칭 id 집합을 만들고
> `id IN (...)`으로 거른다. ⚠️ 상한 전제는 설계 §8.3/Q8(메모리 집계, 자산 1만 건)과 **동일**하다 —
> 목록 EP가 그 전제를 물려받았다는 사실이 이 필터의 유일한 비용이다.

**실측 검증(2026-08-26, dev 79건)** — 9종 전부 `GET /assets?qualityTag=X`의 `total` = 대시보드 `tagCounts[X]`:

| 태그 | 대시보드 | 목록 total |
|---|---:|---:|
| `unclassified` | 62 | 62 |
| `classification_tag_mismatch` | 29 | 29 |
| `owner_missing` | 11 | 11 |
| `host_unlinked` | 1 | 1 |
| `host_disabled` | 3 | 3 |
| `inventory_disabled` | 33 | 33 |
| `inventory_sparse` | 33 | 33 |
| `cost_missing` | 11 | 11 |
| `expired` | 12 | 12 |

AND 결합도 실측: `?qualityTag=unclassified&coverage=unmonitored` → 2건 ·
`?qualityTag=inventory_disabled&limit=3&offset=30` → 3행 반환, `total` 33(페이지네이션 정상).

> 🔴 **`live` 실패는 에러가 아니다.** Zabbix 조회가 실패하면 `data.live = null`로 내려오고 나머지 6개 섹션은
> 정상 채워진다(부분 성공, 500 금지). FE는 `live == null`이면 D 섹션을 "실시간 조회 실패" 카드 하나로 접는다.

### 쿼리 파라미터 (전부 옵셔널)

| 이름 | 의미 | 매칭 |
|---|---|---|
| `deviceType` | 기기분류 code | `asset.device_type` 정확 일치 |
| `groupName` | 호스트그룹명 | `zabbix_data.groups[].name` **정확 일치**(부분 일치 아님) |
| `owner` | 소유자명 | `asset.owner_name` 정확 일치 |
| `lifecycle` | 생애주기 상태 | `asset.lifecycle_status` 정확 일치 |
| `source` | `zabbix` \| `custom` | 그 외 값은 무시(필터 미적용) |
| `coverage` | `monitored` \| `unmonitored` | `asset.coverage` 정확 일치 |

- 🔴 **이름·의미가 `GET /assets`(자산 목록)와 글자 그대로 같다.** 차트 클릭 → 목록 딥링크가 같은 집합을
  보여줘야 하기 때문이다. 하나라도 어긋나면 그 축은 클릭 시 조용히 다른 결과로 착지한다.
- 목록에만 있는 `keyword·savedView·sortBy·limit·offset`은 **이 EP에 없다**(선언하지 않았으므로 Swagger에도
  없고, 보내도 무시된다). 대시보드엔 행이 없어 정렬·페이지가 의미 없다.
- `includeExcluded`도 없다 — 모집단은 **항상 `excluded = false`**다(제외 자산 수는 `population.excludedCount`로만 노출).

---

## 2. 응답 타입 (실제 Java 필드명과 1:1)

```ts
interface AssetDashboardResDto {
  generatedAt: string;          // 🔴 진짜 UTC ISO. 아래 lastSyncedAt/createdAt과 기준이 다르다(§4 시각 규칙)
  population: {
    total: number;              // 필터 적용 후·excluded 제외 = 화면 헤더 "n건 기준"
    excludedCount: number;      // 제외(soft delete) 자산 수 — 집계 미포함 보조 수치
    filtered: boolean;          // 필터가 하나라도 걸렸는지
  };
  kpi: {
    total: number; zabbixCount: number; customCount: number;
    monitored: number; unmonitored: number;
    coveragePct: number;        // monitored/total %, 소수 1자리. total=0 → 0
    unclassified: number;       // device_type = notClassified(또는 미설정)
    ownerMissing: number;
    lifecycleReview: number;    // = planned + retired + expired + (byStatus.other)
    planned: number; retired: number; expired: number;
    completenessAvgPct: number; // 자산별 (채운 항목/10) 평균 %, 소수 1자리
    completeCount: number;      // 10/10 자산 수
    lastSyncedAt: string | null;// 모집단 중 최대. 동기화 자산 0이면 null
    staleSync: boolean;         // now − lastSyncedAt ≥ 24h. lastSyncedAt=null이면 false
  };
  composition: {
    byDeviceType: {             // device_classification 마스터 순서, notClassified **항상 마지막**
      code: string; name: string;
      colorPreset: string;      // 🔴 hex가 아니라 **AntD Tag preset 이름**('blue'·'geekblue'·'default'…).
                                //    차트 색으로 쓰려면 preset→실제 색 변환이 필요하다(F-1로 rename)
      active: boolean;          // false면 화면이 "(비활성)" 표기
      count: number;
    }[];
    bySourceCoverage: {
      zabbixMonitored: number;
      zabbixUnmonitored: number;// zabbix인데 호스트 disabled
      customLinked: number; customUnlinked: number;
    };
    byHostGroup: { name: string; count: number }[];   // 🔴 **전량**(건수 내림차순 → 이름 오름차순)
    otherGroupCount: number;    // = byHostGroup.length − 10 (최소 0). 차트 '그 외 n' 표기용 호환 필드
    byOsFamily: { name: string; count: number }[];    // 🔴 항상 7개, 고정 순서, 0건도 포함
    osUnmatchedSamples: string[];                     // other로 떨어진 raw os 상위 5
    byOwner: { name: string | null; count: number }[];// 🔴 **전량** + name=null(미지정) **항상 마지막**
    otherOwnerCount: number;    // = 명명 소유자 수 − 10 (최소 0). 차트 '그 외 n' 표기용 호환 필드
  };
  lifecycle: {
    byStatus: { active: number; planned: number; retired: number; expired: number; other: number };
    byAcquisitionYear: { year: number; count: number; beyondUsefulLife: number }[]; // 오름차순, 빈 해도 0
    acquisitionUnknownCount: number;   // 🔴 취득일이 created_at 추정인 자산(연도 차트에서 제외된 분)
    beyondUsefulLifeCount: number;
    expiry: { expired: number; within30: number; within60: number; within90: number;
              beyond90: number; unknown: number };   // 🔴 **배타적**(합 = population.total)
  };
  quality: {
    completeness: { field: AssetQualityField; filled: number; total: number; pct: number }[]; // pct 오름차순
    workQueue: {
      assetId: number; name: string; source: 'zabbix' | 'custom';
      deviceType: string | null; owner: string | null;
      coverage: 'monitored' | 'unmonitored' | null;
      reasonTags: AssetQualityTag[];
      linkedHostid: string | null;
    }[];                        // 상위 50건
    workQueueTotal: number;     // 사유가 하나라도 있는 자산 수(distinct)
    tagCounts: Record<AssetQualityTag, number>;      // 🔴 9개 키가 **항상** 존재(0 포함)
  };
  live: {                       // 🔴 실패 시 null
    asOf: string;               // 실시간 값 기준 시각(진짜 UTC). 60초 캐시라 최대 60초 과거
    statusCounts: { healthy: number; degraded: number; unavailable: number; unknown: number };
    topProblemAssets: {
      assetId: number; name: string; deviceType: string | null; owner: string | null;
      status: 'Healthy' | 'Degraded' | 'Unavailable' | 'Unknown';
      activeProblemCount: number;
      maxSeverity: string | null;   // "0"~"5"(중립 심각도 서열). 없으면 null
      linkedHostid: string;
    }[];                        // problem > 0인 자산만, Top 10
  } | null;
  activity: {
    daily: { date: string; created: number; updated: number;
             excluded: number; restored: number; synced: number }[];  // 🔴 항상 30개(0건 날 포함)
    recent: { id: number; assetId: number; assetName: string | null; action: string;
              actorType: 'user' | 'system'; actorName: string | null;
              changedFields: string[]; createdAt: string }[];         // 10건
  };
  filterOptions: { owners: string[]; hostGroups: string[] };  // 🔴 **필터 적용 전** 모집단
}

type AssetQualityField =
  | 'deviceType' | 'owner' | 'location' | 'serial' | 'vendorModel'
  | 'os' | 'acquisitionDate' | 'purchaseCost' | 'expiryDate' | 'geo';

type AssetQualityTag =
  | 'unclassified' | 'classification_tag_mismatch' | 'owner_missing' | 'host_unlinked'
  | 'host_disabled' | 'inventory_disabled' | 'inventory_sparse' | 'cost_missing' | 'expired';

// byOsFamily.name 고정 순서
type AssetOsFamily = 'windows' | 'linux' | 'unix' | 'network_os' | 'hypervisor' | 'other' | 'unknown';
```

---

## 3. 🔴 판정 규칙 (여기를 어기면 화면이 거짓을 말한다)

| 항목 | 규칙 | 어겼을 때 |
|---|---|---|
| **모집단** | `excluded = false` + 필터 선적용. `population.total`이 곧 "n건 기준" | excluded를 섞으면 KPI가 관리 대상이 아닌 장비까지 센다 |
| **`filterOptions`** | **필터 적용 전** 모집단에서 추출 | 적용 후로 뽑으면 `owner=A`를 고른 순간 후보가 `[A]`뿐이라 다른 값으로 갈아탈 수 없다 |
| **"미입력" 조각** | `byOsFamily`(7구간) · `byOwner`의 `name:null` · `byDeviceType`의 `notClassified`는 **0건이어도 응답에 존재** | 0건일 때 숨기면 "전부 채워졌다"와 "아직 아무도 안 봤다"가 같은 그림이 된다 |
| **`byDeviceType` 순서** | 마스터 `sort_order` → 마스터에 없는 잔존 code(`active:false`) → **`notClassified` 마지막** | 미분류가 중간에 섞이면 "가장 큰 조각 = 우리 자산의 대표 분류"로 오독된다 |
| **비활성 분류** | 남은 자산이 있을 때만 조각으로 나오고 `active:false` | 0건 비활성까지 그리면 화면이 죽은 분류로 채워진다 |
| **호스트그룹 합계** | 🔴 자산은 **여러 그룹에 속한다**. `byHostGroup` 합 ≠ `population.total` (실측 41+34+7+… > 79) | 합을 자산 수로 읽으면 "우리 장비가 200대"가 된다. 화면 부제로 명시 필요 |
| **`otherGroupCount`** | Top 10 **밖 그룹의 개수**(자산 수 아님) | "그 외 13대"로 표기하면 거짓 |
| 🔴 **차트는 FE가 자르고, 표는 전량을 편다** | `byHostGroup`·`byOwner`는 **전량**이 내려온다(2026-08-27 F-3). 차트가 Top 10만 그리는 것은 **FE의 절단**이고, 같은 배열을 표는 그대로 전부 펼친다 | BE가 미리 Top 10으로 잘라 내리면 같은 응답을 쓰는 **표가 "그 외 n"에 갇혀 전량을 볼 방법이 없다**(표=로우 데이터 원칙). `otherGroupCount`/`otherOwnerCount`는 차트 표기용으로 **남겨 두되**, 표에서는 쓸 일이 없다 |
| **상한 전제** | 그룹 수는 **수백 이하**를 전제한다(dev 실측 23) | 그 이상 규모가 되면 표 전용 페이지네이션 EP가 필요하다 — 지금은 과설계 |
| **취득일** | `CostParamResolver` 폴백 체인(`cost_data.acquisition_date` → `date_hw_purchase` → `date_hw_install`)을 **그대로 호출**. `created_at` 폴백(추정)은 **연도 차트에서 제외**하고 `acquisitionUnknownCount`로 센다 | 등록일을 취득일로 쓰면 "전부 올해 산 장비"라는 거짓이 만들어진다(dev 11건이 그 경우) |
| **내용연수 경과** | `today ≥ 취득일 + usefulLifeYears`(자산 오버라이드 → 분류 기본값 → 5년, `CostParamResolver` 해석). **취득일 추정이면 판정 안 함** | 방금 등록한 장비가 노후 경고를 받는다 |
| **만료 6구간** | 🔴 **서로 배타적**: `expired`(< today) / `within30`(0~30) / `within60`(31~60) / `within90`(61~90) / `beyond90` / `unknown`. 합 = 모집단 | 비용 화면처럼 누적으로 만들면 막대 합이 자산 수를 넘어 분포가 거짓이 된다 |
| **`expired` 경계** | `expiryDate < today` — **오늘 만료는 아직 경과가 아니다** | 비용 화면과 경계가 갈리면 같은 자산이 한쪽에서만 만료로 잡힌다 |
| **완성도 10항목** | 균등 가중치. 자산 점수 = 채운 항목/10, KPI = 그 평균 | 항목을 늘리거나 줄이면 분모가 바뀌어 %가 조용히 달라진다 |
| **`inventory_mode = -1`** | 인벤토리 5항목을 점수에서 **빼지 않는다**. 대신 `inventory_disabled` 태그로 원인을 알린다 | 빼면 "채울 수 없으니 문제 없음"이 되어 33건(dev)의 공백이 화면에서 사라진다 |
| **`inventory_sparse`** | `inventory_mode ≠ -1` **이면서** 인벤토리 5항목 중 채운 것 ≤ 1. 🔴 `inventory_disabled`와 **겹치지 않는다** | 둘 다 붙이면 관리자가 할 수 없는 조치(인벤토리 채우기)를 하러 간다 |
| **작업 큐** | 자산당 **1행 + 복수 태그**. 정렬 = 태그 수 내림차순 → 모니터링 우선 → 이름 → id | 태그별로 쪼개면 같은 자산이 여러 목록에 반복된다 |
| **상태 4값** | `HostLiveAggregator.statusOf` — 자산 **상세와 같은 규칙**(비가용→Unavailable, 미상→Unknown, 알람 0→Healthy, 그 외 Degraded) | 목록과 상세가 다른 상태를 말하면 어느 쪽도 못 믿는다 |
| **스냅샷에 없는 호스트** | `Unknown`으로 센다 | 없는 것을 Healthy로 세면 죽은 장비가 정상으로 보인다 |
| **`live` 실패** | `live = null`(부분 성공). 대상 호스트가 있는데 가용성 응답이 0건이면 실패로 판정 | 실패를 "전 호스트 unknown"으로 그리면 Zabbix 장애와 실제 미상을 구분할 수 없다 |
| **`activity.daily`** | 항상 30개. **0건인 날도 축에 존재** | 빈 날을 빼면 "아무 일 없던 주"가 사라져 활동이 실제보다 촘촘해 보인다 |
| **`activity` 모집단** 🔴 | 🔴 <b>다른 섹션과 의도적으로 다르다.</b> 필터 없음 → <b>전 자산</b>의 이력(<b>excluded 자산의 이력도 포함</b>) / 필터 있음 → 필터 모집단(excluded 제외) 자산의 이력. `daily`·`recent` 둘 다 같은 규칙 | 다른 섹션 규칙(§3 "모집단")을 그대로 적용하면 <b>제외(excluded) 행위 자체가 피드에서 사라진다</b> — "관리대상에서 뺐다"는 것이야말로 "최근 무엇이 바뀌었나"의 답인데, 제외되는 순간 그 이력이 소급 증발해 E 섹션이 거짓이 된다. (필터가 걸리면 "이 집합의 변화"를 묻는 것이므로 모집단 한정이 맞다.) 정적 QA F6(LOW)로 지적돼 2026-08-26 <b>동작 유지 + 계약 명문화</b>로 결정 |
| **`changedFields`** | 변경 **필드 이름만**(before/after 값은 싣지 않음) | `costData` 같은 필드는 값에 내부 JSON이 통째로 들어 있다 |

### 🔴 비용 화면과 공유하는 판정 3종

`owner_missing` · `host_unlinked` · `cost_missing`은 비용 대시보드 `reviewCandidates`(`missing_cost`·
`owner_missing`·`host_unlinked`)와 **같은 함수**(`asset/quality/AssetQualityPolicy`)를 쓴다.
`CostService`가 이 정책을 호출하도록 리팩터했고(4곳: `buildReviewCandidates`·`assignPriorities`·
`getIncomplete`·KPI `incompleteCount`), 기존 cost 테스트는 그대로 통과한다.

| 태그 | 판정 | 비고 |
|---|---|---|
| `owner_missing` | `owner_name`이 null 또는 공백 | |
| `host_unlinked` | `linked_hostid`가 null 또는 공백 | ⚠️ 설계 §5.6의 "`source=custom` and"는 **뺐다** — zabbix 자산은 동기화가 `linked_hostid`를 항상 채워 결과가 같고, source 조건을 여기만 넣으면 **같은 태그가 두 화면에서 다른 뜻**이 된다 |
| `cost_missing` | `CostParamResolver`의 `incompleteReasons`가 비어 있지 않음 | `/costs/hw/incomplete`(미입력 큐)와 동일 모집단 |

---

## 4. 시각(timestamp) 규칙 — 🔴 기준이 두 가지다

| 필드 | 기준 | 비고 |
|---|---|---|
| `generatedAt` · `live.asOf` | **진짜 UTC** (`Instant` → `…Z`) | 비용 화면 `period.basisDate`와 같은 방식. `dayjs(v).format('HH:mm')`이 로컬 시각으로 정확히 나온다 |
| `kpi.lastSyncedAt` · `activity.recent[].createdAt` | **서버 로컬 벽시계에 `Z`가 붙는다** | `LocalDateTime` + `@JsonFormat("…'Z'")` — `/assets/summary`·`/assets/{id}/activities`와 **동일한 기존 관례**라 그대로 뒀다 |

> 🔴 **두 기준을 섞어 빼지 말 것**(`generatedAt − lastSyncedAt`은 시차만큼 어긋난다).
> `staleSync` 판정은 BE가 같은 기준(`LocalDateTime`)끼리 계산하므로 정확하다 — FE는 그 boolean을 쓰면 된다.

---

## 5. 실제 응답 샘플 (dev 5433, 자산 79건, 2026-08-26 11:52 KST 재실측 — v1.1 rename 반영)

`GET /assets/dashboard` — 배열 일부는 `…` 없이 **앞부분만 잘랐다**(byHostGroup 4/**23**, workQueue 2/50,
topProblemAssets 3/10, daily 4/30, recent 2/10, filterOptions.hostGroups 5/23). 그 외는 실제 값 그대로다.

⚠️ **이 샘플은 2026-08-26 실측이라 F-3 이전 형태다.** 현재 계약에서
`byHostGroup`은 **23개 전량**(샘플은 앞 4개만), `byOwner`도 전량이 내려온다.
`otherGroupCount: 13`은 그대로다(23 − 10) — 차트가 "그 외 13개 그룹"을 표기하는 데 쓴다.
`bySourceCoverage`도 이 샘플 이후 **6구간으로 늘었다**(ZM-119 cloud 2구간 — `contract_asset-cloud.md` §2.4).

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "generatedAt": "2026-08-26T02:52:48.928Z",
    "population": { "total": 79, "excludedCount": 0, "filtered": false },
    "kpi": {
      "total": 79, "zabbixCount": 78, "customCount": 1,
      "monitored": 75, "unmonitored": 4, "coveragePct": 94.9,
      "unclassified": 62, "ownerMissing": 11,
      "lifecycleReview": 25, "planned": 9, "retired": 8, "expired": 8,
      "completenessAvgPct": 42.3, "completeCount": 0,
      "lastSyncedAt": "2026-08-24T14:00:00.690Z", "staleSync": true
    },
    "composition": {
      "byDeviceType": [
        { "code": "server",        "name": "서버",         "colorPreset": "blue",     "active": true, "count": 16 },
        { "code": "network",       "name": "네트워크",     "colorPreset": "geekblue", "active": true, "count": 1 },
        { "code": "security",      "name": "보안",         "colorPreset": "volcano",  "active": true, "count": 0 },
        { "code": "database",      "name": "데이터베이스", "colorPreset": "purple",   "active": true, "count": 0 },
        { "code": "hardware",      "name": "하드웨어",     "colorPreset": "gold",     "active": true, "count": 0 },
        { "code": "notClassified", "name": "분류되지 않음","colorPreset": "default",  "active": true, "count": 62 }
      ],
      "bySourceCoverage": { "zabbixMonitored": 75, "zabbixUnmonitored": 3, "customLinked": 0, "customUnlinked": 1 },
      "byHostGroup": [
        { "name": "Linux servers", "count": 41 },
        { "name": "Discovered hosts", "count": 34 },
        { "name": "DB", "count": 7 },
        { "name": "Windows servers", "count": 6 }
      ],
      "otherGroupCount": 13,
      "byOsFamily": [
        { "name": "windows", "count": 1 },
        { "name": "linux", "count": 34 },
        { "name": "unix", "count": 0 },
        { "name": "network_os", "count": 0 },
        { "name": "hypervisor", "count": 0 },
        { "name": "other", "count": 0 },
        { "name": "unknown", "count": 44 }
      ],
      "osUnmatchedSamples": [],
      "byOwner": [
        { "name": "DBA팀", "count": 14 },
        { "name": "네트워크팀", "count": 14 },
        { "name": "보안팀", "count": 14 },
        { "name": "인프라운영팀", "count": 13 },
        { "name": "총무팀", "count": 13 },
        { "name": null, "count": 11 }
      ],
      "otherOwnerCount": 0
    },
    "lifecycle": {
      "byStatus": { "active": 54, "planned": 9, "retired": 8, "expired": 8, "other": 0 },
      "byAcquisitionYear": [
        { "year": 2018, "count": 3,  "beyondUsefulLife": 3 },
        { "year": 2019, "count": 10, "beyondUsefulLife": 5 },
        { "year": 2020, "count": 7,  "beyondUsefulLife": 6 },
        { "year": 2021, "count": 5,  "beyondUsefulLife": 3 },
        { "year": 2022, "count": 13, "beyondUsefulLife": 5 },
        { "year": 2023, "count": 8,  "beyondUsefulLife": 0 },
        { "year": 2024, "count": 15, "beyondUsefulLife": 0 },
        { "year": 2025, "count": 5,  "beyondUsefulLife": 0 },
        { "year": 2026, "count": 2,  "beyondUsefulLife": 0 }
      ],
      "acquisitionUnknownCount": 11,
      "beyondUsefulLifeCount": 22,
      "expiry": { "expired": 12, "within30": 7, "within60": 8, "within90": 0, "beyond90": 28, "unknown": 24 }
    },
    "quality": {
      "completeness": [
        { "field": "location",        "filled": 0,  "total": 79, "pct": 0.0 },
        { "field": "vendorModel",     "filled": 1,  "total": 79, "pct": 1.3 },
        { "field": "serial",          "filled": 3,  "total": 79, "pct": 3.8 },
        { "field": "deviceType",      "filled": 17, "total": 79, "pct": 21.5 },
        { "field": "geo",             "filled": 19, "total": 79, "pct": 24.1 },
        { "field": "os",              "filled": 35, "total": 79, "pct": 44.3 },
        { "field": "expiryDate",      "filled": 55, "total": 79, "pct": 69.6 },
        { "field": "owner",           "filled": 68, "total": 79, "pct": 86.1 },
        { "field": "acquisitionDate", "filled": 68, "total": 79, "pct": 86.1 },
        { "field": "purchaseCost",    "filled": 68, "total": 79, "pct": 86.1 }
      ],
      "workQueue": [
        {
          "assetId": 87, "name": "10.220.0.20", "source": "zabbix",
          "deviceType": "notClassified", "owner": null, "coverage": "monitored",
          "reasonTags": ["unclassified", "classification_tag_mismatch", "owner_missing", "cost_missing"],
          "linkedHostid": "10642"
        },
        {
          "assetId": 94, "name": "10.220.0.29", "source": "zabbix",
          "deviceType": "notClassified", "owner": "보안팀", "coverage": "monitored",
          "reasonTags": ["unclassified", "classification_tag_mismatch", "inventory_sparse", "cost_missing"],
          "linkedHostid": "10649"
        }
      ],
      "workQueueTotal": 76,
      "tagCounts": {
        "unclassified": 62, "classification_tag_mismatch": 29, "owner_missing": 11,
        "host_unlinked": 1, "host_disabled": 3, "inventory_disabled": 33,
        "inventory_sparse": 33, "cost_missing": 11, "expired": 12
      }
    },
    "live": {
      "asOf": "2026-08-26T02:52:20.852Z",
      "statusCounts": { "healthy": 6, "degraded": 5, "unavailable": 47, "unknown": 17 },
      "topProblemAssets": [
        { "assetId": 133, "name": "Atlassian Cloud Site Check", "deviceType": "notClassified",
          "owner": null, "status": "Unavailable", "activeProblemCount": 592, "maxSeverity": "5",
          "linkedHostid": "10666" },
        { "assetId": 123, "name": "Proxmox node 10.220.0.12", "deviceType": "notClassified",
          "owner": "DBA팀", "status": "Unknown", "activeProblemCount": 98, "maxSeverity": "3",
          "linkedHostid": "10679" },
        { "assetId": 121, "name": "Proxmox node 10.220.0.14", "deviceType": "notClassified",
          "owner": "총무팀", "status": "Unknown", "activeProblemCount": 48, "maxSeverity": "3",
          "linkedHostid": "10678" }
      ]
    },
    "activity": {
      "daily": [
        { "date": "2026-07-28", "created": 40, "updated": 0, "excluded": 0, "restored": 0, "synced": 0 },
        { "date": "2026-07-29", "created": 35, "updated": 1, "excluded": 0, "restored": 0, "synced": 0 },
        { "date": "2026-08-25", "created": 0,  "updated": 0, "excluded": 0, "restored": 0, "synced": 0 },
        { "date": "2026-08-26", "created": 0,  "updated": 0, "excluded": 0, "restored": 0, "synced": 0 }
      ],
      "recent": [
        { "id": 334, "assetId": 87, "assetName": "10.220.0.20", "action": "restored",
          "actorType": "user", "actorName": "admin", "changedFields": [],
          "createdAt": "2026-08-19T16:48:26.215Z" },
        { "id": 333, "assetId": 87, "assetName": "10.220.0.20", "action": "excluded",
          "actorType": "user", "actorName": "admin", "changedFields": [],
          "createdAt": "2026-08-19T16:48:25.882Z" }
      ]
    },
    "filterOptions": {
      "owners": ["DBA팀", "네트워크팀", "보안팀", "인프라운영팀", "총무팀"],
      "hostGroups": ["Appliances", "Applications", "Atlassian", "CentOS 8 servers", "DB"]
    }
  },
  "syncTime": null
}
```

### 필터 적용 예 — `?deviceType=server&coverage=monitored`

```json
{
  "population": { "total": 14, "excludedCount": 0, "filtered": true },
  "kpi": { "total": 14, "…": "…" },
  "live": { "statusCounts": { "healthy": 0, "degraded": 2, "unavailable": 10, "unknown": 2 } },
  "filterOptions": { "owners": ["DBA팀", "네트워크팀", "보안팀", "인프라운영팀", "총무팀"] }
}
```

> 🔴 필터를 걸어 모집단이 14건이 돼도 `filterOptions.owners`는 **5개 그대로**다(§3 규칙).

### 실측이 알려준 것

- `classification_tag_mismatch` **29건** — 설계가 가정한 "`device-type` 오타 태그가 미분류 62건의 주원인"이
  실제 데이터에서 확인됐다. 이 태그 하나만 고치면 미분류가 절반 가까이 줄어든다.
- `inventory_disabled` 33 + `inventory_sparse` 33 = **66/79**가 인벤토리 공백 상태다. 두 태그는 겹치지 않는다.
- `osUnmatchedSamples`가 **빈 배열**이다 — dev의 os 값 35건이 §5.3 규칙에 전부 매칭됐다(규칙 보강 불필요).
- `completeCount = 0` — 10항목을 다 채운 자산이 **한 대도 없다**. 이 화면이 필요한 이유가 그대로 숫자로 나온다.

---

## 6. 설계(§6 초안) 대비 바뀐 점

| # | 초안 | 확정 | 사유 |
|---|---|---|---|
| 1 | `byOsFamily[].family` = 한글 라벨("네트워크OS") | `byOsFamily[].name` = **코드**(`network_os` 등) | BE가 한글을 내리면 en 로케일이 한글을 표시한다. 라벨은 FE i18n의 몫. 필드명도 `byOwner`·`byHostGroup`과 같은 `NamedCount`(`name`/`count`)로 통일 |
| 2 | `expiry.within60`이 within30을 포함(비용 화면 방식) | **배타적 구간** | 6조각 분포 막대라 누적이면 합이 자산 수를 넘는다(§3) |
| 3 | `lifecycle.byStatus`는 4값 | `other` **추가**(5값) | 4값 외의 `lifecycle_status`(또는 null)가 생기면 `planned+retired+expired`가 `lifecycleReview`와 어긋난다. 실측은 0 |
| 4 | `generatedAt: string`(ISO, 기준 미명시) | **진짜 UTC**로 확정 | 비용 화면 `basisDate`가 로컬 벽시계를 UTC로 오인해 +9h로 표기됐던 결함의 재발 방지(§4) |
| 5 | `workQueue[].coverage: 'monitored'\|'unmonitored'` | `null` 가능 | 파생 이전 데이터는 coverage가 비어 있을 수 있다 |
| 6 | `host_unlinked` = `source=custom` and 미연결 | `linked_hostid` 부재만 | 비용 화면과 판정을 공유하기 위해(§3 공유 표) |
| 7 | 쿼리를 `SearchAssetListDto`로 받음 | 전용 `SearchAssetDashboardDto`(6필드) | 이름은 목록과 동일하게 유지하되, 의미 없는 `sortBy`·`limit`이 Swagger에 뜨지 않게 |
| 8 | (없음) | `byDeviceType`에 **마스터에서 삭제된 code**가 `active:false`로 남음 | notClassified로 접으면 "왜 미분류가 늘었지"의 원인이 사라진다 |
| 9 | `byDeviceType[].color` | **`colorPreset`** (v1.1, F-1) | 값이 hex가 아니라 AntD preset 이름인데 이름이 `color`라 FE가 ECharts에 그대로 넘겨 **일부 막대만 칠해지는** 결함이 났다. 미커밋 시점이라 지금 바꾸는 게 가장 싸다 |
| 10 | (없음) | `GET /assets`에 **`qualityTag` 필터 신설** (v1.1, F-2·F-3) | 작업 큐 태그를 눌러도 목록 전체로만 가서 "인벤토리 비어 있는 33대"를 골라낼 길이 없었다. 판정기를 공유해 건수가 자동으로 일치한다 |

---

## 7. 구현 파일

```
src/main/java/com/dmove/moveseye/asset/
├── AssetController.java              (+ GET /assets/dashboard, 목록 설명에 qualityTag)
├── AssetDerivation.java              (class·COVERAGE_* → public : 집계가 같은 어휘를 쓰게)
├── AssetService.java                 (상태 4값 파생 이관 + 목록 qualityTag → id 집합 필터)
├── dashboard/
│   ├── AssetDashboardService.java    모집단 로드 → 판정 → 집계 → 활동 → live(부분 성공)
│   ├── AssetDashboardAggregator.java 순수 집계(§4·§5)
│   ├── AssetLiveStatusResolver.java  벌크 2회 + Redis 60초 캐시(사용자 스코프)
│   └── OsFamilyNormalizer.java       §5.3 규칙 상수
├── quality/
│   ├── AssetQualityPolicy.java       🔴 완성도 10항목 + 태그 9종(비용 화면과 공유)
│   ├── AssetQualityEvaluator.java    🔴 판정 실행기 — **대시보드와 목록 필터의 유일한 진입점**
│   └── AssetQualityEvaluation.java   해석 완료된 판정 1건(취득일·만료일·태그)
├── dto/AssetDashboardResDto.java
├── dto/SearchAssetDashboardDto.java
├── dto/SearchAssetListDto.java       (+ qualityTag + 미지 태그 400 검증)
└── repository/
    ├── AssetActivityRepository.java  (+ 일별 집계·최근 10건 쿼리 4개)
    └── AssetRepository.java          (+ search에 applyIdFilter/ids 술어)

engine-api/.../common/exception/ErrorCode.java  (+ ASSET_INVALID_QUALITY_TAG)
src/main/java/com/dmove/moveseye/common/live/HostLiveAggregator.java  (+ statusOf, STATUS_* 상수)
src/main/java/com/dmove/moveseye/cost/CostService.java                (판정 3종을 AssetQualityPolicy로 위임)
```

> 🔴 `AssetQualityEvaluator`가 **대시보드와 목록 필터의 공통 진입점**이다. 목록 쪽에 "SQL로 하면 빠른데"라는
> 최적화를 넣는 순간 두 화면의 건수가 갈린다 — `AssetQualityTagFilterTest`가 9종 전부에 대해 그걸 잡는다.

**마이그레이션 없음**(Flyway 변경 0). 신규 테이블·컬럼 없이 기존 `asset`·`asset_activity`·
`device_classification`·`depreciation_rate`만 읽는다.

---

## 🔄 FE 요청사항

> COLLAB.md §3 규약. BE 담당자는 작업 시작 시 이 섹션을 먼저 확인한다.
> (FE 연동 중 발견한 계약 불편·누락 필드·판정 이견을 여기에 적는다.)

> 2026-08-26 FE(`C:\worktrees\zm-116-fe`, ZM-116) 연동·대조 완료 시점에 기록.
> **BE 코드는 손대지 않았다.** 아래는 전부 "다음 단계에 고려해달라"는 요청이며, M1은 현 계약대로 동작한다.

### F-1. `byDeviceType[].color` 필드명 — `colorPreset` 제안 (경미, 다음 계약 개정 시)

`color`가 hex가 아니라 **AntD Tag preset 이름**(`"blue"`·`"geekblue"`·`"default"`)이라는 사실이
§2 주석에만 있다. FE 초안 구현이 실제로 이걸 hex로 오해해 ECharts에 그대로 넘겼고, `"blue"`만
우연히 CSS 기본색으로 먹혀서 **일부 막대만 칠해지는** 더 찾기 어려운 형태가 됐다.
(FE는 `tagPresetChartColor()`로 변환하도록 고쳤다 — 이 요청 없이도 M1은 정상이다.)

- 제안: 필드명을 `colorPreset`으로 바꾸면 타입만 보고도 오해가 안 생긴다.
- 바꾸기 어렵다면 현행 유지해도 무방하다(FE 쪽에 주석·테스트로 잠가 뒀다).

> **→ 조치: 채택 (2026-08-26 v1.1).** `byDeviceType[].color` → **`colorPreset`**으로 rename하고 @Schema 설명에 "hex가 아니라 AntD Tag preset"과 이 결함 이력을 박아 넣었다(DTO·집계기·테스트·§2·§5 샘플 반영). 아직 미커밋이라 지금이 가장 싼 시점이었다 — **FE는 `color` → `colorPreset`으로 필드명을 바꿔야 한다.**
> **↳ FE 반영 완료 (2026-08-26, `C:\worktrees\zm-116-fe`).** `TAssetDashboardDeviceType.color` → `colorPreset`(타입·렌더·§5 픽스처·테스트). 픽스처는 11:52 재실측 샘플로 교체했고 `: TAssetDashboard` 주석을 유지해 **BE 실제 payload가 FE 타입에 들어가는지 tsc가 강제**한다. 값은 여전히 `tagPresetChartColor()`로 hex 변환 후 ECharts에 넘긴다.

### F-2. 🔴 작업 큐 태그 2종에 목록 필터가 없다 — `inventory_disabled`·`inventory_sparse`

실측에서 이 둘이 **66/79건**(§5)으로 작업 큐에서 가장 많이 눌릴 태그인데,
`GET /assets`에 대응 필터가 없어 **태그를 눌러도 자산 목록 전체로만 간다**.
관리자가 "인벤토리 비어 있는 33대"를 골라낼 방법이 화면에 없다.

- 요청: 목록에 `inventoryState=disabled|sparse` 같은 축, 또는 범용 `qualityTag=<태그명>` 필터.
- 후자면 태그 9종 전부가 한 번에 해결되고, 대시보드 작업 큐와 목록이 **같은 판정 함수**
  (`AssetQualityPolicy`)를 공유하므로 건수도 자동으로 일치한다.
- M1에서는 안내 툴팁만 띄우고 있다(설계 §10 M2 범위와 동일).

> **→ 조치: 채택 — 범용 `qualityTag` 신설 (2026-08-26 v1.1).** `GET /assets?qualityTag=<태그>`로 **9종 전부**를 거를 수 있다(단일 값, 다른 필터와 AND, 페이지네이션·`total` 정상). 계약은 §1의 "짝 엔드포인트" 절 참조.
> **↳ FE 반영 완료 (2026-08-26).** ① 작업 큐 태그 **9종 전부** `?qualityTag=<태그>`로 딥링크(현재 필터 동반·`savedView` 충돌 축 제거 규칙 유지). ② 완성도 막대 10줄도 이 축으로: 분류→`unclassified` · 소유자→`owner_missing` · 인벤토리 5항목(위치·시리얼·벤더/모델·OS·좌표)→`inventory_sparse` · 비용 3항목→`cost_missing`(실제 편집 위치는 툴팁이 안내). ③ `AssetListPage`가 `qualityTag`를 URL에서 읽어 API로 넘기고 셀렉트 9종으로 표시·해제 가능(라벨은 대시보드와 **같은 i18n 키** 재사용). ④ `QueryParamKeys.QUALITY_TAG`·`TAssetListParams.qualityTag`·`ASSET_ERROR_CODE.INVALID_QUALITY_TAG` 추가. ⑤ "갈 곳 없음" 주석/툴팁 제거.
> 🔴 **SQL 술어로 만들지 않았다** — `expired`·`cost_missing`은 `CostParamResolver` 폴백 체인이라 SQL로 옮기면 대시보드와 갈린다. 대시보드와 **같은 판정기**(`AssetQualityEvaluator`)로 id 집합을 만들어 `id IN (...)`으로 거른다. 실측으로 9종 전부 `total` = `tagCounts` 일치를 확인했고, `AssetQualityTagFilterTest`가 이 등식을 회귀로 잠갔다.
> ⚠️ 대가: 목록 EP가 설계 §8.3/Q8의 **메모리 집계 상한(자산 1만 건)** 전제를 물려받았다. 미지 태그명은 거부한다 — 🔴 **HTTP 200 + 바디 `code:400`·`errorCode:ASSET_INVALID_QUALITY_TAG`**(HTTP 상태 400이 아니다. 이 레포 관례대로 200+바디 code이며, 런타임 QA F-1로 확인해 2026-08-26 계약 문구를 실측에 맞춰 정정했다).

### F-3. 🔴 `expired` 태그(12)와 `savedView=hardware_eol`(8)이 다른 집합이다

- `expired` 태그 = `expiryDate < today` (실측 **12**)
- `savedView=hardware_eol` = `lifecycle_status = 'expired'` (`AssetRepository.java:118` — 실측 **8**)

이름이 같아서 딥링크로 이으면 **12를 눌렀는데 8이 나온다**. FE는 일단 `expired` 태그를
비용 대시보드(같은 만료 계산기)로 보내도록 우회했지만, 자산 목록에서 만료 경과분을 보는 길은 없다.

- 요청: 목록에 `expiryWindow=expired|within30|…` 축을 추가해달라(설계 §10 M2에 이미 있음).
  추가되면 만료 차트 6구간 전체가 클릭 가능해진다.
- 함께 검토: `savedView=hardware_eol`이라는 이름이 "HW 수명 종료"로 읽히는데 실제로는
  사용자가 손으로 지정한 `lifecycle_status`만 본다. 오해 소지가 있다.

> **→ 조치: F-2로 자연 해결 (2026-08-26 v1.1).** `?qualityTag=expired`가 **만료 경과 12건에 정확히 착지**한다(실측: `qualityTag=expired` → 12 · `savedView=hardware_eol` → 8 · `lifecycle=expired` → 8). 만료 차트의 **경과 구간**은 이 링크를 쓰면 된다.
> **↳ FE 반영 완료 (2026-08-26).** `expired` 태그의 비용 대시보드 우회를 걷어내고 `?qualityTag=expired`로 교체했다. 만료 차트의 **"이미 경과" 구간**도 같은 링크를 쓴다(나머지 5구간은 목록 축이 없어 비용 화면 유지). 12 ≠ 8을 테스트로 못 박아 회귀를 막았다.
> ⚠️ 나머지 5구간(`within30`·`within60`·`within90`·`beyond90`·`unknown`)은 여전히 목록 축이 없다 — `expiryWindow`는 설계 §10 **M2** 그대로 남긴다(이번 범위에서 6구간 전체를 열면 목록 필터 축이 하나 더 늘어난다).
> ℹ️ `savedView=hardware_eol` 네이밍 오해는 **동의한다.** 다만 이름을 바꾸면 기존 딥링크·저장된 뷰가 깨지므로 여기서 손대지 않고, `qualityTag=expired`라는 **정확한 축이 생겼다는 사실**로 대체한다. FE는 "만료" 문구를 쓰는 자리에서 `hardware_eol` 대신 `qualityTag=expired`를 쓰기를 권한다.

### F-4. KPI `lifecycleReview`(25)를 재현하는 목록 필터가 없다

`lifecycleReview = planned + retired + expired + other`인데 목록의 `lifecycle` 필터는
**단일 값**이라 "active가 아닌 것"을 고를 수 없다. FE는 이 타일을 목록으로 보내지 않고
B 섹션(상태별 막대)으로 스크롤시켰다 — 거기서는 축이 정확하다.

- 요청(선택): `lifecycle`을 콤마 다중값으로 받거나 `lifecycleReview=true` 프리셋 추가.

> **→ 조치: 미채택 (2026-08-26 v1.1).** FE가 이미 택한 우회(타일 → B 섹션 상태별 막대로 스크롤)가 **더 나은 동작**이라고 판단했다 — `lifecycleReview`는 4개 상태의 합이라 목록으로 보내면 "왜 25건인가"가 사라지지만, 막대에서는 planned 9 / retired 8 / expired 8이 보이고 각 조각이 이미 클릭 가능하다. 필터 축을 늘리는 대신 **하나 덜 늘리는 쪽**을 골랐다.
> **↳ FE 유지 (2026-08-26).** 현 동작(타일 → B 섹션 앵커 스크롤) 그대로 두었다. 코드에 "왜 목록으로 안 보내는가"(25 vs 8)를 주석으로 남겨 다음 사람이 되돌리지 않게 했다.
> 재검토 조건: `lifecycle_status`에 4값 외 값이 생겨 `byStatus.other`가 0이 아니게 되면 막대만으로 25를 재현할 수 없게 된다. 그때 `lifecycle` 다중값을 넣는다.

### F-5. OS 계열 코드 집합이 BE·FE 두 곳에 있다

BE `OsFamilyNormalizer` ↔ FE `ASSET_OS_FAMILY_ORDER` + i18n 키
(`assetDashboard.os_family.<code>`, kr/en 2벌). 계약 §6-1 결정(라벨은 FE 몫)에 따른 필연적 이중화다.

- 요청: **계열 코드를 추가·변경·삭제할 때 FE에 알려달라.** 모르면 새 계열이 화면에
  코드 문자열 그대로 노출된다(FE는 `defaultValue` 폴백으로 깨지지는 않는다).
- `activity.recent[].action`도 동일(계약이 `string`으로 열어 둔 값) — 새 action 추가 시 같은 상황.

> **→ 조치: 접수 — 계약서 개정 의무로 명문화 (2026-08-26 v1.1).** 아래 세 집합은 **BE가 바꾸면 이 계약서를 같은 커밋에서 개정하고 FE에 알린다**. 구두 약속이 아니라 문서에 박아 둔다:
> **↳ FE 확인 (2026-08-26).** 세 집합의 FE 사본 위치를 명시해 둔다 — OS 계열 `ASSET_OS_FAMILY_ORDER`(+ `assetDashboard.os_family.*` kr/en) · 품질 태그 `ASSET_QUALITY_TAG_ORDER`(+ `quality_tag.*`·`quality_tag_hint.*`, **이제 `qualityTag` 허용 값 집합이기도 하다**) · 완성도 항목 `ASSET_QUALITY_FIELD_LABEL_KEY`. 태그 코드가 바뀌면 FE 딥링크가 400을 받는다.
>
> | 집합 | 정본(BE) | FE 대응 |
> |---|---|---|
> | OS 계열 코드 | `OsFamilyNormalizer.FAMILIES` | `ASSET_OS_FAMILY_ORDER` + `assetDashboard.os_family.<code>` (kr/en) |
> | 품질 사유 태그 | `AssetQualityPolicy.TAGS` | 태그 라벨 i18n + `qualityTag` 딥링크 |
> | 활동 action | `AssetActivity.ACTION_*` | 활동 피드 라벨 |
>
> 태그 집합은 이제 **`GET /assets?qualityTag=`의 허용 값이기도 하다** — 코드를 지우면 FE 딥링크가 400을 받는다(조용히 전체 목록으로 착지하지 않는다는 점에서 안전한 실패지만, 그래서 더더욱 알려야 한다).

### F-6. 확인 완료 — 요청 아님

대조 중 검증했고 **문제 없었던** 항목을 남겨 둔다(다음 사람이 다시 의심하지 않도록):

| 항목 | 확인 |
|---|---|
| `live.statusCounts` 합 = `kpi.monitored` | 6+5+47+17 = 75 = monitored ✅ |
| `expiry` 6구간 합 = `population.total` | 12+7+8+0+28+24 = 79 ✅ (배타적, §6-2대로) |
| `tagCounts` 9키 존재 | 9/9 ✅ (0값 키 없음 — 전부 양수였다) |
| `completeness` pct 오름차순 | ✅ (FE도 한 번 더 정렬해 이중 안전) |
| `filterOptions`가 필터 후에도 5개 유지 | §5 필터 예시로 확인 ✅ |
| 쿼리 6필드 이름이 목록과 동일 | ✅ 딥링크 왕복 성립 |
| `classification_tag_mismatch`(29) → `deviceType=notClassified`(62) | 부분집합 착지 — 설계 §5.6이 명시적으로 허용한 동작(툴팁으로 안내). 요청 아님. **v1.1부터는 `?qualityTag=classification_tag_mismatch`로 정확히 29건에 착지할 수 있다**(F-2) |
