# 간트 폴더 개선 2건 설계서 — R1 뎁스별 색상 · R2 폴더 링크 (2026-07-07)

> 단일 진실 원천. backend/frontend/verifier 는 이 문서(특히 **§2 경계면 계약**)를 기준으로 작업한다.
> 원칙: **`gantt-folder-layer`(2026-07-02) 기능의 additive 증분**. 기존 간트(이슈 링크/WBS/placeholder/그리드편집/마커/폴더 CRUD·소속·이동) **무회귀**.
> R1 = **프론트 전용**(백엔드 0). R2 = **풀스택**(폴더 링크는 앱 DB 전용, Jira write 0 — 이슈↔이슈만 네이티브 유지).

---

## 1. 개요 / 영향 범위

### R1. 폴더 뎁스별 색상 구분 (프론트 전용)
- 현재: 모든 폴더 막대(`.gantt-folder-bar` #8777d9)·행(`.gantt-folder-row` rgba(101,84,192,0.08))이 단일 보라.
- 목표: **1depth(루트 폴더)·2depth·3+depth 를 보라 농도 그라데이션으로 시각 구분**(막대 + 행 배경, 라이트/다크 모두).
- 백엔드/DB/i18n **무변경**.

### R2. 폴더 레벨 선후행(FS) 연결 (풀스택)
- 목표: 폴더 막대에서도 링크 드래그로 선후행 화살표 생성/삭제.
- 폴더는 Jira 이슈가 아님 → 네이티브 issueLink 불가 → **앱 DB(Forge SQL) 신규 테이블 `gantt_folder_link`**.
- **끝점 스코프(결정, §8-D1)**: "**폴더가 한쪽 이상 끝점인 링크 = 전부 앱 DB**". 이슈↔이슈만 기존 네이티브(`setGanttLink`) 유지.

| 축 | R1 | R2 |
|----|----|----|
| 백엔드 | 없음 | 신규 resolver `setGanttFolderLink` + `getProjectGanttData` 확장(`content.folderLinks` 추가) + 폴더/프로젝트 삭제 cascade에 링크 정리 |
| 프론트 | `synthesizeFolderNodes`(depth 계산) + `GanttChart` DOM 클래스 + `gantt.css` | 어댑터 folderLinks 소비 + `GanttChart` 링크 인터셉트 분기 + `useSetFolderLink` 훅 + `GanttPage` 배선 |
| DB | 없음 | `gantt_folder_link` 1테이블 + 마이그레이션 v009 |
| i18n | 없음 | `gantt.error.folderLinkInvalid` 1키(kr/en). 성공 토스트는 기존 `gantt.toast.linkAdded/linkRemoved` 재사용 |

**신규 컨트롤러 없음** — `GanttController.registerGanttController` 에 `setGanttFolderLink` 1종만 추가. `src/index.js` 무변경.

---

## 2. 경계면 계약 (핵심)

모든 resolver 는 `guardedDefine`(내부 `responseWrapper`) 로 감싼다 → 프론트 수신 `{ success, content|error }`. 아래 "응답 shape" 은 **content 내부**.

### 2-A. R2 신규 쓰기 resolver

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시 `content`) | 대응 프론트 훅 / 캐시 |
|--------------|-------------|----------------------------------|----------------------|
| `setGanttFolderLink` | `{ projectId, op:'add'\|'remove', source, target }`  — source/target = **네임스페이스 끝점 문자열**(`folder:<uuid>` \| `ISSUE-1`) | `{ op, source, target, link: { id, source, target, type:'FS', lag:0 } }` (id=`source->target`) | `useSetFolderLink` → 낙관 패치 `content.folderLinks` (invalidate 금지) |

- **최소 1개 끝점이 폴더**여야 함(`folder:` 접두). 둘 다 이슈면 미스라우팅 → `GANTT_FOLDER_LINK_INVALID`.
- `link` 은 add/remove 공통(remove 시 삭제된 링크 서술자). 프론트는 `op` 로 캐시 add/remove.
- **스왑 없음(정방향 저장/읽기)** — 앱 DB는 Jira issueLink 라운드트립 특성이 없다(GANTT.md §3/§6 스왑은 네이티브 전용). `{ source, target }` 을 있는 그대로 저장/반환.

### 2-B. `getProjectGanttData` 확장 (additive — 기존 키 전부 불변)

입력: `{ projectId, coworkerFieldId }` (**무변경**).

