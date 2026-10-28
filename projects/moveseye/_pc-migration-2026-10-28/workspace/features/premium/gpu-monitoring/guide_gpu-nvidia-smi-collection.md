# GPU 수집 — nvidia-smi 에이전트 방식 설계·스크립트 문서

작성: 2026-10-13 · 티켓: ZM-78 · 상위 설계: `devdesign_gpu-collection-paths.md`(v1.0) · 실측 기록: `features/premium/gpu-monitoring/gpu-p1-source-profile.md`

> 이 문서는 GPU 수집 3경로 중 **nvidia-smi 프리셋**(`gpu-nvidia-smi`·`gpu-nvidia-smi-active`) 하나만 다룬다.
> 정본 파일은 BE `src/main/resources/zabbix-presets/` 아래에 있고, 이 문서의 코드 블록은 그 사본이다(1.0 기준).

---

## 1. 한 줄 요약

GPU 서버에 **셸 스크립트 1개 + Zabbix 에이전트 설정 1줄**을 넣는다. Zabbix가 1분에 한 번 그 스크립트를 부르고, 스크립트는 `nvidia-smi`를 한 번 돌려 전체 GPU 값을 CSV로 돌려준다. 값을 쪼개고 저장하는 일은 Zabbix 서버가 하고, MovesEye는 Zabbix API로 읽기만 한다.

## 2. 왜 이 방식이 있나

| 경로 | 서버에 필요한 것 | Zabbix 버전 | 비고 |
|---|---|---|---|
| 공식 플러그인 | Agent 2 + NVIDIA 플러그인 | **7.2 이상** | Zabbix 공식. 7.0·6.0 LTS 고객은 못 씀 |
| DCGM HTTP | `dcgm-exporter` 컨테이너(:9400) | 제한 없음 | 지표 가장 많음. 설치 무거움, HTTP 포트 개방 필요 |
| **nvidia-smi (이 문서)** | **스크립트 1 + 설정 1줄** | **제한 없음**(7.0 형식 템플릿) | 가장 가벼움. 드라이버만 있으면 됨 |

설치형 제품이라 고객 Zabbix 버전을 통제할 수 없다. 7.0·6.0 LTS 고객에게도 GPU를 보여 주기 위한 **기본 대안**이 이 방식이다.
MovesEye는 호스트별로 어떤 경로가 붙어 있는지 자동 판정하며, 여러 개면 DCGM > 공식 > nvidia-smi 순으로 고른다.

## 3. 구성 요소

```
┌──────────── GPU 서버 ────────────┐        ┌──── Zabbix 서버 ────┐        ┌──── MovesEye ────┐
│ NVIDIA 드라이버 (nvidia-smi 포함) │        │ 프리셋 템플릿        │        │ BE (Zabbix API)  │
│ Zabbix agent / agent 2           │◀─요청─▶│  마스터 아이템 1개    │◀─API──▶│ 목록·상세·차트    │
│  └ moveseye-gpu-smi.conf (1줄)   │  1분/1회│  종속 아이템·LLD     │        │ Redis 단기 캐시   │
│ /usr/local/bin/moveseye-gpu-smi.sh│        │  트리거              │        │                  │
└──────────────────────────────────┘        │ Zabbix DB(history)  │        └──────────────────┘
                                             └─────────────────────┘
```

| 구성 | 누가 만듦 | 위치 |
|---|---|---|
| NVIDIA 드라이버·`nvidia-smi` | NVIDIA(기존) | GPU 서버 |
| Zabbix agent / agent 2 | Zabbix(기존) | GPU 서버 |
| `moveseye-gpu-smi.sh` | **MovesEye** | GPU 서버 `/usr/local/bin/` |
| `moveseye-gpu-smi.conf` | **MovesEye** | GPU 서버 에이전트 include 폴더 |
| 프리셋 템플릿(YAML) | **MovesEye** | Zabbix 서버로 가져오기(설치 가이드 화면) |

