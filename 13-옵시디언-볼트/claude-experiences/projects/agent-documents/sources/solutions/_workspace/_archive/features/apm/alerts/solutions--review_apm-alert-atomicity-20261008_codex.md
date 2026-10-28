# 코덱스 검수 전문 1차 — APM 순위 11 알람 원자성 (2026-10-08, gpt-5.6-sol high, 읽기 전용)

## 요약

**판정: 🟡 보완 후 승인**

- 🔴 0건
- 🟡 4건
- 🟢 1건

V71 SQL과 교착 해소 방향은 타당합니다. 이벤트 INSERT·바인딩 행 잠금에서 배치가 monitor lock을 기다리는 두 간선도 모두 끊겼습니다. 다만 대상 없는 `ON CONFLICT`, 재기동 직후 규칙 교체, 실질적인 monitor health, 필수 회귀 테스트 공백은 병합 전 보완을 권고합니다.

요청대로 파일 변경과 테스트 재실행은 하지 않았습니다.

## 결함

### 1. 🟡 대상 없는 `ON CONFLICT`가 무관한 UNIQUE 충돌도 삼킴

- **심각도** · 🟡
- **위치** · [ApmAlertEventStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStore.java:47), [ApmAlertEventStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStore.java:49), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:249)
- **반례** · DB 복원 후 `bigserial` sequence가 뒤처져 PK 충돌이 나거나 향후 다른 UNIQUE가 추가되면, `DO NOTHING RETURNING`은 이를 “이미 같은 알람이 열림”으로 오인합니다. monitor는 `ledger.fire()` 반환값도 보지 않고 `alarmed=true`로 전환하므로 실제 이벤트 행 없이 재발화가 막힐 수 있습니다.
- **권고** · `ON CONFLICT (rule_id, service_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id`로 arbiter를 한정하고 PG 15 IT에서 NULL 키까지 직접 실행하십시오. PostgreSQL은 정확한 열 집합과 partial predicate로 unique index를 추론하며, conflict target 생략 시 모든 사용 가능한 UNIQUE/PK 충돌을 처리한다고 명시합니다. [PostgreSQL 15 INSERT 공식 문서](https://www.postgresql.org/docs/15/sql-insert.html)

### 2. 🟡 재기동 직후 A→B 규칙 교체가 추적 행을 재조정하지 못함

- **심각도** · 🟡
- **위치** · [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:296), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:298), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:362)
- **반례** · 재기동 시 `hydrate()`는 A 규칙의 열린 `Tracked` 행을 `open`에만 복원하고 `alarmed`는 비어 있습니다. 그 사이 대상 규칙이 B로 바뀌어 있으면 `reconcileAfterRefresh()`가 `alarmed.entrySet()`만 순회하므로 A 행을 `RULE_OFF`로 닫지 않습니다. 이후 B 이벤트는 열 수 있지만 요청 장부 행은 계속 A의 `ruleId`·임계값을 보유합니다.
- **권고** · 재조정 대상을 `alarmed ∪ open`으로 잡고, 복원된 `Tracked.row.ruleId`와 새 target ruleId도 비교하십시오. 불일치하면 A 행을 `RULE_OFF`로 닫고 B 기준으로 다시 여는 재기동 테스트를 추가해야 합니다. 현재 A→B 테스트는 같은 JVM에서 `alarmed`가 채워진 경우만 다룹니다. [ApmStuckRequestMonitorTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:173)

### 3. 🟡 `lastSuccessfulTick`이 실제 hang을 감지하지 못하고 스냅샷도 늙지 않음

- **심각도** · 🟡
- **위치** · [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:140), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:279), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:339), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:357)
- **반례** · `ledger.fire()`나 `hasOpenEvent()`가 반환하지 않고 멈추면 `tick()`의 `catch`에 도달하지 않아 30초 ERROR도 발생하지 않습니다. `lastSuccessfulTickMs()`도 선언 외 소비자가 없습니다. 동시에 `currentValue()`는 현재 시간이 아니라 멈춘 snapshot의 `tickMs`로 stale을 계산하므로, 90초가 지나도 마지막 0/양수 값을 계속 현재값처럼 반환합니다.
- **권고** · 동일 scheduler 밖의 `HealthIndicator`/metric/watchdog가 벽시계와 `lastSuccessfulTickMs`를 비교하게 하고, 읽기 경로의 stale 판정도 실제 현재 시각 기준으로 만드십시오. blocked tick이 90초를 넘었을 때 `currentValue()`가 empty이고 health가 DOWN/경고가 되는 테스트가 필요합니다.

### 4. 🟡 필수 회귀 14종이 출시 게이트 수준으로 고정되지 않음

- **심각도** · 🟡
- **위치** · [ApmAlertEventStoreIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStoreIT.java:35), [ApmAlertEventStoreIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStoreIT.java:46), [ApmAlertEvaluationRetryTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRetryTest.java:66)
- **반례** · IT는 Flyway 적용 완료 DB에서 규칙만 시드하므로 V70→V71의 중복 정리 SQL은 전혀 실행·검증하지 않습니다. `@EnabledIf`로 DB가 없으면 skip되므로 설계의 “출시 게이트 skip 불가” 조건도 아직 충족하지 않습니다.
- **권고** · 아래 누락 케이스를 PG 15 필수 CI task로 추가하고 DB가 없으면 skip이 아니라 실패하게 하십시오.

