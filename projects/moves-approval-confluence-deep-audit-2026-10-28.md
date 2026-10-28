# Moves Approval Confluence 심층 분석 — 2026-10-28

- 대상: `C:\CloudJira\moves-approval`, HEAD `b0e1cbb`. Jira 승인 앱과 다른 저장소다.
- 사용자 요청: 심층 분석 후 문제점 파악. 제품 코드 수정·배포·커밋·푸시는 수행하지 않았다.
- 상세 보고서: [[evidence/moves-approval-confluence-deep-audit-2026-10-28/review-report.txt|Vault에 보관한 보고서 원본]].
- 진단: 같은 폴더 `audit.repro.js`, 실행 결과 `repro-results.json`. 기존 backend 249개, frontend 91개 통과와 별도로 결함 진단 18개 통과. 진단은 잘못된 동작을 기대하므로 정상 회귀 테스트가 아니다.
- 우선순위: 문제·설계 공백 18건(P1 9건, P2 9건). 동시 승인·반려 후 APPROVED/REJECT 원본 모순, 결정 클레임 뒤 실패 복구 부재, DRAFT dedupe 영구 점유, 실패한 회수 감사 이벤트, PIN 정책 조회 실패 시 검증 생략, PIN·위임 스페이스 정책 미반영, 영역 hash 검사 없는 공통 결정, 영역 상세 PIN·위임 계약 누락, Flow 단계 교체 손실이 핵심이다.
- 후속: 콜론 accountId의 CC 탈락, 알림 후보 첫 100건 정체, 요청 알림 OFF 무시, 다음 단계 앱 알림 부재, 권한 필터 전 집계의 의도된 한계, 승인 그룹 첫 20건만 노출, 개인정보 보고 저장 위치 누락, 스윕 시간 예산 불일치, 반려 사유 선택 정책을 무시하는 UI.
- 공식 문서로 확인: 콜론이 포함된 Atlassian accountId는 정상이며, scheduled trigger 기본 제한은 55초다. 현행 스윕은 timeoutSeconds 없이 60초 예산을 배치 종료 후에만 확인한다.
- UI build 성공(기존 Atlaskit postcss-calc 경고 1건). backend/frontend `npm audit --omit=dev` 모두 0건. `forge lint`도 exit 0, `No issues found`로 완료됐다. 최종 Git 작업 트리는 깨끗하다.
- 검증 한계: 외부 SQL/API를 대체해 실제 서비스·Repository 함수의 경합/오류 흐름을 검사했다. 실제 Forge SQL 통합, 운영 발생 건수, iframe E2E는 미검증이다.
- 교훈: 주석의 '리컨실러가 복구한다'와 실제 등록된 복구 경로는 다르다. 결정 원본·종결 CAS·감사 이벤트·업무함·알림을 하나의 실패 복구 프로토콜로 검사해야 한다. 페이지/영역 계약 비교도 approval 내부 키만 비교하면 최상위 pin 누락을 놓친다.
- 관련: [[moves-approval-logic-design-review-2026-10-08]], [[moves-approval-lifecycle-settings-ux-2026-10-26]], [[moves-approval-region-macro-2026-08-26]].

## 후속 작업 브랜치와 자료 이관

- 사용자 요청에 따라 `main`의 `b0e1cbb3621357c71723a20a244916004621131e`에서 `audit/deep-review-2026-10-28` 브랜치를 생성하고 전환했다.
- 분석 자료 5개를 프로젝트의 `_workspace/deep-audit-2026-10-28`에서 Vault의 `evidence/moves-approval-confluence-deep-audit-2026-10-28`로 이동했다. 이동 전후 SHA-256이 모두 일치하며 프로젝트 쪽 원본 폴더는 남기지 않았다.
- 제품 소스 수정·커밋·푸시는 하지 않았다. 후속 수정은 위 브랜치에서 진행할 수 있다.
- 보고서 원본: [[evidence/moves-approval-confluence-deep-audit-2026-10-28/review-report.txt]]
- 재현 코드: [[evidence/moves-approval-confluence-deep-audit-2026-10-28/audit.repro.js]]
- 진단 결과: [[evidence/moves-approval-confluence-deep-audit-2026-10-28/repro-results.json]]
- 의존성 검사: [[evidence/moves-approval-confluence-deep-audit-2026-10-28/backend-audit.json]], [[evidence/moves-approval-confluence-deep-audit-2026-10-28/frontend-audit.json]]
- 재현 코드는 `../../src` 상대 import를 보존했다. 다시 실행할 때만 `audit.repro.js`의 사본을 프로젝트의 `_workspace/deep-audit-2026-10-28`에 두고 아래 원문의 Jest 명령을 사용한다. Vault에 있는 파일을 직접 Jest로 실행하면 경로가 맞지 않는다.

