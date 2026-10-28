# 프로젝트 담당 팀 기능 감사 기록

기준: 2026-08-26

## P2 — 존재하지 않는 프로젝트에 담당 팀 배정을 만들 수 있음

- `project_team` DDL은 `project_id` 외래키를 두지 않는다. 주석도 TiDB 제약 때문에 서비스 cascade에 의존한다고 명시한다(`src/rdb/schema/ddl/projectTeam.sql.js:1-19`).
- `setProjectTeamsService()`는 team 존재와 primary 포함 관계는 검증하지만 `projectId`가 실제 `project` 행인지 확인하지 않는다(`src/resolver/projectTeam/ProjectTeamService.js:121-163`). 이후 upsert는 그대로 `(project_id, team_key)` 행을 삽입한다(`src/rdb/query/ProjectTeamQuery.js:39-43`).
- 전체 프로젝트 범위를 가진 프로젝트/자원관리 write 사용자는 inherited scope가 제한되지 않으므로 임의 UUID를 직접 invoke해 고아 매핑을 만들 수 있다. 이 행은 TEAM_ONLY project scope 산정에 합쳐질 수 있어 존재하지 않는 프로젝트 ID가 권한·목록 계산에 섞인다.

권장 수정: 저장 전 공용 `assertProjectExists(projectId)`를 호출하고, 가능한 경우 project 삭제/삽입 경로와 함께 데이터 정리 migration을 둔다. 테스트에는 존재하지 않는 UUID와 유효 teamKey 조합을 거부하는 케이스를 추가한다.

## 검증 통과

- 팀·프로젝트 담당 팀·Team Analytics 단위 테스트 10개 suite, 190개 test가 통과했다. 테스트 로그의 Jira 실패/cycle 메시지는 해당 fallback 경로를 의도적으로 검증하는 mock 출력이다.
