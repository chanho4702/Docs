---
name: project-resizable-panels
description: "RFC-185 ResizablePanels — 패널 접기/너비조절 공용 레이아웃, 접기 버튼은 카드 헤더 안(PanelToggleButton), localStorage 저장"
metadata: 
  node_type: memory
  type: project
  originSessionId: caaab510-0d17-4c17-9fdb-ea3ab946dde4
  modified: 2026-08-12T05:48:20.307Z
---

접기/너비 조절 패널 레이아웃(#RFC-185 + v2/v3, 2026-08-12). `components/layout/ResizablePanels.jsx` + `panelLayout.js`(순수 계산).

- **API**: `<ResizablePanels storageKey>` + `<Panel id defaultWeight minWidth collapsible>`. 상태 키는 Panel `id`(인덱스 금지 — 조건부 마운트 패널 대응). 공간 재분배는 CSS flex 위임(ResizeObserver 없음).
- **접기 버튼은 카드 헤더 안** — v2의 패널 상단 24px 바는 사용자가 거부("킹받는다"), v3에서 `PanelToggleButton` export + 컨텍스트로 전환. 호출부가 Card headerRight 등 원하는 자리에 배치. 접힌 레일(40px)은 전체 클릭으로 펼침. 마지막 패널은 disabled 대신 aria-disabled + no-op(크롬 툴팁 이슈).
- **저장**: localStorage, 화면 단위 storageKey(project_id 미포함), 드래그 종료·토글 시점만 기록. 펼침은 키 삭제가 아니라 false 기록(defaultCollapsed 재접힘 방지), 병합 저장(조건부 패널 폭 보존).
- **접어도 children 언마운트 안 함**(display:none) — 내부 훅·쿼리 구독 유지가 불변식.
- 적용: 자원관리 배정 보드, 프로젝트상세 작업 배정 탭, 작업 관리 트리, My Work(이때 원래 의도한 20:80이 처음 실적용 — xcss raw flex 무시 함정).

관련: [[project-table-surface]], [[project-work-views]]
