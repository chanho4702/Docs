# field-change-approval 설계서 — 이슈 필드 변경 승인(요청형)

> 작성: feature-architect · 2026-10-04 · autopilot 무인 회차(설계만, 코드 무변경)
> 입력: `00_input/requirement.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DESIGN.md` §2 ③·§7·§8, `_workspace/{transition-approval,issue-approval,worklog-history}/*.md`, `_workspace/QUESTIONS.md`(Q1~Q89)
> 기준 코드(이 회차에 직접 읽은 값): `src/domain/approval/{constants,scopeKey,transitions}.js`, `src/resolver/approval/ApprovalService.js`(`decideApproval`·`bulkApprove`·`beforeDecide`·`notifyExternal`·`expireForTarget`·`createForTarget`), `target/{TargetRegistry,TransitionTargetAdapter}.js`, `src/resolver/transition/{TransitionService,TransitionChangeService,TransitionRepository,projectEnablement}.js`, `src/trigger/onIssueChanged.js`, `src/api/jira/RequestJira.js`, `src/resolver/notification/NotificationService.js`, `src/resolver/settings/SettingsRepository.js`, `src/resolver/retention/RetentionRepository.js`, `src/rdb/schema/{migrate.js,ddl/*}`(최신 `v032`, `approval_event.event_type`·`approval_notification.kind` 은 VARCHAR(32)), `manifest.yml`, `static/ui/src/entries/{issue,modal,projectSettings}.jsx`, `features/issueApproval/IssueApprovalOverview.jsx`, `features/transition/transitionModel.js`.
>
> **수용 기준 문장(그대로 화면·문서에 싣는다):**
> "Jira 에는 필드 변경을 미리 막는 장치가 없습니다. Moves Approval 화면을 거친 변경만 승인 뒤 적용되고, Jira 화면·REST·자동화로 직접 바꾼 값은 사후에 감지·기록만 됩니다. 직접 변경을 막으려면 요청자 역할에서 '작업 항목 편집(Edit work items)' 권한을 회수하세요(결재자는 유지). 필드를 편집 화면에서 빼면 앱의 적용도 함께 실패합니다."
>
> **한 줄 요약:** 새 대상 종류 `FIELD_CHANGE` + 어댑터 1개, resolver 신규 8개, 테이블 3개(v033~v035), 엔트리 추가 없음, **asApp 추가 없음**(적용은 최종 결재자 asUser — asApp 대체 적용·되돌리기는 사람 확인 전이라 설계만). 엔진은 선택 훅 1개(`afterDecide`)와 상수 몇 개만 추가하고 상태 머신은 그대로다.

---

## 열린 질문

제품 결정이 필요한 것만 적는다. 구현은 **기본 가정**으로 진행한다(답이 오면 분기·상수만 바뀌고 §2 계약은 유지된다). `_workspace/QUESTIONS.md` 에 Q90~Q97 로 올렸다.

| # | 질문 | 기본 가정(구현 기준) | 대안 | 권장 |
|---|---|---|---|---|
| Q90 | **적용 주체** — 결재자에게 편집 권한이 없거나 필드가 편집 화면에 없을 때 | **최종 결재자 asUser 로만 적용.** 실패하면 승인은 유지하고 적용 상태 `FAILED` + 요청자·결재자 알림, 요청자·결재자·Jira 관리자가 "다시 적용"(누른 사람 asUser). **asApp 대체 적용은 구현하지 않는다**(§6.3 문안만 준비, 사람 확인 전) | (b) 정책 `fieldChangeApplyFallback='APP'` — asUser 가 403/400 이면 asApp(+`overrideScreenSecurity`) 재시도. 이력 수정자 = 앱 계정. AGENTS.md asApp 5번 신설 (c) 항상 asApp | 기본 가정. 비교표 §4.6. 권한 회수 방식으로 막는 고객은 결재자가 편집 권한을 가지므로 asUser 로 충분하다. 편집 화면에서 필드를 빼서 막는 고객이 있으면 (b) — asApp 쓰기 경로 신설이라 사람 결정 필요 |
| Q91 | **우회 되돌리기**(요구 5 — 기본 꺼짐, opt-in, asApp) | **이번 회차에 구현하지 않는다.** 감지·감사 기록·알림만. 기본값이 "꺼짐"이라 사용자에게 보이는 동작은 같다 | 정책 `fieldChangeRevertBypass`(프로젝트별, 기본 false) — 트리거가 asApp PUT 으로 직전 값 복원. AGENTS.md asApp 6번 신설, 앱 계정 변경 이벤트 무시 장치 필요 | 기본 가정. 트리거 안 asApp **쓰기**는 고객 데이터를 자동으로 바꾸는 첫 경로다(되돌린 값을 다시 사람이 바꾸면 핑퐁). 사람이 허용하면 §4.10 설계대로 추가 |
| Q92 | 요청 자격 | **이슈 열람(`{issue:view}`)** + 규칙 있음 + 프로젝트 사용. 이슈 편집 권한은 요구하지 않는다 | `{issue:edit}` | 기본 가정. 직접 변경을 막는 권장 방법이 "요청자 편집 권한 회수"라 edit 축이면 그 고객의 요청자가 요청을 못 한다 |
| Q93 | 편집 권한이 없는 요청자의 **단일 선택** 필드 옵션 목록 | 요청자 asUser `editmeta` 에 필드가 없으면 단일 선택 필드는 요청 불가(`FIELD_CHANGE_OPTIONS_UNAVAILABLE`). 우선순위는 전체 목록(`priority/search`)으로 대체 | (a) asApp `editmeta` 로 옵션 읽기(asApp 읽기 확장) (b) JQL 자동완성 값 이름으로 요청·적용(`{value}` — 이름 중복 위험) | 기본 가정, Q92 가 "열람"으로 확정되고 단일 선택 필드 요구가 있으면 (a) |
| Q94 | 우회(직접 변경) 알림 수신자 | **요청과 연결된 경우만 알림**: 결재 중 요청이 있으면 만료(`FIELD_CHANGED`) + 요청자·대기 결재자, 앱이 적용한 승인값이 직접 바뀌면 요청자·승인한 결재자. 요청 없는 필드의 우회는 **감사 기록만**(이슈 패널에 표시) | 프로젝트 관리자에게도 알림 / 규칙별 감시자 지정 | 기본 가정. 담당자 같은 잦은 필드를 규칙에 걸면 알림 폭주 — 알림 테이블은 요청 id 가 필수라 요청 없는 알림은 스키마 변경도 필요하다 |
| Q95 | 우회 감사 기록 보관 | **자동 삭제 없음.** 데이터 관리 사용량에 테이블이 보인다(§9 용량) | 정책 `fieldChangeBypassRetentionMonths`(기본 24) + 일일 스윕 정리(내보내기 확정 후) | 기본 가정(worklog-history Q77 과 같은 원칙 — 감사 기록은 내보내기 없이 지우지 않는다). 담당자처럼 잦은 필드를 규칙에 거는 고객이 생기면 대안 |
| Q96 | 요청 사유 필수 | **필수**(요구 2 "현재 값·새 값·사유"). 빈 사유 → `FIELD_CHANGE_REASON_REQUIRED` | 선택 | 기본 가정 |
| Q97 | 결재선을 누가 정하나 | **규칙의 Flow 로 고정**(전환 승인 Q56 과 같은 이유 — 요청자가 결재자를 고르면 짜고 승인하는 경로). 요청자는 사유·마감·참조만 | 요청자가 결재선 구성 | 기본 가정 |

기술적 모호함은 스스로 정하고 근거를 본문에 적었다: 충돌 판정 지점 3곳(§4.4 — 결정 직전 만료, 적용 직전 미적용, 트리거·조회 지연 판정), 적용 멱등(§4.5 — 부속 행 claim + fencing token + "이미 새 값이면 쓰지 않음"), 우리 적용과 우회의 구분(§3.6), 미적용 승인이 남은 필드에 새 요청이 오면 이전 승인 적용 무효화(§4.3 7), 지원 필드 한정(§3.2), 일괄 승인 시간 예산(§4.5).

---

## 1. 개요·영향 범위

**대상** = (이슈 `issueId`, 필드 `fieldId`). `scopeKey = FIELD_CHANGE:{issueId}:{fieldId}` — 열린(결재 중) 요청은 필드당 하나(불변식 1). 같은 이슈의 일반 승인(`ISSUE:{issueId}`)·전환 승인(`TRANSITION:{issueId}:{toStatusId}`)과 **다른 대상**이라 동시에 열릴 수 있다(§3.8).

흐름:
```
관리자(프로젝트 설정)   규칙 저장: (프로젝트, 이슈 유형|*, 필드, Flow)  + 직접 변경 차단 가이드
요청자(이슈 요약·패널·••• 모달)  getIssueFieldChanges → [변경 요청] → getFieldChangeForm → createFieldChangeApproval
                                 └ 요청 시점 현재 값(from) 스냅샷 + 새 값(to) + 사유
결재자(업무함·모달)  기존 decideApproval/bulkApprove
     ├ 결정 직전(모든 단계) beforeDecide: 결재자 asUser 로 현재 값 확인 → from 과 다르면 EXPIRED(FIELD_CHANGED) + FIELD_CHANGE_CONFLICT
     └ 최종 승인 직후 afterDecide: 최종 결재자 asUser 로 적용
           현재 == from → PUT → APPLIED      현재 == to → APPLIED(이미 적용됨, 쓰지 않음)
           그 외 → CONFLICT(미적용 + 알림)   PUT 실패 → FAILED(승인 유지, 다시 적용 가능)
FAILED → 요청자·결재자·Jira 관리자 [다시 적용] = applyFieldChange (누른 사람 asUser, 같은 판정·멱등)
직접 변경(Jira 화면·REST·자동화)  avi:jira:updated:issue → 규칙 필드 항목 → 우리 적용이 아니면 BYPASS 기록
     ├ 결재 중 요청 있음 → EXPIRED(FIELD_CHANGED) + 알림
     └ 적용된 승인값이 바뀜 → 그 요청에 CHANGED_AFTER_APPROVAL 감사 이벤트 + 알림
```

| 축 | 영향 |
|---|---|
| 도메인 | **신규** `src/domain/fieldChange/{fieldType,fieldValue,applyPlan,eventClassify,rule,state}.js`(순수). **추가만** `src/domain/approval/constants.js`(`TargetKind.FIELD_CHANGE`, `ExpiryReason.FIELD_CHANGED`, `EventType.FIELD_APPLIED`·`APPLY_FAILED`·`APPLY_CONFLICT`), `scopeKey.js`(빌더·역파서), `transitions.js`(`TARGET_CHANGE_REASONS` 에 `FIELD_CHANGED`). 상태 머신·`derive.js` 무변경 |
| resolver | **신규 8개** `src/resolver/fieldChange/`(§2.1). **변경** `ApprovalService`(선택 훅 `afterDecide` + 일괄 시간 예산 전달 — §4.2), `TargetRegistry`, `NotificationService`(템플릿·수신자·`fieldChange` 필드), `InboxService`(`fieldChange` 필드), `RetentionRepository`(CHILD_TABLES), `RetentionService`(내보내기 `fieldChange`), `PermissionMap`(8개), `src/index.js`(registrar 1) |
| 트리거 | `src/trigger/onIssueChanged.js` — 기존 두 처리 뒤 `fieldChangeEventService.handleEvent` 를 **세 번째 try/catch** 로. manifest 이벤트 추가 없음(`avi:jira:{updated,deleted}:issue` 이미 구독) |
| 스키마 | **신규 테이블 3개** `v033_create_field_change_rule_table`, `v034_create_field_change_request_table`, `v035_create_field_change_bypass_table`. `approval_request` ALTER 없음 |
| manifest | **무변경**(모듈·이벤트·scope·엔트리). PUT 은 `write:jira-work`, 필드·사용자·우선순위 조회는 `read:jira-work`·`read:jira-user` — 이미 있음 |
| 프론트 | 엔트리 **추가 없음**(3곳 무변경). `IssueApprovalOverview` 에 세 번째 칸, `modal.jsx` intent `fieldChangeRequest`, `projectSettings.jsx` 에 규칙 화면 + 차단 가이드, 상세·업무함·알림·증명서의 FIELD_CHANGE 분기 |
| i18n | **신규 네임스페이스** `fieldChange.json`(kr/en). `error`·`notification`·`issueApproval`·`cert`·`inbox` 키 추가 |
| 워크포스 연동 | 없음 |
| AGENTS.md | **무변경**(asApp 추가 없음). Q90(b)·Q91 이 허용되면 넣을 문안은 §6.3 |
| DESIGN.md | §2 표 ③ 행을 "요청형 — 최종 결재자 asUser 적용, 직접 편집은 감지만(field-change-approval)" 으로 한 줄 갱신(백엔드 허용 범위) |

---

## 2. 경계면 계약

권한 축 표기: `SELF` · `{issue:view}` = `{issue:'view', issueIdKey:'issueId'}` · `{project:admin}` = `{project:'admin', projectIdKey:'projectId'}`.
공통 에러(모든 resolver): `PERMISSION_DENIED`, `APP_ACCESS_DENIED`, `LICENSE_INACTIVE`, `STORAGE_NOT_READY`, `JIRA_API_FAILED`, `UNKNOWN_ERROR`. `{issue:view}` 거부 `PERMISSION_ISSUE_VIEW_DENIED`, `{project:admin}` 거부 `PERMISSION_PROJECT_ADMIN_REQUIRED`, SELF + 대상 열람 거부 `PERMISSION_TARGET_VIEW_DENIED`. 아래 "에러 code" 열은 그 외만.
응답은 기존 규약 `{success:true, content:<아래>}`(Controller 가 `{content}` 로 감싸고 `invokeApproval` 이 푼다). **아래 shape 은 전부 `content`.** 시각은 epoch ms(number).

> **값 표현(`FieldValue`)** — 서버·화면·DB 가 같은 정규형을 쓴다(§3.3).
> `FieldValue = { value: string|null, display: string|null }`
> `value` 정규형: DATE `'YYYY-MM-DD'` · USER accountId · PRIORITY 우선순위 id(숫자 문자열) · NUMBER `String(Number(x))`(예 `'3'`, `'5.5'`) · SELECT 옵션 id(숫자 문자열). 비어 있음 = `null`.
> `display`: 표시 문구 스냅샷(사용자 표시 이름·우선순위 이름·옵션 값·날짜·숫자 원문). 화면은 USER 를 `value`(accountId)로 `PersonAvatar` 렌더하고 `display` 는 대체 문구로만 쓴다.
> `FieldType = 'DATE'|'USER'|'PRIORITY'|'NUMBER'|'SELECT'`

