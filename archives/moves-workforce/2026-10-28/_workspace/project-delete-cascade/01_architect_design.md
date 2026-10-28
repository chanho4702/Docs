# 프로젝트 삭제 cascade 보완 설계서

> 기존 `deleteProject` resolver가 `project` 단일 행만 삭제하여 연관 자식 행/스냅샷/KVS 캐시가 고아로 남는 문제를 보완한다.
> **경계면 계약(§4)은 현재와 100% 동일하게 유지** — 백엔드 내부 로직만 cascade로 확장한다. 프론트 변경 없음.

---

## 1. 개요 / 영향 범위

- **백엔드(수정만, 신규 도메인 없음)**: `project` 도메인의 `deleteProjectService` 한 함수를 cascade 로직으로 교체. 자식 테이블 일괄삭제 쿼리 3종 신규 추가. KVS 무효화 1건 추가.
- **프론트**: **변경 없음** (경계면 계약 불변). 점검만 수행(§5).
- **DB**: 스키마/마이그레이션 변경 **없음**. 기존 테이블에 `DELETE ... WHERE project_id` 쿼리 상수만 추가.
- **i18n**: 추가 키 **없음** (UI 신규 노출 문자열 없음). 기존 토스트 키 재사용.

### 코드 전수 확인 결과 (grep/read로 검증한 사실)

`src/rdb/schema/ddl/` 전체에서 `project_id` 또는 `REFERENCES project`를 참조하는 테이블:

| 테이블 | project 참조 | FK 제약 | project_id 타입 | 기존 삭제 쿼리 | cascade 대상 |
|---|---|---|---|---|---|
| `projectusers` | FK → project(project_id) | `FOREIGN KEY` (ON DELETE 미지정 = RESTRICT) | BINARY(16) | `DELETE_BY_KEY` (단건, project_member_id) | **O** |
| `project_dashboard` | FK → project(project_id) | `FOREIGN KEY` (RESTRICT) | BINARY(16) | `DELETE_BY_DASHBOARD_ID` (project_id+dashboard_id 단건) | **O** |
| `portfolio_project_snapshot` | PK = project_id | **FK 없음** | BINARY(16) | 없음 | **O** |
| `worklog_issue_daily` | (DDL 전체 주석 처리) | — | — | — | **X (테이블 미존재)** |
| `user_schedule` | `account_id` → users 만 참조, project 무관 | — | — | — | **X (project 비참조)** |

→ cascade 대상은 정확히 **3개 테이블**: `projectusers`, `project_dashboard`, `portfolio_project_snapshot`. 누락 없음.

---

## 2. 트랜잭션 전략 (실측 결과 반영)

**`@forge/sql`은 트랜잭션/시퀀스 실행을 지원하지 않는다.** (`node_modules/@forge/sql/out/*.d.ts` 직접 확인)

- `SqlClient` 노출 메서드: `prepare(query).bindParams(...).execute()`, `executeRaw(query)`, `executeDDL(query)`, `_provision()` 뿐.
- `startTransaction` / `executeSequence` / `begin` / `commit` 류 export **전무** (`grep -i transaction|sequence|begin` 결과 0건).
- 현 `src/rdb/query/CommonQuery.js`의 `executeQuery`는 `sql.prepare().bindParams().execute()` — **단건 statement만 실행**.
- 멀티 statement(`;` 결합)는 Forge SQL이 거부하므로 사용 불가.

### 결론: 순차 삭제 + 멱등성 기반 재시도 안전성

원자적 트랜잭션이 불가하므로 **자식 → 부모 순서로 순차 DELETE**한다. 각 DELETE를 별도 `executeQuery`로 실행한다.

