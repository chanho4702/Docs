## 판정

**조건부 진행**

방향은 타당하지만, 현재 설계 그대로 구현하면 안 됩니다.

핵심 판단은 다음처럼 좁혀야 합니다.

> 반복 평가되는 `history.push` 값은 Zabbix의 **최신 상태 projection**이므로 전이별 outbox가 없어도 된다.  
> 그러나 대상 이탈·비활성화·삭제처럼 다음 평가에서 재구성할 수 없는 작업은 **durable command**로 남겨야 한다.

현재 설계는 일반 값 push와 `-1 → Problem 해소 → trigger disable`, `trigger → item 삭제`를 같은 “다음 회차 재동기화”로 묶었습니다. 후자는 실제 코드에서도 이미 `apm_zbx_cleanup`이 필요한 비가역 수명주기 작업입니다.

또한 현재 코드의 공식 설명은 “Zabbix Problem이 배달이며 Slack·Teams도 Zabbix 미디어”라고 명시합니다. [ApmAlertRule.java:20](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRule.java:20), [ApmAlertEvaluationService.java:76](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:76) 설계가 Zabbix를 best-effort 상태 projection으로 강등하는 것인지, 기존 Zabbix 미디어 알림도 전이 전달을 보장해야 하는지 계약에 명시해야 합니다.

검수 기준은 `moveseye-be-spring/master`, 커밋 `b61d33e`이며 작업 트리는 깨끗했습니다.

## 🔴 필수

### 1. Zabbix 작업을 두 종류로 분리해야 함

일반 측정값은 값이 계속 관측되는 동안 매 평가에서 다시 push하므로 최신 값 재동기화가 가능합니다. [ApmAlertEvaluationService.java:353](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:353), [ApmAlertEvaluationService.java:367](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:367)

반면 다음은 durable해야 합니다.

- `RESOLVE`: `-1` push 또는 `resolveOpenProblems`
- 원하는 trigger 상태 변경
- `TRIGGER` 삭제
- `ITEM` 삭제

근거:

- 값이 없으면 다음 회차에 push 자체를 하지 않습니다. [ApmAlertEvaluationService.java:361](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:361)
- 이미 고아로 표시한 바인딩은 다음 sweep에서 건너뜁니다. [ApmAlertOrphanSweeper.java:205](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:205)
- `-1`은 trigger를 내리기 전에 들어가야 합니다. [ApmAlertOrphanSweeper.java:226](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:226)
- `resolveOpenProblems`는 닫기 요청 직후에도 완료로 보지 않고 다음 회차 확인을 요구합니다. [ZabbixAlertBridge.java:979](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:979), [ZabbixAlertBridge.java:995](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:995)
- 실제 코드도 이를 위해 `RESOLVE` 정리 큐를 사용합니다. [ApmZbxCleanupService.java:139](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:139)

구체 수정안:

- 삭제·비활성·고아 상태를 커밋하는 **같은 트랜잭션에서 먼저** durable command를 적습니다.
- 커밋 뒤 worker가 명령을 실행하고 성공한 명령만 제거합니다.
- “외부 호출 실패 후 큐 적재”는 부족합니다. 커밋 후 호출 전 crash면 아무 기록도 남지 않습니다.
- trigger 상태도 외부 호출 실패 후에만 `TRIGGER_STATUS_PENDING`을 표시하지 말고, 상태 변경을 결정한 트랜잭션에서 pending을 먼저 기록해야 합니다.
- 명령은 exactly-once가 아니라 **at-least-once + 멱등 실행**으로 정의합니다.

### 2. 삭제 큐의 trigger → item 순서를 DB가 강제해야 함

현재 큐는 trigger를 먼저 INSERT하지만 조회 정렬은 `next_attempt_at` 하나뿐입니다. 같은 시각이면 처리 순서가 보장되지 않습니다. [ApmZbxCleanupRepository.java:23](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmZbxCleanupRepository.java:23)

더구나 ITEM 재시도는 바인딩이 이미 지워졌다면 item을 삭제합니다. trigger 삭제가 실패했어도 item이 먼저 삭제될 수 있습니다. [ZabbixAlertBridge.java:1441](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1441)

구체 수정안:

- 정리 행에 `phase` 또는 `depends_on`을 추가합니다.
- 최소한 `ORDER BY next_attempt_at, kind_priority, id`를 사용하고, 동일 삭제 그룹의 ITEM은 TRIGGER 명령이 모두 완료되기 전 claim하지 않게 합니다.
- `retryDue()`의 Zabbix 호출도 현재 하나의 `@Transactional` 안에 있습니다. [ApmZbxCleanupService.java:219](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:219) claim/결과 기록만 짧은 트랜잭션으로 분리해야 APC-05 목표가 성립합니다.

### 3. V76의 `scope`와 스냅샷 구성이 부족함

`service_id IS NULL → COLLECTOR`는 실제 코드와 맞지 않습니다. `ARCHIVE_HOLD`도 `service_id=NULL`인 시스템 축입니다. [ApmAlertKind.java:98](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertKind.java:98), [ApmAlertKind.java:182](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertKind.java:182) `SLO_BURN`은 서비스 ID가 있지만 실제 대상 UID는 SLO입니다. [ApmAlertRule.java:97](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRule.java:97)

구체 수정안:

- `scope`는 적어도 `SERVICE | SLO | SYSTEM`으로 정의합니다.
- `DEFAULT 'SERVICE'`를 남기지 말고, nullable 추가 → 백필 → `NOT NULL` 전환으로 구현합니다. 기본값이 있으면 신규 INSERT 누락이 조용히 SERVICE로 오분류됩니다.
- 다음 CHECK를 추가합니다.
  - `scope IN ('SERVICE','SLO','SYSTEM')`
  - 열린 행은 `rule_id IS NOT NULL`
  - 열린 SERVICE/SLO 행은 `service_id IS NOT NULL`
  - SERVICE/SLO 스냅샷은 `service_uid IS NOT NULL`
- `window_min`을 스냅샷에 추가해야 합니다. 오류율·p95·spike 통지에서 “어느 창의 임계였는지”가 빠지면 이력만으로 메시지를 재구성할 수 없습니다.
- `service_name`은 원본 이름보다 당시 `resolveDisplayName()` 값을 보존하는 의미를 명확히 하십시오.
- 환경 필터를 보존하려면 `service_env_norm`도 필요합니다. 현재 최근 알람의 env 필터는 `s.env_norm`입니다. [ApmAlertQueryStore.java:89](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:89)
- SLO 삭제 이력까지 온전히 표시하려면 `slo_uid`, `slo_name`도 권장 수준이 아니라 사실상 필요합니다.

### 4. V76 적용 후 nullable 전파를 전부 고쳐야 함

현재 엔티티는 `rule_id nullable=false`입니다. [ApmAlertEvent.java:58](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEvent.java:58)

다음 코드도 삭제된 규칙을 전제하지 않습니다.

- 이벤트 페이지가 null `ruleId`를 그대로 ID 집합에 넣습니다. [ApmAlertService.java:298](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:298)
- Zabbix eventid 백필도 null 규칙을 대상으로 삼을 수 있습니다. [ApmAlertEvaluationService.java:450](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:450), [ApmAlertEvaluationService.java:503](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:503)
- 서비스 필터는 현재 존재하는 서비스 ID를 먼저 찾아야 하므로 삭제된 `service_uid`로 이력을 조회할 수 없습니다. [ApmAlertService.java:292](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:292)

수정안:

- DTO 조립은 현재 행이 없으면 스냅샷을 사용합니다.
- `findAllById` 대상에서 null을 제거합니다.
- Zabbix backfill은 `rule_id IS NOT NULL`인 행만 대상으로 합니다.
- 서비스 필터는 현재 `service_id`뿐 아니라 snapshot `service_uid`로도 검색 가능하게 해야 합니다.
- `recent`의 규칙 조인은 LEFT JOIN으로 바꾸고 `coalesce(r.kind, e.rule_kind)`를 사용합니다. 현재는 INNER JOIN입니다. [ApmAlertQueryStore.java:80](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:80)

### 5. V77 claim에 `PROCESSING` lease가 필요함

