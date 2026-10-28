# Moves Workforce 기능 감사 후속 기록 — 2026-08-26

## 발견

- 프로젝트 범위 가드가 payload의 `projectId`/`project_id`만 확인하는 구조에서, `assignWorkItem`은 실제 Jira issue의 RMS 프로젝트 소속을 대조하지 않아 허용 프로젝트 ID와 타 프로젝트 issue를 조합한 변경이 가능하다.
- `updateChartTitle`은 `dashboard_id`만 사용해 가드와 SQL 모두 프로젝트 소유 조건을 잃는다. 같은 대시보드 기능의 filter 변경은 이미 `project_id` 필수·소유 확인으로 보완돼 있어, 수정 경로 간 보안 경계가 불일치한다.
- KVS `findAll`/`findByField`/`findByWhere`의 100건 커서 절단이 레벨·역할·권한·상태·공휴일·대용량 업로드 job에 남아 있다. 상태 그래프 저장은 서버 DAG 검증 및 원자적 교체가 없다.
- `project_team`은 외래키가 없고 `setProjectTeams`도 프로젝트 존재를 확인하지 않아, 전체 프로젝트 범위 권한의 직접 호출에서 고아 담당 팀 배정이 남을 수 있다.
- `updateProjectIdField`는 대상 Jira issue와 신규 RMS 프로젝트의 소속을 검증하지 않은 채 프로젝트 연결 custom field를 바꾼다. project ID가 없는 inherited payload는 가드가 범위 검사를 건너뛴다.
- 수동 워크로그 batch는 `project-worklog-project-queue`에 event를 적재하지만 manifest에 consumer가 없어 실행되지 않는다. permission seed migration도 `findAll()` 100건 제한으로 일부 권한 세트를 영구 미보정할 수 있다.

## 교훈

`inherited` project scope resolver는 입력에 프로젝트 ID가 있는지 확인하는 것만으로 안전하지 않다. 자식 리소스 ID와 Jira issue ID에서 실제 소유 프로젝트를 역산해 대조하고, DML WHERE에도 프로젝트 ID를 넣어야 한다. KVS 전량 로직은 paged helper와 공통 상한·명시적 초과 처리를 한 단위로 적용해야 한다.

외래키를 쓰지 못하는 교차 저장소 매핑은 서비스 계층에서 양쪽 엔티티의 존재를 확인하고, 삭제 cascade와 함께 고아 데이터 정리 경로를 둬야 한다.

관련 감사 기록: `C:\CloudJira\moves-workforce\_workspace\feature-audit-20260826\04_backoffice_findings.md` ~ `07_dashboard_scope_findings.md`
