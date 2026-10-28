# GPU 프리셋 템플릿 2종 + 프리셋 카탈로그 (ZM-78, P1)

작성 2026-10-07 · 워크트리 `C:\worktrees\zm-78-be`(브랜치 `ZM-78`) · **미커밋** · 실제 Zabbix 가져오기 **안 함**

설계 정본: [devdesign_gpu-collection-paths.md](devdesign_gpu-collection-paths.md) §3·§6.2·§6.3·§6.5·§13.7·§15
실장비 원문: [gpu-p1-source-profile.md](gpu-p1-source-profile.md)(nvidia-smi), [gpu-dcgm-metrics-rtx5070-20261007.txt](../../../_archive/features/premium/gpu-monitoring/gpu-dcgm-metrics-rtx5070-20261007.txt)(DCGM `/metrics`)

---

## 1. 파일

| 경로(워크트리 기준) | 내용 |
|---|---|
| `src/main/resources/zabbix-presets/gpu-dcgm-http/7.0/template.yaml` | `MovesEye GPU by DCGM (HTTP)` — Zabbix 7.0 export |
| `src/main/resources/zabbix-presets/gpu-dcgm-http/dcgm-counters-moveseye.csv` | dcgm-exporter 지표 목록(기본 목록 + `FB_TOTAL`·`POWER_MGMT_LIMIT`·`ECC_SBE/DBE_VOL_TOTAL`) |
| `src/main/resources/zabbix-presets/gpu-nvidia-smi/7.0/template.yaml` | `MovesEye GPU by nvidia-smi (Zabbix agent)` — Zabbix 7.0 export |
| `src/main/resources/zabbix-presets/gpu-nvidia-smi-active/7.0/template.yaml` | `MovesEye GPU by nvidia-smi (Zabbix agent active)` — **액티브 변형**(10-08 추가). 패시브와 마스터 `moveseye.gpu.raw`의 type(`ZABBIX_ACTIVE`)만 다르다. **스크립트·conf는 `gpu-nvidia-smi/` 폴더의 것을 공유**(카탈로그 `supportDir`) |
| `src/main/resources/zabbix-presets/gpu-nvidia-smi/moveseye-gpu-smi.sh` | 수집 스크립트(bash, 인자 없음, `flock -w 4` + `timeout 10`, 출력 무가공, **19열**). LF 줄끝 |
| `src/main/resources/zabbix-presets/gpu-nvidia-smi/moveseye-gpu-smi.conf` | `UserParameter=moveseye.gpu.raw,/usr/local/bin/moveseye-gpu-smi.sh` + 설치·Timeout 안내 |
| `src/main/java/com/dmove/moveseye/common/zabbixpreset/ZabbixPresetCatalog.java` | 단일 정본: 태그 이름 3종, 템플릿 그룹, 오류 문구 2종(`PRESET_ERRORS`), `Preset` enum 3종(id·version·minProduct·기술명·표시명·마스터 키·Zabbix 메이저·보조 파일 폴더·보조 파일), `findById`, 경로 함수 |
| `src/test/java/com/dmove/moveseye/common/zabbixpreset/ZabbixPresetCatalogTest.java` | YAML ↔ 카탈로그 정합 테스트 39건 |

YAML은 손으로 쓰지 않고 생성기로 만들었다(uuid 결정적 생성·두 템플릿 키 통일을 한 곳에서 보장). 생성기는 scratchpad에만 있다 — **YAML을 고칠 때는 YAML을 직접 고치고 테스트로 확인**하면 된다(생성기는 정본 아님). uuid = `md5("moveseye-preset:{preset}:{seed}")`에 v4 비트(13번째 `4`, 17번째 `8~b`)를 박은 값.

## 2. 구조

```
마스터(history 0)                  중간(history 0)                   dependent(저장)
DCGM : HTTP agent ─ moveseye.gpu.dcgm.raw ─▶ moveseye.gpu.dcgm.parsed ─▶ moveseye.gpu.* (공통 키)
smi  : agent(패시브/액티브) ─ moveseye.gpu.raw ─▶ moveseye.gpu.smi.parsed ─▶ moveseye.gpu.* (공통 키)
                                                                    └▶ moveseye.gpu.discovery (LLD)
```

- **중간 아이템이 원문을 한 번만 파싱**해 UUID별 구조로 접는다. 모든 dependent는 그 JSON에서 JSONPath로 꺼낸다.
  - DCGM parsed: `{"gpus":{"<UUID>":{"index","model","pci","m":{"DCGM_FI_…":"값",…,"MOVESEYE_VRAM_TOTAL":"…"}}},"count":N,"mig":bool,"driver":"…"}`
  - smi parsed: `{"gpus":{"<UUID>":["열0",…,"열18"]},"count":N,"driver":"…"}` — **열 순서(index)로 접근**, 헤더 미사용
