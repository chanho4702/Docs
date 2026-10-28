# 02 Frontend Report — 간트 폴더 레이어 (2026-07-02)

> 소비 계약 원천: `02_backend_report.md` §1(글자 그대로). 아래 invoke `result.content` 접근 경로는 백엔드 실제 shape과 일치.

---

## 1. 소비하는 응답 shape (백엔드 §1 그대로)

| resolver | invoke 입력 | 소비 경로(`result.content`) |
|----------|------------|---------------------------|
| `getProjectGanttData` (확장) | `{ projectId, coworkerFieldId }` | `content.folders:[{id,name,parentFolderId,sortOrder}]`, `content.folderIssues:{ "<issueKey>":"<folderId>" }` (기존 tasks/links/meta 무변경) |
| `createGanttFolder` | `{ projectId, name, parentFolderId }` | `content.folder{ id,name,parentFolderId,sortOrder }` (소비 불필요 — invalidate 재조회) |
| `renameGanttFolder` | `{ projectId, folderId, name }` | `content{ folderId, name }` |
| `moveGanttFolder` | `{ projectId, folderId, parentFolderId }` | `content{ folderId, parentFolderId }` |
| `deleteGanttFolder` | `{ projectId, folderId }` | `content{ folderId, reparentedTo, movedIssueKeys, movedFolderIds }` (미소비 — invalidate) |
| `setGanttIssueFolder` | `{ projectId, issueKey, folderId }` | `content{ issueKey, folderId }` |

- 5종 mutation 은 응답 body 를 개별 파싱하지 않고 **성공 여부(`result.success`)만 확인** 후 `invalidateQueries(ganttKeys.data(projectId))` 로 재조회(폴더=Jira write 0 → 인덱스 지연 무관, 일반 invalidate 허용). read 확장의 `folders`/`folderIssues` 만 `unwrapGanttPayload` 로 추출해 어댑터가 소비.
- 에러 분기: `result.error.code` → `mapFolderError`. `GANTT_FOLDER_CYCLE_DETECTED`/`_NAME_REQUIRED`/`_NAME_TOO_LONG`/`_NOT_FOUND` 매핑 + default `gantt.error.folderSaveFailed`. **백엔드 신규코드 `GANTT_FOLDER_NAME_TOO_LONG` → `gantt.error.folderNameTooLong` 매핑·i18n 키 추가 완료**(백엔드 리포트 권장 반영).

## 2. 신규 파일

| 파일 | 내용 |
|------|------|
| `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js` | 5 훅(useCreateFolder/useRenameFolder/useMoveFolder/useDeleteFolder/useSetIssueFolder) + `mapFolderError` + 공통 invoke 래퍼. 성공 토스트(showSuccess) + invalidate + 실패 토스트 패턴. |
| `GanttFolderNameModal.jsx` | 생성/이름변경/하위폴더추가 공용(name 입력, maxLength 120). |
| `GanttFolderAssignModal.jsx` | 이슈→폴더 소속 지정(계층 들여쓰기 Select + "폴더 없음(루트)" sentinel + effectiveParent 보유 시 hasParentHint 경고). |
| `GanttFolderMoveModal.jsx` | 폴더 중첩 이동(self·자손 제외 + 루트 sentinel). |

## 3. 수정 파일

