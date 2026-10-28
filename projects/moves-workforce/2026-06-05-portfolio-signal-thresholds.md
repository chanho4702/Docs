---
type: reference
project: "[[moves-workforce]]"
tags: [forge, portfolio-dashboard, tsr, signal, threshold, settings]
date: 2026-06-05
status: code-reference
---

# 2026-06-05 — 전사 대시보드 종합개요 T/S/R 신호등 색 기준(임계) 정리

상위: [[moves-workforce]] · 선행: [[2026-06-02-portfolio-iteration]] · 관련: [[2026-05-29-progress-page]]

> 대상: 통합 대시보드 "종합 개요" 행의 프로젝트별 신호등(🟢🟡🔴) 3점(Time/Scope/Resource).
> 색 판정은 **프론트 `tsrSignals()` 가 read-time 계산**(백엔드는 diffPercentPoint·issueSummary·avgUtilization 등 원천값만 내려줌).
> 코드 기준: 2026-06-05. 단일 진실: `_workspace/portfolio-dashboard/06_signal_thresholds.md`.

## 1. 3축 임계 기준표

| 축 | 판정 지표 | 임계값(기본) | 출처 | 설정 조정 |
|----|-----------|--------------|------|-----------|
| **T** 일정 | `diffPercentPoint`(완성률−일정률 %p) | ±5 %p | `settings.progressThreshold` | ✅ 가능 |
| **S** 범위 | `todoRatio`(대기÷전체 이슈) | 0.3 / 0.6 | **코드 상수(하드코딩)** | ❌ 불가 |
| **R** 자원 | `avgUtilization`(프로젝트 **내** 평균 가동률) | 0.7 / 1.1 / 1.3 | `settings.utilization*Band` | ✅ 가능 |

색 의미(공통): 🔴 위험 · 🟡 주의 · 🟢 정상.

### T — 일정
- `diffPercentPoint`에 `diagnoseStatus` 적용. diff ≤ −임계(−5%p) → `delayed`🔴 / −임계<diff<0 → `caution`🟡 / diff≥0 → `normal`🟢.
- 백엔드가 이미 `progressThreshold` 적용해 `diagnosisStatus`를 내려주고, **프론트는 그 값을 그대로 매핑**(일정 임계를 프론트가 재발명 안 함).

### S — 범위
- `todoRatio` = 대기 ÷ 전체`(done+inProgress+todo)`. ≥0.6 🔴 / 0.3~0.6 🟡 / <0.3 🟢.
- 전체 0건이면 todoRatio=0 → green (NaN 가드).
- ⚠️ **S축만 설정 미연동(하드코딩)** — T·R은 settings에 묶였는데 S만 `portfolioAggregate.js` 상수. **비일관 지점이자 유일한 개선 후보**(필요 시 settings로 빼서 일관화).

### R — 자원
- `avgUtilization`(프로젝트 내 평균) + band. util≥1.3 🔴(심한 과부하) / util<0.7 또는 >1.1 🟡(과소·과부하) / 0.7~1.1 🟢(적정).
- band는 응답 `utilizationBands{utilUnder,utilOver,utilRed}`로 전달(설정 EtcSetting에서 조정, [[2026-06-02-portfolio-iteration]] §2~3).
- ⚠️ **혼동 주의**: 신호등 R의 `avgUtilization`은 **프로젝트 내 평균**이라 Resource 탭의 **종합(전사 기간 합집합) 가동률과 다른 값**. R = "이 프로젝트 안에서 평균적으로 과부하인가", 종합 = "이 사람이 전사적으로 과부하인가". → 가동률 두 종류 분리는 [[2026-06-02-portfolio-iteration]] §4.

## 2. 코드 위치

| 항목 | 파일 | 함수/라인 |
|------|------|-----------|
| 신호등 색 판정 | `static/ui/src/pages/portfolio/utils/portfolioAggregate.js` | `tsrSignals()` (244~) |
| 일정 진단(delayed/caution/normal) | `src/resolver/projectProgress/ProgressCalculator.js` | `diagnoseStatus()` (185~) |
| 신호등 위젯(렌더) | `static/ui/src/pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | - |
| 가동률 band 응답 | `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `utilizationBands` |

## 3. 교훈

- **신호등 색은 프론트 read-time 계산**이 원칙 — 백엔드는 원천 지표만 내리고, 색 임계는 프론트가 적용(단, T의 임계는 백엔드가 선적용해 내려줌 → 일정 기준이 진척율 페이지와 일관 유지).
- **임계는 settings로 빼서 단일 진실화**가 정석인데(R·T는 그렇게 됨), S축만 하드코딩이라 비일관. "3축 중 2축만 설정화"처럼 절반만 일관화된 상태를 발견하면 나머지도 빼는 게 맞다.
