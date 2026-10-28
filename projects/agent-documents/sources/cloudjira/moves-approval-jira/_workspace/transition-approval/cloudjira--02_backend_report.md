# transition-approval 백엔드 보고서 (Phase 3)

> backend-engineer · 2026-10-03 · autopilot 무인 회차. 계약 원천 `01_architect_design.md`. 열린 질문 Q52~Q63 은 전부 기본 가정으로 구현했다.
> `forge`·`git add/commit` 실행 안 함. 리포 밖 파일 수정 없음(Confluence 판 `CommentNotifier.js` 는 읽기만).

## 결과 요약

- 백엔드 `npm test -- --runInBand`: **64 suites / 866 tests 통과**(기준선 55 / 713 → +9 suites / +153 tests). 기존 테스트는 1건만 의도적으로 고쳤다(아래 §8).
- UI `npm run test:ui -- --runInBand`: 20 / 161 통과(로케일 추가 영향 확인용으로만 실행, UI 코드는 손대지 않음). `npm run merge` 통과.
- 신규 resolver 5개 3단계 등록 완료(계약 테스트 통과), 기존 resolver 10개 확장, 마이그레이션 **v029·v030**, 함수형 validator + 이슈 트리거 + manifest 모듈.
- 설계와 충돌하는 불변식 없음.

## 1. 파일

**신규**
- 도메인(순수): `src/domain/transition/{rule,usability,judge,validatorPayload,statusChange,messages,commentAdf}.js`
- 테스트: `src/domain/transition/__test__/{judge,transitionDomain}.test.js`
- resolver: `src/resolver/transition/{TransitionController,TransitionService,TransitionRuleRepository,TransitionRepository,IssueStateReader,TransitionValidatorService,TransitionChangeService,TransitionCommentNotifier,projectEnablement}.js`
- 테스트: `src/resolver/transition/__test__/{TransitionService,TransitionValidatorService,TransitionChangeService,TransitionCommentNotifier,TransitionRepositories}.test.js`
- 어댑터: `src/resolver/approval/target/TransitionTargetAdapter.js` + `__test__/TransitionTargetAdapter.test.js`
- 엔진 훅 테스트: `src/resolver/approval/__test__/ApprovalServiceTargetHooks.test.js`
- 트리거: `src/trigger/transitionValidator.js`, `src/trigger/onIssueChanged.js`
- DDL: `src/rdb/schema/ddl/transition.sql.js`
- 로케일: `locales/{kr,en}/transition.json` — §8.1 **전체 키**(UI + `server.*`)를 두 언어로 채웠다(설계 §11.3-2 "먼저 만드는 쪽이 두 언어 모두 채운다")

**변경**
- 도메인: `src/domain/approval/constants.js`(TargetKind.ISSUE_TRANSITION, ExpiryReason.ISSUE_STATE_CHANGED·ISSUE_DELETED, EventType.CONSUMED), `scopeKey.js`(빌더·`transitionTargetFromKey`·예약 주석), `transitions.js`(`expireByTargetChange`), `__test__/transitions.test.js`(추가만)
- 엔진: `ApprovalService.js`(훅 3개 + `expireForTarget`·`notifyExternal`), `CertificateService.js`(키 일반화), `target/TargetRegistry.js`
- `NotificationService.js`(템플릿 3종·`transition` 필드), `InboxService.js`(`transition` 필드), `RetentionRepository.js`(CHILD_TABLES), `RetentionService.js`(내보내기 `transition`), `FlowService.js`(`getFlowForRequest`)
- 정책: `SettingsRepository.js`(키 2개 — 기본값·KVS 키 맵·GLOBAL_ONLY), `SettingsService.js`(검증 2개), `__test__/SettingsService.test.js`(§8)
- 등록: `src/permission/PermissionMap.js`(5개), `src/index.js`(registrar + export 2), `src/utils/errors/ErrorCodes.js`(6개)
- 스키마: `src/rdb/schema/ddl/index.js`, `migrate.js`, `__test__/migrate.test.js`
- `manifest.yml`, `AGENTS.md`(asApp 4번), `docs/DESIGN.md`(§2.1 scopeKey 한 줄, §8 consumed_at·규칙 테이블 두 줄)
- `locales/{kr,en}/error.json`(6개), `locales/{ko-KR,en-US}.json`(merge 산출)
- `_workspace/transition-approval/04_spike_todo.md`(X21~X26)

