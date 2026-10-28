# 프로퍼티 연동 전체 검토 — 2026-10-15

Approval 0c52170, Workforce 80e7d31 기준으로 단독·미연동·연동·장애를 구분해 분석했다. 보고서는 docs/worklog-approval/PROPERTY_INTEGRATION_FULL_REVIEW.md. 문서 커밋 금지 요청을 유지했다.

- 삭제 감지 후 touchMany로 pending을 세워도 동일 digest 최적화가 PUT을 생략함을 로컬 모의 테스트로 재현했다. 감지와 게시 테스트를 연결해야 한다.
- 서명 유효성은 최신성과 다르다. 과거 인증 조회와 현재 권한 판정의 허용 기준을 분리해야 한다.
- 승인 원장 변경, 인증 게시 45초 묶음 지연, Jira 제한 적용 사이 경합은 실사이트 검증이 필요하다. 즉시 수정 불가를 완료로 단정하지 않는다.
- 연동 OFF, 비연결 이슈, 연동 장애는 서로 다르다. 기존 잠금 해제와 통계 기준도 별도다.
- Approval 백엔드 1114·UI 70, Workforce 백엔드 780·UI 전체 2691, 추가 재현 2개 통과. Approval bundle 로딩 통과. 제품 코드 수정·배포 없음.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-property-deletion-2026-10-15|moves-approval-property-deletion-2026-10-15]]
