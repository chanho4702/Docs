# 프론트엔드 구현 리포트 — 접기/너비 조절 패널 레이아웃 공통 승격

> 설계서 `01_architect_design.md` 기준. 백엔드 변경 없음(resolver·PermissionMap·DB 무접촉), 쿼리키 무변경, 신규 의존성 0.

## 1. 신규 / 수정 파일

### 신규
| 파일 | 줄수 | 역할 |
|------|------|------|
| `static/ui/src/components/layout/panelLayout.js` | 217 | 순수 계산 모듈(DOM·React import 없음). 상수 3 + 함수 10 export |
| `static/ui/src/components/layout/ResizablePanels.jsx` | 343 | `ResizablePanels`(default) + `Panel`(named). pointer capture 드래그 / 접기·펼치기 / 레일 / 키보드 / localStorage |
| `static/ui/src/components/layout/ResizablePanels.css` | 172 | `:hover`/`:focus-visible`/`.is-active` 상태. 색은 전부 `var(--ds-*, 폴백)` |
| `static/ui/src/components/layout/__test__/panelLayout.test.js` | 237 | 순수 함수 + i18n 커버리지 27케이스 |

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx` | flex 컨테이너 한 곳 교체 + import 1줄 (**+42 / −11**) |
| `locales/kr/common.json` · `locales/en/common.json` | `panel.*` 5키 추가 |
| `locales/ko-KR.json` · `locales/en-US.json` | `npm run merge` 산출물(직접 수정 없음) |

> ⚠ 작업 시작 시점의 워킹 트리에 **다른 작업의 미커밋 변경**(table.css / CommonTable / ProjectCard / ProjectDetailPanel / echartsTheme 등 약 35파일, `common.table.sort*`·`resizeColumn` 키 포함)이 이미 있었다. 이번 작업에서는 손대지 않았고, `npm run merge` 산출물(ko-KR/en-US)에 그쪽 키가 함께 반영돼 있다.

## 2. 계약 구현 위치 (설계서 §2)

### 2-1. `panelLayout.js` 순수 API (§2-4 표 그대로)
| export | 위치 |
|--------|------|
| `RAIL_WIDTH`=40 / `HANDLE_WIDTH`=16 / `DEFAULT_MIN_WIDTH`=240 | `panelLayout.js:19,21,23` |
| `visiblePanels(children)` | `panelLayout.js:36` |
| `normalizeWeights(panels, weights)` | `panelLayout.js:65` |
| `expandedIds(panels, collapsed)` | `panelLayout.js:77` |
| `canCollapse(panels, collapsed, id)` | `panelLayout.js:88` |
| `toggleCollapsed(panels, collapsed, id)` | `panelLayout.js:103` |
| `resolveEdgePair(panels, collapsed, edgeIndex)` | `panelLayout.js:117` |
| `applyPanelResize(weights, idA, idB, {pxA,pxB,deltaPx,minPxA,minPxB})` | `panelLayout.js:144` (계산식은 설계서 그대로: 쌍 합 보존 + px 클램프 + `total < minA+minB` 무변경) |
| `resetPair(weights, defaults, idA, idB)` | `panelLayout.js:171` |
| `readStored` / `writeStored` | `panelLayout.js:193` / `210` |

### 2-2. `<ResizablePanels>` / `<Panel>` props (§2-1·2-2 표 그대로)
- `ResizablePanels({ storageKey, height='78vh', minHeight=480, railWidth=40, handleWidth=16, className='', children })` — `ResizablePanels.jsx:55`
- `Panel({ id, title, defaultWeight, minWidth, collapsible, defaultCollapsed, children })` — `ResizablePanels.jsx:341`. **children 을 clone/주입/재해석하지 않는다**(`return <>{children}</>` 뿐)
- falsy 자식 필터 + id 중복 제거 — `ResizablePanels.jsx:88~98`(요소 수집)과 `visiblePanels`가 **같은 규칙**을 적용해 서술자/요소 순서가 어긋나지 않는다

### 2-3. 인터랙션 (§4-3)
| 항목 | 위치 | 비고 |
|------|------|------|
| pointer capture 드래그 시작 | `ResizablePanels.jsx:120` | `preventDefault`+`stopPropagation`+`setPointerCapture`, **px 계측은 여기 1회만**(`getBoundingClientRect`), `resolveEdgePair`가 `null`이면 시작 안 함 |
| 드래그 이동 | `:148` | `deltaPx = clientX - startX` → `applyPanelResize` |
| 종료 | `:160` | `releasePointerCapture` + **여기서만 localStorage 저장** |
| 키보드 ±24px | `:169`, `:187` | `ArrowLeft/Right`만, `Enter`/`Space` 무동작 |
| 더블클릭 = 그 쌍만 기본 비율 | `:195` | `resetPair` |
| 접힘 토글 + 저장 | `:204` | 거부(마지막 펼침 패널) 시 원본 참조 반환으로 판정 |
| 공간 재분배 | `:238~241` | 펼침 `flex: {w} 1 0` / 접힘 `flex: 0 0 40px`. **ResizeObserver 없음** |
| 접힘 레일(chevron + 세로 제목) | `:245~256`, CSS `.rp-rail*` | 배경 `--ds-surface-sunken`, radius 10px(Card 동일) |
| 핸들 위 접기 버튼 ◀/▶ | `:281~299`, `CollapseButton`:310 | 버튼의 `pointerdown`/`dblclick` 은 stopPropagation → 드래그·리셋과 충돌 없음 |
| 히트 영역 16px / 시각선 2px | CSS `.rp-handle`, `.rp-handle-line` | `touch-action:none`, `cursor:col-resize`, 전역 `document.body` 미접촉 |
| 접어도 언마운트 없음 | `:302` + CSS `.rp-panel[data-collapsed='true'] > .rp-panel-body { display:none }` | 훅·쿼리 구독 유지 |
| 최소 1개 펼침 불변식 | `canCollapse` + `:113~114`(전량 접힘 방지 폴백) | 저장값이 손상돼 전부 접힘이어도 첫 패널을 편다 |

## 3. 배정 화면 교체 지점 (diff 요약)

`ProjectAssignmentBoard.jsx` — 변경은 **import 1줄 + 342행 flex 컨테이너 한 곳**뿐. `git diff --stat`: `42 +/-` (설계서 인계 기준 "100줄 내외" 이내).

```diff
+import ResizablePanels, { Panel } from '../../../components/layout/ResizablePanels';
...
-<div style={{ display:'flex', gap:16, alignItems:'stretch', height:PANEL_HEIGHT, minHeight:PANEL_MIN_HEIGHT, overflow:'hidden' }}>
-  <div style={{ flex:'1 1 340px', maxWidth:440, minWidth:300, overflow:'hidden' }}>   … </div>
-  {selectedCard && (<div style={{ flex:'1 1 320px', maxWidth:400, minWidth:300, … }}> … </div>)}
-  <div style={{ flex:'3 1 520px', minWidth:0, overflow:'hidden' }}>                   … </div>
-</div>
+<ResizablePanels storageKey="resource.assignmentPanels.layout" height={PANEL_HEIGHT} minHeight={PANEL_MIN_HEIGHT}>
+  <Panel id="projects" title={t('resource.assignment.projects.title')} defaultWeight={24} minWidth={280}> … </Panel>
+  {selectedCard && (<Panel id="detail" title={selectedCard.projectName} defaultWeight={24} minWidth={280}> … </Panel>)}
+  <Panel id="people" title={t('resource.assignment.people.title')} defaultWeight={52} minWidth={320}> … </Panel>
+</ResizablePanels>
```

- `maxWidth` 상한 440/400 **제거**(이번 변경의 핵심 효용), `minWidth` 300/300/0 → 280/280/320
- 컨테이너 `overflow:hidden` → `.rp-row { overflow-x:auto }`(좁은 화면에서 뭉개는 대신 가로 스크롤)
- `PANEL_HEIGHT`/`PANEL_MIN_HEIGHT` 상수는 그 자리에 그대로 두고 prop 으로 전달
- `Card` 및 그 안쪽(JSX 본문·prop)은 **한 글자도 수정하지 않았다**

## 4. 데이터 흐름 불변 체크리스트 (설계서 §4-4, 자가 점검)

| # | 항목 | 결과 | 근거 |
|---|------|------|------|
| 1 | 훅 호출 순서·위치·개수 무변경 | ✅ | 컴포넌트 상단 1~318행 무수정(diff는 340행 이후 + import 1줄뿐). `useAssignmentProjectCards/Metrics`, `useResourceOverview/LoadSummary`, `useWorkAssignmentBoard/Pool`, `useTeamOptions`, `useQuery(settingKeys.detail())` 그대로 |
| 2 | `useMemo`/`useCallback` 의존성 배열 무변경 | ✅ | 해당 블록이 diff에 없음 |
| 3 | 자식 컴포넌트 prop 추가·삭제·개명 없음 | ✅ | `Card`/`ProjectCardList`/`ProjectDetailPanel`/`CompanyResourceTable`/`PeopleTeamFilter`/`SearchInput` 호출부 라인은 diff에 없음(감싸는 `div`→`Panel` 만 교체) |
| 4 | `selectedProjectId` 토글 로직·중간 패널 조건부 렌더 조건 무변경 | ✅ | `onSelect={(id)=>setSelectedProjectId(prev => prev===id?null:id)}`, `{selectedCard && …}` 그대로 |
| 5 | `invoke` 3곳 + `invalidateQueries` 키 무변경 | ✅ | `insertProjectusers`×2·`removeProjectMemberByAccount`, `assignmentKeys.board/pool` 라인 diff 없음 |
| 6 | `Panel` 이 children 을 clone 하지 않음 | ✅ | `Panel` 은 `<>{children}</>` 만 반환. `ResizablePanels` 는 수집한 `<Panel>` **요소 자체**를 렌더하고 `React.cloneElement` 를 쓰지 않는다 |

**추가로 확인한 잠재 회귀(중간 패널 등장/소멸 시 형제 remount)** — `React.Children.toArray` 는 null 자식도 인덱스를 소비하므로 키가 `['.0','.1','.2'] → ['.0','.2']` 로 **위치 고정**된다. 임시 렌더 테스트(jsdom, 커밋하지 않음)로 프로젝트 선택/해제 시 우측 패널의 DOM 노드가 **동일 인스턴스로 유지**됨(remount 없음 = 재요청·상태 손실 없음)을 확인했다.

## 5. i18n

- `locales/kr/common.json` · `locales/en/common.json` 에 `panel` 객체(최상위, `table` 과 같은 층위) 5키 추가: `resize` / `resetHint` / `collapse` / `expand` / `collapsed`
- `cd static/ui && npm run merge` **실행 완료** → `ko-KR.json`/`en-US.json` 에 `common.panel.*` 5키 반영 확인(생성물 직접 수정 없음)
- 배정 화면 전용 신규 키 없음 — 레일 제목은 기존 `resource.assignment.projects.title` / `…people.title` / `selectedCard.projectName` 재사용
- `{name}` 치환은 `tFormat(t, key, {name})`

## 6. 테스트 · 빌드 · 번들

| 항목 | 명령 | 결과 |
|------|------|------|
| 신규 단위 테스트 | `npx jest src/components/layout` | **27 passed** (설계 §7 A~G 21케이스를 전부 포함, 일부는 세분화해 27개) |
| 프론트 전량 | `cd static/ui && npm test` | **70 suites / 1191 tests passed** (`queryKeyContract`·`allocationI18n`·기존 테이블 테스트 포함 무영향) |
| CI 빌드 | `cd static/ui && CI=true npm run build` | **성공** (CI=true 라 lint 경고도 에러 — 신규 파일 경고 0) |
| 번들 예산 | `bundle:check` | `gzip 895,179 / 950,000` → **withinBudget: true** (신규 의존성 0, 증가분 예산 대비 무시할 수준) |

테스트 매핑(설계 §7): A 1~4 / B 5~10 / C 11~13 / D 14~16 / E 17 / F 18 / G 19~21 전부 구현. `readStored` 는 손상 JSON·`localStorage` throw 외에 정상 복원 케이스를 1개 더 넣었다.

## 7. 설계 대비 이탈 / 판단

1. **`visiblePanels` 반환 서술자에 `defaultCollapsed` 포함** — §2-4 표에는 `{id,title,defaultWeight,minWidth,collapsible}` 로 적혀 있으나, `Panel` props 표(§2-2)의 `defaultCollapsed` 를 컴포넌트가 소비해야 해서 서술자에 함께 담았다. 다른 계약에 영향 없음.
2. **`toggleCollapsed` 의 펼치기는 키 삭제가 아니라 `false` 기록** — 삭제하면 `defaultCollapsed:true` 패널이 새로고침마다 다시 접힌 채 돌아온다("펼쳐 뒀는데 왜 또 접혀 있지"). "접으면 해당 id 만 `true`" 계약과 저장 규칙은 그대로다.
3. **전량 접힘 방지 폴백 추가**(`ResizablePanels.jsx:113`) — 손상된 저장값이나 모든 패널 `defaultCollapsed:true` 조합에서도 첫 패널을 강제로 편다. §2-2 불변식 3("최소 1개는 펼침")을 렌더 단계에서도 이중으로 보장.
4. **접힌 패널 상태를 저장할 때 가중치는 정규화된 맵(`norm`)을 쓴다** → 중간 패널이 없는 상태에서 드래그하면 `detail` 의 사용자 지정 폭 기억은 사라지고 다음 선택 시 `defaultWeight`(24)로 시작한다. `normalizeWeights` 가 "현재 없는 id 를 버린다"(§7-3)는 계약의 자연스러운 귀결이라 별도 보존 로직은 넣지 않았다.
5. **React 렌더 테스트는 커밋하지 않았다**(설계 §7: `@testing-library/react` 없음 → 순수 함수에 집중). 위 §4의 remount 확인은 임시 파일로 1회 실행 후 삭제했다.
6. 비목표(§8) 준수 — 다른 화면 미적용, 세로 분할·재정렬·컨트롤드 모드·표 핸들(6px) 수정 없음.

## 8. 남은 것 (E2E 미수행)

설계 §7 「수동 검증 포인트」는 브라우저 실행이 필요해 이번 범위 밖이다. 특히 확인이 필요한 것:
- 3패널 접기/펼치기 시 옆 패널 확장 체감, 16px 히트 영역 체감, 최소폭에서의 정지
- 다크 테마에서 레일(`--ds-surface-sunken`)·핸들(`--ds-border-selected`) 색
- `/resource` 탭 전환 후 복귀 / 라우트 이탈 후 복귀 / 새로고침에서의 상태 유지
- 배정 실행(개별·팀 전체)·배정 취소·드로어/모달 무회귀
