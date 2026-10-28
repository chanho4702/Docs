---
name: status-lozenge-rfc199
description: RFC-199 상태 표시 Lozenge 통일 + 작업관리 이슈 타입 필터 — 공용 진입점 2개와 Atlaskit 피처 플래그 함정
metadata: 
  node_type: memory
  type: project
  originSessionId: 501c8f8f-f1bd-467d-9e07-72b3dcd74ffe
  modified: 2026-09-07T02:20:53.220Z
---

RFC-199(2026-09-07, 브랜치 RFC-199, 커밋 `16e8870`·**푸시 전**). 하네스 순차 파이프라인, 백엔드 0줄.

**상태 표시는 이제 `static/ui/src/components/lozenge/StatusLozenge.jsx` 하나다.** 진입점 2개:
- `IssueStatusLozenge({ status: {name, key?, colorName?} })` — Jira 이슈 상태. 13지점.
- `ProjectStatusLozenge({ name, color })` — 프로젝트 상태(백오피스 지정 색). 12지점.
매핑은 `components/lozenge/statusAppearance.js` 단일 출처(`STATUS_FAMILY`·`STATUS_CHART_HEX` 포함). 삭제됨: `constants/statusColorMap.js`, `components/lozenge/StatusBadge.jsx`. rename: 옛 `StatusLozenge`(아이콘 배지) → `SemanticLozenge.jsx`.

**🔴 `@atlaskit/lozenge`의 커스텀 색은 반드시 `style={{backgroundColor,color}}`로 낸다. `appearance="accent-*"`는 쓰면 안 된다.** default export가 `fg('platform-dst-lozenge-tag-badge-visual-uplifts')` 피처 플래그 래퍼인데 Forge Custom UI엔 플래그 클라이언트가 없어 항상 LegacyLozenge로 떨어지고, Legacy는 유효값 밖 appearance를 **조용히 회색(default)으로 강등**한다. 렌더 테스트로 확증됨(`StatusLozenge.render.test.js`).

**🔴 jsdom은 `var(--ds-*, #hex)`를 조용히 버린다**(저장값 `""`). `token()`이 그 형태를 내므로 인라인 스타일 테스트는 `@atlaskit/tokens`를 `token(n,fallback)=>fallback`으로 모킹해야 한다. 안 하면 "style 경로가 죽었다"고 오진한다.

**이슈 타입 필터**: 4개 뷰 전부. 순수 로직은 `components/filter/issueType.js`(`deriveIssueTypeOptions`/`matchesIssueTypes`/`quoteJqlValue`) + `work/workFilterOptions.js`. 매칭 단위는 타입 **이름**(id 아님 — 간트 계약에 id가 없고 멀티 스페이스에서 갈라진다). 목록 뷰만 서버 JQL.
`GanttPage.jsx`의 인라인 필터 복사본을 `workFilterOptions`로 흡수함 — **`workFilterOptions`가 이제 진짜 단일 출처다**(전엔 docblock만 그렇게 주장했다).

**Why:** 사용자 요구 "상태 표시하는 컴포넌트 모두 통일, 지라에서 제공하는 것처럼". Jira 룩이 [[dmove-brand-palette]]보다 우선(맵 카드 진행 중이 틸→파랑으로 바뀐 것은 의도).
**How to apply:** 상태를 그리는 새 화면은 위 두 진입점만 쓴다. 새 색이 필요하면 `statusAppearance.js`만 고친다. 같은 브랜치에 다른 세션의 "목록 뷰 계층 펼치기"(`80309f4`)가 얹혀 커밋 2개로 나눴다 — 로케일은 두 워크스트림 키가 섞여 커밋별 `npm run merge` 재실행이 필요했다.
관련: [[design-system-convergence]], [[table-surface]]