### 5. 🟢 장부 클래스 설명이 이전 소유권 모델을 계속 설명함

- **심각도** · 🟢
- **위치** · [ApmStuckRequestLedger.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:36)
- **반례** · 주석은 아직 “5분 배치도 STUCK을 같은 규칙으로 열고 닫는다”고 설명하지만 실제 코드는 monitor만 측정 기반 전이를 소유합니다.
- **권고** · 구현 수정과 함께 주석만 현재 계약으로 동기화하면 됩니다.

## 중점 확인 요청별 판정

1. **1차 보강 반영** · ⑧a, ④ 한정, STUCK push·`liveKeys`, ⑨ `observedAt`은 통과했습니다. ⑩은 정상 실행 중 A→B·외부 해소는 통과하지만 재기동 복원 경계가 빠졌고, health는 부분 반영입니다. [ApmAlertEvaluationService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:323), [ApmAlertEvaluationService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:359)

2. **§2 교착 두 간선** · 통과입니다. evaluator는 STUCK에서 event open/resolve 전에 `continue`하고, `currentValue()`는 유일한 `synchronized(lock)` 밖에서 volatile snapshot만 읽습니다. [ApmAlertEvaluationService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:369), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:160), [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:339)

3. **V71 SQL 정확성** · 코드 판독상 통과입니다. `PARTITION BY`는 NULL 서비스 축을 한 파티션으로 묶고, `fired_at ASC, id ASC`가 동률까지 결정합니다. donor join은 `IS NOT DISTINCT FROM`, DELETE는 열린 loser에만 한정됩니다. `NULLS NOT DISTINCT` 위치도 PG 15 문법과 일치합니다. [V71__apm_alert_event_open_unique.sql](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V71__apm_alert_event_open_unique.sql:18), [V71__apm_alert_event_open_unique.sql](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V71__apm_alert_event_open_unique.sql:38), [V71__apm_alert_event_open_unique.sql](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V71__apm_alert_event_open_unique.sql:49), [PostgreSQL 15 CREATE INDEX 공식 문서](https://www.postgresql.org/docs/15/sql-createindex.html)

4. **대상 없는 `ON CONFLICT`** · 보완 필요입니다. 현재 스키마에서는 동작하지만 PK·향후 UNIQUE까지 삼키므로 arbiter를 지정해야 합니다.

5. **`reconcileAfterRefresh` 순서·경계** · 새 targets를 읽은 뒤 실행하는 순서는 맞고 외부 해소 최대 10초 지연도 수용 가능합니다. 다만 재기동 후 A→B 경계가 누락됐습니다. A의 이벤트를 즉시 닫지 않는 것은 기존 관리 경로/다음 orphan sweep에 맡기는 설계와 일치합니다. [ApmStuckRequestMonitor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:166), [ApmAlertEvaluationService.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:398)

6. **필수 회귀 14종** · 완전 충족 8종, 부분 충족 2종, 미충족 4종입니다.

## 테스트가 못 잡는 케이스

필수 14종 중 완전 누락:

- V70→V71 실제 migration: 서비스/NULL 축 중복 3건, `fired_at` 동률, `zbx_eventid` 보강, loser DELETE, 닫힌 행 보존.
- evaluator가 실제 바인딩 행 잠금을 보유한 상태에서 monitor provisioning을 막는 교차 계층 교착 재현.
- JDBC open → JPQL `findOpen` → JPA resolve → commit.
- push 성공 뒤 DB rollback 및 push 실패 뒤 DB commit의 두 crash-gap.

부분 누락:

- evaluator STUCK은 양수만 검증했습니다. 0과 empty에서 push·`liveKeys`·무전이를 각각 검증하지 않습니다. [ApmAlertEvaluationRetryTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRetryTest.java:85)
- 외부 해소는 검증했지만, 대상이 실제로 빠졌다가 같은 규칙으로 다시 들어오는 off→on 진행 중 요청은 없습니다. [ApmStuckRequestMonitorTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:194)

이번 검수에서 추가로 드러난 미검증:

- 재기동 hydrate 직후 A→B 규칙 교체.
- monitor I/O가 90초 이상 hang된 경우 snapshot stale 전환과 health 경고.
- 지정한 conflict target이 PG 15의 `NULLS NOT DISTINCT` partial index를 실제 추론하는지.

## 반영 불필요 항목

- V71의 정본 선정·NULL 파티션·`zbx_eventid` 보강·DELETE 범위·PG 15 문법은 수정 불필요합니다.
- 외부 해소 재조회 주기는 10초면 충분하며 1초로 줄일 필요 없습니다.
- `reconcileAfterRefresh()`의 DB 호출이 monitor lock 안에 남아 있어도 배치 독자가 lock-free라 이번 JVM↔PG 교착은 재발하지 않습니다. I/O 분리는 계획대로 2차 범위로 둘 수 있습니다.
- 설치 가이드와 FAQ의 PostgreSQL 15+ 문구는 정확합니다. [설치·배포 가이드](/C:/solutions/moveseye-docs/operations/설치-배포-가이드.md:50), [자주 묻는 질문](/C:/solutions/moveseye-docs/guides/자주-묻는-질문.md:58)
- 단일 BE 한정도 설계 정본에 명시돼 있습니다. [설계 정본](/C:/solutions/_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md:56)

단, 문서 두 파일은 현재 `git status`상 모두 untracked이므로 최종 커밋에서 누락되지 않게 포함 여부만 확인해야 합니다.
