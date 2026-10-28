# core-port 프론트 보고서

> 작성: frontend-engineer · 2026-10-03 · 회차 1(초회, autopilot Phase 4)
> 입력: `01_architect_design.md` §2·§7·§8·§11.2, **`02_backend_report.md`(실제 shape 우선)**
> 범위: `static/ui/**`, `locales/kr·en/**`. `src/**`·`manifest.yml` 미변경(manifest 는 백엔드가 이미 4 엔트리로 맞춰 둠). git 인덱스 미조작(삭제는 `rm`, 신규는 untracked).

## 검증 결과

```
npm run merge                      → locales/ko-KR.json, en-US.json 생성(성공, kr·en 키 집합 동일)
npm run test:ui -- --runInBand     → Test Suites: 8 passed, 8 total / Tests: 58 passed, 58 total
npm run build:ui                   → Compiled with warnings (전부 node_modules: @atlaskit source map ENOENT,
                                     @atlaskit/react-select postcss-calc). 우리 소스 ESLint 경고 0.
                                     산출 html: inbox / modal / settings / projectSettings
npm test -- --runInBand (백엔드)    → Test Suites: 26 passed, 26 total / Tests: 215 passed, 215 total
```
UI 기준선 10 suites → 8: `features/region/__test__/{RegionInline,regionHashClient}` 삭제분. InboxTable 테스트에 2건 추가(이슈 key 없으면 링크 없음, 프로젝트·유형 열).

## 엔트리 (3곳 일치)

| 엔트리 | craco ENTRIES | public html | manifest `resources[].entry` |
|---|---|---|---|
| modal | O | O | O |
| inbox | O | O | O (`jira:globalPage`) |
| settings | O | O | O (`jira:adminPage`) |
| projectSettings | O (신규 `entries/projectSettings.jsx`) | O (신규) | O (`jira:projectSettingsPage`) |
| macro · stamp · feed | 삭제 | 삭제 | 없음(백엔드가 이미 제거) |

`public/index.html` 주석의 엔트리 목록도 4개로 고침. `@forge/confluence-bridge` 는 `npm uninstall` 로 package.json·lock 에서 제거(네트워크 정상).

## 소비하는 resolver 와 접근 경로 (백엔드 보고서 shape 기준)

| 화면 | resolver · 입력 | 읽는 필드 |
|---|---|---|
| modal (requestId 있음) | `getApprovalDetail({requestId})` | `approval`, `target{kind,issueId,issueKey,title,projectId,projectName,revision}`, `canRequest`, `pin` |
| modal (requestId 없음, issueId 만) | `getIssueApproval({issueId})` — **진입점 없음(Q1)**, `context.extension.issue.id` 도 후보로 읽음 | 위와 동일 |
| modal 요청/재상신 | `getRequestDefaults(projectId ? {projectId} : {})` → `createIssueApproval({issueId, steps, flowId, expiresAt, requestMessage, ccKeys, supersedes})` | `{defaultDeadlineDays, flows, approvalGroups}` / `{requestId}` |
| ApprovalDetail 이력 | `getApprovalHistory({requestId})` | `items[].{requestId,status,requesterKey,createdAt,contentVersion,events}` |
| 증명서 PDF | `getApprovalCertificate({requestId})` | `target`(스냅샷), `targetKind`, `contentHash`(null 이면 지문 섹션 생략), `contentVersion/currentVersion`(revision 없으면 행 생략) |
| inbox 목록·엑셀 | `listInbox({tab, filters:{…, projectKey}})` | `target_kind`, `issueKey/issue_key`, `issueId/issue_id`, `title/title_norm`, `projectName`, `projectKey`, `projectAvatarUrl`, `request_id` |
| inbox → 모달 | `new Modal({resource:'main/modal', context:{intent, requestId, issueId}})` | — |
| 알림 | `listNotifications` | `templateKey`, `vars`, `title`, `issueKey`(링크) |
| 설정 · 적용 프로젝트 | `listProjects({q,cursor})`, `setProjectEnabled({projectId,enabled})` | `items[].{id,key,name,avatarUrl,enabled}`, `configured`, `openCount` |
| 설정 · 프로젝트 정책 | `getProjectPolicy({projectId})`, `saveProjectPolicy({projectId,patch})` | `overridableKeys, global, override` |
| 설정 · Flow | `createFlow/updateFlow({…, projectIds})`, 프로젝트 선택지는 `listProjects` | `flow.projectIds` |
| 설정 · 정책 | `get/saveApprovalSettings` | `approverAccessCheck`(구 approverSpaceCheck). `commentNotifyEnabled`·`stampBoxAutoInsert` 송신 중단 |
| 설정 · 승인 그룹 | `create/updateApprovalGroup({type:'JIRA'|'CUSTOM'})` | 기본 유형 `'JIRA'` |
| 보관 엑셀 | `exportExpiredApprovals` | `requests[].{targetKind,targetKey,issueKey,targetTitle,projectId,…}` |

