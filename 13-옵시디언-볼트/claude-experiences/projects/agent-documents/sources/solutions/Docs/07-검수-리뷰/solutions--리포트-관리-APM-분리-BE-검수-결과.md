# 리포트 관리 APM 분리 BE 검수 결과

- 검수 대상: `report-apm-split`, HEAD `baed6ee`, BE 미커밋 변경 8개·신규 파일 2개
- 기준: [검수 요청서](solutions--%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%ED%83%AD-%EB%B6%84%EB%A6%AC-APM-%EC%A0%84%EC%9A%A9-%EB%B3%B4%EC%A1%B4-%EC%84%A4%EC%A0%95-%28report-management-apm-split%29.md), [계약서](../06-API-%EA%B3%84%EC%95%BD/solutions--API-%EA%B3%84%EC%95%BD-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC-APM-%ED%83%AD-%EB%B6%84%EB%A6%AC-APM-%EC%A0%84%EC%9A%A9-%EB%B3%B4%EC%A1%B4-%EC%84%A4%EC%A0%95-%28report-management-apm-split%29.md), 지정된 인접 코드
- 테스트: 실행하지 않음. 기존 [테스트 리포트](/C:/worktrees/report-apm-be/build/reports/tests/test/index.html)은 116건 성공·실패 0·skip 0이며 현재 소스 변경 이후 생성된 것으로 확인
- 종합 판정: **수정 후 재검수**
- 차단 항목: **R1 — 두 보존 설정을 동시에 저장하면 상대 계열의 최신 값을 되돌릴 수 있음**

## 발견 사항

- R1 · 필수 · [ReportManagementService.java:178](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportManagementService.java:178), [ReportManagementService.java:204](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportManagementService.java:204) · 호스트 그룹 PUT과 APM PUT 사이에 lost update 경합이 있다. · 두 메서드는 동일 행을 먼저 읽고 한 계열만 객체에서 수정하지만, 엔티티에는 `@DynamicUpdate`·`@Version`이 없고 [Repository](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/host/repository/ReportRetentionSettingRepository.java:6)에도 잠금이 없다. Hibernate 기본 UPDATE는 변경하지 않은 설정 열도 함께 기록한다. 예를 들어 T1과 T2가 같은 초기 행을 읽고 T1이 호스트 그룹을 먼저 커밋한 뒤 T2가 APM을 커밋하면, T2가 들고 있던 과거 호스트 그룹 값으로 T1 변경을 되돌릴 수 있다. 현재 단위 테스트는 같은 객체를 순차 수정하므로 이 경합을 재현하지 않는다. · singleton 행을 `PESSIMISTIC_WRITE`로 읽어 직렬화하거나, 계열별 열만 갱신하는 명시적 UPDATE를 사용한다. `@DynamicUpdate`를 선택한다면 두 실제 트랜잭션을 겹치는 PostgreSQL IT로 회귀를 고정한다.

- R2 · 권장 · [ReportManagementService.java:275](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportManagementService.java:275) · 미래의 세 번째 `ManagedReportSource`가 추가되면 호스트 그룹 보존 정책으로 조용히 분류된다. · 분기는 `kind()==APM`이라는 boolean 하나라 새 `ReportKind`가 추가되어도 컴파일 오류가 나지 않는다. 해당 계열은 호스트 그룹 스위치와 cutoff를 적용받고 `other`로만 합산된다. 또한 [ReportSchedule.java:58](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportSchedule.java:58)의 로그·요약에는 `other`가 없어 `deleted` 합계와 표시된 계열별 수가 달라질 수 있다. 현재 enum은 `HOST_GROUP`, `APM`뿐이므로 즉시 발생하는 결함은 아니다. · `ReportKind`에 대한 exhaustive `switch`로 바꿔 새 enum 추가 시 컴파일 단계에서 정책 선택을 강제하거나, 보존 정책 선택을 `ManagedReportSource` 계약으로 올린다. `other`를 유지한다면 실행 이력에도 표시한다.

