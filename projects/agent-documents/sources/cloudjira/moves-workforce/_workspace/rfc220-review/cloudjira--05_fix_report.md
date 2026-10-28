# RFC-220 검토 F1·F2·F3 수정 구현 보고 (4차 — 리더 보강 + Codex 1·2차 검토 반영, 최신은 §00)

> 2026-10-28 · 설계 `04_fix_design.md` · 결함 `03_verify_report.md` · 브랜치 RFC-220(커밋·배포·forge 안 함)
> 2차 보강: ① 이슈 키 경로 연결·스코프 판정 ② 내 작업 화면 selfOnly 회귀 제거 ③ 제한 행 asUser fallback
> 3차: Codex(gpt-6-astra xhigh) 지적 P1-1·P1-2·P2-3~P2-6 — §0

## 00. 검토 반영 2차 — Codex 2차 검토 (4차 작업)

| 지적 | 수정 | 테스트 |
|---|---|---|
| **P1 미등록·삭제된 Jira 관리자가 앱 자격** | `PrincipalResolver` 가 모든 분기에 `workforceRegistered` 를 싣는다 — Jira ADMINISTER 분기 = users 행 있음(조회 실패 = 없음, fail-close), 미등록 분기 false, users 행 확인 뒤 분기 true(`SYSTEM_PRINCIPAL` 은 필드 없음 = false). `WorklogReadAuthority.isWorkforceUser` 는 **`workforceRegistered === true` 만** 본다(`isUser` 무시). `IssueWorklogReadAuthority`·내 작업·모든 프로젝트 범위 호출자가 이 함수를 거친다 | 새 `src/permission/__test__/PrincipalWorkforceRegistered.test.js`(4: **실제 PrincipalResolver** 로 미등록 ADMINISTER → isAdmin·isUser true 인데 workforceRegistered false → 'user', users 조회 실패 → 'user', 등록 관리자 → 'app', 미등록 비관리자), `WorklogReadAuthority.test.js`(+1), `MyWorkAppRead.test.js`(+1: 미등록 Jira 관리자 → asApp 0) |
| **P2-2 기간 쌍 확장이 조회 한도 소진** | ① 현재 행의 (작성자×월) 쌍으로 `cert.query` 를 **먼저 따로** 묻고, 대상자×기간 보충 쌍은 행 쌍을 뺀 나머지만 두 번째로 묻는다(각각 자기 한도) ② 보충 기간은 조회 기간이 12개월을 넘으면 끝 달 기준 **최근 12개월**(`SUPPLEMENT_MONTHS`) — 관계 그래프의 2000-01-01 시작도 이 제한을 받고, 행이 있는 달 ± 1 은 행 쌍이 이미 덮는다 ③ `loadApprovalCertDocs` 가 `truncated`(사용자 300 초과·호출 24×50쌍 초과·`next` 이어 묻기 3회 초과)를 돌려주고, 하나라도 걸리면 안내(approvalBasis)에 `truncated:true` + `console.warn`. `rescopeApprovalBasis`·`mergeApprovalBases`(`src/integration/approval/worklogApproval.js`, 채널 파일 아님)가 이 키를 유지 | `WorklogAppReadApproval.test.js`(+3: 첫 호출은 행 쌍만·2000-01-01 보충은 최근 12개월(+시간대·앞뒤 1달), 보충이 사용자 상한을 넘겨도 현재 행 문서는 판정되고 basis.truncated·경고, 상한 안이면 키 없음) |
| **P2-3 마지막 워크로그 삭제 이슈의 삭제 승인분 복원 실패** | `applyAppReadApproval` 이 문서를 읽은 뒤, 삭제 승인 항목(`deletedIssues`, DELETED 비트)이 가리키는 이슈 id 가 맵에 없으면 **그 id 들만** 앱 자격 `search/jql`(`id IN (…)`, fields project·앱 필드, ≤100) 1회로 key·projectId 를 채우고 허용 프로젝트(`scopeProjectIds`)로 재필터. 없을 때·허용 집합 없을 때 호출 0, 검색 실패는 보충 없음. 호출자: ResourceWorklogFetcher·WorklogService·Collab 대시보드 `[projectId]`, 프로젝트 캘린더 `projectIdList`(스코프 교집합 뒤), 내 작업 `selectedProjectIds`(스코프 확인 뒤) | `WorklogAppReadApproval.test.js`(+3: **issueIndex 를 주지 않고** 이슈 300 을 `id IN (300)` 1회로 보충해 issueKey 'A-300' 복원, 허용 프로젝트 밖이면 복원 안 함, 허용 집합 없음·이미 있음 → 검색 0) |
| **P2-4 드로어 1,000건 상한** | 프론트 `useIssueWorklogs` 가 표시 행을 먼저 읽고 `getIssueWorklogApproval({issueKey, worklogIds})` 로 보낸다(병렬 → 순차). 서버: 숫자 id·중복 제거·≤1,000 으로 검증, 페이지(≤10)에서 못 본 id 만 **앱 자격 `worklog/list`**(1,000건 단위)로 읽고 그 이슈(연결 판정이 돌려준 `issueId` — `IssueWorklogReadAuthority` 반환에 추가)의 기록만 받는다. 페이지를 끝까지 못 돌면 응답에 `truncated:true`(키 추가만). 화면은 합계 옆에 "(확인한 범위)" — `locales/{kr,en}/issueMap.json` `worklog.totalPartial`, `projectDetail.json` `work.tree.detail.worklogsPartial`(merge 재생성 `ko-KR.json`·`en-US.json`), `TreeDetailPanel.jsx`·`IssueMapDrawer.jsx` 각 1줄 | `MyWorkAppRead.test.js`(+2: 상한에 걸린 이슈의 표시 본인 행 5001 을 worklog/list 1회로 판정·다른 이슈 기록 제외·형식 위반 id 제외·truncated, 다 돈 경우 호출 0·키 없음), 프론트 새 `static/ui/src/pages/projectDetail/work/__test__/useIssueWorklogsShownIds.test.jsx`(3: worklogIds 전송·순서, truncated → totalTruncated, 비연동 기존대로), `IssueWorklogReadAuthority.test.js`(issueId 반환) |
| **P2-5 앱 필드 조회 장애가 실적 0 으로 캐시** | `FieldApi.getProjectIdFieldIdStrictApi` — `/field` 를 `fallback` 없이 읽어 오류를 던지고 찾았을 때만 캐시(실패 미캐시, 기존 함수 무변경). `AppReadScope.appProjectFieldIdOf` 는 이를 쓰고 오류·필드 없음을 새 코드 **`APP_FIELD_UNAVAILABLE`**(LogicalError)로 올린다. IssueApi·ProjectIssuesFetcher 의 "필드 없음 = 빈 결과" 분기를 없앴고, 토폴로지는 필드 조회를 부분 폴백 try 밖으로 옮겨 빈 그래프로 숨기지 않는다. 진척도·원가는 `kvs.set` 전에 실패하므로 캐시되지 않는다. 화면: 진척도(`ProgressPage` `progress.error`)·원가(`CostPage`)·관계 그래프 위젯(`dashboard.topology.error`)이 이미 `success:false` 를 오류 문구로 보여 준다 — 0 으로 보이지 않는다(프론트 변경 없음) | 새 `src/api/jira/field/__test__/FieldApiStrict.test.js`(2: 오류 throw·fallback 없음·실패 미캐시 후 재시도·성공 캐시, 새 인스턴스에서 필드 없음/오류 → APP_FIELD_UNAVAILABLE), `AppReadScope.test.js`(수정: 빈 결과 → APP_FIELD_UNAVAILABLE·검색 0), `TopologyAppScope.test.js`(수정: throw), `ProjectProgressAppRead.test.js`(+1: 오류 전파·캐시 쓰기 0) |

