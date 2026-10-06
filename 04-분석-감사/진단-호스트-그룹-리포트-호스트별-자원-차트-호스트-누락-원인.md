# 진단: 호스트 그룹 리포트 — 호스트별 자원 차트 호스트 누락 원인

- 일자: 2026-06-22
- 대상: BE Nest(:3000) → 실 Zabbix(`https://dmove.co.kr/zabbix`) 직접 `item.get`/`trend.get`/`history.get`
- 표본 그룹: group 2(Linux servers, 40 호스트), group 5(Discovered, 34 호스트)
- 의심 코드:
  - `moveseye-be/src/host/report/report.service.ts:104-112` (`summarizeMetric`)
  - `moveseye-be/src/host/host.service.ts:2496-2503` (그룹 리소스 추이, 동일 로직)
- 프로브: `diag_report-resource-keys.cjs`, `diag_report-keys-detail.cjs`, `diag_report-resource-keys-final.cjs`(결정판), 결과 JSON 동명 `.result.json`

---

## 1. 결론 (요약)

가설("exact match가 파라미터 붙은 키를 탈락 → 대부분 누락")은 **CPU/MEMORY/DISK에서는 틀렸고, TRAFFIC에서만 맞다.**

| metric | 차트 그려지는 호스트(현재) | 고치면 그려질 호스트 | 판정 |
|---|---|---|---|
| CPU | 6 | 6 | **데이터 문제** (exact match 무관) |
| MEMORY | 6 | 6 | **데이터 문제** |
| DISK | 4 | 4 | **데이터 문제** (+루트 한정은 잠재 이슈) |
| TRAFFIC | **0** | **6** | **버그** (`bytes` 필터가 키 형태와 불일치) |

"CPU가 6개만 나온다"의 진짜 원인:
**40개 호스트 중 지금 실제로 데이터를 수집 중인(살아있는) 호스트가 6개뿐**이다.
나머지 호스트는 `system.cpu.util` item이 존재(enabled)하지만 수집이 멈춰 trend/history가 없다.
exact match는 이 6개에 영향을 주지 않는다(prefix로 바꿔도 그대로 6개).

---

## 2. metric별 분포 (group 2 / 40 hosts, 결정판 프로브)

item 매칭 호스트 수와, 차트 표출의 실제 게이트인 **trend(최근 30일) 보유 호스트 수**를 함께 측정.

| metric | item-exact(현재) | item-prefix(고치면) | trend-exact(현재 차트) | trend-prefix(고치면 차트) | gain |
|---|---|---|---|---|---|
| CPU | 37 | 37 | **6** | 6 | +0 |
| MEMORY | 37 | 37 | **6** | 6 | +0 |
| DISK | 28 | 28 | **4** | 4 | +0 |
| TRAFFIC | **0** | 35 | **0** | **6** | **+6** |

group 5 (34 hosts)도 동일 패턴: CPU/MEM trend=6, DISK trend=4, TRAFFIC 현재 0 → 고치면 6.

### 핵심 교차검증 (group 2 CPU `system.cpu.util`, exact item 37개)
- item status: **37개 전부 enabled(status=0)**, trends 보존 설정 365d.
- `lastclock>0`(과거에라도 값 있었음): **6개**
- `lastclock` 최근 1시간 이내(현재 살아서 수집 중): **6개**
- all-time trend 보유: 15 호스트 / 최근 7일 history(float) 보유: **6 호스트**
- **enabled & 현재 수집 중(lastclock<1h)인데 trend 없는 호스트: 0개** → 살아있는 호스트는 전부 trend 있음.

즉 31개 호스트는 템플릿이 링크돼 item만 존재할 뿐 **실제 수집이 멈춘 죽은 호스트**다. 코드를 어떻게 고쳐도 trend가 없어 차트에 못 나온다. 6은 데이터의 사실.

---

## 3. metric별 실제 key_ 분포 (group 2)

### CPU — exact match 무관 (가설 반증)
```
37x system.cpu.util          ← 베이스와 정확히 일치 (현재 코드가 그대로 잡음)
37x system.cpu.util[,idle]
37x system.cpu.util[,iowait]
 7x system.cpu.util[,user] 등 파라미터 변형
```
파라미터 없는 베이스 `system.cpu.util`를 37개 호스트가 전부 보유 → exact match로 다 잡힘.
**exact match로 누락되는 호스트 0개** (paramOnly=0).

