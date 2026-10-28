## 판정

**반려**

비공유 아이템에서는 2차 🔴이 해소됐지만, **공유 아이템에서는 hard RPUSH가 새 소유 확인 전에 완료되어 후행 STAT·PROVISION 차단이 풀립니다.** 따라서 2차 🔴은 부분 해소입니다.

## 2차 지적 해소 확인

- **소유 식별 자체는 정확합니다.** 가상 host 이름을 정확 필터링하고 owner tag를 확인한 뒤, 해당 `hostid` 범위에서 정확 key의 item owner와 status를 검사합니다. item id를 식별자로 사용하지 않습니다: [ZabbixAlertBridge.java:1525](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1525>).

- **일반 경로의 분기는 타당합니다.**
  - host/item owner 불일치 → `FOREIGN`
  - host/item 없음 또는 item disabled → `MISSING`
  - hard `FOREIGN` → `ZABBIX_OBJECT_NOT_OWNED` DEAD
  - soft `FOREIGN`·확인 예외 → push 없이 완료
  - `MISSING` → 완료 후 PROVISION 진행  
  근거: [ApmZbxResolvePushExecutor.java:69](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:69>).

- **hard DEAD에 도달하면 STAT·PROVISION은 실제로 막힙니다.** 켜기 적재가 RPUSH를 두 명령의 선행으로 연결하고, claim은 dependency가 하나라도 남은 명령을 제외하며, DEAD는 선행 행을 삭제하지 않습니다: [ApmZbxCleanupService.java:249](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:249>), [ApmZbxCommandStore.java:834](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:834>), [ApmZbxCommandStore.java:1235](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1235>).

- **soft 완료 결정은 수용 가능합니다.** 외부 쓰기는 생략하면서 후행 STAT(disable)·RCONF를 풀어 정리 의무를 계속 수행하는 선택입니다: [ApmZbxResolvePushExecutor.java:73](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:73>), [ApmZbxResolvePushExecutor.java:80](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:80>).

- **상한 5와 lease 계산은 맞습니다.** 토큰 최악 2회 + host/item 확인 2회 + push 1회이며, 선언도 5입니다. `5×45+30=255초 < 기본 600초`이고 토큰 2회를 더하는 실측 테스트도 있습니다: [ApmZbxCommandType.java:30](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:30>), [ApmZbxCommandProperties.java:81](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandProperties.java:81>), [ApmZbxStatusCommandIT.java:149](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:149>).

## 🔴 필수

1. **공유 아이템이면 hard RPUSH가 소유 확인을 우회해 STAT·PROVISION을 풀어 버립니다.**

   실행기는 DB상 같은 `zbxItemid`를 쓰는 다른 활성 소비자가 있으면 hard/soft 구분 없이 즉시 `DONE`을 반환합니다. 이 분기는 token 확보와 `checkResolvePushTarget()`보다 앞입니다: [ApmZbxResolvePushExecutor.java:53](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:53>), [ApmZbxResolvePushExecutor.java:62](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:62>).

   공유 판정은 DB의 item id와 다른 활성 규칙만 보며 현재 host/item owner는 확인하지 않습니다: [ZabbixAlertBridge.java:964](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:964>).

   따라서 공유 아이템의 owner tag가 제거되거나 같은 key가 foreign item으로 교체된 상태에서 켜면:

   1. RPUSH가 DEAD가 아니라 완료됩니다.
   2. 성공 완료가 RPUSH 행을 삭제하고 dependency도 cascade로 해제합니다: [ApmZbxCommandStore.java:1167](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1167>), [V79__apm_zbx_command.sql:92](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V79__apm_zbx_command.sql:92>).
   3. STAT(on)이 실행되어 foreign item을 참조하는 우리 trigger를 켤 수 있고, PROVISION의 후행 DEAD는 이미 실행 가능한 STAT을 막지 못합니다. STAT 조회는 trigger/host 이름·trigger owner만 확인하며 host owner는 확인하지 않습니다: [ZabbixAlertBridge.java:1211](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1211>), [ApmZbxTriggerStatusExecutor.java:91](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:91>).

   이는 요구된 “hard foreign이면 DEAD로 STAT·PROVISION 모두 차단”을 깨는 순서 위반입니다.

   **필요 조치:** hard 경로는 공유 생략보다 먼저 소유 확인을 수행해야 합니다. `OURS + shared`만 완료하고, `FOREIGN`은 DEAD, `MISSING`은 기존처럼 완료해야 합니다. `hard + 공유 소비자 + foreign 3종` 테스트에서 RPUSH DEAD와 STAT·PROVISION 모두 PENDING을 고정해야 합니다. 현재 hard 테스트는 공유 소비자를 만들지 않고 STAT만 검증합니다: [ApmZbxStatusCommandIT.java:283](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:283>). 공유 테스트도 soft 단독입니다: [ApmZbxStatusCommandIT.java:358](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxStatusCommandIT.java:358>).