### 2.1 신규 resolver (`src/resolver/fieldChange/FieldChangeController.js` → `registerFieldChangeController`)

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueFieldChanges` | {issue:view} | `{issueId}` | `IssueFieldChangeView` §2.3. **부작용(지연 판정)**: 결재 중 요청의 from ≠ 조회자 asUser 로 읽은 현재 값이면 그 자리에서 만료(`FIELD_CHANGED`) — 값을 못 읽으면(필드 없음) 건너뜀 | `INVALID_TARGET` | issue 엔트리 `FieldChangeSection`, modal 종류 선택(overview) |
| `getFieldChangeForm` | {issue:view} | `{issueId, fieldId}` | `FieldChangeForm` §2.4 | `INVALID_TARGET`, `FIELD_CHANGE_RULE_NOT_FOUND`, `FIELD_CHANGE_PROJECT_DISABLED`, `FIELD_CHANGE_FIELD_UNAVAILABLE`(이 이슈에 그 필드가 없음·읽을 수 없음), `FIELD_CHANGE_UNSUPPORTED_FIELD`(규칙 저장 뒤 필드 유형이 바뀜) | modal `FieldChangeRequestForm` |
| `searchFieldChangeUsers` | {issue:view} | `{issueId, fieldId, query:string(2~80)}` | `{users:[{accountId, displayName, avatarUrl:string\|null}]}` 최대 20 — 담당자는 "배정 가능 사용자", 그 외 사용자 필드는 사용자 검색 | `INVALID_TARGET`(USER 유형 규칙 필드가 아님), `FIELD_CHANGE_RULE_NOT_FOUND` | `FieldChangeValueInput`(USER) |
| `createFieldChangeApproval` | {issue:view} + 서비스가 규칙·프로젝트·필드·값 확인 | `{issueId, fieldId, value:string\|null, requestMessage:string(1~500, Q96 필수), expiresAt?:number, ccKeys?:string[]≤50}` — **`steps`·`flowId`·`supersedes` 는 받지 않는다**(Q97) | `{requestId, status:'PENDING', currentStepOrder:1, fieldId, state:'PENDING'}` | `INVALID_TARGET`, `FIELD_CHANGE_RULE_NOT_FOUND`, `FIELD_CHANGE_PROJECT_DISABLED`, `FIELD_CHANGE_FIELD_UNAVAILABLE`, `FIELD_CHANGE_UNSUPPORTED_FIELD`, `FIELD_CHANGE_INVALID_VALUE`(형식·없는 사용자/우선순위/옵션·우선순위 비우기), `FIELD_CHANGE_NO_CHANGE`(새 값 = 현재 값), `FIELD_CHANGE_OPTIONS_UNAVAILABLE`(Q93), `FIELD_CHANGE_REASON_REQUIRED`, `FIELD_CHANGE_APPLY_IN_PROGRESS`(이전 승인이 지금 적용 중), `ALREADY_OPEN`, `INVALID_APPROVER_CONFIGURATION`, `APPROVER_NOT_REGISTERED`, `APPROVER_NO_ACCESS` | modal `FieldChangeRequestForm` |
| `applyFieldChange` | SELF + 서비스: 대상 열람 + (요청자 \| 이 요청의 결재자(위임 결정자 포함) \| Jira 관리자) | `{requestId}` | `{requestId, apply: FieldApplyResult}` §2.5. 이미 APPLIED 면 **성공**으로 같은 결과(`already:true`) — 멱등 | `REQUEST_NOT_FOUND`, `FIELD_CHANGE_NOT_APPLICABLE`(승인 상태가 아님·CONFLICT·SUPERSEDED·FIELD_CHANGE 요청이 아님), `FIELD_CHANGE_APPLY_IN_PROGRESS` | modal `FieldChangeTargetHeader`([다시 적용]), issue 엔트리 행 버튼 |
| `listFieldChangeRules` | {project:admin} | `{projectId}` | `FieldChangeRulesView` §2.6 | `INVALID_TARGET` | projectSettings `FieldChangeRuleSettings` |
| `saveFieldChangeRule` | {project:admin} + 서비스가 규칙 project_id = payload projectId 확인 | `{projectId, ruleId?, issueTypeId:string('*'=전체), fieldId:string, flowId:string, enabled:boolean, rev?:number(수정 시 필수)}` | `{rule: FieldChangeRule}` | `INVALID_TARGET`(이 프로젝트 유형이 아님·다른 프로젝트 ruleId·필드 없음), `FIELD_CHANGE_UNSUPPORTED_FIELD`(cause `{reason}` §3.2), `FIELD_CHANGE_RULE_CONFLICT`(cause `{ruleId}`), `INVALID_APPROVER_CONFIGURATION`, `CONCURRENT_MODIFICATION` | projectSettings `FieldChangeRuleFormModal` |
| `deleteFieldChangeRule` | {project:admin} + 소속 확인 | `{projectId, ruleId, rev}` | `{ruleId, deleted:true, openCount:number}` — 열린 요청·미적용 승인은 그대로(결재선·적용은 요청 시 고정) | `INVALID_TARGET`, `CONCURRENT_MODIFICATION` | projectSettings |

### 2.2 변경 resolver

| resolver | 권한 축 | 변경 | 소비 화면 |
|---|---|---|---|
| `decideApproval` | SELF (무변경) | FIELD_CHANGE: (1) 결정 직전 `beforeDecide` — from ≠ 현재 값이면 요청 만료 + **`FIELD_CHANGE_CONFLICT`**(cause `{requestId}`). (2) **응답에 `apply` 키 추가** — FIELD_CHANGE 요청이면 항상 키가 있고, 최종 승인이면 `FieldApplyResult`, 아니면 `null`. 다른 종류 응답에는 키가 없다 | modal `DecisionForm`(결과 안내), inbox |
| `bulkApprove` | SELF | `results[]` 항목에 **`applyStatus?: ApplyStatus`**(FIELD_CHANGE 최종 승인 건만). 시간 예산(§4.5)을 넘긴 건은 `'WAITING'`(승인됨·적용 대기). 건별 `code` 에 `FIELD_CHANGE_CONFLICT` 가 나올 수 있다 | inbox 일괄 결과 |
| `getApprovalDetail` | SELF | FIELD_CHANGE 요청이면 `target` = `FieldChangeTargetView` §2.7. `approval` shape 무변경(`isStale=false`, `canResubmit=false`, `changeSinceRequest=null`). `canRequest` = 최신 요청이 결재 중이 아니고 규칙·프로젝트 사용 | modal `ApprovalDetail` 헤더 분기 |
| `getApprovalHistory` | SELF | 무변경. `events[].eventType` 에 `FIELD_APPLIED`(`actorKey`=적용자, `reason`=`'WRITE'\|'ALREADY'`)·`APPLY_FAILED`(`reason`=실패 코드)·`APPLY_CONFLICT`·`CHANGED_AFTER_APPROVAL`(`reason`=`'BYPASS'`, `actorKey`=직접 바꾼 사람 또는 null)이 나올 수 있다 | modal |
| `getApprovalCertificate` | SELF | FIELD_CHANGE: `target` = FieldChangeTargetView, **신규 선택 블록** `fieldChange:{fieldName, fieldType, from:FieldValue, to:FieldValue, applyStatus, appliedAt, appliedBy}` | modal `CertificateSheet` |
| `listInbox` | SELF | 행 **추가 필드** `fieldChange:{fieldId, fieldName, fieldType, from:FieldValue, to:FieldValue}\|null`(다른 종류 null). 가시성은 어댑터 `filterVisible` = 이슈 열람 `permissions/check` 일괄(불변식 7) | inbox `InboxTable`·엑셀 |
| `listNotifications` | SELF | 항목 추가 필드 `fieldChange`(위와 같음). templateKey 추가: `EXPIRED`+`FIELD_CHANGED` → `notification.template.fieldChangeConflict`, `EXPIRED`+`ISSUE_DELETED`+FIELD_CHANGE → `fieldChangeIssueDeleted`, `APPROVED`+FIELD_CHANGE(최종) → `fieldChangeApproved`, `APPLY_FAILED` → `fieldChangeApplyFailed`, `APPLY_CONFLICT` → `fieldChangeApplyConflict`, `CHANGED_AFTER_APPROVAL`+FIELD_CHANGE → `fieldChangeBypassed` | inbox `NotificationPanel` |
| `exportExpiredApprovals` | {admin} | `requests[]` 에 `fieldChange:{fieldId, fromValue, toValue, applyStatus, appliedAt}`(FIELD_CHANGE 행만) | settings |
| `getStorageUsage` | {admin} | 무변경(`information_schema` 자동 집계 — 새 테이블 3개가 저절로 보인다) | settings |

### 2.3 `IssueFieldChangeView` (getIssueFieldChanges)

```js
{
  issue: { issueId, issueKey, title, projectId, projectKey, issueTypeId },
  // 프로젝트 사용 && 이 이슈 유형에 걸린 활성 규칙이 하나 이상
  enabled: boolean,
  notEnabledReason: 'NO_RULE' | 'PROJECT_DISABLED' | null,
  fields: [{                                   // 이 이슈 유형에 걸린 규칙 필드(정확 유형 > '*'), 규칙 순서
    ruleId, fieldId, fieldName, fieldType,     // fieldName = 규칙 저장 시 스냅샷(Jira 이름이 우선이면 이번 응답의 editmeta/field 이름)
    current: FieldValue | null,                // null = 이 이슈에서 필드를 읽을 수 없음(필드 구성에서 숨김·유형 불일치)
    flowMissing: boolean,
    latest: FieldChangeSummary | null,         // 이 필드의 최신 요청
    state: FieldChangeState,                   // §3.7
    canRequest: boolean,                       // enabled && !flowMissing && current !== null && latest 가 PENDING·APPLYING 아님
    canApply: boolean,                         // latest.applyStatus ∈ {WAITING, FAILED} && 상태 APPROVED && 조회자가 요청자·결재자·Jira 관리자
  }],
  bypass: FieldBypassItem[],                   // 이 이슈의 최근 우회 기록 10건(최신순, 규칙 필드만)
  history: FieldChangeSummary[],               // 이 이슈의 최근 요청 10건(필드 무관, 최신순)
}

FieldChangeSummary = {
  requestId, status,                           // ApprovalStatus
  state,                                       // FieldChangeState
  fieldId, fieldName, fieldType,
  from: FieldValue, to: FieldValue,
  requesterKey, createdAt, updatedAt,
  currentStepOrder, stepCount, currentStepName,
  applyStatus: ApplyStatus,                    // 'WAITING'|'APPLYING'|'APPLIED'|'FAILED'|'CONFLICT'|'SUPERSEDED'
  applyCode: string|null,                      // FAILED 사유(§2.5) / CONFLICT 이면 null
  appliedAt: number|null, appliedBy: string|null,
  expiryReason: string|null,                   // EXPIRED 일 때 'FIELD_CHANGED'|'DEADLINE'|'ISSUE_DELETED'
}

FieldBypassItem = {
  bypassId,                                    // 결정적 id(§5.3)
  fieldId, fieldName,
  from: FieldValue, to: FieldValue,            // value 는 해석 못 하면 null, display 는 changelog 문자열
  actorKey: string|null,                       // 직접 바꾼 사람(이벤트에 없으면 null)
  occurredAt,                                  // 관측 시각(트리거 처리 시각)
  effect: 'NONE'|'EXPIRED_PENDING'|'OVERWROTE_APPLIED',
  requestId: string|null,                      // effect 가 NONE 이 아니면 그 요청
}
```

### 2.4 `FieldChangeForm` (getFieldChangeForm)

```js
{
  issue: { issueId, issueKey, title, projectId },
  field: { fieldId, fieldName, fieldType, clearable:boolean },     // PRIORITY 는 clearable=false
  current: FieldValue,
  options: [{ id, name, iconUrl:string|null }] | null,            // PRIORITY·SELECT 만. 그 외 null
  optionsSource: 'EDITMETA' | 'PRIORITY_LIST' | null,
  rule: { ruleId },
  flow: { flowId, name, defaultDeadlineDays:number|null,
          steps:[{stepOrder, stepName, requiredApprovals, principals:[{principalType, principalKey}]}] } | null,  // null = Flow 사라짐(요청 불가)
  pendingApprovedRequestId: string|null,       // 적용 안 된 이전 승인(WAITING·FAILED)이 있으면 그 id — 화면 경고 "새 요청 시 이전 승인은 적용되지 않습니다"
}
```

### 2.5 `FieldApplyResult` (decideApproval.apply · applyFieldChange.apply)

```js
{
  status: 'APPLIED' | 'FAILED' | 'CONFLICT' | 'WAITING' | 'APPLYING',
  already: boolean,              // APPLIED 이고 쓰지 않았음(현재 값이 이미 새 값 / 이미 적용된 요청 재호출)
  code: null | 'NO_PERMISSION' | 'NOT_EDITABLE' | 'ISSUE_NOT_FOUND' | 'VALUE_UNREADABLE' | 'REJECTED_BY_JIRA' | 'TIMEOUT' | 'BUDGET',
  current: FieldValue | null,    // CONFLICT 일 때 관측한 현재 값(그 외 null)
  appliedAt: number | null,
  appliedBy: string | null,      // 적용한 사람 accountId(asUser 주체)
  attempts: number,
}
```
- `FAILED.code`: `NO_PERMISSION`(Jira 403) · `NOT_EDITABLE`(Jira 400 — 화면에 없음·편집 불가 필드) · `ISSUE_NOT_FOUND`(404) · `VALUE_UNREADABLE`(적용 직전 현재 값을 못 읽음 — 맹목적으로 쓰지 않는다) · `REJECTED_BY_JIRA`(그 밖 4xx — 값 거부) · `TIMEOUT`(3초 상한, 적용 여부 불명 → 재시도가 "이미 새 값"으로 판정).
- `WAITING`+`BUDGET`: 일괄 승인 시간 예산 초과로 적용을 미룸(§4.5). `APPLYING`: 다른 호출이 적용 중(일괄 결과에서만 보일 수 있음).

### 2.6 `FieldChangeRulesView` (listFieldChangeRules)

```js
{
  project: { projectId, projectKey, name, style:'classic'|'next-gen'|null },
  projectEnabled: boolean,
  rules: FieldChangeRule[],
  issueTypes: [{ id, name, iconUrl:string|null }],
  fields: [{ fieldId, name, fieldType, custom:boolean }],      // 지원 유형만(§3.2), 이름순. team-managed 전용 필드는 이 프로젝트 것만
  unsupported: [{ fieldId, name, reason }],                    // 화면 안내용 대표 목록(최대 30) — "왜 안 보이나"
  flows: [{ flowId, name, enabled:true }],
}
FieldChangeRule = { ruleId, projectId, issueTypeId, issueTypeName:string|null, fieldId, fieldName:string|null,
                    fieldType, fieldMissing:boolean, flowId, flowName:string|null, flowMissing:boolean,
                    enabled, openCount:number, updatedAt, updatedBy:string|null, rev }
```

### 2.7 `FieldChangeTargetView` (getApprovalDetail·증명서의 `target`)

ISSUE TargetView 의 키를 모두 가진다(기존 소비 코드 무변경) + `fieldChange` 블록:
```js
{ kind:'FIELD_CHANGE', key:'<issueId>:<fieldId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null,
  fieldChange: { fieldId, fieldName, fieldType, from:FieldValue, to:FieldValue,
                 current: FieldValue|null,          // 상세 조회자 asUser 로 읽은 값, 실패 null
                 state: FieldChangeState, applyStatus, applyCode, appliedAt, appliedBy, attempts,
                 conflictValue: FieldValue|null,    // CONFLICT 때 관측값
                 applyRetryable: boolean } }        // 상태 기준(APPROVED && WAITING|FAILED). 권한은 서버가 applyFieldChange 에서 다시 확인
