## 판정

**반려** — 2차 🔴1·3과 대조 내부의 가족 잠금 역전은 해소됐지만, 평가의 고아 복귀와 대조 사이에 명령 행→resource / resource→명령 행의 교착 경로가 남아 있다.

파일 수정·테스트 실행 없이 정적으로 검수했다. 제출 diff는 현재 `HEAD bad215d` 대비 변경과 일치한다. 아래 구현 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/`, 테스트 경로는 대응하는 `src/test/java/.../alert/` 기준이다.

## 2차 지적 해소 확인

| 지적 | 결과·코드 근거 |
|---|---|
| 🔴1 guard 관찰 lane 행 미잠금 | **직접 관찰 행 기준 해소.** `withGuardScope`가 lane을 잠금용 `pushResources`에 추가한다. `lockExisting`과 `laneRows` 모두 lifecycle의 `coalesce(pending_resource_key, resource_key)`를 사용하며, dedup도 같은 `lockPlan.dedups`다. 잠금 집합은 push·별칭까지 포함하는 **상위 집합**이며, guard의 직접 반환 행은 모두 포함한다. `command/ApmZbxCommandStore.java:508`, `command/ApmZbxCommandStore.java:630`, `command/ApmZbxCommandStore.java:1220` |
| 🔴2 트랜잭션 전체 잠금 순서 | **부분 해소.** A·B 모두 부모 다음에 후보 가족을 선잠금하고 바인딩을 잠근다. 이후 적재의 가족 재획득은 같은 키이므로, 종전 PROVISION→복귀의 늦은 가족 획득은 해소됐다. 다만 다른 적재 경로와의 순서는 아래 필수 사항처럼 불일치한다. `sync/ApmAlertSyncService.java:300`, `sync/ApmAlertSyncService.java:316`, `sync/ApmAlertSyncService.java:411` |
| 🔴3 binding ID가 null인 경우 inventory RCONF 누락 | **해소.** 현재 binding ID와 inventory 정확 ID를 합치고 중복을 제거한다. 각 ID의 `RCONF:t…`와 태그 `RCONF:g…`를 해소·복귀 guard에 포함한다. 잠근 뒤 binding ID가 후보 밖이면 적재 전에 건너뛰며, A는 `handled`에도 넣어 B에서 재처리하지 않는다. `sync/ApmAlertSyncService.java:318`, `sync/ApmAlertSyncService.java:413`, `sync/ApmAlertSyncService.java:446`, `bridge/ApmZbxCleanupService.java:406`, `bridge/ApmZbxCleanupService.java:421`, `bridge/ApmZbxCleanupService.java:473`, `bridge/ApmZbxCleanupService.java:496` |

## 🔴 필수

1. **평가의 고아 복귀와 대조 guard 사이에 잠금 역전이 남아 있다.**

   평가의 고아 복귀는 `enqueueRestore`를 호출하고, 이 메서드는 **RCONF 취소를 먼저** 수행한다. 취소는 명령 행을 `FOR UPDATE`로 잠그고 PENDING이면 삭제한다. 그 뒤 `store.enqueue`가 resource advisory를 획득한다.

   근거: `evaluate/ApmAlertOrphanSweeper.java:219`, `bridge/ApmZbxCleanupService.java:279`, `bridge/ApmZbxCleanupService.java:291`, `command/ApmZbxCommandStore.java:465`, `command/ApmZbxCommandStore.java:474`.

   반면 대조 guard는 **resource advisory → 같은 lane의 RCONF 포함 명령 행** 순서다.

   근거: `command/ApmZbxCommandStore.java:338`, `command/ApmZbxCommandStore.java:341`, `command/ApmZbxCommandStore.java:635`.

   다음 교차 실행이 가능하다.

   - 대상으로 돌아온 orphan 바인딩에 PENDING RCONF와 `LEGACY_NAME` 트리거가 남아 있다.
   - 평가가 복귀 처리에서 RCONF를 취소하고, 해당 행의 삭제 잠금을 유지한다.
   - 대조가 같은 lane의 resource를 획득하고, 비강제 PROVISION guard를 위해 그 RCONF 행을 잠그다가 평가를 기다린다.
   - 평가가 복귀 명령 적재를 위해 같은 resource를 기다린다.

   부모의 규칙 SHARE는 양쪽에서 양립하므로 이 순환을 차단하지 않는다. `evaluate/ApmAlertParentLocks.java:55`, `evaluate/ApmAlertEventStore.java:143`.

   **이는 실행 재현하지 않은 정적 교착 추론이다.** 평가가 희생되면 대상 하나가 아니라 판정 트랜잭션 전체가 롤백될 수 있다. 가족 선잠금만으로 닫히지 않으므로, 취소와 적재를 포함한 기존 복귀 경로도 resource·명령 행의 공통 순서로 맞추고 이 교차 실행을 검증해야 한다.

## 🟡 권장

- **`pg_locks` 테스트의 resource 판정식은 맞지만, waiter 식별을 좁혀야 한다.** 저장소는 `(namespace, hashtext(key))`로 잠그므로, `objid::bigint = (hashtext(?)::bigint & 4294967295)`는 음수 hash까지 같은 32비트 값으로 비교한다. 다만 waiter는 가족 namespace에서 기다리는 임의의 첫 PID다. 정확한 `zt:{trigger}` hash·현재 DB·`objsubid=2`와 holder의 blocking 관계까지 확인해야 다른 세션 때문에 통과하는 여지를 줄인다. 테스트 `sync/ApmAlertSyncIT.java:412`, 테스트 `sync/ApmAlertSyncIT.java:421`; 구현 `command/ApmZbxCommandStore.java:617`.

- **새 테스트 3건의 증명 범위는 다음과 같다.**

  | 테스트 | 실제로 확인하는 성질·한계 |
  |---|---|
  | `guardObservedLaneRowsAreLocked` | 입력 dedup 밖의 같은 lane STAT 한 행이 guard 시점에 잠겼음을 확인한다. 전체 집합·id순 획득까지 증명하지는 않는다. 모든 `DataAccessException`을 성공으로 취급하므로 원인 SQLSTATE `55P03`까지 확인하는 편이 정확하다. 테스트 `sync/ApmAlertSyncIT.java:358`, 테스트 `sync/ApmAlertSyncIT.java:371`, 테스트 `sync/ApmAlertSyncIT.java:374` |
  | `familyLockTakenBeforeLaneResource` | 해당 LEGACY_NAME+복귀 경로가 가족을 기다리는 동안 lane resource를 보유하지 않는다는 국소 순서를 확인한다. 바인딩·예약 item resource·명령 행 순서와 다른 경로의 교착 부재는 증명하지 않는다. 위 필수 교착도 검출하지 못한다. 테스트 `sync/ApmAlertSyncIT.java:385`, 테스트 `sync/ApmAlertSyncIT.java:426` |
  | `restoreSeesDeadConfirmByInventoryIdWhenBindingIdMissing` | binding trigger ID가 null일 때 inventory ID의 `m:` DEAD RCONF를 보존하고 복귀를 건너뛰는 조합을 검증한다. 서로 다른 두 ID의 합집합 및 잠금 대기 중 제3 ID로 바뀌는 경쟁은 검증하지 않는다. 테스트 `sync/ApmAlertSyncIT.java:336`, 테스트 `sync/ApmAlertSyncIT.java:349` |

- **신규 예약의 실제 순서는 요청서 표기와 다르다.** 새 바인딩은 INSERT 후 `joinItemFamily`로 item resource를 잡는다. 따라서 “예약 item resource → 바인딩 행”은 기존 행의 명시적 `FOR UPDATE` 단계와 구분해서 기술해야 한다. 이 차이만으로 별도 교착을 확정하지는 않았다. `bridge/ZabbixAlertBridge.java:296`, `bridge/ZabbixAlertBridge.java:303`.

- **분모 합집합은 고쳐졌지만 조기 반환 시 `checked` 중복 여지는 남는다.** A가 스냅샷 뒤 규칙 비활성화로 `handled` 등록 전에 반환하면 같은 binding을 B가 다시 세며, `total`은 한 번만 계산한다. `sync/ApmAlertSyncService.java:201`, `sync/ApmAlertSyncService.java:243`, `sync/ApmAlertSyncService.java:259`, `sync/ApmAlertSyncService.java:266`, `sync/ApmAlertSyncService.java:301`.

## 🟢 확인된 것

- **넓어진 `locked`/`scope`가 적재 의도를 바꾸는 회귀는 발견하지 못했다.** supersede는 원래 `plan`의 resource 목록을 사용한다. fence·DELETE edge·realias도 종류·resource·대상 ID 조건으로 다시 제한하므로, 추가 관찰 행 자체가 새 적재 의도가 되지는 않는다. `command/ApmZbxCommandStore.java:352`, `command/ApmZbxCommandStore.java:361`, `command/ApmZbxCommandStore.java:378`, `command/ApmZbxCommandStore.java:702`, `command/ApmZbxCommandStore.java:809`, `command/ApmZbxCommandStore.java:823`.

- **guard는 upsert·realias보다 먼저 실행된다.** skip이면 RCONF 취소도 실행하지 않는다. 삭제 체인의 `beforeDelete` RCONF는 취소 필터가 보존한다. `command/ApmZbxCommandStore.java:343`, `command/ApmZbxCommandStore.java:350`, `command/ApmZbxCommandStore.java:455`, `bridge/ApmZbxCleanupService.java:502`.

- **규칙 쓰기·삭제는 같은 부모에서 먼저 배제된다.** 규칙 UPDATE 및 서비스 삭제의 부모 잠금과 대조의 SHARE/KEY SHARE가 바인딩·명령 잠금 전에 충돌한다. 워커의 PUSH 결과 기록도 resource→명령 행 순서이며, lifecycle 결과 기록은 자기 행에서 끝난다. 검토한 이 경로들에서는 추가 역전을 발견하지 못했다. `rule/ApmAlertService.java:1380`, `rule/ApmAlertService.java:1386`, `rule/ApmAlertService.java:636`, `command/ApmZbxCommandStore.java:1543`.

- **교차 lane 선행은 잠금 밖이다.** `blockedByDead`가 참조하는 선행 행까지 잠그지는 않는다. 해당 선행만 guard 직후 DEAD가 되는 경우에는 선행 자체를 부활시키지 않고 후속이 막히므로, 요청서의 “자동 부활 없이 집계가 지연된다”는 설명은 타당하다. `command/ApmZbxCommandStore.java:1224`, `bridge/ApmZbxCleanupService.java:531`.

## 이관(단위 8·6c)

- **단위 8:** 명시적 DEAD retry·운영자 확인 창구는 기존 이관을 유지한다. 위 잠금 역전은 **6b에서 해결해야 한다.**
- **단위 6c:** continuation·세대·VERIFY·`57014`·HWM/커서 검증은 기존 범위대로 유지한다.
- 실제 Zabbix `expandExpression`, 1,000+ 규모 및 전체 회귀 통과 여부는 이번 정적 검수에서 확인하지 않았다.