## 🟡 권장

1. **PROVISION 쓰기 직전 재확인 미도입은 수용하되, §12.10의 근거 문구는 보정해야 합니다.**

   조건부 update/CAS가 없어 재확인으로 창을 완전히 닫지 못하고, 최대 호출이 10→15 및 `705초 > 기본 lease 600초`가 된다는 판단은 수용 가능합니다: [apm-alert-unit5-6-design-20261011.md:450](</C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:450>).

   다만 “각 쓰기는 조회 직후 RPC 하나 사이”라는 설명은 중복 trigger 경로에는 정확하지 않습니다. 한 번의 `trigger.get` 뒤 최대 네 번의 `trigger.update`를 연속 수행하므로 뒤쪽 대상은 여러 RPC 동안 판정이 오래됩니다: [ZabbixAlertBridge.java:1444](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1444>), [ZabbixAlertBridge.java:1458](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1458>). “완전 제거 불가와 비용을 근거로 잔여 위험을 수용한다”로 정리하는 편이 정확합니다.

## 이관 목록

- **단위 8 — DEAD 운영자 회복 창구:** 예정대로 DEAD 목록·개별 retry-dead·규칙별 resync 진입이 합본 전 필요합니다. Store의 전체 `retryDead()`는 존재하지만 [ApmZbxCommandStore.java:1322](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1322>), 정적 검색상 production 호출처는 없습니다. 또한 현재 수정/resync는 `PROV:b{id}`만 재적재하고 `RPUSH:b{id}`를 되살리지 않습니다: [ApmAlertService.java:965](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:965>), [ApmZbxCommandKeys.java:60](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandKeys.java:60>). 따라서 “수정·resync가 같은 dedup을 재적재한다”에 의존하면 안 됩니다.

- **단위 6a — 기존 합본 게이트 유지:** 평가 경로의 `retryPendingTriggerStatus`·`ensureProvisioned`·`pushAll` 명령화와 `PUSH_CURRENT → STAT(on)` fencing이 남아 있습니다: [ApmAlertEvaluationService.java:289](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:289>), [ApmAlertEvaluationService.java:342](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:342>), [ApmAlertEvaluationService.java:429](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:429>).

## 🟢 참고

- 3차 추가 RPC는 executor에서 실행되고, bridge도 활성 트랜잭션을 거부하므로 5b가 새로 만든 트랜잭션 내부 외부 I/O는 발견하지 못했습니다: [ApmZbxCommandWorker.java:290](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:290>), [ZabbixAlertBridge.java:1525](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1525>), [ZabbixAlertBridge.java:1668](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1668>).

- 자동 `item.delete` 금지, 비활성 우리 item 재활성화, 독자 운영 창구의 단위 8 이관 결정에는 3차 변경으로 인한 회귀를 발견하지 못했습니다.

- 읽기 전용 지시에 따라 테스트는 재실행하지 않았으며, 누적 diff·워크트리·제공된 테스트 코드를 정적으로 검수했습니다.
ndStore.java:1209](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1209>), [ApmZbxCommandStore.java:996](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:996>), [ApmAlertRuleWriteFacade.java:75](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWriteFacade.java:75>).
- 정확 소유 trigger 중복은 STAT이 하나씩, enforce PROVISION이 최대 4개씩 줄인 뒤 즉시 재실행합니다. 정상 update 응답이 실제 반영되는 조건에서 무한 루프는 없습니다: [ApmZbxTriggerStatusExecutor.java:93](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:93>), [ZabbixAlertBridge.java:1458](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1458>), [ApmZbxProvisionExecutor.java:149](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:149>).
- 명령 요약 N+1은 일괄 조회로 유지됩니다: [ApmAlertService.java:149](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:149>), [ApmAlertService.java:1537](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1537>), [ApmZbxCommandStore.java:996](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:996>).
- 자동 `item.delete`는 없고 status 1 비활성화만 수행하며, 꺼진 우리 item은 status 0으로 재활성화합니다: [ApmZbxDeleteExecutor.java:222](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:222>), [ZabbixAlertBridge.java:529](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:529>).
- 읽기 전용 조건에 따라 테스트는 실행하지 않았으며 파일도 수정하지 않았습니다. 정적 코드·누적 diff·테스트 소스만 검수했습니다.
