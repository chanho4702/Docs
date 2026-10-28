# Moves Workforce RFC-192 상태·Kanban·카탈로그 검증 보완

- `b371c3c`: 프로젝트 상태 전이 SQL CAS, 상태 삭제 successor 재배정/고립 상태 차단, KVS 실패 시 역방향 CAS 보상, Kanban 빈 보드·충돌 rollback·orphan 카드 보완.
- `e9c914a`: Holiday·Role·Level·Skill 서버 입력 검증, update self-exclusion, bulk 사전 검증과 프론트 오류 코드 masking.
- 사용자 변경 중인 root generated locale 파일은 보존했다. 따라서 카탈로그 변경의 `npm run build` prebuild merge는 실행하지 않았고, 별도 CI compile과 전체 frontend test로 확인했다.
- 상태·Kanban은 backend 109 suites/1,464 tests, frontend 99 suites/1,649 tests, CI build, Forge lint를 통과했다. 카탈로그는 backend 110 suites/1,488 tests, frontend 100 suites/1,659 tests, Forge lint를 통과했다.
