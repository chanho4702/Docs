# product-polish-2026-10-20 설계서 — 상태 변경 승인 재활성화 · 연동/단독 구분 · 디자인·타이포 정비

> 작성: feature-architect · 2026-10-20 · 설계만(코드·locales·manifest 무변경)
> 입력: `00_input/requirement.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DESIGN.md` §2.1·§3, `git show 040eed1`, `_workspace/{transition-approval,transition-auto-apply,feature-selection,operating-mode,worklog-settings-mode-separation}/`
> 기준 코드: HEAD `42fce8b` + 작업 트리(다른 에이전트가 `SettingsRepository`·`InboxService`·`TimesheetService`·`WorklogService` 수정 중 — 아래 파일 목록과 겹치는 곳은 §12 순서에서 처리)

---

## 기본값으로 정한 것

사용자 지시("결정은 나중에, 제품을 빠르게")에 따라 아래는 묻지 않고 정했다. 바꾸려면 키 하나·분기 하나만 바뀌고 계약은 유지된다.

| # | 결정 | 근거 |
|---|---|---|
| D1 | **상태 변경 승인만 되살린다.** 이슈 결재(ISSUE)·필드 변경 승인(FIELD_CHANGE)은 계속 끈다 | 요구 문장이 "이슈 상태 변경 시 승인"뿐. 세 기능을 묶던 `issueApprovalEnabled` 는 2026-10-13 부터 서버가 `false` 고정·저장 거부(`ISSUE_APPROVAL_FEATURE_DISABLED`)다 — 이걸 풀면 나머지 둘도 같이 열린다 |
| D2 | 새 기능 스위치 **`statusChangeApprovalEnabled`**(기본 **꺼짐**, GLOBAL_ONLY). 판정 함수 `SettingsRepository.isStatusChangeApprovalEnabled()` 하나 | 기존 `transitionApprovalEnabled` 는 "강제 비상 해제" 스위치(미저장=강제)라 의미가 다르다 — 이름이 겹치면 또 혼동한다. 기본 꺼짐은 "배포했더니 우측 패널에 새 칸이 생겼다"를 막고, 관리자가 규칙·validator 를 준비한 뒤 켜게 한다. 끔 = 신규 접수 중지 + validator 통과(feature-selection 규칙 그대로) |
| D3 | 자동 적용(승인 즉시 요청자 권한으로 전환)은 **기존 동작 유지(AUTO)** | `TransitionExecutor` 가 이미 구현·검토 통과(transition-auto-apply 06 PASS). 신규 요청은 `apply_mode='AUTO'` 로 들어간다. 화면 필수 필드·권한 실패는 `BLOCKED`/`FAILED` → 요청자가 직접 전환(validator 가 승인을 알아본다). 끄는 정책은 만들지 않는다(필요해지면 키 하나) |
| D4 | 규칙 편집은 **Jira 프로젝트 설정 > Moves Approval** 에 둔다(`{project:'admin'}`). 앱 설정에는 기능 스위치·공통 정책·비상 해제·프로젝트별 규칙 현황 링크만 | 원래 설계(transition-approval §2.1)와 같다. 워크플로·상태는 프로젝트 관리자가 아는 것 |
| D5 | 이슈 화면: **우측 요약(issueContext)에만**, 규칙이 걸린 이슈일 때만 "상태 변경 승인" 칸을 워크로그 안내 **아래** 별도 카드로. issuePanel(full)·Work log 탭은 무변화 | CLAUDE.md 워크로그 중심 요구 — "이전 상태 변경 기능 명칭을 새 건별 승인과 혼동시키지 않는다". 위치를 분리하고 `ApprovalKindBadge(ISSUE_TRANSITION)` 로 이름을 붙인다 |
| D6 | ••• 메뉴 `transition-approval-action` 복구, title **"Request status change approval"**, 모달은 종류 선택(overview) 없이 **곧장 전환 목록** | validator 거부 문구가 가리키는 진입점이 필요하다. 일반 결재·필드 변경이 꺼져 있으니 종류 선택 화면은 의미가 없다 |
| D7 | 결재선은 **규칙의 Flow 로 고정**(요청자가 못 바꾼다) | 기존 Q56 결정 그대로 — 강제 전환에서 요청자가 결재자를 고르면 짜고 승인하는 경로가 열린다 |
| D8 | 운영 모드와 무관하게 같은 기능(워크포스 연동 없음) | 워크포스는 상태 변경 승인을 쓰는 화면이 없다(Q61 그대로). 결재선 해석에서 워크포스 팀장 주체를 쓰면 기존 Flow 해석이 그대로 따른다 |
| D9 | "연동"의 프론트 판정을 **3상태**로: `STANDALONE` / `LINKED_PENDING`(스위치 켬·채널 미연결) / `LINKED`(스위치 ∧ PAIRED). 서버가 `getApprovalSettings.linkActive` 로 준다 | 서버 판정 대부분은 이미 `ChannelState.isLinked()`(스위치 ∧ PAIRED)인데 프론트만 스위치로 "연동 중"이라 표시한다(B 조사 iii-1) |
| D10 | 모드를 모르면(로딩·오류) **전부 표시, 모드 경고 없음** 하나로 통일 | operating-mode 원칙(표시 fail-open) 재확인. 판정·쓰기는 서버가 막는다 |
| D11 | 타이포는 **Atlaskit 기본 스케일만** 쓴다(새 크기 발명 금지). 보조문은 `Text size="small"` 이되 **색은 subtle 한 단계만**(subtlest 는 메타데이터 한 줄·빈 상태만) | 조사: Text 의 63%가 small, small+회색 225줄 — 화면이 흐려 보이는 주원인. 크기를 키우기보다 "본문은 기본 크기"로 되돌리는 것이 위험이 적다 |
| D12 | 증명서(`CertificateSheet`)는 **인쇄 예외**로 두고 이번 정비에서 제외 | hex 색·px 는 인쇄 결과 고정을 위한 것. 토큰은 테마에 따라 바뀐다 |

## 열린 질문

막히는 것은 없다. 아래는 실측 결과에 따라 기본값이 바뀔 수 있는 항목이다(묻지 않고 진행).

| # | 항목 | 기본 진행 | 바뀌는 조건 |
|---|---|---|---|
| Q-A1 | validator payload 에 목적 상태 id 가 오는가(T1) | 온다고 보고 구현 변경 없음 | 안 오면 강제가 조용히 꺼진다 → 기능 켜기 전 관문(04 T1). 실패 시 설계 재검토 |
| Q-A2 | manifest 변경이 minor 인가(T0) | minor 로 본다 | major 면 다음 major 묶음(production egress S1)과 합쳐 배포 |

---

## 1. 개요·영향 범위

