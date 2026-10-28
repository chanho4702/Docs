# 검수 요청 — APM 알람 재설계 단위 6b(02:00 대조 분할·상태 진단 분리·레거시 정리) (2026-10-19)

- 브랜치 `apm-alert-history`(워크트리 `C:\worktrees\apm-c05-followup`), 기준 HEAD `bad215d`(단위 7), **미커밋**.
- 설계 정본: `_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md` **§15 + §15.9~§15.11**(설계 검수 3회: `review_apm-alert-unit6b-design-20261019_codex{,2,3}.md` — 3차 조건부 진행, 조건 3건은 §15.11에 반영).
- 알림 재조정 이어하기(설계 2차 🔴5~8)는 **단위 6c로 분리**(이번 diff에 `notify/*` 변경 없음).

## 범위(변경 파일)
- `sync/ApmAlertSyncService.java` — 전면 재작성(3단: 무잠금 목록 → `inventoryForReconcile` 일괄 읽기(트랜잭션 없음) → 대상별 짧은 트랜잭션). `@Transactional` 제거, 15분 상한(`truncated`), 결과 필드 분리.
- `sync/ApmAlertSyncJob.java` — 경고 조건을 `needsAttention()`으로.
- `bridge/ZabbixAlertBridge.java` — `inventoryForReconcile`(trigger.get에 expression·expandExpression, item.get에 state·error — RPC 추가 0), `Inventory.notSupportedByKey`·`exactTrigger`, `status()`/`readTrigger` 트랜잭션 가드(status는 try 바깥). **삭제**: `applyOurDefinition`·`binding(rule,scope,now)`·`ensureItem`·`ItemProvision`·`ensureItemRaw`·`ensureTrigger`·`itemError`·`StatusOutcome`·`applyTriggerStatus`·`TriggerStatusRetryResult`·`retryPendingTriggerStatus`×2·`triggerStatus`·`ownedTrigger`. `alignLegacyDescription`·`readTrigger` 유지.
- `command/ApmZbxCommandStore.java` — `LaneRow`·`laneRows`(dedup ∪ lane, DEAD 선행 차단 여부), **`enqueueGuarded`**(②기존 행 잠금 직후 guard → 이유가 있으면 쓰지 않음), `enqueue` 본체를 `enqueueImpl`로.
- `bridge/ApmZbxCleanupService.java` — `ReconcileOutcome`·`ReconcileTarget`, `reconcileProvision`(비강제)·`reconcileResolve`(soft RPUSH→STAT→RCONF)·`reconcileRestore`(hard RPUSH→STAT, 가드 통과 뒤에만 RCONF 취소), `guard`(DEAD → 막힘 → 같은 의도).
- `rule/ApmAlertService.zabbixStatus` — `@Transactional(readOnly)` 제거.
- 테스트: `sync/ApmAlertSyncIT` 신규 14 · `sync/ApmAlertSyncServiceTest` 삭제(mock 단위, 옛 구조) · `ZabbixAlertBridgeTest` 레거시 15건 삭제 + 4건을 남은 경로로 이관(`commandHost`·`expression`·`triggerDescription`) · `ApmAlertJobTest` SyncResult · ArchUnit +2(`syncNeverWritesZabbix`·`syncDoesNotDependOnExecutorsOrWorker`) · FakeZabbix `setItemNotSupported`.

