# issue-approval 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-04 · autopilot 무인 회차(1회차). 입력: `01_architect_design.md`(§2·§3·§4·§10·§11.1), `00_input/requirement.md`, QUESTIONS Q81~Q87(전부 기본 가정 유지).
> 금지 준수: `forge` 명령·`git add/commit/push/mv/stash` 미실행, `static/ui`·`locales` 무변경(다음 Phase), 리포 밖 무변경, asApp 추가 없음.

## 결과 요약

- **테스트**: 루트 `npx jest` / `npm test -- --runInBand` → **79 suites / 1050 tests 전부 통과**(착수 전 기준선 72 / 966, +7 suites / +84 tests). UI 회귀 `npm run test:ui -- --runInBand --watchAll=false`(CI=true) → **31 suites / 240 tests 통과**(프론트 무변경).
- **새 resolver 0, 새 테이블 0, 마이그레이션 없음(v032 유지), 엔트리 무변경, scope 무변경.** 3단계 등록 계약 테스트(`test/permission/permissionMap.contract.test.js`) 녹색.
- 상태 머신(`src/domain/approval/**`) 무변경. 엔진에 선택 훅 `changeSince`·재상신 가드·회수 열람 확인·프로젝트 사용 게이트만 붙였다.
- **설계와 다른 점 D1~D9**(§7). 가장 중요한 것: **D1 — locales 3건을 이번 Phase 에서 고치지 않았다**(리더 지시로 프론트 Phase 몫). 특히 `transition.server.validator.REJECT_NO_REQUEST` 는 백엔드가 import 하는 서버 문구라, 프론트 Phase 전까지 validator 거부 문구가 옛 메뉴 이름("Request transition approval")을 가리킨다(manifest 는 이미 "Request approval").

