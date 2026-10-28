# 프로젝트 삭제 안정성 보완 설계

## 1. 목적·완료 조건·범위와 미확정 사항

입력은 `00_input/requirement.md`와 리더가 전달한 네 가지 결함이다. HEAD `7e9abefddea4f50098db4e4024914b7ef7201e62` 위 기존 미커밋 변경을 유지한다. 설계 담당은 이 파일만 소유하며 앱 소스를 수정하지 않는다.

완료 조건은 정상 pagination, 이동 이슈 메타데이터 보존, discovery와 SQL 정리의 중단·재개, 멤버십 제거 이후 최초 요청자의 제한적 재시도, 성공 응답 유실 후 멱등 재호출이다. 같은 경로의 fail-open과 시간 예산 누락도 보완한다. 커밋·배포·설치는 범위 밖이다.

외부 Jira 변경과 app SQL 사이 원자성은 제공되지 않는다. mutation 직전 직접 조회는 발견 이후 이동을 방어하지만 조회 직후 외부 변경까지 완전히 막는 CAS가 아니다. Jira 검색 인덱스 지연과 삭제 직전 이미 시작된 연결 쓰기의 경합은 남은 위험으로 명시한다.

## 2. 조사 근거와 재사용 대상

| 근거 | 현재 계약과 재사용 이유 |
| --- | --- |
| `src/api/jira/issue/IssueApi.js:540` `listProjectDeletionIssuesAsApp` | `{issueIds,nextPageToken}` 반환. route 전체 suffix 보간을 고쳐 API 계약 유지 |
| `src/api/jira/issue/IssueApi.js:567` `probeProjectDeletionIssueAsApp` | 직접 GET 결과를 현재 연결/빈 값/다른 프로젝트/404로 구분. 검색 결과는 현재 소속의 확정 근거가 아님 |
| `src/resolver/project/ProjectDeletionService.js:52` `discover` | 현재 매번 cursor=null부터 무제한 진행. 영속 cursor와 deadline 추가 |
| `src/resolver/project/ProjectDeletionService.js:112` `cleanupSql` | 이미 존재하는 SQL 단계 체크포인트를 읽고 재사용 |
| `src/resolver/project/ProjectDeletionQuery.js:3` `FIND` | DB에 존재하는 `requested_by`를 내부 조회에 추가해야 소속 소실 후 요청자 판정 가능 |
| `src/rdb/schema/ddl/project.sql.js:60` | `steps_json JSON`, `requested_by`, 상태·lease가 이미 있어 신규 schema 불필요. deletion 테이블은 project FK 없음 |
| `src/permission/permissionGuard.js:37` `enforceProjectScope` | 현재 PROJECT grant 통과 뒤 멤버십 검사. 두 삭제 resolver만 한정된 재시도 예외 필요 |
| `src/permission/PrincipalResolver.js:460` `scopedProjectIds` | MEMBER_ONLY/TEAM_ONLY 범위 단일 출처 재사용 |
| `src/resolver/project/ProjectController.js:21` | 기존 `guardedDefine` 삭제·상태 두 경로. 상태 조회도 principal 전달 필요 |
| `src/index.js:55` `CONTROLLER_REGISTRARS` | `registerProjectController` 이미 등록. 신규 resolver 없음 |
| `src/resolver/project/ProjectDeletionRepository.js:27` | `assertProjectAcceptsIssueMetadata`는 프로젝트 부재도 허용하는 오류가 있어 존재 확인 추가 |
| `static/ui/src/utils/queryKey/projectKeys.js:32` | `invalidateProjectViews`가 목록·칸반·상단 KPI를 함께 갱신 |

기존 삭제 saga 관련 경험 노트의 재시도 장벽, duplicate-safe INSERT, 상태 DTO 계약을 유지한다. 실제 manifest runtime은 `nodejs22.x`이고 이번 변경에서 수정하지 않는다.

## 3. resolver 경계면 계약

