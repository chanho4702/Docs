# core-port 검증 리포트 (회차 1)

> 작성: integration-verifier · 2026-10-03 · autopilot Phase 5 (무인 회차 — forge·git 인덱스 조작 없음)
> 기준: `01_architect_design.md`(계약), 대조: `02_backend_report.md`·`02_frontend_report.md`·실제 소스·`git status`

## 판정 요약

**PASS — 필수 수정 0건 / 권고 6건 / 미검증 3묶음**

- 완료 기준 4개(명령 4종 통과, Confluence grep 사유 확인, 계약 테스트 통과, 불변식 1~10 위반 없음) 모두 직접 재실행·대조로 확인.
- 프론트가 올린 백엔드 요청 2건은 **둘 다 후속으로 미룸**(근거는 §1). 모달 선조회는 **계약 위반 아님**(§2).

| 구분 | 수 |
|---|---|
| 통과 | 경계면 22행 + 점검표 전 항목 |
| 실패(필수) | 0 |
| 권고 | 6 (R1~R6) |
| 미검증 | forge lint, 플랫폼 실측 U1~U16, iframe 실측 |

## 실행 결과 (직접 재실행)

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 — `locales/ko-KR.json`, `en-US.json` 생성(exit 0) |
| `npm test -- --runInBand` | 통과 — **Test Suites 26 passed / 26, Tests 215 passed / 215** (기준선 27/188 → 삭제 5 + 신규 4) |
| `npm run test:ui -- --runInBand` | 통과 — **Test Suites 8 passed / 8, Tests 58 passed / 58** |
| `npm run build:ui` | 통과 — "Compiled with warnings"(전부 node_modules: `@atlaskit/analytics-next-stable-react-context` source map ENOENT, `@atlaskit/react-select` postcss-calc). 산출 html 4개: `inbox` `modal` `settings` `projectSettings`, 옛 `macro/stamp/feed.html` 없음 |
| `forge lint` | **미실행(무인 회차)** |

두 보고서가 적은 수치(26/215, 8/58)와 일치한다.

---

## 1. 프론트 → 백엔드 요청 2건 판정

### (1) `getFlow`/`listFlows` 가 프로젝트 id 만 반환 → Flow 편집 칩에 id 노출 가능 — **후속(R1)**

- 현상 확인: `static/ui/src/features/settings/FlowFormModal.jsx:94-96` 이 `knownProjects.get(id) ?? { value: id, label: id }` 로 그린다. `listProjects` 첫 페이지(이름순 50개)나 이번 세션 검색 결과에 없는 저장 프로젝트만 숫자 id 로 보인다.
- core-port 범위에서 고치지 않는 근거:
  1. **계약 위반이 아니다.** 설계 §2.1 의 flow DTO 는 `spaceKeys → projectIds` 만 정했다. 백엔드는 계약대로 했다.
  2. **표시 문제다.** 저장값·결재선 좁히기(`listAvailableFlows`/`getRequestDefaults`)는 id 로 맞게 돈다. 데이터·권한에는 영향이 없다.
  3. 고치려면 `getFlow` 에서 Jira `project/{id}` 를 N번 부르거나(호출량 §9.2 에 없던 비용) 프로젝트 이름 캐시를 새로 둬야 한다. "기능 추가 없음"인 이번 범위를 넘는다.
  4. 영향받는 곳이 관리자 설정 화면 한 곳뿐이고, 50개 넘는 프로젝트를 Flow 에 지정한 사이트에서만 나타난다.
- 후속 제안(backend): `getFlow` 응답에 `projects:[{id,key,name,avatarUrl}]` 를 보강한다. `project/search?id=…&id=…`(반복 파라미터는 `repeatedQueryRoute`)를 1회 asUser 로 부르고, 실패하면 id 로 폴백한다. 프론트는 `flow.projects` 가 있으면 `knownProjects` 초깃값으로 쓴다. 타임시트 기능 다음의 설정 화면 정리 회차에 넣는다.

