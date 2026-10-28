## 판정

**반려**

`delivery_uncertain`의 상태 전이는 대부분 일관되지만, timeout·interrupt 경로에서 RESOLVED의 실질적인 해소 효과가 유실될 수 있는 두 경로가 남아 있습니다.

## 🔴 필수

1. **timeout된 FIRED가 RESOLVED보다 늦게 도착하면 외부 알람이 다시 열린 상태로 영구 잔류합니다.**

   timeout 직후 FIRED를 `DEAD + delivery_uncertain=true`로 확정하고 다음 주기에 RESOLVED를 보냅니다. 그러나 원래 FIRED 호출은 계속 실행될 수 있습니다. [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:269)

   추가된 IT도 RESOLVED를 먼저 전송한 뒤([ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:620)) timeout된 FIRED를 나중에 풀어 외부 도달시키고 있습니다. [ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:624)

   FIRED와 RESOLVED는 서로 다른 idempotency key이므로 수신 측에 순서·버전 적용 규약이 없는 현재 계약에서는 다음 순서가 가능합니다.

   `RESOLVED 도착 → 늦은 FIRED 도착 → 외부 알람 OPEN 잔류`

   이는 “외부 알람이 해소로 수렴한다”는 계약을 만족하지 않습니다. [features/apm/alerts/contract_apm-alert-channels.md](/C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:159)

   timeout 뒤 늦게 완료된 FIRED를 감지해 RESOLVED를 다시 보장하거나, 수신 측에서 RESOLVED가 늦은 FIRED보다 우선하는 단조 상태/version 계약을 강제해야 합니다. 테스트도 DB의 `RESOLVED SENT`가 아니라 외부 최종 상태가 RESOLVED인지 검증해야 합니다.

2. **디스패처 대기 스레드의 `InterruptedException`은 결과 불명인데 `delivery_uncertain=false`로 기록됩니다.**

   `Future.get()` 대기 중 인터럽트되면 실행 중인 호출을 `cancel(true)`한 뒤 일반 RETRY로 처리합니다. [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:287) 이때 `timedOut`은 `false`이므로 [markRetry 호출](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:300)에 결과 불명이 전달되지 않습니다.

   이미 시작한 채널 호출이 interrupt를 무시하고 늦게 성공하면, `maxAttempts=1`에서 FIRED는 확실한 미전송 DEAD로 기록되고 RESOLVED가 SKIPPED됩니다. 3차 반려의 통지 유실이 이 경로에서는 그대로 재현됩니다.

   호출 시작 여부와 취소 결과를 반영해 결과 불명을 기록하고, “전송 시작 후 디스패처 스레드 interrupt → 늦은 외부 성공 → RESOLVED 보장” IT가 필요합니다.

## 🟡 권장

없음.

## 🟢 참고

- 불명 이력이 없는 명확한 `FAILED`는 `dead_reason=FAILED`, `delivery_uncertain=false`가 되고 RESOLVED를 `SKIPPED`하므로 기존 규칙을 유지합니다.
- sweep·claim·markRetry/dead·retry·retry-dead·일반 discard·재활성화·reconcile의 DB 상태 전이와 `DEAD ⇔ dead_reason` CHECK는 계약과 일치합니다.
- 상태 집계의 `processing`과 만료 PROCESSING 기반 `uncertain` 분리도 계약과 일치합니다.
- 읽기 전용 조건에 따라 파일 수정과 테스트 재실행은 하지 않았습니다.
