# 폰트 굵기 수렴 리포트 (2026-08-11)

기준: `_workspace/font-weight-sweep/SPEC.md` (전수 조사 기반). 방식: 굵기 값만 1:1 교체 + echartsTheme 속성 추가. 구조·색·크기 무변경.

## 1차 스윕 (frontend-engineer, SPEC A~H)

- 21개 파일 / 35줄 (교체 31 + echartsTheme.js 속성 추가 4)
- A 공용: Card `"bold"`→600, ChartCard ×2 `"bold"`→600, CardFullscreen 700→600
- B KPI 6곳 700→600 (PortfolioCostKpi, ProjectDetailPanel, ProgressPage.css `.progress-metric-value`, CostPage.css `.cost-kpi-value`, TaskHistoryInsightCards, StorageUsageGauge)
- C 배지 8곳 →600 (MiniBadge, ProjectCard :120/:129/:46(800 제거), SourceIcon, ProgressPage.css `.progress-badge`, CostPage.css `.cost-badge`, StatusLozenge `bold?'bold':'normal'`→`bold?600:400`)
- D WorkQueueFilters `active?700:500`→`active?600:400`
- E 폼 라벨 5곳 →600 (ProjectDetailPanel :85/:106, TreeDetailPanel :802, WorkQueueItem :79/:104)
- F 제목 4곳 →600 (TreeDetailPanel :160/:318, ProjectCard :103, MyPageHeader :73)
- G usePermission.js `"bold"`→600
- H echartsTheme.js: axisCommon.axisLabel/nameTextStyle 400, title.textStyle 600, legend.textStyle 400 명시. pieChartOption·MyContributionCharts `"bold"`→600
- 검증: 프론트 66 suites/1110 tests PASS, CI 빌드 PASS (gzip 895,134/950,000)

## 2차 마무리 (리더 직접, 10곳)

1차에서 보류·기록만 된 지점 정리:

| 파일:라인 | 역할 | 변경 |
|---|---|---|
| components/lozenge/SemanticBadge.jsx:33 | 의미 배지 | 700→600 — 1차에서 "마이크로 라벨 11곳 충돌"로 보류했으나, 원 조사의 보호 11곳 목록에 SemanticBadge는 미포함(배지 축이 맞음). StatusBadge 600과 정렬 |
| pages/resource/assignment/projects/ProjectCard.jsx:147 | D-day | 700→600 (WorkQueueItem D-day와 일치) |
| pages/projectDetail/work/TreeDetailPanel.jsx:854 | 출처 배지 | 700→600 (SourceIcon과 일치) |
| pages/projectDetail/work/TreeDetailPanel.jsx:979 | 워크로그 소요시간 값 | 700→600 (수치 강조 축) |
| components/project/DropdownJql.jsx:193 | 카운트 필 | 700→600 (배지 축) |
| pages/myPage/sections/MySkillSection.jsx:189 | 그룹 라벨 | 700→600 (라벨 축) |
| pages/projectDetail/progress/ProgressPage.css:317 | 가이드 용어 라벨 | 700→600 |
| .../analysisReport/resource/ResourceAnalysisTable.jsx:192 | MM 수치 강조 | 700→600 |
| .../analysisReport/resource/ResourceAnalysisTeamTable.jsx:154 | MM 수치 강조 | 700→600 |
| .../analysisReport/resource/ResourceAnalysisChart.jsx:326 | 툴팁 MM 강조 | 700→600 |

## 최종 잔존 (전부 의도된 보호 축 — 대문자 마이크로 라벨 700)

JSX 11곳: UserPage:62, SkillGroupChips:30, TreeDetailPanel:31, TeamDetailPanel:20, ResourceProfileDrawer:37, ProjectTeamBar:55, MyPermissionSection:121, PortfolioFilterBar:77, ProjectDetailDrawer:44, GanttToolbar:121, SourceSelect:78
CSS 2곳: PortfolioDashboard.css:8, AddChartModal.css:140

- `fontWeight` 800 / `"bold"` 문자열: **0건**
- 이번 범위 제외(별건 유지): 중간톤 500 소수파(역할 정의 부재), Heading/`token('font.*')` 마이그레이션, WidgetCard raw h3 치환, StatusTag/StatusLozenge regular(400)
