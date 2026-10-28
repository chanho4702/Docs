# 통합 대시보드 + 프로젝트 상세 분석 메뉴 — 지표 논리 감사 + 개선 설계서

> feature-architect · 2026-06-11 · 슬러그 `analysis-review`
> 성격: **신규 기능 아님 — 기존 분석 화면 5종 + Portfolio의 지표·계산식 논리 감사 + 개선 설계.**
> 근거: 전부 실제 소스 Read/Grep 확인(파일:라인 명시). 참고 문서: `portfolio-dashboard/{02_backend_report,04_redesign_tsr,06_signal_thresholds}.md`, `cost-analysis/{01,03}`, `progress-page/01`.
> 제약 준수: git working tree 미커밋 변경 있음 → **코드 무수정(설계만)**. 성능 규칙(공통 페치 경로 무수정·전용 병렬 페처·KVS 캐시) 반영. 경계면 변경은 §4 표로 명시.

---

## 1. 감사 요약

### 1-1. 발견 건수

| 판정 | 건수 | 항목 |
|------|------|------|
| **오류(P1)** | 4 | A1 가동률 분모(전체기간 vs 경과기간), A2 actualMm 분모 20 하드코딩, A3 진행중 완성률=공수소진율 동조(이중계상), A4 cost scatter/KPI의 "예산" 오칭(BAC=총단가, 실제 예산 아님) |
| **의심(P2)** | 6 | B1 S축 todoRatio 임계 하드코딩(설정 미연동), B2 신호등 R(프로젝트내 평균) vs 글로벌 가동률 의미 충돌, B3 monthlyBurn 안분(scheduleRate 시간경과 vs md 실투입 혼합), B4 EAC 발산 가드 임계(BAC×3) 근거 부재, B5 costLevel amber 컷(+0.1) 하드코딩, B6 issueProgress가 plannedSeconds 없는 inProgress를 0% 처리(분모 제외와 비대칭) |
| **타당(OK)** | 핵심 다수 | CPI 동일식(백엔드↔프론트), effortTotals 초단위 1회변환(#8), mergeIntervals 글로벌 가동률 이중계상 제거, scheduleRate min(1) 캡, delayConfirmed 지연/조기 분리, plan line BAC 정확도달 |

### 1-2. 한 줄 총평

지표 **계산식 자체의 산술 오류는 거의 없다**(verify 리포트들이 잡아낸 수준은 정합). 진짜 문제는 **(a) 같은 개념(가동률·MM·완성률)이 화면마다 분모/정의가 달라 숫자가 안 맞는 비일관**, **(b) 임계값(S축·costLevel·EAC가드)의 근거 없는 하드코딩**, **(c) "예산"이라는 단어가 실제 예산이 아닌 "재직기간 총 인건비(BAC)"를 가리키는 용어 오인 위험**이다. P1은 분모 정의를 화면 간 통일하는 것이 핵심이고, 대부분 **백엔드 산식 1~2곳 + 프론트 라벨**로 고칠 수 있다.

---

## 2. 지표별 감사표 (화면 단위)

> 판정: ✅타당 / ⚠️의심 / ❌오류. 위치는 `파일:라인`.

### 2-A. 가동률 (Utilization) — 화면 간 정의 충돌 (가장 중요)

| 화면 | 지표/정의 | 계산식 위치 | 분모 | 판정 |
|------|-----------|-------------|------|------|
| Resource 분석 탭 | `pct = totalMd / effectiveMmDays` | `ResourceAnalysisTable.jsx:115` / 백엔드 `ResourceAnalysisService.js:132` | `effectiveMmDays = max(0.1, baseMmDays − leaveDeduction)`, `baseMmDays = getWorkdaysInRange(startDate, endDate)` = **사용자 선택 기간** 전체 근무일 | ✅ (사용자가 기간을 명시하므로 분모=그 기간이 자연스러움) |
| Portfolio 프로젝트 `avgUtilization` | 프로젝트 내 멤버 가동률 평균 | `PortfolioAggregator.js:327-336` | `eff = max(0.1, baseMmDays − deduction)`, `baseMmDays = totalWorkDays = getWorkdaysInRange(startDate, endDate)` = **프로젝트 전체 기간**(시작~종료, 미래 포함) | ❌ **P1-A1**: 진행 중 프로젝트는 분모가 "오늘까지 경과"가 아니라 "전체 기간(미래 포함)"이라 투입MD(과거만 존재)/전체기간 → **가동률 구조적 과소평가**. 일정률(`scheduleRate`)은 경과/전체로 올바르게 계산하면서, 가동률 분모만 전체기간이라 비대칭 |
| Portfolio 글로벌 `utilization` | 고유 인원, 참여 프로젝트 기간 **합집합** 근무일 − 연차 | `PortfolioAggregator.js:171-211` (`computeGlobalUtilization`) | 기간 합집합(`mergeIntervals`), 이중계상 제거 | ✅ 산식은 정교(이중계상 제거). 단 분모가 "합집합 전체기간"이라 **진행중 프로젝트 포함 시 동일하게 과소**(A1과 같은 뿌리) |
| 신호등 R level | `avgUtilization` band 분류 | `portfolioAggregate.js:268-272` | 위 avgUtilization 그대로 | ⚠️ **P2-B2**: 신호등 R = "프로젝트 내 평균 부하", 글로벌 가동률 = "이 사람 전사 부하". 두 값이 다른데 같은 "가동률" 라벨 → 사용자 혼동. 06_signal_thresholds.md가 이미 "의도된 차이"로 기록했으나 InfoTip 미반영 |

**핵심 P1-A1**: 진행 중 프로젝트의 가동률 분모는 **min(오늘, endDate)까지의 경과 근무일**이어야 의미가 맞는다(투입은 과거에만 쌓이므로). 현재 분모=전체 기간이라 진행 초기 프로젝트일수록 가동률이 0에 가깝게 찍힌다. Resource 분석 탭은 사용자가 기간을 직접 좁히므로 영향 적지만, Portfolio avgUtilization/글로벌은 항상 프로젝트 전체기간이라 항상 과소.

### 2-B. MM(Man-Month) — 분모 비일관

| 화면 | MM 정의 | 위치 | 판정 |
|------|---------|------|------|
| Resource 분석 탭 | `MM = totalMd / monthMm` (monthMm = 그 달 실제 근무일, 동적) | `ResourceAnalysisTable.jsx:113`, `ResourceAnalysisChart.jsx:309` | ✅ 근무일 기반(2026-05-27 재설계 일치) |
| Portfolio `actualMm` | `actualMm = actualTotalMd / 20` (**20 하드코딩**) | `PortfolioAggregator.js:321` | ❌ **P1-A2**: 월 20영업일 가정 하드코딩. Resource 탭은 동적 monthMm(달마다 19~23일)인데 Portfolio는 고정 20 → 같은 프로젝트의 MM이 화면 간 불일치. `02_backend_report.md §4.1`도 이 임시값을 인정("정밀 MM 분모 필요 시 settings.monthRate 연동 가능") |

### 2-C. 완성률 (Completion) — 진행중 이슈 처리

| 지표 | 정의 | 위치 | 판정 |
|------|------|------|------|
| `issueProgress(inProgress)` | `min(actualSeconds/plannedSeconds, 1)` | `ProgressCalculator.js:53-59` | ❌ **P1-A3(설계상 알려진 한계)**: 진행중 완성률 = 공수 소진율. 그 결과 진단 규칙2(공수 vs 완성)가 진행중 이슈에서 항상 0 기여 → 규칙2 침묵. `progress-page/01 §6 #2`가 "MVP 수용·UI 과신금지 명시"로 박제. 현재 `ProgressBars.jsx:73` 툴팁에 안내 있음 → **부분 완화됨**. 잔여: Portfolio `completionRate`도 동일 산식이라 신호등 T/cost CPI가 모두 "공수=완성" 가정 위에 섬 |
| `issueProgress(inProgress, plannedSeconds==null)` | → `0` 반환 | `ProgressCalculator.js:57` | ⚠️ **P2-B6**: plannedSeconds 없는 진행중 이슈를 **진행률 0**으로 반환하지만, `computeCompletion`(`:70`)에선 동일 이슈를 **분모에서 제외**. 두 함수 호출 맥락이 달라 직접 모순은 아니나(completion은 가중평균이라 제외, issues[]의 progressRate 표시는 0), 화면 E의 progressRate=0%로 보이는 무계획 진행중 이슈가 "정체"로 오인될 수 있음 |
| `computeCompletion` 가중평균 | `Σ(progress×planSec)/Σ(planSec)` | `ProgressCalculator.js:66-76` | ✅ 평균의 평균 아님(공수가중). 분모 0 가드 있음 |

### 2-D. 일정률 (Schedule)

| 지표 | 정의 | 위치 | 판정 |
|------|------|------|------|
| `scheduleRate` | `min(경과근무일/전체근무일, 1)` | `ProgressCalculator.js:100-103`, 서비스 `:99-105` | ✅ 경과=`min(today,end)`, 전체=start~end. min(1) 캡. 진척율·cost·portfolio 3곳 **동일 산식**(일관) |
| `diffPercentPoint` | `(완성−일정)×100` | `ProgressCalculator.js:179-182` | ✅ 일관. 신호등 T·진척율 헤더·riskScore 모두 이 값 사용 |

### 2-E. 비용 (Cost)

| 지표 | 정의 | 위치 | 판정 |
|------|------|------|------|
| `plannedBudget`(BAC) | `= totalSalary` (Σ members salary = 재직기간 총 단가) | `CostCalculator.js:33`, KpiHeader 라벨 "계획 예산" | ❌ **P1-A4(용어)**: `salary`는 "기간 총단가"(cost-analysis 결정)인데 화면 라벨이 "예산(Budget)"·"BAC". 실제 사업 예산이 아니라 "투입 인건비 총액"이므로 **"계획 예산"이 아니라 "계획 인건비"** 가 정확. Portfolio CostKpi도 "totalBudget" 라벨(`PortfolioCostKpi.jsx:15`). 잘못된 의사결정(예산 대비 운운) 유발 위험 |
| `actualCost`(AC) | `totalSalary × scheduleRate` | `CostCalculator.js:18-22` | ✅ 시간경과 안분. 단 "시간 경과 = 비용 발생" 가정은 **실제 투입(워크로그)과 무관** — 인력이 놀아도 비용 발생으로 계산. 의도된 단순화(설계 §1)이나 InfoTip 명시 필요 |
| `CPI = EV/AC` | `= completionRate/scheduleRate` | `CostCalculator.js:55`, 프론트 `projCpi` `portfolioAggregate.js:327` | ✅ 백엔드↔프론트 **동일식**(verify 확인). 가드 일치 |
| `EAC = BAC/CPI` 발산가드 | `eac > BAC×3 → "예측불가"` | `CostEvmCard.jsx:31` | ⚠️ **P2-B4**: BAC×3 임계 근거 없음(하드코딩). CPI 0.33 미만이면 발산 처리인데 왜 3배인지 불명. 설정/주석 근거 없음 |
| `monthlyBurnRate` 안분 | `actual(=salary×scheduleRate)`를 **monthlyEffort(md) 비중**으로 월 안분 | `portfolioAggregate.js:431-456`, 백엔드 `allocateMonthlyCost` | ⚠️ **P2-B3**: AC는 "시간경과(scheduleRate)" 기반인데, 월 안분 가중치는 "실투입 md"라 **두 기준이 섞임**. 워크로그 없는 달은 비용 0, 워크로그 몰린 달은 비용 과다 → 월별 곡선이 실제 인건비 발생(시간경과)과 모양 다름. cost-analysis 설계 §A3가 채택한 방식이나 논리적으로 미스매치 |
| cost `costLevel` amber 컷 | `scheduleRate > completionRate + 0.1` | `portfolioAggregate.js:338` | ⚠️ **P2-B5**: +0.1 하드코딩(설정 미연동). T축은 settings.progressThreshold 연동인데 cost amber만 별도 상수 |

### 2-F. 신호등 임계 (TSR + Cost)

| 축 | 임계 | 위치 | 설정연동 | 판정 |
|----|------|------|----------|------|
| T | diagnosisStatus(progressThreshold ±5%p) | `ProgressCalculator.js:185` (read-time) | ✅ | ✅ |
| S | todoRatio 0.3 / 0.6 | `portfolioAggregate.js:265` | ❌ 하드코딩 | ⚠️ **P2-B1**(알려진 후보, 06_signal_thresholds.md). T·R과 비일관 |
| R | avgUtilization band 0.7/1.1/1.3 | `portfolioAggregate.js:268-272` + 응답 `utilizationBands` | ✅ settings 연동 | ✅ (단 A1 분모 문제 상속) |
| Cost | cpi<1 red / sr>cr+0.1 amber | `portfolioAggregate.js:333-339` | ❌ 하드코딩 | ⚠️ P2-B5 |

### 2-G. 평균의 평균 / 가중치 / 경계 점검 (횡단)

| 점검 항목 | 결과 |
|-----------|------|
| 평균의 평균 왜곡 | `avgUtilization`(`Aggregator:334`)은 멤버별 가동률의 **단순평균**(공수 가중 아님) → 1MD 투입자와 100MD 투입자가 동일 가중. ⚠️ 의심(B2 연장). 글로벌 utilization은 인원별 개별값이라 평균의평균 아님 ✅ |
| 분모 0 가드 | scheduleRate(`:101`)·completion(`:74`)·CPI(`:55`)·todoRatio(`:264`)·monthlyBurn(`:448`) 전부 가드 있음 ✅ |
| 주말/공휴일 | `workday.js` 일관 사용(workRatio 반영) ✅ |
| 부분투입 인력 | 연차/반차 `computeLeaveDeductionMap`(`ResourceAnalysisService.js:35`)로 차감 ✅. 단 가동률 분모에만 반영, 완성률엔 무관(정상) |
| 백엔드 스냅샷 vs 프론트 재집계 정합 | cost는 동일식(verify ✅). tsrSignals의 cost 필드는 프론트가 `scheduleRate/completionRate`로 재계산 = 백엔드 CostCalculator와 동일 ✅. **단 actualMm(/20)·avgUtilization(전체기간 분모)는 백엔드 스냅샷 값을 프론트가 그대로 신뢰** → A1·A2 오류가 그대로 전파 |

---

## 3. 개선 설계 (P1 → P2 → P3)

> 각 항목: 대상 파일 · 변경 내용 · 경계면 영향 · 백엔드/프론트 구분.

### P1 — 논리 오류 수정 (숫자가 틀리는 것)

#### P1-1. 가동률 분모를 "경과 기간"으로 통일 (A1) — 백엔드

- **문제**: Portfolio `avgUtilization`·글로벌 `utilization` 분모가 프로젝트 전체기간(미래 포함) → 진행중 프로젝트 가동률 과소.
- **수정**: `PortfolioAggregator.js`에서 가동률 분모 산정 시 `endDate` 대신 **`elapsedEnd = min(today, endDate)`** 사용.
  - `aggregateOneProject` (`:324-336`): `baseMmDays`를 `getWorkdaysInRange(startDate, elapsedEnd, holidayMap)`로 변경(현재는 `totalWorkDays` = 전체기간 재사용). `elapsedEnd`는 일정률 계산에서 이미 산출됨(`:309`) → 재사용.
  - `computeGlobalUtilization` (`:171-211`): 각 인원 기간 합집합 세그먼트의 `seg.end`를 `min(seg.end, today)`로 클램프 후 근무일 계산. **`globalInput.endDate`를 `min(project.endDate ?? today, today)`로 넘기면** 합집합 단계 무수정으로 해결(이미 `:184` `projEnd = proj.endDate ?? today()`이므로, 미래 endDate만 today로 클램프하는 1줄).
- **경계면 영향**: 응답 shape **무변경**(avgUtilization·utilization 값만 정확해짐). 프론트 무수정.
- **성능**: 배치 내부 계산만 변경, 페치 경로 무수정 → 규칙 준수.
- **검증**: `PortfolioAggregator.test.js`에 "진행중 프로젝트(endDate 미래) 가동률 분모=경과근무일" 케이스 추가.
- **주의**: 종료된 프로젝트(today > endDate)는 분모=전체기간 그대로(영향 없음). 시작 전(today < startDate)은 elapsed=0 → 가동률 0 또는 분모 max(0.1) 가드로 0 처리(현행 유지).

#### P1-2. actualMm 분모를 동적 근무일로 (A2) — 백엔드

- **문제**: `actualMm = actualTotalMd / 20`(하드코딩) ≠ Resource 탭 `totalMd / monthMm`(동적).
- **수정**: `PortfolioAggregator.js:321`. 프로젝트 기간(`startDate~elapsedEnd`)의 **월별 근무일 평균** 또는 **기간 총근무일 기준 MM**으로 환산.
  - 권고(단순·일관): `actualMm = actualTotalMd / avgMonthWorkdays`, `avgMonthWorkdays = getMonthMmMap(startDate, elapsedEnd, holidayMap)`의 평균. `getMonthMmMap`은 이미 `workday.js`에 존재(Resource가 사용) → import만.
  - 대안(최소변경): settings에 `monthWorkdays`(기본 20) 신설 후 `actualMm = actualTotalMd / settings.monthWorkdays`. 단 동적이 아니라 Resource와 여전히 미세 불일치.
- **권고**: 동적(getMonthMmMap 평균). Resource 탭과 정의 통일.
- **경계면 영향**: 응답 `projects[].actualMm` **값만 변경**(shape 동일). 프론트 `summarizeSelection`(`:36`)이 그대로 합산 → 무수정.
- **검증**: 골든 테스트 actualMm 기대값 갱신.

#### P1-3. 완성률 "공수=완성" 동조 — 화면 명시 강화 (A3) — 프론트 only

- **문제**: 진행중 완성률=공수소진율이라 CPI·신호등 T가 "공수 진행=완성"으로 낙관. 산식 교체는 데이터(상태전이/처리율) 부재로 불가(progress-page 확정).
- **수정(데이터 한계 내 최선)**:
  - 진척율 헤더(`ProgressHeader.jsx`)·Portfolio 신호등 InfoTip에 **"완성률은 진행중 이슈를 공수 소진율로 근사 — 실제 산출물 완성도와 다를 수 있음"** 명시(현재 ProgressBars 툴팁만 있음 → 헤더 완성률·CPI·신호등T로 확대).
  - cost EVM 카드 CPI InfoTip에 동일 한계 1줄 추가(CPI가 완성률 의존).
- **경계면 영향**: 없음(i18n 키 추가만).
- **대안(후속, 범위 외)**: Jira "진행률%" custom field 도입 → manifest 변경. 이번 범위 제외(progress-page Q1 기록).

#### P1-4. "예산" → "계획 인건비" 용어 정정 (A4) — 프론트 only (i18n)

- **문제**: `salary`=재직기간 총단가인데 라벨이 "예산/Budget/BAC". 실제 예산 아님.
- **수정**: i18n 라벨 교체(키 값만, 키 이름은 유지해 코드 무수정).
  - `cost.kpi.plannedBudget`: "계획 예산" → **"계획 인건비"** (EVM 맥락 위해 "(BAC)" 병기 옵션).
  - `portfolio.cost.kpi.totalBudget`: "총 예산" → **"총 계획 인건비"**.
  - 관련 InfoTip(`cost.guide.bacInterp` 등)에 "= Σ 멤버 재직기간 총단가, 실제 사업예산 아님" 1줄.
- **경계면 영향**: 없음(locales/kr·en 값 변경 + merge).
- **주의**: EVM 표준 용어(BAC/EAC)는 그대로 두되 한국어 라벨만 "인건비" 기준으로. 약어는 InfoTip에서 설명.

### P2 — 일관성 / 설정 연동

#### P2-1. S축 todoRatio 임계 설정 연동 (B1) — 백엔드(settings) + 프론트

- **수정**:
  - settings KVS에 `scopeTodoAmberRatio`(0.3)·`scopeTodoRedRatio`(0.6) 추가. `SeedData.js`·`SettingService.updateSettingService` 병합(가동률 band가 이미 같은 패턴 — `02_backend_report.md §2 수정 SettingService`).
  - `getPortfolioDashboardService` 응답에 `scopeBands: { amber, red }` 추가(utilizationBands와 동형). **신규 필드 1개**.
  - `portfolioAggregate.js:tsrSignals`가 `bands.scopeAmber/scopeRed` 파라미터 받아 사용(현재 0.3/0.6 하드코딩 `:265`).
  - `PortfolioTsrSignalTable`이 `scopeBands`를 `tsrSignals`에 전달.
- **경계면 영향**: §4 계약 표 #1.

#### P2-2. 신호등 R / 글로벌 가동률 의미 차이 InfoTip 명시 (B2) — 프론트 only

- **수정**: 신호등 R Dot 툴팁·overview InfoTip에 "이 신호는 **프로젝트 내 평균 부하**(전사 가동률과 다름)" 명시. Resource 탭 가동률 분포 위젯엔 "전사 합집합 기준" 명시.
- **경계면 영향**: 없음(i18n).

#### P2-3. costLevel amber 컷 설정화 (B5) — 백엔드(선택) + 프론트

- **수정**: `+0.1` 상수를 settings `costBurnGapAmber`(0.1)로. 단 cost는 프론트 재집계라 settings를 CostTab까지 전달해야 함 → 비용 대비 효익 낮음. **권고: P3로 강등하거나, S축 설정화(P2-1)에 묶어 같은 `getSettingData` 경로로 전달**.

#### P2-4. monthlyBurn 안분 기준 일관화 (B3) — 프론트 + 백엔드 문서화

- **문제**: AC(시간경과)를 md(실투입)로 안분 → 기준 혼합.
- **수정 옵션**:
  - (a) **시간경과 안분**: AC를 월별 경과 근무일 비중으로 안분(scheduleRate 정의와 일관). `monthlyBurnRate`(`:431`)·`allocateMonthlyCost`를 근무일 비중으로 교체.
  - (b) **현행 유지 + InfoTip 명시**: "실투입 공수 비중으로 안분 — 인건비 발생 시점과 다를 수 있음".
- **권고**: (b) 우선(저비용), (a)는 EVM 정합 원하면 후속. 결정 필요(§5 열린질문).

#### P2-5. issueProgress null-plan 진행중 표시 일관화 (B6) — 프론트 only

- **수정**: 화면 E(`ProgressRiskTable`)에서 plannedMd null 진행중 이슈의 progressRate를 "0%"가 아니라 **"측정불가(-)"** 로 표기(completion 분모 제외와 의미 일치). `buildIssuesFromNorm`은 progressRate 0 반환하나, 프론트가 `plannedMd==null` 시 "-" 표시.
- **경계면 영향**: 없음(프론트 렌더 분기).

### P3 — UX / 디자인 / 정보 위계 개선

> 프론트 전용. 레이아웃·시각화·로딩/빈 상태.

#### P3-1. 신호등 테이블 정보 위계 (PortfolioTsrSignalTable)
- 현재 신호등 4점(T/S/R/Cost) + 7개 수치 컬럼이 한 행에 빽빽. **위험 행 상단 정렬**(red 신호 개수 desc 기본 정렬) 추가 → "위험한 프로젝트 먼저".
- 신호등 점에 **색맹 보조**(점 안에 ▲/●/■ 또는 글자) — 현재 색만으로 구분.
- 빈 상태: `aggregateStatus==='EMPTY'`일 때 "재집계 안내 + 트리거 버튼" CTA(현재 단순 EmptyState).

#### P3-2. 진척율 S-curve 시각화 (ProgressSCurve)
- 계획선(점선)·실제선(실선) 외 **오늘 이후 실제선 비연장**은 OK. **"진행 격차 영역"**(계획−실제 사이 음영) 추가로 지연 폭 시각화.
- 완성진척 토글이 데이터 한계로 영구 비활성(주석 처리됨 `:153`) → **죽은 토글 자리 제거**(현재 빈 div), 대신 InfoTip에 "공수 누적 기준" 명시.

#### P3-3. cost EVM 카드 (CostEvmCard)
- CPI/EAC/ETC 3타일이 숫자만 → **CPI 게이지**(1.0 기준선) 또는 색 신호. EAC vs BAC **막대 비교** 1개 추가로 초과 폭 직관화.
- "예측 불가"(EAC 발산) 시 회색 처리 + 사유 툴팁.

#### P3-4. 로딩/빈 상태 표준화 (횡단)
- 분석 5종 + Portfolio 위젯의 로딩 스켈레톤·빈 상태 문구 **공통 컴포넌트화**(현재 위젯마다 제각각: ChartBox empty, EmptyState, 텍스트). `WidgetCard`에 `loading`/`empty` prop 표준화.
- `noPeriod`(기간 미설정 프로젝트) 안내를 분석 탭 전반 통일(cost는 있음, progress/resource 확인).

#### P3-5. 화면 간 지표 정의 "용어집" 링크
- 가동률/MM/완성률/CPI 정의가 화면마다 미묘히 다르므로(본 감사 핵심), 각 화면 헤더 InfoTip에서 **공통 용어 정의**를 동일 문구로 노출(P1-3·P1-4·P2-2의 문구를 i18n 공유 키로).

---

## 4. 경계면 계약 표 (응답 shape 변경 항목만)

> 변경되는 것만. 대부분 P1은 **값만 변경(shape 동일)**이라 표에 없음 — backend는 값 정확화, frontend 무수정.

| # | resolver 함수 | 입력 | 변경 내용 (응답 shape) | 대응 프론트 |
|---|--------------|------|------------------------|-------------|
| 1 | `getPortfolioDashboard` | `{}` | **추가**: 루트에 `scopeBands: { amber:0.3, red:0.6 }` (settings 연동, utilizationBands와 동형). 기존 필드 전부 유지 | `PortfolioDashboardPage`가 `scopeBands`를 `ComparisonTabs`→`PortfolioTsrSignalTable`→`tsrSignals(projects, {...utilizationBands, scopeAmber, scopeRed})` 전달. 쿼리키 `portfolioKeys` 무변경 |
| 2 | (값 변경, shape 동일) `getPortfolioDashboard` | `{}` | `projects[].avgUtilization`(P1-1)·`projects[].actualMm`(P1-2) **값 정확화**. 필드명·타입 무변경 | 프론트 **무수정**(tsrSignals·summarizeSelection 그대로). 골든 픽스처 기대값만 갱신 |
| 3 | (선택, P2-3 묶을 시) `getPortfolioDashboard` | `{}` | **추가(옵션)**: `costBands: { burnGapAmber:0.1 }` | CostTab→cost 위젯에 전달. P3 강등 가능 |

> **P1-3·P1-4·P2-2·P2-5·P3 전부 경계면 무변경**(i18n·렌더링만). 백엔드 변경은 **#1(신규 1필드)+#2(값 정확화)** 뿐.

---

## 5. 구현 작업 분해

### Backend (먼저)

- [ ] **P1-1** `PortfolioAggregator.js`: 가동률 분모를 `elapsedEnd=min(today,endDate)`로. `aggregateOneProject` baseMmDays 계산(`:324`) + `globalInput.endDate` 클램프(`:361,388`). `computeGlobalUtilization` seg.end 클램프 확인.
- [ ] **P1-2** `PortfolioAggregator.js:321`: `actualMm = actualTotalMd / avg(getMonthMmMap(start, elapsedEnd))`. `getMonthMmMap` import.
- [ ] **P2-1** settings 확장: `SeedData.js`(scopeTodoAmberRatio 0.3 / scopeTodoRedRatio 0.6), `SettingService.updateSettingService` 병합, `getPortfolioDashboardService` 응답 `scopeBands` 추가, `manifest.yml` settings entity 속성 2개.
- [ ] **(선택) P2-3/P2-4** settings costBands / monthlyBurn 안분 기준 결정 후 반영.
- [ ] jest: `PortfolioAggregator.test.js`에 진행중 프로젝트 가동률 분모·actualMm 동적 케이스 추가. `npm test` 통과.

### Frontend (백엔드 후)

- [ ] **P2-1** `PortfolioDashboardPage.jsx`→`ComparisonTabs`→`PortfolioTsrSignalTable`: `scopeBands` prop 전달, `tsrSignals` 호출에 `scopeAmber/scopeRed` 병합. `portfolioAggregate.js:tsrSignals`가 bands에서 읽도록(하드코딩 `:265` 제거).
- [ ] **P1-3·P1-4·P2-2·P2-5** i18n 라벨/InfoTip 정정: `locales/kr/cost.json`·`locales/en/cost.json`(예산→인건비, CPI/AC 한계 문구), `locales/kr/portfolio.json`·`locales/en/portfolio.json`(totalBudget 라벨, 신호등 R/글로벌 가동률 구분 문구, 완성률 근사 안내). `cd static/ui && npm run merge`.
- [ ] **P2-5** `ProgressRiskTable.jsx`: plannedMd null 진행중 progressRate "-" 표기.
- [ ] **P3-1** `PortfolioTsrSignalTable.jsx`: red 신호 desc 기본정렬 + 색맹 보조 마커 + EMPTY CTA.
- [ ] **P3-2** `ProgressSCurve.jsx`: 격차 음영 + 죽은 토글 div 정리.
- [ ] **P3-3** `CostEvmCard.jsx`: CPI 게이지/EAC vs BAC 막대.
- [ ] **P3-4** `WidgetCard` loading/empty prop 표준화 + 분석탭 적용.
- [ ] 프론트 jest(`portfolioAggregate.test.js` tsrSignals scopeBands 스냅샷 갱신) + `npm run build` 통과.

### i18n 키 추가 목록 (locales/kr·en, merge 필수)

```jsonc
// cost.json
"cost.kpi.plannedBudget": "계획 인건비",            // (기존 "계획 예산")
"cost.guide.bacInterp": "...= Σ 멤버 재직기간 총단가. 실제 사업예산이 아닌 투입 인건비 총액",
"cost.evm.cpiHint": "...완성률은 진행중 이슈를 공수 소진율로 근사 → CPI 낙관 가능",
"cost.evm.acHint": "...실집행 = 총 인건비 × 시간경과율. 실제 워크로그 투입과 무관",

// portfolio.json
"portfolio.cost.kpi.totalBudget": "총 계획 인건비",  // (기존 "총 예산")
"portfolio.overview.tip.resource": "...프로젝트 내 평균 가동률(전사 가동률과 다름)",
"portfolio.overview.completionNote": "완성률은 진행중 이슈를 공수 소진율로 근사",
"portfolio.utilization.scopeNote": "...전사 기간 합집합 기준 고유 인원 가동률"
// + scopeBands 라벨(설정 화면용은 SettingPage i18n 별도)
```

---

## 6. 열린 질문 (사용자 확정 필요)

| # | 질문 | 권고 |
|---|------|------|
| Q1 | P1-1 가동률 분모 경과기간 전환 — 종료 프로젝트는 전체기간 유지(현행)가 맞나? | 예(종료=경과=전체). 진행중만 영향 |
| Q2 | P1-2 actualMm 분모: 동적 getMonthMm 평균 vs settings 고정값 | 동적(Resource 탭 일관) 권고 |
| Q3 | P1-4 "예산"→"인건비" 용어 전면 교체 vs "인건비(예산)" 병기 | 전면 교체 권고(오인 방지) |
| Q4 | P2-4 monthlyBurn 안분: 시간경과(a) vs 현행 md(b)+명시 | (b) InfoTip 명시 우선, (a)는 후속 |
| Q5 | P2-3 costLevel amber 설정화 진행 vs P3 강등 | P3 강등(효익 낮음) |
| Q6 | P1-3 진행률 custom field 도입(완성률 정밀화)은 이번 범위 외 확정? | 범위 외(후속) |

> 응답 없으면 권고안으로 진행하되, P1-1/P1-2(값 정확화)는 **숫자 오류 수정이므로 무조건 반영**, 나머지는 보수적(현행+명시) 해석.
