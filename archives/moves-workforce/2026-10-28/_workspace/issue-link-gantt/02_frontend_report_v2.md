# 02 Frontend Report v2 — 이슈 연결 Gantt R4 (미일정 이슈 일정 편집)

작성: 2026-07-01 / 대상: R4 미일정(시작일·듀데이트 없음) 이슈 일정 편집 진입점 신설.

## 요약
미일정 이슈(`ganttAdapter.toSvarTasks`에서 `unscheduled:true` → SVAR 미일정 영역, 막대 없음)에 **좌측 그리드 "시작일" 컬럼 셀의 "일정 설정" 버튼**을 진입점으로 추가했다. 클릭 시 Atlaskit Modal(시작일/종료일 DatePicker 2개)로 편집하고, 확인 시 **기존 M2 경로(`onScheduleChange` → GanttPage.handleScheduleChange → useUpdateSchedule 낙관적 업데이트)를 100% 재사용**한다. 낙관적 업데이트가 캐시 task의 start/end를 채우면 미일정 이슈가 자동으로 막대로 전환된다. 백엔드 계약(`updateGanttSchedule {projectId,issueKey,start,due}`)·shape 변경 없음.

## 변경 파일
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/projectDetail/gantt/GanttScheduleModal.jsx` | **신규**. 시작일/종료일 DatePicker 모달. `BaseModal`(CommonModal) + `@atlaskit/form` Field + `@atlaskit/datetime-picker`. 이슈 요약(`task.text`) 헤더, 프론트 가드(start > due 저장 차단 → `gantt.schedule.invalidRange`), 필수 검증. onSubmit → `{ issueKey, start, due }`(start/due='YYYY-MM-DD'). |
| `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` | **수정**. (1) `Button`(@atlaskit/button/new)·`GanttScheduleModal` import. (2) 편집 대상 state `editorTask` + `openScheduleEditor`/`closeScheduleEditor`/`handleEditorSubmit`(콜백; handleEditorSubmit은 `onScheduleChangeRef.current`로 M2 write-back 재사용). (3) **`startText` 컬럼에 cell FC `StartCell` 부여** — 진입점. (4) return 말미에 `<GanttScheduleModal>` 조건 렌더(task별 `key={editorTask.id}`로 Form 재마운트). |
| `locales/kr/gantt.json` | `gantt.schedule.*` 키 추가. |
| `locales/en/gantt.json` | `gantt.schedule.*` 키 추가. |
| `locales/ko-KR.json` · `locales/en-US.json` | `npm run merge`로 자동 생성(직접 수정 아님). |

## 진입점 (어느 컬럼 / 어떻게)
- **좌측 그리드 "시작일" 컬럼(`id:'startText'`)** 셀을 cell FC `StartCell`로 교체.
- 분기: `row.unscheduled === true`(어댑터가 미일정 leaf에만 부여하는 정확한 플래그)일 때
  - `editable(canWrite)` → **"일정 설정" 버튼**(appearance=subtle, spacing=compact) 노출. onClick은 `e.stopPropagation()`(SVAR 행 드래그/선택 방지) 후 `openScheduleEditor(row)`.
  - `!editable` → `'-'`(읽기전용, 버튼 미노출 — R4 게이트 요구 충족).
- 일정 있는 이슈 → 기존처럼 `row.startText`(날짜 텍스트) 표시.
- 콜백 배선: `StartCell`을 `useCallback([editable, openScheduleEditor, t])`로 정의해 클로저로 `openScheduleEditor`/`editable`/`t`를 캡처. columns `useMemo` deps에 `StartCell` 포함. 편집 대상 state와 Modal은 GanttChart 레벨.

## 소비하는 응답 shape (경계면 — 변경 없음)
- write-back: `invoke('updateGanttSchedule', { projectId, issueKey, start, due })` → `result.content = { issueKey, start, due }`. `useUpdateSchedule`(무변경) 그대로 사용.
- 모달은 백엔드를 직접 호출하지 않음. `onSubmit({ issueKey, start, due })` → GanttChart `handleEditorSubmit` → prop `onScheduleChange`(GanttPage) → `useUpdateSchedule.mutate`. 계약 정합 유지(신규 invoke 없음, shape 추가 없음).

## 추가 i18n 키 (`gantt.schedule.*`)
| 키 | kr | en |
|----|----|----|
| `gantt.schedule.set` | 일정 설정 | Set schedule |
| `gantt.schedule.title` | 일정 설정 | Set schedule |
| `gantt.schedule.start` | 시작일 | Start |
| `gantt.schedule.due` | 종료일 | Due |
| `gantt.schedule.save` | 저장 | Save |
| `gantt.schedule.cancel` | 취소 | Cancel |
| `gantt.schedule.required` | 필수 입력입니다. | This field is required. |
| `gantt.schedule.invalidRange` | 시작일이 종료일보다 늦을 수 없습니다. | Start date cannot be after due date. |

> 설계서 §8은 `gantt.unscheduled.*` 네이밍을 예시했으나, 과제 프롬프트가 명시한 `gantt.schedule.*` 네이밍을 채택함.

## merge 실행 여부
- `cd static/ui && npm run merge` **실행 완료**. `locales/ko-KR.json`(line 451~)·`locales/en-US.json`에 `gantt.schedule` 블록 반영 확인.
- 빌드 prebuild가 merge를 재실행하므로 최종 산출물에도 반영됨.

## 검증 결과
- `cd static/ui && CI=false npm run build` → **성공**(The build folder is ready). 
- 1차 실패 원인: `eslint-disable ... react-hooks/exhaustive-deps` 주석이 이 프로젝트 eslint 설정에 미정의 룰이라 오류. → 해당 disable 주석 3곳 제거로 해결(룰 미구성이라 exhaustive-deps 경고 자체는 발생하지 않음). 미사용 import 없음.

## 게이트/검증 처리 (요구 4·5)
- 게이트(4): `editable` false면 "일정 설정" 버튼 미노출 → 읽기전용.
- 범위 검증(5): 모달 onSubmit 프론트 가드(`start > due` 시 저장 차단 + `invalidRange` 에러 표시). 서버 `GANTT_INVALID_DATE_RANGE`는 `useUpdateSchedule.onError`가 기존대로 토스트 처리(2중 방어). 종료일 DatePicker `minDate={startDate}`로 선택 단계에서도 유도.
- 선택 항목(6): 모달은 미일정뿐 아니라 일정 있는 이슈도 편집 가능하도록 초기값(`defStart`/`defDue`) 처리했으나, **진입점(버튼)은 R4 필수인 미일정에만 노출**(scheduled 재편집 진입 UI는 미노출 — 필요 시 후속).

## 후속/참고
- integration-verifier 1순위: `handleEditorSubmit → onScheduleChange → useUpdateSchedule`가 `{issueKey,start,due}` shape으로 백엔드 `updateGanttSchedule` 계약과 일치함(신규 경로 없음).
- SVAR cell FC가 `row.unscheduled`를 소비 — 어댑터가 미일정 leaf에만 부여하므로 summary 행에는 버튼이 뜨지 않음(의도).

---

# 추가 구현 — 상위 지정(WBS 부모) 명시적 UI + 드래그 진단 로그 (2026-07-01)

## 배경
좌측 그리드 행을 드래그해 하위로 넣는 move-task intercept가 있으나 드롭해도 하위로 안 들어감(SVAR move-task payload 가 우리 가정 mode:'child'/target/id 와 다를 가능성). (1) 확실히 동작하는 **명시적 "상위 지정" UI**를 신설하고 (2) 드래그 payload를 진단할 **원시 로그**를 추가했다. 백엔드 계약(`setGanttParent {projectId,issueKey,parentKey}`)·shape 변경 없음.

## 변경/신규 파일
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/projectDetail/gantt/GanttParentModal.jsx` | **신규**. `@atlaskit/select`로 부모 이슈 선택 모달. `BaseModal`(CommonModal) + `@atlaskit/form` Field + Select 패턴(ScheduleModal 준용). 옵션 라벨=`{key} {summary}`, **자기 자신+자손 제외**(parent 관계 BFS로 descendants 계산 — 순환 예방), **"최상위(부모 없음)" 옵션**(sentinel `__ROOT__` → parentKey=null), 현재 부모(row.parent=effectiveParent) 초기 선택. onSubmit → `{ issueKey, parentKey }`. |
| `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` | **수정**. (1) `GanttParentModal` import. (2) 상위지정 state `parentTask` + `openParentEditor`/`closeParentEditor`/`handleParentSubmit`(콜백; `onSetParentRef.current`로 M3 부모 재지정 재사용). (3) **`ParentCell` cell FC + editable일 때만 노출되는 `setParent` 컬럼 신설**(맨 우측, width 110). (4) return 말미 `<GanttParentModal>` 조건 렌더(task별 `key`로 Form 재마운트, `tasks` prop=부모 후보). (5) **move-task intercept 최상단 진단 로그** 추가. |
| `locales/kr/gantt.json` · `locales/en/gantt.json` | `gantt.parent.*` 키 추가. |
| `locales/ko-KR.json` · `locales/en-US.json` | `npm run merge`로 자동 생성(직접 수정 아님). |