## 의도와 버린 대안
- **DEAD 확인을 적재 잠금 안에서**(`enqueueGuarded`) — 설계 §15.11은 "3단계 트랜잭션에서 바인딩 FOR UPDATE + resource advisory 뒤 확인"이었으나, 대조가 resource advisory를 먼저 잡으면 이어지는 `enqueue`의 가족 advisory와 **순서가 뒤집힌다**(가족 → resource가 정규 순서). 그래서 확인을 저장소 적재 경로의 ②(기존 행 id 순 FOR UPDATE) 직후로 옮겼다 — 실행기의 DEAD 기록(자기 행 잠금)과 원자적으로 직렬화된다. 대조 트랜잭션은 바인딩 FOR UPDATE까지만 직접 잡는다.
- 잠금 순서 = `lockParents`(서비스 KEY SHARE → 규칙 SHARE, 5분 평가와 같음) → 바인딩 FOR UPDATE(+`em.refresh`) → 적재(가족 → resource → 행). SLO는 평가와 같이 잠그지 않는다(평가도 안 잠근다 — 규칙 SHARE가 SLO 삭제 CASCADE를 막는다).
- (B) 상태 대상의 식별은 `store.bindingIdentities`(DB 식). 식별이 안 되는 바인딩(서비스·SLO 사라짐)은 대조하지 않는다.
- 꺼진 규칙: (A)에서 빠지고 lockParents 재확인으로 스냅샷 뒤 꺼진 규칙도 PROVISION 없음. (B)에서 트리거가 켜져 있으면 해소 묶음.
- 커밋 뒤 워커는 `wakeAfterCommit`으로 깨우기만(기다리지 않음).

## 중점 확인 요청
1. `enqueueGuarded` — guard가 본 행 집합(dedup ∪ lane)과 `lockExisting`이 잠근 집합이 같은가(guard가 본 행이 잠금 밖이면 TOCTOU). `m:` 별칭 행의 re-key(`adoptCanonicalLane`·`realias`)가 guard 전에 일어나 판정을 바꾸지 않는가.
2. `reconcileRestore`의 RCONF 취소를 적재 **뒤**로 둔 것(enqueueRestore는 취소 → 적재) — 같은 트랜잭션이라 무해하다고 판단. 해소 묶음의 RCONF가 STAT의 후속 edge로 묶여 있을 때 취소(삭제)가 edge를 CASCADE로 지우는 것 외 부작용이 없는가.
3. `repairAndStatus`가 `provisionPending`이면 drift·NOT_SUPPORTED·상태를 전부 건너뛴다(종전 규칙). 이 동안 PROVISION이 DEAD가 되면 다음 날 `skippedDead`로만 보인다 — 괜찮은가.
4. `statusOnly`가 트리거 없음이면 아무것도 안 한다 — 고아·꺼진 규칙의 트리거가 이미 사라졌으면 맞다. 켜진 규칙 대상인데 (A)에서 빠진 경우(targetsOf에 없는 활성 바인딩 = 곧 고아)는?
5. `em.refresh` 후 `bindings.save` — 대상별 트랜잭션에서 영속성 컨텍스트가 대상마다 새로 열리는가(TransactionTemplate + `@PersistenceContext` 공유 EM).
6. ArchUnit `dependOnClassesThat().areAssignableTo(ApmZbxCommandExecutor)` — sync가 cleanup 서비스를 통해 간접적으로 실행기에 닿는 것은 막지 않는다(의도: 직접 의존 금지 + cleanup 서비스는 적재만이라는 기존 규칙).

