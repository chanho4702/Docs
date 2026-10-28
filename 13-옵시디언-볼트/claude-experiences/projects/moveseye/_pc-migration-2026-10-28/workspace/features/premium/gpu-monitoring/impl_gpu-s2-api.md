# GPU P1 S2 — app 계층(REST·권한·캐시) 구현 (ZM-78)

작성: Claude(be-engineer) · 2026-10-08 · 워크트리 `C:\worktrees\zm-78-be`(브랜치 `ZM-78`) · **미커밋**

입력: S1 인계 [impl_gpu-s1-engine.md](impl_gpu-s1-engine.md) · 설계 `features/premium/gpu-monitoring/devdesign_gpu-monitoring-p1.md` §7~§12 · `features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md` §6·§9·§11·§15.
출력 계약: [features/premium/gpu-monitoring/contract_gpu-monitoring.md](contract_gpu-monitoring.md) — 상태 **IMPLEMENTED / 런타임 미검증**.

## 1. 결과 요약

| 영역 | 상태 |
|---|---|
| REST 4개 `GET /gpu/devices` · `/gpu/devices/detail` · `/gpu/devices/series` · `/gpu/hosts/diagnostics` | 완료 |
| 권한 `monitoring/gpuMonitoring`(factory + 키 + **V72** 백필) | 완료 |
| 스냅샷 캐시(30초) · snapshotId(60초) · STALE_CACHE 대체(2분) | 완료 |
| dataStatus 등급별 · health UNKNOWN · coverage · 합계 · 정렬/필터/페이지 | 완료 |
| 시계열 RAW / RAW_BUCKETED / HOURLY_TREND · 상한 · gap · TREND 경계 | 완료 |
| OpenAPI(springdoc `@Operation`·`@Schema`) | 완료 |
| 테스트 | GPU 단위 **52** + IT **11**(GpuControllerIT 8 · GpuPermissionBackfillIT 3, 실 DB) 전부 통과 · 전체 스위트 결과 §7 |
| 런타임(dev BE·실 Zabbix) | **미검증** — dev Zabbix에 프리셋 템플릿 없음 |

## 2. 변경 파일

### engine-api (S1 산출물에 추가 — 병렬 작업 영역 아님)
- `engine/model/gpu/GpuHostInventory.java` — 8번째 필드 **`detectedProfiles`** + S1 7-인자 호환 생성자(기본값 = 선택된 프로필 하나, NOT_CONFIGURED면 빈 목록). 어댑터는 수정 없이 컴파일된다.
- `src/main/proto/engine.proto` — `GpuHostInventory.detected_profiles = 8`.
- `common/exception/ErrorCode.java` — `GPU_BAD_QUERY · GPU_SOURCE_UNSUPPORTED · GPU_NOT_FOUND · GPU_SCOPE_TOO_LARGE · GPU_QUERY_TOO_DENSE · GPU_SNAPSHOT_EXPIRED · GPU_SOURCE_UNAVAILABLE`.

### app
- `common/constants/DmovePermissions.java` — `module("monitoring", …, feature("gpuMonitoring", true, canAction, false, true))` + FE 계약 주석(`permissions.gpuMonitoring.view`, `t("gpuMonitoring")`).
- `auth/security/DmovePermissionKey.java` — `GPU_MONITORING`.
- `src/main/resources/db/migration/V72__add_gpu_monitoring_permission.sql` — **Flyway V72**(V71은 다른 워크트리 선점, §3). 저장된 역할 JSON 멱등 이관.
- `premium/gpu/` (신규 19파일)
  - 루트: `GpuController` · `GpuAccessChecker` · `GpuScope` · `GpuParams` · `GpuErrors` · `GpuLimits` · `package-info`
  - `snapshot/`: `GpuSnapshotService` · `GpuSnapshotAssembler` · `GpuSnapshot` · `GpuValuePolicy` · `GpuCapabilityTier` · `GpuRowDto` · `GpuValueDto` · `GpuMetadataDto` · `GpuCoverageDto`
  - `list/`: `GpuQueryService` · `GpuListQuery` · `GpuListPayloadDto`
  - `detail/`: `GpuDetailService` · `GpuDetailPayloadDto` · `GpuDiagnosticsPayloadDto`
  - `series/`: `GpuSeriesService` · `GpuSeriesPayloadDto`
