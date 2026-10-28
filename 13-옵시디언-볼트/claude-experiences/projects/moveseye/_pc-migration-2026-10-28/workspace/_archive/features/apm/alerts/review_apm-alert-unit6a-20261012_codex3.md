## 판정

**조건부 승인**

2차 🔴1의 영구 정체 원인은 코드상 해소됐으며, 새 🔴 회귀는 발견하지 못했습니다. 다만 핵심인 **기존 보류 → 규칙 켜기 hard → PROVISION의 새 보류 재적재** 전체 흐름을 PENDING·PROCESSING·DEAD별로 고정하는 통합 테스트가 없어 이를 승인 조건으로 둡니다.

## 2차 지적 해소 확인

- **🔴1 neutralize 상속 정체: 해소 확인**
  - 새 명령이 보류가 아니면 `neutralize`와 `confirmRechecks`를 제거하며, DEAD는 PENDING으로 부활합니다: [ApmZbxCommandStore.java:650](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:650>), [ApmZbxCommandStore.java:677](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:677>).
  - 실행기도 `hard && neutralize`일 때만 아이템 없음·꺼짐을 보류하므로 soft 정리 의사가 과거 표식을 상속해 DEAD가 되지 않습니다: [ApmZbxResolvePushExecutor.java:106](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:106>).
  - PROCESSING 중 병합되면 generation 불일치로 기존 결과가 삭제·DEAD 처리되지 않고 새 의사로 REQUEUED됩니다. 보류 카운터도 증가하지 않습니다: [ApmZbxCommandStore.java:1258](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1258>), [ApmZbxCommandStore.java:1308](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1308>), [ApmZbxCommandStore.java:1334](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1334>).
  - soft 병합의 PENDING·PROCESSING·DEAD와 삭제 체인 완료는 테스트로 고정됐습니다: [ApmZbxStatusCommandIT.java:467](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:467>), [ApmZbxStatusCommandIT.java:505](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:505>), [ApmZbxStatusCommandIT.java:528](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:528>).

- **규칙 켜기 hard가 보류를 지운 뒤의 안전성: 코드상 확인**
  - 켜기는 보류가 아닌 hard RPUSH와 PROVISION을 함께 적재하고 둘 다 RPUSH 뒤에 둡니다: [ApmZbxCleanupService.java:237](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:237>), [ApmZbxCleanupService.java:249](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:249>), [ApmZbxCleanupService.java:257](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:257>).
  - hard RPUSH는 꺼진·없는 아이템에서 완료되어 PROVISION과의 상호 대기를 끊습니다: [ApmZbxResolvePushExecutor.java:106](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:106>).
  - 뒤의 PROVISION은 기존의 꺼진 아이템·트리거 없음·강제 상태를 다시 확인해 새 `neutralizePush → STAT`을 **트리거 쓰기 전에** 적재합니다: [ApmZbxProvisionExecutor.java:147](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:147>), [ApmZbxProvisionExecutor.java:181](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:181>), [ApmZbxProvisionExecutor.java:291](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:291>).
  - 같은 lane의 PROCESSING 명령과는 동시에 실행되지 않습니다: [ApmZbxCommandStore.java:842](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:842>).
  - 따라서 기존 아이템에서는 `새 보류 → 트리거 off → 아이템 status:0 → -1 → trigger on` 순서가 복구됩니다. 완전히 새 아이템은 이전 값이 없어 보류하지 않는 것이 안전합니다.

- **🟡1 실패 장부 집계: 반영 확인**
  - 판정 당시 id뿐 아니라 대상 바인딩에 남은 후속 명령 전체를 합산합니다: [ApmAlertZabbixPhase.java:135](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:135>), [ApmZbxCommandStore.java:1071](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1071>).
  - 후속 보류·STAT이 집계되는 테스트가 추가됐습니다: [ApmAlertEvaluationZabbixPhaseIT.java:270](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:270>).