## 검증 현황
- 통과(격리 DB 5434, 클래스별 단독): ApmAlertSyncIT **15**(+`itemDisabledQueuesProvisionOnly`) · ZabbixAlertBridgeTest 25 · ApmAlertJobTest 11 · ApmZbxWriteSingleEntryTest 8 · ApmZbxCleanupServiceTest 9.
- 회귀: ApmAlertRuleMvcTest 8 · ApmAlertRuleWritePathIT 11 · ApmAlertEvaluationZabbixPhaseIT 26 · ApmZbxProvisionIT 18 · ApmZbxStatusCommandIT 38 · ApmZbxCommandStoreIT 44 · ApmZbxCommandExecutionIT 30 · ApmAlertEvaluationIT 14 · **ApmAlertEvaluationRaceIT 24**(1건 수정 — 아래) · ApmAlertDeletePathIT 8 · ApmAlertRuleLockOrderIT 1 · ApmStuckRequestLedgerIT 11 · ApmAlertEventHistoryIT(실패 없음).
- 🔴 RaceIT `ruleCreatedAfterLockIsDeferredBySync`는 **옛 대조의 일괄 선잠금(`lockAllForBatch`) phantom**을 시험했다 — 새 대조는 그 잠금을 쓰지 않아 훅이 안 돌았다(결정적 실패). `ruleCreatedAfterListIsDeferredBySync`로 바꿨다: 일괄 읽기(trigger.get) 도중 다른 트랜잭션이 규칙 생성·커밋 → 이번 회차 checked 불변 → 다음 회차 +1. 판단 요청: 이 교체가 원래 테스트가 지키던 성질("잠금 없이 바인딩을 쓰지 않는다")을 잃지 않는가 — 새 구조에선 모든 바인딩 쓰기가 대상별 `lockParents` 뒤.
- 뮤테이션(ApmAlertSyncIT 단독): m1 guard의 DEAD 확인 제거 → `deadLaneIsSkipped`·`deadAliasIsSkipped` 실패 ✅ · m3 같은 의도 무시 → `sameIntentInFlightIsNotRequeued` 실패 ✅ · m4 생략 목록에서 ITEM_DISABLED 제거 → `itemDisabledQueuesProvisionOnly` 실패 ✅ · m2 생략 목록에서 HOST_MISSING 제거 → **검출 안 됨 — 동등 변형**(호스트가 없으면 inventory에 트리거도 없어 상태 비교에 도달하지 않는다). 같은 이유로 TRIGGER_MISSING도 방어적 항목이다.
- **검증 못 한 것**: 실제 Zabbix 7.x에서 `expandExpression` 응답 형태(가짜는 저장 문자열 그대로) — 종전 `readTrigger`도 같은 옵션을 썼으므로 형태는 같다고 본다. 대상 1,000+ 규모 실행 시간. `premium.apm.*` 전체 회귀는 병합 직전(결정대로).

## 2차 — 1차 반려 반영 (2026-10-19, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex.md`)
- 🔴1 복귀의 `m:` DEAD RCONF: `enqueueGuarded`에 `extraDedups`·`extraFamilyKeys` 추가 — 복귀가 적재 뒤 취소할 `RCONF:t…`·`RCONF:g…`와 `zt:{trigger}` 가족을 **같은 잠금 범위(가족 → resource → 기존 행 FOR UPDATE)** 에 넣고 guard에 보인다(적재 계획 `plan`은 그대로, 잠금·관찰용 `lockPlan`만 넓힘). DEAD면 SKIPPED_DEAD, 취소는 가드 통과 뒤에만. IT `restoreSeesDeadConfirmOnAliasLane`.
- 🔴2 막힌 PROVISION 은폐: `provisionPending`(PENDING·PROCESSING만) 대신 `ApmZbxCleanupService.pendingProvision` — PROVISION이 live면 `blockedByDead` 여부로 ALREADY_QUEUED/BLOCKED_BY_DEAD를 가른다. IT `blockedProvisionIsReportedAsBlocked`(needsAttention=true).
- 🔴3 새 바인딩 id 누락: need=NONE이어도 바인딩 `zbx_itemid`·`zbx_triggerid` 중 하나가 null이면 비강제 PROVISION(실행기가 찾아 기록 — crash 멱등 경로). 이 경우 상태 대조는 그대로(LEGACY_NAME과 같은 취급). IT `bindingWithoutIdsGetsProvision`.
- 🟡 반영: `syncAll` 진입 무트랜잭션 단언 + 대상 트랜잭션 `REQUIRES_NEW` 고정(IT `rejectsCallInsideTransaction`) · 잠근 뒤 현재 `kind`가 다르면 건너뜀, drift 기대값은 잠근 뒤 현재 `threshold`(IT `driftUsesCurrentThreshold`) · 분모 = (A) + (꺼진 규칙·고아 바인딩)으로 중복 제거 · 15분 = "새 대상 진입 상한" Javadoc 명시 · 삭제 테스트 공백 2건 복원: `ZabbixAlertBridgeTest.provisionItemPayloadContract`·`provisionTriggerPayloadContract`, `ApmZbxProvisionIT.changedIdsRestartGrace`(id 변경 → synced_at 재시작) · 지운 심볼 가리키던 주석 4곳 정리.
- 통과: ApmAlertSyncIT 20 · ZabbixAlertBridgeTest 27 · ApmZbxProvisionIT 19 · ApmZbxCleanupServiceTest 9 · ApmZbxCommandStoreIT 44 · ApmAlertRuleLockOrderIT 1 · ApmZbxWriteSingleEntryTest 8. 회귀 재실행: 아래.
- 회귀 재실행(2차 반영 뒤): ApmAlertRuleMvcTest 8 · WritePathIT 11 · ZabbixPhaseIT 26 · StatusCommandIT 38 · ExecutionIT 30 · EvaluationIT 14 · RaceIT 24 · DeletePathIT 8 · LedgerIT 11 · EventHistoryIT 19 · JobTest 11 — 전부 통과.

