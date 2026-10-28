# 03. 통합 정합성 검증 리포트 — 진척도(Progress) 페이지

> 검증일: 2026-05-29 / 작성: integration-verifier
> 방법: 생산자(백엔드) ↔ 소비자(프론트) **양쪽 동시 읽기** 교차 비교 + jest/build 실행.
> 기준: `01_architect_design.md` §5·§6, `02_backend_report.md` §3 응답 shape.

---

## 요약

| 분류 | 건수 |
|------|------|
| **통과** | 21 |
| **실패** | 0 |
| **미검증** | 2 |

발견된 경계면 불일치: **0건**. 코드 수정 없음. 백엔드/프론트 테스트·빌드 전부 통과.

---

## 1. 경계면 교차 검증 (생산자 ↔ 소비자)

### [통과] #1 응답 shape — 루트 펼침형
- 생산자: `src/utils/ResponseWrapper.js:5` → `{ success: true, ...result }` (content 래핑 없음).
- 생산자: `ProjectProgressService.js:162` `assembleResponse`가 `{ ...payload, diagnosis, issues }` 반환.
- 소비자: `ProgressPage.jsx:117-119` `data.success` / `data.project` / `data.effort` **루트 직접 접근**(`data.content.*` 아님).
- 판정: 펼침형 일치. responseWrapper가 success를 동급으로 펼침 → 프론트 접근 경로 정확.

### [통과] #2 rate 스케일 (0~1 ↔ ×100)
- 생산자: `ProjectProgressService.js:139,143` `completion.rate`/`schedule.rate`는 0~1(소수 둘째자리). `ProgressCalculator.js:53-59` `issueProgress`도 0~1.
- 생산자: `computeDiagnosisRates`(`ProgressCalculator.js:179-182`)는 `diffPercentPoint`/`effortVsCompletion`을 이미 ×100(%p)한 값으로 반환.
- 소비자: `ProgressHeader.jsx:6` `pct = rate*1000/10` (×100), `:7` `pp`는 %p 그대로. `ProgressBars.jsx:6` `clampPct` ×100, `:23,64` effortVsCompletion 그대로. `ProgressRiskTable.jsx:93` `progressRate*100`.
- 판정: rate는 양쪽 0~1 ↔ ×100 정합, %p 값은 양쪽 추가변환 없음. **100배 오류 없음.**

### [통과] #3 함수 매핑 (등록 ↔ invoke fnName)
- 생산자: `src/index.js:24` import, `:50` `registerProjectProgressController(resolver)` 등록. `ProjectProgressController.js:6` `resolver.define('getProjectProgressSummary', ...)`.
- 소비자: `ProgressPage.jsx:95` `invoke('getProjectProgressSummary', {...})`.
- 판정: fnName 완전 일치, 등록 누락 없음. payload 구조분해 `({ payload }) =>`도 `ResourceAnalysisController.js:6`과 동일 패턴.

### [통과] #4 completion.cumulative (빈 배열 ↔ 토글 비활성)
- 생산자: `ProjectProgressService.js:141` `cumulative: []` 항상 빈 배열.
- 소비자: `ProgressSCurve.jsx:95` `mode='effort'` 고정, `:152,155` 토글 버튼 `disabled`, `:158` 안내문. `completion.cumulative`를 어디서도 읽지 않음(`:108-109`는 `effort.*Cumulative`만 사용).
- 판정: 빈 배열 크래시 없음. 토글 비활성+안내 정상.

### [통과] #5 diagnosis.status read-time
- 생산자: `ProjectProgressService.js:53-55` settings 매 호출 조회(threshold 캐시 미포함), `:144` 캐시엔 `diagnosisRates`(rate 차이)만, `:162-168` `assembleResponse`에서 read-time `diagnoseStatus(diffPercentPoint, thresholdPP)` 산출.
- 소비자: `ProgressHeader.jsx:27` `data.diagnosis.status`를 그대로 신뢰(배지 매핑).
- 판정: threshold가 10분 TTL에 막히지 않고 read-time 적용. 프론트는 status 신뢰만 — 정합.