부분 실패(중간 단계 에러) 대비책:
1. **삭제 순서가 곧 안전장치** — 항상 자식(projectusers, dashboard, snapshot)을 먼저 지우고 부모(project)를 마지막에 지운다. 중간 실패 시 부모 `project` 행은 남으므로 "프로젝트는 존재하되 일부 자식만 삭제된" 상태가 되지만, **FK 위반 고아(부모 없는 자식)는 절대 생기지 않는다.**
2. **모든 DELETE는 `WHERE project_id = ?` 기반이라 멱등** — 이미 지워진 대상에 재실행해도 0행 영향, 무해. 따라서 사용자가 삭제를 재시도하면 남은 자식까지 정리되고 최종적으로 부모까지 삭제되어 **재시도로 완전 복구**된다.
3. 중간 실패 시 `executeQuery`가 `SqlError`를 throw → `responseWrapper`가 `{ success:false, error }`로 직렬화 → 프론트는 실패 토스트. (기존 에러 패턴 유지)

> 향후 Forge SQL이 트랜잭션을 지원하면 이 순차 블록을 트랜잭션으로 감싸는 것으로 교체 가능(로직 구조 동일).

---

## 3. 삭제 cascade 순서 설계 (FK 안전: 자식 → 부모)

```
deleteProjectService({ project_id })
  1. DELETE FROM projectusers              WHERE project_id = UUID_TO_BIN(?)   -- 자식(FK)
  2. DELETE FROM project_dashboard         WHERE project_id = UUID_TO_BIN(?)   -- 자식(FK)
  3. DELETE FROM portfolio_project_snapshot WHERE project_id = UUID_TO_BIN(?)  -- 파생 스냅샷(FK 없음)
  4. DELETE FROM project                   WHERE project_id = UUID_TO_BIN(?)   -- 부모(마지막)
  5. KVS 무효화: kvs.delete('ProjectProgress:'+project_id), kvs.delete('ProjectCost:'+project_id)
  6. return (4)의 project DELETE 결과  -- 응답 shape 보존(§4)
```

1·2번은 FK RESTRICT이므로 **반드시 4번보다 먼저** 실행해야 한다(미실행 시 Forge가 FK를 강제하면 4번이 FK 위반으로 실패). 3번은 FK가 없어 순서 무관하나 cascade 일관성을 위해 부모 삭제 전에 둔다.

### 신규 일괄삭제 쿼리 (정확한 SQL + 위치)

모든 project_id 컬럼이 `BINARY(16)`이고 입력 `project_id`는 UUID 문자열이므로 **`UUID_TO_BIN(?)`** 로 바인딩한다(기존 쿼리들과 동일 컨벤션).

**(a) `src/rdb/query/ProjectUsersQuery.js`** — `ProjectUsersQuery` 객체에 추가:
```js
DELETE_BY_PROJECT_ID: `
    DELETE
    FROM projectusers
    WHERE project_id = UUID_TO_BIN(?)
`,
```

**(b) `src/rdb/query/ProjectDashboard.js`** — `ProjectDashboard` 객체에 추가:
```js
DELETE_BY_PROJECT_ID: `
    DELETE FROM project_dashboard
    WHERE project_id = UUID_TO_BIN(?)
`,
```

**(c) `src/rdb/query/PortfolioSnapshotQuery.js`** — `PortfolioSnapshotQuery` 객체에 추가:
```js
DELETE_BY_PROJECT_ID: `
    DELETE FROM portfolio_project_snapshot
    WHERE project_id = UUID_TO_BIN(?)
`,
```

> `project` 부모 삭제는 기존 `ProjectQuery.DELETE_BY_ID` 재사용(이미 `UUID_TO_BIN(?)`).

---

## 4. 경계면 계약 (가장 중요 — 현재와 동일 유지)

resolver 함수명·입력·응답 shape **전부 불변**. 프론트는 손대지 않는다.

| resolver 함수 | 입력 payload | 응답 shape (success 시) | 응답 shape (실패 시) | 대응 프론트 |
|---|---|---|---|---|
| `deleteProject` | `{ project_id: <uuid string> }` | `{ success: true, ...(project DELETE 결과: Forge SQL `rows`/`metadata`) }` | `{ success: false, error: { name, code, message, cause } }` | ① `ProjectList.jsx` `deleteProjectMutation`<br>② `ProjectKanbanBoard.jsx` `deleteCardMutation` |