## 3차 — 2차 반려 반영 (2026-10-20, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex_r2.md`)
- 🔴1 guard 관찰 범위 잠금: `Plan.withExtraDedups` → `withGuardScope(extraDedups, laneResource)` — guard가 `laneRows`로 읽는 lane의 lifecycle 행 전부를 `lockExisting`의 "lane lifecycle 행" 조건(`pushResources` 자리)으로 **같은 id순 FOR UPDATE 문장**에서 잠근다. 적재 계획 `plan`은 그대로(supersede·edge·realias 판단 불변). IT `guardObservedLaneRowsAreLocked`(guard 안에서 다른 연결이 dedup 밖 같은 lane STAT 행을 `for update nowait` → 실패).
  - 남는 범위(판단 요청): `laneRows.blockedByDead`가 보는 **선행 행**(대개 같은 lane이지만 교차 lane edge 가능)은 잠그지 않는다 — 그 선행이 guard 직후 DEAD가 되면 이번 적재는 막힌 행에 병합되고 다음 회차가 `blockedByDead`로 센다(자동 부활 없음·정보 지연만).
- 🔴2 트랜잭션 전체 잠금 순서: 대상별 트랜잭션에서 **부모 잠금 직후·바인딩 예약/잠금·첫 적재 전에** `zt:{트리거}` 가족을 미리 잡는다(`ApmZbxCleanupService.lockReconcileFamilies` → `Store.lockTriggerFamilies`, advisory xact는 재진입 무해). 후보 = 잠금 전 읽은 바인딩 트리거 id ∪ 일괄 읽기의 정확 트리거 id. 잠근 뒤 바인딩 트리거 id가 후보 밖이면(그 사이 실행기가 새 id 기록) 그 대상은 이번 회차 넘김. (B) `statusOnly`도 같은 순서(부모 → 가족 → 바인딩 → 적재). 순서 = 부모 → 가족 → (예약의 item resource) → 바인딩 행 → resource → 명령 행. IT `familyLockTakenBeforeLaneResource`(다른 트랜잭션이 가족을 쥔 동안 대조가 가족에서 기다리고, 그때 lane resource advisory를 쥐고 있지 않음을 `pg_locks`로 확인 — LEGACY_NAME + 꺼진 트리거로 PROVISION·복귀 연속 적재).
- 🔴3 바인딩 트리거 id null: `ReconcileTarget.triggerIds` = 바인딩 id ∪ 일괄 읽기 정확 id. 해소·복귀 모두 그 id마다 `RCONF:t…` + 태그 `RCONF:g…`를 잠금·관찰(extraDedups)하고 `zt:` 가족 전부를 가족 잠금에 넣는다. 해소 묶음의 RCONF는 첫 id(없으면 태그)로 적재. IT `restoreSeesDeadConfirmByInventoryIdWhenBindingIdMissing`(id 복구 PROVISION만, 복귀 SKIPPED_DEAD, DEAD 그대로).
- 🟡 분모: (규칙 uid, 대상 uid) 합집합 — (A) 대상 + (A)에 없는 바인딩 식별.
- 뮤테이션(각 IT 단독): lane 잠금 제거 → `guardObservedLaneRowsAreLocked` 실패 ✅ · 가족 선잠금 제거 → `familyLockTakenBeforeLaneResource` 실패 ✅ · 일괄 읽기 id 제외 → `restoreSeesDeadConfirmByInventoryIdWhenBindingIdMissing` 실패 ✅.
- 통과: ApmAlertSyncIT **23**. 회귀: 아래.
- 회귀(3차 반영 뒤, 클래스별 단독): ApmAlertSyncIT 23 · ZabbixAlertBridgeTest 27 · ApmZbxProvisionIT 19 · ApmZbxCleanupServiceTest 9 · ApmZbxCommandStoreIT 44 · ApmAlertRuleLockOrderIT 1 · ApmZbxWriteSingleEntryTest 8 · ApmAlertRuleMvcTest 8 · WritePathIT 11 · ZabbixPhaseIT 26 · StatusCommandIT 38 · ExecutionIT 30 · EvaluationIT 14 · RaceIT 24 · DeletePathIT 8 · LedgerIT 11 · EventHistoryIT 19 · JobTest 11 — 전부 통과.

