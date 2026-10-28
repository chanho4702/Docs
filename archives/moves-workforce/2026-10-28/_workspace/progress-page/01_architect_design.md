# 프로젝트 진척도(Progress) 페이지 — 1~2단계 조사 산출물

> 범위: **조사·검토·질문 정리만**. 구현 없음. 설계서 전체가 아니라 4개 섹션 산출물.
> 근거는 모두 실제 파일 Read/Grep 확인. 확인 못 한 부분은 "미확인" 표기.

---

## 1. 데이터 모델 / 기존 API 조사 결과

### 1-1. 진척 산출에 필요한 데이터별 조달 경로 (파일:함수, 응답 형태)

| 데이터 | 조달 위치 | 함수 / 필드 | 응답 형태 | 비고 |
|--------|-----------|-------------|-----------|------|
| **이슈 계획공수(MD)** | Jira REST (백엔드 경유) | `src/api/jira/issue/IssueApi.js:getProjectIssuesByFilter` → `IssueAnalysisService.js:getIssueAnalysisListService` | `plannedMd = round(originalEstimateSeconds / (hourRate*3600))` | 출처는 Jira `timetracking.originalEstimateSeconds`. 없으면 `null`. |
| **이슈 실투입공수(MD)** | 동일 | 동일, `timeSpentSeconds` | `actualMd = round(timeSpentSeconds/(hourRate*3600))` | Jira가 워크로그 합산을 timetracking에 자동 유지 |
| **이슈 처리율(%)** | **미확인 / 부재** | — | — | **코드 전체에 처리율/percent/progress 필드 없음**(Grep 확인). custom field는 projectId·coworker 2개뿐(`constants/customField.js`). → 섹션 3·4 참고 |
| **이슈 상태 / Done 매핑** | Jira REST | `issue.fields.statusCategory` (key: `new`/`indeterminate`/`done`) | `status: { key, name, colorName }` | Done 판정은 `statusCategory.key === 'done'` 으로 이미 사용 중(`IssueAnalysisTable.jsx:DeviationCell`, `IssueAnalysisService.js` 엑셀). **Moves의 KVS `status` 엔티티는 프로젝트 수명주기 상태(칸반)지 이슈 상태가 아님**(`SeedData.js:addStatusSeed`, `ProjectStatusService.js`). |
| **워크로그(이슈연결/작성일/공수)** | Jira REST | `ResourceWorklogFetcher.js:getResourceProjectWorklogs` (전용 병렬 페처, p-limit=5) / 단일이슈는 `IssueAnalysisService.js:getIssueWorklogDetailService` | `{ issueKey, issueSummary, accountId, date(YYYY-MM-DD), timeSpentSeconds }` | 작성일 = `log.started.substring(0,10)`. 누적 집계 로직(`cumulativeByDate`) 이미 존재 |
| **프로젝트 시작·종료일** | MySQL | `ProjectDashboard.js:GETSUMMARY` → `ProjectDashboardService.js:getSummaryDataService` (resolver `getSummaryData`) / 또는 `ProjectQuery.FIND_BY_ID` | `{ start_date, end_date, total_member_count, total_salary, project_name }` | 프론트는 이미 `SummaryPanel.jsx`에서 `invoke('getSummaryData',{project_id})` 호출 |
| **WorkDay(근무일) 정의** | 공통 유틸 | `static/ui/src/utils/workday.js` + `src/utils/workday.js`(동일 로직) `getWorkdaysInRange / getMonthMm / workdayValue` | 주말=0, 평일·공휴일=workRatio, 평일·비공휴일=1 | 경과/전체 WorkDay 계산에 그대로 재사용 가능 |
| **인원수** | MySQL | `ProjectDashboard.js:GETSUMMARY` `COUNT(DISTINCT pu.account_id) AS total_member_count` | 정수 | 프로젝트 인력 테이블(projectusers) 기준. **시점 변동 미반영(현재 스냅샷만)** → 섹션 4 |
| **휴일(공휴일)** | KVS | `PublicHolidayService.js:getPublicHolidayListService` | `{ data: [{ holidayDate, workRatio }] }` | `buildHolidayMap`으로 맵 변환 |
| **개인 연차/반차(가용률)** | MySQL | `MyScheduleRepository.jsx:getProjectWorkersScheduleRepository({projectId,startDate,endDate})` | `[{ account_id, schedule_start_date, schedule_end_date, work_ratio }]` | `ResourceAnalysisService.js:computeLeaveDeductionMap`이 근무일 단위 차감(연차 1.0/반차 0.5/출장 0) 이미 구현 |
| **1Day 시간(hourRate)** | KVS settings | `SettingService.js:getSettingDataService` (resolver `getSettingData`) | `{ currency, hourRate }` | 기본 8. **하드코딩 금지** — 이 값 사용 |
| **1MM 일수** | **저장값 없음 — 동적 계산** | `workday.js:getMonthMm(year,monthIdx,holidayMap)` | 그 달 근무일 수(평일−공휴일) | settings에 1MM 일수 필드 없음(`SeedData.js:addSettingSeed`는 currency·hourRate만). 월별로 계산됨. → 섹션 4 |
| **이슈 시작일** | Jira REST | `issue.fields.customfield_10015` | `YYYY-MM-DD` | Jira "start date" 표준 필드(하드코딩됨, `IssueApi.js:getProjectIssuesByFilter` baseFields) |
| **이슈 기한(duedate)** | Jira REST | `issue.fields.duedate` | `YYYY-MM-DD` | |
| **예측 종료일(이슈단위)** | 백엔드 계산 | `IssueAnalysisService.js:calcEstimatedEndDate` | `ceil(plannedMd/totalWorkers)` 영업일(주말·공휴일 제외) | 이슈 카드 단위. 프로젝트 전체 추세 예측은 별도(섹션 3) |

