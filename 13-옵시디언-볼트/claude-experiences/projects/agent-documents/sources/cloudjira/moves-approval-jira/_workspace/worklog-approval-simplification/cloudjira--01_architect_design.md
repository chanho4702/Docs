# 워크로그 승인 중심 단순화 설계

2026-10-13. 사용자 최신 요구가 linked-mode-ux의 승인 앱 단일 입력 및 사이트 관리자 전용 정책 결정보다 우선한다. 설계만 작성했으며 코드·빌드·배포는 수행하지 않았다.

## 가정과 제품 경계

- 자동 요청은 정상 경로 저장 직후, 마감은 기존 승인 마감일과 사이트 시간대를 따른다. 사용자의 비동기 질문 답변이 오면 해당 두 정책만 조정한다.
- 정상 입력은 Approval 이슈 패널과 Workforce 앱 내부의 두 창구다. Workforce의 Jira 이슈 탭에서는 입력기를 제거하고 Approval 패널로 안내하여 같은 이슈에 입력기가 두 개 보이지 않게 한다.
- 수정·삭제 실행은 Approval이 현재 DB를 확인하는 기존 경로를 유지한다. Workforce 내부에서는 작성·열람을 제공하고 기존 기록 수정·삭제는 Approval 상세로 연결한다. 앱 간 resolver·DB 직접 접근이 없는 현재 구조에서 Workforce가 낡은 서명 문서만으로 잠금을 해제하는 우회를 만들면 안 된다.
- 사후 승인과 사전 승인을 사용자 흐름에 함께 강요하지 않는다. 새 기본은 저장 후 승인이다. 사전 승인 코드·기존 요청·타임시트 데이터는 보존하고 고급/과거 기록에만 남긴다.
- 소명은 사유를 담은 재검토 요청이다. 요청만으로 승인·마감 잠금이나 확정 통계가 해제되지 않는다. 수정이 필요하면 기존 기간 재개/관리자 해제의 명시적 절차를 거친다. 소명 승인 자체를 임의의 수정 허가로 해석하지 않는다.

## 1. 개요·영향 범위

### 현행 근거와 재사용 결정

| 현재 코드 | 확인 내용 | 이번 사용 |
|---|---|---|
| `resolver/worklogApproval/WorklogApprovalService.js` | 저장 전 요청→결재→사용자가 Jira에 적용하는 사전 승인 | 새 건별 사후 승인과 혼동시키지 않고 보존 |
| `resolver/worklogCertification/*`, `approval/target/WorklogCertificationTargetAdapter.js` | 동결된 건별 사후 요청, snapshot/fingerprint, 승인 엔진 연계가 이미 있음 | 재활성화하고 사용자 명칭을 워크로그 승인으로 통일 |
| `domain/approval/scopeKey.js` | `WORKLOG_CERTIFICATION:{issueId}:{worklogId}` 열린 요청 UNIQUE | 그대로 재사용, 새 target kind 불필요 |
| `resolver/worklogCert/*` | 건별 확정 시간·인증 원장, CAS·이력·아웃박스·통제 훅 | 승인 최종 결정의 확정 결과로 재사용 |
| `domain/worklogControl/origin.js` | `movesRms.origin` 서버 서명 검증, op 재사용 차단까지 존재 | 정상 Workforce 입력 인정; 직접 작성 위반 관찰 제거 |
| `domain/worklogControl/rules.js` | `CERTIFIED/MISMATCH` 수정·삭제 차단, 기간 잠금 | 건별 승인 원장도 직접 확인하여 projection 지연에도 잠금 |
| Workforce `IssueWorklogControlService.js` | 정상 서명 POST가 있으나 연동 시 HANDOFF로 막음 | 생성만 검증된 직접 경로 재개 |
| Workforce `integration/approval/certification.js` | 문서 없는 월은 원래 값을 합산, 인증분 집계는 원가 중심 | 마감 월 정상+승인분만 집계하는 공용 판정 추가 |

