## 판정

**반려**

삭제 체인의 큰 구조는 타당하지만, 남의 소유 객체를 건드릴 수 있는 식별 누락과 `RESOLVE_CONFIRM`을 실제 시도 없이 포기할 수 있는 결함이 있습니다.

## 🔴 필수

1. **ID 조회 경로가 논리 식별을 버려 다른 MovesEye 트리거를 삭제·해소할 수 있습니다.**

   실행기는 `ruleUid·scopeUid·kind`를 조립하고도 ID 조회에는 전달하지 않습니다([ApmZbxDeleteExecutor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:69), [ApmZbxResolveConfirmExecutor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolveConfirmExecutor.java:57)). 브리지는 ID 조회 결과를 `ownedTriggers(..., null)`로 검증하고, `identity == null`이면 가상 호스트와 `owner`만 맞아도 통과시킵니다([ZabbixAlertBridge.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1304), [ZabbixAlertBridge.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1463)).

   따라서 장부 ID가 오염되거나 다른 소유 트리거를 가리키면 해당 트리거를 삭제하거나 열린 Problem을 닫을 수 있습니다. 이는 설계의 `host + owner + ruleUid + scopeUid + kind` AND 조건과 다르며, 판정 기준상 **남의 객체 삭제**입니다.

   ID 조회에도 가능한 논리 식별을 전달해 전부 재검증해야 합니다. 같은 호스트·같은 owner지만 다른 규칙/대상/종류인 ID를 넣는 DELETE 및 RCONF IT도 필요합니다. 현재 테스트는 태그 검색 경로와 owner가 없는 외부 객체만 검사합니다([ApmZbxCommandExecutionIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:60)).

2. **삭제 체인의 포기 횟수가 ‘성공한 해소 확인’이 아니라 모든 claim 실패를 셉니다.**

   `attempts`는 claim할 때마다 증가하고([ApmZbxCommandStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:796)), 네트워크·토큰·조회 예외도 워커가 `RETRY`로 기록합니다([ApmZbxCommandWorker.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:295)). 그런데 실행기는 `attempts > confirmGiveUpAttempts`이면 Zabbix 조회보다 먼저 `DONE`을 반환합니다([ApmZbxResolveConfirmExecutor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxResolveConfirmExecutor.java:61)).

   결과적으로 다음 경우 `ackClose`를 한 번도 성공시키지 못했는데 RCONF가 완료되고 DELETE가 진행됩니다.

   - Zabbix 장애로 10회 연속 RPC 실패
   - 오래 재시도하던 일반 RCONF에 `beforeDelete=true`가 병합된 경우
   - 풀 대기·토큰 발급 실패가 누적된 경우

   이는 **close-before-delete 명령 유실 및 순서 위반**입니다. 포기 카운터는 별도 필드로 두고, 성공적으로 조회·ack한 뒤 `RECHECK`한 횟수만 세어야 합니다. 일반 RCONF에서 삭제 체인으로 전환될 때도 삭제 전용 카운터를 새로 시작해야 합니다. 전송 실패 10회 후 복구되는 경우와, 높은 일반 RCONF 시도 횟수에 삭제가 병합되는 경우를 테스트해야 합니다.

## 🟡 권장

- `ApmAlertOrphanSweeper.sweep()` 자체에는 트랜잭션 선언이 없습니다([ApmAlertOrphanSweeper.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:177)). 현재 운영 호출은 `evaluateAll()`의 트랜잭션 안이라 원자적이지만, 직접 호출되면 `enqueueDelete`와 `bindings.delete`가 분리될 수 있습니다. `MANDATORY` 가드나 명시적 `@Transactional` 및 롤백 IT를 권장합니다.
- 사후 선행 IT는 객체 잔해만 검사하고 열린 Problem을 만들지 않습니다([ApmZbxCommandExecutionIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:303)). 열린 Problem까지 심은 뒤 recovery 또는 명시적 종료를 검증해야 합니다.
- 보고된 433개 묶음은 잔여 명령 때문에 한 번 실패했고 전체 재실행은 OOM으로 미완입니다. 패키지 회귀를 shard로 다시 실행해야 합니다. 현재 7개 뮤테이션은 위 두 필수 결함을 검출하지 못합니다.
- 읽기 전용 검수이므로 테스트는 재실행하지 않았습니다. 요청서의 실행 결과와 정적 코드 대조를 기준으로 판정했습니다.

## 이관 목록

