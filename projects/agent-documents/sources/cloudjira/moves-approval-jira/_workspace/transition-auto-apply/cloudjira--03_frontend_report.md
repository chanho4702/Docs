# 프론트 구현 보고서

2026-10-06. 기존 sidebar/full-page/lazy 설정 및 WORKLOG_CREATE 구현을 유지하면서 자동 전환 적용 결과와 워크로그 사후 인증을 연결했다. build/Forge lint/deploy/commit은 하지 않았다.

## 실제 소비 계약

- `retryTransitionApply`/`reconcileTransitionApply`: `{requestId}`만 보내고 flat apply 응답을 읽는다. cursor를 보내지 않는다. AUTO와 서버 `canRetry`/`canReconcile`로 버튼을 정하며 UNKNOWN에는 canRetry가 잘못 남아 있어도 재시도를 숨긴다. 대조 후 manualReviewRequired는 수동 확인을 안내한다.
- issue 목록은 `latest.apply`와 `history[].apply`, 상세는 `target.transition.apply`, 증명서는 최상위 `transition.apply`를 사용한다. LEGACY_MANUAL은 status보다 먼저 해석하고 수동 전환으로 표시한다. 승인 전 WAITING과 반려/만료/취소의 WAITING을 자동 실행 대기로 오해하지 않게 구분한다.
- `getWorklogCertification({issueId,worklogId})`: `{certification,canRequest,availableFlows}`. WorklogTab에서 선택한 기록에만 query를 생성하며 전체 행 N+1은 없다. 상세에서는 target의 issueId/worklogId와 immutable snapshot을 사용한다.
- `createWorklogCertification({issueId,worklogId,flowId})`: 서버 canRequest인 작성자에게만 제공한다. currentSnapshotMatched=false를 원본 변경 경고로 표시한다. 오류 코드 기반 메시지·재조회·결재선 빈 상태가 있다. 기존 WORKLOG_CREATE 사전승인과 타임시트에는 변경을 가하지 않았다.
- 인증 증명서는 최상위 `worklogCertification.snapshot`의 시간·지문과 `certification.state`의 현재 인증 상태를 구분한다. 설명·공개 범위 원문을 새로 복제하거나 표시하지 않는다.

## 구현과 UI 문구

`TransitionApplyPanel`, `transitionApplyModel`, `WorklogCertificationPanel`을 추가했다. 전환 issue 행/history/detail/inbox/notification/certificate/Excel export에 Jira 적용 상태를 승인 상태와 별도로 표시한다. 신규 namespace `transitionApply`/`worklogCertification`, inbox/cert 대상 종류 및 전환 승인 알림·요청폼 문구를 kr/en에 동기화했다.

주요 한국어 label: **Jira 적용 상태**, **자동 적용 재시도**, **Jira 적용 결과 대조**, **워크로그 사후 인증**, **사후 인증 결재선**, **기록 인증 요청**. 신규 전환은 승인 후 원 요청자 권한으로 자동 실행하며 승인≠적용, UNKNOWN 재POST 금지, 기존 LEGACY_MANUAL의 수동 실행을 고지한다. 인증은 원본 선등록·fingerprint 승인·변경/삭제 관찰 무효화·복원만으로 인증 복구 불가를 안내한다. WORKLOG_CREATE의 승인 후 본인 등록과 기간 타임시트는 별개로 설명한다.

APPLYING 조회는 기존 query factory `transitionKeys.issue`/`approvalKeys.detail`에서 5초 간격·최대 1분으로 제한한다. 실행 mutation 후 approval/transition/inbox/notification 키를 무효화한다. 인증은 신규 `worklogCertificationKeys`를 쓰고 요청·워크로그 변경·결정 후 관련 키를 무효화한다. 좁은 폭에서는 버튼이 줄바꿈되고 select는 폭을 제한하며 fingerprint가 줄바꿈된다. select에 label/htmlFor 연결이 있다.

## 승인된 최소 백엔드 보강

실제 InboxService/NotificationService의 adapter meta에는 최신 적용 ledger가 없었다. 부모 지시에 따라 `enrichTransitionApply`를 추가하고 **가시성 필터를 통과한 최종 items만** requestId 단위로 일괄 조회한다. `TransitionRepository.findApplyByRequestIds`는 readiness 검사와 LIVE/nondeleted/ISSUE_TRANSITION JOIN을 사용한다. 동일 대상의 서로 다른 요청에 다른 적용 결과가 정확히 매핑되며 빈 입력은 조회하지 않는다. 부속 행 실패 시 성공을 추정하지 않고 기존 목록을 유지한다. 새로운 mutation이나 권한 범위는 추가하지 않았다.

## 문서

ko/en 06/07/09/11/12/13 및 overview, MARKETPLACE-SUBMISSION을 갱신했다. 신규 AUTO와 기존 LEGACY_MANUAL을 구분하고 offline requester impersonation·승인≠적용·UNKNOWN 대조·사후 인증 당시 fingerprint·변경 무효화·선택적 고통제 WORKLOG_CREATE·native/REST/자동화 경계·실환경 미실측을 반영했다. 기존 FAQ/overview의 무조건 수동 재전환 문구를 교정했다.

## 검증

- `npm run merge`: PASS. kr/en 키 집합 일치.
- 관련 UI 최초 검증: **9 suites / 52 tests PASS**, exit 0 (`frontend-test.log`).
- 선택한 원본만 인증 조회 회귀·알림 문구·최종 모델 검증: **4 suites / 23 tests PASS**, exit 0 (`frontend-final-test.log`).
- batch enrichment + InboxService/NotificationService/TransitionRepositories: **4 suites / 43 tests PASS**, exit 0 (`frontend-enrichment-backend-test.log`).
- repository 빈 입력/LIVE/nondeleted/종류 JOIN 회귀 추가 후: **1 suite / 11 tests PASS**, exit 0 (`frontend-repository-test.log`).
- 증명서 적용/인증 추가 회귀: **1 suite / 8 tests PASS**, exit 0 (`frontend-certificate-test.log`).
- `git diff --check`: exit 0. 기존 작업 트리의 CRLF 변환 경고만 있다.
- 최초 npm 인수의 `|`가 Windows shell에서 명령 분리되어 테스트 시작이 실패했다. 패턴을 개별 인수로 수정한 위 실행이 모두 성공했다. PowerShell stderr의 NativeCommandError 표시는 Jest stderr wrapper이며 실제 process exit 0을 별도로 확인했다.

## 미검증과 한계

전체 backend/UI/build/lint는 부모/verifier가 수행한다. 개발 사이트 actor 보존·offline consent·REST validator 재진입·SQL v039–v041·schedule·team-managed·native/REST 입력은 live 미실측이다. 인증 issue-wide 목록/삭제 원본 전용 사용자 조회/과거 전량 backfill은 없으며 선택한 원본 조회만 수행한다. 전용 APPLIED 알림 이벤트는 추가하지 않았다. APPROVED 알림은 적용 완료라고 주장하지 않고 상세의 실제 적용 상태 확인을 안내한다. Vault INDEX는 읽었으며 외부 Vault 쓰기는 본 단계 권한 범위 밖이라 경험은 이 보고서에 기록한다.
