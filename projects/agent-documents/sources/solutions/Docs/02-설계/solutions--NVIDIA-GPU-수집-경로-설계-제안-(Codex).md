# NVIDIA GPU 수집 경로 설계 제안 (Codex)

**권고 1:** Zabbix가 있는 고객은 Zabbix를 저장·알람 정본으로 유지하되, 수집 방식은 버전과 설치 제약에 따라 `Agent 2 NVML`, `DCGM Exporter → HTTP agent`, `nvidia-smi UserParameter` 프로필로 분리한다.  
**권고 2:** Zabbix 7.0 LTS의 기본 권고는 `DCGM Exporter → Zabbix HTTP agent`이며, exporter 설치도 불가능하면 기존 Agent의 `nvidia-smi` 수집을 제한적 대안으로 사용한다. 고객 Prometheus가 이미 DCGM을 저장한다면 중복 적재하지 않고 Prometheus HTTP API를 직접 읽는다.  
**권고 3:** 화면과 API는 canonical GPU 모델로 통일하되, 장비 식별·최신 상태·시계열·알람 정본을 분리한다. 동일 GPU의 다중 경로 병합은 명시적 호스트 바인딩과 NVIDIA UUID가 모두 일치할 때만 허용하며 자동 fallback이나 서로 다른 소스의 시계열 접합은 금지한다.

---

## 1. 수집 경로 전수 열거

### 1.1 세 축에 따른 분류

| ID | 수집 경로 | 수집 주체 | 원본 저장소 | MovesEye가 읽는 방법 |
|---|---|---|---|---|
| Z1 | Zabbix Agent 2 공식 NVIDIA plugin | GPU 호스트의 Agent 2 loadable plugin이 NVML 조회 | Zabbix history/trends, trigger/problem | `engine-zabbix`가 `nvml.device.*["{#UUID}"]` 아이템을 canonical GPU 지표로 변환 |
| Z2 | Zabbix Agent + `nvidia-smi` UserParameter | GPU 호스트의 Zabbix Agent가 제한된 명령 실행 | Zabbix history/trends, 사용자 정의 trigger | 전용 `zabbix-nvidia-smi-v1` 프로필이 사용자 정의 키·단위를 정규화 |
| Z3 | DCGM Exporter → Zabbix HTTP agent | DCGM Exporter가 NVML/DCGM을 읽고, Zabbix server/proxy가 `/metrics`를 주기적으로 pull | Zabbix master/dependent items, history/trends, 사용자 정의 trigger | 전용 `zabbix-dcgm-http-v1` 프로필이 UUID label과 DCGM 지표를 읽음 |
| Z4 | Zabbix SSH agent → `nvidia-smi` | Zabbix server/proxy가 SSH 접속 후 원격 명령 실행 | Zabbix history/trends | Z2와 같은 canonical 매핑을 사용하되 수집 provenance는 `SSH`로 구분 |
| Z5 | 사용자 스크립트 → Zabbix trapper/`history.push` | GPU 호스트의 별도 cron/service가 `nvidia-smi` 또는 NVML을 읽어 push | Zabbix history, 사용자 정의 trigger | Zabbix 아이템을 일반 GPU 프로필로 읽음 |
| Z6 | BMC Redfish → Zabbix HTTP agent | Zabbix server/proxy가 BMC management network에서 Redfish polling | Zabbix history/trends, Redfish 기반 trigger | Redfish 전용 프로필. 온도·전력·식별 정보만 canonical 모델에 채움 |
| P1 | 고객 Prometheus가 DCGM Exporter scrape | DCGM Exporter + 고객 Prometheus | 고객 Prometheus 또는 호환 TSDB | 향후 `engine-prometheus`가 Prometheus HTTP API/PromQL로 조회 |
| P2 | Prometheus 호환 저장소 | DCGM Exporter + VictoriaMetrics/Mimir/Thanos 등 | 고객 Prometheus-compatible TSDB | P1과 동일한 `MetricPort` 계열 어댑터로 조회하되 지원 API 프로필 분리 |
| M1 | OTel Collector Prometheus receiver → OTLP | 고객 측 OTel Collector가 DCGM Exporter를 scrape하고 OTLP push | MovesEye 전용 GPU metric 저장소 | GPU OTLP ingest·repository를 통해 조회 |
| M2 | MovesEye가 DCGM Exporter 직접 scrape | MovesEye background collector | MovesEye 전용 GPU metric 저장소 | 로컬 repository 기반 `MetricPort` 구현 |
| R1 | MovesEye가 BMC Redfish 직접 polling | MovesEye background collector | 최신 캐시만 사용하거나, 시계열이 필요하면 MovesEye 전용 저장소 | Redfish adapter가 inventory·온도·전력 관측으로 변환 |
| C1 | AWS CloudWatch 등 클라우드 API | Cloud agent, custom publisher 또는 관리형 서비스가 GPU 지표 게시 | CloudWatch 등 공급자 저장소 | cloud adapter가 API로 조회하고 canonical GPU 모델로 변환 |
| A1 | IPMI/SNMP/드라이버 로그 | BMC·OS·syslog 수집기 | Zabbix, 로그 저장소 또는 BMC SEL | GPU 핵심 수치가 아닌 보조 이벤트·장비 건강 신호로만 사용 |

### 1.2 경로별 해석

#### Z1. 공식 Agent 2 NVIDIA plugin

가장 단순하고 Zabbix 알람·보존 정책을 그대로 활용할 수 있는 경로다. 다만 Zabbix 7.2.1 이상이라는 전제가 있어 dev 7.0.6과 다수 7.0 LTS 고객의 기본 경로가 될 수 없다.

지원 조건은 단순히 “Zabbix 서버 7.2.1 이상”이 아니라 다음 조합으로 고정해야 한다.

