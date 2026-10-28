# Moves Workforce Dashboard 프로젝트 삭제 continuation

- `deleteProject` saga는 Jira 연결 이슈를 50건씩 처리하고 `completed: false` + 활성 상태를 반환해 다음 호출에서 이어서 진행한다.
- 프로젝트 목록에는 2.5초 재호출 effect가 있었지만 Dashboard Kanban에는 없었다. 활성 상태 모달은 Retry 버튼이 없으므로 51건 이상일 때 `UNLINKING`에서 영구 정지한다.
- 최소 보정은 backend 계약을 바꾸지 않고 Kanban에 목록과 동일한 continuation timer를 추가하는 것이다. 실패·접근 차단·cache warning은 계속 사용자의 Retry만 허용한다.
