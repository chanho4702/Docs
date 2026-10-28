# 통합 검증 리포트 — 접기/너비 조절 패널 레이아웃 공통 승격

> 기준: `01_architect_design.md`(경계면 계약) / 대조: `02_frontend_report.md` + 실소스
> 검증일: 2026-08-12 · 검증자: integration-verifier
> 성격: **프론트 전용**. 백엔드 resolver·PermissionMap·DB·쿼리키 변경 0 → resolver↔프론트 응답 shape 교차 비교 **대상 없음**(설계 §1-1·§3·§5 확인). 이 기능의 경계면은 `ResizablePanels/Panel` **props API ↔ ProjectAssignmentBoard 호출부** 한 축이다.

## 판정 요약

| 분류 | 건수 | 비고 |
|------|------|------|
| **통과** | 34 | 데이터 흐름 6항목 전부, 계약 §2 전항, 테스트/빌드 |
| **실패** | 0 | 차단 결함 없음 |
| **경미한 이탈(수용)** | 3 | 리포트 미신고 2건 포함 — 아래 §4 |
| **미검증** | 7 | 브라우저 실행 필요(시각·체감·테마) |

**결론: 통과.** 재작업 지시 사항 없음. 아래 §4·§5는 선택적 개선 제안이며 커밋을 막지 않는다.

---

## 1. 데이터 흐름 무회귀 (최중요) — 설계 §4-4 6항목

`git diff`가 **+34 / −8, 단일 파일**이다(설계 인계 기준 "100줄 내외" 이내). 변경은 import 1줄 + 340~442행 flex 컨테이너 한 곳뿐이며, **훅·핸들러·invoke·invalidateQueries·useMemo가 있는 1~339행은 diff에 단 한 줄도 없다.** 6항목은 "diff 부재"만이 아니라 아래처럼 실코드로 확인했다.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 훅 호출 순서·위치·개수 무변경 | **통과** | diff hunk 3개가 전부 340행 이후. `ProjectAssignmentBoard.jsx:41~42`의 `PANEL_HEIGHT`/`PANEL_MIN_HEIGHT` 상수도 제자리 유지(`:351~352`에서 prop 전달) |
| 2 | `useMemo`/`useCallback` 의존성 배열 무변경 | **통과** | `selectedCard` `useMemo`(`:154`) 등 해당 블록이 diff 밖 |
| 3 | 자식 컴포넌트 prop 무변경 | **통과** | `<Card …>` 이하 JSX 본문이 hunk 안에서 **문맥 라인(context)** 으로만 등장 — 감싸는 `div`→`Panel` 태그만 교체됨 |
| 4 | `selectedProjectId` 토글·중간 패널 조건부 렌더 조건 무변경 | **통과** | `{selectedCard && (<Panel id="detail" …>)}` 그대로 |
| 5 | `invoke` 3곳 + `invalidateQueries` 키 무변경 | **통과** | diff 밖. 백엔드 무접촉이라 응답 shape 소비 코드도 불변 |
| 6 | `Panel` 이 children 을 clone 하지 않음 | **통과** | `ResizablePanels.jsx:341` `Panel` 은 `<>{children}</>` 만 반환. 파일 전체에 `cloneElement` 0건. `ResizablePanels` 는 수집한 `<Panel>` **요소 자체**를 `.rp-panel-body` 에 넣는다(`:259`) |

### 1-1. 중간 패널 조건부 마운트 시 좌·우 패널 remount — **실측 검증**

리포트 §4의 "remount 없음" 주장을 **코드 추론 + 실제 렌더 실행** 두 가지로 재확인했다(임시 jest 테스트로 4케이스 실행 후 파일 삭제, 워킹 트리 오염 없음 — `git status` 확인 완료).

- **키 안정성(실측)**: `React.Children.toArray` 는 null 슬롯의 인덱스를 소비하므로 `people` 의 키가 **양쪽 상태에서 `.2` 로 동일**하다.
  ```
  with detail   : ['.0 /id=projects', '.1 /id=detail', '.2 /id=people']
  without detail: ['.0 /id=projects',                  '.2 /id=people']
  ```
  이것이 중요한 이유: `.rp-panel-body` 의 **단일 자식**이므로 키가 바뀌면 React 가 `reconcileSingleElement` 에서 삭제→재생성(=우측 패널 전체 remount, 재요청·상태 손실)한다. 키가 고정이라 그 경로로 가지 않는다.
- **렌더 실측(react-dom 18.3.1 + jsdom)**: 프로젝트 선택→해제를 왕복시킨 뒤 좌·우 패널의 `useEffect` 마운트 카운트가 **1 유지**, `ref` DOM 노드가 **동일 인스턴스**로 유지됨을 확인. `panels.map` 이 `<React.Fragment key={panel.id}>`(`:228`)로 **id 키**를 쓰는 것도 함께 확인.
- **접어도 언마운트 없음(실측)**: 접힌 패널 안의 프로브 노드가 DOM 에 그대로 있고 마운트 카운트가 증가하지 않음. `.rp-panel[data-collapsed='true'] > .rp-panel-body { display:none }`(`ResizablePanels.css:33`)로만 감춘다 → 훅·React Query 구독 유지(설계 §4-3 요구 충족).

---

## 2. 계약 준수 (설계 §2)

| 계약 | 판정 | 실코드 |
|------|------|--------|
| `<ResizablePanels>` props 7종·기본값 | **통과** | `ResizablePanels.jsx:55~63` — `storageKey/height='78vh'/minHeight=480/railWidth=40/handleWidth=16/className/children` 전부 일치 |
| `<Panel>` props 7종 | **통과** | `:341` 시그니처 일치. `visiblePanels`(`panelLayout.js:36`)가 `id` 필수·중복 제거·falsy 필터 |
| **상태 키가 인덱스 아닌 `id`** | **통과** | `weights`/`collapsed` 전부 `{[id]: …}`. `normalizeWeights`(`:65`)·`effCollapsed`(`ResizablePanels.jsx:97`) 모두 id 맵 |
| **CSS flex 재분배(JS 산수 없음)** | **통과** | 펼침 `flex: {w} 1 0` / 접힘 `flex: 0 0 40px`(`:240~242`, 실측으로 DOM 확인). `ResizeObserver` 0건 |
| **px 계측 1회** | **통과** | `measure()`(`:111`) 호출 지점은 `handlePointerDown`(`:127`)과 `resizeByKeyboard`(`:174`) 뿐. `handlePointerMove`(`:148`)는 드래그 시작 시 동결한 `drag.pxA/pxB/startWeights` 만 쓴다 → 매 프레임 DOM 미접근 + 누적 드리프트 없음 |
| **접힘 = display:none(언마운트 금지)** | **통과** | §1-1 실측 |
| **최소 1개 펼침** | **통과** | 3중 방어: `canCollapse`(`panelLayout.js:88`, 펼침 2개 이상) → `toggleCollapsed` 거부 시 **원본 참조 반환**(`:108`) → 렌더 단계 폴백(`ResizablePanels.jsx:101`). 실측: 마지막 펼침 패널의 접기 버튼이 사라지고 핸들이 `data-disabled='true'` 가 됨 |
| **localStorage 쓰기 시점** | **통과(+이탈 1)** | 렌더만으로는 쓰지 않음(실측). 드래그 종료(`:166`)·접힘 토글(`:209`)에서 기록. 저장 shape `{weights,collapsed}` 실측 일치. 단 키보드·더블클릭도 기록 → §4-2 |
| `applyPanelResize` 계산식(쌍 합 보존·px 클램프·`total<minA+minB` 무변경) | **통과** | `panelLayout.js:144~165` 가 설계 §2-4 의사코드와 1:1. 단위 테스트 6케이스로 커버 |
| DOM 계약(§2-3 클래스·role·구조) | **통과** | `.rp-row/.rp-panel/.rp-handle[role=separator][tabIndex=0]/.rp-handle-line/.rp-handle-actions/.rp-rail-*` 전부 존재. 실측: 3패널→핸들 2, 2패널→핸들 1 |
| 신규 의존성 0 | **통과** | import 는 `react`, `@atlaskit/icon/core/chevron-left|right`, 내부 모듈뿐 |
| 쿼리키/권한 미접촉 | **통과** | `queryKey/` `usePermissionStore` 접촉 0. `queryKeyContract.test.js` 통과 |