### 1-2. 재사용 가능한 자산 목록

**백엔드 resolver/Service (그대로 재사용 또는 호출):**
- `getIssueAnalysisList` (`IssueAnalysisController.js`) — 이슈별 plannedMd/actualMd/status/start/due/estimatedEndDate. 페이지네이션(nextPageToken). **화면 D·E·층2 원천.**
- `getIssueWorklogDetail` — 단일 이슈 날짜별 누적 MD(`cumulativeByDate`). 차트 S-curve.
- `getResourceAnalysisList` (`ResourceAnalysisController.js`) — 프로젝트 단위 1회 페치 + **KVS 캐시(10분)**. 워크로그 합산·effectiveDays·monthMmMap·baseMmDays·hourRate.
- `getResourceWorklogDetail` — 일/주/월 집계.
- `getSummaryData` (`ProjectDashboardController` 계열) — 프로젝트 start/end/인원수.
- `getSettingData`, `getPublicHolidayList`, `getProjectStatusList`.

**백엔드 유틸/페처:**
- `ResourceWorklogFetcher.js:getResourceProjectWorklogs` — **전용 병렬 페처(p-limit=5)**. 진척도 페이지 워크로그도 이 패턴/이 함수를 재사용(공통 경로 수정 금지 원칙 충족).
- `src/utils/workday.js`, `IssueAnalysisService.js:calcEstimatedEndDate`.

**프론트 컴포넌트(요구사항 명시 "그대로 따름"):**
- **S-curve 차트**: `IssueAnalysisChart.jsx` — 계획누적(점선)/실제누적(실선)/오늘 markLine/예측종료 markLine/편차 bar 전부 구현됨. **화면 C에 거의 그대로 차용.** `generatePlanLine`(영업일 선형분배), `buildChartOption`.
- **기간 필터(빠른선택+날짜지정)**: `ResourceAnalysisPage.jsx`의 `getQuickRange / QUICK_FILTERS / datePickerSelectProps / handleQuickFilter` 블록 + CSS(`ResourceAnalysisPage.css`). **화면 비기능요구의 기간필터에 그대로 차용.**
- 막대 차트: `ResourceAnalysisChart.jsx:buildBarOption` (화면 D 상태별 분포 막대에 응용).
- `Card`(`components/card/Card.jsx`), `UserAvatar`, `IssueComponent`/`StatusComponent`(`components/issue/IssueComponent`), `CursorPagingTable`, `DynamicTable`, `useColorMode`, `useI18nStore`, `usePermissionStore`.

