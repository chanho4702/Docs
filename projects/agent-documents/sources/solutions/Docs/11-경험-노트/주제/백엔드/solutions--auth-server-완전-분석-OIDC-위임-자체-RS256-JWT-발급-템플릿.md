---
tags: [backend, auth, oidc, jwt, spring-security, keycloak, template]
updated: 2026-07-18
---

# auth-server 완전 분석 — OIDC 위임 + 자체 RS256 JWT 발급 템플릿

> 출처: `C:\MSA_SAMPLE_PROJECT\auth-server` (repo `github.com/chanho4702/auth-server`), 2026-07-18 학습 세션.
> 관련: [[topics/backend/session-auth-hardening|session-auth-hardening]] (moveseye에서 같은 계열 패턴 적용 경험)

## 0. 한눈 요약

**"로그인은 Keycloak에 위임하고, 플랫폼 전용 토큰은 직접 발급하는" 인증 서버(:9000).**

- 인증(계정·구글 SSO·로그인 화면) = Keycloak. 토큰 발급 = auth-server(자체 RS256 JWT + 회전형 RT).
- 클라이언트는 Keycloak 토큰을 **절대 들고 다니지 않는다** — 자체 JWT만 유통.
- 각 마이크로서비스는 `/.well-known/jwks.json` 공개키로 **분산 검증**(auth-server 무호출).
- Spring Boot 4.0.6 · Java 24 · Spring Cloud 2025.1.2(eureka) · JPA+Flyway+PostgreSQL · Nimbus JOSE.
- 소스 15파일, 테스트 11클래스. 게이트웨이(:8000) 뒤에서 동작(`forward-headers-strategy: framework`).

```
[브라우저] → gateway:8000 → auth-server:9000 ←OIDC→ Keycloak:8080
                                  │ users·refresh_tokens → Postgres:5433
                                  └ /.well-known/jwks.json → board-service 등이 자체 검증
```

**토큰 분업의 대원칙** (이 서버 전체를 관통):

| | Access Token | Refresh Token |
|---|---|---|
| 정체 | RS256 JWT | opaque 랜덤 32바이트 |
| 수명 | 15분 | 14일 |
| 서버 기억 | ❌ stateless | ✅ DB(해시만) |
| 회수 | 불가 → 짧게 | 가능(DB) → 길게 |
| 보관 | 프론트 메모리 | HttpOnly 쿠키 |

---

## 1. `SecurityConfig` — 필터체인 2개 (뼈대)

이 서버는 두 얼굴: **OAuth2 클라이언트**(Keycloak에 로그인 위임)이자 **리소스서버**(자체 JWT 검증). 인증 방식·세션 정책·실패 동작이 정반대라 체인을 분리한다.

- `apiChain` `@Order(HIGHEST_PRECEDENCE)` + `securityMatcher("/api/me")` — stateless Bearer JWT 검증.
- `webChain` `@Order(+1)`, 매처 없음 — 나머지 전부. `oauth2Login()` + successHandler.
- 체인은 Order 순으로 **첫 매칭 하나만** 적용(양자택일). 구체적 매처가 반드시 앞 순서여야 함 — 순서 바꾸면 webChain이 `/api/me`까지 삼킨다.

`jwtDecoder`: 원격 JWKS fetch가 아니라 **로컬 공개키 직접 주입**(자기가 발급자니까). 검증 4중 — 서명 · 만료 · `iss`(`platform.issuer`) · `aud contains platform.audience`. aud 검증이 없으면 같은 발급자의 **다른 용도 토큰**이 통과하는 token confusion 발생. `aud`는 리스트일 수 있어 `contains`.

`jwtAuthenticationConverter`: `roles` claim → `ROLE_` 접두사 권한(기본은 `scope`→`SCOPE_`). `hasRole("X")` 문법을 쓰기 위한 관례.

기타: apiChain CSRF off는 안전(쿠키 미사용, Bearer는 cross-site 자동 전송 불가). webChain permitAll 3종은 각각 이유 있음 — `/api/auth/**`(컨트롤러가 RT 쿠키 직접 검증) · `/.well-known/**`(공개키 공개) · `/error`(막으면 엉뚱한 403 함정). webChain에 STATELESS 없음은 의도 — OIDC `state`/`nonce` 세션 보관 필요.

