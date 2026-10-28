# 인력 분석·자원관리·작업 배정 검토

검토일: 2026-09-07. 앱 파일은 수정하지 않았다. 실제 서비스/페처를 실행하고 Jira·SQL·KVS 경계만 mock한 재현 테스트 3개 파일, 5개 케이스를 실행했다. 아래의 `PASS`는 올바른 동작을 뜻하지 않고 **현재 결함 동작이 재현되었다**는 뜻이다. 운영 사이트 데이터로 검증하지 않았다.

## 1. P1 — 사용자별 Jira 결과를 조회자 구분 없이 공유하는 KVS 캐시

- 위치: `src/resolver/resourceAnalysis/ResourceAnalysisService.js:122`, `:224` (조회 키), `:126`, `:227` (인가 없이 캐시 반환).
- 호출 연결: `ResourceAnalysisController.js:6-11`은 payload만 서비스에 전달한다. `ResourceWorklogFetcher.js:71-78`은 기본 `as='user'`로 Jira 검색을 실행한다. 하지만 `ResourceDetail` 키의 accountId는 **조회 대상 직원**이며 조회자가 아니다.
- 발생 조건: REPORT 권한과 같은 RMS 프로젝트 접근 권한을 가진 A/B의 Jira 이슈 가시성이 다르다. A가 비공개 이슈를 포함하는 특정 직원/기간의 상세를 먼저 조회하고 B가 같은 조건으로 5분 안에 조회한다.
- 영향: B는 본인의 Jira 권한으로 조회하지 않고 A의 `logs[].issueKey`, `issueSummary`, `date`, `hours`, `md`를 받는다. 반대로 B가 먼저 조회하면 A도 누락된 집계를 받는다. 목록 캐시도 같은 구조이며 10분간 `members[].totalMd/totalHours/issueCount`를 공유한다.
- 재현: `resource-cache.review.test.js`에서 A가 `SECRET-1/restricted summary`를 반환하도록 외부 fetch를 설정한 후 B의 fetch 결과를 빈 배열로 바꾸었다. 상세는 여전히 해당 요약을 반환하며 외부 fetch는 총 1회였다. 목록 역시 B에게 A의 1 MD를 반환했다.
- 개선: 신뢰할 수 있는 `context.accountId`를 서비스로 전달해 조회자별 키를 만들고, 기존 공유 키 namespace를 폐기한다. 조회자 권한 변경 시의 만료·무효화 정책도 함께 정한다. payload로 받은 viewerId를 신뢰하면 안 된다.

## 2. P1 — 작업 배정 전사 인력 풀이 팀장 가시 범위를 우회

- 위치: `src/resolver/workAssignment/WorkAssignmentService.js:346`, `:355`, `:363`, `:392`.
- 호출 연결: `PermissionMap.js:338`은 `RESOURCE_MANAGEMENT read` + 프로젝트 detail 접근만 검사한다. 시드 Team Lead는 `TEAM_ONLY`이면서 이 read 권한을 갖는다(`SeedData.js:118-126`). 자기 팀 프로젝트 ID를 넘기면 가드를 통과한다.
- 발생 조건: 팀장이 자기 프로젝트에서 전사 풀을 펼친다. `getWorkAssignmentPoolService`는 principal을 인자로 받지만 사용하지 않고, 전체 `buildPeopleContext()`에서 해당 프로젝트 멤버만 제외한다.
- 영향: 다른 팀 직원의 accountId, 이름, 직무, 등급, 스킬 매칭, 전사 가동률 등을 반환한다. `companyScopeVisible:true`도 고정되어 있다. 일반 자원관리 명부는 `resolveTeamAnalyticsScope`로 이미 제한되어 있지만 이 형제 경로에는 제한이 없다. `principal` 누락도 동일한 전사 응답으로 이어진다.
- UI 경로: board의 `companyScopeVisible = isSatisfied(principal, COMPANY_SCOPE_META)`(`:241`)는 팀장에게 true이므로 `meta.poolAvailable`도 true다. `AssignmentPage.jsx:96`과 `CandidatePanel.jsx:62`에서 실제 풀 호출/토글이 열리므로 direct invoke만의 문제가 아니다.
- 재현: `assignment-scope.review.test.js`에서 `leadingScopeAccountIds=['my-team-person']`인 TEAM_ONLY 팀장으로 호출했다. `resolveTeamAnalyticsScope`는 LEADING인데도 `other-team-person`과 `company.util=1.25`가 반환됐다. principal을 생략해도 동일 후보가 반환됐다.
- 개선: `resolveTeamAnalyticsScope(principal)`의 단일 판정으로 pool 후보와 board의 company/pool 가시성을 함께 제한한다. 후보 필터는 Jira 부하 조회·SQL 프로젝트 수 조회보다 먼저 수행해 다른 팀 데이터 조회 비용도 줄인다. principal 누락은 거부하거나 빈 범위로 처리한다.

