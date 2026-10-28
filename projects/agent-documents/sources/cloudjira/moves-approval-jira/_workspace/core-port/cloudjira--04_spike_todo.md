# core-port 플랫폼 실측 목록 (미검증)

> 작성: backend-engineer · 2026-10-03. 구현은 되어 있고 배포 후 확인이 필요한 것. 리더가 모든 에이전트 완료 후 배포 회차에 확인한다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값·DB 상태로 본다.

| # | 항목 | 코드 위치 | 영향 | 확인 방법 | 실패 시 동작 |
|---|---|---|---|---|---|
| U1 | `GET /rest/api/3/mypermissions?issueId=&permissions=BROWSE_PROJECTS,EDIT_ISSUES` 가 asUser 로 이슈 보안 수준까지 반영하는가. 쉼표가 `%2C` 로 인코딩돼도 받는가 | `permission/JiraPermission.js#getMyPermissions` | `{issue}` 가드 전체, 상세·결정의 canView | 보안 수준 걸린 이슈를 비권한 사용자로 `getIssueApproval({issueId})` → `PERMISSION_ISSUE_VIEW_DENIED`. 권한자는 통과 | 빈 Set → 전부 거부(fail-close) |
| U2 | `POST /rest/api/3/permissions/check` 요청 `projectPermissions[0].issues`(숫자 배열) 상한, 응답 `projectPermissions[].permission==='BROWSE_PROJECTS'` 의 `issues` 경로 | `JiraPermission.js#checkBrowse` (100개씩) | 업무함·알림 가시성(불변식 7) | 업무함에 못 볼 이슈 1건 섞어 두고 `listInbox` 결과에서 빠지는지. 응답 형식이 다르면 목록이 **전부 비는** 쪽으로 실패한다 | 빈 목록(fail-close) |
| U3 | `POST /rest/api/3/issue/bulkfetch {issueIdsOrKeys, fields:['summary','project']}` 100건 상한·scope·응답 `issues[]` | `JiraPermission.js#bulkFetch` | 표시 메타만 | 업무함 제목·이슈 키·프로젝트명이 뜨는지 | 메타 없음 → 제목 null·스냅샷 키 |
| U4 | `GET /rest/api/3/user/viewissue/search?issueId=&accountId=&maxResults=1` 로 타 사용자 열람 판정 | `JiraPermission.js#userCanViewIssue` | 정책 `approverAccessCheck` | 이슈를 못 보는 사용자를 결재선에 넣어 `createIssueApproval` → `APPROVER_NO_ACCESS` | null → 통과(기존 규칙) |
| U5 | `permissions/check` 에 accountId 지정은 Jira 관리자 전용인가 | (미사용, U4 대안 불가 근거) | — | 일반 사용자 asUser 호출 응답 | — |
| U6 | `groups/picker`·`group/bulk`·`group/member?groupId=`·`group/member?groupname=` 가 일반 사용자에게 열리는가 | `DirectoryService`, `ApprovalService#loadGroupMembersByName`, `#searchDirectory` | 그룹 결재선 확장, 승인 그룹 설정 | 일반 사용자로 `group:<이름>` 단계 요청 생성 | 멤버 0명 → `INVALID_APPROVER_CONFIGURATION`. 그룹 검색 403 은 사용자 검색만 살린다 |
| U6b | `group/member` 의 `groupname` 파라미터(deprecated)가 아직 동작하는가 | `ApprovalService#loadGroupMembersByName` | 결재선 `group:<이름>` 확장 | 위와 같음 | 위와 같음. 막히면 이름→groupId 변환(`group/bulk?groupName=`) 후 `groupId` 로 바꿀 것 |
| U7 | `GET /rest/api/3/user/bulk?accountId=a&accountId=b&maxResults=50` 반복 파라미터(route strings 배열) | `DirectoryService#resolveUsers`, `RequestJira#repeatedQueryRoute` | 이름 표시 | 30명 결재선 상세에서 이름 전원 표시 | 이름 대신 accountId |
| U8 | Jira globalPage 에서 `new Modal({resource:'main/modal'})` | frontend | 상세·결정 | 업무함 행 클릭 | — |
| U9 | Jira globalPage 에서 `view.createHistory()` | frontend | 탭 URL 동기화 | 탭 전환 후 새로고침 | — |
| U10 | `jira:globalPage` route·layout·패딩 | manifest(route 미지정) | 화면 여백 | 육안 | — |
| U11 | scope `read:jira-work`·`read:jira-user` 로 위 API 가 모두 되는가 | `manifest.yml` | 모든 Jira 호출 | `forge lint` + 배포 후 각 화면 1회 | 403 → 각 경로 fail-close |
| U12 | Jira `avatarUrls['48x48']` 절대 URL 이 iframe `<img>` 로 뜨는가 | 사용자·프로젝트 DTO | 아바타 | 육안 | 이니셜 |
| U13 | `jira:adminPage` 가 Jira 관리자에게만 보이는가, manager 진입 동선 | manifest | 설정 진입 | manager 로 등록한 비관리자 계정 | — |
| U14 | `GET /rest/api/3/project/search?startAt=&maxResults=50&query=&orderBy=name` 응답 `values/isLast/startAt`, 빈 `query=` 허용 | `SettingsService#listProjects` | 설정 프로젝트 탭 | 설정 화면 프로젝트 목록·검색·다음 페이지 | 목록 비어 보임 |
| U15 | `GET /rest/api/3/project/{projectKey}` 로 업무함 프로젝트 필터 키→id 확인 | `InboxService#resolveProjectId` | 업무함 프로젝트 필터 | 키 입력 후 결과가 그 프로젝트로 좁혀지는지, 없는 키는 빈 결과 | 빈 결과(fail-close) |
| U16 | `GET /rest/api/3/issue/{id}?fields=summary,project` 응답의 `fields.project.avatarUrls` | `JiraPermission#loadIssue` | 요청 생성(describe), 상세 target | `createIssueApproval` 성공 + 상세 target 의 projectKey/Name | 생성은 `INVALID_TARGET`, 상세는 스냅샷 |

