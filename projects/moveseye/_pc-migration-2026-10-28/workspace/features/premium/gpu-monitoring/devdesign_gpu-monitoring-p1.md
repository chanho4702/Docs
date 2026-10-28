# NVIDIA GPU 모니터링 P1 상세 설계

작성: Codex · 2026-09-17 · 버전: 1.0 · 상태: **설계 완료 / 실장비 확인 및 구현 미착수**

> **2026-09-30 갱신 안내:** 이 문서의 "공식 템플릿 단일 전제"는 [수집 경로 설계](devdesign_gpu-collection-paths.md)가 대체한다(공식 플러그인은 Zabbix 7.2.1부터 공식 제공, dev는 7.0.6). 현재 코드와 어긋난 항목 목록은 그 문서 §9에 있다. 값 상태·집계·시계열·화면 규칙은 이 문서가 계속 정본이다.

## 0. 범위와 문서 우선순위

사용자 확정: **1차는 NVIDIA GPU를 Zabbix 아이템으로 모니터링한다. LLM은 미룬다.** 본 문서는 P1 구현 정본이며 [상위 방향 설계](devdesign_gpu-monitoring.md)의 P1 미결안을 구체화한다. 충돌하면 P1 범위에서는 본 문서가 우선한다. DCGM·MIG 상세·프로세스·Pod·LLM·자동 장비 제어는 포함하지 않는다.

공식 GPU 아이템을 읽어 목록·상세·시계열·수집 진단과 기존 이벤트 연결을 제공한다. 새로운 시계열 DB, GPU 데이터 PG 복제, 별도 수집 에이전트는 만들지 않는다. **GPU 건강에 대한 관측을 제공하며 정격 성능이나 LLM 정상 여부를 보장하지 않는다.**

이 문서의 클래스·API·기본 제한값은 구현 결정안이며 아직 존재하는 기능이 아니다. 실제 GPU 모델/OS/Zabbix/Agent/plugin 지원 조합은 S0에서 확인한다. 현재 작업은 문서 작성만이다.

## 1. 재사용 지점과 반드시 보강할 지점

| 구분 | 현재 파일/구조 | P1 결정 |
|---|---|---|
| FE 진입 | `pages/gpu-monitoring/GpuMonitoring.tsx`, `/gpu-monitoring/` | 준비 중 화면 교체, 기존 FeatureGate 유지 |
| 라이선스 | `Feature.GPU_MONITORING`, `LicenseGuardedMetricPort` | GPU API와 신규 포트에서도 같은 라이선스 판정 재사용 |
| 권한 | `DmovePermissionChecker`, `DmovePermissions` | `monitoring/gpuMonitoring.view` 제안 신설, 호스트 가시 범위와 교집합 |
| 메트릭 | `MetricDomain`, `MetricRef`, `MetricPort` | GPU domain 및 UUID 차원, 시계열/트렌드 재사용 |
| 매핑 | `ZabbixMetricCatalog`, `ZabbixMetricAdapter` | GPU 키와 unit 프로필 등록, GPU에 한해 엄격한 숫자 검증 |
| 호스트 | `InventoryPort.listHosts` | CallerContext로 허용 호스트를 먼저 좁힘 |
| 최신 숫자 | `LatestValue.value` primitive double, `parseDoubleOrZero` | GPU 상태 판정에 그대로 사용 금지 |
| 아이템 DTO | `ZabbixBasicItem`에 state/error/status/delay/preprocessing 없음 | GPU 조회용 확장 DTO 신설; 기존 record 생성자/소비자 변경 최소화 |
| 트렌드 | `TrendBucket(epoch,min,max,avg)`에는 sample count 없음 | P1 전체 기간 평균 미제공, 시간별 min/max/avg만 제공 |
| 데이터소스 | `SourceRef.DEFAULT = zabbix-default` | P1 단일 소스만, 임의 sourceId 거부. 다중소스 화면/등록 미구현 |

기존 CPU의 “없으면 0” 동작이나 전체 기간에서 버킷 평균을 다시 평균하는 코드를 GPU로 복사하지 않는다. `MetricDomain` enum 소비 switch·직렬화·proto 스케치·라이선스 데코레이터 테스트를 함께 조사한다.

## 2. 제공 범위와 비제공 범위

### P1 필수

- GPU 발견: hostId + GPU UUID, 모델/표시명, 드라이버, 발견 상태.
- 기본 카드: 활동률, VRAM used/total/free 및 파생 점유율, 온도, 전력 사용/제한.
- 선택 지표: SM/메모리 clock, P-state, PCIe Rx/Tx, 지원되는 ECC.
- 목록 필터·정렬·페이지, GPU 상세, 1h/6h/24h/7d/30d 조회, 수집 진단, 호스트/이벤트 이동.
- 결측·비활성·오류·미지원·오래된 값 구분, 권한과 라이선스, 호출량 상한.

### P1 제외

MIG별 수치, vGPU 지원 보장, process/PID, DCGM, SM/Tensor profiling, NVLink, Xid/정밀 throttling 원인, 전력 제어, 신규 알람 편집기, 원문 다운로드, 장기 아카이브, LLM. 발견 JSON에 MIG 여부가 없으면 UNKNOWN이며 물리 GPU 값만 다룬다. GPU 장비 교체의 영구 자산 이력은 별도 작업이다.

