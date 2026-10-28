# 프로젝트 삭제 복구 및 Sentry 관측 보완

- 기존 삭제 변경을 보존하면서 pagination, 이동 이슈 metadata 보호, discovery/SQL/KVS 체크포인트, 최초 요청자에 한정된 scope 복구와 완료 tombstone을 구현했다.
- 프로젝트 삭제 중 child INSERT/UPSERT 재생성을 막으려면 서비스 사전조회만으로 부족하다. 12개 SQL entry의 INSERT SELECT에 parent ACTIVE 조건을 포함하고, 차단된 0행과 정상 duplicate-no-op을 구분한다.
- TableReadiness false는 실제 테이블 부재와 probe 장애를 구분하지 못한다. 삭제는 직접 DELETE에서 실제 missing-table만 0건 성공으로 취급하고 나머지 오류는 전파한다. Claude의 null??0 제안은 그대로 적용하지 않고 이 경계를 확인했다.
- 저장 discovery cursor가 무효해진 HTTP400은 PENDING/빈 cursor로 초기화하고 실패로 종료한다. 다음 수동 재시도에 재발견하며 자동 무한 반복을 만들지 않는다. SQL upsert 실패와 비400은 cursor를 유지한다.
- 팀 관리형 Jira 이슈의 field omission은 직접 GET만으로 해제 판정하지 않는다. POST search/jql reconcileIssues fallback을 사용하며 postJiraJson은 객체를 받아 내부 JSON.stringify하므로 이중 직렬화를 피한다.
- frontend에서 처리된 success:false 및 success:true/FAILED 상태는 기존 consoleLoggingIntegration만으로 Sentry에 잡히지 않는다. 삭제 오류 전용 captureMessage와 safe tags, TTL/수량 제한, beforeSend allowlist로 수집한다. projectId는 dedupe 내부키에만 쓰고 raw error/message/cause/user/request/breadcrumb/contexts/exception은 event에서 제외한다.
- Sentry report 실패는 사용자 흐름을 막지 않는다. 삭제의 업무 실패는 Sentry Issues에 들어가며 기존 frontend console Logs와 수집 경로가 다르다. 모든 resolver/백그라운드 작업까지 관측하는 것은 후속 범위다.
- Claude 실제 CLI 1차는 529로 실패, 2차 독립 검토 완료. HTTP 오류 prefix와 continuation effect의 mutation 객체 의존 문제를 반영했다.
- 작업 중 외부에서 HEAD가 86abae4로 이동해 진행 중 수정 대부분이 커밋에 포함되었다. 이 세션은 commit/push/deploy 명령을 실행하지 않았다. 이후 cursor 복구는 별도 working-tree diff다.
- 제품 SQL/Jira 원자적 CAS는 없으며 최초 discovery 검색 지연, 외부 변경과 probe/write 사이 경합, 새로고침 후 삭제 작업 재개 UI는 잔여 경계다. live Jira/Forge SQL/Sentry 수신은 검증하지 않았다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-deletion-review-2026-09-22|moves-workforce-project-deletion-review-2026-09-22]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-delete-saga-verifier-remediation-2026-08-31|moves-workforce-project-delete-saga-verifier-remediation-2026-08-31]]

최종 검증: backend 116 suites/1580 tests, frontend 114 suites/1822 tests/1 snapshot 통과. CI build 통과(gzip 477174 bytes). Forge lint exit0이나 PermissionLinter Unknown product로 일부 권한 검사는 미검증.
