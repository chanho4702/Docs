# Moves Approval G2 적용 스페이스 목록 설정 (2026-08-28)

## 결정

- 적용 범위를 한 번도 저장하지 않은 상태와 명시적으로 빈 범위를 저장한 상태는 같은 빈 SQL 결과라도 의미가 반대다. `approval_space_config`의 row 유무로 추론하지 않고 KVS marker 기반 `configured`를 응답해 구분한다.
- 미설정 상태의 `enabled`는 저장된 선택을 나타내므로 `false`로 반환한다. 실효 정책인 “모든 스페이스 허용”은 `configured:false` 안내로 표현해야, 첫 토글을 켰을 때 나머지가 모두 꺼지는 전환을 UI가 정직하게 보여 줄 수 있다.
- Confluence REST v2 space 목록은 한 요청에서 한 cursor page만 읽고 `_links.next`의 cursor를 그대로 반환한다. 프론트는 `useInfiniteQuery`로 page를 누적하고 “더 보기”로 이어 붙인다.
- 비활성화 전에 `approval_request`의 `space_key`와 `is_open=1`을 세며, count 실패 시 설정 쓰기를 시작하지 않는다. setter가 변경과 count를 한 응답으로 묶는 계약에서는 진행 건수가 있으면 즉시 활성 상태를 복원한 뒤 확인 modal에서 최종 비활성화를 수행한다.
- 토글 낙관적 갱신은 space 설정 query prefix에 속한 모든 cache snapshot을 보관한다. 첫 선택이면 cache의 다른 space를 동시에 끄고, 실패하면 전체 snapshot을 되돌린다.

## 검증과 병렬 작업 주의

- backend Jest 115건, UI Jest 13건, UI production build, Forge lint가 통과했다.
- 첫 UI build는 병렬 작업 중 `NotificationPanel.jsx`가 아직 export되지 않은 `loadUsersByAccountIds`를 import해 중단됐다. 범위 밖 파일을 수정하지 않고 해당 작업 반영 뒤 재검증해 통합 build를 통과시켰다.

## 관련

- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-forge-inbox-2026-08-26|moves-approval-forge-inbox-2026-08-26]]
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--confluence-approval-dc-2026-08-15-space-administration|confluence-approval-dc-2026-08-15-space-administration]]