- Zabbix server/proxy 버전
- Agent 2 버전
- NVIDIA plugin 버전
- 공식 template 버전
- NVIDIA driver/NVML/GPU 모델
- OS/architecture

#### Z2. Agent + `nvidia-smi` UserParameter

7.0 LTS에서 기존 Agent를 유지하려는 고객의 fallback이다. 지표마다 `nvidia-smi`를 실행하면 부하와 프로세스 수가 증가하므로 다음 형태를 권고한다.

1. 하나의 master UserParameter가 GPU 전체를 CSV 또는 구조화 JSON으로 한 번 수집한다.
2. UUID를 포함한 LLD와 dependent item으로 분해한다.
3. shell argument를 외부 입력으로 받지 않는다.
4. timeout, 동시 실행 방지, 출력 크기 상한을 둔다.
5. 빈 값·`N/A`·`[Not Supported]`를 숫자 0으로 변환하지 않는다.

이 경로는 공식 template와 호환되는 척하지 않고 별도 `profileId`를 가져야 한다.

#### Z3. DCGM Exporter → Zabbix HTTP agent

Zabbix Agent 없이도 Zabbix가 저장·알람 정본이 될 수 있는 경로다. 단, “에이전트가 없다”는 것은 Zabbix Agent가 없다는 뜻일 뿐 GPU 호스트에는 DCGM Exporter가 필요하다.

Zabbix 7.0.6에서 실제로 검증해야 할 항목은 다음과 같다.

- HTTP agent의 `/metrics` 응답 크기와 timeout
- Prometheus preprocessing과 label 추출
- GPU UUID 기반 LLD
- master item 1회 수집 후 dependent item 분해
- URL macro와 proxy 경유
- exporter endpoint의 TLS·인증 또는 네트워크 접근 제한
- GPU 수 증가에 따른 payload·dependent item 수
- counter reset과 stale series 제거

DCGM 기본 활성 지표만으로 `vram.total`, `power.limit`, ECC를 항상 제공한다고 약속하면 안 된다. `FB_USED/FREE/RESERVED`로 total을 합성하는 것도 같은 시각·동일 GPU·완전한 관측이 확인된 경우에만 허용해야 한다.

#### Z4. SSH agent

호스트에 Zabbix Agent나 exporter를 설치할 수 없지만 SSH는 허용되는 환경의 임시 경로다. 상시 대규모 수집에는 권고하지 않는다.

- private key 또는 SSH credential이 Zabbix에 저장된다.
- host-key verification을 필수화해야 한다.
- 화면 조회가 SSH 실행을 직접 유발해서는 안 된다.
- 짧은 주기 수집은 SSH handshake·프로세스 실행 부하가 크다.
- 명령 allowlist, 전용 저권한 계정, 감사 기록, 자격증명 만료 정책이 필요하다.

#### Z5. Trapper 또는 `history.push`

고객이 이미 GPU 수집 스크립트를 운용하는 경우 수용 가능한 경로다. Zabbix Agent는 없어도 되지만 별도 on-host collector가 필요하다. 데이터 중복·재전송·시간 역전·item type 불일치가 발생할 수 있어 push receipt와 항목별 오류를 확인해야 한다.

#### Z6/R1. BMC Redfish

DGX 계열에서는 호스트 OS가 죽거나 격리돼도 GPU별 온도·전력·UUID/serial을 읽을 수 있다는 장점이 있다. 반면 활동률·VRAM·clock 같은 in-band telemetry를 대체하지 못한다.

따라서 Redfish 장비는 다음과 같이 표시한다.

- `capabilityTier=OOB_HARDWARE`
- 온도·전력·식별: 지원되는 경우 값 제공
- 활동률·VRAM·clock: `UNSUPPORTED`
- “수집 정상”과 “GPU workload 정상”을 분리
- 일반 Redfish 장비가 DGX와 같은 GPU schema를 제공한다고 가정하지 않음

#### P1/P2. 고객 Prometheus 직접 조회

고객 Prometheus가 이미 DCGM Exporter를 scrape한다면 가장 자연스러운 agentless 읽기 경로다. MovesEye가 같은 exporter를 Zabbix로 다시 scrape하면 저장·부하·알람이 중복된다.

다만 현재 구조에서 Prometheus 직접 조회는 adapter 하나만 추가하는 작업이 아니다.

- `DataSourceRegistry`가 현재 `zabbix-default` 단일 소스로 고정돼 있다.
- `LicenseGuardedMetricPort`도 현재 `zabbixMetricAdapter`를 직접 감싼다.
- Prometheus에는 일반적인 호스트 inventory 개념이 없다.
- GPU UUID·host·model label 계약을 별도로 정해야 한다.
- Alertmanager가 없으면 GPU health는 `UNKNOWN/NOT_INTEGRATED`다.
- 현재 인증이 Zabbix에 의존하므로 Prometheus-only 제품 구성은 별도 범위다.

첫 구현은 “Zabbix-backed 설치에서 GPU 지표만 Prometheus에서 읽는 보조 소스”로 제한하는 것이 안전하다.

#### M1/M2. MovesEye 자체 수집·저장

중앙 저장소가 전혀 없는 고객을 위한 최종 fallback이다. 두 형태가 가능하다.

- `DCGM Exporter → OTel Collector prometheus receiver → OTLP → MovesEye`
- `MovesEye scheduler → DCGM Exporter scrape → MovesEye`

기존 APM ingest의 body 상한, receive token, allowlist, partition, retention, drop 통계 패턴은 참고할 수 있다. 그러나 `apm_metric_1m`은 `service_id/instance_id` 중심이므로 GPU 데이터를 그대로 넣어서는 안 된다. GPU host/UUID·counter·gauge·단위·보존을 위한 별도 schema와 ingest 경계가 필요하다.

