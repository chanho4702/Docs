# 간트 표시 밀도 36px 조정 통합 검증

## 통과

### 렌더링·상호작용 경계면

- 생산자: `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx:33,1244`
  - `GANTT_CELL_HEIGHT = 36`을 `<Gantt cellHeight={GANTT_CELL_HEIGHT}>`에 단일 전달한다.
- 소비자: SVAR Gantt가 동일한 `cellHeight`로 grid 행·chart 막대·drag/resize 레이아웃을 계산한다. CSS에서 행 높이를 따로 강제하지 않아 grid/chart y축 기준이 갈라지지 않는다.
- 오버레이: `GanttChart.jsx:1017-1058`의 `computeOverlay()`는 `.wx-scale`의 실제 DOM 높이를 측정해 overlay top/height를 계산한다. 행 높이 변경을 전제로 한 고정 y좌표가 없어 marker overlay 정렬을 유지한다.
- 드래그 대상 판별: `GanttChart.jsx:1128-1132`가 `.wx-bar`, `.wx-grip`, `.wx-resizer`, `.wx-scale`를 빈 영역 pan에서 제외한다. cellHeight 변경은 이 선택 경계를 바꾸지 않는다.

### 36px 행 안의 콘텐츠

- `gantt.css:299-310`의 edit Select 최소 높이는 32px, input은 30px이다. 36px 행 기준으로 Select는 상하 합계 4px, input은 6px 여유가 남아 CSS상 clipping을 유발하는 추가 높이/패딩 규칙이 없다.
- `gantt.css:315-325`의 user cell은 `height: 100%`, `align-items: center`이며 24px avatar는 상하 합계 12px 여유가 있다.
- `gantt.css:255-267`에서 18px glyph와 20px 클릭 상자, 20px placeholder flex-basis를 함께 유지한다. 트리 행 들여쓰기와 클릭 대상 폭의 정렬이 보존된다.
- host-only Willow typography custom property는 기존대로 grid/body/header/bar 12px, timescale 11px을 적용한다. SVAR 패키지가 같은 `--wx-*font` 변수를 소비하는 것을 교차 확인했다.

### 자동 검증

- `static/ui`: `npm test -- --runInBand` 통과 — 101 suites, 1,663 tests.
- `static/ui`: `CI=true npm run build:app` 통과. root locale 사용자 변경을 재생성하는 prebuild merge를 피하기 위해 CRACO production compile만 직접 실행했다.
- `static/ui`: `npm run bundle:check` 통과 — main gzip 436,087 B / 예산 950,000 B.
- app root: `forge lint` 통과 — exit 0, `No issues found`. Forge CLI 최신 버전 안내와 PermissionLinter `Unknown product`는 환경성 경고다.
- `ganttDensity.test.js`가 36px 행 높이, typography, toggle 정렬, 32px Select·30px input·user cell 높이 규약을 회귀 검증한다.

## 실패

- 없음.

## 수동 미검증

- development Jira 브라우저에서 일반/전체 화면, light/dark, 읽기/편집 권한별로 Select dropdown clipping, 실제 bar drag/resize, column resize를 직접 수행하는 검증은 브라우저 세션이 없어 실행하지 못했다. 코드상 좌표·높이·이벤트 경계는 유지됨을 확인했다.
- backend resolver, invoke, query key, DTO, i18n은 이번 조정에서 변경되지 않아 백엔드 계약 검증 대상이 아니다.
