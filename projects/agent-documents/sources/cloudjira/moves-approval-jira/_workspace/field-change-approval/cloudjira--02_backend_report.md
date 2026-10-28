# field-change-approval — 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-04 · autopilot 무인 회차 1회차(재작업 아님)
> 입력: `01_architect_design.md`, `00_input/requirement.md`, `04_spike_todo.md`, QUESTIONS Q90~Q97(전부 기본 가정으로 구현)
> 금지 준수: `forge` 명령·git 조작 없음, asApp 추가 없음(AGENTS.md 무변경), 리포 밖 수정 없음.

## 설계 불변식 충돌

없음. 엔진 상태 머신·`derive.js` 무변경, 상수·키 빌더·선택 훅(`afterDecide`)만 추가했다.

## 테스트 결과

| 대상 | 명령 | 결과 |
|---|---|---|
| 백엔드 | 리포 루트 `npx jest` | **89 스위트 / 1277 테스트 통과**(기준선 79 / 1050 → +10 스위트, +227 테스트) |
| 프론트 | `static/ui` 에서 `npx jest`(package.json `test`) | **35 스위트 / 284 테스트 통과**(무변경, 깨짐 없음) |
| 권한 계약 | `test/permission/permissionMap.contract.test.js` | 통과(신규 8개 3단계 등록 대조) |

완료 기준 테스트 3종(이름 그대로):
- **`충돌(스냅샷 불일치) 시 적용하지 않음`** — `src/domain/fieldChange/__test__/fieldChangeDomain.test.js`(planApply CONFLICT), `src/resolver/fieldChange/__test__/FieldChangeApplier.test.js`(PUT 미호출 + CONFLICT 기록), `src/resolver/approval/target/__test__/FieldChangeTargetAdapter.test.js`(beforeDecide 만료 판정), `src/resolver/fieldChange/__test__/FieldChangeIsolation.test.js`(엔진+어댑터 실경로: 만료·`FIELD_CHANGE_CONFLICT`·PUT 없음)
- **`같은 필드 열린 요청 하나`** — `FieldChangeIsolation.test.js`(같은 필드 두 번째 `ALREADY_OPEN` + 고아 부속 행 정리, 다른 필드 성공, ISSUE·TRANSITION·FIELD_CHANGE 동시 열림)
- **`적용 재시도 이중 적용 없음`** — `FieldChangeApplier.test.js` describe(동시 claim 1회 PUT, 기록 전 사망 → ALREADY, TIMEOUT 뒤 재시도 ALREADY, APPLIED 재호출 Jira 0콜, fencing token, 결정적 이벤트 id) + 도메인 테스트 재시도 시나리오

## 마이그레이션

| 번호 | 이름(배포 후 변경 금지) | DDL |
|---|---|---|
| v033 | `v033_create_field_change_rule_table` | `CREATE_FIELD_CHANGE_RULE_TABLE` |
| v034 | `v034_create_field_change_request_table` | `CREATE_FIELD_CHANGE_REQUEST_TABLE` |
| v035 | `v035_create_field_change_bypass_table` | `CREATE_FIELD_CHANGE_BYPASS_TABLE` |

정의는 `src/rdb/schema/ddl/fieldChange.sql.js`(설계 §5.3 그대로). 신규 테이블 3개 → 배포 시 `--approve MAJOR_VERSION_RULE`. 모든 신규 테이블 참조 전 `isTableReady` 프로브(규칙·부속 행 `ready()`, 우회 `ready()`, 트리거는 `tableReady('field_change_rule')` — `ensureMigratedOnce` 미호출).

## resolver 3단계 등록

`src/resolver/fieldChange/FieldChangeController.js`(`registerFieldChangeController`) → `src/permission/PermissionMap.js` → `src/index.js CONTROLLER_REGISTRARS`.

| resolver | 권한 축 |
|---|---|
| `getIssueFieldChanges` · `getFieldChangeForm` · `searchFieldChangeUsers` · `createFieldChangeApproval` | `{ issue: 'view', issueIdKey: 'issueId' }` (Q92) |
| `applyFieldChange` | `'SELF'` + 서비스: `assertTargetVisible` + (요청자 \| 결재선에 있는 사람 \| 대리 결정자 \| Jira 관리자) |
| `listFieldChangeRules` · `saveFieldChangeRule` · `deleteFieldChangeRule` | `{ project: 'admin', projectIdKey: 'projectId' }` |

## 실제 응답 shape (전부 `{success:true, content:<아래>}` 의 content)

