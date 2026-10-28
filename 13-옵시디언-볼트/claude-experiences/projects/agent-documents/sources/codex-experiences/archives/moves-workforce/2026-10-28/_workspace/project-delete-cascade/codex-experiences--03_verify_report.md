# 통합 정합성 검증 리포트 — project-delete-cascade

> 검증자: integration-verifier / 검증일: 2026-06-29
> 기준: `01_architect_design.md`(§3 삭제순서·§4 경계면 계약) 대비 실제 소스 + `02_backend_report.md`
> 방법: 설계를 그대로 믿지 않고 DDL/코드를 독립 전수 grep + 생산자·소비자 양쪽 동시 읽기로 교차 비교.

## 종합 판정: **통과** (실패 0 / 주의 1 / 미검증 1)

cascade 4개 테이블·삭제순서·신규 쿼리·경계면 계약·KVS 키가 모두 설계 및 실제 캐시 키와 정확히 일치한다. 누락 테이블 없음을 독립 재확인했다. 단, 부분 실패 시 사용자 인지(재시도 유도)에 대한 설계 서술과 실제 프론트 동작 사이에 불일치가 있어 **주의** 1건을 기록한다(본 RFC 범위 외·기존 동작이나 cascade 실패복구 논리에 영향).

---

## 통과 항목

### 1. 누락 테이블 없음 (독립 전수 재확인) — 통과
`src/rdb/schema/ddl/` 전체를 직접 grep(`project_id|REFERENCES project`)하여 설계를 교차 검증함.

| 테이블 | 위치 | project 참조 | cascade 대상 | 판정 |
|---|---|---|---|---|
| `projectusers` | projectusers.sql.js:17 | `FOREIGN KEY (project_id) REFERENCES project` | O | 포함됨 |
| `project_dashboard` | project.sql.js:30 | `FOREIGN KEY (project_id) REFERENCES project` | O | 포함됨 |
| `portfolio_project_snapshot` | portfolioSnapshot.sql.js:7,35 | PK=project_id, FK 없음 | O | 포함됨 |
| `project` | project.sql.js:1 | 부모 | O(마지막) | 포함됨 |
| `worklog_issue_daily` | worklog.js 전체 | **파일 전체가 `/* */` 주석**, `ddl/index.js`에 export 없음 → 테이블 미생성 | X | 대상 아님(정당) |
| `user_schedule` | users.sql.js | `account_id`→users만 참조(grep에서 project_id 미검출) | X | 대상 아님(정당) |

→ 설계의 "정확히 3개 자식 + 부모 project" 주장이 사실임을 **독립적으로 재확인**. 누락 테이블 없음.
주: project.sql.js 한 파일에 `project`와 `project_dashboard` 두 테이블이 같이 정의돼 있으나(line 1, 17), `ddl/index.js:1`에서 둘 다 export됨. cascade는 두 테이블을 모두 다룸 → 문제 없음.

### 2. 삭제 순서 (자식→부모, 4개 모두) — 통과
`src/resolver/project/ProjectService.js:82-95` `deleteProjectService`:
- L86 `deleteProjectUsersByProjectRepository` (projectusers, FK 자식)
- L87 `deleteProjectDashboardByProjectRepository` (project_dashboard, FK 자식)
- L88 `deletePortfolioSnapshotByProjectRepository` (portfolio_project_snapshot, FK 없음)
- L89 `deleteProjectRepository` (project, 부모 — 마지막)
- L92 `invalidateProjectKvsCache` (KVS, 마지막)

FK RESTRICT 자식 2종이 부모보다 먼저 실행됨 → FK 위반 고아 발생 불가. 설계 §3와 byte 단위로 일치. 4개 모두 포함.

### 3. 신규 쿼리 정확성 — 통과
생산자(Query 상수) ↔ 소비자(Repository) 교차 확인:

