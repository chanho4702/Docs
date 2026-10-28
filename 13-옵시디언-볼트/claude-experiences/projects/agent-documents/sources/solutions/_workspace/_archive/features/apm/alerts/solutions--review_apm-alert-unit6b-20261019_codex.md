## 판정

**반려** — `reconcileRestore`가 `m:` RCONF의 `DEAD`를 사전 확인하지 못하고 취소 과정에서 삭제할 수 있으며, `blockedByDead` 은폐와 신규 바인딩 PROVISION 누락도 설계 계약을 위반한다.

## 🔴 필수

1. **복귀 경로가 `m:` RCONF의 `DEAD`를 놓친다.**

   `reconcileRestore`는 guard 대상에 hard RPUSH와 STAT만 넘긴다. 따라서 조회 범위는 두 dedup과 `b:` lane뿐이며, `m:` resource에 있는 RCONF는 포함되지 않는다. 그런데 guard 통과 후에는 RCONF dedup으로 다시 찾아 PENDING·DEAD를 삭제한다. 그 결과 일반 `m:` DEAD RCONF는 `SKIPPED_DEAD`가 아니라 삭제되고, `beforeDelete` RCONF라면 삭제되지는 않아도 DEAD를 무시한 채 복귀 묶음이 적재된다.

   근거: 설계 `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:744-751`, `ApmZbxCleanupService.java:448-466`, `ApmZbxCommandStore.java:330`, `ApmZbxCommandStore.java:442-461`, `ApmZbxCommandStore.java:1173-1185`.

   RCONF의 `t:`·`g:` 두 dedup과 필요한 family 잠금을 같은 `enqueueGuarded` 선형화 범위에 포함해야 한다. `m:` RCONF DEAD가 그대로 남고 RPUSH·STAT이 생성되지 않으며 `skippedDead`가 증가하는 IT가 필요하다.

2. **DEAD 선행에 막힌 PENDING PROVISION이 `alreadyQueued`로 은폐된다.**

   `repairAndStatus`는 `provisionPending()`이면 guard를 거치지 않고 즉시 `ALREADY_QUEUED`를 반환한다. 이 조회는 PENDING/PROCESSING 여부만 보므로, DEAD RPUSH 등에 막힌 PROVISION도 정상 진행 중으로 취급된다. 해당 상태는 영구 정지할 수 있는데 `needsAttention()` 경고에도 잡히지 않는다.

   근거: 설계 `...apm-alert-unit5-6-design-20261011.md:746-749`, `ApmAlertSyncService.java:292-296`, `ApmZbxCommandStore.java:1189-1193`, `ApmAlertSyncService.java:145-147`.

3. **신규 바인딩인데 Zabbix 객체가 이미 있으면 비강제 PROVISION이 누락된다.**

   설계는 `(A)`에서 바인딩이 없으면 생성 후 비강제 PROVISION을 요구한다. 현재는 바인딩을 예약한 뒤 외부 inventory만으로 `provisionNeed`를 계산한다. 정확한 item·trigger가 이미 있으면 `NONE`이 되어 PROVISION을 적재하지 않으므로 새 바인딩의 `zbx_itemid`·`zbx_triggerid`가 계속 null로 남는다. 5분 평가가 후속 복구할 가능성은 있지만, 6b 자체는 설계를 이행하지 못한다.

   근거: 설계 `...apm-alert-unit5-6-design-20261011.md:682-683`, `ApmAlertSyncService.java:287-302`, `ZabbixAlertBridge.java:1325-1349`.

## 🟡 권장

- `TransactionTemplate`이 기본 `REQUIRED`다. 현재 유일한 스케줄러 호출은 무트랜잭션이라 정상이나, 향후 외부 트랜잭션에서 호출되면 phase 2가 이미 트랜잭션 안이 되어 `requireNoTransaction`에서 전 대상 실패로 처리된다. `syncAll` 진입 시 무트랜잭션 단언과 대상 트랜잭션 정책을 명시적으로 고정하는 편이 안전하다. `ApmAlertSyncService.java:104-115`, `ZabbixAlertBridge.java:1270-1272`.

- phase 1의 규칙 snapshot 뒤 현재 행에서는 `enabled`만 재검증한다. 현재 `kind`·`threshold`가 바뀌었어도 옛 `t.rule()`로 `reserveBinding`, `provisionNeed`, drift 비교를 수행해 최대 하루 동안 거짓 drift나 옛 identity 명령을 만들 수 있다. 정적 추론이다. `ApmAlertSyncService.java:283-313`, `ApmAlertEventStore.java:143-151`.

