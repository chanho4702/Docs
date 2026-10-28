# 총평

v1.0은 “개인 참여 기간”과 “계획 투입률”을 도입하는 방향은 잡았지만, 다음 네 가지가 아직 계약 수준에서 닫히지 않았다.

1. **하위호환 주장과 실제 산식 변경이 모순된다.**
2. **D6 때문에 가동률·계획 소진율·비용 안분이 100%를 비정상적으로 초과할 수 있다.**
3. **계획 지표와 비용/EVM 지표를 한 번에 바꾸면서 같은 이름의 지표가 서로 다른 의미를 갖게 된다.**
4. **저장값, 10분 캐시, 일 배치 스냅샷을 하나의 revision으로 묶는 일관성 모델이 없다.**

특히 `allocation_pct`를 “계획 배정 의도”로 정의하면서도 일부 비용에는 적용하고, 가동률에는 적용하지 않고, 고정 프로젝트 급여에는 적용하지 않는 구조는 가능하다. 다만 이 경우 `allocation_pct`는 범용 투입률이 아니라 **계획 capacity 배정률**이라는 점을 API·UI·지표명에 명시해야 한다.

---

## 1. 논리 결함: 산식·클램프·상속 규칙

### 1.1 “기존 행 결과 불변”은 B3에서 성립하지 않는다

**결함/위험**

`joined_at=null`, `left_at=null`, `allocation_pct=100`인 기존 행도 `ResourceAnalysisService`의 분모가 달라진다.

**근거**

- 설계서 §3.5: 기존 행은 “모든 산식이 변경 전 값과 일치”.
- §4 B3: 현재 `조회 기간 근무일`에서 `조회 기간 ∩ 경과 참여 기간`으로 변경.
- `ResourceAnalysisService.js`: 현재 모든 멤버의 분모는 `startDate~effectiveEndDate`의 `baseMmDays`.
- null 상속 시 참여 기간은 프로젝트 기간이므로, 조회 범위가 프로젝트 기간을 벗어나면 새 분모는 더 작아진다.

예를 들어 프로젝트가 3월~6월이고 조회 범위가 1월~6월이면 기존 분모는 1월~6월, 변경 후 분모는 3월~6월이다.

**구체적 수정 제안**

둘 중 하나를 선택해 문서를 고쳐야 한다.

- 권장: “기존 저장 데이터의 **기간 해석**은 프로젝트 기간과 동일하지만, 잘못된 기존 조회 분모는 교정된다”고 하위호환 범위를 축소한다.
- 정말 값 불변이 필요하면 B3의 분모 변경을 별도 버전 지표로 제공한다.
  - `utilizationLegacy`
  - `assignmentPeriodUtilization`
- 테스트도 “기존 행 완전 동일”이 아니라 소비처별로 구분한다.
  - 비용·전사 가동률: 동일
  - ResourceAnalysis 조회 범위가 프로젝트 밖으로 나간 경우: 의도적으로 변경

---

### 1.2 클램프 후 빈 구간이 되는 경우가 정의되지 않았다

**결함/위험**

원본 `joined_at <= left_at`이더라도 프로젝트 기간과 교집합이 없으면 클램프 결과가 `start > end`가 된다.

예:

- 프로젝트: 2026-04-01~2026-06-30
- 참여 기간: 2026-01-01~2026-02-28

원본 기간은 유효하지만 프로젝트와 겹치지 않는다.

**근거**

- §2.3은 원본 `joined_at > left_at`만 거부한다.
- §1은 프로젝트 기간으로 항상 클램프한다고 정의한다.
- `memberWorkdays`, `memberMonths`, `resolveElapsedPeriod`가 빈 구간을 어떤 값으로 반환할지 없다.

미래 참여도 유사하다. `resolveElapsedPeriod`가 미래 `start`에 대해 `end=today`를 만들면 다시 `start > end`가 된다.

**구체적 수정 제안**

기간 결과를 단순 `{start,end}`가 아니라 상태가 있는 계약으로 바꾼다.

```js
{
  start,
  end,
  state: 'VALID' | 'EMPTY' | 'OPEN_ENDED',
  clampedStart: boolean,
  clampedEnd: boolean
}
```

그리고 다음을 고정한다.

- 빈 교집합:
  - 근무일 `0`
  - 계획 MD `0`
  - 계획 소진율 `null`
  - 가동률 분모 `null` 또는 `0` 중 하나로 통일
- 미래 참여의 경과 구간: `EMPTY`
- 저장 정책:
  - 프로젝트와 전혀 겹치지 않는 기간은 경고만 허용할지, 저장 거부할지 별도 결정
  - 권장: 프로젝트 기간 변경으로 기존 값이 벗어난 것은 허용하되, 신규 직접 입력이 완전히 비겹침이면 거부

---

### 1.3 프로젝트 종료일이 null이면 ANNUAL·LEVEL_BAND 계획 인건비가 정의되지 않는다

**결함/위험**

무기한 프로젝트의 전체 `memberMonths`와 계획 MD는 유한값이 될 수 없다. 현재 `computeProjectMonths`는 종료일이 없으면 `0`을 반환하므로, 그대로 재사용하면 ANNUAL·LEVEL_BAND 인건비가 0이 된다.

**근거**

- §1: 프로젝트 `end_date=null`이고 `left_at=null`이면 유효 기간의 끝도 null.
- §2.2: `memberMonths(period)`가 급여 월할용 개월 수.
- `EffectiveSalary.js`: `computeProjectMonths`는 `endDate`가 없으면 0.
- §5는 워크로그 0 조직에서도 계획 인건비가 채워진다고 주장한다.

**구체적 수정 제안**

무기한 구간에 대해 산정 horizon을 반드시 도입한다.

- 프로젝트 전체 계획값:
  - 종료일이 없으면 `plannedMd=null`, `plannedLaborCost=null`
- 조회 기간 계획값:
  - `[queryStart, queryEnd] ∩ 참여 기간`으로 계산
- “현재까지 발생 추정 비용”:
  - `[참여 시작, asOfDate]`로 계산
- 향후 예측:
  - 명시적 `forecastEndDate`가 있을 때만 계산

API에도 범위를 드러내는 이름을 사용한다.

- `plannedMdInRange`
- `plannedCostInRange`
- `accruedCostAsOf`

---

### 1.4 D1은 가능하지만 `PROJECT`의 의미가 너무 암묵적이다

**결함/위험**

한 달짜리 10% 배정이든 1년짜리 100% 배정이든 `PROJECT` 급여는 전액 유지된다. 사용자는 `allocation_pct`를 바꾸고도 계획 인건비가 변하지 않는 것을 오류로 인식할 가능성이 높다.

