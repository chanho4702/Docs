---
name: project-rfc125-mm-analysis
description: RFC-125 이슈별/인력별 MM 분석 리포트 페이지 구현 완료
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d22ed5e-edfa-4547-99d9-2249912e4e00
---

# RFC-125 MM 분석 리포트 구현

**Why:** projectDetail에 MM(Man-Month) 분석 기능 추가 요구. 이슈별/인력별 계획 대비 실제 투입량 가시화.

**How to apply:** 추후 이 기능 관련 수정 시 아래 파일 구조 참고.

## 구현된 파일

### 백엔드
- `src/api/jira/issue/IssueApi.js` — `getIssuesMmByProject` 함수 추가
- `src/resolver/resourceReport/ResourceReportService.js` — 새로 생성
- `src/resolver/resourceReport/ResourceReportController.js` — 새로 생성
- `src/index.js` — `registerResourceReportController` 등록

### 프론트엔드
- `static/ui/src/pages/projectDetail/resourceReport/ResourceReportPage.jsx` — 날짜 필터 + 서브탭
- `static/ui/src/pages/projectDetail/resourceReport/issue/IssueMmAnalysisPanel.jsx`
- `static/ui/src/pages/projectDetail/resourceReport/user/UserMmAnalysisPanel.jsx`
- `static/ui/src/constants/tabs.js` — resourceReport 탭 추가

### i18n
- `locales/ko-KR.json`, `locales/en-US.json` — `resourceReport` 키 추가
- `locales/kr/projectDetail.json`, `locales/en/projectDetail.json` — `analysis.issue` 키 추가 (RFC-125 이슈분석 페이지)

### 이슈 분석 페이지 (IssueAnalysisPage) - 2026-05-20
- `src/resolver/issueAnalysis/IssueAnalysisService.js` + `IssueAnalysisController.js` 신규
- `static/ui/src/pages/projectDetail/analysisReport/issue/` 아래 4개 파일
  - `IssueAnalysisPage.jsx` — 60/40 레이아웃
  - `IssueAnalysisTable.jsx` — 이슈 분석 테이블 (progress bar, 일정위험도 badge)
  - `WorklogDetailPanel.jsx` — 선택된 이슈 워크로그 목록
  - `IssueAnalysisChart.jsx` — ECharts 누적 line chart (실제 vs 계획)
- invoke 함수: `getIssueAnalysisList`, `getIssueWorklogDetail`

## 핵심 설계 결정
- 날짜 필터: 이슈 시작일/종료일 기간 겹침 기준 (`customfield_10015 <= endDate AND duedate >= startDate`)
- 실제 MD: 워크로그 작성자 기준 (담당자 + 협업자 모두 포함)
- 계획 MD: assignee 기준 originalEstimateSeconds 합산
- 처리율/투입율: < 50% 빨강, 50~80% 노랑, > 80% 초록 프로그레스 바
- hourRate: `getSettingDataService()`에서 동적 조회 (기본 8h)
- invoke 함수명: `getIssueMmAnalysis`, `getUserMmAnalysis`