## 프론트 미검증 (02_frontend_report.md 에서 합침 — core-port 마감 2026-10-03)

| # | 확인할 것 | 위치 | 실패 시 |
|---|---|---|---|
| F1 | Jira `globalPage`·`adminPage`·`projectSettingsPage` 바깥 여백(U10 과 함께) | `app/AppShell.jsx`·`appShell.css` | 여백 이중/부족 — CSS 보정 |
| F2 | `new Modal({context})` 컨텍스트 위치·첫 `getContext` 공백 재현 여부 | `entries/modal.jsx` | 재시도 로직 유지(현재 유지 중) |
| F3 | `router.navigate('/browse/KEY')` 이동 | 업무함·상세 이슈 링크 | 링크 무반응 |
| F4 | `view.getContext().siteUrl` 이 Jira 에서 오는가 | 증명서·링크 | 절대 링크 깨짐 |
| F5 | Jira 프로젝트 아바타 URL 이 iframe `<img>` 로 뜨는가(U12 와 함께) | 프로젝트 칩 | `PersonAvatar` 이니셜 |
| F6 | `listInbox` 의 `projectKey` 대문자 정규화가 `GET /project/{key}` 와 맞는가(U15 와 함께) | `InboxService#resolveProjectId` | 빈 결과 |

## 검증 권고 (03_verify_report.md R1~R6 — 후속)
- R1 `getFlow` 에 `projects:[{id,key,name,avatarUrl}]` 보강(Flow 칩 id 노출) — 백엔드
- R2 증명서 프로젝트 이름 보강(열람 확인 후 이슈 1회 조회, 실패 시 스냅샷) — 타임시트 증명서 설계 때 함께 결정
- R3 `JiraPermission.js:59-69` invocation 캐시 누락(권한 API 2회 호출) — 다음 백엔드 회차에 함께
- R5 커밋 회차: 이름 변경 5건은 옛 경로가 스테이지에 남고 새 파일이 untracked — 커밋 시 함께 추가
- R6 `exportRetentionExcel.js:80-81` 열 이름 영문 하드코딩 — 경미
- `_workspace/core-port/tmp/locales_port.py` 는 core-port 커밋 뒤 삭제 권장(재실행 시 locale 덮어씀)