## 3. P1 — 워크로그 검색의 다음 이슈 페이지를 버려 실적을 누락

- 위치: `src/api/jira/issue/IssueApi.js:146-168`, 호출부 `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js:78`.
- 발생 조건: Jira `/search/jql` 응답이 `nextPageToken`을 포함하는 다중 페이지다. `maxResults=5000` 요청값만 지정하고 응답의 실제 페이지 완료 여부는 확인하지 않는다.
- 영향: 첫 페이지에 포함된 이슈의 워크로그만 집계한다. ResourceWorklogFetcher의 추가 페이지 처리는 **이슈 하나 안의 worklogs**를 위한 것으로, 누락된 **이슈 검색 페이지**는 복구하지 못한다. 따라서 인력별 MD/시간/이슈 수와 상세 데이터가 낮게 나오며 응답에 incomplete/truncated 경고도 없다. 목록/팀 집계와 5~10분 캐시까지 이 값이 전파된다.
- 재현: `resource-pagination.review.test.js`에서 실제 `IssueApi.getBulkIssuesByProject`와 `getResourceProjectWorklogs`를 연결했다. 첫 검색 응답은 `P-1`, `nextPageToken='page-2'`, `isLast=false`, 두 번째 예정 응답은 `P-2`로 구성했다. 최종 결과에는 P-1만 있고 검색 API 호출은 1회였다.
- 개선: 검색 단계에서 `nextPageToken`을 끝까지 순회한다. 메모리/응답 시간 상한을 둘 경우 잘린 데이터를 정상 전체 결과로 반환하지 말고 완료 여부를 응답 계약에 포함한다. 수집한 이슈는 페이지별로 정규화/집계하면 전체 raw issue 배열 보관 비용도 줄일 수 있다. 공용 함수 변경 시 WorklogService 등 전체 소비처 영향 검증이 필요하다.

## 확인 후 결함으로 제외한 사항

- 목록 날짜의 미래 종료일 clamp, 미래 전용 구간의 빈 결과, 휴가 중복 차감 최소 ratio, 0 근무일의 null 분모는 현재 구현과 기존 denominator 테스트에 보정되어 있어 재발견 사항으로 보고하지 않았다.
- ResourceManagementService의 기존 명부 경로는 `visibleAccountIds(principal)`을 사용한다. 과거 명부 전체 노출을 현재 해당 resolver의 결함으로 재보고하지 않았다.
- 워크로그 초과 페이지에는 공유 `p-limit(5)`가 있고, 할당 부하에는 50명 청크와 동시성 3, 팀별 이슈 건수에는 issueId 중복 제거가 적용되어 있다.
- ResourceList/ResourceDetail 문자열을 이용한 별도 invalidation은 `src/` 검색에서 발견하지 못했다. stale 정책 자체의 기대값이 불분명하여 별도 확정 이슈로 세지 않았다.

## 실행 결과

```text
npm test -- --runInBand --runTestsByPath _workspace/logic-efficiency-review-2026-09-07/resource-cache.review.test.js _workspace/logic-efficiency-review-2026-09-07/resource-pagination.review.test.js _workspace/logic-efficiency-review-2026-09-07/assignment-scope.review.test.js
Test Suites: 3 passed, 3 total
Tests:       5 passed, 5 total
```

앱 코드 변경이 없으므로 전체 앱 빌드·배포는 수행하지 않았다.