- 공통 키(두 템플릿 동일, value_type·units까지 테스트로 강제):
  `discovery`, `driver.version`, `device.count`, `utilization`, `memory.activity`, `vram.used/total/free`, `temperature`, `power.draw/limit`, `clock.sm/memory`, `performance.state`, `ecc.corrected/uncorrected`, `model`, `pci.bus` + DCGM만 `pcie.rx/tx`, `xid.last`, `nvlink.bandwidth` / smi만 `serial`.
  smi에는 `pcie.rx/tx`가, DCGM에는 `serial`이 **아이템 자체가 없다**(원천에 없음 → 어댑터가 "아이템 없음"으로 판정).
  **통일 규칙(10-08 개정)**: "smi ⊆ DCGM"이 아니라 **"공통 키는 value_type·units까지 동일, 템플릿 전용 키는 명시 목록뿐"**(DCGM: `xid.last`·`nvlink.bandwidth`·`pcie.rx/tx` / smi: `serial`). 테스트가 명시 목록 밖의 전용 키를 막는다.
- 태그: `moveseye_preset`=`gpu-dcgm-http`|`gpu-nvidia-smi`|`gpu-nvidia-smi-active`, `moveseye_preset_version`=`1.0`, `moveseye_preset_min_product`=`1.0`. 그룹 `MovesEye presets`.
- 매크로: `{$MOVESEYE.GPU.INTERVAL}`=1m, `.NODATA`=30m, `.TEMP.WARN`=85, `.TEMP.CRIT`=95, `.TEMP.DURATION`=5m, `.UTIL.HIGH`=90, `.UTIL.DURATION`=15m, `.UUID.MATCHES`=`.*`, `.UUID.NOT_MATCHES`=`CHANGE_IF_NEEDED`, DCGM만 `.DCGM.SCHEME`=`http`, `.DCGM.PORT`=`9400` — URL 필드 = `{$MOVESEYE.GPU.DCGM.SCHEME}://{HOST.CONN}:{$MOVESEYE.GPU.DCGM.PORT}/metrics`.
- 🔴 **DCGM 호스트는 인터페이스 필수**: 에이전트 없는 호스트라도 exporter 주소로 인터페이스(종류 무관, 예: Agent 타입)를 하나 만들어야 `{HOST.CONN}`이 풀린다(A5 실측, §5).
- **액티브 변형**: 에이전트 설정 `ServerActive`에 Zabbix 서버(또는 프록시), `Hostname`에 이 호스트의 Zabbix 기술명(여러 개는 콤마 구분). 패시브와 한 호스트에 같이 연결하지 않는다(키 동일 → Zabbix 거부).

## 3. 전처리 체인

### 3.1 공통 꼴 (GPU별 dependent 전부)

| 단계 | 타입 | 실패 시 |
|---|---|---|
| 1 | `JSONPATH` — GPU·지표 찾기 | `CUSTOM_ERROR` → **`MOVESEYE_GPU_METRIC_ABSENT`** (UUID 없음·지표 줄 없음·열 없음) |
| 2 | `NOT_MATCHES_REGEX` `^(N/A\|\[N/A\]\|Not Supported\|\[Not Supported\]\|)$` (serial은 앞에 `0\|` 추가) — 값이 미지원 표기·빈 값이면 실패 | `CUSTOM_ERROR` → **`MOVESEYE_GPU_UNSUPPORTED`** |
| 3 | (VRAM만) `MULTIPLIER 1048576` / (NVLink만) `CHANGE_PER_SECOND` | 기본 오류 → 어댑터 `ERROR` |
| 저장 | value_type 변환 | 숫자 아님(예: `[Unknown Error]`, `MOVESEYE_GPU_AMBIGUOUS`) → 기본 오류 → `ERROR` |

> 🔴 **10-08 변경**: 2단계는 원래 JS `throw` + CUSTOM_ERROR였는데, dev 7.0.6 실측에서 아이템 error가 `Preprocessing failed for: {…} 1. Result: [N/A] 2. Failed: unsupported`로 **감싸져 남았다**(문구 고정 실패). 정규식 단계 + CUSTOM_ERROR로 바꿨다 — JSONPath + CUSTOM_ERROR(ABSENT)는 실측에서 정확히 `MOVESEYE_GPU_METRIC_ABSENT`만 남았다. 세 템플릿 모두 같은 패턴이며, 테스트가 "JS 단계에 CUSTOM_ERROR·오류 문구 없음"을 강제한다. 숫자가 아닌 기타 값(`[Unknown Error]` 등)은 정규식을 통과해 값 형식 변환에서 기본 오류(→ ERROR)가 된다(§6.3 유지).