#### C1. 클라우드 API

CloudWatch 등에 GPU 지표가 게시된 경우 사용할 수 있다. EC2 기본 지표만으로 GPU 지표 세트가 충족된다고 가정하지 않고, custom metric 또는 관리형 integration의 실제 namespace·dimension을 프로필로 등록해야 한다.

현재 AWS 구현의 원칙을 재사용한다.

- 표준 credential chain 우선
- 설정 credential은 암호화
- read-only IAM
- 요청 예산을 원자적으로 예약
- access denied를 설정 없음으로 오해하지 않음
- 유료 API는 명시적 opt-in
- GPU UUID dimension이 없으면 다른 경로와 자동 병합하지 않음

---

## 2. 경로별 비교표

### 2.1 지표·설치·호환성

| 경로 | 얻을 수 있는 지표 | 고객 설치 부담 | Zabbix 버전 의존 | NVIDIA UUID | 주요 단위 주의 |
|---|---|---:|---|---|---|
| Z1 공식 plugin | 활동률, memory activity, VRAM, 온도, 전력, clock, P-state, PCIe, 일부 ECC 등 | 중간: Agent 2 plugin/template/NVML | **7.2.1+ 필수** | 공식 discovery로 가능 | template 전처리 후 B/W/Hz 여부를 실제 item `units`로 확인 |
| Z2 UserParameter | `nvidia-smi`가 제공하는 활동률, VRAM, 온도, 전력, clock, P-state, PCI·ECC 일부 | 중간~높음: script·template 유지 | 낮음. 7.0에서도 가능하나 자체 검증 필요 | `nvidia-smi --query-gpu=uuid`로 가능 | VRAM MiB→B, clock MHz, power W, `N/A` 처리 |
| Z3 DCGM HTTP agent | DCGM 기본 지표: utilization, FB used/free/reserved, 온도, 전력, energy, clock, XID, PCIe replay, remapped rows 등 | 중간~높음: exporter + Zabbix custom template | 공식 NVIDIA plugin과 무관. 7.0 preprocessing 실측 필요 | exporter label에서 확보 필요 | FB 계열 MiB→B, energy mJ counter, replay/XID 의미 구분 |
| Z4 SSH | Z2와 유사 | 설치는 낮지만 운영·보안 부담 높음 | SSH item 지원 범위 | 가능 | Z2와 동일 |
| Z5 trapper/push | 스크립트 구현 범위 | 높음: 별도 daemon/cron | 비교적 낮음 | payload에 필수 | sender timestamp·중복·재전송 처리 |
| Z6 Redfish→Zabbix | DGX 기준 온도·전력·UUID/serial | 낮음~중간: BMC 계정·망 연결 | HTTP agent 기능만 의존 | DGX에서는 가능, 장비별 검증 | sensor 단위와 scale 확인 |
| P1 고객 Prometheus | DCGM exporter가 저장한 전체 지표 | 이미 Prometheus가 있으면 낮음 | 없음 | label 계약에 따라 가능 | PromQL에서 unit 변환 중복 금지 |
| M1 OTel→MovesEye | 수신 allowlist에 등록한 DCGM 지표 | 높음: Collector 배포·토큰·TLS | 없음 | resource/metric attribute 계약 필요 | OTLP cumulative temporality, counter reset |
| M2 직접 scrape | DCGM exporter 지표 | 중간: exporter와 네트워크 | 없음 | label 계약에 따라 가능 | Prometheus text parsing·sample timestamp |
| R1 direct Redfish | Z6과 동일 | 낮음~중간 | 없음 | 장비별 | sensor schema·단위 |
| C1 Cloud API | 게시된 custom/managed GPU metric 범위 | 중간 | 없음 | dimension에 있어야 확정 | provider namespace별 단위·period |

### 2.2 정본·보존·보안·우리 비용

| 경로 | 알람 정본 | 보존·부하 | 자격증명 위치 | 우리 구현 비용 | 판정 |
|---|---|---|---|---:|---|
| Z1 | Zabbix 공식 trigger/problem | Zabbix 정책. 추가 PG 적재 없음 | 기존 Zabbix Agent TLS·세션 | 낮음~중간 | 7.2.1+ 최우선 |
| Z2 | Zabbix 사용자 trigger | `nvidia-smi` 실행 부하. master 1회 수집 필수 | Agent 실행 계정·Zabbix TLS | 중간 | 7.0 Agent 보유 고객 fallback |
| Z3 | Zabbix 사용자 trigger | exporter 1 scrape + dependent item. item 수·history 크기 관리 | exporter 접근은 proxy/server, 필요 시 TLS credential | 중간~높음 | **7.0 기본 권고** |
| Z4 | Zabbix trigger | 짧은 주기 SSH 부하가 큼 | Zabbix credential store | 중간 | 임시 opt-in |
| Z5 | Zabbix trigger | push 중복·유실·시각 관리 필요 | push token/host permission | 중간~높음 | 기존 고객 collector 수용용 |
| Z6 | Zabbix Redfish trigger | BMC polling은 보수적 주기 | BMC credential을 Zabbix에 저장 | 중간 | OOB 보조 |
| P1 | Alertmanager 연동 시 Alertmanager, 없으면 없음 | 조회 부하는 고객 Prometheus. MovesEye는 query cache·point budget 필요 | MovesEye 설정에 read-only bearer/basic/mTLS, 암호화 | **높음** | 기존 Prometheus 고객의 장기 권고 |
| M1 | 초기에는 없음. 후속 MovesEye rule 필요 | MovesEye가 ingest·partition·retention 전부 부담 | OTLP receive token은 원문 미저장·TLS | 매우 높음 | 중앙 저장소 없는 고객만 |
| M2 | 초기에는 없음 | scrape scheduler·HA·retention 부담 | endpoint credential이 MovesEye에 위치 | 매우 높음 | M1보다 운영 결합도가 높아 후순위 |
| R1 | BMC event adapter가 없으면 없음 | 최신 polling은 가볍지만 시계열 저장 시 비용 증가 | `SettingSecretCodec` 계열 암호화 | 중간~높음 | 제한 화면만 우선 가능 |
| C1 | CloudWatch Alarm 등 공급자 알람 | API rate/cost/retention 적용 | AWS standard chain 또는 암호화 설정 | 중간~높음 | custom metric 계약이 있는 고객만 |