**4차 결과**: 재현 케이스 **5/5 통과**, 백엔드 전체 **200 suites / 2,709 tests 전부 통과**(작업 전 187 / 2,616), 프론트 `static/ui` 의 `src/pages/projectDetail/work` 범위(`npm test -- --watchAll=false --runInBand src/pages/projectDetail/work`) **12 suites / 149 tests 통과**(새 3건 포함). 프론트 전체 스위트는 이번에 돌리지 않았다(검토 보고서 03 기준 기존 단일 실패 `kanbanPagination` 이 있었다).

### 4차 바꾼 파일
- 신규: `src/permission/__test__/PrincipalWorkforceRegistered.test.js`, `src/api/jira/field/__test__/FieldApiStrict.test.js`, `static/ui/src/pages/projectDetail/work/__test__/useIssueWorklogsShownIds.test.jsx`
- 수정(백엔드): `src/permission/PrincipalResolver.js`(`workforceRegistered`), `src/permission/WorklogReadAuthority.js`, `src/permission/IssueWorklogReadAuthority.js`(issueId 반환), `src/api/jira/field/FieldApi.js`(엄격 조회 추가), `src/api/jira/issue/AppReadScope.js`, `src/api/jira/issue/IssueApi.js`, `src/api/jira/issue/ProjectIssuesFetcher.js`, `src/resolver/projectDashboard/TopologyIssueFetcher.js`, `src/resolver/approvalLink/ApprovalCertReader.js`(쌍 우선순위·보충 기간·truncated·삭제 이슈 보충), `src/integration/approval/worklogApproval.js`(basis truncated 유지), `src/utils/errors/ErrorCodes.js`(`APP_FIELD_UNAVAILABLE`), `src/resolver/myWork/MyWorkService.jsx`·`MyWorkController.jsx`(worklogIds), `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js`, `src/resolver/utils/worklog/WorklogService.js`, `src/resolver/projectCalendar/ProjectCalendarService.js`, `src/api/jira/worklog/CollabWorklogFetcher.js`(scopeProjectIds)
- 수정(프론트): `static/ui/src/pages/projectDetail/work/useIssueWorklogs.js`, `TreeDetailPanel.jsx`, `map/IssueMapDrawer.jsx`, `locales/kr|en/issueMap.json`·`projectDetail.json`, `locales/ko-KR.json`·`en-US.json`(merge 재생성 — 추가 4줄뿐)
- 테스트 수정: `WorklogAppReadApproval.test.js`, `MyWorkAppRead.test.js`, `ProjectProgressAppRead.test.js`, `WorklogReadAuthority.test.js`, `IssueWorklogReadAuthority.test.js`, `AppReadScope.test.js`, `ProjectCalendarAppRead.test.js`, `TopologyAppScope.test.js`, `ProjectCostAppRead.test.js`(principal 필드), `_workspace/rfc220-review/reproduce.case.js`(F1 principal 에 `workforceRegistered:true`)
- 문서: `AGENTS.md` ⑨
- 4차 호출 변화: `cert.query` 는 행 쌍·보충 쌍 두 묶음(보충 기간 제한으로 쌍 수는 줄어든다), 삭제 이슈 보충 `search/jql` 0~1회, 드로어 표시 id 보충 `worklog/list` 0~1회(≤1,000건). 드로어 프론트는 Jira REST → 판정 resolver 가 병렬에서 **순차**가 되어 왕복이 1단 늘었다. SQL·KVS·manifest 추가 없음(오류 코드 상수 1개 추가).

