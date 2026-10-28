# GPU P1 S1 — 엔진 계층 구현 (ZM-78)

작성: Claude(be-engineer) · 2026-10-07, **2차 갱신 2026-10-08**(프리셋 식별 아이템·P-state 정규화·공식 플러그인 실측 반영 — §7) · **3차 갱신 2026-10-08**(NVML_PLUGIN 프로필 최종 확정 — §8) · 워크트리 `C:\worktrees\zm-78-be`(브랜치 `ZM-78`, master `fd4fcfb` 기준) · **미커밋**

설계 정본: `features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md` v1.0(§6·§9·§11.3·§15) · `features/premium/gpu-monitoring/devdesign_gpu-monitoring-p1.md`(§4·§5·§6) · 실측 `features/premium/gpu-monitoring/gpu-p1-source-profile.md`.

## 1. 결과 요약

| 영역 | 상태 |
|---|---|
| engine-api: `MetricDomain.GPU`, `GpuInventoryPort`, `engine/model/gpu/*`(모델 13 + 상수 3), `SeriesQuality`·`SeriesResult.qualities` | 완료 |
| engine-zabbix: `ZabbixGpuInventoryAdapter`, GPU 키 표·엄격 해석·주기·발견 파서, 카탈로그 GPU 15종×2계열, 시계열 GPU 분기 | 완료 |
| app: `LicenseGuardedGpuInventoryPort` + 라이선스 테스트 3종 갱신(A6 신설) | 완료 |
| proto(`engine.proto`) 동기화 | 완료 — `QuerySeriesResult` rpc(ZM-159에 Java만 있던 것)도 함께 |
| 테스트 | `:engine-zabbix:test` **357 / 실패 0**(GPU 77, 8차 갱신 후) · app `*License*` 외 **120 / 실패 0**(IT 포함, DB 있음) · engine-api는 테스트 없음(모듈 관례) |

변이 확인 1회: 이력 0 원문 판정을 끄면 5건이 실패한다(테스트가 그 규칙을 실제로 잡는다).

## 2. 변경 파일

### engine-api
- `engine/model/metric/MetricDomain.java` — `GPU` 추가(exhaustive switch 소비처 없음 확인: `CpuService`의 `case SYSTEM`은 다른 enum)
- `engine/model/metric/SeriesResult.java` — 5번째 필드 `qualities`(선택 목록). 4-인자 생성자·`complete(series)`·`truncated(series, reason)` 호환 유지 + 품질 받는 오버로드 2개
- `engine/model/metric/SeriesQuality.java`, `SeriesQualityState.java` — 신규
- `engine/port/GpuInventoryPort.java` — 신규, `snapshot(SourceRef, CallerContext, List<EntityRef>)`
- `engine/model/gpu/` 신규: `GpuInventorySnapshot` · `GpuHostInventory` · `GpuDevice` · `GpuDeviceMetadata` · `GpuObservation` · `GpuDiagnostic` · `GpuSnapshotFailure` · enum `GpuCollectionProfile` · `GpuCollectionState` · `GpuDiscoveryState` · `GpuPhysicalKind` · `GpuMigMode` · `GpuMetricStatus` · `GpuEvidence` · 상수 `GpuMetrics` · `GpuReasonCodes` · `GpuActionCodes`
- `src/main/proto/engine.proto` — `GPU = 9`, `SeriesQuality(State)`·`SeriesResult`·`QuerySeriesResult`, GPU 메시지·enum(값에 `GPU_*` 접두어 — proto3 enum 값 패키지 스코프 충돌 회피)·`service GpuInventoryPort`
- `README.md` — 포트 표

### engine-zabbix
- `zabbix/gpu/ZabbixGpuInventoryAdapter.java` — 포트 구현(신규)
- `zabbix/gpu/GpuKeyFamily.java` — **GPU 키 정본**(공식 `nvml.*` / 프리셋 `moveseye.gpu.*`)
- `zabbix/gpu/GpuValues.java` — 엄격 해석·P-state·단위 배율
- `zabbix/gpu/GpuIntervals.java` — 기대 주기(매크로·dependent·heartbeat 전처리)·이력 유무
- `zabbix/gpu/GpuDiscoveryParser.java` — 발견 JSON(필드 별칭 정규화)
- `zabbix/gpu/model/ZabbixGpuItem.java` — GPU 전용 item.get DTO(`ZabbixBasicItem` 불변)
- `zabbix/metric/ItemKeyParser.java` — Zabbix 아이템 키 파서(신규, 따옴표·이스케이프·배열)
- `zabbix/metric/ZabbixMetricCatalog.java` — `registerGpu()`, GPU dimension source, `resolve()`의 `collectionProfile` 필터
- `zabbix/metric/ZabbixMetricAdapter.java` — GPU 셀만: 엄격 해석·단위 환산·품질 목록, `queryTrend` 환산, `queryLatest`/`queryLatestFamily`에 GPU면 BAD_QUERY, `listDimensions(GPU)`
- `README.md`, `CLAUDE.md`(GPU 교훈 표)
- 테스트: `gpu/ZabbixGpuInventoryAdapterTest`(41, Nested 포함) · `gpu/GpuValuesTest`(5) · `gpu/FakeGpuZabbixApi` · `gpu/GpuItemBuilder` · `metric/ItemKeyParserTest`(5) · `metric/ZabbixMetricAdapterGpuTest`(11)
- fixture: `src/test/resources/gpu/rtx5070-moveseye-nvidia-smi.json`(프리셋 1.0 형태 — LLD 규칙·이력 0 원문·템플릿 매크로·식별 아이템, serial `0`→UNSUPPORTED), `rtx5070-moveseye-dcgm-http.json`(2차 신규 — DCGM exporter 실측 원문 기반, serial 아이템 없음), `rtx5070-nvml-plugin.json`(3차: **공식 템플릿 7.4.15 실 아이템 42개 원문**으로 교체)

