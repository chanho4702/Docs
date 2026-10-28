# 간트 행 순서 드래그(이슈+폴더) 설계서

작성: feature-architect · 2026-07-02
소스 요구: `_workspace/gantt-row-order/00_input/requirement.md`
기반 패턴: 간트 폴더 레이어(`src/resolver/gantt/GanttFolder*`, `useGanttFolderMutations.js`, `ganttAdapter.js`)를 최대 재사용. 신규 발명 최소화.

---

## 0. 설계 결정 요약 (6항목 · 선택지 비교 → 확정 + 근거)

| # | 결정 항목 | 선택지 | **확정** | 근거 |
|---|-----------|--------|----------|------|
| 1 | 저장소 | (a) 통합 `gantt_node_order` vs (b) 이슈 신규 테이블 + 폴더는 기존 `gantt_folder.sort_order` 재사용 | **(b)** — 신규 `gantt_issue_order` + 폴더 `sort_order` 재사용. 단일 resolver가 nodeType로 분기 | 폴더는 이미 `sort_order` 컬럼·INSERT 계산·어댑터 정렬(`synthesizeFolderNodes`)이 동작 중. 통합 테이블은 이를 중복/폐기해야 해 동작 코드에 회귀 위험. "과설계 금지·기존 재사용 최대" 원칙 → (b). 코드 경로 단일화는 **resolver 계약·프론트 훅 1개**로 달성(내부만 2 테이블). |
| 2 | 순서 값 전략 | 소수점 midpoint vs 형제 그룹 일괄 정규화 | **일괄 정규화(bulk, 0-based 정수)** | 미정렬 형제의 fetch 순서가 안정적이지 않아 midpoint 기준점이 흔들림(요구서 지적). 드롭 시 형제 밴드 전체를 `0..n-1` 정수로 재부여 → drift 없음. 그룹 크기 수십 → bulk 부담 무시가능. |
| 3 | resolver 시그니처 | bulk 단일 vs 노드별 | **bulk 단일** `reorderGanttNodes({ projectId, orders:[{nodeId,nodeType,sortOrder}] })` | 프론트가 드롭 확정 시 해당 밴드 전체 순서를 계산해 한 번에 전송하는 흐름(결정 2)과 정합. 노드별은 N콜·중간상태 노출. |
| 4 | read 확장 | tasks에 주입 vs additive 별도 필드 | **additive `content.issueOrders: {issueKey:sortOrder}`** (폴더 순서는 기존 `content.folders[].sortOrder` 재사용) | Task shape 동결(folderIssues 선례). 폴더는 이미 folders 배열에 sortOrder 실림 → 이슈만 신규 맵 1개 추가. |
| 5 | 정렬 적용 지점 + 혼합 정책 | 어댑터 형제별 정렬. 폴더/이슈 혼합 그룹 표시 | **어댑터(`toSvarTasks`)에서 밴드 분리 — 그룹 내 폴더 밴드가 위, 이슈 밴드가 아래.** 폴더=sortOrder순(기존), 이슈=issueOrders순→미정렬은 fetch순 폴백 | 밴드 분리로 두 정수 공간이 절대 교차하지 않음(통합 불필요·결정 1과 정합). 폴더=그룹핑 컨테이너이므로 상단 배치가 파일탐색기 관례에 부합. SVAR는 **부모별 형제 상대순서**만 보므로 `folderNodes.concat(issueNodes)` 전역 concat 하나로 모든 부모에서 폴더-우선 달성. |
| 6 | 드래그 UX | move-task before/after → reorder vs reparent 분기 | **same-parent & 동일타입 → reorder(신규). 부모 상이 → 기존 reparent(W-2). 혼합 타입/child(폴더 관여) → skip** | `targetParent === draggedParent` && 동일 nodeType이면 순수 재정렬로 확정 판별. 폴더↔이슈 혼합 드래그는 밴드 정책상 교차 불가 → skip(폴더 소속/이동은 기존 모달 경로 유지). |

---

## 1. 개요 / 영향 범위