핵심은 승인 요청의 진실을 `approval_request/approval_approver`, 확정 시간의 진실을 `worklog_cert`로 분리하되 결재 결과에서만 새 확정 레코드를 쓰는 것이다. 레거시 `worklog_certification`은 건별 승인 상태 projection이며 독립적인 인증 절차가 아니다. 기존 직접 인증 화면·resolver가 새 사후 승인을 우회하지 않도록 일반 모드에서 신규 직접 인증을 제한한다. 과거 인증분은 보존·명시적 LEGACY 상태로 표시한다.

영향: Approval 도메인·resolver·통제·트리거·서명 계약·이슈/업무함/설정 UI·i18n, Workforce 생성 서버·팀장 정책·패널·공용 통계·배지·이력 링크. 신규 Forge scope와 신규 스케줄은 기본적으로 없다.

## 2. 경계면 계약

모든 응답은 기존 `{success:true,content:...}` wrapper이며 실패는 `error.code`다. 이름이 기존과 겹치면 기존 controller에 가산하고 세 등록 지점과 계약 테스트를 함께 고친다.

| resolver | 권한 축·서비스 범위 | 입력 | content | 오류 | 소비 |
|---|---|---|---|---|---|
| `getWorklogCertification` 확장 | issue view + 작성자 또는 요청에 지정된 승인자; 숨김은 기존 본인/TeamScope만 | issueId,worklogId | certification,approval,canRequest,canAppeal,approvers,defaultApproverIds,locked,lockReason,historyPath | NOT_FOUND,STORAGE_NOT_READY | 상세·행 |
| `requestWorklogApproval` 신규 | SELF; 서버 principal 소유자 + issue view/workOn | issueId,worklogId,approverId?,reason? | requestId,status,approval,created:boolean | WORKLOG_NOT_OWNER,WORKLOG_ORIGIN_UNPROVEN,INVALID_APPROVER_CONFIGURATION,WORKLOG_CHANGED,STORAGE_NOT_READY | 수동 요청 |
| `appealWorklogApproval` 신규 | SELF; SQL author predicate + 본인 이슈 접근 | issueId,worklogId,reason(필수),approverId? | requestId,status,locked:true | 위 오류 + REASON_REQUIRED | 소명 |
| `listWorklogApprovalCandidates` 신규 또는 상세 가산 | SELF; 해당 이슈와 요청자 기준으로 후보 검증 | issueId,worklogId?,query? | users,defaultApproverIds,needsApprover | PERMISSION_DENIED | 수동 승인자 선택 |
| `decideApproval` 기존 | SELF + 실제 결재자/위임자, target beforeDecide | 기존 requestId,decision,reason,pin | 기존 모양 + 확정 처리 상태 | 기존 오류 + WORKLOG_ORIGIN_UNPROVEN | 단건 결정 |
| `bulkApprove` 기존 | SELF + 각 요청의 결정 권한 | 기존 ids(최대50),pin | 기존 부분 성공 모양; remaining 재개 | 건별 오류 | 승인자 업무함 |
| `getIssueWorklogs` 확장 | 기존 이슈 권한·숨김 범위 | 기존 | 각 행 approval:{status,requestId,decidedAt,decidedBy,rejectReason,canRequest,canAppeal}, origin,blocked | 기존 | 이슈 표 |
| `getWorklogHistory` 확장 | 기존 이슈 조회·본인/팀 범위 | 기존 + 승인 이벤트 병합 옵션 | 시간순 변경/결정 이벤트; actor,at,action,reason | 기존 | 상세 이력 |
| Workforce `createIssueWorklog` 변경 | 기존 SELF·멤버십 검증 | 기존 | id,issueId,signed,approvalStatus:'PROCESSING' | WORKLOG_PERIOD_LOCKED,WORKLOG_LINK_UNCONFIRMED | 앱 내부 작성 |
| Workforce `getIssueWorklogControl` 변경 | 기존 | 기존 | writeChannel(수정),createChannel(생성 별도),control,hidden | 기존 | 앱·이슈 탭 |

`approval.status`는 `UNSUBMITTED/NEEDS_APPROVER/PENDING/APPROVED/REJECTED/CHANGED/DELETED`다. 소명은 `appealPending`를 가산하며 이미 승인된 기준 상태와 잠금을 지우지 않는다. `WORKLOG_CERTIFICATION` 저장 식별자는 유지하고 UI 종류명만 워크로그 승인으로 변경한다.