`oauth2Login()` 한 줄이 `/oauth2/authorization/keycloak`(시작)과 `/login/oauth2/code/keycloak`(콜백)을 자동 생성 — 컨트롤러 코드 없이 로그인 엔드포인트가 존재하는 이유.

## 2. `jwt/` — 출입증 공장

**`JwtKeyProvider`** (금고지기): `@PostConstruct`에서 3분기 — 파일 있으면 로드 / 없으면 RSA 2048 생성 / keyPath 있으면 저장. **파일 고정 이유 = 재시작해도 기발급 토큰 유효**(키 바뀌면 전원 401). `./auth-jwk.json`에 **개인키 포함** → gitignore, 운영은 시크릿 매니저 권장. `keyPath=null`이면 메모리 전용(테스트). `kid`(UUID)는 미래 키 로테이션 대비 표준 관례.

**`JwtService`** (제작자): `issueAccessToken(userId, email, name, roles, provider)` → claims `iss/aud/sub/email/name/provider/roles/iat/exp` 빌드 → RS256 서명(`RSASSASigner`, 헤더에 kid) → serialize. **발급 claim과 SecurityConfig 검증 규칙이 같은 설정값(`platform.issuer/audience`)을 공유** → 어긋날 수 없음. `sub`=**우리 DB users.id**(Keycloak sub 아님) — 플랫폼 내부 신원은 우리 DB 기준, IdP 교체 내성.

**`JwksController`** (게시판): `new JWKSet(rsaKey.toPublicJWK()).toJSONObject()` — **`toPublicJWK()`가 생명**(빼면 개인키 공개 대참사). 분산 검증의 토대: 각 서비스가 견본을 한 번 받아 자체 검증 → auth-server 병목/SPOF 아님.

## 3. `user/` — JIT 프로비저닝

users 테이블이 따로 있는 이유: roles·enabled·lastLoginAt 같은 **플랫폼 고유 정보** + 내부 식별자(`users.id`) + IdP 교체 내성. JIT = 사전 등록 없이 **첫 로그인 순간 자동 생성**.

- `User` 엔티티: `keycloak_sub`(unique)가 두 세계의 다리. **email 아닌 sub로 매칭**(email은 변할 수 있고 sub는 OIDC 표준상 불변 — email 매칭 시 계정 쪼개짐). roles는 콤마 문자열(`"USER,ADMIN"`) + 수동 getRoles/setRoles 번역 — 테이블 정규화 대신 실용 선택(대가: 역할 기반 SQL 검색 어려움). 불변 필드(id·keycloakSub·createdAt)엔 @Setter 없음. protected 기본 생성자는 JPA 전용.
- `UserService.provision()`: `findByKeycloakSub().orElseGet(() -> new User(sub))` **upsert 패턴** — 없으면 INSERT(id 최초 발급), 있으면 UPDATE. **매 로그인마다 프로필 전체 덮어쓰기** = Keycloak이 source of truth, 로그인 시점 lazy 동기화(실시간 sync 채널 불필요).
- `enabled` 필드는 현재 **어디서도 안 읽음** — 차단 기능용 예약석.

## 4. `token/` — RT 회전 + 재사용 탐지 (보안 백미)

**`RefreshToken` 엔티티**: `token_hash`(**원문 미저장** — DB 유출돼도 refresh 불가, 원문은 사용자 쿠키에만. 32바이트 순수랜덤이라 salt/bcrypt 불요), `family_id`(로그인 1회 = 가족 1개, 회전해도 승계), `replaced_by`(A→B→C 사슬), `kc_id_token`/`kc_refresh_token`(백채널 로그아웃용 동봉, V2 마이그레이션, 패밀리 내내 승계), `revoked`, `expires_at`. id는 앱 생성 UUID(save 전 상호 참조 필요).

**`RefreshTokenRepository`**: `revokeFamily` = `@Modifying` 벌크 UPDATE 한 방. `flushAutomatically/clearAutomatically`로 영속성 컨텍스트-DB 불일치 예방. `@Param` 명시(-parameters 미컴파일 대비).