- 컨트롤러(`ProjectController.js:22`) 정의 **변경 없음**: `responseWrapper(({payload}) => deleteProjectService(payload))`.
- 응답 shape 보존 근거: `responseWrapper`는 success 시 `{ success:true, ...result }`를 반환(`ResponseWrapper.js:18`). 현 `deleteProjectService`는 `project` DELETE의 SQL 결과를 반환한다. 신규 서비스도 **4번(project DELETE) 결과를 그대로 반환**하면 응답 객체가 byte 단위로 동일.
- 프론트 소비 검증: 두 mutation 모두 응답 본문 필드를 읽지 않고 **성공/throw 여부만** 사용(toast + 무효화). 따라서 content 필드 변동이 있어도 무해하나, 보존 원칙상 동일하게 유지한다.

---

## 5. 프론트엔드 영향 범위 (점검만 — 변경 없음 예상)

`deleteProject`를 호출하는 프론트 지점 2곳 (grep 결과):

1. **`static/ui/src/pages/project/ProjectList.jsx:87`** `deleteProjectMutation`
   - `onSuccess` → `queryClient.invalidateQueries({ queryKey: ["projects"] })` + 성공 토스트.
   - 점검 포인트: 프로젝트 목록은 `["projects"]` 무효화로 갱신됨. cascade 후에도 목록만 보면 충분 → **변경 불필요**.
2. **`static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx:308`** `deleteCardMutation`
   - optimistic update로 카드 즉시 제거 + 성공 토스트. cascade는 백엔드 내부 → 칸반 표시에 영향 없음 → **변경 불필요**.

추가 고려(선택): 삭제된 프로젝트의 상세/대시보드/포트폴리오 쿼리 캐시가 클라이언트에 남을 수 있으나,
- 삭제는 목록/칸반 화면에서 일어나고 해당 프로젝트 상세 화면은 이미 떠나 있는 흐름이라 실사용상 stale 노출 없음.
- 포트폴리오 대시보드(`/dashboard`)는 별도 진입 시 재조회되고, 백엔드 snapshot이 삭제되어 유령 프로젝트가 사라짐.

→ **프론트 코드 변경 없음. 위 2개 mutation은 현행 유지.** (검증 단계에서 invoke 입력 `{ project_id }`가 계약과 일치하는지만 확인)

---

## 6. KVS 캐시 무효화 설계

`kvs.delete(key: string): Promise<void>` 사용 가능 확인(`@forge/kvs/out/kvs.d.ts:18`). 코드 내 import: `import { kvs } from '@forge/kvs';`.

| 캐시 키 | 구성 | 즉시 무효화 | 방법 |
|---|---|---|---|
| `ProjectProgress:{projectId}` | projectId 단일 (start/end 미포함, `ProjectProgressService.js:58` 실측) | **O** | `await kvs.delete(\`ProjectProgress:${project_id}\`)` |
| `ProjectCost:{projectId}` | projectId 단일 (`ProjectCostService.js:80` 실측) | **O** | `await kvs.delete(\`ProjectCost:${project_id}\`)` |
| `ResourceList:{pid}:{start}:{end}` | start/end 가변 → 키 열거 불가 | **X** | TTL(10분) 자연 만료 의존 |
| `ResourceDetail:{pid}:{accountId}:{start}:{end}` | accountId/start/end 가변 → 키 열거 불가 | **X** | TTL(5분) 자연 만료 의존 |

설계:
- `project` DELETE(4번) 성공 후 `ProjectProgress`/`ProjectCost` 두 키를 `kvs.delete`로 즉시 무효화.
- 두 KVS 삭제는 **best-effort**: 실패해도 TTL(10분)이 보장하므로 `try/catch`로 감싸 삭제 본 흐름(이미 성공한 SQL cascade)을 깨지 않는다. 캐시 삭제 실패 로그만 남긴다(`console.warn`).
- ResourceList/ResourceDetail은 키에 start/end/accountId가 포함되어 전수 열거가 불가능 → 즉시 삭제 비대상, **TTL 의존 명시**(요구사항 §3.35와 일치). 삭제 직후 최대 10분 stale 가능하나 수용.

