---
name: legacy-root-no-concurrent
description: index.js가 ReactDOM.render(legacy root)라 React 18 concurrent 기능(startTransition/useTransition)이 전부 무효 - lazy는 Suspense 경계로만 성립
metadata: 
  node_type: memory
  type: project
  originSessionId: e45354bd-349a-4162-ab67-c24c679a9a7c
  modified: 2026-08-05T02:27:03.391Z
---

`static/ui/src/index.js` 는 `ReactDOM.render` 를 쓴다 — **legacy root**. React 18 을 설치했어도 concurrent 모드가 아니다.

**따라서 다음이 전부 no-op 이다:**
- `startTransition(() => setState(...))` → 안의 업데이트도 SyncLane(동기)으로 처리된다
- `useTransition()` 의 `isPending` → **항상 false**. 이걸로 로딩 피드백을 만들면 죽은 코드가 된다
- react-router 7 이 내부적으로 쓰는 startTransition 도 같은 이유로 동기

**그래서 `React.lazy` 를 쓸 때 #426("A component suspended while responding to synchronous input")을 막는 것은 startTransition 이 아니라 Suspense 경계다.** 경계 없이 suspend 하면 legacy root 에서도 #426 이 난다. 2026-08-04 lazy 전면 원복의 진짜 원인은 `MainPageTabs` 에 경계가 없었던 것 (당시엔 "동기 입력이 문제"로 오진해 startTransition 을 처방했는데, 이 앱에선 애초에 작동하지 않는다).

**createRoot 로 바꾸면?** concurrent 기능이 살아나지만 StrictMode 이중 렌더·effect 재실행 등 앱 전체 동작이 바뀌므로 전면 회귀 검증이 필요한 별건이다. 2026-08-05 시점 미수행.

**교훈:** 이 리포에서 "transition 으로 감싸면 된다"류의 처방은 검증 없이 채택하지 말 것. 먼저 `index.js` 의 렌더 진입점을 확인한다.

관련: [[ci-build-lazy-tradeoff]]