알람 정본이 구성되지 않은 경로에서 `NO_ACTIVE_ALERT`를 반환해서는 안 된다. 이 경우 `health=UNKNOWN`, `alarmIntegration=NOT_CONFIGURED`가 맞다.

---

## 3. 고객 환경별 결정 트리

### 3.1 1차 결정: 기존 GPU 시계열 저장소가 있는가

1. 고객 Prometheus 또는 호환 TSDB가 이미 DCGM Exporter를 수집한다.
   - 권고: **P1 고객 Prometheus 직접 조회**.
   - Zabbix로 같은 exporter를 중복 수집하지 않는다.
   - 단, Prometheus adapter와 명시적 host binding이 출시되기 전까지는 지원 대기 상태다.
   - Alertmanager 미연동 시 health는 `UNKNOWN`.

2. GPU 지표는 없지만 Zabbix가 있다.
   - 다음의 Zabbix 분기로 이동한다.

3. Zabbix도 Prometheus도 없다.
   - OTel Collector를 배치할 수 있으면 M1.
   - MovesEye가 exporter에 접근할 수 있고 자체 저장 운영을 감수하면 M2.
   - 어떤 host component도 설치할 수 없으면 Redfish로 제한된 OOB 관측만 제공한다.

### 3.2 Zabbix 고객 결정

```text
Zabbix 사용
├─ server/proxy/Agent 2/plugin/template가 7.2.1+ 호환인가?
│  ├─ 예 → Z1 공식 NVIDIA plugin
│  └─ 아니오, 특히 7.0 LTS
│     ├─ GPU 호스트에 DCGM Exporter 설치 가능
│     │  └─ Z3 DCGM Exporter → Zabbix HTTP agent (권고)
│     ├─ exporter는 불가하지만 기존 Zabbix Agent는 사용 가능
│     │  └─ Z2 nvidia-smi master UserParameter + dependent items
│     ├─ host software 설치 불가, SSH는 허용
│     │  └─ Z4 SSH agent (임시·저빈도·명시적 opt-in)
│     └─ host software와 SSH 모두 불가
│        ├─ DGX BMC Redfish 가능 → Z6 제한 관측
│        └─ Redfish도 없음 → GPU workload telemetry 지원 불가
```

### 3.3 Zabbix 7.0 LTS 고객

권고 순서는 다음과 같다.

1. 이미 Prometheus가 DCGM을 저장한다면 Prometheus 직접 조회.
2. 그렇지 않으면 `DCGM Exporter → Zabbix HTTP agent`.
3. exporter를 설치할 수 없고 기존 Agent만 있다면 `nvidia-smi` UserParameter.
4. SSH는 임시 대안.
5. Redfish는 workload 지표의 대체가 아니라 OOB 보조.

공식 Agent 2 NVIDIA plugin을 7.0에 비공식 복사·백포트해서 표준 지원 경로로 선언하지 않는다.

### 3.4 “에이전트를 설치할 수 없는 장비”

“에이전트 없음”을 세 단계로 구분해야 한다.

| 제약 | 가능한 경로 |
|---|---|
| Zabbix Agent만 금지, exporter는 가능 | DCGM Exporter → Zabbix HTTP agent 또는 고객 Prometheus |
| 모든 host daemon 금지, SSH 명령은 허용 | Zabbix SSH agent. 저빈도·임시 사용 |
| OS 접근과 host software 모두 금지 | DGX BMC Redfish의 온도·전력·식별만 |
| BMC/API도 없음 | GPU telemetry 수집 불가. 네트워크 ping이나 호스트 상태로 대체했다고 표현하지 않음 |

### 3.5 클라우드 GPU

1. 고객이 DCGM/Cloud agent를 통해 CloudWatch 등에 GPU UUID가 포함된 custom metric을 게시한다.
   - Cloud adapter 사용 가능.
2. instance ID와 GPU index만 있고 UUID가 없다.
   - source 내부 표시만 가능하며 다른 경로와 자동 병합하지 않는다.
3. API 호출이 유료이거나 제한적이다.
   - 기존 AWS 경로처럼 opt-in, 호출 예산, cache, access-denied 상태를 별도로 제공한다.

---

## 4. 경로가 달라도 화면·API가 같아지는 구조

### 4.1 canonical GPU 모델

```text
GpuTarget
  targetId                 MovesEye 논리 장비 ID
  canonicalHostId          명시적으로 바인딩된 호스트
  gpuUuid                  NVIDIA physical GPU UUID
  vendor                   NVIDIA
  model, serialNumber, pciBusId
  physicalKind             PHYSICAL | MIG | UNKNOWN
  identityQuality          STRONG | SOURCE_SCOPED | UNVERIFIED

GpuObservation
  metric                   MetricRef(domain=GPU, name, dims)
  value | textValue
  unit
  observedAt
  status                   OK | STALE | DISABLED | UNSUPPORTED | NO_DATA | ERROR
  reasonCode
  provenance               sourceId, profileId, nativeSeriesId
  expectedIntervalSeconds

GpuCollectionProfile
  profileId
  sourceId
  kind                     ZABBIX_NVML | ZABBIX_NVIDIA_SMI |
                           ZABBIX_DCGM_HTTP | PROMETHEUS_DCGM |
                           REDFISH | MOVESEYE_OTLP | CLOUD
  metricCapabilities
  storageAuthority
  alarmAuthority
  freshnessPolicy
  unitProfileVersion
  enabled
```

