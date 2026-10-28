---
name: fe-page-remount-on-navigate
description: moveseyee_fe 페이지 전환 key는 pathname(src/layouts/app/App.tsx:240, 2026-09-15 확인·커밋됨) — 같은 경로 query 변경은 리마운트 없음. 페이지 상태를 URL query에 두는 이유는 이제 공유·새로고침·뒤로가기(리마운트 방어가 아님)
metadata: 
  node_type: memory
  type: project
  originSessionId: 33321b81-2ae8-4894-a5d0-7b7450e47a64
  modified: 2026-07-21T01:50:07.243Z
---

✅ **2026-09-15 확인: 수정이 커밋된 현행 코드다(`src/layouts/app/App.tsx:240 key=css-transition-${location.pathname}`, Guest 레이아웃만 location.key 유지).** 설계·문서에 "query navigate마다 리마운트"라고 쓰지 말 것 — 근거는 공유·새로고침·뒤로가기로.

⚠️ **2026-07-21 근본 수정됨**: `src/layouts/app/App.tsx`의 CSSTransition `key`를 `location.key` → **`location.pathname`**으로 변경. 이제 **경로가 바뀔 때만** 리마운트(진짜 페이지 전환)하고 **같은 경로 내 쿼리스트링 변경은 리마운트하지 않는다**. 아래 문제는 이 수정으로 해소됨. (단 미커밋 — 롤백/다른 브랜치에선 여전히 발생 가능하니 아래 원리는 알아둘 것.)

[수정 전 원 문제] moveseyee_fe에서 **모든 navigate(쿼리스트링만 바뀌는 replace navigate 포함)마다 라우트 페이지 서브트리가 통째로 리마운트된다.** 원인: `App.tsx`의 페이지 전환 애니메이션 `<SwitchTransition><CSSTransition key={`css-transition-${location.key}`} unmountOnExit>`. `location.key`는 navigate마다 새로 생성되므로 CSSTransition이 이전 페이지를 언마운트하고 새로 마운트했다. 증상: 아이템 탭 대상템플릿 리버트, 템플릿 상세 2번 로드 등.

**함의(교훈):** 페이지/탭 컴포넌트의 데이터-결정 상태(목록 스코프, 선택된 대상 등)를 **로컬 useState로 두면 안 된다** — 그 페이지 안의 어떤 컴포넌트든(특히 공용 `DmoveTable`은 마운트 effect에서 offset/limit을 URL에 기록) navigate를 유발하는 순간 리마운트되며 로컬 state가 초기화된다. keyword/status/offset/limit처럼 **URL query state(`useQueryParams`)로 관리**해야 리마운트돼도 URL에서 복원된다. 기존 정상 페이지(HostTab/HostGroupTab)가 안 깨진 이유도 "리마운트 안 돼서"가 아니라 "모든 스코프 상태를 URL에 둬서"다(걔들도 첫 렌더 시 DmoveTable navigate로 똑같이 리마운트됨).

**사례(2026-07-20, [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--item-template-management-feature|item-template-management-feature]]):** 아이템 탭의 대상 템플릿 선택이 로컬 useState라, 선택→아이템 목록 DmoveTable 렌더→offset/limit URL 기록(navigate)→페이지 리마운트→templateId 소실→"목록이 떴다가 사라짐". 수정=templateId/templateName을 URL 쿼리 파라미터로 승격(`QueryParamKeys.TEMPLATE_ID/TEMPLATE_NAME` 신설) + 검색결과 밖 값도 라벨 유지되게 합성 옵션 주입. 근본 해결(App.tsx CSSTransition 제거)은 앱 전역 전환 애니메이션에 광범위 영향이라 미채택 — 별도 이슈로 남김.
