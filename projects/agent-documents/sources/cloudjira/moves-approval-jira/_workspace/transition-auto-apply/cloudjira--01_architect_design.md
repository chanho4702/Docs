# 상태 전환 승인 후 자동 적용 설계서

## 열린 질문과 보수적 기본안

1. **transition screen에 필수 입력 필드가 있는 전환을 자동화할 것인가?** 기본안은 입력값을 추측하지 않고 `BLOCKED/SCREEN_FIELDS_REQUIRED`로 끝낸다. 향후 필드별 immutable draft가 별도 제품 요구로 확정되기 전에는 POST body에 `transition.id` 외의 값을 넣지 않는다.
2. **`UNKNOWN`을 운영자가 강제로 재전송할 수 있게 할 것인가?** 기본안은 금지한다. 정합성 대조로도 결론을 못 내리면 수동 확인 후 새 승인 요청을 만들며, 같은 승인 요청으로는 POST를 다시 보내지 않는다.
3. **승인 당시 요청자가 비활성화되거나 앱 접근 권한을 잃은 경우 관리자가 대신 전환할 것인가?** 기본안은 금지한다. 요청자 offline impersonation이 실패하면 `FAILED/REQUESTER_IMPERSONATION_UNAVAILABLE`이고 다른 사용자의 권한으로 대체하지 않는다.
4. **상태가 이미 목적 상태인 경우를 성공으로 볼 것인가?** 기본안은 현재 상태만으로 성공 처리하지 않는다. 아래 §3.4의 정확한 changelog·소비 근거가 있으면 `APPLIED`이되 `applyCode=RECONCILED_APPROVED_TRANSITION`으로 “자동 POST 204 확인”과 구분하고, 그 밖은 `BLOCKED/TARGET_REACHED_WITHOUT_PROOF` 및 수동 확인이다.

위 기본안은 승인 전 POST 0회, 동시 POST 최대 1회, 모호한 결과의 재POST 0회를 우선한다.

## 1. 개요·영향 범위

### 1.1 제품 흐름

```text
전환 선택 + 승인 요청
  → immutable transition draft(issue/from/transition/to/rule/requester)
  → 다단계 승인
  → 최종 승인 CAS 확정
  → TransitionExecutor가 요청자 offline asUser로 사전 검증
  → 실행 claim CAS
  → Jira POST /issue/{id}/transitions
  → validator가 같은 승인 요청을 arm
  → 204 또는 정확한 reconciliation 근거
  → transition_request 적용 ledger APPLIED + 승인 소비 CAS
```

승인 상태(`approval_request.status`)와 적용 상태(`transition_request.apply_status`)는 별도 사실이다. 최종 승인이 끝나도 Jira 조건·권한 때문에 적용이 실패할 수 있으며, 적용 실패가 승인을 되돌리지 않는다.

### 1.2 공통 승인 엔진과 대상별 executor

- `ApprovalService`는 요청·결재선·결정·위임·PIN·감사라는 **공통 승인 엔진**을 계속 담당한다. 최종 상태를 먼저 CAS로 확정한 뒤 `adapter.afterDecide`를 호출하는 순서는 유지한다.
- `ISSUE_TRANSITION`은 `TransitionTargetAdapter.afterDecide → TransitionExecutor.apply`를 연결한다. 실행자는 최종 결재자가 아니라 DB에 고정된 `requester_key`이고, `api.asUser(requesterAccountId)`로 고정 `transition_id`를 자동 실행한다.
- `FIELD_CHANGE`의 기존 `FieldChangeApplier`는 설계 참조 패턴일 뿐이다. 전환은 상태 변경이 비가역적일 수 있어, TTL 만료 후 PUT을 재시도하는 필드 변경 방식과 달리 **POST 시작 이후 절대 자동 재전송하지 않는다.**
- worklog의 기본 제품 모델은 transition executor와 다르다. Jira에 원본 worklog를 먼저 즉시 기록하고, 그 Jira 사실의 immutable fingerprint를 승인하여 **인증된 워크로그**로 증명한다. 상태는 `UNVERIFIED → PENDING → VERIFIED | REJECTED`, 승인 후 Jira 원본이 바뀌면 `CHANGED_AFTER_VERIFICATION`으로 인증을 무효화하고 재인증한다. 승인 순간의 fingerprint·approver·decision time을 보존한다.
- 기존 `WORKLOG_CREATE` preapproval 기능은 삭제하지 않고 **고통제 선택 모드**로 유지한다. 이 모드는 승인 전 Jira 기록을 막고 immutable draft를 승인한 뒤 요청자가 “Jira에 등록”을 눌러 저장된 draft 그대로 기록하므로 값을 다시 입력하는 TOCTOU는 없다. 최신 제품 결정에 따라 승인 후 자동생성은 도입하지 않는다. 기존 요청·정책·v036~v038 데이터는 계속 조회·처리 가능해야 한다.
- 신규 설치와 정책 기본값은 **사후 인증(certification)** 을 권장한다. Jira 원본 이력이 먼저 생겨 시간 기록을 지연시키지 않고, native UI·REST·자동화 등 앱 밖 입력도 같은 fingerprint 검증 모델에 넣을 수 있기 때문이다. 승인 전 원천 차단이 계약상 필요한 고객만 프로젝트별로 `PREAPPROVAL_HIGH_CONTROL`을 명시 선택한다. 기존 설치의 `required=true`는 자동으로 이 모드에 매핑하고, 명시적 관리자 변경 없이 certification으로 바꾸지 않는다. `required=false`는 기존 동작을 유지한 채 관리 화면에서 migration 선택을 안내한다.
- worklog certification은 후속 설계에서 새 대상 종류(권장 `WORKLOG_CERTIFICATION`)와 별도 certification ledger를 사용한다. 기존 `WORKLOG_CREATE` apply 상태나 transition v039 컬럼을 재사용하지 않는다. `TIMESHEET` 기간 집계 승인은 사용자×기간 snapshot에 대한 별도 승인으로 유지하며 개별 worklog 인증 상태와 동일시하지 않는다.

