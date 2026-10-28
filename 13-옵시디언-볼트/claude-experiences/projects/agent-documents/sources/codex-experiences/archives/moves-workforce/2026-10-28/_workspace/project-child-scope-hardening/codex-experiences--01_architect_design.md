# Project child-resource scope hardening 설계서

## 1. 개요 / 영향 범위

P0-1은 `inherited` permission guard가 payload의 `projectId`/`project_id`를 찾지 못하면 범위 검증을 건너뛰는 현재 한계를 보완한다. 클라이언트가 보낸 프로젝트 ID는 빠른 guard 판정용 보조값으로만 사용하고, 쓰기 직전에 서버가 자식 식별자에서 실제 소속 프로젝트를 역산해 `principal`의 수정 가능 프로젝트 범위와 대조한다.

이번 항목은 다음 6개 resolver만 대상으로 한다.

- 프로젝트 멤버: `updateProjectMemberSalary`, `updateProjectUsersByKey`, `deleteProjectUsersByKey`
- 프로젝트에 이미 편입된 Issue: `deleteProjectIssue`, `updateIssueCoworkers`, `recordIssueAssignedDate`

`updateProjectIdField`는 Issue를 새 프로젝트에 연결하는 P0-4이므로, 요구사항의 Out of scope를 우선해 이번 설계에서 제외한다. 요구사항의 “project issue exclusion/update”는 이미 연결된 Issue의 제외(`deleteProjectIssue`)와 property 갱신으로 해석한다.

| 축 | 수정 대상 |
|---|---|
| 백엔드 | `ProjectUsersController`, `ProjectUsersService`, `ProjectUsersRepository`, `ProjectUsersQuery`, 신규 공용 `ProjectChildScope` helper, `IssueApi`의 Issue 소속 검증 helper |
| 권한 | 기존 `PermissionMap` resolver 이름과 resource grant는 유지한다. payload에 `project_id`를 추가해 guard의 조기 차단도 복구하고, 서비스가 `principal`로 최종 판정한다. |
| 프론트 | `SalaryManagementPage`, `ProjectUserPanel`, `IssueAddModal`, `ProjectIssueTable`의 invoke payload에 현재 화면 `project_id`를 추가한다. |
| DB | 신규 테이블/마이그레이션 없음. `projectusers.project_member_id`에서 `project_id`를 조회하는 Query와, update/delete의 `project_id` 복합 predicate를 추가한다. |
| i18n | 없음. 기존 화면은 모든 실패를 공통 오류 toast로 표시하며, 응답 shape도 유지한다. |

## 2. 경계면 계약 (가장 중요)

모든 resolver는 계속 `guardedDefine` 및 `responseWrapper`를 통과한다. 성공 시에는 아래 payload가 `content`가 아닌 기존 반환 위치에 그대로 spread되어 `{ success: true, ...기존반환값 }`가 된다. 실패 시 공통 `{ success: false, error: { name, code, message, cause } }` shape를 유지한다.

| resolver 함수 | 입력 파라미터 (변경분 굵게) | success 시 응답 shape | 대응 프론트/쿼리키 |
|---|---|---|---|
| `updateProjectMemberSalary` | `{ project_member_id, salary?, salary_type?, **project_id** }` | 기존 Forge SQL 결과 그대로: `{ success: true, rowsAffected, ... }` | `SalaryManagementPage` / `projectKeys.salary(project_id, page)`, `projectKeys.cost(project_id)` |
| `updateProjectUsersByKey` | `{ project_member_id, role_key?, level_key?, **project_id** }` | 기존 Forge SQL 결과 그대로 | `ProjectUserPanel` / `projectKeys.userPage(project_id, page)` |
| `deleteProjectUsersByKey` | `{ project_member_id, **project_id** }` | 기존 Forge SQL 결과 그대로 | `ProjectUserPanel` / `projectKeys.users(project_id)` |
| `deleteProjectIssue` | `{ issueId, customFieldId, **project_id** }` | 기존 void 결과: `{ success: true }` | `ProjectIssueTable` / `workListKeys.groupPage(...)` |
| `updateIssueCoworkers` | `{ issueId, accountIds, **project_id** }` | `{ success: true, content: { issueId, coworkers: string[] } }` | `ProjectIssueTable` / 현재 행 재조회 |
| `recordIssueAssignedDate` | `{ issueIds: string[], **project_id** }`; `accountId`는 계속 context에서 강제 주입 | `{ success: true, recorded: number, skipped: number }` | `IssueAddModal` / `projectKeys.taskHistory(project_id)` |

호환성 규칙:

- 프론트의 기존 성공 소비와 query key는 바꾸지 않는다.
- 기존 optional 필드의 의미(`''`는 미변경, `undefined`는 미전송)는 유지한다.
- 새 `project_id`는 모든 기존 호출 지점이 이미 보유한 화면 상태다. 외부/구버전 호출이 이를 빼면 guard 또는 서비스에서 fail-close한다.
- 서비스는 payload의 `project_id`를 신뢰하지 않는다. 멤버는 SQL로 얻은 `actualProjectId`, Issue는 Jira의 `moves_RMS_projectId`와의 일치 여부를 최종 판정에 쓴다.

## 3. 백엔드 설계

### 3.1 공통 범위 helper

신규 파일 `src/resolver/projectIssue/ProjectChildScope.js`를 만든다. `ProjectUsersService` 안에 분기별로 구현하지 않아 6개 경로가 같은 fail-close 규칙을 공유하게 한다.

1. `assertProjectIdWritable({ projectId, principal })`
   - `projectId`가 비어 있거나 malformed이면 거부한다.
   - `scopedProjectIds(principal)`가 `null`(admin/ALL)이면 프로젝트 ID의 존재성 검증은 각 자식 resolver가 담당하고, scope 제약은 통과한다.
   - 제한 범위이면 실제 프로젝트 ID가 `scopedProjectIds(principal)`에 포함되어야 한다.
   - 불일치, principal 누락, 범위 해석 실패는 `ProjectScopeError(ErrorCodes.PERMISSION_PROJECT_SCOPE_DENIED, ...)`로 처리한다. 존재 여부와 권한을 구분해 누설하지 않는다.

2. `resolveAndAssertProjectMember({ projectMemberId, claimedProjectId, principal })`
   - `project_member_id` UUID 형식을 먼저 검사한다.
   - `findProjectIdByMemberIdRepository(projectMemberId)`로 `projectusers`의 실제 `project_id`를 조회한다. 행이 없으면 동일한 `PERMISSION_PROJECT_SCOPE_DENIED`로 실패한다.
   - `claimedProjectId === actualProjectId`인지 확인하고, 실제 ID에 `assertProjectIdWritable`를 적용한다.
   - 반환한 `actualProjectId`를 다음 DML의 `project_id` predicate로 반드시 전달한다.

3. `assertIssueIdsInProject({ issueIds, claimedProjectId, principal })`
   - 단일/배열을 정규화하고 빈 배열, 형식 불량, 중복을 fail-close한다.
   - 먼저 `assertProjectIdWritable({ projectId: claimedProjectId, principal })`를 적용한다.
   - 새 `IssueApi` batch helper로 각 Issue가 Jira의 `moves_RMS_projectId === claimedProjectId`인지 확인한다. 결과가 요청 개수와 일치하지 않으면 같은 `ProjectScopeError`를 throw한다.
   - 제한 scope 여부와 무관하게 Jira 소속 확인은 수행한다. 따라서 ALL/admin도 존재하지 않거나 아직 어느 RMS 프로젝트에도 편입되지 않은 Issue의 property 변경·제외를 할 수 없다.

`isIssueInProjects`를 단건 검증에 재사용할 수는 있으나, `recordIssueAssignedDate`는 다건이므로 `src/api/jira/issue/IssueApi.js`에 `areIssuesInProject(issueIds, projectId, as = 'user')`를 추가한다. 입력 Issue들을 JQL-safe하게 정규화하여 단일 JQL 조회로 발견 개수를 대조한다. 호출자 Jira 권한으로 읽는 `as:'user'`를 유지한다. 100건을 넘는 입력은 helper 내부에서 안전한 chunk 단위로 처리하거나, 명시적인 상한 오류로 실패시킨다. 이번 UI의 선택 상한과 동일한 상수를 사용해 silent truncation을 만들지 않는다.

### 3.2 Controller 및 permission 경로

`src/resolver/projectIssue/ProjectUsersController.js`의 다음 handler는 `{ payload, principal, context }`를 받아 `principal`을 서비스에 전달한다.

```js
guardedDefine(resolver, 'deleteProjectUsersByKey', ({ payload, principal }) =>
  deleteProjectUsersByKeyService(payload, principal));
guardedDefine(resolver, 'updateProjectUsersByKey', ({ payload, context, principal }) =>
  updateProjectUsersByKeyService(payload, context, principal));
// updateProjectMemberSalary, deleteProjectIssue, updateIssueCoworkers도 동일
guardedDefine(resolver, 'recordIssueAssignedDate', ({ payload, context, principal }) =>
  recordIssueAssignedDateService({ ...payload, accountId: context?.accountId }, principal));
```

`PermissionMap`의 resource/action 및 `project: 'inherited'`는 그대로 유지한다. 새 UI payload의 `project_id`가 permission guard에서 빠른 범위 차단을 수행하되, 악의적인 호출자가 허용 프로젝트 A를 넣고 실제 자식 B를 넣어도 3.1 helper가 B를 역산하므로 통과할 수 없다.

### 3.3 멤버 update/delete 및 salary update