- **🟡2 공유 아이템의 -1 생략: 결정대로 유지·위험 기록 확인**
  - 다른 활성 소비자가 있으면 -1을 생략하는 현행 동작입니다: [ApmZbxResolvePushExecutor.java:117](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:117>).
  - 신선도 기반 장기안과 거짓 Problem 위험이 설계에 기록됐습니다: [apm-alert-unit5-6-design-20261011.md:547](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:547>).

- **🟡3 DEAD STAT 묵시적 부활: 반영 확인**
  - 강제 PROVISION이 새 보류와 STAT을 한 묶음으로 재적재해 DEAD STAT을 부활시키고 RPUSH 선행을 다시 겁니다: [ApmZbxProvisionExecutor.java:301](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:301>).
  - 같은 행 부활, -1 전 claim 불가, `push → on` 순서가 테스트로 고정됐습니다: [ApmZbxStatusCommandIT.java:563](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:563>).

## 🔴 필수

없음.

## 🟡 권장

1. **조건: 규칙 켜기 hard의 전체 전이 행렬을 직접 고정해야 합니다.**

   현재 테스트는 보류→soft의 PENDING·PROCESSING·DEAD와 PROVISION 단독 부활을 각각 검증하지만, `enqueueEnable()`이 기존 보류를 제거한 뒤 PROVISION이 새 보류를 만드는 하나의 연속 흐름은 직접 검증하지 않습니다: [ApmZbxStatusCommandIT.java:505](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:505>), [ApmZbxStatusCommandIT.java:563](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:563>).

   PENDING·PROCESSING·DEAD 각각에 대해 다음을 고정하는 parameterized IT를 권장합니다.

   - 보류 표식·카운터가 hard 병합에서 제거됨
   - PROCESSING이 반환한 RECHECK/DEAD 결과가 새 의사를 덮지 않음
   - hard RPUSH 완료 후 PROVISION이 새 `neutralize=true`를 적재함
   - 새 RPUSH 전 STAT claim 불가
   - 최종 순서가 `trigger off → item status:0 → push -1 → trigger on`
   - `보류→soft→hard→soft`와 `보류→hard→soft`의 최종 명령·DEAD가 0

## 이관 목록

- **단위 7:** 1초 STUCK 경로의 트랜잭션 내 `ensureProvisioned`·직접 `pushAll`을 sequencer로 전환: [ApmStuckRequestLedger.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:119>), [ApmStuckRequestLedger.java:151](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:151>).
- **단위 6b:** `retryPendingTriggerStatus`·`applyOurDefinition` 직접 경로 전환: [ApmAlertSyncService.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:123>), [ApmAlertSyncService.java:173](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:173>).
- **단위 8, 합본 전 필수:** DEAD 조회·개별 retry-dead 회복 창구. 현재 보류 상한 뒤 DEAD는 의도적으로 유지됩니다: [ApmZbxResolvePushExecutor.java:151](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:151>), [apm-alert-unit5-6-design-20261011.md:538](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:538>).
- **독자 알림 창구:** 사용자 결정대로 대기. 이번 판정에서 재론하지 않았습니다.
- **장기 백로그:** 공유 소비자의 최근 성공 push 시각을 이용한 신선도 판정: [apm-alert-unit5-6-design-20261011.md:547](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:547>).

## 🟢 참고

- 자동 `item.delete` 없이 `status:1`만 적용합니다: [ZabbixAlertBridge.java:1307](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1307>).
- 꺼진 우리 아이템은 태그를 덮지 않고 `status:0`으로 재활성화합니다: [ZabbixAlertBridge.java:1438](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1438>).
- 워커는 활성 트랜잭션 안에서 외부 실행을 거부합니다: [ApmZbxCommandWorker.java:341](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:341>).
- 읽기 전용 조건에 따라 파일 수정 및 Gradle/IT 실행은 하지 않았습니다. 판정은 실제 워크트리 정적 검수와 요청서에 기록된 통과 결과를 기준으로 했습니다.
