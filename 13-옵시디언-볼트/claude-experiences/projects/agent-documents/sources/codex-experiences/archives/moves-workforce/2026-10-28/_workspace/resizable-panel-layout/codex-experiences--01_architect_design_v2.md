# 패널 레이아웃 v2 — 접기 버튼 상단 이동 + 3개 화면 확산 (delta 설계서)

> 기준: v1(`01_architect_design.md`) 구현·검증 완료(RFC-185, 커밋됨). **이 문서는 v1 대비 변경분만** 다룬다.
> v1에서 그대로인 것(가중치 모델·flex 재분배·pointer capture 드래그·최소폭·더블클릭 리셋·localStorage·id 키 상태)은 다시 쓰지 않는다.
> 성격: **프론트 전용**. 백엔드·DB·권한·쿼리키 변경 **0**. 실코드 확인 기준 `f6e521c` + v1 커밋.

---

## 0. delta 요약

| # | 변경 | 파일 |
|---|------|------|
| D1 | 접기 버튼을 **핸들 위 → 패널 상단 바**로 이동. 핸들은 순수 리사이즈 전용 | `ResizablePanels.jsx`, `.css`, `panelLayout.js` |
| D2 | 접힌 레일 **전체를 클릭 가능**하게(버튼화) | `ResizablePanels.jsx`, `.css` |
| D3 | 확산 3개 화면 적용 | `AssignmentPage.jsx`, `ProjectTreeView.jsx`, `WorklogPage.jsx` |
| D4 | v1 검증 리포트 §4-1#4·§4-2 잔여 2건 해소(저장 병합 / `readStored` 중복 호출) | `ResizablePanels.jsx`, `panelLayout.js` |
| D5 | i18n 1키 추가 | `locales/{kr,en}/common.json` |

**공개 API(`ResizablePanels`/`Panel` props)는 한 글자도 바뀌지 않는다** → v1 적용처(`ProjectAssignmentBoard.jsx`)는 **수정 불필요**. 요구 §1의 "API 변화 시 동시 갱신" 조건은 **API를 안 바꾸는 것으로** 충족한다(§2-4에 그럼에도 배정 화면에 생기는 시각 변화 1건을 명시).

---

## 1. D1 — 접기 버튼: 핸들 → 패널 상단 바

### 1-1. 왜 상단 바인가 (다른 안을 버린 이유)

실코드를 보고 정한다. 4개 화면의 패널 껍데기가 **두 종류**다.

| 화면 | 패널 껍데기 | 헤더 우측(`headerRight`) 점유물 |
|------|------------|--------------------------------|
| 자원관리 배정(v1) | `Card` | `SearchInput`(좌) / 없음(중) / `PeopleTeamFilter`+팀전체배정 버튼(우) |
| 프로젝트 상세 작업 배정 | `Card` (`WorkQueuePanel:65`, `CandidatePanel:91`) | `SearchInput` / `SearchInput`+전사풀 `Toggle` |
| 작업관리 트리 | **`Box` + `panelStyle`** (`ProjectTreeView:328·369`) — Card 아님, 헤더 개념 자체가 없음 | — |
| My Work | `Card` | 없음 / `ViewModeToggle` |

- **각 패널 우상단 아이콘(절대배치)** → 위 표의 `headerRight` 4곳과 정면 충돌한다. 특히 `CandidatePanel` 은 검색+토글로 헤더 우측이 이미 꽉 찼다. **기각.**
- **Card `headerRight` 에 주입** → 트리 뷰는 Card 가 아니라 주입할 자리가 없고, 주입하려면 `Panel` 이 children 을 clone 해야 한다(v1 계약 §2-2 불변식 1 위반). **기각.**
- **그룹 상단 툴바 1개(패널 칩 N개)** → 세로 공간은 아끼지만 버튼과 패널의 공간적 대응이 끊긴다("어느 게 어느 패널?"). 3패널 이상에서 특히 약하다. **기각.**
- ✅ **패널마다 그 위에 얇은 바** → Card/Box 어느 껍데기든 **바깥**에 놓이므로 충돌이 원천적으로 없고, 호출부 JSX 를 한 줄도 안 고쳐도 된다. 세로 비용은 행당 24px 한 번뿐(패널마다 쌓이지 않고 나란히 놓인다).

