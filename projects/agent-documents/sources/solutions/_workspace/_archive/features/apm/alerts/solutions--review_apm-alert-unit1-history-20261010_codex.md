## 판정

**반려**

V76의 기본 방향과 대부분의 nullable 전파는 맞습니다. 그러나 삭제와 평가의 경쟁 조건, 스냅샷 실패 시 fail-open 동작, SLO 스냅샷 불변식 누락 때문에 현재 상태로 병합하면 알람 이력과 실제 Zabbix 상태가 갈라질 수 있습니다.

## 🔴 필수

### 1. 삭제 선해소가 동시 평가를 막지 못함

서비스 삭제는 이벤트를 `saveAllAndFlush`한 뒤 Zabbix 객체를 지우고 마지막에 서비스 행을 삭제합니다.

- [ApmAlertService.java:631](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:631>)
- [ApmAlertService.java:636](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:636>)
- [ApmServiceQueryService.java:548](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java:548>)

단일 트랜잭션 내 UPDATE→DELETE 순서는 맞지만 부모 `service`/`rule` 행을 잠그지 않습니다. 다음 순서가 가능합니다.

1. 삭제 트랜잭션이 기존 열린 이벤트를 닫고 flush
2. 외부 Zabbix 객체 삭제
3. 동시 평가가 같은 서비스에 새 열린 이벤트 삽입
4. 서비스 삭제 시 FK가 `service_id=NULL`로 만들려다가 `apm_alert_event_open_service_chk` 위반
5. DB 삭제는 rollback되지만 이미 수행한 Zabbix 삭제는 복구되지 않음

규칙 삭제와 SLO 삭제도 같은 구조입니다. [ApmAlertService.java:590](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:590>), [ApmAlertService.java:594](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:594>), [ApmAlertService.java:852](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:852>)

구체 수정안:

- 최소 수정: 삭제 시작 시 `apm_service` 또는 `apm_alert_rule` 부모 행을 `PESSIMISTIC_WRITE`/`SELECT ... FOR UPDATE`로 잠근 뒤 선해소합니다.
- 규칙 비활성화는 부모가 남기 때문에 잠금만으로 부족합니다. 평가와 상태 전이를 동일 advisory lock으로 직렬화하거나, 이벤트 INSERT 직전에 잠금 하에서 `enabled`를 재확인해야 합니다.
- 서비스·규칙·SLO 삭제 각각에 평가 INSERT와 경쟁하는 2-트랜잭션 IT를 추가해야 합니다.
- 장기적으로는 설계 검수 🔴10대로 DB 삭제·cleanup 명령 적재를 먼저 커밋하고 외부 I/O를 이후 실행하는 구조가 안전합니다.

### 2. 스냅샷 생성 실패가 알람 이력 없이 Zabbix 상태만 변경함

5분 평가에서는 push 요청을 먼저 넣고, 이후 스냅샷 생성이 실패해도 push 목록에서 제거하지 않습니다.

- push 등록: [ApmAlertEvaluationService.java:370](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:370>)
- 스냅샷 실패: [ApmAlertEvaluationService.java:390](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:390>)
- 실제 push: [ApmAlertEvaluationService.java:417](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:417>)

1초 걸림 감시기는 더 직접적입니다. `fire()`가 스냅샷 실패로 `false`를 반환해도 Zabbix push를 수행하고, 호출자는 반환값을 무시한 채 `alarmed=true`로 고정합니다.

- [ApmStuckRequestLedger.java:121](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:121>)
- [ApmStuckRequestLedger.java:124](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:124>)
- [ApmStuckRequestMonitor.java:256](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:256>)

그 결과 DB 열린 이벤트는 없고 Zabbix만 발화하며, JVM 메모리는 이미 열린 것으로 보아 다음 tick에서도 재시도하지 않습니다.

구체 수정안:

- 스냅샷 실패 시 이벤트 INSERT와 push를 모두 생략하고 다음 tick에서 재시도합니다.
- `ledger.fire()`의 반환을 `opened/alreadyOpen/snapshotMissing`처럼 구분하거나, 최소한 실제 열린 이벤트가 확인된 경우에만 `AlarmState.open=true`로 전환합니다.
- `fired++`도 실제 상태 전환 성공 때만 증가시킵니다.

### 3. SLO 이력에 `slo_uid`가 없는 행을 허용함

설계 검수에서 SLO 이력의 `slo_uid`·`slo_name`을 사실상 필수로 요구했지만, V76의 사전 검증과 CHECK는 이를 강제하지 않습니다.

