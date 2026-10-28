# GPU 모니터링 P1 API 계약

작성: Codex · 2026-09-17(초안) → **Claude(be-engineer) · 2026-10-08 S2 구현 반영** → 2026-10-12 2차(§12 위젯 대시보드·§13 수집 방식 현황·§3 행 필드 추가) · 상태: **IMPLEMENTED / 런타임 미검증**

정본 동작: [P1 상세 설계](solutions--devdesign_gpu-monitoring-p1.md) · [수집 경로 설계](solutions--devdesign_gpu-collection-paths.md) §6·§11·§15. 구현: 워크트리 `C:\worktrees\zm-78-be`(브랜치 ZM-78, 미커밋) `premium/gpu/`. 구현 기록: [impl_gpu-s2-api.md](solutions--impl_gpu-s2-api.md).

> **VERIFIED 전환 조건(§10)**: 실제 HTTP 응답(dev BE)·FE 소비·OpenAPI 대조. 지금은 단위 52건 + IT 11건(MockMvc + 실 DB, 엔진 포트는 대역)만 통과했다 — dev Zabbix에 프리셋 템플릿이 없어 실데이터 응답은 아직 본 적이 없다.

## 1. 공통

- 인증: 기존 로그인 쿠키/Bearer + `x-visitor-id`. 판정 순서 **인증(401) → 라이선스 기능 `GPU_MONITORING`(`@RequiresFeature`) → 역할 권한 `monitoring/gpuMonitoring.view` → 허용 호스트 교집합**.
- 권한 FE 키: 평탄화 `permissions.gpuMonitoring.view`(역할 JSON `{"module":"monitoring","features":[{"name":"gpuMonitoring",…}]}`). 기본값은 serverMonitoring과 같다(view=true, edit=관리자, delete=false, download=true). 저장된 역할에는 Flyway **V72**가 **그 역할의 serverMonitoring.view/download 값을 따라** 넣는다(edit·delete=false).
- 허용 호스트 = 호출자 자격으로 `InventoryPort.listHosts`가 돌려준 호스트(= 그 사용자의 Zabbix 권한). 관리자는 전체.
- sourceId는 P1 `zabbix-default`만. 생략 시 이 값, 다른 값은 `GPU_SOURCE_UNSUPPORTED`. 식별자 sourceId/hostId/gpuUuid는 string. 🔴 UUID 대소문자를 바꾸지 않는다(소스 표기 그대로 비교).
- 시각은 **epoch milliseconds**. `from` 포함, `to` 배타. 엔진의 초 단위는 BE가 한 번 변환한다.
- 성공: HTTP 200 + `ApiResult`(`status:"success", code:200, data:payload`). FE 훅은 payload 소비(언랩 2겹 — 기존 규칙).
- DTO 안의 null은 **키가 존재하고 값이 null**이다(생략하지 않는다). metric map은 16종 키가 항상 전부 있다.
- 숫자 파라미터(page·pageSize·from·to)도 문자열로 받아 BE가 해석한다 — 형식 오류도 `GPU_BAD_QUERY`로 나온다(Spring 기본 오류로 새지 않는다).

## 2. 요청

| API | 파라미터 | 동작 |
|---|---|---|
| `GET /gpu/devices` | sourceId, hostGroupId, hostId, q, model, dataStatus, page, pageSize, sortBy, sortOrder, snapshotId | 목록 + 같은 스냅샷의 matched 전체 집계 |
| `GET /gpu/devices/detail` | sourceId, **hostId**, **gpuUuid** | 메타·현재값·커버리지 |
| `GET /gpu/devices/series` | sourceId, **hostId**, **gpuUuid**, **from**, **to**, **metrics**, resolution | 단일 GPU 최대 8 지표 |
| `GET /gpu/hosts/diagnostics` | sourceId, **hostId** | 호스트 수집 진단 |

(굵게 = 필수. 빠지면 `GPU_BAD_QUERY`.)

**목록 파라미터**
- q: hostName·label·UUID 부분 일치(대소문자 무시), 최대 100자. model: 정확 일치(대소문자 구분).
- dataStatus: `CURRENT|PARTIAL|STALE|UNAVAILABLE`.
- page 기본 1(≥1), pageSize 기본 25(1~100).
- sortBy: `hostName`(기본)·`model`·`utilization`·`vramUsedPct`·`temperature`·`powerDraw`·`lastSeenAt`. sortOrder `asc`(기본)|`desc`. **null은 방향과 무관하게 뒤**, 동률은 hostId → gpuUuid **오름차순 고정**(내림차순에서도 뒤집지 않는다). 숫자 정렬은 값이 있으면(OK·STALE) 그 값을 쓴다 — 화면 숫자와 순서가 어긋나지 않게.
- 문자열 ID 상한 256자, 제어 문자 거부.
- 호스트 범위(권한·hostGroupId·hostId 적용 후) **200개 초과** 또는 범위 GPU(REMOVED 제외) **2000개 초과** → `GPU_SCOPE_TOO_LARGE`(잘라 주지 않는다).
- 권한 밖·없는 hostId → `GPU_NOT_FOUND`(존재 노출 없음). hostGroupId는 보이는 호스트가 없으면 빈 목록이다(오류 아님).

**snapshotId**
- 첫 요청은 생략 → 응답에 새 id. 다음 page 요청에 그대로 넘긴다. **60초** 유효.
- 사용자(principal·역할)·소스·**허용 호스트 집합 해시**에 바인딩된다. q·model·dataStatus·sort는 같은 스냅샷 안에서 재계산하므로 바꿔도 같은 id를 쓸 수 있지만 FE는 page=1로 돌린다.
- 만료·다른 사용자·권한 범위 변화·형식 오류(UUID 아님) → `GPU_SNAPSHOT_EXPIRED` → FE는 snapshotId 없이 page=1 재조회.
- page 범위 초과는 빈 rows + 정확한 total. FE가 마지막 유효 page로 이동.
- 30초 자동 갱신은 snapshotId 없이 page 1(새 스냅샷). 같은 사용자·범위의 30초 안 재요청은 캐시라 소스를 다시 부르지 않는다(같은 id가 돌아올 수 있다).

**시계열 파라미터**
- metrics: 쉼표 구분, 점 표기 캐노니컬 이름. 중복 제거 후 최대 8개. 허용: `utilization, memory.activity, vram.used, vram.total, vram.free, temperature, power.draw, power.limit, clock.sm, clock.memory, pcie.rx, pcie.tx`. 🔴 `vram.usedPct`·`performance.state`·`ecc.*`는 `GPU_BAD_QUERY`.
- resolution: `AUTO`(기본)·`RAW`·`HOURLY_TREND`.
- 검증(보정하지 않음 → `GPU_BAD_QUERY`): `to ≤ from` · `to > 서버시각+60초` · `min(to, 서버시각) ≤ from` · 기간 30일 초과 · 명시 RAW 24시간 초과 · from/to가 정수 아님·음수.
- effectiveTo = min(to, 서버시각). effectiveFrom = from.

## 3. 공용 타입 (payload)

