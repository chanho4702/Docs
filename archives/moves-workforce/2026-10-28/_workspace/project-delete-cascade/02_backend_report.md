# 백엔드 구현 리포트 — project-delete-cascade

> 설계서 `01_architect_design.md` §3·§6·§7·§10·§11을 그대로 구현. 경계면 계약(§4) 불변 유지.
> 구현일: 2026-06-29 / 구현자: backend-engineer

---

## 1. `deleteProject` resolver 실제 응답 shape (글자 그대로)

resolver 함수명: **`deleteProject`** (변경 없음, `ProjectController.js:22`)

입력 payload:
```
{ project_id: "<uuid string>" }
```

성공 응답 (responseWrapper가 `{ success:true, ...result }`로 직렬화):
```
{
  success: true,
  rows: [],            // DELETE라 결과 행 없음 → 빈 배열
  metadata: { ... }    // Forge SQL Result metadata (affectedRows 등 드라이버 제공 필드)
}
```
- `result`는 **부모 `project` DELETE**(`deleteProjectRepository` → `executeQuery(ProjectQuery.DELETE_BY_ID, [project_id])`)의 반환값.
- `executeQuery`는 `sql.prepare(query).bindParams(...).execute()`의 결과(Forge SQL `Result` 객체: `rows`/`metadata`)를 그대로 반환한다(`CommonQuery.js:21-30`).
- **현행과 byte 단위로 동일**: cascade 추가 전에도 `deleteProjectService`는 동일하게 project DELETE 결과를 반환했고, 신규 service도 4번(project DELETE) 결과를 그대로 반환하므로 응답 객체가 변하지 않음.

실패 응답 (커스텀 `SqlError` throw → responseWrapper 직렬화):
```
{
  success: false,
  error: {
    name: <e.name>,        // 예: "SqlError"
    code: <e.code> || "UNKNOWN_ERROR",
    message: <e.message> || "UNKNOWN_ERROR",
    cause: <e.cause> || ""  // "query: ..., params: ..." 컨텍스트
  }
}
```

프론트 소비: `ProjectList.jsx` `deleteProjectMutation`, `ProjectKanbanBoard.jsx` `deleteCardMutation` 둘 다 응답 본문 필드를 읽지 않고 성공/throw 여부만 사용 → **프론트 변경 불필요**.

---

## 2. 변경 파일별 변경 요지 (5파일)

| 파일 | 변경 요지 |
|---|---|
| `src/rdb/query/ProjectUsersQuery.js` | `ProjectUsersQuery` 객체에 `DELETE_BY_PROJECT_ID` 상수 추가 (`DELETE FROM projectusers WHERE project_id = UUID_TO_BIN(?)`) |
| `src/rdb/query/ProjectDashboard.js` | `ProjectDashboard` 객체에 `DELETE_BY_PROJECT_ID` 상수 추가 (`DELETE FROM project_dashboard WHERE project_id = UUID_TO_BIN(?)`) |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `PortfolioSnapshotQuery` 객체에 `DELETE_BY_PROJECT_ID` 상수 추가 (`DELETE FROM portfolio_project_snapshot WHERE project_id = UUID_TO_BIN(?)`) |
| `src/resolver/project/ProjectRepository.js` | 3개 Query import 추가(`ProjectUsersQuery`/`ProjectDashboard`/`PortfolioSnapshotQuery`, 경로 `../../rdb/query/...`) + repository 함수 3종 추가(`deleteProjectUsersByProjectRepository`, `deleteProjectDashboardByProjectRepository`, `deletePortfolioSnapshotByProjectRepository`, 모두 `executeQuery` 단건 실행) |
| `src/resolver/project/ProjectService.js` | `import {kvs} from "@forge/kvs"` + repository 3종 import 추가. `deleteProjectService`를 자식→부모 순차 cascade로 교체(시그니처/반환 shape 불변, 반환=부모 project DELETE 결과). best-effort `invalidateProjectKvsCache` 헬퍼 추가(`ProjectProgress:{pid}`/`ProjectCost:{pid}` `kvs.delete`, 각각 try/catch + `console.warn`) |

**삭제 순서 (FK 안전, `deleteProjectService` 내부):**
1. `projectusers` (FK 자식)
2. `project_dashboard` (FK 자식)
3. `portfolio_project_snapshot` (파생 스냅샷, FK 없음)
4. `project` (부모, 마지막 — 응답 shape 원천)
5. KVS 무효화: `ProjectProgress:{pid}`, `ProjectCost:{pid}` (best-effort, 흐름 비차단)

- 모든 project_id 바인딩은 `UUID_TO_BIN(?)` (기존 컨벤션 일치).
- 각 DELETE는 별도 `executeQuery` 단건 실행(트랜잭션 미사용 — `@forge/sql` 미지원). `WHERE project_id` 기반이라 멱등 → 부분 실패 시 재시도로 완전 복구.
- KVS 삭제 실패는 catch 후 `console.warn`만, SQL cascade 본 흐름을 깨지 않음. ResourceList/ResourceDetail은 키 가변(start/end/accountId)으로 열거 불가 → TTL 자연 만료 의존(설계 §6 명시).

**변경 없음 확인:** `ProjectController.js`(deleteProject 등록부 그대로), `src/index.js`(신규 컨트롤러 없음), 프론트, DB 스키마/마이그레이션, i18n.

---

## 3. `npm test` 결과 — 전체 통과

```
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
Snapshots:   0 total
Time:        2.977 s
```
- PASS: PortfolioAggregator / recordIssueAssignedDate / CommonQuery / CostCalculator / ProgressCalculator / PortfolioAggregatorAsApp
- `ProjectService`/`ProjectRepository` 전용 단위 테스트는 리포지토리에 **존재하지 않음**(기존부터). 따라서 삭제 호출 순서/응답 shape에 대한 직접 회귀 테스트는 없으나, 코드 레벨에서 반환값=부모 project DELETE 결과로 보존 확인. 기존 테스트 회귀 없음.

---

## 4. 설계 대비 벗어난 점

**없음.** 설계서 §3(SQL 상수·위치), §6(KVS best-effort 무효화), §7(repository 3종 + service cascade + kvs import), §10(변경 파일 5개), §11(체크리스트) 전부 그대로 구현. 경계면 계약(§4) 불변.

비고:
- `invalidateProjectKvsCache` 헬퍼는 두 키를 각각 독립 try/catch로 감싸 한 키 삭제 실패가 다른 키 삭제를 막지 않도록 구현(설계 의도 "best-effort"의 강건한 해석).
- repository 함수 3종은 설계서 코드와 동일한 화살표 단행 형태(`async params => await executeQuery(...)`)로 작성.
