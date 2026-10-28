# Workforce API 연동 예제 (Spring Boot)

Moves Workforce의 조직 정보(사용자·팀·팀장)를 고객 시스템에서 조회하는 Spring Boot 예제다.

- Atlassian OAuth 2.0(3LO)으로 동의를 받는다.
- 받은 토큰은 MySQL에 암호화해 저장한다.
- 토큰이 만료되면 자동으로 갱신한다.
- 고객 코드는 `WorkforceApiService`를 주입받아 사용자·팀을 조회한다.

| 항목 | 버전 |
|---|---|
| Java | 17 이상 |
| Spring Boot | 3.5 (`RestClient`, JPA) |
| DB | MySQL 8 |
| 기타 | Lombok, springdoc(Swagger UI) |

---

## 1. 연동 전에 준비할 것

| # | 할 일 | 누가 | 참고 |
|---|---|---|---|
| 1 | Workforce 관리 화면에서 **외부 API 사용**을 켜고 **기본 URL**을 복사한다 | Jira 사이트 관리자 | 「Moves Workforce API 연결 가이드」 1장 |
| 2 | Atlassian Developer Console에서 **OAuth 2.0 앱**을 만든다 | 연동 담당자 | 가이드 2-1 |
| 3 | 앱 권한에 Workforce 권한(`read:organization:custom`)과 Jira 권한(`read:forge-app:jira`)을 추가한다 | 연동 담당자 | 가이드 2-2·2-3 |
| 4 | **Callback URL**을 등록한다. 이 예제의 기본값은 `http://localhost:8765/callback` | 연동 담당자 | 가이드 2-4 |
| 5 | **Client ID**와 **Secret**을 복사해 비밀 저장소에 보관한다 | 연동 담당자 | 가이드 2-5 |
| 6 | **토큰 주인 계정**을 정하고 Workforce 권한 세트(인력 관리·팀 관리 Read)를 준다. 연동 전용 계정을 권장한다 | Workforce 관리자 | 가이드 3-1 |
| 7 | MySQL DB와 계정을 준비한다 | 고객 인프라 담당 | 이 문서 2장 |

- 「Moves Workforce API 연결 가이드」는 별도로 전달하는 문서다. 화면 캡처와 오류별 조치가 들어 있다.
- 이 예제는 위 준비가 끝난 뒤의 **서버 쪽 처리**(동의 받기, 토큰 저장·갱신, API 호출)를 맡는다.

---

## 2. 설정

값은 `.env` 파일이나 환경변수로 넣는다. `application.yml`에 비밀 값을 직접 쓰지 않는다.

**`.env` 파일.** `.env.example`을 `.env`로 복사하고 값을 채운다. 앱은 실행한 폴더의 `.env`를 읽고, 같은 이름의 OS 환경변수가 있으면 환경변수를 쓴다. `.env`는 `.gitignore`에 들어 있어 git에 올라가지 않는다. 운영 서버에서는 `.env` 대신 비밀 저장소나 OS 환경변수를 쓴다.

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

`.env`는 Java properties 형식으로 읽는다. 값을 쓸 때 아래를 지킨다.

- 따옴표 없이 `이름=값`으로 쓴다. 따옴표를 붙이면 따옴표까지 값이 된다.
- 값 뒤에 `# 주석`을 붙이지 않는다. 주석까지 값이 된다. 주석은 줄 맨 앞에만 쓴다.
- 값에 `\`가 있으면 `\\`로 두 번 쓴다. 한 번만 쓰면 사라지거나 다른 문자로 바뀐다.
- 한글 등 ASCII가 아닌 문자가 든 값(예: 비밀번호)은 `.env`에 쓰지 말고 OS 환경변수로 넣는다.
- base64 키의 `= + /`, URL의 `: ? &`는 그대로 써도 된다.

`docker compose`도 같은 `.env`를 읽는다(`DB_USERNAME`·`DB_PASSWORD`로 로컬 MySQL 계정을 만든다). 그래서 값이 `"`·`'`로 시작하거나 `$`가 들어 있으면 compose가 다르게 읽거나 실패할 수 있다. 그런 값은 OS 환경변수로 넣는다.

**시작할 때 확인하는 것.** 아래가 맞지 않으면 앱이 뜨지 않고 원인을 로그에 남긴다.