- 테스트 `src/test/java/com/dmove/moveseye/premium/gpu/`: `GpuFixtures` · `GpuAccessCheckerTest`(5) · `GpuControllerIT`(8) · `list/GpuQueryServiceTest`(10) · `list/GpuListQueryTest`(3) · `snapshot/GpuValuePolicyTest`(6) · `snapshot/GpuSnapshotAssemblerTest`(2) · `snapshot/GpuSnapshotServiceTest`(8) · `detail/GpuDetailServiceTest`(4) · `series/GpuSeriesServiceTest`(14, Nested 4) · `user/GpuPermissionBackfillIT`(3)

`zabbix-presets/**` · `common/zabbixpreset/**` · `engine-zabbix/.../zabbix/gpu/**`는 건드리지 않았다.

## 3. Flyway 번호

**V72** `V72__add_gpu_monitoring_permission.sql`. 처음엔 V71로 썼으나(이 워크트리 최신이 V70) **다른 워크트리 `C:\worktrees\apm-c05-followup`가 `V71__apm_alert_event_open_unique.sql`을 선점**해 있었다 — 공유 IT DB(`moveseye_it`)에 그쪽 V71이 적용되면서 전체 스위트에서 `Migration checksum mismatch for migration version 71`로 컨텍스트가 죽어 드러났다. V72로 옮겼다. 🔴 병합 순서에 따라 또 겹칠 수 있다 — 병합 직전 `ls db/migration`으로 재확인하고, 바꾸면 `GpuPermissionBackfillIT`의 `MIGRATION` 상수·`version='72'` 두 곳을 같이 고친다(SQL 내용은 번호 의존 없음).

값 규칙: view·download는 **같은 역할의 `monitoring/serverMonitoring` 값을 따른다**(설계 §12), edit·delete=false. serverMonitoring 칸이 없거나 값이 boolean이 아니면 false. 빈 객체 행·모듈 없음·모듈 두 벌(첫 모듈에만) 모두 처리, 재실행 멱등.

## 4. 설계와 다르게 한 결정 — 이유

