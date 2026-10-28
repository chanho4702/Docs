# Approval 프로퍼티 삭제 검토 (2026-10-15)

- Jira 프로퍼티 삭제와 Approval SQL 승인·감사 원장 삭제는 별개다. 검증 수신값 유지(sticky)는 최초 수신 전 누락과 오래된 조직 권한 문제까지 해결하지 않는다.
- `verifyPublished`의 MISSING_REMOTE 감지 → `touchMany`만으로 복구를 보장할 수 없다. 기존 digest·publishedAt·kid가 유지되어 drain의 unchanged 최적화가 실제 PUT을 생략할 수 있다. 정적 코드 검토 결과이며 실사이트 재현은 미실시다.
- 정책 캐시 만료 후 비잠금 설정의 병합 제외와 기존 승인 잠금은 구분하여 검증해야 한다.
- 누락 관찰 로그는 삭제 행위자·정확한 삭제 시각의 증거가 아니다.
- 상세 문서: `C:\CloudJira\moves-approval-jira\docs\worklog-approval\ENTITY_PROPERTY_DELETION_IMPACT.md`
- 관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-entity-property-integration-2026-10-14|moves-approval-entity-property-integration-2026-10-14]]