- `WF_TOKEN_KEY`가 base64 32바이트인지
- `WF_BASE_URL`에 `/apps/{appId}_{envId}`가 있는지(`WF_SNS`를 넣었으면 건너뜀)
- `WF_REDIRECT_URI`의 경로와 `WF_CALLBACK_PATH`가 같은지, `WF_CALLBACK_PATH`가 비어 있지 않은지

| 환경변수 | 값 | 필수 | 비밀 |
|---|---|---|---|
| `WF_BASE_URL` | 1번에서 복사한 기본 URL. 예: `https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}` | 예 | |
| `WF_CLIENT_ID` | 5번의 Client ID | 예 | |
| `WF_CLIENT_SECRET` | 5번의 Secret | 예 | **예** |
| `WF_TOKEN_KEY` | 토큰 암호화 키. base64 32바이트(아래 명령으로 만든다) | 예 | **예** |
| `WF_REDIRECT_URI` | 4번에 등록한 Callback URL과 **글자까지 같게**. 기본 `http://localhost:8765/callback` | | |
| `WF_CALLBACK_PATH` | 위 URL의 경로. 기본 `/callback` | | |
| `DB_URL` | 기본 `jdbc:mysql://localhost:3307/workforce?serverTimezone=UTC&characterEncoding=UTF-8` | | |
| `DB_USERNAME` · `DB_PASSWORD` | 기본 `workforce` · `workforce` | | 비밀번호 **예** |
| `PORT` · `SERVER_ADDRESS` | 기본 `8765` · `127.0.0.1` | | |
| `SWAGGER_ENABLED` | Swagger UI 사용. 기본 `true`, 운영에서는 `false` | | |
| `SQL_INIT_MODE` | 시작할 때 `schema.sql` 실행. 기본 `always`, 운영에서는 `never` | | |
| `WF_SNS` | 동의 URL의 `sns` 값(`{appId}.{envId}`). 비우면 `WF_BASE_URL`에서 자동으로 만든다 | | |

그 밖의 조정값은 `application.yml`의 `workforce.*`에서 바꾼다.

| 설정 | 기본 | 설명 |
|---|---|---|
| `workforce.api.read-timeout` | `30s` | Workforce 응답 대기. 첫 호출이 10초를 넘을 수 있어 15초 이상으로 둔다 |
| `workforce.api.max-retries` | `3` | 5xx·429·네트워크 오류 재시도 횟수. `0`이면 재시도하지 않는다 |
| `workforce.api.max-rate-limit-wait` | `60s` | 429일 때 기다릴 최대 시간. 서버가 이보다 오래 기다리라고 하면 기다리지 않고 429로 끝낸다 |
| `workforce.api.version` | `/v1` | 모든 API 경로 앞에 붙는 버전 |
| `workforce.oauth.refresh-skew` | `60s` | 만료 이만큼 전부터 미리 갱신한다 |
| `workforce.oauth.state-ttl` | `10m` | 동의 URL 유효 시간 |

**암호화 키 만들기.** 한 번 만든 키는 비밀 저장소에 보관한다. 키를 바꾸면 저장된 토큰을 읽지 못한다. 이때 API·상태 조회는 `RECONSENT_REQUIRED`(503)로 실패하고, 4장의 동의를 다시 하면 옛 행을 지우고 새 키로 저장한다.

