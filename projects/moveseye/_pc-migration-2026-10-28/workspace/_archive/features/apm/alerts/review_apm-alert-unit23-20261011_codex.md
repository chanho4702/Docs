## 판정

**조건부 승인**

전이 단일화, 실제 전이 건수 집계, 전이와 outbox의 원자성, FIRED 없는 RESOLVED 방지, V77 기본 상태 제약은 의도대로 구현되었습니다. 새로운 🔴 필수 결함은 발견하지 못했습니다.

조건은 다음과 같습니다.

- 단위 2·3을 단독 배포하지 않고 단위 4~6과 함께 배포합니다.
- 실제 채널 활성화 전 단위 4에서 디스패처·재조정(reconcile)·비활성화 정책을 완성해야 합니다.
- 단위 1 검수에서 이관한 Zabbix 외부 I/O 문제도 단위 5·6 완료 조건으로 유지합니다.

## 🔴 필수

없음.

## 🟡 권장

1. 활성화가 배타 advisory lock을 획득한 뒤에는 전이도 기다립니다.

   `pg_try_advisory_xact_lock()`은 배타 잠금 획득 전의 대기열 교착을 피하지만, 일단 활성화가 잠금을 잡으면 이후 전이의 `pg_advisory_xact_lock_shared()`는 활성화 트랜잭션 종료까지 대기합니다. 따라서 “전이 경로는 절대 기다리지 않는다”는 주석은 정확하지 않습니다. [AlertChannelActivation.java:29](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:29), [ApmAlertNotificationOutbox.java:97](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:97)

   데이터 정합성은 맞지만, 활성화가 무제한 이력 테이블을 전건 검사하면서 전이를 막을 수 있습니다. 단위 6에서 전이 트랜잭션을 짧게 만들고, 단위 4에서는 활성화 시간·스캔 건수 metric을 남기는 것을 권장합니다.

2. 이미 `enabled=true`인 채널의 누락을 복구할 `reconcile`이 필요합니다.

   현재 `activate()`는 `false → true`일 때만 bootstrap하며, 이미 켜져 있으면 즉시 무동작입니다. [AlertChannelActivation.java:117](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:117)

   추정 가능한 실패 사례는 rolling deployment 중 일부 노드에만 새 `AlertChannel` 빈이 있는 상태에서 먼저 활성화하는 경우입니다. 이전 노드가 연 이벤트에는 FIRED가 생기지 않고, 배포 완료 후 다시 `activate()`해도 복구되지 않습니다. 실제 채널 활성화 전 단위 4에서 다음 중 하나가 필요합니다.

   - 이미 활성 상태여도 열린 이벤트의 누락 FIRED를 보충하는 `reconcile(key)`
   - 모든 노드 배포 완료 후에만 최초 활성화를 허용하는 명시적 운영 절차

3. 활성화 동시성 테스트에 “활성화가 먼저 배타 잠금을 잡은 경우”를 추가하는 편이 좋습니다.

   현재 테스트는 전이·삭제가 먼저 잠금을 잡은 경우와 동시 해소를 잘 고정합니다. [ApmAlertNotificationIT.java:385](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationIT.java:385)

   반대 순서에서 열기·해소가 활성화 완료 뒤 FIRED/RESOLVED를 정확히 보충하는지도 latch 기반으로 고정하면 잠금 순서 변경 회귀를 더 잘 잡습니다. `Thread.sleep()` 기반 완료 여부 검사는 환경에 따라 흔들릴 수 있으므로 `pg_locks` 또는 테스트 훅이 더 안정적입니다.

4. `@DynamicUpdate`의 핵심 목적을 직접 검증하는 동시성 IT가 있으면 좋습니다.

   현재 엔티티 변경점은 해소 필드와 `zbx_eventid`이며, 전체 열 갱신에 기대는 운영 경로는 찾지 못했습니다. 도입 방향은 적절합니다. [ApmAlertEvent.java:55](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEvent.java:55)

   다만 다음 시나리오를 실제 PostgreSQL로 고정하는 것이 좋습니다.

   - 트랜잭션 A가 오래된 이벤트 엔티티를 읽음
   - 트랜잭션 B가 해소를 커밋
   - A가 `zbx_eventid`만 붙여 flush
   - B의 `resolved_at`·`resolve_reason`이 되돌아가지 않음

   부작용은 변경 열 조합별 SQL 생성으로 statement batching·plan cache 효율이 조금 낮아질 수 있다는 정도입니다. `@Version`이 없으므로 같은 열에 대한 동시 갱신까지 해결하는 장치는 아닙니다.