| 갈래 | 도메인 | resolver | 스키마 | manifest | 엔트리 | i18n | 워크포스 |
|---|---|---|---|---|---|---|---|
| A | `domain/settings/features.js`(Feature 추가) | 기존 Transition* 재사용, 기능 판정 교체, `getIssueTransitionApprovals` 조기 반환 | **없음**(v029·v030·v039~ 이미 있음) | issueAction 1개 주석 해제 | issue·modal·projectSettings 수정(새 엔트리 없음) | transition·policy·approvalKind·project | 없음 |
| B | 없음 | `getApprovalSettings` 에 `linkActive`, 판정 기준 통일 5곳 | 없음 | 없음 | 설정·이슈 화면 | operatingMode 문구 | 없음(승인 앱 내부) |
| C | 없음 | 없음 | 없음 | 없음 | 전 엔트리(공용 CSS·컴포넌트) | 없음 | 없음 |

---

## A. 상태 변경 승인 재활성화

### A.1 현재 상태 (실측한 코드)

| 층 | 상태 | 근거 |
|---|---|---|
| 도메인 `src/domain/transition/*` | **살아 있음** — judge·rule·usability·statusChange·applyPlan·validatorPayload·messages·commentAdf, 테스트 `judge.test.js`·`transitionDomain.test.js` | `ls src/domain/transition` |
| resolver | **살아 있음·등록됨** — `getIssueTransitionApprovals`·`createTransitionApproval`(`{issue:'view'}`), `listTransitionRules`·`saveTransitionRule`·`deleteTransitionRule`(`{project:'admin'}`), `retryTransitionApply`·`reconcileTransitionApply`(SELF) | `TransitionController.js`, `PermissionMap.js:28-29,207-212`, `index.js:17,75` |
| 서비스 테스트 | 8개(`TransitionService`·`ValidatorService`·`Executor`·`OfflineGateway`·`ChangeService`·`CommentNotifier`·`Repositories`·`enrichTransitionApply`) | `src/resolver/transition/__test__` |
| validator | manifest `jira:workflowValidator transition-approval-validator` **활성**, `index.validateTransition` | `manifest.yml:98-103,172` |
| 트리거 | `issue-changed`(소비·만료) **활성**, 일일 스윕 fan-out `transition-apply`(자동 적용 복구) **활성** | `manifest.yml:118-124`, `sweepJobs.js:26` |
| 자동 적용 | 신규 행 `apply_mode='AUTO'`, 요청자 offline asUser(`TransitionOfflineGateway`, manifest `allowImpersonation:true` 이미 있음) | `TransitionRepository.js:95` |
| **차단 지점** | `SettingsRepository.isIssueApprovalEnabled()` 가 **`return false` 고정** → 요청 생성·validator(`PASS_DISABLED`)·자동 적용·`ApprovalService.createForTarget` 전부 꺼짐. `SettingsService.saveApprovalSettings` 가 `issueApprovalEnabled:true` 저장을 `ISSUE_APPROVAL_FEATURE_DISABLED` 로 거부, `getApprovalSettings` 가 `issueApprovalEnabled:false` 고정 응답 | `SettingsRepository.js:299-302`, `SettingsService.js:265,309` |
| 프론트 컴포넌트 | **남아 있음** — `features/transition/*`(목록·요청 폼·규칙 설정·규칙 모달·적용 패널), modal 의 `TransitionModalFlow`·`OverviewModalFlow` | `ls features/transition`, `entries/modal.jsx:283-420` |
| 걷어 낸 진입점(040eed1) | manifest issueAction 주석, `entries/issue.jsx`(IssueApprovalOverview 제거), `entries/projectSettings.jsx`(TransitionRuleSettings 제거), `FeatureSelectionSettings`(토글 제거 → 워크로그 설정), `settingsNavigation`(issue 묶음 `approval` 제거), `approvalKindModel.enabledKinds()` = `['WORKLOG_CERTIFICATION']` 고정 | `git show 040eed1` |
| 실측 | **0건** — `_workspace/transition-approval/04_spike_todo.md` X1~X31 결과 칸 전부 공란 | — |

결론: **엔진·백엔드는 고치지 않는다.** 기능 판정 하나를 분리해 열고, 프론트 진입점 4곳을 현재 구조에 맞춰 다시 붙인다.

### A.2 scopeKey·불변식

- scopeKey `TRANSITION:{issueId}:{toStatusId}` — 무변경(불변식 1).
- 결정 원천 `approval_approver`, CAS `rev = rev + 1`, PENDING 조건부 UPDATE — 엔진 무변경(불변식 2·4·5).
- validator 는 함수형만(불변식 10) — 무변경. asApp 은 AGENTS 4번(`transition-validate`·`transition-changelog`)과 `TransitionOfflineGateway` impersonation 만 — 추가 없음.

### A.3 사용자 흐름 (화면 단위)

```
[앱 설정 > 이슈 승인 > 상태 변경 승인]  관리자: 기능 켬(D2) · 코멘트 알림 정책 · 비상 해제
        │ "규칙은 각 프로젝트 설정에서" + 적용 프로젝트별 규칙 수 표(링크)
        ▼
[Jira 프로젝트 설정 > Moves Approval]  프로젝트 관리자: 규칙 = 이슈 유형 × 목적 상태 × 결재선
        │ 같은 화면 상단: validator 부착 가이드(classic / team-managed 분기, 이미 있는 guideKey)
        │ 수용 기준 문장: "validator 를 붙인 전환에서만 강제된다"
        ▼
[Jira 워크플로 편집기]  관리자가 목적 상태로 들어가는 전환마다 validator 부착 (고객 작업)
        ▼
[이슈 우측 요약]  규칙이 걸린 이슈만 "상태 변경 승인" 카드: 목적 상태별 행(상태·쓸모 Lozenge·[승인 요청])
[이슈 ••• > Request status change approval]  → 같은 목록 모달(validator 거부 시 사용자가 찾는 곳)
        ▼
[요청 폼(모달)]  결재선 고정 표시 · 메시지 · 마감 · 참조
        ▼
[업무함 > 내 차례]  종류 배지 "상태 변경 승인" · 결재 · 일괄 승인
        ▼ 최종 승인
[자동 적용]  요청자 권한으로 POST transitions → validator 가 승인 arm → 트리거 소비 → APPLIED
        │ BLOCKED/FAILED → 요청자 알림 "승인됨 — 직접 전환하세요", 상세에 재시도 버튼
        ▼
[이력]  모달 상세 결재 순서·적용 상태 · 업무함 내 이력 · 기록 > 감사(승인) · 증명서
```

### A.4 경계면 계약

