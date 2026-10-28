# 프로젝트 대시보드·진척도 로직 및 효율성 검토

검토일: 2026-09-07. 앱 파일은 수정하지 않았다. 실제 생산자·소비자 소스를 읽고, 외부 I/O를 대역한 재현을 실행했다. 실사이트 Jira 가시성·응답 시간·Forge 메모리는 측정하지 않았다.

## 1. P1 — 사용자별 Jira 결과를 프로젝트 공용 진척도 캐시에 저장한다

- 핵심 위치: `src/resolver/projectProgress/ProjectProgressService.js:46`, `:49`, `:52`, `:144`.
- 경로: `useProjectProgressSummary.js:40` → `ProjectProgressController.js:6` → Service → `fetchAllProjectIssues` 및 `getResourceProjectWorklogs`의 기본 `as='user'` 조회 → `ProjectProgress:${projectId}` KVS 저장.
- Controller는 principal/context를 서비스에 넘기지 않고, 캐시 키도 사용자·가시성 정보를 포함하지 않는다. 캐시 hit에서는 현재 사용자의 이슈 배열만 다시 만들고, 총공수·완성률·실제 공수 일별 누적선·지연 등은 이전 호출자의 값으로 반환한다.
- 재현: A는 PUBLIC-1(계획 1MD/실제 0MD)와 SECRET-1(계획 9MD/실제 9MD)을 볼 수 있고, B는 PUBLIC-1만 볼 수 있게 I/O 대역을 바꾼다. A 조회 후 B 조회의 `issues`는 1건·1MD이지만 `effort.plannedTotalMd=10`, `completion.rate=0.9`다. B가 먼저 조회하면 A의 집계도 과소값이 된다.
- 영향: 사용자의 Jira 가시성과 어긋나는 집계 및 동일 응답 내 불일치. 원문 이슈 이름/키는 이 캐시로 유출되지 않지만 숨겨진 이슈의 공수·일자별 집계 정보가 섞인다. DashboardAggregate의 의도된 asApp 집계 정책과 별개로 Progress는 현재 asUser 계약이므로 두 범위를 명확히 결정해야 한다.
- 효율성: 캐시 hit의 `buildIssuesArray`(`:201`~`:205`)도 이슈와 전체 기간 워크로그를 다시 수집한다. 재현의 첫 miss/두 번째 hit 모두 양 페처가 실행되어 각 2회였다. 비싼 Jira 전체 수집은 생략되지 않고, 같은 원천을 갱신하면서 요약만 낡게 유지한다. 실제 Jira 요청 개수·시간은 데이터 페이지 수에 따라 달라 미측정이다.
- 개선 방향: 사용자별 조회라면 신뢰할 수 있는 context accountId를 전달하고 캐시 범위를 분리한다. 현재처럼 매번 전체 원천을 읽는다면 그 원천으로 요약까지 다시 계산해 응답 시점을 맞추는 방안이 단순하다. 집계만 필요한 S-curve와 위험 목록을 분리할 때는 필요한 집계만 캐시하고 원문 조회를 지연시키는 방안도 검토한다. 키를 변경하면 `ProjectService.js:112`, `ProjectDeletionService.js:116`의 무효화도 함께 바꿔야 한다.

## 2. P2 — REPORT 권한이 없으면 상태별 MD 계산에 설정값 대신 8시간을 쓴다

- 핵심 위치: `src/resolver/projectDashboard/DashboardAggregateService.js:89`, `:95`, `:99`, `:117`.
- 생산자: `getSettingDataService()`를 `includeMetrics`가 참인 경우에만 실행하지만 `statusDistribution.byEffort`는 모든 사용자에게 계산·반환한다. REPORT 권한이 없으면 설정이 null이므로 `hourRate=8`로 고정된다.
- 소비자: `static/ui/src/constants/dashboardWidgets.js:41`의 `progressStatus`는 `requires:null`, `source:'dashboardAggregate'`다. `ChartTemplate.js:218`~`:220`에서 `statusMode`를 사용해 공수 토글을 그린다.
- 재현: 설정 `hourRate=4`, 같은 이슈의 계획 28,800초(8시간). REPORT 사용자 결과 `inProgressMd=2`, DASHBOARD-only 사용자 결과 `inProgressMd=1`.
- 영향: 데이터·프로젝트가 같아도 사용자 권한에 따라 공수 단위가 달라진다. 기본 설정이 8일 때만 숨겨진다.
- 개선 방향: 모든 사용자의 `byEffort`에 필요한 hourRate는 항상 조회하거나 신뢰할 수 있는 설정 캐시에서 가져온다. 공휴일과 진단 전용 계산만 REPORT 게이트에 둔다.

