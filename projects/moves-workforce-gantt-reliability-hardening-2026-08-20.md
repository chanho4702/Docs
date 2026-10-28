# Moves Workforce Gantt Reliability Hardening — 2026-08-20

- 프로젝트 권한 게이트만으로 Jira issue 범위가 확정되지 않는다. 간트 mutation은 `fetchGanttGraph(projectId)`의 `keySet`으로 `issueKey` 소속을 service에서 다시 검사해야 한다. 날짜 no-op도 검증 전에 성공시키면 범위 검증 우회가 된다.
- Jira issue property와 Forge SQL은 공통 transaction이 없으므로 WBS→폴더 이동은 폴더 UPSERT 후 WBS 해제, 실패 시 기존 folder assignment 복원의 compensation saga로 구현했다. 보상 자체가 실패하면 전용 오류 코드로 frontend가 강제 refetch할 수 있게 한다.
- 새 resolver는 controller `guardedDefine`와 `PermissionMap`을 동시에 갱신하고, registrar-권한 계약 테스트로 deny-by-default 회귀를 막는다.
- 검증: `npm test -- --runInBand` — 85 suites, 1367 tests 통과.

관련: [[moves-workforce-gantt-review-2026-08-20]]