**프론트 쿼리키 팩토리:** `static/ui/src/utils/queryKey/projectKeys.js`. (단, 분석 페이지들은 현재 인라인 쿼리키 `['issueAnalysisList',...]` 사용 중 — CLAUDE.md 원칙상 신규는 팩토리 정의 권장. → 섹션 4 결정사항)

---

## 2. 추가로 필요한 엔드포인트 / 집계 목록

### 2-1. 기존으로 충당 가능 (신규 불필요)
- 프로젝트 start/end/인원수 → `getSummaryData`
- 설정/공휴일/스케줄 → `getSettingData` / `getPublicHolidayList` / (내부) `getProjectWorkersScheduleRepository`
- 이슈별 plannedMd/actualMd/status/due → `getIssueAnalysisList` (페이지네이션이므로 **전체 합산 집계엔 부적합** — 아래 신규에서 전체 조회 필요)

### 2-2. 신규 resolver (가칭) — 진척도 전용 집계

> 핵심 사유: 진척도 3층/진단/지연은 **프로젝트 전체 이슈 + 전체 워크로그를 1회 집계**해야 하는데, 기존 `getIssueAnalysisList`는 페이지 단위라 Σ 계산 불가. 따라서 `ResourceAnalysisService` 패턴(프로젝트 단위 1회 페치 + KVS 캐시)을 그대로 따른 **신규 도메인 `src/resolver/projectProgress/`** 를 제안.

#### (1) `getProjectProgressSummary` — 화면 A·B·C·D 종합
- **입력**: `{ projectId, startDate, endDate, coworkerFieldId, threshold? }`
- **출처**: Jira(이슈 전체·페이지네이션 루프) + KVS(settings, holiday, status) + MySQL(getSummaryData, schedule) + 전용 워크로그 페처
- **예상 응답 shape 초안**:
```
{
  success: true,
  // 메타
  hourRate, project: { startDate, endDate, memberCount },
  workDays: { total, elapsed },                      // 층3
  // 층1 공수
  effort: {
    plannedTotalMd,                                  // Σ 이슈 plannedMd
    plannedCumulative: [{ date, cumulative }],       // 일별 보정(가용률) 누적
    actualCumulative:  [{ date, cumulative }],       // 워크로그 일별 누적
    actualTotalMd
  },
  // 층2 완성
  completion: {
    rate,                                            // Σ(진행률×planMd)/Σ(planMd)
    earnedMd,                                         // = plannedTotalMd × rate
    cumulative: [{ date, rate }]                     // 완성진척 추이(토글용, 조건부—섹션3)
  },
  // 층3 일정
  schedule: { rate },                                // 경과WorkDay/전체WorkDay
  // 진단
  diagnosis: { status: 'normal'|'caution'|'delayed', diffPercentPoint, effortVsCompletion },
  // 지연(확정)
  delayConfirmed: { avgDelayDays, delayedRatio, maxDelayDays, count },
  // 지연(예측)
  delayPredicted: { estimatedEndDate, predictedDelayDays },   // 조건부—섹션3
  // 화면 D
  statusDistribution: {
    byCount:  { done, inProgress, todo },
    byEffort: { doneMd, inProgressMd, todoMd }
  }
}
```
- **성능**: 결과 전체를 `ProjectProgress:{projectId}:{startDate}:{endDate}` KVS 캐시(10분), `ResourceAnalysisService` 동일 패턴. 워크로그는 `getResourceProjectWorklogs` 재사용(전용 병렬 페처). 이슈 전체는 `getProjectIssuesByFilter` nextPageToken 루프(엑셀 다운로드 함수가 이미 동일 루프 사용 — `downloadIssueAnalysisExcelService`).

