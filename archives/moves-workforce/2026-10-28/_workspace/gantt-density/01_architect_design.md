# 간트 차트 표시 밀도 개선 설계서

## 1. 개요 / 영향 범위

프로젝트 상세 간트에서 한 화면에 표시되는 행 수를 늘린다. 현재 `GanttChart.jsx`가 `cellHeight={52}`를 고정해 그리드 행·타임라인 행·헤더가 모두 크게 잡히고, Willow 테마 기본 글꼴(`14px`)과 별도 확대한 트리 토글(`24px`)이 이를 더 키운다.

목표값은 **행/헤더 높이 52px → 40px**, 그리드·막대 글꼴 **기본 14px → 12px**, 타임스케일·마커 라벨 **12px → 11px**이다. 같은 가시 영역에서 약 30% 더 많은 행을 볼 수 있다. 40px은 현재 인라인 편집 input(30px), Select control(최소 32px), small avatar(24px)를 잘라내지 않는 최소 안전 높이다.

- 백엔드: 변경 없음. resolver·응답 계약·DB·권한은 그대로다.
- 프론트: `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`, `static/ui/src/pages/projectDetail/gantt/gantt.css`만 수정한다.
- DB: 변경 없음.
- i18n: 변경 없음. 표시 문자열을 추가하지 않는다.
- 제외: 프로젝트/이슈 트리 구조, 스크롤, 드래그·리사이즈 hit area, 편집 동작, 열 폭은 변경하지 않는다.

## 2. 경계면 계약 (가장 중요)

서버 호출·TanStack Query·DTO 변경이 없는 순수 렌더링 밀도 조정이다.

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시) | 대응 프론트 훅/쿼리키 |
|---|---|---|---|
| 변경 없음 (`getProjectGanttData` 재사용) | 변경 없음 | 변경 없음 | `useGanttData` / 기존 gantt query key |

`GanttChart`의 공개 props와 `GanttPage`의 `chartProps`도 변경하지 않는다. `cellHeight`와 CSS custom property는 내부 구현값이다.

## 3. 백엔드 설계

변경 없음.

## 4. 프론트엔드 설계

### 4-1. 행 높이 단일 상수화

`GanttChart.jsx`에 컴포넌트 외부 상수 `const GANTT_CELL_HEIGHT = 40;`을 선언하고, 기존 `<Gantt cellHeight={52} />`를 `cellHeight={GANTT_CELL_HEIGHT}`로 교체한다.

- SVAR Gantt의 `cellHeight`는 좌측 grid body 행과 우측 차트 행, grid/scale header 레이아웃의 기준이다. CSS에서 개별 `.wx-row` 높이를 강제로 덮어쓰지 않는다. 그렇게 하면 grid와 차트의 행 y 좌표가 어긋나며 링크·마커 오버레이가 틀어진다.
- `computeOverlay()`는 실제 `.wx-scale` 높이를 측정하므로 40px 전환 후 별도 좌표 보정이 필요 없다.
- 호스트 높이, `CHART_BOTTOM_PADDING`, fullscreen 계산은 바꾸지 않는다. 이는 화면에 보이는 행 수와 별개로 세로 스크롤·하단 잘림을 보정하는 규칙이다.

### 4-2. Gantt host 안에서만 글꼴 축소

`gantt.css`의 기존 `.gantt-svar-host, .gantt-svar-host .wx-willow-theme, .gantt-svar-host .wx-willow-dark-theme` 변수 블록에 아래 값을 추가한다.

```css
--wx-grid-body-font: 400 12px var(--wx-font-family);
--wx-grid-header-font: var(--wx-font-weight-md) 12px var(--wx-font-family);
--wx-timescale-font: var(--wx-font-weight-md) 11px var(--wx-font-family);
--wx-gantt-bar-font: var(--wx-font-weight) 12px var(--wx-font-family);
```

이 범위는 `GanttChart`의 Willow 테마 wrapper 내부로 한정된다. 다른 페이지의 Atlaskit typography, 프로젝트 테이블, Portfolio Gantt에는 영향을 주지 않는다.

이미 `gantt-marker-label`은 11px이므로 값을 유지한다. grid header의 별도 `.wx-text` 규칙은 정렬만 지정하므로 위 변수와 충돌하지 않는다.

### 4-3. 트리 토글 폭을 행 높이에 맞춤

같은 CSS에서 현재 24px로 확대한 아래 규칙을 40px 행에 맞춘다.

| 대상 | 현재 | 변경 |
|---|---:|---:|
| `.wx-toggle-icon` font-size | 22px | 18px |
| `.wx-toggle-icon` width/min-width/height/line-height | 24px | 20px |
| `.wx-toggle-placeholder` width/min-width/flex-basis | 24px | 20px |

`cursor: pointer`는 유지한다. 20×20px 아이콘 box는 기존 16px 기본보다 크므로 접기/펼치기 클릭 영역은 충분히 보존되며, 행 자체의 40px 높이가 세로 hit area를 유지한다.

### 4-4. 기존 편집 셀 규칙 유지

`.gantt-edit-cell`의 Select `min-height: 32px` 및 input `height: 30px`은 변경하지 않는다. 새 40px cell 안에 각각 상하 4px/5px 여유가 있어 clipping 없이 들어간다. `gantt-user-cell`의 24px avatar도 그대로 둔다.

수정하지 않을 파일: `GanttGridEditCells.jsx`, `GanttPage.jsx`, `GanttToolbar.jsx`, query key/store/resolver.

## 5. DB 설계

변경 없음.

## 6. i18n 키 목록

추가·변경 없음.

## 7. 구현 작업 분해

### frontend

- [ ] `GanttChart.jsx`: `GANTT_CELL_HEIGHT = 40` 상수를 선언하고 `<Gantt>`에 연결한다.
- [ ] `gantt.css`: Willow light/dark 테마 wrapper에 grid/header/timescale/bar 글꼴 변수를 추가한다.
- [ ] `gantt.css`: `.wx-toggle-icon`, `.wx-toggle-placeholder`의 24px 규칙을 20px 기준으로 축소한다.
- [ ] 직접 확인: 일반/전체화면, light/dark, 읽기전용/편집가능에서 40px 행·12px 글꼴이 적용되는지 확인한다.
- [ ] 직접 확인: 이슈/폴더 접기·펼치기, 바 드래그·리사이즈, 그리드 컬럼 resize, 세로/가로 스크롤, 인라인 시작일·기간·MD 편집이 동작하고 clipping이 없는지 확인한다.

### backend

- [ ] 작업 없음.

### 검증

- [ ] `Set-Location static/ui; npm test -- --runInBand`
- [ ] `Set-Location static/ui; CI=true npm run build`
- [ ] app root에서 `forge lint`
- [ ] 회귀 단위 테스트인 `ganttAdapter.folderLinks.test.js`, `ganttToastBatcher.test.js`를 전체 frontend test 내에서 확인한다. 이 변경은 DOM/CSS 상의 밀도 조정이므로 별도 데이터 어댑터 테스트 추가는 불필요하다.
- [ ] 가능한 경우 development 환경에서 실제 Gantt를 열어 52px→40px 전환, 각 interaction과 1366px급 뷰포트의 가시 행 수 증가를 수동 확인한다.
