# Gantt reliability hardening — 통합 검증 보고서

검증일: 2026-08-20  
범위: `01_architect_design.md`, backend/frontend 구현 보고서 및 실제 변경 소스

## 통과

### Resolver 등록·권한 계약

- 생산자: `src/resolver/gantt/GanttController.js:62`가 `guardedDefine(resolver, 'moveGanttIssueToFolder', ...)`로 새 resolver를 등록한다.
- 생산자: `src/permission/PermissionMap.js:280`이 같은 이름을 `W('PROJECT', 'inherited')`로 매핑한다.
- 등록 경로: `src/index.js:74`의 `CONTROLLER_REGISTRARS`에 기존 `registerGanttController`가 포함되어 있다.
- 계약 테스트: `test/permission/permissionMap.contract.test.js:75-86`이 간트 resolver 11종과 registrar/PermissionMap 일치를 검사한다.

### `moveGanttIssueToFolder` 응답·소비·캐시 계약

- 생산자: `src/resolver/gantt/GanttFolderService.js:222-271`은 성공 시 `{ content: { issueKey, folderId, previousFolderId, parentKey: null, effectiveParent } }`를 반환한다. `guardedDefine` 공통 wrapper가 이를 `{ success: true, content }`로 감싼다.
- 소비자: `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js:252-278`은 `invokeFolder()`를 통해 `result.success === true`를 확인한 뒤 `result.content`만 사용한다.
- 캐시: 같은 hook의 `258-269`가 단일 `ganttKeys.data(projectId)` write에서 해당 task의 `wbsParent: null`, `effectiveParent`, `folderIssues[issueKey]`를 함께 갱신한다. 일반 오류에서는 cache patch가 없고, `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`에서만 `274-275`가 invalidate한다.
- 호출 연결: `GanttPage.jsx:330-332, 405-406` → `GanttChart.jsx:921-928`의 WBS 보유 이슈 folder drop 단일 callback으로 이어진다. 기존 WBS 없는 folder drop은 `onSetIssueFolder` 경로를 유지한다.

### 프로젝트–이슈 범위 검증

- `updateGanttSchedule`: `src/resolver/gantt/GanttService.js:150`이 write/no-op 전 `assertGanttIssueInProject`를 수행한다.
- `setGanttIssueFolder`: `src/resolver/gantt/GanttFolderService.js:202`가 folder 해제를 포함해 write 전에 검증한다.
- `moveGanttIssueToFolder`: 같은 파일 `228-232`가 project graph와 folder/project 소속을 확인한 뒤 이슈를 검증한다.
- `setGanttParent`: `GanttService.js:240-243`이 graph `keySet`으로 검증한다. 기존 link mutation도 `GanttService.js:320-321`에서 양 endpoint를 graph 범위로 제한한다.
- `assertGanttIssueInProject`: graph가 없을 때 `IssueApi.isIssueInProjects()`를 사용하며, 이 API는 `IssueApi.js:301-319`에서 `key`와 `moves_RMS_projectId`를 함께 JQL로 확인한다. 설계서의 graph 재사용 방식과는 다르지만 project predicate가 서버 측에서 적용되어 범위 보안 계약은 충족한다.

### 오류 복구 및 UI 보강

- coworker field query 오류는 `useGanttData.js:48-56`에서 로딩 상태와 분리되어 `isError`로 전파되고, 실패한 선행 query 또는 gantt query를 선택해 재시도한다.
- `GanttPage.jsx:345-355`가 공통 오류 메시지와 retry action을 렌더링한다.
- 아이콘 fallback: `IssueComponent.js:33-61`이 URL 없음/`Image.onError`에서 16px 고정 이슈 타입 이니셜 badge로 전환한다. `ganttAdapter.js:184-189`과 `GanttChart.jsx:87-89`의 `issueType`/`issueTypeIcon` 전달도 일치한다.
- 좌측 트리 연결선: `ganttAdapter.js:242-264`가 현재 가시 parent 관계로 `treeGuides`를 만들고, folder/issue 양쪽 셀(`GanttChart.jsx:61-91`, `IssueComponent.js:17-30`)이 이를 렌더링한다. `gantt.css`의 `.gantt-tree-guide`, `.gantt-tree-elbow` 규칙이 vertical guide와 elbow를 제공하며 dark mode 색상도 정의한다.

### 실행 검증

| 명령 | 결과 |
|---|---|
| 루트 `npm test -- --runInBand` | 통과 |
| `static/ui` `npm test -- --runInBand` | 통과 |
| `static/ui` `CI=true npm run build` | 통과. 외부 Atlaskit/marklassian source-map 파일 누락 경고만 발생 |
| 루트 `forge lint` | 통과 (`No issues found`). PermissionLinter의 `Unknown product` 경고는 남음 |

## 실패

없음.

## 미검증

- 실제 Jira/Forge 환경에서 이슈 타입 아이콘 URL의 간헐적 실패 원인(응답 누락, iframe/CSP, 네트워크)을 네트워크 로그로 분리하는 검증은 수행하지 못했다. 구현된 fallback은 세 경우 모두 사용자 표시를 보장한다.
- 브라우저 E2E/시각 회귀 테스트는 없다. 실제 SVAR DOM에서 filter·collapse·다중 depth에 대한 guide/elbow alignment, dark mode 대비는 수동 확인이 필요하다.
- `useGanttData`의 coworker retry 및 `useMoveGanttIssueToFolder`의 성공/보상실패 cache 동작을 직접 검증하는 frontend unit test는 이번 변경 목록에서 발견하지 못했다. 현 소스의 생산자–소비자 계약은 일치하지만, 후속으로 hook 테스트를 추가하는 것을 권장한다.
