---
tags: [moveseye, apm, design]
updated: 2026-10-28
---

# APM 심층 진단 설계 기록

공유 정본은 [공유 Vault 노트](../../../../moveseye/2026-10-28-apm-deep-diagnostics-design.md)다.

- [설계 v0.2](../../solutions/_workspace/features/apm/deep-diagnostics/solutions--devdesign_apm-deep-diagnostics.md): trace 진단 탭, instance runtime 문맥+Hikari 획득 계측 MVP, 증거/상태/API/비용/검증 설계.
- 직접 계측과 시간 상관, instance와 process 귀속, 미수신과 0회, 계측 OFF와 조회 OFF를 각각 구분했다.
- 독립 문서 검수 반영. 제품 구현·DDL·서버 재기동·배포 없음. R0·신규 기능 시험 미실행.
- 관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moveseye-apm-functional-assessment-2026-10-28|moveseye-apm-functional-assessment-2026-10-28]].
