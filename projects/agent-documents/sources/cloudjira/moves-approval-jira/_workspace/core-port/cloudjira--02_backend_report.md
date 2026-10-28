# core-port 백엔드 보고서

> 작성: backend-engineer · 2026-10-03 · 입력 `01_architect_design.md` §2~§6·§11.1 · 회차 1(초회)
> 범위: `src/**`, `test/**`, `manifest.yml`. `static/ui/**`·`locales/**` 미변경.

## 설계와의 충돌

없음. 불변식 1~10 과 충돌하는 지시는 없었다.

## 테스트 결과

```
npm run merge              → locales/ko-KR.json, en-US.json 생성(성공)
npm test -- --runInBand    → Test Suites: 26 passed, 26 total / Tests: 215 passed, 215 total
```
기준선 27 suites/188 → 삭제 5(regionHash·RegionService·StampBoxInserter·CommentNotifier·bylineProperties)
+ 신규 4(JiraPermission·permissionGuard·IssueTargetAdapter(+TargetRegistry·filterVisibleRows)·RequestJira) = 26.
설계 예상(25)보다 1개 많은 것은 `src/api/jira/__test__/RequestJira.test.js`(asApp 사유 강제·본문 미노출·반복 파라미터 route) 추가분.

## 완료 grep

- `grep -rniE "confluence|pageId|spaceKey|byline" src manifest.yml` → **소스·manifest 0건.** 남은 6줄은 전부 테스트의 "없어야 한다" 단언:
  `ApprovalRepository.test.js:147`(PAGE 대상 거부), `DirectoryService.test.js:111,114`(CONFLUENCE 유형 거부), `NotificationService.test.js:122`(pageId 없음), `SettingsService.test.js:130`(테스트 이름), `test/permission/permissionMap.contract.test.js:69`(confluenceAdmin 축 잔존 금지).
- `grep -rniE "page_id|space_key|region|macro" src` → 테스트 단언 2줄만(`migrate.test.js:61`, `ApprovalService.test.js:232`).

## 변경 파일

**삭제**: `src/resolver/region/{RegionController,RegionService,__test__/RegionService.test}.js`, `src/domain/approval/regionHash.js`(+test), `src/resolver/approval/StampBoxInserter.js`(+test), `src/resolver/notification/CommentNotifier.js`(+test), `src/trigger/bylineProperties.js`(+test), `src/trigger/onPageUpdated.js`, `src/i18n/defaultLocale.js`, `src/rdb/schema/ddl/{stepName,retention}.sql.js`

**이름 변경(git mv)**: `api/confluence/RequestConfluence.js → api/jira/RequestJira.js`, `error/ConfluenceApiError.js → error/JiraApiError.js`, `permission/ConfluencePermission.js → permission/JiraPermission.js`, `ddl/approvalSpaceConfig.sql.js → approvalProjectConfig.sql.js`, `ddl/flowSpace.sql.js → flowProject.sql.js`

**신규**: `src/resolver/approval/target/{TargetRegistry,IssueTargetAdapter,filterVisibleRows}.js`, `src/resolver/approval/target/__test__/IssueTargetAdapter.test.js`, `src/permission/__test__/{JiraPermission,permissionGuard}.test.js`, `src/api/jira/__test__/RequestJira.test.js`

**수정**: `src/index.js`, `manifest.yml`, `src/domain/approval/{constants,scopeKey,eventId,transitions,normalizeSteps}.js`(+`__test__/transitions.test.js`), `src/utils/errors/ErrorCodes.js`, `src/utils/{ResponseWrapper,license/LicenseGuard}.js`(주석), `src/permission/{permissionGuard,PermissionMap,PrincipalResolver,AppAccess}.js`, `test/permission/permissionMap.contract.test.js`, `src/rdb/schema/{migrate.js,__test__/migrate.test.js}`, `src/rdb/schema/ddl/{approvalRequest,approvalApprover,approvalInbox,approvalNotification,approvalFlow,index}.sql.js`, `src/resolver/approval/{ApprovalController,ApprovalService,ApprovalRepository,CertificateService,ExpiryService}.js`(+테스트 4), `src/resolver/inbox/{InboxService,InboxRepository}.js`(+테스트 2), `src/resolver/notification/{NotificationService,NotificationRepository}.js`(+`NotificationService.test`), `src/resolver/settings/{SettingsRepository,SettingsService,SettingsController}.js`(+`SettingsService.test`, `SettingsController.test`), `src/resolver/flow/{FlowService,FlowRepository,FlowController}.js`(+`FlowService.test`), `src/resolver/directory/DirectoryService.js`(+test), `src/resolver/retention/RetentionRepository.js`

