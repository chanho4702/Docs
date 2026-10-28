# 비용 분석(cost-analysis) — 프론트엔드 구현 리포트 (M2 + M2-b + M3)

> 작성: frontend-engineer · 2026-06-09 · 슬러그 `cost-analysis`
> 범위: M2(프로젝트 상세 비용 탭 A), M2-b(salary 입력 기준 명시), M3(Portfolio CostTab 고도화 B). 백엔드 무변경.

---

## 1. 구현/수정 파일 목록

### M2 — 프로젝트 상세 비용 탭 (A)
| 경로 | 역할 |
|---|---|
| `static/ui/src/pages/projectDetail/cost/CostPage.jsx` | ProgressPage 동형 셸. coworkerFieldId useQuery → invoke('getProjectCostSummary') → 상태분기(loading/error/noPeriod/empty/정상) |
| `static/ui/src/pages/projectDetail/cost/CostKpiHeader.jsx` | A1 KPI 4타일(예산/실집행/소진율/잔여) |
| `static/ui/src/pages/projectDetail/cost/CostPlanActualBar.jsx` | A2 계획 vs 실집행 막대(ECharts) |
| `static/ui/src/pages/projectDetail/cost/CostBurnUp.jsx` | A3 누적 실집행 line + 예산선 markLine(ECharts) |
| `static/ui/src/pages/projectDetail/cost/CostByRoleLevel.jsx` | A5 역할/레벨 토글 계획·실집행 막대. 라벨은 useRoleLevel 메타 매핑 |
| `static/ui/src/pages/projectDetail/cost/CostEvmCard.jsx` | A6+A7 CPI/EAC/ETC + 초과경보 배지. null 가드 + EAC 발산 가드(BAC×3 초과 → "예측 불가") |
| `static/ui/src/pages/projectDetail/cost/CostIssueTable.jsx` | A8 이슈별 비용·MD당단가 DynamicTable(cost desc는 백엔드 정렬 그대로) |
| `static/ui/src/pages/projectDetail/cost/CostPage.css` | 레이아웃/KPI/배지/토글 스타일 |
| `static/ui/src/constants/tabs.js` | `projectDetailTabs`에 `projectCost` 탭 추가(`projectProgress` 형제, `canRender: () => canReadReport`). 아이콘 `@atlaskit/icon-lab/core/coins` |
| `static/ui/src/utils/queryKey/projectKeys.js` | `cost: (projectId) => ['projectCost', projectId]` 추가 |
| `static/ui/src/utils/costFormat.js` | (신규) `formatCurrency(v,currency)`, `formatM(v,currency)` ₩M 축약, `formatPct`, `currencySymbol` |

### M2-b — salary 입력 기준 명시 (백엔드 무의존)
| 경로 | 변경 |
|---|---|
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | salary 컬럼 헤더에 도움말 아이콘(`information`) + `@atlaskit/tooltip` Tooltip(`t('cost.salaryBasis.help')`) |
| `static/ui/src/backoffice/page/user/modal/regist/UserRegistrationModal.jsx` | salary `<Field>` 아래 `<HelperMessage>` 추가 |
| `static/ui/src/backoffice/page/user/modal/edit/UserEditModal.jsx` | salary FieldBlock 안 Textfield 아래 `<HelperMessage>` 추가 |
- 입력 동작(InlineEdit/Textfield/formatNumber/parseNumber) **무변경**. 도움말만 비침습 추가. 3곳 공통 키 `cost.salaryBasis.help` 재사용.

