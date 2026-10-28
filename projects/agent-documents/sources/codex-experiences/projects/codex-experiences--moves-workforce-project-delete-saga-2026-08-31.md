# Moves Workforce 프로젝트 삭제 saga

- Forge SQL에 transaction/FK cascade가 없을 때 프로젝트 삭제는 단계별 상태와 멱등 DELETE로 재개해야 한다.
- Jira Issue는 보존하되, app discovery 후 요청자의 `asUser` browse 권한을 확인한 Issue에만 `movesRms` property와 RMS project app field를 해제한다.
- 정상 완료 이력은 남기지 않고 operation/Issue work row를 즉시 삭제한다. 실패, 접근 차단, cache warning 상태만 retry를 위해 유지한다.
