## 판정

**조건부 승인** — 1차 🔴1의 값 유실은 해소됐다. 다만 lifecycle이 DEAD가 되면 fence된 `PUSH_CURRENT`가 자동으로는 영구 대기하므로 단위 8 회복 창구를 합본 필수 조건으로 유지해야 한다.

## 1차 지적 반영 확인

- 🔴1: **해소** — `PENDING PUSH_CURRENT` 삭제 대상을 `supersedeResources`로 제한했고, PROVISION·hard `RESOLVE_PUSH`·`SET_TRIGGER_STATUS`는 삭제 대신 선행 edge를 건다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:315`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:327`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:531`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:741`). soft `RESOLVE_PUSH`·`RESOLVE_CONFIRM`·`DELETE_TRIGGER`·`DELETE_ITEM`만 supersede하도록 분류돼 있다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:532`).
- 🔴1의 STAT 차이: **코드상 성립** — 해소 그룹은 soft `RESOLVE_PUSH → STAT → RCONF`를 한 묶음으로 적재하므로 대기 push가 soft/RCONF에 의해 삭제된다(`src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:214`, `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:220`). 그 밖의 STAT은 push 앞에 fence되고, STAT 완료 뒤 풀린 push는 실행 시 규칙 비활성·고아 상태를 다시 읽어 외부 push 없이 완료한다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxPushCurrentExecutor.java:112`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxPushCurrentExecutor.java:118`). 이 차이에서 즉시 실행되는 새 오발송·유실 경로는 확인되지 않았다.
- 🔴1의 DEAD 처리: **의도대로 유지** — DEAD push는 lifecycle 종류와 관계없이 삭제되고 FK `ON DELETE CASCADE`로 해당 의존도 제거된다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:315`, `src/main/resources/db/migration/V79__apm_zbx_command.sql:92`, `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:834`).
- 🟡1: **합본 전 실측 이관 타당** — 5분 평가는 별도 `now`를 command clock으로 쓰면서 감시기의 공개 snapshot에서는 값만 받고 sample version은 받지 않는다(`src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:425`, `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:477`, `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:378`, `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:555`). 현재 성공 watermark도 없으므로 dev Zabbix 실측 결과에 따라 version 영속화 여부를 결정하는 이관이 적절하다.
- 🟡2: **해소** — urgent lane 거절 시 `wakeNow()`로 공용 drain에 넘기는 코드가 있고(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorker.java:381`), 테스트가 `1 running + 64 queued + 1 rejected`, `claimByIds` 미호출, `claimOne` fallback 완료를 고정한다(`src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorkerTest.java:301`, `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorkerTest.java:321`, `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandWorkerTest.java:330`).
- 🟡3: **런타임 성질 해소, ArchUnit 한계는 기록 유지** — 5초 지연 행렬이 fire·삭제 지연, 열린 트랜잭션 부재와 최종 Zabbix 상태를 함께 단언한다(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:362`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:379`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:389`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:405`).

## 🔴 필수

없음. 단, 아래 단위 8 이관은 합본 전 필수 조건이다.

## 🟡 권장

- supersede 분류 테스트는 soft `RESOLVE_PUSH`와 `RESOLVE_CONFIRM`만 직접 검증한다(`src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:273`). `DELETE_TRIGGER`·`DELETE_ITEM`도 같은 테스트를 parameterized 형태로 고정하는 편이 안전하다.
- STAT 의존은 조합상 성립하지만 테스트가 분리돼 있다. StoreIT는 STAT을 수동 완료한 뒤 push claim만 확인하고(`src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:301`), 실행기 차단은 별도 IT가 비활성·고아를 직접 만든 뒤 검증한다(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:607`). `대기 push → STAT(off) 실행 → push 해제 → Zabbix 마지막 값 불변`을 한 IT로 추가하면 이번 설계 차이를 직접 고정할 수 있다.

## 🟢 참고

- 신규 LedgerIT 3건은 단순 행 삭제가 아니라 실제 Zabbix 마지막 값을 단언한다: 양수 `90_000`(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:201`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:213`), settle `0`(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:218`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:228`), PROCESSING PROVISION 뒤 `0`(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:233`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:247`).
- 3자 교착 IT도 최종 Zabbix 값 `0`을 단언하도록 바뀌었다(`src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:434`, `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:468`).
- 새 fence는 허용 edge가 lifecycle → `PUSH_CURRENT` 방향뿐이고 cycle 검사도 거치므로 순환 edge를 만들지 않는다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandType.java:103`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:768`, `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:789`).
- 요청대로 테스트는 실행하지 않았으며, 코드·diff·문서에 대한 읽기 전용 검수 결과다.

## 이관 목록(단위 6b·8로 넘길 것)

- **단위 8 — 합본 필수:** PROVISION·hard RPUSH·STAT이 실행 중 DEAD가 되면 fence된 push는 자동으로 영구 대기한다. claim은 선행 edge가 하나라도 있으면 제외하고(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:896`), DEAD 전환은 선행 행과 edge를 남긴다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1381`). 따라서 push의 600초 나이 검사는 claim조차 못 해 실행되지 않는다(`src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxPushCurrentExecutor.java:130`). 이 동작은 테스트에도 명시돼 있다(`src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:325`, `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:338`). `retryDead`/운영 회복 시 종속 push 처리와 `blockedBy` 노출을 함께 확정해야 한다.
- **단위 6b:** 대조 경로에 남은 legacy `applyOurDefinition`·`ensureItemRaw` 제거/PROVISION 전환.
- **합본 전 실측:** 새 clock의 `0` 뒤 옛 clock 양수, 같은 초 `-1/0/양수` 순서의 Zabbix `last()`·트리거 상태 확인. 되돌림이 관측되면 sample version과 마지막 적용 version 영속화를 합본 전에 구현해야 한다.
