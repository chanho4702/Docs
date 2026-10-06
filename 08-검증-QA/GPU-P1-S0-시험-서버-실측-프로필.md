# GPU P1 S0 — 시험 서버 실측 프로필

시작: 2026-10-01 · 대상: `GPU-SERVER` 10.220.0.13 · 상태: **1~2단계(읽기) 완료, 3~5단계(설치) 승인 대기**

설계 정본: [수집 경로 설계](../02-%EC%84%A4%EA%B3%84/NVIDIA-GPU-%EC%88%98%EC%A7%91-%EA%B2%BD%EB%A1%9C-%EC%84%A4%EA%B3%84.md) §12·§14.4 · [P1 상세](../02-%EC%84%A4%EA%B3%84/NVIDIA-GPU-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-P1-%EC%83%81%EC%84%B8-%EC%84%A4%EA%B3%84.md) §3 S0 체크.
접속 정보는 여기 적지 않는다.

## 1. 장비·소프트웨어 프로필 (실측 2026-10-01)

| 항목 | 값 |
|---|---|
| 호스트명 | `GPU-Server` |
| OS | Rocky Linux 10.2 (Red Quartz), kernel 6.12.0-211.60.1.el10_2 |
| CPU / RAM | 12 vCPU / 30 GiB |
| GPU | **NVIDIA GeForce RTX 5070** (GB205, 12,227 MiB) × 1 |
| GPU UUID | `GPU-f46438bc-d07d-b71e-c0d4-095c449d6bd9` |
| 드라이버 / NVML | 615.71.09 (`libnvidia-ml.so.615.71.09` 존재), CUDA UMD 13.4 |
| PCI | 01:00.0, PCIe gen 1(유휴 시) |
| SELinux / 방화벽 | Enforcing / firewalld 실행 중, 열린 포트 없음(ssh 서비스만) |
| 컨테이너 | docker-ce 29.8.1 + nvidia-container-toolkit 1.20.1. podman 없음 |
| 미설치 | Zabbix 에이전트, DCGM, net-snmp |
| 저장소 | cuda-rhel10(**DCGM 4.7.0 패키지 있음**), docker-ce, epel |

🔴 **이 서버는 LLM 서비스가 돌고 있다**: `ollama`(11434), `llm-api`(8000), `chroma`(8001) 컨테이너 실행 중. 실측 작업은 이를 방해하지 않는 범위로 한다(GPU 부하 유발·드라이버 재적재·재부팅 금지). 나중 LLM 단계의 시험 대상도 될 수 있다.

## 2. `nvidia-smi` 원문 (A2 fixture)

```
$ nvidia-smi -L
GPU 0: NVIDIA GeForce RTX 5070 (UUID: GPU-f46438bc-d07d-b71e-c0d4-095c449d6bd9)

$ nvidia-smi --query-gpu=index,uuid,name,serial,driver_version,pstate,utilization.gpu,utilization.memory,memory.total,memory.used,memory.free,temperature.gpu,power.draw,power.limit,clocks.current.sm,clocks.current.memory,ecc.errors.corrected.volatile.total,ecc.errors.uncorrected.volatile.total,fan.speed,pcie.link.gen.current --format=csv
index, uuid, name, serial, driver_version, pstate, utilization.gpu [%], utilization.memory [%], memory.total [MiB], memory.used [MiB], memory.free [MiB], temperature.gpu, power.draw [W], power.limit [W], clocks.current.sm [MHz], clocks.current.memory [MHz], ecc.errors.corrected.volatile.total, ecc.errors.uncorrected.volatile.total, fan.speed [%], pcie.link.gen.current
0, GPU-f46438bc-d07d-b71e-c0d4-095c449d6bd9, NVIDIA GeForce RTX 5070, 0, 615.71.09, P8, 0 %, 1 %, 12227 MiB, 0 MiB, 11863 MiB, 38, 6.53 W, 250.00 W, 180 MHz, 405 MHz, [N/A], [N/A], 0 %, 1

$ nvidia-smi --query-gpu=mig.mode.current,ecc.mode.current,encoder.stats.sessionCount,clocks_throttle_reasons.active --format=csv
mig.mode.current, ecc.mode.current, encoder.stats.sessionCount, clocks_event_reasons.active
[N/A], [N/A], 0, 0x0000000000000400
```

