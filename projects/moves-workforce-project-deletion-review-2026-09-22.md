# 프로젝트 삭제 로직 검토 (2026-09-22)

현재 미커밋 변경을 포함해 검토했으며 제품 코드는 수정하지 않았다.

- IssueApi.js의 discovery route에 `&nextPageToken=...` 전체를 보간하면 설치된 @forge/api가 `%26nextPageToken%3D...`로 인코딩한다. 로컬 route 실행으로 확인. 다음 페이지 토큰이 독립 query parameter로 전달되지 않는다.
- ProjectDeletionService의 discover는 매 호출 처음부터 전량 검색·행별 SQL upsert하며 deadline을 검사하지 않는다. unlink 시작 전 15초 예산을 소진하면 재호출에서도 같은 작업을 반복할 수 있다.
- 기존 삭제 작업의 이슈가 다른 프로젝트로 이동하면 이전 projectId 검색에는 안 잡히지만 property_cleared_at이 비어 있는 경우 movesRms property는 여전히 삭제한다. 현재 소속을 확인해야 다른 프로젝트의 메타데이터 손실을 피한다.
- SQL 정리 첫 단계가 projectusers 삭제다. 그 뒤 실패하면 MEMBER_ONLY 작업자는 다음 호출의 detail 가드에서 자기 프로젝트 범위를 잃어 재시도가 거부될 수 있다.
- ProjectDeletionService 기존 테스트 7개 통과. 실제 Jira 호출·배포는 수행하지 않았다. discovery API와 권한 가드가 mock/우회되어 위 경계를 검증하지 못한다.

관련: [[moves-workforce-project-delete-saga-verifier-remediation-2026-08-31]]