- **백엔드**: gantt 도메인 신규 resolver `reorderGanttNodes` 1개 + read(`getProjectGanttData`) additive 확장. 신규 테이블 `gantt_issue_order`, 신규 마이그레이션 v009. 프로젝트 삭제 cascade 편입.
- **프론트**: `ganttAdapter.js`(정렬·밴드), `GanttChart.jsx`(move-task intercept 분기), `useGanttFolderMutations.js`(reorder 훅 추가) 수정. `useGanttData.js`에 `issueOrders` passthrough. `GanttPage.jsx` 배선. 신규 페이지/라우트/탭 **없음**.
- **DB**: MySQL 신규 1테이블(`gantt_issue_order`), 기존 `gantt_folder.sort_order` 재사용(스키마 변경 없음). KVS 변경 없음.
- **i18n**: `locales/kr/gantt.json`·`locales/en/gantt.json`에 toast/error 키 2~3개 추가.

---

## 2. 경계면 계약 (단일 진실 원천)

### 2-A. 신규 write — `reorderGanttNodes`

| 항목 | 내용 (글자 그대로) |
|------|------|
| resolver 함수 | `reorderGanttNodes` |
| 입력 파라미터 | `{ projectId, orders: [ { nodeId, nodeType, sortOrder } ] }` |
| `nodeId` | 이슈=issueKey(string) / 폴더=folder uuid(string, `folder:` 접두 **없이** plain uuid) |
| `nodeType` | `'issue'` \| `'folder'` |
| `sortOrder` | `int` — 해당 형제 밴드 내 0-based 연속 인덱스 |
| success 응답 shape | `{ content: { orders: [ { nodeId, nodeType, sortOrder } ] } }` (입력 echo — 캐시 패치용) |
| 실패 응답 | `{ success:false, error:{ name, code, message, cause } }` (responseWrapper) |
| 대응 프론트 훅 | `useReorderNodes({ projectId, toast })` (in `useGanttFolderMutations.js`) |
| 대응 쿼리키 | `ganttKeys.data(projectId)` 캐시 부분 패치(전체 invalidate 금지) |

> orders 는 **한 형제 밴드**(같은 부모·같은 nodeType)만 담는다. 혼합 금지(밴드 정책). 서비스는 nodeType로 분기: `'folder'` → `gantt_folder.sort_order` UPDATE, `'issue'` → `gantt_issue_order` UPSERT.

### 2-B. read 확장 — `getProjectGanttData` (additive)

| 항목 | 내용 |
|------|------|
| 입력 | `{ projectId, coworkerFieldId }` (기존 무변경) |
| 신규 응답 필드 | `content.issueOrders: { [issueKey:string]: sortOrder:int }` — 순서 지정된 이슈만(미지정 이슈는 키 없음) |
| 기존 필드 | `content.tasks / links / meta / folders / folderIssues` **완전 무변경**. 폴더 순서는 `folders[].sortOrder`(기존) 사용 |
| 조회 실패 시 | `issueOrders = {}` 폴백(무회귀 — folders/folderIssues 와 동일 `safeFolderRows` 패턴) |
| 대응 프론트 | `unwrapGanttPayload` → `issueOrders` 추출, `useGanttData` passthrough, `toSvarTasks(filtered, { issueOrders, ... })` |

### 2-C. 기존 계약 무변경 (회귀 금지 경계)

`updateGanttSchedule` / `setGanttParent` / `setGanttLink` / `createGanttFolder` / `renameGanttFolder` / `moveGanttFolder` / `deleteGanttFolder` / `setGanttIssueFolder` — 시그니처·응답 shape 그대로.

---

## 3. 백엔드 설계

### 3-1. 신규 파일 / 수정 파일

