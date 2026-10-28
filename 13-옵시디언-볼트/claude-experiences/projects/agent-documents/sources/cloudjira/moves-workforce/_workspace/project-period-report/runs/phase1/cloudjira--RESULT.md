# Phase 1 구현 결과

Phase 1만 구현. Phase 2·3 및 §5의 원장 저장·추가 페처·캐시·프론트 변경 없음. 커밋·배포 없음.

## 변경 파일

- `src/index.js`
- `src/permission/PermissionMap.js`
- `src/rdb/schema/ddl/index.js`
- `src/rdb/schema/migrate.js`
- `src/resolver/portfolioDashboard/PortfolioAggregator.js`
- `src/resolver/project/ProjectDeletionService.js`
- `src/resolver/project/ProjectRepository.js`
- `src/resolver/project/ProjectService.js`
- `src/resolver/project/__test__/ProjectDeletionService.test.js`
- `src/rdb/query/ProjectPeriodSnapshotQuery.js`
- `src/rdb/schema/ddl/projectPeriodSnapshot.sql.js`
- `src/resolver/portfolioDashboard/__test__/PortfolioPeriodCapture.test.js`
- `src/resolver/projectPeriodReport/ProjectPeriodReportController.js`
- `src/resolver/projectPeriodReport/ProjectPeriodReportService.js`
- `src/resolver/projectPeriodReport/ProjectPeriodSnapshotRepository.js`
- `src/resolver/projectPeriodReport/__test__/PeriodCaptureProjects.test.js`
- `src/resolver/projectPeriodReport/__test__/ProjectPeriodReportController.test.js`
- `src/resolver/projectPeriodReport/__test__/ProjectPeriodReportService.test.js`
- `src/resolver/projectPeriodReport/__test__/ProjectPeriodSnapshotRepository.test.js`
- `src/resolver/projectPeriodReport/__test__/periodKeys.test.js`
- `src/resolver/projectPeriodReport/periodKeys.js`

별도 작업 보고서: `_workspace/project-period-report/02_backend_report.md`, `runs/phase1/00_status.md`, `runs/phase1/03_verify_report.md`, 이 보고서. 검증 로그와 기존 변경 비교용 baseline.json도 같은 runs 디렉터리에 보관했다.

## 설계서와 실제 코드에 맞춘 결정

- 종료 유예 프로젝트는 종료일이 속한 주·월을 캡처한다. 재시도가 늦어도 직전 주로 바뀌어 종료 주 이력을 잃지 않도록 했다. 기존 활성 프로젝트 조회·live upsert·전사 rollup은 그대로 유지하고 유예 프로젝트는 기간 캡처만 수행한다.
- 기존 live 테이블의 aggregated_at은 SQL 저장 시각이다. sourceAggregatedAt은 메모리 집계가 완료된 시각으로 추가해 저장한다. live 행을 재조회하지 않으므로 두 시각이 정확히 같지는 않다.
- 기존 TableReadiness는 테이블 미존재·프로브 실패에 오류 로그를 남긴다. 공용 동작을 보존하며 캡처·읽기는 skip/unavailable 처리했다. 삭제는 프로브 실패를 삭제 완료로 오인하지 않도록 실제 DELETE를 실행하고 테이블 부재 오류만 흡수한다.
- INSERT는 부모 project가 ACTIVE일 때만 SELECT하도록 하여 삭제 중이거나 삭제된 부모에 새 이력이 생기는 것을 제한한다. 기존 키는 SELECT 및 duplicate-key 코드 판정으로 ALREADY_CAPTURED no-op이며 덮어쓰지 않는다.
- 다른 세션이 수정 중인 ErrorCodes.js를 보존하기 위해 신규 검증 오류 PROJECT_PERIOD_*는 LogicalError에 직접 전달한다.

## 검증

- 변경 전 루트: 113 suites / 1,549 tests 통과.
- 최종 루트: 119 suites / 1,598 tests 통과. PermissionMap 계약 포함.
- 기존 테스트 수정은 `ProjectDeletionService.test.js`뿐이다. 새 삭제 repository 의존성의 mock을 추가하고, 해당 삭제 실패가 부모 삭제를 막으며 재시도로 복구되는지 검증했다. 기존 단언은 완화하지 않았다.
- 기존 보호 파일은 baseline과 바이트 단위 일치. PermissionMap 기존 변경은 보존하고 1줄 추가, src/index에는 import·등록 배열 2줄만 추가.
- git diff --check 통과.
- frontend 테스트·빌드·i18n merge는 실행하지 않았다. 이번 범위가 backend Phase 1이고 build의 prebuild가 보호된 locales를 생성하기 때문이다.

## 남은 우려

- 실제 Forge SQL migration/배치 실행은 미검증. v024 migration 적용 전에는 캡처·읽기 사용 불가이며 unavailable로 처리한다.
- 스냅샷은 기간 종료 시점의 상태를 복원한 값이 아니라 닫힌 뒤 첫 성공 집계의 관측값이다. 실제 sourceAggregatedAt/capturedAt을 함께 해석해야 한다.
- 트랜잭션과 cascade가 없어 직접 삭제와 동시에 시작한 캡처의 모든 경합을 원자적으로 막지는 못한다. saga의 DELETING 상태와 신규 INSERT ACTIVE 조건으로 범위를 제한한다.

- 최종 실행 확인: npm.cmd test -- --runInBand, 119 suites / 1,598 tests PASS, exit 0.
- Forge lint: 네트워크 제한 환경에서는 EACCES, 재실행은 exit 0 / No issues found. 단 PermissionLinter가 Unknown product로 일부 검사를 수행하지 못했다는 경고가 있어 해당 검사 범위는 미검증.

경험 기록: AGENTS.md 지침에 따라 C:/Users/DMOVE/Codex-experiences/projects/moves-workforce-period-snapshot-phase1-2026-09-07.md 신규 작성 및 같은 Vault INDEX.md에 연결 한 줄 추가.