## 2. resolver 와 실제 응답 shape (전부 `res.content`)

모든 Controller 가 기존 관례대로 `{ content: <result> }` 를 돌려주므로 실제 응답은 `{ success: true, content: { ... } }` 다. 설계 §2 의 "shape" 는 `content` 안이다. 실패는 `{ success:false, error:{ name, code, message, cause } }`.

### 2.1 등록(3단계) — `test/permission/permissionMap.contract.test.js` 통과

| resolver | PermissionMap | 서비스 |
|---|---|---|
| `getIssueTransitionApprovals` | `{ issue: 'view', issueIdKey: 'issueId' }` | `TransitionService.getIssueTransitionApprovals` |
| `createTransitionApproval` | `{ issue: 'view', issueIdKey: 'issueId' }` | `createTransitionApproval` |
| `listTransitionRules` | `{ project: 'admin', projectIdKey: 'projectId' }` | `listTransitionRules` |
| `saveTransitionRule` | `{ project: 'admin', projectIdKey: 'projectId' }` | `saveTransitionRule` |
| `deleteTransitionRule` | `{ project: 'admin', projectIdKey: 'projectId' }` | `deleteTransitionRule` |

`CONTROLLER_REGISTRARS` 마지막에 `registerTransitionController`.

### 2.2 `getIssueTransitionApprovals({ issueId })`

```js
content = {
  issue: { issueId, issueKey, title, projectId, projectKey, issueTypeId, statusId, statusName },  // 전부 string|null
  enforced: boolean,
  notEnforcedReason: 'NO_RULE' | 'PROJECT_DISABLED' | 'GLOBAL_DISABLED' | null,
  targets: [{
    toStatusId: string,
    toStatusName: string|null,
    toStatusCategoryKey: string|null,                 // 'new'|'indeterminate'|'done' — 실행 가능한 전환이 없으면 null
    transitions: [{ transitionId: string, name: string|null }],
    ruleId: string,
    flow: { flowId, name, defaultDeadlineDays: number|null,
            steps: [{ stepOrder, stepName: string|null, requiredApprovals, principals: [{ principalType: 'USER'|'GROUP'|'AGROUP', principalKey }] }] } | null,
    latest: TransitionRequestSummary | null,
    usability: 'NONE'|'PENDING'|'USABLE'|'CONSUMED'|'STALE'|'REJECTED'|'CLOSED',
    canRequest: boolean,
  }],
  history: TransitionRequestSummary[],                 // 최신순 최대 10
}

TransitionRequestSummary = {
  requestId, status, usability,
  fromStatusId, fromStatusName, toStatusId, toStatusName,
  transitionId, transitionName,
  requesterKey, createdAt, updatedAt,                  // epoch ms
  currentStepOrder, stepCount,                         // number|null
  currentStepName,                                     // PENDING 일 때만, 아니면 null
  armedAt, consumedAt, consumedBy,                     // number|null, number|null, string|null
}
```
- `enforced=false` 면 `targets: []`(history 는 채운다).
- 테이블 미준비면 `{ enforced:false, notEnforcedReason:'NO_RULE', targets:[], history:[] }`.
- 부작용(지연 판정): 목록을 읽기 **전에** `TransitionChangeService.onStatusObserved(issueId, statusId)` — 대기 요청 출발 상태 ≠ 현재 → EXPIRED(ISSUE_STATE_CHANGED), 승인 요청 목적 상태 = 현재 → 소비 확정(source `LAZY`). 응답은 반영 뒤 값.
- `targets` 는 이 이슈 유형에 걸린 규칙(정확 유형이 `*` 보다 우선)의 목적 상태 중 (실행 가능한 전환이 있거나) (latest 가 PENDING·USABLE) 인 것.
- `canRequest = transitions.length>0 && usability ∉ {PENDING, USABLE} && flow !== null`.
- 에러: `INVALID_TARGET`(형식·이슈를 볼 수 없음). 가드: `PERMISSION_ISSUE_VIEW_DENIED`.

