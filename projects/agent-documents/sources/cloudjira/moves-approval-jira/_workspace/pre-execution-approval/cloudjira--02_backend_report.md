# 워크로그 사전승인 백엔드 구현 보고

2026-10-06 · 최초 구현. `.claude/agents/backend-engineer.md`, `.claude/skills/forge-backend-dev/SKILL.md`, 최신 설계서를 기준으로 구현했다. 이전 사용자 변경과 root의 PrincipalResolver 변경을 보존했다. UI 소스는 수정하지 않았으며 `locales/{kr,en}/error.json`의 새 오류만 추가했다.

## 구현 결과

- 프로젝트 관리자의 required / allowedFlowIds(최대 20) / defaultFlowId 및 rev CAS 저장. 이슈의 실제 asUser projectId로 정책을 조회하고 이슈 편집자는 허용된 **워크로그 승인 Flow**만 선택한다. 기존 상태 전환 SQL rule의 Flow 자동 고정은 유지한다. 이 selector는 모든 승인 정책을 대체하지 않는다.
- 신규 `WORKLOG_CREATE` target 및 adapter를 기존 TargetRegistry/엔진에 등록했다. 엔진의 실제 인터페이스는 `createForTarget(request, { adapter,target,requestId,resolvedSteps,snapshot,expiresAt,cc,supersedes })`이며 flowId는 **request.payload.flowId**에서 읽는다. 클라이언트 steps/flowId/CC를 버리고 서버 고정 payload와 확장된 Flow steps만 전달한다.
- immutable draft·정책/Flow/확장 steps hash 및 rawStepsHash를 SQL entry에 저장한다. 동일 issue/requester/clientIntentId는 내용 hash가 같으면 같은 요청을 반환하고 다르면 충돌한다. 요청 생성은 Jira POST 0회다. 이후 판정은 저장된 원래 Flow가 현재 허용 options에 남고 raw steps 구조가 동일한지를 확인한다. 그룹 구성원을 재확장하거나 config/binding revision·현재 선택·Flow 이름/설명/기본 마감일 변경만으로 기존 요청을 막지 않는다.
- `WorklogService.createWorklog`의 gateway 직전에 엄격한 정책 gate를 연결했다. required면 approvalId/skipApproval을 보내도 거부하며 정책 schema/조회 실패도 STORAGE_NOT_READY로 차단한다. update/delete 및 타임시트 사후승인은 기존 경로다.
- apply는 요청자 본인, 실제 issue view/workOn, 엔진 LIVE APPROVED, 정책 snapshot, 기간잠금을 확인한다. owner+rev CAS 승자만 immutable draft로 asUser POST한다. POST 직전 정책/잠금을 재조회하되 관리자의 동시 정책 변경과 Jira POST 사이 완전한 transaction은 보장하지 않는다.
- Jira 확실한 400/403/404만 FAILED로 재시도 가능하다. timeout/network/5xx/SQL 저장 실패와 오래된 APPLYING은 UNKNOWN이며 자동 재POST하지 않는다. 최종 승인자의 afterDecide는 Jira POST를 하지 않는다.
- 재검토 보정: CAS 후 정책/잠금 검사에서 실패했지만 Jira POST를 시작하지 않았다면 owner+rev CAS로 WAITING을 복구하고 claimAt/실행 시도 횟수를 원복한 뒤 원래 오류를 반환한다. 관리자가 바로 기간을 잠그거나 정책 조회가 잠시 실패했다는 이유로 수동 UNKNOWN 복구를 강제하지 않는다. 실제 POST를 시작한 뒤의 모호한 실패만 UNKNOWN이다. rollback SQL도 실패하면 claim을 안전하게 남기므로 저장소 복구 후 지원 확인이 필요할 수 있다.
- WORKLOG_CREATE의 beforeDecide 읽기 실패만 승인 기록 전 거부하도록 engine을 좁혀 변경했다. 정상 정책 mismatch는 CONTENT_CHANGED 만료다. 기존 대상들의 읽기 실패 처리와 위임 엔진을 유지한다.
- 업무함/알림/상세/증명서는 registry를 통해 새 target을 해석한다. 업무함 metadata는 started/seconds/applyStatus이며 comment를 포함하지 않는다. 목록은 issue owner 조건과 최근순 keyset, approval_request JOIN 상태로 조회해 건별 fullstate SQL을 제거했다.
- retention export에 SQL entry 원본을 추가하고 clear 때 entry를 함께 삭제한다. UNKNOWN/APPLYING과 승인 후 WAITING/FAILED는 삭제 후보에서 제외한다. 신규 entry 테이블 미준비 시 보관 조회/삭제도 안전하게 멈춘다.

## 실제 resolver 계약

모두 기존 `{ success:true, content:... }` 래핑이다. 아래는 invokeApproval이 반환하는 content다. `guardedDefine` + PermissionMap + CONTROLLER_REGISTRARS 등록을 완료했다.