### app
- `license/integration/LicenseGuardedGpuInventoryPort.java` — `@Primary`, `@Qualifier("zabbixGpuInventoryAdapter")`, `LiveQueryGuard.check`
- 테스트: `LicenseGuardedPortTest`(리플렉션 대상에 GPU 포트 + EXPIRED 1회 위임/ARCHIVED 0회 호출) · `LicenseGateIT`(컨텍스트에서 주입되는 것이 데코레이터인지) · `LicenseArchitectureTest` **A6 신설**(원본 GPU 어댑터 빈 이름을 `@Qualifier`로 지목하는 곳은 데코레이터 생성자 하나 — 대조군 포함)

`src/main/resources/zabbix-presets/`·`common/zabbixpreset/`는 건드리지 않았다(병렬 에이전트 영역, 읽기만 함).

## 3. 설계와 다르게 결정한 것 — 이유

| # | 설계/지시 | 실제 | 이유 |
|---|---|---|---|
| D1 | 호스트 100개 청크 | **min(100, item.get·host.get 호출 정책 max-ids)** → 기본값에서 **50** | ZM-159 호출 정책(`zabbix.call.policy.item.get.max-ids` 기본 50)을 GPU만 우회하지 않는다. 설정으로 올리면 100까지 |
| D2 | 발견은 `moveseye.gpu.discovery` 마스터 **아이템**의 JSON(P1 §5.2 4번) | **두 형태 모두** 지원: ① 발견 JSON 아이템(이력 보존) ② **LLD 규칙**(규칙 상태 + 아이템 `itemDiscovery.status`로 PRESENT/REMOVED) | 병렬로 만들어진 프리셋 1.0 템플릿에서 `moveseye.gpu.discovery`는 LLD 규칙이고, JSON은 이력 0인 중간값(`*.parsed`)이라 읽을 수 없다. ①만 구현하면 프리셋 호스트 전부가 "발견 없음 · 장치 UNKNOWN"이 된다. ②는 처음엔 모델명을 몰랐으나 **2차에서 프리셋 식별 아이템으로 해소**(§7) |
| D3 | 매크로·유연 주기는 해석 불가 → STALE(INTERVAL_UNKNOWN) | **단일 매크로는 해석**(호스트 → 직접 연결 템플릿 → 전역). 유연/예약 주기·컨텍스트 매크로·중첩 템플릿 매크로·템플릿 간 값 충돌만 해석 불가 | 프리셋 원문 주기가 `{$MOVESEYE.GPU.INTERVAL}`이라 설계대로면 **프리셋 값 전부가 STALE**이 된다. 필요할 때만 `usermacro.get` 묶음당 1회 + 전역 스냅샷당 1회 |
| D4 | 원문 체인의 미수신·오래됨 전파(P1 §6) | **이력을 남기는 원문만** 수집 시각으로 판정, 이력 0 원문은 상태(꺼짐·오류)만 전파 | Zabbix는 이력 0 아이템의 lastclock을 0으로 준다. 프리셋의 `*.raw`·`*.parsed`가 이력 0이라 그대로 적용하면 **모든 지표가 MASTER_NO_DATA**(변이 확인으로 5건 실패 재현) |
| D5 | `GpuHostInventory(…, devices, diagnostics)` | `observations` 필드 추가(장치 × 16종, `gpuUuid` 차원) | "포트 하나 · 모델 둘(식별/관측)"을 지키려면 관측을 `GpuDevice` 밖에 둬야 한다. `observationsOf(uuid)`·`observation(uuid, name)` 헬퍼 제공 |
| D6 | `SeriesQuality(metricRef, invalidPointCount, state, reasonCode)` | `entity` 추가, `state`는 enum `SeriesQualityState`(CLEAN·INVALID_POINTS_DROPPED·NO_SERIES·REJECTED) | 한 쿼리에 여러 엔티티가 올 수 있어 metricRef만으로는 계열이 특정되지 않는다. enum은 §D5 규칙 |
| D7 | — | `GpuMetrics.DIM_COLLECTION_PROFILE` 차원 신설: 관측의 `MetricRef`에 프로필을 싣고, 카탈로그가 그 계열 키만 해석 | 폴백 체인(첫 히트)은 다중 프로필 호스트에서 스냅샷이 고른 프로필과 다른 계열의 이력을 줄 수 있다(§6.4 혼합 금지). 차원을 빼면 프리셋 → 공식 순 폴백 |
| D8 | — | GPU 도메인의 `MetricPort.queryLatest`/`queryLatestFamily`는 **BAD_QUERY** | 그 경로는 `parseDoubleOrZero` + primitive라 값 상태가 0으로 뭉개진다. GPU 최신값은 스냅샷만 |
| D9 | `DataSourceRegistry.port(GpuInventoryPort)` | **미등록** | 레지스트리 생성자 변경이 필요하고 실소비자가 없다(app은 포트를 직접 주입). S2에서 필요하면 추가 |
| D10 | 프리셋 식별자 `gpu-dcgm-http`·`gpu-nvidia-smi` | 그 둘만 프로필로 인정. `gpu-cluster`는 조용히 무시, 그 외 `gpu-*`는 진단 `UNKNOWN_PRESET` | §16 SNMP 변형(`gpu-nvidia-smi-snmp`)은 합의 전이라 프로필로 받지 않았다 — 생기면 `MOVESEYE_NVIDIA_SMI_V1`로 매핑할지 결정 필요 |