승인자 선택은 Jira 활성 사용자 전체를 무조건 허용하지 않는다. 검증된 기본 팀장 + 기존 승인자 명부/사용 가능한 결재선 후보 중 대상 이슈 열람 가능한 사람, 본인 제외다. 팀장이 없으면 명부 후보를 고를 수 있다. 자동 요청에 후보가 없으면 로그 저장은 성공하고 `NEEDS_APPROVER`로 남아 수동 지정한다. 요청에 수동 지정된 승인자는 그 요청만 볼 수 있으며 다른 팀의 목록 열람 권한을 얻지 않는다. 숨긴 타인 워크로그의 asApp 보충은 기존 TeamScope 범위를 늘리지 않는다. 팀 밖 지정자는 요청 snapshot의 시간·일자·이슈만 보고 원본 설명을 받지 않는다.

## 3. 도메인

- `resolveWorklogApprovalStatus({request,baseline,current,appeal})`: 현재 내용과 요청 지문 불일치→CHANGED, 승인 기준 보존.
- `planWorklogRequest({origin,owner,request,locked,approverIds,mode,reason,now})`: 자동/수동 멱등·후보 없음·소명 판정.
- `canCountWorklog({linked,origin,approval,closeAt,now,currentFingerprint,approvedFingerprint})`: 진행 중 정상 경로 작성분, 마감 후 정상 경로+승인 지문에 근거한 확정 초. 건별 목록은 필터하지 않는다. 확인 불가를 승인으로 취급하지 않는다.
- 마감 판정은 기존 `closeAtOf`/기간 잠금 계산을 공유하며 `Date.now()`는 서비스에서만 주입한다.
- 테스트: 두 정상 출처, 서명 위조/재사용/변경, 중복 자동+수동 요청, 팀장 없음, 임의 승인자 차단, 마감 경계와 타임존, 승인 지문 불일치, 소명 중 잠금, 일괄 일부 실패, 다른 팀 데이터 비노출.

## 4. 백엔드

### 요청과 자동 접수

1. 기존 `WorklogCertificationService.create`를 안전하게 재사용하되 클라이언트 flowId 필수 의존을 없애고 검증된 승인자로 단일 승인 단계를 만든다. 기본 팀장은 `TeamScope.upperLeadsOf`와 검증된 Workforce org를 따른다.
2. 저장 전 요청과 저장 후 요청은 별개다. 정상 저장 후 origin 결속 성공 시 `requestAutomatically`를 호출한다. Workforce 생성은 기존 워크로그 트리거에서 origin 검증·DB 결속 후 동일 내부 함수를 호출한다.
3. 트리거에서 resolver를 위조 호출하거나 임의 accountId를 승인하지 않는다. 내부 함수는 서버가 읽은 실제 author/issue/worklog·정상 origin·검증된 팀장을 입력으로 받는다. 사람이 클릭한 요청과 시스템 자동 요청의 기록을 구분하고 기본 요청 메시지/서명 요구를 임의 우회하지 않는다. 사용자 실행 경로와 트리거 경로의 target visibility 로더는 명시적으로 분리한다.
4. 열린 요청 UNIQUE가 자동/수동 경합을 막는다. 동일 요청이면 기존 id를 반환하고 반려된 항목을 이벤트 재배달만으로 자동 재요청하지 않는다. 정상 수정으로 새 fingerprint가 된 경우 정책에 따라 새 요청을 만든다.
5. 부분 실패 보정은 기존 worklog 일일 스윕의 추적 행/이벤트 커서에 포함한다. 새 분 단위 스케줄을 만들지 않는다. 핫패스는 throw하지 않고 저장 성공과 요청 실패를 구분하여 UI에 접수 대기를 반환한다.

### 결정·확정·잠금