---

## 7. 백엔드 설계 (계층별)

### Repository — `src/resolver/project/ProjectRepository.js`
신규 일괄삭제 repository 함수 3종 추가(기존 `deleteProjectRepository` 패턴 동일, `executeQuery` 단건 실행):
```js
export const deleteProjectUsersByProjectRepository = async params =>
    await executeQuery(ProjectUsersQuery.DELETE_BY_PROJECT_ID, params);

export const deleteProjectDashboardByProjectRepository = async params =>
    await executeQuery(ProjectDashboard.DELETE_BY_PROJECT_ID, params);

export const deletePortfolioSnapshotByProjectRepository = async params =>
    await executeQuery(PortfolioSnapshotQuery.DELETE_BY_PROJECT_ID, params);
```
- import 추가: `ProjectUsersQuery`, `ProjectDashboard`, `PortfolioSnapshotQuery` (from `../../rdb/query/...`).
- 기존 `deleteProjectRepository`(project 본체 삭제)는 그대로 재사용.

### Service — `src/resolver/project/ProjectService.js`
`deleteProjectService`를 cascade로 교체(시그니처/반환 shape 불변):
```js
export const deleteProjectService = async ({ project_id }) => {
    const params = [project_id];

    // 자식 → 부모 FK 안전 순서 (트랜잭션 미지원 → 순차, 각 DELETE 멱등)
    await deleteProjectUsersByProjectRepository(params);        // 1
    await deleteProjectDashboardByProjectRepository(params);    // 2
    await deletePortfolioSnapshotByProjectRepository(params);   // 3
    const result = await deleteProjectRepository(params);       // 4 (부모, 응답 shape 원천)

    // 5. KVS 즉시 무효화 (best-effort, 실패 무시 — TTL 백업)
    await invalidateProjectKvsCache(project_id);

    return result; // §4 계약: project DELETE 결과 그대로 반환
};
```
- `invalidateProjectKvsCache` 헬퍼(같은 파일 또는 작은 util)에서 `ProjectProgress`/`ProjectCost` 키 `kvs.delete`를 `try/catch`로 호출.
- `import { kvs } from '@forge/kvs';` 추가.

### Controller — `src/resolver/project/ProjectController.js`
**변경 없음** (이미 `deleteProject` → `deleteProjectService(payload)` 등록).

### `src/index.js`
**변경 없음** (신규 컨트롤러 없음).

### 에러 처리
- 각 `executeQuery` 실패는 기존대로 `SqlError`(code, 쿼리/파라미터 cause 포함) throw → `responseWrapper` 직렬화. 신규 에러 코드 불필요.
- KVS 삭제 실패는 흐름을 막지 않음(catch 후 warn).

---

## 8. DB 설계

- **스키마/마이그레이션 변경 없음.** 기존 테이블에 신규 `DELETE ... WHERE project_id = UUID_TO_BIN(?)` 쿼리 상수만 추가(§3).
- DDL의 FK는 `ON DELETE` 미지정. 본 설계는 애플리케이션 레벨에서 자식 선삭제로 cascade를 구현하므로 DDL 변경 불요.

### ⚠️ `ON DELETE CASCADE`는 Forge SQL에서 불가능 (2026-06-29 공식 확인)

DDL에 `ON DELETE CASCADE`를 추가하는 대안은 **검토 결과 무효**다. Forge SQL은 **TiDB 기반**이며 Atlassian 공식 문서가 다음을 명시한다:
- **FK 제약을 강제하지 않음** — FK는 인덱스 역할만 하고 참조 무결성을 보장하지 않는다(임의 값 삽입 가능).
- **`ON DELETE CASCADE`가 작동하지 않음** — "DELETE operations will not be cascaded".
- → 참조 무결성·cascade는 **반드시 애플리케이션 로직에서 처리**하라는 게 공식 권고.