### [통과] #6 issues[] 필드명 (캐시 미포함 ↔ 프론트 필터)
- 생산자: `ProjectProgressService.js:124,128-153` 캐시 payload에 `issues[]` **미포함**. `buildIssuesFromNorm`(`:172-206`)이 `{key,summary,statusKey,statusName,assignee,startDate,dueDate,plannedMd,actualMd,progressRate,effortDeviationMd,delayDays,lastWorklogDate}` 반환.
- 소비자: `ProgressRiskTable.jsx:15` `statusKey`/`delayDays`, `:17` `effortDeviationMd`, `:93` `progressRate`, `:83` `assignee.{displayName,avatarUrl}`. 전부 생산자 필드명과 일치.
- 판정: 필드명 100% 일치. 캐시 hit 경로도 `buildIssuesArray`(`:210-226`)로 매번 재구성.

### [통과] #7 쿼리키 팩토리
- 소비자: `projectKeys.js:20-22` `progress: (projectId, params) => ['projectProgress', projectId, params]`. `ProgressPage.jsx:94` `projectKeys.progress(project_id, {startDate, endDate})` 사용(인라인 배열 아님).
- 판정: 팩토리 정의·사용 정합.

### [통과] #8 i18n 키 존재 + merge 반영
- 소비자: 프론트 progress 컴포넌트 5개 + ProgressPage가 참조하는 70여 개 `projectDetail.analysis.progress.*` 키 전수 추출.
- 생산자: `locales/kr/projectDetail.json:91 "analysis"` → `:209 "progress"`(중첩 확인) 블록에 전 키 존재(filter/badge/header/bar/sCurve/status/risk). `tabs.progressAnalysis`(`:9`)도 존재.
- merge 산출물: `locales/ko-KR.json:667` `analysis.progress` 동일 중첩 반영. `locales/en/projectDetail.json:209,242,253,264` en 키(optimisticApprox/effortVsCompletionHint/completionDisabled) 존재.
- 빌드 시 prebuild merge 실행 확인(merge.js 경고 출력 = 실행됨).
- 판정: 누락 키 0개. ko-KR/en-US 직접 수정 아님(merge 산출물).