| resolver | 입력·권한 | 성공·실패 | 소비자 |
| --- | --- | --- | --- |
| `deleteProject` | `{project_id:string}` 필수. PROJECT.write + 정상 프로젝트 범위 또는 동일 작업 최초 요청자 | 기존 `content.deletion` 유지. 진행·차단·실패는 success=true 상태 DTO, 권한·대상 오류는 표준 success=false | ProjectList, useKanbanMutations; 자동 continuation 유지 |
| `getProjectDeletionStatus` | 동일 입력. PROJECT.read + 정상 프로젝트 범위, 또는 현재 PROJECT.write도 보유한 동일 작업 최초 요청자 | 존재하는 완료 작업도 조회 가능. 없는 작업은 PROJECT_DELETION_NOT_FOUND | 기존 직접 invoke 소비자, 향후 재개 UI |

성공 예시: `{success:true,content:{deletion:{projectId:"uuid",status:"COMPLETED",stage:"DONE",completed:true,retryable:false,blockedIssueCount:0,attempt:2,issueCounts:{discovered:0,pending:0,unlinked:0,inaccessible:0,failed:0},sqlSteps:{project:"DONE"},lastError:null,updatedAt:"..."}}}`. 예시 sqlSteps는 축약이며 실제는 기존 열 개 키를 유지한다. 완료 이슈 상세 행을 제거하면 issueCounts는 현재 보존된 행 기준 0이고 과거 처리 총량을 뜻하지 않는다.

실패 예시: `{success:false,error:{name:"ProjectScopeError",code:"PERMISSION_PROJECT_SCOPE_DENIED",message:"...",cause:""}}`. `requested_by`, cursor, lease_token, Jira issue id 목록은 DTO에 노출하지 않는다. `completed`는 COMPLETED일 때만 true. COMPLETED_WITH_WARNINGS는 캐시 정리를 재시도할 수 있도록 completed=false/retryable=true를 유지한다.

## 4. 권한 행렬과 데이터 범위

| 조건 | 시작 | 진행·상태 조회 |
| --- | --- | --- |
| Admin 또는 PROJECT 권한과 정상 project scope | 허용 | 허용 |
| MEMBER_ONLY/TEAM_ONLY, projectusers 삭제 이후 | 새 작업은 거부 | 현재 PROJECT.write를 계속 보유하며 operation.requested_by===principal.accountId일 때 해당 작업만 허용. 상태 resolver의 기존 read grant도 유지 |
| 다른 사용자, scope 밖 | 거부 | 거부 |
| principal/accountId 누락 또는 context 신원 불일치 | 거부 | 거부 |
| PROJECT grant가 회수됨 | 거부 | 최초 요청자여도 거부 |

재시도 예외는 `deleteProject`, `getProjectDeletionStatus` 두 이름에만 한정한다. PermissionMap의 PROJECT grant를 PUBLIC/SELF로 낮추지 않는다. 이 두 항목만 project='none'으로 두고 서비스의 공통 정책 함수가 PROJECT grant와 정상 범위 또는 저장된 최초 요청자라는 제한적 소유권을 검사한다. 일반 상세·수정 resolver의 멤버십 판정은 그대로 둔다. 서비스 직접 호출에도 같은 공용 정책을 적용하고 principal 누락을 거부한다. 상태 조회의 최초 요청자 예외도 현재 write를 요구하여 삭제 작업에만 제한한다. 신원/권한을 payload에서 받지 않는다.

requested_by는 최초 생성 시 인증 principal.accountId로만 저장한다. 기존 unknown fallback은 제거한다. 읽기·쓰기가 각자 다른 소유권 조건을 구현하지 않는다. 급여·팀·SELF 데이터 신규 반환은 없다. Jira mutation의 기존 asApp 플랫폼 예외에서는 현재 연결이 남은 이슈의 asUser 접근 장벽을 계속 유지한다.

## 5. 백엔드·상태 저장·재개 설계

