# Dashboard asApp aggregate boundary

Dashboard와 차트는 사용자에게 Jira Browse 권한이 없는 다른 팀·스페이스 이슈까지 집계해 인력 유효성과 총 현황을 판단해야 한다. 이 집계는 `asApp()`으로 실행할 수 있지만, 사용자 권한·RMS scope·비용 가시성을 서버에서 검증하고 raw Jira issue를 반환하지 않아야 한다.

- 기존 raw-detail resolver는 `asUser()`를 유지한다.
- `asApp()`은 전용 aggregate resolver와 최소 allowlist DTO에만 사용한다.
- `principal` 누락은 fail-close한다.
- ProjectScope, TeamAnalyticsScope, CostAccess, SalaryVisibility를 필요한 응답에 적용한다.
- Jira Browse 권한이 없는 RMS 권한 사용자도 scope 내 숫자 집계만 받을 수 있어야 한다.
