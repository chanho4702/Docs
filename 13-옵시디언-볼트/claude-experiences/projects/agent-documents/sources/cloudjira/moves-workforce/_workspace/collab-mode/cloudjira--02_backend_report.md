# 협업 모드 — 백엔드 구현 보고서

> 작성 2026-09-30 · 기준 `develop` `50bc649` + 작업 트리(미커밋) · 설계 `01_architect_design.md`(§12 포함)
> 범위: M0 · M2 · M3(백엔드) · M4(백엔드) · M5 · **M7(§12 제한 알림)**. 프론트·문서는 손대지 않았다. git commit 없음.

---

## 1. 모듈별 변경·추가 파일

### M0 — 기반
| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `src/rdb/schema/ddl/project.sql.js` | `ALTER_PROJECT_ADD_COLLAB_MODE`(3컬럼, `ADD COLUMN IF NOT EXISTS`, 기본 0) |
| 수정 | `src/rdb/schema/ddl/index.js` | project 줄에 export 추가 |
| 수정 | `src/rdb/schema/migrate.js` | import + `.enqueue('v025_alter_project_add_collab_mode', …)` (v024 다음) |
| 수정 | `src/rdb/query/ProjectQuery.js` | `FIND_COLLAB_ACCESS`, `UPDATE_COLLAB_MODE` 추가(기존 `FIND_BY_ID`·`FINDALL`·`UPDATE` 등은 **불변**) |
| 수정 | `src/utils/errors/ErrorCodes.js` | `COLLAB_MODE_OFF`, `COLLAB_NOT_PARTICIPANT`, `COLLAB_INVALID_INPUT`, `COLLAB_ISSUE_NOT_IN_PROJECT` |
| 신규 | `src/permission/CollabAccess.js` | 판정 단일 출처: `describeCollabAccess`, `resolveCollabReadAuthority`, `assertCollabReadAccess` (+ `COLLAB_UUID_RE`, `COLLAB_REASON`, `toCollabAuditIso`) |
| 신규 | `src/resolver/projectCollab/CollabRepository.js` | `findCollabAccessRepository`, `updateCollabModeRepository` |
| 신규 | `src/resolver/projectCollab/CollabJqlBuilder.js` | `quoteJql`, `validateCollabFilter`, `buildCollabJql`, `GROUP_KEY_RE`, `ISSUE_KEY_RE` |
| 신규 | `src/resolver/projectCollab/CollabDto.js` | `toCollabIssueRow`, `toCollabSummaryRow`, `toCollabSummary`, `toCollabSkeletonRow`, `toCollabWorklog`, `toCollabCalendarIssue` |
| 신규 | `src/resolver/projectCollab/ProjectCollabService.js` | `getProjectCollabAccessService`, `setProjectCollabModeService` |
| 신규 | `src/resolver/projectCollab/ProjectCollabController.js` | `registerProjectCollabController` (최종 9개 resolver) |
| 수정 | `src/permission/PermissionMap.js` | ProjectCollab 섹션(최종 9키) |
| 수정 | `src/index.js` | import + `CONTROLLER_REGISTRARS` 에 `registerProjectCollabController` 1줄 |
| 테스트 | `src/permission/__test__/CollabAccess.test.js` (B1), `projectCollab/__test__/CollabJqlBuilder.test.js` (B2), `CollabDto.test.js` (B3), `ProjectCollabService.test.js` (B6 + PermissionMap 9키) | |

### M2 — 트리·간트·맵·캘린더 이슈 모드
| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `src/resolver/gantt/GanttController.js` | `getProjectGanttData` 만 `principal` 전달(쓰기 resolver 는 불변) |
| 수정 | `src/resolver/gantt/GanttService.js` | `getProjectGanttData(payload, principal)` → `resolveCollabReadAuthority` → `getProjectGanttIssues(projectId, null, as)`. **`fetchGanttGraph`·`assertGanttIssueInProject` 불변** |
| 테스트 | `src/resolver/gantt/__test__/GanttCollabAuthority.test.js` (B5 간트 + W1) | |

### M3 — 작업관리 목록
| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `src/api/jira/issue/CollabIssueFetcher.js` | asApp 전용: `searchCollabSummary`, `searchCollabPage`, `searchCollabSkeleton`, `searchCollabByKeys`, (M4용) `searchCollabCalendarIssues`, `isIssueInCollabProject`. fields allowlist 상수(`SUMMARY_FIELDS`, `ROW_FIELDS`, `SKELETON_FIELDS`, `CALENDAR_FIELDS`) |
| 신규 | `src/resolver/projectCollab/CollabWorkListService.js` | 목록 4 서비스 + `rejectJqlPayload` |
| 수정 | Controller·PermissionMap | 4키 추가 |
| 테스트 | `projectCollab/__test__/CollabWorkListService.test.js` (B4 목록) | |

### M4 — 워크로그
| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `src/api/jira/worklog/CollabWorklogFetcher.js` | `fetchIssueWorklogsAsApp`, `collectRangeWorklogsAsApp` (+ M5 함수) |
| 수정 | `src/resolver/projectCalendar/ProjectCalendarService.js` | `buildTeamAxis` **export 만** 추가 |
| 신규 | `src/resolver/projectCollab/CollabCalendarService.js` | `getCollabCalendarWorklogService`, `assertCalendarRange` |
| 신규 | `src/resolver/projectCollab/CollabIssueWorklogService.js` | `getCollabIssueWorklogsService` |
| 수정 | Controller·PermissionMap | 2키 추가 |
| 테스트 | `projectCollab/__test__/CollabWorklogServices.test.js` (B4 캘린더·이슈 워크로그) | |