### `getIssueFieldChanges({issueId})`
```js
{
  issue: { issueId, issueKey, title, projectId, projectKey, issueTypeId },
  enabled: boolean,
  notEnabledReason: 'NO_RULE' | 'PROJECT_DISABLED' | null,
  fields: [{
    ruleId, fieldId, fieldName /* 규칙 저장 스냅샷 */, fieldType,
    current: { value, display } | null,          // null = 이 이슈에서 읽을 수 없음
    flowMissing: boolean,
    latest: FieldChangeSummary | null,
    state: 'NONE'|'PENDING'|'APPLYING'|'APPLIED'|'APPLY_FAILED'|'CONFLICT'|'SUPERSEDED'|'REJECTED'|'CLOSED',
    canRequest: boolean,
    canApply: boolean,
  }],
  bypass: [{ bypassId, fieldId, fieldName, from:{value,display}, to:{value,display}, actorKey, occurredAt,
             effect: 'NONE'|'EXPIRED_PENDING'|'OVERWROTE_APPLIED', requestId }],
  history: FieldChangeSummary[],                  // 최근 10건
}
FieldChangeSummary = {
  requestId, status, state, fieldId, fieldName, fieldType,
  from: {value, display}, to: {value, display},
  requesterKey, createdAt, updatedAt, currentStepOrder, stepCount,
  currentStepName,                                 // PENDING 일 때만, 그 외 null
  applyStatus: 'WAITING'|'APPLYING'|'APPLIED'|'FAILED'|'CONFLICT'|'SUPERSEDED',
  applyCode,                                       // FAILED 일 때만 코드, 그 외 null
  appliedAt, appliedBy,
  expiryReason,                                    // EXPIRED 일 때만('FIELD_CHANGED'|'DEADLINE'|'ISSUE_DELETED'…), 그 외 null
}
```
부작용(지연 판정): 결재 중 요청의 from ≠ 조회자 asUser 현재 값이면 만료(FIELD_CHANGED) 후 목록을 다시 읽는다. 값을 못 읽으면 건너뜀.

### `getFieldChangeForm({issueId, fieldId})`
```js
{
  issue: { issueId, issueKey, title, projectId },
  field: { fieldId, fieldName /* editmeta 이름 우선, 없으면 규칙 스냅샷 */, fieldType, clearable },
  current: { value, display },
  options: [{ id, name, iconUrl }] | null,
  optionsSource: 'EDITMETA' | 'PRIORITY_LIST' | null,
  rule: { ruleId },
  flow: { flowId, name, defaultDeadlineDays, steps:[{stepOrder, stepName, requiredApprovals, principals:[{principalType, principalKey}]}] } | null,
  pendingApprovedRequestId: string | null,
}
```

### `searchFieldChangeUsers({issueId, fieldId, query})` → `{ users: [{ accountId, displayName, avatarUrl }] }` (최대 20, `accountType==='atlassian'`·active 만)

### `createFieldChangeApproval(...)` → `{ requestId, status: 'PENDING', currentStepOrder: 1, fieldId, state: 'PENDING' }`

### `applyFieldChange({requestId})` → `{ requestId, apply: FieldApplyResult }`
```js
FieldApplyResult = {
  status: 'APPLIED'|'FAILED'|'CONFLICT'|'WAITING'|'APPLYING',
  already: boolean,
  code: null|'NO_PERMISSION'|'NOT_EDITABLE'|'ISSUE_NOT_FOUND'|'VALUE_UNREADABLE'|'REJECTED_BY_JIRA'|'TIMEOUT'|'BUDGET',
  current: { value, display } | null,   // CONFLICT 때만
  appliedAt: number|null, appliedBy: string|null, attempts: number,
}
```

### `listFieldChangeRules({projectId})`
```js
{
  project: { projectId, projectKey, name, style },
  projectEnabled: boolean,
  rules: [{ ruleId, projectId, issueTypeId, issueTypeName, fieldId, fieldName, fieldType, fieldMissing,
            flowId, flowName, flowMissing, enabled, openCount, updatedAt, updatedBy, rev }],
  issueTypes: [{ id, name, iconUrl }],
  fields: [{ fieldId, name, fieldType, custom }],          // 지원 유형만, 이름순, 다른 team-managed 프로젝트 전용 필드 제외
  unsupported: [{ fieldId, name, reason }],                 // 최대 30
  flows: [{ flowId, name, enabled: true }],
}
```
### `saveFieldChangeRule` → `{ rule: FieldChangeRule }` · `deleteFieldChangeRule` → `{ ruleId, deleted: true, openCount }`

