---
name: fe-rgl-usecontainerwidth-ref-first-render
description: RGL v2 useContainerWidth는 ref div가 첫 렌더에 없으면 ResizeObserver가 영영 안 붙음 — 컨테이너 div는 무조건 항상 렌더
metadata: 
  node_type: memory
  type: project
  originSessionId: 580957ac-a7b6-4d52-a7ae-b9fee6255a53
  modified: 2026-08-21T04:57:07.053Z
---

react-grid-layout v2.2.3 `useContainerWidth`의 ResizeObserver 부착 effect는 **마운트 시 1회만** 실행되고, 그 시점에 `containerRef.current === null`이면 조기 반환 후 재시도가 없다(deps인 `measureWidth`가 `mounted=true` 고정이라 불변). 위젯 로딩 중 Empty 분기로 ref div를 안 그리면 옵저버 미부착 → 창 크기 변경이 영영 반영 안 됨(작은 화면 로드 → 큰 화면 이동 시 그리드·차트 고정). react-query 캐시가 있으면 첫 렌더부터 div가 있어 정상 동작 → **신규 로드에서만 재현되는 간헐 버그**.

**Why:** 2026-08-21 커스텀 차트 탭·홈 위젯 그리드 둘 다 이 패턴으로 반응형이 죽어 있었음(`eded933` 수정). 수동 `measureWidth()` 1회 호출은 로드 시점 폭만 잡고 이후 리사이즈는 못 잡는다.

**How to apply:** RGL v2 그리드를 쓰는 컴포넌트는 ref 달린 컨테이너 div를 **위젯 유무·로딩 여부와 무관하게 항상 렌더**하고, Empty/그리드 분기를 div 안쪽에 둔다. `MonitoringDetailDashboard.tsx`의 "비활성 탭 언마운트" 우회도 같은 근본 원인. 관련: [[home-widget-dashboard]]
