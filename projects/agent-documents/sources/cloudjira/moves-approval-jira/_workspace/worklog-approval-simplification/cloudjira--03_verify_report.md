# 통합 검증 리포트 — 1차 코드 검토

검토일: 2026-10-13. 역할: integration-verifier. 두 저장소의 실제 소스와 변경 diff를 대조했다. 프로덕션 코드를 수정하지 않았으며 빌드·배포·커밋은 실행하지 않았다. 이 문서는 다른 담당자가 마지막 수정을 진행하는 시점의 결과이며 아래 미해결 항목은 최종 재확인이 필요하다.

## 요약

### 마지막 상태 보충

root의 최종 공유와 소스 재확인 기준으로 Workforce decoder의 정상 출처는 `APP/WORKFORCE/APP_CHANGED/WF_CHANGED`로 수정되었다. root는 관련 shared decoder/문서 계약 검증 52 tests 통과를 보고했다. 숨김 승인함도 `participantTargets` 배치로 수정되었고 root가 관련 테스트 통과를 보고했다. 아래 origin 발견 중 **Approval retryCandidates SQL 부분과 pending CAS 결과 처리**는 verifier 종료 시점에 backend 확인을 요청한 잔여 항목이다.

이번 작업에서는 새 archive/compact schema를 추가하지 않기로 했다. 따라서 **내보내기 후에도 승인 원장과 현재 인증 근거는 남으며 주요 승인분 용량을 회수할 수 없는 한계**를 제품 저장 가이드에 명시한다. 아래 공간 회수안은 구현 완료 내용이 아니라 후속 제안이다. `closeDays=0`은 자동 마감 OFF라는 제품 의미도 가이드에 명시하기로 했다.

- 직접 실행한 핵심 테스트: **8 suites / 113 tests 통과**.
- 승인 생성 resolver 등록, 직접 인증 우회 차단, 승인·마감 잠금, 정상 입력 증명, 일반 목록·숨김 보충의 권한 재검사, 상태 승인 실행 제외, 내보내기 확정 없는 자동 삭제 방지의 소스 경계를 확인했다.
- **아직 무조건 통과 판정할 수 없다.** 정상 출처 enum 불일치, 요청 생성 후 관찰행 CAS 결과 무시, 고급 설정에 남은 사전 승인 선택은 담당자에게 수정을 요청했다.
- 저장량 경고는 구현되어 있으나 승인 원장 전체를 영구 보호하는 현재 정책으로는 내보내기 후 주요 승인 데이터 공간을 회수할 수 없다. 이 보존·용량 충돌은 별도 보완 또는 명확한 제한 고지가 필요하다.

## 발견 및 후속 조치

| 우선순위 | 실제 위치 / 현상 | 영향 / 조치 | 상태 |
|---|---|---|---|
| 높음 | `WorklogCertificationRepository.retryCandidates`와 Workforce `integration/approval/worklogApproval.js:21`의 허용 origin은 `APP/WORKFORCE/PREAPPROVAL`; 실제 `domain/worklogControl/origin.js`의 `PROVEN_ORIGINS`는 `APP/WORKFORCE/APP_CHANGED/WF_CHANGED` | 생성 이벤트 이전에 값이 변경된 정상 입력은 요청 보정·통계에서 제외될 수 있다. 동일한 정상 출처 집합으로 맞추고 changed-origin 회귀 검증 필요 | backend 전달 |
| 높음 | `WorklogRequestService.submit`의 `repo.pending(...)` 반환 false를 무시(검토 시 159행) | 요청 생성 후 관찰행 rev가 달라지면 `latest_request_id`가 연결되지 않을 수 있다. 이후 `decide`의 latest-request 조건도 실패하고 화면 상태가 승인 원장과 어긋난다. 같은 fingerprint/owner의 최신 행으로 CAS 재시도하고 실패 상태를 명시적으로 처리해야 한다. 기존 동결 `WorklogCertificationService.create`에 재시도 선례가 있다 | backend 전달 |
| 중간 | `entries/projectSettings.jsx:49` → `IssueExceptionList` → `WorklogPolicyPanel` 및 `policyFields.approvalMode` | 단순 사후 승인으로 바꾼 화면에 사전 승인·결재선 옵션이 남는다. 고급 이슈 예외 진입에서도 해당 기능을 제외해야 한다 | frontend 전달 |
| 중간 | `RetentionRepository.purgeExpiredBatch`의 APPROVED WORKLOG_CERTIFICATION 전체 제외, `CertRetentionRepository`의 approvalModel=1 전체 제외 | 잠금·집계 보호는 맞지만 대부분 정상 승인 자료가 공간 회수 대상에서 빠진다. 아래 최소 보존안 검토 필요 | root 전달 |
| 확인 필요 | Workforce `IssueWorklogControlService.createIssueWorklog:295`의 `verifyOwnIssueSetting` 결과 null 시 기본 ctl 정책 fallback | 미설정과 유효성 실패를 구분하는지, 잘못된 개별 서명 정책을 기본값으로 완화하지 않는지 확인 필요. 수동 기간 마감은 새 입력 시 계산식 `closeDays`만으로 알 수 없으므로 현재 지원 범위 확인 필요 | backend에 검토 요청 |

