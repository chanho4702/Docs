# P0-2 `assignWorkItem` Issue 소속 검증 설계서

## 1. 개요 / 영향 범위

`assignWorkItem`은 `payload.projectId`에 대한 Forge 권한 가드만 통과하면, 대상 Jira Issue가 그 RMS 프로젝트에 실제로 연결되어 있는지 확인하지 않고 담당자와 coworker를 변경한다. 따라서 프로젝트 A에 대한 write 권한을 가진 사용자가 프로젝트 B의 Issue 식별자를 직접 전달할 수 있다.

- 백엔드: `src/resolver/workAssignment/WorkAssignmentWriter.js`의 write 전 검증을 보강한다. 기존 `src/api/jira/issue/IssueApi.js`의 `areIssuesInProject()`를 재사용한다.
- Controller/권한: `WorkAssignmentController`와 `PermissionMap.assignWorkItem`은 이미 `guardedDefine` 및 `project: 'inherited'`를 사용한다. 등록·권한 선언은 변경하지 않는다.
- 프론트: `useAssignWorkItem(projectId)`가 이미 `projectId`, `issueId`, `issueKey`를 전달하고 기존 성공 응답만 소비한다. 호출/쿼리키/캐시 패치 변경은 없다.
- DB/KVS: 변경 없음.
- i18n: 신규 화면 문구와 오류 문구를 추가하지 않는다. 권한 경계 실패는 기존 resolver 오류 shape와 `PERMISSION_PROJECT_SCOPE_DENIED` 코드로 전달하며, 현재 배정 UI의 일반 mutation 오류 처리 흐름을 유지한다.

## 2. 경계면 계약 (가장 중요)

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `assignWorkItem` | `{ projectId: string, issueId?: string, issueKey?: string, assigneeAccountId?: string \| null, coworkerAccountIds?: string[] }` | `{ success: true, content: { issueId: string, issueKey: string, applied: { assignee: boolean, coworkers: boolean }, item: QueueItem, previous: PreviousAssignment } }` | `useAssignWorkItem(projectId)` / `assignmentKeys.board(projectId)` |

실패 응답은 기존 `responseWrapper` 계약을 유지한다.

```js
{
  success: false,
  error: {
    name: 'ProjectScopeDeniedError',
    code: 'PERMISSION_PROJECT_SCOPE_DENIED',
    message: 'You do not have access to this project',
    cause: ''
  }
}
```

`projectId`가 누락되었거나 변경 대상이 없는 경우 등 기존 입력 검증 오류와, Jira가 Issue를 찾지 못하거나 호출자가 볼 수 없는 경우의 기존 실패 동작은 바꾸지 않는다. 소속 검증 불일치만 위의 권한 경계 오류로 fail-close한다.

## 3. 백엔드 설계

### 변경 지점과 재사용 경로

1. `src/resolver/workAssignment/WorkAssignmentController.js`
   - 변경하지 않는다. `guardedDefine('assignWorkItem', ...)`가 먼저 `payload.projectId`의 inherited project scope를 확인한다.
   - `principal`은 이 write 경로의 Issue 소속 확인에 전달하지 않는다. Jira `asUser()` 호출이 현재 호출자의 Issue browse 권한을 별도로 강제한다.