## 1. 파일

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `src/domain/issue/changeSince.js` | 순수. `IGNORED_FIELD_IDS`·`IGNORED_FIELD_NAMES`·`FIELDS_MAX=10`·`ChangeBasis`·`parseJiraTime`·`changeBaseline`·`needsChangelog`·`summarizeChanges`·`toChangeSince`. `Date.now()` 없음, 입력 정렬·변경 없음 |
| 신규 | `src/domain/issue/__test__/changeSince.test.js` | §3.1 전 케이스 + `Date.now` 부재 정적 확인(23) |
| 신규 | `src/resolver/approval/target/IssueChangeReader.js` | asUser changelog 끝 페이지(1~2콜), template strings 배열을 직접 만든 `route(strings, ...values)`, 3초 상한, 실패·403·404·시간 초과 → `null`, invocation memo `issueChangelog:<id>` |
| 신규 | `src/resolver/approval/target/__test__/IssueChangeReader.test.js` | route 문자열·페이지 계산·실패·시간 초과·memo |
| 신규 | `src/resolver/approval/IssueApprovalChangeService.js` | `handleEvent` — `:deleted:issue` 만, 열린 ISSUE 요청 `closeBySystem(expireByTargetChange ISSUE_DELETED)` + 요청자 알림(background). `updated:issue` 는 SQL 0 |
| 신규 | `src/resolver/approval/__test__/IssueApprovalChangeService.test.js` | B7(서비스) |
| 신규 | `src/trigger/__test__/onIssueChanged.test.js` | B7(트리거 — 두 처리 각자 try/catch) |
| 신규 | `src/resolver/approval/__test__/ApprovalServiceIssueApproval.test.js` | B6 |
| 신규 | `src/resolver/approval/__test__/IssueApprovalIsolation.test.js` | B4(메모리 저장소 — `(kind,key)` 최신 + `open:` UNIQUE) |
| 신규 | `src/domain/approval/__test__/scopeKey.isolation.test.js` | B1 |
| 변경 | `src/resolver/approval/ApprovalService.js` | §4.2 훅(`changeSinceFor`), `requestGate`(프로젝트 사용), `approvalContent`(옵션 객체·`changeSinceRequest`·`canResubmit` Q82), `viewForTarget`(`notAvailableReason`), `createIssueApproval`(describe 선행·게이트·이전 회차 자동 연결), `createForTarget` 옵션 `supersedes`, `supersede` 요청자 가드, `cancelApproval` 열람 확인. 생성자 주입 `projectEnabled` |
| 변경 | `src/resolver/approval/target/IssueTargetAdapter.js` | `changeSince` 훅, 주입 `changeReader`, 머리 주석(Q1 답: 연다) |
| 변경 | `src/permission/JiraPermission.js` | `loadIssue` — `fields=summary,project,updated`, 반환에 `updatedAt`(epoch ms \| null). `filterVisibleIssues` 메타 shape 은 무변경 |
| 변경 | `src/resolver/notification/NotificationService.js` | `notificationTemplate`: EXPIRED+ISSUE_DELETED+ISSUE → `notification.template.issueDeleted`(전환 분기보다 앞) |
| 변경 | `src/trigger/onIssueChanged.js` | `createOnIssueChanged({transition, issueApproval})` 팩토리 + 기본 인스턴스 `onIssueChanged`(export 이름 무변경 → `src/index.js` 무변경). 두 처리 각자 try/catch |
| 변경 | `src/utils/errors/ErrorCodes.js` | `RESUBMIT_NOT_ALLOWED`, `ISSUE_APPROVAL_PROJECT_DISABLED` |
| 변경 | `manifest.yml` | `transition-approval-action` title → `Request approval`, 주석 3곳(issueAction·issueContext·issuePanel). 키·resource·scope·모듈 수 무변경 |
| 변경 | `src/permission/PermissionMap.js` | 주석만(Q1 답·Q82). 매핑 값 무변경 |
| 변경 | `docs/DESIGN.md` | §2 표에 "④ 이슈 일반 승인 — 기록형" 한 줄 |
| 변경(테스트) | `ApprovalService.test.js` | §8 참조(기대값 3곳 갱신) |
| 변경(테스트) | `IssueTargetAdapter.test.js`(B2), `JiraPermission.test.js`(loadIssue 2), `ApprovalRepository.test.js`(B3), `TransitionService.test.js`·`TransitionRepositories.test.js`(B5), `NotificationService.test.js`(B8), `InboxService.test.js`(B9) | 추가만 |

## 2. resolver 와 실제 응답 shape (전부 `res.content` — `invokeApproval` 이 푼다)

### 2.1 등록 — 무변경
신규 resolver 0. `getIssueApproval`(`{issue:'view', issueIdKey:'issueId'}`)·`createIssueApproval`(`{issue:'edit', issueIdKey:'issueId'}`)·`getApprovalDetail`·`cancelApproval`(SELF) 모두 기존 등록 그대로. 계약 테스트 통과.

### 2.2 `getIssueApproval({ issueId })` / `getApprovalDetail({ requestId })` — 공통 `ApprovalView`

