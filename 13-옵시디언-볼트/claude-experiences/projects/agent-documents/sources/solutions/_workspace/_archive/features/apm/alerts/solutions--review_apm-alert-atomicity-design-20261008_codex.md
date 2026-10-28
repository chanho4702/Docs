# 코덱스 설계 의견 — APM 순위 11 알람 원자성 (2026-10-08, gpt-5.6-sol high, 읽기 전용)

설계안: features/apm/alerts/apm-alert-atomicity-20261008.md

## 요약

- §2의 교착은 실제로 성립하며 PostgreSQL은 JVM lock 대기를 볼 수 없어 자체 교착 감지로 끊지 못합니다.
- 다만 ④만으로는 부족합니다. 바인딩 행 잠금으로 같은 역순 교착이 재현될 수 있어 lock-free STUCK 스냅샷을 1차에 포함해야 합니다.
- 1차는 `①②③④⑨ + lock-free snapshot + alarmed 재조정`이면 타당합니다. evaluator의 STUCK push는 반드시 유지해야 합니다.
- V71은 “최신 행+최초 fired_at 복사”보다 최초 행 정본이 낫고, PG 15라면 `NULLS NOT DISTINCT`가 더 안전합니다.

## 1. §2 교착 시나리오

### 판정: 성립함

현재 코드는 다음 잠금 순서를 실제로 만들 수 있습니다.

1. evaluator는 전체 실행이 하나의 트랜잭션입니다: [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:281).
2. STUCK 이벤트를 INSERT한 뒤: [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:367)
3. 다른 서비스의 `currentValue()`에서 monitor lock을 기다릴 수 있습니다: [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:344), [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:246).
4. monitor는 같은 lock을 쥔 채 `ledger.fire()`를 호출합니다: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:121), [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:205).
5. `fire()`가 같은 키를 INSERT하면 UNIQUE 판정을 위해 evaluator 트랜잭션 종료를 기다립니다: [ApmStuckRequestLedger.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:110).

PostgreSQL에서 보이는 것은 “monitor 트랜잭션 → evaluator XID 대기”뿐입니다. evaluator가 기다리는 대상은 DB lock이 아니라 JVM monitor이므로 PostgreSQL wait graph에는 역방향 간선이 없습니다. 따라서 DB 교착 감지가 아니라 무기한 lock wait가 됩니다.

### ④만으로 충분하지 않음

이벤트 INSERT 경합은 ④로 없어지지만 동일한 lock inversion이 바인딩 행에서도 가능합니다.

- evaluator는 `ensureProvisioned()` 후 `currentValue()`를 읽습니다: [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:321).
- `ensureProvisioned()`은 바인딩을 저장합니다: [ZabbixAlertBridge.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:306), [ZabbixAlertBridge.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:341).
- monitor도 lock 안의 `fire()`에서 같은 provisioning을 수행합니다: [ApmStuckRequestLedger.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:112).

바인딩 생성·오류 갱신·trigger-status 재시도 등으로 evaluator가 바인딩 행 잠금을 가진 상태라면, monitor는 그 행을 기다리고 evaluator는 monitor lock을 기다릴 수 있습니다. 설계안의 ⑧′ “메모리 읽기뿐이므로 lock 유지”는 이 점을 놓쳤습니다.

### 가장 작은 회피책

권장 순서는 다음과 같습니다.

1. **1차 최소 보완: lock-free 공개 스냅샷**
   - monitor가 tick 완료 시 `AtomicReference<Map<Long, CurrentValueSnapshot>>` 또는 `volatile` immutable map을 공개합니다.
   - `currentValue()`는 `synchronized(lock)`에 들어가지 않고 직전 완료 tick의 스냅샷만 읽습니다.
   - monitor가 DB/Zabbix에서 막혀도 evaluator는 이전 값 또는 `empty`를 받고 진행합니다.
   - 시작 직후 스냅샷이 없으면 한 회차를 건너뛰는 쪽이 잘못된 0을 만드는 것보다 안전합니다.

2. **대안: evaluator가 트랜잭션 시작 전에 STUCK 전량을 스냅샷**
   - 비트랜잭션 wrapper → snapshot → 내부 transactional bean 구조가 필요해 변경 폭이 더 큽니다.

3. **완전한 해결: ⑧대로 monitor I/O를 lock 밖으로 이동**
   - 장기적으로 가장 낫지만 outbox와 함께 처리해도 됩니다.

