# 워크로그 승인 설정 운영 모드 분리 설계서

## 열린 질문

구현을 막는 질문은 없다. 다음 보수적 해석으로 진행한다.

- 연동 이슈가 승인 요청 뒤 연결 해제되어도 기존 요청·결정·감사 이력은 삭제하거나 자동 만료하지 않는다. 연결 해제 뒤 **새 요청과 재승인 요청만 막고**, 기존 요청은 기존 승인자가 마무리할 수 있게 한다. 이는 “기존 승인·잠금 동작 유지”와 감사 보존을 우선한 해석이다.
- Workforce 팀장 본인 워크로그의 자동 요청 결재선은 기존 상위 팀장을 먼저 두고 본인을 마지막 후보로 추가한 단일 단계(`requiredApprovals: 1`)로 만든다. 상위 팀장이 있으면 기존 기본 흐름을 유지하면서도 본인이 직접 승인할 수 있고, 상위 팀장이 없으면 본인이 유효한 기본 승인자가 된다.
- 자기 승인 예외의 “Workforce 팀장”은 Approval 자체 명부의 팀장이 아니라, 현재 사용자에게 결속된 **서명 검증 완료 `movesRms.org`의 `leads[]`가 한 건 이상인 사용자**로 한정한다. 일반 모드·검증 실패·연동 이슈 아님·Approval 명부 팀장은 자기 승인할 수 없다.

## 1. 개요·영향 범위

### 1.1 현재 코드 판정

현재 운영 모드 원천은 이미 `workforceLinkEnabled === true` 하나다. UI의 `operatingModeOf()`와 서버의 `SettingsRepository.isWorkforceLinkEnabled()`가 같은 규칙을 쓴다.

그러나 승인 대상 범위는 사용자 요구와 다르다.

1. `WorklogControlDetector.handle()`은 정상 출처(`PROVEN_ORIGINS`)의 생성·수정 이벤트이면 `WorklogRequestService.requestAutomatically()`를 호출한다.
2. `WorklogRequestService.requestAutomatically()`은 `WorklogPolicyResolver.resolveOne()`에서 `effective.linkMode`와 `effective.issueLinked`를 이미 받지만, 둘을 대상 제외 조건으로 사용하지 않는다.
3. 연동 이슈별 설정이 없으면 `policy.worklogAutoRequest`를 그대로 사용한다.
4. 따라서 `workforceLinkEnabled=true`, `effective.issueLinked=false`, `worklogAutoRequest=true`인 미연결 이슈도 현재 자동 승인 요청이 만들어진다.

자기 승인도 현재 요구와 다르다.

- `orgViewOf()`가 `leaderKeys`와 `memberKeys`에서 본인을 제거한다.
- `TeamScope.upperLeadsOf()`도 본인을 제거한다.
- `WorklogRequestService.candidates()`는 후보에서 `owner`를 제거한다.
- `WorklogRequestService.create()`는 `selected === request.principal.accountId`를 무조건 거부한다.
- `requestAutomatically()`도 본인을 다시 제거한다.
- 반면 공통 결정 엔진은 결재선에 actor가 있으면 append-only 결정 이벤트를 정상 기록한다. 따라서 생성·후보 경로의 제한을 조건부로 열고, 결정 직전 Workforce 팀장 자격을 다시 확인하면 상태 머신과 감사 저장 구조를 바꾸지 않고 요구를 충족할 수 있다.

### 1.2 목표 동작

| 구분 | 승인 대상 | 기본 승인자 | 자기 승인 |
|---|---|---|---|
| 단독 모드 | Approval 정상 입력 경로로 기록된 Jira 워크로그 | Approval 명부/검색에서 선택한 승인자, 팀장이 있으면 우선 | 항상 금지 |
| 연동 모드·연결 이슈 | Approval 정상 입력 경로로 기록된 워크로그 | 서명 검증된 Workforce 팀장 우선 | 작성자가 서명 검증된 Workforce 팀장이면 허용 |
| 연동 모드·미연결 이슈 | 승인 대상 아님 | 없음 | 금지 |