숨김 승인함 `filterVisible`의 건별 `findLatestForTarget` 호출은 검토 중 발견했으나 최신 소스에서 `participantTargets` 한 번의 배치 조회로 변경된 것을 확인했다. 해당 발견은 해결된 것으로 분류하며 최종 테스트는 root 결과와 결합한다.

## 계약 대조

| resolver / 데이터 | 생산자 | 소비자 | 확인 |
|---|---|---|---|
| `getWorklogCertification` | `WorklogCertificationController` → `WorklogRequestService.get`: certification, approval, canRequest, canAppeal, canChangeApprover, approvers, defaultApproverIds, locked, lockReason, history, historyPage | `WorklogApprovalPanel`: useInfiniteQuery, historyBeforeRevision, steps/approvers, 잠금·행동 가능 여부 | 필드명 및 history cursor 일치 |
| `requestWorklogApproval` | issueId/worklogId/approverId?/reason?; 서버 principal의 작성자 조건과 출처 증명 | 패널 신청 및 승인자 변경 mutation | 이름·payload 일치 |
| `appealWorklogApproval` | 같은 target, reason 필수, APPEAL purpose | 패널 소명 모드 및 사유 입력 | 이름·사유 필수 일치 |
| `listWorklogApprovalCandidates` | issueId/query, users/defaultApproverIds | 패널 후보 query와 기본 선택 | shape 일치 |
| 승인함 row.worklogApproval | `InboxService`가 최종 권한 필터 후 `forExport(ids)` 배치; started/seconds/purpose만 반환 | `InboxTable` 워크로그 정보 | 원문·사유를 부가 DTO로 노출하지 않음 |
| `getStorageUsage` | admin 권한, table estimated data/index bytes, management level/action | `StorageNotice`, `DataSettings` | 관리자만 조회; 하루 stale 캐시; SQL 알림 삽입·스케줄 추가 없음 |
| Workforce cert 문서 | `WorkforcePublisher`: 요청 상태+durable cert 기반 승인 actor/time/fp/seconds, 개별 마감값 | `approvalOfWorklog`, `ApprovalCertReader` 집계/배지 | source enum 관련 발견 외 기본 구조 일치; 게시 지연·서명 실제 환경 미검증 |

새 신청 resolver 세 개는 `guardedDefine`, `PermissionMap`, `CONTROLLER_REGISTRARS` 등록을 확인했다. get은 기존 등록을 유지했다. 클라이언트는 invokeApproval의 unwrap 이후 필드를 소비한다.

## 요구사항별 확인