### 3.2 아이템별

| 키 | DCGM 원천 | smi 원천(열) | 변환 | 단위 | 비고 |
|---|---|---|---|---|---|
| `utilization[{#UUID}]` | `DCGM_FI_DEV_GPU_UTIL` | 6 `utilization.gpu` | — | % | trigger 기본 **DISABLED** |
| `memory.activity[…]` | `DCGM_FI_DEV_MEM_COPY_UTIL` | 7 `utilization.memory` | — | % | VRAM 점유율 아님 |
| `vram.used[…]` | `DCGM_FI_DEV_FB_USED` | 9 `memory.used` | ×1048576 | B | |
| `vram.total[…]` | `FB_TOTAL` 있으면 그것, 없으면 `FB_USED+FB_FREE+FB_RESERVED`(셋 다 숫자일 때만, **근사**) | 8 `memory.total` | ×1048576 | B | 셋 중 하나라도 없으면 ABSENT |
| `vram.free[…]` | `DCGM_FI_DEV_FB_FREE` | 10 `memory.free` | ×1048576 | B | used+free=total 가정 안 함 |
| `temperature[…]` | `DCGM_FI_DEV_GPU_TEMP` | 11 `temperature.gpu` | — | C | 경고/심각 trigger |
| `power.draw[…]` | `DCGM_FI_DEV_POWER_USAGE` | 12 `power.draw` | — | W | |
| `power.limit[…]` | `DCGM_FI_DEV_POWER_MGMT_LIMIT`(기본 비활성) | 13 `power.limit` | — | W | DCGM 기본 목록이면 ABSENT |
| `clock.sm[…]` | `DCGM_FI_DEV_SM_CLOCK` | 14 | — | MHz | |
| `clock.memory[…]` | `DCGM_FI_DEV_MEM_CLOCK` | 15 | — | MHz | |
| `performance.state[…]` | `DCGM_FI_DEV_PSTATE`(**필드명 미확인**, 대개 ABSENT) | 5 `pstate` | — | 텍스트(CHAR) | |
| `pcie.rx[…]` / `pcie.tx[…]` | `DCGM_FI_PROF_PCIE_RX/TX_BYTES` | **아이템 없음** | — | B/s | |
| `ecc.corrected[…]` | `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`(기본 비활성) | 16 | — | 개수 | GeForce smi=`[N/A]`→UNSUPPORTED |
| `ecc.uncorrected[…]` | `DCGM_FI_DEV_ECC_DBE_VOL_TOTAL`(기본 비활성) | 17 | — | 개수 | trigger `change()>0` |
| `model[…]` | 라벨 `modelName` | 2 `name` | → `DISCARD_UNCHANGED_HEARTBEAT 1d` | TEXT, history 7d | 빈 값 → UNSUPPORTED |
| `serial[…]` (smi만) | **아이템 없음**(라벨 없음) | 3 `serial` | 전용 정규식(`0`·빈 값·N/A류 → UNSUPPORTED) → `DISCARD_UNCHANGED_HEARTBEAT 1d` | TEXT, history 7d | GeForce는 `0` |
| `pci.bus[…]` | 라벨 `pci_bus_id` | 18 `pci.bus_id`(**10-08 추가 열**) | → `DISCARD_UNCHANGED_HEARTBEAT 1d` | TEXT, history 7d | 예: `00000000:01:00.0` |
| `xid.last[…]` (DCGM만) | `DCGM_FI_DEV_XID_ERRORS` | — | — | 코드(UNSIGNED) | GeForce는 줄 없음 → ABSENT |
| `nvlink.bandwidth[…]` (DCGM만) | `DCGM_FI_DEV_NVLINK_BANDWIDTH_TOTAL`(counter) | — | 초당 변화 | **비움**(원천 단위 미확인) | NVLink 없으면 ABSENT |
| `driver.version` | 라벨 `DCGM_FI_DRIVER_VERSION`(없으면 `DRIVER_VERSION`) | 4(첫 GPU) | `$.driver` → 미지원 체크 → `DISCARD_UNCHANGED_HEARTBEAT 1d` | CHAR | |
| `device.count` | parsed `$.count`(MIG 줄 제외 물리 GPU 수) | `$.count` | — | UNSIGNED | nodata·수 변경 trigger의 기준 |
| `discovery`(LLD) | parsed → JS `[{uuid,name,serial,index}]` (serial은 `''`) | parsed → JS (serial=열3) | 매크로 `{#UUID}` `{#MODEL}` `{#SERIAL}` `{#GPUINDEX}` | — | 필터 MATCHES/NOT_MATCHES |

### 3.3 중간 아이템