## 상세 분석 원문

아래 내용과 보고서 첨부는 분석 당시 원문이다. 원문에 적힌 `_workspace` 위치는 당시 실행 경로이며, 현재 보관 위치는 위의 Vault 링크를 따른다.

Moves Approval for Confluence 심층 분석
분석일: 2026-10-28
기준: C:\CloudJira\moves-approval / HEAD b0e1cbb
요청 범위: 문제점 파악. 제품 소스 수정·배포·커밋·푸시는 수행하지 않음.

현재 판단

기본 권한 가드와 정상 처리 경로는 갖춰져 있으나, 동시 결정과 부분 저장 실패에 대한 수렴이 완성되지 않았다.
정책 조회 실패를 허용으로 바꾸는 경로, 페이지/영역별 응답 계약 차이, 제한된 배치를 끝까지 순회하지 않는 문제도 있다.
아래 18개 항목 중 우선 수정 대상은 P1 9개, 후속 개선 대상은 P2 9개다.
P1은 결재 결과·감사 증거·권한 정책 또는 핵심 기능의 지속적인 장애를 유발하는 항목이다. P2는 알림·목록·규모 확장·정책 UI 등의 기능 공백이다.
운영에서 이미 발생했다는 의미는 아니다. 운영 DB와 실제 Confluence 화면은 이번 분석에서 조회하지 않았다.

검증 방법과 한계

- 기존 backend 테스트: 35 suites / 249 tests 통과.
- 기존 frontend 테스트: 16 suites / 91 tests 통과.
- audit.repro.js: 실제 Service/Repository/도메인 함수를 실행하고 외부 SQL/API를 통제하여 경합·부분 실패·정책 불일치를 재현한다.
  이 파일은 잘못된 현재 동작을 기대하는 진단이며, 통과가 정상이라는 뜻이 아니다. 일반 test 패턴에 포함되지 않는 .repro.js로 보관했다.
- R01~R17에 진단을 연결했다. R06은 PIN과 위임을 각각 검사한다. R18은 UI와 서버 계약의 정적 대조다.
- SQL mock은 Forge SQL의 실제 지연·격리 수준·오류 빈도를 검증하지 않는다. 실제 DB 통합 검증과 운영 영향 건수 확인은 별도로 필요하다.
- 빌드·Forge lint·의존성 검사의 최종 결과는 파일 끝의 검증 결과에 기록한다.

R01 [P1] 동시 승인·반려에서 최종 상태가 결정 원본과 모순된다

근거: src/resolver/approval/ApprovalRepository.js:587, 606, 617, 654
      src/domain/approval/derive.js / deriveStatus
재현: 한 단계에서 a 또는 b 중 1명 승인으로 완료되는 요청에 a가 승인, b가 반려한다.
      두 호출이 같은 상태를 읽고 각각 결정 행을 저장한 후, a의 CAS가 먼저 성공하도록 실행했다.
결과: b의 REJECT가 저장되어 deriveStatus는 REJECTED를 계산하지만 요청 status는 APPROVED로 고정됐다.
원인: 첫 CAS는 다른 결정이 저장되기 전 snapshot으로 계산한다. 뒤 호출은 이미 종결된 상태를 읽으면 재계산하지 않고 반환한다.
영향: 승인 완료 표시·증명서의 상태와 반려 원본이 충돌한다. 불변식 '결정이 진실, 상태는 파생'이 성립하지 않는다.
개선: 결정 수락과 종결을 하나의 명확한 동시성 프로토콜로 묶어야 한다. request revision에 묶인 결정 수락, 종결 후 수락 금지, 실제 복구 작업을 함께 설계한다.
      단순히 CAS 횟수를 늘리거나 종결 후 상태를 무조건 다시 덮는 수정은 회수·만료와의 충돌을 남긴다.
