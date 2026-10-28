# 코덱스 검수 전문 2차 — APM 순위 11 알람 원자성 (2026-10-08)

## 요약

**판정: 🟡 보완 후 승인**

- 🔴 0건
- 🟡 3건
- 🟢 0건

1차 핵심인 이벤트 중복 방지와 STUCK 전이 단일 소유권은 유효합니다. 다만 `reconcileAfterRefresh` 복원 경계, 실제 hang 경고, `it.db.required` 전달 방식은 아직 닫히지 않았습니다.

Worktree 확인 결과:

- 브랜치: `apm-alert-atomicity`
- HEAD: `1c094a1`
- staged 변경: 없음
- working tree: 수정 6개, 신규 3개
- `git diff --check`: 오류 없음. `ApmStuckRequestMonitor.java`의 LF→CRLF 경고만 존재
- 이번 검수에서는 파일 변경 및 테스트 재실행을 하지 않았습니다.

## 남은 결함

### 1. 🟡 90초 이상 hang이면 배치 watchdog이 실행되지 않음

- **위치**: [ApmAlertEvaluationService.java:345](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:345), [ApmAlertEvaluationService.java:353](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:353), [ApmAlertEvaluationService.java:369](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:369), [ApmStuckRequestMonitor.java:347](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:347), [ApmStuckRequestMonitor.java:357](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:357)
- **반례**: `ledger.fire()`가 막힌 뒤 90초가 지나면 벽시계 판정에 따라 `currentValue()`가 `empty`를 반환합니다. 그러면 평가기는 353행에서 `continue`하여 372행의 `stalledForMs()`에 도달하지 않습니다. 첫 tick부터 hang이면 `stalledForMs()`도 `-1`이라 경고하지 못합니다.
- **판정**: stale 값의 재사용 방지는 닫혔지만, 실제 hang 관측은 닫히지 않았습니다. 30~90초 사이에 배치가 우연히 실행될 때만 경고할 수 있습니다.
- **권고**: watchdog을 `currentValue()`/`measured.isEmpty()`보다 앞에서 실행하고 서비스별 루프 밖에서 한 번만 검사하십시오. 최초 성공 전 hang은 별도 기동 시각으로 판단하고, 90초 hang→`empty`와 ERROR/health 경고를 함께 검증하는 테스트가 필요합니다.

### 2. 🟡 복원 행의 `ruleId=null` 및 혼합 규칙 행 처리 오류

- **위치**: [ApmStuckRequestMonitor.java:303](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:303), [ApmStuckRequestMonitor.java:313](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:313), [ApmStuckRequestMonitor.java:316](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:316), [V67__apm_stuck_request.sql:18](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V67__apm_stuck_request.sql:18)
- **반례 1**: 규칙 삭제 시 FK가 `ON DELETE SET NULL`이므로 열린 복원 행의 `ruleId`가 null일 수 있습니다. 현재 비교는 null을 불일치에서 제외하므로 해당 행을 새 규칙의 행처럼 채택합니다.
- **반례 2**: 같은 서비스에 현재 규칙 B 행과 옛 규칙 A 행이 함께 복원되면 `anyMatch`가 참이 되고, 316~320행이 A뿐 아니라 정상적인 B 행까지 전부 `RULE_OFF`로 닫습니다.
- **테스트 공백**: 현재 테스트는 옛 규칙의 단일 non-null 행만 확인합니다. [ApmStuckRequestMonitorTest.java:210](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:210)
- **권고**: `Objects.equals(row.ruleId, currentRuleId)`가 아닌 행만 개별적으로 닫고 제거하십시오. null 복원 행과 A/B 혼합 복원 행을 각각 테스트해야 합니다.

### 3. 🟡 `it.db.required`가 일반 Gradle 실행에서 테스트 JVM에 전달되지 않음

