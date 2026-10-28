# Phase 1 백엔드 구현

구현 범위는 DESIGN.md §2.1~2.4이며 Phase 2·3은 구현하지 않았다. 테스트와 최종 검증 결과는 리더가 수행한 결과를 따른다.

## 등록 및 응답

- resolver: `getProjectPeriodSnapshots({ projectId, periodType, limit })`
- Controller: `registerProjectPeriodReportController`, `guardedDefine` 사용. `src/index.js`의 `CONTROLLER_REGISTRARS`에 추가.
- PermissionMap: `R('REPORT', 'detail')`. 프로젝트 범위는 기존 가드에서 검사하고 서비스는 UUID projectId를 필수 검증한다.
- 성공: `{ success: true, rows: [...] }`. 최신 N개를 골라 periodKey 오름차순으로 반환한다.
- 테이블 미준비: `{ success: true, rows: [], unavailable: true }`.
- 실패: 기존 가드의 `{ success: false, error: { name, code, message, cause } }`. 입력 오류는 `LogicalError`와 `PROJECT_PERIOD_PROJECT_ID_INVALID`, `PROJECT_PERIOD_TYPE_INVALID`, `PROJECT_PERIOD_LIMIT_INVALID` 코드 사용.
- 집계 서비스는 `captureProjectPeriodSnapshots(results, now)`에 이번 실행에서 성공한 메모리 결과 `[{ snapshot, ... }]`만 전달한다. 캡처 예외는 배치에서 로그 후 흡수한다.

## 결정 및 설계와의 차이

- 종료 프로젝트 조회는 기존 active 조회와 분리한 `getPeriodCaptureProjectsRepository`로 추가한다. SQL ISO 주 형식 `%x-W%v`를 사용하고 조회 기준일 및 닫힌 기간 키는 KST로 전달한다. 종료 40일 이내이면서 종료일 소속 W 또는 M이 닫혔고 미캡처인 프로젝트만 추가한다.
- 유예 프로젝트는 기간 캡처만 수행한다. 기존 live 및 전사 rollup에는 active 프로젝트의 성공 결과만 사용해 기존 지표 의미를 유지한다. active가 없고 유예 프로젝트만 있을 때에도 기존 EMPTY 및 빈 rollup을 유지한다.
- 종료일 소속 기간이 직전 닫힌 기간보다 오래되었어도 40일 내에는 종료일 소속 키를 채운다. 종료 후 임의의 다른 주·월 키를 추가하지 않는다.
- `sourceAggregatedAt`은 각 `aggregateOneProject`가 메모리 snapshot 조립을 마친 시각이다. 기존 live의 `aggregated_at`은 DB 갱신 시각이므로 값이 정확히 같다고 보장하지 않는다. live SELECT 없이 실제 집계 결과 생성 시각을 기록한다.
- INSERT는 `INSERT SELECT ... FROM project ... deletion_state = ACTIVE`로 부모 존재 및 삭제 상태를 함께 확인한다. 과거 값 수정은 없고 PK duplicate code만 ALREADY_CAPTURED로 처리한다.
- TableReadiness의 기존 미준비 로그 관례는 유지한다. 기능은 skip하지만 기존 공용 프로브가 console.error를 남기므로 설계의 완전 무로그 skip과는 다르다.
- 다른 세션이 수정 중인 ErrorCodes.js는 건드리지 않고 신규 입력 오류 코드를 서비스에서 사용했다.
- 트랜잭션이나 cascade는 사용하지 않는다. 두 삭제 경로 모두 부모 삭제 전에 멱등 DELETE를 추가했다. 삭제는 readiness 프로브 장애가 부모 삭제를 허용하지 않도록 직접 DELETE하고 실제 테이블 부재 오류만 skip한다.

## 수정 파일

- src/rdb/schema/ddl/projectPeriodSnapshot.sql.js
- src/rdb/schema/ddl/index.js
- src/rdb/schema/migrate.js
- src/rdb/query/ProjectPeriodSnapshotQuery.js
- src/resolver/projectPeriodReport/periodKeys.js
- src/resolver/projectPeriodReport/ProjectPeriodSnapshotRepository.js
- src/resolver/projectPeriodReport/ProjectPeriodReportService.js
- src/resolver/projectPeriodReport/ProjectPeriodReportController.js
- src/resolver/portfolioDashboard/PortfolioAggregator.js
- src/resolver/project/ProjectRepository.js
- src/resolver/project/ProjectService.js
- src/resolver/project/ProjectDeletionService.js
- src/permission/PermissionMap.js (추가만)
- src/index.js (추가만)

## 검증 및 한계

- 변경 전 루트 113 suites / 1549 tests PASS를 리더가 확인했다.
- 변경 후 테스트 및 Forge lint 결과는 최종 검증 보고에 기록한다.
- 실 Forge SQL migration 및 실행은 로컬 mock 테스트로 대체할 수 없으며 배포/설치는 수행하지 않았다.
- Forge SQL 트랜잭션 부재로 집계 INSERT와 프로젝트 삭제의 모든 동시 실행 순서를 원자적으로 보장하지는 않는다.

- 최종 실행 확인: npm.cmd test -- --runInBand, 119 suites / 1,598 tests PASS, exit 0.
- Forge lint: 네트워크 제한 환경에서는 EACCES, 재실행은 exit 0 / No issues found. 단 PermissionLinter가 Unknown product로 일부 검사를 수행하지 못했다는 경고가 있어 해당 검사 범위는 미검증.