- SLO 백필: [V76__apm_alert_event_history_snapshot.sql:92](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:92>)
- 사전 검증은 rule/service만 확인: [V76__apm_alert_event_history_snapshot.sql:105](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:105>)
- CHECK에도 SLO 불변식 없음: [V76__apm_alert_event_history_snapshot.sql:167](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:167>)

런타임도 SLO가 없으면 실패시키지 않고 `sloUid=null`, `sloName=null` 스냅샷을 생성합니다. [ApmAlertEventSnapshots.java:49](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventSnapshots.java:49>), [ApmAlertEventSnapshot.java:41](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventSnapshot.java:41>)

구체 수정안:

- 백필 후 `scope='SLO' AND (slo_uid IS NULL OR slo_name IS NULL)`을 loud failure 대상으로 추가합니다.
- `CHECK (scope <> 'SLO' OR slo_uid IS NOT NULL)`을 추가합니다. `slo_name`도 DB상 필수라면 함께 강제합니다.
- `ApmAlertEventSnapshots.of()`는 SLO 규칙에 `slo_id`가 없거나 SLO 조회가 실패하면 `Optional.empty()` 또는 명시적 예외를 반환해야 합니다.

### 4. `recent()`가 nullable `value`를 0으로 잘못 읽음

[ApmAlertQueryStore.java:99](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:99>)에서 `getDouble(5)` 뒤 생성자 인자를 평가하면서 `getString(2~4)`를 다시 호출한 후 `rs.wasNull()`을 사용합니다. 따라서 `wasNull()`은 5번 `value`가 아니라 마지막 `kind` 조회 결과를 검사합니다.

V76 이전의 `value=NULL` 이력이 보존되면 개요 조회에서 `0.0`으로 왜곡됩니다.

구체 수정안:

```java
Double value = rs.getObject(5, Double.class);
```

으로 직접 읽고 nullable value 회귀 테스트를 추가해야 합니다.

## 🟡 권장

- FK 탐색 쿼리는 현재 스키마에서는 안전합니다. `conrelid`, 단일 `conkey`, 컬럼명, 참조 테이블까지 제한하므로 다른 컬럼 FK를 건드리지 않습니다. [V76 SQL:141](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:141>) 다만 완전한 방어를 위해 `confkey[1]`이 참조 테이블의 `id` 컬럼인지도 확인하는 편이 좋습니다.
- `resolve_reason` CHECK는 열린 행에 사유가 들어가는 상태를 허용합니다. [V76 SQL:188](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:188>) 레거시 해소 행의 `NULL`은 허용하되 `CHECK (resolved_at IS NOT NULL OR resolve_reason IS NULL)`은 추가할 수 있습니다.
- 미사용 `findByServiceIdAndFiredAtBetween`은 삭제된 서비스 이력을 찾지 못합니다. [ApmAlertEventRepository.java:37](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:37>) 현재 호출처는 없지만 제거하거나 `serviceUid` 기반으로 바꾸는 것이 안전합니다.
- V76은 대용량 환경에서 한 번에 실행하지 않는 편이 좋습니다. nullable 열 추가 후 네 차례 UPDATE, NOT NULL 검증, FK 검증, CHECK 검증, 일반 인덱스 생성이 한 Flyway 트랜잭션에 있으며 첫 `ALTER TABLE`의 강한 잠금이 커밋까지 유지될 수 있습니다. 운영 행 수는 확인하지 못했으므로 규모 영향 수치는 **추정**입니다. 대용량이면 nullable 추가 → 애플리케이션 dual-write → PK 범위별 배치 백필 → `NOT VALID` 추가 → 별도 `VALIDATE CONSTRAINT` → 별도 트랜잭션의 NOT NULL/FK → `CREATE INDEX CONCURRENTLY` 순으로 분리해야 합니다.

## 🟢 참고