### 1.3 파일 영향 범위

- 도메인: `src/domain/transition/applyPlan.js` 신규, `statusChange.js`에 증거 판정 순수 함수 추가, `judge.js` 후보 선택 보강.
- 백엔드: `TransitionExecutor.js` 신규, `TransitionRepository.js`, `TransitionTargetAdapter.js`, `IssueStateReader.js`, `TransitionChangeService.js`, `ApprovalService.js`의 대상 훅 응답 확장.
- resolver: `TransitionController.js`, `TransitionService.js`, `PermissionMap.js`, 기존 registrar 3종 계약.
- 스키마: 기존 `transition_request` ALTER, `v039_alter_transition_request_auto_apply`; 신규 테이블은 만들지 않는다.
- manifest: scopes를 map 형태로 변경하고 `read:jira-work`, `write:jira-work`에만 `allowImpersonation:true`; 5분 bounded sweep function/scheduled trigger 추가.
- UI: 이슈 전환 목록, 승인 상세, 업무함, 알림, 증명서에 승인 상태와 적용 상태를 분리해 표시; 재시도·대조 버튼.
- i18n: `locales/kr|en/transition.json`, 공통 detail/notification/certificate 키.
- 문서: 한영 `07-transition-approval`, FAQ, 관리자·보안·개인정보·Marketplace 제출 문서, review guide.
- Workforce: 공개 계약이나 엔티티 프로퍼티는 바꾸지 않는다. 적용 상태는 현재 Moves Approval 내부 사실이며 후속 버전 계약 전에는 Workforce에 게시하지 않는다.

## 2. 경계면 계약

기존 resolver 응답 래퍼 `{success:true, content}`를 유지한다. 아래 표의 응답은 `content` 내부 shape이다.

| resolver | 권한 축 | 입력 | 응답 shape (success) | 주요 error code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueTransitionApprovals` (확장) | `{issue:'view', issueIdKey:'issueId'}` | `{issueId}` | 기존 `{issue,enforced,targets,history}`; 각 `latest/history[]`에 `apply: TransitionApplyView` 추가 | 기존 코드 | issueContext, issuePanel, 요청 모달 |
| `getApprovalDetail` (기존 확장) | `SELF`; 서비스가 대상 `canView` | `{requestId}` | `target.transition.apply: TransitionApplyView` | 기존 코드 | 승인 상세 |
| `retryTransitionApply` | `SELF`; 서비스에서 **요청자 본인 또는 Jira 관리자** 확인, 대상 열람 재확인 | `{requestId}` | `{requestId, apply: TransitionApplyResult}` | `TRANSITION_APPLY_NOT_ALLOWED`, `TRANSITION_APPLY_IN_PROGRESS`, `TRANSITION_APPLY_UNKNOWN`, `PERMISSION_DENIED`, `STORAGE_NOT_READY` | 승인 상세 |
| `reconcileTransitionApply` | `SELF`; 요청자 본인 또는 Jira 관리자, 대상 열람 재확인 | `{requestId, cursor?: string|null}` | `{requestId, apply: TransitionApplyView, reconciliation:{complete,scanned,nextCursor,manualReviewRequired,evidenceCode}}` | `TRANSITION_RECONCILE_NOT_ALLOWED`, `INVALID_CURSOR`, `PERMISSION_DENIED`, `STORAGE_NOT_READY` | 승인 상세 UNKNOWN 조치 |

`TransitionApplyView`:

```js
{
  mode: 'AUTO'|'LEGACY_MANUAL',
  status: 'WAITING'|'APPLYING'|'APPLIED'|'FAILED'|'UNKNOWN'|'BLOCKED',
  code: string|null,
  attempts: number,
  claimedAt: number|null,
  postStartedAt: number|null,
  appliedAt: number|null,
  appliedBy: string|null,       // Jira 이력상 요청자 accountId
  source: 'DECIDE'|'RETRY'|'SWEEP'|'RECONCILE'|null,
  canRetry: boolean,            // UNKNOWN/APPLIED/APPLYING은 false
  canReconcile: boolean,
  manualReviewRequired: boolean
}
```

`TransitionApplyResult`는 위 shape와 같고 `already:boolean`을 추가한다. `retryTransitionApply`의 `FAILED/BLOCKED` 재시도도 새 POST 전에 전체 preflight를 다시 수행한다. `UNKNOWN`은 이 resolver에서 항상 거부한다.

세 resolver 등록 계약은 다음을 함께 고친다.

1. `TransitionController`: `guardedDefine` 2개 추가.
2. `PERMISSION_MAP`: 두 resolver를 `SELF`로 추가.
3. `CONTROLLER_REGISTRARS`: 기존 `registerTransitionController`를 그대로 사용하므로 신규 registrar는 없다. 계약 테스트는 controller 정의와 map을 대조한다.

SELF mutation SQL은 payload accountId를 받지 않는다. 서비스가 로드한 `requester_key`를 repository의 owner predicate까지 전달하고, Jira 관리자 예외도 owner predicate 자체는 저장된 요청자와 대조한다.

## 3. 도메인

### 3.1 상태와 코드

```js
TransitionApplyStatus = {
  WAITING, APPLYING, APPLIED, FAILED, UNKNOWN, BLOCKED
}