### 1-2. 규격

```
.rp-panel  (flex-direction: column)
 ├ .rp-panel-bar    height 24px, flex-shrink 0      ← 신규
 │   └ button.rp-collapse-btn  20×20 ghost, chevron-double-{left|right}
 └ .rp-panel-body   flex 1 1 auto, min-height 0     ← 기존
```

| 항목 | 규격 |
|------|------|
| 바 렌더 조건 | 행에 접을 수 있는 패널이 하나라도 있을 때만(`panels.some(p => p.collapsible)`). 전부 `collapsible={false}` 면 바를 그리지 않아 세로 비용 0 |
| 버튼 정렬 | **접히는 방향 쪽 가장자리**. `left` → `justify-content:flex-start`, `right` → `flex-end`. 첫 패널 버튼은 행의 맨 왼쪽, 마지막 패널 버튼은 맨 오른쪽에 놓여 **핸들에서 멀어진다**(v1 불호의 근본 원인 제거) |
| 아이콘 | `@atlaskit/icon/core/chevron-double-left` / `chevron-double-right`(설치 확인됨). 단일 chevron 은 "다음/이전"으로 읽혀 접기와 혼동된다 |
| 방향 규칙 | 마지막 패널 = `right`, 그 외 전부 = `left`(순수 함수 `collapseDirection`) |
| 접을 수 없을 때 | **버튼을 감추지 않고 `disabled`** 로 둔다. v1처럼 사라지면 바 정렬이 흔들리고 "왜 없어졌지"가 된다. `title` 은 `common.panel.collapseBlocked` |
| 접근성 | `type="button"`, `aria-label`=`title`=`common.panel.collapse`({name}), 아이콘은 `label=""` 로 중복 낭독 차단 |
| 핸들 | `.rp-handle-actions` · `CollapseButton` **삭제**. 핸들에는 `.rp-handle-line` 만 남는다 → 히트 영역 16px·pointer capture·더블클릭 리셋·키보드 ±24px 는 v1 그대로 |

### 1-3. 신규 순수 함수

| export | 시그니처 | 반환 | 규칙 |
|--------|----------|------|------|
| `collapseDirection(panels, id)` | | `'left' \| 'right'` | 마지막 패널이면 `'right'`, 그 외 `'left'`. 없는 id·빈 배열이면 `'left'` |
| `hasCollapsibleAny(panels)` | | `boolean` | `collapsible !== false` 인 패널이 1개라도 있으면 true |

`canCollapse` / `toggleCollapsed` / `resolveEdgePair` / `applyPanelResize` / `resetPair` / `normalizeWeights` / `visiblePanels` / `expandedIds` — **v1 그대로, 시그니처·동작 무변경**(v1 테스트 27케이스 전부 유효).

---

## 2. D2 — 접힌 레일 전체 클릭

- `.rp-rail` 을 `<div>`+내부 `<button>` 에서 **`<button class="rp-rail">` 하나**로 바꾼다(중첩 버튼은 유효하지 않은 HTML이었고, 40px 폭에서 24px 버튼만 눌리는 것은 접기보다 펼치기를 더 어렵게 만든다).
- 구성: `<span class="rp-rail-icon">`(chevron-double, **접힘 방향의 반대**) + `<span class="rp-rail-title">`(세로 제목, `writing-mode: vertical-rl`).
- `aria-label` = `title` = `common.panel.expand`({name}). 레일 전체가 40px × 패널높이의 히트 영역이 된다.
- 접힌 `.rp-panel` 컨테이너는 `role="group"` + `aria-label`=`common.panel.collapsed`({name}) 유지 — v1에서 `aria-label` 만 있고 role 이 없어 스크린리더에 노출되지 않던 것을 바로잡는다.
- 접힌 패널에는 바를 그리지 않는다(레일 자체가 펼치기 버튼). 레일의 chevron 이 이웃 패널의 바 버튼과 같은 y 에 오도록 `.rp-rail { padding-top: 4px }` 로 맞춘다.