## 4차 — 3차 반려 반영 (2026-10-20, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex_r3.md`)
- 🔴1 고아 복귀·켜기의 "취소 먼저" 역전: `ApmZbxCommandStore.enqueueCancellingConfirms(specs, edges, confirmDedups, familyKeys)` 신설 — **가족(`zt:`) → resource → 기존 행(취소 대상 RCONF 포함, `extraDedups`로 같은 id순 FOR UPDATE)** 잠금 뒤에 취소(`cancelRowsLocked`, 삭제 체인 beforeDelete 제외)하고 이어서 적재한다. `enqueueEnable`·`enqueueRestore`가 이것을 쓰고(종전 `cancelConfirms` 선행 삭제 제거), 대조 `reconcileRestore`도 같은 방식(`enqueueGuarded(..., cancelConfirms)` — guard 통과 뒤 같은 잠금 안에서 취소 → 적재)으로 바꿨다. 이제 RCONF 취소를 하는 모든 경로가 resource → 명령 행 순서다.
  - IT `restoreCancelsConfirmsUnderResourceLock`: 다른 트랜잭션이 lane resource advisory를 쥔 동안 `enqueueRestore`가 그 resource에서 기다리고(정확 hash·objsubid=2·현재 DB로 대기 식별), 그때 다른 연결이 RCONF 행을 `for update nowait`로 잠글 수 있음(=복귀가 행을 쥐지 않음)을 확인. 끝나면 RCONF 취소 + RPUSH·STAT 적재. 뮤테이션(취소를 적재 앞으로 되돌림) → 실패 ✅.
- 🟡 반영: `familyLockTakenBeforeLaneResource`의 대기자 식별을 `zt:{trigger}` 정확 hash·objsubid=2·현재 DB로 좁힘 · `guardObservedLaneRowsAreLocked`는 SQLSTATE `55P03`만 "잠김"으로 판정 · (B)는 (A)에서 이미 센 (규칙, 대상)을 `checked`에 다시 세지 않음 · 신규 예약 순서 표기 정정: 새 바인딩은 INSERT 뒤 `joinItemFamily`(item resource)이고, 기존 바인딩은 명시적 `FOR UPDATE` — 둘 다 가족 선잠금 뒤.
- 통과: ApmAlertSyncIT **24**. 회귀: 아래.
- 확인: main 코드에 `cancel`·`cancelResolveConfirms` 직접 호출자가 더는 없다(grep) — 두 메서드는 테스트·하위 호환용으로만 남는다.
- 회귀(4차 반영 뒤): 18개 클래스 전부 통과(SyncIT 24 · ApmZbxCleanupServiceTest 9 — 켜기·복귀 단위 테스트 2건은 새 호출 모양 `enqueueCancellingConfirms`(취소 dedup·zt 가족 단언) + 별도 `cancelResolveConfirms` 호출 없음으로 갱신).

