# 02 Frontend Report — 간트 그리드 개선 (정렬 + 인라인 편집 + 계획 작업량/처리율)

작성일: 2026-07-02 · 범위: 플랜 Phase 2(CSS 정렬) + Phase 3(인라인 편집 4종 + 신규 컬럼 2종). 백엔드 additive 3필드 소비.

## 소비한 Task shape (content.tasks[] — 02_backend_report_grid_edit.md 그대로)

`invoke('getProjectGanttData')` → `result.content.tasks[]` 각 항목에서 아래 필드를 소비. 신규 3필드는 **어댑터(`toSvarTasks`)에서 svar task 로 passthrough** → 셀이 `row.*` 로 읽음:

| 계약 필드(content.tasks[]) | svar task passthrough | 소비처 |
|---|---|---|
| `issueId` (string\|null) | `row.issueId` | 협업자 write(`updateProjectIdField`)의 숫자 id 인자. null 이면 write 스킵(GanttPage 가드) |
| `originalEstimateSeconds` (number\|null) | `row.originalEstimateSeconds` | 계획 작업량 MD = `round(sec/(hourRate*3600)*10)/10`. null='-' |
| `progressPercent` (number\|null) | `row.progressPercent` | 처리율 컬럼 `${p}%` 읽기전용. null='-' |
| `assignee {accountId,displayName,avatarUrl}` | `row.assigneeObj` | 담당자 셀 read/edit |
| `coworkers[]` (Jira user) | `row.coworkers` | 협업자 셀 read/edit |
| `start`/`end` (ISO) | `row.startText`/`row.endText` | 시작일/기간 편집 |
| `type` | `row.type` | summary=시작일/기간 읽기전용 가드 |

⚠️ `progress`(0~1 막대 채움)와 `progressPercent`(그리드 %)는 별개 — 처리율 컬럼은 `progressPercent` 만 소비(막대 로직 무변경).

## 신규 파일

- `static/ui/src/pages/projectDetail/gantt/GanttGridEditCells.jsx` — 인라인 편집 셀 6종.
  - `AssigneeEditCell`(InlineEdit→ProjectIssueAssignSelect 단일), `CoworkerEditCell`(isMulti),
    `StartEditCell`, `DurationEditCell`, `PlannedMdCell`, `ProgressCell`(읽기전용).
  - 공통: `CellWrap`(onClick/onMouseDown stopPropagation→행 드래그 차단), editable=false→읽기 뷰, 값 무변경 시 write 스킵, InlineEdit hideActionButtons(+Select onBlur→onConfirm).

## 수정 파일

- `gantt.css` — Phase 2: 헤더 셀 `box-sizing:border-box !important` + 바디 셀(마지막 제외) `border-right:1px transparent` 대칭. scrollbar-gutter 폴백은 주석만.
- `ganttAdapter.js` — `toSvarTasks` svar 객체에 `issueId`/`originalEstimateSeconds`/`progressPercent` passthrough 추가(툴팁이 쓰는 기존 passthrough 무변경).
- `useGanttMutations.js` — mutation 3종 추가(+`patchTask` 헬퍼, `executeRequest` import):
  - `useUpdateAssignee` — `executeRequest('assignIssue',{accountId},{issueIdOrKey})`. 낙관: task.assignee 교체(gantt shape 매핑) + 롤백 + onSettled invalidate. 성공토스트 없음, 실패 `gantt.error.saveFailed`.
  - `useUpdateCoworkers` — `invoke('updateProjectIdField',{issueId,value:accountIds[],customFieldId})`. customFieldId 는 `queryClient.getQueryData(['coworkerFieldId'])`(useGanttData 캐시 공유). 낙관: task.coworkers 교체(issueId 매칭) + 롤백 + onSettled invalidate(shape 안전망).
  - `useUpdatePlannedMd({hourRate})` — `executeRequest('updateIssue',{fields:{timetracking:{originalEstimate: md>0?`${round(md*hourRate*10)/10}h`:'0h'}}},{issueIdOrKey})`. 낙관: originalEstimateSeconds=`round(md*hourRate*3600)` + 롤백 + onSettled invalidate.
  - 시작일/기간 저장은 기존 `useUpdateSchedule` 재사용(신규 없음).
