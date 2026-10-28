## 판정

**반려** — 비경합 새 바인딩의 복구는 해결됐지만, 예약 경합에서 잠금 역전과 상태 복귀 생략 경로가 남는다.

`HEAD bad215d`와 제공된 누적 diff가 현재 작업 트리에 일치한다. 파일 수정·테스트 실행 없이 정적 검수했다. 아래 Java 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이다.

## 5차 지적 해소 확인

- **비경합 경로는 해소됐다.** 정확 트리거의 가족을 예약 전에 잠그고, ID 기록용 비강제 PROVISION과 상태 복귀 묶음을 같은 회차에 적재한다. 기존의 일괄적인 `!fresh` 생략은 제거됐다.  
  근거: `sync/ApmAlertSyncService.java:318`, `sync/ApmAlertSyncService.java:325`, `sync/ApmAlertSyncService.java:361`, `sync/ApmAlertSyncService.java:398`.

- **새 IT는 비경합 복구 성질을 검증한다.** 바인딩 행을 삭제하고 기존 트리거를 끈 뒤, `syncAll` 한 번으로 두 종류의 적재를 확인하고 drain 후 트리거 ON과 기존 trigger ID 기록을 단언한다. 다만 예약 경쟁이나 교착 안전성을 증명하는 테스트는 아니다.  
  근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:567`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:575`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:578`.

## 🔴 필수

1. **`fresh` 조회 이후 행이 생기면 가족 → 바인딩 역전이 다시 가능하다.**

   `existingBinding()`의 빈 결과는 해당 키의 부재를 잠그지 않는다. 다음은 **실행 재현하지 않은 정적 경합 시나리오**다.

   1. 대조가 행 없음으로 `fresh=true`를 정한다.
   2. 다른 예약 경로가 같은 키의 바인딩을 생성·커밋하고, PROVISION 기록이 기존 trigger ID `T`를 기록한다.
   3. 대조가 `zt:T`를 선잠금한다.
   4. 고아 처리가 그 바인딩을 UPDATE·flush하고 `zt:T`를 기다린다.
   5. 대조는 예약이 반환한 기존 바인딩의 `FOR UPDATE`를 기다린다.

   **대조는 가족을 쥐고 바인딩을 기다리고, 고아 처리는 바인딩을 쥐고 가족을 기다리는 순환**이다. 전역 규칙이 새 서비스별 규칙에 밀리는 경우처럼, 원래 규칙을 수정하지 않고도 고아 처리 대상이 될 수 있다. 부모의 SHARE·KEY SHARE는 두 경로를 배제하지 않는다.

   근거: `sync/ApmAlertSyncService.java:315`, `sync/ApmAlertSyncService.java:323`, `sync/ApmAlertSyncService.java:325`, `sync/ApmAlertSyncService.java:474`; `command/ApmZbxProvisionExecutor.java:260`, `command/ApmZbxProvisionExecutor.java:271`; `evaluate/ApmAlertOrphanSweeper.java:257`, `evaluate/ApmAlertOrphanSweeper.java:259`; `bridge/ApmZbxCleanupService.java:219`; `command/ApmZbxCommandStore.java:595`; `evaluate/ApmAlertEventStore.java:143`; `rule/ApmAlertService.java:1233`.

   `statusLockable` 검사는 **바인딩 잠금이 끝난 뒤**라 이 순환을 막지 못한다. 가족을 보유한 채 경합한 기존 행을 기다리지 않도록, 대상 트랜잭션을 종료하고 재시도하는 등의 처리가 필요하다.  
   근거: `sync/ApmAlertSyncService.java:325`, `sync/ApmAlertSyncService.java:334`.

2. **동시 예약자가 비강제 PROVISION을 먼저 적재하면 상태 복귀 공백이 남는다.**

   더 단순한 경합도 있다. **정적 분석이며 재현 결과는 아니다.**

   - 바인딩 없음·활성 아이템·꺼진 기존 트리거 상태에서 5분 판정이 예약과 비강제 PROVISION 적재를 먼저 커밋한다.
   - 대조의 예약은 그 행을 반환한다.
   - `pendingProvision()` 분기가 즉시 반환해 상태 비교·복귀 적재를 생략한다.
   - 해당 PROVISION은 `enforce=false`, 기존 활성 아이템·기존 트리거 조합이므로 `hold=false`이고, 트리거 status를 보존한다.

   따라서 **다른 trigger ID가 반환된 경우뿐 아니라, 같은 트리거를 정상적으로 찾은 예약 경합에서도 다음 일일 대조까지 꺼진 채 남을 수 있다.**

   근거: `evaluate/ApmAlertEvaluationService.java:464`, `evaluate/ApmAlertEvaluationService.java:539`, `evaluate/ApmAlertEvaluationService.java:560`; `sync/ApmAlertSyncService.java:345`, `sync/ApmAlertSyncService.java:352`; `bridge/ApmZbxCleanupService.java:519`; `command/ApmZbxProvisionExecutor.java:182`; `bridge/ZabbixAlertBridge.java:1037`, `bridge/ZabbixAlertBridge.java:1040`.

   대기 PROVISION이 상태까지 수렴시키는 경우와 기존 status를 보존하는 경우를 구분하거나, 완료 뒤 상태를 확인하는 지속적인 후속 작업이 필요하다.

## 🟡 권장

- **다른 trigger ID 반환 시 상태를 넘기는 판단 자체는 보수적으로 타당하다.** inventory와 현재 바인딩의 식별이 달라 추가 가족을 늦게 잡지 않는다는 목적에 맞는다. 다만 이것이 위 잠금 경합을 해결하지는 않으며, 다음 날까지의 지연을 줄일 재대조 표식이 있으면 좋다. 이 개선 자체는 승인 차단 사항으로 보지 않는다.  
  근거: `sync/ApmAlertSyncService.java:333`, `sync/ApmAlertSyncService.java:337`.

- 새 IT에 `hard=true`, RPUSH→STAT 의존 및 -1 정렬 단언을 추가하면 복귀 묶음의 의미까지 더 직접적으로 검증할 수 있다. 현재 새 IT의 단언은 적재 종류와 최종 상태 중심이다.  
  근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:575`; `bridge/ApmZbxCleanupService.java:494`, `bridge/ApmZbxCleanupService.java:503`.