## (1) "상위 지정" 진입점 위치
- 좌측 그리드 **맨 우측에 신설된 `setParent` 컬럼**(header=`gantt.parent.set`="상위 지정", width 110, center). **`editable(canWrite)=true`일 때만 컬럼 자체를 노출**(columns useMemo에서 `editable ? [col] : []`; deps에 `editable`,`ParentCell` 포함).
- 셀은 모든 행(summary/leaf 공통)에 "상위 지정" 버튼(appearance=subtle, spacing=compact). onClick은 `e.stopPropagation()`(SVAR 행 드래그/선택 방지) 후 `openParentEditor(row)`.
- 모달 확인 → `handleParentSubmit({issueKey,parentKey})` → prop `onSetParent`(GanttPage.handleSetParent) → `useSetParent.mutate` → `setGanttParent`. **드래그 경로와 동일 콜백 재사용**(신규 invoke 없음).

## (2) move-task 진단 로그 위치
- `GanttChart.jsx` `api.intercept('move-task', (payload) => { ... })` **핸들러 최상단**(editable 체크 이전):
  `console.log('[GANTT move-task RAW]', JSON.stringify(payload));`
- 주석에 "진단용 임시 — SVAR move-task payload 구조 확인 후 매핑 교정 위함 / Sentry는 error만 전송하므로 log 미전송" 명시. **기존 매핑 로직(child/before/after→newParent→onSetParent)은 그대로 유지.**