- **위치**: [IntegrationTestSupport.java:103](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/support/IntegrationTestSupport.java:103), [IntegrationTestSupport.java:106](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/support/IntegrationTestSupport.java:106), [build.gradle.kts:93](/C:/worktrees/apm-c05-followup/build.gradle.kts:93)
- **반례**: `Boolean.getBoolean("it.db.required")`는 테스트 worker JVM의 system property를 읽습니다. 하지만 `Test` task는 DB 환경변수만 전달하며 `it.db.required`를 `systemProperty`/`jvmArgs`로 전달하지 않습니다. 따라서 문서대로 `gradlew test -Dit.db.required=true`를 실행하면 속성은 Gradle JVM에만 설정되고 IT는 계속 skip될 수 있습니다. Gradle도 `-D`가 Gradle 실행 JVM의 속성임을 명시하며, 테스트 JVM에는 `Test.systemProperty`로 전달하도록 안내합니다. [Gradle 공식 문서](https://docs.gradle.org/current/userguide/project_properties.html), [Test JVM 설정](https://docs.gradle.org/current/userguide/jvm_test_suite_plugin.html)
- **권고**: `tasks.withType<Test>`에서 `System.getProperty("it.db.required")`를 `systemProperty`로 전달하거나 `IT_DB_REQUIRED` 환경변수 하나로 통일하십시오. DB 미가용 상태에서 게이트 명령 자체가 실패하는 검증도 필요합니다.

## 1차 항목별 닫힘 여부

1. **🟡1 `ON CONFLICT` — 닫힘.** `(rule_id, service_id)`와 부분 술어로 V71 인덱스를 추론하는 문법이 맞습니다. `NULLS NOT DISTINCT`는 인덱스 자체의 NULL 동등성이고, NULL 축 두 번째 INSERT가 `empty`가 되는 실제 PG IT도 통과했습니다. [ApmAlertEventStore.java:50](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStore.java:50), [V71__apm_alert_event_open_unique.sql:49](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V71__apm_alert_event_open_unique.sql:49), [ApmAlertEventStoreIT.java:69](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStoreIT.java:69), [PostgreSQL 15 INSERT 문서](https://www.postgresql.org/docs/15/sql-insert.html)

2. **🟡2 재기동 A→B — 부분 닫힘.** `alarmed ∪ open` 순회와 non-null A행 비교는 반영됐지만, null 행 및 같은 서비스의 혼합 A/B 행 경계가 남았습니다.

3. **🟡3 hang 감지 — 부분 닫힘.** `publishedWallMs` 기반 90초 stale 전환은 맞지만 배치 watchdog이 그 `empty` 분기 뒤에 있어 실제 장기 hang을 보고하지 못합니다.

4. **🟡4 회귀·게이트 — 부분 닫힘.** V71 SQL 재생, JDBC→JPQL/JPA, STUCK 0/empty, off→on 테스트는 반영됐습니다. 다만 `it.db.required` 활성화 배선이 불완전합니다. [ApmAlertEventStoreIT.java:147](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStoreIT.java:147), [ApmAlertEvaluationRetryTest.java:108](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRetryTest.java:108)

5. **🟢5 주석 — 닫힘.** monitor 단독 전이 소유권과 배치의 push·고아 정리 역할로 정확히 갱신됐습니다. [ApmStuckRequestLedger.java:31](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:31)

## 반영 불필요 항목

- V71 정본 선정, NULL 파티션, `zbx_eventid` 보강, loser DELETE, `NULLS NOT DISTINCT` 부분 인덱스는 추가 수정이 필요 없습니다.
- 외부 해소 재조회 주기 10초는 그대로 두어도 됩니다.
- 바인딩 행 잠금 교차 교착 IT는 2차 이관이 타당합니다. evaluator가 바인딩 작업 뒤 lock-free `currentValue()`만 읽어 현재 코드는 단방향 대기이며 순환 간선이 없습니다. 다만 향후 회귀 방지용 IT 가치는 있습니다. [ApmAlertEvaluationService.java:326](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:326), [ApmStuckRequestMonitor.java:357](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:357)
- push 성공→DB rollback / push 실패→DB commit crash-gap도 outbox 2차 이관이 타당합니다. 현재 트랜잭션 안에서 DB INSERT 후 외부 push를 수행하므로 테스트만 추가해 해결할 문제가 아니라 전달 모델 변경 사항입니다. 단, 1차 완료 범위를 “DB 이벤트 원자성”으로 한정하고 2차 완료 조건에서는 제거하면 안 됩니다. [ApmStuckRequestLedger.java:113](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:113), [설계 정본:34](/C:/solutions/_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md:34)
- PostgreSQL 15+ 문서와 단일 BE 한정 문구는 정확합니다. [설치·배포 가이드:50](/C:/solutions/moveseye-docs/operations/설치-배포-가이드.md:50), [FAQ:59](/C:/solutions/moveseye-docs/guides/자주-묻는-질문.md:59), [설계 정본:56](/C:/solutions/_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md:56)
