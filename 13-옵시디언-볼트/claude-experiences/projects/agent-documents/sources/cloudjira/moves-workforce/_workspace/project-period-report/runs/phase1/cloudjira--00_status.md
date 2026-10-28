Phase 1 구현·검증 완료. production: phase1_backend, 독립 리뷰: phase1_review, 테스트/보존 검증: 리더. Phase 2·3 제외. 보호 파일 바이트 일치, PermissionMap 1줄/src index 2줄 추가만. 커밋/배포 없음. 최종 파일 목록과 결정은 RESULT.md.

- 최종 실행 확인: npm.cmd test -- --runInBand, 119 suites / 1,598 tests PASS, exit 0.
- Forge lint: 네트워크 제한 환경에서는 EACCES, 재실행은 exit 0 / No issues found. 단 PermissionLinter가 Unknown product로 일부 검사를 수행하지 못했다는 경고가 있어 해당 검사 범위는 미검증.
