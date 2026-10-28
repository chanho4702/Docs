# Forge API Route (앱 REST API) 정리

> 작성 2026-10-27 · 공식 문서 기준 + 우리 개발 사이트 실측(2026-10-19~20)
> 같이 볼 문서: `forge-web-trigger.md`

## 1. 무엇인가

Forge 앱이 **외부 시스템용 REST API를 공개**하는 기능이다(Preview).

- `manifest.yml`에 `apiRoute` 모듈로 경로·HTTP 메서드·함수·scope를 선언한다.
- 외부 시스템은 **OAuth 2.0 (3LO) access token**을 `Authorization: Bearer`로 보내야 호출할 수 있다. 토큰이 없으면 Atlassian 게이트웨이에서 막힌다.
- 지금은 Jira·Confluence 앱만 쓸 수 있고 Isolated Cloud에서는 쓸 수 없다.

우리 쓰임: 워크포스가 고객 외부 시스템에 조직 조회 API를 연다.

| 경로 | 내용 | scope |
|---|---|---|
| `GET /v1/organization/users` | 사용자(20명씩) | `read:organization:custom` |
| `GET /v1/organization/teams` | 팀·팀장(10팀씩) | `read:organization:custom` |

### Web trigger와 차이

| | Web trigger | API Route |
|---|---|---|
| 용도 | 앱 ↔ 앱, 외부 → 앱(인증은 앱이 직접) | 외부 시스템 → 앱 |
| 인증 | 없음(앱이 서명·토큰을 직접 검사) | Atlassian 3LO 토큰 필수 |
| 호출자 신원 | 없음 | `principal.accountId` = 토큰 주인 |
| URL | 설치마다 앱이 코드로 발급 | 사이트·앱·환경으로 정해진 고정 형식 |
| 고객 설정 | 연결 코드 붙여 넣기 | 관리자 켜기 + OAuth 앱 만들기 + 동의(아래 3장) |
| Runs on Atlassian | dynamic이면 자격 잃음 | 다른 조건을 지키면 자격 유지 |

## 2. 공식 문서

| 내용 | 링크 |
|---|---|
| 개요(Preview, 제약) | https://developer.atlassian.com/platform/forge/app-rest-apis/ |
| 개발사 쪽 — 공개하는 법 | https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/ |
| 고객 쪽 — 호출하는 법 | https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/ |
| manifest `apiRoute` 모듈 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/ |
| OAuth 2.0 (3LO) | https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/ |
| refresh token 회전 | https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/ |
| 실행 한도 | https://developer.atlassian.com/platform/forge/limits-invocation/ |

## 3. 누가 무엇을 하나

Web trigger와 달리 **고객 쪽 설정이 필요하다.** 고객사마다 사이트·OAuth 앱·토큰 주인이 다르므로 각 고객이 직접 한다. 우리는 고객 사이트에서 CLI를 실행하지 않는다.

### 우리(개발사) — 환경마다 한 번

1. `custom-scopes.yaml`에 scope 정의. 이름은 `:custom`으로 끝나야 한다.
2. 환경마다 scope 등록: `forge custom-scopes create -e <환경> -f custom-scopes.yaml`. 확인은 `forge custom-scopes list -e <환경>`.
3. `apiRoute` 추가 후 `forge deploy -e <환경>`. 배포하면 엔드포인트가 생긴다.
4. 고객용 문서 공개: 엔드포인트 ↔ scope 표, app id·환경 id(기본 URL). Marketplace 배포 조건이다.

### 고객 — 사이트마다 한 번

| 단계 | 누가 | 어디서 |
|---|---|---|
| 1. 앱 REST API 켜기(사이트마다 기본 꺼짐) | 사이트·조직 관리자 | admin.atlassian.com → 연결된 앱 → 앱 세부 정보 → App REST APIs |
| 2. OAuth 2.0 앱 만들기, 우리 앱·환경 연결, scope 선택(`read:organization:custom` + `read:forge-app:jira`), Callback URL 등록 | 연동 담당자(그 사이트 구성원이어야 함) | developer.atlassian.com/console |
| 3. 동의 → code를 토큰으로 교환 | 토큰 주인이 될 사용자 → 연동 서버 | 동의 화면 → `auth.atlassian.com/oauth/token` |
| 4. 호출, 1시간마다 토큰 갱신 | 연동 서버 | 기본 URL |

1단계를 끄면 호출이 즉시 막힌다.

## 4. 기본 URL

둘 다 같은 함수를 부른다.

```
https://{사이트}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}/v1/organization/users
https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}/v1/organization/users
```