### (2) 증명서 스냅샷에 프로젝트 이름 없음 — **후속(R2)**

- 현상 확인: `src/resolver/approval/CertificateService.js:44` 가 `adapter.viewOf(target, {}, adapter.snapshotOf(state))` 로 그린다. 저장 컬럼에 `project_key/name` 이 없어 `projectKey/Name` 은 null 이다. 프론트는 `CertificateSheet.jsx:75` 에서 `projectName || projectKey || projectId` 로 폴백하므로 숫자 id 가 찍힌다. 이슈 키·제목은 찍힌다.
- core-port 범위에서 고치지 않는 근거:
  1. 설계 §9.2 가 증명서 호출을 "mypermissions 1"로 정했고, §2.2 TargetView 도 `projectName: string|null` 을 허용한다. 백엔드는 이 제약을 지키려고 스냅샷을 택했다. 계약 안이다.
  2. **지금 운영에서 ISSUE 증명서를 만들 경로가 없다.** ISSUE 어댑터는 진입점 없는 참조 어댑터다(Q1). 업무함에도 ISSUE 요청이 생길 방법이 없다.
  3. 다음 대상인 TIMESHEET 는 프로젝트가 없다(`project_id NULL`). 증명서 대상 표시는 대상 종류별로 다시 정해야 한다(대상자·기간 등). 지금 ISSUE 만 보고 컬럼을 늘리면 다시 손대야 한다.
- 후속 제안(backend): (a) 권장 — 증명서에서 `canView` 통과 뒤 `adapter.describe(target).catch(()=>null)` 를 1회 불러 `viewOf(target, snapshot, fallback)` 로 그린다. asUser 이고 열람 확인이 끝난 뒤라 안전하다. 비용은 issue GET 1회. (b) 요청 시점 값을 보존해야 한다면 `vNNN_alter_*` 로 `project_key`·`project_name` 스냅샷 컬럼을 붙인다. ISSUE_TRANSITION 기능(이슈 진입점이 생기는 시점)에서 정한다.

## 2. 모달이 intent 와 무관하게 상세를 먼저 조회 — **계약 위반 아님(통과)**

- 위치: `static/ui/src/entries/modal.jsx:60-70`. 기준선은 `intent==='request'|'resubmit'` 일 때 조회를 건너뛰었다(`git show :static/ui/src/entries/modal.jsx`).
- 판정 근거:
  1. 설계 §2.5 가 "issueId 는 modal context 또는 **`ApprovalView.target.issueId`**"라고 적었다. §7.1 도 "requestId 가 있으면 상세, 없고 issueId 가 있으면 이슈 조회"라고 적었다. 요청 폼이 `getRequestDefaults({projectId})` 를 부르는데 업무함 컨텍스트에는 projectId 가 없다. 그래서 `target` 을 먼저 받는 것은 계약이 예정한 경로다.
  2. 권한 비대칭이 없다. 요청 경로에서 부르는 `getIssueApproval` 은 `{issue:view}`, `getApprovalDetail` 은 SELF+`canView` 다. 생성에 필요한 `{issue:edit}` 보다 약한 권한이라, 조회가 막히는 사용자는 생성도 막힌다.
  3. 비용은 resolver 1회(mypermissions·issue GET 각 1 + SQL)다. 지금은 업무함이 `request` intent 로 모달을 여는 곳이 없다(`InboxPage.jsx:397-398` 은 `detail`·`cancel` 만). 실제 비용은 0이다.
- 비ISSUE 대상이면 `error.INVALID_TARGET` 를 보이는 분기(`modal.jsx:131`)도 다음 대상 종류를 대비한 방어로 적절하다.

## 3. 엔트리 3곳 · Confluence 잔존