## 0. Codex 독립 검토 반영 (3차)

| 지적 | 수정 | 테스트 |
|---|---|---|
| **P1-1 JQL 삽입으로 프로젝트 범위 우회** | 새 `src/api/jira/issue/AppReadScope.js`(화이트리스트 `JQL_ACCOUNT_ID ^[0-9a-zA-Z:_-]{1,128}$`·`JQL_NUMERIC_ID`·`JQL_ISSUE_KEY ^[A-Z][A-Z0-9_]+-\d+$`·`JQL_PROJECT_ID ^[0-9A-Za-z-]{1,64}$`(UUID 문자 집합)·`JQL_DATE`, 위반은 새 오류 코드 `JQL_INPUT_INVALID`). 검증 위치: `IssueApi.getBulkIssuesByProject`(projectId·accountId·날짜, 두 자격 모두)·`getProjectIssuesByUser`·`getIssuesByWorklogAuthor`(projectIds·accountIds·날짜, 두 자격 모두)·`isIssueInProjects`(projectIds — 위반이면 false)·`getProjectIssuesByFilter`(as:'app' 일 때 projectId 검증 + `filterJql` 금지)·`TopologyIssueFetcher.getTopologyIssues`(as:'app' 일 때 projectId 검증, 위반이면 빈 결과). **결과 재필터**: 앱 자격 검색 결과는 이슈의 앱 필드(실제 field id — `getProjectIdFieldIdApi('app')`, 인스턴스 캐시)가 허용 프로젝트(project 범위 = 가드가 확인한 projectId, 내 작업·프로젝트 캘린더 = 스코프 교집합을 거친 선택 프로젝트)에 있는 것만 남긴다 — `getProjectIssuesByUser`·`getIssuesByWorklogAuthor`(as:'app' 이면 항상), `getBulkIssuesByProject`·`fetchAllProjectIssues`·`getTopologyIssues`(`appScope:true` 일 때 — 연동 모드 앱 자격 호출자만 켠다, 포트폴리오 배치·협업 경로는 기존 그대로). 필드 id 를 모르면 빈 결과(fail-close). 협업 대시보드 페처(`getProjectWorklogsAsApp`)는 원래부터 asApp 이고 `buildCollabJql`(UUID·accountId 화이트리스트)이 이미 막고 있어 재필터는 넣지 않았다 | `src/api/jira/issue/__test__/AppReadScope.test.js`(12: 따옴표·OR 삽입 거부 6종 + Jira 호출 0, 정상 Atlassian accountId 통과, 재필터 4종, 필드 id 없음 fail-close, asUser·포트폴리오 그대로), `src/resolver/projectCalendar/__test__/ProjectCalendarAppRead.test.js`(3: 캘린더 accountId·selectedProjectIds 삽입 거부, 다른 프로젝트 이슈 제외), `src/resolver/projectDashboard/__test__/TopologyAppScope.test.js`(4) |
| **P1-2 미등록 사용자를 ALL 스코프로 취급** | `WorklogReadAuthority.isWorkforceUser(principal)` = `isUser === true` ∧ accountId. `resolveWorklogReadAuthority` 는 연동 ON 이어도 이 조건이 아니면 `'user'`, `IssueWorklogReadAuthority` 도 같다(검색 전 차단). 이에 맞춰 principal 을 서비스까지 넘기도록: `ResourceAnalysisController`(목록·상세)·`ProjectCostController`·대시보드(`formatWorklogChartData` → `aggregate*Service` → `getProjectWorklogs`). 내 작업(SELF)은 연동 ON 일 때만 `resolvePrincipal` 후 판정(연동 OFF 비용 0) | `WorklogReadAuthority.test.js`(+1: 미등록·principal 없음·isUser 없음 → user), `IssueWorklogReadAuthority.test.js`(+1: 미등록 → user·검색 0), `MyWorkAppRead.test.js`(+1), `ProjectCostAppRead.test.js`(2), `ProjectProgressAppRead.test.js`(P2-5 테스트 안에서 미등록 → asUser) |
| **P2-3 삭제 승인분의 이슈 키 누락** | 새 `src/resolver/approvalLink/IssueIndex.js` `issueIndexOf(issues)` → `Map(id → {key, projectId})`(asUser 경로의 projectIssues 와 같은 모양). 앱 자격 호출자 전부가 `options.issueIndex` 로 넘긴다(ResourceWorklogFetcher·WorklogService·ProjectCalendar·MyWork·Collab 대시보드, 이슈 분석·드로어는 issueKey 하나로). `applyAppReadApproval` 의 귀속 맵 = issueIds ∪ 행 이슈(행 issueKey) ∪ issueIndex | `WorklogAppReadApproval.test.js`(복원 행 `issueKey:'A-300'`, 집합 밖 이슈 제외) |
| **P2-4 현재 기록이 없어진 작성자의 삭제 승인분** | 묻는 쌍 = 남은 행의 작성자×월 ∪ **조회 대상자 × 조회 기간**(selfOnly 면 본인, 아니면 본인 + `resolvePrincipal` 의 `leadingScopeAccountIds` — 기존 includeHidden 경로와 같다, `options.subjects` 로 대체 가능). 행 0건이어도 기간이 있으면 묻는다. 기간이 없는 경로(진척도 전체 기간·이슈 분석·드로어)는 행 쌍만(기존 asUser 경로도 기간이 조건이었다) | `WorklogAppReadApproval.test.js`(+4: selfOnly 행 0건 복원 7200초, 프로젝트 범위 본인 쌍 포함, 이슈 집합 밖 제외, 기간·행 없음 → 호출 0) |
| **P2-5 진척도 총계와 이슈별 집계 조회 범위 불일치** | 이슈 목록도 같은 자격: `ProjectProgressService`(캐시 hit·miss)·`ProjectCostService`(hit·miss) 의 `fetchAllProjectIssues({as:'app', appScope:true})`, `RelationGraphService` 토폴로지 `getTopologyIssues({as:'app', appScope:true})`(연동 ON·등록 사용자일 때, 아니면 기존 협업 판정). 인력 분석·이슈 분석·캘린더·내 작업은 이슈 목록을 워크로그 검색과 같은 호출로 얻어 이미 같은 자격 | `ProjectProgressAppRead.test.js`(+1), `ProjectCostAppRead.test.js` |
| **P2-6 드로어 표시 행과 판정 페이지 불일치** | 서버가 앱 자격일 때 이슈 워크로그를 **전부** 페이지로 읽어(100건씩, 상한 `ISSUE_DRAWER_APP_PAGES = 10` = 1,000건) 판정 — 화면이 그리는 asUser 첫 100건의 본인 행은 모두 덮인다. 합계는 이슈 전체 승인 규칙 초. **프론트 변경 없음**, 응답 shape 동일(`linked·worklogs·countedTotalSeconds·approvalBasis`). asUser 경로(비연결·스코프 밖)는 기존 첫 페이지 그대로 | `MyWorkAppRead.test.js`(+2: 150건 → 2페이지·2쪽 본인 행 판정·shape 동일, 상한 10페이지) |