#### (2) `getProjectProgressRiskIssues` — 화면 E (지연·위험 이슈 목록)
- **입력**: `{ projectId, startDate?, endDate?, coworkerFieldId, page?/maxResults? }`
- **출처**: Jira 이슈 + 워크로그 마지막 작성일
- **예상 응답 shape**:
```
{ success: true, issues: [{
    key, summary, assignee, dueDate, statusKey,
    progressRate,        // 조건부(섹션3)
    delayDays,           // 확정: 완료일−duedate / 미완료: today−duedate
    effortDeviationMd,   // actualMd − plannedMd
    lastWorklogDate
}], total }
```
- **판정 대상**: 기한초과 미완료 / 처리율 정체 / 공수편차 큰 이슈. **"처리율 정체"는 처리율 데이터 부재 시 산출 불가 → 섹션 3·4.**
- **대안**: 화면 E는 별도 resolver 없이 (1)이 반환하는 이슈배열을 프론트에서 필터링하는 방안도 가능. (1)에 `issues[]` 원본을 포함시키면 E도 충당 가능 → 결정사항(섹션4).

#### (3) (선택) `getProjectProgressTrend` — 완성진척 추이 분리
- 화면 C "완성진척 추이 토글"을 일자별로 재구성하려면 **각 이슈의 완료 시점(상태전이일) 또는 일자별 처리율 스냅샷**이 필요. 현재 데이터로는 일자별 완성률 시계열을 정확히 못 만든다(처리율·상태전이 이력 부재). → **조건부/불가**, 섹션 3·4.

### 2-3. 성능 규칙 준수 방안 (명시)
- **워크로그 다건** → `getResourceProjectWorklogs` (전용 병렬 페처, p-limit) 재사용. 공통 `WorklogService` 경로 **수정 안 함**.
- **Resource류 집계** → 프로젝트 단위 1회 페치 + KVS 캐시(`ProjectProgress:*`, TTL 10분). Forge SQL 적재 없음.
- 이슈 전체 조회는 `maxResults=100` nextPageToken 루프(기존 엑셀 함수 검증된 패턴).

---

## 3. 계산식 산출 가능 여부 검토

| 항목 | 산식 | 판정 | 근거 / 부족분 |
|------|------|------|---------------|
| **층3 일정 진척** | 경과WorkDay / 전체WorkDay | **가능** | `workday.js:getWorkdaysInRange`(start~today, start~end) + holidayMap. 이슈·공수 무관. |
| **층1 계획 누적 공수** | 일별 = 전체계획MD/(전체WorkDay×인원), 연차·휴일 보정 | **가능(조건부 정밀도)** | plannedTotalMd(Σ이슈), 전체WorkDay, 인원수(getSummaryData), 가용률(computeLeaveDeductionMap) 전부 존재. 단 "개인별 일별 보정"을 프로젝트 누적선에 어떻게 합산할지는 설계 정의 필요(인원 평균 가용률 vs 개인합). |
| **층1 실제 누적 공수** | 워크로그 일별 합산 누적 | **가능** | `getResourceProjectWorklogs` + 누적(이미 `cumulativeByDate` 로직 존재). |
| **층2 완성 진척률** | Σ(이슈진행률×planMd)/Σ(planMd) | **조건부** | planMd·Done판정 가능. **진행중 이슈 "진행률(처리율)"의 원천이 부재**(섹션1-1). 아래 3가지 중 택1 필요(섹션4 Q1·Q4). Done=100%캡, Todo=0%는 가능. |
| ↳ 진행중 진행률 후보 | (a) actualMd/plannedMd 캡100% / (b) Jira 처리율 필드 / (c) 0% 취급 | — | (a)는 현재 데이터로 즉시 가능하나 "공수≠완성" 요구 철학과 충돌(공수를 완성률로 오용). (b)는 필드 부재로 불가. → 사용자 결정. |
| **층2 MD 환산(실적기성MD)** | 전체계획MD × 완성률 | **가능(완성률 확정 시)** | |
| **진단 규칙 1 (완성 vs 일정)** | 완성−일정 vs ±threshold | **가능(완성률 확정 시)** | threshold 기본 5%p, 저장위치 미정(섹션4 Q). |
| **진단 규칙 2 (공수 vs 완성)** | 공수율 vs 완성률 비교 | **가능(완성률 확정 시)** | 공수율 = actualTotalMd/plannedTotalMd. |
| **확정 지연** | 완료일(Done & 마지막 워크로그일)−duedate, 평균/비율/최대 | **가능** | Done판정 + duedate + 마지막 워크로그일(워크로그 `date` max). 단 "완료일=마지막 워크로그일"은 근사(상태전이일 아님) — 요구사항이 그렇게 정의함. 워크로그 없는 Done 이슈는 완료일 추정 불가(섹션4). |
| **예측 지연(추세)** | 완성진척 추세 연장 → 예상완료일 − 종료일 | **불가/조건부** | 일자별 완성률 시계열이 있어야 추세 회귀 가능. 현재 일자별 완성률을 못 만듦(상태전이 이력·일별 처리율 부재). **대안**: 실제누적공수 추세(층1) 또는 완성률 단일시점 기반 선형 외삽으로 근사 → 정의·승인 필요(섹션4). |
| **화면 D 개수 기준 분포** | done/inProgress/todo 개수 | **가능** | statusCategory.key 집계. |
| **화면 D 공수 기준 분포** | 상태별 Σ planMd (또는 actualMd) | **가능** | |
| **화면 C 완성진척 추이(토글)** | 일자별 완성률 곡선 | **불가/조건부** | 위 예측지연과 동일 사유. 단일 시점 완성률만 신뢰 가능. |

