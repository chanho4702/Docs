## 판정

**반려** — 1차 🔴2·3은 해소됐지만, guard의 전체 관찰 범위 잠금과 트랜잭션 전체의 잠금 순서에 공백이 있고, ID 없는 바인딩에서는 `m:` RCONF를 여전히 놓친다.

파일 수정·테스트 실행 없이 정적으로 검수했다. 아래 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이며, 테스트는 대응하는 `src/test/java/.../alert/` 기준이다.

## 1차 지적 해소 확인

| 지적 | 확인 결과 |
|---|---|
| 🔴1 `m:` DEAD RCONF 누락 | **부분 해소.** binding에 trigger ID가 있으면 `RCONF:t…`·`RCONF:g…`와 `zt:…`를 넘긴다. 가족 잠금 → resource 잠금 → extra dedup 포함 `FOR UPDATE` → guard 순서이며, skip이면 취소하지 않는다. 다만 아래 필수 사항이 남는다. `bridge/ApmZbxCleanupService.java:459`, `command/ApmZbxCommandStore.java:329`, `command/ApmZbxCommandStore.java:339`, `bridge/ApmZbxCleanupService.java:469` |
| 🔴2 blocked PROVISION 은폐 | **해소.** live PROVISION의 `blockedByDead`를 확인해 `BLOCKED_BY_DEAD`로 반환하며, `needsAttention()`에도 포함된다. `bridge/ApmZbxCleanupService.java:483`, `sync/ApmAlertSyncService.java:312`, `sync/ApmAlertSyncService.java:150`. 대응 IT: `sync/ApmAlertSyncIT.java:288` |
| 🔴3 객체가 이미 있는 신규 바인딩의 PROVISION 누락 | **해소.** `need=NONE`이어도 item/trigger ID 중 하나가 null이면 비강제 PROVISION을 적재한다. 신규 예약 바인딩도 이 분기에 들어간다. `sync/ApmAlertSyncService.java:307`, `sync/ApmAlertSyncService.java:328`. 대응 IT: `sync/ApmAlertSyncIT.java:306` |

## 🔴 필수

1. **guard가 읽는 lane 전체가 실제로 잠기지는 않는다.**

   `laneRows()`는 dedup뿐 아니라 같은 lane의 모든 lifecycle 행을 읽는다. 반면 `lockExisting()`의 lifecycle 행 잠금은 `p.pushResources`를 사용하고, 이 목록은 **`PUSH_CURRENT` spec이 있을 때만** 채워진다. 대조의 PROVISION·복귀 묶음에는 해당 spec이 없으므로, 입력 dedup에 없는 같은 lane 행은 guard에 보이면서도 잠기지 않는다.

   근거: `command/ApmZbxCommandStore.java:530`, `command/ApmZbxCommandStore.java:623`, `command/ApmZbxCommandStore.java:638`, `command/ApmZbxCommandStore.java:1203`.

   따라서 다른 lifecycle 행의 DEAD 전환과 guard를 직렬화한다는 보장이 성립하지 않는다. lifecycle의 `dead()`는 resource advisory 없이 자기 행을 UPDATE한다. `command/ApmZbxCommandStore.java:1467`, `command/ApmZbxCommandStore.java:1519`.

   **1차에서 “lane 전체가 같은 잠금 범위”라고 본 판단은 정정한다.** `lockPlan`에 guard용 lane 범위도 포함해, 관찰 대상 행을 한 문장에서 id순으로 잠가야 한다.

2. **`LEGACY_NAME` 복구와 복귀를 연속 적재하면 가족 잠금을 늦게 잡는다.**

   같은 대상 트랜잭션에서 먼저 `reconcileProvision()`이 resource advisory와 행 잠금을 잡는다. 이후 상태 대조가 `reconcileRestore()`를 호출하면서 새 `zt:{trigger}` 가족 잠금을 획득한다. 실제 획득 순서는 **resource·행 → 가족**이 된다.

   근거: `sync/ApmAlertSyncService.java:325`, `sync/ApmAlertSyncService.java:367`, `bridge/ApmZbxCleanupService.java:418`, `bridge/ApmZbxCleanupService.java:461`, `command/ApmZbxCommandStore.java:331`. 이 조합 자체는 `sync/ApmAlertSyncIT.java:213`에도 있다.

   `enqueueGuarded()` **한 번 내부의 순서는 맞지만**, 트랜잭션 전체 순서는 맞지 않는다. 반대쪽에서 가족 → resource를 잡는 적재와의 교착 가능성은 정적 추론이며 실행 재현은 하지 않았다. 대상별로 필요한 가족·resource·기존 행 범위를 첫 적재 전에 함께 산출해야 한다.

