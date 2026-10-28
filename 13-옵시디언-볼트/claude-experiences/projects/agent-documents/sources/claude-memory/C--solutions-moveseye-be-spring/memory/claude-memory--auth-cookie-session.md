---
name: auth-cookie-session
description: moveseye-be-spring 인증은 HttpOnly 쿠키+refresh 회전 방식(2026-07-16 재설계). 로그인 응답 body에 token 없음.
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c01e46a-ab6f-4298-8868-b39dc7e63638
---

2026-07-16 로그인/인증 보안 재설계로 원본 NestJS 계약을 의도적으로 깼다. 새 세션 작업 시 전제:

- **토큰 = HttpOnly 쿠키**: `accessToken`(JWT 30분, Path=/), `refreshToken`(불투명 랜덤+Redis, Path=/auth, 8h). 로그인/refresh 응답은 `Set-Cookie`로 내리고 **body에는 token 필드가 없다**(`LoginResponseDto`={user}만). `JwtAuthFilter`는 accessToken 쿠키 우선(+Bearer 폴백).
- **`POST /auth/refresh`**(public): refresh 쿠키 회전(1회용, visitorId 대조). `AuthService.refresh`. 재사용/타기기 → 401.
- **logout**: `AuthService.logout(currentUser, refreshToken)` — USER_LOGIN_KEY 삭제 + refresh 폐기 + Zabbix logout. 세션 TTL=8h(과거 ≈1000일 버그 제거).
- **JWT_SECRET ≥32바이트 필수**(`JwtTokenProvider` 부팅 가드). Vault `secret/moveseye` 미교체 상태(운영 잔여작업). dev `.env`만 96자 hex로 교체됨.
- **CORS**: `app.cors.allowed-origins`(env `CORS_ALLOWED_ORIGINS`) 화이트리스트 + `allowCredentials=true`(와일드카드 불가). 쿠키 Secure/SameSite는 `app.cookie.*`(dev=secure:false).
- **rate limit**: `AuthRateLimiter`(로그인 10/15분·OTP 5/3분, `TOO_MANY_REQUESTS`). **OTP는 userId 바인딩**(`verifyOtp`).
- **Swagger 운영 off**(`springdoc.*.enabled` dev만).
- FE(`moveseyee_fe`)는 `withCredentials`+`isAuthenticated` localStorage 플래그+401 single-flight refresh. 상세: 옵시디언 [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]], 재사용 패턴 [[topics/backend/session-auth-hardening|session-auth-hardening]].

미완: FE 브라우저 E2E(확장 미연결), Vault JWT_SECRET 교체, 커밋. CLAUDE.md 🔐 섹션 참조.
