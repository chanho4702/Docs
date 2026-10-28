# Workforce 팀 조회 webtrigger 샘플 (2026-10-15)

사용자가 property 복사 대신 앱 간 직접 조회를 검토하며 Workforce 팀 조회 샘플을 요청했다. 기존 entity property 연동 및 OAuth apiRoute는 유지하고 별도 dynamic webtrigger를 추가했다. Approval 연결은 아직 하지 않았다.

- 개발 사이트 tom-chkim-dev.atlassian.net의 실제 Jira 설치 환경은 development가 아니라 moves-rms다. install list로 확인 후 9.0.0 배포·major 설치 upgrade를 완료했다. 운영 미배포.
- TeamsWebtrigger는 256bit Bearer token을 상수시간 비교하고 플랫폼 installContext를 설정 cloudId와 대조한다. 인증 전에 KVS/SQL을 읽지 않는다. 샘플 서비스 자격으로 해당 사이트의 팀 디렉터리 네 필드만 허용하며 사용자 principal을 가장하지 않는다.
- 팀 ID·팀명·상위 팀 ID·팀장 accountId만 반환. 팀원·급여·이메일·권한 세트 제외. 기존 loadTeams로 캐시 없이 읽고 truncated를 명시한다. 라이선스 INACTIVE 차단을 재사용한다.
- token은 Forge 암호화 환경 변수, 로컬은 .forge/teams-sample-token.dpapi. URL은 .forge/teams-sample-url.txt. scripts/teams-sample.ps1로 현재 Windows 사용자만 암호문을 복호화해 호출한다. 비밀 원문을 파일·로그에 남기지 않았다.
- 검증: backend 184 suites / 2862 tests, UI 169 suites / 2691 tests, UI build budget 통과. 새 endpoint와 기존 index webpack require 통과. Forge lint 오류 0(기존 PermissionLinter Unknown product 메시지). dynamic webtrigger의 RoA 상실 major upgrade 승인 후 배포.
- 실호출: 정상 GET 팀 3개, 단건 GET 1개, 무인증 401, POST 405. 샘플 스크립트 성공.
- dynamic 데이터 응답 때문에 이 개발 버전은 Runs on Atlassian 비적격. 고객 배포 전 설치별 자격 발급·회수와 사용자 범위, 감사·호출량 정책을 추가 설계해야 한다.

관련: [[moves-approval-entity-property-integration-2026-10-14]]
## 사용자 결정: 샘플 폐기

사용자가 키 운영 부담·심사·Runs on Atlassian 제약을 확인한 뒤 webtrigger 방식을 취소하고 샘플 제거를 요청했다. URL을 Forge에서 삭제하여 HTTP 404 확인, 서버의 TOKEN/CLOUD_ID 변수와 로컬 DPAPI 키·URL 파일을 삭제했다. 샘플 handler/test/script/doc 및 manifest 항목을 제거하여 저장소 tracked diff가 없는 초기 상태로 복원했다. 기존 OAuth apiRoute와 property 연동은 유지한다. 배포 결과는 후속 기록을 따른다.

제거 완료: moves-rms 9.1.0 배포 성공, Forge가 Runs on Atlassian eligible 복구를 확인했다. backend 183 suites / 2850 tests, UI 169 suites / 2691 tests, UI build·번들 로드·lint 통과. 기존 URL 404 및 로컬 키 파일 부재 확인. 운영 환경 변경 없음.