| Query 상수 | SQL | Repository 참조 |
|---|---|---|
| `ProjectUsersQuery.DELETE_BY_PROJECT_ID` (ProjectUsersQuery.js:47-51) | `DELETE FROM projectusers WHERE project_id = UUID_TO_BIN(?)` | ProjectRepository.js:25-26 ✓ |
| `ProjectDashboard.DELETE_BY_PROJECT_ID` (ProjectDashboard.js:37-40) | `DELETE FROM project_dashboard WHERE project_id = UUID_TO_BIN(?)` | ProjectRepository.js:28-29 ✓ |
| `PortfolioSnapshotQuery.DELETE_BY_PROJECT_ID` (PortfolioSnapshotQuery.js:84-87) | `DELETE FROM portfolio_project_snapshot WHERE project_id = UUID_TO_BIN(?)` | ProjectRepository.js:31-32 ✓ |

- 3개 모두 올바른 테이블 타겟, `WHERE project_id = UUID_TO_BIN(?)` (BINARY(16) 컬럼 + UUID 문자열 입력 컨벤션 일치).
- Repository import 경로(`../../rdb/query/...`) 정확(ProjectRepository.js:2-4), Service import도 정확(ProjectService.js:8-9).
- 부모는 기존 `ProjectQuery.DELETE_BY_ID`(ProjectQuery.js:41-45, `UUID_TO_BIN(?)`) 재사용 ✓.

### 4. 경계면 계약 불변 — 통과
생산자/소비자 양쪽 동시 읽기:
- **Controller 미변경**: ProjectController.js:22-25 `deleteProject` → `responseWrapper(({payload}) => deleteProjectService(payload))`. 함수명·등록 그대로.
- **응답 shape 보존**: `deleteProjectService`가 L89 `result`(부모 project DELETE 결과)를 L94에서 그대로 return. responseWrapper(ResponseWrapper.js:18-21)가 `{success:true, ...result}`로 직렬화 → cascade 추가 전과 동일(부모 DELETE 결과의 `rows`/`metadata`).
- **`src/index.js` 미변경**: 신규 컨트롤러 없음(검증: 신규 resolver.define 없음).
- **프론트 invoke 입력 일치**:
  - ProjectList.jsx:88-89 `invoke("deleteProject", { project_id })` ✓
  - ProjectKanbanBoard.jsx:309-310 `invoke("deleteProject", { project_id: projectId })` ✓
  - 두 mutation 모두 onSuccess/onError에서 **응답 본문 필드(`result.content` 등) 미접근** — 토스트 + 무효화만 사용(ProjectList.jsx:91-107, ProjectKanbanBoard.jsx:330-339). 응답 shape 변동이 있어도 무해하며, 실제로도 불변. → 프론트 변경 불필요가 맞음.

### 5. KVS 무효화 — 통과
- best-effort 확인: `invalidateProjectKvsCache`(ProjectService.js:61-72)가 **키별 독립 try/catch + console.warn**, 본 흐름 비차단. SQL cascade 성공 후(L92) 호출되어 캐시 삭제 실패가 삭제 결과를 깨지 않음.
- **캐시 키 정확 일치(생산자 vs 소비자)**:
  - 생산: ProjectProgressService.js:58 `` `ProjectProgress:${projectId}` `` ↔ 무효화: ProjectService.js:63 `` `ProjectProgress:${project_id}` `` ✓ (start/end 미포함, 단일 projectId — 일치)
  - 생산: ProjectCostService.js:80 `` `ProjectCost:${projectId}` `` ↔ 무효화: ProjectService.js:68 `` `ProjectCost:${project_id}` `` ✓
- ResourceList/ResourceDetail은 키에 start/end/accountId 가변 → 열거 불가, TTL 의존(설계 §6 명시) — 즉시삭제 비대상 정당.

### 6. 트랜잭션 부재 처리 — 통과 (단, 주의 1 참조)
- 각 DELETE가 별도 `executeQuery` 단건 실행(트랜잭션 미사용). `@forge/sql` 트랜잭션 미지원 전제 정당.
- 모든 DELETE가 `WHERE project_id` 기반 → 멱등. 재실행 시 0행 영향, 무해.
- 자식→부모 순서가 안전장치: 중간 실패 시 부모 row 잔존하나 FK 고아 없음. 재시도로 완전 정리 가능. → 코드에 반영됨.