**`RefreshTokenService`**:
- `newRawToken()`: **SecureRandom**(Random 금지 — 예측 가능) 32바이트 → Base64url 43자.
- `issue()`: 새 토큰 + **새 familyId**(가족 탄생은 여기뿐). 원문은 호출자 반환(쿠키행), DB엔 해시만.
- `rotate()`: **RT는 일회용.** 검증(폐기? 만료?) → 새 토큰 발급(가족 승계) → 옛 토큰 `revoked=true` + `replacedBy` 기록.
- **재사용 탐지**: `revoked && replacedBy != null`인 토큰이 다시 제시됨 = 복사본 존재의 물증(정상 세계에선 불가능). 도둑과 진짜 사용자를 구별할 수 없으므로 → `revokeFamily()` **가족 전체 폐기** + `ReuseDetectedException`. 진짜 사용자는 재로그인으로 복구(약간의 불편 vs 계정 탈취).
- 분기 주의: `revoked && replacedBy == null` = 가족 몰살에 휘말린 옛 현역 → 도난 재판정 아닌 단순 무효(`IllegalArgumentException`). **예외 타입 자체가 정보.**
- `revokeFamilyByRawToken()`(로그아웃): 가족 폐기 + 보관하던 **KC refresh_token 반환**(백채널용). 못 찾으면 null — 로그아웃은 멱등, 예외 안 던짐.
- ⚠️ 회전 시 `expiresAt = now + 14일`로 **매번 갱신 = sliding 만료**. 계속 쓰면 세션이 영원히 산다(절대 상한 없음) — 커스텀 포인트 §9-6.

**`CookieFactory`**: RT 쿠키 4중 방어 — `HttpOnly`(XSS로 못 읽음) · `Secure`(운영 true) · `SameSite=Lax`(CSRF 방어 — webChain csrf off의 근거; cross-site 배포 시 None+Secure 필요) · **`Path=/api/auth`**(refresh/logout에만 실림, 노출 면적 최소화). `deleteCookie()` = 같은 이름·같은 Path에 `maxAge(0)` 덮어쓰기(Path 다르면 삭제 안 되는 고전 함정 회피).

## 5. `auth/` 로그인 성공 — OidcClaims + LoginSuccessHandler

**`OidcClaims`** (정적 유틸): Keycloak 특화 claim 추출.
- `roles()`: `realm_access.roles`(**Keycloak 전용 구조** — 표준 OIDC 아님. IdP 교체 시 수정 1순위). instanceof 패턴매칭으로 방어적 파싱, 없으면 빈 리스트.
- `provider()`: `identity_provider` claim(KC가 구글 브로커링하면 "google") → 대문자, 없으면 "KEYCLOAK".

**`LoginSuccessHandler.onAuthenticationSuccess()`** — 지금까지의 부품이 조립되는 곳:
1. `userService.provision(...)` — JIT upsert (§3).
2. KC `id_token`은 OidcUser에서, KC `refresh_token`은 **OidcUser가 아니라 `OAuth2AuthorizedClientService`에서** 꺼낸다(Spring이 토큰 응답을 authorized client에 보관 — 위치가 다른 게 함정 포인트).
3. `refreshTokenService.issue(...)` — RT 발급, KC 토큰 동봉 저장 (§4).
4. RT 쿠키 set → 리다이렉트.
- **자체 AT는 여기서 안 준다.** 리다이렉트 URL 쿼리에 토큰을 실으면 히스토리/로그에 남으므로, 프론트가 마운트 후 `/api/auth/refresh`로 받는 **silent restore** 설계.
- `post_login_redirect` 쿠키(returnTo): 프론트가 로그인 직전 심음 → 여기서 소비+삭제(일회용). **오픈 리다이렉트 방어**: `startsWith("/") && !startsWith("//")`만 허용(`//evil.com`은 스킴 상대 URL이라 차단), 실패 시 `/app` 폴백.

## 6. `auth/` API — AuthController · MeController · KeycloakLogoutClient

**`AuthController`** (`/api/auth`, permitAll이지만 쿠키를 직접 검증):
- `POST /refresh`: 쿠키 없으면 401 `no_refresh_token`. `rotate()` 성공 → 새 AT(body `{accessToken}`) + 새 RT 쿠키(Set-Cookie). **`ReuseDetectedException | IllegalArgumentException` → 동일 401 + 쿠키 삭제** — 실패 사유를 클라이언트에 구별해주지 않음(정보 노출 최소화), 서버 로그에서만 구별.
- `POST /logout`: `revokeFamilyByRawToken()` → 반환된 KC refresh_token으로 `keycloakLogoutClient.logout()` → 쿠키 삭제 → `{}`. 브라우저 리다이렉트 불필요.

