독자: 사내 의사결정자·개발자 (보고 문서, ~다 체)

# 외부 시스템 → 워크포스 조회 API — apiRoute + OAuth 2.0(3LO)

> 가능성 · 구현 · 검증 (2026-10-20 기준, 개발 사이트 실측)
> 대상: Moves Workforce for Jira 의 `GET /v1/organization/users`(샘플)·`GET /v1/organization/teams`
> 고객용 연결 가이드: 「Moves Workforce 외부 조회 API 연결 가이드 및 설정 방법」(별도 문서)

## 요약

- **결론: 가능하고, 워크포스에 열어 dev 에서 호출까지 확인했다.** 외부 시스템(인사·그룹웨어·BI 등)이 사용자 본인의 동의로 받은 토큰으로 워크포스의 조직 정보를 읽는다.
- 응답 범위는 **토큰 주인이 워크포스 화면에서 볼 수 있는 만큼**이다 — 기존 화면용 권한 가드를 그대로 거친다. 토큰(scope)이 권한을 넓히지 않는다.
- 고객 쪽 사람 작업이 있다: 사이트 관리자가 앱 REST API 켜기, 연동 담당자가 OAuth 앱 만들기·권한 연결, 토큰 주인 동의, Secret 보관.
- **Preview 기능**이다(Jira·Confluence 앱만, 폐기 예고 기간이 짧을 수 있음).

| 항목 | 값(dev 실측) |
|---|---|
| 토큰 없음·가짜 토큰 | 401 |
| 정상 호출 | 200, 콜드 9~11초 → 이후 약 2초 |
| custom scope 빠진 토큰 | 403 `Missing required scopes` |
| 화면 대조 | 사용자 5명·팀·팀장 일치, 급여·권한·역할·등급은 응답에 없음 |

---

## 1. 기술적으로 가능한가

### 1.1 확인해야 했던 것