## 3. 수집 경로와 설치 전제

`GPU/NVML → Zabbix Agent 2 NVIDIA plugin → Zabbix server/proxy → history/trends → engine-zabbix → engine-api → premium/gpu → React`.

Zabbix는 지속 수집·저장·trigger 평가, MovesEye는 읽기·정규화·표시를 담당한다. 화면 조회가 NVML/SSH 명령 실행을 유발하지 않는다. Agent active/passive는 설치 환경에 맞추고 공식 템플릿 버전을 고정한다.

S0 체크:

1. OS/architecture, GPU 모델·UUID, NVIDIA 드라이버/NVML, Zabbix server/proxy/Agent/plugin/템플릿 버전 기록.
2. GPU 호스트에서 플러그인 실행 계정의 장비 접근·라이브러리 로딩 확인.
3. `nvml.system.driver.version`, `nvml.device.get`, GPU count의 실제 응답 확보.
4. item.get의 key/value_type/units/lastclock/status/state/error/delay/master_itemid/preprocessing 및 discovery 응답을 비밀정보 없이 fixture로 저장.
5. 동일 시각 NVML/nvidia-smi와 값의 단위·범위를 대조. 도구의 측정 주기가 달라 값이 완전히 같을 필요는 없으며 허용 오차를 기록.
6. 공식 템플릿의 실제 history/trends/trigger/heartbeat 설정을 확인. 기존 고객 템플릿을 자동 변경하지 않음.

실장비 미확보 시 S1 계약/fixture 구현까지 가능하지만 제품 지원 확인은 S0와 S5 실장비 QA가 완료되어야 한다.

## 4. 키·단위 매핑

`{U}`는 실제 item key 파서가 처리하는 따옴표 포함 UUID 파라미터다. 문자열 split 또는 단순 prefix 일치로 다른 GPU의 값을 연결하지 않는다. canonical name은 아래 값으로 고정하고 domain=`GPU`, dims=`{gpuUuid: U}`를 쓴다. 이전 상위 설계의 `{gpu:"0"}`는 사용하지 않는다.

| canonical name | Zabbix 키 | canonical unit | 원천→정규화 |
|---|---|---|---|
| `utilization` | `nvml.device.utilization.gpu["{U}"]` | % | 저장값 유지, 0~100 |
| `memory.activity` | `nvml.device.utilization.memory["{U}"]` | % | VRAM 점유와 다른 지표 |
| `vram.used` | `nvml.device.memory.fb.used["{U}"]` | B | 저장값 유지 |
| `vram.total` | `nvml.device.memory.fb.total["{U}"]` | B | 저장값 유지, 파생 계산 시 >0 |
| `vram.free` | `nvml.device.memory.fb.free["{U}"]` | B | used+free=total 강제 금지(reserved 가능) |
| `vram.usedPct` | 직접 아이템 없음 | % | used/total×100, 현재값만 |
| `temperature` | `nvml.device.temperature["{U}"]` | Cel | 저장값 유지, 0도 유효 값 가능 |
| `power.draw` | `nvml.device.power.usage["{U}"]` | W | 공식 프로필은 전처리 완료값 사용 |
| `power.limit` | `nvml.device.power.limit["{U}"]` | W | 같은 전력 범위인지 확인 |
| `clock.sm` | `nvml.device.sm.frequency["{U}"]` | MHz | 공식 저장 Hz → ÷1,000,000 |
| `clock.memory` | `nvml.device.memory.frequency["{U}"]` | MHz | 위와 같음 |
| `performance.state` | `nvml.device.performance.state["{U}"]` | enum | numeric/문자 실제 형태를 프로필로 변환, P0 등 |
| `pcie.rx` | `nvml.device.pci.utilization.rx.rate["{U}"]` | B/s | 공식 전처리 후 값, 다시 ×1024 금지 |
| `pcie.tx` | `nvml.device.pci.utilization.tx.rate["{U}"]` | B/s | 위와 같음 |
| `ecc.corrected` | `nvml.device.errors.memory.corrected["{U}"]` | count | 관측 counter 자체, reset 처리 없이 증가량으로 표시 금지 |
| `ecc.uncorrected` | `nvml.device.errors.memory.uncorrected["{U}"]` | count | 위와 같음 |