---

## 3. D4 — v1 검증 잔여 2건 (선택 개선이었던 것을 이번에 흡수)

확산으로 조건부 패널을 쓰는 화면이 늘지는 않지만(§4에서 확인: 3개 화면 모두 고정 2패널), v1 검증 리포트 §4-1#4 는 배정 화면에서 실재하는 체감 결함이라 이번에 함께 정리한다.

| 항목 | 조치 |
|------|------|
| 저장 병합 | `persist` 가 기존 저장값 위에 **머지**한다 — 중간 패널(`detail`)이 없는 동안 좌우 폭을 조정해도 `detail` 의 기억된 폭이 지워지지 않는다. 순수 함수 `mergeStored(prev, next)` 로 분리해 테스트한다. 레이아웃 계산은 여전히 `normalizeWeights` 가 유령 id 를 버리므로 계약 변화 없음 |
| `readStored` 2회 호출 | 마운트 시 1회 읽어 두 `useState` 초기값에 나눠 쓴다(`const initial = readStored(storageKey)`) |

```js
// panelLayout.js (신규, 순수)
export function mergeStored(prev, next) // { weights: {...prev.weights, ...next.weights}, collapsed: 동일 }
```

---

## 4. D3 — 확산 3개 화면

**3개 모두 적용한다. 제외 없음.** 세 화면 모두 "고정 2패널 + 좌우 flex + 각자 내부 스크롤 + 고정 행 높이"라는 v1과 동일한 형태이고, 다른 분할 메커니즘(SideDrawer·react-grid-layout 등)을 쓰지 않는다.

### 4-0. 공통 원칙 (v1과 동일)

- 레이아웃만 감싼다. 훅 호출 순서·의존성 배열·자식 prop·`invoke`·`invalidateQueries`·조건부 렌더 조건 **무변경**.
- `Panel` 은 children 을 clone 하지 않는다.
- `storageKey` 는 **화면 단위**이며 **`project_id` 를 포함하지 않는다** — 레이아웃 취향은 프로젝트마다 다르지 않고, 포함하면 localStorage 항목이 프로젝트 수만큼 늘어난다.
- 기존 `maxWidth` 상한은 제거한다(v1과 같은 이유: 넓은 모니터에서 끌어도 안 넓어진다).
- 행 컨테이너의 `overflow:hidden` → `.rp-row` 의 `overflow-x:auto`(뭉개는 대신 가로 스크롤).

### 4-A. 프로젝트 상세 > 인력 > 작업 배정 (`pages/projectDetail/assignment/AssignmentPage.jsx`)

현행(`:272~325`): `display:flex; gap:16; alignItems:stretch; height:'78vh'; minHeight:480; overflow:hidden` + `flex:'1 1 340px' maxWidth:440 minWidth:300`(WorkQueuePanel) / `flex:'3 1 520px' minWidth:0`(CandidatePanel).

| Panel | id | title | defaultWeight | minWidth | collapsible |
|-------|----|-------|---------------|----------|-------------|
| 작업 큐 | `queue` | `t('assignment.queue.title')` | **26** | **300** | ✅ |
| 후보 | `candidates` | `t('assignment.candidate.title')` | **74** | **360** | ✅ |

- `storageKey="projectDetail.assignmentPanels.layout"`, `height={PANEL_HEIGHT}`(기존 상수 `'78vh'`), `minHeight={PANEL_MIN_HEIGHT}`(480) — 상수는 파일에 그대로 둔다.
- 26:74 는 현행 1:3(=25:75)에 맞춘 값. `maxWidth:440` 제거가 실효 개선.
- 교체 범위: **`:272` `<div style={{display:'flex' …}}>` ~ `:325` `</div>` 한 곳** + import 1줄. `:1~271`·`:327~350`(확인 모달·드로어) 무수정.
- 접기 소감: 후보 패널을 접으면 큐가 넓어져 이슈 요약이 덜 잘린다. 큐를 접으면 후보 테이블(이중 스코프 컬럼이 많다)이 넓어진다 — 두 방향 다 실효가 있어 **둘 다 접기 허용**.