**`MeController`** (`GET /api/me`, apiChain 소속): `@AuthenticationPrincipal Jwt` — **DB 조회 0회**, 토큰 claim만 읽어 `{sub,email,name,provider,role}` 반환(role = roles 첫 원소 단수화). stateless 리소스서버 소비 예시.

**`KeycloakLogoutClient`** — 백채널(서버-서버) 로그아웃:
- 우리 세션 폐기만으론 **KC SSO 세션이 살아있어** "로그아웃했는데 재로그인이 즉시 됨" 문제 → KC `end_session`(`/protocol/openid-connect/logout`)을 `client_id+client_secret+refresh_token` form POST로 직접 호출(컨피덴셜 클라이언트라 가능).
- 프론트채널(id_token_hint 리다이렉트) 방식은 **id_token 만료 시 세션을 못 끊어** 폐기했다(실측).
- **best-effort**: 실패해도 예외 안 던짐(경고 로그만) — 로컬 세션은 이미 정리됐으니 로그아웃은 성공 처리. KC 죽었다고 로그아웃 500 내지 않는다.
- Boot 4는 `RestClient.Builder` 빈 자동구성 안 함 → `RestClient.create()` 직접 생성.

## 7. `config/ContainerClientRegistrationConfig` — docker split-horizon (심화)

컨테이너 환경의 근본 문제: **브라우저는 `localhost:8080`으로, 컨테이너는 `keycloak:8080`으로** 같은 Keycloak에 닿는다. KC는 토큰 `iss`를 **브라우저 인가 요청 호스트**(localhost:8080)로 발급(E2E 실측) → Boot의 issuer-uri 디스커버리가 성립 불가(어느 쪽으로 해도 접근 불가 or metadata iss 불일치로 기동 실패).

해법: `@Profile("docker")`에서 `ClientRegistration`을 **수동 구성**(빈이 있으면 Boot 자동 디스커버리 백오프):
- 브라우저가 가는 곳(`authorizationUri`) + `iss` 검증 기준(`issuerUri`) = `KEYCLOAK_FRONT_ISSUER`(localhost).
- 서버-서버(`tokenUri/jwkSetUri/userInfoUri`) = `KEYCLOAK_ISSUER_URI`(keycloak:8080).
- `provider.keycloak.issuer-uri` 프로퍼티는 유지 — `KeycloakLogoutClient`가 백채널 URL로 주입받음(docker에선 내부 DNS 값이어야).

교훈: **"URL 하나"라는 가정은 컨테이너에서 깨진다.** OIDC 컴포넌트마다 "누가 접근하는 URL인가(브라우저 vs 서버)"를 구분해야 한다.

---

## 8. 최종 평가

### 강점 — 템플릿으로 쓸 가치가 충분하다

1. **표준 보안 패턴의 교과서적 조합.** RT 회전+재사용 탐지(OAuth2 BCP 권고), 해시만 저장, 쿠키 4중 방어, aud 검증, 오픈 리다이렉트 방어, silent restore(URL에 토큰 안 실음), 백채널 로그아웃까지 — 상용 수준 체크리스트를 거의 다 밟았다.
2. **"IdP 위임 + 자체 토큰" 구조 자체가 재사용성의 핵심.** 내부 서비스들은 auth-server의 JWT 계약(iss/aud/jwks)만 알면 되고, IdP(Keycloak)는 뒤에 숨는다. IdP 교체·멀티 IdP 확장이 국소 수정으로 끝난다.
3. **작다.** 소스 15파일, 파일당 단일 책임, 패키지 경계 명확(jwt/user/token/auth/config). 전체를 하루에 이해 가능 = 포크해서 고치기 좋음.
4. **발급↔검증이 같은 설정값을 공유**해 어긋날 수 없는 구조. 리소스서버가 늘어나도 `issuer/audience/jwks-uri` 3개만 맞추면 됨.
5. 실측 기반 함정 회피가 문서화돼 있음(split-horizon, prefer-ip-address, Boot 4 flyway 모듈, 프론트채널 로그아웃 폐기 사유).