진단: R01.

R02 [P1] 결정 저장 뒤 실패하면 재시도로 상태·이력·업무함을 복구하지 않는다

근거: src/resolver/approval/ApprovalRepository.js:604, 606, 617
      src/domain/approval/transitions.js / approve의 idempotent 반환
      src/trigger/runSweep.js / src/resolver/approval/ExpiryService.js / sweep
재현: 승인자 행의 APPROVE 저장은 성공하고 appendEvent만 한 번 실패시킨 뒤 같은 승인을 재시도했다.
결과: 재시도는 '이미 APPROVE'만 보고 PENDING 상태를 그대로 성공 반환했다. event/CAS는 다시 실행하지 않았다.
영향: 원본 결정은 끝났는데 요청이 대기 상태로 남거나, 최종 상태만 바뀌고 업무함 투영은 예전 값으로 남을 수 있다.
      마감 없는 요청에서는 이를 자동으로 해결할 연결된 작업이 없다. 반려 재시도도 이미 결정한 행의 복구를 보장하지 않는다.
개선: 멱등 재시도는 이미 저장한 사실의 후속 처리를 완료해야 한다. 결정·이벤트·projection 복구 위치를 저장하고 수렴 작업을 실제 등록한다.
진단: R02.

R03 [P1] 생성 중 실패한 DRAFT가 대상의 새 요청을 계속 막는다

근거: src/resolver/approval/ApprovalRepository.js:95, 131, 146, 167, 212
      src/rdb/schema/ddl/approvalRequest.sql.js / uq_request_dedupe
재현: 요청 DRAFT INSERT 이후 approval_approver INSERT를 실패시키고, 같은 페이지에 다시 요청했다.
결과: 첫 요청은 LIVE가 아니어서 조회할 수 없지만 dedupe_key는 점유한다. 두 번째 요청은 ALREADY_OPEN으로 실패한다.
조건: 특히 expires_at이 NULL이면 expireOpenRequest도 이 행을 해제하지 않는다.
영향: 사용자는 열린 요청을 찾거나 회수할 수 없으면서 그 대상에 새 요청도 만들 수 없다.
개선: 만료된 DRAFT의 소유권/lease와 재개·중단 기준을 두고 안전하게 복구해야 한다. 아직 실행 중인 DRAFT를 무조건 DELETE하면 안 된다.
진단: R03. 기존 ApprovalRepository 테스트에도 DRAFT를 남기는 기대값이 있으나 실제 정리 실행기는 없다.

R04 [P1] 실패한 회수·시스템 만료도 성공한 감사 이벤트처럼 남는다

근거: src/resolver/approval/ApprovalRepository.js:815, 826, 887
      src/resolver/approval/ApprovalService.js / cancelApproval
재현: CANCELLED 이벤트를 먼저 INSERT한 뒤 CAS가 다른 승인 완료에 패배하도록 실행했다.
결과: 최종 status=APPROVED인데 감사 이벤트에는 CANCELLED가 남았다.
영향: 화면 타임라인·내보내기·증명서가 실제 확정되지 않은 회수를 사실처럼 표시한다. service의 회수 알림도 잘못 발송될 수 있다.
개선: 전이 시도와 확정 사건을 구분하거나, 전이 확정 이후 결정적인 event를 복구 가능하게 materialize한다.
진단: R04. closeBySystem도 event INSERT가 CAS보다 앞서는 같은 구조다.

R05 [P1] PIN 정책 저장소 장애가 PIN 검증 우회로 이어진다

근거: src/resolver/signature/PinService.js:38, 106
재현: policyLoader가 KVS 오류를 던지도록 하고 PIN 없이 verifyIfRequired를 호출했다.
결과: 오류가 {}로 바뀌어 pinRequired=false가 되며 PIN 저장소조차 조회하지 않았다.
영향: 이미 로그인한 사용자의 결재 PIN이라는 추가 검증이 저장소 장애 시 사라진다. 외부 비로그인 사용자의 인증 우회라는 뜻은 아니다.
개선: 보안 정책을 읽지 못한 상태를 '해제'로 치환하지 말고 결정을 거부하도록 한다.
진단: R05.

