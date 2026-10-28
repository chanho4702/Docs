# 02 프론트엔드 보고서 — 트리·간트 폴더 필터 + 트리 폴더 구분 UI (2026-09-30)

프론트 전용. 백엔드·manifest·조회·쿼리 키 변경 없음. 협업 모드 관련 파일은 건드리지 않았다.

## 변경 파일

| 파일 | 내용 |
|------|------|
| `static/ui/src/pages/projectDetail/work/folderFilter.js` (신규) | 순수 함수 `expandFolderSelection` · `filterByFolders` · `selectVisibleFolders` · `applyFolderFilter` · `deriveFolderOptions`, 예약값 `NO_FOLDER` |
| `static/ui/src/pages/projectDetail/work/folderFilter.test.js` (신규) | 임의 깊이, 폴더 순환·이슈 부모 고리에서 멈춤, 「폴더 없음」 단독/합집합, 빈 폴더 숨김(어댑터 출력까지), 부모 빠진 폴더 최상위 승격, 선택지 순서·깊이, `descendantCount` |
| `static/ui/src/pages/projectDetail/work/FolderFilterSelect.jsx` (신규) | 트리·간트 공용 멀티 Select. 목록은 깊이별 들여쓰기 + 폴더 아이콘, 선택칩은 이름만. 값은 id 배열 |
| `static/ui/src/pages/projectDetail/work/__test__/treeFolderRow.test.jsx` (신규) | 폴더 행 요약 문구, 처리율 없을 때, 안내선 개수, 폴더 선택지 노출 조건 |
| `static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx` | `selectedFolderIds` 상태를 셸이 소유, 트리·간트에 전달 |
| `static/ui/src/pages/projectDetail/work/ProjectTreeView.jsx` | `applyFolderFilter` 적용, 선택지 파생 |
| `static/ui/src/pages/projectDetail/work/TreeStructurePanel.jsx` | 폴더 필터, 폴더 행 강조(배경·아이콘 열림/닫힘·요약), 들여쓰기 안내선 |
| `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` | `applyFolderFilter` 적용(셸 미주입 시 로컬 state — 하위호환) |
| `static/ui/src/pages/projectDetail/gantt/GanttToolbar.jsx` | 폴더 필터 추가 |
| `static/ui/src/pages/projectDetail/gantt/ganttAdapter.js` | 폴더 노드에 `descendantCount`(롤업이 이미 쓰는 자손 작업 집합의 크기) 한 필드 추가 |
| `static/ui/src/pages/projectDetail/work/WORK_VIEWS.md` | §1-2, §2, §4-1-1(폴더 필터), §4-1-2(폴더 행·안내선), §8 i18n 갱신 |
| `locales/kr|en/gantt.json` | `gantt.filter.folder`, `gantt.filter.noFolder` |
| `locales/kr|en/projectDetail.json` | `projectDetail.work.tree.folderTaskCount` (`{count}`, `tFormat`) |
| `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 생성물 (직접 수정 안 함) |

## 결정과 이유

1. **소속 판정 = 맨 위 조상 이슈의 폴더.** `folderIssues` 는 직속 소속만 담는데, 화면에서는 폴더에 넣은 이슈의 하위 이슈도 그 폴더 아래 보인다(어댑터 규칙). 직속만 보면 폴더를 골랐을 때 하위 이슈가 사라진다. `effectiveParent` 를 따라 올라가 판정한다(고리 방어).
2. **소속은 다른 필터 전의 전체 작업 기준.** 담당자 필터가 부모를 먼저 걸러 버리면 하위 이슈의 소속을 잃기 때문 — `applyFolderFilter` 가 폴더 조건 → `filterGanttTasks` 순서를 고정한다.
3. **빈 폴더 숨김은 폴더 필터가 켜졌을 때만.** 꺼져 있을 때 빈 폴더가 보이는 종전 동작(끌어다 놓을 자리, 문서화된 사용자 결정)을 유지했다. 켜지면 선택 범위 안에서 작업이 남은 폴더와 그 조상만 남긴다.
4. **부모 폴더가 범위 밖이면 최상위로 올린다**(화면용 복사본). 없는 부모 `folder:` 를 가리키면 간트가 그릴 자리를 잃는다. 이동·삭제 모달은 원본 `folders` 를 그대로 쓴다.
5. **선택 관례**: 다른 필터처럼 멀티 선택 Select. 상태는 옵션 객체가 아니라 **id 배열**로 들어 이름 변경이 즉시 반영되게 했다. URL 에는 싣지 않는다 — 기존 공유 필터(담당자·상태·스페이스)도 화면 상태다.
6. **맵은 미적용.** 요구가 트리·간트였고 맵 필터 줄에는 폴더 선택지가 없다. 셸 상태라 맵으로 갔다 돌아와도 트리·간트의 선택은 유지된다.
7. **폴더 행 요약은 간트 롤업 값 재사용.** 처리율 = 폴더 노드 `progressPercent`(MD 가중, 간트 처리율 컬럼과 동일). 수 = `descendantCount`(어댑터가 롤업에 이미 쓰는 자손 작업 집합의 길이를 노출만 함, 하위 폴더 포함). 자손이 없으면 처리율 생략.
8. **안내선**: 행을 `position: relative` 로 두고 깊이마다 `color.border` 1px 절대 위치 선. 행 사이 간격이 없어 이어진다. 폴더 배경은 `color.background.neutral`, 선택·드롭 대상 색이 우선.

## 실행 결과

- `npm run merge` — 실행함. `ko-KR.json`/`en-US.json` 에 3개 키 반영 확인.
- `npx jest src/pages/projectDetail` — **35 suites / 528 tests 통과** (콘솔의 Atlaskit feature gate 경고는 기존 잡음).
- `CI=true npm run build` — **통과**, bundle:check 두 개 모두 예산 내(main gzip 481,801B / panel 329,459B).

## 확인 못 한 것

- 실제 Forge 화면(다크 모드 토큰 색, 안내선이 선택 행 배경 위에서 보이는 정도, SVAR 간트가 폴더 최상위 승격 데이터를 그리는 모습)은 확인하지 못했다. 로직은 어댑터 출력까지 jest 로 확인.
- 폴더 필터 중 최상위로 올린 폴더를 트리에서 「루트로 드롭」하면 화면상 부모가 이미 없어 변화 없는 드롭으로 무시될 수 있다(드문 조합이라 대응 안 함).
- `folderIssues` 가 삭제된 폴더를 가리키는 손상 데이터는 「폴더 없음」에 잡히지 않는다(어댑터는 루트로 그림). 서버 삭제가 소속도 지우므로 보류.
