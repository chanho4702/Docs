# GPU P1 S0 — 시험 서버 실측 프로필

시작: 2026-10-01 · 대상: `GPU-SERVER` 10.220.0.13 · 상태: **1~4단계 완료(10-07), 5단계(템플릿 가져오기) Zabbix 인증 대기**

설계 정본: [수집 경로 설계](solutions--devdesign_gpu-collection-paths.md) §12·§14.4 · [P1 상세](solutions--devdesign_gpu-monitoring-p1.md) §3 S0 체크.
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

## 5. 2026-10-07 진행 — 3·4단계 결과와 예상 밖 발견

### 서버에 이미 있던 것(10-01 17:47 설치, 사용자 작업)
| 항목 | 값 |
|---|---|
| Zabbix Agent 2 | **7.4.15** (el9 패키지), `Hostname=GPU-Server`, `Server/ServerActive=10.220.0.82` |
| NVIDIA 플러그인 | `zabbix-agent2-plugin-nvidia-gpu-7.4.15` (el9) |
| Zabbix 서버 | **10.220.0.82 = Zabbix 7.4.15**(`apiinfo.version` 실측, API 경로 `/api_jsonrpc.php`). dev 7.0.6(dmove.co.kr)과 별개 |

사용자 확인(10-07): GPU-SERVER 호스트는 **두 Zabbix 모두**에 등록. MovesEye 개발 런타임은 **dev70(5433→7.0.6)·dev74(5434→7.4.15) 프로필로 번갈아** 사용(BE `application.yml` 프로필 그룹, `_tools/run_be_3000_dev.ps1 -Profile dev74`).

### 3단계 — DCGM Exporter (Claude 설치)
- `docker run -d --name dcgm-exporter --restart unless-stopped --gpus all --cap-add SYS_ADMIN -p 9400:9400 nvcr.io/nvidia/k8s/dcgm-exporter:4.5.2-4.8.1-ubi9`
- 정상 기동, 지표 **20개**(기본 CSV 중 GeForce가 내보내는 것). 원문: `gpu-dcgm-metrics-rtx5070-20261007.txt`
- 실측 사실: 라벨 `gpu, UUID, pci_bus_id, device, modelName, Hostname(컨테이너 ID — 신뢰 금지), DCGM_FI_DRIVER_VERSION` · 빠진 지표 `XID_ERRORS, NVLINK_BANDWIDTH_TOTAL, remapped rows, ROW_REMAP_FAILURE`(응답에 없음 → METRIC_ABSENT 실제 케이스) · `MEMORY_TEMP`는 미지원인데 **0으로 옴** · `FB_USED+FREE+RESERVED=12225 MiB ≠ nvidia-smi total 12227`(2 MiB 오차)

### 4단계 — 공식 플러그인 원시 응답(`zabbix_agent2 -t`)
| 키 | 응답 | 의미 |
|---|---|---|
| `nvml.device.utilization.gpu["UUID"]` | `ZBX_NOTSUPPORTED [Unknown metric]` | **에이전트 키가 아니다**. 템플릿의 dependent 키일 것 — 공식 템플릿 원문 확인 필요 |
| `nvml.device.memory.fb.get["UUID"]` | `{"total_memory_bytes":12820938752,"free_memory_bytes":…,"used_memory_bytes":…}` | bytes JSON 마스터 |
| `nvml.device.errors.memory["UUID"]` | `ZBX_NOTSUPPORTED [… NVML error: The requested operation is not available on target device.]` | **미지원 오류 문구 확정**(NVML_PLUGIN allowlist) |
| `nvml.device.sm.frequency["UUID"]` | `180.000000` | 원시 MHz(P1 §4의 "저장 Hz"는 템플릿 전처리 결과일 수 있음 — 확인) |
| `nvml.device.power.usage["UUID"]` | `8022.000000` | **원시 mW** |
| `nvml.device.pci.utilization["UUID"]` | `{"tx_rate_kb_s":995,"rx_rate_kb_s":502}` | KB/s JSON 마스터 |
| `nvml.device.performance.state["UUID"]` | `8.000000` | 숫자 P-state |
| `nvml.device.get` | `[{"device_uuid":"GPU-…","device_name":"NVIDIA GeForce RTX 5070"}]` | 발견 JSON 필드명 확정 |

결론: NVML_PLUGIN 프로필의 **저장 키·단위는 공식 템플릿의 dependent 아이템·전처리가 결정**한다. 7.4 서버에서 템플릿 원문(`template.get`/export)을 받아 어댑터 키 표를 맞추는 것이 5단계의 첫 일이다.

