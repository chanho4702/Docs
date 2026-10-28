# 폰트 굵기 수렴 작업 명세 (2026-08-11 전수 조사 기반)

목표: 같은 의미 역할의 font-weight를 다수파 + Atlaskit 관례(제목/강조=600 semibold, 700은 대문자 마이크로 라벨 전용)로 통일한다.
방식: **굵기 값만 바꾸는 기계적 수정.** 레이아웃·마크업·컴포넌트 구조 변경 금지. Heading/토큰 마이그레이션은 이번 범위 아님(별건).

## A. 공용 컴포넌트 (파급 최대 — 최우선)

| 파일 | 위치 | 변경 |
|---|---|---|
| `static/ui/src/components/card/Card.jsx` | :24 (xcss `fontWeight: "bold"`) | → `600` |
| `static/ui/src/components/chart/layout/ChartCard.jsx` | :79, :98 (`"bold"`) | → `600` |
| `static/ui/src/components/card/CardFullscreen.jsx` | :52 (`700`) | → `600` |
| `static/ui/src/components/lozenge/SemanticBadge.jsx` | :33 (`700`) | → `600` |

## B. KPI·통계 숫자 → 600 (공용 Summary.css .kpi-value 600 기준)

| 파일 | 위치 |
|---|---|
| `static/ui/src/pages/portfolio/widgets/PortfolioCostKpi.jsx` | :29 (700→600) |
| `static/ui/src/pages/resource/assignment/detail/ProjectDetailPanel.jsx` | :37 (700→600) |
| `static/ui/src/pages/projectDetail/progress/ProgressPage.css` | :92 `.progress-metric-value` (700→600) |
| `static/ui/src/pages/projectDetail/cost/CostPage.css` | :107 `.cost-kpi-value` (700→600) |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryInsightCards.jsx` | :83 (700→600) |
| `static/ui/src/backoffice/page/storage/StorageUsageGauge.jsx` | :46 (700→600) |

## C. 배지·필·칩 → 600 (StatusBadge 600 기준. StatusTag/StatusLozenge의 regular(400)는 역할이 달라 유지)

| 파일 | 위치 |
|---|---|
| `static/ui/src/pages/myPage/sections/MiniBadge.jsx` | :43 (700→600) |
| `static/ui/src/pages/resource/assignment/projects/ProjectCard.jsx` | :120, :129 (700→600) |
| `static/ui/src/pages/resource/assignment/projects/ProjectCard.jsx` | :46 (**800→600**, 앱 유일 800 제거) |
| `static/ui/src/pages/projectDetail/issue/subscription/SourceIcon.jsx` | :59 (700→600) |
| `static/ui/src/pages/projectDetail/progress/ProgressPage.css` | :57 (700→600) |
| `static/ui/src/pages/projectDetail/cost/CostPage.css` | :137 (700→600) |
| `static/ui/src/components/lozenge/StatusLozenge.jsx` | :80 (`bold ? 'bold' : 'normal'` → `bold ? 600 : 400`) |

## D. 탭/토글/퀵필터 활성 → active 600 / inactive 400 (CSS 8곳 다수파 기준)

| 파일 | 위치 |
|---|---|
| `static/ui/src/pages/projectDetail/assignment/queue/WorkQueueFilters.jsx` | :29 (`active ? 700 : 500` → `active ? 600 : 400`) |

## E. 폼·인라인 라벨(12px) → 600

| 파일 | 위치 |
|---|---|
| `static/ui/src/pages/resource/assignment/detail/ProjectDetailPanel.jsx` | :85, :106 (700→600) |
| `static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx` | :802 (700→600) |
| `static/ui/src/pages/projectDetail/assignment/queue/WorkQueueItem.jsx` | :79, :104 (700→600) |

## F. 카드 제목·소제목 잔여 이탈 → 600

| 파일 | 위치 |
|---|---|
| `static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx` | :160, :318 (700→600) |
| `static/ui/src/pages/resource/assignment/projects/ProjectCard.jsx` | :103 (700→600) |
| `static/ui/src/pages/myPage/sections/MyPageHeader.jsx` | :73 (`fontWeight:700` → `600`, fontSize는 유지 — 구조 변경 금지) |

## G. 테이블 헤더 이탈

| 파일 | 위치 |
|---|---|
| `static/ui/src/backoffice/page/permission/modal/usePermission.js` | :21 (`"bold"`→600) |

## H. ECharts

| 파일 | 변경 |
|---|---|
| `static/ui/src/utils/echartsTheme.js` | `title.textStyle`에 `fontWeight: 600` 추가, `legend.textStyle`·축 라벨 계열에 `fontWeight: 400` 명시 (현재 미지정 → ECharts 기본 bolder 방치 해소). 기존 color 지정은 그대로 |
| `static/ui/src/components/chart/echart/options/pieChartOption.js` | :51 (`"bold"`→600) |
| `static/ui/src/pages/myPage/sections/MyContributionCharts.jsx` | :61 (`"bold"`→600) |

## 변경 금지 (명시)

- 대문자 마이크로 라벨 700 (11곳) — 유일하게 완전 일관된 축, 유지
- 테이블 헤더 `table.css:29` 600, 간트 모달 대상명 600 계열 — 이미 표준
- `StatusTag.jsx`/`StatusLozenge.jsx`의 `'font.weight.regular'`(400) — 부수 정보 역할, 유지
- 중간톤 500 소수파(AvatarStack, IssueComponent, JiraUserSelect 등) — 역할 정의가 없어 이번 범위 제외
- markLine 라벨 600 (7건) — 이미 통일
- ECharts 기본값에 의존하던 곳 외의 조건부 삼항(`isSelected ? 600 : 400` 등) — 다수파 패턴이므로 유지
- Heading/`token('font.*')` 마이그레이션, WidgetCard raw h3 치환 — 별건

## 검증

- 라인 번호는 조사 시점 기준 — 실제 코드를 읽고 맥락(굵기 값·역할)으로 앵커를 확인 후 수정
- 수정 후 전수 grep 재확인: `fontWeight.*(700|800|['"]bold['"])` / css `font-weight:\s*(700|bold)` 잔존이 "변경 금지" 목록(대문자 라벨 등)에만 남는지 대조
- `cd static/ui && npm test` + `CI=true npm run build` 통과