| resolver | 입력 | content |
|---|---|---|
| getWorklogApprovalConfig | projectId | `{config,availableFlows:[{id,label}],projectEnabled:boolean}` |
| saveWorklogApprovalConfig | projectId,rev,required,allowedFlowIds,defaultFlowId | `{config}` |
| getIssueWorklogApprovalPolicy | issueId | `{policy}` |
| selectIssueWorklogApprovalFlow | issueId,flowId,rev(현재 bindingRev) | `{policy}` |
| createWorklogApproval | issueId,clientIntentId(UUID),started(epoch ms),timeSpentSeconds,comment(평문) | `{entry}` |
| listMyWorklogApprovals | issueId,cursor?(직전 entryId UUID),limit?(1~50) | `{entries,nextCursor,hasMore}` |
| getWorklogApprovalEntry | requestId | `{entry,canApply}` |
| applyApprovedWorklog | requestId | `{entry,worklog?}` |
| reconcileApprovedWorklog | requestId,cursor?(숫자 Jira offset) | `{entry,reconciliation:{complete,scanned,nextCursor?,manualReviewRequired?}}` |

`config = {projectId,required,allowedFlowIds,defaultFlowId,rev}`. `availableFlows/options`의 식별자는 **id**이며 Flow 설정 자체의 flowId와 혼동하지 않는다.

projectEnabled는 전역 적용 프로젝트 설정의 조회 결과다. 조회 실패/비 boolean은 config 응답 성공으로 숨기지 않는다. disabled 상태에서 required 설정 저장 자체를 거부하지 않으며 UI의 경고 근거로 제공한다. 이 경우 요청 생성·결정·적용은 기존 유효 정책 판정에서 차단한다. required=false라도 selector의 options/binding 화면을 구성해야 하므로 policy.read의 binding/Flow 조회를 생략하지 않았다. 직접 create gate는 기존대로 엄격한 config read만 사용한다.

`policy = {required,selectedFlowId,bindingRev,configRev,options:[{id,label}],canSelect,reasonCode}`. getWorklogEditorContext는 기존 응답에 `approvalPolicy`를 추가하며 수정 모드에서는 null이다. policy read가 실패하면 생성 모드 editor context도 오류를 반환한다.

`entry = {entryId,requestId,issueId,requester,approvalStatus,createState,applyStatus,snapshot,flowLabel,worklogId,applyCode,createdAt}`. 상세/create/apply snapshot은 `{issueId,requester,started,timeSpentSeconds,comment}`, 목록 snapshot은 `{started,timeSpentSeconds}`다. approvalStatus는 엔진 상태, applyStatus는 별도 실행 ledger다. canApply는 표시 힌트이며 apply가 권한/잠금을 다시 검증한다. 성공 apply의 optional worklog는 **Jira 원시 POST 응답**이다.

applyStatus: WAITING/APPLYING/APPLIED/FAILED/UNKNOWN/BLOCKED. createState: WAITING/CREATING/LIVE/FAILED. LIVE 이전은 approvalStatus=null일 수 있다. 기존 SELF resolver의 앱 명부 제한은 유지하므로 명부 제한 정책을 쓰는 사이트에서 생성 접근 면제 사용자도 apply/detail에는 기존 SELF 가드를 통과해야 한다.

새 오류: WORKLOG_APPROVAL_REQUIRED, WORKLOG_APPROVAL_NOT_REQUIRED, WORKLOG_POLICY_INVALID, WORKLOG_POLICY_NOT_ALLOWED, WORKLOG_POLICY_CONFLICT, WORKLOG_POLICY_CHANGED, WORKLOG_INTENT_CONFLICT, WORKLOG_CREATION_PENDING, WORKLOG_APPLY_UNKNOWN. 기존 STORAGE_NOT_READY/WORKLOG_NOT_OWNER/WORKLOG_PERIOD_LOCKED/WORKLOG_PERMISSION_DENIED도 사용한다. kr/en 오류 번역을 함께 추가했다.

## 설계와의 차이 및 운영 한계

1. **UNKNOWN 대조는 수동 확인까지만 지원한다.** 호출당 최대 5페이지/100건/15초 GET하며 후보 발견 또는 전체 조회 완료 시 manualReviewRequired=true다. 후보가 하나라도 자동 APPLIED를 기록하지 않고 UNKNOWN을 유지한다. complete=true/후보 0건도 미실행 증거가 아니다. marker는 최초 POST에 함께 넣고 GET expand=properties로 대조하되 권한/승인 근거로 쓰지 않는다. 별도 properties PUT 또는 추가 POST는 없다.
2. engine 생성 중 SQL 장애로 DRAFT만 남으면 동일 intent를 다시 create하지 않는다. CREATING/FAILED는 WORKLOG_CREATION_PENDING으로 지원 확인을 요구한다. 재호출에서 같은 requestId의 LIVE가 확인되면 ledger를 finalize한다. 기존 엔진은 DRAFT 생성 재진입을 안전하게 보장하는 API가 없어 완전 자동 DRAFT 수습을 추가하지 않았다.

   독립 리뷰의 FAILED/stale CREATING 자동 재생성 제안은 적용하지 않았다. 실제 `ApprovalRepository.load`는 `commit_state='LIVE'`만 조회하므로 load=null은 요청 row 부재를 의미하지 않는다. `createRequestLive`는 DRAFT INSERT → insertApprovers → appendEvent → insertInitialInbox → LIVE UPDATE를 개별 SQL로 실행하며 transaction/실패 cleanup이 없다. 부분 child rows나 DRAFT가 남은 상태에서 동일 requestId 재INSERT하면 ALREADY_OPEN/부분 구성 충돌이 발생한다. TTL이 지났다는 사실만으로 부분 쓰기의 안전한 제거·재생성을 보장할 수 없으므로 원래 intent/승인 근거를 보존하고 지원 확인을 유지했다.
