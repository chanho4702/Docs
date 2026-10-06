# NVIDIA GPU 수집 경로 설계

작성: Claude · 2026-09-30 · 버전: 1.0 · 상태: **설계 초안 / 구현 미착수 / 사용자 결정 완료(§17) / 다음 = S0 실측 / 코덱스 대조 완료(§11)**

> 같은 과제의 코덱스 독립 제안: [proposal_gpu-collection-paths_codex.md](NVIDIA-GPU-%EC%88%98%EC%A7%91-%EA%B2%BD%EB%A1%9C-%EC%84%A4%EA%B3%84-%EC%A0%9C%EC%95%88-%28Codex%29.md). 두 안의 대조 결과는 §11에 적는다.

## 0. 이 문서의 위치

| 문서 | 역할 | 이 문서와의 관계 |
|---|---|---|
| [devdesign_gpu-monitoring.md](GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%84%A4%EA%B3%84-%EC%B4%88%EC%95%88.md) (09-17) | 장기 방향(P1 단순 GPU → LLM) | 유지. 수집 경로 절(§4)은 이 문서가 대체 |
| [devdesign_gpu-monitoring-p1.md](NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) (09-17) | 목록·상세·시계열·상태 규칙 상세 | 유지. **"공식 템플릿 단일 전제"만 이 문서가 뒤집는다**. 고칠 곳은 §9 |
| [contract_gpu-monitoring.md](../06-API-%EA%B3%84%EC%95%BD/GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-API-%EA%B3%84%EC%95%BD-%EA%B5%AC%ED%98%84-%EC%A0%84-%EC%B4%88%EC%95%88.md) (09-17) | API 계약 DRAFT | 유지. 추가 필드는 §6.4 |

사용자 요구(09-30): **NVIDIA만 고려**. **Zabbix 에이전트로 수집하는 경우**와 **에이전트 없이 API로 수집하는 경우**를 모두 설계한다. LLM은 보류 유지.

## 1. 왜 수집 경로를 다시 설계하는가

09-17 설계는 "Zabbix 공식 NVIDIA 플러그인 + 공식 템플릿" 하나만 전제했다. 09-30에 확인한 사실이 이 전제를 깬다.