```powershell
# Windows PowerShell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

```bash
# macOS · Linux
openssl rand -base64 32
```

**MySQL.** 테이블 두 개(`workforce_oauth_token`, `workforce_oauth_state`)를 쓴다. DDL은 `src/main/resources/schema.sql`에 있고, 기본 설정에서는 앱이 시작할 때 만든다. 로컬에서 시험할 때는 Docker로 띄울 수 있다.

```bash
docker compose up -d     # localhost:3307, DB·계정·비밀번호 모두 workforce
```

---

## 3. 실행

`.env`를 채웠으면 바로 실행한다.

```bash
./gradlew bootRun        # Windows: .\gradlew.bat bootRun
```

`.env` 없이 환경변수로 넣을 때:

```powershell
# Windows PowerShell
$env:WF_BASE_URL      = 'https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}'
$env:WF_CLIENT_ID     = '…'
$env:WF_CLIENT_SECRET = '…'
$env:WF_TOKEN_KEY     = '…'
.\gradlew.bat bootRun
```

```bash
# macOS · Linux
export WF_BASE_URL='https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}'
export WF_CLIENT_ID=… WF_CLIENT_SECRET=… WF_TOKEN_KEY=…
./gradlew bootRun
```

jar로 실행할 때는 `./gradlew build`로 빌드한 뒤 `java -jar build/libs/apiRoute-workforce-1.0.0.jar`를 실행한다. `.env`는 java를 실행한 폴더에서 찾으므로 프로젝트 폴더에서 실행하거나 `.env`를 jar 옆에 두고 그 폴더에서 실행한다.

앱이 뜨면 8765 포트에서 Callback을 기다린다.

---

## 4. 처음 한 번 — 동의

1. **토큰 주인 계정**으로 Atlassian에 로그인한 브라우저에서 `http://localhost:8765/oauth/workforce/connect`를 연다.
2. Atlassian 동의 화면에서 사이트를 고르고 **Accept**를 누른다.
3. 브라우저가 `/callback`으로 돌아오고 "Workforce 연결 완료"가 보이면 토큰이 DB에 저장된 것이다.

이후 API를 호출할 때 만료가 가까운 토큰은 자동으로 갱신한다. refresh token이 만료되거나 동의가 철회되면 다시 동의해야 한다(6장).

- **다른 PC의 브라우저에서 동의할 때**: 기본 Callback URL `http://localhost:8765/callback`은 브라우저가 있는 PC 자신을 가리킨다. 따라서 서버가 다른 곳에 있으면 다음을 모두 맞춘다.
  - 브라우저에서 접근할 수 있는 주소로 Callback URL을 정하고 Developer Console에 등록한다. 예: `https://wf-sync.example.com/callback`
  - 같은 값을 `WF_REDIRECT_URI`에 넣는다.
  - 경로가 다르면 `WF_CALLBACK_PATH`도 같이 바꾼다.
  - 서버가 외부 요청을 받도록 `SERVER_ADDRESS`(또는 앞단 프록시)를 설정한다.
  - 그다음 `GET /oauth/workforce/authorize-url`로 받은 URL을 그 브라우저에서 연다. 10분 안에 Accept해야 한다.
- 연결 상태는 `GET /oauth/workforce/status`로 확인한다. 토큰 값은 응답에 나오지 않는다.

---

## 5. 조회하기

### 고객 코드에서

```java
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final WorkforceApiService workforceApiService;

    public void importEmployees() {
        for (WorkforceUser u : workforceApiService.getAllUsers()) {
            // u.accountId(), u.displayName(), u.active(), u.team() (팀장이면 u.team().isLeader() == true)
        }
        for (WorkforceTeam t : workforceApiService.getAllTeams()) {
            // t.teamKey(), t.teamName(), t.parentTeamKey(), t.leaderAccountId(), t.members()
        }
    }
}
```

| 메서드 | 설명 |
|---|---|
| `getAllUsers()` · `getAllTeams()` | 전체 조회. 페이지를 끝까지 넘기며 모은다 |
| `getUsers(offset)` · `getTeams(offset)` | 한 페이지. 사용자는 20명, 팀은 10팀 단위 |
| `getUser(accountId)` | 1명. Workforce에 없으면 `Optional.empty()` |

- 전체 조회 주기는 조직 변경 빈도와 필요한 반영 시간에 맞춰 정한다. 호출 한도가 있으므로 결과를 고객 시스템에 저장해 두고 재사용한다.
- 앱이 한동안 쉬었다가 처음 호출하면 10초 넘게 걸릴 수 있다. 응답 대기 시간은 기본 30초로 잡혀 있다.

### Swagger UI

`http://localhost:8765/swagger-ui.html`

| 묶음 | 내용 |
|---|---|
| 1. 인증(OAuth) | 동의 URL 받기, 연결 상태 |
| 2. 워크포스 API | 사용자 전체·한 페이지·1명, 팀 전체·한 페이지 |

`connect`와 `callback`은 Atlassian 화면을 거쳐야 하므로 Swagger가 아니라 브라우저 주소창에서 연다.