2. `src/resolver/workAssignment/WorkAssignmentWriter.js`
   - `IssueApi` import에 `areIssuesInProject`를 추가한다.
   - 기존 첫 번째 `getIssueForAssignmentApi(target, 'user')` 성공 직후, 모든 Jira write보다 앞에 아래 검증을 둔다.
     1. 반환된 `beforeRaw.id`, `beforeRaw.key`가 모두 존재해야 한다. 없으면 기존 `ASSIGNMENT_ISSUE_REQUIRED`를 유지한다.
     2. 호출자가 `issueId`와 `issueKey`를 함께 보냈다면, 둘 다 이 단건 GET이 확인한 **동일한 canonical Issue**를 가리켜야 한다. `issueId`는 `beforeRaw.id`와 비교하고, key는 대소문자 차이만 허용하여 `beforeRaw.key`와 비교한다. 하나라도 다르면 `ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)`로 거부한다.
     3. canonical key 하나만 사용해 `await areIssuesInProject([beforeRaw.key], projectId, 'user')`를 호출한다. `false` 또는 검증 호출 실패는 같은 `ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)`로 fail-close한다.
   - 검증 성공 이후에만 기존 `assignIssueApi`와 `mergeIssueProperty`를 실행한다.
   - write 대상도 클라이언트가 보낸 식별자가 아니라 canonical 반환값을 사용한다.
     - assignee PUT 및 재조회: `beforeRaw.key`
     - coworker property merge: `String(beforeRaw.id)` (숫자 ID 선호 규약 유지)
     - 이렇게 하면 함께 전달된 `issueId`/`issueKey`가 서로 다른 Issue를 겨냥해 두 Issue에 분리 write되는 논리 오류도 차단한다.
   - 실패 생성은 `src/error/ProjectScopeError.js`와 `ErrorCodes.PERMISSION_PROJECT_SCOPE_DENIED`를 사용한다. 새 ErrorCode는 만들지 않는다. P0-1의 `ProjectChildScope.assertIssueIdsInProject()`와 같은 보안 코드·fail-close 경계를 유지한다.

3. `src/api/jira/issue/IssueApi.js`
   - 기능 추가 없이 기존 `areIssuesInProject(issueIds, projectId, as = 'user')`를 그대로 사용한다.
   - 이 함수는 Jira JQL `moves_RMS_projectId` 조건과 `as: 'user'`를 사용하며, 권한 없는/존재하지 않는/다른 RMS 프로젝트 Issue를 `false`로 수렴시킨다.

### 호출 순서

```text
guardedDefine inherited project scope
  → payload 형식 검증
  → GET /issue/{target} asUser (canonical id/key 확보 및 Jira visibility 확인)
  → issueId·issueKey 동일 Issue 확인
  → JQL: canonical key AND moves_RMS_projectId = payload.projectId, asUser
  → assignee PUT asUser (필요 시)
  → coworker property merge (필요 시)
  → GET /issue/{canonical key} asUser
  → 기존 content 조립·반환
```

JQL은 앱 프로젝트 필드의 소속 관계를 판정하는 기존 단일 출처다. 검색 인덱스 지연으로 새로 연결된 Issue가 잠시 거부될 수 있으나, 이 mutation에서는 잘못된 프로젝트 Issue를 쓰는 것보다 false negative가 안전하다. 단건 GET은 JQL을 대체하지 않고 canonical Issue 확정 및 호출자 가시성 확인에 사용한다.

### 에러 케이스

| 조건 | 오류 코드 | Jira write |
|---|---|---|
| `projectId` 누락 | `ASSIGNMENT_PROJECT_ID_REQUIRED` | 없음 |
| Issue 식별자 누락·형식 오류 | `ASSIGNMENT_ISSUE_REQUIRED` | 없음 |
| Issue가 없음 또는 호출자가 Jira에서 볼 수 없음 | 기존 Jira 조회 실패/`ASSIGNMENT_ISSUE_REQUIRED` 경로 | 없음 |
| `issueId`와 `issueKey`가 서로 다른 Issue | `PERMISSION_PROJECT_SCOPE_DENIED` | 없음 |
| canonical Issue가 `projectId`와 다른 RMS 프로젝트이거나 소속이 없음 | `PERMISSION_PROJECT_SCOPE_DENIED` | 없음 |
| 소속 확인 Jira 호출 실패 | `PERMISSION_PROJECT_SCOPE_DENIED` (fail-close) | 없음 |
| 소속 확인 후 assignee/property write 실패 | 기존 Jira API 오류 | 실패한 write 이후의 후속 write는 실행하지 않음 |