### 5.1 Pagination과 discovery

route는 첫 페이지와 토큰 페이지를 분기하여 `&nextPageToken=${nextPageToken}`에서 값만 보간한다. `projectId`는 JQL 값으로 안전하게 제한/검증한다. 반환된 issues와 cursor shape가 잘못되면 빈 완료로 처리하지 않고 실패한다.

기존 `steps_json`에 `discoverCursor`를 저장한다. `discover:'DONE'` 체크포인트는 유지한다. 최초는 cursor 없음, 중간은 다음 페이지 토큰, 완료는 discover DONE이다. 페이지별 실행 순서는 (1) deadline 확인 (2) Jira 한 페이지 조회 (3) 최대 100건 bulk upsert (4) 다음 cursor 저장이다. 마지막 페이지 upsert 성공 뒤 discover DONE을 저장한다. upsert 이후 checkpoint 이전 실패하면 같은 페이지를 다시 받으며 unique(project_id,issue_id)로 멱등 처리한다. 토큰만 먼저 저장하면 이슈를 영구 누락하므로 금지한다.

cursor 진전 없음/같은 토큰 반복을 감지하여 명시적 실패 처리한다. 토큰 만료가 발생하면 오류를 명시하고, 재발견을 수행하려면 cursor를 의도적으로 초기화하는 경로가 필요하다. 일반 오류마다 무조건 초기화하지 않는다. 페이지 저장이 완료되면 시간 예산을 다시 검사하고 `DISCOVERING` DTO를 반환한다. 전체 discover DONE 전에는 UNLINK·SQL에 진입하지 않는다.

### 5.2 이슈 이동과 unlink

현재 검색에 포함된 id도 mutation 직전 probe한다. 상태는 LINKED(이 프로젝트), UNLINKED(명시적 빈 값), MOVED(다른 프로젝트), MISSING(404)로 분리한다. field 자체 누락/비정상 응답/권한·통신 오류는 UNLINKED로 간주하지 않는다.

- LINKED: asUser 접근 장벽을 확인한 행만 property 삭제 후 field 비우기. 단계별 성공을 영속 기록한다.
- MOVED/MISSING: Jira property/field를 수정하지 않고 삭제 작업 행만 DONE으로 처리한다.
- UNLINKED: 이미 연결이 없는 것으로 처리한다. 소유 프로젝트 정보가 없는 movesRms property를 재삭제하면 새 메타데이터를 지울 수 있어 Jira 쓰기 없이 DONE으로 처리한다. 원래 순서가 property 삭제→field 삭제이므로 field 삭제 이후 응답 유실 복구에도 안전하다.

probe 루프도 deadline 안에서 수행한다. batch 전체 probe를 끝내야만 첫 행을 처리하는 구조는 큰 배치에서 매번 진전하지 못할 수 있으므로 행별 검증·처리·checkpoint로 전진한다. BLOCKED/FAILED는 이후 재시도 대상이며 모든 비완료 행이 남아 있으면 SQL 정리 금지다.

### 5.3 SQL·캐시·완료

각 SQL 단계는 steps_json DONE이면 건너뛰고, deadline 이전에만 시작한다. action 성공 뒤 DONE 저장 전 실패는 해당 action의 멱등 DELETE로 복구한다. projectusers는 가능하면 parent project 바로 전에 삭제하여 불필요한 조기 소속 상실을 줄이되 권한 복구의 근거는 requested_by로 둔다.

모든 경로가 lease를 획득한 뒤 side effect를 실행한다. COMPLETED_WITH_WARNINGS의 현재 lease 밖 캐시 정리 분기도 lease 안으로 이동한다. lease 획득 후 operation을 다시 읽어 선행 작업의 최신 단계/완료를 확인한다. CLAIM 실패는 상태만 반환한다. 중간 시간 소진은 FAILED로 만들지 않고 DISCOVERING/UNLINKING/SQL_CLEANUP 상태로 반환하여 UI가 이어 호출한다.