또한 §3.3의 “급여 월할에는 참여 기간과 투입률을 모두 곱한다”라는 원칙 바로 뒤에서 `PROJECT`는 둘 다 곱하지 않는다고 해 원칙 자체가 모순적으로 읽힌다.

**근거**

- §9 D1: `PROJECT`에는 기간·투입률 모두 미적용.
- `EffectiveSalary.js`: `PROJECT`는 `Math.round(invest)`.
- §5는 “계획 인건비”를 계획 기반 모드의 핵심 값으로 제시하지만, PROJECT 값은 배정률 기반 계획이 아니라 고정 계약액이다.

**구체적 수정 제안**

D1을 유지하려면 다음과 같이 의미를 분리한다.

- `PROJECT`를 문서/UI에서 `PROJECT_FIXED` 또는 “프로젝트 고정 총액”으로 표현
- `plannedBudget`에는 포함
- `plannedLaborCostByAllocation`에는 포함하지 않거나 `null`
- API에 비용 근거를 제공

```js
{
  costBasis: 'PROJECT_FIXED' | 'ANNUAL_PRORATED' | 'LEVEL_BAND_PRORATED',
  fixedProjectCost,
  plannedAllocatedCost
}
```

그리고 “기간/투입률을 변경해도 고정 총액은 변하지 않는다”는 경고를 급여 편집 UI에 표시한다.

장기적으로 고정 총액에도 기간 안분이 필요할 수 있으므로 별도 모드가 더 안전하다.

- `PROJECT_FIXED`: 총액 미변경
- `PROJECT_PERIOD_PRORATED`: 기준 프로젝트 기간 대비 참여 기간 비율 적용

---

### 1.5 D2는 지표 분리를 전제로 해야 타당하다

**결함/위험**

50% 배정 인원이 계획대로 절반만 일하면:

- 가동률: 50%
- 계획 소진율: 100%

두 값 모두 수학적으로 맞지만, 화면에서 둘 다 “투입/가동” 계열로 보이면 사용자는 상충하는 값으로 인식한다. 또한 200% 과할당자의 가동률 분모도 여전히 1인 전체 capacity여서 계획 부하와 실제 점유를 직접 비교하기 어렵다.

**근거**

- §9 D2의 예시가 바로 이 차이를 의도한다.
- `PortfolioAggregator.computeGlobalUtilization`은 근무 가능일을 분모로 사용한다.
- §5의 계획 부하는 배정률 합계를 사용한다.

**구체적 수정 제안**

D2는 유지할 수 있지만 지표 이름과 정의를 분리한다.

- `actualOccupancyRate = actualMd / availableMd`
- `planAttainmentRate = actualInPeriodMd / plannedElapsedMd`
- `plannedLoadPct = Σ allocationPct`
- `capacityVarianceMd = plannedElapsedMd - actualInPeriodMd`

한국어 UI도 “가동률” 하나로 뭉치지 말고 다음처럼 구분한다.

- 실제 가동률
- 계획 달성률
- 계획 부하

---

### 1.6 D6은 현재 형태로는 비율 지표를 오염시킨다

**결함/위험**

기간 외 워크로그를 분자에 전부 포함하고 분모에서 제외하면 다음이 발생한다.

- 가동률이 쉽게 100%를 초과
- 계획 소진율이 과도하게 상승
- 참여 기간과 전혀 겹치지 않는 사람도 분자만 존재
- 기간을 짧게 수정하는 것만으로 과거 가동률이 급등
- 비용 `byIssue`가 어느 기간의 비용을 나타내는지 불명확

“돈이 든 사실”이라는 근거도 충분하지 않다. 워크로그는 노동시간의 증거이지, `PROJECT_FIXED` 또는 월할 급여가 실제로 추가 지급됐다는 증거는 아니다.

**근거**

- §3.1 및 D6: 기간 외 워크로그를 분자에 포함.
- B3: 분모는 참여 기간 교집합으로 축소.
- `ResourceAnalysisService.js`: 워크로그는 조회 기간 전체에서 집계된다.
- `CostCalculator.allocateIssueCost`는 워크로그 비중으로 비용을 이슈에 안분한다.

**구체적 수정 제안**

워크로그를 최소한 두 분자로 분리한다.

```text
actualMdTotal       = 조회 범위 전체 워크로그
actualMdInPeriod    = 조회 범위 ∩ 참여 기간의 워크로그
outOfPeriodMd       = actualMdTotal - actualMdInPeriod
```

지표 적용은 다음이 안전하다.

- 실제 가동률: `actualMdInPeriod / availableMd`
- 계획 소진율: `actualMdInPeriod / plannedElapsedMd`
- 총 실적 표시: `actualMdTotal`
- 예외 표시: `outOfPeriodMd`
- 재무 합계에서 기간 외 실적을 포함하려면 별도의 `unassignedActualMd` 또는 `exceptionCost`로 표시

즉 D6은 “총 실적 보존” 결정으로는 유지하되, **기간 기반 비율의 분자에는 포함하지 않는 것**이 권장된다.

---

### 1.7 인원별 비용 합산에서 반올림 불일치가 생긴다

**결함/위험**

인원별 `salary × memberScheduleRate`를 각각 반올림한 합과, 그룹·프로젝트 헤더에서 다시 계산한 값이 다를 수 있다.

**근거**

- §3.4와 A2는 인원별 안분으로 변경.
- `CostCalculator.js`는 여러 위치에서 `Math.round`를 독립적으로 수행한다.
- 현재 `groupCostByKey`는 그룹 합계에 단일 `scheduleRate`를 곱한다.

**구체적 수정 제안**

- 인원별 raw decimal을 먼저 계산
- 프로젝트 총액을 한 번 반올림
- 그룹/이슈에는 largest-remainder 방식 또는 마지막 행 보정으로 총액을 맞춤
- 다음 불변식을 테스트

```text
Σ memberActualCost
= Σ byRole.actual
= Σ byLevel.actual
= Σ byTeam.actual
= budget.actualCost
```

`byIssue`는 워크로그 없는 인원의 비용이 빠질 수 있으므로 동일 불변식을 강제할 수 없다. 대신 `unallocatedActualCost`를 별도로 반환해야 한다.

---

## 2. 지표 정합성과 소비처 누락

### 2.1 같은 “가동률”이 이미 여러 분모·집계법을 가진다

**결함/위험**

설계는 개인 기간을 적용하면 지표가 통일되는 것처럼 서술하지만, 발췌 코드만 봐도 최소 세 가지 가동률이 존재한다.

- 전사 개인 가동률: 프로젝트 참여 구간 합집합 분모
- 프로젝트 개인 가동률: 해당 프로젝트 경과 기간 분모
- 프로젝트 평균 가동률: 개인 비율의 산술평균
- 팀 가동률: 설계 설명상 `Σ actual / Σ available` 가중 비율
- ResourceAnalysis: 조회 범위 교집합 분모