## 5차 — 4차 반려 반영 (2026-10-20, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex_r4.md`)
- 🔴1 바인딩 ↔ resource 교착(트리거 id 없는 고아 복귀): **전역 순서를 설계 §5대로 "부모 → 바인딩 → 가족 → resource → 명령 행"으로 통일**했다.
  - 5분 평가 `ApmAlertOrphanSweeper`: `clearOrphan`·`markOrphaned` 직후 `bindings.saveAndFlush(binding)` — 바인딩 UPDATE(행 잠금)를 해소·복귀 명령 적재 **전에** 잡는다(종전엔 루프 끝 `saveAll` → 커밋 flush라 resource를 쥔 채 바인딩을 기다렸다). 규칙 없는 바인딩 삭제 분기는 그대로(규칙이 이미 지워져 대조의 `lockParents`가 그 대상을 잡지 않는다).
  - 02:00 대조: 3차의 "가족 먼저"를 되돌려 **바인딩 잠금 → 가족 → 적재**로. 기존 바인딩은 잠금 전 읽기로 찾아 `FOR UPDATE` 후 현재 트리거 id ∪ 일괄 읽기 id로 가족을 한 번에 잡는다(잠근 뒤 계산하므로 "id 바뀜 → 건너뜀" 분기 삭제). **새 바인딩**(예약 INSERT + item resource 참여)은 이번 회차에 상태 대조를 하지 않는다(가족 불필요 — 다음 회차가 잠근 바인딩으로 본다). `lockBinding`은 그 사이 지워졌으면 null → 대상 건너뜀. (B) `statusOnly`도 부모 → 바인딩 → 가족 → 적재.
  - IT `orphanRestoreLocksBindingBeforeResource`: 실제 `ApmAlertOrphanSweeper.sweep` 트랜잭션(트리거 id null 고아 바인딩 복귀)이 lane resource에서 기다리는 동안 다른 연결의 바인딩 `for update nowait`가 55P03(=이미 바인딩을 쥠). 뮤테이션(flush 제거) → 실패 ✅. 3차 IT `familyLockTakenBeforeLaneResource`는 새 순서(바인딩 → 가족)에서도 "가족 대기 중 resource 미보유"로 그대로 유효.
- 🟡 `enqueueGuarded(..., cancelConfirms)`가 취소 대상을 잠금·관찰 범위에 자동으로 합친다.
- 통과: ApmAlertSyncIT **25**. 회귀: 아래.
- 회귀(5차 반영 뒤): 18개 클래스 전부 통과(SyncIT 25).

## 6차 — 5차 반려 반영 (2026-10-20, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex_r5.md`)
- 🔴1 새 바인딩 상태 복구 공백: 새 바인딩(행 없음)이면 **예약(INSERT + item resource) 전에** 일괄 읽기 정확 트리거 id의 가족을 잡고, 예약·잠금 뒤 같은 회차에 상태 대조를 한다(꺼진 기존 트리거 → 복귀 묶음). INSERT 전에는 경합할 바인딩 행이 없어 "바인딩 → 가족" 순서와 충돌하지 않는다 — 같은 키를 동시에 예약하는 5분 판정은 새 바인딩에 가족을 잡지 않는다(트리거 id 없음). 예약이 그 사이 커밋된 **다른 트리거 id**의 기존 행을 돌려준 경합에서만 상태 대조를 다음 회차로 넘긴다(가족을 바인딩 뒤에 늦게 잡지 않기 위해 — 로그).
  - IT `freshBindingWithDisabledTriggerIsRestoredSameCycle`: 바인딩 행 삭제 + 트리거 꺼짐 → repairsQueued 1(id 기록 PROVISION) + statusQueued 1(복귀), 실행 뒤 트리거 켜짐·바인딩 트리거 id 기록. 뮤테이션(새 바인딩 상태 생략) → 실패 ✅.
