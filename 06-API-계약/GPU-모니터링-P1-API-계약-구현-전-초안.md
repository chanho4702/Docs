# GPU 모니터링 P1 API 계약 — 구현 전 초안

작성: Codex · 2026-09-17 · 상태: **DRAFT / 엔드포인트 미구현**

정본 동작: [P1 상세 설계](../02-%EC%84%A4%EA%B3%84/NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md). 실제 응답을 검증한 계약이 아니다. 구현 시 OpenAPI·실제 HTTP 응답·FE 소비를 대조하고 VERIFIED로 전환한다. 기존 API를 변경하지 않는다.

## 1. 공통

- 인증: 기존 로그인 쿠키/Bearer + visitorId 규칙. `GPU_MONITORING` Feature + `monitoring/gpuMonitoring.view` + 소스/호스트 가시 범위.
- sourceId는 P1 `zabbix-default`만 허용하며 생략 시 이 값. 모든 응답의 식별자 sourceId/hostId/gpuUuid는 string.
- 시각은 **epoch milliseconds**. `from` 포함, `to` 배타. 내부 엔진의 초 단위를 REST에서 한 번 변환.
- 성공 HTTP 200 + `ApiResult` (`status:"success", code:200, data:payload`; ApiStatus 소스에서 소문자 직렬화 확인). FE 훅은 payload 소비. 표준 envelope 예외는 기존 interceptor/handler가 결정.
- 아래 타입의 `| null`은 JSON 키가 존재하고 값이 null인 것을 뜻한다. 선택 키 `?`는 사용하지 않는다. metric map도 응답 프로필에 정의한 전체 key를 포함하고 없는 값은 상태를 담는다.
- 모든 데이터 수치는 예시이며 실장비 관측 결과가 아니다.

## 2. 요청

| API | 파라미터 | 동작 |
|---|---|---|
| `GET /gpu/devices` | sourceId, hostGroupId, hostId, q, model, dataStatus, page, pageSize, sortBy, sortOrder, snapshotId | 필터별 목록/전체 matched 집계 |
| `GET /gpu/devices/detail` | sourceId, hostId 필수, gpuUuid 필수 | 메타와 현재값 |
| `GET /gpu/devices/series` | sourceId, hostId 필수, gpuUuid 필수, from 필수, to 필수, metrics 필수, resolution | 단일 GPU 최대8 metric |
| `GET /gpu/hosts/diagnostics` | sourceId, hostId 필수 | 호스트/아이템 수집 진단 |

q는 hostName/label/UUID substring(최대100자), model은 exact match. dataStatus는 CURRENT/PARTIAL/STALE/UNAVAILABLE. page=1, pageSize=25 기본/max100. sortBy=hostName 기본, sortOrder=asc 기본. 허용 sortBy: hostName/model/utilization/vramUsedPct/temperature/powerDraw/lastSeenAt. null은 항상 뒤, 동률 hostId+gpuUuid. 문자열 ID 길이 상한256, 제어문자 거부; 정규화 시 UUID 대소문자 임의 변경 금지.

snapshotId 최초 요청 생략, 다음 page 요청에 재사용 가능. source/principal/권한과 발견 scope(hostGroupId/hostId)에 바인딩. q/model/dataStatus/sort는 같은 snapshot 안에서 재계산하며 그 필터가 바뀌면 FE page=1. snapshot TTL60초. page 범위 초과는 빈 rows + 정확한 total, FE가 마지막 유효 page로 이동.

같은 snapshotId의 값/freshness/dataStatus는 generatedAt 기준으로 고정한다. 30초 갱신은 새 snapshot으로 page1부터 요청한다. 현재 권한 검사는 재수행하며 권한 범위 변경 시 snapshot 무효화. STALE_CACHE 제공도 새 degraded snapshotId를 발행하고 과거 정상 ID의 상태를 변조하지 않는다.

series metrics는 comma-separated allowlist. 중복 제거 후 최대8. resolution=AUTO/RAW/HOURLY_TREND, 기본AUTO. 최대30일, RAW 최대24h. 잘못된 from/to는 최근1시간으로 보정하지 않고 BAD_QUERY. 미래 to는 서버시각+60초까지만 허용하고 실제 effectiveTo를 서버시각으로 제한하여 반환. 호스트 scope200/GPU2000 상한 초과는 필터 요구 오류.

