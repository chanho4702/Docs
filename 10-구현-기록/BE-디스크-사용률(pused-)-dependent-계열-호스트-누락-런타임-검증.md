# BE 디스크 사용률(pused %) — dependent 계열 호스트 누락 런타임 검증

- 대상: `moveseye-be-spring` (Spring BE, :3000 기동 중)
- 그룹: group 2 (40 hosts)
- 검증일: 2026-06-25
- 방법: 라이브 Zabbix(`dmove.co.kr`, Admin) 대상으로 **각 엔드포인트의 서버측 `item.get search`+필터 로직을 1:1 재현**. 진단 스크립트 `_workspace/diag_be-disk-dep_keysets.cjs` → 결과 `..._keysets.result.json`.
- 실 BE API 호출도 시도(`_workspace/diag_be-disk-dep_apicall.cjs`)했으나, **admin 계정은 zabbix 미연동(authToken 없음)이라 zabbix 의존 EP가 전부 HTTP 401**(CLAUDE.md §3.2-3·§3.8). zabbix 연동 계정은 dev DB password가 NULL이라 비침습 호출 불가 → key-set 재현이 정본 근거.

---

## 핵심 사실 (런타임 실증)

`vfs.fs.dependent.size[<mount>,pused]` (float %, 30d trend 보유) 계열이 **실재**한다. zabbix-server(10696) 실측값:

| key | type | lastvalue | trend30d |
|---|---|---|---|
| `vfs.fs.dependent.size[/,pused]`    | float | **58.954422** | ✅ |
| `vfs.fs.dependent.size[/app,pused]` | float | 0.958268 | ✅ |
| `vfs.fs.dependent.size[/boot,pused]`| float | 38.364665 | ✅ |
| `vfs.fs.dependent.size[/data,pused]`| float | 12.979438 | ✅ |

group 2 내 pused 계열 분포(실측):
- `vfs.fs.size[*,pused]` 보유: **28 호스트** (그 중 trend 30d: 4)
- `vfs.fs.dependent.size[*,pused]` 보유: **7 호스트** (그 중 trend 30d: 2 → 10695, 10696)
- 두 계열은 **상호 배타적** (size 계열에 없고 dependent.size만 가진 호스트 = 7개 전부)

**dependent-only(=`dependent.size[,pused]`만 있고 `size[,pused]` 없음) 호스트 7개:**
`10639(10.220.0.210)`, `10676(gab-ubu-ans_2)`, `10695(10.220.0.92_test_1, trend✅)`, `10696(zabbix-server, trend✅)`, `10703(10.220.0.10)`, `10714(MIKE)`, `10737(10.220.0.61)`

> 결정적 사실: Zabbix `search.key_='vfs.fs.size'`(substring)는 `vfs.fs.dependent.size[...]`를 **매칭하지 않는다**(`vfs.fs.dependent.size`에 `vfs.fs.size` 부분문자열 없음). 실측: substring 검색 후보 198건 중 dependent.size 키 **0건 포함**. 정규식 `^vfs\.fs\.size\[...,pused\]$`도 dependent.size를 거름 → **이중 누락**.

---

## 지점별 판정

### A. 그룹 리소스 추이 (`GET /hosts/{groupid}/resource-trend?metric=disk`) — **FAIL (누락)**
- 코드: `HostService.getGroupResourceTrend` → `resourceMetricItemKeys(disk)=List.of(VFS_FS_SIZE="vfs.fs.size")` (HostService.java:1043-1054) → `getByListKey`로 `search:{key_:"vfs.fs.size"}` → `MetricUtils.isDiskPusedKey`(정규식 `^vfs\.fs\.size\[[^\]]*,pused\]$`) 필터.
- 실측 재현: 결과 호스트 28개. **10696 미포함, 10695 미포함**, 대조 10652 **포함**.
- dropped dependent-only 호스트: 7개 전부(단, A는 trend 기반이라 실제 시리즈에 영향받는 건 trend 보유 **10695·10696 2개**, 나머지 5개는 trend 없어 어차피 부재).
- 판정: **FAIL** — zabbix-server 등 dependent-only 호스트가 디스크 추이 차트에서 누락.