### 2.3 `createTransitionApproval({ issueId, toStatusId, transitionId?, requestMessage?, expiresAt?, ccKeys? })`

```js
content = { requestId: string, status: 'PENDING', currentStepOrder: 1, toStatusId: string, usability: 'PENDING' }
```
- `steps`·`flowId`·`supersedes` 를 보내도 무시한다(결재선 = 규칙 Flow, Q56).
- `expiresAt` 을 주면 엔진이 검증(과거·형식 불량 → `INVALID_TARGET`), 안 주면 Flow `defaultDeadlineDays`(없으면 마감 없음).
- 에러 code 와 cause:

| code | 언제 | cause |
|---|---|---|
| `INVALID_TARGET` | id 형식, 이슈를 볼 수 없음, `transitionId` 가 다른 상태로 가는 전환 | `''` |
| `TRANSITION_NOT_AVAILABLE` | 이미 그 상태 / 그 상태로 가는 실행 가능한 전환 없음 / `transitionId` 가 실행 가능 목록에 없음 | `''` |
| `TRANSITION_RULE_NOT_FOUND` | 규칙 없음, 또는 전역 `transitionApprovalEnabled=false` | `''` |
| `TRANSITION_PROJECT_DISABLED` | 프로젝트 사용 안 함(Q58) | `''` |
| `TRANSITION_ALREADY_APPROVED` | 같은 목적 상태에 USABLE 승인 있음 | `{ requestId }` |
| `INVALID_APPROVER_CONFIGURATION` | Flow 없음·비활성·이 프로젝트 미적용·단계 없음·그룹 비어 있음 | `''` |
| `ALREADY_OPEN` | 같은 (이슈, 목적 상태)에 열린 요청(dedupe) — name `ConcurrencyError` | 엔진 그대로 |
| `APPROVER_NOT_REGISTERED` / `APPROVER_NO_ACCESS` | 명부·결재자 이슈 열람(엔진 그대로) | `''` |
| `STORAGE_NOT_READY` | v029·v030 미적용 | `''` |

### 2.4 `listTransitionRules({ projectId })`

```js
content = {
  project: { projectId, projectKey, name, style: 'classic'|'next-gen'|null },
  globalEnabled: boolean,
  projectEnabled: boolean,
  rules: TransitionRule[],
  issueTypes: [{ id, name, iconUrl: string|null }],
  statuses: [{ id, name, categoryKey: string|null, issueTypeIds: string[] }],
  flows: [{ flowId, name, enabled: true }],
}
TransitionRule = {
  ruleId, projectId, issueTypeId /* 숫자 id 또는 '*' */, issueTypeName: string|null /* '*' 면 null */,
  toStatusId, toStatusName: string|null, flowId, flowName: string|null, flowMissing: boolean,
  enabled: boolean, openCount: number, updatedAt: number|null, updatedBy: string|null, rev: number,
}
```
- 이름은 이번 Jira 목록에서(없어진 유형·상태 → null). `flowMissing` = 활성 + 이 프로젝트 적용 Flow 목록에 없음(비활성 포함).
- 에러: `INVALID_TARGET`(프로젝트를 볼 수 없음). 가드: `PERMISSION_PROJECT_ADMIN_REQUIRED`. 규칙 테이블 미준비면 `rules: []`.

### 2.5 `saveTransitionRule({ projectId, ruleId?, issueTypeId, toStatusId, flowId, enabled, rev? })`

```js
content = { rule: TransitionRule }
```
- `ruleId` 없으면 생성, 있으면 `rev` 필수(정수 ≥1).
- 에러: `INVALID_TARGET`(형식, 이 프로젝트에 없는 유형·상태, 유형에 없는 상태, 다른 프로젝트 ruleId, `enabled` 비불리언), `TRANSITION_RULE_CONFLICT`(cause `{ ruleId }` — 기존 규칙 id, 못 찾으면 null), `INVALID_APPROVER_CONFIGURATION`(Flow 비활성·미적용), `CONCURRENT_MODIFICATION`(name `ConcurrencyError`), `STORAGE_NOT_READY`.
- 설정 이력: `area:'transitionRule', action:'save', detail:{ projectId, ruleId, issueTypeId, toStatusId, flowId, enabled }`.

