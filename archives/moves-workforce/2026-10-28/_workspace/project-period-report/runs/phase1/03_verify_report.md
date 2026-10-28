# Phase 1 독립 코드 검증

검증 범위: DESIGN.md §2.1~2.5 및 §5. 앱 소스와 테스트는 수정하지 않았다. 리더가 루트 테스트를 실행하므로 중복 실행하지 않았다.

## 통과: 정적 계약 확인

- `src/rdb/schema/ddl/projectPeriodSnapshot.sql.js`: 설계의 스칼라 컬럼과 복합 PK만 정의한다. 보조 인덱스, JSON, 인력·워크로그 원장, 급여 컬럼이 없다. `ddl/index.js` export와 `migrate.js:71`의 v024 신규 단계가 연결된다.
- `src/resolver/projectPeriodReport/periodKeys.js`: KST 날짜와 ISO 주를 순수 함수로 계산한다. 종료 프로젝트는 종료 주·월이 닫힌 경우만 선택하고 40일을 초과하면 제외한다.
- `src/resolver/portfolioDashboard/PortfolioAggregator.js:602`: allSettled 성공 결과만 메모리에서 캡처한다. 기존 활성 프로젝트만 live upsert와 전사 rollup에 포함한다. 유예 선정 및 캡처·purge 실패는 기존 배치 로그 관례로 격리한다.
- `src/resolver/project/ProjectRepository.js:242`: 별도 유예 조회가 종료 후 40일·미캡처 종료 주/월·deletion_state ACTIVE를 조건으로 사용한다. 기존 getActiveProjectsRepository의 계약과 소비자는 그대로 유지된다.
- `src/resolver/projectPeriodReport/ProjectPeriodSnapshotRepository.js`: SELECT 후 INSERT, 명시적인 duplicate-key 코드만 ALREADY_CAPTURED 처리, rowsAffected 사용, 해당 기간 공수 하나만 저장한다. 최신 N개를 읽고 오름차순으로 반환한다. 보존 경계 미만을 DELETE한다.
- `src/resolver/projectPeriodReport/ProjectPeriodReportService.js`: 모든 캡처 INSERT 완료 뒤 purge를 수행한다. 캡처 예외 및 미준비는 purge를 막는다. 읽기의 UUID·periodType·양의 정수 limit 검증과 W 26/M 24 상한이 있다.
- `src/resolver/projectPeriodReport/ProjectPeriodReportController.js`, `src/permission/PermissionMap.js:259`, `src/index.js:79`: guardedDefine, REPORT/detail, CONTROLLER_REGISTRARS 등록이 일치한다. 실제 permissionGuard가 MEMBER_ONLY/TEAM_ONLY 프로젝트 범위를 검사한다. 읽기 결과에 개인 명부·급여·비용 데이터는 없다.
- `src/resolver/project/ProjectService.js:138`, `src/resolver/project/ProjectDeletionService.js:102`: 부모 프로젝트 DELETE 전에 기간 스냅샷 DELETE를 호출한다. 신규 transaction/cascade/KVS 저장은 없다.
- 테스트 소스에 ISO 연말·KST 자정·월 경계·40일 경계·중복·purge 순서·일반 SQL 오류 전파·권한 거부·유예와 live 분리 시나리오가 존재한다. 이는 실행 통과 주장이 아니다.

## 발견한 결함: 수정 후 통과

초기 검토 시 `ProjectPeriodSnapshotRepository.js`의 deleteProjectPeriodSnapshots가 withTable을 사용했다. TableReadiness의 false는 실제 테이블 부재뿐 아니라 프로브 장애도 포함한다. 이때 삭제는 null을 반환하고 saga는 이를 DONE으로 기록한 뒤 부모를 삭제하므로, 실제 테이블이 있는 상태의 일시 프로브 장애에서 이력이 고아로 남을 수 있다. 리더에게 DELETE를 직접 실행하고 명확한 missing-table 오류만 흡수하는 방식으로 수정 요청을 전달했다. 최종 수정 여부는 아래 후속 기록으로 판정한다.

후속 소스를 재확인했다. 삭제 함수는 이제 직접 DELETE하며 isMissingTableError에 해당하는 오류만 null로 처리하고 나머지 오류는 전파한다. 프로브 false/연결 실패 전파 및 실제 테이블 부재 skip 회귀 테스트도 추가됐다. 따라서 확인한 결함은 해결됐으며 추가 결함은 발견하지 않았다.

리더 전달 검증 증거: 신규 및 삭제 관련 targeted 6 suites/53 tests 통과. 최초 전체 실행의 기존 saga 테스트 실패는 신규 의존성 mock 누락이 원인이었고 mock 1줄과 삭제 실패/재시도 검증을 추가해 해결했다. 최종 full test는 리더 실행 중이다.

## 설계 구체화와 차이

- 종료 유예 프로젝트는 집계·기간 이력만 갱신한다. 기존 활성 프로젝트 기반 live/rollup에 섞으면 전사 대시보드 범위가 바뀌므로 분리한 결정이 타당하다.
- live SQL의 aggregated_at을 다시 SELECT하지 않고 집계 완료 시 sourceAggregatedAt을 메모리 결과에 추가한다. 기존 live 저장소는 이 추가 필드를 소비하지 않으며 반환 계약 변경 영향은 없다.
- INSERT SELECT의 project.deletion_state ACTIVE 조건은 삭제 중·삭제 완료 프로젝트의 이력 재생성을 줄이는 기존 삭제 구조에 맞춘 보완이다.
- getActiveProjectsRepository의 기존 CURDATE와 집계 today UTC는 유지하며 신규 기간 키/유예 기준만 KST를 사용한다.

## 미검증과 남은 제한

- 루트 npm test, permissionMap.contract.test.js 실행 결과는 리더의 실행 증거로 최종 보완해야 한다. 이 검증자는 테스트를 실행하지 않았다.
- 실제 Forge SQL에서 v024 마이그레이션, DATE_FORMAT ISO 주, INSERT SELECT와 중복 오류 코드, 실제 invoke는 실행하지 않았다.
- 최초 git diff --stat 명령은 `Not a git repository`를 반환했다. 이후 `git -c safe.directory=C:/CloudJira/moves-workforce diff -- <대상 파일>` 명령은 종료 코드 0으로 성공했다. src/index.js는 import와 배열 등록 추가만, PermissionMap.js는 신규 resolver 1줄 추가와 기존 personAnalysis 추가 diff가 함께 남아 있음을 확인했다. 시작 전 전체 기준선과의 바이트 보존 비교는 리더 증거가 필요하다. 읽기 명령도 종료 코드 0이었다.
- frontend와 Phase 2·3은 이번 기능의 구현·검증 범위가 아니다. 배포·설치·커밋은 수행하지 않았다.

- 최종 실행 확인: npm.cmd test -- --runInBand, 119 suites / 1,598 tests PASS, exit 0.
- Forge lint: 네트워크 제한 환경에서는 EACCES, 재실행은 exit 0 / No issues found. 단 PermissionLinter가 Unknown product로 일부 검사를 수행하지 못했다는 경고가 있어 해당 검사 범위는 미검증.
