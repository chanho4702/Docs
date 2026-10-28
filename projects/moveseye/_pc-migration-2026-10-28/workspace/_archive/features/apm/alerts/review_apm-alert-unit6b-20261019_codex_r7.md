## 판정

**승인** — 6차 🔴1·🔴2가 해소됐으며, 검토 범위에서 새 승인 차단 결함은 발견하지 못했다.

`HEAD bad215d`와 제공된 누적 diff가 현재 작업 트리에 일치한다. 파일 수정·테스트 실행 없이 정적 검수했다. 아래 프로덕션 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이다.

## 6차 지적 해소 확인

1. **🔴1 해소: 대조의 가족 → 바인딩 역전 경로가 제거됐다.**

   트랜잭션 1은 예약 결과의 바인딩을 잠근 뒤 PROVISION만 적재한다. PROVISION의 적재 계획에는 `zt:` 가족이 없다. 트랜잭션 1이 커밋된 뒤, 트랜잭션 2가 바인딩을 잠금·refresh하고 현재 ID와 inventory ID의 가족을 함께 잠근다. 따라서 예약 도중 다른 경로가 기존 바인딩을 반환하게 만들어도, 종전처럼 가족을 보유한 채 그 바인딩을 기다리지 않는다.

   근거: `sync/ApmAlertSyncService.java:246`, `sync/ApmAlertSyncService.java:257`, `sync/ApmAlertSyncService.java:325`, `sync/ApmAlertSyncService.java:412`, `sync/ApmAlertSyncService.java:455`; `bridge/ApmZbxCleanupService.java:459`; `command/ApmZbxCommandStore.java:581`.

2. **🔴2 해소: 대기 PROVISION이 상태 복귀를 일괄 생략하지 않는다.**

   대기 PROVISION이면 객체 대조만 생략하고 `statusBinding`을 반환한다. 상태 대조는 같은 회차의 별도 트랜잭션에서 수행한다. DEAD 선행에 막힌 경우만 상태 대조도 넘긴다.

   새 `pendingProvisionDoesNotSkipStatusRestore`는 비강제 PROVISION 대기 상태에서 `alreadyQueued=1`, `statusQueued=1`, hard RPUSH와 실행 후 ON을 단언하므로 **종전 생략 분기의 회귀를 직접 검증한다.**

   근거: `sync/ApmAlertSyncService.java:332`, `sync/ApmAlertSyncService.java:342`, `sync/ApmAlertSyncService.java:253`; `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:587`.

## 🔴 필수

없음. 아래 권장 사항은 승인 차단으로 분류하지 않는다.

## 🟡 권장

- **새 IT의 증명 범위를 경합 전체로 확대해 표현하지 말 것.** 기존 바인딩에 PROVISION을 미리 적재하는 순차 테스트이며, 동시 예약·두 트랜잭션 사이 변경·반복 실행의 generation 불변은 직접 검증하지 않는다. 해당 경계에 latch 기반 IT와 RPUSH→STAT 의존 단언을 추가하면 좋다.  
  근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:588`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:593`, `src/test/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncIT.java:595`.

- **완료·부분 완료된 묶음까지 중복 방지가 보장되는 것은 아니다.** 상태 비교는 계속 최초 inventory를 사용한다. 상태를 수렴시킨 PROVISION과 후속 묶음이 트랜잭션 2 전에 완료되거나 일부 행이 사라졌다면, 같은 의도 guard가 성립하지 않아 추가 복귀 묶음이 적재될 수 있다. 이는 **정적 추론**이며, 이번 분리 구조에서 무한 churn을 만드는 반복 경로는 찾지 못했다. 완료 경계의 추가 hard RPUSH 여부를 IT로 명시하면 좋다.  
  근거: `sync/ApmAlertSyncService.java:406`, `sync/ApmAlertSyncService.java:427`; `bridge/ApmZbxCleanupService.java:505`.

## 🟢 확인된 것

- **트랜잭션 사이 DB 상태 변경을 재판정한다.** 규칙은 부모 잠금으로 현재 `enabled`를 읽고, 바인딩은 FOR UPDATE 후 refresh한다. 규칙 꺼짐·고아 표식이면 원하는 상태가 OFF가 되고, inventory와 다를 때 해소 묶음을 적재한다. 바인딩이 삭제됐으면 건너뛴다. PROVISION이 ID를 기록했으면 최신 ID와 inventory ID를 모두 가족 잠금에 포함한다.  
  근거: `evaluate/ApmAlertEventStore.java:143`; `sync/ApmAlertSyncService.java:398`, `sync/ApmAlertSyncService.java:412`, `sync/ApmAlertSyncService.java:418`, `sync/ApmAlertSyncService.java:440`, `sync/ApmAlertSyncService.java:459`.

- **정상 경로에서 관련 교착 순환은 발견하지 못했다.** 고아 처리·복귀는 바인딩 변경을 명령 적재 전에 flush하고, 규칙 쓰기는 규칙 배타 잠금으로 대조의 SHARE와 직렬화된다. 정상 삭제는 부모·바인딩을 선잠금한다.  
  근거: `evaluate/ApmAlertOrphanSweeper.java:221`, `evaluate/ApmAlertOrphanSweeper.java:258`; `rule/ApmAlertService.java:476`, `rule/ApmAlertService.java:660`, `rule/ApmAlertService.java:673`, `rule/ApmAlertService.java:1386`.

- **“모든 경로에서 가족보다 바인딩을 먼저 잠근다”는 표현은 여전히 제한해야 한다.** 규칙 없는 비정상 바인딩의 고아 정리는 명령 적재 후 바인딩을 삭제한다. 다만 대조는 부모 부재를 확인하고 반환하므로, 이 예외와 대조 사이에 종전 순환은 구성되지 않는다.  
  근거: `evaluate/ApmAlertOrphanSweeper.java:237`, `evaluate/ApmAlertOrphanSweeper.java:242`, `evaluate/ApmAlertOrphanSweeper.java:245`; `sync/ApmAlertSyncService.java:402`.

- **완전한 동일 의도 묶음이 남아 있으면 재적재하지 않는다.** guard는 lane·관련 dedup 행을 잠근 뒤 DEAD→차단→동일 의도 순으로 검사하고, 동일 의도면 UPSERT 전에 반환한다. 대기 PROVISION 자체도 다시 적재하지 않으므로, 상태 대조를 수행한다는 이유만으로 기존 PROVISION의 generation을 올리지 않는다.  
  근거: `command/ApmZbxCommandStore.java:368`, `command/ApmZbxCommandStore.java:373`, `command/ApmZbxCommandStore.java:382`; `bridge/ApmZbxCleanupService.java:503`, `bridge/ApmZbxCleanupService.java:529`.

## 이관(단위 8·6c)

- **단위 8:** DEAD 회복·운영자 확인 창구 이관 유지.
- **단위 6c:** continuation·세대·VERIFY·`57014`·HWM/커서 이관 유지.  
  근거: `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:723`, `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:763`.

요청서의 테스트·뮤테이션 통과 보고는 재실행하거나 독립 확인하지 않았다.