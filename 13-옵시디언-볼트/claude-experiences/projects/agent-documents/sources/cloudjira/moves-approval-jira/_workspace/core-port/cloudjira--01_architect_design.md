# core-port 설계서 — Confluence 코어를 Jira 골격으로

> 작성: feature-architect · 2026-10-03 · 입력 `00_input/requirement.md`
> 기준선: git 스테이징(`fa07591` 복사본), 백엔드 27 suites / 188 tests 통과
> 성격: **제거 + 전환.** 기능 추가 없음. 엔진(상태 머신·CAS·결정적 id)은 손대지 않고, 대상 표현만 "페이지/영역" → "대상 종류(kind) + 대상 키"로 바꾸고 Jira 어댑터를 붙인다.

## 열린 질문

| # | 질문 | 선택지 | 이 설계의 가정(보수적 해석) |
|---|---|---|---|
| Q1 | **이슈 전체 승인(`ISSUE` 대상)** 을 제품 기능으로 둘 것인가 | (a) 참조 어댑터로만 둔다 — resolver 는 등록하되 manifest 진입점(issuePanel·issueAction) 없음 (b) 이번에 `jira:issueAction` 진입점까지 연다 (c) 어댑터를 아예 두지 않는다 | **(a)**. Confluence 의 PAGE 와 1:1 대응이라 엔진 테스트·E2E 의 기준 어댑터가 된다. 다음 기능(ISSUE_TRANSITION)이 같은 `{issue}` 가드·요청 폼·모달을 그대로 쓴다. (c)면 createRequest 경로를 실행할 대상이 하나도 없어 "엔진이 도는 골격"을 테스트로 증명할 수 없다 |
| Q2 | 프로젝트 "사용 여부"(구 적용 스페이스)를 **서버가 강제**할 것인가 | (a) 저장만(Confluence 판과 동일 — 서버 강제 없음, 표시 모듈이 숨김) (b) `createIssueApproval` 이 꺼진 프로젝트를 거부 | **(a)**. Confluence 판도 `SPACE_NOT_ENABLED` 를 실제로 던지는 곳이 없었다(실측 grep). 강제 지점은 이슈 모듈을 붙이는 기능에서 정한다 |
| Q3 | Jira 코멘트 @멘션 알림(DESIGN 알림 결정) 재도입 시점 | (a) 이번엔 `CommentNotifier`·`commentNotifyEnabled` 를 지우고, 이슈 전환 기능에서 `write:jira-work` 와 함께 재도입 (b) 이번에 Jira 코멘트로 바로 전환 | **(a)**. 요구사항이 제거를 명시했고, 코멘트를 남길 이슈가 없는 TIMESHEET 대상에는 쓸 수 없어 대상별 설계가 필요하다 |

---

## 1. 개요·영향 범위

| 계층 | 바뀌는 것 |
|---|---|
| 도메인 | `ResourceType{PAGE,CONTENT_REGION}` → `TargetKind{ISSUE}`. `scopeKey` 를 종류별 키 빌더 표로. `regionHash` 삭제, `CancelReason.REGION_REMOVED` 삭제, eventId 네임스페이스 교체. 상태 머신(`transitions`/`derive`/`normalizeSteps`) **무변경** |
| 대상 어댑터(신규) | `src/resolver/approval/target/` — `TargetRegistry` + `IssueTargetAdapter`. 서비스는 대상의 설명·권한·가시성을 **어댑터를 통해서만** 묻는다. 다음 기능은 어댑터 1개 + `TargetKind` 1개 + 키 빌더 1개만 추가 |
| API | `api/confluence/RequestConfluence` → `api/jira/RequestJira`(`requestJira`, asUser 기본, asApp 사유 강제, 에러 본문 미노출) |
| 권한 | `ConfluencePermission` → `JiraPermission`. 가드 축 `{page}`→`{issue}`, `{confluenceAdmin}`→`{jiraAdmin}`, `{project:'admin'}` 신설. `filterVisiblePages` → `filterVisibleIssues`(permissions/check + bulkfetch) |
| resolver | 영역 2종·페이지 2종·스페이스 4종 제거, 이슈 2종·상세 1종·프로젝트 4종 추가. 응답에서 `pageId/spaceKey/regionId/page` → `target`/`issueId`/`projectId` |
| 스키마 | v001 부터 재정리(15개). `page_id/space_key/region_*/resource_type/page_title` → `target_kind/target_key/project_id/issue_id/issue_key/transition_id/subject_account/period_key/target_title/content_hash`. 스페이스 테이블 2개 → 프로젝트 테이블 2개. ALTER 6개는 CREATE 에 흡수 |
| manifest | Confluence 모듈 8종·트리거 1종·classic/granular Confluence scope 전부 제거. `jira:globalPage` / `jira:adminPage` / `jira:projectSettingsPage`(자리) + onInstall + 일일 스윕 + sql. scope `storage:app`, `read:jira-work`, `read:jira-user` |
| 프론트 엔트리 | `macro`·`stamp`·`feed` 삭제. `inbox`·`modal`·`settings` 유지, `projectSettings` 신설(자리). **modal 은 유지** — 업무함이 상세·반려·회수를 `new Modal({resource:'main/modal'})` 로 연다 |
| i18n | `macro`·`banner`·`space` 네임스페이스 삭제. `banner` 의 살아남는 키는 `state` 로, `space` 는 `project` 로. 페이지/스페이스/Confluence 단어를 이슈/프로젝트/Jira 로 |
| 워크포스 연동 | 없음(범위 밖) |

### 1.1 대상 모델 — "종류 + 키"

```
target = { kind, ...종류별 식별자 }
  ISSUE            { kind:'ISSUE', issueId }                         ← 이번에 구현
  ISSUE_TRANSITION { kind:'ISSUE_TRANSITION', issueId, transitionId } ← 다음 기능(키 형식만 예약)
  TIMESHEET        { kind:'TIMESHEET', subjectAccount, periodKey }    ← 다음 기능(키 형식만 예약)

targetKey(target)  종류 안에서의 식별자 문자열      ISSUE → '10042'
scopeKey(target)   `${SCOPE_PREFIX[kind]}:${targetKey}`  ISSUE → 'ISSUE:10042'
dedupe_key         'open:' + scopeKey | 'closed:' + requestId   (기존과 동일)
```

예약 형식(다음 기능이 그대로 쓰도록 여기서 고정한다 — CLAUDE.md 불변식 1·DESIGN §2.1 과 일치):

| kind | SCOPE_PREFIX | targetKey | scopeKey 예 |
|---|---|---|---|
| ISSUE | `ISSUE` | `{issueId}` | `ISSUE:10042` |
| ISSUE_TRANSITION | `TRANSITION` | `{issueId}:{transitionId}` | `TRANSITION:10042:31` |
| TIMESHEET | `TIMESHEET` | `{accountId}:{periodKey}` | `TIMESHEET:5b10…:2026-10` |

**이번 범위에서 `TargetKind` 상수와 키 빌더 표에는 ISSUE 만 넣는다.** 나머지 두 행은 문서상 예약이며, 넣으면 어댑터 없이도 도메인이 키를 만들어 주는 반쪽 상태가 생긴다.

### 1.2 어댑터 추가 체크리스트(다음 기능용 — 이 설계가 만족시켜야 할 "완료" 정의)

1. `domain/approval/constants.js` `TargetKind` 에 값 추가
2. `domain/approval/scopeKey.js` `TARGET_KEY_BUILDERS`·`SCOPE_PREFIX` 에 한 행 추가
3. `resolver/approval/target/XxxTargetAdapter.js` 작성 + `TargetRegistry` 에 등록
4. 대상 전용 resolver(가드 축이 대상마다 다르므로) — Controller/PermissionMap/CONTROLLER_REGISTRARS 3종
5. 엔진·업무함·알림·증명서·보관은 **수정 없음** — 이 다섯 곳이 `target_kind` 로만 분기하고 어댑터에 위임하는지가 이번 설계의 검증 포인트다

---

## 2. 경계면 계약

권한 축 표기: `SELF` · `{admin}` = `{admin:true}` · `{issue:view}` = `{issue:'view', issueIdKey:'issueId'}` · `{issue:edit}` = `{issue:'edit', issueIdKey:'issueId'}`.
에러 코드 공통(모든 resolver): `PERMISSION_DENIED`, `APP_ACCESS_DENIED`(SELF/issue 축), `PERMISSION_ADMIN_REQUIRED`(admin 축), `LICENSE_INACTIVE`, `STORAGE_NOT_READY`, `JIRA_API_FAILED`, `UNKNOWN_ERROR`. 아래 표의 "에러 code" 열은 그 외 고유 코드만 적는다.

### 2.1 남기는 resolver — 권한 축 확정표

