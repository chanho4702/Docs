# RFC-220 검토 F1·F2·F3 수정 구현 보고 (2차 — 리더 보강 1·2·3 반영)

> 2026-10-28 · 설계 `04_fix_design.md` · 결함 `03_verify_report.md` · 브랜치 RFC-220(커밋·배포·forge 안 함)
> 2차 보강: ① 이슈 키 경로 연결·스코프 판정 ② 내 작업 화면 selfOnly 회귀 제거 ③ 제한 행 asUser fallback

## 1. 결과 요약

| 검사 | 결과 |
|---|---|
| 재현 케이스 `npm.cmd test -- --runInBand --testMatch '**/_workspace/rfc220-review/*.case.js'` | **5/5 통과**(대조군 1 + F3 캘린더·F3 프로젝트 기록·F1 진척도·F2 협업 집계) |
| 백엔드 전체 `npm.cmd test -- --runInBand` | **194 suites / 2,661 tests 전부 통과**(수정 전 187 / 2,616 → 새 suite 7, 새 test 45. 미추적 `LeaderTeamBackfill.test.js` 포함 실행) |
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