#### A.4.1 변경 resolver

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueTransitionApprovals` | {issue:view} (무변경) | `{issueId}` | 기존 `IssueTransitionView`(transition-approval §2.3 + auto-apply `apply`). **변경: 기능 끔이면 Jira·SQL 전에 조기 반환** `{issue:{issueId}, enforced:false, notEnforcedReason:'FEATURE_DISABLED', targets:[], history:[]}` (KVS 1, SQL 0, Jira 0). `featureEnabled` 조회 실패는 기존처럼 켬(표시 fail-open) | 무변경 | issue 엔트리 compact 카드, modal 전환 목록 |
| `createTransitionApproval` | 무변경 | 무변경 | 무변경 | 기능 끔이면 **`STATUS_CHANGE_APPROVAL_DISABLED`**(신규, 기존 `ISSUE_APPROVAL_FEATURE_DISABLED` 대체 — 이 경로만) | modal 요청 폼 |
| `getApprovalSettings` | {admin} | — | 기존 + **`statusChangeApprovalEnabled:boolean`**(항상 boolean, 미저장=false) + **`linkActive:boolean`**(B, `ChannelState.isLinked()`, 조회 실패 시 `null`) | 무변경 | 설정 전반 |
| `saveApprovalSettings` | {admin} | patch 에 `statusChangeApprovalEnabled:boolean` 허용 | 무변경 | 무변경(`issueApprovalEnabled:true` 거부는 유지) | 상태 변경 승인 설정 |
| `getTimesheetContext` | SELF | — | `features` 에 **`statusChangeApproval:boolean`** 추가 | — | 업무함 종류 필터 |

#### A.4.2 그대로 쓰는 resolver (계약 무변경 — transition-approval §2, transition-auto-apply §2 가 원천)

`listTransitionRules` · `saveTransitionRule` · `deleteTransitionRule` · `retryTransitionApply` · `reconcileTransitionApply` · `getApprovalDetail`(ISSUE_TRANSITION target) · `getApprovalCertificate`(`transition` 블록) · `decideApproval`(`TRANSITION_STATE_CHANGED`) · `bulkApprove` · `listInbox`(`transition` 필드) · `listNotifications`(transition 템플릿) · `listAllApprovals`.

#### A.4.3 신규 에러 코드

| code | 의미 | 위치 |
|---|---|---|
| `STATUS_CHANGE_APPROVAL_DISABLED` | 상태 변경 승인 기능이 꺼져 새 요청을 받지 않음 | `ErrorCodes` + `locales/{kr,en}/error.json` 동시 |

#### A.4.4 validator 계약

무변경(transition-approval §2.7). 판정 순서의 첫 단계 `featureEnabled` 가 새 판정 함수로 바뀔 뿐 — 끔이면 `PASS_DISABLED`(강제 없음).

### A.5 도메인

`src/domain/settings/features.js`

```js
Feature = { ISSUE_APPROVAL, TIMESHEET_APPROVAL, STATUS_CHANGE_APPROVAL /* 신규 */ }
FEATURE_OF_KIND.ISSUE_TRANSITION = Feature.STATUS_CHANGE_APPROVAL   // 기존 ISSUE_APPROVAL 에서 이동
```

테스트: `ISSUE_TRANSITION → STATUS_CHANGE_APPROVAL`, `ISSUE`·`FIELD_CHANGE → ISSUE_APPROVAL` 유지.

### A.6 백엔드

| 파일 | 변경 |
|---|---|
| `src/resolver/settings/SettingsRepository.js` | `SETTINGS_KEYS.statusChangeApprovalEnabled = 'approval:settings:statusChangeApprovalEnabled'`, `DEFAULT_APPROVAL_SETTINGS.statusChangeApprovalEnabled = false`, POLICY_KEYS 포함(**기본값·KVS 키 맵·검증 세 곳 동시** — 계약 테스트), `isStatusChangeApprovalEnabled()` = `effectiveFlag(stored, false)`, `featureFlags()` 에 `statusChangeApproval` 추가(KVS 3). `isIssueApprovalEnabled()` 의 `false` 고정 **유지** |
| `src/resolver/settings/SettingsService.js` | 정규화에 boolean 검증, `getApprovalSettings` 응답에 boolean + `linkActive`(B), `FEATURE_SWITCH_KEYS`·`SEPARATE_AUDIT_KEYS` 에 추가(감사 action `feature/statusChangeApproval`), `changedSwitches` reader 추가 |
| `src/resolver/transition/projectEnablement.js` | `isStatusChangeApprovalEnabled(settings)` export 추가 |
| `TransitionService.js` / `TransitionValidatorService.js` / `TransitionExecutor.js` | 기본 주입 `featureEnabled = () => isStatusChangeApprovalEnabled()` 로 교체(3줄). `TransitionService.getIssueTransitionApprovals` 는 `featureEnabled()` 를 **맨 앞에서** 보고 false 면 조기 반환(A.4.1), `createTransitionApproval` 은 새 에러 코드 |
| `src/resolver/approval/ApprovalService.js` | `featureEnabled(feature)` 분기에 `STATUS_CHANGE_APPROVAL → isStatusChangeApprovalEnabled()`, 거부 코드 매핑(:375) 에 새 코드 |
| `src/resolver/timesheet/TimesheetService.js` | `features` 응답에 `statusChangeApproval` (다른 에이전트 수정 중 — §12) |
| `test/feature/featureGateScope.contract.test.js` | `FLAG_USE` 정규식에 `isStatusChangeApprovalEnabled`, RAW_KEY 에 키 추가, ALLOWED 목록 동일(같은 파일들) — **범위 확대 없음** 을 테스트로 고정 |
| `AGENTS.md` | 변경 없음(asApp 사유 추가 없음) |

CAS·트리거·스윕: 무변경. 일일 fan-out `transition-apply` 는 이미 목록에 있음(빈 상태 4 SQL — `idleSqlBudget.test.js` 값 무변경 확인).

### A.7 manifest

```yaml
jira:issueAction:
  - key: transition-approval-action        # 키 유지(X28, 배포 이력)
    title: Request status change approval  # "Request approval" → 종류가 드러나게
    resource: main/modal
    resolver: { function: resolver }
    viewportSize: medium
