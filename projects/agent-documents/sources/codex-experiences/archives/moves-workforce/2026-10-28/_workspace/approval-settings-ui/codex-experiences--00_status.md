# 작업 상태

- 기준 HEAD: 9e7117262402911df2a794afe26e410aa228985f (RFC-220).
- 기존 사용자 변경: docs/external-api/README.md 및 미추적 발표 자료·API 예제·custom-scopes.yaml·LeaderTeamBackfill.test.js·캡처 이미지 보존.
- 단일 프론트 변경이므로 리더가 직접 구현했다. 백엔드·manifest·공용 컴포넌트 계약 변경 없음.
- 소유 파일: IssueApprovalSettingTable.jsx, IssueApprovalBulkModal.jsx, 두 화면 테스트, approvalSettings.css, kr/en 기능 번역과 merge 생성물.
- 구현 및 최종 테스트·CI 빌드 완료. 전체 프론트 2,764개, 최종 영향 테스트 16개 통과. 최종 Forge lint는 응답 지연으로 중단해 미검증으로 기록했다. 제품 코드는 미커밋·미배포다.
