# 통합 정합성 검증 리포트 — R1 뎁스 색상 · R2 폴더 링크 (2026-07-07)

> 검증 방식: 생산자/소비자 **양쪽 소스 동시 읽기** + jest/build 실행. 기준 = `01_architect_design.md` §2 경계면 계약 · §9 테스트 포인트.
> 결론: **실패 0건.** 정적 교차검증·테스트·빌드 전부 통과. 브라우저 E2E 항목만 미검증(정직 분류).

---

## 요약

| 분류 | 건수 |
|------|------|
| 통과 (PASS) | 15 |
| 실패 (FAIL) | 0 |
| 미검증 (UNVERIFIED — 브라우저 E2E) | 5 |

재작업 필요 항목 없음. 백엔드/프론트 재호출 불요.

---

## 통과 (PASS)

### P1. `setGanttFolderLink` 응답 shape ↔ `useSetFolderLink` 소비 — 일치
- 생산자 `src/resolver/gantt/GanttFolderService.js:276-283`: `content = { op, source, target, link:{ id:`${source}->${target}`, source, target, type:'FS', lag:0 } }`.
- 소비자 `static/ui/.../useGanttFolderMutations.js:245-263`: 낙관 패치는 `op`/`source`/`target`만으로 `content.folderLinks`를 add/remove, `id=`${source}->${target}`` 동형 생성. `content.link` 자체는 소비 안 함(낙관값이 권위, invalidate 금지). shape 정합.
- `invokeFolder`(L63-71)가 `result.success !== true` 시 `err.cause = result.error`로 throw → onError에서 `err.cause.code` 매핑. 실패 분기 처리 정합.

### P2. `getProjectGanttData` `content.folderLinks` ↔ 어댑터/훅/페이지 병합 — 일치
- 생산자 `GanttService.js:96-98, 125`: `folderLinks = rows.filter(r=>r.source&&r.target).map(...{id,source,target,type:'FS',lag:0})`, `content.folderLinks`로 반환. 기존 키(tasks/links/meta/folders/folderIssues) 전부 불변(additive).
- 소비자 `ganttAdapter.js:93` `unwrapGanttPayload` → `Array.isArray` 가드 후 추출(best-effort `[]` 폴백). `useGanttData.js:36,43` 노출. `GanttPage.jsx:170-178` 병합.
- best-effort 폴백 대칭: 백엔드 `safeFolderRows`(GanttService.js:40-47) 실패 시 `[]`, 프론트도 `[]` 기본값. 무회귀.

### P3. 에러코드 5종 ↔ `mapFolderLinkError` ↔ i18n 키(merge 반영) — 일치
- 백엔드 실제 throw 코드: `GANTT_FOLDER_LINK_INVALID`(op·끝점·둘다이슈), `GANTT_SELF_REFERENCE`, `GANTT_FOLDER_NOT_FOUND`, `GANTT_CROSS_PROJECT_REF`, `GANTT_CYCLE_DETECTED`. `ErrorCodes.js` 전부 정의(L50-59).
- `mapFolderLinkError`(useGanttFolderMutations.js:29-44): 5코드 → `gantt.error.{cycle,selfRef,crossProject,folderNotFound,folderLinkInvalid}`, default→`folderSaveFailed`. 백엔드 error 표와 1:1.
- **merge 결과 확인**: `locales/ko-KR.json`·`locales/en-US.json` 둘 다 `error.{cycle,selfRef,crossProject,folderNotFound,folderSaveFailed,folderLinkInvalid}` + `toast.{linkAdded,linkRemoved}` 존재(ko-KR L451-468 / en-US L451-468). `folderLinkInvalid` 신규 1키 병합 반영됨(빌드 prebuild가 merge 재실행). ko-KR/en-US 직접수정 아님.

### P4. 링크 방향 — 정방향(스왑 없음) 백엔드 ↔ 프론트 낙관값 일치 (깜빡임 없음)
- 백엔드 `GanttFolderService.js:270`: `insertFolderLinkRepository([projectId, source, target, actorId])` 정방향 저장. 반환 `link.id = source->target`. 스왑 로직 없음(§8-D6 준수).
- 프론트 낙관값 `useGanttFolderMutations.js:257`: `{ id:`${source}->${target}`, source, target }` 동일 방향. 서버 확정 후 재조회 시 `getProjectGanttData`가 동일 방향 반환 → 낙관값과 일치 → 롤백/역전 깜빡임 없음.

