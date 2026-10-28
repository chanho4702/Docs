# 간트 안정화 1차 설계서

## 1. 개요 / 영향 범위

### 목표

간트 편집의 `projectId`를 권한 게이트용 힌트로만 신뢰하지 않고, 서버가 실제 간트 이슈 집합과 대조해 데이터 범위를 확정한다. WBS 하위 이슈를 폴더로 옮기는 드래그는 단일 resolver가 조율하며, 선행 coworker field 조회가 실패하면 무한 skeleton 대신 기존 간트 오류 UI와 재시도 동작을 제공한다.

### 영향 범위

- 백엔드
  - `src/resolver/gantt/GanttService.js`: 공용 프로젝트-이슈 소속 검증을 추출하고 `updateGanttSchedule`에 적용한다.
  - `src/resolver/gantt/GanttFolderService.js`: `setGanttIssueFolder`에 같은 검증을 적용하고, WBS 해제와 폴더 배정을 조율하는 신규 service 함수를 둔다.
  - `src/resolver/gantt/GanttController.js`: 신규 resolver를 `guardedDefine`으로 등록한다.
  - `src/permission/PermissionMap.js`: 신규 resolver를 `PROJECT` write/inherited로 선언한다.
  - `src/utils/errors/ErrorCodes.js`: 보상 실패를 식별할 코드가 없으므로 `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`를 추가한다.
- 프론트엔드
  - `static/ui/src/pages/projectDetail/gantt/useGanttData.js`: coworker field query의 실패를 간트 오류 상태로 전파하고 재시도 함수를 노출한다.
  - `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx`: 오류 상태에서 기존 `gantt.error.load` 메시지와 재시도 버튼을 보인다. WBS→폴더 드래그 전용 mutation을 주입한다.
  - `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`: 기존의 `setGanttParent(null)` + `setGanttIssueFolder(...)` 두 호출을 신규 단일 콜백으로 교체한다.
  - `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js`: `useMoveGanttIssueToFolder`를 추가해 서버 확정 응답으로 WBS와 folderIssues 캐시를 한 번에 갱신한다.
- DB
  - 스키마·migration 없음. 기존 `gantt_folder_issue`의 UPSERT/DELETE와 Jira issue property `movesRms.wbsParent`를 사용한다.
- i18n
  - 필수 신규 키 없음. 로딩 오류에는 기존 `gantt.error.load`, 재시도 버튼에는 기존 `common.retry`, mutation 실패에는 기존 `gantt.error.saveFailed`를 사용한다.
  - 제품에 `common.retry`가 없으면 `locales/kr/gantt.json`과 `locales/en/gantt.json`에 `gantt.retry`만 추가하고 `npm run merge`한다. 생성된 `ko-KR.json`/`en-US.json`을 직접 수정하지 않는다.

## 2. 경계면 계약 (가장 중요)

응답은 `guardedDefine`의 공통 response wrapper를 지난다. 아래 `content`는 `success: true`일 때의 payload이며, 실패 시 `{ success: false, error: { code, message } }` 형식을 따른다.

| resolver 함수 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| `updateGanttSchedule` (수정) | `{ projectId: string, issueKey: string, start?: 'YYYY-MM-DD' \| null, due?: 'YYYY-MM-DD' \| null }` | `{ success: true, content: { issueKey: string, start?: string \| null, due?: string \| null } }` — 기존 partial update 계약 유지 | `useUpdateSchedule` / `ganttKeys.data(projectId)` |
| `setGanttIssueFolder` (수정) | `{ projectId: string, issueKey: string, folderId: string \| null }` | `{ success: true, content: { issueKey: string, folderId: string \| null } }` — 기존 계약 유지 | `useSetIssueFolder` / `ganttKeys.data(projectId)` |
| `moveGanttIssueToFolder` (신규, WBS→폴더 드래그 전용) | `{ projectId: string, issueKey: string, folderId: string }` (`folderId`는 null 불가) | `{ success: true, content: { issueKey: string, folderId: string, previousFolderId: string \| null, parentKey: null, effectiveParent: string \| null } }` | `useMoveGanttIssueToFolder` / `ganttKeys.data(projectId)` |
| `getProjectGanttData` (무변경) | `{ projectId: string, coworkerFieldId?: string \| null }` | 기존 `{ success: true, content: { tasks, links, meta, folders, folderIssues, folderLinks } }` | `useGanttData` / `ganttKeys.data(projectId)` |