| 파일 | 종류 | 내용 |
|------|------|------|
| `src/rdb/schema/ddl/ganttIssueOrder.sql.js` | 신규 | `CREATE_GANTT_ISSUE_ORDER_TABLE` DDL |
| `src/rdb/schema/ddl/index.js` | 수정 | export 추가 |
| `src/rdb/schema/migrate.js` | 수정 | `.enqueue('v009_create_gantt_issue_order_table', ...)` |
| `src/rdb/query/GanttIssueOrderQuery.js` | 신규 | 이슈 순서 SQL(UPSERT / SELECT / DELETE_BY_PROJECT) |
| `src/rdb/query/GanttFolderQuery.js` | 수정 | `UPDATE_FOLDER_SORT_ORDER` 1개 추가 |
| `src/resolver/gantt/GanttOrderRepository.js` | 신규 | 이슈 순서 repo 래퍼 + 폴더 sort_order UPDATE 래퍼 |
| `src/resolver/gantt/GanttOrderService.js` | 신규 | `reorderGanttNodes` 오케스트레이션(nodeType 분기, 순차 멱등) |
| `src/resolver/gantt/GanttService.js` | 수정 | read 에 `gantt_issue_order` 병렬 페치 + `issueOrders` 조립 |
| `src/resolver/gantt/GanttController.js` | 수정 | `resolver.define('reorderGanttNodes', ...)` 등록 |
| `src/resolver/project/ProjectService.js` | 수정 | cascade 에 `deleteGanttIssueOrdersByProjectRepository` 추가 |

> `src/index.js` 는 `registerGanttController(resolver)` 가 이미 등록됨 → **추가 등록 불필요**. Controller 내부에 define 만 추가.

### 3-2. `reorderGanttNodes` Service 로직 (`GanttOrderService.js`)

```
reorderGanttNodes({ projectId, orders }):
  1. projectId·orders(비배열/빈배열) 검증 → 실패 시 LogicalError(GANTT_REORDER_INVALID)
  2. orders 각 항목 검증: nodeId 존재, nodeType ∈ {'issue','folder'}, sortOrder 정수
  3. nodeType 별 분기(순차 멱등 — TiDB 트랜잭션 없음):
       - 'folder' : updateFolderSortOrderRepository([sortOrder, folderId(nodeId), projectId]) 반복
       - 'issue'  : upsertIssueOrderRepository([issueKey(nodeId), projectId, sortOrder, sortOrder]) 반복
     (프로젝트 스코프 WHERE 로 타 프로젝트 오염 방어. 폴더는 존재 확인 생략—UPDATE 는 미존재 시 0행=무해)
  4. return { content: { orders } }  // 입력 echo
```

- **성능**: 밴드당 수십 건 · 경량 UPSERT/UPDATE → N+1/메모리 무관. 공통 페치 경로 미수정(요구 원칙 준수).
- **멱등**: 동일 orders 재실행 시 결과 동일(재시도 안전).

### 3-3. read 확장 (`GanttService.getProjectGanttData`)

기존 `Promise.all([issues, folderRows, folderIssueRows])` 에 **4번째 병렬 페처** 추가:

```js
const [issues, folderRows, folderIssueRows, issueOrderRows] = await Promise.all([
    getProjectGanttIssues(...),
    safeFolderRows(() => findFoldersByProjectRepository([projectId])),
    safeFolderRows(() => findFolderIssuesByProjectRepository([projectId])),
    safeFolderRows(() => findIssueOrdersByProjectRepository([projectId])),   // ★ 신규
]);
// ...
const issueOrders = issueOrderRows.reduce((acc, r) => {
    if (r?.issue_key != null && r?.sortOrder != null) acc[r.issue_key] = r.sortOrder;
    return acc;
}, {});
// content 에 issueOrders 추가(additive)
```

`safeFolderRows`(실패 → `[]`) 재사용 → 미마이그레이션/조회 실패해도 무회귀.

### 3-4. 에러 케이스 (`src/utils/errors/ErrorCodes.js`)

| 상황 | 코드 | 프론트 토스트 |
|------|------|--------------|
| orders 누락/빈배열/nodeType 오류/projectId 없음 | `GANTT_REORDER_INVALID` (신규 추가) | `gantt.error.reorderFailed` |
| 기타 SQL 실패 | 기존 `SqlError` 경유 | `gantt.error.reorderFailed`(default) |

---

## 4. DB 설계

### 4-1. 신규 테이블 `gantt_issue_order` (`ddl/ganttIssueOrder.sql.js`)

```sql
CREATE TABLE IF NOT EXISTS gantt_issue_order (
    issue_key    VARCHAR(50),
    project_id   BINARY(16)   NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_key),          -- 이슈당 순서 1행(gantt_folder_issue 선례와 동일)
    INDEX (project_id)
);
```

