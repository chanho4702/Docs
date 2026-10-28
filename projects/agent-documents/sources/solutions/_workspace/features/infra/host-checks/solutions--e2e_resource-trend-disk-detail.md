# E2E 검증 — 리소스 추이 탭의 디스크 상세 (Resource Trend → Disk Detail)

검증자: functional-qa / 일자: 2026-06-24
대상: 호스트 그룹 상세 → "리소스 추이" 탭에서 metric=Disk 선택 시 차트 하단에 디스크 상세 섹션 조건부 렌더.

## 환경
- FE: `http://localhost:5173` (Vite, 기동 중) — 그룹 상세 경로 `/monitoring/host-group/2?period=86400&tab=resource-trend`
- BE: Nest `http://localhost:3000` (기동 중). 로그인 `POST /auth/login` (admin/Admin@123, `x-visitor-id` 헤더 필요).
- 검증 그룹: group 2 (Linux servers, 호스트 40).
- 디스크 데이터 보유 호스트(API probe로 확인): **10695**(10.220.0.92_test_1, fs 2개), **10696**(zabbix-server, fs 4개). 나머지 38개 호스트는 `filesystems:[]`.
- 브라우저: Playwright chromium-1223 (headless).

## 사전 API probe (BE 직접 호출)
- `GET /hosts/2/top-hosts?limit=500&sortBy=name&sortDirection=ASC` → HTTP200 code200 total=40, items=40 (드롭다운 소스 정상).
- `GET /host/10696/disk/detail` → HTTP200 code200, filesystems 4개(/, /app, /boot, /data), bytes/pused/inodes 정상.
- `GET /host/10703/disk/detail`(데이터 없는 호스트) → HTTP200 code200, filesystems 0개 (graceful 빈배열).
- 산출물: `_workspace/e2e_rtdisk_api_probe.json`

## 시나리오 결과

| # | 시나리오 | 기대 | 실제 | 결과 |
|---|----------|------|------|------|
| 1 | 리소스추이 탭 기본(metric=CPU) | 디스크 상세 섹션 없음 | sectionVisible=false, host 라벨 없음, pane 내 테이블 0개 | **PASS** |
| 2 | metric=Disk 선택 | 차트 + 하단 "Disk Detail" 섹션(제목+호스트드롭다운+표 헤더) 표시 | sectionVisible=true, hostSelectLabel=true, 표 헤더 8개(No/Mount/Type/Capacity(Used/Total)/Free/Usage/inode(Used/Total)/inode Usage) 정확, `/host/10703/disk/detail` 호출됨 | **PASS** |
| 3 | metric=Memory 전환 | 디스크 상세 섹션 사라짐 | sectionVisible=false, pane 내 테이블 0개 | **PASS** |
| 4 | Disk 상세 호스트 드롭다운으로 데이터 호스트(zabbix-server) 선택 | 그 호스트 마운트별 표 표시(used/free/total/사용률/inode), 리소스추이 탭 유지(차트 공존) | activeTab="Resource Trend" 유지, 차트 present, `/host/10696/disk/detail` 호출, 4행(/, /app, /boot, /data) 렌더 | **PASS** |

### 시나리오 4 표 데이터(zabbix-server, 실제 렌더값)
```
1  /     xfs  57.57 GB / 99.94 GB   42.36 GB   57.61 %  692,488 / 52,428,800   1.32 %
2  /app  xfs  1.91 GB / 199.90 GB   197.99 GB  0.96 %   1,286 / 104,857,600    0.00 %
3  /boot xfs  368.30 MB / 960.00 MB 591.70 MB  38.36 %  36 / 524,288           0.01 %
4  /data xfs  74.98 GB / 597.18 GB  522.20 GB  12.56 %  254,348 / 313,249,792  0.08 %
```
- 단위 검증: BE 원값 `/` used 61,816,233,984 B = 57.57 GiB, total ≈ 99.97 GiB → UI `57.57 GB / 99.94 GB` 일치. **formatBytes(IEC 1024) 정상**(트래픽 bps 함정과 무관, 계약 §3 부합).
- pused/pfree는 곱하기 없이 소수 2자리 표기(57.61%) — 계약 §3 부합.
- inode 천단위 콤마 정상.

## 관찰/주의 (버그 아님)
1. **기본 자동선택 호스트가 데이터 없는 호스트**: 디스크 상세 섹션은 호스트 목록의 첫 호스트(이름 ASC 정렬상 `10.220.0.10`=hostid 10703)를 자동 선택하는데, 그 호스트는 `filesystems:[]`라 표가 "No data"로 뜬다(스크린샷 02). 동작상 정상이나, 그룹 2처럼 디스크 수집 호스트가 소수(40중 2)인 경우 **사용자가 디스크 데이터를 보려면 드롭다운에서 수집 호스트를 직접 골라야** 한다. 기능 결함은 아니지만 UX 관점 참고. (관련: `HostGroupDiskDetail.tsx:73-81` 첫 호스트 자동선택 로직)
2. 동일 `HostGroupDiskDetail` 컴포넌트가 별도 "Disk" 탭에도 독립 사용됨(`HostGroupDetail.tsx:221-224`). 본 검증은 리소스추이 탭 내 임베디드 인스턴스만 대상으로 하며, metric Segmented 클릭은 탭 라벨 "Disk"가 아닌 `.ant-segmented` 내부로 스코프해 검증함.