코드 그대로(`ApprovalService.viewForTarget`):
```js
// 요청 없음
{ approval: null, target, canRequest, notAvailableReason }
// 요청 있음
{ approval: ApprovalContent, target, canRequest, notAvailableReason, pin: { required, hasPin } }
```
- `target`(ISSUE): `{ kind:'ISSUE', key:'<issueId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null }` — 무변경.
- `canRequest`: `isLatest && (approval 없음 || status !== 'PENDING') && 이슈 편집 권한 && 프로젝트 사용(ISSUE 만)`.
- `notAvailableReason`: `'PROJECT_DISABLED' | null`. **모든 대상 종류의 응답에 키가 있다**(ISSUE 아니면 항상 null — D2). 앞의 세 조건(최신·진행 중 아님·편집 권한)이 참일 때만 프로젝트 사용 여부를 묻는다 → 진행 중 요청이 있거나 편집 권한이 없으면 프로젝트가 꺼져 있어도 `null`(D4). 사용 여부 조회가 실패하면 `canRequest:false` + `null`(D3).
- `ApprovalContent` 키(순서 그대로): `requestId, targetKind, status, statusLabelKey, currentStepOrder, currentStepName, stepCount, isStale, approvedContentVersion, requestedContentVersion, contentVersion, canResubmit, expiresAt, requesterKey, requestMessage, canApprove, canReject, onBehalfOf, canCancel, canRequest, cc, events, changeSinceRequest, steps`
  - **`changeSinceRequest`**: `ChangeSince | null` — **모든 종류에 키가 있다.** 값이 채워지는 조건: 어댑터에 훅이 있음(ISSUE) && 최신 회차(`getIssueApproval` 은 항상, `getApprovalDetail` 은 `findLatestRequestId === requestId`) && status ∈ {PENDING, APPROVED}. 그 밖(REJECTED·EXPIRED·CANCELLED, 지난 회차, TIMESHEET·ISSUE_TRANSITION) → `null`, Jira 0콜.
  - `isStale`: `changeSinceRequest` 가 있으면 `changed===true && status ∈ {PENDING, APPROVED}`. 없으면 기존 리비전 규칙(ISSUE 는 결과적으로 false).
  - `canResubmit`: `status==='PENDING' && changed===true && requesterKey === 호출자 accountId`(Q82 — **`|| canEdit` 제거**). 다른 종류는 리비전 규칙(`pendingStale`) && 요청자 본인.
  - `approvedContentVersion: null`, `requestedContentVersion: 0`, `contentVersion: null`(ISSUE) — 무변경. **ISSUE 에서 `isStale:true` 인데 `contentVersion:null` 일 수 있다** → 프론트는 `changeSinceRequest` 분기를 먼저 타야 한다(설계 F4).

`ChangeSince`(코드 그대로, `toChangeSince`):
```js
{
  checked: boolean,              // false = Jira changelog 조회 실패·403·시간 초과(3초). 이때 changed:false, changedAt:null, fields:[], truncated:false
  basis: 'REQUEST' | 'APPROVAL', // PENDING → 요청 행 createdAt, APPROVED → APPROVED 이벤트 occurredAt 의 최댓값
  since: number,                 // 기준 시각 epoch ms(우리 시계)
  changed: boolean,
  changedAt: number | null,      // 기준 이후 "무시 필드가 아닌" 항목을 가진 가장 최근 history 의 created(epoch ms)
  fields: [{ fieldId: string | null, name: string }],  // 중복 제거(fieldId 우선, 없으면 이름), 최신순, 최대 10
  truncated: boolean,            // changelog 100건 초과 + 끝 페이지의 가장 오래된 항목도 기준 이후 → 그 앞을 못 봄
}
```
- `updated` 1차 거름에서 걸러진 경우(이슈 `updated ≤ since`): `{checked:true, changed:false, changedAt:null, fields:[], truncated:false}` — changelog 0콜.
- **`truncated:true` 면 `changed:true` 로 본다**(설계 §3.1). 이때 끝 페이지에 무시 필드만 있으면 `changedAt:null`·`fields:[]` 이면서 `changed:true` 일 수 있다(D6) — 프론트 문구는 `changedAt` null·`fields` 빈 배열을 견뎌야 한다.
- `fields[].name` 은 Jira changelog `items[].field` 원문(사용자 locale 번역 여부 I8). 사용자 정의 필드는 `fieldId:'customfield_…'`.
- 무시 필드(Q81): fieldId(소문자 비교) `status, resolution, resolutiondate, timespent, timeestimate, timeoriginalestimate, worklogid, worklogtimespent` / 이름(소문자) `status, resolution, rank, sprint, worklogid, timespent, time spent, remaining estimate, original estimate`.