```

### 2.8 신규 에러 코드 (`ErrorCodes` + `locales/{kr,en}/error.json` 동시)

| code | 의미 | cause |
|---|---|---|
| `FIELD_CHANGE_RULE_NOT_FOUND` | 이 필드에 변경 승인 규칙이 없음(바로 편집하면 된다) | — |
| `FIELD_CHANGE_PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않음 | — |
| `FIELD_CHANGE_FIELD_UNAVAILABLE` | 이 이슈에서 그 필드를 읽을 수 없음 | — |
| `FIELD_CHANGE_UNSUPPORTED_FIELD` | 지원하지 않는 필드 유형 | `{reason}` (§3.2) |
| `FIELD_CHANGE_INVALID_VALUE` | 새 값 형식이 틀리거나 존재하지 않음 | — |
| `FIELD_CHANGE_NO_CHANGE` | 새 값이 현재 값과 같음 | — |
| `FIELD_CHANGE_OPTIONS_UNAVAILABLE` | 선택지를 불러올 수 없어 요청 불가(Q93) | — |
| `FIELD_CHANGE_REASON_REQUIRED` | 사유가 비었음(Q96) | — |
| `FIELD_CHANGE_CONFLICT` | 요청 이후 필드 값이 바뀌어 요청이 만료됨 | `{requestId}` |
| `FIELD_CHANGE_NOT_APPLICABLE` | 적용할 수 없는 요청(승인 전·충돌·대체됨) | `{applyStatus}` |
| `FIELD_CHANGE_APPLY_IN_PROGRESS` | 다른 적용이 진행 중 | `{requestId}` |
| `FIELD_CHANGE_RULE_CONFLICT` | 같은 (프로젝트·유형·필드) 규칙이 이미 있음 | `{ruleId}` |

### 2.9 프론트 호출 대응

| 프론트 호출 | 위치 | 쿼리키 / 무효화 |
|---|---|---|
| `getIssueFieldChanges({issueId})` | `features/fieldChange/FieldChangeSection.jsx` | `fieldChangeKeys.issue(issueId)` |
| `getFieldChangeForm({issueId, fieldId})` | `FieldChangeRequestForm.jsx` | `fieldChangeKeys.form(issueId, fieldId)` (staleTime 0) |
| `searchFieldChangeUsers({...})` | `FieldChangeValueInput.jsx` (USER) | `fieldChangeKeys.users(issueId, fieldId, query)` |
| `createFieldChangeApproval({...})` | `FieldChangeRequestForm.jsx` | 성공 시 `fieldChangeKeys.issue(issueId)`·`approvalKeys.all` 무효화, 모달 `close({changed:true, issueId})` |
| `applyFieldChange({requestId})` | `FieldChangeTargetHeader.jsx`, `FieldChangeSection` 행 | `fieldChangeKeys.all`·`approvalKeys.detail(requestId)` 무효화 |
| `decideApproval` | 기존 `DecisionForm` | 응답 `apply` 가 있으면 결과 안내(§7.2) + `fieldChangeKeys.all` 무효화 |
| `listFieldChangeRules` / `saveFieldChangeRule` / `deleteFieldChangeRule` | `FieldChangeRuleSettings.jsx` / `FieldChangeRuleFormModal.jsx` | `fieldChangeKeys.rules(projectId)` |

에러 분기(`error.code`): `FIELD_CHANGE_CONFLICT` → 상세 재조회 + 안내, `ALREADY_OPEN`·`FIELD_CHANGE_NO_CHANGE` → `fieldChangeKeys.issue` 재조회, `FIELD_CHANGE_APPLY_IN_PROGRESS` → 2초 뒤 재조회, 나머지 `t('error.'+code)`.

---

## 3. 도메인 (순수 — `src/domain/fieldChange/**`, `Date.now()` 금지, 입력 불변)

### 3.1 `src/domain/approval/` 추가분 (기존 값·함수 무변경)

| 파일 | 추가 |
|---|---|
| `constants.js` | `TargetKind.FIELD_CHANGE='FIELD_CHANGE'`, `ExpiryReason.FIELD_CHANGED`, `EventType.FIELD_APPLIED`·`APPLY_FAILED`·`APPLY_CONFLICT`(감사 전용 — derive 무영향, CONSUMED 와 같은 성격). `TargetKind` 주석에 "FIELD_CHANGE 는 (issueId, fieldId) — FieldChangeTargetAdapter" 한 줄 |
| `scopeKey.js` | `SCOPE_PREFIX[FIELD_CHANGE]='FIELD_CHANGE'`, 빌더 `({issueId, fieldId}) => NUMERIC_ID(issueId) && FIELD_ID(fieldId) ? \`${issueId}:${fieldId}\` : null`, `FIELD_ID = /^(?:[a-z][a-z0-9]{0,31}\|customfield_\d{1,12})$/`. 역파서 `fieldChangeTargetFromKey(key)`(`':'` 하나). 예약 형식 주석에 `FIELD_CHANGE:{issueId}:{fieldId}` 추가 |
| `transitions.js` | `TARGET_CHANGE_REASONS` 에 `ExpiryReason.FIELD_CHANGED` 추가 — `expireByTargetChange` 재사용(이벤트 id discriminator `FIELD_CHANGED:{contentVersion}` → 트리거·지연 판정·결정 경로가 겹쳐도 1건) |

테스트(추가만): FIELD_CHANGE 키 왕복, `'10001:3'`(숫자 둘)·`'10001:Due Date'`·`'10001:customfield_x'` 거부, `expireByTargetChange(FIELD_CHANGED)` PENDING→EXPIRED·같은 입력 같은 id. **기존 테스트 무변경 통과.**

### 3.2 `fieldType.js` — 지원 필드 한정

```js
export const FieldType = Object.freeze({ DATE, USER, PRIORITY, NUMBER, SELECT });
export const UnsupportedReason = Object.freeze({ MULTI_VALUE, RICH_TEXT, TEXT, DATETIME, CASCADING, WORKFLOW_FIELD, SYSTEM_RESTRICTED, UNKNOWN });
/** Jira field 정의(GET /rest/api/3/field 원소 또는 editmeta 항목)의 {id, schema} → {type} | {type:null, reason} */
export const classifyField = ({ id, schema }) => ...;
export const isClearable = (type) => type !== FieldType.PRIORITY;
```

| 판정 | 조건 | 결과 |
|---|---|---|
| 시스템 허용 | `id ∈ {duedate}` / `{assignee, reporter}` / `{priority}` | DATE / USER / PRIORITY |
| 시스템 금지 | `status`·`resolution`(전환 승인의 몫) | `WORKFLOW_FIELD` |
| 시스템 금지 | 그 밖 시스템 필드(summary·description·labels·components·fixVersions·timetracking·issuetype·parent …) | 각각 `TEXT`·`RICH_TEXT`·`MULTI_VALUE`·`SYSTEM_RESTRICTED` |
| 사용자 정의 | `schema.type` `'date'` / `'user'` / `'number'` / `'option'` | DATE / USER / NUMBER / SELECT |
| 사용자 정의 금지 | `'array'` | `MULTI_VALUE` |
| | `'datetime'` | `DATETIME` |
| | `'option-with-child'` | `CASCADING` |
| | `'string'`(textarea 포함) | `TEXT` 또는 `RICH_TEXT`(`schema.custom` 이 textarea) |
| | 그 외 | `UNKNOWN` |

**범위 밖과 이유**(요구 1):
- 다중값(라벨·구성 요소·버전·다중 선택·다중 사용자): "이전 → 새" 가 집합 차이라 충돌 판정이 "같은 집합인가" 하나로 끝나지 않는다(다른 사람이 항목 하나만 더한 것을 충돌로 볼지). 적용도 `set` 이냐 `add/remove` 냐에 따라 다른 사람의 변경을 지운다.
- 리치텍스트·여러 줄 텍스트(설명·textarea): ADF 동등성 판정이 불안정하고(공백·마크 순서), 값이 커서 스냅샷·감사·알림에 싣기 부적절. 표시 "이전 → 새" 가 의미를 잃는다.
- 한 줄 텍스트(요약·text field): 기술적으로 가능하나 1차 요구 목록 밖. 다음 회차 후보(값 255자 제한·로그 금지 규칙만 지키면 된다).
- 날짜+시간: Jira 가 사용자 타임존으로 표시·저장 형식이 달라(`+0900`) 정규형 비교를 실측 없이 확정할 수 없다(C11).
- 계단식 선택: 부모·자식 두 값.

테스트: 표의 모든 행 + `schema` 없음 → UNKNOWN.

### 3.3 `fieldValue.js` — 정규형·입력 검증·Jira 본문

```js
/** Jira GET issue 의 fields[fieldId] 원값 → FieldValue{value, display}. 해석 불가면 {value:null, display:null, known:false} */
export const fromIssueField = (type, raw) => ({ value, display, known });
/** 요청 payload.value → 정규형 value. 형식 불량 → null 반환 + ok:false. null 입력은 clearable 일 때만 ok */
export const parseInput = (type, input) => ({ ok, value });
/** changelog item {from, fromString, to, toString} → {from:FieldValue, to:FieldValue, known:boolean} */
export const fromChangelogItem = (type, item) => ...;
/** PUT /issue 본문의 fields 조각 */
export const toJiraField = (type, value) => ...;   // DATE 'YYYY-MM-DD'|null · USER {accountId}|null · PRIORITY {id} · NUMBER Number|null · SELECT {id}|null
export const sameValue = (a, b) => boolean;        // 정규형 문자열 비교(null 끼리 같음)
```

| 유형 | `fromIssueField` raw | `parseInput` 규칙 | changelog 해석(미검증 C3) |
|---|---|---|---|
| DATE | `'2026-10-10'` | `^\d{4}-\d{2}-\d{2}$` + 달력상 유효 | `to` 앞 10자가 날짜 형식이면 그것, 아니면 `toString` 앞 10자, 둘 다 아니면 unknown |
| USER | `{accountId, displayName}` \| null | accountId `^[A-Za-z0-9:_-]{1,128}$` | `to`(accountId) |
| PRIORITY | `{id, name}` | `^\d{1,18}$`, null 불가 | `to`(id) |
| NUMBER | number \| null | `Number.isFinite`, `|x| < 1e15`, 정규형 `String(Number(x))` | `to` 또는 `toString` 을 Number 로 |
| SELECT | `{id, value}` \| null | `^\d{1,18}$` | `to`(옵션 id). 없으면 unknown(`toString` 은 display 로만) |

테스트: 유형별 정상·경계·불량, `sameValue('3','3')`, NUMBER `'3.0'`→`'3'`, USER null(담당자 해제), PRIORITY null 거부, changelog unknown 경로.

### 3.4 `applyPlan.js` — 적용 판정 표 (멱등의 핵심)

```js
/**
 * @param {{ from:string|null, to:string|null, current:{known:boolean, value:string|null} }} input
 * @returns {'WRITE'|'ALREADY'|'CONFLICT'|'UNREADABLE'}
 */
export const planApply = ({ from, to, current }) => ...;
```

| # | 조건 | 결과 | 뜻 |
|---|---|---|---|
| 1 | `!current.known` | `UNREADABLE` | 현재 값을 모른 채 쓰지 않는다 → FAILED(`VALUE_UNREADABLE`) |
| 2 | `sameValue(current, to)` | `ALREADY` | 이미 새 값 — 앞선 시도가 PUT 뒤 기록 전에 죽었거나 누가 같은 값으로 바꿨다. **쓰지 않고 APPLIED** |
| 3 | `sameValue(current, from)` | `WRITE` | PUT |
| 4 | 그 외 | `CONFLICT` | 조용히 덮어쓰지 않는다(요구 4) |

순서가 중요하다: 2 를 3 보다 먼저 본다 — from 과 to 가 같을 수는 없으므로(요청 생성 시 `FIELD_CHANGE_NO_CHANGE`) 충돌은 없지만, 재시도 멱등이 2 에 기댄다. 테스트: 4행 + 재시도 시나리오(1회차 WRITE → 2회차 같은 입력에 current=to → ALREADY).

```js
/** 적용 상태 전이 — SQL 의 조건부 UPDATE 와 같은 표를 순수로 둔다(서비스·테스트 공용) */
export const APPLY_CLAIM_TTL_MS = 60_000;
export const canClaim = ({ applyStatus, claimedAt, now }) =>
  applyStatus === 'WAITING' || applyStatus === 'FAILED'
  || (applyStatus === 'APPLYING' && claimedAt !== null && now - claimedAt > APPLY_CLAIM_TTL_MS);
export const outcomeStatus = (plan, putResult) => 'APPLIED'|'FAILED'|'CONFLICT';
export const failureCode = (httpStatus, { timedOut }) => 'NO_PERMISSION'|'NOT_EDITABLE'|'ISSUE_NOT_FOUND'|'REJECTED_BY_JIRA'|'TIMEOUT';
```
`failureCode`: 403→NO_PERMISSION, 400→NOT_EDITABLE(본문 확인 안 함 — 응답 본문은 로그·응답에 싣지 않는 규칙), 404→ISSUE_NOT_FOUND, 그 밖 4xx→REJECTED_BY_JIRA, timedOut→TIMEOUT, 5xx/네트워크→REJECTED_BY_JIRA 대신 **TIMEOUT 과 같은 "불명" 취급**(재시도 시 2행이 가린다). 400 의 의미(화면 밖 vs 값 거부)는 C5 실측 후 세분화.

### 3.5 `rule.js`

```js
export const ANY_ISSUE_TYPE = '*';
export const normalizeRuleKey = ({ projectId, issueTypeId, fieldId }) => ({...}|null);   // 숫자 id·'*'·FIELD_ID
/** 정확 유형 > '*'. enabled 만. 같은 필드 하나 */
export const matchRule = (rules, { projectId, issueTypeId, fieldId }) => rule|null;
/** 이슈 유형에 걸린 규칙 필드 목록(필드별 하나, 정확 유형 우선) */
export const rulesForIssue = (rules, { projectId, issueTypeId }) => rule[];
```
전환 `src/domain/transition/rule.js` 와 모양이 같지만 키가 다르다(목적 상태 vs 필드). 공용화는 하지 않는다 — 두 규칙이 서로 다른 이유로 바뀔 수 있고, 공용 함수에 키 이름을 인자로 넘기면 오히려 읽기 어렵다.

### 3.6 `eventClassify.js` — 우리 적용 vs 우회 (트리거 판정, 순수)

```js
/**
 * @param {{
 *   item: {from:FieldValue, to:FieldValue, known:boolean},     // fromChangelogItem 결과
 *   actorAccountId: string|null,
 *   observedAt: number,
 *   latest: null | { requestId, status, applyStatus, from, to, applyClaimedAt:number|null, appliedAt:number|null, appliedBy:string|null },
 * }} input
 * @returns {{ kind:'OURS'|'BYPASS', effect:'NONE'|'EXPIRE_PENDING'|'OVERWROTE_APPLIED' }}
 */
export const classifyFieldEvent = (input) => ...;
export const OURS_WINDOW_MS = 5 * 60_000;
```

| # | 조건 | 결과 |
|---|---|---|
| 1 | `latest.applyStatus ∈ {APPLYING, APPLIED}` && `item.known` && `sameValue(item.to, latest.to)` && 관측 시각이 claim/적용 시각 ±`OURS_WINDOW_MS` 안 | `OURS` / NONE |
| 2 | `latest.applyStatus ∈ {APPLYING, APPLIED}` && `!item.known` && `actorAccountId` 가 있고 `= latest.appliedBy`(APPLYING 이면 claim 한 사람) && 창 안 | `OURS` / NONE — 값 형식을 못 읽어도 행위자·시각으로 우리 적용을 알아본다 |
| 3 | `latest.status === PENDING` | `BYPASS` / `EXPIRE_PENDING` |
| 4 | `latest.status === APPROVED` && `latest.applyStatus === APPLIED` && (`!item.known` 또는 `!sameValue(item.to, latest.to)`) | `BYPASS` / `OVERWROTE_APPLIED` |
| 5 | 그 외(요청 없음·반려·만료·회수·적용 대기/실패/충돌) | `BYPASS` / NONE |