### 시험용 엔드포인트

```
GET /api/workforce/users                 전체 사용자
GET /api/workforce/users?offset=20       한 페이지
GET /api/workforce/users/{accountId}     1명 (없으면 404)
GET /api/workforce/teams                 전체 팀 (팀장·구성원 포함)
GET /api/workforce/teams?offset=10       한 페이지
```

---

## 6. 토큰 처리 방식

| 값 | 수명 | 이 예제의 처리 |
|---|---|---|
| `code` | 약 5분, 한 번만 사용 | Callback에서 바로 토큰으로 바꾼다 |
| access token | 1시간 | DB에 저장한다. 만료 1분 전부터는 쓰기 전에 갱신한다 |
| refresh token | 쓸 때마다 새 값으로 바뀜. 90일 동안 안 쓰면 만료 | 갱신할 때 새 값으로 바꿔 저장한다 |

**갱신 흐름** (`OAuthService`)
1. API를 부를 때마다 `getAccessToken()`이 DB의 만료 시각을 본다. 토큰 DB 작업은 항상 별도 트랜잭션으로 하므로, 고객 업무 트랜잭션이 롤백되어도 갱신된 토큰은 남는다.
2. 만료 1분 전이면 토큰 행을 `SELECT … FOR UPDATE`로 잠근다. 잠근 뒤 다시 확인해서 다른 요청이 이미 갱신했으면 그 값을 쓴다.
3. 갱신이 필요하면 refresh token으로 새 토큰을 받고, access·refresh를 한 트랜잭션으로 저장한다.
4. 만료 전인데 API가 401을 주면 한 번 갱신하고 그 요청을 한 번만 다시 보낸다.
5. 갱신이 `invalid_grant`로 거부되면 상태를 `RECONSENT_REQUIRED`로 바꾼다. 이후 호출은 `RECONSENT_REQUIRED`(503)로 실패하므로 4장의 동의를 다시 한다.

서버를 여러 대 띄워도 같은 DB를 쓰면 갱신이 한 번만 일어난다. 이때 모든 서버의 `WF_TOKEN_KEY`가 같아야 한다.

**DB 연결 수.** 토큰을 읽고 갱신할 때마다 별도 트랜잭션을 열므로 DB 연결을 하나 더 쓴다. 고객 코드의 `@Transactional` 안에서 Workforce를 부르면 그 요청은 연결 두 개를 동시에 잡는다. 동시 요청 수가 연결 풀 크기(기본 10)에 가까우면 모든 요청이 두 번째 연결을 기다리다 타임아웃될 수 있다. 다음 중 하나로 피한다.

- Workforce 조회는 고객 DB 트랜잭션 밖에서 하고, 결과만 트랜잭션 안으로 넘긴다(권장).
- 트랜잭션 안에서 불러야 하면 동시 실행 수보다 연결 풀(`spring.datasource.hikari.maximum-pool-size`)을 넉넉히 둔다.

갱신 응답에 새 refresh token이 없거나 `expires_in`이 0 이하이면 저장하지 않고 실패(502)로 처리한다. Atlassian은 갱신할 때마다 새 refresh token을 주므로 정상 동작에서는 생기지 않는다.

---

## 7. 오류

오류가 나오는 곳은 세 가지다.

| 어디서 | 형식 |
|---|---|
| `/callback` (동의 직후 브라우저 화면) | HTML 화면에 `코드 — 설명`을 보여 준다 |
| `/oauth/workforce/status`, `/api/workforce/*` | `{"error": {"code": "…", "message": "…"}}` |
| `/api/workforce/users/{accountId}`에서 없는 사용자 | 본문 없는 404 |

고객 코드에서 `WorkforceApiService`를 직접 쓰면 HTTP 응답 대신 예외가 난다. 세 가지이고 모두 `getCode()`로 아래 코드를 준다.

| 예외 | 언제 |
|---|---|
| `OAuthException` | 연결 없음·재동의 필요 등 인증 상태 문제 |
| `WorkforceApiException` | Workforce API 오류. `WebClientException`을 상속한다 |
| `WebClientException` | 토큰 갱신 중 토큰 서버 오류(`unauthorized_client`·`missing_refresh_token`·`network_error` 등) |