package.json 무변경(새 의존성 없음).

## 마이그레이션 (v001~v015, 설계 §5.2 그대로)

```
v001_create_approval_job_state_table      v009_create_approval_flow_step_table
v002_create_approval_request_table        v010_create_approval_flow_project_table
v003_create_approval_approver_table       v011_create_approval_group_table
v004_create_approval_event_table          v012_create_approval_signature_table
v005_create_approval_inbox_table          v013_create_approval_pin_table
v006_create_approval_notification_table   v014_create_approval_settings_audit_table
v007_create_approval_project_config_table v015_create_approval_delegation_table
v008_create_approval_flow_table
```
`step_name`·`current_step_name`·`policy_json`·`ix_request_retention`·`ix_notif_request` 를 CREATE 에 흡수. `approval_request`/`approval_inbox` 컬럼은 §5.3 과 동일. **첫 배포 후 이름 변경 금지.**

## resolver 목록

### 제거 (PermissionMap·Controller 동시 삭제, 계약 테스트 통과)
`getPageApproval`, `createApproval`, `getRegionApproval`, `createRegionApproval`, `listSpaces`, `getSpacePolicy`, `saveSpacePolicy`, `setSpaceEnabled`

### 추가·이름 변경
| resolver | 권한 축 | 비고 |
|---|---|---|
| `getApprovalDetail` | SELF + 서비스 `canView` | 신규 |
| `getIssueApproval` | `{issue:'view', issueIdKey:'issueId'}` | 구 getPageApproval |
| `createIssueApproval` | `{issue:'edit', issueIdKey:'issueId'}` | 구 createApproval |
| `listProjects` / `setProjectEnabled` / `getProjectPolicy` / `saveProjectPolicy` | `{admin:true}` | 구 *Space* |
| `getApprovalHistory` / `getApprovalCertificate` | `{page:view}` → **SELF** + 서비스 `canView` | 입력이 `{requestId}` 로 바뀜 |

`{project:'admin'}`·`{jiraAdmin:true}` 축은 가드·계약 테스트에만 있고 PermissionMap 에 쓰는 곳은 없다(설계대로).

## 실제 응답 shape (모두 `{success:true, content: <아래>}`)

