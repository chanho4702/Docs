---
tags: [moveseye, review, event, sse]
updated: 2026-09-07
---

# MovesEye 로직 검수

공유 경험 정본: `C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-09-07-logic-review.md`.
검수 산출물: `C:/solutions/_workspace/reviews/review_logic_2026-09-07_codex.md`.

BE `922a708`·FE `ef951b0` 기준 알람 사본·복구·읽음·SSE·RAW/trends 경로 7건 발견, 제품 변경 없음.
기존 BE 23개·FE 6개 통과와 별개로 실제 훅/SQL 격리 실행에서 3건 재현.
핵심 교훈: 활성 스냅샷만으로 발생 이력을 보장할 수 없고, 첫 실패 페이지 고정 조회는 진행을 막으며, 데이터 수집 상한은 사본의 완전성을 별도 보장해야 한다.