이 값들은 같은 이름이어도 원래 같을 수 없다.

**근거**

- `PortfolioAggregator.computeGlobalUtilization`
- `PortfolioAggregator`의 `projUtil`, `avgUtilization`
- 코드 주석의 팀 가동률 가중 계산
- §4 B3의 조회 범위 교집합

**구체적 수정 제안**

지표 사전을 설계서에 추가한다.

| 지표 ID | 분자 | 분모 | 범위 | 집계 |
|---|---|---|---|---|
| `companyActualOccupancy` | 전 프로젝트 실제 MD | 참여 구간 합집합 가용 MD | as-of | 비율의 재계산 |
| `projectMemberOccupancy` | 해당 프로젝트 실제 MD | 해당 참여 기간 가용 MD | as-of | 개인 |
| `projectAverageOccupancy` | — | — | as-of | 산술평균 또는 가중평균 명시 |
| `resourceRangeOccupancy` | 기간 내 실제 MD | 조회 범위∩참여 기간 가용 MD | 조회 범위 | 개인 |
| `planAttainment` | 기간 내 실제 MD | 경과 계획 MD | 조회 범위/as-of | 개인 |

UI와 응답에서 모두 `utilization`이라는 단일 이름을 재사용하지 않는 편이 안전하다.

---

### 2.2 §4에서 비용 응답 파생값 소비처가 충분히 분해되지 않았다

**결함/위험**

A2가 `ProjectCostService`를 한 줄로 묶고 있지만, 실제 코드는 서로 다른 산식을 가진 여러 결과를 만든다. 일부만 인원별 rate로 바꾸면 헤더와 세부 내역이 갈린다.

**근거**

`ProjectCostService.js`와 `CostCalculator.js`에 다음 소비처가 있다.

- `computeBudget`
- `rates.scheduleRate`
- `rates.burnRate`
- `computeEvm`
- `allocateMonthlyCost`
- `groupCostByKey`의 `byRole`
- `byLevel`
- `byTeam`
- `allocateIssueCost`
- `plannedBudgetLine`
- 캐시 내부 `_scheduleRate`
- 캐시 hit의 `byIssue` 재구성

**구체적 수정 제안**

A2를 최소 다음으로 분리한다.

- A2a: 프로젝트 `plannedBudget`
- A2b: 프로젝트 `actualCost`
- A2c: 역할/레벨/팀 actual
- A2d: 월별 actual
- A2e: 이슈별 비용
- A2f: `burnRate`
- A2g: EVM의 AC/CPI/EAC/ETC
- A2h: `unallocatedActualCost`
- A2i: cache hit/miss 동치성

특히 `burnRate = scheduleRate`는 인원별 rate 도입 후 더 이상 성립하지 않는다.

```text
burnRate = actualCost / plannedBudget
```

로 다시 계산해야 한다.

---

### 2.3 `allocateIssueCost`의 scalar 계약 변경이 매트릭스에 명시되지 않았다

**결함/위험**

현재 함수는 scalar `scheduleRate`를 받는다. 설계처럼 인원별 rate를 적용하려면 함수 서명과 모든 호출부가 바뀌어야 한다.

**근거**

- `CostCalculator.js`: 설명상 `salary × scheduleRate × issueSec/memberTotalSec`
- `ProjectCostService.js`: `allocateIssueCost(..., scheduleRate, ...)`
- §4 A2는 `_memberRates`만 언급한다.

**구체적 수정 제안**

명시적인 계약으로 변경한다.

```js
allocateIssueCost(
  worklogs,
  salaryMap,
  memberRateMap,
  hourRate,
  memberTotalWorkdaysMap
)
```

또는 멤버별 계산 입력을 하나로 묶는다.

```js
memberCostContext[accountId] = {
  effectiveSalary,
  elapsedRate,
  actualCost,
  inPeriodSeconds,
  outOfPeriodSeconds
};
```

`byIssue`는 각 멤버의 확정된 `actualCost`를 분배하게 해야 헤더와 일치한다.

---

### 2.4 `PortfolioAggregator`의 `effortRate`, `actualMm`, 진단 지표가 누락됐다

**결함/위험**

신규 “계획 MD”와 기존 `effortTotals.plannedTotalMd`가 같은 계획 개념으로 오해될 수 있다. 또한 `actualMm`은 프로젝트 기간의 월평균 근무일을 사용하므로 인원별 참여 기간을 적용한 MM과 다를 수 있다.

**근거**

`PortfolioAggregator.js` 발췌:

- `effortRate = actualTotalMd / plannedTotalMd`
- `computeDiagnosisRates(..., effortRate)`
- `actualMm = actualTotalMd / avgMonthWorkdays`

§4에는 이 세 경로가 없다.

**구체적 수정 제안**

- 기존 `plannedTotalMd`가 이슈 기반 계획 공수인지 배정 기반 계획 MD인지 명칭을 분리
  - `issueEstimateMd`
  - `assignmentCapacityMd`
- `effortRate`는 `issueEstimateBurnRate` 등으로 명명
- 신규 계획 소진율은 `assignmentPlanAttainmentRate`
- `actualMm`이 달력 월 환산값이면 참여 기간 지표와 분리해 유지
- `computeDiagnosisRates`가 어떤 계획값을 쓰는지 결정 항목으로 승격

---

### 2.5 `ResourceAnalysisService`는 현재 워크로그 없는 멤버 행을 만들지 않는다

**결함/위험**

설계는 “교집합이 없어도 행 유지” 및 “워크로그 0 조직에서도 계획 지표 표시”를 요구하지만, 현재 `members`는 `worklogs`로 만든 `userMap`에서만 생성된다.

`effectiveDays`도 `leaveDeductionMap`에 등장한 사용자만 채워지므로 휴가 기록조차 없는 멤버는 없다.

**근거**

`ResourceAnalysisService.js`:

```js
const userMap = new Map();
for (const log of worklogs) { ... }

const members = Array.from(userMap.values()).map(...)
```

설계서 §4 B3, §5와 직접 충돌한다.

**구체적 수정 제안**

프로젝트 명단을 별도 조회해 명단을 기준 집합으로 삼는다.

```text
roster = projectusers
worklog aggregates LEFT JOIN roster
leave aggregates LEFT JOIN roster
```

기간 외 워크로그 작성자가 명단에 없을 수 있으므로 결과 집합은 다음이 적절하다.

```text
roster ∪ worklogAuthors
```

각 행에 상태를 둔다.

- `assignmentState: ACTIVE | FUTURE | ENDED | UNASSIGNED_WORKLOG_AUTHOR`
- `isProjectMember`
- `outOfPeriodMd`