5. V77 CHECK 테스트가 `attempts < 0` 거부를 고정하지 않습니다.

   스키마에는 제약이 있으므로 구현 결함은 아니지만, 테스트 설명의 “CHECK 5종”과 달리 현재 IT는 상태·전이·claim·SENT 네 종류만 직접 깨 봅니다. [V77__apm_alert_notification.sql:42](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V77__apm_alert_notification.sql:42), [ApmAlertNotificationIT.java:314](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationIT.java:314)

6. 대량 규칙 해소 시 `IN (:eventIds)` 크기 제한을 고려해야 합니다.

   전역 규칙 하나가 매우 많은 서비스 이벤트를 닫으면 RESOLVED 적재가 이벤트 수만큼 bind parameter를 만듭니다. [ApmAlertNotificationOutbox.java:75](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:75) 현재 규모에서는 문제 근거가 없으므로 🟡이지만, 장기적으로는 배열/`unnest` 또는 이벤트 조건 기반 `INSERT … SELECT`가 안전합니다.

## 단위 4~6 이관 목록

- **단위 4 — 디스패처**
  - `PROCESSING` claim token·lease·만료 재claim·CAS 결과 기록
  - 같은 `(event_id, channel)`의 FIRED가 terminal이 되기 전 RESOLVED claim 금지
  - FIRED가 DEAD/SKIPPED이면 RESOLVED도 SKIPPED
  - 만료 `PROCESSING` 조회용 `lease_until` partial index 검토
  - 비활성화는 기본적으로 **pause**로 정의하여 기존 PENDING을 유지하고 claim하지 않기
  - 영구 폐기는 별도 명령으로 분리하여 그때만 SKIPPED 처리
  - DEAD/SKIPPED 재처리 명령은 claim 필드 초기화와 FIRED→RESOLVED 순서를 함께 보장
  - 실제 활성화 호출 주체와 cluster-wide 배포 완료 조건 명시
  - 이미 활성화된 채널의 누락 FIRED를 복구하는 `reconcile(key)` 추가
  - 활성화·bootstrap 시간, 대상 수, 재시도 횟수 metric
- **단위 5 — Zabbix durable 수명주기 명령**
  - 단위 1에서 이관된 규칙 CRUD·삭제·프로비저닝의 외부 성공/DB 롤백 간 고아 문제
  - trigger→item 의존 순서와 커밋 전 명령 선적재
- **단위 6 — 평가 트랜잭션 분할**
  - 현재 평가 트랜잭션이 Zabbix I/O 동안 부모·이벤트·공유 advisory lock을 장시간 보유하는 문제
  - 이벤트 전이와 통지 INSERT는 짧은 판정 트랜잭션에 함께 유지
  - 프로비저닝 실패가 같은 회차의 다른 이벤트 전이를 롤백하지 않도록 분리

## 🟢 참고