---

## 3. 핸들·접기 UI

| 항목 | 판정 | 근거 |
|------|------|------|
| 히트 영역 16px / 시각선 2px 분리 | **통과(코드)** | 핸들 인라인 `flex: 0 0 16px`(`:265`), `.rp-handle-line { width:2px }`(CSS:63). 종전 `gap:16` 을 흡수해 여백 총량 불변(3패널=핸들 2개×16px = 종전 gap 2개×16px) |
| pointer capture | **통과** | `setPointerCapture`(`:133`) / `releasePointerCapture`(`:164`) / `onPointerUp`+`onLostPointerCapture` 이중 종료(`:274~275`). `endDrag` 선두 `if (!dragRef.current) return`(`:161`)로 **이중 실행 방지**. `ColumnResizeOverlay.jsx:40·63·105` 와 동일 패턴(설계 §4-1 지시) |
| 드래그 시작 거부 조건 | **통과** | `resolveEdgePair` null(`:124`) 또는 `pxA+pxB<=0`(`:128`)이면 시작 안 함 |
| 전역 `document.body` 미오염 | **통과** | `body.style` 접촉 0. `touch-action:none` + `user-select:none`(CSS:51~52) |
| 더블클릭 쌍 리셋 | **통과** | `handleDoubleClick`(`:195`) → `resetPair`(쌍 합 유지). 접기 버튼은 `onDoubleClick` stopPropagation(`:320`)로 충돌 차단 |
| 키보드 ±24px, Enter/Space 무동작 | **통과** | `handleKeyDown`(`:187~192`) |
| ◀/▶ 접근성 | **통과** | 두 버튼 모두 `aria-label`+`title` = `tFormat(t,'common.panel.collapse',{name})`(`:311`), 레일은 `common.panel.expand`(`:250~251`), 접힌 컨테이너는 `common.panel.collapsed`(`:238`). `<Icon label="">` 로 아이콘 중복 낭독 차단. `type="button"` 명시 |
| 3패널 전부 접기 가능 | **통과(실측)** | handle0=(projects,people 또는 projects,detail), handle1=(detail,people) → 3개 모두 버튼 도달. 2패널일 때도 양쪽 커버 |
| i18n 키 실사용 | **통과** | 5키 전부 사용(`:238,250,251,268,269,311`), 미사용 키·미정의 키 0 |

---

## 4. 구현 이탈 타당성 (리포트 §7)

### 4-1. 리포트가 신고한 4건

| # | 이탈 | 판정 | 근거 |
|---|------|------|------|
| 1 | `visiblePanels` 서술자에 `defaultCollapsed` 포함 | **타당** | `panelLayout.js:52` 생산 → `ResizablePanels.jsx:99` 소비. 이게 없으면 §2-2 의 `defaultCollapsed` prop 이 **죽은 계약**이 된다. 설계 §2-4 표의 누락을 메운 것이고 다른 계약에 영향 없음 |
| 2 | 펼치기를 키 삭제가 아니라 `false` 기록 | **타당** | `panelLayout.js:107`. 삭제하면 `effCollapsed`(`ResizablePanels.jsx:99`)의 `undefined → defaultCollapsed` 분기가 다시 타서 `defaultCollapsed:true` 패널이 새로고침마다 접힌 채 복귀한다. 설계 테스트 11("접으면 해당 id만 true")과 모순 없음(테스트 통과 확인) |
| 3 | 전량 접힘 방지 렌더 폴백 | **타당** | `ResizablePanels.jsx:101`. **실측 확인**: `{collapsed:{a:true,b:true}, weights:{a:'x',b:-3,ghost:10}}` 손상값에서 첫 패널이 펼쳐지고 가중치는 `defaultWeight` 로 복구됨. 게다가 다음 토글 시 교정된 맵이 저장되어 **자가 치유**된다 |
| 4 | 중간 패널 부재 중 레이아웃 조작 시 `detail` 폭 기억 소실 | **타당 — 체감 영향 낮음** | 아래 |

**#4 사용자 체감 판단**: `persist`(`:107~109`)가 `stateRef.current.norm`(=현재 패널만 담긴 정규화 맵)을 저장하므로, `detail` 이 없는 동안 드래그/접기를 하면 저장소에서 `detail` 항목이 지워진다. 재현 경로는 **(a) detail 폭 조정 → (b) 프로젝트 선택 해제 → (c) 남은 두 패널 조작 → (d) 재선택** 4단계가 모두 필요하고, 결과는 "상세 패널이 기본 폭 24로 열림" 뿐이다. 데이터 손실·오작동이 아니고 화면도 깨지지 않는다(§7-3 계약의 자연스러운 귀결이라는 리포트 설명이 맞다). **차단 사유 아님.**
다만 (c)는 "선택 없이 좌우 폭만 조정"이라는 자연스러운 행동이라 완전 무해하진 않다. 원하면 저장만 병합하는 3줄 수정으로 해소되며 **기존 테스트·계약과 충돌하지 않는다**(레이아웃 계산은 여전히 `normalizeWeights` 가 유령 id를 버린다):

```js
// ResizablePanels.jsx:107
const persist = useCallback((nextWeights, nextCollapsed) => {
    const prev = readStored(storageKey);
    writeStored(storageKey, {
        weights:   { ...(prev?.weights   ?? {}), ...nextWeights },
        collapsed: { ...(prev?.collapsed ?? {}), ...nextCollapsed },
    });
}, [storageKey]);
```

### 4-2. 리포트에 없는 이탈 2건 (신규 발견 · 모두 수용)