### M5 — 대시보드
| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `src/api/jira/issue/ProjectParticipantFetcher.js` | `getProjectParticipantIssues({…, as='user'})`, 하드코딩 `'user'` → 인자, 캐시 키 `app::projectId` 분리(user 키 형식 불변) |
| 수정 | `src/api/jira/issue/IssueApi.js` | `getAssigneeStats`/`getIssueParticipantStats` 에 `as='user'` 관통만(다른 함수·기본값 불변) |
| 수정 | `src/resolver/projectIssue/ProjectUsersService.js` | `get*StatsService` 에 `as='user'` 관통 |
| 수정 | `src/resolver/projectDashboard/DashboardIssueFetcher.js`, `TopologyIssueFetcher.js` | 캐시 키 `as==='app' ? app::projectId : 기존` |
| 수정 | `DashboardInsightService.js`, `RelationGraphService.js` | 판정 후 `as` 전달(`Promise.all` 안에서 `.then` 체인 — 직렬 지연 없음) |
| 수정 | `ProjectDashboardService.js` | `COLLAB_DATA_TYPES=['issue','assignee','worklog']` 일 때만 판정, `getChartDataService` 는 루프 밖 1회. worklog app 경로 = `aggregateCollabWorklogsByDate/ByUserDate` |
| 수정 | `src/resolver/utils/worklog/WorklogService.js` | `aggregateByUserDate` **export 만** 추가 |
| 추가 | `CollabWorklogFetcher.js` | `getProjectWorklogsAsApp`, `aggregateCollabWorklogsByDate`, `aggregateCollabWorklogsByUserDate` (KVS `Collab:Date:` / `Collab:UserDate:`, TTL 10분) |
| 테스트 | `projectDashboard/__test__/DashboardCollabAuthority.test.js`, `DashboardCollabCacheKeys.test.js`, `DashboardInsightTopologyCollab.test.js` (B5 대시보드) | |
| 테스트 수정 | `DashboardInsight.test.js`, `RelationGraph.test.js` | 페처 호출 인자 기대값에 `as: 'user'` 추가(4곳). 호출 계약이 `{projectId, viewerId}` → `{projectId, viewerId, as}` 로 늘어난 것 반영 |

### M7 — 제한 알림(§12)
| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `src/api/jira/issue/CollabCoverageFetcher.js` | `searchCoverageIssues({projectId, as})`, `appCanBrowseProject(key)` |
| 신규 | `src/resolver/projectCollab/CollabCoverageService.js` | `getProjectCollabCoverageService`, `MAX_COVERAGE_SPACES=50` |
| 수정 | Controller·PermissionMap | `getProjectCollabCoverage` 1키 |
| 테스트 | `projectCollab/__test__/CollabCoverageService.test.js` | |

---

## 2. resolver 실제 응답 shape (글자 그대로 — 프론트는 이것을 읽는다)

모든 resolver 는 `guardedDefine` 등록 → 성공 `{ success: true, ...서비스반환 }`, 실패 `{ success: false, error: { name, code, message, cause } }`.

### 2-1. `getProjectCollabAccess` — `R('PROJECT','detail')`, 입력 `{ projectId }`
```js
{ success: true,
  content: { projectId, collabMode: boolean, readAuthority: 'app'|'user',
             reason: 'ON'|'OFF'|'NOT_PARTICIPANT'|'OUT_OF_SCOPE'|'NOT_READY',
             changedBy: string|null, changedAt: string(ISO)|null } }
```
- **던지지 않는다.** `projectId` 가 UUID 가 아니면 `readAuthority:'user', reason:'OFF', collabMode:false`.
- `collabMode` 는 **DB 컬럼 값 그대로**(참여 여부 무관). 비참여 관리자에게도 `collabMode:true, readAuthority:'user', reason:'NOT_PARTICIPANT'` 로 나온다 → `ProjectModal` 토글 상태에 그대로 쓸 수 있다. `NOT_READY`·`OUT_OF_SCOPE`·형식 위반·SQL 오류는 DB 를 안 읽으므로 `collabMode:false, changedBy:null, changedAt:null`.

### 2-2. `setProjectCollabMode` — `W('PROJECT','detail')`, 입력 `{ project_id, enabled: boolean }`
```js
{ success: true,
  content: { projectId, collabMode: boolean, changed: boolean, changedBy: string|null, changedAt: string|null } }
```
- `enabled` 가 boolean 아님·`project_id` UUID 아님 → `COLLAB_INVALID_INPUT`. context/principal accountId 불일치 → `PERMISSION_DENIED`. 삭제 중·행 없음 → `PROJECT_DELETING`.
- 값이 같으면 `changed:false` + 기존 감사 값(컬럼 불변).

### 2-3. `getCollabWorkListSummary` — 입력 `{ projectId, filter: CollabFilter }`
```js
{ success: true,
  content: { rows: [ { p: string|null, s: 'new'|'indeterminate'|'done'|null, t: string|null } ],
             projects: { [spaceKey]: { id, key, name, avatarUrls: { '24x24', '16x16' } } },
             issueTypeIcons: { [typeName]: string },
             truncated: boolean } }
```
상한 2000행 / 100×20페이지. 절단 규칙은 기존 `fetchWorkListSummary` 와 같다(상한 도달 시 `nextPageToken` 이 있으면 truncated).

### 2-4. `getCollabWorkListPage` — 입력 `{ projectId, groupKey, filter, pageSize: 1..100, cursor: string|null }`
```js
{ success: true, content: { issues: [CollabIssueRow], nextPageToken: string|null } }
```
`userMap` 은 **없다**(설계대로 클라가 `resolveCoworkerUserMap(issues)`). `groupKey` 필수.

