---
tags: [moveseye, security, auth, spring, react, session]
updated: 2026-07-16
---

# 2026-07-16 로그인/인증 보안 강화 (moveseye-be-spring + moveseyee_fe)

DMOVE(Zabbix 모니터링 대시보드)의 로그인/인증 흐름을 진단해 계정 탈취급 취약점을 잡고,
세션/토큰 아키텍처를 **짧은 access + refresh 회전 + HttpOnly 쿠키**로 재설계한 세션.
관련: [[moveseye]] · [[2026-06-10-spring-conversion]] · [[session-auth-hardening]]

> 배경: "쓰레기 로직/코드 다 바꿀 것 + 서버정보 노출 우려로 보안 신경". Nest 병행이 끝나
> Spring 단독 관리로 전환된 지금은 "원본 계약 1:1 보존" 원칙을 깨고 정상화할 수 있다는 판단.

---

## 진단한 취약점 (심각도순)

원본 NestJS를 계약 보존으로 그대로 포팅한 데서 온 것이 대부분.

| ID | 취약점 | 원인 |
|----|--------|------|
| V1 🔴 | **OTP가 userId 미바인딩 → 타인 비밀번호 변경** | `OtpService.getOtpByField`가 code+type+status로만 OTP 조회, username은 요청값으로 별도 조회 → 둘의 연결 미검증. 내 OTP 코드 + `username=피해자`로 reset-password 시 피해자 비번 변경 |
| V2 🔴 | **로그아웃이 세션/JWT 무효화 안 함** | FE `handleLogout`의 서버호출 주석 처리 + BE `logout`이 Zabbix 세션만 정리(USER_LOGIN_KEY·JWT 방치). 24h JWT가 로그아웃 후에도 유효 |
| V3 🔴 | **로그인/OTP 무차별 대입 방어 없음** | rate limit/lockout 부재. V1과 결합 시 OTP(6자리) 맞히기 현실화 |
| V4 🟡 | 토큰이 JS 접근 쿠키/localStorage | accessToken=일반 쿠키(document.cookie), visitorId=localStorage → XSS 한 번에 둘 다 탈취 |
| V5 🟡 | JWT HS256 시크릿 256bit 미만 | WeakKeyException 회피하려 auth0로 우회(=약한 키 그대로). 실측 .env는 20바이트 |
| V6 🟡 | Redis 세션 TTL ≈1000일 | `60*60*24*1000`초 하드코딩("단위 의심" 주석). 세션 무효화 지점이 사실상 영구 |
| V7 🟡 | CORS 전체 허용 | `addAllowedOriginPattern("*")` + 모든 헤더/메서드 |
| V8 🟢 | refresh token 미구현 | 상수만 있고 로직 없음 → access 만료를 길게(24h) 가져갈 수밖에 |
| V9 🟢 | 로그인 에러가 계정 존재 노출 | USER_NOT_FOUND vs WRONG_USER_OR_PASSWORD 구분 |
| S1 🟡 | Swagger 무인증 전체 공개 | `/api`,`/v3/api-docs` permitAll → 운영에서 API 구조 노출 |

---

## 확정 방향 (사용자 결정)

- **세션**: access 30분 + refresh 8시간(sliding rotation). 모니터링은 상시 표시라 폴링이 계속
  돌아 활성 사용자는 무중단, 방치 8h 후 자동 로그아웃. NOC 월보드 상시표시는 별도 "키오스크 토큰"으로
  분리 권장(일반 세션을 늘리지 않는다).
- **토큰 저장**: HttpOnly + Secure + SameSite=Strict 쿠키(XSS 탈취 차단).
- **순서**: 계약 안 깨는 Phase A 먼저 완료·검증 → 아키텍처 Phase B.

---

## Phase A — 즉시 보안 수정 (계약 유지, 검증 완료)

- **V1**: `AuthService.verifyOtp`에서 `otp.userId == user.id` 검증 추가. 정상 흐름(본인 OTP) 무영향.
- **V3**: `RedisClientService.incrWithTtl`/`getCount` 추가 + `AuthRateLimiter`(신규, username 기준 고정윈도우).
  로그인 실패 10회/15분, OTP 검증 5회/3분. 로그인 성공 시 카운터 리셋.
- **V5**: `JwtTokenProvider` 생성자에서 시크릿 <32바이트면 `IllegalStateException`으로 부팅 차단.
  .env `JWT_SECRET`을 48바이트 hex로 교체(특수문자 회피). ⚠️ Vault도 동일 교체 필요(운영).
- **S1**: `springdoc.*.enabled` 기본 false → dev 프로필만 true. off면 엔드포인트 자체가 매핑 안 됨.
- **V7**: CORS를 `app.cors.allowed-origins`(env, 콤마) 화이트리스트 + `allowCredentials=true`로 전환.
- **V9**: login에서 USER_NOT_FOUND를 WRONG_USER_OR_PASSWORD로 통일(FE는 이미 같은 문구).

**검증(curl, dev :3001)**: 로그인 실패 10회째 `TOO_MANY_REQUESTS`, OTP 6회째 차단, 20바이트 시크릿
기동 실패/96바이트 성공, CORS 허용 오리진만 통과·evil.com 403, 미존재 계정도 동일 에러. 전부 PASS.

---

