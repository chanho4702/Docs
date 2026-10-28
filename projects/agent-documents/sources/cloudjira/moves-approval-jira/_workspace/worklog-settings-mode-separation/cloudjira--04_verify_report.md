# 검증 보고서

## 판정

**PASS**

최신 diff에서 최초 차단 결함 두 건이 모두 보완됐다. 연동 모드 승인 범위와 자기 승인 권한 경계가 유지되고, 실제 webpack backend bundle require 및 두 설정 화면의 결재자 안내 테스트가 통과했다.

## 차단 결함 재검증

### 1. Forge backend 순환 import TDZ — 해소

- `WorklogCertificationTargetAdapter.beforeDecide()`가 자기 승인 재검증에 필요한 `WorklogPolicyResolver`와 `WorkforceOrgSource`를 모듈 초기화 시점에 잡지 않고 실제 결정 호출 시점에 `require()`한다.
- 사용자가 제공한 `Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization` 유형을 잡는 프로젝트 전용 검사를 직접 실행했다.

```text
npm run check:bundle
```

결과:

```text
[bundle-check] OK — exports: getWorklogApprovalApi, getWorklogHistoryApi, onInstall,
onIssueChanged, onPreUninstall, onWorklogChanged, runMigration, runSweep,
runSweepJob, validateTransition, CONTROLLER_REGISTRARS, handler
```

현재 워크트리의 backend bundle은 정상적으로 초기화된다. 따라서 `getWorklogApprovalIdentity`를 포함한 Approval resolver/API가 bundle load 단계에서 막히던 문제는 해소됐다. 실제 Jira 개발 환경에는 이 변경을 다시 배포해야 현재 설치본에 반영된다.

### 2. 결재 구성 화면의 Workforce 팀장 안내 — 해소

- `WorklogApprovalModeContext.jsx`를 공용 컴포넌트로 만들고 아래 두 화면이 같은 query와 표시 계약을 사용한다.
  - `WorklogApprovalSettings`
  - `ApprovalSetupSettings`
- `ApprovalSetupSettings`는 연동 모드에서 다음을 표시한다.
  - 현재 운영 모드와 승인 대상 범위
  - 서명 검증된 내 Workforce 팀과 팀장 이름·avatar
  - Workforce 팀장 본인의 자기 승인 가능 여부
- 단독 모드에서는 Workforce identity를 조회하지 않고 공용 명부·결재선의 적용 범위를 안내한다.
- `ApprovalSetupSettings.test.jsx`에 연동 모드와 단독 모드 양쪽 계약 테스트가 추가됐다.

## 요구사항별 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| 연동 모드 미연결 이슈 신규 승인 완전 차단 | PASS | `requestAutomatically()`는 `proof/observe/outbox/request` 전에 `NOT_APPLICABLE`로 반환한다. 수동 요청과 재승인 요청은 `WORKLOG_APPROVAL_SCOPE_EXCLUDED`로 닫고 조회·후보 응답도 신규 동작을 비활성화한다. |
| 일반 사용자 자기 승인 금지 | PASS | 자기 승인은 `LINKED + issueLinked + signature-verified Workforce team lead` 세 조건을 모두 요구한다. 단독 모드, 미연결 이슈, 검증 실패 조직은 거부된다. |
| Workforce 팀장 자기 승인 | PASS | 후보·수동 요청·자동 요청에서 조건부로 본인을 추가하고 기존 이슈 열람 검사를 그대로 적용한다. 자동 요청은 상위 팀장 뒤에 본인을 둔다. |
| 결정 직전 재검증 | PASS | 작성자와 결정자가 같고 본인이 결재선에 있을 때 현재 연동 모드·이슈 연결·서명 검증 팀장 자격을 다시 확인한다. 실패 시 승인 저장 전에 `APPROVER_NOT_ELIGIBLE`로 닫는다. |
| append-only 감사 이력 | PASS | 자기 승인도 기존 조건부 승인자 UPDATE, 요청 CAS, `APPROVED` 이벤트를 그대로 사용한다. `actor_key === requester_key`로 자기 승인을 식별할 수 있다. |
| `getWorklogApprovalIdentity` 권한·개인정보 | PASS | resolver는 `guardedDefine`, `PermissionMap: SELF`로 등록됐다. 대상 사용자는 payload가 아니라 `principal.accountId`로 고정되고, 권한 판정은 서명 검증 조직 원문만 사용한다. |
| 워크로그 승인 설정의 모드 분리 | PASS | 현재 활성 모드 하나만 표시하고 승인 대상·승인자 원천·정책 책임·모드별 정책 문구를 분리한다. |
| 결재 구성의 모드/팀장 안내 | PASS | 공용 `WorklogApprovalModeContext`가 `ApprovalSetupSettings` 상단에도 렌더링되며 연동/단독 UI 테스트가 통과했다. |
| webpack 순환 import 안전성 | PASS | 실제 `npm run check:bundle`이 webpack bundle을 생성하고 require하는 단계까지 성공했다. |

## 실행한 검증

### Backend bundle

- `npm run check:bundle`
- 결과: 성공, backend exports 정상 로드

### Backend targeted tests

```text
npx jest src/domain/worklogCertification/__test__/eligibility.test.js \
  src/resolver/worklogCertification/__test__/WorklogCertification.test.js \
  src/resolver/worklogCertification/__test__/WorklogRequestService.test.js \
  src/resolver/approval/__test__/ApprovalServiceTargetHooks.test.js \
  src/resolver/workforce/__test__/WorkforceLinkService.test.js \
  test/permission/permissionMap.contract.test.js --runInBand
```

- Test Suites: 6 passed, 6 total
- Tests: 102 passed, 102 total

### Frontend targeted tests

```text
npm run test:ui -- --runInBand \
  src/features/worklog/__test__/WorklogApprovalFlow.test.jsx \
  src/features/settings/__test__/FeatureSelectionSettings.test.jsx \
  src/features/settings/__test__/ApprovalSetupSettings.test.jsx \
  src/features/settings/__test__/linkedModeI18n.test.js \
  src/utils/__test__/localeIntegrity.test.js
```

- Test Suites: 5 passed, 5 total
- Tests: 20 passed, 20 total

### 정적 검사

- `git diff --check`: 통과
- 확인한 변경 범위에서 별도 결함을 발견하지 못했다.

## 운영 확인 사항

- 이 판정은 현재 워크트리의 코드와 bundle을 기준으로 한다.
- 사용자가 제공한 기존 Forge 로그는 수정 전 배포본의 오류다. 개발 Jira에서 API 호출 가능 여부를 최종 확인하려면 최신 bundle을 배포한 뒤 resolver 반환값과 `forge logs`를 다시 확인해야 한다.
