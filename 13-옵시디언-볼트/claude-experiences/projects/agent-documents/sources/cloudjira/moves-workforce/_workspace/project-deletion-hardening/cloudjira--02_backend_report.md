# 백엔드 구현 보고

## 변경과 계약

- 기존 `registerProjectController`/`CONTROLLER_REGISTRARS` 등록을 유지한다. resolver 이름은 `deleteProject`, `getProjectDeletionStatus`이며 둘 다 `guardedDefine`을 사용한다.
- `PermissionMap`의 PROJECT write/read grant는 유지하고 project scope를 `none`으로 변경했다. 서비스 공통 `assertDeletionAccess`가 principal/accountId 및 현재 grant를 확인한 뒤 정상 프로젝트 범위 또는 `requested_by === principal.accountId && PROJECT.write` 복구 예외를 검사한다. 상태 조회도 principal을 전달한다. 요청자의 권한 철회 및 다른 계정은 예외를 받을 수 없다.
- resolver 성공 shape: `{success:true, content:{deletion:{projectId,status,stage,completed,retryable,blockedIssueCount,attempt,issueCounts,sqlSteps,lastError,updatedAt}}}`. 작업의 부분 실패는 기존처럼 성공 envelope 내부 `deletion.status=FAILED`로 제공한다. 권한/대상 사전조건 실패는 공통 wrapper `{success:false,error:{name,code,message,cause}}`를 따른다.
- `lastError`는 `{code,stage}`로 제한한다. 원문 Jira/SQL 메시지를 반환하지 않는다. 안전한 HTTP 숫자는 `PROJECT_DELETION_JIRA_HTTP_403` 등의 코드로 보존하고 SQL 실패는 실제 `DASHBOARD`, `TEAM`, `PROJECT` 등 단계로 기록한다. 프론트 담당에게 계약 전달 완료.
- 완료 시 issue snapshot만 제거하고 작업 row를 `COMPLETED` tombstone으로 남겨 응답 유실 후 재시도와 상태 조회가 가능하다. DTO의 `completed`는 실제 COMPLETED에만 true다.

## 수정 영역

- `IssueApi.js`: 실제 Forge route에서 nextPageToken을 독립 파라미터로 생성. discovery 응답/커서 검증. 직접 현재 필드 조회로 LINKED/MOVED/UNLINKED/MISSING/UNKNOWN 구분. Team-managed 필드 누락은 POST search/jql + numeric reconcileIssues로 보완. 사용자 접근 검색도 reconcileIssues 사용.
- `ProjectDeletionQuery.js`, `ProjectDeletionRepository.js`: requested_by 조회, discover cursor/완료 동시 checkpoint, 기존 미커밋 다중행 upsert/LIMIT 수정 유지. 프로젝트 부재/DELETING에는 메타데이터 신규 쓰기 거부.
- `ProjectDeletionService.js`: 호출 시작부터 deadline, 발견 페이지별 재개, 단계별 SQL/KVS checkpoint, lease 획득 뒤 최신 상태 재조회, cache warning 복구도 lease 안에서 처리. 이동/해제/없는 이슈는 Jira property/field를 쓰지 않는다. 사용자에게 보이는 이슈가 app GET에서 404면 차단한다. 프로퍼티 삭제 후 필드 초기화 직전 소속을 재확인한다.
- `ProjectController.js`, `PermissionMap.js`: 위 권한·principal 계약 적용.
- `ProjectService.js`: 더 이상 호출되지 않는 legacy 직접 cascade 삭제와 관련 import/cache 함수를 제거해 삭제 경로를 saga로 통일했다.
- 삭제 Service/API/Repository 회귀 테스트를 추가·갱신했다.

## 검증