| resolver | 권한 축 (구 → 신) | 입력 (변경분 굵게) | 응답 shape(success, `content` 아래) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| listInbox | SELF → SELF | `{tab, filters:{statuses,q,`**`projectKey`**`,requesterKey,createdFrom,createdTo,due,myTurn}, cursor, limit}` — `spaceKey` 삭제 | `{items:InboxItem[], nextCursor, hasMore}` — §2.3 | — | inbox(InboxPage·InboxTable·exportInboxExcel) |
| getInboxCounts | SELF → SELF | 위 filters 동일 | `{statusCounts:{[status]:n}, myTurnCount}` (무변경) | — | inbox |
| listNotifications | SELF → SELF | 무변경 `{cursor, limit}` | `{items:NotificationItem[], nextCursor, hasMore}` — §2.3 | — | inbox(NotificationPanel) |
| markNotificationsRead | SELF | 무변경 | 무변경 | — | inbox |
| getUnreadCount | SELF | 무변경 | 무변경 | — | inbox |
| getApprovalSettings | {admin} | 무변경 | 정책 키 변경 §5.4: `commentNotifyEnabled`·`stampBoxAutoInsert` 삭제, `approverSpaceCheck`→**`approverAccessCheck`** | — | settings(PolicySettings) |
| saveApprovalSettings | {admin} | patch 키 동일 변경 | 동일 | `INVALID_TARGET` | settings |
| **listProjects** (구 listSpaces) | {admin} | `{q, cursor}` (cursor = startAt 문자열) | `{items:[{id,key,name,avatarUrl,enabled}], nextCursor, hasMore, configured}` — 구 `icon`→`avatarUrl` | — | settings(ProjectSettings·FlowFormModal 프로젝트 선택) |
| **setProjectEnabled** (구 setSpaceEnabled) | {admin} | `{projectId, enabled}` | `{projectId, enabled, openCount}` | `INVALID_TARGET` | settings |
| **getProjectPolicy** (구 getSpacePolicy) | {admin} | `{projectId}` | `{projectId, overridableKeys, global, override, effective}` | `INVALID_TARGET` | settings(ProjectPolicyModal) |
| **saveProjectPolicy** (구 saveSpacePolicy) | {admin} | `{projectId, patch}` | getProjectPolicy 와 동일 | `INVALID_TARGET` | settings |
| listManagers / setManagers | {admin} | 무변경 | 사용자 DTO 에서 `isConfluenceAdmin` 삭제 | `LAST_MANAGER_REQUIRED` | settings |
| listApprovers / setApprovers | {admin} | 무변경 | 동일 | — | settings |
| listSettingsAudit | {admin} | 무변경 | `area` 값 `'space'`→**`'project'`**, detail 의 `spaceKey`→`projectId` | — | settings(AuditSettings) |
| getStorageUsage | {admin} | 무변경 | 무변경(테이블명만 바뀜) | — | settings(DataSettings) |
| getRetention / setRetentionYears | {admin} | 무변경 | 무변경 | — | settings |
| exportExpiredApprovals | {admin} | 무변경 | `requests[]` 항목: `resourceType,pageId,pageTitle,spaceKey` → **`targetKind,targetKey,issueId,issueKey,targetTitle,projectId`** | — | settings(exportRetentionExcel) |
| confirmApprovalExport / purgeExportedApprovals | {admin} | 무변경 | 무변경 | `RETENTION_EXPORT_REQUIRED` | settings |
| listFlows / getFlow | {admin} | 무변경 | flow DTO `spaceKeys` → **`projectIds`** | — | settings(FlowSettings·FlowFormModal) |
| createFlow / updateFlow | {admin} | `spaceKeys` → **`projectIds`** (string[], 각 `^\d{1,18}$`) | 동일 | `INVALID_TARGET`, `INVALID_APPROVER_CONFIGURATION` | settings |
| setFlowEnabled / deleteFlow | {admin} | 무변경 | 무변경 | — | settings |
| listAvailableFlows | SELF | `{spaceKey}` → **`{projectId}`** | 동일(DTO `projectIds`) | — | modal(RequestForm) |
| listGroups | SELF | 무변경 `{q, cursor}` | `{items:[{id,name}], nextCursor, hasMore}` (id = Jira groupId) | — | settings(GroupFormModal) |
| listDirectoryUsers | {admin} | 무변경 | 사용자 DTO `isConfluenceAdmin` 삭제 | — | settings(UserPickerDialog) |
| listGroupMembers | SELF | 무변경 `{groupId, cursor}` | 사용자 DTO 동일 변경 | — | settings |
| searchUsers / resolveUsers | SELF | 무변경 | 사용자 DTO `{accountId, displayName, avatarUrl, accountStatus}` (`isConfluenceAdmin` 삭제) | — | 전 화면 |
| listApprovalGroups / create / update / deleteApprovalGroup | {admin} | `type` 값 `'CONFLUENCE'` → **`'JIRA'`** | 그룹 DTO `type` 동일 변경 | `GROUP_NAME_CONFLICT`, `INVALID_TARGET` | settings(GroupSettings) |
| **getApprovalDetail** (신규, 구 getPageApproval 의 상세 용도) | **SELF** + 서비스가 어댑터 `canView` | `{requestId}` | `ApprovalView` §2.2 | `REQUEST_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED` | modal(detail/reject/cancel) |
| **getIssueApproval** (구 getPageApproval) | `{page:view}` → **{issue:view}** | `{issueId}` | `ApprovalView` (그 이슈의 ISSUE 대상 최신 요청, 없으면 `approval:null`) | `INVALID_TARGET` | modal(issue 컨텍스트에서 intent 없이 열릴 때 — 이번엔 진입점 없음, Q1) |
| **createIssueApproval** (구 createApproval) | `{page:edit}` → **{issue:edit}** | `{issueId, steps, ccKeys, expiresAt, requestMessage, flowId, supersedes}` — `pageId,regionId,regionHash,insertStampBox` 삭제 | `{requestId, status, currentStepOrder}` (무변경) | `ALREADY_OPEN`, `INVALID_TARGET`, `INVALID_APPROVER_CONFIGURATION`, `APPROVER_NOT_REGISTERED`, `APPROVER_NO_ACCESS` | modal(RequestForm) |
| decideApproval | SELF | 무변경 `{requestId, decision, reason, pin}` | 무변경 | `PERMISSION_TARGET_VIEW_DENIED`(구 PAGE_VIEW), `REQUEST_NOT_PENDING`, `REJECTION_REASON_REQUIRED`, `PIN_*`, `APPROVER_NOT_ELIGIBLE`, `ALREADY_DECIDED`, `CONCURRENT_MODIFICATION` | modal(DecisionForm) |
| bulkApprove | SELF | 무변경 | 무변경 | `INVALID_TARGET`, `PIN_*` | inbox(BulkApproveBar) |
| cancelApproval | SELF | 무변경 | 무변경 (회수 권한: 요청자 또는 **`isJiraAdmin`**) | `PERMISSION_DENIED`, `REQUEST_NOT_PENDING` | modal |
| searchApprovers | SELF | 무변경 `{term, allowAll}` | `{users:[{accountId,displayName,avatarUrl}], groups:[{id,name}]}` | — | modal(RequestForm)·settings(FlowFormModal) |
| getRequestDefaults | SELF | `{pageId}` → **`{projectId}`**(선택) | `{defaultDeadlineDays, flows, approvalGroups}` — **`stampBoxAutoInsert` 삭제** | — | modal(RequestForm)·settings |
| getApprovalHistory | `{page:view}` → **SELF** + 어댑터 `canView` | `{pageId, regionId}` → **`{requestId}`** | `{items:[{requestId, revision, contentVersion, status, createdAt, updatedAt, requesterKey, events}]}` (항목 shape 무변경, 같은 `target_kind+target_key` 의 요청들) | `REQUEST_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED` | modal(ApprovalDetail 이력) |
| getApprovalCertificate | `{page:view}` → **SELF** + 어댑터 `canView` | `{pageId, requestId}` → **`{requestId}`** | §2.2 Certificate | `REQUEST_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED` | modal(exportCertificatePdf) |
| getMySignature / saveMySignature / deleteMySignature / getSignatures / getMyPinStatus / setMyPin / removeMyPin | SELF | 무변경 | 무변경 | `PIN_*` | inbox(SignaturePanel)·modal |
| getMyDelegation / setMyDelegation / clearMyDelegation | SELF | 무변경 | 무변경 | `DELEGATION_DISABLED` | inbox(DelegationPanel) |

**requestId 기반 resolver 를 SELF + 서비스 검사로 바꾸는 이유.** 가드 축은 resolver 이름마다 정적이라, 한 resolver 가 대상 종류별로 다른 축(이슈 열람 / 팀장 / 본인)을 가질 수 없다. 상세·이력·증명서는 대상이 무엇이든 `requestId` 로 들어오므로 축을 SELF 로 두고, 서비스가 `load(requestId)` → `registry.get(state.targetKind).canView(target, principal)` 로 **fail-close** 확인한다(불변식 7). `decideApproval` 은 Confluence 판에서도 이미 이 구조였다. 이로써 증명서의 "요청이 그 페이지 것인지" 2차 확인이 필요 없어진다(입력에 대상 id 가 없다).

### 2.2 응답 shape — 바뀌는 객체

```
TargetView = {
  kind: 'ISSUE',
  key: '10042',                 // target_key
  issueId: '10042' | null,
  issueKey: 'OPS-12' | null,     // 표시·링크용(이동하면 바뀐다 — 매 조회 시 Jira 값 우선)
  title: string,                 // 이슈 summary (조회 실패 시 스냅샷)
  projectId: '10000' | null,
  projectKey: 'OPS' | null,
  projectName: string | null,
  revision: number | null        // 대상 리비전. ISSUE 는 개념이 없어 null
}

ApprovalView = {                 // getApprovalDetail · getIssueApproval
  approval: ApprovalContent | null,
  target: TargetView,            // 구 page:{id,title,version,spaceKey,webui…}
  canRequest: boolean,           // 이 대상의 최신 요청이 열려 있지 않고 어댑터 canRequest 가 true
  pin: { required, hasPin }      // approval 이 있을 때만
}

ApprovalContent                  // 무변경 + 아래만
  - regionId                     삭제
  + targetKind                   추가
  isStale / approvedContentVersion / requestedContentVersion / contentVersion / canResubmit
                                 유지(대상 리비전 개념). ISSUE 는 revision=null → isStale=false, canResubmit=false
  canCancel                      requester 또는 principal.isJiraAdmin (구 isConfluenceAdmin)
  statusLabelKey                 'banner.status.x' → 'state.status.x'

Certificate                      // getApprovalCertificate
  - resourceType, regionId, page:{id,title,spaceKey}     삭제
  + targetKind, target: TargetView
  contentVersion, currentVersion 유지(ISSUE: 0 / null)
  contentHash                    어댑터 fingerprint 결과. ISSUE 는 null(대상에 불변 버전이 없어 재현 가능한 지문을 만들 수 없다)
```

### 2.3 목록 항목 shape

**InboxItem** — SQL `*` 원본 컬럼(snake) + 서버 보강 필드(camel). 프론트는 지금처럼 `valueOf(item, camel, snake)` 로 읽는다.

| 구분 | 삭제 | 추가 |
|---|---|---|
| 원본 컬럼 | `space_key`, `page_id`, `resource_type` | `target_kind`, `target_key`, `project_id`, `issue_id`, `issue_key`, `subject_account` |
| 보강 필드 | `spaceName`, `spaceIcon`, `title`(페이지), `page_version` | `title`(이슈 summary), `issueKey`(현재 값), `projectKey`, `projectName`, `projectAvatarUrl` |
| 유지 | 나머지(`request_id`, `status`, `my_turn`, `current_step_name`, `expires_at`, `title_norm`, `onBehalfOf` …) | |

**NotificationItem** — `pageId`, `pageTitle` 삭제 → `targetKind`, `targetKey`, `issueId`, `issueKey`, `title`, `projectId` 추가. `templateKey`·`vars` 무변경.

### 2.4 제거하는 resolver

`getPageApproval`, `createApproval`, `getRegionApproval`, `createRegionApproval`, `listSpaces`, `getSpacePolicy`, `saveSpacePolicy`, `setSpaceEnabled` — PermissionMap·Controller 에서 함께 삭제(계약 테스트 "죽은 선언 없음"이 검증).

### 2.5 프론트 호출 대응

| 화면 | 호출 |
|---|---|
| inbox 상세 열기 | `new Modal({resource:'main/modal', context:{intent, requestId, issueId?}})` → modal 이 `getApprovalDetail({requestId})` |
| modal 요청/재상신 | `getRequestDefaults({projectId})` → `createIssueApproval({issueId,…})` (issueId 는 modal context 또는 `ApprovalView.target.issueId`) |
| modal intent 없음(이슈 컨텍스트) | `getIssueApproval({issueId})` — 이번엔 진입점 없음 |
| 이력 | `getApprovalHistory({requestId})` |
| 증명서 | `getApprovalCertificate({requestId})` |
| 설정 프로젝트 탭 | `listProjects` / `setProjectEnabled` / `getProjectPolicy` / `saveProjectPolicy` |
| projectSettings 엔트리 | 호출 없음(정적 안내) |

---

## 3. 도메인 (`src/domain/approval/**` — 순수)

### 3.1 시그니처

```js
// constants.js
export const TargetKind = Object.freeze({ ISSUE: 'ISSUE' });       // ResourceType 대체(이름 변경)
export const CancelReason = Object.freeze({ SUPERSEDED: 'SUPERSEDED' }); // REGION_REMOVED 삭제
export const ExpiryReason = Object.freeze({ DEADLINE, CONTENT_VERSION }); // 유지 — 대상 변경 감지 사유(타임시트 재사용 후보)

// scopeKey.js  — crypto import 제거(영역 해시가 없어진다)
const TARGET_KEY_MAX = 180;                         // 'open:' + prefix + ':' + key ≤ 200 (dedupe_key 길이)
const NUMERIC_ID = /^\d{1,18}$/;
export const SCOPE_PREFIX = Object.freeze({ ISSUE: 'ISSUE' });
const TARGET_KEY_BUILDERS = Object.freeze({
  ISSUE: ({ issueId }) => (NUMERIC_ID.test(String(issueId ?? '')) ? String(issueId) : null),
});
export const targetKeyOf = (target) => string   // 미지원 kind·형식 불량·길이 초과 → LogicalError(INVALID_TARGET)
export const scopeKey   = (target) => `${SCOPE_PREFIX[target.kind]}:${targetKeyOf(target)}`
export const openDedupeKey, closedDedupeKey     // 무변경

// eventId.js
const NAMESPACE = 'kr.dmove.jira.approval';     // 'kr.dmove.confluence.approval' 에서 교체(첫 배포 전이라 안전)
```

`transitions.js` / `derive.js` / `normalizeSteps.js` 는 **코드 무변경**(주석의 "Confluence 관리자"·"byline" 단어만 정리). `contentVersion` 은 "대상 리비전"으로 의미를 넓혀 그대로 쓴다 — 이름을 바꾸면 이벤트·만료·파생 전부를 건드려야 하고 이득이 없다. `expireByContentVersion` 은 이번에 호출처가 없어지지만(편집 트리거 제거) 순수 함수·테스트가 있고 타임시트 "제출 후 변경"이 쓸 후보라 남긴다.

### 3.2 테스트 케이스 (`__test__/transitions.test.js` 의 scopeKey 블록 교체 + 추가)

1. `scopeKey({kind:'ISSUE', issueId:'10042'})` === `'ISSUE:10042'`
2. 같은 이슈는 `contentVersion` 이 달라도 같은 `openDedupeKey`(편집해도 열린 요청은 하나)
3. 숫자 아닌 issueId(`'OPS-12'`, `''`, `undefined`, `'1;DROP'`) → `INVALID_TARGET`
4. 미지원 kind(`'PAGE'`, `'TIMESHEET'`) → `INVALID_TARGET` (어댑터 없이 키가 만들어지지 않음)
5. `openDedupeKey` 길이 ≤ 200
6. 결정적 이벤트 id — 같은 입력 같은 id(기존 유지), 네임스페이스가 바뀐 것은 리터럴 고정 테스트가 있으면 갱신
7. 기존 `PAGE`/`CONTENT_REGION` 케이스 3건 삭제(`페이지 대상은 regionId 를 쓰지 않는다`, `영역 키는 길이가 고정된다` 등)