| 이탈 | 위치 | 판정 |
|------|------|------|
| **키보드 리사이즈·더블클릭에서도 localStorage 기록** | `ResizablePanels.jsx:184`, `:201` | 설계 §4-2 는 영속 시점을 "드래그 종료와 접힘 토글 **순간만**"으로 못 박았다. 실동작은 합리적(안 그러면 키보드 사용자의 조정이 영영 저장 안 됨)이라 **수용**한다. 단 ArrowLeft 를 누르고 있으면 키 자동반복(~30회/s)마다 동기 `localStorage.setItem` 이 돈다 — 값이 작아 실사용 문제는 아니나 이탈 사실은 기록해 둔다 |
| `readStored(storageKey)` 를 useState 초기화에서 **2회 호출** | `:66~67` | 마운트당 localStorage 읽기 2회. 동작 영향 없음(같은 값). 한 번 읽어 구조 분해하면 없어지는 미세 낭비 |

---

## 5. 엣지 케이스

| 항목 | 판정 | 근거 |
|------|------|------|
| localStorage 손상 값 방어 | **통과(실측)** | 깨진 JSON·`getItem` throw → `readStored` 가 `null`(`panelLayout.js:204`). 배열·비객체도 거부(`:199~202`). 저장값의 `NaN`/0/음수/문자열 가중치 → `defaultWeight`, 유령 id → 폐기, 전량 접힘 → 첫 패널 강제 펼침. 저장 실패는 no-op(`:214`) |
| 패널 2개(중간 부재) | **통과(실측)** | 핸들 1개, 양쪽 접기 버튼 2개, `resolveEdgePair(…,0)=['projects','people']` |
| 한쪽이 접힌 경계 | **통과** | `resolveEdgePair` 가 접힌 패널을 건너뛰어 가장 가까운 펼친 좌/우를 잡음(단위 테스트 + 코드). 이웃이 없으면 `null` → 핸들 `data-disabled='true'` + 드래그 시작 안 함 |
| `railWidth` 렌더 | **통과(코드/DOM)** | 접힘 시 `flex: 0 0 40px` + `minWidth:40` 실측. 레일에 chevron 버튼 + `writing-mode: vertical-rl` 세로 제목(CSS:163) |
| 다크 테마 토큰 | **통과(정적 검증)** | CSS 색 9종(`--ds-border`, `--ds-border-selected`, `--ds-border-focused`, `--ds-surface`, `--ds-surface-sunken`, `--ds-text`, `--ds-text-subtle`, `--ds-background-neutral`, `--ds-background-neutral-subtle-hovered`)이 `@atlaskit/tokens` **light·dark 테마 아티팩트 양쪽에 모두 정의됨**을 실제 패키지에서 확인. 하드코딩 hex 는 `var()` 폴백에만(코드베이스 관례 준수) |
| 좁은 화면 | **통과(코드)** | `.rp-row { overflow-x:auto }`(CSS:13) — 뭉개는 대신 가로 스크롤(설계 §4-4) |
| 높이 전달 | **통과(코드)** | `.rp-panel` 은 stretch 된 flex 아이템(definite cross size) → `.rp-panel-body{height:100%}` → `Card{height:100%}` 체인 성립. 종전 대비 DOM 한 겹이 늘었으므로 §6에 브라우저 확인 항목으로 남김 |

---

## 6. 테스트 · 빌드 (직접 실행)

| 항목 | 명령 | 결과 |
|------|------|------|
| 프론트 전량 | `cd static/ui && npm test` | **70 suites / 1191 tests passed** (exit 0). `queryKeyContract`·`allocationI18n`·테이블 계약 테스트 전부 통과 = 회귀 없음 |
| CI 빌드 | `cd static/ui && CI=true npm run build` | **성공**(exit 0). CI=true 라 lint 경고도 에러 — 신규 파일 경고 0 |
| 번들 예산 | `bundle:check` | `gzip 895,179 / 950,000` → `withinBudget: true` |

**설계 §7 21케이스 ↔ 구현 27케이스 대조 — 전항 커버 확인** (누락 0)

| 설계 | 케이스 | 구현 위치 |
|------|--------|-----------|
| A 1~4 | 누락 id 채움 / falsy 자식 제거 / 유령 id 폐기 / NaN·0·음수 대체 | `panelLayout.test.js:33,39,63,69` (+ id 중복 `:53` 추가) |
| B 5~10 | 인접 2개만 변경 / 쌍 합 보존 / 양·음 대칭 / 최소폭 클램프 / 총폭 부족 무변경 / 계측 실패 무변경 | `:82,89,96,102,113,118` |
| C 11~13 | 접힘 시 가중치 유지 / 마지막 1개 거부(원본 참조) / `collapsible:false` | `:126,136,142` |
| D 14~16 | 3패널 두 경계 / 중간 접힘 / 이웃 없음 null | `:154,159,165` |
| E 17 | 쌍만 기본 비율 복원·합 유지 | `:173` |
| F 18 | 손상 JSON·throw 에서 null | `:190` (+ 정상 복원 `:199` 추가) |
| G 19~21 | 5키 존재 / kr·en 키 집합 동일 / `{name}` 토큰 일치 | `:221`(it.each 5) `:226` `:230` |

합계 5+6+3+3+1+2+7 = **27**. 리포트의 "21케이스 전부 포함, 일부 세분화해 27" 주장이 사실임을 확인했다. 테스트가 **생성물이 아니라 `locales/{kr,en}/common.json` 소스**를 읽는 점(`:214~217`)도 `allocationI18n.test.js` 관례대로다.

---

## 7. i18n

| 항목 | 판정 | 근거 |
|------|------|------|
| `locales/kr/common.json` · `locales/en/common.json` 에 `panel.*` 5키 | **통과** | `git diff` 상 **+7행씩 순수 추가**(기존 키 무수정), `table` 과 같은 최상위 층위 |
| merge 실행 반영 | **통과** | `ko-KR.json`/`en-US.json` 의 `common.panel` 객체에 5키 kr·en 모두 존재 확인(merge.js 는 파일명을 네임스페이스로 감싸는 **중첩** 산출물이라 `common.panel.*` 평면 키로는 검색되지 않는다 — 구조 확인 후 검증) |
| ko-KR/en-US 직접 수정 없음 | **통과** | 두 파일의 diff 가 merge 산출물 형태와 일치(수기 편집 흔적 없음) |
| `locales/script/*.json`(빈 스텁)에 넣지 않음 | **통과** | 해당 파일 무변경 |
| `{name}` 치환 | **통과** | `tFormat(t, key, {name})` 사용(`utils/i18n.js:14` — Forge `t()` 가 치환 미지원이라 필수). kr·en 토큰 일치 |

> 참고: 워킹 트리에 **다른 작업의 미커밋 변경**(`table.css`/`CommonTable`/`ProjectCard` 등 약 35파일)이 섞여 있고 `ko-KR.json`/`en-US.json` 에 그쪽 키가 함께 merge 돼 있다(리포트 §1 경고와 일치). 이번 기능 파일 자체에는 오염이 없다 — 이 기능의 변경은 `locales/{kr,en}/common.json` 2개 + `ProjectAssignmentBoard.jsx` 1개 + 신규 4개로 정확히 한정된다.

---

## 8. 미검증 (브라우저 실행 필요 — 추측으로 통과 처리하지 않음)

다음은 jsdom·정적 분석으로 판정할 수 없다. **E2E 별건**으로 남긴다.

