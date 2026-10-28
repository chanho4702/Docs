# 간트 폴더 레이어 설계서 (2026-07-02)

> 단일 진실 원천. backend/frontend/verifier 는 이 문서(특히 §2 경계면 계약)를 기준으로 작업한다.
> 원칙: **기존 간트 기능(링크/WBS/placeholder/그리드 편집/마커) 무회귀 · additive**. 폴더는 **앱 DB 전용 가상 엔티티**(Jira write 0).

---

## 1. 개요 / 영향 범위

작업들을 묶는 **폴더 레이어**를 간트에 추가한다. 폴더는 Jira 이슈가 아닌 앱 전용 엔티티(Forge SQL)로, 하위(이슈+하위폴더) 기간을 감싸는 롤업 막대와 MD 가중 수행율을 가지며, 그리드 행/막대 색으로 일반 이슈·네이티브 summary 와 구별된다.

### projectId 의미(중요 전제)
`getProjectGanttData` 등 모든 간트 resolver 의 `projectId` = **앱 project 테이블 PK(UUID string)**. 동시에 Jira 이슈 검색 JQL(`moves_RMS_projectId="${projectId}"`)의 값이기도 하다. 폴더 테이블의 `project_id` = **동일 UUID**.

### 백엔드
- 신규 도메인 파일(간트 도메인 하위): `src/resolver/gantt/GanttFolderService.js`, `GanttFolderRepository.js`, `GanttFolderValidationService.js`(순수함수·jest).
- 신규 resolver 5종 + 기존 `getProjectGanttData` 확장(additive).
  - 신규: `createGanttFolder` / `renameGanttFolder` / `deleteGanttFolder` / `moveGanttFolder` / `setGanttIssueFolder`
  - 확장: `getProjectGanttData` → `content` 에 `folders`, `folderIssues` 2개 키 **추가**(tasks/links/meta 무변경).
- 등록: 기존 `registerGanttController(resolver)`(`GanttController.js`)에 5종 추가. (신규 컨트롤러 파일 불필요 — 간트 도메인 응집.)
- 에러코드 추가: `GANTT_FOLDER_NAME_REQUIRED`, `GANTT_FOLDER_NOT_FOUND`, `GANTT_FOLDER_CYCLE_DETECTED`.

### 프론트
- 신규 훅 파일: `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js`(5 훅).
- 신규 모달: `GanttFolderNameModal.jsx`(생성/이름변경 공용), `GanttFolderAssignModal.jsx`(이슈→폴더 소속 지정), `GanttFolderMoveModal.jsx`(폴더 중첩 이동).
- 수정: `ganttAdapter.js`(폴더 노드 합성 + 롤업/수행율 계산), `useGanttData.js`(folders/folderIssues 노출), `GanttPage.jsx`(폴더 배선), `GanttChart.jsx`(폴더 행/막대 DOM 클래스 + 편집 가드), `GanttToolbar.jsx`("폴더 추가" 버튼), `gantt.css`(폴더 색), `unwrapGanttPayload`(folders/folderIssues 추출).
- 쿼리키 **신규 불필요**: 폴더는 `getProjectGanttData` 동일 페이로드로 오므로 `ganttKeys.data(projectId)` 재사용.

### DB (Forge SQL / MySQL)
- 신규 테이블 2개: `gantt_folder`(중첩 폴더), `gantt_folder_issue`(이슈↔폴더 매핑, 이슈당 1폴더).
- 마이그레이션 파일 신규 + `migrate.js` enqueue(v007/v008). 프로젝트 삭제 cascade 편입.

### i18n
- `locales/kr/gantt.json` · `locales/en/gantt.json` 에 `folder.*` + `toast.folder*` + `error.folder*` 키 추가 → `npm run merge`.

---

## 2. 경계면 계약 (핵심)

모든 resolver 는 `responseWrapper` 로 감싼다 → 프론트 수신은 `{ success, content|error }`. 아래 "응답 shape" 은 **content 내부**를 가리킨다.

### 2-A. 신규 폴더 CRUD / 소속 / 이동

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시 `content`) | 대응 프론트 훅 / 무효화 |
|--------------|-------------|----------------------------------|----------------------|
| `createGanttFolder` | `{ projectId, name, parentFolderId }` (parentFolderId=null → 루트) | `{ folder: { id, name, parentFolderId, sortOrder } }` | `useCreateFolder` → `invalidate(ganttKeys.data(projectId))` |
| `renameGanttFolder` | `{ projectId, folderId, name }` | `{ folderId, name }` | `useRenameFolder` → invalidate |
| `deleteGanttFolder` | `{ projectId, folderId }` | `{ folderId, reparentedTo, movedIssueKeys:[key], movedFolderIds:[id] }` (내용물 승계 결과) | `useDeleteFolder` → invalidate |
| `moveGanttFolder` | `{ projectId, folderId, parentFolderId }` (null → 루트) | `{ folderId, parentFolderId }` | `useMoveFolder` → invalidate |
| `setGanttIssueFolder` | `{ projectId, issueKey, folderId }` (folderId=null → 폴더에서 빼기) | `{ issueKey, folderId }` | `useSetIssueFolder` → invalidate |

