# Storage 프로젝트 사용량 귀속 P1 설계서

## 1. 개요 / 영향 범위

Storage 화면은 `information_schema.tables`의 SQL 테이블 크기를 기준으로 전체 사용량과 프로젝트별 추정 사용량을 보여 준다. 현재 `StorageQuery.PROJECT_ROW_COUNTS`에는 일부 프로젝트 소유 테이블만 있어, `project_team`, `project_subscription`, `project_skills`, `gantt_folder_link` 및 프로젝트 삭제 saga 테이블의 사용량이 공통 영역으로 잘못 귀속된다.

P1의 최소 범위는 **SQL Storage 모니터링의 프로젝트 귀속 완전성**이다. 프로젝트 삭제 cascade나 KVS cache 삭제 흐름은 이미 프로젝트 키/predicate로 분리되어 있으므로 이번 변경에서 재구현하지 않는다.

- 백엔드: `src/resolver/storage/StorageQuery.js`의 프로젝트별 행 수 집계 대상 완성, `src/resolver/storage/__test__/StorageService.test.js` 회귀 테스트 보강.
- 프론트: 변경 없음. 기존 `StorageProjectList`와 `useStorageUsage`가 이미 additive `projects`/`unassignedBytes` DTO를 소비한다.
- DB/manifest: 변경 없음. 기존 테이블과 `information_schema`만 조회한다.
- KVS: 변경 없음. `getStorageUsage`는 Forge SQL 테이블 크기 모니터링이며, Forge KVS의 물리 바이트 사용량을 신뢰성 있게 프로젝트별로 조회할 API가 없다. `ProjectProgress:${projectId}`와 `ProjectCost:${projectId}` cache 삭제는 `ProjectDeletionService.cleanupCache`가 이미 명시적으로 처리한다.
- i18n: 변경 없음.

## 2. 조사 결과 및 프로젝트 경계 위험

### 현재 집계/표시 경로

`getStorageUsage` → `findTableStats`(모든 SQL 테이블 추정 바이트) + `findProjectNames` + `findProjectRowCounts` → `computeProjectBreakdown` → `StorageProjectList` 순서다. 테이블별 평균 행 바이트(`dataBytes / rows_est`)에 `project_id`별 행 수를 곱하는 근사 방식이다.

각 `PROJECT_ROW_COUNTS` 쿼리는 독립 실패 격리되어 있어 미배포 migration 테이블이 있더라도 전체 Storage 화면은 유지된다. 따라서 대상 테이블을 추가해도 기존 fallback 계약은 유지된다.

### 누락된 소유 테이블

다음 테이블은 `project_id`가 직접 소유 키인데 현재 `PROJECT_ROW_COUNTS`에 없어 그 바이트가 `unassignedBytes`로 남는다.

| 테이블 | 소유 근거 | 현재 위험 |
|---|---|---|
| `gantt_folder_link` | `project_id`가 복합 PK 일부 | 간트 링크가 많은 프로젝트 사용량 누락 |
| `project_skills` | `(project_id, skill_id)` PK | 요구 스킬 매핑 사용량 누락 |
| `project_team` | `(project_id, team_key)` PK | 팀 배정 사용량 누락 |
| `project_subscription` | `project_id` 및 `idx_subscription_project` | 구독 규칙/동기화 메타데이터 사용량 누락 |
| `project_deletion` | 삭제 saga의 `project_id` PK | 삭제 진행 중인 프로젝트의 operation 메타데이터 누락 |
| `project_deletion_issue` | `(project_id, issue_id)` PK | unlink 대기/차단 이슈 레코드 누락 |

이미 포함된 직접 소유 테이블은 `project`, `projectusers`, `project_dashboard`, `portfolio_project_snapshot`, `gantt_folder`, `gantt_folder_issue`다. SQL DDL에서 비활성 주석 상태인 `worklog_issue_daily`은 실제 migration 대상이 아니므로 P1 대상이 아니다.

KVS에서 발견되는 프로젝트 cache는 key가 `ProjectProgress:${projectId}`, `ProjectCost:${projectId}`로 명확하다. 삭제 시 `ProjectDeletionService.cleanupCache()`가 이를 제거하며, ResourceAnalysis/Worklog cache는 projectId 외 필터 조합 key라 개별 프로젝트 삭제 시 안전한 일괄 삭제 근거가 없다(TTL 만료). 이는 기존 삭제 saga의 의도된 범위이며 Storage 귀속 집계와 혼합하지 않는다.

## 3. 경계면 계약

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `getStorageUsage` | 없음 | `{ success: true, content: { limitBytes, totalBytes, totalRows, usedPercent, tables: [{ name, dataBytes, rows }], projects: [{ projectId, name, estimatedBytes, rows }], unassignedBytes, generatedAt } }` | `useStorageUsage` / `backofficeKeys.storageUsage()` |

이 변경은 resolver 이름, 입력, 권한(`STORAGE_MONITORING`), 응답 필드를 바꾸지 않는다. 누락 테이블이 있던 데이터는 같은 `projects[]` 항목의 `estimatedBytes`/`rows` 증가 및 `unassignedBytes` 감소만 발생한다.

