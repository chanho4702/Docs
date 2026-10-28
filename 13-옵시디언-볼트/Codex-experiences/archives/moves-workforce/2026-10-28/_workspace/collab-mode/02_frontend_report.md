# 협업 모드 — 프론트엔드 구현 보고서

> 작성 2026-09-30 · 기준 `develop` `50bc649` + 작업 트리(미커밋) · 설계 `01_architect_design.md`(§3·§5·§7·§8·§9-2·§12-3) · 백엔드 실제 shape `02_backend_report.md` §2
> 범위: M1 · M2 프론트 · M3 프론트 · M4 프론트 · M6 · §12-3. 백엔드(`src/`)·manifest 무수정, git commit 없음.

---

## 1. 변경·추가 파일

### 신규
| 파일 | 내용 |
|---|---|
| `static/ui/src/utils/queryKey/collabKeys.js` | `collabKeys.access(pid)` = `['projectCollab','access',pid]`, `collabKeys.coverage(pid)`, `invalidateCollabScopedViews(qc, pid, {includeAccess})` |
| `static/ui/src/hooks/useProjectReadAuthority.js` | 분기 단일 출처. staleTime 30s·포커스 재조회·retry 없음. 실패 → `'user'` + `isReady:true`. 값 전환 시 모듈 단위 메모로 **1회만** `invalidateCollabScopedViews`(access 제외) |
| `static/ui/src/hooks/useProjectCollabCoverage.js` | `getProjectCollabCoverage` 조회(staleTime 5분) + `summarizeCoverage`(restricted/unknown/userOnly/hasWarning) |
| `static/ui/src/utils/collab/collabErrors.js` | `invokeCollab`(success:false 승격, `COLLAB_MODE_OFF`/`COLLAB_NOT_PARTICIPANT` 이면 `onAccessLost`), `readAuthorityOf(qc,pid)`, `collabWriteMessage(t, code, authority)` |
| `static/ui/src/components/collab/CollabModeNotice.jsx` | 배지(틸 style Lozenge / 경고 시 `appearance="moved"`) + Popup 안내 4줄 + 범위 상세. `'app'` 일 때만 렌더 |
| `static/ui/src/components/collab/CollabCoverageDetails.jsx` | 제한 스페이스(앱 접근 권한 없음 + 관리자 안내)·확인 못 한 스페이스·본인 전용 N건·전부 보임·절단·조회 실패 문구 — 확인 창과 배지가 공유 |
| `static/ui/src/components/collab/CollabModeSetting.jsx` | ProjectModal 협업 모드 토글 섹션(즉시 적용·켤 때만 확인 창·coverage 선조회) |
| `locales/kr/collab.json`, `locales/en/collab.json` | `collab.*` 네임스페이스 |
| 테스트 | `hooks/__test__/collabReadAuthority.test.js`(F4·F5·F8), `pages/projectDetail/issue/__test__/workListCollab.test.js`(F1·F2·F3), `components/collab/__test__/collabUi.test.jsx`(F6·F7·§12-4) |

### 수정
| 파일 | 내용 |
|---|---|
| `utils/queryKey/projectKeys.js` | `workListKeys.summary/groupPage/groupSkeleton/groupHierarchyPage` 마지막 인자 `authority` — `'app'` 일 때만 끝에 `'app'`(그 외 기존 키 바이트 동일). `projectKeys.issueWorklogs(key, authority, pid)`, `issueWorklogsAll()`, `dashboardItemsOf(pid)` |
| `utils/queryKey/logicalAuditKeys.js` | `calendarKeys.projectWorklogs({…, readAuthority})` — `'app'` 일 때만 객체에 포함 |
| `pages/projectDetail/issue/workListQuery.js` | `summarizeIssues`(그룹·타입 옵션 규칙 한 곳), `toCollabFilter`, `fromCollabSummary` |
| `pages/projectDetail/issue/useWorkListQueries.js` | 4훅이 `useProjectReadAuthority` 로 경로 선택 + `isReady` 전 미조회. 협업 페처 4개 export(`fetchCollabWorkList*`) |
| `issue/useWorkListFlatPage.js`, `issue/useWorkListHierarchy.js` | 캐시 패치 키(`patchQueryKey`)에 같은 authority 를 넣음(안 넣으면 편집 반영이 빗나감) |
| `calender/useProjectCalender.js` | 경로 선택(`getCollabCalendarWorklog` / 기존) + 키에 readAuthority, 협업 응답 작성자 아바타 `16x16` 보정 |
| `calender/ProjectCalender.jsx` | 필터 바 오른쪽에 배지, 워크로그 모드에서 `truncated` 경고(`collab.truncated`) |
| `work/useIssueWorklogs.js` | `useIssueWorklogs(issueKey, projectId)` 경로 선택 |
| `work/TreeDetailPanel.jsx`, `work/ProjectTreeView.jsx`, `work/map/IssueMapDrawer.jsx`, `work/map/MapWorklogTab.jsx`, `work/map/ProjectIssueMapView.jsx` | `projectId` 전달(워크로그 호출 3곳) + 트리 상세 연관관계 섹션에 `collab.notice.relationsUserOnly` 1줄(app 일 때) |
| `work/ProjectWorkPanel.jsx` | 뷰 토글 옆 배지 |
| `dashboard/DashboardPage.jsx` | 헤더 버튼 영역 배지 |
| `ProjectDetailPage.jsx` | 진입 시 `useProjectReadAuthority(id)` 선조회 |
| `project/modal/ProjectModal.jsx` | 수정 모드에서만 `<CollabModeSetting>` |
| `gantt/useGanttMutations.js` | 일정·상위·선후행·담당자·협업자·MD onError 에서 `collabWriteMessage` 우선 |
| `gantt/useGanttFolderMutations.js` | 이슈 폴더 지정(공통 팩토리)·`moveGanttIssueToFolder` onError 동일 |
| `project/modal/__test__/ProjectModal.test.jsx` | 수정 모드에서만 섹션·즉시 적용 분리 테스트 1건 추가 |
| 문서 | `Moves_Workforce_아키텍처_설계서.md` §4.4 ⑥(git 미추적), `CLAUDE.md` 「Jira API」 1항목(**gitignore 대상** — 로컬 파일만 갱신됨), `WORK_VIEWS.md` §1-3 1줄 |

