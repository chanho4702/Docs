# 접기/너비 조절 패널 레이아웃 — 공통 승격 설계서

> 대상: `components/layout/ResizablePanels` 신설 + `/resource > 프로젝트 배정` 1차 적용
> 성격: **프론트 전용**. 백엔드·DB·권한·쿼리키 변경 **없음**.
> 기준 소스: `f6e521c`(develop, 2026-08-10) 실코드 확인.

---

## 1. 개요 / 영향 범위

### 1-1. 백엔드
**없음.** 신규 resolver 0, `PermissionMap` 변경 0, `src/index.js` 변경 0, DB(MySQL/KVS) 변경 0.
`invoke` 호출·응답 shape 소비 코드에 손대지 않는다 → integration-verifier의 resolver↔프론트 교차 비교 대상 없음.

### 1-2. 프론트 (신규)
| 파일 | 역할 |
|------|------|
| `static/ui/src/components/layout/panelLayout.js` | **순수 계산 모듈**(DOM·React 없음). 가중치 정규화·리사이즈 델타·접힘 판정·경계 짝 해석 |
| `static/ui/src/components/layout/ResizablePanels.jsx` | `ResizablePanels` + `Panel` 컴포넌트. pointer capture 드래그, 접힘 레일, localStorage 영속 |
| `static/ui/src/components/layout/ResizablePanels.css` | `:hover`/`:focus-visible` 상태(인라인 스타일로 표현 불가) |
| `static/ui/src/components/layout/__test__/panelLayout.test.js` | 순수 함수 단위 테스트 + i18n 키 커버리지 |

