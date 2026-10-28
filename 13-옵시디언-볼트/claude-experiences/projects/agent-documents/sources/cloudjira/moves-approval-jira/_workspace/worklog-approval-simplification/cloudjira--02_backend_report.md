# 백엔드 구현 보고 — 2026-10-13

현재 단계는 프론트 계약 확정이며, 아래 잔여 항목 때문에 전체 요구 완료 판정은 아직 불가하다. 빌드·배포·커밋·푸시는 실행하지 않았다.

## 프론트 확정 계약

- `requestWorklogApproval({issueId,worklogId,approverId?,reason?})`: 본인 정상 출처 기록을 사후 승인 요청한다. 기본 승인자는 본인의 팀장. 수동 선택은 기존 승인자 명부 정책을 재사용한다. 미결정 PENDING 요청의 승인자 변경은 기존 요청 supersede 후 신규 요청으로 남는다.
- `appealWorklogApproval({issueId,worklogId,approverId?,reason})`: 승인/마감 잠금된 본인 기록의 소명. 사유 필수, 최대 500자. 소명 중 기존 승인 잠금과 인증 지문을 유지한다.
- 두 mutation 결과: `{requestId,status,created,locked}`. 신규 접수 상태 `PENDING`. 승인자 부재의 자동 경로는 `NEEDS_APPROVER`, 정책상 수동 접수는 `UNSUBMITTED`, 마감은 `CLOSED`.
- `listWorklogApprovalCandidates({issueId,query?})`: `{users:[{accountId,displayName,avatarUrl}],defaultApproverIds,needsApprover}`. 본인 제외, 이슈 열람 가능한 후보만 반환한다. query로 기존 사용자 디렉터리를 검색한다.
- `getWorklogCertification({issueId,worklogId})`: `{certification,approval,canRequest,canAppeal,canChangeApprover,approvers,defaultApproverIds,locked,lockReason,historyPath,availableFlows:[]}`. `approval`은 기존 ApprovalContent에 `{status,appealPending,requestId}`를 추가한 형태다. 결정은 `approval.decisions`, 이벤트는 기존 ApprovalContent 계약을 따른다.
- `canChangeApprover`는 본인 PENDING이며 모든 결정이 PENDING일 때만 true. `canAppeal`은 본인 잠금 기록이고 진행 중 요청이 없을 때 true.
- `createWorklog` 기존 결과에 `approval` 추가. `approval.status`: `PENDING`, `NEEDS_APPROVER`, `UNSUBMITTED`, `CLOSED`, `SUBMISSION_FAILED`. 저장은 성공했으나 접수가 실패하면 `SUBMISSION_FAILED`, `reasonCode`, `retryable:true`를 반환한다. 자동 접수는 자동 승인과 다르다.
- `getIssueWorklogs` 행에는 `approval:{status,requestId,appealPending,locked}` 추가. 상태는 `UNSUBMITTED/PENDING/APPROVED/REJECTED/CANCELED/EXPIRED/DELETED/CHANGED`와 기존 엔진 상태를 사용한다.
- 기존 직접 인증 mutation `certifyWorklogs`, `certifyOwnWorklogs`는 `WORKLOG_APPROVAL_REQUIRED`로 거부한다. 기존 데이터 조회와 코드는 보존한다.
- 일반/상태 승인 기능은 runtime에서 제외하며 설정 조회 `issueApprovalEnabled:false`. true 신규 저장은 `ISSUE_APPROVAL_FEATURE_DISABLED`로 거부한다.

## Workforce 프론트 계약

- `IssueApprovalSettingService` 기존 이슈 설정 항목에 `wa:{v:1,autoRequest:boolean,lockApproved:true,closeDays:0..90}`를 전달/조회한다. `lockApproved`는 false 불가다. `capabilities.worklogApproval`로 지원 여부를 표시한다.
- 기존 Workforce 앱 내부 생성 resolver를 계속 사용한다. 연동 ON이고 서명·상대 wa 지원·통제 문서 유효 조건을 통과하면 DIRECT 생성 가능하다. 결과의 `approvalStatus:'PROCESSING'`은 비동기 승인 요청 접수 대기다. 수정은 기존 Approval handoff를 유지한다.
- 통계 입력 행에 `claimedSeconds`(기록 원래 시간), `timeSpentSeconds/countableSeconds`(정책 집계 시간), `approval:{status,normalOrigin,locked,lockReason,countableSeconds}`가 붙는다. 일반 집계에서는 타인 승인자/결정시각/requestId를 반환하지 않는다.
- 개별 본인 이력/승인 상세는 Approval 위 get API를 사용한다. Workforce가 Approval resolver를 직접 호출하는 새 bridge는 추가하지 않았다.

