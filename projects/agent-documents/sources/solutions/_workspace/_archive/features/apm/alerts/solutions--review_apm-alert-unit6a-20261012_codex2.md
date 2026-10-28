## 판정

**반려**

1차 🔴1~3의 정상 경로는 대부분 보완됐습니다. 그러나 선적재된 `RESOLVE_PUSH(neutralize=true)`가 이후 끄기·고아 처리의 soft 명령에 병합될 때 `neutralize`가 남아, `STAT → RCONF` 및 일부 삭제 체인을 영구 정체시킬 수 있는 새 🔴 회귀가 있습니다.

## 1차 지적 해소 확인

1. **🔴1 crash 명령 유실: 정상 경로는 해소됐습니다.**

   트리거 쓰기 전에 `RPUSH(neutralize) → STAT`을 짧은 트랜잭션으로 커밋하고, 대기 중 `PUSH_CURRENT`도 재적재합니다: [ApmZbxProvisionExecutor.java:181](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:181>), [ApmZbxProvisionExecutor.java:291](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:291>). 생성 성공 후 기록 ② 전에 죽는 회귀 테스트도 추가됐습니다: [ApmAlertEvaluationZabbixPhaseIT.java:270](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:270>).

2. **🔴2 `cacheReady` 우회: 해소됐습니다.**

   보류 조건에서 `cacheReady`와 다른 소비자 조건이 제거됐고, 이력 있는 아이템의 새 트리거는 꺼진 채 생성 후 `-1 → 켜기`를 탑니다: [ApmZbxProvisionExecutor.java:175](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:175>), [ApmZbxProvisionExecutor.java:181](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:181>), [ApmAlertEvaluationZabbixPhaseIT.java:489](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:489>). 공유 아이템 예외의 잔여 위험은 아래 🟡에 별도 판정합니다.

3. **🔴3a 꺼진 아이템의 순서 및 부분 실패: 해소됐습니다.**

   트리거 조회·명령 선적재 뒤 우리 트리거를 먼저 끄며, 중복 트리거가 남았으면 아이템을 켜지 않고 재실행합니다. 모두 꺼진 뒤에만 아이템을 `status:0`으로 바꿉니다: [ApmZbxProvisionExecutor.java:169](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:169>), [ApmZbxProvisionExecutor.java:189](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:189>), [ApmZbxProvisionExecutor.java:195](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:195>). `writeTrigger` 중간 실패·crash 시 `reenableItem`에 도달하지 않으며, 아이템 재활성화 뒤 crash해도 앞서 적재한 명령이 남습니다. 관련 테스트도 있습니다: [ApmAlertEvaluationZabbixPhaseIT.java:293](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:293>), [ApmAlertEvaluationZabbixPhaseIT.java:318](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:318>).

4. **🔴3b 보류 fail-open: 단독 경로는 해소됐지만 병합 경로는 미해소입니다.**

   보류 명령은 아이템 없음·꺼짐 및 cache miss를 전용 카운터로 재확인하고, 20회 뒤 `NEUTRALIZE_TIMEOUT` DEAD가 되어 STAT을 풀지 않습니다: [ApmZbxResolvePushExecutor.java:106](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:106>), [ApmZbxResolvePushExecutor.java:151](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:151>), [ApmZbxCommandStore.java:1293](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1293>). 다만 soft 명령과 병합될 때의 새 회귀가 아래 🔴입니다.

5. **1차 🟡2~4는 반영됐습니다. 🟡1은 부분 반영입니다.**

   foreign host 대상별 PROVISION 단락은 구현됐고, JVM-local 범위와 5초 재확인도 명시됐으며, 설정 키도 yml에 들어갔습니다: [ApmAlertZabbixPhase.java:194](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:194>), [ZabbixAlertBridge.java:231](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:231>), [ApmZbxProvisionExecutor.java:130](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:130>), [application.yml:187](</C:/worktrees/apm-c05-followup/src/main/resources/application.yml:187>). 실패 수치의 `?` 표기도 반영됐지만, 후속 생성 명령 집계가 빠질 수 있습니다.

## 🔴 필수

