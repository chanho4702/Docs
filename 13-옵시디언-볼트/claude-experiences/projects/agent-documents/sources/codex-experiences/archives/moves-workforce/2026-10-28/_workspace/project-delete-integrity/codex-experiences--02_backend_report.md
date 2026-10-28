# 프로젝트 삭제 무결성 — Backend 구현 보고

## 구현 범위

- `v020_alter_project_add_deletion_state`, `v021_create_project_deletion_table`, `v022_create_project_deletion_issue_table` migration을 등록했습니다.
- `deleteProject`는 기존 순차 삭제 대신 `ProjectDeletionService.deleteProjectService`의 재호출 가능한 동기 saga로 연결했습니다.
- Jira Issue는 삭제하지 않고 `movesRms` property를 삭제한 뒤 `moves_RMS_projectId` app field를 빈 문자열로 해제합니다.
- discovery는 `asApp`, 요청자 접근 확인은 `asUser`로 분리했습니다. 접근 불가 Issue는 ID/key/summary를 응답에 넣지 않고 `BLOCKED_JIRA_ACCESS` 상태와 개수만 반환합니다.
- property DELETE의 404는 멱등 성공으로 처리합니다. 각 Issue의 property/field 완료 시각을 별도로 남겨 부분 실패 후 재시도합니다.
- SQL child cleanup은 기존 순서를 유지하며 DELETE의 0 rows도 정상으로 취급합니다. 정상 완료하면 `project_deletion_issue`를 먼저, `project_deletion`을 다음으로 즉시 삭제합니다.
- KVS cache만 실패하면 `COMPLETED_WITH_WARNINGS` 행을 유지하고 같은 `deleteProject` 호출은 cache cleanup만 재시도합니다.

## Resolver / 실제 응답 계약

### `deleteProject`

성공 응답은 responseWrapper 적용 후 아래 형태입니다.

```js
{
  success: true,
  content: {
    deletion: {
      projectId: string,
      status: 'DISCOVERING' | 'UNLINKING' | 'SQL_CLEANUP' | 'FAILED' |
        'BLOCKED_JIRA_ACCESS' | 'COMPLETED_WITH_WARNINGS' | 'COMPLETED',
      stage: string,
      completed: boolean,
      retryable: boolean,
      blockedIssueCount: number
    }
  }
}
```

정상 종료일 때만 `completed: true`이며, 상태 저장 행은 즉시 제거됩니다. `success: true`라도 `completed: false`이면 UI가 성공 toast/목록 제거를 해서는 안 됩니다.

### `getProjectDeletionStatus`

`PROJECT read`, `detail` scope로 등록했습니다. 진행/실패 행이 존재할 때 위와 동일한 `content.deletion` DTO를 반환합니다. 행이 없으면 `PROJECT_DELETION_NOT_FOUND` 실패 응답입니다.

## 등록

- `ProjectController`: `deleteProject`, `getProjectDeletionStatus`
- `PermissionMap`: `deleteProject`은 기존 `PROJECT write/detail`, status는 `PROJECT read/detail`
- 신규 파일: `ProjectDeletionQuery.js`, `ProjectDeletionRepository.js`, `ProjectDeletionService.js`

## 검증

- `npm test -- --runInBand src/api/jira/issue/__test__/IssueApiAccessibility.test.js src/resolver/projectIssue/__test__/ProjectChildScope.test.js` — 2 suites, 7 tests 통과
- `npm test -- --runInBand test/permission/permissionMap.contract.test.js` — 1 suite, 24 tests 통과
- `npm test -- --runInBand src/resolver/project` — 집중 회귀 실행 통과 (기존 의도된 console error mock 출력 포함)

## 후속 통합 확인 필요

- frontend는 `completed === true`에만 optimistic 제거·route 이동·query invalidation을 수행해야 합니다.
- project deletion 상태의 UI polling/retry 및 삭제 중 Issue metadata write 차단은 frontend/integration 단계에서 함께 검증해야 합니다.