TransitionApplyCode = {
  POST_204,
  RECONCILED_APPROVED_TRANSITION,
  BUDGET_DEFERRED,
  REQUESTER_IMPERSONATION_UNAVAILABLE,
  REQUESTER_NO_PERMISSION,
  ISSUE_NOT_FOUND,
  STATE_CHANGED,
  RULE_CHANGED,
  PROJECT_DISABLED,
  TRANSITION_NOT_AVAILABLE,
  SCREEN_FIELDS_REQUIRED,
  JIRA_REJECTED,
  TARGET_REACHED_WITHOUT_PROOF,
  AMBIGUOUS_POST_RESULT,
  AMBIGUOUS_CHANGELOG,
  STORAGE_CONFIRMATION_FAILED
}
```

- `WAITING`: 최종 승인 전 또는 승인 후 실행 대기. 승인 전에는 executor가 claim하지 않는다.
- `APPLYING`: 한 실행자가 fencing token을 획득했다. `post_started_at IS NULL`이면 아직 POST 전, 값이 있으면 POST 경계에 들어갔다.
- `APPLIED`: POST 204를 직접 받았거나 §3.4의 정확한 근거로 목적 전환 완료를 확인했다.
- `FAILED`: 명백히 실행되지 않은 HTTP 4xx/인증 실패 등. 자동 반복하지 않고 명시적 retry만 가능하다.
- `BLOCKED`: POST 전 정책·상태·transition screen 조건 불일치. 수정 가능한 코드만 retry 가능하다.
- `UNKNOWN`: POST 시작 뒤 network/timeout/5xx/비표준 응답 또는 SQL 확정 실패. 자동·수동 retry 모두 금지하고 reconcile만 허용한다.
- `mode='LEGACY_MANUAL'`: v039 이전에 생성된 요청. 자동 executor와 sweep의 대상이 아니며 기존처럼 사용자가 직접 전환한다. `mode='AUTO'`인 v039 이후 신규 요청만 자동 실행한다.

### 3.2 순수 함수

```js
planTransitionApply({ approvalStatus, consumedAt, applyStatus, postStartedAt,
  currentIssue, draft, currentRule, availableTransition, requiredScreenFields })
  -> { plan:'POST'|'ALREADY_EVIDENCE'|'BLOCK', code }

classifyTransitionPost({ responseReceived, httpStatus, transportError })
  -> { status:'APPLIED'|'FAILED'|'UNKNOWN', code }

selectConsumptionCandidate(rows, { fromId, toId })
  -> requestId|null

matchTransitionEvidence(histories, {
  requesterKey, fromStatusId, toStatusId, postStartedAt, anchorId, approvalConsumed
}) -> { verdict:'EXACT'|'NONE'|'AMBIGUOUS', changelogId?, occurredAt? }

