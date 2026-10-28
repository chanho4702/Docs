---
tags: [moveseye, apm, retention, design]
updated: 2026-09-17
---

# APM 보존 정책 설계와 재개 위치

사용자 요청으로 구현을 보류하고 후속 설계를 작성했다.

- 설계: `C:/solutions/_workspace/designs/devdesign_apm-retention-policy.md`
- 재개 카드: `C:/solutions/_workspace/planning/deferred_apm-retention-policy.md`
- 공동 경험 정본: `C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-09-17-apm-retention-policy-design.md`
- 제안 기간: 메트릭 7/30/400일, 온라인 trace 7일 + 정상 표본 총 30일/중요 표본 총 90일 아카이브 검색·복원. 고객/용량 검증 전 미확정.
- 교훈: 파일 보관만으로 장기 상세 분석을 보장하지 않는다. 늦은 span과 pin 경쟁을 DROP 게이트에 반영하고, 수집 전 제외된 trace는 복구/탈락 사유를 확정할 수 없다.
- 다음 작업: 설계 S0. 코드·DB·런타임 설정 변경 없음.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moveseye-apm-confluence-guide-2026-09-15|moveseye-apm-confluence-guide-2026-09-15]]
