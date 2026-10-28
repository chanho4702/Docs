---
tags: [backend, auth, security, jwt, refresh-token, improvement-plan]
updated: 2026-07-18
---

# auth-server 개선점 정리 (실행 계획)

> 대상: `C:\MSA_SAMPLE_PROJECT\auth-server` — 본 분석: [[auth-server-oidc-jwt-template]] (코드 완전 분석 §8 요약의 상세판)
> 2026-07-18 심층 분석. 전부 **구조 변경 없는 지점 수정**으로 해결 가능 — 템플릿 골격은 건강함.

## 요약표

| 순위 | # | 항목 | 심각도 | 수정 규모 | 한 줄 요지 |
|---|---|---|---|---|---|
| P0 | 1 | rotate() 동시성 구멍 | 🔴 | 중 | 재사용 탐지가 경쟁 조건에서 우회/오탐 |
| P0 | 2 | 보안 이벤트 무로깅 | 🔴 | **소** | 탈취 시도를 운영자가 모름 |
| P0 | 3 | 키 관리/로테이션 | 🔴 | 대 | 개인키 평문 파일, 키 교체 불가 |
| P0 | 4 | enabled 미검사 | 🔴 | **소** | 차단해도 14일간 refresh 가능 |
| P1 | 5 | RT sliding 만료 | 🟡 | 소~중 | 절대 세션 상한 없음(영구 세션) |
| P1 | 6 | RestClient 타임아웃 없음 | 🟡 | **소** | KC 행(hang) 시 스레드풀 고갈 |
| P1 | 7 | RT 청소 배치 없음 | 🟡 | 중 | 무한 증식 + 청소 시 탐지 강등 함정 |
| P1 | 8 | 스케일아웃 제약 | 🟡 | 중~대 | 키 분열 + OIDC state 인메모리 |
| P2 | 9~ | 소소한 것들 | 🟢 | 소 | 아래 §P2 |

**가성비 최상: #2·#4·#6 (각 몇 줄).** 가장 교훈적: #1 — "보안 기능이 있다"≠"경쟁 조건에서도 성립한다".
확인 완료 사항: `family_id` 인덱스는 V1에 이미 존재(`idx_refresh_family`) — 성능 우려 아님.

---

## 🔴 P0 — 운영 투입 전 필수

### 1. `rotate()` 동시성 구멍 — 재사용 탐지 우회 + 정상 사용자 오탐

- **위치**: `token/RefreshTokenService.java:42-66`
- **문제**: check(revoked 확인)와 set(폐기 표시) 사이가 비원자적. 기본 격리수준(READ_COMMITTED)에서 같은 RT로 동시 요청 2개가 **둘 다** `revoked=false`를 읽고 통과 → 살아있는 토큰 2개, 예외 없음.
- **영향**:
  - (공격) 도둑이 진짜 사용자와 같은 순간 refresh → **재사용 탐지 조용히 우회** — 이 메커니즘이 막으려던 바로 그 상황에서.
  - (오탐) 멀티탭(쿠키 공유)에서 탭 B가 살짝 늦게 옛 토큰 사용 → 도난 오판 → **가족 전멸 = 정상 사용자 강제 로그아웃**. 프론트 single-flight는 탭 내에서만 유효.
- **개선안** (택1 + 선택적 보강):
  ```java
  // (a) 조건부 UPDATE — check-and-set을 DB 원자 연산으로
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("update RefreshToken t set t.revoked = true, t.replacedBy = :nextId " +
         "where t.id = :id and t.revoked = false")
  int markRotated(@Param("id") UUID id, @Param("nextId") UUID nextId);
  // rotate()에서: 영향 행 0이면 "누가 먼저 돌림" → 재사용 경로 처리

  // (b) 또는 비관적 락 — 같은 토큰 행 rotate 직렬화 (코드 변경 최소)
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<RefreshToken> findByTokenHash(String tokenHash);
  ```
  - (보강) **grace period**: `replaced_at` 컬럼 추가, 교체 후 10~30초 내 재사용은 도난이 아닌 경쟁으로 관용(Auth0 등 상용 IdP 방식) → 오탐 해소.

