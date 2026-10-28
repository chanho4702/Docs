# 02 Backend Report — R5: 모든 이슈 비용 계산 (전체 이슈 left-join)

작성: 2026-06-18 / 담당: backend-engineer / 범위: **R5(백엔드)만**

## 요약

프로젝트 상세 비용 분석(`getProjectCostSummary`)의 `byIssue[]`가 기존에는 **워크로그가 있고 salary가
등록된 멤버의 비용>0 이슈만** 포함했다(워크로그 없는 이슈 누락). R5 요구에 따라 **프로젝트의 모든 이슈**가
`byIssue`에 나오도록 변경했다. 워크로그 없는 이슈는 `cost=0, actualMd=0, costPerMd=null`로 포함된다.

데이터 shape 변경은 R5(byIssue)만. 다른 비용 블록(budget/evm/monthlyCost/byRole/byLevel 등)은 불변.

## 수정 파일 + 변경 요약

### 1. `src/resolver/projectCost/CostCalculator.js`
- 신규 순수함수 **`mergeAllIssues(allIssues, issueCostRows)`** 추가.
  - 기존 `allocateIssueCost`(워크로그 비중 안분, 비용>0만 반환)는 **변경하지 않음**(순수 계산 로직 유지).
  - `allocateIssueCost` 결과에 프로젝트 전체 이슈 목록을 **left-join**:
    - 매칭 이슈 → 비용/actualMd/costPerMd 그대로 사용.
    - 미매칭 이슈(워크로그 없음/비용 0) → `cost=0, actualMd=0, costPerMd=null`.
    - `summary`는 **전체 이슈 목록(allIssues) 우선**(최신 요약으로 덮어씀).
    - `statusKey`/`statusName`을 전체 이슈 목록에서 **부가**(신규 필드, additive).
  - 전체 이슈 목록에 없는 비용 행(이슈 목록 조회 누락 등)도 누락 방지 위해 보존.
  - 정렬: **cost desc 유지**(0비용 이슈는 자동으로 뒤로), 동일 cost(0 포함)는 `issueKey` 오름차순 안정 정렬.
  - 중복 이슈 키 가드(한 번만 포함).

### 2. `src/resolver/projectCost/ProjectCostService.js`
- import에 `mergeAllIssues` 추가(겸사 깨진 들여쓰기 정리).
- **캐시 miss 경로**: 이미 페치하던 `issuesNorm`(= `rawIssues.map(normalizeIssue)`)을 활용.
  `allocateIssueCost(...)` 결과를 `mergeAllIssues(issuesNorm, issueCostRows)`로 감싸 byIssue 생성.
  → **추가 페치 없음**(rawIssues는 이미 completionRate 계산용으로 페치 중이었음).
- **캐시 hit 경로**(`buildByIssue`): 기존에는 memberRows + worklogs만 재페치 → **전체 이슈를 left-join 못함**.
  `fetchAllIssues(projectId, coworkerFieldId)`를 Promise.all에 추가하고 `mergeAllIssues`로 동일 적용.
  → 캐시 hit/miss 양 경로에서 byIssue가 **일관되게 전체 이슈 포함**.
  → `getProjectCostSummaryService`에서 `buildByIssue` 호출 시 `coworkerFieldId` 전달하도록 수정.

### 3. `src/resolver/projectCost/__test__/CostCalculator.test.js`
- `mergeAllIssues` describe 블록 8개 테스트 추가(left-join, 0비용/null 규칙, summary 우선,
  정렬, 목록 누락 행 보존, 빈 입력 가드, 중복 키). 기존 `allocateIssueCost` 테스트는 그대로 유지.

### 컨트롤러 등록
- `getProjectCostSummary`는 기존 함수이며 `src/index.js`에 이미 등록됨
  (`registerProjectCostController`, line 26 import / line 56 호출). **신규 컨트롤러 아니므로 index.js 변경 없음.**

## byIssue[] 실제 항목 shape (글자 그대로 — 프론트 R4가 소비)

`getProjectCostSummary` 응답(`result.content.byIssue[]`)의 각 항목:

```js
{
    issueKey: string,            // 이슈 키 (예: 'PROJ-123')
    summary: string,             // 이슈 요약. 전체 이슈 목록 우선. 없으면 '' (빈 문자열, null 아님)
    statusKey: string | null,    // 상태 카테고리 키 'new'|'indeterminate'|'done' (목록 누락 행은 null) ★신규
    statusName: string,          // 상태 표시명 (예: '완료'). 없으면 '' (빈 문자열, null 아님) ★신규
    actualMd: number,            // 실투입 MD(round1). 워크로그 없으면 0
    cost: number,                // 안분 비용(원, 정수). 워크로그 없으면 0
    costPerMd: number | null,    // MD당 단가(원, 정수). actualMd=0(또는 비용 0)이면 null
}
```