### 2.6 `deleteTransitionRule({ projectId, ruleId, rev })`

```js
content = { ruleId: string, deleted: true, openCount: number }
```
- 열린 요청은 그대로. 에러: `INVALID_TARGET`, `CONCURRENT_MODIFICATION`, `STORAGE_NOT_READY`. 이력 `action:'delete', detail:{ projectId, ruleId }`.

### 2.7 변경 resolver (추가 필드만 — 기존 키·의미 무변경)

| resolver | 실제 변경 |
|---|---|
| `getApprovalDetail` | ISSUE_TRANSITION 이면 `content.target = { kind:'ISSUE_TRANSITION', key:'<issueId>:<toStatusId>', issueId, issueKey, title, projectId, projectKey, projectName, revision:null, transition }`. `transition = { transitionId, transitionName, fromStatusId, fromStatusName, toStatusId, toStatusName, currentStatusId, currentStatusName, usability, armedAt, consumedAt, consumedBy }`. **Jira 이슈 조회가 실패하면 `transition: null`**(저장 스냅샷으로 그림). `canRequest` = 최신 요청이 PENDING 아님 && 지금 그 목적 상태로 가는 전환이 있음 |
| `getApprovalHistory` | 무변경. `events[].eventType` 에 `'CONSUMED'`(actorKey = 실행자 또는 null, reason = `'TRIGGER'|'LAZY'|'VALIDATOR_CHANGELOG'`) |
| `getApprovalCertificate` | ISSUE_TRANSITION: 최상위 `transition: { fromStatusName, toStatusName, transitionName, consumedAt, consumedBy }`(timesheet 블록 자리). `target` 은 저장 스냅샷 기반이라 **`target.transition` 은 null** |
| `decideApproval` | ISSUE_TRANSITION 대기 요청: PIN 확인 **전에** 결재자 asUser 로 이슈 상태 확인 → 출발 상태와 다르면 요청 EXPIRED + 실패 `code:'TRANSITION_STATE_CHANGED'`, `cause:{ requestId, currentStatusId }`. 이슈 조회 실패면 확인 생략. 결정 성공 후 Jira 코멘트(실패 무시) |
| `bulkApprove` | `results[].code` 에 `'TRANSITION_STATE_CHANGED'` 가능. **일괄 경로는 코멘트 생략**(앱 내 알림은 그대로) |
| `cancelApproval` | 회수 후 Jira 코멘트(실패 무시). 응답 무변경 |
| `listInbox` | 모든 `items[]` 에 `transition: { fromStatusName, toStatusName } | null`(ISSUE_TRANSITION 행만 값, 부속 행 조회 실패 시 null). 가시성 = 어댑터 `filterVisible`(permissions/check 일괄) |
| `listNotifications` | 모든 `items[]` 에 `transition`(위와 같음). `templateKey`: APPROVED+ISSUE_TRANSITION → `notification.template.transitionApproved`, EXPIRED+ISSUE_STATE_CHANGED → `notification.template.transitionStateChanged`, EXPIRED+ISSUE_DELETED → `notification.template.transitionIssueDeleted` |
| `getApprovalSettings`/`saveApprovalSettings` | 정책 키 `commentNotifyEnabled`(기본 true), `transitionApprovalEnabled`(기본 true) |
| `getProjectPolicy`/`saveProjectPolicy` | `commentNotifyEnabled` 덮어쓰기 가능, `transitionApprovalEnabled` 는 GLOBAL_ONLY(덮어쓰기 저장 시 버려짐) |
| `getStorageUsage` | 코드 무변경 — information_schema 전체를 읽으므로 신규 테이블 2개가 자동으로 나온다 |
| `exportExpiredApprovals` | `requests[]` 중 `targetKind:'ISSUE_TRANSITION'` 행에만 `transition: { fromStatusId, toStatusId, consumedAt } | null` 키 추가(다른 행은 키 없음) |

## 3. 에러 코드 (신규 6 — `ErrorCodes` + `locales/{kr,en}/error.json` 동시)