## 4. 다음 증분(S2 app API)에 넘기는 것

### 4.1 포트·모델

```java
GpuInventorySnapshot snapshot(SourceRef src, CallerContext ctx, List<EntityRef> authorizedHosts);
```
- `authorizedHosts`는 **app이 권한으로 좁힌 목록**. 어댑터는 그 밖을 읽지 않는다. 비면 소스 호출 0. 소스가 안 돌려준 호스트(권한 없음·삭제)는 결과에 없다(not-found 처리는 app).
- 주입은 타입으로(`GpuInventoryPort`) — `@Primary` 데코레이터가 들어온다. 🔴 `@Qualifier("zabbixGpuInventoryAdapter")` 금지(A6가 막음).
- 일부 묶음 실패 → `complete=false` + `failures[{hosts, kind, detail}]`(그 호스트는 `hosts`에 없음). 인증 실패는 `EngineException(UNAUTHORIZED)`. 🔴 혼합 totals 금지·이전 완전 스냅샷 재사용(최대 2분)은 app 책임(P1 §10).
- 캐시 없음 → app이 `RedisCache.getOrLoad`로(키에 principal·권한 범위 필수).
- `GpuHostInventory`: `collectionState`(CONFIGURED/NO_GPU/NOT_CONFIGURED/COLLECTION_ERROR) · `collectionProfile` · `discoveredAt` · `devices[]` · `observations[]`(장치 순 × `GpuMetrics.ALL` 16종, 빠짐없음) · `diagnostics[]`.
- `GpuObservation`: `numericValue`/`textValue`는 **OK·STALE에서만** non-null(생성자가 강제). 집계는 `usable()`(=OK + 값)만. `metric.dims`={`gpuUuid`, `collectionProfile`} → 이 `MetricRef`를 그대로 `MetricPort.querySeriesResult`에 넘기면 같은 프로필의 이력.
- REMOVED 24시간 기억은 어댑터가 하지 않는다 — 어댑터는 "LLD가 더 이상 발견하지 못함 / 성공한 발견 JSON에 없음"이라는 **직접 증거**가 있을 때만 REMOVED.
- `GpuPhysicalKind.UNKNOWN`(UUID가 `GPU-`로 시작하지 않음, 예: MIG)은 합계 제외(P1 §7).

### 4.2 시계열
- `MetricPort.querySeriesResult(…, SeriesQuery(entities, [GpuMetrics.ref(name, uuid, profile)], range, rollup))`. `vram.usedPct`·차원 없는 GPU 참조는 BAD_QUERY.
- `result.qualities()`: GPU 셀마다 1개. `INVALID_POINTS_DROPPED`(버린 수 `invalidPointCount`) · `NO_SERIES`(아이템 없음) · `REJECTED`(UNKNOWN_UNIT, 포인트 0). 기존 도메인은 빈 목록.
- `queryTrend`도 GPU 단위 환산은 하지만 품질 목록을 실을 자리가 없다(`TrendSeries` 불변) — 모르는 단위면 빈 버킷.
- P1 §4 차트 허용 목록(P-state·ECC 제외)·RAW/TREND 경계·`QUERY_TOO_DENSE`는 app 몫.

### 4.3 사유 코드(`GpuReasonCodes`)
관측: `DEVICE_REMOVED` · `HOST_DISABLED` · `ITEM_DISABLED` · `MASTER_DISABLED` · `SOURCE_UNSUPPORTED` · `VALUE_NOT_AVAILABLE` · `METRIC_ABSENT` · `NOT_PROVIDED_BY_PROFILE` · `ITEM_ERROR` · `MASTER_ERROR` · `MASTER_STATE_UNKNOWN` · `AMBIGUOUS_ITEM` · `UNKNOWN_UNIT` · `INVALID_NUMBER` · `ITEM_MISSING` · `NOT_COLLECTED_YET` · `MASTER_NO_DATA` · `VALUE_STALE` · `MASTER_STALE` · `INTERVAL_UNKNOWN` · `DERIVED_INPUT_UNAVAILABLE` · `DERIVED_TOTAL_INVALID` · `DERIVED_TIME_SKEW`
(2차 추가) 관측: `INVALID_PSTATE` · (4차 추가) `PREPROCESSING_FAILED`
진단: `MULTIPLE_PROFILES` · `PRESET_TAG_MISSING` · `UNKNOWN_PRESET` · `DISCOVERY_ITEM_MISSING` · `DISCOVERY_FAILED` · `DISCOVERY_INVALID` · `DEVICE_COUNT_MISMATCH` · `UNIDENTIFIED_DEVICE` · `DEVICE_MODEL_UNAVAILABLE` · `MIG_DETECTED_UNSUPPORTED`
조치(`GpuActionCodes`): `NONE` · `CHECK_ITEM_ERROR` · `ENABLE_COLLECTION` · `LINK_PRESET_TEMPLATE` · `REMOVE_DUPLICATE_COLLECTION` · `CHECK_DISCOVERY` · `CHECK_TEMPLATE_UNITS` · `WAIT_FOR_COLLECTION`
- 어댑터 테스트가 "내는 코드 ⊆ 상수"를 확인한다. 진단 `detail`은 정제 문구(소스 오류 원문·주소를 싣지 않음 — 테스트로 확인).