- 폴더는 Jira write 0 → **search 인덱스 지연 무관** → 위 5종은 전부 `onSuccess`/`onSettled` 에서 **일반 `invalidateQueries(ganttKeys.data(projectId))`** 허용(setGanttParent 의 캐시 부분패치 회피 패턴을 따르지 않아도 됨).
- `id`, `folderId`, `parentFolderId` = **plain UUID string**(BIN_TO_UUID 결과). 프론트 SVAR id 는 어댑터에서 `folder:${id}` 로 네임스페이스.
- 검증 위반: `GANTT_FOLDER_CYCLE_DETECTED`(중첩 순환/self), `GANTT_FOLDER_NAME_REQUIRED`(빈 이름), `GANTT_FOLDER_NOT_FOUND`(대상 없음/타 프로젝트) → `LogicalError` throw → `{ success:false, error:{ code } }`.

### 2-B. `getProjectGanttData` 확장 (additive — tasks/links/meta 불변)

입력: `{ projectId, coworkerFieldId }` (**무변경**).

응답 `content` (기존 + 신규 2키):
```
{
  tasks: [Task],           // ← 무변경 (Task shape 그대로)
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
- **Task 객체엔 필드 추가하지 않는다.** 소속은 별도 `folderIssues` 맵으로 전달 → Task shape 완전 동결(기존 어댑터/훅 무영향).
- 어댑터가 `folderIssues[issueKey]` 로 각 이슈의 폴더 소속을 조회.

### 2-C. 프론트 수신 계약(어댑터 격리)

`unwrapGanttPayload(result)` 반환에 `folders`(배열), `folderIssues`(객체) 추가. `useGanttData` 가 `{ tasks, links, meta, folders, folderIssues, ... }` 로 노출. `GanttPage` 가 `toSvarTasks(filtered, { placeholderStart, folders, folderIssues })` 로 어댑터에 주입.

---

## 3. 백엔드 설계

### 3-1. 계층 분해
```
GanttController (resolver.define 5종 추가)
  → GanttFolderService (오케스트레이션 + 검증 호출)
      → GanttFolderRepository (executeQuery + GanttFolderQuery)
      → GanttFolderValidationService (detectFolderCycle 등 순수함수, jest)
```
- `getProjectGanttData` 확장은 `GanttService.getProjectGanttData` 내부에서 **폴더 조회 1회 병렬 추가**:
  ```
  const [issues, folderRows, folderIssueRows] = await Promise.all([
      getProjectGanttIssues(...),           // 기존
      findFoldersByProjectRepository([projectId]),      // 신규 (경량 SELECT)
      findFolderIssuesByProjectRepository([projectId]), // 신규 (경량 SELECT)
  ]);
  ```
  기존 이슈 페처(전용 병렬 페처)는 **미수정**. 폴더 SELECT 2건은 소량(프로젝트 스코프)이라 N+1/메모리 부담 없음.
- `folders` = folderRows 를 `{ id, name, parentFolderId, sortOrder }` 로 매핑(정렬: parentFolderId, sortOrder). `folderIssues` = folderIssueRows 를 `{ [issue_key]: folder_id }` 로 reduce.

### 3-2. GanttFolderService 함수 명세

- `createGanttFolder({ projectId, name, parentFolderId })`
  - `name` trim 후 빈값 → `GANTT_FOLDER_NAME_REQUIRED`.
  - parentFolderId 지정 시 동일 프로젝트 존재 확인(없으면 `GANTT_FOLDER_NOT_FOUND`).
  - `sortOrder` = 해당 parent 하 max(sort_order)+1 (없으면 0).
  - INSERT(`UUID_TO_BIN(UUID())` PK) → 생성 folder 반환.
- `renameGanttFolder` : 이름 검증 + 존재 확인 → UPDATE name.
- `moveGanttFolder({ projectId, folderId, parentFolderId })`
  - self(folderId===parentFolderId) 또는 parentFolderId 가 folderId 의 **자손**이면 `GANTT_FOLDER_CYCLE_DETECTED`.
  - 검증: 프로젝트 전체 folder 목록 1회 조회 → `detectFolderCycle({ folders, folderId, parentFolderId })`(순수함수) → UPDATE parent_folder_id.
- `deleteGanttFolder({ projectId, folderId })` — **내용물 승계**(이슈 절대 삭제 금지). TiDB 트랜잭션 미지원 → 순차 멱등:
  1. 대상 folder 조회 → `reparentedTo = 대상.parent_folder_id`(없으면 null=루트).
  2. `UPDATE gantt_folder_issue SET folder_id = ?(reparentedTo, null허용) WHERE folder_id = ?(folderId) AND project_id = ?` → movedIssueKeys.
  3. `UPDATE gantt_folder SET parent_folder_id = ?(reparentedTo) WHERE parent_folder_id = ?(folderId) AND project_id = ?` → movedFolderIds.
  4. `DELETE FROM gantt_folder WHERE folder_id = ? AND project_id = ?`.
  - reparentedTo=null(루트 승계) 케이스: `folder_id`/`parent_folder_id` 를 NULL 로 세팅 → 매핑행이 없는 것과 동일(루트 이슈)이 아니라 **NULL folder_id 는 "소속 없음"** 이므로, 루트 승계 시엔 매핑행을 **DELETE** 하는 편이 깔끔(이슈=폴더 미소속=루트). 하위폴더는 parent_folder_id=NULL(루트 폴더).
    - 확정 규칙: reparentedTo=null → `gantt_folder_issue` 는 **DELETE**(소속 해제), `gantt_folder.parent_folder_id` 는 **NULL**. reparentedTo≠null → 둘 다 **UPDATE** 로 상위 폴더에 재소속.
- `setGanttIssueFolder({ projectId, issueKey, folderId })`
  - folderId=null → `DELETE FROM gantt_folder_issue WHERE issue_key=? AND project_id=?` (폴더에서 빼기).
  - folderId≠null → 존재 확인 후 **UPSERT**(이슈당 1폴더: `INSERT ... ON DUPLICATE KEY UPDATE folder_id=?`). issue_key 가 PK 라 자동 1:1.
  - 이슈가 페치집합/프로젝트 소속인지의 강검증은 생략 가능(폴더는 앱DB 로컬 — 잘못된 key 는 어댑터에서 무시됨). 단 folderId 프로젝트 검증은 수행.

### 3-3. GanttFolderRepository (executeQuery + GanttFolderQuery)
`src/rdb/query/GanttFolderQuery.js` 에 SQL 상수 정의(ProjectDashboard 패턴). BINARY(16) ↔ UUID 변환은 `UUID_TO_BIN(?)` / `BIN_TO_UUID(col)` 사용. 예:
```
FIND_FOLDERS_BY_PROJECT:
  SELECT BIN_TO_UUID(folder_id) AS id, name,
         BIN_TO_UUID(parent_folder_id) AS parentFolderId, sort_order AS sortOrder
  FROM gantt_folder WHERE project_id = UUID_TO_BIN(?) ORDER BY sort_order
