# P0-1 통합 검증 리포트

검증일: 2026-08-28  
범위: `project-child-scope-hardening` 설계서의 여섯 child-resource mutation

## 통과

### 1. Resolver 등록·권한·Controller → Service 계약

| 경계면 | 생산자 | 소비자 | 결과 |
| --- | --- | --- | --- |
| 멤버 삭제 | `ProjectUsersController.js:21` | `ProjectUsersService.js:104` | `payload`, `principal`이 전달되고 `project_id`를 요구한다. |
| 멤버 역할/등급 수정 | `ProjectUsersController.js:28` | `ProjectUsersService.js:140` | `context.accountId`와 `principal`이 모두 전달된다. |
| 멤버 급여 수정 | `ProjectUsersController.js:53` | `ProjectUsersService.js:241` | `context.accountId`와 `principal`이 모두 전달된다. |
| Issue 제외 | `ProjectUsersController.js:33` | `ProjectUsersService.js:306` | `principal`이 전달되고 write 전에 Issue 소속을 검사한다. |
| coworker 갱신 | `ProjectUsersController.js:36` | `ProjectUsersService.js:420` | `principal`이 전달되고 write 전에 Issue 소속을 검사한다. |
| 배정일 기록 | `ProjectUsersController.js:39` | `ProjectUsersService.js:446` | accountId는 context에서 주입되고 principal도 전달된다. |

여섯 resolver는 기존 `guardedDefine` 경로를 유지한다. `PermissionMap.js:136-149`의 `inherited` grant도 유지되며, 이제 프런트 `project_id`가 guard의 조기 범위 차단에 사용되고 service가 실제 자식 소속을 재확인한다.

### 2. 멤버 실제 소속 확인 및 DML 복합 predicate

| 경계면 | 생산자 | 소비자 | 결과 |
| --- | --- | --- | --- |
| 실제 project 조회 | `ProjectUsersQuery.js:121` | `ProjectUsersRepository.js:220`, `ProjectChildScope.js:26` | `project_member_id`로 실제 `project_id`를 조회하고, 요청값과 다르면 거부한다. |
| 프로젝트 범위 fail-close | `ProjectChildScope.js:16` | `ProjectChildScope.js:32` | principal 누락·UUID 오류·허용 범위 밖 프로젝트를 `PERMISSION_PROJECT_SCOPE_DENIED`로 거부한다. |
| 삭제 DML | `ProjectUsersQuery.js:54` | `ProjectUsersService.js:106` | `(project_member_id, project_id)`를 함께 bind하고 `rowsAffected !== 1`이면 실패한다. |
| 역할/등급 DML | `ProjectUsersQuery.js:81` | `ProjectUsersService.js:150` | 동일한 복합 predicate 및 post-DML fail-close가 적용된다. |
| 급여 DML | `ProjectUsersQuery.js:111` | `ProjectUsersService.js:267` | 동일한 복합 predicate 및 post-DML fail-close가 적용된다. |

### 3. Issue 실제 소속 확인 → Jira write 계약

| 경계면 | 생산자 | 소비자 | 결과 |
| --- | --- | --- | --- |
| Issue 입력/범위 검증 | `ProjectChildScope.js:35` | `ProjectUsersService.js:307,421,447` | 빈 값·중복·100건 초과·형식 오류·principal 누락은 write 전에 거부한다. |
| Jira 소속 확인 | `ProjectChildScope.js:43` | `IssueApi.js:504` | 모든 Issue가 `moves_RMS_projectId`와 일치하는지 `as: 'user'` JQL로 확인한다. |
| Issue 제외 write | `ProjectUsersService.js:306` | `setAppFieldValueForIssues` | 소속 확인이 성공한 뒤에만 앱 필드를 해제한다. |
| coworker write | `ProjectUsersService.js:420` | `mergeIssueProperty` | 소속 확인이 성공한 뒤에만 property를 갱신한다. |
| 배정일 write | `ProjectUsersService.js:446` | `recordAssignedDateOnce` | 전체 Issue 소속 확인이 성공한 뒤에만 best-effort 기록을 시작한다. |

### 4. Frontend invoke payload → backend input 계약