`regionHash.test.js` 는 파일째 삭제.

---

## 4. 백엔드

### 4.1 대상 어댑터 (`src/resolver/approval/target/`)

```js
// TargetRegistry.js
export const createTargetRegistry = (adapters) => ({ get(kind) /* 없으면 LogicalError INVALID_TARGET */, kinds() })
export const targetRegistry = createTargetRegistry({ ISSUE: issueTargetAdapter });

// 어댑터 인터페이스 — 서비스가 대상에 대해 묻는 것은 이것뿐이다
{
  kind,
  parse(payload)                       → target            // 입력 검증, 실패 INVALID_TARGET
  targetOf(state)                      → target            // 저장된 요청 → target
  describe(target)                     → TargetSnapshot    // asUser. 볼 수 없거나 없으면 INVALID_TARGET
  canView(target, principal)           → boolean           // fail-close
  canRequest(target, principal)        → boolean           // fail-close
  userCanView(target, accountId)       → boolean | null    // 결재선 자격(정책 approverAccessCheck). null = 판정 불가
  filterVisible(rows, principal)       → { visible:Set<requestKey>, meta:Map<targetKey, TargetSnapshot> }
  fingerprint(target, state)           → { hash } | null   // 증명서 지문. ISSUE 는 null
  columnsOf(target, snapshot)          → { target_key, project_id, issue_id, issue_key, transition_id, subject_account, period_key, target_title, content_version, content_hash }
}

TargetSnapshot = { title, issueId, issueKey, projectId, projectKey, projectName, projectAvatarUrl, revision }
```

`IssueTargetAdapter` 구현:

| 메서드 | Jira 호출(asUser) |
|---|---|
| describe | `GET /rest/api/3/issue/{issueId}?fields=summary,project` → summary·key·project{id,key,name,avatarUrls.48x48}. revision=null |
| canView / canRequest | `JiraPermission.hasIssuePermission(issueId,'view'/'edit')` |
| userCanView | `JiraPermission.userCanViewIssue(issueId, accountId)` |
| filterVisible | `JiraPermission.filterVisibleIssues(issueIds)` |
| fingerprint | 항상 null |

### 4.2 `src/api/jira/RequestJira.js`

`RequestConfluence` 와 같은 구조로 `client.requestJira` 를 호출한다. 그대로 옮길 것: `allowStatuses`, 본문을 message 에 싣지 않음, `asApp(path, init, {reason})` 사유 없으면 throw, `route` re-export. 에러는 `JiraApiError(ErrorCodes.JIRA_API_FAILED, 'Jira API {status}', status)`.
**이번 범위의 asApp 사용처는 0건**(편집 트리거·`loadPageAsApp` 제거). 라이선스 self-query 는 `LicenseGuard` 가 `requestAtlassian` 으로 따로 부른다(무변경). AGENTS.md 허용 목록과 충돌 없음.

### 4.3 `src/permission/JiraPermission.js` (구 ConfluencePermission)

```js
export const ISSUE_PERMISSION = { view: 'BROWSE_PROJECTS', edit: 'EDIT_ISSUES' };
getMyPermissions({ issueId?, projectId?, keys })  // GET /rest/api/3/mypermissions?issueId=|projectId=&permissions=K1,K2 → Set(havePermission=true). 실패 → 빈 Set
hasIssuePermission(issueId, 'view'|'edit')        // 숫자 id 아니면 false(fail-close). GET 1회에 두 키를 함께 물어 invocation 안 캐시
hasProjectAdmin(projectId)                        // ADMINISTER_PROJECTS 또는 ADMINISTER
isJiraAdmin()                                     // GET /rest/api/3/mypermissions?permissions=ADMINISTER
userCanViewIssue(issueId, accountId)              // GET /rest/api/3/user/viewissue/search?issueId=&accountId=&maxResults=1 → 결과에 그 accountId 가 있으면 true, 비면 false, 오류 null
filterVisibleIssues(issueIds)                     // ① POST /rest/api/3/permissions/check
                                                  //    {projectPermissions:[{permissions:['BROWSE_PROJECTS'], issues:[숫자 id…]}]} → 허용 id 집합
                                                  //    실패 → 빈 집합(fail-close, 전체 숨김)
                                                  // ② 허용 id 만 POST /rest/api/3/issue/bulkfetch {issueIdsOrKeys, fields:['summary','project']} (100개씩)
                                                  //    실패해도 ①의 판정은 유지하고 meta 만 비운다(스냅샷으로 표시)
                                                  // → { visible:Set<string>, issues:Map<id, TargetSnapshot> }
```

- 두 단계로 나누는 이유: Confluence 판은 "벌크 조회 응답 누락 = 권한 없음"을 썼지만 Jira 의 bulkfetch 가 권한 없는 id 를 어떻게 돌려주는지(누락/`issueErrors`)는 미검증이다(§10). 판정은 문서로 확인된 `permissions/check` 로 하고, bulkfetch 는 표시용 메타만 맡긴다.
- `user/bulk` 처럼 반복 쿼리 파라미터가 필요한 곳은 Confluence 판의 **template strings 배열 + `route(strings, ...values)`** 를 그대로 쓴다(route 인코딩 함정).

### 4.4 가드 (`permissionGuard.js` · `PermissionMap.js` · `PrincipalResolver.js` · `AppAccess.js`)

```
meta.issue: 'view'|'edit'   payload[meta.issueIdKey ?? 'issueId'] 없거나 숫자 아니면 거부
                            hasIssuePermission 실패 → PERMISSION_ISSUE_VIEW_DENIED / PERMISSION_ISSUE_EDIT_DENIED
meta.project: 'admin'       payload[meta.projectIdKey ?? 'projectId'] → hasProjectAdmin, 실패 → PERMISSION_PROJECT_ADMIN_REQUIRED
                            (이번엔 PermissionMap 에 쓰는 곳 없음 — projectSettingsPage 자리용. 가드·계약 테스트만)
meta.jiraAdmin: true        principal.isJiraAdmin 아니면 PERMISSION_ADMIN_REQUIRED (이번엔 쓰는 곳 없음)
meta.admin: true            principal.isAdmin = isJiraAdmin || isSettingsManager (구 isConfluenceAdmin)
```

- `principal` 필드 `isConfluenceAdmin` → **`isJiraAdmin`**. 판정 = `JiraPermission.isJiraAdmin()`(fail-close), invocation 캐시 유지.
- `AppAccess.assertAppAccess` 면제 조건 `isConfluenceAdmin` → `isJiraAdmin`.
- `{teamLead:true}` 축은 CLAUDE.md 에 있으나 **이번에 구현하지 않는다**(타임시트 기능 몫). 계약 테스트의 축 화이트리스트에도 넣지 않는다.
- 계약 테스트(`test/permission/permissionMap.contract.test.js`) "형태" 검사: `meta.page` 블록 → `meta.issue ∈ {view,edit}` + issueIdKey 문자열, `meta.project === 'admin'` + projectIdKey 문자열, 최소 한 축 = `issue || project || admin || jiraAdmin`.

### 4.5 서비스별 변경

**ApprovalService**
- 생성자 주입: `pageLoader`·`permissionChecker`·`userPermissionChecker`·`nativeNotifier`·`stampBoxInserter` 삭제 → `targets = targetRegistry` 추가. `directorySearch`·`groupMemberLoader`·`groupMemberByNameLoader` 는 Jira 구현으로 교체(같은 파일의 `searchDirectory`·`loadGroupMembersByName` 재작성: `user/search` + `groups/picker`, `group/member?groupname=` 50개씩 최대 20페이지 = 1000명 상한).
- `policyLoader({projectId})` → `settingsRepository.getEffectivePolicy(projectId)`.
- 공용 내부 메서드로 정리: `viewForTarget(principal, target, state)` → ApprovalView, `createForTarget(request, target)`, `historyOf(state)`.
- `getIssueApproval` = `adapter.parse({kind:'ISSUE', issueId})` → `findLatestForTarget({targetKind, targetKey})` → `viewForTarget`.
- `getApprovalDetail` = `load(requestId)` → `adapter.canView` 실패 시 `PERMISSION_TARGET_VIEW_DENIED` → `viewForTarget`. `canRequest` = 이 요청이 그 대상의 최신이고 PENDING 아님 && `adapter.canRequest`.
- `createIssueApproval` → `createForTarget`: `describe` + 결재선 확장(병렬) → `assertApproversAllowed(steps, target, principal, projectId)`(정책 `approverAccessCheck` 가 false 가 아니면 `adapter.userCanView`, 명시적 false 만 거절 — 기존 규칙 유지) → `expandCc` → `supersede`(같은 `targetKind+targetKey` 여야 함) → `repository.createRequest({target, columns: adapter.columnsOf(target, snapshot), …})`.
- `notifyNative`·`insertStampBoxIfRequested` 메서드 삭제. `decideApproval`·`cancelApproval` 의 `notifyNative` 호출 삭제(앱 내 알림 `appNotifier` 는 유지).
- `decideApproval`: `permissionChecker(state.pageId, VIEW)` → `targets.get(state.targetKind).canView(targetOf(state))`, 거부 코드 `PERMISSION_TARGET_VIEW_DENIED`.
- `cancelApproval` / `approvalContent.canCancel`: `isConfluenceAdmin` → `isJiraAdmin`.
- `statusLabelKey` → `state.status.{x}`.
- `APP_DEFAULT_LOCALE` import 삭제(유일한 남은 소비처가 없어져 `src/i18n/defaultLocale.js` 도 삭제).

**ApprovalRepository** — CAS·결정·이벤트 로직 무변경. 컬럼 매핑만:
- `createRequestLive`: INSERT 컬럼 `resource_type,page_id,region_id,region_hash,space_key,page_title` → `target_kind,target_key,project_id,issue_id,issue_key,transition_id,subject_account,period_key,content_hash,target_title`. revision 계산 `WHERE target_kind=? AND target_key=?`.
- `insertInitialInbox`: 투영 컬럼 동일 변경(`space_key,page_id,resource_type` → `target_kind,target_key,project_id,issue_id,issue_key,subject_account`).
- `load()` 반환 state: `resourceType,pageId,regionId,regionHash,spaceKey,pageTitle` → `targetKind,targetKey,projectId,issueId,issueKey,transitionId,subjectAccount,periodKey,contentHash,targetTitle`.
- `findLatestForTarget({targetKind,targetKey})`, `listHistory({targetKind,targetKey})`.
- `findLatestSummary`(byline 전용), `findOpenByPage`(편집 트리거 전용) **삭제**.
- `findReminderCandidates`·`findDueSoon` 반환 `spaceKey` → `projectId`.
- `expireByContentVersion`·`cancelBySystem` 유지(엔진 경로, 이번엔 호출처 없음).

**CertificateService** — `versionHash`·`currentVersion` 주입 삭제 → `targets`. `load(requestId)` → `canView` → `adapter.fingerprint(target, state)`(ISSUE null) → §2.2 Certificate. Confluence 본문 조회 함수 `loadVersionHash`·`loadCurrentVersion` 삭제.

**ExpiryService** — `handlePageUpdated`·`loadPageAsApp`·`pageLoader`·`findRegionOccurrences` import 삭제. `spacePolicyLoader` → `projectPolicyLoader = settingsRepository.listAllProjectPolicyOverrides()`, `policyFor(projectId)`. 스윕(`expireDue`·`notifyDueSoon`·`notifyReminders`·`purgeAudit`·리스) 무변경. 리스·결정적 event_key 그대로.