### 오류 계약

| 상황 | error.code | 서버 write 보장 | 프론트 처리 |
|---|---|---|---|
| `projectId` 누락 또는 간트 이슈 집합 밖의 `issueKey` | `GANTT_ISSUE_NOT_FOUND` | Jira/SQL write 없음 | 기존 오류 toast 및 캐시 유지 |
| 대상 폴더가 해당 프로젝트에 없음 | `GANTT_FOLDER_NOT_FOUND` | Jira/SQL write 없음 | 기존 오류 toast 및 캐시 유지 |
| WBS 해제(Jira property write) 실패, 폴더 배정 보상 성공 | Jira 원인 오류 코드 유지 | `gantt_folder_issue`를 이전 `previousFolderId` 상태로 복원, WBS는 미변경 | 오류 toast, 캐시를 patch하지 않음 |
| WBS 해제 실패 후 폴더 배정 보상도 실패 | `GANTT_FOLDER_MOVE_COMPENSATION_FAILED` (원인/보상 오류는 `cause`) | 서버가 성공을 반환하지 않음. 실제 폴더 상태가 불명확 | 오류 toast 후 `ganttKeys.data(projectId)`를 invalidate/refetch하여 서버 상태로 수렴 |

`setGanttIssueFolder`와 일반 WBS 편집(`setGanttParent`)의 입력/응답은 호환성을 위해 변경하지 않는다. 단일 이동 resolver는 오직 차트에서 “WBS override를 가진 이슈를 폴더로 drop”할 때만 사용한다.

## 3. 백엔드 설계

### 3-1. 공용 프로젝트-이슈 소속 검증

`GanttService.js`에 아래처럼 graph 재사용을 허용하는 공용 함수를 export한다.

```js
export const assertGanttIssueInProject = ({ projectId, issueKey, graph }) => {
  // projectId/issueKey 필수 확인
  // graph.keySet.has(issueKey)가 아니면 GANTT_ISSUE_NOT_FOUND throw
};
```

- 이 함수는 호출자가 이미 취득한 `fetchGanttGraph(projectId)`의 `keySet`을 받으므로 중복 Jira search를 만들지 않는다.
- `updateGanttSchedule`은 date/no-op 판단보다 먼저 `fetchGanttGraph(projectId)` + `assertGanttIssueInProject(...)`를 수행한다. 즉, 빈 fields로 호출하더라도 범위 밖 이슈를 성공 no-op으로 숨기지 않는다.
- `setGanttParent`의 현재 `keySet.has(issueKey)` 분기는 이 공용 함수로 치환한다.
- `setGanttIssueFolder`는 폴더 null 해제를 포함한 모든 분기 전에 graph를 조회하고 이 공용 함수를 호출한다. 따라서 조작된 `issueKey`로 다른 프로젝트의 `gantt_folder_issue` 행을 삭제할 수 없다.
- `setGanttFolderLink`처럼 이슈 endpoint를 다루는 기존 경로는 이미 `fetchGanttGraph`/`detectDagCycle`의 `keySet` 검증을 수행하므로 이번 범위에서는 동작 변경하지 않는다.

### 3-2. `moveGanttIssueToFolder` saga

신규 함수는 `GanttFolderService.js`에 둔다. Jira와 Forge SQL은 공통 transaction을 지원하지 않으므로, “완전한 물리 transaction” 대신 다음 순서의 보상 saga를 사용한다.