- `GanttChart.jsx` — 신규 props `projectId`/`hourRate`/`onUpdateAssignee`/`onUpdateCoworkers`/`onUpdatePlannedMd` + 콜백 ref 3종. 모듈 AssigneeCell/CoworkerCell 및 StartCell useCallback 제거 → 셀 렌더 래퍼(ref 경유) 5종으로 교체. columns: 담당자/협업자/시작일/기간 cell 교체, duration getter→cell, plannedMd(100px)/progressPercent(80px) 컬럼을 기간 뒤·setParent 앞에 추가(전부 resize:true sort:false). UserAvatar/AvatarStack import 제거(GanttGridEditCells 로 이동).
- `GanttPage.jsx` — `useQuery(['getSettingData'])` hourRate(기본 8) + 훅 3개 인스턴스 + canWrite 가드 핸들러 3종(협업자는 issueId 없으면 스킵) + GanttChart 에 props 전달.

## 셀별 편집 경로

| 컬럼 | 조건 | 편집 UI → 저장 |
|---|---|---|
| 담당자 | editable | InlineEdit→ProjectIssueAssignSelect(단일) → `onUpdateAssignee({issueKey,accountId,assigneeObj})` |
| 협업자 | editable | InlineEdit→ProjectIssueAssignSelect(isMulti) → `onUpdateCoworkers({issueId,accountIds,coworkers})` |
| 시작일 | 미일정 | '일정 설정' 버튼→GanttScheduleModal(기존 유지) |
| 시작일 | 일정 leaf | InlineEdit→DatePicker(selectProps 포털 zIndex 9999) → `onScheduleChange({issueKey,start,due:endText})` |
| 시작일 | summary/무권한 | 읽기전용(startText) |
| 기간 | leaf+일정 | InlineEdit→Textfield(number,min1) → due=start+(n-1)일(parseISODate/formatISODate) → `onScheduleChange` |
| 기간 | placeholder/summary/무권한 | 읽기전용('-' 또는 `${d}d`) |
| 계획 작업량 | editable(전 행) | InlineEdit→Textfield(number,step0.5,min0) → `onUpdatePlannedMd({issueKey,md})` |
| 처리율 | 항상 | 읽기전용 `${progressPercent}%` / null='-' |

## i18n

- `locales/kr/gantt.json` col: `plannedMd`="계획 작업량", `progress`="처리율" / `locales/en/gantt.json` col: `plannedMd`="Planned (MD)", `progress`="Progress".
- `npm run merge` 실행 완료 → ko-KR.json/en-US.json 425~426행에 반영 확인. ko-KR/en-US 직접 수정 없음.

## 회귀 방어

- 막대 드래그(M2)/링크 add·remove/상위 지정/트리 토글/placeholder 막대/GanttBarTooltip passthrough: 관련 코드 무변경. GanttBarTooltip 이 쓰는 assigneeObj/coworkers/startText/endText/duration passthrough 유지.
- 신규 컬럼은 기간 뒤·setParent 앞에만 삽입, id='text' 첫 컬럼(트리 토글) 무변경.

## 빌드 결과

- `npm run merge`: 성공(경고: package.json type 미지정 — 기존과 동일, 무해).
- `CI=false npm run build`: **성공** — "The build folder is ready to be deployed." 컴파일 에러 없음.

## 배포 확인 피드백 반영 (2026-07-02, 4건)

근거: `_workspace/편집시 화면.png` — 담당자 셀 편집 시 Select 컨트롤이 44px 행 안에서 상하 클리핑.

1. **이슈 컬럼 초기 너비 축소** — GanttChart.jsx 'text' 컬럼 width 240 → 170 (리사이즈 가능, 초기값만).
2. **헤더 텍스트 정중앙** — gantt.css: `.wx-header-wrapper .wx-cell { justify-content:center; text-align:center }` + 내부 `.wx-text { text-align:center; width:auto }`. 컬럼 align 과 무관하게 헤더 전부 중앙. 그립(.wx-grip)은 절대배치라 영향 없음.
3. **편집 시 상하 잘림 해소** —
   - (a) GanttChart.jsx cellHeight 44 → 52 (막대 행 높이도 동반 증가 허용).
   - (b) 편집 컨트롤 compact: CellWrap 에 `className="gantt-edit-cell"` 부여 → gantt.css 스코프에서 react-select control `min-height:32px` + ValueContainer/IndicatorsContainer 세로 패딩 0 + `input { height:30px }` (전역 오염 없이 해당 셀만).
