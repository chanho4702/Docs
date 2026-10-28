## 판정

**반려** — 4차의 단일 바인딩 교착 경로는 해소됐지만, 새 바인딩의 상태 복구를 다음 일일 대조까지 미루는 기능 공백이 남는다.

`HEAD bad215d`와 제공된 누적 diff가 현재 작업 트리에 일치함을 확인했다. 파일 수정·테스트 실행 없이 정적 검수했다. 아래 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이며, 테스트는 별도로 표시한다.

## 4차 지적 해소 확인

- **기존 바인딩의 대조 A·B는 수정된 순서를 따른다.** 바인딩을 `FOR UPDATE`하고 refresh한 뒤, 현재 바인딩 ID와 inventory ID의 가족을 첫 적재 전에 잠근다. 따라서 **기존 바인딩에서 복구 PROVISION 뒤 가족을 늦게 잡던 2차 🔴2는 되살아나지 않는다.**  
  근거: `sync/ApmAlertSyncService.java:318`, `sync/ApmAlertSyncService.java:324`, `sync/ApmAlertSyncService.java:341`, `sync/ApmAlertSyncService.java:407`, `sync/ApmAlertSyncService.java:412`, `sync/ApmAlertSyncService.java:456`.

- **고아 복귀·고아 표식 변경의 지연 flush는 해소됐다.** 두 분기 모두 바인딩 UPDATE를 명령 적재 전에 flush한다. 예약도 native INSERT가 즉시 실행되는 구조다. 현재 5분 판정에서 `markMissing` 호출은 발견하지 못했고, `clearObjects`도 프로덕션 호출처가 없다.  
  근거: `evaluate/ApmAlertOrphanSweeper.java:218`, `evaluate/ApmAlertOrphanSweeper.java:221`, `evaluate/ApmAlertOrphanSweeper.java:257`, `bridge/ZabbixAlertBridge.java:296`; `src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleBindingRepository.java:137`.

- **규칙 없는 바인딩 삭제 분기를 유지한 판단은 정상 FK 전제에서는 수용한다.** 대조는 부모가 없으면 빠지고, 정상 삭제는 바인딩을 먼저 잠근다. 다만 해당 예외 분기 자체는 여전히 **명령 적재 → 바인딩 DELETE**이므로, 모든 분기가 동일한 전역 순서를 따른다는 표현에는 예외를 명시해야 한다.  
  근거: `sync/ApmAlertSyncService.java:302`, `sync/ApmAlertSyncService.java:397`, `evaluate/ApmAlertOrphanSweeper.java:238`, `evaluate/ApmAlertOrphanSweeper.java:242`, `evaluate/ApmAlertOrphanSweeper.java:245`, `rule/ApmAlertService.java:660`.

