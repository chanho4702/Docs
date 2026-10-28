## 판정

**조건부 승인**

2차 반려의 TOCTOU와 미커밋 re-key 경쟁은 변경 범위에서 해소됐습니다. 5a-1 병합은 가능하되, 아래 `knownIds` 부재 경로를 5a-2에서 구조적으로 닫기 전에는 배포하면 안 됩니다.

## 🔴 필수

- 없음.

## 🟡 권장

- 6a 통합 IT에서 PUSH claim이 lifecycle의 PUSH 행 선잠금보다 먼저 이긴 경우도 검증하십시오. 현재 수정은 행 잠금을 선형화 지점으로 삼아 다음 순서를 보장합니다.

  - lifecycle이 먼저 PUSH 행을 잠금 → claim은 `SKIP LOCKED` → 커밋 시 PENDING·DEAD PUSH 삭제.
  - claim이 먼저 잠금·커밋 → PUSH가 선행한 것으로 확정 → lifecycle은 PROCESSING PUSH를 남기고 그 뒤 실행.

  미커밋 re-key 이후 claim되는 위험한 중간 순서는 [Store:481](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:481)과 [latch IT:853](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:853)로 차단됐습니다.

## 이관 목록

- **5a-2 — `knownIds` 없는 키 기반 `DELETE_ITEM`의 ID 화해가 필수입니다.**  
  `deleteItemByKey(..., knownItemIds=empty)`는 `zbxIds`가 없어 가족 잠금을 잡지 못하며([Spec:139](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:139), [Store:75](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:75)), 기존 `m:v53:i:{id}` 행과 정규 `i:{host}:{key}` 행을 현재 단계에서는 연결할 수 없습니다. 이는 TOCTOU가 아니라 식별정보 부재 문제입니다. 5a-2 실행기는 정확한 item ID를 조회한 뒤, 외부 삭제·`markLinearized`보다 먼저 해당 ID를 Store의 가족 잠금·realias 경로로 다시 반영해야 합니다. 그렇지 않으면 서로 다른 선행 edge를 가진 두 lane에서 아이템 삭제가 트리거 삭제를 앞지를 수 있습니다.

- **6a — 위 ID 화해와 PUSH 실행기를 결합한 경쟁 IT가 필요합니다.**  
  `knownIds` 없는 키 기반 적재 → ID 발견·realias와 PUSH claim을 교차시켜, claim 선후에 따라 supersede 또는 정상적인 “PUSH 후 lifecycle” 순서 중 하나로만 수렴하는지 확인해야 합니다.

- **D7의 탐지 한계를 운영 메모에 명시해야 합니다.**  
  [D7](/C:/solutions/_workspace/guides/ops_v79-predeploy-diagnostics.md:71)은 `zbx_id`와 `target.zbxIds`가 있는 분리만 탐지합니다. ID를 아직 모르는 키 기반 행과 `m:` 행의 논리 중복은 잡지 못하므로, 5a-2 화해 전까지 D7 0행이 완전한 별칭 무결성을 뜻하지 않습니다.

- 5b로 이관할 신규 항목은 없습니다.

## 🟢 참고

- 가족 잠금 → 별칭 판정 → resource 잠금 → 기존 행 잠금 순서가 [Store:283](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:283)부터 일관되며, 가족·resource 잠금은 별도 네임스페이스와 각각 해시 정렬을 사용합니다. 반대 방향으로 가족 잠금을 취득하는 경로가 없어 새 교착 사이클은 발견되지 않았습니다.
- claim은 advisory lock을 잡지 않고 후보 행을 `SKIP LOCKED`로만 잡습니다. enqueue·PUSH 결과 기록은 resource 잠금 후 행 ID 순서로 진행하므로 가족/resource/행/claim 사이 교착도 발견되지 않았습니다.
- D6은 `coalesce(pending_resource_key, resource_key)` 기준 중복 PROCESSING을 정확히 찾고, D7은 ID가 알려진 트리거·아이템 가족의 lane 분리를 정확히 찾습니다. 테스트 상수와 운영 SQL도 동일합니다.
- 읽기 전용 검수이므로 테스트는 재실행하지 않았으며 파일을 수정하지 않았습니다.
