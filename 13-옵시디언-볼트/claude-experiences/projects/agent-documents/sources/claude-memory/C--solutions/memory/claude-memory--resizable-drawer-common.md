---
name: resizable-drawer-common
description: "사이드 패널 공통화 — ResizableDrawer 단일 정본(훅 제거), 25개 사용처 교체, FE master d1bfe31 #ZM-149 커밋(미푸시)·런타임 미검증(Chrome MCP가 localhost 접속 거부)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-14T08:17:12.960Z
---

2026-09-14 사이드 패널(Drawer) 공통화 완료 — FE master `d1bfe31` #ZM-149 커밋(미푸시). 정본은 `moveseyee_fe/src/components/Drawer/ResizableDrawer.tsx` 하나 — 예전 `hooks/useResizableDrawer.tsx`는 삭제, 핸들 CSS는 동반 `ResizableDrawer.scss`(discovery/style.scss 삭제).

**Why:** 컴포넌트·훅 두 구현이 공존했고, 핸들 CSS가 discovery 페이지에만 있어 다른 화면에서는 스타일 없는 핸들이 떴다.

**How to apply:**
- 새 사이드 패널은 antd Drawer 직접 쓰지 말고 `<ResizableDrawer storageKey="kebab-id" defaultWidth={N}>`. 저장 키 접두 `dmove:drawerw:`, 접두 없는 옛 키는 1회 폴백 읽기.
- 좌/우 배치·키보드(←/→)·더블클릭 리셋·모바일 풀폭 지원. 위/아래 배치는 그대로 통과.
- 테스트에서 pointer 드래그는 jsdom에 PointerEvent가 없어 폴리필 필요(`__tests__/ResizableDrawer.test.tsx` 상단 참조).
- 🔴 **회귀 있었음**: 지운 `discovery/style.scss`를 alert-management 2파일이 `../discovery/style.scss`로 상대 import → Vite 오버레이로 앱 전체 불능. tsc·eslint·jest 전부 통과했는데도 놓침 — **scss/asset 삭제 전엔 `grep -rn "style.scss"`로 상대경로까지 훑고, 마지막엔 Vite 실기동(헤드리스 캡처)으로 확인**. `1091b75` #ZM-149 [FIX]로 커밋(ActionForm·MediaType import 제거, 미푸시).
- 🔴 TriggerFormDrawer.test "verbatim toast" 1건은 이번 변경 전부터 실패(기존 문제).
- 🔴 Chrome MCP 탭이 localhost/127.0.0.1/[::1]:5173 전부 ERR_CONNECTION_REFUSED — curl은 됨(Vite가 [::1]만 바인딩). 브라우저 검증은 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--network-map-archify-reskin|network-map-archify-reskin]]의 헤드리스 CDP 스크립트로 대체할 것.
