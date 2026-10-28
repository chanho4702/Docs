---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, man-month, calculation, redesign]
date: 2026-05-27
---

# 2026-05-27 — Man-Month(MM) 계산 재설계

상위: [[moves-workforce]] · 이전: [[2026-05-26-resource-perf]] · 다음: [[2026-05-29-progress-page]]

## 1. 배경 / 문제

기존 인력(Resource) 분석의 MM 계산이 **달력 날짜 비례식**으로 되어 있어 단기 구간에서 값이 왜곡됐다.

- 관리자가 `monthRate`(1MM = N일)를 수동 입력 → 그 값을 **달력 31일에 균등 분배**
- 짧은 기간일수록 분모가 비현실적으로 작아짐
- 게다가 `MM 컬럼`과 `가동률 bar`가 사실상 **같은 값(÷100 차이)** 이었고, 그 값(가동률)에 MM이라는 절대 단위 이름을 붙인 것이 근본 오류

### 증상 예시 (monthRate=25, 5월 기준)

| 구간 | 기존 base | 실제 근무일 |
|------|------|------|
| 오늘 (평일 1일) | 25×1/31 = 0.8 | 1.0 |
| 이번주 (평일 3일) | 25×3/31 = 2.4 | 3.0 |

→ 이번주 1.6MD·가용 1.4 → **1.14 "MM"** (3일 만에 1달치 초과라는 비상식적 값)

또한 base는 "달력일당 0.81MD"인데 공휴일·연차 차감은 "하루 1.0MD"로, **per-day 단위가 불일치**했다.

---

## 2. 새 설계

**핵심: 1MM = 그 달의 실제 근무일(평일 − 공휴일).** 휴일 관리에 등록된 공휴일 + 캘린더로 **자동 산출**. 관리자 수동 입력 제거.

```
하루 근무가치(d):
  주말(토·일)       → 0
  평일·공휴일(r)    → r   (r=workRatio: 0=휴무, 0.5=반휴, 1=정상)
  평일·비공휴일     → 1

월 1MM(일)   = Σ 그 달 하루근무가치
월 1MM(시간) = 월1MM(일) × hourRate
기간 base MD = Σ 기간 내 하루근무가치   (비례식 제거, 근무일을 직접 셈)
```

모든 단위가 "근무일 1일 = 1 MD"로 통일 → 공휴일·연차 차감과 완전히 일치.

### MM / 가동률 분리 (Option A)

| | MM (절대 공수) | 가동률 % |
|---|---|---|
| 질문 | "얼마나 일했나" | "가용 대비 얼마나 채웠나" |
| 식 | `totalMd / 그달1MM근무일` | `totalMd / effectiveMd` |
| 분모 | 월 1MM (고정) | 기간 가용 근무일 (연차 차감) |
| 색상 | 보라(고정) | 단계별(50/80/100%) |

**같은 케이스(이번주 1.6MD, 가용 1.4):** MM = 1.6/20 = **0.08 MM** / 가동률 = 1.6/1.4 = **114%** — 둘 다 직관적.

### 결정 사항

1. MM/가동률 **분리** (Option A)
2. `hourRate`(1Day=N시간)는 **EtcSetting으로 이전** (MM과 무관하게 시간↔MD 변환에 계속 필요)
3. 기존 KVS의 `monthRate/monthVals/monthMode` 잔여값은 **무시**
4. 공휴일 미등록 월은 **평일 수만으로 1MM 산출** (정상 동작)

---

## 3. 변경 파일

### 백엔드 (`src/`)

| 파일 | 변경 |
|------|------|
| `utils/workday.js` | **신규** — `getWorkdaysInRange`, `getMonthMm`, `getMonthMmMap`, `workdayValue`, `buildHolidayMap`, `countHolidaysInRange` |
| `resolver/resourceAnalysis/ResourceAnalysisService.js` | `computeBaseMmDays`(비례식)·`computeHolidayDeduction` 제거. `baseMmDays`를 근무일 카운트로 재작성(공휴일 흡수). 응답에 `monthMmMap` 추가. 연차 차감(`computeLeaveDeductionMap`)도 근무일 단위로 |
| `resolver/backoffice/setting/SettingService.js` | `updateSettingService`에서 `monthRate/monthMode/monthVals` 파라미터 제거 |
| `seed/SeedData.js` | 시드에서 `monthRate/monthMode` 제거 |
| `manifest.yml` | settings 엔티티에서 `monthRate/monthMode/monthVals` 속성 제거 |

