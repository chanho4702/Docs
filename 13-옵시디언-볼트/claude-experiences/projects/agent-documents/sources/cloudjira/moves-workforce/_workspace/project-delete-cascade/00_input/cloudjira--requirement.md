# 요구사항: 프로젝트 삭제 cascade 보완

## 배경
프로젝트 삭제(`deleteProject` resolver)가 현재 `project` 테이블 단일 행만 삭제하고,
연관 데이터를 전혀 정리하지 않아 고아 행/stale 캐시가 누적된다.

## 현재 삭제 경로 (감사 결과, 2026-06-29)
```
deleteProject (ProjectController.js:22)
  → deleteProjectService({project_id})              (ProjectService.js:56)
    → deleteProjectRepository([project_id])          (ProjectRepository.js:17)
      → ProjectQuery.DELETE_BY_ID                     (ProjectQuery.js:41)
         "DELETE FROM project WHERE project_id = UUID_TO_BIN(?)"
```
연관 정리(cascade) 없음.

## 정리되지 않고 남는 데이터

### SQL 테이블 (영구 잔존 — 핵심)
| 테이블 | 내용 | project FK | 비고 |
|---|---|---|---|
| `projectusers` | 프로젝트 인력(role/level/salary) | FK 있음, cascade 없음 | 고아 행 |
| `project_dashboard` | 대시보드 위젯 레이아웃(차트/테이블 배치) | FK 있음, cascade 없음 | 고아 행 |
| `portfolio_project_snapshot` | 전사 대시보드 스냅샷 | FK 없음 | 고아 행 → 포트폴리오에 유령 프로젝트 |

⚠️ FK 주의: `projectusers`·`project_dashboard`의 project FK에 `ON DELETE CASCADE`가 없다(기본 RESTRICT).
Forge SQL이 FK를 강제하면 자식 행이 있는 프로젝트는 삭제가 FK 위반으로 실패해야 정상.
실제로 삭제가 되고 행만 남는다면 FK 미강제 → 고아 행 누적.
→ **어느 쪽이든 자식부터 명시적으로 삭제하는 로직이 필요**.

### KVS 캐시 (TTL 자동 만료 — 경미)
- `ProjectProgress:{pid}` (10분), `ProjectCost:{pid}` (10분),
  `ResourceList:{pid}:{start}:{end}` (10분), `ResourceDetail:{pid}:{accountId}:{start}:{end}` (5분)
- TTL로 자동 만료되나 삭제 직후 최대 10분 stale 노출 가능.
- ResourceList/ResourceDetail은 start/end/accountId가 키에 포함돼 키 열거가 어려움 → 즉시 무효화 난도 높음(선택 사항).

### 정리 불필요
- `worklog_issue_daily` 테이블은 DDL 주석 처리 → 실존하지 않음. 워크로그는 Jira 실시간 페치.

## 요구사항
1. `projectusers`, `project_dashboard`, `portfolio_project_snapshot`에 프로젝트 단위 일괄삭제 쿼리 추가
   (기존엔 단건 삭제만 존재: projectusers=DELETE_BY_KEY, project_dashboard=DELETE_BY_DASHBOARD_ID)
2. `deleteProjectService`를 **자식 → 부모 FK 안전 순서**로 일괄 삭제하도록 변경
3. 가능하면 트랜잭션으로 원자성 보장 (현 `CommonQuery.executeQuery`는 단건 실행만 지원 → @forge/sql 트랜잭션 지원 여부 확인 필요)
4. (선택) 삭제 시 `ProjectProgress:{pid}`·`ProjectCost:{pid}` KVS 캐시 즉시 무효화
5. 프론트: 삭제 mutation 성공 후 관련 React Query 캐시 무효화 점검(기존 동작 유지 확인, 대부분 no-op 예상)

## 제약
- responseWrapper 응답 표준 유지: `{ success, ... }`
- 커스텀 에러(SqlError 등) 패턴 유지
- 백엔드 테스트 `npm test`(루트), 프론트 빌드 통과