| Resolver | 생산자 (frontend) | 소비자 (backend) | 결과 |
| --- | --- | --- | --- |
| `updateProjectMemberSalary` | `SalaryManagementPage.jsx:112` | `ProjectUsersService.js:241` | `{...params, project_id}` 전달. |
| `deleteProjectUsersByKey` | `ProjectUserPanel.jsx:177` | `ProjectUsersService.js:104` | `{project_member_id, project_id}` 전달. |
| `updateProjectUsersByKey` | `ProjectUserPanel.jsx:196-197` | `ProjectUsersService.js:140` | `{...params, project_id}` 전달. |
| `deleteProjectIssue` | `ProjectIssueTable.jsx:328` | `ProjectUsersService.js:306` | `{issueId, customFieldId, project_id}` 전달. |
| `updateIssueCoworkers` | `ProjectIssueTable.jsx:374` | `ProjectUsersService.js:420` | `{issueId, accountIds, project_id}` 전달. |
| `recordIssueAssignedDate` | `IssueAddModal.jsx:116` | `ProjectUsersService.js:446` | `{issueIds, project_id}` 전달. |

성공 응답의 소비 방식도 기존 계약과 호환된다. `deleteProjectIssue`는 `result.success === true`를 검사하고 (`ProjectIssueTable.jsx:329`), coworker 갱신은 `result.success` 분기를 유지하며 (`ProjectIssueTable.jsx:375`), 급여 수정도 `result.success`를 확인한다 (`SalaryManagementPage.jsx:115`). query key·i18n 추가/변경은 없다.

### 5. 범위 외 P0-4 미변경

`ProjectUsersController.js:31`의 `updateProjectIdField`는 기존대로 `payload`만 넘기며, `ProjectUsersService.js:303`의 구현도 변경되지 않았다. 설계서가 명시한 P0-4 분리 범위와 일치한다.

### 6. 실행 검증

| 명령 | 결과 |
| --- | --- |
| `npm test -- --runInBand src/resolver/projectIssue/__test__/ProjectChildScope.test.js src/resolver/projectIssue/__test__/ProjectUsersSalaryLeak.test.js src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js src/resolver/__test__/SalaryPolicyLeak.test.js` | 통과: 4 suites, 43 tests. console error는 의도된 salary/KVS 및 Issue property 500 mock 경로다. |
| `static/ui: npm test -- --runInBand src/components/salary/__test__/salaryRenderGuard.test.js` | 통과: 1 suite, 6 tests. |
| `forge lint` | 통과. 오류 출력 및 실패 종료 없음. |

## 실패

없음. 현재 설계 범위에서 생산자와 소비자의 입력·응답 계약 불일치는 발견하지 못했다.

## 미검증

1. **Frontend mutation payload 회귀 테스트 부재**
   - 대상: `SalaryManagementPage.jsx:112`, `ProjectUserPanel.jsx:177,196-197`, `ProjectIssueTable.jsx:328,374`, `IssueAddModal.jsx:116`.
   - 현재 값은 정적으로 교차 확인했고 build 입력까지 통과했지만, 각 interaction에서 `invoke()` payload의 `project_id`를 assert하는 프런트 단위/통합 테스트는 없다.
   - 권장: 각 화면의 mutation function을 mock `invoke`로 실행해 정확한 payload와 기존 query invalidation을 검증한다.

2. **Service 단위의 end-to-end write 차단 매트릭스가 불완전함**
   - `ProjectChildScope.test.js`는 helper의 member/Issue 소속 거부를 검증하지만, 여섯 service 각각에 대해 “범위 불일치 시 repository/Jira write가 0회”인 테스트는 아직 없다.
   - 특히 `recordIssueAssignedDate.test.js`는 `ProjectChildScope`를 mock하므로 (`recordIssueAssignedDate.test.js:28-30`) 실제 사전 소속 확인과 recorder의 연결을 함께 검증하지 않는다.
   - 권장: 각 service에서 A 프로젝트 claim + B child/Issue 조합을 주고 DML/`setAppFieldValueForIssues`/`mergeIssueProperty`/`recordAssignedDateOnce`가 호출되지 않음을 assert한다.

3. **현재 작업 세션에서 CI production build 완료 결과 미회수**
   - 실행한 `CI=true npm run build`는 locale merge와 `Creating an optimized production build...`까지 진행됐으나, 실행 환경이 build process의 최종 종료 코드와 asset manifest를 회수하지 못했다.
   - 따라서 이 리포트에서는 build를 통과 처리하지 않는다. 이전 frontend 구현 보고서의 성공 결과는 참고만 하며, 현재 수정본 기준의 재실행 완료 로그가 필요하다.