**무회귀 체크리스트 (A)**
1. `useWorkAssignmentBoard`/`Pool`/`useAssignWorkItem`/`useJiraProjectPermissions`/`useQuery(settingKeys.detail())` 호출 위치·순서 불변
2. `resolveQueueSelection` 자동선택 `useEffect`(`:152`)와 `projectKeys` 정리 `useEffect`(`:115`) 무수정
3. `WorkQueuePanel`/`CandidatePanel` prop 각각 15개·17개 **완전 동일**(추가·삭제·개명 0)
4. `handleAction`→`pending` 고정 → `runAssign` 의 4분기(assign/unassign/addCoworker/removeCoworker) 무변경, **배정 후 invalidate 금지** 규약(`useAssignWorkItem` 의 setQueryData) 무접촉
5. `isLoading`/`isError` 조기 반환(`:231~236`)이 행보다 위에 그대로
6. 큐 필터 바의 `position:sticky`(`WorkQueuePanel:79`)가 패널 폭 변화 후에도 유지(내부 스크롤 컨테이너는 Card 본문 그대로)

### 4-B. 프로젝트 상세 > 작업관리 > 트리 뷰 (`pages/projectDetail/work/ProjectTreeView.jsx`)

현행(`:326~366`, `:368~…`): `splitRowStyle`{display:flex, gap:16, alignItems:stretch, width:100%, **flexWrap:'wrap'**} + `flex:'4 1 0' minWidth:320` / `flex:'6 1 0' minWidth:420`, 각 패널 안쪽은 `Box xcss={panelStyle}` + 인라인 `{borderRadius:10, padding:12|16, height:PANEL_HEIGHT('80vh'), display:flex, width:'100%', minWidth:0, overflow:hidden, boxSizing:'border-box'}`.

| Panel | id | title | defaultWeight | minWidth | collapsible |
|-------|----|-------|---------------|----------|-------------|
| 계층 구조 | `structure` | `t('projectDetail.work.tree.structure')` ※ | **40** | **320** | ✅ |
| 노드 상세 | `detail` | `t('projectDetail.work.tree.detail')` ※ | **60** | **420** | ✅ |

※ 두 키가 `locales/{kr,en}/projectDetail.json` 에 없으면 **레일 세로 제목 전용으로 신규 추가**한다(구현자가 `projectDetail.work.tree.*` 실재 여부를 확인 후 결정 — 있으면 재사용, 없으면 §5 표에 준해 2키 추가). 화면 본문에는 원래 제목이 없으므로 새 텍스트가 화면에 노출되는 곳은 레일뿐이다.

- `storageKey="projectDetail.workTreePanels.layout"`, `height={PANEL_HEIGHT}`(기존 `'80vh'` 상수 재사용), `minHeight={480}`.
- **필수 내부 수정 2건**(레이아웃 한정, 데이터 무관):
  1. 안쪽 `Box` 의 `height: PANEL_HEIGHT` → `height: '100%'`. 높이의 출처가 행으로 올라가므로 그대로 두면 80vh 가 두 번 걸린다.
  2. `splitRowStyle` 상수 제거(행 스타일은 `.rp-row` 가 소유). `panelStyle`(border/radius/shadow)은 **유지** — 트리 패널의 껍데기다.
- **의도된 동작 변화**: `flexWrap:'wrap'` 이 사라진다. 종전에는 아주 좁은 화면에서 두 패널이 2줄로 접혔는데, 각 패널이 80vh 라 세로가 2배가 되어 페이지 스크롤이 났다. 앞으로는 가로 스크롤 + 접기로 대응한다(다른 3개 화면과 동일 규칙).
- 트리 좌측은 **HTML5 DnD**(`draggable`/`dataTransfer`)를 쓴다. 핸들은 gutter 위 pointer 이벤트만 잡으므로 충돌하지 않는다(핸들의 `user-select:none`·`touch-action:none` 은 핸들 요소에만 걸린다).

