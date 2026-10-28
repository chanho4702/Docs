# 워크로그 건별 사전승인과 패널 정책 선택 구현 설계

2026-10-06. 확정 기본안: **건별 입력안 승인 → 요청자 본인 asUser 등록**, **Moves Approval 패널의 허용 Flow selector**. 기간 한도 허가·실제 Jira custom field·백그라운드 대행은 제외한다. 기존 전환 SQL rule과 validator 동작은 유지하며 Flow 자동 고정을 UI에서 설명한다.

## 1. 개요·제품 결정

프로젝트 관리자가 required, allowedFlowIds, defaultFlowId를 설정한다. 기존 프로젝트에서 사용 가능한 Flow를 그대로 재사용하며 별도 preset CRUD를 만들지 않는다. 허용된 Flow가 이번 MVP의 preset이다. 이슈 edit 사용자는 앱 패널에서 허용 Flow 중 하나를 선택한다. None·임의 Flow·다른 프로젝트 Flow로 강제를 풀 수 없으며 required 해제는 project admin만 한다.

워크로그 입력 후 “승인 요청”을 누르면 immutable draft와 engine 요청을 함께 만든다. 요청마다 결재선을 구성하는 화면은 없다. 승인 후 요청자만 “승인된 기록 등록”을 실행하고, 요청자 context의 asUser POST로 작성자를 보존한다. 최종 승인자의 invocation에서 워크로그를 등록하지 않는다. 승인됨/등록 대기/등록됨/실패/결과 불명은 별도로 표시한다.

정상 readiness에서 프로젝트 정책 row가 없거나 required=false면 기존 입력을 유지한다. required=true에서는 Flow 없음·비활성·설정 충돌을 fail-closed로 거부한다. schema 미준비나 정책 읽기 실패 시 **앱의 워크로그 생성 mutation만 STORAGE_NOT_READY로 거부**한다. Jira 사이트 전체·다른 앱·REST를 중단한다는 의미가 아니다. KVS latch와 기존 project_config ALTER는 추가하지 않는다.

워크로그 수정·삭제, 기존 타임시트 사후 승인, 전환 fail-open 경계는 이번 변경에서 바꾸지 않는다. 생성의 사전승인과 기간 사후승인을 구분하고, 외부 Jira 직접 쓰기를 차단한다고 약속하지 않는다. 정책 활성화와 이미 진행 중인 Jira POST 사이의 분산 transaction 경쟁은 실행 직전 재조회로 줄이되 완전 원자 차단으로 안내하지 않는다.

## 2. 경계면 계약

기존 `{success:true,content:{...}}`/실패 error.code를 따른다. 아래 success는 invokeApproval이 추출하는 content다. controller 등록은 guardedDefine + PermissionMap + CONTROLLER_REGISTRARS 세 곳을 맞춘다.