4. **협업자 편집 인라인 → 모달 분리** — 신규 `GanttCoworkerModal.jsx`(GanttParentModal 패턴/CommonModal 재사용): ProjectIssueAssignSelect isMulti + 현재 협업자 초기값 + 저장/취소.
   - `CoworkerEditCell` 에서 InlineEdit 제거 → 읽기 뷰(AvatarStack) + editable 시 셀 클릭(cursor pointer) → 모달. 빈 값이면 '-' 대신 '협업자 지정' affordance.
   - GanttChart 에 coworkerTask 상태 + open/close/submit. 저장 → `handleCoworkerSubmit({issueId,accountIds,users})` → 기존 `onUpdateCoworkers({issueId,accountIds,coworkers:users})` 경로 재사용(useUpdateCoworkers 무변경). 모달 포털로 클리핑/높이 문제 원천 해소.
   - i18n 신규 `gantt.coworker.{set,title,select,save,cancel}` (kr/en) 추가 → `npm run merge` 재실행(ko-KR.json 471~ 반영 확인).

수정 파일(추가): `GanttChart.jsx`, `GanttGridEditCells.jsx`(CoworkerEditCell 재작성, isSameArrayElements import 제거), `gantt.css`, `locales/kr·en/gantt.json`.
신규 파일(추가): `GanttCoworkerModal.jsx`.
빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 추가 1건 — 하단 잘림)

사용자: "맨 아래 부분이 조금 짤리는데 전체 레이아웃 높이 좀 조절해줘". 원인: cellHeight 52 상향 후 고정 `height:640` 호스트에서 마지막 행/가로 스크롤바 잘림.

- `GanttChart.jsx`: 호스트 div 높이를 고정 640 → 동적 `hostHeight` state. 마운트/리사이즈 시 `hostRef.getBoundingClientRect().top` 측정 → `Math.max(400, window.innerHeight - top - 24)`. 탭 진입 직후 top≤0(레이아웃 전)이면 rAF 재시도(최대 60프레임), `window resize` 리스너로 재계산(정리 포함). Forge iframe 뷰포트 기준 innerHeight 그대로 사용.
- 마커 오버레이: 호스트 높이 변경 → `.wx-chart` 리사이즈를 기존 ResizeObserver 가 잡아 computeOverlay 재실행. 안전망으로 오버레이 setup effect 의존성에 `hostHeight` 추가.
- 빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 추가 3건 — 담당자 모달 통일/높이/하단여유)

근거: `_workspace/하단 짤리는 이슈.png`.

1. **담당자 편집 인라인 → 모달 통일** — 신규 `GanttUserModal.jsx`(단일/멀티 겸용, CommonModal 재사용). 협업자용 `GanttCoworkerModal.jsx` 는 삭제하고 GanttUserModal 로 흡수(isMulti prop).
   - `AssigneeEditCell`: InlineEdit 제거 → 읽기 뷰(UserAvatar) + editable 시 셀 클릭 → 모달(ProjectIssueAssignSelect 단일, isClearable=미배정 해제). 빈 값 affordance '담당자 지정'.
   - GanttChart: assigneeTask 상태 + open/close/submit. 모달 onSubmit `{accountIds,users}` → `handleAssigneeSubmit` 이 단일 매핑(`accountId:accountIds[0]??null`, `assigneeObj:users[0]??null`) → 기존 `useUpdateAssignee` 경로 재사용(무변경). 협업자도 동일 모달로 전환(무변경 write 경로).
   - i18n 신규 `gantt.assignee.{set,title,select,save,cancel}` (kr/en) → merge(ko-KR.json 478~ 반영 확인).