R06 [P1] 스페이스에서 저장한 PIN·위임 정책이 실제 결정에 적용되지 않는다

근거: src/resolver/approval/ApprovalService.js:252, 493, 692, 756
      src/resolver/signature/PinService.js:30
      src/resolver/delegation/DelegationService.js:36, 55
      static/ui/src/features/settings/SpacePolicyModal.jsx:35
재현: 전역 PIN=false / 스페이스 PIN=true, 전역 위임=true / 스페이스 위임=false인 설정을 각각 구성했다.
결과: 기본 PIN·위임 서비스는 getPolicy만 읽으며 getEffectivePolicy는 호출하지 않는다.
      PIN은 요구하지 않고, 위임 금지 스페이스에서도 대리인을 활성으로 판단한다.
영향: 저장한 보안 정책과 실제 결정 권한이 다르다. 반대 조합에서는 필요한 기능이 막힌다.
개선: request의 실제 spaceKey로 유효 정책을 구하고 조회·개별 결정·일괄 결정에 동일하게 전달한다.
      bulkApprove의 묶음당 1회 PIN 검증도 여러 스페이스의 필수 정책을 충족하도록 바꿔야 한다.
      signatureEnabled·일반 알림의 기본 loader도 전역 정책만 읽으므로 같은 정책 경계 정리에 포함한다.
진단: R06 2개.

R07 [P1] 변경된 영역의 승인 금지가 조회 응답에만 있고 결정 서버에는 없다

근거: src/resolver/region/RegionService.js:247, 383
      src/resolver/approval/ApprovalService.js:732
재현: 요청 이후 영역 본문을 바꿔 getRegionApproval에서 regionHashMatches=false, canApprove=false를 확인했다.
      같은 requestId로 공통 decideApproval을 호출했다.
결과: 결정 경로는 페이지 열람권한과 승인자 자격만 확인하고 현재 영역 hash/존재를 검사하지 않아 approve를 호출한다.
영향: 상세 화면에서는 막힌 영역도 일괄 승인 또는 직접 resolver 호출로 결정할 수 있다.
      매크로 삭제 후 트리거가 아직 회수하지 않은 기간도 같은 경계에 해당한다.
개선: UI의 canApprove에 의존하지 말고, 개별·일괄 결정을 공유하는 서버 경계에서 영역 유효성을 검사한다.
진단: R07. 페이지 결재의 '편집 후에도 기존 버전을 승인 가능' 정책과 영역 hash 금지는 별개의 계약이다.

R08 [P1] 영역 결재 응답이 PIN·위임에 필요한 상세 계약을 빠뜨린다

근거: src/resolver/region/RegionService.js:276, 395
      src/resolver/approval/ApprovalService.js:319
      static/ui/src/entries/modal.jsx:181, 193
재현: 유효한 영역 요청에 pinStatusLoader={required:true,hasPin:true}를 제공하고 상세를 조회했다.
결과: getRegionApproval은 pinStatusLoader를 부르지 않고 pin 필드도 반환하지 않는다.
영향: 전역 PIN을 켜면 상세 화면은 PIN 입력을 열지 않은 채 결정을 보내고 서버는 PIN_REQUIRED를 반환한다.
      페이지 모달에서 영역 requestId를 조회해도 RegionService로 위임하므로 같은 문제가 난다.
추가 계약 공백: onBehalfOf를 항상 null로 반환하고 canApprove도 본인 결정만 계산한다. 위임으로 들어온 영역 요청은 UI에서 결정 버튼이 없다.
      이벤트 DTO도 delegateKey를 누락해 실제 대리 결정자 표시가 사라진다.
개선: 페이지·영역이 공유하는 상세 DTO 조립과 유효 정책/PIN/위임 계산을 한 곳으로 모으고 최상위 응답 계약까지 검사한다.
진단: R08은 PIN 누락을 재현. 위임 필드 누락은 코드 대조로 확인.

R09 [P2] 정상 Atlassian accountId가 참조(CC)에서 제거된다

