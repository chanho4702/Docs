# 비용 분석 기능 — 요구사항 & 기능 목록 (기획 확정본)

> 상태: **목록 확정 / 구현 보류** (2026-06-09). 다음 세션에서 feature-harness Phase 2(architect)부터 재개.
> 슬러그: `cost-analysis`

## 1. 목표

1. **프로젝트 상세**에 비용 분석 기능 추가 (현재 대시보드 KPI 타일 1개뿐, 전용 탭 없음).
2. **통합 대시보드(Portfolio)**에서 프로젝트 비용 분석 기반 인사이트 제공 (현재 CostTab = salary 정적 합산만).

## 2. 비용 모델 (확정 — 모든 계산의 근간)

- **`salary`의 의미 = "프로젝트 기간 동안 그 멤버가 받는 총 금액(총 단가)"**
  - 출처: `projectusers.salary` (DOUBLE), 마스터 `users.salary`를 프로젝트 투입 시 오버라이드 가능.
  - 통화: `settings.currency` (기본 KRW).
- **파생 정의:**
  - 멤버 **계획 인건비** = `salary` (그 자체).
  - 프로젝트 **계획 예산** = `Σ members.salary` ( = 현재 `total_salary` / `SUM(pu.salary)` ).
  - 멤버 **실집행 비용** = `salary`를 **진행도로 안분**한 값. → 안분 기준은 **설계 단계 결정 필요**:
    - (a) **시간 경과 안분**: `salary × min(1, 경과근무일/총근무일)` — 가장 단순, 공수 무관.
    - (b) **공수 안분**: `salary × min(1, 실제effortMd/계획effortMd)` — 멤버별 계획 effort 정의 필요.
    - (c) **진척(획득가치) 안분**: `salary × completionRate` — EVM 정석, 진척도 산식([[progress_page]]) 재사용.
  - 권장 출발점: **(a) 시간 경과 안분**(기존 배치가 근무일/일정률을 이미 계산) + 선택적으로 (c)와 비교 표기. architect가 최종 결정.

> ⚠️ salary는 **월급/MD단가가 아니다.** MD단가 환산(`salary/투입MD`)은 파생 지표로만 사용 가능, 입력값 아님.

## 3. 기능 목록

### A. 프로젝트 상세 — 비용 분석 탭 (신규, `projectDetail/cost/` 가칭)

| # | 기능 | 계산식 (salary=총단가 기준) | 인사이트 |
|---|------|------|---------|
| A1 | **비용 요약 KPI** | 계획예산=Σsalary / 실집행=Σ안분 / 소진율=실집행÷예산 / 잔여 | 예산 건강도 한눈 |
| A2 | **계획 vs 실집행 비교** | Σsalary ↔ Σ안분 (프로젝트 단위) | 초과/절감 추세 |
| A3 | **비용 소진 추이(Burn-up)** | 월별 누적 실집행 vs 예산선 (월별 안분 = monthlyEffort 비중 안분) | 소진 속도·고갈 시점 |
| A5 | **역할/레벨별 비용 분포** | roleKey·levelKey 그룹 Σsalary / Σ안분 | 인력 구성 비용 균형(구성 분석) |
| A6 | **EAC 예측 / 초과 경보** | EAC = 예산 ÷ 비용효율지표, 현재 소진율로 완료시점 총비용 추정 | 선제 리스크 감지 |
| A7 | **비용 효율(CPI/EVM)** | CPI = (completionRate×예산) ÷ 실집행 | 돈값 여부(>1 양호) |
| A8 | **이슈별 비용(안분) & MD당 단가** | 이슈비용 = Σ_멤버( salary × 멤버의 이 이슈 워크로그MD ÷ 멤버 전체 워크로그MD ); MD당단가 = 이슈비용 ÷ 이슈 실투입MD | 비용 집중 이슈 식별(공수 블랙홀에 금액 환산) |

> **개인(named) 단위 비용·성과 항목은 미채택** — 6절 결정 기록 참조. A 그룹의 해상도는 **프로젝트 → 역할/레벨(구성) → 이슈(작업)** 까지이며 개인에서 멈춘다.

### B. 통합 대시보드 — 비용 인사이트 (Portfolio CostTab 고도화)