모든 SQL→캐시 정리→이슈 행 정리 후 operation row를 삭제하는 대신 status=COMPLETED/current_stage=DONE을 영속 저장한다. COMPLETED 재호출은 Jira/SQL mutation 없이 동일 terminal DTO를 반환한다. 완료 row 보존으로 요청자의 scope 복구, 응답 유실 복구, 완료 상태 조회를 지원한다. 보존 정책/정리 작업은 이번 수정에서 도입하지 않고 운영상 보관량을 별도 고려한다.

`assertProjectAcceptsIssueMetadata`는 조회된 프로젝트 행이 실제 존재하고 DELETING이 아닐 때만 true다. 삭제 완료 후 신규 연결을 조용히 허용하지 않는다. DB schema·KVS schema·Forge scope 변경은 필요하지 않다.

## 6. 프론트 상태·쿼리키·무효화

| 대상 | 계약 |
| --- | --- |
| ProjectList / ProjectKanbanBoard | DISCOVERING, UNLINKING, SQL_CLEANUP은 기존 자동 continuation. completed=true에서 종료 |
| ProjectDeletionStatusModal | FAILED/BLOCKED/WARNINGS만 수동 재시도. 상태와 최소 오류 코드 제공 |
| useKanbanMutations | 최종 완료 때 카드 제거와 `invalidateProjectViews` 실행. 중간 상태를 성공 삭제로 오인하지 않음 |
| projectKeys | 신규 key 없음. 기존 목록/칸반/KPI invalidation 재사용 |

라우트·공용 UI 컴포넌트 신설 없음. 공개 DTO field 추가가 없어 frontend 구현 변경은 회귀 검토 결과 필요한 부분만 수행한다. 원본 Jira 응답 전체를 lastError.message로 내보내는 경로는 민감정보가 섞일 수 있으므로 구현 시 정형화된 오류 중심으로 확인한다.

## 7. 한국어·영어 i18n

신규 문구 없음. 기존 `project.delete.progress.discovering`, `.unlinking`, `.sqlCleanup`, `.failed`, `.blockedJiraAccess`, `.cacheWarning` 및 `.retry`를 유지한다. 필요성이 확인되어 문구를 추가하는 경우 `locales/kr/*.json`, `locales/en/*.json`에 작성하고 merge한다.

## 8. 담당 작업·검증·추가 위험

설계 담당은 본 문서만 작성한다. 리더는 Jira API 및 route 회귀, 프론트 소비자를 담당하며 backend 담당은 Service/Repository/Query/permission과 관련 테스트를 담당한다. permission 공용 정책에 대한 계약 변경은 리더와 backend 담당 모두에게 전달한다.

필수 시나리오:

1. 101건 이상, 특수문자 토큰의 실제 route URL 파라미터, 마지막 페이지.
2. discovery 도중 시간 소진 후 저장 cursor로 재개, page upsert/checkpoint 경계 장애, 발견 중 SQL 미실행, cursor 무진전.
3. 검색에서 빠진 MOVED와 검색에 남아 있는 MOVED 모두 Jira 쓰기 없음, MISSING/UNLINKED 멱등 완료, malformed probe는 fail-close.
4. inaccessible/FAILED 행 재시도, probe 시간 예산 소진에서 진전 유지, 하나라도 미완료면 SQL 금지.
5. 각 SQL 단계의 장애·시간 소진 후 완료 단계 skip. 캐시 장애 후 WARNINGS 재시도, lease 충돌.
6. 실제 guardedDefine를 통해 MEMBER_ONLY/TEAM_ONLY 최초 요청자 재개, 다른 사용자 거부, PROJECT grant 회수 거부, principal 누락 거부, get/delete 동일 정책.
7. parent project 삭제 이후 실패, 완료 응답 유실 후 동일 요청 재호출과 상태 조회, COMPLETE에서 Jira/SQL mutation 미실행.
8. 없는 project에 metadata write 차단. 기존 Gantt/WorkAssignment/Subscription 호출자의 회귀.
9. 전체 backend/frontend 테스트, CI=true frontend build, app root pwd 후 forge lint. 실행 결과는 검증 담당 리포트에 기록한다.

