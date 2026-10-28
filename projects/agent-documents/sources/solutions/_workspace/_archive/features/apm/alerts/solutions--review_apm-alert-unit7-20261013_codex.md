## 판정

**반려**

장부 트랜잭션 내부의 Zabbix I/O 제거, 커밋 후 dispatch, 롤백 시 실행 방지, urgent queue 거절 후 회수 경로는 대체로 올바릅니다. 그러나 lifecycle 명령이 아직 전달되지 않은 `PUSH_CURRENT`를 삭제하는 **확정적인 명령 유실 경로**가 남아 있어 1차 검수는 반려합니다.

## 🔴 필수

### 1. PROVISION/lifecycle 적재가 대기 중인 최신 걸림 값을 삭제합니다

- `enqueue()`는 새 plan의 `lifecycleResources`에 해당하는 모든 `PENDING`·`DEAD` `PUSH_CURRENT`를 먼저 삭제합니다: [ApmZbxCommandStore.java:310](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:310>).
- `Plan`은 `command().lifecycle()`인 모든 명령을 `lifecycleResources`에 포함하므로, 존재 보장용 `PROVISION`도 삭제를 일으킵니다: [ApmZbxCommandStore.java:497](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:497>).
- 현재 통합 테스트도 이 문제를 정상 동작처럼 허용합니다. 평가용 `PROVISION` 때문에 값 `0`이 Zabbix에 도달하지 않을 수 있다고 명시한 뒤, 최종 값이 아니라 command row가 사라진 것만 검사합니다: [ApmStuckRequestLedgerIT.java:327](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmStuckRequestLedgerIT.java:327>), [ApmStuckRequestLedgerIT.java:329](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmStuckRequestLedgerIT.java:329>).
- 설계의 남은 의문 1도 동일한 위험을 지적합니다: [apm-alert-unit5-6-design-20261011.md:587](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:587>).

이는 fire/settle 직후 standalone repair·rule update·평가 `PROVISION`이 끼면 최신 양수값 또는 settle의 `0`이 영구 삭제되는 **명령 유실·상태 데이터 손실**입니다.

수정 방향:

- 존재 보장·활성화 목적의 `PROVISION`, hard `RPUSH`, `STAT(on)`은 `PUSH_CURRENT`를 삭제하지 말고 선행 edge만 추가해야 합니다.
- `STAT(off)`, soft `RPUSH`, `RCONF`, 명시적 폐기처럼 기존 projection을 실제로 무효화하는 명령만 supersede 대상으로 제한하십시오.
- 위 테스트를 `commandCount()==0`이 아니라 “standalone lifecycle 이후에도 최신 걸림 값 또는 settle `0`이 실제 Zabbix에 마지막 값으로 전달됨”으로 변경해야 합니다.
- fire 양수값과 settle `0`, 이미 실행 중인 lifecycle과 새 lifecycle 적재를 각각 회귀 테스트해야 합니다.

## 🟡 권장

### 1. Clock 역전은 현재 🟡이지만 합본 전 실측이 필요합니다

평가 job은 트랜잭션·parent lock 진입 전에 `now`를 만들고, 그 시각으로 command clock을 생성합니다: [ApmAlertEvaluationJob.java:87](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmAlertEvaluationJob.java:87>), [ApmAlertEvaluationService.java:419](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmAlertEvaluationService.java:419>), [ApmAlertEvaluationService.java:425](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmAlertEvaluationService.java:425>). 반면 monitor API는 `tickMs`를 보유하면서도 호출자에게 값만 반환합니다: [ApmStuckRequestMonitor.java:128](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmStuckRequestMonitor.java:128>), [ApmStuckRequestMonitor.java:378](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmStuckRequestMonitor.java:378>).

성공한 command row는 삭제되므로 완료된 값에 대한 영속 watermark도 없습니다: [ApmZbxCommandStore.java:1258](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:1258>). 따라서 늦게 깨어난 평가가 이미 처리된 settle `0` 뒤에 오래된 양수값을 전송할 수 있습니다.