`sourceId`는 저장소·adapter 인스턴스를, `profileId`는 그 소스에 데이터가 들어온 수집 방식을 뜻한다. 예를 들면 같은 `zabbix-default` 안에서도 `zabbix-nvml-agent2-v1`과 `zabbix-dcgm-http-v1`은 서로 다른 프로필이다.

### 4.2 기존 제안에 대한 판단

| 기존 안 | 판단 | 변경 내용 |
|---|---|---|
| `MetricDomain.GPU` | **유지·신설** | canonical 수치 이름과 UUID 차원을 표현하는 올바른 축이다 |
| `GpuInventoryPort` | **개념은 유지하되 수정** | inventory·식별·metadata·capability만 반환한다. 최신 수치와 Zabbix item 상태를 한 snapshot에 혼합하지 않는다 |
| 최신값을 `LatestValue`로 조회 | **폐기** | primitive `double`과 `parseDoubleOrZero` 때문에 결측·오류가 0으로 변한다 |
| `GpuTelemetryPort` | **신설** | 최신 관측 상태·진단·프로필별 capability를 typed model로 반환 |
| `querySeriesChecked` | **폐기** | 이미 존재하는 `MetricPort.querySeriesResult`를 재사용·확장한다 |
| 시계열 저장소별 adapter | **유지** | Zabbix/Prometheus/local repository가 같은 `MetricRef(GPU, ...)`를 제공 |
| 건강 판정=Zabbix 이벤트 | **수정** | 프로필의 단일 `alarmAuthority`가 기준. 미연동은 UNKNOWN |

권고 포트 경계는 다음과 같다.

| 포트 | 책임 |
|---|---|
| `GpuInventoryPort` | 장비 발견, UUID·model·serial·PCI·MIG 여부, identity evidence |
| `GpuTelemetryPort` | 최신값, 값 상태, source diagnostics, collection profile |
| `MetricPort.querySeriesResult` | canonical GPU 시계열과 전체 조회 완전성 |
| `AlertPort` | 선택된 alarm authority의 활성 알람·이력 |
| app `GpuQueryService` | host 권한, profile 선택, 병합, 상태·집계, REST DTO |

`GpuInventoryPort`와 `GpuTelemetryPort`의 모든 구현은 기존 live-query license guard와 같은 위치에서 차단해야 한다. raw adapter를 직접 주입하는 우회 경로를 만들면 안 된다.

### 4.3 `querySeriesResult` 보강

현재 `SeriesResult`는 `complete`, `stopReason`, `deliveredPoints`만 제공한다. 반면 GPU 계약은 지표별 invalid point와 단위 오류를 요구한다. 또한 현재 `ZabbixMetricAdapter`는 시계열의 잘못된 숫자를 0으로 변환한다.

따라서 다음과 같이 수정하는 것이 맞다.

- 새 `querySeriesChecked` 메서드는 만들지 않는다.
- 기존 `SeriesResult`에 선택적 `List<SeriesQuality>`를 추가한다.
- `SeriesQuality`는 entity/metric, `invalidPointCount`, `state`, `reasonCode`를 가진다.
- 기존 도메인은 빈 quality 목록으로 호환한다.
- `MetricDomain.GPU`는 adapter에서 strict parse한다.
- `NaN`, `Infinity`, 빈 값, sentinel을 0으로 바꾸지 않는다.
- 구현 전까지 API 계약의 `invalidPointCount`를 실제 제공되는 것처럼 확정하지 않는다.

### 4.4 capability tier

Redfish처럼 제한된 경로가 항상 `UNAVAILABLE`이 되지 않도록 required metric을 전역 고정하지 않는다.

| Tier | 필수 관측 |
|---|---|
| `CORE_TELEMETRY` | utilization, vram.used, vram.total, temperature, power.draw |
| `EXTENDED_DCGM` | CORE + XID, PCIe replay, remapped rows, energy 등 프로필 지원 항목 |
| `OOB_HARDWARE` | identity와 프로필이 선언한 temperature/power |
| `IDENTITY_ONLY` | UUID/model/serial만. workload 상태 판정 불가 |

`dataStatus`는 선택된 tier의 필수 관측을 기준으로 계산하고, `health`는 alarm authority를 기준으로 별도 계산한다.

### 4.5 동일 GPU를 두 경로가 수집할 때의 정본 규칙

1. **병합 조건**
   - canonical host binding이 양방향으로 유일해야 한다.
   - NVIDIA physical GPU UUID가 동일해야 한다.
   - hostname이나 IP 문자열 하나만 같다는 이유로 병합하지 않는다.
   - Redfish UUID와 in-band UUID가 실제로 같은 형식이라는 증거가 없으면 병합하지 않는다.

2. **정본 선택**
   - 대상별·metric group별 `primaryProfileId`를 명시적으로 설정한다.
   - 기본 그룹은 `CORE`, `RELIABILITY`, `OOB`, `ALERT`로 나눈다.
   - 예: CORE=Zabbix NVML, RELIABILITY=DCGM Prometheus, OOB=Redfish, ALERT=Zabbix.

3. **fallback**
   - primary 장애 시 secondary 값을 조용히 대신 보여 주지 않는다.
   - 명시적 failover 설정이 있는 경우에만 전환한다.
   - 전환 시 provenance와 `SOURCE_SWITCH` 경계를 표시한다.
   - 서로 다른 소스의 과거 점을 하나의 연속선으로 이어 붙이지 않는다.