### 2-5. `getCollabWorkListSkeleton` — 입력 `{ projectId, groupKey, filter }`
```js
{ success: true, content: { rows: [ { key, parentKey: string|null } ], truncated: boolean } }
```
상한 2000 / 500×24페이지, `isLast` 를 상한보다 먼저 본다(기존 규칙).

### 2-6. `getCollabWorkListDetail` — 입력 `{ projectId, keys: string[] (1..500) }`
```js
{ success: true, content: { issues: [CollabIssueRow] } }
```
순서 무보장(클라가 `orderIssuesByKeys`). 50키 청크·동시성 3·청크당 추적 ≤2, 청크 하나 실패 시 전체 실패. **`key IN` 에도 프로젝트 술어 AND**.

### 2-7. `getCollabCalendarWorklog` — 입력 `{ projectId, startDate, endDate }` (양 끝 포함 ≤100일)
```js
{ success: true, data: [CollabCalendarIssue], memberTeamMap: { [accountId]: teamKey },
  teamMeta: { [teamKey]: name }, truncated: boolean }
```
**`content` 래핑 없음**(기존 `getProjectCalendarWorklog` 와 같은 루트) + `truncated`. 기간 안 워크로그가 0건인 이슈는 `data` 에서 빠진다(기존과 동일). 상한 1000이슈 / 100×10페이지.

### 2-8. `getCollabIssueWorklogs` — 입력 `{ projectId, issueKey }`
```js
{ success: true, content: { worklogs: [CollabWorklog], total: number } }
```
첫 100건. `total` 은 Jira 응답의 `total`(없으면 worklogs 길이). 이 프로젝트에 연결되지 않은 이슈 → `COLLAB_ISSUE_NOT_IN_PROJECT`.

### 2-9. `getProjectCollabCoverage` (M7) — `R('PROJECT','detail')`, 입력 `{ project_id }`
```js
{ success: true, spaces: [ { key, name, appCanBrowse: boolean|null } ], userOnlyIssueCount: number, truncated: boolean }
```
**`content` 래핑 없음**(설계 §12-2 글자 그대로). `spaces` 는 key 오름차순. `appCanBrowse:null` = 확인 불가.

### 2-10. 공용 타입 (DTO 실제 출력)
```js
// CollabIssueRow
{ id, key,
  fields: { summary: string /*없으면 ''*/,
            statusCategory: { key, name, colorName } | null,
            status: { name, statusCategory: { key, name, colorName } | null } | null,
            issuetype: { name, iconUrl } | null,
            project: { id, key, name } | null,
            assignee: { accountId, displayName, avatarUrls: { '24x24', '48x48' } } | null,
            customfield_10015: string | null,
            duedate: string | null,
            timetracking: { originalEstimateSeconds?, remainingEstimateSeconds?, timeSpentSeconds? },  // 없으면 {}
            aggregateprogress: { percent? } | null,
            parent: { key } | null },
  properties: { movesRms: { coworkers: string[] } } }       // 항상 존재, 문자열만

// CollabCalendarIssue
{ id, key,
  fields: { summary, status: {…}|null, issuetype: { name, iconUrl }|null,
            project: { id, key, name, avatarUrls: { '24x24' } } | null,
            assignee: { accountId, displayName, avatarUrls: { '24x24' } } | null,
            worklog: { total: number /* = 기간 내 워크로그 수 */, worklogs: [CollabWorklog] } },
  properties: { movesRms: { coworkers: string[] } } }

// CollabWorklog
{ id, issueId, author: { accountId, displayName, avatarUrls: { '24x24', '48x48' } } | null,
  started, timeSpent, timeSpentSeconds, comment /* ADF 그대로 */ }
```
※ `emailAddress` 는 어떤 DTO 에도 없다. 프론트가 워크로그 작성자 이메일을 쓰는 곳이 있으면 빈칸이 된다(아래 §6 확인 필요).

### 2-11. `CollabFilter` 서버 검증 (실제)
- 허용 키 `text | spaces | assignees | statusCategories | issueTypes` 외 → `COLLAB_INVALID_INPUT`(`jql` 포함). 하위 객체도 알 수 없는 키 거부.
- `spaces: { op, keys }`, `assignees: { op, accountIds?, groups?, unassigned? }` — 배열·`unassigned` 는 생략 가능(기본 `[]`/`false`). 빈 항목은 절을 만들지 않는다.
- 값은 중복 제거 + 정렬 후 JQL 에 넣는다(모집단은 브라우저 경로와 같고, 문자열 순서만 다를 수 있다).
- **payload 최상위에 이름에 `jql` 이 들어간 키**(`jql`, `filterJql` …)가 있으면 조회 resolver 7종 모두 `COLLAB_INVALID_INPUT`.

---

## 3. 경계 강제 표(§2) → 실제 위치·테스트