근거: src/resolver/approval/ApprovalService.js:71, 76
재현: CC에 557058:6b97ff00-3a2a-4a51-a1c0-a2a4213a3d43를 넣었다.
결과: normalizeCc가 ':'를 포함한 모든 키를 제거한다. 그룹 확장이 끝난 실제 사용자 accountId도 삭제한다.
영향: 요청은 성공하지만 해당 사람은 CC 업무함과 알림에서 빠진다.
개선: accountId를 불투명 식별자로 취급하고 group:/agroup: 접두사만 구분한다.
공식 근거: https://support.atlassian.com/confluence/kb/how-to-get-atlassian-account-id-without-using-api/
진단: R09.

R10 [P1] Flow 수정이 기존 단계 삭제 뒤 실패하면 원본 결재선을 잃는다

근거: src/resolver/flow/FlowRepository.js:267, 294
재현: parent rev CAS를 통과하고 기존 단계를 DELETE한 뒤 새 단계 INSERT를 실패시켰다.
결과: 이전 결재 단계는 사라지고 parent rev는 이미 증가해 있다.
영향: 저장 실패만 보인다고 원본이 유지되는 것이 아니다. 활성 Flow가 단계 없는 상태로 노출될 수 있다.
      replaceFlowSpaces도 삭제 후 삽입하며, 빈 적용 목록이 '전역'을 뜻하므로 실패 도중 노출 범위가 넓어진다.
개선: 새 revision의 단계/적용 범위를 먼저 완성한 후 parent가 가리키는 revision을 CAS로 바꾸는 방식 등으로 원본을 보존한다.
진단: R10은 단계 손실을 재현. 스페이스 교체는 같은 저장 순서를 확인.

R11 [P2] 독촉·마감 임박 알림이 첫 100건 뒤로 진행하지 않는다

근거: src/resolver/approval/ApprovalRepository.js:774, 793
      src/resolver/approval/ExpiryService.js:267, 274, 331, 337
재현: 독촉 대상 101건을 만들고 앞 100건 발송 뒤 같은 회차를 다시 실행했다.
결과: SQL LIMIT 100으로 동일한 앞부분을 읽고, 그 뒤 이미 보낸 event를 제거해 빈 목록이 된다. 101번째는 읽지 않는다.
영향: 오래된 100건이 유지되면 뒤 요청은 새 독촉 회차에도 계속 누락될 수 있다. 마감 임박도 동일한 선별 순서다.
개선: keyset cursor/continuation으로 전체 후보를 순회하거나 발송 여부를 후보 SQL에 반영한다. 정책상 제외된 앞부분도 넘겨야 한다.
진단: R11.

R12 [P2] 앱 내 알림 OFF 정책이 요청 생성에는 적용되지 않는다

근거: src/resolver/approval/ApprovalRepository.js:181, 194
      src/resolver/notification/NotificationService.js:299
재현: notificationsEnabled=false 상태에서 createRequest를 실행했다.
결과: 생성 Repository가 NotificationService를 거치지 않고 approval_notification에 직접 INSERT한다.
영향: 동일한 알림 OFF 설정이어도 요청 시점 알림은 생성되고 다른 사건은 생략되는 불일치가 난다.
개선: 요청 생성·만료·결정의 알림 정책을 동일한 service/outbox 경계로 통합한다. 알림 실패 복구도 그 경계에 둔다.
진단: R12.

R13 [P2] 다음 단계 결재자에게 앱 내 알림이 생성되지 않는다

근거: src/resolver/notification/NotificationService.js:54, 71
      src/resolver/approval/ApprovalService.js / stepAdvanced 알림 분기
재현: APPROVED 결정 후 전체 요청은 PENDING이고 currentStepOrder가 다음 단계인 입력을 넣었다.
결과: APPROVED 이벤트는 최종 승인일 때만 요청자를 수신자로 고르며, 다음 단계 승인자를 선택하지 않는다.
영향: 댓글 알림을 끄거나 댓글 생성이 실패한 사이트에서는 새 결재자가 자신의 차례를 앱 알림으로 알 수 없다.
개선: 단계 진입 사건 또는 단계별 수신자를 명시하고 결정적 알림 키로 중복을 방지한다.
진단: R13.

