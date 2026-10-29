---
name: project-cost-analysis
description: 비용 분석 기능 — 프로젝트 상세 비용 탭 + Portfolio 비용 인사이트. 목록 확정·구현 보류
metadata: 
  node_type: memory
  type: project
  originSessionId: a027386a-f932-4a5d-ad9d-ff4d09289e67
---

비용 분석 기능. 2026-06-09 feature-harness 풀스택 파이프라인(architect→backend→frontend→verify) **구현+검증 완료, forge deploy/E2E 미수행**. 슬러그 `cost-analysis`. 산출물: `_workspace/cost-analysis/` 의 01_architect_design(단일 진실)·02_backend_report·02_frontend_report·03_verify_report. 검증 14통과/0실패/1미검증(실 invoke E2E만 런타임 의존). 백엔드 jest 66/66, 프론트 48/48, build 성공.

**구현 결과**: 백엔드=신규 `src/resolver/projectCost/`(CostCalculator 순수함수+Service+Controller, `getProjectCostSummary` resolver, index.js 등록 1줄). 응답 content 래핑 없이 루트 spread: `currency/project/rates/budget/evm/monthlyCost/plannedBudgetLine/byRole/byLevel/byIssue`. 온디맨드+KVS 10분 캐시(byIssue·raw는 캐시 제외). **Portfolio(B)는 백엔드 zero-touch** — 프론트 `portfolioAggregate.js` 순수함수 6개+위젯 6개로 기존 getPortfolioDashboard 응답 재집계. 프론트=`pages/projectDetail/cost/` 7컴포넌트+신규 `projectCost` 탭, `utils/costFormat.js`, Portfolio CostTab 전면교체(B1~B6)+tsrSignals에 burnRate/cpi/costLevel(B7). i18n `cost.*`/`portfolio.cost.*` merge 완료.

**salary 입력 기준 명시(사용자 요청)**: salary 3입력지점(ProjectUserPanel salary 헤더 Tooltip, 백오피스 user 등록/수정 모달 HelperMessage)에 `cost.salaryBasis.help`="프로젝트 기간 동안 해당 인원에게 들어가는 총 비용, 월급 아님" 공유. 입력 동작 무변경.

**배포 전 확인(미검증)**: 시작 전 프로젝트 evm null 표기, KVS 캐시 hit 시 byIssue 재구성, A5 key→name 매핑, currency는 portfolio 응답에 없어 프론트 'KRW' 폴백.

**비용 모델 확정(핵심)**: `projectusers.salary`(DOUBLE) = "프로젝트 기간 동안 멤버가 받는 **총 금액(총 단가)**" = 멤버 계획 인건비. 월급/MD단가 아님. 프로젝트 **계획 예산 = Σ salary** ( = 기존 `total_salary`/`SUM(pu.salary)`). **실집행 비용 = salary를 진행도로 안분** — 안분 기준이 architect 핵심 결정사항: (a)시간경과 `salary×경과근무일/총근무일`(권장 출발점, 배치가 이미 근무일 계산) (b)공수 `×실effortMd/계획effortMd` (c)진척 `×completionRate`(EVM 정석, [[progress_page]] 산식 재사용).

**기능 목록**: A. 프로젝트상세 비용탭(신규) A1요약KPI/A2계획vs실집행/A3소진추이Burn-up/A5역할·레벨별분포/A6 EAC예측/A7 CPI/A8이슈별비용(안분)&MD당단가. B. Portfolio CostTab고도화 B1전사KPI/B2예산대비실집행/B3초과위험랭킹/B4비용·진척산점도/B5월별번레이트/B6역할·레벨별전사인건비/B7 T/S/R신호등Cost강화.

**개인 단위 비용 미채택(2026-06-09 보강)**: A4(인력별 비용 기여)·"인원별 성과" 드롭. salary가 기간 고정 입력값이라 개인 비용은 시간경과 안분이면 salary 재표시, 공수/진척 안분이면 "워크로그 행태=가치" 거짓 신호로 붕괴. 인원 축(가동률/부하)은 인력 분석에 이미 있고 비용 비결합. 역할/레벨 집계(A5/B6)는 "구성 분석"이라 유지. 해상도 = 프로젝트→역할/레벨→이슈, 개인에서 멈춤.

**재사용 자산**: `PortfolioAggregator.aggregateOneProject`가 이미 members(salary/effortMd/roleKey/levelKey)·monthlyEffort·completionRate·plannedTotalMd/actualTotalMd·totalSalary 산출 → 비용 안분 입력 대부분 스냅샷에 존재. 현재 [[project_portfolio_dashboard]] CostTab은 salary 정적합산만(PortfolioSalaryByProject/Histogram). 프로젝트상세는 `getSummaryData` KPI 타일 1개(cost)뿐. across 집계 금지 원칙상 Portfolio 비용은 배치 스냅샷 적재 필수, 프로젝트상세는 단일이라 온디맨드 가능.