| # | 설계/지시 | 실제 | 이유 |
|---|---|---|---|
| D1 | 수집 등급별 필수 지표(§11.2 2번) — 등급 내용 미정 | `CORE_TELEMETRY`=활동률·VRAM used/total·온도·전력(기존 5종), `EXTENDED_DCGM`=+memory.activity·clock.sm·clock.memory. DCGM 프리셋만 EXTENDED, 공식·smi·UNKNOWN은 CORE | DCGM 프리셋 템플릿이 이 셋을 기본 수집한다(`zabbix-presets/gpu-dcgm-http`). PCIe는 DCGM 프로파일링 지표라 GeForce에서 빠질 수 있어 필수에서 제외 |
| D2 | AlertPort로 귀속 가능하면 정확 귀속 | **AlertPort를 부르지 않고 전 GPU health=UNKNOWN** | `Alert`·`AlertRule`에 트리거↔아이템(UUID) 관계가 없다(호스트 `entities`만). 이름 매칭 금지라 확신할 수 있는 귀속 경로가 없다. 부르지 않으니 소스 부하도 0. 관계가 생기면 `GpuValuePolicy.health()` 한 곳만 바꾸면 된다(어댑터 요청 R2) |
| D3 | REMOVED 24시간 기억 캐시(P1 §6, S1이 app 몫으로 넘김) | **미구현** | 어댑터는 LLD 잔존 아이템이라는 직접 증거로 REMOVED를 준다. LLD가 아이템까지 지운 GPU는 기본 목록에 원래 안 보이고(REMOVED 제외), 상세 URL로 들어오면 NOT_FOUND다. 영향은 "사라진 GPU의 마지막 관측 안내" 하나라 후속으로 미룸(§6) |
| D4 | 진단 `adminDetails.items[]`(itemId·key·enabled·sourceState·sanitizedError) | `adminDetails.diagnostics[]`(reasonCode·actionCode·gpuUuid·metric·**정제된 detail**) | 엔진 계약이 app에 Zabbix 아이템을 넘기지 않는다(app이 Zabbix 키를 알면 안 된다). 아이템 수준이 필요하면 중립 모델로 엔진에 추가해야 한다(R5) |
| D5 | STALE_CACHE의 generatedAt/cachedAt 의미 미정 | generatedAt = 강등 스냅샷을 만든 시각, **cachedAt = 원래 데이터를 읽은 시각**. 강등 스냅샷은 **새 snapshotId**이고 30초 포인터 캐시에 넣지 않는다 | 과거 정상 id를 변조하지 않는다(계약). 포인터에 넣지 않아 소스가 회복되면 다음 요청이 바로 새로 읽는다 |
| D6 | snapshot 캐시 키 = source+principal+권한 revision+scope | Redis 키 3종: `gpu:snap:v1:{src}:{principal}:{hostsetHash}`(포인터, `RedisCache.getOrLoad`, 30초) · `gpu:sid:v1:{id}`(본문, 60초) · `gpu:last:v1:…`(마지막 완전, 120초). principal = 사용자 id·역할·Zabbix userid·caller role, 권한 revision 대신 **허용 호스트 집합 해시** | 역할 revision이 코드에 없다(설계 §10이 허용한 대안). 포인터 값은 `SnapshotPointer` record — IT의 Redis 대역이 `get(…, String.class)`를 전부 visitor id로 답해서 String을 그대로 두면 오동작한다(실제로도 같은 키를 String으로 읽는 경로와 섞이지 않게) |
| D7 | collectionSummary.unknownHostCount 정의 미정 | COLLECTION_ERROR 호스트 + **소스가 돌려주지 않은 호스트** | 범위엔 있는데 결과에 없는 호스트를 어디에도 안 세면 네 칸 합이 hostCount와 안 맞는다 |
| D8 | VRAM 집계 "OK used/total 쌍 같은 GPU 집합" | OK `vram.usedPct`(어댑터가 시각 차이·total>0 검증한 파생값)를 가진 GPU의 **Σused/Σtotal×100** | 같은 GPU 집합의 분모·분자를 보장하는 가장 단순한 조건. GPU별 비율 평균은 큰 카드와 작은 카드를 같은 무게로 친다 |
| D9 | 정렬 값 미정 | 숫자 정렬은 값이 있으면(OK·**STALE**) 그 값. 합계는 OK만 | 화면에 보이는 숫자와 정렬 순서가 어긋나지 않게. STALE_CACHE에서 전 행이 STALE이어도 정렬이 동작 |
| D10 | 시계열 state `UNSUPPORTED` | P1 구현에서 나오지 않는다 | 엔진 시계열 품질(`SeriesQualityState`)에 미지원 구분이 없다. 현재 미지원은 상세·진단으로 본다 |
| D11 | TREND의 null 버킷 | 완료 시간에 데이터가 일부 없으면 null 버킷 + NO_DATA gap(연속 구간 한 줄). **전부 없으면 points=[] + gap 한 줄**, state NO_DATA | 720개 null 버킷을 늘어놓지 않는다 |
| D12 | RAW 중복 시각 | 같은 초의 점은 마지막 값 하나 | 엔진 `SeriesPoint`가 초 단위라 ns 구분이 없다. 계약 "중복 없음"을 지키는 가장 단순한 규칙 |
| D13 | 숫자 파라미터 바인딩 | page·pageSize·from·to를 **String으로 받아** `GpuParams`가 해석 | Spring 바인딩 실패는 전역 처리기의 범용 오류가 되어 FE가 `GPU_BAD_QUERY`로 분기할 수 없다 |
| D14 | 명시 hostGroupId 범위 | 보이는 호스트가 없으면 **빈 목록**(NOT_FOUND 아님) | 그룹은 "없음/권한 없음/GPU 없음"을 구분할 수 없고, 빈 결과가 존재를 노출하지도 않는다. 명시 hostId만 NOT_FOUND |
| D15 | 호스트 청크 동시 2·타임아웃 10/20초(설계 §10) | app에서 구현 안 함 | 청크·호출은 어댑터 안의 일이다(S1이 ZM-159 호출 정책으로 처리). app은 포트 1회 호출 |
| D16 | `MetricPort.querySeriesChecked` 신설(P1 §5.3) | S1 결정대로 `querySeriesResult`(RAW) + `queryTrend`(TREND) 재사용 | 수집 경로 설계 §11.1에서 폐기 확정 |
| D17 | `GpuValuePolicy` "서비스" | 순수 static 유틸 | 상태 없는 표 계산이라 빈일 이유가 없다(테스트가 표로 확인) |