- target `beforeDecide`에서 현재 source/fingerprint·삭제 여부·이슈 접근·요청자/결재자 범위를 확인한다. batch는 사전 검증 결과를 일괄 로드하여 건별 Jira N+1을 피한다.
- `approval_approver`의 PENDING 조건부 UPDATE가 결정 원천이다. `worklog_certification`의 CAS와 `rev=rev+1`을 유지한다.
- 승인 후 기존 `WorklogCertService`의 저장·archive·outbox·controlHooks를 공용 내부 메서드로 추출해 확정 레코드를 기록한다. 수동 승인자를 팀장으로 가장하여 `certifyWorklogs`를 호출하지 않는다. 승인 요청의 최종 결정 증거를 내부 메서드가 확인한다. 정상 origin 불명이면 확정 불가.
- 승인 결정 저장 후 확정 projection 실패여도 승인 원장을 직접 확인하는 수정/삭제 판정으로 즉시 잠근다. `afterDecide` 재실행/기존 스윕으로 projection을 멱등 복구한다. bulk 예산 초과 시 확정 처리는 WAITING으로 남겨 재개하며 성공을 허위 표시하지 않는다.
- 소명은 같은 대상의 새 요청으로 `supersedes`와 필수 사유를 기록한다. 승인 당시 지문/시간은 별도 보존한다. 소명 중/반려 시 `verifiedFingerprint`나 worklog_cert를 지우지 않는다.
- `WorklogControlWorker.shouldRestrict`는 정상 origin이고 승인 또는 마감된 항목을 통제 대상으로 삼는다. visibility 실측 관문을 자동 PASS로 바꾸지 않는다. 마감 후 실제 Jira REST 전체 경로 차단은 플랫폼/사이트 통제 설정에 의존하므로 미검증 목록으로 남긴다.

### 정책과 Workforce 입력

- 기존 서명된 `rms.issue` 설정 경로를 확장해 팀장이 담당 Workforce 프로젝트의 연결 이슈에 간단한 정책(자동 요청, 승인 마감, 승인 후 수정 금지)을 일괄 적용한다. 서비스는 직속 담당 프로젝트와 실제 이슈 소속을 다시 검사한다. 관련 없는 Jira 프로젝트 전체에 권한을 확대하지 않는다.
- Approval 단독 모드는 같은 정책 키를 기존 사이트/프로젝트 설정에서 사용한다. 정책 화면에는 자동 접수·마감·승인 후 잠금 세 개만 기본 노출하고 기존 상한/사전 승인/진단은 고급으로 접는다.
- Workforce 생성 시 서명 키·실제 멤버십·검증된 정책/마감·정상 origin 봉투 생성이 모두 성공해야 직접 POST를 허용한다. createChannel과 edit writeChannel을 분리한다. 임의 ch 문자열이나 unsigned 프로퍼티로 DIRECT를 열지 않는다.
- Approval DB를 Workforce가 실시간 확인할 수 없으므로 관리자 수동 기간 마감/재개와 프로퍼티 게시 사이에는 지연이 있다. 해당 상태가 미확인/게시 대기이면 생성도 BLOCKED로 처리할 정책 신호가 필요하다. 외부 앱에 즉시 DB 잠금을 보장한다고 주장하지 않는다. 생성 후 Approval 트리거에서 마감 위반은 미승인/집계 제외로 관찰한다.
- 현재 `WorklogControlDetector`의 Workforce 직접 생성 위반은 제거한다. 작성 기간 위반과 서명 위조/재사용 검사는 유지한다. 사전 승인 요구로 새 정상 사후 승인 경로를 다시 막지 않도록 새 모드에서는 pa를 비활성 해석한다.

### 상태 변경 승인 제외

공용 기능 가드에서 이슈/상태/필드 승인의 신규 접수를 막고 화면·설정 선택지를 제외한다. 코드는 보존한다. 기존 저장값 true에도 이번 제품 모드에서는 제외되어야 하므로 기본값만 false로 바꾸는 것으로 끝내지 않는다. validator는 통과, 대기 자동 전환 작업은 FEATURE_DISABLED로 실행 중단한다. 과거 기록은 읽기 가능하며 워크로그 요청·결정은 같은 가드에 막히지 않는다.

## 5. 스키마·마이그레이션