### 2.3 `createIssueApproval({ issueId, steps, flowId?, requestMessage?, expiresAt?, ccKeys?, supersedes? })`
응답 무변경: `{ requestId, status:'PENDING', currentStepOrder:1 }`.
순서(코드): `parse` → **`describe`(Jira 1콜, 이후 `knownSnapshot` 으로 재사용 — 생성 경로 describe 1회)** → `requestGate`(프로젝트 사용) → `supersedes` 결정(없으면 `findLatestForTarget({ISSUE, issueId})` 가 PENDING 아닌 요청이면 그 id) → `createForTarget(..., {snapshot, supersedes})` → `supersede` 가드.
- 이전 회차 자동 연결: 최신이 APPROVED·REJECTED·EXPIRED·CANCELLED 면 `prev_request_id` = 그 id, 회수 없음. 최신이 PENDING 이고 `supersedes` 가 없으면 연결·회수 없이 생성 시도 → dedupe UNIQUE 가 `ALREADY_OPEN`.
- 에러 code: `INVALID_TARGET`(형식·supersedes 가 다른 대상/다른 종류), `ISSUE_APPROVAL_PROJECT_DISABLED`(사용 안 함 **또는 사용 여부 조회 실패** — D3), `RESUBMIT_NOT_ALLOWED`(cause `{requestId}`), `ALREADY_OPEN`, `INVALID_APPROVER_CONFIGURATION`, `APPROVER_NOT_REGISTERED`, `APPROVER_NO_ACCESS`, `STORAGE_NOT_READY` + 공통.

### 2.4 `cancelApproval({ requestId, reason? })`
응답 무변경 `{ requestId, status, currentStepOrder }`. 순서: 요청자/Jira 관리자 확인(아니면 `PERMISSION_DENIED`, 열람 확인 전에) → **`assertTargetVisible`**(아니면 `PERMISSION_TARGET_VIEW_DENIED`, 회수 없음) → 회수. 모든 대상 종류에 적용.

### 2.5 알림 templateKey
EXPIRED + reason `ISSUE_DELETED` + `targetKind:'ISSUE'` → `notification.template.issueDeleted`. ISSUE_TRANSITION 은 `transitionIssueDeleted` 그대로. 나머지 ISSUE 알림은 범용(`requested`·`completed`·`rejected`·`cancelled`·`expired`·`dueSoon`·`reminder`). vars 무변경(accountId 만).

### 2.6 `listInbox`·`listNotifications`·`decideApproval`·`bulkApprove`·`getApprovalHistory`·`getApprovalCertificate`·`getRequestDefaults`·`searchApprovers`
무변경. ISSUE 행 `transition:null`(B9 로 고정). ISSUE 결정에 `beforeDecide`·`notifyExternal` 없음(B4-e, Q83 기본 가정 — 코멘트 멘션 없음).

## 3. 에러 코드 (신규 2 — `ErrorCodes` 만 추가, `locales/{kr,en}/error.json` 은 프론트 Phase)

| code | 위치 | cause |
|---|---|---|
| `ISSUE_APPROVAL_PROJECT_DISABLED` | `createIssueApproval`(`LogicalError`) | — |
| `RESUBMIT_NOT_ALLOWED` | `createIssueApproval` → `supersede`(`LogicalError`) | `{ requestId }` |

## 4. 스키마·마이그레이션 — 없음 (최신 `v032` 유지, major upgrade 사유 없음)

## 5. manifest
`jira:issueAction` `transition-approval-action` title `Request transition approval` → **`Request approval`**. 주석 갱신. 키·resource(`main/modal`)·scope·트리거 이벤트 무변경 → `forge install --upgrade` 필요 여부는 I5(문구만 바뀜).