4. **집계**
   - logical `targetId`당 한 번만 합산한다.
   - secondary 관측은 비교·진단에만 쓰고 totals에 중복 반영하지 않는다.
   - source별 값 차이가 임계치를 넘으면 `SOURCE_DIVERGENCE` 진단을 제공할 수 있다.

5. **알람**
   - target당 `alarmAuthority`는 하나다.
   - Zabbix problem과 Alertmanager alert를 동시에 같은 활성 알람 수에 더하지 않는다.
   - authority가 없으면 `NO_ACTIVE_ALERT`가 아니라 `UNKNOWN`이다.

### 4.6 캐시와 자격증명

- 목록 snapshot은 `RedisCache.getOrLoad`를 사용한다. 이 클래스가 이미 `SingleFlightExecutor`를 포함하므로 별도 single-flight를 다시 중첩하지 않는다.
- cache key에는 principal, 권한 host fingerprint, sourceId, profileId, scope, query가 포함돼야 한다.
- profile 설정이 바뀌면 관련 cache generation을 무효화한다.
- Prometheus/BMC/cloud credential은 app 설정 계층에서 `SettingSecretCodec`으로 암호화한다.
- engine-api 모델이나 브라우저 응답에 credential을 넣지 않는다.
- 고객이 입력하는 endpoint에는 scheme/host allowlist, loopback·metadata IP 차단 등 SSRF 방어가 필요하다.

---

## 5. 단계 계획

### 단계 0 — 계약과 수집 프로필 정리

**범위**

- 기존 09-17 설계를 이 제안에 맞게 개정
- canonical metric 이름·type·unit 확정
- `GpuInventoryPort`/`GpuTelemetryPort` 책임 분리
- `MetricDomain.GPU`와 source/profile/provenance 계약
- 공식 NVML, `nvidia-smi`, DCGM, Redfish fixture 정의
- 설치 안내의 환경 판정 UX 설계

**완료 기준**

- 네 프로필의 같은 의미 지표가 같은 canonical 값으로 변환됨
- 0·결측·미지원·오류 fixture가 구분됨
- agentless의 의미와 제한이 설치 안내에 드러남
- 다중 경로 병합·alarm authority 규칙이 API 계약에 반영됨

**실장비 없이 가능**

설계, DTO, parser fixture, 단위 테스트, API schema, FE 상태 fixture까지 가능하다.

### 단계 1 — Zabbix 7.0 기본 경로

**우선 구현**

`DCGM Exporter → Zabbix HTTP agent → Zabbix history/trends → MovesEye`

현재 dev 7.0.6에서 검증할 수 있고 Zabbix Agent가 없어도 되며, Zabbix를 기존 저장·알람 정본으로 유지할 수 있기 때문이다.

**포함**

- `MetricDomain.GPU`
- `zabbix-dcgm-http-v1`
- UUID 기반 LLD/item mapping
- 목록·상세·시계열·진단 API
- `CORE_TELEMETRY`/`EXTENDED_DCGM` capability
- Zabbix trigger 연결
- 설치 가이드와 환경 진단
- strict numeric parsing
- `SeriesResult` per-series quality 보강
- `DmovePermissions`의 GPU view 권한

**완료 기준**

- Zabbix 7.0.6 mock·fixture에서 UUID별 지표가 혼선 없이 조회됨
- master/dependent 실패가 최신 상태에 반영됨
- history/trend 완전성 상한이 조용히 절단되지 않음
- exporter 장애가 “GPU 없음”으로 표시되지 않음
- Zabbix API 호출 수가 GPU 수×지표 수로 증가하지 않음

**실장비 없이 가능한 한계**

fixture 기반 구현 완료까지다. 실제 exporter label, LLD, polling 부하, driver 호환을 검증하기 전에는 제품 지원 완료로 선언하지 않는다.

### 단계 2 — Zabbix Agent 경로 확대

**포함**

- `zabbix-nvml-agent2-v1`: 7.2.1+ 공식 plugin/template
- `zabbix-nvidia-smi-v1`: 7.0 Agent fallback
- version detection과 설치 경로 선택
- 프로필 간 단위·지표 비교 QA

**완료 기준**

- 공식 경로는 실제 7.2.1+ 조합에서 template/item/trigger 실측
- UserParameter는 1/8 GPU, idle/busy, `N/A`, timeout 검증
- 동일 UUID의 두 프로필이 자동 중복 합산되지 않음

### 단계 3 — 고객 Prometheus 직접 조회

엔진 Phase 1 스텝 6을 재개하는 단계다.

**포함**

- `engine-prometheus`
- 다중 source router와 동적 `DataSourceRegistry`
- `LicenseGuardedMetricPort → RoutingMetricPort → source adapter` 순서
- Prometheus connection·credential·health
- GPU label contract와 수동 host binding
- query range/point/call budget
- Alertmanager는 별도 capability로 분리

**완료 기준**

- 기존 Zabbix 경로 REST 회귀 없음
- 동일 canonical GPU API가 Prometheus에서도 동작
- UUID/host label 누락 시 fail-closed
- Alertmanager 미연동 시 health가 UNKNOWN
- Prometheus-only 제품 인증은 별도 범위라는 제한이 명시됨

### 단계 4 — Redfish 직접 및 자체 저장

**Redfish**

- DGX 검증 프로필부터 시작
- `OOB_HARDWARE` 화면 제공
- BMC event 연동은 후속

**MovesEye 자체 저장**

- OTel Collector 수신을 direct scrape보다 우선
- GPU 전용 ingest token/scope
- GPU 전용 partition·retention·rollup schema
- counter와 gauge 저장 규칙
- drop·중복·out-of-order 통계
- 알람 엔진은 별도 단계

