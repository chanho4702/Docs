# transition-approval 설계서 — 이슈 상태 변경(전환) 승인

> 작성: feature-architect · 2026-10-03 · autopilot 무인 회차(설계만, 코드 무변경)
> 입력: `00_input/requirement.md`, `docs/DESIGN.md` §0·§2.1·§6·§7·§8·§10, `CLAUDE.md`, `AGENTS.md`, `_workspace/{core-port,timesheet-approval,workforce-link}/01_architect_design.md`, `_workspace/QUESTIONS.md`(Q1~Q51)
> 기준 코드: workforce-link 완료 상태(백엔드 55/713, UI 20/161). 아래 파일·함수 이름은 이 회차에 직접 읽은 값이다.
> 참조만: Confluence 판 `C:\CloudJira\moves-approval\src\resolver\notification\CommentNotifier.js`(수신자 선택·ADF 조립·asUser·배경 호출 생략 규칙을 이식)
> **수용 기준 문장(그대로 화면·문서에 싣는다): "전환 승인은 Moves Approval validator 를 붙인 전환에서만 강제된다. 규칙의 목적 상태로 들어가는 전환마다 관리자가 validator 를 붙여야 한다."**

---

## 열린 질문

제품 결정이 필요한 것만 적는다. 구현은 **기본 가정**으로 진행한다(답이 오면 정책 기본값·분기만 바뀌고 계약은 유지된다). `_workspace/QUESTIONS.md` 에 같은 내용을 Q52~Q63 으로 올렸다.

| # | 질문 | 기본 가정(구현 기준) | 대안 | 권장 |
|---|---|---|---|---|
| Q52 | 승인된(아직 쓰지 않은) 요청의 유효기간 | 없음 — 소비되거나 이슈 상태가 바뀔 때까지 유효 | 정책 `transitionApprovalValidDays`(N일 지나면 validator 가 `EXPIRED_APPROVAL` 로 거부) | 기본 가정. 상태 불일치가 이미 낡은 승인을 막는다(§3.4). 감사 요구가 있으면 대안을 키 하나로 추가 |
| Q53 | validator 장애(DB 오류·시간 초과·Jira 조회 실패) 시 | **fail-closed**(규칙이 걸린 전환만 거부, 문구 "승인 확인 불가 — 잠시 후 다시"). 비상 해제는 전역 정책 `transitionApprovalEnabled=false`. 라이선스 비활성은 **통과**(요청 resolver 가 막혀 교착되므로) | fail-open | fail-closed. 근거 §4.5. 차단 범위는 "규칙이 있는 목적 상태" 로 이미 좁고, 관리자는 정책 토글이나 Jira 워크플로에서 validator 를 떼어 즉시 풀 수 있다 |
| Q54 | 자동 전환(승인 즉시 앱이 전환) | **이번 범위 밖.** 요청자가 직접 다시 전환한다 | 정책 켬 시 asApp `POST issue/{id}/transitions` | 다음 회차 후보. asApp 사유 신설·이력 작성자가 앱이 되는 고지·화면 필수 필드(hasScreen) 처리·validator 가 자기 전환을 알아보는 장치가 모두 필요하다 |
| Q55 | Jira 코멘트 @멘션 알림 기본값 | **켬**(`commentNotifyEnabled=true`, 프로젝트별 덮어쓰기 가능). 행위자 본인 이름으로(asUser) 쓰고, 행위자에게 코멘트 권한이 없으면 조용히 건너뛴다 | 끔 | 켬. 요청자는 승인 뒤 **돌아와서 다시 전환해야** 한다 — 앱 내 알림함만으로는 놓친다. Jira 멘션은 이메일·모바일 푸시까지 Jira 가 전달한다 |
| Q56 | 결재선을 누가 정하나 | **규칙의 Flow 로 고정.** 요청자는 결재선을 바꿀 수 없고 참조·메시지·마감만 정한다 | 요청자가 결재선 구성(기존 RequestForm) | 고정. 강제 전환에서 요청자가 결재자를 고르면 짜고 승인하는 경로가 열린다 |
| Q57 | 승인된 전환을 누가 실행할 수 있나 | Jira 전환 권한이 있는 **누구나**(승인은 "이 이슈의 이 전환"에 대한 것) | 요청자만 | 기본 가정. 실행자 accountId 를 validator 가 받는지부터 미검증(X1) — 요청자만으로 바꾸면 X1 이 성립해야 한다 |
| Q58 | 프로젝트 "사용 안 함"(Q2)일 때 | validator **통과**(규칙 비활성), 요청 생성은 `TRANSITION_PROJECT_DISABLED` 로 거부, 규칙 화면에 경고. Q2 의 강제 지점을 이 기능에서 정한다 | validator 도 그대로 강제 | 기본 가정. 꺼 둔 프로젝트에서 요청할 길이 없는데 강제하면 교착이다 |
| Q59 | 이슈 우측 요약(issueContext)을 규칙 없는 프로젝트에도 띄우나 | 띄운다(규칙 없으면 한 줄 "이 이슈에는 승인 규칙이 없습니다") | 프로젝트 프로퍼티 기반 `displayConditions` 로 숨김(X9 성립 시) | 기본 가정으로 출시, X9 실측 후 대안 |
| Q60 | validator 거부 문구 언어 | 실행 사용자 locale 을 못 받으면(X1) **한·영 병기** 두 줄 | 사이트 기본 언어 정책 하나 | 기본 가정. 사용자 locale 을 받으면 그 언어 한 줄 |
| Q61 | 워크포스 연동 이슈 프로퍼티 `movesApproval`(전환 승인 요약) 게시 | **이번엔 게시하지 않음.** 계약 자리(`approval.issue`)만 유지 | 요청·결정 시 asApp 게시 | 기본 가정. 워크포스가 이 요약을 쓰는 화면이 아직 없다(Q38 명세에도 없음) |
| Q62 | 규칙 단위 | (프로젝트 × 이슈 유형[또는 전체] × **목적 상태**). 같은 목적 상태로 가는 여러 전환은 같은 승인으로 묶인다 | (… × 전환 id) | 기본 가정. 근거 §3.2 — 전환 id 는 워크플로 교체 시 바뀌어 규칙이 **조용히 풀린다**(fail-open) |
| Q63 | 결재 대기 중 이슈 상태가 다른 경로로 바뀌면 | 요청 자동 만료(`EXPIRED`, 사유 `ISSUE_STATE_CHANGED`) + 요청자 알림 | 대기 유지, 결재자가 판단 | 자동 만료. 출발 상태가 다른 승인은 validator 가 어차피 거부한다(§3.4) — 결재자가 쓸모없는 승인을 하지 않게 |

기술적 모호함은 스스로 결정하고 근거를 본문에 적었다: CONSUMED 표현(§3.5·§5.2 — 상태가 아니라 부속 행의 사실), 규칙 키(§3.2), 소비 시점(§4.5 — validator 는 "무장", 소비 확정은 실제 상태 변경 관찰), 변경 감지 방식(§4.6 — 트리거 + 조회·결정 시 지연 판정, 스윕 없음), 코멘트 asUser(§4.8), 이슈 화면 구성(§7.1).

---

## 1. 개요·영향 범위

**대상** = (이슈 `issueId`, 목적 상태 `toStatusId`). `scopeKey = TRANSITION:{issueId}:{toStatusId}` — 열린 요청은 이슈의 목적 상태당 하나(불변식 1).
> `docs/DESIGN.md` §2.1·`scopeKey.js` 주석은 `TRANSITION:{issueId}:{transitionId}` 로 예약했다. 접두 `TRANSITION` 은 그대로 두고 둘째 값을 **목적 상태 id** 로 확정한다(§3.2). 아직 배포 전이라 저장된 키가 없다. 백엔드는 `scopeKey.js` 예약 주석과 DESIGN §2.1 한 줄을 함께 고친다.

흐름:
```
관리자(프로젝트 설정)  규칙 저장: (프로젝트, 이슈 유형|*, 목적 상태, Flow)  +  Jira 워크플로 해당 전환에 validator 부착(안내)
사용자(이슈 우측 요약·••• 메뉴)  getIssueTransitionApprovals → [승인 요청] → 모달 TransitionRequestForm → createTransitionApproval
결재자(업무함·모달)  기존 decideApproval/bulkApprove — 결정 직전 이슈 상태 재확인(달라졌으면 만료)
승인 완료  앱 내 알림 + Jira 코멘트 @요청자(asUser, 결재자 이름)
요청자 [전환] 클릭 → validator: 규칙? → APPROVED·출발 상태 일치·미소비 → 통과 + 무장(armed)
트리거 avi:jira:updated:issue (status from→to 관찰) → 소비 확정(consumed_at) + CONSUMED 감사 이벤트
                                  └ 대기 중 요청의 출발 상태와 다르면 → EXPIRED(ISSUE_STATE_CHANGED)
```

| 축 | 영향 |
|---|---|
| 도메인 | **신규** `src/domain/transition/{rule,usability,judge,validatorPayload,statusChange,messages,commentAdf}.js`(순수). **추가만** `src/domain/approval/constants.js`(`TargetKind.ISSUE_TRANSITION`, `ExpiryReason.ISSUE_STATE_CHANGED`·`ISSUE_DELETED`, `EventType.CONSUMED`), `scopeKey.js`(키 빌더·역파서), `transitions.js`(`expireByTargetChange`). 상태 머신·`derive.js` 무변경 |
| resolver | **신규** `src/resolver/transition/`(Controller·Service·RuleRepository·TransitionRepository·IssueStateReader·ValidatorService·ChangeService·CommentNotifier) + `target/TransitionTargetAdapter.js`. **변경** `ApprovalService`(어댑터 훅 3개 — §4.3), `TargetRegistry`, `CertificateService`(부가 블록 키 일반화), `NotificationService`(템플릿 2개), `InboxService`(행 보강 필드), `SettingsRepository/Service`(정책 키 2개), `RetentionRepository`·`StorageService`(테이블 목록), `PermissionMap`(5개) |
| 함수·트리거 | **신규** function `transitionValidator`(`jira:workflowValidator`), trigger `issue-changed`(`avi:jira:updated:issue`·`avi:jira:deleted:issue`). 스케줄 추가 없음 |
| 스키마 | **신규 테이블 2개** `v029_create_transition_rule_table`, `v030_create_transition_request_table`. `approval_request` ALTER 없음(기존 `issue_id`·`issue_key`·`transition_id`·`project_id` 사용) |
| manifest | `jira:workflowValidator` 1, `jira:issueContext` 1, `jira:issuePanel` 1, `jira:issueAction` 1, trigger 1, function 2, resource entry `issue` 1. **scope 추가 없음**(코멘트 POST 는 기존 `write:jira-work`) |
| 프론트 | **신규 엔트리 `issue`**(issueContext·issuePanel 공용, 3곳 수정). `modal` 엔트리에 intent `transitionPick`·`transitionRequest`, `projectSettings` 엔트리를 규칙 화면으로 교체, 상세·업무함·알림·증명서의 ISSUE_TRANSITION 분기 |
| i18n | **신규 네임스페이스** `transition.json`(kr/en — UI + 서버 문구 `server.*`). 기존 `error`·`notification`·`policy`·`project`·`cert` 에 키 추가 |
| 워크포스 연동 | 없음(Q61). `approval.issue` 계약 자리 유지 |
| AGENTS.md | asApp 허용 목록 4번 추가(§6.3) — validator 의 이슈 조회·changelog 재확인 |

---

## 2. 경계면 계약

권한 축 표기: `SELF` · `{issue:view}` = `{issue:'view', issueIdKey:'issueId'}` · `{project:admin}` = `{project:'admin', projectIdKey:'projectId'}`.
공통 에러(모든 resolver): `PERMISSION_DENIED`, `APP_ACCESS_DENIED`, `LICENSE_INACTIVE`, `STORAGE_NOT_READY`, `JIRA_API_FAILED`, `UNKNOWN_ERROR`. `{issue:view}` 는 `PERMISSION_ISSUE_VIEW_DENIED`, `{project:admin}` 은 `PERMISSION_PROJECT_ADMIN_REQUIRED`. 아래 "에러 code" 열은 그 외만.
시각은 전부 **epoch ms(number)**. 응답은 `{success:true, ...result}` — 아래 shape 는 `result` 부분이다.