```ts
type GpuId = { sourceId: string; hostId: string; gpuUuid: string };
type ValueStatus = 'OK'|'STALE'|'DISABLED'|'UNSUPPORTED'|'NO_DATA'|'ERROR';
type GpuValue = {
  value: number|null;        // OK·STALE에서만 non-null
  textValue: string|null;    // P-state만('P8'). OK·STALE에서만
  unit: string;              // % · B · Cel · W · MHz · B/s · count · enum
  observedAt: number|null;   // 소스 수신 시각(ms)
  status: ValueStatus;
  reasonCode: string|null;   // OK면 null. 엔진 사유 코드(§3.1) 또는 'SNAPSHOT_STALE_CACHE'
  expectedHeartbeatSeconds: number|null;
};
type CollectionProfile = 'NVML_PLUGIN'|'MOVESEYE_DCGM_HTTP_V1'|'MOVESEYE_NVIDIA_SMI_V1'|'UNKNOWN';
type CapabilityTier = 'CORE_TELEMETRY'|'EXTENDED_DCGM';
type GpuRow = GpuId & {
  hostName: string;
  label: string;                 // 모델명, 없으면 UUID
  model: string|null;
  physicalKind: 'PHYSICAL'|'UNKNOWN';
  discoveryState: 'PRESENT'|'REMOVED'|'UNKNOWN';
  collectionProfile: CollectionProfile;   // S2 추가
  capabilityTier: CapabilityTier;         // S2 추가 — dataStatus의 필수 지표 기준
  lastSeenAt: number|null;       // 관측 중 가장 최근 observedAt
  dataStatus: 'CURRENT'|'PARTIAL'|'STALE'|'UNAVAILABLE';
  health: 'ALERT'|'NO_ACTIVE_ALERT'|'UNKNOWN';   // P1은 항상 'UNKNOWN'
  activeGpuEventCount: number|null;              // P1은 항상 null
  hostEventsAvailable: boolean;                  // P1은 항상 true
  metrics: Record<string, GpuValue>;             // 16종 키 전부
  detectedProfiles: CollectionProfile[];         // 2차(10-12) 추가 — 호스트에서 감지된 프로필 전부, 우선순위 순(첫 원소 = collectionProfile). 수집 설정 없으면 []
  profileConflict: boolean;                      // 2차(10-12) 추가 — detectedProfiles 2개 이상. BE가 파생(저장값 아님)
};
type ObservationAggregate = { value: number|null; observedCount: number };
```

metrics 키(16): `utilization, memory.activity, vram.used, vram.total, vram.free, vram.usedPct, temperature, power.draw, power.limit, clock.sm, clock.memory, performance.state, pcie.rx, pcie.tx, ecc.corrected, ecc.uncorrected`. `vram.usedPct`는 엔진 파생값(현재값만).

**dataStatus — 수집 등급별 필수 지표**(설계 §11.2 2번, 초안의 "required 5종 고정"을 대체):

| capabilityTier | 언제 | 필수 지표 |
|---|---|---|
| `CORE_TELEMETRY` | NVML_PLUGIN · MOVESEYE_NVIDIA_SMI_V1 · UNKNOWN | utilization, vram.used, vram.total, temperature, power.draw |
| `EXTENDED_DCGM` | MOVESEYE_DCGM_HTTP_V1 | 위 5종 + memory.activity, clock.sm, clock.memory |

필수가 전부 OK → CURRENT · 하나라도 OK → PARTIAL(필수 지표가 미지원이어도 PARTIAL — 고장 아님) · OK 없고 값 있는 STALE → STALE · 나머지 UNAVAILABLE.

**health**: 알람 정본으로 GPU에 정확히 귀속할 수 없으면 `UNKNOWN`(설계 §11.2 1번). P1 알람 정본은 Zabbix지만 엔진 `AlertPort`의 `Alert`는 호스트·규칙만 싣고 트리거↔아이템(UUID) 관계가 없다. 이름 부분 일치 귀속은 금지 → **전 GPU `health='UNKNOWN'`, `activeGpuEventCount=null`, `hostEventsAvailable=true`**. FE는 이벤트 영역에 "호스트 이벤트 보기" 링크만 둔다.

### 3.1 사유·조치 코드(엔진 상수 — FE i18n 키)

- 관측 사유: `DEVICE_REMOVED · HOST_DISABLED · ITEM_DISABLED · MASTER_DISABLED · SOURCE_UNSUPPORTED · VALUE_NOT_AVAILABLE · METRIC_ABSENT · NOT_PROVIDED_BY_PROFILE · ITEM_ERROR · MASTER_ERROR · MASTER_STATE_UNKNOWN · AMBIGUOUS_ITEM · UNKNOWN_UNIT · INVALID_NUMBER · ITEM_MISSING · NOT_COLLECTED_YET · MASTER_NO_DATA · VALUE_STALE · MASTER_STALE · INTERVAL_UNKNOWN · DERIVED_INPUT_UNAVAILABLE · DERIVED_TOTAL_INVALID · DERIVED_TIME_SKEW`
- 진단 사유: `MULTIPLE_PROFILES · PRESET_TAG_MISSING · UNKNOWN_PRESET · DISCOVERY_ITEM_MISSING · DISCOVERY_FAILED · DISCOVERY_INVALID · DEVICE_COUNT_MISMATCH · UNIDENTIFIED_DEVICE · DEVICE_MODEL_UNAVAILABLE · MIG_DETECTED_UNSUPPORTED`
- app 사유: `SNAPSHOT_STALE_CACHE`(강등값) · `RETENTION_UNKNOWN`(보존) · `NO_DATA`·`CURRENT_BUCKET_INCOMPLETE`(시계열 gap/state)
- 조치: `NONE · CHECK_ITEM_ERROR · ENABLE_COLLECTION · LINK_PRESET_TEMPLATE · REMOVE_DUPLICATE_COLLECTION · CHECK_DISCOVERY · CHECK_TEMPLATE_UNITS · WAIT_FOR_COLLECTION`
- 모르는 코드는 FE가 "기타 사유"로 보여 준다(코드는 늘어날 수 있다).

## 4. 목록 응답

```ts
type GpuListPayload = {
  sourceId: string; snapshotId: string;
  generatedAt: number;        // 이 스냅샷을 만든 시각
  cachedAt: number|null;      // STALE_CACHE면 원래 데이터를 읽은 시각, COMPLETE면 null
  completeness: 'COMPLETE'|'STALE_CACHE';
  sourceErrorCode: string|null;   // STALE_CACHE 원인: 엔진 ErrorKind 이름 또는 'PARTIAL_FAILURE'
  scope: { hostCount: number; gpuCount: number; matchedCount: number };
  collectionSummary: {
    configuredHostCount: number; noGpuHostCount: number;
    unconfiguredHostCount: number; unknownHostCount: number;   // unknown = 수집 오류 + 소스가 돌려주지 않은 호스트
  };
  page: number; pageSize: number; total: number; rows: GpuRow[];
  totals: {
    currentCount: number; partialCount: number; staleCount: number; unavailableCount: number;
    utilization: ObservationAggregate;   // OK 값 산술평균(%)
    vramUsedPct: ObservationAggregate;   // OK vram.usedPct를 가진 GPU의 Σused/Σtotal×100
    powerDraw: ObservationAggregate;     // OK 값 합(W), PHYSICAL만
    activeGpuEventCount: number|null;    // P1 항상 null
  };
};
```