수정 파일:

- `src/rdb/query/ProjectUsersQuery.js`
  - `FIND_PROJECT_ID_BY_MEMBER_ID`: `project_member_id = UUID_TO_BIN(?)`에서 `BIN_TO_UUID(project_id) AS project_id`를 단건 조회한다.
  - 기존 `DELETE_BY_KEY`, `UPDATE_BY_KEY_WITH_PARAMS`, `UPDATE_SALARY_BY_KEY`를 `AND project_id = UUID_TO_BIN(?)` 조건이 있는 이름/SQL로 교체한다.
- `src/resolver/projectIssue/ProjectUsersRepository.js`
  - `findProjectIdByMemberIdRepository(projectMemberId)`를 export한다.
  - 세 DML repository가 실제 프로젝트 ID까지 bind한다.
- `src/resolver/projectIssue/ProjectUsersService.js`
  - 세 서비스가 write 전에 `resolveAndAssertProjectMember`를 호출한다.
  - DML 결과의 `rowsAffected !== 1`은 throw한다. lookup 뒤 행이 바뀌거나 삭제된 TOCTOU도 성공으로 숨기지 않는다.

`updateProjectUsersByKeyService`의 salary 차단 및 `updateProjectMemberSalaryService`의 salary policy 검증 순서는 유지한다. 단, child ownership 검증은 실제 DML 전에 반드시 완료한다. 정책 오류와 권한 오류의 우선순위는 구현자가 기존 테스트/UX를 확인해 정하되, 어느 경우에도 DML은 실행되면 안 된다.

### 3.4 Issue 제외, coworker, assigned date

수정 파일:

- `src/resolver/projectIssue/ProjectUsersService.js`
  - `deleteProjectIssueService(payload, principal)`은 `setAppFieldValueForIssues` 전에 단건 `assertIssueIdsInProject`를 호출한다.
  - `updateIssueCoworkersService(payload, principal)`은 `mergeIssueProperty` 전에 같은 단건 검증을 호출한다.
  - `recordIssueAssignedDateService(payload, principal)`은 `recordAssignedDateOnce` 전에 전체 `issueIds`를 검증한다. 검증 실패는 현재 best-effort skip 규칙의 대상이 아니며, 한 건이라도 불명확하면 전체 호출을 거부한다. 검증 후 recorder의 개별 Jira property read/write 실패만 기존처럼 `skipped`로 집계한다.
- `src/api/jira/issue/IssueApi.js`
  - 위 batch membership helper를 추가한다. 기존 `isIssueInProjects`의 동작과 Gantt/IssueAnalysis 소비는 변경하지 않는다.

Issue 제외의 `customFieldId` 위조 방지는 P0-4(프로젝트 field ownership)에 포함되므로 이번 항목에서 새 정책을 만들지 않는다. 다만 검증은 반드시 앱의 실제 project field 기준으로 하며, 이후 write가 실행되기 전에 대상 Issue의 현재 RMS 소속이 `project_id`와 같음을 보장한다.

## 4. 프론트엔드 설계

새 페이지, route, Zustand store, i18n, query-key factory는 없다. 현재 페이지가 이미 가진 `project_id`만 mutation 변수에 병합한다.

| 파일 | 변경 |
|---|---|
| `static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx` | salary type 및 salary InlineEdit의 `updateMutation.mutate`에 `project_id`를 추가한다. |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | role/level update mutation과 delete mutation에 `project_id`를 추가한다. delete `mutationFn`은 단순 ID 대신 `{ project_member_id, project_id }`를 받도록 조정하거나 closure에서 병합한다. optimistic cache patch는 `project_member_id` 기준을 그대로 사용한다. |
| `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` | bulk 제외 및 coworker invoke에 `project_id`를 추가한다. 각 batch 결과/partial failure UI는 기존 로직을 유지한다. |
| `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx` | `recordIssueAssignedDate` invoke에 `project_id`를 추가한다. `updateProjectIdField` 호출은 P0-4 범위이므로 변경하지 않는다. |

프론트의 `canWrite`는 표시 제어일 뿐 보안 경계가 아니다. 기존 `success` 명시 검사와 실패 toast를 유지하고, 새 오류 코드별 문구/처리는 추가하지 않는다.

## 5. DB 설계

스키마 변경은 없다. `projectusers`의 기존 PK와 `project_id`를 다음처럼 함께 사용한다.

```sql
SELECT BIN_TO_UUID(project_id) AS project_id
FROM projectusers
WHERE project_member_id = UUID_TO_BIN(?);

UPDATE projectusers
SET ...
WHERE project_member_id = UUID_TO_BIN(?)
  AND project_id = UUID_TO_BIN(?);

DELETE FROM projectusers
WHERE project_member_id = UUID_TO_BIN(?)
  AND project_id = UUID_TO_BIN(?);
```