## 6. 동작 요약 (구현 기준)
- 이슈 화면 조회(`getIssueApproval`): describe(이슈 1콜, `updated` 포함) ∥ 최신 요청 → (PENDING/APPROVED 면) `updated > since` 일 때만 changelog 1~2콜(3초 상한) ∥ 편집 권한(invocation memo) → 프로젝트 사용(KVS, 새 요청 가능할 때만).
- 수정 판정은 저장하지 않는다(조회 때 계산). 트리거 `updated:issue` 는 일반 승인 쪽 SQL 0.
- 이슈 삭제: `onIssueChanged` → 전환 처리(try/catch) → 일반 승인 처리(try/catch). 일반 승인 쪽은 `isTableReady('approval_request')`(ensureMigratedOnce 없음) → 최신 ISSUE 요청이 PENDING 이면 `closeBySystem` 만료(이벤트 id 결정적 `ISSUE_DELETED:0` 규칙) → 닫혔으면 요청자 알림(background, 라이선스는 알림 생성만 막음).

## 7. 설계와의 차이 (계약 소비자가 알아야 할 것)

| # | 차이 | 이유 |
|---|---|---|
| **D1** | **locales 무변경**: `error.ISSUE_APPROVAL_PROJECT_DISABLED`·`error.RESUBMIT_NOT_ALLOWED`, `notification.template.issueDeleted`, `transition.server.validator.REJECT_NO_REQUEST` 값 수정(두 언어) — 설계 §11.1 은 백엔드 체크리스트였으나 리더 지시("locales 는 건드리지 않는다")를 따랐다. **프론트 Phase 에서 4건 모두 + `npm run merge` 필요.** 그 전까지 validator 거부 문구가 옛 메뉴 이름을 가리킨다 | 리더 지시 우선 |
| D2 | `notAvailableReason` 을 `getIssueApproval` 뿐 아니라 **`getApprovalDetail` 을 포함한 모든 `viewForTarget` 응답**에 둔다(ISSUE 아니면 null). 상세 응답 키 = `approval, canRequest, notAvailableReason, pin, target` | 같은 함수가 두 resolver 를 만든다. shape 을 종류별로 가르지 않으려고 |
| D3 | 프로젝트 사용 여부 조회 실패 → 조회는 `canRequest:false`·`notAvailableReason:null`, 생성은 `ISSUE_APPROVAL_PROJECT_DISABLED` | fail-close. 화면에 "사용 안 함"이라고 거짓 안내하지 않되, 모르는 채 요청을 만들지 않는다 |
| D4 | 프로젝트 사용 여부는 "최신 && 진행 중 아님 && 편집 권한"일 때만 묻는다 → 그 밖에는 `notAvailableReason:null` | KVS 호출 절약. 버튼이 어차피 없는 경우라 문구가 필요 없다 |
| D5 | 진행 중(PENDING) 요청 조회 때 편집 권한을 **묻지 않는다**(기존엔 `pendingStale` 이면 물었다) | `canResubmit` 에서 `canEdit` 이 빠져 쓸 데가 없다. mypermissions 는 가드가 이미 memo 해 실호출 차이는 거의 없음 |
| D6 | `truncated:true` 이면 `changed:true` 이지만 `changedAt:null`·`fields:[]` 일 수 있다 | 끝 페이지에 무시 필드만 있을 때. 설계 §3.1 의 "끝 페이지 전부가 기준 이후 → 수정으로 본다"를 그대로 따른 결과 |
| D7 | 기준 시각과 같은 `created` 는 "이후"로 세지 않는다(`>`). `updated === since` 도 changelog 를 읽지 않는다 | 설계 §3.1 테스트 목록(= since false)과 맞춤 |
| D8 | 회수 열람 확인은 **Jira 관리자에게도** 적용된다(이슈를 못 보는 관리자는 회수 불가), 미등록 대상 종류의 요청 회수는 `INVALID_TARGET`(이전엔 통과) | 설계 "모든 종류에 적용"의 귀결. 제품 확인 필요 → 질문 후보 N1 |
| D9 | `onIssueChanged` 모듈이 `createOnIssueChanged` 팩토리를 추가로 export(테스트 주입용). 핸들러 이름·manifest 무변경 | 두 서비스 실패 격리 테스트 |