### 실행 검증 — 통과
루트 `npm test` (jest):
```
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
Time:        2.034 s
```
PASS: ProgressCalculator / CostCalculator / recordIssueAssignedDate / PortfolioAggregatorAsApp / CommonQuery / PortfolioAggregator. 회귀 없음.
프론트 빌드: 프론트 코드 변경 0 → 생략(정당). 단 빌드 통과 ≠ 동작 보장이나, 본 건은 프론트 무변경이므로 런타임 경계면 위험 없음.

---

## 주의 (NOTE) — 본 RFC 범위 외·기존 동작이나 cascade 실패복구 논리에 영향

### N-1. 부분 실패 시 프론트가 "성공 토스트"를 띄움 → 사용자가 재시도 동인을 못 받음
- **근거(양쪽 읽기)**: `responseWrapper`(ResponseWrapper.js:22-32)는 에러를 catch하여 `{success:false, error}`를 **return**한다(throw/reject 아님). 따라서 `invoke()`는 백엔드 논리 실패에도 **resolve**된다.
- 프론트 두 mutation은 react-query 기준 promise가 resolve되면 `onSuccess`가 발화한다. `result.success`를 검사하지 않음:
  - ProjectList.jsx:91 `onSuccess` → **성공 토스트** + `["projects"]` 무효화 (실패여도 발화)
  - ProjectKanbanBoard.jsx:330 `onSuccess` → **성공 토스트**, 무효화 없음(optimistic 제거 유지)
- **영향**: 본 RFC는 삭제 statement를 1개→4개로 늘려 부분 실패 가능성을 키웠다. 1번(projectusers) 실패 시 부모 project가 남아 목록 재조회 시 다시 노출되지만(자연 재시도 가능), **칸반**은 optimistic으로 카드가 사라진 채 성공 토스트만 떠 DB에는 프로젝트가 잔존(새로고침 전까지 stale). 설계 §2.3 "중간 실패 시 프론트는 실패 토스트" 서술과 **실제 동작이 불일치**.
- **분류**: 기존부터 존재한 프론트 패턴이고 본 RFC의 "프론트 무변경/경계면 불변" 의도에 부합하므로 **실패가 아닌 주의**로 둔다. cascade 백엔드 구현 자체는 계약대로 정확하다.
- **권고(선택, 별도 RFC 후보)**: 두 mutation의 `mutationFn`에서 `const r = await invoke(...); if (!r?.success) throw r.error; return r;` 형태로 `success` 분기를 추가하면 실패 토스트/롤백이 정상 발화. 단 이는 경계면 계약 변경이므로 리더 판단 필요.

---

## 미검증 (UNVERIFIED)

### U-1. cascade 호출 순서·응답 shape에 대한 직접 단위 테스트 부재
- `ProjectService`/`ProjectRepository` 전용 jest 테스트가 리포지토리에 **존재하지 않음**(기존부터). 따라서 "자식→부모 순서", "부분 실패 후 멱등 재시도로 완전 복구"는 **코드 정적 분석으로만 확인**했고 런타임/통합 테스트로 실증하지 못했다.
- 실 DB(Forge SQL) 대상 FK RESTRICT 동작·UUID_TO_BIN 바인딩은 배포 환경에서만 검증 가능 → E2E 미수행.
- 추측으로 통과 처리하지 않고 미검증으로 명시. (정적 교차검증 결과는 모두 일치하므로 회귀 위험은 낮음.)

---

## 재작업 필요 여부
- **backend / frontend 재호출 불요.** cascade 구현은 설계 계약과 정확히 일치하며 테스트 통과.
- N-1은 본 RFC 경계면 불변 원칙상 의도된 범위 밖. 사용자/리더가 "삭제 실패 인지" 개선을 원할 경우에만 별도 작업으로 프론트 mutation에 `success` 분기 추가를 검토.