> **왜 요청 생성이 `{issue:'edit'}` 가 아니라 `{issue:'view'}` 인가.** 전환 권한은 `TRANSITION_ISSUES` 이지 `EDIT_ISSUES` 가 아니다. edit 축을 쓰면 "전환은 되지만 편집은 안 되는" 사람이 요청을 못 한다. 실제 요청 자격은 서비스가 **asUser 로 받은 "지금 내가 실행할 수 있는 전환" 목록**(권한 + 워크플로 조건까지 반영)에 그 목적 상태가 있는지로 판정한다(`TRANSITION_NOT_AVAILABLE`). 새 권한 축을 만들지 않는다.

### 2.1 신규 resolver (`src/resolver/transition/TransitionController.js` → `registerTransitionController`)

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueTransitionApprovals` | {issue:view} | `{issueId}` | `IssueTransitionView` §2.3. **부작용**: 대기 요청의 출발 상태 ≠ 현재 상태면 그 자리에서 만료(§4.6), 승인 요청의 목적 상태 = 현재 상태면 소비 확정(source `LAZY`) | `INVALID_TARGET` | issue 엔트리(issueContext 요약·issuePanel 전체), modal intent `transitionPick`·`transitionRequest` |
| `createTransitionApproval` | {issue:view} + 서비스가 asUser 전환 목록으로 자격 확인 | `{issueId, toStatusId, transitionId?:string, requestMessage?:string≤500, expiresAt?:number, ccKeys?:string[]≤50}` — **`steps` 는 받지 않는다**(Q56, 규칙 Flow 고정) | `{requestId, status:'PENDING', currentStepOrder:1, toStatusId, usability:'PENDING'}` | `INVALID_TARGET`, `TRANSITION_NOT_AVAILABLE`, `TRANSITION_RULE_NOT_FOUND`, `TRANSITION_PROJECT_DISABLED`, `TRANSITION_ALREADY_APPROVED`, `ALREADY_OPEN`, `INVALID_APPROVER_CONFIGURATION`(Flow 없음·비활성·이 프로젝트에 적용 안 됨·그룹 비어 있음), `APPROVER_NOT_REGISTERED`, `APPROVER_NO_ACCESS` | modal: TransitionRequestForm |
| `listTransitionRules` | {project:admin} | `{projectId}` | `TransitionRulesView` §2.5 | `INVALID_TARGET` | projectSettings: TransitionRuleSettings |
| `saveTransitionRule` | {project:admin} + 서비스가 규칙의 project_id = payload projectId 확인 | `{projectId, ruleId?:string(없으면 생성), issueTypeId:string('*' = 전체 유형), toStatusId:string, flowId:string, enabled:boolean, rev?:number(수정 시 필수)}` | `{rule: TransitionRule}` | `INVALID_TARGET`(이 프로젝트의 유형·상태가 아님, 다른 프로젝트의 ruleId), `TRANSITION_RULE_CONFLICT`(같은 프로젝트·유형·목적 상태 규칙 있음, cause `{ruleId}`), `INVALID_APPROVER_CONFIGURATION`(Flow 없음·비활성·적용 프로젝트 아님), `CONCURRENT_MODIFICATION` | projectSettings: TransitionRuleFormModal |
| `deleteTransitionRule` | {project:admin} + 소속 확인 | `{projectId, ruleId, rev}` | `{ruleId, deleted:true, openCount:number}` — 열린 요청은 그대로 둔다(결재선은 요청 시 고정). 규칙이 없어지면 validator 는 통과 | `INVALID_TARGET`, `CONCURRENT_MODIFICATION` | projectSettings |

### 2.2 변경 resolver

| resolver | 권한 축 | 변경 | 소비 화면 |
|---|---|---|---|
| `getApprovalDetail` | SELF (무변경) | ISSUE_TRANSITION 요청이면 `target` = `TransitionTargetView`(§2.4). `approval` shape 무변경(`isStale=false`, `canResubmit=false`). `canRequest` = 최신 요청이 열려 있지 않고 지금 그 목적 상태로 가는 전환이 있음 | modal: ApprovalDetail 헤더 분기 |
| `getApprovalHistory` | SELF | 무변경(같은 `target_kind+target_key` = 같은 이슈·목적 상태의 회차들). `events[].eventType` 에 `CONSUMED` 가 나올 수 있다(`actorKey` = 실행자 또는 null, `reason` = 소비 출처 `TRIGGER`·`VALIDATOR_CHANGELOG`·`LAZY`) | modal |
| `getApprovalCertificate` | SELF | ISSUE_TRANSITION: `target` = TransitionTargetView, **신규 선택 필드** `transition:{fromStatusName, toStatusName, transitionName, consumedAt:number\|null, consumedBy:string\|null}`(TIMESHEET 의 `timesheet` 블록과 같은 자리) | modal: CertificateSheet |
| `decideApproval` | SELF | ISSUE_TRANSITION: 결정 직전 결재자 asUser 로 이슈 현재 상태 확인 → 출발 상태와 다르면 요청을 만료시키고 **`TRANSITION_STATE_CHANGED`**. 이슈를 못 읽으면(일시 오류) 확인을 건너뛰고 결정 진행(validator 가 최종 방어선) | modal: DecisionForm, inbox |
| `bulkApprove` | SELF | 건별 `results[].code` 에 `TRANSITION_STATE_CHANGED` 가 나올 수 있다 | inbox |
| `cancelApproval` | SELF | 무변경. 코멘트 알림 훅만 추가 | modal |
| `listInbox` | SELF | ISSUE_TRANSITION 행 **추가 필드** `transition:{fromStatusName, toStatusName}\|null`(다른 종류는 null). 가시성은 어댑터 `filterVisible` = 이슈 열람 `permissions/check` 일괄(불변식 7) | inbox: InboxTable·exportInboxExcel |
| `listNotifications` | SELF | 항목 추가 필드 `transition`(위와 같음). `EXPIRED`+`ISSUE_STATE_CHANGED` → templateKey `notification.template.transitionStateChanged`, `EXPIRED`+`ISSUE_DELETED` → `notification.template.transitionIssueDeleted`. ISSUE_TRANSITION 최종 승인(`APPROVED`)은 `notification.template.transitionApproved`("승인됨 — 이제 전환하세요") | inbox: NotificationPanel |
| `getApprovalSettings` / `saveApprovalSettings` | {admin} | 정책 키 2개 추가(§4.9) | settings: PolicySettings |
| `getProjectPolicy` / `saveProjectPolicy` | {admin} | `commentNotifyEnabled` 는 덮어쓰기 가능, `transitionApprovalEnabled` 는 전역 전용 | settings |
| `getStorageUsage` | {admin} | 테이블 목록에 신규 2개 | settings: DataSettings |
| `exportExpiredApprovals` | {admin} | `requests[]` 에 `transition:{fromStatusId, toStatusId, consumedAt}`(ISSUE_TRANSITION 행만) | settings |

### 2.3 `IssueTransitionView` (getIssueTransitionApprovals)

```js
{
  issue: { issueId, issueKey, title, projectId, projectKey, issueTypeId, statusId, statusName },
  // 전역 켬 && 프로젝트 사용 && 이 이슈 유형에 걸린 규칙이 하나 이상
  enforced: boolean,
  // enforced=false 의 이유(화면 문구 분기용). enforced=true 면 null
  notEnforcedReason: 'NO_RULE' | 'PROJECT_DISABLED' | 'GLOBAL_DISABLED' | null,
  // 목적 상태 단위 행. 규칙이 걸린 목적 상태 중 (a) 지금 사용자가 실행할 수 있는 전환이 있거나 (b) 열린·쓸 수 있는 요청이 있는 것
  targets: [{
    toStatusId, toStatusName, toStatusCategoryKey,        // 'new'|'indeterminate'|'done'
    transitions: [{ transitionId, name }],                // 지금 실행 가능한 전환(없으면 [])
    ruleId,
    flow: { flowId, name, defaultDeadlineDays:number|null,
            steps:[{stepOrder, stepName, requiredApprovals, principals:[{principalType, principalKey}]}] } | null,  // null = Flow 사라짐
    latest: TransitionRequestSummary | null,              // 이 목적 상태의 최신 요청
    usability: 'NONE'|'PENDING'|'USABLE'|'CONSUMED'|'STALE'|'REJECTED'|'CLOSED',  // §3.4
    canRequest: boolean,                                  // 실행 가능한 전환 있음 && latest 가 PENDING·USABLE 아님 && flow != null
  }],
  history: TransitionRequestSummary[],                    // 이 이슈의 최근 10건(목적 상태 무관, 최신순)
}

TransitionRequestSummary = {
  requestId, status,                                      // ApprovalStatus 그대로
  usability,                                              // 위 열거
  fromStatusId, fromStatusName, toStatusId, toStatusName,
  transitionId, transitionName,                           // 요청 시 고른 전환(표시용)
  requesterKey, createdAt, updatedAt,
  currentStepOrder, stepCount, currentStepName,
  armedAt: number|null, consumedAt: number|null, consumedBy: string|null,
}
```

### 2.4 `TransitionTargetView` (getApprovalDetail·증명서의 `target`)

ISSUE TargetView 의 키를 모두 가진다(기존 소비 코드 무변경) + `transition` 블록:
```js
{ kind:'ISSUE_TRANSITION', key:'<issueId>:<toStatusId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null,
  transition: { transitionId, transitionName, fromStatusId, fromStatusName, toStatusId, toStatusName,
                currentStatusId:string|null, currentStatusName:string|null,   // 조회 실패 시 null
                usability, armedAt, consumedAt, consumedBy } }
```

### 2.5 `TransitionRulesView` (listTransitionRules)

```js
{
  project: { projectId, projectKey, name, style:'classic'|'next-gen'|null },   // next-gen = team-managed
  globalEnabled: boolean, projectEnabled: boolean,
  rules: TransitionRule[],
  issueTypes: [{ id, name, iconUrl:string|null }],
  statuses: [{ id, name, categoryKey, issueTypeIds:string[] }],               // project/{id}/statuses 를 상태 기준으로 뒤집은 것
  flows: [{ flowId, name, enabled:true }],                                     // listAvailableFlows({projectId}) — 활성만
}
TransitionRule = { ruleId, projectId, issueTypeId, issueTypeName:string|null, toStatusId, toStatusName:string|null,
                   flowId, flowName:string|null, flowMissing:boolean, enabled, openCount:number,
                   updatedAt, updatedBy:string|null, rev }