2. **담당자/협업자 읽기 뷰 높이 통일** — 두 셀 래퍼에 공통 클래스 `gantt-user-cell` → gantt.css 스코프에서 `display:flex; align-items:center; height:100%; line-height:1` + AvatarItem 세로 패딩 0. 아바타는 양쪽 24px(size=small). UserAvatar/AvatarStack 공용 컴포넌트 무수정.
3. **하단 여유 상향** — 동적 높이 하단 마진 24 → 60px (`window.innerHeight - top - 60`). 마지막 행+가로 스크롤바 온전히 노출.

수정 파일(추가): `GanttChart.jsx`, `GanttGridEditCells.jsx`(Assignee/Coworker 셀 read+click 모달화, CellWrap className 병합), `gantt.css`, `locales/kr·en/gantt.json`.
신규: `GanttUserModal.jsx` / 삭제: `GanttCoworkerModal.jsx`.
빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 추가 2건 — 툴팁/막대색)

1. **막대 hover 툴팁에 계획 작업량·처리율 행 추가** — `GanttBarTooltip`(GanttChart.jsx)에 hourRate prop 전달 후 rows 에 계획 작업량(`originalEstimateSeconds`→`round(s/(hourRate*3600)*10)/10 MD`, null='-')·처리율(`progressPercent`+'%', null='-') 2행 추가. 라벨은 기존 `gantt.col.plannedMd`/`gantt.col.progress` 재사용(신규 키 없음). passthrough 필드는 svar task 에 이미 존재.
2. **막대·진행도 색 대비 개선** — gantt.css `.gantt-svar-host` + `.gantt-svar-host .wx-willow-theme`(테마 요소 자체에 걸어 willow 기본 변수 오버라이드)에서 SVAR CSS 변수 교체: task `--wx-gantt-task-color:#4c9aff` / 진행 채움 `--wx-gantt-task-fill-color:#0747a6`(명도차 확대) / summary 그린(#00875a·#006644) / milestone 퍼플(#6554c0) / 글자색 #fff 유지. placeholder 회색 점선(.gantt-placeholder-bar) 규칙은 더 구체적 !important 라 무영향(확인). 변수 미반영 관측 시 대비 막대 요소 직접 !important 폴백을 주석으로 문서화.
- 빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 추가 2건 — click-outside / grab-to-pan)

1. **인라인 편집 바깥 클릭 종료(취소)** — 기간(DurationEditCell)·계획 작업량(PlannedMdCell)이 Textfield blur 미발생(SVAR)으로 다른 영역 클릭 시 안 닫히던 문제.
   - `GanttGridEditCells.jsx` 공용 훅 `useOutsideCancel(active, wrapRef, onOutside)`: 편집 중 `document.addEventListener('pointerdown', h, true)`(capture) → 셀 래퍼(ref) 바깥이면 종료. capture 라 SVAR stopPropagation/preventDefault 무관하게 잡힘. active 토글 시에만 재등록.
   - 두 셀을 controlled InlineEdit(`isEditing`/`onEditRequested`/`onCancel`)로 전환. 바깥 클릭 = **취소(저장 안 함)** — `cancelling` 플래그로 blur-confirm 오발동 시 저장 스킵, `onEditRequested`에서 플래그 리셋. Enter/기존 confirm 경로는 유지. 셀 간 이동: 새 셀 클릭 시 pointerdown(capture) 이 먼저 돌아 기존 편집 취소 후 새 편집 오픈.
   - StartEditCell(DatePicker)은 body 포털 클리핑 오인 리스크로 이번 범위 제외(기존 유지).
2. **차트 드래그 패닝(grab-to-pan)** — 가로 스크롤바가 하단에만 있어 불편.
   - `GanttChart.jsx` 신규 effect: `.wx-chart`(가로 스크롤러)에 pointerdown/move/up 리스너. 인터랙티브 요소(`[data-task-id], .wx-bar, .wx-link(s), .wx-grip, .wx-resizer, .wx-scale, input, button`) 위에서는 패닝 미시작(SVAR 막대 드래그/링크/그립 충돌 방지). 4px 임계값 전엔 클릭 간주. 패닝 시 `scrollLeft -= dx`(+ `.wx-gantt` 있으면 `scrollTop -= dy`), setPointerCapture, 커서 grab↔grabbing. rAF 로 `.wx-chart` 획득, 언마운트 시 리스너/커서 정리.
   - 마커 오버레이 syncScroll 은 scroll 이벤트 기반이라 프로그램적 scrollLeft 변경을 자동 추종(확인). Shift+휠 가로 스크롤은 브라우저 네이티브라 무개입.
