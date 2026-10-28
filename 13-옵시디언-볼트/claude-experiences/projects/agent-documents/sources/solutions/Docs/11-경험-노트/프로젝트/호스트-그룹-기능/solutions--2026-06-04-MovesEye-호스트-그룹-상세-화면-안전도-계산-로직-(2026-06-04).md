---
type: project
tags: [project, moveseye, host-group, monitoring, detail-page, safety-score, logic, walkthrough]
created: 2026-06-04
updated: 2026-06-04
status: active
---

# MovesEye — 호스트 그룹 상세 화면 & 안전도 계산 로직 (2026-06-04)

> 모니터링 > 호스트 그룹 **상세 화면(`/monitoring/host-group/:id`)** 의 동작과 **안전도(safetyPercentage) 계산**을 코드 기준으로 정리.
> 진단/문제점은 [[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|2026-06-04-host-group-audit]], 디렉터리 개요는 [[projects/moveseye/host-group-feature/README|README]] 참고.
> 대상: `host.service.ts` (`getHostGroupDetail` L314, `calculateAlerts` L91, `getDeviceTypeSummary` L1500) · `HostGroupDetail.tsx`

---

## 1. 상세 화면은 API 2개로 그려진다

`HostGroupDetail.tsx`는 독립된 두 쿼리를 호출한다 (서로 다른 응답).

| 쿼리 | API | 용도 | 응답 타입 |
|------|-----|------|-----------|
| 요약 | `GET hosts/:groupid` → `getHostGroupDetail` | 상단 카드(안전도·상태·카테고리 수) | `THostGroupMonitoringDetail` |
| 집계 | `GET hosts/device-type/:groupid` → `getDeviceTypeSummary` | 하단 테이블(device_type별 호스트) | `TResponseList<TDeviceType>` |

```
상세 진입 (:id)
 ├─ getHostGroupDetail(id)   → 상단 Card: 안전도 %, 6등급 상태칩, 모니터링 카운트(total/server/network/security/database/hardware)
 └─ getDeviceType(id, 정렬)  → 하단 DmoveTable: device_type · 호스트 수 · 호스트명 목록(클릭 시 HostDetailModal)
```

> ⚠️ 두 응답이 분리돼 있는 게 [[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|감사]] **B2**의 원인 — 테이블 `total`을 집계 응답(`dataType.total`)이 아니라 요약 응답(`data.total`, 존재하지 않음)에서 읽어 항상 0.

---

## 2. `getHostGroupDetail` 내부 단계 (L314~392)

```
① Zabbix 3종 병렬 조회 (Promise.all)
     · hostgroup.get(groupid)     → 그룹 메타(name 등). 비면 ApiError(HOST_NOT_FOUND)
     · host.get(groupids, +tags)  → 그룹 내 호스트 목록
     · problem.get(groupids)      → 그룹 내 현재 문제(이벤트)

② 안전도 계산        → calculateAlerts(recentEvents) → safetyPercentage   (§3)

③ 카테고리 수 집계   → getCategoryCountsFromTags(hosts)
                       device_type 태그로 server/network/security/database/application/hardware/notClassified 카운트

④ 호스트 사용률      → getHostItems(hosts)
                       각 호스트의 CPU/MEM/Disk lastvalue + category 부여
                       ⚠️ category가 await 누락(B1) → 분류 키 깨짐

⑤ 상태 등급 집계     → formatRecentEvents → groupedByStatus → statusCounts (6등급)
                       등급별 { totalEvents, uniqueHostCount }

⑥ 응답 조립
     { id, name, safetyPercentage, alerts{normal,warning,critical},
       totalHosts, ...categoryCounts,
       recentlyViewedHosts: 카테고리별 호스트(④ 결과),
       recentEvents: 최근 5건, statusCounts }
```

핵심: **상세 = "그룹 1개에 대해 목록 카드와 같은 계산을 더 풍부하게" 한 것.** 추가로 호스트 사용률(④)과 최근 이벤트 5건이 붙는다.

---

## 3. 안전도(safetyPercentage) 계산 로직 ★

### 3-1. 두 단계로 계산된다

**1단계 — 알림을 3분류 (`calculateAlerts`, L91)**
```ts
alerts.reduce((acc, alert) => {
  if (alert.severity < 2)       acc.normal++;    // severity 0(미분류), 1(정보)
  else if (alert.severity == 2) acc.warning++;   // severity 2(경고)
  else                          acc.critical++;  // severity 3,4,5(심각/높음/재해)
}, { normal:0, warning:0, critical:0 });
```

**2단계 — 정상 비율 (`getHostGroupDetail` L332~334)**
```ts
const totalAlerts = normal + warning + critical;
const safetyPercentage = totalAlerts ? (normal / totalAlerts) * 100 : 100;
```

### 3-2. 의미

> **안전도 = (정상 알림 수 ÷ 전체 알림 수) × 100**
> 알림이 하나도 없으면 **100%**(완전 안전)로 간주.

| Zabbix severity | 값 | calculateAlerts 분류 | 안전도 기여 |
|---|:---:|---|---|
| Not classified | 0 | normal | ✅ 정상으로 카운트 |
| Information | 1 | normal | ✅ 정상으로 카운트 |
| Warning | 2 | warning | ❌ |
| Average | 3 | critical | ❌ |
| High | 4 | critical | ❌ |
| Disaster | 5 | critical | ❌ |

### 3-3. ⚠️ 주의 — 두 가지 분류 체계가 공존

같은 이벤트가 **두 번, 서로 다른 기준으로** 집계된다:
- **안전도용** → `calculateAlerts`의 **3등급**(normal/warning/critical), severity<2를 정상으로 흡수
- **상태칩용** → `formatRecentEvents`/`statusCounts`의 **6등급**(NOT_CLASSIFIED~DISASTER)

→ 화면에서 "정보(INFORMATION) 이벤트는 상태칩엔 떠도 안전도엔 정상으로 잡혀" 보일 수 있음. ([[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|감사]] **C3**)

추가 주의:
- Zabbix `severity`는 보통 **문자열**("0"~"5")로 옴. `< 2`는 숫자 강제변환, `== 2`는 느슨한 비교로 우연히 동작. 타입 안전하지 않음.
- 안전도는 **현재 미해결 problem만** 반영(과거 해소된 이벤트 미포함) — `problem.get` 결과 기준.

---

## 4. 화면에 뿌려지는 값 정리

| 화면 요소 | 소스 | 비고 |
|----------|------|------|
| 안전도 % (CountUp) | `data.safetyPercentage` | §3 공식 |
| 6등급 상태칩 | `useHostStatusCount(data.statusCounts)` | 대문자 키만 읽음(B3) |
| 모니터링 카운트(total/server/network/...) | `data.totalHosts`, `data.{category}` | `...categoryCounts` |
| device_type 테이블 | `dataType.items` | total은 `data.total`(❌) → B2 |
| 호스트명 클릭 → 모달 | `record.all_host_names` | `HostDetailModal` |

---

## 5. 한 줄 정리

- **상세 화면 = 요약 API + 집계 API 두 장**으로 구성. 요약은 안전도·상태·카테고리, 집계는 device_type 테이블.
- **안전도 = 정상(severity 0·1) 알림 비율.** 알림 없으면 100%. 단 정보 등급을 정상으로 흡수하고, 안전도(3등급)와 상태칩(6등급)이 다른 기준이라 해석에 주의.