**InboxService** — `loadVisibleSpaces`·`loadSpaceById`·`normalizeVisibleSpaces`·`resolveSpaceKey`·`fillMissingSpaceNames` 삭제.
- **SQL 1차 가시성 필터(visible space whereIn)를 없앤다.** Jira 에서 "사용자가 볼 수 있는 프로젝트 전수"는 `project/search` 페이지네이션(50개/페이지)이라 프로젝트 1,000개 사이트에서 업무함 1회에 20콜이 된다. 업무함 행은 애초에 `actor_key ∈ {나, 나에게 위임한 사람}` 으로 좁혀져 있고 2차 필터가 건별로 fail-close 하므로 1차 필터 없이도 불변식 7 을 지킨다.
- 프로젝트 필터: `filters.projectKey` → `GET /rest/api/3/project/{projectKey}`(asUser) 로 id 확인(404/403 이면 빈 결과 즉시 반환) → SQL `project_id = ?`.
- 2차 필터: 창(window)의 행을 `target_kind` 별로 묶어 `targets.get(kind).filterVisible(rows)`. **등록되지 않은 kind 의 행은 버린다**(fail-close).
- 스냅샷 수렴: Jira 값과 다르면 `inboxRepository.updateSnapshot({requestId, titleNorm, issueKey, projectId})`(이슈 이동으로 키·프로젝트가 바뀌는 경우).
- `getInboxCounts`: SQL 집계만(가시성 필터 없음). 권한을 잃은 이슈의 내 참여 건이 숫자에 포함될 수 있다 — 내용은 노출되지 않고, Confluence 판에도 "권한 밖 제외 전 건수" 안내가 있었다(`filter.countBeforePermission`). 그대로 수용.

**InboxRepository** — `effectiveSpaceKeys`·`whereIn('space_key', …)` 삭제(빈 배열 fail-open 가드도 함께 사라진다 — 1차 필터 자체가 없다). `projectId` 필터는 `whereRaw('project_id = ?')`. `myTurnCount({actorKey})`. `updateSnapshot` 컬럼 변경. 제목 검색 `title_norm LIKE` 유지.

**NotificationService / Repository** — `comments`(CommentNotifier) 주입·호출 삭제. `permissionFilter = filterVisiblePages` → `targets` 기반 kind 별 `filterVisible`. JOIN 컬럼 `r.page_id, r.page_title` → `r.target_kind, r.target_key, r.issue_id, r.issue_key, r.target_title, r.project_id`. `notificationTemplate` 의 `CONTENT_VERSION` 매핑은 유지(문구만 대상 중립으로), `REGION_REMOVED` 관련 분기가 있으면 삭제.

**SettingsRepository / SettingsService / SettingsController** — §5.4 정책 키. `SPACE_TABLE` → `PROJECT_TABLE='approval_project_config'`, 메서드명 `*Space*` → `*Project*`(`isProjectScopeConfigured`, `getProjectStates`, `setProjectEnabled`, `getProjectPolicyOverride(s)`, `saveProjectPolicy`, `listAllProjectPolicyOverrides`, `getEffectivePolicy(projectId)`), `SPACE_OVERRIDABLE_KEYS` → `PROJECT_OVERRIDABLE_KEYS`. `listProjects` = `GET /rest/api/3/project/search?startAt=&maxResults=50&query=&orderBy=name`(asUser; 서버 쪽 검색으로 바뀌어 클라이언트 필터 `matchesSpace` 삭제). `countOpenApprovals(projectId)`. 감사 `area:'project'`. 입력 검증: `projectId` `^\d{1,18}$`.

**FlowService / FlowRepository** — `spaceKeys`→`projectIds`, `approval_flow_space`→`approval_flow_project`(`project_id`), `listAvailableFlows({projectId})`(행 없음 = 전 프로젝트, 규칙 유지).

**DirectoryService** — Confluence REST 전부 교체:

| 메서드 | Jira REST (asUser) |
|---|---|
| listGroups `{q}` 있음 | `GET /rest/api/3/groups/picker?query=&maxResults=50` |
| listGroups `{q}` 없음 | `GET /rest/api/3/group/bulk?startAt=&maxResults=50` |
| listGroupMembers | `GET /rest/api/3/group/member?groupId=&startAt=&maxResults=50&includeInactiveUsers=false` |
| searchUsers | `GET /rest/api/3/user/search?query=&maxResults=20` → `accountType==='atlassian' && active` 만 |
| listDirectoryUsers | `GET /rest/api/3/users/search?startAt=&maxResults=100` → 같은 필터(스캔 방식 유지) |
| resolveUsers | `GET /rest/api/3/user/bulk?accountId=…&accountId=…&maxResults=50` (route 배열, 50개씩) |
| jiraGroupExists(구 confluenceGroupExists) | `GET /rest/api/3/group/bulk?groupName=` |

- `normalizeUser`: `avatarUrl = avatarUrls['48x48']`(Jira 는 절대 URL), `isConfluenceAdmin` 삭제, `absoluteAvatarUrl` 은 상대 경로가 올 때만 붙이는 기존 동작 유지. 커서는 `startAt` 숫자 문자열(`nextCursorOf` 의 `_links.next` 파싱 → `isLast`/`total` 기반).
- `GROUP_TYPES = {'JIRA','CUSTOM'}`.

**RetentionRepository / RetentionService** — export SELECT 컬럼 §2.1 표대로. 자식 테이블 목록 무변경.

**StorageService** — 무변경(information_schema 조회).

**트리거** — `onPageUpdated`·`bylineProperties` 삭제. `onInstall`·`runSweep` 무변경. `src/index.js` 에서 export·`registerRegionController` 삭제.

### 4.6 CAS·불변식 점검

| 불변식 | 이번 변경에서의 상태 |
|---|---|
| 1 열린 요청 하나 | `dedupe_key` UNIQUE 유지, 키 = `open:ISSUE:{issueId}` |
| 2 결정이 진실 | 무변경 |
| 3 도메인 순수 | scopeKey 에서 crypto 제거, 새 코드 없음 |
| 4 rev+1 | 무변경 |
| 5 승인자 행 조건부 UPDATE | 무변경 |
| 6 결정적 id | 네임스페이스만 교체(첫 배포 전) |
| 7 가드≠범위 | 업무함·알림 2차 필터 = 어댑터 `filterVisible`(fail-close, 미등록 kind 버림), 상세·이력·증명서·결정 = 어댑터 `canView` |
| 8 asUser 기본 | asApp 사용 0건 |
| 9 프로퍼티 불신 | 해당 없음(프로퍼티 미사용) |
| 10 validator 함수형 | 해당 없음 |

---

## 5. 스키마·마이그레이션

### 5.1 재정리 원칙

- **어떤 사이트에도 배포되지 않았으므로 v001 부터 다시 번호를 매긴다.** 이번이 이름을 바꿀 수 있는 마지막 기회다 — 첫 배포 뒤로는 enqueue 이름 변경 금지.
- Confluence 판의 ALTER 6개(v014~v018 step_name·resource_type, v023 policy_json)와 인덱스 2개(v024·v025)는 **CREATE 에 흡수**한다.
- 다음 기능을 위한 **대상 식별 컬럼(kind·key·issue·transition·subject·period)은 지금 넣는다** — dedupe·인덱스 설계를 정하는 컬럼이라 나중에 ALTER 로 붙이면 인덱스를 다시 짜야 한다. 반면 **기능 고유 상태 컬럼**(`consumed_at`, 스냅샷 JSON, 위반 코드)은 각 기능이 `vNNN_alter_*` 로 붙인다.

### 5.2 enqueue 목록 (새 v001~v015)

| 이름 | DDL 상수 | 파일 |
|---|---|---|
| v001_create_approval_job_state_table | CREATE_APPROVAL_JOB_STATE_TABLE | approvalJobState.sql.js (무변경) |
| v002_create_approval_request_table | CREATE_APPROVAL_REQUEST_TABLE | approvalRequest.sql.js |
| v003_create_approval_approver_table | CREATE_APPROVAL_APPROVER_TABLE | approvalApprover.sql.js (+step_name) |
| v004_create_approval_event_table | CREATE_APPROVAL_EVENT_TABLE | approvalEvent.sql.js (무변경) |
| v005_create_approval_inbox_table | CREATE_APPROVAL_INBOX_TABLE | approvalInbox.sql.js |
| v006_create_approval_notification_table | CREATE_APPROVAL_NOTIFICATION_TABLE | approvalNotification.sql.js (+ix_notif_request) |
| v007_create_approval_project_config_table | CREATE_APPROVAL_PROJECT_CONFIG_TABLE | approvalProjectConfig.sql.js (구 approvalSpaceConfig) |
| v008_create_approval_flow_table | CREATE_APPROVAL_FLOW_TABLE | approvalFlow.sql.js (무변경) |
| v009_create_approval_flow_step_table | CREATE_APPROVAL_FLOW_STEP_TABLE | approvalFlow.sql.js (+step_name) |
| v010_create_approval_flow_project_table | CREATE_APPROVAL_FLOW_PROJECT_TABLE | flowProject.sql.js (구 flowSpace) |
| v011_create_approval_group_table | CREATE_APPROVAL_GROUP_TABLE | approvalGroup.sql.js (무변경) |
| v012_create_approval_signature_table | CREATE_APPROVAL_SIGNATURE_TABLE | approvalSignature.sql.js (무변경) |
| v013_create_approval_pin_table | CREATE_APPROVAL_PIN_TABLE | approvalPin.sql.js (무변경) |
| v014_create_approval_settings_audit_table | CREATE_APPROVAL_SETTINGS_AUDIT_TABLE | auditDelegation.sql.js (무변경) |
| v015_create_approval_delegation_table | CREATE_APPROVAL_DELEGATION_TABLE | auditDelegation.sql.js (무변경) |

삭제 파일: `stepName.sql.js`, `retention.sql.js`. `ddl/index.js` re-export 정리. `migrate.test.js` 의 이름 목록 갱신(기존 "단일 문장"·"CREATE/ALTER 로 시작"·"v002 dedupe UNIQUE" 검사는 그대로 통과해야 한다).

### 5.3 테이블 정의 (변경분)

```sql
CREATE TABLE IF NOT EXISTS approval_request (
    request_id             BINARY(16)   NOT NULL,
    commit_state           VARCHAR(8)   NOT NULL DEFAULT 'DRAFT',
    target_kind            VARCHAR(24)  NOT NULL,          -- ISSUE | ISSUE_TRANSITION | TIMESHEET
    target_key             VARCHAR(191) NOT NULL,          -- 종류 안 식별자(§1.1). 이력·재상신 묶음 기준
    project_id             VARCHAR(32)  NULL,              -- 프로젝트 정책·결재선 범위. TIMESHEET 는 NULL
    issue_id               VARCHAR(32)  NULL,
    issue_key              VARCHAR(64)  NULL,              -- 표시 스냅샷(이동하면 바뀐다)
    transition_id          VARCHAR(32)  NULL,              -- 예약(ISSUE_TRANSITION)
    subject_account        VARCHAR(128) NULL,              -- 예약(TIMESHEET 대상자)
    period_key             VARCHAR(16)  NULL,              -- 예약(TIMESHEET '2026-10' | '2026-W40')
    content_hash           VARCHAR(80)  NULL,              -- 요청 시점 대상 지문(구 region_hash). ISSUE 는 NULL
    dedupe_key             VARCHAR(200) NOT NULL,
    content_version        INT          NOT NULL DEFAULT 0, -- 대상 리비전. 개념이 없는 대상은 0
    revision               INT          NOT NULL,
    minimum_approvals      INT          NOT NULL,
    step_count             INT          NOT NULL,
    status                 VARCHAR(12)  NOT NULL,
    is_open                TINYINT(1)   NOT NULL,
    current_step_order     INT          NOT NULL DEFAULT 1,
    current_step_name      VARCHAR(80)  NULL,
    current_step_opened_at TIMESTAMP    NOT NULL,
    expires_at             TIMESTAMP    NULL,
    created_at             TIMESTAMP    NOT NULL,
    updated_at             TIMESTAMP    NOT NULL,
    requester_key          VARCHAR(128) NULL,
    request_message        VARCHAR(500) NULL,
    flow_id                VARCHAR(64)  NULL,
    prev_request_id        BINARY(16)   NULL,
    target_title           VARCHAR(255) NOT NULL,          -- 구 page_title
    rev                    INT          NOT NULL DEFAULT 1,
    deleted_at             TIMESTAMP    NULL,
    PRIMARY KEY (request_id),
    UNIQUE KEY uq_request_dedupe (dedupe_key),
    INDEX ix_request_due (is_open, expires_at),
    INDEX ix_request_requester (requester_key, is_open, updated_at),
    INDEX ix_request_target (target_kind, target_key, revision),     -- 구 ix_request_scope. 최신·이력·revision MAX
    INDEX ix_request_issue (issue_id, is_open),                      -- 이슈 패널(다음 기능)·이슈 삭제 정리
    INDEX ix_request_subject (subject_account, period_key),          -- 타임시트 사용자×기간(NULL 행은 비용 미미)
    INDEX ix_request_project (project_id, is_open),                  -- 프로젝트 해제 시 열린 건수
    INDEX ix_request_commit (commit_state, created_at),
    INDEX ix_request_retention (is_open, updated_at, request_id)     -- 구 v024
)
```
삭제 컬럼: `resource_type, page_id, region_id, region_hash, space_key, page_title`.