---

## 2. 소비하는 응답 shape와 접근 경로 (backend §2 기준)

| resolver | 입력(실제 payload) | 접근 경로 |
|---|---|---|
| `getProjectCollabAccess` | `{ projectId }` | `result.content.{collabMode, readAuthority, reason, changedBy, changedAt}` — `success!==true` 또는 content 없음 → throw → 훅이 `'user'` |
| `setProjectCollabMode` | `{ project_id, enabled: boolean }` | `result.content.{collabMode, changedBy, changedAt}` 로 access 캐시 선패치 후 무효화 |
| `getCollabWorkListSummary` | `{ projectId, filter: CollabFilter }` | `result.content` → `fromCollabSummary({rows, projects, issueTypeIcons, truncated})` → `{groups, issueTypeOptions, truncated}` |
| `getCollabWorkListPage` | `{ projectId, groupKey, filter, pageSize, cursor }` | `result.content.issues`, `result.content.nextPageToken`, userMap 은 클라 `resolveCoworkerUserMap` |
| `getCollabWorkListSkeleton` | `{ projectId, groupKey, filter }` | `result.content.{rows, truncated}` |
| `getCollabWorkListDetail` | `{ projectId, keys }` | `result.content.issues` → `orderIssuesByKeys` + userMap |
| `getCollabCalendarWorklog` | `{ projectId, startDate, endDate }` | **루트** `result.{data, memberTeamMap, teamMeta, truncated}` (content 없음) — 기존 `ProjectCalender` 의 `myWorklogs.data` 등 그대로 |
| `getCollabIssueWorklogs` | `{ projectId, issueKey }` | `result.content.worklogs` |
| `getProjectCollabCoverage` | `{ project_id }` | **루트** `result.{spaces, userOnlyIssueCount, truncated}` (content 없음) |

payload 에 `collabMode`·`readAuthority`·`jql` 계열 키를 싣지 않는다 — 테스트로 전 invoke 호출 payload 를 검사(F4).

### 화면 사용 필드 ↔ DTO allowlist 대조(grep)
- 목록 행(`useIssueRowFactory`·`ProjectIssueTable`·`workListTree`): `id,key`, `fields.{summary, statusCategory, issuetype.iconUrl, assignee, customfield_10015, duedate, timetracking.{original,remaining,timeSpent}EstimateSeconds, aggregateprogress.percent, parent.key}`, `properties.movesRms.coworkers` → **전부 allowlist 안**.
- 캘린더(`ProjectCalender`·`FullCalendar.renderEventContent`·`WorklogModal`): `issue.{id,key}`, `fields.{summary, status.statusCategory, issuetype.iconUrl, project.{name, avatarUrls['24x24']}, assignee, worklog.worklogs}`, 워크로그 `{id, started, timeSpent, timeSpentSeconds, comment, author}` → allowlist 안. **예외 2건**:
  1. 캘린더 칩 `AvatarStack size="xsmall"` 은 `author.avatarUrls['16x16']` 을 찾는데 DTO 는 `24x24·48x48` 만 준다 → 프론트 페처에서 `16x16 = 24x24` 로 보정(이미지 한 장을 작게 표시).
  2. `AvatarStack` 툴팁이 `author.emailAddress` 를 쓴다 → 협업 경로에서는 빈칸(이메일 줄만 빠짐). 백엔드 추가는 하지 않음(응답 최소화 경계 4 우선).