`src/index.js`의 `CONTROLLER_REGISTRARS`와 `PermissionMap`은 수정하지 않는다.

## 4. 프론트엔드 설계

변경 없음.

- `static/ui/src/pages/projectDetail/assignment/useAssignWorkItem.js`는 이미 hook 인자로 받은 `projectId`를 payload에 넣는다.
- 성공 응답의 `content.item`, `content.previous`, `content.applied`는 변경되지 않으므로 `patchAssignmentCache` 및 `patchProjectMetric` 동작을 유지한다.
- 실패 시 캐시 patch가 실행되지 않아 화면은 기존 상태를 보존한다. 새 query key, Zustand store, 권한 UI, i18n 문구를 추가하지 않는다.

## 5. DB 설계

MySQL, Forge SQL, KVS, manifest schema 변경이 없다. Jira Issue의 `moves_RMS_projectId` 앱 필드만 `asUser` JQL로 읽어 기존 연결 여부를 확인한다.

## 6. i18n 키 목록

추가 없음.

보안상 소속 불일치는 기존 `PERMISSION_PROJECT_SCOPE_DENIED` 오류 계약으로 반환한다. 세부적으로 어느 Issue/프로젝트가 불일치했는지는 프론트에 노출하지 않는다.

## 7. 구현 작업 분해

### Backend

- [ ] `WorkAssignmentWriter`에 `areIssuesInProject`, `ProjectScopeError` import 추가
- [ ] 첫 `getIssueForAssignmentApi(..., 'user')` 뒤에 canonical Issue 식별자 일치 검증 추가
- [ ] canonical key와 요청 `projectId`로 `areIssuesInProject(..., 'user')`를 호출하고 실패 시 `PERMISSION_PROJECT_SCOPE_DENIED` 반환
- [ ] assignee/property/재조회 대상을 canonical id/key로 고정
- [ ] `src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js`를 추가하여 API·설정·normalizer 의존성을 mock

### Focused test matrix

| 사례 | 기대 결과 |
|---|---|
| 프로젝트 A Issue, assignee 변경 | `areIssuesInProject([canonicalKey], A, 'user')` 통과 후 assignee PUT, 기존 content shape 유지 |
| 프로젝트 A Issue, coworker 변경 | 검증 통과 후 canonical numeric ID로 property merge |
| 프로젝트 A 권한 + 프로젝트 B Issue | `PERMISSION_PROJECT_SCOPE_DENIED`; `assignIssueApi`, `mergeIssueProperty`, cache invalidate, 사후 GET 모두 미호출 |
| 프로젝트 A 권한 + RMS 프로젝트 미연결 Issue | 동일하게 fail-close, Jira write 없음 |
| JQL 검증 API 예외 | `PERMISSION_PROJECT_SCOPE_DENIED`; Jira write 없음 |
| `issueId`와 `issueKey`가 서로 다른 Issue | scope 오류; Jira write·소속 JQL 호출 없음 |
| 존재하지 않거나 asUser로 접근 불가한 Issue | 기존 실패가 write 전에 반환됨 |
| issueId/key 형식 오류, 변경 필드 없음 | 기존 입력 오류 및 Jira write 없음 |
| assignee/property Jira write 실패 | 기존 오류 전파 및 다음 write 미실행 |

### Frontend / integration verification

- [ ] `useAssignWorkItem`의 payload·성공 응답 소비가 계약표와 동일한지 정적 대조
- [ ] backend 집중 테스트 실행: `npm test -- --runInBand src/resolver/workAssignment/__test__/WorkAssignmentWriter.test.js`
- [ ] 관련 기존 테스트 실행: `npm test -- --runInBand src/resolver/workAssignment/__test__`
- [ ] 통합 검증 후 frontend build 및 `forge lint`는 RFC-192 전체 변경 묶음에서 실행
