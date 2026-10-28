---
tags: [backend, security, auth, session, jwt, cookie]
updated: 2026-09-17
---

# 세션/인증 보안 강화 패턴 (짧은 access + refresh 회전 + HttpOnly 쿠키)

토큰 기반 인증을 "탈취돼도 피해 작고, 로그아웃/방치는 확실히 끊기고, 상시 사용은 안 끊기게"
만드는 재사용 패턴. 실사례: [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]] (moveseye, Spring+React).

## 핵심 결정
- **access(짧게, 30분) + refresh(길게, 8h) 분리.** access는 stateless JWT, refresh는 **불투명 랜덤 + 서버 상태(Redis)**.
  - refresh를 JWT로 하지 말 것 → JWT는 서버가 못 지운다(무효화 불가). 불투명+Redis라야 로그아웃/탈취 시 즉시 폐기.
- **refresh rotation**: 한 번 쓰면 폐기하고 새로 발급. 훔친 refresh 재사용을 탐지·차단.
- **HttpOnly + Secure + SameSite 쿠키**로 토큰 저장. JS(document.cookie)가 못 읽어 XSS 탈취 차단.
  - access: `Path=/`(모든 API). refresh: `Path=/auth`(refresh/logout에만 전송, 노출면 축소).
- **세션 무효화 경로 확보**: 로그아웃 = 서버 세션키 삭제 + refresh 폐기 + 쿠키 만료. 셋 다.

## 흔한 함정
- **HttpOnly면 FE가 인증상태를 못 읽는다** → 로그인 여부만 나타내는 **비민감 플래그**(localStorage `isAuthenticated`)를
  따로 두고, 실제 검증은 `getMe` 401로. 토큰 값을 FE 상태에 절대 두지 말 것.
- **dev(http localhost)는 Secure 쿠키가 전송 안 됨** → `cookie.secure`를 프로필로 토글(dev=false).
- **SameSite=Strict + 쿠키 인증 ↔ CORS는 `allowCredentials=true` + 오리진 명시**가 한 쌍.
  와일드카드(`*`) 오리진은 credentials와 함께 못 씀(브라우저 거부). 화이트리스트 필수.
  - 참고: localhost는 포트가 달라도 same-site(scheme+eTLD+1 기준) → 5173→3001도 Strict로 쿠키 전송됨.
- **401 자동 refresh는 single-flight + 재시도 가드**: 동시 401 다발에 refresh 1회만, raw 클라이언트로 호출해
  인터셉터 재귀 방지, 원요청에 `_retry` 플래그로 무한루프 차단. refresh 자체 실패 시에만 로그인 이동.

## 곁들이는 기본기 (같이 잡기 좋음)
- **rate limit**: 로그인 실패·OTP 검증에 Redis 고정윈도우 카운터(`INCR` + 첫 증가 시 `EXPIRE`). username 기준.
- **OTP는 반드시 소유자(userId) 바인딩**: code만으로 조회하면 남의 OTP로 타 계정 조작 가능.
- **JWT HS256 시크릿 ≥256bit(32바이트)**: 부팅 시 길이 검증으로 약한 키를 강제 차단.
- **사용자 열거 방지**: 로그인 실패는 "미존재"와 "비번틀림"을 같은 에러로.
- **API 문서(Swagger)는 운영 off**(springdoc.enabled를 프로필로), CORS 화이트리스트로 서버정보 노출 최소화.

## 배포 주의
- 시크릿 교체·쿠키 전환·로그인 응답 계약 변경은 **FE/BE 동시 배포 + 전원 재로그인**을 유발한다. 공지 필요.

## 회수(revocation) 경합 — 2단계 강화 (2026-09-17)

실사례: [[projects/moveseye/2026-09-17-zm157-permission-enforcement|2026-09-17-zm157-permission-enforcement]] (Codex 검수 5회 동안 경합이 한 층씩 더 나옴).
"로그아웃·비번 변경·비활성화하면 **모든 경로에서 즉시** 끊긴다"를 보장하려면 아래가 한 세트다.

- **시각 비교("이 시각 이전 발급 토큰 거부")는 쓰지 말 것** → 같은 밀리초 경계, 회전과 폐기의 교차에서 뚫린다.
  - 대신 **사용자 세대**(Redis `INCR`)를 토큰에 기록, 회전은 세대를 계승, 폐기 = `INCR`.
- **발급은 "기대 세대"를 넘겨 일치할 때만** — 로그인은 자격 증명 검증 **전에** 세대를 읽는다. 아니면 검증~발급 사이에 일어난 폐기 이후의 세대를 받아 세션이 되살아난다.
- **로그아웃은 기기(로그인) 단위 계열(family)로** — 세대는 전 기기용. 로그아웃이 회전과 교차하면 방금 소비된 옛 토큰으로 로그아웃해도 새 토큰이 살아 있다 → 소비 흔적(짧은 TTL)에 계열을 남겨 추적.
- **확인·소비·재발급·세션 복원·삭제는 Lua 한 번** — `GET` 후 `SET`, 키 두 개 따로 `DEL`은 전부 경합이다.
- **DB 상태(ACTIVE·비밀번호)와 Redis 세대를 한 경계로** — 사용자 행 `SELECT … FOR UPDATE` 아래에서 상태 확인 → 비번 검증 → 세대 읽기 → 발급. 쓰기 경로도 **맨 앞에서** 잠그고, 세대 INCR은 **커밋 전**(롤백되면 세션이 끊기는 쪽이라 안전).
  - JPA: EAGER 컬렉션이 있는 엔티티는 `PESSIMISTIC_WRITE` 불가(외부 조인 FOR UPDATE) → 네이티브로 id만 잠금. Hibernate는 UPDATE를 커밋 직전에 flush하므로 "조회 후 수정"만으로는 잠금이 늦다.
  - 로그인 잠금 대기에는 상한(`SET LOCAL lock_timeout`)을 둔다.
- **OTP는 조건부 상태 전환** — `UPDATE … WHERE id=? AND status='ACTIVE'`(0행이면 거부). 무조건 `VERIFIED`로 덮어쓰면 무효화한 OTP가 진행 중 요청으로 부활한다. 재설정은 1회 소비, 이메일 변경 시 미사용 OTP 무효화, 이메일 없는 계정은 OTP 거부.
- **기계 토큰(MCP 등)은 세션 검사 면제라도 요청마다 DB로 상태·권한 재확인** — 그렇지 않으면 토큰 수명(24h)만큼 회수가 늦다.
- **실패한 발급의 정리는 자기 것만** — 사용자 세션을 통째로 지우면 그 사이 성공한 다른 로그인이 끊긴다(compare-and-delete).
- **배포 영향**: 토큰 형식(세대·계열 필드)이 바뀌면 기존 토큰을 거부하게 되어 **전원 1회 재로그인**.