### 4.4 값 상태 판정 순서(실제 구현)
REMOVED → 호스트 꺼짐 → 중복 활성 아이템(AMBIGUOUS) / 전부 꺼짐(ITEM_DISABLED) → 원문 꺼짐 → 자기 오류(허용 목록 미지원 표식이면 UNSUPPORTED, 아니면 ITEM_ERROR) → 값이 N/A 표기 → 원문 상태 불명·오류 → 단위 → 미수신(자기 → 원문, 원문은 이력 있을 때만) → 숫자 아님 → 주기 불명(STALE·값 유지) → 기한 초과 → 원문 오래됨 → OK.
- 프로필이 원래 안 주는 지표(nvidia-smi의 PCIe)는 아이템이 없어도 NO_DATA가 아니라 `UNSUPPORTED/NOT_PROVIDED_BY_PROFILE`.

## 5. 못 한 것 · 확인 필요

| # | 내용 | 영향 | 넘길 곳 |
|---|---|---|---|
| N1 | ~~공식 플러그인 형태 미확인~~ → **3차에서 전부 해소**(§8): 7.4.15 공식 템플릿 export·실 아이템 42개로 저장 키(P1 §4와 동일)·단위·발견(LLD `nvml.device.discovery`)·미지원 문구 확정. 참고로 2차 때의 가정 "`nvml.device.utilization.gpu`는 에이전트 키가 아님"은 사실이었고, 템플릿이 마스터 `nvml.device.utilization`의 dependent로 저장한다. 남은 미확인: 7.2 이하 공식 템플릿 버전 간 차이 | — | — |
| N2 | ~~프리셋 1.0 LLD 경로는 모델명·시리얼·PCI를 읽을 수 없다~~ → **2차 해소**(§7). MIG 모드만 여전히 경로 없음(UNKNOWN) | — | — |
| N3 | Zabbix "Max history display period"(기본 24시간)보다 오래된 lastclock은 API가 0으로 준다 → 하루 넘게 끊긴 지표는 STALE이 아니라 `NOT_COLLECTED_YET`(NO_DATA)로 보인다 | 상태 표시 문구만 다름(값은 어차피 없음) | S2 화면 문구에서 "수신 대기/중단" 함께 표현 |
| N4 | 중첩 템플릿·컨텍스트 매크로·secret 매크로의 주기는 못 푼다 → INTERVAL_UNKNOWN(보수적 STALE) | 해당 고객만 전부 STALE | 실사용 보고되면 `template.get selectParentTemplates` 재귀 추가 |
| N5 | 발견 규칙 경로의 "오래됨" 판정 없음(규칙 상태·원문 상태만) | 에이전트가 조용히 멈추면 발견은 성공으로 보이고 각 지표가 STALE이 된다(값 쪽에서 드러남) | 필요 시 `itemDiscovery.lastcheck` 기한 판정 추가 |
| N6 | app 전체 `:test` 스위트는 돌리지 않았다(라이선스·커버리지·IT 120건만). 컴파일은 전 테스트 소스 통과 | `SeriesResult` 호환 생성자 유지라 기존 소비자 영향 없을 것으로 판단 | 커밋 전 전체 스위트 1회 권장 |
| N8 | (참고, GPU 무관) BE 재기동 직후 첫 호출들이 Zabbix `Session terminated, re-login, please.`로 401 → 재로그인 뒤 정상. 재기동 전에 캐시된 Zabbix 세션을 쓰는 기존 동작 | 재기동 직후 몇 초 GPU 화면이 401일 수 있다 | 기존 세션 캐시 쪽 과제(수정 안 함) |
| N7 | 런타임(dev Zabbix) 미검증 — 프리셋 템플릿이 dev에 아직 없다 | fixture 검증만 | S0 5단계 이후 |

## 6. 프리셋 템플릿 작업과 맞춘 사실(읽기만 함, 2026-10-07 워크트리 기준)

- 지표 키 `moveseye.gpu.<캐노니컬 이름>[{#UUID}]`(따옴표 없음) — 일치.
- 장치 수 키는 `moveseye.gpu.device.count`(처음 가정한 `moveseye.gpu.count`에서 맞춤), 드라이버 `moveseye.gpu.driver.version`.
- 발견 `moveseye.gpu.discovery` = LLD 규칙(dependent of `*.parsed`), 원문 `moveseye.gpu.raw`(nvidia-smi)·`moveseye.gpu.dcgm.raw`(DCGM)와 `*.parsed`는 **이력 0**, 원문 주기 `{$MOVESEYE.GPU.INTERVAL}`(기본 1m).
- 온도 단위 `C`(프리셋 계열에 허용 추가), PCIe `B/s`, VRAM `B`, clock `MHz`, ECC 단위 없음, P-state CHAR `P8`.
- 오류 문구 `MOVESEYE_GPU_UNSUPPORTED`·`MOVESEYE_GPU_METRIC_ABSENT` — 어댑터 판정과 일치(오류 문자열 **포함** 여부로 판정).
- 템플릿에만 있는 `moveseye.gpu.xid.last`·`moveseye.gpu.nvlink.bandwidth`는 캐노니컬 16종 밖이라 읽지 않는다(P1 제외 범위).
- (2차) GPU별 식별 TEXT 아이템 `moveseye.gpu.model[{#UUID}]`·`moveseye.gpu.pci.bus[{#UUID}]`(두 프리셋), `moveseye.gpu.serial[{#UUID}]`(nvidia-smi만). 값 `0`·빈값·N/A는 전처리가 `MOVESEYE_GPU_UNSUPPORTED` 오류로 남긴다.