프론트가 호출하는 resolver 57종(리터럴 53 + MemberListSettings 의 listApprovers·setApprovers·listManagers·setManagers)을 `src/permission/PermissionMap.js` 와 대조 — 전부 선언되어 있음. 제거된 8종(`getPageApproval`·`createApproval`·`getRegionApproval`·`createRegionApproval`·`listSpaces`·`getSpacePolicy`·`saveSpacePolicy`·`setSpaceEnabled`) 호출 0건. `listAvailableFlows` 는 프론트가 쓰지 않는다(요청 폼은 `getRequestDefaults.flows` 사용 — 기준선과 동일).

## 변경 파일

**삭제**: `entries/{macro,stamp,feed}.jsx`, `public/{macro,stamp,feed}.html`, `features/region/**`(7), `features/stamp/StampMacro.jsx`, `components/StampBox.jsx`, `app/useMacroViewport.js`, `features/settings/{SpaceSettings,SpacePolicyModal}.jsx`, `components/PageLink.jsx`, `locales/{kr,en}/{banner,space,macro}.json`

**신규**: `components/IssueLink.jsx`(`/browse/{issueKey}`, key 형식이 아니면 링크 없이 텍스트), `features/settings/{ProjectSettings,ProjectPolicyModal}.jsx`, `entries/projectSettings.jsx`(정적 안내, resolver 호출 없음), `public/projectSettings.html`, `locales/{kr,en}/{state,project}.json`

**수정**: `craco.config.js`, `package.json`(+lock), `public/index.html`(주석), `entries/{modal,inbox}.jsx`, `utils/queryKey/approvalKeys.js`(`page`·`region` 삭제, `issue(issueId)` 추가, `history(requestId)`, `settingsKeys.projects(params)`·`projectPolicy(projectId)`, `requestKeys.defaults(projectId)`), `features/detail/ApprovalDetail.jsx`(`page`→`target`, Confluence diff 링크 삭제, revision 없으면 버전 표시 생략, 제목 아래 IssueLink·프로젝트명), `features/request/{RequestForm,ApprovalLineEditor,approverOptions}`(`createIssueApproval`, 결재란 옵션 삭제, `confluenceGroupOption`→`jiraGroupOption`), `features/inbox/{InboxPage,InboxTable,InboxFilters,inboxUrl,exportInboxExcel}`(+테스트 2), `features/notification/NotificationPanel.jsx`, `features/certificate/{CertificateSheet,exportCertificatePdf}`, `features/approval/{ApprovalStatus.jsx,deadline.js}`(`banner.`→`state.`), `features/settings/{SettingsPage,PolicySettings,FlowFormModal,GroupFormModal,GroupSettings,DirectoryPicker,ManagerSettings,AuditSettings,DataSettings,exportRetentionExcel}`(+`__test__/DirectoryPicker.test.jsx`), 주석만: `app/{AppShell.jsx,appShell.css,useSiteUrl.js}`, `components/{PersonAvatar.jsx,table/ColumnResizeOverlay.jsx,table/useStableColumnWidths.js}`

locale 변환은 `_workspace/core-port/tmp/locales_port.py`(재실행해도 같은 결과)로 했고 CRLF·키 순서를 유지했다.

## i18n