| 엔트리 | craco `ENTRIES` (`static/ui/craco.config.js:27-32`) | `static/ui/public/<key>.html` | `manifest.yml resources[].entry` | 빌드 산출 |
|---|---|---|---|---|
| modal | O | O | O | O |
| inbox | O | O | O (`jira:globalPage`) | O |
| settings | O | O | O (`jira:adminPage`) | O |
| projectSettings | O | O | O (`jira:projectSettingsPage`) | O |
| macro·stamp·feed | 없음 | 없음 | 없음 | 없음 |

- `@forge/confluence-bridge`: `static/ui/package.json`·`package-lock.json` 모두 0건이다.
- `grep -rniE "confluence|pageId|spaceKey|byline" src static/ui/src manifest.yml`:
  - 소스 쪽 남은 줄은 **이력 주석 5줄**뿐이다: `appShell.css:5`, `AppShell.jsx:9`, `PersonAvatar.jsx:7`, `modal.jsx:31,199`. 여기에 `craco.config.js:8,96` 주석이 더 있다.
  - 테스트 쪽은 **"없어야 한다" 단언 5줄**이다: `ApprovalRepository.test.js:147`, `DirectoryService.test.js:111,114`, `NotificationService.test.js:122`, `SettingsService.test.js:130`.
  - 사유가 모두 보고서에 있고 타당하다.
- `page_id|space_key|region|macro|stampBox|onPageUpdated|bylineProperties|homepageFeed` 는 테스트 외 0건이다. `src/trigger` 에는 `onInstall.js`·`runSweep.js` 만 있다. manifest 에 Confluence 모듈·scope 가 없고, app id 는 `REPLACE-WITH-forge-register` 를 유지한다.
- locales 에서 `confluence|스페이스|매크로|byline` 은 0건이다(`data.json` 의 "Space" 는 저장 공간 뜻, "N페이지" 는 페이지네이션).

## 4. 등록 · 권한 축 · 불변식 · 데이터 범위 · asApp

**resolver 3단계**
- 9개 `register*Controller` 는 모두 `CONTROLLER_REGISTRARS`(`src/index.js:30-40`)에 있다. 계약 테스트(`test/permission/permissionMap.contract.test.js`)도 통과했다.
- 프론트 `invokeApproval` 리터럴 이름 집합과 `PERMISSION_MAP` 키를 비교했다. **프론트에만 있는 이름은 0개**다. 맵에만 있는 이름은 `listApprovers/setApprovers/listManagers/setManagers`(MemberListSettings 가 변수로 호출)와 `listAvailableFlows`(기준선부터 미사용)다.
- 제거된 8종을 호출하는 곳은 0건이다.

**권한 축** (`src/permission/permissionGuard.js:52-67`)
- `{issue}`: `issueIdKey` 누락·비숫자면 거부하고 view/edit 코드를 구분한다.
- `{project:'admin'}`: `projectIdKey` 숫자 검증 + `hasProjectAdmin` 을 확인한다.
- `{jiraAdmin}`: `principal.isJiraAdmin` 을 본다.
- `isConfluenceAdmin` 은 `isJiraAdmin` 으로 바뀌었다(PrincipalResolver·AppAccess·cancel). `{teamLead}` 는 범위 밖이라 미구현이다(설계 §4.4).

**불변식 1~10**