- **parent 컬럼 없음**: sort_order 는 어댑터가 **그룹 내에서만 상대 비교**하므로 그룹 스코프 저장 불필요. 이슈가 그룹 이동(WBS/폴더 변경) 시 기존 sort_order 유지 → 새 그룹에서 임의 위치를 갖다가 다음 reorder 로 정규화(허용 한계, §6 명시).
- TiDB 제약(FK 미강제·CASCADE 무효·트랜잭션 없음) → FK 선언 생략, 무결성 앱레벨(gantt_folder 선례 동일).

### 4-2. 마이그레이션 (`migrate.js`) — v008 다음

```js
.enqueue('v009_create_gantt_issue_order_table', CREATE_GANTT_ISSUE_ORDER_TABLE)
```

### 4-3. `GanttIssueOrderQuery.js` (SQL 상수)

```js
export const GanttIssueOrderQuery = {
  // params: [projectId]
  FIND_ISSUE_ORDERS_BY_PROJECT: `
    SELECT issue_key, sort_order AS sortOrder
    FROM gantt_issue_order WHERE project_id = UUID_TO_BIN(?)`,
  // params: [issueKey, projectId, sortOrder, sortOrder]
  UPSERT_ISSUE_ORDER: `
    INSERT INTO gantt_issue_order (issue_key, project_id, sort_order)
    VALUES (?, UUID_TO_BIN(?), ?)
    ON DUPLICATE KEY UPDATE sort_order = ?`,
  // params: [projectId] — 프로젝트 삭제 cascade
  DELETE_ISSUE_ORDERS_BY_PROJECT: `
    DELETE FROM gantt_issue_order WHERE project_id = UUID_TO_BIN(?)`,
};
```

### 4-4. `GanttFolderQuery.js` 추가 상수

```js
// params: [sortOrder, folderId, projectId]
UPDATE_FOLDER_SORT_ORDER: `
  UPDATE gantt_folder SET sort_order = ?
  WHERE folder_id = UUID_TO_BIN(?) AND project_id = UUID_TO_BIN(?)`,
```

---

## 5. 프론트엔드 설계

### 5-1. `ganttAdapter.js` (정렬 적용 — 결정 5)

`unwrapGanttPayload`: `issueOrders` 추출 추가(folders/folderIssues 패턴 동일, 기본값 `{}`).

`toSvarTasks(tasks, options)`:
1. `const issueOrders = options.issueOrders && typeof ... ? ... : {};`
2. issueNodes 생성 후 **안정 정렬**:
   ```js
   const rank = (n) => (issueOrders[n.key] ?? Number.MAX_SAFE_INTEGER);
   // JS 정렬 안정성: 미지정(동일 rank)은 fetch 순 유지
   const orderedIssueNodes = issueNodes
       .map((n, i) => [n, i])
       .sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[1] - b[1]))
       .map(([n]) => n);
   ```
   (그룹 간 rank 교차는 SVAR가 형제만 비교하므로 무해; 그룹 내에서는 issueOrders 순 정확.)
3. **concat 순서 변경**: `return folderNodes.concat(orderedIssueNodes);`
   - 전역 concat 하나로 **모든 부모에서 폴더 자식 → 이슈 자식** 순서 보장(폴더-우선 밴드).
   - ⚠️ 회귀 주의: 현재는 `issueNodes.concat(folderNodes)`(이슈 우선). 순서 역전은 의도된 정책 변경. 롤업/오버레이/필터는 배열 순서 비의존 → 안전(검증 대상).
4. `synthesizeFolderNodes` 는 무변경(이미 sortOrder 정렬). folders 없을 때 early-return 도 `orderedIssueNodes` 반환하도록 수정.

### 5-2. `useGanttData.js`

`unwrapGanttPayload` 결과의 `issueOrders` 를 반환 목록에 추가(passthrough). `GanttPage` 가 구조분해로 수신.

### 5-3. `GanttPage.jsx`

- `const { ..., folders, folderIssues, issueOrders } = useGanttData(project_id);`
- `toSvarTasks(filtered, { ..., folders, folderIssues, issueOrders, hourRate })`
- `const reorderNodes = useReorderNodes({ projectId: project_id, toast });`
- 핸들러:
  ```js
  const handleReorder = ({ orders }) => {
      if (!canWrite) return;
      reorderNodes.mutate({ orders });
  };
  ```