## 추가 i18n 키 (`gantt.parent.*`)
| 키 | kr | en |
|----|----|----|
| `gantt.parent.set` | 상위 지정 | Set parent |
| `gantt.parent.title` | 상위 이슈 지정 | Set parent issue |
| `gantt.parent.select` | 상위 이슈 선택 | Select parent issue |
| `gantt.parent.root` | 최상위(부모 없음) | Top level (no parent) |
| `gantt.parent.save` | 저장 | Save |
| `gantt.parent.cancel` | 취소 | Cancel |

## merge 실행 여부
- `cd static/ui && npm run merge` **실행 완료**. `locales/ko-KR.json`(L465 `"root":"최상위(부모 없음)"`)·`locales/en-US.json`(L464 `"root":"Top level (no parent)"`)에 `gantt.parent` 블록 반영 확인.

## 소비하는 응답 shape (경계면 — 변경 없음)
- `invoke('setGanttParent', { projectId, issueKey, parentKey })` → `result.content = { issueKey, parentKey, effectiveParent }`. `useSetParent`(무변경) 그대로 사용. parentKey=null=부모 해제. 순환은 서버 detectTreeCycle 차단→`GANTT_CYCLE_DETECTED` 등→`useSetParent.onError`(mapRelationError) 토스트(기존).
- 모달은 백엔드 직접 호출 없음: onSubmit → GanttChart handleParentSubmit → prop onSetParent → useSetParent.