**무회귀 체크리스트 (B)**
1. `useGanttData`·간트 mutation 훅 11종·모달 6종 호출부 무수정 (트리 전용 백엔드 없음 — `WORK_VIEWS.md` §2 원칙 유지)
2. `TreeStructurePanel`/`TreeDetailPanel` prop(각 20개/18개) 완전 동일
3. DnD 4경로(폴더→폴더 / 이슈→폴더 / 이슈→이슈 / 루트 드롭)와 `resolveTreeDrop` 무접촉, 드롭존 렌더 조건(`canWrite && dragId`) 불변
4. 셸(`ProjectWorkPanel`)이 소유한 담당자·상태·프로젝트 필터 prop 전달 경로 불변 (tree↔gantt 필터 공유 유지)
5. `isLoading`/`isError` 조기 반환(`:317~322`)이 행보다 위에 그대로
6. lazy + Suspense 경계(`ProjectWorkPanel`) 무접촉 — `ResizablePanels` 는 정적 import 이므로 새 경계가 생기지 않는다

### 4-C. My Work (`pages/myWork/WorklogPage.jsx`)

현행(`:344~`): `<Inline alignBlock="stretch" spread="space-between" space="space.200" xcss={{height:'calc(100vh - 127px)', minHeight:'520px', overflowX:'auto'}}>` + `<Box xcss={{flex:'2', minWidth:'260px', height:'100%'}}>` / `<Box xcss={{flex:'8', minWidth:'880px', height:'100%'}}>`.

| Panel | id | title | defaultWeight | minWidth | collapsible |
|-------|----|-------|---------------|----------|-------------|
| 프로젝트 | `projects` | `t('worklog.layout.project')` | **20** | **260** | ✅ |
| 작업(캘린더/표) | `main` | `t('worklog.layout.task')` | **80** | **880** | ✅ (사실상 좌측만 접게 됨) |

- `storageKey="myWork.panels.layout"`, `height="calc(100vh - 127px)"`(기존 식 그대로 — 상수 127 의 의미는 원 주석 유지), `minHeight={520}`.
- 🔴 **여기서 시각 변화가 가장 크다. 숨기지 말고 알린다.**
  `xcss({flex:'2'})` 는 **조용히 무시된다** — `xcss` 는 토큰 기반이라 raw flex 값을 버린다(`WORK_VIEWS.md` §3 이 같은 함정을 이미 경고하고 있고, `ProjectTreeView` 는 그래서 일반 `div`+인라인 flex 를 쓴다). 즉 오늘의 My Work 는 2:8 이 아니라 `Inline spread="space-between"` 에 의한 **hug + 양끝 정렬**이다. 이번 전환으로 **코드가 원래 의도한 2:8 이 실제로 적용**된다.
  → 배포 후 "My Work 좌측 폭이 달라졌다"는 반응이 나올 수 있으므로 릴리스 노트/검증 항목에 명시한다. 사용자가 드래그로 즉시 되돌릴 수 있고 그 폭이 저장된다는 점이 완화책이다.
- **FullCalendar 폭 갱신은 손댈 필요가 없다 — 실코드로 확인함.** `components/calendar/FullCalendar.jsx:28~33` 의 `CustomFullCalendar` 가 **컨테이너에 `ResizeObserver` 를 걸어 `getApi().updateSize()` 를 호출**한다. FullCalendar v6 자체는 window resize 만 듣기 때문에(`@fullcalendar/core` 내부 `handleWindowResize`, `ResizeObserver` 0건) 이 래퍼가 없었다면 드래그·접기 후 캘린더 내부 레이아웃이 낡은 채 남았을 것이다. 따라서 `ResizablePanels` 에 **layout-change 통지(window resize 디스패치 등)를 추가하지 않는다** — 전역 이벤트를 쏘는 부작용을 도입할 이유가 없다. `echarts-for-react` 도 size-sensor 로 자체 추종한다.
- `Inline` import 가 이 파일에서 더 안 쓰이면 제거한다(**`CI=true` 빌드는 미사용 import 경고를 에러로 취급**). `Box`·`xcss` 는 파일 다른 곳에서 계속 쓰이므로 남긴다 — 지우기 전에 반드시 잔여 사용처를 확인할 것.

