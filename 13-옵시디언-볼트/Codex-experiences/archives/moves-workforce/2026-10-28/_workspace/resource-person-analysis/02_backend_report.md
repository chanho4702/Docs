# 개인 종합 분석 백엔드 결과

## 구현 및 실제 계약

- `ResourceManagementController.registerResourceManagementController`에 `guardedDefine('getResourcePersonAnalysis')` 추가. 기존 registrar가 `src/index.js`의 `CONTROLLER_REGISTRARS`에 이미 있어 추가 중복 등록 없음.
- `PermissionMap`은 `RESOURCE_MANAGEMENT read` 또는 `teamLead.accountTargets=['accountId']`. `TeamLeadFieldPolicy`에 accountId/startDate/endDate만 허용하는 read allowlist 추가.
- 서비스 `getResourcePersonAnalysisService({accountId,startDate,endDate},principal)`는 `{content}` 반환. resolver 성공은 `{success:true,content:{accountId,period:{startDate,endDate},projects:[{projectId,projectName}],worklogs:[{id,issueId,issueKey,issueSummary,projectId,projectName,started,date,timeSpentSeconds}],meta:{fetchedAt,scope:'CURRENT_MEMBERSHIPS',complete:true}}}`.
- 실패는 guardedDefine 공통 `{success:false,error:{name,code,message,cause}}`. `USER_ID_REQUIRED`, `USER_NOT_FOUND`, `RESOURCE_ANALYSIS_INVALID_RANGE`, `RESOURCE_ANALYSIS_LIMIT_EXCEEDED`, `RESOURCE_ANALYSIS_PROJECT_LIMIT_EXCEEDED`, `RESOURCE_ANALYSIS_INCOMPLETE` 및 Jira API 오류 전파. 외부 원인 문자열 UI 직접 출력 금지.
- 없는 등록 인원과 범위 밖 인원은 같은 USER_NOT_FOUND. principal 누락은 상세 SQL/Jira 전에 거부. `findByAccountId`에서 RMS 등록 여부 확인 후 프로젝트 이력 조회.
- 날짜는 실제 YYYY-MM-DD, 순서, inclusive 최대 92일 검증. 프론트 로컬 오늘을 지원하기 위해 서버 미래 상한은 UTC+14 기준 오늘. 워크로그 날짜는 started 문자열 첫 10자리이며 UTC로 재해석하지 않음.

## 범위와 완전성

- `ResourceAccess`가 기존 visibleAccountIds 판정을 이동/공유하며 TeamAnalyticsScope 단일 출처 유지. 프로젝트 이력은 scopedProjectIds와 교집합 적용.
- SQL 현재 projectusers 연결만 분석. 종료 프로젝트도 연결이 남아 있으면 포함; 과거 연결이 삭제된 프로젝트는 제외.
- 신규 `ResourcePersonAnalysisFetcher`는 strict asUser 요청만 사용. 기존 ResourceWorklogFetcher/IssueApi/WorklogApi/공통 request helper 변경 없음.
- JQL에 검증된 RMS 프로젝트 ID, 작성자, 날짜를 지정. JQL 문자열 quote/backslash escape. UTC-12~UTC+14 차이는 26시간이므로 후보 검색만 ±2일 확대 후 작성자 및 stored date를 최종 필터.
- 검색 nextPageToken 마지막 페이지까지 순회. worklog 인라인 시작 페이지와 추가 페이지를 실제 반환 건수로 연결. 인라인 누락 시 전용 API에서 처음부터 확인.
- 반복 cursor, 누락 구조, total 변경, 잘못된 offset, 부족한 마지막 페이지, worklog 중복 때문에 total이 채워지지 않은 응답은 INCOMPLETE로 전체 실패.
- issueId+worklogId 중복 제거. 검색 중복 이슈는 중복 집계하지 않음. worklog author/comment/급여/단가 등 DTO에 포함하지 않음.
- 모든 Jira 요청에 공유 p-limit(4). 상한은 프로젝트 50, 검색 이슈 1000, 검사 worklog 20000, 반환 worklog 5000, 요청 200. 상한 초과는 부분 결과 없이 실패.
- 프로젝트 50개 초과는 기간 축소로 해결되지 않으므로 PROJECT_LIMIT_EXCEEDED로 구분. 나머지 LIMIT_EXCEEDED는 기간 축소 안내.
- meta.complete는 해당 검색의 모든 페이지를 수집했다는 뜻이며 Jira 검색 인덱스의 즉시 일관성을 보장하지 않음. [Atlassian 검색 API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)의 enhanced search cursor 계약 사용.

## 기존 소비자 및 변경 파일

- 기존 getResourceProfile 입력/DTO 유지. experience.projectHistory만 공용 프로젝트 필터 적용. load/inProgressIssues 계산은 변경 없음이며 신규 분석 페이지에서 소비하지 않음.
- 기존 profile 소비자: ResourceProfileDrawer/useResourceProfile 및 신규 상세 페이지. 기존 백엔드 직접 소비자 없음.
- 신규: `src/resolver/resourceManagement/{ResourceAccess,ResourcePersonAnalysisService,ResourcePersonAnalysisFetcher}.js`, `__test__/ResourcePersonAnalysis.test.js`.
- 수정: 같은 도메인의 ResourceManagementController.js, ResourceManagementService.js, __test__/ResourceSalaryLeak.test.js; src/permission/{PermissionMap,TeamLeadFieldPolicy}.js; src/utils/errors/ErrorCodes.js; test/permission/teamLead.contract.test.js.
- manifest/schema/scope/SQL DML 변경 없음. 커밋/푸시/배포/설치 미실행.

## 검증

- 작업 디렉토리 `C:/CloudJira/moves-workforce`.
- `npm test -- --runInBand ResourcePersonAnalysis ResourceSalaryLeak teamLead.contract teamAnalyticsScope.contract permissionMap.contract`: 5 suites, 137 tests 통과, exit 0. 최종 ±2일 후보 검색 변경 포함 재실행.
- 등록·PermissionMap·팀장 read payload 필터, 대상 범위·미등록 인원·프로젝트 교집합·급여 비노출, 날짜/92일/미래 경계, 검색 및 worklog pagination, 실패·중복·각 데이터/요청 상한 회귀 검증.
- `git diff --check`: exit 0. 기존/병렬 작업자 수정 보존.
- 전체 backend/frontend test, CI build, forge lint는 루트에서 최종 실행 예정. 실 Jira 설치/API와 브라우저는 미검증.