`catch (OAuthException e)`와 `catch (WebClientException e)` 두 개면 모두 잡힌다.

JSON 응답의 `message`는 이 예제가 정한 문장이다. Workforce·토큰 서버가 보낸 설명은 응답에 넣지 않는다. 필요하면 `logging.level.com.example.workforce=DEBUG`로 서버 로그에서 본다. 쿼리 파라미터 형식이 틀리면(`offset=abc` 등) `BAD_REQUEST`(400)로 같은 형식의 응답을 준다.

**인증**

| code (HTTP) | 원인 | 조치 |
|---|---|---|
| `NOT_CONNECTED` (503) | 아직 동의하지 않았다 | 4장 |
| `RECONSENT_REQUIRED` (503) | refresh token 만료(90일 미사용)·동의 철회·암호화 키 변경 | 4장을 다시 |
| `INVALID_STATE` (400) | 동의 URL을 연 지 10분이 지났거나 이미 쓴 URL이다 | `connect`부터 다시 |
| `CODE_EXCHANGE_FAILED` (400) | code 만료(5분), Callback URL 불일치, Client ID·Secret 오류 | 설정 확인 후 다시 동의 |
| `TOKEN_SERVER_UNAVAILABLE` (502) | code 교환 중 토큰 서버 장애·네트워크 오류 | 잠시 후 다시 동의 |
| `MISSING_CUSTOM_SCOPE` (400) | 토큰에 Workforce 권한이 없다 | OAuth 앱 권한(1장 3번) 확인 후 다시 동의 |
| `MISSING_REFRESH_TOKEN` (400) | scope에 `offline_access`가 빠졌다 | 기본 scope를 바꾸지 않았는지 확인 |
| `unauthorized_client` 등 (502) | 토큰 갱신 중 토큰 서버가 거부했다. 대개 Secret을 재발급하고 설정을 안 바꾼 경우 | `WF_CLIENT_ID`·`WF_CLIENT_SECRET` 확인. 자세한 내용은 서버 로그 |
| `missing_refresh_token`·`invalid_expires_in` (502) | 갱신 응답이 규약과 다르다 | 잠시 후 다시. 계속되면 서버 로그 확인 |

**Workforce API**

| code (HTTP) | 원인 | 조치 |
|---|---|---|
| `PERMISSION_DENIED` (403) | 토큰 주인에게 Workforce 권한 세트가 없다 | 1장 6번 |
| `MISSING_SCOPE` (403) | Workforce가 토큰 권한을 거부했다 | 다시 동의 |
| `API_INVALID_QUERY` (400) | offset 단위가 틀렸다(사용자 20, 팀 10) | 요청 확인 |
| `ROUTE_NOT_FOUND` (404) | 기본 URL이 틀렸다 | `WF_BASE_URL` 확인 |
| `UNAUTHORIZED` (401) | 갱신 후에도 401 | 다시 동의 |
| `HTTP_429` (429) | 호출 한도. 서버가 요구한 대기가 `max-rate-limit-wait`보다 길었다 | 잠시 후 다시 |
| `API_READ_FAILED`·`HTTP_5xx`·`NETWORK` (502) | Workforce 일시 장애·네트워크 | 자동 재시도(기본 3번) 뒤의 결과다. 잠시 후 다시 |
| `INVALID_RESPONSE`·`INVALID_PAGE` (502) | 응답 형식이 예상과 다르다. 목록에 `users`·`teams`·`page`가 빠진 응답도 빈 목록으로 보지 않고 이 오류로 끝낸다 | 서버 로그 확인 후 문의 |

Workforce가 돌려준 코드(`PERMISSION_DENIED` 등)는 영문·숫자·밑줄로만 되어 있으면 그대로 전달한다. 그 밖의 코드는 이 예제가 붙인다.

**팀 목록이 잘렸을 때.** 팀 응답의 `page.truncated`가 `true`이면 Workforce가 팀 목록이나 팀원 명단을 한도에서 잘랐다는 뜻이다(팀당 100명, 한 페이지 500명). 팀별로는 `membersTruncated`를 본다. 팀원 전체가 필요하면 사용자 API(`getAllUsers`)의 `team.teamKey`로 묶는다.

---

## 8. 운영에 올릴 때

