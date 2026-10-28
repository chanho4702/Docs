# Storage 프로젝트 사용량 귀속 P1 — 통합 검증

검증일: 2026-09-01

## 통과

### 1. SQL 소유 테이블 ↔ 집계 spec

- 생산자: `src/resolver/storage/StorageQuery.js`의 `PROJECT_ROW_COUNTS`
- 근거 DDL: `src/rdb/schema/ddl/{project,ganttFolder,skillMapping,projectTeam,projectSubscription,portfolioSnapshot}.sql.js`
- 결과: 직접 소유 BINARY(16) `project_id` 테이블 12개가 모두 정확히 포함됩니다.
  - 기존 6개: `project`, `projectusers`, `project_dashboard`, `portfolio_project_snapshot`, `gantt_folder`, `gantt_folder_issue`
  - 추가 6개: `gantt_folder_link`, `project_skills`, `project_team`, `project_subscription`, `project_deletion`, `project_deletion_issue`
- 모든 spec은 `BIN_TO_UUID(project_id) AS project_id`, `COUNT(*) AS cnt`, `GROUP BY project_id`를 사용합니다. 따라서 `PROJECT_NAMES`의 문자열 UUID와 집계 키의 형식이 일치합니다.
- `worklog_issue_daily`은 주석 처리된 미배포 DDL이므로 대상 테이블이 아닙니다.

### 2. Repository/Service 집계 ↔ DTO

- 생산자: `StorageRepository.findProjectRowCounts()` → `StorageService.computeProjectBreakdown()` → `getStorageUsageService()`
- 소비자: `static/ui/src/backoffice/page/storage/useStorageUsage.js`, `StorageProjectList.jsx`
- 결과: 테이블별 평균 행 크기와 row count가 `projects[].estimatedBytes`/`rows`로 합산되고, 합계만큼 `unassignedBytes`가 감소합니다.
- 프로젝트별 보조 조회 또는 개별 집계 실패 시 빈 결과로 격리되고, 전체 Storage DTO는 `projects: []`, `unassignedBytes: totalBytes` fallback으로 유지됩니다. 기존 `{ success, content }` 및 `tables`, `projects`, `unassignedBytes` 계약은 변하지 않았습니다.

### 3. Resolver 등록·권한 ↔ 프론트 호출

- 생산자: `src/index.js`의 `registerStorageController`, `StorageController.js`의 `guardedDefine('getStorageUsage', ...)`, `PermissionMap.js`의 `R('STORAGE_MONITORING')`
- 소비자: `useStorageUsage()`의 `invoke('getStorageUsage')`, `StoragePage.jsx`의 `canRead('STORAGE_MONITORING')`, `backofficeKeys.storageUsage()`
- 결과: resolver 이름, 응답 unwrap(`res.content`), Query key, backend permission이 모두 일치합니다.

### 4. 집중 검증

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand src/resolver/storage/__test__/StorageService.test.js src/resolver/storage/__test__/StorageQuery.test.js` | 통과, 2 suites / 17 tests |
| `npm test -- --runInBand test/permission/permissionMap.contract.test.js` | 통과, 1 suite / 24 tests |
| 대상 파일 `git diff --check` | 오류 없음 |

`StorageService.test.js`의 fallback 시나리오가 의도적으로 `console.error`를 출력하지만, 테스트는 통과했습니다.

## 실패

없음.

## 미검증

- Forge 실제 `information_schema.tables`의 통계값 및 운영 데이터로 한 실제 화면 검증은 실행하지 않았습니다.
- 프론트 전체 build는 이번 SQL 상수·backend 테스트 범위에서 실행하지 않았습니다. 프론트 소스·i18n·query key 변경은 없습니다.

## 작업트리 주의

- 검증 중 `README.md`, `locales/en-US.json`, `locales/ko-KR.json`의 기존/병행 변경을 발견했으나 수정하거나 되돌리지 않았습니다.
