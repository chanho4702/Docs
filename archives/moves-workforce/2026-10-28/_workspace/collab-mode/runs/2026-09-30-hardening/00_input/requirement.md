# 협업 모드 후속 수정

사용자는 검수에서 확인한 코드 결함과 효율성 개선의 구현을 승인했다.

범위:
- SQL 판정 오류와 실제 OFF 구분, user fail-close 유지.
- app 판정 성공 후 재조회 실패 시 frontend 상태 전환과 캐시 처리.
- 대시보드 워크로그 1,000이슈 상한 절단 표시.
- coverage 응답의 쓰기 권한별 캐시 분리 및 현재 권한 소비.
- 권한 경계를 보존하는 중복 Jira 요청 감소. 전역 사용자 컨텍스트 Promise 공유는 도입하지 않는다.

완료 조건: 경계 회귀 테스트, 전체 backend/frontend 테스트, CI=true frontend 빌드, Forge lint, 최종 독립 계약 검증. 운영 응답 시간 측정·배포·설치·DB migration 실행·중복 앱 제거·커밋·푸시는 범위 밖이다.

기존 work/map/issue UI 변경, requestJira.js와 jiraKeys.js/projectKeys.js 변경 및 미추적 파일을 보존한다. generated locales는 시작부터 수정 상태이며 원본 kr/en과 비교 후 merge 영향을 확인한다.
