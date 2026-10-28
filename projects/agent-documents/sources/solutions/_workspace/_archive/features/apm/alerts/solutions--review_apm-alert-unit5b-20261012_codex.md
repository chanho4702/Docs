## 판정

**반려**

다음 두 건이 각각 **남의 객체 변경·영구 정체 가능성**과 **명령 순서 위반**에 해당한다. 이 브랜치가 단독 배포되지 않더라도 합본 배포 전에는 반드시 해소되어야 한다.

## 🔴 필수

1. **캐시된 host는 소유권을 재검증하지 않아 남의 host를 오염시키거나 PROVISION이 영구 재시도될 수 있다.**

   - `cachedHostId`가 있으면 `host.get`과 owner tag 확인 없이 즉시 반환한다: [ZabbixAlertBridge.java:412-430](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:412>).
   - 캐시는 `ensureHost()` 자체가 예외를 낼 때만 비워진다: [ZabbixAlertBridge.java:1356-1362](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1356>).
   - 실제 item·trigger 호출 실패는 그 이후에 발생하므로 캐시가 유지된다: [ApmZbxProvisionExecutor.java:119-149](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:119>).
   - 캐시 적재 후 host의 owner tag가 제거되면 이후 PROVISION이 소유권 확인 없이 그 host에 item·trigger를 생성한다. host가 삭제되어 cached ID가 무효가 된 경우에는 모든 재시도가 같은 ID를 사용해 영구 정체될 수 있다.
   - 기존 일괄 `provision()`은 전체 과정 실패 시 캐시를 비웠다는 점에서도 회귀다: [ZabbixAlertBridge.java:320-344](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:320>).

   **필요 조치:** 쓰기 직전 cached host의 존재와 owner tag를 검증하거나, 하위 item·trigger 실패 시 캐시 무효화 후 소유권을 다시 확인해야 한다. `캐시 적재 → tag 제거`, `캐시 적재 → host 삭제` 테스트도 필요하다.

2. **고아 복귀가 PROCESSING 상태의 soft RESOLVE_PUSH를 삭제해도 이미 실행 중인 작업은 `-1`을 계속 밀 수 있다.**

   - 복귀 경로는 RPUSH를 상태와 무관하게 취소한다: [ApmZbxCleanupService.java:266-276](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:266>).
   - `cancel()`은 PROCESSING 행도 물리 삭제한다: [ApmZbxCommandStore.java:371-385](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:371>).
   - RESOLVE_PUSH 실행기는 push 직전에 `ctx.renew()`나 취소 세대 검증을 하지 않는다: [ApmZbxResolvePushExecutor.java:44-81](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:44>).
   - 고아 복귀는 binding 상태를 복구한 뒤 위 취소·STAT 경로를 태운다: [ApmAlertOrphanSweeper.java:196-197](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:196>).

   따라서 이미 claim된 RPUSH가 취소 후에도 `-1`을 전송하여, 복귀 뒤의 현재값 push나 STAT(on)보다 늦게 도착할 수 있다. 이 경우 활성 trigger에 과거 값을 덮어써 RECOVERY 및 다음 평가의 재발화를 유발할 수 있다는 부분은 **추정**이지만, 취소된 명령의 외부 쓰기가 뒤늦게 실행되는 순서 위반 자체는 확정적이다.

   단순히 push 직전 `renew()`를 한 번 넣는 것으로는 그 직후 취소되는 경쟁을 막지 못한다. lane 세대 fencing 또는 6a의 `PUSH_CURRENT → STAT(on)`까지 포함한 내구성 있는 순서 보장이 필요하다. 구현 위치가 6a여도 합본 게이트에서는 🔴로 유지해야 한다.

## 🟡 권장

1. **facade가 binding 없는 RCONF를 실행 대상으로 포함하면서 완료 판정에서는 제외한다.**

   실행 ID에는 resource lane 명령을 포함하지만, 잔여 수는 `pendingIdsForBindings()`만 센다: [ApmAlertRuleWriteFacade.java:63-77](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWriteFacade.java:63>). RCONF는 `bindingId=null`이므로 RPUSH·STAT이 끝나고 RCONF만 남았을 때 `pendingCommands=0`, `APPLIED`로 응답할 수 있다. 잔여 판정도 resource lane 기준으로 합쳐야 한다.