**요약 판정**: 층3·층1 = 가능. 층2·진단·확정지연 = **처리율 정의(Q1)만 확정되면 가능**. 예측지연·완성진척 일자별 추이 = **현재 데이터로 정밀 산출 불가**(상태전이 이력/일별 처리율 부재) → 근사 방식 승인 필요.

---

## 4. 모호/불가 항목 질문 정리 (사용자 결정 필요)

> 각 질문에 **권장안 + 선택지**. requirement의 확인 4개 + 조사 중 발견 추가.

### Q1. 진행중 이슈 "처리율(진행률)" 데이터 — 신뢰성/입력 여부 (가장 중요, 층2의 핵심)
- **코드 근거**: 처리율/percent/progress 필드가 **코드 전체에 없음**(Grep). 커스텀필드는 projectId·coworker 2개뿐(`constants/customField.js`). 이슈 분석도 `actualMd/plannedMd`만 사용.
- **권장안**: **(a) 진행중 진행률 = min(actualMd/plannedMd, 100%)** 로 정의(현재 데이터로 즉시 가능, 추가 입력 불필요).
- **선택지**:
  - (a) actualMd/plannedMd 캡100% — 즉시 가능. 단 "공수≠완성" 철학과 일부 충돌(완성률이 공수 소진율과 동조).
  - (b) Jira 별도 진행률 필드 도입(예: 신규 custom field "진행률%") — 정확하나 manifest 변경+입력 운영 필요.
  - (c) 진행중=0% 보수적 취급 — 완성률이 Done만 반영. 단순하나 진행중 기여 누락.

### Q2. "Done 카테고리" 판정 기준 매핑
- **코드 근거**: 이미 `statusCategory.key === 'done'` 사용(`IssueAnalysisTable.jsx`, `IssueAnalysisService.js`). Moves KVS `status`는 프로젝트 상태(칸반)라 이슈에 부적합(`SeedData.js`, `ProjectStatusService.js`).
- **권장안**: **Jira `statusCategory.key`(new/indeterminate/done) 사용** — 기존 분석 페이지와 동일, 일관성 보장.
- **선택지**: (a) statusCategory.key 표준(권장) / (b) 특정 상태명 화이트리스트를 설정에서 관리(유연하나 신규 설정·UI 필요).

### Q3. 인원수/가용 인원 시점별 변동 반영
- **코드 근거**: `total_member_count`는 projectusers 현재 스냅샷(`ProjectDashboard.js:GETSUMMARY`). 시점별 합류/이탈 이력 테이블 없음(미확인).
- **권장안**: **현재 인원수 단일값으로 층1 계획선 산출**(MVP). 가용률 보정만 기간 내 schedule로 일별 반영.
- **선택지**: (a) 현재 인원 고정(권장, 단순) / (b) 향후 인원 변동 이력 테이블 신설 후 일별 인원 반영(범위 확대).

