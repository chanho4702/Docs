# Confluence Approval DC: 업무함 승인 유형 컬럼 분리 (2026-08-20)

- 승인 업무함 목록에서 페이지 제목에 붙던 매크로 승인·페이지 승인 badge를 제거하고 제목 다음의 `유형` 독립 컬럼으로 분리했다.
- 반응형에서 숨기는 요청자·요청 시각·Flow 열 번호를 새 컬럼 순서에 맞춰 조정했다.
- JDK 21 `mvn -pl approval-confluence9 -am package`가 테스트 포함 성공했다.
