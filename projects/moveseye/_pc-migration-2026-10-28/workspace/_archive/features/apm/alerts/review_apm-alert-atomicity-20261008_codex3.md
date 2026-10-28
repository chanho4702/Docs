# 코덱스 검수 전문 3차 — APM 순위 11 알람 원자성 (2026-10-08) — 승인

## 요약

**판정: 승인**

- 🔴 0건
- 🟡 0건
- 🟢 3건
- 남은 결함: 없음

브랜치 `apm-alert-atomicity`, HEAD `1c094a1` 확인. 상태는 수정 7개·신규 3개·staged 0개이며, `build.gradle.kts`가 수정 목록에 포함됩니다. `git diff --check` 오류도 없습니다(LF→CRLF 경고만 존재). 검수 중 파일은 변경하지 않았습니다.

## 2차 항목별 닫힘 여부

- 🟢1 hang 감시 위치·첫 tick — **닫힘**. watchdog이 대상 루프 전에 값과 무관하게 호출되며([ApmAlertEvaluationService.java:296](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:296), [ApmAlertEvaluationService.java:299](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:299)), 성공 tick이 없으면 기동 시각을 기준으로 경과 시간을 계산합니다([ApmStuckRequestMonitor.java:110](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:110), [ApmStuckRequestMonitor.java:362](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:362)). 호출 및 첫 성공 전후 테스트도 존재합니다([ApmAlertEvaluationRetryTest.java:90](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRetryTest.java:90), [ApmStuckRequestMonitorTest.java:263](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:263)). 기본 스케줄러 풀도 4개입니다([application.yml:44](/C:/worktrees/apm-c05-followup/src/main/resources/application.yml:44)).

- 🟢2 복원 행 null/혼합 규칙 — **닫힘**. 복원 행마다 `Objects.equals(row.ruleId, currentRuleId)`를 적용하여 A/null 행만 닫고 제거하며, 닫힘 수를 `Tick.closed`에 합산합니다([ApmStuckRequestMonitor.java:316](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:316), [ApmStuckRequestMonitor.java:322](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:322), [ApmStuckRequestMonitor.java:326](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:326)). B 유지·A/null 해소·재발화 없음 테스트가 이를 고정합니다([ApmStuckRequestMonitorTest.java:237](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:237), [ApmStuckRequestMonitorTest.java:252](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitorTest.java:252)).

- 🟢3 `it.db.required` 전달 — **닫힘**. `tasks.withType<Test>`가 Gradle JVM의 `-D` 값 또는 `IT_DB_REQUIRED`를 test worker의 system property로 전달합니다([build.gradle.kts:93](/C:/worktrees/apm-c05-followup/build.gradle.kts:93), [build.gradle.kts:109](/C:/worktrees/apm-c05-followup/build.gradle.kts:109)). DB 연결 실패 시 skip 대신 예외를 발생시키며([IntegrationTestSupport.java:103](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/support/IntegrationTestSupport.java:103), [IntegrationTestSupport.java:106](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/support/IntegrationTestSupport.java:106)), 실제 PG IT도 해당 조건을 사용합니다([ApmAlertEventStoreIT.java:35](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEventStoreIT.java:35)).

## 반영 불필요 항목

- V71 정리 규칙, NULL 축, loser 삭제 및 `NULLS NOT DISTINCT` 인덱스는 추가 변경 불필요.
- 외부 해소 재조회 주기 10초는 유지 가능.
- 바인딩 행 잠금 교차 교착 재현 IT와 push/DB crash-gap은 계획대로 outbox 2차 완료 조건으로 이관 가능([review_apm-alert-atomicity-20261008.md:51](/C:/solutions/_workspace/features/apm/alerts/review_apm-alert-atomicity-20261008.md:51)).
- PostgreSQL 15+ 전제도 추가 수정 불필요.