- scope.hostCount = 권한·호스트 필터 후 호스트 수 · gpuCount = 그 범위 PRESENT/UNKNOWN 행 수 · matchedCount = total = q/model/dataStatus 적용 후.
- 기본 목록은 REMOVED 제외(상세·진단에서만 보인다).
- **REMOVED의 두 출처**: ① 엔진이 직접 증거로 준 것(LLD 잔존 아이템) ② **최근 성공 발견 기억**(검수 🟡2 반영) — 이전 **성공** 발견에서 PRESENT였던 GPU가 이번 성공 발견에 없으면 마지막으로 보인 때부터 최대 24시간 `discoveryState:'REMOVED'`, `lastSeenAt`=마지막 관측, 현재값 16종 전부 `{status:'NO_DATA', reasonCode:'DEVICE_REMOVED', value:null}`로 남긴다. 성공 = 호스트 `CONFIGURED`이고 발견 상태 UNKNOWN 장치가 없음, 또는 `NO_GPU`. 소스 실패·`COLLECTION_ERROR`·`NOT_CONFIGURED`·UNKNOWN 장치 호스트는 REMOVED로 바꾸지 않는다. 다시 발견되면 PRESENT. 이 기억은 Redis(24시간 TTL)라 **재시작·Redis 비움 시 소실될 수 있고 영구 이력이 아니다**. 상세는 REMOVED를 GPU_NOT_FOUND가 아니라 REMOVED 행으로 돌려주고, 시계열은 소스에 남은 history만 그린다.
- 숫자 집계는 **OK 값만**(STALE 제외). 값이 하나도 없으면 `value:null, observedCount:0`(0이 아니다).
- **STALE_CACHE**(설계 §10): 소스가 실패했고 같은 사용자·범위의 마지막 **완전** 스냅샷이 **2분 이내**면 그것을 **새 snapshotId**로 강등해 준다. 행의 OK 값은 값·관측 시각을 유지한 채 `status:'STALE', reasonCode:'SNAPSHOT_STALE_CACHE'`, dataStatus 재계산(CURRENT 불가), health UNKNOWN. totals 숫자 집계 `null/0`, currentCount 0. 강등 후 dataStatus 필터를 다시 적용한다. 일부 성공 묶음과 섞지 않는다. 대체할 스냅샷이 없으면 `GPU_SOURCE_UNAVAILABLE`.

## 5. 상세 응답

```ts
type GpuDetailPayload = {
  device: GpuRow;                       // 목록 행과 같은 타입. REMOVED도 열린다
  generatedAt: number; cachedAt: number|null;
  completeness: 'COMPLETE'|'STALE_CACHE'; sourceErrorCode: string|null;
  metadata: {
    driverVersion: string|null;
    nvmlVersion: string|null;           // P1 항상 null(엔진 미제공)
    serialNumber: string|null;          // 소스가 0·[N/A]면 null
    pciBusId: string|null;
    migMode: 'ENABLED'|'DISABLED'|'UNSUPPORTED'|'UNKNOWN';   // S2: UNSUPPORTED 추가(GeForce의 [N/A])
  };
  coverage: {
    capabilityTier: CapabilityTier;     // S2 추가
    requiredCount: number;              // 등급의 필수 지표 수
    okRequiredCount: number;
    unsupportedCount: number;           // 16종 중
    errorCount: number;                 // 16종 중
  };
  retention: { effectiveHistoryDays: number|null; effectiveTrendDays: number|null; reasonCode: string|null };
};
```

- **retention은 P1에서 항상 `{null, null, 'RETENTION_UNKNOWN'}`** — 엔진이 아이템 보존 설정을 주지 않는다(어댑터 요청). 화면은 "보존 기간 확인 불가"로 표시.
- 상세는 호스트 하나 범위의 스냅샷(목록과 다른 캐시 키)이다. 같은 호스트의 진단과 같은 스냅샷을 쓴다.

## 6. 시계열 응답

```ts
type GpuSeriesPayload = {
  id: GpuId; requestedFrom: number; requestedTo: number;
  effectiveFrom: number; effectiveTo: number; generatedAt: number;
  series: Array<{
    metric: string; unit: string;
    resolution: 'RAW'|'RAW_BUCKETED'|'HOURLY_TREND'; stepMs: number|null;   // RAW면 null, TREND면 3600000
    state: 'AVAILABLE'|'PARTIAL'|'NO_DATA'|'UNSUPPORTED'|'ERROR';
    reasonCode: string|null;
    invalidPointCount: number|null;      // S2: 품질 정보가 없으면 null(0 아님)
    availableFrom: number|null; availableTo: number|null;   // 데이터가 있는 첫/마지막 t
    effectiveHistoryDays: number|null; effectiveTrendDays: number|null;   // P1 항상 null
    points: Array<{ t: number; min: number|null; max: number|null; avg: number|null;
                    count: number|null; boundaryPartial: boolean }>;
    gaps: Array<{ from: number; to: number; reasonCode: string }>;   // 'NO_DATA' | 'CURRENT_BUCKET_INCOMPLETE'
  }>;
};
```

**해상도 선택**
- AUTO: 기간 ≤ 24h면 RAW, 넘으면 HOURLY_TREND. 단 기대 주기로 계산한 점 수가 지표당 10,000을 넘을 것으로 보이면 TREND로 내려간다.
- 명시 RAW: 24h 초과 → `GPU_BAD_QUERY`, 점 예산 초과 예상 → `GPU_QUERY_TOO_DENSE`.
- RAW 결과를 엔진이 끝까지 읽지 못했거나(`complete=false`) 지표 하나라도 10,000점 초과 → `GPU_QUERY_TOO_DENSE`(잘라 주지 않는다).
- RAW가 2,000점 초과 → `RAW_BUCKETED`: from 기준 정렬 버킷(폭 = ⌈기간/2000⌉을 초 단위로 올림), min/max/산술평균/count. 마지막 버킷이 effectiveTo에 걸치면 boundaryPartial=true.
- RAW: min=max=avg, count=1. 같은 초의 중복 점은 마지막 값 하나.
- HOURLY_TREND: 소스 min/max/avg, **count=null**.

**품질(state·invalidPointCount)**
- RAW: 엔진 품질 기준 — 단위 거부(`REJECTED`) → ERROR/`UNKNOWN_UNIT` · 아이템 없음 → NO_DATA/`ITEM_MISSING` · 무효 점을 버렸고 남은 점 있음 → PARTIAL/`INVALID_NUMBER` + 수 · 전부 무효 → ERROR · 점 0개 → NO_DATA/`NO_DATA` · 그 외 AVAILABLE. invalidPointCount는 엔진이 준 값(CLEAN이면 0).
- HOURLY_TREND: 🔴 엔진(`queryTrend`)이 품질을 주지 않는다 → `invalidPointCount=null`. 아이템 없음 → NO_DATA/`ITEM_MISSING`. 단위 거부와 데이터 없음은 구분되지 않는다(둘 다 NO_DATA — 어댑터 요청).
- `UNSUPPORTED` state는 P1 구현에서 나오지 않는다(엔진 시계열 품질에 그 구분이 없다). 미지원 여부는 상세·진단의 현재 상태로 본다.