추가 확인된 결함은 SQL 체크포인트 무시, SQL/probe deadline 누락, 완료 row 즉시 삭제에 따른 복구 불가, WARNINGS의 lease 우회, 없는 프로젝트에 metadata 쓰기 허용이다. 이번 범위에 포함한다.

잔여 위험은 Jira 검색 인덱스 지연, 외부 이동과 probe/write 사이 경합, lease 만료 이후 기존 실행이 계속 side effect를 수행하는 경우이다. 이 설계는 각 호출의 예산과 최신 상태 재조회로 범위를 줄이지만 외부 시스템까지 원자성을 보장하지 않는다. 향후 모든 쓰기 경로를 포함하는 삭제 fencing/최종 재발견 전략이 필요할 수 있다. 현재 작업에서 테스트하지 않은 live Jira 동작을 검증 완료로 표시하지 않는다.

## 9. 추가 검토: SQL 자식 재생성과 완료 체크포인트

**발견: 자식 삭제 단계를 DONE으로 건너뛰려면 자식 INSERT가 DELETING/부재 프로젝트를 거부해야 한다.** 현재 아래 12개 SQL 작성 지점에는 parent ACTIVE 조건이 없다. 가드의 project scope는 해당 사용자에게 프로젝트 접근 권한이 있는지만 판정하며 삭제 상태를 검사하지 않는다. 따라서 삭제 중 관리자·ALL 사용자 또는 이미 시작된 요청이 자식을 다시 만들 수 있다. Forge SQL은 FK/CASCADE로 이를 보완하지 않는다.

| 데이터 | 실제 호출 경로 | SQL 위치 |
| --- | --- | --- |
| projectusers | `ProjectUsersService.js:46 insertProjectusersService` → `ProjectUsersRepository.js:6 insertProjectusersRepository`; 팀 인력 배정도 이 서비스를 호출 | `ProjectUsersQuery.js:5 INSERT`는 users에서 SELECT하며 parent 검사 없음 |
| project_team | `ProjectTeamService.js:121 setProjectTeamsService` → `ProjectTeamRepository.js:64` | `ProjectTeamQuery.js:40 UPSERT_NON_PRIMARY_BULK` |
| project_subscription | `ProjectSubscriptionService.js:368 createProjectSubscriptionService` → `ProjectSubscriptionRepository.js:195` | `ProjectSubscriptionQuery.js:80 INSERT` |
| project_dashboard | `ProjectDashboardService.js:623 addChartService` → `:645 insertChart` → `ProjectDashboardRepository.js:46 addChartDataRepository` | `ProjectDashboard.js:21 INSERT`, `:43 INSERT_WITH_FILTER` |
| project_dashboard 배치 | `ProjectDashboardService.js:734` 배치 저장 결과 → `ProjectDashboardRepository.js:134 bulkUpdateLayoutsRepository` | `ProjectDashboardRepository.js:143` inline INSERT/UPSERT. update라는 이름이지만 신규 행 생성 가능 |
| gantt_folder | `GanttFolderService.js:83 createGanttFolder` → `:103 insertFolderRepository` | `GanttFolderQuery.js:46 INSERT_FOLDER` |
| gantt_folder_issue | `GanttFolderService.js:213`, `:238`, 보상 경로 `:246` → `upsertIssueFolderRepository` | `GanttFolderQuery.js:97 UPSERT_ISSUE_FOLDER` |
| gantt_folder_link | `GanttFolderService.js:332 insertFolderLinkRepository` | `GanttFolderQuery.js:127 INSERT_FOLDER_LINK` |
| project_skills | `ResourceManagementService.js:671 setProjectSkillsService` → 삭제 후 `:682 executeQuery` | `SkillMappingQuery.js:60 INSERT_PROJECT_SKILLS` |
| portfolio_project_snapshot | `PortfolioAggregator.js:525 aggregateAndPersistOneProject`, `:613 aggregatePortfolio` → `PortfolioSnapshotRepository.js:43 upsertSnapshot` | `PortfolioSnapshotQuery.js:17 UPSERT`, `:70 UPSERT_WITH_SPACES` |