---

### 2.6 쿼리 응답 컬럼 누락 가능성이 있다

**결함/위험**

기간과 투입률을 계산하려면 여러 쿼리가 새 컬럼을 반환해야 하지만 §4에서 쓰기 경로와 일부 쿼리만 강조돼 있다.

**근거**

발췌에서 직접 확인되는 위치:

- `FIND_BY_PROJECT_ID`: 새 컬럼 없음
- `FIND_SALARY_BY_PROJECT_ID`: 새 컬럼 없음
- `FIND_ALL_ALLOCATIONS`: 계획 부하 계산에 필요한 `allocation_pct`, `joined_at`, 프로젝트 `start_date`가 없음
- `FIND_ALL_ALLOCATIONS_WITH_CLOSED`: 개인 기간·투입률 없음
- `FIND_HISTORY_BY_ACCOUNT`: 변경 예정이나 alias 계약 불명확
- `FIND_MEMBER_TEAMS_BY_PROJECTS`: 기간 무관 명단을 사용함

**구체적 수정 제안**

§4에 “생산자 쿼리” 항목을 별도로 만들고 필드 lineage를 적는다.

| 응답/집계 | 원천 쿼리 | 필수 필드 |
|---|---|---|
| 프로젝트 명단 | `FIND_BY_PROJECT_ID` | joined/left/allocation |
| 급여 계산 | `FIND_SALARY_BY_PROJECT_ID` | joined/left/allocation |
| 계획 부하 | 전사 allocation 쿼리 | 프로젝트 start/end + joined/left/allocation |
| 참여 이력 | `FIND_HISTORY_BY_ACCOUNT` | raw 기간 + effective 기간 |
| 관계도 | `FIND_ALL_ALLOCATIONS(_WITH_CLOSED)` | 기간·투입률·as-of 활성 여부 |

`FIND_MEMBER_TEAMS_BY_PROJECTS`가 기간 무관이어야 하는지는 캘린더의 의미에 따라 다르다. 발췌 밖 소비 로직이 필요하므로 이 판단은 **확신 낮음**이다.

---

### 2.7 active project count 조건이 프로젝트 시작일을 반영하지 않는다

**결함/위험**

C1의 제안 조건은 미래 프로젝트에서 `joined_at=null`인 인원을 현재 참여 프로젝트로 셀 수 있다.

**근거**

제안 조건:

```sql
pu.joined_at IS NULL OR pu.joined_at <= CURDATE()
```

null은 프로젝트 시작일 상속인데, `p.start_date <= CURDATE()` 조건이 없다.

**구체적 수정 제안**

SQL에서 effective 기간을 그대로 표현한다.

```sql
COALESCE(pu.joined_at, p.start_date) <= CURDATE()
AND (
  COALESCE(pu.left_at, p.end_date) IS NULL
  OR COALESCE(pu.left_at, p.end_date) >= CURDATE()
)
```

프로젝트 기간으로 클램프한다면 조건도 프로젝트 경계를 모두 반영해야 한다. 삭제 상태 조건이 필요한지는 발췌만으로 확인할 수 없어 **확신 낮음**이다.

---

## 3. 데이터 모델: 3개 컬럼과 구간 테이블

### 3.1 컬럼 3개 방식은 v1 구현은 단순하지만 다중 구간 이전 비용이 크다

**결함/위험**

나중에 구간 테이블로 옮기면 단순 DDL 이상의 변경이 필요하다.

- 모든 조회를 `projectusers` 단독 조회에서 roster+interval 조인으로 변경
- 인원별 하나였던 급여·역할·등급과 구간별 투입률의 소유 관계 재정의
- 스냅샷 shape 변경
- 캐시 키/무효화 단위 변경
- API의 단일 `{joinedAt,leftAt,allocationPct}`를 배열로 변경
- 기존 행을 구간 row로 backfill
- 전환 기간 dual-read 또는 dual-write 필요
- TiDB에서 FK와 트랜잭션을 신뢰할 수 없으므로 고아·부분 이전 가능

**근거**

- §0.3과 D5에서 다중 구간은 이미 예상된 후속 요구다.
- §2는 구간 정보를 `projectusers`에 직접 넣는다.
- §4 전 소비처가 단일 구간 shape를 직접 받도록 설계돼 있다.

**구체적 수정 제안**

다중 구간 가능성이 실질적이라면 지금부터 테이블을 분리하는 편이 안전하다.

```text
projectusers
- project_member_id
- project_id
- account_id
- role/level/salary...

project_member_assignment
- assignment_id
- project_member_id
- joined_at
- left_at
- allocation_pct
- created/updated metadata
```

v1 서비스에서만 “구간 1개”를 강제한다. 그러면 추후에는 제약을 해제하고 집계 함수만 다중 구간을 받도록 확장할 수 있다.

범위를 줄이기 위해 컬럼 방식을 유지한다면 최소한:

- 모든 계산 입력을 지금부터 `assignments: [...]` 배열로 정규화
- DB adapter만 단일 row를 배열 1개로 변환
- 응답에는 단일 필드와 함께 향후 호환용 `assignments`를 고려
- “다중 구간 전환 시 API v2 필요”를 명시

---

### 3.2 assignment와 roster의 생명주기가 섞여 있다

**결함/위험**

`projectusers`는 역할·등급·급여·팀/권한 범위의 명단 관계이면서 동시에 시간 구간을 갖게 된다. D4처럼 접근 범위는 명단 기준이고 지표는 기간 기준이면 한 row가 두 의미를 가진다.

**근거**

- D4: 기간 종료 후에도 조회 범위 명단은 유지
- C1/C2: 기간으로 활성 배정을 판정
- `FIND_PROJECT_IDS_BY_ACCOUNT(S)`: 기간 무관 권한 범위
- `DELETE_BY_PROJECT_AND_ACCOUNT`: 행 삭제는 명단과 전체 참여 이력을 동시에 제거

**구체적 수정 제안**

도메인 용어를 분리한다.

- `ProjectMember`: 명단·권한·역할·급여
- `ProjectAssignment`: 기간·allocation
- `ActiveAssignment`: 특정 as-of에 유효한 assignment

컬럼 방식을 유지하더라도 코드 모델은 이 세 개념을 분리해야 한다.

---

### 3.3 TiDB 비강제 FK에서는 고아 데이터와 중복을 앱이 막아야 한다

**결함/위험**

DDL에 FK가 있어도 실제 정합성이 보장되지 않으면 다음이 가능하다.

- 존재하지 않는 `projectusers`를 참조하는 assignment
- 프로젝트/사용자 삭제 후 고아 구간
- 동일 멤버에 중복 구간
- 마이그레이션 중 일부만 생성
- DB 변경 성공 후 캐시 무효화 실패