응답 `content` (기존 + 신규 1키):
```
{
  tasks: [Task],               // ← 무변경
  links: [Link],               // ← 무변경 (이슈↔이슈 네이티브 링크만)
  meta: { total, fetchedAt, projectStart, projectEnd },  // ← 무변경
  folders: [{ id, name, parentFolderId, sortOrder }],    // ← 무변경(폴더 레이어)
  folderIssues: { "<issueKey>": "<folderId>" },          // ← 무변경(폴더 레이어)
  folderLinks: [               // ★ 신규(additive)
    { id, source, target, type:'FS', lag:0 }
  ]
}
```
- **`folderLinks[].source`/`target` = 네임스페이스 끝점 문자열**(`folder:<uuid>` \| 이슈 key). `id` = `source->target`.
- `type:'FS'`/`lag:0` 은 표시용 고정값(폴더 링크도 관계타입 미저장 — 이슈 링크와 동형).
- **폴더 조회 best-effort**: 링크 SELECT 가 실패(마이그레이션 미적용)해도 `folderLinks:[]` 폴백, tasks/links/meta/folders 정상 반환(무회귀). — `getProjectGanttData` 의 기존 `safeFolderRows` 헬퍼 재사용.

> **왜 `links` 에 합치지 않고 `folderLinks` 별도 키인가(결정 §8-D2)**: (1) 기존 `useSetLink` 낙관 패치·`buildLinksFromIssueLinks`(스왑) 로직이 `content.links` 를 이슈↔이슈 네이티브 전제로 다룬다 → 폴더 링크 혼입 시 오염. (2) `folders`/`folderIssues` 와 대칭인 additive 키가 일관적. (3) 프론트가 이슈 링크(가시 이슈 기준 필터)와 폴더 링크(폴더 노드 포함 가시 기준 필터)를 **서로 다른 가시성 규칙**으로 병합해야 하므로 소스 분리가 맞다.

### 2-C. 끝점 네임스페이스 규약 (계약 고정)
- 폴더 끝점 = `folder:<uuid>` (기존 SVAR 폴더 노드 id 와 동일 — `ganttAdapter.synthesizeFolderNodes` 부여값).
- 이슈 끝점 = 이슈 key(예: `ARS-8`).
- **백엔드가 네임스페이스 형태를 그대로 저장/반환**(폴더/folderIssues 의 "plain UUID" 관례와 의도적 상이). 근거: 폴더 링크는 앱 DB 전용·Jira 미접촉이며, 링크는 **SVAR 렌더 조인키**라 네임스페이스 형태가 자연스럽고, id `source->target` 이 프론트 `parseLinkId` 역파싱과 무손실 정합(§8-D3).
- `parseLinkId(id)` 충돌 없음 검증: UUID엔 `->` 시퀀스 없음, 이슈 key엔 `->` 없음 → `id.indexOf('->')` 가 항상 끝점 구분자에 정확히 걸림. `folder:<uuidA>->folder:<uuidB>`, `folder:<uuid>->ARS-8`, `ARS-8->folder:<uuid>` 모두 정상 분해.

---

## 3. 백엔드 설계 (R2)

### 3-1. 계층 분해 (기존 폴더 레이어 구조에 편승)
```
GanttController.registerGanttController  (setGanttFolderLink 1종 define 추가)
  → GanttFolderService.setGanttFolderLink   (오케스트레이션 + 검증)
       → GanttService.fetchGanttGraph(projectId)   (기존 재사용 — 이슈 그래프 1패스: links/keySet)
       → GanttFolderRepository (신규 링크 래퍼) → GanttFolderQuery (신규 SQL 상수)
       → detectDagCycle (GanttValidationService, 기존 순수함수 재사용 — 혼합 그래프)
```
- **주의**: `fetchGanttGraph` 는 현재 `GanttService.js` 의 non-export const. `setGanttFolderLink` 가 `GanttFolderService.js` 에 있으므로 `fetchGanttGraph` 를 **export** 하거나(권장), 동등한 경량 그래프 페처를 `GanttFolderService` 에서 호출한다. → `GanttService.js` 에서 `export const fetchGanttGraph` 로 승격(공통 페치 경로 미수정 원칙 준수 — 전용 페처만 재사용).