`cloudId`는 `https://{사이트}.atlassian.net/_edge/tenant_info`에서 얻는다. 고객 사이트마다 `{사이트}`·`cloudId`가 다르고, `{appId}_{envId}`는 우리 앱 production 환경 값으로 모든 고객이 같다.

## 5. 제약사항

### 공식 문서

- **Preview 기능.** 운영에 써도 되지만 지원 중단 예고 기간이 짧을 수 있다.
- **인증은 3LO만.** API token·서비스 계정 방식은 문서에 없다.
- **scope**
  - 앱·환경당 최대 20개
  - 이름은 `:custom`으로 끝나야 한다
  - **등록한 scope는 지우거나 이름을 바꿀 수 없다.** 처음에 이름을 신중히 정한다
  - 환경을 지정하지 않으면 development에만 등록된다. staging·production에도 각각 등록해야 한다
- **요청 형식:** `accept`는 `application/json`만 지원한다. 메서드는 GET·PUT·POST·DELETE·PATCH.
- **응답:** 함수가 `statusCode`를 꼭 돌려줘야 한다.
- **OAuth 앱:** 앱이 설치된 사이트의 구성원만 그 사이트용 3LO 앱을 만들 수 있다.
- **실행 한도:** Forge 함수 호출 한도를 따른다. 설치당 분당 7,000회·초당 300회, 사용자당 분당 1,200회이고, 넘으면 429가 난다. 한도 문서에 apiRoute 전용 실행 시간 수치는 없다.

### 토큰 (3LO)

| 값 | 수명 |
|---|---|
| code | 약 5분, 한 번만 |
| access token | 1시간 |
| refresh token | 쓸 때마다 새 값으로 바뀜(회전). 옛 값 재사용 허용 구간 기본 10분. 90일 안 쓰면 만료 → `invalid_grant` → 다시 동의 |

refresh token을 받으려면 동의할 때 scope에 `offline_access`를 넣어야 한다.

### 버전·배포 (커뮤니티 보고)

- `apiRoute` 추가는 **major 버전 업데이트**로 취급된다. 고객 관리자가 직접 업데이트해야 한다.
  출처: https://community.developer.atlassian.com/t/adding-an-apiroute-triggers-a-major-version-update/103268

## 6. 우리 실측 (개발 사이트, 2026-10-19~20)

| 항목 | 결과 |
|---|---|
| 토큰 없이 호출 | 401. 앱 신원만으로는 통과하지 않는다 |
| 동의 URL에 `sns={appId}.{envId}`가 없을 때 | 토큰에 custom scope가 빠져 **403** `Missing required scopes`. 공식 문서에는 이 파라미터 설명이 없다. 동의 URL을 직접 만들면 꼭 넣는다 |
| Developer Console 동의 URL | `offline_access`가 없다 → 직접 넣어야 refresh token을 받는다 |
| 핸들러 `principal.accountId` | 토큰을 발급받은(동의한) 사용자. 이 사람의 앱 권한으로 판정한다 |
| `accessible-resources` | 빈 목록 → `cloudId`는 `_edge/tenant_info`로 얻는다 |
| 응답 시간 | 콜드 8.8~10.8초, 이후 약 2초 → 클라이언트 read timeout은 15초 이상 |
| refresh 회전 | 회전 직후 옛 refresh token이 한 번 더 통과(재사용 허용 구간 10분 — 결함 아님) |
| 앱 간 호출에 쓰면 | 약 1.8초, 고객 설정 4단계 → 앱 ↔ 앱은 web trigger로 정함 |

## 7. 확인할 것

- [ ] 워크포스 리포의 `custom-scopes.yaml`에는 조사용 `read:probe:custom`만 있다. 실제로 쓰는 `read:organization:custom`이 staging·production 환경에도 등록돼 있는지 `forge custom-scopes list -e <환경>`으로 확인한다. 없으면 그 환경에서는 동작하지 않는다.
- [ ] 고객 가이드에 production `{appId}_{envId}`가 들어갔는지 확인한다.
- [ ] Preview 기능이므로 변경 공지(Forge changelog)를 지켜본다.

## 8. 정리 — 쓸 때 지킬 것

1. scope 이름은 되돌릴 수 없으니 정해 두고 쓴다(지금은 `read:organization:custom` 하나).
2. 권한 판정은 `principal.accountId`(토큰 주인) 기준으로 기존 가드를 그대로 탄다.
3. 고객에게는 관리자 켜기 → OAuth 앱 → 동의(`sns`·`offline_access`) 순서를 안내하고, refresh token 회전 저장을 강조한다.
4. 첫 호출이 10초를 넘을 수 있으니 고객 클라이언트 타임아웃을 넉넉히 둔다.