## 3. 공용 타입 (payload)

```ts
type GpuId = { sourceId: string; hostId: string; gpuUuid: string };
type ValueStatus = 'OK'|'STALE'|'DISABLED'|'UNSUPPORTED'|'NO_DATA'|'ERROR';
type GpuValue = {
  value: number|null; textValue: string|null; unit: string;
  observedAt: number|null; status: ValueStatus; reasonCode: string|null;
  expectedHeartbeatSeconds: number|null;
};
type GpuRow = GpuId & {
  hostName: string; label: string; model: string|null;
  physicalKind: 'PHYSICAL'|'UNKNOWN';
  discoveryState: 'PRESENT'|'REMOVED'|'UNKNOWN';
  lastSeenAt: number|null;
  dataStatus: 'CURRENT'|'PARTIAL'|'STALE'|'UNAVAILABLE';
  health: 'ALERT'|'NO_ACTIVE_ALERT'|'UNKNOWN';
  activeGpuEventCount: number|null; hostEventsAvailable: boolean;
  metrics: Record<string,GpuValue>;
};
type ObservationAggregate = { value: number|null; observedCount: number };
```

metrics key는 canonical name: utilization, memory.activity, vram.used/total/free/usedPct, temperature, power.draw/limit, clock.sm/memory, performance.state, pcie.rx/tx, ecc.corrected/uncorrected의 총16개다. URI param metric은 slash가 아니라 실제 dotted name이다. 숫자 value와 textValue는 동시에 유효하지 않으며 P-state만 textValue를 사용한다. 다른 unit과 enum의 상세는 P1 표 참조.

required 지표 5종: utilization, vram.used, vram.total, temperature, power.draw. 5개 모두 OK면 CURRENT. OK가 일부면 PARTIAL, OK가 없고 유효 마지막 STALE 값이 있으면 STALE, 나머지는 UNAVAILABLE. 이 분류는 고장 판정이 아니다. error/unsupported 개수는 detail coverage에서 별도 제공한다.

## 4. 목록 응답

```ts
type GpuListPayload = {
  sourceId: string; snapshotId: string;
  generatedAt: number; cachedAt: number|null;
  completeness: 'COMPLETE'|'STALE_CACHE'; sourceErrorCode: string|null;
  scope: { hostCount: number; gpuCount: number; matchedCount: number };
  collectionSummary: {
    configuredHostCount: number; noGpuHostCount: number;
    unconfiguredHostCount: number; unknownHostCount: number;
  };
  page: number; pageSize: number; total: number; rows: GpuRow[];
  totals: {
    currentCount: number; partialCount: number;
    staleCount: number; unavailableCount: number;
    utilization: ObservationAggregate; vramUsedPct: ObservationAggregate;
    powerDraw: ObservationAggregate; activeGpuEventCount: number|null;
  };
};
```

scope.hostCount는 인가/host 필터 후 호스트 수, gpuCount는 해당 scope의 PRESENT/UNKNOWN 장비 행 수, matchedCount/total은 q/model/dataStatus까지 적용한 수다. 기본 목록은 REMOVED 제외(상세 접근·진단에만 표시). collectionSummary는 host 필터 후 전체 호스트 기준이며 GPU row filter와 무관하다. count 의미를 tooltip에 고정한다.

STALE_CACHE에서는 rows의 value는 마지막 값/관측 시각을 유지할 수 있으나 모든 OK를 STALE로 내리고 health=UNKNOWN, sourceErrorCode 필수. totals의 숫자 집계 value=null/observedCount=0, activeGpuEventCount=null, currentCount=0. dataStatus/count를 강등한 뒤 해당 요청 dataStatus 필터를 재적용한다. 일부 fresh chunk와 합치지 않는다.

## 5. 상세 응답

