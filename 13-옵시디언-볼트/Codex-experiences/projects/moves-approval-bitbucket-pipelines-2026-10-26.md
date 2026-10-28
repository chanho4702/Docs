# Moves Approval Bitbucket Pipelines 미실행 진단 — 2026-10-26

- 저장소 브랜치 모델의 production 브랜치는 `main`, development 브랜치는 `develop`이다. 원격 `master`는 2026-10-04의 `c3b8ff5`에서 멈춘 구브랜치이며, 로컬 `master`만 그보다 11커밋 앞서 있었다. `bitbucket-pipelines.yml`의 production 조건은 `master:`라 실제 production 브랜치 모델과 어긋난다.
- `develop` 최신 원격 커밋은 처음에 `f5951eb`이었지만 Builds 열과 실행 기록이 없었다. 원인은 저장소의 **Enable Pipelines**가 꺼져 있었기 때문이다. 2026-10-26 저장소 설정에서 Pipelines를 활성화했다.
- staging 단계는 `develop` push 뒤 test와 build가 끝나도 `trigger: manual`이라 자동 배포되지 않는다. 활성화 이전 push는 소급 실행되지 않으므로 새 push나 수동 실행이 필요하다.
- Moves Approval 저장소의 Repository variables는 비어 있었다. 사용자 승인 뒤 로컬 Atlassian 관리자 자격으로 `FORGE_EMAIL`과 `FORGE_API_TOKEN`을 모두 Secured 변수로 등록했다. 민감값은 화면·로그·노트에 남기지 않았다.
- production 파이프라인 조건을 실제 브랜치 모델에 맞게 `master:`에서 `main:`으로 고쳐 `d2a8ab9`로 `develop`에 푸시했다. 이 push로 만들어진 Bitbucket Pipeline #1은 jest test 2분 39초, Build 4분 39초, Deploy to Staging 2분으로 모두 성공했다. staging 단계에서 `forge deploy -e staging`과 `forge install --upgrade --site dmove-staging.atlassian.net --product confluence -e staging`이 모두 통과했다.

관련: [[moves-approval-modal-marketplace-docs-2026-10-22]]