**무회귀 체크리스트 (C)**
1. `useMyWorklogList`/`useMyWorklogSummary`/`usePublicHolidayList`/`useQuery` 호출 위치·순서 불변, `context = await view.getContext()`(모듈 top-level await) 무접촉
2. `MyProjectList` 4 prop / `ViewModeToggle` / `MyIssueTable` / `CustomFullCalendar` prop 완전 동일, `calendarRef` 전달 경로 불변
3. 캘린더 상호작용 4종(`onDateClick`/`onEventClick`/`onEventDrop`/`onDatesSetChange`)과 그 안의 `executeRequest('updateWorklog')`·`eventInfo.revert()` 분기 무변경
4. 모달 2종(`WorklogModal`/`ScheduleModal`)과 제출 후 `invalidateQueries`(`myWorkKeys.calendarWorklogsAll`/`projectWorklogsAll`/`scheduleKeys.all`) 무변경
5. `MyLogSummary`(KPI 타일)는 행 **바깥**에 그대로 — 행 안으로 끌어들이지 않는다(`calc(100vh - 127px)` 의 127 전제가 깨진다)
6. `viewMode` 전환(캘린더↔표)이 패널 접힘/폭 상태와 독립적으로 동작

### 4-D. 확산에서 제외한 것 (억지 적용 금지)

| 화면 | 제외 사유 |
|------|----------|
| 분석 리포트(이슈/인력/비용) 좌우 | 상세가 `SideDrawer`(오버레이 + 자체 폭 드래그 + 자체 `storageKey`)라 이미 다른 분할 메커니즘을 갖는다. 두 벌이 겹치면 폭 상태가 둘로 갈라진다 |
| 포트폴리오·프로젝트 대시보드 | `BentoGrid`/`react-grid-layout` — 크기를 개발 시점에 고정하거나 사용자가 타일 단위로 옮기는 별개 모델 |
| 마이페이지 좌우 2분할 | 요구 §2 목록 밖. 별건 |
| 간트 뷰 | 요구 §3 비목표(하단 잘림은 별도 트랙) |

---

## 5. i18n

`locales/kr/common.json` · `locales/en/common.json` — **1키 추가**(v1의 5키는 그대로 사용).

| 키 | kr | en | 쓰임 |
|----|----|----|------|
| `common.panel.collapseBlocked` | `마지막 패널은 접을 수 없습니다` | `The last open panel can't be collapsed` | 비활성 접기 버튼 `title` |

트리 뷰 레일 제목용 2키는 **기존 키 확인 후 없을 때만** `locales/{kr,en}/projectDetail.json` 에 추가:

| 키 | kr | en |
|----|----|----|
| `projectDetail.work.tree.structure` | `계층 구조` | `Structure` |
| `projectDetail.work.tree.detail` | `상세` | `Details` |