### B. 리포트 (`ReportService.summarizeMetric`, metric=disk) — **FAIL (누락)**
- 코드: ReportService.java:73-115, A와 **동일 패턴**(`VFS_FS_SIZE` search + `isDiskPusedKey` 필터).
- A와 동일한 key-set을 산출 → 동일 누락. trend 기반이므로 10695·10696이 리포트 디스크 집계에서 빠짐.
- 판정: **FAIL** — dependent-only 호스트 디스크 사용률 리포트 누락/0.

### C. 그룹 상세 HostUsage 표 (`GET /hosts/{groupid}` 내부) — **FAIL (0.0 오표시)**
- 코드: `HostService.getHostItems` (HostService.java:2024-2055). searchKeys에 `VFS_FS_SIZE_FS_PUSED="vfs.fs.size[/,pused]"` 정확키, `diskUsage = m.getOrDefault("vfs.fs.size[/,pused]", 0.0)`.
- 실측: 10696 `diskUsage = 0.0` (실제 `vfs.fs.dependent.size[/,pused]=58.95%` 무시). 10695도 0.0. 대조 10652 = **48.6** (정상).
- C는 lastvalue 기반(trend 무관) → dependent-only **7개 호스트 전부 0.0%로 오표시**.
- 판정: **FAIL** — dependent-only 호스트 디스크 사용률이 0.0%로 잘못 표시(실제 미수집 호스트와 구분 불가).

### D. 대조군 — 디스크 상세/현황 (`DiskService.getDetail` / `getGroupCurrent`) — **PASS (정상)**
- 코드: 1순위 `vfs.fs.dependent[<mount>,data]`(text 마스터) + 폴백 `vfs.fs.size[`.
- 실측: 10696은 `vfs.fs.dependent[/,data]` 등 4개 data 마스터 보유, `vfs.fs.size[` 폴백 0건 → **dependent 경유로 정상 표출**. 대조 10652는 반대로 `vfs.fs.size[` 6키 보유, dependent data 0건 → size 폴백으로 정상.
- 판정: **PASS** — 폴백 비대칭 확인. D만 dependent를 1순위로 처리해 정상.

---

## 종합

- **dependent-only 호스트가 실제로 누락되는가: 예.**
  - A/B(추이·리포트, trend 기반): 영향 **2개**(10695, 10696). (dependent-only 7개 중 trend 보유분)
  - C(HostUsage 표, lastvalue 기반): 영향 **7개 전부** 0.0% 오표시.
- D(상세/현황)만 정상 — pused(%) 경로 3곳(A·B·C)이 `vfs.fs.size` 계열에만 묶여 비대칭.

## 수정 난이도 메모 (코드 미수정)

| 지점 | 수정 포인트 | 난이도 | 메모 |
|---|---|---|---|
| A·B | `resourceMetricItemKeys(disk)` search에 `"vfs.fs.dependent.size"` OR 추가 + `MetricUtils.isDiskPusedKey` 정규식을 `^vfs\.fs\.(dependent\.)?size\[[^\]]*,pused\]$`로 확장 | **하** | 공용 유틸 1곳 + 키목록 1곳. A·B 동시 해소. 호스트당 두 계열 중복 가능성은 상호배타라 사실상 없음(겹치면 itemid 단위 합산이라 무해, 단 확인 권장) |
| C | `getHostItems` searchKeys에 `vfs.fs.dependent.size[/,pused]` 추가 + diskUsage 산출을 `getOrDefault("vfs.fs.size[/,pused]")` → `vfs.fs.size[/,pused]` 우선·없으면 `vfs.fs.dependent.size[/,pused]` 폴백 | **중** | 키 보강 + 2-키 폴백 로직. 루트(/) 한정이라 마운트 일반화는 별개 이슈 |
| D | — | — | 수정 불요(이미 정상) |

> 참고: A·B·C 모두 "`vfs.fs.size`만 본다"는 동일 뿌리. isDiskPusedKey 정규식을 `dependent.size` 포함으로 한 번 넓히고, 각 search 프리픽스에 `vfs.fs.dependent.size`를 더하면 일관 해소된다. 단 **계약/원본(NestJS) 보존 원칙**상, 두 계열을 합칠 때 중복·우선순위 정책(예: size 우선)을 명시해야 함.

---

## 수정 후 재검증 (2026-06-25)