**근거**

- 설계서 §2.1이 “FK 미강제·트랜잭션 없음”을 인정한다.
- 기존 코드에도 사용자 삭제 cascade가 앱 레벨이라고 명시돼 있다.

**구체적 수정 제안**

- 쓰기 전 부모 존재 확인
- `(project_id, account_id)`의 논리적 유일성을 서비스와 DB unique index 양쪽에서 보강
- 구간 테이블 사용 시 `project_member_id` 인덱스 필수
- 삭제 순서를 자식→부모로 고정
- 삭제/마이그레이션 작업을 재실행 가능하게 설계
- 고아 탐지용 정합성 검사 쿼리와 운영 테스트 추가
- 캐시는 “삭제 성공 후 best-effort 삭제”만 믿지 말고 revision 검증 사용

“컬럼 추가뿐이라 영향 없음”이라는 §2.1 문구는 지나치게 낙관적이다. DDL 자체는 단순해도, 배포 중 구버전 코드가 새 schema와 공존하는 기간과 부분 배포를 고려해야 한다.

---

## 4. 캐시·스냅샷 일관성

### 4.1 캐시 무효화만으로는 원자성을 확보할 수 없다

**결함/위험**

SQL 저장은 성공했지만 KVS 삭제가 실패하면 10분간 구값을 반환한다. 비용 캐시와 ResourceList 캐시 중 하나만 삭제될 수도 있다.

**근거**

- §6.2는 저장 시 캐시 삭제를 제시
- TiDB 트랜잭션 없음
- 비용 캐시와 ResourceList가 별도 저장소/키
- 일 배치 스냅샷은 별도 갱신

**구체적 수정 제안**

프로젝트별 `assignmentRevision`을 도입한다.

```text
project.assignment_revision 또는 별도 revision 레코드
```

- 기간/투입률 저장 시 revision 증가
- 캐시 payload에 revision 저장
- hit 시 현재 revision과 다르면 miss 처리
- 스냅샷에도 revision 저장
- 응답에 `sourceRevision`, `sourceAsOf` 제공

prefix 삭제는 최적화로만 사용하고 정합성 보장의 핵심으로 두지 않는다.

KVS에서 실제로 prefix 삭제를 어떻게 구현하는지는 발췌에 없으므로, 구현 가능성 판단은 **확신 낮음**이다. 특히 목록 기반 삭제라면 100건 제한과 pagination을 검토해야 한다.

---

### 4.2 ResourceList 키에는 assignment version이 없다

**결함/위험**

키가 날짜만 포함하므로 같은 프로젝트·조회 기간에서 참여 기간을 바꿔도 동일 키를 사용한다. prefix 삭제 누락 시 바로 stale이다.

**근거**

`ResourceAnalysisService.js`:

```js
ResourceList:${projectId}:${startDate}:${effectiveEndDate}
```

§6.2는 prefix 삭제만 제안한다.

**구체적 수정 제안**

```text
ResourceList:v2:{projectId}:{assignmentRevision}:{start}:{end}
```

공휴일·근무시간·휴가 변경도 결과에 영향을 주므로 가능하면 다음 revision도 포함한다.

- `calendarRevision`
- `scheduleRevision`
- `settingsRevision`

이 revision 원천이 현재 존재하는지는 발췌 밖이므로 **확신 낮음**이다.

---

### 4.3 비용 cache hit에서 cached rate와 현재 멤버가 섞일 수 있다

**결함/위험**

설계는 `_memberRates`를 캐시하고 hit 시 현재 worklog·멤버 salary를 다시 조회해 `byIssue`를 재구성하려 한다. 캐시 생성 이후 멤버 목록·기간·급여 중 일부만 바뀌면 서로 다른 시점의 데이터가 혼합될 수 있다.

**근거**

- `ProjectCostService.js`: 캐시 hit에서 worklog, members, issues를 다시 가져와 `byIssue` 재구성
- 캐시 payload에는 `_scheduleRate`, `_totalWorkDays`, `_projectMonths`
- 설계 A2는 `_memberRates` 추가
- 저장과 무효화가 원자적이지 않음

**구체적 수정 제안**

두 가지 중 하나로 통일한다.

1. **완전 snapshot cache**
   - 비용 응답 전체를 같은 입력 revision으로 캐시
   - hit에서 재구성하지 않음

2. **입력 context cache**
   - hit에서 current revision 확인
   - salary, memberRate, worklog cutoff가 동일 revision/as-of인지 확인
   - 다르면 전체 miss

`_memberRates`만 추가하는 것은 충분하지 않다.

---

### 4.4 `byIssue`는 기간 외 워크로그 처리와도 어긋날 수 있다

**결함/위험**

멤버 비용은 참여 기간 경과율로 계산하면서, 이슈 안분의 분모인 `memberTotalSec`가 기간 외 워크로그까지 포함하면 기간 내 비용이 기간 외 이슈에도 배분된다.

반대로 기간 내 워크로그만 쓰면 `outOfPeriodMd`와 재무 합계 관계를 별도로 설명해야 한다.

**근거**

- D6: 기간 외 워크로그 포함
- `allocateIssueCost` 설명: `issueSec/memberTotalSec`
- A2: 인원별 경과율 적용

**구체적 수정 제안**

이슈 비용을 두 계층으로 분리한다.

- `assignedIssueCost`: 기간 내 워크로그 비중으로 멤버 actual cost 안분
- `outOfPeriodIssueCost`: 기간 외 워크로그에 대응하는 예외 비용 또는 `null`
- 워크로그가 전혀 없는 멤버 비용: `unallocatedActualCost`

---

### 4.5 일 배치 스냅샷은 “안내 플래그”만으로 부족하다

**결함/위험**

같은 화면에서 현재 명단/기간과 전날 비용·가동률이 함께 보이면 사용자는 수정 결과를 잘못 해석한다. 특히 오늘 기간을 줄인 직후 실시간 상세과 스냅샷 집계가 반대 결과를 보일 수 있다.

**근거**

- §6.2: 전사 스냅샷은 다음 배치까지 갱신하지 않고 안내 플래그만 반환
- §4 B4/B5는 스냅샷 소비
- §11도 소급 변경 위험을 인정

**구체적 수정 제안**

- 스냅샷에 `assignmentRevision`, `computedAt`, `asOfDate` 저장
- 현재 revision과 다르면 UI에서 값 자체를 `STALE`로 표시
- 가능하면 프로젝트 단위 재집계 큐를 저장 직후 enqueue
- 즉시 재집계가 불가능하면 stale 스냅샷과 실시간 값을 같은 합계에 혼합하지 않음
- 응답 상태를 표준화