- 운영 코드 grep 결과 `openIfAbsent()` 직접 호출은 전이 서비스 한 곳뿐이고, `ApmAlertEvent.resolve()` 직접 호출도 전이 서비스 한 곳뿐입니다. 원시 SQL 쓰기 허용 목록 검사까지 있어 단일 입구 의도가 강하게 고정되어 있습니다. [ApmAlertTransitionSingleEntryTest.java:44](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertTransitionSingleEntryTest.java:44)
- 열기는 실제 INSERT 성공(`OPENED`)일 때만 FIRED를 만들고, 해소는 `resolved_at IS NULL` 행을 잠금 재조회한 뒤 실제 닫힌 행 수만 반환합니다. 동시 해소에서 한쪽 1, 뒤쪽 0이 되는 집계가 정확합니다. [ApmAlertEventTransitions.java:58](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:58), [ApmAlertEventRepository.java:175](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:175)
- 전이 서비스가 `MANDATORY`이고 JdbcTemplate outbox가 같은 트랜잭션에 참여하므로 이벤트 전이와 통지 생성의 원자성이 성립합니다. 롤백 IT도 이를 고정합니다. [ApmAlertEventTransitions.java:46](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventTransitions.java:46)
- RESOLVED 생성 SQL은 같은 채널의 FIRED 존재를 반드시 조인합니다. 활성화 catch-up도 동일합니다. 운영 SQL에서는 FIRED 없는 RESOLVED가 생성되지 않습니다. [ApmAlertNotificationOutbox.java:80](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:80), [AlertChannelActivation.java:148](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:148)
- V77의 UNIQUE, 상태·전이·시도 수·claim·SENT CHECK와 FK CASCADE는 설계에 부합합니다. [V77__apm_alert_notification.sql:28](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V77__apm_alert_notification.sql:28)
- 개요와 홈 위젯에 `serviceDeleted`·`ruleDeleted`·`scope`가 모두 전달되며, SYSTEM의 빈 서비스가 삭제로 오인되지 않습니다. 계약 JSON과 매핑 테스트도 함께 갱신되었습니다. [ApmAlertQueryStore.java:85](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:85), [ApmWidgetAlertMappingTest.java:15](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/overview/widget/ApmWidgetAlertMappingTest.java:15)
- `AlertNotification`은 규칙·서비스·SLO 스냅샷, 값·시각·해소 사유·UID·멱등 키를 제공하므로 메시지 작성에 필요한 알람 도메인 정보는 충분합니다. [AlertNotification.java:26](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertNotification.java:26)
- 파일은 수정하지 않았습니다. 읽기 전용 조건 때문에 테스트는 재실행하지 않았으며, `2,519`건 통과와 build 성공은 요청서 기재 결과입니다. `git diff --check`는 오류가 없었습니다.

## 의견 요청 답

1. **잠금 역순 설계는 정합성 측면에서 타당합니다.** `try advisory`와 이벤트 `NOWAIT` 실패 시 트랜잭션 전체 롤백·재시도로 순환 교착을 끊습니다. 다만 활성화가 배타 잠금을 획득한 뒤에는 새 전이가 기다리며, 계속되는 공유 잠금 때문에 활성화가 60초 후 실패할 수 있습니다. 이는 불일치가 아니라 유한 실패이며, 단위 4 호출자가 재시도하고 단위 6이 전이 트랜잭션을 짧게 해야 합니다.

2. **재활성화 RESOLVED 보충은 유지하는 편이 맞습니다.** 이미 FIRED를 전달받은 채널의 RESOLVED를 나이만으로 버리면 외부에는 영구히 열린 알람으로 남습니다. 단위 4에서는 단순 나이 필터보다 FIRED 상태별 정책을 권장합니다.
   - FIRED가 SENT면 오래됐어도 RESOLVED 전달
   - FIRED가 DEAD면 RESOLVED SKIPPED
   - FIRED가 PENDING이면 pause 해제 후 FIRED→RESOLVED 순서로 전달
   - 오래된 미전송 쌍을 생략하려면 두 행을 함께 SKIPPED하는 별도 명시 정책 사용

3. **`@DynamicUpdate` 도입은 적절하며 전체 열 UPDATE에 의존하는 경로는 찾지 못했습니다.** 해소와 `zbx_eventid` 백필이 서로의 열을 되돌리는 위험을 줄입니다. 부작용은 SQL 변형 증가에 따른 batching·plan cache 효율 저하와, `@Version`을 대신하지는 않는다는 점입니다. 위 동시성 IT를 추가하면 의도가 더 확실히 고정됩니다.

4. **단위 4 결정 권고는 다음과 같습니다.**
   - 비활성화 = pause, 기존 PENDING 유지
   - 영구 폐기 = 별도 discard 명령으로 SKIPPED
   - DEAD/SKIPPED 재처리 = 명시적 관리 명령과 claim CAS
   - 활성화 호출 = 모든 노드에 채널 구현 배포가 끝난 뒤 설정 서비스/관리 명령에서 실행
   - 이미 켜진 채널도 누락을 복구할 `reconcile(key)` 제공

   SPI 자체는 알람 도메인 관점에서 충분히 좁습니다. 실제 메일 구현자는 `AlertChannel` 빈 외에도 메일 클라이언트, 수신자·템플릿·timeout 설정과 활성화 호출을 준비해야 합니다. 전이·평가·outbox 코드를 추가로 수정할 필요는 없습니다.
