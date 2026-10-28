# 02 Backend Report — 간트 폴더 레이어 (2026-07-02)

> frontend-engineer 는 이 문서의 **§1 실제 응답 shape(글자 그대로)** 을 소비 계약으로 삼는다.
> 설계서 §2 계약과 **완전 일치**로 구현됨(이탈 없음). 기존 간트 tasks/links/meta 완전 무변경(additive).

---

## 1. 구현된 resolver 함수 + 실제 응답 shape (글자 그대로)

모든 함수는 `responseWrapper` 로 감쌌으므로 프론트 수신은 `{ success, content, error }`.
아래는 성공 시 **`content` 내부** (프론트는 `result.content` 로 접근).

### 1-A. `getProjectGanttData` (확장 — additive)
입력: `{ projectId, coworkerFieldId }` (무변경)

```
content = {
  tasks: [Task],           // ← 무변경 (Task shape 완전 동결, 필드 추가 없음)
  links: [Link],           // ← 무변경
  meta: { total, fetchedAt, projectStart, projectEnd },  // ← 무변경
  folders: [               // ★ 신규
    { id, name, parentFolderId, sortOrder }
  ],
  folderIssues: {          // ★ 신규 — 이슈key → 소속 folderId (직접 소속만)
    "<issueKey>": "<folderId>", ...
  }
}
```
- `folders[].id`, `folders[].parentFolderId` = **plain UUID string**(BIN_TO_UUID). `parentFolderId` 는 루트면 `null`.
- `folders[].sortOrder` = number.
- `folderIssues` 는 **객체(맵)**. 키=Jira issueKey(string), 값=folderId(UUID string). 소속 없는 이슈는 키 자체가 없음.
- **폴더 조회는 best-effort**: 폴더 2쿼리가 실패해도(예: 마이그레이션 미적용) `folders:[]`, `folderIssues:{}` 로 폴백하고 tasks/links/meta 는 정상 반환(무회귀 보장).

### 1-B. `createGanttFolder`
입력: `{ projectId, name, parentFolderId }` (parentFolderId 생략/null → 루트)
```
content = { folder: { id, name, parentFolderId, sortOrder } }
```
- `id` = 신규 생성 UUID string. `name` = **trim 된** 이름. `parentFolderId` = 입력값 또는 `null`. `sortOrder` = 형제 max+1(없으면 0).

### 1-C. `renameGanttFolder`
입력: `{ projectId, folderId, name }`
```
content = { folderId, name }
```
- `name` = trim 된 이름.

### 1-D. `moveGanttFolder`
입력: `{ projectId, folderId, parentFolderId }` (null → 루트)
```
content = { folderId, parentFolderId }
```
- `parentFolderId` = 입력값 또는 `null`.

### 1-E. `deleteGanttFolder`
입력: `{ projectId, folderId }`
```
content = { folderId, reparentedTo, movedIssueKeys, movedFolderIds }
```
- `reparentedTo` = 삭제 폴더의 부모 folderId(없으면 `null` = 루트 승계).
- `movedIssueKeys` = **string[]** (승계 전 이 폴더에 직접 소속했던 이슈 key 목록).
- `movedFolderIds` = **string[]** (승계 전 이 폴더의 직속 하위폴더 id 목록).
- 승계 규칙: `reparentedTo != null` → 이슈/하위폴더 상위 폴더로 **UPDATE 재소속**. `reparentedTo == null` → 이슈 소속 **DELETE(=루트)**, 하위폴더 parent=**NULL(루트)**. 이슈는 절대 삭제 안 함.

### 1-F. `setGanttIssueFolder`
입력: `{ projectId, issueKey, folderId }` (folderId=null → 폴더에서 빼기)
```
content = { issueKey, folderId }
```
- `folderId` = 지정 시 입력 folderId, 해제 시 `null`.

### 에러(모든 폴더 resolver 공통)
`LogicalError` throw → responseWrapper 가 `{ success:false, error:{ name:'LogicalError', code, message, cause } }` 로 직렬화. 프론트는 `result.error.code` 로 분기.

| code | 발생 |
|------|------|
| `GANTT_FOLDER_NAME_REQUIRED` | 빈 이름(trim 후 공백) |
| `GANTT_FOLDER_NAME_TOO_LONG` | 이름 120자 초과 (**설계 §3-5 목록 외 신규** — 확정결정 "120자 제한" 반영. mapFolderError 미매핑 시 default `gantt.error.folderSaveFailed` 로 처리됨. 원하면 프론트에 `gantt.error.folderNameTooLong` 매핑 추가 권장) |
| `GANTT_FOLDER_NOT_FOUND` | 대상/부모 폴더 없음·타 프로젝트 |
| `GANTT_FOLDER_CYCLE_DETECTED` | 폴더 self/자손으로 이동(순환) |

> 계약 이탈 사항: 설계 §2-A 는 `GANTT_FOLDER_NAME_REQUIRED` 로 빈 이름만 명시했으나, **확정 가정(120자 제한, DDL+서비스 검증)** 을 지키기 위해 길이 초과를 `GANTT_FOLDER_NAME_TOO_LONG` 로 분리 신설했다(빈값에 잘못된 코드 재사용 회피). 그 외 응답 shape·코드는 설계와 100% 일치.

---

## 2. 등록 위치

- `src/resolver/gantt/GanttController.js` `registerGanttController(resolver)` 내부에 5종 `resolver.define` 추가.
- `src/index.js` **변경 없음**(이미 `registerGanttController(resolver)` 등록됨 — 신규 컨트롤러 없음).
- 프론트 invoke 이름: `createGanttFolder` / `renameGanttFolder` / `moveGanttFolder` / `deleteGanttFolder` / `setGanttIssueFolder`.
- 무효화: 5종 모두 Jira write 0 → 프론트는 `invalidateQueries(ganttKeys.data(projectId))` (일반 invalidate) 사용 가능(캐시 부분패치 불요).