### [통과] #9 권한 게이트
- 소비자: `ProjectDetailTabs.jsx:9` `canRead('REPORT')` → `:11-14` `projectDetailTabs(t,project_id,toast,canReadReport)` 주입. `tabs.js:48` 시그니처 `canReadReport`, `:125-134` `key:'projectProgress'` 탭 `canRender: () => canReadReport`.
- `usePermissionStore.js:50-52` `canRead(pageId)`는 `permissions[pageId].read ?? false`.
- 판정: REPORT 권한 게이트 주입 경로 정상. 형제 분석탭(issue/resource)은 무게이트 현행 유지(§6 #9 일치).

---

## 2. §6 보정 코드 반영 검증

### [통과] MD 변환 초 Σ 후 1회 (#8)
- `ProgressCalculator.js:81-95` `computeEffortTotals`: `plannedSec`/`actualSec` 초 단위 누적 후 `round1(plannedSec/denom)` 1회 변환. 이슈별 round 합산 아님.

### [통과] 예측지연 remaining 기반 (#4)
- `ProgressCalculator.js:259` `remainingMd = round1(Math.max(plannedSeconds - actualSeconds, 0)/denom)`. full plannedMd 아님. `:274` `optimisticApprox: true`. `:258` Done 제외, remaining>0만.

### [통과] 확정지연 분리 (#7)
- `ProgressCalculator.js:198-223`: `delays`(>0)/`leads`(<0) 분리. `avgDelayDays`는 `delays`만(`:216`), 조기완료 `avgLeadDays`/`earlyCount` 분리(`:220-221`). `delayedRatio`는 evaluated 대비(`:217`).

### [통과] 층1 계획선 순수 선형 BAC 도달 (#3)
- `ProgressCalculator.js:135-155` `generatePlanLine`: 영업일(주말+holidaySet 제외) 균등 분배, 마지막 idx에 `plannedTotalMd` 직접 대입(`:153`)으로 끝점 정확 도달. `computeLeaveDeductionMap` 미사용(import도 없음). 가용률 보정 없음.

### [통과] 완성률 산식 (Q1/Q4)
- `ProgressCalculator.js:53-59` 진행중 = `min(actualSeconds/plannedSeconds, 1)`, done=1, todo=0. `:66-76` `computeCompletion`: planSec null/≤0 이슈는 분모·분자 제외(`:70`). Done 판정 `statusKey==='done'`(`:43`).

---

## 3. 성능 규칙 검증

### [통과] 워크로그 전용 병렬 페처 재사용
- `ProjectProgressService.js:2,70,213` `getResourceProjectWorklogs` 재사용. `ResourceWorklogFetcher.js:9,77` p-limit(FETCH_CONCURRENCY=5). 공통 WorklogService 경로 미수정(import 없음).

### [통과] KVS 캐시 키/TTL
- `ProjectProgressService.js:57` 키 `ProjectProgress:{projectId}:{startDate}:{endDate}`, `:155` TTL 10분(MINUTES). ResourceAnalysisService 동일 패턴. issues[]·threshold 캐시 미포함.

---

## 4. 실행 검증 결과

### 백엔드 (루트 `npm test`)
```
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
Test Suites: 2 passed, 2 total / Tests: 21 passed, 21 total
```

### 프론트 (`cd static/ui && CI=true npm test`)
```
PASS jqlMaker / listUtils / numberUtils / TimeUtils
Test Suites: 4 passed / Tests: 21 passed (회귀 없음)
```

### 프론트 빌드 (`CI=true npm run build`)
```
Compiled with warnings. / The build folder is ready to be deployed.
```
- 경고는 **기존 source map 경고**(@atlaskit/analytics-next-stable-react-context, marklassian의 .ts 부재) + merge.js MODULE_TYPELESS 경고뿐. progress 코드 오류·ESLint 경고 없음.
- prebuild에서 merge 자동 실행 확인됨.

---

## 5. 미검증 항목 (추측 통과 금지)

### [미검증] M-1. Jira 런타임 응답의 coworker 필드 실제 형태
- `ProgressCalculator.js:20` `f[coworkerFieldId]`를 배열로 가정(`.map`). API(`IssueApi.js:315`)가 fields에 coworkerFieldId를 포함해 페치하는 것은 확인했으나, Jira가 해당 커스텀필드를 배열로 반환하는지는 **실제 Jira 인스턴스 응답 없이 확인 불가**. 단 `(f[coworkerFieldId] || [])`로 null-safe 처리되어 크래시는 없음. totalWorkers 계산 정확도만 영향(예측지연 분모).
- 비고: 기존 `IssueAnalysisService`/myWork도 동일 가정 사용 → 기존 검증된 패턴 추정이나 본 검증 범위에서 런타임 확인 불가.

### [미검증] M-2. settings.progressThreshold 시드 부재 시 동작
- `ProjectProgressService.js:55` `settings?.progressThreshold ?? DEFAULT_THRESHOLD(5)`. 백엔드 리포트 §7대로 현재 시드에 `progressThreshold` 필드 없음 → 기본 5%p로 동작(코드상 안전). 실제 settings 화면에서 이 값을 저장/변경하는 경로는 이번 범위 외(미구현)이며, 본 검증은 기본값 fallback 동작만 코드로 확인. KVS 런타임 read 결과는 미검증.

---

## 6. 결론

- 9개 핵심 경계면 + §6 보정 5건 + 성능 2건 = **전부 통과, 불일치 0건**.
- 응답 shape(루트 펼침형), rate 스케일(0~1↔×100), 함수 매핑, issues 필드명, i18n 키·중첩 네임스페이스, 권한 게이트 모두 생산자/소비자 정합.
- 백엔드 21 + 프론트 21 테스트 통과, 빌드 성공(신규 경고 없음).
- 미검증 2건은 모두 **런타임 의존(실제 Jira 응답·KVS 값)**이라 코드 검증 범위 밖이며, 양쪽 모두 null-safe/fallback 처리되어 크래시 위험 없음.