"창" 이 필요한 이유: 앱이 적용한 뒤 몇 주 지나 누가 같은 값으로 다시 바꾸는 것(되돌렸다가 다시 설정)은 우회다. 행위자가 같다는 것만으로는 부족하다 — 결재자가 직접 편집한 것도 우회다(2행은 값을 못 읽을 때만의 보조 규칙). 테스트: 5행 + 창 경계 + 행위자 없음 + APPLYING 중 이벤트 선착(PUT 응답보다 트리거가 먼저).

### 3.7 `state.js` — 화면 상태(파생, 저장하지 않음)

```js
export const fieldChangeState = ({ status, applyStatus, expiryReason }) =>
  'NONE'          // 요청 없음(서비스가 붙임)
| 'PENDING'       // 결재 중
| 'APPLYING'      // APPROVED + APPLYING
| 'APPLIED'       // APPROVED + APPLIED
| 'APPLY_FAILED'  // APPROVED + FAILED  또는 WAITING(일괄 예산 초과) — 둘 다 "다시 적용" 대상
| 'CONFLICT'      // APPROVED + CONFLICT  또는 EXPIRED + FIELD_CHANGED
| 'SUPERSEDED'    // APPROVED + SUPERSEDED (새 요청이 와서 이 승인은 적용되지 않음)
| 'REJECTED'
| 'CLOSED';       // 그 밖 EXPIRED·CANCELLED
```
테스트: 조합 전부.

### 3.8 ISSUE / TRANSITION / FIELD_CHANGE 가 섞이지 않는 근거 (issue-approval §3.4 확장)

| 층 | 근거 |
|---|---|
| 열린 요청 하나 | `open:ISSUE:{id}` · `open:TRANSITION:{id}:{숫자}` · `open:FIELD_CHANGE:{id}:{필드}`. 접두가 다르고, FIELD_CHANGE 빌더는 둘째 값이 숫자만이면 거부(시스템 필드 id 는 소문자로 시작, 사용자 정의는 `customfield_`) → 키 공간이 겹치지 않는다 |
| 최신 요청 조회 | `findLatestRequestId` 가 `target_kind`·`target_key` 를 둘 다 묶는다. 필드 요약은 `field_change_request` 부속 행 JOIN 이라 다른 종류 요청은 구조적으로 안 나온다 |
| 상세·결정 | `targetRegistry.get(state.targetKind)` — FIELD_CHANGE 요청에만 필드 `beforeDecide`·`afterDecide` 가 붙는다 |
| 트리거 | 전환 처리 = 상태 항목만, 일반 승인 = 삭제만, 필드 처리 = 규칙 필드 항목만(`status`·`resolution` 은 §3.2 에서 규칙 불가). 세 처리 각자 try/catch |
| 화면 | 세 칸이 서로 다른 resolver·쿼리키(`approvalKeys.issue`·`transitionKeys.issue`·`fieldChangeKeys.issue`) |
| 재상신 | `createFieldChangeApproval` 은 `supersedes` 를 받지 않는다. 일반 승인 재상신에 FIELD_CHANGE requestId 를 넘기면 엔진 `supersede` 가 종류 불일치로 `INVALID_TARGET` |

---

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/fieldChange/{fieldType,fieldValue,applyPlan,eventClassify,rule,state}.js   (+ __test__)
src/resolver/fieldChange/
  FieldChangeController.js        registerFieldChangeController — 8개 guardedDefine
  FieldChangeService.js           조회·폼·사용자 검색·생성·규칙 CRUD
  FieldChangeApplier.js           적용(claim → 현재 값 → 판정 → PUT → 기록 → 감사·알림) — afterDecide·applyFieldChange 공용
  FieldChangeEventService.js      트리거·지연 판정(우회 기록·대기 만료·적용값 덮어쓰기 감사), 이슈 삭제 만료
  FieldChangeRuleRepository.js    field_change_rule CRUD(CAS rev) · findForProject · findByFieldIds
  FieldChangeRepository.js        field_change_request 부속 행 · claim/finish(fencing) · supersedeOlder · 목록 · 표시 보강
  FieldBypassRepository.js        field_change_bypass INSERT IGNORE · 이슈별 최근
  IssueFieldReader.js             asUser 전용: 이슈+필드 값 · editmeta · field 목록 · priority 목록 · 사용자 검색/조회 · PUT
src/resolver/approval/target/FieldChangeTargetAdapter.js
src/trigger/onIssueChanged.js     변경: 세 번째 try/catch
```
`IssueFieldReader` 는 **asUser 만** 쓴다(asApp import 없음 — 검증자가 grep 으로 확인).

### 4.2 엔진 변경 (ApprovalService) — 상태 머신 무변경

1. **선택 훅 `afterDecide`** (`decideApproval`, 결정 기록·앱 알림 뒤, `notifyExternal` 앞):
   ```js
   let effect;
   if (typeof adapter.afterDecide === 'function') {
     effect = await Promise.resolve()
       .then(() => adapter.afterDecide(result, { principal, decision, now, bulk, budget }))
       .catch((error) => { console.error('[APPROVAL] afterDecide failed', String(error?.code ?? error?.name ?? 'Error')); return null; });
   }
   return { requestId, status: result.status, currentStepOrder: result.currentStepOrder,
            ...(typeof adapter.afterDecide === 'function' ? { apply: effect?.apply ?? null } : {}) };
   ```
   - **결정 응답을 실패로 뒤집지 않는다**(승인은 이미 기록됨). 훅이 없는 종류는 응답 키가 늘지 않는다 — 기존 테스트 무영향.
   - `budget`: `bulkApprove` 가 시작 시각을 잡아 `{ startedAt, limitMs: 15_000 }` 을 넘긴다(아래 §4.5). 단건 결정은 `null`.
   - 응답 키 이름이 `apply` 로 대상 특정적인 이유: 지금 이 훅의 소비자는 필드 변경 하나다. 두 번째 소비자가 생기면 `effect` 로 일반화(계약 변경 이력에 남김).
2. **`bulkApprove`** — `decideApproval(..., { skipPin:true, bulk:true, budget })` 로 넘기고, 결과 `result.apply` 가 있으면 `results.push({..., applyStatus: result.apply?.status ?? null})`.
3. `beforeDecide`·`expireForTarget`·`describe(target,{state})`·`certificateKey`·`notifyExternal` — 기존 그대로 사용(전환 승인이 만든 훅). 필드 어댑터는 `notifyExternal` 을 두지 않는다(Jira 코멘트 없음 — 일반 승인 Q83 과 같은 이유, 적용 결과는 Jira 이력에 남는다).

영향받는 기존 테스트: 없음(훅 없는 어댑터는 키 없음). 신규: `ApprovalServiceFieldHooks.test.js` — 훅 호출 시점(APPROVED 최종/중간/REJECT 모두 호출되고 어댑터가 판단), 훅 throw 해도 결정 응답 성공, 응답 `apply` 키 유무, 일괄 budget 전달.

### 4.3 요청 생성 (`FieldChangeService.createFieldChangeApproval`)

```
1. target = parse {issueId, fieldId}  (형식 불량 INVALID_TARGET)
2. requestMessage 공백 제거 후 비면 FIELD_CHANGE_REASON_REQUIRED (Q96)
3. issue = reader.issueWithFields(issueId, [fieldId])   — asUser GET issue/{id}?fields=summary,project,issuetype,{fieldId}  (1콜)
   못 보면 INVALID_TARGET
4. isProjectEnabled(projectId) false → FIELD_CHANGE_PROJECT_DISABLED (projectEnablement 재사용)
5. rule = matchRule(ruleRepo.findForProject(projectId), {projectId, issueTypeId, fieldId}) 없으면 FIELD_CHANGE_RULE_NOT_FOUND
6. issue.fields 에 fieldId 키가 없으면 FIELD_CHANGE_FIELD_UNAVAILABLE.  current = fromIssueField(rule.fieldType, raw) — known=false 면 FIELD_CHANGE_FIELD_UNAVAILABLE
7. 이전 승인 확인: repo.findLatestForField(issueId, fieldId)
     applyStatus === 'APPLYING' && 미경과(TTL) → FIELD_CHANGE_APPLY_IN_PROGRESS {requestId}
8. 새 값: parsed = parseInput(type, payload.value) — ok 아니면 FIELD_CHANGE_INVALID_VALUE
   sameValue(parsed, current) → FIELD_CHANGE_NO_CHANGE
   존재 확인·표시 이름(1콜):
     USER     reader.user(accountId)                     없음 → INVALID_VALUE   (null = 해제는 호출 없음)
     PRIORITY editmeta allowedValues 에 있으면 그 이름 / 없으면 reader.priority(id)  없음 → INVALID_VALUE
     SELECT   editmeta allowedValues 에서 id → value. editmeta 에 필드 없음 → FIELD_CHANGE_OPTIONS_UNAVAILABLE(Q93) / id 없음 → INVALID_VALUE
     DATE·NUMBER 호출 없음(display = value)
9. Flow → 결재선: flowService.getFlowForRequest(rule.flowId, projectId) (없으면 INVALID_APPROVER_CONFIGURATION) → rawSteps → approvalService.expandRequestedSteps
10. requestId = uuid(); repo.insertDraft({requestId, issueId, projectId, issueTypeId, ruleId, fieldId, fieldType, fieldName,
        fromValue, fromDisplay, toValue, toDisplay, now})          ← 부속 행 먼저(전환과 같은 순서), apply_status='WAITING'
11. approvalService.createForTarget(request(payload 는 requestMessage·expiresAt·ccKeys·flowId 만), {adapter, target, requestId, resolvedSteps, snapshot,
        expiresAt: payload 또는 flow.defaultDeadlineDays})
    실패(ALREADY_OPEN 등) → repo.deleteOrphan(requestId) best-effort 후 재throw
12. repo.supersedeOlder(issueId, fieldId, requestId)
    UPDATE field_change_request SET apply_status='SUPERSEDED', rev=rev+1
     WHERE issue_id=? AND field_id=? AND request_id<>UUID_TO_BIN(?) AND apply_status IN ('WAITING','FAILED')
    — 같은 필드에 "적용될 수 있는 승인"이 둘 남지 않게(오래된 승인이 나중에 적용돼 새 요청의 from 을 깨는 것 방지). 결재 중이던
      이전 요청은 dedupe 가 이미 막았으므로 대상은 APPROVED 미적용뿐. 실패해도 삼킨다 — 적용 시 "최신 요청인가" 확인(§4.5-2)이 2차 방어선
13. 응답 {requestId, status, currentStepOrder, fieldId, state:'PENDING'}
```
결재선 자격 검사(`assertApproversAllowed` — 명부·결재자 이슈 열람)는 엔진 그대로 돈다(`skipRegistryCheck` 쓰지 않음, 전환과 같음).
**스냅샷 시점 = 요청자 asUser 로 읽은 값**(요구 2). 결재자의 열람 범위와 다를 수 있는 값이 아니다 — Jira Cloud 는 필드 단위 열람 보안이 없고(이슈 보안 수준은 이슈 단위), 결재자는 이슈 열람이 확인된 사람이다.

### 4.4 충돌 판정 지점 3곳 (요구 4)

| 지점 | 언제 | 누구의 asUser | 다르면 |
|---|---|---|---|
| **결정 직전** `beforeDecide` | 모든 단계의 승인·반려 직전(엔진이 PENDING 일 때만 부름) | 결재자 | `expireForTarget(FIELD_CHANGED)` + `FIELD_CHANGE_CONFLICT`. 값을 못 읽으면 `null`(건너뜀 — 적용 직전이 최종 방어선) |
| **적용 직전** `FieldChangeApplier` | 최종 승인 직후·다시 적용 | 적용자 | `CONFLICT` — 승인은 APPROVED 그대로(종료 상태에서 나가는 전이 없음), 부속 행 `apply_status='CONFLICT'` + `APPLY_CONFLICT` 감사 + 알림. **쓰지 않는다** |
| **지연 판정** | 이슈 화면 조회(`getIssueFieldChanges`), 트리거 | 조회자 / (트리거는 Jira 호출 없음 — changelog 값) | 결재 중이면 만료(FIELD_CHANGED) |

요구 4 의 "적용 직전 … 요청을 만료" 는 결재 중인 요청에 대해 **결정 직전(마지막 단계 포함)** 에서 만료로 충족한다. 최종 승인이 기록된 **뒤의 아주 짧은 틈**(결정 CAS 와 PUT 사이)에 바뀐 경우만 만료 대신 `CONFLICT` 로 남는다 — APPROVED 를 EXPIRED 로 되돌리려면 상태 머신의 "종료 상태 불변" 계약을 깨야 하기 때문이다(엔진 변경 최소 원칙). 화면은 두 경우 모두 `state:'CONFLICT'` 로 같게 보인다(§3.7).

**결정 전에 적용하지 않는 이유**: 적용 → 결정 순서면 결정 CAS 가 실패(동시 결정·만료)했을 때 승인 없는 변경이 Jira 에 남는다. "결정이 진실"(불변식 2) — 적용은 그 결과다.

### 4.5 적용 (`FieldChangeApplier.apply(requestId, {principal, now, source:'DECIDE'|'RETRY', budget})`)

```
0. (afterDecide 경로) result.status !== APPROVED → return {apply:null}.  budget 이 있고 now - startedAt > limitMs → 적용하지 않고 {status:'WAITING', code:'BUDGET'}
1. row = repo.findByRequestId(requestId);  state = approvals.load(requestId)
   state.status !== APPROVED 또는 row.applyStatus ∈ {CONFLICT, SUPERSEDED} → (RETRY) FIELD_CHANGE_NOT_APPLICABLE {applyStatus}
   row.applyStatus === APPLIED → return 결과(already:true)                                   ← 재호출 멱등
2. 최신 확인: repo.findLatestForField(issueId, fieldId).requestId !== requestId → supersede 처리 후 NOT_APPLICABLE(SUPERSEDED)
3. claim (fencing token = uuid):
   UPDATE field_change_request
      SET apply_status='APPLYING', apply_token=?, apply_claimed_at=?, apply_claimed_by=?, apply_attempts=apply_attempts+1, rev=rev+1
    WHERE request_id=UUID_TO_BIN(?)
      AND (apply_status IN ('WAITING','FAILED') OR (apply_status='APPLYING' AND apply_claimed_at < ?))   -- now - TTL
   rowsAffected 0 → 다시 읽어 APPLIED 면 already 결과 / APPLYING 이면 FIELD_CHANGE_APPLY_IN_PROGRESS(RETRY) 또는 {status:'APPLYING'}(DECIDE)
4. current = reader.issueWithFields(issueId, [fieldId]) (asUser 적용자, 3초) → fromIssueField
5. plan = planApply({from, to, current})
   WRITE    → reader.updateField(issueId, toJiraField(type, to))  — asUser PUT /rest/api/3/issue/{id} (3초, notifyUsers 기본)
              204 → APPLIED(reason 'WRITE') / 실패 → FAILED(failureCode)
   ALREADY  → APPLIED(reason 'ALREADY')
   CONFLICT → CONFLICT(conflict_value = current)
   UNREADABLE → FAILED('VALUE_UNREADABLE')
6. finish (fencing): UPDATE … SET apply_status=?, applied_at=?, applied_by=?, apply_mode='USER', apply_code=?, conflict_value=?, conflict_display=?,
                       rev=rev+1  WHERE request_id=UUID_TO_BIN(?) AND apply_token=?
   rowsAffected 0 = 그 사이 TTL 이 지나 다른 호출이 가져감 → 기록하지 않는다(그쪽이 같은 판정을 한다)