```sql
CREATE TABLE IF NOT EXISTS approval_inbox (
    actor_key          VARCHAR(128) NOT NULL,
    request_id         BINARY(16)   NOT NULL,
    role               VARCHAR(12)  NOT NULL,
    step_order         INT          NULL,
    my_turn            TINYINT(1)   NOT NULL DEFAULT 0,
    my_decided         TINYINT(1)   NOT NULL DEFAULT 0,
    acted_by_me        TINYINT(1)   NOT NULL DEFAULT 0,
    is_open            TINYINT(1)   NOT NULL,
    status             VARCHAR(12)  NOT NULL,
    current_step_order INT          NOT NULL DEFAULT 1,
    current_step_name  VARCHAR(80)  NULL,
    target_kind        VARCHAR(24)  NOT NULL,        -- 구 resource_type(v018)
    target_key         VARCHAR(191) NOT NULL,
    project_id         VARCHAR(32)  NULL,            -- 구 space_key
    issue_id           VARCHAR(32)  NULL,            -- 구 page_id
    issue_key          VARCHAR(64)  NULL,
    subject_account    VARCHAR(128) NULL,
    title_norm         VARCHAR(120) NOT NULL,
    requester_key      VARCHAR(128) NULL,
    flow_id            VARCHAR(64)  NULL,
    created_at         TIMESTAMP    NOT NULL,
    updated_at         TIMESTAMP    NOT NULL,
    expires_at         TIMESTAMP    NULL,
    req_rev            INT          NOT NULL,
    PRIMARY KEY (actor_key, request_id, role),
    INDEX ix_inbox_open (actor_key, role, is_open, updated_at, request_id),
    INDEX ix_inbox_turn (actor_key, my_turn, is_open, updated_at, request_id),
    INDEX ix_inbox_due (actor_key, is_open, expires_at),
    INDEX ix_inbox_recon (request_id, req_rev),
    INDEX ix_inbox_project (actor_key, project_id, is_open, updated_at)
)

CREATE TABLE IF NOT EXISTS approval_project_config (
    project_id  VARCHAR(32)  NOT NULL,
    enabled     TINYINT(1)   NOT NULL DEFAULT 1,
    policy_json MEDIUMTEXT   NULL,                   -- 구 v023 ALTER 흡수
    updated_at  TIMESTAMP    NOT NULL,
    updated_by  VARCHAR(128) NULL,
    PRIMARY KEY (project_id)
)

CREATE TABLE IF NOT EXISTS approval_flow_project (
    flow_id    BINARY(16)  NOT NULL,
    project_id VARCHAR(32) NOT NULL,
    PRIMARY KEY (flow_id, project_id),
    INDEX ix_flow_project_id (project_id)
)
```
- `approval_approver` / `approval_flow_step`: `step_name VARCHAR(80) NULL` 을 CREATE 안으로.
- `approval_notification`: `INDEX ix_notif_request (request_id)` 를 CREATE 안으로.
- `approval_group.group_type` 값: `'JIRA' | 'CUSTOM'`(컬럼 정의 무변경).
- 키 컬럼 폭: Jira id 는 숫자 문자열(≤18자리) → `VARCHAR(32)`. `target_key VARCHAR(191)` 은 `accountId(128) + ':' + periodKey(16)` 수용 + utf8mb4 인덱스 한도.

### 5.4 KVS 정책 키 (SettingsRepository)

| 키 | 처리 |
|---|---|
| `commentNotifyEnabled` | **삭제**(기본값·KVS 맵·정규화·화면 토글 모두) |
| `stampBoxAutoInsert` | **삭제** |
| `approverSpaceCheck` | **`approverAccessCheck`** 로 이름 변경, KVS `approval:settings:approverAccessCheck`, 기본 true. 의미: 결재선 사람이 대상을 볼 수 있는지 요청 시점 확인 |
| `spaceScopeConfigured` | **`projectScopeConfigured`**, KVS `approval:settings:projectScopeConfigured` |
| 나머지 12개 | 무변경 |

`DEFAULT_APPROVAL_SETTINGS` 와 `SETTINGS_KEYS` 는 **같은 집합**이어야 한다(모듈 로드 시 throw + `SettingsPolicyKeys.test.js`). `PROJECT_OVERRIDABLE_KEYS` = 정책 키 − `restrictAccess` − `statusLabels`.

### 5.5 TableReadiness

새 테이블명(`approval_project_config`, `approval_flow_project`)을 참조하는 곳은 `isTableReady` 프로브를 유지한다(이름만 교체). `primeTableReadiness` 에 하드코딩된 목록이 있으면 함께 교체.

---

## 6. Jira 연결

### 6.1 manifest (전체 골격)

```yaml
modules:
  jira:globalPage:
    - key: approval-inbox
      resource: main/inbox
      resolver: { function: resolver }
      title: Moves Approval
      icon: resource:main;logo.png
  jira:adminPage:
    - key: approval-settings
      resource: main/settings
      resolver: { function: resolver }
      title: Moves Approval
  jira:projectSettingsPage:          # 자리만 — 정적 안내, resolver 호출 없음
    - key: approval-project-settings
      resource: main/projectSettings
      resolver: { function: resolver }
      title: Moves Approval
  trigger:
    - key: on-install
      function: onInstall
      events: [avi:forge:installed:app, avi:forge:upgraded:app]
  scheduledTrigger:
    - key: approval-sweep
      function: runSweep
      interval: day
  function:
    - { key: resolver,  handler: index.handler }
    - { key: onInstall, handler: index.onInstall }
    - { key: runSweep,  handler: index.runSweep }
  sql:
    - key: main
      engine: mysql
resources:
  - key: main
    path: static/ui/build
    entry:
      modal: modal.html
      inbox: inbox.html
      settings: settings.html
      projectSettings: projectSettings.html
translations: (무변경)
app:
  runtime: { name: nodejs22.x }
  id: ari:cloud:ecosystem::app/REPLACE-WITH-forge-register   # 유지
permissions:
  scopes:
    - storage:app
    - read:jira-work      # issue, project, mypermissions, permissions/check, bulkfetch, viewissue/search
    - read:jira-user      # user/search, user/bulk, users/search, groups/picker, group/member, group/bulk
  content:
    styles: [unsafe-inline]
```

- 삭제 모듈: `macro`(2), `confluence:contentBylineItem`, `confluence:contentAction`, `confluence:globalPage`, `confluence:spacePage`, `confluence:homepageFeed`, `confluence:globalSettings`, 트리거 `page-updated`, 함수 `onPageUpdated`·`bylineProperties`.
- 삭제 scope: Confluence granular 6종 + classic `read:confluence-content.summary` + `write:page:confluence`·`write:comment:confluence`·`read:comment:confluence`.
- `write:jira-work` 는 **넣지 않는다**(쓰기 경로 없음). 출시 체크리스트 주석(`appIsLicensed`)은 유지.
- `jira:globalPage` 의 `route`·`layout` 속성은 Confluence 판에 있던 `route: approval` 을 옮기지 않는다 — Jira 쪽 지원 여부 미검증(§10).
- `modal` 엔트리는 manifest 모듈이 아니라 `resources[].entry` 로만 존재하고 업무함이 `Modal({resource:'main/modal'})` 로 연다.

### 6.2 asUser / asApp

| 경로 | 클라이언트 | 사유 |
|---|---|---|
| 모든 resolver | asUser | 기본 |
| 스윕(만료·임박·독촉·정리) | Jira REST 호출 없음(SQL 만) | — |
| 라이선스 self-query | `requestAtlassian`(LicenseGuard, 무변경) | AGENTS.md 허용 3번 |

---

## 7. 프론트

### 7.1 엔트리

| 엔트리 | 상태 | 비고 |
|---|---|---|
| `inbox` | 수정 | `jira:globalPage`. `spaceKey` 컨텍스트·`lockedSpaceKey` 개념 삭제. `view.createHistory` 경로 유지 |
| `modal` | 수정 | 컨텍스트 후보 판정 키 `pageId/regionId/getResolver` → `requestId/issueId/intent`. `getResolver/createResolver` 분기 삭제(대상별 resolver 이름은 고정: 상세 `getApprovalDetail`, 이슈 `getIssueApproval`, 생성 `createIssueApproval`). requestId 가 있으면 상세, 없고 issueId 가 있으면 이슈 조회 → 결재 유무로 intent 판정 |
| `settings` | 수정 | `jira:adminPage` |
| `projectSettings` | **신설** | 정적 안내(`project.placeholder.*`) + 전역 설정 위치 안내. resolver 호출 없음 |
| `macro`, `stamp`, `feed` | **삭제** | craco ENTRIES·public html·manifest entry 세 곳 함께 |

### 7.2 화면 트리 변경

- **InboxPage** → InboxFilters(스페이스 입력 → 프로젝트 키 입력, URL 파라미터 `space`→`project`, `toInboxFilters` 가 `projectKey` 로) · InboxTable(열 `space`→`project`: 프로젝트 아바타+이름, `type` 열: `inbox.type.issue`, 제목 셀 `PageLink`→`IssueLink`) · BulkApproveBar(무변경) · NotificationPanel(`IssueLink`) · `openModal` context `{intent, requestId, issueId}`.
- **modal** → ApprovalDetail(`page` prop → `target`; Confluence diff 링크 `diffUrl` 삭제; 이력은 `getApprovalHistory({requestId})`; 증명서 `{requestId}`) · DecisionForm(무변경) · RequestForm(`pageId`→`issueId`, `regionId/regionHash/createResolver/insertStampBox` 삭제, `getRequestDefaults({projectId})`, 제목 키 `request.issueTitle`).
- **settings** → PolicySettings(결재란·Confluence 알림 토글 삭제, `approverAccessCheck`) · **ProjectSettings**(구 SpaceSettings) · **ProjectPolicyModal**(구 SpacePolicyModal) · FlowFormModal(스페이스 선택 → 프로젝트 선택, `listProjects` 옵션, `projectIds`) · GroupFormModal/GroupSettings(`CONFLUENCE`→`JIRA`) · DirectoryPicker(관리자 배지 삭제) · DataSettings·exportRetentionExcel(열 변경) · 나머지 무변경.
- **CertificateSheet / exportCertificatePdf** — 필드 `cert.field.space/pageId/target` → `cert.field.project/issueKey/targetKind`, `contentHash` 가 null 이면 지문 섹션을 그리지 않는다, PDF creator `'Moves Approval for Jira'`.

### 7.3 공용 컴포넌트

| 파일 | 처리 |
|---|---|
| `components/PageLink.jsx` | → **`components/IssueLink.jsx`** — `issueUrl(siteUrl, {issueKey})` = `/browse/{issueKey}`, 키가 없으면 링크 없이 텍스트. 클릭 동작(router.navigate / 새 탭 router.open)은 기존 PageLink 와 동일 |
| `components/StampBox.jsx` | 삭제(소비처가 stamp·region 뿐) |
| `components/DecisionStamp.jsx` | 유지(ApprovalStepper·SignaturePanel) |
| `app/useMacroViewport.js` | 삭제(`@forge/confluence-bridge` 유일 소비처) |
| `app/useSiteUrl.js` | 유지(주석만 Jira) |
| `features/request/approverOptions.js` | `confluenceGroupOption` → `jiraGroupOption`(값 형식 `group:<이름>` 무변경) |

### 7.4 쿼리키 (`utils/queryKey/approvalKeys.js`)

- 삭제: `approvalKeys.page(pageId)`, `approvalKeys.region(contentId, regionId)`
- 추가: `approvalKeys.issue(issueId)`
- 변경: `approvalKeys.history(contentId, regionId)` → `history(requestId)`, `settingsKeys.spacePolicy(spaceKey)` → `projectPolicy(projectId)`, `requestKeys.defaults(pageId)` → `defaults(projectId)`. 필요하면 `settingsKeys.projects(q)`.

