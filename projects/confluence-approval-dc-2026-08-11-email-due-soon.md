# Confluence Approval DC C9 email 및 마감 임박 알림

## 구현

- `APR_NOTIF`에 `IN_APP`과 독립된 `EMAIL` 행을 적재하고, 사용자 존재 여부·비활성 상태·email 주소를 적재 전에 검증했다.
- email drain은 Confluence `MailQueue`와 `SingleMailQueueItem`만 사용한다. 큐 적재 완료는 실제 email 도달 성공이 아니라는 점을 코드 주석으로 남겼다.
- plain text email에 설정된 Confluence base URL 기반의 절대 페이지 URL을 포함하고, 제목·표시 이름·반려 사유에서 제어 문자를 제거했다. 사용자 locale을 읽지 못하면 한국어를 사용한다.
- 만료 sweep의 cluster 단일 실행 job에서 아직 만료되지 않은 `PENDING` 요청을 조회한다. `due-soon:<requestId>:<expiresAt epoch>` 합성 키로 수신자별 1회만 적재하며, 마감일 변경 시에는 새 알림이 허용된다.
- 마감 임박은 상태 전이가 아닌 시간 기반 파생 조건이므로 `ApprovalEventType`과 append-only 감사 로그에 추가하지 않았다.
- 설정 REST/관리 화면에 `emailNotificationsEnabled`와 `dueSoonNotificationsEnabled`를 연결했다. email을 켤 때 SMTP 기본 서버가 없으면 화면에 경고한다.

## 검증

- JDK 21 및 Maven 3.9.16으로 `mvn -B -pl approval-confluence9 -am verify` 성공.
- `approval-domain` 21건, `approval-confluence9` 34건 단위 테스트 통과.

## 인수 검증

- C9 Quick Reload 환경에서 MailQueue OSGi service 해석, SMTP 미설정 경고, 실제 큐 항목 생성 및 스케줄러의 cluster 단일 실행을 확인해야 한다.