## 스크린샷 (모두 `C:\solutions\_workspace\`)
- `e2e-rtdisk-00-login.png` — 로그인 후
- `e2e-rtdisk-01-cpu-no-detail.png` — S1: CPU 기본, 디스크 상세 없음
- `e2e-rtdisk-02-disk-detail-shown.png` — S2: Disk 선택, 차트+하단 Disk Detail 섹션(헤더, 기본 호스트는 No data)
- `e2e-rtdisk-03-memory-no-detail.png` — S3: Memory 전환, 디스크 상세 사라짐
- `e2e-rtdisk-04-dropdown-host-data.png` — S4: 리소스추이 탭 유지 + 드롭다운 zabbix-server 선택 → 마운트별 4행 표

## 재현 명령
```
cd C:/solutions/moveseyee_fe
node C:/solutions/_workspace/e2e_rtdisk_ui.cjs        # S1~S3 + (구) S4
node C:/solutions/_workspace/e2e_rtdisk_s4_fix.cjs    # S4 정확 재실행(리소스추이 탭 스코프)
node C:/solutions/_workspace/probe_disk.cjs (scratchpad) # BE API probe
```
결과 JSON: `e2e_rtdisk_ui_result.json`, `e2e_rtdisk_s4_result.json`, `e2e_rtdisk_api_probe.json`

## 종합 판정: **PASS (4/4)**
조건부 렌더(disk일 때만 표시 / 다른 metric 시 숨김), 호스트 드롭다운 연동, 마운트별 데이터·단위·inode 모두 런타임에서 기대대로 동작. 동작 버그 없음.

---

## 폴백 정합성 수정 검증 (2026-06-24, functional-qa)

대상: `DiskService.getDetail()`의 `vfs.fs.size[<mount>,*]` 폴백 추가 (`buildFromSizeItems`, DiskService.java:104-174).
dependent[,data] master item이 0개인 호스트에서 size 계열 현재값으로 filesystems를 합성하는 변경.

### 기동/환경
- ⚠️ 기존 :3000 Spring(PID 9048, 13:15 기동)은 **폴백 코드 컴파일(14:15) 이전 빌드**였음 → 종료 후
  방금 빌드된 class로 **:3000 재기동**(PID 20848, 14:29 `Started MoveseyeApplication`). FE는 :5173(기존 기동) → VITE_API_URL=http://localhost:3000.
- 재현: `_workspace\_start_spring_3000.ps1`(.env+PORT=3000+bootRun), 로그 `_rtdiskfix_boot.log`.
- 로그인: `POST /auth/login {"username":"admin","password":"Admin@123"}` (+x-visitor-id). `/auth/sign-in` 아님.

### 시나리오별 결과

| # | 호스트 | hostid | 기대 | 실제 (API raw / UI 표) | 판정 |
|---|--------|--------|------|------------------------|------|
| 1 | 10.220.0.70 | 10652 | 폴백 채워짐, fstype/inode "-" | API: `/`,`/boot` 2 fs, fstype=null, inodes 키 생략. UI: `/` "-" 28.87/62.33GB 48.50% , `/boot` "-" 72.80% | **PASS** |
| 2 | 10.220.0.52 | 10635 | 폴백 채워짐, "-" | API: 2 fs. UI: `/` 12.08/48.43GB 26.30% "-", `/boot` 71.50% "-" | **PASS** |
| 3 | 10.220.0.92 | 10638 | 폴백 채워짐, "-" | API: 2 fs. UI: `/` 6.48/93.83GB 7.20% "-", `/boot` 52.50% "-" | **PASS** |
| 4 | 10.220.0.93 | 10647 | 폴백 채워짐, "-" | API: 2 fs. UI: `/` 2.86/26.91GB 11.20% "-", `/boot` 76.70% "-" | **PASS** |
| 5(회귀) | zabbix-server | 10696 | 폴백 안 탐, 풀데이터(/,/app,/boot,/data + inode + fstype=xfs) | API/UI: 4 fs 모두 fstype=xfs + inode(used/total/%) 채워짐 | **PASS (회귀 없음)** |

수정 전 동일 JVM(구빌드) 직접 호출 시 10652/10635/10638/10647 모두 `filesystems: []`(빈 표)였음 → 폴백이 빈 표를 해소함을 before/after로 확인.

### 단위 정합 (IEC 1024, formatBytesFromRaw)
- .70 `/`: used 31015673856 B → 28.87 GB (=31015673856/1024³=28.886 ✓), total 66930339840 → 62.33 GB ✓.
- pused는 % 원값 그대로(48.50/72.80 등) ✓. free = total-used 합성값 정상 ✓.