### 프론트 (`static/ui/src/`)

| 파일 | 변경 |
|------|------|
| `utils/workday.js` | **신규** — 백엔드와 동일 로직 (`getWorkdaysInRange`, `getMonthMm`, `getMonthMmByKey`, `buildHolidayMap`) |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx` | `getMmForRange` 삭제. `baseMmDays`/`monthMm`/`monthMmMap`를 백엔드 응답에서 추출해 Table·Chart에 전달. 로딩 폴백은 평일 카운트 |
| `.../resource/ResourceAnalysisTable.jsx` | **MM 컬럼 = `totalMd/monthMm`(절대공수, 보라 고정)**, **가동률 bar = `totalMd/effectiveMd`(상대)**. `EffectiveMdCell`에 base 근무일+시간 표시 |
| `.../resource/ResourceAnalysisChart.jsx` | `getMonthMmDays`(설정 기반) 제거 → `monthMmMap` 조회. 월별 탭 기준선=월1MM근무일. 헤더/워크로그 MM=`totalMd/monthMm`. 일·주별 탭 기준선 제거 |
| `backoffice/page/setting/EtcSetting.jsx` | `hourRate`(1Day=N시간) 입력 영역 추가 |
| `backoffice/page/setting/ManMonthSetting.jsx` | **삭제** |
| `backoffice/page/setting/SettingPage.jsx` | `ManMonthSetting` import·렌더 제거 |
| `backoffice/page/publicHoliday/MonthMmSummary.jsx` | **신규** — 올해 월별 1MM(근무일/시간) 요약 패널 (현재 월 하이라이트) |
| `backoffice/page/publicHoliday/PublicHolidayPage.jsx` | 목록 위에 `MonthMmSummary` 추가 |
| `pages/myWork/MyLogSummary.jsx` | `getCurrentMonthRate`(monthVals 기반) 제거. `holidayList` prop으로 현재월 1MM×hourRate 계산 |
| `pages/myWork/WorklogPage.jsx` | `MyLogSummary`에 `holidayList` 전달 |

### i18n (`locales/`)  ※ 규칙 상세: [[forge-i18n]]

| 키 | kr | en |
|------|------|------|
| `projectDetail.analysis.resource.table.workdayUnit` | 근무일 | workdays |
| `publicHoliday.mm.title` | 월별 1MM 기준 | Monthly 1MM Standard |
| `publicHoliday.mm.description` | (자동 계산 안내) | (auto-calc note) |

→ `cd static/ui && npm run merge` 로 `ko-KR.json`/`en-US.json` 반영 완료.

---

## 4. 백엔드 응답 형태 변화 (`getResourceAnalysisList`)

```diff
  {
    members: [...],
    hourRate,
    baseMmDays,        // 근무일(공휴일 반영) — 가동률 분모
+   monthMmMap,        // { 'YYYY-MM': 근무일 } — 절대 MM 분모
    holidayCount,
    effectiveDays,
    baseEffective,     // = baseMmDays (공휴일이 base에 흡수됨)
-   holidayDeduction   // 제거 (base에 흡수)
  }
```

- `effectiveMmDays = max(0.1, baseMmDays − 연차차감)` (공휴일은 base에 이미 반영)

---

## 5. 참고 / 한계

- **다중 월 범위의 절대 MM**: 걸친 달들의 1MM **평균**을 분모로 사용 (단일 월이면 정확). 월별 차트 탭은 달마다 정확한 `monthMmMap[month]` 사용.
- 일·주별 차트 탭에서는 1MM 기준선을 표시하지 않음 (월별 탭에서만 의미 있음).
- 기존 KVS settings에 남은 `monthRate` 등은 무시됨 (신규 설치 시드에서도 제거).

---

## 6. 검증

- 프론트 빌드: 성공 (`npm run build`)
- 백엔드 테스트: 통과 (`npm test`, 4/4)
- 배포: `forge deploy` 로 백엔드·manifest 반영 필요