프리셋은 두 가지이며 **서버에 넣는 파일은 같다**. 템플릿의 마스터 아이템 유형만 다르다.

| 프리셋 | 템플릿 이름 | 마스터 아이템 | 언제 쓰나 |
|---|---|---|---|
| `gpu-nvidia-smi` | MovesEye GPU by nvidia-smi | `ZABBIX_PASSIVE`(서버→에이전트 :10050) | 기본 |
| `gpu-nvidia-smi-active` | MovesEye GPU by nvidia-smi (Zabbix agent active) | `ZABBIX_ACTIVE`(에이전트→서버 :10051) | 서버가 에이전트에 접속 못 할 때(방화벽·NAT·공인↔사설망) |

## 4. 수집 흐름

1. Zabbix가 `{$MOVESEYE.GPU.INTERVAL}`(기본 `1m`)마다 키 `moveseye.gpu.raw`를 요청한다.
2. 에이전트가 `UserParameter`에 따라 `/usr/local/bin/moveseye-gpu-smi.sh`를 실행한다.
3. 스크립트가 `nvidia-smi --query-gpu=…19개 열… --format=csv,noheader,nounits`를 **한 번** 실행하고 결과를 가공 없이 돌려준다(GPU 1장당 1줄).
4. Zabbix 서버의 전처리가 값을 쪼갠다.
   - `nvidia-smi: Get data`(마스터): CSV 원문. **저장 안 함**(history 0).
   - `GPU: Parsed data`(종속): JavaScript로 `{gpus: {UUID: [열…]}, count, driver}` JSON으로 접는다. 열 수가 19가 아니거나 2번째 열이 `GPU-`로 시작하지 않으면 실패시킨다. **저장 안 함**.
   - `GPU discovery`(종속 LLD): GPU별 `{#UUID}`·`{#GPUINDEX}`·`{#MODEL}`·`{#SERIAL}`을 만든다.
   - GPU별 아이템(종속): `$.gpus['{#UUID}'][열번호]`를 JSONPath로 꺼낸다.
5. 아이템이 수십 개여도 **서버에서 실행되는 건 1분에 1번**이다. 나머지는 Zabbix 서버 안에서 같은 값을 나눠 쓴다.

### 미지원·누락 값 처리
- `N/A`·`[N/A]`·`Not Supported`·빈 값 → 아이템을 "지원 안 됨"으로 만들고 오류 문구를 `MOVESEYE_GPU_UNSUPPORTED`로 둔다. 예: GeForce의 ECC, 시리얼 `0`.
- 열 자체가 없음 → `MOVESEYE_GPU_METRIC_ABSENT`.
- MovesEye BE는 이 두 문구로 "장비가 지원 안 함"과 "수집 실패"를 구분해 화면에 표시한다.

## 5. 수집 항목 (CSV 열 → 아이템)

| 열 | nvidia-smi 필드 | Zabbix 키 | 단위 | 비고 |
|---|---|---|---|---|
| 0 | index | `{#GPUINDEX}` | | LLD 매크로 |
| 1 | uuid | `{#UUID}` | | 아이템 키의 식별자. 슬롯이 바뀌어도 같은 GPU로 추적 |
| 2 | name | `moveseye.gpu.model[{#UUID}]` | | 바뀔 때만 저장(하루 1회 heartbeat) |
| 3 | serial | `moveseye.gpu.serial[{#UUID}]` | | GeForce는 `0` → 미지원 |
| 4 | driver_version | `moveseye.gpu.driver.version` | | 호스트 단위 |
| 5 | pstate | `moveseye.gpu.performance.state[{#UUID}]` | | P0~P12 |
| 6 | utilization.gpu | `moveseye.gpu.utilization[{#UUID}]` | % | |
| 7 | utilization.memory | `moveseye.gpu.memory.activity[{#UUID}]` | % | 메모리 대역 활동률(사용량 아님) |
| 8 | memory.total | `moveseye.gpu.vram.total[{#UUID}]` | B | MiB×1048576 |
| 9 | memory.used | `moveseye.gpu.vram.used[{#UUID}]` | B | |
| 10 | memory.free | `moveseye.gpu.vram.free[{#UUID}]` | B | |
| 11 | temperature.gpu | `moveseye.gpu.temperature[{#UUID}]` | C | |
| 12 | power.draw | `moveseye.gpu.power.draw[{#UUID}]` | W | |
| 13 | power.limit | `moveseye.gpu.power.limit[{#UUID}]` | W | |
| 14 | clocks.current.sm | `moveseye.gpu.clock.sm[{#UUID}]` | MHz | |
| 15 | clocks.current.memory | `moveseye.gpu.clock.memory[{#UUID}]` | MHz | |
| 16 | ecc.errors.corrected.volatile.total | `moveseye.gpu.ecc.corrected[{#UUID}]` | | |
| 17 | ecc.errors.uncorrected.volatile.total | `moveseye.gpu.ecc.uncorrected[{#UUID}]` | | |
| 18 | pci.bus_id | `moveseye.gpu.pci.bus[{#UUID}]` | | 바뀔 때만 저장 |