```
`issueTypeName`·`toStatusName` 은 저장 스냅샷이 아니라 이번 응답의 Jira 목록으로 채운다(없어진 유형·상태면 null + 화면 경고).

### 2.6 신규 에러 코드 (`ErrorCodes` + `locales/{kr,en}/error.json` 동시)

| code | 의미 | cause |
|---|---|---|
| `TRANSITION_NOT_AVAILABLE` | 지금 그 목적 상태로 가는 전환을 실행할 수 없음(권한·조건·이미 그 상태) | — |
| `TRANSITION_RULE_NOT_FOUND` | 그 목적 상태에 승인 규칙이 없음(승인 없이 바로 전환하면 된다) | — |
| `TRANSITION_PROJECT_DISABLED` | 프로젝트에서 승인 사용 안 함(Q58) | — |
| `TRANSITION_ALREADY_APPROVED` | 쓸 수 있는 승인이 이미 있음 — 바로 전환하면 된다 | `{requestId}` |
| `TRANSITION_STATE_CHANGED` | 요청 이후 이슈 상태가 바뀌어 요청이 만료됨 | `{requestId, currentStatusId}` |
| `TRANSITION_RULE_CONFLICT` | 같은 (프로젝트·유형·목적 상태) 규칙이 이미 있음 | `{ruleId}` |

### 2.7 validator 함수 계약 (resolver 아님 — PermissionMap 대상 아님)

| 항목 | 값 |
|---|---|
| manifest | `jira:workflowValidator` key `transition-approval-validator`, `function: transitionValidator` |
| 핸들러 | `src/index.js` `export { validateTransition } from './trigger/transitionValidator'` → `TransitionValidatorService.validate(payload, context)` |
| 입력 | Forge 가 주는 payload 그대로. 기대 필드(전부 미검증 X1): `issue.{id\|key}`, `transition.{from.id, to.id, id?, name?}`, 실행자 `user.accountId`·`accountId`·`context.accountId` 중 하나(있으면), locale(있으면). `validatorPayload.parse` 가 변형을 흡수한다 |
| 출력 | `{ result: true }` 또는 `{ result: false, errorMessage: string }` — **절대 throw 하지 않는다**(최상위 try/catch → `CHECK_UNAVAILABLE` 거부) |
| 판정 코드(내부, 로그·테스트용) | `PASS_DISABLED`, `PASS_LICENSE`, `PASS_NOT_READY`, `PASS_NO_ISSUE`, `PASS_NO_RULE`, `PASS_PROJECT_DISABLED`, `PASS_APPROVED`, `REJECT_NO_REQUEST`, `REJECT_PENDING`, `REJECT_REJECTED`, `REJECT_CONSUMED`, `REJECT_STATE_MISMATCH`, `REJECT_UNAVAILABLE` |
| 문구 | `messages.validatorMessage(code, {locale, issueKey})` — `locales/{kr,en}/transition.json` 의 `server.validator.*` 를 서버가 import(§4.7). 사용자 문구를 만드는 **의도된 예외 지점 1**(다른 하나는 코멘트) |

### 2.8 프론트 호출 대응

| 프론트 호출 | 위치 | 쿼리키 / 무효화 |
|---|---|---|
| `getIssueTransitionApprovals({issueId})` | `features/transition/TransitionApprovalList.jsx` | `transitionKeys.issue(issueId)` |
| `createTransitionApproval({...})` | `features/transition/TransitionRequestForm.jsx` | 성공 시 `transitionKeys.issue(issueId)`·`approvalKeys.all` 무효화, 모달 `close({changed:true, issueId})` → issue 엔트리 `onClose` 가 같은 키 무효화 |
| `listTransitionRules({projectId})` | `features/transition/TransitionRuleSettings.jsx` | `transitionKeys.rules(projectId)` |
| `saveTransitionRule` / `deleteTransitionRule` | `TransitionRuleFormModal.jsx` / `TransitionRuleSettings.jsx` | `transitionKeys.rules(projectId)` 무효화 |
| `getApprovalDetail` 등 기존 | modal | 결정 후 `approvalKeys.all` + `transitionKeys.all` 무효화(모달 안). issue 엔트리는 모달 onClose 에서 무효화 |

---

## 3. 도메인 (순수)

### 3.1 `src/domain/approval/` 추가분 (기존 값·함수 무변경)

| 파일 | 추가 |
|---|---|
| `constants.js` | `TargetKind.ISSUE_TRANSITION = 'ISSUE_TRANSITION'`(주석의 "아직 넣지 않는다" 문장 갱신), `ExpiryReason.ISSUE_STATE_CHANGED`, `ExpiryReason.ISSUE_DELETED`, `EventType.CONSUMED`(감사 전용 — `derive` 는 APPROVE/REJECT 결정만 보므로 상태 무영향, `CHANGED_AFTER_APPROVAL` 과 같은 성격) |
| `scopeKey.js` | `SCOPE_PREFIX[ISSUE_TRANSITION]='TRANSITION'`, 빌더 `({issueId, toStatusId}) => NUMERIC_ID 둘 다 ? \`${issueId}:${toStatusId}\` : null`, 역파서 `transitionTargetFromKey(key)`(`':'` 하나, 양쪽 숫자). 예약 형식 주석을 `TRANSITION:{issueId}:{toStatusId}` 로 갱신 |
| `transitions.js` | `expireByTargetChange(state, {reason, now})` — `reason ∈ {ISSUE_STATE_CHANGED, ISSUE_DELETED}` 아니면 `{ok:false, reason:'bad reason'}`, PENDING 아니면 `{ok:false}`. 이벤트 id discriminator `${reason}:${contentVersion}`(= `expireByContentChange` 와 같은 규칙, 트리거·지연 판정·결정 경로가 겹쳐도 1건) |

테스트(`src/domain/approval/__test__/transitions.test.js` 추가): ISSUE_TRANSITION 키 왕복·형식 불량 INVALID_TARGET·길이, `expireByTargetChange` PENDING→EXPIRED·종료 상태 무시·나쁜 사유·같은 입력 같은 이벤트 id. **기존 테스트 무변경 통과.**

### 3.2 규칙 키 — 목적 상태 id 로 확정 (`rule.js`)

| 기준 | 전환 id | **목적 상태 id (채택)** |
|---|---|---|
| validator 입력에 있나 | 미검증(X1) — 문서 예시에 `transition.from/to` 만 보인 기억이 있고 전환 id 는 불확실 | `transition.to.id` 가 가장 확실한 필드(X1 에서 함께 확인) |
| 워크플로 교체·편집 | 워크플로 스킴을 바꾸거나 전환을 지우고 다시 만들면 id 가 바뀐다 → 규칙이 **조용히 매칭 실패 → 통과**(fail-open) | 상태는 워크플로 밖의 엔티티라 교체 후에도 같은 id(상태 매핑 마이그레이션 유지). 규칙 유지 |
| 새 전환 추가 | 새 "→ Done" 전환은 규칙 밖(우회로) | 같은 목적 상태면 자동으로 규칙 안(단, validator 부착은 관리자 몫 — 수용 기준 문장) |
| 표현력 | 같은 목적 상태로 가는 전환별 차등 가능 | 불가(Q62 로 확인) |
| team-managed | 전환 id 는 프로젝트 워크플로마다 | 상태 id 는 프로젝트 범위 — 규칙이 프로젝트 단위라 문제없음 |

company-managed 는 (프로젝트, 이슈 유형) → 워크플로가 하나로 정해지고 상태는 사이트 공용 id, team-managed 는 상태·유형 id 가 프로젝트 범위다. 두 경우 모두 규칙 행이 `project_id` 를 갖고 저장 시 `project/{id}/statuses` 로 그 프로젝트의 유형·상태인지 확인하므로 같은 코드로 처리된다. team-managed 에서 Forge validator 를 붙일 수 있는지는 X4.

```js
export const ANY_ISSUE_TYPE = '*';
/** 저장 입력 정규화. 숫자 id 또는 '*'(유형만). 틀리면 null */
export const normalizeRuleKey = ({ projectId, issueTypeId, toStatusId }) => ({...}|null);
/** 정확한 유형 규칙이 '*' 보다 우선. enabled 만. 없으면 null */
export const matchRule = (rules, { projectId, issueTypeId, toStatusId }) => rule|null;
```
테스트: 정확 유형 우선, `*` 대체, 다른 프로젝트·꺼진 규칙 무시, 상태 불일치 null, 정규화 불량.

### 3.3 `validatorPayload.js` — 입력 흡수 (X1 대비)

```js
/** @returns {{issueId:?string, issueKey:?string, fromStatusId:?string, toStatusId:?string,
 *            transitionId:?string, accountId:?string, locale:?string}} 모르는 필드는 null */
export const parseValidatorPayload = (payload) => ...;
```
후보 경로: `issue.id`/`issue.key`, `transition.from.id`/`transition.to.id`/`transition.id`/`transition.transitionId`, `user.accountId`/`accountId`/`context.accountId`/`atlassianId`, `user.locale`/`context.locale`. 숫자 id 만 받는다(키 형식은 `issueKey` 로). 테스트: 문서 예시 형태·변형 형태·빈 입력.

### 3.4 `usability.js` — 승인의 쓸모(파생, 저장하지 않음)

```js
/** @param {{status, consumedAt:?number, fromStatusId, toStatusId, currentStatusId:?string}} */
export const transitionUsability = (input) =>
  'PENDING'   // status PENDING
| 'CONSUMED'  // APPROVED && consumedAt
| 'USABLE'    // APPROVED && !consumedAt && (currentStatusId 모름 || currentStatusId === fromStatusId)
| 'STALE'     // APPROVED && !consumedAt && currentStatusId !== fromStatusId   (목적 상태와 같으면 호출부가 먼저 소비 확정)
| 'REJECTED'  // REJECTED
| 'CLOSED';   // EXPIRED·CANCELLED
export const isUsable = (u) => u === 'USABLE';
```
`NONE` 은 요청이 없을 때 서비스가 붙인다. 테스트: 6가지 + currentStatus null.

### 3.5 `judge.js` — validator 판정 표 (순수)

```js
/**
 * @param {{
 *   enabled:boolean, licensed:boolean, tablesReady:boolean,
 *   issue:{issueId, projectId, issueTypeId, currentStatusId}|null,   // null = 이슈 정보 없음(생성 전환 등)
 *   from:?string, to:?string,                                        // payload 값, from 없으면 currentStatusId
 *   rule:object|null, projectEnabled:boolean,
 *   candidates: [{requestId, status, fromStatusId, toStatusId, armedAt, consumedAt, createdAt}]  // 이 이슈·목적 상태, 최신순
 * }} input
 * @returns {{decision:'PASS'|'PASS_ARM'|'NEED_CHANGELOG'|'REJECT', code, requestId:?string}}
 */
export const judgeTransition = (input) => ...;
/** NEED_CHANGELOG 뒤: 무장 이후 목적 상태로의 변경 기록이 있었나 */
export const judgeAfterChangelog = ({ requestId, sawTransitionToTarget }) =>
  sawTransitionToTarget ? { decision:'CONSUME_AND_REJECT', code:'REJECT_CONSUMED', requestId }
                        : { decision:'PASS_ARM', code:'PASS_APPROVED', requestId };
```

판정 순서(위에서 처음 맞는 것):

| # | 조건 | 결과 |
|---|---|---|
| 1 | `!enabled`(전역 해제) | PASS `PASS_DISABLED` |
| 2 | `!licensed` | PASS `PASS_LICENSE` (Q53) |
| 3 | `!tablesReady` | PASS `PASS_NOT_READY` — 테이블이 없으면 규칙도 있을 수 없다 |
| 4 | `issue === null` 또는 `to` 없음 | PASS `PASS_NO_ISSUE` — 생성(Create) 전환에는 요청할 이슈가 없다(X20) |
| 5 | `rule === null` | PASS `PASS_NO_RULE` |
| 6 | `!projectEnabled` | PASS `PASS_PROJECT_DISABLED` (Q58) |
| 7 | 후보 중 `APPROVED && !consumedAt && fromStatusId === from` 가 있음 → 그중 최신 c | `c.armedAt` 없으면 **PASS_ARM** `PASS_APPROVED` / 있으면 **NEED_CHANGELOG** |
| 8 | 최신 후보가 PENDING | REJECT `REJECT_PENDING` |
| 9 | 최신 후보가 REJECTED | REJECT `REJECT_REJECTED` |
| 10 | 최신 후보가 APPROVED && consumedAt | REJECT `REJECT_CONSUMED` |
| 11 | 최신 후보가 APPROVED && 출발 상태 불일치 | REJECT `REJECT_STATE_MISMATCH` |
| 12 | 그 외(후보 없음·EXPIRED·CANCELLED) | REJECT `REJECT_NO_REQUEST` |
| — | (서비스) DB 오류·시간 초과·이슈 조회 실패·changelog 실패 | REJECT `REJECT_UNAVAILABLE` (fail-closed) |

테스트(요구 완료 기준의 판정 표): 규칙 없음 / 승인됨+일치(무장 없음·있음+changelog 없음·있음) / 승인됨+상태 불일치 / 대기 / 반려 / 소비됨 / 만료·회수 / 전역 해제 / 라이선스 / 테이블 없음 / 이슈 없음 / 프로젝트 꺼짐. DB 오류는 서비스 테스트(§4.5).

### 3.6 `statusChange.js`

```js
/** 이슈 이벤트 changelog 에서 상태 변경 한 건. 없으면 null. items[].fieldId==='status' 또는 field==='status' */
export const statusChangeOf = (changelog) => ({ fromId, toId } | null);
/** changelog 이력(페이지 응답 values[]) 중 since 이후 to 로 간 변경이 있나 — validator changelog 재확인용 */
export const sawStatusChangeTo = (histories, { toStatusId, sinceMs }) => boolean;
```

### 3.7 `messages.js` — 서버 문구 (예외 지점)

```js
/** @param dictionaries {{kr:object, en:object}} — transition.json 의 server 블록. 문구는 import 한 JSON 이 단일 출처 */
export const validatorMessage = (code, { locale, issueKey, dictionaries }) => string;
// locale 이 'ko'/'en' 으로 시작하면 한 줄, 모르면 `${kr}\n${en}` 두 줄(Q60). {issueKey} 자리표시 치환(tFormat 관례 `{name}`)
export const commentLabels = (locale, dictionaries) => ({ requested, myTurn, approved, rejected, cancelled, transitionLine, open });
```

### 3.8 `commentAdf.js` — Jira 코멘트 ADF (Confluence `CommentNotifier` 의 순수부 이식)

