# 04_backend_asapp_fix.md — PortfolioAggregator 스케줄 401 (asUser) 잠복버그 수정

> backend-engineer · 2026-06-11 · 슬러그 `analysis-review`
> 성격: E2E에서 발견된 잠복버그 수정. 스케줄 트리거 `runPortfolioSnapshot` → `aggregateAllProjects` → `aggregateOneProject` 의 Jira API 호출이 전부 `asUser`라 사용자 컨텍스트 없는 배치에서 **401 AUTH_TYPE_UNAVAILABLE** 로 실패.

---

## 1. 원인 (확인된 실패 체인)

`requestJiraJson({ as })`는 `as==='user'`면 `api.asUser()`를 쓰는데, 스케줄 트리거에는 사용자 컨텍스트가 없어 401. 집계 체인의 Jira 호출 함수들이 전부 `as:'user'` 하드코딩이었음.

| 실패 지점 | 호출 함수 | 원래 `as` |
|---|---|---|
| `ResourceWorklogFetcher.getResourceProjectWorklogs` → | `IssueApi.getBulkIssuesByProject` | `'user'` (IssueApi.js:180) |
| 동 워크로그 페이지네이션 → | `WorklogApi.getWorkLogByIssueKey` | `'user'` (WorklogApi.js:8) |
| `PortfolioAggregator.fetchAllIssues` → | `IssueApi.getProjectIssuesByFilter` | `'user'` (IssueApi.js:321) |
| `aggregateOneProject` displayName 조달 → | `UserApi.getBulkJiraUsersApi` | `'user'` (UserApi.js:31) |
| `aggregateAllProjects` 공통자원 → | `FieldApi.getCoworkerFieldIdApi` | **이미 `'app'`** (수정 불필요) |

`aggregateAllProjects`/`aggregateOneProject` 정독 결과 위 5개 외 Jira 직접 호출 없음. `getProjectMemberRows`·`getProjectWorkersScheduleRepository`·`getActiveProjectsService`·`getSettingDataService`·`getPublicHolidayListService`는 전부 DB/KVS(검증: 두 Repository 파일에 `requestJira/asUser/asApp` 매칭 0건).

## 2. 수정 방침 (사용자 확정대로)

1. 공통 API 모듈 기본 동작 불변 — 함수에 옵셔널 `as = 'user'` 파라미터 추가, 내부 `requestJiraJson({ as })`로 전달. 기존 호출부는 인자 미전달 → 기본값 `'user'`로 **동작 동일**.
2. `ResourceWorklogFetcher.getResourceProjectWorklogs`에 `as` 패스스루(기본 `'user'`).
3. `PortfolioAggregator` 집계 체인만 `as:'app'` 명시 전달 — 스케줄/수동(CTA) 어느 경로든 항상 앱 컨텍스트로 집계 → (a) 배치 동작, (b) 트리거 사용자 권한별 스냅샷 비일관 제거.

## 3. 수정 파일 · 함수

| 파일 | 함수 | 변경 |
|---|---|---|
| `src/api/jira/issue/IssueApi.js` | `getBulkIssuesByProject` | 구조분해 인자에 `as = 'user'` 추가, `requestJiraJson({ as, ... })` |
| 동 | `getProjectIssuesByFilter` | 마지막 위치인자 `as = 'user'` 추가(6번째), `requestJiraJson({ as, ... })` |
| `src/api/jira/worklog/WorklogApi.js` | `getWorkLogByIssueKey` | 구조분해 인자에 `as = 'user'` 추가 |
| `src/api/jira/user/UserApi.js` | `getBulkJiraUsersApi` | 2번째 위치인자 `as = 'user'` 추가 |
| `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` | `getResourceProjectWorklogs`, `processIssue` | `as = 'user'` 패스스루(둘 다 `getBulkIssuesByProject`/`getWorkLogByIssueKey`로 전달) |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | `aggregateOneProject` | `getResourceProjectWorklogs({ ..., as: 'app' })`, `getBulkJiraUsersApi(accountIds, 'app')` |
| 동 | `fetchAllIssues` | `getProjectIssuesByFilter(..., coworkerFieldId, 'app')` |
| `src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js` | (신규) | 집계 체인 `as:'app'` 전달 회귀 가드 1 케이스 |