### 3-2. `setGanttFolderLink({ projectId, op, source, target })` 명세
```
1. 가드: projectId/op('add'|'remove')/source/target 필수. source===target → GANTT_SELF_REFERENCE.
2. 끝점 스코프: isFolderRef(source)||isFolderRef(target) 아니면 → GANTT_FOLDER_LINK_INVALID (둘 다 이슈=미스라우팅).
3. 폴더 끝점 존재 검증: 각 folder: 끝점의 uuid → requireFolder(uuid, projectId) (없으면 GANTT_FOLDER_NOT_FOUND).
4. op==='add' 일 때만 혼합 그래프 순환 검증:
     const { links: issueLinks, keySet: issueKeySet } = await fetchGanttGraph(projectId);
     const folders = (findFoldersByProjectRepository([projectId])).rows;
     const existingFolderLinks = (findFolderLinksByProjectRepository([projectId])).rows; // [{source,target}]
     const mixedKeySet = new Set([...issueKeySet, ...folders.map(f => `folder:${f.id}`)]);
     const mixedLinks  = [...issueLinks, ...existingFolderLinks];
     detectDagCycle({ links: mixedLinks, keySet: mixedKeySet, source, target });
       → self/교차프로젝트(끝점이 집합 밖 이슈)/DAG 순환 위반 시 throw (GANTT_SELF_REFERENCE|GANTT_CROSS_PROJECT_REF|GANTT_CYCLE_DETECTED).
5. 영속:
     add    → INSERT ... ON DUPLICATE KEY (멱등)  gantt_folder_link(project_id, source_ref, target_ref)
     remove → DELETE WHERE project_id AND source_ref=? AND target_ref=?  (매칭 없어도 멱등 성공)
6. 반환: { content: { op, source, target, link: { id:`${source}->${target}`, source, target, type:'FS', lag:0 } } }
```
- **스왑 금지**: `createIssueLink` 의 outward/inward 스왑은 네이티브 전용. 앱 DB는 `source_ref=source, target_ref=target` 정방향.
- 헬퍼: `isFolderRef = s => typeof s==='string' && s.startsWith('folder:')`, `stripFolderRef = s => s.slice('folder:'.length)`.

### 3-3. 혼합 그래프 순환 정책 (결정 §8-D4)
- **의존 그래프 = 이슈 링크 ∪ 폴더 링크** (끝점을 이슈/폴더 노드로 균일 취급). 순환은 이 합집합에서만 판정.
- **폴더 계층(parentFolderId)·이슈↔폴더 소속(folderIssues)·WBS/부모 관계는 의존 간선이 아니다** → 순환 판정에 미포함. 즉 "폴더가 자기 자손 이슈와 링크"는 **허용**(containment ≠ dependency). SVAR는 폴더 막대→자손 이슈 막대로 화살표를 정상 렌더(크래시·무한루프 없음). 자손 멤버십 로딩(고비용) 불요.
- `detectDagCycle` 는 **무수정 재사용**(입력 `links`/`keySet` 만 폴더 노드까지 확장). 순수함수라 jest 유지.

### 3-4. GanttFolderRepository 신규 래퍼 (executeQuery 얇은 래퍼 — 기존 패턴)
```
findFolderLinksByProjectRepository(params=[projectId])           → FIND_FOLDER_LINKS_BY_PROJECT
insertFolderLinkRepository(params=[projectId, source, target, createdId]) → INSERT_FOLDER_LINK (ON DUP)
deleteFolderLinkRepository(params=[projectId, source, target])   → DELETE_FOLDER_LINK
deleteFolderLinksOfEndpointRepository(params=[projectId, endpointRef, endpointRef]) → DELETE_FOLDER_LINKS_OF_ENDPOINT (폴더 삭제 cascade)
deleteGanttFolderLinksByProjectRepository(params=[projectId])    → DELETE_FOLDER_LINKS_BY_PROJECT (프로젝트 cascade)
```

### 3-5. GanttFolderQuery 신규 SQL 상수 (`src/rdb/query/GanttFolderQuery.js`)
```sql
-- params: [projectId]
FIND_FOLDER_LINKS_BY_PROJECT:
  SELECT source_ref AS source, target_ref AS target
  FROM gantt_folder_link WHERE project_id = UUID_TO_BIN(?)

-- params: [projectId, source, target, createdId]
INSERT_FOLDER_LINK:
  INSERT INTO gantt_folder_link (project_id, source_ref, target_ref, created_id)
  VALUES (UUID_TO_BIN(?), ?, ?, ?)
  ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP

-- params: [projectId, source, target]
DELETE_FOLDER_LINK:
  DELETE FROM gantt_folder_link
  WHERE project_id = UUID_TO_BIN(?) AND source_ref = ? AND target_ref = ?

-- 폴더 삭제 시: 그 폴더가 끝점인 링크 정리. params: [projectId, endpointRef, endpointRef]
DELETE_FOLDER_LINKS_OF_ENDPOINT:
  DELETE FROM gantt_folder_link
  WHERE project_id = UUID_TO_BIN(?) AND (source_ref = ? OR target_ref = ?)

-- 프로젝트 삭제 cascade. params: [projectId]
DELETE_FOLDER_LINKS_BY_PROJECT:
  DELETE FROM gantt_folder_link WHERE project_id = UUID_TO_BIN(?)
```