- `total = repairs.size() + identities.size()`는 활성 기존 바인딩을 양쪽에서 중복 계산한다. 정상 처리에서는 `handled`로 한 번만 세지만 inventory 실패·HOST_FOREIGN·truncated 로그의 분모는 부풀려진다. `ApmAlertSyncService.java:173-186`, `ApmAlertSyncService.java:229-248`.

- 15분은 엄격한 실행 상한이 아니라 대상 진입 전 deadline 검사다. inventory RPC나 대상 하나가 오래 걸리면 15분을 넘길 수 있다. `ApmAlertSyncService.java:169-192`, `ApmAlertSyncService.java:222-245`.

- 삭제된 `ZabbixAlertBridgeTest` 중 다른 테스트가 명시적으로 덮지 않는 성질은 다음 두 가지다.

  - item의 `type=2`, `value_type=0`, `units`, `delay/interfaceid` 부재와 trigger의 `manual_close=1`·태그 전체라는 생성 payload 계약. 코드는 남았지만 현재 테스트 전체 정적 검색상 직접 단언이 없다. `ZabbixAlertBridge.java:941-951`, `ZabbixAlertBridge.java:1074-1081`.
  - item/trigger ID가 기존 값에서 바뀌었을 때 `synced_at`을 재시작하는 성질. 구현은 남았으나 변경-ID 전용 테스트가 없다. `ApmZbxProvisionExecutor.java:266-271`.

- 삭제된 심볼을 가리키는 주석·Javadoc은 정리해야 한다. 특히 해석 불가능한 `@link #applyOurDefinition`이 남아 있다. `ZabbixAlertBridge.java:83`, `ZabbixAlertBridge.java:271`, `ApmAlertRuleLockOrderIT.java:47`, `ApmZbxWriteSingleEntryTest.java:27-38`.

## 🟢 확인된 것

- DEAD 확인을 `enqueueGuarded` 내부로 옮긴 판단 자체는 맞다. 실제 순서가 family advisory → canonical lane 결정 → resource advisory → 기존 행 `FOR UPDATE` → guard이므로, 대조가 resource를 먼저 잡아 family→resource 전역 순서를 뒤집는 문제가 없다. `ApmZbxCommandStore.java:320-330`.

- guard가 받은 dedup 및 `b:` lane 행은 적재와 같은 잠금 범위에서 판정된다. `realias`는 guard 통과 후 수행되므로, 이번 specs와 같은 dedup의 기존 `m:` DEAD는 먼저 발견된다. RCONF를 specs에 포함하지 않은 복귀 경로만 예외다. `ApmZbxCommandStore.java:328-343`, `ApmZbxCommandStore.java:595-620`, `ApmZbxCommandStore.java:1173-1185`.

- `HOST_MISSING`·`ITEM_MISSING`·`TRIGGER_MISSING`·`ITEM_DISABLED`의 같은 회차 상태 묶음 생략과 HOST_FOREIGN 전체 조기 종료는 구현됐다. `ApmAlertSyncService.java:191-195`, `ApmAlertSyncService.java:334-339`; 테스트 `ApmAlertSyncIT.java:93-119`, `ApmAlertSyncIT.java:289-297`.

- 현재 호출 구조에서는 `reserveBinding`이 대상 트랜잭션에 참여하고, 반환 엔티티는 managed 상태다. 바인딩을 `FOR UPDATE`한 뒤 `em.refresh()`로 최신 상태를 읽고 `save`하는 흐름은 유효하다. 신규 INSERT는 명시적 `FOR UPDATE` 전에도 해당 행 잠금을 이미 보유한다. `ZabbixAlertBridge.java:289-310`, `ApmAlertSyncService.java:283-288`, `ApmAlertSyncService.java:386-389`.

- 대상별 실패 격리, 전체 inventory 실패 집계, HOST_FOREIGN 경고, 커밋 완료 후 worker wake는 구조상 맞다. `ApmAlertSyncService.java:191-195`, `ApmAlertSyncService.java:221-257`, `ApmAlertSyncService.java:270-274`, `ApmAlertSyncJob.java:59-65`.

- 삭제한 브리지 14심볼의 실제 production 호출처는 정적 전체 검색상 0이다. 유지해야 하는 `readTrigger`와 `alignLegacyDescription`은 보존됐고 각각 실제 호출처가 있다. `ApmAlertService.java:995`, `ZabbixAlertBridge.java:482`, `ZabbixAlertBridge.java:1039`.

- RaceIT 교체는 새 구조의 성질을 잃지 않는다. 새 테스트는 phase 1 목록 뒤 생성된 규칙이 이번 회차에서 빠지고 다음 회차에 포함됨을 직접 검증한다. 삭제된 “전역 선잠금 뒤 phantom” 성질은 전역 선잠금 자체가 제거되어 더 이상 유효하지 않으며, 대상별 disable 경쟁은 별도 IT가 덮는다. `ApmAlertEvaluationRaceIT.java:328-353`, `ApmAlertSyncIT.java:299-309`.