- 네임스페이스: `banner`→`state`(소비처가 쓰는 키만: `status.*`, `badge.overdue`, `deadline.*`, `progress.*`, `pill.none`, `pill.reapproval`, `panel.editedAfterApproval`), `space`→`project`(+`placeholder.{title,body,openGlobal}`), `macro` 삭제.
- `error.json`(kr·en): 추가 `PERMISSION_ISSUE_VIEW_DENIED`, `PERMISSION_ISSUE_EDIT_DENIED`, `PERMISSION_PROJECT_ADMIN_REQUIRED`, `PERMISSION_TARGET_VIEW_DENIED`, `JIRA_API_FAILED`, `GROUP_NAME_CONFLICT`, `LAST_MANAGER_REQUIRED` / 삭제 `PERMISSION_PAGE_VIEW_DENIED`, `PERMISSION_PAGE_EDIT_DENIED`, `CONFLUENCE_API_FAILED`, `REGION_ID_MISSING`, `REGION_ID_DUPLICATED`, `REGION_CHANGED`, `SPACE_NOT_ENABLED`, `SQL_EXECUTION_ERROR`. **결과: error.json 키 집합 = `ErrorCodes` 값 집합(34개) 정확히 일치.** 값 수정: `PERMISSION_DENIED`·`PERMISSION_ADMIN_REQUIRED`(Jira 관리자), `INVALID_TARGET`·`ALREADY_DECIDED`·`CONCURRENT_MODIFICATION`("화면을 새로 고친 뒤"), `APPROVER_NO_ACCESS`.
- 키 이름 변경: `common.action.openPage→openIssue`, `common.column.{document→target, space→project}` + `issueKey` 추가, `filter.{space→project, spacePlaceholder→projectPlaceholder, allSpaces→allProjects, tag.space→tag.project}`, `inbox.type.{page,region}→issue`, `request.{pageHint→issueHint, pageTitle→issueTitle, pageDialogTitle→issueDialogTitle}`, `cert.field.{document→subject, space→project, pageId→issueKey, target→targetKind}`, `cert.target.{page,region}→issue`, `manager.confluenceAdmin→jiraAdmin`, `policy.approverSpaceCheck→approverAccessCheck`, `policy.groups.modal.{type.confluence→type.jira, confluenceHint→jiraHint}`, `policy.settings.tab.space→project`, `policy.flows.form.spaces*→projects*`, `policy.audit.area.space→project`.
- 삭제: `policy.{commentNotifications,stampBoxAutoInsert,groups.admin,groups.modal.confluence}`, `request.{insertStampBox,insertStampBoxHint,reason.regionRemoved}`, `notification.comment`(CommentNotifier 전용), `detail.compare`, `cert.fingerprintMissing`.
- **기준선 누락 보강**: 코드가 쓰는데 사전에 없던 `common.error`, `policy.groups.select`, `policy.groups.unselect` 를 kr·en 에 추가(화면에 키 문자열이 그대로 찍히던 결함).
- 정적 대조: `static/ui/src` 의 리터럴 번역 키·템플릿 접두사를 `ko-KR.json` 과 대조 → 누락 0(오탐 `error.name/code` 제외).

## 설계와 다른 점 · 판단

1. **modal 은 intent 와 무관하게 먼저 조회한다.** 요청 폼이 `getRequestDefaults({projectId})` 를 부르려면 `target.projectId` 가 필요한데, 업무함 컨텍스트에는 projectId 가 없다. 그래서 `requestId`→`getApprovalDetail`, 없으면 `issueId`→`getIssueApproval` 로 먼저 받고 `target` 에서 issueId·projectId 를 꺼낸다. 대상이 ISSUE 가 아니면 요청 폼 대신 `error.INVALID_TARGET` 을 보인다(다음 기능의 대상 종류 대비).
2. **리비전 없는 대상의 버전 표시 숨김.** 백엔드가 ISSUE 에 `target.revision:null`, 이벤트 `contentVersion:0` 을 준다. 그대로 그리면 상세·이력·증명서 모든 줄에 "v0" 가 찍혀 `target.revision != null` 일 때만 버전을 그린다.
3. **증명서**: `target` 이 저장 스냅샷이라 `projectName/projectKey` 가 null → 프로젝트 행은 `projectName || projectKey || projectId` 순, 셋 다 없으면 행 생략. 파일 이름 `approval-certificate-{issueKey|requestId}.pdf`, PDF creator `Moves Approval for Jira`.
4. **Flow 프로젝트 선택**: 서버가 id 만 저장하므로, 이번 세션에서 `listProjects` 로 본 프로젝트를 기억해 칩 이름으로 쓴다. 첫 50개 밖에 있는 저장된 프로젝트는 검색 전까지 id 로 보인다(아래 백엔드 요청 1).
5. **업무함 프로젝트 필터**: URL 파라미터 `space`→`project`, 서버에는 `filters.projectKey` 를 대문자로 보낸다. `lockedSpaceKey`(스페이스 페이지 진입) 개념은 Jira 에 대응 진입점이 없어 삭제.
6. `inbox.jsx` 부트스트랩에서 쓰지 않게 된 `view.getContext()` 호출을 뺐다(스페이스 key 읽기 용도뿐이었다).
7. 설정 탭 키 `spaces`→`projects`, 표 열 키 `document/space`→`target/project`(열 너비 저장소가 키 기준이면 기존 사용자 너비가 초기화될 수 있으나 미배포라 영향 없음).