- 워크로그 패널(`WorklogHistoryList`): `author.{avatarUrls['24x24'], displayName}`, `started`, `timeSpentSeconds`, `comment` → allowlist 안.

---

## 3. 설계와 다른 점 / 정한 것

1. **쿼리 키 위치**: 리더 지시대로 `utils/queryKey/collabKeys.js`(`collabKeys.access`)에 두었다(설계 §5-4 는 `projectKeys.collabAccess = ['projectCollabAccess', pid]`). `invalidateCollabScopedViews` 도 같은 파일(순환 import 회피).
2. **켜기 확인 창**: 중첩 모달 대신 **토글 섹션 안의 인라인 확인 패널**(`role="dialog"`). 프로젝트 수정 모달 위에 모달을 한 겹 더 띄우는 포커스·스택 문제를 피했다. 범위 조회 중에는 [켜기] 비활성, 조회 실패여도 켤 수 있다.
3. **협업 쓰기 실패 코드 범위**: 설계의 `PERMISSION_*` 전체 대신 `GANTT_ISSUE_NOT_FOUND`·`JIRA_PERMISSION_DENIED`·`PERMISSION_PROJECT_SCOPE_DENIED` 셋만. `PERMISSION_DENIED`(앱 기능 권한 부족)에까지 "Jira 권한이 없어"를 띄우면 원인이 틀린 안내가 된다.
4. **배지 상세**: Tooltip 대신 클릭 Popup(안내 4줄 + 범위 상세). 경고 여부는 라벨("협업 모드 · 일부 제한")과 색으로 표시하고 상세는 눌러서 펼친다(자동으로 열지 않음). 이슈 보안 수준 안내 1줄(`badge.tooltipSecurity`) 추가.
5. **i18n 추가 키**: 설계 §7 외에 `badge.labelWarning`, `badge.tooltipSecurity`, `toggle.loadFailed`, `coverage.*`(11개). 관리자 안내에는 Jira 쪽 실제 역할명 `atlassian-addons-project-access` 를 그대로 넣었다(관리자가 찾아야 하는 이름이라 풀어 쓰지 않음).
6. **access 조회 실패 시 토글**: 비활성 + "설정을 불러오지 못했습니다"(꺼짐으로 오인하지 않게).
7. **캘린더 `truncated`**: 워크로그 모드에서 `SectionMessage` 경고 1줄로 표시(설계는 키만 정의).
8. **목록 요약 규칙 공유**: `fromCollabSummary` 가 원문 모양으로 복원해 `summarizeIssues`(기존 `buildGroups`+`deriveIssueTypeOptions`)를 그대로 쓴다. `fetchWorkListSummary` 도 같은 함수로 바꿨다(결과 동일).
9. **`GANTT.md` 1줄**은 `src/resolver/gantt/` 아래라 이번 범위(백엔드 무수정)에서 제외.

---

## 4. 쓰기 동작 확인(§5-7)

| 화면 | 확인 결과 | 변경 |
|---|---|---|
| 목록 인라인 편집·협업자·일괄 적용/제외·추가 | 전부 브라우저 본인 경로 또는 본인 검증 resolver — 조회 경로 분기와 무관, 코드 무변경. 쓰기 직후 `searchByIssueId`(본인 `getIssue`) 실패 시 `patchIssueByKey` 무동작 → 행 유지 | 없음(캐시 패치 키만 authority 포함) |
| 트리·간트 | `collabWriteMessage` 로 협업 문구 1종 우선 | onError 8곳 |
| 캘린더 드래그·모달 | 브라우저 본인 `updateWorklog` — 기존 실패 토스트 | 없음 |
| 대시보드 | DB 쓰기 | 없음 |

---

## 5. 테스트·빌드 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm run merge` | 성공 — `ko-KR.json`/`en-US.json` 에 `collab` 네임스페이스만 추가(각 +49줄, 다른 키 변화 없음) |
| 착수 전 `npx jest` | 126 스위트 / 2031 테스트 통과 |
| 최종 `npx jest` | **129 스위트 / 2065 테스트 전부 통과**(신규 3 스위트 + ProjectModal 1건, +34 테스트). `queryKeyContract.test.js` 통과(인라인 키 없음) |
| `CI=true npm run build` | **성공**. bundle:check main gzip 481,652B / 예산 950,000B, panel 329,314B / 350,000B |

