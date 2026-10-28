# 기능 감사 진행 보고서

기준: 2026-08-26

## 실패

### P0 — 제한된 프로젝트 범위를 우회하는 자식 리소스 변경

- `src/permission/permissionGuard.js:38-50`은 `inherited` resolver의 프로젝트 범위를 payload의 `projectId` 또는 `project_id`에서만 확인한다. 둘 다 없으면 `MEMBER_ONLY` 및 `TEAM_ONLY` 범위 검증이 실행되지 않는다.
- `updateProjectMemberSalary`는 `PROJECT_COST` write를 요구하지만, 프런트는 `project_member_id`와 변경 값만 전달한다(`static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx:206-209`, `:246-249`). 서비스와 SQL도 `project_member_id`만으로 수정한다(`src/resolver/projectIssue/ProjectUsersService.js:234-262`, `src/rdb/query/ProjectUsersQuery.js:112-119`). 따라서 제한 범위 권한을 가진 사용자가 다른 프로젝트의 멤버 ID를 알면 그 프로젝트의 급여 또는 계산 모드를 변경할 수 있다.
- 같은 패턴은 다음 `PROJECT` write resolver에도 있다: `deleteProjectUsersByKey`, `updateProjectUsersByKey`, `deleteProjectIssue`, `updateIssueCoworkers`, `recordIssueAssignedDate`. 이들의 현재 호출 payload에는 프로젝트 ID가 없고, 대상 멤버/이슈 ID만 있다.

권장 수정: 모든 변경 요청에 신뢰하지 않는 `projectId`를 추가하는 것만으로 끝내지 말고, 백엔드에서 자식 ID/issue ID로 실제 프로젝트를 조회한 뒤 `assertProjectInScope` 성격의 공용 검증을 수행한다. SQL DML도 가능하면 `WHERE ... AND project_id = UUID_TO_BIN(?)`로 범위를 함께 고정한다. 이후 MEMBER_ONLY/TEAM_ONLY의 타 프로젝트 ID 공격을 재현하는 회귀 테스트를 추가한다.

## 통과

- 프런트 `invoke()` 정적 추출 148개는 모두 `guardedDefine`로 등록된 resolver에 대응했다.
- 백엔드 `test/permission/permissionMap.contract.test.js`와 `PortfolioSpaceRollup.test.js`가 통과했다.
- 간트: 모든 mutation이 `projectId`를 전달하며, 이슈와 폴더를 실제 프로젝트 소속으로 재검증한다. Jira 이슈 필드/링크 변경은 `asUser()` 기본 경로를 사용한다.
- 프로젝트 구독: CRUD·미리보기·수동 동기화에 `projectId`가 필수이고, 구독 소유 프로젝트 일치와 소스 접근 권한(`asUser`)을 교차 확인한다. 프런트 소비도 `result.success`와 `result.content` 계약을 지킨다.
- 포트폴리오·프로젝트 대시보드·리소스 관리: `principal`을 서비스까지 전달하고, 프로젝트 목록은 `scopedProjectIds`, 인력 목록은 `resolveTeamAnalyticsScope`로 범위를 축소한다. 포트폴리오의 급여·원가 계열 필드는 `CostAccess` 결과에 따라 제거된다.
- 개인 업무·워크로그·진척도·분석 리포트: SELF resolver는 호출자의 `context.accountId`로 덮어쓴다. 개인 캘린더 워크로그는 작성자 ID를 다시 필터링하며, 이슈 워크로그 상세는 payload가 아닌 실제 이슈 소속 프로젝트로 제한 범위를 검증한다. 프로젝트 단위 분석은 `projectId` detail scope를 사용한다.

## 미검증

- 프런트 CI 빌드는 `static/ui/build/asset-manifest.json`을 생성했다. 다만 이 감사 단계에서는 기능별 브라우저 시나리오를 아직 실행하지 않았다.
- 기능별 DTO shape, Jira API 호출 권한(`asUser()`), KVS 페이지네이션, 조회 범위 마스킹은 다음 단계에서 기능군별로 검토한다.