1. **선적재된 `neutralize=true`가 새 soft 끄기 의사에 남아 `STAT → RCONF`와 삭제 체인을 영구 차단할 수 있습니다.**

   - PROVISION은 동일한 `RPUSH:b{id}`에 `hard=true, neutralize=true`를 먼저 적재합니다: [ApmZbxCommandSpec.java:94](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:94>), [ApmZbxProvisionExecutor.java:298](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:298>).
   - 그 사이 규칙 끄기·고아 처리가 오면 동일 dedup에 `hard=false`인 soft RPUSH와 `RPUSH → STAT → RCONF`를 병합합니다: [ApmZbxCleanupService.java:202](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:202>), [ApmZbxCleanupService.java:214](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:214>), [ApmZbxCleanupService.java:220](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:220>).
   - 저장소 병합은 새 `hard=false`로 덮지만, 새 명령에 없는 기존 `neutralize=true`는 제거하지 않습니다: [ApmZbxCommandStore.java:673](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:673>).
   - 실행기는 `hard` 여부와 무관하게 `neutralize=true`이면 아이템 없음·꺼짐을 완료하지 않고 보류합니다: [ApmZbxResolvePushExecutor.java:55](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:55>), [ApmZbxResolvePushExecutor.java:106](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:106>). 20회 뒤 DEAD가 되면 STAT과 RCONF가 계속 막힙니다.
   - 이후 삭제가 같은 RCONF를 `beforeDelete`로 병합하면 기존 `STAT → RCONF` edge가 유지된 채 `RCONF → DELETE_TRIGGER → DELETE_ITEM`이 붙으므로 삭제 체인까지 정체될 수 있습니다: [ApmZbxCleanupService.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:119>), [ApmZbxCleanupService.java:125](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:125>).

   이는 단순 운영 대기가 아니라 **더 최신인 끄기 의사가 과거의 켜기 보류 속성을 상속하여 영구 정체되는 순서 위반**입니다. 단위 8의 retry-dead로 되살려도 아이템이 계속 없거나 꺼져 있으면 다시 DEAD가 됩니다.

   soft 의사가 병합될 때 `neutralize`와 `confirmRechecks`를 제거하거나, 실행기에서 보류를 `hard && neutralize`에만 적용해야 합니다. 다음 회귀 테스트가 필요합니다.

   - 보류 선적재 후 PROVISION 부분 실패 → 규칙 끄기/고아 처리 → soft가 DEAD 없이 STAT·RCONF까지 완료.
   - 같은 상태에서 규칙 삭제 → `RCONF → DELETE_TRIGGER → DELETE_ITEM` 완료.
   - 병합 당시 RPUSH가 PENDING·PROCESSING·DEAD인 세 경우.

## 🟡 권장

1. **Zabbix 단계 실패 집계가 실행 중 생성된 후속 명령을 놓칠 수 있습니다.**

   `run()`은 PROVISION이 만든 RPUSH·STAT을 `cycle`에 추가하지만, 예외 처리의 `ledgerState()`는 최초 `decision.commandIds()`만 조회합니다: [ApmAlertZabbixPhase.java:102](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:102>), [ApmAlertZabbixPhase.java:135](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:135>). 따라서 초기 PROVISION 행은 완료됐지만 후속 RPUSH·STAT이 남은 뒤 inventory가 실패하면 `commandsPending=0`이 다시 나올 수 있습니다. 바인딩 기준 남은 명령을 집계하거나 실행 중 늘어난 `cycle`을 실패 경로까지 전달하는 편이 맞습니다.

2. **공유 아이템의 `-1` 생략은 🟡 위험으로 봅니다.**

   소유 확인 뒤 다른 활성 DB 바인딩이 같은 item ID를 사용하면 hard/neutralize도 완료 처리되어 STAT이 켜집니다: [ApmZbxResolvePushExecutor.java:117](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:117>), [ZabbixAlertBridge.java:971](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:971>). 다른 소비자의 최근 push가 실패 중이면 오래된 양수로 거짓 Problem이 열릴 가능성이 있습니다. 이 결과는 **추정**입니다. 반대로 `-1`을 보내면 다른 활성 트리거에 거짓 RECOVERY를 확정적으로 만들 수 있으므로 현재 선택 자체를 🔴로 올리지는 않습니다. 장기적으로 최근 성공 push 시각을 기준으로 생략 여부를 판단해야 합니다.

