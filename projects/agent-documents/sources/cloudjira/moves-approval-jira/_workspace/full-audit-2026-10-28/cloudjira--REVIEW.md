# Moves Approval for Jira 전수 점검 보고서

작성: 2026-10-28 · 대상: `C:\CloudJira\moves-approval-jira` · 분석 전용, 제품 코드 수정·커밋·배포 없음.

## 결론

권한 경계, 도메인 분리, 계약 테스트, 유휴 SQL 비용 관리 등 기본 구조는 잘 갖춰져 있다. 그러나 **결정 원본·요청 상태·업무함·감사 이벤트를 여러 번에 나눠 저장하는 경로에서 동시 실행과 중간 실패를 수습하는 장치가 부족하다.** 승인 제품에서 가장 중요한 “누가 무엇을 결정했고 최종 결과가 무엇인가”가 어긋날 수 있다는 점을 먼저 해결해야 한다.

기존 테스트 4,042건이 모두 통과했지만, 별도 진단에서 문제 동작 12건을 재현했다. 이는 테스트가 무의미하다는 뜻이 아니라, 정상 순서와 개별 함수 검증에 비해 **서로 다른 요청의 실행 순서·저장 중간 실패·부분 조회·경계 간 계약** 검증이 부족하다는 뜻이다. 이 보고서의 P1 항목을 해결하기 전에는 상용 확대를 권하지 않는다.

## 기준과 한계

- 시작 기준은 `master / 6818bfc`. 검사 중 외부 변경으로 HEAD가 `d9e5351`이 됐다. 차이는 `cert.query` BADGE의 actor Jira 열람 재검사 제거, 관련 테스트, `CLAUDE.md` 설명의 세 파일이었다. 새 정책과 변경 내용을 대조하고 변경 테스트 24건·백엔드 번들 로드를 다시 검증했다. 기존 발견은 이 변경으로 해소되지 않았다.
- 전체 파일 목록·진입점·설정·검증 체계를 살펴보고, 승인 엔진, 권한·라이선스, 워크로그 승인·통제, 타임시트, 상태 변경, 채널, 업무함·알림, 보관·내보내기, 운영 설정과 CI의 위험 경로를 중점 추적했다. “전수”는 저장소 전체 범위의 점검을 의미하며 모든 줄·모든 실행 조합의 무결성을 증명했다는 의미는 아니다.
- Forge 실서비스 DB 경합, staging/production 설치, 유료 webtrigger 컨텍스트, 실브라우저의 화면·접근성·모바일은 이번에 실측하지 않았다. UI 개선 제안은 코드와 흐름을 근거로 한다.
- 진단 테스트는 실제 도메인·서비스·저장소 코드를 실행하되 SQL/Jira/KVS의 응답과 실행 순서를 주입했다. 테스트 PASS는 **현재의 문제 동작 재현 성공**이다. 실DB에서 같은 경합을 재현했다는 뜻은 아니다.
- P1: 승인 판정·범위·복구·계약에 영향을 주므로 상용 확대 전에 수정. P2: 업무·감사·사용성의 신뢰도를 떨어뜨리므로 다음 안정화에 포함. 실제 고객 사고나 데이터 유출을 확인한 것은 아니다.

## 확인된 문제