| 질문 | 답 | 근거 |
|---|---|---|
| Forge 앱이 외부에 REST API 를 열 수 있나 | 된다 — manifest `apiRoute` 모듈(Preview) | 공식[^ar] |
| 인증은 | **3LO(OAuth 2.0) 토큰만**. 토큰 없이 부르면 401 — 다른 Forge 앱이라도 그냥 통과하지 않는다 | 공식[^ov], 사전 실측 |
| 호출자 신원 | 핸들러 `principal.accountId` = **토큰을 발급받은 사람**, `installContext` = 사이트 | 사전 실측 |
| 권한 범위를 정하는 법 | 개발사가 정의한 custom scope(`read:organization:custom`) + 고객 3LO 앱이 그 scope 를 연결 | 공식[^ex] |
| 함정 | 동의 URL 에 **`sns={appId}.{envId}`** 가 없으면 동의는 되지만 custom scope 가 빠져 403. 공식 튜토리얼에 없고 Developer Console 의 Authorization URL generator 에만 있다 | 사전 실측·이번 실측(#9) |
| 사람 없이 주기적으로 | 동의 URL 에 `offline_access` → refresh token. 회전 강제(쓸 때마다 새 값) | 공식[^oauth] |

"사전 실측"은 본 개발 전에 시험용 앱 두 개로 같은 사이트에서 측정한 결과, "이번 실측"은 §3 의 번호다.

### 1.2 공식 문서의 제약사항과 우리 대응

| 제약(공식) | 출처 | 우리 영향·대응 |
|---|---|---|
| **Preview** — "may be subject to shorter deprecation windows" | [App REST APIs][ov] · [API route][ar] | 외부 계약은 `/v1/` 버전 경로로, 응답 필드는 명시 허용 목록만. 바뀌면 v2 경로 추가 |
| **Jira·Confluence 앱만**, **Isolated Cloud 불가** | [API route][ar] | 워크포스는 Jira 앱 — 해당 없음. Isolated Cloud 고객은 못 씀 |
| **사이트마다 기본 꺼짐** — 사이트·조직 관리자가 연결된 앱에서 켜야 함. 끄면 **즉시** 모든 호출 차단 | [Access REST APIs][acc] | 고객 가이드 1장. 고객 관리자 작업이라 설치 안내에 포함 |
| **3LO 만** 인증 수단(API 토큰 등 언급 없음). 토큰은 고객 동의 후에만 발급, 매 호출에 필요 | [App REST APIs][ov] | 연동 서버가 토큰·refresh 를 보관·회전해야 함(가이드 3·4장) |
| **3LO 앱은 그 사이트 구성원만 만들 수 있다** — 외부 업체가 직접 못 만든다 | [App REST APIs][ov] · [Access REST APIs][acc] | 고객 쪽 담당자가 만들어야 함 — 외주 연동 업체는 고객 계정이 필요 |
| **custom scope 앱·환경당 20개**, 이름은 `…:custom`(최대 93자 + 접미), **이름 변경 불가, 비활성화·삭제 불가** | [Expose REST APIs][ex] | 현재 `read:organization:custom` 1개(teams·users 공용). 실험용 `read:probe:custom` 은 지울 수 없으니 apiRoute 에 매핑하지 않은 채 둔다. 새 scope 는 신중히 |
| scope 는 **환경별 등록**, 앱 관리자만, apiRoute 에 매핑하기 전에 등록 | [Expose REST APIs][ex] | 개발 환경마다 등록해 확인. 운영 환경은 배포 전 등록 |
| 받는 형식 **`application/json` 만**, 메서드 GET·PUT·POST·DELETE·PATCH, 응답에 `statusCode` 필수 | [API route][ar] · [Expose REST APIs][ex] | GET 만 선언 — 다른 메서드는 플랫폼이 404(핸들러 미도달, 실측 T23) |
| 경로 와일드카드 `*`(한 칸)·`**`(여러 칸), query 는 정확한 경로에 붙음 | [Access REST APIs][acc] | 고정 경로 + query(`offset`·`accountId`) |
| 3LO 앱에 **Forge 제품 scope `read:forge-app:jira` 추가** 필요, 필요한 scope 만 | [Access REST APIs][acc] | 가이드 2-3. 읽기 전용이라 `write:` 는 넣지 않음 |
| 마켓플레이스 배포 시 **REST API ↔ scope 대응 개발자 문서 공개** 필요 | [App REST APIs][ov] · [Expose REST APIs][ex] | 고객 가이드 4장(요청·응답·오류)을 공개 문서로 다듬어야 함 |
| `environment-id`·`app-id` 는 앱마다 달라 **고객에게 알려 줘야** 함, cloudId 는 `https://<사이트>/_edge/tenant_info` 로 조회 | [Expose REST APIs][ex] · [Access REST APIs][acc] | 기본 URL 은 관리 화면(1단계)에 나온다. 토큰의 `accessible-resources` 는 빈 목록이라(실측) cloudId 는 tenant_info 로 |
| apiRoute 앱도 **다른 조건을 모두 만족하면** Runs on Atlassian 가능 | [App REST APIs][ov] | 워크포스는 webtrigger(dynamic)·egress 때문에 이미 실격(앱 간 채널 문서) |
| refresh token **회전·재사용 허용 10분·미사용 90일 만료** | [OAuth 2.0 (3LO) — Jira][oauth] | 회전 결과 원자적 저장. 90일 쉬면 다시 동의 |
| 실행 시간·크기·호출 한도 | apiRoute 문서엔 수치 없음 → Forge 공통 [Invocation limits][lim]: 요청 5MB, 설치당 분당 7,000·초당 300, 사용자당 분당 1,200 | 페이지 크기 20명·10팀으로 작게. 429 는 `X-Ratelimit-Reset` 까지 대기 |

---

## 2. 어떻게 구현했나

### 2.1 구조

![외부 API 구조](img/diagram-2-apiroute-external-api.png)

### 2.2 만든 것

![여는 순서와 호출 순서](img/diagram-5-apiroute-setup-order.png)

| 항목 | 내용 |
|---|---|
| custom scope | `read:organization:custom` "Read organization teams and users" — 설명에 "인증된 사용자의 기존 워크포스 팀·사용자 관리 권한 안에서" 명시(동의 화면에 그대로 보임). scope 정의 파일로 환경마다 등록 |
| apiRoute | `GET /v1/organization/users`, `GET /v1/organization/teams` — accept `application/json`, 두 경로 모두 위 scope 하나 |
| 핸들러 | ① 신원은 플랫폼이 준 `principal.accountId`·`installContext` 만(query 의 accountId 는 조회 대상일 뿐), 다른 사이트 cloudId 섞이면 401 ② query 화이트리스트(`offset` 20 배수·`accountId` 1명, 둘 동시·모르는 키 400) ③ 화면과 같은 기존 권한 가드를 거친 조회 ④ 실패 → 권한·라이선스 403, 없음 404, 그 밖 503(원인 문구 없음) ⑤ 응답 필드 명시 허용 목록 |
| 테스트 | 신원·query·권한 거부(권한 없음 → 403)·필드 허용 목록 |

설계 원칙: **새 권한 로직을 만들지 않는다** — 외부 API 도 화면과 같은 가드를 지나므로 "화면에서 못 보면 API 로도 못 본다".

---

## 3. 어떻게 검증하나 · 결과

### 3.1 개설·등록 절차를 실제로 따라 하며 캡처 (dev, 2026-10-20)

| 단계 | 결과 | 캡처 |
|---|---|---|
| scope 등록·배포·업그레이드 | 개발 환경에 `read:organization:custom` 등록 | 배포 도구 출력 |
| 관리자 App REST API 켜기 | "사용" + 기본 URL | ![](img/ar-01-rest-api-on.jpg) |
| OAuth 앱 + 권한 연결 | Moves Workforce (MOVES-RMS) 1개 + Jira `read:forge-app:jira` | ![](img/ar-02-permissions.jpg) |
| 동의(sns 포함) | "In Moves … Read organization teams and users" 보임 | ![](img/ar-03-consent.jpg) |
| 동의(sns 없음) | Moves 항목이 **없음** → 403 | ![](img/ar-04-consent-nosns.jpg) |

### 3.2 호출 결과

| # | 요청 | 기대 | 결과 |
|---|---|---|---|
| 1 | 토큰 없음·가짜 토큰(사이트형·svc형) | 401 | 401(0.08~0.1초) |
| 2 | 목록 | 200 | 200, 5명(콜드 8.8초 → 1.9초) |
| 3 | 1명 / 없는 사람 | 200 / 404 | 200 / 404 `USER_NOT_FOUND` |
| 4 | `offset=20`(5명뿐) | 빈 페이지 | 200 `users:[]` |
| 5 | 잘못된 query | 400 | 400 `API_INVALID_QUERY` |
| 6 | POST·없는 경로 | 거부 | 404(플랫폼, 핸들러 미도달) |
| 7 | 같은 토큰으로 teams | 200 | 200(같은 scope) |
| 8 | refresh 회전 | 둘 다 새 값 | 새 값, 옛 refresh 도 10분 안 1회 통과(공식 재사용 구간) |
| 9 | sns 없는 토큰 | 403 | 403 `Missing: [read:organization:custom]` |

화면 대조 — 워크포스 설정 > 인력 관리의 5명과 응답이 이름·팀·팀장까지 일치, 화면에 있는 급여·권한·역할·등급은 응답에 없다.

![워크포스 인력 관리 화면](img/ar-05-users-screen.jpg)

### 3.3 아직 확인하지 않은 것

| 항목 | 하는 법 |
|---|---|
| **권한 없는 사용자 거부(403 `PERMISSION_DENIED`)** — 단위 테스트로만 확인 | 워크포스 인력 관리 Read 가 없는 계정(예: Member 세트)으로 동의 → 호출 |
| 라이선스 없는 설치, production 환경, 여러 사이트에 동의한 토큰 | 운영 전 |

### 3.4 다시 검증하려면

1. 고객 가이드 1~3장대로 켜기·OAuth 앱·동의.
2. 측정 도우미 스크립트(동의 서버·호출·갱신) — `consent`(동의 서버), `call <이름> <token|none|bogus|nosns> <site|svc> <GET> <경로>`, `refresh`. Client ID·Secret 은 사용자가 별도 파일에 직접 저장, 스크립트는 값을 출력하지 않는다. Git Bash 에선 `MSYS_NO_PATHCONV=1`(경로 인자가 바뀐다).
3. 끝나면 검증용 OAuth 앱 삭제(또는 Secret 재발급), 동의 철회, 토큰 파일 삭제.


---

[ov]: https://developer.atlassian.com/platform/forge/app-rest-apis/
[ar]: https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/
[ex]: https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/
[acc]: https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/
[oauth]: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
[lim]: https://developer.atlassian.com/platform/forge/limits-invocation/

[^ar]: [API route (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/)
[^ov]: [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/)
[^ex]: [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/)
[^oauth]: [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) · [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/)