7. 감사 이벤트(결정적 id): APPLIED → FIELD_APPLIED disc 'FIELD_APPLIED'(한 번) · FAILED → APPLY_FAILED disc `APPLY_FAILED:{attempts}` · CONFLICT → APPLY_CONFLICT disc 'APPLY_CONFLICT'
8. 알림(background): FAILED·CONFLICT → 요청자 + 승인한 결재자(행위자 제외). APPLIED 는 추가 알림 없음(APPROVED 알림 `fieldChangeApproved` 가 이미 감)
```

**멱등 증명**(완료 기준 "적용 재시도 시 이중 적용 없음"):
| 시나리오 | 결과 |
|---|---|
| 같은 요청에 다시 적용을 두 번 동시에 누름 | claim CAS 가 한 쪽만 통과(1행), 다른 쪽 `APPLY_IN_PROGRESS` |
| PUT 성공 뒤 기록 전에 함수가 죽음 | TTL 뒤 재claim → 현재 값 = to → `ALREADY` → PUT 없이 APPLIED |
| PUT 시간 초과(적용 여부 불명) | FAILED(TIMEOUT) → 재시도 시 현재 값으로 가린다(to 면 ALREADY, from 이면 WRITE) |
| 이미 APPLIED 인 요청에 재시도 | 1단계에서 `already:true` 성공, Jira 0콜 |
| 늦게 깬 이전 claim 이 기록 시도 | fencing token 불일치로 0행 — 덮어쓰지 않음 |
| 감사 이벤트 재기록 | 결정적 id(PK) — 1건 |

테스트(`FieldChangeApplier.test.js`): 위 6행 + WRITE/ALREADY/CONFLICT/UNREADABLE + 403/400/404/timeout 코드 + 이전 요청 SUPERSEDED + budget 초과 WAITING.

**일괄 승인 시간 예산**: 일괄 50건이 모두 FIELD_CHANGE 최종 승인이면 건당 Jira 3콜(결정 직전 GET + 적용 GET + PUT) × 50 = 150콜 → 25초 한도를 넘는다. `bulkApprove` 시작 후 **15초가 지나면** 남은 건은 결정만 기록하고 적용은 `WAITING`(`code:'BUDGET'`)으로 남긴다 → 화면이 "적용 대기 n건 — 상세에서 적용"을 보이고 결재자·요청자가 `applyFieldChange` 로 적용한다. 결정 직전 확인(`beforeDecide`)은 예산과 무관하게 항상 한다(안전 판정).

### 4.6 적용 주체 비교 (요구 3 — 기본값 근거, Q90)

| | (a) 최종 결재자 asUser **(기본)** | (b) asUser → 실패 시 asApp | (c) 항상 asApp |
|---|---|---|---|
| Jira 이력의 수정자 | 결재자(사람) | 대개 결재자, 실패 건만 앱 | 앱 계정 |
| 결재자 편집 권한 없음 | FAILED → 요청자·결재자·관리자가 "다시 적용"(누른 사람 asUser) | 앱이 적용 | 앱이 적용 |
| 필드를 편집 화면에서 빼서 막은 고객 | **항상 실패**(Jira 가 화면 밖 필드 거부 — C5). 관리자도 asUser 면 같다 | `overrideScreenSecurity=true` 가 asApp 에서 되면 적용(C6 — 미검증) | 같음 |
| AGENTS.md asApp | 무변경 | 5번 신설(쓰기) — **사람 확인 필요** | 5번 신설 |
| 우회 감지와의 관계 | 우리 적용은 행위자=결재자 → §3.6 1·2행으로 구분 | 앱 계정 행위자 식별(C9) 추가 필요 | 같음 |
| 보안 | 사용자 권한 안에서만 쓴다 | 사용자 권한 밖의 쓰기 경로가 생김(이슈 보안 수준 무시 가능) | 상시 |

기본 (a) 의 근거: 승인 앱이 사람의 권한을 넘어서 쓰지 않는다는 원칙(불변식 8)을 지키고, 수용 기준이 권장하는 차단 방법(요청자 편집 권한 회수, 결재자 유지)과 맞물린다. (b) 를 고르면 바뀌는 것: 정책 키 `fieldChangeApplyFallback`(`'NONE'|'APP'`, 프로젝트 덮어쓰기 가능), `IssueFieldReader.updateFieldAsApp`(사유 `field-change-apply`), `apply_mode='APP'`, 우회 판정에 앱 계정 행위자 규칙. 계약(§2)은 `appliedBy` 가 `'app'` 일 수 있다는 것 외에 변하지 않는다.

### 4.7 FieldChangeTargetAdapter (Transition 어댑터와 같은 인터페이스)

| 메서드 | 동작 |
|---|---|
| `kind` / `certificateKey` | `FIELD_CHANGE` / `'fieldChange'` |
| `parse(payload)` | `{issueId, fieldId}` 형식 검증 → target |
| `targetOf(state)` / `keyOf(target)` | `fieldChangeTargetFromKey` / `targetKeyOf` |
| `describe(target, {state})` | asUser 이슈(summary·project·{fieldId}) 1콜 + 부속 행(state 있으면 그 요청, 없으면 최신) → `{title, issueId, issueKey, projectId, projectKey, projectName, revision:null, fieldChange: §2.7 블록}`. 이슈를 못 보면 INVALID_TARGET |
| `canView` | `getIssueAccess(issueId).view` |
| `canRequest(target)` | 규칙 있음 && 프로젝트 사용 && 필드 읽힘 && 최신이 PENDING·APPLYING 아님 |
| `userCanView` | `userCanViewIssue` |
| `filterVisible(keys)` | issueId 묶음 `filterVisibleIssues`(fail-close) + 부속 행 표시 1문장(`repo.displayFor(keys)`, 빈 배열 가드) → meta `fieldChange` |
| `fingerprint()` | null |
| `columnsOf(target, snapshot)` | `{target_key, project_id, issue_id, issue_key, transition_id:null, subject_account:null, period_key:null, target_title, content_version:0, content_hash:null}` |
| `snapshotOf` / `viewOf` | ISSUE 키 + `fieldChange`(없으면 null) |
| `certificateExtra(state)` | 부속 행 → `{fieldName, fieldType, from, to, applyStatus, appliedAt, appliedBy}`(Jira 0콜) |
| `beforeDecide(state)` | PENDING 일 때 부속 행 + asUser 현재 값 1콜 → 다르면 `{expireReason:FIELD_CHANGED, errorCode:FIELD_CHANGE_CONFLICT, cause:{requestId}}`, 못 읽으면 null |
| `afterDecide(result, opts)` **신규 훅** | `result.status === APPROVED` 일 때만 `FieldChangeApplier.apply(..., {source:'DECIDE'})` → `{apply}`. 그 외 `{apply:null}` |

`TargetRegistry` 에 `FIELD_CHANGE: fieldChangeTargetAdapter`.

### 4.8 우회 감지 (`FieldChangeEventService.handleEvent`)

```
type ':deleted:issue' → onIssueDeleted(issueId): 이 이슈의 PENDING FIELD_CHANGE 요청 → expireByTargetChange(ISSUE_DELETED) + 알림. (APPROVED 미적용은 그대로 — 적용 시 404 → FAILED)
type ':updated:issue':
  1. items = event.changelog.items 중 fieldId 가 지원 후보(duedate·assignee·reporter·priority·customfield_*) — 없으면 반환(SQL 0)
  2. isTableReady('field_change_rule') 아니면 반환 (ensureMigratedOnce 금지 — 트리거 규칙)
  3. rules = ruleRepo.findByFieldIds(fieldIds)  — 1 SQL (`field_id IN (…) AND enabled=1 LIMIT 200`) 없으면 반환
  4. projectId·issueTypeId = event.issue.fields.{project.id, issuetype.id} (C2). 없으면 → 로그 `[FIELD-CHANGE] no project in payload` 후 반환(Jira 조회 안 함 — asApp 경로 만들지 않는다)
  5. matched = 항목별 matchRule. 없으면 반환. isProjectEnabled(projectId) false → 반환
  6. latest = repo.findLatestPerField(issueId, matchedFieldIds) — 1 SQL(JOIN approval_request)
  7. 항목마다(각자 try/catch): item = fromChangelogItem(type, raw); verdict = classifyFieldEvent({...})
       OURS → 아무것도 안 함
       BYPASS:
         bypassId = deterministic(issueId, changelog.id ?? `${event.timestamp}`, fieldId)   (§5.3)
         bypassRepo.insertIgnore({bypassId, ..., effect, requestId})          ← 감사 기록(요청 없는 필드 포함)
         EXPIRE_PENDING    → closeBySystem(expireByTargetChange FIELD_CHANGED) + 알림(요청자·대기 결재자)
         OVERWROTE_APPLIED → appendEvent(CHANGED_AFTER_APPROVAL, actor=행위자, reason 'BYPASS', disc `BYPASS:{bypassId}`)
                              + 알림(요청자·승인한 결재자) — insertIgnore 가 0행(재전송)이면 이벤트·알림 생략
