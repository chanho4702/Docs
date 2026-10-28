# 워크포스 조직 조회 API와 Approval 연결 화면

2026-10-13. 소스·대상 테스트 완료. 실제 사이트 API·토큰 등록은 아직 검증하지 않았다.

## 제공 API

Workforce `GET /v1/organization/teams?offset=0`, 사용자 정의 scope `read:organization:custom`. `organization-custom-scopes.yaml`을 신규 생성했고 사용자가 소유한 기존 untracked `custom-scopes.yaml`은 변경하지 않았다.

플랫폼 함수 두 번째 인자의 principal.accountId와 Jira site installContext만 신원으로 사용한다. 실제 기존 TeamController의 `getTeamList`와 `findTeamById` guarded handler를 수집·호출해 TEAM_MANAGEMENT 또는 USER_MANAGEMENT read, 라이선스, 상세 권한을 모두 그대로 거친다. custom scope만으로 조직 권한이 추가되지 않는다.

응답 예시:

```json
{
  "success": true,
  "content": {
    "source": "WORKFORCE_API",
    "teams": [{
      "teamKey": "team-key",
      "teamName": "개발팀",
      "parentTeamKey": null,
      "leaderAccountId": "lead-account-id",
      "leaderName": "팀장 이름",
      "memberCount": 1,
      "members": [{"accountId":"member-account-id","displayName":"팀원 이름","isLeader":false}],
      "membersTruncated": false
    }],
    "page": {"offset":0,"size":10,"nextOffset":null,"truncated":false},
    "limits": {"teams":10,"membersPerTeam":100,"membersPerPage":500}
  }
}
```

팀 페이지는 10개, 팀별 최대 100명, 페이지 전체 최대 500명이다. 현재 Workforce 조직 원천도 최대 500팀이며 기존 원천의 truncated를 유지한다. 이메일·급여·원가·개인 권한·상세 원장 정보를 반환하지 않는다. 응답의 nextOffset으로 다음 팀 페이지를 읽는다. 팀원 상한을 넘긴 팀의 나머지 인원을 별도 member cursor로 조회하는 기능은 없다. 따라서 완전한 조직 원장 내보내기 API라고 설명하면 안 된다.

기존 getTeamList는 전체 트리를 읽고, 각 반환 팀의 findTeamById는 상세·팀원을 다시 읽는다. 한 페이지 최대 11번의 기존 handler 호출이므로 팀 상세의 SQL·KVS·Jira 이름 조회 비용이 반복된다. 새 배치 Repository로 최적화하거나 주기별 수집 작업을 추가하지 않았다. 요청할 때만 실행한다.

## Approval 관리자 UI

기존 설정의 워크포스 팀 섹션 아래 `조직 조회 API 연결`을 추가했다. 기존 서명 조직 수신 목록은 원천을 표시하며 유지된다. API 목록은 별도 `워크포스 API / 조회 전용` 태그를 붙이고 오류를 조용히 서명 원천으로 바꾸지 않는다.

관리자는 Connected apps에서 확인한 **api.atlassian.com 형태**의 Workforce base URL과 3LO access token을 입력한다. backend는 현재 resolver cloudId와 URL의 cloudId를 대조하고 `https://api.atlassian.com/svc/jira/<UUID>/apps/<UUID>_<UUID>` 형식만 허용한다. 사이트 gateway URL은 공식 API 자체는 지원하지만 이번 연결 입력에서는 허용하지 않는다. 임의 호스트·경로·query·userinfo·HTTP URL을 받지 않는다. fetch는 `/v1/organization/teams?offset=N` GET 한 종류만 가능하며 redirect는 수동 차단, 10초 fetch timeout, 응답 본문 512KiB와 팀·인원 상한 검증을 적용했다.

