# 프로젝트 삭제 정체 진단

- 기준 HEAD: `8005295`. 제품 코드 수정 없음.
- 사용자 증상: 삭제 진행 창이 계속 회전함.
- 실제 Chrome 화면: `tom-chkim-dev.atlassian.net`, 환경 ID `6a429133-1034-43cc-8201-71fd054b1497` = `moves-rms` (DEVELOPMENT). localhost:8000 터널 사용. `UNLINKING`에 해당하는 문구와 연결 해제 `0 / 10건` 확인.
- 목록에서 테스트 프로젝트 2, 마이크 없는 프로젝트가 삭제 중으로 보임. 열린 모달이 어느 프로젝트인지는 확정하지 않음.
- `forge environments list`에서 moves-rms 마지막 배포 2026-10-08 확인. development 기본 환경과 다르므로 진단 시 환경 이름을 명시할 것.
- moves-rms 최근 원격 로그 없음. 실행 중인 터널 출력은 이 세션에서 접근하지 못함. 사용자에게 `queue/consumer.projectDeletion` 호출 및 오류 출력을 요청함.
- 브라우저 콘솔에 `ConnectionClosedError` 다수 존재. 이력 로그이므로 현재 삭제 정체의 직접 원인으로 확정할 수 없음.
- 코드상 enqueue 오류가 삼켜지고, 배경 폴링의 통신 실패는 진행 상태를 유지함. 원인 판별 전 추측으로 변경하지 않음.
- 검증: backend `npm test -- --runInBand --silent ProjectDeletion` 6 suites / 54 tests 통과, frontend `npm test -- --runInBand --silent useProjectDeletionLoop projectDeletionFlow` 2 suites / 17 tests 통과. 실제 삭제 완료는 미확인.
- 다음: 터널의 컨슈머 호출/오류 확인 → 실제 원인에 대한 최소 수정 → 관련 및 필수 검증. 배포·설치·삭제 재실행·터널 중지는 하지 않음.

## 후속 확인

- 사용자: 터널에서 해당 호출/오류 출력이 없다고 응답.
- `forge install list`: tom-chkim-dev.atlassian.net의 moves-rms 설치는 major 6 / Outdated app. 최신 배포는 major 7.
- Git: 2026-10-07 `7e62730`에서 삭제 consumer/function/scheduledTrigger가 manifest에 추가되었음. moves-rms major 6 배포는 2026-10-01, major 7 배포는 2026-10-08.
- 설치된 major 6과 터널 최신 코드의 불일치가 우선 원인 후보. `forge version details`로 두 버전의 실제 모듈·권한을 대조 중. 오류 표시 코드 변경은 보류.

- 실제 version details 대조 완료: major 6에 삭제 consumer·function·sweep 없음, major 7에는 모두 있음. scopes/egress 동일. major 7에만 임시 wl-visibility-probe dynamic webtrigger 존재하며 현재 소스에는 없음.
- 복구 계획: 현재 소스 검증 후 moves-rms 환경에 배포하고 tom-chkim-dev 사이트의 기존 moves-rms 설치만 upgrade. 다른 설치는 작업 범위 밖.
- backend 전체 검증: `npm test -- --runInBand --silent`, 162 suites / 2211 tests 통과(exit 0).
- 최초 forge lint는 빌드 중 출력 디렉터리 재생성 시점과 겹쳐 index.html 부재로 실패. 빌드 완료 후 순차 재실행 필요. PermissionLinter Unknown product 경고도 관측됨.

## 커밋 요청 확인

- 사용자 후속 요청: 삭제 로직을 develop 브랜치에 커밋.
- `git log develop`와 `git branch --contains 7e62730` 확인: 삭제 백그라운드 구현 `7e62730`은 이미 develop에 포함되어 있다(develop HEAD `48615e8`). 이번 진단에서 제품 코드는 수정하지 않아 추가 커밋 대상이 없다.
- 현재 브랜치는 RFC-220, HEAD `8005295`. develop 대비 삭제 worker/consumer 차이는 승인 앱 신호 해제와 context 전달이며 RFC-220 의존성이 있어 삭제 정체 수정으로 따로 옮기지 않았다.
- 사용자 작업인 AGENTS.md 수정과 기존 untracked 파일을 보존. 브랜치 전환·새 커밋·푸시 없음.
- frontend 전체 테스트 exit 0, CI=true 전체 빌드 및 app/panel bundle budget 검사 exit 0. 빌드 후 forge lint exit 0 / No issues found. 단 PermissionLinter의 Unknown product 경고로 권한 검사 일부는 미검증.
- 배포·설치 upgrade는 아직 실행하지 않았으며 실제 삭제 완료도 미확인. 후속 요청에 따라 커밋 상태 확인을 우선했다.