FIND_FOLDER_ISSUES_BY_PROJECT:
  SELECT issue_key, BIN_TO_UUID(folder_id) AS folderId
  FROM gantt_folder_issue WHERE project_id = UUID_TO_BIN(?)
INSERT_FOLDER / UPDATE_NAME / UPDATE_PARENT / DELETE_FOLDER
UPSERT_ISSUE_FOLDER / DELETE_ISSUE_FOLDER
REPARENT_ISSUES_TO / DELETE_ISSUES_OF_FOLDER / REPARENT_FOLDERS_TO
DELETE_FOLDERS_BY_PROJECT / DELETE_FOLDER_ISSUES_BY_PROJECT  (cascade용)
```
Repository 함수는 `deleteProjectUsersByProjectRepository` 처럼 `executeQuery(GanttFolderQuery.X, params)` 얇은 래퍼.

### 3-4. 검증(GanttFolderValidationService, jest 대상)
- `detectFolderCycle({ folders, folderId, parentFolderId })` — parentFolderId 로 부모 체인을 타고 올라가며 folderId 를 만나면(또는 self) `LogicalError(GANTT_FOLDER_CYCLE_DETECTED)`. `folders` = `[{ id, parentFolderId }]`.
- 이슈↔폴더는 폴더가 이슈를 부모로 참조하지 않으므로 사이클 불가(검증 불요).

### 3-5. 에러 케이스 (ErrorCodes 추가)
```
GANTT_FOLDER_NAME_REQUIRED: 'GANTT_FOLDER_NAME_REQUIRED',
GANTT_FOLDER_NOT_FOUND:     'GANTT_FOLDER_NOT_FOUND',
GANTT_FOLDER_CYCLE_DETECTED:'GANTT_FOLDER_CYCLE_DETECTED',
```

### 3-6. src/index.js 등록
신규 컨트롤러 없음. `GanttController.registerGanttController` 내부에 5개 `resolver.define` 추가(§2-A). `index.js` 변경 불요(이미 `registerGanttController(resolver)` 등록됨).

---

## 4. 프론트엔드 설계

### 4-1. 데이터 흐름
```
useGanttData → { tasks, links, meta, folders, folderIssues }
  → GanttPage: 필터 적용(이슈만) → toSvarTasks(filteredTasks, { placeholderStart, folders, folderIssues, hourRate })
      → svarTasks(이슈 노드 + 폴더 노드 합성)  → GanttChart
