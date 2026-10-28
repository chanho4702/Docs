# SQL 자식 재생성 방지 구현 보고서

## 변경

설계 §9의 12개 INSERT/UPSERT가 동일 SQL 문 안에서 실제 parent project의 `deletion_state = 'ACTIVE'`를 확인한다. 삭제 중이거나 이미 삭제된 프로젝트의 child row는 생성되지 않는다. snapshot의 `spaces_json` 포함/미포함 두 경로도 모두 적용했다.

- `src/rdb/query/ActiveProjectWrite.js`: Query 상수로부터 derived SELECT를 만든다. 사용자 값은 바인딩하며 기존 인자 순서를 유지한다. 명시적 WHERE 뒤에 ON DUPLICATE를 두어 parser ambiguity를 피한다.
- Query 변경: `ProjectUsersQuery`, `ProjectTeamQuery`, `ProjectSubscriptionQuery`, `ProjectDashboard`, `GanttFolderQuery`, `SkillMappingQuery`, `PortfolioSnapshotQuery`.
- `src/rdb/ActiveProjectWrite.js`: 영향 행 수가 0일 때만 parent를 추가 확인한다. ACTIVE duplicate-no-op은 그대로 성공하고, DELETING/부재는 `LogicalError('PROJECT_DELETING', ...)`로 전파한다. 서로 다른 project를 포함한 layout bulk는 일부 성공한 경우에도 모든 parent를 확인한다.
- Repository 변경: `projectIssue/ProjectUsersRepository`, `projectTeam/ProjectTeamRepository`, `projectSubscription/ProjectSubscriptionRepository`, `projectDashboard/ProjectDashboardRepository`, `gantt/GanttFolderRepository`.
- `resourceManagement/ResourceManagementService`의 project skills INSERT에도 같은 0행 검증을 적용했다.
- projectusers의 기존 함수 인자는 유지하고 Repository 내부에서 parent EXISTS용 projectId 바인딩을 5번째에 추가했다.
- dashboard 저장은 `executeQuery`의 `rowsAffected` alias를 사용한다. 변경한 저장 경로의 console.error는 제거하고 오류를 전파한다.

## 계약

신규 resolver/PermissionMap/CONTROLLER_REGISTRARS 변경 없음. 기존 쓰기 resolver 등록과 호출 권한은 그대로다. 이 변경은 호출 권한과 별개로 SQL row 생성 시 project 생존 여부를 강제한다. 급여/인력 DTO나 principal 범위를 변경하지 않는다.

성공 반환은 기존 Repository result 또는 기존 Service DTO를 유지한다. 차단된 사용자 쓰기는 기존 guardedDefine/responseWrapper를 통해 `{success:false,error:{name:'LogicalError',code:'PROJECT_DELETING',message,...}}`로 전파한다. subscription INSERT 0행 차단 시 Service로 성공 반환하지 않으므로 saved/draft 응답과 backfill enqueue로 진행하지 않는다. snapshot 배치는 비활성 parent에서 0행 skip을 허용한다.

스키마, manifest, Forge scope 변경 없음. 커밋/배포/설치 없음.

## 검증

`npm test -- --runInBand ActiveProjectWrite ChartFilterPersistence PortfolioSpacesPersistence ProjectTeamRepository PortfolioSnapshotSalaryPolicy GanttFolderService`

**6 suites / 110 tests 통과.** `git diff --check` 변경 범위 통과.

새 테스트는 12개 SQL의 parent predicate/placeholder 수, 실제 projectusers·subscription·layout Repository 인자 연결, DELETING/부재 차단, ACTIVE duplicate-no-op, 정상 쓰기 추가 SELECT 미발행, 여러 project layout의 부분 저장 오류 전파를 확인한다. 기존 snapshot 컬럼 fallback/바인딩 회귀도 통과했다. 전체 backend/frontend/CI build/forge lint는 리더가 통합 검증한다.

## 한계

실제 Forge TiDB에서 SQL 실행/동시 transaction commit 순서는 검증하지 않았다. 이 조건은 DELETING이 보이는 시점 이후 statement의 신규 row 생성을 막으며, 이미 실행 중인 transaction과 삭제의 완전한 직렬화는 보장하지 않는다. Jira/비SQL 캐시의 지연 쓰기는 본 작업 범위가 아니다. DELETE/UPDATE-only 경로는 신규 child row를 생성하지 않아 수정하지 않았다.