### 3-6. `getProjectGanttData` 확장 (GanttService.js, additive)
기존 `Promise.all` 에 폴더 링크 SELECT 1건 추가(경량·프로젝트 스코프, best-effort):
```js
const [issues, folderRows, folderIssueRows, folderLinkRows] = await Promise.all([
    getProjectGanttIssues(projectId, resolvedCoworkerFieldId, wbsParentFieldId),   // 기존(전용 페처, 미수정)
    safeFolderRows(() => findFoldersByProjectRepository([projectId])),             // 기존
    safeFolderRows(() => findFolderIssuesByProjectRepository([projectId])),        // 기존
    safeFolderRows(() => findFolderLinksByProjectRepository([projectId])),         // ★ 신규
]);
...
const folderLinks = folderLinkRows
    .filter(r => r?.source && r?.target)
    .map(r => ({ id: `${r.source}->${r.target}`, source: r.source, target: r.target, type: 'FS', lag: 0 }));
return { content: { tasks, links, meta, folders, folderIssues, folderLinks } };  // ★ folderLinks 추가
```
- 기존 이슈 전용 병렬 페처 **미수정**. 링크 SELECT 는 프로젝트 스코프 소량 → N+1/메모리 무부담.

### 3-7. 폴더 삭제 / 프로젝트 삭제 cascade 편입
- **`deleteGanttFolder`**(GanttFolderService): 승계·폴더 삭제 후 **해당 폴더가 끝점인 링크 정리** 1스텝 추가:
  ```
  await deleteFolderLinksOfEndpointRepository([projectId, `folder:${folderId}`, `folder:${folderId}`]);
  ```
  (링크는 승계하지 않고 삭제 — §8-D5. 존재하지 않는 폴더를 가리키는 링크는 무의미.)
- **`ProjectService.deleteProjectService`**: cascade 순서에 링크를 폴더보다 먼저(논리적 자식):
  `projectusers → dashboard → snapshot → **folder_link** → folder_issue → folder → project`.
  신규 Repository `deleteGanttFolderLinksByProjectRepository` 를 4번 위치에 삽입.

### 3-8. 권한 / 에러코드 / 등록
- **PermissionMap**(`src/permission/PermissionMap.js`): `setGanttFolderLink: W('PROJECT_GANTT', 'inherited')` 추가(기존 `setGanttLink`/폴더 ops 와 동일). **필수** — 미선언 시 deny-by-default 로 원천 거부.
- **ErrorCodes**(`src/utils/errors/ErrorCodes.js`): `GANTT_FOLDER_LINK_INVALID: 'GANTT_FOLDER_LINK_INVALID'` 1종 추가. 순환/self/교차프로젝트/폴더없음은 **기존 코드 재사용**(`GANTT_CYCLE_DETECTED`/`GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF`/`GANTT_FOLDER_NOT_FOUND`).
- **GanttController**: `import { setGanttFolderLink } from './GanttFolderService'` + `guardedDefine(resolver, 'setGanttFolderLink', async ({ payload }) => await setGanttFolderLink(payload))`.

---

## 4. DB 설계 (R2)

### 4-1. `gantt_folder_link` (신규)
```sql
CREATE TABLE IF NOT EXISTS gantt_folder_link (
    project_id  BINARY(16)  NOT NULL,
    source_ref  VARCHAR(64) NOT NULL,   -- 'folder:<uuid>'(43자) | 이슈 key. 네임스페이스 끝점.
    target_ref  VARCHAR(64) NOT NULL,
    created_id  VARCHAR(100),
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, source_ref, target_ref),   -- 링크 유일 + add 멱등(ON DUP)
    INDEX (project_id),
    INDEX (project_id, source_ref),
    INDEX (project_id, target_ref)
);
```
- **끝점을 네임스페이스 문자열로 저장**(§2-C). `folder:`(7)+UUID(36)=43자 → VARCHAR(64) 여유. 이슈 key 도 64 이내.
- **PK 복합(project_id, source_ref, target_ref)**: 링크 유일성 + `INSERT ... ON DUPLICATE KEY` 멱등. TiDB 복합 PK 지원.
- **TiDB(Forge SQL) 제약 반영**(기존 폴더 테이블과 동일 사상): FK 미선언·CASCADE 무효·트랜잭션 미지원 → 무결성은 앱 코드로(순환=`detectDagCycle`, 폴더삭제 링크정리=순차 멱등 DELETE, 프로젝트 cascade=순차 DELETE, dangling 끝점=어댑터가 무시).

### 4-2. 마이그레이션 (기존 패턴)
- `src/rdb/schema/ddl/ganttFolder.sql.js` 에 `CREATE_GANTT_FOLDER_LINK_TABLE` export 추가(기존 2 테이블 옆).
- `src/rdb/schema/ddl/index.js` export 추가: `CREATE_GANTT_FOLDER_LINK_TABLE`.
- `src/rdb/schema/migrate.js` 체인에 append: `.enqueue('v009_create_gantt_folder_link_table', CREATE_GANTT_FOLDER_LINK_TABLE)`.
- `runMigration` 은 manifest 에 이미 등록(추가 배선 불요). manifest `sql:` 도 등록됨 — **manifest.yml 무변경**.

---

## 5. 프론트엔드 설계 — R1 (뎁스별 색상, 프론트 전용)