## 5. 어댑터 요청 (직접 고치지 않음)

| # | 요청 | 왜 | 지금 동작 |
|---|---|---|---|
| R1 | `ZabbixGpuInventoryAdapter.chooseProfile()`의 `candidates`를 `GpuHostInventory` **8-인자 생성자의 `detectedProfiles`**로 넘긴다(`new GpuHostInventory(…, diagnostics, List.copyOf(candidates))`) | 진단 응답 `detectedProfiles`(§6.4·§15) | 7-인자 생성자 기본값 = 선택된 프로필 하나. MULTIPLE_PROFILES 진단이 붙어도 목록엔 하나만 보인다 |
| R2 | (engine-api) GPU 이벤트 귀속 관계 — `Alert`에 트리거가 참조하는 아이템의 `MetricRef`(GPU UUID 차원) 또는 UUID 태그 | health ALERT/NO_ACTIVE_ALERT·activeGpuEventCount | 전 GPU health=UNKNOWN |
| R3 | `queryTrend`의 GPU 품질 — 아이템 없음/단위 거부/무효 버킷 수 | TREND의 ERROR(UNKNOWN_UNIT)와 invalidPointCount | TREND는 invalidPointCount=null, 단위 거부도 NO_DATA |
| R4 | 아이템 보존 설정(history·trends 일수, 매크로·housekeeping override 해석) + `nvmlVersion`(`nvml.version`) | 상세 retention·시계열 effective*Days·metadata.nvmlVersion | 항상 null + `RETENTION_UNKNOWN` |
| R5 | (선택) 관리자 진단용 중립 아이템 상태 목록(키는 정제, 오류 문구는 정제) | 초안 `adminDetails.items[]` | 엔진 진단 설명만 |
| R6 | 모델·시리얼 아이템 읽기(병렬 작업 중) | 목록 model·label, metadata.serialNumber | 작업 완료되면 app은 수정 없이 반영된다(`GpuDevice.model`·`metadata.serial` 그대로 사용) |

## 6. 못 한 것 · 확인 필요

| # | 내용 | 넘길 곳 |
|---|---|---|
| N1 | 런타임(dev BE + dev Zabbix) 미검증 — 프리셋 템플릿이 dev에 없다 | S0 5단계 이후 functional-qa |
| N2 | REMOVED 24시간 기억(D3) | 후속(필요 시 `gpu:seen:v1:{principal}:{hostId}` 24h 키로) |
| N3 | 사용자별 캐시 상한/eviction — Redis TTL(30/60/120초)만 있다 | S5 부하 시험에서 메모리 측정 후 |
| N4 | 강등(STALE_CACHE) 판정 시 "권한 재통과" — 바인딩 비교(principal·호스트 집합)로 대신했다. 같은 사용자·같은 범위면 통과 | 의도된 동작 |
| N5 | `DataSourceRegistry`에 GPU 포트 미등록(S1 D9 그대로) | 실소비자 없음 |
| N6 | FE 권한 편집 화면·메뉴 검색·모바일 메뉴의 `gpuMonitoring` 라벨(i18n) | S3(FE) |

## 7. 테스트 수치