## 구현 구조

`WorklogRequestService`, `ApprovalCertificationProjection`을 추가하고 기존 WORKLOG_CERTIFICATION 엔진·결정 이력·일괄 승인·인증/통제 원장을 재사용한다. 신규 SQL 테이블/마이그레이션은 없다. 자동 요청의 요청자는 검증된 실제 author이고 REQUESTED 행위자는 null(시스템)이다. 사용자 principal 위장과 offline impersonation은 없다. 트리거 실패는 기존 worklog-control 큐 리컨실이 복구한다. 미완주 커서는 유지한다.

승인 잠금은 projection 지연에도 승인 원장을 직접 확인한다. 신규 snapshot `approvalModel:1`은 visibility만 지문에서 제외하고 기존 legacy 지문 계약은 유지한다. legacy 인증은 새 승인 통계로 승격하지 않는다. 진행월 미승인 정상 기록은 즉시 숨기지 않고 승인 또는 마감 시점에만 제한한다. 정상 origin 통제 행은 보관 정리에서 삭제하지 않아 출처가 사라지지 않게 했다.

서명 월 문서에 `approval:{v:1,closeAt,entries,truncated}`를 추가했다. entries tuple은 `[worklogId,status,requestId,decidedBy,decidedAt,origin,certFp,seconds,started]`다. body 30KB 제한은 approval entries에도 적용한다. 양 저장소 shared contract를 동일하게 변경했다.

## 실행한 대상 검증

- 리더 실행: `src/resolver/worklogCertification` 2 suites / 28 tests 통과(신규16, legacy12). 이후 DTO 주변 일부 변경 있어 최종 재실행 필요.
- Approval 게시/문서: `WorkforcePublisherCert`, `certificationDoc` 통과. 함께 실행한 `WorklogControlWorker`는 변경된 정상 출처/조건부 잠금 기대치 관련 7개 실패가 있었고 일부 실제 DI 회귀를 수정했다. 재실행 필요.
- Workforce 초기 회귀: 7 suites 중 4 통과, 총189 통과/12 실패. 실패는 생성 응답 추가 필드(현재 조건부로 수정), contract SHA vector 갱신 필요, ApprovalCertReader 설정 의존성 fixture 누락이다. 재실행 필요.
- SettingsFeatureFlags는 리더가 새 기능 제외 계약으로 테스트를 갱신한다.

## 아직 완료되지 않은 항목 — 후속 구현 필요

1. 숨김 승인분의 일반 Workforce 통계 보충: 원가에는 기존 안전한 hiddenCertifiedRowsOf 경로가 있으나 다른 통계에 TeamScope/프로젝트 인가를 연결하는 보충은 아직 없다. 현 asUser 입력에서 숨김 행이 빠지면 마감 승인 합계가 누락될 수 있다.
2. 서명 월 closeAt는 사이트 정책 기준이다. 이슈별 wa.closeDays와 수동 마감/reopen을 건별 통계 판정에 동일하게 반영해야 한다.
3. ProjectCalendarService 별도 수집 및 RelationGraphService Jira timetracking.total 우회 집계를 아직 공용 승인 집계로 연결하지 않았다. ResourceAnalysis 및 기타 집계 캐시도 승인 변경 후 갱신 계약 최종 검증 필요.
4. Workforce 설정 wa 필드의 수신 capability gate와 팀장 담당 프로젝트 범위 검증은 기존 정책 경로를 재사용하지만 새 필드 회귀 테스트가 필요하다.
5. getWorklogHistory에 승인 이벤트를 합친 새 DTO는 추가하지 않았다. getWorklogCertification의 기존 승인 상세/결정으로 프론트 표시 가능하나 전체 과거 요청 통합 이력 API 보완이 필요하다.
6. 신규 일반 집계 asApp 읽기 예외의 AGENTS/CLAUDE 문서 반영 및 대상 보안 테스트가 필요하다. 현재 구현은 asUser permissions/check + worklog/list로 현재 볼 수 있는 행을 다시 좁힌 뒤 교차 대조하며 cost와 캐시를 분리한다.
7. shared contract vector SHA 갱신, 대상 회귀 및 전체 필수 검증이 남았다. Worker↔Detector 순환 초기화는 늦은 require로 바꿨으며 check:bundle로 최종 확인해야 한다.