- **새 IT는 주장한 좁은 성질을 검증한다.** 실제 `sweep`를 트랜잭션에서 호출하고, 정확한 lane resource 대기를 확인한 상태에서 바인딩 `FOR UPDATE NOWAIT`가 `55P03`인지 검사한다. 단, 전체 `decide`의 예약·다중 바인딩 처리 순서까지 증명하지는 않는다.  
  근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:509`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:527`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:534`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:547`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:567`.

## 🔴 필수

1. **새 바인딩과 기존 꺼진 트리거 조합의 상태 복구를 보장해야 한다.**

   다음 경로가 남는다. **정적 분석이며 실행 재현 결과는 아니다.**

   1. 바인딩 행은 없고, 정확 식별되는 기존 아이템은 활성·트리거는 비활성이다.
   2. 대조는 새 바인딩을 예약하고 비강제 PROVISION을 적재한다.
   3. `!fresh` 조건 때문에 상태 복귀를 생략한다. B 목록도 예약 전 스냅샷이므로 새 행을 처리하지 않는다.  
      근거: `sync/ApmAlertSyncService.java:193`, `sync/ApmAlertSyncService.java:316`, `sync/ApmAlertSyncService.java:347`, `sync/ApmAlertSyncService.java:381`.
   4. PROVISION은 기존 활성 아이템·기존 트리거·`enforce=false` 조합에서 `hold=false`이고, 기존 트리거 status를 보존한다. **명령이 성공해도 트리거는 계속 꺼져 있다.**  
      근거: `command/ApmZbxProvisionExecutor.java:182`, `bridge/ZabbixAlertBridge.java:1037`, `bridge/ZabbixAlertBridge.java:1040`.
   5. 5분 평가의 존재 확인도 `need=NONE`이면 추가 복구를 하지 않는다. 기본 재대조는 다음 날 02:00이다.  
      근거: `evaluate/ApmAlertZabbixPhase.java:224`; `src/main/resources/db/migration/V41__apm_alert.sql:76`.

   따라서 “다음 회차 수렴”은 기본 설정상 **하루 동안 Zabbix 알람이 비활성으로 남을 수 있는 변경**이다. §15.10~§15.11의 기존 상태 대조 의미를 만족한다고 보기 어렵다.

   예약의 잠금 단계를 재구성하거나 지속적인 후속 작업을 남겨, 상태 복귀까지 보장해야 한다. **바인딩 행만 제거하고 기존 트리거를 꺼 둔 경우**를 추가 검증해야 한다. 현재 ID 누락 IT는 기존 바인딩을 유지하므로 `fresh` 분기를 검증하지 않는다.  
   근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:308`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:312`.

## 🟡 권장

- **“전역 순서 통일”과 “동일 대상에서의 역전 해소”를 구분해야 한다.** 전체 판정에서는 새 예약의 item resource를 잡은 뒤 sweep의 다른 바인딩 UPDATE·가족 잠금으로 진행할 수 있고, sweep도 한 바인딩을 적재한 뒤 다음 바인딩을 갱신한다. 따라서 트랜잭션 전체에 걸친 순서가 문자 그대로 정규화된 것은 아니다. **이 사실만으로 정상 데이터에서 추가 교착이 발생한다고 단정하지는 않는다.** 전체 `decide`를 통과하는 다중 바인딩 경쟁 검증으로 보강하는 것이 좋다.  
  근거: `evaluate/ApmAlertEvaluationService.java:464`, `evaluate/ApmAlertEvaluationService.java:521`, `bridge/ZabbixAlertBridge.java:303`, `command/ApmZbxCommandStore.java:1145`, `evaluate/ApmAlertOrphanSweeper.java:206`, `evaluate/ApmAlertOrphanSweeper.java:259`.

## 🟢 확인된 것

- **취소 대상의 잠금·관찰 범위 자동 합치는 수정은 반영됐다.** guard 통과 뒤 같은 잠금 안에서 취소한다.  
  근거: `command/ApmZbxCommandStore.java:320`, `command/ApmZbxCommandStore.java:371`, `command/ApmZbxCommandStore.java:378`.

- **규칙 쓰기·정상 삭제·워커 기록에서 이번 변경으로 생긴 추가 역전은 발견하지 못했다.** 규칙 쓰기는 부모 잠금으로 대조·판정과 직렬화되고, 정상 삭제는 바인딩 선잠금을 한다. PROVISION 기록은 바인딩부터 잠그며, PUSH_CURRENT 결과 기록은 별도 트랜잭션에서 resource부터 잠근다.  
  근거: `rule/ApmAlertService.java:476`, `rule/ApmAlertService.java:662`, `rule/ApmAlertService.java:677`, `command/ApmZbxProvisionExecutor.java:244`, `command/ApmZbxProvisionExecutor.java:294`, `command/ApmZbxCommandStore.java:1583`.

## 이관(단위 8·6c)

- **단위 8:** DEAD 회복·운영자 확인 창구 이관은 유지한다.
- **단위 6c:** continuation·세대·VERIFY·`57014`·HWM/커서 이관은 유지한다.
- 위 새 바인딩 상태 복구 공백은 **6b에서 해결할 사항**이다. 요청서의 테스트·뮤테이션 통과 보고는 재실행하지 않았다.