| ID | 우선순위 | 문제 | 근거 수준 |
|---|---|---|---|
| R01 | P1 | 동시 승인·반려 후 결정 원본은 반려인데 요청은 승인으로 종료 | 실제 저장소 코드의 경합 순서 주입 |
| R02 | P1 | 결정 저장 뒤 실패하면 동일 요청 재시도로 완료되지 않음 | 이벤트 저장 실패 주입 |
| R03 | P2 | 업무함 상태가 과거 리비전으로 돌아가고 기결정자가 내 차례에 남음 | 실제 생성 SQL 검증·조회 조건 대조 |
| R04 | P2 | 회수에 실패해도 CANCELLED 감사 이벤트가 남음 | CAS 패배 주입 |
| R05 | P1 | 워크로그 내용 변경에 따른 기존 요청 만료가 거부됨 | 실제 만료 함수와 호출부 계약 대조 |
| R06 | P2 | 다음 단계가 열릴 때 새 결재자에게 앱 내 알림이 없음 | 실제 수신자 선택 함수 실행 |
| R07 | P1 | 통제 복구 대상이 200건 이상이면 첫 묶음만 반복 | 실제 워커 반복 실행·조회 SQL 대조 |
| R08 | P1 | 결재선 프로젝트 교체 실패가 적용 범위를 전체로 넓힘 | DELETE 이후 INSERT 실패 주입 |
| R09 | P1 | 채널과 공통 라이선스 가드의 비활성 판정이 다름 | 서명된 채널 요청 실행, 운영 컨텍스트는 미실측 |
| R10 | P1 | 테이블 확인 장애가 승인 validator 통과로 바뀜 | 실제 테이블 프로브·validator에 SQL 장애 주입 |
| R11 | P2 | 권한 확인 장애가 정상적인 빈 업무함으로 표시됨 | 실제 업무함 서비스에 장애 주입 |
| R12 | P1 | 그룹 멤버 일부만 읽고도 전원 승인 명부로 사용 | 두 번째 페이지 403 주입·그룹 확장 실행 |

### R01. 동시 승인·반려에서 원본 결정과 최종 상태가 불일치

한 단계에 a·b가 있고 1명 승인으로 통과하는 상황에서, 두 요청이 같은 초기 상태를 읽는다. a의 APPROVE와 b의 REJECT가 각각 저장된 뒤 a의 aggregate CAS가 먼저 성공하면 요청은 APPROVED가 된다. b가 다시 읽을 때는 이미 종료된 상태라 재계산을 중단한다. 진단 결과는 `저장 status=APPROVED`, `deriveStatus(결정 원본)=REJECTED`였다.

개별 결재자의 `PENDING` 조건부 UPDATE는 중복 결정을 막지만 **요청 전체의 상태·세대와 결재자 결정을 함께 묶지는 않는다.** 이후 상태 변경 자동 적용 같은 후속 동작이 먼저 실행될 수 있어 단순 화면 오류보다 영향이 크다. 다인 결재선을 사용하는 공통 엔진 경로가 대상이다.

근거: [claimDecision](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:524), [decideReady](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:629), [종료 상태 재조회 분기](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:696).

수정 방향: 요청 단위의 결정 수락·최종 확정 순서를 보장하고, 결정 수락 시 parent 상태·세대를 함께 확인해야 한다. 이미 수락한 결정은 최종 판정에 반드시 반영되어야 한다. 단순 CAS 재시도 횟수 증가는 해결책이 아니다. 최종 확정 전에는 외부 적용을 실행하지 않는 기준도 필요하다.

### R02. 결정 저장 후 부분 실패를 멱등 재시도가 복구하지 못함

`claimDecision → appendEvent → casAggregate → updateProjection` 중 이벤트 INSERT가 실패하면 결재자 행만 APPROVE가 된다. 같은 사용자가 재시도하면 도메인이 “이미 승인함”으로 판단하고 `result.idempotent`에서 조기 반환한다. 진단에서는 요청은 PENDING, 결정 원본의 파생 상태는 APPROVED, 감사 이벤트는 빈 목록으로 남았다.

동일 요청 재시도만으로는 회복되지 않으며, 종료 상태까지 갱신된 뒤 projection에서 실패한 경우도 별도 복구가 필요하다. 최근 추가된 DRAFT 청소는 생성 중 실패를 처리하며 이 결정 중 실패를 해결하지 않는다.

근거: [멱등 반환과 저장 순서](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:645).

수정 방향: 멱등 응답 전에 미완료 이벤트·aggregate·projection을 수렴시킨다. 반려 사유·대리 결정자처럼 이벤트에만 있는 정보도 재구성할 수 있도록 결정 작업 기록을 내구성 있게 남겨야 한다. SQL 지원 제약 안에서 작업 상태·outbox·복구 커서를 설계하고 각 저장 단계 직후 중단을 검증한다.

### R03. 업무함 투영의 리비전 역행과 잘못된 내 차례

