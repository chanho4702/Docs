독자: 고객 사이트 관리자·연동 담당자·연동 개발자 (고객 가이드, 기존 문체 유지)

# Moves Workforce 외부 조회 API 연결 가이드 및 설정 방법

> 대상: 고객 사이트 관리자(1장), 연동 담당자(2·3장), **연동을 개발하는 개발자(4·5장)**
> 기준: 2026-10-20, 개발 사이트에서 실측한 화면·응답. 화면 문구는 Atlassian이 바꿀 수 있다.
> 바로 쓸 수 있는 예제 코드: [`examples/workforce-client.mjs`](examples/workforce-client.mjs)(Node.js 18+) · [`examples/workforce_client.py`](examples/workforce_client.py)(Python 3.9+) — 둘 다 개발 사이트에서 실행 확인.

Moves Workforce(이하 Workforce)는 외부 시스템에서 팀·사용자 조직 정보를 읽을 수 있도록 REST API(HTTP 요청으로 데이터를 조회하는 인터페이스)를 제공한다.
외부 시스템은 **사용자 본인의 동의를 거치는 OAuth 2.0 3LO(사용자·연동 시스템·Atlassian 간 인증·인가 방식)**로 받은 토큰을 사용해 API를 호출한다.
API는 **해당 사용자가 Workforce에서 볼 수 있는 범위만** 반환한다. 토큰을 받았다고 권한이 늘어나지는 않는다.

| API | 설명 |
|---|---|
| `GET /v1/organization/users` | 사용자 목록(20명 단위) 또는 1명 조회. 이름·활성 여부·소속 팀·팀장 여부 제공 |
| `GET /v1/organization/teams` | 팀 목록(10팀 단위) 조회. 상위 팀·팀장·구성원 제공 |

두 API 모두 같은 scope(토큰에 부여할 접근 권한 범위)인 `read:organization:custom`을 사용한다. 화면 이름은 "Read organization teams and users"다.

## 전체 순서

이 장에서는 설정부터 API 호출·토큰 갱신까지의 순서와 단계별 담당자를 확인한다.

| 단계 | 담당자 | 작업 위치 | 수행 시점 |
|---|---|---|---|
| 1. 앱 REST API 켜기 | 사이트 관리자 | admin.atlassian.com | 사이트당 한 번 |
| 2. OAuth 앱 만들기·권한 연결 | 연동 담당자 | developer.atlassian.com | 연동 시스템당 한 번 |
| 3. 동의 → 인증 코드(`code`)를 토큰으로 교환 | 토큰 주인이 될 사용자 → 연동 서버 | 동의 화면 → `auth.atlassian.com/oauth/token` | 처음 한 번(취소 전까지) |
| 4. 호출·토큰 갱신 | 연동 서버 | 기본 URL | 계속(토큰은 1시간마다 갱신) |

---

## 1. 앱 REST API 켜기 (사이트 관리자)

이 장에서는 사이트 관리자가 앱 REST API를 켜고 기본 URL을 확인하는 방법을 안내한다.

Atlassian은 사이트마다 앱 REST API를 기본으로 꺼 둔다. 외부 호출을 받으려면 사이트 관리자가 이 설정을 켜야 한다.