### Q4. 처리율 누락 이슈 fallback
- **권장안**: planMd 없는 이슈는 **완성률 가중 분모에서 제외**(가중치 0), 진행중이며 처리율 없으면 Q1 정책 따름.
- **선택지**: (a) planMd null → 가중 제외(권장) / (b) planMd null이지만 Done이면 별도 표기 후 제외 / (c) 기본 처리율 0% 부여.

### Q5. (추가) 예측 지연 추세 산출 방식
- **코드 근거**: 일자별 완성률 시계열 산출 불가(상태전이 이력·일별 처리율 부재). 이슈단위 예측종료일(`calcEstimatedEndDate`)만 존재.
- **권장안**: **MVP에서는 예측 지연을 "이슈별 estimatedEndDate의 최대값 vs 프로젝트 종료일"로 근사**, 또는 층1 실제누적공수 추세 외삽. 정밀 추세선은 후속.
- **선택지**: (a) 이슈 estimatedEndDate max 기반 근사(권장, 기존자산 재사용) / (b) 실제누적공수 선형회귀 외삽 / (c) 예측 지연 카드 보류(확정 지연만 표기).

### Q6. (추가) threshold 저장 위치
- **권장안**: **settings KVS에 `progressThreshold` 필드 추가**(기본 5%p). hourRate처럼 `getSettingData`로 읽기, 하드코딩 금지.
- **선택지**: (a) settings KVS 확장(권장) / (b) 프론트 상수 + 화면 토글만 / (c) 프로젝트별 저장(범위 확대).

### Q7. (추가) 1MM 일수 — 설정 vs 동적 계산
- **코드 근거**: settings에 1MM 일수 필드 없음(`SeedData.js:addSettingSeed`는 currency·hourRate만). Resource 분석은 월별 `getMonthMm` 동적 계산.
- **권장안**: **MD 환산을 1차 표기**로 하고 MM 환산은 Resource 패턴(월별 동적 1MM) 재사용. 요구사항의 "1MM 일수 설정에서 읽기"는 현재 저장값 없음 → 동적값 사용으로 진행 확인 필요.
- **선택지**: (a) 동적 getMonthMm 사용(권장, 기존 일관) / (b) settings에 고정 1MM 일수 신설.

### Q8. (추가) 베이스라인 분리 방식
- **코드 근거**: 계획 기준은 현재 Jira originalEstimate 실시간 조회(스냅샷 없음).
- **권장안**: 백엔드 응답에서 **계획 데이터(plannedTotalMd, plannedCumulative)를 `baseline` 네임스페이스로 분리** 반환 → 향후 스냅샷 모드 추가 시 출처만 교체. 이번엔 source='live'.
- **선택지**: (a) 응답 구조만 baseline 분리(권장, 저비용) / (b) 이번 범위 제외.

### Q9. (추가) 화면 E를 별도 resolver로 둘지
- **권장안**: (1) `getProjectProgressSummary`에 `issues[]` 원본 포함 → 화면 E는 프론트 필터링. resolver 1개 절약.
- **선택지**: (a) 통합(권장) / (b) `getProjectProgressRiskIssues` 분리(페이징 필요 시).

### Q10. (추가) 권한 키
- **코드 근거**: 권한 페이지키에 `REPORT` 존재(`SeedData.js:addPermissionSeed`). 단 분석 탭들이 현재 canRender로 REPORT를 거는 코드는 미발견(`tabs.js`에서 analysisReport children에 canRender 없음 — Grep 결과 없음).
- **권장안**: 진척도 탭 `canRender: () => canRead('REPORT')` 적용(요구사항 "권한 관리 리포트 항목 Read/Write 준수").
- **선택지**: (a) REPORT 권한 적용(권장) / (b) 무권한(기존 분석탭과 동일하게 열어둠 — 단 요구사항 위배).

---