`project_member_id`는 PK이므로 ownership lookup은 단건이다. 별도 index는 필요 없다. `rowsAffected`는 공통 계층 alias를 사용하고 mock도 `{ rows: { affectedRows } }` 형태를 재현한다.

## 6. i18n 키 목록

추가 없음.

모든 신규 거부는 기존 공통 오류 toast가 표시한다. 사용자에게 특정 프로젝트/Issue 존재 여부를 노출하는 문구도 추가하지 않는다.

## 7. 구현 작업 분해

### Backend 체크리스트

- [ ] `ProjectChildScope.js`에 멤버와 Issue의 공용 fail-close ownership helper를 구현한다.
- [ ] `ProjectUsersQuery`/`ProjectUsersRepository`에 멤버 실제 프로젝트 조회와 `(project_member_id, project_id)` DML predicate를 추가한다.
- [ ] `ProjectUsersController`에서 6개 resolver의 `principal`을 서비스로 전달한다.
- [ ] `ProjectUsersService`의 6개 mutation에서 외부 write 전 ownership helper를 호출한다.
- [ ] `recordIssueAssignedDate`의 best-effort 범위를 property 기록 실패로 한정하고, 사전 ownership 실패를 성공/skip으로 전환하지 않는다.
- [ ] `IssueApi`에 다건 Issue 소속 검증을 추가하고 `as:'user'`를 유지한다.
- [ ] `ErrorCodes`에는 필요하면 존재 여부 비노출용 단일 코드만 추가한다. 기존 `PERMISSION_PROJECT_SCOPE_DENIED`로 통일 가능하면 새 public error code는 만들지 않는다.
- [ ] resolver 등록 이름, `CONTROLLER_REGISTRARS`, `PermissionMap` 등록 집합은 변경하지 않는다.

### Frontend 체크리스트

- [ ] 위 4개 페이지의 6개 invoke payload에 현재 `project_id`를 넣는다.
- [ ] delete/update의 optimistic update, success 처리, query invalidation key가 변하지 않는지 확인한다.
- [ ] 화면에서 `project_id`가 아직 준비되지 않은 상태에 mutation 버튼이 노출되는 경로가 없는지 확인한다.

### 테스트 매트릭스

| 범주 | 최소 회귀 테스트 |
|---|---|
| 멤버 SQL scope | 각 update/delete/salary에 대해 허용 프로젝트 A의 멤버는 DML 수행, B의 멤버는 `PERMISSION_PROJECT_SCOPE_DENIED`와 DML 0회, missing/malformed/nonexistent PK도 DML 0회. DML query에 실제 A project predicate가 bind되는지 검증. |
| Issue 단건 scope | `deleteProjectIssue`, `updateIssueCoworkers`에서 Issue A/A는 write 1회, project A + Issue B는 Jira app-field/property write 0회, project ID 누락·Issue ID 불량·미편입 Issue도 write 0회. |
| assigned-date 다건 | `[A1, B1]` 중 하나라도 범위 밖이면 `recordAssignedDateOnce` 0회; 전부 A면 기존 `{recorded, skipped}` 계약 유지. property 500은 기존처럼 `skipped`이다. |
| guard + direct invoke | MEMBER_ONLY/TEAM_ONLY principal에서 payload `project_id=A`와 child/Issue `B`를 조합한 직접 invoke를 controller 단위로 재현한다. guard의 A 통과 뒤 서비스 실제 소속 확인에서 거부됨을 검증한다. ALL/admin도 존재하지 않거나 미편입 child/Issue는 거부한다. |
| 기존 회귀 | `SalaryPolicyLeak.test.js`, `ProjectUsersSalaryLeak.test.js`, `recordIssueAssignedDate.test.js`, IssueAnalysis/Gantt의 `isIssueInProjects` 소비 테스트를 갱신·실행한다. |
| 통합 | `npm test -- --runInBand`, `static/ui`의 `npm test -- --runInBand`, `CI=true npm run build`, app root `forge lint`를 실행한다. |

## 8. 구현 시 주의점

- 멤버 조회 후 DML을 PK 단독 조건으로 실행하면 TOCTOU가 다시 열리므로, 반드시 조회로 얻은 `actualProjectId`를 DML predicate에도 넣는다.
- Issue 소속 검증은 client payload로 만든 project ID와 대상 Issue를 단순 비교하는 방식이 아니다. Jira의 실제 `moves_RMS_projectId`를 조회해야 한다.
- `recordIssueAssignedDate`의 “best-effort” 성격을 권한 실패까지 확장하면 P0가 재발한다. authorization/ownership은 항상 fail-close, property write 실패만 skip이다.
- P0-4 `updateProjectIdField`는 이 설계의 대상이 아니다. 해당 resolver를 함께 바꾸어 계약·권한 정책을 넓히지 않는다.