transitionApplyView(row, now) -> TransitionApplyView
```

시간은 모두 인자다. 순수 함수 안에서 `Date.now()`를 부르지 않는다.

### 3.3 핵심 불변식과 테스트

- PENDING/REJECTED/EXPIRED/CANCELLED 결정: POST 0.
- 중간 단계 승인: POST 0.
- 최종 승인 직후 CAS 승자 하나만 `WAITING|FAILED|retryable BLOCKED → APPLYING`; 동시 호출 POST 최대 1.
- `post_started_at`가 기록된 요청은 어떤 경로에서도 재claim·재POST하지 않는다.
- 오래된 `APPLYING`은 `post_started_at IS NULL`일 때만 회수한다. 값이 있으면 `UNKNOWN`으로 수렴한다.
- preflight 실패: POST 0, `BLOCKED/FAILED`.
- HTTP 204: `APPLIED/POST_204`; 소비 CAS가 trigger와 경합해도 POST는 1.
- HTTP 400/401/403/404/409/413/422 및 기타 명시적 4xx: `FAILED` 또는 의미가 명확한 `BLOCKED`; POST는 이미 1회지만 결과는 “실행되지 않음”으로 재시도 가능.
- transport/timeout/5xx/응답 유실: `UNKNOWN`; 이후 POST 0.
- 목적 상태만 같고 증거가 없음: `APPLIED`로 만들지 않는다.
- changelog가 정확한 from→to라도 actor가 요청자가 아니거나 post 경계와 겹치는 후보가 2개 이상이면 `AMBIGUOUS_CHANGELOG`.
- trigger와 executor가 동시에 consume해도 `consumed_at IS NULL` CAS와 결정적 event id로 소비 1건.
- 같은 from/to의 승인 행이 여러 개여도 상태 변경 하나가 여러 승인을 소비하지 않는다.

### 3.4 reconciliation의 성공 근거

`UNKNOWN` 또는 `post_started_at != null`인 오래된 `APPLYING`만 대조한다. 다음을 **모두** 만족할 때만 `APPLIED/RECONCILED_APPROVED_TRANSITION`으로 확정한다.

1. changelog에 `post_started_at` 이후(허용 clock skew는 테스트로 고정, 기본 ±5초)의 status 항목이 하나 존재한다.
2. 항목의 `from`/`to`가 요청의 고정 `from_status_id`/`to_status_id`와 정확히 같다.
3. changelog author accountId가 저장된 `requester_key`와 같다.
4. preflight에서 저장한 `changelog_anchor_id`보다 뒤의 항목이다. Jira changelog id의 정렬 보장은 미검증이므로, id 크기 비교가 아니라 anchor 항목을 페이지에서 만난 경계로 쓴다.
5. 이 승인 요청의 `consumed_at`이 있거나 exact evidence 확정과 같은 작업에서 `consume(requestId, source='AUTO_RECONCILE')` CAS가 성공한다.
6. 조건을 만족하는 후보가 정확히 1개다.

현재 상태가 목적 상태라는 사실, `consumed_at` 단독, actor 없는 이벤트, 시간 범위 밖 변경은 보조 정보일 뿐 성공 근거가 아니다. 정확한 증거가 없고 스캔을 완주하면 `UNKNOWN`을 유지하고 `manualReviewRequired=true`를 반환한다. 다른 경로의 상태 변경을 “자동 적용 성공”으로 표시하지 않는다.

## 4. 백엔드

### 4.1 `TransitionExecutor`

`TransitionTargetAdapter.afterDecide(result, options)`는 `result.status === APPROVED`일 때만 `executor.apply(requestId, {source:'DECIDE', budget, notify})`를 호출한다. `principal`은 승인 트리거를 기록하는 참고값일 뿐 Jira 실행 actor로 쓰지 않는다.

`apply` 순서:

1. budget 초과면 SQL/Jira 0회 또는 row 확인 1회 후 `WAITING/BUDGET_DEFERRED`를 반환한다.
2. `transition_request JOIN approval_request`를 읽어 LIVE·APPROVED·requester·미소비·`apply_mode='AUTO'`·readiness를 확인한다.
3. repository `claim(requestId, token, requesterKey, now, claimedBefore)`를 수행한다. SET에는 `apply_status='APPLYING'`, token/claimed/source, `apply_attempts+1`, `rev=rev+1`; WHERE에는 request_id, 허용 상태, `EXISTS approval_request(requester_key=?, status='APPROVED', commit_state='LIVE')`를 둔다.
4. 요청자 offline `asUser`로 현재 issue/project/type/status와 정확한 transition metadata를 읽고, DB 규칙·프로젝트 활성화를 확인한다. 현재 status는 반드시 `from_status_id`; exact `transition_id → to_status_id`; required transition fields는 0개여야 한다.
5. 현재가 이미 target이면 POST하지 않고 reconciliation을 호출한다. 증거가 없으면 `BLOCKED/TARGET_REACHED_WITHOUT_PROOF`.
6. 요청자 offline `asUser` changelog의 최신 anchor를 저장한다.
7. `markPostStarted(requestId, token, anchor, now)` CAS 후에만 POST한다. 이 UPDATE의 확정 여부를 읽지 못하면 POST하지 않는다. 재조회에서 marker가 확인될 때만 진행한다.
8. `POST /rest/api/3/issue/{issueId}/transitions`, body `{transition:{id: row.transitionId}}`를 요청자 offline `asUser`로 1회 수행한다.
9. 204면 token CAS로 APPLIED를 기록하고 `TransitionChangeService.consume(... AUTO_POST)`를 호출한다. trigger가 먼저 소비했으면 false여도 APPLIED는 유지한다.
10. 안전한 4xx는 token CAS로 FAILED/BLOCKED. network/timeout/5xx 또는 결과 저장 실패는 UNKNOWN으로 기록을 시도하고 throw하지 않는다. 기록 자체가 실패하면 `post_started_at`이 있는 APPLYING을 sweep/reconcile이 UNKNOWN으로 바꾼다.
11. 적용 event/알림은 결과 ledger 확정 뒤 best-effort로 쓴다. 알림 실패가 적용 상태를 뒤집지 않는다.

### 4.2 validator·trigger·executor의 결합

- 함수형 validator는 제거하거나 우회하지 않는다. 자동 POST도 Jira가 validator를 실행한다고 기대하며, 이를 실환경에서 확인하기 전에는 출시 완료로 보지 않는다.
- `TransitionRepository.findCandidates`는 apply 필드를 포함한다. `judgeTransition`의 usable 후보 선택은 `APPLYING && post_started_at != null`인 정확한 row를 최우선으로 하고, 그다음 armed 최신, 그다음 기존 최신 순서다. 자동 POST가 다른 승인 row를 arm하는 것을 막기 위해 필요한 좁은 엔진 변경이다.
- validator `PASS_ARM`은 기존 `arm` CAS를 유지한다. POST 204 전에는 consume하지 않는다.
- `TransitionChangeService.onStatusChanged`는 승인된 exact from/to 행 전부를 소비하지 않는다. 순수 `selectConsumptionCandidate`로 active auto apply → armed 최신 → 최신 하나를 골라 최대 1건만 consume한다. PENDING 만료는 기존대로 각 요청에 적용한다.
- `ConsumeSource`에 `AUTO_POST`, `AUTO_RECONCILE`을 추가한다.
- executor가 204를 받은 뒤 consume하고 trigger가 먼저 도착하는 경합은 둘 다 같은 `transition_request.consumed_at IS NULL` CAS와 결정적 `CONSUMED` event id로 수렴한다.
- 기존 lazy observation(`fromId=null`)은 승인 소비를 보조할 수 있으나 자동 ledger를 APPLIED로 만들 권한은 없다. 특히 “현재 target”만으로 `apply_status`를 바꾸지 않는다.

### 4.3 retry·reconcile 서비스 권한

- 두 resolver 모두 먼저 `approvalRepository.load` → target adapter `canView` → `requesterKey === principal.accountId || principal.isJiraAdmin` 순으로 확인한다.
- `retry`는 `FAILED` 또는 retryable `BLOCKED`만 허용한다. 상태 변경·다른 경로 target 도달·UNKNOWN은 거부한다.
- `reconcile`은 `UNKNOWN` 또는 post marker가 있는 stale APPLYING만 허용한다. Jira changelog는 **요청자 offline asUser**로 읽으며 asApp을 쓰지 않는다.
- owner mutation은 repository WHERE의 저장된 requester predicate까지 전달한다.
- 응답에는 이슈 제목·changelog 본문·다른 사용자 정보를 넣지 않고 코드·상태·스캔 수·cursor만 반환한다.

### 4.4 bounded background sweep

최종 승인 후 invocation이 끊기거나 bulk budget을 넘긴 WAITING을 자동으로 이어가기 위해 `runTransitionApplySweep`를 5분 주기로 추가한다.

- 총 예산 20초, Jira 요청 최대 40, row 최대 10. 각 row는 preflight 2~3 GET + POST 최대 1이다.
- `approval_job_state`에 전용 cursor `transition-apply`를 사용한다. 미완주 시 watermark/cursor를 완료 위치까지만 저장한다.
- 대상: `apply_mode='AUTO'`인 APPROVED + apply_status WAITING, 또는 post marker 없는 stale APPLYING. FAILED/BLOCKED와 `LEGACY_MANUAL`은 자동 재시도하지 않는다.
- post marker가 있는 stale APPLYING은 POST 없이 UNKNOWN으로 변경하고 bounded reconciliation 대상으로 넘긴다.
- UNKNOWN은 sweep에서도 절대 POST하지 않는다. 최대 5페이지×100 changelog, 15초 내 대조하고 미완주 cursor를 row에 남긴다.
- 라이선스로 정합 작업을 막지 않는다. 알림 생성만 기존 `shouldEmitNotifications` 정책을 따른다.
- scheduled hot path는 건별 실패를 삼키고 다음 row로 진행하며 전체 trigger를 throw하지 않는다.

## 5. 스키마·마이그레이션

신규 테이블 없이 기존 `transition_request`에 ledger를 추가한다.

```sql
ALTER TABLE transition_request
  ADD COLUMN IF NOT EXISTS apply_mode VARCHAR(16) NOT NULL DEFAULT 'LEGACY_MANUAL',
  ADD COLUMN IF NOT EXISTS apply_status VARCHAR(12) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN IF NOT EXISTS apply_code VARCHAR(48) NULL,
  ADD COLUMN IF NOT EXISTS apply_token VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS apply_source VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS apply_claimed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS apply_claimed_by VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS apply_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_started_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS changelog_anchor_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS applied_by VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS evidence_changelog_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS reconcile_cursor INT NULL,
  ADD COLUMN IF NOT EXISTS reconcile_scanned INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP NULL,
  ADD INDEX IF NOT EXISTS ix_tr_apply (apply_mode, apply_status, apply_claimed_at)
