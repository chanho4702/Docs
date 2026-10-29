---
name: archify-showcase-layout-rules
description: archify showcase 다이어그램이 validate·visual-check를 통과하는 배치 규칙 — viewBox 폭 ≤1020·비율 ≥1.55·4열×4행·labelDy 24 (2026-10-07 APM 데이터 경로 도식에서 6회 반복으로 확정)
metadata:
  node_type: memory
  type: feedback
  originSessionId: f76a09cf-b3e2-4213-a6dc-bf0c2f844770
  modified: 2026-10-07T06:56:06.826Z
---

2026-10-07 APM 데이터 경로(OTel → MovesEye) 아키텍처 도식(`_workspace/features/apm/core/arch_apm-otel-pipeline.html`, 스펙은 scratchpad에만 있었음)을 그리며 확정한 archify 규칙.

**Why:** 7열 가로 배치는 기하 검사는 통과해도 `desktop-readability`(1440px에서 서브라벨 6px 미만)에 걸리고, 비율 1.54짜리 4열×5행은 뷰어가 높이 적응을 꺼서(기준 1.55) `visual-check` 세로 넘침이 난다. 이 두 제약을 모르면 반복이 길어진다.

**How to apply:**
- viewBox 폭 ≤ 약 1020, 가로/세로 비율 ≥ 1.55(실제 2.0 근처) → 노드 폭 160·열 간격 100·4열, 행 pitch 104~110·최대 4행.
- 가로 엣지 라벨은 간격보다 짧게(≤ 85px). 긴 라벨은 세로 엣지에 두고 `labelDy: 24`.
- 경계는 사각형 → 남의 노드가 들어오면 안 됨. BE를 "수신·저장·배치"/"실시간"으로 쪼개고 애매한 노드는 경계 밖.
- 카드의 긴 영문 `a·b·c` 열거는 줄바꿈이 안 돼 가로 넘침 → 쉼표+공백. 항목 3개·두 줄 이내. 제목은 한 줄(≤ 약 30자). `legend hidden`은 높이를 안 줄임.
- 순서 validate → deliver → visual-check. visual-check 부속 파일 6개는 산출 폴더에서 scratchpad로 옮긴다.
- 같은 폴더에 09-03자 구 도식 `diagram_apm-pipeline.html`(7노드 개요)이 있다 — 상세 경로는 10-07 산출물이 정본.

Vault 정본: `claude-experiences/topics/claude/archify-showcase-authoring.md`. 관련 [[network-map-archify-reskin]].