- `<GanttChart ... onReorder={handleReorder} />`

### 5-4. `useGanttFolderMutations.js` — `useReorderNodes` 추가

기존 `invokeFolder` 래퍼 재사용. 캐시 패치는 **`content.folders[].sortOrder`(폴더) + `content.issueOrders`(이슈)** 를 서버 echo 로 갱신(전체 invalidate 금지 — 폴더 mutation 동일 철학).

```
useReorderNodes({ projectId, toast }):
  mutationFn: ({ orders }) => invokeFolder('reorderGanttNodes', { projectId, orders })
  onMutate (선택·권장): 드래그 즉시성 위해 orders 로 캐시 낙관 패치 + prev 스냅샷
  onSuccess: 서버 echo orders 로 캐시 패치
      - folder 항목 → content.folders 의 해당 id sortOrder 교체
      - issue  항목 → content.issueOrders[issueKey] = sortOrder
    성공 토스트 gantt.toast.orderSaved
  onError: prev 롤백(낙관 시) + mapFolderError → gantt.error.reorderFailed
```

> 낙관 패치는 폴더 이동과 달리 **드래그 피드백 즉시성**이 중요(SVAR move-task `return false` 로 로컬 이동 차단 → 서버 응답 전까지 행이 안 움직임). onMutate 낙관을 권장하되, 폴더 패턴과의 일관성상 미도입해도 무방(체감 지연 수백 ms).

### 5-5. `GanttChart.jsx` — move-task intercept 분기 (결정 6)

기존 `api.intercept('move-task', ...)` 를 다음으로 교체:

```
onConfirm(payload, inProgress!==true, editable):
  id, mode, target = payload
  draggedIsFolder = isFolderId(id);  targetIsFolder = isFolderId(target)

  // (1) child 모드(폴더로 넣기 등) → 기존 정책: 폴더 관여면 skip, 이슈면 기존 reparent
  if (mode === 'child'):
      if (draggedIsFolder || targetIsFolder) return false;   // 폴더 소속은 모달 경로
      → 기존 setParent(newParent=target) 경로 유지

  // (2) before|after
  if (mode === 'before' || 'after'):
      targetTask = api.getTask(target);  if (!targetTask) return false;  // W-2 가드 유지
      draggedTask = api.getTask(id);
      tp = normalize(targetTask.parent);  dp = normalize(draggedTask.parent);

      // (2a) 동일 부모 → REORDER (신규)
      if (tp === dp):
          // 동일 타입만 재정렬(혼합 밴드 교차 금지)
          if (draggedIsFolder !== targetIsFolder) return false;   // 이슈↔폴더 혼합 skip
          nodeType = draggedIsFolder ? 'folder' : 'issue';
          orders = computeReorder(api, parent=tp, nodeType, id, target, mode);
          onReorderRef.current?.({ orders });
          return false;

      // (2b) 부모 상이 → 기존 REPARENT (W-2)
      if (draggedIsFolder || targetIsFolder) return false;   // 폴더 관여 reparent 는 모달
      newParent = tp;  // = targetTask.parent
      if (newParent !== dp) onSetParentRef.current?.({ issueKey:id, parentKey:newParent });
      return false;

  return false; // up/down·기타 → skip(MVP)
```

**`computeReorder(api, parent, nodeType, draggedId, targetId, mode)`** (신규 헬퍼, GanttChart 내부 또는 ganttAdapter export):
- 현재 부모=parent 인 **동일 nodeType** 형제 노드 id 목록을 화면 표시 순서대로 수집.
  - `api.getState()` 의 tasks 를 순회해 `normalize(t.parent) === parent && isFolderId(t.id) === (nodeType==='folder')` 필터, 배열 순서 유지.
- draggedId 제거 → targetId **앞(before)/뒤(after)** 삽입 → 재배열 리스트.
- 각 원소를 `{ nodeId: plainId(nodeId), nodeType, sortOrder: index }` 로 매핑.
  - 폴더 nodeId 는 `folder:` 접두 제거(plain uuid) → 계약 §2-A.
