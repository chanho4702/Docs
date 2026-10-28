# 워크로그 사전승인 통합 검증 리포트 (회차1)

2026-10-06. integration-verifier/integration-verify 역할로 설계·backend/frontend 최종 보고서와 실제 소스를 대조했다. merge와 백엔드/UI 전체 검사를 직접 실행했다. 빌드·Forge·배포·커밋은 실행하지 않았다.

## 요약

경계면·불변식 소스 점검 통과 10건 / 재현 가능한 실패 0건 / 플랫폼·배포 미검증 5건. 백엔드 91 suites / 1300 tests, 실제 직렬 UI 44 suites / 356 tests 모두 exit 0이다. backend/frontend 자기 보고 숫자를 복사하지 않고 이번 실행 결과를 기록했다.

## 실제 resolver 계약

Controller는 WorklogApprovalController의 9개 method를 guardedDefine으로 감싸 content를 반환한다. PermissionMap에 9개 이름이 있고 src/index.js CONTROLLER_REGISTRARS에 registerWorklogApprovalController가 있다. invokeApproval은 content를 한 번 벗긴다.

| resolver | 생산자 | 소비자 | 결과 |
|---|---|---|---|
| getWorklogApprovalConfig | Policy.getConfig:{config,availableFlows[id,label]} | WorklogApprovalConfig config/availableFlows | 통과 |
| saveWorklogApprovalConfig | Policy.saveConfig:{config} | ConfigForm projectId/rev/required/allowedFlowIds/defaultFlowId 전송 | 통과 |
| getIssueWorklogApprovalPolicy | Controller:{policy:Policy.view(read)} | PolicyPanel/WorklogTab query.data.policy | 통과 |
| selectIssueWorklogApprovalFlow | Policy.select:{policy} | PolicyPanel issueId/flowId/bindingRev 전송 | 통과 |
| createWorklogApproval | Service.create:{entry} | WorklogDialog immutable 입력+clientIntentId,entry.requestId | 통과 |
| listMyWorklogApprovals | Service.list:{entries,nextCursor,hasMore} | MyWorklogApprovals infiniteQuery 50건 cursor | 통과 |
| getWorklogApprovalEntry | Service.detail:{entry,canApply} | WorklogApprovalEntry query.data.entry/canApply | 통과 |
| applyApprovedWorklog | Service.apply:{entry,worklog?} | Entry requestId만 전송, 성공 후 관련 cache invalidate | 통과 |
| reconcileApprovedWorklog | Service.reconcile:{entry,reconciliation} | Entry 숫자 cursor/nextCursor/manualReviewRequired | 통과 |

## 통과

1. project config는 project:admin, Flow selector는 issue:edit, read/create/list는 issue:view와 appAccess:false, detail/apply/reconcile은 SELF다. 실제 projectId를 asUser issue에서 읽고 허용 Flow를 project available Flow로 교차 확인한다. 사용자 None 해제와 임의 Flow 저장이 거부된다.
2. entry 적용·대조는 Service.owner에서 principal.accountId와 requester를 확인하고 실제 issue view/workOn을 재검사한다. Repository.change는 `WHERE request_id AND requester_account AND rev` + `SET rev=rev+1`을 사용한다. 본인 목록/cursor는 issue_id+requester_account 범위다.
3. policy table 미준비/읽기 오류는 STORAGE_NOT_READY이며 정상 설정 없음은 required=false다. required=true인데 Flow가 없거나 변경됐거나 project가 disabled면 신규 생성·적용을 허용하지 않는다. 기존 WorklogService.createWorklog는 gateway.create 직전 assertDirectAllowed를 호출하여 approvalId/skipApproval 우회를 막는다.
4. create는 Jira POST를 실행하지 않는다. UUID intent UNIQUE와 inputHash 대조로 동일 내용은 원래 requestId를 보존하고 다른 내용은 충돌한다. 엔진에는 서버 Flow/expandedSteps만 전달한다. snapshot/inputHash를 mutation으로 덮어쓰는 API가 없고 실행도 client draft를 받지 않는다.
5. WORKLOG_CREATE key/registry/adapter가 연결되어 있고 기존 key는 보존된다. adapter의 목록 filterVisible은 issue permissions/check를 batch 적용하고 targetKey로 되돌린다. full comment는 대상 참여자·이슈 열람 조건의 상세에서만 제공하고 inbox/my 목록 metadata에는 없다.
6. apply CAS 승자만 요청자 asUser POST를 1회 실행한다. 정책/잠금 재확인 실패로 POST가 시작되지 않았다면 WAITING으로 복구한다. timeout/network/5xx/SQL 저장 실패/stale APPLYING은 UNKNOWN이고 자동 재POST가 없다. afterDecide는 POST를 하지 않는다. beforeDecide 정책 읽기 실패는 WORKLOG_CREATE에만 승인 기록 전 throw하며 기존 대상의 처리를 유지한다.
7. reconcile은 읽기만 수행하고 최대 5페이지/100건/15초의 예산과 cursor로 대조한다. 후보 1건도 자동 APPLIED로 전환하지 않고 manualReviewRequired를 반환한다. UI는 이 상태에서 추가 대조를 막고 지원 확인을 안내하며 미실행으로 단정하지 않는다.
8. inbox/type/export/notification/detail/certificate에서 WORKLOG_CREATE를 해석한다. CertificateService는 adapter.certificateKey='worklogCreate'로 최상위 extra를 내리고 CertificateSheet가 동일 경로를 읽는다. retention은 entry 원본을 export하고 삭제 시 문자 UUID와 engine BINARY UUID를 구분하며 UNKNOWN/APPLYING/승인 후 WAITING·FAILED를 삭제 후보에서 제외한다.
9. UI 정책/editor/list/entry/config는 worklogApprovalKeys factory를 사용한다. WorklogDialog는 required일 때 자동 승인 요청, optional/edit일 때 기존 쓰기, policy 미준비면 버튼 비활성이다. input 변경 때 새 intent, 재시도 때 동일 intent를 지키고 CREATION_PENDING을 재상신으로 우회하지 않는다. config 저장/selector 선택/등록/모달 닫기에서 관련 query 무효화가 있다.
10. 자기승인 canApply 우려는 현 소스에서 blocker가 아니다. modal.approve 성공은 finish를 호출하고 finish는 worklogApprovalKeys.all을 invalidate한 뒤 모달을 닫는다. issue/my 목록의 onClose도 새 key를 무효화한다. 다시 열린 Entry는 새 entry/canApply를 읽는다. kr/en 신규 namespace가 존재하며 merge 검사가 실제로 성공했다. 기존 전환 Flow 고정과 외부 입력/수동 등록/UNKNOWN 고지를 구분한다.