R14 [P2·설계 한계] 목록과 집계의 페이지 권한 경계가 다르다

근거: src/resolver/inbox/InboxService.js:330
      src/resolver/notification/NotificationService.js:295
      static/ui/src/features/inbox/InboxFilters.jsx / filter.countBeforePermission
결과: 목록은 filterVisiblePages를 적용하지만 상태 건수·내 차례 건수·미읽음 건수는 페이지 가시성을 다시 좁히지 않는다.
영향: 목록이 0개인데 배지는 양수일 수 있다. 제목/요청자 조건에 따른 count 차이로 비가시 요청의 존재를 추정할 여지도 있다.
주의: 화면에 '권한 필터 전 건수'를 알리는 tooltip이 있으므로 의도된 근사 집계다. 이를 신규 권한 우회나 전체 데이터 유출로 단정하지 않는다.
개선: 가시 범위 집계 또는 정확한 전체 건수로 오해하지 않는 표시를 선택해야 한다. 민감 데이터에서는 존재 정보 노출 허용 여부를 별도 결정한다.
진단: R14는 집계 경로가 permissionFilter를 호출하지 않는 사실을 확인한다.

R15 [P2] 요청 폼에서 21번째 승인 그룹부터 선택할 수 없다

근거: src/resolver/directory/ApprovalGroupRepository.js:7, 58, 62
      src/resolver/approval/ApprovalService.js:520
재현: 그룹 21개가 저장된 Repository로 요청 기본값을 조회했다.
결과: list({})의 첫 20개 items만 가져오고 hasMore/nextCursor를 버린다.
영향: 설정 화면에서는 존재하는 그룹이 요청 폼에는 나타나지 않는다. 앞 20개에 비활성 그룹이 많으면 표시되는 활성 그룹은 더 적어진다.
개선: 요청 폼에 그룹 검색·페이지 이동을 연결하거나 충분한 예산 안에서 활성 그룹 페이지를 끝까지 수집한다.
진단: R15.

R16 [P2] 개인정보 보고 대상 수집에서 저장 위치 일부가 빠진다

근거: src/resolver/privacy/PrivacyReporter.js:26, 101, 109
      src/resolver/directory/ApprovalGroupRepository.js:86
      src/resolver/retention/RetentionService.js:120, 185
결과: 커스텀 승인 그룹의 member_keys JSON에 저장한 accountId는 ACCOUNT_SOURCES나 KVS registry 수집에 없다.
      export session.owner와 lastExport.by도 수집 대상이 아니다. 해당 위치에만 존재하는 사용자는 보고되지 않는다.
영향: 계정 정보가 폐쇄된 뒤에도 그룹에 남아 새 결재 후보로 확장될 수 있다. 보관 세션에는 TTL/정리 경로도 없어 owner가 계속 남는다.
개선: 저장 위치별 inventory를 완성하고 JSON/KVS 저장분의 보고·정리 경계를 명시한다.
      이 항목은 코드의 수집 완전성 결함을 뜻하며 법률 준수 여부 전체에 대한 판단은 아니다.
진단: R16은 그룹 저장소가 스캔에서 누락되는 점을 확인. 보관 KVS는 코드 대조.

R17 [P2] 스윕의 내부 예산이 Forge 실행 제한보다 길고 배치 내부에서 확인하지 않는다

근거: src/resolver/approval/ExpiryService.js:21, 201, 207
      manifest.yml:138 / runSweep에 timeoutSeconds 없음
      src/trigger/runSweep.js / 만료 처리 후 개인정보 보고 순서
공식 규약: scheduled trigger의 기본 timeout은 55초이며 timeoutSeconds로 연장할 수 있다.
재현: 50건 한 배치의 각 처리에 가상 2초를 부여하면 expireDue가 100초를 사용한 뒤에야 60초 예산을 확인한다.
영향: 큰 배치에서 Forge가 먼저 종료하면 알림·보관 정리·개인정보 보고까지 도달하지 못한다.
      SQL 처리 중 종료가 R02/R04의 부분 저장 문제를 더 쉽게 유발할 수 있다.
개선: 실제 invocation 잔여 시간 기준으로 각 항목 사이에서 멈추고 continuation을 남긴다.
      timeoutSeconds 조정만으로는 단일 느린 배치·무한 후보·후속 처리 예산 문제를 해결하지 못한다.