```

- 주석 해제 1개 + issueContext 주석 문구 정리. scope·egress·SQL·function 무변경.
- **major 판단: minor 로 본다.** Forge 는 권한(scope·egress·external)·라이선스 등 동의가 필요한 변경을 major 로 취급하고, 새 scope 를 요구하지 않는 UI 모듈 추가는 동의가 필요 없다. 이 모듈은 2026-10-13 이전 배포에도 있었다. 단 공식 문서로 다시 확인하지 않았으므로 **미검증**(04 T0) — `forge deploy` 출력으로 확인.
- `forge install --upgrade` 는 모듈 변경이라 실행한다(AGENTS 배포 규칙).

### A.8 프론트

| 파일 | 변경 |
|---|---|
| `entries/issue.jsx` | compact 일 때 워크로그 안내 아래 `<StatusChangeApprovalCard issueId />` 추가(새 파일, `features/transition/`). full(issuePanel)은 무변경. 모달 onClose 에서 `transitionKeys.issue(issueId)`·`approvalKeys.all` 무효화(040eed1 이전 코드 복원) |
| `features/transition/StatusChangeApprovalCard.jsx` (신규) | `getIssueTransitionApprovals` 1회. `enforced=false && history.length===0` → **null 렌더**(규칙 없는 이슈에 아무 것도 늘지 않음). 그 외: 제목줄 `ApprovalKindBadge kind=ISSUE_TRANSITION` + 한 줄 설명(`approvalKind.hint.ISSUE_TRANSITION`), 목적 상태 행(`TransitionTargetRow` 재사용), [승인 요청] → `Modal(main/modal, {intent:'transitionRequest', toStatusId, transitionId})`, 최근 요청 1건 → 상세. 무거운 목록·이력은 모달(`transitionPick`)로 |
| `entries/modal.jsx` + `features/transition/transitionModel.js` `resolveModalTarget` | issueAction(`transition-approval-action`)·intent 없음 → **`flow:'transition', intent:'transitionPick'`** (overview 아님). `OverviewModalFlow` 는 진입점이 없어져 남기되 미사용(코드 보존) |
| `entries/projectSettings.jsx` | `TransitionRuleSettings` 복원(`IssueExceptionList` 아래). 기능 끔이면 규칙 표 위 `FeatureOffNotice` 한 줄(편집은 허용 — 켜기 전에 준비). 상단 문구 `project.placeholder.body` 를 모드·기능별로 나눔(B와 함께) |
| `features/transition/TransitionRuleSettings.jsx` | 자체 `Heading medium` → `SettingsSection`(C 규칙). validator 가이드(`guideKey`)를 섹션 설명 첫 줄로, 수용 기준 문장 표시 |
| `features/settings/settingsNavigation.js` | `SETTINGS_GROUPS` 에 `{ key:'issue', labelKey:'policy.settings.group.issue', items:['approval'] }` 를 general 뒤에 복원. `canonicalSettingLocation('approval')` 이 다시 `approval` 로 가게(현재 DEFAULT 로 보냄). 배지 `featureBadgeOf('approval')` = `statusChangeApproval===false ? 'off' : transitionEnforced===false ? 'bypass' : null` |
| `features/settings/IssueApprovalSettings.jsx` | 제목 라벨 "상태 변경 승인"(`policy.settings.tab.approval` 값 변경), `ISSUE_KINDS=['ISSUE_TRANSITION']`, 맨 위 **기능 토글 섹션**(040eed1 이전 `FeatureToggle` 을 `policyKey="statusChangeApprovalEnabled"` 로 복원, 끄기 확인 모달 포함) → 정책(`IssueApprovalPolicySettings`, 코멘트 알림 등) → 적용 현황(`getFeatureOverview.projects` 재사용, 규칙은 프로젝트 설정 안내) → 비상 해제(`EmergencyBypassSection`) |
| `features/settings/featureStateModel.js` | `featureStateOf`·`featureStateOfContext` 에 `statusChangeApproval`(`=== true` — 기본 꺼짐이라 `!== false` 아님) |
| `features/approval/approvalKindModel.js` | `FEATURE_OF_KIND.ISSUE_TRANSITION = 'statusChangeApproval'`, `enabledKinds(features)` = `['WORKLOG_CERTIFICATION', ...(features?.statusChangeApproval === true ? ['ISSUE_TRANSITION'] : [])]`. 모르면(null) 워크로그만(종류 칩은 필터일 뿐 — 서버는 모든 종류 행을 준다). **TIMESHEET 은 이번에 건드리지 않는다**(현재 제품 결정 유지) |
| `features/inbox/inboxUrl.js` | `enabledKinds()` 인자 없는 호출 → 기능 상태를 받게(URL `kind=ISSUE_TRANSITION` 이 지워지지 않게). 모르면 kind 유지 |
| `features/inbox/InboxTable.jsx` | ISSUE_TRANSITION 행 보조줄 `transitionLabel(item.transition)` — 이미 있음, 확인만 |

쿼리키: 기존 `transitionKeys.issue/rules/all`, `settingsKeys.policy/featureOverview`, `timesheetKeys.context` — 신규 없음.

이슈 화면 명칭 규칙(혼동 방지):
- 워크로그: "워크로그 승인"(기존 `WORKLOG_CERTIFICATION` 라벨) — 상단, 기본.
- 상태 변경: 카드 제목 "상태 변경 승인" + Lozenge `inprogress` + "승인되면 이슈 상태가 바뀝니다." — 하단, 규칙 있을 때만.
- 버튼 문구도 구분: 워크로그 "작업 기록", 상태 변경 "승인 요청" → **"상태 변경 승인 요청"** 으로 명시.

### A.9 i18n (kr / en)

| 키 | kr | en |
|---|---|---|
| `policy.settings.tab.approval` | 상태 변경 승인 | Status change approval |
| `policy.settings.group.issue` | 이슈 | Issues |
| `policy.features.statusChange.toggle` | 상태 변경 승인 사용 | Use status change approval |
| `policy.features.statusChange.description` | 정한 상태로 바꾸기 전에 결재를 받게 합니다. 규칙은 각 Jira 프로젝트 설정에서 정합니다. | Require approval before an issue moves to chosen statuses. Rules are set in each Jira project's settings. |
| `policy.features.confirm.statusChangeOff.title` | 상태 변경 승인을 끌까요? | Turn off status change approval? |
| `policy.features.confirm.statusChangeOff.body` | 새 요청을 받지 않고 워크플로 검사도 통과시킵니다. 진행 중인 결재와 이력은 그대로 남습니다. | New requests stop and workflow checks pass. Open approvals and history stay. |
| `policy.features.statusChange.rulesHint` | 규칙은 Jira 프로젝트 설정 > Moves Approval 에서 만들고, 워크플로 전환에 "Moves Approval — approval required" 검사를 붙여야 강제됩니다. | Create rules in Jira project settings > Moves Approval, then add the "Moves Approval — approval required" validator to the transitions. |
| `transition.card.title` | 상태 변경 승인 | Status change approval |
| `transition.card.request` | 상태 변경 승인 요청 | Request status change approval |
| `transition.card.more` | 전체 보기 | View all |
| `error.STATUS_CHANGE_APPROVAL_DISABLED` | 상태 변경 승인이 꺼져 있어 새 요청을 받지 않습니다. | Status change approval is turned off. New requests are not accepted. |
| `project.placeholder.body.standalone` | 이슈별 워크로그 기록 규칙의 예외와 상태 변경 승인 규칙을 관리합니다. | Manage per-issue worklog rule exceptions and status change approval rules. |
| `project.placeholder.body.linked` | (위) + 워크포스 연동 이슈의 작성 기간·사전 승인은 워크포스에서 정합니다. | (above) + For Workforce-linked issues, logging windows and pre-approval are set in Workforce. |

기존 `transition.json`·`transitionApply.json` 은 그대로 쓴다. `npm run merge` 필수.

### A.10 용량·호출량

- 이슈 화면 1회 로드(compact 카드):
  - 기능 끔(기본): KVS 1, SQL 0, Jira 0 — **현재 대비 resolver 호출 1회 증가**(카드 쿼리). 이슈 화면은 상시 로드라 이것만 늘어난다. 줄이려면 카드가 `getTimesheetContext.features` 캐시를 먼저 보는 방법이 있으나 그 쿼리도 이슈 화면에 없다 → 조기 반환으로 충분.
  - 기능 켬·규칙 없음: Jira 1(`issue?expand=transitions`) + KVS 3 + SQL ≈4(tableReady 마커 캐시 시 2) — 기존 설계값.
  - 기능 켬·규칙 있음: + Flow 목록 1.
- validator 1회: 규칙 없는 목적 상태 SQL 1, Jira 0(기존).
- 200명·전환 승인 하루 50건: transition-approval §9.1 값 그대로(연 1.8만 요청 행 수준) — 테이블 추가 없음.
- 유휴 SQL: 변화 없음(`transition-apply` fan-out 4회는 이미 27회 합계에 포함).

### A.11 테스트 계획

백엔드:
- `SettingsFeatureFlags.test.js` — `isStatusChangeApprovalEnabled` 미저장 false / true / false / KVS 실패 throw, `featureFlags` 3키, `isIssueApprovalEnabled` false 고정 유지.
- `SettingsService` — 저장·응답 boolean, 감사 `feature/statusChangeApproval`, `issueApprovalEnabled:true` 거부 유지.
- 정책 키 계약 테스트(기본값 ↔ KVS 키 맵 ↔ 검증) 통과.
- `TransitionService.test` — 끔 조기 반환에서 reader·SQL 호출 0, 생성 `STATUS_CHANGE_APPROVAL_DISABLED`.
- `TransitionValidatorService.test` — 끔 → `PASS_DISABLED`, 켬 → 기존 판정.
- `featureGateScope.contract.test` — 허용 목록 동일.
- `domain/settings` — Feature 매핑.
- `npm run check:bundle`.

프론트:
- `StatusChangeApprovalCard.test` — 끔/규칙 없음 → 렌더 없음, 규칙 있음 → 배지·행·요청 버튼, 요청 버튼 Modal context.
- `transitionModel.test` — issueAction 진입 → `transitionPick`.
- `settingsNavigation.test` — issue 묶음, `approval` 정규 위치, 배지.
- `IssueApprovalSettings.test` — 토글 켜기/끄기 확인 모달, 한 키 patch.
- `approvalKindModel.test`·`inboxUrl.test` — 기능 상태별 종류.
- projectSettings 렌더(규칙 섹션 존재).

---

## B. 연동/단독 모드 구분

### B.1 원칙 (한 장)

1. **판정 원천은 서버 둘**: `workforceLinkEnabled`(스위치 — 관리자 선택), `linkActive`(= `ChannelState.isLinked()`, 스위치 ∧ PAIRED — 실제 동작). 프론트는 `operatingModeOf(policy)` → `'STANDALONE' | 'LINKED_PENDING' | 'LINKED' | null`.
2. **단독**: 연동 전용 항목은 렌더하지 않는다(값은 지우지 않음). 단, 단독인데 연동 전용 값이 켜져 있으면 "단독이라 무시 중" 경고 한 줄(operating-mode 규칙 유지).
3. **LINKED_PENDING**: 연동 전용 항목을 보이되 맨 위 한 줄 "워크포스 연결이 끝나지 않아 아직 단독처럼 동작합니다 — 워크포스 연동에서 연결".
4. **연동**: 워크포스가 원장인 값은 읽기 전용 + "워크포스에서 변경" 칩. 승인 앱이 원장인 값과 겹치면(명부 팀 vs 워크포스 팀) "결재선은 워크포스 우선" 표시.
5. **모름(null)**: 전부 표시, 모드 경고 없음(D10).
6. 백엔드 **연동 데이터를 읽거나 적용하는 판단은 `isLinked()`**, 스위치(`isWorkforceLinkEnabled`)는 "관리자가 무엇을 골랐나" 표시·페어링 관리에만.

공용 프론트 장치(신규 `features/settings/LinkedOnly.jsx`, 순수 모델은 `operatingModeModel.js`):

```jsx
<LinkedOnly mode={mode} fallback={null} pendingNotice>  {/* STANDALONE 이면 fallback, null·LINKED* 면 children */}
```
`useOperatingMode` 는 이미 있음 — 비관리자 화면은 `getTimesheetContext.workforce`(있으면) 또는 서버 판정(`linked` 필드)을 그대로 쓴다(관리자 전용 `getApprovalSettings` 를 부르지 않는다).

### B.2 화면별 현황 → 목표

| 화면 | 현재 | 문제 | 목표 |
|---|---|---|---|
| 설정 메뉴 `settingsNavigation.js:46,150` | "워크포스 연동" 항목에만 모드 배지(스위치 기준) | 스위치만 켜고 미연결도 "연동" | 배지 3상태(`LINKED_PENDING` = warning "연결 필요") |
| 워크로그 승인 설정 `WorklogApprovalSettings.jsx:19-41` | 문구만 모드별, 폼 동일 | 연동 이슈는 팀장 설정이 이김(`WorklogRequestService.js:279` `wa.autoRequest`)을 말하지 않음 | 연동이면 "연동 이슈는 워크포스 팀장 설정 우선" 한 줄. `wa` 를 서버가 아직 읽는지 backend 확인(CLAUDE.md 는 2026-10-14 삭제라 함) — 읽으면 채널 값 출처를 주석으로 |
| 모드 카드 `WorklogApprovalModeContext.jsx` | 스위치 기준 "연동 중" | 미연결도 "연동 중" | 3상태 |
| 팀 `TimesheetTeamSettings.jsx` + `WorkforceTeamsSection.jsx:63-90` | 명부 편집 자유, 워크포스 섹션은 서버 응답 후 숨김 | 단독에서도 워크포스 섹션 제목·스피너가 잠깐(오류 시 계속) 보임. 연동에서 명부 행에 워크포스 우선 표시 없음 | 단독: query `enabled:false` + 렌더 없음. 연동: 명부 행 겹침 배지 "결재선은 워크포스 우선" |
| 워크로그 통제 `WorklogControlSettings.jsx:177,184,196,235,411-418` | Phase C·다른 경로 범위에만 standalone 반영 | 단독에서 `guide.linkScope`·능력 신호 다시 읽기·기간 창(연동 이슈 전용)·관문 G_WF/G_LINK/G_HANDOFF 노출. 다른 경로 범위 기본 `LINKED` 라 단독 새 설치는 감지 안 됨 | 단독: 능력 신호·G_WF/G_LINK/G_HANDOFF 숨김, 기간 창 "연동 이슈에만 적용 — 단독에서는 동작 안 함" 경고, 범위 선택지 `LINKED` 비활성 + **단독 미저장 기본값은 `ALL`**(서버 기본값 분기 — backend) |
| 정책 모달 `WorklogPolicyPanel.jsx:160-163,275` (설정 > 적용 프로젝트) | "워크포스 고정"·"워크포스 정책 다시 받기"·hierarchy 안내 항상 | 단독에서 버튼 누르면 `WORKFORCE_LINK_DISABLED` | 단독이면 버튼·워크포스 문단 숨김. 연동이면 프로젝트 범위 `approvalMode` 옆 "연동 이슈는 팀장 설정 우선" |
| 타임시트 정책 `TimesheetPolicySettings.jsx:186,350-362` | 이력 수집 범위 `PROJECT_OR_LINKED`·`LINKED_ONLY` 항상 | 단독에서 의미 없음 | 단독이면 LINKED 계열 비활성 + 저장값이 그것이면 무시 중 경고 |
| 감사 › 워크로그 변경 `WorklogHistoryAuditSettings.jsx:50,168-173` | 배지만 숨김 | "워크포스 연결분만" 체크박스 노출 | `showLinked` 로 체크박스도 |
| 이슈·타임시트 이력 `WorklogHistoryPanel.jsx:67`, `TimesheetHistorySection.jsx:55`, `WorklogHistoryList.jsx:76` | `showLinked` 기본 true | 단독에서도 "워크포스 연결 대상" 배지 | 기본 **false**, 서버 응답 행의 `linked` 가 true 인 행만 배지(데이터 기반) |
| 엑셀 `exportWorklogHistoryExcel.js:59,78` | "워크포스 연결 대상" 열 항상 | 단독 파일에 의미 없는 열 | 모드 인자로 열 생략 |
| 프로젝트 설정 `entries/projectSettings.jsx:44` | "연동 이슈 승인 규칙은 Workforce 에서" 항상 | 단독에 워크포스 문구 | A.9 의 standalone/linked 문구. 이 엔트리는 비관리자(프로젝트 관리자)라 모드는 `listIssueExceptions.linkMode`(이미 응답에 있음)로 |
| 이슈 Work log `WorklogTab.jsx:170,190-195` | 서버 이슈 판정(`isLinked`) 기반 — **정상** | `getLinkedIssueOverview` 실패 시 단독에서도 경고 배너 | 실패하면 배너 대신 규칙 줄만 "—"(조용히). 단독 사이트에서 호출 자체는 유지(서버 `isLinked` false 면 KVS 만) |
| 업무함·승인 관리·기록 | 모드 무관(데이터 기반) — **정상** | `AuditPage.jsx:62` 만 모름=숨김(fail-close) | 모름=표시로 통일 |
| 워크포스 연동 `WorkforceLinkSettings.jsx:648-655` | 두 query 중 하나 실패면 화면 전체 오류 | 스위치를 끌 수도 없음 | 상태 조회 실패는 상태 섹션만 오류, 스위치는 남김 |
| 죽은 코드 `LinkedIssueEntry`·`LinkedSettingSummary`·`LinkedWorklogPanel`·`LinkedKpiCards`·`LinkedWorklogForm` | import 0 | 혼동·타이포 조사 잡음 | **삭제**(+ 테스트). frontend 가 grep 재확인 후 |

### B.3 백엔드 판정 통일 (fail 방향 표)

| 파일:줄 | 현재 | 변경 | 실패 시 |
|---|---|---|---|
| `WorklogControlWorker.js:437-465` (LINKED_ALL 백필) | 모드 검사 없음 — 옛 VERIFIED 캐시로 Jira 조회·PENDING 행 삽입 | **머리에서 `channel.isLinked()` false → 연동 단계 건너뜀**(최우선) | 건너뜀(fail-close) |
| `WorklogPolicyResolver.js:14,22,28,48,65` | 스위치 기준, 미주입 기본 `true` | `isLinked()` 기준, 기본값 제거 | 연동 아님으로(옛 캐시 적용 안 함) |
| `WorklogControlDetector.js:94-96,169-172` | `policyLoader().workforceLinkEnabled === true` 직접 읽기(단일 판정 규칙 위반) | `isLinked()` | 기존 Detector 정책(관찰 생략) |
| `WorklogPolicyService.js:27-34` `project()` | `workforceRows` 무조건 합침 | `isLinked()` false 면 `wf` 빈 Map | 빈 Map |
| `LinkedIssueSettingSource.resolveMany:197-243` | 미연결이어도 캐시 VERIFIED 를 `linked:true` 로 | `!linked` → NOT_LINKED 뷰 | NOT_LINKED |
| `WorklogHistoryRecorder.js:121` | 스위치 | `isLinked()`(이력 배지 `linked` 의 기준 통일) | 연결 아님 |
| `SettingsService.getApprovalSettings` | — | `linkActive` 추가(KVS `channel-state` 1회 추가), 실패 `null` | null(모름) |
| `WorklogControlSettings` 다른 경로 범위 기본값 | 미저장 = `LINKED` | 미저장 + 단독 = `ALL`(응답 시 결정, 저장하지 않음) | `LINKED`(현행) |

`isWorkforceLinkEnabled()` 는 남는 용도: `PairingService`(페어링 관리)·`ChannelServer:149`(수신 거부)·`ChannelState.isLinked` 내부·`WorkforceTeamsService`(enabled 응답)·`SettingsService` 재연동 판정·`certQuery`. 테스트: 각 파일 단위 테스트에 "스위치 켬·미연결" 케이스 1개씩, `idleSqlBudget` 무변경 확인.

### B.4 B 계약 변경 요약

| resolver | 변경 | 소비 |
|---|---|---|
| `getApprovalSettings` | `+ linkActive:boolean\|null` | `operatingModeOf` |
| `getWorklogControlStatus`(또는 설정 정책 응답) | 다른 경로 범위의 유효 기본값(단독 ALL) | WorklogControlSettings |
| 그 외 | 응답 shape 무변경 — 판정 기준만 바뀌어 단독/미연결에서 값이 "연동 아님"으로 나온다 | — |

i18n(`policy.json`·`workforce.json`): `operatingMode.LINKED_PENDING`(연동 선택됨 · 연결 필요 / Link selected · not connected), `operatingMode.pendingNotice`, `team.workforcePrecedence`(결재선은 워크포스 우선 / Workforce takes precedence for approvers), `worklogControl.dateWindow.standaloneNoEffect`, `worklogApprovalFlow.settings.linkedLeadPrecedence`.

---

## C. 디자인·타이포 정비

### C.1 조사 요약 (static/ui/src, 테스트 제외 약 260파일)

| 지표 | 값 | 판단 |
|---|---|---|
| 하드코딩 `fontSize` | 41 (12px 24건) — CertificateSheet 12, appShell.css 9, LinkedKpiCards 5, InboxTable 5 | 적다. 대부분 "보조 정보 span" 복붙(약 11곳) |
| `style={{` 인라인 | 167 (CertificateSheet 26, ApprovalDetail 8, WorklogPolicyPanel 7, TimesheetPolicySettings 7, ModalLayout 6) | 중간 |
| `<Text>` 중 `size="small"` | 349/551 (**63%**), small+subtle/subtlest 같은 줄 **225** | **주원인** — 화면이 작고 흐리다 |
| Heading | 24건, `as=` 0, medium 14·large 4·small 4 | 레벨 규칙 없음 |
| 제목 이중 | AppShell `h1.app-title`(20px 하드코딩) 아래 NotificationPanel `Heading large`(24px) 등 | 크기 역전 |
| 모달 제목 체계 | ModalTitle + 본문 Heading medium + `SectionLabel`(12px 대문자, 13파일 21건) 공존 | 셋 중 하나로 |
| `token('font.*')` | 4건 | 사실상 미도입 |
| 표 | `TableSurface` 하나로 일원화(CommonTable 14·CursorPagingTable 16) — 좋음. `table.css` 셀 padding `6px 8px`/th `8px 12px` 하드코딩·좌우 불일치 | 공용 CSS 한 곳만 고치면 된다 |
| 간격 | Stack/Inline `space=` 582건 중 025/050/075 216건 | 빽빽함 |

### C.2 타이포 규칙 (단일 원천)

| 역할 | 사용 | 토큰/스케일 | 규칙 |
|---|---|---|---|
| 페이지 제목 | `AppShell` 의 `h1.app-title` **하나** | `font: token('font.heading.medium')`(20px/600 상당 — 현재 크기 유지, 토큰화) | 페이지 안에서 `Heading large/xlarge` 금지. 패널이 자기 이름을 말하고 싶으면 AppShell `heading` prop 으로 |
| 섹션 제목 | `SettingsSection`(설정) / `PageSection`(신규, 업무함·기록·이슈 패널) | `Heading size="small" as="h2"` | 섹션 하나에 제목 하나 |
| 하위 제목 | `SettingsSection level="sub"` / `PageSection level="sub"` | `Heading size="xsmall" as="h3"` | 2단까지만 |
| 모달 | `ModalTitle` + 본문 구획은 `SectionLabel` | SectionLabel → `font: token('font.body.small')` + `font.weight.semibold` + `color.text.subtle`, **대문자 변환 제거**(한국어에 의미 없음) | 모달 본문에 `Heading medium` 금지 |
| 본문 | `Text`(기본 medium) | `font.body` (14px) | 설명·값·폼 안내는 기본 크기. **small 금지** |
| 보조문 | `MetaText`(신규 `components/typography/MetaText.jsx`) | `Text size="small" color="color.text.subtle"` | 한 블록에 1줄, 이슈키·날짜·소요·"마지막 갱신" 같은 메타데이터만. 문장형 안내는 본문 |
| 가장 흐린 글씨 | `color.text.subtlest` | — | 빈 상태 문구·자리표시자만 |
| 숫자 강조(KPI) | `Heading size="medium"` 또는 `font.heading.medium` | — | `fontSize:22` 같은 px 금지 |
| 상태 | `Lozenge` / `ApprovalKindBadge` | — | 색 글씨로 상태 표시 금지 |
| 표 셀 | `table.css` | td `var(--ds-space-075) var(--ds-space-150)`, th `var(--ds-space-100) var(--ds-space-150)` (좌우 통일 12px), 본문 `font.body`, 셀 안 보조줄은 `MetaText` | 셀에 `span style fontSize` 금지 |
| 간격 | Stack/Inline `space` | 섹션 사이 `space.300`, 섹션 안 블록 `space.200`, 줄 묶음 `space.100`, 라벨-값 `space.050` | `space.025` 는 아이콘-글자 사이만 |

강제 장치(테스트): `static/ui/src/__test__/typographyRules.contract.test.js` (신규) — 소스 grep 으로
1) `fontSize` 리터럴 허용 목록(CertificateSheet·appShell 토글 아이콘 등) 밖 0, 2) `Heading size="large|xlarge|xxlarge"` 0(LicenseGuidePage 예외), 3) `size="small"` 과 `subtlest` 가 같은 줄 0(빈 상태 컴포넌트 예외), 4) `Text size="small"` 개수 상한(현재 349 → 목표 ≤ 150, 단계적으로 내림)을 고정한다. 리포 관례(계약 테스트로 구조 고정)를 따른다.

### C.3 공용 컴포넌트 변경

| 파일 | 변경 |
|---|---|
| `app/appShell.css` | `.app-title` → `font: var(--ds-font-heading-medium)`, 내비 14/13px → `var(--ds-font-body)`/`var(--ds-font-body-small)`, 그룹 라벨 11px → `font-body-small`+semibold, px 여백 29건 → `var(--ds-space-*)` |
| `app/AppShell.jsx` | `heading` prop 이미 있음 — 업무함 하위 화면(알림·위임·서명)이 자기 이름을 넘기게 InboxPage 수정 |
| `components/table/table.css` | 셀 padding 토큰화·좌우 통일, 푸터 카운트 `font-body-small` |
| `components/settings/SettingsSection.jsx` | `as="h2"/"h3"` 추가, 설명 `Text size="small" subtle` → **본문 크기 subtle**(설명은 문장이므로) |
| `components/settings/SettingsPageIntro.jsx` | summary 색 인라인 → 유지(토큰), 변경 없음 |
| `components/settings/SettingsRows.jsx` + `settingsRows.css` | 라벨 `Text` subtle 유지, 모바일 4px → `space.050` |
| `components/typography/MetaText.jsx` (신규) | `({children, testId}) => <Text size="small" color="color.text.subtle">` — 보조 span 11곳 대체 |
| `components/layout/PageSection.jsx` (신규) | SettingsSection 과 같은 제목 규칙, 카드 테두리 없음(업무함·이슈 패널용) |
| `features/approval/ModalLayout.jsx` `SectionLabel` | 12px 대문자·letterSpacing → 토큰(C.2) |

### C.4 적용 대상 파일 (우선순위)

| 순 | 파일 | 할 일 |
|---|---|---|
| 1 | `app/appShell.css`, `components/table/table.css`, `SettingsSection`, `ModalLayout`(SectionLabel), `MetaText`·`PageSection` 신규 | 공용 — 전 화면 리듬이 여기서 바뀐다 |
| 2 | `features/inbox/InboxTable.jsx`(:149,154,157,160,205), `transition/TransitionApprovalList.jsx:130`, `fieldChange/FieldChangeSection.jsx:130`, `timesheet/TimesheetSummary.jsx:40`, `TeamMatrixTable.jsx:87`, `WorklogSummaryTable.jsx:93`, `MyCertificationSummary.jsx:35`, `worklogApproval/WorklogTargetFacts.jsx:7` | `span fontSize:12` → `MetaText` |
| 3 | `features/inbox/InboxPage.jsx:500-545`, `NotificationPanel.jsx:181`, `DelegationPanel.jsx:116`, `SignaturePanel.jsx:256` | 이중 제목 제거 → AppShell `heading`, 패널 Heading 삭제 |
| 4 | 모달군 `ApprovalDetail.jsx`(:211 칩, :371), `WorklogDetailModal.jsx:192`, `WorklogDialog.jsx:157`, `DecisionForm.jsx:52`, `RequestForm.jsx:336`, `entries/modal.jsx:401` | 본문 Heading medium → SectionLabel, 인라인 px → 토큰 |
| 5 | 이슈 `features/worklog/WorklogTab.jsx`(:197,206,242), `WorklogTab.css`(480px 카드 padding `14px 12px`) | 설명 small → 본문, 메타만 MetaText, CSS 토큰화. **iframe 높이 회귀 주의**(U1) |
| 6 | 설정 `WorklogPolicyPanel.jsx`(small 16·인라인 7·자체 Heading) → SettingsSection, `WorklogControlSettings.jsx`·`GateDiagnostics.jsx`(small 15/12), `WorkforceLinkSettings.jsx`(11), `RecordRetentionSection.jsx`(10, :186 Heading xsmall 직접), `TimesheetPolicySettings.jsx`(인라인 7), `TeamFormModal.jsx`, `IssueExceptionList.jsx`(:247), `ApprovalSetupSettings.jsx`·`IssueApprovalSettings.jsx`(섹션 카드 없음) | 안내 문장 small → 본문, 섹션은 SettingsSection |
| 7 | 기록 `worklogHistory/WorklogHistoryList.jsx`(small 16/subtle 15), `audit/CertificationAuditTab.jsx`(15/14), `ApprovalAuditTab.jsx`, `WorklogHistoryAuditSettings.jsx` | 표 셀 보조줄만 MetaText, 나머지 본문 |
| 8 | 독립 페이지 `entries/projectSettings.jsx:43`(Heading large → PageSection 규칙: 이 엔트리는 AppShell 이 없으니 `Heading medium as="h1"` 하나 허용), `WorklogHandoffPage`·`WorklogCreateHandoffPage`(large → medium h1), `MyTimesheetPage.jsx:114` | AppShell 없는 엔트리의 페이지 제목 = `Heading medium as="h1"` |
| 9 | `transition/TransitionRuleSettings.jsx:120`(A 와 함께), `fieldChange/FieldChangeRuleSettings.jsx`·`worklogApproval/WorklogApprovalConfig.jsx`(미사용 — 손대지 않음) | A 에서 되살리는 것만 |
| 제외 | `certificate/CertificateSheet.jsx`(D12 인쇄), `license/LicenseGuidePage.jsx` | 예외 목록 |

### C.5 테스트 계획

- 기존 UI 테스트 전부 통과(testId·동작·쿼리키 무변경 원칙). Heading 텍스트로 찾는 테스트가 있으면 role 쿼리로 바꾸지 말고 testId 유지.
- `typographyRules.contract.test.js` 신규(C.2).
- `npm run build:ui` 번들 예산 확인(새 컴포넌트는 primitives 만 — 증가 미미).
- 수동: 이슈 화면 320px·issuePanel 하단 잘림(U1), 다크 모드 한 번.

---

## 10. 미검증

상세·확인 방법은 `04_spike_todo.md`.

| # | 항목 | 영향 |
|---|---|---|
| T0 | issueAction 복구가 minor 인가 | 배포 묶음 |
| **T1** | validator payload 목적 상태 id | 강제 전체(없으면 조용히 fail-open) — **기능 켜기 전 관문** |
| T4·T5 | issueAction moduleKey·issueContext extension.type | 진입 분기 |
| T7~T9 | 자동 적용(offline impersonation·REST 재진입) | 승인 후 자동 전환 |
| T12·T13 | 보드 드래그·REST·자동화 경로, team-managed 부착 | 강제 범위 문구 |
| T15 | 끔 상태 이슈 화면 비용 | 상시 로드 비용 |
| U1~U3 | iframe 높이·모드 문구 누수·읽기 전용 | 화면 품질 |

## 11. 작업 분해

### backend 체크리스트
- [ ] A: `statusChangeApprovalEnabled` 키 3곳(기본값·KVS 맵·검증) + `isStatusChangeApprovalEnabled` + `featureFlags` 3키
- [ ] A: `Feature.STATUS_CHANGE_APPROVAL` 매핑, ApprovalService 분기·에러 코드
- [ ] A: Transition{Service,ValidatorService,Executor} 주입 교체, `getIssueTransitionApprovals` 조기 반환, `STATUS_CHANGE_APPROVAL_DISABLED`
- [ ] A: SettingsService 응답·저장·감사 스위치, TimesheetService `features.statusChangeApproval`
- [ ] A: featureGateScope 계약 테스트 갱신, manifest issueAction 복구(title)
- [ ] B: `linkActive` 응답, B.3 표 6곳 `isLinked` 통일(백필 최우선), 다른 경로 범위 단독 기본 ALL, `wa` 읽기 여부 확인 보고
- [ ] `npm test -- --runInBand`, `npm run check:bundle`, `forge lint`

### frontend 체크리스트
- [ ] C1: 공용(appShell.css·table.css·SettingsSection·SectionLabel·MetaText·PageSection) + `typographyRules.contract.test`
- [ ] B: `operatingModeModel` 3상태, `LinkedOnly`, B.2 표 화면별 수정, 죽은 Linked* 5개 삭제
- [ ] C2~C8: C.4 표 순서대로
- [ ] A: settingsNavigation issue 묶음·배지, IssueApprovalSettings(토글·현황·비상 해제), featureStateModel·approvalKindModel·inboxUrl, issue 엔트리 카드(`StatusChangeApprovalCard`), modal 진입 분기, projectSettings 규칙 섹션(SettingsSection 화)
- [ ] i18n kr/en + `npm run merge`
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui`

## 12. 순서 (충돌 최소화)

**권장: C 공용 규칙 → B → A.** 근거:
1. **C 공용 먼저**(appShell.css·table.css·SettingsSection·SectionLabel·MetaText·PageSection·계약 테스트): A·B 가 새로 쓰는 화면이 처음부터 규칙을 따르게 한다. 공용 파일은 다른 갈래와 겹치지 않는다. C 의 화면별 적용(C.4 2~8)은 A·B 와 같은 파일(IssueApprovalSettings·WorklogControlSettings 등)을 건드리므로 **해당 갈래와 같은 회차에** 묶는다.
2. **B 다음**: 백엔드 `isLinked` 통일은 서버 판정만 바꾸는 독립 변경이고(백필 차단은 실제 결함), 프론트 `operatingModeModel` 3상태는 A 의 프로젝트 설정 문구·설정 메뉴 배지가 쓴다.
3. **A 마지막**: 가장 크지만 엔진 무변경이라 위험은 낮다. 다만 **실측 관문 T1** 이 기능 켜기의 전제이므로 코드 완료 후 배포 회차가 따로 필요하다. 기본값 꺼짐(D2)이라 코드가 먼저 나가도 사용자 영향 없음.
4. **겹치는 파일 주의**: 지금 다른 에이전트가 `SettingsRepository.js`(정책 캐시 single-flight)·`TimesheetService.js`·`InboxService.js`·`WorklogService.js` 를 수정 중이다. A 의 백엔드(SettingsRepository 키 추가·TimesheetService features)와 B 의 `WorklogService` 주변은 **그 작업이 커밋된 뒤** 시작한다. 그 전에는 C 공용(프론트)만 진행 가능.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-10-20 | 초판 |
