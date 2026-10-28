## 판정

**반려**

1차 🔴2(`attempts` 오용)는 충분히 해소됐습니다. 🔴1도 정상 신규 명령의 완전한 식별 경로는 보강됐지만, V53 부분 식별 경로는 아직 남아 있습니다.

또한 `DELETE_ITEM`이 MovesEye 소유 아이템을 참조하는 외부 트리거까지 cascade 삭제할 수 있는 새 🔴 결함과, `UNIDENTIFIED` V53 트리거가 전역 barrier를 영구 정체시키는 정책 문제가 확인됐습니다.

## 🔴 필수

1. **`DELETE_ITEM`이 외부·사용자 트리거를 cascade 삭제할 수 있습니다.**

   현재 참조 검사는 MovesEye DB 바인딩만 조회합니다([ApmZbxDeleteExecutor.java:143](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:143), [ApmZbxCommandStore.java:1170](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1170)). 참조가 없으면 곧바로 `item.delete`를 실행합니다([ApmZbxDeleteExecutor.java:149](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:149), [ZabbixAlertBridge.java:1383](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1383)).

   그러나 이번 실측과 테스트 대역 모두 `item.delete`가 해당 아이템을 사용하는 **모든 트리거**를 함께 삭제한다고 전제합니다([FakeZabbixAlertBackend.java:432](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/support/FakeZabbixAlertBackend.java:432)). 사용자가 MovesEye 소유 아이템을 이용해 별도 트리거를 만들었다면 그 트리거에는 MovesEye owner 태그가 없어도 같이 삭제됩니다. 판정 기준상 명확한 **남의 객체 삭제**입니다.

   `markLinearized` 전에 해당 아이템을 참조하는 Zabbix 트리거를 조회하여 하나라도 남아 있으면 아이템을 보존해야 합니다. 정상적인 자체 트리거도 이 시점에는 선행 명령으로 이미 삭제돼 있어야 하므로, “참조 트리거 0건”을 비가역 삭제 조건으로 삼는 편이 안전합니다. 이에 따라 호출 수 상한·리스 검증도 갱신하고, 외부 트리거가 붙은 소유 아이템이 보존되는 IT와 뮤테이션을 추가해야 합니다.

2. **V53 트리거 행은 여전히 완전한 논리 식별 없이 ID만 신뢰할 수 있습니다.**

   V79는 V53 트리거의 target에 `zbxIds`와 `ruleUid`만 넣고 `scopeUid·kind`는 복원하지 않습니다([V79__apm_zbx_command.sql:116](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V79__apm_zbx_command.sql:116)). 실행기는 `ruleUid`만 있으면 식별을 유효하다고 보고([ApmZbxDeleteExecutor.java:189](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:189)), `scopeUid·kind`가 null이면 검사를 생략합니다([ZabbixAlertBridge.java:1476](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1476)).

   따라서 V53의 `zbx_id`가 같은 규칙의 다른 대상 트리거를 가리키는 경우 그 트리거가 삭제되고 Problem도 닫힙니다. 실제 운영 데이터에 이런 오염이 있는지는 **추정**이지만, 1차 검수에서 요구한 “오염된 ID도 다른 대상·종류를 건드리지 않는다”는 안전성은 아직 구조적으로 성립하지 않습니다. 현재 IT는 완전한 `(ruleUid, scopeUid, kind)`을 가진 명령만 검사합니다([ApmZbxCommandExecutionIT.java:99](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:99)).

   살아 있는 바인딩으로 `scopeUid·kind`를 복원하거나, 완전한 식별을 복원할 수 없는 V53 트리거는 `UNIDENTIFIED`로 처리해야 합니다. 부분 식별 V53 ID가 같은 규칙의 다른 scope를 가리키는 DELETE/RCONF IT가 필요합니다.

3. **`UNIDENTIFIED` V53 DEAD 정책은 현재 전역 barrier를 영구 정체시킵니다.**

   출처가 전부 빈 V53 트리거는 모든 이관 아이템의 전역 선행으로 연결됩니다([V79__apm_zbx_command.sql:159](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V79__apm_zbx_command.sql:159)). 이번 실행기는 그런 트리거를 반드시 `UNIDENTIFIED` DEAD로 만듭니다. 그 결과 하나의 행이 모든 이관 아이템을 영구 차단합니다.

   그런데 운영 가이드는 D2가 있어도 “배포해도 안전”하다고 하고 상태 조회만 요구합니다([ops_v79-predeploy-diagnostics.md:50](/C:/solutions/_workspace/guides/ops_v79-predeploy-diagnostics.md:50)). `retryDead()`는 식별정보를 보충하지 않으므로 다시 DEAD가 될 뿐이며([ApmZbxCommandStore.java:1135](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1135)), 지원되는 완료·취소·식별 보정 경로도 없습니다.

   안전한 fail-closed 방향 자체는 맞지만, 현재는 판정 기준상 **영구 정체**입니다. 다음 중 하나가 필요합니다.

   - D2 비영행을 배포 차단 조건으로 바꾸고 배포 전에 수동 정리
   - 식별정보 보정 또는 외부 수동 삭제 확인 후 명령·edge를 안전하게 완료하는 운영 절차와 도구
   - 이 과정을 실제 V53 전역 barrier로 검증하는 실행 IT

## 🟡 권장