따라서:
1. 본 설계의 **애플리케이션 레벨 순차 cascade(§3)가 Forge SQL에서 유일하게 작동하는 정답**이다(범위 외가 아니라 *애초에 불가능*한 대안을 회피한 것).
2. 원래 증상(삭제는 성공·고아 행 잔존)도 이로써 정확히 설명된다 — FK가 강제됐다면 자식 있는 프로젝트 삭제가 FK 위반으로 *실패*했어야 하나, 실제로는 삭제되고 고아만 남았다 = FK 미강제(TiDB 동작과 일치).
3. 출처: [Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/), [Forge SQL storage reference](https://developer.atlassian.com/platform/forge/storage-reference/sql/).

---

## 9. i18n 키 목록

**추가 키 없음.** 삭제는 기존 토스트 키 재사용:
- 성공: `project.delete.toast.description.success`, `common.toast.description.deleteSuccess` (기존)
- 실패: `project.delete.toast.description.fail` (기존)

→ `locales/kr/*.json`·`locales/en/*.json` 수정 불필요, `npm run merge` 불필요.

---

## 10. 변경 파일 목록 + 변경 요지

### 백엔드
| 파일 | 변경 요지 |
|---|---|
| `src/rdb/query/ProjectUsersQuery.js` | `DELETE_BY_PROJECT_ID` 상수 추가 |
| `src/rdb/query/ProjectDashboard.js` | `DELETE_BY_PROJECT_ID` 상수 추가 |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `DELETE_BY_PROJECT_ID` 상수 추가 |
| `src/resolver/project/ProjectRepository.js` | repository 함수 3종 추가 + 3개 Query import |
| `src/resolver/project/ProjectService.js` | `deleteProjectService` cascade 교체, `kvs` import + 캐시 무효화 헬퍼 |

### 프론트엔드
| 파일 | 변경 요지 |
|---|---|
| (없음) | 계약 불변. `ProjectList.jsx`/`ProjectKanbanBoard.jsx` 현행 유지(점검만) |

---

## 11. 구현 작업 분해 (체크리스트)

### backend
- [ ] `ProjectUsersQuery.js`에 `DELETE_BY_PROJECT_ID` 추가
- [ ] `ProjectDashboard.js`에 `DELETE_BY_PROJECT_ID` 추가
- [ ] `PortfolioSnapshotQuery.js`에 `DELETE_BY_PROJECT_ID` 추가
- [ ] `ProjectRepository.js`에 repository 함수 3종 + import 추가
- [ ] `ProjectService.js` `deleteProjectService` cascade(자식→부모 순차)로 교체, 반환값은 project DELETE 결과 유지
- [ ] `ProjectService.js`에 `kvs` import + `ProjectProgress`/`ProjectCost` best-effort `kvs.delete`(try/catch)
- [ ] `npm test`(루트) 통과 — deleteProjectService 호출 순서/응답 shape 회귀 확인

### frontend
- [ ] 변경 없음. `deleteProject` invoke 입력이 `{ project_id }`인지, onSuccess 무효화가 유지되는지 점검만

### verifier 기준
- [ ] §4 경계면 계약: `deleteProject` 입력 `{ project_id }` / 응답 `{ success, ... }` 불변 확인
- [ ] cascade 순서 자식→부모 준수, 4개 테이블(projectusers·project_dashboard·portfolio_project_snapshot·project) 모두 포함, 누락 없음
- [ ] 트랜잭션 미사용·순차 삭제·멱등 재시도 안전성 확인
- [ ] KVS 무효화가 best-effort(흐름 비차단)인지 확인

---

## 12. 핵심 가정 / 비고

- **누락 테이블 없음**: `src/rdb/schema/ddl/` 전수 grep으로 project 참조 테이블이 정확히 3개임을 확인. `worklog_issue_daily`는 DDL 전체 주석(미존재), `user_schedule`은 users만 참조.
- **트랜잭션 부재는 실측 사실**(`@forge/sql` 타입 정의 직접 확인) — 추측 아님. 멱등 재시도로 보완.
- **프론트 무변경**이 본 설계의 의도된 결과 — 경계면 계약을 일부러 고정했다.