`TRANSITION_NOT_AVAILABLE`, `TRANSITION_RULE_NOT_FOUND`, `TRANSITION_PROJECT_DISABLED`, `TRANSITION_ALREADY_APPROVED`(cause `{requestId}`), `TRANSITION_STATE_CHANGED`(cause `{requestId, currentStatusId}`), `TRANSITION_RULE_CONFLICT`(cause `{ruleId}`). 문구는 설계 §8.2 그대로.

## 4. 스키마·마이그레이션

- `v029_create_transition_rule_table`, `v030_create_transition_request_table` — v028 뒤에만 추가, 기존 이름 무변경. DDL 은 설계 §5.3 그대로(`src/rdb/schema/ddl/transition.sql.js`).
- 신규 테이블 참조 전 프로브: `TransitionRuleRepository.ready()`, `TransitionRepository.ready()`(transition_request + approval_request), validator 는 `isTableReady` 3개(ensureMigratedOnce 미호출), 트리거는 `repository.ready()`.
- `RetentionRepository.CHILD_TABLES` 에 `transition_request`(요청과 함께 삭제). `transition_rule` 은 대상 아님.
- 배포 회차: SQL 테이블 추가 → `--approve MAJOR_VERSION_RULE`, 모듈 추가 → `forge install --upgrade`.

## 5. manifest 변경

- `jira:workflowValidator` `transition-approval-validator`(name/description/`function: transitionValidator`) — 키 이름 X18.
- `trigger` `issue-changed` → `onIssueChanged`, 이벤트 `avi:jira:updated:issue`·`avi:jira:deleted:issue`.
- `function` `transitionValidator` → `index.validateTransition`, `onIssueChanged` → `index.onIssueChanged`.
- scope 추가 없음. js-yaml 로 파싱 확인. `forge lint` 미실행(금지).
- **Phase 4(프론트) 할 일 — manifest 에 넣지 않았다**: `jira:issueContext`(`transition-approval-context`, `resource: main/issue`), `jira:issuePanel`(`transition-approval-panel`, `main/issue`), `jira:issueAction` `transition-approval-action`(`main/modal`, 기존 worklog-log-action 목록에 추가), `resources[0].entry.issue: issue.html` + craco ENTRIES + `static/ui/public/issue.html`(3곳). 설계 §6.1 YAML 그대로 붙이면 된다. issueAction 은 기존 modal 엔트리지만 intent 분기가 없으면 빈 화면이라 프론트와 함께 넣는다.

## 6. 동작 요약 (구현 기준)

- **validator**(`TransitionValidatorService.validate`): 4초 `Promise.race`, 최상위 catch + 트리거 어댑터 catch 2중으로 throw 없음. 판정 순서는 설계 §3.5 표 그대로(`judgeTransition`). 규칙 없는 상태는 SQL 1회·Jira 0회. payload 에 프로젝트·유형·출발 상태가 다 있으면 asApp 조회 생략, 아니면 asApp `transition-validate`. 무장 재시도만 asApp `transition-changelog`(첫 페이지 total → 마지막 페이지). 통과 = `arm`(실패해도 통과), changelog 에서 소비 발견 = `consume(VALIDATOR_CHANGELOG)` 후 거부. 매 호출 `[VALIDATOR] <code>` 로그(코드만).
  - 전역 정책·라이선스 조회 실패는 강제 쪽(enabled=true, licensed=true). 라이선스는 `isLicenseBlocked`(확정 INACTIVE 만 차단)와 같은 경계.
  - 거부 문구: `messages.validatorMessage` — locale `ko*` → 한국어, 그 밖의 알려진 locale → 영어, **locale 없음 → 한·영 두 줄**.