오류 계약도 변경 없다.

- `findTableStats` 실패: `SqlError(ErrorCodes.STORAGE_USAGE_QUERY_FAILED)` → wrapper가 `{ success:false, error }`로 직렬화한다.
- 개별 프로젝트 행 수 쿼리 실패: 해당 테이블을 빈 행 집합으로 취급하고 나머지 집계를 계속한다. 화면 전체 실패로 승격하지 않는다.
- 프로젝트 이름 조회 또는 집계 전체 보조 경로 실패: `{ projects: [], unassignedBytes: totalBytes }` fallback을 유지한다.

## 4. 백엔드 설계

### 수정 파일

1. `src/resolver/storage/StorageQuery.js`
   - `PROJECT_ROW_COUNTS`에 아래 여섯 spec을 추가한다. 모든 쿼리는 `BIN_TO_UUID(project_id) AS project_id, COUNT(*) AS cnt ... GROUP BY project_id` 형태로 기존 BINARY(16) UUID 변환과 일치시킨다.
   - `{ table: 'gantt_folder_link', sql: ... }`
   - `{ table: 'project_skills', sql: ... }`
   - `{ table: 'project_team', sql: ... }`
   - `{ table: 'project_subscription', sql: ... }`
   - `{ table: 'project_deletion', sql: ... }`
   - `{ table: 'project_deletion_issue', sql: ... }`
   - 테이블 문자열은 `TABLE_STATS.name`과 정확히 같아야 평균 행 바이트 매핑이 동작한다.

2. `src/resolver/storage/__test__/StorageService.test.js`
   - 목록 완전성 회귀 테스트를 추가한다. `PROJECT_ROW_COUNTS.map(({ table }) => table)`가 실제 프로젝트 소유 SQL 테이블 12개를 빠짐없이 포함하는지 확인한다.
   - 특히 6개 신규 테이블이 집계 입력으로 주어졌을 때 한 프로젝트의 `estimatedBytes`/`rows`에 합산되고 `unassignedBytes`가 그만큼 감소하는 테스트를 둔다.
   - 개별 쿼리 실패 격리 테스트는 `StorageRepository.findProjectRowCounts`의 기존 동작을 mock해, 한 spec 실패가 다른 spec 결과를 제거하지 않는지 확인한다. Repository 단위 테스트로 분리해도 된다.

`StorageRepository.js`, `StorageService.js`, Controller, `src/index.js`, `PermissionMap.js`은 계약/흐름 변경이 없으므로 수정하지 않는다.

### 삭제/정리 경로 확인 결과

`ProjectDeletionService.cleanupSql`은 `gantt_folder_link`, `project_skills`, `project_team`, `project_subscription`를 project predicate로 삭제하고, saga 자체 테이블은 완료 후 `removeDeletionIssues`/`removeDeletion`로 제거한다. `cleanupCache`도 두 정확한 KVS key를 삭제한다. 따라서 이번 작업에서 cleanup/delete 호출을 추가하면 중복 책임과 saga 재시도 의미만 위험해진다.

## 5. 프론트엔드 설계

수정 없음.

`StorageProjectList`는 DTO의 프로젝트 항목을 표시할 뿐 집계 테이블 목록을 알고 있지 않으므로, API 계약을 유지하는 한 query key, 캐시 무효화, 권한, i18n 변경이 필요 없다. 기존 60초 `staleTime`도 유지한다.

## 6. DB / i18n

- DB migration 없음. 새 열/인덱스/엔티티를 만들지 않는다.
- `manifest.yml` 변경 없음.
- `locales/kr`, `locales/en` 및 생성 locale 변경 없음.

## 7. 구현 체크리스트

### backend

- [ ] `StorageQuery.PROJECT_ROW_COUNTS`에 누락된 6개 SQL 소유 테이블의 `project_id` group count spec 추가.
- [ ] BINARY UUID 테이블 전체에 `BIN_TO_UUID(project_id)`를 사용하고 spec `table` 이름을 `information_schema` 이름과 일치시킴.
- [ ] 프로젝트 소유 테이블 12개 목록 회귀 테스트 추가.
- [ ] 신규 spec의 계산 합산과 공통 영역 감소 테스트 추가.
- [ ] 단일 spec 실패가 전체 `getStorageUsage` fallback으로 번지지 않는지 테스트.
- [ ] `npm test -- --runInBand -- src/resolver/storage/__test__/StorageService.test.js` 실행.

### frontend

- [ ] 작업 없음. 기존 DTO 소비 회귀 여부만 backend 테스트 및 필요 시 기존 frontend smoke/build에서 확인.

## 8. 비목표와 후속 판단

- Forge KVS 물리 용량의 프로젝트별 비율 계산은 비목표다. key prefix/payload를 임의 스캔하면 목록 상한·TTL·다중 filter key 때문에 잘못된 비용을 표시하거나 삭제 범위를 넓힐 수 있다.
- 향후 실제 KVS 사용량 표시가 필요하면 별도 RFC로, write 시점의 명시적 projectId ledger와 TTL/삭제 saga 동기화를 설계해야 한다. 현 P1의 SQL 추정치에 KVS 수치를 섞지 않는다.