### 7.5 패키지

`static/ui/package.json` 에서 `@forge/confluence-bridge` 제거(`npm --prefix static/ui uninstall @forge/confluence-bridge`). 네트워크가 막혀 실패하면 의존성만 남기고 보고서에 적는다(소스 import 는 0이어야 한다).

---

## 8. i18n 키

규칙: kr·en 동시 수정, `npm run merge` 가 키 집합 동일성을 검사. `error.json` 키 = `ErrorCodes` 값.

### 8.1 네임스페이스 단위

| 네임스페이스 | 처리 |
|---|---|
| `macro` | **삭제** |
| `banner` | **삭제** → 살아남는 키를 **`state`** 로 이동: `status.{pending,approved,rejected,expired,cancelled}`, `badge.{myTurn,overdue,cancelled,stale,staleShort}`, `deadline.{today,days}`, `progress.{inProgress,steps,named}`, `pill.reapproval`, `panel.editedAfterApproval`. 버림: `pill.invalid`, `pill.none`, `panel.editedWhilePending`, `badge.editedWhileOpen`, `region.*` (프론트 담당이 이동 후 `grep "banner\."` 0 확인. 소비처에서 쓰지 않는 키는 옮기지 않는다) |
| `space` | **삭제** → **`project`** 신설: space 의 키 구조를 그대로 옮기되 단어를 프로젝트로(`hint`,`title`,`column.*`,`policy.*`,`removalWarning`…; `hint` 는 "선택한 프로젝트에서만 승인 요청을 만들 수 있습니다" 류로 — 배너·매크로 언급 삭제) + `placeholder.{title,body,openGlobal}`(projectSettings 엔트리) |

### 8.2 키 단위 (kr 값 / en 값)

| 키 | 처리 | kr | en |
|---|---|---|---|
| `error.PERMISSION_PAGE_VIEW_DENIED` | 삭제 | | |
| `error.PERMISSION_PAGE_EDIT_DENIED` | 삭제 | | |
| `error.PERMISSION_ISSUE_VIEW_DENIED` | 추가 | 이 이슈를 볼 권한이 없습니다. 프로젝트 관리자에게 문의하세요. | You don't have permission to view this issue. Contact your project admin. |
| `error.PERMISSION_ISSUE_EDIT_DENIED` | 추가 | 이 이슈를 편집할 권한이 없습니다. 프로젝트 관리자에게 문의하세요. | You don't have permission to edit this issue. Contact your project admin. |
| `error.PERMISSION_PROJECT_ADMIN_REQUIRED` | 추가 | 프로젝트 관리자만 사용할 수 있습니다. | Only project admins can do this. |
| `error.PERMISSION_TARGET_VIEW_DENIED` | 추가 | 이 승인 대상을 볼 권한이 없습니다. | You don't have permission to view this approval target. |
| `error.JIRA_API_FAILED` | 추가(구 CONFLUENCE_API_FAILED) | Jira에서 필요한 정보를 가져오지 못했습니다. 잠시 후 다시 시도하세요. | Couldn't load the required information from Jira. Try again shortly. |
| `error.CONFLUENCE_API_FAILED`, `REGION_ID_MISSING`, `REGION_ID_DUPLICATED`, `REGION_CHANGED`, `SPACE_NOT_ENABLED` | 삭제 | | |
| `error.PERMISSION_DENIED`, `PERMISSION_ADMIN_REQUIRED` | 값 수정 | "Confluence 관리자" → "Jira 관리자" | "Confluence admin" → "Jira admin" |
| `error.INVALID_TARGET`, `ALREADY_DECIDED`, `CONCURRENT_MODIFICATION` | 값 수정 | "페이지를 새로 고친 뒤" → "화면을 새로 고친 뒤" | "Refresh the page" 유지 가능(브라우저 의미) |
| `error.APPROVER_NO_ACCESS` | 값 수정 | 이 이슈를 볼 수 없는 사용자가 결재선에 있습니다. 프로젝트 권한을 확인하세요. | Someone in the approval line can't view this issue. Check project permissions. |
| `policy.approverSpaceCheck` | → `policy.approverAccessCheck` | 요청 시 승인자의 대상 열람 권한 확인 | Check that approvers can view the target when requesting |
| `policy.commentNotifications`, `policy.stampBoxAutoInsert` | 삭제 | | |
| `policy.groups.modal.type.confluence`, `…confluenceHint`, `policy.groups.*` 의 "Confluence 그룹" 문구 | → `type.jira`, `jiraHint`, "Jira 그룹" | | |
| `policy.settings.tab.space`, `policy.flow.*spaces*`, `policy.audit.area.space` | → `tab.project`, `projects`, `projectsPlaceholder`, `projectsHint`, `area.project` | 적용 프로젝트 / 프로젝트 선택 (비우면 전체) | Projects / Select projects (empty = all) |
| `policy.admin`, `manager.confluenceAdmin`, `manager.*`·`approver.accessHint` 의 Confluence 관리자 | → `jiraAdmin`, "Jira 관리자" | | |
| `cert.subtitle` | 값 수정 | Moves Approval for Jira | Moves Approval for Jira |
| `cert.field.space`, `cert.field.pageId`, `cert.target.page`, `cert.target.region` | → `cert.field.project`, `cert.field.issueKey`, `cert.target.issue` | 프로젝트 / 이슈 키 / 이슈 | Project / Issue key / Issue |
| `cert.fingerprintHint`, `cert.fingerprintMissing`, `cert.versionChanged` | 값을 대상 중립으로("결재 이후 대상이 바뀌었습니다") — 지문 섹션은 contentHash 있을 때만 | | |
| `common.action.openPage` | → `common.action.openIssue` | 이슈 열기 | Open issue |
| `common.column.space`, `common.column.document` | → `common.column.project`, `common.column.target` | 프로젝트 / 대상 | Project / Target |
| `common.*.hint`(Confluence 그룹 검색) | 값 수정 | Jira 그룹을 검색해… | Search Jira groups… |
| `filter.space`, `filter.spacePlaceholder`, `filter.allSpaces`, `filter.chip.space` | → `filter.project`, `projectPlaceholder`(프로젝트 키), `allProjects`, `chip.project` | | |
| `filter.searchPlaceholder` | 값 수정 | 제목 검색 | Search title |
| `inbox.type.page`, `inbox.type.region` | → `inbox.type.issue` | 이슈 | Issue |
| `inbox.*.untitled` | 값 수정 | 제목 없음 | Untitled |
| `detail.noApproval`, `detail.stalePendingTitle` | 값 수정 | 이 대상에는 아직 결재 요청이 없습니다 / 요청 이후 대상이 수정되었습니다 | |
| `request.pageTitle`, `request.pageDialogTitle` | → `request.issueTitle`, `request.issueDialogTitle` | 이슈 승인 요청 / 이슈 승인 상태 | Request issue approval / Issue approval |
| `request.insertStampBox`, `request.insertStampBoxHint`, `request.reason.regionRemoved` | 삭제 | | |
| `request.reason.editedAfterApproval`, `…editedWhilePending` | 값 수정 | "페이지" → "대상" | "page" → "target" |
| `notification.*.document`, `notification.template.editedAfterApproval`, `…editedWhilePending` | 값 수정 | "문서" → "대상" | |

en 값은 kr 의미에 맞춰 frontend 담당이 채운다(위 표의 en 열은 방향 지시).

---

## 9. 용량·호출량

### 9.1 용량 (DESIGN §8 기준, 200명, 인덱스 포함 ×2)

이번 기능은 행을 늘리지 않는다. 스키마 변경으로 요청·업무함 행이 약 +40B(대상 컬럼 NULL 다수, `ix_request_target/issue/subject/project`·`ix_inbox_project` 인덱스 포함 약 +120B/요청).

| 시나리오 | 연 요청 | 요청당 | 연 용량 | 3년 보관 |
|---|---|---|---|---|
| 타임시트 월 단위(2,400) + 전환 승인(12,000) | 14,400 | ≈2.5KB | ≈36MB | ≈110MB + 알림 25MB |
| 타임시트 주 단위(10,400) + 전환 승인(12,000) | 22,400 | ≈2.5KB | ≈56MB | ≈170MB + 알림 25MB |

1 GiB 의 20% 이하. 스냅샷은 다음 기능에서 요청 행 압축 JSON 으로(DESIGN §8 권장) — 그때 +10MB/년.

### 9.2 resolver 1회당 Jira 호출

| resolver | 구(Confluence) | 신(Jira) |
|---|---|---|
| 가드 `{issue}` | v2 operations 1 | mypermissions 1 (view·edit 한 번에) |
| principal(admin 판정) | user/current 1 (캐시) | mypermissions ADMINISTER 1 (캐시) |
| listInbox | 스페이스 목록 ⌈S/250⌉ + 패스당 pages 벌크 1 (+스페이스 건별 조회) | 프로젝트 필터 시 project 1 + **패스당** permissions/check ⌈n/100⌉ + bulkfetch ⌈v/100⌉ — 창 ≤200, 패스 ≤4 → 보통 2, 최악 16 |
| getInboxCounts | 스페이스 목록 ⌈S/250⌉ | 0 (SQL 만) |
| listNotifications | pages 벌크 1/패스 | permissions/check 1 + bulkfetch 1 /패스 |
| getApprovalDetail | (getPageApproval) page 1 + space 1 + operations 0~1 | mypermissions 1 + issue 1 (+ canRequest 판정 시 0 — 같은 mypermissions 응답 재사용) |
| createIssueApproval | 가드 1 + page 2 + 그룹 멤버 페이지 + 승인자 N | 가드 1 + issue 1 + 그룹당 ⌈m/50⌉(≤20) + 승인자 N (viewissue/search, `approverAccessCheck` 켜졌을 때) |
| decideApproval | operations 1 | mypermissions 1 |
| getApprovalCertificate | page 2(버전 본문·현재) | mypermissions 1 |
| resolveUsers | user/bulk 1 | ⌈n/50⌉ |
| listProjects | spaces 1 | project/search 1 |

N+1 지점: 결재선 승인자 열람 확인(N = 결재선 인원, 보통 ≤10, 병렬). Jira 에 "여러 사용자 × 한 이슈" 일괄 API 가 없다(`permissions/check` 의 `accountId` 는 관리자 권한 필요 — §10). Confluence 판과 같은 비용이라 수용.

---

## 10. 미검증

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| U1 | `GET /rest/api/3/mypermissions?issueId=&permissions=BROWSE_PROJECTS,EDIT_ISSUES` 가 asUser 로 이슈 보안 수준까지 반영해 답하는가 | `{issue}` 가드 전체 | 보안 수준 걸린 이슈를 비권한 사용자로 `getIssueApproval` → `PERMISSION_ISSUE_VIEW_DENIED` |
| U2 | `POST /rest/api/3/permissions/check` 의 `issues` 상한·응답 경로(`projectPermissions[0].issues`) | 업무함·알림 가시성(불변식 7) | 업무함에 보이지 않아야 할 이슈 1건 섞어 두고 목록에서 빠지는지. 응답을 resolver 반환값에 진단 필드로 담아 확인(AGENTS.md 검증 규칙) |
| U3 | `POST /rest/api/3/issue/bulkfetch` — 100건 상한, scope, 권한 없는 id 처리 | 표시 메타만(판정엔 안 씀) | 실패 시 스냅샷 제목으로 뜨는지 |
| U4 | `GET /rest/api/3/user/viewissue/search?issueId=&accountId=` 로 타 사용자 열람 판정이 되는가 | `approverAccessCheck` | 이슈를 못 보는 사용자를 결재선에 넣어 `APPROVER_NO_ACCESS`. 안 되면 null → 통과(기존 규칙)로 떨어진다 |
| U5 | `permissions/check` 에 `accountId` 를 주면 Jira 관리자만 허용되는가 | U4 대안 불가 근거 | 일반 사용자 asUser 호출 응답 |
| U6 | `GET /rest/api/3/group/member`·`group/bulk`·`groups/picker` 가 일반 사용자(Browse users and groups 권한)에게 열리는가 | 그룹 결재선 확장(요청 생성), 승인 그룹 설정 | 일반 사용자로 그룹 단계 요청 생성. 403 이면 `INVALID_APPROVER_CONFIGURATION` 로 떨어지는지 |
| U7 | `GET /rest/api/3/user/bulk` 의 `maxResults` 상한과 반복 `accountId` 파라미터(route 배열) | 이름 해석 | 30명 결재선 상세에서 이름 전원 표시 |
| U8 | Jira globalPage 에서 `new Modal({resource:'main/modal'})` | 상세·결정 화면 전체 | 업무함에서 행 클릭 → 모달 |
| U9 | Jira globalPage 에서 `view.createHistory()` | 업무함 탭·필터 URL 동기화 | 탭 전환 후 새로고침 시 유지 |
| U10 | `jira:globalPage` 의 `route`·`layout`, iframe 바깥 패딩 | 화면 여백(AppShell 의 Confluence 패딩 보정) | 배포 후 육안 |
| U11 | scope 충분성 — 위 API 들이 `read:jira-work`/`read:jira-user` 로 충분한가(특히 permissions/check·mypermissions) | 모든 Jira 호출 | `forge lint` + 배포 후 각 화면 1회 |
| U12 | Jira `avatarUrls` 절대 URL 이 iframe `<img>` 로 뜨는가 | 아바타(실패 시 이니셜) | 업무함 아바타 육안 |
| U13 | `jira:adminPage` 는 Jira 관리자에게만 보인다 → 설정 관리자(manager)는 업무함 사이드바 경로로만 진입 | 설정 진입 동선 | manager 로 등록한 비관리자 계정으로 확인(Confluence 판과 같은 구조) |