새 대상·새 승인 테이블은 만들지 않는다. 기존 `worklog_certification`, `worklog_certification_request`, `approval_request`, `approval_approver`, `approval_event`, `worklog_cert`, `worklog_control`, `worklog_history` 재사용. 요청 purpose(AUTO/MANUAL/APPEAL), 원인 요청 id, 정책 snapshot은 기존 JSON snapshot에 넣을 수 있다. 목록용 필터가 필요한 컬럼만 최신 migration 번호 다음의 ALTER로 추가한다. 이미 배포한 migration 이름은 바꾸지 않는다.

모든 신규 참조는 readiness 확인. SELF update/delete는 author/accountId predicate. 승인자 대체 시 기존 결정 행을 삭제/재삽입하지 않는다. 재요청은 새 requestId. 빈 배열 whereIn 금지. 승인 확정 레코드와 레거시 직접 인증의 구분이 집계에 필요하면 기존 frozen JSON에 `approvalRequestId`와 origin proof 분류를 저장하고 typed serializer에 명시한다.

## 6. Jira 연결·서명 계약

- Jira 생성은 각 앱 `asUser`, 수정·삭제는 기존 Approval 게이트웨이, 트리거 읽기는 기존 허용 사유. 워크로그 origin 서명 계약은 그대로 사용한다.
- 승인 상태 전달은 기존 사용자×월 cert 문서와 아웃박스를 확장한다. 서명 payload에 `approval` 선택 블록을 추가한다: `{version:1, closeAt, entries:[[worklogId,requestId,status,decidedAt,actorId,origin,fingerprint]], truncated}`. 상세 반려/소명 사유와 설명 원문은 공용 프로퍼티에 게시하지 않고 권한을 확인하는 Approval 상세/이력 링크로 제공한다.
- 승인/마감 집계는 서명 검증 성공 문서만 사용한다. 새 계약 미지원·문서 부재·잘림이면 마감 후 CLAIMED로 후퇴하지 않고 UNKNOWN/제외로 표시한다. 이전 cert 문서의 인증을 새 결재 승인으로 자동 승격하지 않는다.
- 최대 30KB 예산 내에서 기존 cert list와 새 블록을 함께 자른다. 잘린 id를 승인으로 추측하지 않는다. 필요 시 월 문서 분할은 별도 계약으로 하고 구현자가 무제한 JSON을 넣지 않는다.
- `WorkforceCertWake`의 기존 이벤트 큐 경로를 사용한다. 새 요청·반려·승인·소명 시 해당 월 아웃박스를 touch하고 publisher만 프로퍼티 PUT. 승인 정보의 reader는 사용자 자격, 기존 원가 집계 asApp 예외는 숫자 집계 용도로만 유지한다.
- 중복 UI는 이슈 화면의 Workforce editor를 숨겨 해결한다. Forge 모듈을 제거하지 않아 코드와 기존 설치를 보존한다. entity property display condition은 표시용일 뿐 보안 경계가 아니다.

## 7. 프론트

Approval 이슈 패널: 상단 입력 폼 → 내/전체 허용 범위 워크로그 표(일자·시간·승인 상태·잠금·작업) → 상세 모달(결정 이력/변경 이력). 월 인증/사전 승인/일반 이슈 승인/상태 변경 카드는 기본에서 제거한다. 요청 버튼은 행과 상세에 있고 자동 접수이면 상태로 보여 준다. 반려는 사유와 재요청, 승인/마감 건은 소명 버튼을 제공한다.

업무함은 워크로그 승인 필터를 기본으로 하고 기존 선택·bulkApprove를 재사용한다. 기본 팀장과 직접 선택을 같은 작은 요청 모달에 둔다. 자동 요청 이미 존재 시 새 중복 요청을 만들지 않고 해당 요청을 연다. 승인자 변경은 기존 요청 취소+신규 요청이 필요한 경우 명시한다.

Workforce 앱 내부 작성 모달은 다시 입력을 받는다. Jira 이슈 탭의 중복 입력기는 연동 시 숨기고 Approval 이슈 패널 안내/열기만 둔다. 각 행 상태는 항상 표시하고 수정 불가 이유·누가 언제 승인했는지는 서명 상태로, 전체 이력/반려 사유는 Approval 상세 링크로 접근한다. 링크는 issueId/worklogId를 갖춘 기존 handoffPath 계열을 확장하며 설명·사유를 URL에 넣지 않는다.