`updateProjection`은 전달받은 `req_rev`를 저장하지만 WHERE에 세대 비교가 없다. rev 3의 종료 투영 뒤 지연된 rev 2 투영이 도착하면 다시 열린 요청처럼 표시할 수 있다. 또한 `my_turn` 계산은 단계와 role만 확인하며 이미 결정했는지 보지 않는다. 여러 명 전원 승인의 중간 결정에서는 이미 승인한 사람도 내 차례로 남을 수 있다. `myturn` 조회 역시 `my_decided=0`을 요구하지 않는다.

근거: [업무함 갱신 SQL](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:583), [탭 조건](C:/CloudJira/moves-approval-jira/src/resolver/inbox/InboxRepository.js:10).

수정 방향: 원본 요청의 확정된 리비전으로만 투영하고 이전 리비전의 덮어쓰기를 차단한다. 내 차례는 해당 단계의 미결정 원본으로 계산한다. 조회 필터만 추가하면 리비전 역행과 count 불일치는 남으므로 갱신·목록·배지를 함께 확인해야 한다.

### R04. 성공하지 않은 회수·만료의 감사 이벤트가 남음

`cancel`과 `closeBySystem`은 상태 CAS보다 먼저 이벤트를 기록한다. 진단에서 회수 CAS가 다른 승인의 완료에 밀려 실패하자 최종 상태는 APPROVED인데 CANCELLED 이벤트가 남았다. 회수 이벤트가 “시도”가 아닌 실제 상태 전이처럼 표시되면 감사·증명서 해석이 어긋난다.

근거: [시스템 종료](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:944), [회수](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalRepository.js:999).

수정 방향: 시도와 확정 이벤트를 구분하거나 작업 기록과 최종 확정을 결속한다. INSERT를 단순히 CAS 뒤로 옮기기만 하면 반대 방향의 장애에서 이벤트 유실이 생기므로 R02와 함께 해결해야 한다.

### R05. CONTENT_CHANGED 만료 호출과 도메인 허용 사유가 불일치

워크로그 어댑터와 자동 요청은 `CONTENT_CHANGED`로 기존 요청을 만료시키지만, 공통 `expireForTarget`이 호출하는 `expireByTargetChange`는 이 사유를 허용하지 않는다. 실제 반환값은 `{ok:false, reason:'bad reason'}`다. 내용이 바뀐 오래된 승인 요청이 PENDING을 유지하면서 새 자동 요청을 `ALREADY_OPEN`으로 막을 수 있다. 오래된 내용을 그대로 승인하는 것이 아니라, 결재는 거부되는데 요청 정리가 안 되는 문제다.

근거: [워크로그 결정 전 검사](C:/CloudJira/moves-approval-jira/src/resolver/approval/target/WorklogCertificationTargetAdapter.js:82), [자동 요청의 만료 호출](C:/CloudJira/moves-approval-jira/src/resolver/worklogCertification/WorklogRequestService.js:244), [공통 연결](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:769), [허용 사유](C:/CloudJira/moves-approval-jira/src/domain/approval/transitions.js:210).

수정 방향: 기존 내용 변경용 전이와 연결하거나 사유 계약을 일치시킨다. 호출 여부만 검사하는 mock 테스트 대신 실제 만료 전이를 거쳐 dedupe 해제·재요청까지 검증한다. 수정 범위가 작고 효과가 커서 먼저 처리하기 적합하다.

### R06. 다음 단계의 시작 알림이 없음

요청 생성 시 모든 단계의 승인자에게 알리지만, 중간 APPROVED 이벤트는 최종 승인이 아니면 수신자를 빈 목록으로 만든다. 1단계가 끝나고 2단계가 열렸을 때 새 차례 결재자가 받는 앱 내 알림이 없다. 최초 알림이나 이후 독촉에 의존하게 되어 다단계 결재의 지연을 유발한다. 모든 알림 채널이 없다는 주장은 아니며, 확인 범위는 앱 내 알림이다.

근거: [수신자 선택](C:/CloudJira/moves-approval-jira/src/resolver/notification/NotificationService.js:57).