### M3 — Portfolio CostTab 고도화 (B) — 백엔드 무의존
| 경로 | 역할 |
|---|---|
| `static/ui/src/pages/portfolio/utils/portfolioAggregate.js` | 순수함수 6개 append(`costKpi`/`costPlannedActual`/`costOverrunRank`/`costProgressScatter`/`monthlyBurnRate`/`costByRoleLevel`) + 내부 헬퍼 `projActual/projBurnRate/projCpi/projCostLevel`. tsrSignals `resource` 블록에 `burnRate/cpi/costLevel` 필드 추가(기존 필드 보존) |
| `static/ui/src/pages/portfolio/widgets/PortfolioCostKpi.jsx` | B1 전사 KPI 타일 |
| `static/ui/src/pages/portfolio/widgets/PortfolioCostPlannedActual.jsx` | B2 계획 vs 실집행 그룹막대(ChartTableToggle) |
| `static/ui/src/pages/portfolio/widgets/PortfolioCostOverrunRank.jsx` | B3 CPI 위험순 DynamicTable(행클릭 드릴다운) |
| `static/ui/src/pages/portfolio/widgets/PortfolioCostScatter.jsx` | B4 소진율 vs 진척률 사분면 scatter(0.5 markLine) |
| `static/ui/src/pages/portfolio/widgets/PortfolioMonthlyBurn.jsx` | B5 전사 월별 소진 line(ChartTableToggle) |
| `static/ui/src/pages/portfolio/widgets/PortfolioCostByRoleLevel.jsx` | B6 역할/레벨 토글 그룹막대 |
| `static/ui/src/pages/portfolio/tabs/CostTab.jsx` | 전면 교체(B1~B6 그리드). props `{selectedProjects, roleMeta, levelMeta, currency}` |
| `static/ui/src/pages/portfolio/sections/ComparisonTabs.jsx` | CostTab 호출부에 roleMeta/levelMeta/currency 전달. `currency` prop(기본 'KRW') 추가 |
| `static/ui/src/pages/portfolio/PortfolioDashboardPage.jsx` | ComparisonTabs에 `currency={data?.currency ?? "KRW"}` 전달 |
| `static/ui/src/pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | B7 Cost 신호 컬럼(`c` Dot) + cost 툴팁 추가. 기존 행 구조 유지 |
| `static/ui/src/pages/portfolio/utils/__test__/__snapshots__/portfolioAggregate.test.js.snap` | tsrSignals 변경 반영(`-u`로 갱신) |

- 기존 salary 위젯 파일(`PortfolioSalaryByProject`/`PortfolioSalaryHistogram`)은 **삭제 안 함, 미참조로 둠**(설계 권장).

### i18n
- (신규) `locales/kr/cost.json`, `locales/en/cost.json` — `cost.*`(salaryBasis.help 포함)
- `locales/kr/portfolio.json`, `locales/en/portfolio.json` — `portfolio.cost.*` append(`tsr.costSignal` 포함)

---

## 2. 소비한 백엔드 응답 shape 접근 경로 (02_backend_report.md와 일치 확인)

`invoke('getProjectCostSummary', { projectId: project_id, coworkerFieldId })` → **content 래핑 없이 루트 직접 접근**. 백엔드 리포트 §2 shape과 글자 그대로 일치:

| 위젯 | 접근 경로 |
|---|---|
| 셸 분기 | `data.success`, `data.project.startDate`, `data.project.endDate`, `data.budget.plannedBudget` |
| A1 KPI | `data.budget.{plannedBudget, actualCost, remaining}`, `data.rates.burnRate`, `data.currency` |
| A2 | `data.budget.{plannedBudget, actualCost}` |
| A3 | `data.monthlyCost[].{month, cumulative}`, `data.plannedBudgetLine` |
| A5 | `data.byRole[].{key, planned, actual}`, `data.byLevel[].{key, planned, actual}` |
| A6/A7 | `data.evm.{cpi, eac, etc, overBudget, overrunAmount}`, `data.budget.plannedBudget` (EAC 발산 가드 기준) |
| A8 | `data.byIssue[].{issueKey, summary, actualMd, cost, costPerMd}` (백엔드가 cost desc 정렬·cost>0 필터·null costPerMd 처리) |

- **null 가드 준수**: `evm.cpi/eac/etc` null → "-". `byIssue[].costPerMd` null → "-". `overBudget` false면 "예산 내 진행" 배지.
- **상태분기**: `project.startDate|endDate` 없음 → `cost.noPeriod`(warning). `budget.plannedBudget===0` → `cost.empty`(information). ProgressPage 패턴 복제.

**M3(B)는 백엔드 무의존** — 기존 `getPortfolioDashboard` 응답의 `projects[]`(totalSalary/scheduleRate/completionRate/monthlyEffort/members[salary/roleKey/levelKey])에서 프론트 재집계. 프로젝트별 식은 백엔드와 동일: `actual = totalSalary × scheduleRate`, `cpi = completionRate/scheduleRate`(scheduleRate≤0 → null), `costLevel = cpi<1 → red / scheduleRate > completionRate+0.1 → amber / else green`.
- currency: portfolio 응답에 통화 필드 없음 → 'KRW' 상수 폴백(`data?.currency ?? "KRW"`, 설계 §6/리스크 #4).

---

## 3. i18n merge / test / build 결과

- **merge 실행**: `cd static/ui && npm run merge` 완료. `ko-KR.json`/`en-US.json`에 `cost.*` 네임스페이스 + `portfolio.cost.*` 생성 확인(`cost.tab.label`, `cost.salaryBasis.help`, `portfolio.cost.kpi.title`, `portfolio.cost.tsr.costSignal` 모두 KO/EN 검증).
- **test**: `npx jest --ci` → **5 suites / 48 tests 전부 통과**. tsrSignals 골든 스냅샷은 `resource.{burnRate,cpi,costLevel}` 추가로 의도된 변경 → `-u`로 갱신(p1: cpi 0.82/red, p2: cpi 1.1/green — 수계산 일치).
- **build**: `npm run build` **성공**. 신규 cost 파일 관련 컴파일 에러/경고 0. (남은 경고는 기존 @atlaskit/marklassian source-map 파싱 경고로 본 작업과 무관.)

---

## 4. 미해결 / 가정

1. **currency 폴백**: portfolio 응답에 통화 없어 B 위젯은 'KRW' 고정(설계 §6 동의). 추후 settings.currency 연동 시 ComparisonTabs `currency` prop만 교체하면 됨.
2. **byRole/byLevel 라벨 매핑(A5)**: 비용 응답은 `key`(role-be 등) raw만 제공 → 프론트 `useRoleLevel`(getRoleList/getLevelList)로 key→name 매핑. 미매칭 key는 key 그대로, null은 '-'.
3. **EAC 발산 가드(설계 §8-6)**: `eac > plannedBudget × 3`이면 "예측 불가" 라벨 + ETC도 "-"로 표기(프론트 책임, 백엔드 raw 유지).
4. **실 invoke 미수행**: Forge 런타임 단일 프로젝트 invoke 응답 shape 확인은 verifier/E2E 몫. 코드/소비 경로는 백엔드 리포트 shape에 정합.
5. **CostByRoleLevel 누적막대 표현**: 설계 "누적막대" 문구이나 계획/실집행은 동일 그룹의 두 측정값이라 `barGap:0` 그룹막대로 구현(누적 시 계획+실집행 합산이 무의미). 의미 전달은 동일.