| # | 경계 | 실제 파일·함수 | 테스트 |
|---|---|---|---|
| 1 | 대상 이슈 = 프로젝트 술어, 서버 조립, 클라 JQL 거부 | ① `CollabJqlBuilder.buildCollabJql` — 항상 `moves_RMS_projectId = "<uuid>"` 로 시작, 필터는 `AND (…)`<br>② `CollabIssueFetcher.*` — JQL 인자 없음, 내부에서 builder 호출, fields allowlist 상수<br>③ `searchCollabByKeys` — 청크마다 `buildCollabJql({projectId, keys})`<br>④ `CollabIssueWorklogService` → `isIssueInCollabProject`(프로젝트 술어 AND key) 후 워크로그<br>⑤ 서버 판정 경로는 기존 전용 페처 고정 JQL 그대로<br>⑥ 입력 검증: UUID(`COLLAB_UUID_RE`), groupKey/이슈키 정규식, 필터 알 수 없는 키·`jql` 거부, `rejectJqlPayload` | `CollabJqlBuilder.test.js`(11건: 술어 시작·괄호·주입 `a" OR moves_RMS_projectId = "b`·백슬래시·제어문자·알 수 없는 키·`jql` 거부·UUID/그룹키/이슈키·assignee 연산자·keys 모드 술어), `CollabWorkListService.test.js`(모든 호출 as:app + 술어 시작, JQL 문자열 거부, detail 술어·501키 거부), `CollabWorklogServices.test.js`(다른 프로젝트 키 거부) |
| 2 | 대상 사용자 = 참여 인원 + ProjectScope | `CollabAccess.describeCollabAccess`(단일 SQL `ProjectQuery.FIND_COLLAB_ACCESS` + `scopedProjectIds`) → `assertCollabReadAccess`(전용 resolver: 거부) / `resolveCollabReadAuthority`(서버 판정: user 강등) | `CollabAccess.test.js`: 비참여 ALL 관리자·TEAM_ONLY 비등록 팀원·principal 없음·스코프 밖·참여자 |
| 3 | 켜져 있을 때만(fail-close), 서버가 읽음 | 같은 `CollabAccess` — `collab_mode` 는 DB 만. 어떤 서비스도 payload `collabMode`/`readAuthority` 를 읽지 않음. SQL 오류(Unknown column 포함)·행 없음·DELETING → OFF | `CollabAccess.test.js`(Unknown column→OFF, DELETING→OFF, payload 무시), `CollabWorkListService.test.js`(목록 4종 꺼짐 거부 + `collabMode:true` 넣어도 거부), `CollabWorklogServices.test.js`(캘린더·이슈 워크로그 꺼짐 거부), `GanttCollabAuthority.test.js`(payload 값 무시) |
| 4 | 응답 최소화 | `CollabDto.js` 리터럴 allowlist 매퍼(스프레드 없음), 페처 fields allowlist 상수 | `CollabDto.test.js`: `description`·이슈 `comment`·`attachment`·`reporter`·`customfield_99999`·`movesRms.assignedById`·`emailAddress` 를 넣어도 출력 키 목록이 allowlist 와 **정확히 일치**(키 스냅샷) |
| 5 | 표시(배지) | 프론트 범위(백엔드 없음) | – |
| 6 | 감사 | `ProjectQuery.UPDATE_COLLAB_MODE`(`AND collab_mode <> ?`, `deletion_state='ACTIVE'`) ← `setProjectCollabModeService` | `ProjectCollabService.test.js`: off→on 갱신, on→on `changed:false`, 문자열 `'true'` 거부, 불일치 거부, 삭제 중 `PROJECT_DELETING`, 기존 SELECT 에 협업 컬럼 없음 |
| 7 | §4.4 ⑥ 문서 | 코드 주석에 `아키텍처 §4.4 ⑥` 참조. 문서 본문은 다음 단계(M6) | – |
| 쓰기 불변 | 수정 금지 목록 | `fetchGanttGraph`, `assertGanttIssueInProject`, `ProjectChildScope.assertIssueIdsInProject`, `updateProjectIdFieldService`, `IssueApi.isIssueInProjects/areIssuesInProject/areIssuesAccessible` — **diff 없음** | `GanttCollabAuthority.test.js` W1: `updateGanttSchedule`·`setGanttParent`·`setGanttLink`·`setGanttIssueFolder`·`moveGanttIssueToFolder`·`setGanttFolderLink` 이 협업 켜짐·참여자로 불려도 `getProjectGanttIssues`/`isIssueInProjects` 를 `'app'` 없이 호출하고 판정 SQL 자체를 부르지 않음 + 소스 고정(`'user'` 리터럴·기본값·CollabAccess 미import) |

B5 대응: `GanttCollabAuthority.test.js`(간트), `DashboardCollabAuthority.test.js`(issue·assignee·worklog 판정, level/role/team/salary 판정 SQL 미호출, getChartData 1회 판정), `DashboardInsightTopologyCollab.test.js`(insight·topology as 전달), `DashboardCollabCacheKeys.test.js`(참여자·인사이트·토폴로지 app↔user 캐시 비공유, 워크로그 KVS 키 `Collab:` 만).
B7: `test/permission/permissionMap.contract.test.js` 통과(등록집합↔맵키 9개 자동 대조) + `ProjectCollabService.test.js` 에서 9키 meta(`read/write · detail`) 직접 확인.

---

## 4. 설계와 다른 점(또는 설계가 정하지 않아 정한 것)