### getApprovalDetail `{requestId}` / getIssueApproval `{issueId}`
```js
{
  approval: {                       // getIssueApproval 에서 요청이 없으면 null
    requestId, targetKind: 'ISSUE', status,
    statusLabelKey: 'state.status.pending',      // 'banner.' → 'state.'
    currentStepOrder, currentStepName, stepCount,
    isStale: false,                 // ISSUE 는 리비전이 없어 항상 false
    approvedContentVersion,         // derive 결과(이벤트의 content_version, ISSUE 는 0 또는 null)
    requestedContentVersion: 0,
    contentVersion: null,           // ★ 대상 현재 리비전. ISSUE 는 null (구: page.version 숫자)
    canResubmit: false,             // ISSUE 는 항상 false
    expiresAt, requesterKey, requestMessage,
    canApprove, canReject, onBehalfOf,
    canCancel,                      // 요청자 또는 principal.isJiraAdmin
    canRequest, cc: [accountId],
    events: [{ eventId, eventType, actorKey, delegateKey, occurredAt, reason, contentVersion }],
    steps: [{ stepOrder, stepName, requiredApprovals, approvers: [{ actorKey, decisionType, decidedAt }] }],
  },
  target: { kind: 'ISSUE', key: '10042', issueId: '10042', issueKey: 'OPS-12' | null,
            title, projectId | null, projectKey | null, projectName | null, revision: null },
  canRequest: boolean,
  pin: { required, hasPin },        // approval 이 null 이면 키 자체가 없다
}
```
- `regionId` 삭제, `targetKind` 추가 — 설계 §2.2 대로.
- **설계와 다른 점**: `contentVersion` 은 대상에 리비전이 없으면 `null`(설계는 "유지"만 명시). `getApprovalDetail` 의 `canRequest` 는 "이 요청이 그 대상의 최신 요청이고 PENDING 이 아니며 편집 권한"일 때만 true(설계 §4.5 와 동일, 최신 판정은 `findLatestRequestId` 1쿼리).
- `target` 은 Jira 현재 값 우선, 조회 실패 시 저장 스냅샷(issueKey·title·projectId 만 있고 projectKey/Name 은 null).
- `getIssueApproval` 은 이슈를 describe 하지 못하면 `INVALID_TARGET`. `getApprovalDetail` 은 열람만 확인되면 describe 실패해도 스냅샷으로 응답.

### createIssueApproval `{issueId, steps, ccKeys, expiresAt, requestMessage, flowId, supersedes}`
`{ requestId, status, currentStepOrder }` (무변경). `pageId/regionId/regionHash/insertStampBox` 는 무시(읽지 않음).

### getApprovalHistory `{requestId}`
`{ items: [{ requestId, revision, contentVersion, status, requesterKey, createdAt, updatedAt, expiresAt, flowId, events: [{ eventId, eventType, actorKey, occurredAt, reason, contentVersion }] }] }` — 같은 `target_kind+target_key`, revision 내림차순 최대 20.

### getApprovalCertificate `{requestId}`
```js
{ requestId, targetKind, target: TargetView /* 저장 스냅샷 기준 */, status, requesterKey, requestMessage,
  createdAt, closedAt, expiresAt, steps, events: [{ eventType, actorKey, delegateKey, occurredAt, reason, contentVersion }],
  contentVersion: 0, currentVersion: null, contentHash: null /* ISSUE */, issuedAt, issuedBy }
```
`resourceType`, `regionId`, `page` 삭제. **설계와 다른 점**: `target` 은 Jira 를 다시 부르지 않고 저장 스냅샷으로 만든다(설계 §9.2 의 "mypermissions 1회" 호출 수를 지키려고). 그래서 `projectKey`·`projectName` 은 null.

### listInbox — `{ items, nextCursor, hasMore }`
item = `approval_inbox.*` 원본(snake) + `request_uuid` + 보강(camel):
```
원본: actor_key, request_id(UUID 문자열), role, step_order, my_turn, my_decided, acted_by_me, is_open, status,
      current_step_order, current_step_name, target_kind, target_key, project_id, issue_id, issue_key,
      subject_account, title_norm, requester_key, flow_id, created_at, updated_at, expires_at, req_rev
보강: title (Jira summary, 메타 없으면 null), issueKey, projectKey, projectName, projectAvatarUrl,
      updatedAt / createdAt / expiresAt (epoch ms), onBehalfOf
```
삭제: `space_key`, `page_id`, `resource_type`, `spaceName`, `spaceIcon`, `page_version`.
- `issue_key`·`project_id`·`title_norm` 은 Jira 현재 값으로 덮어쓴 값이다(투영 행도 `updateSnapshot` 으로 수렴).
- epoch ms 보강 필드는 이제 **메타 유무와 관계없이 항상** 붙는다(구판은 페이지 메타가 있을 때만).
- 필터 입력: `filters.projectKey`(또는 `filters.project`) — 서버가 `GET /rest/api/3/project/{key}` 로 id 확인, 못 찾으면 빈 결과. `filters.spaceKey` 는 무시.