**3차 결과**: 재현 케이스 **5/5 통과**, 백엔드 전체 **198 suites / 2,692 tests 전부 통과**(작업 전 187 / 2,616 → 새 suite 11, 새 test 76). 프론트 변경 없음(UI 테스트 대상 없음).
⚠ 재현 케이스 수정 1건 추가: F1 진척도 호출에 컨트롤러가 넘기는 것과 같은 등록 사용자 principal(`isUser:true`)을 넘겼다 — P1-2 로 principal 없는 호출은 앱 자격을 받지 않기 때문이다(단언 그대로).

### 3차 바꾼 파일
- 신규: `src/api/jira/issue/AppReadScope.js`, `src/resolver/approvalLink/IssueIndex.js`, 테스트 `src/api/jira/issue/__test__/AppReadScope.test.js`·`src/resolver/projectCalendar/__test__/ProjectCalendarAppRead.test.js`·`src/resolver/projectDashboard/__test__/TopologyAppScope.test.js`·`src/resolver/projectCost/__test__/ProjectCostAppRead.test.js`
- 수정: `src/utils/errors/ErrorCodes.js`(`JQL_INPUT_INVALID`), `src/api/jira/issue/IssueApi.js`, `src/api/jira/issue/ProjectIssuesFetcher.js`, `src/resolver/projectDashboard/TopologyIssueFetcher.js`, `src/permission/WorklogReadAuthority.js`, `src/permission/IssueWorklogReadAuthority.js`, `src/resolver/approvalLink/ApprovalCertReader.js`, `src/resolver/myWork/MyWorkService.jsx`, `src/resolver/projectProgress/ProjectProgressService.js`, `src/resolver/projectCost/ProjectCostService.js`·`ProjectCostController.js`, `src/resolver/resourceAnalysis/ResourceAnalysisService.js`·`ResourceAnalysisController.js`·`ResourceWorklogFetcher.js`, `src/resolver/projectDashboard/ProjectDashboardService.js`·`RelationGraphService.js`, `src/resolver/projectCalendar/ProjectCalendarService.js`, `src/resolver/utils/worklog/WorklogService.js`, `src/resolver/issueAnalysis/IssueAnalysisService.js`, `src/api/jira/worklog/CollabWorklogFetcher.js`, 테스트 `WorklogReadAuthority.test.js`·`IssueWorklogReadAuthority.test.js`·`MyWorkAppRead.test.js`·`ProjectProgressAppRead.test.js`·`WorklogAppReadApproval.test.js`, `AGENTS.md` ⑨, `_workspace/rfc220-review/reproduce.case.js`
- 3차 Jira 호출 변화: 앱 자격 재필터의 앱 필드 id 조회 `GET /field` 1회(인스턴스 캐시 — 첫 호출만), 드로어 앱 자격은 이슈 워크로그 페이지 수만큼(⌈total/100⌉, ≤10). SQL·KVS·manifest 추가 없음(오류 코드 상수 1개 추가).
- 공통 경로 주의: `getProjectIssuesByFilter` 에 선택 인자 `extraFields`(맨 뒤)와 as:'app' 검증을 넣었다. 기존 호출(인자 없음·asUser)은 동작 동일.