### 기존 대비 변경점
- **이전**: `{ issueKey, summary, actualMd, cost, costPerMd }` — 비용>0 이슈만.
- **현재**: 위 5개 필드 + **`statusKey`, `statusName` 2개 추가**(additive). 프로젝트 **전체 이슈** 포함.

### 필드 규칙 명시
- **0비용 처리**: 워크로그 없는(또는 비용 미배분) 이슈 → `cost=0, actualMd=0, costPerMd=null`.
- **costPerMd null 규칙**: `actualMd > 0`이고 비용 산정된 경우만 `Math.round(cost/actualMd)`(정수).
  그 외(0비용/미매칭/actualMd=0) → **null**(0 아님). 기존 `allocateIssueCost`의 null 규칙과 동일하게 유지.
- **summary/statusName**: 값 없을 때 `''`(빈 문자열). `statusKey`만 목록 누락 행에서 `null`.
- **정렬**: cost 내림차순 → 0비용 이슈는 뒤로 몰림. 동일 cost는 issueKey 오름차순(렌더 안정성).

> 프론트 주의: R4 가로막대 차트는 상위 N(비용 내림차순)을 그대로 slice하면 됨(0비용은 자동 후순위).
> 표(로우데이터)는 전체 `byIssue`를 그대로 노출. `costPerMd`가 `null`일 수 있으니 표시 가드 필요(예: '-').
> `statusKey`/`statusName`은 신규 필드 — 차트/표에서 상태 뱃지/필터에 활용 가능(소비 선택).

## 전체 이슈 조회 방식 (API/JQL 재사용 · 호출 횟수 · 성능)

- **재사용 API**: `src/api/jira/issue/IssueApi.js`의 `getProjectIssuesByFilter(...)`.
- **조달 패턴**: 기존 `ProjectCostService.fetchAllIssues(projectId, coworkerFieldId)` 그대로 사용
  (= ProjectProgressService와 동일한 `nextPageToken` 루프, page size 100). **새 페치 로직 신설 안 함.**
- **정규화**: `ProgressCalculator.normalizeIssue(issue, coworkerFieldId)` 재사용 → `{ key, summary, statusKey, statusName, ... }`.
- **호출 횟수 / 성능**:
  - **캐시 miss**: 이슈 목록 페치는 **이미 하고 있었음**(completionRate 산정용 `rawIssues`). byIssue를 위해
    그 결과를 재활용 → **추가 호출 0**. 워크로그는 기존처럼 `getResourceProjectWorklogs`로 프로젝트 단위 1회.
  - **캐시 hit**: 기존엔 이슈 미페치였으나 left-join 위해 **이슈 목록 페치 1회(+페이지네이션)**만 추가.
    worklog 재페치는 기존과 동일(변경 없음). Promise.all로 worklog/member/issue 병렬.
  - **워크로그 N+1 없음**: 워크로그는 `getResourceProjectWorklogs`(기능 전용/프로젝트 단위 1회) 그대로,
    이슈당 워크로그 재조회 같은 N+1 추가 없음.
  - **asApp 미사용**: `getProjectIssuesByFilter`/`getResourceProjectWorklogs` 모두 사용자 컨텍스트 경로 유지.

## 캐시 hit/miss 경로 처리

- **캐시 정책 불변**: `byIssue`는 여전히 **캐시 제외**(재구성). 캐시 페이로드(`cachePayload`)에는 rates/budget/
  evm/monthlyCost/byRole/byLevel/project/currency + 내부 `_scheduleRate`/`_hourRate`만 저장(byIssue·raw 제외).
- **miss**: 페치한 worklogs + members + issuesNorm으로 byIssue 즉시 구성 후 응답. 캐시엔 byIssue 미저장.
- **hit**: `buildByIssue`가 worklogs + members + **전체 이슈**를 재페치하여 동일 `mergeAllIssues`로 재구성.
  → **양 경로 모두 전체 이슈 포함**(일관성 확보).

## npm test 결과

루트 `npm test`(jest):

```
PASS src/resolver/projectCost/__test__/CostCalculator.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js

Test Suites: 5 passed, 5 total
Tests:       79 passed, 79 total
```

- projectCost 스위트: 28 passed (mergeAllIssues 8개 신규 포함). 회귀 없음.