- [ ] `/oauth/workforce/*`에는 로그인 확인이 없다. 관리자 인증(Spring Security 등)이나 내부망 뒤에 둔다. 그렇지 않으면 누구나 `connect`로 토큰 주인을 바꿀 수 있다.
- [ ] `/api/workforce/*`는 시험용이다. 지우거나 내부 인증 뒤에 둔다.
- [ ] `SWAGGER_ENABLED=false`
- [ ] `SQL_INIT_MODE=never`로 두고 테이블은 Flyway 같은 도구로 관리한다.
- [ ] `WF_CLIENT_SECRET`·`WF_TOKEN_KEY`·DB 비밀번호는 비밀 저장소로 넣는다.
- [ ] Callback URL이 `localhost`가 아니면 https를 쓰고, Developer Console에도 그 주소를 등록한다.
- [ ] 토큰 주인은 연동 전용 계정으로 하고, Workforce 권한은 Read만 준다.
- [ ] 모니터링: `GET /oauth/workforce/status`의 `status`와 `refreshedAt`, 그리고 조회 작업의 성공 여부를 함께 본다. `RECONSENT_REQUIRED`는 실제로 갱신을 시도해야 드러나므로, 한동안 호출이 없었다면 상태만으로는 알 수 없다.
- [ ] 로그: 접근 로그나 프록시 로그에 `/callback`의 `code`·`state` 쿼리가 남지 않게 한다.
- [ ] 백업: `WF_TOKEN_KEY`를 DB 백업과 따로, 같은 기간 보관한다. 오래된 DB 백업을 복원하면 refresh token이 이미 회전되어 쓸 수 없을 수 있다. 이때는 다시 동의한다.
- [ ] 로컬 시험용 `docker-compose.yml`의 비밀번호는 운영에 쓰지 않는다.

---

## 9. 코드 구조

```
com.example.workforce
├─ WorkforceApplication
├─ auth/                         인증 — 동의·Callback·토큰 저장·갱신
│  ├─ controller/  OAuthController         connect · authorize-url · callback · status
│  ├─ service/     OAuthService            동의 URL 생성, Callback 처리, 토큰 꺼내기·갱신
│  ├─ client/      AtlassianTokenClient    auth.atlassian.com 토큰 요청
│  ├─ repository/  OAuthTokenRepository · OAuthStateRepository
│  ├─ entity/      OAuthToken · OAuthState · EncryptedStringConverter(토큰 암호화)
│  ├─ dto/         TokenResponse
│  ├─ config/      OAuthConfig · OAuthProperties
│  └─ exception/   OAuthException
├─ api/                          워크포스 API — 사용자·팀(팀장) 조회
│  ├─ controller/  WorkforceApiController  시험용
│  ├─ service/     WorkforceApiService     고객 코드가 쓰는 클래스
│  ├─ client/      WorkforceApiClient · WorkforceEndpoint(경로 목록)
│  ├─ dto/         WorkforceDtos
│  ├─ config/      WorkforceApiConfig · WorkforceApiProperties
│  └─ exception/   WorkforceApiException
└─ common/
   ├─ webclient/   AbstractWebClient(외부 호출 공통: 재시도·429 대기·401 처리) · WebClientException
   ├─ exception/   GlobalExceptionHandler
   └─ config/      OpenApiConfig(Swagger)
```

- `api`가 `auth`에서 쓰는 것은 `OAuthService.getAccessToken()`과 `refreshAfterUnauthorized()`뿐이다.
- Client Secret과 암호화 키는 환경변수로 넣는다. 토큰은 메모리에서는 평문이고 DB에는 암호화해 저장한다. 요청·응답·엔티티를 로그로 출력하지 않는다.

---

## 10. 확장

**Workforce API가 추가되면.** `WorkforceEndpoint`에 한 줄을 넣고, `WorkforceApiClient`에 `call(...)`을 부르는 메서드를 하나 만든다. 버전(`/v1`)은 `workforce.api.version` 설정에서 붙는다.

```java
// WorkforceEndpoint
WORKLOGS("/organization/worklogs");

// WorkforceApiClient
public WorklogsContent worklogs(int offset) {
    return call(WorkforceEndpoint.WORKLOGS, Map.of("offset", offset), WorklogsResponse.class).content();
}
```