이 밖에 호스트 단위로 `moveseye.gpu.device.count`(GPU 수)가 있다.

⚠️ **열 순서가 계약이다.** 템플릿은 CSV 헤더 이름이 아니라 열 순서로 읽는다. 드라이버가 필드 이름을 바꾸는 일이 있어서다. 스크립트의 `QUERY`를 바꾸면 템플릿 전처리와 `moveseye_preset_version`도 함께 올려야 한다.

## 6. 트리거와 매크로

| 트리거 | 조건 | 심각도 | 기본 |
|---|---|---|---|
| 수집 중단 | GPU 수 값이 `{$MOVESEYE.GPU.NODATA}`(30m) 동안 없음 | | 켜짐 |
| GPU 수 변경 | 발견된 GPU 수가 바뀜 | | 켜짐 |
| 온도 심각 | `{$MOVESEYE.GPU.TEMP.DURATION}`(5m) 동안 최소값 > `{$MOVESEYE.GPU.TEMP.CRIT}`(95) | HIGH | 켜짐 |
| 온도 높음 | 같은 조건, > `{$MOVESEYE.GPU.TEMP.WARN}`(85). 심각 트리거가 켜져 있으면 억제 | WARNING | 켜짐 |
| ECC 정정 불가 오류 증가 | `change(ecc.uncorrected) > 0`. 수동으로 닫음 | HIGH | 켜짐 |
| 활동률 높음 | `{$MOVESEYE.GPU.UTIL.DURATION}`(15m) 동안 > `{$MOVESEYE.GPU.UTIL.HIGH}`(90) | INFO | **꺼짐**(학습 중 100%는 정상) |

| 매크로 | 기본값 | 용도 |
|---|---|---|
| `{$MOVESEYE.GPU.INTERVAL}` | `1m` | 수집 주기. 호스트별로 덮어쓰기 가능 |
| `{$MOVESEYE.GPU.NODATA}` | `30m` | 수집 중단 판정 시간 |
| `{$MOVESEYE.GPU.TEMP.WARN}` / `.CRIT` | `85` / `95` | 온도 임계치(C) |
| `{$MOVESEYE.GPU.TEMP.DURATION}` | `5m` | 온도 초과 지속 시간 |
| `{$MOVESEYE.GPU.UTIL.HIGH}` / `.DURATION` | `90` / `15m` | 활동률 트리거(기본 꺼짐) |
| `{$MOVESEYE.GPU.UUID.MATCHES}` / `.NOT_MATCHES` | `.*` / `CHANGE_IF_NEEDED` | 발견 대상 GPU 필터 |

## 7. 데이터는 어디에 저장되나

**GPU 측정값은 MovesEye DB에 저장하지 않는다. 전부 Zabbix DB에 저장된다.**