---

## 3. 신규/변경 파일

### 신규
| 파일 | 내용 |
|------|------|
| `src/rdb/schema/ddl/ganttFolder.sql.js` | `CREATE_GANTT_FOLDER_TABLE`, `CREATE_GANTT_FOLDER_ISSUE_TABLE` (VARCHAR(120)) |
| `src/rdb/query/GanttFolderQuery.js` | 폴더 CRUD/소속/승계/cascade SQL 상수 |
| `src/resolver/gantt/GanttFolderRepository.js` | executeQuery 얇은 래퍼 |
| `src/resolver/gantt/GanttFolderValidationService.js` | `detectFolderCycle` 순수함수(jest) |
| `src/resolver/gantt/GanttFolderService.js` | create/rename/move/delete/setIssueFolder |
| `src/resolver/gantt/__test__/GanttFolderValidationService.test.js` | 순환검증 8 케이스 |
| `src/resolver/gantt/__test__/GanttFolderService.test.js` | 승계 분기/소속/이름검증 12 케이스(Repo mock) |

### 변경(additive, 무회귀)
| 파일 | 변경 |
|------|------|
| `src/rdb/schema/ddl/index.js` | 두 DDL export 추가 |
| `src/rdb/schema/migrate.js` | import + `v007_create_gantt_folder_table`, `v008_create_gantt_folder_issue_table` enqueue |
| `src/resolver/gantt/GanttController.js` | resolver 5종 define |
| `src/resolver/gantt/GanttService.js` | `getProjectGanttData` 에 폴더 2쿼리 `Promise.all` + `content.folders`/`content.folderIssues` 조립(tasks/links/meta 불변) |
| `src/utils/errors/ErrorCodes.js` | 4종 추가(`_NAME_REQUIRED`/`_NAME_TOO_LONG`/`_NOT_FOUND`/`_CYCLE_DETECTED`) |
| `src/resolver/project/ProjectService.js` | `deleteProjectService` cascade 에 folder_issue → folder 편입 |

- **manifest.yml 변경 불요**: SQL(`sql:` line 69) + `runMigration`(line 58/75) 이미 등록됨. 확인만 함(임의 수정 없음).

---

## 4. DDL (실제)

```sql
CREATE TABLE IF NOT EXISTS gantt_folder (
    folder_id         BINARY(16),
    project_id        BINARY(16)   NOT NULL,
    name              VARCHAR(120)  NOT NULL,   -- 확정결정: 120자 제한
    parent_folder_id  BINARY(16)   NULL,        -- 루트면 NULL(중첩)
    sort_order        INT          NOT NULL DEFAULT 0,
    created_id        VARCHAR(100),
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_id        VARCHAR(100),
    updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (folder_id),
    INDEX (project_id),
    INDEX (project_id, parent_folder_id)
);

CREATE TABLE IF NOT EXISTS gantt_folder_issue (
    issue_key    VARCHAR(50),                   -- PK = 이슈당 1폴더 강제
    project_id   BINARY(16)   NOT NULL,
    folder_id    BINARY(16)   NOT NULL,
    created_id   VARCHAR(100),
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_key),
    INDEX (project_id),
    INDEX (folder_id)
);
```
- TiDB 제약 반영: **FK 선언 없음**. 무결성은 앱레벨(순차 멱등 삭제·`detectFolderCycle`·PK(issue_key)·project_id 스코프·cascade).
- BINARY(16) ↔ UUID: 쓰기 `UUID_TO_BIN(?)`(NULL→NULL), 읽기 `BIN_TO_UUID(col)`. sort_order 계산은 `parent_folder_id <=> UUID_TO_BIN(?)`(null-safe).
- folder_id 는 앱에서 `crypto.randomUUID()` 생성 후 INSERT(재-SELECT 없이 응답 id 확정).

---

## 5. 테스트 결과

- `npx jest src/resolver/gantt` → **4 suites / 57 tests PASS**.
- `npm test`(전체) → **10 suites / 146 tests PASS** (기존 회귀 없음).
  - 신규: `GanttFolderValidationService.test.js`(8), `GanttFolderService.test.js`(12) 포함.
- 커버: 폴더 순환(self/직접자손/깊은자손/루트이동/손상그래프 무한루프 방어), 삭제 승계 분기(상위 UPDATE vs 루트 DELETE + 응답 shape), 이슈 소속 지정/해제, 이름 빈값/120자 초과, 부모/폴더 미존재 NOT_FOUND.

---

## 6. frontend-engineer 참고(경계면 유의)

- `folderIssues` 는 **직접 소속만** 담음(이슈의 WBS 하위트리 소속은 어댑터가 트리로 전파). 어댑터는 dangling(존재 안 하는 folderId/issueKey) 참조를 무시해야 함(§7-4 방어).
- 어댑터 우선순위(확정): **effectiveParent(이슈-부모) > folderIssues(폴더-소속) > 루트**. 이슈-부모 있으면 폴더 소속 시각 무효 — 백엔드는 데이터만 충실히 반환, 우선순위 판정은 프론트 몫.
- 폴더 SVAR id 네임스페이스 `folder:<id>` 는 어댑터 책임. 백엔드는 항상 plain UUID 반환.
- `deleteGanttFolder` 응답의 `movedIssueKeys`/`movedFolderIds` 로 낙관적 UI 갱신 가능하나, 즉시 invalidate 로 충분(권장).
