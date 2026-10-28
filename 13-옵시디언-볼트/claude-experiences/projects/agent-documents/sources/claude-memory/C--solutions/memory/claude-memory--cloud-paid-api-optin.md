---
name: cloud-paid-api-optin
description: 2026-08-25 유료 API 옵트인 — 기본 잠금·고지 후 사용. P0+P1(CE 실청구액) 구현·런타임 실측 완료(미커밋, 검수 대기)
metadata:
  type: feedback
---

2026-08-25 사용자 결정: 클라우드 모니터링·자산 비용에서 **유료 AWS API는 기본 잠금**이고, **설정 화면에서 항목별 토글 + 예상 월 비용 고지** 후에만 켠다.

**Why:** 과금 0 원칙([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--aws-zero-cost-charting|aws-zero-cost-charting]])은 기본값으로 유지하되, 실청구액(Cost Explorer)·플릿 지표(GetMetricData)처럼 유료로만 되는 가치는 고객이 비용을 알고 선택하게 한다. 고객 AWS 계정에 청구되는 돈이라 고지 없는 활성화는 사고다.

**How to apply:**
- 유료 게이트웨이 메서드는 옵트인 게이트 뒤에만 존재. 기본(표준 모드)에서는 코드 경로 자체가 닫혀 있어야 한다.
- 토글 UI는 **예상 월 비용 계산기**(인스턴스 수 기반)를 함께 표시.
- 켜져도 월 예산 가드(cloud_api_budget 패턴) 동일 적용.
- 돈값 판정(2026-08-25 합의): 켤 만한 것은 Cost Explorer(실청구액, 월 $1 미만)와 GetMetricData(플릿 Top-N, 규모 비례)뿐. 메모리/디스크·알람·1분 해상도는 Zabbix agent·자체 판정으로 무료 대체.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--aws-zero-cost-charting|aws-zero-cost-charting]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-cost-design|asset-cost-design]]

**진행(2026-08-25)**: P0+P1 커밋(BE `d581369`·FE `9d744a0`) 후 옵트인 ON 유지(일 $0.01, 사용자 승인). **P2 완료·커밋**(BE `224605c`·FE `c77121f`): 클라우드 비용 화면 — Price List 단가 캐시(V35)×스냅샷 가동시간 추정+낭비 진단 3종+실청구액 통합, :3000 실측(t2.micro $0.0152/h·월 $11.86). 🔴describeRegions(allRegions)는 미옵트인 리전까지 줘 팬아웃 절반이 헛돎 → enabledRegionNames() 필터(실측 15.6s→6.2s). P3(GetMetricData 화면)만 미착수. EC2→자산 자동생성은 D6로 보류(blast radius). 🔴검증 중 병행 세션(aimonitor)이 V30·V31·V33 선점 — cloud_cost_daily는 V32. 🔴Mockito 중첩 스터빙(외부 when 진행 중 내부 mock 스터빙)은 UnfinishedStubbingException — mock을 밖에서 먼저 만든다.