- **트리거**(`onIssueChanged` → `TransitionChangeService.handleEvent`): changelog 에 status 항목(숫자 id) 없으면 SQL 없이 반환. 삭제 이벤트는 대기 요청만 ISSUE_DELETED 만료. 건별 try/catch.
- **소비**: `UPDATE transition_request SET consumed_at=?, consumed_by=?, consume_source=?, rev = rev + 1 WHERE request_id=? AND consumed_at IS NULL` → 1행일 때만 `approval_event` CONSUMED(id = `deterministicEventId({requestId, eventType:'CONSUMED', actorKey:null, discriminator:'CONSUMED'})`, `contentVersion: 0`). `approval_request` 무변경.
- **만료**: 엔진 `closeBySystem` + 도메인 `expireByTargetChange`(discriminator `${reason}:${contentVersion}`) → 닫힌 경우만 요청자 앱 내 알림(background).
- **코멘트**(`TransitionCommentNotifier`): asUser `POST /rest/api/3/issue/{id}/comment`, 3초 상한, 400/401/403/404 는 로그(상태 코드만)·건너뜀. 정책 `notificationsEnabled=false` 또는 `commentNotifyEnabled=false` 면 안 씀. 언어 = asUser `GET /rest/api/3/myself` 의 locale(invocation memo). 링크는 넣지 않는다(X24).
- **요청 자격**: 어댑터 `canRequest` = asUser `GET issue/{id}?fields=summary,status,project,issuetype&expand=transitions`(invocation memo `issueTransitions:<id>`)에 그 목적 상태 전환이 있음.
- **프로젝트 사용 여부**(`projectEnablement.isProjectEnabled`): `projectScopeConfigured` 가 false 면 전 프로젝트 사용, true 면 `approval_project_config.enabled=1` 인 프로젝트만.

## 7. 설계와의 차이 (계약 소비자가 알아야 할 것)

1. **응답은 `res.content`** 아래다(기존 resolver 와 같은 관례). 설계 §2 의 shape 는 `content` 안.
2. 증명서 `target.transition` 은 **null**(증명서는 저장 스냅샷으로 그린다 — CertificateService 기존 동작). 출발→목적·소비 사실은 최상위 `transition` 블록에서 읽는다. 상세(`getApprovalDetail`)의 `target.transition` 은 채워진다(이슈 조회 실패 시만 null).
3. `openCount` 는 설계의 "목적 상태별 GROUP BY" 대신 **규칙(rule_id)별**로 센다 — 같은 상태의 `*` 규칙과 정확 유형 규칙을 가르기 위해. 응답 키·의미(그 규칙의 진행 중 요청 수)는 같다.
4. `listInbox`·`listNotifications` 의 `transition` 키는 **모든 행에** 있다(ISSUE_TRANSITION 외 null). 내보내기(`exportExpiredApprovals`)는 설계대로 ISSUE_TRANSITION 행에만 키가 있다.
5. `listTransitionRules` 는 규칙 테이블 미준비 시 에러 대신 `rules: []`. 저장·삭제는 `STORAGE_NOT_READY`.
6. 엔진 `beforeDecide` 훅은 반환값에 `errorCode`·`cause` 를 싣고 엔진은 그 코드로 던진다(엔진이 전환 전용 코드를 직접 알지 않게). 외부 계약(`TRANSITION_STATE_CHANGED` + cause)은 설계와 같다.
7. `IssueStateReader.issueStatus`(beforeDecide)는 asUser 404 를 "확인 불가"로 본다 — asUser 404 는 삭제와 권한 없음을 가리지 못해서. 삭제 만료는 트리거만(X10).
8. `saveTransitionRule` 은 Jira `project/{id}/statuses` 의 유형별 상태 목록이 비어 있지 않을 때만 "유형에 그 상태가 있는지"를 확인한다(team-managed 형태 미검증 X15 — 목록이 비면 상태 존재만 본다).
9. 코멘트 "업무함에서 보기" 링크는 넣지 않았다(globalPage 절대 URL 형식 미검증 — X24).
10. `getFlowForRequest` 는 `listAvailableFlows({projectId})` 에서 찾는다(활성 + 적용 프로젝트, 기존 쿼리 재사용).
11. validator 거부 문구 locale: 설계 "모르면 두 줄"을 따르되, `ko`/`en` 이 아닌 **알려진** locale(예: `de-DE`)은 영어 한 줄로 했다(앱 fallback 이 en-US).

## 8. 기존 테스트 변경 (1건, 의도)

