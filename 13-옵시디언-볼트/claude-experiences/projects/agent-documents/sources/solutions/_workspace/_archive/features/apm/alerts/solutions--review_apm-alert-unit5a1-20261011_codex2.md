## 판정

**반려**

`pending_resource_key`의 상태 전이 자체는 보강됐지만, 별칭 정규화와 미커밋 `pending_resource_key` 주변에 동일 논리 lane의 병행 실행 창이 남아 있습니다. 이는 실제 순서 위반으로 이어질 수 있으므로 5a-1에서 닫아야 합니다.

## 🔴 필수

- **별칭의 정규 lane 결정이 advisory lock보다 먼저 수행되어 TOCTOU 경쟁이 남습니다.**

  [ApmZbxCommandStore.java:272](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:272)에서 `adoptCanonicalLane()`을 실행한 뒤 [ApmZbxCommandStore.java:279](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:279)에서야 advisory lock을 획득합니다. 잠금을 기다리는 동안 정규 행이 생겨도 판정은 다시 수행되지 않습니다.

  가능한 순서는 다음과 같습니다.

  1. 미해결 `RCONF:t9(m:)`가 정규 행이 없다고 판정한다.
  2. 같은 `zbx_id=t9`의 정규 `DELT:t9(b:)`가 먼저 `zt:t9` advisory lock을 얻어 커밋한다.
  3. `RCONF`가 뒤늦게 잠금을 얻지만 이미 계산한 `m:` spec으로 INSERT한다.
  4. [realias](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:527)는 현재 spec이 정규 키일 때만 별칭을 옮기므로 두 행이 `m:`과 `b:`로 영구 분리됩니다.

  같은 문제가 `DELI:i{id}(m:)` ↔ `DELI:k{hash}(i:)`에도 존재합니다. 후속 정규 enqueue가 우연히 한 번 더 오지 않으면 자동 복구되지 않으며, 각 행의 선행 edge도 서로 달라 item 삭제가 다른 트리거 선행을 앞지를 수 있습니다.

  별칭 판정을 공통 `(family, zbx_id)` 잠금 아래에서 재확인하도록 변경해야 합니다. `RCONF↔DELETE_TRIGGER`, `DELETE_ITEM id↔key` 양쪽 모두 “미해결 판정 직후 정지 → 정규 행 커밋 → 재개” latch IT가 필요합니다.

- **요청서가 인정한 ‘커밋 직전 순간’은 실제 fence 순서 위반을 만들 수 있습니다.**

  lifecycle enqueue의 행 선잠금에서 PUSH 행은 `pushResources`만 대상으로 합니다([ApmZbxCommandStore.java:455](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:455)). 그러나 lifecycle batch에서는 `pushResources`가 비어 있고 `lifecycleResources`만 채워집니다. PUSH 삭제는 이후 [ApmZbxCommandStore.java:291](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:291)에야 수행됩니다.

  따라서 다음 경쟁이 가능합니다.

  1. `m:` RCONF/DELETE가 PROCESSING이다.
  2. 정규 재적재가 `pending_resource_key=b:`와 `generation+1`을 미커밋 상태로 기록한다.
  3. 기존 PENDING `PUSH_CURRENT(b:)`가 미커밋 pending 키를 보지 못하고 claim된다.
  4. supersede DELETE는 PUSH가 PROCESSING으로 변한 뒤라 지우지 못한다.
  5. 정규 재적재가 커밋되면 `m:` lifecycle과 PUSH가 같은 논리 lane에서 동시에 PROCESSING이다.

  [claim 조건](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:744)은 **커밋된** pending lane에는 정확하지만 이미 발급된 PUSH claim을 회수하지 못합니다. generation 재실행도 이미 수행된 외부 RPC를 되돌리지 않습니다. 특히 새 값 PUSH가 Problem을 만든 뒤 RCONF가 고정 cutoff까지만 닫으면 새 Problem이 남을 수 있습니다.

  lifecycle enqueue의 ②단계 행 잠금에 같은 resource의 PENDING·DEAD PUSH를 포함해 claim이 `SKIP LOCKED`로 건너뛰게 해야 합니다. 미커밋 re-key와 PUSH claim을 latch로 교차시키는 IT도 필요합니다.

## 🟡 권장

- [운영 진단 SQL](/C:/solutions/_workspace/guides/ops_v79-predeploy-diagnostics.md:58)에 다음 두 가지를 추가하는 편이 좋습니다.

  - `status='PROCESSING'`을 `coalesce(pending_resource_key, resource_key)`로 묶어 2행 이상인 유효 lane 탐지.
  - `RCONF/DELETE_TRIGGER` 가족 및 `DELETE_ITEM` 가족별로 같은 `zbx_id`가 서로 다른 유효 resource에 걸친 경우 탐지.

  현재 D1~D5는 V53 의존 복원 이상은 찾지만 위 두 경쟁의 결과는 찾지 못합니다.

- `pending_resource_key`가 있는 만료 PROCESSING을 **선행 edge 없이 바로 재claim**하는 전용 IT를 추가하십시오. 구현 SQL은 적용하지만 현재 모든 탈출 경로 테스트는 `expiredBlocked` 해제 경로만 직접 검증합니다.

## 이관 목록

- 없음. 위 두 건은 실행기 세부사항이 아니라 5a-1의 lane 원자성 문제이므로 5a-2나 6a로 넘길 수 없습니다.

## 🟢 참고

- 커밋된 상태를 기준으로는 `retry`·`dead`·`release`·`markLinearized`·리스 만료 해제와 재claim 모두 pending 키를 같은 SQL에서 적용합니다. `complete`도 generation 불일치 시 같은 공통 전환을 탑니다.
- claim의 committed-row 조건은 후보의 `coalesce(pending_resource_key, resource_key)`를 다른 PROCESSING 행의 현재 키와 pending 키 모두에 비교해 정확합니다.
- 순차 실행에서의 별칭 범위는 적절합니다. `RCONF↔DELETE_TRIGGER`는 trigger 가족으로, `DELETE_ITEM id↔key`는 item 가족으로 묶고 trigger의 `itemResource/itemId`로 item 별칭도 이동합니다.
- 현재 3단계 잠금은 advisory 해시 오름차순 → 기존 명령 `id` 오름차순 → INSERT `dedup` 오름차순이며, 단위 1~4는 도메인 행 잠금 후 명령 잠금 방향만 존재합니다. 변경 범위에서 반대 방향의 교착 사이클은 발견되지 않았습니다.
- `release()` generation 판정과 [마이그레이션 전체 롤백 IT](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/V79MigrationIT.java:214)는 적절합니다.
- 읽기 전용 검수이므로 테스트는 재실행하지 않았고 파일도 수정하지 않았습니다.
