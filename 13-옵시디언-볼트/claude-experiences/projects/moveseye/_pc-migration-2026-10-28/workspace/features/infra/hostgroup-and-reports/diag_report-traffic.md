# 진단: 호스트 그룹 리포트 "트래픽 값 이상" 검증

- 작성: 2026-06-24 / 진단 전용(코드 수정 없음)
- 프로브: `_workspace/diag_report-traffic.cjs` → 결과 `_workspace/diag_report-traffic.result.json`
- 대상: 실 Zabbix `dmove.co.kr`, BE Spring(:3000), 그룹 2(40 hosts) 표본, 기간 WEEK 2026-06-15~06-21

## 판정 (요약)

**사용자 의심은 사실 — 트래픽 표시가 틀렸다. 원인은 "단위 불일치"(집계/BE 아님, FE 표시 버그).**

- Zabbix `net.if.in/out` item의 실제 단위는 **`bps` (bits per second)**.
- BE는 이 값을 **단위 변환 없이 원값(bps) 그대로** 내려준다(집계는 정확).
- FE `formatBytes`는 입력을 **MB(megabytes)로 가정**하고 1024로 환산해 "MB/GB/TB"를 붙인다.
- 결과: `856,666 bps`(≈ 0.86 Mbps) 트래픽이 화면에 **"836.59 GB"** 로 표시됨 → **약 9.4×10^6 배 부풀려진 완전 오표시**. 단위 라벨(bytes)도 틀림(실제는 bit/s).

---

## 1. 단위(units) 확인 — 핵심 근거

`item.get`(output에 `units`,`value_type` 포함)으로 그룹 2/5의 net.if 트래픽 item 전수 조회.
**예외 없이 전부 `units="bps"`, `value_type=3(unsigned int)`**:

| key_ (대표) | units | value_type | 비고 |
|---|---|---|---|
| `net.if.in["ens18"]` (24개) | **bps** | unsigned | 이 환경 주력 iface |
| `net.if.out["ens18"]` (24개) | **bps** | unsigned | |
| `net.if.in["enp1s0"]`, `["eno1..52"]`, `["wlp0s20f3"]`, `["flannel.1"]`, `["cali*"]`, `["tunl0"]` … | **bps** | unsigned | 전 iface 동일 |

- 그룹 2: 40 hosts / 126 traffic items — **100% bps**.
- 그룹 5: 34 hosts / 112 traffic items — **100% bps**.
- 즉 이 환경의 트래픽 item은 **bytes가 아니라 bits/s**. `formatBytes`(byte 가정)와 단위가 어긋난다.

> 참고: Zabbix 표준 Linux 템플릿의 `net.if.in/out`은 보통 raw octet 카운터(bytes)이지만, **이 환경은 preprocessing "Change per second" + units `bps`로 설정**되어 있어 비트레이트(bits/s)로 저장된다. 추정이 아니라 item.get 실측 결과다.

## 2. 집계 의미 / 값 흐름 — BE는 정상

BE(`ReportService.summarizeMetric`)는 trend(`value_avg/min/max`)를 **변환 없이** 사용:
- 호스트별: in/out item들을 같은 타임버킷에서 **합산**(in+out 합쳐짐) → 기간 avg/max/min.
- 그룹: traffic은 호스트 **합산**(`isTraffic ? sum : mean`), max/min은 버킷 최대/최소.
- `bytesToMB`/`bytesToKB` 등 단위 변환 **호출 없음** → 응답값 = Zabbix 원값(bps) 그대로.

trend.get 원값으로 BE 로직을 독립 재현해 대조(기간 06-15~21, 그룹 2):

| 항목 | BE 응답 | 재계산(trend 직접) | 일치 |
|---|---|---|---|
| group.avg | 856,666.32 | 856,399.91 | ✅ (미세차=window 경계 1초) |
| group.max | 7,408,488 | 7,408,488 | ✅ |
| host 10.220.0.93 avg | 404,741.24 | 404,654.69 | ✅ |
| host zabbix-server avg | 19,676.59 | 19,591.42 | ✅ |

→ **집계는 정확**. in+out 합산, 호스트 합산(그룹), trend avg/max/min 사용 모두 계약대로.

## 3. sanity — 이상 없음

- 모든 호스트/그룹에서 `min ≤ avg ≤ max`, 음수 없음.
- 그룹 = Σ(호스트 avg) 정확히 성립: **group.avg=856,666.32 vs Σ(host.avg)=856,666.33** (합산 정책 확인).
- traffic은 **in+out 합** (한쪽 아님).
- 값 자체는 비현실적이지 않다(bps로 해석하면 0.86 Mbps 그룹 합 — 정상 범위). **수치가 아니라 "해석 단위"가 문제**.