```js
{
  freshness: 'CURRENT' | 'STALE' | 'COMPUTING',
  computedAt,
  sourceRevision,
  currentRevision
}
```

---

## 5. 경계면 계약과 검증 빈틈

### 5.1 `undefined ≠ null`은 JSON 경계에서 “필드 생략 ≠ null”로 표현해야 한다

**결함/위험**

JSON에는 `undefined` 값이 없다. JavaScript 객체 직렬화 과정에서 필드가 사라진다. SQL의 기존 `CASE ''` 패턴도 null과 미변경을 자연스럽게 구분하지 못한다.

**근거**

- §6.1은 `undefined=미변경`, `null=상속`이라고 정의
- `UPDATE_BY_KEY_WITH_PARAMS`는 빈 문자열 sentinel을 사용
- 날짜의 null은 실제 저장값으로 필요

**구체적 수정 제안**

계약을 다음처럼 문서화한다.

- 필드 부재: 미변경
- 명시적 `null`: 상속으로 초기화
- 문자열 날짜: 해당 날짜로 변경
- `allocationPct`:
  - 필드 부재: 미변경
  - 정수 0~100: 변경
  - null 허용 여부 별도 결정

SQL은 동적 `SET` 또는 presence flag를 사용한다.

```sql
joined_at = CASE WHEN ? THEN ? ELSE joined_at END
```

첫 번째 파라미터는 `hasJoinedAt`이다.

---

### 5.2 추가 모달 기본값이 null 상속과 충돌한다

**결함/위험**

UI가 프로젝트 시작·종료일을 실제 값으로 저장하면, 프로젝트 기간이 나중에 바뀌어도 이 인원은 상속하지 않는다. 사용자는 기본값을 골랐을 뿐인데 명시적 고정값이 된다.

**근거**

- §1: null이면 프로젝트 기간 상속
- §7/G2: 추가 모달 기본값을 프로젝트 기간으로 설정
- §11: 프로젝트 기간 변경과 소급 재계산이 중요

**구체적 수정 제안**

UI에 상속 상태를 명시한다.

- 체크박스: “프로젝트 기간 사용”
- 선택 시 DB에는 null 저장
- 체크 해제 시 날짜 입력 활성화
- 화면에는 계산된 effective 날짜를 보여주되 raw 값과 구분

```js
{
  joinedAt: null,
  leftAt: null,
  effectivePeriod: {...},
  inheritsProjectStart: true,
  inheritsProjectEnd: true
}
```

---

### 5.3 프로젝트 기간 변경 시 기존 인원 처리 정책이 없다

**결함/위험**

프로젝트 기간을 줄이거나 늘릴 때 다음이 결정되지 않았다.

- null 상속 인원은 자동 변화
- 명시 기간 인원은 클램프만 변화
- 완전히 비겹치게 된 인원 처리
- 캐시/스냅샷 invalidation
- UI 경고 해제 방식
- 과거 계획값 소급 변경

**근거**

- D3은 프로젝트 기간 밖 값을 허용하는 이유로 프로젝트 기간 변경을 든다.
- 실제 프로젝트 기간 변경 workflow는 설계에 없다.

**구체적 수정 제안**

프로젝트 날짜 변경을 assignment 변경과 동일한 영향 범위로 취급한다.

- 저장 전 영향 인원 수 계산
- 변경 응답에 `affectedAssignments`, `newlyEmptyAssignments`
- `assignmentRevision` 증가
- 관련 캐시와 스냅샷 stale 처리
- 완전 비겹침 인원에 대해:
  - 자동 삭제 금지
  - `EMPTY` 상태로 유지
  - 관리자에게 정리 필요 경고

---

### 5.4 `allocation_pct=0`의 의미가 조회·카운트마다 다를 수 있다

**결함/위험**

0% 인원이 다음 중 어디에 포함되는지 명확하지 않다.

- 현재 참여 프로젝트 수
- active allocation 관계도
- 팀/프로젝트 member count
- 계획 부하
- 실제 가동률
- 후보의 already assigned 판정
- 비용, 특히 `PROJECT_FIXED`

**근거**

- §1은 0을 “대기·명목 배정”으로 허용
- C1/C2 조건은 기간만 보고 0%를 제외하지 않음
- D2 후보 필터는 Σpct<100이므로 0% 인원은 투입 가능
- D1에 따라 `PROJECT_FIXED` 비용은 0%여도 전액

**구체적 수정 제안**

0%를 별도 상태로 정의한다.

권장:

- roster/member count: 포함
- active assignment count: 제외 또는 별도 `nominalAssignmentCount`
- planned load: 0으로 포함
- already assigned: true
- 비용:
  - `PROJECT_FIXED`: 전액이나 UI 경고
  - prorated 유형: 0
- 실제 워크로그: 허용하되 `actualAgainstZeroPlan` 경고
- 계획 소진율: null

---

### 5.5 날짜 기준과 시간대가 혼재한다

**결함/위험**

SQL `CURDATE()`, Node `new Date().toISOString()`, `todayYmd()`가 서로 다른 시간대를 사용하면 자정 전후 참여 여부가 달라질 수 있다.

**근거**

- C1/C2는 `CURDATE()`
- `ProjectCostService.js`는 UTC 기반 `toISOString()`
- `PortfolioAggregator`는 별도 `today()`
- 시스템 운영 시간대는 설계에 없다.

**구체적 수정 제안**

`asOfDate`를 요청/서비스 진입점에서 한 번 결정해 모든 계산에 전달한다.

- 기본 business timezone을 설정
- SQL에도 `asOfDate`를 파라미터로 전달
- 테스트에서 UTC/KST 날짜 경계 검증
- 스냅샷에는 `asOfDate` 저장

---

### 5.6 additive 응답에서 “구버전 미집계”와 실제 null을 구별할 수 없다

**결함/위험**

필드가 없으면 “집계 전”, null이면 “계산 불가”라고 암묵적으로 구분하지만, 여러 소비자가 `?? 0`을 사용하면 다시 왜곡된다.

**근거**

- §6.1은 additive와 필드 부재 의미를 규정
- 비용 `byTeam` 교훈을 언급
- E1은 오래된 snapshot에 필드가 없을 수 있음

**구체적 수정 제안**

응답 schema version과 명시적 상태를 추가한다.

```js
{
  schemaVersion: 2,
  plannedMd: {
    status: 'AVAILABLE' | 'NOT_COMPUTED' | 'NOT_APPLICABLE',
    value: 12.5
  }
}
```

모든 필드에 객체를 쓰기 어렵다면 상위에 `computedCapabilities` 배열을 둔다.

---

## 6. 계획 기반 모드의 완성도

### 6.1 워크로그 0 조직에서 계획값만으로 “진척”은 알 수 없다