| 파일 | 변경 |
|------|------|
| `ganttAdapter.js` | `unwrapGanttPayload` folders/folderIssues 추출; `toSvarTasks` 폴더 옵션 수신 + 이슈 부모 폴백; `synthesizeFolderNodes`(롤업·MD가중 수행율, 순수함수) / `flattenFolderTree` / `collectFolderDescendants` 신규 export. |
| `useGanttData.js` | folders/folderIssues 노출. |
| `GanttPage.jsx` | 폴더 mutation 5종 + 모달 상태/핸들러 소유·렌더(name/assign/move/delete-confirm); `toSvarTasks` 에 folders/folderIssues/hourRate 주입; 툴바 canWrite/onAddFolder, 차트 onRequest* 배선. |
| `GanttChart.jsx` | IssueCell 폴더 분기(📁+이름); 폴더 DOM 클래스 이펙트(`gantt-folder-bar`/`gantt-folder-row`, placeholder 패턴); ParentCell 폴더행=액션 DropdownMenu(이름변경/하위추가/이동/삭제), 이슈행=상위지정+폴더지정 Dropdown; `isFolderId` 가드(update-task on-handler / move-task / add-link / delete-link). |
| `GanttGridEditCells.jsx` | Assignee/Coworker/PlannedMd 셀 `row.folder` 분기('-'·읽기전용 집계). Start/Duration/Progress 는 summary/passthrough 로 자동 처리(무수정). |
| `GanttToolbar.jsx` | canWrite 시 "폴더 추가" 버튼. |
| `GanttParentModal.jsx` | 상위 이슈 Select 옵션에 **이슈 타입 아이콘**(`formatOptionLabel`) 추가; 폴더 노드는 부모 후보에서 제외(`!tk.folder`). |
| `gantt.css` | `.gantt-folder-bar`(보라 #8777d9/채움 #403294) · `.gantt-folder-row`(연보라 배경) — placeholder `!important` 패턴 참고. 기존 트리 토글 CSS 무수정. |
| `locales/kr/gantt.json`·`locales/en/gantt.json` | `folder.*` + `toast.folder*`/`issueFolder*` + `error.folder*`(folderNameTooLong 포함) 추가. |

## 4. 폴더 노드 합성 규칙 요약 (`synthesizeFolderNodes`)

- 이슈 부모 우선순위(§5-1): **effectiveParent(집합 내) > folderIssues(존재 폴더만) > 루트(0)**. dangling folderId/issueKey 무시.
- 폴더 노드: `id='folder:<uuid>'`, `type='summary'`, `folder:true`, `parent=parentFolderId?'folder:'+..:0`, 액션용 `folderId`/`folderParentId` passthrough.
- 기간 롤업: 가시(필터 후) 자손 이슈(직속 폴더소속 + WBS 서브트리 + 하위폴더 subtree)의 **실제 스케줄** min~max(`__realStart/__realEnd`, placeholder 위치와 분리).
- 수행율(progress 0~100): 자손 **leaf 이슈** MD 가중 평균 `Σ(pct×w)/Σw`, `w=originalEstimateSeconds/(hourRate·3600)`, **MD 없으면 w=1**(§6-3 확정). leaf 없으면 progressPercent=null('-'). 계획MD 합계=leaf estimate 초 합.
- **빈 폴더도 표시**(리더 지시): 필터로 자손이 비어도 폴더 행 렌더. 단 `open:true` 는 렌더 자식(직속 이슈/하위폴더) 존재 시에만 부여 → **leaf+open 크래시 가드 준수**.
- 중첩 순환(손상 데이터) guard 집합으로 방어.

## 5. 회귀 안전

- Task shape 완전 동결 소비(기존 tasks/links/meta 경로 무변경). 폴더 미주입/`folders:[]` 시 `toSvarTasks` 는 기존과 동일(폴더 노드 0개).
- 링크/WBS/placeholder/인라인편집/필터 크래시 가드 무손상. 폴더 id 는 관계편집 4경로에서 스킵(Jira write 0).
- 쿼리키 신규 없음(`ganttKeys.data` 재사용). Zustand 무변경.

## 6. i18n merge / 빌드 결과

- `locales/kr/gantt.json`·`locales/en/gantt.json` 키 추가 → `cd static/ui && npm run merge` 실행 완료 → `ko-KR.json`/`en-US.json` 에 `gantt.folder.*`/`gantt.toast.folder*`/`gantt.error.folder*`(folderNameTooLong 포함) 반영 확인.
- `$env:CI='false'; npm run build` → **Compiled with warnings** 로 성공(경고는 node_modules 소스맵 파싱 경고뿐 — @atlaskit/marklassian, 본 변경과 무관). 신규/수정 코드 컴파일 에러 0. 기존 트리 토글 확대 CSS 무수정.

## 7. 검증자 유의점

- ParentCell 액션은 DropdownMenu(포털) — SVAR 그리드 행 이벤트 stopPropagation 처리. `data-id`(행)/`data-task-id`(막대) `:`접두 디코드 후 `folder:` 매칭으로 클래스 부착(실런타임 DOM 속성명 확인 권장).
- 어댑터 우선순위상 effectiveParent 보유 이슈는 폴더 지정이 시각 무효(모달 hasParentHint 안내). 의도된 한계(§A1).
