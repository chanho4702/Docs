## 판정

**반려**

부모 잠금 매트릭스와 Outcome 전파는 의도대로 보완됐지만, 5분 평가 경로에 잠금 순서 역전과 규칙 수정 경쟁 시 stale snapshot 발화가 남아 있습니다.

## 🔴 필수

### 1. 5분 평가기의 `binding → 부모` 순서로 교착 가능

삭제 경로는 `rule/service → binding → event` 순서입니다.

- [ApmAlertService.java:668](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:668>)
- [ApmAlertService.java:681](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:681>)

반면 5분 평가기는 부모 잠금 전에 바인딩을 변경할 수 있습니다.

- `retryPendingTriggerStatus()`가 바인딩을 변경·저장: [ApmAlertEvaluationService.java:292](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:292>), [ZabbixAlertBridge.java:1286](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1286>)
- `ensureProvisioned()`도 `openIfAbsent()`보다 먼저 수행: [ApmAlertEvaluationService.java:337](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:337>), [ApmAlertEvaluationService.java:395](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:395>)

바인딩이 dirty이면 뒤이은 JPA 조회에서 flush되어 다음 교착이 가능합니다.

1. 평가기: binding 행 잠금
2. 삭제/수정: rule `FOR UPDATE`
3. 삭제/수정: binding 잠금 대기
4. 평가기: rule `FOR SHARE` 대기
5. PostgreSQL deadlock 감지 후 한 트랜잭션 중단

현재 경쟁 IT는 `openIfAbsent()`를 직접 호출하므로 이 운영 순서를 검증하지 않습니다. [ApmAlertEventHistoryIT.java:611](</C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventHistoryIT.java:611>)

5분 경로도 부모 잠금을 바인딩 쓰기보다 먼저 획득하도록 재배치하고, 실제 `evaluateAll()`과 삭제/끄기를 경쟁시키는 PostgreSQL IT가 필요합니다.

### 2. 규칙 수정이 먼저 커밋돼도 이전 임계로 이벤트를 열 수 있음

평가기의 `rule`과 snapshot은 부모 잠금 전에 읽힙니다. 이후 화면의 임계 수정이 `FOR UPDATE`를 먼저 획득해 커밋하면 평가기는 기다렸다가 `enabled=true`만 재확인하고, 이전 `threshold/window` snapshot으로 이벤트를 삽입합니다.

- 현재 재확인 값은 `enabled`뿐: [ApmAlertEventStore.java:100](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStore.java:100>)
- 실제 INSERT 값은 잠금 전 snapshot: [ApmAlertEventStore.java:112](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStore.java:112>)

예를 들어 임계가 5→10으로 수정되는 동안 값 7을 구 임계로 평가하면, 수정 커밋 후에도 로컬 이벤트는 임계 5로 열리지만 Zabbix의 새 임계 10은 발화하지 않아 이력과 외부 상태가 갈립니다.

잠금 후 현재 `threshold/window/kind`가 snapshot과 다르면 `SKIPPED` 처리하여 다음 회차에 재평가하거나, 잠금 아래에서 현재 규칙으로 판정·snapshot을 다시 만들어야 합니다. 임계 수정 선행/평가 선행 양방향 경쟁 IT도 필요합니다.

## 🟡 권장

- `evaluateAll()` 전체가 한 트랜잭션이고, 한 번 획득한 부모 잠금은 후속 Zabbix push·event-id 보강·cleanup까지 유지됩니다. [ApmAlertEvaluationService.java:286](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:286>), [ApmAlertEvaluationService.java:429](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:429>) 따라서 해당 규칙의 수정·끄기·삭제 화면 요청은 느린 평가 배치 전체를 기다릴 수 있습니다. 대상별 짧은 트랜잭션 또는 외부 I/O와 DB 잠금 구간 분리를 권장합니다.

## 🟢 참고

- `FOR KEY SHARE`는 서비스 삭제의 명시적 `FOR UPDATE`와 충돌하고, 일반 `last_seen_at` UPDATE의 `FOR NO KEY UPDATE`와는 충돌하지 않습니다. 규칙의 `FOR SHARE`도 끄기·삭제의 `FOR UPDATE`를 막습니다.
- `INSERT … SELECT … WHERE EXISTS (... FOR SHARE)`와 V74 부분 인덱스를 지정한 `ON CONFLICT (rule_id, service_id) WHERE resolved_at IS NULL` arbiter는 정확합니다.
- 직접 Store를 호출하는 경쟁 IT는 삭제 선행 시 실제 대기 후 `SKIPPED`, 열기 선행 시 삭제 대기 후 해소를 검증합니다. 다만 위 운영 경로의 순서 역전은 포함하지 않습니다.
- `Outcome`에 따른 5분 push 생략, 1초 감시기의 `alarmed=false` 유지·다음 tick 재시도는 반영됐습니다.
- SLO snapshot loud failure/CHECK와 `recent()`의 nullable `value` 처리는 적절합니다.
- 테스트는 읽기 전용 조건 때문에 재실행하지 않았으며, `2,463 passed`는 요청서 기록으로만 확인했습니다.