설계의 “`FOR UPDATE SKIP LOCKED` claim → 트랜잭션 밖 deliver”만으로는 claim이 유지되지 않습니다. 트랜잭션을 닫는 순간 다른 worker가 같은 PENDING 행을 다시 집을 수 있습니다.

구체 수정안:

- 상태에 `PROCESSING`을 추가합니다.
- `claim_token`, `claimed_at`, `lease_until`을 추가합니다.
- 짧은 트랜잭션에서 `PENDING → PROCESSING` UPDATE 후 반환합니다.
- 외부 전송 뒤 claim token을 조건으로 SENT/재시도/DEAD를 기록합니다.
- 만료된 PROCESSING은 다시 claim할 수 있어야 합니다.
- `AlertNotification`에 outbox ID 또는 `(event_id, transition, channel)` 멱등 키를 전달합니다.
- 외부 전송 성공 후 SENT 기록 전 crash는 중복 전송 가능하므로 보장은 **at-least-once**입니다. 이메일처럼 외부 멱등 기능이 없는 채널은 중복 가능성을 계약에 명시해야 합니다.

### 6. FIRED/RESOLVED 순서를 채널별로 보장해야 함

두 행을 다중 worker가 동시에 claim하면 RESOLVED가 먼저 전달될 수 있습니다.

수정안:

- 같은 `(event_id, channel)`에서는 FIRED가 terminal 상태가 되기 전 RESOLVED를 claim하지 않습니다.
- FIRED가 DEAD면 RESOLVED를 보낼지 SKIPPED/DEAD로 종결할지 정책을 정합니다. 기본 권장은 RESOLVED도 SKIPPED입니다.
- FIRED/RESOLVED outbox는 실제 상태 전이 때만 만듭니다. 반복 평가나 이미 해소된 행 재저장은 outbox를 만들면 안 됩니다.

### 7. “등록 채널 0개면 행 없음”에는 활성화 정책이 반드시 필요함

현재 설계라면 채널 설치 전 열린 이벤트가 설치 후 해소될 때 RESOLVED만 생성될 수 있습니다. 이는 실제 문제입니다.

권장 정책:

1. 채널에 `activated_at`을 기록합니다.
2. 채널 최초 활성화 트랜잭션에서 당시 열린 이벤트 전부에 bootstrap FIRED를 생성합니다.
3. 그 이후 전이만 정상 적재합니다.
4. bootstrap과 동시 해소가 엇갈리지 않도록 advisory lock 또는 동일 활성화 트랜잭션 경계를 둡니다.

과거 열린 알람을 알리고 싶지 않다면 반대로 “활성화 전 FIRED가 없는 이벤트의 RESOLVED는 생성하지 않는다”를 강제해야 합니다. 어느 쪽이든 현재 설계처럼 암묵적으로 두면 안 됩니다.

### 8. 평가 분할에서 바인딩 desired state를 먼저 커밋해야 함

고아 처리에서 `orphaned_at`을 먼저 커밋하고 외부 호출 전에 crash하면, 다음 sweep은 이미 고아라고 보고 건너뜁니다. [ApmAlertOrphanSweeper.java:205](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:205)

복귀도 마찬가지입니다. `orphaned_at`만 지운 뒤 trigger enable 전 crash면 다음 회차에는 정상 바인딩으로 보여 재활성화를 시도하지 않습니다.

수정안:

- 판정 트랜잭션에서 `desired_trigger_enabled` 또는 명시적 `trigger_sync_pending`을 기록합니다.
- worker는 성공할 때만 pending을 지웁니다.
- worker에는 JPA entity를 넘기지 말고 `bindingId`, `ruleId`, `scopeUid`, 값 등 immutable scalar command를 넘깁니다.
- 외부 성공 후 상태 기록 전 crash는 멱등 재실행으로 복구합니다.

### 9. 감시기 명령 적용 결과를 메모리 상태에 반영하는 규칙이 더 필요함

설계에는 FIRE 실패 시 `alarmed`를 세우지 않는다는 규칙만 있습니다. 다음도 정의해야 합니다.