Zabbix의 `history.push.clock`은 수집 시각이고, `last()`는 최신값을 선택하지만 같은 초에 여러 값이 들어오면 정확한 순서를 보장하지 않는다고 문서화되어 있습니다: [history.push 문서](https://www.zabbix.com/documentation/current/en/manual/api/reference/history/push), [history function 문서](https://www.zabbix.com/documentation/current/en/manual/appendix/functions/history). 이 늦은 값이 실제 false Problem을 다시 여는지는 현재 코드·테스트만으로는 **추정**이므로 🟡입니다.

합본 전 Zabbix 7.x에서 “새로운 `0` → 오래된 양수값”과 같은 초 `-1/0/양수` 순서를 실측하십시오. 오래된 값이 `last()`나 trigger 상태를 되돌리면 즉시 🔴로 승격해야 합니다. 근본 수정은 monitor의 값과 함께 sample version/timestamp를 전달하고, binding별 마지막 적용 version을 영속화하여 executor가 오래된 projection을 폐기하는 것입니다. 단순히 lock 뒤에서 `now`를 다시 구하는 것만으로는 stale snapshot 문제가 해결되지 않습니다.

### 2. Urgent queue 64개 포화·거절 회귀 테스트가 없습니다

거절된 작업은 command가 DB에 남은 채 `wakeNow()`로 전환되고, 15초 주기 drain도 다시 회수합니다: [ApmZbxCommandWorker.java:162](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandWorker.java:162>), [ApmZbxCommandWorker.java:385](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandWorker.java:385>). 따라서 코드상 명령 유실은 확인되지 않았습니다.

다만 현재 포화 테스트는 common pool 대상이며 urgent 단일 thread와 64개 queue의 실제 거절 경로를 고정하지 않습니다: [ApmZbxCommandWorkerTest.java:261](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxCommandWorkerTest.java:261>). `1 running + 64 queued + 1 rejected`를 만든 뒤 rejected command가 `PENDING`으로 남고 tick/drain에 의해 실행되는 테스트를 추가하는 것이 좋습니다.

### 3. ArchUnit은 직접 호출은 고정하지만 우회 호출까지 막지는 않습니다

6개 규칙은 ledger/monitor/evaluation에서 bridge write 및 worker/executor 직접 호출을 금지합니다: [ApmZbxWriteSingleEntryTest.java:36](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxWriteSingleEntryTest.java:36>), [ApmZbxWriteSingleEntryTest.java:78](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxWriteSingleEntryTest.java:78>), [ApmZbxWriteSingleEntryTest.java:93](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxWriteSingleEntryTest.java:93>). 현 구현에 대한 방어선으로는 유효하지만 wrapper를 통한 간접 호출이나 새 이름의 legacy method까지 막는 구조적 증명은 아닙니다.

또한 APC-05의 일부 지연 검증은 존재하지만, §4.9의 전체 5초 지연 행렬을 그대로 고정한 테스트는 확인되지 않았습니다: [ApmAlertEvaluationZabbixPhaseIT.java:663](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/alert/ApmAlertEvaluationZabbixPhaseIT.java:663>), [ApmStuckRequestLedgerIT.java:243](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmStuckRequestLedgerIT.java:243>). 정확한 APC-05 acceptance test 보강을 권장합니다.

## 이관 목록

- **단위 8:** 이미 `PROVISION DEAD`인 경우 새 push를 만들지 않습니다: [ApmZbxCleanupService.java:332](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCleanupService.java:332>). 실행 도중 PROVISION이 DEAD가 되면 기존 push는 dependency에 묶여 claim되지 않고, 600초 max age도 다시 claim된 후에야 평가됩니다: [ApmZbxCommandStore.java:850](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:850>), [ApmZbxCommandStore.java:1403](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:1403>), [ApmZbxPushCurrentExecutor.java:130](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxPushCurrentExecutor.java:130>). DEAD 회복 창구와 `blockedBy` 가시화에서 이 운명을 명시적으로 처리해야 합니다. 자동 부활 요구는 아닙니다.
- **단위 6b:** 남아 있는 legacy sync의 트랜잭션 내부 bridge 경로 대조: [ApmAlertSyncService.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmAlertSyncService.java:123>), [ApmAlertSyncService.java:173](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmAlertSyncService.java:173>).
- **별도 알림 창구:** edge notification/outbox는 설계대로 대기 상태입니다: [apm-alert-unit5-6-design-20261011.md:335](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:335>).
- 단위 7은 위 필수 수정 후에도 6b·8과 함께 합본하며 단독 배포하지 않습니다.

## 🟢 참고

- fire/settle은 장부 트랜잭션에서 DB command만 적재합니다: [ApmStuckRequestLedger.java:126](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/alert/ApmStuckRequestLedger.java:126>), [ApmZbxCleanupService.java:323](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCleanupService.java:323>). Zabbix I/O는 확인되지 않았습니다.
- dispatch는 `afterCommit`에서만 실행되어 rollback 유령 실행을 방지합니다: [ApmZbxCommandWorker.java:348](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandWorker.java:348>), [ApmZbxCommandWorkerTest.java:225](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxCommandWorkerTest.java:225>).
- 동일 resource는 `PROCESSING` partial unique와 claim 조건으로 중복 실행이 차단됩니다: [ApmZbxCommandStore.java:843](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandStore.java:843>). 기본 동시 호출 상한은 common 4개와 urgent 1개로 총 5개입니다: [ApmZbxCommandWorker.java:132](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxCommandWorker.java:132>).
- 꺼진 우리 아이템은 `status:0` 재활성화 후 `-1 → trigger on → current value` 순서를 유지하는 테스트가 있습니다: [ApmStuckRequestLedgerIT.java:197](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmStuckRequestLedgerIT.java:197>), [ApmZbxProvisionExecutor.java:291](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxProvisionExecutor.java:291>). `FOREIGN` 판정 시 write 대신 DEAD 처리합니다: [ApmZbxPushCurrentExecutor.java:137](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ApmZbxPushCurrentExecutor.java:137>).
- 자동 삭제 대신 cleanup은 `status:1`, 재활성화는 `status:0`을 사용합니다: [ZabbixAlertBridge.java:1159](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ZabbixAlertBridge.java:1159>), [ZabbixAlertBridge.java:1290](</C:/worktrees/apm-c05-followup/src/main/java/com/moveseye/apm/zabbix/ZabbixAlertBridge.java:1290>).
- 삭제된 `ensureProvisioned`, `pushAll`, `PushRequest`의 잔존 호출처는 전체 검색에서 확인되지 않았습니다. A1·A2의 existence-only 의미도 실제 write 없음과 metadata 보존으로 유지됩니다: [ApmZbxProvisionIT.java:87](</C:/worktrees/apm-c05-followup/src/test/java/com/moveseye/apm/zabbix/ApmZbxProvisionIT.java:87>).
- 이번 검수는 읽기 전용 정적 검수이며 파일 수정과 테스트 실행은 하지 않았습니다.