1. `projectId`, `issueKey`, non-null `folderId`를 검증한다.
2. `Promise.all`로 다음 읽기를 수행한다.
   - `fetchGanttGraph(projectId)` → `assertGanttIssueInProject` 및 현재 task의 `wbsParent`, `jiraParent` 확인.
   - `requireFolder(folderId, projectId)` → 폴더의 프로젝트 소속 확인.
   - `findFolderIssuesByProjectRepository([projectId])` → 대상 이슈의 `previousFolderId`를 한 번의 기존 프로젝트 범위 query에서 찾는다.
3. 현재 `wbsParent`가 없으면 WBS write는 생략하고, 기존 `setGanttIssueFolder`와 같은 UPSERT만 수행한다. 이 경우 응답의 `parentKey`는 `null`, `effectiveParent`는 현재 graph의 effective parent를 그대로 돌려준다.
4. 현재 `wbsParent`가 있으면 먼저 `upsertIssueFolderRepository`로 `folderId`를 기록하고, 다음 `mergeIssueProperty(issueKey, { wbsParent: null })`로 WBS override를 해제한다. `effectiveParent`는 `jiraParent`가 같은 graph `keySet` 안에 있으면 그 key, 아니면 `null`이다.
5. 4의 Jira write가 실패하면 SQL 보상을 반드시 시도한다.
   - `previousFolderId !== null`: `upsertIssueFolderRepository`로 이전 폴더를 복원한다.
   - `previousFolderId === null`: `deleteIssueFolderRepository([issueKey, projectId])`로 새 소속을 제거한다.
   - 보상이 성공하면 원래 Jira 오류를 throw한다. 보상이 실패하면 `LogicalError(GANTT_FOLDER_MOVE_COMPENSATION_FAILED, ...)`를 throw하고 원래 오류와 보상 오류를 원인으로 유지한다.
6. 성공 응답은 위 계약대로 두 저장소의 최종 상태만 반환한다. 부분 성공 응답이나 `success: true` + warning은 절대 반환하지 않는다.

동시 편집이 일어나도 일반 간트의 stale-time 정책을 바꾸지 않는다. 다만 이 resolver의 failure는 프론트가 cache patch를 하지 않으며, 보상 실패일 때만 즉시 refetch하여 불명확 상태를 해소한다.

### 3-3. Controller/권한 등록

- `GanttController.js`: `guardedDefine(resolver, 'moveGanttIssueToFolder', async ({ payload }) => moveGanttIssueToFolder(payload))`를 추가한다.
- `PermissionMap.js`: `moveGanttIssueToFolder: W('PROJECT', 'inherited')`를 추가한다. 선언 누락 시 deny-by-default(`PERMISSION_UNMAPPED`)가 되므로 필수다.
- `src/index.js`는 기존 `registerGanttController`가 이미 `CONTROLLER_REGISTRARS`에 있으므로 registrar 변경이 필요 없다. 신규 resolver가 이 controller 내부에서 `guardedDefine`되는지만 확인한다.

## 4. 프론트엔드 설계

### 4-1. WBS→폴더 이동

`useGanttFolderMutations.js`에 `useMoveGanttIssueToFolder({ projectId, toast })`를 추가한다.

- `mutationFn`: `invoke('moveGanttIssueToFolder', { projectId, issueKey, folderId })`; wrapper의 `success !== true`는 Error로 변환한다.
- 이 mutation은 낙관 패치를 하지 않는다. 두 저장소를 걸친 작업이므로 사용자에게 부분 상태를 보여주지 않는 것이 우선이다.
- `onSuccess`: 하나의 `queryClient.setQueryData(ganttKeys.data(projectId), ...)`에서 아래를 동시에 반영한다.
  - 대상 task: `wbsParent: null`, `effectiveParent: data.effectiveParent`
  - `content.folderIssues[issueKey] = data.folderId`