## 3. P2 — 남은 공수를 과거 시작일부터 배분하여 미완료 작업의 예측 종료일이 과거가 된다

- 핵심 위치: `src/resolver/projectProgress/ProgressCalculator.js:254`, `:278`, `:280`.
- 경로: `ProjectProgressService.js:110` → `computeDelayPredicted` → `calcEstimatedEndDate` → `ProgressHeader.jsx:110`~`:116`의 예상 종료/지연 표시.
- 재현: 기준일 2026-09-07, 작업 시작 2026-08-03, 프로젝트 종료 2026-09-04, 계획 10MD·실제 5MD·미완료·인원 1명. 5MD가 남아 있어도 현재 함수는 시작일부터 5영업일을 계산해 `estimatedEndDate='2026-08-07'`, `predictedDelayDays=-28`을 반환한다.
- 영향: 이미 기한을 지난 미완료 작업을 28일 조기 완료할 것으로 표시한다. 단순한 병렬 작업 낙관 근사보다 근본적인 시간 기준 오류다.
- 기존 테스트 `src/resolver/projectProgress/__test__/ProgressCalculator.test.js:165`~`:179`도 시작일+remaining 결과를 기대한다. 따라서 구현이 문서에서 이탈한 문제라기보다 기존 산식 자체의 설계 문제다.
- 개선 방향: 예측 기준일을 인자로 받고 진행 중 작업의 잔여 공수는 기준일 이후로 배치한다. 미래 시작 작업은 max(기준일, 시작일)로 시작하며 당일을 몇 일로 셀지 명시한다. 기준일이 없는 과거 산식 테스트도 함께 바꿔야 한다.

## 4. P2 — Jira 조회 실패를 정상 빈 목록으로 반환하여 위험 이슈가 사라진다

- 핵심 위치: `src/resolver/projectDashboard/DashboardIssueFetcher.js:136`~`:138`.
- 생산자: 상류 오류 catch가 `{ issues: [], scanned: 0, truncated: false }`를 반환한다. `DashboardInsightService.js:180`~`:216`은 이를 정상 빈 배열로 집계하고 오류 상태를 추가하지 않는다. resolver 래퍼는 정상 처리하므로 성공 응답이 된다.
- 소비자: `static/ui/src/hooks/useDashboardInsight.js:31`~`:35`에서 성공 응답을 5분 staleTime으로 캐시한다. `dashboardInsightAdapters.js:25`는 `success===true`를 정상으로 판정한다. `ChartTemplate.js:624`의 `isInsightError`가 켜지지 않아 위험 목록/커스텀 목록/트리맵은 조회 오류를 표시하지 않는다.
- 재현: `postJiraJson`이 Error('상류 503 재현')를 throw하도록 대역하면 반환값은 정상 빈 프로젝트와 완전히 동일하다. 기존 `DashboardIssueFetcher.test.js:139` 이하도 이 동작을 의도된 fallback으로 고정한다.
- 영향: Jira 일시 장애 직후 위험 이슈가 없는 것처럼 표시되며 프론트 캐시가 자동 재시도를 막는다. 백엔드 모듈 캐시가 실패 Promise를 지워도 프론트에는 성공 데이터로 남는다.
- 개선 방향: 실패를 throw해 위젯 단위 오류 UI를 쓰거나, 명시적 unavailable/partial 상태를 반환하고 기존 값·재시도와 구별한다. 부분 성공 UX가 필요해도 빈 프로젝트와 같은 상태로 반환하지 않는다.

## 재현 결과

명령: `node _workspace/logic-efficiency-review-2026-09-07/dashboard-progress-repro.cjs` (종료 코드 0).

```json
{"case":"progress-cache","restrictedIssuesMd":1,"restrictedSummaryMd":10,"restrictedCompletion":0.9,"issueFullFetchCalls":2,"worklogFullFetchCalls":2,"cacheKeys":["ProjectProgress:p1"]}
{"case":"aggregate-hour-rate","configuredHourRate":4,"reportUserMd":2,"dashboardUserMd":1}
{"case":"remaining-forecast","asOf":"2026-09-07","remainingMd":5,"estimatedEndDate":"2026-08-07","predictedDelayDays":-28,"optimisticApprox":true}
{"case":"dashboard-upstream-failure","result":{"issues":[],"scanned":0,"truncated":false}}
```

재현은 실제 Service/Calculator/Fetcher 소스를 Babel 변환해서 실행한다. SDK, 설정, Jira, Repository 경계만 메모리 대역으로 바꿨다. REPORT 권한 행렬 전체, 실사이트 Jira visibility, 빌드, 배포는 이 하위 리뷰에서 실행하지 않았다.