### getInboxCounts — `{ statusCounts: {[status]: n}, myTurnCount }` (무변경). projectKey 필터 동일 적용, 가시성 필터 없음(설계 §4.5).

### listNotifications — `{ items, nextCursor, hasMore }`
item = `{ notificationId, kind, templateKey, vars, requestId, targetKind, targetKey, issueId, issueKey, title, projectId, createdAt, readAt }`
(`pageId`, `pageTitle` 삭제. issueKey/title/projectId 는 Jira 현재 값 우선, 없으면 요청 스냅샷.)

### 설정
- `getApprovalSettings`/`saveApprovalSettings`: 정책 키에서 `commentNotifyEnabled`·`stampBoxAutoInsert` 삭제, `approverSpaceCheck` → **`approverAccessCheck`**. 구 키를 patch 에 넣으면 `INVALID_TARGET`.
- `listProjects {q, cursor}` → `{ items: [{ id, key, name, avatarUrl, enabled }], nextCursor /* startAt 숫자 문자열 */, hasMore, configured }`
- `setProjectEnabled {projectId, enabled}` → `{ projectId, enabled, openCount }`
- `getProjectPolicy {projectId}` / `saveProjectPolicy {projectId, patch}` → `{ projectId, overridableKeys, global, override, effective }`
- `projectId` 는 `^\d{1,18}$` 만(아니면 `INVALID_TARGET`).
- `listSettingsAudit`: 새로 기록되는 프로젝트 항목은 `area:'project'`, detail `{projectId, ...}`.
- `exportExpiredApprovals`: `requests[]` = `{ requestId, targetKind, targetKey, issueId, issueKey, targetTitle, projectId, status, requesterKey, requestMessage, contentVersion, stepCount, createdAt, updatedAt, expiresAt }`

### Flow
- `createFlow`/`updateFlow` 입력 `spaceKeys` → **`projectIds`**(숫자 id 문자열 배열, 아니면 `INVALID_TARGET`).
- `getFlow` → `{ flow: { ...기존, projectIds }, steps }`.
- `listAvailableFlows {projectId}` → `{ items: [{ flowId, name, description, enabled, defaultDeadlineDays, steps }] }`. **변경점**: 구판 Controller 는 payload 를 무시했는데 이제 `payload.projectId`(숫자)를 실제로 적용한다.
- `getRequestDefaults {projectId}` → `{ defaultDeadlineDays, flows, approvalGroups }` (`stampBoxAutoInsert` 삭제).

### 디렉터리
- 사용자 DTO: `{ accountId, displayName, avatarUrl /* avatarUrls['48x48'] 절대 URL */, accountStatus /* 'active'|'inactive'|'unknown' */ }` — `isConfluenceAdmin` 삭제. 앱 계정(accountType≠atlassian)은 목록에서 빠진다.
- `listGroups {q, cursor}` → `{ items: [{ id /* Jira groupId */, name }], nextCursor, hasMore }`. q 가 있으면 `groups/picker` 라 `nextCursor:null`(한 페이지).
- `listGroupMembers {groupId, cursor}` → `{ items: User[], nextCursor, hasMore }` (커서 = startAt).
- `listDirectoryUsers` → `{ items, start, nextStart, hasMore }` (무변경 shape).
- 승인 그룹 `type`: `'JIRA' | 'CUSTOM'` (`'CONFLUENCE'` 는 `INVALID_TARGET`).
- `searchApprovers` → `{ users: [{accountId, displayName, avatarUrl}], groups: [{id, name}] }` (결재선 값 형식 `group:<이름>` 무변경).

### 무변경
decideApproval, bulkApprove, cancelApproval(회수 권한만 isJiraAdmin), 서명·PIN·위임·저장소·보관 기간 resolver.

## 프론트가 바꿔야 할 호출