`lock_timeout`은 monitor transaction을 실패시켜 lock을 풀 수는 있지만 감시 누락과 반복 rollback을 만들므로 안전망일 뿐 해결책은 아닙니다.

## 2. 1차 범위의 타당성과 누락

### 조건부 타당

`①②③④⑨` 방향은 맞지만 아래 두 항목을 1차에 추가해야 합니다.

- `⑧a`: lock-free STUCK 값 스냅샷
- `⑩`: `alarmed` 캐시의 DB·규칙 대상 재조정

### evaluator의 STUCK push는 유지해야 함

유지가 맞습니다.

`ledger.fire()`는 event를 연 뒤 push하지만: [ApmStuckRequestLedger.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:114), push 실패는 bridge 내부에서 삼키고 바인딩 오류만 기록합니다: [ZabbixAlertBridge.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:803). monitor는 이후 `alarmed=true`라서 다시 `fire()`하지 않습니다.

따라서 outbox 전까지 evaluator의 5분 push가 유일한 내구성 있는 재시도입니다. 이를 제거하면 일시적인 Zabbix 실패가 다음 해소·재발화까지 영구 미전송이 될 수 있습니다.

evaluator에서 STUCK에 대해 남겨야 할 일은 정확히 다음입니다.

- `targetsOf()` 수행
- `liveKeys` 추가
- `ensureProvisioned()` 수행
- lock-free snapshot 값이 있으면 push 목록 추가
- event open/resolve만 건너뜀

`liveKeys`를 빼면 orphan sweeper가 정상 STUCK 바인딩을 고아로 보고 트리거를 내립니다. `liveKeys`가 고아 판단의 정본이라는 현재 계약도 명시돼 있습니다: [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:294), [ApmAlertOrphanSweeper.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:160).

### “전이 소유자 단일화” 문구 수정 필요

④는 다음처럼 한정해야 합니다.

> STUCK의 **측정값 기반 정상 open/resolve** 소유자는 monitor다.  
> 규칙 비활성화·삭제와 대상 고아화에 따른 관리적 resolve는 기존 경로가 계속 담당한다.

실제로 규칙 끄기는 즉시 열린 이벤트를 해소하고: [ApmAlertService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:489), orphan sweeper도 대상에서 빠진 쌍을 해소합니다: [ApmAlertOrphanSweeper.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:226), [ApmAlertOrphanSweeper.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:264).

### `alarmed` 캐시 문제는 1차에서 처리해야 함

현재 `alarmed`는 서비스 ID만 키로 가지며: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:77), 최초 한 번 DB를 읽은 뒤 계속 신뢰합니다: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:200).

이 상태에서 evaluator의 전이 보정을 제거하면 다음 결함이 새로 노출됩니다.

- 규칙을 끄고 즉시 다시 켜 열린 이벤트만 해소됐지만 monitor가 target 부재를 관측하지 못한 경우, `alarmed=true`가 남아 진행 중 요청의 이벤트를 다시 열지 않음.
- 동일 서비스의 STUCK 규칙이 A→B로 교체돼도 서비스 키가 같아 B 이벤트를 열지 않음.
- orphan sweeper가 이벤트를 닫았지만 monitor가 이를 모르고 `alarmed=true`를 유지.

권장 구현은 다음입니다.

- `Map<Long, Boolean>` 대신 `Map<Long, AlarmState(ruleId, open)>`.
- 10초 target refresh 시 현재 `ruleId`와 기존 상태를 대조.
- 현재도 tracked request가 있는 서비스만 `hasOpenEvent(currentRule, service)`로 재조정.
- target/rule이 바뀌면 기존 tracked row는 `RULE_OFF`로 닫고 새 규칙 기준으로 같은 snapshot을 재평가.
- 재조정은 반드시 **새 target 목록을 읽은 뒤** 수행하여, orphan 처리 직후 낡은 target으로 재발화하지 않게 함.

### ⑨ 보완 방식

현재 반복 대상은 `targets ∪ open`뿐이라: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:138), 한 번도 열린 요청이 없었던 서비스는 target 제거 시 `observedAt` 정리 분기에 들어오지 않습니다. target refresh 직후 다음을 별도로 해야 합니다.

```java
observedAt.keySet().removeIf(serviceId -> !targets.containsKey(serviceId));
```

