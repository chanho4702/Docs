# 협업 모드 — 통합 검증 보고서

> 작성 2026-09-30 · 기준 `develop` `50bc649` + 미커밋 작업 트리(45파일 수정 + 신규. `custom-scopes.yaml`·`LeaderTeamBackfill.test.js`·`.pptx` 제외)
> 기준 문서: `01_architect_design.md` §2(경계 강제 표)·§3(계약)·§12(제한 알림), `02_backend_report.md`, `02_frontend_report.md`
> 방법: 생산자(서비스·Controller·DTO)와 소비자(훅·컴포넌트)를 같이 읽고 비교, jest·빌드 실행. **코드 수정 없음.**

## 요약

| 분류 | 건수 |
|---|---|
| 통과 | 46 (세부 항목 기준: 실행 5 · 경계 표 12 · 계약 11 · 다중 shape 3 · 서버 판정 3 · 프론트 분기 4 · 제한 알림 1 · DB 2 · i18n 2 · 성능 3) |
| 실패 | 6 (높음 1 · 중간 2 · 낮음 3) |
| 미검증 | 7 |

**실패 목록**
1. [높음] `setProjectCollabMode` 스코프 우회 — 가드는 `projectId`, 서비스는 `project_id` 를 읽는다
2. [중간] `getProjectCollabCoverage` — 본인이 못 보는 Jira 스페이스의 **키·이름**이 비참여자·꺼진 프로젝트에서도 응답에 나온다 (+ 1과 같은 키 불일치)
3. [중간] 칸반 카드 모달의 목록(`ProjectIssuePanel context="kanban"`)이 협업 경로를 타는데 배지가 없다(경계 5 누락·적용 화면 확대)
4. [낮음] 캘린더 칩 툴팁 `author.emailAddress` — 브라우저 경로 응답에만 있는 필드(협업 경로에서는 빈칸)
5. [낮음] `GANTT.md` 1줄 누락(설계 §8-3)
6. [낮음] `Moves_Workforce_데이터모델_ERD.md` 에 project 3컬럼 누락(설계 §6·M6)

---

## 1. 실행 결과 (그대로 기록)

| 명령 | 결과 |
|---|---|
| 루트 `npm test` | **141 스위트 / 1896 테스트 전부 통과**, 17.4s |
| `cd static/ui && npm run merge` (1차, 백엔드 jest와 동시 실행) | **실패** — `Error: UNKNOWN: unknown error, open 'locales\ko-KR.json'`(Windows 파일 잠금 추정). 병합 결과를 메모리에서 재계산해 현재 `ko-KR.json`·`en-US.json` 과 비교 → **바이트 동일**. 2차(빌드 prebuild)에서 merge 정상 실행 |
| `cd static/ui && npx jest` | **129 스위트 / 2065 테스트 전부 통과**, 스냅샷 1 통과 |
| `cd static/ui && CI=true npm run build` | **성공**(exit 0). prebuild merge 성공, `bundle:check` main gzip 481,652B / 950,000B, panel 329,314B / 350,000B |
| 기존 테스트 4건 수정 diff | `DashboardInsight.test.js`·`RelationGraph.test.js` 각 2건 — **`toHaveBeenCalledWith` 기대값에 `as: 'user'` 추가뿐**(다른 변경 없음) → 통과 |

---

## 2. 실패 (파일:라인 · 불일치 · 수정 방법)

### F-1 [높음] `setProjectCollabMode` — 가드와 서비스가 서로 다른 프로젝트 키를 본다 (스코프 우회)
- 생산자(가드): `src/permission/permissionGuard.js:45` `const pid = payload?.projectId ?? payload?.project_id;` — **`projectId` 가 있으면 그것만** 스코프 검증.
- 소비자(서비스): `src/resolver/projectCollab/ProjectCollabService.js:34` `setProjectCollabModeService({ project_id, enabled })` → `:46` `updateCollabModeRepository({ projectId: project_id, ... })`. 서비스는 스코프를 다시 보지 않는다.
- 재현: MEMBER_ONLY/TEAM_ONLY + `PROJECT write` 사용자가 `invoke('setProjectCollabMode', { projectId: <내 프로젝트>, project_id: <남의 프로젝트>, enabled: true })` → 가드 통과, **스코프 밖 프로젝트의 협업 모드가 켜진다** → 그 프로젝트 참여자 전원이 앱 자격으로 조회. 이 기능에서 가장 민감한 스위치다.
- 읽기↔쓰기 비대칭: 조회 resolver 6종은 `CollabAccess.describeCollabAccess`(`src/permission/CollabAccess.js:74-75`)가 `scopedProjectIds` 를 **다시** 보지만, 쓰기(`set`)에는 그 재검증이 없다.
- 가드의 `??` 는 기존 `project_id` resolver 전체에 걸린 선행 문제이나, 이번에 새로 여는 권한 경계라 여기서 막아야 한다.
- 수정 방법(백엔드):
  1. `setProjectCollabModeService` 첫머리: `payload.projectId !== undefined && payload.projectId !== project_id` 면 `COLLAB_INVALID_INPUT` 거부.
  2. 이어서 `const scoped = scopedProjectIds(principal); if (scoped !== null && !scoped.includes(project_id)) throw ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)`.
  3. 테스트 추가: 두 키가 다르면 거부, 스코프 밖 `project_id` 거부.
  4. (별건 권장) 가드가 `projectId`·`project_id` 가 둘 다 있고 값이 다르면 거부하게 — 전 resolver 공통 문제.

### F-2 [중간] `getProjectCollabCoverage` — 못 보는 스페이스의 이름 노출 + F-1과 같은 키 불일치
- 생산자: `src/resolver/projectCollab/CollabCoverageService.js:25-28` 본인·앱 두 자격으로 검색 → `:32` `names = new Map([...app.projects, ...mine.projects])` → `:42-46` `spaces[{ key, name, appCanBrowse }]` 응답. 이름 출처는 `src/api/jira/issue/CollabCoverageFetcher.js:43`(앱 자격 검색의 `project.name`).
- 가드: `PermissionMap` `getProjectCollabCoverage: R('PROJECT','detail')` + Controller 가 principal 을 넘기지 않음(`ProjectCollabController.js:40-41`). **협업 모드 꺼짐·비참여자에게도** 응답.
- 결과: 해당 프로젝트를 볼 수 있는 모든 PROJECT 열람자가, **본인이 권한이 없는 Jira 스페이스의 키와 이름**(예: "인사-징계", "M&A-코드명")을 받는다. 앱 자격 검색이 꺼진 프로젝트·비참여자에게도 실행되므로 아키텍처 §4.4 ⑥ 문안("켜진 프로젝트에서 그 프로젝트 참여 인원에게만")과도 어긋난다. 반면 협업 모드 ON + 참여자에게는 목록 요약이 이미 같은 이름을 내주므로(`CollabDto.toCollabSummary` `projects[key].name`) 추가 노출이 아니다.
- 위험도: **중간**. 이슈 내용은 없고 스페이스 키·이름·"앱이 볼 수 있음" 여부·본인 전용 이슈 수뿐이지만, 스페이스 이름 자체가 기밀인 조직이 있다. 설계 §12-2 는 "스페이스 권한 유무는 민감 정보가 아니다"라고 판단했으나 **이름**은 그 판단 대상이 아니었다.
- 서비스는 `project_id` 만 읽어 F-1과 같은 가드 우회가 성립(`{projectId: 내 것, project_id: 남의 것}` → 스코프 밖 프로젝트의 스페이스 목록).
- 수정 방법(백엔드, 택1 + 키 검사 공통):
  - (권장) `describeCollabAccess` 로 호출자가 'app'(켜짐+참여) 인지 보고, 아니면 **본인 검색·구독에 없는 스페이스(= 앱 검색에서만 나온 것)** 는 이름·키를 싣지 않고 `hiddenSpaceCount` 로 개수만 준다. 켜기 확인 창에는 개수만으로도 "앱이 못 보는 곳이 있다"는 목적이 충족된다.
  - 또는 호출 조건을 "PROJECT write(켜기 확인 창) 또는 협업 'app'(배지)" 로 좁힌다.
  - F-1과 같은 `projectId`≠`project_id` 거부 + `scopedProjectIds` 재검증.
  - 프론트는 `CollabCoverageDetails.jsx:17` 이 `s.name && s.name !== s.key ? ... : s.key` 로 이미 이름 없음을 처리하므로 `hiddenSpaceCount` 표시 1줄만 추가.

