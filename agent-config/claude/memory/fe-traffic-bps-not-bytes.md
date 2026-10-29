---
name: fe-traffic-bps-not-bytes
description: "net.if.in/out(트래픽)은 Zabbix 원값이 bps(bits/s)다 — formatBytes 금지, formatBitrate(SI 1000) 사용. byte로 표시하면 ~940만배 부풀려짐"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7561f7d2-f01f-4e06-8835-22f5a0cc17f2
---

moveseye Zabbix(`dmove.co.kr`) 환경의 **`net.if.in["..."]` / `net.if.out["..."]` 트래픽 item은 units=`bps`(bits/second), value_type=3**. byte 아님(Zabbix preprocessing으로 비트레이트 저장). group2/5 전수 확인됨(2026-06-24 `diag_report-traffic.md`).

- 🔴 **트래픽을 `formatBytes`(MB·1024 진법 가정)로 표시하면 bps 값을 byte로 읽어 약 940만 배 부풀려진다** (예: 0.86 Mbps → "836 GB"). 사용자가 "트래픽 이상"으로 발견.
- ✅ **표시: `formatBitrate(bps)`** (`src/utils/index.ts`, bps→Kbps/Mbps/Gbps/Tbps, **SI 1000 진법**, `formatBytes`와 별개). 차트 단위는 **`UnitData.BPS`** → 공용 `getYAxisConfig`/`useHandelChartAction` tooltip이 BPS 분기로 `formatBitrate` 호출(BYTES/PERCENT 동작은 불변, BPS만 추가).
- BE(Spring)는 **bps 원값 그대로 노출**(변환 없음). 그룹 traffic=호스트 합산, in+out 합산. **표시 계층(FE)에서만** 단위 처리(BE 변환 금지 — 원값 노출 계약·타 소비자 영향).
- 수정된 곳(2026-06-24): 리포트 `HostGroupReportResource`/`useGroupReportHostCompare`/`HostGroupReport`(Excel export), 리소스 추이 `useGroupResourceTrend.getUnit`, `InterfaceGraphModal`(net.if in/out 전용 확인됨).
- ⚠️ **향후 net.if 트래픽을 그리는 새 화면/차트는 반드시 `UnitData.BPS` + `formatBitrate`를 쓸 것**(`formatBytes`/`UnitData.BYTES` 금지). 디스크 IO·메모리 등 진짜 byte 지표는 BYTES 유지.

관련: [[hostgroup-report-feature]] (트래픽 item-key 매칭 버그 수정 이력도 참고).
