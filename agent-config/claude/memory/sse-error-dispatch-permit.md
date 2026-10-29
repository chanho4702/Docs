---
name: sse-error-dispatch-permit
description: 09-29 BE 9b858be — SecurityConfig가 DispatcherType.ERROR도 permitAll. 끊긴 SSE의 /error include가 AccessDenied+"response already committed" 스택 남기던 로그 오염 제거
metadata:
  type: project
---

2026-09-29 BE master `9b858be`(#ZM-128, 미푸시). `SecurityConfig.dispatcherTypeMatchers(ASYNC, ERROR).permitAll()`.
ZM-128 때 ASYNC만 열고 "ERROR는 열지 않는다"고 결정했던 것을 뒤집음. `AsyncDispatchSecurityTest` 4건(ERROR 통과 + 직접 GET /error는 401).

**Why:** SSE 도중 클라이언트가 끊기면 Tomcat이 async 오류 상태로 ErrorPage(/error)를 ERROR 디스패치로 include → JwtAuthFilter는 그 통로를 안 돎(shouldNotFilterErrorDispatch) → anyRequest().authenticated()에 걸림 → 응답 커밋돼 "Exception Processing [ErrorPage]" ERROR 로그. 사용자 영향 0, 순수 로그 오염. 사용자 목적은 "우리 서비스 에러 로그 안 보이게".

**How to apply:** SSE/비동기 종료 스택에 `AsyncContextImpl.setErrorState → StandardHostValve.throwable`이 보이면 ERROR 디스패치 경로다(ASYNC와 다름). `/error` 직접 GET은 REQUEST라 여전히 인증 걸림 → 우회로 아님. 관련 [[zabbix-load-relief]](ZM-128 SSE), [[no-be-restart-without-ask]](dev BE는 재기동 전까지 옛 코드).
