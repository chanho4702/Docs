# 프로젝트 「협업 모드」 설계서

> 작성 2026-09-30 · 기준 `develop` `50bc649` · 요구사항 `00_input/requirement.md`
> 이 기능은 Jira 권한을 앱이 **의도적으로** 넘어서는 기능이다. 설계의 절반(§2)은 "어디까지만 넘어서는가"를 코드 위치로 못 박는 일이다.

---

## 0. 조사 결과 — 적용 화면의 현재 조회 경로 인벤토리 (설계 근거)

### 0-1. 화면별 호출 지점

| 화면 | 조회 | 호출 지점 | JQL 조립 위치 | 권한 주체 | 응답에서 화면이 쓰는 필드 |
|---|---|---|---|---|---|
| 작업관리 · **목록**(평면) 요약 | 브라우저 직접 `searchIssueWithJQL`(POST `/search/jql`) | `issue/useWorkListQueries.js` `fetchWorkListSummary` | `issue/workListQuery.js` `buildSummaryJql` → `jqlMaker.generateJQL`(**값을 가공 없이 이어 붙임**) | 본인 | `fields.project{key,name,avatarUrls['24x24'/'16x16']}`, `fields.status.statusCategory.key`, `fields.issuetype{name,iconUrl}` (→ `buildGroups`·`deriveIssueTypeOptions`) |
| 목록 그룹 페이지 | 브라우저 직접, `fields:['*all']`, `properties:['movesRms']` | `fetchWorkListGroupPage` | `buildGroupJql` | 본인 | `id,key`, `fields.{summary, statusCategory, issuetype.iconUrl, assignee, customfield_10015, duedate, timetracking.{original,remaining,timeSpent}EstimateSeconds, aggregateprogress.percent}`, `properties.movesRms.coworkers` (`useIssueRowFactory`, `ProjectIssueTable`) |
| 목록 계층 골격 | 브라우저 직접, `fields:['parent']` | `fetchWorkListSkeleton` | `buildGroupJql` | 본인 | `key`, `fields.parent.key` (→ `toSkeletonRows`) |
| 목록 계층 상세 | 브라우저 직접, `key IN (...)` 청크 병렬 3 | `fetchWorkListDetailByKeys` | `workListTree.buildKeyInJql` (**프로젝트 술어 미포함**) | 본인 | 그룹 페이지와 동일 |
| 목록 행 재조회(쓰기 직후) | 브라우저 `getIssue` 단건 | `useIssueRowFactory.searchByIssueId` | – | 본인 | 행 필드 |
| **트리 · 간트 · 이슈 맵** | resolver `getProjectGanttData` | `gantt/useGanttData.js` (키 `ganttKeys.data(projectId)`) | 서버 `IssueApi.getProjectGanttIssues`(전용 페처, `as` 인자 있음, 기본 `'user'`) | 본인 | `GanttMapper` DTO(Task/links/folders) — **원문 이슈 아님** |
| 트리 상세 · 맵 드로어 워크로그 | 브라우저 직접 `getIssueWorklogs`(maxResults 100) | `work/useIssueWorklogs.js` (키 `projectKeys.issueWorklogs(key)`) | – | 본인 | `worklog.{id, author{accountId,displayName,avatarUrls}, started, timeSpent, timeSpentSeconds, comment}` |
| 트리 상세 연관관계 | 브라우저 `getIssue?fields=parent,subtasks,issuelinks` | `work/useIssueRelations.js` | – | 본인 | 연결 이슈(**프로젝트 밖 이슈 포함**) |
| 맵 커밋 탭 | 브라우저 dev-status(비공개 API) | `map/useIssueDevStatus.js` | – | 본인 | – (범위 밖) |
| **캘린더** 워크로그 모드 | resolver `getProjectCalendarWorklog`(`R('PROJECT','list')`) | `calender/useProjectCalender.js` (키 `calendarKeys.projectWorklogs({projectId,startDate,endDate})`) | 서버 `IssueApi.getProjectIssuesByUser`(**`as:'user'` 하드코딩, 공통 경로**) + `WorklogApi.getWorkLogByIssueKey` p-limit 5 | 본인 | 응답 `{data:[원문 issue(worklog 필터됨)], memberTeamMap, teamMeta}` — 사용: `id,key`, `fields.{summary, status.statusCategory, issuetype.iconUrl, project.{name,avatarUrls['24x24']}, assignee, worklog.worklogs[].{id,author,started,timeSpent,timeSpentSeconds,comment}}`, `properties.movesRms.coworkers` (`FullCalendar.renderEventContent`, `WorklogModal`) |
| 캘린더 이슈 모드 | `useGanttData` 재사용 | `ProjectCalender.jsx:84` | 간트와 동일 | 본인 | Task DTO |
| 캘린더 이슈 필터 셀렉트 | 브라우저 JQL `getProjectIssues` | `components/select/ProjectIssueSelect.jsx` | 프론트 | 본인 | 옵션용 key/summary |
| 캘린더 팀원 일정·팀 축 | resolver(DB) | `getAllProjectWorkersSchedule`, 팀 축 | – | – | Jira 무관 |
| **대시보드** 요약 | `getSummaryData` | `SummaryPanel` | – | DB | Jira 무관 |
| 대시보드 role/level/team/salary 위젯 | `getChartDataById` | `ChartTemplate` | – | DB | Jira 무관 |
| 대시보드 issue/assignee 위젯 | `getChartDataById` → `ProjectUsersService.get*StatsService` → `IssueApi.getAssigneeStats/getIssueParticipantStats` → `ProjectParticipantFetcher`(**`as:'user'` 하드코딩**, 인스턴스 캐시 키 `viewerId::projectId`) | – | 서버 고정 JQL | 본인 | 집계값 |
| 대시보드 worklog 위젯(heatmap/lineStack) | `getChartDataById` → `WorklogService.aggregate*Service` → `getBulkIssuesByProject`(`as` 인자 있음, 기본 user) + `getWorkLogByIssueKey` | – | 서버 | 본인 | 집계값. ⚠ **KVS 캐시 키에 사용자 구분이 없다**(`UserDate:`/`Date:` + projectId + 기간) |
| 대시보드 riskIssues/issueSize/customFilter | `getDashboardIssueInsight` → `DashboardIssueFetcher`(`as` 인자 있음, 캐시 키 `viewerId::projectId`) | `hooks/useDashboardInsight.js` | 서버 고정 JQL | 본인 | Insight DTO |
| 대시보드 relationGraph | `getProjectRelationGraph`(`R('PROJECT','detail')`) → `TopologyIssueFetcher`(`as` 인자 있음) | `hooks/useProjectRelationGraph.js` | 서버 고정 JQL | 본인 | 그래프 DTO(범위 밖 엣지는 개수만) |
| 대시보드 progressStatus/plannedVsActual | `getDashboardAggregate` → `DashboardAggregateFetcher` | `hooks/useDashboardAggregate.js` | 서버 고정 JQL | **이미 asApp** (count·metric만, 스코프 재검증 `DashboardAggregateScope`) | 집계값 |
| 대시보드 progressTrend/costBurnUp | 진척도·비용 탭 resolver 재사용 | `ChartTemplate` | – | 본인 | – (분석 탭 소유 → 1차 범위 밖) |

### 0-2. 설계를 좌우한 사실 7개

1. **브라우저 직접 조회는 목록 뷰(4경로)와 워크로그 패널 1경로뿐이다.** 트리·간트·맵·캘린더·대시보드는 이미 resolver 경유다. → 앱 자격을 위해 "경로를 서버로 옮기는" 작업은 목록 뷰에만 필요하다.
2. **Forge asApp `search/jql`은 이미 실운영 중이다** — 사용자 컨텍스트 resolver 안에서도(`DashboardAggregateFetcher`, POST), 배치에서도(포트폴리오). 지원 여부는 미확정 사항이 아니다. 남는 불확실성은 "앱 계정이 **볼 수 있는** 이슈의 범위"다(§11).
3. **서버 쓰기 검증은 전부 본인 자격 조회로 소속을 판정한다** — `GanttService.fetchGanttGraph`/`assertGanttIssueInProject`(`isIssueInProjects` 기본 user), `ProjectChildScope.assertIssueIdsInProject`(`areIssuesInProject(...,'user')`), `updateProjectIdFieldService`(`areIssuesAccessible(...,'user')`). 속성(property) write 자체는 asApp(③)이지만 **그 앞 검증이 본인 자격**이라 못 보는 이슈에 쓰지 못한다. → "쓰기 불변"은 이 검증 함수들을 **건드리지 않는 것**으로 보장된다.
4. 목록 뷰의 `jqlMaker.generateJQL`은 값을 이스케이프 없이 이어 붙이고, 필터 값에 `membersOf("g")`·`EMPTY` 같은 **JQL 조각**이 들어온다. 서버는 이 문자열을 받을 수 없다 → 구조화 필터로 번역해야 한다(§4).
5. 대시보드·간트 전용 페처는 이미 `as` 인자를 받는다(`getProjectGanttIssues`, `DashboardIssueFetcher`, `TopologyIssueFetcher`, `getBulkIssuesByProject`, `getWorkLogByIssueKey`). 다만 **인스턴스 캐시 키에 `as`가 없다** → 앱 결과가 본인 결과 캐시에 섞이지 않게 키를 분리해야 한다.
6. `WorklogService`의 KVS 캐시(10분)는 사용자 구분 없이 공유된다. 앱 자격 결과를 **같은 키에 쓰면 비참여자에게 앱 자격 집계가 새어 나간다** → 협업 경로는 별도 페처·별도 캐시 네임스페이스.
7. `ganttKeys.data(projectId)`는 간트·트리 mutation **약 30곳**이 `setQueryData`로 직접 패치한다. 쿼리 키에 경로 구분을 넣으면 이 패치가 전부 빗나간다 → 간트 계열은 **서버에서 경로를 고르고** 키는 그대로 둔다.

---

## 1. 개요 / 영향 범위

### 1-1. 핵심 구조 결정 — "서버 판정 + 경로별 두 방식"

| 화면 유형 | 방식 | 이유 |
|---|---|---|
| 이미 resolver 경유(트리·간트·맵, 캘린더 이슈 모드, 대시보드 issue/assignee/worklog/insight/relationGraph) | **기존 resolver 안에서 서버가 권한 주체를 판정**(`resolveCollabReadAuthority`)해 전용 페처에 `as`를 넘긴다. 응답 shape·쿼리 키 불변 | shape 동일이 자동 보장, mutation 캐시 패치 무회귀, 설정값을 클라이언트가 보낼 여지 자체가 없음 |
| 브라우저 직접(목록 4경로, 캘린더 워크로그, 워크로그 패널) | **협업 전용 resolver 신설**(앱 자격 전용, 꺼져 있으면 거부). 프론트는 페처 훅 1곳에서 두 경로 중 하나를 고른다. 응답은 기존 브라우저 응답과 **같은 구조의 부분집합** | 앱 자격 호출은 브라우저에서 불가. 화면 컴포넌트 무변경 |

