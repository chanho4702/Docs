# 프로젝트 기간 스냅샷 Phase 1

- TableReadiness false는 실제 테이블 부재와 프로브 장애를 함께 표현한다. 부모 삭제 전에 자식 정리를 보장하려면 DELETE를 직접 실행하고 실제 missing-table 오류만 흡수해야 한다. 프로브 false를 DONE으로 기록하면 장애 중 부모만 삭제될 수 있다.
- 기간 이력은 성공한 메모리 집계에서 스칼라만 캡처한다. 종료 유예 프로젝트를 기존 live/rollup에 섞지 않고 종료일 소속 기간에 저장하면 기존 활성 집계 의미를 보존한다.
- 검증: 루트 119 suites / 1,598 tests PASS. Forge lint exit 0이나 PermissionLinter Unknown product 일부 미검증.
- 관련: [[moves-workforce-project-delete-saga-verifier-remediation-2026-08-31]]