## 🟢 확인된 것

- 같은 키를 **처음 예약하는 5분 판정 하나와의 경쟁만** 보면, 새 행은 trigger ID가 없고 PROVISION·PUSH_CURRENT 자체는 `zt:` 가족을 요구하지 않는다. 이 좁은 경우에 대한 설명은 맞다. 위 필수 지적은 부재 조회 이후 기존 행으로 바뀌는 경계를 포함한다.  
  근거: `src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleBindingRepository.java:138`; `evaluate/ApmAlertEvaluationService.java:539`, `evaluate/ApmAlertEvaluationService.java:555`; `command/ApmZbxCommandStore.java:581`.

- 기존 바인딩 대조는 바인딩 잠금·refresh 뒤 가족을 잠그며, 고아 복귀·표식 변경은 적재 전에 flush한다. 정상 규칙·서비스 삭제도 부모와 바인딩 선잠금을 유지한다.  
  근거: `sync/ApmAlertSyncService.java:340`, `sync/ApmAlertSyncService.java:424`; `evaluate/ApmAlertOrphanSweeper.java:221`, `evaluate/ApmAlertOrphanSweeper.java:258`; `rule/ApmAlertService.java:660`, `rule/ApmAlertService.java:673`.

## 이관(단위 8·6c)

- **단위 8:** DEAD 회복·운영자 확인 창구 이관 유지.
- **단위 6c:** continuation·세대·VERIFY·`57014`·HWM/커서 이관 유지.
- 위 두 경합 문제는 **6b에서 해결할 사항**이다. 요청서의 테스트·뮤테이션 통과 보고는 재실행하지 않았다.