캘린더 워크로그는 이미 resolver 경유지만 `getProjectCalendarWorklog`가 `list` 모드·배열 입력·공통 경로(`getProjectIssuesByUser` 하드코딩 user)라 분기를 넣기 부적합 → 전용 resolver로 분리.

**권한 주체 판정 규칙(단일 출처 `src/permission/CollabAccess.js`)**
`'app'` 은 아래가 **모두** 참일 때만. 하나라도 거짓이거나 판정 중 예외면 `'user'`(= 기존 동작, 권한 상승 없음).
1. `principal` 존재
2. 프로젝트 `collab_mode = 1` (서버가 DB에서 읽음)
3. 프로젝트 `deletion_state = 'ACTIVE'`
4. `principal.accountId`가 `projectusers`에 그 프로젝트로 등록됨(참여 인원)
5. `scopedProjectIds(principal)`이 `null`이거나 projectId 포함(데이터 범위)

### 1-2. 영향 범위

- **백엔드**
  - 신규 도메인 `src/resolver/projectCollab/` — resolver 8개(§3 계약 표 3-A)
  - 신규 `src/permission/CollabAccess.js` — 판정 단일 출처
  - 신규 전용 페처 `src/api/jira/issue/CollabIssueFetcher.js`, `src/api/jira/worklog/CollabWorklogFetcher.js`
  - 신규 `src/resolver/projectCollab/CollabJqlBuilder.js` — 구조화 필터 → JQL
  - 수정(읽기 경로에 `as` 전달만): `GanttService.getProjectGanttData`, `GanttController`(principal 전달), `ProjectDashboardService.getChartDataset`·`getChartDataByIdService`·`getChartDataService`, `DashboardInsightService`, `RelationGraphService`, `DashboardIssueFetcher`·`TopologyIssueFetcher`(캐시 키), `ProjectParticipantFetcher`·`IssueApi.getAssigneeStats/getIssueParticipantStats`·`ProjectUsersService.get*StatsService`(기본값 `'user'`인 `as` 인자 관통), `WorklogService`(순수 집계 함수 export만), `ProjectCalendarService`(`buildTeamAxis` export만)
  - `PermissionMap` 8키, `ErrorCodes` 4개, `src/index.js` `CONTROLLER_REGISTRARS` 1개
- **프론트**
  - 신규 훅 `hooks/useProjectReadAuthority.js`, 컴포넌트 `components/collab/CollabModeNotice.jsx`, 유틸 `utils/collab/collabErrors.js`
  - 수정: `issue/useWorkListQueries.js`(4훅 분기), `issue/workListQuery.js`(`toCollabFilter`, `fromCollabSummary`), `calender/useProjectCalender.js`, `work/useIssueWorklogs.js`(+호출 3곳 prop), `ProjectModal.jsx`(토글), 배지 3곳(`ProjectWorkPanel`, `ProjectCalender`, `DashboardPage`), `ProjectDetailPage`(권한 주체 선조회), `gantt/useGanttMutations.js`·`useGanttFolderMutations.js`(협업 쓰기 실패 문구)
  - 쿼리 키: `projectKeys.collabAccess`, `workListKeys.*`·`calendarKeys.projectWorklogs`·`projectKeys.issueWorklogs`에 선택적 권한 주체 세그먼트, `invalidateCollabScopedViews` 헬퍼
- **DB**: `project` 테이블 컬럼 3개 추가(MySQL), 마이그레이션 `v025`. KVS 변경 없음(manifest attributes 변경 없음)
- **i18n**: `locales/kr/collab.json`, `locales/en/collab.json` 신규
- **문서**: 아키텍처 설계서 §4.4 ⑥, `CLAUDE.md` 1문단, `WORK_VIEWS.md`·`GANTT.md` 각 1줄

### 1-3. 1차 범위 밖(손대지 않음)
분석 리포트·내 작업·문서 탭·자원관리·전사 대시보드, 대시보드 progressTrend/costBurnUp 위젯(분석 탭 resolver 재사용 — 본인 자격 유지, 배지 툴팁에 명시), 트리 상세 연관관계(`useIssueRelations` — 프로젝트 밖 이슈가 섞이므로 본인 자격 유지), 맵 커밋 탭, 캘린더 이슈 필터 셀렉트(본인 자격 유지 — §11 한계), 이슈 본문·댓글·첨부.

---

## 2. 경계 강제 표 (요구사항 경계 1~7)

| # | 경계 | 강제 위치(파일·함수) | 실패 시 동작 | 테스트 |
|---|---|---|---|---|
| 1 | 대상 이슈 = `moves_RMS_projectId = <id>`만. JQL 서버 조립·프로젝트 술어 항상 AND. 클라이언트 JQL 미수신 | ① `projectCollab/CollabJqlBuilder.js` `buildCollabJql({projectId, groupKey?, filter?, keys?})` — 반환 JQL은 **항상** `moves_RMS_projectId = "<uuid>" AND (...)` 형태이고 이 함수 말고는 협업 경로에서 JQL을 만들 수 없다(페처는 JQL 문자열 인자를 받지 않고 builder 결과만 받음)<br>② `CollabIssueFetcher`는 `projectId`만 받아 내부에서 builder 호출<br>③ `getCollabWorkListDetail`의 `key IN`에도 프로젝트 술어 AND(기존 브라우저 경로와 **의도적으로 다름**)<br>④ `getCollabIssueWorklogs`는 워크로그 조회 전 `key = "K" AND moves_RMS_projectId = "pid"` 앱 검색으로 소속 확인<br>⑤ 서버 판정 경로는 기존 전용 페처의 고정 JQL(`moves_RMS_projectId="pid"`)을 그대로 사용<br>⑥ 입력 검증: `projectId` UUID 정규식, `groupKey` `^[A-Z][A-Z0-9_]{0,49}$`, 이슈 키 `^[A-Z][A-Z0-9_]*-\d+$`, 필터 알 수 없는 키·JQL 문자열 필드(`jql`) **거부** | `LogicalError(COLLAB_INVALID_INPUT)` / `COLLAB_ISSUE_NOT_IN_PROJECT` → `{success:false}` | builder 단위: 모든 출력이 프로젝트 술어로 시작·필터는 괄호 안, 값에 `" OR moves_RMS_projectId = "x`·`\` 주입 시 이스케이프 결과 확인, `payload.jql` 무시가 아니라 거부, 알 수 없는 필터 키 거부, 잘못된 UUID/그룹키 거부, detail keys에도 술어 포함 |
| 2 | 대상 사용자 = 참여 인원만(`project_users`) + `ProjectScope` | `src/permission/CollabAccess.js` `resolveCollabReadAuthority` / `assertCollabReadAccess` — 단일 SQL `ProjectQuery.FIND_COLLAB_ACCESS`(프로젝트 상태 + `EXISTS projectusers(account_id=?)`) + `scopedProjectIds(principal)`. 가드 `project:'detail'`이 1차로 스코프를 거르고, CollabAccess가 **참여 여부를 추가로** 본다(ALL 스코프 관리자·TEAM_ONLY 팀원도 비참여자면 앱 자격 불가) | 전용 resolver: `PermissionError(COLLAB_NOT_PARTICIPANT)`<br>서버 판정 resolver: `'user'`로 강등(기존 동작) | CollabAccess 단위: 비참여 ALL 관리자 → user/거부, TEAM_ONLY 팀원(본인 미등록) → user/거부, principal 없음 → user/거부, 스코프 밖 → 거부, 참여자 → app |
| 3 | 켜져 있을 때만(fail-close). 설정값은 서버가 읽음 | 같은 `CollabAccess` — `collab_mode` 는 DB에서만 읽고, 협업 resolver 8개와 서버 판정 resolver 어느 것도 payload의 `collabMode`/`readAuthority`를 읽지 않는다. 컬럼 미존재(배포↔마이그레이션 시차)·SQL 오류는 **OFF로 간주** | 전용 resolver: `PermissionError(COLLAB_MODE_OFF)`<br>서버 판정: `'user'` | 꺼진 프로젝트 전용 조회 resolver 6종 거부, payload에 `collabMode:true` 넣어도 거부, `Unknown column` 오류 시 OFF, 삭제 중 프로젝트 거부 |
| 4 | 응답 최소화 | 전용 resolver: `projectCollab/CollabDto.js`의 **리터럴 allowlist 매퍼**(`toCollabIssueRow`, `toCollabSummaryRow`, `toCollabSkeletonRow`, `toCollabCalendarIssue`, `toCollabWorklog`) — 원문 객체 전달 금지, 페처가 요청하는 `fields`도 allowlist 상수로 고정<br>서버 판정 경로: 이미 DTO(`GanttMapper`, Insight, RelationGraph, 집계) — 원문 미전달 확인됨 | – | DTO 단위: 원문에 `description`·`comment(이슈)`·`attachment`·`reporter`·알 수 없는 필드를 넣어도 출력에 없음(스냅샷 키 목록 비교) |
| 5 | 표시(배지·안내) | 프론트 `components/collab/CollabModeNotice.jsx` — `useProjectReadAuthority(projectId).readAuthority === 'app'`일 때 작업관리 셸·캘린더 필터 바·대시보드 헤더에 렌더. 툴팁에 "Jira 링크 이동 시 권한이 없으면 열리지 않음", "진척 추이·비용 소진 위젯·연관관계는 본인 권한 기준" | – | 컴포넌트 테스트: app일 때만 렌더, user일 때 null |
| 6 | 감사 가능성 | `project.collab_mode_changed_by` / `collab_mode_changed_at`. 쓰기는 `setProjectCollabMode` → `ProjectQuery.UPDATE_COLLAB_MODE`(**값이 실제로 바뀔 때만** 갱신: `AND collab_mode <> ?`) | 변경 없음이면 `changed:false`(감사 컬럼 불변) | 서비스 단위: on→on 은 컬럼 불변, off→on 은 by/at 갱신, 삭제 중 프로젝트 거부, context/principal accountId 불일치 거부 |
| 7 | 아키텍처 §4.4 ⑥ 추가 | `Moves_Workforce_아키텍처_설계서.md` §4.4 문안(§8) + `CLAUDE.md` 문안(§8). 코드 주석에서 `[[§4.4 ⑥]]` 로 참조 | – | 리뷰 체크리스트(문서 diff 존재) |

**쓰기 불변 보증(요구 "쓰기 동작은 본인 자격")**: 다음 함수는 **수정 금지 목록**이다 — `GanttService.fetchGanttGraph`, `assertGanttIssueInProject`, `ProjectChildScope.assertIssueIdsInProject`, `updateProjectIdFieldService`의 `areIssuesAccessible(...,'user')`, `IssueApi.isIssueInProjects/areIssuesInProject/areIssuesAccessible`의 기본값. 테스트로 고정한다(§9-1 W1).

---

## 3. 경계면 계약 (가장 중요)

공통 규약: 모든 협업 resolver 는 `guardedDefine` 등록, 성공 `{ success:true, ...result }` / 실패 `{ success:false, error:{ name, code, message, cause } }`. 날짜는 `YYYY-MM-DD`.

### 3-A. 신규 resolver

| resolver | PermissionMap | 입력 | 응답(success 시, 글자 그대로) | 프론트 훅 / 쿼리 키 |
|---|---|---|---|---|
| `getProjectCollabAccess` | `R('PROJECT','detail')` | `{ projectId }` | `{ success, content: { projectId, collabMode: boolean, readAuthority: 'app'\|'user', reason: 'ON'\|'OFF'\|'NOT_PARTICIPANT'\|'OUT_OF_SCOPE'\|'NOT_READY', changedBy: string\|null, changedAt: string(ISO)\|null } }` | `useProjectReadAuthority(projectId)` / `projectKeys.collabAccess(projectId)` = `['projectCollabAccess', projectId]` |
| `setProjectCollabMode` | `W('PROJECT','detail')` | `{ project_id, enabled: boolean }` (boolean 아니면 거부) | `{ success, content: { projectId, collabMode: boolean, changed: boolean, changedBy: string\|null, changedAt: string\|null } }` | `ProjectModal` 토글 mutation → 성공 시 `invalidateCollabScopedViews(qc, projectId)` |
| `getCollabWorkListSummary` | `R('PROJECT','detail')` | `{ projectId, filter: CollabFilter }` | `{ success, content: { rows: [ { p: string /*space key*/, s: 'new'\|'indeterminate'\|'done'\|null, t: string\|null /*issuetype name*/ } ], projects: { [spaceKey]: { id, key, name, avatarUrls: { '24x24', '16x16' } } }, issueTypeIcons: { [typeName]: string /*iconUrl*/ }, truncated: boolean } }` — 상한 2000행 | `useWorkListSummary` (app 분기) → `fromCollabSummary(content)` → 기존 `{ groups, issueTypeOptions, truncated }` / `workListKeys.summary(projectId, filter, 'app')` |
| `getCollabWorkListPage` | `R('PROJECT','detail')` | `{ projectId, groupKey, filter: CollabFilter, pageSize: 1..100, cursor: string\|null }` | `{ success, content: { issues: [CollabIssueRow], nextPageToken: string\|null } }` | `useWorkListGroupPage` → 클라가 `resolveCoworkerUserMap(issues)` 후 기존 `{ issues, nextPageToken, userMap }` / `workListKeys.groupPage(projectId, groupKey, filter, pageSize, cursor, 'app')` |
| `getCollabWorkListSkeleton` | `R('PROJECT','detail')` | `{ projectId, groupKey, filter: CollabFilter }` | `{ success, content: { rows: [ { key, parentKey: string\|null } ], truncated: boolean } }` — 상한 2000 | `useWorkListSkeleton` / `workListKeys.groupSkeleton(projectId, groupKey, filter, 'app')` |
| `getCollabWorkListDetail` | `R('PROJECT','detail')` | `{ projectId, keys: string[] (1..500) }` | `{ success, content: { issues: [CollabIssueRow] } }` (순서 무보장 — 클라가 `orderIssuesByKeys`) | `useWorkListDetail` → 클라가 `orderIssuesByKeys` + `resolveCoworkerUserMap` / `workListKeys.groupHierarchyPage(projectId, groupKey, filter, pageIndex, pageKeys, 'app')` |
| `getCollabCalendarWorklog` | `R('PROJECT','detail')` | `{ projectId, startDate, endDate }` (기간 ≤ 100일) | `{ success, data: [CollabCalendarIssue], memberTeamMap: { [accountId]: teamKey }, teamMeta: { [teamKey]: name }, truncated: boolean }` — **기존 `getProjectCalendarWorklog` 응답과 같은 루트 구조**(`content` 래핑 없음) + `truncated` 추가 | `useProjectCalender` (app 분기) / `calendarKeys.projectWorklogs({ projectId, startDate, endDate, readAuthority: 'app' })` |
| `getCollabIssueWorklogs` | `R('PROJECT','detail')` | `{ projectId, issueKey }` | `{ success, content: { worklogs: [CollabWorklog], total: number } }` — 첫 100건(기존 브라우저 경로와 동일 상한) | `useIssueWorklogs(issueKey, projectId)` / `projectKeys.issueWorklogs(issueKey, 'app', projectId)` |

> 권한 판정 실패 코드: 전용 resolver 6종(`getCollab*`)은 `assertCollabReadAccess`가 `COLLAB_MODE_OFF` / `COLLAB_NOT_PARTICIPANT` / `PERMISSION_PROJECT_SCOPE_DENIED` 를 던진다. `getProjectCollabAccess`는 **던지지 않고** `readAuthority:'user'` + `reason` 으로 답한다(프론트 분기용).

#### 공용 타입 (글자 그대로)

```js
// CollabFilter — 목록 뷰 필터의 구조화 형태. 알 수 없는 키가 있으면 COLLAB_INVALID_INPUT.
{
  text?: string,                                   // ≤ 200자, 제어문자 금지
  spaces?: { op: '=' | '!=', keys: string[] },     // ≤ 50, ^[A-Z][A-Z0-9_]{0,49}$
  assignees?: { op: '=' | '!=',
                accountIds: string[],              // ≤ 50, ^[A-Za-z0-9:_-]{1,128}$
                groups: string[],                  // ≤ 20, ≤ 255자
                unassigned: boolean },
  statusCategories?: Array<'new' | 'indeterminate' | 'done'>,
  issueTypes?: string[],                           // ≤ 50, ≤ 100자(따옴표 없는 원래 이름)
}

