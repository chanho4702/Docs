> **2026-10-19 현황.** 승인 앱 외부 API(apiRoute)는 **후속 과제**다(workforce-channel-rest Q4 — 이번 전환에서 apiRoute·custom scope 추가 없음). 워크포스에는 외부용 사용자 조회 샘플 API `GET /v1/organization/users`(scope `read:organization:custom`, `/v1/organization/teams` 와 같은 패턴)가 추가됐다. 두 앱 사이 통신은 apiRoute 가 아니라 webtrigger 채널이다.

> **비활성 구현 기록.** 2026-10-14 Approval manifest에서 apiRoute 두 개와 전용 function·adapter·custom scope 정의를 제거했다. 내부 자동 연동은 [entity property 연동 설계](cloudjira--ENTITY_PROPERTY_INTEGRATION.md)만 사용한다. 아래 내용은 현재 제품 동작이나 설치 절차가 아니다. 이미 development 환경에 등록된 custom scope 이름은 Atlassian 정책상 삭제할 수 없지만 route에 연결되지 않는다.
# 워크로그 조회 REST API 구현 보고

2026-10-13. 소스·단위 테스트 구현 완료, 실제 설치 호출 미검증. 배포·scope 등록·3LO 생성은 실행하지 않았다.

## 제공 범위

| 메서드·경로 | custom scope | 파라미터 | 응답 |
|---|---|---|---|
| GET `/v1/worklogs/approval` | `read:worklog-approval:custom` | `issueId`, `worklogId`, 선택 `historyBeforeRevision` | 기존 `getWorklogCertification`의 `{success,content}`. 승인 상태·잠금·승인 결정 이력 최신 20개 revision |
| GET `/v1/worklogs/history` | `read:worklog-history:custom` | `issueId`, `worklogId`, 선택 `offset` | 기존 `getWorklogHistory`의 열람 가능 변경 이력 중 20건과 `page` |

숫자 Jira id는 최대 18자리, 승인 revision은 최대 9자리다. 이력 offset은 0,20,…,180이다. 반복 파라미터·미선언 파라미터·잘못된 타입·변경 HTTP 메서드는 실행하지 않는다. 승인 이력의 다음 페이지는 응답 `approvalHistoryPage.nextBeforeRevision`을 넣는다. 변경 이력은 `content.page.nextOffset`을 넣는다.

변경 이력 서비스는 기존과 같이 최신 최대 200건을 조회한다. 따라서 REST API도 그 범위 안에서만 20건씩 반환하며 `page.truncated`를 보존한다. 이것은 전체 원장의 무제한 감사 내보내기 API가 아니다. offset 페이지마다 기존 서비스가 최대 201행을 읽으므로 깊은 조회에 SQL 읽기 비용이 반복된다. 새로운 SQL 커서 조회를 구현했다고 주장하면 안 된다.

## 인가

외부 요청이 보낸 accountId·cloudId·context·header를 신원 판정에 쓰지 않는다. Forge 함수의 두 번째 인자에서 `principal.accountId`와 `installContext`의 Jira site ARI만 읽는다. `installation.contexts`에 다른 cloudId가 있으면 거부한다. 인증·설치 컨텍스트가 없거나 형식이 다르면 401로 닫는다.

별도의 느슨한 서비스 엔트리를 만들지 않고 실제 기존 Controller의 `guardedDefine` 래핑 handler 두 개만 수집·호출한다. 기존 PermissionMap, ResponseWrapper의 라이선스 판정, ensureMigratedOnce, InvocationScope, asUser 이슈 권한, 작성자·팀장·관리자 범위, 설명 마스킹을 그대로 거친다. 읽기 응답에서도 상세 error cause/message를 외부에 반환하지 않는다. 일반 권한 거부는 403, 없는 대상은 404, 입력 오류는 400, 판정 실패는 503이다.

삭제 이슈의 승인 원장을 관리자에게 새로 공개하지 않는다. 기존 이슈 권한 정책 때문에 조회가 차단되는 경우 그대로 차단된다. POST/PUT/DELETE 및 승인·반려·정책 수정 API는 제공하지 않는다.

## 공식 문서와 미검증 조건