수정 방향: 새 단계 개방을 명시적인 알림 사건으로 처리하고, `requestId + 단계 + 개방 세대`로 중복을 막는다. 최초 요청은 현재 차례와 향후 참여 안내를 구분하는 편이 이해하기 쉽다.

### R07. 워크로그 통제 증분 복구의 200건 경계에서 진전이 멈춤

조회가 200건으로 가득 차면 `confirmScanAt`을 유지하지만 페이지 안에서 어디까지 처리했는지는 저장하지 않는다. 다음 실행도 같은 since와 LIMIT로 처음부터 읽는다. 두 번 실행한 진단에서도 같은 첫 200개만 재평가했다. 관련 SQL의 타임시트 쪽 조회에는 안정된 정렬도 없다.

이 경로는 결정 직후 동기 훅을 놓친 변경을 메우는 복구 경로다. 따라서 “200번째 이후의 모든 정상 승인이 실패한다”는 뜻은 아니지만, 부하·일시 장애 때 필요한 복구가 뒤쪽 기록에 도달하지 못할 수 있다.

근거: [증분 조회](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlRepository.js:533), [워커](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlWorker.js:561).

수정 방향: 고정된 조회 상한 시각과 `(updated_at, id)` keyset 커서를 함께 저장한다. 두 원천의 커서를 구분하고, 전체 완주 뒤에만 상위 watermark를 전진시킨다. 199·200·201건, 같은 timestamp 다수, 처리 도중 신규 변경을 검증한다.

### R08. 결재선 설정 저장 실패가 적용 범위를 넓힘

프로젝트 매핑을 전부 DELETE한 뒤 하나씩 INSERT한다. 첫 INSERT가 실패하면 제한 목록이 비는데, 조회 SQL은 매핑이 없는 결재선을 모든 프로젝트 공용으로 해석한다. 저장 실패가 기존 설정 유지가 아니라 적용 범위 확대로 바뀐다. 실패가 없어도 DELETE와 INSERT 사이의 읽기 창이 존재한다. 단계 교체도 DELETE 후 INSERT여서 실패 시 결재선 단계가 비거나 일부만 남는 유사 위험이 있다.

근거: [프로젝트 교체](C:/CloudJira/moves-approval-jira/src/resolver/flow/FlowRepository.js:186), [빈 매핑의 전역 해석](C:/CloudJira/moves-approval-jira/src/resolver/flow/FlowRepository.js:248), [단계 교체](C:/CloudJira/moves-approval-jira/src/resolver/flow/FlowRepository.js:311), [프로젝트가 rev CAS 밖인 서비스](C:/CloudJira/moves-approval-jira/src/resolver/flow/FlowService.js:229).

수정 방향: 새 세대의 설정을 완성한 뒤 현재 세대를 한 번에 전환한다. 명시적인 전체 프로젝트 설정과 매핑 부재·미완료를 구분해야 한다. 실패하면 기존 유효 설정이 남도록 만들고 동시 관리자 저장도 함께 검증한다.

### R09. 채널의 라이선스 계약이 공통 가드와 다름

공통 가드는 `context.license.active`를 읽고 운영 환경에서 컨텍스트가 없으면 License API를 확인한다. 채널은 `isActive === false`만 검사하며 같은 fallback이 없다. `license:{active:false}`를 넣은 서명된 요청에서 공통 가드는 INACTIVE였지만 채널 handler는 실행되고 200을 반환했다.

