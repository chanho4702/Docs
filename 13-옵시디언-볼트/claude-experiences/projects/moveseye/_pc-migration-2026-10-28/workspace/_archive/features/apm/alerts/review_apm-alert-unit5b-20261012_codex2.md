## 판정

**반려**

1차 지적의 취소·순서 문제와 권장 사항들은 대부분 해소됐다. 다만 새 `RESOLVE_PUSH` 실행기가 현재 Zabbix 아이템의 소유권을 확인하지 않고 `history.push(-1)`을 수행한다. 소유 태그가 제거됐거나 같은 키가 남의 아이템으로 바뀐 경우 남의 객체 데이터를 변경할 수 있으므로 합본 전 필수 수정이다.

## 1차 지적 해소 확인

1. **🔴1 캐시된 host 소유권 — 부분 해소, 전체적으로는 미해소**
   - PROVISION 명령은 캐시를 우회해 `host.get`과 owner tag를 매번 확인한다: [ZabbixAlertBridge.java:420](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:420>), [ZabbixAlertBridge.java:1377](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1377>).
   - host 삭제 시 재생성하고, owner tag가 없으면 `NOT_OWNED`로 멈추는 PROVISION 경로는 해소됐다.
   - 그러나 `RESOLVE_PUSH`는 host/item 소유 확인을 전혀 거치지 않는다. 아래 🔴 필수 참조.
   - 레거시 평가 경로는 여전히 캐시를 신뢰한다: [ZabbixAlertBridge.java:420](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:420>), [ApmAlertEvaluationService.java:342](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:342>). 이는 6a에서 해당 경로 자체를 제거하는 조건으로 이관 가능하다.

2. **🔴2 PROCESSING RPUSH 취소 후 뒤늦은 `-1` 순서 위반 — 5b 명령 경로 해소**
   - PROCESSING은 삭제하지 않고 `cancelled=true`와 `generation+1`로 남겨 lane과 edge를 유지한다: [ApmZbxCommandStore.java:371](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:371>), [ApmZbxCommandStore.java:403](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:403>).
   - 기존 실행의 완료는 `REQUEUED`, 재claim된 표식 행은 외부 호출 없이 완료된다: [ApmZbxCommandStore.java:1167](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1167>), [ApmZbxCommandWorker.java:289](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:289>).
   - 같은 dedup 재적재는 표식을 제거한다: [ApmZbxCommandStore.java:643](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:643>).
   - RPUSH도 push 직전 generation/lease를 검사한다: [ApmZbxResolvePushExecutor.java:64](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:64>).
   - 명령 lane 밖의 레거시 `pushAll()` 경쟁은 6a 이관 조건으로 남는다: [ApmAlertEvaluationService.java:426](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:426>).

3. **🟡 facade의 RCONF 누락 — 해소**
   - 실행 대상과 완료 판정 모두 binding 명령과 동일 lane의 RCONF를 합친다: [ApmAlertRuleWriteFacade.java:63](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWriteFacade.java:63>).
   - RCONF만 남은 경우 `QUEUED`가 되는 테스트도 있다: [ApmAlertRuleWritePathIT.java:190](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWritePathIT.java:190>).

4. **🟡 정확 소유 trigger 중복 수렴 — 해소**
   - STAT은 불일치 trigger를 한 번에 하나씩 바꾸고 남으면 즉시 재실행한다: [ApmZbxTriggerStatusExecutor.java:93](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:93>).
   - enforce PROVISION은 최대 4개씩 처리하고 `more`로 재실행한다: [ZabbixAlertBridge.java:1451](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1451>), [ApmZbxProvisionExecutor.java:147](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:147>).
   - 정상 응답이 반영되는 전제에서는 불일치 수가 매번 감소하므로 상한 초과 재실행의 무한 루프는 발견하지 못했다.

5. **🟡 목록 N+1 — 해소**
   - 전체 바인딩 ID를 모아 명령 상태를 한 번 조회한다: [ApmAlertService.java:149](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:149>), [ApmAlertService.java:1537](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1537>).
   - 집계 SQL도 binding별로 한 번에 반환한다: [ApmZbxCommandStore.java:986](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:986>).
   - 서비스별 목록과 SLO 요약도 bulk map을 사용한다: [ApmAlertService.java:258](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:258>), [ApmAlertService.java:738](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:738>).

## 🔴 필수

1. **`RESOLVE_PUSH`가 소유권을 확인하지 않고 host+key로 값을 전송한다.**

   실행기는 DB 바인딩에 `zbxItemid`가 존재하는지만 확인한 뒤 계산한 key로 바로 `history.push`를 호출한다: [ApmZbxResolvePushExecutor.java:54](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:54>), [ApmZbxResolvePushExecutor.java:63](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolvePushExecutor.java:63>), [ZabbixAlertBridge.java:1518](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1518>).

   구체적인 실패 경로:

   - 기존 우리 아이템의 owner tag가 제거되거나 아이템이 교체된다.
   - 규칙 켜기는 RPUSH를 PROVISION보다 먼저 실행한다: [ApmZbxCleanupService.java:237](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:237>).
   - RPUSH는 foreign item에 `-1`을 기록한다.
   - 그 뒤 PROVISION에서야 item 충돌을 발견해 DEAD가 된다: [ZabbixAlertBridge.java:517](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:517>), [ApmZbxProvisionExecutor.java:240](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:240>).

   남의 item history를 변경하는 경로는 코드상 확정적이다. 그 값이 고객 trigger의 거짓 RECOVERY까지 발생시키는지는 **추정**이다.

   RPUSH 직전에 현재 host와 item ID·key·owner를 읽기 전용으로 확인해야 한다. hard RPUSH에서 foreign/mismatch는 후속 STAT·PROVISION을 막도록 DEAD가 적절하며, 단순 missing/disabled만 현재처럼 PROVISION으로 넘겨야 한다. owner 제거 및 같은 key foreign item 교체 테스트도 필요하다.