| 키 | 단계 | 실패 시 |
|---|---|---|
| `moveseye.gpu.dcgm.parsed` | `PROMETHEUS_TO_JSON {__name__=~"^DCGM_FI_"}` → `JAVASCRIPT`(MIG 줄 제외, 같은 UUID·같은 지표 중복은 값을 `MOVESEYE_GPU_AMBIGUOUS`로, VRAM total 계산) | 기본 오류(원문 형식이 바뀐 것) |
| `moveseye.gpu.smi.parsed` | `JAVASCRIPT`(줄 단위, `,` 분할 + trim, **열 수 ≠ 19이면 throw** — 스크립트/템플릿 버전 불일치·`NVIDIA-SMI has failed…` 같은 오류 출력이 여기서 원문과 함께 드러남) | 기본 오류 |

JS는 node로 실장비 원문에 스모크 검증했다(DCGM: count 1·driver `615.71.09`·total 12225·xid 없음·PCIe rx 262300·MIG 줄 제외·중복 줄 AMBIGUOUS / smi: 19열 파싱(열 18 = `00000000:01:00.0`), serial `0`→throw, `[N/A]`→throw, 오류 출력→열 수 불일치 throw, 빈 출력→count 0). Duktape와 같은 ES5 문법만 사용.

### 3.4 트리거

| 트리거 | 식 | 등급 | 기본 | 비고 |
|---|---|---|---|---|
| 온도 심각 | `min(temperature,{$…TEMP.DURATION})>{$…TEMP.CRIT}` | HIGH | 켬 | |
| 온도 높음 | `min(…)>{$…TEMP.WARN}` | WARNING | 켬 | 심각에 의존(dependencies) |
| ECC 정정 불가 증가 | `change(ecc.uncorrected)>0` | HIGH | 켬 | MULTIPLE · 자동 해소 없음 · 수동 닫기 |
| Xid 발생 (DCGM만) | `last(xid)<>0 and change(xid)<>0` | AVERAGE | 켬 | MULTIPLE · 자동 해소 없음 · 수동 닫기 |
| 활동률 높음 | `min(utilization,{$…UTIL.DURATION})>{$…UTIL.HIGH}` | INFO | **DISABLED** | §6.5 |
| 수집 중단 | `nodata(device.count,{$…NODATA})=1` | WARNING | 켬 | 마스터가 아니라 device.count에 건다(§4-6) |
| GPU 수 변경 | `change(device.count)<>0` | INFO | 켬 | 수동 닫기 허용 |

ECC·Xid 지표가 없는 장비(GeForce)에서는 아이템이 미지원 상태라 트리거가 **unknown**이 될 뿐 울리지 않는다.

## 4. 설계와 다르게 한 결정

