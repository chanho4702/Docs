## 판정

**조건부 진행** — 6b 구조와 6c 분리는 타당하지만, 동일 의사 재적재 방지, `m:` DEAD alias 확인, `HOST_MISSING` 처리 규칙을 구현 전에 착수본에 명시해야 한다.

## 2차 지적 해소 확인

| 2차 지적 | 판정 | 근거 |
|---|---|---|
| 🔴1 ON 복구 | **해소** | ON 대조가 `enqueueRestore`로 정정됐다. 이 경로는 RCONF 취소 후 hard RPUSH → STAT만 적재하며 PROVISION을 추가하지 않는다. `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:724`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:273`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:278`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:285`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:290` |
| 🔴2 억제 규칙 | **부분 해소** | DEAD와 DEAD 선행에 막힌 명령을 각각 `skippedDead`, `blockedByDead`로 구분한 것은 맞다. 그러나 나머지 PENDING·PROCESSING을 무조건 재적재하는 규칙은 동일 의사에도 upsert를 실행한다. `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:726`, `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:729`, `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:731` |
| 🔴3 resource 키 연관 | **부분 해소** | 정규 RCONF·DELETE_TRIGGER는 `b:` resource로 묶을 수 있지만, `DELETE_ITEM`은 `i:` lane이고 식별 불가 명령은 `m:`이다. 따라서 `bindingResource`만 조회해서 모든 lifecycle 명령을 포괄한다는 주장은 맞지 않는다. `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandKeys.java:13`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandKeys.java:15`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandKeys.java:17`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandKeys.java:18`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:51` |
| 🔴4 같은 회차 PROVISION | **대부분 해소, 한 항목 보완 필요** | `ITEM_MISSING`·`TRIGGER_MISSING`·`ITEM_DISABLED`에서는 PROVISION이 생성 또는 내부 hard RPUSH → STAT로 상태를 수렴시키고, `LEGACY_NAME`만 별도 상태 묶음을 허용한 방향은 맞다. 다만 실제 enum의 `HOST_MISSING`이 생략됐다. `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:734`, `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:736`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1554`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1557`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1621` |

## 🔴 필수

1. **PENDING·PROCESSING을 무조건 재적재하지 말아야 한다.**

   upsert는 상태와 무관하게 `generation+1`을 수행하고 `next_attempt_at`을 현재 시각 쪽으로 당긴다. PROCESSING이면 현재 실행의 완료 CAS가 깨져 즉시 `REQUEUED`된다. 같은 의사의 대조가 반복되면 실행 취소·재실행 churn이 생길 수 있다. 이는 코드에 근거한 정적 추론이다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:679`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:680`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:681`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1308`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1314`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1318`

   착수본은 다음처럼 구분해야 한다.

   - 현재 원하는 의사를 이미 나타내는 PENDING·PROCESSING: skip
   - 반대 방향 RPUSH 또는 취소된 RCONF 등 최신 의사 반영이 필요한 경우: upsert/취소
   - 비강제 PROVISION이 기존 강제 PROVISION과 충돌하는 경우: 기존 강제를 약화시키지 않음

2. **`m:` DEAD alias를 dedup 기준으로 함께 확인해야 한다.**

   `laneStates(b:...)`만 확인하면 같은 dedup의 기존 DEAD 행이 `m:`에 있을 때 이를 놓친다. 이후 enqueue하면 `ON CONFLICT`가 DEAD를 PENDING으로 부활시키고 정규 lane으로 re-key한다. 이는 “DEAD 자동 부활 금지”와 직접 충돌한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:727`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:682`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:723`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:728`

   resource 조회와 함께 이번 회차에 생성할 dedup key의 기존 상태를 확인하거나, `lockExisting`의 id·alias 탐색 규칙을 재사용하는 alias-aware preflight가 필요하다. `DELETE_ITEM(i:)` DEAD가 binding lane을 차단하는지 여부도 명시적으로 결정해야 한다.

3. **같은 회차 생략 목록에 `HOST_MISSING`을 포함해야 한다.**

   `HOST_MISSING`이면 PROVISION이 host·item·trigger를 만들고 새 trigger에 원하는 status를 적용하므로 별도 상태 묶음은 필요 없다. 현재 문구는 실제 `ProvisionNeed` enum과 불일치한다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1554`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1557`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1621`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1407`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1414`

## 🟡 권장(구현 중 반영할 것)

- `laneStates` 결과에 command/dedup 또는 의사 방향을 포함해 동일 의사 skip과 반대 의사 merge를 코드에서 명시적으로 구분한다.
- `m:b:*` DEAD → 정규 `b:*` 적재, 동일 PROCESSING 반복 대조, `HOST_MISSING`, `LEGACY_NAME` 양쪽 실행 순서를 각각 IT로 고정한다.
- `skippedDead`, `blockedByDead`, `merged`, `repairsQueued`, `statusQueued` 분리는 적절하다. 동일 의사 skip도 별도 집계하면 운영 진단이 더 명확하다. `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:738`
- 6b 커밋에서는 `notify/*`, 채널 상태 스키마, 활성화 API를 건드리지 않는 diff 경계를 유지하고, 채널 구현을 출시하기 전에 6c를 완료해야 한다.

## 🟢 확인된 것

- **6c 분리는 타당하다.** 2차 🔴5~8은 채널 activation generation·커서·VERIFY·57014·FIRED/RESOLVED 재구성 문제로, 6b의 Zabbix 대조 및 상태 진단과 독립적이다. `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:722`
- 현재 알림 결함은 이미 단위 4 코드에 존재한다. RESOLVED 적재는 기존 FIRED를 요구하고, 재조정 쿼리도 resolved+FIRED 없음 행을 선택하지 않는다. 6b 범위만 구현하면 이 결함을 악화시키지 않는다. `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:71`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:79`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:378`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:384`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:400`
- 현재 운영 채널 빈은 0개이며, registry가 비면 outbox가 즉시 반환한다. 따라서 6c 연기가 현재 배포에 즉시 영향을 주지는 않는다. `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelRegistry.java:13`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelRegistry.java:48`, `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:49`
- **soft/hard 병합 방향은 맞다.** 새 target이 오른쪽에서 병합되어 최신 `hard`가 우선하고, hard 전환 시 `neutralize` 및 재확인 카운터가 제거된다. cutoff는 최대값으로 보존된다. `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:706`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:710`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:712`
- PROVISION의 `enforce`는 OR 병합이므로 비강제 대조가 기존 강제 의사를 약화시키지 않는다. `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:685`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:688`
- STAT은 실행 시점 DB에서 원하는 상태를 다시 읽으므로 최신 ON/OFF 의사에 수렴한다. `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:74`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:85`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:128`
- **`LEGACY_NAME`의 실행 순서 무관 주장은 맞다.** 비강제 PROVISION은 기존 trigger에서 이름만 정렬하고 status를 건드리지 않는다. 따라서 PROVISION→Restore이면 이후 STAT이 상태를 맞추고, Restore→PROVISION이면 뒤 PROVISION이 맞춰진 status를 보존한다. `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1367`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1370`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1374`
- HEAD `bad215d`와 문서만 정적으로 검수했다. 파일 수정 및 테스트 실행은 하지 않았다.
