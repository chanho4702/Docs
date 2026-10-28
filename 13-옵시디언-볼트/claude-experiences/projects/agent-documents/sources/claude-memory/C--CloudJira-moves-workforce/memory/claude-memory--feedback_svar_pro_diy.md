---
name: feedback-svar-pro-diy
description: SVAR 무료빌드에서 PRO 전용이라 막힌 기능은 번들 내부를 직접 분석해 커스텀 구현해도 좋다는 사용자 승인
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 809a0648-4fb8-4566-b144-71d8628be551
---

SVAR(react-gantt) 무료 빌드에서 PRO 전용이라 동작하지 않는 기능(예: markers 세로선, gridWidth 리사이저 등)은 "불가"로 보류하지 말고, **node_modules 번들(index.cjs/index.css)을 직접 분석해 커스텀 구현해도 좋다** (사용자 승인 2026-07-02).

**Why:** 세로 마커를 커스텀 오버레이로 구현한 전례가 성공적이었고, 사용자는 라이브러리 한계보다 기능 완성을 우선함.

**How to apply:** PRO 기능이 필요하면 (1) 번들에서 해당 렌더/상태 로직 확인 → (2) DOM/오버레이/CSS 변수로 재구현 → (3) gantt.css/GanttChart.jsx 에 근거 주석 남기기. 분석 시 grep 대상은 `static/ui/node_modules/@svar-ui/react-gantt/dist/`, `react-grid/dist/`, `gantt-store/dist/`. 관련: [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_svar_gantt|project_svar_gantt]]