---

## 11. 작업 분해

담당 원칙: **backend = `src/**`, `test/**`, `manifest.yml`.** **frontend = `static/ui/**`(craco·public·package.json 포함), `locales/**`.** 서로의 파일을 건드리지 않는다. 두 담당이 공유하는 계약은 이 설계서 §2·§5.4·§8 이 단일 출처다.
- manifest `resources[].entry` 목록(§6.1)과 craco `ENTRIES`(§11.2)는 같은 4개(`modal, inbox, settings, projectSettings`)다 — 각자 자기 파일만 고친다.
- `error.json` 키(frontend) = `ErrorCodes`(backend) — 둘 다 §8.2 표를 따른다.

표기: **D** 삭제 · **R** 이름 변경(+내용 수정) · **N** 신규 · **M** 수정. 괄호 숫자 = 지시된 grep 의 대소문자 무시 일치 줄 수(작업 전 기준).

### 11.1 backend 체크리스트

**삭제**
- [ ] D `src/resolver/region/RegionController.js` (6)
- [ ] D `src/resolver/region/RegionService.js` (87)
- [ ] D `src/resolver/region/__test__/RegionService.test.js` (64)
- [ ] D `src/domain/approval/regionHash.js` (16)
- [ ] D `src/domain/approval/__test__/regionHash.test.js` (30)
- [ ] D `src/resolver/approval/StampBoxInserter.js` (5)
- [ ] D `src/resolver/approval/__test__/StampBoxInserter.test.js`
- [ ] D `src/resolver/notification/CommentNotifier.js` (14)
- [ ] D `src/resolver/notification/__test__/CommentNotifier.test.js` (1)
- [ ] D `src/trigger/bylineProperties.js` (9)
- [ ] D `src/trigger/__test__/bylineProperties.test.js` (9)
- [ ] D `src/trigger/onPageUpdated.js` (3)
- [ ] D `src/i18n/defaultLocale.js` (1) — 소비처(byline·코멘트) 소멸
- [ ] D `src/rdb/schema/ddl/stepName.sql.js` (1) — CREATE 에 흡수
- [ ] D `src/rdb/schema/ddl/retention.sql.js` — CREATE 에 흡수

**이름 변경**
- [ ] R `src/api/confluence/RequestConfluence.js` (9) → `src/api/jira/RequestJira.js` (§4.2)
- [ ] R `src/error/ConfluenceApiError.js` (2) → `src/error/JiraApiError.js`
- [ ] R `src/permission/ConfluencePermission.js` (13) → `src/permission/JiraPermission.js` (§4.3)
- [ ] R `src/rdb/schema/ddl/approvalSpaceConfig.sql.js` (2) → `approvalProjectConfig.sql.js`
- [ ] R `src/rdb/schema/ddl/flowSpace.sql.js` (3) → `flowProject.sql.js`

**신규**
- [ ] N `src/resolver/approval/target/TargetRegistry.js`
- [ ] N `src/resolver/approval/target/IssueTargetAdapter.js`
- [ ] N `src/resolver/approval/target/__test__/IssueTargetAdapter.test.js` — parse 검증, describe 403/404 → INVALID_TARGET, columnsOf, fingerprint null
- [ ] N `src/permission/__test__/JiraPermission.test.js` — filterVisibleIssues: permissions/check 실패 → 빈 집합(fail-close), bulkfetch 실패 → 판정 유지·메타 비움, 100개 분할, 숫자 아닌 id 무시
- [ ] N `src/permission/__test__/permissionGuard.test.js` — `{issue}` 키 누락/비숫자 거부, view/edit 코드 구분, `{project:'admin'}`, `{jiraAdmin}`

**수정 — 도메인·인프라**
- [ ] M `src/domain/approval/constants.js` (3) — §3.1
- [ ] M `src/domain/approval/scopeKey.js` (5) — §3.1
- [ ] M `src/domain/approval/eventId.js` (1) — 네임스페이스
- [ ] M `src/domain/approval/transitions.js` (1), `normalizeSteps.js` (1) — 주석 단어만
- [ ] M `src/domain/approval/__test__/transitions.test.js` (4) — §3.2
- [ ] M `src/utils/errors/ErrorCodes.js` (4) — §8.2 error 행과 동일 집합
- [ ] M `src/utils/ResponseWrapper.js` (1), `src/utils/license/LicenseGuard.js` (1) — 주석 단어만
- [ ] M `src/index.js` (3) — region 등록·onPageUpdated·bylineProperties export 삭제
- [ ] M `manifest.yml` (35) — §6.1 전체 교체

**수정 — 권한**
- [ ] M `src/permission/permissionGuard.js` (6) — §4.4
- [ ] M `src/permission/PermissionMap.js` (10) — §2.1 표 그대로, §2.4 삭제분, 헤더 주석 축 설명
- [ ] M `src/permission/PrincipalResolver.js` (9) — `isJiraAdmin`
- [ ] M `src/permission/AppAccess.js` (2)
- [ ] M `test/permission/permissionMap.contract.test.js` (3) — §4.4 형태 검사

**수정 — 스키마**
- [ ] M `src/rdb/schema/ddl/approvalRequest.sql.js` (5), `approvalInbox.sql.js` (2), `approvalApprover.sql.js`, `approvalNotification.sql.js`, `approvalFlow.sql.js`, `ddl/index.js` — §5.3
- [ ] M `src/rdb/schema/migrate.js` — §5.2
- [ ] M `src/rdb/schema/__test__/migrate.test.js` — 이름 목록
- [ ] M `src/rdb/schema/TableReadiness.js` — 테이블명 목록이 있으면(§5.5)

**수정 — resolver**
- [ ] M `src/resolver/approval/ApprovalController.js` — `getPageApproval/createApproval` → `getIssueApproval/createIssueApproval`, `getApprovalDetail` 추가
- [ ] M `src/resolver/approval/ApprovalService.js` (58) — §4.5
- [ ] M `src/resolver/approval/ApprovalRepository.js` (43) — §4.5
- [ ] M `src/resolver/approval/CertificateService.js` (13) — §4.5
- [ ] M `src/resolver/approval/ExpiryService.js` (18) — §4.5
- [ ] M `src/resolver/approval/__test__/ApprovalService.test.js` (12), `ApprovalRepository.test.js` (2), `CertificateService.test.js` (5), `ExpiryService.test.js` (15) — region/page 케이스 삭제, ISSUE 대상·어댑터 목으로 교체. **ApprovalService.test 에 반드시**: 미등록 kind 상세 요청 → INVALID_TARGET, canView false → PERMISSION_TARGET_VIEW_DENIED(결정·상세·이력·증명서 4경로), supersede 대상 불일치 → INVALID_TARGET
- [ ] M `src/resolver/inbox/InboxService.js` (30), `InboxRepository.js` (15), `__test__/InboxService.test.js` (8), `__test__/InboxRepository.test.js` (3) — §4.5. **InboxService.test 에 반드시**: 미등록 kind 행 제외, 권한 확인 실패 시 빈 목록
- [ ] M `src/resolver/notification/NotificationService.js` (5), `NotificationRepository.js` (1), `__test__/NotificationService.test.js`, `__test__/NotificationRepository.test.js`
- [ ] M `src/resolver/settings/SettingsRepository.js` (27), `SettingsService.js` (20), `SettingsController.js`, `__test__/SettingsService.test.js` (5), `__test__/SettingsController.test.js` (2), `__test__/SettingsPolicyKeys.test.js`, `__test__/SettingsAuditRepository.test.js`(area 값 쓰면)
- [ ] M `src/resolver/flow/FlowService.js` (9), `FlowRepository.js` (15), `__test__/FlowService.test.js` (4)
- [ ] M `src/resolver/directory/DirectoryService.js` (7), `__test__/DirectoryService.test.js` (2) — §4.5 표
- [ ] M `src/resolver/retention/RetentionRepository.js` (3), `RetentionService.js`, `__test__/RetentionService.test.js`

**완료 확인(backend)**
- [ ] `npm test -- --runInBand` 통과(예상 suites: 27 − 5 삭제 + 3 신규 = 25)
- [ ] `grep -rni "confluence\|pageId\|spaceKey\|byline" src manifest.yml` → 0. 남기면 줄마다 사유
- [ ] `grep -rni "page_id\|space_key\|region\|macro" src` → 0 (`approval_request`/`approval_inbox` 에 해당 컬럼 없음)

### 11.2 frontend 체크리스트

**삭제**
- [ ] D `static/ui/src/entries/macro.jsx` (2), `entries/stamp.jsx` (2), `entries/feed.jsx` (1)
- [ ] D `static/ui/public/macro.html`, `public/stamp.html`, `public/feed.html`
- [ ] D `static/ui/src/features/region/` 전체 — `AdfContent.jsx` (5), `RegionInline.jsx` (22), `RegionMacro.jsx` (53), `regionHashClient.js` (15), `regionIdentity.js` (8), `__test__/RegionInline.test.jsx` (11), `__test__/regionHashClient.test.js` (7)
- [ ] D `static/ui/src/features/stamp/StampMacro.jsx` (16)
- [ ] D `static/ui/src/components/StampBox.jsx` (8)
- [ ] D `static/ui/src/app/useMacroViewport.js` (4)
- [ ] D `locales/kr/macro.json`, `locales/en/macro.json`, `locales/kr/banner.json`, `locales/en/banner.json`, `locales/kr/space.json`, `locales/en/space.json` (이동 후)

**이름 변경**
- [ ] R `static/ui/src/components/PageLink.jsx` (12) → `components/IssueLink.jsx` (§7.3)
- [ ] R `static/ui/src/features/settings/SpaceSettings.jsx` (7) → `ProjectSettings.jsx` — `listProjects`/`setProjectEnabled`, `item.icon`→`avatarUrl`, 서버 검색 `q`
- [ ] R `static/ui/src/features/settings/SpacePolicyModal.jsx` (6) → `ProjectPolicyModal.jsx` — `getProjectPolicy`/`saveProjectPolicy`, `project.policy.*`

**신규**
- [ ] N `static/ui/src/entries/projectSettings.jsx` — 정적 안내(§7.1)
- [ ] N `static/ui/public/projectSettings.html` (settings.html 복제)
- [ ] N `locales/kr/state.json`, `locales/en/state.json` (§8.1)
- [ ] N `locales/kr/project.json`, `locales/en/project.json` (§8.1)

**수정 — 엔트리·인프라**
- [ ] M `static/ui/craco.config.js` — `ENTRIES = { modal, inbox, settings, projectSettings }`
- [ ] M `static/ui/package.json` (+lock) — `@forge/confluence-bridge` 제거(§7.5)
- [ ] M `static/ui/src/entries/inbox.jsx` (4) — spaceKey 제거
- [ ] M `static/ui/src/entries/modal.jsx` (20) — §7.1
- [ ] M `static/ui/src/app/AppShell.jsx` (3), `app/appShell.css` (4), `app/useSiteUrl.js` (1), `components/PersonAvatar.jsx` (1), `components/table/useStableColumnWidths.js` (1), `components/table/ColumnResizeOverlay.jsx` (1) — 주석 단어
- [ ] M `static/ui/src/utils/queryKey/approvalKeys.js` (5) — §7.4