## 7. 2차 갱신(2026-10-08) — 코디네이터 요청 반영

| 요청 | 반영 |
|---|---|
| 프리셋 식별 아이템으로 장치 메타 채우기 | `GpuKeyFamily.MOVESEYE`에 `modelKey()`·`serialKey()`·`pciBusKey()`(공식 계열은 null). 어댑터가 `GpuDevice.model`(→ label)·`metadata.serial`·`metadata.pciBusId`를 채운다. 값 상태 규칙 그대로 — 꺼짐·오류(UNSUPPORTED 포함)·미수신·원문 꺼짐/오류/불명이면 null, 시리얼 `0`은 null. 발견 JSON에 값이 있으면 JSON 우선. 아이템이 없으면 null·진단 없음(DCGM의 serial). ⚠️ 필드명은 기존 계약대로 `metadata.serial`(요청 문구의 `serialNumber` 아님 — S2 DTO에서 이름을 정하면 된다) |
| `DEVICE_MODEL_UNAVAILABLE` 의미 변경 | "LLD 경로라서"가 아니라 **PRESENT 장치인데 모델을 못 채웠을 때만**(장치별 1건, detail에 UUID) |
| P-state 정규화 | `textValue`는 항상 `"P"+정수`. 공식 `8.000000`→`P8`, 프리셋 `P8` 그대로. 정수 아님·0~15 밖·형식 오류 → ERROR `INVALID_PSTATE`(신규 사유). N/A는 종전대로 UNSUPPORTED |
| 공식 미지원 문구 | allowlist에 `The requested operation is not available on target device` 추가(부분 일치, `NVML error:` 접두 무관). 종전 `Not Supported`는 실측 미확인이지만 유지 |
| 발견 필드명 | `device_uuid`·`device_name` 확정 — 파서 별칭에 이미 있음, 문서·fixture 주석만 갱신 |
| 키 표 | **변경 없음**(공식 템플릿 export 대기, N1) |
| fixture·테스트 | nvidia-smi fixture에 식별 3종(serial `0`→UNSUPPORTED), NVML fixture에 실측 문구·`8.000000`, **DCGM fixture 신규**(exporter 실측 원문: 37°C·8.603 W·FB 8690/3171/364 MiB·PCIe 262300/325226 B/s, 기본 목록 밖 지표는 METRIC_ABSENT 가정). 테스트 +5: DCGM fixture, 식별 아이템 상태 규칙, 식별 우선순위·프로필 혼합 금지, P-state 정규화, 공식 미지원 문구 |

변경 파일(2차): `engine-api/.../engine/model/gpu/GpuReasonCodes.java` · `engine-zabbix/.../zabbix/gpu/GpuKeyFamily.java` · `GpuValues.java` · `GpuDiscoveryParser.java`(주석) · `ZabbixGpuInventoryAdapter.java` · 테스트 `ZabbixGpuInventoryAdapterTest.java` · `GpuValuesTest.java` · fixture 3종.

## 8. 3차 갱신(2026-10-08) — NVML_PLUGIN 프로필 최종 확정

근거: `features/premium/gpu-monitoring/gpu-nvml-official-template-7.4.15.yaml`·`gpu-nvml-official-items-rtx5070-20261008.json`·`gpu-nvml-official-lld-triggers-20261008.json`.

