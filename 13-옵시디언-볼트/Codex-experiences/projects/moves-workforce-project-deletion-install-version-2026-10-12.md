# 터널 최신 코드와 설치 major 불일치로 프로젝트 삭제 정체

- 증상: 삭제 창이 UNLINKING, 연결 해제 0/10건에 머무르고 터널에 projectDeletion 컨슈머 호출이 없음.
- 사이트: tom-chkim-dev.atlassian.net. URL의 환경 ID를 `forge environments list`와 대조하면 `moves-rms`이며 기본 `development`가 아니다.
- `forge install list`는 해당 설치 major 6 / Outdated app, `forge version details -e moves-rms -v 6 --json --non-interactive`는 삭제 consumer·function·sweep 부재를 확인했다.
- major 7에는 project-deletion-consumer/projectDeletion/projectDeletionSweep가 존재했다. 양쪽 scopes 7개는 동일하다.
- 터널은 최신 로컬 코드를 실행해도 설치 버전에 없는 consumer 등록을 대신하지 못한다. 코드·단위 테스트만 조사하기 전에 **URL 환경 ID → 설치 major → 해당 major의 실제 modules**를 확인해야 한다.
- 기존 major 7에는 임시 wl-visibility-probe webtrigger도 남아 있었다. 현재 manifest에는 없으므로 현재 소스 검증·배포 후 설치 갱신하는 경로로 복구 진행 중.
- backend 삭제 관련 54건, frontend 삭제 관련 17건은 통과했으나 실제 consumer 등록 부재는 mock 테스트로 드러나지 않았다.
- 후속 커밋 요청 확인: 삭제 백그라운드 구현 `7e62730`은 이미 develop에 포함된다. 이번 진단은 제품 코드 변경이 없어 추가 커밋하지 않았다. RFC-220의 승인 앱 신호 해제 변경은 별도 기능 의존성이 있어 분리 이식하지 않았다.
- backend 전체 2211건, frontend 전체 테스트와 CI 빌드는 통과. 배포·설치 갱신 및 실제 삭제 완료는 아직 실행·확인하지 않았다.

관련: [[moves-workforce-project-deletion-hardening-2026-09-22]], [[moves-workforce-project-deletion-review-2026-09-22]]