테스트 대응: F1·F2·F3 `workListCollab.test.js` / F4·F5·F8 `collabReadAuthority.test.js`(목록 4경로·캘린더·워크로그 패널 app/user, 판정 전 미조회, `COLLAB_MODE_OFF` 시 access 무효화, payload 에 jql·collabMode 없음, 전환 무효화 1회) / F6·F7·§12-4 `collabUi.test.jsx`(app 일 때만 배지, 경고 전환, 조회 실패 시 기본 모양, 켜기 확인 창에 제한 목록, 실패해도 켤 수 있음, 끄기 즉시·실패 원복, canWrite false 비활성) / ProjectModal 수정 모드 한정.

---

## 6. 확인하지 못한 것

1. **실화면(Forge) 렌더** — Popup·Lozenge style·Toggle 실제 모양, 다크 모드 대비(틸 배지 흰 글자). jsdom 테스트는 mock 컴포넌트 기준.
2. **칸반 카드 모달의 목록**(`ProjectIssuePanel context="kanban"`)도 같은 훅을 쓰므로 협업 모드가 적용된다. 프로젝트 상세 밖이라 배지는 없다(의도 여부 확인 필요 — 서버 판정이 같아 권한 문제는 없음).
3. 목록 **스페이스 필터 옵션**·캘린더 **이슈 필터 셀렉트**는 본인 검색이라 못 보는 스페이스·이슈가 옵션에 안 나온다(설계 §11-9 한계 그대로).
4. 협업 경로 캘린더 칩 툴팁의 작성자 이메일 공란(§2 예외 2).
5. E2E(설계 §9-3 E1~E6) 전 항목 미수행.

---

## 7. 검증 반영 (03_verify_report · 외부 검수, 2026-09-30)

| # | 지적 | 처리 | 파일 |
|---|---|---|---|
| 1 | 칸반 카드 모달 목록에 배지 없음(X3) | 적용 유지 + 모달 설명 줄 오른쪽에 `CollabModeNotice` | `pages/projectKanban/modal/Issue/ProjectIssuePanelModal.jsx` |
| 2 | coverage 계약 변경 | `hiddenSpaceCount` 소비(개수만 `collab.coverage.hiddenSpaces`, 경고 조건에 포함), `name:null` 은 키만 표시, 확인 창 조회는 `canWrite` 일 때만(`enabled: confirming && canWrite`), 배지 조회는 기존대로 `'app'` 일 때만, `COLLAB_MODE_OFF` 거부는 범위 절을 **조용히 생략**(`isCoverageSilenced`) | `hooks/useProjectCollabCoverage.js`, `components/collab/CollabCoverageDetails.jsx`·`CollabModeNotice.jsx`·`CollabModeSetting.jsx`, `locales/kr|en/collab.json` |
| 3 | 접근 상실 코드 보강(검수 9) | `COLLAB_ACCESS_LOST_CODES` 에 `PERMISSION_PROJECT_SCOPE_DENIED` 추가 → access 재조회 | `utils/collab/collabErrors.js` |
| 4 | 캘린더 협업 경로가 coworker 필드 조회를 기다림(검수 10) | `enabled` 를 `readAuthority === 'app' \|\| isCoworkerFieldReady` 로 분리 — 필드 조회 실패여도 협업 캘린더는 열린다 | `pages/projectDetail/calender/useProjectCalender.js` |
| 5 | 작성자 이메일 공란(X4) | DTO 에 넣지 않음을 "의도적 제외"로 문서화. 툴팁은 이미 이메일이 없으면 그 줄을 그리지 않는다(`AvatarStack`: `email ? name·email : name`, `FullCalendar` 칩 툴팁엔 이메일 없음) → 코드 변경 없음 | `01_architect_design.md` §3 공용 타입 아래, `WORK_VIEWS.md` §1-3 |

새 coverage 응답 접근 경로: 루트 `result.{spaces[{key, name|null, appCanBrowse}], hiddenSpaceCount, userOnlyIssueCount, truncated}`.

테스트: `components/collab/__test__/collabFollowup.test.jsx` 6건 — 칸반 모달 배지 / name:null·hiddenSpaceCount 표시·경고 / COLLAB_MODE_OFF 조용히 생략 / canWrite false 면 coverage 미호출 / SCOPE_DENIED 재판정 / coworker 필드 조회 실패에도 협업 캘린더 조회.

| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공 — `collab.coverage.hiddenSpaces` 반영 |
| `npx jest` | **130 스위트 / 2071 테스트 전부 통과** |
| `CI=true npm run build` | 성공(경고는 node_modules 소스맵 누락뿐, 기존과 동일). main gzip 481,651B / 950,000B, panel 329,314B / 350,000B |

미확인: 백엔드 coverage 새 계약·접근 규칙은 동시 수정 중이라 실제 응답과의 대조는 백엔드 반영 후 verifier 확인 필요.
