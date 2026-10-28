# 간트 안정성 보강 — Backend 구현 보고서

## 구현 범위

- `assertGanttIssueInProject({ projectId, issueKey, graph? })`를 `GanttService.js`에 추가했다.
  - graph가 필요한 `setGanttParent`·`moveGanttIssueToFolder`는 이미 읽은 `keySet`을 재사용한다.
  - 단건 편집인 `updateGanttSchedule`와 `setGanttIssueFolder`는 `IssueApi.isIssueInProjects(issueKey, [projectId])`로 소속을 확인한다. 프로젝트 전체 이슈·링크를 읽지 않는다.
- `setGanttIssueFolder`는 folderId가 `null`인 소속 해제도 포함해 write 전에 이슈 소속을 검증한다.
- `moveGanttIssueToFolder` saga를 `GanttFolderService.js`에 추가했다.
  - 대상 이슈/폴더 및 기존 폴더 소속을 먼저 조회한다.
  - 폴더 UPSERT 후 WBS override를 해제한다.
  - Jira property write 실패 시 이전 폴더로 UPSERT하거나(기존 폴더 있음), 새 레코드를 DELETE한다(기존 폴더 없음).
  - 보상 실패는 `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`와 원인 `{ error, compensationError }`를 포함한 `LogicalError`로 반환한다.
- `GanttController`에서 `guardedDefine`으로 resolver를 등록했고, `PermissionMap`에 `PROJECT` / `inherited` write 권한을 추가했다.

## 실제 resolver 응답 shape

모든 resolver는 기존 `guardedDefine` 공통 wrapper를 통과한다.

```js
// updateGanttSchedule 성공
{ success: true, content: { issueKey, start?: string | null, due?: string | null } }

// setGanttIssueFolder 성공
{ success: true, content: { issueKey, folderId: string | null } }

// moveGanttIssueToFolder 성공
{
  success: true,
  content: {
    issueKey: string,
    folderId: string,
    previousFolderId: string | null,
    parentKey: null,
    effectiveParent: string | null,
  },
}
```

실패 시 wrapper는 `{ success: false, error: { code, message, cause } }`를 반환한다. 프로젝트 밖 이슈는 `GANTT_ISSUE_NOT_FOUND`, 보상 실패는 `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`다.

## 등록 위치

- `src/resolver/gantt/GanttController.js`: `moveGanttIssueToFolder`
- `src/permission/PermissionMap.js`: `moveGanttIssueToFolder: W('PROJECT', 'inherited')`

`src/index.js`에는 기존 `registerGanttController`가 이미 `CONTROLLER_REGISTRARS`에 등록되어 있어 변경하지 않았다.

## 검증 결과

```text
npm test -- --runInBand
Test Suites: 85 passed, 85 total
Tests:       1367 passed, 1367 total
```

추가/갱신 테스트:

- 범위 밖 `updateGanttSchedule` no-op 차단
- `setGanttIssueFolder` 범위 검증 mock 정합성
- `moveGanttIssueToFolder` 정상 WBS 해제, Jira 실패 보상, 보상 실패 오류 코드
- PermissionMap resolver 계약 11종 갱신