| # | 결과 | 근거 |
|---|---|---|
| 1 | 통과 | `scopeKey.js` 의 `open:ISSUE:{issueId}` 와 `uq_request_dedupe`. 중복 INSERT 는 `ALREADY_OPEN`(`ApprovalRepository.js:159-163`, 테스트 있음). 미지원 kind 는 INVALID_TARGET |
| 2 | 통과 | 결정 경로 무변경 |
| 3 | 통과 | `src/domain` 에 `Date.now()`/`new Date()` 호출 0건(주석 3줄만). scopeKey 에서 crypto 를 제거했다 |
| 4 | 통과 | `approval_request` UPDATE 3곳 모두 `rev = rev + 1`(`:187, :245, :527`) |
| 5 | 통과 | `approval_approver` UPDATE 에 `AND decision_type='PENDING'`(`:499`) |
| 6 | 통과 | `eventId.js:16` 네임스페이스는 `kr.dmove.jira.approval`(첫 배포 전 교체) |
| 7 | 통과 | 업무함·알림은 `filterVisibleRows` 를 탄다. kind 별 어댑터로 판정하고 미등록 kind·판정 실패는 숨긴다. 상세·이력·증명서·결정·일괄승인(결정 경유)은 `assertTargetVisible`/`canView` 로 fail-close 한다. 읽기·쓰기 대칭이다 |
| 8 | 통과 | `asApp` 호출처 0건(`RequestJira.asApp` 은 정의만 있고 사유를 강제한다). `LicenseGuard.js:80` 의 `api.asApp().requestAtlassian` 은 AGENTS.md 허용 3번(라이선스 self-query)이다 |
| 9·10 | 해당 없음 | 엔티티 프로퍼티·validator 미사용 |

**형제 resolver 데이터 범위**
- 같은 요청 데이터를 내주는 `getApprovalDetail`·`getApprovalHistory`·`getApprovalCertificate`·`decideApproval`(+`bulkApprove`)는 모두 `canView` 를 거친다. `getIssueApproval` 은 가드 `{issue:view}` 를 거친다.
- 목록인 `listInbox`·`listNotifications` 는 건별 필터를 거친다.
- 예외는 숫자만 내는 `getInboxCounts`·`getUnreadCount` 다. 설계 §4.5 가 수용했다(R4).
- `cancelApproval` 은 열람 확인 없이 요청자 또는 Jira 관리자만 허용한다. 기준선과 동일하다.
- `whereIn` 빈 배열은 `QueryBuilder.js:54` 에서 `1 = 0` 이 된다(fail-close).
- **팀장 범위**: 이번 범위 밖(teamLead 축 없음). 타임시트 기능에서 다른 팀 accountId 호출 테스트가 필수다.

## 5. i18n · 마이그레이션

- kr/en 18개 네임스페이스 키 집합 비대칭 0건(스크립트 대조).
- `error.json` 키 34개와 `ErrorCodes` 값 34개가 정확히 일치한다. 프론트가 `error.code` 로 분기하는 곳은 `APP_ACCESS_DENIED` 1곳이고 ErrorCodes 에 있다.
- 프론트 소스의 리터럴 번역 키를 `ko-KR.json` 과 대조했다. 누락 0건이다.
- 마이그레이션은 `v001~v015` 연속이고 중복·역순이 없다. `ddl/index.js` re-export 와 1:1 이다. 코드가 참조하는 테이블명 15개가 DDL 15개와 일치한다(`approval_space*`/`flow_space` 0건).
- `approval_request` INSERT 30컬럼·30바인딩, `approval_inbox` INSERT 24컬럼·24바인딩이 DDL(§5.3)과 일치한다. `prev_request_id` 위치의 `UUID_TO_BIN(?)` 도 맞다.

## 6. `_workspace/core-port/tmp/locales_port.py`

- **판단: core-port 커밋까지만 두고 그 뒤 삭제한다(지금은 삭제하지 않음).**
- `_workspace/` 는 `.gitignore` 대상이라 리포에 들어가지 않는다. 지금 남겨도 무해하다.
- 다만 이 스크립트는 기준선 locale 을 Jira 판으로 바꾸는 **일회성 변환기**다. `banner/space/macro` 네임스페이스를 지우고 키 이름을 바꾼다. 커밋 뒤 누가 locale 을 손본 다음에 다시 돌리면 그 수정을 덮어쓸 수 있다.
- 결과물(locales)이 진실이고 변환 규칙은 프론트 보고서 §i18n 에 남아 있으니 재현용으로 보관할 이유도 없다.

---

## 권고 (필수 아님)