## 핵심 발견 요약 (구현 착수 전 필독)
1. **S-curve·기간필터·막대차트·이슈집계는 이미 분석 페이지에 구현되어 있어 신규 패턴 불필요** — `IssueAnalysisChart`(계획/실제 누적+오늘/예측 markLine+편차), `ResourceAnalysisPage`(빠른필터), `ResourceWorklogFetcher`(전용 병렬 페처), `workday.js`를 그대로 차용.
2. **"이슈 처리율" 데이터가 코드 어디에도 없다** — 층2 완성 진척의 핵심 입력이라 Q1 결정 전엔 완성률 산식 확정 불가. 사실상 actualMd/plannedMd 외 진행률 원천 없음.
3. **일자별 완성률 시계열(상태전이 이력)이 없어 "예측 지연·완성진척 추이 토글"은 정밀 산출 불가** → 근사 방식 승인 필요(Q5).
4. **Done 판정·프로젝트 메타·가용률·공휴일·hourRate는 모두 기존 resolver로 충당** — 신규는 프로젝트 단위 1회 집계 resolver(`getProjectProgressSummary`) 1~2개면 충분(KVS 캐시 패턴).
5. **1MM 일수는 settings에 없고 월별 동적 계산** — 요구사항 "설정에서 읽기"와 차이(Q7). i18n 실제 원천은 `locales/kr|en/*.json`(`locales/script/*.json`는 빈 스텁, merge.js는 kr/en을 읽음).

---

## 5. 결정 사항 (사용자 확정 — 2026-05-29)

### 사용자 직접 결정 (AskUserQuestion)
- **Q1 처리율** → **공수비율 캡**: 진행중 진행률 = `min(actualMd/plannedMd, 100%)`. 완료=100%캡, 할일=0% 고정. planMd 없으면 Q4 정책.
- **Q5 예측 지연** → **이슈 예측종료일 max 근사**: `calcEstimatedEndDate` 이슈별 값의 최대 vs 프로젝트 종료일. 정밀 추세선은 후속.
- **Q3 인원수** → **현재 인원 고정(MVP)**: `total_member_count` 단일값으로 층1 계획선. 가용률만 일별 보정.
- **Q7 1MM** → **동적 계산(getMonthMm)**: Resource 분석과 동일 월별 동적 산출. settings 신규 필드 없음.

### 권장안으로 진행 (사용자 별도 이의 없을 시)
- **Q2 Done 매핑** → Jira `statusCategory.key === 'done'` (기존 분석 페이지와 동일).
- **Q4 처리율 누락 fallback** → planMd null 이슈는 완성률 가중 분모에서 제외(가중치 0).
- **Q6 threshold 저장** → settings KVS에 `progressThreshold` 필드 추가(기본 5%p), `getSettingData`로 읽기.
- **Q8 베이스라인** → 응답에서 계획 데이터를 `baseline` 네임스페이스로 분리, `source:'live'`.
- **Q9 화면 E** → `getProjectProgressSummary` 응답에 `issues[]` 포함, 프론트 필터링(resolver 1개로 통합).
- **Q10 권한** → 탭 `canRender: () => canRead('REPORT')`.

### 구현 단계 착수 시 검증할 사항 (열린 항목)
- **i18n 경로**: CLAUDE.md는 `locales/script/` 기준이나 실제 merge.js는 `locales/kr|en/`을 읽고 script는 빈 스텁. 구현 시 `npm run merge` 동작을 실제 확인 후 올바른 경로에 키 추가.
- 신규 도메인 `src/resolver/projectProgress/` + resolver `getProjectProgressSummary`(KVS 캐시 `ProjectProgress:{projectId}:{start}:{end}`, TTL 10분). 워크로그는 `getResourceProjectWorklogs` 재사용, 이슈 전체는 nextPageToken 루프.
- 탭 등록: `static/ui/src/constants/tabs.js`의 `projectDetailTabs` **최상위**(analysisReport children 아님). 신규 폴더 `static/ui/src/pages/projectDetail/progress/`.

---

## 6. 설계 리뷰 반영 (사용자 전문 리뷰 — 2026-05-29)