```js
export const COMMENT_TYPE = { REQUESTED:'requested', MY_TURN:'myTurn', APPROVED:'approved', REJECTED:'rejected', CANCELLED:'cancelled' };
export const commentTypeOf = ({ kind, status }) => ...;      // Confluence 규칙 그대로(DUE_SOON·REMINDER 제외)
export const selectCommentRecipients = (input) => string[];   // Confluence 규칙 그대로(회수는 행위자 제외)
export const buildCommentAdf = ({ recipients, commentType, labels, fromStatusName, toStatusName, detailUrl }) => adf;
```
문서 링크는 이슈 자신이라 넣지 않는다 — "OPS-12: In Review → Done 승인 요청" 형태 + 업무함 링크(`detailUrl`, siteUrl 이 있을 때만). 테스트: Confluence 판 테스트 케이스를 대상만 바꿔 이식.

---

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/transition/{rule,usability,judge,validatorPayload,statusChange,messages,commentAdf}.js   (+ __test__)
src/resolver/transition/
  TransitionController.js        registerTransitionController — 5개 guardedDefine
  TransitionService.js           getIssueTransitionApprovals · createTransitionApproval · 규칙 CRUD
  TransitionRuleRepository.js    transition_rule CRUD(CAS rev) · findByStatus · findForProject
  TransitionRepository.js        transition_request 부속 행 · 후보 조회 · arm/consume 조건부 UPDATE · 소비 이벤트
  IssueStateReader.js            asUser 이슈+전환 1콜 · project/{id} · project/{id}/statuses · asApp 이슈·changelog(사유 고정)
  TransitionValidatorService.js  validator 본체(시간 예산·fail-closed)
  TransitionChangeService.js     이슈 이벤트 처리(소비 확정·대기 만료) — 트리거·지연 판정 공용
  TransitionCommentNotifier.js   asUser 코멘트(best-effort)
src/resolver/approval/target/TransitionTargetAdapter.js
src/trigger/transitionValidator.js   얇은 어댑터: validateTransition = (payload, context) => service.validate(...)
src/trigger/onIssueChanged.js        얇은 어댑터: try { changeService.handleEvent(event) } catch { log } — 절대 throw 안 함
```

### 4.2 TransitionTargetAdapter (IssueTargetAdapter 와 같은 인터페이스)

| 메서드 | 동작 |
|---|---|
| `kind` | `ISSUE_TRANSITION` |
| `parse(payload)` | `{issueId, toStatusId}` 숫자 검증 → target. 실패 INVALID_TARGET |
| `targetOf(state)` | `transitionTargetFromKey(state.targetKey)` |
| `describe(target, {state}={})` | asUser 이슈(summary·project·status) 1콜 + 부속 행(state 있으면 그 requestId, 없으면 그 대상 최신) → 스냅샷 `{title, issueId, issueKey, projectId, projectKey, projectName, revision:null, transition:{...§2.4}}`. 이슈를 못 보면 INVALID_TARGET(IssueTargetAdapter 와 같은 규칙). **2번째 인자는 신규** — ISSUE·TIMESHEET 는 무시한다 |
| `canView(target)` | `getIssueAccess(issueId).view` (invocation 캐시) |
| `canRequest(target, principal)` | 이슈+전환 1콜(invocation memo `issueTransitions:<id>`)에서 `to.id === toStatusId` 전환 존재 |
| `userCanView(target, accountId)` | `userCanViewIssue` (approverAccessCheck) |
| `filterVisible(keys)` | 키 → issueId 묶음 → `filterVisibleIssues`(permissions/check 일괄, fail-close) → 보이는 키만. meta = 이슈 스냅샷 + 부속 행 `SELECT issue_id, to_status_id, from_status_name, to_status_name … WHERE (issue_id, to_status_id) 최신` 1문장으로 `transition:{fromStatusName,toStatusName}` |
| `fingerprint()` | null |
| `columnsOf(target, snapshot)` | `{target_key, project_id, issue_id, issue_key, transition_id: snapshot.transition.transitionId, subject_account:null, period_key:null, target_title: snapshot.title, content_version:0, content_hash:null}` |
| `snapshotOf(state)` / `viewOf(...)` | ISSUE 와 같은 키 + `transition`(스냅샷 없으면 null) |
| `certificateExtra(state)` | 부속 행 → `{fromStatusName, toStatusName, transitionName, consumedAt, consumedBy}` |
| `certificateKey` | `'transition'` (CertificateService 가 `adapter.certificateKey ?? 'timesheet'` 자리에 싣는다 — 한 줄 일반화) |
| `beforeDecide(state, {now})` **신규 선택 훅** | asUser 이슈 상태 1콜 → `currentStatusId !== from_status_id` 면 `{expireReason:'ISSUE_STATE_CHANGED', currentStatusId}`, 조회 실패면 `null`(건너뜀) |
| `notifyExternal(input)` **신규 선택 훅** | `TransitionCommentNotifier.notify(input)` — 정책 `commentNotifyEnabled` 확인 포함 |

`TargetRegistry` 에 `ISSUE_TRANSITION: transitionTargetAdapter` 추가.

### 4.3 ApprovalService 변경 (엔진 훅 3개 — 상태 머신 무변경)

1. **describe 에 state 전달**: `getApprovalDetail` 의 `adapter.describe(target)` → `adapter.describe(target, { state })`. `getIssueApproval` 무변경.
2. **`beforeDecide` 훅**: `decideApproval` 에서 `assertTargetVisible` 뒤, 마감 검사 뒤, PIN 앞:
   ```js
   const verdict = await adapter.beforeDecide?.(state, { now }).catch(() => null);
   if (verdict?.expireReason) {
     await this.expireForTarget(state, verdict.expireReason);   // repository.closeBySystem(expireByTargetChange) + appNotifier(background)
     throw new LogicalError(ErrorCodes.TRANSITION_STATE_CHANGED, ..., { requestId, currentStatusId });
   }
   ```
   PIN 앞에 두는 이유: 만료될 요청에 PIN 실패 횟수를 쌓지 않는다. `bulkApprove` 는 `decideApproval` 을 거치므로 자동 적용(건당 이슈 1콜 — §9.2).
3. **`notifyExternal` 훅**: `createForTarget` 성공 뒤(REQUESTED), `decideApproval` 앱 알림 뒤(APPROVED·REJECTED, 최종 여부 = `result.status`; `bulkApprove` 에서 온 호출은 생략 — §9.2), `cancelApproval` 뒤(CANCELLED). `try { await adapter.notifyExternal?.({...}) } catch {}` — 결정 응답을 실패로 뒤집지 않는다. 입력은 Confluence 판 `notify(input)` 과 같은 필드(`kind, request, event, approvers, requesterAccountId, actorAccountId, ccAccountIds, siteUrl`) + `target`.

영향받는 기존 테스트: 없음(훅이 없는 어댑터는 `?.` 로 건너뛴다). 신규: 훅 호출·만료 분기·코멘트 실패 무시 테스트를 `ApprovalService` 테스트에 추가.

### 4.4 요청 생성 (`TransitionService.createTransitionApproval`)

```
1. parse {issueId, toStatusId}; transitionId 는 선택(표시용)
2. IssueStateReader.issueWithTransitions(issueId)  — asUser GET issue/{id}?fields=summary,status,project,issuetype&expand=transitions  (1콜)
   ├ toStatusId === 현재 상태 또는 to.id===toStatusId 인 전환 없음 → TRANSITION_NOT_AVAILABLE
   └ transitionId 를 줬으면 그 전환의 to.id 가 toStatusId 인지 확인(아니면 INVALID_TARGET), 안 줬으면 첫 번째 전환
3. 정책: transitionApprovalEnabled=false → TRANSITION_RULE_NOT_FOUND (강제가 꺼졌으니 승인 불필요)
   프로젝트 사용 여부(projectScopeConfigured && getProjectStates) false → TRANSITION_PROJECT_DISABLED
4. rule = matchRule(ruleRepo.findForProject(projectId), {projectId, issueTypeId, toStatusId}) — 없으면 TRANSITION_RULE_NOT_FOUND
5. 쓸 수 있는 승인 확인: transitionRepo.findCandidates(issueId, toStatusId) 중 usability USABLE → TRANSITION_ALREADY_APPROVED {requestId}
6. Flow → 결재선: flowService.getFlowForRequest(rule.flowId, projectId) (활성·적용 프로젝트 확인, 아니면 INVALID_APPROVER_CONFIGURATION)
   → principals 를 rawSteps({approverKeys, requiredApprovals, stepName})로 → approvalService.expandRequestedSteps(rawSteps)
7. requestId = uuid(); transitionRepo.insertDraft({requestId, issueId, projectId, issueTypeId, ruleId, transitionId, transitionName,
      fromStatusId:현재, fromStatusName, toStatusId, toStatusName, now})      ← 부속 행 먼저(타임시트와 같은 순서)
8. approvalService.createForTarget(request, {adapter, target, requestId, resolvedSteps, snapshot, expiresAt: payload 또는 flow.defaultDeadlineDays})
   — 실패(ALREADY_OPEN 등) 시 transitionRepo.deleteOrphan(requestId) best-effort 후 재throw
   — 고아 부속 행은 모든 조회가 approval_request 와 JOIN(commit_state='LIVE')하므로 보이지 않는다
9. 응답 {requestId, status, currentStepOrder, toStatusId, usability:'PENDING'}
```
결재선 자격 검사(`assertApproversAllowed`)는 그대로 돈다 — 명부·승인자 이슈 열람(정책 `approverAccessCheck`). `skipRegistryCheck` 쓰지 않는다(Flow 는 관리자가 만들었지만 명부 정책은 존중).

### 4.5 validator (`TransitionValidatorService.validate`)

**시간 예산**: 내부 마감 **4초**(`Promise.race`) — 넘으면 `REJECT_UNAVAILABLE`. 목표 p95 1초. 실제 플랫폼 제한은 미검증(X3). 경로별 비용:

| 경로 | Jira | SQL | KVS |
|---|---|---|---|
| 목적 상태에 규칙 없음(대부분) | 0 | 1 (`transition_rule WHERE to_status_id=? AND enabled=1 LIMIT 500`) | 2 (`transitionApprovalEnabled`, 라이선스 캐시) |
| 규칙 있음 | 0~1 (payload 에 프로젝트·유형이 없으면 asApp 이슈 1콜, X1) | +2 (프로젝트 사용 여부, 후보 `LIMIT 5`) | +1 (`projectScopeConfigured`) |
| 무장된 승인 재시도 | +1 (asApp changelog) | +1 (arm/consume) | |

```
validate(payload, context):
  try {
    p = parseValidatorPayload(payload)
    enabled = policy.transitionApprovalEnabled (KVS 실패 → true: 모르면 강제)
    licensed = 라이선스가 **확실히 비활성**일 때만 false. 조회 실패·판정 불가는 true(강제 쪽)
    tablesReady = isTableReady('transition_rule') && isTableReady('transition_request')   ※ ensureMigratedOnce 를 부르지 않는다(검증 경로에서 DDL 금지)
    rules = ruleRepo.findByStatus(p.toStatusId)           ── 없으면 PASS_NO_RULE (Jira 호출 없이 종료)
    issue = p 에 issueId·projectId·issueTypeId 다 있으면 그대로, 아니면 IssueStateReader.issueForValidator(p.issueId ?? p.issueKey)   ← asApp 사유 'transition-validate'
    rule = matchRule(rules, issue + to)
    projectEnabled = 프로젝트 사용 여부
    candidates = transitionRepo.findCandidates(issue.issueId, p.toStatusId, 5)
    v = judgeTransition({...})
    PASS_ARM        → transitionRepo.arm(requestId, now)  (실패해도 통과 — 무장은 뒤 판정의 보조 기록)
    NEED_CHANGELOG  → histories = IssueStateReader.statusHistorySince(issueId, armedAt)   ← asApp 사유 'transition-changelog'
                      v = judgeAfterChangelog({requestId, sawTransitionToTarget: sawStatusChangeTo(histories, ...)})
                      CONSUME_AND_REJECT → changeService.consume(requestId, {source:'VALIDATOR_CHANGELOG'}) 후 REJECT_CONSUMED
    return v 가 PASS* ? {result:true} : {result:false, errorMessage: validatorMessage(v.code, {locale:p.locale, issueKey})}
  } catch { return {result:false, errorMessage: validatorMessage('REJECT_UNAVAILABLE', ...)} }