- 최종 대상 검증: `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionService.test.js src/api/jira/issue/__test__/ProjectDeletionIssueApi.test.js src/resolver/project/__test__/ProjectDeletionRepository.test.js` — 3 suites, 42건 통과. 실제 Controller→guardedDefine→서비스의 MEMBER_ONLY/TEAM_ONLY 복구·권한회수·타인·payload principal 위조 경계와 property DELETE HTTP 403/429 코드 보존을 포함한다.
- `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionService.test.js src/api/jira/issue/__test__/ProjectDeletionIssueApi.test.js`: 32건 통과.
- `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionRepository.test.js`: 6건 통과.
- `npm test -- --runInBand`: 병행 SQL fence 변경 도중 실행되어 114 suites 중 110 통과, 1544 tests 중 1536 통과. 실패 8건은 ChartFilterPersistence, PortfolioSpacesPersistence, ProjectTeamRepository, PortfolioSnapshotSalaryPolicy의 변경 중 SQL/저장 mock 계약이며 리더에게 전달했다. fence 담당의 테스트 갱신 후 최종 재검증 필요.
- schema/manifest/scopes 변경 없음. 배포·설치·커밋은 실행하지 않았다. 실제 Jira/Forge SQL 런타임 호출 검증은 수행하지 않았다.

## 남은 플랫폼 경계

- Jira 조회와 mutation은 CAS가 아니므로 최종 probe 직후 외부 이동까지 원자적으로 막을 수 없다.
- 초기 발견 검색은 아직 모르는 ID를 reconcile할 수 없어 인덱스 지연 및 이미 시작된 외부/앱 쓰기와의 경합은 별도 운영 검증 대상이다.
- app/user 양쪽에 보이지 않는 snapshot의 404는 실제 삭제와 양쪽 권한 소실을 완전히 구분할 수 없다. 이 경우 Jira에는 쓰지 않고 완료 처리한다.
- 완료 tombstone 보존 정책/정기 정리는 이번 범위에 추가하지 않았다.

## Claude 최종 검토 후 보완

- 지적 #1의 테이블 미생성 정체는 수정했다. 다만 `isTableReady=false`에는 일시 프로브 장애도 포함되므로 `null ?? 0` 제안은 적용하지 않았다. 기존 shared Safe 함수는 유지하고 `deleteProjectTeamsForDeletion`, `deleteSubscriptionsForDeletion`을 추가했다. 삭제 전용 함수는 직접 DELETE하고 실제 missing-table 오류만 0건으로 완료하며 다른 SQL 오류는 전파한다.
- 지적 #2의 `ISSUE_PROPERTY_DELETE_403/429` 분류 누락은 이미 수정했고 본문 미노출 테스트까지 통과했다.
- 추가 검증: `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionOptionalTables.test.js src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/projectTeam/__test__/ProjectTeamRepository.test.js` — 3 suites, 49건 통과. 최종 전체 backend 검증은 리더가 실행한다.

## 저장 cursor 거부 복구

- 기존 cursor를 보낸 Jira discovery 페이지 요청이 명시적 HTTP 400이면 `discover=PENDING`, `discoverCursor=''`로 초기화하고 이번 호출은 FAILED로 종료한다. 다음 수동 재시도는 처음부터 멱등 발견을 수행한다. `null`을 일반 checkpoint에 전달해 DONE으로 오인하지 않도록 별도 reset 함수를 사용한다.
- 첫 페이지 400, 403/429/500, page upsert 실패에는 cursor를 초기화하지 않는다. 초기화 DB 실패는 오류로 전파되고 기존 cursor가 남는다.
- Jira 오류 원문을 해석하지 않으므로 기존 cursor 요청의 다른 400도 한 번 초기화될 수 있으나, 이번 호출에서 자동 재시작하지 않으며 다음 첫 페이지 400에서는 재초기화하지 않는다.
- 검증: `npm test -- --runInBand src/resolver/project/__test__/ProjectDeletionService.test.js src/resolver/project/__test__/ProjectDeletionRepository.test.js` — 2 suites, 37건 통과(신규 경계 7건 포함).