### MEMORY — 동일. exact로 37개(group5는 33, prefix 34로 +1 미미).

### DISK — 루트(`/`) 한정은 잠재 이슈지만 group2에선 누락 0
```
28x vfs.fs.size[/,pused]      ← 루트. 현재 코드가 잡는 것
27x vfs.fs.size[/boot,pused]
 7x vfs.fs.size[/home,pused]
 2x vfs.fs.size[/SSD,pused]
 1x vfs.fs.size[/engines,pused]
 1x vfs.fs.size[/data,pused]
```
"루트 없이 다른 마운트만 가진 호스트": **0개** (anyPused 28 = rootPused 28).
→ group2/5에선 루트 한정이 실제 누락을 만들지 않음. 다만 `/data`만 있는 호스트가 생기면 누락될 **잠재 버그**는 존재.

### TRAFFIC — 명백한 버그
```
net.if.in["ens18"]            ← iface별 총 in (suffix 없음)
net.if.out["ens18"]
net.if.in["ens18",dropped] / [,errors]   ← 부가 지표
...
bytesItems = 0   ← 'bytes' 들어간 키가 단 하나도 없음
```
현재 코드 `rawItems.filter(item => item.key_.includes('bytes'))` → **0개 매칭 → 트래픽 차트 전혀 안 나옴.**
이 Zabbix 템플릿의 트래픽 키는 `net.if.in["iface"]`/`net.if.out["iface"]` 형태(값 자체가 bytes/s)이고 `bytes` 토큰이 키에 없다.
prefix/형태 매칭으로 고치면 item 35 / **trend 보유 6** 호스트가 차트에 나온다(gain +6).

---

## 4. 판정

- **CPU / MEMORY**: exact match는 무해. 6개만 나오는 건 **살아있는 호스트가 6개**라는 데이터 사실. (버그 아님)
- **DISK**: 현재 4개는 데이터(살아있는 호스트) 한계. 단 `vfs.fs.size[/,pused]` 루트 한정은 `/data` 등만 모니터링하는 호스트가 생기면 누락시키는 **잠재 버그**.
- **TRAFFIC**: `includes('bytes')` 필터가 이 환경의 키 형태(`net.if.in["iface"]`)와 맞지 않아 **항상 0개 → 트래픽 차트 완전 누락(확정 버그)**.

---

## 5. 권장 수정 (코드 변경은 본 진단 범위 밖 — 제안만)

대상: `report.service.ts:109-111` 및 `host.service.ts:2501-2503` (동일 로직 둘 다).

1. **TRAFFIC (우선순위 1, 확정 버그)**
   - `includes('bytes')` 제거. iface별 총량 키만 선별: 정규식 `^net\.if\.(in|out)\["[^"]+"\]$` (suffix `,dropped`/`,errors`/`,packets` 제외).
   - 또는 `bytes` 변형도 환경에 따라 있을 수 있으므로 "in/out 베이스이면서 dropped/errors/packets/pps 가 아닌 키"로 일반화.

2. **DISK (우선순위 2, 잠재 버그)**
   - `vfs.fs.size[/,pused]` 정확일치 → `^vfs\.fs\.size\[[^\]]*,pused\]$`(모든 마운트의 pused) 매칭으로 일반화.
   - 호스트 내 다중 마운트는 이미 코드가 "그 외=item 평균"으로 합치므로 마운트 평균이 됨(설계 의도 확인 필요).

3. **CPU/MEMORY (변경 불필요)**
   - exact가 prefix와 동수 → 굳이 prefix로 바꿀 이득 없음. 다만 일관성/방어를 위해 base prefix 매칭(`startsWith(base + '[')`)으로 통일해도 무방.

4. **"6개" 자체는 코드로 못 늘림** — Zabbix에서 31개 호스트가 수집 중단 상태. 데이터/모니터링 운영 이슈로 별도 처리.

> 주의: prefix 매칭으로 넓히면 CPU에서 `system.cpu.util[,idle]`, `[,iowait]` 등 **부가 변형까지 함께 잡혀** 호스트 평균이 오염될 수 있다. 코드의 "그 외=item 평균" 로직 때문에 베이스 util + idle + iowait 평균이 섞이면 값이 왜곡된다. 따라서 CPU/MEM은 **prefix로 넓히지 말고 exact 유지**가 오히려 안전. TRAFFIC/DISK만 정밀 정규식으로 고칠 것.