- 추가 후 `cd static/ui && npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지, `locales/script/*.json` 은 빈 스텁이라 넣지 말 것.
- 재사용(신규 아님): `assignment.queue.title`, `assignment.candidate.title`, `worklog.layout.project`, `worklog.layout.task`.

---

## 6. 테스트 (delta)

기존 `components/layout/__test__/panelLayout.test.js` 27케이스는 **전부 유효**(순수 함수 시그니처 무변경). 아래를 추가한다.

| # | 대상 | 케이스 |
|---|------|--------|
| 28 | `collapseDirection` | 3패널에서 `[left, left, right]` |
| 29 | `collapseDirection` | 2패널에서 `[left, right]`, 1패널이면 `right` |
| 30 | `collapseDirection` | 없는 id·빈 배열 → `'left'` (예외 대신 폴백) |
| 31 | `hasCollapsibleAny` | 전부 `collapsible:false` → `false`, 하나라도 있으면 `true`, 빈 배열 `false` |
| 32 | `mergeStored` | 저장에 없던 id 는 보존되고 새 값이 이긴다(`detail` 폭 기억 유지 = v1 §4-1#4 해소) |
| 33 | `mergeStored` | `prev` 가 `null`/비객체여도 `next` 만으로 정상 반환 |
| 34 | i18n | `common.panel.collapseBlocked` 가 kr·en 양쪽에 존재 + `common.panel.` 키 집합 동일(기존 테스트 갱신) |

- `@testing-library/react` 는 여전히 없다 — 렌더 테스트를 새로 만들지 않는다.
- 회귀 게이트: `cd static/ui && npm test`(v1 기준 70 suites / 1191 tests 전부 통과 유지) → `CI=true npm run build`(번들 예산 gzip 950KB, v1 시점 895,179). 신규 의존성 0, 신규 코드 순증 ~2KB 예상.

### 수동 검증 (E2E 별건 — 화면별)

- **공통**: 상단 바 버튼으로 접기/펼치기, 레일 아무 곳이나 클릭해서 펼치기, 마지막 패널 버튼이 `disabled` + 툴팁, 핸들에 버튼이 **없어진 것**, 드래그·더블클릭 리셋·최소폭 정지, 다크 테마.
- **v1 배정 화면**: 상단 바 24px 이 생긴 뒤에도 3패널 카드 높이·내부 스크롤 정상, 저장된 v1 레이아웃이 그대로 복원(저장 shape 무변경).
- **A 작업 배정**: 큐 sticky 필터 바, 후보 테이블 페이징, 배정/해제 실행.
- **B 트리**: 80vh 높이가 한 번만 적용(패널이 두 배로 길어지지 않음), DnD 4경로, 폴더 모달, tree↔gantt 필터 유지.
- **C My Work**: **좌측 폭이 2:8 로 바뀐 것 확인**, 캘린더 폭 변경 후 날짜 칸 재계산(ResizeObserver 동작), 표 뷰 전환, 워크로그 드래그.

---

## 7. 구현 작업 분해

### backend
없음.

### frontend
- [ ] **V1** `panelLayout.js` — `collapseDirection` / `hasCollapsibleAny` / `mergeStored` 추가(기존 export 무수정)
- [ ] **V2** `panelLayout.test.js` — 케이스 28~34 추가
- [ ] **V3** `ResizablePanels.css` — `.rp-panel-bar` / `.rp-collapse-btn`(+`:disabled`) 추가, `.rp-handle-actions`·`.rp-icon-btn` **삭제**, `.rp-rail` 을 button 기준으로 정리(`padding-top:4px`, `:hover`/`:focus-visible`)
- [ ] **V4** `ResizablePanels.jsx` — 상단 바 렌더 + `CollapseButton` 을 바로 이동(핸들에서 제거), 레일 버튼화(`role="group"`+`aria-label` 은 컨테이너에), `persist` 머지(`mergeStored`), `readStored` 1회 호출. **props 시그니처 무변경**
- [ ] **V5** `locales/{kr,en}/common.json` +1키 → (필요 시 `projectDetail.json` +2키) → `npm run merge`
- [ ] **V6** `AssignmentPage.jsx` — `:272~325` 교체(§4-A)
- [ ] **V7** `ProjectTreeView.jsx` — `:326~` 교체 + 안쪽 Box `height:'100%'` + `splitRowStyle` 제거(§4-B)
- [ ] **V8** `WorklogPage.jsx` — `:344~` 교체 + 미사용 `Inline` import 정리(§4-C)
- [ ] **V9** `npm test` → `CI=true npm run build`

### integration-verifier 인계
- 경계면 = **`ResizablePanels`/`Panel` props ↔ 4개 호출부**. props 표(v1 §2-1·2-2)가 여전히 단일 진실이며 **v2에서 바뀌지 않았다** — 바뀌었다면 그것이 결함이다.
- `ProjectAssignmentBoard.jsx` 가 diff 에 **나타나면 안 된다**(API 무변경이므로).
- 화면별 diff 는 "행 컨테이너 1곳 + import 1~2줄"을 크게 넘으면 안 된다. 넘으면 데이터 흐름을 함께 만진 것.
- §4-A/B/C 의 무회귀 체크리스트 6항목 × 3화면 = 18항목이 검증 기준.
- `cloneElement` 0건 유지 확인.