1. **`getProjectCollabAccess` 형식 위반 입력**: 던지지 않고 `reason:'OFF'` 로 답한다(설계는 "UUID 아님 → 거부"만 명시). `assertCollabReadAccess` 는 `COLLAB_INVALID_INPUT` 으로 거부.
2. **`collabMode` 값의 의미**: DB 컬럼 값 그대로(참여·삭제 상태 무관). 삭제 중 프로젝트는 `collabMode` 가 컬럼 값대로 나오고 `reason:'OFF'`.
3. **`isIssueInCollabProject`**: JQL 이 `moves_RMS_projectId = "pid" AND key IN ("K")`(builder 의 keys 모드), `fields:['key']`(설계 `id` — 기존 `isIssueInProjects` 가 쓰는 검증된 형태를 따랐다). 의미 동일.
4. **JQL 키 거부 범위**: payload 최상위 키 중 이름에 `jql`(대소문자 무시)이 들어간 것 전부 거부(`rejectJqlPayload`). 조회 resolver 7종(목록 4 + 캘린더 + 이슈 워크로그 + 목록 필터 내부)에 적용.
5. **`getCollabWorkListPage`/`Skeleton` 의 `groupKey` 필수**(없으면 그룹 제한 없는 전량 검색이 되므로).
6. **캘린더 `worklog.total`** = 기간 내 워크로그 수(기존 경로는 원래 total 을 유지). 프론트 캘린더에서 `worklog.total` 참조는 없음(grep 확인).
7. **캘린더 기간** "≤100일" 을 양 끝 포함 일수로 해석(2026-01-01~04-10 허용, ~04-11 거부). 존재하지 않는 날짜(02-30) 거부.
8. **대시보드 워크로그 app 경로**: 집계+KVS 캐시 함수를 `CollabWorklogFetcher` 에 두었다(`aggregateCollabWorklogsByDate/ByUserDate`). 기존 경로와 같이 작성자 필터는 JQL(`worklogAuthor IN`)에만 걸고 워크로그 단위로는 거르지 않는다(숫자 일치 목적). `startDate/endDate` 누락은 `COLLAB_INVALID_INPUT`(기존은 일반 `Error`). 이슈 수집은 페이지 루프·상한 1000(설계 §11-4 대로 기존 경로보다 숫자가 클 수 있음).
9. **판정 위치**: 간트는 페치 전에 직렬 1회, 인사이트·토폴로지는 `Promise.all` 안에서 `.then` 체인(병렬 유지).
10. **M7 `userOnlyIssueCount` 계산 실패 처리**: 본인·앱 검색 자체가 실패하면 resolver 전체 실패(설계는 mypermissions 실패만 null 로 정함). 구독 조회는 기존 저장소의 테이블 미준비 폴백(빈 배열)을 그대로 쓴다.
11. **M7 `getProjectCollabCoverage` 컨트롤러는 principal 을 서비스에 넘기지 않는다** — 참여·켜짐 조건이 없고 본인 검색은 `asUser` 컨텍스트로 충분. 스코프는 가드(`detail`, `project_id`)가 본다.

---

## 5. 테스트 결과

| 시점 | 명령 | 결과 |
|---|---|---|
| 착수 전 baseline | `npx jest` | 130 스위트 / 1795 테스트 통과 |
| M0 | `npx jest src/permission/__test__/CollabAccess src/resolver/projectCollab test/permission` | 13 스위트 / 225 테스트 통과 |
| M2 | `npx jest src/resolver/gantt` | 7 스위트 / 99 테스트 통과 |
| M3 | `npx jest src/resolver/projectCollab test/permission/permissionMap` | 5 스위트 / 66 테스트 통과 |
| M4 | `npx jest src/resolver/projectCollab src/resolver/projectCalendar test/permission/permissionMap` | 7 스위트 / 82 테스트 통과 |
| M5 | `npx jest src/resolver/projectDashboard` | 1차: 2 스위트 4 테스트 실패(`DashboardInsight`·`RelationGraph` 의 페처 호출 인자 정확 일치 기대 — `as` 추가로 어긋남) → 기대값에 `as:'user'` 추가 후 15 스위트 / 191 테스트 통과 |
| M7 | `npx jest src/resolver/projectCollab test/permission` | 15 스위트 / 244 테스트 통과 |
| **최종** | **루트 `npm test`** | **141 스위트 / 1896 테스트 전부 통과** (신규 11 스위트, +101 테스트), 실패 0 |

---

## 6. 확인하지 못한 것 (배포·실측 필요)

1. **Forge SQL 실제 반환 타입** — `EXISTS(...) AS is_member`·`collab_mode` 가 숫자/문자열/BigInt 중 무엇으로 오는지(`Number(v) === 1` 로 흡수하도록 짰으나 실측 전), `collab_mode_changed_at` 의 문자열 형식(UTC `YYYY-MM-DD HH:MM:SS` 가정 → ISO 변환).
2. **마이그레이션 v025 실제 실행**(TiDB `ADD COLUMN IF NOT EXISTS` 다중 절) — 배포 전 `forge deploy` 후 확인 필요. `stash@{0}`(RFC-200 폐기분)은 `v024_create_project_period_snapshot_table` 을 쓰며 v025 선점은 없다(단, stash 를 되살리면 develop 의 v024 와 이름 충돌 — 기존 문제).
3. **asApp 가시 범위(§11-1, E5)** — 앱 역할이 빠진 권한 스킴·이슈 보안 수준·제한 워크로그는 앱에게도 안 보일 수 있다. M7 은 그 신호만 준다.
4. **search/jql `fields:['statusCategory']` 응답 형태** — 목록 행의 `fields.statusCategory` 가 `{key,name,colorName}` 으로 온다고 가정(기존 브라우저 `*all` 응답 기준). 실측 전.
5. **`mypermissions` asApp 응답 형태** — `permissions.BROWSE_PROJECTS.havePermission` 가정. 다른 형태면 `null`(확인 불가)로 표시된다.
6. **프론트 소비 필드 재확인** — 설계 §3 주석대로 frontend 가 `useIssueRowFactory`·`ProjectIssueTable`·`HierarchyToggleCell`·`WorklogModal`·`FullCalendar`·`WorklogHistoryList` 의 `fields.`/`properties.`/`worklog.` 접근을 grep 으로 대조해야 한다. 특히 워크로그 작성자 `emailAddress`·`updateAuthor`, 행의 `fields.priority`·`fields.labels` 등을 쓰면 allowlist 에 없어 빈칸이 된다.
7. **M7 스페이스 이름 노출** — 앱 자격 검색의 `project.name` 을 합집합에 쓰므로, 본인이 볼 수 없는 Jira 스페이스의 **이름**이 응답에 포함될 수 있다(설계 §12-2 는 "민감 정보 아님"으로 판단). verifier 확인 권장.
8. **rate limit·응답 시간(E6)**, E2E 전 항목 미수행.

