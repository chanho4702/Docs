# issue-approval 설계서 — 이슈 일반 승인(검토·결재) 화면 공개

> 작성: feature-architect · 2026-10-04 · autopilot 무인 회차(설계만, 코드 무변경)
> 입력: `00_input/requirement.md`(QUESTIONS Q1 답 "연다"), `CLAUDE.md`, `AGENTS.md`, `docs/DESIGN.md` §2·§6, `_workspace/transition-approval/{01,02,03,04}*.md`, `_workspace/QUESTIONS.md`(Q1~Q80)
> 기준 코드(이 회차에 직접 읽은 값): `src/domain/approval/{constants,scopeKey,derive,transitions}.js`, `src/resolver/approval/{ApprovalService,ApprovalController,ApprovalRepository}.js`, `src/resolver/approval/target/{IssueTargetAdapter,TargetRegistry}.js`, `src/resolver/transition/{TransitionService,IssueStateReader,TransitionChangeService,projectEnablement}.js`, `src/trigger/onIssueChanged.js`, `src/permission/{PermissionMap,JiraPermission}.js`, `static/ui/src/entries/{issue,modal}.jsx`, `static/ui/src/features/{request/RequestForm,detail/ApprovalDetail,transition/transitionModel}.jsx|js`, `static/ui/src/utils/queryKey/approvalKeys.js`, `manifest.yml`, 마이그레이션 최신 `v032`.
> **한 줄 요약: 새 resolver 0, 새 테이블 0, 마이그레이션 없음, 엔트리 추가 없음.** 엔진에 선택 훅 1개(`changeSince`)와 재상신 가드를 붙이고, ISSUE 어댑터를 "요청 이후 수정" 판정까지 키운 뒤, 이슈 화면·모달에 일반 승인 칸을 연다.

---

## 열린 질문

제품 결정이 필요한 것만 적는다. 구현은 **기본 가정**으로 진행한다(답이 오면 분기·상수만 바뀌고 §2 계약은 유지된다). `_workspace/QUESTIONS.md` 에 Q81~Q87 로 올렸다.

| # | 질문 | 기본 가정(구현 기준) | 대안 | 권장 |
|---|---|---|---|---|
| Q81 | 무엇을 "요청 이후 수정"으로 보나 | changelog 항목 중 **절차·집계 필드를 뺀 전부**. 제외: `status`·`resolution`·`resolutiondate`·시간 추적(`timespent`·`timeestimate`·`timeoriginalestimate`·`WorklogId`·`WorklogTimeSpent`)·`Rank`·`Sprint`. 담당자·라벨·우선순위·요약·설명·첨부·링크·사용자 정의 필드는 **수정으로 센다**. 코멘트는 changelog 에 없어 세지 않는다(I3) | (a) 요약·설명·첨부만 (b) 관리자가 필드 목록을 정책으로 지정 | 기본 가정. 승인 무결성 쪽으로 넓게 잡고, 상태는 전환 승인의 몫이라 뺀다. 오탐 불만이 나오면 (b) 를 정책 키 하나로 추가 |
| Q82 | 진행 중 요청을 "다시 상신"(이전 요청 SUPERSEDED)할 수 있는 사람 | **요청자 본인만**(요구 문구). 서버도 같은 조건으로 막는다(`RESUBMIT_NOT_ALLOWED`) | 요청자 + 이슈 편집 권한자 누구나(Confluence 판 `canResubmit` 규칙) | 기본 가정. 대안은 편집자가 남의 진행 중 요청을 사실상 회수할 수 있게 한다(회수 권한은 요청자·Jira 관리자뿐) |
| Q83 | 일반 승인에도 Jira 코멘트 @멘션을 쓰나 | **안 쓴다.** 앱 내 알림·업무함만 | `TransitionCommentNotifier` 를 일반화해 `commentNotifyEnabled` 로 함께 켬 | 기본 가정. 전환 승인은 승인 뒤 요청자가 돌아와 전환해야 해서 멘션이 필요했지만, 일반 승인은 후속 행동이 없다. 요구가 오면 훅 1개(`notifyExternal`)로 추가 가능 |
| Q84 | 승인된 뒤 이슈가 수정되면 | **표시만**("승인 이후 수정됨" 배지 + 새 요청 버튼). 상태는 APPROVED 유지, 알림 없음 | 트리거가 수정을 감지해 요청자·결재자에게 알림(+ 감사 이벤트 `CHANGED_AFTER_APPROVAL`) | 기본 가정. 대안은 `avi:jira:updated:issue` 마다 changelog 판정이 필요해 호출량이 커진다(§9). 감사 요구가 생기면 대안 |
| Q85 | ••• 메뉴 진입 | 기존 항목 `transition-approval-action` 하나를 **"Request approval"** 로 이름만 바꾸고, 모달이 **종류 선택 화면**(일반 승인 / 상태 변경 승인)을 먼저 보여 준다. validator 거부 문구의 메뉴 이름도 함께 바꾼다 | 항목 두 개("Request approval" + "Request transition approval") | 기본 가정. 요구 1의 "요청 종류를 고르게 한다"와 맞고 ••• 메뉴가 늘지 않는다 |
| Q86 | 프로젝트 "사용 안 함"(Q2·Q58)일 때 일반 승인 | **새 요청만 막는다**(`ISSUE_APPROVAL_PROJECT_DISABLED`). 기존 요청 조회·결정·회수는 그대로 | 막지 않음 | 기본 가정. 전환 승인(Q58)과 같은 강제 지점 |
| Q87 | 일반 승인만 끄는 전역 스위치 | **두지 않는다.** 프로젝트 사용 여부로만 끈다 | 정책 `issueApprovalEnabled`(전역 전용, 기본 true) — 끄면 이슈 화면 일반 승인 칸·요청 버튼이 숨는다 | 기본 가정. 전환 승인만 쓰려는 고객이 생기면 키 하나 추가(§4.8 의 세 곳 규칙) |

기술적 모호함은 스스로 정하고 근거를 본문에 적었다. 수정 판정 방식(§3.2 — `updated` 로 거른 뒤 changelog 로 판정, 저장 없음), 기준 시각(§3.1 — 진행 중이면 요청 시각, 승인됨이면 최종 승인 시각), 엔진 훅 모양(§4.2), 이슈 화면 구성(§7.1), 이슈 삭제 시 만료(§4.6).

---

## 1. 개요·영향 범위

**대상** = 이슈 하나 전체. `scopeKey = ISSUE:{issueId}` (core-port 에서 예약, `scopeKey.js` 빌더 이미 있음). 열린 요청은 이슈당 하나(불변식 1). 상태 변경 승인(`TRANSITION:{issueId}:{toStatusId}`)과는 **다른 대상**이라 같은 이슈에 동시에 열릴 수 있다(§3.4).

흐름:
```
사용자(이슈 우측 요약·패널)  getIssueApproval + getIssueTransitionApprovals(병렬, 서로 다른 쿼리키)
     └ 일반 승인 칸 [승인 요청] → 모달 RequestForm(결재선 직접 구성 or Flow) → createIssueApproval
사용자(••• > Request approval)  모달 종류 선택 → 일반 승인(RequestForm) | 상태 변경 승인(TransitionApprovalList → TransitionRequestForm)
결재자(업무함·모달)  기존 getApprovalDetail / decideApproval / bulkApprove — 상세에 "요청 이후 수정됨" 경고
요청 이후 이슈 수정  요청은 살아 있다(편집은 요청을 죽이지 않는다). 조회 시 changelog 로 판정 → 요약·상세에 안내
     └ 요청자 [다시 상신] → createIssueApproval{supersedes} → 이전 요청 CANCELLED(SUPERSEDED), 새 요청 prev_request_id
이슈 삭제  avi:jira:deleted:issue → 열린 ISSUE 요청 EXPIRED(ISSUE_DELETED) + 요청자 알림
```