3. **`StatusCommandIT`의 강제→비강제 변경은 forced PROVISION의 DEAD STAT 부활 동작을 테스트에서 피한 것이 맞습니다.**

   강제 PROVISION은 꺼진 트리거에 보류 체인을 적재하고 같은 dedup의 DEAD STAT을 PENDING으로 부활시킵니다: [ApmZbxProvisionExecutor.java:181](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:181>), [ApmZbxCommandStore.java:650](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:650>). 테스트는 이를 피하도록 비강제로 바뀌었습니다: [ApmZbxStatusCommandIT.java:412](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:412>), [ApmZbxStatusCommandIT.java:426](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:426>).

   다만 부활한 STAT도 새 RPUSH edge 뒤에 서고, 실행 시 호스트 소유를 다시 확인하므로 이것만으로 🔴 안전 결함이 입증되지는 않습니다: [ApmZbxTriggerStatusExecutor.java:93](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:93>). 현재 테스트와 별도로 “forced PROVISION이 DEAD STAT을 부활시키며 반드시 새 RPUSH 뒤에 실행되는가”를 명시적으로 고정해야 합니다. 단위 8의 운영자 회복 창구와 별개인 묵시적 부활 경로라는 점도 문서화가 필요합니다.

## 이관 목록

- **단위 7:** 1초 장부의 트랜잭션 안 `ensureProvisioned`·`pushAll` 및 lane 밖 직접 push 제거. 현재 그대로입니다: [ApmStuckRequestLedger.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:119>), [ApmStuckRequestLedger.java:132](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:132>), [ApmStuckRequestLedger.java:156](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:156>).

- **단위 6b:** 대조의 트랜잭션 안 `retryPendingTriggerStatus`·`applyOurDefinition` 제거 및 동일 neutralization 순서 적용. 현재 그대로입니다: [ApmAlertSyncService.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:123>), [ApmAlertSyncService.java:131](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:131>), [ApmAlertSyncService.java:183](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:183>).

- **단위 8 — 합본 전 필수:** DEAD 목록, `blockedBy`, 개별 retry-dead 및 운영 절차. `NEUTRALIZE_TIMEOUT`도 표시 대상입니다. 위 🔴 병합 결함은 단위 8로 이관하면 안 됩니다.

- **독자 알림 창구:** 사용자 확정대로 대기 유지합니다.

## 🟢 참고

- host·item foreign은 선적재 전에 차단되고, 선적재 후 소유가 바뀌어도 RPUSH와 STAT이 각각 재확인하므로 남의 객체에 직접 쓰는 경로는 발견하지 못했습니다: [ApmZbxProvisionExecutor.java:124](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:124>), [ApmZbxResolvePushExecutor.java:84](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:84>), [ApmZbxTriggerStatusExecutor.java:93](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:93>).

- 일반 hard RPUSH의 “아이템 없음·꺼짐이면 완료”는 이번 3a PROVISION 보류와 결합된 경로에서는 새 fail-open으로 확인되지 않았습니다. 꺼진 아이템을 켜는 PROVISION이 별도의 `neutralize=true` 체인을 남기고 트리거를 먼저 내립니다: [ApmZbxResolvePushExecutor.java:106](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:106>), [ApmZbxProvisionExecutor.java:182](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:182>).

- 자동 `item.delete`는 없고 `status:1` 비활성화만 하며, 꺼진 우리 아이템은 태그를 덮지 않고 `status:0`으로 재사용합니다: [ApmZbxCommandType.java:46](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:46>), [ZabbixAlertBridge.java:1438](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1438>).

- 저수준 Zabbix I/O의 트랜잭션 가드는 유지됩니다: [ZabbixAlertBridge.java:1881](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1881>), [ApmZbxCommandWorker.java:341](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:341>).

- 읽기 전용 조건에 따라 테스트는 실행하지 않았고 파일도 수정하지 않았습니다. 검증 결과 표기는 요청서의 실행 보고를 정적 코드와 대조한 것입니다.
