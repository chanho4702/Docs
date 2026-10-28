# 다크모드 미적용 수정 — 요구사항

작성일: 2026-07-06 | 슬러그: dark-mode-fix | 사용자 실사용 피드백

## 증상 (사용자 보고)

Jira 다크모드에서 다음 영역이 다크 테마를 따르지 않거나 깨져 보임:

1. **통합 대시보드** (`/dashboard`, `pages/portfolio/PortfolioDashboardPage.jsx` 일대)
2. **작업 관리** (프로젝트 상세 탭, `pages/projectDetail/issue/ProjectIssuePanel.jsx` 일대)
3. **작업 이력** (프로젝트 상세 탭, `pages/projectDetail/taskHistory/TaskHistoryPage.jsx` 일대)
4. **간트** (프로젝트 상세 탭, `pages/projectDetail/gantt/` — SVAR 차트/CSS/커스텀 오버레이·툴팁·플레이스홀더·조회전용 뱃지)
5. **진척율(진척 분석)** (`pages/projectDetail/progress/ProgressPage.jsx` 일대) — "좀 이상함" = 색/대비 확인 필요

## 작업 방침

1. **테마 감지 메커니즘 먼저 실증**: 앱이 Jira 테마를 어떻게 받는지(@forge/bridge `view.theme`, `@atlaskit/tokens` setGlobalTheme, CSS 변수 `--ds-*` 등) 실제 코드로 확인. 다크 전환 시 무엇이 자동으로 바뀌고 무엇이 안 바뀌는지 기준 수립.
2. **하드코딩 색상 전수 감사** (위 5개 영역 + 이들이 공유하는 컴포넌트 `components/chart/`, CommonTable 등): hex(#fff 등)·rgb()·'white'/'black'·inline style 배경/글자색·CSS 파일.
3. **수정 원칙**: Atlaskit 디자인 토큰(`token()` 또는 CSS 변수 `var(--ds-surface)`, `var(--ds-text)` 등) 우선. 라이트 모드 회귀 금지(양 모드 모두 정상이어야 함).
4. **차트 라이브러리 주의**: ECharts/ApexCharts는 캔버스 렌더링이라 CSS 변수 직접 사용 불가 — 테마 감지 훅으로 계산된 색을 옵션에 주입하거나 getComputedStyle로 토큰 값을 읽어 적용. 축/라벨/툴팁 배경/그리드선/범례 색 점검.
5. **SVAR 간트**: 무료 빌드의 테마(Willow/WillowDark 등) 지원 여부 확인, 커스텀 CSS(gantt.css)·마커 오버레이·커스텀 툴팁·플레이스홀더 막대·조회전용 뱃지(인라인 스타일)의 하드코딩 색 정리.
6. 데이터/백엔드 변경 없음 — 순수 프론트 스타일링.

## 검증

- `cd static/ui && npm test` + `npm run build` 통과.
- 시각 확인은 사용자가 배포 후 수행(라이트/다크 양쪽) — 수정 영역·방식을 리포트에 정리해 확인 포인트 제공.