## 빌드 결과
- `cd static/ui && CI=false npm run build` → **성공**("The build folder is ready"). 신규/수정 파일 관련 eslint 오류·미사용 import 없음. 남은 경고는 node_modules 소스맵(@atlaskit/marklassian) 사전 존재 경고뿐(무관).

---

# 추가 구현 — 컬럼 정리 + 막대 툴팁 + 아코디언 수정 + 리사이저 revert (2026-07-01)

대상: `GanttChart.jsx`(핵심), `ganttAdapter.js`, `gantt.css`, `locales/kr|en/gantt.json`. 백엔드 계약·shape 변경 없음(기존 passthrough 필드만 소비).

## 작업 1 — 실패한 커스텀 리사이저 revert
SVAR 무료빌드가 `gridWidth` prop 을 무시해 그리드가 안 줄고, 커스텀 핸들이 그리드 중앙에 떠 클릭을 방해하던 리사이저를 전부 제거.
- `<Gantt>` 의 `gridWidth={gridWidth}` prop 제거.
- `gantt-grid-resizer` 핸들 JSX 제거.
- state/핸들러 제거: `gridWidth`,`setGridWidth`,`resizeRef`,`onResizeDown/Move/Up`,`GRID_MIN`.
- 오버레이 recompute useEffect deps 에서 `gridWidth` 제거.
- `gantt.css` `.gantt-grid-resizer` 규칙 제거.
- i18n `gantt.resizer.hint` 미사용 → kr/en 에서 제거 후 merge(ko-KR/en-US 에서도 사라짐 확인).
- grep 로 잔존 참조 0 확인.

## 작업 2 — "프로젝트" 컬럼 제거
- 좌측 그리드 columns 에서 `project` 컬럼 삭제.
- `ProjectCell` 컴포넌트 + `ProjectComponent` import 제거(미사용).
- 첫 컬럼이 이슈 컬럼이 됨(작업 4 트리 토글이 여기 붙음).

## 작업 3 — 이슈 메타를 막대(bar) hover 툴팁으로
**구현 방식: 커스텀 hover 툴팁 div (이벤트 위임).**
- SVAR `<Tooltip>` 컴포넌트는 export 되어 있으나 그 스타일(`wx-tooltip`)이 **`all.css`(CDN @import → Forge CSP 차단)에만** 있고 우리가 쓰는 `style.css`(=`dist/index.css`)엔 없음(markers 가 PRO 라 안 뜨던 것과 동일 계열 한계). → 컴포넌트는 뜨더라도 위치/스타일이 깨짐 → 채택 불가.
- 대신 신규 서브컴포넌트 `GanttBarTooltip`(같은 파일): host div 에 `mousemove`/`mouseleave` 이벤트 위임 → `e.target.closest('[data-task-id]')` 로 막대만 감지(그리드 행은 `data-id` 라 자동 제외) → SVAR `setID` 인코딩(문자열 id 는 `':'` 접두) 역디코드 → id→task 조회맵에서 task 찾아 커서 좌표(position:fixed)에 툴팁 렌더.
- **리렌더 격리**: mousemove state 변경이 무거운 `<Gantt>` 로 번지지 않도록 별도 컴포넌트로 분리(툴팁만 리렌더).
- 표시 항목: 프로젝트명(`project.name`), 이슈키(`key`), 요약(`text`), 상태(`statusCategory.name`), 담당자(`assigneeObj.displayName`), 협업자 수(`coworkers.length`), 일정(`startText ~ endText`), 기간(`duration`+단위). 전부 어댑터 passthrough 필드.
- 어댑터에 `endText`(원본 ISO) passthrough 1개 추가(툴팁 일정범위용).
- CSS `.gantt-bar-tooltip*` 추가(N800 배경, pointer-events:none).