| # | 설계/지시 | 실제 | 이유 |
|---|---|---|---|
| 1 | 템플릿 이름 `MovesEye GPU by DCGM (HTTP)` | **표시명(`name`)**은 그대로, **기술명(`template`)**은 `MovesEye GPU by DCGM HTTP` / `MovesEye GPU by nvidia-smi Zabbix agent` | Zabbix 호스트/템플릿 기술명은 영숫자·공백·`.`·`-`·`_`만 허용(괄호 불가). 트리거 식은 기술명을 참조한다. 카탈로그에 둘 다 둠 |
| 2 | dependent마다 `PROMETHEUS_PATTERN 'DCGM_FI_…{UUID="{#UUID}"}'` | 중간 아이템 `moveseye.gpu.dcgm.parsed`가 한 번 파싱 → dependent는 `JSONPATH` | 한 단계의 `CUSTOM_ERROR`로는 "줄 없음(ABSENT)"과 "여러 줄(귀속 불가=기본 오류)"을 구분할 수 없다. MIG 줄 제외도 JS에서 결정적으로 처리. 원문 파싱이 아이템 수만큼 반복되지 않는다 |
| 3 | LLD: `PROMETHEUS_TO_JSON 'DCGM_FI_DEV_GPU_TEMP'` + JS | parsed에서 JS로 생성 | 같은 필터 규칙(MIG 제외)을 한 곳에서 적용. 온도 지표가 없는 장비에서도 다른 지표로 GPU를 발견한다 |
| 4 | smi: `CSV_TO_JSON` → JSONPath | `JAVASCRIPT` 파싱 → JSONPath(열 index) | nvidia-smi CSV는 구분자가 `", "`라 CSV_TO_JSON 결과 값에 앞 공백이 남아 UUID 매칭이 깨진다. 헤더 없을 때의 열 이름 규칙도 문서로 확정하지 못함. 열 수 검증으로 스크립트·템플릿 짝 불일치를 원문과 함께 드러냄 |
| 5 | "전처리 **마지막** 단계의 custom on fail" | 미지원 판정은 **2단계**(JSONPath 다음), 그 뒤 MULTIPLIER | 배수 단계는 숫자가 아니면 실패해야 `ERROR`가 된다. 오류 문구 고정 효과는 같다 |
| 6 | nodata는 마스터에 30m | `device.count`에 `{$MOVESEYE.GPU.NODATA}`(30m) | **history 0 아이템은 트리거 함수가 평가되지 않는다**(Zabbix 문서: history 0이면 dependent·인벤토리만 갱신). 마스터가 실패하면 device.count도 값이 끊기므로 의미는 같다 |
| 7 | 다중 매칭은 기본 오류 | parsed에서 값을 `MOVESEYE_GPU_AMBIGUOUS`로 바꿔 숫자 변환 오류를 유도 | 2번과 같은 이유. 오류 문자열에 마커가 들어가 진단에 쓸 수 있다(allowlist 밖이라 `ERROR`) |
| 8 | 에너지 J 저장 | 아이템 없음 | 공통 키 목록에 없고, DCGM에만 넣으면 "DCGM 전용은 xid·nvlink" 규칙과 어긋난다. 필요하면 다음 버전에서 공통 키로 추가 |
| 9 | — | 메모리 온도 아이템 없음 | 실장비: GeForce가 `DCGM_FI_DEV_MEMORY_TEMP=0`(미지원을 0으로 보냄). description에 기록 |
| 10 | — | DCGM에도 미지원 체크 단계를 둠 | 체인을 두 템플릿에서 동일하게 유지(어댑터·테스트 단순화). DCGM은 대개 해당 없음 |
| 11 | — | `Hostname` 라벨 미사용 | 실장비에서 컨테이너 ID(`12aa3247e24e`)였다. 호스트 정본은 Zabbix 호스트 |
| 13 | 통일 규칙 "nvidia-smi ⊆ DCGM" | smi 전용 키 `serial` 허용, 규칙을 "공통 키 동일 + 전용 키 명시 목록"으로 개정 | 발견 규칙(LLD)은 값을 이력으로 남기지 않아 어댑터가 모델명·시리얼을 읽을 수 없었다(목록에 UUID만 뜸) → GPU별 TEXT 아이템 `model`·`serial`·`pci.bus` 추가(10-08 요청). DCGM exporter 실측 라벨 집합에 시리얼이 없어 DCGM 템플릿에는 serial을 만들지 않는다 — 항상 ABSENT인 아이템을 두는 것보다 "아이템 없음"이 판정이 명확하다 |
| 14 | — | smi 열 `pci.bus_id`를 **맨 끝(18)**에 추가 | 기존 열 index를 바꾸지 않기 위해. 스크립트·파서 `COLS`(19)는 테스트가 짝을 강제 |
| 12 | — | LLD 결과에 `index` 추가 | `{#GPUINDEX}` 매크로용. DCGM은 시리얼 라벨이 없어 `serial=''` |

참고: 코디네이터 전달문은 "GeForce에서 `PROF_*`가 없다"였지만 **원문 파일에는 `PROF_GR_ENGINE_ACTIVE`·`PROF_PIPE_TENSOR_ACTIVE`·`PROF_DRAM_ACTIVE`·`PROF_PCIE_TX/RX_BYTES`가 있다**(총 20개 지표). 실제로 빠진 것은 `XID_ERRORS`·`NVLINK_BANDWIDTH_TOTAL`·remapped rows·`ROW_REMAP_FAILURE`다. 따라서 이 장비에서 `pcie.rx/tx`는 값이 나온다.

## 5. dev Zabbix 7.0.6에 가져오기 전 확인할 것

추측으로 메운 곳은 없지만 **Zabbix가 실제로 받아들이는지 문서로 확정하지 못한 것**들이다. 가져오기 시험에서 하나씩 지운다.