### 5-1. `ganttAdapter.synthesizeFolderNodes` — depth 계산
- 폴더 노드에 **`folderDepth`(1-base)** 추가. parentFolderId 체인 길이로 산출:
  ```js
  const parentById = new Map(folders.map(f => [f.id, f.parentFolderId ?? null]));
  const depthOf = (fid) => {
      let d = 1, cur = parentById.get(fid) ?? null, guard = 0;
      while (cur != null && guard++ < 1000) { d++; cur = parentById.get(cur) ?? null; }
      return d;
  };
  // 노드 조립부: node.folderDepth = depthOf(f.id);
  ```
- raw depth 를 그대로 저장(캡은 GanttChart 에서). 손상 순환은 guard 로 방어(기존 `compute`/`isFolderDescendant` 와 동일 사상).

### 5-2. `GanttChart.jsx` — 폴더 DOM 클래스 useEffect(L452~491) 확장
- 기존 `folderIds`/`emptyFolderIds` 세트 옆에 **id→depth 맵** 추가:
  ```js
  const folderDepthById = new Map(
      (tasks||[]).filter(tk => tk?.folder === true)
                 .map(tk => [String(tk.id), Math.min(Math.max(tk.folderDepth || 1, 1), 3)])  // 3+ 캡
  );
  ```
- `apply()` 의 막대·행 순회에서 depth 클래스 토글(막대 **및** 행 둘 다):
  ```js
  const d = folderDepthById.get(id);                 // 폴더 아니면 undefined
  el.classList.toggle('gantt-folder-depth-1', d === 1);
  el.classList.toggle('gantt-folder-depth-2', d === 2);
  el.classList.toggle('gantt-folder-depth-3', d === 3);
  ```
  (기존 `gantt-folder-bar`/`gantt-folder-row`/`gantt-folder-empty-bar` 토글은 유지 — depth 클래스는 그 위에 얹힘.) MutationObserver 는 attributes 미관측이라 무한루프 없음(기존과 동일).