- 일반 RCONF 실행 중 삭제 체인이 병합되면 upsert가 `confirmRechecks`를 제거하지만, 앞서 실행 중이던 worker의 `recheckConfirm`이 generation 불일치 상태에서도 카운터를 다시 1 올립니다([ApmZbxCommandStore.java:1023](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1023)). 같은 Problem에 이미 ack한 것이어서 즉시 사고는 아니지만, “삭제 체인 전환 시 0부터” 계약과 다릅니다. ack 중 병합 경쟁 IT를 권장합니다.
- id 화해가 키 없는 DEAD 이관 아이템에 정확 키를 보충해도 상태는 DEAD 그대로입니다([ApmZbxCommandStore.java:941](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:941)). 정규 명령이 실제 삭제를 완료할 수는 있지만 불필요한 DEAD 잔류가 생깁니다.
- executor가 완전히 포화되어 drain 작업을 하나도 제출하지 못하면 호출 스레드에서 직접 실행합니다([ApmZbxCommandWorker.java:168](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:168)). 명령 유실은 없지만 실제 RPC 병렬도가 `workerThreads`를 초과할 수 있으므로 “bounded executor” 상한과 일치시키는 편이 좋습니다.
- 433개 및 `premium.apm.*` 전체 회귀는 OOM으로 미완입니다. shard 재실행이 배포 게이트에 포함된 결정은 유지해야 합니다.
- 읽기 전용 검수이므로 테스트는 재실행하지 않았습니다. `git diff --check`에서는 공백 오류가 발견되지 않았고 파일은 수정하지 않았습니다.

## 이관 목록

- **5b·6a:** 선형화 후 사후 선행에서 item cascade가 트리거를 먼저 없애 열린 Problem이 남는 경로. 현재 IT가 잔존을 명시적으로 고정했으므로, 설계 §11.4의 `isFalse` 전환 전에는 배포 불가입니다.
- **5b:** PROVISION·신규 바인딩과 DELETE_ITEM 참조 검사 경쟁. PROVISION/바인딩 생성이 item-family 잠금 또는 DELETE_ITEM generation·edge 변경에 참여해야 합니다.
- **6a:** id 화해·realias와 PUSH claim 교차 경쟁, PUSH 선행 claim과 lifecycle 선행 claim 양방향 IT.
- **5b·6a:** 생성·수정·끄기·켜기·resync·평가에 남은 트랜잭션 내부 Zabbix 호출의 장부 전환.
- 위 🔴 세 건은 DELETE 실행 안전성과 V53 승계 정체 문제이므로 5b·6a 이관 대상이 아닙니다.

## 🟢 참고

- 1차 🔴2는 `target.confirmRechecks`와 `recheckConfirm`으로 분리돼 전송·조회 실패가 포기 횟수에 포함되지 않습니다. 실패 12회 후 복구 및 일반→삭제 체인 병합 테스트도 추가돼 본질적인 결함은 해소됐습니다.
- 정상 신규 명령의 ID 경로는 host·owner·rule·scope·kind를 AND 재검증하고, 0건 성공·복수 삭제·`clock <= cutoff` 경계를 테스트합니다.
- `reconcileItemIds`는 가족 잠금 → resource 잠금 → 행 ID 순서를 따르고, 선행을 발견하면 `REQUEUED`로 돌립니다. 새 교착 사이클은 발견하지 못했습니다.
- `markLinearized`는 token·generation·pending resource·선행 edge를 재검증합니다. 결과 기록도 generation CAS로 `DONE/REQUEUED/LOST`를 구분합니다.
- RPC 사이 리스 갱신, 트랜잭션 밖 실행 가드, `runNow` timeout 시 cancel 금지, reject 시 PENDING 유지, 커밋 후 wake 합치기는 의도대로 구현됐습니다.
- 화면 삭제·`deleteRule`·SLO·`releaseService`·규칙 없는 고아 정리는 바인딩 삭제 전에 같은 트랜잭션에서 선적재합니다. `sweep()`의 `MANDATORY` 반영도 충분합니다.

## 의견 요청 답

1. **정책은 조건부 수용입니다.** 성공한 ack·재확인만 세는 `10회 × 60초` 구현은 1차 결함을 해소했습니다. `manual_close=0`에서 일반 RCONF는 DEAD, 삭제 체인은 경고 후 완료하는 선택도 영구 정체보다 낫습니다. 다만 recovery 이벤트가 없다는 계측·경고를 유지해야 합니다.

2. **명시적 배포 게이트라면 이관 가능합니다.** 현재처럼 열린 Problem 잔존을 IT로 고정하고, 5b·6a에서 사후 선행 불가능을 증명하거나 삭제 전 보상 해소를 구현한 뒤 단언을 뒤집어야 합니다. 단순 백로그 표기만으로는 부족합니다.

3. **조건부로 충분합니다.** 이 브랜치 단독 배포 금지 전제에서 5b 이관이 가능합니다. 참조 재조회만으로는 부족하고, PROVISION·바인딩 생성이 동일 item-family 선형화에 참여하며 늦은 생성 경쟁 IT가 필요합니다.

4. **§9 선형화와 충돌하지 않습니다.** 같은 resource의 동시 실행 제한과 의미 순서는 별개이므로 순서를 edge로 보장하는 것이 맞습니다. `RCONF→DELT→DELI`와 선형화 직전 재검증도 적절합니다. 다만 이는 위의 외부 트리거 cascade 삭제 문제를 해결하지 않습니다.