### 즉시 채택 (베스트프랙티스 확정)
- **[#2 규칙2 한계 박제]** Q1(완성률=min(actual/plan))로 인해 진행중 이슈의 완성률=공수소진율이 되어 **진단 규칙2(공수 vs 완성)가 정상 구간에서 침묵**한다(actual<planned 진행중 이슈는 완성−공수 차이에 0 기여). 규칙2는 사실상 "공수 초과/완료 효율 탐지기"로 격하. **MVP 수용하되 UI(헤더/툴팁)에 "규칙2 과신 금지, 주 신호는 규칙1(완성 vs 일정)" 명시.** 의미 있는 신호는 규칙1로 좁혀짐.
- **[#4 예측 편향]** 예측 종료일 계산은 `full plannedMd` 대신 **`remaining = max(plannedMd − actualMd, 0)`** 사용(거의 끝난 이슈 과대추정 제거). 단 이슈별 전인원 투입 가정값의 max는 **병렬 불가를 무시 → 프로젝트 종료 과소추정(지연 낙관 편향)**. 예측 지연 카드에 "낙관 근사치, 정밀 추세선 후속" 명시.
- **[#5 threshold×캐시]** `progressThreshold`는 캐시 페이로드에 **불포함**. KVS 캐시에는 `rate`류만 저장, `diagnosis.status`(normal/caution/delayed)는 **read-time에 settings threshold 적용**해 계산. threshold 변경이 10분 TTL에 막히지 않게.
- **[#7 확정지연 음수]** `delayConfirmed.avgDelayDays`는 **지연(delayDays>0) 이슈만** 대상(delayedRatio·maxDelayDays와 일관). 조기완료(선행, 음수)는 평균 왜곡 방지 위해 **별도 지표 `avgLeadDays`/`earlyCount`로 분리**.
- **[#8 MD 누적오차]** `plannedTotalMd`/`actualTotalMd`는 **초 단위로 먼저 Σ한 뒤 1회 변환**(`round(Σsec/(hourRate*3600))`). 이슈별 round 후 합산 금지.

### 응답 shape 보정 (위 반영)
```
// 캐시 대상: rate/누적/원시 집계만
completion: { rate, earnedMd, cumulative:[...] },
effort: { plannedTotalMd, actualTotalMd, plannedCumulative:[...], actualCumulative:[...] },
schedule: { rate },
delayConfirmed: { avgDelayDays /*지연만*/, delayedRatio, maxDelayDays, count, avgLeadDays, earlyCount },
delayPredicted: { estimatedEndDate /*remaining 기반*/, predictedDelayDays, optimisticApprox: true },
statusDistribution: { byCount:{...}, byEffort:{...} }
// 비캐시(read-time): diagnosis.status는 settings.progressThreshold로 응답 시 산출
diagnosis: { diffPercentPoint, effortVsCompletion }  // status는 read-time 부착
```

### 열린 항목 추가
- **[#6 KVS 페이로드 한도]** Q9 `issues[]` 통합 확정 → 구현 시 **최대 예상 이슈수 × 이슈당 payload vs Forge KVS value 한도** 검증. `issues[]`는 캐시 엔트리에 넣지 않거나(요약 rate만 캐시), 한도 초과 시 (b)분리 `getProjectProgressRiskIssues`(페이징)로 회귀.

### #3·#9 최종 확정 (사용자 결정 — 2026-05-29)
- **[#3 계획선] → 순수 선형(BAC 도달).** 층1 PV 계획 누적선은 `generatePlanLine`(순수 영업일 선형)을 그대로 사용해 **끝점이 정확히 plannedTotalMd에 도달**. **개인 연차/반차 가용률 보정은 계획선에서 제거**(별도 capacity선도 MVP에서 미도입). 공휴일·주말은 `workday.js` 영업일 산정으로 자연 반영. → §3의 "연차·휴일 보정" 주장 폐기, `computeLeaveDeductionMap`은 층1 계획선에 미사용(향후 capacity선 도입 시 재활용). Q8 baseline 충돌 해소.
- **[#9 권한] → 진척도만 게이트(최소).** 진척도 탭 `canRender: () => canRead('REPORT')`. 형제 분석탭(issueAnalysis/resourceAnalysis)은 현행(게이트 없음) 유지. 탭 간 게이트 불일치는 **후속 통일 과제로 분리**(이번 범위 외, 기존 탭 동작 변경 회피).