| 축 | 영향 |
|---|---|
| 도메인 | **신규** `src/domain/issue/changeSince.js`(순수 — 기준 시각·무시 필드·changelog 요약). `src/domain/approval/**` **무변경**(상태 머신·scopeKey·transitions 그대로) |
| resolver | **신규 0개.** 기존 `getIssueApproval`·`createIssueApproval`(core-port 등록분)을 제품 경로로 쓴다. **변경** `ApprovalService`(훅 `changeSince`·재상신 가드·이전 회차 자동 연결·프로젝트 사용 확인·회수 열람 확인), `IssueTargetAdapter`(updated·changeSince·주석), `JiraPermission.loadIssue`(`updated` 필드 추가), `NotificationService.notificationTemplate`(ISSUE 삭제 템플릿) |
| 신규 서비스 | `src/resolver/approval/target/IssueChangeReader.js`(asUser changelog 끝 페이지), `src/resolver/approval/IssueApprovalChangeService.js`(이슈 삭제 → 만료) |
| 트리거 | `src/trigger/onIssueChanged.js` — 기존 transition 처리 뒤 `IssueApprovalChangeService.handleEvent` 를 **별도 try/catch** 로 호출. manifest 이벤트 추가 없음(`avi:jira:deleted:issue` 이미 구독) |
| 스키마 | **없음.** `approval_request` 의 기존 칸(`target_kind`·`target_key`·`issue_id`·`issue_key`·`prev_request_id`·`created_at`)과 이벤트(`APPROVED.occurred_at`)로 충분(§5) |
| manifest | `jira:issueAction` `transition-approval-action` 의 **title 만** `Request approval` 로. 키·resource·scope·모듈 수 무변경 |
| 프론트 | 엔트리 **추가 없음**(3곳 무변경). `entries/issue.jsx` 가 일반 승인 칸 + 전환 목록을 함께 그림, `entries/modal.jsx` 에 종류 선택 화면, `ApprovalDetail`·`RequestForm` 문구 분기, 신규 `features/issueApproval/*` |
| i18n | **신규 네임스페이스** `issueApproval.json`(kr/en). `error`·`notification`·`transition`(validator 문구 메뉴 이름) 키 추가·수정 |
| 워크포스 연동 | 없음 |
| AGENTS.md | asApp 허용 목록 **무변경**(이번 기능의 Jira 호출은 전부 asUser, 트리거는 Jira 호출 없음) |

---

## 2. 경계면 계약

권한 축 표기: `SELF` · `{issue:view}` = `{issue:'view', issueIdKey:'issueId'}` · `{issue:edit}` = `{issue:'edit', issueIdKey:'issueId'}`.
공통 에러(모든 resolver): `PERMISSION_DENIED`, `APP_ACCESS_DENIED`, `LICENSE_INACTIVE`, `STORAGE_NOT_READY`, `JIRA_API_FAILED`, `UNKNOWN_ERROR`. `{issue:view}` 거부는 `PERMISSION_ISSUE_VIEW_DENIED`, `{issue:edit}` 거부는 기존 가드 코드, SELF + 어댑터 열람 거부는 `PERMISSION_TARGET_VIEW_DENIED`. 아래 "에러 code" 열은 그 외만.
응답은 기존 규약 `{success:true, ...result}`(Controller 는 `{content: …}` 로 감싼다 — `invokeApproval` 이 푼다). 시각은 전부 epoch ms(number).

### 2.1 신규 resolver — 없음

새 이름이 없으므로 `PermissionMap`·`CONTROLLER_REGISTRARS`·계약 테스트 **무변경**. `PermissionMap.js:79` 주석만 "Q1 답: 연다(issue-approval)" 로 갱신.

### 2.2 변경 resolver