- 빌드: `CI=false npm run build` **성공**.

## 회귀 수정 (2026-07-02 — 계획 작업량/기간 편집 진입 불가)

- **원인**: 직전 controlled InlineEdit 전환 시 readView 클릭 핸들러 prop 을 `onEditRequested` 로 배선. `@atlaskit/inline-edit` 실제 API(types.d.ts 확인)는 readView 클릭 핸들러가 **`onEdit`** 이고 `onEditRequested` 는 존재하지 않음 → controlled `isEditing` 이 false 로 고정돼 편집 진입 자체가 안 됨(저장은 그 다음 단계라 무의미).
- **수정**: InlineEdit 의존 제거(이미 stopPropagation/click-outside/compact 커스텀이 많아 이점 적음). DurationEditCell·PlannedMdCell 을 **자체 상태 렌더 분기**로 단순화:
  - `editing ? <Textfield value/onChange/onKeyDown> : <div onClick=enterEdit>readText</div>`.
  - (a) 셀 클릭 → `enterEdit`(현재값 세팅 + editing=true), (b) Enter → `commit`(값 파싱 후 변경 시 저장), (c) Escape/바깥 클릭 → 취소(저장 안 함). 바깥 클릭은 기존 `useOutsideCancel`(pointerdown capture) 재사용 — 진입 클릭은 리스너가 그 이후 등록되어 오판 없음.
  - 저장 경로 무변경: Duration→`onScheduleChange({issueKey,start,due})`, PlannedMd→`onSave({issueKey,md})`→useUpdatePlannedMd.
- StartEditCell(DatePicker)은 uncontrolled InlineEdit + 유효 prop `onEdit` 라 영향 없음(무수정).
- 빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 툴바 3건)

1. **레전드 제거** — GanttToolbar 의 범례(요약/작업/마일스톤 색 칩) 블록 + `LEGEND` 배열 삭제. `gantt.legend.*` i18n 키(kr/en)도 GanttToolbar 전용이라 함께 제거 + merge.
2. **담당자 필터 옵션 아바타** — GanttPage `assigneeOptions` 에 `avatarUrl: a.avatarUrl` 추가. GanttToolbar 담당자 Select 에 `formatOptionLabel`(Atlaskit Avatar xsmall 원형 + 이름) — 메뉴·선택칩 공통 적용. value 는 accountId 유지(필터 무변경).
3. **상태 필터 카테고리 라벨** — GanttPage `statusOptions` 를 `task.statusCategory` 기반으로 재조립: key dedupe, label=`statusCategory.name`(Jira 로컬라이즈) 폴백 `t('gantt.status.{key}')`(기존 키 재사용, 신규 없음), 순서 new→indeterminate→done. value=`statusCategory.key`(=기존 statusKey) → 필터 로직(statusKey 비교) 무변경.
- 빌드: `CI=false npm run build` **성공**. merge 실행(legend 키 제거 반영).

## 회귀 수정 (2026-07-02 — 담당자/상태 필터 크래시)

- **원인**: `toArray` null.forEach 크래시(SVAR gantt-store). 백엔드 `type='summary'` 는 전체 이슈 기준 판정이라, 담당자/상태 필터로 자식이 전부 걸러진 summary 가 필터 부분집합에 남으면 `open:true`+자식 0 → SVAR 가 leaf 의 null data 를 재귀하며 크래시.
- **수정**(`ganttAdapter.js` toSvarTasks): 전달받은(이미 필터된) tasks 기준으로 `parentSet = new Set(tasks.map(t=>t.effectiveParent).filter(p=>p&&idSet.has(p)))` 재계산 → `hasChildren = parentSet.has(id)`. hasChildren 일 때만 `type='summary'`(+open:true), 아니면 milestone 유지·나머지 'task' 강등(강등된 summary 는 start 있으면 일반 막대, 없으면 기존 placeholder 로직). 함정 주석 기록. "자식만 매칭"/"부모만 매칭" 케이스 모두 크래시 없음.
- **부가**: 담당자 필터 옵션 아바타 xsmall(16) → small(24) (메뉴·선택칩 공통).
- 빌드: `CI=false npm run build` **성공**.