- 백필의 8개 정식 kind별 `scope`·`threshold_unit` 값은 실제 `ApmAlertKind` 표와 일치합니다. [ApmAlertKind.java:37](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertKind.java:37>), [ApmAlertKind.java:198](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertKind.java:198>), [V76 SQL:57](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:57>)
- 옛 이름 `LATENCY_P95`, `COLLECTOR_SEND_FAILED`, `SLO_BURN_RATE`의 정규화도 `ApmAlertKind.find()`와 일치합니다. [ApmAlertKind.java:247](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertKind.java:247>), [V76 SQL:43](</C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V76__apm_alert_event_history_snapshot.sql:43>)
- `rule_id` nullable 전파의 주요 경로는 반영됐습니다. `findAllById`에서 null을 제거하고, Zabbix eventid 백필은 `rule_id IS NOT NULL`로 제한하며, 이력 필터는 `service_uid` 전용 쿼리로 분리했습니다.
- 정적 grep 기준 현재 프로덕션 해소 호출부에는 사유 누락이 없습니다: 회복 `RECOVERED`, 끄기 `RULE_DISABLED`, 규칙 삭제 `RULE_DELETED`, 서비스 삭제 `SERVICE_DELETED`, SLO 삭제 `SLO_DELETED`, 고아 `ORPHANED`.
- 조회의 `LEFT JOIN`, `coalesce`, 삭제된 서비스의 `service_uid` 필터 구조는 맞습니다. DTO도 기존 필드 뒤에 네 필드만 추가한 additive 변경이라 JSON 객체 계약 호환성은 유지됩니다. [ApmAlertEventDto.java:68](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertEventDto.java:68>)

## 의견 요청 답

1. **엄격 실패가 맞습니다.** SERVICE/SLO 이력에 `service_uid`가 없으면 보존 이력의 정체성을 복구할 수 없으므로 조용히 통과시키면 안 됩니다. 다만 이를 애플리케이션 기동 시 처음 발견하지 않도록 배포 전 동일 검증 쿼리를 실행해야 합니다. `NOT VALID`은 “신규 쓰기는 막되 기존 오류는 운영 중 보정하고 이후 VALIDATE”하는 명시적인 2단계 배포에서만 허용할 수 있습니다.

2. **현재 warn 후 skip+push는 부적절합니다.** 서비스 삭제 경쟁이라면 해당 대상은 no-op 처리하고, 일시적인 불일치라면 다음 평가에서 재시도해야 합니다. 이력 생성에 실패한 발화 push는 하지 않는 것이 맞습니다.

3. **`RULE_DISABLED`가 맞습니다.** 물리 구현은 규칙 행 삭제지만 사용자의 도메인 행위는 “SLO 번 알람 끄기”입니다. `ruleDeleted=true`는 현재 규칙 행 존재 여부, `resolveReason=RULE_DISABLED`는 해소 원인이므로 함께 존재해도 모순이 아닙니다.

4. **반드시 수정해야 합니다.** `ledger.fire()` 결과를 무시하고 `alarmed=true`로 두면 이력 없는 알람이 메모리상 열린 것으로 고정됩니다. 실제 DB 열린 상태가 확인된 경우에만 true로 전환하고, 실패 시 다음 tick에서 재시도해야 합니다.

5. **대용량 테이블에는 현행 단일 V76을 권장하지 않습니다.** 소규모이고 점검 시간 확보가 가능할 때만 허용할 수 있습니다. 운영 행 수·예상 UPDATE 시간·잠금 대기 시간을 사전 측정하고, 무중단 요구가 있으면 위의 expand/backfill/validate/index-concurrently 단계로 분리해야 합니다.

## 테스트 공백

- 평가 INSERT와 서비스·규칙·SLO 삭제가 경쟁하는 2-트랜잭션 IT가 없습니다.
- 비활성화와 이미 시작한 평가가 경쟁하여 해소 뒤 새 열린 이벤트가 생기는 케이스가 없습니다.
- 스냅샷 실패 시 5분 평가가 push하지 않는지, 1초 감시기가 `alarmed=false`를 유지하며 재시도하는지 검증이 없습니다.
- `SLO_BURN`인데 `slo_id`가 없거나 SLO 행을 찾지 못하는 백필·런타임 실패 테스트가 없습니다.
- V76 자동 테스트는 모든 8개 kind와 세 별칭을 완전 순회하지 않습니다. 특히 `SLO_BURN_RATE` 백필이 자동 테스트에 없습니다.
- `recent()`의 `value=NULL` 보존 테스트가 없습니다.
- FK 탐색 DO 블록이 같은 테이블의 무관한 “미끼 FK”를 보존하는 테스트가 없습니다.
- 운영 규모에 가까운 데이터로 migration 소요 시간, 잠금 대기, rollback 시간, 인덱스 생성 시간을 측정한 결과가 없습니다.
- DTO 필드가 추가만 되었음을 보장하는 controller JSON/OpenAPI 계약 스냅샷 테스트가 없습니다.
- 요청의 읽기 전용 조건 때문에 테스트를 재실행하지 않았으며, `220 passed`와 V75 복제 DB 검증 결과는 요청서 기재 내용을 기준으로 판단했습니다.