공식 근거: https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/
진단: R17. 실제 Forge timeout을 발생시킨 것은 아니며 공식 한도와 가상 시간 실험의 대조다.

R18 [P2] 반려 사유를 선택 사항으로 설정해도 UI가 빈 사유를 막는다

근거: static/ui/src/features/detail/DecisionForm.jsx:14, 66, 68
      static/ui/src/entries/modal.jsx:181
      src/resolver/approval/ApprovalService.js / rejectionReasonRequired 적용
결과: 서버는 유효 정책의 rejectionReasonRequired=false를 허용하지만 UI는 rejecting이면 항상 isRequired와 필수 validate를 적용한다.
영향: 관리자 설정을 꺼도 실제 사용자는 사유 없이 반려할 수 없다.
개선: 유효 정책을 상세 DTO에 포함해 서버와 UI가 같은 조건을 사용하게 한다.
확인 방식: 코드 대조. 별도의 브라우저 조작 재현은 하지 않았다.

이전 검토와 비교

2026-10-08 경험 기록의 미해결 항목을 현재 코드로 재확인했다. 이번 목록을 전부 새로 생긴 회귀로 해석하면 안 된다.
현재 코드에서 확인한 개선은 다음과 같다.
- getRequestDefaults의 pageLoader 호출과 requestId/pageId 일치 검사.
- 업무함 req_rev 역행 방지 및 권한 필터로 빈 페이지가 생겼을 때 커서 유지.
- 영역 요청의 공통 prepareRequest를 통한 승인 그룹 확장·스페이스 활성 검사.
- PIN 실패 횟수의 원자적 reserveAttempt 도입. 과거의 단순 read-modify-write 카운터 결함을 현재 결함으로 다시 보고하지 않았다.
- SignatureService의 페이지/요청 범위 검사, 위임 업무함 범위를 myturn으로 제한, invocation/installation 캐시 경계.
- 보관 내보내기의 UUID 변환 및 서버에 기록한 export ID manifest.

수정 순서 제안

1. R01~R04를 하나의 동시성·복구 설계로 해결한다. 승인, 반려, 회수, 만료, 재상신의 경합과 모든 저장 단계의 장애를 함께 검증한다.
2. R05~R08을 요청의 유효 정책과 결정 대상 검증 경계로 묶는다. 개별 승인·일괄 승인·페이지·영역이 같은 검사를 사용해야 한다.
3. R10의 Flow 원본 보존을 보완한다.
4. R11~R13·R17의 알림 저장·재개·시간 예산을 함께 정리한다.
5. R09·R15·R18은 작은 수정으로 바로 완화할 수 있다. R14는 의도한 집계 노출 정책을 먼저 명확히 하고, R16은 저장 위치를 전수 대조한다.

진단 재실행

저장소 루트에서:
npx jest --runInBand --testRegex audit.repro.js --runTestsByPath _workspace/deep-audit-2026-10-28/audit.repro.js

진단 파일은 결함의 재현을 기대한다. 수정 후에는 올바른 결과를 기대하는 회귀 테스트로 바꿔 실제 test 디렉터리에 편입해야 한다.

최종 검증 결과

- npm test -- --runInBand: 35 suites / 249 tests 통과.
- npm run test:ui -- --runInBand: 16 suites / 91 tests 통과.
- 진단: 1 suite / 18 tests 통과. 상세 실행 결과는 repro-results.json.
- npm run build:ui: 성공. 기존 Atlaskit CSS의 postcss-calc 경고 1건. settings 엔트리 91.83 kB gzip.
- forge lint: exit 0, No issues found. CLI 14.2.0의 업데이트 안내가 있었으나 이번 작업에서 CLI는 변경하지 않았다.
- npm audit --omit=dev: backend 0건, frontend 0건. 원문은 backend-audit.json / frontend-audit.json.
- 최종 git status --porcelain: 출력 없음. 추적되는 제품 소스 변경 없음.
- 저장한 산출물은 Git 제외 경로 _workspace/deep-audit-2026-10-28 및 사용자 지정 경험 Vault에 있다.