3. **binding의 trigger ID가 null이면 inventory에서 확인한 `m:` RCONF를 놓친다.**

   `ReconcileTarget`은 binding의 `zbx_triggerid`만 받는다. inventory의 정확한 trigger ID는 전달하지 않는다. 따라서 다음 상태에서는 `RCONF:t…`와 가족 키가 빠진다.

   - Zabbix에는 정확한 트리거가 있고 꺼져 있음
   - binding의 trigger ID는 null
   - 해당 실제 trigger ID의 DEAD RCONF가 `m:` lane에 남아 있음

   이때 ID 복구 PROVISION과 복귀 묶음이 적재되고, DEAD RCONF는 guard에서 제외된다. DEAD 행을 삭제하지는 않지만 **DEAD를 둔 채 복귀를 진행하는 문제**는 남는다.

   근거: `sync/ApmAlertSyncService.java:309`, `sync/ApmAlertSyncService.java:328`, `sync/ApmAlertSyncService.java:338`, `bridge/ApmZbxCleanupService.java:459`.

   inventory에서 정확히 식별한 trigger ID도 RCONF 관찰·잠금 대상에 포함해야 한다. 현재 RCONF IT는 binding ID가 채워진 경우이고, ID 누락 IT는 트리거가 켜진 경우라 이 조합을 검증하지 않는다. `sync/ApmAlertSyncIT.java:269`, `sync/ApmAlertSyncIT.java:307`.

## 🟡 권장

- **분모 수정은 부분 반영이다.** 중복 여부를 대상 쌍이 아닌 rule ID와 orphan 여부로 판단한다. 예를 들어 다시 대상에 포함됐지만 아직 orphan 표식이 남은 binding은 A와 추가 binding 양쪽에 계산되지만, 실제 B에서는 `handled`로 제외된다. 반대로 활성 규칙의 A 밖 비고아 binding은 분모에서 빠져도 B에서 처리된다. `(rule, 대상)` 기준의 합집합으로 계산해야 한다. `sync/ApmAlertSyncService.java:197`, `sync/ApmAlertSyncService.java:200`, `sync/ApmAlertSyncService.java:257`, `sync/ApmAlertSyncService.java:308`.

- 위 필수 사항에는 **guard 관찰 행의 잠금 검증**, **복구→복귀 연속 호출의 잠금 순서**, **ID null + DEAD RCONF 조합**을 검증하는 테스트가 필요하다. 현재 추가된 IT는 해당 동시성·조합까지 증명하지 않는다.

## 🟢 확인된 것

- **`lockPlan`과 `plan` 분리 자체는 현재 호출 경로에서 적합하다.** extra dedup은 잠금·guard 범위만 넓힌다. upsert는 `sorted`, supersede는 원래 `plan`, realias는 spec의 종류·ID를 사용한다. 넓어진 `scope`에도 fence의 command/resource 조건이 적용되므로, extra RCONF가 적재 의도나 push 무효화 판단으로 바뀌는 회귀는 발견하지 못했다. `command/ApmZbxCommandStore.java:348`, `command/ApmZbxCommandStore.java:355`, `command/ApmZbxCommandStore.java:360`, `command/ApmZbxCommandStore.java:500`, `command/ApmZbxCommandStore.java:797`.

- **무트랜잭션 단언·대상별 `REQUIRES_NEW`는 반영됐다.** `sync/ApmAlertSyncService.java:120`, `sync/ApmAlertSyncService.java:175`. 오용 거부 IT도 있다. `sync/ApmAlertSyncIT.java:336`.

- **현재 kind·threshold 재검증은 반영됐다.** kind가 달라졌으면 A를 건너뛰고, drift 기대값은 잠근 뒤 현재 threshold를 사용한다. `sync/ApmAlertSyncService.java:302`, `sync/ApmAlertSyncService.java:306`, `sync/ApmAlertSyncService.java:342`.

- **삭제 테스트의 핵심 성질이 복원됐다.** item payload의 `type/value_type/units`, `delay/interfaceid` 부재와 trigger `manual_close` 계약을 검사한다. ID 교체 시 새 ID 기록·`synced_at` 재시작 IT도 추가됐다. `bridge/ZabbixAlertBridgeTest.java:164`, `bridge/ZabbixAlertBridgeTest.java:180`, `command/ApmZbxProvisionIT.java:117`. 통과 여부는 이번 검수에서 확인하지 않았다.

- **15분은 “새 대상 진입 상한”으로 명시됐고**, 상태 진단의 트랜잭션 제거와 `status()`의 try 밖 단언도 반영됐다. `sync/ApmAlertSyncService.java:85`, `rule/ApmAlertService.java:354`, `bridge/ZabbixAlertBridge.java:1487`.

## 이관(단위 8·6c)

- **단위 8:** 운영자 확인·명시적 DEAD retry 창구는 유지한다. 위 preflight·잠금 결함은 6b에 남겨 해결해야 한다.
- **단위 6c:** continuation, 세대 검증, VERIFY, `57014`, HWM·커서 검증은 기존 이관대로다. 15분은 현재 구현상 실행 중 작업을 중단하는 wall-clock 상한이 아니다.
- **규모 대응:** 1,000+ inventory 실측·페이지 전환은 미검증 항목으로 유지한다.