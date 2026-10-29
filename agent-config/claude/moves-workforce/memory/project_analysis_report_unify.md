---
name: project-analysis-report-unify
description: "분석/리포트 UI 통일 작업(탭 이동·테이블 공통화·차트 확장/로우토글·이슈비용 차트·전체이슈 비용), 2026-06-18 커밋 6aff879"
metadata: 
  node_type: memory
  type: project
  originSessionId: 90d1ca41-48f6-422c-8ec7-c22df2f80fae
---

RFC-135 후속 UI 통일 작업. 2026-06-18 develop 브랜치 커밋 `6aff879`로 저장(빌드/테스트 통과).

- 진척율/비용을 프로젝트 상세 **"분석 및 리포트" 하위 탭**으로 이동(`constants/tabs.js`). `CommonTab.findActiveConfig`가 자식 탭 active 시 자식 config를 반환하도록 수정해 `canReadReport` 게이트 보존.
- 테이블 9종을 공통 `components/table/CommonTable`로 통일(emptyView/maxHeight/wrapperStyle/isFixedSize 하위호환 확장).
- 차트 **확장(전체화면)+로우데이터(표) 토글** 통일: `expandContext`/`ChartTableToggle`/`EmptyState`를 `static/ui/src/components/chart/`로 공용 승격(portfolio는 재노출 shim). 공용 `Card`에 `expandable` opt-in. 전체화면 시 `ChartBox`가 `ExpandContext`로 vh 높이 전환.
- 이슈별 비용 **차트화**: `CostIssueTable`→`CostByIssue`(상위 15 가로막대 + 전체이슈 표 토글, costPerMd null='-').
- **전체 이슈 비용 계산**: `CostCalculator.mergeAllIssues`로 프로젝트 모든 이슈 left-join(워크로그 없는 이슈 cost=0/actualMd=0). `byIssue` shape에 `statusKey`/`statusName` additive 추가. 워크로그 N+1 없음(캐시 miss는 기존 rawIssues 재활용).

관련: [[project_portfolio_dashboard]] [[project_cost_analysis]] [[project_analysis_review]] [[feedback_worklog_fetch_isolation]] [[feedback_no_asapp]]
미수행: 브라우저 E2E(전체화면 ECharts 리사이즈, 캐시 hit 경로 byIssue 수치 동일성).