**gap**
- RAW/RAW_BUCKETED: 기대 주기를 알 때만, 연속한 두 원시 점의 간격이 `max(90초, 주기×3)`를 넘으면 `{from: 앞 점 t, to: 뒤 점 t, 'NO_DATA'}`. 창의 앞뒤 끝은 gap으로 만들지 않는다.
- **TREND 경계**: 소스 조회는 from을 UTC 시간 시작으로 내린다. 요청 창과 겹치는 **완료된** 시간 버킷만 points에 들어간다. 경계에 걸친 버킷은 `boundaryPartial=true`(값은 그 시간 전체 집계, t가 effectiveFrom보다 이를 수 있다). 진행 중인 현재 시간은 점이 아니라 `{max(현재 시 시작, from), effectiveTo, 'CURRENT_BUCKET_INCOMPLETE'}` gap. 완료된 시간에 데이터가 없으면 **null 버킷**(min/max/avg null) + `NO_DATA` gap(연속 구간은 한 줄). 완료된 시간에 데이터가 하나도 없으면 points는 빈 배열 + `NO_DATA` gap 한 줄(+ 현재 시간 gap), state NO_DATA.
- 시계열은 스냅샷이 고른 수집 프로필의 키 계열만 본다(프로필 간 혼합 금지). 현재 비활성·오류인 아이템도 과거 이력은 그린다. REMOVED GPU도 이력 조회 가능.
- 소스 전체 실패 → `GPU_SOURCE_UNAVAILABLE`(envelope 오류).

## 7. 진단 응답

```ts
type GpuDiagnosticsPayload = {
  sourceId: string; hostId: string;
  checkedAt: number;                 // 스냅샷이 데이터를 읽은 시각(STALE_CACHE면 cachedAt)
  completeness: 'COMPLETE'|'STALE_CACHE';   // S2 추가
  collectionState: 'CONFIGURED'|'NO_GPU'|'NOT_CONFIGURED'|'COLLECTION_ERROR';
  collectionProfile: CollectionProfile;     // S2 추가 — 값을 읽은 프로필
  detectedProfiles: string[];               // S2 추가 — 감지된 프로필 전부(§6.4). 둘 이상이면 MULTIPLE_PROFILES
  reasonCodes: string[];                    // 호스트 단위 진단 사유(중복 제거)
  devices: Array<{
    gpuUuid: string|null; label: string|null;
    discoveryState: 'PRESENT'|'REMOVED'|'UNKNOWN';   // S2 추가
    issues: Array<{ metric: string|null; reasonCode: string; actionCode: string }>;
  }>;
  adminDetails: null|{                      // ADMIN·SUPER_ADMIN에게만, 그 외 null
    profileId: string;
    diagnostics: Array<{ reasonCode: string; actionCode: string; gpuUuid: string|null;
                         metric: string|null; detail: string|null }>;
  };
};
```

- issues = 엔진 장치 진단 + OK가 아닌 지표(사유가 있는 것). (지표, 사유)당 한 줄. REMOVED 장치는 `{metric:null, DEVICE_REMOVED, NONE}` 한 줄로 접는다.
- 조치 코드 매핑(엔진 진단이 조치를 주면 그것 우선): DISABLED→`ENABLE_COLLECTION` · UNSUPPORTED→`NONE` · ERROR: UNKNOWN_UNIT→`CHECK_TEMPLATE_UNITS`, AMBIGUOUS_ITEM→`REMOVE_DUPLICATE_COLLECTION`, 그 외 `CHECK_ITEM_ERROR` · NO_DATA: ITEM_MISSING→`LINK_PRESET_TEMPLATE`, 파생·REMOVED→`NONE`, 그 외 `WAIT_FOR_COLLECTION` · STALE: INTERVAL_UNKNOWN·SNAPSHOT_STALE_CACHE→`NONE`, 그 외 `CHECK_ITEM_ERROR`.
- ⚠️ 초안의 `adminDetails.items[]`(itemId·key·enabled·sourceState·sanitizedError)는 **P1에 없다** — 엔진 계약이 app에 Zabbix 아이템을 넘기지 않는다. 대신 엔진이 정제한 진단 설명(`detail`)을 준다. 소스 오류 원문·접속 정보는 어디에도 없다.
- 진단 EP는 설치·템플릿 가져오기를 하지 않는다. 범위가 비어도 권한 확인을 건너뛰지 않는다.

## 8. 오류 계약

transport는 기존 정책 그대로다. GPU 도메인 오류는 `ApiError` → `GlobalExceptionHandler.handleApiError` → **HTTP 200** + body `{status:"error", code, errorCode, message}`(+ 일부 `data`).

| errorCode | body code | 의미 | FE 행동 |
|---|---|---|---|
| `GPU_BAD_QUERY` | 400 | 기간·지표·정렬·필터·ID 형식 오류, 필수 누락, 명시 RAW 24h 초과 | 입력 안내 |
| `GPU_SOURCE_UNSUPPORTED` | 400 | zabbix-default 외 소스 | 기본 소스 안내 |
| `GPU_NOT_FOUND` | 404 | 없거나 접근 불가한 hostId/gpuUuid(구분 없음) | 찾을 수 없음 |
| `GPU_SCOPE_TOO_LARGE` | 400 | 호스트 200 / GPU 2000 초과 | 호스트 그룹·호스트로 좁히기 |
| `GPU_QUERY_TOO_DENSE` | 400 | RAW 점 예산 초과(사전 예상 또는 엔진 미완료) | 기간 축소/시간 집계 |
| `GPU_SNAPSHOT_EXPIRED` | 409 | 만료·다른 사용자/범위·형식 오류 snapshotId | snapshotId 없이 page 1 |
| `GPU_SOURCE_UNAVAILABLE` | 503 | 소스 실패 + 대체 스냅샷 없음. `data.sourceErrorCode`(엔진 ErrorKind 이름 또는 PARTIAL_FAILURE) | 오류 표시/다음 주기 재시도 |

- 권한 거부: HTTP 200 + body `code:403`, `errorCode:"FORBIDDEN"`, 메시지 "GPU 모니터링 화면을 볼 권한이 없습니다."
- 라이선스 기능 미보유: 기존 `LICENSE_FEATURE_REQUIRED`(body 402) 등 기존 라이선스 errorCode 그대로(GPU 오류로 치환하지 않음). ARCHIVED는 실시간 조회 차단(기존 `LiveQueryBlocked` 경로).
- 인증: 실제 HTTP 401. Zabbix 미연동 비관리자: 기존 엔진 FORBIDDEN(HTTP 200 + 403).
- 예기치 않은 서버 버그는 `ApiError`로 감싸지 않는다.

## 9. 값·오류 예시(형태 예시 — 실장비 관측 아님)

```json
{ "value": 0, "textValue": null, "unit": "%", "observedAt": 1789603200000,
  "status": "OK", "reasonCode": null, "expectedHeartbeatSeconds": 60 }
```
```json
{ "value": null, "textValue": null, "unit": "count", "observedAt": null,
  "status": "UNSUPPORTED", "reasonCode": "SOURCE_UNSUPPORTED", "expectedHeartbeatSeconds": null }
```
```json
{ "status": "error", "code": 400, "errorCode": "GPU_QUERY_TOO_DENSE",
  "message": "조회 기간을 줄이거나 시간 집계를 선택해 주세요." }
```
```json
{ "status": "error", "code": 503, "errorCode": "GPU_SOURCE_UNAVAILABLE",
  "message": "데이터소스 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  "data": { "sourceErrorCode": "PARTIAL_FAILURE" } }
```

