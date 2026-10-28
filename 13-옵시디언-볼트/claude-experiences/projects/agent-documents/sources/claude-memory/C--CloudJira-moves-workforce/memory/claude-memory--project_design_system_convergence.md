---
name: project-design-system-convergence
description: "UI 일관성 정리(RFC-178) — Atlaskit 네이티브 수렴, P0~P3 완료. 공용 지점 10개 신설, 리포트는 _workspace/design-system/DIAGNOSIS.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: f08ec884-40cc-4e2f-b340-1075321fd89b
  modified: 2026-08-05T09:01:32.926Z
---

2026-08-05, RFC-178. "페이지별 통일성이 없고 습작 같다"에서 출발해 **P0~P3 완료**(커밋 6개, develop).

**방향(사용자 선택)**: **Atlaskit 네이티브 순수**. 자체 비주얼 언어를 만들지 않는다.
[[reference-dmove-brand-palette]]의 틸(#21ADAD)을 쓰던 `assignment/theme.js`는 참조 0건이라 삭제했다.

**Why**: 문제는 미적 감각이 아니라 스타일 결정이 216개 파일에 흩어진 것. 리디자인이 아니라 **수렴**이 먼저.

**신설한 공용 지점** — 새 화면을 만들 때 여기부터 본다:
`layout/PageContainer`·`PageHeader`(제목·여백) / `layout/BentoGrid`(6열, 중요도=타일 크기) /
`skeleton/Skeleton`(프리미티브 7종) / `table/skeletonRows` / `feedback/LoadingOverlay`(shimmer 바) /
`card/CardFullscreen` / `chart/ViewToggleButtons` / `chart/echart/tooltipMarker` /
`lozenge/SemanticBadge` / `constants/chartPalette`(차트 색 단일 출처)

**How to apply — 재발 방지 규칙**:
- 색은 `token()`. CSS 파일은 `var(--ds-*)`. **라이트/다크 hex를 쌍으로 들지 말 것** — 토큰이 알아서 바뀐다.
- ⚠ **예외: ECharts는 canvas라 CSS 변수를 해석 못 한다** → `chartPalette`의 hex + `useColorMode()`.
- `fontSize`는 Atlaskit 스케일(11/12/14/16/20/24)만. 13px은 12px로 흡수했다.
- 로딩: 빈 자리엔 스켈레톤, 이미 있는 콘텐츠 위 갱신엔 shimmer 바. **스피너는 앱에서 제거됨**.
- 카드/표는 껍데기(테두리·제목·헤더)를 남기고 본문만 비운다 → 레이아웃 시프트 0.
- 배지는 역할로 고른다: `StatusBadge`(사용자 색) vs `SemanticBadge`(의미). 억지로 합치지 말 것.

**곁다리로 고친 결함**: 이슈별 비용 파이 간헐적 미표시(ECharts가 트랜지션 중 폭 0에서 init →
패널 오픈 후 resize 직접 보장), `color + '22'` 알파 이어붙이기, Card 전체화면 `#fff` 하드코딩,
빈 상태를 `<h2>`로 그리던 3곳.

**미검증**: 전 과정 빌드 통과 기준. 실제 화면 E2E는 사용자가 수행.
전체 근거·수치·잔여는 `_workspace/design-system/DIAGNOSIS.md` §8.