### F-3 [중간] 칸반 카드 모달 목록이 협업 경로를 타는데 표시(배지)가 없다
- 소비자: `static/ui/src/pages/projectKanban/modal/Issue/ProjectIssuePanelModal.jsx:22` `<ProjectIssuePanel context="kanban" .../>` → `pages/projectDetail/issue/ProjectIssuePanel.jsx:80` `useWorkListSummary` → `useProjectReadAuthority` 가 'app' 이면 협업 resolver 4종 사용.
- 배지는 `ProjectWorkPanel.jsx`(작업관리 셸)·`ProjectCalender.jsx`·`DashboardPage.jsx` 에만 있어 칸반 모달은 **앱 자격 조회인데 안내가 없다** → 요구 경계 5("협업 모드로 조회된 화면임을 알 수 있게") 위반. 또한 요구사항 적용 화면(작업관리·캘린더·대시보드)에 없는 `/project` 화면이 조용히 적용 범위에 들어갔다. (프론트 보고서 §6-2 가 "의도 여부 확인 필요"로 남긴 항목)
- 부가: 칸반 모달은 `ProjectDetailPage` 선조회가 없어 access 조회 1왕복을 기다린 뒤에야 목록 조회가 시작된다(직렬 지연).
- 수정 방법(프론트, 택1):
  - (권장) 배지를 `ProjectIssuePanel.jsx` 필터 줄(`:155` `Inline`)에 `context==='kanban'` 일 때 `<CollabModeNotice projectId={project_id}/>` 로 추가 — 적용 범위 확대를 수용하고 표시만 맞춘다. 설계서 §1-2 적용 화면에 "칸반 카드 모달 목록" 추가.
  - 또는 적용 범위를 지키려면 `useWorkListSummary`·`useWorkListGroupPage`·`useWorkListSkeleton`·`useWorkListDetail` 에 `forceUser` 인자를 두고 kanban 컨텍스트에서 'user' 고정(패치 키 `useWorkListFlatPage.js:32`·`useWorkListHierarchy.js:63` 도 같은 값).

### F-4 [낮음] 다중 shape 재사용 — 캘린더 칩 툴팁 `emailAddress`
- 소비 컴포넌트: `static/ui/src/components/avatar/AvatarStack.jsx:27` `getEmail = (user) => user?.emailAddress ?? ''` (캘린더 칩 `FullCalendar.jsx:267,287` 에서 `worklog.author` 로 사용).
- shape A(브라우저 경로 `getProjectCalendarWorklog` 원문): `author.emailAddress` 있음(사용자 공개 설정에 따라).
- shape B(`getCollabCalendarWorklog`, `CollabDto.js:25-30` `userOf`): **없음** → 툴팁 이메일 줄이 빈칸. 에러 없이 `?? ''` 가 삼킨다.
- 수정 방법: 기능 결함이 아니라 개인정보 판단 문제다. **DTO 에 추가하지 않는 것을 권장**(앱 자격은 사용자 프로필 이메일 공개 범위를 넘을 수 있다). 대신 설계서 §3 `CollabWorklog` 주석에 "emailAddress 의도적 제외, 툴팁은 이름만" 을 명시해 계약으로 닫는다. (아바타 크기 16x16 은 `useProjectCalender.js:13-17` `withSmallAvatar` 로 보정됨 — 통과)

### F-5 [낮음] `src/resolver/gantt/GANTT.md` — 설계 §8-3 의 1줄 누락
- 요구 문안: "`fetchGanttGraph` 는 쓰기 검증용이며 협업 모드와 무관하게 본인 자격이다 — `as` 를 넘기지 말 것." `grep 협업 모드` 결과 없음. 프론트 보고서는 "백엔드 범위라 제외", 백엔드 보고서는 "문서는 M6" 로 서로 미뤘다.
- 수정: GANTT.md 데이터/권한 절에 위 1줄 추가.

### F-6 [낮음] `Moves_Workforce_데이터모델_ERD.md` — project 테이블 3컬럼 누락
- 설계 §6 끝·M6 체크리스트: "`데이터모델_ERD.md` project 테이블에 3컬럼 추가". `grep collab_mode` 결과 없음(git 미추적 문서).
- 수정: `collab_mode TINYINT(1) NOT NULL DEFAULT 0`, `collab_mode_changed_by VARCHAR(100) NULL`, `collab_mode_changed_at TIMESTAMP NULL` + v025 주석.

---

## 3. 통과

### 3-1. 경계 강제 표(설계 §2) 행별 대조