사용자 승인 하에 A·B·C 3개 갭을 모두 수정. 응답 DTO/필드/상태코드 변경 없이 내부 키 매칭/소스만 보강. `DiskService`(대조군 D)는 미수정.

### 변경 파일 / 신설 상수
- `common/constants/ZabbixItemKey.java` — 신설 상수 2개:
  - `VFS_FS_DEPENDENT_SIZE = "vfs.fs.dependent.size"` (A·B search 프리픽스)
  - `VFS_FS_DEPENDENT_SIZE_FS_PUSED = "vfs.fs.dependent.size[/,pused]"` (C 루트 폴백 키)
- `common/util/MetricUtils.java` — `DISK_PUSED_KEY` 정규식 `^vfs\.fs\.(dependent\.)?size\[[^\]]*,pused\]$`로 확장 (A·B 정밀 필터). 주석 갱신.
- `host/HostService.java` — (A) `resourceMetricItemKeys(disk)` search 키목록에 `VFS_FS_DEPENDENT_SIZE` 추가. (C) `getHostItems` searchKeys에 `VFS_FS_DEPENDENT_SIZE_FS_PUSED` 추가 + diskUsage를 `vfs.fs.size[/,pused]` 우선·없으면 `vfs.fs.dependent.size[/,pused]` 폴백으로 산출.
- `host/report/ReportService.java` — (B) `resourceMetricItemKeys(disk)` search 키목록에 `VFS_FS_DEPENDENT_SIZE` 추가.
- `test/.../MetricUtilsTest.java` — `isDiskPusedKey` dependent.size 매칭 단위테스트 1개 추가(size 계열 OR / pused 외·data·readonly 제외 검증).

### 빌드/테스트
- `gradlew build` → **BUILD SUCCESSFUL** (전체 테스트 그린).
- `MetricUtilsTest` → 8 tests, 0 failures (size + dependent isDiskPusedKey 모두 PASS).

### 런타임 재검증 (group 2, 라이브 Zabbix, `diag_be-disk-dep_postfix.cjs`)
수정된 search 키목록 + 정규식 + diskUsage 폴백 로직을 1:1 재현.

| 항목 | 수정 전 | 수정 후 | 무회귀 대조 |
|---|---|---|---|
| **A·B** trend 호스트 수 | 4 | 6 | — |
| **A·B** 10696 포함 | ✗ | **✓** | — |
| **A·B** 10695 포함 | ✗ | **✓** | — |
| **A·B** 10652(size) 포함 | ✓ | ✓ | 유지 |
| **A·B** fix로 잃은 호스트 | — | **0개** (`lostHosts_byFix: []`) | 무회귀 |
| **C** 10696 diskUsage | 0.0 | **58.96%** (dependent 폴백) | — |
| **C** 10695 diskUsage | 0.0 | 7.22% | — |
| **C** 10652 diskUsage | 48.6 | **48.6** (size 우선) | 무회귀 |

- A·B: fix로 추가된 trend 호스트는 정확히 10695·10696 두 개(`gainedHosts_byFix`), 잃은 호스트 0개. size 계열 호스트 무회귀.
- C: dependent-only 호스트가 실값 표출(10696=58.96%), size 호스트는 size 우선이라 값 불변(10652=48.6). `h10696_usesDepFallback=true`, `h10652_usesSizePrimary=true`로 우선순위 로직 확인.

### 잔여 이슈
- C(HostUsage)의 폴백은 **루트(/) 마운트 한정**(원본 HostUsage가 루트 단일 % 필드라 계약 보존). 마운트 일반화는 본 작업 범위 밖이자 계약 변경이라 미적용.
- A·B에서 dependent-only 7호스트 중 trend 미보유 5호스트(10639/10676/10703/10714/10737)는 여전히 추이 시리즈에 부재 — 누락이 아니라 **trend 데이터 자체가 없는 정상 거동**(size 계열도 동일 정책).
- 한 호스트가 size·dependent.size를 동시 보유하는 경우는 dev 환경에서 미관측(상호배타). A·B는 itemid 단위 집계라 중복돼도 무해, C는 size 우선이라 회귀 없음.
- ⚠️ 실 BE API(:3000) 직접 호출은 admin 계정 zabbix 미연동(authToken 없음)으로 401이라 불가 → key-set 재현이 검증 정본(수정 전 진단과 동일 방식).