- GPU 단위: **52 / 실패 0** (`premium.gpu.*` 중 IT 제외)
- IT(실 DB 5433): `GpuControllerIT` **8 / 0**, `GpuPermissionBackfillIT` **3 / 0**, 회귀 `DmovePermissionBackfillIT` 2 / 0
- 전체 스위트(`:test` + `:engine-zabbix:test`, 2026-10-08): app **4669건 · skip 4 · 실패 174**, engine-zabbix **341 / 0**.
  - 실패 174건은 **16개 IT 클래스**(APM IT 14 · `ZabbixSyncStatusLockIT` · `GpuControllerIT`)에 몰려 있었고 원인은 전부 공유 IT DB였다: 다른 워크트리(`apm-c05-followup`)가 같은 `moveseye_it`에 자기 V71을 적용 → 이 워크트리의 V71과 `checksum mismatch`로 컨텍스트 로드 실패, 그리고 그쪽의 DB drop/create와 겹쳐 `truncate table license`가 `bad SQL grammar`(테이블 없음). 코드 회귀가 아니다.
  - V72로 옮긴 뒤 그 16개 클래스 + GPU 전체 + `FlywayMigrationSmokeIT`를 다시 돌려 **245 / 실패 0**.
  - ⚠️ 그 재실행은 전체 스위트가 아니다. 커밋 전에는 다른 워크트리가 IT를 돌리지 않을 때 전체 `:test`를 한 번 더 권장(메모리 노트: IT DB는 워크트리 간 공유라 동시 실행 시 가짜 실패).

## 8. S3(FE)에 넘기는 메모

### 엔드포인트
- `GET /gpu/devices?hostGroupId=&hostId=&q=&model=&dataStatus=&page=1&pageSize=25&sortBy=hostName&sortOrder=asc&snapshotId=`
- `GET /gpu/devices/detail?hostId=10&gpuUuid=GPU-…`
- `GET /gpu/devices/series?hostId=10&gpuUuid=GPU-…&from=<ms>&to=<ms>&metrics=utilization,vram.used,vram.total,temperature,power.draw&resolution=AUTO`
- `GET /gpu/hosts/diagnostics?hostId=10`
- 🔴 metric 키는 점 표기(`vram.used`) — TS에서 `metrics['vram.used']`. gpuUuid는 URL 인코딩, 대소문자 그대로.
- 권한: `permissions.gpuMonitoring.view`(useAuth 평탄화). 역할 편집 화면 라벨 `t("gpuMonitoring")`(모듈 `monitoring` 안).

### 예시 응답(목록, 형태 예시)
```json
{ "status": "success", "code": 200, "data": {
  "sourceId": "zabbix-default", "snapshotId": "3f1c…", "generatedAt": 1791451800000, "cachedAt": null,
  "completeness": "COMPLETE", "sourceErrorCode": null,
  "scope": { "hostCount": 1, "gpuCount": 1, "matchedCount": 1 },
  "collectionSummary": { "configuredHostCount": 1, "noGpuHostCount": 0, "unconfiguredHostCount": 0, "unknownHostCount": 0 },
  "page": 1, "pageSize": 25, "total": 1,
  "rows": [ { "sourceId": "zabbix-default", "hostId": "10", "gpuUuid": "GPU-f464…", "hostName": "gpu-node-1",
    "label": "GPU-f464…", "model": null, "physicalKind": "PHYSICAL", "discoveryState": "PRESENT",
    "collectionProfile": "MOVESEYE_NVIDIA_SMI_V1", "capabilityTier": "CORE_TELEMETRY",
    "lastSeenAt": 1791451770000, "dataStatus": "CURRENT", "health": "UNKNOWN",
    "activeGpuEventCount": null, "hostEventsAvailable": true,
    "metrics": { "utilization": { "value": 0, "textValue": null, "unit": "%", "observedAt": 1791451770000,
                 "status": "OK", "reasonCode": null, "expectedHeartbeatSeconds": 60 }, "…": "16종" } } ],
  "totals": { "currentCount": 1, "partialCount": 0, "staleCount": 0, "unavailableCount": 0,
    "utilization": { "value": 0, "observedCount": 1 }, "vramUsedPct": { "value": 2.1, "observedCount": 1 },
    "powerDraw": { "value": 9.8, "observedCount": 1 }, "activeGpuEventCount": null } } }
```
(프리셋 1.0은 모델명을 아직 못 읽어 `model:null`, `label`=UUID — R6 완료 후 채워진다.)

