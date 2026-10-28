# 02. 백엔드 구현 리포트 — 진척도(Progress) 페이지

> 구현일: 2026-05-29 / 작성: backend-engineer
> 설계서 `01_architect_design.md` §2-2(1) + §5 확정결정 + §6 리뷰반영을 그대로 구현.
> 프론트(frontend-engineer)는 이 리포트의 **응답 shape**을 글자 그대로 소비할 것.

---

## 1. 구현 파일 목록

| 파일 | 역할 |
|------|------|
| `src/resolver/projectProgress/ProgressCalculator.js` | **순수 계산 로직**(Forge 의존성 없음, 단위 테스트 대상). 정규화·완성률·공수 totals·계획선·실제누적·진단·확정/예측 지연·상태분포. |
| `src/resolver/projectProgress/ProjectProgressService.js` | 오케스트레이션(병렬 페치 + KVS 캐시 + 응답 조립). `getProjectProgressSummaryService` export. |
| `src/resolver/projectProgress/ProjectProgressController.js` | resolver 등록. `registerProjectProgressController(resolver)` export. resolver 함수명 = **`getProjectProgressSummary`**. |
| `src/resolver/projectProgress/__test__/ProgressCalculator.test.js` | jest 단위 테스트(17 케이스). |
| `src/index.js` | 컨트롤러 import + `registerProjectProgressController(resolver)` 등록 추가. |

resolver 함수: **`getProjectProgressSummary`** (1개). `responseWrapper`로 감쌈.

---

## 2. 입력 (invoke payload)

```js
invoke('getProjectProgressSummary', { projectId, startDate, endDate, coworkerFieldId })
```
- `threshold`는 입력 아님 — settings KVS `progressThreshold`에서 read-time 적용(기본 5%p).
- `projectId` 누락 시 `LogicalError('PROJECT_ID_REQUIRED')` → `{success:false, error}`.

---

## 3. 실제 응답 shape (responseWrapper가 success/error를 붙인 최종 형태)

> 프론트는 `invoke` 결과를 **루트에서 직접** 읽는다(이 resolver는 `content`로 감싸지 않음 — 다른 분석 resolver(`getResourceAnalysisList`)와 동일하게 success와 동급 필드로 펼쳐짐).
> 즉 `const res = await invoke(...); res.effort.plannedTotalMd` 식으로 접근.

