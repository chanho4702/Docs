## 판정

**반려**

판정 트랜잭션 분리와 명령 내구성은 대체로 적절하지만, `-1 → 켜기 → 현재 값` 보장이 깨지는 경로 2건과 PROVISION 재시작 시 명령 유실 경로 1건이 남아 있습니다.

## 🔴 필수

1. **꺼진 채 생성한 트리거와 기록 ② 사이에서 프로세스가 죽으면 `RPUSH → STAT(on)` 명령이 영구 유실됩니다.**

   - 첫 실행은 트리거를 `status:1`로 생성합니다: [ZabbixAlertBridge.java:1493](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1493>).
   - 그러나 후속 `RPUSH(hard) → STAT(on)`은 `hold && trigger.created()`일 때만 적재됩니다: [ApmZbxProvisionExecutor.java:157](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:157>), [ApmZbxProvisionExecutor.java:226](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:226>).
   - `trigger.create` 성공 뒤 기록 ② 전에 프로세스가 죽으면, lease 만료 후 재실행은 이미 존재하는 트리거를 찾아 `created=false`로 반환합니다: [ZabbixAlertBridge.java:1462](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1462>).
   - 따라서 재실행은 enable 명령을 적재하지 않은 채 PROVISION을 완료하고, 트리거는 계속 꺼져 있습니다. 이는 외부 성공과 후속 명령 적재 사이의 명령 유실입니다.
   - 현재 crash 테스트는 판정 커밋 직후, Zabbix 호출 전 중단만 검증합니다: [ApmAlertEvaluationZabbixPhaseIT.java:127](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:127>).

   `trigger.create` 전에 durable hold 표식을 기록하거나, 재실행에서 “우리가 hold 상태로 만든 disabled trigger”를 식별해 `RPUSH → STAT`을 멱등 적재해야 합니다. `trigger.create 성공 → 기록 ② 전 crash` 테스트가 필요합니다.

2. **`selfFeeding` 예외는 새 트리거를 `-1`보다 먼저 켜므로 옛 값 재발화 경로가 남습니다.**

   - 같은 item ID에 `cacheReady=true`이면 `hold=false`가 됩니다: [ApmZbxProvisionExecutor.java:146](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:146>).
   - `cacheReady`는 과거에 push가 한 번 성공했다는 뜻일 뿐 최근 값의 신선도를 보장하지 않습니다: [ApmAlertRuleBinding.java:238](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleBinding.java:238>), [ApmAlertRuleBinding.java:244](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleBinding.java:244>).
   - 이때 새 트리거는 곧바로 enabled로 생성되고, `PUSH_CURRENT`는 PROVISION 뒤로 fence되므로 실제 순서는 `트리거 켜기 → 현재 값`입니다: [ZabbixAlertBridge.java:1493](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1493>), [ApmZbxCommandStore.java:699](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:699>).
   - 테스트도 이 예외를 안전성으로 간주해 `-1`이 없음을 고정합니다: [ApmAlertEvaluationZabbixPhaseIT.java:336](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:336>), [ApmAlertEvaluationZabbixPhaseIT.java:350](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:350>).

   마지막 값이 오래된 양수이면 트리거 생성 순간 거짓 Problem이 열릴 수 있다는 결과는 **추정**이지만, 요구된 순서가 코드상 지켜지지 않는 것은 확정입니다. `cacheReady`만으로 neutralization을 생략하면 안 됩니다.

3. **아이템 재활성화와 2분 cache hold가 fail-open이라, 성공한 `-1` 없이 트리거가 켜질 수 있습니다.**

   - PROVISION은 기존 트리거를 확인하거나 내리기 전에 item을 `status:0`으로 켭니다: [ApmZbxProvisionExecutor.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:123>), [ZabbixAlertBridge.java:535](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:535>).
   - `createDisabled`는 새 트리거에만 적용됩니다. 기존 트리거는 비강제 PROVISION에서 그대로 반환되고, `trigger.created=false`라 neutralization 체인도 적재되지 않습니다: [ZabbixAlertBridge.java:1462](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1462>), [ApmZbxProvisionExecutor.java:157](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:157>).
   - 따라서 “꺼진 item + 기존 enabled trigger”는 `item status:0 → 현재 값`이고, `-1 → trigger on` 단계가 없습니다. 옛 값 즉시 판정 여부는 **추정**입니다.
   - 또한 hard RPUSH가 cache miss를 반복하면 9번째 claim에서 성공한 `-1` 없이 `DONE`으로 처리되어 후행 STAT을 풉니다: [ApmZbxResolvePushExecutor.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:119>), [ApmZbxResolvePushExecutor.java:127](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:127>).
   - 이 상한은 hold 전용 카운터가 아니라 명령의 전체 `attempts`이므로 이전 실패가 있으면 2분보다 일찍 fail-open할 수도 있습니다: [ApmZbxCommandStore.java:859](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:859>).

   각 시도는 lease를 반납하므로 600초 lease·호출 상한 5와 직접 충돌하지는 않습니다. 문제는 시간 상한 뒤 안전 순서를 포기한다는 점입니다. 기존 트리거를 먼저 disabled로 확보한 뒤 item 재활성화·`-1`·STAT(on)을 수행하고, cache hold 만료는 무조건 enable이 아니라 명시적 실패/운영 상태로 남겨야 합니다.

## 🟡 권장

