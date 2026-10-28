## 판정

**반려** — 3차의 직접적인 명령 행→resource 역전은 해소됐지만, 트리거 ID가 없는 고아 복귀에는 binding↔resource 교착 가능성이 남아 있다.

`HEAD bad215d`와 누적 diff가 현재 작업 트리와 일치한다. 파일 수정·테스트 실행 없이 정적으로 검수했다. 아래 프로덕션 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/`, 테스트 경로는 대응하는 `src/test/java/.../alert/` 기준이다.

## 3차 지적 해소 확인

- **직접적인 취소 선행 역전은 해소됐다.** 켜기·고아 복귀가 `enqueueCancellingConfirms`를 사용하고, 대조 복귀도 `enqueueGuarded(..., cancelConfirms)` 안에서 취소한다. 공통 구현은 가족→resource→기존 행 id순→guard→취소→적재 순서다.  
  근거: `bridge/ApmZbxCleanupService.java:260`, `bridge/ApmZbxCleanupService.java:295`, `bridge/ApmZbxCleanupService.java:503`, `command/ApmZbxCommandStore.java:358`, `command/ApmZbxCommandStore.java:365`, `command/ApmZbxCommandStore.java:368`, `command/ApmZbxCommandStore.java:375`.

- **프로덕션에서 `cancel`·`cancelResolveConfirms` 직접 호출자는 발견하지 못했다.** 삭제는 취소 대신 beforeDelete RCONF→DELETE_TRIGGER 묶음을 공통 적재 경로로 보낸다. 워커의 lifecycle 결과 기록은 자기 행에서 끝나고, PUSH_CURRENT 결과 기록은 resource를 먼저 잡는다. 이 경로들에서 별도의 명령 행→resource 역전은 발견하지 못했다.  
  근거: `bridge/ApmZbxCleanupService.java:120`, `bridge/ApmZbxCleanupService.java:143`, `command/ApmZbxCommandStore.java:474`, `command/ApmZbxCommandStore.java:485`, `command/ApmZbxCommandStore.java:1453`, `command/ApmZbxCommandStore.java:1580`.

- **새 IT는 해당 분기의 resource→RCONF 순서를 검증한다.** 정확한 advisory hash에서 복귀가 대기하는 동안 다른 연결의 RCONF `FOR UPDATE NOWAIT`가 성공하고, 종료 후 취소·RPUSH·STAT 적재를 확인한다. 다만 아래의 실제 평가 트랜잭션 전체 순서는 검증하지 않는다.  
  근거: 테스트 `sync/ApmAlertSyncIT.java:455`, `sync/ApmAlertSyncIT.java:471`, `sync/ApmAlertSyncIT.java:485`, `sync/ApmAlertSyncIT.java:498`.

## 🔴 필수

1. **트리거 ID 없는 고아 복귀에서 binding↔resource 순환 대기를 제거해야 한다.**

   **정적 분석으로 도출한 가능성이며, 실행 재현 결과는 아니다.** 전제는 `orphaned_at`이 있고 `zbx_triggerid=NULL`인 기존 바인딩에 대해 inventory가 정확한 트리거를 찾는 경우다. 이 상태 자체는 기존 IT에서도 사용한다.  
   근거: 테스트 `sync/ApmAlertSyncIT.java:346`, `sync/ApmAlertSyncIT.java:350`.

   가능한 순서는 다음과 같다.

   1. 평가가 기존 바인딩을 조회하고 고아 표식을 메모리에서 지운다. 기존 바인딩 조회에는 명시적 행 잠금이 없다.  
      근거: `bridge/ZabbixAlertBridge.java:290`, `bridge/ZabbixAlertBridge.java:291`, `evaluate/ApmAlertOrphanSweeper.java:219`.
   2. 평가의 `enqueueRestore`는 트리거 ID가 없으므로 가족 키 없이 canonical resource를 잡고 RCONF 취소·복귀 명령을 적재한다. 바인딩 변경은 아직 flush되지 않을 수 있다.  
      근거: `bridge/ApmZbxCleanupService.java:280`, `bridge/ApmZbxCleanupService.java:295`, `bridge/ApmZbxCleanupService.java:573`, `command/ApmZbxCommandStore.java:365`.
   3. 대조는 inventory 트리거의 가족 잠금을 잡고 **바인딩 행을 선점**한 뒤, 누락 ID 복구용 PROVISION 적재에서 평가가 보유한 resource를 기다린다.  
      근거: `sync/ApmAlertSyncService.java:318`, `sync/ApmAlertSyncService.java:320`, `sync/ApmAlertSyncService.java:349`, `sync/ApmAlertSyncService.java:460`.
   4. 평가가 커밋하면서 고아 표식 변경을 flush하려고 대조의 바인딩 행을 기다린다. 따라서 **평가(resource 보유→binding 대기) ↔ 대조(binding 보유→resource 대기)**가 성립한다. 부모 잠금은 양쪽에서 호환되므로 이를 차단하지 않는다.  
      근거: `evaluate/ApmAlertOrphanSweeper.java:268`, `evaluate/ApmAlertEvaluationService.java:370`, `evaluate/ApmAlertParentLocks.java:55`, `evaluate/ApmAlertEventStore.java:143`.

   취소 API 내부 순서뿐 아니라 **트리거 ID가 없는 경우까지 평가·대조의 바인딩 변경과 명령 적재 순서를 통일**해야 한다. 위 인터리빙을 실제 평가 복귀 트랜잭션으로 검증하는 IT가 필요하다. 새 IT는 바인딩을 변경하지 않고 `cleanup.enqueueRestore`만 호출하므로 이 순환을 포착하지 못한다.  
   근거: 테스트 `sync/ApmAlertSyncIT.java:466`.

## 🟡 권장

- `enqueueGuarded`가 `cancelConfirms`를 잠금용 dedup에 자동 합치도록 불변식을 내부에서 보장하는 편이 안전하다. 현재 호출자는 같은 목록을 올바르게 넘기지만, API는 중복 전달 의무를 주석에 의존한다.  
  근거: `command/ApmZbxCommandStore.java:315`, `command/ApmZbxCommandStore.java:367`, `bridge/ApmZbxCleanupService.java:504`, `bridge/ApmZbxCleanupService.java:508`.

## 🟢 확인된 것

- **취소 의미는 보존된다.** beforeDelete RCONF는 제외하고, PENDING·DEAD는 삭제하며 PROCESSING은 유지한 채 `cancelled=true`와 `generation+1`을 기록한다.  
  근거: `command/ApmZbxCommandStore.java:490`, `command/ApmZbxCommandStore.java:510`, `command/ApmZbxCommandStore.java:513`, `command/ApmZbxCommandStore.java:518`.

- **이미 잠근 행의 재잠금과 삭제 후 scope 잔존에서 회귀를 발견하지 못했다.** 재잠금은 같은 트랜잭션에서 수행한다. 삭제된 ID가 scope에 남아도 후속 SQL은 현재 존재하는 행과 command/resource 조건을 다시 확인한다. PROCESSING 취소 행은 의도대로 남는다.  
  근거: `command/ApmZbxCommandStore.java:376`, `command/ApmZbxCommandStore.java:382`, `command/ApmZbxCommandStore.java:391`, `command/ApmZbxCommandStore.java:424`, `command/ApmZbxCommandStore.java:772`, `command/ApmZbxCommandStore.java:848`, `command/ApmZbxCommandStore.java:862`.

- **guard가 skip하면 취소·적재도 실행되지 않는다.** 켜기는 hard RPUSH 뒤 STAT·강제 PROVISION, 복귀는 hard RPUSH 뒤 STAT이라는 기존 의미를 유지한다.  
  근거: `command/ApmZbxCommandStore.java:369`, `command/ApmZbxCommandStore.java:375`, `bridge/ApmZbxCleanupService.java:258`, `bridge/ApmZbxCleanupService.java:295`.

## 이관(단위 8·6c)

- **단위 8:** DEAD 회복·운영자 확인 창구 이관은 유지한다. 위 교착 가능성은 6b에서 해결해야 한다.
- **단위 6c:** continuation·세대·VERIFY·`57014`·HWM/커서 이관을 유지한다.
- 요청서의 회귀·뮤테이션 통과 보고는 이번 검수에서 재실행하지 않았다.