| # | 확인할 것 | 실패하면 |
|---|---|---|
| ~~A5~~ | **해소(거짓, 10-08 dev 7.0.6 실측)**: 사용자 매크로 **값** 안의 `{HOST.CONN}`은 전개되지 않는다 — `Could not resolve host: {HOST.CONN}`. URL **필드**에서 사용자 매크로와 `{HOST.CONN}`을 나란히 쓰는 것은 된다 | **반영 완료**: URL 필드 = `{$MOVESEYE.GPU.DCGM.SCHEME}://{HOST.CONN}:{$MOVESEYE.GPU.DCGM.PORT}/metrics`, `{$…DCGM.URL}` 제거, "호스트 인터페이스 필수" 안내(description·§2). 테스트가 URL·매크로 값을 강제 |
| 가져오기 | **10-08 dev 7.0.6 가져오기 성공**(템플릿 ID 10761/10762) — 7.0 형식·전처리 문법·태그 수용. 아래 V1·V2·V6~V8의 "가져오기 거부" 위험은 해소. 런타임 동작(V3·V4·V5)은 수집 성공 후 확인 | — |
| A6 | 이 파일은 **7.0 형식만**이다. 6.0은 `template_groups`(6.2+)·에이전트 아이템 `timeout`(7.0+)이 없어 **별도 6.0 파일이 필요**하다(하위 형식 호환은 반대 방향 문제) | `6.0/` 폴더 추가 + 카탈로그 `zabbixMajors`에 추가(테스트가 폴더·카탈로그 짝을 강제) |
| A12 | 템플릿 태그가 연결 호스트에 상속되고 `host.get`(`selectInheritedTags`)으로 읽히는가 | 프로필 판정을 아이템 키 접두사로(보조 수단) |
| A9 | 이번 템플릿은 아이템 태그에 호스트 매크로를 쓰지 않는다(`gpu_uuid={#UUID}`는 LLD 매크로) — 클러스터 템플릿 때 확인 | — |
| V1 | uuid가 UUIDv4 검증을 통과하는가(결정적 생성 + v4 비트) | 생성 규칙 수정 |
| V2 | `PROMETHEUS_TO_JSON` 패턴 `{__name__=~"^DCGM_FI_"}` 허용 | 패턴을 비우거나 지표명 나열 |
| V3 | JSONPath `$.gpus['GPU-…'].m.DCGM_FI_…`(대괄호 키에 `-`) 동작 | parsed를 배열로 바꾸고 `$.gpus[?(@.uuid=='{#UUID}')]…first()` |
| V4 | **`CUSTOM_ERROR` 후 아이템 `error` 필드가 문구 그대로인가**(접두어 없이 `MOVESEYE_GPU_UNSUPPORTED`) — 어댑터 allowlist의 전제 | 어댑터를 "포함" 비교로 |
| ~~V5~~ | **해소(거짓, 10-08 실측)**: JS `throw` 단계의 CUSTOM_ERROR로는 문구가 고정되지 않았다 | **반영 완료**: `NOT_MATCHES_REGEX` + CUSTOM_ERROR로 교체. 교체 후 아이템 error가 정확히 `MOVESEYE_GPU_UNSUPPORTED`인지 재가져오기 후 재확인 필요 |
| V4 | (부분 해소) JSONPath + CUSTOM_ERROR는 error가 정확히 `MOVESEYE_GPU_METRIC_ABSENT`(DCGM, 7.4 실측) | — |
| V6 | 트리거 프로토타입 `dependencies`(온도 경고→심각), `recovery_mode: NONE`+`manual_close` 조합 | 의존 제거 |
| V7 | Zabbix agent 아이템 `timeout: 15s`가 7.0.6에서 받아들여지는가 | 에이전트 `Timeout=15` 안내만 |
| V8 | `CHANGE_PER_SECOND` 파라미터 `''` 형식 | 파라미터 제거 |
| H1 | 시험 서버는 **SELinux Enforcing**이다 — `zabbix_agent_t`가 `nvidia-smi`(→ `/dev/nvidia*`)를 실행할 수 있는가, `/tmp` 잠금 파일 생성 가능한가 | SELinux 정책 모듈 또는 `zabbix_run_sudo` boolean 안내 |
| H2 | nvidia-smi 실행 시간(가정 A8). GPU 1장이라 다중 GPU 지연은 미확인 | — |
| H3 | `DCGM_FI_DEV_PSTATE`가 실재·내보내지는 필드인가 | performance.state는 DCGM에서 항상 ABSENT(현행 그대로) |
| H4 | `XID_ERRORS`가 "마지막 코드를 계속 유지"하는지 "0으로 돌아가는지" | Xid 트리거 식 조정 |
| H5 | NVLink counter 원천 단위 | units 지정 |
| H6 | `dcgm-counters-moveseye.csv`의 추가 4필드를 dcgm-exporter 4.x가 받아들이는가(모르는 필드면 기동 실패 가능) | 문제 필드 제거 |

## 5.1 검증 — dev 실측 수치 (2026-10-08)

| 항목 | 결과 |
|---|---|
| smi 액티브 변형(GPU-SERVER-SMI, dev 7.0.6) | **값 수신 성공** — model·pci.bus·P8·W·MHz·B·%·LLD 전부 정상 |
| VRAM total (smi) | **12,820,938,752 B** = NVML total과 정확히 일치 (12,227 MiB × 1,048,576) |
| VRAM total (DCGM 합산) | **12,819,890,176 B** — smi보다 **1 MiB** 작음(합산 근사, 10-07 원문에서는 2 MiB 차였다. 순간값 차이) |
| `pcie.rx/tx` (DCGM) | B/s 값 수신 — GeForce에도 `PROF_PCIE_*_BYTES`가 있다 |
| ABSENT 실제 발생 키 (DCGM, GeForce, 기본 지표 목록) | `xid.last`·`nvlink.bandwidth`·`power.limit`·`ecc.corrected`·`ecc.uncorrected`·`performance.state` — **DCGM 기본 목록에 PSTATE 없음 확정**(H3 해소: DCGM 경로 performance.state는 항상 ABSENT) |
| 미지원 문구(smi `[N/A]`·serial `0`) | JS throw 방식에서 감싼 오류로 남음 → 정규식 + CUSTOM_ERROR로 수정(§3.1). **재가져오기 후 재확인 대기** |
| 가져오기 | 7.0.6 성공(템플릿 ID 10761/10762) |