```jsonc
{
  "success": true,
  "hourRate": 8,
  "project": { "startDate": "2026-01-01", "endDate": "2026-06-30", "memberCount": 5 },
  "workDays": { "total": 120, "elapsed": 80 },
  "effort": {
    "plannedTotalMd": 250.5,
    "actualTotalMd": 180.0,
    "plannedCumulative": [ { "date": "2026-01-01", "cumulative": 2.1 }, ... ],
    "actualCumulative":  [ { "date": "2026-01-02", "cumulative": 1.5 }, ... ]
  },
  "completion": {
    "rate": 0.62,            // 0~1, 소수 둘째자리
    "earnedMd": 155.3,
    "cumulative": []         // 항상 빈 배열 (아래 4번 참고 — 데이터 한계상 일별 완성진척 추이 산출 불가)
  },
  "schedule": { "rate": 0.67 },   // 0~1
  "diagnosis": {
    "diffPercentPoint": -5.0,     // (완성률 - 일정률) × 100  ← 주 신호(규칙1)
    "effortVsCompletion": 3.0,    // (공수율 - 완성률) × 100  ← 보조(규칙2, 과신 금지)
    "status": "caution"           // read-time 산출: normal | caution | delayed
  },
  "delayConfirmed": {
    "avgDelayDays": 4.0,   // 지연(>0)만 평균
    "delayedRatio": 0.3,   // 지연이슈 / 평가가능 Done이슈
    "maxDelayDays": 12,
    "count": 3,            // 지연 이슈 수
    "avgLeadDays": 2.0,    // 조기완료(음수) 절대값 평균
    "earlyCount": 5        // 조기완료 이슈 수
  },
  "delayPredicted": {
    "estimatedEndDate": "2026-07-10",  // 미완료 이슈 estimatedEndDate(remaining 기반)의 max, 없으면 null
    "predictedDelayDays": 10,          // estimatedEndDate - 프로젝트 종료일 (일)
    "optimisticApprox": true           // 항상 true (낙관 근사 — UI에 명시 권장)
  },
  "statusDistribution": {
    "byCount":  { "done": 12, "inProgress": 5, "todo": 8 },
    "byEffort": { "doneMd": 120.0, "inProgressMd": 50.5, "todoMd": 80.0 }
  },
  "baseline": {
    "source": "live",
    "plannedTotalMd": 250.5,
    "plannedCumulative": [ { "date": "...", "cumulative": ... }, ... ]  // effort.plannedCumulative와 동일(베이스라인 분리 네임스페이스)
  },
  "issues": [
    {
      "key": "PROJ-12",
      "summary": "...",
      "statusKey": "done",            // Jira statusCategory.key: new | indeterminate | done
      "statusName": "완료",
      "assignee": { "accountId": "...", "displayName": "...", "avatarUrl": "..." } | null,
      "startDate": "2026-02-01" | null,
      "dueDate": "2026-02-20" | null,
      "plannedMd": 10.0 | null,        // null = originalEstimate 없음
      "actualMd": 8.5,
      "progressRate": 1,               // 0~1 (done=1, inProgress=min(actual/plan,1), todo=0)
      "effortDeviationMd": -1.5 | null,// actualMd - plannedMd (plannedMd null이면 null)
      "delayDays": 3 | null,           // Done&워크로그: 완료일-due / 미완료: today-due / due 없으면 null
      "lastWorklogDate": "2026-02-23" | null
    }
  ]
}
```

실패 시(공통): `{ success:false, error:{ name, code, message, cause } }`.

---

## 4. 프론트가 반드시 주의할 점

