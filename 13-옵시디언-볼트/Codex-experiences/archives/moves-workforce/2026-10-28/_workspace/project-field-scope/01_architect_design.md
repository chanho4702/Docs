# P0-4 프로젝트 필드 연결 범위 보강 설계서

## 1. 개요 / 영향 범위

`updateProjectIdField`는 `asApp()` 전용 Jira app field endpoint를 호출한다. 현재 resolver guard는 payload에 `projectId`/`project_id`가 없으면 프로젝트 범위 확인을 건너뛰고, Service도 요청 프로젝트의 실재 여부와 대상 Issue의 호출자 접근 가능 여부를 확인하지 않는다. 따라서 프로젝트 write 권한이 있는 호출자가 임의 Jira Issue에 RMS 프로젝트 필드를 기록할 수 있다.

- 백엔드
  - 수정: `src/resolver/projectIssue/ProjectUsersController.js`, `ProjectUsersService.js`, `ProjectChildScope.js`
  - 수정: `src/api/jira/issue/IssueApi.js` (대상 Issue의 `asUser` 접근성 전용 확인 helper)
  - 수정: `src/permission/PermissionMap.js` (`updateProjectIdField`의 payload 프로젝트 키를 계약상 필수로 주석화; permission resource/action은 유지)
  - 기존 `AppFieldValueApi.setAppFieldValueForIssues`의 `asApp()` write는 변경하지 않는다. 이 endpoint는 readOnly app field write의 플랫폼 예외다.
- 프론트엔드
  - 수정: `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx`
  - 수정: `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`
  - 작업 트리(`ProjectTreeView`)는 `useUpdateCoworkers({projectId})`를 재사용하므로 별도 invoke 수정이 없다.
- DB: 스키마/마이그레이션 없음. 기존 MySQL `project` 테이블을 읽어 프로젝트 존재를 확인한다.
- i18n: 없음. 실패는 기존 공통 실패 toast 경로를 그대로 사용한다.

비범위: 이미 연결된 Issue의 소속 재검증(P0-1/P0-2), Jira Issue 삭제, 구독/프로젝트 삭제 lifecycle, app field 종류별 정책 재설계는 이번 항목에서 다루지 않는다.

## 2. 경계면 계약 (가장 중요)

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 경로 |
|---|---|---|---|
| `updateProjectIdField` | `{ project_id: string(UUID, 필수), customFieldId: string(필수), issueId: string\|number\|(string\|number)[](1~100개의 양의 Jira numeric issue ID, 중복 불가), value: string\|string[] }` | `{ success: true }` | `IssueAddModal.runRegister`, `useUpdateCoworkers.mutationFn` |

실패는 `responseWrapper` 표준 `{ success: false, error: { name, code, message, cause } }`이다. 이 변경은 기존의 성공 시 payload 없는 응답을 보존한다.

`project_id`는 필수이며 `value`로 대체하지 않는다. 작업 등록은 `value === project_id`이고, 협업자 편집은 `value`가 accountId 배열이므로 프로젝트 범위의 출처는 항상 `project_id`다.

## 3. 백엔드 설계

### 3-1. Controller 및 PermissionMap

1. `ProjectUsersController`의 등록을 다음처럼 바꾼다.

   ```js
   guardedDefine(resolver, 'updateProjectIdField', ({payload, principal}) =>
       updateProjectIdFieldService(payload, principal));
   ```

2. `PermissionMap.updateProjectIdField`는 현재의 `W('PROJECT', 'inherited')`를 유지한다. 단, payload의 `project_id`가 필수라는 주석을 추가한다. 이로써 guard의 `enforceProjectScope`가 scoped principal에 대해 1차 범위 검증을 수행한다.
3. guard 통과는 데이터 범위 확정이 아니므로, 아래 Service 검증을 반드시 추가한다. `principal` 누락은 Service에서 fail-close 한다.

### 3-2. ProjectChildScope 공용 검증

`ProjectChildScope.js`에 다음 공용 helper를 추가한다.

```js
assertExistingWritableProject({ projectId, principal }) => Promise<string>
```

처리 순서:

1. 기존 `assertProjectIdWritable({projectId, principal})`로 UUID 형식, principal 존재, scoped project 권한을 확인한다.
2. `findProjectByIdRepository([projectId])`로 MySQL `project` 행을 조회한다.
3. 첫 row가 없으면 `projectScopeDenied()`를 던진다. 존재/권한 여부를 구별해 노출하지 않는다.
4. row의 `project_id`를 반환한다. 이후 write 및 추가 검증에는 반환된 실제 UUID를 사용한다.

기존 `assertProjectIdWritable`와 `assertIssueIdsInProject`의 동작은 바꾸지 않는다. 이번 helper는 아직 RMS 프로젝트에 연결되지 않은 Issue를 등록할 수 있어야 하므로 `areIssuesInProject`를 재사용하지 않는다.

### 3-3. Jira Issue 접근성 확인

`IssueApi.js`에 다음 helper를 추가한다.

```js
areIssuesAccessible(issueIds, as = 'user') => Promise<boolean>
```

- 입력은 1~100개의 **양의 numeric Jira issue ID**만 허용하고, 중복·비정수·0·100건 초과는 `false`를 반환한다. `AppFieldValueApi.normalizeIssueIds`와 동일한 write 대상 정의를 따른다.
- `requestJiraJson({ as: 'user', ... })`로 JQL `id = ... OR id = ...` 검색을 1회 수행한다. `fields=key`, `maxResults=100`만 요청한다.
- 검색 결과 수가 정규화된 요청 수와 정확히 같을 때만 `true`다. Jira 검색 권한으로 보이지 않는 Issue, 삭제된 Issue, 존재하지 않는 ID는 모두 `false`다.
- `as` 인자는 테스트와 명시적 호출 호환을 위한 것이며, `updateProjectIdField`에서는 반드시 `'user'`만 전달한다. `asApp()` write 이전에 호출자 권한을 기준으로 확인하는 것이 핵심이다.