1. [admin.atlassian.com](https://admin.atlassian.com)에 접속한다. 조직을 선택한 뒤 **앱** → **사이트** → 해당 사이트 → **연결된 앱**으로 이동한다.
2. "Workforce"로 검색한다. **Moves Workforce for Jira**를 펼친 뒤 **앱 세부 정보 보기**를 선택한다.

   ![연결된 앱 목록](img/01-connected-apps.jpg)

   ![앱 세부 정보](img/02-app-details.jpg)

3. 화면 아래쪽에서 **앱 REST API** 항목의 "사용 중지" 상태를 확인한다. **앱 REST API 사용으로 설정**을 선택한 뒤 확인 창에서 확인한다.

   ![앱 REST API 사용 중지 상태](img/03-app-rest-api-off.jpg)

   ![확인 창](img/04-app-rest-api-confirm.jpg)

4. "사용" 배지와 **기본 URL**이 나오면 설정이 끝난다. 이 URL을 연동 담당자에게 전달한다.

   ![앱 REST API 사용 상태와 기본 URL](img/05-app-rest-api-on.jpg)

- 기본 URL 형식: `https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}`
- 같은 API를 `https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}`로도 호출할 수 있다.
- API를 끄려면 같은 위치에서 **앱 REST API 사용 중지**를 선택한다. 끄면 모든 외부 호출이 차단된다.
- 참고: 이 설정 변경은 사이트 감사 로그에 남지 않았다(2026-10-20 확인). 누가 설정을 켰는지는 내부 기록으로 남겨 두는 것이 좋다.

## 2. OAuth 앱 만들기·권한 연결 (연동 담당자)

이 장에서는 OAuth 앱을 만들고 API 권한·동의 URL·인증 정보를 설정하는 방법을 안내한다.

외부 시스템이 토큰을 받으려면 Atlassian에 등록된 "OAuth 2.0 앱"이 필요하다.

### 2-1. 앱 만들기

1. [Developer Console](https://developer.atlassian.com/console/myapps/)에서 **Create** → **OAuth 2.0 integration**을 선택한다.
2. 앱 이름을 입력한다. 접근 유형은 **Resource-level**(동의할 때 고른 사이트 하나만 접근)을 권장한다.
3. 약관에 동의한 뒤 **Create**를 선택한다.

![OAuth 앱 만들기](img/06-create-oauth-app.jpg)

> 화면 위 안내대로 **refresh token(액세스 토큰 갱신에 쓰는 토큰) 회전이 강제**된다. 갱신할 때마다 refresh token도 새 값으로 발급되므로 매번 바꿔 저장해야 한다(4-3 참고).

### 2-2. Workforce 권한 연결

1. **Permissions** 화면에서 **Add Marketplace or custom app**을 선택한다.
2. 사이트를 선택한 뒤 앱 **Moves Workforce for Jira**를 선택한다.
3. scope **`read:organization:custom`**을 선택한 뒤 **Add**를 선택한다.

![워크포스 권한 선택](img/07-add-workforce-scope.jpg)

권한을 추가하면 기본 URL이 한 번 표시된다. 제품을 **jira**로 바꿔 확인한다.
이 화면을 닫으면 기본 URL을 다시 보여 주지 않지만, 1장에서 확인한 기본 URL과 같다.

![추가 완료와 기본 URL](img/08-base-url.jpg)

### 2-3. Jira 권한 추가

1. 같은 **Permissions** 화면에서 **Jira API**의 **Add**를 선택한 뒤 **Configure**를 선택한다.
2. **Granular scopes**에서 `forge-app`을 검색한다.
3. **`read:forge-app:jira`**만 선택한 뒤 **Save**를 선택한다. 바로 아래의 `write:forge-app:jira`는 **선택하지 않는다**.

![read:forge-app:jira](img/09-jira-forge-app-scope.jpg)

권한 요약에 Jira API 1개, Moves Workforce for Jira 1개가 표시되는지 확인한다.

![권한 요약](img/10-permissions-summary.jpg)

### 2-4. Callback URL·동의 URL 설정

1. **Authorization** 화면에서 **OAuth 2.0 (3LO)**의 **Add**를 선택한다.
2. 연동 시스템의 Callback URL(동의 후 브라우저가 돌아올 주소)을 저장한다.
3. 아래 **Authorization URL generator**에 표시되는 동의 URL을 확인한다. **반드시 "Marketplace App: Moves Workforce for Jira" 아래의 URL을 사용한다.** 이 URL 끝에는 `sns={appId}.{envId}`가 붙어 있다.

![Callback URL 과 동의 URL](img/11-callback-auth-url.jpg)

> ⚠️ 위쪽의 "Granular Jira API authorization URL"이나 직접 만든 URL에 `sns`가 없으면, 동의에 성공해도 Workforce 권한이 빠진 토큰이 발급된다(4-4의 403).
> 사용자 개입 없이 주기적으로 호출하려면 URL의 `scope`에 **`offline_access`**를 직접 추가한다. Authorization URL generator가 생성한 URL에는 이 값이 없다. 이 값이 없으면 refresh token이 발급되지 않는다.

### 2-5. Client ID·Secret 보관

1. **Settings** → **Authentication details**로 이동한다.
2. Client ID·Secret을 각각 복사 아이콘으로 복사해 연동 시스템의 비밀 저장소에 보관한다.

Secret은 화면에서 점으로 가려져 있다. 옆의 회전 아이콘은 **Secret 재발급** 기능이다.
Secret이 노출되면 바로 재발급하고 연동 시스템에 저장된 값도 바꾼다.

![Client ID 와 Secret](img/14-client-id-secret.jpg)

- **Client ID**: 동의 URL과 토큰 요청에 사용한다. 비밀값은 아니다.
- **Secret**: 토큰 요청(3-2·4-3)에만 사용하는 비밀값이다. 브라우저·앱 화면·로그·URL에 넣지 않는다.

## 3. 동의하고 토큰 받기

이 장에서는 사용자가 동의한 뒤 연동 서버에서 토큰을 발급받고 연결을 확인하는 순서를 안내한다.

토큰을 받는 흐름은 다음과 같다.

![토큰 받는 흐름](img/16-token-flow.png)

그림의 ①~③은 **처음 한 번** 또는 동의를 다시 받을 때만 수행한다. 이후에는 ④·⑤만 반복한다.

### 3-1. 동의 (토큰 주인이 될 사용자)

1. 2-4에서 확인한 Marketplace App URL을 준비한다.
2. `state=${YOUR_USER_BOUND_VALUE}`를 매번 새로 만든 임의 문자열로 바꾼다. `state`는 요청 위조를 막기 위한 확인값이다. 그림의 ②에서 같은 값이 돌아오는지 확인한다.
3. 사용자 개입 없이 실행할 연동이면 `scope=` 끝에 `%20offline_access`를 추가한다.

완성된 URL 예는 다음과 같다. 줄바꿈은 읽기 편하도록 넣었다.

```
https://auth.atlassian.com/authorize
  ?audience=api.atlassian.com
  &client_id={Client ID}
  &scope=read%3Aorganization%3Acustom%20read%3Aforge-app%3Ajira%20offline_access
  &redirect_uri={Callback URL, URL 인코딩}
  &state={임의 문자열}
  &response_type=code
  &prompt=consent
  &sns={appId}.{envId}
```

4. 토큰 주인이 될 사용자가 완성된 URL을 브라우저에서 연다.
5. 동의 화면에서 **사이트를 선택한다**. 아래 권한 두 줄을 확인한 뒤 **Accept**를 선택한다.

![동의 화면](img/12-consent.jpg)

- "In Jira … View Forge app" — Workforce 앱 데이터 읽기
- "In Moves … Read organization teams and users" — 설명에 "인증된 사용자의 기존 워크포스 팀·사용자 관리 권한 안에서"라고 적혀 있다.

**"In Moves" 줄이 없으면 잘못된 URL이다**(아래 화면). **Cancel**을 선택한 뒤 2-4의 Marketplace App URL로 다시 연다.

![sns 가 빠진 동의 화면](img/13-consent-without-sns.jpg)

토큰 주인은 다음 기준으로 선택한다.

- API 결과는 **토큰 주인의 Workforce 권한**으로 정해진다. 사용자 API를 호출하려면 Workforce 권한 세트에 **인력 관리 Read**가 있어야 한다. 팀 API를 호출하려면 **팀 관리 Read 또는 인력 관리 Read**가 있어야 한다. 기본 제공 권한 세트 중에는 Admin만 두 권한이 모두 있다.
- 개인 계정을 사용하면 퇴사·권한 변경 때 연동이 멈춘다. 연동 전용 계정에 필요한 권한만 부여하는 것을 권장한다.
- 동의를 취소하려면 해당 사용자의 Atlassian 계정 설정 → **연결된 앱**에서 제거한다.

### 3-2. 인증 코드(`code`)를 토큰으로 교환하기 (연동 서버)

사용자가 **Accept**를 선택하면 브라우저가 `{Callback URL}?state=…&code=…`로 이동한다. 연동 서버는 다음 순서로 처리한다.

1. `state`가 3-1에서 만든 값과 같은지 확인한다.
2. `code`를 **바로** 토큰으로 교환한다. `code`는 한 번만 사용할 수 있고 금방 만료된다.

![Callback 도착](img/15-callback.jpg)

```bash
curl -s -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "{Client ID}",
    "client_secret": "{Secret}",
    "code": "{받은 code}",
    "redirect_uri": "{Callback URL — 동의 URL 과 글자까지 같게}"
  }'
```

응답 예는 다음과 같다. 값은 가렸다.

```json
{
  "access_token": "eyJ…",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "eyJ…",
  "scope": "{appId}.{envId}:read:organization:custom offline_access read:forge-app:jira"
}
```

3. 응답의 **`scope`에 `{appId}.{envId}:read:organization:custom`이 있는지 확인한다.** 없으면 `sns`가 빠진 URL로 동의한 것이다. 이 토큰으로 호출하면 4-4의 403이 발생한다.
4. `refresh_token`이 있는지 확인한다. 없으면 동의 URL에 `offline_access`를 넣지 않은 것이다.
5. `access_token`(API 호출에 쓰는 액세스 토큰)과 `refresh_token`을 연동 서버의 비밀 저장소에 저장한다. 로그·URL에는 넣지 않는다.

### 3-3. 연결 확인

다음 명령으로 사용자 API를 호출한다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Authorization: Bearer {access_token}' \
  '{기본 URL}/v1/organization/users'
```

응답 상태 코드가 `200`이면 연결이 완료된 것이다. `401`·`403`이면 4-4의 오류 표를 확인한다.

PowerShell에서는 다음 명령을 사용한다.

```powershell
$h = @{ Authorization = "Bearer $env:WF_ACCESS_TOKEN"; Accept = 'application/json' }
Invoke-RestMethod -Uri "$env:WF_BASE_URL/v1/organization/users?offset=0" -Headers $h
```

## 4. API 호출

이 장에서는 사용자·팀 API의 요청과 응답, 토큰 갱신, 오류 처리, 응답 시간을 확인한다.

### 4-1. 사용자 API

```http
GET {기본 URL}/v1/organization/users?offset=0
Authorization: Bearer {access_token}
Accept: application/json
```

| 쿼리 매개변수(query) | 설명 |
|---|---|
| (없음) 또는 `offset` | 목록 조회. 0, 20, 40 … 9980(20의 배수) |
| `accountId` | 1명 조회. `offset`과 함께 사용할 수 없음 |

목록 조회 응답 예는 다음과 같다.

```json
{
  "success": true,
  "content": {
    "users": [
      { "accountId": "712020:…", "displayName": "홍길동", "active": true,
        "team": { "teamKey": "team-…", "teamName": "A-2", "isLeader": true } },
      { "accountId": "619ae7…", "displayName": "김영희", "active": true, "team": null }
    ],
    "source": "WORKFORCE_API",
    "page": { "offset": 0, "size": 20, "nextOffset": null, "total": 5 },
    "limits": { "usersPerPage": 20, "maxOffset": 9980 }
  }
}
```

- `nextOffset`이 `null`이면 마지막 페이지다.
- `active`는 Jira 계정의 활성 여부다.
- `team`은 소속 팀 정보다. 소속 팀이 없으면 `null`이다.
- 이메일·급여 범위·권한 세트·직무 역할·등급은 **응답에 없다**.

### 4-2. 팀 API

```http
GET {기본 URL}/v1/organization/teams?offset=0
```

| 쿼리 매개변수 | 설명 |
|---|---|
| (없음) 또는 `offset` | 목록 조회. 0, 10, 20 … 990(10의 배수). 다른 쿼리 매개변수는 400 |

응답 예는 다음과 같다.

```json
{
  "success": true,
  "content": {
    "teams": [
      { "teamKey": "team-ed7e…", "teamName": "A팀", "parentTeamKey": null,
        "leaderAccountId": "712020:…", "leaderName": "이철수", "memberCount": 1,
        "members": [ { "accountId": "712020:…", "displayName": "이철수", "isLeader": true } ],
        "membersTruncated": false },
      { "teamKey": "team-f480…", "teamName": "A-1", "parentTeamKey": "team-ed7e…", "…": "…" }
    ],
    "source": "WORKFORCE_API",
    "page": { "offset": 0, "size": 10, "nextOffset": null, "truncated": false },
    "limits": { "teams": 10, "membersPerTeam": 100, "membersPerPage": 500 }
  }
}
```

- 팀 계층은 `parentTeamKey`로 연결한다. 최상위 팀의 값은 `null`이다.
- 구성원은 팀당 100명, 한 페이지 합계 500명까지 포함한다.
- 한도를 넘으면 해당 팀의 `membersTruncated:true`, 페이지의 `truncated:true`로 표시된다. 전체 명단이 필요하면 **사용자 API로 조회한 결과를 `team.teamKey`로 묶는다**(5-4).

### 4-3. 토큰 갱신

액세스 토큰은 1시간(3600초) 동안 유효하다. 만료되면 refresh token으로 새 토큰을 받는다.

```http
POST https://auth.atlassian.com/oauth/token
Content-Type: application/json

{ "grant_type": "refresh_token", "client_id": "…", "client_secret": "…", "refresh_token": "…" }
```

응답으로 받은 **액세스 토큰과 refresh token을 둘 다 새 값으로 바꿔 저장**한다. 사용한 refresh token은 폐기된다.

- 공식 문서 기준 기본값은 **재사용 허용 구간 10분**, **미사용 90일이면 만료**다[^oauth-jira]. 재사용 허용 구간 안에서는 같은 refresh token을 여러 번 사용해도 도난 감지가 적용되지 않는다. 이는 네트워크 동시성에 대비한 설정이다.
- 실측에서도 회전 직후 이전 refresh token을 한 번 더 사용할 수 있었다. 이 재사용 허용 구간에 의존하는 코드는 만들지 않는다.
- refresh token이 만료되면 3장의 동의 절차부터 다시 진행한다.
- `403 invalid_grant "Unknown or invalid refresh token"`은 refresh token이 만료됐거나 새 refresh token으로 바꿔 저장하지 않은 경우다[^refresh].

### 4-4. 오류

| HTTP | 본문 | 원인 | 조치 |
|---|---|---|---|
| 401 | `{"code":401,"message":"Unauthorized"}` | 토큰 없음·만료·잘못된 토큰 | 4-3에 따라 갱신하거나 다시 동의 |
| 403 | `Missing required scopes … Missing: [read:organization:custom]` | `sns` 없이 동의한 토큰 | 2-4의 Marketplace App URL로 다시 동의 |
| 403 | `{"success":false,"error":{"code":"PERMISSION_DENIED"}}` | 토큰 주인에게 Workforce 인력·팀 관리 Read 권한 없음 | Workforce 권한 관리에서 권한 부여 또는 토큰 주인 변경 |
| 403 | `LICENSE_…` | Workforce 라이선스 없음·만료 | 라이선스 확인 |
| 400 | `API_INVALID_QUERY` | 잘못된 `offset` 배수, 알 수 없는 쿼리 매개변수, `offset`·`accountId` 동시 사용 | 요청 수정. `offset`은 사용자 20·팀 10의 배수 |
| 404 | `USER_NOT_FOUND` | Workforce에 없는 `accountId` | — |
| 404 | `No matching API route found …` | 경로·메서드 오류(GET만 지원) | 경로 확인 |
| 503 | `API_READ_FAILED` | 일시 장애 | 잠시 후 재시도 |

### 4-5. 응답 시간

앱이 유휴 상태일 때의 첫 호출은 9~11초, 이후 호출은 약 2초가 걸렸다(2026-10-20 개발 사이트).
연동 시스템의 타임아웃은 **15초 이상**으로 설정한다.

## 5. 연동 개발 가이드 (개발자)

이 장에서는 운영에 필요한 토큰 관리·오류 처리·전체 동기화·보안·테스트 방법을 안내한다.

4장은 개별 API를 호출하는 방법을 설명한다. 이 장은 연동을 안정적으로 운영하기 위한 구현 방법을 다룬다.
아래 내용을 그대로 구현한 예제가 `examples/`에 있다.

### 5-1. 구성 요소

```
[비밀 저장소]  Client ID · Secret · refresh token · access token(+만료 시각)
      │
[토큰 관리자]  만료 1분 전 갱신 → 응답의 access·refresh 를 한 번에 저장(회전)
      │         동시에 여러 요청이 갱신하지 않게 한 번만(single-flight / 잠금)
[API 클라이언트] 기본 URL + 경로, 타임아웃 15초, 오류별 재시도(5-3)
      │
[동기화 작업]  사용자·팀 전체 페이지 순회(5-4) → 내 시스템에 반영
```

single-flight는 동시에 들어온 갱신 요청을 하나로 합쳐 처리하는 방식이다.

### 5-2. 설정값

| 이름 | 확인 위치 | 비밀 여부 |
|---|---|---|
| `WF_BASE_URL` | 1장 관리 화면의 **기본 URL**(사이트형). 또는 `https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}` | 아니오 |
| `cloudId`(svc형 사용 시) | `https://{사이트}.atlassian.net/_edge/tenant_info`의 `cloudId`[^acc] | 아니오 |
| `WF_CLIENT_ID` | 2-5의 **Settings** 화면 | 아니오 |
| `WF_CLIENT_SECRET` | 2-5의 **Settings** 화면 | **예** |
| `redirect_uri` | 2-4에 등록한 Callback URL | 아니오 |
| refresh token·액세스 토큰 | 3-2의 응답. 이후 갱신할 때마다 새 값 사용 | **예** |

- `cloudId` 확인에 토큰의 `accessible-resources`를 사용할 수 없다. 이 API에서는 빈 목록이 반환됐다(실측).
- `WF_CLIENT_SECRET`은 비밀 저장소에만 보관한다.
- `redirect_uri`는 동의 URL과 토큰 요청에서 **글자까지 같아야 한다**.

### 5-3. 오류별 처리 방법

| 응답 | 재시도 | 코드에서 처리할 일 |
|---|---|---|
| 401 `Unauthorized` | 토큰 갱신 후 **1번만** | 계속 401이면 재동의가 필요하다고 알림 |
| 403 `Missing required scopes` | 안 함 | `sns` 없이 동의한 설정 문제. 2-4의 URL로 다시 동의 |
| 403 `PERMISSION_DENIED` · `LICENSE_…` | 안 함 | Workforce 권한·라이선스 조치가 필요하다고 담당자에게 알림 |
| 400 `API_INVALID_QUERY` | 안 함 | 코드 버그 수정. `offset`은 사용자 20·팀 10의 배수 |
| 404 `USER_NOT_FOUND` | 안 함 | 해당 사용자가 Workforce에 없는 정상 결과로 처리 |
| 404 `No matching API route found` | 안 함 | 경로·메서드 오류 수정(GET만 지원) |
| 429 | **`X-Ratelimit-Reset`까지 기다린 뒤** 재시도 | 호출 한도 준수. 동기화는 순차 호출로 충분 |
| 5xx(`503 API_READ_FAILED`)·타임아웃·네트워크 오류 | 지수 백오프(2·4초…)로 **최대 3번** | 계속 실패하면 다음 주기로 미룸 |
| 토큰 갱신 `invalid_grant` | 안 함 | refresh token 만료(미사용 90일) 또는 회전된 토큰 저장 누락. 다시 동의 |

- `X-Ratelimit-Reset`은 epoch(기준 시점부터 경과한 시간)의 초 단위 값이다.
- 호출 한도는 설치당 분당 7,000·초당 300, 사용자당 분당 1,200이다[^lim].
- 지수 백오프는 재시도할 때마다 대기 시간을 늘리는 방식이다.
- 타임아웃은 **15초 이상**으로 설정한다. 앱이 유휴 상태일 때의 첫 호출은 10초를 넘었다(4-5).
- 응답 본문의 `success`가 `true`인지 확인한다. 데이터는 `content` 아래에 있다.

### 5-4. 전체 동기화 — 페이지 순회

```
offset = 0
반복:
  page = GET /v1/organization/users?offset={offset}
  page.content.users 를 처리
  offset = page.content.page.nextOffset   # null 이면 끝
```

- **사용자**: 페이지당 20명, `offset` 최대 9,980(= 10,000명). 이보다 인원이 많은 조직은 문의한다.
- **팀**: 페이지당 10팀, `offset` 최대 990. 구성원 목록이 잘리면(`truncated`) 사용자 API 결과를 `team.teamKey`로 묶어 명단을 만든다.
- **1명 갱신**: `?accountId={id}`로 조회한다. 결과는 1건이며, 해당 사용자가 없으면 404다.
- **동기화 주기**: 조직 정보는 자주 바뀌지 않는다. 하루 1~수 회 전체 동기화하고 필요할 때 1명을 조회하는 방식을 권장한다. 5분마다 전체를 순회하는 식으로 자주 실행하지 않는다.
- **삭제 반영**: 이번 결과에 없는 사용자·팀은 연동 시스템에서 비활성 처리한다. 응답에는 삭제 이벤트가 없다.
- **계정 비활성 상태**: `active:false`는 Jira 계정이 비활성 상태라는 뜻이다.

### 5-5. 토큰 저장 — 꼭 지킬 것

1. 갱신 응답의 **액세스 토큰과 refresh token을 둘 다 한 번에** 저장한다. 임시 파일·트랜잭션을 사용한 뒤 교체한다. refresh token만 이전 값으로 남으면 다음 갱신이 실패한다.
2. 여러 인스턴스·스레드가 동시에 갱신하지 않도록 한 곳에서만 갱신하거나 잠금을 사용한다. Atlassian은 같은 refresh token의 재사용을 10분까지 허용하지만[^oauth-jira], 이 구간에 의존하지 않는다.
3. 저장 형식 예: `{ "access_token": "…", "refresh_token": "…", "expires_at": 1792479600 }`. 만료 시각은 초 단위이며, 두 예제 모두 같은 형식을 사용한다.
4. 90일 넘게 사용하지 않으면 refresh token이 만료된다. 주기 작업이 멈춰 있었다면 재동의 안내를 표시한다.
5. 토큰·Secret을 로그·오류 메시지·URL에 넣지 않는다.

### 5-6. 예제 코드

**Node.js** — [`examples/workforce-client.mjs`](examples/workforce-client.mjs)

```bash
export WF_CLIENT_ID=… WF_CLIENT_SECRET=… WF_BASE_URL='https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}'
export WF_TOKEN_FILE=./wf-token.json   # 3-2 에서 받은 토큰을 위 저장 형식으로
node workforce-client.mjs users        # 전체 사용자
node workforce-client.mjs teams        # 전체 팀
node workforce-client.mjs user <accountId>
```

다른 코드에서 사용하는 예는 다음과 같다.

```js
import { allUsers, call } from './workforce-client.mjs';
for await (const user of allUsers()) {
  await upsertEmployee({ id: user.accountId, name: user.displayName, active: user.active, team: user.team?.teamKey ?? null });
}
```

**Python** — [`examples/workforce_client.py`](examples/workforce_client.py)

```python
from workforce_client import all_users, call, ApiError
for user in all_users():
    upsert_employee(user["accountId"], user["displayName"], user["active"], (user.get("team") or {}).get("teamKey"))
```

두 예제 모두 2026-10-20 개발 사이트에서 실행해 확인했다.
만료된 토큰의 자동 갱신, 사용자 5명·팀 3개 순회, 없는 사용자 조회 시 404 오류를 확인했다.

### 5-7. 응답 필드

**사용자** `content.users[]`

| 필드 | 형식 | 설명 |
|---|---|---|
| `accountId` | 문자열 | Atlassian 계정 ID. 사용자의 고유 키 |
| `displayName` | 문자열·null | 표시 이름 |
| `active` | 참·거짓·null | Jira 계정 활성 여부 |
| `team` | 객체·null | 소속 팀 `{teamKey, teamName, isLeader}`. 없으면 null |

**팀** `content.teams[]`

| 필드 | 형식 | 설명 |
|---|---|---|
| `teamKey` | 문자열 | 팀 고유 키 |
| `teamName` | 문자열 | 팀 이름 |
| `parentTeamKey` | 문자열·null | 상위 팀. 최상위면 null |
| `leaderAccountId` · `leaderName` | 문자열·null | 팀장 |
| `memberCount` | 숫자 | 구성원 수. 목록이 잘려도 전체 수 표시 |
| `members[]` | 배열 | `{accountId, displayName, isLeader}` |
| `membersTruncated` | 참·거짓 | 구성원 목록이 잘렸는지 여부 |

공통 필드는 다음과 같다.

- `content.page`: `offset`·`size`·`nextOffset`·`total`/`truncated`
- `content.limits`: 한도
- `content.source`: `WORKFORCE_API`

**응답에 없는 정보**는 이메일·급여·권한 세트·직무 역할·등급이다. 개인정보·민감정보는 포함하지 않는다.
앞으로 필드는 **추가만** 할 수 있으므로, 알 수 없는 필드는 무시하도록 구현한다.

### 5-8. 보안 체크리스트

- [ ] Secret·토큰은 비밀 저장소에만 보관한다(소스 저장소·설정 파일·로그 금지).
- [ ] 동의 URL의 `state`는 매번 새 임의값을 사용하고, Callback에서 같은 값이 돌아왔는지 확인한다.
- [ ] 토큰 주인은 **연동 전용 계정**으로 정하고, Workforce 권한은 필요한 Read만 부여한다(인력 관리·팀 관리).
- [ ] OAuth 앱은 Resource-level로 설정한다. 3LO 앱의 scope는 `read:organization:custom` + `read:forge-app:jira`만 부여한다(`write:` 금지).
- [ ] Secret이 노출되면 2-5의 화면에서 바로 재발급한다.
- [ ] 연동을 종료하면 토큰 주인의 계정 설정 > 연결된 앱에서 동의를 철회한다. 필요하면 1장의 절차에 따라 앱 REST API를 끈다.

### 5-9. 연동 테스트 체크리스트 (운영 전에 고객 사이트에서)

| 단계 | 할 일 | 기대 결과 |
|---|---|---|
| 1 | 토큰 없이 호출 | 401 |
| 2 | 정상 토큰으로 사용자 첫 페이지 조회 | 200. Workforce 인력 관리 화면과 인원·팀 일치 |
| 3 | 전체 페이지 순회 | `nextOffset:null`에서 종료. 총원 = `total` |
| 4 | 만료 시각을 지난 토큰으로 호출 | 자동 갱신 → 200. 저장소의 액세스 토큰·refresh token 모두 변경 |
| 5 | Workforce 권한이 없는 계정의 토큰으로 호출 | 403 `PERMISSION_DENIED` |
| 6 | 1장에서 앱 REST API 끄기 → 호출 | 거부 확인 후 다시 켜기 |
| 7 | 첫 호출 지연 확인 | 15초 안 |

### 5-10. 변경 정책

- 경로에 버전(`/v1/`)이 있다. 호환성이 깨지는 변경은 새 버전 경로로 제공한다. `v1`에는 필드 **추가만** 한다.
- 이 기능은 Atlassian **Preview**(미리 보기 단계)다. Atlassian 측 변경이 생기면 이 문서로 알린다. 폐기 예고 기간은 짧을 수 있다[^ov].
- 지원 범위는 Jira Cloud 사이트이며, Isolated Cloud는 제외한다[^ar].

## 출처

이 장에서는 가이드의 근거가 되는 공식 문서와 실측 내용을 구분해 확인한다.

이 가이드의 절차는 아래 Atlassian 공식 문서를 따른다.
화면·응답·시간은 2026-10-20 개발 사이트에서 실측했다. 공식 문서에 없는 내용은 따로 표시했다.

| 내용 | 출처 |
|---|---|
| 앱 REST API 개요(Preview, Jira·Confluence만), 기본 URL 두 형식 | [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/) · [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 1장 — 사이트마다 기본으로 꺼짐. 연결된 앱 → 앱 세부 정보 → App REST APIs에서 켜기·끄기. 끄면 즉시 차단 | [Access REST APIs exposed by a Forge app — Step 1](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 2장 — 3LO 앱 만들기, Add Marketplace or custom app, 필요한 scope만 추가, `read:forge-app:jira` 추가, Callback URL, 콘솔의 동의 URL 사용 | [Access REST APIs exposed by a Forge app — Step 2](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 2-4·3장 — **`sns={appId}.{envId}`** 매개변수 | **공식 문서 설명 없음.** Developer Console의 Authorization URL generator("Marketplace App" URL)에만 표시. 없으면 403이 발생하는 것은 실측(4-4) |
| 3장 — 동의 URL 매개변수(`audience`·`client_id`·`scope`·`redirect_uri`·`state`·`response_type=code`·`prompt=consent`), 추측 불가능한 `state`, `code` → 토큰 교환 | [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) |
| 2-4·4-3 — `offline_access`로 refresh token 받기, 회전·재사용 10분·미사용 90일, `invalid_grant` | [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) · [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/) |
| 개발사 측 — `apiRoute` 모듈, `custom-scopes.yaml`, 환경별 scope 등록 | [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/) · [API route (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) |
| 사이트 감사 로그에 기록 없음, 응답 시간, `accessible-resources` 빈 목록 | 실측(공식 문서 언급 없음) |

[^oauth-jira]: [OAuth 2.0 (3LO) apps — Jira Cloud platform](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) "Reuse interval or leeway" 기본 10분, "Inactivity expiry time" 기본 90일.
[^refresh]: [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/) Troubleshooting.
[^acc]: [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) — 기본 URL 두 형식, `_edge/tenant_info`, 와일드카드 경로.
[^lim]: [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) — 호출 한도·429 처리(2026-09-01 갱신본).
[^ov]: [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/) — Preview, Jira·Confluence, 3LO.
[^ar]: [API route (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) — `application/json` 만, Isolated Cloud 불가.

## 자주 묻는 것

이 장에서는 API 접근 범위와 연동 중지 방법에 관한 질문을 확인한다.

- **API를 켜면 누구나 우리 조직 정보를 읽을 수 있나?** 아니다. 사이트 사용자 본인이 동의한 토큰이 있어야 한다. API는 그 사용자가 Workforce 화면에서 볼 수 있는 범위만 반환한다. 토큰 없이 호출하면 401이다.
- **다른 사이트 정보까지 나가나?** Resource-level 앱이면 동의할 때 고른 사이트 하나만 접근한다.
- **연동을 멈추려면?** 전체 외부 호출을 막으려면 1장의 **앱 REST API 사용 중지**를 선택한다. 해당 연동만 멈추려면 토큰 주인의 동의를 취소한다.