lock-free 공개 스냅샷에서도 같은 서비스를 함께 제거해야 합니다.

추가로 monitor는 예외를 경고만 하고 다음 tick으로 넘깁니다: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:107). evaluator fallback을 없애는 만큼 `lastSuccessfulTick` metric/health 경고도 1차에 넣는 편이 안전합니다.

## 3. V71 정리 규칙과 PG 15 문법

### 최신 행보다 최초 행 정본을 권장

`findOpen()`의 최신순 정렬은 중복이 존재할 때 전부 반환하되 첫 행을 최신으로 보여 주는 조회 편의입니다: [ApmAlertEventRepository.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEventRepository.java:55). UNIQUE 적용 후에는 0/1건이므로 정본 선정 근거가 되지 않습니다.

반대로 `fired_at`과 `value`는 “사고가 처음 터진 시각과 그 순간 값”이라는 도메인 의미를 가집니다: [ApmAlertEvent.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEvent.java:71), [ApmAlertEvent.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertEvent.java:79).

따라서 권장은:

- `ORDER BY fired_at ASC, id ASC`의 최초 행을 정본으로 유지
- 정본의 `zbx_eventid`가 null이면 중복 행 중 적절한 non-null 값을 보강
- 최신 행에 최초 `fired_at`만 복사하는 절충은 피함  
  → 최신 행의 `value`가 최초 발화 시점 값인 것처럼 왜곡됩니다.

또한 중복 행을 `resolved_at=now()`로 바꾸면 긴 가짜 MTTR이 생깁니다. 이 행들은 최근 알람과 기간별 발화 수에도 그대로 포함됩니다: [ApmAlertQueryStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:79), [ApmAlertQueryStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/query/ApmAlertQueryStore.java:124).

선택지는 명시적으로 결정해야 합니다.

- 지표 정확성 우선: 중복 loser 삭제
- 감사 보존 우선: loser를 `resolved_at=fired_at`으로 닫되, 발화 수 중복이 남는다는 점을 수용
- 완전한 보존: `deduplicated_into`/해소 사유를 추가하고 조회·집계에서 제외

현재 스키마에서는 첫 번째가 가장 정직합니다. 이벤트 ID를 외부에서 장기 참조하는 계약이 있다면 세 번째가 맞습니다.

### 제시한 표현식 문법

PG 15에서 다음 문법은 성립합니다.

```sql
CREATE UNIQUE INDEX apm_alert_event_open_uq
    ON apm_alert_event (rule_id, (COALESCE(service_id, 0)))
    WHERE resolved_at IS NULL;

INSERT ...
ON CONFLICT (rule_id, (COALESCE(service_id, 0)))
WHERE resolved_at IS NULL
DO NOTHING;
```

다만 `0` sentinel은 실제 `service_id=0`과 NULL을 같은 키로 취급합니다. FK라 보통 발생하지 않지만 스키마가 0을 명시적으로 금지하지는 않습니다.

PG 15가 기준이면 더 나은 표현은 다음입니다.

```sql
CREATE UNIQUE INDEX apm_alert_event_open_uq
    ON apm_alert_event (rule_id, service_id)
    NULLS NOT DISTINCT
    WHERE resolved_at IS NULL;
```

```sql
ON CONFLICT (rule_id, service_id)
WHERE resolved_at IS NULL
DO NOTHING
RETURNING id
```

V41도 nullable `service_id` 때문에 유니크 인덱스를 별도로 처리하고 있습니다: [V41__apm_alert.sql](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V41__apm_alert.sql:49). PG 15 고정이 아니라면 V41처럼 서비스/수집기 인덱스를 둘로 나누는 방법이 가장 호환성이 높습니다.

## 4. JdbcTemplate INSERT 뒤 JPQL 가시성

### 같은 트랜잭션이면 보임

현재 Spring Boot/JPA 구성에서 `JdbcTemplate`은 `JpaTransactionManager`가 노출한 같은 JDBC connection에 참여하는 기존 선례가 있습니다: [ZabbixSyncServiceImpl.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:79).

따라서 다음 순서는 정상입니다.

1. `JdbcTemplate INSERT ... RETURNING`
2. 같은 트랜잭션에서 `events.findOpen(...)`
3. JPQL이 DB에서 방금 삽입한 행을 읽어 managed entity로 만듦
4. `event.resolve()` 후 commit 시 UPDATE