| # | 경계 | 실제 위치 | 테스트 | 판정 |
|---|---|---|---|---|
| 1 | 대상 이슈 = 프로젝트 술어, 서버 조립 | `CollabJqlBuilder.js:155-193` `buildCollabJql` — 항상 `moves_RMS_projectId = "<uuid>"` 로 시작, 필터는 `AND (…)`, 모든 값 `quoteJql`. 협업 경로의 JQL은 **전부 이 함수 결과**(grep: `CollabIssueFetcher.js:51,80,94,134,164,194`, `CollabCoverageFetcher.js:220`, `CollabWorklogFetcher.js:70`). 페처 중 JQL 문자열 인자를 받는 export 없음 | `CollabJqlBuilder.test.js` 11건(술어 시작·괄호·주입 `a" OR moves_RMS_projectId = "b` → 술어 1회만·백슬래시·제어문자·keys 모드) | 통과 |
| 1 | payload `jql`·모르는 필터 키 거부 | `CollabWorkListService.js:24-27` `rejectJqlPayload`(키 이름에 jql 포함 시 거부) — 조회 6종 전부 호출, `CollabJqlBuilder.js:65` 알 수 없는 필터 키 거부(하위 객체 키도) | `CollabWorkListService.test.js` "문자열 JQL 은 무시가 아니라 거부", Builder "알 수 없는 필터 키·jql 키는 무시가 아니라 거부" | 통과 |
| 1 | detail `key IN` 에도 술어, 이슈 워크로그 소속 확인 | `CollabIssueFetcher.js:134`(청크마다 builder), `CollabIssueWorklogService.js:77-79` → `isIssueInCollabProject` | "detail: keys 에도 프로젝트 술어…", "다른 프로젝트 이슈 키 → COLLAB_ISSUE_NOT_IN_PROJECT, 워크로그 미조회" | 통과 |
| 2 | 참여 인원 + ProjectScope | `CollabAccess.js:67-101` 단일 SQL `FIND_COLLAB_ACCESS`(EXISTS projectusers) + `scopedProjectIds` | `CollabAccess.test.js` 비참여 ALL 관리자·TEAM_ONLY 미등록·스코프 밖·principal 없음 | 통과 |
| 2 | 조회 resolver 가 가드 뒤에 **다시** 판정 | 6종 모두 첫 줄 `assertCollabReadAccess`: `CollabWorkListService.js:124,134,147,163`, `CollabCalendarService.js:36`, `CollabIssueWorklogService.js:71`. `getProjectCollabAccess` 는 설계대로 던지지 않고 reason 응답. 7번째 조회인 `getProjectCollabCoverage` 는 설계상 판정 없음 → F-2 참조 | `test.each` 4종 "꺼진 프로젝트 거부/비참여자 거부, Jira 호출 없음", 캘린더·워크로그 "꺼짐·비참여 거부" | 통과(coverage 제외) |
| 2 | 협업 resolver 9개 = `guardedDefine` + `PermissionMap(PROJECT, detail)` | `ProjectCollabController.js:18-41` 9개 전부 guardedDefine, `PermissionMap.js:398-411` 조회 8 = `R('PROJECT','detail')`, set = `W('PROJECT','detail')`, `src/index.js` `CONTROLLER_REGISTRARS` 1줄 | `permissionMap.contract.test.js` 통과, `ProjectCollabService.test.js` "조회는 PROJECT read·detail…" | 통과 |
| 3 | fail-close·설정은 서버가 읽음 | `CollabAccess.js:78-85` SQL 오류·행 없음 → OFF, `:94` DELETING → OFF. `describeCollabAccess` 는 인자 `{projectId, principal}` 만 읽고, 호출자 전부 payload 에서 `projectId` 하나만 꺼내 넘긴다(`ProjectCollabService.js:13`, 목록·캘린더·워크로그 서비스 구조분해). 서버 판정 경로도 `readAuthority` 를 payload 에서 받지 않음(`ProjectDashboardService.js:118` 구조분해 목록에 없음) | "Unknown column → OFF", "payload 에 collabMode:true 를 넣어도 거부", 간트 "payload 에 collabMode/readAuthority 를 넣어도 판정은 DB 만 본다" | 통과 |
| 4 | 응답 최소화 | `CollabDto.js` 리터럴 allowlist(스프레드 0건), 페처 `fields` 상수(`CollabIssueFetcher.js:17-23`). 서버 판정 경로: 간트 `GanttMapper` 는 프로젝트 밖 링크·부모를 `keySet` 으로 버림(`GanttMapper.js:170-202`), 토폴로지는 범위 밖 엣지를 개수만(`RelationGraphService.js:214-229`) | `CollabDto.test.js` description·comment·attachment·reporter·customfield_99999·assignedById·emailAddress 넣어도 키 목록 정확 일치 | 통과 |
| 5 | 표시 | `CollabModeNotice.jsx` 'app' 일 때만, 3곳 배치 + 트리 상세 연관관계 안내(`TreeDetailPanel.jsx:262`) | `collabUi.test.jsx` F6 4건 | 통과(칸반 모달은 F-3) |
| 6 | 감사 | `ProjectQuery.js` `UPDATE_COLLAB_MODE` `AND deletion_state='ACTIVE' AND collab_mode <> ?` — 값이 바뀔 때만 by/at 갱신, 0행이면 재조회로 `changed:false`/`PROJECT_DELETING` 구분(`ProjectCollabService.js:46-60`) | "off→on", "on→on: changed:false", "삭제 중 → PROJECT_DELETING", "UPDATE 쿼리는 값이 바뀔 때만…" | 통과 |
| 7 | §4.4 ⑥ | `Moves_Workforce_아키텍처_설계서.md:101-102` ⑥ + 마켓 심사 사유(설계 §8-1 문안 + coverage 1문장 추가) | 문서 확인 | 통과 |
| W1 | 쓰기 불변 | 수정 금지 목록 diff 0 — `GanttService.js` diff 는 `getProjectGanttData` 3곳뿐(`fetchGanttGraph`·`assertGanttIssueInProject` 무변경), `ProjectChildScope.js` 무변경, `ProjectUsersService.js` diff 는 stats 2함수뿐, `IssueApi.js` diff 는 stats 2함수뿐(`isIssueInProjects/areIssuesInProject/areIssuesAccessible` 기본값 무변경). `GanttController` 쓰기 resolver 는 principal 미전달 | `GanttCollabAuthority.test.js` W1 6종 + 소스 고정 테스트 | 통과 |

### 3-2. 경계면 계약 (resolver 9개 응답 shape ↔ 프론트 접근 경로)

| resolver | 생산자 반환 | 소비자 접근 | 판정 |
|---|---|---|---|
| `getProjectCollabAccess` | `ProjectCollabService.js:15-24` `{content:{projectId,collabMode,readAuthority,reason,changedBy,changedAt}}` | `useProjectReadAuthority.js:18-31` `result.content.*`, success≠true → throw → 'user' | 통과 |
| `setProjectCollabMode` | `:53-61` `{content:{projectId,collabMode,changed,changedBy,changedAt}}` | `CollabModeSetting.jsx:37-52` `result.content.{collabMode,changedBy,changedAt}` | 통과 |
| `getCollabWorkListSummary` | `CollabWorkListService.js:129` `{content:{rows,projects,issueTypeIcons,truncated}}` | `useWorkListQueries.js` `fromCollabSummary(result.content)` | 통과 |
| `getCollabWorkListPage` | `:142` `{content:{issues,nextPageToken}}` | `result.content.issues/nextPageToken` + 클라 userMap | 통과 |
| `getCollabWorkListSkeleton` | `:153` `{content:{rows,truncated}}` | `result.content.rows/truncated` | 통과 |
| `getCollabWorkListDetail` | `:171` `{content:{issues}}` | `orderIssuesByKeys(result.content.issues)` | 통과 |
| `getCollabCalendarWorklog` | `CollabCalendarService.js:47-52` **루트** `{data,memberTeamMap,teamMeta,truncated}` | `useProjectCalender.js` `result.data` 매핑 후 `...result` 그대로 → `ProjectCalender.jsx` `myWorklogs.data`·`.truncated` (기존 경로와 같은 루트) | 통과 |
| `getCollabIssueWorklogs` | `CollabIssueWorklogService.js:83` `{content:{worklogs,total}}` | `useIssueWorklogs.js` `result.content.worklogs` | 통과 |
| `getProjectCollabCoverage` | `CollabCoverageService.js:48-52` **루트** `{spaces,userOnlyIssueCount,truncated}` | `useProjectCollabCoverage.js:13-21` `result.spaces/userOnlyIssueCount/truncated` | 통과 |