### 변경 resolver
| resolver | 실제 변경 |
|---|---|
| `decideApproval` | FIELD_CHANGE 응답에만 `apply` 키: `{ requestId, status, currentStepOrder, apply: FieldApplyResult \| null }`. 다른 종류는 키 없음. 결정 직전 충돌 → `FIELD_CHANGE_CONFLICT` cause `{requestId}` |
| `bulkApprove` | `results[]` 항목 `{ requestId, ok:true, status, applyStatus? }` — `applyStatus` 는 적용을 시도한 건(최종 승인)만. 15초 예산 초과 건 `'WAITING'`. 실패 항목 `{ requestId, ok:false, code }`(`FIELD_CHANGE_CONFLICT` 가능) |
| `getApprovalDetail` | `target = { kind:'FIELD_CHANGE', key:'<issueId>:<fieldId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null, fieldChange:{ fieldId, fieldName, fieldType, from, to, current, state, applyStatus, applyCode, appliedAt, appliedBy, attempts, conflictValue, applyRetryable } }` (describe 실패 시 `fieldChange:null`) |
| `getApprovalHistory` | 무변경. `events[].eventType` 에 `FIELD_APPLIED`(reason `'WRITE'\|'ALREADY'`)·`APPLY_FAILED`(reason 실패 코드)·`APPLY_CONFLICT`(reason null)·`CHANGED_AFTER_APPROVAL`(reason `'BYPASS'`) |
| `getApprovalCertificate` | 최상위 `fieldChange: { fieldName, fieldType, from, to, applyStatus, appliedAt, appliedBy }` 추가 |
| `listInbox` | 행에 `fieldChange: { fieldId, fieldName, fieldType, from, to } \| null` |
| `listNotifications` | 항목에 `fieldChange`(위와 같음 \| null). templateKey 6개 추가(아래 i18n) |
| `exportExpiredApprovals` | FIELD_CHANGE 행에 `fieldChange: { fieldId, fromValue, toValue, applyStatus, appliedAt }` |

## 계약과 다른 점

- **D1** `getIssueFieldChanges` — `PROJECT_DISABLED` 이어도 `fields[]` 를 채운다(전부 `canRequest:false`, 지연 만료는 수행). 설계는 이 경우를 명시하지 않았다. 화면이 "사용 안 함" 안내와 함께 행을 보이거나 숨길 수 있다. `NO_RULE` 이면 `fields:[]` 이지만 `bypass`·`history` 는 채워 보낸다(규칙을 지운 뒤에도 과거 기록 표시 가능).
- **D2** `getFieldChangeForm` — 단일 선택(SELECT) 필드에서 요청자 editmeta 에 그 필드가 없으면 에러가 아니라 `options:null, optionsSource:null` 을 돌려준다. 요청 생성 때 `FIELD_CHANGE_OPTIONS_UNAVAILABLE`(Q93). 폼은 이 조합을 "선택지 없음 — 요청 불가"로 그리면 된다.
- **D3** `decideApproval.apply` — 훅이 던지거나, 최종 승인이지만 적용 대상이 아닌 경우(부속 행 없음·이미 대체됨) `apply:null`. 예산 초과 `WAITING` 의 `attempts` 는 0.
- **D4** `getApprovalCertificate.target.fieldChange` 는 `null` 이다 — 증명서는 저장 스냅샷으로 그리는 기존 규칙(전환 증명서의 `target.transition` 도 null)을 따른다. 필드 사실은 최상위 `fieldChange` 블록에 있다.
- **D5** `getIssueFieldChanges` 의 Jira 호출 수를 설계대로 2(가드+이슈)로 유지하려고 SQL 1문장(`field_change_rule` 의 사이트 전체 규칙 필드 id, LIMIT 100)을 먼저 읽는다. 상한 밖 필드나 C16 거부 시 이슈를 한 번 더 읽는다(최대 3콜).
- **D6** `applyFieldChange` 자격의 "결재자" = 이 요청 결재선 **어느 단계에든 있는 사람**(아직 결정 안 한 사람 포함) + 위임 결정자(`decisions[].delegateKey`). Jira 관리자는 `principal.isJiraAdmin`. 쓰기 권한은 Jira 가 asUser PUT 에서 판정.
- **D7** `searchFieldChangeUsers` — `query` 2자 미만은 에러가 아니라 `{users:[]}`, 80자 초과·문자열 아님은 `INVALID_TARGET`.
- **D8** 우회 판정 도메인(`classifyFieldEvent`)은 설계대로 `EXPIRE_PENDING` 을 돌려주고, 저장·응답(`bypass[].effect`)은 `EXPIRED_PENDING` 이다(`storedEffectOf`).
- **D9** 엔진 `afterDecide` 옵션에 `notify`(엔진 앱 알림 함수)가 추가됐다 — 내부 계약. FieldChangeTargetAdapter 그래프가 NotificationService 를 import 하면 순환(→ filterVisibleRows → TargetRegistry)이 생겨 로드 순서에 따라 레지스트리에서 어댑터가 빠졌다(실제로 테스트에서 재현). 적용기는 알림 함수를 호출부에서 받는다. 회귀 테스트 `moduleCycle.test.js`.
- **D10** 이력 이벤트 라벨 키 — 설계 §8.2 의 `history.event.*` 대신 기존 위치(`detail.event.<소문자>`, 예 `detail.event.consumed`)를 따르면 `detail.event.field_applied` · `detail.event.apply_failed` · `detail.event.apply_conflict` 가 된다(서버는 eventType 만 보낸다 — 프론트 결정).