```
- **절대 throw 하지 않는다**(트리거 규칙), 라이선스로 막지 않는다(알림 생성만 `createNotificationsBestEffort` 가 막음).
- **우리 화면 적용 직후의 이벤트**: claim(APPLYING) 이 PUT 앞에 기록되므로 트리거가 PUT 응답보다 먼저 와도 §3.6 1행으로 OURS.
- **지연 판정** — `getIssueFieldChanges` 가 조회자 asUser 로 읽은 현재 값으로 결재 중 요청만 만료(트리거를 놓쳤을 때). 우회 기록(감사)은 트리거에서만 쓴다 — 조회 경로는 "누가 언제 바꿨는지"를 모른다.
- 놓친 이벤트의 해: 대기 요청이 낡은 채 남음 → 결정 직전·조회 때 만료. 적용된 값의 덮어쓰기 감사 누락 → 남는 한계(L1, 스윕 없음). 스윕을 두려면 changelog 를 asApp 으로 주기 조회해야 해 asApp 경로가 늘어난다(전환 승인 §4.6 과 같은 판단).

### 4.9 규칙 CRUD

- 저장 전: asUser `project/{id}`(유형·style) + `GET /rest/api/3/field`(전체 필드, invocation memo) 병렬 2콜. `issueTypeId` 가 이 프로젝트 것인지, `fieldId` 가 목록에 있고 `classifyField` 가 지원인지(아니면 `FIELD_CHANGE_UNSUPPORTED_FIELD {reason}`), team-managed 전용 필드(`scope.project.id`)면 이 프로젝트 것인지(C8).
- Flow 확인(활성·적용 프로젝트) — 전환과 같은 `FlowService.getFlowForRequest`/`listAvailableFlows`.
- 생성 INSERT — UNIQUE 충돌 → `FIELD_CHANGE_RULE_CONFLICT {ruleId}`. 수정 `… rev = rev + 1 WHERE rule_id=? AND project_id=? AND rev=?`. 삭제 `WHERE rule_id=? AND project_id=? AND rev=?`.
- 규칙 행에 `field_type`·`field_name` 스냅샷 저장(트리거가 Jira 호출 없이 값 해석). 요청 때 Jira 필드 정의가 바뀌어 유형이 다르면(`classifyField(editmeta 또는 field)` ≠ 저장값) `FIELD_CHANGE_UNSUPPORTED_FIELD` — 관리자가 규칙을 다시 저장해야 한다.
- 설정 이력: `SettingsAuditRepository` `area:'fieldChangeRule'`, `action:'save'|'delete'`, detail `{projectId, ruleId, issueTypeId, fieldId, flowId, enabled}`.
- `openCount`: 규칙별 결재 중 요청 수 1문장(JOIN approval_request is_open=1).

### 4.10 되돌리기 (Q91 — 이번 회차 구현 안 함, 허용 시 설계)

정책 `fieldChangeRevertBypass`(프로젝트별, 기본 false) → 트리거 BYPASS 이고 그 필드의 최신 요청이 APPLIED 일 때만 asApp `PUT issue` 로 `latest.to` 를 다시 쓴다(사유 `field-change-revert`). 앱 계정의 변경 이벤트는 다시 감지되지 않게 행위자 = 앱 accountId 면 OURS(C9 — 앱 accountId 얻는 방법 실측). 핑퐁 방지: 같은 (이슈, 필드) 되돌리기는 1시간 1회. 이번 회차에는 정책 키·코드 모두 만들지 않는다(키를 먼저 만들면 "켰는데 안 된다"가 생긴다).

### 4.11 그 밖의 서비스 변경

| 파일 | 변경 |
|---|---|
| `NotificationService.notificationTemplate` | §2.2 템플릿 6개. **순서**: ISSUE 삭제 분기 → `EXPIRED`+`ISSUE_DELETED`+FIELD_CHANGE → 전환 삭제(기존 fallback). `APPROVED`+FIELD_CHANGE 분기는 전환 분기 옆 |
| `NotificationService` 수신자(`recipientsOf`) | `APPLY_FAILED`·`APPLY_CONFLICT` → 요청자 + 승인한 결재자(행위자 제외). `CHANGED_AFTER_APPROVAL` 은 기존 규칙(요청자 + 승인한 결재자) 그대로 |
| `NotificationService`·`InboxService` 행 보강 | `fieldChange: meta.fieldChange ?? null`(FIELD_CHANGE 행만, 다른 종류 null) |
| `RetentionRepository.CHILD_TABLES` | `field_change_request` 추가(규칙·우회 기록은 요청 부속이 아니라 대상 아님 — Q95) |
| `RetentionService` 내보내기 | `fieldChange` 블록(§2.2) |
| `PermissionMap` | 8개(§2.1) + 주석 "요청은 view 축 — Q92, 적용 재시도는 SELF + 서비스가 요청자·결재자·관리자 확인" |
| `src/index.js` | `CONTROLLER_REGISTRARS` 에 `registerFieldChangeController` |
| `ErrorCodes` | 12개(§2.8) |
| `docs/DESIGN.md` §2 ③·§8 | 한 줄씩(③ 강제 수준 문구, §8 테이블 3개) |

### 4.12 불변식·권한 점검

| 불변식 | 지점 |
|---|---|
| 1 열린 요청 하나 | `open:FIELD_CHANGE:{issueId}:{fieldId}` UNIQUE. 추가로 "적용될 수 있는 승인 하나"는 `supersedeOlder` + 적용 시 최신 확인(§4.3-12·§4.5-2) |
| 2 결정이 진실 | 적용·충돌·실패는 부속 행 사실 + 감사 이벤트. `approval_request.status` 는 APPROVED 유지, 새 상태 없음 |
| 3 순수 | `src/domain/fieldChange/**` 는 now·TTL·창을 인자/상수로. `Date.now()` 없음 |
| 4 CAS rev | 규칙 UPDATE, 부속 행 claim·finish·supersede 모두 `rev = rev + 1` |
| 5 조건부 UPDATE | 결정은 엔진 그대로. claim 은 상태 조건, finish 는 fencing token 조건 |
| 6 결정적 이벤트 id | FIELD_APPLIED·APPLY_CONFLICT 고정 disc, APPLY_FAILED `:{attempts}`, 만료 `FIELD_CHANGED:{cv}`, 덮어쓰기 `BYPASS:{bypassId}`, 우회 행 PK 결정적 |
| 7 범위 재필터 | 업무함·알림 `filterVisible`(permissions/check 일괄). 상세·이력·증명서·결정·적용 `assertTargetVisible`. 규칙 WHERE `project_id`. 이슈 화면은 `{issue:view}` 가드 그 이슈만 |
| 8 asUser 기본 | 전 경로 asUser(조회·요청·결정 직전·적용·다시 적용). 트리거는 Jira 호출 0. **asApp 추가 없음** |
| 9·10 | 이슈 프로퍼티 읽기·쓰기 없음. validator 무관 |

형제 resolver 권한 범위:

| resolver | 가드 | 서비스 재확인 | 결론 |
|---|---|---|---|
| `getIssueFieldChanges`·`getFieldChangeForm`·`searchFieldChangeUsers` | {issue:view} | 규칙·프로젝트 | 조회 = 이슈 열람 |
| `createFieldChangeApproval` | {issue:view} | 규칙·프로젝트·필드 읽힘·값 | 요청 = 이슈 열람(Q92) |
| `getApprovalDetail`·`getApprovalHistory`·`getApprovalCertificate` | SELF | `assertTargetVisible` | 이슈 열람 |
| `decideApproval`·`bulkApprove` | SELF | 열람 + 지금 차례 결재자(위임) | 결재자 본인. 적용은 그 사람 asUser — Jira 가 편집 권한을 다시 확인 |
| `applyFieldChange` | SELF | 열람 + (요청자 \| 이 요청 결재자 행에 있음 \| Jira 관리자) | **쓰기 권한은 Jira 가 asUser 로 최종 판정** — 우리 확인은 "이 요청에 관계된 사람만 누를 수 있다" |
| `cancelApproval` | SELF | 요청자·Jira 관리자 + 열람 | 무변경 |
| 규칙 3종 | {project:admin} | WHERE project_id | 프로젝트 관리자 |

---

## 5. 스키마·마이그레이션

### 5.1 enqueue 추가 (v032 뒤에만, 기존 이름 무변경)

```js
.enqueue('v033_create_field_change_rule_table', CREATE_FIELD_CHANGE_RULE_TABLE)
.enqueue('v034_create_field_change_request_table', CREATE_FIELD_CHANGE_REQUEST_TABLE)
.enqueue('v035_create_field_change_bypass_table', CREATE_FIELD_CHANGE_BYPASS_TABLE)
```
DDL `src/rdb/schema/ddl/fieldChange.sql.js`, `ddl/index.js` re-export, `migrate.test.js` 순서 단언 추가. 테이블 추가는 major upgrade(`--approve MAJOR_VERSION_RULE`) — 배포 회차 몫. 모든 신규 테이블 참조 전 `isTableReady()`.

### 5.2 왜 부속 테이블인가

전환 승인 §5.2 와 같은 근거: `approval_request` 에 필드 전용 칸(from/to/적용 상태)을 ALTER 하면 다른 종류 행이 떠안고, 적용 UPDATE 가 결정 CAS 의 `rev` 와 섞여 진행 중 결정을 실패시킨다. 신규 테이블은 `isTableReady` 로 충분하다. 적용 상태를 `ApprovalStatus` 에 넣는 안은 기각(APPROVED 는 종료 상태 — `derive` 가 결정 집합에서 상태를 계산하는 계약을 깬다).

### 5.3 테이블 정의

```sql
-- 필드 변경 승인 규칙. (프로젝트, 이슈 유형|'*', 필드) 하나에 규칙 하나.
CREATE TABLE IF NOT EXISTS field_change_rule (
    rule_id          BINARY(16)   NOT NULL,
    project_id       VARCHAR(32)  NOT NULL,
    issue_type_id    VARCHAR(32)  NOT NULL,          -- 숫자 id 또는 '*'
    field_id         VARCHAR(48)  NOT NULL,          -- duedate | assignee | customfield_10016 …
    field_type       VARCHAR(12)  NOT NULL,          -- DATE|USER|PRIORITY|NUMBER|SELECT (저장 시 판정 — 트리거가 Jira 호출 없이 해석)
    field_name       VARCHAR(120) NULL,              -- 표시 스냅샷
    issue_type_name  VARCHAR(120) NULL,
    flow_id          VARCHAR(64)  NOT NULL,
    enabled          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       TIMESTAMP    NOT NULL,
    updated_at       TIMESTAMP    NOT NULL,
    updated_by       VARCHAR(128) NULL,
    rev              INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (rule_id),
    UNIQUE KEY uq_field_change_rule (project_id, issue_type_id, field_id),
    INDEX ix_fcr_field (field_id, enabled)                           -- 트리거 첫 쿼리
)

-- 필드 변경 요청 부속 행(요청 1건당 1행). from/to 는 요청 시점 값으로 고정. 적용 상태는 여기만.
CREATE TABLE IF NOT EXISTS field_change_request (
    request_id        BINARY(16)   NOT NULL,
    issue_id          VARCHAR(32)  NOT NULL,
    project_id        VARCHAR(32)  NOT NULL,
    issue_type_id     VARCHAR(32)  NOT NULL,
    rule_id           BINARY(16)   NOT NULL,
    field_id          VARCHAR(48)  NOT NULL,
    field_type        VARCHAR(12)  NOT NULL,
    field_name        VARCHAR(120) NULL,
    from_value        VARCHAR(128) NULL,             -- 정규형(§3.3). NULL = 비어 있음
    from_display      VARCHAR(255) NULL,
    to_value          VARCHAR(128) NULL,
    to_display        VARCHAR(255) NULL,
    apply_status      VARCHAR(12)  NOT NULL DEFAULT 'WAITING',   -- WAITING|APPLYING|APPLIED|FAILED|CONFLICT|SUPERSEDED
    apply_token       VARCHAR(36)  NULL,             -- claim fencing token
    apply_claimed_at  TIMESTAMP    NULL,
    apply_claimed_by  VARCHAR(128) NULL,
    apply_attempts    INT          NOT NULL DEFAULT 0,
    apply_mode        VARCHAR(8)   NULL,             -- USER (Q90(b) 채택 시 APP)
    apply_code        VARCHAR(24)  NULL,             -- FAILED 코드 · APPLIED 의 WRITE|ALREADY
    applied_at        TIMESTAMP    NULL,
    applied_by        VARCHAR(128) NULL,
    conflict_value    VARCHAR(128) NULL,
    conflict_display  VARCHAR(255) NULL,
    created_at        TIMESTAMP    NOT NULL,
    rev               INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (request_id),
    INDEX ix_fcq_issue_field (issue_id, field_id, created_at),       -- 최신 요청·supersede·트리거
    INDEX ix_fcq_project_rule (project_id, rule_id)                  -- 규칙 openCount
)

-- 우회(우리 경로 밖 직접 변경) 감사 기록. 요청과 무관하게 남는다. PK 가 결정적 id.
CREATE TABLE IF NOT EXISTS field_change_bypass (
    bypass_id         BINARY(16)   NOT NULL,         -- UUID 형식의 sha256(issueId|changelogId|fieldId) 앞 16바이트
    issue_id          VARCHAR(32)  NOT NULL,
    project_id        VARCHAR(32)  NOT NULL,
    field_id          VARCHAR(48)  NOT NULL,
    rule_id           BINARY(16)   NULL,
    from_value        VARCHAR(128) NULL,
    from_display      VARCHAR(255) NULL,
    to_value          VARCHAR(128) NULL,
    to_display        VARCHAR(255) NULL,
    actor_key         VARCHAR(128) NULL,
    changelog_id      VARCHAR(32)  NULL,
    effect            VARCHAR(20)  NOT NULL,         -- NONE|EXPIRED_PENDING|OVERWROTE_APPLIED
    request_id        BINARY(16)   NULL,
    occurred_at       TIMESTAMP    NOT NULL,         -- 관측 시각
    PRIMARY KEY (bypass_id),
    INDEX ix_fcb_issue (issue_id, occurred_at)
)
```
- `bypass_id` 의 changelog id 가 이벤트에 없으면(C1) `${event.timestamp ?? 관측 분 단위}` 로 대체 — 같은 이벤트 재전송은 같은 id(INSERT IGNORE 1행).
- `field_change_bypass` 에 프로젝트 인덱스를 두지 않는다 — 조회 경로는 이슈별뿐이다(관리자 전체 검색은 범위 밖). 용량 절약.
- TIMESTAMP 바인딩은 `SqlTime.ts()` 경계(숫자 바인딩 금지).
- 표시 문구(`*_display`)는 사용자 데이터라 로그에 남기지 않는다.

### 5.4 주요 쿼리

| 이름 | SQL 요지 |
|---|---|
| `ruleRepo.findByFieldIds(ids)` | `SELECT … FROM field_change_rule WHERE field_id IN (…) AND enabled=1 LIMIT 200` — 빈 배열 가드 |
| `ruleRepo.findForProject(p)` | `WHERE project_id=? LIMIT 500` |
| `repo.findLatestForField(i, f)` | `SELECT tr.*, r.status, r.requester_key … FROM field_change_request tr JOIN approval_request r ON r.request_id=tr.request_id WHERE tr.issue_id=? AND tr.field_id=? AND r.commit_state='LIVE' ORDER BY tr.created_at DESC LIMIT 1` |
| `repo.findLatestPerField(i, fs)` | 같은 JOIN, `field_id IN (…)`, `ORDER BY created_at DESC LIMIT 50` → 메모리에서 필드별 첫 행 |
| `repo.listForIssue(i)` | 같은 JOIN `LIMIT 30` (필드별 최신 + 최근 10) |
| `repo.displayFor(keys)` | `SELECT issue_id, field_id, field_name, field_type, from_value, from_display, to_value, to_display … WHERE issue_id IN (…) ORDER BY created_at DESC LIMIT 500` — 빈 배열 가드 |
| `bypassRepo.recentForIssue(i)` | `WHERE issue_id=? ORDER BY occurred_at DESC LIMIT 10` |

---

## 6. Jira 연결

### 6.1 manifest — 무변경

모듈·트리거 이벤트·scope·resource entry 모두 그대로. 이슈 화면은 기존 `jira:issueContext`/`jira:issuePanel`(entry `issue`), 요청 모달은 기존 `jira:issueAction` `transition-approval-action`(entry `modal`, 종류 선택 화면에 세 번째 카드), 규칙은 기존 `jira:projectSettingsPage`. 주석만 "이슈 승인 요약(일반·전환·필드 변경)"으로 갱신. 배포 시 `--upgrade` 필요 없음(scope·모듈 무변경), SQL 테이블 추가라 `--approve MAJOR_VERSION_RULE`.

### 6.2 REST 목록 (전부 asUser)

| 호출 | 경로 | scope | 미검증 |
|---|---|---|---|
| `GET /rest/api/3/issue/{id}?fields=summary,project,issuetype,{f1},{f2}…` | 이슈 화면·폼·생성·결정 직전·적용 직전·describe | read:jira-work | C4 |
| `GET /rest/api/3/issue/{id}/editmeta` | 폼(옵션·필드 정의), 생성(PRIORITY·SELECT 검증) | read:jira-work | C7 |
| `GET /rest/api/3/field` | 규칙 화면·저장 검증 (invocation memo) | read:jira-work | C8 |
| `GET /rest/api/3/priority/search?maxResults=100` | editmeta 에 우선순위가 없을 때 목록 | read:jira-work | C7 |
| `GET /rest/api/3/priority/{id}` | 생성 시 우선순위 확인(editmeta 없을 때) | read:jira-work | — |
| `GET /rest/api/3/user/assignable/search?issueId=&query=&maxResults=20` | 담당자 후보 | read:jira-user | C10 |
| `GET /rest/api/3/user/search?query=&maxResults=20` | 그 밖 사용자 필드 후보 | read:jira-user | C10 |
| `GET /rest/api/3/user?accountId=` | 생성 시 사용자 확인·표시 이름 | read:jira-user | — |
| `PUT /rest/api/3/issue/{id}` body `{fields:{[fieldId]: …}}` | 적용(최종 결재자·다시 적용한 사람) | write:jira-work | C5 |
| `GET /rest/api/3/project/{id}` | 규칙 화면(유형·style) — 전환 `IssueStateReader.projectMeta` 재사용 | read:jira-work | — |
| `POST /rest/api/3/permissions/check`·`issue/bulkfetch` | 업무함·알림 가시성(기존) | read:jira-work | 기존 |

`route` 는 template strings 배열을 직접 만들어 id·숫자·필드 id 만 보간한다(쿼리스트링 통째 보간 금지 — CLAUDE.md 함정). `fields=` 목록은 `repeatedQueryRoute` 와 같은 방식(쉼표로 이은 필드 id 들을 하나씩 보간). 시간 상한: 조회 3초, PUT 3초(`Promise.race`). 응답 본문은 로그·에러 message 에 싣지 않는다(RequestJira 규칙 그대로).

### 6.3 AGENTS.md — 이번 회차 무변경. Q90(b)·Q91 이 허용되면 넣을 문안(사람 확인 전)

> 5. **필드 변경 승인의 대체 적용**(정책 `fieldChangeApplyFallback='APP'` 일 때만) — 최종 결재자 asUser 적용이 403/400 으로 실패한 승인 건을 `PUT /rest/api/3/issue/{id}`(필드 하나, `overrideScreenSecurity=true`)로 적용한다. `FieldChangeApplier` 만 쓴다(사유 `field-change-apply`). 적용 직전 현재 값 확인도 같은 사유로 asApp 이 아니라 **asUser 로 한 값**을 쓴다(asApp 으로 읽은 값을 사용자에게 돌려주지 않는다). Jira 이력의 수정자가 앱 계정이 되는 것을 규칙 화면에 고지한다. (Q90 — 사람 확인 전)
> 6. **우회 되돌리기**(정책 `fieldChangeRevertBypass` 프로젝트별 opt-in) — 트리거가 승인·적용된 필드 값이 직접 바뀐 것을 감지하면 asApp `PUT issue` 로 승인값을 복원한다. `FieldChangeEventService` 만 쓴다(사유 `field-change-revert`). 같은 이슈·필드 1시간 1회. (Q91 — 사람 확인 전)

---

## 7. 프론트

### 7.1 엔트리 — 추가 없음 (3곳 무변경)

| 모듈 | 리소스 | 배치 변경 |
|---|---|---|
| `jira:issueContext` | `issue` | compact: 일반 승인 한 줄 → 전환 목록 → **필드 변경 칸**(규칙 필드마다 한 줄: 필드 이름 · 상태 배지 · 버튼 하나). 규칙이 없으면 칸 자체를 그리지 않는다(`notEnabledReason==='NO_RULE'`) — 상시 로드 높이 절약 |
| `jira:issuePanel` | `issue` | full: + 행마다 "이전 → 새" + 최근 우회 기록 목록 |
| `jira:issueAction` | `modal` | 종류 선택(overview)에 세 번째 카드 "필드 변경 승인" |

### 7.2 화면 트리

```
features/issueApproval/IssueApprovalOverview.jsx (변경)
  └ 세 번째 Stack: <FieldChangeSection issueId layout t onOpenRequest onOpenDetail onApply/>  (showHints 면 fieldChange.overview.hint)
features/fieldChange/ (신규)
  FieldChangeSection.jsx      — useQuery(fieldChangeKeys.issue, getIssueFieldChanges). 규칙 없음 → null. 행 = FieldChangeRow
  FieldChangeRow.jsx          — 필드 이름 · FieldChangeStateLozenge · (full) "이전 → 새" · 버튼(요청 | 상세 | 다시 적용)
  FieldChangeStateLozenge.jsx — state → appearance·라벨
  FieldValueText.jsx          — FieldValue 표시(USER → PersonAvatar+이름, null → "(없음)")
  FieldBypassList.jsx         — (full) 최근 우회 10건: 시각 · 사람 · 필드 · 이전 → 새 · effect 배지
  FieldChangeRequestForm.jsx  — (lazy, importWithReloadOnce) getFieldChangeForm → 현재 값(읽기) · 새 값 입력 · 사유(필수) · 마감(Flow 기본) · 참조 ·
                                결재선 읽기 전용(transition 의 표시 재사용) · pendingApprovedRequestId 경고 · 상단 수용 기준 안내(짧은 문장)
  FieldChangeValueInput.jsx   — 유형별: DATE @atlaskit/datetime-picker DatePicker · USER 검색 Select(searchFieldChangeUsers, debounce 300ms) ·
                                PRIORITY/SELECT @atlaskit/select(options) · NUMBER textfield(type=number). clearable 이면 "비우기" 선택지
  FieldChangeTargetHeader.jsx — 상세 헤더: "OPS-12 · 마감일: 10/01 → 10/10" + 상태 배지 + 현재 값 + applyCode 문구 + [다시 적용](applyRetryable)
  FieldChangeRuleSettings.jsx — 규칙 표(유형·필드·결재선·사용·진행 중) + 추가/편집/삭제 + **차단 가이드 SectionMessage**(수용 기준 문장)
  FieldChangeRuleFormModal.jsx— 유형('*' 포함) → 필드(지원 목록, "지원하지 않는 필드" 접기 안내) → Flow
  fieldChangeModel.js         — state → {appearance, labelKey, action}, applyCode → 문구 키, 결정 응답 apply → 안내 키(순수, 테스트)
  fieldChangeApi.js           — invokeApproval 래퍼 8개
entries/modal.jsx (변경)
  resolveModalTarget(transitionModel.js) — intent 'fieldChangeRequest' → { flow:'fieldChange', issueId, fieldId }
  overview 화면: 필드 행 요청 → screen 'fieldChangeRequest'(취소 시 overview), 상세 → ApprovalModalFlow(detail)
  detail: target.kind==='FIELD_CHANGE' → FieldChangeTargetHeader
  DecisionForm 결과: 응답 apply 있으면 fieldChangeModel.decisionNotice(apply) 로 SectionMessage(성공·실패·충돌·대기) 후 닫기
entries/projectSettings.jsx (변경) — TransitionRuleSettings 아래 FieldChangeRuleSettings (Heading 으로 구분)
features/inbox (변경)       — FIELD_CHANGE 행 제목 옆 "{필드}: 이전 → 새", 엑셀 열 "필드 변경"; 일괄 결과에 "적용 대기 n건"
features/notification (변경) — 새 templateKey 6개
features/certificate (변경) — fieldChange 블록(필드, 이전 → 새, 적용 상태·시각·적용자)
```

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const fieldChangeKeys = {
  all: ['fieldChange'],
  issue: (issueId) => [...fieldChangeKeys.all, 'issue', String(issueId)],
  form: (issueId, fieldId) => [...fieldChangeKeys.all, 'form', String(issueId), String(fieldId)],
  users: (issueId, fieldId, query) => [...fieldChangeKeys.all, 'users', String(issueId), String(fieldId), String(query)],
  rules: (projectId) => [...fieldChangeKeys.all, 'rules', String(projectId)],
};
```
issue 엔트리 `openModal.onClose` 무효화 목록에 `fieldChangeKeys.issue(issueId)` 추가. 인라인 키 금지 계약 테스트 유지.

### 7.4 iframe·번들

- issueContext 는 세 칸 — `100vh` 금지, 내용 높이(C13). 규칙 없는 이슈는 칸을 그리지 않는다.
- `FieldChangeSection` 은 상시 로드 — lozenge·button·primitives·`PersonAvatar` 만. 폼·날짜 선택기·Select 는 모달 lazy 청크.
- `build:ui` 보고서에 issue 엔트리 고유 JS(현재 7.7KB gz, I16)와 비교 수치.

### 7.5 프론트 테스트

| # | 파일 | 케이스 |
|---|---|---|
| F1 | `fieldChangeModel.test.js` | state 9종 → 배지·버튼, applyCode 7종 문구 키, decisionNotice(APPLIED/already/FAILED/CONFLICT/WAITING-BUDGET/null) |
| F2 | `FieldChangeSection.test.jsx` | 규칙 없음 → 렌더 없음 / 행 버튼(요청·상세·다시 적용) / 같은 이슈 일반·전환·필드 세 칸 독립 조회(한쪽 오류 격리) |
| F3 | `FieldChangeValueInput.test.jsx` | 유형별 입력 → payload `value` 는 항상 문자열 또는 null(DATE `'YYYY-MM-DD'`, NUMBER 는 입력 문자열 그대로 — 정규화는 서버 `parseInput`), 비우기 → null, PRIORITY 는 비우기 선택지 없음 |
| F4 | `transitionModel.test.js`(추가) | `resolveModalTarget` intent `fieldChangeRequest` → flow `fieldChange` |
| F5 | 쿼리키 계약 | `fieldChangeKeys.issue('1')[0]` 가 `approval`·`transition` 과 다름 |

---

## 8. i18n 키 (kr / en) — `npm run merge` 필수, 자리표시 `{name}`

### 8.1 신규 `locales/{kr,en}/fieldChange.json`

| 키 | kr | en |
|---|---|---|
| `section.title` | 필드 변경 승인 | Field change approvals |
| `section.request` | 변경 요청 | Request change |
| `section.detail` | 상세 | Details |
| `section.apply` | 다시 적용 | Apply again |
| `section.notReadable` | 이 이슈에서 읽을 수 없는 필드입니다. | This field isn't available on this issue. |
| `section.projectDisabled` | 이 프로젝트는 승인을 사용하지 않습니다. | Approvals are turned off for this project. |
| `section.flowMissing` | 규칙의 결재선을 찾을 수 없습니다. 프로젝트 관리자에게 문의하세요. | The approval flow for this rule is missing. Contact a project admin. |
| `section.loadFailed` | 필드 변경 정보를 불러오지 못했습니다. | Couldn't load field change approvals. |
| `value.empty` | (없음) | (none) |
| `value.change` | {from} → {to} | {from} → {to} |
| `state.NONE` | 요청 없음 | No request |
| `state.PENDING` | 결재 중 | In approval |
| `state.APPLYING` | 적용 중 | Applying |
| `state.APPLIED` | 적용됨 | Applied |
| `state.APPLY_FAILED` | 승인됨 · 적용 안 됨 | Approved · not applied |
| `state.CONFLICT` | 값 충돌 · 적용 안 됨 | Value conflict · not applied |
| `state.SUPERSEDED` | 새 요청으로 대체됨 | Replaced by a newer request |
| `state.REJECTED` | 반려됨 | Rejected |
| `state.CLOSED` | 종료됨 | Closed |
| `applyCode.NO_PERMISSION` | 적용한 사람에게 이 이슈의 편집 권한이 없습니다. | The person applying can't edit this issue. |
| `applyCode.NOT_EDITABLE` | 이 필드는 편집 화면에 없거나 편집할 수 없습니다. | This field isn't on the edit screen or can't be edited. |
| `applyCode.ISSUE_NOT_FOUND` | 이슈를 찾을 수 없습니다. | The issue can't be found. |
| `applyCode.VALUE_UNREADABLE` | 현재 값을 확인할 수 없어 적용하지 않았습니다. | The current value couldn't be read, so nothing was changed. |
| `applyCode.REJECTED_BY_JIRA` | Jira 가 값을 받아들이지 않았습니다. | Jira didn't accept the value. |
| `applyCode.TIMEOUT` | 응답이 늦어 적용 여부를 확인하지 못했습니다. 다시 적용하면 확인 후 처리합니다. | Jira was slow to respond. Apply again to check and finish. |
| `applyCode.BUDGET` | 일괄 승인 시간이 부족해 적용을 미뤘습니다. | Applying was deferred because the bulk approval ran out of time. |
| `decision.applied` | 승인되어 필드에 적용했습니다. | Approved and applied to the field. |
| `decision.alreadyApplied` | 승인되었습니다. 필드가 이미 새 값입니다. | Approved. The field already has the new value. |
| `decision.failed` | 승인되었지만 적용하지 못했습니다: {reason} | Approved, but couldn't apply: {reason} |
| `decision.conflict` | 승인되었지만 그 사이 필드 값이 바뀌어 적용하지 않았습니다. | Approved, but the field changed in the meantime, so nothing was applied. |
| `decision.waiting` | 승인되었습니다. 적용은 상세 화면에서 하세요. | Approved. Apply it from the details view. |
| `form.title` | {issueKey} · {field} 변경 요청 | Request change · {issueKey} · {field} |
| `form.current` | 현재 값 | Current value |
| `form.newValue` | 새 값 | New value |
| `form.clear` | 값 비우기 | Clear value |
| `form.reason` | 사유 | Reason |
| `form.lineFixed` | 결재선은 프로젝트 규칙이 정합니다. | The approval line is set by the project rule. |
| `form.deadline` | 결재 마감 | Decision deadline |
| `form.cc` | 참조 | CC |
| `form.submit` | 요청 | Request |
| `form.pendingApproved` | 아직 적용되지 않은 이전 승인이 있습니다. 새로 요청하면 이전 승인은 적용되지 않습니다. | An earlier approval hasn't been applied yet. If you submit a new request, the earlier one won't be applied. |
| `form.notice` | 승인되면 최종 결재자의 이름으로 필드가 바뀝니다. 그 사이 값이 바뀌면 적용하지 않습니다. | Once approved, the field is changed under the final approver's name. If the value changes in the meantime, nothing is applied. |
| `form.userSearch` | 이름으로 검색 | Search by name |
| `header.current` | 현재: {value} | Now: {value} |
| `header.appliedBy` | {time}에 {person}님이 적용 | Applied by {person} at {time} |
| `header.conflictValue` | 충돌 당시 값: {value} | Value at conflict: {value} |
| `bypass.title` | 앱 밖에서 바뀐 기록 | Changes made outside the app |
| `bypass.effect.NONE` | 기록 | Logged |
| `bypass.effect.EXPIRED_PENDING` | 결재 중 요청 만료 | Pending request expired |
| `bypass.effect.OVERWROTE_APPLIED` | 승인된 값이 바뀜 | Approved value overwritten |
| `bypass.unknownActor` | 알 수 없음 | Unknown |
| `overview.title` | 필드 변경 승인 | Field change approval |
| `overview.hint` | 정해진 필드를 바꾸기 전에 승인을 받고, 승인되면 앱이 적용합니다. | Get approval before changing a governed field; the app applies it once approved. |
| `rules.title` | 필드 변경 승인 규칙 | Field change approval rules |
| `rules.add` | 규칙 추가 | Add rule |
| `rules.column.issueType` | 이슈 유형 | Issue type |
| `rules.column.field` | 필드 | Field |
| `rules.column.flow` | 결재선 | Approval flow |
| `rules.column.enabled` | 사용 | On |
| `rules.column.open` | 진행 중 | Open |
| `rules.anyIssueType` | 모든 유형 | All types |
| `rules.missingRef` | Jira 에서 찾을 수 없음 | Not found in Jira |
| `rules.deleteConfirm` | 규칙을 삭제하면 이 필드는 승인 없이 바꿀 수 있고 감지도 멈춥니다. 진행 중인 요청 {count}건은 그대로 남습니다. | Deleting this rule lets the field change without approval and stops detection. {count} open requests stay as they are. |
| `rules.guide.title` | Jira 는 필드 변경을 미리 막지 못합니다 | Jira can't block field edits in advance |
| `rules.guide.body` | 이 앱을 거친 변경만 승인 뒤 적용됩니다. Jira 화면·REST·자동화로 직접 바꾼 값은 감지·기록만 됩니다. | Only changes made through this app are applied after approval. Direct edits from Jira, REST, or automation are only detected and logged. |
| `rules.guide.permission` | 막으려면: 권한 스킴에서 요청자 역할의 "작업 항목 편집(Edit work items)" 권한을 회수하고 결재자 역할에는 남겨 두세요. 승인된 변경은 결재자 이름으로 적용됩니다. | To block: in the permission scheme, remove "Edit work items" from the requesters' role and keep it for approvers. Approved changes are applied under the approver's name. |
| `rules.guide.screen` | 필드를 편집 화면에서 빼면 앱의 적용도 실패합니다(Jira 가 화면에 없는 필드 변경을 거부). | Removing the field from the edit screen also makes the app's apply fail (Jira rejects changes to fields not on the screen). |
| `rules.unsupported.title` | 지원하지 않는 필드 | Unsupported fields |
| `rules.unsupported.MULTI_VALUE` | 여러 값 필드 | Multi-value field |
| `rules.unsupported.RICH_TEXT` | 서식 있는 텍스트 | Rich text |
| `rules.unsupported.TEXT` | 텍스트(다음 버전) | Text (coming later) |
| `rules.unsupported.DATETIME` | 날짜·시간 | Date and time |
| `rules.unsupported.CASCADING` | 계단식 선택 | Cascading select |
| `rules.unsupported.WORKFLOW_FIELD` | 상태·해결 — 전환 승인을 쓰세요 | Status/resolution — use transition approval |
| `rules.unsupported.SYSTEM_RESTRICTED` | 지원하지 않는 시스템 필드 | Unsupported system field |
| `rules.unsupported.UNKNOWN` | 알 수 없는 유형 | Unknown type |
| `rules.form.title` | 필드 변경 승인 규칙 | Field change approval rule |
| `rules.form.save` | 저장 | Save |
| `type.DATE` | 날짜 | Date |
| `type.USER` | 사용자 | User |
| `type.PRIORITY` | 우선순위 | Priority |
| `type.NUMBER` | 숫자 | Number |
| `type.SELECT` | 단일 선택 | Single select |

### 8.2 기존 네임스페이스 추가

| 키 | kr | en |
|---|---|---|
| `error.FIELD_CHANGE_RULE_NOT_FOUND` | 이 필드는 승인이 필요하지 않습니다. 바로 편집하세요. | This field doesn't need approval. Edit it directly. |
| `error.FIELD_CHANGE_PROJECT_DISABLED` | 이 프로젝트는 승인을 사용하지 않습니다. | Approvals are turned off for this project. |
| `error.FIELD_CHANGE_FIELD_UNAVAILABLE` | 이 이슈에서 그 필드를 읽을 수 없습니다. | That field isn't available on this issue. |
| `error.FIELD_CHANGE_UNSUPPORTED_FIELD` | 지원하지 않는 필드 유형입니다. | That field type isn't supported. |
| `error.FIELD_CHANGE_INVALID_VALUE` | 새 값이 올바르지 않습니다. | The new value isn't valid. |
| `error.FIELD_CHANGE_NO_CHANGE` | 새 값이 현재 값과 같습니다. | The new value is the same as the current value. |
| `error.FIELD_CHANGE_OPTIONS_UNAVAILABLE` | 선택지를 불러올 수 없어 요청할 수 없습니다. 프로젝트 관리자에게 문의하세요. | Options can't be loaded, so you can't request this change. Contact a project admin. |
| `error.FIELD_CHANGE_REASON_REQUIRED` | 사유를 입력하세요. | Enter a reason. |
| `error.FIELD_CHANGE_CONFLICT` | 요청 이후 필드 값이 바뀌어 요청이 만료됐습니다. | The field changed after the request, so the request expired. |
| `error.FIELD_CHANGE_NOT_APPLICABLE` | 이 요청은 적용할 수 없는 상태입니다. | This request can't be applied in its current state. |
| `error.FIELD_CHANGE_APPLY_IN_PROGRESS` | 다른 적용이 진행 중입니다. 잠시 후 다시 확인하세요. | Another apply is in progress. Check again shortly. |
| `error.FIELD_CHANGE_RULE_CONFLICT` | 같은 유형·필드의 규칙이 이미 있습니다. | A rule for this issue type and field already exists. |
| `notification.template.fieldChangeApproved` | {actor}님이 필드 변경을 승인했습니다. | {actor} approved the field change. |
| `notification.template.fieldChangeConflict` | 필드 값이 바뀌어 필드 변경 요청이 만료됐습니다. | The field change request expired because the field changed. |
| `notification.template.fieldChangeIssueDeleted` | 이슈가 삭제되어 필드 변경 요청이 만료됐습니다. | The field change request expired because the issue was deleted. |
| `notification.template.fieldChangeApplyFailed` | 승인된 필드 변경을 적용하지 못했습니다. 상세에서 다시 적용하세요. | The approved field change couldn't be applied. Apply it again from the details. |
| `notification.template.fieldChangeApplyConflict` | 승인된 필드 변경을 적용하지 않았습니다 — 그 사이 값이 바뀌었습니다. | The approved field change wasn't applied — the value changed in the meantime. |
| `notification.template.fieldChangeBypassed` | 승인되어 적용된 필드 값이 앱 밖에서 바뀌었습니다. | An approved field value was changed outside the app. |
| `issueApproval.overview.fieldChange` | 필드 변경 승인 | Field change approval |
| `cert.fieldChange` | 필드 변경 | Field change |
| `cert.appliedAt` | 적용 시각 | Applied at |
| `cert.appliedBy` | 적용자 | Applied by |
| `cert.applyStatus` | 적용 상태 | Apply status |
| `inbox.column.fieldChange` | 필드 변경 | Field change |
| `inbox.bulk.applyWaiting` | 적용 대기 {count}건 — 상세에서 적용하세요. | {count} waiting to apply — apply them from the details. |
| `history.event.FIELD_APPLIED` | 필드 적용 | Field applied |
| `history.event.APPLY_FAILED` | 적용 실패 | Apply failed |
| `history.event.APPLY_CONFLICT` | 적용 안 함(값 충돌) | Not applied (conflict) |

`history.event.*` 키의 실제 네임스페이스는 프론트가 기존 이벤트 라벨 위치(`CONSUMED` 라벨이 있는 곳)를 따라 맞춘다 — 키 이름 끝(`FIELD_APPLIED` 등)은 고정.

---

## 9. 용량·호출량

### 9.1 용량 (200명, 필드 변경 요청 하루 20건 · 규칙 필드 직접 변경 하루 100건 가정, 인덱스 포함 ×2, 실측 전)

| 항목 | 연 건수 | 행 크기 | 연 용량 |
|---|---|---|---|
| 필드 변경 요청(요청·결재자·이벤트·업무함·알림 — 기존 엔진 행) | 약 7,300 | 약 2.4KB | 약 18MB |
| `field_change_request` 부속 행 | 7,300 | 약 0.8KB ×2 | 약 12MB |
| 적용 감사 이벤트(FIELD_APPLIED 등) | ≤ 9,000 | 0.2KB ×2 | 약 4MB |
| `field_change_bypass` | 약 36,500 | 약 0.5KB ×2 | **약 37MB** |
| `field_change_rule` | 수백 | — | 무시 |
| **합계 추가** | | | **연 약 71MB**, 3년 약 210MB |

- **가장 큰 변수는 우회 기록**: 담당자·우선순위처럼 하루에도 여러 번 바뀌는 필드를 규칙에 걸고 직접 편집을 막지 않으면 하루 500건 → 연 약 180MB. 규칙 화면 가이드(차단 권장)와 Q95(보관 정리)가 대책. 사용량 게이지에 테이블이 자동으로 보인다.
- 기존 누적(DESIGN §8 약 150MB + 전환 75MB + 일반 20MB + 워크로그 이력 148MB)과 합쳐 연 약 465MB — 3년 보관이면 1GiB 를 넘을 수 있다. 보관 기간 정리(요청)는 기존대로 작동하고, 우회 기록·워크로그 이력의 보관 정책(Q95·Q77)이 남은 레버다. **사람에게 보고할 항목.**

### 9.2 resolver·트리거 1회당 Jira 호출

| 경로 | Jira 호출 | SQL | 비고 |
|---|---|---|---|
| `getIssueFieldChanges` | 가드 1 + 이슈(규칙 필드 포함) 1 = **2** | 규칙 1, 최신 요청 1, 우회 1, 목록 1 + KVS(프로젝트 사용) | 규칙 없는 프로젝트: SQL 1 후 종료, Jira 2(가드·이슈) |
| issue 엔트리 1회 로드(세 칸) | 일반 2~4 + 전환 2 + 필드 2 = **6~8** | | I9 재확인(C12). 세 칸 합친 조회 resolver 는 계약 변경이라 보류 |
| `getFieldChangeForm` | 가드 1 + 이슈 1 + editmeta 1 (+ 우선순위 목록 1) = **3~4** | 규칙·최신·Flow | |
| `searchFieldChangeUsers` | 가드 1 + 검색 1 | 규칙 1 | debounce 300ms, 2자 이상 |
| `createFieldChangeApproval` | 가드 1 + 이슈 1 + 값 확인 0~1(editmeta 또는 user/priority) + 결재자 열람 n + 그룹 펼침 g | 엔진 생성 + 부속 1 + supersede 1 | n = 결재선 인원 |
| `decideApproval`(중간 단계) | 기존 + beforeDecide 1 | 기존 | |
| `decideApproval`(최종 승인) | 기존 + beforeDecide 1 + 적용 GET 1 + PUT 1 = **+3** | + claim·finish·이벤트 3 | |
| `bulkApprove` 50건(전부 필드 최종) | 건당 +3 → 15초 예산 안에서만 적용, 나머지 WAITING | | §4.5 |
| `applyFieldChange` | 가드 0(SELF) + 열람 1 + GET 1 + PUT 0~1 | 3~4 | APPLIED 재호출은 Jira 0 |
| 트리거 `updated:issue` — 지원 후보 항목 없음 | 0 | **0** | |
| 트리거 — 후보 있음·규칙 없음 | 0 | 1 | 대부분의 사용자 정의 필드 변경 |
| 트리거 — 규칙 필드 | 0 | 2~5 + KVS 1 | 우회 기록·만료·이벤트 |
| 규칙 화면 | 가드 1 + project 1 + field 1 = 3 | 2~3 | |

N+1 없음: 업무함·알림은 기존 `permissions/check`·`bulkfetch` 일괄 + 표시 보강 1문장. 이슈 화면은 규칙 필드를 `fields=` 한 번에 읽는다.

---

## 10. 미검증 (상세·확인 방법은 `04_spike_todo.md` C1~C15)

| # | 항목 | 영향 | 확인 방법(요지) |
|---|---|---|---|
| **C1** | `avi:jira:updated:issue` 의 `changelog.id`·`items[].fieldId`(시스템 `duedate`·`assignee`·`priority`, 사용자 정의 `customfield_*`)·행위자 필드 | 우회 감지 전체·결정적 id | 규칙 필드를 Jira 화면에서 바꾼 뒤 `getIssueFieldChanges.bypass` 행·`changelog_id` |
| **C2** | 이벤트 `issue.fields.project.id`·`issuetype.id` 포함 여부 | 없으면 감지가 통째로 빠짐(asApp 조회를 만들지 않음) | 같은 시나리오에서 `[FIELD-CHANGE] no project in payload` 로그 유무 |
| **C3** | changelog `from/to/fromString/toString` 형식 — 날짜(시스템·사용자 정의), 사용자, 우선순위, 숫자(`3` vs `3.0`), 단일 선택(옵션 id 유무) | §3.6 OURS 판정(값 일치) — 틀리면 우리 적용이 우회로 기록(2행 행위자 규칙이 보조) | 앱으로 적용한 뒤 우회 행이 **생기지 않는지**, 직접 변경 시 `from/to.value` 가 채워지는지 |
| **C4** | GET issue `fields=` 원값 형태(유형별)와 필드 구성에서 숨긴 필드의 응답(키 없음 vs null) | `current` 의 known/unknown 판정 — 숨김을 null(빈 값)로 오인하면 충돌 판정이 틀림 | 필드 구성에서 숨긴 필드로 폼 열기 → `FIELD_CHANGE_FIELD_UNAVAILABLE` 기대 |
| **C5** | asUser `PUT issue` 실패 코드 — 편집 권한 없음(403?), 편집 화면 밖(400?), 값 거부(400) 구분 | `applyCode` 정확도, Q90 판단 근거 | 편집 권한 없는 결재자·화면에서 뺀 필드로 각각 승인 |
| **C6** | asApp + `overrideScreenSecurity=true` 가 Forge 앱에서 동작하는지 | Q90(b) 의 성립 | Q90(b) 채택 시에만 |
| **C7** | `editmeta` 가 편집 권한 없는 사용자에게 빈 응답인지, `allowedValues` 형태(우선순위·옵션), `priority/search` 권한 | 폼 옵션·Q93 | 편집 권한 없는 계정으로 폼 열기 |
| C8 | `GET /rest/api/3/field` 의 `schema`(type·custom·system)와 team-managed 필드의 `scope` | 지원 판정·프로젝트 필터 | team-managed 프로젝트 규칙 화면 |
| C9 | 앱 계정 accountId 를 얻는 방법(`context`·`/myself` asApp) | Q90(b)·Q91 의 우회 구분 | 채택 시에만 |
| C10 | `user/assignable/search?issueId=` 와 `user/search` 의 asUser 결과(이메일 비공개·비활성 사용자) | 담당자 후보 | 검색 결과 확인 |
| C11 | 날짜+시간 필드의 저장·표시 형식 | 범위 밖 판단 근거(다음 회차) | — |
| C12 | 이슈 화면 로드당 6~8콜의 요율 영향(I9 확장) | 성능 | 연속 열람 시 429 |
| C13 | issueContext 세 칸 높이(I7·I16 확장) | 우측 요약 잘림 | 일반·전환·필드 모두 있는 이슈 |
| C14 | PUT 이 Jira 알림 메일을 보내는지(`notifyUsers` 기본 true)·이력 작성자가 asUser 주체로 남는지 | 요구 3 "이력의 수정자가 사람" | 적용 후 이슈 기록 탭 |
| C15 | 위임 결정(대리 결재) 시 asUser 주체 = 실제 결정자(delegate)인지 | 이력 수정자 | 위임 상태에서 최종 승인 |

**배포 최우선 실측**: **C1·C2·C3**(트리거 페이로드 — 감지와 "우리 적용은 우회가 아님" 판정 전체가 기댄다), 그다음 **C5**(적용 실패 코드 — Q90 결정 근거).

---

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] 도메인 `src/domain/approval/{constants,scopeKey,transitions}.js` 추가분 + 테스트(기존 무변경 통과)
- [ ] 도메인 `src/domain/fieldChange/{fieldType,fieldValue,applyPlan,eventClassify,rule,state}.js` + 테스트 — **applyPlan 판정 표·eventClassify 5행 전부**
- [ ] DDL `ddl/fieldChange.sql.js`, `ddl/index.js`, `migrate.js` v033~v035(이름 그대로), `migrate.test.js`
- [ ] `FieldChangeRuleRepository`(CAS rev, project_id WHERE, UNIQUE 충돌 → CONFLICT, findByFieldIds 빈 배열 가드)
- [ ] `FieldChangeRepository`(insertDraft·deleteOrphan·findLatestForField·findLatestPerField·listForIssue·claim·finish(fencing)·supersedeOlder·displayFor·openCountsByRule·findByRequestIds)
- [ ] `FieldBypassRepository`(insertIgnore·recentForIssue), 결정적 bypassId 함수(도메인 `eventClassify.js` 에 `bypassIdOf`)
- [ ] `IssueFieldReader`(asUser 전용, route template strings, 3초 상한, memo `issueFields:<id>:<fields>`·`fieldCatalog`)
- [ ] `FieldChangeApplier` + 테스트(§4.5 멱등 6행·판정 4행·실패 코드·budget·supersede)
- [ ] `FieldChangeTargetAdapter`(beforeDecide·afterDecide 포함) + `TargetRegistry` 등록 + 테스트
- [ ] `ApprovalService` — `afterDecide` 훅·응답 `apply` 키·bulk budget·`applyStatus` + `ApprovalServiceFieldHooks.test.js`
- [ ] `FieldChangeService`(조회·지연 만료·폼·사용자 검색·생성·규칙 CRUD·설정 이력) + 테스트(생성 에러 코드 전부, 같은 필드 두 번째 생성 ALREADY_OPEN, 다른 필드는 성공)
- [ ] `FieldChangeEventService` + `onIssueChanged` 세 번째 try/catch + 테스트(후보 없음 SQL 0, 규칙 없음 SQL 1, OURS 무기록, 대기 만료 1건·재전송 1건, 덮어쓰기 이벤트 1건, 삭제 만료, 세 처리 실패 격리, throw 없음)
- [ ] `FieldChangeController` + `PermissionMap` 8개 + `src/index.js` registrar — 계약 테스트 통과
- [ ] `ErrorCodes` 12개, `NotificationService`(템플릿 6·수신자·`fieldChange`), `InboxService`, `RetentionRepository`·`RetentionService`
- [ ] 격리 증명: `IssueApprovalIsolation.test.js` 확장 또는 신규 — 같은 이슈에 ISSUE·TRANSITION·FIELD_CHANGE 동시 열림, 서로의 dedupe·조회·훅 비간섭
- [ ] **완료 기준 테스트 3종을 이름으로 남긴다**: `충돌(스냅샷 불일치) 시 적용하지 않음`(applyPlan CONFLICT + Applier 가 PUT 미호출 + beforeDecide 만료), `같은 필드 열린 요청 하나`(dedupe), `적용 재시도 이중 적용 없음`(claim·ALREADY·fencing)
- [ ] `docs/DESIGN.md` §2 ③·§8 한 줄씩, manifest 주석만
- [ ] `_workspace/field-change-approval/04_spike_todo.md` 에 구현 중 생긴 항목 C16~ 추가
- [ ] `npm test -- --runInBand`
- **하지 않는 것**: asApp 경로·AGENTS.md 수정·정책 키(Q90·Q91 답 전), 되돌리기, locales(프론트 Phase — 단 백엔드가 서버 문구를 import 하지 않으므로 의존 없음)

### 11.2 frontend 체크리스트

- [ ] `features/fieldChange/*`(§7.2) + `fieldChangeModel.js` 테스트 F1
- [ ] `IssueApprovalOverview` 세 번째 칸, issue 엔트리 onClose 무효화에 `fieldChangeKeys.issue`
- [ ] `entries/modal.jsx` — `fieldChange` flow·overview 카드·detail 헤더·DecisionForm 결과 안내, `resolveModalTarget`(F4)
- [ ] `entries/projectSettings.jsx` — FieldChangeRuleSettings + 가이드
- [ ] 업무함 행·엑셀 열·일괄 결과 적용 대기, 알림 템플릿 6, 증명서 블록, 이력 이벤트 라벨 3
- [ ] `fieldChangeKeys` 팩토리(F5)
- [ ] `locales/{kr,en}/fieldChange.json` + §8.2 → `npm run merge`
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui`(issue 엔트리 고유 JS — 7.7KB gz 대비)

### 11.3 순서·의존

1. 백엔드: 도메인 → 스키마 → 저장소 → reader → Applier → 어댑터·엔진 훅 → 서비스 → 트리거 → 등록
2. 프론트는 §2 계약만 보고 병렬 가능. 서버가 사람이 읽을 문구를 만들지 않으므로(코멘트·validator 없음) locales 는 프론트 단독
3. 검증자는 §2 표, §3.4 판정 표, §3.6 분류 표, §4.5 멱등 표, §4.12 불변식·권한 표를 기준으로 본다

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-04 | 최초 작성 | 로드맵 8 착수 |
