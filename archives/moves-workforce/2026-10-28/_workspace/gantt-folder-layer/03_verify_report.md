# 03 Verify Report — 간트 폴더 레이어 (2026-07-02)

> integration-verifier. 기준: `01_architect_design.md` §2 경계면 계약. 생산자/소비자 양쪽 동시 읽기 + 실행 검증.
> 결론: **실패 0건.** 경계면 5 resolver + read 확장 전부 글자 단위 일치. 백엔드 146/146 PASS, 프론트 빌드 성공.

---

## 통과 (검증 완료)

### 1. 경계면 교차 (resolver 응답 content ↔ 프론트 소비 경로)

| resolver | 생산자(백엔드 content) | 소비자(프론트) | 판정 |
|----------|----------------------|--------------|------|
| `createGanttFolder` | `GanttFolderService.js:93` `{ content:{ folder:{id,name,parentFolderId,sortOrder} } }` | `useGanttFolderMutations.js:66` (미소비, invalidate) | 일치 |
| `renameGanttFolder` | `:114` `{ content:{ folderId, name } }` | `:81` (미소비) | 일치 |
| `moveGanttFolder` | `:139` `{ content:{ folderId, parentFolderId } }` | `:92` (미소비) | 일치 |
| `deleteGanttFolder` | `:174` `{ content:{ folderId, reparentedTo, movedIssueKeys, movedFolderIds } }` | `:107` (미소비) | 일치 |
| `setGanttIssueFolder` | `:199` `{ content:{ issueKey, folderId } }` | `:118` (미소비) | 일치 |
| `getProjectGanttData`(확장) | `GanttService.js:105-118` `content.folders[]`+`content.folderIssues{}` | `useGanttData.js:36` → `unwrapGanttPayload`(`ganttAdapter.js:84-89`) | 일치 |

- 등록: `GanttController.js:40-58` 5종 `resolver.define` 추가, `index.js` 무변경(기존 `registerGanttController` 재사용) — 설계 §3-6 준수.
- invoke 실패 분기: `useGanttFolderMutations.js:37-45` `result.success!==true` → `err.cause=result.error` throw → `onError`에서 `mapFolderError(t, err.cause?.code)`. `useGanttData.js:48` `success:false`도 isError 처리. 정상.
- 응답 접근 경로: `invokeFolder`가 `result.content ?? result` unwrap. read는 `unwrapGanttPayload`가 `result.content ?? result`. 일관.
- 쿼리키: 신규 없음, `ganttKeys.data(projectId)` 재사용(`useGanttData.js:24`, mutation invalidate `:54`). 인라인 배열 아님. 정상.
- **에러코드 GANTT_FOLDER_NAME_TOO_LONG**(설계 §3-5 목록 외 백엔드 신설): `ErrorCodes.js:56` 정의 → `GanttFolderService.js:37` throw → `mapFolderError:27` → `gantt.error.folderNameTooLong` 매핑 → kr/en `gantt.json:49` 키 존재 → merge 반영(`ko-KR.json:444`/`en-US.json:443`). **전 구간 정합.**

### 2. 어댑터 합성 로직 (`ganttAdapter.js`)
- (a) open 함정: 폴더 `node.open`은 `hasRenderedChildren`(직속 이슈 OR 하위폴더 존재, `:329-331,351`)일 때만 부여. 빈 폴더/자식 전무 → open 미부여 → SVAR `null.forEach` 크래시 회피. 이슈 노드 open도 기존 `hasChildren`(`:202`) 그대로. 준수.
- (b) 이슈 부모 우선순위(`:163-170`): effectiveParent(idSet 내) > `validFolderIssues`(존재 폴더만) > 루트(0). 설계 §5-1 일치.
- (c) dangling 방어: `folderIdSet`으로 유효 folderId만 신뢰(`:109-114`), `compute` guard set 순환 방어(`:270`), `collectFolderDescendants` `!result.has` 무한루프 차단(`:405`), `flattenFolderTree`는 루트 도달 불가한 순환 폴더를 자연 배제. 준수.
- (d) 기간 롤업 min~max(`:296-299`) + MD 가중 수행율 `round(Σ(pct×w)/Σw)`, `w=originalEstimateSeconds/(rate·3600)`, MD없으면 `w=1`(`:317-326`). 설계 §6-1/§6-3 일치. (가중치 단위를 MD로 둔 것은 §6-3 "1MD 등가" 폴백을 정확히 구현 — 초 단위였다면 MD없는 leaf가 과소가중되므로 MD 단위가 정답.)
- (e) 중첩 재귀 leaf 1회: `compute` cache + 이슈 단일부모 파티션(`issueChildrenByParent`)으로 subtree leaf 중복 없음, 상위폴더는 자기 subtree 전체 leaf에 대해 1회 계산(하위폴더 progress 재평균 안 함). 준수.
- (f) 폴더 노드 편집 가드: `GanttChart.jsx` `isFolderId`(`:30`)로 4경로 전부 스킵 — add-link(`:720`)/delete-link(`:746`)/move-task(`:775`)/update-task(`:834`). `GanttParentModal.jsx:58` 부모 후보에서 `!tk.folder` 제외. 준수.