**수정 — 화면**
- [ ] M `features/inbox/InboxPage.jsx` (7), `InboxTable.jsx` (6), `InboxFilters.jsx` (3), `inboxUrl.js` (3), `exportInboxExcel.js` (4) — §7.2, 엑셀 열 `Page ID`→`Issue key`, 공간→프로젝트, 유형→이슈
- [ ] M `features/inbox/InboxPage.test.jsx` (1), `InboxTable.test.jsx` (2) — `/wiki/spaces/OPS/pages/42` 기대값 → `/browse/OPS-12`
- [ ] M `features/notification/NotificationPanel.jsx` (1), `NotificationPanel.test.jsx` — IssueLink, `item.issueKey`
- [ ] M `features/detail/ApprovalDetail.jsx` (13) — `page`→`target`, diffUrl 삭제, history/certificate `{requestId}`, `state.*` 키
- [ ] M `features/certificate/CertificateSheet.jsx` (3), `exportCertificatePdf.jsx` (3) — §7.2
- [ ] M `features/request/RequestForm.jsx` (14), `ApprovalLineEditor.jsx` (4), `approverOptions.js` (3) — §7.2·§7.3
- [ ] M `features/approval/ApprovalStatus.jsx`, `features/approval/deadline.js` — `banner.`→`state.`
- [ ] M `features/settings/SettingsPage.jsx` (1) — 탭 `spaces`→`projects`, import 교체, 주석(globalSettings→adminPage)
- [ ] M `features/settings/PolicySettings.jsx` — 토글 2개 삭제, `approverAccessCheck`
- [ ] M `features/settings/FlowFormModal.jsx` (4) — 프로젝트 선택·`projectIds`
- [ ] M `features/settings/GroupFormModal.jsx` (13), `GroupSettings.jsx` (1) — `JIRA`
- [ ] M `features/settings/DirectoryPicker.jsx` (1), `__test__/DirectoryPicker.test.jsx` (1) — 관리자 배지 삭제
- [ ] M `features/settings/ManagerSettings.jsx` (1) — 주석·문구 키
- [ ] M `features/settings/DataSettings.jsx`, `exportRetentionExcel.js` (4) — 열·`state.` 키

**수정 — locales**(kr·en 쌍으로)
- [ ] M `approver.json` (1), `cert.json` (4), `common.json` (1+), `detail.json`, `error.json` (6), `filter.json`, `inbox.json`, `manager.json` (4), `notification.json`, `policy.json` (11), `request.json` (1~2), `data.json`(필요 시) — §8.2
- [ ] `npm run merge` 통과(키 집합 동일)

**완료 확인(frontend)**
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui` 통과
- [ ] `grep -rni "confluence\|pageId\|spaceKey\|byline" static/ui/src` → 0
- [ ] `grep -rn "banner\.\|'space\.\|macro\." static/ui/src` → 0

### 11.3 순서·의존

1. backend 와 frontend 는 이 설계서를 기준으로 **병렬** 진행 가능(서로의 파일 없음).
2. 통합 검증(integration-verifier): §2.1 표의 resolver 이름·입력 키·응답 필드를 프론트 `invokeApproval(...)` 호출부와 1:1 대조, `npm run merge` → 백엔드 테스트 → 프론트 테스트 → 빌드 순.
3. 빌드는 두 담당이 모두 완료 보고한 뒤 한 번(AGENTS.md).

---

## 부록 A. 지시된 grep 결과 — 파일별 처리 (작업 전, 대소문자 무시 일치 줄 수)

`grep -rni "confluence\|pageId\|page_id\|spaceKey\|space_key\|byline\|macro\|region" src static/ui/src manifest.yml locales test`

| 줄 수 | 파일 | 처리 |
|---|---|---|
| 87 | src/resolver/region/RegionService.js | D |
| 64 | src/resolver/region/__test__/RegionService.test.js | D |
| 58 | src/resolver/approval/ApprovalService.js | M §4.5 |
| 53 | static/ui/src/features/region/RegionMacro.jsx | D |
| 43 | src/resolver/approval/ApprovalRepository.js | M §4.5 |
| 38 / 36 | locales/en-US.json / ko-KR.json | 생성물 — `npm run merge` 로 재생성 |
| 35 | manifest.yml | M §6.1 |
| 30 | src/resolver/inbox/InboxService.js | M |
| 30 | src/domain/approval/__test__/regionHash.test.js | D |
| 27 | src/resolver/settings/SettingsRepository.js | M |
| 22 | static/ui/src/features/region/RegionInline.jsx | D |
| 20 | static/ui/src/entries/modal.jsx | M |
| 20 | src/resolver/settings/SettingsService.js | M |
| 18 | src/resolver/approval/ExpiryService.js | M |
| 16 | static/ui/src/features/stamp/StampMacro.jsx | D |
| 16 | src/domain/approval/regionHash.js | D |
| 15 | static/ui/src/features/region/regionHashClient.js | D |
| 15 | src/resolver/inbox/InboxRepository.js | M |
| 15 | src/resolver/flow/FlowRepository.js | M |
| 15 | src/resolver/approval/__test__/ExpiryService.test.js | M |
| 14 | static/ui/src/features/request/RequestForm.jsx | M |
| 14 | src/resolver/notification/CommentNotifier.js | D |
| 13 | static/ui/src/features/settings/GroupFormModal.jsx | M |
| 13 | static/ui/src/features/detail/ApprovalDetail.jsx | M |
| 13 | src/resolver/approval/CertificateService.js | M |
| 13 | src/permission/ConfluencePermission.js | R → JiraPermission |
| 12 | static/ui/src/components/PageLink.jsx | R → IssueLink |
| 12 | src/resolver/approval/__test__/ApprovalService.test.js | M |
| 11 | static/ui/src/features/region/__test__/RegionInline.test.jsx | D |
| 11 / 11 | locales/kr·en/policy.json | M |
| 10 | src/permission/PermissionMap.js | M |
| 9 | src/trigger/bylineProperties.js · __test__/bylineProperties.test.js | D |
| 9 | src/resolver/flow/FlowService.js | M |
| 9 | src/permission/PrincipalResolver.js | M |
| 9 | src/api/confluence/RequestConfluence.js | R → api/jira/RequestJira |
| 8 | static/ui/src/features/region/regionIdentity.js | D |
| 8 | static/ui/src/components/StampBox.jsx | D |
| 8 | src/resolver/inbox/__test__/InboxService.test.js | M |
| 7 | static/ui/src/features/settings/SpaceSettings.jsx | R → ProjectSettings |
| 7 | static/ui/src/features/region/__test__/regionHashClient.test.js | D |
| 7 | static/ui/src/features/inbox/InboxPage.jsx | M |
| 7 | src/resolver/directory/DirectoryService.js | M |
| 6 | static/ui/src/features/settings/SpacePolicyModal.jsx | R → ProjectPolicyModal |
| 6 | static/ui/src/features/inbox/InboxTable.jsx | M |
| 6 | src/resolver/region/RegionController.js | D |
| 6 | src/permission/permissionGuard.js | M |
| 6 / 6 | locales/kr·en/error.json | M |
| 5 | static/ui/src/utils/queryKey/approvalKeys.js | M |
| 5 | static/ui/src/features/region/AdfContent.jsx | D |
| 5 | src/resolver/settings/__test__/SettingsService.test.js | M |
| 5 | src/resolver/notification/NotificationService.js | M |
| 5 | src/resolver/approval/StampBoxInserter.js | D |
| 5 | src/resolver/approval/__test__/CertificateService.test.js | M |
| 5 | src/rdb/schema/ddl/approvalRequest.sql.js | M |
| 5 | src/domain/approval/scopeKey.js | M |
| 4 | static/ui/src/features/settings/FlowFormModal.jsx · exportRetentionExcel.js | M |
| 4 | static/ui/src/features/request/ApprovalLineEditor.jsx | M |
| 4 | static/ui/src/features/inbox/exportInboxExcel.js | M |
| 4 | static/ui/src/entries/inbox.jsx | M |
| 4 | static/ui/src/app/useMacroViewport.js | D |
| 4 | static/ui/src/app/appShell.css | M(주석) — Confluence globalPage 패딩 설명. Jira globalPage 기준으로 고치되 실측 전(U10)이라 "미확인" 표기 |
| 4 | src/utils/errors/ErrorCodes.js | M |
| 4 | src/resolver/flow/__test__/FlowService.test.js | M |
| 4 | src/domain/approval/__test__/transitions.test.js | M |
| 4 ×2 | locales/kr·en/manager.json, macro.json, cert.json | M / D(macro) / M |
| 3 | test/permission/permissionMap.contract.test.js | M |
| 3 | static/ui/src/features/request/approverOptions.js | M |
| 3 | static/ui/src/features/inbox/inboxUrl.js · InboxFilters.jsx | M |
| 3 | static/ui/src/features/certificate/exportCertificatePdf.jsx · CertificateSheet.jsx | M |
| 3 | static/ui/src/app/AppShell.jsx | M(주석) |
| 3 | src/trigger/onPageUpdated.js | D |
| 3 | src/resolver/retention/RetentionRepository.js | M |
| 3 | src/resolver/inbox/__test__/InboxRepository.test.js | M |
| 3 | src/rdb/schema/ddl/flowSpace.sql.js | R → flowProject |
| 3 | src/index.js | M |
| 3 | src/domain/approval/constants.js | M |
| 2 | static/ui/src/features/inbox/InboxTable.test.jsx | M |
| 2 | static/ui/src/entries/stamp.jsx · macro.jsx | D |
| 2 | src/resolver/settings/__test__/SettingsController.test.js | M |
| 2 | src/resolver/directory/__test__/DirectoryService.test.js | M |
| 2 | src/resolver/approval/__test__/ApprovalRepository.test.js | M |
| 2 | src/rdb/schema/ddl/approvalSpaceConfig.sql.js | R → approvalProjectConfig |
| 2 | src/rdb/schema/ddl/approvalInbox.sql.js | M |
| 2 | src/permission/AppAccess.js | M |
| 2 | src/error/ConfluenceApiError.js | R → JiraApiError |
| 2 | locales/en/request.json | M |
| 1 | static/ui/src/features/settings/SettingsPage.jsx · ManagerSettings.jsx · GroupSettings.jsx · DirectoryPicker.jsx · __test__/DirectoryPicker.test.jsx | M |
| 1 | static/ui/src/features/notification/NotificationPanel.jsx | M |
| 1 | static/ui/src/features/inbox/InboxPage.test.jsx | M |
| 1 | static/ui/src/entries/feed.jsx | D |
| 1 | static/ui/src/components/table/useStableColumnWidths.js · ColumnResizeOverlay.jsx | M(주석) |
| 1 | static/ui/src/components/PersonAvatar.jsx · app/useSiteUrl.js | M(주석) |
| 1 | src/utils/ResponseWrapper.js · utils/license/LicenseGuard.js | M(주석) |
| 1 | src/resolver/notification/NotificationRepository.js | M |
| 1 | src/resolver/notification/__test__/CommentNotifier.test.js | D |
| 1 | src/rdb/schema/ddl/stepName.sql.js | D(흡수) |
| 1 | src/i18n/defaultLocale.js | D |
| 1 | src/domain/approval/transitions.js · normalizeSteps.js · eventId.js | M |
| 1 | locales/kr·en: request, inbox, filter, common, banner, approver, space | M / D(banner·space) |

grep 에 안 걸리지만 함께 바뀌는 파일: `src/rdb/schema/ddl/{approvalApprover,approvalNotification,approvalFlow,index,retention}.sql.js`, `src/rdb/schema/migrate.js`·`__test__/migrate.test.js`, `src/resolver/approval/ApprovalController.js`, `src/resolver/settings/SettingsController.js`, `src/resolver/retention/RetentionService.js`, `src/resolver/notification/__test__/*`, `src/resolver/settings/__test__/SettingsPolicyKeys.test.js`, `static/ui/craco.config.js`, `static/ui/package.json`, `static/ui/public/*.html`, `static/ui/src/features/settings/{PolicySettings,DataSettings}.jsx`, `static/ui/src/features/approval/{ApprovalStatus.jsx,deadline.js}`, `locales/*/notification.json`·`detail.json`.

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 초안 | core-port 착수 |