- 반환 `orders` 배열.

`isFolderId` / `normalize`(0·undefined→null) 는 기존 GanttChart 헬퍼 재사용. `plainId`(folder: 접두 제거)는 소규모 신규.

**권한 게이트**: 기존과 동일 — intercept `editableRef.current===true` 1차, `GanttPage.handleReorder` `canWrite` 2차.

### 5-6. 권한 / 스토어

`usePermissionStore('PROJECT_GANTT')` 기존 게이트 재사용. Zustand 신규 스토어 **없음**. 쿼리키 팩토리 추가 **없음**(`ganttKeys.data` 재사용).

---

## 6. 정렬 적용 규칙 (형제 그룹 정의 · 폴백 · 혼합 정책)

- **형제 그룹(밴드) 정의**: SVAR `parent` 값이 동일한 노드 집합. parent ∈ { 이슈 id(WBS/jira 부모), `folder:<uuid>`(폴더 소속), `0`(루트) }.
- **밴드 분리(결정 5)**: 각 그룹 = [폴더 밴드(상단)] + [이슈 밴드(하단)]. 전역 `folderNodes.concat(orderedIssueNodes)` 로 모든 부모에서 폴더-우선 자동 달성.
- **폴더 밴드 정렬**: `folder.sortOrder` asc(기존 `synthesizeFolderNodes` 그대로).
- **이슈 밴드 정렬**: `issueOrders[issueKey]` asc → **미지정 이슈는 그 뒤에 fetch(백엔드 조회) 순**(안정 정렬로 보장). 요구서 "미정렬 노드 폴백" 충족.
- **혼합 그룹 표시 정책(결정 6 확정)**: 폴더가 항상 위, 이슈가 아래. 이슈-폴더 간 교차 배치는 불가(드래그도 skip). 폴더 소속/WBS 부모 지정은 기존 모달·부모지정 경로로만.
- **그룹 이동 후 순서**: 이슈가 WBS 부모/폴더 변경으로 다른 그룹에 편입되면 기존 sort_order 유지(새 그룹에서 상대 위치는 비결정적) → 다음 reorder 로 정규화. 폴더 삭제(승계)로 루트/상위로 이동한 이슈도 동일. **허용된 한계**(문서화).

---

## 7. 드래그 UX 매핑 (SVAR move-task → 의도)

| payload | 조건 | 의도 | 처리 |
|---------|------|------|------|
| `mode:'before'\|'after'` | targetParent == draggedParent, **동일 타입** | **reorder(신규)** | `computeReorder` → `onReorder({orders})` → `reorderGanttNodes` |
| `mode:'before'\|'after'` | targetParent == draggedParent, **혼합 타입** | 밴드 교차 금지 | skip(`return false`) |
| `mode:'before'\|'after'` | targetParent != draggedParent, 이슈만 | reparent(기존 W-2) | `onSetParent` |
| `mode:'before'\|'after'` | 부모 상이 + 폴더 관여 | 폴더 reparent 는 모달 | skip |
| `mode:'child'` | 이슈→이슈 | reparent(기존) | `onSetParent(target)` |
| `mode:'child'` | 폴더 관여 | 폴더 소속은 모달 | skip |
| `mode:'up'\|'down'` | 키보드 재정렬 | MVP 미지원 | skip |
| `inProgress === true` | 드래그 중 | — | 무반영(기존 가드) |
| `editableRef !== true` | 읽기전용 | — | skip(기존 가드) |

- **로컬 적용 차단 유지**: 모든 경로 `return false`(서버 확정 + 캐시 패치 후 트리 반영) — 기존 정책 그대로.
- **캐시 패치 전략**: reorder 성공 → `ganttKeys.data` 의 `folders[].sortOrder` / `issueOrders` 만 패치 → 어댑터 재합성(즉시). 전체 invalidate 금지(이슈 Jira search 과비용 회피 — 폴더 mutation 철학 계승). 낙관 패치 권장(드래그 즉시성).

---

## 8. 프로젝트 삭제 cascade

`ProjectService.deleteProjectService` cascade 순차 DELETE 에 1행 추가(멱등, 순서 무관 — issue_key/project 스코프):