**결함/위험**

워크로그가 없으면 표시 가능한 것은 배정량과 시간 경과 기반 비용뿐이다. 실제 수행량이나 계획 달성도를 알 수 없으므로 “계획 소진율”은 계속 0이고, 이것이 지연인지 미기록인지 구분되지 않는다.

**근거**

- §5: 계획 소진율은 `실적 MD / 계획 MD`
- 실적 MD 원천은 워크로그
- §0.2는 워크로그 없는 조직에서도 자원 계획 앱으로 동작한다고 주장

**구체적 수정 제안**

워크로그 없는 모드의 핵심 KPI를 “소진율”이 아니라 capacity 계획으로 둔다.

- 계획 배정 MD
- 미래 가용 MD
- 과할당 일수
- 미배정 capacity MD
- 역할/팀별 수요 대비 공급
- 참여 시작 예정/철수 예정
- 월별 계획 부하

“계획 소진율”은 실적 데이터가 존재하는 경우에만 활성화한다.

```text
actualDataStatus = NONE | PARTIAL | AVAILABLE
```

---

### 6.2 계획 인건비와 계획 MD의 관계가 정의되지 않았다

**결함/위험**

ANNUAL·LEVEL_BAND 비용은 달력일/30.4375 기반이고 계획 MD는 근무일 기반이다. 같은 50% 배정이라도 공휴일이 많은 달에는 MD당 비용이 상승한다. `PROJECT_FIXED`는 둘의 관계가 더 약하다.

**근거**

- §1: 계획 MD는 공휴일 제외 근무일
- §2.2: 급여 월할은 달력일/30.4375
- D1: PROJECT는 기간·투입률 미적용

**구체적 수정 제안**

다음 지표를 구분한다.

- `plannedAllocatedCost`: 급여 정책에 따른 배정 비용
- `plannedMd`: 근무일 capacity
- `plannedCostPerMd = plannedAllocatedCost / plannedMd`
- `fixedProjectBudget`: PROJECT_FIXED 총액

`fixedProjectBudget / plannedMd`를 인건비 단가처럼 자동 해석하지 않도록 한다.

---

### 6.3 계획 부하의 월별 정의가 불완전하다

**결함/위험**

“월별 Σ pct”는 하나의 월 값으로 어떻게 축약하는지가 없다.

예를 들어 한 프로젝트는 월초, 다른 프로젝트는 월말에 각각 100%여도 단순 월별 합은 200%처럼 보일 수 있다.

**근거**

- §5: `계획 부하(기간) = 월별 Σ pct (달력)`
- 일별 투입률 변경은 비범위지만 참여 시작/종료일은 일 단위다.

**구체적 수정 제안**

일별 계획 부하를 원자 지표로 정하고 월 값은 파생한다.

- `dailyLoadPct(date) = Σ active allocationPct`
- 월 평균: 근무일 가중 평균
- 월 최대: `max dailyLoadPct`
- 과할당 일수: `count(load>100)`
- 월 가용 MD: `Σ max(0, 1-load/100)`

UI에서는 평균만 보여주지 말고 `평균/최대/과할당 일수` 중 최소 두 개를 제공한다.

---

### 6.4 공급만 있고 수요가 없다

**결함/위험**

계획 부하는 사람이 얼마나 배정됐는지만 보여준다. 프로젝트가 실제로 몇 MD를 필요로 하는지 없으므로 100%가 적정한지 판정할 수 없다.

**근거**

- 신규 지표는 allocation 합계와 기간에 기반
- 기존 `plannedTotalMd`는 이슈 기반 값으로 보이지만 assignment 계획과의 관계가 없다
- ResourceMatch는 가동률/잔여량 중심

**구체적 수정 제안**

최소한 다음 비교 축을 정의한다.

```text
assignmentCapacityMd
issueDemandMd
demandGapMd = issueDemandMd - assignmentCapacityMd
```

이슈 계획 공수가 신뢰되지 않는 조직이라면 프로젝트 또는 역할별 수요 MD를 별도 입력하는 후속 범위를 명시해야 한다.

---

## 7. P0~P3 순서와 검증 전략

### 7.1 P1에서 지표가 바뀌는데 편집·확인 UI가 P3인 순서는 위험하다

**결함/위험**

P0에서 저장은 가능하지만 일반 사용자가 값을 확인·수정하는 UI는 P3까지 없다. P1에서 비용과 가동률이 바뀌면 운영자가 원인을 추적하기 어렵다.

**근거**

- P0: DDL·API·쿼리
- P1: 비용·가동률 변경
- P3: 인력 목록·모달 UI

**구체적 수정 제안**

최소 관리 UI를 P0에 포함한다.

- 프로젝트 인력 목록에서 raw/effective 기간과 allocation 표시
- 단건 편집
- 상속 여부 표시
- clamp/empty 경고

대시보드 시각화와 고급 위젯만 P3으로 미룬다.

---

### 7.2 비용/EVM 변경은 계획 기반 모드와 분리하는 것이 안전하다

**결함/위험**

P1은 기간 분모, 급여 월할, AC, 그룹 비용, 이슈 비용, 스냅샷을 동시에 바꾼다. 문제가 생기면 어느 산식 때문인지 격리하기 어렵다.

**근거**

- A1~A3와 B1~B5가 P1에 집중
- 현재 비용 캐시는 hit/miss 경로가 별도
- D1/D6의 의미가 아직 미확정

**구체적 수정 제안**

범위를 다음처럼 재배치한다.

- P0: 모델·API·최소 UI·MemberPeriod·revision
- P1: 계획 MD·오늘/기간 계획 부하·ResourceAnalysis 명단 기반 응답
- P2: 실제 가동률 분모 변경
- P3: 급여 월할·비용/EVM 변경
- P4: 스냅샷·포트폴리오·배정 추천 통합

특히 D6과 PROJECT_FIXED 비용 의미가 확정되기 전에는 비용 변경을 시작하지 않는 것이 좋다.

---

### 7.3 기능 플래그 또는 dual calculation이 필요하다

**결함/위험**

프로덕션에 바로 나가는 앱에서 전사·프로젝트·비용 지표를 일괄 교체하면 회귀를 비교할 기준이 없다.

**근거**

- 앱은 프로덕션 배포 코드
- §3은 기존 지표 전면 교체
- §10은 P0~P1 사이 정합성 검증만 언급

**구체적 수정 제안**

일정 기간 서버에서 구·신 산식을 함께 계산하되 응답/운영 진단으로 차이를 비교한다.

```js
{
  metricVersion: 'assignment-v2',
  diagnostics: {
    legacyValue,
    assignmentValue,
    deltaReason
  }
}
```

