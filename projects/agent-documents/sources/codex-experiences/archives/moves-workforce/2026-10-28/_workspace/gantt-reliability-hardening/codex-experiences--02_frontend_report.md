# Gantt 프론트엔드 구현 보고

## 구현

- `moveGanttIssueToFolder`를 소비하는 `useMoveGanttIssueToFolder`를 추가했다. 성공 응답 `content = { issueKey, folderId, previousFolderId, parentKey: null, effectiveParent }`로 같은 `ganttKeys.data(projectId)` 캐시에서 task의 `wbsParent`/`effectiveParent`와 `folderIssues`를 함께 갱신한다. `GANTT_FOLDER_MOVE_COMPENSATION_FAILED`일 때만 invalidate한다.
- WBS override가 있는 이슈를 폴더로 드롭하면 기존 `setGanttParent` + `setGanttIssueFolder` 두 호출 대신 위 단일 mutation만 호출한다. WBS가 없는 기존 폴더 배정 경로는 유지한다.
- coworker custom field query 오류를 `isError`로 전파하고, `GanttPage` 오류 상태에 재시도 action을 추가했다. 재시도는 실패한 선행 query 또는 간트 query를 분기해 다시 실행한다.
- `issueType`을 Gantt adapter에서 row까지 전달했다. 이슈 타입 URL이 비었거나 이미지 로드가 실패하면, 16px 고정 영역의 이니셜 badge로 대체한다.
- `toSvarTasks`가 현재 필터 후 실제 표시되는 `parent` 관계에서 조상 branch 연속 여부를 계산한다. 이슈·폴더 셀 모두가 세로 ancestor guide와 현재 elbow를 그리므로 depth 색상만으로 구분하던 문제를 보강했다. 렌더는 Custom UI 셀 내부와 CSS pseudo-element만 사용하며 다크 모드 색상도 포함한다.

## 검증

- `npm test -- --runInBand`: 89 suites, 1581 tests 통과.
- `CI=true npm run build`: prebuild locale merge 후 optimized production build 단계까지 오류 없이 완료.
- `ganttAdapter.folderLinks.test.js`에 tree guide·issueType passthrough 단위 테스트를 추가했다.

## i18n

- 기존 `common.retry`, `gantt.error.load`, `gantt.toast.issueFolderSet`만 사용했다. 신규 locale source 변경은 없다.