| 항목 | 확정·반영 |
|---|---|
| 저장 키 | P1 §4 표와 **동일** → `GpuKeyFamily.NVML` 지표 키 표 변경 없음. 지표 dependent의 마스터(`.utilization`·`.memory.fb.get`·`.pci.utilization`·`.errors.memory` 등)와 `nvml.device.get`은 **이력 0**(lastclock 0) — 1차의 이력 0 원문 처리 그대로 적용 |
| 발견 | 🔴 `nvml.device.get`은 이력 0이라 값이 비어 온다 → **발견 JSON 아이템으로 쓰지 않는다**(이력 0이면 건너뜀). LLD 규칙 키를 계열별로 분리: `GpuKeyFamily.discoveryRuleKey()` = `nvml.device.discovery`(공식)·`moveseye.gpu.discovery`(프리셋). 둘 다 1차의 LLD 경로를 그대로 탄다 |
| 단위(공식 계열, 정확 문자열만) | `%`·`B` 그대로 · `Hz` ÷1,000,000 · `watts` 그대로(W) · `C` 그대로 · `bps` 그대로(🔴 실제 bytes/s = `rx_rate_kb_s×1024`, 템플릿 표기 오류 — 주석 명시, 재변환 금지) · ECC·P-state 무단위. 종전 허용하던 `MHz`·`W`·`°C`·`Cel`·`Bps`·`B/s`·`count`는 공식 계열에서 제거 → UNKNOWN_UNIT |
| 미지원 문구 | `No ECC on the device or ECC mode is turned off` · `NVML library too old to support this metric` · `The requested operation is not available on target device` (+ 종전 `Not Supported`), 부분 일치. ECC dependent는 state=1인데 lastvalue `0`이 남아 있음 → 상태 우선순위로 UNSUPPORTED(테스트로 확인) |
| 사유 코드 | 요청 문구의 `CAPABILITY_NOT_SUPPORTED`는 **새로 만들지 않고 기존 `SOURCE_UNSUPPORTED`로 냈다** — 같은 의미의 코드가 이미 계약(§4.3)에 있고 프리셋 미지원 표식도 같은 코드라, 두 이름을 두면 S2가 둘 다 처리해야 한다. 이름을 바꾸려면 S2 착수 전에 결정할 것 |
| P-state·시리얼 | `1`→`P1`. 시리얼은 직접 아이템 `nvml.device.serial`(TEXT `0` → null)을 식별 키로 등록. 모델명 아이템은 공식 템플릿에 없다(LLD 매크로 `{#NAME}`뿐, API로 못 읽음) → **NVML 경로는 model=null + `DEVICE_MODEL_UNAVAILABLE`**이 정상 |
| freshness | 마스터·직접 아이템 delay 1m → 60초, dependent 상속. `power.limit`·`serial`·호스트 메타는 1h |
| 프로필 판정 | 상속 태그는 `class=hardware`·`target=nvidia`뿐(프리셋 태그 없음) → 키 접두사 `nvml.`로 판정, 7.4에서 상속 태그 조회 성립(A12) |
| 기타 | `ZabbixGpuItem.enabled()`는 status가 응답에 없으면 꺼짐으로 단정하지 않는다(`status=1`만 꺼짐). `listDimensions(GPU)`는 발견 JSON이 비어 있으면 아이템 키 UUID로 대신 |

변경 파일(3차): `engine-zabbix/.../gpu/GpuKeyFamily.java` · `GpuValues.java` · `ZabbixGpuInventoryAdapter.java` · `gpu/model/ZabbixGpuItem.java` · `metric/ZabbixMetricAdapter.java` · 테스트 `ZabbixGpuInventoryAdapterTest.java`(공식 fixture 테스트 재작성, 단위 테스트 갱신, 미지원 문구 3종, 이력 0 발견 아이템 → 규칙 폴백 +1) · `GpuValuesTest.java` · fixture `rtx5070-nvml-plugin.json`(실측 42개 원문 + hostid·규칙의 hostid/status/master만 보충).

### S2(app) 메모 — GPU 이벤트 귀속
공식 템플릿 트리거 25개(활동률·메모리 활동률·인코더·디코더·팬·전력·온도 warn/crit, ECC·register 변경, power limit·FB total·BAR1 total 변경, 드라이버·NVML·장치 수 변경)는 전부 `nvml.*` 아이템을 참조한다. **trigger expression의 아이템 키에서 `ItemKeyParser`와 같은 방식으로 UUID 파라미터를 뽑으면** GPU 단위 이벤트 귀속이 정확히 된다(이벤트 이름 부분 일치 금지, P1 §12). 호스트 수준 키(`nvml.device.count`·`nvml.system.driver.version`·`nvml.version`)의 트리거는 호스트 이벤트로 둔다. 프리셋 템플릿 트리거도 `moveseye.gpu.*[{#UUID}]` 키라 같은 규칙이 성립한다. 현재 `AlertPort`에는 트리거 → 아이템 키 관계가 없으므로 S2에서 typed relation을 추가하거나 P1은 호스트 링크로 제한할지 결정 필요.

## 9. 4차 갱신(2026-10-08) — 프리셋 경로 실측 반영

- 프리셋 오류 판정: `MOVESEYE_GPU_UNSUPPORTED`·`MOVESEYE_GPU_METRIC_ABSENT`가 오류 문자열 **어디에든** 있으면 그 사유(원래도 포함 일치였음 — Zabbix가 `Preprocessing failed for: …`로 감싼 실측 문자열로 테스트 추가). 두 표식이 없고 `Preprocessing failed`로 시작하면 ERROR / **`PREPROCESSING_FAILED`(신설)** — 공식 계열에도 같은 규칙(허용 목록 판정 뒤). 템플릿이 CUSTOM_ERROR로 고쳐지기 전 nvidia-smi ECC가 이 경우다(lastvalue `0` 잔존을 싣지 않음).
- fixture: nvidia-smi(7.0.6, 아이템 20개) ECC·serial을 실측 감싼 오류로, 호스트 기술명 `GPU-SERVER` · DCGM(7.4) ABSENT 6종(정확히 `MOVESEYE_GPU_METRIC_ABSENT`, lastvalue `0`/빈값)·`vram.total`=12819890176(usedPct는 같은 템플릿 total), 기술명 `GPU-Server` · **신규 `gpu-server-74-dcgm-and-nvml.json`**(공식 템플릿 + DCGM 프리셋 동시 연결 — 실제 MULTIPLE_PROFILES: DCGM 선택, 공식 값 혼합 없음). DCGM 실측 24개 중 원문이 없는 1개는 fixture에 두지 않았다.
- 테스트 +3: 실제 다중 프로필, 기술명 대소문자만 다른 두 호스트(식별은 hostId — 같은 UUID여도 호스트별 값), 프리셋 오류 포함 일치·`PREPROCESSING_FAILED`.
- 변경 파일: `GpuReasonCodes.java` · `ZabbixGpuInventoryAdapter.java` · `ZabbixGpuInventoryAdapterTest.java` · fixture `rtx5070-moveseye-nvidia-smi.json`·`rtx5070-moveseye-dcgm-http.json`·`gpu-server-74-dcgm-and-nvml.json`(신규).