Workforce 통계: 공용 `canCountWorklog` 적용 결과를 dashboard/resource/team/project/calendar 합계·원가·내보내기의 실제 합산 입력에 적용한다. 목록 DTO는 필터하지 않고 status/countableSeconds를 가산한다. 현재 월 정상 경로분은 실시간 합산, 마감 월은 승인된 확정분만. 모든 계산 경로 목록을 rg로 전수 확인하고 한 화면만 바꾸지 않는다. 권한별 캐시 키에 viewer·집계 기준·정책/문서 rev를 포함한다.

쿼리키는 양쪽 기존 `utils/queryKey` factory에 추가한다. 승인/소명/결정 후 행·상세·이력·업무함·통계 키를 무효화한다. 기존 `WorklogDetailModal`, `WorklogHistoryList`, `InboxTable`, `ReasonModal`, `BulkDecideBar`를 먼저 재사용한다.

## 8. i18n

kr/en 원본 네임스페이스에 같은 키 집합을 추가한다.

| 키 | 한국어 | 영어 |
|---|---|---|
| worklogApproval.title | 워크로그 승인 | Worklog approval |
| worklogApproval.request | 승인 요청 | Request approval |
| worklogApproval.autoPending | 자동 승인 요청됨 | Automatically submitted |
| worklogApproval.needsApprover | 승인자를 선택해 주세요 | Choose an approver |
| worklogApproval.appeal | 소명·재승인 요청 | Request review |
| worklogApproval.appealLocked | 검토 중에도 기존 승인과 잠금은 유지됩니다. | Existing approval and lock remain during review. |
| worklogApproval.lockedApproved | 승인되어 수정할 수 없습니다. | Approved worklogs cannot be edited. |
| worklogApproval.lockedClosed | 승인 마감일이 지나 수정할 수 없습니다. | The approval period is closed. |
| worklogApproval.countingClosed | 마감된 기간은 승인된 기록만 집계합니다. | Closed periods count approved worklogs only. |

## 9. 용량·호출량

200명×연 240근무일×하루 4건=연 192,000건. 건별 승인 요청/결재자/이벤트/업무함·snapshot 총 2.4KB 가정이면 인덱스 포함 약 0.9GB/년으로 기존 1GiB에 근접한다. 실제 daily worklog 빈도·기존 보관 정책을 측정해야 한다. 기존 타임시트 기준 연 110MB 추정은 이 모델에 적용할 수 없다. 요청당 불필요한 중복 이벤트/알림은 만들지 않고 기존 보관·내보내기 경로를 재사용한다. 보관 정책을 사용자 승인 없이 단축하지 않는다.

조회 50건: permissions/check 배치 1회 + worklog/list 배치 1회 + 사용자 정보 배치/캐시. 수동 요청 1건: 이슈/워크로그 조회 각 1회, 후보 org 조회 캐시, Jira 쓰기 없음. 생성은 POST 1회+정책/멤버십 검증(기존 호출), origin 별도 PUT 없음. 일괄 결정은 50건 배치 읽기 후 SQL 결정, 시간이 부족하면 remaining으로 이어 간다. 월 게시 사용자당 1회(중복 wake 합치기).

새 스케줄 없음. 이벤트 0·사용자 0일 때 추가 SQL 0이 목표다. 기존 idleSqlBudget 27/38 계약을 유지하고 새 자동 요청 재시도는 pending KVS 표식이 있는 날만 기존 큐에서 처리한다.

## 10. 미검증·제약