### 2. 재사용 탐지 이벤트 무로깅

- **위치**: `auth/AuthController.java:54-57` (catch), `token/RefreshTokenService.java:49` (throw)
- **문제**: `ReuseDetectedException` = 계정 탈취 시도 감지라는 최고 등급 보안 이벤트인데, 서비스는 던지기만·컨트롤러는 401 변환만 — **log 0줄**. 예외 타입을 구분해 던져놓고 서버 쪽 소비 코드가 비어 있음.
- **개선안**: 예외에 userId/familyId 실어 던지고, catch 분기 분리:
  ```java
  } catch (ReuseDetectedException e) {
      log.warn("RT 재사용 탐지 — 계정 탈취 의심. userId={}, familyId={}", e.getUserId(), e.getFamilyId());
      // + 메트릭 카운터(reuse_detected_total), 추후 알림 연동
      return unauthorizedWithCookieDelete();
  } catch (IllegalArgumentException e) {
      log.debug("무효 RT: {}", e.getMessage());
      return unauthorizedWithCookieDelete();
  }
  ```
  클라이언트 응답은 지금처럼 **동일 401 유지**(정보 노출 최소화 원칙 보존).

### 3. 키 관리 — 개인키 평문 파일 + 로테이션 불가

- **위치**: `jwt/JwtKeyProvider.java`, `jwt/JwksController.java`, `config/SecurityConfig.jwtDecoder`
- **문제**: ① `auth-jwk.json` 평문 저장, OS 파일 권한 미설정(`Files.writeString` 기본). ② JWKS에 키 항상 1개 → 키 교체 순간 기발급 AT 전원 401. `kid`는 심어뒀지만 디코더(`NimbusJwtDecoder.withPublicKey`)가 단일 키 고정이라 미활용.
- **개선안**:
  - 운영: 파일 대신 시크릿 매니저/env 주입 (`platform.jwk-path` 경로 이미 분리돼 있어 주입 지점 명확).
  - 로테이션: KeyProvider를 키 리스트(서명용 현역 1 + 검증용 유예 N)로 확장 → JWKS에 전부 게시 → 디코더를 `JWKSource` 기반으로 교체해 kid 매칭. AT TTL 15분이라 유예는 하루면 충분.

### 4. `enabled` 미검사 — 차단 무력

- **위치**: `token/RefreshTokenService.rotate()` (`user/User.enabled`는 어디서도 안 읽힘)
- **문제**: 관리자가 DB에서 `enabled=false` 해도 RT가 살아있는 한 14일간 새 AT 수령 가능.
- **개선안**:
  ```java
  if (!user.isEnabled()) {
      throw new IllegalArgumentException("비활성화된 사용자");
  }
  ```
  + 차단 시 즉시 강제 로그아웃용 `@Modifying update ... set revoked=true where userId=:userId` 추가. 즉시성 요건이 강하면 AT TTL 단축 병행.

## 🟡 P1 — 권장

### 5. RT sliding 만료 — 절대 세션 상한 없음

- **위치**: `RefreshTokenService.persist()` — 회전마다 `expiresAt = now + 14일` 리셋.
- **문제**: 2주에 한 번만 접속해도 영구 세션. **도난 세션도 영구 연장 가능.**
- **개선안**: `family_created_at`(또는 `absolute_expires_at`) 컬럼 추가, rotate 시 승계, 검사 1줄: `now < familyCreatedAt + 최대세션(예: 90일)` 아니면 재로그인 유도. V3 마이그레이션 + 몇 줄.

### 6. `KeycloakLogoutClient` RestClient 타임아웃 없음