## 작업 4 — 아코디언(접기/펼치기 ▸ 토글) 수정
**원인(SVAR 소스 확인, 확정):**
- (a) SVAR 간트는 트리 토글 셀 렌더러(`$n`: `paddingLeft=($level-1)*20px` 들여쓰기 + `data-action="open-task"` ▸ 토글)를 **`id==='text'` 컬럼에만** 자동 부여한다(`react-gantt` dist 소스: `m.findIndex(c=>c.id==='text')` → 그 컬럼의 `cell` 을 `_cell` 로 옮기고 `cell=$n` 설정, `$n` 이 토글 우측에 `_cell` 을 그대로 렌더). 우리 컬럼 id 가 `project`/`key`/… 라 **어느 컬럼도 토글을 못 받아** 들여쓰기·▸ 가 아예 안 나왔음. → **해결: 이슈(첫) 컬럼 id 를 `'text'` 로 변경**(cell=IssueCell 유지, SVAR 가 IssueCell 을 `_cell` 로 옮겨 토글+들여쓰기와 함께 렌더). 커스텀 cell 이 토글을 억제한 게 아니라, 토글 대상 컬럼(id 'text')이 없던 것이 근본 원인.
- (b) 어댑터가 summary 에 **매 렌더 `open:true` 강제** → 재조회 때 접힘 상태가 풀림. → **해결: `openStateRef`(Map<id,open>) + `api.on('open-task',({id,mode})=>set)` 로 사용자 토글 기록 → GanttChart 의 `effectiveTasks` memo 가 tasks 재계산 시 그 값으로 summary 의 open 만 덮어씀.** 기록이 비면(첫 로드) 어댑터의 초기 `open:true` 존중(펼침). leaf(open undefined)는 절대 안 건드림(`null.forEach` 크래시 예방). `<Gantt tasks={effectiveTasks}>`.
- 상위 지정 자체의 트리 반영(effectiveParent) 은 어댑터 `toSvarTasks` 가 이미 `effectiveParent→parent(집합 내)` 로 매핑하고 있고 백엔드 `setGanttParent` 응답이 effectiveParent 를 갱신하므로, **부모 write 성공 후 재조회되면 자식이 summary(부모) 하위로 들어간다**(데이터 경로는 정상). 다만 실제 화면 확인(런타임)은 미수행 — id='text' 토글 노출은 소스 근거로 확정, effectiveParent 반영은 기존 계약 그대로라 백엔드 확인 불요.

## 소비하는 응답 shape (변경 없음)
- 기존 `getProjectGanttData` Task passthrough(`project/statusCategory/assignee/coworkers/start/end/summary`)만 소비. 신규 invoke·shape 추가 없음. 어댑터에 `endText` 1개 추가는 프론트 내부 표시용(백엔드 무관).

## i18n
- 추가: `gantt.tooltip.summary`(요약/Summary), `gantt.tooltip.period`(일정/Schedule). 나머지 라벨은 기존 `gantt.col.*` 재사용.
- 제거: `gantt.resizer.hint`.
- `cd static/ui && npm run merge` 실행 완료 → ko-KR/en-US 에 tooltip 반영·resizer 삭제 확인.

## 빌드 결과
- `cd static/ui && CI=false npm run build` → **성공**("The build folder is ready"). 미사용 import·미정의 eslint disable 주석 없음. 잔존 경고는 node_modules 소스맵(@atlaskit/marklassian 등) 사전 존재 경고뿐(무관).

## 남은 확인(런타임)
- id='text' 트리 토글/들여쓰기 노출, 접기 후 mutate 재조회에도 접힘 유지, 막대 hover 툴팁 표시는 소스 근거로 구현했으나 실기기 육안 확인 미수행(integration-verifier/E2E 권장).