## 1. 결과 요약 (2차 시점 — 최신은 §0)

| 검사 | 결과 |
|---|---|
| 재현 케이스 `npm.cmd test -- --runInBand --testMatch '**/_workspace/rfc220-review/*.case.js'` | **5/5 통과**(대조군 1 + F3 캘린더·F3 프로젝트 기록·F1 진척도·F2 협업 집계) |
| 백엔드 전체 `npm.cmd test -- --runInBand` | 2차 시점 194 suites / 2,661 tests 통과 → **3차 198 / 2,692 통과**(§0) |
| 프론트 | 변경 없음(응답 shape 불변) — 실행 안 함 |

⚠ **재현 케이스 파일(`reproduce.case.js`)의 외부 경계 가짜를 한 군데 바꿨다(단언은 그대로).** 원래 케이스는 "앱 자격 읽기"를 `postJiraJson`(worklog/list) as:'app' 으로만 모델링해, 검색 함수 가짜가 `as` 와 무관하게 숨긴 기록이 없는 이슈를 돌려줬다. 새 설계는 숨긴 기록을 **검색 자체를 앱 자격으로** 읽어 얻으므로, 가짜가 `as:'app'` 일 때 숨긴 기록(log 501)을 포함한 이슈를 돌려주도록 했다(Jira visibility 는 앱 자격을 막지 않는다). 이 변경 없이는 설계대로 구현해도 F1·F3 케이스가 통과할 수 없다. 파일 머리 주석에 사유를 적었다.
참고: 이 케이스는 `PrincipalResolver` 를 `resolvePrincipal` 만 있게 가짜로 바꿔 `scopedProjectIds` 가 없다 → 보강 2 의 스코프 판정이 실패해 내 작업 두 케이스는 **asUser 경로(F3 순서 수정 + 숨김 보충)** 로 통과한다. 앱 자격 경로의 같은 시나리오는 `MyWorkAppRead.test.js` 가 따로 덮는다.

## 2. 바꾼 파일 (전체)

**신규**
| 파일 | 내용 |
|---|---|
| `src/permission/WorklogReadAuthority.js` | `resolveWorklogReadAuthority({projectId, principal, settings?, collab=false})` → `'app'|'user'`(throw 없음), `resolveWorklogRead()` → `{as, settings}`, `isApprovalLinkOn` |
| `src/permission/IssueWorklogReadAuthority.js` | **보강 1** — `resolveIssueWorklogReadAuthority({issueIdOrKey, principal, settings})` → `{as, wfProjectId}`. `link.resolve` 와 같은 연결 판정 + 조회자 `scopedProjectIds` 대조, 인스턴스 60초 캐시(이슈 → 연결 결과) |
| 테스트 7개 | §6 |

**수정 — 제품 코드**
| 파일 | 함수·변경 |
|---|---|
| `src/resolver/approvalChannel/handlers/linkResolve.js` | **보강 1** — 판정 몸통을 `createIssueLinkResolver(deps)(refs, {keys})` 로 추출(반환 `{ok, found, linkOf, fieldOf}`). 핸들러 `createLinkResolveHandler` 는 이를 호출하고 설정 읽기·응답 조립만 — 이슈 id 입력의 JQL·응답은 글자 그대로 같다(기존 핸들러 테스트 121건 통과). 키 입력(`keys:true`, 내부 호출 전용)은 `key IN (…)`. `src/integration/channel/*` 아님 |
| `src/resolver/approvalLink/ApprovalCertReader.js` | `applyWorklogApproval` `readAs:'app'` 분기 → `applyAppReadApproval`. **보강 3** `userVisibleRestricted`(제한 행 asUser fallback). `certifyCostRows` `appRead`. `contextOf` |
| `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` | `getResourceProjectWorklogs` `selfOnly`·`settings`, `as:'app'` → `readAs:'app'`, `visibility` 판정 입력 후 `stripVisibility` |
| `src/api/jira/issue/IssueApi.js` | `getProjectIssuesByUser`·`getIssuesByWorklogAuthor` 에 `as='user'` |
| `src/resolver/projectProgress/ProjectProgressService.js`·`ProjectProgressController.js` | principal 전달, ON 이면 `{as:'app', viewer, settings}`, OFF 는 빈 옵션 |
| `src/api/jira/worklog/CollabWorklogFetcher.js` | `viewerId`, `readAs:'app'`, 주석의 Q127 갱신 |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | `viewerId` 전달 |
| `src/resolver/projectDashboard/RelationGraphService.js` | ON 실적 앱 자격 |
| `src/resolver/projectCollab/CollabCalendarService.js`·`CollabIssueWorklogService.js` | `collabControlOf(…, {aggregateOnly:true})` |
| `src/resolver/projectCalendar/ProjectCalendarService.js` | `resolveWorklogRead` → as·readAs:'app' |
| `src/resolver/utils/worklog/WorklogService.js` | `getProjectWorklogs` ON 앱 자격, `viewer` |
| `src/resolver/issueAnalysis/IssueAnalysisService.js` | **보강 1** — `resolveIssueWorklogReadAuthority` 가 'app' 일 때만 앱 자격(그때 소속 확인은 연결 판정이 대신), 아니면 기존 asUser 경로(MEMBER_ONLY `isIssueInProjects` asUser 포함) |
| `src/resolver/resourceAnalysis/ResourceAnalysisService.js` | 목록·상세 ON 앱 자격 |
| `src/resolver/projectCost/ProjectCostService.js` | `costWorklogReadOf`, `certifyCostRows({appRead})` |
| `src/resolver/myWork/MyWorkService.jsx` | **보강 1·2** — `principalOf`, `myWorkReadOf(viewer, selectedProjectIds)`(선택 프로젝트가 전부 조회자 스코프 안일 때만 'app'), `withIssueApproval(..., {selfOnly})`(캘린더만), 드로어는 `resolveIssueWorklogReadAuthority` |