// CollabIssueRow — 목록 행. 기존 브라우저 응답(`*all`)의 부분집합, 구조 동일.
{
  id: string, key: string,
  fields: {
    summary: string,
    statusCategory: { key, name, colorName } | null,
    status: { name, statusCategory: { key, name, colorName } } | null,
    issuetype: { name, iconUrl } | null,
    project: { id, key, name } | null,
    assignee: { accountId, displayName, avatarUrls: { '24x24', '48x48' } } | null,
    customfield_10015: string | null,             // 시작일(현 코드와 같은 하드코딩 id)
    duedate: string | null,
    timetracking: { originalEstimateSeconds?, remainingEstimateSeconds?, timeSpentSeconds? },
    aggregateprogress: { percent? } | null,
    parent: { key } | null,
  },
  properties: { movesRms: { coworkers: string[] } },   // coworkers 외 키 제거
}

// CollabCalendarIssue — 기존 캘린더 응답 원소의 부분집합
{
  id, key,
  fields: {
    summary,
    status: { name, statusCategory: { key, name, colorName } } | null,
    issuetype: { name, iconUrl } | null,
    project: { id, key, name, avatarUrls: { '24x24' } } | null,
    assignee: { accountId, displayName, avatarUrls: { '24x24' } } | null,
    worklog: { total: number, worklogs: [CollabWorklog] },   // 기간 내 워크로그만
  },
  properties: { movesRms: { coworkers: string[] } },
}

// CollabWorklog
{ id, issueId, author: { accountId, displayName, avatarUrls: { '24x24', '48x48' } } | null,
  started, timeSpent, timeSpentSeconds, comment /* ADF 그대로(현재도 화면에 표시되는 값) */ }
```

> **의도적 제외(검증 X4)**: 작성자 `emailAddress` 는 어떤 협업 DTO 에도 넣지 않는다 — 앱 권한 조회가 사용자의 이메일 공개 설정을 넘을 수 있다. 그래서 협업 경로 캘린더 칩 툴팁에는 작성자 이메일 줄이 없다(`AvatarStack` 은 이메일이 없으면 그 줄을 그리지 않는다). 캘린더 칩 아바타 `16x16` 은 프론트가 `24x24` 로 보정한다.

> 구현 착수 시 frontend-engineer 는 `useIssueRowFactory.jsx`·`ProjectIssueTable.jsx`·`HierarchyToggleCell.jsx`·`WorklogModal.jsx`·`FullCalendar.jsx`·`WorklogHistoryList.jsx` 에서 `fields.`/`properties.`/`worklog.` 접근을 **grep 으로 재확인**하고, 위 allowlist 에 없는 필드가 쓰이면 architect 에게 알린다(누락 시 화면이 조용히 빈칸이 된다).

### 3-B. 서버 판정으로 바뀌는 기존 resolver (입력·응답 shape 불변)

| resolver | PermissionMap(불변) | 변경 | 적용 조건 |
|---|---|---|---|
| `getProjectGanttData` | `R('PROJECT','detail')` | Controller가 `principal` 전달 → `resolveCollabReadAuthority` → `getProjectGanttIssues(projectId, null, as)` | 트리·간트·맵·캘린더 이슈 모드 공통 |
| `getChartDataById`, `getChartData` | `R('DASHBOARD','detail')` | `data_type ∈ {issue, assignee, worklog}` 일 때만 판정 → `as` 전달. worklog 는 app 이면 `CollabWorklogFetcher` 경로 | 대시보드 issue/assignee/worklog 위젯 |
| `getDashboardIssueInsight` | `R('DASHBOARD','detail')` | `getDashboardIssues({..., as})` | riskIssues/issueSize/customFilter |
| `getProjectRelationGraph` | `R('PROJECT','detail')` | `getTopologyIssues({..., as})` | relationGraph |
| `getDashboardAggregate` | 불변 | **변경 없음**(이미 asApp — §11-5 참고) | – |

---

## 4. 백엔드 설계

### 4-1. 파일 구성

```
src/permission/CollabAccess.js                  ← 판정 단일 출처 (경계 2·3)
src/resolver/projectCollab/
  ProjectCollabController.js                    ← registerProjectCollabController
  ProjectCollabService.js                       ← access/set 서비스
  CollabWorkListService.js                      ← 목록 4종
  CollabCalendarService.js                      ← 캘린더 워크로그
  CollabIssueWorklogService.js                  ← 이슈 워크로그
  CollabJqlBuilder.js                             ← 경계 1 (순수)
  CollabDto.js                                    ← 경계 4 (순수, allowlist)
  CollabRepository.js                             ← FIND_COLLAB_ACCESS / UPDATE_COLLAB_MODE
  __test__/