- 실패 분기: 협업 resolver 는 `invokeCollab`(`collabErrors.js:20-29`)이 `success:false` 를 throw 로 승격하고 `COLLAB_MODE_OFF/NOT_PARTICIPANT` 면 access 무효화 → 통과.
- 서비스 내부 소비자(계약 변경 함수 전역 grep): `getProjectGanttData(payload, principal)` 호출자는 Controller 1곳, `getAssigneeStatsService/getIssueParticipantStatsService/getProjectParticipantIssues/getDashboardIssues/getTopologyIssues` 는 `as='user'` 기본값이라 기존 호출자 무영향, `buildTeamAxis`·`aggregateByUserDate` 는 export 만 추가 → 통과.

### 3-3. 다중 shape 재사용 (같은 컴포넌트에 원문·협업 DTO)

| 컴포넌트 | 공통 필드 | 원문 전용 | 협업 전용 | 판정 |
|---|---|---|---|---|
| 목록 행(`useIssueRowFactory`·`ProjectIssueTable`·`HierarchyToggleCell`·`useJiraEditGuards.projectKeyOfIssue`) | id, key, summary, statusCategory.key, issuetype.iconUrl, assignee(accountId·displayName·avatarUrls 24), customfield_10015, duedate, timetracking.{original,remaining,timeSpent}EstimateSeconds, aggregateprogress.percent, parent.key, properties.movesRms.coworkers | (화면 미사용 필드만) | 없음 | 통과 |
| 목록 요약 카드(`ProjectGroupCard`) | project.{key,name,avatarUrls 24/16}, status.statusCategory.key, issuetype.{name,iconUrl} | – | – | 통과 |
| 캘린더 칩·`WorklogModal` | issue.{id,key}, fields.{summary,status.statusCategory,issuetype.iconUrl,project.{name,avatarUrls 24},assignee(24x24)}, worklog.{id,started,timeSpent,timeSpentSeconds,comment,author.{accountId,displayName}} | **author.emailAddress**(→F-4), author 16x16(프론트 보정으로 해소) | truncated | F-4 외 통과 |
| 워크로그 패널(`WorklogHistoryList`) | id, author.{displayName,avatarUrls 24}, started, timeSpent(Seconds), comment | – | issueId | 통과 |

### 3-4. 서버 판정 경로
- `GanttController.js:25-27` principal 전달 → `GanttService.js:66` `resolveCollabReadAuthority` → `:74` `getProjectGanttIssues(projectId, null, as)`. 응답 `{content:{tasks,links,meta}}` 무변경. 대시보드: `ProjectDashboardService.js` `COLLAB_DATA_TYPES` 일 때만 판정(level/role/team/salary 는 SQL 미호출), `getChartData` 루프 밖 1회, insight·topology 는 `Promise.all` 안 `.then` 체인 → 통과.
- 캐시 키 분리: `ProjectParticipantFetcher`·`DashboardIssueFetcher`·`TopologyIssueFetcher` 모두 `as==='app' ? app::pid : 기존`(user 키 형식 불변), 워크로그 KVS 는 `Collab:Date:`/`Collab:UserDate:` 만(`CollabWorklogFetcher.js:127,133`). 기존 `Date:`/`UserDate:` 에 app 결과를 쓰는 경로 없음(grep) — `DashboardCollabCacheKeys.test.js` → 통과.
- 쿼리 키: `ganttKeys.data` 무변경 → mutation `setQueryData` 30여 곳 무영향. `useGanttMutations`·`useGanttFolderMutations` diff 는 onError 문구만 → 통과.

### 3-5. 프론트 분기
- 화면당 한 곳: 목록 4훅(`useWorkListQueries.js` `useWorkListAuthority` 공유), 캘린더 `useProjectCalender`, 워크로그 `useIssueWorklogs` → 통과.
- 쿼리 키 경로 구분 + 캐시 패치 키 동일 구분: `workListKeys.*` 끝에 `'app'`(user 는 바이트 동일), `useWorkListFlatPage.js:32`·`useWorkListHierarchy.js:160` 패치 키에 같은 authority, 다른 호출부 없음(grep). `calendarKeys.projectWorklogs` 는 app 일 때만 객체에 `readAuthority` → `worklogDrop.js:49`·`ProjectCalender.jsx:323` 의 invalidate 는 TanStack 부분 매칭으로 app 키도 포함 → 통과(F3 테스트).
- 판정 전 미조회: 목록 `enabled … && ready`, 캘린더 `&& isReady`, 워크로그 `!projectId || isReady` → 통과(테스트 "권한 주체가 정해지기 전에는…").
- 조회 실패 강등: `retry:false`, `isError` 도 `isReady:true` + `readAuthority:'user'` → 통과(F5).

### 3-6. 제한 알림(§12) shape ↔ 소비
- 확인 창(`CollabModeSetting.jsx:103-135`)·배지(`CollabModeNotice.jsx:175-201`) 모두 `summarizeCoverage` 로 `appCanBrowse===false`·`null`·`userOnlyIssueCount` 소비, `{count}` 는 `tFormat` 치환(`CollabCoverageDetails.jsx:58`) → shape 일치 통과. (노출 문제는 F-2)

### 3-7. DB
- `project.sql.js` `ALTER_PROJECT_ADD_COLLAB_MODE`(기본 0), `ddl/index.js` export, `migrate.js` `v025_alter_project_add_collab_mode`(v024 다음) → 통과.
- 기존 SELECT 무변경: 새 컬럼은 `FIND_COLLAB_ACCESS`·`UPDATE_COLLAB_MODE` 에만, project 테이블 `SELECT *`/QueryBuilder 경로 없음(grep) → 시차 보호 통과.

### 3-8. i18n
- 코드가 참조하는 `collab.*` 33키 = `locales/kr/collab.json` 33키 = `locales/en/collab.json` 33키(차집합 0), merge 결과에 `collab` 네임스페이스 존재, `ko-KR/en-US` diff 는 +49줄씩 `collab` 만. `common.toast.title.success/Fail` 존재 → 통과.
- 내부 용어: asApp·asUser·JQL·resolver·principal 없음. 예외 1건 `coverage.adminHint` 의 `atlassian-addons-project-access` — Jira 관리자가 실제로 찾아야 하는 역할명이라 의도된 노출로 판단(프론트 보고서 §3-5). 통과.