- **5b — PROVISION/신규 바인딩과 DELETE_ITEM 경쟁:** 현재 참조 조회와 `markLinearized` 사이에는 공유 잠금이 없고, `markLinearized`는 generation·edge·pending lane만 다시 봅니다([ApmZbxDeleteExecutor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxDeleteExecutor.java:131), [ApmZbxCommandStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:839)). 5b에서 PROVISION/바인딩 생성이 item-family 잠금 또는 generation/edge 갱신에 반드시 참여해야 합니다.
- **5b·6a — 선형화 뒤 사후 선행의 열린 Problem:** 현재 item cascade가 트리거를 먼저 없애면 뒤의 RCONF는 “트리거 없음”으로 성공해 Problem을 닫지 못합니다. 이관은 가능하지만, “사후 선행이 운영 경로에서 불가능함”을 잠금으로 증명하거나 item 삭제 전에 관련 Problem을 닫는 보상 경로가 최종 배포 게이트에 포함되어야 합니다. 단순히 “트리거 없음=성공”으로 두는 것은 충분하지 않습니다. 현재 운영 도달성은 5b PROVISION 경쟁에 의존하므로 일부는 **추정**입니다.
- **6a — 5a-1 이관:** ID 화해·realias와 PUSH claim 교차 경쟁, PUSH가 lifecycle보다 먼저 claim된 경우의 순서 IT가 남아 있습니다.
- **5b·6a 이후:** 생성·수정·끄기·켜기·resync 및 평가의 직접 Zabbix 호출은 여전히 트랜잭션 안에 있습니다. 삭제 입구의 직접 제거 호출은 없어졌지만, 고아 정리는 같은 `evaluateAll` 트랜잭션에서 다른 바인딩의 Zabbix RPC를 계속 수행할 수 있습니다.

## 🟢 참고

- 키 기반 DELETE_ITEM의 ID 화해는 가족 잠금 → resource 잠금 → 행 ID 오름차순 잠금을 따르고, 새 선행이 생기면 `REQUEUED`로 돌립니다([ApmZbxCommandStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:893)).
- `markLinearized`의 token·generation·dependency·pending lane 재검증과 결과 기록 CAS는 설계대로 구현되어 있습니다.
- 워커는 RPC를 트랜잭션 밖에서 실행하고, `runNow` timeout 시 취소하지 않으며, executor 포화 시 PENDING을 유지합니다. 커밋 후 wake 합치기와 주기 drain도 갖췄습니다.
- 화면 삭제·`deleteRule`·SLO·`releaseService`는 바인딩 삭제 전에 같은 트랜잭션에서 명령을 적재합니다. 예약 바인딩의 태그·키 식별 및 공유 아이템 참조 검사도 포함됩니다.
- `clock <= cutoff`, 0건 성공, 복수 exact-match 처리, 일시 실패 재시도와 generation CAS는 적절합니다.

## 의견 요청 답

1. **정책 자체는 조건부 수용, 현재 구현은 불수용입니다.** `10회 × 60초`는 성공한 ack·재확인 주기에만 적용해야 합니다. 전송 실패나 기존 일반 RCONF 이력을 세면 안 됩니다. `manual_close=0`에서 삭제 체인만 완료 처리하는 선택은 영구 정체보다 낫지만, recovery 이벤트가 남지 않는다는 경고·계측을 유지해야 합니다.

2. **단순 이관만으로는 부족합니다.** 5b·6a의 명시적 완료 조건과 열린 Problem 포함 경쟁 IT가 있으면 이관 가능합니다. 그렇지 않으면 5a-2에서 막아야 합니다.

3. **조건부로 충분합니다.** 이 브랜치를 단독 배포하지 않는 전제에서 5b 이관은 가능하지만, 참조 재조회만으로는 부족합니다. PROVISION/바인딩 생성과 DELETE_ITEM이 같은 item-family 동기화에 참여하고, 늦은 생성이 DELETE_ITEM generation을 깨거나 선행을 추가해야 합니다.

4. **원칙적으로 충돌하지 않습니다.** 같은 resource의 partial unique는 동시 실행만 막고 순서를 보장하지 않으므로, 의미 순서는 edge로 보장하는 것이 맞습니다. RCONF→DELT 및 DELT→DELI와 선형화 직전 재검증은 적절합니다. 다만 선형화 이후 edge의 열린 Problem 문제는 의견 2의 조건을 충족해야 합니다.