```

- migration 이름은 `v039_alter_transition_request_auto_apply`로 확정한다. 아직 배포 전이면 Forge SQL/TiDB가 multi-clause `ADD COLUMN IF NOT EXISTS`와 `ADD INDEX IF NOT EXISTS`를 한 ALTER에서 받는지 먼저 로컬 계약과 개발 배포로 확인한다. 지원하지 않으면 **v039를 배포하기 전에만** v039 이후의 단일 컬럼 ALTER들로 분리한다. 한 번 배포한 이름은 변경하지 않는다.
- `CREATE_TRANSITION_REQUEST_TABLE`에도 같은 최종 컬럼·인덱스를 반영해 신규 설치가 최종 schema로 생성되게 한다. 기존 설치는 v039가 따라잡는다.
- v039 ALTER가 기존 행에 채우는 값은 반드시 `apply_mode='LEGACY_MANUAL'`이다. `TransitionRepository.insertDraft`만 readiness 확인 후 신규 행에 `apply_mode='AUTO'`를 명시한다. 이 게이트가 없으면 업그레이드 직후 과거 APPROVED 행을 sweep이 자동 실행하므로 출시 차단 결함이다. 신규 설치 CREATE의 default도 `LEGACY_MANUAL`로 두고 insert의 명시값을 계약 테스트한다.
- 모든 CAS UPDATE SET에 `rev=rev+1`; finish는 `WHERE request_id=? AND apply_status='APPLYING' AND apply_token=?`를 사용한다.
- 적용 기능은 `isTableReady('transition_request')`와 `isColumnReady('transition_request','apply_status')`, 최소 핵심 컬럼(`post_started_at`, `apply_token`) readiness를 먼저 확인한다. 하나라도 미준비면 `STORAGE_NOT_READY`이며 POST 0.
- 기존 v030 이름은 바꾸지 않는다. migrate 계약 테스트의 순서와 최종 DDL 테스트를 갱신한다.
- 보관 purge는 `UNKNOWN`, post marker가 있는 `APPLYING`, 승인됐지만 `WAITING/FAILED/BLOCKED`인 행을 보호한다. 내보내기에 apply 상태·코드·적용/증거 시각을 포함한다.

### 5.1 worklog 정책·migration 호환 경계(후속 설계 입력)

- v036 `worklog_approval_policy`, v037 binding, v038 entry와 기존 `WORKLOG_CREATE` 요청은 변경·재해석·삭제하지 않는다. 기존 `required=true` 프로젝트는 `PREAPPROVAL_HIGH_CONTROL`과 동치로 계속 동작한다.
- certification 기본화는 v039 transition ALTER에 섞지 않는다. 후속 migration에서 정책에 명시적 `mode`를 추가하고, 기존 행은 deterministic backfill 또는 읽기 시 호환 매핑을 한다. 관리자 동의 없는 모드 전환과 기존 승인 상태 재분류는 금지한다.
- certification ledger는 Jira `worklogId`와 immutable fingerprint를 유일하게 연결하고, 승인 시 fingerprint·결정자·결정시각을 고정해야 한다. 수정/삭제 이벤트와 누락 보정 sweep이 fingerprint 불일치를 발견하면 `VERIFIED → CHANGED_AFTER_VERIFICATION`; 재인증은 새 승인 요청과 새 fingerprint로 한다.
- `UNVERIFIED/PENDING/VERIFIED/REJECTED/CHANGED_AFTER_VERIFICATION`은 worklog certification 상태이고, `TIMESHEET`의 기간 승인 상태나 기존 `WORKLOG_CREATE.apply_status`와 별도다. UI·내보내기·Workforce 게시도 세 축을 각각 이름 붙인다.
- certification은 native/REST/자동화 입력을 사후 포착할 수 있어 기본값으로 적합하다. 고통제 preapproval은 앱 제공 UI에서만 사전 차단을 강하게 제공하며 외부 입력 경로까지 원천 차단한다고 고지하지 않는다.

## 6. Jira 연결

### 6.1 RequestJira 경계

`src/api/jira/RequestJira.js`에 별도 함수로 의도를 드러낸다.

```js
asUserOffline(accountId, path, init, options)
```

- accountId 형식/빈 값 검증 후 `api.asUser(accountId).requestJira`를 사용한다.
- 일반 resolver의 `asUser()`와 섞지 않는다. 테스트는 지정 accountId, path, status 보존을 확인한다.
- `asApp` transition write는 어떤 경로에서도 금지한다.

공식 문서상 `api.asUser(accountId)`는 offline impersonation scope가 필요하고, manifest scopes는 map 형태에서 사용 scope만 `allowImpersonation:true`로 선언한다. Jira transition POST는 `write:jira-work`, issue/transition/changelog 조회는 `read:jira-work`를 사용한다.

```yaml
permissions:
  scopes:
    storage:app: {}
    read:jira-work:
      allowImpersonation: true
    read:jira-user: {}
    write:jira-work:
      allowImpersonation: true