### 방화벽(Claude 변경)
rich rule 4개 추가: `211.174.53.7`·`10.220.0.82` → tcp 10050·9400 허용. 그 외 변경 없음. LLM 컨테이너(ollama·llm-api·chroma) 무변경.

### 5단계 대기 항목
- Zabbix 로그인(7.0.6·7.4.15 각각) — 사용자가 계정/비밀번호 제공 예정
- 7.0.6: 프리셋 템플릿 2종 가져오기 → GPU-SERVER 연결 → 값 수신 확인
- 7.4.15: 공식 템플릿 연결 상태·수신 값·export 원문 확보

## 6. 2026-10-08 — Zabbix 7.4.15(10.220.0.82) 공식 템플릿 실측

로그인 계정 수령(Admin). 호스트 `GPU-Server`(hostid 10676, 에이전트 인터페이스 10.220.0.13:10050 **available=1**), 공식 템플릿 `Nvidia by Zabbix agent 2`(10677) 연결됨, 상속 태그 `class=hardware`·`target=nvidia`(→ **가정 A12 템플릿 태그 상속은 7.4에서 성립**). 서버 전체 호스트 4대.

원문 파일: `gpu-nvml-official-template-7.4.15.yaml`(export), `gpu-nvml-official-items-rtx5070-20261008.json`(아이템 42개 실값), `gpu-nvml-official-lld-triggers-20261008.json`(LLD 1·트리거 25).

| 확정 사실 | 설계 영향 |
|---|---|
| 저장 키는 P1 §4 표와 동일. `utilization.gpu` 등은 **dependent 아이템**(마스터 `.utilization` JSON 등) | 어댑터 키 표 유지 |
| 발견은 LLD `nvml.device.discovery`(dependent of `nvml.device.get`), `{#UUID}`←`$.device_uuid` | 프리셋과 같은 LLD 경로 |
| 단위: clock `Hz`(MHz×1e6 저장) · 전력 `watts`(mW×0.001) · 메모리 `B` · 온도 `C` · 에너지 `J` · **PCIe는 units `bps`로 표기돼 있지만 실제 전처리는 `kb_s×1024`라 bytes/s** | 어댑터는 PCIe 재변환 금지(P1 §4 원칙 확인), units 문자열 allowlist |
| 미지원 오류 문구 3종: `No ECC on the device or ECC mode is turned off.`(ECC 6개, state=1인데 lastvalue `0` 잔존) · `NVML library too old to support this metric.`(fb.reserved) · `The requested operation is not available on target device.` | NVML_PLUGIN allowlist 확정. **state 오류 아이템의 잔존 `0`을 OK로 읽으면 안 됨** 실증 |
| `performance.state` 숫자(유휴 8 → 부하 1) · `serial` TEXT `0` | P-state `P1` 표기 통일, serial null |
| 주기 1m · history 31d · trends 365d | freshness 기준 60s |
| 트리거 25개 전부 `nvml.*` 아이템 참조(활동률 80/90 기본 **켜짐**) | GPU 이벤트 귀속은 trigger expression의 item key에서 UUID 추출 가능 → S2 메모 |

측정 시점 GPU는 부하 중(활동률 0이지만 전력 239.9 W·온도 56°C·P1·VRAM 9.3 GB) — ollama가 모델을 올린 상태. 활동률 0과 고전력이 공존하는 실제 표본(활동률 단독으로 유휴 판정 금지 원칙의 근거).

## 7. 2026-10-08 — dev74 샌드박스 초기화 중 발견: BE가 Zabbix 7.2 이상과 통신 불가

- master BE를 :3002 + DB 5434로 띄워(Flyway 71개 적용) 라이선스(`dev74-zbx74_PREMIUM_20261008.lic`, 등록 기한 3650일로 신규 발급 — 기존 .lic 전부 등록 기한 만료) 등록까지 성공.
- `POST /settings/zabbix`(7.4 접속 저장)에서 Zabbix 응답 **`Invalid parameter "/": unexpected parameter "auth".`** → 저장 실패.
- 원인: `engine-zabbix/.../client/ZabbixClient.doCallRaw`가 토큰을 **요청 본문 `auth`**로 보낸다(NestJS 포팅 그대로). Zabbix는 6.4부터 `Authorization: Bearer` 헤더를 지원하고 본문 `auth`를 deprecated로 두었으며, **7.2에서 제거**했다(7.4.15 실측 거부). 6.0 문서에는 헤더 방식이 없다.
- 영향: GPU와 무관하게 **Zabbix 7.2 이상 고객은 현재 제품과 연동 자체가 안 된다.**
- 수정 방향(ZM-78 안에서 [FIX]로 분리 커밋): 헤더를 항상 보내고, 본문 `auth`는 서버 버전 < 6.4일 때만 추가. 버전은 무인증 `apiinfo.version`으로 URL별 1회 조회·캐시. 버전을 모르면 헤더만(최신 기본).
- 상태: S2 에이전트의 전체 테스트가 같은 워크트리에서 도는 중이라 적용 대기.

