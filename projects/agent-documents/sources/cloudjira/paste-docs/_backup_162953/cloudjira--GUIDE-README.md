# Moves Workforce 외부 조회 API 연결 가이드 및 설정 방법

> 대상: 고객 사이트 관리자(1장), 연동 담당자(2·3장), **연동을 개발하는 개발자(4·5장)**
> 기준: 2026-10-20, 개발 사이트 실측 화면·응답. 화면 문구는 Atlassian 이 바꿀 수 있다.
> 바로 쓸 수 있는 예제 코드: [`examples/workforce-client.mjs`](examples/workforce-client.mjs)(Node.js 18+) · [`examples/workforce_client.py`](examples/workforce_client.py)(Python 3.9+) — 둘 다 개발 사이트에서 실행 확인.

Moves Workforce 는 팀·사용자 조직 정보를 외부 시스템이 읽을 수 있도록 REST API 를 연다.
외부 시스템은 **사용자 본인의 동의(OAuth 2.0 3LO)** 로 받은 토큰으로 호출하고, API 는 **그 사용자가 워크포스에서 볼 수 있는 범위만** 돌려준다. 토큰만으로 권한이 늘어나지 않는다.

| API | 설명 |
|---|---|
| `GET /v1/organization/users` | 사용자 목록(20명 단위) 또는 1명 — 이름·활성 여부·소속 팀·팀장 여부 |
| `GET /v1/organization/teams` | 팀 목록(10팀 단위) — 상위 팀·팀장·구성원 |

둘 다 같은 권한 하나(`read:organization:custom`, 화면 이름 "Read organization teams and users")로 호출한다.

## 전체 순서

| 단계 | 누가 | 어디서 | 한 번만? |
|---|---|---|---|
| 1. 앱 REST API 켜기 | 사이트 관리자 | admin.atlassian.com | 사이트당 한 번 |
| 2. OAuth 앱 만들기·권한 연결 | 연동 담당자 | developer.atlassian.com | 연동 시스템당 한 번 |
| 3. 동의 → code 를 토큰으로 교환 | 토큰 주인이 될 사용자 → 연동 서버 | 동의 화면 → `auth.atlassian.com/oauth/token` | 처음 한 번(취소 전까지) |
| 4. 호출·토큰 갱신 | 연동 서버 | 기본 URL | 계속(토큰은 1시간마다 갱신) |

---

## 1. 앱 REST API 켜기 (사이트 관리자)

Atlassian 은 앱의 REST API 를 사이트마다 기본으로 꺼 둔다. 사이트 관리자가 켜야 외부 호출을 받는다.