2. **같은 정확 태그의 우리 trigger가 중복이면 하나만 갱신한다.**

   STAT은 중복을 경고한 뒤 첫 번째만 변경한다: [ApmZbxTriggerStatusExecutor.java:93-105](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:93>). PROVISION도 같은 방식이다: [ZabbixAlertBridge.java:1400-1414](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1400>). 정확 태그 중복이 존재하면 일부가 계속 활성화되거나 이전 threshold를 유지한다. 남의 trigger는 건드리지 않되, 정확 소유 태그 중복 전체를 수렴시키는 편이 안전하다.

3. **규칙 목록의 명령 요약은 rule별 조회 N+1이다.**

   목록 변환 루프에서 각 rule의 `summarize()`가 실행되고, 그 안에서 binding 명령을 다시 조회한다: [ApmAlertService.java:149-157](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:149>), [ApmAlertService.java:1582-1587](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1582>). 목록 크기 상한이 코드에 명시되어 있지 않으므로 bulk 조회 후 map으로 전달하는 것이 좋다.

4. 다음 경쟁·복구 테스트를 추가하는 것이 좋다.

   - cached host 소유권 제거·host 삭제
   - PROCESSING RPUSH와 고아 복귀 사이 latch
   - RCONF만 남은 facade 응답
   - 정확 소유 태그 trigger 중복
   - 기록② 이후 완료 전 lease 만료·재claim
   - V80의 service 외 collector·SLO·fallback scope

## 이관 목록

- **6a**
  - 신규 binding은 현재 PROVISION만 받는다: [ApmAlertService.java:1037-1046](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1037>). 반면 PROVISION은 꺼진 item을 즉시 켜고 trigger도 enforce한다: [ZabbixAlertBridge.java:1370-1426](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1370>). 신규·비활성 item의 stale positive 값에 대해 `PROVISION → PUSH_CURRENT → STAT(on)` 상당의 안전한 단계화가 필요하다.
  - 평가 트랜잭션 안의 기존 Zabbix 호출 제거: [ApmAlertEvaluationService.java:266-289](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:266>), [ApmAlertEvaluationService.java:426-430](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:426>).
  - U3 구조화 결과 필드와 non-enforce PROVISION 이후 trigger 이름 정렬 책임.

- **7**
  - 1초 stuck ledger의 트랜잭션 내부 `ensureProvisioned`·`pushAll` 제거: [ApmStuckRequestLedger.java:119-156](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/stuck/ApmStuckRequestLedger.java:119>).

- **6b**
  - `zabbixStatus()`의 read-only 트랜잭션 내부 Zabbix 조회 제거: [ApmAlertService.java:351-353](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:351>).
  - 02:00 대조의 기존 외부 호출 제거: [ApmAlertSyncService.java:123-131](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:123>), [ApmAlertSyncService.java:173-225](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:173>).
  - 현재 PROVISION pending binding 건너뜀은 구현되어 있다: [ApmAlertSyncService.java:173-179](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:173>), [ApmZbxCommandStore.java:1014-1019](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1014>). 다만 binding 부재·legacy 경로까지 포함한 완전한 명령화는 6b 책임이다.
  - ArchUnit은 일부 write method만 금지하여 위 read 및 legacy 호출은 검출하지 못한다: [ApmZbxWriteSingleEntryTest.java:28-58](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxWriteSingleEntryTest.java:28>).

- **8**
  - 독자 알림 창구는 사용자 결정대로 대기 유지한다.

이 트랜잭션 내부 외부 I/O 항목들은 각 후속 단위로 이관할 수 있지만, **6a·7·6b가 빠진 상태로 합본 배포하면 🔴 기준 위반**이다.

## 🟢 참고