| resolver | PermissionMap | 입력 | success content | 주요 error.code | 소비 화면 |
|---|---|---|---|---|---|
| getWorklogApprovalConfig | project:admin(projectId) | projectId | config, availableFlows | STORAGE_NOT_READY | 프로젝트 설정 |
| saveWorklogApprovalConfig | project:admin(projectId) | projectId, rev, required, allowedFlowIds, defaultFlowId | config | WORKLOG_POLICY_CONFLICT, WORKLOG_POLICY_INVALID | 프로젝트 설정 |
| getIssueWorklogApprovalPolicy | issue:view(issueId), appAccess:false | issueId | policy:{required, selectedFlowId, bindingRev, configRev, options:[id,label], canSelect, reasonCode} | STORAGE_NOT_READY | 이슈 패널/editor |
| selectIssueWorklogApprovalFlow | issue:edit(issueId), appAccess:false | issueId, flowId, rev | policy | WORKLOG_POLICY_CONFLICT, WORKLOG_POLICY_NOT_ALLOWED | 패널 selector |
| createWorklogApproval | issue:view(issueId), appAccess:false | issueId, clientIntentId(UUID), started, timeSpentSeconds, comment | entry:{entryId,requestId,approvalStatus,applyStatus,snapshot,flowLabel} | WORKLOG_PERMISSION_DENIED, WORKLOG_PERIOD_LOCKED, WORKLOG_APPROVAL_NOT_REQUIRED, WORKLOG_POLICY_INVALID, WORKLOG_INTENT_CONFLICT | editor |
| listMyWorklogApprovals | issue:view(issueId), appAccess:false | issueId, cursor?, limit<=50 | entries,nextCursor,hasMore | STORAGE_NOT_READY | 등록 예정 목록 |
| getWorklogApprovalEntry | SELF | requestId | entry,canApply | PERMISSION_DENIED,INVALID_TARGET | 승인 상세 |
| applyApprovedWorklog | SELF | requestId | entry:{applyStatus,worklogId?,applyCode?},worklog? | WORKLOG_APPROVAL_REQUIRED,WORKLOG_NOT_OWNER,WORKLOG_APPLY_UNKNOWN,WORKLOG_PERIOD_LOCKED | 요청자 목록/상세 |
| reconcileApprovedWorklog | SELF | requestId,cursor? | entry,reconciliation:{complete,nextCursor?,scanned} | WORKLOG_NOT_OWNER,WORKLOG_APPLY_UNKNOWN | 결과 불명 대조 |
| createWorklog(기존) | 기존 계약 | 기존 입력 | 기존 worklog | WORKLOG_APPROVAL_REQUIRED 추가 | 기존 직접 생성 |

create의 view 가드 외에 Service가 현재 사용자 workOn을 확인한다. apply/reconcile은 `context.accountId`와 entry.requester 일치, SQL WHERE requester predicate, 실제 이슈 view/workOn을 모두 확인한다. 승인자·팀장·관리자라도 남의 작성자로 등록하지 못한다. SELF 상세 읽기는 기존 승인 상세 참여자 권한 + adapter.canView를 사용한다. listMy는 accountId를 서버에서 주입하고 issue_id와 requester 조건으로 제한한다. 출력 목록에는 comment를 싣지 않는다.

## 3. 도메인·scopeKey

새 `TargetKind.WORKLOG_CREATE`, target `{kind,issueId,entryId}`, target_key=`<issueId>:<entryId UUID>`, scopeKey=`WORKLOG_CREATE:<issueId>:<entryId>`. 기존 target key를 변경하지 않는다. requester는 SQL owner 컬럼으로 강제하며 긴 accountId를 key에 합치지 않는다.

- `canonicalWorklogDraft(input)`은 기존 validateWorklogInput으로 started/seconds/comment를 정규화하고 issueId/requester를 서버값으로 고정한다.
- `draftHash(draft,policySnapshot)`은 canonical JSON SHA-256. policySnapshot에는 configRev/bindingRev/flowId/flowRev/expandedStepsHash를 포함한다.
- `judgeWorklogApply(input,now)`는 승인·소유자·적용 상태·현재 정책·잠금·claim 시각으로 허용/거부/대조 필요를 반환한다. now는 주입한다.
- `matchCreatedWorklog(raw,entry)`는 marker, author, issue, started/seconds/comment hash의 상관성을 검사하며 properties를 승인 근거로 쓰지 않는다.

clientIntentId는 입력안별 한 번 발급한다. 같은 issue/requester/intent에 같은 사용자 입력 hash면 같은 entry/requestId를 반환한다. 내용이 다르면 WORKLOG_INTENT_CONFLICT. 재시도 때 정책이 바뀌었어도 이미 생성된 intent는 원래 immutable snapshot을 반환하고 변경된 정책을 이유로 새 요청을 자동 생성하지 않는다. 입력 수정은 새 UUID와 새 entry다. 기존 요청 취소/재신청은 기존 엔진 권한 경로를 사용하며 draft body/hash를 덮어쓰는 mutation을 만들지 않는다.

## 4. 백엔드와 UI 우회 차단

새 `resolver/worklogApproval/` Controller/Service/Repository, `domain/worklogApproval/` 순수 함수와 `WorklogCreateTargetAdapter`를 추가한다. 기존 SQL CommonQuery/SqlTime/TableReadiness, Flow 조회/확장, engine createForTarget를 재사용한다.