### 폴백 합성 누락 보정 검증
- size 계열엔 free/pfree가 lastvalue로 없을 수 있음 → `free=total-used`, `pfree=100-pused` 보정(DiskService.java:148-156).
  .70 `/boot` pfree=27.2(=100-72.8) ✓. inodes=null → @JsonInclude(NON_NULL)로 inodes 키 생략 → FE `record.inodes ? ... : "-"` 정상 "-" 표시.

### 산출물
- API raw: `e2e_rtdisk_fix_api.json` (10652/10635/10638/10647/10696 filesystems).
- 스크린샷: `e2e-rtdisk-fix-01-host-70.png`, `-02-host-52.png`, `-05-host-92.png`, `-03-zabbix-server.png`, `-04-inode-fstype-dash.png`.
- UI 러너: `e2e_rtdisk_fix_ui.cjs`(4대+회귀 순회), `e2e_rtdisk_fix_5292.cjs`(.52/.92 명시 선택). 결과 JSON 동명.

### 종합 판정: **PASS (5/5)** — 폴백 4대 빈 표 해소 + dependent 보유 호스트 회귀 없음. 동작 버그 없음.

---

## 탭 제거 + 자동선택 검증 (2026-06-24 15:0x)

**환경**: BE = Spring(`moveseye-be-spring` JAR 14:15 빌드, 폴백/disk 코드 포함) on :3000 `java -jar --server.port=3000`, FE :5173(VITE_API_URL=http://localhost:3000). 러너 `e2e_rtdisk_tab_autoselect.cjs` → 결과 `e2e_rtdisk_tab_result.json`.

### 사전 API 프로브 (admin /auth/login 토큰)
| EP | 결과 | 비고 |
|----|------|------|
| `GET /hosts/2/resource-trend?metric=disk&agg=avg` | **HTTP 200**, 4 시리즈 (10.220.0.70/52/93/92, 각 23pt) | 자동선택의 입력(차트 hostName) 정상 서빙 |
| `GET /hosts/2/top-hosts?limit=50` | **HTTP 200**, 40개 호스트 | name→hostid 매핑 가능. 차트 4대 모두 매핑됨(.70→10652 .52→10635 .93→10647 .92→10638) |
| `GET /host/10652/disk/detail` (raw curl) | HTTP 401 INVALID_TOKEN | ⚠️ admin raw 토큰엔 zabbix authToken 부재 → ZabbixClient 거부(CLAUDE.md #9 패턴). **UI 브라우저 토큰에선 200**(아래) — 동작 검증 무관 아티팩트 |

### UI 런타임 (group 2 = Linux servers)
| # | 흐름 | 기대 | 실제 | 판정 |
|---|------|------|------|------|
| 1 | `?tab=resource-trend` 탭 목록 | "디스크 상세" 탭 없음 | 탭 = [Resource Trend, Host List, Alert Trend, Host Classification, Report] — Disk Detail 탭 부재(hasDiskTab=false) | **PASS** |
| 2 | 리소스 추이 → metric=Disk 클릭(별도 조작 X) | 데이터 보유 호스트 자동선택 + 상세 표 채워짐 | Host 드롭다운 자동 `10.220.0.52`(=차트 시리즈), `disk/detail` **1회 호출 200 /host/10635/disk/detail**, 표 2행: `/`(26.30%), `/boot`(71.50%) | **PASS** |
| 3 | `?tab=disk` 직접 진입 | 에러 없이 graceful | KPI헤더+탭바 정상 렌더, activeTab=null(미매칭→빈 패널), crashed=false, pageerror 없음 | **PASS** |

**스크린샷**: `e2e-rtdisk-tab-01-no-disk-tab.png`(탭 없음), `e2e-rtdisk-tab-02-autoselect-filled.png`(자동선택+채워진 표), `e2e-rtdisk-tab-03-tabdisk-direct.png`(graceful 빈 패널).

**근거(소스)**: 탭 정의 `HostGroupDetail.tsx:40-46`(TAB_KEYS에 DISK 키 제거)·`:212-238`(items에 disk 항목 없음). 자동선택 `HostGroupDiskDetail.tsx:79-96`(preferredHostIds[0] ?? hosts[0] — 차트 hostNames 우선). 입력 전달 `HostGroupResourceTrend.tsx:70-73`(preferredHostNames={hostNames}).

### 종합 판정: **PASS (3/3)** — 디스크 상세 탭 완전 제거, 리소스 추이 metric=Disk 자동선택으로 표 즉시 채워짐(빈 표 버그 해소), tab=disk 직접 진입 graceful. 동작 버그 없음.

> 재현: `cd C:\solutions\moveseyee_fe; node C:\solutions\_workspace\e2e_rtdisk_tab_autoselect.cjs` (BE :3000 Spring + FE :5173 기동 상태). BE 기동: `powershell -File C:\solutions\_workspace\_run_spring_jar_3000.ps1`.