| resolver | 권한 축 | 입력 | 응답 shape (success) — 변경분 굵게 | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueApproval` | {issue:view} (무변경) | `{issueId}` | `ApprovalView`(§2.3) — 기존 `{approval, target, canRequest, pin}` + **`notAvailableReason`**, `approval` 안 **`changeSinceRequest`**. `canRequest` 는 프로젝트 사용 안 함이면 false | `INVALID_TARGET` | issue 엔트리 `IssueGeneralApprovalSection`, modal `ApprovalModalFlow`(contextIssueId), modal 종류 선택 화면 |
| `createIssueApproval` | {issue:edit} (무변경) | `{issueId, steps:[{approverKeys[], requiredApprovals, stepName?}], flowId?:string, requestMessage?:≤500, expiresAt?:number, ccKeys?:string[], supersedes?:requestId}` (기존과 같음) | `{requestId, status:'PENDING', currentStepOrder:1}` (무변경) | `INVALID_TARGET`(supersedes 가 다른 대상·다른 종류), `ALREADY_OPEN`, **`ISSUE_APPROVAL_PROJECT_DISABLED`**, **`RESUBMIT_NOT_ALLOWED`**(진행 중 요청을 요청자가 아닌 사람이 supersede, Q82), `INVALID_APPROVER_CONFIGURATION`, `APPROVER_NOT_REGISTERED`, `APPROVER_NO_ACCESS` | modal `RequestForm` |
| `getApprovalDetail` | SELF (무변경) | `{requestId}` | ISSUE 요청이면 `approval.changeSinceRequest`(§2.4) 채움, `isStale`·`canResubmit` 이 그 값에서 파생. 다른 종류는 `changeSinceRequest: null`(필드 존재, 값 null) | `REQUEST_NOT_FOUND` | modal `ApprovalDetail` |
| `cancelApproval` | SELF (무변경) | 무변경 | 무변경 | **추가**: 요청 대상 열람 불가 → `PERMISSION_TARGET_VIEW_DENIED`(§4.5 — 형제 resolver 범위 맞춤. 모든 종류에 적용) | modal `DecisionForm` |
| `getApprovalHistory`·`getApprovalCertificate`·`decideApproval`·`bulkApprove` | SELF | 무변경 | 무변경(ISSUE 는 이미 등록 어댑터. 증명서 부가 블록 없음) | — | modal, inbox |
| `listInbox`·`listNotifications` | SELF | 무변경 | ISSUE 행은 core-port 그대로(`transition:null`). 알림 `EXPIRED`+`ISSUE_DELETED`+ISSUE → templateKey **`notification.template.issueDeleted`** | — | inbox |
| `getRequestDefaults`·`searchApprovers` | SELF | 무변경 | 무변경 | — | `RequestForm`·`ApprovalLineEditor` |

### 2.3 `ApprovalView` (getIssueApproval) — 확정 shape

```js
{
  approval: ApprovalContent | null,       // 이 이슈의 최신 ISSUE 요청. 없으면 null
  target: { kind:'ISSUE', key:'<issueId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null },
  canRequest: boolean,                    // 최신이 PENDING 아님 && 이슈 편집 권한 && 프로젝트 사용
  notAvailableReason: 'PROJECT_DISABLED' | null,   // 신규. canRequest=false 의 이유 중 화면 문구가 필요한 것만
  pin?: { required, hasPin },             // approval 이 있을 때만(기존)
}
ApprovalContent = 기존 필드 전부(requestId, targetKind:'ISSUE', status, statusLabelKey, currentStepOrder, currentStepName,
  stepCount, isStale, approvedContentVersion:null, requestedContentVersion:0, contentVersion:null, canResubmit, expiresAt,
  requesterKey, requestMessage, canApprove, canReject, onBehalfOf, canCancel, canRequest, cc, events, steps)
  + changeSinceRequest: ChangeSince | null          // 신규(§2.4)
```

파생 규칙(엔진, §4.2):
- `isStale` = `changeSinceRequest?.changed === true` 이고 상태가 PENDING 또는 APPROVED.
- `canResubmit` = 상태 PENDING && `changeSinceRequest.changed` && `requesterKey === 나`(Q82).
- `canRequest`(최상위·approval 안 같은 값) = 기존 규칙 && 프로젝트 사용.

### 2.4 `ChangeSince`

```js
{
  checked: boolean,            // false = Jira 조회 실패로 판정 못 함(이때 changed=false, 화면은 아무 안내 없음)
  basis: 'REQUEST' | 'APPROVAL',   // PENDING → 요청 시각 기준, APPROVED → 최종 승인 시각 기준
  since: number,               // 기준 시각(epoch ms, 우리 시계)
  changed: boolean,
  changedAt: number | null,    // 기준 이후 가장 최근 수정 시각(Jira changelog created)
  fields: [{ fieldId: string|null, name: string }],   // 기준 이후 바뀐 필드(중복 제거, 최신순, 최대 10)
  truncated: boolean,          // changelog 끝 페이지 안에서 기준 시각에 닿지 못함 → fields 가 일부
}
```
`null` 인 경우: 훅이 없는 대상 종류, 최신 회차가 아닌 요청, REJECTED·EXPIRED·CANCELLED 요청(판정해도 쓸 데가 없다 — Jira 호출을 아낀다).

### 2.5 신규 에러 코드 (`ErrorCodes` + `locales/{kr,en}/error.json` 동시)

| code | 의미 | cause |
|---|---|---|
| `ISSUE_APPROVAL_PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않아 새 일반 승인 요청을 만들 수 없음(Q86) | — |
| `RESUBMIT_NOT_ALLOWED` | 진행 중 요청은 요청자 본인만 다시 상신할 수 있음(Q82) | `{requestId}` |

### 2.6 프론트 호출 대응

| 프론트 호출 | 위치 | 쿼리키 / 무효화 |
|---|---|---|
| `getIssueApproval({issueId})` | `features/issueApproval/IssueGeneralApprovalSection.jsx`(issue 엔트리·모달 종류 선택), `entries/modal.jsx` `ApprovalModalFlow`(기존) | `approvalKeys.issue(issueId)` — **전환 요약 `transitionKeys.issue(issueId)` 와 접두가 다르다**(`['approval',…]` vs `['transition',…]`) |
| `getIssueTransitionApprovals({issueId})` | `TransitionApprovalList`(무변경) | `transitionKeys.issue(issueId)` |
| `createIssueApproval({...})` | `RequestForm`(기존) | 모달 `finish` 가 `approvalKeys.issue`·`transitionKeys.all`·`approvalKeys.detail` 무효화(기존). issue 엔트리 `openModal.onClose` 가 `approvalKeys.issue(issueId)` + `transitionKeys.issue(issueId)` 무효화(기존 `approvalKeys.all` 무효화가 이미 포함) |
| `getApprovalDetail` | `ApprovalDetail` | `approvalKeys.detail(requestId)` (기존) |

에러 분기(`error.code`): `ALREADY_OPEN` → `approvalKeys.issue` 재조회 후 상세로, `RESUBMIT_NOT_ALLOWED` → 상세 재조회, `ISSUE_APPROVAL_PROJECT_DISABLED` → 폼 상단 오류 문구.

---

## 3. 도메인 (순수)

### 3.1 `src/domain/issue/changeSince.js` (신규)

```js
/** 무시 필드(Q81). fieldId 기준 + 이름 기준(Rank·Sprint 는 사용자 정의 필드라 id 가 사이트마다 다르다) */
export const IGNORED_FIELD_IDS = Object.freeze(['status', 'resolution', 'resolutiondate', 'timespent', 'timeestimate',
  'timeoriginalestimate', 'WorklogId', 'WorklogTimeSpent']);
export const IGNORED_FIELD_NAMES = Object.freeze(['status', 'resolution', 'rank', 'sprint', 'worklogid', 'timespent',
  'time spent', 'remaining estimate', 'original estimate']);   // 소문자 비교

/**
 * 판정 기준 시각. PENDING → state.createdAt(basis REQUEST). APPROVED → 마지막 APPROVED 이벤트 occurredAt(basis APPROVAL).
 * 그 밖의 상태·시각 없음 → null(판정하지 않는다).
 */
export const changeBaseline = (state) => ({ basis, since } | null);

/** issue.updated 로 changelog 조회가 필요한지. updatedAt 모름(null) → true(조회해서 판정). updatedAt <= since → false */
export const needsChangelog = ({ issueUpdatedAt, since }) => boolean;

/**
 * changelog histories(Jira 응답 values[] 그대로: {created: ISO, items:[{fieldId?, field}]}) → ChangeSince 의 판정부.
 * 순서는 가정하지 않는다(created 로 정렬). created 파싱 실패 항목은 버린다.
 * @param {{ histories:object[], since:number, coveredFrom:number|null }} — coveredFrom = 받은 페이지의 가장 오래된 created.
 *        coveredFrom > since 이고 전체를 다 받지 못했으면 truncated=true(이때 changed=true 로 본다: 끝 페이지 전부가 기준 이후다)
 * @returns {{ changed, changedAt, fields:[{fieldId,name}], truncated }}
 */
export const summarizeChanges = ({ histories, since, complete }) => ...;

/** 위 셋을 묶어 응답 shape 를 만든다(checked=false 경로 포함) */
export const toChangeSince = ({ baseline, summary, checked }) => ChangeSince;
```

테스트(`src/domain/issue/__test__/changeSince.test.js`):
- `changeBaseline`: PENDING→REQUEST/createdAt, APPROVED(이벤트 APPROVED 2건)→마지막 occurredAt, REJECTED·EXPIRED·CANCELLED→null, createdAt 없음→null
- `needsChangelog`: updated < since false, = since false, > since true, null true
- `summarizeChanges`: 기준 이전 항목만 → changed false / 기준 이후 summary → true·필드 1 / 기준 이후 status·timespent·Rank(이름)만 → **false** / 섞임 → 무시 필드 빠짐 / 같은 필드 여러 번 → 1개 / 11개 필드 → 10개 / 순서 뒤섞인 입력 / created 깨진 항목 버림 / complete=false 이고 가장 오래된 항목도 기준 이후 → truncated true·changed true
- `Date.now()` 를 쓰지 않음(불변식 3) — 시각은 전부 인자

### 3.2 수정 판정 기준 — 이슈 `updated` vs changelog

| 기준 | `updated` 만 | changelog 만 | **`updated` 로 거른 뒤 changelog (채택)** |
|---|---|---|---|
| 정확도 | 코멘트·워크로그(우리 시간 추적 화면 포함)·전환·프로퍼티까지 갱신 → **오탐**(I1). 전환 승인을 쓰는 이슈는 상태 변경만으로 "수정됨"이 뜬다 | 필드 단위로 가려 Q81 규칙 적용 가능 | 같음 |
| Jira 호출(요청이 열려 있거나 승인된 이슈 조회 1회) | 0(describe 에 필드 추가) | 1~2 매번 | **대부분 0**, `updated` 가 기준 이후일 때만 +1~2 |
| 저장 | 없음 | 없음 | 없음 |
| 무엇을 보여 줄 수 있나 | 시각만 | 시각 + 필드 이름 | 시각 + 필드 이름 |

- **저장하지 않는 이유**: 기준 시각은 요청 행 `created_at`·APPROVED 이벤트 `occurred_at` 에 이미 있다. 판정 결과를 저장하면 트리거·스윕이 갱신해야 하고(Q84 대안), 조회 시 지연 판정이면 언제나 최신이다.
- **시계 차이**: 기준 시각은 Forge 런타임 시계, `updated`·changelog `created` 는 Jira 시계다. 둘 다 NTP 동기 서버라 초 단위 이하로 가정한다(I4). 요청 직전 몇 초 안의 수정이 "이후"로 잡히는 오탐은 수용한다(요청자가 다시 상신하면 해소).
- **코멘트·이슈 프로퍼티·워크로그**는 수정으로 보지 않는다(changelog 에 없거나 무시 필드). 승인 무결성 관점에서 "본문이 바뀌었나"에 집중한다(Q81).

### 3.3 `src/domain/approval/**` — 무변경

`TargetKind.ISSUE`·`SCOPE_PREFIX.ISSUE='ISSUE'`·키 빌더(숫자 id)·`CancelReason.SUPERSEDED`·`ExpiryReason.ISSUE_DELETED`·`expireByTargetChange` 가 이미 있다. 상태 머신·`derive.js` 를 고치지 않는다. 재상신은 기존 `cancel(SUPERSEDED)` + 새 요청 `prev_request_id` 로 표현한다(종료 상태에서 나가는 전이 없음 — `constants.js` 주석 그대로).

### 3.4 ISSUE 와 TRANSITION 이 섞이지 않는 근거

| 층 | 근거 (코드 위치) |
|---|---|
| 열린 요청 하나 | `openDedupeKey` → `open:ISSUE:10001` vs `open:TRANSITION:10001:3`. 접두가 다르고, ISSUE 빌더는 `^\d{1,18}$` 만 받아 `'10001:3'` 형태 키를 만들 수 없다(`scopeKey.js` `TARGET_KEY_BUILDERS`). 두 UNIQUE 값은 절대 같지 않다 |
| 최신 요청 조회 | `ApprovalRepository.findLatestRequestId` 가 `WHERE target_kind=? AND target_key=?` — 종류와 키를 **둘 다** 묶는다. `getIssueApproval` 은 `TargetKind.ISSUE` 로만 부른다 |
| 전환 요약 | `TransitionRepository.listForIssue/findCandidates/findLive` 는 `FROM transition_request tr JOIN approval_request r` — ISSUE 요청은 부속 행이 없어 **구조적으로** 나오지 않는다 |
| 상세·결정 | `targetRegistry.get(state.targetKind)` 로 어댑터를 고른다. ISSUE 요청에 `beforeDecide`(전환 상태 확인)가 붙지 않는다 |
| 재상신 | `supersede` 가 `state.targetKind === adapter.kind && state.targetKey === adapter.keyOf(target)` 확인 — 다른 종류 요청 id 를 넘기면 `INVALID_TARGET`, 회수하지 않는다 |
| 트리거 | 전환 처리(`TransitionChangeService`)는 transition_request 만, 일반 승인 처리(`IssueApprovalChangeService`)는 `target_kind='ISSUE'` 만 본다. 상태 변경 이벤트는 ISSUE 요청을 건드리지 않는다 |
| 화면 | 두 칸이 서로 다른 resolver·쿼리키(`approvalKeys.issue` / `transitionKeys.issue`)를 쓴다. 한 응답을 나눠 그리지 않는다 |

증명 테스트 목록은 §4.9.

---

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/issue/changeSince.js                        (+ __test__/changeSince.test.js)
src/resolver/approval/target/IssueTargetAdapter.js     변경: describe 에 updatedAt, changeSince 훅, 주석(Q1 답)
src/resolver/approval/target/IssueChangeReader.js      신규: asUser changelog 끝 페이지(1~2콜), invocation memo
src/resolver/approval/IssueApprovalChangeService.js    신규: handleEvent(event) — deleted:issue 만, 열린 ISSUE 요청 만료
src/resolver/approval/ApprovalService.js               변경: §4.2~§4.5
src/permission/JiraPermission.js                       변경: loadIssue fields 에 updated, snapshot.updatedAt
src/resolver/notification/NotificationService.js       변경: EXPIRED+ISSUE_DELETED+ISSUE → issueDeleted
src/trigger/onIssueChanged.js                          변경: 두 서비스 각각 try/catch
src/utils/errors/ErrorCodes.js                         2개 추가
```

### 4.2 엔진 훅 `changeSince` (ApprovalService.viewForTarget) — 상태 머신 무변경

어댑터 선택 메서드:
```js
/** @returns {Promise<ChangeSince|null>} null = 이 대상은 판정하지 않음. 실패는 {checked:false,...} 로(throw 금지) */
async changeSince(target, { state, snapshot })
```

`viewForTarget` 순서(기존 코드 278~301행 기준):
```
revision = snapshot?.revision ?? null
change = (state && isLatest && state.status ∈ {PENDING, APPROVED} && typeof adapter.changeSince === 'function')
         ? await adapter.changeSince(target, {state, snapshot}).catch(() => null)
         : null
pendingStale = change ? (state.status===PENDING && change.changed) : (기존 revision 규칙)
approvedStale = change ? (state.status===APPROVED && change.changed) : (기존 approvedContentVersion 규칙)
needEdit / canEdit / canRequest  — 기존 그대로(pendingStale 만 위 값 사용)
canRequest &&= requestAllowed   // §4.4 프로젝트 사용(ISSUE 만, getIssueApproval·getApprovalDetail 공통)
approvalContent(..., { pendingStale, approvedStale, change })
```
`approvalContent` 변경:
- `isStale` = `change ? (pendingStale || approvedStale) : 기존식`
- `canResubmit` = `pendingStale && state.requesterKey === principal.accountId` — **`|| canEdit` 제거**(Q82). 이 값을 쓰는 대상은 지금 ISSUE 뿐이다(TIMESHEET·ISSUE_TRANSITION 은 revision=null·훅 없음 → pendingStale=false). 영향받는 기존 테스트: `ApprovalService.test.js` 의 canResubmit 편집자 케이스가 있으면 기대값을 Q82 로 고친다(백엔드 보고서에 명시).
- `changeSinceRequest: change ?? null` 추가.

`getIssueApproval` 은 `isLatest=true`(기본)라 판정한다. `getApprovalDetail` 은 `isLatest = latestId === state.requestId` 일 때만.

### 4.3 IssueTargetAdapter 변경

| 메서드 | 변경 |
|---|---|
| `describe(target)` | `loadIssue` 가 `updatedAt`(Jira `fields.updated` → epoch ms, 파싱 실패 null)을 함께 돌려준다. 다른 키 무변경 |
| `changeSince(target, {state, snapshot})` **신규** | `baseline = changeBaseline(state)` 없으면 null → `needsChangelog({issueUpdatedAt: snapshot?.updatedAt ?? null, since})` false 면 `{checked:true, changed:false, ...}`(Jira 0콜) → 아니면 `IssueChangeReader.tail(issueId)` → `summarizeChanges` → `toChangeSince`. 읽기 실패 → `{checked:false, changed:false, ...}` |
| `canRequest(target)` | 무변경(편집 권한). 프로젝트 사용은 서비스에서(§4.4) — 어댑터는 Jira 사실만 |
| 주석 | "제품 진입점은 열지 않은 참조 어댑터(Q1)" → "이슈 일반 승인(issue-approval). Q1 답: 연다" |

`IssueChangeReader.tail(issueId)` (asUser, invocation memo `issueChangelog:<id>`):
```
1. GET /rest/api/3/issue/{id}/changelog?startAt=0&maxResults=100       → {total, values}
2. total > values.length 면 GET ...?startAt=${total-100}&maxResults=100  → 끝 페이지(최신)
→ { histories: values, complete: total <= 100 }
```
`route` 는 template strings 로 쓰고 숫자를 보간한다(쿼리스트링 통째 보간 금지 — CLAUDE.md 함정). 시간 상한 3초(`Promise.race`), 실패·403·404 → throw 하지 않고 `null` → `checked:false`. 순서 가정(오래된 것부터)은 I2 — 도메인이 `created` 로 다시 정렬하므로 순서가 달라도 판정은 맞고, 끝 페이지 선택만 틀릴 수 있다(그때 truncated 로 표시).

### 4.4 요청 생성 (`ApprovalService.createIssueApproval`)

```
1. target = issueAdapter.parse(payload)
2. snapshot = await adapter.describe(target)                       — 기존 createForTarget 안의 describe 를 앞으로 당겨 knownSnapshot 으로 넘긴다(Jira 1콜 그대로)
3. projectEnabled(snapshot.projectId) false → ISSUE_APPROVAL_PROJECT_DISABLED   (Q86. transition/projectEnablement.isProjectEnabled 재사용)
4. supersedes 결정:
     payload.supersedes 있음 → 그대로(검사는 5)
     없음 → latest = repository.findLatestForTarget({ISSUE, issueId}); latest 가 있고 PENDING 아님 → supersedes = latest.requestId (prev 연결만, 회수 없음)
5. createForTarget(request, {adapter, target, snapshot, supersedes})   — supersede 가드는 §4.5
```
결재선은 요청자가 `steps` 로 보낸 것(직접 구성 또는 Flow 를 펼친 것)을 기존 `expandRequestedSteps` → `assertApproversAllowed`(명부·승인자 이슈 열람) 로 검사한다. `flowId` 는 기존처럼 표시용 라벨이다(일반 승인은 요청자가 결재선을 정하므로 Flow 는 편의 기능이지 경계가 아니다 — 전환 승인 Q56 과의 차이, §7.3 화면 문구).

### 4.5 재상신·회수 가드 (ApprovalService)

`supersede(requestId, {adapter, target, principal, now})` — 기존 동작에 한 줄 추가:
```
state.status === PENDING && state.requesterKey !== principal.accountId → RESUBMIT_NOT_ALLOWED {requestId}
```
- 지금은 `createIssueApproval` 가드(`{issue:edit}`)만 통과하면 **아무 편집자나 남의 진행 중 요청을 supersede(=회수)** 할 수 있다. `cancelApproval` 은 요청자·Jira 관리자만 허용하므로 형제 경로 사이 권한이 어긋난다 → 이 가드로 맞춘다.
- TIMESHEET 은 대상이 항상 본인(요청자=principal)이라 영향 없음. ISSUE_TRANSITION 은 `TransitionService` 가 `supersedes` 를 넘기지 않는다(확인함, `TransitionService.js:280~287`).
- 변경 여부(stale) 는 서버가 강제하지 않는다 — 요청자 본인이 결재선을 바꾸려 다시 상신하는 것은 회수+새 요청과 같아 해가 없다. 화면은 stale 일 때만 버튼을 보인다.

`cancelApproval` — 요청자/관리자 확인 뒤 `await this.assertTargetVisible(state, principal)` 추가(모든 종류). 이유: 같은 요청을 다루는 상세·이력·증명서·결정은 모두 대상 열람을 확인하는데 회수만 빠져 있고, 회수 응답(`result`)이 요청 상태(대상 제목 포함)를 돌려준다(불변식 7). 영향받는 기존 테스트: `ApprovalService.test.js` 회수 케이스의 가짜 어댑터에 `canView: true` 가 없으면 추가.

### 4.6 이슈 삭제 (`IssueApprovalChangeService.handleEvent`)

```
type 이 ':deleted:issue' 로 끝나지 않으면 즉시 반환(SQL 0)        ← updated:issue 는 아무것도 안 한다(편집은 요청을 죽이지 않는다)
issueId = 숫자 검증(event.issue.id) — 실패 반환
isTableReady('approval_request') 아니면 반환(ensureMigratedOnce 금지 — 트리거 규칙)
state = repository.findLatestForTarget({targetKind:'ISSUE', targetKey: issueId}); PENDING 아니면 반환
closed = repository.closeBySystem(requestId, cur => expireByTargetChange(cur, {reason: ISSUE_DELETED, now}))
closed 면 appNotifier({kind: EXPIRED, ..., background: true}) — shouldEmitNotifications 가 라이선스로 막는다
```
`onIssueChanged` 는 `transitionChangeService.handleEvent` 와 `issueApprovalChangeService.handleEvent` 를 **각자 try/catch** 로 순서대로 부른다(한쪽 실패가 다른 쪽을 막지 않게). 이벤트 id 는 `expireByTargetChange` 의 결정적 규칙(`${reason}:${contentVersion}`) — Forge 재시도에도 1건(불변식 6).
놓친 삭제 이벤트: 결재자가 열면 `getApprovalDetail` → `canView` false(삭제된 이슈) → 열람 거부, 업무함은 `filterVisible` 이 숨긴다. 만료 스윕(마감)이 결국 닫는다. 별도 스윕 없음.

### 4.7 알림 템플릿

`notificationTemplate({kind, reason, targetKind})`:
- `EXPIRED` + `ISSUE_DELETED` + `targetKind === ISSUE` → `notification.template.issueDeleted`(기존 transition 분기보다 **앞에**).
- 나머지 ISSUE 알림은 기존 범용 템플릿(`requested`·`completed`·`rejected`·`cancelled`·`expired`·`dueSoon`·`reminder`). SUPERSEDED 회수는 지금처럼 `repository.cancel` 직행이라 알림이 없고, 새 요청의 `REQUESTED` 가 결재자에게 간다(기존 동작 유지).

### 4.8 정책 키 — 추가 없음 (Q87)

### 4.9 불변식·권한 점검 + 증명 테스트

| 불변식 | 지점 |
|---|---|
| 1 열린 요청 하나 | `open:ISSUE:{issueId}` UNIQUE. 재상신은 이전 요청 회수(dedupe 를 `closed:<uuid>` 로) 뒤 생성 — 경합 시 dedupe 가 하나만 통과 |
| 2 결정이 진실 | 상태 머신 무변경. "수정됨"은 상태가 아니라 조회 시 파생(저장 안 함) |
| 3 순수 | `changeSince.js` 는 `since`·`histories`·`issueUpdatedAt` 를 인자로. `Date.now()` 없음 |
| 4 CAS rev | 새 UPDATE 없음(만료·회수는 기존 엔진 경로) |
| 5 조건부 UPDATE | 엔진 그대로 |
| 6 결정적 이벤트 id | 삭제 만료 = `expireByTargetChange` 규칙, SUPERSEDED 회수 = 기존 cancel 규칙 |
| 7 범위 재필터 | §4.10 표. 회수에 열람 확인 추가(§4.5) |
| 8 asUser | changelog·이슈 조회 전부 asUser(사용자 호출 안). 트리거는 Jira 호출 없음. asApp 추가 없음 |
| 9·10 | 이슈 프로퍼티를 읽지도 쓰지도 않는다. validator 무관 |

### 4.10 형제 resolver 권한 범위 (요구 6)

| resolver | 가드 | 서비스 재확인 | 결론 |
|---|---|---|---|
| `getIssueApproval` | {issue:view} | — | 조회 = 이슈 열람 |
| `createIssueApproval` | {issue:edit} | 프로젝트 사용, supersede 요청자 | 요청 = 이슈 편집 |
| `getApprovalDetail`·`getApprovalHistory`·`getApprovalCertificate` | SELF | `assertTargetVisible` → `canView`(이슈 열람) | 조회 = 이슈 열람 |
| `decideApproval`·`bulkApprove` | SELF | `assertTargetVisible` + `canDecideNow`(지금 차례 결재자 본인) 또는 위임 | 결정 = 이슈 열람 + 결재자 본인 |
| `cancelApproval` | SELF | 요청자·Jira 관리자 + **열람(추가)** | 회수 = 이슈 열람 + 요청자 |
| `listInbox`·`listNotifications` | SELF | 어댑터 `filterVisible` = `permissions/check` 일괄(fail-close) | 목록 = 이슈 열람 |
| `getRequestDefaults`·`searchApprovers` | SELF | 공개 목록(대상 데이터 없음) | — |

**증명 테스트 목록**(백엔드 — 완료 기준 "섞이지 않음"):

| # | 파일 | 케이스 |
|---|---|---|
| B1 | `src/domain/approval/__test__/transitions.test.js`(추가) 또는 신규 `scopeKey.isolation.test.js` | 같은 issueId 의 ISSUE·ISSUE_TRANSITION `openDedupeKey` 가 다름 / ISSUE 빌더가 `'10001:3'` 거부 / `transitionTargetFromKey('10001')` null |
| B2 | `IssueTargetAdapter.test.js` | `targetOf({targetKey:'10001:3'})` → INVALID_TARGET / `changeSince`: updated ≤ 기준 → Jira 0콜·changed false / updated > 기준 + summary 변경 → changed true·fields / status·timespent 만 → false / reader 실패 → checked false / REJECTED 상태 → null |
| B3 | `ApprovalRepository.test.js` | ISSUE·TRANSITION 요청을 같은 이슈에 만들 때 dedupe 파라미터가 서로 다름 / `findLatestRequestId` 가 target_kind 를 바인딩 |
| B4 | 신규 `src/resolver/approval/__test__/IssueApprovalIsolation.test.js` — **메모리 가짜 저장소**(`(kind,key)` 별 최신·`open:` dedupe 집합) | (a) TRANSITION 요청이 열린 이슈에서 `getIssueApproval` → approval null·canRequest true (b) 같은 이슈에 `createIssueApproval` 성공(ALREADY_OPEN 아님) (c) 그 뒤 ISSUE 를 다시 만들면 ALREADY_OPEN (d) `supersedes` 에 TRANSITION requestId → INVALID_TARGET 이고 전환 요청은 PENDING 유지 (e) ISSUE 요청 결정 시 전환 `beforeDecide` 미호출 |
| B5 | `TransitionService.test.js`(추가) | ISSUE 요청이 열린 이슈의 `getIssueTransitionApprovals` 결과가 targets·history 무변화, `approvals.findLatestForTarget` 를 ISSUE 로 부르지 않음. `TransitionRepositories.test.js`: `listForIssue` SQL 이 `FROM transition_request` 로 시작 |
| B6 | `ApprovalService.test.js`(추가) | `canResubmit`: 요청자+수정됨 true / 편집자(비요청자)+수정됨 false / 요청자+수정 없음 false. supersede: 비요청자 PENDING → RESUBMIT_NOT_ALLOWED·cancel 미호출 / 요청자 → SUPERSEDED 회수 + 새 요청 prevRequestId / 이전이 APPROVED 면 supersedes 없이도 prevRequestId 연결. 프로젝트 사용 안 함 → ISSUE_APPROVAL_PROJECT_DISABLED·canRequest false·notAvailableReason. 회수: 열람 불가 → PERMISSION_TARGET_VIEW_DENIED |
| B7 | `IssueApprovalChangeService.test.js`(신규) + `src/trigger/__test__/onIssueChanged.test.js` | deleted → 열린 ISSUE 만료 1건·알림 background / 재전송 시 이벤트 1건 / updated(상태·필드) → SQL 0 / 전환 서비스가 throw 해도 일반 승인 처리 진행, 그 반대도 / 트리거 throw 없음 |
| B8 | `NotificationService` 테스트 | EXPIRED+ISSUE_DELETED: ISSUE → `issueDeleted`, ISSUE_TRANSITION → `transitionIssueDeleted` |
| B9 | `InboxService` 테스트(있으면 추가) | 같은 이슈의 ISSUE·ISSUE_TRANSITION 행이 각자 어댑터로 가시성 판정, ISSUE 행 `transition` null |

---

## 5. 스키마·마이그레이션 — 없음

- 새 테이블·컬럼 없음 → `migrate.js` 무변경(최신 `v032` 유지), major upgrade 사유 없음.
- 사용 칸: `approval_request.{target_kind='ISSUE', target_key=issueId, issue_id, issue_key, project_id, prev_request_id, created_at, content_version=0, content_hash=NULL}`, `approval_event.{event_type='APPROVED', occurred_at}`.
- 기준 시각을 Jira `updated` 로 저장하는 안(`content_hash` 재활용 또는 ALTER)은 기각 — 시계 차이 문제(I4)를 줄이는 대신 의미 없는 칸 재활용 또는 마이그레이션이 생긴다. I4 실측에서 차이가 크면 `v033_alter_approval_request_target_updated_at`(BIGINT NULL)로 되돌아온다.

---

## 6. Jira 연결

### 6.1 manifest 변경

```yaml
  jira:issueAction:
    - key: transition-approval-action        # 키 무변경(X28 moduleKey 판정·배포 이력 보존)
      title: Request approval                 # ← "Request transition approval" 에서 변경(Q85)
      resource: main/modal
      ...
```
- 주석 갱신: "승인 ••• 메뉴 진입 — 모달이 종류 선택(일반 / 상태 변경)을 먼저 보여 준다".
- `jira:issueContext`·`jira:issuePanel`(키 `transition-approval-*`) 무변경 — 같은 엔트리 `issue` 가 두 칸을 그린다. 키 이름이 기능보다 좁지만 배포 전이라도 키 변경은 이점이 없어 두지 않는다(주석으로 "이슈 승인 요약(일반+전환)" 명시).
- **scope 추가 없음**: changelog·이슈 조회 = `read:jira-work`.
- 트리거 이벤트 추가 없음.

### 6.2 REST 목록 (이번 기능이 새로 부르는 것)

| 호출 | 주체 | 경로 | 미검증 |
|---|---|---|---|
| `GET /rest/api/3/issue/{id}?fields=summary,project,updated` | asUser | `loadIssue`(어댑터 describe) — 기존 호출에 필드만 추가 | I1 |
| `GET /rest/api/3/issue/{id}/changelog?startAt=0&maxResults=100` (+ 끝 페이지 1) | asUser | `IssueChangeReader.tail` — `updated` 가 기준 이후일 때만 | I2·I3·I8 |

asApp 추가 없음. `AGENTS.md` 무변경.

---

## 7. 프론트

### 7.1 엔트리 — 추가 없음 (3곳 무변경)

| 모듈 | 리소스 | 배치 변경 |
|---|---|---|
| `jira:issueContext` | `issue` | compact: **일반 승인 한 줄**(상태 배지 + "요청 이후 수정됨" 배지 + 버튼 하나) 위, 전환 목록(기존) 아래 |
| `jira:issuePanel` | `issue` | full: 일반 승인 칸(최신 요청 요약·수정 필드 목록·버튼) + 전환 목록(기존 full) |
| `jira:issueAction` | `modal` | moduleKey/issueAction 진입이고 intent 가 없으면 **종류 선택 화면**(`overview`) |

상시 로드 번들: 일반 승인 칸은 `@atlaskit/lozenge`·button·primitives 와 이미 있는 `ApprovalStatusLozenge` 만 쓴다. 순서표·폼·상세는 모달에서. 빌드 보고서에 issue 엔트리 고유 JS 를 기존(6.3KB gz, X30)과 비교해 적는다.

### 7.2 화면 트리

```
entries/issue.jsx (변경)
  └ IssueApprovalOverview {issueId, layout, onOpen}
      ├ IssueGeneralApprovalSection   — useQuery(approvalKeys.issue(issueId), getIssueApproval)
      │    model: generalSummaryOf(view) (issueApprovalModel.js)
      │    버튼: 요청 → onOpen({intent:'request'}) / 상세 → {intent:'detail', requestId} / 다시 상신 → {intent:'resubmit'}
      │    notAvailableReason='PROJECT_DISABLED' → 한 줄 안내, 버튼 없음
      │    오류(APP_ACCESS_DENIED 등) → 이 칸만 오류 한 줄(전환 칸은 독립)
      └ TransitionApprovalList (무변경 — 기존 props 그대로)
  openModal(context): 기존 함수 재사용 — onClose 에서 transitionKeys.issue + approvalKeys.all 무효화(이미 있음)
entries/modal.jsx (변경)
  resolveModalTarget → flow 'overview' 추가: fromAction && !intent 일 때 (기존 'transition' 대신)
  OverviewModalFlow {issueId}
    screen 'overview' → ModalLayout 안 IssueApprovalOverview layout='full'
         일반 칸 버튼 → screen {kind:'general', intent}   → <ApprovalModalFlow contextIssueId initialIntent=intent/>
         일반 칸 상세 → screen {kind:'general', requestId}→ <ApprovalModalFlow contextRequestId initialIntent='detail'/>
         전환 행 요청 → screen 'transitionRequest' (TransitionModalFlow 와 같은 렌더, onCancel → overview)
         전환 상세   → <ApprovalModalFlow contextRequestId initialIntent='detail'/>
  intent 'transitionPick'·'transitionRequest' 무변경(이슈 엔트리·기존 경로)
features/issueApproval/ (신규)
  IssueApprovalOverview.jsx · IssueGeneralApprovalSection.jsx · ChangedLozenge.jsx
  issueApprovalModel.js   — generalSummaryOf(view) → {state:'NONE'|'PENDING'|'PENDING_CHANGED'|'APPROVED'|'APPROVED_CHANGED'|'REJECTED'|'CLOSED',
                            action:'request'|'detail'|'resubmit'|null, changedFieldsText, notAvailableReason}  (순수, 테스트)
                            changedFieldsLabel(fields, truncated, t) — "요약, 설명 외 2"
features/detail/ApprovalDetail.jsx (변경)
  approval.changeSinceRequest?.changed 이면:
    PENDING  → SectionMessage warning issueApproval.detail.changedPendingTitle / changedPending({time, fields})  (기존 v{requested}→v{current} 문구 대신)
    APPROVED → 기존 'state.pill.reapproval' 제목 + issueApproval.detail.changedApproved({time, fields})
  checked=false 면 아무것도 표시하지 않음. 다른 종류(changeSinceRequest null)는 기존 분기 그대로
features/request/RequestForm.jsx (변경)
  상단 SectionMessage(information) issueApproval.form.kindHint — "일반 승인: 결재선을 직접 구성하거나 Flow 를 고릅니다. 상태 변경 승인과는 별개입니다."
  오류 ISSUE_APPROVAL_PROJECT_DISABLED·RESUBMIT_NOT_ALLOWED 는 기존 error.{code} 출력으로 충분
features/transition/TransitionRequestForm.jsx — 무변경(이미 transition.form.lineFixed 로 "규칙이 정한다" 표시)
```

### 7.3 두 종류 구분 (요구 2)

| | 일반 승인 | 상태 변경 승인 |
|---|---|---|
| 칸 제목 | `issueApproval.section.title` "검토·결재" | `transition.list.title` "전환 승인"(기존) |
| 결재선 | `ApprovalLineEditor` 직접 구성 탭 / Flow 탭(기존 RequestForm) | 규칙 Flow 고정, 읽기 전용(기존) |
| 폼 상단 안내 | `issueApproval.form.kindHint` | `transition.form.lineFixed`(기존) |
| 종류 선택 화면 카드 설명 | `issueApproval.overview.generalHint` | `issueApproval.overview.transitionHint` |

### 7.4 쿼리키

신규 키 없음. `approvalKeys.issue(issueId)`(기존)와 `transitionKeys.issue(issueId)`(기존)를 그대로. 인라인 키 금지 계약 테스트 유지.

### 7.5 프론트 테스트

| # | 파일 | 케이스 |
|---|---|---|
| F1 | `features/issueApproval/__test__/issueApprovalModel.test.js` | 7개 state·action 매핑, PROJECT_DISABLED, checked=false 는 CHANGED 아님, fields 라벨 truncated |
| F2 | `features/issueApproval/__test__/IssueApprovalOverview.test.jsx` | **같은 이슈에 일반 PENDING + 전환 USABLE** 가짜 응답 → 두 칸이 각자 상태를 그림(일반 칸에 전환 상태 없음, 전환 행에 일반 상태 없음) / 일반 쿼리 오류여도 전환 칸 정상 / invokeApproval 호출 이름·인자 2종 |
| F3 | `entries/__test__` 또는 `transitionModel.test.js` | `resolveModalTarget`: issueAction 진입·intent 없음 → `overview`, `transitionPick`/`transitionRequest` intent → `transition`, requestId → `approval` |
| F4 | `ApprovalDetail` 테스트 | changeSinceRequest PENDING changed → 새 경고 문구, APPROVED changed → 재승인 문구, null → 기존 분기 |
| F5 | 쿼리키 계약 | `approvalKeys.issue('1')[0] !== transitionKeys.issue('1')[0]` |

### 7.6 iframe 함정

issueContext 는 두 칸이 되어 높이가 늘어난다 — `100vh` 금지 유지, 칸마다 내용 높이(I7). 모달 종류 선택 화면은 `ModalLayout` 안에서 스크롤.

---

## 8. i18n 키 (kr / en) — `npm run merge` 필수, 자리표시 `{name}`

### 8.1 신규 `locales/{kr,en}/issueApproval.json`

| 키 | kr | en |
|---|---|---|
| `section.title` | 검토·결재 | Review & approval |
| `section.none` | 진행 중인 결재가 없습니다. | No approval in progress. |
| `section.request` | 승인 요청 | Request approval |
| `section.detail` | 상세 | Details |
| `section.resubmit` | 다시 상신 | Resubmit |
| `section.projectDisabled` | 이 프로젝트는 승인을 사용하지 않습니다. | Approvals are turned off for this project. |
| `section.loadFailed` | 결재 정보를 불러오지 못했습니다. | Couldn't load approval details. |
| `changed.pending` | 요청 이후 수정됨 | Edited since request |
| `changed.approved` | 승인 이후 수정됨 | Edited since approval |
| `changed.fields` | 바뀐 항목: {fields} | Changed: {fields} |
| `changed.more` | {fields} 외 {count} | {fields} and {count} more |
| `changed.truncated` | {fields} 등 | {fields} and others |
| `detail.changedPendingTitle` | 요청 이후 이슈가 수정되었습니다 | The issue was edited after the request |
| `detail.changedPending` | {time}에 마지막으로 수정되었습니다({fields}). 이 요청은 그대로 진행됩니다. 현재 내용으로 승인받으려면 요청자가 다시 상신하세요. | Last edited {time} ({fields}). This request continues as is. To get the current content approved, the requester should resubmit. |
| `detail.changedApproved` | 승인 이후 {time}에 수정되었습니다({fields}). 현재 내용은 승인되지 않았습니다. | Edited {time} after approval ({fields}). The current content is not approved. |
| `form.kindHint` | 일반 승인: 결재선을 직접 구성하거나 Flow 를 고릅니다. 상태 변경 승인과는 별개입니다. | General approval: build the approval line yourself or pick a flow. This is separate from transition approval. |
| `overview.title` | 승인 요청 | Request approval |
| `overview.generalHint` | 이 이슈의 내용을 검토·결재받습니다. | Get this issue reviewed and approved. |
| `overview.transitionHint` | 승인이 필요한 상태로 전환하기 전에 받습니다. | Get approval before moving to a status that requires it. |

### 8.2 기존 네임스페이스 추가·수정

| 키 | kr | en |
|---|---|---|
| `error.ISSUE_APPROVAL_PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않아 새로 요청할 수 없습니다. | Approvals are turned off for this project, so you can't submit a new request. |
| `error.RESUBMIT_NOT_ALLOWED` | 진행 중인 요청은 요청자만 다시 상신할 수 있습니다. | Only the requester can resubmit a request in progress. |
| `notification.template.issueDeleted` | 이슈가 삭제되어 승인 요청이 만료됐습니다. | The approval request expired because the issue was deleted. |
| `transition.server.validator.REJECT_NO_REQUEST` (수정) | 이 전환은 승인이 필요합니다. 이슈의 Moves Approval 영역 또는 ••• > "Request approval" > 상태 변경 승인에서 요청하세요. | This transition needs approval. Request it from the Moves Approval area on the issue or ••• > "Request approval" > Transition approval. |

`transition.server.*` 는 백엔드가 import 하는 서버 문구다(X22) — 키 이름 무변경, 값만 바꾼다. kr/en 두 언어를 먼저 고치는 쪽이 함께 고친다.

---

## 9. 용량·호출량

### 9.1 용량 (200명, 일반 승인 하루 30건 가정 — 실측 전, 인덱스 포함 ×2)

| 항목 | 연 건수 | 행 크기 | 연 용량 |
|---|---|---|---|
| 일반 승인 요청(요청·결재자·이벤트·업무함·알림 — 기존 엔진 행) | 약 7,500 | 약 2.4KB | 약 18MB |
| 재상신(가정 10%) | 약 750 | 약 2.4KB | 약 2MB |
| **합계 추가** | | | **연 약 20MB**, 3년 60MB — 새 테이블 없음, 기존 예산(1GiB) 안 |

### 9.2 resolver·트리거 1회당 Jira 호출

| 경로 | Jira 호출 | 비고 |
|---|---|---|
| `getIssueApproval` — 요청 없음·종료(REJECTED 등) | 가드 mypermissions 1 + 이슈 1 = **2** | canRequest 의 편집 확인은 `getIssueAccess` invocation memo(0) |
| `getIssueApproval` — PENDING/APPROVED, 기준 이후 `updated` 안 바뀜 | **2** | 대부분의 경우 |
| `getIssueApproval` — `updated` 가 기준 이후 | 2 + changelog **1~2** | changelog 100건 초과 이슈만 2 |
| issue 엔트리 1회 로드(두 칸) | 위 2~4 + `getIssueTransitionApprovals` 2 = **4~6** | 두 resolver 병렬. 합친 resolver 로 1~2콜 아낄 수 있으나 섞임 위험과 계약 변경을 피해 분리 유지 |
| `createIssueApproval` | 가드 1 + 이슈 1 + 결재자 열람 n + 그룹 펼침 g | 기존과 같음(describe 를 앞당겼을 뿐) |
| `getApprovalDetail`(ISSUE, 최신 회차) | 기존 + changelog 0~2 | |
| `decideApproval`·`bulkApprove`(ISSUE) | 기존과 같음 | 결정에는 수정 판정을 하지 않는다(편집은 요청을 죽이지 않는다) |
| 트리거 `updated:issue` | 0 | 일반 승인 쪽 SQL 0 |
| 트리거 `deleted:issue` | 0 | SQL 2~3(최신 조회·만료 CAS) |
| 업무함 목록 | 기존 `permissions/check` 일괄 | N+1 없음 |

호출량 상한: 이슈 화면 조회 수 × 4~6. 200명 × 하루 이슈 열람 100회 가정 시 하루 약 10만 콜 — Forge/Jira 요율 한도 안이나 X30 과 함께 배포 후 확인(I9).

---

## 10. 미검증 — `04_spike_todo.md` 에 추가할 목록 (I1~)

| # | 항목 | 영향 | 확인 방법 | 틀렸을 때 |
|---|---|---|---|---|
| **I1** | 이슈 `fields.updated` 가 어떤 변경에 갱신되나(필드 편집·코멘트·워크로그·전환·프로퍼티·첨부·링크) | 사전 거름의 효과(비용만, 정확도 무관) | 요청 후 코멘트만 달기 → `getIssueApproval` 응답에 changelog 호출 여부(진단 필드 또는 로그 `[ISSUE-CHANGE] fetched`) | 거름이 너무 자주 통과하면 compact(issueContext)에서는 changelog 를 생략하고 패널·상세에서만 판정 |
| **I2** | `GET issue/{id}/changelog` 정렬(오래된 것부터?)·`total` 제공·maxResults 상한 100·asUser 접근 | 끝 페이지 선택 | 100건 넘는 이슈에서 응답 순서·total 확인 | 정렬이 최신부터면 첫 페이지만 읽도록 reader 1줄 수정. 대안: `POST /rest/api/3/changelog/bulkfetch`(fieldIds 필터) |
| **I3** | changelog 에 남지 않는 수정(코멘트·이슈 프로퍼티·원격 링크) 범위, 첨부·이슈 링크·부모 변경의 항목 형태 | Q81 의 실제 범위 | 각 수정 후 changelog 항목 확인 | 문서화(가이드)만. 코멘트를 세야 하면 Q81 재논의 |
| I4 | Forge 런타임 `Date.now()` 와 Jira `created`/`updated` 시계 차이 | 요청 직후 수정의 오탐·누락 | 요청 직후 1초 안에 요약 수정 → "수정됨" 표시 여부 | 차이가 크면 요청 시점 `updated` 를 기준으로 저장(`v033_alter_*`, §5) |
| I5 | issueAction title 변경 후 기존 설치에서 ••• 메뉴 이름 갱신(`forge deploy` 만으로?) | Q85 | 배포 후 ••• 메뉴 문구 | `forge install --upgrade` 필요 여부 기록 |
| I6 | X28(moduleKey 위치)·X11 — 종류 선택 화면(overview) 진입 판정 | ••• 진입이 overview 로 가는지 | ••• > Request approval → 종류 선택 화면 | moduleKey 를 못 받으면 issueAction + main/modal = overview 로 고정(현재 폴백과 같은 규칙) |
| I7 | issueContext 높이 — 두 칸이 된 compact 의 iframe 자동 높이 | 우측 요약 잘림 | 일반 PENDING + 전환 규칙 2개 이슈에서 스크롤 없이 보이는지 | compact 에서 전환 칸을 한 줄 요약으로 접기 |
| I8 | changelog `items[].fieldId` 가 사용자 정의 필드(Rank·Sprint)·team-managed 에서 어떤 값인지, `field` 이름이 사용자 locale 로 번역되는지 | 무시 필드 판정(Q81) | 보드에서 순위 변경·스프린트 이동 후 changelog | 이름 비교 대신 `fieldId` 로 사이트별 Rank/Sprint id 를 `GET /rest/api/3/field` 로 한 번 찾아 캐시 |
| I9 | 이슈 화면 로드당 4~6콜의 요율 한도 영향 | 대형 사이트 성능 | 배포 후 이슈 화면 연속 열람 시 429 여부 | 두 칸을 합친 조회 resolver(가드 1회 공유) 신설 |
| I10 | 우리 시간 추적 화면(asUser)이 남기는 워크로그 changelog 항목 이름(`timespent`·`WorklogId`) | 워크로그 기록이 "수정됨" 오탐 | 작업 로그 기록 후 changelog | 무시 목록에 실측 이름 추가 |

기존 항목 재사용: X10(`deleted:issue` payload 의 issue.id) — §4.6 삭제 만료가 기댄다. X29(Modal onClose) — 두 칸 무효화가 기댄다.

---

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] `src/domain/issue/changeSince.js` + 테스트(§3.1 전 케이스)
- [ ] `JiraPermission.loadIssue` — `fields=summary,project,updated`, snapshot `updatedAt`(WorklogService 등 다른 소비자는 무시하는 추가 키). 기존 테스트 기대 URL 이 있으면 갱신
- [ ] `IssueChangeReader`(asUser, memo, 3초, 실패 null, route template strings)
- [ ] `IssueTargetAdapter` — `changeSince` 훅, 주석 Q1 갱신 + 테스트 B2
- [ ] `ApprovalService` — `viewForTarget` 훅 반영(§4.2), `approvalContent` `canResubmit` Q82·`changeSinceRequest`, `getIssueApproval`·`getApprovalDetail` 의 `notAvailableReason`/canRequest 프로젝트 사용, `createIssueApproval`(§4.4 — describe 선행·프로젝트 사용·이전 회차 자동 연결), `supersede` 요청자 가드, `cancelApproval` 열람 확인
- [ ] `IssueApprovalChangeService` + `onIssueChanged` 두 서비스 분리 try/catch + 테스트 B7
- [ ] `NotificationService.notificationTemplate` ISSUE 삭제 분기 + B8
- [ ] `ErrorCodes` 2개 + `locales/{kr,en}/error.json`, `notification.json` 키, `transition.json` `server.validator.REJECT_NO_REQUEST` 값 수정(두 언어)
- [ ] 격리 증명 테스트 B1·B3·B4·B5·B6·B9
- [ ] manifest issueAction title + 주석, `PermissionMap.js` 주석
- [ ] `docs/DESIGN.md` §2 표에 "④ 이슈 일반 승인 — 기록형(강제 없음), scopeKey ISSUE:{issueId}" 한 줄(허용 범위)
- [ ] `_workspace/issue-approval/04_spike_todo.md` 생성 — §10 I1~I10 + 구현 중 생긴 항목 I11~
- [ ] `npm test -- --runInBand`