정책 reader는 asUser로 읽은 현재 issue.projectId에 묶어 config/binding을 조회한다. payload projectId를 신뢰하지 않는다. binding의 projectId가 현재 이슈와 다르면 새 프로젝트 default를 사용한다. SELECT·UPDATE에 project predicate를 넣고 issue binding 변경에는 issue_id predicate도 넣는다. required=true에서 선택 Flow가 allowlist에서 빠졌거나 Flow가 없으면 POLICY_INVALID로 차단하고 사용자 재선택을 요구한다. 유효한 binding이 없으면 default를 사용한다. global/license/project enable이 사전승인 engine을 사용할 수 없게 만들어도 required가 true이면 직접 등록으로 fallback하지 않는다.

요청 시 Flow는 현재 프로젝트 available Flow에서 검증하고 expandedSteps를 snapshot한다. 클라이언트 steps/approvers/flowId를 create 입력으로 받지 않는다. flow와 config/binding revision이 결정·적용 시 바뀌면 POLICY_CHANGED로 차단하고 새 신청을 안내한다. 대기 요청은 adapter.beforeDecide가 mismatch를 확인해 기존 closeBySystem(ExpiryReason.CONTENT_CHANGED, 전용 cause code)으로 만료한다. 승인 후에는 approval status를 반전시키지 않고 applyStatus=BLOCKED로 표시한다. Flow에 rev가 없으면 canonical Flow/steps hash를 revision 대신 비교한다.

생성 순서: 입력·권한·잠금·정책 확인 → entry/requestId 확정 INSERT → creator rev CAS claim → createForTarget(server fixed resolvedSteps/flowId/requestId/snapshot) → 생성 완료. create는 Jira POST 0회다. engine DRAFT→LIVE를 그대로 사용하고 LIVE만 결정/적용 대상이다. timeout 재호출은 같은 requestId의 LIVE 여부를 대조하여 entry를 finalize하고 open dedupe UNIQUE를 재사용한다. 동시 생성자는 rev claim으로 하나만 create를 시도한다. 실패 때 직접 쓰기로 fallback하지 않는다. 고아 entry/engine DRAFT는 기존 커밋 상태 복구 규칙에 맞춰 수습한다.

adapter는 Issue/FieldChange 패턴의 parse/targetOf/keyOf/describe/canView/canRequest/userCanView/filterVisible/columnsOf/snapshotOf/viewOf/fingerprint를 제공한다. filterVisible은 targetKey에서 issueId를 뽑아 permissions/check 일괄 호출 후 visible을 원래 key 집합으로 돌려준다. columnsOf에 issue/project/subject_account/title/content_hash를 채우고 meta에는 started/seconds/apply 상태를 넣는다. afterDecide는 자동 POST를 하지 않는다.

기존 `WorklogService.createWorklog`의 gateway.create 직전에 공통 `assertDirectWorklogAllowed(issueId)`를 호출한다. required issue는 payload approvalId/skipApproval을 보내도 WORKLOG_APPROVAL_REQUIRED. apply service는 createWorklog를 재호출하지 않고 immutable entry를 검증해 low-level gateway를 호출한다. 이 gateway를 신규 resolver로 노출하지 않는다. 형제 resolver와 editor context도 같은 정책 reader를 사용한다.

InboxService 종류별 metadata, InboxTable KNOWN_KINDS, ApprovalDetail target switch, 증명서·알림·보관 대상 해석에 WORKLOG_CREATE를 추가한다. 타입이 없는 row를 ISSUE로 해석하지 않는다. 기존 rows와 target key를 보존한다. 결정자 상세에서 snapshot은 읽기 전용이며 요청자에게만 apply 버튼을 보인다.

## 5. 최소 SQL·마이그레이션

현재 마지막 v035를 구현 직전 재확인하고 뒤에만 추가한다. 기존 project_config와 KVS를 변경하지 않는다.

