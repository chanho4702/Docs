# 백엔드 구현 보고

## 결과
전체 백엔드·계약 테스트: **108 suites / 1479 tests PASS**, 17.509초. `_workspace/review-hardening-2026-10-08/backend-tests.json`의 success=true와 log의 전체 PASS를 확인했다. PowerShell의 stderr 리다이렉션은 NativeCommandError로 감싸지만 Jest 실패는 없다. 빌드·배포·커밋은 수행하지 않았다.

## 실제 응답 계약
- `exportExpiredApprovals({sessionId?,cursor?,cutoff?})`: `{sessionId,cutoff,requests,approvers,events,nextCursor}`. 첫 호출은 서버 세션을 만들고 이후에는 동일 sessionId와 서버가 준 cursor를 전달한다. 가려진 페이지도 nextCursor가 있으면 계속 진행한다.
- `confirmApprovalExport({sessionId})`: 서버가 완료한 세션만 확인한다. 클라이언트 count/cutoff는 삭제 권한 근거가 아니다. 파일 생성·다운로드가 성공한 뒤 호출한다.
- `exportExpiredWorklogHistory({sessionId?,cursor?,cutoff?})`: `{sessionId,cutoff,items,users,nextCursor}`. `confirmWorklogHistoryExport({sessionId})`도 같은 계약이다. Q73에 따라 가려진 이력 행도 파일에 포함하고 삭제 허가에 포함한다.
- `getRetention`: 기존 필드에 `purgeableIsUpperBound:true`, `exportVisibilityRestricted:true` 추가. `getWorklogHistoryRetention`에는 `purgeableIsUpperBound:true` 추가. purgeableCount는 현재 사용자의 유효한 CONFIRMED 세션의 남은 후보 상한이다. 지문·현재 권한·정책을 재검사하여 실제 삭제는 더 적을 수 있다. expiredCount는 SQL 전체 만료 후보라 현재 볼 수 있는 원문 파일 건수보다 클 수 있다. 두 수의 차이를 전부 새 기록으로 설명하면 안 된다.
- `purgeExportedApprovals`: `{deleted,remaining}`, 이력은 `{deleted,mirrorsDeleted,remaining}`. 변경·권한 상실·SQL0 후보는 SKIPPED로 소비하고 새 내보내기가 필요하다.
- `getInboxCounts`: `{statusCounts,myTurnCount,incomplete}`. 현재 보이는 **고유 requestId**로 집계하며 위임 actor 중복을 합산하지 않는다. status/statuses/viewStatus는 상태 pill 집계에서 제외한다. 총 8초/20페이지 예산, 각 scan 최대10페이지이며 미완주는 하한이다.
- `getUnreadCount`: `{unread,incomplete}`. 현재 수신자의 unread SQL 범위와 현재 열람 권한을 적용한다. 최대8초/10페이지. incomplete=true인 0은 정확한 0이 아니므로 UI에서 …, 양수는 N+ 및 권한 확인/집계 미완료 안내로 표시한다.
- FieldApplyResult에 `status:'UNKNOWN',code:'TIMEOUT'`이 반환될 수 있다. 전송 직전 UNKNOWN을 저장하고 자동·수동 재PUT을 금지한다. stale APPLYING, 기존 FAILED/TIMEOUT도 UNKNOWN으로 정리한다. 화면에서 다시 적용 버튼을 숨기고 결과 확인이 필요함을 안내한다.

## 구현과 검증
PIN은 salt+rev+잠금 조건의 CAS로 실패 누적·성공 reset·변경·삭제를 선형화했다. rev 증가와 INSERT IGNORE, 실제 SQL predicate/readiness를 검증했다.

v046은 PIN rev, v047/v048은 export session/entry 테이블이다. 세션은 owner/kind/cutoff/TTL 7일/canonical cursor/정확한 저장 건수로 묶는다. entries는 전체 자료 지문 및 부모 지문, 최소 접근 상태, rev CAS를 저장한다. 임의 페이지 건너뛰기·미완주 확인·타 사용자·만료 세션은 거부한다. 확인과 정책 저장 키를 분리해 경합으로 정책이 돌아가지 않는다. 세션 정리는 기존 알림 보관 tick에 연결하고 최대2세션씩 처리한다.