## 6. 가져오기 절차(수동)

1. **DCGM 호스트**: dcgm-exporter 실행(`:9400`, 선택: `-f dcgm-counters-moveseye.csv`), Zabbix 서버/프록시 → 9400 방화벽 개방.
   **smi 호스트**: `moveseye-gpu-smi.sh` → `/usr/local/bin/`(755, **LF 줄끝 유지**), `moveseye-gpu-smi.conf` → 에이전트 include 경로, 에이전트 재시작, `zabbix_agent2 -t moveseye.gpu.raw`로 19열 CSV 확인.
2. Zabbix UI → 데이터 수집 → 템플릿 → 가져오기 → `template.yaml` 선택. 규칙: 템플릿 그룹·템플릿·아이템·LLD·트리거 "새로 만들기" 체크(첫 설치), 갱신 시 "기존 갱신"도 체크. **삭제 체크는 하지 않는다**(고객 수정분 보호).
3. 대상 호스트에 템플릿 연결. **두 프리셋을 한 호스트에 같이 붙이지 않는다** — 키가 같아 Zabbix가 거부한다(§6.4, 의도된 동작).
4. DCGM 호스트는 exporter 주소로 **인터페이스를 하나 만든다**(종류 무관). 포트·스킴이 다르면 호스트 매크로 `{$MOVESEYE.GPU.DCGM.PORT}`·`{$MOVESEYE.GPU.DCGM.SCHEME}`를 덮어쓴다.
   서버→에이전트 10050이 막힌 smi 호스트는 **액티브 변형**을 연결하고 에이전트 `ServerActive`·`Hostname`을 맞춘다.
5. 확인: 최신 데이터에서 `GPU: Device count`=GPU 수, GPU별 아이템 생성, GeForce면 ECC가 `MOVESEYE_GPU_UNSUPPORTED`(smi) / `MOVESEYE_GPU_METRIC_ABSENT`(DCGM), Xid가 ABSENT.

## 7. 테스트

`.\gradlew.bat :test --tests "*ZabbixPreset*" --no-daemon` → **39 passed / 0 failed**(10-08 model·serial·pci.bus 추가, A5 URL 수정, smi 액티브 변형 추가 후 재실행).

| 검사 | 내용 |
|---|---|
| (a) 태그·버전 | 프리셋 태그 3종 = 카탈로그, `zabbix_export.version` = 폴더 메이저, 기술명·표시명·그룹, description에 `{id} {version}` |
| §15.4 | 리소스 폴더 ↔ 카탈로그 짝(고아 프리셋·메이저·보조 파일 금지). **태그를 `1.1`로 바꾸는 뮤테이션으로 실패 확인함** |
| (b) 키 통일 | DCGM = 공통 + {xid, nvlink}, smi = 공통 − {pcie.rx, pcie.tx} + {serial}, smi 전용 키 = 명시 목록 `{serial}`, 공통 키는 value_type·units·type 동일 |
| 액티브 변형 | 패시브와 비교해 uuid·템플릿 이름·`moveseye_preset` 값·마스터 type을 뺀 나머지(아이템·LLD·트리거(기술명 자리표시 후)·매크로·그룹·나머지 태그)가 완전히 같다. 액티브 마스터 type = `ZABBIX_ACTIVE`, description에 `ServerActive`·`Hostname` |
| A5 | DCGM URL = `{$…SCHEME}://{HOST.CONN}:{$…PORT}/metrics`, `.URL` 매크로 없음, 매크로 값에 `{HOST.` 금지, description에 "호스트 인터페이스 필수" |
| 식별 텍스트 | model·serial·pci.bus는 TEXT·history 7d·마지막 단계 `DISCARD_UNCHANGED_HEARTBEAT 1d`, smi serial 체크는 `'0'`을 미지원으로 |
| (c) history | 다른 아이템이 의존하는 모든 마스터(원문·중간)가 history 0, 원문 마스터 주기 = `{$MOVESEYE.GPU.INTERVAL}`(1m) |
| (d) 단위 | %/B/C/W/MHz/B/s, VRAM 3종에 `MULTIPLIER 1048576` |
| (e) 알람 | 활동률만 DISABLED, 온도·ECC·nodata(+DCGM Xid)는 켬, smi에 Xid 트리거 없음, nodata는 device.count 기준 |
| (f) 오류 문구 | `CUSTOM_ERROR` 문구 집합 = `{UNSUPPORTED, METRIC_ABSENT}`(두 템플릿 모두), GPU별 아이템은 1단계 ABSENT → 2단계 UNSUPPORTED |
| 기타 | 트리거 식이 템플릿 기술명·실재 키만 참조, uuid v4·중복 없음, LLD 필터 매크로, 스크립트 열 수 = 템플릿 `COLS`, 스크립트 인자 미사용, conf의 UserParameter 키 = 마스터 키 |