```

**왜 validator 에서 바로 소비하지 않고 "무장"만 하나.** Jira 는 전환의 validator 를 모두 평가하고 하나라도 거부하면 전환을 취소한다. 우리 validator 가 통과 즉시 소비하면, 뒤의 다른 validator(예: 해결 필드 필수)가 거부했을 때 **전환은 안 일어났는데 승인은 써 버린** 상태가 된다. 그래서:
- 통과 시 `armed_at` 만 기록(`UPDATE transition_request SET armed_at=?, armed_count=armed_count+1, rev=rev+1 WHERE request_id=UUID_TO_BIN(?) AND consumed_at IS NULL`).
- **소비 확정은 실제 상태 변경을 관찰했을 때**(트리거 §4.6, 조회 시 지연 판정, 위 changelog 재확인).
- 무장됐는데 소비 확정이 없는 승인으로 다시 전환하면, 앞 시도가 취소된 것인지(→ 통과) 트리거를 놓친 채 갔다 돌아온 것인지(→ 소비됨) changelog 로 가린다. 이 경로만 Jira 를 읽는다.

**fail-closed 근거**(Q53): 이 validator 의 존재 이유가 강제다. fail-open 이면 DB 장애·시간 초과가 곧 무단 전환 경로다. 차단 범위는 이미 "규칙이 있는 목적 상태로 가는, validator 를 붙인 전환" 으로 좁다. 해제 수단 두 개(전역 정책 토글, Jira 워크플로에서 validator 제거)가 앱 장애와 무관하게 동작한다. 예외 셋은 강제할 근거 자체가 없어서 통과: 전역 해제, **라이선스 확실히 비활성**(요청·결정 resolver 가 라이선스 가드로 막혀 승인을 받을 길이 없다 → 교착), 테이블 미준비(규칙이 존재할 수 없음).

**판정은 우리 DB 만**(불변식 9·10): 이슈 프로퍼티를 읽지 않는다. Jira 에서 읽는 것은 이슈의 프로젝트·유형·현재 상태(payload 에 없을 때)와 changelog 뿐이고 둘 다 Jira 가 원천인 사실이다.

### 4.6 변경 감지 — 트리거 + 지연 판정 (스윕 없음)

| 경로 | 언제 | 하는 일 |
|---|---|---|
| **트리거** `onIssueChanged` (`avi:jira:updated:issue`) | 모든 이슈 갱신 | `statusChangeOf(event.changelog)` 없으면 **SQL 없이 즉시 반환**. 있으면 `changeService.onStatusChanged(issueId, {fromId, toId, actorAccountId})` |
| 트리거 (`avi:jira:deleted:issue`) | 이슈 삭제 | 그 이슈의 PENDING 요청 → `expireByTargetChange(ISSUE_DELETED)` |
| 지연 판정 — 조회 | `getIssueTransitionApprovals`(asUser 로 현재 상태를 이미 읽음) | 같은 `onStatusObserved(issueId, currentStatusId)` |
| 지연 판정 — 결정 | `beforeDecide` 훅(§4.3) | 출발 상태 불일치면 만료 + `TRANSITION_STATE_CHANGED` |
| 최종 방어 | validator | 출발 상태 불일치 승인은 거부(`REJECT_STATE_MISMATCH`) |

`TransitionChangeService.onStatusChanged(issueId, {fromId, toId, actorAccountId, source})`:
```
rows = transitionRepo.findLive(issueId)   -- JOIN approval_request: status IN ('PENDING','APPROVED') AND tr.consumed_at IS NULL AND commit_state='LIVE'
for row:
  APPROVED && row.to_status_id === toId && (fromId 모름 || row.from_status_id === fromId)  → consume(row, {by: actorAccountId, source})
  PENDING  && row.from_status_id !== toId                                                 → approvalRepository.closeBySystem(expireByTargetChange(ISSUE_STATE_CHANGED))
                                                                                             → closed 면 appNotifier(EXPIRED, background:true) — 요청자에게
```
`consume(row, {by, source, now})`:
```sql
UPDATE transition_request SET consumed_at=?, consumed_by=?, consume_source=?, rev = rev + 1
 WHERE request_id=UUID_TO_BIN(?) AND consumed_at IS NULL           -- 조건부(먼저 온 쪽만 1행)
