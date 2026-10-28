---
name: approval-ui-style
description: >-
  승인 앱 UI의 디자인 언어와 프론트 구현 규칙. 패널·모달·업무함·설정 화면의 HTML/CSS/JS를
  설계하거나 수정할 때 반드시 읽을 것. 토큰, BEM 네이밍, Confluence 데코레이터 통합,
  이벤트 위임 패턴, 접근성 규칙을 담는다.
---

# UI 스타일 가이드

## 디자인 언어 ("문서/결재" 모티프)
- 토큰: `--paper`(카드) `--canvas`(바탕) `--sunk`(침하면) `--ink/--ink-soft/--muted`(글자)
  `--rule/--rule-soft`(괘선) `--accent`(파랑) + 상태색 `--pending`(호박) `--approved`(녹)
  `--rejected`(적) `--expired`(회) — 각각 `-bg` 짝 존재. 새 색을 추가하지 말고 토큰을 재사용.
- **토큰의 유효 범위 주의 (배치 8c·8d 연속 사고)**: 위 커스텀 속성들은 업무함·설정 **서블릿의
  `#dmove-approval-app` 스코프에만 정의**되어 있다. `resources/css/approval.css`(패널·매크로·요청
  모달 — 콘텐츠 페이지에서 로드)에는 정의가 0개라 `var(--...)`가 항상 무효다 — 이 파일에서는
  파일 안에 이미 있는 **하드코딩 팔레트**(#216e4e·#dcfff1·#ae2e24·#dfe1e6 등)를 재사용하라.
  특히 `border`/`font` 단축 속성에 무효 var가 섞이면 선언 전체가 무효가 된다.
- 서체: `--sans`(Pretendard 계열), `--mono`(숫자·타임스탬프·eyebrow 전용, tabular-nums).
- 상태는 항상 **색 + 텍스트/아이콘 병행** (stamp 패턴: 1px currentColor 테두리 + 연한 배경).
- 모션은 입장 시 1회 rise 애니메이션만, `prefers-reduced-motion` 존중.

## 네이밍
- BEM 변형: `dmove-approval-{block}__{element}--{modifier}`. 전역 충돌 방지를 위해 `dmove-` 접두사 필수.
- 모달은 용도별로 클래스를 분리: `dmove-approval-modal--request`(요청 생성), `dmove-approval-modal--detail`(상태 상세). JS 셀렉터가 용도를 구분할 수 있어야 한다.

## Confluence 통합 규칙
- **서블릿 화면은 데코레이터로 Confluence 크롬 안에 렌더링**: `<head>`에
  `<meta name="decorator" content="atl.general">`. 데코레이터 하위에서는:
  - 전체 화면 배경/캔버스 연출, 자체 마스트헤드(홈 링크 등), 자체 다크모드 `@media` 금지 — 크롬과 충돌.
  - 콘텐츠는 카드(panel)와 표 중심으로. h1은 페이지 제목 역할만.
  - AUI가 로드되므로 `AJS.contextPath()` 사용 가능. 단 서버 주입 `__CONTEXT_PATH__` 토큰이 더 견고 — 우선 사용.
- 패널/매크로(페이지 내부)는 metadata banner 폭 제약을 존중: 한 줄 요약 + 상세는 모달로.
- AUI 버튼(`aui-button`, `aui-button-primary`, `aui-button-link`)을 우선 사용.

## 구현 제약
- React/빌드 파이프라인/외부 CDN 없음. vanilla JS + AUI만.
- 패널·매크로 HTML은 Java StringBuilder — 모든 동적 문자열은 escape() 통과. 서블릿은 text block + `__TOKEN__` 치환(값은 escape 또는 escapeForScript).
- JS는 approval.js의 **document 레벨 이벤트 위임** 패턴 유지: `document.addEventListener('click', e => e.target.closest(...))`. 개별 요소 바인딩 금지 (패널이 서버 렌더링 후 통째로 갈리기 때문).
- fetch는 `credentials: 'same-origin'`, POST는 `X-Atlassian-Token: no-check` 헤더, body 없이 query 파라미터만.

## 접근성
- 모달: `role="dialog" aria-modal="true" aria-label`, ESC 닫기, backdrop 클릭 닫기(`data-approval-close`).
- 상태 pill이 버튼이면 `<button type="button">` + `aria-haspopup="dialog"` + `aria-expanded`.
- 라이브 영역(`aria-live="polite"`)은 결과 목록·메시지에만.