## 8. 다음 증분 메모(어댑터 담당)

- 모델명·시리얼·PCI는 이제 GPU별 아이템 `moveseye.gpu.model/serial/pci.bus[{UUID}]`의 최신값으로 읽는다(변경 시에만 저장 + 1일 heartbeat라 history 7d 안에 항상 최소 1건). DCGM 호스트는 serial 아이템이 없다 → "시리얼 없음"으로 표시.

### 참고: 경로별 원시값 단위 비교(공식 플러그인 A1 실측 2026-10-08 추가)

| 지표 | A1 공식 플러그인 원시값(에이전트 키) | A2 nvidia-smi(`nounits`) | B1 DCGM | 프리셋 저장(canonical) |
|---|---|---|---|---|
| 전력 사용 | `nvml.device.power.usage` = **mW**(실측 8022) | W | W | W |
| PCIe 처리량 | `nvml.device.pci.utilization` = JSON `{tx_rate_kb_s, rx_rate_kb_s}` **KB/s** | 없음 | B/s(`PROF_PCIE_*_BYTES`) | B/s |
| VRAM | `nvml.device.memory.fb.get` = **bytes** JSON | MiB | MiB | B |
| P-state | `nvml.device.performance.state` = 숫자 `8` | 텍스트 `P8` | (필드 미확인) | 텍스트(`P8`) |
| 미지원 오류 | `NVML error: The requested operation is not available on target device.` | `[N/A]` | 지표 줄 없음 또는 0 | `MOVESEYE_GPU_UNSUPPORTED` / `_METRIC_ABSENT` |

- `nvml.device.utilization.gpu`는 에이전트 키가 아니다(실측 `Unknown metric`) — 공식 **템플릿의 dependent 키**일 가능성. 공식 템플릿 원문(7.4 서버에서 받기)으로 확인 전까지 A1 어댑터 키 목록에 넣지 말 것.
- P-state는 A1이 숫자, 프리셋은 `P8` 텍스트다 → 어댑터가 A1 값을 `P{n}`으로 맞추거나 canonical을 숫자로 정해야 한다(미결).
- 전력은 A1만 mW → 어댑터 변환 지점이 Hz→MHz 외에 **mW→W, KB/s→B/s, P-state** 로 늘었다(설계 §3 "변환 코드는 A1 한 군데" 원칙은 유지).

- **VRAM total 근사**: RTX 5070 실측 DCGM 합산 `8690+3171+364 = 12225 MiB` vs nvidia-smi `memory.total 12227 MiB`(2 MiB 차). DCGM 경로에서 usedPct는 **같은 템플릿의 total(합산값)**으로 계산해야 used ≤ total이 깨지지 않는다. 두 경로 값을 섞지 말 것.
- 오류 판정: `item.error`가 `ZabbixPresetCatalog.PRESET_ERRORS`와 **정확히 일치**할 때만 UNSUPPORTED/ABSENT(V4 확인 전제). `MOVESEYE_GPU_AMBIGUOUS`를 포함한 기타 오류는 ERROR.
- 프로필 판정: 호스트 상속 태그 `moveseye_preset`(A12) → `findById`. 모르는 값이면 프리셋 아님.
- MIG: parsed JSON에 `mig:true`가 있지만 **저장되는 아이템이 없다**(history 0). `MIG_DETECTED_UNSUPPORTED` 진단이 필요하면 다음 버전에서 호스트 아이템 `moveseye.gpu.mig.detected`(DCGM 전용)를 추가해야 한다 — 그때 테스트의 `DCGM_ONLY`도 갱신.
- exporter 자체 수집 주기(`--collect-interval` 기본 30s) 때문에 DCGM 값은 최대 30초 늦다(템플릿 description에 기록).
- `.sh`가 Windows 체크아웃에서 CRLF로 바뀌면 bash가 깨진다. 레포 `.gitattributes`에 `*.sh text eol=lf`를 두는 것을 권장(이번 작업 경로 밖이라 손대지 않음).