### 약점 / 개선점 (2026-07-18 심층 분석, 심각도 순)

> 상세판(위치·수정 스케치·착수 순서 포함): [[topics/backend/auth-server-improvements|auth-server-improvements]]

**P0 — 운영 전 필수:**
1. ⭐ **`rotate()` 동시성 구멍** — check(revoked 확인)와 set(폐기) 사이가 비원자적(READ_COMMITTED). 같은 RT로 동시 요청 2개가 둘 다 통과 → 살아있는 토큰 2개. (a) 도둑이 사용자와 같은 순간 refresh하면 **재사용 탐지가 조용히 우회**, (b) 정상 멀티탭이 **도난으로 오판돼 가족 전멸**(single-flight는 탭 내에서만 유효). 해법: 조건부 UPDATE(`WHERE revoked=false` + 영향행 검사) 또는 `@Lock(PESSIMISTIC_WRITE)`, 오탐 완화는 grace period(10~30초, Auth0식).
2. **재사용 탐지 이벤트 무로깅** — ReuseDetectedException을 서비스는 던지기만, 컨트롤러는 401로 바꾸기만. **log 0줄** = 계정 탈취 시도를 운영자가 영원히 모름. catch 분기 나눠 warn 로그(userId/familyId) + 메트릭. 몇 줄 수정.
3. **키 관리 dev 수준** — 개인키 평문 파일(권한 미설정), JWKS 키 1개라 로테이션 불가(kid는 있으나 디코더가 단일 키 고정). 운영: 시크릿 매니저 + 키 리스트(현역1+유예N) JWKS 게시 + kid 선택 디코더.
4. **`enabled` 장식** — `rotate()`가 안 봐서 차단해도 14일간 refresh 가능. 검사 1줄 + `revokeAllByUserId`. 몇 줄 수정.

**P1 — 권장:**
5. **RT sliding 만료** — 회전마다 +14일 리셋 = 절대 세션 상한 없음(도난 세션도 영구 연장 가능). `family_created_at` 승계 + 상한 검사.
6. **KeycloakLogoutClient 타임아웃 없음** — `RestClient.create()` 기본값. KC가 행(hang)하면 로그아웃 스레드 동반 행 → 스레드풀 고갈. best-effort 철학이 예외는 삼키지만 행은 못 삼킴. connect/read 2~3초 설정. 몇 줄 수정.
7. **RT 청소 배치 없음** + 청소의 함정: 폐기 행이 재사용 탐지의 증거물이라 성급히 지우면 탐지 강등. **가족의 최신 expires_at 경과 기준** 가족 단위 삭제.
8. **스케일아웃**: 키 파일 분열(3과 동일 해법) + OIDC state 인메모리 세션 → sticky/Spring Session/쿠키 기반 AuthorizationRequestRepository.

**P2 — 선택:** JWKS Cache-Control 없음 · `/api/me` role=roles.get(0)(KC 순서 비보장, 대표역할 흔들림) · AT에 PII(email/name — 의도된 트레이드오프) · PKCE 미적용(OAuth 2.1 방향) · 테스트 H2(Testcontainers 권장) · refresh rate limit(게이트웨이 레벨 적절). KC refresh_token 패밀리 승계 — KC idle 만료 후 end_session 실패 가능(best-effort라 동작 지장 없음).

**가성비 최상은 2·4·6(각 몇 줄).** 가장 교훈적인 건 1 — "보안 기능이 있다"와 "경쟁 조건에서도 성립한다"는 다르다. `family_id` 인덱스는 V1에 이미 있음(확인).

**총평: 학습용을 넘어 실전 스타터로 쓸 수 있는 품질.** 위 약점은 "설계 결함"이 아니라 "dev 기본값" — 구조를 바꿀 필요 없이 지점 수정으로 해결된다. 템플릿 적합성 상(上).

## 9. 템플릿 커스텀 포인트 (프로젝트마다 바꾸는 곳)

