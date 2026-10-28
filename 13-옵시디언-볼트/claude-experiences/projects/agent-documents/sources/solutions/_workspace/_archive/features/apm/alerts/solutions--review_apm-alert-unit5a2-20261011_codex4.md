## 판정

**반려**

자동 `item.delete` 제거로 3차의 “외부 trigger가 연쇄 삭제될 수 있음” 문제는 해소되었습니다. 그러나 현재 `disableForCleanup()`이 과거 조회한 tag 전체를 `item.update`로 덮어써서, 조회 이후 추가·변경된 타인의 tag를 유실할 수 있습니다. 판정 기준상 데이터 손상이므로 🔴입니다.

## 🔴 필수

- `item.get`과 `item.update` 사이의 tag lost update를 제거해야 합니다.

  [ApmZbxDeleteExecutor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:161)에서 조회한 `OwnedItem.tags()` snapshot을 [ZabbixAlertBridge.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1439)에서 그대로 재구성하여 전체 `tags` 필드로 전송합니다. Zabbix의 tag 갱신은 전체 교체이고, fake backend도 동일하게 구현되어 있습니다([FakeZabbixAlertBackend.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/support/FakeZabbixAlertBackend.java:482)).

  가능한 순서는 다음과 같습니다.

  1. 실행기가 기존 tag를 조회한다.
  2. 운영자나 다른 기능이 새로운 tag를 추가·수정하거나 owner tag를 제거한다.
  3. 실행기가 오래된 snapshot에 cleanup tag를 합쳐 `item.update`한다.
  4. 새 tag는 유실되고, 제거된 owner tag는 되살아날 수 있다.

  stale tag 전체를 자동 갱신하지 않는 방식이 필요합니다. 예를 들어 자동 경로는 `status=disabled`만 갱신하고 cleanup 시각은 DB에서 관리하거나, tag 변경의 배타성이 실제 권한·절차로 강제되는 구조가 필요합니다.

- 다음 동시성 테스트가 필수입니다.

  - `item.get` 이후 `item.update` 직전에 외부 tag 추가·수정 → 외부 tag 보존
  - 같은 구간에 owner tag 제거 → stale owner tag 복구 및 후속 mutation 금지

  현재 latch 테스트는 외부 trigger 생존만 검증하며([ApmZbxCommandExecutionIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:469)), tag 동시 변경은 검증하지 않습니다.

## 🟡 권장

- [markedForCleanup()](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1311)이 `disabled && apm_gc=pending`만 확인합니다. `apm_gc_since`가 없거나 잘못된 경우에도 완료로 취급되어 운영 가이드의 30일 기준으로 검색할 수 없습니다. 유효한 `apm_gc_since`까지 확인하거나 누락 값을 보정해야 합니다.

- [운영 가이드](/C:/solutions/_workspace/guides/ops_apm-alert-item-cleanup.md:55)의 참조 확인과 `item.delete` 사이에도 경쟁 구간이 있습니다. 점검 후 새 trigger가 연결되면 수동 삭제라도 해당 trigger가 연쇄 삭제될 수 있으므로 다음을 명시하는 편이 안전합니다.

  - cleanup 중 관련 trigger 변경 금지 또는 maintenance window 확보
  - `item.delete` 직전 `selectTriggers` 즉시 재조회
  - 재조회 결과가 0건이 아닐 경우 삭제 중단

- 가이드의 “남겨 두어도 동작 영향 없음”은 현재 참조가 없다는 전제하에서만 맞습니다. 구현 테스트처럼 최종 검사 후 외부 trigger가 연결되면 trigger는 살아남지만 item은 비활성화됩니다. 조건부 표현으로 고치는 것을 권장합니다.

- “트리거와 그 이력까지 삭제”는 item의 value history와 trigger/event 이력을 구분해 기술하는 편이 정확합니다. item 삭제는 item value history 손실과 trigger 객체의 연쇄 삭제 위험을 중심으로 설명해야 합니다.

- 읽기 전용 검수이므로 전체 `premium.apm.*` 회귀 테스트와 mutation test는 재실행하지 않았습니다.

## 이관 목록

없음. 이미 합의된 5b·6a 이관 항목은 반복하지 않습니다.

## 🟢 참고

- 자동 `item.delete` 호출은 제거되었습니다. 최종 trigger 검사 뒤 외부 trigger를 생성하는 테스트에서도 trigger가 보존되므로, 3차의 남의 객체 연쇄 삭제 문제는 해소되었습니다.

- exact host·key·owner 식별, ID 화해, 예약 binding과 논리 key 참조 검사, 가족 잠금→resource 잠금 순서, `markLinearized` 직전 재검증과 `REQUEUED`, generation/token CAS, retry/dead, lease 갱신은 설계 의도와 부합합니다.

- 워커는 실제 실행을 트랜잭션 밖에서 수행하고, `runNow`가 기존 작업을 취소하지 않으며, executor reject 시 명령을 `PENDING`으로 남깁니다. wake 합치기와 포화 처리도 적절합니다.

- 화면·`deleteRule`·SLO·`releaseService`·고아 정리 경로는 binding 삭제 전에 같은 트랜잭션에서 필요한 정보를 선적재합니다. 해당 삭제 경로에 트랜잭션 내부 Zabbix 호출이 새로 남은 정황은 확인하지 못했습니다.

- 운영 가이드의 `item.get`에 사용한 `host`, tag filter와 `selectTriggers` 자체는 [Zabbix 7.0 item.get 문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/get)에 부합합니다.

## 의견 요청 답

1~4는 3차 답변으로 갈음합니다. 단, 3차 답변에서 지적한 자동 `item.delete` 연쇄 삭제 전제는 이번 변경으로 해소되었고, 이번 반려 사유는 stale tag 전체 교체에 따른 데이터 유실입니다.
