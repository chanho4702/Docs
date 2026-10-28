# 리포트 관리 APM 분리 BE 재검수 결과

**종합 판정: 승인**

**차단 항목: 없음**

R1의 운영 코드 결함은 해소됐으며, 기존 적합 항목에서도 새 회귀는 발견되지 않았습니다. 남은 두 건은 테스트 결정성과 실패 시 정리 범위에 관한 비차단 권장사항입니다. 테스트는 실행하지 않았고, 기존 [테스트 리포트](/C:/worktrees/report-apm-be/build/reports/tests/test/index.html:23)의 **124건 성공·실패 0·skip 0**을 확인했습니다.

## 발견 사항

### R1 · 권장 · [ReportRetentionApmIT.java:221](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:221) · 동시성 IT의 잠금 검출이 시간 기반이다

- 문제: `Thread.sleep(800)` 뒤 `t2.isDone()==false`를 검사하지만, T2가 실제 저장 호출에 진입했다는 동기화는 없습니다. 첫 저장 경합 테스트도 barrier가 서비스 호출 전에만 있어, 두 요청 모두 “행 없음”을 읽었다는 interleaving을 강제하지 않습니다.
- 근거: 현재 잠금만 제거하면 T1은 외부 `TransactionTemplate` 커밋 전까지 UPDATE를 flush하지 않으므로, 정상적인 스케줄링에서는 T2가 곧 완료되어 `isDone()==false`가 실패합니다. 즉 현재 테스트는 실질적으로 잠금 제거를 검출합니다. 다만 극심한 스레드 지연 시 T2가 아직 실행되지 않아 잠금 없이도 통과할 가능성은 남습니다. 첫 저장 테스트도 한 작업이 먼저 끝나면 두 번째가 이미 생성된 행을 읽어 PK 경합 없이 통과할 수 있습니다.
- 제안: T2 작업 시작 latch를 추가하고, 첫 저장 테스트는 두 트랜잭션이 최초 빈 조회를 마친 지점에서 합류하도록 계측해 mutation 검출을 결정적으로 만드십시오.

### R3 · 권장 · [ReportRetentionApmIT.java:317](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:317) · 격리 스키마 준비 실패는 정리 범위 밖이다

- 문제: `v66_probe` 생성·테이블 복사·열 제거·시드가 `try/finally` 앞에 있습니다. 이 준비 단계 중간에 실패하면 스키마가 남습니다. 같은 구조가 두 V66 테스트에 반복됩니다.
- 근거: migration 실행 또는 assertion 실패는 각각 [350행](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:350), [387행](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:387)의 `finally`로 정리됩니다. 그러나 준비 단계는 그 범위 밖입니다. 다른 IT들이 같은 `moveseye_it` DB를 공유하므로 실패한 테스트가 잔여 스키마를 남길 수 있습니다.
- 제안: `create schema` 이후의 모든 준비·적용·검증을 하나의 `try/finally`로 감싸거나 `@AfterEach`에서 `DROP SCHEMA IF EXISTS v66_probe CASCADE`를 보장하십시오.

## 주요 검증 결과

- R1: [두 저장 메서드](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportManagementService.java:183)는 public `@Transactional` 메서드이며 컨트롤러가 주입된 서비스 프록시를 통해 호출합니다. public 저장 메서드 사이의 self-invocation은 없습니다. `loadForUpdate()`는 private helper일 뿐 별도 프록시가 필요하지 않습니다.
- R1: 두 PUT 모두 트랜잭션 진입 직후 `loadForUpdate()`를 첫 DB 접근으로 호출합니다. 현재 운영 호출 그래프에서는 그 전에 같은 행을 읽어 1차 캐시에 올리는 경로가 없습니다. 따라서 대기한 쪽의 잠금 쿼리가 PostgreSQL `READ COMMITTED`에서 최신 행을 읽으며, `@DynamicUpdate`가 없어도 상대 계열 값을 되돌리지 않습니다.
- R1: 행이 없을 때의 `SELECT FOR UPDATE → ON CONFLICT DO NOTHING → SELECT FOR UPDATE` 흐름도 맞습니다. 최초 INSERT 경합에서 뒤 요청이 선행 트랜잭션을 기다린 뒤, 생성된 행을 다시 잠가 읽으므로 중복 PK와 lost update를 함께 닫습니다.
- R2: [enum switch 식](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportManagementService.java:352)은 Java 17에서 현재 두 상수를 모두 열거한 exhaustive switch입니다. 새 enum 상수를 소스에 추가하고 정상 재빌드하면 컴파일 오류가 발생합니다. 현재 상태에서는 경고가 발생할 이유가 없습니다. Java 17에서 별도 컴파일된 enum만 런타임에 교체하는 이례적 binary mismatch는 `MatchException`이 아니라 암시적 default의 `IncompatibleClassChangeError` 계열 문제입니다.
- R2/R5: `other==0`이면 생략하고 0이 아니면 합계와 함께 표시하는 규칙이 [구현](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportSchedule.java:75)과 [3개 테스트](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportScheduleTest.java:31)에 정확히 고정돼 있습니다.
- R3: `search_path` 설정·V66 원문 실행·복구는 [하나의 `ConnectionCallback`](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:399)과 내부 `finally`에서 같은 연결로 수행됩니다. 현재 IT datasource에는 별도 `currentSchema` 설정이 없어 `"$user", public` 복구도 환경과 일치합니다.
- R4: [V66 주석](/C:/worktrees/report-apm-be/src/main/resources/db/migration/V66__report_retention_setting_apm.sql:4)은 `IF NOT EXISTS`의 한계, 수동 재실행 시 값 덮어쓰기, Flyway `repair`, PostgreSQL 트랜잭션 범위를 정확히 설명합니다.
- R6: [문서](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportAdminAccess.java:33)의 8개 EP는 `ReportManagementController` 6개와 `ApmReportController` 2개로 실제 코드와 일치합니다.
- 미커밋 변경 전체와 신규 파일 3개를 확인했으며, 기존 적합 판정 범위에서 새 운영 결함이나 API 계약 회귀는 발견하지 못했습니다.

## 1차 항목 종결 상태

- R1: **닫힘** — 비관적 잠금, 멱등 INSERT, 재잠금 읽기가 운영 경합을 닫음. 테스트 결정성 보강만 권장.
- R2: **닫힘** — Java 17 exhaustive enum switch와 `other` 표시 규칙이 적합.
- R3: **부분** — V66 원문 적용과 `search_path` 복구는 적합하나, 스키마 준비 단계 실패 시 정리가 보장되지 않음.
- R4: **닫힘** — V66 주석이 실제 보장 범위를 정확히 기술.
- R5: **닫힘** — 스케줄러 요약 문자열의 0·합계·`other` 규칙이 테스트로 고정됨.
- R6: **닫힘** — 관리자 가드 적용 대상 8개 EP 설명이 실제 호출 구조와 일치.