**수정 — 기존 테스트**: `ApprovalDisplayPaths.test.js`, `CollabApprovalHiddenRows.test.js`, `CollabDrawerApproval.test.js`, `DashboardCollabAuthority.test.js`(§6).
**수정 — 문서**: `AGENTS.md`(⑦·⑧ 집계 포함, ⑨ 신설·보강 반영, 사후 승인 집계 예외 절), `CLAUDE.md`(gitignore 대상 — Jira API 절 ⑨, 변경 이력 2026-10-28 행), `_workspace/rfc220-review/reproduce.case.js`(§1).
`src/integration/channel/*`·`ops.js`·manifest·SQL·KVS 스키마·프론트·`docs/`·미추적 파일은 건드리지 않았다.

## 3. `readAs:'app'` 실제 동작 순서 (`applyAppReadApproval`)

1. `approvalLinkMode !== 'ON'` 이면 입력 그대로 반환.
2. 입력이 비면 `onBasis(빈 안내)` 후 반환 — Jira·채널 호출 0.
3. 조회자 컨텍스트: `viewer.accountId`(없으면 기존과 같이 `/myself` asUser 1회), `cloudId`.
4. 행 정규화. **asUser `permissions/check`·`worklog/list` 재확인 없음.**
5. `visibility` 행이 있으면 `createApprovalControlLookup({cloudId, as:'app'})`(AGGREGATE) → prefetch → `isApprovalHidden` true 면 통과.
6. **(보강 3)** hidden 에 없는 제한 행 + 판정 불가 행(조회기 unusable·UNVERIFIED·NO_TRUST·예외)의 id 만 모아 조회자 **asUser `worklog/list`**(1,000건 묶음, 최대 3 동시) → 돌아온 것 중 id·issueId·작성자가 맞는 행만 통과. 묶음 실패 = 그 행 제외(fail-close). 대상이 없으면 호출 0. 승인 앱 hidden 행은 fallback 대상 아님.
7. `selfOnly` 면 조회자 작성 행만.
8. `cert.query` STATS(`cacheScope 'linked|{조회자}'`, 남은 행의 작성자×월 쌍).
9. `deletedApprovedRowsOf`(이슈 = 호출자 `issueIds` ∪ 행 이슈, selfOnly 면 조회자만, 날짜 범위).
10. `judgeRows` — `approval`·`claimedSeconds`·`countableSeconds`, `onBasis`. `hiddenCertifiedRowsOf` 는 부르지 않는다.

## 4. 보강 1 — 이슈 키 경로의 연결·스코프 판정

`resolveIssueWorklogReadAuthority`:
1. 연동 OFF·principal 없음·키/id 형식 위반 → `'user'`(Jira 0).
2. 캐시(60초, 인스턴스 메모리, 이슈 → `wfProjectId|null`, 조회자 무관) 미스면 `createIssueLinkResolver([ref], {keys})` — asApp `search/jql` 1회(`fields: project·moves_RMS_projectId`) + 활성 프로젝트 SQL(+ 앱 필드로 안 잡히면 그 Jira 프로젝트의 무필터 SPACE 구독 SQL). `link.resolve` 핸들러와 같은 함수.
3. 비연결(앱 필드 없음·비활성 프로젝트·구독 없음)·판정 실패(INTERNAL·예외) → `'user'`.
4. `scopedProjectIds(principal)` 가 null(관리자·ALL)이거나 `wfProjectId` 를 포함하면 `'app'`, 아니면 `'user'` — 스코프 대조는 캐시 밖에서 조회자마다.