```ts
type GpuDetailPayload = {
  device: GpuRow;
  generatedAt: number; completeness: 'COMPLETE'|'STALE_CACHE';
  sourceErrorCode: string|null;
  metadata: {
    driverVersion: string|null; nvmlVersion: string|null;
    serialNumber: string|null; pciBusId: string|null;
    migMode: 'ENABLED'|'DISABLED'|'UNKNOWN';
  };
  coverage: {
    requiredCount: number; okRequiredCount: number;
    unsupportedCount: number; errorCount: number;
  };
  retention: {
    effectiveHistoryDays: number|null; effectiveTrendDays: number|null;
    reasonCode: string|null;
  };
};
```

GPU별 retention은 차트 기본지표에서 확인 가능한 공통 최소 기간이다. 지표마다 다르더라도 모두 해석 가능하면 그 최소값을 사용하며, 하나라도 설정 미해결이면 null+reason이다. 실제 삭제 결과/보존 약속이 아니다. series 응답은 metric별 설정을 별도로 반환한다. PCI/serial 미제공은 null, 정밀 MIG 관측은 P1에서 보장하지 않는다.

## 6. 시계열 응답

```ts
type GpuSeriesPayload = {
  id: GpuId; requestedFrom: number; requestedTo: number;
  effectiveFrom: number; effectiveTo: number; generatedAt: number;
  series: Array<{
    metric: string; unit: string;
    resolution: 'RAW'|'RAW_BUCKETED'|'HOURLY_TREND'; stepMs: number|null;
    state: 'AVAILABLE'|'PARTIAL'|'NO_DATA'|'UNSUPPORTED'|'ERROR';
    reasonCode: string|null; invalidPointCount: number;
    availableFrom: number|null; availableTo: number|null;
    effectiveHistoryDays: number|null; effectiveTrendDays: number|null;
    points: Array<{
      t: number; min: number|null; max: number|null; avg: number|null;
      count: number|null; boundaryPartial: boolean;
    }>;
    gaps: Array<{ from: number; to: number; reasonCode: string }>;
  }>;
};
```

RAW는 min=max=avg, count=1이다. RAW_BUCKETED는 원시 point의 산술평균과 count를 제공한다. HOURLY_TREND는 source min/max/avg, count=null이다(현행 engine 계약에 count 없음). points는 시각 오름차순이며 중복이 없다. 결측은 null bucket 또는 gaps로 표시하고 선을 연결하지 않는다. invalidPointCount>0이면 state=PARTIAL, 모든 point가 invalid이면 ERROR다. query limit 정책 위반은 envelope 오류로 처리하며 PARTIAL에 숨기지 않는다.

availableFrom/To는 반환된 관측/bucket 범위이며 범위 안의 완전성을 보장하지 않는다. 개별 metric 실패는 state=ERROR로 다른 metric과 함께 반환할 수 있으나 source 전체 실패는 envelope 오류다. vram.usedPct·P-state·ECC는 P1 series 요청을 거부한다.

TREND는 from을 UTC 시간 시작으로 내린 소스 조회에서 요청 창과 겹치는 완료 bucket을 반환한다. 경계 bucket은 t가 effectiveFrom보다 이를 수 있으며 boundaryPartial=true. 현재 진행 중 시간은 points에 넣지 않고 CURRENT_BUCKET_INCOMPLETE gap으로 표시한다. effectiveFrom/To는 입력을 검증·미래 제한한 요청 경계이며 소스 조회 확장 범위가 아니다. 실제 품질 정보는 신규 MetricPort.querySeriesChecked 결과에서 전달받는다.

## 7. 진단 응답

```ts
type GpuDiagnosticsPayload = {
  sourceId: string; hostId: string; checkedAt: number;
  collectionState: 'CONFIGURED'|'NO_GPU'|'NOT_CONFIGURED'|'COLLECTION_ERROR';
  reasonCodes: string[];
  devices: Array<{
    gpuUuid: string|null; label: string|null;
    issues: Array<{ metric: string|null; reasonCode: string; actionCode: string }>;
  }>;
  adminDetails: null|{
    profileId: string|null;
    items: Array<{
      itemId: string; key: string; enabled: boolean;
      sourceState: string; sanitizedError: string|null;
    }>;
  };
};
```

일반 사용자에게 raw 오류 문자열을 공개하지 않는다. reason/action 코드를 i18n 문구와 설치 안내로 매핑한다. scope가 비어도 권한 확인을 건너뛰지 않는다. 진단 endpoint는 plugin 설치/템플릿 import를 수행하지 않는다.