## 8. 기존 테스트 변경 (의도)
`src/resolver/approval/__test__/ApprovalService.test.js`
1. 공용 `service()` 에 `projectEnabled: jest.fn(async () => true)` 주입(실제 KVS 를 부르지 않게).
2. 상세 응답 키 목록에 `notAvailableReason` 추가(D2), `getIssueApproval` 무요청 응답 `toEqual` 에 `notAvailableReason: null` 추가.
3. "같은 대상의 진행 중 요청을 재상신하면…" → principal 을 요청자(`requester`)로(Q82 — 비요청자는 이제 `RESUBMIT_NOT_ALLOWED`, 새 파일 B6 에서 검증).
설계가 언급한 "canResubmit 편집자 케이스"는 기존 테스트에 없었다(ISSUE 는 그동안 항상 false 였다).

## 9. 미검증 (`04_spike_todo.md` I1~I10 + 이번 I11~I14)
I1·I2·I3·I4·I5·I6·I7·I8·I9·I10(설계 §10) + **I11** changelog `created` 형식(오프셋 콜론 유무)·초 단위 정밀도, **I12** Forge 런타임에서 3초 `setTimeout` 경합과 invocation memo(AsyncLocalStorage, T10) 동작, **I13** 필드 보안·이슈 보안 수준으로 changelog 항목이 사용자마다 다르게 보이는지(같은 요청이 사람마다 "수정됨"이 달라짐), **I14** `avi:jira:deleted:issue` 에서 두 서비스가 같은 이슈의 ISSUE·TRANSITION 요청을 각각 1건씩 만료시키는지(X10 재사용).

## 10. 새 질문 후보 (제품 결정 — 추측으로 확정하지 않음)
- **N1** (D8) Jira 관리자가 대상 이슈를 볼 수 없을 때 남의 요청을 **회수할 수 없게** 된다(형제 resolver 범위 맞춤의 부작용). 기본 가정: 수용(관리자는 보통 열람 권한이 있고, 회수 응답이 대상 상태를 돌려준다). 대안: Jira 관리자는 열람 확인 면제.
- **N2** 요청자 본인은 **수정이 없어도** `supersedes` 로 재상신할 수 있다(서버는 stale 을 강제하지 않음 — 설계 §4.5). 화면은 stale 일 때만 버튼을 보인다. 결재선만 바꾸려는 재상신을 공식 기능으로 열지(버튼 상시) 여부.

## 발견 (범위 밖, 고치지 않음)
- `ApprovalService` 의 JSDoc 두 개가 연달아 붙은 곳(`normalizeCc` 위, `expandCc`/`expandApprovalGroup` 위)이 있다 — 기존 그대로.
- 프론트 `ApprovalDetail` 은 지금 `isStale` 이면 `v{requestedContentVersion}→v{contentVersion}` 문구를 그린다. ISSUE 는 이제 `isStale:true`·`contentVersion:null` 이 가능하므로 프론트 Phase 에서 `changeSinceRequest` 분기를 먼저 넣지 않으면 "v0→v" 같은 문구가 나올 수 있다(설계 F4 가 다룸).

## 테스트
```
npx jest                                  → Test Suites: 79 passed, 79 total / Tests: 1050 passed, 1050 total
npm test -- --runInBand                   → 79 / 1050 통과
CI=true npm run test:ui -- --runInBand --watchAll=false → Test Suites: 31 passed / Tests: 240 passed (프론트 무변경 회귀)
```
B1 `scopeKey.isolation.test.js` · B2 `IssueTargetAdapter.test.js` · B3 `ApprovalRepository.test.js` · B4 `IssueApprovalIsolation.test.js` · B5 `TransitionService.test.js`+`TransitionRepositories.test.js` · B6 `ApprovalServiceIssueApproval.test.js` · B7 `IssueApprovalChangeService.test.js`+`src/trigger/__test__/onIssueChanged.test.js` · B8 `NotificationService.test.js` · B9 `InboxService.test.js` — 전부 통과.

## 재작업 회차
| 회차 | 날짜 | 내용 |
|---|---|---|
| 1 | 2026-10-04 | 최초 구현 |