## 설계 대비 보수적 구현 차이

- UNKNOWN은 자동 대조 완료 복구를 하지 않고 수동 확인까지만 지원한다. 반복 POST·자동 APPLIED를 피하는 보수적 범위이며 UI/가이드와 일치한다.
- 엔진 DRAFT가 남은 CREATING/FAILED는 동일 intent를 자동 재생성하지 않고 WORKLOG_CREATION_PENDING으로 지원 확인을 요구한다. LIVE 원본이 있으면 ledger를 finalize한다.
- entry snapshot 안에 config/binding/Flow/steps revision 해시를 저장하여 별도 rev 컬럼들의 정보를 포함한다. migration은 v036~038을 뒤에 추가했고 기존 이름을 바꾸지 않았다.
- create/appAccess:false로 명부 면제 사용자도 입력안을 만들 수 있지만 detail/apply/reconcile은 기존 SELF 명부 제한을 유지한다. restrictAccess 사이트에서는 요청자를 허용 명부에 포함해야 등록까지 진행한다. 운영 제약이며 이번 계약에 새로운 권한 면제를 추가하지 않았다.

## 실패

현재 직접 실행한 검사와 소스 대조에서 재현 가능한 실패를 발견하지 않았다.

## 실행 결과

| 명령 | exit | 결과 |
|---|---|---|
| npm.cmd run merge | 0 | ko-KR/en-US 생성, 키 대조 성공 |
| npm.cmd test -- --runInBand | 0 | 91 suites / 1300 tests PASS, 44.345초 |
| npm.cmd run test:ui -- --runInBand | 0 | 44 suites / 356 tests PASS, 35.138초. root npm script가 runInBand를 Jest에 전달하지 않아 worker 강제 종료 warning 1건 |
| npm.cmd --prefix static/ui test -- --runInBand | 0 | 실제 jest --runInBand 확인, 44 suites / 356 tests PASS, 36.88초, worker warning 없음 |

root UI 명령의 전달 문제를 확인하여 직접 prefix 직렬 명령으로 보완했다. 이외 불필요한 반복 검사는 하지 않았다.

## 미검증

1. UI build/bundle budget, forge lint는 리더가 모든 agent 종료 후 실행한다.
2. 실제 Forge SQL DDL/index/CAS/UUID JOIN과 설치 환경의 마이그레이션 준비 상태는 배포 환경에서 확인해야 한다.
3. 실제 Jira 작성자 보존과 POST property 원자 기록/GET expand, POST 성공 후 네트워크·SQL 장애는 mock 검사와 별개로 실측해야 한다. exactly-once 완료로 표시하지 않는다.
4. iframe의 selector→신청→승인→요청자 등록, 모달 왕복·UNKNOWN·light/dark·좁은 화면을 브라우저에서 조작하지 않았다.
5. 권한/이슈 프로젝트/정책 변경과 POST 사이 시점 경쟁, 외부 REST·타 앱 경로 전체 차단은 보장하지 않는다. 현재 설계와 고지 범위대로 운영 검증이 필요하다.