| 저장소 | 무엇 | 보존 |
|---|---|---|
| **Zabbix DB `history`**(숫자) / `history_str`(문자) | GPU별 사용률·VRAM·온도·전력·클럭·ECC 같은 원시값(1분 간격) | 숫자 아이템은 템플릿에 따로 지정하지 않아 **Zabbix 기본값**(7.0: history 31일)을 따른다. 모델·시리얼·PCI는 7일 |
| **Zabbix DB `trends`** | 위 숫자값의 시간별 최소·평균·최대 | Zabbix 기본값(7.0: 365일) |
| Zabbix DB (저장 안 함) | 마스터 CSV 원문, 중간 JSON | history 0. 전처리에만 쓰고 버린다 |
| **MovesEye PostgreSQL** | `gpu_setting`(V73): 관리자가 설치 안내에서 고른 연동 방식 1행. `home_widget`(`dashboard_key = gpu:detail`): 사용자별 GPU 상세 위젯 배치. 권한 `gpuMonitoring`(V72) | 영구. **측정값 없음** |
| **MovesEye Redis** | GPU 목록 스냅샷 캐시(30초), 페이지 이동용 snapshotId(60초), 소스 장애 시 대신 보여 줄 마지막 완전 스냅샷(2분), 사라진 GPU 기억 `gpu:seen:v1:{source}:{hostId}`(24시간, REMOVED 표시용) | 단기. 재시작·비우기 시 사라져도 기능에 문제 없음 |

MovesEye가 읽는 방식은 다음과 같다.
- **목록·상세의 현재값**: Zabbix API `item.get`(마지막 값)을 엔진 `GpuInventoryPort`가 스냅샷으로 만든다.
- **차트**: 24시간 이하면 `history.get`(원시), 그보다 길면 `trend.get`(시간별)을 쓴다. 기간 길이에 따라 자동으로 고른다.
- 보존 기간을 바꾸려면 Zabbix에서 템플릿 아이템의 History/Trends나 전역 Housekeeping을 조정한다. MovesEye 쪽 설정은 없다.

## 8. 서버 부하와 안전장치

| 장치 | 내용 |
|---|---|
| 1분 1회 | 마스터 아이템 1개만 에이전트에 요청한다. 나머지는 종속 아이템이다 |
| 읽기 전용 | `nvidia-smi --query-gpu`는 조회만 한다. 보통 0.1~1초 걸리며 GPU 작업에 영향은 거의 없다 |
| 겹침 방지 | `flock`으로 동시 실행을 막는다. 4초 기다려도 잠금을 못 얻으면 `MOVESEYE_GPU_SMI_BUSY`를 반환한다 |
| 시간 제한 | `timeout 10`. 드라이버가 멈춰도 프로세스가 쌓이지 않는다. 아이템 timeout은 15초(대기 4 + 실행 10 < 15) |
| 인자 없음 | 키에 `[*]`가 없어 밖에서 명령을 끼워 넣을 경로가 없다 |
| 로케일 고정 | `LC_ALL=C`로 소수점·문구가 지역 설정에 따라 바뀌지 않게 한다 |
| 실패 문구 보존 | 실패해도 메시지를 그대로 반환한다. 열 수 검사에서 걸려 Zabbix 아이템 오류로 남는다 |

## 9. 설치 절차 (Linux)