| 요구 | 확인 내용 | 판정 |
|---|---|---|
| 정상 두 입력 창구와 중복 패널 정리 | Approval issue 엔트리는 입력·목록·상세 중심으로 축소. Workforce 앱 내부 정상 생성은 서버 signed origin 사용, 기존 직접 입력 위반 관찰과 정합을 변경 | 코드 확인, 실제 Jira 모듈 표시 미검증 |
| 이미 작성한 건별 사후 승인 | 기존 WORKLOG_CERTIFICATION target과 승인 엔진 재사용; 원본 worklogId 단위 snapshot과 요청원장 생성 | 확인 |
| 저장 직후 자동 접수 | Approval 저장 직후 및 WorklogControlDetector 이벤트 경로에서 요청. 트리거는 principal을 위장하지 않고 검증된 출처·조직 팀장·이슈 접근 boolean으로 좁힌 내부 생성 사용 | 확인; CAS/보정 origin 발견 별도 |
| 기본 팀장 / 수동 선택 | upperLeadsOf 기본, 본인 제외, 이슈 열람 가능한 활성 사용자와 기존 명부 제한; 팀장 없으면 수동 선택 상태 | 확인 |
| 일괄 결정 | 기존 bulk 승인 엔진과 per-item target beforeDecide 경계 재사용; pending만 선택하는 프론트 | 코드 확인 |
| 승인/마감 수정 잠금 | DB 승인·인증 및 기간 평가, mutation 서버 검증. 정상 출처 승인만 cert projection. 직접 certify resolver는 WORKLOG_APPROVAL_REQUIRED로 거부 | 확인 |
| 숨김 후 승인 | 이슈 열람+요청 참여자 판단 뒤 저장 snapshot 접근; 결정 시 origin 재증명 후 ControlGateway 내부 지문 대조. asApp 원문은 응답에 반환하지 않음 | 코드 확인, 실제 Jira visibility 미검증 |
| 소명/재승인 | reason 필수, APPEAL 접수·결정이 기존 cert 기준을 덮어쓰거나 잠금을 해제하지 않음. 연속 요청 history cursor 있음 | 확인 |
| 마감 후 승인분만 통계 | ApprovalPublisher 기준정보, Workforce 일반 목록을 asUser permissions/check+worklog/list로 재검사. 숨김 보충은 서버 principal 본인/leadingScopeAccountIds+이슈 열람+서명 visibility 조건 | 코드 확인; origin 오류/실환경 게시 반영 별도 |
| 승인자/시각/반려/변경 이력 | 승인 이벤트와 history 표시; hash 중심 snapshot, 워크로그 history 기존 정책 재사용 | 확인; 삭제 이슈 접근과 원문 한계 아래 |
| 상태 승인 기능 제외 | isIssueApprovalEnabled 상수 false, 설정 true 갱신 거절, 상위 UI 제거, validator는 허용 통과, 대기 자동 executor는 FEATURE_DISABLED 차단. 코드·workflow validator 보존 | 대상 tests 통과 |
| 간결한 정책 | 새 WorklogApprovalSettings 적용 | 부분: 고급 사전 승인 설정 잔존 |
| 저장 관리 알림 | 70/85/95% 단계와 파일 내보내기→파일 확인→허용된 범위 정리. 자동삭제 없음 | 알림 확인, 주요 승인 원장 공간 회수 제한 |

## 권한과 감사 보존의 중요한 제한

1. **삭제된 Jira 이슈를 볼 수 있다고 보장하지 않는다.** 앱 SQL은 이슈 삭제와 함께 자동 cascade 삭제하지 않지만 WorklogRequestService의 issueLoader 및 기존 이력 조회의 issue:view가 실패하면 조회가 차단된다. 남은 SQL을 보유했다는 사실과 사용자에게 복구·조회할 수 있다는 것은 다르다. 삭제 전 권한을 추정해 관리자에게 원문을 돌려주는 fallback은 추가하지 않았다.
2. **설명 원문 전체 복구가 아니다.** certificationSnapshot은 설명 hash만 저장한다. history keepComment 기본 OFF는 짧은 설명+hash이며 ON도 제한 길이 문자열이다. 완전한 Jira ADF/첨부·원문 전체 복구를 약속할 수 없다.
3. **접수/결정 시각이 통제 visibility 변경 및 Workforce 게시 완료 시각과 같지는 않다.** 이벤트 큐와 재조정이 이어진다. 실환경에서 승인→잠금→집계 반영 지연 및 실패 복구를 확인해야 한다.
4. 자동 승인 후보 검증 asApp 예외는 AGENTS.md에 사유가 추가되어 있고 boolean만 소비한다. ControlGateway 결정용 fallback도 원문 응답을 사용자에게 반환하지 않는다. 목록/카운트/다운로드·캐시 경계는 같은 조회자 범위를 유지해야 한다.

## 내보내기 후 공간 회수의 최소 보완 제안

현재 APPROVED 요청 전체 보존은 보안상 안전한 임시 경계지만 용량 해결책은 아니다. `01_audit_storage_review.md`의 연간 용량 추정은 건별 승인 원장을 포함한 계획 추정이며 Forge SQL 실측 수명이 아니다.

