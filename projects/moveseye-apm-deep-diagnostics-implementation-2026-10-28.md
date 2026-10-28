---
tags: [moveseye, apm, opentelemetry, implementation]
updated: 2026-10-28
---

# APM 심층 진단 격리 구현

공유 정본은 [공유 Vault 노트](C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-10-28-apm-deep-diagnostics-implementation.md)다.

- BE·FE·Java 확장 전용 worktree와 독립 PG/Redis/포트에서 R0~M1b 구현·검증. master 미병합·미배포.
- BE 109 unit + 107 IT, FE tsc + 120 tests, extension 34 tests, E2E 44 assertions 통과.
- 실제 Agent classloader, Collector ID redaction, 기존 memory/thread metric 의미 손실을 실증해 수정 또는 기능 범위에서 제외했다.
- 로컬 병합 완료·비사용 브랜치 35개를 `git branch -d`로 정리하고 원래 SHA를 작업 기록에 보존했다.
- 장기 부하·반복 성능·archive 왕복은 미수행.

관련: [[moveseye-apm-deep-diagnostics-design-2026-10-28]], [[moveseye-apm-functional-assessment-2026-10-28]].