APPROVAL export는 현재 목록 권한을 적용하며 TIMESHEET와 WORKLOG_CREATE는 상세 canView(state)를 추가한다. 참여하지 않은 관리자는 이슈가 보여도 원문을 받지 못한다. 원본을 받지 못한 ID는 삭제 허가에 포함하지 않는다. 부속 자료가 준비되지 않았거나 필요한 행이 없으면 STORAGE_NOT_READY로 export 완주를 막는다.

승인 삭제는 허가 ID만 대상으로 현재 FIELD_CHANGE 보호 상태까지 재검사한다. 부분 자식 삭제 후 재개는 저장한 접근 상태와 부모 세대를 사용하고 현재 Jira/팀 권한을 재검사한다. lease는 finally에서 해제하며 SQL0은 성공으로 기록하지 않는다. 이력은 현재 행 전체 지문과 observed_at 조건으로 세대를 확인하고 삭제 후 ID 재조회로 실제 남은 행은 SKIPPED 처리한다.

필드·전환·타임시트·작성 워크로그·인증 요청 metadata를 확장했다. 전환은 전용 SELECT 전체 매핑, 인증은 요청 원본 및 스냅샷, 타임시트는 routing/link/policyEvidence, 워크로그는 updatedAt를 포함한다. 이 파일은 DB 복원용 전체 dump 계약이 아니다. 인증 aggregate는 삭제하지 않으므로 그 변경은 삭제 지문에 포함하지 않는다.

24회 실패 후 페이지를 건너뛰는 drift/history 정책을 제거했다. 실패 원점과 watermark를 보존한다. 만료·임박·독촉은 keyset을 사용하고 실제 마지막 처리 원본 행의 cursor를 저장한다. 조회 전에 예산이 끝나도 restart marker를 남긴다. 5분 기존 trigger가 미완주 단계만 재개한다. scheduled sweep 공통40초 예산/단계20초/최대10페이지/건별 checkpoint를 적용하고 daily expiry와 workforce 검증은 독립 병렬 실행한다. Forge scheduled 기본55초 근거: https://developer.atlassian.com/platform/forge/limits-invocation/

회귀는 PIN 동시5실패/세대변경, export 변조·늦은ID·부분 실패·현재 권한 상실·history PK재사용 및 SQL0, 101번째 후보·실패 앞50 이후 처리·예산 cursor 재개·원점 marker·trigger continuation, 숨긴 집계/위임중복/권한 장애/수신자 범위를 포함한다.

## 파일 및 커밋 그룹
- schema 준비: `src/rdb/schema/migrate.js`, `ddl/exportSession.sql.js`, migrate 테스트.
- PIN: `src/resolver/signature/Pin{Service,Repository}.js` 및 테스트.
- field UNKNOWN: `src/domain/fieldChange/applyPlan.js`, `src/resolver/fieldChange/*` 및 테스트.
- retention: `src/resolver/retention/*`, StorageController, 각 target metadata repository, WorklogHistoryRetentionService/Repository/Controller 및 테스트, `test/helpers/exportSessions.js`.
- batch/count: ExpiryService/ApprovalRepository, drift/history recorder, runSweep/runFiveMinuteSweep, InboxService, NotificationService/Repository, JiraPermission 및 target visibility 전파, 관련 테스트.
- UI는 다음 단계에서 별도로 변경한다.

## 잔여 설계 한계
SQL 자식 변경 생산자가 부모 rev를 함께 갱신하지 않는 경로에는 지문 검사와 실제 삭제 사이의 짧은 경쟁이 남는다. 현재 부모 세대/현재 보호 상태/허가 ID/권한은 확인하지만 다중 테이블 트랜잭션 fencing을 전부 도입한 것은 아니다. 부분 실패 자체는 다시 마무리할 수 있다. UNKNOWN은 Jira 결과의 안전한 자동 확정을 제공하지 않는다. 실패한 수집 페이지는 복구될 때까지 뒤 페이지를 막을 수 있으나 영구 누락시키지 않는다. keyset 이전에 새 후보가 생기면 현재 주기 완주 후 다음 원점 주기에서 처리한다. 화면과 실제 Forge SQL/Jira 실행 환경 검증은 root 최종 검수에 남는다.


최종 검수 보강: legacy FAILED/TIMEOUT은 읽기 mapper에서도 UNKNOWN으로 정규화하고 supersede SQL 및 보관 SQL에서도 보호한다. stale/legacy 재조회가 null이면 안전하게 재조회 결과 계약으로 답한다. RetentionRepository의 기존 9개 회귀를 보존하고 readiness/legacy 보호 2개를 추가했다.