### 5-3. `gantt.css` — 뎁스 팔레트(§폴더 레이어 뒤에 추가)
- 기존 `.gantt-folder-bar`(#8777d9)/`.gantt-folder-row` 는 **폴백**으로 유지. depth 클래스는 `.gantt-folder-bar.gantt-folder-depth-N`(4클래스, 특이도 우선)으로 오버라이드.
- **팔레트(보라 농도: depth1 진함 → depth3+ 연함, Atlassian purple 스케일)**:

| depth | 막대 bg / border / progress fill | 행 배경(light) | 행 배경(dark) |
|-------|----------------------------------|----------------|----------------|
| 1 | `#5243AA` / `#403294` / `#403294` | `rgba(82,67,170,0.14)` | `rgba(159,143,239,0.20)` |
| 2 | `#8777D9` / `#6554C0` / `#5243AA` | `rgba(101,84,192,0.09)` | `rgba(159,143,239,0.13)` |
| 3+ | `#B3A4E8` / `#8777D9` / `#6554C0` | `rgba(135,119,217,0.06)` | `rgba(159,143,239,0.08)` |

- 셀렉터 형태(막대):
  ```css
  .gantt-svar-host .wx-bar.gantt-folder-bar.gantt-folder-depth-1,
  .gantt-svar-host .wx-bar.gantt-folder-bar.gantt-folder-depth-1 .wx-task,
  .gantt-svar-host .wx-bar.gantt-folder-bar.gantt-folder-depth-1 .wx-segment { background-color:#5243AA!important; border-color:#403294!important; }
  .gantt-svar-host .wx-bar.gantt-folder-bar.gantt-folder-depth-1 .wx-progress-percent { background-color:#403294!important; }
  /* depth-2, depth-3 동형 */
  ```
- 행 배경:
  ```css
  .gantt-svar-host .wx-grid .wx-body .wx-row.gantt-folder-row.gantt-folder-depth-1 { background-color:rgba(82,67,170,0.14)!important; }
  html[data-color-mode="dark"] .gantt-svar-host .wx-grid .wx-body .wx-row.gantt-folder-row.gantt-folder-depth-1 { background-color:rgba(159,143,239,0.20)!important; }
  /* depth-2, depth-3 동형 */
  ```
- 텍스트/폴더아이콘(`.gantt-folder-name`, `#6554c0`)은 **불변**(depth 무관). 색 구분은 막대·행 배경으로 충분. 기존 이슈 summary(초록)/task(파랑)/placeholder(회색 점선)와 계열이 다름 → 충돌 없음(검증 기준 R1).

---

## 6. 프론트엔드 설계 — R2 (폴더 링크, 풀스택)

### 6-1. 데이터 흐름 (folderLinks 소비 경로)
```
useGanttData → { ..., folders, folderIssues, folderLinks }
  → GanttPage: 이슈 링크(가시 이슈 필터) + 폴더 링크(가시 노드 필터) 병합 → GanttChart links prop
      → GanttChart 링크 인터셉트: 끝점 folder: 접두 유무로 이슈/폴더 경로 분기
```

### 6-2. `ganttAdapter.js`
- `unwrapGanttPayload`: `folderLinks: Array.isArray(payload?.folderLinks) ? payload.folderLinks : []` 추출(additive, 기본 `[]`).
- **`toSvarLinks` 재사용**(폴더 링크도 `{ id, source, target, type:'FS' }` 동형 → `type FS→e2s` 매핑 그대로). 폴더 끝점 `folder:<uuid>` 가 SVAR 폴더 노드 id 와 일치하므로 별도 변환 불요.

### 6-3. `useGanttData.js`
- `unwrapGanttPayload` 반환에서 `folderLinks` 를 추가로 노출(`{ tasks, links, meta, folders, folderIssues, folderLinks, ... }`).

### 6-4. `GanttPage.jsx` — 링크 병합 + 배선
- `useGanttData` 에서 `folderLinks` 수신. `useSetFolderLink` 훅 인스턴스화.
- svarLinks 계산부(useMemo) 개정 — **이슈 링크 + 폴더 링크를 각자 가시성 규칙으로 필터 후 병합**:
  ```js
  const svarTasks = toSvarTasks(filtered, { placeholderStart, folders, folderIssues, hourRate });
  const nodeIdSet = new Set(svarTasks.map(tk => tk.id));   // 이슈 id + folder:<uuid> 노드 모두 포함
  const visibleIssueLinks  = links.filter(l => visibleIds.has(l.source) && visibleIds.has(l.target));
  const visibleFolderLinks = folderLinks.filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target));
  const svarLinks = toSvarLinks([...visibleIssueLinks, ...visibleFolderLinks]);
  ```
  의존성 배열에 `folderLinks` 추가. (folder 노드는 현재 빈 폴더 포함 전량 렌더 → nodeIdSet 에 존재.)
- 신규 핸들러(canWrite 가드):
  ```js
  const handleAddFolderLink    = ({ source, target }) => { if (canWrite) setFolderLink.mutate({ op:'add', source, target }); };
  const handleRemoveFolderLink = ({ source, target }) => { if (canWrite) setFolderLink.mutate({ op:'remove', source, target }); };
  ```
- `<GanttChart>` 에 `onAddFolderLink={handleAddFolderLink}` `onRemoveFolderLink={handleRemoveFolderLink}` prop 전달.

### 6-5. `GanttChart.jsx` — 링크 인터셉트 분기 (add-link / delete-link)
- 신규 prop `onAddFolderLink`, `onRemoveFolderLink` (+ ref 미러링, 기존 패턴).
- **add-link 인터셉트**(현재 `if (isFolderId(source)||isFolderId(target)) return false;` 스킵) → **분기**:
  ```js
  if (source && target) {
      if (isFolderId(source) || isFolderId(target)) {
          onAddFolderLinkRef.current?.({ source, target });   // 폴더 링크 경로
      } else {
          onAddLinkRef.current?.({ source, target, type:'FS', lag:0 });  // 기존 이슈 경로
      }
  }
  return false;  // 로컬 렌더 차단(서버 확정 후 캐시 패치로 그림) — 무변경
  ```
- **delete-link 인터셉트**(`parseLinkId(id)` → `{ source, target }`) → **분기**:
  ```js
  if (parsed) {
      if (isFolderId(parsed.source) || isFolderId(parsed.target)) {
          onRemoveFolderLinkRef.current?.({ source: parsed.source, target: parsed.target });
      } else {
          onRemoveLinkRef.current?.({ source: parsed.source, target: parsed.target, type:'FS', lag:0 });
      }
  }
  ```
  (기존 `!isFolderId(...)` 가드로 폴더를 무조건 배제하던 조건을 제거하고 분기로 대체.)
- move-task(폴더 중첩/소속 드래그)·update-task(폴더 막대 드래그 스킵)는 **무변경** — 링크와 별개 관계(containment).

### 6-6. `useGanttFolderMutations.js` — `useSetFolderLink` 신규 훅
- 위치: 기존 폴더 mutation 파일에 추가(폴더 도메인 응집). **낙관 패치 + onError 롤백**(useSetLink 패턴) + **invalidate 금지**(앱 DB 즉시 일관).
  ```js
  export function useSetFolderLink({ projectId, toast }) {
    const t = useI18nStore(s => s.t);
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ op, source, target }) => invokeFolder('setGanttFolderLink', { projectId, op, source, target }),
      onMutate: async ({ op, source, target }) => {
        await qc.cancelQueries({ queryKey: ganttKeys.data(projectId) });
        const prev = qc.getQueryData(ganttKeys.data(projectId));
        qc.setQueryData(ganttKeys.data(projectId), (old) => {
          const fl = old?.content?.folderLinks; if (!Array.isArray(fl)) return old;
          let next;
          if (op === 'add') {
            if (fl.some(l => l.source===source && l.target===target)) return old;   // 멱등
            next = [...fl, { id:`${source}->${target}`, source, target, type:'FS', lag:0 }];
          } else {
            next = fl.filter(l => !(l.source===source && l.target===target));
          }
          return { ...old, content: { ...old.content, folderLinks: next } };
        });
        return { prev };
      },
      onSuccess: (_data, vars) => {
        toast?.showSuccess?.(t('common.toast.title.success'),
          t(vars.op==='remove' ? 'gantt.toast.linkRemoved' : 'gantt.toast.linkAdded'));  // 기존 키 재사용
      },
      onError: (err, _v, ctx) => {
        if (ctx?.prev !== undefined) qc.setQueryData(ganttKeys.data(projectId), ctx.prev);
        toast?.showError?.(t('common.toast.title.Fail'), mapFolderLinkError(t, err?.cause?.code));
      },
    });
  }
  ```
- `mapFolderLinkError(t, code)`: `GANTT_CYCLE_DETECTED→gantt.error.cycle`, `GANTT_SELF_REFERENCE→gantt.error.selfRef`, `GANTT_CROSS_PROJECT_REF→gantt.error.crossProject`, `GANTT_FOLDER_NOT_FOUND→gantt.error.folderNotFound`, `GANTT_FOLDER_LINK_INVALID→gantt.error.folderLinkInvalid`, default→`gantt.error.folderSaveFailed`. (앞 4개는 기존 키, `folderLinkInvalid` 만 신규.)
- `invokeFolder` 헬퍼는 같은 파일에 이미 존재 → 재사용.

### 6-7. Zustand / 쿼리키 / 권한
- Zustand·쿼리키 **신규 없음**(`ganttKeys.data(projectId)` 재사용).
- 권한: 폴더 링크 생성/삭제 진입은 SVAR 드래그 제스처 → `editable(canWrite('PROJECT_GANTT'))` 게이트(readonly 시 제스처 자체 차단) + GanttPage 핸들러 canWrite 재확인 + 서버 `guardedDefine` 3중 방어. 기존 이슈 링크와 동일.

---

## 7. i18n 키 목록

R1 = 없음. R2 = **신규 1키**(성공 토스트는 기존 `gantt.toast.linkAdded`/`linkRemoved` 재사용).

`locales/kr/gantt.json` `error` 객체에 추가:
```json
"folderLinkInvalid": "폴더가 포함된 연결만 이 경로로 저장됩니다."
```
`locales/en/gantt.json` `error` 객체에 추가:
```json
"folderLinkInvalid": "Only links involving a folder are saved through this path."
```
> 기존 `error` 객체에 **키 추가**(병합). 추가 후 `cd static/ui && npm run merge` (→ ko-KR.json/en-US.json 생성). `locales/script/*.json` 은 빈 스텁이라 금지.

---

## 8. 주요 결정 / 근거

- **D1 (끝점 스코프)**: "폴더가 한쪽 이상 끝점 = 앱 DB, 이슈↔이슈만 네이티브". 단순·명확한 라우팅 규칙("`folder:` 접두 유무"). SVAR는 아무 막대끼리 드래그 가능하나 저장 경로를 이 규칙으로 결정론적 분기. 이슈↔이슈 기존 경로 완전 무영향.
- **D2 (병합 방식)**: `content.folderLinks` **별도 키**(기존 `links` 미오염, folders/folderIssues 와 대칭, 가시성 규칙 분리). §2-B.
- **D3 (네임스페이스 저장)**: 백엔드가 `folder:<uuid>`/이슈key 를 그대로 저장·반환(폴더의 plain UUID 관례와 의도적 상이). 링크는 SVAR 렌더 조인키 + `parseLinkId` 무손실 정합이 근거. §2-C.
- **D4 (순환 정책)**: 의존 그래프 = 이슈 링크 ∪ 폴더 링크만. 폴더 containment/소속/WBS는 의존 간선 아님 → "폴더↔자손 이슈 링크" 허용(렌더 안전). `detectDagCycle` 무수정 재사용. §3-3.
- **D5 (폴더 삭제 링크 처리)**: 삭제 폴더가 끝점인 링크는 **승계 없이 삭제**(존재하지 않는 폴더 링크는 무의미). §3-7.
- **D6 (스왑 금지)**: 앱 DB 폴더 링크는 정방향 저장/읽기. 스왑은 Jira issueLink 라운드트립 전용(GANTT.md §3/§6). §3-2.
- **D7 (dangling 방어)**: 삭제된 이슈/폴더를 가리키는 링크는 어댑터가 `nodeIdSet` 교차로 무시(기존 links/folderIssues 방어와 동일). §6-4.
- **A1 (빈 폴더 링크)**: 빈 폴더 막대는 `visibility:hidden`(크래시 회피). 그 폴더로의 링크는 보이지 않는 막대를 가리킴(경미 — 화살표 시작/끝이 숨은 위치). 허용하되 verifier 확인 포인트로 명시.

---

## 9. 테스트 포인트 (verifier 기준)

### 백엔드 (jest, `src/resolver/gantt/__test__/`)
- `setGanttFolderLink` 검증 분기(Repo/fetchGanttGraph mock):
  - add 성공(폴더↔폴더, 폴더↔이슈 양방향), 멱등(중복 add).
  - `GANTT_FOLDER_LINK_INVALID`(둘 다 이슈), `GANTT_SELF_REFERENCE`(source===target), `GANTT_FOLDER_NOT_FOUND`(존재 안 하는 폴더 끝점), `GANTT_CROSS_PROJECT_REF`(집합 밖 이슈 끝점), `GANTT_CYCLE_DETECTED`(혼합 그래프 순환).
  - remove 멱등(매칭 없어도 성공), self 가드.
- `detectDagCycle` **혼합 그래프** 케이스(폴더 노드 포함 keySet/links) — 기존 순수함수 테스트 확장.
- `deleteGanttFolder` → 링크 정리 스텝 호출 검증. `deleteProjectService` cascade 에 folder_link 포함(순서).
- 전체 `npm test` 무회귀(기존 146 tests + 신규).

### 프론트 (`cd static/ui && npm test` / `npm run build`)
- R1: depth 1/2/3+ 폴더 막대·행 배경 시각 구분(다크 포함), `folderDepth` 계산 순수함수 단위테스트(중첩·손상순환 guard).
- R2: 폴더→폴더/폴더↔이슈 링크 드래그 생성 → 새로고침 유지, 삭제, 순환 시도 토스트 거부, 이슈↔이슈 기존 경로 무영향.
- 계약 교차검증: `setGanttFolderLink` 응답 shape ↔ `useSetFolderLink` 소비, `content.folderLinks` shape ↔ 어댑터/GanttPage 병합.
- SVAR 무회귀: 폴더 노드 open/leaf 크래시 없음, 폴더 막대→이슈 막대 화살표 렌더, 빈 폴더 링크(A1).
- i18n: `gantt.error.folderLinkInvalid` merge 반영(ko-KR/en-US).

---

## 10. 구현 작업 분해

### Backend (먼저)
- [ ] DDL: `ganttFolder.sql.js` 에 `CREATE_GANTT_FOLDER_LINK_TABLE` + `ddl/index.js` export + `migrate.js` v009 enqueue.
- [ ] `GanttFolderQuery.js`: FIND/INSERT(ON DUP)/DELETE/DELETE_OF_ENDPOINT/DELETE_BY_PROJECT 5 상수.
- [ ] `GanttFolderRepository.js`: 링크 래퍼 5종.
- [ ] `GanttService.js`: `fetchGanttGraph` export 승격 + `getProjectGanttData` 에 folderLinks 병렬 SELECT + `content.folderLinks` 조립(기존 키 불변).
- [ ] `GanttFolderService.js`: `setGanttFolderLink`(가드·끝점검증·혼합순환·멱등 영속) + `deleteGanttFolder` 에 링크 cascade 1스텝.
- [ ] `GanttValidationService.js`: `detectDagCycle` **무수정**(혼합 입력 수용 확인만).
- [ ] `GanttController.js`: `setGanttFolderLink` define. `PermissionMap.js`: `setGanttFolderLink: W('PROJECT_GANTT','inherited')`. `ErrorCodes.js`: `GANTT_FOLDER_LINK_INVALID`.
- [ ] `ProjectService.deleteProjectService`: cascade 에 `deleteGanttFolderLinksByProjectRepository`(folder 보다 먼저).
- [ ] jest: setGanttFolderLink 분기 + detectDagCycle 혼합.

### Frontend (백엔드 계약 확정 후)
- [ ] **R1**: `ganttAdapter.synthesizeFolderNodes` `folderDepth` 계산 → `GanttChart` DOM 클래스 effect depth 토글 → `gantt.css` depth 팔레트(라이트/다크).
- [ ] **R2**: `ganttAdapter.unwrapGanttPayload` folderLinks 추출; `useGanttData` folderLinks 노출; `GanttPage` svarLinks 병합 + `useSetFolderLink` 배선 + onAddFolderLink/onRemoveFolderLink prop; `GanttChart` add-link/delete-link 인터셉트 분기(+ref); `useGanttFolderMutations` `useSetFolderLink` + `mapFolderLinkError`.
- [ ] i18n: kr/en `gantt.error.folderLinkInvalid` → `npm run merge`.

### 문서
- [ ] `src/resolver/gantt/GANTT.md` 에 폴더 링크(§2 관계 표에 "폴더 링크=앱 DB" 행, §3 계약, 스왑 금지·혼합 순환 정책) 반영.
```