호스트 메타는 `nvml.system.driver.version`, `nvml.version`, `nvml.device.count`, `nvml.device.get`. UUID/모델은 discovery/device JSON의 실제 schema로 어댑터에서 추출한다. app이 Zabbix JSONPath를 알아서는 안 된다. 매핑의 공식 근거: [NVIDIA 템플릿](https://www.zabbix.com/integrations/nvidia).

위 표는 확인한 공식 템플릿 형태 기준이며 실제 설치 프로필이 다르면 unit·전처리를 확인해 버전별 매핑을 등록한다. 알 수 없는 단위는 UNKNOWN_UNIT 오류로 표시한다. 모델명이나 item.name 문자열에서 UUID/건강 상태를 추측하지 않는다.

P1 차트 허용 목록: utilization, memory.activity, vram.used/total/free, temperature, power.draw/limit, clock.sm/memory, pcie.rx/tx. P-state는 현재 상태만, ECC는 현재 counter와 Zabbix 이벤트만 제공한다. ECC 증가 차트는 counter 종류/리셋 증거를 확보한 후 추가한다.

## 5. 엔진 계약 결정

### 5.1 기존 포트와 보강 포트

시계열은 `MetricPort`를 사용한다. **장비 메타·지원 상태·최신값은 신규 중립 `GpuInventoryPort`의 batch snapshot으로 제공**한다. 기존 숫자 record를 전역 nullable로 바꾸지 않는다. 신규 포트는 GPU라는 실제 소비 범위에 한정하며 범용 장비 플랫폼으로 확장하지 않는다.

제안 시그니처:

```java
GpuInventorySnapshot snapshot(SourceRef source, CallerContext caller,
                              List<EntityRef> authorizedHosts);
```

반환 논리 타입:

- `GpuInventorySnapshot`: fetchedAt(Instant), hosts[], complete(boolean), failures[].
- host: entity, collectionState, discoveredAt, devices[], diagnostics[].
- device: gpuUuid, label, model(nullable), physicalKind(PHYSICAL/UNKNOWN), driverVersion(nullable), discoveryState, metrics map.
- metric: canonical MetricRef, numericValue(nullable), textValue(nullable), unit, observedAt(nullable), availability, reasonCode(nullable), evidence enum, expectedHeartbeatSeconds(nullable), nativeItemId(내부), effective retention 정보(알 수 없으면 null).
- evidence: SOURCE_STATUS, SOURCE_CAPABILITY, PARSE_VALIDATION, NO_EVIDENCE. 일반 Zabbix state=unsupported는 하드웨어 미지원과 같지 않다.

Zabbix 구현은 `engine-zabbix/.../gpu/ZabbixGpuInventoryAdapter`, DTO는 같은 모듈의 GPU 전용 item 응답 모델로 둔다. engine-api에는 Zabbix key/state 코드/JSONPath가 노출되지 않는다. app의 제안 서비스는 `premium/gpu/GpuQueryService`, `GpuAccessChecker`, `GpuSeriesService`, `GpuValuePolicy`다.

신규 포트도 `LicenseGuardedGpuInventoryPort`를 통해 기존 allowsLiveQuery 판정을 사용한다. GPU Feature 확인은 controller/service 입구에서 한다. 신규 포트를 raw adapter로 직접 주입하여 라이선스 경계를 우회하지 않도록 qualifier·Primary·아키텍처 테스트를 추가한다.

### 5.2 snapshot 조회 알고리즘

1. 사용자 인증/기능/모듈 권한 확인 후 InventoryPort로 허용 호스트 범위를 구한다.
2. hostId/groupId 필터를 이 범위와 교차 확인한다. 권한 없는 명시 ID는 GPU 존재를 노출하지 않는 not-found 처리.
3. GPU adapter가 호스트 100개씩 청크로 GPU 관련 item family와 메타 master를 가져온다. prefix는 어댑터 allowlist 상수만 사용한다.
4. `nvml.device.get`의 활성·오류 없음·freshness를 확인한 뒤 JSON이 유효할 때만 현재 인벤토리 정본으로 삼는다. 과거 lastvalue가 유효한 JSON이어도 현재 오류/비활성이면 성공한 발견이 아니다. 실패 시 item UUID로 부분 목록을 만들 수 있지만 discoveryState=UNKNOWN으로 표시하며 NO_GPU/REMOVED 판정을 금지한다.
5. key 정확 파싱·중복 검출·단위 정규화·상태 판단 후 snapshot 반환. 같은 GPU/metric에 활성 item이 여러 개면 임의 마지막 값을 선택하지 않고 AMBIGUOUS_ITEM.
6. app이 snapshot 전체에서 필터·정렬·페이지·집계를 계산한다. 같은 응답 안의 rows와 totals는 동일 snapshot을 사용한다.

신규 포트에 raw Zabbix 예외/자격증명을 전달하지 않는다. adapter service account를 쓰더라도 **호출자 허용 호스트 필터**를 매 단계 적용한다. 브라우저가 넘긴 hostId를 그대로 super-admin 조회에 사용하지 않는다.

### 5.3 숫자·history 처리

현재 `parseDoubleOrZero` 대신 GPU 분기에서 strict parse를 적용한다. 빈 문자열·문자·NaN·Infinity·지원 불가 sentinel은 숫자 0이 아니다. 고장난 raw point는 버리고 invalidPointCount를 반환한다.

**반환 경로 확정:** `MetricPort`에 추가 메서드 `CheckedSeriesBatch querySeriesChecked(SourceRef, CallerContext, SeriesQuery)`를 신설한다. 기존 querySeries/queryTrend와 기존 Series/TrendBucket의 동작은 유지한다. 신규 메서드는 GPU가 첫 소비자이며 기존 history/trend 요청·키 매핑을 재사용하되 품질 결과를 함께 반환한다. default 구현으로 성공 빈 결과를 돌려주는 방식은 금지한다.

`CheckedSeriesBatch`는 metric별 결과와 source-level 실패를 구분한다. metric 결과는 metricRef, canonicalUnit, mode(RAW/HOURLY_TREND), point/bucket 목록, invalidPointCount, queryComplete, limitReached, errorCode(nullable)를 가진다. RAW는 epoch/value, TREND는 epoch/min/max/avg를 담고 count는 현재 계약상 미제공이다. 중복 item/잘못된 unit/개별 이력 질의 실패는 metric 오류, 인증·소스 연결 실패는 batch 예외다. limitReached 또는 queryComplete=false는 app에서 QUERY_TOO_DENSE 또는 조회 실패로 처리하며 API 성공으로 숨기지 않는다.

ZabbixMetricAdapter와 LicenseGuardedMetricPort가 이 메서드를 모두 구현하고 최신 라이선스 검사·CallerContext를 보존한다. 모든 구현체·mock·ArchUnit 대상 목록을 S1에서 검색해 갱신한다. 신규 포트를 추가로 하나 더 만들어 시계열 라이선스 경계를 나누지는 않는다. GPU adapter가 숫자를 엄격히 파싱한 **뒤** count를 제공하므로 app은 이미 0으로 변환된 결과에서 invalid를 추측하지 않는다.

GPU history 조회의 item 선택은 **아이템 수집 활성 여부와 분리**한다. 지금 비활성/오류인 아이템도 과거 이력이 있을 수 있다. 현재 snapshot 상태 때문에 과거 차트를 통째로 막지 않는다. 이미 LLD가 지운 item의 과거 데이터는 P1에서 복구하지 못하며 이 한계를 안내한다.

## 6. 발견과 값 상태 규칙

### 발견

식별 키는 `(sourceId, hostId, gpuUuid)`다. 내부/URL에는 각각 인자로 전달하고 index를 키로 쓰지 않는다. UUID 없는 자료는 P1 정상 장비 목록에 임의 합성 UUID로 넣지 않고 진단의 UNIDENTIFIED_DEVICE에 표시한다. 상위 초안의 PCI fallback은 P1에서 채택하지 않는다.

성공한 device 목록이 빈 배열이고 count=0이면 NO_GPU. 아이템 자체가 없으면 NOT_CONFIGURED이며 “GPU 없음”으로 단정하지 않는다. JSON 오류·소스 실패는 COLLECTION_ERROR. 템플릿 이름만으로 설치 상태를 확정하지 않는다.

이전 snapshot에서 보였던 GPU가 성공한 device 목록에서 사라지면 REMOVED로 최근 발견 캐시에 최대 24시간 유지하고 lastSeenAt을 표시한다. 수집 실패만으로 REMOVED로 바꾸지 않는다. 캐시는 재시작 시 소실 가능하며 영구 이력이 아니다. REMOVED의 현재값은 null이고 상세에서 소스에 남은 history만 읽는다.

### 최신값 상태의 우선순위

| 순서 | 조건 | API 상태 / 표시 |
|---|---|---|
| 1 | source 실패/권한 회수 | 실패 envelope 또는 허용된 캐시의 DEGRADED. 현재 건강은 UNKNOWN |
| 2 | device REMOVED | NO_DATA / 최근 발견 종료 |
| 3 | item disabled | DISABLED / 수집 비활성 |
| 4 | 명시적 장비 capability 미지원 증거 | UNSUPPORTED / 미지원 |
| 5 | Zabbix state 오류, 중복 item, 잘못된 단위/숫자 | ERROR / 수집 오류·진단 사유 |
| 6 | item 없음 또는 lastclock≤0 | NO_DATA / 미설정 또는 수신 대기 |
| 7 | 유효 숫자지만 freshness 기한 초과 | STALE / 마지막 값과 관측 시각 |
| 8 | 나머지 유효 값 | OK |

문자열 오류 메시지 매칭은 특정 버전의 명시적 미지원 패턴 allowlist에서만 허용하고, 알 수 없는 오류는 ERROR다. GPU가 메모리 오류 지표를 지원하지 않는다고 전체 GPU를 고장 상태로 만들지 않는다.

`status!=OK`이면 최신 집계에서 제외한다. STALE만 마지막 숫자를 `value`에 보존할 수 있고 화면에서 회색·시각을 함께 표시한다. DISABLED/ERROR/NO_DATA/UNSUPPORTED는 value=null. textValue도 동일 원칙. 과거 차트는 별도 상태다.

dependent item은 master chain도 검사한다. master disabled→child DISABLED/MASTER_DISABLED, master 오류→child ERROR/MASTER_ERROR, master 미수신→child NO_DATA/MASTER_NO_DATA, master stale→child STALE/MASTER_STALE로 전파한다. child 자체의 명시 오류가 있으면 해당 오류를 우선 보존한다. master chain cycle 또는 조회 불가→ERROR/MASTER_STATE_UNKNOWN. 전파는 최신값에만 적용하고 과거 history 접근을 차단하지 않는다. 상태 판정에 사용한 master의 원천 lastclock/heartbeat도 diagnostics에 기록한다.

freshness: resolved expectedHeartbeatSeconds를 사용한다. dependent item은 master 수집 주기와 discard-unchanged heartbeat를 함께 해석하고 flexible interval·macro를 풀 수 없으면 freshness=UNKNOWN, status는 NO_DATA가 아니라 마지막 값 유무에 따라 STALE 보수 판정과 INTERVAL_UNKNOWN 사유를 표시한다. 기한 초안은 `max(90초, expectedHeartbeat×3)`. 메타 driver/device JSON은 최대 1일 heartbeat를 반영한다. 요청 시각이 아닌 item lastclock을 observedAt으로 사용한다.

## 7. 건강·집계 의미

건강 판정은 **Zabbix GPU 관련 이벤트가 기준**이며 별도 GPU 점수/고장 추론 모델을 만들지 않는다.

- health: ALERT / NO_ACTIVE_ALERT / UNKNOWN. NO_ACTIVE_ALERT는 “현재 관련 경보 없음”이지 “GPU 성능 정상”이 아니다.
- dataStatus: CURRENT / PARTIAL / STALE / UNAVAILABLE. health와 독립 표시.
- GPU 이벤트를 item/trigger 연관으로 정확히 귀속할 수 없으면 health=UNKNOWN, hostEventsAvailable=true. 호스트 전체 이벤트를 모든 GPU의 경보 수에 복제하지 않는다.
- 기본 필수 관측은 utilization, vram.used/total, temperature, power.draw다. 실제 장비에서 필수 항목 미지원이면 관측 coverage를 낮추고 PARTIAL을 표시한다. 경보 없음과 완전 관측을 혼동하지 않는다.
- high utilization 단독으로 BE 경보를 생성하지 않는다. 공식 trigger가 있으면 원래 이벤트로 표시하며 그 의미를 설명한다.

목록 totals는 권한·검색·GPU 필터 적용 후 **전체 matched 행**, page만 적용하기 전 기준이다. 전체 수와 current/partial/stale 수를 함께 반환한다. 평균 활동률은 OK 값이 있는 GPU의 산술평균이며 sampleCount를 제공한다. VRAM은 OK used/total 쌍이 있는 같은 GPU 집합만 사용한다. total>0, used≥0, used≤total 및 값 시각 차이 허용(기본 max 주기 이내)을 확인한다. 전력 합계는 OK physical GPU 값만 더하고 observedCount를 표시한다. UNKNOWN 물리 종류는 중복 가능성 때문에 합계에서 제외한다.

## 8. REST 계약 초안

구현 시 [GPU API 계약 초안](contract_gpu-monitoring.md)을 정본으로 업데이트한다. 여기서는 동작을 정의한다. P1 sourceId는 생략 시 zabbix-default이며 다른 값은 SOURCE_UNSUPPORTED. 신규 엔드포인트는 모두 read-only다.

| API | 책임 |
|---|---|
| `GET /gpu/devices` | 권한 범위 GPU 목록·동일 snapshot 집계 |
| `GET /gpu/devices/detail` | sourceId/hostId/gpuUuid 장비 메타·최신값·관측 상태 |
| `GET /gpu/devices/series` | 위 식별자 + metrics/from/to/resolution 시계열 |
| `GET /gpu/hosts/diagnostics` | 선택 hostId의 설정·discovery·지원/오류 진단 |

UUID query param은 URL encoding을 적용하고 임의 item key 또는 itemId를 받지 않는다. 상세 링크를 query 기반으로 하는 이유는 P1의 현 FE 라우트와 식별 scope를 명확히 유지하기 위해서다.

기본 제한 결정안(실측 후 조정 가능): pageSize=25/max100, metric 최대8, from/to epoch **밀리초**, 최대 기간30일, 전체 허용 host scope 최대200개/GPU 행 최대2000개. 초과는 SCOPE_TOO_LARGE로 반환하고 hostGroup/host 필터를 요구한다. **부분 결과를 전체 결과처럼 조용히 자르지 않는다.** 최대값은 성능 보장이 아니며 S5 검증에서 더 낮출 수 있다.

정렬은 hostName/model/utilization/vramUsedPct/temperature/powerDraw/lastSeenAt만 allowlist. null은 오름·내림 모두 마지막, 동률은 hostId+gpuUuid로 고정. snapshotId는 scope/권한과 바인딩하고 TTL 60초다. snapshot의 freshness/dataStatus/행/집계는 generatedAt 기준으로 고정하며 같은 ID에서 재분류하지 않는다. FE는 해당 기준 시각을 표시한다. 30초 auto-refresh는 새 snapshotId로 교체하고 page1부터 읽는다. 권한은 매 요청 재검증하고 변경 시 snapshot을 폐기한다. 만료는 SNAPSHOT_EXPIRED로 첫 페이지 재조회 안내.

API는 `ApiResult<T>` 성공 envelope와 기존 auth/feature/권한 오류 정책을 사용한다. DTO 내부 null 필드는 생략하지 않는다. 프론트엔드는 useDmoveQuery 언랩 후 payload만 소비한다. 소스 실패를 200 성공 빈 rows로 바꾸지 않는다.

## 9. 시계열 설계

### 해상도

- 기본 recent 1h. 프리셋 1h/6h/24h/7d/30d, 사용자 지정도 최대30일.
- `resolution=AUTO`: ≤24h면 RAW(소스 보존/조회 예산이 허용할 때), >24h면 HOURLY_TREND. 이 경계는 GPU 전용이며 기존 AdaptiveSeriesQuery 전역 상수를 바꾸지 않는다.
- 명시 RAW는 최대24h. 장기 RAW 요청은 오류로 설명한다. trend 미보존 시 무제한 RAW fallback 금지.
- 이미 완료된 시간의 경계 bucket(예: from=10:30의 10:00 bucket)은 아래 boundaryPartial 규칙으로 반환한다. 현재 진행 중 시간은 확정 trend로 취급하지 않고 gap으로 표시한다. P1은 RAW 꼬리와 trend를 한 계열에 섞지 않는다.
- 원시 결과는 metric당 입력 최대10,000 points, 응답 최대2,000 bucket. 선택8개면 입력 최대80,000. 소스 limit이 모든 item에 공유되는지 검증하여 필요 시 시간창 chunk + item별 completeness를 구현한다. 상한 도달 가능성이 있으면 성공으로 잘라 반환하지 않고 QUERY_TOO_DENSE(기간 축소 또는 trend 안내).

### 집계와 커버리지

RAW가 2,000점을 넘으면 시간 bucket으로 min/max/avg/count를 계산하고 resolution=RAW_BUCKETED 및 stepMs를 반환한다. source 샘플링 이상으로 정확한 순간 peak를 보장하지 않는다. trend는 소스 시간별 min/max/avg를 보존한다.

전체 기간 평균은 P1에서 제공하지 않는다. TrendBucket에 원본 count가 없으므로 sample 가중 평균을 계산할 수 없다. VRAM 비율의 과거 차트도 P1 제외하고 used/free/total bytes를 각각 제공한다. 서로 다른 시각의 total로 과거 used를 나누지 않는다.

현재 아이템의 effectiveHistoryDays/effectiveTrendDays는 macro·housekeeping override까지 확인되는 경우만 숫자를 제공한다. 알 수 없으면 null. configuredRetention과 실제 반환된 availableFrom/availableTo는 별개 필드다. 빈 결과가 보존 만료라는 증거 없으면 NO_DATA로 표시한다.

chart point의 t는 bucket 시작(epoch ms), to는 배타 경계다. 일반 내부 엔진 epoch 초→REST ms 변환은 한 곳에서 수행한다. TREND의 소스 조회는 from을 UTC 시간 시작으로 내리고, 반환 대상은 요청 창과 겹치는 완료된 시간 bucket이다. 요청 경계에 걸리면 boundaryPartial=true이며 값은 시간 전체 집계임을 표시한다. 따라서 point.t가 requestedFrom보다 이를 수 있고 UI는 해당 bucket 범위만 표시하되 원래 시간 tooltip을 보존한다. effectiveFrom/To는 요청의 유효 경계이며 소스 확장 범위와 별개다. 현재 UTC 시간 시작 이후는 gap(CURRENT_BUCKET_INCOMPLETE); 완료된 시간에도 소스 데이터가 없으면 별도 gap(NO_DATA). 값 없는 bucket은 null, 선 연결 금지. P-state/counter를 gauge trend 평균으로 표현하지 않는다.

## 10. 성능·캐시·실패 동작

P1은 전역 background 수집 잡을 신설하지 않는다. 읽기 snapshot 캐시 TTL 30초, 장비 메타 캐시 5분(원본 freshness 별도), 선택 상세 chart cache 30초를 기본으로 한다. source+principal+권한 revision+정규화 scope/query가 key이며 권한 확인은 cache hit보다 먼저다. revision이 없으면 해당 요청의 허용 host 집합 fingerprint를 포함한다.

같은 요청은 SingleFlightExecutor로 합친다. 호스트 chunk100, 신규 GPU 포트는 같은 소스에 동시 chunk 최대2(초안), timeout은 호출10초/전체20초. retry는 화면 다음 갱신을 사용하고 GET 한 번 안에서 무한 retry하지 않는다. 다중 BE에서는 노드별 캐시·동시성 한계가 곱해지므로 노드 수를 S5 부하 시험에 포함한다. 첫 릴리스 규모를 넘으면 공유 캐시/전역 제한을 후속으로 추가한다.

청크 하나 실패 시 처음 조회는 실패로 반환한다. 이전 완전 snapshot이 있고 현재 권한을 다시 통과하면 최대2분 동안 stale snapshot을 `completeness=STALE_CACHE`, cachedAt, sourceErrorCode와 함께 제공할 수 있다. 이때 모든 current 합계는 null, health는 UNKNOWN으로 강등한다. 성공한 일부 chunk와 오래된 chunk를 섞어 전체 totals를 만들지 않는다. cache가 없거나 오래되면 source error를 반환한다.

리스트 snapshot 최대2000 GPU × 약16 metric의 실제 메모리 사용, item JSON payload, 필터/정렬 비용을 측정한다. 사용자별 캐시 상한/eviction을 설정하고 무제한 query 조합을 보존하지 않는다. 초기 목표는 warm 목록 p95 1초, cold 목록 p95 5초(대표 규모 실측 목표일 뿐 SLA 아님). 호출 수는 GPU 수×지표 수가 아니라 host chunk와 metric query 종류로 증가해야 한다.

## 11. FE 상세 동작

### 라우트와 상태

- 목록: `/gpu-monitoring/`.
- 상세: `/gpu-monitoring/detail?sourceId=...&hostId=...&gpuUuid=...&from=...&to=...` 신규 자식 라우트.
- 필터·page·sort·시간 범위는 URL query가 정본. 목록→상세→뒤로 가기 시 복구.
- 상대시간 auto-refresh는 목록/현재 상세30초, metadata5분. 비활성 탭·unmount·고정 과거 기간의 chart polling 중단. 사용자 새로고침은 rate limit 안에서 캐시 재검증.

### 목록 레이아웃

상단 `GPU 모니터링` 제목 + 마지막 갱신 + 새로고침. 두 번째 줄에 host group/host/model/data status 필터. source는 P1 단일 표시로 고정한다.

카드 4개: 발견된 GPU 수 / 최신 관측 GPU 수 / 정확히 귀속된 활성 GPU 이벤트 수 / 관측 전력 합계. 각각 scope와 observedCount를 tooltip에 표시한다. 필터 후 결과가 0이면 값0을 보여도 소스 오류와 구분한다.

표: 호스트, 모델/UUID, 활동률, VRAM used/total(점유 bar), 온도, 전력, 데이터 상태, 이벤트, 마지막 관측. 미지원은 `—`+사유, 0%는 실제0. 모든 경고를 빨간 사용률 bar로 통일하지 않는다. 모델명 없는 경우 UUID로 식별한다.

### 상세 레이아웃

헤더에 GPU label·호스트 이동·UUID 복사·관측 상태. 상단 현재 카드 4개(활동률/VRAM/온도/전력), 공통 시간 선택 아래 2×2 차트. 추가 지표 영역은 clock/PCIe를 지원할 때만 보여 주며 미지원 항목 수를 진단에서 확인 가능하게 한다.

현재 값은 “현재”로 명시하고 과거 기간 chart 값과 혼동하지 않는다. tooltip은 unit·실제 sample/bucket 시각·min/max/avg·coverage 표시. RAW와 TREND 배지를 제공한다.

하단 `이벤트`와 `수집 진단` 탭. GPU 이벤트 필터를 정확히 만들 수 없으면 `호스트 이벤트 보기` 링크만 제공한다. 진단은 일반 사용자에게 표준 사유/조치 요약만, 관리자에게 원시 key/item 상태를 정제하여 노출한다. error 메시지에 접속정보·경로·비밀값이 포함되지 않도록 sanitize한다.

### 빈 상태

| 상태 | 화면 메시지 | 다음 행동 |
|---|---|---|
| NO_GPU | 확인한 호스트에 GPU가 없습니다 | 다른 호스트 선택 |
| NOT_CONFIGURED | GPU 수집 아이템이 확인되지 않습니다 | 관리자 설치 안내 |
| NO_DATA | 아이템은 있으나 수신된 값이 없습니다 | 진단 탭 |
| UNSUPPORTED | 이 장비/설정에서 지원하지 않는 지표입니다 | 지원표 확인 |
| SOURCE_ERROR | 데이터소스 조회에 실패했습니다 | 재시도/소스 상태 |
| NO_PERMISSION | 조회 권한이 없습니다 | 기존 권한 UX |
| FEATURE_LOCKED | 기존 GPU 기능 잠금 화면 | 기존 라이선스 UX |

## 12. 권한·배포·이벤트

신규 모듈 권한 `monitoring/gpuMonitoring.view`는 기존 serverMonitoring.view 기본값을 기준으로 이관하되 GPU entitlement는 별도 필수다. 기존 역할에 이 권한이 없을 때 런타임에서 무조건 허용하는 fallback은 금지한다. 새 권한은 factory+저장된 역할 permission JSON의 멱등 migration+FE flatten/i18n/권한 편집/메뉴 검색·모바일 메뉴까지 반영한다. edit/delete/download는 P1 제공하지 않는다. 상세 진단의 raw 정보는 관리자 판정으로 제한한다.

GPU 경보를 정확히 귀속하려면 trigger의 item 참조/UUID tag 등 명시적 관계가 필요하다. 이벤트 이름 substring만으로 GPU를 매칭하지 않는다. 기존 AlertPort에 필요한 relation이 없으면 추가 typed relation 계약을 만들거나 P1에서는 host 링크로 제한한다. 신규 중복 경보 평가·Zabbix trigger 자동 변경은 하지 않는다.

Flyway가 필요하면 권한 이관만 새 번호로 작성한다. GPU 숫자 history 테이블은 만들지 않는다. GPU 포트·권한 준비 후 FE 배포, 실패 시 FE 준비 중 화면으로 되돌릴 수 있게 한다. 기존 Zabbix 수집은 앱 rollback과 무관하게 유지된다. 이전 앱 rollback이 신규 권한 JSON을 처리하는지도 확인한다.

## 13. 구현 작업 분해

| 작업 | 소유 파일/책임 | 종료 조건 |
|---|---|---|
| S0 지원·fixture | `_workspace/features/premium/gpu-monitoring/gpu-p1-source-profile.md` | 실제 버전·키·unit·discovery·오류/heartbeat·history 근거 확보 |
| S1 엔진 | engine-api GPU domain/포트/models, engine-zabbix gpu adapter/catalog | UUID·strict parse·상태·batch·history 회귀 테스트 |
| S2 접근·API | premium/gpu, license integration, permission factory/migration | 계약 DTO와 제한·권한·cache·오류 구현 |
| S3 FE | gpu-monitoring page/components, types/gpu.ts, services/gpu.api.ts, hooks, routes/nav/i18n | 목록·상세·필터·chart·상태·권한 동작 |
| S4 통합 | 계약+테스트 fixtures | 실제 HTTP envelope와 FE 언랩/시간 단위 일치 |
| S5 런타임 | 실GPU QA/부하 결과 | 장비/소스 실패/미지원/다중GPU/권한/limit 검증 |

작업 재개 시 COLLAB을 확인한다. 현재 SOLO-CLAUDE에서는 구현 Claude·검수 Codex 역할을 따른다. 이 설계서 작성은 코드 소유권 변경이나 구현 착수 지시가 아니다.

## 14. 검증 행렬과 출시 기준

| 테스트 | 확인할 실패 |
|---|---|
| 실제0·빈문자·N/A·NaN·Inf·센티널 | 0% 정상으로 잘못 표시하지 않음 |
| state 오류 + 과거 lastvalue 존재 | 현재 ERROR와 과거 chart 접근 분리 |
| disabled item·dependent master 실패 | 원인 분리, lastclock만으로 정상 판정 금지 |
| UUID 동일 index 변경·GPU 교체 | 데이터가 다른 GPU로 붙지 않음 |
| device JSON 실패·빈 정상 JSON·LLD item 잔존 | GPU 없음/실패/removed 구분 |
| 중복 active item·단위 변경 | 임의 값 선택·이중 변환 금지 |
| used/total 시각 차이·total0·부분 지원 | 파생 비율 null, 합계 분모 일치 |
| 고사용률·저clock·ECC 과거 누계 | BE가 새 고장 경보를 만들지 않음 |
| 24h/30d 경계·trend 없음·limit 포화 | 무제한 fallback/조용한 truncation 금지 |
| 권한 회수 후 cache hit·타 hostId 직접 요청 | 기존 캐시로 권한 우회 불가 |
| 라이선스 미보유·만료 상태별 | 기존 정책과 신규 포트/REST/UI 일치 |
| source timeout·한 chunk 실패 | 정상 빈 결과/혼합 totals 금지 |
| API 초↔ms·nullable DTO·epoch boundary | 그래프 시간/값 계약 일치 |
| GPU 1/8/100 및 동시 사용자 | N+1·메모리·소스 API 부하 상한 |

실장비가 없으면 fixture 검증 완료만 보고한다. 운영 GPU에 열/오류를 유발하는 부하를 자동 실행하지 않는다. 지원 장비 표, 데이터 의미, 제한값 검증, BE/FE 계약 및 실제 화면 흐름이 모두 통과해야 P1 완료다.

## 15. 남은 실측 질문과 재개 문장

실측 미결: GPU/OS/플러그인 조합, device JSON 실제 shape, item error의 안정적인 미지원 분류, master/heartbeat 해석, 실제 history 제한, GPU 이벤트 귀속 가능성, 규모별 limit. 이는 설계 누락이 아니라 S0 산출물이며 답 없이 가짜 지원을 선언하지 않는다.

> `_workspace/features/premium/gpu-monitoring/devdesign_gpu-monitoring-p1.md`와 `_workspace/features/premium/gpu-monitoring/contract_gpu-monitoring.md`를 기준으로 S0부터 구현 준비를 재개한다. LLM/DCGM/MIG는 제외한다. Zabbix GPU fixture를 확보하고 신규 snapshot 포트로 값 상태를 보존하며, GPU 시계열은 기존 MetricPort를 재사용한다. 권한과 엔진 라이선스 경계를 확인한다. 이 문서의 초안 계약을 구현 후 실제 응답과 대조하여 확정한다.

## 참고 근거

- [GPU 방향 설계](devdesign_gpu-monitoring.md)
- [Zabbix item object](https://www.zabbix.com/documentation/current/en/manual/api/reference/item/object) — 아이템 상태·오류·주기·보존 정보.
- [ZabbixMetricAdapter](../../../../moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java) — 최신 output·parseDoubleOrZero·history 경로.
- [ZabbixBasicItem](../../../../moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/zabbix/item/model/ZabbixBasicItem.java)
- [TrendBucket](../../../../moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/metric/TrendBucket.java)
- [권한 기본값](../../../../moveseye-be-spring/src/main/java/com/dmove/moveseye/common/constants/DmovePermissions.java)