### 11.2 frontend 체크리스트

- [ ] `features/issueApproval/*`(§7.2) + `issueApprovalModel.js` 테스트 F1
- [ ] `entries/issue.jsx` → `IssueApprovalOverview`(일반 칸 + 기존 TransitionApprovalList), 100vh 금지
- [ ] `entries/modal.jsx` — `overview` flow, `transitionModel.resolveModalTarget` 분기(F3), 일반 칸 → `ApprovalModalFlow` 화면 전환(모달 안 모달 금지)
- [ ] `ApprovalDetail` changeSinceRequest 분기(F4), `RequestForm` kindHint
- [ ] `locales/{kr,en}/issueApproval.json` + §8.2 → `npm run merge`
- [ ] F2·F5, `npm run test:ui -- --runInBand`, `npm run build:ui`(issue 엔트리 고유 JS 크기 — X30 기준 6.3KB gz 대비)

### 11.3 순서·의존

1. 백엔드 도메인 → 어댑터·reader → 엔진 훅·가드 → 삭제 트리거 → 문구
2. 프론트는 §2.3·§2.4 shape 만 보고 병렬 가능. `transition.json` 의 `server.validator.REJECT_NO_REQUEST` 는 키 이름 무변경, 값만(먼저 고치는 쪽이 두 언어 모두)
3. 검증자는 §2 표·§3.4 근거 표·§4.10 권한 표·§4.9 테스트 목록을 기준으로 본다

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-04 | 최초 작성 | 로드맵 7 착수(QUESTIONS Q1 답 "연다") |