Jira 플랫폼 직접 REST 변경 차단/숨김 처리와 지연 시간은 배포 후 사이트 실측 대상이며, 위 구현 공백과 구별한다.

## 재시작 대비 체크포인트 (후속 상태)

- 루트 소유로 이동: WorkforcePublisher per-entry closeAt, PeriodCloseService 게시 깨우기, 양쪽 shared contract/vector, Workforce worklogApproval decoder, WorklogControlWorker 회귀 테스트. 이 파일들은 backend가 더 수정하지 않는다.
- 프론트 에이전트가 양쪽 UI 구현 중이다. 현재 변경은 어느 저장소도 커밋/빌드하지 않는다. 사용자는 완료·검증 단위 커밋을 허용했으며 root가 경로 지정으로 실행한다.
- 단독 `worklogAutoRequest:boolean(default true)` 설정/검증/정책/자동 접수 연결을 추가했다. 연동 wa.autoRequest가 우선한다.
- `getWorklogCertification`에 `approvalHistory`와 `approvalHistoryPage:{hasMore,nextBeforeRevision}` 추가. 다음 요청은 `historyBeforeRevision`로 20회씩 이전 이력을 조회한다. 숨김/삭제 이후 작성자·지정 승인자·현재 팀장은 저장 최소 snapshot으로 조회할 수 있다.
- `AutomaticApproverAccess` 신규: 무사용자 트리거에서 검증 조직 팀장 후보의 이슈 열람/활성 계정을 asApp으로 판정. 자기 승인 후보 제외. AGENTS에 사유 추가. 테스트 대기.
- `ApprovalCertificationProjection` 세 번째 INSERT 성공을 오탐 conflict로 처리하던 경로 수정.
- Approval RetentionRepository purge에서 APPROVED WORKLOG_CERTIFICATION 제외(일반 다운로드는 허용). CertRetentionRepository는 approvalModel1 batch를 실행 직전 재검증해 삭제하지 않는다. 대상 테스트 보완 중.
- Workforce 일반 집계는 permissions/check + worklog/list를 asUser로 재조회한 공개행에 승인 문서를 asApp 교차 적용한다. docs/결정자/결정시각/requestId 미반환, cost/aggregate/hidden-aggregate 캐시 분리.
- Workforce 숨김 승인분은 asUser /myself 또는 서버 viewer → resolvePrincipal → 본인+leadingScopeAccountIds로 제한하고, asUser permissions/check+bulkfetch 이슈 집합을 거친 뒤 기존 hiddenCertifiedRowsOf의 author/issue/visibility 검증을 재사용한다. 숫자 집계용 includeHidden에서만 활성. ResourceAnalysis 리스트/공용 집계/RelationGraph 연결, 상세는 제외. Calendar 공개행에도 정책 적용.
- 아직 수정 중: CollabWorklogFetcher 대시보드 경로 적용 누락, 숨김 통계와 보관/자동접수 신규 테스트, 불필요 캐시 코드 정리, 새 DTO 보고서 정합. 특히 viewer.cloudId 보충과 조회 범위 month loop은 workforce_review.py에서 수정했다.
- 적용한 외부 수정 스크립트는 `workforce_backend.py`, `workforce_backend_finish.py`, `workforce_hidden.py`, `workforce_review.py`. 재실행은 import/문서 중복 위험이 있으므로 하지 않는다. 외부 변경은 모두 require_escalated로 실행했다.
- 대상 테스트의 최신 재실행은 아직 안 했다. 기존 결과는 위 기록을 따른다. parent report 이후 결과를 갱신해야 한다.