```
`rowsAffected===1` 일 때만 감사 이벤트 `CONSUMED` 추가(`deterministicEventId({requestId, eventType:'CONSUMED', actorKey:null, discriminator:'CONSUMED'})` — 트리거·지연 판정·changelog 경로가 겹쳐도 1건, 불변식 6). `approval_request` 는 건드리지 않는다(상태 APPROVED 유지 — 불변식 2).

**트리거 규칙**(AGENTS.md): 최상위 try/catch, 실패는 로그만 — 다음 조회·결정·validator 가 같은 판정을 다시 한다(지연 판정이 리컨실 역할). 라이선스로 막지 않고 알림 생성만 `shouldEmitNotifications` 가 막는다. `ensureMigratedOnce` 대신 `isTableReady` 프로브(없으면 반환).

**왜 스윕을 두지 않나.** 놓친 이벤트가 남기는 해는 (a) 대기 요청이 낡은 채 남음 → 결재자가 결정하는 순간 `beforeDecide` 가 만료시킨다, (b) 소비 확정 누락 → 같은 출발 상태로 돌아와 다시 전환할 때 validator changelog 재확인이 잡는다. 둘 다 해당 요청을 누군가 건드리는 순간 정정된다. 스윕을 두면 모든 열린 요청의 이슈를 asApp 으로 주기 조회해야 해 asApp 경로만 늘어난다.

### 4.7 서버 문구 사전

`src/domain/transition/messages.js` 는 사전을 인자로 받고(순수), `TransitionValidatorService`·`TransitionCommentNotifier` 가 `import kr from '../../../locales/kr/transition.json'`, `en` 을 넘긴다(Confluence 판 CommentNotifier 와 같은 import — Forge 번들 실측됨). 서버 문구 키는 `server.validator.*`·`server.comment.*` 아래에만 둔다 — 화면용 키와 섞지 않아 "서버가 문구를 만드는 곳"이 검색 한 번으로 드러난다.

### 4.8 Jira 코멘트 @멘션 (`TransitionCommentNotifier`) — asUser 만

| 이벤트 | 작성자(asUser 주체) | 멘션 대상 | 비고 |
|---|---|---|---|
| REQUESTED | 요청자 | 1단계 결재자 | |
| APPROVED(중간) | 결재자 | 다음 단계 결재자 | |
| APPROVED(최종) | 결재자 | 요청자 + 참조 | "승인됨 — 이제 전환하세요" |
| REJECTED | 결재자 | 요청자 | 사유는 싣지 않는다(코멘트는 이슈 열람자 전원에게 보인다) |
| CANCELLED | 회수자 | 대기 중 현재 단계 결재자(+관리자가 회수했으면 요청자) | Confluence 규칙 |
| EXPIRED·CONSUMED·독촉 | — | — | 사용자 컨텍스트 없음(배경) → 쓰지 않는다 |

- **asUser 를 고른 이유**: 결정이 일어나는 resolver 호출 안이라 행위자 컨텍스트가 있다. 코멘트 작성자가 실제 행위자로 남아 이력이 자연스럽고, asApp 허용 목록을 늘리지 않는다. 행위자에게 "Add comments" 권한이 없으면 403 → 조용히 건너뜀(앱 내 알림은 이미 나갔다). 결재자가 코멘트 권한이 없는 구성이 흔하면 최종 승인 멘션이 빠지는 한계를 **수용**한다(X13 결과 보고 재검토).
- 문구 언어: 작성자(행위자) 언어 — asUser `GET /rest/api/3/myself` 의 `locale`(invocation memo, 실패 시 'en'). 코멘트는 Jira 가 보관해 렌더 시점 번역이 불가능하므로 서버가 문구를 확정하는 **의도된 예외 지점 2**.
- 정책 `commentNotifyEnabled`(프로젝트 덮어쓰기 가능, 기본 true — Q55). `notificationsEnabled=false` 면 코멘트도 쓰지 않는다.
- 호출: `POST /rest/api/3/issue/{issueId}/comment` body `{body: adf}` — `write:jira-work`(이미 있음). 시간 상한 3초(`Promise.race`), 실패는 `[COMMENT]` 로그(본문 없이 상태 코드만).
- TIMESHEET·ISSUE 대상에는 훅이 없다(코멘트를 남길 이슈가 없거나 Q1 로 닫힘).

### 4.9 정책 키 (`SettingsRepository` 기본값·KVS 키 맵·`SettingsService` 검증 **세 곳 동시** — 계약 테스트가 대조)

| 키 | 기본값 | 범위 | 검증 |
|---|---|---|---|
| `commentNotifyEnabled` | `true` | 프로젝트 덮어쓰기 가능 | boolean |
| `transitionApprovalEnabled` | `true` | **전역 전용**(`GLOBAL_ONLY_KEYS`) — 비상 해제 | boolean |

### 4.10 규칙 CRUD (`TransitionService` + `TransitionRuleRepository`)

- 저장 전 `IssueStateReader.projectMeta(projectId)`(asUser `project/{id}` + `project/{id}/statuses`, 병렬 2콜) → `issueTypeId`(또는 `*`)·`toStatusId` 가 그 프로젝트 것인지, `*` 가 아니면 그 유형의 상태 목록에 목적 상태가 있는지. 아니면 INVALID_TARGET.
- Flow 확인: 활성 + `listAvailableFlows({projectId})` 에 포함. 아니면 INVALID_APPROVER_CONFIGURATION.
- 생성: `INSERT` — UNIQUE `uq_transition_rule` 충돌 → `TRANSITION_RULE_CONFLICT`(cause 에 기존 ruleId, 재조회 1회).
- 수정: `UPDATE … SET issue_type_id=?, to_status_id=?, flow_id=?, enabled=?, to_status_name=?, issue_type_name=?, updated_at=?, updated_by=?, rev = rev + 1 WHERE rule_id=UUID_TO_BIN(?) AND project_id=? AND rev=?` — 0행이면 존재 확인 후 INVALID_TARGET 또는 CONCURRENT_MODIFICATION. `project_id` 를 WHERE 에 넣어 다른 프로젝트 규칙을 못 고친다(불변식 7).
- 삭제: `DELETE … WHERE rule_id=? AND project_id=? AND rev=?`. 행 삭제는 승인자 행이 아니라 설정이므로 불변식 5 와 무관.
- 설정 이력: `SettingsAuditRepository` 에 `transitionRule.save|delete` + `{projectId, ruleId, issueTypeId, toStatusId, flowId, enabled}`(사용자 텍스트 없음).
- `openCount`: `SELECT to_status_id, COUNT(*) … FROM transition_request tr JOIN approval_request r … WHERE tr.project_id=? AND r.is_open=1 GROUP BY …` 1문장.

### 4.11 그 밖의 서비스 변경

| 파일 | 변경 |
|---|---|
| `CertificateService` | `...(extra !== undefined ? { [adapter.certificateKey ?? 'timesheet']: extra } : {})` |
| `NotificationService.notificationTemplate` | `({kind, reason, targetKind})` — `EXPIRED`+`ISSUE_STATE_CHANGED`/`ISSUE_DELETED` 2종, `APPROVED`+`ISSUE_TRANSITION` → `transitionApproved`. 목록 보강에 `transition` 필드(어댑터 meta) |
| `InboxService.refreshSnapshots` | ISSUE_TRANSITION 행 `transition: meta.transition ?? null`. 이슈 키·제목·프로젝트 수렴은 ISSUE 와 같다 |
| `RetentionRepository.CHILD_TABLES` | `transition_request` 추가(`transition_rule` 은 설정이라 보관 정리 대상 아님) |
| `StorageService` | 테이블 목록에 2개 |
| `PermissionMap` | 5개(§2.1) — 주석에 "edit 축이 아닌 이유" 한 줄 |
| `src/index.js` | `CONTROLLER_REGISTRARS` 에 `registerTransitionController`, `export { validateTransition }`, `export { onIssueChanged }` |
| `FlowService` | `getFlowForRequest(flowId, projectId)` — 활성·적용 프로젝트 확인 후 steps 반환(없으면 null). 기존 메서드 무변경 |
| `AGENTS.md` | asApp 허용 4번(§6.3) |

### 4.12 CAS·불변식 점검

| 불변식 | 지점 |
|---|---|
| 1 열린 요청 하나 | `openDedupeKey({kind:ISSUE_TRANSITION, issueId, toStatusId})` → 기존 `dedupe_key` UNIQUE. "쓸 수 있는 승인 이미 있음"은 서비스 검사(경합해도 둘 다 유효한 승인일 뿐 — 해 없음) |
| 2 결정이 진실 | 소비는 부속 행 사실 + 감사 이벤트. `approval_request.status` 는 APPROVED 유지, 새 상태 없음 |
| 3 순수 | `src/domain/transition/**` 은 `now`·사전·후보를 인자로 받는다. `Date.now()`·import 한 JSON 직접 참조 없음 |
| 4 CAS rev | 규칙 UPDATE, 부속 행 arm/consume UPDATE 모두 `rev = rev + 1` |
| 5 조건부 UPDATE | 결정은 엔진 그대로. 소비는 `consumed_at IS NULL` 조건부 |
| 6 결정적 이벤트 id | `CONSUMED` discriminator 고정, 만료는 `${reason}:${contentVersion}` |
| 7 범위 재필터 | 업무함·알림: 어댑터 `filterVisible`(permissions/check 일괄). 규칙: WHERE `project_id`. 상세·이력·증명서·결정: `assertTargetVisible` → `canView` |
| 8 asUser 기본 | resolver 전부 asUser. asApp 은 validator 2곳만(§6.3), 결과를 사용자에게 돌려주지 않는다(문구에 이슈 내용 없음 — 이슈 키만, 그것도 payload 에서 온 값) |
| 9·10 | validator 는 함수형, 판정은 DB. 이슈 프로퍼티 읽기 없음 |

---

## 5. 스키마·마이그레이션

### 5.1 enqueue 추가 (v028 뒤에만, 기존 이름 무변경)

```js
.enqueue('v029_create_transition_rule_table', CREATE_TRANSITION_RULE_TABLE)
.enqueue('v030_create_transition_request_table', CREATE_TRANSITION_REQUEST_TABLE)
```
DDL 파일 `src/rdb/schema/ddl/transition.sql.js`, `ddl/index.js` re-export. SQL 테이블 추가는 major upgrade(`--approve MAJOR_VERSION_RULE`) — 배포 회차 몫.

### 5.2 CONSUMED 를 어디에 두나 — 부속 테이블로 확정

| 안 | 판단 |
|---|---|
| 새 `ApprovalStatus.CONSUMED` | **기각.** `deriveStatus` 는 결정 집합에서 상태를 계산한다(불변식 2). 소비는 결정이 아니라 외부 사실이라 파생할 수 없고, "종료 상태에서 나가는 전이 없음" 계약(APPROVED→CONSUMED)과 `casAggregate` 의 `status='PENDING'` 조건을 함께 깨야 한다. 기존 transitions 테스트 다수가 영향 |
| `approval_request.consumed_at` ALTER (DESIGN §8) | **기각.** 다른 대상 종류 행이 전환 전용 칸을 떠안고, 소비 UPDATE 가 결정 CAS 의 `rev` 와 섞인다(소비가 진행 중 결정의 CAS 를 실패시킨다). 컬럼 준비 판정(`isColumnReady`)은 미검증(W17) |
| **부속 테이블 `transition_request`** | **채택.** timesheet_submission 과 같은 근거(timesheet 설계 §5.2). 출발·목적 상태 스냅샷과 무장·소비 칸이 한 행에 모이고, 신규 테이블이라 `isTableReady` 로 충분 |

DESIGN §8 의 `approval_request + consumed_at` 은 이 결정으로 대체된다 — DESIGN 문서 갱신은 사람 몫(이번 회차 금지 범위 밖이라 백엔드가 `docs/DESIGN.md` §8 한 줄 수정 가능).

### 5.3 테이블 정의

```sql
-- 승인 규칙. (프로젝트, 이슈 유형|'*', 목적 상태) 하나에 규칙 하나.
CREATE TABLE IF NOT EXISTS transition_rule (
    rule_id          BINARY(16)   NOT NULL,
    project_id       VARCHAR(32)  NOT NULL,
    issue_type_id    VARCHAR(32)  NOT NULL,          -- 숫자 id 또는 '*'
    to_status_id     VARCHAR(32)  NOT NULL,
    flow_id          VARCHAR(64)  NOT NULL,          -- approval_request.flow_id 와 같은 문자열 표현
    enabled          TINYINT(1)   NOT NULL DEFAULT 1,
    issue_type_name  VARCHAR(120) NULL,              -- 저장 시점 표시 스냅샷(Jira 값이 우선)
    to_status_name   VARCHAR(120) NULL,
    created_at       TIMESTAMP    NOT NULL,
    updated_at       TIMESTAMP    NOT NULL,
    updated_by       VARCHAR(128) NULL,
    rev              INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (rule_id),
    UNIQUE KEY uq_transition_rule (project_id, issue_type_id, to_status_id),
    INDEX ix_transition_rule_status (to_status_id, enabled)          -- validator 첫 쿼리
)

-- 전환 요청 부속 행(요청 1건당 1행). 출발·목적 상태는 요청 시점 값으로 고정.
CREATE TABLE IF NOT EXISTS transition_request (
    request_id        BINARY(16)   NOT NULL,
    issue_id          VARCHAR(32)  NOT NULL,
    project_id        VARCHAR(32)  NOT NULL,
    issue_type_id     VARCHAR(32)  NOT NULL,
    rule_id           BINARY(16)   NOT NULL,
    transition_id     VARCHAR(32)  NULL,
    transition_name   VARCHAR(120) NULL,
    from_status_id    VARCHAR(32)  NOT NULL,
    from_status_name  VARCHAR(120) NULL,
    to_status_id      VARCHAR(32)  NOT NULL,
    to_status_name    VARCHAR(120) NULL,
    armed_at          TIMESTAMP    NULL,
    armed_count       INT          NOT NULL DEFAULT 0,
    consumed_at       TIMESTAMP    NULL,
    consumed_by       VARCHAR(128) NULL,
    consume_source    VARCHAR(20)  NULL,             -- TRIGGER | LAZY | VALIDATOR_CHANGELOG
    created_at        TIMESTAMP    NOT NULL,
    rev               INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (request_id),
    INDEX ix_tr_issue_target (issue_id, to_status_id, created_at),   -- validator 후보·이슈 화면
    INDEX ix_tr_issue_live (issue_id, consumed_at),                  -- 트리거
    INDEX ix_tr_project (project_id, to_status_id)                   -- 규칙 openCount
)
```
TIMESTAMP 바인딩은 `SqlTime.ts()` 경계를 지킨다(숫자 바인딩 금지).

### 5.4 주요 쿼리

| 이름 | SQL 요지 |
|---|---|
| `findByStatus` | `SELECT BIN_TO_UUID(rule_id), project_id, issue_type_id, flow_id FROM transition_rule WHERE to_status_id=? AND enabled=1 LIMIT 500` |
| `findCandidates` | `SELECT … FROM transition_request tr JOIN approval_request r ON r.request_id=tr.request_id WHERE tr.issue_id=? AND tr.to_status_id=? AND r.commit_state='LIVE' ORDER BY tr.created_at DESC LIMIT ?` |
| `findLive` | `… WHERE tr.issue_id=? AND tr.consumed_at IS NULL AND r.status IN ('PENDING','APPROVED') AND r.commit_state='LIVE'` |
| `listForIssue` | `… WHERE tr.issue_id=? AND r.commit_state='LIVE' ORDER BY tr.created_at DESC LIMIT 30` (목적 상태별 최신 + 최근 10을 메모리에서) |
| `statusNamesFor(keys)` | `SELECT issue_id, to_status_id, from_status_name, to_status_name FROM transition_request WHERE issue_id IN (…) ORDER BY created_at DESC` — 빈 배열 가드(fail-open 금지 체크리스트) |

---

## 6. Jira 연결

### 6.1 manifest 변경

```yaml
modules:
  # 전환 차단 — 함수형만(불변식 10). 관리자가 워크플로의 "목적 상태로 들어가는 전환"마다 붙인다.
  jira:workflowValidator:
    - key: transition-approval-validator
      name: Moves Approval — approval required
      description: Allows the transition only when an approved Moves Approval request exists for this issue and target status.
      function: transitionValidator

  # 이슈 우측 요약 — 항상 보인다(Q59). 요청·상세는 Modal(main/modal).
  jira:issueContext:
    - key: transition-approval-context
      title: Moves Approval
      label: Approvals                      # 접힌 상태 라벨(키 이름은 forge lint 로 확인, X18)
      resource: main/issue
      resolver:
        function: resolver
  # 이슈 패널 — 전체 목록 + 결재 순서표. 같은 엔트리(extension.type 로 배치 분기)
  jira:issuePanel:
    - key: transition-approval-panel
      title: Moves Approval
      icon: resource:main;logo.png
      resource: main/issue
      resolver:
        function: resolver
  # ••• 메뉴 진입 — validator 거부 문구가 가리키는 곳. 모달 엔트리가 moduleKey 로 intent 를 정한다
  jira:issueAction:                          # 기존 worklog-log-action 목록에 한 항목 추가
    - key: transition-approval-action
      title: Request transition approval
      resource: main/modal
      resolver:
        function: resolver
      viewportSize: medium

  trigger:                                   # 기존 목록에 추가
    - key: issue-changed
      function: onIssueChanged
      events:
        - avi:jira:updated:issue
        - avi:jira:deleted:issue

  function:                                  # 기존 목록에 추가
    - key: transitionValidator
      handler: index.validateTransition
    - key: onIssueChanged
      handler: index.onIssueChanged

resources:
  - key: main
    entry:                                   # 기존 + issue
      issue: issue.html
```
- `resource` 는 기존 모듈과 같은 `main/<entry>` 형식(resource 하나에 entry 를 나누는 구조 유지).
- 제목은 영어 고정(i18n 객체 지원 미검증 P11 과 같은 이유).
- **scope 추가 없음**: 이슈 이벤트·이슈 조회·changelog = `read:jira-work`, 코멘트 = `write:jira-work`, myself = `read:jira-user`. 모듈 추가라 `forge install --upgrade`, SQL 테이블 추가라 `--approve MAJOR_VERSION_RULE`(배포 회차).
- validator 의 설정 UI(`create`/`edit`)는 두지 않는다 — 규칙은 프로젝트 설정 화면이 원천이고, validator 는 "규칙을 강제하는 스위치" 하나다.

### 6.2 REST 목록

| 호출 | 주체 | 경로 | 미검증 |
|---|---|---|---|
| `GET /rest/api/3/issue/{id}?fields=summary,status,project,issuetype&expand=transitions` | asUser | getIssueTransitionApprovals·createTransitionApproval·canRequest(invocation memo) | X12 |
| `GET /rest/api/3/issue/{id}?fields=status` | asUser | beforeDecide | — |
| `GET /rest/api/3/issue/{id}?fields=summary,project,status` | asUser | 어댑터 describe | — |
| `GET /rest/api/3/project/{id}` (issueTypes·style) + `GET /rest/api/3/project/{id}/statuses` | asUser | 규칙 화면·저장 검증 | X15 |
| `POST /rest/api/3/permissions/check`·`POST /rest/api/3/issue/bulkfetch` | asUser | 업무함·알림 가시성(기존 `filterVisibleIssues`) | 기존 U2·U3 |
| `GET /rest/api/3/user/viewissue/search` | asUser | 결재자 이슈 열람(기존) | 기존 |
| `POST /rest/api/3/issue/{id}/comment` | asUser | 코멘트 알림 | X13 |
| `GET /rest/api/3/myself` | asUser | 코멘트 언어 | X14 |
| `GET /rest/api/3/issue/{idOrKey}?fields=project,issuetype,status` | **asApp** `transition-validate` | validator(payload 에 없을 때만) | X1·X2 |
| `GET /rest/api/3/issue/{id}/changelog?startAt=&maxResults=100` (마지막 페이지부터) | **asApp** `transition-changelog` | validator 무장 재시도만 | X16 |

### 6.3 AGENTS.md asApp 허용 목록 추가 (백엔드가 문구 그대로 반영)

> 4. **워크플로 validator** 의 이슈 조회(프로젝트·유형·현재 상태)와 무장된 승인의 changelog 재확인 — validator 실행에 사용자 컨텍스트가 보장되지 않는다(X2). `TransitionValidatorService` 만 쓴다(사유 `transition-validate` / `transition-changelog`). 읽은 값은 판정에만 쓰고 거부 문구에는 payload 의 이슈 키 외에 아무것도 싣지 않는다. X2 실측에서 asUser 가 되면 asUser 로 바꾼다.

---

## 7. 프론트

### 7.1 엔트리 — `issue` 신규 1개 (3곳: `craco.config.js` ENTRIES, `static/ui/public/issue.html`, manifest `resources[].entry`)

| 모듈 | 리소스 | 배치 |
|---|---|---|
| `jira:issueContext` | `issue` | `layout='compact'` — 목적 상태 행마다 상태 배지 + 버튼 하나(요청 / 상세 / "전환 가능"). 상시 로드라 **가볍게**: Atlaskit lozenge·button·primitives 만, 결재 순서표·폼은 싣지 않는다 |
| `jira:issuePanel` | `issue` | `layout='full'` — compact 내용 + 최신 요청의 `ApprovalStepper`(lazy, `importWithReloadOnce`) + 최근 이력 |
| `jira:issueAction` | `modal`(기존) | intent `transitionPick` → `TransitionApprovalList layout='full'` 을 모달 안에 그리고, 요청 버튼은 **같은 모달 안에서** intent 를 `transitionRequest` 로 바꾼다(모달 안 모달 회피, X11) |

엔트리 하나에 두 모듈을 태우는 이유: 같은 데이터·같은 쿼리, 차이는 배치뿐이다. 모달과 분리하는 이유: issueContext 는 **모든 이슈 화면에서** 로드된다 — 모달 엔트리의 폼·순서표·증명서 코드를 끌고 오면 안 된다(craco 주석의 "상시 로드 엔트리" 경고가 바로 이 경우).

Q1 과의 관계: ISSUE 참조 어댑터의 `getIssueApproval`·`createIssueApproval` 은 여전히 어떤 이슈 모듈에서도 부르지 않는다. 모달은 `extension.moduleKey === 'transition-approval-action'` 또는 context `intent` 가 `transition*` 일 때만 전환 흐름으로 가고, 그 외 이슈 컨텍스트 진입은 지금처럼 존재하지 않는다.

### 7.2 화면 트리

```
entries/issue.jsx
  └ TransitionApprovalEntry (extension.type → layout, extension.issue.id → issueId)
      └ TransitionApprovalList {issueId, layout, onOpenRequest, onOpenDetail}
          ├ 상단: enforced=false → 한 줄 안내(notEnforcedReason 별 문구), 규칙 없으면 여기서 끝
          ├ TransitionTargetRow × n : 목적 상태 이름 · UsabilityLozenge · [승인 요청]|[상세]|"지금 전환할 수 있습니다"
          └ (full) LatestStepper(lazy) · RecentHistory
      onOpenRequest → new Modal({resource, context:{intent:'transitionRequest', issueId, toStatusId, transitionId}, onClose: invalidate transitionKeys.issue})
      onOpenDetail  → new Modal({..., context:{intent:'detail', requestId}})
entries/modal.jsx (변경)
  ├ intent 'transitionPick'   → TransitionApprovalList layout='full' (onOpenRequest = setIntent('transitionRequest') + 선택 저장)
  ├ intent 'transitionRequest'→ TransitionRequestForm (lazy)
  └ 기존 intent 무변경. detail 에서 target.kind==='ISSUE_TRANSITION' → TransitionTargetHeader
features/transition/
  TransitionApprovalList.jsx · TransitionTargetRow.jsx · UsabilityLozenge.jsx
  TransitionRequestForm.jsx   — 결재선은 읽기 전용(rule.flow.steps 표시, ApprovalLineEditor 의 읽기 모드 재사용 또는 단순 목록),
                                요청 메시지·마감(flow.defaultDeadlineDays 기본)·참조(기존 ApproverSearchDialog allowAll) 입력
  TransitionTargetHeader.jsx  — "OPS-12 · In Review → Done" + UsabilityLozenge + 현재 상태
  TransitionRuleSettings.jsx  — 규칙 표(유형·목적 상태·Flow·사용·진행 중 건수) + 추가/편집/삭제 + validator 부착 안내(company/team-managed 별 문구)
  TransitionRuleFormModal.jsx — 유형 선택('*' 포함) → 그 유형의 상태 목록으로 목적 상태 선택 → Flow 선택
  transitionModel.js          — usability → {appearance, labelKey}, notEnforcedReason → 문구 키, statuses 를 유형으로 거르기(순수, 테스트)
  transitionApi.js            — invokeApproval 래퍼 5개
entries/projectSettings.jsx (변경) — 안내 자리 대신 TransitionRuleSettings(projectId = extension.project.id). 기존 placeholder 문구는 "프로젝트 사용 여부·정책은 전역 설정" 안내로 상단에 축약해 유지
features/inbox (변경)  — ISSUE_TRANSITION 행 제목 옆 "→ {toStatusName}" 보조 텍스트, 엑셀 열 "전환"
features/notification (변경) — 새 templateKey 3개
features/certificate (변경) — transition 블록(출발→목적, 소비 시각)
```
에러 분기는 `error.code` 로: `TRANSITION_ALREADY_APPROVED` → 목록 재조회 + "이미 승인됨" 안내, `TRANSITION_STATE_CHANGED` → 상세 재조회, `ALREADY_OPEN` → 목록 재조회.

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const transitionKeys = {
  all: ['transition'],
  /** 이슈의 전환 승인 요약. 이슈 엔트리와 모달(transitionPick)이 같은 키 — 다른 iframe 이라 모달 onClose 에서 이슈 엔트리가 무효화한다 */
  issue: (issueId) => [...transitionKeys.all, 'issue', String(issueId)],
  rules: (projectId) => [...transitionKeys.all, 'rules', String(projectId)],
};
```

### 7.4 iframe 함정

- issueContext·issuePanel 은 내용 높이로 — `100vh` 금지(되먹임).
- lazy 청크(`ApprovalStepper`, `TransitionRequestForm`)는 `importWithReloadOnce`.
- 상시 로드 엔트리라 **번들 예산**: `build:ui` 결과에서 `issue` 엔트리 고유 JS 를 확인해 보고서에 적는다(공유 청크 제외).

---

## 8. i18n 키 (kr / en) — `npm run merge` 필수, 자리표시는 리포 관례 `{name}`

### 8.1 신규 `locales/{kr,en}/transition.json`

| 키 | kr | en |
|---|---|---|
| `list.title` | 전환 승인 | Transition approvals |
| `list.notEnforced.NO_RULE` | 이 이슈에는 승인이 필요한 전환이 없습니다. | No transitions on this issue require approval. |
| `list.notEnforced.PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않습니다. | Approvals are turned off for this project. |
| `list.notEnforced.GLOBAL_DISABLED` | 관리자가 전환 승인을 일시 해제했습니다. | An administrator has paused transition approvals. |
| `list.target` | → {status} | → {status} |
| `list.request` | 승인 요청 | Request approval |
| `list.detail` | 상세 | Details |
| `list.readyHint` | 승인되었습니다. 지금 전환할 수 있습니다. | Approved. You can transition now. |
| `list.notAvailable` | 지금은 이 상태로 전환할 수 없습니다. | You can't move to this status right now. |
| `list.flowMissing` | 규칙의 결재선을 찾을 수 없습니다. 프로젝트 관리자에게 문의하세요. | The approval flow for this rule is missing. Contact a project admin. |
| `list.history` | 최근 요청 | Recent requests |
| `usability.NONE` | 요청 없음 | No request |
| `usability.PENDING` | 결재 중 | In approval |
| `usability.USABLE` | 승인됨 | Approved |
| `usability.CONSUMED` | 사용됨 | Used |
| `usability.STALE` | 상태 바뀜 | Status changed |
| `usability.REJECTED` | 반려됨 | Rejected |
| `usability.CLOSED` | 종료됨 | Closed |
| `form.title` | {issueKey} · {from} → {to} 승인 요청 | Request approval · {issueKey} · {from} → {to} |
| `form.lineFixed` | 결재선은 프로젝트 규칙이 정합니다. | The approval line is set by the project rule. |
| `form.message` | 요청 메시지 | Message |
| `form.deadline` | 결재 마감 | Decision deadline |
| `form.cc` | 참조 | CC |
| `form.submit` | 요청 | Request |
| `form.alreadyApproved` | 이미 승인된 요청이 있습니다. 바로 전환하세요. | An approved request already exists. Go ahead and transition. |
| `header.current` | 현재 상태: {status} | Current status: {status} |
| `header.consumedAt` | {time}에 사용됨 | Used at {time} |
| `rules.title` | 전환 승인 규칙 | Transition approval rules |
| `rules.add` | 규칙 추가 | Add rule |
| `rules.column.issueType` | 이슈 유형 | Issue type |
| `rules.column.toStatus` | 목적 상태 | Target status |
| `rules.column.flow` | 결재선 | Approval flow |
| `rules.column.enabled` | 사용 | On |
| `rules.column.open` | 진행 중 | Open |
| `rules.anyIssueType` | 모든 유형 | All types |
| `rules.missingRef` | Jira 에서 찾을 수 없음 | Not found in Jira |
| `rules.deleteConfirm` | 규칙을 삭제하면 이 상태로의 전환이 승인 없이 통과합니다. 진행 중인 요청 {count}건은 그대로 남습니다. | Deleting this rule lets transitions into this status pass without approval. {count} open requests stay as they are. |
| `rules.projectDisabled` | 이 프로젝트는 승인을 사용하지 않아 규칙이 적용되지 않습니다(전역 설정 > 적용 프로젝트). | Approvals are off for this project, so rules are not enforced (global settings > Projects). |
| `rules.globalDisabled` | 전역 정책에서 전환 승인이 해제돼 있습니다. | Transition approvals are paused in the global policy. |
| `rules.guide.title` | 워크플로에 validator 를 붙여야 강제됩니다 | Add the validator to your workflow to enforce |
| `rules.guide.classic` | 프로젝트 설정 > 워크플로 > 편집 에서 목적 상태로 들어가는 **모든 전환**에 "Moves Approval — approval required" validator 를 추가하세요. | In Project settings > Workflows > Edit, add the "Moves Approval — approval required" validator to **every transition** into the target status. |
| `rules.guide.nextGen` | team-managed 프로젝트는 워크플로 규칙에서 validator 를 추가합니다(지원 여부 확인 중). | In team-managed projects, add the validator under workflow rules (support being verified). |
| `rules.form.title` | 전환 승인 규칙 | Transition approval rule |
| `rules.form.save` | 저장 | Save |
| `server.validator.REJECT_NO_REQUEST` | 이 전환은 승인이 필요합니다. 이슈의 Moves Approval 영역 또는 ••• > "Request transition approval" 에서 요청하세요. | This transition needs approval. Request it from the Moves Approval area on the issue or ••• > "Request transition approval". |
| `server.validator.REJECT_PENDING` | 승인 결재가 진행 중입니다. 승인된 뒤 다시 전환하세요. | Approval is in progress. Transition again once it is approved. |
| `server.validator.REJECT_REJECTED` | 승인 요청이 반려됐습니다. 새로 요청하세요. | The approval request was rejected. Submit a new request. |
| `server.validator.REJECT_CONSUMED` | 이 승인은 이미 사용됐습니다. 새로 요청하세요. | This approval was already used. Submit a new request. |
| `server.validator.REJECT_STATE_MISMATCH` | 승인 이후 이슈 상태가 바뀌었습니다. 현재 상태에서 새로 요청하세요. | The issue status changed after approval. Submit a new request from the current status. |
| `server.validator.REJECT_UNAVAILABLE` | 지금은 승인 여부를 확인할 수 없습니다. 잠시 후 다시 시도하세요. | Approval can't be checked right now. Try again shortly. |
| `server.comment.requested` | 승인 요청 | approval requested |
| `server.comment.myTurn` | 결재 차례입니다 | your approval is needed |
| `server.comment.approved` | 승인되었습니다 — 이제 전환할 수 있습니다 | approved — you can transition now |
| `server.comment.rejected` | 반려되었습니다 | rejected |
| `server.comment.cancelled` | 요청이 회수되었습니다 | request withdrawn |
| `server.comment.transitionLine` | {from} → {to} | {from} → {to} |
| `server.comment.open` | 업무함에서 보기 | Open in inbox |