- 요청에 따라 테스트는 실행하지 않았으며, 위 판정은 코드·diff·설계의 정적 검수 결과다.

## 중점 확인 1~6 답

1. **부분 적합.** `enqueueGuarded`가 받은 dedup/lane은 동일 잠금 범위라 TOCTOU가 없고 `realias`도 guard 뒤다. 다만 복귀 경로가 RCONF dedup을 입력하지 않아 `m:` RCONF는 이 보장에서 빠진다. `ApmZbxCommandStore.java:320-343`, `ApmZbxCleanupService.java:455-466`.

2. **정상 RCONF에는 순서가 타당하지만 전체적으로는 불합격.** enqueue와 cancel이 같은 트랜잭션이라 원자적이고, PROCESSING은 삭제하지 않고 cancelled+generation으로 남긴다. 삭제 체인의 `beforeDelete` RCONF도 취소 대상에서 제외한다. 일반 RCONF 삭제 시 `STAT → RCONF` edge가 CASCADE되는 것은 취소된 후속 자체를 제거하는 동작이라 문제없다. 다만 guard가 못 본 `m:` DEAD까지 삭제할 수 있는 결함은 필수 수정 사항이다. `ApmZbxCommandStore.java:399-449`, `V79__apm_zbx_command.sql:92-98`.

3. **skip 자체는 종전 규칙대로다.** PENDING/PROCESSING PROVISION이면 drift·NOT_SUPPORTED·status를 모두 건너뛴다. 이후 DEAD가 되어 다음 회차에 repair/status 적재가 필요하면 guard에서 `skippedDead`가 되지만, 외부 상태가 이미 수렴해 적재 시도가 없으면 DEAD가 있어도 `skippedDead`는 증가하지 않는다. 더 심각하게 DEAD 선행에 막힌 PENDING은 계속 `alreadyQueued`로만 집계된다. `ApmAlertSyncService.java:292-302`, `ApmZbxCommandStore.java:1189-1193`.

4. **설계 전제 아래 맞다.** B에서 트리거가 없으면 활성 대상은 A가 PROVISION하고, 꺼짐·고아 대상은 끌 객체가 없으므로 no-op이다. 다만 “활성·비고아 기존 바인딩이면 반드시 `targetsOf`의 A에 포함된다”는 불변식을 이 코드가 검증하지는 않는다. 그 불변식이 깨지면 B는 missing trigger를 복구하지 않는다. `ApmAlertSyncService.java:349-363`.

5. **현재 호출에서는 맞다.** `TransactionTemplate` 내부에서 repository가 반환한 managed 엔티티를 JDBC `FOR UPDATE` 뒤 `em.refresh()`하고 `save`한다. `reserveBinding`도 같은 트랜잭션에 참여한다. 단, 기본 `REQUIRED`로 경계를 강제하지 않는 문제는 권장 사항과 같다. `ApmAlertSyncService.java:97-115`, `ApmAlertSyncService.java:283-288`, `ApmAlertSyncService.java:386-389`.

6. **의도대로 직접 의존만 막는다.** concrete executor는 `areAssignableTo(ApmZbxCommandExecutor)`에 걸리고 worker는 FQN으로 막는다. cleanup 서비스 의존은 허용되며 현재 cleanup은 적재만 한다. wrapper를 통한 간접 호출까지 증명하는 규칙은 아니다. `ApmZbxWriteSingleEntryTest.java:104-120`, 설계 `...apm-alert-unit5-6-design-20261011.md:607`.

## 이관(단위 8·6c)

- **단위 8:** DEAD 복구는 운영자 확인·명시적 retry 경로로만 남겨야 한다. 삭제한 `retryPendingTriggerStatus` 같은 자동 재시도 브리지를 되살릴 이유는 없다. 다만 이번 RCONF DEAD 삭제 결함과 `blockedByDead` 은폐는 단위 8로 미루면 안 된다.

- **단위 6c:** 계획된 cursor/페이지 처리, constant-time 비교, `57014`, 빈 테이블 HWM, 1,000+ inventory 규모 대응은 그대로 이관 가능하다. 15분을 실제 wall-clock 상한으로 만들지, 현재처럼 “새 대상 진입 중단”으로 정의할지도 6c에서 명시해야 한다.

- **6b에 잔류:** RCONF 포함 원자적 preflight, blocked PROVISION 집계, 신규 바인딩 비강제 PROVISION, 그 세 경로의 IT와 삭제 테스트 공백은 6b 승인 전에 해결해야 한다.