## 필요한 i18n 키 (locales 는 프론트 단계 — 백엔드 계약 테스트는 locales 를 요구하지 않음)

- `error.*` 12: `FIELD_CHANGE_RULE_NOT_FOUND`, `FIELD_CHANGE_PROJECT_DISABLED`, `FIELD_CHANGE_FIELD_UNAVAILABLE`, `FIELD_CHANGE_UNSUPPORTED_FIELD`, `FIELD_CHANGE_INVALID_VALUE`, `FIELD_CHANGE_NO_CHANGE`, `FIELD_CHANGE_OPTIONS_UNAVAILABLE`, `FIELD_CHANGE_REASON_REQUIRED`, `FIELD_CHANGE_CONFLICT`, `FIELD_CHANGE_NOT_APPLICABLE`, `FIELD_CHANGE_APPLY_IN_PROGRESS`, `FIELD_CHANGE_RULE_CONFLICT`
- `notification.template.*` 6: `fieldChangeApproved`, `fieldChangeConflict`, `fieldChangeIssueDeleted`, `fieldChangeApplyFailed`, `fieldChangeApplyConflict`, `fieldChangeBypassed`
- 알림 kind 가 새로 생김: `APPLY_FAILED`, `APPLY_CONFLICT`(알림 패널이 kind 로 아이콘·라벨을 고르면 키 필요)
- 이력 이벤트 3: `detail.event.field_applied`, `detail.event.apply_failed`, `detail.event.apply_conflict`(D10). `CHANGED_AFTER_APPROVAL` 은 기존 `detail.event.changed_after_approval` 재사용(문구가 타임시트 전용이면 손볼 것)
- `state.expiry.FIELD_CHANGED`(기존 `state.expiry.ISSUE_STATE_CHANGED` 와 같은 위치)
- `policy.audit.area.fieldChangeRule`(설정 이력 영역 — `policy.audit.area.transitionRule` 옆)
- `cert.target.field_change`, `inbox.type.field_change`(대상 종류 라벨, 기존 `issue_transition` 패턴), `cert.fieldChange`·`cert.appliedAt`·`cert.appliedBy`·`cert.applyStatus`, `inbox.column.fieldChange`, `inbox.bulk.applyWaiting`
- 신규 네임스페이스 `fieldChange.json`(설계 §8.1 전부) — `state.*` 9, `applyCode.*` 7(BUDGET 포함), `rules.unsupported.*` 8(`UnsupportedReason` 과 같은 이름), `bypass.effect.*` 3(`NONE`·`EXPIRED_PENDING`·`OVERWROTE_APPLIED`), `type.*` 5

## 변경 파일

신규
- `src/domain/fieldChange/{fieldType,fieldValue,applyPlan,eventClassify,rule,state}.js` + `__test__/fieldChangeDomain.test.js`
- `src/rdb/schema/ddl/fieldChange.sql.js`
- `src/resolver/fieldChange/{FieldChangeController,FieldChangeService,FieldChangeApplier,FieldChangeEventService,FieldChangeRuleRepository,FieldChangeRepository,FieldBypassRepository,IssueFieldReader}.js`
- `src/resolver/fieldChange/__test__/{FieldChangeApplier,FieldChangeService,FieldChangeEventService,FieldChangeIsolation,FieldChangeRepositories,IssueFieldReader,moduleCycle}.test.js`, `memoryFieldChangeRepo.js`(테스트 보조)
- `src/resolver/approval/target/FieldChangeTargetAdapter.js` + `__test__/FieldChangeTargetAdapter.test.js`
- `src/resolver/approval/__test__/ApprovalServiceFieldHooks.test.js`