주의사항은 다음입니다.

- store에는 `REQUIRES_NEW`를 붙이지 말고 ambient `REQUIRED` 트랜잭션에 참여시켜야 합니다.
- `DO NOTHING RETURNING`은 충돌 시 0행이므로 `queryForObject()`를 바로 쓰면 `EmptyResultDataAccessException`이 납니다. `query(...).stream().findFirst()` 형태가 안전합니다.
- JDBC가 삽입한 행은 즉시 Persistence Context에 등록되지 않습니다. 다만 이후 JPQL 조회가 이를 managed entity로 읽으므로 해소 경로는 정상입니다.
- 반대 순서, 즉 JPA entity를 `resolve()`만 하고 아직 flush하지 않은 상태에서 같은 키를 JDBC로 다시 열면 DB에는 여전히 열린 행이 보여 `DO NOTHING`이 될 수 있습니다. 같은 키에서 “JPA resolve → JDBC open”이 필요하다면 먼저 `EntityManager.flush()`하거나 open/resolve를 모두 store로 통일해야 합니다.
- JDBC bulk UPDATE/DELETE를 추가하면 이미 관리 중인 entity가 stale해질 수 있으므로 `clear()` 또는 명시적 refresh가 필요합니다. 이번 INSERT-only 범위에는 해당하지 않습니다.
- rollback 테스트로 JDBC INSERT도 외부 커밋되지 않는다는 사실을 고정해야 합니다.

## 5. 필수 회귀 테스트

| 테스트 | 잡는 결함 |
|---|---|
| PG 15 V70→V71 migration: service 키·NULL 수집기 키 각각 열린 중복 3건, 동률 `fired_at`, 닫힌 행 포함 | 정리 순서 비결정성, NULL 축 누락, 닫힌 이력 오염 |
| V71 후 직접 중복 INSERT 및 정확한 `ON CONFLICT` SQL 실행 | 인덱스 inference 실패(`42P10`), 표현식·predicate 불일치 |
| 같은 `(rule, service)`를 두 independent transaction에서 latch로 동시 open | TOCTOU 재발, 열린 행 2건, `RETURNING` 판정 오류 |
| winner transaction 보류 후 commit/rollback 두 경우 | loser가 영구 대기하거나 둘 다 삽입 실패하는 결함 |
| evaluator가 바인딩 행을 잠근 동안 monitor `fire()`를 차단하고 `currentValue()` 호출 | 이벤트 UNIQUE 외 바인딩 행 기반 JVM↔PG 교착 |
| monitor I/O가 latch에서 막힌 동안 lock-free `currentValue()`가 짧은 timeout 내 반환 | ⑧a가 실제로 evaluator lock 대기를 제거했는지 |
| STUCK 값 양수/0/empty 각각 evaluator 실행 | event를 열거나 닫지 않음, push는 유지, `liveKeys`로 바인딩이 orphan 처리되지 않음 |
| monitor 0→N→N→0 전이 | 정확히 한 번 open, 중복 없음, 정확히 한 번 resolve |
| 규칙 A→B 교체 중 요청이 계속 걸림 | 서비스 단위 `alarmed=true` 때문에 B 이벤트를 영구 누락하는 결함 |
| 규칙 off→즉시 on, 또는 orphan resolve 뒤 요청이 계속 걸림 | 외부 해소를 monitor cache가 모르고 재발화를 누락하는 결함 |
| 열린 요청이 없던 target 제거 후 재추가, 새 관측 전 `currentValue()` | 잔류 `observedAt` 때문에 과거 0/양수를 현재 값으로 재사용하는 APC-25 |
| JdbcTemplate open → JPQL `findOpen` → JPA resolve → commit | 영속성 컨텍스트 혼합 가시성 및 UPDATE 누락 |
| JdbcTemplate open 뒤 강제 rollback | store가 별도 connection/transaction으로 커밋되는 결함 |
| push 성공 뒤 강제 DB rollback, push 실패 뒤 DB commit | outbox 전까지 남는 두 crash-gap을 명시적으로 재현 |

기존 실제 PostgreSQL 평가 IT는 DB가 없으면 skip됩니다: [ApmAlertEvaluationIT.java](/C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationIT.java:34). 이번 동시성 테스트는 출시 게이트에서는 반드시 PG 15를 띄워 **skip 불가**로 실행해야 합니다.

