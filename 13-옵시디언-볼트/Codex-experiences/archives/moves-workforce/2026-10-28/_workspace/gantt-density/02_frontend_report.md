# 간트 표시 밀도 조정 — 프론트엔드 구현 보고

## 변경 파일

- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`
  - `GANTT_CELL_HEIGHT = 36` 상수를 SVAR Gantt의 `cellHeight`에 연결했습니다.
- `static/ui/src/pages/projectDetail/gantt/gantt.css`
  - Gantt host 범위의 Willow CSS custom property로 grid body/header·bar를 12px, timescale을 11px로 조정했습니다.
  - 트리 toggle은 20px 클릭 영역과 18px glyph로 조정하고 placeholder도 20px로 맞춰 들여쓰기 정렬을 유지했습니다.
- `static/ui/src/pages/projectDetail/gantt/ganttDensity.test.js`
  - 행 높이, host typography 변수, toggle hit-area/placeholder 정렬과 편집 control 크기 유지 계약 회귀 테스트를 추가했습니다.

## 경계면·i18n

- resolver, invoke, query key, DTO 변경 없음
- i18n 변경 없음; merge 미실행

## 검증

- `npm test -- --runInBand src/pages/projectDetail/gantt/ganttDensity.test.js src/pages/projectDetail/gantt/ganttAdapter.folderLinks.test.js src/pages/projectDetail/gantt/ganttToastBatcher.test.js`
  - 3 suites / 20 tests 통과
- `npm test -- --runInBand`
  - 101 suites / 1,663 tests 통과
- `CI=true npm run build`는 사용자 변경 locale 파일을 prebuild merge가 덮어쓸 수 있어 실행하지 않았습니다.

## 수동 확인 필요

- 개발 환경에서 일반/전체화면·light/dark·읽기/편집 권한별로 행 clipping, tree toggle, bar drag/resize, column resize 및 스크롤을 확인해야 합니다.

## 후속 조정 (36px)

- 행 높이를 40px에서 36px로 낮췄습니다. CSS의 Select 최소 높이 32px, input 높이 30px, avatar 24px은 변경하지 않았습니다.
- 36px 행 기준으로 Select는 상·하 각 2px, input은 각 3px, avatar는 각 6px의 여유가 남아 CSS box model상 clipping 없이 수용됩니다. 다만 실제 Atlaskit control의 focus outline은 개발 환경 수동 확인 항목에 포함합니다.