### 1-3. 프론트 (수정)
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx` | **342~441행의 3패널 `div` 래퍼만** `<ResizablePanels>`/`<Panel>` 로 교체. 그 외 무수정 |

### 1-4. DB / i18n
- DB: 없음.
- i18n: `locales/kr/common.json` · `locales/en/common.json` 에 `panel.*` 네임스페이스 5키 추가(§6).
  (`locales/script/*.json` 은 빈 스텁 — merge 소스 아님. 추가 후 `cd static/ui && npm run merge`)

### 1-5. 신규 의존성
**0개.** `@atlaskit/icon/core/chevron-left|right`(설치 확인됨, `@atlaskit/icon ^30.0.0`), `@atlaskit/tokens`, `@atlaskit/tooltip` 만 사용. `react-resizable-panels` 등 도입하지 않는다.

---

## 2. 경계면 계약 (가장 중요)

이 기능은 resolver 경계면이 없다. **계약의 자리는 컴포넌트 props API**다 — 아래 표가 단일 진실이며, 배정 화면과 향후 재사용 화면이 공유하는 유일한 접점이다.

### 2-1. `<ResizablePanels>` props

| prop | 타입 | 기본값 | 의미 |
|------|------|--------|------|
| `storageKey` | `string?` | `undefined` | 주면 `{weights, collapsed}` 를 localStorage에 영속. 없으면 세션 내 메모리 상태만 |
| `height` | `string \| number` | `'78vh'` | 행 높이. 배정 화면 현행 `PANEL_HEIGHT` 그대로 |
| `minHeight` | `number` | `480` | 현행 `PANEL_MIN_HEIGHT` 그대로 |
| `railWidth` | `number` | `40` | 접힌 패널 레일 폭(px) |
| `handleWidth` | `number` | `16` | 드래그 핸들 폭(px) = **히트 영역**. 현행 `gap:16` 을 그대로 흡수하므로 시각적 여백 불변 |
| `className` | `string` | `''` | 추가 클래스 |
| `children` | `<Panel>` 노드(들) | — | falsy 자식은 필터링(조건부 렌더 허용, Atlaskit `Tabs` 와 동일 규약) |

### 2-2. `<Panel>` props

| prop | 타입 | 기본값 | 의미 |
|------|------|--------|------|
| `id` | `string` **(필수)** | — | **상태 키**. 인덱스가 아니라 id로 가중치/접힘을 기억한다 → 중간 패널이 조건부로 붙었다 떨어져도 좌·우 패널 비율이 튀지 않는다 |
| `title` | `string` **(필수)** | — | 접힘 레일의 세로 제목 + aria-label 원문. **평문 문자열**(Card `title` 은 JSX 노드라 재사용 불가) |
| `defaultWeight` | `number` | `1` | 초기 몫. **합이 100일 필요 없다** — 펼쳐진 패널들 사이에서 정규화된다 |
| `minWidth` | `number` | `240` | 최소 폭(px). 드래그 클램프 기준 |
| `collapsible` | `boolean` | `true` | `false` 면 이 패널의 접기 버튼을 그리지 않는다 |
| `defaultCollapsed` | `boolean` | `false` | 초기 접힘(`storageKey` 복원값이 우선) |
| `children` | `ReactNode` | — | 패널 본문(배정 화면에서는 기존 `<Card>` 를 **그대로**) |

**⚠ 계약 불변식**
1. `Panel` 은 자식을 **감싸기만 한다** — children을 clone/주입/재해석하지 않는다. 데이터 흐름·훅 호출 위치가 바뀌지 않는다.
2. 접기 버튼은 **핸들(구분선) 위**에 그린다 → 호출부의 `Card headerRight`(SearchInput / PeopleTeamFilter)와 충돌하지 않고, **호출부 JSX를 한 줄도 고치지 않아도** 접기가 생긴다.
3. 최소 1개 패널은 항상 펼쳐져 있다(마지막 남은 펼침 패널의 접기 버튼은 `disabled`).

### 2-3. 렌더 구조 (DOM 계약)

```
div.rp-row  (display:flex, gap:0, height, minHeight, overflowX:auto)
 ├ div.rp-panel[data-collapsed=false]   flex: {w} 1 0 ; minWidth ; overflow:hidden
 │   └ {children}                        ← <Card> 그대로
 ├ div.rp-handle[role=separator][tabIndex=0]  flex: 0 0 16px
 │   ├ span.rp-handle-line               2px 세로선(hover/active 시 color.border.selected)
 │   └ div.rp-handle-actions             ◀ / ▶ 접기 버튼 2개
 ├ div.rp-panel[data-collapsed=true]     flex: 0 0 40px  ← 레일
 │   ├ button.rp-rail-toggle             chevron(펼치기)
 │   └ span.rp-rail-title                writing-mode: vertical-rl
 └ …
```

- **레이아웃 산수를 JS로 하지 않는다.** 펼친 패널 = `flex-grow: weight`, `flex-basis: 0`; 접힌 패널 = `flex: 0 0 railWidth`. 브라우저가 잔여 공간을 가중치 비례로 나눈다 → **접으면 옆 패널이 자동으로 넓어진다**(요구 2번이 CSS로 충족). `ResizeObserver` 불필요.
- px 계측은 **드래그 시작 순간에만** 두 인접 패널의 `getBoundingClientRect().width` 를 읽는다(ColumnResizeOverlay의 `getTableWidth?.()` 와 같은 사상 — 매 프레임 DOM을 읽지 않는다).

### 2-4. 순수 모듈 `panelLayout.js` API (테스트 계약)

| export | 시그니처 | 반환 |
|--------|----------|------|
| `RAIL_WIDTH` / `HANDLE_WIDTH` / `DEFAULT_MIN_WIDTH` | 상수 `40` / `16` / `240` | — |
| `visiblePanels(children)` | falsy 제거 + `id` 중복 제거 | `[{id,title,defaultWeight,minWidth,collapsible}]` |
| `normalizeWeights(panels, weights)` | 누락 id는 `defaultWeight` 로 채움 | `{ [id]: number>0 }` |
| `expandedIds(panels, collapsed)` | 펼쳐진 패널 id 순서대로 | `string[]` |
| `canCollapse(panels, collapsed, id)` | `collapsible && 펼침 패널 2개 이상` | `boolean` |
| `toggleCollapsed(panels, collapsed, id)` | 마지막 펼침 패널이면 **원본 그대로 반환** | `{ [id]: true }` |
| `resolveEdgePair(panels, collapsed, edgeIndex)` | 그 경계의 **가장 가까운 펼친 좌/우 패널** id 쌍. 한쪽이 없으면 `null` | `[idA,idB] \| null` |
| `applyPanelResize(weights, idA, idB, {pxA, pxB, deltaPx, minPxA, minPxB})` | 쌍의 가중치 합 **보존**, 픽셀 최소폭으로 클램프. 쌍 총폭 < `minA+minB` 면 무변경 | `{ [id]: number }` |
| `resetPair(weights, defaults, idA, idB)` | 쌍의 합은 유지하고 `defaultWeight` 비율로 복원 | `{ [id]: number }` |
| `readStored(storageKey)` / `writeStored(storageKey, state)` | try/catch 감싼 localStorage 접근(실패 시 각각 `null` / no-op) | — |

`applyPanelResize` 계산식 (columnWidths.js `applyResizeDelta` 와 동형):
```
total   = pxA + pxB
if (!(total > 0) || total < minPxA + minPxB) → weights 그대로
nextPxA = clamp(pxA + deltaPx, minPxA, total - minPxB)
wSum    = w[idA] + w[idB]
w'[idA] = round2(wSum * nextPxA / total)
w'[idB] = round2(wSum - w'[idA])          // 합 보존 → 나머지 패널은 미동도 하지 않는다
```

---

## 3. 백엔드 설계

**해당 없음.** Controller/Service/Repository/ErrorCodes/`src/index.js`/`PermissionMap` 모두 무변경.

---

## 4. 프론트엔드 설계

### 4-1. 조사 결과 (설계 근거)

| 확인 대상 | 실측 결과 | 설계 반영 |
|-----------|----------|-----------|
| `ProjectAssignmentBoard.jsx` 342~441행 | `display:flex; gap:16; height:78vh; minHeight:480; overflow:hidden` 안에 `flex:'1 1 340px' maxWidth:440 minWidth:300` / `'1 1 320px' max:400 min:300` / `'3 1 520px' minWidth:0` 3개 div. **중간 패널은 `selectedCard` 일 때만 렌더** | 감쌀 지점은 이 flex 컨테이너 **한 곳**. 조건부 중간 패널 → 상태를 **id 키 맵**으로 설계. `maxWidth` 상한은 제거(요구: "너무 좁음") |
| `Card.jsx` | `height:100%`, 본문 `overflow:auto` | 패널이 높이를 주면 카드 내부 스크롤은 현행 유지 |
| `ColumnResizeOverlay.jsx` | `setPointerCapture` + `onPointerMove/Up/onLostPointerCapture`, 드래그 시작 시 1회 기준 계측, `touch-action:none`, **더블클릭으로 그 경계만 리셋** | 동일 패턴 채택. 단 **절대배치 오버레이는 불필요**(표는 정렬 버튼 안에 핸들을 못 넣어 오버레이였음. 패널은 gap이 비어 있어 핸들을 flex 아이템으로 둘 수 있다) |
| `table.css` 핸들 | `width:6px; margin-left:-3px` — "잘 안 잡힌다" 피드백의 원인 | 핸들 폭 **16px**(≈2.7배) + 세로 전체 높이. 시각선은 2px만 남겨 외형은 현행 gap과 동일 |
| `SideDrawer.jsx` | 폭을 `storageKey`로 localStorage 영속(`'resource.profileDrawer.width'`, `'project.detailDrawer.width'`) | **같은 규약 재사용**. 키 이름 `'resource.assignmentPanels.layout'` |
| `@atlaskit/tabs@18.3.4` `tabs.js` | `shouldUnmountTabPanelOnChange` 기본 `false` + `visited` Set → **한 번 연 탭 패널은 언마운트되지 않는다.** `ResourcePage.jsx` 는 이 prop을 주지 않음 | **탭 전환으로는 언마운트되지 않는다** → 컴포넌트 내부 `useState` 만으로 요구 4번(탭 전환 유지)이 충족된다. 상위 끌어올림 불필요 |
| `ProjectTreeView.jsx` (4:6 좌우, min 320/420), `WorklogPage.jsx` (2:8 좌우, min 260/880) | 둘 다 `flex-grow` 비율 + `minWidth` 구조 | 위 API가 **그대로 수용**한다(`defaultWeight` 4/6, 2/8 + `minWidth`). 다만 **이번엔 적용하지 않는다**(§8 비목표) |
| `columnWidths.test.js`, `projectDesign.test.js`, `allocationI18n.test.js` | 순수 함수 단위 테스트 + locales 소스 직접 파싱. `@testing-library/react` 없음 | 테스트를 순수 모듈에 집중(§7) |

### 4-2. 상태 관리 (소유·유지)

**소유: `ResizablePanels` 내부.** 호출부는 상태를 모른다(레이아웃만 감싼다는 요구 준수).

```js
const [weights,   setWeights]   = useState(() => restore().weights   ?? {});  // { [id]: number }
const [collapsed, setCollapsed] = useState(() => restore().collapsed ?? {});  // { [id]: true }
```

| 시나리오 | 유지 여부 | 근거 |
|---------|----------|------|
| 같은 탭 리렌더(선택 변경, 필터, hydrate) | 유지 | 컴포넌트 언마운트 없음 |
| `/resource` 내 탭 전환(인력현황 ↔ 배정) | **유지** | Atlaskit Tabs가 visited 패널을 유지(실코드 확인) |
| 라우트 이탈 후 복귀(`/resource` → `/project` → `/resource`) | 유지 | `storageKey` localStorage 복원 |
| 브라우저 새로고침 | 유지 | 동상 |

- **영속 시점은 드래그 종료(pointerup)와 접힘 토글 순간만.** 드래그 중 매 프레임 쓰기 금지(SideDrawer도 `onUp` 에서만 쓴다).
- 저장 실패(사파리 프라이빗 등)는 try/catch 후 **무시** — 메모리 상태로 degrade. 예외를 화면에 올리지 않는다.
- 복원 값은 신뢰하지 않는다: 현재 `Panel` 에 없는 id는 버리고, 숫자가 아닌 가중치는 `defaultWeight` 로 대체(`normalizeWeights`). 저장된 상태로 화면이 깨지지 않게 한다.
- **컨텍스트/스토어를 만들지 않는다.** Zustand 스토어 추가는 과잉 — 다중 화면 공유 상태가 아니다.
- 쿼리키 변경 없음(`queryKey/` 미수정) → `queryKeyContract.test.js` 무관.
- 권한 체크 없음 — 레이아웃은 이미 통과한 화면 안의 표현일 뿐. `usePermissionStore` 미접촉.

### 4-3. 인터랙션 규격

**드래그**
- `pointerdown`(핸들) → `preventDefault` + `stopPropagation` + `setPointerCapture` → `resolveEdgePair` 로 대상 쌍 결정 → 두 패널 ref의 `getBoundingClientRect().width` 1회 계측 → `dragRef` 에 `{idA,idB,startX,pxA,pxB,startWeights}` 동결.
- `pointermove` → `deltaPx = e.clientX - startX` → `applyPanelResize` → `setWeights`.
- `pointerup` / `lostpointercapture` → `releasePointerCapture`, `dragRef=null`, **여기서 localStorage 저장**.
- `resolveEdgePair` 가 `null`(한쪽에 펼친 패널이 없음)이면 드래그를 시작하지 않는다.
- 드래그 중 텍스트 선택 방지는 핸들의 `touch-action:none` + `preventDefault` 로. **전역 `document.body.style` 을 건드리지 않는다**(ColumnResizeOverlay 주석의 결론을 따른다).

**히트 영역** — 요구 3번("잘 안 잡힌다")에 대한 정면 대응
- 핸들 자체 폭 **16px** × 패널 전체 높이, `cursor: col-resize`.
- 보이는 선은 가운데 2px. rest 는 `color.border`, hover/active 는 `color.border.selected` → **외형은 현행 16px gap과 사실상 동일**하고 잡히는 면적만 16px로 커진다.
- 표(6px) 대비 2.7배. 표 핸들은 **이번에 건드리지 않는다**(별건, §8).

**더블클릭** — 그 경계의 쌍만 `defaultWeight` 비율로 리셋(`resetPair`). 쌍의 합은 유지 → 다른 경계를 이미 옮겼어도 전체가 튀지 않는다. `title` 툴팁으로 안내(`common.panel.resetHint`).

**키보드** — 핸들 `tabIndex=0`, `role="separator"`, `aria-orientation="vertical"`. `ArrowLeft`/`ArrowRight` = ±24px 상당(계측 폭 기준으로 `applyPanelResize` 호출), `Enter`/`Space` 는 아무 동작 없음(오조작 방지).

**접기/펼치기**
- 핸들 위 액션 pill: `◀`(왼쪽 이웃 접기) / `▶`(오른쪽 이웃 접기). 3패널·2핸들이면 **3패널 전부 커버**된다(handle0: p0/p1, handle1: p1/p2).
- 대상이 `collapsible:false` 이거나 `canCollapse === false`(마지막 펼침 패널)면 그 버튼은 렌더하지 않는다.
- 접힌 패널은 40px 레일: 상단에 펼치기 chevron 버튼(`chevron-right`), 그 아래 `writing-mode: vertical-rl` 세로 제목, 배경 `elevation.surface.sunken`, 테두리 `color.border`, radius 10px(Card와 동일) → **접힘 상태가 명확히 보인다**(요구 1번).
- 접힌 패널의 children 은 **언마운트하지 않고** `display:none` 처리한다. 훅·쿼리 구독이 끊기면 다시 펼 때 재요청/재계산이 일어나 "레이아웃만 감싼다"가 깨진다(예: 중간 패널의 `ProjectDetailPanel`). → 접힘은 **순수 시각 상태**다.
- 애니메이션 없음(스피너 금지 원칙과 같은 결: 상태 변화는 즉시). CSS transition 은 레일 배경색 120ms 만.

**색상** — 전부 `token(...)`. 하드코딩 hex는 `token()` 2번째 인자 폴백에만(코드베이스 관례).

### 4-4. 배정 화면 적용 (`ProjectAssignmentBoard.jsx`)

교체 범위는 **342행 `<div style={{display:'flex' …}}>` ~ 442행 `</div>`** 딱 하나. 관계도 접이식 블록(321~340행), 드로어/모달 4종(444~527행), 훅·핸들러·`useMemo` 전부 **무수정**.

```jsx
<ResizablePanels
    storageKey="resource.assignmentPanels.layout"
    height={PANEL_HEIGHT}          // '78vh'  (기존 상수 그대로)
    minHeight={PANEL_MIN_HEIGHT}   // 480
>
    <Panel id="projects" title={t('resource.assignment.projects.title')} defaultWeight={24} minWidth={280}>
        <Card title={projectsTitle} headerRight={<SearchInput … />}>
            <ProjectCardList … />       {/* 현행 prop 그대로 */}
        </Card>
    </Panel>

    {selectedCard && (
        <Panel id="detail" title={selectedCard.projectName} defaultWeight={24} minWidth={280}>
            <Card title={detailTitle}>
                <ProjectDetailPanel bare … />
            </Card>
        </Panel>
    )}

    <Panel id="people" title={t('resource.assignment.people.title')} defaultWeight={52} minWidth={320}>
        <Card title={peopleTitle} headerRight={<PeopleTeamFilter … />}>
            {/* !selected 안내문 + peopleLoading 분기 + CompanyResourceTable — 현행 그대로 */}
        </Card>
    </Panel>