| 항목 | 영향 | 확인 방법 |
|---|---|---|
| visibility 통제가 사이트에서 승인/마감분 외부 편집을 실제 차단하는지 | 전체 Jira 경로 수정 불가 보장 | 기존 G_* 실측 관문 유지, 배포 후 작성자/관리자 REST와 UI 확인 |
| Workforce 직접 생성과 Approval 수동 마감 사이 게시 지연 | 서로 다른 앱에서 즉시 DB 잠금 불가 | 마감 직후 생성 경합 시험; 미확인 정책 차단·후속 관찰 확인 |
| 타인 사용자 cert 프로퍼티 asUser 읽기 제한 | 비관리자 Workforce 승인 배지·집계 확인 불가 | 실제 계정으로 확인; UNKNOWN을 노출하며 승인으로 추측하지 않음. 권한 확장은 별도 검토 |
| 자동 요청 엔진의 사용자 컨텍스트 의존 | 트리거에서 생성 누락 가능 | 엔진 사용 API·PIN/정책 경계 점검; 시스템 내부 경로와 UI 경로 계약 테스트 |
| 기존 frozen 기록과 새 결재 승인 판별 | 과거 인증이 새 승인으로 오인될 위험 | 레거시 fixture·혼합 월 통계 테스트 |
| 두 앱 패널 UI 설치 상태 | 모듈 자체는 남아 제목이 둘일 수 있음 | 이슈 화면 실측; Workforce 입력기 제거와 읽기 탭 목적 확인 |

플랫폼 신규 사실에 기대어 앱 간 직접 invoke나 타 앱 iframe 삽입을 설계하지 않는다. 전체 역사 원문을 다른 앱이 읽을 수 있다고 가정하지 않고, Workforce에서 권한 있는 Approval 상세로 연결하는 방식이 기본이다.

## 11. 작업 분해·검증

추가 인계: 자동 요청은 UI 재방문에 의존하면 안 된다. Workforce 트리거는 검증 후 DB에 수신된 org의 leaderKeys를 사용하고 없으면 서명된 Workforce 생성 metadata의 서버 산출 팀장 후보를 검증하는 확장이 필요하다. client가 보낸 leaderKeys를 서명하기만 하는 구현은 금지한다. 내부 engine 생성 함수는 origin 결속·실제 author·신뢰 라우팅을 완료한 서버 경로에서만 호출하고, 사용자 target 권한 검사 API와 구분하며 새 offline impersonation은 추가하지 않는다. 해당 메서드의 구체적 인자는 backend가 ApprovalService 실제 의존성을 확인하여 확정한다.

입력 폼에서 optional 승인자를 선택할 수 있어야 저장 직후 자동 요청에 가로막히지 않는다. 이미 생긴 자동 PENDING 요청은 결정이 하나도 없고 요청자가 본인일 때만 기존 cancel+supersede로 승인자를 바꾼다. 취소와 신규 생성 경합에서 열린 요청 UNIQUE를 유지하고 기존 결정이 생겼다면 변경을 거부한다.

Workforce 작업 트리 시작 기준: tracked 변경 없음. 기존 untracked pptx 2개, custom-scopes.yaml, `src/resolver/backoffice/team/__test__/LeaderTeamBackfill.test.js`, 캡처.png는 이번 작업과 무관하므로 수정/삭제/스테이징하지 않는다.

Backend: 레거시 사후 요청 활성화 → 기본/수동 승인자 범위 → 자동 요청+멱등+부분 실패 → 승인 projection·잠금 → 소명 → 이력 병합 → 정상 출처/마감/프로젝트 정책 → cert 서명 계약 → 상태 승인 중단. Workforce backend: 생성 재개·서명/마감 fail-close → 정책 권한 → 새 cert reader → 모든 집계 경로 공용 기준.

Frontend: 이슈 패널 단순화 → 행/상세 요청·소명·이력 → 승인자 업무함 일괄 처리 → 설정 세 정책 → 상태 승인 노출 제거 → Workforce 중복 editor 제거/앱 내부 작성 복구 → 건별 배지·이력 링크·마감 집계 설명.

필수 검증: permissionMap/controller/registrar 계약, SELF 소유자 SQL, 일괄 mixed 권한, CAS·PENDING 조건, 정상 출처 서명/재사용, 자동·수동 중복, 마감 경계/소명 잠금, 직접 인증 우회 방지, projection 실패 잠금, 원가 외 통계와 내보내기, hidden 설명 범위, 구판 문서·잘림·서명 실패 fail-close, validator pass 및 대기 transition 실행 중단, idleSqlBudget. 모든 에이전트 완료 후 리더가 backend/UI tests, check:bundle, build:ui, forge lint 순서의 필수 확인을 수행한다. 배포·커밋·푸시는 하지 않는다.