특히 snapshot은 긴 비동기 집계가 끝난 뒤 저장하므로 snapshot 삭제 DONE 이후 되살아나는 경계가 현실적이다. team/subscription/skills/dashboard/Gantt service에는 DELETING precheck도 없다. ProjectUsersService의 metadata helper는 Jira metadata 함수용이며 `insertProjectusersService`에는 적용되지 않는다.

### 최소 수정 제안

1. 12개 INSERT/UPSERT entry를 동일 SQL 문 안에서 `project.project_id`와 `project.deletion_state='ACTIVE'`로 제한한다. parent가 사라진 경우도 자동으로 제외한다. 서비스의 별도 SELECT만 추가하면 그 SELECT와 INSERT 사이 삭제 경합은 남는다.
2. 단일행 VALUES는 `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM project WHERE project_id=UUID_TO_BIN(?) AND deletion_state='ACTIVE')`로 변환하고 repository에서 마지막 projectId 바인딩을 추가할 수 있다. UPSERT는 SELECT의 WHERE 뒤에 기존 ON DUPLICATE 절을 유지한다. snapshot 두 shape 모두 적용하며 unknown-column fallback을 유지한다.
3. bulk team/skills/layout은 parameter 기반 `SELECT ... UNION ALL ...` derived rows를 만들고 `JOIN project ON project.project_id=input.project_id AND project.deletion_state='ACTIVE'`로 필터한다. project_id마다 predicate를 반복하는 것보다 공통 outer JOIN이 간단하며 기존 입력 파라미터 순서를 보존할 수 있다. 동적 값은 계속 bind한다. team/skills가 한 프로젝트만 받더라도 layout은 행별 project_id를 안전하게 검증한다.
4. projectusers의 기존 INSERT SELECT(users)에 parent ACTIVE EXISTS를 추가한다. 바인딩 순서 변경을 repository/service 테스트로 확인한다. 현재 마지막 문자열이 `AND account_id IN`이므로 EXISTS를 앞에 넣으면 추가 projectId가 requestedIds보다 앞에 들어가야 한다.
5. 사용자 mutation은 0행 생성 차단을 정상 저장 성공으로 표시하지 않게 한다. 단, 멱등 UPSERT의 기존 동일 값도 rowsAffected=0일 수 있으므로 모든 0을 무조건 DELETING으로 바꾸면 안 된다. 필요 시 0행일 때 parent 존재/ACTIVE를 추가 확인하여 삭제 상태만 PROJECT_DELETING으로 명시한다. subscription은 0행이면 saved??draft 성공 응답이나 backfill enqueue로 진행하지 않는다. snapshot 배치는 parent가 비활성이면 정상 skip 가능하다.
6. 새 schema/외부 API 변경 없이 child repository/query만 수정할 수 있다. SQL parent predicate를 검증하는 회귀와 DELETING·부재·ACTIVE, duplicate-no-op, snapshot fallback을 포함한다. Query shape 문자열만 확인하는 테스트는 바인딩 일치와 함께 검사한다.

이 변경은 DELETING이 보이는 시점 이후 시작된 SQL write의 재생성을 막는다. parent SELECT와 별개 테이블 write가 이미 실행 중인 DB transaction의 격리/commit 순서까지 완전 직렬화한다고 주장하지 않는다. 강한 보장이 필요하면 DB 잠금/최종 orphan reconciliation이 별도 검토 대상이다. 제품 코드·테스트 수정은 backend 담당에게 위임하며 이 추가 검토에서는 수행하지 않았다.