```

scope 형태 변경 후 배포뿐 아니라 `forge install --upgrade`가 필수다. Marketplace 권한 설명에는 “승인 요청자가 접속하지 않은 상태에서, 승인 시 고정한 Jira 전환을 요청자의 현재 권한으로 실행하고 이력 actor를 보존하기 위함”을 한영으로 고지한다.

### 6.2 REST와 호출 주체

| 목적 | REST | 주체 | 최대 호출 |
|---|---|---|---:|
| 현재 이슈·프로젝트·유형·상태 | `GET /rest/api/3/issue/{id}?fields=status,project,issuetype` | requester offline asUser | 1 |
| exact transition와 required fields | `GET /rest/api/3/issue/{id}/transitions?expand=transitions.fields` | requester offline asUser | 1 |
| preflight anchor / reconcile | `GET /rest/api/3/issue/{id}/changelog?startAt=&maxResults=100` | requester offline asUser | preflight 1, reconcile 최대 5 |
| 실행 | `POST /rest/api/3/issue/{id}/transitions` | requester offline asUser | 요청당 최대 1 |

공식 근거:

- Forge `requestJira`는 `api.asUser(accountId)`를 offline impersonation 방식으로 제공하며 해당 scope 설정이 필요하다: https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/
- impersonation scope는 map 형태와 `allowImpersonation:true`로 선언한다: https://developer.atlassian.com/platform/forge/manifest-reference/permissions/
- transition POST는 Browse projects·Transition issues 및 issue security 권한을 요구하고 성공 응답은 204이며 classic scope는 `write:jira-work`다: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post

## 7. 프론트

### 7.1 화면 트리

- `TransitionLatestProgress`와 `TransitionApprovalList`: 기존 결재 상태/쓸모 배지 옆에 **상태 변경 적용** 배지를 독립 표시한다.
- `ApprovalDetail`: `TransitionTargetHeader` 아래 `TransitionApplySection` 신규.
  - WAITING: “최종 승인 후 자동 적용 대기”.
  - APPLYING: “요청자 권한으로 적용 중”.
  - APPLIED: POST 204 / 근거 대조 완료를 세부 문구로 구분.
  - FAILED/BLOCKED: 코드별 원인, retryable이면 “다시 적용”.
  - UNKNOWN: “결과 불명, 다시 전송하지 않음”, “결과 대조” 버튼과 수동 확인 안내.
- 업무함·알림: 행 제목은 그대로 두고 `approvalStatus`와 `transition.apply.status`를 별도 lozenge로 보인다. “승인 완료”를 “상태 변경 완료”로 오해하게 하는 기존 `transitionApproved` 문구를 교체한다.
- 증명서: 승인 사실과 적용 사실을 별도 표로 출력한다. `applyStatus`, `applyCode`, `attempts`, `postStartedAt`, `appliedAt`, `appliedBy`, `evidenceChangelogId`, `consumeSource`를 포함한다.

### 7.2 캐시

- `transitionKeys.apply(requestId)`를 추가하거나 상세가 `approvalKeys.detail(requestId)`에 포함되면 후자를 단일 진실로 쓴다. 별도 polling은 `APPLYING`일 때만 2초, 최대 30초.
- retry/reconcile 성공 후 `approvalKeys.detail(requestId)`, `transitionKeys.all`, `approvalKeys.history(requestId)`, `inboxKeys.all`, `notificationKeys.all`을 invalidate한다.
- 모달 닫힘 시 부모 iframe의 `transitionKeys.issue(issueId)` 무효화 계약을 유지한다.

## 8. i18n 키

한영 키 집합을 계약 테스트로 동일하게 유지한다.

| 키 | ko | en |
|---|---|---|
| `transition.apply.title` | 상태 변경 적용 | Transition application |
| `transition.apply.status.WAITING` | 적용 대기 | Waiting to apply |
| `transition.apply.status.APPLYING` | 적용 중 | Applying |
| `transition.apply.status.APPLIED` | 적용됨 | Applied |
| `transition.apply.status.FAILED` | 적용 실패 | Application failed |
| `transition.apply.status.UNKNOWN` | 결과 확인 필요 | Result needs verification |
| `transition.apply.status.BLOCKED` | 적용 차단 | Application blocked |
| `transition.apply.unknownNotice` | Jira 응답을 확인할 수 없어 다시 전송하지 않습니다. 결과 대조를 실행하세요. | The Jira result could not be confirmed. The app will not resend the transition. Reconcile the result. |
| `transition.apply.retry` | 다시 적용 | Retry application |
| `transition.apply.reconcile` | 결과 대조 | Reconcile result |
| `transition.apply.manualReview` | 자동으로 판정할 근거가 부족합니다. Jira 이력과 현재 상태를 확인한 뒤 새 요청을 만드세요. | There is not enough evidence for an automatic decision. Check Jira history and current status, then create a new request. |
| `notification.template.transitionApproved` | 최종 승인되어 요청자 권한으로 상태 변경을 적용합니다. | Final approval completed. The transition will be applied as the requester. |
| `notification.template.transitionApplied` | 승인된 상태 변경이 적용되었습니다. | The approved transition was applied. |
| `notification.template.transitionApplyFailed` | 승인됐지만 상태 변경 적용에 실패했습니다. | Approved, but the transition could not be applied. |
| `notification.template.transitionApplyUnknown` | 승인됐지만 Jira 적용 결과를 확인해야 합니다. | Approved, but the Jira transition result needs verification. |

코드별 키는 `transition.apply.code.<CODE>` 아래에 둔다. 서버는 사람 문구를 저장하지 않고 code만 반환한다.

## 9. 용량·호출량

- `transition_request` 추가 고정 폭은 최악 약 700~900 bytes/행(문자열 인코딩·인덱스 제외). 200명 × 월 20건 = 연 48,000건이면 원본 행 증가량은 대략 35~45MB/년 수준이다. 실제 TiDB 인덱스/row overhead는 storage usage 화면으로 측정한다.
- 일반 최종 승인 1건: SQL load+claim+marker+finish 약 4~6회, Jira GET 3회(이슈/전환/changelog anchor)+POST 1회. POST 204 뒤 consume/event SQL이 추가된다.
- issue list/detail은 기존 JOIN에 apply columns를 포함해 Jira N+1을 만들지 않는다.
- reconcile은 요청 1건당 100개×최대 5페이지, 15초. cursor로 이어가며 전체 changelog를 한 invocation에서 무제한 읽지 않는다.
- bulkApprove 최대 50건에서 Jira 4콜씩 수행하지 않는다. 공통 `budget`을 보고 처리 가능한 앞부분만 즉시 적용하고 나머지는 WAITING, 5분 sweep이 10건/40콜/20초 한도로 이어받는다.

## 10. 미검증

| 항목 | 현재 근거 | 영향 | 확인 방법 |
|---|---|---|---|
| 자동 REST transition이 Forge 함수형 validator에 재진입하는가 | 공식 transition API는 권한/validator 일반 동작을 전제로 하나 이 앱 validator 재진입은 실측 없음 | 우회되면 승인 소비·강제 모델 붕괴 | 개발 사이트 protected transition에서 승인 전 POST 거부, 승인 후 POST의 validator 로그/armed_at 확인 |
| `api.asUser(requesterId)` transition history actor가 requester인가 | offline impersonation API 공식 지원; actor 보존은 미실측 | 감사 표시 | A 요청, B 최종 승인, A offline POST 후 Jira history actor=A 확인 |
| 기존 사용자 설치에서 offline impersonation consent/앱 접근 제한이 어떻게 실패하는가 | 공식 제한 문서만 | 401/403 분류·관리 안내 | 공유/직접배포/Marketplace 각 설치, 비활성·앱 접근 제외 사용자 시험 |
| issue GET `expand=transitions`와 별도 transitions endpoint가 요청자 권한·조건을 동일하게 반영하는가 | 기존 코드 주석 X12 | preflight 정확도 | 조건/permission/property validator별 가용 목록 대조 |
| transition fields metadata의 `required`로 실제 필수 screen 입력을 완전히 식별하는가 | REST 문서는 `expand=transitions.fields` 제공 | 필수값 누락 400 | required field, validator, post function 조합 실측 |
| changelog ordering, id 안정성, author.accountId, trigger payload의 status id/actor | 기존 X8/X16 | UNKNOWN reconciliation 정확도 | 100개 초과 history, 왕복 상태 변경, 동시 전환, actor 필드 캡처 |
| POST 204 뒤 trigger 도착 순서와 지연 | 미검증 | consume 표시 지연 | executor finish 전/후 trigger 양 순서를 강제한 통합 시험 |
| v039 multi-clause ALTER 지원 | Forge SQL/TiDB 실측 필요 | migration 실패 | development migration 실행; 실패 시 최초 배포 전에만 단일 ALTER 번호들로 분리 |
| team-managed workflow validator·offline transition | 기존 미검증 | 지원 범위 | company/team-managed 각각 일반 사용자 end-to-end |
| 5분 scheduledTrigger 추가의 플랫폼/major version 영향 | manifest lint·deploy 전 미검증 | 배포 승인 | `forge lint`, development deploy의 major rule 확인 |

실측 전 문서에는 “요청자 이력 actor 보존”, “모든 workflow에서 자동 전환”을 확정 사실로 쓰지 않는다.

## 11. 작업 분해

### backend

- [ ] `applyPlan.js` 순수 상태/POST 분류/증거 판정과 경계 테스트.
- [ ] v039 DDL, 신규설치 CREATE 동기화, migration 순서/멱등 테스트; 기존 행 `LEGACY_MANUAL`, 신규 insert `AUTO`, legacy POST 0 회귀.
- [ ] 모든 신규 column 사용 전 `isColumnReady`; 미준비 POST 0 테스트.
- [ ] `RequestJira.asUserOffline`; accountId 전달·asApp 0 테스트.
- [ ] `TransitionRepository` ledger mapping, owner+token CAS, `rev+1`, UNKNOWN 재claim 불가 테스트.
- [ ] `IssueStateReader` offline issue/transitions/changelog/POST gateway; 본문·사용자 텍스트 로그 금지.
- [ ] `TransitionExecutor` preflight→marker→POST→finish; 승인 전 0, 동시 1, ambiguous 후 0, safe 4xx retry 계약 테스트.
- [ ] `TransitionTargetAdapter.afterDecide` 연결; 중간 승인/반려/만료 0, 최종 승인만 실행.
- [ ] validator 후보 active apply 우선, trigger 단일 소비, executor/trigger race 테스트.
- [ ] retry/reconcile resolver 3종 등록, SELF 서비스 범위와 SQL owner predicate 테스트.
- [ ] bounded sweep cursor·budget·hot-path no-throw 테스트.
- [ ] event/notification/certificate/export/retention 보호 연동.
- [ ] manifest scope map + scheduled function; 설치 upgrade 문서 갱신.
- [ ] 후속 티켓: worklog certification(`UNVERIFIED/PENDING/VERIFIED/REJECTED/CHANGED_AFTER_VERIFICATION`) 대상·fingerprint ledger·수정 무효화/재인증을 별도 설계. `WORKLOG_CREATE` preapproval은 고통제 선택 모드와 기존 데이터 호환으로 유지하고 자동생성은 추가하지 않음.

### frontend

- [ ] `TransitionApplySection`, status/code lozenge, retry/reconcile 조치 UI.
- [ ] issue list/history/detail에서 승인/적용 상태를 서로 다른 label로 표시.
- [ ] APPLYING bounded polling과 모든 관련 query factory invalidation.
- [ ] 업무함·알림·증명서·내보내기 apply 사실 표시.
- [ ] UNKNOWN에서 retry 버튼이 절대 노출되지 않는 회귀 테스트.
- [ ] kr/en 키 집합 계약과 접근성 label.
- [ ] 한영 07/FAQ/review/Marketplace 보안·개인정보 문서 갱신.

### verifier

- [ ] resolver 이름·payload·response shape와 UI consumer 대조.
- [ ] `guardedDefine + PERMISSION_MAP + CONTROLLER_REGISTRARS` 계약.
- [ ] SQL CAS 전부 `rev=rev+1`, SELF mutation owner predicate, 조건부 consume.
- [ ] 승인 전 POST 0 / final 동시 POST 1 / ambiguous 이후 POST 0.
- [ ] 다른 actor·다른 from·목적 상태 단독을 APPLIED로 오인하지 않음.
- [ ] 기존 수동 validator 거부/arm/changelog/trigger 소비 회귀.
- [ ] 전체 backend/UI/build/forge lint 및 개발 사이트 실측 목록 별도 기록.

## 변경 이력

| 날짜 | 변경 | 이유 |
|---|---|---|
| 2026-10-06 | 초안: requester offline impersonation 자동 transition, v039 ledger, UNKNOWN reconciliation, validator/trigger 단일 소비 계약 확정 | 승인 후 사용자의 수동 재전환 제거 |
| 2026-10-06 | 공통 승인 엔진과 target별 executor 분리 | transition과 worklog 실행 모델 혼동 방지 |
| 2026-10-06 | worklog 기본을 원본 우선 사후 인증으로 확정, 기존 preapproval은 고통제 호환 모드로 유지, 자동생성안 폐기 | Jira 원본 이력과 앱 밖 입력 경로를 보존하면서 인증·변경 무효화 제공 |