## 10. 5차 갱신(2026-10-08) — 액티브 변형 프리셋

- `moveseye_preset=gpu-nvidia-smi-active` → `MOVESEYE_NVIDIA_SMI_V1`(새 enum 없음 — 키·단위·전처리가 패시브와 같다). 이전엔 상수 if-체인이라 UNKNOWN + `UNKNOWN_PRESET`이 됐다.
- 태그→프로필은 공개 표 `GpuKeyFamily.PRESET_TAG_TO_PROFILE`(+ `PRESET_TAG`, 장치 수집이 아닌 `NON_COLLECTION_PRESETS={gpu-cluster}`) 하나. 모르는 값은 그대로 UNKNOWN_PRESET.
- 원래 프리셋 id는 `GpuHostInventory`에 필드가 없어(계약 변경은 하지 않음) `MULTIPLE_PROFILES` 진단 detail에만 `MOVESEYE_NVIDIA_SMI_V1(gpu-nvidia-smi-active)` 형태로 남긴다. 화면에 프리셋 id가 필요하면 S2에서 필드 추가를 결정할 것.
- 정합 검사: app `ZabbixPresetCatalogTest#everyPresetIsMappedByGpuAdapter` — 카탈로그 모든 id가 어댑터 표에 있고 태그 이름이 같은지.
- fixture `rtx5070-moveseye-nvidia-smi.json` 상속 태그를 실측대로 `gpu-nvidia-smi-active`로. 테스트 +2(액티브 매핑·진단 id, 표 위생).

## 11. 6차 갱신(2026-10-08) — Zabbix 버전 호환(7.4.15에서 묶음 전체 실패)

- 원인: `item.get`의 `selectItemDiscovery`에 넣은 `lastcheck`(7.0 전용)·`status`(7.2+ 전용)를 7.4.15가 `-32602 Invalid params`로 거부 → 묶음 실패 → app `GPU_SOURCE_UNAVAILABLE`(503).
- 수정: 7.0·7.2+ **공통 필드만** 요청 — `parent_itemid, key_, ts_delete`(`ZabbixGpuInventoryAdapter.ITEM_DISCOVERY_FIELDS`). 잔존 판정은 `ts_delete > 0` 하나(`ZabbixGpuItem.ItemDiscovery.lost()`).
- **잃은 정밀도**: ① 규칙의 "삭제 보류 기간"이 '삭제 안 함'이면 ts_delete가 0으로 남아 잔존 아이템이 PRESENT로 보인다. ② 7.2+의 "lost지만 아직 삭제 예약 전"(status=1·ts_delete=0) 구간도 PRESENT. ③ LLD 경로의 `discoveredAt`은 이제 **항상 null**(마지막 발견 시각 `lastcheck`가 7.0 전용). 발견 JSON 아이템 경로의 discoveredAt은 그대로.
- 재점검: 나머지 output·select 필드(item: state·error·status·delay·master_itemid·units·value_type·type·history·lastclock·lastvalue / selectPreprocessing type·params / host: status·selectTags·selectInheritedTags·selectParentTemplates.templateid / discoveryrule: state·error·status·delay·master_itemid·type / usermacro: hostid·macro·value, globalmacro)는 7.0·7.4 양쪽 문서에 있어 유지.
- 회귀 방지: 테스트용 가짜 API가 7.4.15 실측 거부 메시지 그대로(그리고 7.0 쪽 거부도) 재현하므로 **모든 테스트**가 버전 전용 필드를 잡는다 + 전용 테스트 2건(요청 필드 = 공통 필드, `lost()` 규칙). fixture의 itemDiscovery도 공통 필드 형태로 바꿨다.
- 변경 파일: `gpu/model/ZabbixGpuItem.java` · `ZabbixGpuInventoryAdapter.java` · 테스트 `FakeGpuZabbixApi.java`·`GpuItemBuilder.java`·`ZabbixGpuInventoryAdapterTest.java` · fixture 3종(itemDiscovery 형태).

## 12. 7차 갱신(2026-10-08) — 응답 모양 내성(7.4 런타임에서 묶음 전체 실패)

