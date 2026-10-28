# 진척도(Progress) 계산 로직

`ProgressCalculator.js`의 실제 산식과 그 **논리(왜 이렇게 계산하는가)**를 정리한다.
모든 함수는 Forge 의존성 없는 순수 함수라 jest로 단위 검증된다.

> 핵심 철학: **"얼마나 일했나(공수)" ≠ "얼마나 끝났나(완성)" ≠ "시간이 얼마나 흘렀나(일정)"** — 성격이 다른 셋을 절대 한 숫자로 합치지 않는다.

---

## 0. 공통 원칙

### 0-1. 초(seconds) 단위로 합산 후 1회 변환 (누적오차 방지)
MD 변환은 `MD = seconds / (hourRate × 3600)` (hourRate = 1Day 시간, 기본 8).
이슈별로 MD로 반올림한 뒤 합산하면 `round(a)+round(b) ≠ round(a+b)` 오차가 쌓인다.
→ **항상 초 단위로 먼저 Σ한 뒤 마지막에 1회만 변환**한다. (`computeEffortTotals`, `computeStatusDistribution`)

### 0-2. 이슈 데이터 정규화 (`normalizeIssue`)
| 필드 | 출처 | 논리 |
|------|------|------|
| `plannedSeconds` | `timetracking.originalEstimateSeconds` | 계획 공수. **null 가능**(미산정) → 완성률 가중에서 제외 |
| `actualSeconds` | `timetracking.timeSpentSeconds` | 실투입. Jira가 워크로그 합산을 자동 유지 |
| `statusKey` | `statusCategory.key` | `done`/`indeterminate`(진행중)/`new`(할일). Jira 표준 카테고리 |
| `totalWorkers` | `assignee` 유무 + coworker 수 | 예측 종료일 계산의 분모 |
| `startDate` | `customfield_10015` | Jira 표준 시작일 |
| `dueDate` | `duedate` | 확정 지연 계산 기준 |

상태 판정: `isDone = key==='done'`, `isTodo = key==='new' || null`, 그 외 = 진행중.

---

## 1. 층2 — 완성 진척 (진짜 진척도)

### 이슈 진행률 `issueProgress` (0~1)
```
done       → 1.0                              (완료는 무조건 100%, 워크로그 초과해도 캡)
inProgress → min(actualSeconds/plannedSeconds, 1.0)
todo       → 0
plannedSeconds 없는 진행중 → 0
```
**논리:**
- 시스템에 이슈 "처리율" 필드가 없다(custom field는 projectId·coworker뿐). 그래서 진행중 진행률을 **공수 소진율로 근사**한다(Q1 결정).
- `min(…, 1.0)` 캡: "5MD 이슈에 8MD를 써도 그 이슈는 100% 완료지 160%가 아니다."
- ⚠️ **한계**: 진행중 완성률 = 공수소진율이므로, 진단 규칙2(공수 vs 완성)가 정상 구간에서 신호가 약하다(아래 4-2). UI에 명시.

### 완성률 `computeCompletion`
```
완성률 = Σ(진행률ᵢ × plannedSecondsᵢ) / Σ(plannedSecondsᵢ)
earnedSec = Σ(진행률ᵢ × plannedSecondsᵢ)         → 실적기성 MD는 호출부에서 1회 변환
```
**논리:**
- **계획공수로 가중**한다. 큰 이슈와 작은 이슈를 동일 취급하지 않기 위해(개수 평균이 아니라 공수 가중 평균).
- `plannedSeconds`가 null/0인 이슈는 **분모·분자 모두에서 제외**(가중치 0, Q4). 계획 미산정 이슈가 완성률을 왜곡하지 않게.

---

## 2. 층1 — 공수 진척 (소진율, 완성도 아님)

### 공수 totals `computeEffortTotals`
```
plannedTotalMd = round1(Σ plannedSeconds / (hourRate×3600))
actualTotalMd  = round1(Σ actualSeconds  / (hourRate×3600))
```