## 10. 계약 검증 완료 조건(VERIFIED 전환)

- [x] 컨트롤러 4개 envelope·errorCode·body code·HTTP 상태(MockMvc IT, 엔진 포트 대역)
- [x] 라이선스 기능 미보유·권한 없음·인증 없음 HTTP+body(IT)
- [x] null 키 보존·점 표기 metric 키(IT)
- [ ] dev BE 실제 HTTP 응답 — 프리셋 템플릿을 dev Zabbix에 붙인 뒤
- [ ] FE 렌더(null·0·STALE·UNSUPPORTED·ERROR·NO_DATA fixture)
- [ ] 목록 scope/필터/페이지/합계 동일 snapshot, STALE_CACHE·권한 회수 런타임 확인
- [ ] 시계열 RAW/BUCKETED/TREND 실데이터, gap·boundary·invalid
- [ ] OpenAPI(`/v3/api-docs`)와 이 문서 대조(api-contract-sync)

## 11. 설치 가이드 API (S2.5, 2026-10-08)

구현: `premium/gpu/setup/`(컨트롤러 `GpuSetupController`) · 기록 [impl_gpu-s2b-setup.md](solutions--impl_gpu-s2b-setup.md) · 상태 **IMPLEMENTED / 런타임 미검증**(단위 28 + IT 4, Zabbix 대역).

공통: §1과 같다(인증 401 → `@RequiresFeature(GPU_MONITORING)` → `gpuMonitoring.view`(200+403 FORBIDDEN)). 관리자 전용 EP는 그 뒤 **userRole 축(ADMIN ∪ SUPER_ADMIN)** 판정 — 거부는 HTTP 200 + body `code:403`, `errorCode:"FORBIDDEN"`, 메시지 "GPU 수집 설정은 관리자만 변경할 수 있습니다." 시각 epoch ms, null 키 보존.

🔴 **선택은 안내 표시용이다** — 저장해도 수집 동작은 바뀌지 않는다(어댑터가 호스트별로 연결 템플릿·아이템을 보고 프로필을 자동 판정). 템플릿 자동 가져오기(`configuration.import`)도 하지 않는다(내려받기 + 수동 가져오기).

| EP | 권한 | 비고 |
|---|---|---|
| `GET /gpu/setup/overview` | view (설치 상태·Zabbix 주소는 관리자만) | 버전 5분·템플릿 60초 캐시(전역) |
| `PUT /gpu/setup/selection` | view + 관리자 | 본문 `{ path }` |
| `GET /gpu/setup/presets/{presetId}/files/{name}` | view + 관리자 | **본문 = 파일 원문**(오류만 JSON 봉투) |
| `GET /gpu/setup/hosts?q=&linkedOnly=true&page=1&pageSize=25` | view + 관리자 | pageSize ≤ 100 |

### 11.1 overview

```ts
type CollectionPath = 'OFFICIAL_PLUGIN' | 'DCGM_HTTP' | 'NVIDIA_SMI' | 'NVIDIA_SMI_ACTIVE';
interface GpuSetupOverview {
  zabbix: { version: string | null; major: number | null; minor: number | null; reachable: boolean; checkedAt: number };
  selection: { path: CollectionPath | null; selectedAt: number | null; selectedBy: string | null };
  paths: Array<{                                   // 항상 4개, 위 순서
    path: CollectionPath;
    presetId: string | null;                       // 공식이면 null
    availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
    reasonCode: string | null;                     // 아래 표
    requirements: string[];                        // ZABBIX_AGENT · AGENT2_PLUGIN · DCGM_EXPORTER · HOST_INTERFACE · AGENT_ACTIVE_CONFIG · USERPARAMETER_SCRIPT
    recommended: boolean;                          // DCGM_HTTP만 true(설계 §5)
    recommendedTemplateFormat: string | null;      // 이 서버에 권할 템플릿 export 형식("7.0"). 공식·판정 불가면 null
  }>;
  installStatus: 'AVAILABLE' | 'HIDDEN' | 'SOURCE_ERROR'; // HIDDEN=비관리자, SOURCE_ERROR=관리자인데 Zabbix 조회 실패
  presets: Array<{                                 // ZabbixPresetCatalog 전 항목(동적)
    presetId: string; version: string; minProduct: string;
    displayName: string; templateHost: string;     // 표시명 · 기술명(가져온 뒤 검색용)
    installed: { templateId: string; version: string | null;
                 status: 'INSTALLED' | 'OUTDATED' | 'NEWER_THAN_PRODUCT' | 'TAG_MISSING';
                 linkedHostCount: number } | null; // 미설치·HIDDEN·SOURCE_ERROR면 null
    files: Array<{ name: string; kind: 'TEMPLATE' | 'SCRIPT' | 'AGENT_CONF' | 'COUNTERS_CSV' | 'OTHER';
                   zabbixMajor: string | null; downloadPath: string }>; // downloadPath = "/gpu/setup/presets/{id}/files/{name}"
  }>;
  official: { templateId: string | null; linkedHostCount: number } | null; // installStatus≠AVAILABLE이면 null
  guideContext: {
    zabbixServerHost: string | null;   // 관리자만. Zabbix API URL의 호스트 — 🔴 웹 프런트 주소라 트래퍼 주소와 다를 수 있음(편집 가능한 기본값으로만)
    zabbixServerPort: number;          // 10051
    zabbixAgentPort: number;           // 10050
    dcgmExporterPort: number;          // 9400
    dcgmExporterImage: string;         // "nvcr.io/nvidia/k8s/dcgm-exporter:4.5.2-4.8.1-ubi9"(실측 태그, 예시)
    officialPluginPackage: string;     // "zabbix-agent2-plugin-nvidia-gpu"
    officialTemplateName: string;      // "Nvidia by Zabbix agent 2"
    presetTemplateGroup: string;       // "MovesEye presets"
    smiScriptPath: string;             // "/usr/local/bin/moveseye-gpu-smi.sh"
    agent2ConfDir: string;             // "/etc/zabbix/zabbix_agent2.d"
    agentdConfDir: string;             // "/etc/zabbix/zabbix_agentd.d"
    presetDownloadBasePath: string;    // "/gpu/setup/presets"
    // ── 설치 안내 명령의 고정 환경값(FE 검수 🟡5, 2026-10-08) — 아래 표 ──
    dcgmPort: number;
    dcgmCountersDir: string;
    agentConfDir: string;
    agentScriptDir: string;
  };
}
```

guideContext 고정 환경값 — 값은 BE `GpuSetupService` 상수 한 곳에서 나온다(프리셋 파일의 conf `UserParameter` 경로·counters CSV 주석의 `-f` 경로와 같은 값). FE는 필드가 없으면(구 BE) 이 표의 기본값을 쓴다.