### 빈 상태 7종(설계 §11) — 판정 축
| 상태 | 판정 |
|---|---|
| NO_GPU | 진단 `collectionState=NO_GPU` / 목록 `collectionSummary.noGpuHostCount` |
| NOT_CONFIGURED | `collectionState=NOT_CONFIGURED`(진단 사유 `PRESET_TAG_MISSING` 등 함께) |
| NO_DATA | 값 `status=NO_DATA`(사유 `NOT_COLLECTED_YET`·`ITEM_MISSING`…) / 시계열 `state=NO_DATA` |
| UNSUPPORTED | 값 `status=UNSUPPORTED`(사유 `SOURCE_UNSUPPORTED`·`NOT_PROVIDED_BY_PROFILE`·`VALUE_NOT_AVAILABLE`) |
| SOURCE_ERROR | errorCode `GPU_SOURCE_UNAVAILABLE`(body 503) 또는 `completeness=STALE_CACHE` 배너(`sourceErrorCode`) |
| NO_PERMISSION | body `code:403`, `errorCode:"FORBIDDEN"` — 기존 권한 UX |
| FEATURE_LOCKED | `errorCode:"LICENSE_FEATURE_REQUIRED"`(body 402) — 기존 라이선스 UX |

### 그 외
- snapshotId: 목록 응답의 id를 page 이동에만 넘기고, 필터·정렬 변경·30초 갱신은 생략(page 1). `GPU_SNAPSHOT_EXPIRED`면 생략하고 page 1 재조회.
- `GPU_SCOPE_TOO_LARGE`면 호스트 그룹 선택을 요구하는 안내(설치본 호스트가 200 넘으면 첫 화면부터 이 오류가 난다 — 그룹 필터를 기본으로 두는 것을 검토).
- health는 항상 UNKNOWN → 이벤트 칸은 "호스트 이벤트 보기" 링크(`hostEventsAvailable`)만.
- 시계열 TREND의 `boundaryPartial` 버킷은 t가 effectiveFrom보다 앞설 수 있다 — x축은 effectiveFrom~effectiveTo로 자르고 툴팁에 원래 시간을 보여 준다. `CURRENT_BUCKET_INCOMPLETE` gap은 "집계 중" 표시.
- invalidPointCount는 null일 수 있다(TREND).

## 9. 검수 반영 (2026-10-08, 커밋 `5dc84ee` 위 · 미커밋)

근거: `_archive/features/premium/gpu-monitoring/review_gpu-p1_codex-be.md`(코덱스 BE, 조건부 승인) app 범위 🟡 3건 + FE 검수 🟡5 후속 1건. 🟡1(`detectedProfiles` 후보 전체)·🟡3·🟡5는 engine 범위라 다른 에이전트 몫 — app은 `GpuHostInventory.detectedProfiles`를 그대로 통과시키므로 수정 없음.