```bash
# 1) 스크립트
install -m 755 moveseye-gpu-smi.sh /usr/local/bin/moveseye-gpu-smi.sh
# SELinux(RHEL·Rocky) 사용 시
restorecon -v /usr/local/bin/moveseye-gpu-smi.sh   # 컨텍스트 bin_t

# 2) 에이전트 설정 (설치된 에이전트에 맞는 쪽 하나)
cp moveseye-gpu-smi.conf /etc/zabbix/zabbix_agent2.d/   # agent 2
cp moveseye-gpu-smi.conf /etc/zabbix/zabbix_agentd.d/   # agent 1
#   7.0 미만 에이전트는 아이템 timeout을 모르므로 에이전트 설정에 Timeout=15
#   액티브 프리셋이면 에이전트 설정의 ServerActive=, Hostname=(Zabbix 호스트 이름과 일치) 확인

# 3) 재시작·확인
systemctl restart zabbix-agent2      # 또는 zabbix-agent
sudo -u zabbix /usr/local/bin/moveseye-gpu-smi.sh   # zabbix 계정으로 19열 CSV가 나오면 OK
zabbix_agent2 -t moveseye.gpu.raw                   # agent 1은 zabbix_agentd -t

# 4) Zabbix 서버: 프리셋 템플릿 가져오기 → 호스트에 연결 (MovesEye 설치 가이드 화면에서 진행)
```

제약은 다음과 같다.
- 한 호스트에 `gpu-nvidia-smi`와 `gpu-nvidia-smi-active`를 동시에 연결할 수 없다. 키가 겹친다.
- 다른 경로(DCGM·공식)와는 키가 달라 함께 연결할 수 있다. 이때 MovesEye는 우선순위로 하나를 고르고 수집 방식 현황 화면에 "겹침"으로 표시한다.
- Windows(`nvidia-smi.exe`)는 1.0 범위 밖이다.

## 10. 스크립트 원문 — `moveseye-gpu-smi.sh`

```bash
#!/usr/bin/env bash
# MovesEye preset gpu-nvidia-smi 1.0 — nvidia-smi collector for Zabbix agent UserParameter moveseye.gpu.raw
#
# - 인자를 받지 않는다(UserParameter 인자 주입 경로를 원천 차단).
# - nvidia-smi를 한 번만 실행해 모든 GPU의 고정 열 목록을 CSV(noheader, nounits)로 받는다.
# - 출력은 가공하지 않고 그대로 반환한다. 파싱·단위 변환·미지원 판정은 템플릿 전처리가 한다.
# - 열 순서는 템플릿 "MovesEye GPU by nvidia-smi"의 전처리와 1:1이다. 이 목록을 바꾸면 템플릿 버전도 올려야 한다.
#   (CSV 헤더 이름은 드라이버가 개명하는 일이 있어 템플릿은 헤더가 아니라 열 순서로 읽는다.)
# - flock으로 동시 실행을 막고, nvidia-smi는 10초 안에 끝나지 않으면 끊는다.
#   에이전트 아이템 timeout은 15초다(대기 4초 + 실행 10초 < 15초).
# - 실패 시에도 메시지를 그대로 내보낸다 -> 템플릿 중간 아이템이 열 수 불일치로 실패하며 그 문구가 Zabbix에 남는다.
#
# Windows용(nvidia-smi.exe + PowerShell)은 이 버전 범위 밖이다.

export LC_ALL=C

QUERY="index,uuid,name,serial,driver_version,pstate,utilization.gpu,utilization.memory,memory.total,memory.used,memory.free,temperature.gpu,power.draw,power.limit,clocks.current.sm,clocks.current.memory,ecc.errors.corrected.volatile.total,ecc.errors.uncorrected.volatile.total,pci.bus_id"
LOCK_FILE="${MOVESEYE_GPU_LOCK:-/tmp/moveseye-gpu-smi.lock}"

exec 9>"$LOCK_FILE" || { echo "MOVESEYE_GPU_SMI_LOCK_FAILED: cannot open $LOCK_FILE"; exit 1; }
if ! flock -w 4 9; then
    echo "MOVESEYE_GPU_SMI_BUSY: previous nvidia-smi run still holds the lock"
    exit 1
fi

# 잠금 fd(9)는 nvidia-smi가 끝날 때까지 유지된다.
exec timeout 10 nvidia-smi --query-gpu="$QUERY" --format=csv,noheader,nounits 2>&1
```

### 10.1 줄별 설명

