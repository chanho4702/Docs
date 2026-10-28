# 요구사항: 통합 대시보드 + 프로젝트 상세 분석 메뉴 심층 검토 및 개선

**날짜:** 2026-06-11
**요청 원문:** "통합 대시보드랑 프로젝트 상세 분석 메뉴들 심층 분석해서 논리적으로 타당한지에 대한 검토와 프론트 디자인 및 로직 개선좀"

## 목적

기존에 구현된 분석성 화면들의 **지표 정의·계산 로직·집계 방식의 논리적 타당성을 심층 검토**하고, 발견된 문제와 함께 **프론트 디자인(UX/시각화) 및 로직 개선**을 설계·구현한다. 신규 기능 추가가 아니라 기존 기능의 정합성 감사 + 개선이다.

## 검토 대상 (스코프)

### A. 통합 대시보드 (Portfolio, `/dashboard`)
- 페이지: `static/ui/src/pages/portfolio/PortfolioDashboardPage.jsx`
- 섹션/탭: `sections/ComparisonTabs.jsx`, `tabs/` (CostTab 포함)
- 위젯: `widgets/` (PortfolioTsrSignalTable, PortfolioCostKpi, PortfolioCostPlannedActual, PortfolioCostByRoleLevel, PortfolioCostOverrunRank, PortfolioCostScatter, PortfolioMonthlyBurn 등)
- 프론트 집계: `utils/portfolioAggregate.js` (+ `__test__/portfolioAggregate.test.js`)
- 백엔드: portfolio 관련 resolver (배치 스냅샷 + 프론트 재집계 구조), `src/resolver/projectCost/`

### B. 프로젝트 상세 분석 메뉴 (`/project/:id` 탭)
1. **대시보드** — `pages/projectDetail/dashboard/DashboardPage.jsx` (react-grid-layout)
2. **분석 리포트 > 이슈 분석** — `pages/projectDetail/analysisReport/issue/IssueAnalysisPage.jsx`
3. **분석 리포트 > 인력(Resource) 분석** — `pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx`
4. **진척율(Progress)** — `pages/projectDetail/progress/ProgressPage.jsx` (3층 모델: 공수/완성/일정, EVM 근사)
5. **비용(Cost)** — `pages/projectDetail/cost/CostPage.jsx`

## 산출 요구

1. **논리 타당성 검토 보고** — 각 화면의 지표마다: 정의 → 계산식(파일:라인) → 타당성 판정(타당/의심/오류) → 근거. 특히:
   - 지표 간 **일관성** (같은 개념이 화면마다 다르게 계산되는가: 예. 가동률, MM, 진척율, 비용)
   - 분모/분자 정의의 타당성 (0division, 기간 경계, 주말/공휴일 처리, 부분 투입 인력)
   - 임계값(신호등 색 등)의 근거와 설정 연동 여부
   - 집계 단계(백엔드 스냅샷 vs 프론트 재집계)에서의 왜곡 가능성 (평균의 평균, 가중치 누락 등)
2. **개선 설계** — 발견된 문제의 수정 설계 + 프론트 디자인/로직 개선안 (우선순위 P1/P2/P3). 응답 shape이 바뀌는 항목은 경계면 계약 표 필수.
3. 이후 파이프라인(backend → frontend → verifier)으로 개선 구현.

## 알려진 맥락 (기존 설계 결정 — 검토 시 기준점)

- **T/S/R 신호등 임계** (`_workspace/portfolio-dashboard/06_signal_thresholds.md`): T=progressThreshold±5%p, S=todoRatio 0.3/0.6 하드코딩, R=가동률 band 0.7/1.1/1.3. **S축만 설정 미연동(알려진 개선후보)**. 신호등 R=프로젝트 내 평균 ≠ 종합 가동률(정의가 다름 — 의도된 것인지 재검토).
- **MM 계산**: 근무일 기반, MM/가동률 분리 (2026-05-27 재설계).
- **가동률**: 유일한 글로벌(전사) 지표. 나머지는 프로젝트 단위.
- **비용**: salary = 기간 총단가(월급 아님). 계획 vs 실적 비용. (2026-06-09 구현, E2E 미수행)
- **Portfolio 구조**: 배치 스냅샷(weekly_effort_json, migrate v007) + 프론트 재집계.
- **성능 규칙**: 워크로그 다건 조회는 공통 페치 경로 수정 금지(기능별 전용 병렬 페처 + p-limit), Resource 분석은 프로젝트 단위 1회 페치 + KVS 캐시.

## 참고 문서 (기존 워크스페이스 — 반드시 읽을 것)

- `_workspace/portfolio-dashboard/01_architect_design_v2.md`, `04_redesign_tsr.md`, `05_session2_changes.md`, `06_signal_thresholds.md`, `03_verify_report.md`
- `_workspace/cost-analysis/01_architect_design.md`, `03_verify_report.md`
- `_workspace/progress-page/01_architect_design.md`, `03_verify_report.md`

## 제약

- **git working tree에 미커밋 변경이 많다** (cost 분리 작업 등). 기존 미커밋 변경을 되돌리거나 덮어쓰지 말 것. 수정은 추가적(additive)으로.
- 기존 경계면 계약은 가능한 유지. 변경이 필요하면 계약 표로 명시하고 backend→frontend 순서로 반영.
- i18n: `locales/kr/`·`locales/en/`에 키 추가 후 `cd static/ui && npm run merge` (`locales/script/*.json`은 빈 스텁 — 사용 금지).
- 쿼리키는 `static/ui/src/utils/queryKey/` 팩토리로만.