| migration | 주요 컬럼/인덱스 |
|---|---|
| v036_create_worklog_approval_policy | project_id PK, required BOOLEAN default false, allowed_flow_ids JSON, default_flow_id NULL, rev BIGINT default 1, updated_at/by |
| v037_create_worklog_approval_binding | issue_id PK, project_id, flow_id, rev, updated_at/by; index(project_id,flow_id) |
| v038_create_worklog_approval_entry | entry_id UUID PK, request_id UUID UNIQUE, issue_id, project_id, requester_account, client_intent_id UUID, config_rev,binding_rev,flow_id,flow_rev/hash,steps_hash,snapshot_json,snapshot_hash,input_hash,create_state,apply_status,operation_id UUID UNIQUE,worklog_id NULL,apply_code NULL,apply_attempts,claim_at,rev,created_at/updated_at; UNIQUE(issue_id,requester_account,client_intent_id), index(requester_account,issue_id,created_at,entry_id) |

allowedFlowIds는 최대20개/중복 제거/빈 배열 가드. required=true에는 유효 default와 비어 있지 않은 steps 필수. 최초 config/binding save는 rev=0과 UNIQUE INSERT, 이후 `WHERE ... AND rev=?` UPDATE `SET rev=rev+1`. entry의 claim/finalize도 owner+rev 조건을 사용한다. 기존 target_kind 저장 컬럼이 VARCHAR인지 확인하고 enum/check 제약이면 최소 ALTER를 추가한다. 신규 테이블 참조 전 isTableReady 필수. 기존 getProjectPolicyOverride는 미준비/JSON오류 시 {}로 fallback하므로 strict 판정에 사용하지 않는다. 정책 JSON 파싱 오류와 SQL 불가를 설정 없음으로 바꾸지 않는다.

## 6. 적용 ledger·UNKNOWN 대조

apply_status=WAITING/APPLYING/APPLIED/FAILED/UNKNOWN/BLOCKED. approval status는 엔진 원천이다. 승인 전에도 WAITING일 수 있지만 canApply는 LIVE APPROVED의 본인만 true다.

1. 요청자 owner, 승인, 현재 issue/권한, policy snapshot, 기간잠금을 재판정한다. apply 입력은 requestId만 받는다.
2. `WHERE request_id=? AND requester_account=? AND rev=? AND apply_status IN ('WAITING','FAILED')` CAS로 APPLYING claim과 `rev=rev+1`. FAILED 재시도는 확실한 미실행 error allowlist만 허용한다.
3. immutable payload로 요청자 asUser POST를 한 번 보낸다. operationId는 entry 생성 시 고정한다. POST에 property marker를 원자적으로 함께 기록할 수 있는지는 실측한다. 지원되면 operationId/requestId/snapshotHash를 넣고 SQL 원본과 함께 상관 대조용으로만 쓴다.
4. 성공 시 worklogId/APPLIED를 claim rev로 저장하고 기존 history recorder를 호출한다. history 실패로 POST를 다시 보내지 않는다. Jira 성공 후 SQL 실패는 나중에 UNKNOWN으로 복구한다.
5. 확실한 400/403/404 미실행은 FAILED, timeout/network/5xx/종료/claim 기한 초과는 UNKNOWN. UNKNOWN 자동 재POST 금지. 다시 apply해도 저장된 결과 또는 UNKNOWN만 반환한다.

reconcile은 요청자 asUser로 페이지당100건, 호출당 최대5페이지/15초 GET 대조 후 cursor를 남긴다. 아직 complete가 아니면 후보 부재를 판정하지 않는다. complete=true에서0건이어도 POST 미실행을 증명하지 못하므로 UNKNOWN 유지. 일치1건이면 byId 재조회로 marker+owner+issue+전체 draft hash를 확인하고 APPLIED CAS. 복수·수정·삭제·visibility 제한·marker 미지원은 UNKNOWN으로 두고 support 확인한다. 자동 삭제·내용 유사성만으로 성공 추정·자동 새 신청을 하지 않는다.