## 6. outbox를 2차로 미루는 위험

### 설계안 그대로 1차 배포하면 새로 나빠질 수 있음

- 이벤트 경로 이외의 바인딩 잠금 교착이 남습니다.
- evaluator의 전이 보정이 없어지면서 `alarmed` 캐시 불일치가 영구 미발화로 바뀔 수 있습니다.
- monitor scheduler가 반복 실패하거나 멈췄을 때 기존 5분 evaluator fallback이 사라집니다.
- `resolved_at=now()` migration은 가짜 장기 장애와 중복 발화 수를 만듭니다.

### 위 권고를 반영하면 outbox 2차 분리는 가능

그 경우 1차가 새로 만드는 주요 운영 변화는 “중복 INSERT가 성공하던 것이 UNIQUE 대기로 바뀐다”는 점입니다. lock inversion만 제거하면 이는 정상적인 직렬화입니다.

outbox가 없어서 남는 위험은 대부분 기존 위험입니다.

- Zabbix push 성공 후 DB commit 전 crash → Zabbix에는 Problem, DB event는 rollback
- DB event commit + push 실패 → DB에는 열림, 외부 미전송
- provider 지연 동안 evaluator transaction과 monitor lock 장기 점유
- 외부 전송 exactly-once 보장 없음

다만 push 실패 후 DB commit은 evaluator의 STUCK 재push를 유지하면 최대 5분 내 자연 복구됩니다. 그래서 outbox를 미루는 결정과 evaluator push 유지는 한 묶음입니다.

다중 BE에서는 raw `@Scheduled` monitor가 각 인스턴스에서 실행되고: [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:107), 각 JVM의 live 상태가 다를 수 있습니다. UNIQUE는 중복 행만 막을 뿐 한 노드가 다른 노드의 이벤트를 조기 settle하는 문제는 해결하지 않습니다. HA를 2차 이후로 둔다면 1차 완료 문구도 “단일 BE 기준 APC-01 해소”로 한정해야 합니다.

## 설계안 수정 권고(있으면 diff 수준으로 구체적)

```diff
- 1차 — ①②③④⑨ (+ ⑧ 부분)
+ 1차 — ①②③④⑨ + ⑧a(lock-free 공개 스냅샷) + ⑩(alarmed 재조정/monitor health)
```

```diff
- STUCK_REQUEST 이벤트 전이 소유자 = 1초 monitor
+ STUCK_REQUEST의 측정값 기반 open/normal-resolve 소유자 = 1초 monitor
+ 규칙 off/delete 및 orphan resolve는 기존 관리 경로 유지
```

```diff
- currentValue()/openCount()는 lock 안 메모리 읽기만이라 그대로
+ currentValue()는 직전 완료 tick이 공개한 immutable/volatile snapshot을 lock 없이 읽음
+ monitor DB/Zabbix I/O가 막혀도 evaluator는 lock을 기다리지 않음
```

```diff
- alarmed: Map<Long, Boolean>
+ alarmed: Map<Long, AlarmState(ruleId, open)>
+ target refresh 후 tracked 서비스의 DB open 상태를 재조정
+ ruleId 변경 시 기존 tracked row를 RULE_OFF 처리하고 새 규칙으로 재평가
```

```diff
- 중복 열린 행 중 최신 1건 유지, 나머지 resolved_at=now()
+ 중복 열린 행 중 최초 fired_at/id 행 유지
+ loser 처리 정책 명시:
+   지표 정확성 우선이면 DELETE
+   감사 보존이면 resolved_at=fired_at + 향후 deduplicated_into 도입
```

```diff
- UNIQUE (rule_id, COALESCE(service_id,0))
+ PG 15: UNIQUE (rule_id, service_id) NULLS NOT DISTINCT
  WHERE resolved_at IS NULL
```

```diff
- evaluator의 STUCK도 공통 open/resolve 블록을 통과
+ evaluator는 STUCK의 liveKeys/provisioning/measurement/push까지 수행
+ push 목록 추가 직후 STUCK이면 event open/resolve 블록을 건너뜀
```

결론적으로 outbox는 2차로 분리해도 되지만, 현재 제안의 ⑧′와 `alarmed` 처리는 반드시 1차에서 보강해야 합니다. 읽기 전용 검토만 수행했으며 코드·설계 파일은 변경하지 않았습니다.