src/api/jira/issue/CollabIssueFetcher.js        ← asApp 전용 검색 페처(POST /search/jql)
src/api/jira/worklog/CollabWorklogFetcher.js    ← asApp 전용 워크로그 페처(대시보드·캘린더 공용)
```

`src/index.js`: import 후 `CONTROLLER_REGISTRARS` 배열에 `registerProjectCollabController` 1줄 추가.

### 4-2. `CollabAccess.js`

```js
// 반환 'app' | 'user'. 절대 throw 하지 않는다(서버 판정 경로용).
export const resolveCollabReadAuthority = async ({ projectId, principal }) => ...
// 상세 사유까지 (getProjectCollabAccess 용). throw 안 함.
export const describeCollabAccess = async ({ projectId, principal }) =>
    ({ collabMode, readAuthority, reason, changedBy, changedAt })
// 전용 resolver 용. 'app' 이 아니면 throw.
export const assertCollabReadAccess = async ({ projectId, principal }) => { ... }
```
- 판정 순서: principal 없음 → `reason:'NOT_READY'`(assert 는 `PERMISSION_PRINCIPAL_UNRESOLVED`) / UUID 형식 아님 → 거부 / `scopedProjectIds` 밖 → `OUT_OF_SCOPE` / DB 1쿼리 → 행 없음·`deletion_state≠ACTIVE`·`collab_mode≠1` → `OFF` / `is_member=0` → `NOT_PARTICIPANT` / 그 외 `ON`.
- DB 오류: "Unknown column" 포함 모든 SQL 오류 → `OFF`(fail-close) + `console.error` 1줄. (TableReadiness 와 같은 "배포↔마이그레이션 시차" 방어)
- 캐시 없음(요청당 SQL 1회). 대시보드 위젯이 여러 번 부르는 비용은 경량 SELECT 라 수용.

### 4-3. Repository / Query (`ProjectQuery.js` 에 추가)

```sql
-- FIND_COLLAB_ACCESS  [accountId, projectId]
SELECT p.collab_mode, p.collab_mode_changed_by, p.collab_mode_changed_at, p.deletion_state,
       EXISTS(SELECT 1 FROM projectusers pu
              WHERE pu.project_id = p.project_id AND pu.account_id = ?) AS is_member
FROM project p WHERE p.project_id = UUID_TO_BIN(?)