- `OPEN_ROW` 실패: `Tracked`에 넣지 않거나 pending 상태로 두고 다음 tick 재시도
- `CLOSE_ROW` 실패: 메모리에서 제거하지 않음
- `SAVE` 실패: dirty를 지우지 않음
- `FIRE` 실패: `alarmed.open=false` 유지
- `SETTLE` 실패: `alarmed.open=true` 유지
- DB 성공 후 메모리 ack 전 process crash: 재기동 hydrate로 복구
- 오래된 executor 결과가 최신 상태를 덮지 않도록 서비스별 generation/version 검사

현재 monitor는 lock 안에서 이 작업을 모두 수행합니다. [ApmStuckRequestMonitor.java:165](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:165), [ApmStuckRequestMonitor.java:216](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:216), [ApmStuckRequestMonitor.java:281](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:281)

`latest value only` coalescing은 Zabbix를 current-state projection으로 정의할 때만 안전합니다. 양수 FIRE가 worker 실행 전에 0으로 덮이면 Zabbix는 그 장애를 한 번도 보지 못합니다. 기존 Zabbix 미디어의 전이 알림을 유지해야 한다면 positive edge와 recovery edge를 각각 최소 한 번 시도하는 edge-aware queue가 필요합니다.

### 10. 삭제 경로는 “항상 선적재 후 커밋 뒤 실행”으로 통일해야 함

화면 삭제는 현재 정리 큐를 사용하지 않습니다. [ApmAlertService.java:571](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:571) 반면 SLO 내부 삭제 경로는 실패 시 큐에 넣습니다. [ApmAlertService.java:818](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:818)

구체 수정안:

- 화면 삭제도 공용 `deleteRule` 하나를 사용합니다.
- 규칙/서비스/SLO 삭제 시 cleanup command를 **실패했을 때가 아니라 삭제 트랜잭션 안에서 항상 먼저** 적재합니다.
- 커밋 뒤 즉시 worker를 깨우고, 성공 시 큐 행을 제거합니다.
- 서비스 삭제는 `service_id`의 열린 이벤트를 먼저 `SERVICE_DELETED`로 해소하고 RESOLVED outbox를 만든 뒤 서비스 행을 삭제합니다. 현재는 열린 이벤트를 닫지 않습니다. [ApmAlertService.java:604](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:604), [ApmServiceQueryService.java:544](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java:544)

## 🟡 권장

- `resolve()`를 중앙 전이 서비스로 통일해 `resolved_at`, `resolve_reason`, RESOLVED outbox가 항상 함께 변경되게 하십시오. 현재는 평가기·규칙 서비스·고아 sweeper·감시기 ledger에 해소 코드가 흩어져 있습니다.
- V76 백필 뒤 `rule_uid`, `rule_kind`, `threshold`, `threshold_unit`, `window_min`의 null 건수를 검사한 후 NOT NULL을 적용하십시오.
- FK를 동적으로 찾는 DO 블록은 `conrelid`, `contype='f'`, 대상 열 `attnum`까지 제한해야 합니다. 테이블의 다른 FK를 함께 제거하면 안 됩니다.
- `SKIPPED`는 영구 비활성 정책일 때만 사용하십시오. 일시 정지라면 PENDING 유지가 더 자연스럽습니다. DEAD와 SKIPPED에는 운영자 재처리 API/관리 명령이 필요합니다.
- 평가 결과를 `DecisionResult`와 `ZabbixSyncResult`로 분리하십시오. 판정 커밋 뒤 Zabbix 단계가 실패해도 판정은 이미 성공한 사실을 실행 이력에 표시해야 합니다.
- process crash 시 scheduler lease가 최대 30분 남습니다. [SchedulerLeaseService.java:23](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/scheduler/SchedulerLeaseService.java:23), [SchedulerLeaseService.java:40](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/scheduler/SchedulerLeaseService.java:40) 따라서 “다음 5분에 복구”가 아니라 crash 시 최대 30분 후 복구입니다. 평가 잡 전용 TTL/heartbeat 또는 독립 durable worker를 검토하십시오.
- executor는 bounded coalescing map, 단일 drain worker, `@PreDestroy`의 제한시간 drain, pending 수·oldest age metric을 가져야 합니다. abrupt kill의 손실은 durable 상태로 재구성 가능해야 합니다.
- `apm_stuck_request` 명령 재시도에도 멱등성을 검토하십시오. 이벤트 열기는 V74로 멱등이지만 요청 장부 OPEN에는 부분 UNIQUE가 없습니다. process 내 재시도와 재기동 hydrate가 중복 행을 만들지 않는 테스트가 필요합니다.