## 8. 오류 계약

다음은 새 domain errorCode 결정안이다. GPU 도메인 오류는 기존 ApiError 경로로 던진다. GlobalExceptionHandler.handleApiError가 HTTP200을 반환하는 소스를 확인했으므로 아래 transport로 구현한다. 인증/Feature 거절은 기존 errorCode와 handler를 재사용한다.

| errorCode | 의미 | FE 행동 |
|---|---|---|
| GPU_BAD_QUERY | 기간/metric/정렬/ID 형식 오류 | 해당 입력 안내 |
| GPU_SOURCE_UNSUPPORTED | P1 지원하지 않는 source | 기본 소스 안내 |
| GPU_NOT_FOUND | 존재하지 않거나 접근 불가한 명시 host/GPU | 존재 여부 노출 없이 찾을 수 없음 |
| GPU_SCOPE_TOO_LARGE | host/GPU scope 초과 | host group 또는 host 좁히기 |
| GPU_QUERY_TOO_DENSE | RAW 입력/결과 완전성 예산 초과 | 기간 축소/trend 선택 |
| GPU_SNAPSHOT_EXPIRED | 만료되거나 현재 scope와 맞지 않는 snapshot | 현재 필터로 page1 재조회 |
| GPU_SOURCE_UNAVAILABLE | 소스 전체 조회 실패 | 오류 표시/다음 주기 재시도 |

권한 거부는 현재 레포 정책인 HTTP200+body code403을 유지하고, 인증401은 기존 실제 HTTP401을 유지한다. Feature 거부는 기존 라이선스 errorCode/transport를 재사용하며 별도 GPU 오류로 치환하지 않는다.

새 GPU domain 오류의 transport는 모두 HTTP200이다. body code는 BAD_QUERY/SOURCE_UNSUPPORTED/SCOPE_TOO_LARGE/QUERY_TOO_DENSE=400, NOT_FOUND=404, SNAPSHOT_EXPIRED=409, SOURCE_UNAVAILABLE=503으로 정한다. 오류 응답은 status=error, errorCode와 사용자 message를 포함하고 data는 기존 ApiResult 규칙대로 생략한다. 예기치 않은 서버 버그까지 ApiError로 감싸 숨기지 않는다. 위 조합의 실제 HTTP 확인이 VERIFIED 전환 조건이다.

## 9. 값·오류 예시

실제 idle 상태의 활동률0은 유효한 값이다(예시):

```json
{
  "value": 0,
  "textValue": null,
  "unit": "%",
  "observedAt": 1789603200000,
  "status": "OK",
  "reasonCode": null,
  "expectedHeartbeatSeconds": 30
}
```

하드웨어의 명시적 ECC 미지원은 숫자0으로 나타내지 않는다:

```json
{
  "value": null,
  "textValue": null,
  "unit": "count",
  "observedAt": null,
  "status": "UNSUPPORTED",
  "reasonCode": "CAPABILITY_NOT_SUPPORTED",
  "expectedHeartbeatSeconds": null
}
```

RAW 조회 예산을 초과한 경우의 domain 오류(HTTP200):

```json
{
  "status": "error",
  "code": 400,
  "errorCode": "GPU_QUERY_TOO_DENSE",
  "message": "조회 기간을 줄이거나 시간 집계를 선택해 주세요."
}
```

## 10. 계약 검증 완료 조건

- null·0·STALE·UNSUPPORTED·ERROR·NO_DATA payload fixture와 FE 렌더 검증.
- 요청·응답 epoch ms, metadata null, enum 표기, API envelope 실측.
- 목록 scope/필터/페이지/합계 동일 snapshot 확인, stale-cache 강등 및 권한 회수 확인.
- source timeout/limit/not-found/Feature 거부/역할 거부 실제 HTTP+body 기록.
- 시계열 RAW/BUCKETED/TREND, count null, gap·boundary·invalid 확인.
- 코드에 구현된 OpenAPI와 이 문서가 일치해야 상태를 VERIFIED로 전환.

## 🔄 FE 요청사항

- 현재 없음. 구현 후 이 절에 계약 변경 요청을 누적한다.