`src/resolver/settings/__test__/SettingsService.test.js` — "제거된 Confluence 전용 키 `commentNotifyEnabled` 는 거절" 단언을 "받는다"로 바꿨다. Q3 기본 가정(이 기능에서 재도입)대로 키가 돌아왔기 때문. 나머지 두 Confluence 전용 키 거절 단언은 그대로.
`migrate.test.js` 의 이름 목록에 v029·v030 두 줄 추가(기존 줄 무변경). `transitions.test.js` 는 describe 추가만.

## 9. 미검증 (`04_spike_todo.md` X1~X20 + 이번에 X21~X26)

- **X21(중요)**: validator payload 에 `transition.to.id` 가 없으면 판정 표 4행대로 **통과**한다. X1 이 틀리면 강제가 통째로 꺼진 것과 같다 — 배포 첫 회차에 `[VALIDATOR] PASS_NO_ISSUE` 가 규칙 걸린 전환에서 나오는지 반드시 본다.
- X22 백엔드 번들의 locales JSON import, X23 트리거 행위자 필드, X24 코멘트 링크 URL, X25 validator 로그량, X26 validator 라이선스 판정 지연.
- 설계 X1~X20 은 그대로 유효(특히 X1·X2·X3·X6·X8).

## 10. 열린 질문 (제품 결정 — 기본 가정으로 구현함)

새 제품 질문은 없다. Q52~Q63 기본 가정 그대로:
- Q53 fail-closed(라이선스 확정 비활성·전역 해제·테이블 미준비만 통과), Q54 자동 전환 없음, Q55 코멘트 기본 켬(`commentNotifyEnabled=true`), Q56 Flow 고정, Q57 실행자 제한 없음(`consumed_by` 는 기록만), Q58 프로젝트 꺼짐 = validator 통과·요청 거부, Q60 locale 없으면 한·영 병기, Q61 워크포스 게시 없음, Q62 목적 상태 단위, Q63 대기 중 상태 변경 자동 만료.

## 발견 (범위 밖, 고치지 않음)

- 프론트 i18n 키(설계 §8.2 의 `notification.template.transition*`, `policy.commentNotifyEnabled`·`policy.transitionApprovalEnabled`, `cert.transition`·`cert.consumedAt`, `inbox.column.transition`, `project.placeholder.body` 수정)는 Phase 4 몫이라 넣지 않았다. 백엔드가 이미 그 templateKey 를 내보내므로 프론트가 키를 넣기 전까지 알림 문구가 키 이름으로 보일 수 있다.
- 설정 이력의 새 `area:'transitionRule'` 라벨도 프론트 i18n 이 필요할 수 있다.
- `PermissionMap` 의 `createIssueApproval`(ISSUE 참조 어댑터, Q1) 은 그대로 닫혀 있다 — 전환 승인 진입점만 열었다.

## 테스트

```
npm run merge                   → ko-KR.json / en-US.json 생성
npm test -- --runInBand         → Test Suites: 64 passed, 64 total / Tests: 866 passed, 866 total
npm run test:ui -- --runInBand  → Test Suites: 20 passed, 20 total / Tests: 161 passed, 161 total (UI 코드 무변경, 로케일 영향 확인)
```
신규 스위트(9, 143건): `judge`(20) · `transitionDomain`(30) · `TransitionValidatorService`(18) · `TransitionChangeService`(11) · `TransitionRepositories`(9) · `TransitionService`(26) · `TransitionCommentNotifier`(9) · `TransitionTargetAdapter`(8) · `ApprovalServiceTargetHooks`(12). 기존 `transitions.test.js` 47 → 57(+10, describe 추가만). 합계 +153.
판정 표(요구 완료 기준): 규칙 없음 / 승인됨+일치(무장 없음·무장+changelog 없음·있음) / 승인됨+상태 불일치 / 대기 / 반려 / 소비됨 / 만료·회수 / 전역 해제 / 라이선스 / 테이블 없음 / 이슈 없음 / 프로젝트 꺼짐 — 도메인 테스트. DB 오류·Jira 실패·후보 조회 실패·changelog 실패·시간 초과 → REJECT_UNAVAILABLE(throw 없음) — 서비스 테스트.

## 재작업 회차

- 1회차(2026-10-03): 최초 구현.