-- UPDATE_COLLAB_MODE  [enabled, accountId, projectId, enabled]
UPDATE project SET collab_mode = ?, collab_mode_changed_by = ?, collab_mode_changed_at = CURRENT_TIMESTAMP
WHERE project_id = UUID_TO_BIN(?) AND deletion_state = 'ACTIVE' AND collab_mode <> ?
```
- ⚠ `FIND_BY_ID`·`FINDALL`·`UPDATE`에는 **컬럼을 넣지 않는다** — 마이그레이션 전 배포에서 프로젝트 상세 전체가 죽는 것을 막기 위해(협업 컬럼은 협업 쿼리에서만 읽는다). 이 결정으로 `findProjectById` 캐시 shape(`{success, rows}` vs `rows[0]` — §11-8) 에도 의존하지 않는다.
- `UPDATE_COLLAB_MODE` 가 0행이면 재조회해 `ACTIVE` 가 아니면 `PROJECT_DELETING`, 같으면 `changed:false`.

### 4-4. `ProjectCollabService.js`

- `getProjectCollabAccessService({ projectId }, principal)` → `describeCollabAccess` 결과를 `{ content: {...} }`로.
- `setProjectCollabModeService({ project_id, enabled }, context, principal)`
  - `typeof enabled !== 'boolean'` → `LogicalError(COLLAB_INVALID_INPUT)` (입력 오류는 전부 이 코드 하나로 통일, §4-9)
  - `context.accountId !== principal.accountId` → `PermissionError(PERMISSION_DENIED)`(`ProjectService.assertProjectWriter` 와 같은 판정 — 그 함수는 private 이므로 같은 두 줄을 둔다)
  - 참여 여부는 **요구하지 않는다**(요구사항: 켜는 사람 = `PROJECT write`).

### 4-5. `CollabJqlBuilder.js` (순수 함수, 경계 1)

```js
export const quoteJql = (v) => `"${String(v).replace(/[\\"]/g, '\\$&')}"`;   // 제어문자는 validate 단계에서 거부
export const validateCollabFilter = (filter) => normalizedFilter   // 알 수 없는 키·형식 위반 → throw
export const buildCollabJql = ({ projectId, groupKey = null, filter = null, keys = null }) => string
```
조립 규칙:
- 항상 `moves_RMS_projectId = "<projectId>"` 로 시작(UUID 검증 후).
- `groupKey` 있으면 ` AND project = "<KEY>"`.
- `keys` 있으면 ` AND key IN ("A-1","A-2")`.
- 필터 절은 `AND (절1 AND 절2 …)` 로 **괄호로 묶는다**.
  - `text`: `jqlMaker.buildTextClause` 와 같은 의미 — 이슈 키 꼴이면 `(textfields ~ "x" OR issuekey = "X-1")`, 아니면 `textfields ~ "x"`
  - `spaces`: 1개면 `project = "K"`/`!=`, 여러 개면 `project IN ("K1","K2")`/`NOT IN`
  - `assignees`: 토큰 목록 = `accountIds` 각각 `"id"` + `groups` 각각 `membersOf("g")`(g 는 quoteJql) + `unassigned` 면 `EMPTY`. 1개면 `assignee = T`/`!=`, 여러 개면 `IN`/`NOT IN` — **`generateJQL` 과 같은 연산자 선택**(결과 모집단 일치가 목적)
  - `statusCategories`: `statusCategory IN ("new", ...)` (1개면 `=`)
  - `issueTypes`: `issuetype IN ("Task", ...)` (1개면 `=`)
- ORDER BY 없음(기존 브라우저 JQL 과 동일).
- `payload.jql`·`payload.filterJql` 같은 문자열 JQL 키가 오면 service 가 `COLLAB_INVALID_INPUT` 으로 **거부**(무시하지 않는다 — 조용히 무시하면 클라이언트 회귀를 못 본다).

### 4-6. 전용 페처

**`CollabIssueFetcher.js`** — `postJiraJson({ as: 'app', url: route\`/rest/api/3/search/jql\`, body })` 만 사용(`DashboardAggregateFetcher` 선례). 공통 `IssueApi` 무수정.
| 함수 | fields(allowlist 상수) | 페이지 | 상한 |
|---|---|---|---|
| `searchCollabSummary({ projectId, filter })` | `project, status, issuetype` | 100 × ≤20 | 2000, `truncated` |
| `searchCollabPage({ projectId, groupKey, filter, pageSize, cursor })` | `ROW_FIELDS` + `properties:['movesRms']` | 1회 | pageSize ≤ 100 |
| `searchCollabSkeleton({ projectId, groupKey, filter })` | `parent` | 500 × ≤24, `isLast` 우선 판정(기존 규칙) | 2000, `truncated` |
| `searchCollabByKeys({ projectId, keys })` | `ROW_FIELDS` + movesRms | 50키 청크, `p-limit(3)`, 청크당 추적 ≤2 | 500키. 청크 하나라도 실패하면 전체 throw(기존 규칙) |
| `searchCollabCalendarIssues({ projectId, startDate, endDate })` | `summary, status, issuetype, project, assignee, worklog` + movesRms, JQL 에 `worklogDate >= "s" AND worklogDate <= "e"` 추가(builder 확장 인자 `worklogRange`) | 100 × ≤10 | 1000, `truncated` |
| `isIssueInCollabProject({ projectId, issueKey })` | `id`, maxResults 1 | 1회 | – |

`ROW_FIELDS = ['summary','status','statusCategory','issuetype','project','assignee','customfield_10015','duedate','timetracking','aggregateprogress','parent']`, `fieldsByKeys: true`.

**`CollabWorklogFetcher.js`** — 공통 `WorklogService`/`WorklogApi` 무수정, `WorklogApi.getWorkLogByIssueKey({ ..., as: 'app' })` 재사용.
- `fetchIssueWorklogsAsApp(issueKey, { startAt, maxResult })` — 단건
- `collectRangeWorklogsAsApp(issues, { startDate, endDate, concurrency: 5 })` — 인라인 초과분(`worklog.total > worklog.maxResults`) 추가 페이지를 `p-limit(5)` 로 조회 후 기간 필터(캘린더 `processIssue` 와 같은 규칙)
- `getProjectWorklogsAsApp({ projectId, startDate, endDate, accountId })` — 대시보드용: `buildCollabJql` + `worklogRange` + `worklogAuthor IN (...)`(accountId 는 정규식 검증) 로 이슈 수집(nextPageToken 루프, 상한 1000 이슈) → 워크로그 정규화(`WorklogService` 의 `normalizeWorklog` 와 같은 필드) 반환
- 대시보드 집계 캐시: KVS 키 `Collab:UserDate:...` / `Collab:Date:...`(TTL 10분). **기존 `UserDate:`/`Date:` 키에 절대 쓰지 않는다**(사실 6).

### 4-7. 서비스별 처리

**`CollabWorkListService.js`** (4 함수 모두 첫 줄 `await assertCollabReadAccess({ projectId, principal })`, `validateCollabFilter`)
- summary: `searchCollabSummary` → `CollabDto.toCollabSummary(issues)` = `{ rows, projects, issueTypeIcons, truncated }`
- page: `searchCollabPage` → `{ issues: issues.map(toCollabIssueRow), nextPageToken }`
- skeleton: `{ rows: issues.map(i => ({ key: i.key, parentKey: i.fields?.parent?.key ?? null })), truncated }`
- detail: keys 검증(정규식·중복 제거·≤500) → `searchCollabByKeys` → `{ issues: issues.map(toCollabIssueRow) }`
  - ⚠ 기존 브라우저 경로는 `key IN` 에 프로젝트 술어를 **다시 AND 하지 않는다**(편입 해제된 자식이 상세만 사라지는 것을 피하려고). 협업 경로는 경계 1 때문에 **반드시 AND** 한다. 그 사이 편입 해제된 이슈는 상세가 빠져 행이 사라진다 — 다음 골격 재조회에서 정리되므로 수용(보안 > 순간 일관성).

**`CollabCalendarService.js`**: `assertCollabReadAccess` → 기간 검증(형식·`start ≤ end`·≤100일, 위반 `COLLAB_INVALID_INPUT`) → `Promise.all([searchCollabCalendarIssues, buildTeamAxis([projectId])])` → `collectRangeWorklogsAsApp` → `toCollabCalendarIssue` → `{ data, memberTeamMap, teamMeta, truncated }`. `buildTeamAxis` 는 `ProjectCalendarService` 에서 **export 만** 추가해 재사용.

**`CollabIssueWorklogService.js`**: `assertCollabReadAccess` → 이슈 키 정규식 → `isIssueInCollabProject`(false → `COLLAB_ISSUE_NOT_IN_PROJECT`) → `fetchIssueWorklogsAsApp(issueKey, { startAt:0, maxResult:100 })` → `{ worklogs: map(toCollabWorklog), total }`.

**서버 판정 경로 수정(최소 diff)**
- `GanttController.getProjectGanttData`: `({payload, principal}) => getProjectGanttData(payload, principal)`
- `GanttService.getProjectGanttData(payload, principal)`: 첫 단계에서 `const as = await resolveCollabReadAuthority({ projectId, principal })` → `getProjectGanttIssues(projectId, null, as)`. **`fetchGanttGraph` 는 수정 금지**(쓰기 검증 = 본인 자격).
- `ProjectDashboardService`
  - `getChartDataByIdService`: `data_type ∈ COLLAB_DATA_TYPES(['issue','assignee','worklog'])` 이면 `readAuthority` 판정, 아니면 `'user'` 고정(불필요한 SQL 방지) → `getChartDataset({..., readAuthority})`
  - `getChartDataService`: rows 중 해당 타입이 하나라도 있으면 루프 밖 1회 판정
  - `getAssigneeChartData`/`getIssueChartData`: `as: readAuthority` 관통 → `ProjectUsersService.get*StatsService({..., as})` → `IssueApi.getAssigneeStats/getIssueParticipantStats({..., as})` → `ProjectParticipantFetcher.getProjectParticipantIssues({ projectId, viewerId, as = 'user' })`: `fetchParticipantIssues(projectId, as)` 의 하드코딩 `'user'` → 인자. 캐시 키: `as === 'app' ? \`app::${projectId}\` : \`${viewerId}::${projectId}\``(user 키 형식 불변). **모든 기본값 `'user'`** — 기존 호출자 무변경.
  - `formatWorklogChartData`: `readAuthority === 'app'` 이면 `CollabWorklogFetcher` 기반 집계(heatmap=`aggregateByDate`, lineStack=`aggregateByUserDate` — `WorklogService` 에서 **export 만 추가**), 아니면 기존 그대로. `resolveHeatmapCapacity` 는 DB 라 공용.
- `DashboardInsightService`: `getDashboardIssues({ projectId, viewerId, as })`. `DashboardIssueFetcher` 캐시 키: `as === 'app' ? \`app::${projectId}\` : 기존`.
- `RelationGraphService`: 동일하게 `getTopologyIssues({..., as})` + `TopologyIssueFetcher` 캐시 키 분리.

### 4-8. Controller (`ProjectCollabController.js`)

```js
export function registerProjectCollabController(resolver) {
    guardedDefine(resolver, 'getProjectCollabAccess', ({ payload, principal }) => getProjectCollabAccessService(payload, principal));
    guardedDefine(resolver, 'setProjectCollabMode', ({ payload, context, principal }) => setProjectCollabModeService(payload, context, principal));
    guardedDefine(resolver, 'getCollabWorkListSummary',  ({ payload, principal }) => getCollabWorkListSummaryService(payload, principal));
    guardedDefine(resolver, 'getCollabWorkListPage',     ({ payload, principal }) => getCollabWorkListPageService(payload, principal));
    guardedDefine(resolver, 'getCollabWorkListSkeleton', ({ payload, principal }) => getCollabWorkListSkeletonService(payload, principal));
    guardedDefine(resolver, 'getCollabWorkListDetail',   ({ payload, principal }) => getCollabWorkListDetailService(payload, principal));
    guardedDefine(resolver, 'getCollabCalendarWorklog',  ({ payload, principal }) => getCollabCalendarWorklogService(payload, principal));
    guardedDefine(resolver, 'getCollabIssueWorklogs',    ({ payload, principal }) => getCollabIssueWorklogsService(payload, principal));
}
```
(resolver 8개 — `getProjectCollabAccess`·`setProjectCollabMode` + 전용 조회 6개)

`PermissionMap.js` 에 섹션 추가:
```js
// ── ProjectCollab (ProjectCollabController, 8) ── 협업 모드(아키텍처 §4.4 ⑥)
//   조회 6종은 가드(PROJECT read·detail) 통과 후 서비스가 CollabAccess 로 켜짐·참여를 **다시** 판정한다.
getProjectCollabAccess: R('PROJECT', 'detail'),
setProjectCollabMode: W('PROJECT', 'detail'),
getCollabWorkListSummary: R('PROJECT', 'detail'),
getCollabWorkListPage: R('PROJECT', 'detail'),
getCollabWorkListSkeleton: R('PROJECT', 'detail'),
getCollabWorkListDetail: R('PROJECT', 'detail'),
getCollabCalendarWorklog: R('PROJECT', 'detail'),
getCollabIssueWorklogs: R('PROJECT', 'detail'),
```
모든 입력 키는 `projectId`(가드 스코프 검증이 읽는 키), `setProjectCollabMode` 만 `project_id`(`updateProject` 와 같은 관례).

### 4-9. ErrorCodes 추가

| 코드 | 에러 클래스 | 의미 |
|---|---|---|
| `COLLAB_MODE_OFF` | `PermissionError` | 협업 모드가 꺼짐/삭제 중/설정 미준비 |
| `COLLAB_NOT_PARTICIPANT` | `PermissionError` | 참여 인원 아님 |
| `COLLAB_INVALID_INPUT` | `LogicalError` | 필터·키·기간·enabled 형식 위반, 문자열 JQL 수신 |
| `COLLAB_ISSUE_NOT_IN_PROJECT` | `LogicalError` | 이슈가 이 프로젝트에 연결되지 않음 |

(스코프 밖은 기존 `PERMISSION_PROJECT_SCOPE_DENIED`, 삭제 중 토글은 기존 `PROJECT_DELETING` 재사용)

---

## 5. 프론트엔드 설계

### 5-1. 권한 주체 훅 — 화면 분기의 단일 출처

`static/ui/src/hooks/useProjectReadAuthority.js`
```js
export const useProjectReadAuthority = (projectId) => {
  // invoke('getProjectCollabAccess', { projectId }) — staleTime 30s, refetchOnWindowFocus: true
  // 반환: { readAuthority: 'app'|'user', collabMode, reason, changedBy, changedAt, isReady }
  // 실패·success:false → readAuthority:'user', isReady:true (본인 자격으로 동작 — fail-close)
  // 값이 이전과 달라지면(useRef 비교) invalidateCollabScopedViews(qc, projectId) 1회
}
```
- `ProjectDetailPage` 가 마운트 시 이 훅을 호출해 **캐시를 데운다**(탭 진입 시 왕복 1회 절약).
- 목록·캘린더·워크로그 패널 훅은 `isReady` 전까지 `enabled:false`.

### 5-2. 화면별 분기 지점 (화면당 1곳)

| 화면 | 분기 위치 | user 경로 | app 경로 |
|---|---|---|---|
| 목록 요약 | `useWorkListQueries.useWorkListSummary` | 기존 `fetchWorkListSummary` | `invoke('getCollabWorkListSummary', { projectId, filter: toCollabFilter(filter) })` → `unwrap` → `fromCollabSummary(content)` |
| 목록 페이지 | `useWorkListGroupPage` | 기존 | `getCollabWorkListPage` → `{ issues, nextPageToken, userMap: await resolveCoworkerUserMap(issues) }` |
| 목록 골격 | `useWorkListSkeleton` | 기존 | `getCollabWorkListSkeleton` → `content` 그대로(`{rows, truncated}`) |
| 목록 상세 | `useWorkListDetail` | 기존 | `getCollabWorkListDetail` → `orderIssuesByKeys(issues, keys)` + userMap |
| 트리·간트·맵 | **분기 없음**(서버 판정) | – | – |
| 워크로그 패널 | `work/useIssueWorklogs(issueKey, projectId)` | 기존 | `getCollabIssueWorklogs` → `content.worklogs`. 호출 3곳(`TreeDetailPanel`, `MapWorklogTab`, `IssueMapDrawer`)에 `projectId` 전달 추가 |
| 캘린더 워크로그 | `calender/useProjectCalender` | 기존 `getProjectCalendarWorklog` | `getCollabCalendarWorklog({ projectId: project_id, startDate, endDate })` — 반환 shape 같으므로 `ProjectCalender.jsx` 무변경 |
| 캘린더 이슈 모드 | 분기 없음(`useGanttData`) | – | – |
| 대시보드 | **분기 없음**(서버 판정) | – | – |

- app 경로의 `success:false` 응답에서 `error.code ∈ {COLLAB_MODE_OFF, COLLAB_NOT_PARTICIPANT}` 이면 `projectKeys.collabAccess(projectId)` 를 invalidate(→ 다음 렌더에서 user 경로로 전환). 그 외는 기존과 같이 throw(에러 UI).
- 목록 훅의 `unwrap`: `invoke` 는 실패해도 throw 하지 않으므로 `assertSearchOk` 와 같은 방식으로 승격.

### 5-3. `workListQuery.js` 순수 함수 추가

- `toCollabFilter(normalizedFilter)` — `normalizeJqlMap` 결과를 `CollabFilter` 로 번역:
  - `textfields` → `text`
  - `project` → `spaces { op: state, keys: value }`
  - `assignee` → 값별: `'EMPTY'` → `unassigned:true`, `/^membersOf\("(.*)"\)$/` → `groups`(따옴표 해제), 그 외 → `accountIds`
  - `statusCategory` → `statusCategories`(state `=`만 존재)
  - `issuetype` → `issueTypes`(값의 `quoteJqlValue` 역변환)
  - 그 외 키 → `throw`(개발 단계에서 새 필터 추가 시 서버 계약도 함께 바꾸게 강제)
- `fromCollabSummary({ rows, projects, issueTypeIcons, truncated })` → rows 를 `{ fields: { project: projects[p], status: { statusCategory: { key: s } }, issuetype: { name: t, iconUrl: issueTypeIcons[t] } } }` 로 복원 → **기존 `buildGroups`·`deriveIssueTypeOptions` 그대로** 호출 → `{ groups, issueTypeOptions, truncated }`. (그룹·옵션 규칙의 단일 출처를 프론트에 유지하면서 페이로드를 줄이려는 형태 — 2000행 × ~40B)

### 5-4. 쿼리 키 (`utils/queryKey/`)

| 팩토리 | 변경 | 비고 |
|---|---|---|
| `projectKeys.collabAccess(projectId)` | 신규 `['projectCollabAccess', projectId]` | |
| `workListKeys.summary(projectId, filter, authority)` 외 `groupPage`/`groupSkeleton`/`groupHierarchyPage` | 마지막 인자 `authority` 추가. `'app'` 일 때만 끝에 `'app'` 세그먼트를 붙이고, 아니면 **기존 키와 바이트 동일** | 끝에 붙이므로 `summaryAll`/`groupAll` prefix 무효화가 그대로 걸린다. `patchIssueByKey` 는 호출자가 쓰던 키를 그대로 넘기므로 무변경 |
| `calendarKeys.projectWorklogs({ projectId, startDate, endDate, readAuthority })` | `readAuthority === 'app'` 일 때만 객체에 키 포함 | `worklogDrop`·`submitModal` 의 invalidate 는 부분 일치(TanStack 객체 부분 매칭)라 그대로 걸린다 |
| `projectKeys.issueWorklogs(issueKey, authority, projectId)` | `'app'` 이면 `['issueWorklogs', issueKey, 'app', projectId]`, 아니면 기존 | |
| `ganttKeys.data`, 대시보드 키 | **변경 없음** | 서버 판정 경로. 전환은 아래 헬퍼의 invalidate 로 반영 |
| `invalidateCollabScopedViews(qc, projectId)` | 신규 헬퍼(`projectKeys.js`) | `collabAccess`, `ganttKeys.data`, `workListKeys.scope`, `calendarKeys.all`, `['getChartDataById', projectId]`(= `dashboardItemPrefix` 의 project prefix — 새 팩토리 `dashboardItemsOf(projectId)` 로 추가), `dashboardInsight`, `relationGraph`, `issueWorklogs` 무효화 |

### 5-5. 표시 — `components/collab/CollabModeNotice.jsx`

- props `{ projectId }`. `useProjectReadAuthority` 가 `'app'` 일 때만 Atlaskit `Lozenge`(appearance 기본값 + style 로 틸 계열 — Forge 에서 `accent-*` 는 회색 강등됨 [[project_status_lozenge_rfc199]]) "협업 모드" + `Tooltip`/`InlineDialog` 안내문 2줄.
- 위치: `work/ProjectWorkPanel.jsx` 뷰 토글 옆, `calender/ProjectCalender.jsx` 필터 바 오른쪽, `dashboard/DashboardPage.jsx` 헤더 액션 영역.
- 트리 상세 연관관계 섹션: app 일 때 `collab.notice.relationsUserOnly` 한 줄(본인 권한으로만 조회됨).
- 비참여자·꺼짐: 아무것도 렌더하지 않는다(`reason` 은 표시하지 않음 — 불필요한 UI 금지).

### 5-6. 설정 토글 — `ProjectModal.jsx`

- **수정 모드(`editId`)에서만** 폼 하단에 "협업 모드" 섹션: Atlaskit `Toggle` + 설명 + "마지막 변경: {이름} · {일시}"(`changedBy` 는 기존 `userMap`/`getUser` 로 이름 표시).
- 상태 원천은 `useProjectReadAuthority(editId)` 의 `collabMode`(= `getProjectCollabAccess`) — `findProjectById` 캐시를 읽지 않는다.
- 동작은 **즉시 적용**(폼 저장과 분리): 켤 때는 확인 모달(`collab.toggle.confirmOn.*`), 끌 때는 확인 없이 적용. `invoke('setProjectCollabMode', { project_id: editId, enabled })` → 성공 토스트 + `invalidateCollabScopedViews`. 실패 토스트 + 토글 원복.
  - 폼 저장과 묶지 않는 이유: `updateProject` 성공·토글 실패의 부분 성공 상태를 만들지 않기 위해, 그리고 감사 컬럼이 "기본 정보 수정"과 섞이지 않게.
- 노출/활성: `canWrite('PROJECT')` 가 false 면 토글 `isDisabled`(현재 값은 보여 준다). 서버가 최종 거부(`W('PROJECT','detail')`).

### 5-7. 쓰기 동작 — 화면별 불변 확인과 실패 안내

| 화면 | 쓰기 | 현재 경로·자격 | 협업 모드에서 못 보는 이슈에 시도 시 | 변경 |
|---|---|---|---|---|
| 목록 | 담당자·시작일·기한·MD 인라인 편집 | 브라우저 `assignIssue`/`updateIssue`(본인) + `useJiraProjectPermissions` 사전 체크 | 사전 체크가 `false` → 기존 info 토스트(`projectDetail.issue.jiraPermission.*`), `null` 이면 Jira 403 → 기존 실패 토스트 | 없음 |
| 목록 | 협업자 | `updateIssueCoworkers`(가드 + `assertIssueIdsInProject(...,'user')`) | 서버 거부 → 기존 실패 토스트 | 없음 |
| 목록 | 일괄 적용·일괄 제외·이슈 추가 | 본인 자격 경로(`deleteProjectIssue` 는 `assertIssueIdsInProject`) | 부분 실패 집계(기존) | 없음 |
| 목록 | 쓰기 직후 행 재조회 `searchByIssueId` | 브라우저 `getIssue`(본인) | 실패 응답엔 `key` 가 없어 `patchIssueByKey` 무동작 → 행 유지 | 없음 |
| 트리·간트 | 일정·상위·선후행·폴더 소속·MD·협업자 | resolver(검증=`fetchGanttGraph`/`isIssueInProjects`/`areIssuesAccessible` 본인) + 브라우저 `updateIssue` | `GANTT_ISSUE_NOT_FOUND`/`JIRA_PERMISSION_DENIED`/`PERMISSION_*` | **문구만**: `utils/collab/collabErrors.js` `collabWriteMessage(t, code, readAuthority)` — app 이고 코드가 위 셋이면 `collab.write.noPermission` 반환. `useGanttMutations`(일정·관계·MD·협업자 onError)·`useGanttFolderMutations`(이슈 폴더 지정)에서 기존 메시지보다 먼저 확인. readAuthority 는 `qc.getQueryData(projectKeys.collabAccess(projectId))` 로 읽는다 |
| 맵 | 없음(읽기 전용) | – | – | 없음 |
| 캘린더 | 워크로그 드래그·모달 수정/등록 | 브라우저 `updateWorklog` 등(본인) | Jira 403 → 기존 `calendar.worklog.moveError` 등 | 없음 |
| 대시보드 | 위젯 배치·필터 | DB | 무관 | 없음 |

### 5-8. 권한 체크
탭 노출은 기존 그대로(`PROJECT`/`DASHBOARD` read). 협업 모드는 탭 노출에 영향 없음.

---

## 6. DB 설계

`src/rdb/schema/ddl/project.sql.js`
```js
/**
 * 협업 모드(아키텍처 §4.4 ⑥) — 켜면 참여 인원이 연결 이슈·워크로그를 앱 자격으로 조회한다.
 * ⚠ CREATE TABLE 본문 불변(v012/v013/v020 관례). ADD COLUMN IF NOT EXISTS → 멱등.
 * ⚠ FIND_BY_ID 등 기존 SELECT 에는 넣지 않는다 — 협업 쿼리(FIND_COLLAB_ACCESS)만 읽는다(배포↔마이그레이션 시차 방어).
 */
export const ALTER_PROJECT_ADD_COLLAB_MODE = `
    ALTER TABLE project
    ADD COLUMN IF NOT EXISTS collab_mode TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS collab_mode_changed_by VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS collab_mode_changed_at TIMESTAMP NULL
`;
```
- `ddl/index.js` project 줄에 export 추가, `migrate.js` import + `.enqueue('v025_alter_project_add_collab_mode', ALTER_PROJECT_ADD_COLLAB_MODE)` (v024 다음). ⚠ 착수 시 develop 과 stash(`stash@{0}`, RFC-200)에 v025 선점이 없는지 확인.
- 기존 프로젝트는 전부 `0`(꺼짐) — 배포만으로 권한 범위가 넓어지지 않는다.
- 감사는 **최종 변경 1건**만 남는다(이력 테이블 없음 — 요구사항 "컬럼 정도면 충분"). 프로젝트 삭제 시 행과 함께 사라진다(cascade 추가 작업 없음).
- `데이터모델_ERD.md` project 테이블에 3컬럼 추가(문서).

---

## 7. i18n 키 목록 — `locales/kr/collab.json` · `locales/en/collab.json` (네임스페이스 `collab.*`)

| 키 | kr | en |
|---|---|---|
| `badge.label` | 협업 모드 | Collaboration mode |
| `badge.tooltip` | 이 프로젝트에 연결된 작업을 참여 인원 모두가 볼 수 있도록 앱 권한으로 조회하고 있습니다. | Linked work items are loaded with app permissions so every project member can see them. |
| `badge.tooltipLink` | Jira에서 작업을 열면 Jira 권한이 없는 경우 보이지 않을 수 있습니다. | Opening a work item in Jira may fail if you don't have Jira permission for it. |
| `badge.tooltipExcluded` | 진척 추이·비용 소진 위젯과 연관관계는 본인 권한 기준으로 표시됩니다. | Progress trend, cost burn-up widgets and relations use your own permissions. |
| `notice.relationsUserOnly` | 연관관계는 본인의 Jira 권한으로 조회됩니다. | Relations are loaded with your own Jira permissions. |
| `toggle.title` | 협업 모드 | Collaboration mode |
| `toggle.description` | 켜면 프로젝트 참여 인원이 연결된 작업과 워크로그를 Jira 권한과 관계없이 볼 수 있습니다. 작업관리·캘린더·대시보드에 적용되며, 편집은 각자의 Jira 권한으로만 됩니다. | When on, project members can see linked work items and worklogs regardless of their Jira permissions. Applies to Work, Calendar and Dashboard; editing still requires each person's Jira permission. |
| `toggle.lastChanged` | 마지막 변경 | Last changed |
| `toggle.never` | 변경 이력 없음 | Never changed |
| `toggle.confirmOn.title` | 협업 모드를 켤까요? | Turn on collaboration mode? |
| `toggle.confirmOn.body` | 참여 인원 전원이 이 프로젝트에 연결된 작업과 다른 사람의 워크로그를 볼 수 있게 됩니다. | All project members will be able to see linked work items and other people's worklogs. |
| `toggle.confirmOn.confirm` | 켜기 | Turn on |
| `toggle.cancel` | 취소 | Cancel |
| `toast.on` | 협업 모드를 켰습니다. | Collaboration mode is on. |
| `toast.off` | 협업 모드를 껐습니다. | Collaboration mode is off. |
| `toast.failed` | 협업 모드를 변경하지 못했습니다. | Couldn't change collaboration mode. |
| `toggle.noPermission` | 프로젝트 수정 권한이 있어야 변경할 수 있습니다. | You need permission to edit the project. |
| `write.noPermission` | 협업 모드로 보이는 작업이지만 Jira 권한이 없어 수정할 수 없습니다. | This item is visible through collaboration mode, but you don't have Jira permission to edit it. |
| `truncated` | 작업이 많아 일부만 표시합니다. | Only part of the items are shown because there are too many. |

고객 노출 문구 규칙([[feedback_no_internal_jargon]]): "asApp·앱 자격·JQL" 같은 내부 용어를 쓰지 않는다 — 위 문안은 "앱 권한"까지만 쓴다. `ko-KR.json`/`en-US.json` 직접 수정 금지, 추가 후 `cd static/ui && npm run merge`.

---

## 8. 문서 문안

### 8-1. `Moves_Workforce_아키텍처_설계서.md` §4.4 — 허용 경로 문장 교체안

> - **asApp 허용 경로**: ① … ⑤ 앱 설정용 field/time-tracking metadata 조회, **⑥ 프로젝트 협업 모드 열람** — 프로젝트 쓰기 권한자가 프로젝트별로 켜는 설정(기본 꺼짐, 켠 사람·시각 기록)이며, 켜진 프로젝트에서 **그 프로젝트 참여 인원에게만**, **그 프로젝트에 연결된 이슈와 워크로그를** 작업관리·캘린더·프로젝트 대시보드 **조회**에 한해 앱 자격으로 읽는다. JQL 은 서버가 조립하고 프로젝트 술어를 항상 붙이며, 응답은 화면 필드만 담는다. 쓰기(이슈 편집·워크로그·연결 변경)는 본인 자격 그대로다. 판정 단일 출처 `src/permission/CollabAccess.js`.
>   마켓 심사 사유: "프로젝트 설정으로 쓰기 권한자가 켜는 열람 기능, 대상은 연결 이슈·참여 인원으로 한정".

### 8-2. `CLAUDE.md` — 「Jira API」 절 아래 추가안

> - **협업 모드(asApp ⑥)**: 켜진 프로젝트에서 참여 인원의 작업관리·캘린더·대시보드 **조회**만 앱 자격이다. 판정은 `src/permission/CollabAccess.js` 하나뿐 — 새 화면에 적용할 때 자체 판정을 만들지 말 것. 서버 판정형 resolver(간트·대시보드)는 `resolveCollabReadAuthority` 결과를 전용 페처의 `as` 로만 넘기고, **쓰기 검증(`fetchGanttGraph`·`assertIssueIdsInProject`·`areIssuesAccessible`)은 항상 본인 자격**으로 둔다. 앱 자격 결과를 캐시할 때는 본인 자격 캐시와 **키를 분리**한다(`WorklogService` KVS 키는 사용자 구분이 없다). 협업 전용 resolver 는 JQL 문자열을 받지 않고 `CollabJqlBuilder` 만 쓴다.

### 8-3. 기타
- `WORK_VIEWS.md` §1-3 권한 뒤 1줄: "협업 모드가 켜진 프로젝트의 참여자는 간트 데이터가 앱 자격으로 조회된다(서버 판정, 키·shape 불변). 목록 뷰는 전용 resolver 로 분기(`useWorkListQueries`)."
- `GANTT.md` 1줄: "`fetchGanttGraph` 는 쓰기 검증용이며 협업 모드와 무관하게 본인 자격이다 — `as` 를 넘기지 말 것."
- 관리자 매뉴얼·사용자 매뉴얼: 1차 구현 후 별도(범위 밖, 후속 작업 목록에 기록).

---

## 9. 테스트 계획

### 9-1. 백엔드 (jest, 루트 `npm test`)

| ID | 대상 | 케이스 |
|---|---|---|
| B1 | `CollabAccess` | 켜짐+참여 → app / 꺼짐 → user·`COLLAB_MODE_OFF` / 비참여 ALL 관리자 → user·`COLLAB_NOT_PARTICIPANT` / TEAM_ONLY 팀원(본인 미등록) → 거부 / 스코프 밖 → `PERMISSION_PROJECT_SCOPE_DENIED` / principal 없음 → user·`PERMISSION_PRINCIPAL_UNRESOLVED` / `DELETING` → OFF / SQL 오류(`Unknown column`) → OFF / 잘못된 UUID → 거부 |
| B2 | `CollabJqlBuilder` | 모든 출력이 `moves_RMS_projectId = "<uuid>"` 로 시작 / 필터 절 괄호 / 주입 문자열 `a" OR moves_RMS_projectId = "b` → 이스케이프되어 단일 리터럴 / 백슬래시 / 제어문자 거부 / 알 수 없는 키 거부 / `jql` 키 거부 / assignee 토큰(EMPTY·membersOf·accountId) 조합이 `generateJQL` 과 같은 연산자 / keys 모드에도 프로젝트 술어 |
| B3 | `CollabDto` | 원문에 `description`, `comment`(이슈), `attachment`, `reporter`, `customfield_99999`, `properties.movesRms.assignedById` 를 넣어도 출력 키가 allowlist 와 **정확히 일치**(키 목록 스냅샷) |
| B4 | 전용 resolver 6종 | 꺼진 프로젝트 거부 / payload 에 `collabMode:true` 넣어도 거부 / 비참여자 거부 / 페처가 `as:'app'` 으로만 호출되고 JQL 이 builder 결과인지(mock) / 상한·`truncated` / detail 501키 거부 / 캘린더 101일 거부 / 이슈 워크로그: 다른 프로젝트 이슈 키 → `COLLAB_ISSUE_NOT_IN_PROJECT` |
| B5 | 서버 판정 경로 | `getProjectGanttData`: 켜짐+참여 → `getProjectGanttIssues(pid, null, 'app')`, 그 외 → `'user'` / 대시보드 issue·assignee·worklog 동일 / level·role·team·salary 는 판정 SQL 미호출 / insight·topology·participant 캐시 키가 app·user 분리(같은 인스턴스에서 app 후 user 호출 시 app 결과 재사용 안 함) / worklog app 경로가 `Collab:` KVS 키만 사용 |
| W1 | 쓰기 불변 | `setGanttParent`·`updateGanttSchedule`·`setGanttLink`·`setGanttIssueFolder`·`moveGanttIssueToFolder`·`setGanttFolderLink` 가 협업 켜짐·참여자여도 `getProjectGanttIssues`/`isIssueInProjects` 를 `'app'` 없이 호출 / `assertIssueIdsInProject`·`updateProjectIdFieldService` 의 `'user'` 고정 |
| B6 | `setProjectCollabMode` | off→on 감사 컬럼 갱신 / on→on `changed:false` / `enabled:'true'`(문자열) 거부 / context·principal 불일치 거부 / 삭제 중 → `PROJECT_DELETING` |
| B7 | 계약 | `test/permission/permissionMap.contract.test.js` 가 새 8키를 자동 대조(등록집합↔맵키) — 통과 확인. `projectScopeGuard` 계열: 8키 모두 `detail` 이라 스코프 사용자에게 `projectId` 필수 |

### 9-2. 프론트 (jest, `cd static/ui && npm test`)

| ID | 대상 | 케이스 |
|---|---|---|
| F1 | `toCollabFilter` | 5종 필터 번역, `membersOf("a\"b")`·`"Sub-task"` 역변환, 알 수 없는 키 throw, 빈 필터 → `{}` |
| F2 | `fromCollabSummary` | 같은 입력을 원문 shape 로 `fetchWorkListSummary` 경로에 넣은 결과와 `groups`·`issueTypeOptions` 동일 |
| F3 | 쿼리 키 | `workListKeys.*(…, 'user'|undefined)` 가 기존 키와 동일(회귀), `'app'` 은 끝 세그먼트만 추가, `summaryAll`/`groupAll` prefix 가 app 키도 포괄, `calendarKeys` 부분 매칭, `queryKeyContract.test.js` 통과 |
| F4 | 분기 훅 | `useWorkListSummary`/`GroupPage`/`Skeleton`/`Detail`·`useProjectCalender`·`useIssueWorklogs`: readAuthority 별로 올바른 invoke 호출, `isReady` 전 미호출, `COLLAB_MODE_OFF` 응답 시 access 쿼리 invalidate |
| F5 | `useProjectReadAuthority` | 실패·`success:false` → `'user'`, 값 변경 시 `invalidateCollabScopedViews` 1회 |
| F6 | `CollabModeNotice` | app 일 때만 렌더 |
| F7 | `ProjectModal` | 수정 모드에서만 섹션, 켜기 확인 모달, `canWrite` false 면 비활성, 실패 시 원복(기존 `ProjectModal.test.jsx` 확장) |
| F8 | `collabWriteMessage` | app+`GANTT_ISSUE_NOT_FOUND` → 협업 문구, user → null |

### 9-3. 실측(E2E, 배포 후) — §11 미확정 항목과 연결
E1 권한 없는 스페이스 이슈가 켜진 프로젝트의 목록·트리·간트·맵·캘린더·대시보드에 보임 / E2 같은 사용자가 그 이슈 편집 시 실패 문구 / E3 끄면 즉시(토글한 브라우저) 사라짐, 다른 브라우저는 ≤30초+포커스 시 / E4 비참여 관리자에게는 안 보임 / E5 `atlassian-addons-project-access` 역할을 뺀 권한 스킴·이슈 보안 수준이 걸린 이슈의 가시성 / E6 2000건 프로젝트 목록 요약·간트 응답 시간.

---

## 10. 구현 작업 분해 (Backend → Frontend, 모듈 단위 증분 검증)

### M0 — 기반 (백엔드) · 검증: B1·B2·B3·B6·B7
- [ ] DDL `ALTER_PROJECT_ADD_COLLAB_MODE` + `ddl/index.js` export + `migrate.js` v025
- [ ] `ProjectQuery.FIND_COLLAB_ACCESS`/`UPDATE_COLLAB_MODE`, `CollabRepository`
- [ ] `ErrorCodes` 4개
- [ ] `src/permission/CollabAccess.js`
- [ ] `CollabJqlBuilder.js`, `CollabDto.js`
- [ ] `ProjectCollabService`(access/set), `ProjectCollabController`(8개 중 2개 먼저 + 나머지는 해당 모듈에서), `PermissionMap` 2키(access·set), `CONTROLLER_REGISTRARS`
  - ⚠ Controller 에 미구현 서비스를 등록하지 않도록 PermissionMap·Controller 키는 모듈별로 함께 추가(계약 테스트가 등록집합↔맵키를 대조)

### M1 — 설정 토글·표시 (프론트) · 검증: F5·F6·F7, 수동: 토글 on/off 후 DB 값
- [ ] `projectKeys.collabAccess`, `dashboardItemsOf`, `invalidateCollabScopedViews`
- [ ] `useProjectReadAuthority`, `ProjectDetailPage` 선조회
- [ ] `CollabModeNotice` + 배지 3곳
- [ ] `ProjectModal` 토글 섹션
- [ ] `locales/kr|en/collab.json` + `npm run merge`

### M2 — 트리·간트·맵·캘린더 이슈 모드 (백엔드만) · 검증: B5(간트)·W1
- [ ] `GanttController` principal 전달, `GanttService.getProjectGanttData` 판정·`as` 전달(`fetchGanttGraph` 불변)
- [ ] 프론트: `collabWriteMessage` + `useGanttMutations`/`useGanttFolderMutations` onError 연결 (F8)

### M3 — 작업관리 목록 (백엔드 → 프론트) · 검증: B4(목록)·F1·F2·F3·F4
- [ ] `CollabIssueFetcher`(summary/page/skeleton/byKeys), `CollabWorkListService`, resolver 4개 + PermissionMap 4키
- [ ] 프론트 `toCollabFilter`·`fromCollabSummary`, `workListKeys` authority 인자, 4훅 분기

### M4 — 워크로그 (백엔드 → 프론트) · 검증: B4(캘린더·이슈 워크로그)·F4
- [ ] `CollabWorklogFetcher`(단건·범위), `ProjectCalendarService.buildTeamAxis` export
- [ ] `CollabCalendarService`, `CollabIssueWorklogService`, resolver 2개 + PermissionMap 2키
- [ ] 프론트 `useProjectCalender` 분기 + `calendarKeys` / `useIssueWorklogs(issueKey, projectId)` + 호출 3곳 + `projectKeys.issueWorklogs` / 트리 연관관계 안내 1줄

### M5 — 대시보드 (백엔드만) · 검증: B5(대시보드)
- [ ] `ProjectParticipantFetcher`·`IssueApi.getAssigneeStats/getIssueParticipantStats`·`ProjectUsersService.get*StatsService` 에 기본값 `'user'` `as` 관통 + 캐시 키 분리
- [ ] `DashboardIssueFetcher`·`TopologyIssueFetcher` 캐시 키 분리, `DashboardInsightService`·`RelationGraphService` 판정·전달
- [ ] `ProjectDashboardService` 판정(`COLLAB_DATA_TYPES` 한정) + worklog 위젯 app 경로(`CollabWorklogFetcher.getProjectWorklogsAsApp` + `Collab:` KVS 캐시), `WorklogService` 의 `aggregateByUserDate` export

### M6 — 문서·마무리
- [ ] 아키텍처 §4.4 ⑥, `CLAUDE.md`, `WORK_VIEWS.md`, `GANTT.md`, `데이터모델_ERD.md`
- [ ] `CI=true npm run build`(프론트), 루트·프론트 jest 전체, `codex exec --sandbox read-only` 검토

각 모듈은 앞 모듈만 있으면 독립 검증된다(M2·M5 는 프론트 무변경이라 백엔드 테스트만으로 닫힌다).

---

## 11. 미확정 사항·위험

1. **앱 계정이 실제로 볼 수 있는 범위(실측 필요, E5)** — asApp 도 Jira 권한 모델 안에 있다. 권한 스킴에서 `atlassian-addons-project-access` 역할의 Browse 를 뺀 스페이스, 앱이 포함되지 않은 이슈 보안 수준(issue security level), 제한 공개 워크로그(visibility group/role)는 **앱에게도 안 보일 수 있다**. 이 경우 협업 모드여도 해당 이슈는 빠진다 — 오류가 아니라 제품 한계로 안내문에 넣을지 결정 필요.
2. **요청량·rate limit** — 앱 자격 호출은 사용자별이 아니라 **앱(설치) 단위 한도**를 공유한다. 목록 요약 ≤20회, 간트·인사이트·토폴로지·참여자 집계 각 프로젝트 전량 1패스(100건/페이지), 캘린더 ≤10회 + 워크로그 초과분(p-limit 5). 참여자 여러 명이 동시에 대시보드를 열면 app 캐시(`app::projectId`, 인스턴스 60초 / KVS 10분)가 흡수하지만 다중 인스턴스에서는 분산된다. 대규모 설치에서 429 발생 여부 실측(E6). 필요 시 간트 app 경로에도 단일 엔트리 캐시를 붙이는 것이 1순위 완화책.
3. **마켓 심사** — 사용자 권한을 넘는 열람이라 "Runs on Atlassian" 데이터 처리 설명과 개인정보 문서(워크로그 작성자·시간이 권한 없는 사용자에게 노출)에 반영 필요. 기본 꺼짐·쓰기 권한자만 켬·대상 한정·감사 컬럼이 심사 답변 근거. scope 추가는 없음(`read:jira-work` 기존).
4. **성능 수치 불일치 가능성** — 기존 대시보드 워크로그 경로 `getBulkIssuesByProject` 는 `maxResults=5000` 단일 호출(페이지 루프 없음)이라 `search/jql` 이 필드 요청 시 100건까지만 돌려주면 **이미 잘리고 있을 수 있다**. 협업 경로는 페이지 루프를 돌므로 같은 데이터에서도 숫자가 더 클 수 있다. 기존 경로 수정은 범위 밖 — 실측 후 별건.
5. **`getDashboardAggregate` 는 이미 asApp** 인데 §4.4 목록에 없다(count·metric 전용, 스코프 재검증). 협업 모드와 무관하게 현재도 비참여 DASHBOARD 열람자에게 앱 자격 집계가 나간다 — 의도된 결정인지 확인하고 §4.4 에 별도 항목으로 기록 권장(이번 변경에 포함하지 않음).
6. **기존 `WorklogService` KVS 캐시의 사용자 무구분** — 본인 자격 집계가 사용자 간에 공유되는 기존 문제(사용자 A 의 가시 범위 결과를 B 가 10분간 봄). 이번 설계는 app 결과를 별도 키로 격리할 뿐 기존 문제는 고치지 않는다. 별건 권장.
7. **토글 반영 지연** — 토글한 브라우저는 즉시, 다른 사용자는 access 쿼리 staleTime(30초)·창 포커스·서버 판정형 화면의 기존 staleTime(간트 5분) 중 늦은 쪽까지 옛 경로 데이터를 볼 수 있다. 서버는 항상 현재 값으로 판정하므로 **끈 뒤 새 요청이 앱 자격으로 나가는 일은 없다**(캐시에 남은 화면만 지연).
8. **`findProjectById` 캐시 shape 불일치(현 코드)** — `ProjectDetailPage` 는 `{success, rows}` 원형, `ProjectModal` 은 같은 키에 `rows[0]` 을 저장한다(지시문은 원형 고정이라 했으나 `develop` 50bc649 기준 모달은 아직 `rows[0]`). 이 설계는 협업 상태를 별도 resolver 로 읽어 이 키에 의존하지 않지만, 모달 수정 시 이 불일치를 건드리지 않도록 주의(또는 별건으로 정리).
9. **캘린더 이슈 필터·목록 스페이스 필터 옵션** — 두 셀렉트는 본인 자격 검색이라 못 보는 이슈·스페이스는 **옵션에 안 나온다**(목록 카드·캘린더 이벤트에는 나옴). 1차 한계로 둔다. 목록 스페이스 필터는 `pinnedOptions` 에 요약 그룹을 넣는 것으로 싸게 보완 가능(후속 후보).
10. **워크로그 패널 100건 상한** — 기존 브라우저 경로와 같은 첫 페이지 100건 상한을 유지한다(총합 표시가 100건 기준). 기존 동작과 같으므로 1차 수용.
11. **감사 이력** — 최종 변경 1건만 남는다. 켜고 끈 전체 이력이 필요하면 별도 테이블(후속).

---

## 12. 추가 요구(2026-09-30, 제품 소유자): 앱 자격으로도 제한되는 이슈를 **알려 준다**

> "그건 이제 제한된다는 건 알려줄 수 있어야 해." — 앱 자격이라도 못 보는 이슈(권한 스킴에서 앱 역할이 빠진 스페이스, 이슈 보안 수준, 공개 범위가 제한된 워크로그)가 조용히 빠지면 안 된다.

### 12-1. 확인할 수 있는 것과 없는 것
- 앱이 못 보는 이슈는 앱도 **셀 수 없다.** 대신 두 신호는 확인할 수 있다.
  - **스페이스 단위**: 이 프로젝트와 관련된 Jira 프로젝트마다 앱의 `BROWSE_PROJECTS` 권한 유무 — `GET /rest/api/3/mypermissions?projectKey=<KEY>&permissions=BROWSE_PROJECTS` **asApp**.
  - **이슈 단위**: 본인 자격 검색 결과 키 집합 − 앱 자격 검색 결과 키 집합 = "본인에게만 보이는 이슈"(다른 참여자에게는 안 보인다는 뜻).
- 관련 Jira 프로젝트 집합 = 구독 스페이스(`project_subscription`) ∪ 본인 자격 검색 결과의 `project.key` ∪ 앱 자격 검색 결과의 `project.key`. 상한 50개.

### 12-2. resolver `getProjectCollabCoverage` (M7, 백엔드)
| 항목 | 내용 |
|---|---|
| PermissionMap | `R('PROJECT')`, `project: 'detail'`. **협업 모드가 꺼져 있어도 허용**(켜기 전 확인 창에서 쓴다). 참여자 조건 없음(스페이스 권한 유무는 민감 정보가 아니다) |
| 입력 | `{ project_id }` (UUID 검증) |
| 처리 | ① 관련 Jira 프로젝트 키 수집(위 합집합, 검색은 `CollabJqlBuilder`의 프로젝트 술어만, `fields: ['project']`, 2,000건 상한, 본인·앱 각 1회) ② 키마다 asApp `mypermissions` (p-limit 4) ③ 본인 키 집합 − 앱 키 집합 |
| 응답 | `{ success: true, spaces: [{ key, name, appCanBrowse: boolean }], userOnlyIssueCount: number, truncated: boolean }` — `name`은 검색 결과의 `project.name`(구독 스페이스만 있고 이슈가 없으면 키로 대체) |
| 실패 | 가드 직렬화 그대로. asApp 호출 실패는 해당 스페이스 `appCanBrowse: null`(확인 불가)로 표시하고 전체를 실패시키지 않는다 |
| 캐시 | 서버 캐시 없음. 프론트 react-query `staleTime` 5분, 키 `collabKeys.coverage(projectId)` |

### 12-3. 프론트 (M1·M6에 추가)
- **켤 때**: `ProjectModal`의 켜기 확인 창이 `getProjectCollabCoverage`를 먼저 부르고 결과를 보여 준다 — 제한 스페이스 목록("앱 접근 권한 없음 · Jira 관리자가 프로젝트 권한 스킴에 앱 역할(`atlassian-addons-project-access`)을 추가해야 합니다"), 본인에게만 보이는 이슈 N건. 확인 불가(`null`)는 "확인 못 함"으로. 결과와 무관하게 켤 수는 있다.
- **켜진 뒤**: `CollabModeNotice`가 같은 조회를 해서 `appCanBrowse === false`인 스페이스가 있거나 `userOnlyIssueCount > 0`이면 배지를 **경고 모양**으로 바꾸고 툴팁·펼침에 상세를 보여 준다. 조회 실패 시 배지는 기본 모양(확인 못 함 문구).
- i18n `collab.coverage.*` 키 추가(제한 스페이스·본인에게만 보이는 이슈·확인 못 함·관리자 안내).

### 12-4. 테스트
- 서비스: 합집합 계산, 상한 50, asApp 실패 → `null`, 본인−앱 차집합, 꺼진 프로젝트에서도 응답.
- 프론트: 확인 창이 제한 목록을 보여 주는지, 배지가 경고로 바뀌는지, 조회 실패 시 기본 배지.