- **R1 [backend, 후속]** Flow 프로젝트 이름 보강 — §1(1).
- **R2 [backend, 후속]** 증명서 프로젝트 이름 — §1(2). 권장안은 증명서에서 `describe` 1회 + 스냅샷 폴백.
- **R3 [backend]** `src/permission/JiraPermission.js:59-69` `getIssueAccess` 에 **invocation 캐시가 없다.** 설계 §4.3("GET 1회에 두 키를 함께 물어 invocation 안 캐시")·§9.2("canRequest 판정 시 0 — 같은 mypermissions 응답 재사용")와 다르고, 백엔드 보고서의 "설계와 다른 점"에도 빠져 있다.
  - 결과: `getIssueApproval` 은 가드 1회 + `canRequest` 1회로 mypermissions 2회, `getApprovalDetail` 은 `canView` + `canRequest` 로 2회 호출한다.
  - 정확성 문제가 아니라 호출량 문제라 권고로 둔다.
  - 수정: `PrincipalResolver` 처럼 모듈 수준 `Map`(`${accountId}:${issueId}`) 캐시를 두거나, 어댑터 `canView`/`canRequest` 가 한 번 받은 access 를 공유하게 한다. warm runtime 재사용을 막으려면 invocation 단위로 비우는 장치가 필요하다.
- **R4 [기록]** `getInboxCounts`·`getUnreadCount` 에는 가시성 필터가 없다. 권한을 잃은 이슈의 건수가 숫자에 포함될 수 있다. 설계 §4.5 가 수용했고 내용은 노출되지 않는다. 타임시트에서 팀장 범위가 들어오면 다시 본다.
- **R5 [리더 확인]** 백엔드 보고서 §남은 이슈 1의 "`git mv` 로 이름 변경 5건 — 인덱스를 건드렸다"는 **현재 상태와 다르다.**
  - `git status` 에서 옛 경로 5개는 `AD`(스테이지에 남고 작업 트리에서 삭제)다. 새 경로(`src/api/jira/`, `src/error/JiraApiError.js`, `src/permission/JiraPermission.js`, `ddl/approvalProjectConfig.sql.js`, `ddl/flowProject.sql.js`)는 `??`(untracked)다. `R` 항목은 0건이다.
  - 따라서 **스테이징 영역은 기준선 그대로**다. 커밋 회차에서 untracked 신규 파일을 함께 추가해야 한다(신규: `locales/*/{project,state}.json`, `src/permission/__test__/`, `src/resolver/approval/target/`, `static/ui/public/projectSettings.html`, `IssueLink.jsx`, `entries/projectSettings.jsx`, `ProjectSettings.jsx`, `ProjectPolicyModal.jsx`).
- **R6 [frontend, 경미]** `static/ui/src/features/settings/exportRetentionExcel.js:80-81` 의 엑셀 열 이름 `'Project ID'`·`'Target key'` 가 하드코딩 영문이다. 기준선의 `'Page ID'` 관례를 이은 것이라 회귀는 아니다. 다음 i18n 정리 때 `common.column.*` 로 옮긴다.

## 미검증

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| `forge lint` | 무인 회차 forge 금지 | 배포 회차에서 `forge lint` — manifest 의 `jira:projectSettingsPage`·`jira:adminPage` 속성, scope 2종(U11) |
| 플랫폼 실측 U1~U16 | 배포 전 | `04_spike_todo.md` 표 그대로. 특히 U1(mypermissions 보안 수준·`%2C` 인코딩)·U2(permissions/check 응답 경로 — 틀리면 업무함이 **전부 빈다**)가 우선이다 |
| iframe 실측 | 배포 전 | Modal 컨텍스트 위치·첫 getContext 공백(U8), `router.navigate('/browse/KEY')`, adminPage/globalPage 여백(U10), 아바타(U12) |

