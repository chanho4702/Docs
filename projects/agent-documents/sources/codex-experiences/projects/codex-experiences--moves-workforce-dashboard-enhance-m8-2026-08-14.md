# Moves Workforce dashboard-enhance M8 (2026-08-14)

포트폴리오 토폴로지의 Jira 스페이스 노드 클릭 시에만 이슈 목록을 가져오는 M8 드릴다운을 완성했다.

- resolver는 `REPORT/detail`과 `scopedProjectIds(principal)` 재검증을 함께 사용한다. `principal` 누락은 fail-close 처리한다.
- Jira 조회는 `asUser()`로 수행하고, `spaceKey`는 허용 정규식으로 검증해 JQL 주입 경로를 차단한다.
- viewer별 1분 서버 promise cache와 frontend 5분 React Query cache는 서로 역할이 다르다. 후자를 1분으로 두면 설계 계약을 깨므로 `staleTime: 1000 * 60 * 5`를 유지한다.
- Jira 일시 실패는 그래프를 깨지 않도록 빈 이슈 목록의 정상 partial fallback으로 반환한다. 이는 입력·권한 오류의 wrapper error와 구분한다.
- `spaceKey:null`은 Jira 스페이스가 없으므로 invoke하지 않고 UI에서 안내만 한다.

후속 UX 결정:

- 통합대시보드 스콥 토폴로지는 인력 정보를 제외하고 `프로젝트 → 스페이스 → 상태`로 유지한다.
- 상태는 Done/ In Progress/ To Do를 고정 색으로 구분한다. 상태 클릭 시에만 실제 이슈를 그래프에 펼치고, 이슈 노드 크기는 `actualMd` 전용 스케일을 쓴다.
- 상태 필터에는 `statusCategory`의 fixed allowlist를 사용한다. 스페이스가 없는 상태 노드는 RMS 프로젝트 전체로 조회하되, 스페이스와 상태가 모두 없는 전량 조회는 허용하지 않는다.
- 시각화 밀도는 위젯 전용 force override로 조정한다. 공용 그래프 기본값을 바꾸면 다른 대시보드 그래프의 배치가 함께 변한다.

## Final topology decision

- The intended hierarchy is `Workforce hub -> RMS project -> Jira space -> issue status -> issue`.
- Jira spaces remain visible as triangle nodes. People are intentionally omitted.
- A status node preserves its `spaceKey`; selecting it loads issues for that exact space and status. Only legacy projects without spaces may connect directly from project to status.
- Node shapes: hub `roundRect`, RMS project `rect`, Jira space `triangle`, status `circle`, issue `diamond`. Issue size uses `actualMd`.
## Production follow-up

- A topology drill-down must return its DTO under `content`; `guardedDefine`/`responseWrapper` produces `{ success, ...handlerResult }`, so returning a DTO at root leaves `result.content.issues` undefined in the Custom UI.
- Keep zero-count persisted `spaces[]` entries as triangle nodes and project-to-space edges. Suppress only their empty status children.
- Existing portfolio snapshots need the v019 `spaces_json` migration and one portfolio aggregation after deployment before persisted space nodes can appear.