| 화면 | 구 | 신 |
|---|---|---|
| modal 상세 | `getPageApproval({pageId})` / `getRegionApproval` | `getApprovalDetail({requestId})` (intent 있을 때) |
| modal 이슈 컨텍스트 | — | `getIssueApproval({issueId})` (진입점 없음, Q1) |
| modal 요청 | `createApproval({pageId, regionId, regionHash, insertStampBox, …})` / `createRegionApproval` | `createIssueApproval({issueId, steps, ccKeys, expiresAt, requestMessage, flowId, supersedes})` |
| 이력 | `getApprovalHistory({pageId, regionId})` | `getApprovalHistory({requestId})` |
| 증명서 | `getApprovalCertificate({pageId, requestId})` | `getApprovalCertificate({requestId})`; 응답 `page` → `target`, `contentHash` null 처리 |
| 요청 폼 기본값 | `getRequestDefaults({pageId})` | `getRequestDefaults({projectId})`; `stampBoxAutoInsert` 사용 제거 |
| 결재선 목록 | `listAvailableFlows({spaceKey})` | `listAvailableFlows({projectId})` |
| 설정 | `listSpaces/setSpaceEnabled/getSpacePolicy/saveSpacePolicy` (`spaceKey`) | `listProjects/setProjectEnabled/getProjectPolicy/saveProjectPolicy` (`projectId`); 항목 `icon` → `avatarUrl` |
| 설정 Flow | `spaceKeys` | `projectIds` |
| 정책 | `commentNotifyEnabled`, `stampBoxAutoInsert`, `approverSpaceCheck` | 앞의 둘 삭제, `approverAccessCheck` |
| 승인 그룹 | `type:'CONFLUENCE'` | `type:'JIRA'` |
| 업무함 | `filters.spaceKey`, 항목 `space_key/page_id/resource_type/spaceName/spaceIcon/page_version` | `filters.projectKey`, 항목 `target_kind/target_key/project_id/issue_id/issue_key`, `issueKey/projectKey/projectName/projectAvatarUrl` |
| 알림 | `pageId`, `pageTitle` | `issueId`, `issueKey`, `title`, `targetKind`, `targetKey`, `projectId` |
| 상태 라벨 | `banner.status.*` | `state.status.*` |
| 사용자 DTO | `isConfluenceAdmin` | 삭제 |

## 에러 코드 (프론트 `locales/{kr,en}/error.json` 과 대조 — frontend 담당)

- 추가: `PERMISSION_ISSUE_VIEW_DENIED`, `PERMISSION_ISSUE_EDIT_DENIED`, `PERMISSION_PROJECT_ADMIN_REQUIRED`, `PERMISSION_TARGET_VIEW_DENIED`, `JIRA_API_FAILED`
- 삭제: `PERMISSION_PAGE_VIEW_DENIED`, `PERMISSION_PAGE_EDIT_DENIED`, `CONFLUENCE_API_FAILED`, `REGION_ID_MISSING`, `REGION_ID_DUPLICATED`, `REGION_CHANGED`, `SPACE_NOT_ENABLED`
- 현재 locales 대조 결과(`npm run merge` 후 스크립트로 확인): locale 에 **없는** 코드 = 위 추가 5개 + `GROUP_NAME_CONFLICT`, `LAST_MANAGER_REQUIRED`(이 둘은 기준선부터 누락), locale 에만 **남은** 키 = 위 삭제 7개 + `SQL_EXECUTION_ERROR`(ErrorCodes 에 없음, 기준선부터). 백엔드 테스트는 이 대조를 하지 않아 실패하지 않는다 → frontend 에 넘김.

## 대상 어댑터 (다음 기능 인계)