## 배포 확인 피드백 반영 (2026-07-02, 상위 해제 버튼 + 성공 토스트)

1. **GanttParentModal "해제" 버튼** — footer 를 [해제(warning)] [취소] [저장] 구성. 해제 클릭 → `onSubmit({issueKey, parentKey:null})`(상위가 모달 닫음) = 드롭다운 "최상위" 선택과 동일 효과 원클릭. 현재 루트(`!task.parent || task.parent===0`)면 비활성. i18n `gantt.parent.clear`(해제/Clear).
2. **write 성공 토스트 6종** — 모든 간트 mutation onSuccess 에 `toast.showSuccess(t('common.toast.title.success'), 메시지)`(앱 공통 시그니처, 소문자 success 키). useSetParent=parentKey null 여부로 parentSaved/parentCleared 분기, useSetLink=variables.op 로 linkAdded/linkRemoved 분기, 나머지(schedule/assignee/coworker/plannedMd)는 단일 메시지. i18n `gantt.toast.{scheduleSaved,parentSaved,parentCleared,linkAdded,linkRemoved,assigneeSaved,coworkerSaved,plannedMdSaved}`(기존 linkSaved 제거, 미참조 확인). 기존 "R3 무토스트" 주석도 갱신.
- 빌드: `CI=false npm run build` **성공**, merge 실행.

## 배포 확인 피드백 반영 (2026-07-02, 상위 변경 낙관적 반응성)

- **원인**: `useSetParent` 가 낙관(onMutate) 미적용 → 서버 왕복(setGanttParent=이슈 전체 페치 수 초) 후에야 화면 반영(드래그·모달 양쪽).
- **수정**(`useGanttMutations.js` useSetParent):
  1. `onMutate` 낙관 패치 추가: cancelQueries + prev 스냅샷, 대상 task 의 `wbsParent=parentKey`, `effectiveParent`= parentKey 있으면 그대로 / 해제(null)면 `jiraParent`(캐시 집합 존재 시) 폴백·없으면 null 즉시 반영.
  2. **클라 사이클 가드**: parentKey 가 자기 자신이거나(effectiveParent 체인 역추적) 자신의 자손이면 낙관 패치 스킵(무효 트리 순간 노출 방지) — 서버가 최종 거부, 롤백 무해.
  3. `onError` 롤백(prev 복원) + 에러 토스트. `onSuccess` 서버 확정 패치·인덱스 지연 회피(즉시 invalidate 금지) 유지 — 낙관값과 방향 동일해 시각 변화 없음.
  4. §D-3 주석을 "낙관 + 클라 사이클 가드 + 서버 권위 확정"으로 갱신.
- **드래그 경로 확인**: GanttChart move-task intercept `mode==='child'`(L788) → `onSetParentRef.current({issueKey:id, parentKey:target})`(L813) → onSetParent → useSetParent.mutate. 정상 태움(가드로 막히는 조건 없음, no-change 스킵만). 모달 경로(handleParentSubmit L272)도 동일. before/after 재정렬은 별도 보류 상태라 무수정.
- 빌드: `CI=false npm run build` **성공**.

## 미해결/후속(리더·verifier 판단)

- DatePicker `selectProps` 포털이 설치 Atlaskit 버전에서 미동작하면 시작일 편집은 GanttScheduleModal 폴백으로 전환 필요(수동 검증 대상, 배포 후).
- InlineEdit editView 가 cellHeight 44 안에 fit 안 하면 compact/48 조정 필요(플랜 리스크 그대로, 관측 후).
- 계약 shape 은 02_backend_report_grid_edit.md 와 글자 그대로 일치 — 불일치 없음.