| # | 기능 | 계산식 | 인사이트 |
|---|------|------|---------|
| B1 | **전사 비용 KPI** | Σ예산 / Σ실집행 / 전사 소진율 | 경영 한눈 |
| B2 | **프로젝트별 예산 대비 실집행** | 현 정적 막대 → (계획예산, 실집행) 그룹막대 | 어느 프로젝트가 새는가 |
| B3 | **비용 초과 위험 랭킹** | CPI<1 또는 (소진율 > 진척률) 정렬 | PMO 개입 우선순위 |
| B4 | **비용 vs 진척 산점도(사분면)** | x=소진율, y=completionRate | 고비용·저진척 격리 |
| B5 | **월별 전사 번레이트 추이** | 월별 Σ실집행 추이 | 현금흐름 예측 |
| B6 | **역할·레벨별 전사 인건비 구성** | 전 프로젝트 roleKey·levelKey Σ | 인력 포트폴리오 비용 |
| B7 | **T/S/R 신호등 Cost 신호 강화** | 기존 Resource축에 비용 임계(소진율>진척률+α) 결합 | 종합 개요 일관성 |

## 4. 기존 자산 (재사용 가능)

- 백엔드: `PortfolioAggregator.aggregateOneProject` — members(salary, effortMd, roleKey, levelKey), monthlyEffort, weeklyEffort, completionRate, scheduleRate, plannedTotalMd/actualTotalMd, totalSalary 이미 산출 → **비용 안분에 필요한 입력 대부분 이미 스냅샷에 존재**.
- 스냅샷 스키마: `portfolio_project_snapshot` (total_salary, members_json, monthly_effort_json 등).
- 프로젝트 상세 KPI: `getSummaryData` resolver / `ProjectDashboard.js`의 `SUM(pu.salary)`.
- 프론트 Portfolio: `tabs/CostTab.jsx`, `widgets/PortfolioSalaryByProject.jsx`, `PortfolioSalaryHistogram.jsx`, `utils/portfolioAggregate.js`(salaryByProject).

## 5. 설계 단계로 넘길 때 architect가 결정할 사항

1. **실집행 안분 기준** (a/b/c 중) — 2.절 참조. 핵심 단일 결정.
2. 비용은 **배치 스냅샷에 사전 적재**할지(across 집계 금지 원칙) vs 온디맨드. Portfolio는 스냅샷 필수, 프로젝트 상세는 단일 프로젝트라 온디맨드 가능.
3. 프로젝트 상세 비용 탭을 신규 resolver로 갈지, 기존 진척/리소스 리포트에 서브탭으로 붙일지.
4. **(A8) 이슈별 비용 안분 기준** — 멤버 비용을 이슈로 내릴 때 "멤버 전체 워크로그 대비 이슈 워크로그 비중"으로 안분. 1.절 실집행 안분 기준(a/b/c)과 정합 맞춰야 함. 데이터는 기존 이슈/인력 분석 리포트 재조립으로 충당(신규 페치 불필요), 단일 프로젝트 온디맨드 처리.
5. 통화 단위 표기(₩M 등)·반올림 규칙 일관화.
6. i18n 키 네임스페이스 (`cost.*` / `portfolio.cost.*`).

## 6. 범위 결정 기록

- 2026-06-09: 사용자가 **"목록만 확정, 구현 보류"** 선택. salary 정의 = "프로젝트 기간 총 금액(총 단가)" 확정.
- 2026-06-09(설계 후 추가 요청): **salary 입력 지점에 기준 문구 명시** 요구. 대상=프로젝트 인력 패널 salary 컬럼 + 백오피스 사용자 등록/수정 모달. 문구="프로젝트 기간 동안 해당 인원에게 들어가는 총 비용, 월급 아님". 설계서 §4-5 / §5(i18n `cost.salaryBasis.help`) / §7(M2-b)에 반영. 오입력(월급) 방지로 비용 데이터 신뢰 확보.
- 2026-06-09(보강): 개인 비용 분석 의미 검토 → **A4(인력별 비용 기여)·"인원별 성과" 미채택**. 근거: salary가 기간 고정 입력값이라 개인 단위 비용은 (a)시간경과 안분이면 소진율이 전원 동일 → salary 재표시(새 정보 0), (b)/(c) 공수·진척 안분이면 "워크로그 기록 행태"를 가치로 둔갑(비싼 사람=저성과 거짓 신호)로 붕괴. 의미 있는 인원 축(가동률/부하)은 인력 분석에 이미 존재하며 비용 비결합 유지. **역할/레벨 집계(A5/B6)는 개인이 아닌 "구성 분석"이라 유지.** 대신 **A8 이슈별 비용(안분) 신규 추가** — 인원이 아닌 작업 단위 해상도.