```

### 4-2. 어댑터(§3 상세 별도) 주입 옵션
`toSvarTasks(tasks, { placeholderStart, folders, folderIssues, hourRate })`. hourRate 는 MD 환산(초→MD)에 필요 → GanttPage 가 settingData.hourRate 전달.

### 4-3. GanttChart 배선
- **폴더 행/막대 DOM 클래스 부착**: 기존 placeholder MutationObserver 이펙트와 동일 패턴 확장.
  - 막대: `.wx-bar[data-task-id]` 의 디코드 id 가 `folder:` 접두면 `gantt-folder-bar` 클래스 토글.
  - 그리드 행: 그리드 행은 `data-id`(툴팁 주석 참조). `.wx-grid .wx-body .wx-row[data-id]` 를 순회, 디코드 id `folder:` 접두면 `gantt-folder-row` 클래스 토글. (SVAR setID 의 `:` 접두 디코드 동일 적용.)
- **편집 가드(무회귀 핵심)**: 폴더 노드는 Jira write 대상이 아니므로 아래 이벤트에서 folder id 스킵:
  - `update-task`(막대 드래그) → id.startsWith('folder:') 이면 return(write-back 안 함). 폴더 막대는 어댑터 롤업값이라 사용자 드래그는 무시.
  - `move-task` → id 또는 target 이 folder 이면: 이슈를 폴더로 드래그 = 소속 변경으로 해석할 수도 있으나 **MVP 는 드래그 배선 제외**(명시적 모달 경로만) → folder 관여 시 스킵.
  - `add-link`/`delete-link` → source/target 이 folder 이면 스킵.
  - 인라인 편집 셀(담당자/협업자/시작/기간/계획MD): 폴더 행이면 렌더에서 '-' 또는 집계 표시, 편집 UI 미노출.
- **막대 드래그 잠금**: 폴더 막대 드래그를 SVAR 레벨에서도 막으려면 어댑터가 폴더 노드에 SVAR 편집 비활성 힌트를 줄 수 없으므로(무료빌드 per-task 제약), update-task 가드로 충분(로컬 렌더는 되돌지 않지만 write 안 됨 → 다음 invalidate 로 롤업값 복원). 필요 시 folder 막대에 `pointer-events` 제한 CSS 병행.

### 4-4. 그리드 컬럼의 폴더 행 표시 정책
| 컬럼 | 폴더 행 표시 |
|------|------------|
| 이슈(text) | 폴더 아이콘 + 폴더명 (트리 토글 ▾ 유지). `row.folder===true` 분기 |
| 상태 | `-` |
| 담당자/협업자 | `-` (편집 불가) |
| 시작일/기간 | 롤업 표시(선택): 시작=min, 기간=롤업 일수. 편집 불가 |
| 계획 작업량(MD) | 하위 leaf plannedMD **합계**(읽기전용) |
| 처리율 | **폴더 수행율**(MD 가중, §5) — progress 컬럼 + 막대 progress 채움 |
| 상위 지정(setParent) | 폴더 행은 이 셀 자리에 **폴더 액션**(이름변경/삭제/하위폴더추가/이동) 버튼 노출 |

각 셀 컴포넌트(`GanttGridEditCells`)에 `if (row.folder) return <FolderCellVariant/>` 분기 추가. IssueCell/StatusCell 도 `row.folder` 분기.

### 4-5. 폴더 CRUD 진입점
- **툴바 "폴더 추가"**(GanttToolbar, canWrite 시): 클릭 → `GanttFolderNameModal`(name 입력) → `useCreateFolder.mutate({ name, parentFolderId:null })`(루트 폴더).
- **폴더 행 액션**(setParent 컬럼 위치, canWrite): 이름변경(NameModal 재사용, 초기값=현재명) / 하위폴더추가(NameModal, parentFolderId=현재폴더) / 이동(`GanttFolderMoveModal` — 다른 폴더 Select, self·자손 제외) / 삭제(confirm → `useDeleteFolder`).
- **이슈 폴더 소속 지정 UI** — 결정: **별도 모달 `GanttFolderAssignModal`**(GanttParentModal 에 폴더를 섞지 않음).
  - 진입: 이슈 행에 "폴더 지정" 액션(setParent 컬럼과 별개의 작은 버튼, 또는 폴더 컬럼 추가). MVP 는 setParent 컬럼 근처 아이콘 버튼 권장.
  - 모달: 폴더 Select(옵션=현 프로젝트 folders, 계층 들여쓰기 라벨) + "폴더 없음(루트)" sentinel → `useSetIssueFolder.mutate({ issueKey, folderId })`.
  - **근거**: (1) GanttParentModal 은 WBS **이슈-부모**(Jira 앱필드 write, effectiveParent)를 다루고, 폴더 소속은 **앱DB 전용**으로 write 경로·무효화 정책·인덱스 지연 특성이 전혀 다르다. 한 Select 에 이슈와 폴더를 섞으면 submit 분기가 두 resolver 로 갈라져 복잡·오용 위험. (2) 기존 UX 관례(담당자/협업자/일정/상위 각각 전용 모달)와 일관. (3) 이슈-부모와 폴더-소속은 어댑터에서 우선순위로 공존(§5-어댑터)하므로 개념 분리가 자연스럽다.
  - 이슈가 현재 이슈-부모(effectiveParent)를 가지면 폴더 지정이 시각적으로 무효임을 모달에 안내(`gantt.folder.hasParentHint`) — 어댑터 우선순위(이슈-부모 > 폴더) 때문.

### 4-6. Zustand / 쿼리키 / 권한
- Zustand 스토어 **변경 없음**.
- 쿼리키 **신규 없음**(`ganttKeys.data(projectId)` 재사용). 폴더 mutation 은 모두 이 키 invalidate.
- 권한: 폴더 CRUD/소속/이동 진입점 전부 `canWrite('PROJECT_GANTT')` 게이트(기존 editable prop 재사용). 읽기(폴더 표시)는 canRead 로 이미 게이트됨.

### 4-7. useGanttFolderMutations.js (5 훅)
- 공통: `mutationFn` = `invoke('...')` → `result.success!==true` 시 `err.cause=result.error` throw. `onSuccess` = 성공 토스트 + `queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) })`. `onError` = `mapFolderError(t, err.cause?.code)` 토스트.
- 낙관 업데이트 불요(폴더는 인덱스 지연 무관 + 즉시 invalidate 가벼움). 필요 시 후속 최적화.
- `mapFolderError`: `GANTT_FOLDER_CYCLE_DETECTED→gantt.error.folderCycle`, `GANTT_FOLDER_NAME_REQUIRED→gantt.error.folderNameRequired`, `GANTT_FOLDER_NOT_FOUND→gantt.error.folderNotFound`, default→`gantt.error.folderSaveFailed`.

---

## 5. 폴더 노드 합성 규칙 (어댑터 `toSvarTasks` 확장)

### 5-1. 노드 합성 순서
입력: 필터된 `tasks`(이슈), `folders`(배열), `folderIssues`(맵).

1. **이슈 노드**: 기존 로직 유지(effectiveParent → SVAR parent). 단 **부모 결정에 폴더 폴백 추가**:
   - `parent` 우선순위: **이슈-부모(effectiveParent, 집합 내) > 폴더-소속(folderIssues[key], `folder:<id>`) > 루트(0)**.
   - 즉 effectiveParent 가 없고(루트 이슈) `folderIssues[key]` 가 있으면 `parent = 'folder:'+folderId`.
   - effectiveParent 가 있으면 폴더 소속은 무시(문서화된 한계 — 서브트리 루트만 폴더에 담김).
2. **폴더 노드**: `folders` 각각을 SVAR task 로 합성:
   ```
   { id:'folder:'+id, text:name, type:'summary', folder:true,
     parent: parentFolderId ? 'folder:'+parentFolderId : 0,
     start, duration,        // ← 어댑터 롤업(아래)
     progress,               // ← MD 가중 수행율(§6, 0~100)
     open: hasVisibleChildren ? true : undefined }
   ```
3. **가시성/빈 폴더 처리(SVAR 크래시 함정 준수)**:
   - 필터 후 **가시 자손(이슈+하위폴더)이 0개인 폴더는 노드에서 제외**(렌더 안 함). → 담당자/상태 필터로 내용물이 비면 폴더 자동 소멸(이슈 필터링 행동과 일관, 화면 정돈).
   - 가시 자손 ≥1 인 폴더만 `open:true` 부여(leaf 에 open → `null.forEach` 크래시 방지, 기존 규칙 준수).
   - 빈 폴더 제외는 **하위→상위 재귀**로 판정(하위폴더가 전부 비면 그 상위도 가시자손 0 이면 제외).

### 5-2. SVAR type 선택 (제3 시각 유형 구현)
- 폴더 노드 `type='summary'` 로 두되 **색은 DOM 클래스로 강제 오버라이드**(§4-3): 네이티브 하위이슈 부모(초록 summary)와 다른 **보라/인디고 계열**(`gantt-folder-bar`/`gantt-folder-row`). 근거: SVAR 무료빌드는 per-task css 미지원 → placeholder 와 동일한 `data-task-id` DOM 클래스 패턴 재사용이 검증된 유일 경로. 그리드 행 배경은 `rowStyle` prop 이 무료빌드에서 불확실하므로 **DOM 클래스(`.wx-row[data-id]` 접두 매칭)** 로 통일.
- `type='summary'` 를 쓰지만 **기간·수행율은 어댑터가 명시 주입**(start/duration/progress)하여 SVAR summary 자동 롤업/자동 progress 를 **우리 값으로 덮어쓴다**. (SVAR summary 는 start/duration 미지정 시에만 자식 롤업 → 우리는 항상 지정하므로 우리 값 사용.)

### 5-3. 기간 롤업 (어댑터 계산 — 택1 근거)
- **어댑터 계산 채택**(SVAR summary 롤업 미사용). 근거: (1) 수행율(progress)을 MD 가중으로 우리가 직접 계산해야 하므로 어차피 자손 순회가 필요 → 기간도 같은 순회에서 산출(1패스). (2) SVAR 자동 롤업은 progress 를 우리 값과 다르게 덮을 위험. (3) 필터로 일부 자손이 빠진 **가시 부분집합** 기준 롤업이 필요한데, 어댑터 계산이 이를 정확히 통제.
- 규칙: 폴더의 **가시 자손 이슈**(스케줄 있는 것만) 중 `start=min(start)`, `end=max(end)`, `duration=diffDays(start,end)`. 스케줄 있는 자손이 하나도 없으면 start 미지정(막대 없음, placeholder 도 아님 — 폴더는 placeholder 미부여).
- 자손 수집은 SVAR parent 관계(합성 후)로 재귀: `folder:<id>` 의 subtree = 직속 폴더-소속 이슈 + 그 이슈들의 WBS 서브트리 + 하위폴더 subtree.

---

## 6. 수행율 계산 명세

### 6-1. 정의
폴더 수행율 = **하위 leaf 이슈**의 MD 가중 평균 처리율:
```
folderProgress(%) = round( Σ(leaf.progressPct × weight_leaf) / Σ(weight_leaf) )
```

### 6-2. 소스 필드 (Task, 무변경 필드 재사용)
- `leaf.progressPct` = Task `progressPercent`(= Jira `aggregateprogress.percent`, 0~100). null → 0 으로 간주.
- `weight_leaf` = plannedMD(사람·일) = `originalEstimateSeconds / (hourRate × 3600)`. hourRate = settingData.hourRate(기본 8).

### 6-3. MD 없는 작업 폴백 (확정 규칙)
- `weight_leaf` = plannedMD 이되, **plannedMD ≤ 0 또는 null 인 leaf 는 weight = 1**(1 MD 등가) 부여.
- 결과: 폴더 내 **모든 leaf 가 MD 없음** → 전부 weight 1 → **단순 평균**(= "동일 가중치" 폴백, 확정결정 3 충족). 일부만 없음 → MD 보유분은 MD 가중, 미보유분은 1MD 로 참여(혼합 케이스 — 이 규칙이 확정결정 3의 "동일 가중치 폴백"에 대한 아키텍트 해석. 리더 이견 시 조정 가능하나 보수적·결정적 단일규칙).

### 6-4. leaf 정의 & 중첩 폴더 재귀
- **leaf = 자식이 없는 이슈 노드**(하위폴더/하위이슈를 가진 노드·폴더 노드는 leaf 아님). 폴더·중간 요약이슈는 가중합에서 **제외**(leaf 만 1회 집계 → 중복 방지).
- 중첩 폴더: 상위 폴더 progress = **자기 subtree 전체의 leaf** 집합에 대해 §6-1 을 **1회** 계산(하위 폴더 progress 를 다시 평균내지 않음). → "leaf 기준 1회 계산" 권장 준수.
- 가시 부분집합(필터 적용) 기준으로 계산(빈 폴더는 애초 제외).

### 6-5. 표시 위치
- 그리드 **처리율 컬럼**: `${folderProgress}%`(폴더 행).
- 폴더 **막대 progress 채움**: SVAR `progress`(0~100) = folderProgress.
- leaf 집합이 비면(가시 자손 이슈 0) 폴더는 §5-1 로 이미 제외되므로 progress 표시 대상 아님.

### 6-6. 계산 위치
어댑터 순수 함수 `computeFolderRollup(folderId, childrenIndex, taskById, hourRate)` 로 분리(jest 가능). `toSvarTasks` 가 폴더 노드 합성 시 호출. 성능: 프로젝트 단위 트리 1패스(메모이즈 childrenIndex) — Forge 256MB 무부담.

---

## 7. DB 설계

### 7-1. `gantt_folder` (중첩 폴더)
```sql
CREATE TABLE IF NOT EXISTS gantt_folder (
    folder_id         BINARY(16),
    project_id        BINARY(16) NOT NULL,
    name              VARCHAR(200) NOT NULL,
    parent_folder_id  BINARY(16) NULL,       -- 루트 폴더면 NULL (중첩)
    sort_order        INT NOT NULL DEFAULT 0,
    created_id        VARCHAR(100),
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_id        VARCHAR(100),
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (folder_id),
    INDEX (project_id),
    INDEX (project_id, parent_folder_id)
);
```

### 7-2. `gantt_folder_issue` (이슈↔폴더, 이슈당 최대 1폴더)
```sql
CREATE TABLE IF NOT EXISTS gantt_folder_issue (
    issue_key    VARCHAR(50),               -- Jira 이슈 key. 전역 유일 → PK 로 "이슈당 1폴더" 보장
    project_id   BINARY(16) NOT NULL,
    folder_id    BINARY(16) NOT NULL,
    created_id   VARCHAR(100),
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_key),                 -- ★ unique 제약 = 이슈당 1폴더
    INDEX (project_id),
    INDEX (folder_id)
);
```
- `PRIMARY KEY (issue_key)` 로 이슈당 1행 강제 → 소속 변경은 `INSERT ... ON DUPLICATE KEY UPDATE folder_id=?`(UPSERT).

### 7-3. TiDB(Forge SQL) 제약 반영 — 앱 레벨 무결성 규칙
- **FK 미강제·CASCADE 무효·트랜잭션 미지원**(RFC-150/[[project_forge_sql_no_fk_cascade]]) → 위 DDL 은 FK 선언 **생략**(다른 앱 테이블도 참고). 무결성은 **앱 코드**로:
  1. 폴더 삭제 = 순차 멱등 UPDATE/DELETE(§3-2 deleteGanttFolder).
  2. 폴더 중첩 순환 = `detectFolderCycle` 앱 검증.
  3. 이슈당 1폴더 = PK(issue_key) DB 제약 + UPSERT.
  4. 고아 매핑(존재 안 하는 이슈 key·삭제된 folder_id) 방어: 어댑터가 `folderIssues` 를 folders 존재분·tasks 존재분과 교차하여 **없는 참조는 무시**(dangling 방어 — links/effectiveParent 방어와 동일 사상).
  5. 타 프로젝트 참조 방어: 모든 쿼리 `WHERE project_id = UUID_TO_BIN(?)` 스코프.

### 7-4. 마이그레이션
- 신규 파일 `src/rdb/schema/ddl/ganttFolder.sql.js` → `CREATE_GANTT_FOLDER_TABLE`, `CREATE_GANTT_FOLDER_ISSUE_TABLE` export.
- `src/rdb/schema/ddl/index.js` 에 두 export 추가.
- `src/rdb/schema/migrate.js` `createInitialSchema` 체인에 append(기존 enqueue 뒤):
  ```
  .enqueue('v007_create_gantt_folder_table', CREATE_GANTT_FOLDER_TABLE)
  .enqueue('v008_create_gantt_folder_issue_table', CREATE_GANTT_FOLDER_ISSUE_TABLE)
  ```
- `runMigration` 는 manifest 에 이미 등록(추가 배선 불요).

### 7-5. 프로젝트 삭제 cascade 편입
- `ProjectRepository.js` 신규:
  ```
  export const deleteGanttFolderIssueByProjectRepository = p => executeQuery(GanttFolderQuery.DELETE_FOLDER_ISSUES_BY_PROJECT, p);
  export const deleteGanttFolderByProjectRepository = p => executeQuery(GanttFolderQuery.DELETE_FOLDERS_BY_PROJECT, p);
  ```
- `ProjectService.deleteProjectService` 순서(자식 먼저): projectusers → dashboard → snapshot → **folder_issue → folder** → project. (folder_issue 를 folder 보다 먼저 — 논리적 자식.)

---

## 8. i18n 키 목록 (additive)

`locales/kr/gantt.json` / `locales/en/gantt.json` 에 추가(기존 키 유지) → `cd static/ui && npm run merge`.

### kr/gantt.json 추가
```json
"folder": {
  "add": "폴더 추가",
  "title": "폴더",
  "name": "폴더 이름",
  "namePlaceholder": "폴더 이름 입력",
  "create": "폴더 생성",
  "rename": "이름 변경",
  "addChild": "하위 폴더 추가",
  "move": "폴더 이동",
  "moveTitle": "폴더 이동",
  "delete": "폴더 삭제",
  "deleteConfirm": "폴더를 삭제하면 내용물은 상위(또는 최상위)로 이동합니다. 이슈는 삭제되지 않습니다. 삭제할까요?",
  "assign": "폴더 지정",
  "assignTitle": "폴더 지정",
  "select": "폴더 선택",
  "none": "폴더 없음(최상위)",
  "hasParentHint": "상위 이슈가 지정된 이슈는 폴더로 이동하려면 먼저 상위 지정을 해제하세요.",
  "col": "폴더",
  "save": "저장",
  "cancel": "취소"
},
"toast": {
  "folderCreated": "폴더가 생성되었습니다.",
  "folderRenamed": "폴더 이름이 변경되었습니다.",
  "folderDeleted": "폴더가 삭제되었습니다.",
  "folderMoved": "폴더가 이동되었습니다.",
  "issueFolderSet": "폴더에 추가되었습니다.",
  "issueFolderCleared": "폴더에서 제외되었습니다."
},
"error": {
  "folderCycle": "폴더를 자신의 하위로 이동할 수 없습니다.",
  "folderNameRequired": "폴더 이름을 입력하세요.",
  "folderNotFound": "폴더를 찾을 수 없습니다.",
  "folderSaveFailed": "폴더 저장에 실패했습니다."
}
```
> `toast`·`error` 는 **기존 객체에 키 추가**(병합, 덮어쓰기 아님).

### en/gantt.json 추가
```json
"folder": {
  "add": "Add folder", "title": "Folder", "name": "Folder name",
  "namePlaceholder": "Enter folder name", "create": "Create folder",
  "rename": "Rename", "addChild": "Add subfolder", "move": "Move folder",
  "moveTitle": "Move folder", "delete": "Delete folder",
  "deleteConfirm": "Deleting a folder moves its contents to the parent (or root). Issues are not deleted. Delete?",
  "assign": "Assign folder", "assignTitle": "Assign folder", "select": "Select folder",
  "none": "No folder (root)",
  "hasParentHint": "Issues with a parent issue must be detached before moving to a folder.",
  "col": "Folder", "save": "Save", "cancel": "Cancel"
},
"toast": {
  "folderCreated": "Folder created.", "folderRenamed": "Folder renamed.",
  "folderDeleted": "Folder deleted.", "folderMoved": "Folder moved.",
  "issueFolderSet": "Added to folder.", "issueFolderCleared": "Removed from folder."
},
"error": {
  "folderCycle": "A folder cannot be moved under itself.",
  "folderNameRequired": "Enter a folder name.",
  "folderNotFound": "Folder not found.",
  "folderSaveFailed": "Failed to save folder."
}
```

---

## 9. 구현 작업 분해

### Backend (먼저)
- [ ] DDL: `src/rdb/schema/ddl/ganttFolder.sql.js`(2 테이블) + `ddl/index.js` export + `migrate.js` v007/v008 enqueue.
- [ ] `src/rdb/query/GanttFolderQuery.js` (SELECT/INSERT/UPDATE/UPSERT/DELETE + cascade + reparent).
- [ ] `src/resolver/gantt/GanttFolderRepository.js` (executeQuery 래퍼들).
- [ ] `src/resolver/gantt/GanttFolderValidationService.js` (`detectFolderCycle`, jest).
- [ ] `src/resolver/gantt/GanttFolderService.js` (create/rename/delete/move/setIssueFolder).
- [ ] `GanttService.getProjectGanttData` 확장: 폴더 2쿼리 `Promise.all` + `content.folders`/`content.folderIssues` 조립(tasks/links/meta 불변).
- [ ] `GanttController.registerGanttController` 에 resolver 5종 `define` 추가.
- [ ] `ErrorCodes` 3종 추가.
- [ ] `ProjectRepository` + `ProjectService.deleteProjectService` cascade 편입(folder_issue → folder).
- [ ] jest: detectFolderCycle, deleteGanttFolder 승계 로직(가능하면).

### Frontend (백엔드 계약 확정 후)
- [ ] `ganttAdapter.js`: `unwrapGanttPayload` folders/folderIssues 추출; `toSvarTasks` 폴더 노드 합성(부모 우선순위·가시성·롤업); `computeFolderRollup`(기간+MD가중 progress, §6) 순수함수.
- [ ] `useGanttData.js`: folders/folderIssues 노출.
- [ ] `useGanttFolderMutations.js`: 5 훅 + `mapFolderError`.
- [ ] 모달: `GanttFolderNameModal.jsx`(생성/이름변경), `GanttFolderAssignModal.jsx`(이슈 소속), `GanttFolderMoveModal.jsx`(중첩 이동, self·자손 제외).
- [ ] `GanttToolbar.jsx`: "폴더 추가" 버튼(canWrite).
- [ ] `GanttGridEditCells.jsx` + `GanttChart.jsx`: 셀들 `row.folder` 분기('-'·집계), setParent 컬럼에 폴더 액션, 이슈 행 "폴더 지정" 진입.
- [ ] `GanttChart.jsx`: 폴더 DOM 클래스 이펙트(막대 `gantt-folder-bar`/행 `gantt-folder-row`), update-task·move-task·add/delete-link 폴더 id 가드.
- [ ] `GanttPage.jsx`: 폴더 mutation 배선 + `toSvarTasks` 옵션에 folders/folderIssues/hourRate 주입.
- [ ] `gantt.css`: `.gantt-folder-bar`(보라/인디고), `.gantt-folder-row`(연보라 배경) — placeholder `!important` 패턴 참고.
- [ ] i18n: kr/en `folder.*`·`toast.folder*`·`error.folder*` 추가 → `npm run merge`.

### Verify (integration-verifier)
- [ ] §2 계약 표 ↔ invoke 소비 교차검증(5 resolver + getProjectGanttData 확장 키).
- [ ] 폴더 노드 SVAR open/leaf 크래시 회귀(빈 폴더 제외·open 가드).
- [ ] 기존 간트(링크/WBS/placeholder/그리드편집/마커) 무회귀.
- [ ] MD 가중 수행율 계산 단위테스트(혼합 MD·전무 MD·중첩).
- [ ] 프로젝트 삭제 cascade 에 folder 2테이블 포함.
- [ ] i18n 키 누락(merge 결과 ko-KR/en-US 반영).

---

## 10. 주요 가정 / 리더 확인 요망(1회)
- **A1(어댑터 우선순위)**: 이슈-부모(effectiveParent) > 폴더-소속. 이슈-부모가 있는 이슈는 폴더 지정이 시각 무효(문서화·모달 안내). — 서브트리 루트만 폴더에 담는 모델. 이견 시 "폴더 우선"으로 전환 가능하나 WBS 트리와 충돌.
- **A2(빈 폴더)**: 필터로 가시 자손 0 인 폴더는 렌더 제외(자동 소멸). 이견 시 "빈 폴더도 표시(open 미부여)"로 전환 가능.
- **A3(MD 폴백 혼합)**: MD 없는 leaf 는 weight=1MD(단일 결정적 규칙). 전무 시 단순평균=확정결정3 충족. 혼합 케이스 해석은 아키텍트 판단.
- **A4(폴더 시각 유형)**: `type='summary'` + DOM 클래스 색 오버라이드(보라). 초록 네이티브 summary 와 구별. per-task css 미지원 제약의 검증된 우회.
- 위 가정은 보수적 기본값으로 진행하며, 리더 지시 시 해당 부분만 수정한다.
