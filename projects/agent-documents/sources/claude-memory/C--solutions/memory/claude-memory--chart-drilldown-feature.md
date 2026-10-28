---
name: chart-drilldown-feature
description: 차트 공용 드릴다운(툴팁 항목 링크 + 차트↔표 전환) — 2026-08-27 사용자 요청, ZM-119 이어서 FE 전용. 1단계 자산 관리 전체 차트, 2단계 이벤트/알림·자빅스 관리 신설 페이지. 설계 features/events/lld-management/devdesign_chart-drilldown.md
metadata:
  type: project
---

**요청(2026-08-27)**: "각 항목 툴팁 클릭하면 세부 데이터로 이동, 로우 데이터 볼 수 있게 차트마다 버튼으로 표 전환" + "마무리하면 이벤트 알림이랑 자빅스 관리 하위 신설 페이지들도". 범위 결정: 자산 관리 전체 차트(1단계) → 이벤트/알림·자빅스 관리(2단계), 브랜치 ZM-119 이어서(worktree zm-119-fe), BE 무변경.

**설계 핵심**(`features/events/lld-management/devdesign_chart-drilldown.md`): 범용 `components/Chart/ChartCard`(Segmented 차트|표, `table.rows`=데이터 전량, 행 클릭=`onRowSelect`, 뷰 상태 sessionStorage) + `tooltipLink`(`enterable:true`·`hideDelay≤250`·`appendToBody`라 document 위임 클릭 1개, `data-chart-card` 스코프). 🔴 원칙: 막대 클릭·툴팁 링크·표 행 링크는 **같은 항목 집합**(착지 축 없으면 셋 다 없음) · 표가 canvas 드릴다운의 키보드 경로.

**실측 전제**: 레포에 툴팁 클릭 전례 0(`enterable` 0건)·차트↔표 토글 UI 0·모달형 데이터표(`DmoveChart`)는 `xAxis.data` 전제라 가로막대/도넛 불가·`AssetChartCard.extra`와 `hint` 배타. 🐛 부수 발견: `costChartColors`를 배열로 취급한 곳 2(`CostMonthlyTrendCard:106`·`CostHwDepreciationPage:232`).

**진행(2026-08-27)**: 1·2단계 구현 완료(FE jest 1538/1540), 정적 QA 41 PASS/9 FAIL·브라우저 QA 31 PASS/3 FAIL 전건 조치, BE 코덱스 🔴1/🟡2 반영(홈 KPI 942→344=목록 축), FE 코덱스 🟡3 반영·재검증 8/8 → **커밋→리베이스→로컬 병합 완료(2026-08-27)**: FE master=`7f23be3`, BE ZM-79=`d54d55c`(리베이스 후 해시), 미푸시. worktree zm-119 제거, 브랜치 ZM-119 보존. 🔴 실측: 이벤트/알림·자빅스 관리 페이지엔 차트 0건 → 2단계 대상은 홈 알람 도넛·호스트그룹 알림 추이·DmoveChart 범용화. 🔴 교훈: 숫자에 링크를 달면 선재 불일치가 결함으로 승격 / 좁은 필터(monitored·skipDependent)로 축 맞추면 과소(317) / 따라오는 툴팁은 항목 키 기준 위치 캐시 / 빈 objectids는 Zabbix가 전량 계산.

**2단계 주의**: 다른 세션(zm-118)의 자빅스 개요 신설 페이지는 미커밋이라 병합 후 적용.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-cloud-integration|asset-cloud-integration]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-dashboard-feature|asset-dashboard-feature]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-page-remount-on-navigate|fe-page-remount-on-navigate]]