## 🟡 권장

1. **PROVISION과 trigger 중복 수렴에는 외부 TOCTOU가 남는다.**

   host 소유 확인 후 `renew()`와 item 조회·생성 사이가 분리돼 있다: [ApmZbxProvisionExecutor.java:119](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:119>), [ApmZbxProvisionExecutor.java:123](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:123>). trigger도 정확 식별 조회 후 별도 update를 수행한다: [ZabbixAlertBridge.java:1435](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1435>), [ZabbixAlertBridge.java:1460](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1460>).

   그 사이 owner tag가 제거되면 이미 남의 객체가 된 대상을 갱신할 수 있다는 부분은 **추정**이다. Zabbix가 조건부 update/CAS를 제공하지 않는다면 완전 제거는 어렵지만, 적어도 각 쓰기 직전 재확인과 경쟁 테스트를 권장한다.

2. **`NOT_OWNED`의 DEAD 판정은 확인된 충돌에는 타당하지만 자동 회복은 아니다.**

   PROVISION은 `NOT_OWNED`를 DEAD로 바꾼다: [ApmZbxProvisionExecutor.java:240](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxProvisionExecutor.java:240>). 재적재 또는 `retryDead()`로는 부활한다: [ApmZbxCommandStore.java:650](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:650>), [ApmZbxCommandStore.java:1322](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1322>). 다만 transient한 태그 누락까지 DEAD로 확정할 수 있으므로 운영자가 resync/retry할 수 있는 창구를 합본에서 확인하는 편이 안전하다.

3. **API 주석을 실제 비동기 동작과 맞춰야 한다.**

   컨트롤러 클래스 주석은 아직 요청 스레드에서 Zabbix를 호출한다고 설명한다: [ApmAlertRuleController.java:68](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/ApmAlertRuleController.java:68>). 실제 코드는 worker pool에서 실행한다: [ApmAlertRuleWriteFacade.java:15](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWriteFacade.java:15>).

## 이관 목록

§12.9의 기존 이관은 합본 전 필수 목록으로 적절하다.

- **6a**: 레거시 평가의 `ensureProvisioned`·`pushAll`·`retryPendingTriggerStatus` 제거, `PUSH_CURRENT → STAT(on)` fencing, 진행 중 RPUSH와 현재값 순서 보장, U3 필드 및 non-enforce 이름 정렬 인수. 현재 트랜잭션 내부 외부 I/O 근거: [ApmAlertEvaluationService.java:266](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:266>), [ApmAlertEvaluationService.java:342](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:342>), [ApmAlertEvaluationService.java:429](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:429>).
- **7**: stuck ledger의 트랜잭션 내부 Zabbix 호출 제거.
- **6b**: `zabbixStatus()` 및 02:00 동기화 외부 I/O 분리, 레거시 상태 재시도 제거, ArchUnit 범위 확대.
- **8**: 독자 알림 창구 대기. 사용자 확정 결정을 그대로 유지한다.

다만 위 🔴 `RESOLVE_PUSH` 소유 확인은 §12.9에 없다. 이는 6a 이관 사항이 아니라 5b 실행기의 현재 안전성 결함이므로 합본 전에 직접 수정해야 한다.

## 🟢 참고

- 취소 표식이 lane을 영구 점유하거나 정상 상태에서 REQUEUED를 무한 반복하는 경로는 발견하지 못했다. 리스 만료 PROCESSING 재claim과 표식 무실행 완료가 연결돼 있다: [ApmZbxCommandStore.java:826](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:826>), [ApmZbxCommandWorker.java:299](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:299>).
- `confirmRechecks`는 generation이 같은 결과만 증가시키므로 취소·재적재 경쟁에서 옛 실행이 새 삭제 체인의 포기 횟수를 소모하지 않는다: [ApmZbxCommandStore.java:1200](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1200>).
- `acknowledgeUnidentified()`는 DEAD+`UNIDENTIFIED`만 삭제하므로 취소 표식 PROCESSING과 충돌하지 않는다: [ApmZbxCommandStore.java:1390](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1390>).
- 취소된 RPUSH 표식은 `binding_id`가 있어 binding 요약에서 `queued`로 보인다. RCONF 표식은 binding 요약에서는 0이지만 facade의 동일 lane 조회에는 포함돼 전체 적용 상태는 `QUEUED`다: [ApmZbxCommandStore.java:996](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:996>), [ApmAlertRuleWritePathIT.java:190](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleWritePathIT.java:190>).
- 자동 `item.delete`는 없고 `status:1`만 사용한다: [ZabbixAlertBridge.java:1302](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1302>). 꺼진 우리 아이템은 `status:0`으로 재활성화해 재사용한다: [ZabbixAlertBridge.java:523](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:523>).
- 읽기 전용 조건 때문에 테스트는 실행하지 않았고 코드·누적 diff·테스트 소스를 정적으로 검수했다. `git diff --check`에서는 공백 오류 없이 줄바꿈 경고만 확인됐다.