```js
await deleteGanttFolderIssuesByProjectRepository(params);   // 기존 4
await deleteGanttIssueOrdersByProjectRepository(params);    // ★ 신규 4.5 (gantt_issue_order)
await deleteGanttFoldersByProjectRepository(params);        // 기존 5
```

Repository: `GanttOrderRepository.deleteGanttIssueOrdersByProjectRepository([projectId])` → `GanttIssueOrderQuery.DELETE_ISSUE_ORDERS_BY_PROJECT`.

---

## 9. i18n 키 목록 (`locales/kr/gantt.json` · `locales/en/gantt.json`)

| 경로 | kr | en |
|------|----|----|
| `toast.orderSaved` | `"순서가 변경되었습니다."` | `"Order updated."` |
| `error.reorderFailed` | `"순서 변경에 실패했습니다."` | `"Failed to update order."` |

- `mapFolderError` default 분기가 `error.reorderFailed`(또는 재사용 시 `error.saveFailed`)를 반환하도록 reorder 훅에서 매핑. 신규 코드 `GANTT_REORDER_INVALID` → `error.reorderFailed`.
- 추가 후 **`cd static/ui && npm run merge`** 실행(ko-KR.json/en-US.json 직접 수정 금지).

---

## 10. 구현 작업 분해

### Backend (먼저)
- [ ] `ddl/ganttIssueOrder.sql.js` 신규 + `ddl/index.js` export
- [ ] `migrate.js` v009 enqueue
- [ ] `GanttIssueOrderQuery.js`(UPSERT/SELECT/DELETE_BY_PROJECT) + `GanttFolderQuery.UPDATE_FOLDER_SORT_ORDER`
- [ ] `GanttOrderRepository.js`(issue upsert/select/deleteByProject + folder sortOrder update 래퍼)
- [ ] `GanttOrderService.reorderGanttNodes`(nodeType 분기·검증·echo)
- [ ] `GanttService.getProjectGanttData` — issueOrders 병렬 페치 + 조립(additive)
- [ ] `GanttController` — `reorderGanttNodes` define(등록 함수 추가 없음)
- [ ] `ProjectService` cascade 4.5 편입
- [ ] `ErrorCodes.GANTT_REORDER_INVALID` 추가
- [ ] jest: reorder 서비스(빈/혼합 nodeType/폴더·이슈 분기·멱등) 단위 테스트

### Frontend (백엔드 계약 확정 후)
- [ ] `ganttAdapter` — `unwrapGanttPayload.issueOrders` + `toSvarTasks` 안정정렬·`folderNodes.concat(orderedIssueNodes)` + (선택) `computeReorder` export
- [ ] `useGanttData` — issueOrders passthrough
- [ ] `useGanttFolderMutations.useReorderNodes`(캐시 패치 folders/issueOrders + 낙관·롤백)
- [ ] `GanttChart` move-task intercept 분기(reorder/reparent/skip) + `onReorder` prop + `computeReorder` 헬퍼
- [ ] `GanttPage` — issueOrders 수신·전달, `handleReorder` 배선
- [ ] i18n 2키 추가 + `npm run merge`
- [ ] 회귀 확인: 부모 변경(reparent) 경로·폴더 모달 경로·필터·오버레이·롤업 무변경

---

## 11. 회귀/함정 체크리스트 (GANTT.md §6 계승)

- concat 순서 역전(이슈우선→폴더우선): 롤업(`synthesizeFolderNodes`)은 concat 전 `issueNodes` 로 인덱스 구성 → **정렬/concat 변경 무영향**. 검증 필수.
- `open:true`는 자식 보유 노드에만(leaf `null.forEach` 크래시) — 정렬은 open 로직 미변경.
- move-task `before/after` W-2 가드(`api.getTask(target)` 실패 시 skip) 유지 — reorder 분기에도 targetTask null 이면 skip.
- 폴더 소속/WBS 부모 write 후 search 인덱스 지연(§6) — reorder 는 앱 DB 전용이라 무관(즉시 일관, 캐시 패치로 충분).
- 낙관 패치 rollback 스냅샷 필수(사이클 없는 단순 순서라 서버 거부는 드묾이나 SQL 실패 대비).