## 8. 2026-10-08 — dev 7.0.6에 프리셋 가져오기·연결 실측

- 로그인: BE 저장 자격증명을 로컬 `.env` 키로 복호화해 메모리에서만 사용(사용자 승인).
- **프리셋 2종 가져오기 성공**(templateid 10761 DCGM / 10762 nvidia-smi) — 7.0 export 형식·전처리 타입(`PROMETHEUS_TO_JSON`·`JAVASCRIPT`·`CSV`·`CUSTOM_ERROR`)·uuid·템플릿 태그 전부 수용(가정 "문법 수용" 해소).
- DCGM 프리셋 → `GPU-SERVER`(10760) 연결, nvidia-smi 프리셋 → 같은 IP의 두 번째 호스트 `GPU-SERVER-SMI`(10763, 그룹 Tom-test) 신설 연결(같은 호스트에 두 프리셋은 키 충돌로 불가 — 설계대로).
- GPU 서버: `/usr/local/bin/moveseye-gpu-smi.sh` + `/etc/zabbix/zabbix_agent2.d/moveseye-gpu-smi.conf` 배치, SELinux 컨텍스트 `bin_t`, `zabbix` 계정 실행 OK(19열 CSV, `[N/A]` 2개), `Server=`에 211.174.53.7 추가.

| 실측 | 결론 |
|---|---|
| DCGM 마스터 오류 `Could not resolve host: {HOST.CONN}` | **가정 A5 거짓** — 사용자 매크로 값 안의 `{HOST.CONN}`은 전개되지 않는다. URL 필드에 직접 `{HOST.CONN}` 사용 + 포트·스킴만 매크로로(템플릿 수정 중). 호스트 인터페이스 필수 |
| 10763 인터페이스 `cannot establish TCP connection to [[10.220.0.13]:10050]: timed out` | **dmove.co.kr(공인)→사설망 미도달**. 7.0.6에서는 패시브 에이전트·HTTP agent 모두 불가. GPU 서버→211.174.53.7:10051은 OPEN → **액티브 에이전트만 가능** |
| 에이전트 로그 `Plugin communication protocol version is 6.4.0` | 공식 플러그인 통신 규약 6.4.0 재확인(§1 A1′ 근거) |

조치: ① nvidia-smi 프리셋 **액티브 변형** 추가(에이전트 `Hostname=GPU-Server,GPU-SERVER-SMI`, `ServerActive`에 7.0.6 추가) ② DCGM HTTP 경로는 같은 LAN의 **7.4(10.220.0.82)에 프리셋을 가져와 공식 템플릿과 같은 호스트에 연결**해 검증(키 미충돌 → `MULTIPLE_PROFILES` 케이스 겸함) ③ 7.0.6에서 DCGM을 보려면 LAN 안 Zabbix 프록시가 필요 — 이번 범위 밖, 설치 안내에 "프록시 권장" 근거로 기록.

## 9. 2026-10-08 — 프리셋 경로 런타임 수신 확인 ✅

| 경로 | Zabbix | 호스트 | 결과 |
|---|---|---|---|
| nvidia-smi **액티브** 프리셋(`gpu-nvidia-smi-active` 1.0) | 7.0.6 | GPU-SERVER-SMI(10763) | **수신 성공** 아이템 20개: 모델·PCI·`P8`·W·MHz·B·%·C, LLD 발견 1장. `vram.total` 12,820,938,752 B = NVML total 정확히 일치. ECC `[N/A]`·serial `0`은 state=1이나 오류 문구가 `Preprocessing failed … 2. Failed: unsupported`(JS throw) → 템플릿 CUSTOM_ERROR로 교정 중, 어댑터는 포함 일치로 완화 |
| DCGM HTTP 프리셋(`gpu-dcgm-http` 1.0, URL `{HOST.CONN}` 직접) | **7.4.15**(같은 LAN) | GPU-Server(10676, 공식 템플릿과 **동시 연결**) | **수신 성공** 아이템 24개. ABSENT 6개(xid·nvlink·power.limit·ecc×2·performance.state)는 error 정확히 `MOVESEYE_GPU_METRIC_ABSENT`. `pcie.rx/tx` B/s 수신(GeForce에 PROF_PCIE 있음). 합산 total 12,819,890,176 B(NVML보다 1 MiB 작음) |
| DCGM HTTP 프리셋 | 7.0.6 | GPU-SERVER(10760) | 연결 시간 초과(공인망→사설망 불가, 환경 한계) |
| 7.0 형식 템플릿 → 7.4 가져오기 | 7.4.15 | — | 성공(상향 호환, 가정 A6 일부 해소) |

