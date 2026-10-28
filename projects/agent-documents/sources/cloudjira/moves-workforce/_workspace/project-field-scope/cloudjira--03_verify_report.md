# P0-4 통합 정합성 검증 보고서

검증 범위: `updateProjectIdField`의 프로젝트 범위·Jira Issue 접근성 검증과 두 프런트 호출 경로.

## 통과

### Resolver 등록·권한 경계

| 생산자 | 소비자 | 결과 |
|---|---|---|
| `src/index.js:CONTROLLER_REGISTRARS`가 `registerProjectUsersController`를 등록 | `src/resolver/projectIssue/ProjectUsersController.js:31`가 `guardedDefine(resolver, 'updateProjectIdField', ...)`를 정의 | 통과. `src/permission/PermissionMap.js:139`도 `PROJECT` write / `inherited`로 매핑되어 있다. |
| `ProjectUsersController.js:31`의 resolver callback이 `payload, principal`을 생산 | `ProjectUsersService.js:282`가 `(payload, principal)`으로 소비 | 통과. principal 누락이 서비스까지 열리지 않는다. |

### 프런트 요청 ↔ 백엔드 입력 계약

| 생산자(프런트) | 소비자(백엔드) | 결과 |
|---|---|---|
| `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:104-109` — `{ issueId: checkItems, value: project_id, project_id, customFieldId }` | `ProjectUsersService.js:282` — `{ customFieldId, issueId, value, project_id }` | 통과. 작업 등록의 배열 Issue ID와 프로젝트 범위 식별자가 모두 전달된다. |
| `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:540-545` — `{ issueId, value: accountIds[], project_id: projectId, customFieldId }` | `ProjectUsersService.js:282` | 통과. 간트/작업 트리 협업자 수정도 같은 필수 `project_id` 계약을 충족한다. |

`static/ui/src` 전체에서 `updateProjectIdField` invoke는 위 두 곳뿐임을 교차 확인했다. 새 query key나 i18n 키는 추가되지 않았고, 생성 locale 파일을 직접 편집한 구현도 없다.

### Write 이전 검증 순서 및 실패 시 무기록

| 순서 | 생산자 | 소비자/효과 | 결과 |
|---|---|---|---|
| 1 | `ProjectUsersService.js:285`의 `customFieldId` 검사 | 누락 시 `projectScopeDenied()` | 통과 |
| 2 | `ProjectUsersService.js:288`의 `assertExistingWritableProject` | `ProjectChildScope.js:25-34`가 UUID/principal scope 후 SQL `project` 존재를 확인 | 통과 |
| 3 | `ProjectUsersService.js:289`의 `areIssuesAccessible(issueId, 'user')` | `IssueApi.js:521-535`가 numeric·중복·1~100개를 검사한 뒤 Jira JQL을 반드시 `as: 'user'`로 호출 | 통과 |
| 4 | `ProjectUsersService.js:295-299` | 위 단계가 모두 성공한 뒤에만 app-field writer(`asApp` 플랫폼 예외)를 호출 | 통과 |
| 5 | `ProjectUsersService.js:302` | 성공 후에만 participant cache를 무효화 | 통과 |

`updateProjectIdFieldScope.test.js`는 프로젝트 검증 실패 시 Issue 접근성 검사와 writer가 호출되지 않는 것, 접근 불가 Issue에서 writer가 호출되지 않는 것, 정상 요청만 기존 writer payload로 진행되는 것을 검증한다. `IssueApiAccessibility.test.js`는 `as: 'user'` 사용과 numeric ID/중복/부분 검색 결과의 거부를 검증한다.

### 응답 계약

- 성공 시 Service가 `undefined`를 반환하므로 기존 `responseWrapper` 결과는 `{ success: true }`다.
- `IssueAddModal`은 `success === false`만 실패로 처리하고, `useUpdateCoworkers`는 `success !== true`를 실패로 처리한다. 두 호출 모두 성공 content를 요구하지 않아 기존 성공 shape와 호환된다.
- 범위·프로젝트 존재·Issue 접근성 실패는 모두 `PERMISSION_PROJECT_SCOPE_DENIED`로 responseWrapper의 기존 오류 shape를 사용한다.

### 회귀·실행 검증

- Backend 집중 회귀: `npm test -- --runInBand src/resolver/projectIssue/__test__ src/api/jira/issue/__test__/IssueApiAccessibility.test.js src/resolver/workAssignment/__test__ src/resolver/projectDashboard/__test__/ChartTitleScope.test.js`
  - **10 suites / 103 tests 통과**
  - P0-1(project child scope), P0-2(work assignment), P0-3(chart title) 회귀를 함께 포함했다.
- Frontend 전체 Jest: 프런트 담당자의 `npm test -- --runInBand` **exit 0** 결과를 확인했다. 본 검증 중 실행한 전체 Jest 재실행도 PASS 출력만 확인됐으나 중복 실행 방지를 위해 최종 완료를 기다리지는 않았다.
- `forge lint`: app root에서 완료됐고 진단 출력이 없었다.
- `git diff --check`: whitespace error 없음. CRLF 변환 경고만 출력됐다.

## 실패

없음.

## 미검증

| 항목 | 사유 | 후속 확인 |
|---|---|---|
| `CI=true npm run build` 최종 결과 | build는 `prebuild → merge → craco build`의 `Creating an optimized production build...`까지 관찰됐으나, 이 검증 시점에 완료 exit code를 획득하지 못했다. | 단일 build 프로세스 완료 후 exit 0 및 `bundle:check` 통과를 확인한다. |
| 실제 Jira 권한 응답 | 단위 테스트는 Jira search를 mock한다. | 개발 사이트에서 접근 가능한 Issue와 접근 불가 Issue 각각을 호출해 asUser 200/미노출 시 writer 미호출을 확인한다. |

