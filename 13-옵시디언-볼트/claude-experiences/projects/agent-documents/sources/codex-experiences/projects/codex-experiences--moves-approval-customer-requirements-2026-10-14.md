# 워크로그 고객 요구 보고와 검증 경계

2026-10-14. 저장소 docs/worklog-approval/CUSTOMER_REQUIREMENTS_BRIEF.md 및 CUSTOMER_VERIFICATION_GUIDE.md 작성.

- 건별 승인 잠금과 기간 전체 추가·수정·삭제 잠금을 구분한다. 외부 생성의 사후 감지는 사전 차단 증거가 아니다.
- PermissionMap bulkApprove는 SELF이며 ApprovalService는 건별 지정 결재자 판정을 사용한다. 팀장 전용 타임시트 경로와 혼동하지 않는다.
- 최신 ctl은 wr로 Workforce 입력 판정을 지원한다. ctl.wa는 제거됐지만 rms.issue.wa는 유지된다.
- 월별 승인 결과는 작성자 사용자 프로퍼티의 entry.approval.entries에 있다. 실제 배열 순서는 WorkforcePublisher를 따른다.
- 개발 사이트 일부 진단 기록과 고객 수용 시험 완료를 구분한다. 이번 작업은 문서만 작성하고 사이트 검증은 수행하지 않았다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-entity-property-integration-2026-10-14|moves-approval-entity-property-integration-2026-10-14]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-worklog-simplification-2026-10-13|moves-approval-worklog-simplification-2026-10-13]]

## 2026-10-15 시각 설명 자료 보완

- `docs/worklog-approval/WORKFORCE_APPROVAL_ARCHITECTURE.html`에 전체 구조, 프로퍼티별 JSON, 작성·승인·게시·잠금 흐름, 인증, API 대안, 우려 사항을 통합했다.
- 인증은 두 층이다: Jira REST 호출 권한은 Forge `asUser()/asApp()`, 프로퍼티 발행자 확인은 Ed25519 서명이다.
- 서명 대상은 `v, typ, cloudId, ent, kid, iat, body`다. `cloudId`와 `ent`는 조회 위치에서 재구성하므로 다른 사이트·사용자·기간에 복사하면 검증이 깨진다.
- 과거 apiRoute는 URL과 scope만 제공했다. 자동 내부 연동에는 사이트 활성화, 사용자 3LO 동의, access/refresh token 운영, 철회·퇴사·재동의 처리가 더 필요했고, 조직 조회 결과도 승인 원장에 ingest하지 않았다. 따라서 API 자체 불가능이 아니라 당시 구현이 headless 지속 동기화 조건을 충족하지 못한 것이 정확한 설명이다.
- 우려 사항은 직접 신규 POST 사전 차단, 비동기 반영 구간, 팀장 전용 bulk 보완, 이력 완전성, 환경 공용 키 운영, revision/만료, 문서 잘림·SQL 용량, 삭제 이슈 감사 열람이다.