- 원인: LLD로 만들지 않은 아이템(마스터·`device.count`·`driver.version`·`raw`·`parsed`)은 `itemDiscovery`가 객체가 아니라 **빈 배열 `[]`**(PHP 빈 배열)로 온다. 목록 전체를 한 번에 DTO로 변환하다 터져 호스트 4대가 통째로 사라졌다(INTERNAL → app 503).
- 수정: ① `api.call(…TypeReference)` 대신 `api.raw`로 `JsonNode`를 받아 **아이템마다 변환**(`readItems`/`toItem`) — 선례는 `ZabbixHostServiceImpl`·`ZabbixInventoryAdapter`의 inventory `[]` 수동 매핑. ② 변환 전에 객체 자리의 빈 배열을 null로(`OBJECT_OR_EMPTY_ARRAY_FIELDS` = itemDiscovery — DTO의 중첩 객체 필드는 이것 하나다). ③ 그래도 못 읽는 아이템은 그것만 버리고 호스트 진단 **`PARSE_FAILED`(신설)**, 고른 계열의 지표 아이템이면 그 GPU·지표 관측을 ERROR/`PARSE_FAILED`로(ITEM_MISSING으로 숨기지 않음). RPC 자체 실패(인증·소스 오류)는 종전대로 묶음 실패.
- 테스트 +2: 객체/`[]` 혼합 역직렬화 + fixture 3종(비LLD 아이템을 실측대로 `[]`로 바꿈)이 묶음 실패 없이 읽힘, 깨진 아이템 1개가 같은 호스트의 다른 값·다른 호스트를 해치지 않음. 테스트용 가짜 API도 fixture를 **변환 없이 원문 JsonNode로** 돌려주게 바꿨다(실측 모양이 어댑터 변환 경로를 그대로 탄다).
- 변경 파일: `GpuReasonCodes.java`(PARSE_FAILED) · `ZabbixGpuInventoryAdapter.java` · `gpu/model/ZabbixGpuItem.java`(주석) · 테스트 `FakeGpuZabbixApi.java`·`ZabbixGpuInventoryAdapterTest.java` · fixture `rtx5070-moveseye-nvidia-smi.json`·`rtx5070-moveseye-dcgm-http.json`·`gpu-server-74-dcgm-and-nvml.json`.

## 13. 8차 갱신(2026-10-08) — 코덱스 BE 검수(`_archive/features/premium/gpu-monitoring/review_gpu-p1_codex-be.md`) 엔진 범위 🟡 3건

커밋 `5dc84ee` 위에서 수정(미커밋).

| 항목 | 반영 |
|---|---|
| 🟡1 `detectedProfiles` | `chooseProfile()`이 감지 후보 전체를 **우선순위 순**(DCGM &gt; NVML &gt; nvidia-smi &gt; UNKNOWN)으로 `detected`에 남기고, `GpuHostInventory` 8-인자 생성자로 넘긴다(NOT_CONFIGURED는 빈 목록). 실측 7.4 fixture(`gpu-server-74-dcgm-and-nvml.json`)와 합성 다중 프로필 테스트 둘 다 `[MOVESEYE_DCGM_HTTP_V1, NVML_PLUGIN]` 단언. `GpuHostInventory` javadoc을 "감지 순서"→"우선순위 순"으로 정정 |
| 🟡3 7.2+ `status=1, ts_delete=0` 유실 | `selectItemDiscovery: "extend"`(양 버전 표준 값 — 각 버전이 가진 필드를 다 준다). `ItemDiscovery`에 `status`·`lastcheck` 추가(없으면 null), `lost()` = `ts_delete > 0` **또는** `status == 1`(있을 때만). 7.0 `lastcheck`가 있으면 LLD 경로 `discoveredAt`을 다시 채운다(7.2+는 null). 가짜 API의 버전 거부 규칙은 `"extend"` 허용으로 갱신(필드 나열 시 거부 재현은 유지). fixture: nvidia-smi(7.0 형태 + lastcheck), DCGM(7.2+ 형태 + 다른 UUID 아이템 하나 `status=1/ts_delete=0` → REMOVED), 결합 7.4 fixture(7.2+ 형태). **남는 한계**: 7.0에서 규칙의 삭제 보류가 '삭제 안 함'이면 ts_delete=0·status 없음 → 잔존 아이템이 PRESENT로 보인다(테스트로 고정) |
| 🟡5 인증 버전 probe | `ZabbixClient.legacyBodyAuthRequired()`: (a) URL별 잠금으로 **single-flight** — 캐시가 살아 있으면 잠금 없이 반환, 없으면 잠금 안에서 캐시를 다시 보고 probe는 URL당 1회. (b) probe를 `callRaw("apiinfo.version", List.of(), null)`로 보내 `ZabbixCallMetrics`에 별도 RPC로 계측(토큰 null이라 재귀 없음). (c) `ZabbixQueryExecutor` 논리 호출 예산에는 넣지 않는다고 javadoc에 명시(URL당 10분·실패 시 1분 캐시의 부대 호출 — 넣으면 같은 조회의 예산이 캐시 상태에 따라 달라진다). `ZabbixClientAuthTransportTest`에 동시 첫 요청 8개 → probe 1회·`host.get` 8회, 계측 요약에 `apiinfo.version×1` 테스트 추가(서버가 단일 스레드라 single-flight가 없으면 probe가 8회 찍힌다) |

변경 파일: `engine-api/.../gpu/GpuHostInventory.java`(javadoc) · `engine-zabbix/.../client/ZabbixClient.java` · `.../gpu/ZabbixGpuInventoryAdapter.java` · `.../gpu/model/ZabbixGpuItem.java` · 테스트 `ZabbixClientAuthTransportTest.java`·`FakeGpuZabbixApi.java`·`ZabbixGpuInventoryAdapterTest.java` · fixture `rtx5070-moveseye-nvidia-smi.json`·`rtx5070-moveseye-dcgm-http.json`·`gpu-server-74-dcgm-and-nvml.json`.
