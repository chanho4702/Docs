# Moves Workforce 간트 차트 진단 — 2026-08-20

## 확인한 위험

- `updateGanttSchedule`은 `projectId`를 permission gate에는 전달하지만, Service에서 `issueKey`가 해당 프로젝트의 간트 이슈 집합에 속하는지 확인하지 않고 Jira update를 실행한다. payload 조작 시 프로젝트 권한과 Jira 이슈 편집 권한의 경계가 분리될 수 있다.
- WBS 하위 이슈를 폴더로 드래그하면 `setGanttParent(null)`과 `setGanttIssueFolder(...)`가 독립 mutation으로 연속 호출된다. 앞쪽 실패·뒤쪽 성공이면 WBS가 남아 폴더 소속이 UI에서 가려지는 부분 성공 상태가 가능하다.
- coworker custom field 조회 실패는 `useGanttData`의 `isCoworkerReady`를 영구 false로 남겨 간트가 오류 메시지 대신 로딩 skeleton에 머문다.

## 개선 방향

- 모든 mutation에서 서버 측 프로젝트-이슈 소속 검증을 공용 함수로 강제하고, 폴더 소속도 동일하게 검증한다.
- 교차 저장소 이동은 단일 orchestration resolver와 보상/재조회 정책으로 원자성 경계를 명확히 한다.
- 대형 프로젝트에 대비해 전체 이슈 fetch 예산, 범위/필터 기반 로딩, DOM 의존 렌더링의 회귀 테스트를 설계한다.