| # | 항목 | 위치 | 내용 |
|---|---|---|---|
| 1 | **신원 정보** | `application.yml` env | realm·client-id/secret·issuer·audience·frontend-url·DB·포트. 코드 무수정, env만으로 끝나게 설계됨 |
| 2 | **IdP 교체** (Okta/Cognito/Auth0…) | `OidcClaims` ⭐ | `realm_access.roles`·`identity_provider`는 **Keycloak 전용** — IdP별 claim 매핑 재작성. + `KeycloakLogoutClient`의 end_session 경로/파라미터도 IdP별 상이. yml `issuer-uri`는 교체만 |
| 3 | **JWT claim 확장** | `JwtService` + 리소스서버 합의 | tenant_id·부서 등 추가. aud 검증하는 모든 서비스와 계약 동기화 |
| 4 | **roles 소스 전환** | `UserService.provision` | KC roles 동기화를 끊고 자체 DB 권한 관리로: provision에서 `setRoles` 제거(최초 기본값만), 관리 API 추가. 콤마 문자열 → 역할 검색 필요해지면 정규화 테이블 |
| 5 | **MSA 부속 제거** | build.gradle·yml | 단독 사용 시 eureka 의존성·설정 삭제, 게이트웨이 없으면 `forward-headers-strategy` 제거 + CORS를 여기서 직접 설정(현재는 게이트웨이 담당 전제) |
| 6 | **세션 정책** | yml·`RefreshTokenService` | TTL 2개는 env. 절대 상한 필요 시 family 생성시각 기준 만료를 `rotate()`에 추가 |
| 7 | **키 관리 승격** | `JwtKeyProvider` | 파일 → env/시크릿 매니저 주입. 로테이션 구현 시 JWKS 다중 키 + kid 매칭(뼈대는 이미 kid 있음) |
| 8 | **스케일아웃** | 인프라 | 키 공유(7과 동일 해법) + Spring Session Redis(webChain state) |
| 9 | **사용자 차단** | `rotate()` | `user.isEnabled()` 검사 + 즉시차단 원하면 AT TTL 단축 고려 |
| 10 | **운영 위생** | 신규 | 만료 RT 청소 스케줄러, refresh rate limit, 감사 로그(ReuseDetected 알림) |

## 10. 적용 절차 체크리스트

**서버 쪽:**
1. repo 복제 → 패키지명(`com.platform.authserver`)·`spring.application.name` rename.
2. Keycloak(또는 IdP): realm 생성, **컨피덴셜 클라이언트**(secret 발급, redirect `{gateway}/login/oauth2/code/keycloak`). 구글 SSO는 KC identity provider 브로커링으로.
3. Postgres 준비 → Flyway V1·V2 자동 적용 확인(`ddl-auto: validate`가 검문).
4. env 주입(§9-1) → 기동 → `/.well-known/jwks.json` 응답으로 확인.
5. `auth-jwk.json` gitignore 확인(개인키!). 운영 배포 전 §9-7.

**리소스서버 쪽(각 서비스 공통 3줄 계약):**
- `jwk-set-uri` = auth-server `/.well-known/jwks.json` · `iss` = `platform.issuer` · `aud` = `platform.audience` 검증. roles→ROLE_ 컨버터는 SecurityConfig 것 복사.

**프론트 쪽 계약 (이 템플릿의 암묵 요구사항):**
- AT는 **메모리에만** 보관(localStorage 금지 — XSS면 끝).
- 마운트 시 `POST /api/auth/refresh`로 silent restore.
- API 401 → refresh 1회(**single-flight**: 동시 401들이 refresh를 한 번만 타게 — 회전 때문에 병렬 refresh는 재사용 탐지를 오발시킴) → 재시도, 그래도 실패면 로그인 화면.
- 로그인 시작 = `{gateway}/oauth2/authorization/keycloak` 이동(`?kc_idp_hint=google` 직행 옵션). 복귀 경로는 `post_login_redirect` 쿠키(상대경로만).
- 로그아웃 = `POST /api/auth/logout` 후 메모리 AT 폐기.

**검증 시나리오(수동 E2E):** 로그인→`/app` 복귀→refresh로 AT 수령→`/api/me` 200→refresh 재호출(회전 확인)→**옛 쿠키로 재요청 시 401+가족 전멸 확인**→logout→KC 재로그인이 비번을 다시 묻는지(백채널 성공 여부).