## Phase B — 세션 아키텍처 재설계 (BE 검증 완료 / FE 코드 완료)

### 토큰 흐름 (before → after)

```
[before] login → body{user, token(JWT 24h)} → FE가 accessToken 쿠키(JS접근) 저장
         이후 요청: axios가 Authorization: Bearer {쿠키} 주입
         logout: FE 쿠키만 삭제(서버 무효화 없음)

[after]  login → Set-Cookie accessToken(JWT 30분, HttpOnly/Secure/SameSite, Path=/)
                + Set-Cookie refreshToken(불투명, HttpOnly, Path=/auth, 8h)
                body는 {user}만
         이후 요청: 쿠키 자동전송(withCredentials). Authorization 주입 없음
         access 만료(401) → FE가 POST /auth/refresh 1회 → 회전된 쿠키로 원요청 재시도
         logout: 서버가 세션(USER_LOGIN_KEY)·refresh 폐기 + 쿠키 만료
```

### BE 변경
- `JwtProperties`: `expirationSeconds` → `accessExpirationSeconds` + `refreshExpirationSeconds`.
- `RefreshTokenService`(신규): refresh=불투명 랜덤(JWT 아님), Redis `REFRESH_TOKEN:{token}`={userId,visitorId,expiresAt}.
  `validateAndRotate`가 **회전**(1회 쓰면 폐기)+visitorId 대조. → 재사용/탈취 차단.
- `AuthCookieFactory`(신규): access(Path=/)·refresh(Path=/auth) HttpOnly 쿠키 생성. `app.cookie.secure`(dev=false).
- `AuthController`: login/refresh는 `Set-Cookie`로 토큰, logout은 쿠키 만료. `/auth/refresh` 신설(public).
- `AuthService`: `login`→`LoginResult(user,access,refresh)`, `refresh`, `logout(currentUser, refreshToken)`.
  `storeSession` TTL=refresh 만료(V6 정상화). `buildPayload` 추출.
- `JwtAuthFilter.resolveToken`: accessToken **쿠키 우선** + Bearer 헤더 폴백.
- `SecurityConfig`: `/auth/refresh` public 추가.
- `LoginResponseDto`: token 필드 제거({user}만).
- 테스트: `AuthServiceTest` 재작성(rate limiter/refresh mock, refresh/logout/rate-limit 케이스 추가). 전체 그린.

**검증(curl)**: 로그인 Set-Cookie 2종(HttpOnly/SameSite=Strict, body에 token 없음), 쿠키로 my-profile 200,
refresh 회전(토큰 바뀜), **옛 refresh 재사용 401**, **visitorId 불일치 401**, **logout 후 refresh 401**. 전부 PASS.

### FE 변경 (`moveseyee_fe`)
- `axiosInstance.ts`: `withCredentials:true`, Authorization 주입 제거, **401→single-flight refresh→원요청 재시도**
  (raw axios로 refresh해 인터셉터 재귀 방지, `_retry` 가드). 세션만료 모달 제거.
- `SignIn.tsx`: token 저장 제거 → `localStorage IS_AUTHENTICATED` 플래그(HttpOnly라 JS가 토큰 못 읽음).
- `useAuth.ts`: accessToken 쿠키 판정 → IS_AUTHENTICATED 플래그.
- `utils/index.ts handleLogout`: 서버 `AuthService.logout()` 복구 + 플래그 제거.
- tsc 통과. **런타임 브라우저 E2E는 Chrome 확장 미연결로 미실행 → 수동 확인 필요(열린 항목)**.

---

## 배포 주의 (중요)

- **시크릿 교체 + 쿠키 전환 + 로그인 응답 계약 변경 → FE·BE 동시 배포 필수. 배포 시 전원 재로그인.**
- Vault `secret/moveseye`의 `JWT_SECRET`도 256bit 이상으로 교체(현재는 dev .env만 교체됨).
- 운영은 https 전제 `app.cookie.secure=true` 유지. CORS `CORS_ALLOWED_ORIGINS`에 실제 FE 오리진 명시.
- SameSite=Strict + 쿠키 인증 ↔ CORS `allowCredentials=true` + 오리진 명시가 한 쌍(와일드카드 불가).

## 열린 항목
- [ ] FE 로그인→방치(자동 refresh)→로그아웃 **브라우저 E2E**(확장 연결 후). dev: FE :5174(.env.local로 3001), BE :3001.
- [ ] Vault JWT_SECRET 교체(운영).
- [ ] 커밋(BE/FE) — 사용자 지시 대기.
- [ ] `.env.local`(FE 임시 3001 오버라이드) 정리.

## 교훈
- "원본 계약 보존"으로 옮긴 코드엔 원본의 **보안 버그**도 함께 온다(V1·V6). 단독 관리 전환은 정상화 기회.
- HttpOnly 전환의 함정: JS가 토큰을 못 읽으니 **인증상태 판단용 비민감 플래그**가 따로 필요.
- dev(http localhost)는 Secure 쿠키가 전송 안 됨 → `cookie.secure`를 프로필로 토글.
- refresh는 JWT보다 **불투명+Redis 상태**가 유리(즉시 폐기 가능 = 로그아웃/탈취 대응). rotation으로 재사용 차단.
- Vite 포트 auto-increment(5173→5174) → dev CORS는 여유 있게.