**컨트롤러 등록 변경 없음**(신규 resolver 없음, `src/index.js` 무변경). **응답 shape 변경 없음**.

## 4. `as` 파라미터 추가 함수 시그니처 (기존 호출부 무영향 근거)

추가된 파라미터는 전부 **기본값 `'user'`** 또는 **마지막 위치인자**라, 기존 호출부(Resource 분석 탭, 이슈 패널, myWork 등)는 인자를 넘기지 않으므로 기존 동작과 100% 동일.

```js
// IssueApi.js
getBulkIssuesByProject({ projectId, maxResults = 5000, startDate, endDate, accountId, as = 'user' })
// 구조분해 — 기존 호출부는 as 키 미포함 → 'user'

getProjectIssuesByFilter(projectId, nextPageToken, filterJql, maxResults = 20, coworkerFieldId = null, as = 'user')
// 위치인자 끝에 추가 — 기존 5개 인자 호출부는 6번째 미전달 → 'user'

// WorklogApi.js
getWorkLogByIssueKey({ issueIdOrKey, startAt = 0, maxResult = 100, as = 'user' })
// 구조분해 — 미포함 → 'user'

// UserApi.js
getBulkJiraUsersApi(accountIdList = [], as = 'user')
// 위치인자 끝에 추가 — 기존 1개 인자 호출부는 'user'

// ResourceWorklogFetcher.js
getResourceProjectWorklogs({ projectId, startDate, endDate, accountId, as = 'user' })
processIssue(issue, startDate, endDate, limit, as = 'user')  // 내부 헬퍼
```

집계 체인(PortfolioAggregator)만 명시적으로 `'app'` 전달:
```js
getResourceProjectWorklogs({ projectId, startDate, endDate, as: 'app' })
getBulkJiraUsersApi(accountIds, 'app')
getProjectIssuesByFilter(projectId, nextPageToken, null, 100, coworkerFieldId, 'app')  // fetchAllIssues 내부
```

기존 호출부 확인(인자 미전달 = 무영향):
- `getBulkIssuesByProject` — 호출처: ResourceWorklogFetcher(이제 `as` 패스스루, 기본 user) 외 없음.
- `getProjectIssuesByFilter` — 진척도 서비스 등 5개 인자 호출 유지 → user.
- `getWorkLogByIssueKey` — 공통 워크로그 페치 경로 + ResourceWorklogFetcher → user.
- `getBulkJiraUsersApi` — 기존 단일인자 호출부 → user.

## 5. 추가한 단위 테스트

`PortfolioAggregatorAsApp.test.js` — `aggregateOneProject`의 Forge 직접 의존 모듈을 전부 `jest.mock`으로 대체하고, Jira를 실제로 치는 3경로에 넘어간 `as` 인자만 단언:
- `getResourceProjectWorklogs` 1회 호출, 첫 인자에 `{ ..., as: 'app' }`.
- `getBulkJiraUsersApi` 2번째 인자 `=== 'app'`.
- `getProjectIssuesByFilter` 6번째 인자(index 5) `=== 'app'`.

## 6. npm test 결과 원문

```
> jira-global-page-custom-ui@1.1.17 test
> jest

PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
PASS src/resolver/projectCost/__test__/CostCalculator.test.js
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js

Test Suites: 5 passed, 5 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        1.431 s
Ran all test suites.
```

기존 70개 전부 통과 + 신규 1개(as:'app' 회귀 가드) = 71개.

## 7. 제약 준수

- 기존 미커밋 변경 보존(additive) — 위 8개 파일 외 무수정. shape·컨트롤러 등록 무변경.
- `src/utils/ResponseWrapper.js`의 `[verify-temp]` 계측 코드 **미접촉**.
- 공통 페치 경로(공통 워크로그/이슈 함수)의 **기본 동작 불변**(옵셔널 `as`, 기본 `'user'`).
