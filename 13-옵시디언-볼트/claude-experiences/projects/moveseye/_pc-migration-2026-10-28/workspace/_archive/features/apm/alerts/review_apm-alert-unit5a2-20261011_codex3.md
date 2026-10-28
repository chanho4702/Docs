## 판정

**반려**

2차 지적 중 완전 식별, `UNIDENTIFIED` barrier 해소, generation CAS, DEAD 별칭 부활, executor 포화 처리는 충분히 반영됐습니다. 그러나 외부 트리거 보호는 “조회 당시 존재하는 트리거”까지만 해결됐습니다.

`DELETE_ITEM`의 참조 조회와 `item.delete` 사이에 사용자 트리거가 생성되면 그 트리거를 cascade 삭제할 수 있습니다. 판정 기준의 **남의 객체 삭제**에 해당하므로 🔴입니다.

## 🔴 필수

1. **최종 참조 검사 뒤 생성된 외부 트리거를 cascade 삭제할 수 있습니다.**

   현재 순서는 다음과 같습니다.

   - Zabbix 참조 트리거 조회: [ApmZbxDeleteExecutor.java:171](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:171)
   - DB 명령/edge만 재검증하는 `markLinearized`: [ApmZbxDeleteExecutor.java:181](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:181)
   - `item.delete`: [ApmZbxDeleteExecutor.java:184](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:184)

   `markLinearized`는 Zabbix의 외부 변경을 잠그지 않습니다. 실제 기존 IT도 이 창에서 새 트리거를 만든 뒤 `item.delete`가 함께 삭제함을 단언합니다([ApmZbxCommandExecutionIT.java:434](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:434), [ApmZbxCommandExecutionIT.java:448](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:448)). 여기서 `ourTrigger` 대신 owner 태그가 없는 외부 트리거를 만들면 동일하게 삭제됩니다. 반면 현재 외부 트리거 테스트는 조회 전에 이미 존재하는 경우만 검증합니다([ApmZbxCommandExecutionIT.java:460](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:460)).

   5b의 item-family 잠금은 MovesEye `PROVISION`만 직렬화하며 Zabbix에서 사용자가 직접 만드는 트리거에는 적용되지 않습니다. 따라서 다음 중 하나가 필요합니다.

   - 관리 호스트에 대한 외부 trigger 생성 권한을 구조적으로 차단하고 그 전제를 운영·권한 IT로 고정
   - 외부 변경이 배제된 coordinated maintenance 구간에서만 item GC 실행
   - 자동 `item.delete`를 중단하고, 참조가 없는 아이템을 별도 안전 정리 대상으로 남기는 방식

   owner 없는 트리거를 `item.delete` 직전에 생성하는 latch IT도 필요합니다.

## 🟡 권장

- 운영 가이드의 “V53 큐를 가능한 한 비운다”는 문구는 배포 게이트로는 약합니다([ops_v79-predeploy-diagnostics.md:58](/C:/solutions/_workspace/guides/ops_v79-predeploy-diagnostics.md:58)). D2뿐 아니라 D1 총건수가 0이 아니면 배포 차단하거나, 남은 모든 행에 운영자 확인 기록을 요구하는 편이 명확합니다.
- 배포 후 raw SQL 삭제는 `acknowledgeUnidentified`의 메모·`[AUDIT]` 로그를 우회합니다([ops_v79-predeploy-diagnostics.md:72](/C:/solutions/_workspace/guides/ops_v79-predeploy-diagnostics.md:72)). 단위 8 API가 포함된 최종 배포에서는 Store 메서드만 사용하도록 가이드를 전환해야 합니다.
- `UNIDENTIFIED_TRIGGER` 메시지는 실제로 `ruleUid·scopeUid·kind` 셋 중 하나라도 부족할 때 발생하지만 “ruleUid가 없다”고만 표시합니다([ApmZbxDeleteExecutor.java:57](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:57)). V53 운영 진단을 오도할 수 있으므로 “완전 식별 부족”으로 수정하는 편이 좋습니다.
- `premium.apm.*` 전체 회귀는 여전히 OOM으로 미완입니다. 최종 배포 전 shard 재실행 조건을 유지해야 합니다.

## 이관 목록

추가 이관은 없습니다. 위 🔴은 외부 객체 삭제 안전성이라 5b·6a로 넘길 수 없습니다. 기존에 합의된 이관 항목은 반복하지 않습니다.

## 🟢 참고

- 2차의 완전 식별 보강은 적절합니다. `(ruleUid, scopeUid, kind)`를 전부 요구하고 ID·태그 조회 모두 host·owner·논리 식별을 재검증합니다([ZabbixAlertBridge.java:1285](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1285), [ZabbixAlertBridge.java:1504](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1504)).
- `UNIDENTIFIED` 전역 barrier는 `acknowledgeUnidentified`와 실제 barrier IT로 해소 경로가 생겼습니다([ApmZbxCommandStore.java:1219](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1219), [ApmZbxCommandExecutionIT.java:519](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:519)).
- `recheckConfirm` generation CAS, 키 보충 DEAD 부활, 풀 포화 시 PENDING 유지도 2차 🟡을 충분히 반영했습니다.
- 화면 삭제·`deleteRule`·SLO·`releaseService`·규칙 없는 고아 삭제는 바인딩 삭제 전 같은 트랜잭션에서 선적재합니다. 해당 삭제 경로의 트랜잭션 내부 Zabbix 호출은 제거됐습니다. 생성·수정·끄기·켜기·평가의 기존 호출은 이미 정해진 후속 범위입니다.
- 읽기 전용 검수이므로 파일 수정과 테스트 재실행은 하지 않았습니다.

## 의견 요청 답

1. **정책 자체는 수용 가능합니다.** ack 성공 후 재확인만 세는 `10회 × 60초`와 `manual_close=0` 삭제 체인 완료 처리는 영구 정체를 피하면서 실패를 경고로 남깁니다.

2. **MovesEye 내부 생성 경쟁만 보면 5b·6a 이관이 충분합니다.** 하지만 선형화 뒤 owner 없는 외부 트리거가 생성되는 경우에는 트리거 자체가 삭제되므로, 현재 이관만으로는 충분하지 않습니다.

3. **PROVISION 경쟁은 5b 이관으로 충분합니다.** PROVISION과 바인딩 생성이 item-family 선형화에 참여하고 늦은 생성 IT를 뒤집으면 됩니다. 다만 이는 위 외부 Zabbix 직접 변경 경쟁을 해결하지 않습니다.

4. **edge만으로 순서를 보장하는 것은 §9 선형화와 충돌하지 않습니다.** resource 제약은 동시 실행 배제이고 의미 순서는 `RCONF→DELT→DELI` edge가 담당하는 것이 맞습니다. 이번 반려 사유는 DB edge 순서가 아니라 Zabbix 외부 변경이 그 선형화에 참여하지 못한다는 점입니다.