| 필드 | 고정값(기본) | 쓰는 곳 |
|---|---|---|
| `dcgmPort` | `9400` | DCGM Exporter 실행·방화벽 명령, 템플릿 매크로 `{$MOVESEYE.GPU.DCGM.PORT}`. `dcgmExporterPort`와 같은 값 |
| `dcgmCountersDir` | `/etc/dcgm-exporter` | counters CSV 배치 경로(`dcgm-exporter -f {dir}/dcgm-counters-moveseye.csv`) |
| `agentConfDir` | `/etc/zabbix/zabbix_agent2.d` | nvidia-smi conf 배치 경로. `agent2ConfDir`와 같은 값 |
| `agentScriptDir` | `/usr/local/bin` | nvidia-smi 스크립트 배치 경로(`smiScriptPath`의 디렉터리) |

가용성(서버 버전만으로):

| path | 조건 | UNAVAILABLE reasonCode |
|---|---|---|
| OFFICIAL_PLUGIN | 서버 ≥ **7.2.1** | `ZABBIX_VERSION_BELOW_7_2` |
| DCGM_HTTP · NVIDIA_SMI · NVIDIA_SMI_ACTIVE | 카탈로그 `zabbixMajors` 중 서버 이하인 형식이 하나라도 있음(지금 7.0만) | `ZABBIX_VERSION_BELOW_{가장 낮은 형식}` → 지금 `ZABBIX_VERSION_BELOW_7_0` |
| (전부) | 버전 조회 실패 | UNKNOWN + `ZABBIX_UNREACHABLE` · 응답은 왔는데 못 읽음 UNKNOWN + `ZABBIX_VERSION_UNKNOWN` |

예: 7.0.6 → 공식 UNAVAILABLE, 나머지 AVAILABLE · 7.4.15 → 전부 AVAILABLE · 6.0.30 → 전부 UNAVAILABLE. 6.0 export 파일이 카탈로그에 추가되면 코드 수정 없이 6.0이 AVAILABLE이 된다.

설치 상태(관리자): `template.get` 태그 `moveseye_preset` Exists + 기술명(프리셋·공식) 필터 2회를 합쳐 60초 캐시. 판정은 캐시 뒤에서 카탈로그와 비교 — 태그 버전 = 카탈로그 INSTALLED · 낮음/태그 없음 OUTDATED · 높음 NEWER_THAN_PRODUCT · 태그 없는 동명 템플릿 TAG_MISSING. 같은 프리셋 템플릿이 여럿이면 연결 호스트 많은 쪽.

### 11.2 selection

요청 `{ "path": "DCGM_HTTP" }` → 응답 `{ path, selectedAt: number, selectedBy: string|null, affectsCollection: false }`.
- 모르는 값·누락: `GPU_BAD_QUERY`(400). UNAVAILABLE 경로: `GPU_BAD_QUERY`(400) + `data.reasonCode`. **UNKNOWN(버전 조회 실패)은 허용**.
- 저장: `gpu_setting` 단일 행(id=1, Flyway **V73**). DB에 남은 모르는 값은 overview에서 `path:null`.

### 11.3 파일 내려받기

- `name`은 overview `presets[].files[].name`에 **정확히 있는 값만**. 그 밖(경로 조작 포함)·모르는 presetId: HTTP 200 + JSON `GPU_NOT_FOUND`(404).
- 성공: `Content-Disposition: attachment; filename="…"`, `Cache-Control: no-store`, Content-Type: yaml `application/yaml;charset=UTF-8` · sh `text/x-shellscript;charset=UTF-8` · csv `text/csv;charset=UTF-8` · conf 등 `text/plain;charset=UTF-8`. `.sh`·`.conf`는 LF 보장.
- 템플릿 이름 = `{presetId}-zabbix{major}.yaml`(예 `gpu-dcgm-http-zabbix7.0.yaml`). 보조 파일은 카탈로그 이름 그대로. 액티브 변형(`gpu-nvidia-smi-active`)의 sh·conf는 패시브와 같은 파일이다.
- FE: 응답이 JSON 봉투인지(Content-Type `application/json`) 먼저 보고 오류 처리, 아니면 Blob 저장.

### 11.4 hosts

```ts
interface GpuSetupHosts {
  page: number; pageSize: number;
  total: number;            // 권한 교집합 후 후보 수
  truncated: boolean;       // linkedOnly=false 검색 후보가 1000개 상한에 걸림
  rows: Array<{
    hostId: string; hostName: string;      // 표시명(없으면 기술명)
    technicalName: string;                 // 🔴 액티브 에이전트 Hostname= 에 넣을 값
    interfaces: Array<{ type: 'AGENT'|'SNMP'|'IPMI'|'JMX'|'UNKNOWN'; ip: string|null; dns: string|null;
                        useIp: boolean; port: string; available: 'AVAILABLE'|'UNAVAILABLE'|'UNKNOWN' }>;
    activeAgentAvailable: 'AVAILABLE'|'UNAVAILABLE'|'UNKNOWN'|null;  // Zabbix 6.4+만, 아니면 null
    linked: Array<{ kind: 'PRESET'|'OFFICIAL'; presetId: string|null; templateId: string }>;
    detectedProfile: 'NVML_PLUGIN'|'MOVESEYE_DCGM_HTTP_V1'|'MOVESEYE_NVIDIA_SMI_V1'|'UNKNOWN'|null;
  }>;
}
```
- `linkedOnly=true`(기본): GPU 템플릿(프리셋 태그·공식·TAG_MISSING 동명)이 **직접** 연결된 호스트. `false`: `q`(기술명·표시명 부분 일치) **필수**.
- `detectedProfile`은 **템플릿 연결 기준**(우선순위 DCGM > NVML > SMI). 실제 수집 상태·GPU 수는 기존 `/gpu/hosts/diagnostics`.
- 오류: `GPU_BAD_QUERY`(page·pageSize·linkedOnly 형식, q 누락) · `GPU_SOURCE_UNAVAILABLE`(503, Zabbix 실패).

## 12. 상세 위젯 대시보드 (2차, 2026-10-12)

GPU 상세를 APM 개요·서비스 상세·홈과 같은 **위젯 대시보드**로 만든다(추가·삭제·배치·크기·제목·지표 선택, 사용자별 저장). 구현 `premium/gpu/dashboard/`. 저장은 홈 위젯 공용 테이블(`home_widget`, `dashboard_key='gpu:detail'`) — **Flyway 없음**.

- 🔴 **사용자당 한 벌, 모든 GPU 상세에 같은 배치.** 경로에 hostId·gpuUuid가 없다(GPU별 저장 안 함).
- 권한: 인증 → `GPU_MONITORING` 라이선스 → `gpuMonitoring.view`(HTTP 200 + body 403). **쓰기도 view만으로**(자기 배치는 관리 행위가 아님 — APM 선례 `requireRead`와 같음).
- DTO·봉투·오류는 **홈/APM 위젯과 동일**(`HomeWidgetDto` 등). FE는 APM 대시보드가 쓰는 위젯 대시보드 컴포넌트를 그대로 재사용할 수 있다.

| API | 요청 | 응답 data |
|---|---|---|
| `GET /gpu/dashboards/detail/widgets` | — | `HomeWidget[]` — 0건이면 기본 11종 시드(멱등). 정렬 posY, posX, id |
| `POST /gpu/dashboards/detail/widgets` | `{widgetType, title?, config?, posX?, posY?, width?, height?}` | `HomeWidget` — 크기 생략 시 카탈로그 기본, 좌표 생략 시 최하단 |
| `PATCH /gpu/dashboards/detail/widgets/layout` | `{layouts:[{id,x,y,w,h}]}` | `null` — 내 것이 아닌 id는 그 항목만 무시 |
| `PATCH /gpu/dashboards/detail/widgets/{id}` | `{title?, config?}`(null=변경 없음, title ""=기본 제목, config는 통째 교체) | `HomeWidget` |
| `DELETE /gpu/dashboards/detail/widgets/{id}` | — | `null` |
| `POST /gpu/dashboards/detail/widgets/reset` | — | `HomeWidget[]`(기본 11종) |