</ResizablePanels>
```

| 패널 | id | 현행 | 신규 | 접기 |
|------|----|------|------|------|
| 프로젝트 카드 목록 | `projects` | `flex 1 1 340px` / max 440 / min 300 | weight **24** / min **280** / **max 제거** | ✅ |
| 선택 프로젝트 상세 | `detail` | `flex 1 1 320px` / max 400 / min 300 (조건부) | weight **24** / min **280** / **max 제거** | ✅ |
| 전사 인원 테이블 | `people` | `flex 3 1 520px` / min 0 | weight **52** / min **320** | ✅ |

**설계 판단**
- **3개 전부 접기 가능**하게 한다. 요구 원문("카드 접기")이 특정 패널을 지목하지 않았고, 3패널일 때 넓히고 싶은 대상이 상황마다 다르다(카드 고를 땐 좌측 확대, 배정할 땐 우측 확대). "최소 1개는 펼침" 불변식이 전량 접힘을 막는다.
- **`maxWidth` 상한 제거가 이번 변경의 핵심 효용**이다. 현행은 좌·중이 440/400px 로 묶여 있어 넓은 모니터에서 아무리 끌어도 안 넓어진다.
- 컨테이너 `overflow: hidden` → **`overflowX: auto`** 로 바꾼다. 최소폭 합(280+280+320+16×2 = 912px)을 못 채우는 좁은 화면에서 패널을 뭉개는 대신 가로 스크롤을 준다(`WorklogPage` 선례).
- 기존 지역 상수 `PANEL_HEIGHT` / `PANEL_MIN_HEIGHT` 는 유지하고 prop 으로 넘긴다(값의 출처를 옮기지 않는다).

**데이터 흐름 불변 보장 체크리스트** (frontend-engineer 는 이 6개를 지켰는지로 자기 작업을 판정한다)
1. 훅 호출 순서·위치·개수 무변경 (`useAssignmentProjectCards`/`Metrics`, `useResourceOverview`/`LoadSummary`, `useWorkAssignmentBoard`/`Pool`, `useTeamOptions`, `useQuery(settingKeys.detail())`).
2. `useMemo`/`useCallback` 의존성 배열 무변경.
3. `Card`/`ProjectCardList`/`ProjectDetailPanel`/`CompanyResourceTable`/`PeopleTeamFilter`/`SearchInput` 에 넘기는 prop **한 개도 추가·삭제·개명 없음**.
4. `selectedProjectId` 토글 로직(`prev === id ? null : id`) 무변경 → 중간 패널의 조건부 렌더 조건도 `selectedCard` 그대로.
5. `invoke` 호출 3곳(`insertProjectusers` ×2, `removeProjectMemberByAccount`)과 `invalidateQueries` 키 무변경.
6. `Panel` 은 children 을 clone 하지 않는다(§2-2 불변식 1).

---

## 5. DB 설계

**해당 없음.** MySQL 테이블·KVS 엔티티·`manifest.yml` attributes·마이그레이션 모두 변경 없음.
사용자 레이아웃 취향은 서버에 저장하지 않는다 — 브라우저 localStorage 로 충분하고, KVS 엔티티 20종 상한을 이런 용도로 쓰지 않는다.

---

## 6. i18n 키 목록

`locales/kr/common.json` · `locales/en/common.json` 최상위에 `panel` 객체 추가(기존 `common.table.resizeColumn` 과 같은 층위).
추가 후 **`cd static/ui && npm run merge`** 실행. `ko-KR.json`/`en-US.json` 직접 수정 금지.

| 키 | kr | en | 쓰임 |
|----|----|----|------|
| `common.panel.resize` | `패널 너비 조절` | `Resize panel` | 핸들 `aria-label` |
| `common.panel.resetHint` | `더블클릭하면 기본 너비로 돌아갑니다` | `Double-click to reset to the default width` | 핸들 `title` 툴팁 |
| `common.panel.collapse` | `{name} 접기` | `Collapse {name}` | 접기 버튼 `aria-label`/툴팁 (`tFormat`) |
| `common.panel.expand` | `{name} 펼치기` | `Expand {name}` | 레일 펼치기 버튼 `aria-label`/툴팁 (`tFormat`) |
| `common.panel.collapsed` | `{name} (접힘)` | `{name} (collapsed)` | 접힌 패널 컨테이너 `aria-label` |

- `{name}` 은 `Panel.title` 값. **치환 토큰은 kr·en 동일**해야 한다(테스트가 검사, §7).
- 배정 화면 전용 신규 키는 **없다** — 레일 제목은 기존 `resource.assignment.projects.title` / `resource.assignment.people.title` / `selectedCard.projectName` 을 재사용한다.

---

## 7. 테스트 설계

`@testing-library/react` 가 없으므로 **순수 함수에 검증을 몰아넣는다**(코드베이스 관례: `columnWidths.test.js`, `projectDesign.test.js`). React 렌더 테스트는 만들지 않는다.

`static/ui/src/components/layout/__test__/panelLayout.test.js`

**A. `normalizeWeights` / `visiblePanels`**
1. 누락 id는 `defaultWeight` 로 채워진다.
2. `null`/`false` 자식(조건부 중간 패널 미렌더)은 제거된다.
3. 저장값에만 있고 현재 패널에 없는 id는 버려진다(정리 안 하면 옛 id가 비율을 갉아먹는다).
4. 가중치가 `NaN`/0/음수면 `defaultWeight` 로 대체된다.

**B. `applyPanelResize`** — 계약의 심장
5. 인접 두 패널만 바뀌고 **나머지는 미동도 하지 않는다**.
6. **쌍의 가중치 합이 보존**된다(양·음 델타 모두).
7. 양/음 델타가 대칭이다.
8. 최소폭에서 더 줄지 않는다(양쪽 클램프): `deltaPx = -9999` → A가 `minPxA` 에 해당하는 가중치에서 멈춘다.
9. 쌍의 총 픽셀폭이 `minPxA+minPxB` 미만이면 **손대지 않는다**(억지로 줄이면 한쪽이 사라진다 — columnWidths 전례).
10. `pxA+pxB === 0`(측정 실패, jsdom/`display:none` 탭) 이면 원본 그대로 — **접힌 탭에서 깨지지 않는다**.

**C. `toggleCollapsed` / `canCollapse`**
11. 접으면 해당 id만 `true`, 가중치는 **그대로 기억**된다(펼치면 원래 몫 복귀).
12. 펼침 패널이 1개뿐이면 접기가 거부되고 **원본 객체가 그대로 반환**된다(전량 접힘 방지).
13. `collapsible:false` 패널은 `canCollapse === false`.

**D. `resolveEdgePair`**
14. 전부 펼침 3패널: edge0 → `['projects','detail']`, edge1 → `['detail','people']`.
15. **중간 접힘**: 두 경계 모두 `['projects','people']` → 중간을 접어도 좌·우 폭 조절이 살아 있다.
16. 좌측 전부 접힘 → 왼쪽 펼침 이웃 없음 → `null`(드래그 시작 안 함).

**E. `resetPair`**
17. 그 쌍만 `defaultWeight` 비율로 복원되고 **쌍의 합은 유지**된다.

**F. 저장/복원**
18. `readStored` 는 손상 JSON·`localStorage` throw 에서 `null` 을 반환한다(예외를 밖으로 내지 않는다).

**G. i18n 커버리지** (`allocationI18n.test.js` 패턴 — 생성물이 아니라 `locales/{kr,en}/common.json` 소스를 직접 읽는다)
19. `common.panel.*` 5키가 kr·en 양쪽에 문자열로 존재한다.
20. `common.panel.` 네임스페이스의 kr·en 키 집합이 동일하다.
21. `collapse`/`expand`/`collapsed` 의 `{name}` 치환 토큰이 kr·en 에서 일치한다.

**회귀 게이트**
- `cd static/ui && npm test` — 기존 프론트 테스트 전량 통과(특히 `projectDesign.test.js`, `queryKeyContract.test.js`, `tableContract.test.js` 무영향 확인).
- `cd static/ui && CI=true npm run build` — 로컬만 통과하고 CI가 깨지는 것을 막는다. 번들 예산(gzip 950KB, 현재 ~895KB) 확인: 신규 의존성 0, 신규 코드 ~10KB 미만이라 예산 영향 무시할 수준.

**수동 검증 포인트**(요구 §검증 포인트 대응 — E2E는 별건)
- 3패널 각각 접기/펼치기 → 옆 패널이 실제로 넓어짐 / 마지막 1개는 접히지 않음
- 핸들 드래그로 비율 조절, 최소폭에서 멈춤, 16px 히트 영역 체감
- 핸들 더블클릭 → 기본 비율 복귀
- `/resource` 탭 전환 후 복귀 → 유지 / 다른 라우트 갔다 복귀 → 유지 / 새로고침 → 유지
- 프로젝트 카드 선택·해제 시 중간 패널 등장/소멸에도 좌·우 비율이 튀지 않음
- 데이터 무회귀: 카드 선택, 지표 hydrate, 팀 필터, 배정 실행(개별/팀 전체), 배정 취소, 드로어/모달
- 다크 테마에서 레일·핸들 색

---

## 8. 비목표 (이번에 하지 않는 것)

| 항목 | 이유 |
|------|------|
| 트리 뷰(`ProjectTreeView`) · My Work(`WorklogPage`) 등 **다른 화면 적용** | 요구가 "이번 적용은 배정 화면만"으로 명시. API가 두 화면을 수용할 수 있음은 §4-1에서 확인했고, 확산은 별건 |
| **세로(행) 분할** / 중첩 분할 | 요구 없음. 가로 1차원으로 못 박아야 순수 계산이 단순하게 유지된다 |
| **패널 순서 변경(드래그 재정렬)** | 요구 없음. 위치가 매번 같아야 사용자가 외운다(BentoGrid 주석의 원칙) |
| 접힘/비율의 **서버·KVS 저장**(사용자별 프로필 동기화) | 과잉. 브라우저 로컬로 충분 |
| **표 컬럼 핸들(6px) 확대** | 같은 "잘 안 잡힘" 원인이지만 `table.css` 수정은 전 화면 영향 → 별건으로 분리 |
| **반응형 자동 세로 스택**(좁은 화면에서 패널 쌓기) | 가로 스크롤로 처리. 스택 전환은 최소폭·접힘 규칙과 상호작용이 커진다 |
| 패널 **최대폭 제약**·스냅 포인트·접힘 애니메이션 | 요구 없음. 이번 변경은 오히려 max 상한을 없애는 것이 목적 |
| 컨트롤드 모드(`weights`/`onChange` prop) | 호출부가 상태를 알 이유가 없다. 필요해지는 화면이 나오면 그때 추가 |

---

## 9. 구현 작업 분해

### backend
없음.

### frontend
- [ ] **F1** `components/layout/panelLayout.js` — §2-4의 상수·순수 함수 9종. DOM/React import 금지. `round2` 로컬 헬퍼(columnWidths와 동일 스타일)
- [ ] **F2** `components/layout/__test__/panelLayout.test.js` — §7 A~F (21케이스 중 1~18). **F3 전에 작성**해도 좋다(순수 모듈이라 UI 없이 돈다)
- [ ] **F3** `components/layout/ResizablePanels.css` — `.rp-row/.rp-panel/.rp-handle/.rp-handle-line/.rp-handle-actions/.rp-rail-*` 의 hover·focus-visible·active 상태. 색은 `var(--ds-*, 폴백)`(table.css 선례)
- [ ] **F4** `components/layout/ResizablePanels.jsx` — `ResizablePanels`(default) + `Panel`(named) export. pointer capture 드래그 / 접기·펼치기 / 레일 / 키보드 / localStorage(드래그 종료·토글 시에만 쓰기) / `useI18nStore` `t`·`tFormat`. 상단에 "왜 flex-grow로 재분배하는가 · 왜 접어도 언마운트하지 않는가"를 주석으로 남긴다(BentoGrid/SideDrawer 문서화 관례)
- [ ] **F5** `locales/kr/common.json` + `locales/en/common.json` 에 `panel.*` 5키 추가 → `cd static/ui && npm run merge`
- [ ] **F6** `__test__/panelLayout.test.js` 에 §7 G(19~21) i18n 커버리지 추가
- [ ] **F7** `ProjectAssignmentBoard.jsx` 342~442행 교체(§4-4). **그 외 라인 무수정** — diff가 이 범위 + import 2줄을 넘으면 설계 이탈이다
- [ ] **F8** `cd static/ui && npm test` → `CI=true npm run build` (번들 예산 확인)

### 리뷰 시 확인할 것 (integration-verifier 인계 사항)
- resolver 응답 shape 교차 비교 **대상 없음**(백엔드 무변경). 대신 **§4-4 데이터 흐름 불변 체크리스트 6항목**을 검증 기준으로 쓸 것.
- 다중 shape 재사용 컴포넌트 함정과 무관(레이아웃 래퍼는 데이터를 만지지 않는다). 단 `Panel` 이 children 을 clone/가공하지 않는지만 확인.
- `git diff --stat` 상 `ProjectAssignmentBoard.jsx` 변경량이 100줄 내외를 크게 넘으면 데이터 로직이 함께 손댄 것 — 되돌릴 것.