3. Jira 직접 REST·다른 앱·기본 화면의 외부 쓰기를 막지 않는다. 분산 transaction/exactly-once·property 원자 기록을 실측 완료로 주장하지 않는다. SQL 정책/Flow 변경이 기존 entry의 body를 덮어쓰는 경로는 없다.
4. 정책의 활성화/해제·프로젝트/Flow 변경을 실행 직전 확인하지만 Jira 이슈 프로젝트와 권한 조회는 기존 invocation cache를 공유한다. 시점 경쟁이 전혀 없다고 안내하지 않는다.

## SQL

실제 기존 마지막 번호 v035를 확인한 뒤 v036_create_worklog_approval_policy / v037_create_worklog_approval_binding / v038_create_worklog_approval_entry를 추가했다. 기존 migration 이름/테이블은 변경하지 않았다. approval_request.target_kind는 VARCHAR(24)이므로 ALTER가 필요 없다. entry UUID는 VARCHAR(36)이고 엔진 request_id는 BINARY(16)이므로 JOIN은 UUID_TO_BIN, retention 삭제는 entry에 문자열 UUID를 사용한다.

신규 참조는 isTableReady를 먼저 확인한다. policy/binding 저장과 ledger claim/finalize는 rev=rev+1을 포함한다. ledger UPDATE는 requester_account 조건까지 전달한다. 빈 display IDs는 SQL IN을 실행하지 않는다.

## 검증

백엔드 전체 최종 결과: **91 suites / 1298 tests 모두 통과**, 종료 코드 0, 35.338초. 로그: `backend-test.log` (PowerShell UTF-16). `npm.cmd test -- --runInBand`로 실행했다.

추가 preflight 보정 후 관련 테스트: **2 suites / 26 tests 모두 통과**, 종료 코드 0, 27.53초. 새 2건은 CAS 직후 기간 잠금/정책 조회 실패에서 POST0, WAITING 복구, 원래 오류 유지, 후속 정상 재검사·등록을 확인한다. 기존 실제 POST timeout→UNKNOWN→재POST0 회귀도 함께 통과했다. 로그: `backend-preflight-test.log`. 이후 전체 검증은 verifier 단계에서 진행한다.

핵심 회귀: 미승인 POST0, 남의 요청/admin 적용 차단, 승인본 body 변조 불가, 동시 적용 CAS POST1, timeout/UNKNOWN/stale APPLYING 재POST0, 정책 변경 BLOCKED, 동일 intent 재사용/내용 충돌, JOIN 목록 건별 load0/comment 없음, 직접 approvalId/skipApproval 우회 차단, 정책 미준비 fail-closed, SQL requester+rev CAS, beforeDecide 정책 읽기 실패 승인 기록0, marker 최초 POST 및 GET paging.

실측 미검증: Jira 실제 author 보존, atomic property 지원/GET expansion, timeout 뒤 SQL 및 네트워크 장애 복구, 실제 Forge SQL 마이그레이션/인덱스와 moved-issue binding 경쟁, UI에서 새 target 상세/증명서/내보내기 표시. 빌드·Forge·배포·커밋은 실행하지 않았다.

## 독립 리뷰 후 remediation

samePolicy는 required/projectEnabled, 현재 실제 프로젝트, 원래 flowId의 허용 범위, rawStepsHash를 비교한다. policy.read의 내부 projectEnabled와 신규 입력용 valid를 분리했다. 다른 편집자의 현재 선택이 무효여서 selected flow=null/valid=false여도 원래 saved Flow가 허용 범위에 남고 구조가 같으면 기존 승인은 적용할 수 있다. 원래 principals·requiredApprovals·stepName 구조 변경, Flow 삭제/허용 해제, required 해제/프로젝트 사용 중지는 막는다. 저장된 expanded steps는 원래 승인자를 유지한다. 같은 Flow의 이름·설명·기본 마감일, 무관한 config/binding revision 또는 다른 편집자의 현재 선택은 무시한다. 아직 미배포 요청 snapshot에 rawStepsHash를 추가했으며 별도 SQL migration은 없다.

관련 최종 검증: **2 suites / 45 tests 모두 통과**, 종료 코드 0, 7.456초. `backend-remediation-test.log`에 기록했다. samePolicy 허용/차단 matrix, 현재 선택 무효여도 원래 허용 Flow 적용, current에서 그룹 재확장0, beforeDecide 구조 판정, getConfig disabled boolean/조회 실패 거부 및 기존 결정 fail-closed·preflight·UNKNOWN 회귀를 포함한다. 전체 검증은 verifier에서 진행한다.