기존 schema를 늘리지 않는 최소 방향:

- `worklog_cert` 현재값과 해당 `worklog_cert_batch`의 approvalModel/원요청id/출처/지문/승인자/승인시각을 durable 요약으로 유지한다. control·certification 현재행도 유지한다.
- 내보내기 파일 확정 및 관리자 정리 범위 안에서만 종료 요청의 상세 snapshot·결재자·이벤트·알림을 정리한다. active 요청, projection 미완료 요청, 증명 불일치 요청은 제외한다.
- 첫 구현에서는 `current cert.batchId=requestId`, batch approvalModel=1, 원본 fingerprint 일치, certification verified 존재를 모두 확인한 요청만 허용하는 것이 보수적이다. APPEAL은 기존 batch를 유지하므로 이 단순 조건으로는 보호되어 남는다.
- 상세 원장을 지운 뒤에도 get/badge/publisher/잠금이 durable cert에서 승인 요약을 읽어야 한다. 승인함 참여자 조회·byRequest/projectApprovedWorklog의 request JOIN 의존을 고려하고, 과거 상세는 보관 파일에 있다는 상태를 명시해야 한다.
- 위 fallback·정리 조건·export snapshot fingerprint 재확인을 함께 구현하기 전에는 APPROVED 일괄 삭제 예외만 완화하면 안 된다. 현재본 certification은 상태 기준이며 단순 이력 취급으로 지우면 안 된다.

## 테스트 변경 감사

- 상태 승인 feature flag true였던 기대를 false로 바꾼 것은 사용자 요구에 해당하며 validator 통과와 executor 미실행까지 직접 대상 테스트로 검증했다.
- 정상 출처만 통제 대상으로 삼도록 기존 worker fixture를 APP으로 바꾸고 출처 미증명 케이스를 거부하는 변경은 요구와 부합한다. 단 변경된 기대만으로 APP_CHANGED/WF_CHANGED 경계가 검증되지는 않았다.
- 인증/승인 보관 정리 테스트의 모델 보호는 승인 근거를 잃지 않게 하는 실제 안전 조건이다. 다만 공간 회수 목표가 해결되었다는 검증은 아니다.
- 유휴 스케줄 추가는 없으며 빈 worklog-control pending 작업의 신규 보정 query 한 번 증가와 사용자 0명 기본 예산을 구분해야 한다. 최종 전체 idleSqlBudget 결과는 root에서 확인한다.

## 실행 결과와 미검증

직접 실행:

```text
npm test -- --runInBand src/resolver/worklogCertification src/resolver/retention/__test__/WorklogApprovalRetention.test.js src/resolver/settings/__test__/SettingsFeatureFlags.test.js src/resolver/transition/__test__/TransitionValidatorService.test.js src/resolver/transition/__test__/TransitionExecutor.test.js test/permission/permissionMap.contract.test.js
Test Suites: 8 passed, 8 total
Tests: 113 passed, 113 total
```

프론트 담당 보고: Approval 89 suites/801 tests 통과 후 helper 추가·변경 관련 4 suites/75 tests 통과, Workforce 4 suites/19 tests 통과. 이 수치는 해당 담당자가 실행한 결과이며 verifier가 재실행한 것으로 간주하지 않는다.

미검증 항목:

- 최종 backend 수정 후 전체 `npm test`, UI test, `check:bundle`, UI build, forge lint: 모든 에이전트 종료 뒤 root가 실행한다. 순환 import TDZ는 Jest 통과로 대체할 수 없다.
- Jira/Forge 실제 설치에서 issue panel 중복 제거, asUser/asApp visibility, 정책 게시·재게시, 이벤트 순서, 마감 후 숨김 승인 및 통계: development E2E 필요.
- 320/480px iframe 실렌더, 실제 키보드 focus, 로딩/오류/긴 이력 상태: browser QA 필요.
- 200명 SQL 실사용 bytes/index growth와 70/85/95% 경고: information_schema 값은 추정 통계이며 샘플 데이터 부하 실측 필요.
- 삭제 이슈의 권한 있는 보관 이력 전용 조회 및 원문 전체 복구는 구현·검증된 기능이 아니다.