| 확인한 사실 | 근거 | 확실성 |
|---|---|---|
| dev Zabbix 서버는 7.0.6 | `apiinfo.version` 실측(09-30), BE README도 7.0.6 명시 | 실측 |
| 공식 NVIDIA 플러그인은 7.2.1에 처음 나왔다 | [What's new in 7.2.1](https://www.zabbix.com/documentation/7.2/en/manual/introduction/whatsnew721): "A Zabbix agent 2 loadable plugin for monitoring NVIDIA GPU metrics is now available." | 1차 자료 |
| 7.0 공식 문서에는 플러그인 페이지가 없다 | 플러그인 문서가 [7.2](https://www.zabbix.com/documentation/7.2/en/manual/appendix/config/zabbix_agent2_plugins/nvidia_gpu)·[7.4](https://www.zabbix.com/documentation/7.4/en/manual/appendix/config/zabbix_agent2_plugins/nvidia_gpu)에는 있고 같은 경로의 7.0 주소는 404 | 1차 자료 |
| 7.0 기본 제공 Agent 2 템플릿 목록에 NVIDIA 없음 | [7.0 Agent 2 템플릿 목록](https://www.zabbix.com/documentation/7.0/en/manual/config/templates_out_of_the_box/zabbix_agent2) 15종 | 1차 자료 |
| 통합 페이지는 템플릿을 7.2·7.4로만 제공 | [zabbix.com/integrations/nvidia](https://www.zabbix.com/integrations/nvidia) | 1차 자료 |
| 7.0 패키지 저장소에 NVIDIA 플러그인 패키지가 없다 | [repo.zabbix.com 7.0](https://repo.zabbix.com/zabbix/7.0/rhel/9/x86_64/)의 Agent 2 플러그인은 ember-plus·mongodb·mssql·postgresql 4종뿐. [7.2 저장소](https://repo.zabbix.com/zabbix/7.2/stable/rhel/9/x86_64/)에는 `zabbix-agent2-plugin-nvidia-gpu` 존재. 소스 배포도 7.2·7.4·8.0 계열만 | 실측(09-30) |
| 플러그인과 에이전트 사이 통신 규약 버전은 7.0용 플러그인과 NVIDIA 플러그인이 같다 | 소스의 `sdk/plugin/comms/protocol.go`: NVIDIA 7.2.1과 PostgreSQL 7.0.31 모두 `ProtocolVersion = "6.4.0"` | 소스 확인(실행 시험 아님) |

**정확한 표현:** 공식 플러그인·템플릿은 **7.2.1부터 공식 제공**이고 7.0 LTS에는 공식 제공되지 않는다. 다만 통신 규약 버전이 같으므로 **플러그인 바이너리를 7.0 Agent 2에 붙이는 것은 될 가능성이 높다**(실행 시험 전, §3 경로 A1′·§8 가정 A1). 막히는 쪽은 플러그인이 아니라 **템플릿**이다 — 7.2 형식 템플릿 파일은 7.0 서버가 가져오지 못하므로 7.0 형식으로 다시 만들어야 한다.

제품은 설치형이고 고객 Zabbix 버전을 우리가 정하지 못한다. 7.0 LTS·6.0 LTS 고객이 흔하므로 **공식 경로 하나만으로는 제품이 성립하지 않는다.**

## 2. "API로 수집"의 뜻 정리

"API로 수집"은 실제로 서로 다른 세 가지다. 누가 API를 부르느냐에 따라 저장소와 구현 비용이 완전히 달라진다.

| 구분 | 누가 부르나 | 어디에 저장 | MovesEye가 읽는 곳 |
|---|---|---|---|
| **α. Zabbix가 부른다** | Zabbix 서버/프록시(HTTP agent 아이템) | Zabbix history/trends | 기존 `engine-zabbix` |
| **β. 고객 저장소를 읽는다** | 고객 Prometheus가 이미 수집 중 | 고객 Prometheus | 신규 어댑터(엔진 스텝 6, 현재 보류) |
| **γ. MovesEye가 직접 받는다** | OTel Collector 또는 MovesEye scrape | MovesEye PostgreSQL | 신규 저장소·조회 계층 |

에이전트 수집도 저장소 기준으로는 α에 속한다. 즉 **"에이전트냐 API냐"는 Zabbix 안에서의 수집 방식 차이**이고, 제품 구조를 가르는 진짜 축은 **저장소가 Zabbix냐 아니냐**다.

## 3. 수집 경로 전수

| # | 경로 | 수집 주체 | GPU 호스트에 필요한 것 | 저장 | Zabbix 버전 의존 |
|---|---|---|---|---|---|
| A1 | 공식 NVIDIA 플러그인 | Zabbix Agent 2 | Agent 2 + nvidia 플러그인 + 드라이버 | Zabbix | **7.2.1 이상** |
| A1′ | 공식 플러그인 바이너리 + **우리가 만든 7.0 형식 템플릿** | Zabbix Agent 2(7.0) | Agent 2 + 7.2 계열 플러그인 바이너리 + 드라이버 | Zabbix | 없음. 단 **Zabbix 공식 지원 밖** |
| A2 | `nvidia-smi` + UserParameter | Zabbix Agent(1·2) | 에이전트 + 설정 1줄 + 드라이버 | Zabbix | 없음(자체 템플릿) |
| B1 | DCGM Exporter를 HTTP로 | Zabbix 서버/프록시 | dcgm-exporter(:9400)만. **Zabbix 에이전트 불필요** | Zabbix | 없음(자체 템플릿) |
| B2 | SSH로 `nvidia-smi` 실행 | Zabbix 서버/프록시 | SSH 계정만 | Zabbix | 없음(자체 템플릿) |
| B3 | BMC Redfish(대역 외) | Zabbix 서버/프록시 | 없음(BMC 네트워크 도달) | Zabbix | 없음(자체 템플릿) |
| C1 | 고객 Prometheus HTTP API | 고객 Prometheus | dcgm-exporter(대개 GPU Operator가 설치) | 고객 Prometheus | 무관 |
| D1 | OTel Collector → OTLP | MovesEye 수집기 | dcgm-exporter + Collector 도달 | MovesEye PG | 무관 |
| E1 | AWS CloudWatch | CloudWatch Agent | CloudWatch Agent `nvidia_gpu` 설정 | CloudWatch(사용자 지정 지표, 유료) | 무관 |
| F1 | 고객 스크립트가 Zabbix로 밀어 넣기(trapper·`history.push`) | 고객의 기존 수집 스크립트 | 고객 스크립트 | Zabbix | 없음(자체 템플릿). 2차 — 이미 수집기를 운영하는 고객 수용용 |
| F2 | IPMI·SNMP·드라이버 로그 | BMC·OS | 없음 | Zabbix·로그 | 무관. GPU 수치가 아닌 **보조 신호**로만 사용 |

### 경로별 얻을 수 있는 지표

| canonical 지표 | A1 공식 | A2 nvidia-smi | B1 DCGM | B3 Redfish |
|---|---|---|---|---|
| 식별(UUID)·모델 | ✅ | ✅ | ✅(`UUID`·`modelName` 라벨) | ✅(장비별 상이) |
| 활동률 | ✅ | ✅ | ✅ | ❌ |
| 메모리 활동 | ✅ | ✅ | ✅ | ❌ |
| VRAM used/free | ✅ | ✅ | ✅ | ❌ |
| VRAM total | ✅ | ✅ | ⚠️ 기본 목록에 없음 → used+free+reserved 합산 또는 지표 목록 교체 | ❌ |
| 온도 | ✅ | ✅ | ✅ | ✅ |
| 전력 사용 | ✅ | ✅ | ✅ | ✅ |
| 전력 제한 | ✅ | ✅ | ⚠️ 기본 비활성(지표 목록 교체 필요) | 장비별 |
| clock | ✅ | ✅ | ✅ | ❌ |
| PCIe 송수신 | ✅ | ❌ | ✅ | ❌ |
| ECC | ✅ | ✅ | ⚠️ 기본 비활성 | 장비별 |
| **Xid 오류** | ❌ | ❌ | ✅ | ❌ |
| OS가 죽어도 수집 | ❌ | ❌ | ❌ | ✅ |

DCGM 기본 지표 근거: [NVIDIA/dcgm-exporter `etc/default-counters.csv`](https://github.com/NVIDIA/dcgm-exporter/blob/main/etc/default-counters.csv). Redfish 근거: [DGX Redfish 문서](https://docs.nvidia.com/dgx/dgxb300-user-guide/redfish-api-supp.html).

### 단위가 경로마다 다르다

| 지표 | A1 공식(템플릿 전처리 후) | A2 nvidia-smi(`nounits`) | B1 DCGM | canonical |
|---|---|---|---|---|
| VRAM | B | MiB | MiB | **B** |
| 전력 | W | W | W | W |
| clock | Hz | MHz | MHz | MHz |
| 에너지 | — | — | mJ | J |

자체 템플릿(A2·B1·B2)은 **템플릿 전처리에서 canonical 단위로 맞춰 저장**한다. 그러면 단위 변환 코드는 A1(Hz→MHz) 한 군데만 남는다.

## 4. 권고: 경로를 세 묶음으로 나눈다

### 1차(P1) — 저장소가 Zabbix인 경로 3종: A1 · A2 · B1

세 경로는 **수집 방법만 다르고 저장·조회·알람이 전부 Zabbix**다. 새 저장소도, 새 알람 엔진도, 새 어댑터 모듈도 필요 없다. 기존 `engine-zabbix` 카탈로그에 키 계열을 추가하는 것으로 끝난다.

| 경로 | 1차에 넣는 이유 |
|---|---|
| **B1 DCGM + HTTP agent** | "API로 수집"의 기본 답. 에이전트가 필요 없고 Zabbix 버전에 묶이지 않으며 Xid까지 얻는다. **실장비 없이 모의 exporter로 전 구간 개발·검증이 가능**하다(§7) |
| **A2 nvidia-smi** | 이미 Zabbix 에이전트가 깔린 호스트의 최소 부담 경로. DCGM을 못 까는 환경(Windows 워크스테이션 등)의 대안 |
| **A1 공식 플러그인** | 7.2 이상 고객은 이미 쓰고 있을 수 있다. 읽기만 지원하면 되므로 비용이 작다. 우리가 템플릿을 배포하지 않는다 |

### Zabbix를 7.2 이상으로 올릴 수 없는 고객은 어떻게 하나

올리지 않아도 된다. 1차 경로 셋 중 둘(B1·A2)은 Zabbix 버전과 무관하다.

| 방법 | Zabbix 버전 | GPU 호스트 작업 | 공식 지원 | 권장 |
|---|---|---|---|---|
| B1 DCGM + HTTP agent | 무관 | dcgm-exporter 설치 | DCGM은 NVIDIA 공식, 템플릿은 우리 것 | **기본** |
| A2 nvidia-smi | 무관 | 에이전트 설정 1줄 | 템플릿은 우리 것 | 에이전트가 이미 있을 때 |
| A1′ 공식 플러그인 + 우리 템플릿 | 7.0 Agent 2 | 플러그인 바이너리 설치 | **Zabbix 지원 밖** | 실행 시험 통과 후 선택 경로 |

A1′의 장점은 나중에 Zabbix를 7.2 이상으로 올렸을 때 키(`nvml.device.*`)가 공식 템플릿과 같다는 점이다. 단점은 문제가 생겨도 Zabbix에 문의할 수 없다는 점이다.

### 2차(P2) — 필요가 생기면 여는 경로: B3 · B2 · C1

| 경로 | 여는 조건 |
|---|---|
| B3 Redfish | DGX 등 어플라이언스 고객이 나오고, 대상 BMC 실물로 스키마를 확인할 수 있을 때. 활동률·VRAM이 없으므로 **단독 경로가 아니라 건강 보조**다 |
| B2 SSH | 에이전트도 exporter도 못 까는데 SSH만 되는 고객. A2와 같은 템플릿에 마스터 아이템만 다르다. 자격증명이 Zabbix에 저장되므로 기본 안내에서 제외 |
| C1 Prometheus | Kubernetes(GPU Operator) 고객이 이미 Prometheus를 운영할 때. **엔진 스텝 6 재개 결정이 선행**되어야 한다(현재 사용자 결정으로 보류) |

### 3차(P3) — LLM과 함께: D1

MovesEye가 직접 받아 저장하는 경로는 LLM 단계에서 어차피 필요하다(vLLM `/metrics`·트레이스가 OTel Collector를 지난다). GPU만을 위해 지금 여는 것은 비용이 맞지 않는다.

- `apm_metric_1m`은 키가 `(service_id, instance_id, metric, …)`라 호스트·GPU 축을 담지 못한다 → 저장 구조부터 새로 정해야 한다.
- 알람 정본·호스트 매핑(OTel `host.name` ↔ Zabbix 호스트)·보존 정책이 전부 새로 필요하다.

### 제외 — E1 CloudWatch

GPU 지표는 CloudWatch 기본 지표가 아니라 CloudWatch Agent가 올리는 **사용자 지정 지표(유료)**다. 유료 API 옵트인 원칙(기본 잠금·고지 후 사용)상 기본 잠금 대상이다. GPU 인스턴스에도 exporter나 에이전트를 설치해 P1 경로로 받는 것을 기본 안내로 한다.

## 5. 고객 환경별 결정 트리

```
GPU 호스트가 Kubernetes 노드인가?
├─ 예 → 고객이 Prometheus를 운영하는가?
│        ├─ 예 → C1 (P2, 스텝 6 재개 필요). 그 전까지는 노드별 exporter를 B1로
│        └─ 아니오 → B1 (노드 포트로 exporter 노출이 가능할 때)
└─ 아니오(물리 서버·VM)
     ├─ OS에 무언가 설치할 수 있는가?
     │    ├─ 예 → DCGM Exporter를 설치할 수 있는가? (Linux, 데이터센터급 GPU)
     │    │        ├─ 예 → **B1** (권장)
     │    │        └─ 아니오 → Zabbix 서버가 7.2.1 이상이고 Agent 2인가?
     │    │                 ├─ 예 → A1
     │    │                 └─ 아니오 → **A2**
     │    └─ 아니오 → SSH 접속은 되는가?
     │             ├─ 예 → B2 (P2)
     │             └─ 아니오 → B3 Redfish (P2, 온도·전력·건강만)
```

| 고객 상황 | 1차 경로 | 비고 |
|---|---|---|
| Zabbix 7.0 LTS·6.0 LTS, Linux GPU 서버 | B1 또는 A2 | 공식 경로 불가. 우리 dev도 여기 해당 |
| Zabbix 7.2 이상, 이미 공식 템플릿 사용 중 | A1 | 그대로 읽는다. 재설치 요구하지 않음 |
| 에이전트 설치 금지 장비 | B1(exporter 컨테이너 허용 시) → B2 → B3 | |
| Windows GPU 워크스테이션 | A2(7.2 이상이면 A1) | DCGM은 Linux 중심 |
| DGX 어플라이언스 | B1 + (P2) B3 보조 | |
| AWS GPU 인스턴스 | B1 또는 A2 | CloudWatch 경로는 제외 |

## 6. 경로가 달라도 화면이 같아지는 구조

### 6.1 계층

```
화면·REST (premium/gpu)            ← 경로를 모른다. canonical 지표와 값 상태만 안다
        │
engine-api: GpuInventoryPort + MetricPort(domain=GPU)   ← 09-17 P1 설계 유지
        │
engine-zabbix: GPU 수집 프로필(Profile) 해석            ← 이번에 추가하는 층
        ├─ NVML_PLUGIN  : nvml.device.*["UUID"]      (A1, 공식 키)
        └─ MOVESEYE     : moveseye.gpu.*[UUID]       (A2·B1·B2 공통, 자체 키)
```

09-17 P1 설계의 `GpuInventoryPort`(상태를 보존하는 배치 스냅샷)와 `MetricDomain.GPU`는 **유지**한다. 바뀌는 것은 어댑터 안쪽뿐이다.

### 6.2 자체 템플릿은 키를 하나로 통일한다

A2·B1·B2는 **마스터 아이템(원문을 가져오는 방법)만 다르고, 그 아래 dependent 아이템의 키는 동일**하게 만든다.

| 템플릿 | 마스터 아이템 | 디스커버리 | dependent 아이템 |
|---|---|---|---|
| MovesEye NVIDIA GPU by DCGM (B1) | HTTP agent → `:9400/metrics` | Prometheus to JSON → `{#UUID}` | `moveseye.gpu.utilization[{#UUID}]` 외 |
| MovesEye NVIDIA GPU by nvidia-smi (A2) | `UserParameter` → CSV | CSV to JSON → `{#UUID}` | 위와 **같은 키** |
| (P2) by SSH (B2) | `ssh.run[...]` → CSV | 위와 같음 | 위와 **같은 키** |

이렇게 하면 MovesEye가 알아야 하는 키 계열은 **공식(`nvml.device.*`) + 자체(`moveseye.gpu.*`) 두 개**뿐이다. 기존 카탈로그가 이미 지원하는 폴백 체인·합집합(`registerUnion`, 디스크 `fs.size.all` 선례)으로 등록한다.

자체 키 공간을 쓰는 이유(공식 키를 흉내 내지 않는 이유):

- 어느 경로로 수집된 값인지가 키만 봐도 드러난다 → 진단 화면이 단순해진다.
- 공식 템플릿과 단위·전처리가 다를 수 있는데 같은 키로 위장하면 어긋남이 숨는다.
- 미지원 값의 오류 문구를 우리가 정할 수 있다(§6.3).

### 6.3 자체 템플릿이 주는 이점: 미지원 판정이 결정적이 된다

09-17 설계의 난제는 "Zabbix 오류 문자열로 미지원을 어떻게 안정적으로 분류하느냐"였다. 자체 템플릿에서는 전처리의 실패 처리(custom on fail)로 **우리가 정한 오류 문구**를 내보낼 수 있다.

| 원문 | 전처리 결과 | 어댑터 판정 |
|---|---|---|
| `nvidia-smi`의 `[N/A]`, `[Not Supported]` | 오류 `MOVESEYE_GPU_UNSUPPORTED` | `UNSUPPORTED` |
| DCGM 지표가 응답에 없음 | 오류 `MOVESEYE_GPU_METRIC_ABSENT` | `UNSUPPORTED` 또는 `NO_DATA`(디스커버리 상태로 구분) |
| 숫자 아님 | Zabbix 기본 오류 | `ERROR` |

A1(공식)은 09-17 설계대로 버전별 허용 목록 방식, 모르는 오류는 `ERROR`.

### 6.4 한 호스트에 두 경로가 걸렸을 때

- **호스트 단위로 프로필 하나만 쓴다.** 지표별로 섞지 않는다(활동률은 A에서, 온도는 B에서 가져오는 식 금지).
- 고정 우선순위: `MOVESEYE(DCGM)` → `NVML_PLUGIN` → `MOVESEYE(nvidia-smi)`. 지표 범위가 넓은 순이다.
- 두 개 이상 감지되면 진단에 `MULTIPLE_PROFILES`를 표시하고 어느 것을 썼는지 밝힌다.
- 같은 템플릿 계열(자체 템플릿 둘)은 키가 같아서 Zabbix가 한 호스트에 동시 연결을 거부한다 — 이중 수집이 구조적으로 막힌다.

계약 추가 필드(기존 DRAFT에 덧붙임): `GpuRow.collectionProfile: 'NVML_PLUGIN'|'MOVESEYE_DCGM'|'MOVESEYE_SMI'`, 진단 응답의 `detectedProfiles: string[]`.

### 6.5 알람

정본은 Zabbix trigger(09-17 결정 유지). 자체 템플릿의 기본 trigger:

| trigger | 기본 | 비고 |
|---|---|---|
| 온도 지속 초과 | 켬 | 매크로로 임계치 조정 |
| Xid 발생(B1만) | 켬 | 코드별 등급은 후속 |
| ECC uncorrected 증가 | 켬 | 지원 장비만 |
| 수집 중단(nodata) | 켬 | 호스트 장애에 종속 |
| 활동률 높음 | **끔** | 학습 중 100%는 정상. 공식 템플릿은 80/90%가 기본으로 켜져 있어 소음이 된다 — 안내문에 명시 |

### 6.6 설치 안내 화면

경로가 여럿이면 고객이 고르지 못한다. APM 설치 가이드·에이전트 설치 가이드와 같은 방식의 **GPU 수집 설정 안내**가 필요하다.

1. 환경 질문 3개(§5 결정 트리) → 권장 경로 제시
2. 경로별 단계: 설치 명령, 템플릿 파일 내려받기, 호스트에 연결하는 법
3. 확인: 진단 API로 "이 호스트에서 GPU N개 감지, 프로필 X"를 즉시 표시

템플릿 자동 가져오기(`configuration.import`)는 BE에 래핑이 없다(09-30 확인). 1차는 **파일 내려받기 + 수동 가져오기 안내**로 하고 자동화는 후속으로 둔다.

## 7. 실장비 없이 어디까지 가능한가

B1은 HTTP로 텍스트를 읽는 구조라 **모의 exporter**로 전 구간을 돌릴 수 있다.

```
모의 exporter(고정/변동 Prometheus 텍스트) → dev Zabbix 7.0.6 HTTP agent 아이템
→ history/trends → engine-zabbix → REST → 화면
```

| 검증 항목 | 모의로 가능 | 실장비 필요 |
|---|---|---|
| 템플릿 디스커버리·dependent·단위 변환 | ✅ | |
| 미지원·결측·오래된 값·GPU 사라짐 | ✅(모의 응답을 바꿔 재현) | |
| 목록·상세·시계열·권한·라이선스 | ✅ | |
| DCGM 실제 라벨·지표 이름·버전 차이 | | ✅ |
| `nvidia-smi` 실제 출력(A2) | 부분(저장된 출력 재생) | ✅ |
| 공식 플러그인(A1) | ❌(7.2 이상 Zabbix 필요) | ✅ |

**주의:** 모의로 통과한 것은 "파이프라인 검증"이지 "장비 지원 검증"이 아니다. 09-17 설계의 원칙(가짜 데이터로 지원을 선언하지 않는다)을 그대로 따른다. dev Zabbix에 템플릿·호스트를 만드는 것은 쓰기 작업이므로 착수 시 따로 승인받는다.

## 8. 가정과 미검증 항목

| # | 가정 | 확인 방법 |
|---|---|---|
| A1 | 공식 플러그인 바이너리가 7.0 Agent 2에서 동작한다(통신 규약 버전 동일 `6.4.0`). 동작하더라도 Zabbix 공식 지원 밖이라 **1차 기본 안내에는 넣지 않고 선택 경로(A1′)로 둔다** | GPU 호스트에서 Agent 2 7.0 + 플러그인 실행 시험 |
| A2 | DCGM Exporter 라벨은 `gpu`·`UUID`·`device`·`modelName`·`Hostname` | 실장비 `/metrics` 원문 확보 |
| A3 | DCGM 기본 목록에 VRAM total이 없다 — **09-30 저장소 CSV 원문으로 확인**(FB_FREE·FB_USED·FB_RESERVED만 활성, 전력 제한·ECC는 주석). 합산으로 구한 total이 NVML total과 같은지는 미확인 | 실장비에서 대조. 어긋나면 지표 목록 파일을 함께 배포 |
| A4 | Kubernetes에서는 같은 GPU 계열에 pod 라벨이 붙어 Prometheus 패턴이 다중 매칭될 수 있다 | P1은 Kubernetes 미지원으로 명시, P2에서 검증 |
| A5 | HTTP agent 아이템의 URL에 호스트 인터페이스 없이 사용자 매크로만 쓸 수 있다 | dev Zabbix에서 시험 |
| A6 | 6.0 형식 템플릿 파일을 7.x가 가져올 수 있다(하위 형식 호환) | dev Zabbix에서 가져오기 시험 |
| A7 | dev Zabbix 호스트 76대 중 GPU 아이템을 가진 호스트가 없다 | 인증이 필요한 조회라 아직 미확인 |
| A8 | `nvidia-smi` 실행 시간이 에이전트 타임아웃(기본 3초) 안에 든다 | 실장비. GPU 8장 이상에서 지연 보고가 있음 |

## 9. 09-17 설계에서 고쳐야 할 곳

| 위치 | 현재 내용 | 고칠 내용 |
|---|---|---|
| P1 §5.3 | `MetricPort.querySeriesChecked` 신설 | ZM-159에서 같은 목적의 **`querySeriesResult`(`SeriesResult.complete/stopReason`)가 이미 존재**. 신설하지 말고 재사용. 부족한 것은 잘못된 포인트 수(`invalidPointCount`)뿐이므로 GPU 분기의 엄격 파싱 결과를 어떻게 실을지만 정한다 |
| P1 §1 표 | `ZabbixBasicItem`에 lastclock 등 없음 | `lastclock`은 ZM-159에서 추가됨. state/error/status/delay는 여전히 없음 → GPU 전용 DTO 필요성은 유효 |
| P1 §3, §4 | 공식 템플릿 단일 전제, 키는 `nvml.device.*` | 프로필 2계열로 확장(§6). 키 표는 "NVML_PLUGIN 프로필"로 이름 변경 |
| P1 §10 | 캐시 TTL·SingleFlight 직접 설계 | ZM-168 `common/redis/RedisCache`(`getOrLoad`·합류) 재사용으로 교체 |
| P1 §12 | 권한 `monitoring/gpuMonitoring.view` | 방향 유지. APM 선례(`module("applicationMonitoring", feature("apm", …))`)와 같은 방식으로 `DmovePermissions`에 추가, ZM-157 이후 권한 구조 기준으로 재확인 |
| P1 §12 | Flyway 번호 미선점 | 현재 최신 V68. APM 백로그가 V69 이후를 쓸 예정이라 착수 시점에 번호 확정 |
| 방향 §4 | DCGM은 "P2 후보" | **DCGM + HTTP agent(B1)를 1차로 승격**. Prometheus 저장소 경로(C1)만 P2에 남긴다 |
| 계약 §3 | `GpuRow` | `collectionProfile` 추가(§6.4) |

## 10. 사용자 결정이 필요한 것

| # | 질문 | 기본안 |
|---|---|---|
| Q1 | 시험할 **실제 NVIDIA 장비가 있는가**(모델·OS·대수)? | ✅ 09-30 답변: 있음, GPU 1~2장 서버. 모델·OS·드라이버 버전은 S0에서 기록 |
| Q2 | 1차 경로 구성을 **B1 + A2 + A1(읽기)** 로 확정하는가? | ✅ 10-01 답변: 그대로 진행 |
| Q3 | 고객사 Kubernetes GPU 클러스터가 1차 대상에 있는가? | ✅ 09-30 답변: 클러스터는 대상. 종류는 특정하지 않음 → 일반 Linux GPU 서버군 기준(§14) |
| Q4 | 자체 템플릿을 제품 구성물로 배포·유지하는 것에 동의하는가? | ✅ 10-01 답변: 동의. **태그를 달아 MovesEye 프리셋 템플릿으로 정의**(§15) |
| Q5 | 이미 Prometheus로 GPU를 수집 중인 고객을 어떻게 받을 것인가? | ✅ 10-01 답변: **Prometheus 배제, Zabbix만**(§17) |

## 11. 코덱스 안과의 대조

코덱스(gpt-5.6-sol, high)가 같은 과제를 독립 제안했다. 코덱스는 클러스터 요구(§13·§14)가 나오기 전에 출발했으므로 클러스터는 대조 대상이 아니다.

### 11.1 두 안이 일치한 것

| 항목 | 결론 |
|---|---|
| 1차 저장·알람 정본 | Zabbix |
| Zabbix 7.0 고객의 기본 경로 | DCGM Exporter → Zabbix HTTP agent |
| 대안 경로 | 기존 에이전트 + `nvidia-smi`(마스터 1회 수집 + dependent) |
| 공식 플러그인 | 7.2.1 이상 전용 프로필. 7.0에 붙이는 것을 표준 지원으로 선언하지 않음 |
| 자체 템플릿의 키 | 공식 키를 흉내 내지 않고 별도 프로필로 구분 |
| `querySeriesChecked` | 폐기, `querySeriesResult` 재사용 |
| 캐시 | `RedisCache.getOrLoad`(합류 내장, 중첩 금지) |
| `apm_metric_1m` | GPU 저장소로 재사용 불가 |
| Redfish | 활동률·VRAM을 대체하지 못하는 대역 외 보조 |
| 다중 경로 | 자동 병합·조용한 대체 금지 |

### 11.2 코덱스 안에서 받아들인 것

| # | 내용 | 반영 위치 |
|---|---|---|
| 1 | **알람 정본이 없는 경로는 `NO_ACTIVE_ALERT`가 아니라 `UNKNOWN`** | 계약의 health 규칙. 1차는 전 경로가 Zabbix라 해당 없음, 2차부터 적용 |
| 2 | **필수 지표를 전역 5종으로 고정하지 않고 수집 등급별로** 둔다(`CORE_TELEMETRY`·`EXTENDED_DCGM`·`OOB_HARDWARE`·`IDENTITY_ONLY`) | 09-17 계약 §3의 required 5종 규칙을 대체. 1차는 앞의 두 등급만 |
| 3 | "에이전트 없음"을 **3단계로 구분**(Zabbix 에이전트만 금지 / 모든 상주 프로세스 금지 / OS 접근 자체 금지) | §5 결정 트리의 질문 문구 |
| 4 | `nvidia-smi` UserParameter 안전 규칙: 외부 인자 금지, 동시 실행 방지, 출력 크기 상한 | 자체 템플릿(A2) 작성 기준 |
| 5 | DCGM의 VRAM total 합산은 **같은 시각·같은 GPU·세 값 모두 관측**일 때만 | §3 지표 표의 ⚠️ 조건 |
| 6 | 권한 추가에는 **저장된 역할 JSON 이관 migration이 필수** | §9 P1 §12 항목 |
| 7 | 고객이 입력하는 주소(Prometheus·BMC 등)에는 **요청 위조 방어**(허용 목록, 루프백·메타데이터 주소 차단)와 자격증명 암호화 | 2차 경로의 전제 조건 |
| 8 | 프로필 식별자에 **버전 접미사**(`zabbix-dcgm-http-v1`) | §6.4의 `collectionProfile` 값. 템플릿 개정 추적용 |
| 9 | 빠뜨린 경로 2종: 고객 스크립트가 Zabbix로 밀어 넣는 방식(trapper·`history.push`), IPMI·SNMP·드라이버 로그(보조 신호) | §3 경로 표에 2차로 추가 |
| 10 | 프로필 간 단위·지표 **비교 검증**을 단계에 포함 | §12 S4·S5 |

### 11.3 의견이 갈린 것과 판단

| 쟁점 | 코덱스 | Claude | 판단 |
|---|---|---|---|
| 포트 분리 | `GpuInventoryPort`(식별) + `GpuTelemetryPort`(최신값) 분리 | 09-17 안대로 한 포트의 배치 스냅샷 | **포트는 하나, 모델은 둘로 나눈다.** Zabbix에서는 식별과 최신값이 같은 `item.get` 한 번에 나오므로 포트를 나누면 호출이 두 배가 되거나 포트 사이에 숨은 캐시가 생긴다. 다만 반환 타입을 식별·관측으로 분리해 두어 2차(Prometheus·Redfish)에서 포트를 가를 때 비용이 작게 한다 |
| 다중 경로 정본 | 대상별·지표 묶음별 `primaryProfileId`를 명시 설정 | 호스트 단위로 프로필 하나, 고정 우선순위 | **1차는 Claude 안, 2차는 코덱스 안.** 1차는 모두 한 Zabbix 호스트 안의 일이라 설정 화면까지 둘 이유가 없다. 저장소가 둘 이상이 되는 2차부터 대상별 명시 설정을 도입한다. 지표 묶음별 분할은 대역 외 보조(Redfish)에만 허용 |
| 시계열 품질 | `SeriesResult`에 계열별 품질 목록 추가 | 방식 미정으로 남김 | **코덱스 안 채택.** 기존 도메인은 빈 목록으로 호환되고, 구현 전까지 계약의 `invalidPointCount`는 확정하지 않는다 |
| 기존 Prometheus 고객 | 중복 수집을 피해 MovesEye가 직접 읽는다(엔진 스텝 6 재개) | Zabbix HTTP agent가 Prometheus 조회 API를 부른다(§13.2 K2, 스텝 6 불필요) | **사용자 결정 사항.** 코덱스 안은 저장 중복이 없지만 알람·호스트 매핑·인증을 새로 풀어야 한다. Claude 안은 저장이 중복되지만 읽기·알람 경로가 하나로 유지된다 |

### 11.4 코덱스 안에 없고 이 문서에만 있는 것

- 공식 플러그인과 7.0 에이전트의 통신 규약 버전이 같다는 소스 확인(§1, 경로 A1′)
- 자체 템플릿의 전처리로 미지원 오류 문구를 고정하는 방법(§6.3)
- 실측 원문을 복제한 모의 exporter로 클러스터까지 검증하는 계획(§7, §14.4)
- 클러스터: 요약 호스트와 Zabbix 집계 아이템, 노드 간 연결망 관측(§13, §14)

## 12. 단계 계획

| 단계 | 내용 | 완료 기준 | 실장비 |
|---|---|---|---|
| S0 | 모의 exporter + 자체 템플릿(B1) 초안, dev Zabbix 가져오기 시험 | 디스커버리·dependent·단위가 dev에서 동작, 원문 fixture 저장 | 불필요 |
| S1 | 엔진: `MetricDomain.GPU`, `GpuInventoryPort`, 프로필 해석, 엄격 파싱 | 프로필 2계열 × 상태 규칙 단위 테스트, 라이선스 경계 테스트 | 불필요 |
| S2 | BE: `premium/gpu` API 4종, 권한, 캐시 | 계약 DRAFT → 실응답 대조 | 불필요 |
| S3 | FE: 목록·상세·진단, 설치 안내 | 빈 상태 7종·상태 표시 | 불필요 |
| S4 | A2 템플릿(nvidia-smi) 추가 | 저장된 출력 재생으로 파이프라인 확인 | 부분 |
| S5 | 실장비 확인: DCGM 원문·nvidia-smi 원문·A1(7.2 이상 환경) | 지원 장비 표 작성, 가정 A2·A3·A8 해소 | **필요** |
| S6 | P2 착수 판단(Redfish·SSH·Prometheus) | 고객 요구 확인 후 | — |

라이선스 커널의 잔여 판정 12(`@RequiresFeature`가 붙은 실제 프리미엄 EP)는 S2에서 닫힌다.

## 13. GPU 클러스터 (2026-09-30 추가)

사용자 확인: **시험 가능한 NVIDIA 실장비 있음**, **GPU 클러스터도 고려 대상**. 클러스터 종류·규모는 아직 미확인(§13.7).

### 13.1 단일 서버와 무엇이 달라지나

| 축 | 단일 GPU 서버 | 클러스터 |
|---|---|---|
| 보는 단위 | GPU 한 장 | 클러스터 → 노드 → GPU 3단 |
| 핵심 질문 | 이 GPU가 뜨거운가, 꽉 찼는가 | 전체 중 몇 장이 놀고 있나, 어느 노드가 빠졌나, 누가 쓰고 있나 |
| 수집 대상 등록 | 호스트 몇 대 수동 등록 | 노드 수십~수백 대, 증감이 잦음 |
| 부하 | 무시 가능 | 아이템 수가 노드 × GPU × 지표로 곱해짐 |
| 작업 귀속 | 거의 불필요 | 어떤 Pod·작업이 어느 GPU를 쓰는지가 요구됨 |

### 13.2 클러스터 종류별 수집 경로

| 종류 | 노드의 성격 | 권장 경로 | 비고 |
|---|---|---|---|
| 스케줄러 없는 GPU 서버 묶음 | 일반 Linux 서버 | B1 또는 A2를 노드마다 | §4 그대로. 묶는 방법만 정하면 됨(§13.3) |
| Slurm 등 HPC | 일반 Linux 서버 + 작업 스케줄러 | B1을 노드마다 | 작업 귀속은 dcgm-exporter `--hpc-job-mapping-dir`(스케줄러가 만든 GPU↔작업 매핑 파일을 읽음) |
| Kubernetes(GPU Operator) | 컨테이너 노드. exporter가 이미 DaemonSet으로 떠 있음 | 아래 K1~K3 중 선택 | exporter를 새로 깔 필요 없음 |
| DGX BasePOD·SuperPOD | 어플라이언스 | B1 + (P2) Redfish 보조 | 관리 소프트웨어가 따로 있을 수 있음 |

**Kubernetes의 세 선택지**

| # | 방법 | 저장 | 고객 클러스터 변경 | 노드 = Zabbix 호스트 |
|---|---|---|---|---|
| K1 | exporter를 노드 포트로 노출 → Zabbix HTTP agent가 노드별로 수집 | Zabbix | exporter 노출 설정 변경 필요 | 예 |
| K2 | Zabbix HTTP agent가 **고객 Prometheus 조회 API**를 호출 → 한 번에 전 노드 GPU를 받음 | Zabbix | 없음(Prometheus 접근 권한만) | 아니오. "클러스터 호스트" 하나에 전 GPU가 달림 |
| K3 | MovesEye가 Prometheus를 직접 읽음 | 고객 Prometheus | 없음 | 아니오. 엔진 스텝 6 재개 필요 |

- 노드가 이미 Zabbix 호스트로 등록되어 있으면 K1, 아니면 K2가 부담이 적다.
- K2는 저장이 Zabbix라서 **엔진 스텝 6 없이** Kubernetes를 지원하는 길이다. 대신 식별에 노드 이름 차원이 추가된다(`nodeName`). GPU UUID는 전역에서 유일하므로 `(sourceId, hostId, gpuUuid)` 키는 그대로 성립한다.

### 13.3 클러스터를 제품에서 무엇으로 정의하나

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **가. 호스트 태그**(권장) | 노드 호스트에 `gpu_cluster=<이름>` 태그 | 새 테이블 없음. 기존 호스트 태그 관리 화면 재사용. "호스트 태그가 진실" 원칙(기기분류 선례)과 일치 | 태그를 달아 줘야 함 |
| 나. 호스트 그룹 | Zabbix 호스트 그룹 = 클러스터 | 설정 없음 | 한 호스트가 여러 그룹에 속해 "Linux servers" 같은 일반 그룹이 클러스터로 잡힘 |
| 다. 자체 테이블 | MovesEye DB에 클러스터 엔티티 | 스케줄러 주소 등 메타 저장 가능 | 새 저장·동기화 부담. 1차에는 과함 |

K2는 클러스터 호스트 하나가 곧 클러스터이므로 태그가 필요 없다(호스트 자체가 경계).

### 13.4 클러스터 화면

1. **클러스터 목록**: 클러스터별 노드 수(정상/전체), GPU 수(관측/발견), 사용 중·유휴 GPU 수, VRAM 합계 비율, 전력 합계, 최고 온도, 활성 이벤트 수.
2. **클러스터 상세 — 노드×GPU 격자**: 행 = 노드, 칸 = GPU 한 장. 색 기준을 활동률·VRAM·온도 중 선택. 칸을 누르면 GPU 상세로 이동. 클러스터 화면의 핵심이다.
3. **유휴 GPU 목록**: 관측 구간 동안 활동률이 낮았던 GPU. "낭비 비용"으로 환산하지 않는다(09-17 원칙 유지).
4. **빠진 GPU·노드**: 발견됐다가 사라진 GPU, 수집이 끊긴 노드를 따로 표시. 수집 실패를 "GPU 없음"으로 단정하지 않는다.
5. **클러스터 추이**: 활동률 평균·최소·최대, VRAM 합계, 전력 합계.

집계 규칙은 09-17 P1 §7을 그대로 쓴다(값 없는 GPU를 분모에 넣지 않음, 관측 수 병기, 이종 모델 가중 평균 아님).

### 13.5 작업 귀속(누가 쓰고 있나)

| 환경 | 원천 | 제약 |
|---|---|---|
| Kubernetes | dcgm-exporter `--kubernetes`가 붙이는 `pod`·`namespace`·`container` 라벨 | **GPU 공유(time-slicing) 환경에서는 귀속이 지원되지 않는다**(NVIDIA 문서의 알려진 제약). `--kubernetes-virtual-gpus` 옵션은 버전 의존 |
| Slurm 등 | `--hpc-job-mapping-dir` | 스케줄러 쪽에서 매핑 파일을 만들어 줘야 함 |

저장 방식: Pod·작업마다 아이템을 만들면 Pod가 생기고 사라질 때마다 Zabbix 아이템이 늘고 줄어 감당이 안 된다. 대신 **GPU마다 "현재 할당" 텍스트 아이템 하나**(`moveseye.gpu.workload[{#UUID}]`, 값은 Pod·네임스페이스 또는 작업 ID)를 둔다. 아이템 수는 GPU 수로 고정되고, Zabbix 이력이 곧 할당 이력이 된다.

화면 원칙: 할당과 실제 활동을 분리해 보여 주고, 공유 GPU는 "귀속 불가"로 표시한다. 장치 전체 값을 Pod별 값처럼 복제하지 않는다.

### 13.6 규모와 부하

| 규모 | 아이템 수(GPU당 16종) | 60초 수집 시 초당 값 | 30초 수집 시 |
|---|---|---|---|
| 노드 10 × GPU 8 | 1,280 | 약 21 | 약 43 |
| 노드 50 × GPU 8 | 6,400 | 약 107 | 약 213 |
| 노드 100 × GPU 8 | 12,800 | 약 213 | 약 427 |
| 노드 250 × GPU 8 | 32,000 | 약 533 | 약 1,067 |

- 계산값이며 실측이 아니다. 자체 템플릿은 노드당 HTTP 호출 1회에 dependent 아이템이 매달리는 구조라 수집 자체의 호출 수는 노드 수에 비례한다.
- 클러스터용 기본 수집 주기는 60초로 두고, 클러스터 가까이에 Zabbix 프록시를 두도록 안내한다.
- 09-17 P1의 조회 상한(호스트 200대·GPU 2,000장)은 노드 250 × GPU 8까지 수용한다. 그 이상은 클러스터 단위로 나눠 조회한다.
- **클러스터 추이의 장기 조회가 위험 지점**이다. GPU 800장의 30일 시간별 추이는 약 57만 버킷이다. 1차는 BE 집계 + 기간 상한(7일)으로 시작하고, 부족하면 Zabbix 집계 아이템으로 미리 계산해 두는 방식으로 옮긴다. 실측 후 결정.

### 13.7 MIG·공유 GPU가 템플릿에 주는 영향

DCGM 출력에서 MIG 인스턴스는 **부모 GPU와 같은 UUID**에 `GPU_I_ID`·`GPU_I_PROFILE` 라벨이 붙어 여러 줄로 나온다([NVIDIA 문서 예시](https://docs.nvidia.com/datacenter/cloud-native/gpu-telemetry/latest/dcgm-exporter.html)). UUID만으로 값을 고르면 여러 줄이 걸려 Zabbix 전처리가 실패한다.

- 1차 템플릿은 `GPU_I_ID`가 없는 줄(물리 GPU)만 고르고, MIG가 감지되면 진단에 `MIG_DETECTED_UNSUPPORTED`를 표시한다.
- MIG 인스턴스별 수치는 09-17 결정대로 2차.

### 13.8 클러스터를 넣은 단계 계획 변경

| 단계 | 변경 |
|---|---|
| S0 | 실장비에서 원문 확보를 **앞당긴다**(장비가 있으므로). DCGM `/metrics` 원문, `nvidia-smi` 출력, 공식 플러그인 7.0 실행 시험(가정 A1) |
| S2 | 클러스터 목록·상세 API 2종 추가(클러스터 경계는 §13.3 결정에 따름) |
| S3 | 노드×GPU 격자 화면 추가 |
| S4′ | 작업 귀속 아이템(§13.5) — 클러스터 종류가 정해진 뒤 |
| K2 | Kubernetes 대상이 확정되면 1차에 포함, 아니면 2차 |

### 13.9 확인이 필요한 것

| # | 질문 | 왜 필요한가 |
|---|---|---|
| C1 | 클러스터 종류(Kubernetes / Slurm 등 / 스케줄러 없음 / DGX) | 수집 경로와 작업 귀속 방식이 갈린다 |
| C2 | 규모(노드 수, 노드당 GPU 수) | 수집 주기·프록시·조회 상한 |
| C3 | 노드가 이미 Zabbix 호스트로 등록돼 있는가 | K1과 K2 선택, 클러스터 경계 정의 |
| C4 | Kubernetes라면 Prometheus를 이미 운영하는가, GPU를 공유(time-slicing·MIG)하는가 | K2 가능 여부, 귀속 가능 여부 |

## 14. 사용자 확정 반영 (2026-09-30)

| 질문 | 답변 | 설계에 주는 영향 |
|---|---|---|
| 클러스터란 | 여러 대의 GPU 서버를 **고속 네트워크로 연결**해 하나의 시스템처럼 쓰는 환경 | 스케줄러 종류를 가정하지 않는다. **노드 간 연결망 관측**이 범위에 들어온다(§14.1) |
| 규모 | 알 수 없음, **최대한 많이** | 조회 때 계산하지 않고 **미리 집계**한다(§14.2) |
| 노드의 Zabbix 등록 | 모름 | 등록된 경우와 아닌 경우 모두 안내한다 |
| 시험 장비 | **GPU 1~2장 서버** | 단일 노드는 실측, 클러스터는 실측 원문을 복제한 모의로 검증(§14.4) |

이에 따라 §13.2의 종류별 표는 "고객마다 다를 수 있는 변형"으로 남기고, **1차 기준 환경은 "고속 연결망으로 묶인 일반 Linux GPU 서버군"**으로 한다. Kubernetes 전용 경로(K1~K3)와 작업 귀속(§13.5)은 해당 고객이 확인될 때 연다.

### 14.1 노드 간 연결망 관측

GPU 클러스터에서 "GPU는 멀쩡한데 학습이 느리다"의 흔한 원인이 연결망이다. GPU 지표만으로는 보이지 않는다.

| 대상 | 무엇을 보나 | 원천 | 수집 방법 | 단계 |
|---|---|---|---|---|
| 노드 안 GPU 간 연결(NVLink) | 처리량 | DCGM `DCGM_FI_DEV_NVLINK_BANDWIDTH_TOTAL`(기본 활성) | B1에 이미 포함 | 1차(선택 지표) |
| 노드의 InfiniBand·RoCE 포트 | 송수신량, 링크 상태·속도, 오류(symbol error, link downed) | Linux `/sys/class/infiniband/<장치>/ports/*/counters` | node_exporter의 infiniband 수집기(**기본 활성**)를 Zabbix HTTP agent로, 또는 에이전트 UserParameter | 1차 후반 |
| 연결망 스위치 | 포트 상태·오류·처리량 | 스위치 SNMP | 기존 네트워크 모니터링 | 기존 기능 |
| 연결망 전체(토폴로지·경로) | 패브릭 건강 | NVIDIA UFM 등 관리 소프트웨어 REST API | Zabbix HTTP agent | 2차 |

주의할 점:

- **일반 네트워크 인터페이스 지표(`net.if.in/out`)로는 부족하다.** RDMA 통신은 InfiniBand 드라이버 경로의 카운터에 잡히므로 `/sys/class/infiniband` 쪽을 읽어야 한다. RoCE(이더넷 위 RDMA)도 같은 경로에 노출된다.
- 연결망 오류 카운터는 누적값이다. 재부팅·드라이버 재적재로 0이 되므로 증가량으로 보되 초기화를 장애로 오인하지 않는다.
- 연결망 지표는 GPU 지표가 아니다. canonical 도메인은 GPU가 아니라 기존 `NETWORK`·`INTERFACE` 쪽 확장으로 두고, 클러스터 화면에서 나란히 보여 준다. GPU 기능 범위를 연결망 제품으로 넓히지 않는다.

근거: [node_exporter 수집기 목록](https://github.com/prometheus/node_exporter#collectors), [Linux 커널 InfiniBand 문서](https://docs.kernel.org/driver-api/infiniband.html).

### 14.2 규모를 모를 때의 구조 원칙

| 원칙 | 내용 |
|---|---|
| 조회 때 전수 계산하지 않는다 | 클러스터 요약·추이는 **Zabbix 집계 아이템으로 미리 계산**해 저장한다. 화면은 저장된 값만 읽는다 |
| 클러스터 하나씩 연다 | 클러스터 목록은 요약값만, 노드×GPU 격자는 선택한 클러스터 하나에 대해서만 읽는다 |
| 격자도 나눠 읽는다 | 노드 수가 많으면 노드 단위 페이지로 나눈다 |
| 수집은 노드당 호출 1회 | 마스터 아이템 하나에 dependent가 매달리는 구조 유지. 마스터 원문은 이력을 저장하지 않는다 |
| 프록시를 전제한다 | 클러스터 가까이에 Zabbix 프록시를 두는 구성을 설치 안내의 기본으로 한다 |

이에 따라 **§13.6의 "1차는 BE 집계 + 7일 상한" 안을 철회**하고 처음부터 미리 집계하는 구조로 간다.

**클러스터 요약 호스트**

- 클러스터마다 Zabbix에 **요약 전용 호스트 하나**를 두고 "MovesEye GPU Cluster" 템플릿을 연결한다.
- 템플릿의 계산 아이템이 소속 노드의 GPU 아이템을 모아 집계한다. Zabbix 7.0 문서의 형식: `avg(last_foreach(/*/키?[group="그룹"]))`, 필터는 그룹과 태그를 지원한다([집계 계산 문서](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/calculated/aggregate)).
- 집계 항목: GPU 수, 값이 있는 GPU 수, 활동률 평균·최소·최대, 유휴 GPU 수, VRAM 사용 합·전체 합, 전력 합, 최고 온도.
- 이 호스트가 곧 제품의 "클러스터"다. **클러스터 목록 = 이 템플릿이 연결된 호스트 목록.** MovesEye DB에 클러스터 테이블을 두지 않는다.
- 요약 호스트의 추이는 일반 아이템 추이이므로 기존 `MetricPort` 시계열 조회로 읽는다. 30일 조회도 아이템 몇 개의 추이일 뿐이다.

**소속 표식**: §13.3의 호스트 태그 안을 다음으로 구체화한다.

- 노드 호스트에 매크로 `{$GPU.CLUSTER}`(클러스터 이름)를 두고, 자체 템플릿이 이를 아이템 태그로 옮긴다. 집계 아이템은 이 태그로 소속을 고른다.
- 공식 템플릿(A1) 호스트는 우리 태그가 없으므로 호스트 그룹으로 고른다.
- 집계 필터의 태그가 아이템 태그 기준인지, 매크로가 태그 값에서 풀리는지는 dev Zabbix에서 확인한다(가정 A9).

**집계가 숨기는 것**: 일부 노드의 수집이 끊기면 Zabbix 집계는 값이 없는 아이템을 빼고 계산한다. 평균이 멀쩡해 보여도 관측 대상이 줄었을 수 있으므로 **"값이 있는 GPU 수"를 항상 함께 저장하고 화면에 병기**한다.

### 14.3 추가 가정

| # | 가정 | 확인 방법 |
|---|---|---|
| A9 | 집계 필터의 태그는 아이템 태그이고, 템플릿 아이템 태그 값에 호스트 매크로를 쓸 수 있다 | dev Zabbix 7.0.6에서 시험 |
| A10 | 집계 아이템이 수천 개 아이템을 모아도 Zabbix 서버 부하가 수용 가능하다 | 모의 다중 노드로 측정 |
| A11 | node_exporter infiniband 수집기의 지표 이름과 포트 식별 라벨 | 연결망 카드가 있는 실장비 필요. 시험 장비에 없으면 미검증으로 남김 |

### 14.4 시험 계획 (GPU 1~2장 서버 기준)

| 구분 | 방법 | 얻는 것 |
|---|---|---|
| 단일 노드 실측 | 시험 서버에서 DCGM `/metrics` 원문, `nvidia-smi` 출력 확보. Zabbix 7.0 Agent 2에 공식 플러그인 실행 시험 | 가정 A1·A2·A3·A8 해소, 지원 장비 표의 첫 줄 |
| 클러스터 모의 | 실측 원문에서 UUID·호스트 이름만 바꿔 **노드 N대 분량으로 복제**해 모의 exporter로 제공 | 격자 화면, 집계 아이템, 부하(A10). 값은 가짜가 아니라 실측의 복제 |
| 검증 불가로 남는 것 | 다중 GPU(4~8장) 서버의 `nvidia-smi` 지연, 연결망 카운터, MIG, 공유 GPU | 해당 장비가 확보될 때까지 "지원 확인 전"으로 표기 |

시험 서버에 exporter·에이전트·플러그인을 설치하는 일과 dev Zabbix에 템플릿·호스트를 만드는 일은 모두 쓰기 작업이다. 착수 시 대상과 범위를 정해 따로 승인받는다.

## 15. 프리셋 템플릿 정의 (2026-10-01 사용자 확정)

사용자 결정(Q4): **자체 템플릿 배포에 동의. 템플릿에 태그를 달아 "MovesEye가 프리셋으로 관리하는 템플릿"으로 정의한다.**

### 15.1 정의

| 용어 | 뜻 |
|---|---|
| **프리셋 템플릿** | MovesEye가 만들어 제품 구성물로 배포하고 버전을 관리하는 Zabbix 템플릿. 고객이 자기 Zabbix에 가져와 호스트에 연결한다 |
| 식별 방법 | 템플릿 **태그**. 태그가 없는 템플릿은 공식·고객 제작 템플릿이며 MovesEye가 관리하지 않는다 |

### 15.2 태그 규약

| 태그 | 값 | 용도 |
|---|---|---|
| `moveseye_preset` | 프리셋 식별자. 예: `gpu-dcgm-http`, `gpu-nvidia-smi`, `gpu-cluster` | "우리 템플릿인가, 어느 것인가" |
| `moveseye_preset_version` | 템플릿 버전. 예: `1.0` | 갱신 필요 판정 |
| `moveseye_preset_min_product` | 이 템플릿을 읽을 수 있는 최소 제품 버전 | 제품과 템플릿의 짝 확인 |

- 템플릿 태그는 연결된 호스트에 상속된다(Zabbix 5.4 이후). 따라서 **호스트의 상속 태그만 보면 어느 프리셋으로 수집 중인지** 알 수 있다 — §6.4의 수집 프로필 판정을 아이템 키 접두사가 아니라 이 태그로 한다. 키 접두사는 보조 확인용.
- 템플릿 이름은 `MovesEye GPU by DCGM (HTTP)`처럼 사람이 읽는 이름, 전용 템플릿 그룹 `MovesEye presets`에 둔다. 판정 기준은 어디까지나 태그다(이름·그룹은 고객이 바꿀 수 있다).
- 공식 NVIDIA 템플릿(A1)에는 태그를 달지 않는다. 우리 것이 아니므로 `collectionProfile=NVML_PLUGIN`은 아이템 키로 판정한다.

### 15.3 제품이 태그로 하는 일

| 기능 | 동작 |
|---|---|
| 프리셋 현황 | `template.get`을 태그로 필터해 설치된 프리셋과 버전을 설정 화면에 표시 |
| 갱신 안내 | 제품이 아는 최신 버전보다 낮으면 "템플릿 갱신 필요" 배지. 자동으로 덮어쓰지 않는다 |
| 진단 | GPU 호스트에 프리셋이 안 붙어 있으면 `NOT_CONFIGURED`가 아니라 **"프리셋 미연결"**로 더 구체적으로 안내 |
| 짝 확인 | `moveseye_preset_min_product`가 현재 제품보다 높으면 "제품 업데이트 필요" |
| 보호 | 프리셋 템플릿은 기존 Zabbix 관리 화면에서 편집·삭제 시 경고(우리가 다음 갱신 때 덮어쓸 수 있음을 알림) |

### 15.4 배포·버전 규칙

- 템플릿 파일은 BE 저장소 안 `resources/zabbix-presets/{preset}/{zabbix-major}/` 에 두고, 제품 빌드에 포함한다. 파일 안의 태그 값과 폴더 버전이 어긋나면 빌드 테스트가 실패하게 한다.
- Zabbix 메이저(6.0 / 7.0 / 7.4)별로 내보낸 파일을 둔다. 하위 형식을 상위가 가져올 수 있으면 파일 수를 줄인다(가정 A6).
- 템플릿을 고치면 `moveseye_preset_version`을 올리고 변경 내역을 템플릿 설명(description)에 적는다.
- 1차는 **내려받기 + 수동 가져오기**. `configuration.import` 래핑으로 한 번에 설치하는 것은 후속(§6.6).

### 15.5 추가 가정

| # | 가정 | 확인 |
|---|---|---|
| A12 | 7.0에서 템플릿 태그가 연결 호스트에 상속되고 `host.get`의 `inheritedTags`로 읽힌다 | dev Zabbix 시험 |
| A13 | 프리셋 식별자·버전 상수는 BE 한 곳(`ZabbixPresetCatalog` 가칭)에 두고 FE는 API로 받는다 | 구현 시 |

## 16. SNMP로 GPU 정보를 받을 수 있는가 (2026-10-01 질문)

**짧은 답: 가능하지만 "GPU가 SNMP를 말하는 것"이 아니다.** NVIDIA 드라이버·NVML에는 SNMP 에이전트가 없다. SNMP로 받으려면 호스트의 SNMP 데몬에 GPU를 읽는 스크립트를 붙여야 하고, 그 순간 데이터 원천은 결국 `nvidia-smi`다. 즉 SNMP는 **새 데이터 원천이 아니라 전송 방법 하나**다.

### 16.1 SNMP로 GPU 값을 얻는 방법들

| 방법 | 호스트에 필요한 것 | 얻는 지표 | 판정 |
|---|---|---|---|
| **S1. net-snmp `extend` + `nvidia-smi`** | snmpd + 설정 1줄(`extend gpu /usr/local/bin/moveseye-gpu.sh`) | `nvidia-smi`가 주는 전부(A2와 같음) | **가능.** A2의 "전송만 SNMP" 변형. 보안 정책상 SNMP만 허용되는 고객용 |
| S2. 서버 BMC의 SNMP(iDRAC·iLO 등) | 없음(BMC 네트워크만) | 장비·펌웨어에 따라 GPU 온도·전력이 있을 수도, 없을 수도 | 장비별 미확인. Redfish(B3)와 같은 급의 대역 외 보조 |
| S3. NVIDIA 자체 SNMP 에이전트 | — | — | **없음.** Linux·Windows 모두 NVIDIA가 제공하는 SNMP 서브에이전트가 없다 |
| S4. 연결망 스위치 SNMP | 없음 | 포트 상태·오류·처리량 | 이미 있는 네트워크 모니터링. GPU 값은 아님 |

### 16.2 S1을 쓴다면

- 데이터 흐름: `nvidia-smi → 스크립트 → snmpd(NET-SNMP-EXTEND-MIB) → Zabbix SNMP 아이템 → history/trends`. 저장·알람은 여전히 Zabbix라 1차 구조(§4)에 그대로 들어간다.
- 프리셋 템플릿은 **A2(nvidia-smi)와 dependent 아이템이 같고 마스터 아이템만 SNMP**다(§6.2의 "마스터만 다르다" 원칙). 7.0에서는 `walk[...]` 마스터 아이템 하나로 전체를 받아 전처리로 쪼갠다. 6.0은 OID별 개별 아이템이라 폴링 수가 늘어난다.
- 에이전트 경로보다 나은 점: Zabbix 에이전트를 못 깔아도 되고, 보안 정책이 SNMP만 열어 둔 환경에서 통과한다.
- 못한 점: SNMP v3 설정이 필요하고(v2c는 평문), UDP 패킷 크기 때문에 GPU가 많으면 한 줄 출력이 잘릴 수 있어 GPU별 줄로 나눠 내보내야 한다. 스크립트 실행 시간·동시 실행 방지는 A2와 같은 규칙(§11.2 4번).

### 16.3 결론

| 상황 | 권고 |
|---|---|
| 일반 | B1(DCGM) 또는 A2(nvidia-smi). SNMP 변형은 불필요 |
| 보안 정책이 SNMP만 허용 | **S1을 A2의 변형 프리셋(`gpu-nvidia-smi-snmp`)으로 제공.** 1차에 넣되 구현 순서는 B1·A2 뒤 |
| 대역 외 보조 | BMC SNMP는 Redfish와 함께 2차에서 장비별로 확인 |

실장비 확인 항목: 시험 서버에 snmpd가 있으면 S1 실측(GPU 2장 기준 출력 크기·응답 시간). 가정 A14로 추가.

## 17. 결정 반영 (2026-10-01)

| 결정 | 내용 | 설계 변경 |
|---|---|---|
| Q2 | 1차 경로 구성 그대로 진행 — B1 DCGM+HTTP agent, A2 nvidia-smi, A1 공식 플러그인 읽기 (+ S1 SNMP 변형) | 없음 |
| Q5 | **Prometheus 배제, Zabbix만** | §3의 C1·§13.2의 K2·K3·§11.3의 Prometheus 쟁점은 **범위 밖**. 엔진 스텝 6 재개 논의도 GPU 사유로는 하지 않는다. Kubernetes 고객은 K1(노드 포트로 exporter 노출 → Zabbix HTTP agent)만 남는다 |
| Q4 | 프리셋 템플릿(§15) | 반영 완료 |

남은 결정 없음. 다음 단계는 S0(시험 서버 실측)이며 착수 시 설치 범위를 따로 승인받는다.