적용 호출자(이슈 키·id 를 직접 받는 경로 전수): **이슈 분석 상세**(`getIssueWorklogDetailService`), **일반 이슈 드로어**(`getIssueWorklogApprovalService`). 그 밖에 이번 전환 대상 중 이슈 키를 받는 것은 협업 드로어(`getCollabIssueWorklogsService`)뿐인데, 이 경로는 원래부터 앱 자격이고 `assertCollabReadAccess` + `findIssueInCollabProject`(그 협업 프로젝트에 연결된 이슈인지 앱 자격 검색)로 이미 막혀 있어 바꾸지 않았다. 나머지 호출자는 projectId 범위(가드가 스코프 확인)다.
'user' 로 강등된 경우는 기존 asUser 경로 그대로다: 이슈 분석은 MEMBER_ONLY 면 `isIssueInProjects` asUser 소속 확인 → asUser 읽기, 드로어는 asUser 읽기 + `applyWorklogApproval`(selfOnly, 재확인 포함).

## 5. 보강 2 — 화면별 행 범위 ("기존에 보이던 것은 계속 보인다")

기존 asUser 경로를 코드로 확인한 결과와 연동 ON 앱 자격 경로의 행 범위:

| 화면(함수) | 기존 asUser 경로가 보여 준 것 | 연동 ON 앱 자격 경로 | selfOnly |
|---|---|---|---|
| 내 작업 표 `getProjectWorklogService` | 조회자 담당·협업 이슈의 기간 내 **모든 작성자** 기록(조회자에게 보이는 것) + 본인 숨김 승인분 복원(`processIssue` 작성자 필터 없음) | 그 이슈의 행 전부(공개 + 승인 앱 숨김 + 조회자가 볼 수 있던 제한 행) | **없음**(1차의 selfOnly 제거) |
| 내 이슈 목록 `getMyIssueListService` | 담당·협업 이슈의 인라인 워크로그 **모든 작성자** | 행 전부 | **없음**(1차의 selfOnly 제거) |
| 내 캘린더 `getMyCalendarWorklogService` | **본인 작성분만**(`processMyIssue` 가 author===accountId 로 거름) | 본인 행만(기존 필터 유지 + selfOnly) | 있음 |
| 일반 이슈 드로어 `getIssueWorklogApprovalService` | 응답 행 = **본인 작성분만**, 합계 = 목록 전체 | 같음(응답 행 본인 필터 유지, 판정은 selfOnly 없이 → 합계 전체) | 판정엔 없음 |
| 프로젝트 캘린더 `getProjectCalendarWorklogService` | 담당·협업 이슈의 **모든 작성자** + 본인 숨김 복원 | 행 전부 | 없음 |
| 이슈 분석 상세 `getIssueWorklogDetailService` | 이슈의 **모든 작성자** | 행 전부(연결·스코프 안일 때만 앱 자격) | 없음 |
| 인력 분석 목록 / 상세 | 프로젝트 **모든 작성자**(목록) / 지정 `accountId` 만(상세, 서비스가 거름) | 같음(상세의 accountId 필터 유지) | 없음 |
| 진척도·원가·대시보드·관계 그래프 | 프로젝트 모든 작성자(숫자) | 같음 + 승인 앱 숨김분 | 없음 |
| 협업 캘린더·드로어 | 공개 기록 + **본인** 숨김 기록(Q127) | 공개 + 승인 앱 숨김(작성자 무관, 사용자 결정) | 없음 |

내 작업 화면의 앱 자격 조건: 연동 ON ∧ `selectedProjectIds` 전부가 조회자 `scopedProjectIds` 안(null = 전부). 하나라도 밖·principal 미확보·판정 예외면 기존 asUser 경로. JQL 은 `moves_RMS_projectId`(워크포스 앱 필드)와 컨트롤러가 강제한 조회자 accountId 로 좁혀지므로 이슈 집합은 조회자 소속 프로젝트의 워크포스 연결 이슈다.

## 6. 테스트

**새 파일 7개 · 새 테스트 45개** (1차 30 + 보강 15)

| 파일 | 수 | 내용 |
|---|---|---|
| `src/resolver/approvalLink/__test__/WorklogAppReadApproval.test.js` | 15 | §2.5 ①~⑥·⑧ + **보강 3**: ① 제한 행 없음 → asUser 0 ② 제한 2건 중 asUser 가 1건만 → 1건만(호출 1회, ids 503·504) ③ 승인 앱 hidden 행은 fallback 대상 아님·이슈 불일치 응답 제외 ④ 판정 불가 행도 fallback |
| `src/permission/__test__/IssueWorklogReadAuthority.test.js` | 6 | **보강 1**(실제 `createIssueLinkResolver`): ALL·관리자 + 비연결 Jira 이슈 → user(검색 JQL·필드 고정), 연결 이슈 → ALL app / MEMBER 소속만, 비활성 프로젝트 → user, SPACE 구독 연결 → app, 60초 캐시(검색 1회)·스코프는 조회자마다, OFF·principal 없음·형식 위반·실패 → user |
| `src/resolver/approvalLink/__test__/IssueAnalysisAppRead.test.js` | 3 | **보강 1**: ALL·관리자 + 비연결 → asApp 읽기 0·readAs 없음, 연결 → app·소속 확인 생략, MEMBER 비연결 → 기존 asUser 소속 확인 |
| `src/resolver/approvalLink/__test__/MyWorkAppRead.test.js` | 10 | F3 asUser 경로(표·캘린더), 빈 이슈 제거, OFF 동일, **보강 2**: 표·이슈 목록 selfOnly 없음·동료 기록 유지, 캘린더 selfOnly, 스코프 밖 → asUser; 드로어 연결 → app·합계 전체 / 비연결 → asUser 경로 |
| `src/permission/__test__/WorklogReadAuthority.test.js` | 5 | ON/OFF/collab/settings 재사용/실패 |
| `src/resolver/projectProgress/__test__/ProjectProgressAppRead.test.js` | 3 | ⑦ 총계·누적선·이슈별 같은 행, 캐시 hit, OFF 인자 동일 |
| `src/resolver/resourceAnalysis/__test__/ResourceWorklogFetcherAppRead.test.js` | 2 | as:'app' 전달·visibility 제거 / as:'user' 기존 |
| `ApprovalDisplayPaths.test.js` 추가 | 1 | `readAs: 'app'` 사용 파일 허용 목록 |