가정 해소: A5(거짓→URL 직접), A6(7.0→7.4 상향 OK; 6.0 파일은 별도), A12(태그 상속 7.4 확인; 7.0은 어댑터 런타임에서 확인 예정), "오류 문구 그대로 남는지"(DCGM ✓, smi는 CUSTOM_ERROR 필요).

### ZabbixClient 7.2+ 인증 수정(코드)
`engine-zabbix/.../client/ZabbixClient.java`: 토큰은 항상 `Authorization: Bearer`, 본문 `auth`는 `apiinfo.version`으로 알아낸 서버 버전이 6.4 미만일 때만(URL별 10분 캐시, 실패 시 헤더만·60초 뒤 재시도). 로그인·버전 조회는 헤더·본문 모두 없음(`"auth": null`도 7.2+가 거부). 테스트 `ZabbixClientAuthTransportTest` 5건 + 기존 `requestShape` 기대값 수정. 런타임 확인(dev74 설정 저장)은 워크트리 BE 기동 후.
- 10-08 후속: smi 템플릿을 CUSTOM_ERROR 방식으로 교정·재가져오기 → 7.0.6 GPU-SERVER-SMI의 ECC·serial error가 정확히 `MOVESEYE_GPU_UNSUPPORTED`로 남음 ✅(가정 "오류 문구 그대로" 세 템플릿 모두 해소).

## 10. 2026-10-08 — 워크트리 BE(dev74) 런타임 검증에서 잡힌 것

| # | 증상 | 원인 | 조치 |
|---|---|---|---|
| R1 | 7.4 접속 저장 성공 | — | **ZabbixClient 인증 수정 런타임 확인 ✅** |
| R2 | 설치 가이드 API 4종 정상(버전 7.4.15·경로 4종 가용·프리셋 설치 상태·호스트 프로필·파일 내려받기·경로 조작 거부) | — | ✅ |
| R3 | `GET /gpu/devices` 503 | `item.get selectItemDiscovery`에 7.0 전용 `lastcheck` 요청 → 7.4 거부 | 공통 필드(`parent_itemid,key_,ts_delete`)만 요청, 양 버전 거부 메시지를 재현하는 테스트 |
| R4 | `GET /gpu/devices` 503 | 비LLD 아이템의 `itemDiscovery`가 `[]`(PHP 빈 배열) → 역직렬화 실패로 청크 전체 소실 | `[]`→null, 아이템 단위 변환·`PARSE_FAILED` 격리 |
| R5 | 재기동 후 모든 Zabbix 호출 `Session terminated, re-login, please.` → 401 | **dev70(:3000)과 dev74(:3002)가 같은 Redis DB 0 공유** → `REDIS_USER_API_TOKEN`·슈퍼관리자 토큰이 서로 덮어써져 7.0.6용 토큰으로 7.4를 호출 | `application-dev74-db.yml`에 `spring.data.redis.database: 1`. **교훈: 같은 Redis를 쓰는 BE 두 벌은 Zabbix 서버가 다르면 안 된다** — 설치 가이드/운영 문서에 "BE 인스턴스마다 Redis DB 분리" 명시 |
| R6 | 새 샌드박스(5435, 빈 Redis)에서 라이선스 등록·조회까지 `LICENSE_REQUIRED` | **기존 결함**: Zabbix URL이 설정도 env도 없는 새 설치에서 `JwtAuthFilter`→슈퍼관리자 로그인→`new HttpPost(null)` NPE(500) → 오류 디스패치가 라이선스 게이트(비면제 핸들러)에 걸려 `LICENSE_REQUIRED`로 둔갑. dev74 때는 공유 Redis DB 0에 dev70 BE의 슈퍼관리자 토큰이 캐시돼 있어 드러나지 않음 | `ZabbixClient`에 URL 미설정 명시 오류 추가(테스트 `missingUrl_isExplicitError`). 🔴 후속: 새 설치 첫 화면 동선(Zabbix URL 입력 전 관리자 요청) 전수 점검 — 라이선스 등록이 Zabbix 로그인에 의존하면 안 됨. dev DB의 Zabbix 비밀번호는 `enc:v1:` 접두 없는 **평문 저장 상태**(레거시, 코덱이 평문도 받음) |