1. [admin.atlassian.com](https://admin.atlassian.com) → 조직 선택 → **앱** → **사이트** → 해당 사이트 → **연결된 앱**.
2. "Workforce" 로 검색해 **Moves Workforce for Jira** 를 펼치고 **앱 세부 정보 보기**.

   ![연결된 앱 목록](img/01-connected-apps.jpg)

   ![앱 세부 정보](img/02-app-details.jpg)

3. 아래쪽 **앱 REST API** 항목이 "사용 중지" 상태다. **앱 REST API 사용으로 설정** → 확인 창에서 확인.

   ![앱 REST API 사용 중지 상태](img/03-app-rest-api-off.jpg)

   ![확인 창](img/04-app-rest-api-confirm.jpg)

4. "사용" 배지와 **기본 URL** 이 나오면 끝. 이 URL 을 연동 담당자에게 전달한다.

   ![앱 REST API 사용 상태와 기본 URL](img/05-app-rest-api-on.jpg)

- 기본 URL 형식: `https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}`
- 같은 API 를 `https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}` 로도 부를 수 있다.
- 끄려면 같은 자리의 **앱 REST API 사용 중지**. 끄면 모든 외부 호출이 막힌다.
- 참고: 이 설정 변경은 사이트 감사 로그에 남지 않았다(2026-10-20 확인). 누가 켰는지는 내부 기록으로 남겨 두는 것이 좋다.

## 2. OAuth 앱 만들기·권한 연결 (연동 담당자)

외부 시스템이 토큰을 받으려면 Atlassian 에 등록된 "OAuth 2.0 앱"이 필요하다.

### 2-1. 앱 만들기

[Developer Console](https://developer.atlassian.com/console/myapps/) → **Create** → **OAuth 2.0 integration**.
이름을 넣고 접근 유형은 **Resource-level**(동의할 때 고른 사이트 하나만)을 권장한다. 약관에 동의하고 Create.

![OAuth 앱 만들기](img/06-create-oauth-app.jpg)

> 화면 위 안내대로 **refresh token 회전이 강제**된다. 갱신할 때마다 refresh token 도 새 값이 오므로 매번 바꿔 저장해야 한다(4-3 참고).

### 2-2. 워크포스 권한 연결

**Permissions** → **Add Marketplace or custom app** → 사이트 선택 → 앱 **Moves Workforce for Jira** → scope **`read:organization:custom`** → Add.

![워크포스 권한 선택](img/07-add-workforce-scope.jpg)

추가 직후 기본 URL 이 한 번 나온다(제품을 **jira** 로 바꿔서 확인). 닫으면 다시 보여 주지 않지만 1단계의 기본 URL 과 같다.

![추가 완료와 기본 URL](img/08-base-url.jpg)

### 2-3. Jira 권한 추가

같은 Permissions 화면 → **Jira API** → Add → Configure → **Granular scopes** → `forge-app` 검색 → **`read:forge-app:jira`** 만 체크 → Save.
바로 아래 `write:forge-app:jira` 는 **체크하지 않는다**.

![read:forge-app:jira](img/09-jira-forge-app-scope.jpg)

권한 요약에 Jira API 1개, Moves Workforce for Jira 1개가 보이면 된다.

![권한 요약](img/10-permissions-summary.jpg)

### 2-4. Callback URL·동의 URL

**Authorization** → OAuth 2.0 (3LO) **Add** → 연동 시스템의 Callback URL 저장.
저장하면 아래 **Authorization URL generator** 에 동의 URL 이 나온다. **반드시 "Marketplace App: Moves Workforce for Jira" 아래의 URL 을 쓴다** — 끝에 `sns={appId}.{envId}` 가 붙어 있다.

![Callback URL 과 동의 URL](img/11-callback-auth-url.jpg)

> ⚠️ 위쪽 "Granular Jira API authorization URL" 이나 직접 만든 URL 에 `sns` 가 없으면, 동의는 성공해도 워크포스 권한이 빠진 토큰이 나온다(4-4 의 403).
> 사람 없이 주기적으로 호출하려면 URL 의 `scope` 에 **`offline_access`** 를 직접 추가한다(generator URL 에는 없다). 없으면 refresh token 이 발급되지 않는다.

### 2-5. Client ID·Secret 보관

**Settings** → **Authentication details** 의 Client ID·Secret 을 복사 아이콘으로 복사해 연동 시스템의 비밀 저장소에 둔다.
Secret 은 화면에 가려져 있고(점), 옆의 회전 아이콘이 **재발급**이다. 노출되면 바로 재발급하고 연동 시스템 값을 바꾼다.

![Client ID 와 Secret](img/14-client-id-secret.jpg)

- **Client ID**: 동의 URL 과 토큰 요청에 쓴다. 비밀값은 아니다.
- **Secret**: 토큰 요청(3-2·4-3)에만 쓴다. 브라우저·앱 화면·로그·URL 에 넣지 않는다.

## 3. 동의하고 토큰 받기

토큰은 이렇게 흐른다.

![토큰 받는 흐름](img/16-token-flow.png)

①~③ 은 **처음 한 번**(또는 동의를 다시 받을 때)만 한다. 그 뒤로는 ④·⑤ 만 반복한다.

### 3-1. 동의 (토큰 주인이 될 사용자)

2-4 의 Marketplace App URL 에서 두 군데를 바꾼다.
- `state=${YOUR_USER_BOUND_VALUE}` → 매번 새로 만든 임의 문자열(②에서 같은 값이 돌아오는지 확인해 위조 요청을 막는다)
- 사람 없이 돌릴 연동이면 `scope=` 끝에 `%20offline_access` 추가

완성된 URL 예(줄바꿈은 읽기용):

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

이 URL 을 토큰 주인이 될 사용자가 브라우저로 연다. 아래 화면이 나온다. **사이트를 고르고** 권한 두 줄을 확인한 뒤 **Accept**.

![동의 화면](img/12-consent.jpg)

- "In Jira … View Forge app" — 워크포스 앱 데이터 읽기
- "In Moves … Read organization teams and users" — 설명에 "인증된 사용자의 기존 워크포스 팀·사용자 관리 권한 안에서" 라고 적혀 있다

**"In Moves" 줄이 없으면 잘못된 URL 이다**(아래 화면). Cancel 하고 2-4 의 Marketplace App URL 로 다시 연다.

![sns 가 빠진 동의 화면](img/13-consent-without-sns.jpg)

토큰 주인 고르기:
- API 결과는 **토큰 주인의 워크포스 권한**으로 정해진다. 워크포스 권한 세트에서 사용자 API 는 **인력 관리 Read**, 팀 API 는 **팀 관리 Read 또는 인력 관리 Read** 가 있는 사람이어야 한다(시드 세트 중 Admin 만 둘 다 있다).
- 개인 계정을 쓰면 퇴사·권한 변경 때 연동이 멈춘다. 연동 전용 계정에 필요한 권한만 주는 것을 권장한다.
- 동의 취소: 해당 사용자의 Atlassian 계정 설정 → 연결된 앱에서 제거.

### 3-2. code 를 토큰으로 바꾸기 (연동 서버)

Accept 하면 브라우저가 `{Callback URL}?state=…&code=…` 로 이동한다. 연동 서버는
1. `state` 가 ①에서 만든 값과 같은지 확인하고
2. `code` 를 **바로** 토큰으로 바꾼다(code 는 한 번만 쓸 수 있고 금방 만료된다).

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

응답(값은 가림):

```json
{
  "access_token": "eyJ…",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "eyJ…",
  "scope": "{appId}.{envId}:read:organization:custom offline_access read:forge-app:jira"
}
```

**`scope` 에 `{appId}.{envId}:read:organization:custom` 이 있어야 한다.** 없으면 `sns` 가 빠진 동의다 — 4-4 의 403 이 난다. `refresh_token` 이 없으면 `offline_access` 를 빼먹은 것이다.

`access_token`·`refresh_token` 을 연동 서버의 비밀 저장소에 저장한다(로그·URL 금지).

### 3-3. 한 줄 확인

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Authorization: Bearer {access_token}' \
  '{기본 URL}/v1/organization/users'
```

`200` 이면 연결 완료. `401`·`403` 이면 4-4 표를 본다.

PowerShell 은 이렇게 한다.

```powershell
$h = @{ Authorization = "Bearer $env:WF_ACCESS_TOKEN"; Accept = 'application/json' }
Invoke-RestMethod -Uri "$env:WF_BASE_URL/v1/organization/users?offset=0" -Headers $h
```

## 4. 호출

### 4-1. 사용자 API

```http
GET {기본 URL}/v1/organization/users?offset=0
Authorization: Bearer {access_token}
Accept: application/json
```

| query | 뜻 |
|---|---|
| (없음) 또는 `offset` | 목록. 0, 20, 40 … 9980 (20의 배수) |
| `accountId` | 1명 조회. `offset` 과 같이 쓸 수 없다 |

응답 예(목록):

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

- `nextOffset` 이 `null` 이면 마지막 페이지다.
- `active` 는 Jira 계정 활성 여부, `team` 은 소속 팀이 없으면 `null`.
- 이메일·급여 범위·권한 세트·직무 역할·등급은 **응답에 없다**.

### 4-2. 팀 API

```http
GET {기본 URL}/v1/organization/teams?offset=0
```

| query | 뜻 |
|---|---|
| (없음) 또는 `offset` | 0, 10, 20 … 990 (10의 배수). 다른 query 는 400 |

응답 예:

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

- 팀 계층은 `parentTeamKey` 로 이어 붙인다(최상위는 `null`).
- 구성원은 팀당 100명, 한 페이지 합계 500명까지 싣는다. 넘으면 그 팀의 `membersTruncated:true`, 페이지의 `truncated:true` — 전체 명단이 필요하면 **사용자 API 로 받아 `team.teamKey` 로 묶는다**(5-4).

### 4-3. 토큰 갱신

access token 은 1시간(3600초) 유효하다. 만료되면 refresh token 으로 새로 받는다.

```http
POST https://auth.atlassian.com/oauth/token
Content-Type: application/json

{ "grant_type": "refresh_token", "client_id": "…", "client_secret": "…", "refresh_token": "…" }
```

응답의 **access token·refresh token 을 둘 다 새 값으로 바꿔 저장**한다. 쓴 refresh token 은 폐기된다.
- 공식 문서 기준 기본값: **재사용 허용 구간 10분**(그 안에서는 같은 refresh token 을 여러 번 써도 도난 감지가 적용되지 않음 — 네트워크 동시성 대비), **미사용 90일이면 만료**(만료되면 3장 동의부터 다시)[^oauth-jira]. 실측에서도 회전 직후 옛 refresh token 이 한 번 더 통과했다. 이 구간에 기대는 코드는 만들지 않는다.
- `403 invalid_grant "Unknown or invalid refresh token"` 은 만료됐거나 새 refresh token 으로 바꿔 저장하지 않은 경우다[^refresh].

### 4-4. 오류

| HTTP | 본문 | 원인 | 조치 |
|---|---|---|---|
| 401 | `{"code":401,"message":"Unauthorized"}` | 토큰 없음·만료·잘못된 토큰 | 4-3 갱신 또는 다시 동의 |
| 403 | `Missing required scopes … Missing: [read:organization:custom]` | `sns` 없이 동의한 토큰 | 2-4 의 Marketplace App URL 로 다시 동의 |
| 403 | `{"success":false,"error":{"code":"PERMISSION_DENIED"}}` | 토큰 주인에게 워크포스 인력·팀 관리 Read 가 없음 | 워크포스 권한 관리에서 권한 부여 또는 토큰 주인 변경 |
| 403 | `LICENSE_…` | 워크포스 라이선스 없음·만료 | 라이선스 확인 |
| 400 | `API_INVALID_QUERY` | offset 이 20(팀은 10)의 배수가 아님, 모르는 query, offset+accountId 동시 | 요청 수정 |
| 404 | `USER_NOT_FOUND` | 워크포스에 없는 accountId | — |
| 404 | `No matching API route found …` | 경로·메서드 오류(GET 만 지원) | 경로 확인 |
| 503 | `API_READ_FAILED` | 일시 장애 | 잠시 후 재시도 |

### 4-5. 응답 시간

첫 호출(앱이 잠들어 있을 때)은 9~11초, 그 뒤로는 약 2초였다(2026-10-20 개발 사이트). 연동 시스템의 타임아웃은 **15초 이상**으로 둔다.

## 5. 연동 개발 가이드 (개발자)

4장이 "한 번 부르는 법"이라면 이 장은 **운영에서 안 깨지게 만드는 법**이다. 아래 내용을 그대로 구현한 예제가 `examples/` 에 있다.

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

### 5-2. 설정값

| 이름 | 어디서 얻나 | 비밀? |
|---|---|---|
| `WF_BASE_URL` | 1장 관리 화면의 **기본 URL**(사이트형). 또는 `https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}` | 아니오 |
| `cloudId` (svc형을 쓸 때) | `https://{사이트}.atlassian.net/_edge/tenant_info` 의 `cloudId`[^acc] — 토큰의 `accessible-resources` 는 이 API 에서 빈 목록이라 쓰지 못한다(실측) | 아니오 |
| `WF_CLIENT_ID` | 2-5 Settings | 아니오 |
| `WF_CLIENT_SECRET` | 2-5 Settings | **예** — 비밀 저장소에만 |
| `redirect_uri` | 2-4 에 등록한 Callback URL(동의 URL·토큰 요청에서 **글자까지 같게**) | 아니오 |
| refresh token · access token | 3-2 응답, 이후 갱신마다 새 값 | **예** |

### 5-3. 오류별로 어떻게 할까

| 응답 | 재시도? | 코드에서 할 일 |
|---|---|---|
| 401 `Unauthorized` | 토큰 갱신 후 **1번만** | 그래도 401 이면 토큰 문제 — 다시 동의 필요 알림 |
| 403 `Missing required scopes` | 안 함 | 설정 문제(`sns` 없이 동의) — 2-4 URL 로 다시 동의 |
| 403 `PERMISSION_DENIED` · `LICENSE_…` | 안 함 | 사람 조치 필요(워크포스 권한·라이선스) — 담당자 알림 |
| 400 `API_INVALID_QUERY` | 안 함 | 코드 버그 — offset 은 사용자 20·팀 10 의 배수 |
| 404 `USER_NOT_FOUND` | 안 함 | 정상 결과(그 사람은 워크포스에 없음) |
| 404 `No matching API route found` | 안 함 | 경로·메서드 오류(GET 만) |
| 429 | **`X-Ratelimit-Reset`(초 단위 epoch)까지 기다린 뒤** 재시도 | 한도: 설치당 분당 7,000·초당 300, 사용자당 분당 1,200[^lim] — 동기화는 순차 호출로 충분 |
| 5xx(`503 API_READ_FAILED`)·타임아웃·네트워크 | 지수 백오프(2·4초…) **최대 3번** | 계속 실패하면 다음 주기로 미룸 |
| 토큰 갱신 `invalid_grant` | 안 함 | refresh 만료(미사용 90일) 또는 회전값 저장 누락 — 다시 동의 |

- 타임아웃은 **15초 이상**. 첫 호출(콜드)이 10초를 넘었다(4-5).
- 응답 본문의 `success` 가 `true` 인지, 데이터는 `content` 아래에 있음을 확인한다.

### 5-4. 전체 동기화 — 페이지 순회

```
offset = 0
반복:
  page = GET /v1/organization/users?offset={offset}
  page.content.users 를 처리
  offset = page.content.page.nextOffset   # null 이면 끝
```

- 사용자: 페이지당 20명, `offset` 최대 9,980(= 10,000명). 그보다 많은 조직은 문의.
- 팀: 페이지당 10팀, `offset` 최대 990. 구성원이 잘리면(`truncated`) 사용자 API 결과를 `team.teamKey` 로 묶어 명단을 만든다.
- 한 사람만 갱신: `?accountId={id}`(1건, 없으면 404).
- 주기: 조직 정보는 자주 안 바뀐다 — 하루 1~수 회 전체 동기화 + 필요 시 1명 조회를 권장. 5분마다 전체 순회처럼 잦게 돌리지 않는다.
- 삭제 반영: 이번 결과에 없는 사람·팀을 내 시스템에서 비활성 처리(응답에 삭제 이벤트는 없다). `active:false` 는 Jira 계정 비활성.

### 5-5. 토큰 저장 — 꼭 지킬 것

1. 갱신 응답의 **access·refresh 를 둘 다, 한 번에** 저장한다(임시 파일·트랜잭션 후 교체). refresh 만 옛 값으로 남으면 다음 갱신이 실패한다.
2. 여러 인스턴스·스레드가 동시에 갱신하지 않게 한다 — 한 곳에서만 갱신하거나 잠금. (Atlassian 은 같은 refresh token 의 짧은 재사용을 10분까지 봐주지만[^oauth-jira] 거기에 기대지 않는다.)
3. 저장 형식 예: `{ "access_token": "…", "refresh_token": "…", "expires_at": 1792479600 }`(초 단위 — 예제 두 개가 같은 형식).
4. 90일 넘게 안 쓰면 refresh 가 만료된다 — 주기 작업이 멈춰 있었다면 재동의 안내를 띄운다.
5. 토큰·Secret 을 로그·오류 메시지·URL 에 넣지 않는다.

### 5-6. 예제 코드

**Node.js** — [`examples/workforce-client.mjs`](examples/workforce-client.mjs)

```bash
export WF_CLIENT_ID=… WF_CLIENT_SECRET=… WF_BASE_URL='https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}'
export WF_TOKEN_FILE=./wf-token.json   # 3-2 에서 받은 토큰을 위 저장 형식으로
node workforce-client.mjs users        # 전체 사용자
node workforce-client.mjs teams        # 전체 팀
node workforce-client.mjs user <accountId>
```

다른 코드에서 쓰기:

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

두 예제 모두 2026-10-20 개발 사이트에서 실행해 확인했다: 만료된 토큰 → 자동 갱신 → 사용자 5명·팀 3개 순회, 없는 사람 404 오류.

### 5-7. 응답 필드

**사용자** `content.users[]`

| 필드 | 형식 | 뜻 |
|---|---|---|
| `accountId` | 문자열 | Atlassian 계정 id — 사람의 고유 키 |
| `displayName` | 문자열·null | 표시 이름 |
| `active` | 참·거짓·null | Jira 계정 활성 여부 |
| `team` | 객체·null | 소속 팀 `{teamKey, teamName, isLeader}` — 없으면 null |

**팀** `content.teams[]`

| 필드 | 형식 | 뜻 |
|---|---|---|
| `teamKey` | 문자열 | 팀 고유 키 |
| `teamName` | 문자열 | 팀 이름 |
| `parentTeamKey` | 문자열·null | 상위 팀(최상위면 null) |
| `leaderAccountId` · `leaderName` | 문자열·null | 팀장 |
| `memberCount` | 숫자 | 구성원 수(잘려도 전체 수) |
| `members[]` | 배열 | `{accountId, displayName, isLeader}` |
| `membersTruncated` | 참·거짓 | 구성원이 잘렸는가 |

공통 `content.page`(`offset`·`size`·`nextOffset`·`total`/`truncated`), `content.limits`(한도), `content.source`(`WORKFORCE_API`).
**없는 것**: 이메일·급여·권한 세트·직무 역할·등급 — 개인정보·민감정보는 싣지 않는다. 필드는 앞으로 **추가만** 할 수 있으니 모르는 필드는 무시하도록 만든다.

### 5-8. 보안 체크리스트

- [ ] Secret·토큰은 비밀 저장소에만(소스 저장소·설정 파일·로그 금지)
- [ ] 동의 URL 의 `state` 는 매번 새 임의값, Callback 에서 같은지 확인
- [ ] 토큰 주인은 **연동 전용 계정**, 워크포스 권한은 필요한 Read 만(인력 관리·팀 관리)
- [ ] OAuth 앱은 Resource-level, 3LO 앱 scope 는 `read:organization:custom` + `read:forge-app:jira` 만(`write:` 금지)
- [ ] Secret 이 새면 2-5 화면에서 바로 재발급
- [ ] 연동을 끝내면: 토큰 주인 계정 설정 > 연결된 앱에서 동의 철회, 필요하면 1장에서 앱 REST API 끄기

### 5-9. 연동 테스트 체크리스트 (운영 전에 고객 사이트에서)

| # | 할 일 | 기대 |
|---|---|---|
| 1 | 토큰 없이 호출 | 401 |
| 2 | 정상 토큰으로 사용자 첫 페이지 | 200, 워크포스 인력 관리 화면과 인원·팀 일치 |
| 3 | 전체 순회 | `nextOffset:null` 에서 종료, 총원 = `total` |
| 4 | 만료 시각을 지난 토큰으로 호출 | 자동 갱신 → 200, 저장소의 access·refresh 가 둘 다 바뀜 |
| 5 | 워크포스 권한 없는 계정의 토큰 | 403 `PERMISSION_DENIED` |
| 6 | 1장에서 앱 REST API 끄기 → 호출 | 거부 확인 후 다시 켜기 |
| 7 | 첫 호출 지연 | 15초 안 |

### 5-10. 변경 정책

- 경로에 버전(`/v1/`)이 있다. 호환이 깨지는 변경은 새 버전 경로로 내고, `v1` 에는 필드 **추가만** 한다.
- 이 기능은 Atlassian **Preview** 다 — Atlassian 쪽 변경(폐기 예고 기간이 짧을 수 있음)이 생기면 이 문서로 알린다[^ov].
- 지원 범위: Jira Cloud 사이트, Isolated Cloud 제외[^ar].

## 출처

이 가이드의 절차는 아래 Atlassian 공식 문서를 따르고, 화면·응답·시간은 2026-10-20 개발 사이트 실측이다. 공식 문서에 없는 내용은 따로 표시했다.

| 내용 | 출처 |
|---|---|
| 앱 REST API 개요(Preview, Jira·Confluence 만), 기본 URL 두 형식 | [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/) · [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 1장 — 사이트마다 기본 꺼짐, 연결된 앱 → 앱 세부 정보 → App REST APIs 에서 켜기/끄기, 끄면 즉시 차단 | [Access REST APIs exposed by a Forge app — Step 1](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 2장 — 3LO 앱 만들기, Add Marketplace or custom app, 필요한 scope 만, `read:forge-app:jira` 추가, Callback URL, 콘솔이 보여 주는 동의 URL 사용 | [Access REST APIs exposed by a Forge app — Step 2](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) |
| 2-4·3장 — **`sns={appId}.{envId}`** 파라미터 | **공식 문서 설명 없음.** Developer Console 의 Authorization URL generator("Marketplace App" URL)에만 있고, 없으면 403 이 나는 것은 실측(4-4) |
| 3장 — 동의 URL 파라미터(`audience`·`client_id`·`scope`·`redirect_uri`·`state`·`response_type=code`·`prompt=consent`), `state` 는 추측 불가 값, code → 토큰 교환 | [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) |
| 2-4·4-3 — `offline_access` 로 refresh token 받기, 회전·재사용 10분·미사용 90일, `invalid_grant` | [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) · [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/) |
| 개발사 쪽 — `apiRoute` 모듈, `custom-scopes.yaml`, 환경별 scope 등록 | [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/) · [API route (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) |
| 사이트 감사 로그에 기록 없음, 응답 시간, `accessible-resources` 빈 목록 | 실측(공식 문서 언급 없음) |

[^oauth-jira]: [OAuth 2.0 (3LO) apps — Jira Cloud platform](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) "Reuse interval or leeway" 기본 10분, "Inactivity expiry time" 기본 90일.
[^refresh]: [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/) Troubleshooting.
[^acc]: [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) — 기본 URL 두 형식, `_edge/tenant_info`, 와일드카드 경로.
[^lim]: [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/) — 호출 한도·429 처리(2026-09-01 갱신본).
[^ov]: [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/) — Preview, Jira·Confluence, 3LO.
[^ar]: [API route (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) — `application/json` 만, Isolated Cloud 불가.

## 자주 묻는 것

- **API 를 켜면 누구나 우리 조직 정보를 읽을 수 있나?** 아니다. 사이트 사용자 본인이 동의한 토큰이 있어야 하고, 그 사용자가 워크포스 화면에서 볼 수 있는 범위만 나온다. 토큰 없이 부르면 401.
- **다른 사이트 정보까지 나가나?** Resource-level 앱이면 동의 때 고른 사이트 하나만이다.
- **연동을 멈추려면?** 1단계에서 앱 REST API 사용 중지(전체), 또는 토큰 주인의 동의 취소(그 연동만).