### 원문에서 확인된 사실

| 사실 | 설계에 주는 의미 |
|---|---|
| **ECC·MIG는 `[N/A]`** — GeForce는 미지원 | 미지원 값의 실제 표기가 `[N/A]`임을 확인. A2 템플릿 전처리의 미지원 판정 문자열 근거. "0이 아니라 UNSUPPORTED" 테스트 케이스가 실장비에서 나온다 |
| `serial`이 `0` | GeForce는 시리얼을 주지 않는다. 식별은 UUID로만(09-17 원칙 재확인) |
| `memory.used 0 + free 11863 ≠ total 12227` | 364 MiB가 reserved. **used+free=total 강제 금지** 원칙 확인. DCGM의 FB_RESERVED 합산 검증에 쓸 수 있다 |
| 요청한 `clocks_throttle_reasons.active`가 응답 헤더에서 `clocks_event_reasons.active`로 바뀜 | 드라이버가 필드명을 개명함(별칭 유지). 템플릿은 **헤더 이름에 의존하지 말고 열 순서**로 파싱해야 한다 → 가정 A5-2로 추가 |
| 유휴 상태에서 P8·180 MHz·6.5 W | "낮은 clock = throttling"이 아님(설계 원칙) |
| GPU는 1장 | 다중 GPU 동작·index 변경 검증은 이 장비로 불가(모의로 대체) |

## 3. 설치 가능성 사전 확인 (읽기만)

| 경로 | 필요한 것 | 가용성 |
|---|---|---|
| B1 DCGM Exporter | `dcgm-exporter` 컨테이너(`--gpus all`) 또는 DCGM 패키지 | docker + nvidia-container-toolkit 있음. cuda-rhel10 저장소에 `datacenter-gpu-manager-4-*` 4.7.0 있음 |
| A2 nvidia-smi | Zabbix 에이전트 | `zabbix-agent2-7.0.31 el10` 패키지 있음(repo.zabbix.com 7.0/rhel/10) |
| A1′ 공식 플러그인 on 7.0 | NVIDIA 플러그인 EL10 rpm | **7.2 저장소에는 rhel/10이 없고, 7.4 저장소에 `zabbix-agent2-plugin-nvidia-gpu-7.4.15 el10`이 있음**. 7.0.31 Agent 2에 7.4.15 플러그인을 붙이는 시험이 된다(rpm 의존성에 agent 버전 조건이 있으면 수동 설치) |
| S1 SNMP | net-snmp | 미설치, 저장소에 있음 |

GeForce에서 DCGM이 지원하는 필드 범위는 데이터센터 GPU보다 좁을 수 있다 — 이것 자체가 UNSUPPORTED 처리 검증이다. 다만 **GeForce 1장의 결과를 데이터센터 GPU 지원 확인으로 쓰지 않는다**.

## 4. 다음 단계(승인 후)

| 단계 | 작업 | 영향 |
|---|---|---|
| 3 | `dcgm-exporter` 컨테이너 실행(:9400, `--gpus all`), firewalld에 9400 개방(dev Zabbix 서버 대상만) → `/metrics` 원문 저장 | 컨테이너 1개 추가, 포트 1개 개방 |
| 4 | zabbix-agent2 7.0.31 설치 + 7.4.15 NVIDIA 플러그인 설치 → `zabbix_agent2 -t nvml.device.get` 실행 시험 | 패키지 2개, 서비스 1개, 10050 개방 |
| 5 | dev Zabbix(dmove.co.kr)에 프리셋 템플릿 초안 가져오기 + GPU-SERVER 연결 | dev Zabbix 쓰기 |

LLM 컨테이너는 건드리지 않는다.