### 1.3 영향 범위

- 도메인: 운영 모드·이슈 연결 여부·Workforce 팀장 여부를 입력받아 승인 대상/자기 승인 가능 여부를 계산하는 순수 함수 추가
- resolver: 현재 사용자 결재자 안내 조회, 후보·수동 요청·자동 요청 범위 제한, 결정 직전 자기 승인 재검증
- SQL/마이그레이션: 없음
- Jira manifest/scope: 없음
- 프론트: 설정 상단에 현재 모드·대상 범위 카드, 모드별 정책 문구, 현재 사용자의 Workforce 팀장 이름, 자기 승인 가능 안내
- i18n: `kr/en`의 모드·범위·책임 구분·팀장 상태·범위 제외 오류 문구
- 워크포스 연동: 기존 서명 검증 `movesRms.org`, `movesRms.policy`/`movesRms.issue` 캐시만 사용. API 조회 화면 자료는 권한 판정에 사용하지 않는다.

## 2. 경계면 계약

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getApprovalSettings` (기존) | `{admin:true}` | 없음 | 기존 정책 + `workforceLinkEnabled:boolean` | 기존 계약 | 워크로그 승인 설정 |
| `saveApprovalSettings` (기존) | `{admin:true}` | `{worklogAutoRequest:boolean,timesheetAutoCloseDays:number}` | 갱신된 정책 | 기존 계약 | 두 모드 공통 정책 폼 |
| `getWorklogApprovalIdentity` (신규) | `SELF` | 없음. 대상 accountId는 payload가 아니라 `principal.accountId` | `{status:'DISABLED'\|'NONE'\|'VERIFIED', team:{teamKey,displayName}\|null, leaders:Array<{accountId,displayName,avatarUrl}>, isWorkforceTeamLead:boolean, ledTeams:Array<{teamKey,displayName}>, selfApprovalAllowed:boolean}` | 저장소/검증 실패는 throw하지 않고 범위 축소 응답. 로그인 주체 없음은 공통 가드 | 연동 모드 설정의 “현재 사용자 결재자 구성” |
| `listWorklogApprovalCandidates` (기존 확장) | `{issue:'view',appAccess:false}` | `{issueId,query?}` | 기존 필드 + `scope:{eligible,reason,mode}` + `selfApprovalAllowed:boolean`; 연결 이슈가 아니면 `users:[]`, `defaultApproverIds:[]` | 기존 권한 오류 | 워크로그 상세 승인 요청 모달 |
| `getWorklogCertification` (기존 확장) | `{issue:'view',appAccess:false}` | `{issueId,worklogId,historyBeforeRevision?}` | 기존 필드 + `scope:{eligible,reason,mode}`. 범위 제외면 `canRequest=false`, `canAppeal=false`; 기존 상태·이력은 그대로 반환 | 기존 계약 | 워크로그 상세 |
| `requestWorklogApproval` / `appealWorklogApproval` (기존 강화) | `{issue:'view',appAccess:false}` | 기존 입력 | 기존 응답 | 연동 모드 미연결 이슈면 `WORKLOG_APPROVAL_SCOPE_EXCLUDED`; 일반 사용자의 자기 지정은 `INVALID_APPROVER_CONFIGURATION` | 워크로그 상세 |
| `decideApproval` (기존, 공통 shape 유지) | `SELF` | 기존 입력 | 기존 응답 | 자기 요청을 본인이 결정할 때 Workforce 팀장·연결 자격 재검증 실패면 `APPROVER_NOT_ELIGIBLE` | 승인 상세/업무함 |

`getWorklogApprovalIdentity`는 기존 `registerWorklogCertificationController`에 `guardedDefine`으로 추가하고 `PermissionMap`에 같은 이름을 추가한다. registrar는 이미 `CONTROLLER_REGISTRARS`에 있으므로 새 registrar는 없다.

`scope.reason` 값은 판정용 제한 enum으로 고정한다.

- `null`: 승인 대상
- `WORKFORCE_ISSUE_NOT_LINKED`: 연동 모드지만 이슈가 연결되지 않음

## 3. 도메인

신규 파일 `src/domain/worklogCertification/eligibility.js`에 부작용 없는 판정을 둔다.

```js
worklogApprovalScopeOf({ linkMode, issueLinked })
// -> { mode:'LINKED'|'STANDALONE', eligible:boolean, reason:null|'WORKFORCE_ISSUE_NOT_LINKED' }