### 3. 백엔드 무결성
- `detectFolderCycle`(`GanttFolderValidationService.js`): self(`:23`) + 부모 체인 추적(`:36-46`) + `visited` 손상그래프 무한루프 차단(`:43`). 정상. jest 8 케이스 PASS.
- 삭제 승계 순차 멱등(`GanttFolderService.js:149-175`): 스냅샷 → 이슈 승계(루트=DELETE/상위=UPDATE) → 하위폴더 승계 → 폴더 DELETE. WHERE 기반 멱등, 중간 실패 후 재실행 안전. jest 12 케이스 PASS.
- cascade: `ProjectService.js:93-94` folder_issue → folder 순서(자식 먼저) 편입, `GanttFolderRepository.js:73-78` cascade 래퍼, `GanttFolderQuery.js:109-115` 프로젝트 스코프 DELETE. 정상.
- DDL/migrate: `ganttFolder.sql.js` 2테이블(VARCHAR(120)), `ddl/index.js:5` export, `migrate.js:25-26` v007/v008 enqueue. 정상.
- SQL 파라미터 정합: UPSERT 6바인딩(`GanttFolderQuery.js:96-100`) ↔ 서비스 6인자(`:197`), MAX_SORT_ORDER `<=>` null-safe(`:40`) ↔ `[projectId, parent]`(`:85`). 전부 일치.

### 4. 회귀
- Task shape 완전 동결: `GanttService.js:80` "Task shape 무변경", 폴더는 별도 `folderIssues` 맵으로 전달. tasks/links/meta 무변경. `folders:[]` 시 `toSvarTasks`는 `issueNodes` 그대로 반환(`:228`).
- 폴더 조회 best-effort(`GanttService.js:39-46`): 미마이그레이션/실패 시 `[]` 폴백, tasks/links/meta 정상 반환(무회귀 보장).
- 기존 간트(WBS/네이티브 부모/placeholder/인라인편집/필터 크래시 가드/성공 토스트) 코드 경로 무손상. `GanttMapper.test.js`/`GanttValidationService.test.js` 포함 전체 PASS.

### 5. i18n
- kr/en `gantt.json`에 `folder.*`(21키)·`toast.folder*`/`issueFolder*`(6키)·`error.folder*`(4키, folderNameTooLong 포함) 추가, 기존 toast/error 객체에 병합. merge 실행 확인: `ko-KR.json`/`en-US.json`에 반영됨. ko-KR/en-US 직접수정 아님. 모달·셀에서 참조하는 키(`gantt.folder.add/rename/addChild/move/delete/assign/none/select/hasParentHint/save/cancel/title/name/namePlaceholder/create/moveTitle/assignTitle/deleteConfirm`) 전부 존재.

### 6. 실행
- 백엔드 `npm test`: **10 suites / 146 tests PASS** (신규 GanttFolderValidationService 8 + GanttFolderService 12 포함, 기존 회귀 0).
- 프론트 `CI=false npm run build`: **성공**(Compiled — build 폴더 생성 완료). 신규/수정 코드 컴파일 에러 0.

---

## 미검증 (정적 검증만, E2E 런타임 미수행)
- 빈 폴더 노드(type='summary', open 미부여, start 없음)의 SVAR 실제 렌더 안정성 — 코드상 크래시 가드는 충족되나, 실제 브라우저에서 빈 summary 렌더는 런타임 미확인. (설계상 "리더 지시 빈 폴더 표시" + placeholder 검증 패턴 재사용이라 위험 낮음.)
- 폴더 막대/행 DOM 클래스 부착(`gantt-folder-bar`/`gantt-folder-row`, `GanttChart.jsx:418-450`)의 실런타임 `data-id`/`data-task-id` 속성명 — 프론트 리포트도 "실런타임 확인 권장"으로 명시. 정적 코드는 placeholder 패턴과 동일.

## 참고 (실패 아님)
- `GanttChart.jsx:766` `console.log('[GANTT move-task RAW]', ...)` 진단 로그 잔존 — RFC-139(간트 관계편집) 유래, 폴더 레이어와 무관. 정리 권장이나 본 기능 정합성엔 영향 없음.

---

## 종합
설계 §2 경계면 계약 대비 backend/frontend 구현이 **글자 단위로 일치**하며 재작업 필요 항목 없음. 테스트/빌드 전부 통과. E2E 런타임 검증만 후속 권장(미검증 2항목).