1. 접기/펼치기 시 옆 패널이 실제로 넓어지는 **체감**(flex 재분배는 코드·DOM 속성까지만 확인, 실제 레이아웃 계산은 jsdom이 하지 않음)
2. **16px 히트 영역 체감** 및 드래그 중 최소폭에서의 정지 지점(픽셀 계측이 실브라우저 필요)
3. **다크 테마 실렌더** — 토큰 정의 존재는 확인했으나 레일(`--ds-surface-sunken`)·핸들(`--ds-border-selected`) 대비가 충분한지는 눈으로 봐야 한다
4. `/resource` 탭 전환 후 복귀 / 라우트 이탈 후 복귀 / 새로고침에서의 상태 유지 (Atlaskit Tabs 의 `visited` 유지 가정은 설계 §4-1 의 실코드 조사에 근거하나 실행 확인은 안 됨)
5. `.rp-panel → .rp-panel-body → Card` 로 DOM 한 겹이 늘어난 뒤의 **높이 100% 전파 및 카드 내부 스크롤**
6. 가로 스크롤바 발생 시 78vh 행 내부 높이 잠식 정도
7. 배정 실행(개별·팀 전체)·배정 취소·드로어/모달 무회귀 — 코드상 무접촉(§1)이나 실동작 확인은 미수행

---

## 9. backend / frontend 재작업 지시

**없음.** 실패 항목 0건. §4-1 #4(저장 병합 3줄)와 §4-2(이탈 2건)는 선택 개선이며, 적용하지 않아도 계약·테스트·사용자 경험에 결함이 남지 않는다.

---
---

# v2 검증 — 접기 버튼 상단 이동 + 3개 화면 확산

