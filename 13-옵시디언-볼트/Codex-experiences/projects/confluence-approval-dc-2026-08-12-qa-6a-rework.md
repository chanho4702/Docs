# Confluence Approval DC 배치 6a QA 재작업

- `ApprovalRegionSupport`를 깊이 인식 토큰 스캐너로 교체하고, 자기닫힘 및 중첩 매크로가 있는 영역 본문을 안전하게 해시한다.
- 해시는 `v1:` SHA-256 접두사를 사용하며, 리스너는 파싱 실패·구형 해시에서 자동 회수 대신 페이지 버전 만료로 폴백한다.
- 설정 API의 `cancelledLabel`은 구버전 호출 호환을 위해 선택값으로 유지하고, REQUESTED 메모는 이메일의 반려 사유 슬롯에 전달하지 않는다.
- 검증: Maven 전체 테스트 green, `git diff --check` green.