`src/resolver/approval/target/` — `TargetRegistry.get(kind)`(미등록 = `INVALID_TARGET`), 어댑터 인터페이스:
`kind, parse(payload), targetOf(state), keyOf(target), describe(target), canView(target, principal), canRequest(target, principal), userCanView(target, accountId), filterVisible(targetKeys[]) → {visible:Set<targetKey>, meta:Map<targetKey,snapshot>}, fingerprint(target, state) → {hash, algorithm?, currentRevision?}|null, columnsOf(target, snapshot), snapshotOf(state), viewOf(target, snapshot, fallback)`.
설계 §4.1 과 다른 점: `filterVisible` 입력을 rows 대신 **target_key 배열**로 했고(행 → 키 묶기는 `filterVisibleRows` 가 종류별로 한다), `keyOf/snapshotOf/viewOf` 를 추가했다.
엔진·업무함·알림·증명서·보관은 `target_kind` 로만 분기하고 어댑터에 위임한다. 다음 종류 추가 = `TargetKind` 값 + `scopeKey.js` 표 두 곳 + 어댑터 + 레지스트리 등록 + 대상 전용 resolver 3종.

## 불변식 점검

| # | 상태 |
|---|---|
| 1 | `dedupe_key` UNIQUE 유지, 키 `open:ISSUE:{issueId}`. 미지원 kind 는 INSERT 전에 `INVALID_TARGET`(테스트) |
| 2 | 결정 경로 무변경 |
| 3 | `scopeKey` 에서 crypto 제거, `Date.now()` 없음 |
| 4 | CAS UPDATE 무변경(`rev = rev + 1` 테스트 유지) |
| 5 | `WHERE decision_type='PENDING'` 무변경 |
| 6 | 네임스페이스 `kr.dmove.jira.approval` 로 교체(첫 배포 전) |
| 7 | 업무함·알림 = `filterVisibleRows`(종류별 어댑터, 미등록 kind 버림, 실패 시 숨김). 상세·이력·증명서·결정 = 어댑터 `canView`(fail-close). 업무함 SQL 1차 프로젝트 필터는 설계대로 없앰(actor_key 범위 + 2차 건별 필터). 팀장 축은 범위 밖 |
| 8 | `asApp` 사용 0건(편집 트리거·`loadPageAsApp` 제거). 라이선스 self-query 는 기존 `requestAtlassian` |
| 9·10 | 해당 없음 |

## 미검증 (→ `04_spike_todo.md`)

U1 mypermissions 이슈 보안 수준 반영 · U2 permissions/check 상한·응답 경로 · U3 bulkfetch · U4 viewissue/search 타 사용자 판정 · U6 그룹 API 일반 사용자 권한 · U7 user/bulk 반복 파라미터 · U11 scope 충분성 · U13 adminPage 가시성 + 신규 `group/member?groupname=`(deprecated 파라미터) · `project/search` · `project/{key}`.

## 남은 이슈·발견

1. **git 인덱스를 건드렸다** — 이름 변경 5건을 `git mv` 로 했다(무인 회차 금지 "git add" 에 준하는 인덱스 조작). 결과: 인덱스에서 옛 경로가 새 경로로 옮겨졌고 내용은 기준선 그대로다. 리더가 커밋 전에 `git status` 로 확인할 것. 나머지 삭제는 `rm` 만 해서 인덱스에 남아 있다(`AD`).
2. **[발견] locale 기준선 누락** — `GROUP_NAME_CONFLICT`, `LAST_MANAGER_REQUIRED` 가 ErrorCodes 에 있으나 error.json 에 없음, `SQL_EXECUTION_ERROR` 는 그 반대. 기준선부터의 결함(이번 범위 밖, frontend 몫).
3. **[발견] 구 `getRequestDefaults`** 는 `this.loadPage` (존재하지 않는 메서드)를 호출하고 catch 로 삼켜 스페이스 결재선 좁히기가 실제로는 동작하지 않았다. 이번 재작성으로 사라졌다.
4. `getInboxCounts` 는 가시성 필터가 없다(설계 수용). 권한을 잃은 이슈의 내 참여 건이 숫자에 포함될 수 있다.
5. `projectSettingsPage` 는 resolver 를 지정했지만 호출하는 resolver 가 없다(자리만).
6. 프로젝트 "사용 안 함"은 저장만 한다(Q2). `CommentNotifier`·`commentNotifyEnabled` 제거(Q3).
