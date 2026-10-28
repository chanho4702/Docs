# 종합 개요 T/S/R 신호등 — 색 기준(임계) 정리

> 대상: 통합 대시보드 "종합 개요" 행의 프로젝트별 신호등(🟢🟡🔴)
> 색 판정 로직: `static/ui/src/pages/portfolio/utils/portfolioAggregate.js` → `tsrSignals()` (line 244~)
> 일정 진단: `src/resolver/projectProgress/ProgressCalculator.js` → `diagnoseStatus()` (line 185~)
> 기준: 2026-06-05 코드 기준

종합 개요는 프로젝트 1행에 **Time / Scope / Resource 3개 신호등 점**을 찍어 "어느 프로젝트가 어느 축에서 위험한가"를 한눈에 보여준다. 각 점의 색은 아래 임계로 결정된다.

---

## 1. T — Time(일정)

- **판정 기준**: `diffPercentPoint` (= 완성률 − 일정률, 단위 %p) 에 진단(`diagnoseStatus`) 적용
- **임계값**: `settings.progressThreshold` (기본 **5 %p**)

| 조건 | 진단(diagnosisStatus) | 색 |
|------|----------------------|-----|
| diff ≤ −임계 (기본 −5%p) | `delayed` | 🔴 red |
| −임계 < diff < 0 | `caution` | 🟡 amber |
| diff ≥ 0 | `normal` | 🟢 green |

- **의미**: 완성이 일정보다 임계 이상 뒤지면 빨강, 조금 뒤지면 노랑, 일정을 따라가거나 앞서면 초록.
- **설정 연동**: ✅ `progressThreshold` 로 조정 가능.

---

## 2. S — Scope(범위)

- **판정 기준**: `todoRatio` = 대기 이슈 ÷ 전체 이슈 `(done + inProgress + todo)`
- **임계값**: **0.3 / 0.6** (코드 상수)

| 조건 | 색 |
|------|-----|
| todoRatio ≥ 0.6 | 🔴 red |
| 0.3 ≤ todoRatio < 0.6 | 🟡 amber |
| todoRatio < 0.3 | 🟢 green |

- **의미**: 남은(대기) 이슈 비중이 60% 이상이면 빨강, 30% 미만이면 초록.
- **설정 연동**: ❌ **하드코딩** (`portfolioAggregate.js` 상수). T·R 과 달리 설정에 안 묶여 있음 → 비일관 지점.
- 전체 이슈 0건이면 todoRatio = 0 → green (NaN 가드).

---

## 3. R — Resource(자원)

- **판정 기준**: `avgUtilization` (프로젝트 **내** 평균 가동률) + 가동률 band
- **임계값(band)**: `settings.utilizationUnderBand / OverBand / RedBand` (기본 **0.7 / 1.1 / 1.3**), 응답 `utilizationBands` 로 전달

| 조건 | 색 |
|------|-----|
| util ≥ utilRed (1.3) | 🔴 red (심한 과부하) |
| util < utilUnder (0.7) **또는** util > utilOver (1.1) | 🟡 amber (과소 or 과부하) |
| utilUnder ≤ util ≤ utilOver (0.7~1.1) | 🟢 green (적정) |

- **설정 연동**: ✅ 가동률 기준 설정(EtcSetting)에서 under/over/red 조정 가능.
- ⚠️ **주의**: 여기 `avgUtilization` 은 **프로젝트 내 평균**이라, Resource 탭의 **종합(전사 기간 합집합) 가동률과 다른 값**이다. 신호등 R = "이 프로젝트 안에서 평균적으로 과부하인가", 종합 가동률 = "이 사람이 전사적으로 과부하인가".

---

## 4. 요약 — 기준값 출처

| 축 | 판정 지표 | 임계값(기본) | 출처 | 설정 조정 |
|----|-----------|--------------|------|-----------|
| **T** 일정 | diffPercentPoint(완성−일정 %p) | ±5 %p | `settings.progressThreshold` | ✅ 가능 |
| **S** 범위 | todoRatio(대기÷전체) | 0.3 / 0.6 | 코드 상수 | ❌ 하드코딩 |
| **R** 자원 | avgUtilization(프로젝트 평균 가동률) | 0.7 / 1.1 / 1.3 | `settings.utilization*Band` | ✅ 가능 |

### 색 의미 (공통)
- 🔴 red = 위험 · 🟡 amber = 주의 · 🟢 green = 정상

### 알아둘 점
- 신호등 색은 **프론트 `tsrSignals` 가 read-time 계산** (백엔드는 diffPercentPoint·issueSummary·avgUtilization 등 원천값만 내려줌).
- T 의 `diagnosisStatus` 는 백엔드가 이미 `progressThreshold` 적용해 내려준 값을 그대로 매핑(프론트가 일정 임계 재발명 안 함).
- **개선 후보**: S축 todoRatio 임계(0.3/0.6)만 설정 미연동 → 필요 시 `settings` 로 빼서 T·R 과 일관화 가능.

---

## 5. 코드 위치

| 항목 | 파일 | 함수/라인 |
|------|------|-----------|
| 신호등 색 판정 | `static/ui/src/pages/portfolio/utils/portfolioAggregate.js` | `tsrSignals()` (244~) |
| 일정 진단(delayed/caution/normal) | `src/resolver/projectProgress/ProgressCalculator.js` | `diagnoseStatus()` (185~) |
| 신호등 위젯(렌더) | `static/ui/src/pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | - |
| 가동률 band 응답 | `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `utilizationBands` |