---

## 7. M7 (설계 §12 제한 알림) 요약

- resolver `getProjectCollabCoverage` — `R('PROJECT','detail')`, 입력 `{ project_id }`(UUID 검증), **협업 모드 꺼짐에서도 응답·참여자 조건 없음**(판정 SQL 을 부르지 않음 — 테스트로 고정).
- 관련 Jira 프로젝트 키 = 구독(`sourceType==='SPACE'` 의 `sourceKey`) ∪ 본인 자격 검색 `project.key` ∪ 앱 자격 검색 `project.key`, key 오름차순 상위 **50개**(초과 시 `truncated:true`).
- 검색: `buildCollabJql({projectId})`(프로젝트 술어만), `fields:['project']`, 100/페이지, **2000건 상한**(초과 시 `truncated:true`), 본인·앱 각 1패스(병렬).
- 키마다 asApp `GET /rest/api/3/mypermissions?projectKey=<KEY>&permissions=BROWSE_PROJECTS`, `p-limit(4)`. 실패·예상 밖 응답 → `appCanBrowse:null`, 전체는 성공.
- `userOnlyIssueCount` = |본인 키 집합 − 앱 키 집합|.
- `name` = 검색 결과 `project.name`(본인 결과 우선) → 구독 `sourceName` → 키.
- 응답 `{ success: true, spaces: [{ key, name, appCanBrowse }], userOnlyIssueCount, truncated }`.
- 테스트 `CollabCoverageService.test.js` 5건: 합집합·이름·차집합·asApp 호출 형태 / mypermissions 실패→null / 상한 50→truncated / 꺼진 프로젝트에서도 응답 / 잘못된 project_id 거부. 계약 테스트 통과.

---

## 8. 검증 반영 (03_verify_report + 외부 검수, 2026-09-30)

| # | 지적 | 처리 | 파일·함수 | 테스트 |
|---|---|---|---|---|
| 1 | [높음] 가드(`projectId ?? project_id`)와 서비스 키 불일치로 스코프 우회 (X1) | **수정.** ① 공용 `CollabAccess.assertSingleProjectKey(payload)` — 두 키가 모두 있고 값이 다르면 `COLLAB_INVALID_INPUT`. 컨트롤러가 9개 resolver 전부를 내부 `define` 래퍼로 등록해 진입에서 호출. ② `setProjectCollabModeService` 가 `scopedProjectIds(principal)` 로 대상 `project_id` 스코프를 **다시** 확인(`PERMISSION_PROJECT_SCOPE_DENIED`) — 읽기 `describeCollabAccess` 와 같은 판정 | `permission/CollabAccess.js`, `projectCollab/ProjectCollabController.js`, `ProjectCollabService.js` | `ProjectCollabController.test.js`(PermissionMap 의 협업 키 9개를 순회: 불일치 거부·서비스 미호출 / 같은 값·한쪽만은 통과), `ProjectCollabService.test.js`(스코프 밖 거부·UPDATE 미실행, 스코프 안 진행) |
| 2 | [높음] 워크로그 총량 상한 없음·이슈 Promise 선생성 (Codex 1) | **수정.** `collectRangeWorklogsAsApp` 를 워커 풀(`concurrency` 개 워커가 인덱스를 순서대로 꺼내 소비, 이슈별 Promise 선생성 없음, 이슈 내 추가 페이지는 순차)로 재작성. 호출 1회 공유 예산 `MAX_TOTAL_WORKLOGS=20000`(받은 워크로그, 기간 필터 전)·`MAX_JIRA_REQUESTS=300`(추가 페이지 요청). 바닥나면 남은 이슈 중단 + `truncated:true`. **반환이 `{ items, truncated }` 로 바뀜.** 캘린더는 기존 `truncated` 에 OR, 대시보드는 `getProjectWorklogsAsApp` → `{ worklogs, truncated }` → 집계 캐시 값 `{ rows, truncated }` → 위젯 `chartData` 에 **절단 시에만** `truncated: true` 키 추가(heatmap·lineStack, app 경로 한정. 기존 키 불변) | `api/jira/worklog/CollabWorklogFetcher.js`, `CollabCalendarService.js`, `ProjectDashboardService.js` | `DashboardCollabCacheKeys.test.js`(요청 수 상한 3 → 3회에서 중단·truncated / 총량 상한 → 남은 이슈 미처리 / 예산 안 → false), `DashboardCollabAuthority.test.js`(chartData.truncated 메타) |
| 3 | [중간] 작성자 필터가 워크로그 단위로 안 걸림 (Codex 3) | **수정.** `getProjectWorklogsAsApp` 가 기간 필터 뒤 `log.author.accountId ∈ 선택 집합` 만 남긴다(JQL `worklogAuthor IN` 은 모집단용으로 유지) | `CollabWorklogFetcher.getProjectWorklogsAsApp` | 같은 이슈에 두 사람 로그 → 선택한 사람 것만 |
| 4 | [중간] coverage 정보 노출·요청량 (X2, Codex 2·6) | **수정(계약 변경).** 아래 §8-1 | `CollabCoverageService.js`, `CollabCoverageFetcher.js`, Controller(principal 전달) | `CollabCoverageService.test.js` 11건 |
| 5 | [중간] 작성자 목록 KVS 키 충돌 (Codex 7) | **수정.** `authorsCacheSegment(ids)` = sha256(JSON.stringify(정렬 배열)) → `Collab:UserDate:<pid>:<s>:<e>:<hex64>` | `CollabWorklogFetcher.js` | `['a:b','c']` ≠ `['a','b:c']`, 순서 무관 동일 |
| 6 | [낮음] 공개 범위 제한 워크로그 | **수정.** `isUnrestrictedWorklog`(= `!log.visibility`). `collectRangeWorklogsAsApp`(캘린더·대시보드)와 `getCollabIssueWorklogs` 에서 제외. 이슈 워크로그 `total` 은 그 페이지에서 제외한 수만큼 뺀다 | `CollabWorklogFetcher.js`, `CollabIssueWorklogService.js` | 수집기 1건 + 이슈 워크로그 1건 |
| 7 | [낮음] 문서 | **수정.** `GANTT.md` §6 에 서버 판정 권한 주체·`fetchGanttGraph` 본인 자격 1줄. `Moves_Workforce_데이터모델_ERD.md`(git 미추적) project 3컬럼(ERD·상세표), KVS 직접 키 `Collab:` 3종, 변경 이력 v1.5 | 문서 2개 | – |