## 완료 grep

- `grep -rni "confluence\|pageId\|spaceKey\|byline" static/ui/src` → 5줄, 전부 **"Confluence 판 실측" 이력 주석**(왜 그 방어가 있는지의 근거라 남김): `app/appShell.css:5`, `app/AppShell.jsx:9`(호스트 바깥 패딩 실측), `components/PersonAvatar.jsx:7`(쿠키 의존 아바타), `entries/modal.jsx:31,199`(모달 컨텍스트 위치·첫 getContext 공백 — Jira 에서 미검증이라 재시도 유지).
- `grep -rn "banner\.\|'space\.\|macro\." static/ui/src` → Atlaskit 토큰 `token('space.100')`·xcss `'space.200'` 오탐만(10줄). 번역 키 0.
- `grep -rni "page_id\|space_key\|regionId\|stampBox\|resource_type\|CONTENT_REGION" static/ui/src` → 0.
- locales: `confluence|스페이스|페이지|매크로` → 0(페이지네이션 문구 제외).

## 백엔드 요청 · 계약 메모

1. **[백엔드 요청] Flow 의 프로젝트 이름**: `getFlow`/`listFlows` 가 `projectIds` 만 준다. 설정 화면이 이름을 보이려면 `listProjects` 첫 페이지에 그 프로젝트가 있어야 한다. `getFlow` 에 `projects:[{id,key,name,avatarUrl}]` 를 보강하면 화면이 id 를 노출하지 않는다(현재는 id 폴백, 임의 가공 안 함).
2. **[백엔드 요청·경미] 증명서 프로젝트 이름**: 스냅샷만 써서 `projectKey/Name` 이 null. 증명서 문서에 프로젝트 이름이 남지 않는다(id 만). 호출 수 제약(설계 §9.2)과의 저울질이라 판단은 백엔드·설계에 맡긴다.
3. 정합 확인(문제 없음): `getIssueApproval` 응답에서 `approval:null` 이면 `pin` 키가 없다 → 프론트는 `pin?.required` 로 읽어 안전. `getRequestDefaults` 는 projectId 형식이 아니면 null 로 처리하므로 프론트가 `{}` 를 보내도 된다.

## 미검증

- **iframe 실측 전부**(배포 금지 회차): Jira `jira:globalPage`·`jira:adminPage`·`jira:projectSettingsPage` 의 바깥 여백(U10), `new Modal({context})` 의 컨텍스트 위치와 첫 `getContext` 공백 재현 여부, `router.navigate('/browse/KEY')` 동작, `view.getContext().siteUrl` 이 Jira 에서도 오는지, Jira 프로젝트 아바타 URL 이 iframe 에서 뜨는지(실패 시 `PersonAvatar` 이니셜로 떨어짐).
- 이슈 화면 진입점이 없어(Q1) `getIssueApproval` 경로는 실제 화면에서 열 방법이 없다 — 코드 경로만 준비.
- `listInbox` 의 `projectKey` 대문자 정규화가 Jira `GET /project/{key}` 와 맞는지(키는 대문자 규약이지만 실측 전).
