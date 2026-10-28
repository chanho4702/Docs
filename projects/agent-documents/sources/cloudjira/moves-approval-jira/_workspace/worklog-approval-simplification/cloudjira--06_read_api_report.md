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