- **위치**: `auth/KeycloakLogoutClient.java:40` — `RestClient.create()`.
- **문제**: 타임아웃 미설정. KC가 **응답 없이 매달리면** 로그아웃 스레드 동반 행 → KC 장애 시 서블릿 스레드풀 고갈. best-effort 철학이 예외는 삼키지만 **행(hang)은 못 삼킴.**
- **개선안**: connect 2초 / read 3초 정도 설정한 builder로 생성 (Boot 4: `ClientHttpRequestFactoryBuilder` + `ClientHttpRequestFactorySettings`). 세 줄.

### 7. RT 청소 배치 없음 + 청소의 함정

- **문제**: `refresh_tokens` 무한 증식. **단, 함정** — 폐기된 옛 행이 재사용 탐지의 증거물이라 성급히 지우면 도난 토큰이 "알 수 없는 토큰"(단순 401)으로 강등되고 가족 폐기 미발동.
- **개선안**: `@Scheduled` 일 배치로 **가족의 최신 `expires_at`까지 경과한** 가족 단위 삭제(보수적 근사: `expires_at < now - 14일` 버퍼). 보존 기간 = 탐지 유효 기간으로 일치시키는 게 핵심.

### 8. 스케일아웃 제약 2종

- ① 인스턴스마다 키 파일 각자 생성 → 서로 다른 키로 서명(#3과 동일 해법: 중앙 주입).
- ② OIDC `state`/`nonce`가 **인메모리 세션**(webChain) → 콜백이 다른 인스턴스에 떨어지면 로그인 실패. 해법: sticky session / Spring Session(Redis) / **쿠키 기반 `AuthorizationRequestRepository`**(무상태화, 코드로 해결).
- RT는 DB 기반이라 스케일아웃 무관(문제없음).

## 🟢 P2 — 선택

| 항목 | 내용 |
|---|---|
| JWKS 캐시 헤더 | `/.well-known/jwks.json`에 `Cache-Control: max-age` 추가 — 리소스서버 fetch 부하 완화 |
| `/api/me` role 단수화 | `roles.get(0)` — KC roles 순서 비보장이라 refresh마다 대표 역할이 바뀔 수 있음. 우선순위 규칙(ADMIN>USER) 명시 |
| AT에 PII | email/name은 토큰 입수자 누구나 읽음(서명≠암호화). 의도된 트레이드오프지만 규제 환경이면 sub만 싣기 검토 |
| PKCE | 컨피덴셜이라 필수 아니나 OAuth 2.1 방향은 항상 PKCE. Spring 설정으로 활성화 가능 |
| 테스트 H2 | 벌크 UPDATE·TIMESTAMP 등 Postgres 방언 차이 — Testcontainers 실 DB 검증 권장 |
| rate limit | RT 추측은 불가(256비트)라 보안보단 DB 부하/DoS 관점 — 게이트웨이 레벨이 적절 |
| KC RT 승계 만료 | 백채널용 KC refresh_token은 로그인 시점 것을 패밀리 내내 승계 — KC idle 만료 후 end_session 실패 가능(best-effort라 동작 지장 없음, SSO 세션 잔존만) |
| 키 파일 권한 | `Files.writeString` 기본 권한 — POSIX면 600 지정(#3에 흡수) |

## 착수 순서 제안

1. **1시간 코스(가성비 3인방)**: #2 로깅 → #4 enabled → #6 타임아웃. 각 몇 줄, 즉시 효과.
2. **반나절 코스**: #1 동시성(조건부 UPDATE + 테스트로 경쟁 재현) → #5 절대 상한(V3 마이그레이션).
3. **운영 준비 코스**: #3 키 관리 → #7 청소 배치 → #8 스케일아웃(인프라 협의 필요).

검증 아이디어: #1은 `ExecutorService`로 같은 rawToken rotate 2개 동시 실행 → "살아있는 토큰이 정확히 1개"를 단언하는 테스트가 회귀 방지까지 겸함.