| 줄 | 하는 일 | 왜 |
|---|---|---|
| `#!/usr/bin/env bash` | bash로 실행한다 | `flock`·`exec` 리다이렉션을 쓰므로 sh가 아니라 bash여야 한다 |
| `export LC_ALL=C` | 언어·지역 설정을 영어 기본으로 고정한다 | 한국어·독일어 로케일이면 소수점이 `,`로 나와 CSV 열이 깨질 수 있다. 오류 문구도 영어로 고정된다 |
| `QUERY="index,uuid,…,pci.bus_id"` | `nvidia-smi`에 물어볼 19개 필드를 고정 순서로 적는다 | 템플릿이 이 **순서**로 값을 꺼낸다(§5). 필드를 더하거나 순서를 바꾸면 템플릿도 같이 바꿔야 한다 |
| `LOCK_FILE="${MOVESEYE_GPU_LOCK:-/tmp/moveseye-gpu-smi.lock}"` | 잠금 파일 경로. 환경변수가 있으면 그 값을 쓴다 | `/tmp`를 쓸 수 없는 환경에서 경로를 바꿀 수 있게 열어 둔 것이다 |
| `exec 9>"$LOCK_FILE" \|\| {…}` | 잠금 파일을 번호 9번 통로로 연다. 못 열면 `MOVESEYE_GPU_SMI_LOCK_FAILED`를 출력하고 끝낸다 | `flock`이 잡을 대상이 필요하다. 실패 이유를 Zabbix 오류로 남기려고 문구를 출력한다 |
| `flock -w 4 9` | 9번 통로에 잠금을 건다. 다른 실행이 잡고 있으면 최대 4초 기다린다 | 이전 실행이 아직 안 끝났을 때(드라이버 지연, 수동 테스트와 겹침) `nvidia-smi`가 여러 개 쌓이는 것을 막는다 |
| `echo "MOVESEYE_GPU_SMI_BUSY…"; exit 1` | 4초 안에 잠금을 못 얻으면 "바쁨"을 출력하고 끝낸다 | 이번 주기는 건너뛴다. 이 한 줄은 19열이 아니므로 템플릿 파싱에서 실패해 Zabbix에 문구가 남는다 |
| `exec timeout 10 nvidia-smi --query-gpu="$QUERY" --format=csv,noheader,nounits 2>&1` | 스크립트 프로세스를 `nvidia-smi`로 바꿔 실행한다. 10초를 넘기면 강제로 끝낸다 | `exec`라서 셸이 남지 않고, 9번 통로(잠금)가 `nvidia-smi`가 끝날 때까지 유지된다. `noheader`는 머리줄 없음, `nounits`는 `MiB`·`W` 같은 단위 글자를 빼서 숫자만 남긴다. `2>&1`은 오류 메시지도 같은 출력으로 보내 Zabbix에서 보이게 한다 |

**하지 않는 일**
- 값 가공, 단위 변환, 미지원 판정은 하지 않는다. 모두 Zabbix 템플릿 전처리가 맡는다. 서버 쪽 스크립트를 최대한 단순하게 둬야 고객 서버를 다시 손대지 않고 템플릿만 고쳐 대응할 수 있다.
- 인자는 받지 않는다. Zabbix 키에 `[*]`가 없어 외부 입력이 명령줄에 들어올 길이 없다.
- 파일을 쓰지 않는다. 잠금 파일 하나만 만들고 재사용한다(내용은 비어 있음).
- root 권한이 필요 없다. `zabbix` 계정으로 실행되며 `nvidia-smi` 조회는 일반 사용자도 할 수 있다.

**실행 시간 계산**: 잠금 대기 최대 4초 + `nvidia-smi` 최대 10초 = 14초. 템플릿 마스터 아이템의 timeout 15초보다 짧아서, 최악의 경우에도 Zabbix가 먼저 끊지 않고 스크립트가 낸 실패 문구가 남는다.

### 10.2 출력 예시

출력 예시(RTX 5070 1장 기준 형식. memory.total 외의 숫자는 설명용 값):
```
0, GPU-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, NVIDIA GeForce RTX 5070, 0, 615.71.09, P8, 0, 0, 12227, 512, 11414, 38, 9.87, 250.00, 180, 405, [N/A], [N/A], 00000000:01:00.0
```