worklogSelfApprovalOf({ scope, isWorkforceTeamLead })
// -> { allowed:boolean, reason:null|'NOT_LINKED_MODE'|'ISSUE_NOT_LINKED'|'NOT_WORKFORCE_TEAM_LEAD' }
```

규칙:

1. `linkMode !== true`면 모든 정상 출처 워크로그가 승인 대상이다.
2. `linkMode === true`면 `issueLinked === true`일 때만 승인 대상이다.
3. 자기 승인은 `mode=LINKED && eligible && isWorkforceTeamLead===true`일 때만 허용한다.
4. 판정 함수는 `Date.now()`를 읽지 않는다. 서명 신선도와 현재 시각은 기존 `WorklogPolicyResolver`/`WorkforceInbound`가 처리한 boolean을 입력으로 받는다.

도메인 테스트:

- 단독 모드 + 미연결 표시값이어도 `eligible=true`, 자기 승인은 false
- 연동 + 연결 이슈는 `eligible=true`
- 연동 + 미연결 이슈는 `eligible=false`, reason 고정
- 연동 + 연결 + Workforce 팀장만 자기 승인 true
- Approval 명부 팀장 또는 검증 실패는 자기 승인 false

## 4. 백엔드

### 4.1 Workforce 조직 원천 확장

`WorkforceOrgSource`에 본인 조직 문서의 표시/판정용 최소 뷰를 추가한다.

```js
identityOf(accountId, { automatic = false } = {})
// VERIFIED일 때 team, leaderKeys, ledTeams, isWorkforceTeamLead, meta
// DISABLED/NONE이면 식별자 없는 축소 응답
```

- 일반 resolver: `principal.accountId === accountId`일 때 기존 `asUser` 자기 프로퍼티 읽기
- 자동 요청: principal 없는 문맥에서만 기존 `automaticRead:true`와 허용 사유 `worklog-approval-author-org`
- 자격 판정은 `orgView.leads.length > 0`. 팀원이 0명인 팀도 Workforce가 팀장으로 서명했다면 팀장이다.
- `leaderKeys` 표시 이름은 기존 `loadUsers()`의 `asUser user/bulk`를 사용한다. 이름 조회 실패는 accountId를 노출하지 않고 “이름 확인 불가” 표시로 축소한다.
- 기존 `orgViewOf()`의 일반 자기 제외 규칙은 유지한다. 자기 승인 예외는 `leads[]` 기반 별도 판정으로만 연다.

### 4.2 신규 현재 사용자 안내

`WorklogRequestService.identity(request)`를 추가한다.

1. `principal.accountId`만 대상자로 사용한다.
2. `WorkforceOrgSource.identityOf(accountId)`로 서명 검증 결과를 읽는다.
3. `loadUsers(leaderKeys)`로 표시 이름을 일괄 조회한다.
4. 이 응답은 설정 안내용이다. 승인 권한 판정은 매 요청마다 아래 서버 판정을 다시 수행한다.

### 4.3 승인 대상 범위 강제

`WorklogRequestService` 내부 공통 메서드로 이슈 유효 정책을 읽고 `worklogApprovalScopeOf()`를 적용한다. 판정은 이미 신뢰 검증을 마친 DB 캐시의 `effective.linkMode`, `effective.issueLinked`만 사용한다.

- `requestAutomatically()`:
  1. snapshot과 issue/project 식별
  2. effective policy 조회
  3. 범위 제외면 `proof()`, `observe()`, outbox, 요청 저장 전에 `{status:'NOT_APPLICABLE',created:false,scopeReason:'WORKFORCE_ISSUE_NOT_LINKED'}` 반환
  4. 대상이면 기존 정상 출처 증명·마감·중복·요청 생성 순서 유지
- `create()`/`appeal`:
  - 현재 이슈 policy를 조회해 범위 제외면 쓰기 전에 `WORKLOG_APPROVAL_SCOPE_EXCLUDED`
  - 기존 승인 기록의 조회·잠금은 바꾸지 않는다.
- `get()`:
  - 기존 상태와 감사 이력은 그대로 조회한다.
  - 범위 제외면 `canRequest=false`, `canAppeal=false`, 빈 후보를 주고 `scope`를 표시한다.
- `candidates()`:
  - issue의 project를 확인한 뒤 같은 범위 판정을 적용한다.
  - 범위 제외면 검색·사용자 열람 검사 없이 빈 목록을 반환한다.

### 4.4 Workforce 팀장 자기 승인

자기 승인 자격 판정은 후보·생성·자동 요청·결정 네 곳에서 같은 helper를 사용한다.

1. **후보**: `candidates()`에서 기존 상위 팀장 후보를 먼저 유지한다. 작성자 본인이 `worklogSelfApprovalOf(...).allowed`면 본인을 후보와 `defaultApproverIds` 마지막에 추가한다. 일반 사용자는 기존처럼 제거한다.
2. **수동 요청**: `selected === owner`이면 무조건 거부하던 조건을 조건부로 바꾼다. 자기 승인 자격이 true일 때만 통과한다. `assertApproversAllowed()`의 이슈 열람 검증은 그대로 수행한다.
3. **자동 요청**: 기존 상위 팀장 후보 뒤에 자격 있는 작성자 본인을 추가하고, 모든 후보에 기존 `automaticApproverCanView()`를 적용한다. 따라서 팀장 본인도 대상 이슈 열람이 없으면 결재선에 들어가지 않는다.
4. **결정 직전**: 공통 `ApprovalService`가 `adapter.beforeDecide(state,{now,principal,decision})`로 principal을 함께 전달한다. `WorklogCertificationTargetAdapter.beforeDecide()`는 `state.requesterKey === principal.accountId`이고 현재 결재선에 본인이 있는 경우, 현재 연동 모드·현재 이슈 연결·현재 서명 검증 Workforce 팀장 자격을 다시 확인한다. 하나라도 아니면 `APPROVER_NOT_ELIGIBLE`로 결정 저장 전에 닫는다. 다른 대상 종류와 다른 승인자의 결정은 영향을 받지 않는다.

결정이 통과하면 기존 `ApprovalRepository.approve()`가 다음을 그대로 보장한다.

- `approval_approver`의 `WHERE decision_type='PENDING'` 조건부 UPDATE
- 요청 `rev = rev + 1` CAS
- `approval_event` append-only `APPROVED` 이벤트
- `actor_key = requester_key`인 사실이 요청 이벤트와 승인 이벤트 양쪽에 남아 자기 승인임을 감사에서 판별 가능
- 기존 결정적 event id로 재시도 중복 방지

별도 `self_approved` 컬럼은 만들지 않는다. 동일 사실을 두 원장에 중복 저장하면 불일치 가능성만 늘어난다.

### 4.5 서비스 실패 방향

- 연동 이슈 여부를 확인할 수 없으면 연동 모드의 신규 승인 요청은 fail-closed 한다. `issueLinked`는 명시적 true만 인정한다.
- Workforce 팀장 자격을 확인할 수 없으면 자기 승인만 거부한다. 기존 상위 팀장·직접 선택 승인자 흐름은 유지한다.
- 표시 이름 조회 실패는 권한에 영향을 주지 않는다.
- 핫패스 트리거는 기존처럼 throw하지 않는다. `WorklogControlDetector`가 결과를 소비하지 않으며, 범위 제외는 정상 반환이다.

## 5. 스키마·마이그레이션

변경 없음.

- 기존 `approval_request`, `approval_approver`, `approval_event`, `worklog_certification`을 그대로 사용한다.
- 자기 승인도 기존 요청 1행 + 승인자 1행 + append-only 이벤트로 남는다.
- 마이그레이션 이름·테이블 readiness 경계 변경 없음.

## 6. Jira 연결

### 6.1 모듈·scope

변경 없음. 기존 admin page, issue activity/action, resolver만 사용한다.

### 6.2 REST와 실행 주체

| 용도 | API | 주체 | 호출 상한 |
|---|---|---|---|
| 현재 사용자의 Workforce 조직 문서 | 기존 user property GET | `asUser` | identity resolver당 1회, 5분 캐시가 신선하면 0회 |
| 자동 요청 작성자 조직 문서 | 기존 user property GET | `asApp`, 사유 `worklog-approval-author-org` | 자동 요청당 최대 1회, 5분 캐시가 신선하면 0회 |
| 팀장 표시 이름 | 기존 `user/bulk` 경로 | `asUser` | leaderKeys가 50명 이하면 1회 |
| 승인자 이슈 열람 | 기존 `/user/viewissue/search` | 수동은 기존 어댑터 `asUser`, 자동은 기존 허용 `asApp` 사유 | 자기 후보 추가 시 최대 1명분 증가 |

새 `asApp` 사유와 새 scope는 없다. 조직 API 화면의 3LO 데이터는 표시 전용 계약이므로 자기 승인 판정에 사용하지 않는다.

## 7. 프론트

### 7.1 화면 구조

`WorklogApprovalSettings`를 다음 순서로 구성한다.

1. **현재 운영 모드 카드** (`SettingsSection`)
   - Lozenge: `워크포스 연동` / `Approval 단독`
   - 한 문장: 현재 승인 대상
   - `SettingsRows`:
     - 승인 대상
     - 승인자 원천
     - 정책 책임
   - 모드 변경 위치: “설정 › 워크로그 › 워크포스 연동” 버튼. `FeatureSelectionSettings`가 받은 `onNavigate('workforce')`를 자식에 전달한다.
2. **현재 사용자 결재자 구성** (연동 모드만)
   - Workforce에서 받은 내 팀장 이름과 avatar
   - 본인이 Workforce 팀장이면 “내 워크로그 승인자로 나를 선택할 수 있음” 표시
   - 검증 자료 없음이면 “Workforce에서 서명된 팀장 정보를 아직 받지 못함”으로 표시하고 자기 승인 불가
3. **모드별 승인 정책 폼**
   - 같은 `worklogAutoRequest`, `timesheetAutoCloseDays`를 저장하되 제목·설명만 모드별로 분리
   - 연동: “연결 이슈에만 적용”을 field 위에서 반복 확인
   - 단독: “Approval 정상 입력 경로의 워크로그에 적용”
4. 기존 입력 창구 설정과 고급 정책 details 유지

두 모드를 탭으로 동시에 보여 주지 않는다. 현재 활성 모드 하나만 렌더링해 “어느 설정이 적용되는가”를 바로 알게 한다. 저장값은 공통 정책 키이므로 모드 전환 때 유지된다.

### 7.2 화면 문구 원칙

연동 모드:

- 대상: “Workforce에 연결되고 서명으로 확인된 이슈에서 Approval을 통해 기록한 워크로그”
- Workforce 책임: “이슈 연결, 팀, 팀장”
- Approval 책임: “자동 승인 요청, 승인 기한, 승인·마감 잠금, 감사 이력”

단독 모드:

- 대상: “Approval을 통해 정상 입력한 Jira 워크로그”
- 승인자: “Approval 팀 명부의 팀장을 기본으로 사용하고, 수동 요청 시 허용된 승인자를 선택”
- Approval 책임: “승인 대상·요청·기한·잠금·감사 전체”

기존 `settings.linked` 문구는 “별도 규칙이 없는 이슈에도 기본값 적용”이라고 말해 실제 요구와 반대이므로 제거/교체한다.

### 7.3 쿼리 키

`settingsKeys.worklogApprovalIdentity()`를 추가한다. 인라인 query key는 사용하지 않는다.

- `enabled: settings.workforceLinkEnabled === true`
- 연동 모드를 끄거나 켠 뒤 `settingsKeys.worklogApprovalIdentity()`도 invalidate
- identity 조회 실패는 정책 폼을 막지 않고 안내 카드만 축소 표시

워크로그 상세 후보 UI는 서버가 self 후보를 일반 사용자와 같은 `users` 배열로 주므로 Select 구조를 바꿀 필요가 없다. 필요하면 자기 항목 label 옆에 `worklogApprovalFlow.selfApprover` 보조 문구만 붙인다.

## 8. i18n 키

아래는 최소 키다. 기존 namespace `worklogApprovalFlow`를 유지한다.

| 키 | kr | en |
|---|---|---|
| `settings.mode.linked.title` | 워크포스 연동 모드 | Workforce linked mode |
| `settings.mode.standalone.title` | Approval 단독 모드 | Approval standalone mode |
| `settings.mode.linked.summary` | Workforce에 연결된 이슈의 정상 경로 워크로그만 승인합니다. | Only worklogs entered through the approved channel on Workforce-linked issues are in scope. |
| `settings.mode.standalone.summary` | Approval을 통해 정상 입력한 Jira 워크로그를 승인합니다. | Worklogs entered through Approval are in scope. |
| `settings.mode.target` | 승인 대상 | Approval scope |
| `settings.mode.approverSource` | 승인자 원천 | Approver source |
| `settings.mode.policyOwner` | 정책 관리 | Policy owner |
| `settings.mode.linked.targetValue` | Workforce 연결 이슈의 정상 경로 워크로그 | Approved-channel worklogs on Workforce-linked issues |
| `settings.mode.linked.approverValue` | Workforce의 서명 검증 팀장 | Signature-verified Workforce team lead |
| `settings.mode.linked.policyValue` | 연결·팀장은 Workforce, 요청·기한·잠금·감사는 Approval | Workforce owns links and teams; Approval owns requests, deadlines, locks, and audit history |
| `settings.mode.standalone.targetValue` | Approval 정상 입력 경로의 Jira 워크로그 | Jira worklogs entered through Approval |
| `settings.mode.standalone.approverValue` | Approval 팀 명부와 직접 선택 승인자 | Approval roster and explicitly selected approvers |
| `settings.mode.standalone.policyValue` | 승인 정책과 이력 전체를 Approval에서 관리 | Approval manages the full policy and audit trail |
| `settings.mode.change` | 워크포스 연동 설정에서 모드 변경 | Change mode in Workforce integration |
| `settings.identity.title` | 내 Workforce 결재자 구성 | My Workforce approver setup |
| `settings.identity.leaders` | 내 팀장 | My team lead |
| `settings.identity.none` | 서명으로 확인된 팀장이 없습니다. | No signature-verified team lead is available. |
| `settings.identity.selfAllowed` | Workforce 팀장이므로 내 워크로그 승인자로 나를 선택할 수 있습니다. | As a Workforce team lead, you can select yourself to approve your own worklog. |
| `settings.identity.selfDenied` | 일반 사용자는 자기 워크로그를 직접 승인할 수 없습니다. | Regular users cannot approve their own worklogs. |
| `error.WORKLOG_APPROVAL_SCOPE_EXCLUDED` | 이 이슈는 Workforce에 연결되지 않아 워크로그 승인 대상이 아닙니다. | This issue is not linked to Workforce, so its worklogs are outside the approval scope. |

## 9. 용량·호출량

### 9.1 저장 용량

새 테이블·컬럼·상시 스냅샷이 없다. 200명 기준 추가 고정 저장량은 0이다.

팀장 자기 승인은 원래 다른 팀장이 승인했을 요청과 같은 행 수를 사용한다.

- 요청당 `approval_request` 1행
- 승인자 1행
- `REQUESTED`, `APPROVED` 이벤트 각 1행
- 기존 워크로그 인증 원장 1행

자기 승인 때문에 요청 건수가 늘지 않는다는 전제에서 연간 용량 증가도 0에 가깝다. 자기 승인으로 기존 `NEEDS_APPROVER`였던 기록이 새로 요청되는 만큼만 기존 요청당 용량이 선형 증가하며, 별도 모델 비용은 없다.

### 9.2 호출량

- 설정 첫 로드: 정책 KVS/설정 조회는 기존과 같고, 연동 모드에서만 identity 조회가 추가된다. 캐시 miss 기준 조직 프로퍼티 REST 1 + inbound SQL read/CAS 최대 기존 경로 수준 + 사용자 이름 bulk REST 1.
- 수동 후보: 기존 후보 수에 self 최대 1명을 더하므로 이슈 열람 검사 최대 1회 증가.
- 자동 요청: 작성자가 Workforce 팀장이면 자동 후보 검사 최대 1명 증가. 5분 조직 캐시가 있으면 조직 REST 0.
- 미연결 이슈 자동 이벤트: eligibility에서 조기 반환하므로 기존 `observe`, outbox, 승인 요청 SQL이 사라진다.
- 유휴 상태: 신규 schedule/queue 없음, 하루 SQL 요청 증가 0.

## 10. 미검증

| 항목 | 영향 | 확인 방법 |
|---|---|---|
| 없음 — 새 Jira/Forge 플랫폼 동작에 기대지 않음 | 기존 검증된 user property, user display, issue visibility 경로만 재사용 | 기존 단위·계약 테스트와 development 배포에서 resolver 반환값 확인 |

다만 제품 의미 확인 항목으로, 연결 해제된 기존 PENDING 요청을 계속 결정 가능하게 둘지 향후 별도 정책 결정이 필요하다. 이번 변경은 삭제·자동 만료 없이 보존한다.

## 11. 작업 분해

### backend 체크리스트

- [ ] `eligibility.js` 순수 판정과 단위 테스트
- [ ] `WorkforceOrgSource.identityOf()` 추가, 검증 완료 조직만 사용
- [ ] `getWorklogApprovalIdentity`를 Controller + `PermissionMap`에 등록
- [ ] `WorklogRequestService`의 get/candidates/create/appeal/automatic에 동일 scope 판정 적용
- [ ] 자기 후보·명시 선택·자동 후보 조건부 허용
- [ ] `ApprovalService`가 `beforeDecide`에 principal/decision 전달
- [ ] Worklog certification adapter가 자기 결정 직전 linked issue + Workforce 팀장 자격 재검증
- [ ] 기존 append-only 이벤트·CAS 테스트로 자기 승인 actor/requester 동일 기록 확인
- [ ] 연동 모드 미연결 이슈 자동 요청 SQL/요청 생성 0 테스트
- [ ] 일반 모드·일반 사용자 자기 승인 금지 회귀 테스트

### frontend 체크리스트

- [ ] `WorklogApprovalSettings` 상단 모드 카드와 모드별 문구
- [ ] 연동 모드 identity query와 팀장 이름/자기 승인 안내
- [ ] `FeatureSelectionSettings`의 `onNavigate` 전달과 연동 설정 이동 버튼
- [ ] query key factory 추가 및 연동 토글 후 invalidate
- [ ] kr/en i18n 키와 범위 제외 오류
- [ ] linked/standalone/identity NONE/팀장 본인 UI 테스트
- [ ] 기존 두 정책만 저장하는 payload 계약 유지 테스트

### 최종 검증

에이전트 구현 종료 뒤 다음 순서로 한 번만 수행한다.

1. `npm run check:bundle`
2. `npm test -- --runInBand`
3. `npm run test:ui -- --runInBand`
4. `npm run build:ui`
5. `forge lint`