- PROVISION의 기록①/② 및 보상 재적재 구조는 적절하다: [ApmZbxProvisionExecutor.java:134-149](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:134>), [ApmZbxProvisionExecutor.java:181-236](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:181>). 외부 성공 뒤 재실행도 정확 태그 검색을 통해 수렴한다.
- `DEFERRED`는 시도 수를 되돌리고 lease를 해제하며, 동일 세대에는 지연·새 세대에는 즉시 재개한다: [ApmZbxCommandStore.java:1228-1249](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1228>). 이 동작 자체에서 영구 정체는 발견하지 못했다.
- 예약 insert 후 family lock, DELETE의 family lock 후 참조 재조회는 잠금 순서와 잔해 방지 의도에 부합한다: [ApmZbxCommandStore.java:889-940](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:889>), [ApmZbxDeleteExecutor.java:209-234](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:209>).
- PROVISION·STAT의 rank 1 변경과 `RPUSH → PROVISION` edge는 기존 허용 edge를 깨지 않으며, 끄기·켜기 R1 대응 취지에 맞는다: [ApmZbxCommandType.java:23-47](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:23>), [ApmZbxCommandType.java:94-105](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:94>).
- facade의 커밋 후 실행, 3초 제한, pool 거절 시 QUEUED, `cancel(true)` 금지는 구현되어 있다: [ApmAlertRuleWriteFacade.java:41-80](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWriteFacade.java:41>), [ApmZbxCommandWorker.java:116-126](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:116>), [ApmZbxCommandWorker.java:252-274](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:252>).
- V80은 marker를 STAT으로 upsert한 뒤 marker만 지우므로 재실행에 안전하다: [V80__migrate_apm_trigger_status_pending.sql:21-59](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V80__migrate_apm_trigger_status_pending.sql:21>). 재실행 및 DEAD 부활 테스트도 있다: [V80MigrationIT.java:48-95](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/V80MigrationIT.java:48>).
- 응답 변경은 기존 필드를 제거하지 않은 추가형이다. `queued`·`commandFailed`, `zabbixApply`, `commands`가 기존 생성자 호환과 함께 추가됐다.
- read-only 검수 조건 때문에 테스트와 mutation은 재실행하지 않았다. 요청서에 기재된 통과 결과와 정적 코드를 대조했다.

## 의견 요청 답

1. **신규·비활성 item의 `-1` 단계 부재**

   5b만 단독 배포하지 않는 전제에서는 구현을 6a `PUSH_CURRENT`로 넘길 수 있다. 다만 PROVISION이 trigger를 먼저 활성화한 뒤 PUSH_CURRENT를 하는 단순 순서는 충분하지 않다. `trigger disabled 확보 → 현재값 push → STAT(on)` 또는 동등한 fencing이 필요하며, 합본 배포 게이트에서는 필수다.

2. **규칙 목록 N+1**

   기능상 차단 사유는 아니지만 목록 크기 상한이 없으므로 bulk 조회로 바꾸는 것을 권장한다. 6b에서 상태 조회 경로를 재구성할 때 함께 처리해도 된다.

3. **`zabbixStatus()`를 6b로 이관 가능한가**

   가능하다. 단, 현재는 `@Transactional(readOnly=true)` 안에서 외부 I/O를 하므로 6b 완료가 합본 배포의 필수 선행조건이어야 한다. DB snapshot과 Zabbix 조회를 트랜잭션 경계 밖으로 분리해야 한다.

4. **설계와 다른 결정 5건**

   1. PROVISION rank 1과 `RPUSH → PROVISION`: **수용 가능**. 기존 edge를 깨지 않고 R1 방지 목적에 부합한다.
   2. 기록②와 명령 완료 분리: **수용 가능**. exact lookup과 generation CAS로 재실행 수렴한다. 실제 lease 만료 재claim 테스트는 추가 권장이다.
   3. non-enforce PROVISION의 trigger 이름 미정렬: **5b 임시 수용 가능**. 6a가 legacy 평가 경로를 제거할 때 정렬 책임을 명시적으로 인수해야 한다.
   4. U3 구조화 필드의 6a 이관: **수용 가능**.
   5. hard RPUSH에서 item missing·disabled 완료 처리: **조건부 수용 가능**. PROVISION dependency의 영구 정체를 피하는 판단은 맞지만, 신규·비활성 item의 stale value 문제는 해결하지 않는다. 6a의 ordered `PUSH_CURRENT`가 합본 전 반드시 결합되어야 한다.