## 4. FE 표시 — 버그 확정

`formatBytes`(`src/utils/index.ts:82`)는 시그니처가 `formatBytes(sizeInMbs)` — **입력을 MB로 가정**.
`UNIT_CONVERSION_FACTOR=1024`로 나눠 `StorageUnit`(MB→GB→TB) 라벨을 붙인다.

```
입력 856,666.32 (실제 단위 bps)
 → MB로 오해 → /1024=836.6 GB → /1024 안 함(<1024? no) ... 결국 "836.59 GB"
```

두 표시 지점 모두 동일 버그:
- `HostGroupReportResource.tsx:39-42` — 자원 요약 표(traffic이면 `formatBytes(value)`).
- `useGroupReportHostCompare.ts:56-59`, `:163` — 호스트 비교 막대 차트 라벨/축(`UnitData.BYTES` + `formatBytes`).

오차 규모: **bps 값을 MB로 읽음 → 실제의 약 9,437,184배(=1024×1024×8 + 1bit/byte 혼동)**. 사용자가 "트래픽이 GB 단위로 말도 안 되게 크다"고 느낄 수밖에 없다.

---

## 원인 규명 (3택 중)

| 후보 | 판정 |
|---|---|
| 단위 불일치 | **★ 이것이 원인.** item=bps인데 FE=formatBytes(MB/byte 가정) |
| 집계 오류 | 아님 (trend 재현과 일치, 그룹=Σ호스트) |
| BE 표시/변환 오류 | 아님 (BE는 원값 그대로 전달이 계약. 변환 책임은 표시계층) |

---

## 수정 권고 (구체)

**핵심: traffic을 "bits/s"로 인식하고 bit 단위로 포맷하라. `formatBytes`(MB·byte 가정)를 traffic에 쓰면 안 된다.**

### 권장안 A — traffic 전용 bps 포맷터 도입 (정석)
- 새 유틸 `formatBitrate(bps)` 추가: bps → Kbps/Mbps/Gbps. 네트워크 비트레이트는 관례상 **1000 진법**(SI)을 쓴다.
  ```ts
  // src/utils/index.ts
  export const formatBitrate = (bps = 0): string => {
    const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
    let v = bps, i = 0;
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    return `${v.toFixed(2)} ${units[i]}`;
  };
  ```
- 적용 위치(2곳):
  - `src/pages/monitoring/host-group/HostGroupReportResource.tsx` `formatValue`의 `metric==="traffic"` 분기 → `formatBitrate(value)`.
  - `src/hooks/chart/useGroupReportHostCompare.ts` `formatValue`(L56) 및 yAxis formatter(L163), `getUnit`(L52)의 `UnitData.BYTES` 의존 → bitrate로 교체.
- `UnitData`에 `BPS`(예: `"bps"`) 추가 검토(현재 `BYTES="Bytes"` 부정확).

### 권장안 B — BE에서 단위 변환(비권장)
- BE가 bps→다른 단위로 바꾸면 계약(원값 노출)·자원 추이 등 타 소비자와 어긋날 수 있어 비권장. 표시계층에서 고치는 게 안전.

### 부수 점검
- **1000 vs 1024**: 비트레이트(bps)는 SI(1000)가 표준. 현재 `formatBytes`는 1024(이진)라 traffic에 그대로 두면 단위 의미도 어긋남 → bitrate 포맷터는 1000 사용 권장.
- **자원 추이(시계열) 화면도 동일 item을 쓰면 같은 버그 가능성** — `net.if.in/out`을 byte 포맷으로 표시하는 다른 화면(예: InterfaceGraphModal `UnitData.BYTES`)도 동일 점검 권장(이번 진단 범위 밖).

## 5. UX 코멘트 (참고)

- 그룹=합산 / 호스트=단독 정책은 그대로 두되, **단위 수정 후**에도 그룹값(합)이 개별 호스트보다 크게 보이는 건 "합산"이라 정상이다. 다만 표/차트 제목·툴팁에 "그룹 합계"임을 명시하면 "왜 그룹이 이렇게 크지?" 혼란을 줄일 수 있다.
- 현재는 단위 버그(GB 오표시)가 워낙 커서 합산/단독 차이는 부차적. 단위부터 고치는 게 1순위.