### P5. 회귀 — 이슈↔이슈 네이티브 경로 무오염
- `GanttChart.jsx:786-791`(add-link), `816-828`(delete-link): `isFolderId(source)||isFolderId(target)` 분기. 둘 다 이슈면 기존 `onAddLinkRef`/`onRemoveLinkRef` 호출(변경 없음). 폴더 끝점만 신규 폴더 경로.
- `setGanttLink`(GanttService.js:269-335)의 네이티브 스왑 로직(`createIssueLink({ outwardKey:target, inwardKey:source })` L292) 무수정. 이슈 경로의 read 라운드트립 스왑 특성 그대로 유지.
- 기존 "폴더 무조건 스킵" 가드를 분기로 대체 — 이슈↔이슈는 동일 코드경로. 부작용 없음.

### P6. `deleteGanttFolder` 링크 정리 + `deleteProjectService` cascade 순서 — 정합
- `GanttFolderService.js:184`: 폴더 삭제 후 `deleteFolderLinksOfEndpointRepository([projectId, `folder:${folderId}`, `folder:${folderId}`])` 1스텝 추가(승계 없이 삭제, §8-D5). SQL `DELETE_FOLDER_LINKS_OF_ENDPOINT`(GanttFolderQuery.js:137-140) `(source_ref=? OR target_ref=?)` 정합.
- `ProjectService.js:96-98`: cascade 순서 `folder_link(4) → folder_issue(5) → folder(6)`. 설계 §3-7(link를 folder보다 먼저) 준수. `deleteGanttFolderLinksByProjectRepository` import·호출 정합.

### P7. `detectDagCycle` 혼합 그래프 — 폴더 끝점 오거부 없음
- `GanttFolderService.js:257-264`: `mixedKeySet = issueKeySet ∪ {folder:${f.id}}`, `mixedLinks = issueLinks ∪ existingFolderLinks`. 폴더 끝점이 keySet에 포함되므로 `detectDagCycle`(GanttValidationService.js:72-78)의 `!keySet.has(source|target)` 교차프로젝트 판정이 폴더 끝점을 오거부하지 않음.
- 폴더 존재는 step 3(`requireFolder`)에서 선검증. 이슈 끝점만 페치집합 밖이면 정당하게 `GANTT_CROSS_PROJECT_REF`. `detectDagCycle` 무수정 재사용(순수함수) — jest 5케이스 통과.

### P8. R1 depth 클래스 ↔ 빈 폴더 무충돌 + MutationObserver 루프 없음
- `GanttChart.jsx:476-499`: `folderDepthById`(3+ 캡 `Math.min(Math.max(folderDepth||1,1),3)`) → 막대·행 둘 다 `gantt-folder-depth-{1|2|3}` 토글. 비폴더는 `d===undefined`라 3클래스 전부 false(제거).
- 빈 폴더: `gantt-folder-empty-bar`(gantt.css:338-339 `visibility:hidden`)와 depth 클래스는 **다른 CSS 속성**(visibility vs background-color) → 충돌 없음. 숨김 유지.
- MutationObserver(L508-509)는 `{ childList:true, subtree:true }`만 관측(attributes 미관측). 클래스 토글이 재트리거 안 함 → 무한루프 없음.