**다른 외부 API를 붙이려면.** `AbstractWebClient`를 상속한다. 재시도·429 대기·JSON 변환은 부모가 하고, 하위 클래스는 경로 메서드와 필요한 재정의만 쓴다.

| 재정의 | 쓰는 경우 |
|---|---|
| `applyHeaders(headers)` | 매 요청에 인증 헤더를 넣을 때 |
| `handleUnauthorized(sentHeaders)` | 401을 받으면 토큰을 갱신하고 한 번 더 보낼 때(`true` 반환) |
| `decode(res, type)` | 성공 응답에 공통 봉투나 검사가 있을 때 |
| `toException(res)` · `toNetworkException(e)` | 실패를 전용 예외로 바꿀 때 |

```java
public class ErpApiClient extends AbstractWebClient {

    private final String apiKey;

    public ErpApiClient(RestClient restClient, ObjectMapper objectMapper, String apiKey) {
        super(restClient, objectMapper, new RetryPolicy(3, Duration.ofSeconds(60)), Sleeper.THREAD);
        this.apiKey = apiKey;
    }

    public EmployeeDto employee(String id) {
        return get(b -> b.path("/employees/{id}").build(id), EmployeeDto.class);
    }

    @Override
    protected void applyHeaders(HttpHeaders headers) {
        headers.set("X-Api-Key", apiKey);
    }
}

@Bean
public ErpApiClient erpApiClient(RestClient.Builder builder, ObjectMapper objectMapper, ErpProperties props) {
    RestClient restClient = AbstractWebClient.restClient(builder, props.baseUrl(), Duration.ofSeconds(10), Duration.ofSeconds(30));
    return new ErpApiClient(restClient, objectMapper, props.apiKey());
}
```

- 일회용 값을 보내는 호출(예: 토큰 발급)은 `RetryPolicy.NONE`으로 재시도를 끈다.

---

## 11. 테스트

```bash
./gradlew test
```

단위 테스트는 DB 없이 돈다. 행 잠금·암호화 저장·`schema.sql` 일치는 MySQL에 띄워서 확인한다(2장 docker → 3장 → 4장 → 5장 시험용 엔드포인트).

| 테스트 | 확인하는 것 |
|---|---|
| `OAuthServiceTest` | 만료 전 재사용, 만료 임박 시 갱신·refresh 교체, 다른 요청이 먼저 갱신한 경우, 401 후 갱신, `invalid_grant` 시 재동의 상태, 동의 완료 시 옛 행 삭제 후 저장, state 거부, 토큰 서버 장애와 code 거부 구분, 권한·refresh 누락 거부 |
| `WorkforceApiClientTest` | 페이지 순회, 401 갱신 후 1회 재시도, 503 재시도, 권한 오류 미재시도, 없는 사용자 |
| `AbstractWebClientTest` | 상속 클래스의 헤더·JSON 변환, 429 대기, 대기 상한 초과 시 재시도 안 함, 5xx 재시도 한도 |
| `WorkforceApiServiceTest` | 페이지 순회, 앞으로 가지 않는 `nextOffset`·`page` 누락 거부 |
| `EncryptedStringConverterTest` | 암호화·복호화, 다른 키 거부, 키 형식 검사 |

---

## 12. 자주 묻는 것

**Callback을 받으려면 서버가 계속 떠 있어야 하나?**
동의할 때만 떠 있으면 된다. 그 뒤로 Atlassian이 Callback을 다시 부르는 일은 없다. 이 예제는 조회 서버가 Callback도 함께 받는다.

**동의는 몇 번 하나?**
처음 한 번이다. 다음 경우에만 다시 한다.
- refresh token을 90일 동안 한 번도 안 썼을 때
- 토큰 주인이 앱 연결을 끊었을 때
- 암호화 키를 바꿨을 때
- OAuth 앱에 권한을 추가했을 때

**토큰 주인 계정이 퇴사하면?**
호출이 실패한다. 다른 계정으로 다시 동의한다. 그래서 연동 전용 계정을 권장한다.

**Secret을 재발급하면?**
`WF_CLIENT_SECRET`을 새 값으로 바꾸고 재시작한다. 갱신이 실패하면 다시 동의한다.