```ts
interface HomeWidget {            // 기존 홈/APM 타입 그대로
  id: number; widgetType: string; title: string|null; config: Record<string, unknown>;
  posX: number; posY: number; width: number; height: number; pinned: boolean;   // GPU는 전부 pinned=false
}
```

**위젯 타입(정본 `GpuDashboardWidgetType`)** — 12칸 그리드, 크기 = 기본 w×h, 좌표 = 기본 세트의 (x,y)

| widgetType | 종류 | 그리는 지표(기본 → 고를 수 있는 것) | 데이터 | 기본 w×h | 기본 세트 |
|---|---|---|---|---|---|
| `gpu_current_utilization` | CURRENT | utilization | `/gpu/devices/detail` device.metrics | 3×4 | ✅ (0,0) |
| `gpu_current_vram` | CURRENT | vram.used, vram.total, vram.usedPct | 〃 | 3×4 | ✅ (3,0) |
| `gpu_current_temperature` | CURRENT | temperature | 〃 | 3×4 | ✅ (6,0) |
| `gpu_current_power` | CURRENT | power.draw, power.limit | 〃 | 3×4 | ✅ (9,0) |
| `gpu_chart_utilization` | CHART | utilization | `/gpu/devices/series` | 6×9 | ✅ (0,4) |
| `gpu_chart_memory_activity` | CHART | memory.activity (DCGM만 값 있음) | 〃 | 6×9 | — |
| `gpu_chart_vram` | CHART | vram.used, vram.free, vram.total | 〃 | 6×9 | ✅ (6,4) |
| `gpu_chart_temperature` | CHART | temperature | 〃 | 6×9 | ✅ (0,13) |
| `gpu_chart_power` | CHART | power.draw → +power.limit | 〃 | 6×9 | ✅ (6,13) |
| `gpu_chart_clock` | CHART | clock.sm, clock.memory | 〃 | 6×9 | ✅ (0,22) |
| `gpu_chart_pcie` | CHART | pcie.rx, pcie.tx | 〃 | 6×9 | ✅ (6,22) |
| `gpu_collection_info` | INFO | — (device.collectionProfile·detectedProfiles·profileConflict·capabilityTier·lastSeenAt) | `/gpu/devices/detail` | 12×5 | ✅ (0,31) |
| `gpu_diagnostics` | INFO | — | `/gpu/hosts/diagnostics` | 12×6 | — |

- 기본 배치는 행마다 같은 높이·12칸 빈칸 없음(RGL compact 재배치 방지). 클럭·PCIe는 경로에 따라 값이 없을 수 있다 — 위젯은 깔되 **빈 상태는 FE가 표시**(현행 "지원할 때만"을 위젯 안에서).
- **config 규칙**(거부 = `GPU_BAD_QUERY`, body 400):
  - CHART: `{}` 또는 `{metrics: string[]}` — 1개 이상, 중복 없음, 위 표의 "고를 수 있는 것" 안. 생략 시 FE는 기본 지표로 그린다. 요청 순서 유지(범례 순서).
  - CURRENT·INFO: `{}`만. **모르는 키는 거부**(조용히 버리지 않음).
  - title: 최대 100자, 제어 문자 금지.
- 🔴 차트 위젯이 여러 개면 FE는 시계열을 위젯마다 따로 부르지 말고 **보이는 차트 위젯의 지표를 합쳐 8개씩 묶어** 호출할 것(현행 상세의 primary/extra 2회 호출과 같은 방식). 기본 세트 차트 지표 합계 = **10종**(utilization 1 · vram 3 · temperature 1 · power.draw 1 — 전력 기본은 소비 전력만, power.limit 미포함 · clock 2 · pcie 2) → 2회.

**오류**: `WIDGET_TYPE_INVALID`(400, 미지 코드·홈/APM 코드) · `WIDGET_DUPLICATE`(400, 같은 타입 이미 있음) · `WIDGET_NOT_FOUND`(404, 남의/없는 id — 🔴 소유 확인이 config 검증보다 먼저) · `GPU_BAD_QUERY`(400, config·title) · `FORBIDDEN`(403) · 라이선스 errorCode.

## 13. 수집 방식 현황 (2차, 2026-10-12)

"이 GPU가 **어떤 방법으로** 수집되고 있나"를 호스트 단위로 보여 준다. 🔴 **관리자 전용 아님**(view 권한, 허용 호스트 교집합). 구현 `premium/gpu/collection/`.

`GET /gpu/collection/hosts?sourceId&hostGroupId&hostId&q&method&page&pageSize`

| 파라미터 | 규칙 |
|---|---|
| hostGroupId | 선택. 범위 = 권한 ∩ 그룹. **200 호스트 초과 → `GPU_SCOPE_TOO_LARGE`**(목록과 같은 규칙) |
| hostId | 선택, **정확 일치**(10-12 추가). 범위 = 권한 ∩ 그룹 ∩ 이 호스트. 🔴 권한 밖·없는 호스트·그룹 밖이면 `GPU_NOT_FOUND`가 아니라 **빈 결과**(status success, total 0, rows [], summary 전부 0) — 존재 비노출. 단일 호스트 범위라 스냅샷 캐시는 상세·진단과 같은 키를 쓴다. 수집 방식 위젯은 `q` 대신 이것을 쓴다 |
| q | 호스트 표시명 부분 일치(대소문자 무시) 또는 hostId 정확 일치, 최대 100자 |
| method | `DCGM`·`OFFICIAL`·`NVIDIA_SMI`·`UNKNOWN`·`NOT_CONFIGURED`·`CONFLICT`(겹친 호스트만). 그 밖 `GPU_BAD_QUERY` |
| page/pageSize | 기본 1/25, pageSize 최대 100 |