근거: [채널](C:/CloudJira/moves-approval-jira/src/resolver/channel/ChannelServer.js:147), [공통 가드](C:/CloudJira/moves-approval-jira/src/utils/license/LicenseGuard.js:141). 공식 resolver 컨텍스트에도 `active`가 정의돼 있다. 다만 이것으로 webtrigger의 운영 컨텍스트 형태까지 확정할 수는 없다. [Atlassian resolver 문서](https://developer.atlassian.com/platform/forge/runtime-reference/forge-resolver/)

수정 방향: 공통 라이선스 판정 계약을 사용하고, 명시적 비활성·판정 불가·개발 환경·컨텍스트 부재를 같은 기준으로 처리한다. 연결 해제 등 유지보수 예외는 별도로 유지한다. **운영에서 실제 유료 기능 우회가 발생했다고 단정하지 않는다.** RELEASE_GATE B2의 유료 설치 실측을 끝내야 한다.

### R10. SQL 장애가 validator의 승인 없는 통과로 바뀜

`TableReadiness`는 테이블 존재 확인 중 모든 SQL 오류를 false로 바꾼다. validator는 이 false를 설치 미완료로 간주하여 PASS_NOT_READY를 반환하고 후보 조회 오류도 버린다. 활성 규칙이 있는 상황에 SQL 장애를 주입한 진단에서 `validate`는 `{result:true}`였다.

이는 기존 테스트도 허용하는 설계다. 마이그레이션 전 상태를 유예하려는 의도는 이해되지만, **테이블 부재와 일시적 DB 장애가 같은 통과 사유가 되는 것**은 승인 경계에 부적합하다. 이미 준비 캐시·스키마 표식이 있으면 이 프로브를 생략하므로 모든 DB 장애가 이 결과를 내는 것은 아니다.

근거: [프로브 오류 흡수](C:/CloudJira/moves-approval-jira/src/rdb/schema/TableReadiness.js:82), [후보 오류보다 앞선 통과](C:/CloudJira/moves-approval-jira/src/resolver/transition/TransitionValidatorService.js:182), [PASS_NOT_READY](C:/CloudJira/moves-approval-jira/src/domain/transition/judge.js:68).

수정 방향: READY / MISSING / UNAVAILABLE을 구분한다. 활성 규칙이 있는데 판정 자료를 읽을 수 없으면 REJECT_UNAVAILABLE로 처리한다. 설치 직후 유예가 필요하다면 설치 상태를 명시적으로 판단하는 별도 정책으로 분리한다.

### R11. 권한 조회 장애와 실제 빈 업무함을 구별할 수 없음

권한 필터 예외를 null로 바꾸고 모든 행을 숨긴 다음, 정상 페이지처럼 `{items:[], hasMore:false, nextCursor:null}`을 반환한다. 데이터가 새어나가지는 않지만 사용자는 일할 항목이 없다고 오인한다. 부분 실패에도 스캔 커서가 전진하면 그 페이지에서 확인 못 한 항목을 건너뛴다.

근거: [권한 필터 및 커서 처리](C:/CloudJira/moves-approval-jira/src/resolver/inbox/InboxService.js:290).

수정 방향: fail-closed는 유지하면서 조회 미완료를 명시하고 재시도할 수 있게 한다. 장애가 난 페이지의 커서를 안전하게 보존한다. count 쪽의 incomplete 처리와 목록 계약을 맞추면 화면·배지의 서로 다른 표현도 줄일 수 있다.

### R12. 일부 그룹 멤버만으로 전원 승인 조건이 만들어짐

Jira 그룹 조회는 200이 아닌 응답을 만나면 루프를 종료하고 지금까지 모은 구성원을 반환한다. 전원 승인 그룹은 그 배열 길이를 `requiredApprovals`로 사용한다. 첫 페이지 뒤 403을 주입했을 때 오류 없이 첫 페이지 인원만으로 전원 승인 단계가 만들어졌다. 20페이지 상한에 도달해도 완주 여부를 검사하지 않는 같은 문제가 있다. 첫 페이지부터 권한이 없으면 빈 목록으로 거부되지만 **중간 페이지부터 실패한 경우**가 빠져 있다.

근거: [그룹 페이지 조회](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:135), [전원 승인 수 계산](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:529).

수정 방향: 결재자 명부는 완전한 조회가 확인됐을 때만 사용한다. 중간 오류·응답 형식 불명·상한 도달은 명부 미확정 오류로 거부하고, 그룹 크기 상한을 설정 화면에서 설명한다. 참조(CC)의 best-effort 확장과 승인 명부의 계약을 분리한다.

## 추가 정적·운영 위험

### D01. 의존성 보안 업데이트가 필요함

`npm audit --omit=dev --json` 결과는 다음과 같다. 숫자는 취약한 패키지 항목 수이며 독립된 CVE 수나 실제 공격 경로 수가 아니다.

| 범위 | Critical | High | Moderate |
|---|---:|---:|---:|
| 백엔드 | 0 | 3 | 0 |
| UI | 1 | 10 | 3 |

백엔드는 `brace-expansion`, `fast-uri`, `undici`가 포함됐다. UI에는 `dompurify@3.4.16`, `@forge/bridge`, `prosemirror-view`, `markdown-it` 및 여러 전이 의존성이 포함됐다.

Critical로 나온 DOMPurify advisory는 비기본 `SAFE_FOR_TEMPLATES`, DOM 반환 방식, shadow root, 후속 템플릿 처리 같은 조건을 요구하며 수정 버전은 3.4.17이다. 현재 앱 PDF 생성 경로는 `html2canvas → jsPDF.addImage`이고 이 취약 조건을 사용하는 코드를 확인하지 못했다. 따라서 **의존성 조치는 필요하지만 앱 XSS가 재현됐다는 결론은 아니다.** [DOMPurify 유지관리자 advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7), [PDF 경로](file:///C:/CloudJira/moves-approval-jira/static/ui/src/features/certificate/exportCertificatePdf.jsx%3A25)

직접 의존성과 전이 의존성을 나눠 호환되는 패치부터 적용하고, 표·에디터·PDF·Excel 내보내기를 확인해야 한다. audit 제안에는 major 변경과 ExcelJS 하향 제안도 있으므로 `audit fix --force`를 일괄 적용하지 않는다.

### D02. 50건 일괄 승인에 전체 실행 시간 제한이 없음

[bulkApprove](C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalService.js:843)는 최대 50건을 직렬로 처리한다. budget을 후속 적용 훅에 넘기지만 본체 루프는 남은 시간을 확인하지 않는다. UI 호출 resolver의 실행 한도는 25초이므로 SQL·권한 조회가 느리면 일부는 저장되고 응답은 끊길 수 있다. 실제 50건의 운영 지연은 측정하지 않았으므로 발생 빈도는 미확정이다. [Atlassian 실행 한도](https://developer.atlassian.com/platform/forge/limits-invocation/)

완료·실패·미처리 항목을 구분하는 응답, 전체 deadline, 이어서 처리할 커서나 비동기 작업이 필요하다. 사용자는 전체를 다시 눌러야 하는 대신 미처리분만 이어갈 수 있어야 한다.

### D03. 통제 상태의 KVS 읽기-수정-쓰기는 동시 갱신을 보장하지 않음

[WorklogControlState.update](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlState.js:114)는 읽은 값과 변경값의 generation 최댓값을 구한 뒤 blind set한다. 두 호출이 같은 구세대를 읽으면 늦은 쓰기가 먼저 완료된 새 상태를 덮을 수 있다. “겹쳐도 큰 쪽이 남는다”는 주석은 저장소 동작으로 보장되지 않는다.

또한 [워커의 hasWork → clearPending](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlWorker.js:670) 사이에 새 작업이 표식을 세우면 이전 워커가 이를 지울 수 있다. 통제가 활성화된 경우에는 표식을 유지하므로 모든 실행에 적용되는 위험은 아니다. 이번에는 실제 KVS 경합을 재현하지 않았다.

세대 조건부 쓰기, 표식 토큰에 대한 조건부 삭제, 작업 원장과 다시 깨우는 방식의 결속을 검토한다. 새 주기 스케줄을 무조건 늘리기보다 기존 큐·일일 fan-out 안에서 해결하는 것이 현재 비용 정책에 맞다.

## 제품에서 아쉬운 점과 개선 제안

1. **관리자의 문제 처리함이 필요하다.** NEEDS_APPROVER, SUBMISSION_FAILED, 적용 UNKNOWN, 오래된 복구 대기 등을 각각의 설정·상세 화면에서 찾아야 한다. 원인, 담당자, 마지막 시도, 다음 동작을 한 곳에서 보여 주면 운영자가 개발자 로그 없이 처리할 수 있다. 관리자 NEEDS_APPROVER 목록은 RELEASE_GATE D4에도 남아 있다.
2. **“기능을 켰다”와 “실제로 보호된다”를 구분해야 한다.** 상태 변경 규칙 저장과 Jira workflow validator 연결은 별개다. 프로젝트별 설치·규칙·validator 관찰·권한·최근 실제 검증 결과를 묶은 적용 상태가 필요하다. 미연결·미관찰을 정상으로 보이게 하지 않는다.
3. **승인 결과와 후속 처리 상태의 관계를 더 쉽게 설명해야 한다.** 승인됨, Jira 적용 중·실패·불명확, 워크로그 제한, 연동 반영은 서로 다른 사실이다. 사용자에게 관련 상태와 다음 행동을 가까이 보여 주고, 단순한 성공 배너로 모든 과정이 끝난 듯 보이지 않게 한다. 최근 업무함 완료 상태 문구 개선은 유지할 가치가 있다.
4. **부분 실패를 제품 계약으로 다뤄야 한다.** R11의 빈 결과, 일괄 결정 중단, 일부 그룹 조회, 연동 `complete:false`를 일관된 “일부 확인 불가·재시도” UX로 연결한다. 성공·빈 결과·권한 없음·판정 불가는 서로 달라야 한다.
5. **관리 설정의 층위와 출처를 요약해 주면 이해가 쉬워진다.** 사이트 기본값, 프로젝트 예외, 이슈 예외, 연동 정책이 겹친다. 실제 적용값 옆에 값의 출처를 보여 주고 고급 통제·진단은 단계적으로 펼친다. 정책 미리보기로 “이 사람의 이 워크로그는 왜 수정할 수 없는가”를 설명하면 문의가 줄어든다.
6. **실브라우저 검증을 출시 증거로 남겨야 한다.** iframe 모달, 키보드 포커스, 긴 한영 문구, 좁은 화면, 사용자 시간대와 정책 시간대, PDF·Excel을 대표 시나리오로 검증한다. 이번에 화면을 실제 조작하지 않았으므로 시각·접근성 결함을 확정하지는 않았다.
7. **큰 서비스·화면을 실패 경계 기준으로 분리하면 유지보수가 나아진다.** 승인 저장 절차·복구·후속 적용과 UI의 조회·선택·일괄 처리·내보내기를 명확히 나누는 편이 좋다. 단순히 파일을 잘게 쪼개거나 언어를 바꾸는 것보다 계약·실패 책임을 먼저 정한다.

## 잘 유지해야 할 부분

- `guardedDefine + PermissionMap + CONTROLLER_REGISTRARS`의 계약 검증, 기본 asUser와 사유가 제한된 asApp 경계.
- 숨김 워크로그의 서버 소유자·팀 범위, 응답 원본 재대조, 조회자 이슈 권한 재검사. 최신 `cert.query` BADGE 정책은 승인 앱 화면의 권한 모델과 구분해 평가했다.
- 빈 `whereIn`의 fail-closed 처리, 도메인의 시간 주입, query key 팩토리, PIN 해시·시도 횟수 동시성 방어.
- 라이선스 비활성에서도 관리자 통제 해제를 열어 두는 복구 경로. 설정 화면이 LicenseGate 때문에 전부 막힌다는 가설은 확인 후 제외했다.
- 내보내기 후 보관 정리의 세션 소유자·대상·시각 검증, 외부 적용 UNKNOWN의 무조건 재실행 방지.
- 일일 스윕과 큐 fan-out, 빈 상태 SQL 비용 계약, `check:bundle`을 통한 순환 import 기동 검증.

## 검증 결과

| 검증 | 결과 | 범위·주의 |
|---|---|---|
| `npm test -- --runInBand` | 201 suites / 3,041 tests 통과 | 시작 HEAD 기준 전체 백엔드·계약 |
| `npm run test:ui -- --runInBand` | 105 suites / 1,001 tests 통과 | 전체 UI |
| 별도 재현 검사 | 3 suites / 12 tests 재현 성공 | 수정 후 기대값이 아닌 현재 문제 동작을 확인 |
| 최신 채널 handler 검사 | 1 suite / 24 tests 통과 | 검사 중 유입된 `d9e5351` 변경 재검증 |
| `npm run check:bundle` | 통과 | 시작 및 최종 HEAD에서 확인 |
| `npm run build:ui` | 성공, 경고 있음 | Atlaskit·marklassian source map 누락, react-select CSS 계산식 경고 |
| `forge lint` | No issues found | CLI 14.2.0 → 15.0.0 업데이트 권고가 별도 표시됨 |
| `npm audit --omit=dev` | 취약 의존성 발견 | 상세 D01. 자동 수정 미수행 |

UI 빌드 경고는 현재 외부 의존성에서 나온다. 현재 파이프라인은 이를 이유로 빌드 단계 전체에 `CI=false`를 쓰므로 향후 다른 경고도 함께 허용한다. 알려진 경고만 관리하고 새로운 경고는 식별할 수 있는 방식이 더 낫다. CI에는 보안 감사·의존성 업데이트와 장애/경합 회귀 검증을 추가하되 단순 테스트 개수 증가는 목표로 삼지 않는다.

`_workspace/RELEASE_GATE.md`의 B 항목은 **13개 중 12개가 문서상 미완료**, B6만 dev 완료로 표시돼 있다. production URL·유료 컨텍스트·재설치·혼합 버전·KVS 원자성·Automation·offline impersonation·큐 재전달·team-managed·통제 staging 검증은 코드 테스트와 별도로 끝내야 한다. 문서의 미완료 표시를 실제 환경에서 실패했다는 뜻으로 해석하지 않는다. Sentry 설정 여부도 이번에 환경 변수를 조회하지 않아 미확정이다.

## 권장 처리 순서

1. **작고 명확한 계약 오류부터 차단:** R05 내용 변경 만료, R10 DB 장애 시 validator 통과, R12 부분 명부 사용, R09 채널 라이선스 일치와 실측.
2. **승인 엔진 정합성을 하나의 작업으로 해결:** R01·R02·R03·R04. 결정 수락, 확정, 이벤트, 투영, 후속 적용의 복구 기준을 먼저 정하고 저장 단계별 실패·동시 결정을 검증한다.
3. **설정과 복구의 규모 경계 보강:** R08 설정 세대 전환, R07 증분 커서, D03 상태·표식 동시성. D02 일괄 승인도 부분 처리 계약과 묶는다.
4. **사용자와 운영자의 인지 개선:** R06 다음 차례 알림, R11 조회 미완료, 문제 처리함, 보호 적용 확인. 의존성 패치와 실브라우저 회귀 검증을 함께 진행한다.
5. **상용 확대 전 플랫폼 관문 종료:** RELEASE_GATE B의 실제 환경 증거를 남긴다. 배포 버전·커밋·환경·관측 결과를 한곳에 연결한다.

## 재현 자료

- [재현 코드: 승인 엔진·복구·설정](../../tmp/full-audit-2026-10-28/engine.repro.test.js)
- [재현 코드: 채널 라이선스](../../tmp/full-audit-2026-10-28/channel.repro.test.js)
- [재현 코드: validator·업무함·그룹](../../tmp/full-audit-2026-10-28/boundary.repro.test.js)
- [재현 결과](file:///C:/CloudJira/moves-approval-jira/tmp/full-audit-2026-10-28/repro-tests.log)
- [기존 검사·감사 로그 폴더](C:/CloudJira/moves-approval-jira/tmp/full-audit-2026-10-28)

재실행:

```powershell
node node_modules/jest/bin/jest.js --config tmp/full-audit-2026-10-28/audit-jest.config.cjs --runInBand
```

보고서와 재현 자료는 저장소의 기존 ignore 대상인 `_workspace/`·`tmp/`에 있다. 원격 저장소에는 올라가지 않았다. 결함 수정 후에는 진단 테스트의 “문제 발생” 기대값을 그대로 유지하지 말고 올바른 동작을 검증하는 정식 회귀 테스트로 바꿔야 한다.
