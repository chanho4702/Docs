## 판정

**반려**

`max-attempts` 경계에서 결과 불명 FIRED가 `DEAD`로 바뀌며 RESOLVED가 폐기되는 통지 유실 경로가 남아 있습니다.

## 🔴 필수

1. **마지막 시도의 결과 불명을 `DEAD`로 확정하여 외부 알람이 영구히 열린 채 남을 수 있습니다.**

   재현 가능한 순서입니다.

   1. FIRED의 `attempts == maxAttempts`인 전송이 외부 채널에는 도달
   2. `SENT` 기록 전 노드 중단 또는 timeout 후 채널이 interrupt를 무시
   3. 이벤트가 해소되어 RESOLVED는 PENDING
   4. 리스 만료 경로는 FIRED를 곧바로 `DEAD`로 변경합니다. [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:177)
   5. 다음 sweep 또는 `markDead()`가 RESOLVED를 `SKIPPED`로 변경합니다. [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:164), [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:233)

   timeout도 동일합니다. 마지막 시도에서 `markRetry()`는 `markDead()`로 전환하지만, interrupt를 무시한 실제 전송 호출은 뒤늦게 성공할 수 있고 그 결과는 더 이상 기록되지 않습니다. [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:213), [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:269)

   r3의 일반 폐기도 이 문제를 해소하지 못합니다. 결과 불명 쌍을 보존하더라도 FIRED가 마지막 시도였다면 재활성화 직후 sweep에서 `DEAD`가 되고 RESOLVED는 결국 `SKIPPED`됩니다. 계약의 “다시 켜면 FIRED 재전송 후 RESOLVED 전송”과 어긋납니다. [계약서](/C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:54)

   현재 리스 소진 테스트는 외부 전송이 없었던 경우만 검증하고, 보존 테스트는 `attempts=1`, `maxAttempts=10`만 다룹니다. [ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:309), [ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:535)

   필요한 보정:

   - 명시적인 미전송 실패와 `timeout`·리스 만료 같은 결과 불명을 상태상 구분
   - 결과 불명 FIRED에는 일반 `DEAD → RESOLVED SKIPPED` 규칙을 적용하지 않고, 재활성화 후 반드시 해소까지 수렴
   - `maxAttempts=1`에서 외부 전달 후 crash 및 interrupt 무시 timeout을 각각 고정하는 IT 추가

## 🟡 권장

- 장기 일시정지 중 `keptUncertain`은 만료된 `PROCESSING`으로 무기한 남고, 큐 나이·due lag는 PENDING만 계산합니다. 실제 전송 중과 결과 불명 보존을 구분할 수 있도록 별도 상태나 `oldestUncertainAgeSeconds` 지표를 권장합니다. [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:334)

- `features` 기반 면제 판정은 타당합니다. 유효한 만료·보관 키는 보유 기능을 유지하고, NONE·INVALID는 빈 기능 집합입니다. A5-d도 면제 메서드를 정확히 세 개로 제한합니다. 다만 가능한 조합인 `READ_ONLY + APM 미보유`가 계약 매트릭스와 MVC 테스트에 없습니다. 이때 안전 경로는 `LICENSE_FEATURE_REQUIRED`, 나머지 POST는 먼저 실행되는 `AccessModeInterceptor`의 `LICENSE_READ_ONLY`가 됩니다. [ApmAlertChannelMvcTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/ApmAlertChannelMvcTest.java:218)

- `ApmAlertNotifyProperties` 문서는 “대기열 없음”이라고 하지만 실제 고정 풀에는 1칸 대기열이 있습니다. 동작에는 문제가 없으나 설명을 맞추는 편이 좋습니다. [ApmAlertNotifyProperties.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotifyProperties.java:24), [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:102)

## 🟢 참고

- 결과 기록·claim의 공유 잠금과 폐기·활성화·reconcile의 배타 잠금 사이에서 새로운 교착 경로는 확인되지 않았습니다. 일시정지 2단계도 상태 선반영 후 장벽을 통과하는 구조와 회귀 테스트가 일치합니다.
- 고정 풀은 스레드 수를 제한하고 `rejected`·`stuckDeliveries`를 노출합니다.
- 기존 산출물은 2,576건, 실패·무시 0건입니다. 읽기 전용 조건에 따라 테스트는 재실행하지 않았고 파일도 수정하지 않았습니다.