### P9. R1 CSS 팔레트 값 — 설계 §5-3 표와 정확히 일치
- gantt.css:361-409 depth1/2/3 막대·progress·행(light/dark) 전 값이 설계표와 일치: depth1 `#5243AA`/`#403294`/row light `rgba(82,67,170,0.14)`·dark `rgba(159,143,239,0.20)`; depth2 `#8777D9`/`#6554C0`/`#5243AA`/`0.09`·`0.13`; depth3 `#B3A4E8`/`#8777D9`/`#6554C0`/`0.06`·`0.08`. 특이도 2클래스 오버라이드로 폴백(#8777d9) 이김.

### P10. 마이그레이션 v009 등록 + DDL 정합
- `migrate.js:8,29`: `CREATE_GANTT_FOLDER_LINK_TABLE` import + `.enqueue('v009_create_gantt_folder_link_table', ...)` v008 다음. `ddl/index.js` re-export 확인.
- DDL(`ganttFolder.sql.js:45-58`) 컬럼 `project_id/source_ref VARCHAR(64)/target_ref/created_id/created_at/updated_at`, PK 복합 `(project_id, source_ref, target_ref)`, INDEX 3종 ↔ SQL 상수(`GanttFolderQuery.js:120-144`) 컬럼명 `source_ref/target_ref/project_id/created_id` 정합. INSERT ON DUPLICATE 멱등.

### P11. PermissionMap 등록 (deny-by-default 회피)
- `PermissionMap.js:187`: `setGanttFolderLink: W('PROJECT_GANTT','inherited')` 등록(기존 gantt ops와 동일). `permissionMap.contract.test.js` 통과(등록집합 ↔ 맵키집합 정합). 미등록 원천거부 위험 없음.

### P12. 컨트롤러 등록 ↔ invoke fnName 일치
- `GanttController.js:62`: `guardedDefine(resolver,'setGanttFolderLink',...)`. 프론트 `invoke('setGanttFolderLink', ...)`(useGanttFolderMutations.js:246) fnName 일치. `src/index.js` 무변경(기존 `registerGanttController`에 편승) 정합.

### P13. 이슈 노드 id ↔ 폴더↔이슈 링크 nodeIdSet 매칭 — 정합 (dangling 오탈락 없음)
- `GanttMapper.js:111-112`: Task `id:issue.key, key:issue.key` → SVAR 이슈 노드 id = 이슈 key. 폴더↔이슈 링크 끝점(이슈 key) 이 `GanttPage.jsx:170-172`의 `nodeIdSet`(svar 노드 id)과 매칭. 정당한 폴더↔이슈 링크가 dangling 필터에 잘못 걸리지 않음.

### P14. 쿼리키 팩토리 사용
- `useSetFolderLink`·`useGanttData` 모두 `ganttKeys.data(projectId)`(queryKey/projectKeys) 팩토리 사용. 인라인 배열 아님. 낙관 패치/캐시 대상 키 일관.

### P15. 실행 검증 — 테스트·빌드 전부 통과
- 백엔드 `npm test`: **Test Suites 12 passed, Tests 182 passed**. (StorageService의 `console.error`는 의도된 fallback 테스트 로그 — 실패 아님.) 신규 `GanttFolderService.test.js`·`GanttValidationService.test.js` 혼합그래프 포함.
- 프론트 `react-scripts test`: **Test Suites 7 passed, Tests 64 passed**(신규 `ganttAdapter.folderLinks.test.js` 6케이스 포함).
- 프론트 `npm run build`: **성공**("The build folder is ready to be deployed"). 경고는 전부 node_modules source-map 파싱(사전존재·본 변경 무관). prebuild가 merge 자동 재실행.

---

## 실패 (FAIL)

**없음.**

---

## 미검증 (UNVERIFIED — 실기기/브라우저 E2E 불가, 추측 통과 처리 안 함)

정적 교차검증·jest·build 로는 확인 불가한 런타임 렌더/제스처 항목. 실행 환경(forge tunnel + 브라우저) 필요.

- **U1.** 실제 SVAR 드래그로 폴더→폴더 / 폴더↔이슈 링크 생성 → 새로고침 후 유지 → 삭제 왕복(§9 R2). 정적으로는 경계면 정합 확인됨, 실제 제스처→화살표 렌더는 미확인.
- **U2.** R1 depth 1/2/3+ 막대·행 배경 실제 시각 구분(라이트/다크 모드 토글 포함). CSS 값·토글 로직은 확인됨, 실제 DOM 렌더 색상은 미확인.
- **U3.** 빈 폴더(A1) 끝점 링크 — `visibility:hidden` 막대로의 화살표 시작/끝 렌더 거동(경미 이슈, 설계상 허용).
- **U4.** SVAR 무회귀 — 폴더 노드 open/leaf 크래시 없음, 폴더 막대→자손 이슈 막대 화살표(containment≠dependency) 정상 렌더.
- **U5.** 순환 시도(`GANTT_CYCLE_DETECTED`) 시 토스트 실제 노출 + 낙관 패치 롤백 화면 반영.

> 권장: `forge tunnel` + 프로젝트 간트 화면에서 U1~U5 수동 스모크 1회. 코드 경계면은 전부 정합하므로 런타임 이슈 발생 시 SVAR 렌더/제스처 계층에 국한될 것.