### 8-1. `getProjectCollabCoverage` 새 계약 (글자 그대로)

입력 `{ project_id }`. 컨트롤러가 이제 principal 을 넘긴다.

**접근**
- `describeCollabAccess` 결과 `readAuthority === 'app'`(켜짐+참여+스코프 안) → 허용.
- `reason === 'OFF'`(꺼짐·삭제 중·미준비) + 호출자 `PROJECT write`(`isSatisfied`, admin 포함) → 허용(켜기 전 확인 창).
- 그 외는 조회 resolver 와 같은 에러(`CollabAccess.collabAccessError` 공용): 꺼짐+비쓰기 `COLLAB_MODE_OFF`, 켜짐+비참여 `COLLAB_NOT_PARTICIPANT`(쓰기 권한자여도), 스코프 밖 `PERMISSION_PROJECT_SCOPE_DENIED`, principal 없음 `PERMISSION_PRINCIPAL_UNRESOLVED`, 형식 위반 `COLLAB_INVALID_INPUT`.

**응답**
```js
{ success: true,
  spaces: [ { key: string, name: string|null, appCanBrowse: boolean|null } ],
  hiddenSpaceCount: number,
  userOnlyIssueCount: number,
  truncated: boolean }
```
- `spaces` = 호출자가 **본인 자격으로 볼 수 있는** 스페이스(본인 검색 결과 ∪ 구독 스페이스 중 본인 `mypermissions` BROWSE 가 true 인 것) — `name` 은 본인 검색의 `project.name`, 구독만 있으면 `sourceName`(없으면 키).
- 호출자가 `PROJECT write` 면 **앱 전용 스페이스**(앱 검색 결과 ∪ 구독 중 본인이 못 보는 것)도 `name: null` 로 포함, `hiddenSpaceCount: 0`.
- 그 밖에는 앱 전용 스페이스를 싣지 않고 개수만 `hiddenSpaceCount`.
- 정렬 key 오름차순, 최대 50(초과 → `truncated:true`).
- `userOnlyIssueCount` = |본인 검색 키 − 앱 검색 키|(본인 검색은 **500건** 상한이라 그 범위 안의 수).

**요청량**
- 앱 쪽 결과 `{ issueKeys, projects, truncated, perms }` 를 KVS `Collab:coverage:<projectId>` **5분** 캐시(`perms` = 앱 검색 스페이스 ∪ 구독 스페이스 상위 50개의 앱 BROWSE). 적중 시 앱 검색·앱 권한 호출 0회(캐시에 없는 호출자별 스페이스만 추가 확인, 캐시에 되쓰지 않음). 예산이 바닥난 불완전 결과는 캐시하지 않는다.
- 본인 검색 500건(5페이지), 앱 검색 2000건. 호출 1회 Jira 요청 예산 `MAX_COVERAGE_REQUESTS=100`(검색 페이지 + mypermissions 전부). 바닥나면 남은 확인은 `appCanBrowse:null`·`truncated:true`.

### 8-2. 그 밖에 바뀐 내부 계약
- `collectRangeWorklogsAsApp` → `{ items, truncated }`, `getProjectWorklogsAsApp` → `{ worklogs, truncated }`, `aggregateCollabWorklogsByDate/ByUserDate` → `{ rows, truncated }` (KVS 캐시 값도 같은 형태 — 배포 직후 옛 형태 캐시는 없다: 이 경로는 미배포).
- 대시보드 worklog 위젯 `chartData` 에 app 경로 절단 시 `truncated: true` 키가 **추가될 수 있다**(없으면 키 자체가 없음 — 기존 `capacity` 와 같은 규약).
- `CollabCoverageFetcher.appCanBrowseProject` → `canBrowseProject(key, as, budget)`(본인·앱 공용).
- `assertCollabReadAccess` 는 새 공용 `collabAccessError(result)` 로 에러를 만든다(코드 매핑 동일).