## 11. 에이전트 설정 원문 — `moveseye-gpu-smi.conf`

```ini
# MovesEye preset gpu-nvidia-smi 1.0 — Zabbix agent UserParameter
#
# 설치:
#   1) moveseye-gpu-smi.sh 를 /usr/local/bin/ 에 두고 실행 권한을 준다(chmod 755).
#   2) 이 파일을 에이전트 include 경로에 둔다.
#        Zabbix agent  : /etc/zabbix/zabbix_agentd.d/moveseye-gpu-smi.conf
#        Zabbix agent 2: /etc/zabbix/zabbix_agent2.d/moveseye-gpu-smi.conf
#   3) 에이전트를 재시작한다.
#   4) 확인: zabbix_agentd -t moveseye.gpu.raw  (agent 2는 zabbix_agent2 -t moveseye.gpu.raw)
#
# Timeout:
#   nvidia-smi는 GPU 수가 많으면 기본 에이전트 타임아웃(3초)을 넘을 수 있다.
#   템플릿 마스터 아이템은 timeout 15s를 지정한다(Zabbix 7.0 서버 + 7.0 에이전트는 아이템 timeout을 따른다).
#   7.0 미만 에이전트는 아이템 timeout을 모르므로 에이전트 설정의 Timeout 을 15 로 올린다:
#     Timeout=15
#
# 인자는 받지 않는다(키에 [*]가 없다).
UserParameter=moveseye.gpu.raw,/usr/local/bin/moveseye-gpu-smi.sh
```

## 12. 프리셋 식별 (MovesEye 관리 표시)

템플릿에는 다음 태그가 붙고, 템플릿 그룹은 `MovesEye presets`이다.

| 태그 | 값 |
|---|---|
| `moveseye_preset` | `gpu-nvidia-smi` / `gpu-nvidia-smi-active` |
| `moveseye_preset_version` | `1.0` |
| `moveseye_preset_min_product` | `1.0` |

MovesEye의 Zabbix 관리 화면은 이 태그로 템플릿·템플릿 그룹·아이템·트리거·LLD에 "MovesEye 관리" 배지를 단다. 버전이 최신이 아니면 "구버전"으로 표시한다. 편집·삭제는 막지 않고 경고만 한다.

## 13. 실측 결과 (2026-10-08, GPU-SERVER 10.220.0.13 · RTX 5070 · Rocky 10.2)

| 항목 | 결과 |
|---|---|
| 액티브 프리셋 on Zabbix 7.0.6 (호스트 `GPU-SERVER-SMI`) | 수신 성공, 아이템 20개, GPU 1장 발견 |
| VRAM total | 12,820,938,752 B. NVML total과 정확히 일치 |
| GeForce ECC·시리얼 | `[N/A]`·`0` → `MOVESEYE_GPU_UNSUPPORTED`로 정상 분류 |
| 패시브 on 7.0.6 | 공인망(dev Zabbix)→사설망(GPU 서버) 접속 불가 → 액티브 변형을 만든 계기 |
| 7.0 형식 템플릿 → 7.4.15 가져오기 | 성공(상향 호환) |

## 14. 버전 관리 규칙

- 스크립트 `QUERY` 열, 템플릿 전처리, 템플릿 태그 `moveseye_preset_version`은 **함께** 바뀐다.
- 고객 서버의 스크립트가 템플릿보다 낡으면 열 수가 맞지 않는다. 이 경우 `GPU: Parsed data`가 "columns (expected 19)" 오류로 실패하므로 바로 드러난다.
- 정본 위치: BE `src/main/resources/zabbix-presets/gpu-nvidia-smi/`(sh·conf·7.0/template.yaml), `gpu-nvidia-smi-active/7.0/template.yaml`. 목록은 `ZabbixPresetCatalog`가 관리한다.