```ts
interface GpuCollectionHosts {
  sourceId: string;
  generatedAt: number; cachedAt: number|null;
  completeness: 'COMPLETE'|'STALE_CACHE'; sourceErrorCode: string|null;
  templateStatus: 'AVAILABLE'|'SOURCE_ERROR';   // SOURCE_ERROR면 rows[].linkedTemplates·agentAvailability = null(수집 판정은 그대로)
  summary: {                                    // 범위 전체(q·method 무관)
    hostCount: number;                          // = dcgm + official + nvidiaSmi + unknown + notConfigured
    dcgm: number; official: number; nvidiaSmi: number; unknown: number; notConfigured: number;
    conflict: number;                           // 겹친 호스트(위 칸과 중복 집계)
    noGpu: number; collectionError: number;
    unreturned: number;                         // 범위에 있는데 소스가 안 돌려준 호스트(행 없음)
    gpuCount: number;                           // REMOVED 제외
  };
  page: number; pageSize: number; total: number;   // total = q·method 필터 후
  rows: Array<{
    hostId: string; hostName: string;
    method: 'DCGM'|'OFFICIAL'|'NVIDIA_SMI'|'UNKNOWN'|'NOT_CONFIGURED';
    collectionProfile: CollectionProfile;       // 실제로 값을 읽은 것
    detectedProfiles: CollectionProfile[];      // 우선순위 순
    conflict: boolean;                          // detectedProfiles 2개 이상
    collectionState: 'CONFIGURED'|'NO_GPU'|'NOT_CONFIGURED'|'COLLECTION_ERROR';
    linkedTemplates: Array<{
      kind: 'PRESET'|'OFFICIAL';
      presetId: string|null;                    // PRESET: 카탈로그 id(TAG_MISSING이면 이름으로 추정)
      name: string;                             // 템플릿 표시명(없으면 기술명)
      presetVersion: string|null;               // 템플릿의 moveseye_preset_version 태그
      installStatus: 'INSTALLED'|'OUTDATED'|'NEWER_THAN_PRODUCT'|'TAG_MISSING'|'UNKNOWN_PRESET'|null;  // OFFICIAL은 null
      profile: CollectionProfile;               // 이 템플릿이 뜻하는 프로필
      templateId: string|null;                  // 🔴 관리자(ADMIN·SUPER_ADMIN)에게만, 그 외 null
    }>|null;
    gpuCount: number; removedGpuCount: number;  // REMOVED는 gpuCount에서 빼고 따로
    dataStatusCounts: { current: number; partial: number; stale: number; unavailable: number };
    lastCollectedAt: number|null;               // GPU 값 최근 수신, 없으면 발견 아이템 시각
    reasonCodes: string[];                      // 호스트 단위 진단 사유(§3.1, 예: MULTIPLE_PROFILES)
    agentAvailability: { passive: 'AVAILABLE'|'UNAVAILABLE'|'UNKNOWN'|null;
                         active: 'AVAILABLE'|'UNAVAILABLE'|'UNKNOWN'|null }|null;
  }>;
}
```

- **원천**: 수집 판정 = GPU 스냅샷(`/gpu/devices`와 **같은 캐시 키** — 같은 사용자·hostGroupId면 30초 안 재조회 없음). 템플릿 = 설치 안내와 같은 전역 캐시(60초). 페이지 호스트(≤100)의 연결 템플릿·인터페이스 = `host.get` 1회(빈 페이지면 0회). 🔴 범위 안 호스트 id만 넘긴다.
- **method**는 실제로 읽은 프로필 기준, `NOT_CONFIGURED`만 collectionState 기준. **linkedTemplates는 템플릿 연결 기준**이라 method와 다를 수 있다(예: 템플릿은 붙었는데 아이템이 값을 못 받음) — FE는 둘을 나란히 보여 준다.
- 숨김: 비관리자는 `templateId=null`. 에이전트 IP·DNS는 누구에게도 주지 않는다(가용성 상태만). 진단 detail 원문 없음(사유 코드만).
- passive = AGENT 인터페이스 중 하나라도 AVAILABLE이면 AVAILABLE, 아니면 하나라도 UNAVAILABLE이면 UNAVAILABLE, 아니면 UNKNOWN. AGENT 인터페이스가 없으면 null. active는 Zabbix 6.4+ `active_available`(없으면 null).
- 정렬: 호스트명(대소문자 무시) → hostId.
- 오류: `GPU_BAD_QUERY` · `GPU_SOURCE_UNSUPPORTED` · `GPU_SCOPE_TOO_LARGE` · `GPU_SOURCE_UNAVAILABLE`(스냅샷 실패 + 대체 없음) · `FORBIDDEN` · 라이선스. 템플릿·호스트 조회 실패는 오류가 아니라 `templateStatus=SOURCE_ERROR`.

**예시(관리자, 형태 예시 — 실장비 관측 아님)**
```json
{"status":"success","code":200,"data":{"sourceId":"zabbix-default","generatedAt":1760245200000,"cachedAt":null,
 "completeness":"COMPLETE","sourceErrorCode":null,"templateStatus":"AVAILABLE",
 "summary":{"hostCount":3,"dcgm":1,"official":1,"nvidiaSmi":0,"unknown":0,"notConfigured":1,"conflict":1,
            "noGpu":0,"collectionError":0,"unreturned":0,"gpuCount":3},
 "page":1,"pageSize":25,"total":3,
 "rows":[{"hostId":"10771","hostName":"gpu-node-1","method":"DCGM","collectionProfile":"MOVESEYE_DCGM_HTTP_V1",
   "detectedProfiles":["MOVESEYE_DCGM_HTTP_V1","NVML_PLUGIN"],"conflict":true,"collectionState":"CONFIGURED",
   "linkedTemplates":[{"kind":"PRESET","presetId":"gpu-dcgm-http","name":"MovesEye GPU by DCGM (HTTP)","presetVersion":"1.0",
                       "installStatus":"INSTALLED","profile":"MOVESEYE_DCGM_HTTP_V1","templateId":"10761"},
                      {"kind":"OFFICIAL","presetId":null,"name":"Nvidia by Zabbix agent 2","presetVersion":null,
                       "installStatus":null,"profile":"NVML_PLUGIN","templateId":"10677"}],
   "gpuCount":2,"removedGpuCount":0,"dataStatusCounts":{"current":2,"partial":0,"stale":0,"unavailable":0},
   "lastCollectedAt":1760245170000,"reasonCodes":["MULTIPLE_PROFILES"],
   "agentAvailability":{"passive":"AVAILABLE","active":null}}]}}
```

## 🔄 FE 요청사항

- 현재 없음. 구현 후 이 절에 계약 변경 요청을 누적한다.
- **(FE S3 · 2026-10-08) 계약↔타입 불일치 없음** — §3~§9 전 필드를 `src/types/gpu.ts`에 그대로 옮겼고 BE DTO(`premium/gpu/**Dto.java`)와도 대조했다. 대조표: [qa_gpu-monitoring-fe.md](solutions--qa_gpu-monitoring-fe.md). 아래는 **차단 아님**(선택 개선):
  - FE-R1(선택) 목록 모델 필터 후보 — 목록 payload에 `facets.models: string[]`(권한 범위·REMOVED 제외, 스냅샷 기준)를 주면 좋겠다. 지금은 FE가 받아 본 행에서 모델을 모아 자동완성 후보로 쓰고 자유 입력을 허용한다(정확 일치 필터라 오타 시 0건).
  - FE-R2(선택) 호스트 필터 후보 — 지금은 기존 `/user-roles/hosts`(전체 호스트)를 쓴다. GPU 수집 호스트만 고르게 하려면 `/gpu/hosts`(id·name·collectionState) 같은 후보 EP가 필요하다. 허용 호스트 200 초과 설치본에서 `GPU_SCOPE_TOO_LARGE` 회복 동선이 짧아진다.
- (BE 메모) 초안 대비 **추가 필드**: `GpuRow.collectionProfile`·`capabilityTier`, `coverage.capabilityTier`, `metadata.migMode`에 `UNSUPPORTED`, 진단 `completeness`·`collectionProfile`·`detectedProfiles`·`devices[].discoveryState`. **변경**: `invalidPointCount: number → number|null`, `adminDetails` 모양(items[] → diagnostics[]). FE 타입은 이 문서 기준으로 작성.