**수정한 기존 테스트 4개**: `ApprovalDisplayPaths.test.js`(드로어 ON 기대 + `IssueWorklogReadAuthority` 가짜 — ON 이면 연결·스코프 안으로 고정), `CollabApprovalHiddenRows.test.js`·`CollabDrawerApproval.test.js`(Q127 → 사용자 결정, 제한 기록 4 제외 확인), `DashboardCollabAuthority.test.js`(`viewerId`).

## 7. Jira 호출 수 변화 (요청 1회, 연동 ON)

N = 이슈 수, W = 행 수, H = visibility 행이 있는 이슈 수, R = 승인 앱 hidden 에 없는 제한 행 수.

| 경로 | 전 | 후 |
|---|---|---|
| 워크로그 읽기 | asUser 검색 + 추가 페이지 | 같은 수, asApp |
| 재확인 | asUser `permissions/check` ⌈N/100⌉ + `worklog/list` ⌈W/1000⌉ | 0 |
| 숨김 보충(includeHidden 경로) | `permissions/check` + `issue/bulkfetch` ⌈N/100⌉ + asApp `worklog/list` 1 | 0 |
| 원가 숨김 보충 | asApp `worklog/list` 1 | 0 |
| **제한 행 fallback(보강 3)** | — | asUser `worklog/list` ⌈R/1000⌉(R=0 이면 0) |
| `/myself` | 진척도·대시보드·원가 각 1 | principal 전달 경로 0 |
| 채널 `issue.control` | 숨김 보충 시 | ⌈H/100⌉ |
| 채널 `cert.query` | 행 쌍 + 대상자×기간 쌍 | 행 쌍만 |
| **이슈 키 경로 연결 판정(보강 1)** | 이슈 분석 MEMBER_ONLY: asUser 소속 확인 1 / 드로어: 0 | 이슈 분석·드로어: asApp `search/jql` 1(60초 캐시 적중이면 0) + 활성 프로젝트 SQL 1(+구독 SQL ≤1). 이슈 분석은 'app' 이면 기존 소속 확인 생략(순증 0), 드로어는 순증 1. 드로어 `resolvePrincipal` 은 인스턴스 캐시 |
| 내 작업 화면 스코프 판정 | — | `resolvePrincipal`(캐시) — Jira 0 |

KVS(설정) 읽기는 경로별로 같거나 1회 줄었다. SQL·KVS 쓰기·manifest 추가 없음(연결 판정 SQL 은 기존 `link.resolve` 쿼리 재사용). 연동 OFF 는 Jira 호출 수·자격·인자 모두 기존과 같다.

## 8. 하지 않은 것 · 미검증 · 주의

- 커밋·푸시·`forge` 명령 안 함. 미추적 파일·`docs/` 안 건드림(`docs/external-api/README.md` diff 는 작업 전부터 있던 사용자 수정).
- **실사이트 미검증**: asApp 검색이 승인 앱 숨김 워크로그를 인라인으로 돌려주는지, `issue.control` AGGREGATE 가 전원 id 를 주는지, `key IN (…)` 연결 판정 검색, 제한 행 asUser `worklog/list` 가 그룹·역할 소속 조회자에게 행을 돌려주는지는 단위 시험 가짜로만 확인.
- 승인 앱 쪽 대응(cert.query BADGE Browse 필터 제거)은 이 리포 밖 — 그 전까지 인력 분석 상세 배지는 Browse 없는 조회자에게 비어 보일 수 있다.
- 연결 판정 캐시(60초)는 조회자 무관이다 — 연결 해제 직후 최대 60초 동안 'app' 판정이 남을 수 있다(스코프 대조는 매번 한다).
- 이슈 키는 대문자 형식(`ABC-1`)만 연결 판정을 한다. 소문자 키는 'user'(기존 경로).
- 1차 보고의 "ALL 스코프 위험"(보강 1)·"내 작업 표 본인 행만"(보강 2)·"그룹·역할 제한 기록 탈락"(보강 3)은 이번에 해소했다.
- 진척도 KVS 캐시는 조회자 무관 공유 — 배포 직후 10분은 asUser 계산 캐시가 남을 수 있다.