변경
- `src/domain/approval/constants.js`(TargetKind·ExpiryReason·EventType 3), `scopeKey.js`(FIELD_ID·빌더·`fieldChangeTargetFromKey`), `transitions.js`(TARGET_CHANGE_REASONS) + 기존 테스트 2파일에 추가분
- `src/resolver/approval/ApprovalService.js`(afterDecide 훅·응답 apply·bulk 예산·applyStatus), `target/TargetRegistry.js`
- `src/resolver/notification/NotificationService.js`(템플릿 6·수신자·`fieldChange`), `src/resolver/inbox/InboxService.js`, `src/resolver/retention/{RetentionRepository,RetentionService}.js` + 각 테스트 추가분
- `src/trigger/onIssueChanged.js`(세 번째 try/catch) + 테스트
- `src/permission/PermissionMap.js`, `src/index.js`, `src/utils/errors/ErrorCodes.js`
- `src/rdb/schema/ddl/index.js`, `src/rdb/schema/migrate.js` + `__test__/migrate.test.js`
- `docs/DESIGN.md`(§2 ③·§8 한 줄씩), `manifest.yml`(주석 2줄만)
- `_workspace/field-change-approval/04_spike_todo.md`(C16~C19)

## 미검증 (04_spike_todo.md 에 추가)

- **C16** 이슈 GET `fields=` 에 다른 프로젝트 전용·없는 필드 id 가 섞일 때 400 여부 — 대비로 기본 필드 재조회 구현
- C17 요약 조회의 상관 서브쿼리(만료 사유)가 TiDB 에서 허용되는지
- C18 PUT 3초 시간 상한 뒤 실제 적용 여부(TIMEOUT → 재시도 ALREADY)
- C19 일괄 승인 예산 15초의 적정성
- 기존 C1~C15 는 그대로 유효. 특히 **C1·C2·C3**(트리거 페이로드 — `changelog.id`·`items[].fieldId`·`issue.fields.project/issuetype`·값 형식)과 **C5**(PUT 실패 코드)가 배포 최우선.

## 새 질문

| # | 질문 | 기본 가정(구현) | 대안 | 권장 |
|---|---|---|---|---|
| Q98 | 적용 PUT 의 Jira 알림 메일 — 앱이 승인값을 적용하면 Jira 가 워처에게 "필드 변경" 메일을 보낸다(`notifyUsers` 기본 true). 앱 알림(fieldChangeApproved)과 겹친다 | **Jira 기본 그대로(메일 발송)**. `notifyUsers=false` 는 Jira 관리자·프로젝트 관리자 권한이 있어야 해 결재자 asUser 로는 대개 400 이다 | 정책 키로 끄기(관리자 결재자만 효과) | 기본 가정 — 이력·메일이 "사람이 바꾼 것"과 같게 남는 편이 요구 3 과 맞다. C14 실측 때 함께 확인 |
| Q99 | "다시 적용" 자격의 "결재자" 범위 | 결재선 **어느 단계에든 있는 사람**(미결정자 포함) + 위임 결정자 + 요청자 + Jira 관리자 | 승인(APPROVE)한 사람만 | 기본 가정 — 쓰기 권한은 어차피 Jira 가 asUser 로 다시 판정하고, 최종 결재자가 편집 권한이 없을 때 같은 결재선의 다른 사람이 적용할 수 있어야 실패 건이 풀린다 |

## 발견 (범위 밖 — 고치지 않음)

- `TransitionTargetAdapter`·`IssueTargetAdapter` 는 우연히 NotificationService 를 import 하지 않아 순환이 없었다. 앞으로 어댑터 그래프에서 알림·업무함 서비스를 import 하면 같은 순환이 생긴다 — `moduleCycle.test.js` 가 FIELD_CHANGE 기준으로만 지킨다. 어댑터 규약(TargetRegistry 머리 주석)에 "어댑터 그래프는 NotificationService·InboxService 를 import 하지 않는다"를 적어 두는 것을 제안.
- `RetentionRepository.ready()` 가 CHILD_TABLES 전부를 요구하므로, `field_change_request` 마이그레이션 전에는 보관 정리 화면이 미준비로 보인다(전환 승인 v030 추가 때와 같은 성격 — 첫 resolver 호출의 `ensureMigratedOnce` 로 곧 해소).