### 3-9. 성능 패턴
- 상한: 요약·골격 2,000, 상세 500키/50청크/p-limit 3, 페이지 1..100, 캘린더 1,000이슈·100일·p-limit 5, coverage 스페이스 50·p-limit 4·검색 2,000, 필터 배열 50/20 → 설계 수치와 일치. 공통 `IssueApi`·`WorklogService`·`WorklogApi` 페치 경로 무수정(전용 페처) → 통과.
- 서버 판정 SQL: 간트·인사이트·토폴로지 요청당 1회, `getChartData` 1회, `getChartDataById` 는 Jira 위젯 1개당 1회(설계 §4-2 수용).
- **협업 모드 꺼진 프로젝트의 추가 호출 — 엄밀히 0은 아니다(설계 수용 범위라 통과로 분류):**
  - Jira API 추가 호출: **0**(access 판정은 DB, 배지·coverage 는 'app' 일 때만).
  - 프론트: 프로젝트 상세 진입 시 `getProjectCollabAccess` invoke 1회(+30초 경과 후 창 포커스마다 재조회), 칸반 모달은 이 1왕복이 목록 조회 앞에 직렬로 붙는다(F-3 부가).
  - 백엔드: 간트·인사이트·토폴로지·Jira 위젯마다 경량 SELECT 1회.
- 관찰(비차단): `CollabWorklogFetcher.js:93-95` 대시보드 워크로그 app 경로는 1,000이슈에서 루프를 멈추지만 `truncated` 를 싣지 않는다(주석 "조용히 잘리지 않도록"과 달리 조용히 잘림). 기존 user 경로도 5,000 단일 호출로 조용히 잘리므로 회귀는 아님.

---

## 4. 미검증 (실행·실측 불가)

| # | 항목 | 이유·확인 방법 |
|---|---|---|
| U-1 | Forge SQL 반환 타입(`EXISTS … AS is_member`·`collab_mode` 가 숫자/문자열/BigInt, `collab_mode_changed_at` 형식) | mock 만 있음. `Number(v)===1` 흡수 코드는 확인했으나 실 DB 미실행 |
| U-2 | TiDB 에서 `ADD COLUMN IF NOT EXISTS` 3절 ALTER 실행 | 배포 후 `runMigration` 확인 필요 |
| U-3 | asApp 가시 범위(앱 역할 빠진 스페이스·이슈 보안 수준) | 설계 §9-3 E1·E5 |
| U-4 | **제한 공개 워크로그(visibility group/role)** 를 앱이 볼 수 있는 설치에서, 그 그룹 밖 참여자에게 노출되는지 | `toCollabWorklog`(`CollabDto.js`)는 `visibility` 를 싣지도 거르지도 않는다. 앱이 보면 그대로 내려간다. 작성자가 명시적으로 숨긴 기록이라 **협업 경로에서 `visibility` 가 있는 워크로그를 제외**하는 것을 권장(백엔드 1줄 필터 + 테스트). E2E 로 앱 가시 여부 확인 필요 |
| U-5 | `search/jql` 의 `fields:['statusCategory']` 응답 형태, `mypermissions` asApp 응답 형태 | 실 Jira 응답 필요 |
| U-6 | coverage 1회 호출 최대 ~90 Jira 호출(검색 2×20 + mypermissions 50)이 Forge resolver 시간 한도 안인지, 앱 단위 rate limit | 설계 §9-3 E6 |
| U-7 | 실화면 렌더(Popup·틸 Lozenge·Toggle·다크 모드), `CLAUDE.md` 반영분 공유 | `CLAUDE.md` 는 문안이 반영돼 있으나 `.gitignore:66` 대상이라 커밋에 실리지 않는다 — 로컬 파일만 갱신됨(팀 공유가 필요하면 별도 조치) |

---

## 5. 재작업 지시 요약

- **backend**: F-1(set 스코프·키 일치 검사 + 테스트), F-2(coverage 이름 마스킹 또는 호출 조건 축소 + 키 검사), U-4 권장(visibility 워크로그 제외), F-5 GANTT.md 1줄.
- **frontend**: F-3(칸반 모달 배지 또는 user 고정 — 제품 결정 필요), F-2 후속(`hiddenSpaceCount` 표시 1줄), F-4 는 설계서 계약 주석으로 닫기.
- **architect/문서**: F-4 계약 명시, F-6 ERD 3컬럼, F-3 적용 화면 결정 반영.

---

# 재검증 (2026-09-30, 2차)

> 대상: 1차 실패 6건 + 외부 검수(Codex) 반영분 + 리더의 가드 수정. **바뀐 부분만** 재확인. 코드 수정 없음.

## R-0. 요약

| 분류 | 건수 |
|---|---|
| 통과 | 16 |
| 실패 | 2 (중간 1 · 낮음 1) |
| 미검증 | 2 |

1차 실패 6건(F-1~F-6)은 **전부 해소**. 새로 생긴 실패 2건은 이번 재작업에서 생긴 계약 의미 불일치다.

## R-1. 실행 결과

| 명령 | 결과 |
|---|---|
| 루트 `npm test` | **142 스위트 / 1932 테스트 전부 통과**(1차 141/1896) |
| `cd static/ui && npx jest` | **130 스위트 / 2071 테스트 전부 통과**, 스냅샷 1(1차 129/2065) |
| `cd static/ui && CI=true npm run build` | **성공**(exit 0, prebuild merge 포함). main gzip 481,651B / 950,000B, panel 329,314B / 350,000B. 경고는 node_modules 소스맵 누락뿐 |
| i18n | `collab.*` 34키 = kr 34 = en 34 = ko-KR 34 = en-US 34, 코드 참조 키와 차집합 0(신규 `coverage.hiddenSpaces`) |

## R-2. 실패

### R-F1 [중간] `hiddenSpaceCount` 의 의미가 서버·프론트에서 다르다 — 협업 모드가 **정상 동작 중인데** "제한" 경고가 뜬다
- 생산자: `src/resolver/projectCollab/CollabCoverageService.js:103` `appOnly = (앱 검색 스페이스 ∪ 구독) − 본인이 볼 수 있는 스페이스` → `:121` `hiddenSpaceCount: isWriter ? 0 : appOnly.length`. 즉 "**본인은 못 보지만 앱은 (대개) 보는** 스페이스" 수 — 협업 모드가 열어 주는 대상 그 자체다. 테스트도 그렇게 고정돼 있다: `CollabCoverageService.test.js:108-121` 에서 `SEC`(앱 권한 `true`)가 `hiddenSpaceCount: 2` 에 포함.
- 소비자:
  - `locales/kr/collab.json:44` `"본인이 볼 수 없는 스페이스 {count}개가 협업 모드로도 제한됩니다."` (en 동일 의미) — **사실과 반대 문구**.
  - `static/ui/src/hooks/useProjectCollabCoverage.js:47` `hasWarning: … || hiddenSpaceCount > 0` → `CollabModeNotice.jsx:40` 배지가 "협업 모드 · 일부 제한" 경고 모양.