### 8-3. 보류(고치지 않음)
- 앱 집계 캐시(`Collab:Date/UserDate` 10분, `Collab:coverage` 5분)가 협업 모드 해제·참여 해제 후에도 남는다 — 다만 읽기 전에 항상 `CollabAccess` 판정을 먼저 통과해야 하므로 해제된 사용자에게 나가지는 않는다. 기존 본인 자격 캐시와 같은 수명 동작.
- 대시보드 워크로그 1,000이슈 절단이 조용한 것(기존 경로와 동일 동작). 워크로그 예산 절단만 `truncated` 로 알린다.
- `nextPageToken` 결속 — Jira 가 토큰을 JQL 에 결속하므로 서버가 조립한 JQL 과 다른 모집단으로 넘어갈 수 없다고 판단.
- `as` 인자 payload 유입 — 대시보드 서비스는 `readAuthority` 를 서버 판정값으로만 조립하고 payload 에서 읽지 않는다(구조분해 대상에 없음, `DashboardCollabAuthority.test.js` 가 payload `readAuthority:'app'` 무시 확인).
- 가드 자체의 `projectId ?? project_id` 는 전 resolver 공통 선행 문제 — 이번에는 협업 9개만 컨트롤러에서 막았다(가드 변경은 범위 밖).

### 8-4. 테스트 결과
- 루트 `npm test`: **142 스위트 / 1931 테스트 전부 통과**(직전 141 / 1896 → 신규 `ProjectCollabController.test.js` + 기존 스위트 확장 +35).
- 기존 테스트 수정: `DashboardCollabAuthority.test.js` 의 app 집계 목 반환값을 `{ rows, truncated }` 로, `DashboardCollabCacheKeys.test.js` 의 UserDate 키 기대값을 해시 형태로(둘 다 이번 작업에서 만든 테스트).

---

## 9. 2차 검수 반영 (2026-09-30)

가드(`permissionGuard.js`)·`static/ui` 는 건드리지 않았다. `CollabCoverageService` 에 조정자가 먼저 넣은 변경(`hiddenSpaceCount` = 앱 전용 스페이스 중 앱도 못 보는(false/null) 것만 셈)은 그대로 두고 그 위에 반영했다.

| # | 지적 | 처리 | 파일 | 테스트 |
|---|---|---|---|---|
| 1 | [높음] coverage 반복 호출 증폭 | ① **완성 응답**을 KVS `Collab:coverage:<projectId>:<accountId>` 에 **2분** 캐시 — 접근 판정(SQL)은 매번 하고, 적중 시 구독 조회·Jira 호출 0회. 예산 소진 응답은 캐시하지 않음. ② 앱 쪽 캐시(`Collab:coverage:<projectId>`, 5분)의 `perms` 가 **확인 대상 전부**(앱 검색 스페이스 ∪ 구독 스페이스, 상한 `MAX_APP_PERM_CHECKS=100`, 초과 시 `truncated`)를 담는다. 호출자별로 추가 확인한 키도 병합해 다시 저장(예산 소진 시 제외). ③ 호출당 예산 `MAX_COVERAGE_REQUESTS` 100 → **200**(앱 권한 100개 확인이 들어가도록). single-flight 없음 | `CollabCoverageService.js` | 사용자 캐시 적중 → Jira·구독 0회 / 키에 accountId 포함·다른 사용자 키 미기록 / 앱 캐시 적중 → 본인 검색만 / 앱 권한 캐시 70키 전부 / 100 초과 → truncated |
| 2 | [중간] 검색 페이지가 요청 예산 밖 | 예산 유틸을 `src/api/jira/util/RequestBudget.js`(`createRequestBudget`, `spendRequest`)로 분리해 공용. 캘린더: `searchCollabCalendarIssues({…, budget})` 가 페이지마다 차감 → 같은 예산을 `collectRangeWorklogsAsApp` 에 넘김. 대시보드: `getProjectWorklogsAsApp` 의 검색 루프가 같은 예산에서 차감. 호출당 상한 = `MAX_JIRA_REQUESTS(300)` 하나 | `RequestBudget.js`(신규), `CollabIssueFetcher.js`, `CollabWorklogFetcher.js`, `CollabCalendarService.js`, `CollabCoverageFetcher.js`(re-export) | 캘린더 검색 예산 2 → 2회 후 truncated·잔량 0 / 대시보드 검색이 300회에서 멈추고 truncated |
| 3 | [중간] 워크로그 원문 누적 | `collectRangeWorklogsAsApp` 가 인라인·추가 페이지를 **받는 즉시** `keep`(기간·visibility + 호출자 조건)과 `map`(축소)을 적용하고 원문 페이지를 누적하지 않는다. `map` 은 필수 인자: 캘린더 = `toCollabWorklog`, 대시보드 = 집계 최소 필드(원문 issue/worklog·comment 없음). 작성자 필터도 `keep` 으로 즉시 적용. 총량 상한은 **축소된(남긴) 항목 기준** | `CollabWorklogFetcher.js`, `CollabCalendarService.js` | 누적 결과에 `comment`·`updateAuthor`·`worklog` 없음 / 기간 밖 로그는 총량에 안 셈 / 총량·요청 상한 |
| 4 | [낮음] 작성자 해시 정규화 | `authorsCacheSegment` = sha256(JSON(`[...new Set(ids)].sort()`)), `aggregateCollabWorklogsByUserDate` 도 중복 제거 목록으로 검색 | `CollabWorklogFetcher.js` | `['b','a','a']` == `['a','b']` |

**바뀐 내부 계약** — `collectRangeWorklogsAsApp(issues, { startDate, endDate, concurrency, maxWorklogs, budget, keep, map })` → `{ items: [{ issue, worklogs: map 결과[] }], truncated }` (`maxRequests` 인자는 `budget` 으로 대체). `searchCollabCalendarIssues` 에 선택 인자 `budget`. resolver 응답 shape 는 **변경 없음**(coverage 는 1차 반영 계약 그대로).

**테스트** — 루트 `npm test`: **142 스위트 / 1941 테스트 전부 통과**(직전 1931 → +10).