### 3-4. Service write gate

`updateProjectIdFieldService` 시그니처를 다음으로 바꾼다.

```js
updateProjectIdFieldService({ customFieldId, issueId, value, project_id }, principal)
```

다음 순서를 고정한다.

1. `customFieldId`가 비어 있으면 `projectScopeDenied()`로 fail-close 한다.
2. `assertExistingWritableProject({projectId: project_id, principal})`를 호출한다.
3. `areIssuesAccessible(issueId, 'user')`가 `true`인지 확인한다. false면 `projectScopeDenied()`를 던진다.
4. 기존과 동일하게 value를 직렬화 전 원본으로 준비한다. 배열은 `[{ accountId }]`, 그 외는 `String(value ?? '')`다.
5. 검증을 모두 통과한 뒤에만 `setAppFieldValueForIssues({ fieldIdOrKey: customFieldId, issueIds: issueId, value: rawValue })`를 호출한다.
6. write가 성공한 경우에만 기존 `invalidateProjectParticipantIssues()`를 호출하고 `undefined`를 반환한다.

유효성 실패, 프로젝트 미존재, Jira 접근 불가 모두 `PERMISSION_PROJECT_SCOPE_DENIED`로 통일한다. app field write의 Jira 4xx/5xx는 기존 `ForgeAPIError`가 그대로 전파되며, `responseWrapper`가 표준 실패 shape로 감싼다.

## 4. 프론트엔드 설계

### 4-1. 작업 등록 모달

`IssueAddModal.runRegister`의 invoke payload에 기존 `project_id` prop을 추가한다.

```js
invoke('updateProjectIdField', {
    issueId: checkItems,
    value: project_id,
    project_id,
    customFieldId: await getCustomFieldId(CustomFieldId.projectIdField),
})
```

`checkItems`는 Jira search 결과의 numeric `issue.id`이고 기존대로 100건 페이지 내에서 선택된다. 현재 takeover 확인, 성공 toast, `recordIssueAssignedDate` 후처리, cache invalidation은 바꾸지 않는다.

### 4-2. 간트/작업 트리 협업자 편집

`useUpdateCoworkers({projectId, toast})`의 invoke payload에 `project_id: projectId`를 추가한다.

```js
invoke('updateProjectIdField', {
    issueId,
    value: Array.isArray(accountIds) ? accountIds : [],
    project_id: projectId,
    customFieldId,
})
```

`projectId`는 `GanttPage` 및 `ProjectTreeView`가 현재 상세 프로젝트의 `project_id`로 전달한다. 기존 낙관 패치/rollback 및 Jira search 재조회 금지 규칙은 유지한다.

### 4-3. 상태·쿼리키·권한

- 새 Zustand state, query key, route, i18n 키는 추가하지 않는다.
- 화면 권한 UI는 기존대로 두고, 서버가 principal 기반으로 최종 범위와 Jira 접근성을 확정한다.

## 5. DB 설계

- 테이블 변경 없음.
- 존재 확인은 기존 `ProjectQuery.FIND_BY_ID` / `findProjectByIdRepository([projectId])`를 재사용한다.
- 별도 FK나 app field write 이력 테이블을 만들지 않는다.

## 6. i18n 키 목록

추가 없음. 유효성/권한 실패는 현재 `common.toast.title.Fail`, `common.toast.description.error`, 간트의 기존 error handling으로 표시한다.

## 7. 구현 작업 분해

### Backend

- [ ] `ProjectUsersController`가 `principal`을 Service에 전달한다.
- [ ] `ProjectChildScope`에 프로젝트 실재 + writable 범위를 확인하는 공용 helper를 추가한다.
- [ ] `IssueApi`에 `asUser` 기반 batch Issue 접근성 확인 helper를 추가한다.
- [ ] `ProjectUsersService.updateProjectIdFieldService`에 `project_id`, principal, custom field ID, 대상 Issue 검증을 app write 전에 적용한다.
- [ ] `PermissionMap`에 `project_id` 필수 계약을 문서화한다.
- [ ] focused tests:
  - principal 누락/잘못된 UUID/범위 밖/존재하지 않는 프로젝트가 app write 전에 거부되는지
  - numeric이 아닌 ID, 중복, 0, 101건 요청이 app write 전에 거부되는지
  - `asUser` 접근 불가 Issue가 app write 전에 거부되는지
  - 정상 project + 접근 가능 Issue만 writer를 호출하고 성공 shape가 유지되는지
  - `areIssuesAccessible`가 반드시 `as: 'user'`에서 결과 수 일치를 확인하는지

### Frontend

- [ ] 작업 등록 invoke에 `project_id`를 추가한다.
- [ ] `useUpdateCoworkers` invoke에 `project_id: projectId`를 추가한다.
- [ ] 해당 invoke/mock 테스트의 예상 payload를 갱신한다.
- [ ] 기존 실패 toast 및 간트 낙관 갱신/rollback이 유지되는지 확인한다.

### 통합 검증

- [ ] resolver 입력 계약과 두 프론트 invoke payload를 교차 검증한다.
- [ ] backend focused Jest, frontend focused Jest, backend 전체 Jest를 실행한다.
- [ ] `CI=true npm run build` 및 app root `forge lint`를 실행한다.