### 8.2 기존 네임스페이스 추가 키

| 키 | kr | en |
|---|---|---|
| `error.TRANSITION_NOT_AVAILABLE` | 지금은 이 상태로 전환할 수 없습니다. | You can't move this issue to that status right now. |
| `error.TRANSITION_RULE_NOT_FOUND` | 이 전환은 승인이 필요하지 않습니다. 바로 전환하세요. | This transition doesn't need approval. Go ahead and transition. |
| `error.TRANSITION_PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않습니다. | Approvals are turned off for this project. |
| `error.TRANSITION_ALREADY_APPROVED` | 이미 승인된 요청이 있습니다. 바로 전환하세요. | An approved request already exists. Go ahead and transition. |
| `error.TRANSITION_STATE_CHANGED` | 요청 이후 이슈 상태가 바뀌어 요청이 만료됐습니다. | The issue status changed, so the request expired. |
| `error.TRANSITION_RULE_CONFLICT` | 같은 유형·목적 상태의 규칙이 이미 있습니다. | A rule for this issue type and status already exists. |
| `notification.template.transitionApproved` | {actor}님이 전환을 승인했습니다. 이제 전환하세요. | {actor} approved the transition. You can transition now. |
| `notification.template.transitionStateChanged` | 이슈 상태가 바뀌어 전환 승인 요청이 만료됐습니다. | The transition approval request expired because the issue status changed. |
| `notification.template.transitionIssueDeleted` | 이슈가 삭제되어 전환 승인 요청이 만료됐습니다. | The transition approval request expired because the issue was deleted. |
| `policy.commentNotifyEnabled` | Jira 이슈 코멘트로 @멘션 알림(전환 승인) | @mention via Jira issue comments (transition approvals) |
| `policy.transitionApprovalEnabled` | 전환 승인 강제(끄면 모든 validator 가 통과) | Enforce transition approvals (off = every validator passes) |
| `cert.transition` | 전환 | Transition |
| `cert.consumedAt` | 사용 시각 | Used at |
| `inbox.column.transition` | 전환 | Transition |
| `project.placeholder.body` (수정) | 프로젝트 사용 여부와 정책은 전역 설정에서 관리합니다. 이 화면에서는 전환 승인 규칙을 관리합니다. | Project on/off and policy live in global settings. Manage transition approval rules here. |

`state.status.*` 는 무변경(CONSUMED 는 승인 상태가 아니라 usability 라 `transition.usability.*`).

---

## 9. 용량·호출량

### 9.1 용량 (200명, 승인 대상 전환 하루 50건 가정 — DESIGN §8, 인덱스 포함 ×2, 실측 전)

| 항목 | 연 건수 | 행 크기 | 연 용량 |
|---|---|---|---|
| 전환 요청(요청·결재자·이벤트·업무함·알림, 기존 엔진 행) | 1.2만 | 약 2.4KB | 약 60MB (DESIGN 추정 그대로) |
| `transition_request` 부속 행 | 1.2만 | 약 0.4KB ×2 | 약 10MB |
| `CONSUMED` 이벤트 | ≤1.2만 | 0.2KB ×2 | 약 5MB |
| `transition_rule` | 프로젝트 × 수 개 | — | 무시(수백 행) |
| **합계 추가** | | | **연 약 75MB** — 3년 보관 225MB. 타임시트·연동 포함 전체 예산(1GiB) 안 |

Jira 코멘트는 Jira 저장소라 우리 용량에 없다.

### 9.2 resolver·함수 1회당 Jira 호출

| 경로 | Jira 호출 | SQL | 비고 |
|---|---|---|---|
| `getIssueTransitionApprovals` | 가드 mypermissions 1 + 이슈+전환 1 = **2** | 3~4 (규칙, 이슈 요청 목록, 프로젝트 사용, Flow) | 지연 판정이 만료·소비를 하면 +CAS 몇 문장 |
| `createTransitionApproval` | 가드 1 + 이슈+전환 1 + 결재자 열람 n(`approverAccessCheck`) + 그룹 펼침 g + 코멘트 1 + myself 1 | 엔진 생성 + 부속 1 | n = 결재선 인원(보통 1~5) |
| `decideApproval`(전환) | 기존 + beforeDecide 1 + 코멘트 1 + myself 1 | 기존 | |
| `bulkApprove` 50건 | 건당 +1(beforeDecide) +1(코멘트) → **최대 +100** | | 25초 한도 근접 위험(건당 Jira 2~3콜 × 50). `bulkApprove` 는 `decideApproval(…, {skipPin:true})` 로 들어오므로 같은 옵션 자리에 `bulk:true` 를 넘겨 **일괄 경로에서는 코멘트를 생략**한다(앱 내 알림은 그대로). beforeDecide 는 생략하지 않는다(안전 판정) |
| 업무함 목록 | 기존 permissions/check·bulkfetch 일괄(종류 합산) | +1 (상태 이름) | N+1 없음 |
| validator — 규칙 없는 상태 | **0** | 1 | KVS 2 |
| validator — 규칙 있음 | 0~1 | 3 | |
| validator — 무장 재시도 | 1~2(changelog 끝 페이지) | 3~4 | 드묾 |
| 트리거 — 상태 변경 아님 | 0 | **0** | 이벤트 대부분 |
| 트리거 — 상태 변경 | 0 | 1 + 해당 요청 수만큼 CAS | |
| 규칙 화면 | 가드 1 + 2(project, statuses) | 2 | |

---

## 10. 미검증 (상세·확인 방법은 `04_spike_todo.md` X1~X20)

| # | 항목 | 영향 | 확인 방법(요지) |
|---|---|---|---|
| **X1** | validator payload 의 필드(이슈 id/key, `transition.from/to.id`, 전환 id, 실행자 accountId, locale) | **판정 전체** — `to.id` 가 없으면 규칙 키가 성립하지 않는다 | 배포 후 validator 가 받은 키 이름만(값 없이) 감사 행/로그로 남기는 스파이크 빌드 |
| **X2** | validator 실행 컨텍스트 — asUser 가능 여부, asApp 동작 | asApp 사유 4번의 필요성 | 같은 스파이크에서 asUser 호출 성공 여부 |
| **X3** | validator 시간 제한·예외/시간 초과 시 Jira 의 처리(통과인가 거부인가) | fail-closed 설계의 실효 | 의도적 지연 5·10·20초 빌드로 전환 시도 |
| **X4** | team-managed 프로젝트·새 워크플로 편집기에서 Forge validator 부착 가능 여부 | 강제 범위 | dev 사이트 team-managed 프로젝트 |
| X5 | 여러 validator 중 하나가 거부할 때 우리 validator 호출 여부·순서 | 무장 설계 근거 | 필수 필드 validator 와 함께 붙여 실패시키고 armed_at 확인 |
| **X6** | REST(`POST issue/{id}/transitions`)·자동화·일괄 전환·보드 드래그·모바일 경로에서 validator 실행 여부 | 강제의 구멍 | 각 경로로 규칙 걸린 전환 시도 |
| X7 | `errorMessage` 표시(줄바꿈·길이)·보드 드래그 시 표시 | Q60 병기 문구 | 두 줄 문구로 거부시켜 화면 확인 |
| **X8** | `avi:jira:updated:issue` 의 changelog 형태(`fieldId:'status'`, from/to 가 id 인지)·actor 필드·전환으로 발생하는지 | 소비 확정·대기 만료 | 승인 후 전환 → `getIssueTransitionApprovals.latest.consumedAt`·`consume_source='TRIGGER'` |
| X9 | 트리거 `filter.expression`·issueContext `displayConditions`(jiraExpression/프로퍼티) 지원 | 트리거 호출량·Q59 | forge lint + 배포 |
| X10 | `avi:jira:deleted:issue` payload(issue.id) | 삭제 만료 | 이슈 삭제 후 요청 상태 |
| X11 | issueContext·issuePanel·issueAction 의 `extension` 컨텍스트(issue.id, project.id, type, moduleKey), issueContext 에서 Modal 열기 | 엔트리 분기 | 페이지 로드만으로 컨텍스트 키 표시(진단 모드) |
| X12 | `expand=transitions` 결과가 transitions 엔드포인트와 같은지(조건·권한 반영, `to.id`, `hasScreen`) | 요청 자격 | 조건 걸린 전환으로 비교 |
| X13 | 코멘트 asUser POST — 코멘트 권한 없는 결재자 403, 멘션 알림 전달, bulk 시간 | 코멘트 알림 | 권한 없는 결재자로 승인 |
| X14 | `GET /rest/api/3/myself` 의 `locale` | 코멘트 언어 | 한국어 사용자로 승인 |
| X15 | `project/{id}`·`project/{id}/statuses` 가 team-managed 에서 같은 형태(`style`, 유형별 상태) | 규칙 화면 | team-managed 프로젝트 규칙 저장 |
| X16 | changelog API 순서·페이지·asApp 접근 | 무장 재시도 | 전환 실패 후 재시도 시나리오 |
| X17 | 프로젝트 관리자(비 Jira 관리자)가 projectSettingsPage 에서 resolver 호출 시 `hasProjectAdmin` 통과 | 규칙 화면 접근 | 프로젝트 관리자 계정 |
| X18 | manifest 키 이름(`jira:workflowValidator` 의 `function`/`name`/`description`, `jira:issueContext` 의 `label`) | 배포 | `forge lint` |
| X19 | 워크플로 스킴 교체 시 상태 id 유지(규칙 유지 근거) | §3.2 근거 | 스킴 교체 후 규칙 동작 |
| X20 | 생성(Create) 전환에 validator 를 붙였을 때 payload(이슈 없음) | `PASS_NO_ISSUE` 분기 | Create 전환에 부착 |

---

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] 도메인 `src/domain/approval/{constants,scopeKey,transitions}.js` 추가분 + 테스트(기존 무변경 통과)
- [ ] 도메인 `src/domain/transition/{rule,usability,judge,validatorPayload,statusChange,messages,commentAdf}.js` + 테스트 — **judge 판정 표 전 행**
- [ ] DDL `ddl/transition.sql.js`, `ddl/index.js`, `migrate.js` v029·v030(이름 그대로)
- [ ] `TransitionRuleRepository`(CAS rev, project_id WHERE, UNIQUE 충돌 → CONFLICT), `TransitionRepository`(insertDraft·deleteOrphan·findCandidates·findLive·listForIssue·arm·consume+CONSUMED 이벤트·statusNamesFor 빈 배열 가드)
- [ ] `IssueStateReader`(asUser 3종 + asApp 2종, 사유 문자열 고정, invocation memo)
- [ ] `TransitionTargetAdapter` + `TargetRegistry` 등록
- [ ] `ApprovalService` 훅 3개(describe state, beforeDecide, notifyExternal) + 테스트
- [ ] `TransitionService`(조회·생성·규칙 CRUD·설정 이력), `FlowService.getFlowForRequest`
- [ ] `TransitionValidatorService`(4초 예산, fail-closed, 무장, changelog) + 서비스 테스트(DB 오류·시간 초과·Jira 실패 → REJECT_UNAVAILABLE, throw 없음)
- [ ] `TransitionChangeService` + `src/trigger/onIssueChanged.js`(throw 없음, 상태 변경 아니면 SQL 0) + 테스트
- [ ] `TransitionCommentNotifier`(asUser, 정책, 3초, 실패 무시) + Confluence 판 테스트 이식
- [ ] `src/trigger/transitionValidator.js`, `src/index.js`(registrar·export 2)
- [ ] `TransitionController` + `PermissionMap` 5개 — 계약 테스트 통과
- [ ] `ErrorCodes` 6개, 정책 키 2개(세 곳), `CertificateService`·`NotificationService`·`InboxService`·`RetentionRepository`·`StorageService`
- [ ] manifest(§6.1 — 모듈 4·trigger 1·function 2·entry 1), `AGENTS.md` asApp 4번, `scopeKey.js`·`docs/DESIGN.md` §2.1/§8 한 줄
- [ ] `04_spike_todo.md` 에 구현 중 생긴 항목 X21~ 추가
- [ ] `npm test -- --runInBand` (기준선 55/713 + 신규)

### 11.2 frontend 체크리스트

- [ ] 엔트리 `issue` 3곳(craco ENTRIES·`public/issue.html`·manifest entry) — 백엔드가 manifest 를 먼저 고치면 확인만
- [ ] `features/transition/*`(§7.2), `transitionModel.js` 테스트
- [ ] `entries/issue.jsx`(layout 분기, 100vh 금지, lazy stepper)
- [ ] `entries/modal.jsx` intent `transitionPick`·`transitionRequest`, moduleKey 분기, detail 헤더 분기
- [ ] `entries/projectSettings.jsx` → TransitionRuleSettings
- [ ] 업무함 행·엑셀 열, 알림 템플릿, 증명서 transition 블록
- [ ] `transitionKeys` 팩토리(인라인 키 금지 계약 테스트)
- [ ] `locales/{kr,en}/transition.json` + 기존 네임스페이스 키 → `npm run merge`
- [ ] `npm run test:ui -- --runInBand` (기준선 20/161 + 신규), `npm run build:ui`(issue 엔트리 고유 JS 크기 보고)

### 11.3 순서·의존

1. 백엔드 도메인 → 스키마 → 어댑터·서비스 → validator·트리거 → manifest
2. 프론트는 §2 계약만 보고 병렬 가능. `transition.json` 의 `server.*` 키는 백엔드가 import 하므로 **키 이름은 §8.1 그대로**(프론트가 파일을 만들면 백엔드는 키만 맞춘다 — 먼저 만드는 쪽이 두 언어 모두 채운다)
3. 검증자는 §2 표·§3.5 판정 표·§4.12 불변식 표를 기준으로 본다

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 최초 작성 | 로드맵 5 착수 |