**완료 기준**

- 기존 APM 테이블과 entitlement를 재사용하지 않음
- 수신 중단·재전송·counter reset·retention 검증
- 저장 용량·쓰기율 예산 수립

### 단계 5 — 클라우드 프로필

- CloudWatch custom metric 등 실제 계약이 있는 공급자만 추가
- UUID dimension, period, retention, API 비용 확인
- 기존 AWS budget reservation·credential chain·opt-in 원칙 재사용

### 보류 유지

LLM serving engine, KV cache, TTFT/ITL/TPOT, synthetic inference, 응답 품질 판정은 본 단계 계획에 포함하지 않는다.

---

## 6. 기존 09-17 설계 중 고쳐야 할 곳

| 파일·절 | 기존 내용 | 수정안 |
|---|---|---|
| [장기 설계 §4](solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%84%A4%EA%B3%84-%EC%B4%88%EC%95%88.md) | P1을 공식 Agent 2 plugin 중심으로 결정 | Zabbix 버전·설치 제약에 따른 수집 프로필 매트릭스로 대체. 7.0 기본은 DCGM HTTP |
| [장기 설계 §4 P2](solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%84%A4%EA%B3%84-%EC%B4%88%EC%95%88.md) | DCGM 경로를 P2로 유예 | dev 7.0에서 공식 plugin을 쓸 수 없으므로 Zabbix HTTP agent용 DCGM을 P1 후보로 승격 |
| [P1 §0·§3](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | 공식 GPU item 단일 경로가 P1 정본 | 공식·custom Agent·HTTP agent를 서로 다른 profile로 분리. plugin 지원 여부를 런타임 전제로 삼지 않음 |
| [P1 §1](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `ZabbixBasicItem`에 `lastclock` 없음 | `lastclock`은 ZM-159로 이미 존재. `state/error/status/delay/master_itemid/preprocessing` 부족만 남은 것으로 수정 |
| [P1 §4](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `nvml.device.*` 키를 P1 공통 키로 고정 | 공식 7.2.1+ 프로필의 키로 한정. DCGM·UserParameter는 별도 key/unit profile 사용 |
| [P1 §5.1](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `GpuInventoryPort` snapshot에 inventory·최신값·상태·diagnostics 혼합 | inventory와 telemetry 포트 분리. Zabbix item 세부 정보는 adapter diagnostics에만 유지 |
| [P1 §5.3](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | 신규 `querySeriesChecked` 추가 | 폐기. 기존 [`querySeriesResult`](/C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/port/MetricPort.java:39)를 재사용하고 per-series quality를 보강 |
| [P1 §6](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | 고정 5개 required metric | `capabilityTier`별 필수 지표로 변경. Redfish는 별도 OOB tier |
| [P1 §7](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | 건강 판정은 Zabbix 이벤트가 기준 | profile별 단일 `alarmAuthority`가 기준. Prometheus·Redfish 미연동은 UNKNOWN |
| [P1 §8](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `sourceId=zabbix-default` 단일 | sourceId와 profileId를 분리하고 target/provenance를 응답에 추가 |
| [P1 §10](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `SingleFlightExecutor` 직접 사용 제안 | 신규 snapshot cache는 [`RedisCache.getOrLoad`](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/common/redis/RedisCache.java:75) 사용. 이미 single-flight가 내장됨 |
| [P1 §12](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | `monitoring/gpuMonitoring.view`를 문자열 경로처럼 기술 | 현재 module/feature 구조에 맞춰 `module("monitoring", feature("gpuMonitoring", ...))`로 명시. 저장 역할 JSON 이관 필요 |
| [P1 §13](solutions--NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) | Flyway 필요 여부 미정 | GPU 권한을 추가하면 migration은 필수. 현재 최신은 V68이므로 착수 시 첫 가용 번호를 다시 확인 |
| [API 계약 §1](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) | `zabbix-default`만 허용 | `targetId`, `sourceId`, `profileId`, provenance, capability tier를 계약에 포함 |
| [API 계약 §3](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) | 전 장비에 고정 16개 metrics map | canonical key는 유지하되 profile capability와 `UNSUPPORTED` 근거를 함께 반환 |
| [API 계약 §6](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) | `querySeriesChecked`, `invalidPointCount`가 이미 구현되는 것처럼 기술 | `querySeriesResult` 기반으로 교체. per-series quality가 구현되기 전에는 `invalidPointCount`를 확정 계약에서 제거 |
| [API 계약 §7](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) | diagnostics가 Zabbix item 중심 | 공통 collection diagnostics와 source-specific admin details를 분리 |
| [API 계약 §8](../06-API-%EA%B3%84%EC%95%BD/solutions--GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) | source unsupported가 사실상 non-Zabbix만 의미 | 지원하지 않는 source와 지원하지 않는 profile/version을 별도 오류로 구분 |

현재 코드 근거상 추가로 반영해야 할 사항은 다음과 같다.

- [`MetricDomain`](/C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/metric/MetricDomain.java:10)에 GPU가 없다.
- [`LatestValue.value`](/C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/engine/model/metric/LatestValue.java:17)는 primitive `double`이다.
- [`ZabbixMetricAdapter.parseDoubleOrZero`](/C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:699)는 잘못된 값을 0으로 만든다.
- [`ZabbixBasicItem`](/C:/solutions/moveseye-be-spring/engine-api/src/main/java/com/dmove/moveseye/zabbix/item/model/ZabbixBasicItem.java:13)은 `lastclock`만 추가됐고 상태 필드는 없다.
- [`ZabbixDataSourceRegistry`](/C:/solutions/moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixDataSourceRegistry.java:20)는 단일 소스로 하드와이어돼 있다.
- [`LicenseGuardedMetricPort`](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/integration/LicenseGuardedMetricPort.java:46)는 다중 소스 도입 시 router가 `@Primary`가 돼야 한다는 방향을 이미 주석으로 명시한다.
- APM의 [`apm_metric_1m`](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V38__apm_p1.sql:209)은 GPU 저장소로 직접 재사용할 수 없다.

---

## 7. 위험과 미검증 항목

### 7.1 확인된 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| 공식 plugin을 7.0 고객에게 안내 | 설치 실패·지원 불가 | version gate와 프로필 분기 |
| invalid 숫자가 0으로 변환 | 장애·미지원을 idle로 오판 | GPU strict parser, per-series quality |
| DCGM 기본 지표에 필수값 부족 | `vram.total`, power limit 등을 과장 | capability 기반 UI, 합성값은 증거 있을 때만 |
| 다중 경로 자동 병합 | 중복 집계·잘못된 GPU 연결 | 명시 host binding + UUID 모두 필요 |
| source 자동 fallback | 그래프 의미·알람 정본 변경 | 명시적 전환과 provenance 표시 |
| Prometheus label 고카디널리티 | 쿼리·메모리 부하 | allowlist, label contract, query budget |
| Zabbix dependent item 폭증 | item/history 부하 | master scrape 1회, 수집 간격·retention 산정 |
| SSH credential 집중 | 침해 범위 확대 | 전용 계정, host-key 검증, opt-in, 감사 |
| BMC polling 과다 | management plane 부하 | 긴 기본 주기·동시성 제한 |
| 자체 저장 도입 | PG 용량·쓰기·retention 책임 증가 | 중앙 저장소가 없는 고객에만 후순위 제공 |
| 알람 소스 중복 | 같은 장애가 여러 건으로 표시 | target당 단일 alarmAuthority |
| 권한 축 없는 cache | 사용자 간 데이터 유출 | principal·scope fingerprint를 cache key에 포함 |

### 7.2 아직 확인하지 못한 가정

다음 항목은 사실이 아니라 구현 전 검증해야 할 가정이다.

1. **가정:** Zabbix 7.0.6의 HTTP agent와 Prometheus preprocessing만으로 DCGM payload의 UUID별 LLD·dependent item 구성이 안정적으로 가능하다.
2. **가정:** 대상 GPU 수와 기본 DCGM payload 크기가 Zabbix HTTP item의 timeout·response 상한 안에 든다.
3. **가정:** DCGM exporter label에 모든 환경에서 안정적인 physical GPU UUID와 model 식별자가 존재한다.
4. **가정:** `FB_USED+FB_FREE+FB_RESERVED`가 모든 지원 환경에서 VRAM total을 안전하게 재구성할 수 있다. 검증 전에는 total을 합성하지 않는다.
5. **가정:** `nvidia-smi` CSV field와 sentinel이 대상 driver/OS에서 일관된다.
6. **가정:** 고객 Prometheus의 retention과 query concurrency가 MovesEye chart polling을 감당한다.
7. **가정:** Prometheus label의 `instance`가 MovesEye/Zabbix host와 유일하게 연결된다. 이름 일치만으로는 검증된 것으로 보지 않는다.
8. **가정:** DGX 이외 BMC가 동일 수준의 GPU Redfish schema를 제공한다.
9. **가정:** CloudWatch custom GPU metric에 UUID와 충분한 resolution이 포함된다.
10. **가정:** 실제 고객이 Prometheus-only 설치를 요구한다. 현재 인증·관리 기능은 여전히 Zabbix 의존성이 크다.
11. **가정:** 30초 수집 주기가 GPU 수·Zabbix item 수·exporter 부하에 적합하다.
12. **가정:** 공식 template의 모든 unit과 preprocessing이 7.2.x 이후 버전에서도 동일하다.
13. **가정:** GPU 교체·MIG 재구성·vGPU 환경에서도 physical UUID 의미가 동일하다.
14. **가정:** Zabbix trigger, Alertmanager alert, BMC event를 GPU UUID에 정확히 귀속할 수 있다.

실장비 없이 완료할 수 있는 것은 parser·contract·fixture·권한·캐시·API/FE 상태 검증까지다. 실제 지원 선언에는 최소한 다음 조합의 런타임 증거가 필요하다.

- Zabbix 7.0.6 + DCGM Exporter
- Zabbix 7.0.6 + Agent/UserParameter
- Zabbix 7.2.1+ + 공식 NVIDIA plugin
- 다중 physical GPU
- idle/busy, exporter 중단, driver 오류, UUID index 변경
- Prometheus query와 Alertmanager 미연동 상태
- DGX Redfish 또는 지원 대상으로 선언할 BMC

## Claude 안과 대조할 쟁점

1. Zabbix 7.0 고객의 1차 기본 경로를 `DCGM Exporter → HTTP agent`로 둘 것인가, 기존 Agent의 `nvidia-smi UserParameter`로 둘 것인가?
2. `GpuInventoryPort`가 최신값까지 포함하는 snapshot을 유지할 것인가, inventory와 `GpuTelemetryPort`를 분리할 것인가?
3. 고객 Prometheus 직접 조회를 엔진 스텝 6의 우선 재개 사유로 볼 것인가, Zabbix 수집 프로필을 모두 완성한 뒤로 미룰 것인가?
4. 다중 경로에서 metric group별 primary를 허용할 것인가, 운영 단순성을 위해 GPU target당 단일 primary source만 허용할 것인가?
5. `SeriesResult`를 per-series quality까지 확장할 것인가, P1 API에서 `invalidPointCount`를 제거하고 전체 series 실패로 단순화할 것인가?