민감정보나 대량 로그 대신, 권한 있는 진단 응답 또는 테스트 fixture에서만 제공한다.

---

### 7.4 SQL 문자열 snapshot만으로는 조건 의미를 검증하지 못한다

**결함/위험**

SQL 문자열이 예상 문구를 포함해도 null 상속, 미래 시작, 프로젝트 기간 클램프가 틀릴 수 있다.

**근거**

- §8은 C1~C3에 SQL 문자열 snapshot을 제시
- C1 제안 자체가 프로젝트 미래 시작을 놓치고 있다.

**구체적 수정 제안**

DB/Repository 계약 테스트에 다음 행 조합을 넣는다.

- 프로젝트 미래 시작 + 멤버 null 시작
- 프로젝트 종료 null
- 멤버 미래 시작
- 멤버 철수 오늘
- 완전 비겹침
- allocation 0
- 프로젝트 기간 밖 raw 값
- 삭제된 프로젝트/고아 member
- `CURDATE` 대신 고정 `asOfDate`

---

### 7.5 필수 검증 불변식을 추가해야 한다

**결함/위험**

현재 테스트 목록은 개별 함수 중심이며 생산자·소비자 간 정합성 검증이 부족하다.

**구체적 수정 제안**

다음 통합 불변식을 추가한다.

- cache hit 응답 = cache miss 응답
- 구버전 snapshot fallback과 현재 응답의 상태 구분
- `actualMdTotal = actualMdInPeriod + outOfPeriodMd`
- `plannedMd=0 → planAttainment=null`
- `Σ member plannedMd = project plannedMd`
- 그룹 actual 합계 = 프로젝트 actual
- 프로젝트 명단에 있고 워크로그 0인 사람도 ResourceAnalysis에 존재
- 동일 `asOfDate`에서 C1 active count와 planned load의 활성 판정이 동일
- 프로젝트 날짜 변경 후 모든 관련 cache revision 불일치
- null 상속과 명시적으로 프로젝트 날짜를 저장한 경우의 차이
- 권한에 따라 비용 필드가 다른 일반 DTO로 새지 않음

---

### 7.6 먼저 잘라내야 할 범위

다음은 첫 배포에서 분리하는 것이 좋다.

- EVM의 CPI/EAC/ETC 재정의
- 이슈별 비용 재안분
- 월별 비용 소진 재작성
- 월별 계획 부하 위젯
- 추천 정렬에서 계획 부하와 기존 `utilBand` 혼합
- 엑셀/PPT 문구 정비

1차 범위는 “기간·투입률의 정확한 저장/표시 + 계획 capacity + 명단 기반 ResourceAnalysis”가 적절하다. 비용은 D1/D6와 cache revision이 닫힌 다음 단계가 안전하다.

---

## 8. 추가해야 할 결정 항목

| 결정 | 결정해야 할 내용 | 권장안 |
|---|---|---|
| D7 | 기간 외 워크로그의 지표별 처리 | 총 실적에는 포함, 기간 기반 가동률·계획 달성률에서는 제외, 별도 예외 MD 표시 |
| D8 | 무기한 참여의 계획 horizon | 전체 계획값은 null, 조회 범위/as-of 범위 값만 계산 |
| D9 | allocation 0의 의미 | 명단에는 포함, active assignment count는 별도, 계획 소진율 null, 실제 발생 시 경고 |
| D10 | 프로젝트 기간 변경 시 인원 처리 | raw 값 보존, effective 값 재계산, empty 상태 경고, revision 증가 |
| D11 | 지표 명칭과 canonical denominator | 실제 가동률·계획 달성률·계획 부하·이슈 계획 소진율을 별도 ID로 관리 |
| D12 | 캐시·스냅샷 일관성 | 프로젝트 `assignmentRevision`과 `computedAt/asOf`를 모든 파생값에 포함 |
| D13 | 날짜 기준과 timezone | 단일 business timezone 및 요청별 `asOfDate` 사용, SQL에도 파라미터 전달 |
| D14 | `PROJECT` 비용 의미 | `PROJECT_FIXED`로 명명하고 배정 기반 계획비와 분리 |
| D15 | 다중 구간 이전 전략 | 지금 구간 테이블 도입 또는 내부 모델을 지금부터 assignments 배열로 정규화 |
| D16 | 월 계획 부하 축약법 | 근무일별 계산 후 월 평균·최대·과할당 일수 제공 |
| D17 | 비용 반올림과 잔차 | 프로젝트 총액 기준으로 그룹/멤버 잔차 배분, 합계 불변식 보장 |
| D18 | 워크로그 없는 멤버/비멤버 작성자 | 결과 집합을 roster ∪ worklogAuthors로 구성하고 상태 구분 |
| D19 | 계획 MD의 기간 종류 | 전체 계획 MD, 경과 계획 MD, 조회 범위 계획 MD를 별도 필드로 제공 |
| D20 | 수정 이력과 소급성 | 최소한 변경자·시각·이전/이후 기간·allocation 감사 기록 또는 후속 필수 범위 |
| D21 | 추천 신호 우선순위 | `plannedLoadPct>100`과 기존 `utilBand`, `EXTERNAL_OVERLOAD`의 우선순위 및 중복 표시 정의 |
| D22 | 상속 UI 계약 | “프로젝트 기간 사용”을 명시하고 null 저장, 계산된 날짜와 raw 날짜 분리 |

---

## 우선순위 상위 5개 수정

| 순위 | 수정 | 이유 | 선행 단계 |
|---:|---|---|---|
| 1 | D6을 수정해 `actualMdInPeriod`, `outOfPeriodMd`, `actualMdTotal`을 분리 | 현재안은 가동률·계획 소진율·이슈 비용을 동시에 왜곡한다 | 구현 전 |
| 2 | `assignmentRevision`과 `asOfDate`를 도입해 캐시·스냅샷 계약 통일 | SQL 변경, KVS 캐시, 일 배치 결과가 서로 다른 시점을 보이는 문제를 막는다 | P0 |
| 3 | null/빈 구간/무기한/프로젝트 날짜 변경 규칙 확정 | 현재 산식은 open-ended 프로젝트와 완전 비겹침 구간을 계산하지 못한다 | P0 |
| 4 | ResourceAnalysis를 워크로그 기준이 아니라 `roster ∪ worklogAuthors` 기준으로 재설계 | 워크로그 0 조직에서 계획 기반 모드가 실제로 보이기 위한 필수 조건이다 | P1 |
| 5 | 비용/EVM 변경을 후순위로 분리하고 지표 사전·소비처 매트릭스를 세분화 | `burnRate`, 그룹 비용, byIssue, snapshot 사이의 의미 불일치와 회귀 범위가 너무 크다 | 단계 재편 전 |
