# R1(뎁스 색상) + R2(폴더 링크) 프론트 구현 리포트 (2026-07-07)

> 설계서 `01_architect_design.md` §5·§6·§7 + 백엔드 확정 리포트 `02_backend_report.md` 계약대로 구현.
> 백엔드 응답 shape 을 **글자 그대로** 소비. 설계 이탈 없음.

## 1. 변경/생성 파일 목록

| 파일 | 변경 | 대응 설계 |
|------|------|----------|
| `static/ui/src/pages/projectDetail/gantt/ganttAdapter.js` | `synthesizeFolderNodes` 에 `folderDepth`(1-base, parentFolderId 체인, guard) 계산·부착; `unwrapGanttPayload` 에 `folderLinks`(기본 `[]`) 추출 | §5-1, §6-2 |
| `static/ui/src/pages/projectDetail/gantt/useGanttData.js` | `folderLinks` 노출 | §6-3 |
| `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` | `useSetFolderLink` 배선; svarLinks useMemo 에서 이슈 링크 + 폴더 링크(nodeIdSet 필터) 병합; `handleAddFolderLink`/`handleRemoveFolderLink`(canWrite 가드) + prop 전달 | §6-4 |
| `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` | `onAddFolderLink`/`onRemoveFolderLink` prop + ref 미러링; add-link/delete-link 인터셉트에서 `folder:` 접두 분기(기존 "무조건 스킵" 가드 대체); 폴더 DOM 클래스 useEffect 에 `gantt-folder-depth-{1|2|3}` 토글(막대·행 둘 다, 3+ 캡) | §5-2, §6-5 |
| `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js` | `useSetFolderLink`(낙관 패치 `content.folderLinks` + onError 롤백 + invalidate 금지) + `mapFolderLinkError` 추가. 기존 `invokeFolder` 재사용 | §6-6 |
| `static/ui/src/pages/projectDetail/gantt/gantt.css` | 뎁스 팔레트(§5-3 표 그대로: depth1 #5243AA→depth3+ #B3A4E8, 행 배경 라이트/다크). 기존 `.gantt-folder-bar` 폴백 유지, depth 클래스 2클래스 특이도로 오버라이드 | §5-3 |
| `locales/kr/gantt.json`·`locales/en/gantt.json` | `error.folderLinkInvalid` 1키 추가 | §7 |
| `static/ui/src/pages/projectDetail/gantt/ganttAdapter.folderLinks.test.js` | **신규** — folderDepth(뎁스/캡/손상순환 guard) + unwrapGanttPayload folderLinks + toSvarLinks 폴더 링크 단위테스트 6케이스 | §9 프론트 R1/계약 교차 |

기존 이슈 링크 경로(`useSetLink`)·move-task·update-task **무변경**. `toSvarLinks` 무수정 재사용.

## 2. 소비한 백엔드 응답 shape (글자 그대로)

### `setGanttFolderLink({ projectId, op, source, target })` → `useSetFolderLink`
```
{ success:true, content:{ op, source, target,
    link:{ id:`${source}->${target}`, source, target, type:'FS', lag:0 } } }
실패: { success:false, error:{ name, code, message, cause } }
```
- `invokeFolder` 가 `result.success !== true` 시 `err.cause = result.error` 로 throw → `onError` 에서 `err.cause.code` 로 `mapFolderLinkError` 매핑.
- 낙관 패치는 `op`/`source`/`target` 만으로 `content.folderLinks` 를 add/remove(`link.id = source->target` 동형 생성). 응답 `content.link` 자체는 소비하지 않고 낙관값이 곧 권위(invalidate 금지) — shape 정합.
- 매핑 코드: `GANTT_CYCLE_DETECTED→gantt.error.cycle`, `GANTT_SELF_REFERENCE→gantt.error.selfRef`, `GANTT_CROSS_PROJECT_REF→gantt.error.crossProject`, `GANTT_FOLDER_NOT_FOUND→gantt.error.folderNotFound`, `GANTT_FOLDER_LINK_INVALID→gantt.error.folderLinkInvalid`, default→`gantt.error.folderSaveFailed`. (앞 4개 기존 키, `folderLinkInvalid` 신규 — 백엔드 §1 error 표와 1:1.)

### `getProjectGanttData` → `unwrapGanttPayload`/`useGanttData`
```
content.folderLinks = [{ id:'folder:A->folder:B', source:'folder:A', target:'folder:B', type:'FS', lag:0 }]
```
- `source`/`target` = 네임스페이스 끝점(`folder:<uuid>` | 이슈 key). SVAR 폴더 노드 id(`folder:<uuid>`)·이슈 id 와 동일 조인키 → 별도 변환 불요.
- `Array.isArray` 가드로 best-effort 폴백(`[]`) 수용. 기존 키(tasks/links/meta/folders/folderIssues) 접근 경로 전부 불변.
- GanttPage 병합: `nodeIdSet = new Set(svarTasks.map(tk=>tk.id))` 로 폴더 링크의 양 끝점이 실제 렌더 노드일 때만 통과(dangling 방어 §6-4 D7), 이슈 링크는 기존 가시 이슈 규칙 유지. `toSvarLinks([...issue, ...folder])` 병합.

## 3. i18n merge 실행 여부

- **실행함.** `locales/kr/gantt.json`·`locales/en/gantt.json` 의 `error` 객체에 `folderLinkInvalid` 추가 → `cd static/ui && npm run merge`.
- 검증: `grep -c folderLinkInvalid locales/ko-KR.json locales/en-US.json` → 각 1건 반영 확인.
- ko-KR.json/en-US.json 직접 수정 없음. locales/script/*.json 미사용.
- (참고: build 의 prebuild 가 merge 를 자동 재실행 — 이중 반영.)

## 4. 테스트/빌드 결과

- `cd static/ui && CI=true react-scripts test --watchAll=false`: **Test Suites 7 passed, Tests 64 passed** (신규 `ganttAdapter.folderLinks.test.js` 6케이스 포함).
- `cd static/ui && npm run build`: **Compiled with warnings → "The build folder is ready to be deployed"**(성공). 경고는 전부 node_modules(@atlaskit/analytics-next-stable-react-context, marklassian)의 source-map 파싱 경고로 **사전 존재·본 변경 무관**. ComSpec 소실 징후(전체 exit 1) 없음.

## 5. 어댑터 단위테스트 판단

기존 gantt 어댑터 전용 테스트 파일이 **없어** 신설(`ganttAdapter.folderLinks.test.js`). 순수함수 `synthesizeFolderNodes`(folderDepth 뎁스/4뎁스 raw/손상순환 guard), `unwrapGanttPayload`(folderLinks 추출·기본값), `toSvarLinks`(폴더 링크 FS 동형) 커버. GanttChart DOM 클래스 토글·GanttPage 병합은 DOM/SVAR 통합 영역이라 단위테스트 제외(verifier E2E 대상).

## 6. 설계 이탈 사항

**없음.** §5-1·§5-2·§5-3(팔레트 표 값 그대로)·§6-2~§6-6·§7 계약 준수. 응답 shape 접근 경로가 백엔드 리포트와 글자 그대로 일치. 기존 이슈 링크/move-task/update-task/폴더 CRUD·소속·이동 경로 무변경.

---

## 후속 수정: 간트 성공 토스트 디바운스 집계 (2026-07-07)

사용자 피드백("드래그 중 성공 알림이 연발돼 정신없다") 대응. **순수 알림 레이어만 수정** — 낙관 업데이트/롤백/에러 매핑/mutation 로직 전부 무변경. 기존 ToastFlags(2.5초 자동제거·최대 3개) 동작도 무변경.

### 구현 형태
`GanttPage` 가 원본 `toast`(ProjectDetailPage 소유 ToastFlags 인스턴스)를 **배처 어댑터**로 감싸(`useGanttToastBatcher(toast)`) mutation 훅들에 내려준다. 배처는 `showSuccess(title, desc, meta)` 의 3번째 인자 `meta.batch=<category>` 유무로 **집계/즉시**를 분기 — 집계 대상만 quiet 2.5초 디바운스로 모았다가 1건으로 flush, 그 외 성공·모든 에러·info 는 즉시 통과. 훅 시그니처는 유지하고 **호출부 성공 토스트에 3번째 인자만 추가**(호환 — plain toast 는 3번째 인자를 무시).

배처 코어는 프레임워크 비의존 팩토리 `createGanttToastBatcher({ getToast, getT, quietMs })`(클로저+setTimeout)로 분리하고, React 어댑터 `useGanttToastBatcher` 가 이를 마운트 1회 생성(useRef, identity 안정) + 언마운트 시 `flush()`(유실 금지, 상위 소유 FlagUI 는 생존). 요약 문안 계산은 순수 함수 `buildBatchedToast(acc, t)`.

### 변경/생성 파일
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/projectDetail/gantt/ganttToastBatcher.js` | **신규** — `createGanttToastBatcher`(코어) + `useGanttToastBatcher`(React 어댑터) + `buildBatchedToast`(요약 순수함수) + 카테고리 라벨 키 맵 |
| `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` | `useGanttToastBatcher(toast)` → `batchedToast` 를 12개 mutation 훅 전부에 주입(원본 toast 대체) |
| `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` | scheduleSaved→`{batch:'schedule'}`, parentSaved/parentCleared→`{batch:'parent'}`, linkAdded/linkRemoved→`{batch:'link'}` 3번째 인자 추가 |
| `static/ui/src/pages/projectDetail/gantt/useGanttFolderMutations.js` | `useSetFolderLink` linkAdded/linkRemoved→`{batch:'link'}`; `useFolderMutation` 팩토리에 `batchCategory` 옵션 추가 → `useMoveFolder`=`folderMove`, `useSetIssueFolder`=`issueFolder`(create/rename/delete 는 미지정=즉시) |
| `locales/kr/gantt.json`·`locales/en/gantt.json` | `toast.batchSummary`(1) + `toast.batchCat.{schedule,link,parent,issueFolder,folderMove}`(5) 추가 → merge |
| `static/ui/src/pages/projectDetail/gantt/ganttToastBatcher.test.js` | **신규** — 코어 디바운스/집계/flush + buildBatchedToast 순수함수 9케이스(타이머 mock) |

### 집계/즉시 분류표
| 토스트 | i18n 키 | 분류 | 카테고리 |
|--------|---------|------|----------|
| 막대 드래그 일정 저장 | `gantt.toast.scheduleSaved` | **집계** | schedule(일정) |
| 이슈 링크 추가/삭제 | `gantt.toast.linkAdded`/`linkRemoved` | **집계** | link(연결) |
| 폴더 링크 추가/삭제 | `gantt.toast.linkAdded`/`linkRemoved` | **집계** | link(연결) |
| move-task 상위 지정/해제 | `gantt.toast.parentSaved`/`parentCleared` | **집계** | parent(상위 지정) |
| 행 드래그 폴더 소속/해제 | `gantt.toast.issueFolderSet`/`issueFolderCleared` | **집계** | issueFolder(폴더 소속) |
| 폴더 이동(드래그+모달 통일) | `gantt.toast.folderMoved` | **집계** | folderMove(폴더 이동) |
| 폴더 생성/이름변경/삭제 | `folderCreated`/`folderRenamed`/`folderDeleted` | 즉시 | — |
| 담당자/협업자/계획작업량 | `assigneeSaved`/`coworkerSaved`/`plannedMdSaved` | 즉시 | — |
| **모든 에러 토스트** | `gantt.error.*` | **즉시(집계 금지)** | — |

flush 규칙: quiet 2.5초(이벤트마다 타이머 리셋) → 1건이면 원 메시지 그대로, 2건 이상이면 제목 `common.toast.title.success` + 본문 `gantt.toast.batchSummary`("변경 N건이 저장되었습니다") + 카테고리 개수 병기(예: "변경 6건이 저장되었습니다 (일정 3 · 연결 2 · 폴더 이동 1)").

### i18n
신규 키 6개(kr/en). 순서/문안 안정성을 위해 `{n}` 치환은 JS(`replace`)로 처리(Forge i18n 인터폴레이션 비의존). `npm run merge` 실행 → ko-KR/en-US 반영 확인(`batchSummary` 각 1건). ko-KR/en-US 직접 수정 없음, locales/script/*.json 미사용.

### 테스트/빌드
- `CI=true react-scripts test --watchAll=false`: **8 suites / 73 tests passed** (신규 `ganttToastBatcher.test.js` 9케이스 포함, 기존 64 + 9).
- `npm run build`: **Compiled with warnings → 성공**. 경고는 사전 존재 node_modules source-map 파싱뿐, 변경 파일 관련 ESLint/hook 경고 0(grep 확인).
- 참고: 최초 `renderHook`(RTL 16) 기반 훅 테스트가 dual-React(RTL 은 루트 `../../node_modules`, 앱 React 는 `static/ui/node_modules`)로 dispatcher null 크래시 → 배처를 프레임워크 비의존 코어로 분리해 `renderHook` 없이 코어를 직접 구동하는 방식으로 전환(더 견고). 설계 정책(디바운스 2.5초·1건 원문/N건 요약·언마운트 flush·에러 즉시)은 전부 그대로 충족.