base URL·토큰·저장 관리자·저장 시각은 한 KVS secret 객체로 저장한다. 상태 응답은 토큰을 반환하지 않는다. UI password 입력은 저장 후 비우며 저장된 토큰을 다시 표시하지 않는다. 해제는 secret 삭제 및 프론트 캐시 제거로 처리한다. 네트워크 오류·HTTP 에러 원문·토큰·조직 본문을 로그에 싣지 않는다.

resolver 4개는 모두 PermissionMap `{admin:true}`와 실제 guardedDefine를 사용하며 Controller를 CONTROLLER_REGISTRARS에 등록했다:

- getWorkforceOrganizationApiStatus
- saveWorkforceOrganizationApiConnection
- deleteWorkforceOrganizationApiConnection
- listWorkforceOrganizationApiTeams

API 조회 시 연동 OFF면 외부 호출 전에 거부한다. 읽기 결과는 **저장한 토큰 소유자**의 Workforce 권한 범위이고 Approval에서 보는 사람은 앱 관리자이다. 저장 관리자를 바꾼다고 기존 토큰의 OAuth 소유자가 바뀌지 않는다. 승인자/팀장 판정은 기존 서명 검증 명부를 계속 사용한다. 이번 기능은 팀 구성을 표시하며 조직 API 결과를 Approval 명부 DB에 ingest하거나 승인 권한을 추가하지 않는다.

자동 토큰 갱신·refresh token·OAuth callback·사용자별 동의 흐름을 구현하지 않았다. access token이 만료되면 WORKFORCE_API_AUTH_REQUIRED를 표시하고 관리자가 새 access token을 입력해야 한다. 제품 전체 자동 연동의 유일한 필수 경로로 삼을 단계가 아니다.

## 공식 근거·설정

[apiRoute](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/), [REST API 노출](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/), [REST API 접근](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/), [공통 함수 context](https://developer.atlassian.com/platform/forge/function-reference/arguments/).

[KVS secret 문서](https://developer.atlassian.com/platform/forge/storage-reference/kvs-api-secret/)는 setSecret/getSecret의 암호화 저장과 query 검색 불가, 설치별 저장 격리를 설명한다. [permissions 문서](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)에 따라 Approval manifest에 api.atlassian.com backend fetch egress를 추가했다. 모듈·권한 변경은 최종 배포 후 install upgrade가 필요하다.

Workforce에서 검토 후 `forge custom-scopes create -e development -f organization-custom-scopes.yaml`로 scope를 등록한다. API 활성화·3LO 연결에서 `read:organization:custom`과 `read:forge-app:jira`를 승인한다. base URL과 토큰을 Approval 관리자 설정에 저장한다. 삭제·개명 불가능한 scope 등록, 실제 secret 저장, 외부 OAuth 설정, 배포는 이번 에이전트가 실행하지 않았다.

```bash
curl --request GET \
  --url 'https://api.atlassian.com/svc/jira/<cloud-id>/apps/<workforce-app-id>_<env-id>/v1/organization/teams?offset=0' \
  --header 'Authorization: Bearer <3LO_ACCESS_TOKEN>' \
  --header 'Accept: application/json'
```

공식 apiRoute 문서는 query 지원을 명시하지만 handler request payload 필드 schema는 제시하지 않는다. 구현의 method/queryParameters 전달 형태와 플랫폼 principal/installContext, 양쪽 라이선스 판정은 실제 사이트에서 검증해야 한다. context 부재 시 body/header 신원으로 후퇴하지 않는다.

## 검증 결과

- Approval API 연결 서비스·PermissionMap: 2 suites / 21 tests 통과.
- Workforce 조직 API·PermissionMap: 2 suites / 32 tests 통과.
- Approval 조직 API UI·기존 팀 UI: 2 suites / 8 tests 통과.

마지막 검증 후 한국어 locale pipeline 손상(`??`)은 apply_patch로 모두 교정하고 merge를 다시 실행했다. 최종 전체 테스트·UI 빌드·실제 브라우저 검증은 root가 진행한다. 빌드·커밋·배포는 수행하지 않았다.