## 🟢 참고

- `rule_id`를 nullable로 바꾸고 열린 행만 non-null로 강제하는 방향은 맞습니다.
- V74는 열린 행만 인덱싱하므로 정상적으로 먼저 해소된 삭제 이력의 `rule_id/service_id`가 NULL이 되어도 UNIQUE와 충돌하지 않습니다. [V74__apm_alert_event_open_unique.sql:48](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V74__apm_alert_event_open_unique.sql:48)
- 채널 SPI, 이벤트 전이와 같은 트랜잭션에서 outbox INSERT, `(event_id, transition, channel)` UNIQUE 방향은 적절합니다.
- `apm_alert_event` 자체가 FIRED/RESOLVED 시각을 보유하므로 최초 채널 활성화 bootstrap의 원천 데이터로 사용할 수 있습니다.
- 읽기 전용 검수로 수행했으며 파일은 수정하지 않았습니다.

## 질문 1~7 답

### 1. “Zabbix 전이 outbox 불필요” 판단

**일반 값 push에 한해서 맞고, 전체 Zabbix 작업에 대해서는 틀립니다.**

- active + measurable 상태의 최신 값은 다음 평가에서 재계산·재push할 수 있습니다.
- 비활성화·고아·삭제 뒤에는 다음 평가 대상에서 빠지므로 최신 값 재동기화가 존재하지 않습니다.
- `-1`, Problem 개별 해소, trigger 상태, 객체 삭제는 durable command가 필요합니다.
- 기존 Zabbix 미디어가 전이 알림 채널로 계속 인정된다면, 짧은 FIRED→RESOLVED가 push 전에 끝나는 경우까지 보존하도록 Zabbix 전이 queue가 필요합니다.
- Zabbix를 best-effort current-state projection으로 재정의한다면 일반 값 전이 outbox는 생략할 수 있습니다.

### 2. V76

기본 방향은 맞지만 다음 수정이 필수입니다.

- `scope`: `SERVICE|SLO|SYSTEM`
- `DEFAULT SERVICE` 제거
- 열린 SERVICE/SLO 행의 `service_id` 필수 CHECK
- `window_min`, 정규화 env, 필요 시 SLO snapshot 추가
- nullable `rule_id`에 맞춘 엔티티·조회·백필 코드 전수 수정
- 삭제된 `service_uid` 필터 지원
- 백필 완료 검증 후 NOT NULL 적용

V74와의 상호작용은 먼저 닫는 규칙과 CHECK가 지켜지면 안전합니다.

### 3. V77 통지 outbox

같은 트랜잭션 INSERT와 멱등 키는 맞습니다. 다음이 빠졌습니다.

- `PROCESSING` + claim lease
- FIRED 전 RESOLVED 전달 방지
- at-least-once 계약과 channel idempotency key
- 신규 채널 activation/bootstrap 정책
- FIRED가 DEAD인 경우 RESOLVED 정책
- 실제 전이가 발생한 경우에만 행 생성

“등록 채널 0개면 행 없음”은 현재 형태로는 문제가 있습니다. 권장은 신규 채널 활성화 시 당시 열린 이벤트를 FIRED로 bootstrap하는 것입니다.

### 4. 5분 평가 분할

분할 자체는 필요합니다. 단순히 메서드 앞뒤만 나누면 안 됩니다.

- 판정 트랜잭션은 이벤트·스냅샷·통지 outbox·바인딩 desired state·Zabbix durable command까지만 커밋
- 외부 단계는 immutable command를 받아 실행
- 순서는 `pending status retry → active provision → orphan/restore 처리 → live push → eventid backfill → cleanup`
- 고아 처리 내부는 `resolve intent/-1 → trigger disable`
- 삭제는 `trigger → item`
- 외부 실패가 판정 커밋을 롤백하지 않아야 함
- Job은 판정 성공과 외부 동기화 실패를 따로 기록해야 함