| 검수 | 반영 | 파일 |
|---|---|---|
| 🟡2 REMOVED 24시간 기억 미구현(D3·N2) | **구현.** `GpuRemovedMemory` — Redis `gpu:seen:v1:{source}:{hostId}`(TTL 24h). **성공한 발견끼리만** 비교(호스트 `CONFIGURED`+발견 UNKNOWN 장치 없음, 또는 `NO_GPU`). 이전 PRESENT인데 이번 성공 발견에 없는 GPU → `REMOVED`, `lastSeenAt`=마지막 관측, 16종 현재값 `NO_DATA/DEVICE_REMOVED`, 마지막으로 보인 때(`seenAt`)부터 24h. 재발견 → PRESENT. 소스 실패(불완전·예외)는 `load()`에서 먼저 끊겨 병합 단계에 오지 않고, `COLLECTION_ERROR`·`NOT_CONFIGURED`·UNKNOWN 장치 호스트는 기억을 읽지도 고치지도 않는다. 엔진이 이미 REMOVED로 준 장치는 중복 행을 만들지 않는다. 목록은 기존대로 REMOVED 제외, 상세·진단은 REMOVED로, 시계열은 소스에 남은 history만 | `premium/gpu/snapshot/GpuRemovedMemory.java`(신규) · `GpuSnapshotService.java`(load에서 merge, 저장소 어댑터) · 테스트 `GpuRemovedMemoryTest`(5: 24h 유지·만료, 재발견 PRESENT, 실패·수집오류 무전환, 상세 노출/목록 제외, 성공 판정 표) |
| 🟡4 V72 `features`가 배열이 아닌 역할 | **모든 `features` 접근을 `CASE WHEN jsonb_typeof(...)='array' THEN ... ELSE '[]'::jsonb END`로 정규화**(③에서 붙일 때 배열이 아니던 값은 빈 배열로 교체). 다른 모듈의 비정상 값은 건드리지 않음 | `V72__add_gpu_monitoring_permission.sql` · `GpuPermissionBackfillIT`(+1: `{}`·문자열·JSON null 세 형태 + 재실행 멱등, 조회 헬퍼도 정규화) |
| 🟡6 Zabbix URL 미설정 새 설치 | `JwtAuthFilter.resolveAuthToken` — 관리자 슈퍼어드민 토큰 확보가 `ApiError`(URL 미설정 등 설정 부재)면 **요청을 죽이지 않고 Zabbix 토큰 없이 진행**(프로세스당 첫 1회 WARN, 이후 DEBUG). `UnauthorizedError`(잘못된 비밀번호 등)는 기존대로 401 경로. 결과: `@LicenseExempt` 라이선스 조회·등록, 설정 저장이 열리고 Zabbix 의존 EP는 그 시점에 세션 프로바이더·클라이언트가 같은 원인 오류를 낸다 | `auth/security/JwtAuthFilter.java` · `LicenseControllerIT.freshInstallWithoutZabbixUrlCanRegisterLicense`(+1: URL 미설정 상태에서 admin `GET /features`=success·LOCKED, `POST /settings/license`=success·FULL) |
| FE 🟡5 설치 안내 고정 환경값 | `guideContext`에 `dcgmPort`(9400)·`dcgmCountersDir`(`/etc/dcgm-exporter`)·`agentConfDir`(`/etc/zabbix/zabbix_agent2.d`)·`agentScriptDir`(`/usr/local/bin`). 값은 `GpuSetupService` 상수 한 곳(`SMI_SCRIPT_PATH`도 `AGENT_SCRIPT_DIR`에서 조립). 계약 §11.1에 "고정값(기본)" 표 | `premium/gpu/setup/GpuSetupService.java` · `GpuSetupOverviewDto.java` · `GpuSetupServiceTest.guideContextFixedEnvironmentValues`(+1) |

⚠️ **샌드박스 DB 체크섬**: V72 내용을 고쳤다(미배포 브랜치라 허용). 이미 V72를 적용한 **dev74(5434)·dev70s(5435)** 는 기동 시 `checksum mismatch`가 난다 → `flyway repair` 또는 DB 재생성. (공유 IT DB `moveseye_it`은 매 실행 drop&create라 영향 없음.)

**후속 티켓(문서로만)**: JWT 인증과 Zabbix 세션 해석의 **lazy 분리** — 지금은 관리자 요청마다 필터가 슈퍼어드민 토큰을 미리 확보하고 실패를 삼키는 최소 수정이다. Zabbix 토큰이 필요한 EP에서만(세션 프로바이더) 해석하도록 옮기면 필터의 Zabbix 의존이 사라지고, URL 미설정·Zabbix 다운 시 관리자 요청 지연(타임아웃 대기)도 없어진다. 일반 사용자 경로(Redis 개인 토큰·락 재시도)도 같은 이동 대상.

**검수 반영 테스트**: `:test --tests "*Gpu*" --tests "*JwtAuth*" --tests "*License*"` → **232 / 실패 0 / skip 0**(실 DB IT 포함). 그중 신규·변경: `GpuRemovedMemoryTest` 5 · `GpuPermissionBackfillIT` 4(+1) · `LicenseControllerIT` 20(+1) · `GpuSetupServiceTest` 10(+1). 전체 스위트는 다시 돌리지 않았다(engine 쪽 병렬 수정 진행 중).