### 계획 누적선 `generatePlanLine` — 순수 선형 (BAC 정확 도달)
```
영업일(주말·공휴일 제외) 목록 dates[0..n-1]
cumulative(idx) = round1(plannedTotalMd / n × (idx+1))
단, 마지막 점(idx=n-1) = plannedTotalMd  (정확히 대입)
```
**논리 (#3 결정):**
- PV(Planned Value) 베이스라인은 **순수 영업일 선형**으로 plannedTotalMd(=BAC, 완성 시 총량)에 **정확히 도달**해야 한다.
- 개인 연차/반차(가용률) 보정을 계획선에 넣으면 Σ(일별) < plannedTotalMd가 되어 "계획 100%" 끝점이 총량에 못 닿는다 → EVM 관례상 가용률은 계획선이 아니라 별도 capacity선에. MVP는 capacity선 미도입 → **가용률 보정 제거**.
- 공휴일·주말만 `holidaySet`로 영업일에서 제외(달력 현실 반영).
- 마지막 점을 직접 대입하는 이유: `plannedTotalMd/n` 반올림 누적이 끝점에서 총량과 미세하게 어긋나는 것을 방지.

### 실제 누적선 `buildActualCumulative`
```
일자별 Σ timeSpentSeconds → 날짜 정렬 → 누적 → round1(cumSec/(hourRate×3600))
```
**논리:** 워크로그를 일자별로 합산해 누적. 초 단위로 누적하다 표시 시점에만 MD 변환(0-1 원칙).

---

## 3. 층3 — 일정 진척 (순수 달력)

### `computeScheduleRate`
```
일정률 = min(경과 WorkDay / 전체 WorkDay, 1.0)
```
**논리:** 이슈·공수와 무관한 **순수 시간 지표**. 휴일·주말 제외 근무일 기준. 단독으로는 의미 없고, 층2(완성)와 비교해 지연/정상의 **기준선** 역할만 한다(아래 4-1).

---

## 4. 진단 (세 층을 합쳐 상태 판정)

### `computeDiagnosisRates` (캐시 대상 — rate)
```
diffPercentPoint   = round1((완성률 - 일정률) × 100)   ← 규칙1, 주 신호
effortVsCompletion = round1((공수율 - 완성률) × 100)   ← 규칙2, 보조
   (공수율 = actualTotalMd / plannedTotalMd)
```

### `diagnoseStatus` (read-time — threshold 적용)
```
th = threshold(%p, 기본 5)
diffPercentPoint ≤ -th  → 'delayed'   (완성이 일정보다 th 이상 뒤짐)
diffPercentPoint < 0    → 'caution'
그 외                   → 'normal'
```
**논리:**

**4-1. 규칙1 (완성 vs 일정) — 주 신호.** "시간은 흘렀는데 완성이 못 따라오면 지연."
threshold가 **캐시에 안 들어가고 read-time에 적용**되는 이유(#5): threshold는 rate 계산엔 영향 없고 status 분류에만 쓰이므로, rate만 10분 캐시하고 status는 응답 시점에 최신 threshold로 산출 → 사용자가 threshold를 바꿔도 즉시 반영(캐시에 막히지 않음).

**4-2. 규칙2 (공수 vs 완성) — 보조.** 공수 ≫ 완성: "공수만 쓰고 안 끝남"(비효율/리스크). 공수 ≈ 완성: 효율적. 공수 ≪ 완성: 적은 공수로 완성(효율 좋음 또는 계획 과다추정).
⚠️ **한계**: 층2 진행중 진행률을 공수소진율(min(actual/plan))로 근사하므로, actual<plan인 정상 진행중 이슈는 (완성−공수)에 0으로 기여 → 규칙2가 사실상 "공수 초과/완료 효율 탐지기"로 격하된다. **주 신호는 규칙1**이라는 점을 UI에 명시.

---

## 5. 지연 처리 (duedate)

프로젝트 전체 지연을 단일 숫자로 만들지 않고 두 트랙으로 분리.

### 5-1. 확정 지연 `computeDelayConfirmed` (완료 이슈, 회고)
```
대상: Done AND dueDate 있음 AND 마지막 워크로그 작성일 있음
완료일 = lastWorklogDateMap[issueKey]   (상태전이일이 없어 마지막 워크로그일로 근사)
delayDays = 완료일 - dueDate
  delayDays > 0 → delays[]   (지연)
  delayDays < 0 → leads[]    (조기, 절대값)

avgDelayDays = mean(delays)        ← 지연(>0)만
delayedRatio = delays.length / evaluated
maxDelayDays = max(delays)
count        = delays.length
avgLeadDays  = mean(leads)         ← 조기완료 별도
earlyCount   = leads.length
```
**논리 (#7):**
- 완료일을 "마지막 워크로그 작성일"로 근사(상태전이 이력이 없으므로). 워크로그 없는 Done 이슈는 완료일 추정 불가 → 제외.
- `avgDelayDays`에 조기완료(음수)를 섞으면 "조기완료가 지연을 상쇄"해 평균이 왜곡된다 → **지연(>0)만** 평균. 조기완료는 `avgLeadDays`/`earlyCount`로 **분리** 표기.

### 5-2. 예측 지연 `computeDelayPredicted` (미완료, 추세 근사)
```
이슈별(미완료 & plannedSeconds>0):
  remainingMd = max(plannedMd - actualMd, 0)
  estimatedEndDate = startDate + ceil(remainingMd / totalWorkers) 영업일
estimatedEndDate(프로젝트) = max(이슈별 estimatedEndDate)
predictedDelayDays = estimatedEndDate(프로젝트) - projectEndDate
optimisticApprox = true
```
**논리 (#4·Q5):**
- `remaining = plan - actual` 기반(`full plan` 아님) → 거의 끝난 이슈를 과대추정하지 않음.
- ⚠️ **낙관 편향**: 이슈마다 전 인원 투입을 가정한 값들의 max라 병렬 불가를 무시 → 프로젝트 종료를 **과소추정(지연 낙관)**하기 쉽다. `optimisticApprox: true`로 표기, UI에 "낙관 근사치" 명시.
- 일자별 완성률 시계열(상태전이 이력)이 없어 정밀 추세 회귀는 불가 → 이 max 근사가 MVP 방식.

---

## 6. 상태별 분포 `computeStatusDistribution`
```
byCount  = { done, inProgress, todo }              (이슈 개수)
byEffort = { doneMd, inProgressMd, todoMd }         (상태별 Σ plannedSeconds → 1회 변환)
```
**논리:** 개수 기준은 큰/작은 이슈를 동일 취급하므로 **공수 기준이 기본값**(권장). 개수 기준은 참고용.

---

## 7. 캐시 경계 요약

| 캐시 대상 (`ProjectProgress:{pid}:{start}:{end}`, TTL 10분) | 비캐시 (read-time / 매 호출) |
|---|---|
| effort/completion/schedule rate·누적, diffPercentPoint, effortVsCompletion, delayConfirmed, delayPredicted, statusDistribution, baseline | `diagnosis.status`(threshold 적용), `issues[]`(KVS value 크기 한도 회피) |

---

## 8. 워크로그 가능 예시 (검증용)

hourRate=8 가정. 이슈 A(plan 5MD=144000s, 진행중, actual 2.5MD=72000s), B(plan 3MD, done, actual 4MD), C(plan 미산정, 진행중):
- A 진행률 = min(72000/144000,1)=0.5, B=1.0, C=0(분모 제외)
- 완성률 = (0.5×144000 + 1.0×86400) / (144000+86400) = 158400/230400 ≈ **0.6875 (68.75%)**
- plannedTotalMd = (144000+86400)/(8×3600)=8.0MD (C 제외), actualTotalMd = (72000+115200)/28800=6.5MD
- earnedMd = 158400/28800 = 5.5MD