- 결과: 다른 부서 스페이스 이슈를 보려고 협업 모드를 켠 전형적인 경우, **쓰기 권한이 없는 참여자 전원**에게 배지가 늘 경고로 뜨고 "협업 모드로도 제한된다"는 틀린 안내가 나온다. 같은 프로젝트의 쓰기 권한자는 `hiddenSpaceCount:0` 이라 경고가 없다(같은 화면이 권한에 따라 다른 결론).
- 수정 방법(택1):
  - (권장, 백엔드) `hiddenSpaceCount` 를 "본인이 못 보는 스페이스 중 **앱도 못 보거나 확인 못 한** 것"으로 좁힌다: `appOnly.filter((k) => appSide.perms[k] !== true).length`(perms 에 없으면 `extraPerms` 확인). 이름은 여전히 싣지 않는다. 테스트 기대값 `SEC` 제외(→1). 프론트·문구는 그대로 맞는다.
  - (또는) 서버 의미를 유지하고 프론트에서 경고 조건에서 빼고, 문구를 "본인은 볼 수 없지만 협업 모드로 보이는 스페이스 {count}개"로 바꾼다.

### R-F2 [낮음] 대시보드 워크로그 위젯 `chartData.truncated` — 생산만 있고 소비가 없다
- 생산자: `src/resolver/projectDashboard/ProjectDashboardService.js` heatmap·lineStack 반환에 app 경로 절단 시 `truncated: true` 추가(Codex 1 반영).
- 소비자: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:541-544` 의 절단 캡션은 insight·aggregate 소스만 본다. heatmap·lineStack 의 `chartData.truncated` 를 읽는 곳 없음(grep). → 예산 절단이 일어나도 화면에는 과소 집계가 **경고 없이** 보인다(캘린더는 `ProjectCalender.jsx` 가 `truncated` 를 표시하므로 대조적).
- 수정 방법(프론트): `ChartTemplate` 캡션 조건에 `(dataType==='worklog' && chartData?.truncated === true)` 를 추가해 기존 `dashboard.insight.truncated`(또는 `collab.truncated`) 캡션 재사용. 테스트 1건.
- 참고: 1,000이슈 검색 절단(`CollabWorklogFetcher.js:141`)이 조용한 것은 백엔드 보고서 §8-3 에서 "기존 경로와 동일 동작"으로 **보류 명시** — 이번 판정에서 제외.

## R-3. 통과

| # | 항목 | 근거 |
|---|---|---|
| 1 | X1(a) 가드 키 불일치 거부 | `permissionGuard.js:45-57` — 두 키 모두 있고 `String` 비교가 다르면 `PERMISSION_PROJECT_SCOPE_DENIED`. `enforceProjectScope` 는 가드 본체 단일 호출(`:157`)이라 **모든 `detail`/`inherited` resolver 에 공통 적용**. ALL 스코프는 앞에서 return 하지만 그들은 원래 전 프로젝트 접근이라 우회 이득이 없다. 테스트 `test/permission/projectScopeGuard.test.js` "두 키가 둘 다 있고 값이 다르면 거부…"(findProjectById·updateGanttSchedule, 같은 값 통과) |
| 2 | X1(b) 협업 9개 `assertSingleProjectKey` | `ProjectCollabController.js:20-23` 내부 `define` 래퍼로 9개 전부 진입 검사(`CollabAccess.js:122-127`, `COLLAB_INVALID_INPUT`). 테스트 `ProjectCollabController.test.js` "projectId ≠ project_id → COLLAB_INVALID_INPUT, 서비스 미호출"(PermissionMap 협업 키 순회) |
| 3 | X1(b) `setProjectCollabMode` 스코프 재확인 | `ProjectCollabService.js:47-51` `scopedProjectIds` 로 대상 `project_id` 재검사, UPDATE 전. 테스트 "스코프 밖 project_id 는 가드와 무관하게 거부, UPDATE 미실행" |
| 4 | X1 이중 적용 충돌 없음 | 순서: 가드(스코프 사용자만) → 컨트롤러 → 서비스. 스코프 사용자는 가드에서 `SCOPE_DENIED`, ALL 사용자는 컨트롤러에서 `COLLAB_INVALID_INPUT` — 둘 다 거부라 결과 충돌 없음. 차이: 가드는 `String()` 비교, 컨트롤러는 `!==` 라 `5`/`"5"` 는 가드 통과·컨트롤러 거부(더 엄격한 쪽이 이김, UUID 문자열만 오므로 실사용 영향 없음). 프론트 `COLLAB_ACCESS_LOST_CODES` 에 `PERMISSION_PROJECT_SCOPE_DENIED` 추가(`collabErrors.js:15`) — 재판정 후 user 강등, 무해 |
| 5 | X2 coverage 접근 규칙 | `CollabCoverageService.js:78-84` — 'app'(켜짐+참여) 허용, `reason==='OFF'` + `PROJECT write` 만 허용, 그 외 `collabAccessError`(ON+비참여는 쓰기 권한자여도 거부). 프론트 확인 창은 `enabled: confirming && canWrite`(`CollabModeSetting.jsx:33`), 배지는 'app' 일 때만. `COLLAB_MODE_OFF` 는 `isCoverageSilenced` 로 조용히 생략 |
| 6 | X2 이름 노출 경로 | 이름 출처는 ① 본인 자격 검색 `mine.projects` ② 구독 `sourceName` 중 **본인 BROWSE 가 true 인 것**(`:98-101`)뿐. 앱 검색은 **키만** 캐시(`:58-63` `projects: [...keys()]`)해 이름이 응답에 들어갈 경로가 없다. 비쓰기 호출자에게는 앱 전용 스페이스 키도 없음(개수만). 테스트가 `'인사-징계'`·`'SEC'` 미포함을 고정 → **본인이 못 보는 스페이스의 이름이 새는 경로 없음** |
| 7 | X2 잔여(수용) | 쓰기 권한자에게는 본인이 못 보는 스페이스의 **키**가 `name:null` 로 나간다(권한 스킴 수정 대상 식별용, 설계 의도). 이름은 아니고 키만이라 수용 — 기록만 |
| 8 | Codex 2·6 coverage 요청량 | 앱 쪽 KVS `Collab:coverage:<pid>` 5분(`:36,50-66`), 예산 소진 시 캐시 안 함, 본인 검색 500(`MAX_USER_COVERAGE_ISSUES`), 요청 예산 100 공유(`createRequestBudget`, 검색·mypermissions 모두 `spend`, 동기 차감이라 동시성에서도 초과 없음), 소진 시 `null`/`truncated`. 테스트 "캐시 적중 시 앱 호출 없음", "캐시 미스 5분 저장", "본인 검색 500건 상한" |
| 9 | coverage 새 계약 ↔ 프론트 | 루트 `{spaces[{key,name|null,appCanBrowse}], hiddenSpaceCount, userOnlyIssueCount, truncated}` ↔ `useProjectCollabCoverage.js:20-30` 루트 접근, `CollabCoverageDetails.jsx:18` `name` null 이면 키만, `:60-62` hiddenSpaceCount 표시. shape 일치(의미 불일치는 R-F1) |
| 10 | Codex 1 워크로그 예산·워커 | `CollabWorklogFetcher.js:44-98` 워커 풀(이슈 Promise 선생성 없음, 이슈 내 추가 페이지 순차 → 동시 요청 ≤ concurrency 5), 공유 예산 워크로그 20,000·요청 300, 소진 시 중단+`truncated`. 캘린더 `CollabCalendarService.js:46-52` 이슈 상한 절단과 OR 로 응답 전달 → `ProjectCalender.jsx` 경고 표시. 대시보드는 `{rows,truncated}` 까지 전달(화면 소비는 R-F2) |
| 11 | Codex 3 작성자 필터 | `CollabWorklogFetcher.js:145-148` 기간 필터 뒤 워크로그 단위 `author.accountId ∈ 선택` 필터. 테스트 "같은 이슈 두 사람 로그 → 선택한 사람 것만". 참고: 본인 경로(`WorklogService.getProjectWorklogs`)는 여전히 JQL 모집단만 좁혀 **두 경로 수치가 다를 수 있다**(기존 경로 문제, 범위 밖 — 별건 권장) |
| 12 | Codex 7 KVS 키 해시 | `authorsCacheSegment` = sha256(JSON(정렬 배열)) → `Collab:UserDate:<pid>:<s>:<e>:<64hex>`(~140자, 키 길이·`:` 충돌 해소). `Collab:` 접두어 유지, 기존 키 미사용 |
| 13 | visibility 워크로그 제외 | `isUnrestrictedWorklog`(`CollabWorklogFetcher.js:27`) — 캘린더·대시보드 수집기(`:82`)와 이슈 워크로그(`CollabIssueWorklogService.js:30-33`, total 에서 제외 수 차감) 모두 적용. 테스트 "visibility 가 있는 로그는 빠지고 total 도 그만큼 줄어든다" + 수집기 1건 |
| 14 | X3 칸반 배지 | `ProjectIssuePanelModal.jsx` 설명 줄 오른쪽 `<CollabModeNotice projectId={project_id}/>`. 테스트 `collabFollowup.test.jsx` 칸반 모달 배지 |
| 15 | Codex 9·10 프론트 | 9: 접근 상실 코드에 SCOPE_DENIED 추가(위 4). 10: `useProjectCalender.js:57-58` 협업 경로는 coworker 필드 조회를 기다리지 않음(`readAuthority==='app' \|\| isCoworkerFieldReady`) — 본인 경로 조건 불변. 테스트 `collabFollowup.test.jsx` 6건 |
| 16 | X4·X5·X6 문서 | X4 이메일 의도적 제외: `01_architect_design.md:177`, `WORK_VIEWS.md:51`. X5 `GANTT.md:181`(설계 §8-3 문안 포함). X6 `Moves_Workforce_데이터모델_ERD.md:70-72,183-184`(3컬럼·v025) |

## R-4. 미검증

| # | 항목 | 이유 |
|---|---|---|
| R-U1 | coverage KVS 캐시 값 크기 | 앱 이슈 키 최대 2,000개(`issueKeys`)를 한 값에 저장 — 키당 ~10B면 ~25KB로 KVS 값 한도(240KiB) 안이지만 실측 전 |
| R-U2 | 1차 U-1~U-7(Forge SQL 타입·TiDB ALTER·asApp 가시 범위·Jira 응답 형태·rate limit·실화면) | 배포·E2E 전이라 그대로 미검증 |

## R-5. 재작업 지시
- **backend(또는 frontend)**: R-F1 — `hiddenSpaceCount` 를 "앱도 못 보거나 확인 못 한 스페이스"로 좁히기(권장) + 테스트 기대값 수정. 프론트 문구·경고 조건은 그 의미에 이미 맞다.
- **frontend**: R-F2 — `ChartTemplate` 절단 캡션에 worklog 위젯 `chartData.truncated` 추가.

## 재검증 뒤 반영 (리더, 2026-09-30)

| 항목 | 처리 |
|---|---|
| `hiddenSpaceCount` 의미 불일치 | **수정** — 앱 전용 스페이스 중 **앱도 못 보는 것**(확인 실패 `null` 포함, 보수적)만 센다. 앱이 보는 앱 전용 스페이스는 협업 모드가 열어 주는 것이라 경고 대상이 아니다. 테스트 기대값 정정 |
| 대시보드 워크로그 위젯 절단 캡션 | **수정** — `ChartTemplate`의 캡션 조건에 `chartData.truncated` 추가 |
| 가드의 `projectId`/`project_id` 불일치(모든 detail·inherited resolver 공통) | **수정**(리더) — `enforceProjectScope`에서 두 키가 다르면 거부 + 테스트 |

최종 실행: 루트 1,932건 통과 · 프론트 2,071건 통과 · `CI=true` 빌드 성공(예산 안).

## Codex 2차 검수 반영 (리더, 2026-09-30)

1차 지적 전부 해소 확인. 2차 잔여: coverage 사용자·프로젝트 단위 완성 응답 캐시(2분)+앱 권한 캐시 전수(확인 상한 100, 예산 200) · 워크로그 요청 예산에 검색 페이지 포함(공용 `RequestBudget`) · 워크로그 페이지 즉시 필터·축소(원문 미누적) · 작성자 해시 중복 제거 · 가드 키 불일치 검사를 스코프 판정 앞으로(ALL 사용자에게도 적용, 리더). 공개 범위 제한 워크로그 제외는 세 경로 모두 코드 확인.

최종: 루트 1,941건 통과 · 프론트 2,071건 통과 · `CI=true` 빌드 성공(예산 안).

## 현장 장애 추가 검수 (2026-09-30, Codex)

기준 소스: `bad31d94a6b137c6baaf8bcb2433884978c4fad2`. 사용자 요청은 협업 모드 검수이며, 앱 코드 수정·배포·설치·DB 변경은 수행하지 않았다. 기존 번역 생성물과 미추적 파일을 보존했다. 아래 시간은 KST다.

### 실제 환경에서 확인한 사항

- `moves-rms` 환경 16:59:27 로그에서 `[CollabAccess] 판정 SQL 실패 → OFF 로 간주`를 확인했다. 해당 요청은 상태·참여 여부를 한 SELECT의 EXISTS로 읽는 이전 구현을 실행했다. 로그에는 원인 예외가 없으므로 이것만으로 EXISTS 구문 미지원이나 특정 컬럼 부재를 확정할 수 없다.
- 16:40:15의 마지막 마이그레이션 실행은 `Applied migrations: []`이며, 전체 이력에 `v025_alter_project_add_collab_mode`가 없다. 현재 코드에는 v025가 필수다. `manifest.yml:165`는 마이그레이션을 시간별 실행하고, `SeedData.js:31`의 fallback은 seed 버전이 낮을 때만 실행한다. 따라서 배포 성공만으로 협업 컬럼 준비를 보장하지 않는다. 현재 DB 컬럼의 직접 조회는 수행하지 못했으므로 **미적용은 우선 확인할 가설**이다.
- 배포 목록에는 `moves-rms` 16:39:48 및 17:00:10 시작 배포가 성공으로 나온다. `buildTag`가 `N/A`여서 최신 배포와 로컬 커밋의 일치 여부는 검증하지 못했다. 16:59 오류는 17:00 배포보다 앞선 것이므로 최신 수정의 실패 증거로 재사용하면 안 된다.
- 설치 목록에서 `tom-chkim-dev.atlassian.net`에 `moves-rms`와 `development`가 공존한다. 같은 환경의 16:40:17 로그에도 `projectIdField` 자기 소유 필드 2건 경고가 있다. `CollabJqlBuilder.js:165`는 표시 이름 `moves_RMS_projectId`를 사용하고, `FieldApi.js:33`은 같은 앱의 다른 환경을 구분하지 않고 첫 필드를 선택한다. **필드 중복은 확정**, 실제 협업 검색의 실패·누락 여부는 미검증이다.

### 확인된 코드 결함

1. **[P1] SQL 장애와 정상 OFF를 구분할 수 없다.** `src/permission/CollabAccess.js:80`은 모든 SQL 예외를 `collabMode:false`, `reason:OFF`로 바꾼다. 서비스는 이를 성공 응답으로 반환하므로 `CollabModeSetting.jsx:65,100`의 오류 표시·버튼 비활성화가 작동하지 않는다. 설정을 읽지 못했는데 사용자는 꺼진 것으로 보고 다시 켜기를 시도하게 된다. `readAuthority:user`로 제한하는 원칙은 유지하되, 설정 조회 실패와 실제 OFF를 응답·화면에서 구분해야 한다.
2. **[P2] 권한 재조회 실패 후 이전 app 상태가 유지된다.** `static/ui/src/hooks/useProjectReadAuthority.js:52`는 `isError`와 무관하게 캐시의 `data.readAuthority`를 사용하고, `:56`은 오류 시 캐시 전환 무효화를 생략한다. 최초 성공(app) → 재조회 실패이면 TanStack Query가 이전 데이터를 보존하므로 계속 협업 resolver를 선택한다. 서버가 매번 권한을 다시 검사하므로 권한 우회가 확인된 것은 아니지만, 반복 실패·오래된 화면·배지 유지가 생길 수 있다. 오류 시 user 전환과 종속 캐시 처리를 함께 검증해야 한다.

### 검증 결과

| 검증 | 결과 |
|---|---|
| 루트 `npm test -- --runInBand --testPathPatterns='Collab\|collab\|permissionMap.contract'` | 통과, 14 스위트 / 173건, exit 0 |
| `static/ui`의 `npm test -- --runInBand --testPathPattern='collab\|Collab'` | 통과, 4 스위트 / 39건, exit 0 |
| 설치된 TanStack Query로 app 성공 후 재조회 예외 재현 | `isError:true`, `data.readAuthority:app`; 현재 훅 판정식도 app |
| 앱 루트 `pwd` 후 `forge lint` | exit 0, 다만 `PermissionLinter: Unknown product`로 일부 권한 검사를 수행하지 못함 |
| `forge logs`, `forge install list`, `forge deploy list --json` | 읽기 전용 조회 성공. 장애 로그는 moves-rms 환경에서 확인 |
| 전체 테스트 / CI 빌드 / 브라우저 E2E | 이번 검수에서는 미실행. 위의 이전 검증 기록을 이번 소스의 실행 결과로 간주하지 않음 |
| 최신 배포의 협업 설정 읽기·쓰기 / v025 컬럼 존재 / 앱 자격 검색 | 미검증 |

다음 확인 순서: 대상 사이트의 v025 적용·컬럼 존재 확인 → 최신 배포의 `getProjectCollabAccess` 응답 확인 → 참여자 계정으로 연결 이슈 조회 → 중복 환경 필드의 실제 매칭 확인. 마이그레이션 실행·설치 정리·배포는 이번 검수에서 수행하지 않았다.

### 코드 효율성·로직 후속 검수 (동일 소스)

사용자가 환경 이슈와 별개로 코드의 효율성·로직 문제 유무를 질문하여 추가 확인했다. 앱 코드 수정은 하지 않았다.

- **[P2, 재현] 대시보드 1,000이슈 상한 절단이 정상 완료로 반환된다.** `CollabWorklogFetcher.js:157`은 다음 페이지가 있어도 1,000건에서 멈추지만, `searchTruncated`는 요청 예산 부족일 때만 설정된다. `:182`는 결과적으로 `truncated:false`를 반환한다. 실제 모듈을 Babel로 로드하고 Jira 응답만 매 페이지 100이슈·계속되는 커서로 대체한 결과, 10페이지·워크로그 1,000건에서 멈추고 `truncated:false`를 반환했다. 워크로그 합계가 작게 집계되는데 화면 경고도 나오지 않고 이 결과가 집계 캐시에 저장될 수 있다. 이전 보고서의 보류 항목이며 현재도 남아 있다.
- **[P2, 재현] coverage 완성 응답 캐시가 현재 쓰기 권한을 반영하지 않는다.** `CollabCoverageService.js:91`에서 현재 `isWriter`를 계산하지만 `:100-102`에서는 프로젝트·accountId 키의 과거 응답을 그대로 반환한다. 협업 참여는 유지한 채 PROJECT write가 회수되면 2분 동안 쓰기 권한자 전용 스페이스 키가 계속 반환될 수 있고, 반대로 write 부여 후에는 필요한 키가 안 보일 수 있다. 실제 서비스 모듈에 현재 쓰기 권한 false와 과거 writer 응답 캐시를 주입하자 숨겨져야 할 키가 반환됐다. 이는 실제 계정 권한 변경 E2E가 아니라 코드 경로 재현이다. 권한별 키 분리 또는 캐시 원자료를 현재 권한에 맞춰 다시 가공해야 한다.
- **효율성 개선 대상:** coverage는 캐시가 없으면 Jira 요청 상한 200회, 워크로그는 상한 300회다. 동시성 제한(4/5)과 캐시로 무제한 호출은 막지만 화면 요청 한 번의 최악 비용은 크다. 완성 응답을 저장하기 전 동시 요청은 같은 검색을 중복 수행할 수 있다. 요청 내 결과 공유·범위 확인의 지연 실행·운영 응답 시간 측정이 개선 후보이며, 실제 지연·타임아웃은 이번에 측정하지 않았다.
- **유효한 기존 방어:** 서버 프로젝트·참여자 재검증, 서버 JQL 조립, DTO 필드 제한, app/user 집계 캐시 분리, 요청 예산 공유, 워크로그 동시성 제한은 코드에 존재한다. 판정 SQL은 요청당 두 조회이지만 참여 조건을 없애거나 사용자 간 판정 캐시를 공유하는 식의 최적화는 권한 경계를 훼손한다.

추가 재현 명령은 파일을 만들지 않는 PowerShell here-string → `node` 실행이며 exit 0. 결과: `issue_cap_with_more_pages={pages:10,worklogs:1000,truncated:false}`, `writer_cache_after_write_revoked={isWriter:false,returnedSpaces:[PRIVATE],hiddenSpaceCount:0}`. 네트워크·실 DB·실제 계정은 사용하지 않았다.