> 기준: `01_architect_design_v2.md`(delta 설계) / 대조: `02_frontend_report_v2.md` + 실소스
> 검증일: 2026-08-12 · 기준 커밋 `6c23175`(#RFC-185, v1)
> 경계면은 v1과 동일하게 **`ResizablePanels`/`Panel` props ↔ 호출부(이제 4곳)** 한 축. 백엔드·DB·권한·쿼리키 변경 0.

## V0. 판정 요약

| 분류 | 건수 | 비고 |
|------|------|------|
| **통과** | 41 | v1 회귀 0, D1·D2·D4 계약 전항, 3화면 무회귀 18항목, 테스트/빌드 |
| **실패** | 0 | 차단 결함 없음 |
| **경미한 이탈(수용)** | 2 | 리포트 미신고 1건 포함 — §V6 |
| **미검증** | 8 | 브라우저 필요(시각·체감·테마) + disabled 툴팁 표시 여부 |

**결론: 통과.** 재작업 지시 사항 없음.

> 워킹 트리에 다른 트랙의 미커밋 변경(`gantt/GanttChart.jsx`·`gantt.css`, `cost/CostByIssueTable.jsx`, `CostCalculator.js`·그 테스트, `ProgressCalculator.js`, `.gitignore`)이 섞여 있다. **v2 범위 밖으로 판단해 검증 대상에서 제외**했으며, 아래 판정에 영향을 주지 않았다.

## V1. v1 회귀 없음

| 항목 | 판정 | 근거 |
|------|------|------|
| **공개 API 무변경** | **통과** | `ResizablePanels` props 7종 destructuring(`ResizablePanels.jsx:65~73`)과 `Panel`(`:364`)이 **diff에 전혀 등장하지 않는다**(diff의 `+/-` 라인을 시그니처 패턴으로 필터링해 확인 — 0건). 설계 §0의 "바뀌었다면 그것이 결함" 조건 충족 |
| **`ProjectAssignmentBoard.jsx` 무수정** | **통과** | `git status` 전체 목록에 없음. v1 적용처는 한 글자도 안 바뀌었다 |
| **v1 순수 함수 무수정** | **통과** | `panelLayout.js` diff가 **순수 추가 2 hunk(+39)** 뿐 — `visiblePanels`/`normalizeWeights`/`expandedIds`/`canCollapse`/`toggleCollapsed`/`resolveEdgePair`/`applyPanelResize`/`resetPair`/`readStored`/`writeStored` 본문 변경 0 |
| **v1 테스트 27케이스 유효** | **통과** | 테스트 diff가 추가만(+71). 기존 27케이스 본문 수정은 `PANEL_KEYS` 배열에 `collapseBlocked` 1개를 더한 것뿐(계약이 넓어진 것을 반영) |
| **v1 저장값 호환** | **통과(실측)** | 저장 shape `{weights,collapsed}` 무변경. `{weights:{a:70,b:30},collapsed:{b:true}}` 를 심고 렌더 → `flex: 70 1 0` + `data-collapsed='true'` 복원 확인. 배정 화면 사용자의 기존 레이아웃이 유지된다 |
| `cloneElement` 0건 | **통과** | `components/layout/` 전역 grep 0건. `Panel` 은 여전히 `<>{children}</>` |

## V2. D1 — 접기 버튼 핸들 → 상단 바 (**실측 검증**)

렌더 테스트 8케이스를 직접 작성·실행해 확인했다(실행 후 삭제, `git status` 로 워킹 트리 청결 확인).

| 계약(설계 §1-2) | 판정 | 실측/실코드 |
|------|------|------|
| **핸들에서 접기 버튼 완전 제거** | **통과(실측)** | 핸들 2개 각각 `querySelectorAll('button').length === 0`, 자식이 정확히 1개이며 그 className 이 `rp-handle-line`. 문서 전체에 `.rp-handle-actions`·`.rp-icon-btn` **0개**. CSS 에서도 두 규칙 삭제됨. 핸들은 순수 리사이즈 전용(`:301~321`) |
| 바 렌더 조건 `panels.some(collapsible)` | **통과(실측)** | `hasCollapsibleAny`(`panelLayout.js:100`) → `showBar`(`:236`). 전부 `collapsible:false` 면 `.rp-panel-bar` **0개** 확인 |
| 상단 24px 바 | **통과** | `.rp-panel-bar { height:24px; flex-shrink:0 }`(CSS:46~51). `.rp-panel` 이 `flex-direction:column` 으로 바뀌고 `.rp-panel-body` 가 `height:100%` → `flex:1 1 auto; min-height:0` 로 전환(CSS:17~33) — 바 24px 을 뺀 나머지를 본문이 차지 |
| 바가 본문보다 위 | **통과(실측)** | 패널 자식 순서 `['rp-panel-bar','rp-panel-body']` |
| **접히는 방향 정렬** | **통과(실측)** | 3패널 바의 `justify-content` = `['flex-start','flex-start','flex-end']`. `collapseDirection`(`panelLayout.js:90`)이 마지막만 `'right'` |
| chevron-**double** 아이콘 | **통과** | `ChevronDoubleLeft/RightIcon` import(`:2~3`), 단일 chevron import **제거**됨(diff 확인) |
| **disabled + 사유 툴팁**(감추지 않음) | **통과(실측)** | a·b 접은 뒤 c 버튼이 **사라지지 않고** `disabled===true`, `title='common.panel.collapseBlocked'`, `aria-label='common.panel.collapse'` 유지. v1처럼 사라져 정렬이 흔들리는 문제 해소 |
| `type="button"`·아이콘 `label=""` | **통과** | `CollapseButton:338~346` |
| 히트 16px·pointer capture·더블클릭·키보드 v1 그대로 | **통과** | 해당 코드 블록(`:140~230`)이 diff 밖(`persist` 호출 시그니처만 동일 유지) |

## V3. D2 — 레일 전체 클릭 (**실측 검증**)

| 계약 | 판정 | 실측 |
|------|------|------|
| **단일 `<button class="rp-rail">`, 중첩 버튼 0** | **통과(실측)** | 레일 내부 `button` 0개 → v1의 유효하지 않던 button-in-button HTML 해소 |
| 레일 전체가 히트 영역 | **통과(실측)** | 세로 제목 `span` 클릭이 버블링돼 펼쳐짐. CSS 로 `.rp-rail{ flex:1 1 auto; width:100% }` → 40px × 패널높이 전체 |
| 아이콘 = **접힘 방향의 반대** | **통과** | `direction==='right' ? Left : Right`(`:275~277`) — 왼쪽으로 접힌 패널은 오른쪽 chevron 으로 펼친다. 논리 정방향 |
| `role="group"` + `aria-label` | **통과(실측)** | 접힌 `.rp-panel` 에 `role='group'`·`aria-label='common.panel.collapsed'`(`:257~260`). v1에서 role 없이 `aria-label` 만 있어 무시되던 것을 교정 |
| 접힌 패널엔 바 없음 | **통과(실측)** | `.rp-panel-bar` null |
| 접어도 언마운트 없음(v1 불변식) | **통과(실측)** | 접힘·펼침 왕복 후 프로브 마운트 카운트 불변, DOM 잔존 |

## V4. D3 — 3개 화면 데이터 흐름 무회귀

각 화면의 `git diff -U0` 에서 **레이아웃/`<Panel>`/주석 라인을 전부 걸러낸 뒤 남는 변경 라인**을 전수 나열했다. 결과가 이 검증의 핵심 증거다.

| 화면 | 남은 변경 라인 | 판정 |
|------|---------------|------|
| `AssignmentPage.jsx` | 옛 행 컨테이너 `style={{display:flex …}}` 삭제 **only** | **통과** |
| `ProjectTreeView.jsx` | `splitRowStyle` 상수 삭제 + `height: PANEL_HEIGHT` → `'100%'` **2곳** — **설계 §4-B 필수 내부 수정 2건과 정확히 일치**(승인분) | **통과** |
| `WorklogPage.jsx` | `import {Box, Inline, xcss}` → `{Box}` + 옛 `<Inline>`/`<Box xcss>` 래퍼 삭제 **only** | **통과** |

**즉 세 파일 어디에도 훅 호출·`invoke`·`invalidateQueries`·`useState/useEffect/useMemo`·자식 prop 라인이 추가·삭제·수정된 것이 하나도 없다.** 설계 §4-A/B/C 무회귀 체크리스트 18항목(6×3)은 이 사실로 구조적으로 충족된다.

| 체크리스트 | 판정 | 근거 |
|------|------|------|
| A① 훅 5종 / A② `resolveQueueSelection`·`projectKeys` effect / A④ `runAssign` 4분기·**배정 후 invalidate 금지** / A⑤ 조기 반환 | **통과** | 전부 diff 밖(파일 `:1~268` 무수정) |
| A③ `WorkQueuePanel`·`CandidatePanel` prop | **통과** | prop 라인이 **문맥(context) 라인**으로만 등장 = 무변경 |
| B① `useGanttData`·mutation·모달 / B③ DnD 4경로·`resolveTreeDrop` / B④ 필터 prop 경로 / B⑤ 조기 반환 / B⑥ lazy·Suspense | **통과** | diff 밖. `ResizablePanels` 는 **정적 import** 라 새 Suspense 경계가 생기지 않는다(#426 위험 없음) |
| B② `TreeStructurePanel`/`TreeDetailPanel` prop | **통과** | 문맥 라인만(`t={t}` 등) |
| C① 훅 4종·top-level `view.getContext()` / C③ 캘린더 4종·`executeRequest` / C④ 모달·invalidate 3키 / C⑤ `MyLogSummary` 행 바깥 / C⑥ `viewMode` 독립 | **통과** | diff 밖. `MyLogSummary` 는 `<ResizablePanels>` 앞에 그대로 → `calc(100vh - 127px)` 전제 유지 |
| C② `MyProjectList`/`ViewModeToggle`/`MyIssueTable`/`CustomFullCalendar`·`calendarRef` | **통과** | 문맥 라인만 |
| 미사용 import 정리 | **통과** | `Inline`·`xcss` 잔여 사용 0건(주석 1줄 제외), `Box` 는 계속 사용. `CI=true` 빌드 통과가 이를 재확인 |
| 적용 파라미터 | **통과** | A `queue`26/300·`candidates`74/360·`projectDetail.assignmentPanels.layout` / B `structure`40/320·`detail`60/420·`projectDetail.workTreePanels.layout`·`minHeight 480` / C `projects`20/260·`main`80/880·`myWork.panels.layout`·`height='calc(100vh - 127px)'`·`minHeight 520` — **설계 §4-A/B/C 표와 전부 일치**. `storageKey` 에 `project_id` 포함 0건 |
| FullCalendar 통지 미추가 | **통과** | `ResizablePanels` 에 window resize 디스패치·layout 이벤트 0건 — 설계 §4-C 지시대로 `CustomFullCalendar` 의 `ResizeObserver` 에 맡김 |

## V5. D4 — v1 잔여 2건 해소

| 항목 | 판정 | 근거 |
|------|------|------|
| **저장 병합** | **통과(실측)** | `mergeStored`(`panelLayout.js:238`) + `persist`(`:123~129`). 저장에 `ghost` 를 심고 다른 패널을 토글해도 `weights.ghost=44`·`collapsed.ghost=true` **보존**됨을 실측. v1이라면 지워졌다 → v1 리포트 §4-1#4 **해소 확인** |
| **`readStored` 중복 호출** | **통과** | `const [initial] = useState(() => readStored(storageKey) ?? {})`(`:77`) 1회 → 두 state 가 같은 스냅샷 사용(`:78~79`) |
| 계약 불변 | **통과** | 레이아웃 계산은 여전히 `normalizeWeights` 가 유령 id 를 버린다(테스트 4번 통과) — "저장은 넉넉히, 계산은 좁게" 분리 성립 |

## V6. 설계 이탈 타당성

### 리포트가 신고한 3건

| # | 이탈 | 판정 | 근거 |
|---|------|------|------|
| 1 | 트리 레일 키를 `work.tree.panel.{structure,detail}` 로(설계는 `work.tree.{…}`) | **타당 — 이탈이 아니라 필수 회피** | **하드 증거**: `projectDetail.work.tree.detail` 은 **하위 33키를 가진 객체**다(merge 산출물에서 확인). 설계대로 그 자리에 문자열을 넣었다면 33키가 통째로 사라져 트리 상세 화면 전체가 깨진다. 설계 §5 자체가 "기존 키 확인 후 결정"을 지시했고 구현이 그대로 따랐다. 게다가 테스트가 `tree.detail` 이 **객체로 남아 있는지** 회귀 검사까지 한다(`panelLayout.test.js:301~303`) |
| 2 | `collapsible:false` 패널에도 **빈 상단 바** | **타당** | 실측: 2패널 중 하나만 `collapsible:false` → 바 2개, 첫 바의 버튼 0개. 바 높이가 패널마다 달라지면 본문 상단선이 어긋난다. 설계 §1-2의 "바 렌더 조건은 **행 단위**" 규칙의 직접적 귀결이며, 행 전체가 접기 불가면 바 자체를 안 그린다(실측 확인)는 예외도 지켜졌다 |
| 3 | 테스트 34 → **36** | **타당** | 설계 28~34를 세분화. 실카운트 검증: v1 27 + `collapseDirection` 3 + `hasCollapsibleAny` 1 + `mergeStored` 2 + 트리 키 `it.each` 2 + `PANEL_KEYS` +1 = **36**. 설계 케이스 누락 0 |

### 리포트에 없는 이탈 1건 (신규 발견 · 수용)

| 이탈 | 위치 | 판정 |
|------|------|------|
| `persist` 가 매 호출마다 `readStored`(localStorage **읽기**)를 한 번 더 한다 | `ResizablePanels.jsx:127` | 병합의 대가로 저장 1회당 read+write 2 op. 드래그 종료·토글은 드물어 무해하나, **v1에서 이월된 "키보드 화살표도 저장"**(`:203`, v1 리포트 §4-2)과 겹치면 방향키 자동반복 시 초당 ~30×2 op 가 된다. 값이 수백 바이트라 실사용 문제는 아니며 v2가 만든 문제도 아니다 — 기록만 남긴다 |

## V7. 테스트 · 빌드 (직접 실행)

| 항목 | 명령 | 결과 |
|------|------|------|
| 프론트 전량 | `cd static/ui && npm test` | **70 suites / 1200 tests passed** (exit 0). v1 1191 → **+9** = 신규 9케이스, **기존 테스트 회귀 0** |
| CI 빌드 | `cd static/ui && CI=true npm run build` | **성공**(exit 0). 미사용 import 정리가 필요했던 `WorklogPage` 포함 신규 에러 0 |
| 번들 예산 | `bundle:check` | `gzip 897,531 / 950,000` → `withinBudget: true`. v1 895,179 대비 **+2,352B**(설계 예상 ~2KB 부합, 신규 의존성 0) |
| 레이아웃 단위 | (전량에 포함) | `panelLayout.test.js` **36 케이스** — 설계 §6 의 28~34 전항 매핑 확인 |

## V8. i18n

| 항목 | 판정 | 근거 |
|------|------|------|
| `common.panel.collapseBlocked` kr/en | **통과** | 소스 diff 각 +1행(기존 5키 무수정), merge 산출물에도 반영 확인 |
| 트리 2키 kr/en | **통과** | `work.tree.panel.{structure,detail}` = 계층 구조/상세 · Structure/Details, merge 반영 확인 |
| **실사용 키 전수 해석** | **통과** | 3화면이 쓰는 `assignment.queue.title`·`assignment.candidate.title`·`worklog.layout.project`·`worklog.layout.task` + 신규 3키를 **merge 산출물에서 실제 값까지 조회**해 전부 존재 확인(미해석 키 0) |
| ko-KR/en-US 직접 수정 없음 | **통과** | 산출물 형태 유지, 소스 편집 흔적 없음 |
| `locales/script/*` 미사용 | **통과** | 무변경 |
| 토큰 일치 | **통과** | `collapseBlocked` 는 치환 토큰 없음(kr·en 동일), 테스트가 검사 |

## V9. 미검증 (브라우저 필요 — 추측 통과 없음)

1. 상단 바 24px 이 생긴 뒤 **v1 배정 화면 3패널의 카드 높이·내부 스크롤**(`.rp-panel-body` 가 `height:100%` → `flex:1 1 auto` 로 바뀌어 Card/Box 의 `height:100%` 가 flex 로 확정된 높이에 기대게 됐다 — 표준 동작이지만 실렌더 확인 필요)
2. **트리 뷰 80vh 가 한 번만 적용**되는지(`height:'100%'` 전환 효과) — 두 배로 길어지지 않아야 한다
3. **My Work 좌측 폭이 20:80 으로 실제 바뀌는 것** — 설계·리포트가 경고한 의도된 시각 변화. 릴리스 노트 반영 필요
4. `flexWrap:'wrap'` 소멸에 따른 좁은 화면 트리 뷰 동작(2줄 → 가로 스크롤)
5. **disabled 접기 버튼의 `title` 툴팁이 실제로 뜨는지** — Chrome 은 `disabled` 폼 컨트롤에 마우스 이벤트를 전달하지 않아 툴팁이 안 뜨는 경우가 있다. CSS 에 `pointer-events:none` 은 없어 가능성은 남지만 확인 필요. 안 뜨면 사유 전달이 `opacity:0.4` 뿐이므로, 필요 시 `disabled` 대신 `aria-disabled="true"` + no-op `onClick` 으로 바꾸거나 버튼을 `title` 을 가진 `<span>` 으로 감싸면 된다(계약 변화 없음)
6. 레일 chevron 과 이웃 바 버튼의 y 정렬(`padding-top:4px` 로 맞춘 값)
7. 다크 테마 실렌더 — 신규 색은 v1에서 이미 검증한 토큰만 재사용(`--ds-text-subtle`/`--ds-background-neutral-subtle-hovered`/`--ds-border-focused` 등, light·dark 양쪽 정의 확인 완료)
8. 화면별 실동작: A 큐 sticky 필터·배정/해제, B DnD 4경로·폴더 모달·tree↔gantt 필터, C 캘린더 폭 재계산(ResizeObserver)·표 전환·워크로그 드래그

## V10. 재작업 지시

**없음.** 실패 0건. §V6의 신규 이탈 1건과 §V9-5(disabled 툴팁)는 기록·확인 사항이며 커밋을 막지 않는다.

---
---

# v3 검증 — 접기 버튼을 카드 안으로

> 기준: `02_frontend_report_v2.md` 의 「v3」 섹션(사용자 요구 **"버튼은 카드 안에 넣어줘"**) / 대조: 실소스
> 검증일: 2026-08-12 · diff 기준은 **v1 커밋(`6c23175`)** — v2 는 미커밋이므로 아래 diff 는 v1→v3 누적분이다(v2 델타는 §V 섹션에서 이미 검증됨).
> 백엔드·DB·권한·쿼리키·i18n 신규 키 **0**. 다른 트랙 미커밋 변경(gantt·cost·progress·`.gitignore`)은 지시대로 계속 제외.

## W0. 판정 요약

| 분류 | 건수 | 비고 |
|------|------|------|
| **통과** | 27 | 공용 API 계약, D1 상단바 제거, aria-disabled 전환, 4화면 배치, 테스트/빌드 |
| **실패** | 0 | 차단 결함 없음 |
| **관찰/개선 제안** | 3 | 전부 비차단 — §W5 |
| **미검증** | 4 | 브라우저 필요 |

**결론: 통과.** 재작업 지시 없음.

## W1. 공용 컴포넌트 — 계약 무변경 + export 추가만

| 항목 | 판정 | 근거 |
|------|------|------|
| **`.rp-panel-bar` 완전 제거** | **통과(정적+실측)** | `static/ui/src/` 전역 grep 에서 `rp-panel-bar`·`rp-icon-btn`·`rp-handle-actions` **0건**(JSX·CSS 양쪽). 렌더 실측에서도 `.rp-panel-bar` 0개. v2 의 24px 바가 흔적 없이 사라졌다 |
| **기존 props 계약 무변경(추가만)** | **통과** | `ResizablePanels`(`:73`)·`Panel`(`:395`) 시그니처 라인이 diff에 **0건**. export 는 `default ResizablePanels` / `Panel` / **`PanelToggleButton`(신규)** 3종 — 순수 추가 |
| **컨텍스트는 비공개** | **통과** | `PanelsContext`(`:31`)·`PanelIdContext`(`:33`) 모두 `const`, **export 안 함** → 외부에서 상태를 직접 만질 수 없다. 호출부는 버튼을 통해 읽기·토글만 한다(v1 §4-2 "상태는 컴포넌트 소유" 유지) |
| **컨텍스트 밖 사용 시 null** | **통과(실측)** | `<ResizablePanels>` 밖에서 `<PanelToggleButton/>` 렌더 → 버튼 **0개**, 카드 본문은 정상. 같은 카드를 다른 화면에서 재사용해도 안전(`:359` `if (!api || !id) return null`) |
| **`collapsible:false` 미렌더** | **통과(실측)** | 2패널 중 `collapsible={false}` 쪽에는 버튼이 안 그려지고 나머지 1개만 렌더(`:362`) |
| `panelId` 생략 시 컨텍스트 폴백 | **통과(실측)** | `PanelIdContext.Provider` 가 패널 본문을 감싼다(`:303~305`) → `panelId` 없이도 자기 패널을 접는다 |
| 핸들은 여전히 리사이즈 전용 | **통과(실측)** | 핸들 자식 1개(`rp-handle-line`), 내부 `button` 0개 |
| 접힘 레일 v2 유지 | **통과(실측)** | 단일 `button.rp-rail`(중첩 버튼 0), `role="group"`, 레일 제목 클릭으로 펼침, **children 마운트 유지**(접기·펼치기 왕복 후 마운트 카운트 불변) |
| i18n 신규 키 0 | **통과** | `locales/` diff 가 v2 분(common +1, projectDetail +4) 그대로 — v3 추가분 0. `collapse`/`collapseBlocked`/`expand`/`collapsed` 재사용 |
| 순수 모듈 무변경 | **통과** | `panelLayout.js` diff 는 v2 의 +39 그대로(v3 추가 0), 테스트 36케이스 유효 |

## W2. 마지막 패널 — `disabled` → `aria-disabled` (접근성 판정)

v2 검증 §V9-5에서 **미검증으로 남겼던 크롬 툴팁 이슈를 v3가 정면으로 해결**했다.

| 항목 | 판정 | 실측 |
|------|------|------|
| `disabled` 속성 미사용 | **통과** | `btn.disabled === false`, `hasAttribute('disabled') === false` (v2는 `true` 였다) |
| `aria-disabled="true"` | **통과** | `aria-disabled={blocked \|\| undefined}`(`:373`) — 정상 상태에서는 속성 자체가 안 붙는다(불필요한 `false` 노출 없음) |
| 툴팁 사유 | **통과** | `title='common.panel.collapseBlocked'`, 정상 시 `common.panel.collapse` |
| 클릭 무효 | **통과(실측)** | `onClick={() => { if (!blocked) api.toggle(id); }}`(`:374`) — 클릭해도 `data-collapsed` 가 `false` 유지 |
| 스타일 전환 | **통과** | CSS `:disabled` → `[aria-disabled='true']` 로 이동, hover 도 `:not([aria-disabled='true'])` 로 갱신 |

**접근성 판정: 문제 없음 — 오히려 개선.**
- **키보드 도달성**: 버튼이 포커스 가능해졌다(실측: `focus()` 후 `document.activeElement` 일치). `disabled` 였을 때는 탭 순서에서 빠져 키보드 사용자가 **버튼의 존재조차 알 수 없었다**. ARIA 저작 관행이 "비활성이지만 발견 가능해야 하는 컨트롤"에 권장하는 패턴 그대로다.
- **스크린리더**: `aria-disabled="true"` 로 "사용할 수 없음"이 전달되고, `aria-label` 은 blocked 여부와 무관하게 `common.panel.collapse` 로 일관된다(레이블이 상태에 따라 흔들리지 않는다).
- **오작동 위험 없음**: Enter/Space → `onClick` → `blocked` 가드로 no-op.
- 다만 `title` 은 스크린리더가 반드시 읽어 주지는 않는다(브라우저·SR 조합에 따라 다름). **시각 사용자에게는 툴팁으로, SR 사용자에게는 `aria-disabled` 로** 사유의 정밀도가 갈린다 — 필요하면 blocked 일 때 `aria-describedby` 를 붙이면 되지만, "마지막 패널이라 못 접는다"는 맥락이 화면에서 자명하므로 **이번 범위에서는 과잉**으로 판단한다.

## W3. 4개 화면 배치 — 데이터 흐름 무회귀

**검증 방법**: 각 파일에 `git diff -w`(공백 무시)를 적용해 **재들여쓰기를 제거한 순수 의미 변경**만 남기고, 별도로 훅/`invoke`/`invalidateQueries`/상태 setter 패턴으로 전수 스캔했다.

| 화면 | 의미 변경 라인(공백 무시) | 판정 |
|------|--------------------------|------|
| **ProjectAssignmentBoard**(v1 화면) | import 1줄 + `<PanelToggleButton panelId="projects\|detail\|people" />` 3개 + fragment 래퍼 — **정확히 그것뿐** | **통과** |
| **AssignmentPage** | import 1줄 + `headerExtra={<PanelToggleButton panelId="queue\|candidates" />}` 2줄 | **통과** |
| **WorkQueuePanel** | 주석 1 + `headerExtra = null` 기본값 + `{headerExtra}` 렌더 + fragment (총 5줄) | **통과** |
| **CandidatePanel** | 주석 1 + `headerExtra = null` + `{headerExtra}` (총 3줄) | **통과** |
| **ProjectTreeView** | 셸 Box `flexDirection:'column'` 2곳 + 버튼 줄 `div` 2개 (+v2분) | **통과** |
| **WorklogPage** | import + `headerRight={<PanelToggleButton .../>}` 신설 1 + `ViewModeToggle` 뒤 버튼 1 + fragment (+v2분) | **통과** |

**훅·`invoke`·`invalidateQueries`·`useState/useEffect/useMemo/useCallback`·mutation·`executeRequest` 라인 변경은 6개 파일 통틀어 0건이다.** 스캔에 걸린 것은 전부 fragment 로 감싸며 생긴 **+4칸 재들여쓰기**뿐이며(`onChange={setSearch}`, `onChange={(partial) => {`, `onChange={(mode) => {`), 공백 무시 diff 에서 사라지는 것으로 의미 변경이 아님을 확인했다.

| 세부 확인 | 판정 | 근거 |
|-----------|------|------|
| ProjectAssignmentBoard **의도된 headerRight 수정** | **통과** | `PeopleTeamFilter` 의 `onChange` 본문·`bulk` 객체(`visible/disabled/reason/count/onClick`)가 **문자 단위로 동일**, 들여쓰기만 이동. 중간 카드는 없던 `headerRight` 를 신설(`Card` 가 지원하는 기존 prop) |
| `headerExtra` **표시 전용** | **통과** | 두 패널 모두 `headerExtra = null` 기본값 + JSX 에 `{headerExtra}` 를 꽂을 뿐 — 조건 분기·상태·데이터 가공 **0**. `WorkQueuePanel` 은 `headerRight` 안, `CandidatePanel` 은 기존 헤더 `<span>` 끝 |
| `headerExtra` **폭발 반경** | **통과** | 두 컴포넌트를 import 하는 파일은 **`AssignmentPage.jsx` 단 하나**(전역 grep 확인, 나머지 grep 히트 2건은 주석). 기본값이 있어 기존 호출부 영향 0 |
| ProjectTreeView **트리 렌더 분기 무수정** | **통과** | `TreeStructurePanel`·`TreeDetailPanel` 이 **`git status` 에 없다**(무수정). DnD 4경로·`resolveTreeDrop`·드롭존 조건·모달 전부 diff 밖 |
| ProjectTreeView **column 전환의 레이아웃 안전성** | **통과(코드)** | 셸이 `row`→`column` 이 되어 자식이 주축(세로)을 채워야 하는데, 두 트리 패널 루트가 **이미 `flex: 1` + `height:'100%'` + `minHeight: 0` + `width:'100%'` + `minWidth: 0`** 을 갖고 있다(`TreeStructurePanel.jsx:92~99`, `TreeDetailPanel.jsx:88~96`) → 버튼 줄(`flexShrink:0`)을 뺀 잔여 높이를 그대로 채우고, 교차축은 `align-items:stretch` 로 폭을 채운다. 내부 `overflow:auto` 도 `minHeight:0` 덕에 유지 |
| 버튼 정렬 | **통과** | 좌 패널 `justifyContent:'flex-start'`, 우 패널 `'flex-end'` — 접히는 방향과 일치 |
| **panelId ↔ Panel id 일치** | **통과** | 8개 사용처 전수 대조: `projects/detail/people`(배정 보드), `queue/candidates`(작업 배정), `structure/detail`(트리), `projects/main`(My Work) — **전부 대응하는 `<Panel id>` 존재** |

## W4. 테스트 · 빌드 (직접 실행)

| 항목 | 명령 | 결과 |
|------|------|------|
| 프론트 전량 | `cd static/ui && npm test` | **70 suites / 1200 tests passed** (exit 0). v2와 동일 — 회귀 0 |
| CI 빌드 | `cd static/ui && CI=true npm run build` | **성공**(exit 0). 신규 lint 에러/경고 0 |
| 번들 예산 | `bundle:check` | `gzip 897,675 / 950,000` → `withinBudget: true`. v2 897,531 대비 **+144B**(리포트 수치와 일치), v1 대비 +2,496B |
| 임시 렌더 검증(검증자 자체 작성) | 8케이스 | **전부 통과** — 실행 후 삭제, `git status` 로 워킹 트리 청결 확인 |

## W5. 이탈 타당성 + 관찰

### 리포트가 신고한 2건

| # | 이탈 | 판정 | 근거 |
|---|------|------|------|
| 1 | `WorkQueuePanel`·`CandidatePanel` 에 `headerExtra` prop 신설 | **타당** | 두 카드를 **패널 컴포넌트가 소유**하므로(페이지가 아니라) 사용자 요구 "카드 안 배치"를 지키려면 헤더 슬롯이 필요하다. 대안인 children clone 은 v1 계약 §2-2 불변식 1 위반이라 **선택지가 아니었다**. 실제 추가분은 표시 전용 3~5줄, 기본값 `null`, 유일 호출부 1곳 → v2 체크리스트 A③("prop 추가·삭제·개명 0")의 의도적 예외로 명시된 것도 정직하다 |
| 2 | `hasCollapsibleAny` 를 컴포넌트가 안 쓰지만 `api.hasCollapsible` 로 노출 유지 | **타당(경미)** | 상단 바가 사라져 내부 소비자는 없어졌다. 호출부가 "헤더 자리를 잡을지" 판단할 유일한 신호라는 설명은 합리적이나, **현재 4개 화면 중 이를 쓰는 곳은 0곳**이다 — 즉 지금은 예비 API다. export·테스트(v2 케이스 31)가 그대로 유효해 죽은 코드로 방치되진 않는다. 제거를 권하지 않는다(다음 확산 화면에서 쓰일 여지) |

### 검증자 관찰 3건 (전부 비차단)

| # | 관찰 | 영향 | 제안 |
|---|------|------|------|
| 1 | **`panelId` 오타는 조용히 사라진다** — 없는 id 를 주면 경고 없이 `return null`(실측 확인) | 접기 버튼이 **에러 없이 증발**한다. 문자열 id 를 호출부가 직접 적는 구조라 리팩터링 시 실수 여지가 있다 | 이번 8개 사용처는 전수 대조로 **전부 일치 확인**. 원한다면 개발 빌드에서만 `console.warn` 한 줄, 또는 `panelId` 생략 + 컨텍스트 폴백을 기본 사용법으로 권장(이미 동작 확인됨) |
| 2 | 트리 패널 2종 루트의 인라인 주석이 **낡았다** — "부모가 flex **row** 라 width 를 명시하지 않으면…"인데 v3에서 부모가 `column` 이 됐다 | 동작은 정상(§W3 확인). 문서 드리프트만 | 주석 2줄을 "부모가 flex column" 으로 갱신(선택) |
| 3 | v1에서 이월된 **키보드 리사이즈·더블클릭 시 localStorage 기록**(설계 §4-2는 "드래그 종료·접힘 토글만") + v2의 `persist` 내 `readStored` 추가 읽기 | 방향키 자동반복 시 op 증가. 실사용 영향 없음 | v3가 만든 문제 아님 — 기록만 유지 |

## W6. 미검증 (브라우저 필요)

1. **마지막 펼침 패널 버튼의 툴팁이 크롬에서 실제로 뜨는지** — `disabled` 제거로 마우스 이벤트가 살아났으므로 뜰 것으로 예상되나, v2에서 이 항목을 잘못 통과시키지 않기 위해 **실렌더 확인 전까지 미검증 유지**
2. 4개 화면에서 접기 버튼이 검색·필터·토글과 **한 줄에 나란히** 정렬되는지(카드 헤더 폭이 좁을 때 줄바꿈 여부 포함)
3. **트리 뷰 버튼 줄(약 20px)이 내용과 겹치지 않는지**, 80vh 안에서 내부 스크롤이 정상인지
4. My Work 20:80 시각 변화(v2에서 이월), 다크 테마 실렌더

## W7. 재작업 지시

**없음.** 실패 0건. §W5 관찰 3건은 전부 선택적 개선이며 커밋을 막지 않는다.