property 값은 사용자도 바꿀 수 있어 권한/승인 판정에 쓰지 않는다. 이 대조는 SQL 원본을 기준으로 등록 결과를 연결하는 복구 방식이며 exactly-once 증명은 아니다. 단일 claim과 모호한 결과에서 재전송하지 않는 방식으로 이중 등록을 막는다. 최초 실측에서 properties를 POST에 원자 기록하지 못하면 자동 복구 기능은 제한 고지하고 UNKNOWN을 유지한다.

## 7. 프론트·i18n·query keys

- 프로젝트 설정: required toggle, existing available Flow multi-select, default select. preset 관리 페이지를 추가하지 않는다.
- 이슈 패널: 선택 Flow dropdown, canSelect=false 읽기 전용, 적용 범위/invalid 이유. 기존 전환 rule의 Flow 자동 고정도 표시한다.
- worklog editor: required면 “승인 요청”, 아니면 기존 등록. clientIntentId는 제출 재시도 때 보존한다. 작성 내용 변경/새 입력 때 새 UUID.
- 이슈 activity/요청 상세: 본인 등록 예정 목록50건 cursor, 승인/등록 상태 분리, 본인 approved apply, UNKNOWN 대조 및 중복 위험 안내. 승인자에게 등록 버튼을 주지 않는다.
- factory: worklogApprovalKeys.policy(issueId), mine(issueId), entry(requestId), config(projectId). 변경 후 해당 key와 기존 worklog/inbox/notification keys를 invalidate한다.
- kr/en 대칭 namespace worklogApproval: policy.required/invalid/changed/noneNotAllowed, action.request/apply/reconcile, state.pending/approvedWaiting/applied/failed/unknown, scopeNotice/requesterExecutionNotice, snapshot.started/seconds/comment. inbox.type.worklog_create와 ErrorCodes/오류 번역 추가. 사용자 텍스트는 로그에 남기지 않는다.

## 8. 용량·호출 예산

200명×월20일×일4입력=연192,000 entry. 평균snapshot2KiB만으로 약384MiB이며 engine request/approver/event/inbox/notifications/index까지 더하면1GiB 초과 가능성이 높다. 기존 retention export/clear에 WORKLOG_CREATE entry를 연결하고 UNKNOWN/APPLYING은 제거하지 않는다. 무기한 보관을 안내하지 않는다. 최대Flow20개, 페이지50건, 댓글은 기존 입력 한도 적용.

create는 issue/access 캐시 GET+SQL/Flow read+engine create, Jira POST0. apply는 issue/access GET+lock/policy read+CAS+POST1+finish. reconcile은 페이지GET 최대5+후보 byId1, 예산을 넘으면 cursor로 이어간다. 후보 사용자/issue 권한은 기존 batch 경로를 유지한다.

## 9. 미검증과 확인 항목

author 보존/승인자 POST0, POST property 원자 기록/GET expansion, 성공 후 SQL 저장 실패와 timeout에서 추가 POST0, 동일intent 더블클릭/다른hash 충돌, double apply CAS, false required 정상 입력/schema 미준비 앱입력거부, invalid/default/Flow 삭제, 남의 entry/다른project Flow/이슈 이동, 1000건초과pagination/restricted visibility/empty whereIn, 새 target inbox/detail/certificate/retention을 검증한다. 기존 전환 fail-open은 바꾸지 않고 옵션 분석의 고지 표를 UI/가이드에서 설명한다.

## 10. 순차 구현

backend: 3 migrations+정책 reader/config/binding → draft domain/repository/adapter registry/key → engine 자동 요청/동일intent복구 → 기존create gate → apply/reconcile/history → inbox/detail/retention → resolver삼종/ErrorCodes와 실제contract 보고.

frontend: backend 실제shape 확인 → 프로젝트Flow 설정/패널selector → editor자동요청 → entry상태/apply/UNKNOWN → 종류별 상세·증명서·kr/en/querykeys·가이드. verifier는 위 통합 시나리오와 기존 회귀를 확인한다. 모든 에이전트 종료 후에만 npm test→test:ui→build:ui→forge lint를 실행한다. 이번 설계 단계는 코드·manifest·locale·build·deploy를 수행하지 않는다.