기존 `ApmAlertEvaluationIT`는 한 번의 `evaluateAll()` 호출로 DB 전이와 Zabbix 부작용을 함께 기대합니다. [ApmAlertEvaluationIT.java:114](/C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationIT.java:114) 판정 IT와 외부 orchestration 테스트로 분리해야 합니다.

### 5. 감시기 명령 분리와 executor

방향은 맞지만 현재 실패 복구 규칙은 부족합니다.

- 모든 메모리 상태 변경을 DB ack 기준으로 정의해야 합니다.
- executor에는 JPA entity를 넘기지 않습니다.
- 서비스별 generation으로 오래된 결과를 폐기해야 합니다.
- graceful shutdown drain과 abrupt loss 복구 경로가 필요합니다.
- latest-only coalescing은 Zabbix를 state projection으로 정의할 때만 허용됩니다.
- 현재 `fixedDelay` tick끼리는 같은 인스턴스에서 겹치지 않지만, async push worker와 다음 tick의 상태 경합은 별도로 생깁니다.

### 6. 삭제 경로

설계 방향이 맞습니다.

- 화면 삭제도 공용 `deleteRule` 사용
- 서비스 삭제 전 열린 이벤트 전부 `SERVICE_DELETED` 해소
- 규칙 끄기 `RULE_DISABLED`
- 규칙 삭제 `RULE_DELETED`
- 정리 명령은 삭제 트랜잭션 안에서 선적재
- 외부 삭제는 커밋 뒤 실행
- 실패 시 새로 큐에 넣는 방식이 아니라 성공 시 기존 큐 명령을 완료 처리

### 7. 한 번에 구현 가능한가

**한 커밋 또는 한 대형 변경으로 구현하는 것은 권하지 않습니다.**

스키마 보존, 상태 전이, 통지 outbox, Zabbix 수명주기, 평가 트랜잭션, 1초 감시기라는 서로 다른 장애 영역이 겹칩니다. 적어도 7개 독립 검증 단위가 필요합니다.

## 권장 구현 단위·순서

1. **이력 보존 기반 — V76**

   FK SET NULL, snapshot, scope, CHECK, 엔티티 nullable 수정, 조회 LEFT JOIN과 snapshot fallback, 실 PG migration IT.

2. **이벤트 전이 단일화**

   `open/resolve(reason)` 단일 서비스, snapshot INSERT, 실제 전이 여부 반환, 규칙·서비스·SLO 삭제 경로 통일. 서비스 삭제 선해소 포함.

3. **V77 통지 outbox와 SPI**

   스키마, 같은 트랜잭션 INSERT, 가짜 채널, FIRED/RESOLVED 순서, 활성화 bootstrap 정책. 아직 실제 메일·웹훅은 없음.

4. **통지 dispatcher**

   `PROCESSING` lease claim, `SKIP LOCKED`, backoff, DEAD/SKIPPED, 만료 claim 복구, 2-worker PG IT, 외부 성공 후 상태 기록 전 crash 테스트.

5. **Zabbix durable lifecycle command**

   기존 `apm_zbx_cleanup` 확장 또는 별도 command 표, 선적재 방식 전환, trigger 상태 desired/pending, RESOLVE, trigger→item dependency, 외부 I/O의 트랜잭션 제거.

6. **5분 평가 분할**

   `TransactionTemplate` 또는 별도 transactional bean, immutable sync plan, 외부 단계 순서, Job 결과 모델과 `ApmAlertEvaluationIT` 재구성, 5초 지연 주입 검증.

7. **1초 감시기 명령/ack 상태기계**

   lock 내부 판정만, lock 밖 DB 적용, 서비스별 generation, executor coalescing 정책, shutdown/재기동 복구, 기존 monitor 테스트 전환.

8. **계약·FE 반영**

   `scope`, `resolveReason`, 삭제 플래그, snapshot fallback, 삭제된 서비스 UUID 필터와 링크 비활성 표시를 계약서와 FE에 반영.

각 단위는 build와 관련 테스트가 통과하는 독립 커밋으로 유지하는 것이 안전합니다. 특히 5번이 끝나기 전에 6번의 트랜잭션 분할을 배포하면 commit→외부 호출 사이 crash gap이 확대되므로 순서를 바꾸면 안 됩니다.