- 🟡 표현 정정: "전역 순서 통일"은 **같은 대상(바인딩·lane)의 역전 해소**다. 판정 트랜잭션 전체에서는 여러 바인딩을 차례로 처리하므로(앞 바인딩의 명령 잠금 뒤 다음 바인딩 UPDATE) 문자 그대로의 전역 정규화는 아니다 — 서로 다른 대상 사이 순환은 부모(규칙 SHARE·서비스 KEY SHARE)가 호환이라 막지 못하지만, 같은 lane·바인딩 키를 양쪽이 반대로 쥐는 경로는 위 수정으로 없앴다. 규칙 없는 바인딩 삭제 분기(명령 적재 → 바인딩 DELETE)는 예외로 명시(대조가 그 대상을 잡지 않는다).
- 통과: ApmAlertSyncIT **26**. 회귀: 아래.
- 회귀(6차 반영 뒤): 18개 클래스 통과. 단 `ApmStuckRequestLedgerIT.urgentLaneNotBlockedBySaturatedPool`(단위 7)이 간헐 실패 — 공용 풀 포화 전제를 고정 300ms 대기 뒤 한 번만 확인하던 테스트 타이밍 문제(6b 변경과 무관). 최대 3초 폴링으로 바꿨다.

## 7차 — 6차 반려 반영 (2026-10-20, `_archive/features/apm/alerts/review_apm-alert-unit6b-20261019_codex_r6.md`)
**구조 변경 — 대상당 두 개의 짧은 트랜잭션.** 경계 경합을 하나씩 막는 대신 가족 선잠금 자체를 없앴다.
- 트랜잭션 1(객체 복구): 부모 → 예약(INSERT·item resource 또는 기존 행 반환) → 바인딩 FOR UPDATE → PROVISION·drift·NOT_SUPPORTED. **가족(zt:)을 잡지 않는다**(PROVISION은 가족이 필요 없다).
- 트랜잭션 2(상태 대조, 같은 회차): `statusOnly` — 부모 → 바인딩 FOR UPDATE → 가족(현재 트리거 id ∪ 일괄 읽기 id) → 해소·복귀 적재. 새 바인딩도 트랜잭션 1 커밋 뒤라 **기존 행**으로 잡힌다.
- 🔴1(행 없음 판정 뒤 경합 → 가족이 바인딩보다 먼저): 판정 자체가 없어졌다. 어느 경로도 바인딩보다 먼저 가족을 쥐지 않는다(5차·6차의 `fresh`·`preLocked`·`statusLockable` 삭제, `existingBinding` 삭제).
- 🔴2(대기 PROVISION이면 상태 생략): 대기 PROVISION이 있어도 객체 대조(drift·PROVISION 재적재)만 건너뛰고 **상태 대조는 트랜잭션 2에서 한다**(비강제 PROVISION은 기존 status를 보존하므로). DEAD에 막힌 대기면 상태 묶음도 막히므로 넘긴다. IT `pendingProvisionDoesNotSkipStatusRestore`(비강제 PROVISION 대기 + 꺼진 트리거 → alreadyQueued 1·statusQueued 1, hard RPUSH, 실행 뒤 켜짐). 뮤테이션(대기면 상태 생략) → 실패 ✅.
- 두 트랜잭션 사이에 다른 경로가 바인딩을 바꾸면 트랜잭션 2가 잠근 뒤 최신 값으로 판단한다(꺼짐·고아 → 원하는 상태 OFF로 해소, 삭제 → 건너뜀).
- 🟡 `freshBindingWithDisabledTriggerIsRestoredSameCycle`에 hard RPUSH 단언 추가. 3차·4차 순서 IT(`familyLockTakenBeforeLaneResource` — 트랜잭션 2가 가족을 기다리는 동안 lane resource 미보유)는 그대로 통과.
- 통과: ApmAlertSyncIT **27**. `ApmStuckRequestLedgerIT` 4회 연속 통과(폴링 수정 뒤). 회귀: 아래.
- 회귀(7차 반영 뒤): 18개 클래스 전부 통과(SyncIT 27·LedgerIT 11).