- `onError`: 일반 실패는 오류 toast만 보이고 cache를 바꾸지 않는다. `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`이면 `queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) })`를 추가해 실제 상태를 재조회한다.
- 성공 toast는 기존 `gantt.toast.issueFolderSet`을 재사용한다. 이 mutation은 연속 drop이 가능하므로 `batchCategory: 'issueFolder'`도 기존 규칙에 맞춰 사용한다.

`GanttPage.jsx`는 새 hook을 생성하고 `handleMoveIssueToFolder`를 만든 뒤 `GanttChart`에 `onMoveIssueToFolder`로 전달한다. `GanttChart.jsx`의 폴더 drop 분기에서 `dragged.wbsParent`가 있을 때만 기존 두 개의 callback 호출을 제거하고 신규 callback 한 번을 호출한다. WBS override가 없는 기존 `onSetIssueFolder` 경로와 폴더 모달의 `useSetIssueFolder` 경로는 유지한다.

### 4-2. coworker field 조회 오류와 재시도

`useGanttData(projectId)`의 coworker query에서 `isError`, `error`, `refetch`를 함께 받는다.

- `isLoading`: `query.isLoading || coworkerQuery.isLoading`으로 계산한다. 성공 전 단순 대기는 skeleton을 유지한다.
- `isError`: `coworkerQuery.isError || query.isError || (!!result && result.success !== true)`로 계산한다. coworker query가 실패하면 gantt data query는 `enabled: false`여도 오류 UI로 전환된다.
- `retry`: `async () => { await coworkerQuery.refetch(); }`를 반환한다. coworker 재시도가 성공하면 `isCoworkerReady`가 true가 되어 Gantt query가 자동 실행된다. Gantt query 자체가 실패한 경우에는 `query.refetch()`를 실행한다. 구현에서는 `retry`가 현재 실패 원인을 분기해 정확히 하나를 refetch한다.

`GanttPage.jsx`의 `isError` branch는 기존 `SectionMessage appearance="error"` 내부에 `Button appearance="subtle"`을 렌더해 `retry()`를 호출한다. 재시도 중에는 Button을 disabled/loading으로 둔다. 오류 문자열은 민감한 backend 오류를 노출하지 않고 기존 `gantt.error.load`만 사용한다.

## 5. DB 설계

변경 없음.

- `gantt_folder_issue` 기존 PK/UPSERT 및 project predicate를 그대로 사용한다.
- saga의 이전 상태 확인은 기존 `findFolderIssuesByProjectRepository([projectId])`의 결과를 사용한다. 이 요구사항만을 위해 무범위 `issue_key` query를 추가하지 않는다.
- Jira issue property `movesRms.wbsParent`는 `mergeIssueProperty`로 null 처리해 다른 속성(예: coworkers)을 보존한다.

## 6. i18n 키 목록

기본 설계는 기존 키를 재사용한다.

| 사용 위치 | 키 | 한국어/영어 source |
|---|---|---|
| coworker field 또는 간트 조회 실패 | `gantt.error.load` | 기존 `locales/kr/gantt.json`, `locales/en/gantt.json` |
| retry button | `common.retry` | 기존 공통 locale |
| WBS→폴더 이동 성공 | `gantt.toast.issueFolderSet` | 기존 gantt locale |
| 이동 실패 | `gantt.error.saveFailed` | 기존 gantt locale |

`common.retry`가 실제 source locale에 없을 때만 다음을 추가한다.

```json
// locales/kr/gantt.json
{ "gantt": { "retry": "다시 시도" } }

// locales/en/gantt.json
{ "gantt": { "retry": "Retry" } }
```

그 경우 UI는 `gantt.retry`를 사용하며, 수정 후 `npm run merge`를 실행한다.

## 7. 구현 작업 분해

### Backend 체크리스트