## 통과 — 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자(반환 shape) | 소비자(접근 경로) | 일치 |
|---|---|---|---|
| getApprovalDetail | `ApprovalService.js:316-331` → `{approval, target, canRequest, pin}` | `modal.jsx:66-80,154-189` `data.approval/target/canRequest/pin?.required` | O |
| getIssueApproval | `ApprovalService.js:302-313` 같은 shape, approval null 이면 pin 키 없음 | `modal.jsx:68,171,183` `pin?.required`, `pin ?? null` | O |
| createIssueApproval | `{requestId,status,currentStepOrder}` | `RequestForm.jsx:269` `{issueId,…}` → `finish(result)` `result.requestId` | O |
| getRequestDefaults | `{defaultDeadlineDays, flows, approvalGroups}` | `RequestForm.jsx:204-205` `requestKeys.defaults(projectId)` | O |
| getApprovalHistory | `{items:[{requestId,revision,contentVersion,status,requesterKey,createdAt,events}]}` | `ApprovalDetail.jsx:130-135` `data.items`, 버전은 `showVersion` 일 때만 | O |
| getApprovalCertificate | `CertificateService.js:41-81` `target/targetKind/contentHash(null)/currentVersion(null)` | `CertificateSheet.jsx:66-91,193`, `exportCertificatePdf.jsx:77,101` | O |
| decideApproval / bulkApprove / cancelApproval | 무변경 | `modal.jsx:101`, DecisionForm, BulkApproveBar | O |
| listInbox | snake 원본 + `issueKey/projectKey/projectName/projectAvatarUrl/title` + epoch ms | InboxTable·exportInboxExcel `valueOf(item, camel, snake)`, `InboxPage.jsx:254-260` | O |
| getInboxCounts | `{statusCounts, myTurnCount}` | InboxPage | O |
| listNotifications | `{notificationId,kind,templateKey,vars,requestId,targetKind,targetKey,issueId,issueKey,title,projectId,…}` | NotificationPanel `templateKey/vars/title/issueKey` | O |
| listProjects | `{items:[{id(String),key,name,avatarUrl,enabled}],nextCursor,hasMore,configured}` | `ProjectSettings.jsx:51-136`, `FlowFormModal.jsx:76-85` | O |
| setProjectEnabled | `{projectId,enabled,openCount}` | `ProjectSettings.jsx:61-136` | O |
| get/saveProjectPolicy | `{projectId,overridableKeys,global,override,effective}` | ProjectPolicyModal | O |
| get/saveApprovalSettings | `approverAccessCheck`, 구 키는 INVALID_TARGET | PolicySettings | O |
| list/get/create/updateFlow | `projectIds` | `FlowFormModal.jsx:68,155` | O(이름은 R1) |
| listGroups / searchApprovers | `{items:[{id,name}]}` / `{users,groups:[{id,name}]}` | GroupFormModal `groupKey=name`, `jiraGroupOption(group.name)` → `group:<이름>` | O |
| create/updateApprovalGroup | `type:'JIRA'|'CUSTOM'` | GroupFormModal `type==='JIRA'` | O |
| exportExpiredApprovals | `requests[].{targetKind,targetKey,issueId,issueKey,targetTitle,projectId,…}` | `exportRetentionExcel.js:58-103` | O |
| 사용자 DTO | `{accountId,displayName,avatarUrl,accountStatus}` | DirectoryPicker(관리자 배지 삭제) | O |
| 에러 | `{success:false,error:{code}}` 34 코드 | `error.json` 34 키, `ApprovalErrorMessage` | O |
| 쿼리키 | — | `approvalKeys.issue/detail/history`, `requestKeys.defaults`, `settingsKeys.projects/projectPolicy` 팩토리 사용 | O |
| Modal 컨텍스트 | 업무함 `{intent, requestId, issueId}` | `modal.jsx:33-43` 후보 판정 키 `requestId/issueId/intent` | O |

## 다음 회차 재검증 항목

이번 회차 실패 0건이라 재호출은 필요 없다. 후속 기능에서 R1·R2·R3 를 반영하면 다음을 다시 확인한다.
- `getFlow` 의 `projects` shape ↔ FlowFormModal
- 증명서 `target.projectName`
- mypermissions 호출 수(테스트로 1회 단언)