- [apiRoute 모듈](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/): Jira/Confluence 앱의 인증된 REST 엔드포인트를 제공하는 Preview 모듈. manifest는 문서 예제·설치된 @forge/manifest 12.9.0 schema에 맞춰 `operation: GET`을 사용한다.
- [REST API 노출 절차](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/): custom-scopes.yaml 등록과 function 매핑, `statusCode`·문자열 body 응답, 환경별 URL. 사용자 정의 scope는 삭제하거나 이름을 바꿀 수 없으므로 등록 명령은 실행하지 않았다.
- [REST API 접근 절차](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/): 사이트 관리자의 기본 OFF인 App REST APIs 활성화, 별도 3LO 연결과 `read:forge-app:jira`, Bearer 토큰 필요. query parameter 사용 자체는 공식 문서에서 확인된다.
- [함수 인자](https://developer.atlassian.com/platform/forge/function-reference/arguments/): 두 번째 함수 인자는 플랫폼 컨텍스트이며 공통 schema에 principal.accountId/installContext/installation.contexts가 정의되어 있다.

**apiRoute 튜토리얼은 실제 handler 요청 payload 필드 schema를 명시하지 않는다.** 구현은 `request.method`와 `queryParameters`의 문자열 또는 단일 문자열 배열만 허용하는 보수적인 어댑터다. 이 전달 형태 및 apiRoute 실제 호출에서의 platform principal/installContext는 사이트 호출로 검증해야 한다. 불일치 시 신원 fallback을 추가하지 말고 어댑터를 공식 runtime 동작에 맞춰 수정한다. 이 단계가 끝나기 전에는 운영 API가 실제 호출 가능하다고 설명하지 않는다.

apiRoute를 추가해도 Workforce의 `@forge/api`에서 Approval 함수를 무설정으로 곧바로 invoke할 수 있는 것은 아니다. 공식 접근 방식은 3LO다. 외부 통합의 읽기 경로를 준비했지만, 양 앱의 자동 연동은 기존 서명 프로퍼티 교환을 계속 사용한다. 자동 조회까지 API로 전환하려면 외부 인증 공급자/토큰 보관·동의·갱신·권한 회수 설계를 별도로 해야 한다. Preview API를 추가했다고 프로퍼티 동기화의 45초 지연이 사라지지는 않는다.

## 설치·호출 가이드

1. 최신 Forge CLI를 사용한다.
2. 검토한 scope를 `forge custom-scopes create -e development -f custom-scopes.yaml`로 등록하고 `forge custom-scopes list -e development`로 확인한다.
3. 전체 검증 후 배포·설치 upgrade로 신규 모듈을 반영한다.
4. Atlassian Administration → Apps → Sites → 대상 사이트 → Connected apps → Moves Approval → Details → App REST APIs를 활성화한다.
5. Developer Console에서 OAuth 2.0 integration을 생성한다. Permissions의 Add Marketplace or custom app에서 대상 사이트·Moves Approval·환경·필요한 custom scope만 선택한다. Jira product scope `read:forge-app:jira`도 추가한다.
6. callback URL을 설정하고 사용자 3LO 동의·토큰 교환을 완료한다. Connected apps에 표시되는 base URL을 사용한다.
7. 실제 사용자별 정상 조회/타인 기록/없는 issue/삭제 issue/미활성 라이선스/틀린 scope/다른 cloud를 검증한다. 토큰·사용자 원문을 로그로 남기지 않는다.

```bash
curl --request GET \
  --url 'https://api.atlassian.com/svc/jira/<cloud-id>/apps/<app-id>_<env-id>/v1/worklogs/approval?issueId=10001&worklogId=501' \
  --header 'Authorization: Bearer <3LO_ACCESS_TOKEN>' \
  --header 'Accept: application/json'

curl --request GET \
  --url 'https://api.atlassian.com/svc/jira/<cloud-id>/apps/<app-id>_<env-id>/v1/worklogs/history?issueId=10001&worklogId=501&offset=20' \
  --header 'Authorization: Bearer <3LO_ACCESS_TOKEN>' \
  --header 'Accept: application/json'
```

## 검증·변경 파일

`npm test -- --runInBand src/api/worklog/__test__/WorklogReadApi.test.js test/permission/permissionMap.contract.test.js`: 2 suites / 24 tests 통과.

추가: `src/api/worklog/WorklogReadApi.js`, `src/api/worklog/__test__/WorklogReadApi.test.js`, `custom-scopes.yaml`.
수정: `manifest.yml`의 apiRoute 2개와 function 2개, `src/index.js`의 API export.
앱 빌드·커밋·배포·scope 등록·외부 OAuth 상태 변경은 수행하지 않았다.


---

# 워크포스 조직 조회 API와 Approval 연결 화면

2026-10-13 구현 기록. 2026-10-14 내부 연동을 entity property로 확정하면서 활성 Controller·설정 UI·egress 권한에서 제외했다. 소스와 단위 테스트는 향후 외부 연동 검토 자료로 보존한다.

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

Workforce에서 검토 후 `forge custom-scopes create -e moves-rms -f organization-custom-scopes.yaml`로 scope를 등록한다. API 활성화·3LO 연결에서 `read:organization:custom`과 `read:forge-app:jira`를 승인한다. base URL과 토큰을 Approval 관리자 설정에 저장한다. 삭제·개명 불가능한 scope 등록, 실제 secret 저장, 외부 OAuth 설정, 배포는 이번 에이전트가 실행하지 않았다.

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

## 이 개발 사이트의 호출 주소

사이트 cloudId는 tenant_info에서 조회한 119d766c-47d4-4c52-9b89-72646f2bbc53이다. 아래 주소는 공식 gateway 규칙과 현재 앱·환경 ID로 구성한 것으로, 인증 성공 응답은 아직 확인하지 않았다. Connected apps에 표시되는 base URL과 최종 대조한다.

- Approval base: https://api.atlassian.com/svc/jira/119d766c-47d4-4c52-9b89-72646f2bbc53/apps/1bd06760-bb28-4180-a231-23e9029c7ea7_b4087b09-3509-4176-a432-45b2ec1ce056
- Workforce base: https://api.atlassian.com/svc/jira/119d766c-47d4-4c52-9b89-72646f2bbc53/apps/f8962f17-9f12-43d0-91f5-7f3a626c1bbf_6a429133-1034-43cc-8201-71fd054b1497

Approval에는 /v1/worklogs/approval 또는 /v1/worklogs/history, Workforce에는 /v1/organization/teams를 붙인다. 익명 API가 아니며 등록한 custom scope와 read:forge-app:jira를 가진 3LO 인증이 필요하다. 토큰을 문서나 URL query에 기록하지 않는다.