- [ ] `GanttService.js`에 `assertGanttIssueInProject`를 추가하고 `updateGanttSchedule`, `setGanttParent`에서 재사용한다.
- [ ] `GanttFolderService.js`의 `setGanttIssueFolder`에서 folder null/비-null 모두 공용 소속 검증을 먼저 수행한다.
- [ ] `moveGanttIssueToFolder` saga를 구현하고 사전 검증, 이전 폴더 캡처, Jira 실패 보상, 성공 DTO를 고정한다.
- [ ] `ErrorCodes.js`에 `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`를 추가한다.
- [ ] `GanttController.js`의 `guardedDefine` 및 `PermissionMap.js`에 신규 resolver를 같은 `PROJECT` write/inherited 규칙으로 등록한다.
- [ ] `test/permission/permissionMap.contract.test.js`의 간트 resolver 수/이름 기대값을 11종으로 갱신한다.

### Frontend 체크리스트

- [ ] `useGanttData`가 coworker query error를 `isError`로 전파하고 원인별 `retry`를 반환하도록 수정한다.
- [ ] `GanttPage` 오류 UI에 retry action을 추가한다.
- [ ] `useMoveGanttIssueToFolder`를 구현해 성공 시 WBS와 folderIssues를 원자적으로 cache patch하고, 보상 실패 시에만 refetch한다.
- [ ] `GanttPage`/`GanttChart` drop callback을 신규 mutation 하나로 교체한다.
- [ ] 기존 `useSetParent`, `useSetIssueFolder`, 모달 배정 경로의 계약 및 동작이 변하지 않는지 확인한다.

### 테스트 체크리스트

Backend (`npm test -- --runInBand`):

- [ ] `updateGanttSchedule`: 같은 프로젝트 이슈면 기존 partial update가 유지되고, 다른 프로젝트/미존재 이슈면 `updateIssueFields`가 호출되지 않고 `GANTT_ISSUE_NOT_FOUND`가 난다. no-op도 scope 검증을 우회하지 않는다.
- [ ] `setGanttIssueFolder`: folderId null delete와 folderId UPSERT 양쪽에서 범위 밖 issueKey가 DB write 없이 거부된다.
- [ ] `moveGanttIssueToFolder`: 정상 WBS 해제+폴더 배정, WBS 없는 이슈의 폴더 배정, 범위 밖 issue/folder 거부, Jira 실패 후 이전 폴더 복구, 이전 폴더 null 복구(DELETE), 보상 실패 코드/원인을 mock으로 검증한다.
- [ ] permission contract: 신규 resolver가 `PermissionMap`과 controller registrar에서 빠지지 않는다.

Frontend (`Set-Location static/ui; npm test -- --runInBand; CI=true npm run build`):

- [ ] `useGanttData` unit test: coworker query pending은 loading, reject는 error, retry 성공 뒤 gantt query 활성화를 검증한다.
- [ ] 신규 mutation test: 성공 응답은 task의 `wbsParent`와 `effectiveParent`, `folderIssues`를 동일 cache write에서 갱신한다. 일반 실패는 cache를 건드리지 않고, 보상 실패만 invalidate한다.
- [ ] `GanttChart` drop callback test: WBS가 있는 task를 folder에 drop하면 `onMoveIssueToFolder`만 1회 호출되고, `onSetParent`/`onSetIssueFolder`는 호출되지 않는다. WBS 없는 task는 기존 folder callback을 유지한다.

### 수정 파일 후보

`src/resolver/gantt/GanttService.js`, `src/resolver/gantt/GanttFolderService.js`, `src/resolver/gantt/GanttController.js`, `src/utils/errors/ErrorCodes.js`, `src/permission/PermissionMap.js`, `test/permission/permissionMap.contract.test.js`, `src/resolver/gantt/__test__/GanttScheduleUpdate.test.js`, `src/resolver/gantt/__test__/GanttFolderService.test.js`, `static/ui/src/pages/projectDetail/gantt/useGanttData.js`, `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js`, `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx`, `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` 및 해당 frontend test 파일.
