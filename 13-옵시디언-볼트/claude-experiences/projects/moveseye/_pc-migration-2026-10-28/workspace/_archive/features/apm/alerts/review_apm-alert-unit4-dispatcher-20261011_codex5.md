## 판정

**조건부 승인**

r5 변경은 3·4차 반려 사항을 해소했습니다. 다만 실제 채널 구현은 아래 의무를 충족하기 전까지 활성화하면 안 됩니다. 현재 등록 채널이 0개이고 이 브랜치를 단독 배포하지 않는 조건을 반영한 판정입니다.

## 🔴 필수

1. **상태형 채널은 `stateVersion`을 실제 전송 payload에 포함하고, 수신 측에서 영속적·원자적으로 비교 적용해야 합니다.**

   - `(eventId, stateVersion)`을 저장하고 현재 값보다 큰 버전만 적용해야 합니다.
   - `FIRED=1`, `RESOLVED=2`이므로 늦은 FIRED가 해소 상태를 다시 열 수 없어야 합니다.
   - `stateVersion()`은 record component가 아니므로 단순 Jackson 직렬화에 의존하지 말고 payload 포함을 명시적으로 검증해야 합니다.
   - RESOLVED 재전송은 같은 idempotency key를 사용하므로, 단순 dedup만 하고 `stateVersion`을 적용하지 않는 수신기는 재전송도 무시하여 열린 상태가 남을 수 있습니다.
   - 근거: [AlertNotification.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertNotification.java:58), [AlertChannel.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannel.java:16)

2. **실제 채널에서 `FAILED`·일반 `RETRY`·예외의 전달 확실성을 명확히 보장해야 합니다.**

   현재 dispatcher는 자체 timeout·전송 시작 후 interrupt·리스 만료만 결과 불명으로 기록합니다. 채널이 외부 전송 후 응답 유실이나 connection reset을 `RETRY` 또는 예외로 반환하면 `delivery_uncertain=false`로 처리될 수 있습니다. 마지막 시도라면 FIRED가 명확한 DEAD로 간주되고 RESOLVED가 SKIPPED되어 외부 알람이 영구적으로 열릴 수 있습니다. `stateVersion`도 RESOLVED 자체가 전송되지 않으므로 이 경로는 막지 못합니다.

   따라서 채널 구현은 다음 중 하나를 충족해야 합니다.

   - 일반 `RETRY`·예외·`FAILED`는 외부에 **확실히 전달되지 않은 경우에만** 반환
   - 모호한 결과는 provider receipt/status 조회와 idempotency key로 확정
   - 확정할 수 없는 채널이라면 활성화 전에 SPI에 `RETRY_UNCERTAIN` 또는 동등한 전달 불명 표현을 추가

   근거: [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:302), [DeliveryResult.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/DeliveryResult.java:8), [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:312)

## 🟡 권장

- 실제 채널 conformance test에 다음 두 사례를 필수 시나리오로 추가하는 것이 좋습니다.
  - `RESOLVED` 처리 후 늦은 `FIRED`가 도착해도 상태가 해소로 유지되는지
  - 외부 반영 후 응답 유실이 발생했을 때 RESOLVED가 SKIPPED되지 않는지
- batch 첫 전송 도중 dispatcher interrupt가 발생했을 때 나머지 claim들의 `attempts`가 원복되고 PENDING으로 해제되는 IT를 추가하면 좋습니다. 구현상 [release()](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:291)는 정확하지만 현재 추가 테스트는 단일 claim 중심입니다.
- `lateFired`는 재전송 예약 건수가 0이어도 증가합니다. DTO 설명을 “늦은 FIRED 감지 누적”으로 바꾸거나, 감지와 실제 재전송 예약 지표를 분리하는 편이 정확합니다.

## 🟢 참고

- sweep·claim·`markRetry`/`markDead`·단건/일괄 retry·일반 discard·재활성화·reconcile에서 `delivery_uncertain`은 지워지지 않으며, 불명 FIRED의 RESOLVED 전송 조건이 유지됩니다.
- 불명 이력이 없는 명확한 `FAILED`는 기존대로 RESOLVED를 SKIPPED합니다. 과거 불명 이력이 있으면 sticky flag를 보존하여 RESOLVED를 전송하는 것이 맞습니다.
- `DEAD ⇔ dead_reason` 및 `FAILED|EXHAUSTED` CHECK는 계약과 일치합니다. [V78 migration](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V78__apm_alert_notification_dispatch_idx.sql:33)
- 늦은 FIRED 보정은 `SENT→PENDING`, `PROCESSING→resend_requested`, 기존 `PENDING` 유지로 수렴합니다. 자동 재전송은 `resend_requested` boolean으로 합쳐지고 성공 기록 시 해제되어 무한 재전송 폭주는 없습니다. 다만 여러 늦은 FIRED 성공만큼 제한된 중복은 가능합니다.
- 기존 테스트 산출물 기준 2,585건, 실패·오류·skip 0이며 `ApmAlertNotificationDispatchIT` 44건도 모두 통과했습니다.
- 파일은 수정하지 않았습니다.
