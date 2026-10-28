# project_team orphan 정합성 감사 후속

기능 감사에서 확인된 P2 위험을 해결한다. 프로젝트-팀 연결(`project_team`)이 프로젝트·팀 삭제 또는 변경 이후 orphan row로 남아 조회, 집계, 권한 범위를 왜곡하지 않는지 조사하고 최소 범위로 보완한다.

- project_team 생성·삭제·프로젝트/팀 삭제·조회 및 집계 경로를 식별한다.
- FK가 없는 SQL 환경에서 application cleanup과 query predicate가 일관적인지 검증한다.
- orphan을 예방하고 기존 orphan에 대한 안전한 조회/정리 방안을 설계한다.
- 영향 범위와 테스트 계획을 기록한다.
