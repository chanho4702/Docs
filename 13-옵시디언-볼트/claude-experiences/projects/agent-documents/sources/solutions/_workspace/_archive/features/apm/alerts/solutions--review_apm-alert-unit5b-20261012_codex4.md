## 판정

**승인**

3차 🔴은 해소됐으며, 4차 변경에서 명령 유실·영구 정체·순서 위반·남의 객체 변경·데이터 손상·신규 트랜잭션 내부 외부 I/O 회귀는 발견하지 못했습니다. 단독 배포 금지와 기존 합본 게이트는 유지해야 합니다.

## 3차 지적 해소 확인

- **hard RPUSH 공유 생략 우회는 해소됐습니다.** soft만 공유 여부를 먼저 판단하고, hard는 소유 확인에서 `FOREIGN → DEAD`, `MISSING → DONE`, `OURS`일 때만 공유 생략으로 진행합니다: [ApmZbxResolvePushExecutor.java:59](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:59>), [ApmZbxResolvePushExecutor.java:73](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:73>), [ApmZbxResolvePushExecutor.java:85](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:85>), [ApmZbxResolvePushExecutor.java:102](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:102>). 공유+foreign 3종과 공유+OURS 테스트도 해당 결과를 고정합니다: [ApmZbxStatusCommandIT.java:308](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:308>), [ApmZbxStatusCommandIT.java:341](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:341>).

- **soft 순서 유지는 타당합니다.** 이른 공유·ID 없음 분기는 외부 쓰기 없이 완료하며, 후속 `STAT(off) → RCONF` 정리 의무를 해제합니다: [ApmZbxResolvePushExecutor.java:59](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:59>), [ApmZbxCleanupService.java:220](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:220>). 이는 남의 객체 변경 없이 “끄기” 정리를 계속하려는 정책과 일치합니다.

- **STAT host 소유 확인 분기는 적절합니다.** 캐시 없이 정확한 host 이름과 owner tag를 확인하며, `MISSING → DONE`, `FOREIGN+on → DEAD`, `FOREIGN+off → 무쓰기 DONE`입니다: [ZabbixAlertBridge.java:1513](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1513>), [ApmZbxTriggerStatusExecutor.java:95](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:95>). foreign host에서는 `trigger.update`가 없다는 테스트도 있습니다: [ApmZbxStatusCommandIT.java:368](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:368>).

- **호출 상한 5와 lease 계산도 맞습니다.** 토큰 최대 2 + `host.get` 1 + `trigger.get` 1 + `trigger.update` 1이며, 선언값은 5입니다: [ApmZbxCommandType.java:32](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:32>). 최악 `5×45+30=255초`는 기본 lease 600초 미만이고 기동 검증식에도 반영됩니다: [ApmZbxCommandProperties.java:45](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandProperties.java:45>), [ApmZbxCommandProperties.java:81](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandProperties.java:81>), [ApmZbxStatusCommandIT.java:149](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:149>).

- **STAT DEAD가 PROVISION·RCONF·DELETE 체인을 영구 정체시키는 경로는 발견하지 못했습니다.**
  - 켜기는 `RPUSH→STAT`과 `RPUSH→PROVISION`이며 `STAT→PROVISION` edge가 없습니다: [ApmZbxCleanupService.java:249](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:249>).
  - `STAT→RCONF`는 끄기 체인에만 있으며, foreign+off STAT은 DEAD가 아니라 DONE입니다: [ApmZbxCleanupService.java:214](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:214>), [ApmZbxTriggerStatusExecutor.java:100](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:100>).
  - 삭제 체인은 별도의 `RCONF→DELETE_TRIGGER→DELETE_ITEM` 그래프입니다: [ApmZbxCleanupService.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:119>), [ApmZbxCommandStore.java:333](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:333>).
  - 동일 lane의 DEAD 행 자체는 다른 행을 막지 않고, claim은 명시적 dependency와 현재 `PROCESSING` 행만 차단합니다: [ApmZbxCommandStore.java:834](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:834>).

- **3차 🟡 문서 정정도 반영됐습니다.** §12.10은 조건부 update 부재와 `15×45+30=705초` 비용을 근거로 잔여 위험을 수용하고, 중복 trigger의 조회 1회 뒤 최대 4회 update도 정확히 명시합니다: [apm-alert-unit5-6-design-20261011.md:450](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:450>). DEAD 회복 한계와 실제 운영 절차도 §12.11·§12.13에 보강됐습니다: [apm-alert-unit5-6-design-20261011.md:454](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:454>), [apm-alert-unit5-6-design-20261011.md:466](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:466>).

## 🔴 필수

없음.

## 🟡 권장

1. STAT 중복 수렴 주석의 “호출 상한 4”는 4차 변경 후 실제 상한 5와 어긋납니다. 실행 영향은 없지만 5로 정정하는 편이 좋습니다: [ApmZbxTriggerStatusExecutor.java:117](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:117>), [ApmZbxCommandType.java:32](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:32>).

2. 현재 신규 STAT 테스트는 on/off 단독 분기는 고정하지만 후속 체인은 직접 검증하지 않습니다. `foreign+off → RCONF 진행`과 `STAT(on) DEAD가 독립 PROVISION·삭제 체인을 막지 않음`을 회귀 테스트로 추가하면 이번 판단을 더 직접 고정할 수 있습니다: [ApmZbxStatusCommandIT.java:368](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:368>), [ApmZbxCleanupService.java:220](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:220>).

## 이관 목록

- **단위 8 — DEAD 운영자 회복 창구, 합본 전 필수:** DEAD 목록·`blockedBy`·개별 retry-dead·운영 절차를 제공해야 합니다. 현재 `retryDead()`는 전체 DEAD 대상이며 production 호출처가 없습니다: [ApmZbxCommandStore.java:1322](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1322>), [apm-alert-unit5-6-design-20261011.md:466](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:466>). 특히 향후 `PUSH_CURRENT`는 같은 lane의 DEAD STAT을 선행으로 잡으므로 충돌 해소 뒤 개별 재시도가 필요합니다: [ApmZbxCommandStore.java:699](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:699>).

- **기존 §12.9 합본 게이트와 독자 알림 창구 대기:** 6a·7·6b·8 이관은 그대로 유지합니다. 이번 4차 변경으로 인한 회귀는 발견하지 못했습니다: [apm-alert-unit5-6-design-20261011.md:437](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:437>).

## 🟢 참고

- 4차 외부 호출은 명령 worker의 비트랜잭션 실행 구간에서 발생하며 bridge도 활성 트랜잭션을 거부합니다. 5b가 새로 만든 트랜잭션 내부 외부 I/O는 발견하지 못했습니다: [ApmZbxCommandWorker.java:290](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:290>), [ZabbixAlertBridge.java:1513](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1513>).

- 자동 `item.delete` 금지와 비활성 우리 item의 `status:0` 재활성화 결정에는 4차 회귀가 없습니다.

- 읽기 전용 조건에 따라 테스트는 실행하지 않았고, 누적 diff·워크트리·테스트 소스를 정적으로 검수했습니다.