1. **`completion.cumulative`는 항상 빈 배열 `[]`.** 일별 완성진척 추이는 상태전이 이력·일별 처리율 데이터가 없어 산출 불가(설계서 §3·§2-2 명시). 화면 C "완성진척 추이 토글"은 단일시점 `completion.rate`만 신뢰. 빈 배열일 때 토글 비활성 또는 "데이터 한계" 안내 처리.
2. **응답은 `content`로 감싸지 않음.** `res.effort`, `res.issues` 등 루트 직접 접근. (CLAUDE.md의 `result.content` 패턴은 이 resolver에 해당 안 됨 — `ResourceAnalysisService`와 동일하게 펼침형.)
3. **`diagnosis.status`는 read-time 계산값**이라 settings의 `progressThreshold`를 바꾸면 10분 캐시와 무관하게 즉시 반영됨. 단 `diffPercentPoint`/`effortVsCompletion`/모든 rate·누적은 10분 캐시.
4. **규칙2(`effortVsCompletion`) 과신 금지** — Q1(완성률=min(actual/plan)) 때문에 진행중 이슈에서 침묵하는 구간 존재(§6 #2). UI 헤더/툴팁에 "주 신호는 규칙1(완성 vs 일정)" 명시.
5. **`delayPredicted.optimisticApprox: true`** — 병렬 불가를 무시한 낙관 근사. 예측 지연 카드에 "낙관 근사치, 정밀 추세선 후속" 표기.
6. **rate 값은 0~1 스케일**(퍼센트 아님). `diffPercentPoint`/`effortVsCompletion`만 %p 단위(×100 완료된 값).
7. `statusKey`는 Jira `statusCategory.key`(`new`/`indeterminate`/`done`). 화면 D·E 필터는 이 키 기준. `todo`= `new` 또는 statusKey null.

---

## 5. KVS 캐시 & 성능

- **캐시 키**: `ProjectProgress:{projectId}:{startDate}:{endDate}`, **TTL 10분** (`ResourceAnalysisService` 동일 패턴).
- **캐시 페이로드에 포함되지 않는 것**(§6 #5·#6):
  - `threshold`(settings에서 read-time) → `diagnosis.status`는 캐시된 `diffPercentPoint`에 응답 시점 threshold 적용.
  - `issues[]`(대형 배열) → **캐시에 저장 안 함**. 캐시 hit/miss 모두 매 호출 워크로그+이슈를 다시 가져와 `issues[]`만 재구성(`buildIssuesArray`). 이로써 Forge KVS value 크기 한도 회피. issues 항목은 요약 필드만(전체 Jira 객체 미보관).
- **재사용 페처**:
  - 워크로그 → `ResourceWorklogFetcher.js:getResourceProjectWorklogs` (전용 병렬 페처 p-limit=5). 공통 WorklogService 경로 미수정.
  - 이슈 전체 → `IssueApi.js:getProjectIssuesByFilter` + `nextPageToken` 루프(maxResults=100), 엑셀 다운로드 함수와 동일 검증 패턴.
  - 메타 → `getSummaryDataService({project_id})`, 공휴일 → `getPublicHolidayListService`, 설정 → `getSettingDataService`.
- **참고(성능 절충)**: 캐시 hit 시에도 `issues[]` 구성 위해 워크로그·이슈를 재페치한다. 집계(rate/누적)는 캐시로 보호되지만 issues 재페치 비용은 매 호출 발생. 향후 부담되면 §6 #6 대안(별도 `getProjectProgressRiskIssues` 페이징 분리)으로 회귀 가능.

---

## 6. 확정 결정 반영 체크 (§5·§6)

- [x] 층2 진행률: done=100 / inProgress=min(actualSec/plannedSec,1) / todo=0. 완성률=Σ(진행률×planSec)/Σ(planSec), planMd null 분모 제외. Done=`statusCategory.key==='done'`.
- [x] 층1 계획선: 순수 영업일 선형(`generatePlanLine`), 끝점 plannedTotalMd 정확 도달. 가용률 보정 미적용(`computeLeaveDeductionMap` 미사용). 공휴일·주말은 영업일에서만 제외.
- [x] 층3: 경과WorkDay/전체WorkDay (`getWorkdaysInRange`).
- [x] MD 변환(#8): plannedTotalMd/actualTotalMd 초 단위 Σ 후 1회 `round(Σsec/(hourRate*3600))`.
- [x] 예측지연(#4): 이슈별 remaining=max(plannedSec-actualSec,0) 기반 estimatedEndDate의 max vs 종료일. `optimisticApprox:true`.
- [x] 확정지연(#7): 완료일=Done&마지막 워크로그일, delayDays=완료일-due. avgDelayDays는 지연만, 조기완료 avgLeadDays/earlyCount 분리.
- [x] threshold(#5): settings에서 read-time, 캐시 미포함. status read-time 산출.
- [x] 1MM 동적(getMonthMm 패턴), hourRate=getSettingData.
- [x] baseline 분리(source:'live'), issues[] 응답 포함·캐시 분리.

---

## 7. 테스트 결과

```
npm test (jest, 루트)
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
Test Suites: 2 passed, 2 total
Tests:       21 passed, 21 total
```

- 신규 17 케이스(진행률/완성률/공수totals/일정/계획선/실제누적/진단/확정지연/예측지연/상태분포/예측종료일) 전부 통과.
- 기존 `CommonQuery.test.js` 회귀 없음.
- Service(`ProjectProgressService`)는 Forge KVS/Jira API 의존이라 단위테스트 대신 순수 계산 로직(`ProgressCalculator`)을 분리해 검증. 통합 검증은 integration-verifier 단계에서.

### settings 신규 필드 안내
- `progressThreshold`는 settings KVS에서 `?? 5`로 읽음. **현재 시드에 필드 없음** → 기본 5%p로 동작. settings에 필드를 추가하려면 백오피스 setting 화면/`updateSettingService` 확장 필요(이번 범위 외, §5 Q6 권장안이나 시드 미추가). 현 상태로도 안전하게 기본값 적용.