- R3 · 권장 · [ReportRetentionApmIT.java:51](/C:/worktrees/report-apm-be/src/test/java/com/dmove/moveseye/report/ReportRetentionApmIT.java:51) · V66의 핵심 업그레이드 동작인 “기존 비기본값 복사”가 테스트되지 않는다. · 현재 IT는 Flyway 적용이 끝난 뒤 `@BeforeEach`에서 양쪽을 52/24로 초기화하며, 스키마 테스트도 새 열의 기본값만 확인한다. 따라서 V65 상태에서 `enabled=false`, `week=30`, `month=12`였던 설치본이 V66 후 동일한 `apm_*` 값을 얻는지는 기존 116건으로 고정되지 않는다. · Flyway를 V65까지만 적용한 DB에 비기본 행을 넣은 뒤 V66으로 migrate하여 세 값의 복사를 검증하는 migration IT를 추가한다.

- R4 · 참고 · [V66__report_retention_setting_apm.sql:3](/C:/worktrees/report-apm-be/src/main/resources/db/migration/V66__report_retention_setting_apm.sql:3) · “IF NOT EXISTS로 멱등”이라는 주석은 재실행 안전성을 과장한다. · DDL은 재실행 가능하지만, 나중에 APM 값을 독립적으로 변경한 뒤 SQL 전체를 수동 재실행하면 `UPDATE`가 APM 값을 호스트 그룹 값으로 다시 덮는다. 다만 정상 Flyway 흐름에서 `repair`는 성공한 versioned migration을 재실행하지 않으며, PostgreSQL에서는 ALTER와 UPDATE가 같은 트랜잭션이므로 현 배포 경로의 차단 문제는 아니다. · “DDL 충돌 방지용 IF NOT EXISTS이며 적용 완료 migration은 재실행하지 않는다”로 설명을 한정한다.

- R5 · 권장 · [ReportSchedule.java:53](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportSchedule.java:53) · 변경된 스케줄러 실행 이력 문자열 형식이 테스트로 고정되지 않았다. · BE에는 이 문자열을 파싱하는 소비자가 없고 `scheduler_run_log.summary`에도 불투명 문자열로 저장되므로 `deleted=` 접두 호환은 현재 유지된다. 그러나 기존 테스트 리포트에는 `ReportScheduleTest`가 없고 `deleted={total} hostGroup={n} apm={n}`을 직접 단언하는 테스트도 없다. · `CleanupResult(5, 3, 0)`에 대해 정확히 `deleted=8 hostGroup=5 apm=3`을 반환하는 단위 테스트를 추가한다.

- R6 · 참고 · [ReportAdminAccess.java:33](/C:/worktrees/report-apm-be/src/main/java/com/dmove/moveseye/report/ReportAdminAccess.java:33) · 보안 헬퍼의 적용 범위 설명이 “6개 EP”로 남아 있다. · 이번에 APM 보존 GET/PUT 두 개가 추가되어 실제 적용 범위는 `ReportManagementController` 6개와 APM 본문 2개, 총 8개다. 런타임 권한 검사는 새 EP에도 올바르게 적용됐다. · 개수와 열거를 8개 기준으로 갱신한다.

## 중점 확인 판정

- 중점 1: **적합** — 행이 없으면 UPDATE 0건이며, PostgreSQL의 같은 트랜잭션 안에서 ADD COLUMN 후 기존 값을 복사하는 순서도 안전하다. `flyway repair`도 성공 migration을 재실행하지 않는다. 다만 업그레이드 값 복사 테스트는 R3처럼 보강이 필요하다.
- 중점 2: **현행 적합·미래 위험** — HOST_GROUP/APM 분기와 합계는 맞고 기존 `deleted=` 접두도 유지된다. 세 번째 계열의 조용한 fallback과 `other` 미표시는 R2로 보강해야 한다.
- 중점 3: **부적합** — 행이 없을 때 첫 APM 저장이 양쪽 기본값을 만드는 동작은 의도대로지만, 두 PUT의 동시 실행은 R1의 lost update를 일으킬 수 있다.
- 중점 8: **부분 충족** — 순차 GET/PUT, 권한·검증, 계열별 cutoff와 독립 스위치는 고정됐다. 동시 PUT, V65→V66 비기본값 복사, 스케줄러 요약 형식은 고정되지 않았다.