1. **Zabbix 단계 예외 시 U3 수치가 거짓 0이 됩니다.** `ZabbixSyncResult.failed()`는 실제 장부 상태를 조회하지 않고 `commandsPending`·`commandsDead` 등을 모두 0으로 만듭니다: [ApmAlertEvaluationService.java:252](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:252>). 잡 메시지는 이 요약을 그대로 사용합니다: [ApmAlertEvaluationJob.java:92](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationJob.java:92>). 실패 시에도 장부 상태를 집계하거나 `unknown`으로 구분하는 편이 정확합니다.

2. **foreign host 한 건이 대상 수만큼 PROVISION DEAD를 생성할 수 있습니다.** 일괄 확인은 host를 정확히 foreign으로 식별하지만, `repair()`가 모든 target에 개별 PROVISION을 적재합니다: [ApmAlertZabbixPhase.java:173](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:173>), [ApmAlertZabbixPhase.java:178](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:178>), [ZabbixAlertBridge.java:1701](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1701>). 기존 PROVISION 상태와 dedup이 반복 폭주는 막지만, 최초 1,000개 대상이면 1,000개 명령과 host 조회가 발생합니다. host-level 충돌은 단계에서 단락하거나 실행기에서 공유 진단하는 방식을 권장합니다.

3. **호스트 생성 직렬화는 JVM-local 최적화입니다.** `synchronized(hostCreateLock)`은 같은 인스턴스 안에서만 의미가 있습니다: [ZabbixAlertBridge.java:420](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:420>). 다중 인스턴스에서는 동시 `host.create` 중 하나가 실패한 뒤 재시도로 수렴합니다. 안전성 문제는 아니지만 HA 의미의 직렬화로 설명하면 안 되며, 가능하면 “already exists” 응답 직후 재조회로 2분 백오프를 줄이는 편이 좋습니다.

4. 새 설정 키 두 개는 기본값만 코드에 있습니다: [ApmAlertZabbixPhase.java:80](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:80>), [ApmZbxPushCurrentExecutor.java:75](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxPushCurrentExecutor.java:75>). 운영 가시성을 위해 `application.yml`에 명시하는 것을 권장합니다.

## 이관 목록

- **단위 7 — 합본 전 필수:** 1초 장부의 `@Transactional` 내부 `ensureProvisioned`·`pushAll`과 lane 밖 직접 push 제거: [ApmStuckRequestLedger.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:119>), [ApmStuckRequestLedger.java:132](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:132>), [ApmStuckRequestLedger.java:156](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:156>).

- **단위 6b — 합본 전 필수:** 대조의 트랜잭션 내부 `retryPendingTriggerStatus`·`applyOurDefinition`과 진단 read-only 트랜잭션 내부 Zabbix 조회 제거. 대조에서 켜는 경로도 동일한 neutralization 순서를 적용해야 합니다: [ApmAlertSyncService.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:123>), [ApmAlertSyncService.java:131](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:131>), [ApmAlertSyncService.java:183](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:183>), [ApmAlertService.java:354](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:354>).

- **단위 8 — 합본 전 필수:** 사용자 확정대로 DEAD 목록·`blockedBy`·개별 retry-dead와 운영 절차를 제공해야 합니다. 자동 DEAD 부활 요구는 하지 않습니다.

- **독자 알림 창구:** 사용자 확정대로 대기 유지합니다.

## 🟢 참고

- `evaluateAll`과 Zabbix 단계 모두 활성 외부 트랜잭션을 거부하며, 판정 경로에서 Zabbix I/O는 발견하지 못했습니다: [ApmAlertEvaluationService.java:343](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:343>), [ApmAlertZabbixPhase.java:96](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:96>).

- 판정과 PROVISION·PUSH_CURRENT 적재는 같은 커밋이며, 재시작 후 주기 worker가 장부를 drain합니다. 판정 커밋 직후 crash로 인한 명령 유실은 없습니다: [ApmAlertEvaluationService.java:531](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:531>), [ApmZbxCleanupService.java:300](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:300>), [ApmZbxCommandWorker.java:142](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:142>). 위 🔴1은 그 이후 PROVISION 외부 쓰기와 기록 ② 사이의 별도 crash 창입니다.

- 일괄 존재 확인은 host·item·trigger의 owner 및 정확 식별 태그를 다시 검사하므로 남의 객체를 우리 것으로 오인하는 경로는 발견하지 못했습니다: [ZabbixAlertBridge.java:1657](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1657>), [ZabbixAlertBridge.java:1774](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1774>).

- §13.5 D1의 `-1 → STAT(on) → 현재 값` 선택 자체는 lane 모델과 맞습니다. 반려 사유는 이 순서를 우회하거나 crash 때 잃는 예외 경로입니다. D3 DEAD 비부활, D4 host 캐시 제거, D5 옛 이름만 정렬, D6 조건부 eventid UPDATE, D7 bounded wait는 수용 가능합니다.

- 자동 `item.delete`는 없고 비활성화만 하며, 꺼진 우리 item은 `status:0`으로 재사용합니다: [ApmZbxCommandType.java:46](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:46>), [ZabbixAlertBridge.java:535](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:535>).

- 읽기 전용 조건에 따라 테스트는 실행하지 않았고 파일도 수정하지 않았습니다. 누적 diff와 실제 워크트리·테스트 소스를 정적으로 대조했습니다.
