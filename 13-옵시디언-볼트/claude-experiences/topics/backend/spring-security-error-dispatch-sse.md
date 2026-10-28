---
type: topic
tags: [topic, backend, spring-security, sse, tomcat, dispatcher, lesson]
created: 2026-09-29
updated: 2026-09-29
---

# SSE 클라이언트가 끊기면 Tomcat ERROR 디스패치가 인증에 걸린다 — ASYNC만 열면 부족하다

> 메모리 `sse-error-dispatch-permit`에서 추출. BE master `9b858be`(#ZM-128, 2026-09-29). 사례: [[2026-09-07-zm123-load-relief-epic]](ZM-128 SSE)

## 현상
SSE 도중 클라이언트가 끊기면 Tomcat이 async 오류 상태로 ErrorPage(`/error`)를 **ERROR 디스패치**로 include → `JwtAuthFilter`는 그 통로를 안 돈다(`shouldNotFilterErrorDispatch`) → `anyRequest().authenticated()`에 걸림 → 응답은 이미 커밋돼 `Exception Processing [ErrorPage]` ERROR 로그. 사용자 영향 0, 순수 로그 오염. 사용자 목적은 "우리 서비스 에러 로그 안 보이게".

## 해결
`SecurityConfig.dispatcherTypeMatchers(ASYNC, ERROR).permitAll()` — ZM-128 때 "ASYNC만 열고 ERROR는 열지 않는다"고 결정했던 것을 뒤집음. `AsyncDispatchSecurityTest` 4건(ERROR 통과 + **직접 GET `/error`는 401**).

## 판별법
- 스택에 `AsyncContextImpl.setErrorState → StandardHostValve.throwable`이 보이면 ERROR 디스패치 경로(ASYNC와 다름).
- `/error` 직접 GET은 REQUEST 디스패치라 여전히 인증에 걸린다 → permitAll이 우회로가 되지 않는다.
- dev BE는 재기동 전까지 옛 코드라 로그가 계속 보인다(재기동은 명시 요청 시).

## 관련
[[session-auth-hardening]] · [[2026-09-28-apm-ingest-resilience]](SSE `ContextClosedEvent` 종료) · [[2026-09-23-apm-p5-realtime]]
