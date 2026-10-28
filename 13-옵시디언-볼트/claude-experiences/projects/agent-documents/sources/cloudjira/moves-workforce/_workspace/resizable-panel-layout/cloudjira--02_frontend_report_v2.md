# 프론트엔드 구현 리포트 v2 — 접기 버튼 상단 이동 + 3개 화면 확산

> 설계서 `01_architect_design_v2.md`(delta) 기준. 백엔드·DB·권한·쿼리키 변경 **0**, 신규 의존성 **0**.
> 기준 커밋: `6c23175`(#RFC-185, v1).

## 1. 수정 파일 (전부 프론트)

| 파일 | 변경량 | 내용 |
|------|--------|------|
| `static/ui/src/components/layout/panelLayout.js` | +39 | 순수 함수 3종 추가(**기존 export 무수정**) |
| `static/ui/src/components/layout/ResizablePanels.jsx` | ±117 | 상단 바 / 레일 버튼화 / 저장 병합 / `readStored` 1회. **props 시그니처 무변경** |
| `static/ui/src/components/layout/ResizablePanels.css` | ±126 | `.rp-panel-bar`·`.rp-collapse-btn` 추가, `.rp-handle-actions`·`.rp-icon-btn` **삭제**, `.rp-rail` 을 button 기준으로 재작성 |
| `static/ui/src/components/layout/__test__/panelLayout.test.js` | +71 | 케이스 28~34 추가(총 **36**) |
| `static/ui/src/pages/projectDetail/assignment/AssignmentPage.jsx` | +23/−15 | 행 컨테이너 1곳 + import 1줄 |
| `static/ui/src/pages/projectDetail/work/ProjectTreeView.jsx` | +26/−16 | 행 컨테이너 1곳 + import 1줄 + 내부 `height` 2곳 + `splitRowStyle` 제거 |
| `static/ui/src/pages/myWork/WorklogPage.jsx` | +27/−13 | 행 컨테이너 1곳 + import 2줄 정리 |
| `locales/{kr,en}/common.json` | +1키 | `panel.collapseBlocked` |
| `locales/{kr,en}/projectDetail.json` | +2키 | `work.tree.panel.{structure,detail}` (⚠ §7 이탈 1) |
| `locales/{ko-KR,en-US}.json` | merge 산출물 | `npm run merge` 실행 |

**`ProjectAssignmentBoard.jsx` 는 diff 에 없다** (`git status` 확인) — 공개 API 를 한 글자도 바꾸지 않았으므로 v1 적용처는 무수정이다.

> ⚠ 워킹 트리에 **다른 트랙의 미커밋 변경**(`gantt/GanttChart.jsx`, `gantt/gantt.css`, `cost/CostByIssueTable.jsx` — 간트 하단 잘림, 요구 v2 §3 비목표)이 있다. 이번 작업과 무관하며 손대지 않았다.

## 2. D1 — 접기 버튼: 핸들 → 패널 상단 바

| 규격(설계 §1-2) | 구현 위치 | 상태 |
|------|-----------|------|
| 바 렌더 조건 `panels.some(collapsible)` | `ResizablePanels.jsx:236` (`showBar = hasCollapsibleAny(panels)`) | ✅ |
| 버튼 정렬 = 접히는 방향 가장자리 | `:283~285` (`justifyContent: direction === 'right' ? 'flex-end' : 'flex-start'`) | ✅ |
| 아이콘 chevron-**double** | `:2~3` import, `CollapseButton:334` / 레일 `:271~275` | ✅ |
| 방향 규칙(마지막만 right) | `panelLayout.js:90` `collapseDirection` | ✅ |
| 접을 수 없을 때 `disabled` + `collapseBlocked` 툴팁 | `CollapseButton:334~350` (`disabled={!canCollapse(...)}`) | ✅ 감추지 않는다 |
| `type="button"`, `aria-label`=collapse({name}), 아이콘 `label=""` | 동상 | ✅ |
| 핸들에서 `.rp-handle-actions`·`CollapseButton` 제거 | `:319` — 핸들 자식은 `.rp-handle-line` **하나뿐** | ✅ |
| 히트 영역 16px·pointer capture·더블클릭 리셋·키보드 ±24px | v1 코드 그대로(무수정) | ✅ |

`.rp-panel` 이 `flex-direction: column` 이 되면서 `.rp-panel-body` 는 `height:100%` → `flex:1 1 auto; min-height:0` 으로 바뀌었다(바 24px 을 뺀 나머지를 본문이 차지). 패널 내부 Card/Box 의 `height:100%` 는 그대로 동작한다.

## 3. D2 — 레일 전체 클릭

- `<button class="rp-rail">` 하나로 통합(`:266~278`). 내부는 `<span class="rp-rail-icon">`(chevron-double, **접힘 방향의 반대**) + `<span class="rp-rail-title">`(세로 제목). **중첩 버튼 0** — v1의 유효하지 않던 HTML 해소.
- 접힌 `.rp-panel` 컨테이너에 `role="group"` + `aria-label`=`collapsed({name})` (`:257~262`).
- 접힌 패널에는 상단 바를 그리지 않는다(레일이 곧 펼치기 버튼). `.rp-rail { padding-top: 4px }` 로 이웃 바 버튼과 y 정렬.

## 4. D4 — v1 잔여 2건

| 항목 | 구현 | 효과 |
|------|------|------|
| 저장 병합 | `panelLayout.js:238` `mergeStored` + `ResizablePanels.jsx:123` `persist` 가 `mergeStored(readStored(key), next)` 로 기록 | 조건부 패널(`detail`)이 화면에 없는 동안 좌우 폭을 조정해도 그 패널의 기억된 폭이 지워지지 않는다 — v1 리포트 §7-4 해소 |
| `readStored` 중복 호출 | `:77` `const [initial] = useState(() => readStored(storageKey) ?? {})` 로 마운트 시 1회 | 두 `useState` 가 같은 스냅샷을 나눠 쓴다 |

레이아웃 계산은 여전히 `normalizeWeights` 가 유령 id 를 버린다 → **계약 변화 없음**(저장은 넉넉히, 계산은 화면 기준으로 좁게).

## 5. D3 — 3개 화면 적용

### 5-A. 작업 배정 (`projectDetail/assignment/AssignmentPage.jsx`)
```diff
+import ResizablePanels, { Panel } from '../../../components/layout/ResizablePanels';
-<div style={{display:'flex', gap:16, alignItems:'stretch', height:PANEL_HEIGHT, minHeight:PANEL_MIN_HEIGHT, overflow:'hidden'}}>
-  <div style={{flex:'1 1 340px', maxWidth:440, minWidth:300, overflow:'hidden'}}>  <WorkQueuePanel …/>  </div>
-  <div style={{flex:'3 1 520px', minWidth:0, overflow:'hidden'}}>                  <CandidatePanel …/> </div>
-</div>
+<ResizablePanels storageKey="projectDetail.assignmentPanels.layout" height={PANEL_HEIGHT} minHeight={PANEL_MIN_HEIGHT}>
+  <Panel id="queue"      title={t('assignment.queue.title')}     defaultWeight={26} minWidth={300}> <WorkQueuePanel …/> </Panel>
+  <Panel id="candidates" title={t('assignment.candidate.title')} defaultWeight={74} minWidth={360}> <CandidatePanel …/> </Panel>
+</ResizablePanels>
```
`PANEL_HEIGHT`/`PANEL_MIN_HEIGHT` 상수는 파일에 그대로. `maxWidth:440` 제거.

### 5-B. 작업관리 트리 (`projectDetail/work/ProjectTreeView.jsx`)
- 행 교체(40:60, min 320/420), `storageKey="projectDetail.workTreePanels.layout"`, `height={PANEL_HEIGHT}`(`'80vh'` 상수 재사용), `minHeight={480}`.
- **설계 §7 필수 내부 수정 2건 반영**: 안쪽 `Box` 의 `height: PANEL_HEIGHT` → `height:'100%'` (2곳), `splitRowStyle` 상수 **제거**. `panelStyle`(border/radius/shadow)은 유지.
- 의도된 동작 변화: `flexWrap:'wrap'` 소멸 → 좁은 화면에서 2줄로 접히는 대신 가로 스크롤 + 접기(다른 화면과 동일 규칙).

### 5-C. My Work (`myWork/WorklogPage.jsx`)
- 행 교체(20:80, min 260/880), `storageKey="myWork.panels.layout"`, `height="calc(100vh - 127px)"`(기존 식 + 127 주석 유지), `minHeight={520}`.
- 🔴 **시각 변화가 실제로 생긴다.** 종전 `<Inline spread="space-between">` + `xcss({flex:'2'/'8'})` 는 **raw flex 값이 조용히 무시**돼 2:8 이 아니라 hug + 양끝 정렬이었다. 이번 전환으로 **코드가 원래 의도한 20:80 이 처음으로 실적용**된다 → 좌측 프로젝트 목록이 눈에 띄게 넓어진다. 릴리스 노트/수동 검증에 반드시 포함할 것. (완화: 드래그로 즉시 조정 가능하고 그 폭이 저장된다.)
- 미사용 import 정리: `Inline`·`xcss` 제거(잔여 사용처 0 확인), `Box` 는 3곳에서 계속 쓰여 유지. `CI=true` 빌드에서 미사용 import 에러 없음.
- FullCalendar 폭 갱신에 **손대지 않았다** — `CustomFullCalendar` 가 `ResizeObserver`로 `updateSize()` 를 호출하므로 layout-change 통지(전역 resize 디스패치)를 추가하지 않았다(설계 §4-C).

## 6. 무회귀 자가 점검 (설계 §4-A/B/C, 18항목)

**A 작업 배정** ① 훅 5종 호출 위치·순서 불변(파일 `:1~255` 무수정) ✅ ② `resolveQueueSelection` 자동선택 effect·`projectKeys` 정리 effect 무수정 ✅ ③ `WorkQueuePanel` 15 prop / `CandidatePanel` 17 prop 완전 동일(감싸는 `div`→`Panel` 만 교체) ✅ ④ `handleAction`→`pending` 고정, `runAssign` 4분기, **배정 후 invalidate 금지** 규약 무접촉 ✅ ⑤ `isLoading`/`isError` 조기 반환이 행보다 위 그대로 ✅ ⑥ 큐 sticky 필터 바는 Card 본문 소유라 무영향 ✅

**B 트리** ① `useGanttData`·mutation 11종·모달 6종 호출부 무수정 ✅ ② `TreeStructurePanel`/`TreeDetailPanel` prop 완전 동일 ✅ ③ DnD 4경로·`resolveTreeDrop`·드롭존 렌더 조건 무접촉(핸들은 gutter 위 pointer 이벤트만 잡는다) ✅ ④ 셸이 내려주는 담당자·상태·프로젝트 필터 prop 경로 불변(tree↔gantt 공유 유지) ✅ ⑤ 조기 반환 위치 그대로 ✅ ⑥ lazy/Suspense 경계 무접촉(`ResizablePanels` 는 정적 import) ✅

**C My Work** ① 훅 4종 + 모듈 top-level `view.getContext()` 무접촉 ✅ ② `MyProjectList`/`ViewModeToggle`/`MyIssueTable`/`CustomFullCalendar` prop·`calendarRef` 경로 완전 동일 ✅ ③ 캘린더 상호작용 4종과 `executeRequest('updateWorklog')`·`revert()` 분기 무변경 ✅ ④ 모달 2종·`invalidateQueries` 3키 무변경 ✅ ⑤ `MyLogSummary` 는 행 **바깥** 그대로(127 전제 유지) ✅ ⑥ `viewMode` 전환은 패널 상태와 독립 ✅

**공통**: `cloneElement` 0건(`Panel` 은 `<>{children}</>` 만 반환), 각 화면 diff 는 "행 컨테이너 1곳 + import 1~2줄"(트리만 설계가 지시한 내부 `height` 2곳 + 상수 제거 추가).

## 7. 테스트 · 빌드 · 번들

| 항목 | 명령 | 결과 |
|------|------|------|
| 레이아웃 단위 | `npx jest src/components/layout` | **36 passed** (v1 27 + delta 28~34) |
| 프론트 전량 | `cd static/ui && npm test` | **70 suites / 1200 tests passed** (v1 1191 대비 +9) |
| CI 빌드 | `CI=true npm run build` | **성공**(신규 lint 경고 0. node_modules source-map 경고는 기존) |
| 번들 예산 | `bundle:check` | `gzip 897,532 / 950,000` → **withinBudget: true** (v1 895,179 대비 **+2,353B**, 설계 예상 ~2KB 부합) |

추가 임시 검증(렌더 테스트는 커밋하지 않음, 설계 §6 준수 — 1회 실행 후 삭제):
핸들 내 버튼 0개 / 바 3개의 `justify-content` = `[flex-start, flex-start, flex-end]` / 접기 시 `role="group"`+`button.rp-rail`(중첩 버튼 0) / 마지막 펼침 패널 버튼 `disabled`+`collapseBlocked` 툴팁 / 레일 제목 span 클릭으로 펼침 / 접어도 children 3개 모두 마운트 유지 / localStorage 병합 저장 — **전부 통과**.

## 8. 설계 대비 이탈

1. **트리 레일 제목 키를 `work.tree.panel.{structure,detail}` 로 넣었다**(설계 §5 는 `work.tree.{structure,detail}`). 이유: `projectDetail.work.tree.detail` 이 **이미 객체 네임스페이스**(`tree.detail.childCount` 등 40여 키)라 같은 자리에 문자열을 넣으면 그 하위 키가 전부 사라진다. 설계의 "기존 키 확인 후 결정" 지시에 따라 한 단계(`panel`)를 추가했고, 테스트가 `tree.detail` 이 객체로 남아 있는지도 함께 검사한다.
2. **`collapsible:false` 패널에도 빈 상단 바를 그린다**(버튼만 생략). 바 높이가 패널마다 달라지면 본문 상단이 어긋난다 — 설계 §1-2의 "바 렌더 조건은 행 단위" 규칙을 그대로 따른 결과다.
3. **테스트 수가 34가 아니라 36**이다. 설계의 28~34를 전부 구현하되 `collapseDirection` 3케이스·`hasCollapsibleAny`·`mergeStored` 2케이스·트리 키 2케이스로 세분화했다(케이스 누락 없음).

## 9. 수동 검증 남은 것 (E2E 별건)

- 공통: 상단 바 접기/펼치기, 레일 아무 곳 클릭, 마지막 패널 `disabled`+툴팁, **핸들에 버튼이 없어진 것**, 드래그·더블클릭 리셋·최소폭 정지, 다크 테마.
- v1 배정 화면: 바 24px 이 생긴 뒤 3패널 카드 높이·내부 스크롤, **저장된 v1 레이아웃 그대로 복원**(저장 shape 무변경).
- A: 큐 sticky 필터 바, 후보 테이블, 배정/해제 실행.
- B: **80vh 가 한 번만 적용**(패널이 두 배로 길어지지 않음), DnD 4경로, 폴더 모달, tree↔gantt 필터 유지.
- C: **좌측 폭이 20:80 으로 바뀐 것**, 캘린더 폭 변경 후 날짜 칸 재계산(ResizeObserver), 표 뷰 전환, 워크로그 드래그.

---

# v3 — 접기 버튼을 카드 안으로

> 사용자 피드백: **"버튼은 카드 안에 넣어줘"**. v2 의 패널 위 24px 바(`.rp-panel-bar`)를 없애고,
> 버튼의 렌더 위치 주도권을 호출부로 넘겼다. 기존 props 계약은 무변경 — **export 추가만**.

## v3-1. 공용 컴포넌트 변경 (`components/layout/`)

| 변경 | 위치 |
|------|------|
| 행 컨텍스트 2종 신설 — `PanelsContext`(접힘 상태·toggle·canCollapse·direction·hasCollapsible), `PanelIdContext`(가장 가까운 패널 id) | `ResizablePanels.jsx:31`, `:33` |
| 행 전체를 `PanelsContext.Provider` 로 감싼다(api 객체) | `:244~257`, 닫힘 `:334` |
| 패널 본문을 `PanelIdContext.Provider` 로 감싼다 → `panelId` 없이도 자기 패널을 안다 | `:303~305` |
| **상단 바 렌더 삭제** — `.rp-panel-bar` / 내부 `CollapseButton` 호출 제거 | 구 `:283~299` 삭제 |
| `PanelToggleButton` **신규 export**(default `ResizablePanels`, named `Panel`, `PanelToggleButton`) | `:353` |
| CSS: `.rp-panel-bar` 규칙 삭제, `.rp-collapse-btn` 은 카드 헤더용으로 유지(20px subtle) | `ResizablePanels.css` |

```jsx
// 호출부 사용법 — 카드 헤더 안에 직접 놓는다(주입·clone 아님)
<Card title={…} headerRight={<><SearchInput …/><PanelToggleButton panelId="projects" /></>}>
```

- `panelId` 생략 시 컨텍스트로 자기 패널을 찾는다(공용 카드 컴포넌트에 심을 때 유용).
- `<ResizablePanels>` **밖에서는 아무것도 그리지 않는다**(`return null`) — 같은 카드를 다른 화면에서 재사용해도 안전.
- `collapsible={false}` 패널에서도 렌더하지 않는다.
- **마지막 펼침 패널 처리(크롬 이슈 해결)**: `disabled` 속성 대신 **`aria-disabled` + no-op onClick**. Chrome 은 `disabled` 버튼의 `title` 툴팁을 띄우지 않아 "왜 안 되는지"를 못 알렸다. 이제 `common.panel.collapseBlocked` 툴팁이 실제로 뜬다. 스타일도 `:disabled` → `[aria-disabled='true']` 로 이동.
- 접힌 레일은 **v2 그대로 유지**(카드가 통째로 감춰지므로 레일이 유일한 UI — 전체 클릭 펼침).
- i18n **신규 키 0** — `common.panel.collapse` / `collapseBlocked` / `expand` / `collapsed` 재사용.

## v3-2. 4개 화면 배치

| 화면 | 배치 | 위치 |
|------|------|------|
| **ProjectAssignmentBoard**(카드 3) | 각 `Card headerRight` 끝. 좌=검색 뒤, 중=headerRight 신설, 우=팀 필터/일괄배정 뒤 | `:371`, `:402`, `:448` |
| **AssignmentPage**(카드 2) | 카드를 `WorkQueuePanel`/`CandidatePanel` 이 소유하므로 **`headerExtra` prop 신설**(표시 전용, 기본 `null`)로 페이지가 버튼을 내려보낸다 | 페이지 `:305`·`:332` / 패널 `WorkQueuePanel.jsx:50,77`·`CandidatePanel.jsx:40,75` |
| **ProjectTreeView**(Box 셸) | Card 가 아니라 `headerRight` 가 없다 → 셸 Box 를 `flexDirection:'column'` 으로 세우고 **버튼 한 줄만** 맨 위에 둔다(좌 패널은 좌측, 우 패널은 우측 정렬). 자식 패널은 `flex:1` 이라 남은 높이를 그대로 채운다 | `:349`, `:399` |
| **WorklogPage** | 좌 = `Card headerRight` 신설, 우 = `ViewModeToggle` 뒤 | `:364`, `:394` |

- 트리 패널 2종(`TreeStructurePanel`/`TreeDetailPanel`)은 **무수정**(3개 렌더 분기를 건드리지 않기 위해 셸에 배치).
- `WorkQueuePanel`/`CandidatePanel` 의 prop 추가는 **표시 전용 1개씩**이며 기본값이 있어 다른 호출부 영향 0. v2 무회귀 체크리스트 A③ 은 이 한 건만 의도적으로 예외다(사용자 요구가 "카드 안 배치"이므로).
- 데이터 흐름·훅·`invoke`·`invalidateQueries` 는 v3 에서도 **무변경**(diff 는 헤더 JSX 와 import 뿐).

## v3-3. 검증

| 항목 | 결과 |
|------|------|
| 임시 렌더 테스트(3항목, 실행 후 삭제) | **통과** — (a) `.rp-panel-bar` 0개 (b) 버튼이 카드 헤더 안에 있고 `panelId` 명시/컨텍스트 폴백 둘 다 동작, 접기 시 레일만 남고 children 3개 마운트 유지, 레일 클릭 펼침 (c) 마지막 펼침 패널 = `disabled:false` + `aria-disabled="true"` + `collapseBlocked` 툴팁 + 클릭 무효. 추가로 `<ResizablePanels>` 밖 렌더 시 버튼 0개 |
| 순수 함수 단위 | 36 passed (v2 그대로, 시그니처 무변경) |
| 프론트 전량 `npm test` | **70 suites / 1200 tests passed** |
| `CI=true npm run build` | **성공**(신규 lint 경고 0) |
| 번들 | `gzip 897,675 / 950,000` → **withinBudget: true** (v2 897,532 대비 +143B) |

## v3-4. 이탈 / 메모

1. `WorkQueuePanel`·`CandidatePanel` 에 `headerExtra` prop 1개씩 추가(위 사유). 그 외 prop 은 전부 동일.
2. `hasCollapsibleAny` 는 상단 바가 사라져 컴포넌트 내부에서는 쓰이지 않지만, 컨텍스트 `api.hasCollapsible` 로 노출해 둔다(호출부가 헤더 자리를 잡을지 판단할 수 있는 유일한 신호). export·테스트는 v2 그대로 유효.
3. 트리 뷰 셸이 `column` 이 되면서 버튼 줄(약 20px)만큼 패널 내부 높이가 줄어든다. 셸 높이(80vh)와 자식 `flex:1` 은 그대로라 스크롤 동작 변화는 없다.
4. 다른 트랙 미커밋 변경(gantt·cost·progress)은 **손대지 않았다**.

**수동 검증 추가분**: 4개 화면에서 카드 헤더의 접기 버튼이 검색·필터·토글과 나란히 정렬되는지, 마지막 펼침 패널 버튼에 **툴팁이 실제로 뜨는지**(v2 크롬 이슈), 트리 뷰 버튼 줄이 내용과 겹치지 않는지.
