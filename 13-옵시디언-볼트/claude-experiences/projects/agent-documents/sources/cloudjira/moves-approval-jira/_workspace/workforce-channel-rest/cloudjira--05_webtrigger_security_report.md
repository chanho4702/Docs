# webtrigger 보안 검증 보고서 (실측, 2026-10-20)

- 대상: tom-chkim-dev(cloudId 119d766c-…), 승인 앱 development 5.2.0~5.3.0 ↔ 워크포스 moves-rms 10.0.0
- 페어링: 2026-10-20 09:07 사용자가 연결 코드로 연결. 양쪽 "연결됨"(evidence/webtrigger/04·05)
- 공격자 가정: ① webtrigger URL 유출(키 없음) ② 워크포스 서명 키 유출(dev 시험 키 `wf-atk-1`을 승인 앱만 잠시 신뢰, 시험 후 제거·UNTRUSTED_KID 확인)

## 1. URL만 유출 — 두 앱 모두 (evidence/webtrigger/06)

| # | 시나리오 | 승인 앱 | 워크포스 |
|---|---|---|---|
| A1 | GET | 405 METHOD_NOT_ALLOWED | 405 |
| A2 | JSON 아님 | 400 MALFORMED | 400 |
| A3 | 300KB | 413 TOO_LARGE | 413 |
| A4 | 방향 뒤집기 | 400 MALFORMED | 400 |
| A5·A6 | iat ±10분 | 401 STALE_REQUEST | 401 |
| A7 | 모르는 kid | 401 UNTRUSTED_KID | 401 |
| A8~A10 | 서명 없음·0 서명·공격자 키 + 정상 kid | 401 BAD_SIGNATURE | 401 |
| A11 | 사람 actor 사칭(위조 서명) | 401 BAD_SIGNATURE | 401 |
| A12 | 다른 사이트(위조 서명) | 401 BAD_SIGNATURE | 401 |
| A13 | 위조 40건 동시 | 40/40 401 | 40/40 401 |

- 거부 응답은 최소 본문(`{ok:false,error:{code}}`), 서명 헤더 없음, 작업 목록·내부 정보 노출 없음.
- 이 단계(1~8)는 SQL·KVS 0 — 감사(설정 변경) 탭에 공격 흔적이 쌓이지 않음(로그 비용 공격 불가).
- 공격 뒤 "연결 확인" 정상: 승인→워크포스 789ms, 워크포스→승인 1,957ms(evidence/webtrigger/07·08).

## 2. 서명 키 유출 모의 — 승인 앱 (evidence/webtrigger/09)

| # | 시나리오 | 결과 |
|---|---|---|
| B0 | 정상 sys.ping(기준) | 200, 서명 응답, version 5.2.0 |
| B1 | 같은 요청 직후 재전송 | 409 REPLAYED |
| B2 | 서명 뒤 본문 변조 | 400 MALFORMED(서명 전에 형식에서 걸림) |
| B3 | 유효 서명 + 다른 사이트 | 403 SITE_MISMATCH |
| B4 | 유효 서명 + 다른 linkId | 409 STALE_LINK |
| B5 | 유효 서명 + iat 5분 전 | 401 STALE_REQUEST |
| B6 | 받지 않는 작업 | 400 OP_UNKNOWN(서명 응답) |
| B7 | SYSTEM 사유 미허용 | 403 ACTOR_NOT_ALLOWED |
| B8 | 없는 계정 actor 사칭 | ACTOR_INACTIVE(HTTP 200, 서명 응답) — 데이터 없음 |
| B9 | 닫힌 스키마 밖 필드 | 400 MALFORMED |
| 되돌림 | wf-atk-1 신뢰 제거 후 | 401 UNTRUSTED_KID |

## 3. 발견

| # | 심각도 | 내용 | 조치 |
|---|---|---|---|
| V1 | 중(키 유출 전제) | **동시 재전송이 인스턴스를 넘어 통과** — 같은 요청 8건 동시: 1/8, 5/8 이 200. nonce 기록이 인스턴스 메모리라 다른 인스턴스는 모른다. iat 120초 창 안에서만, 유효 서명(키 유출)이 있어야 가능 | 미수정. 쓰기 작업(write.*, pair.complete, sys.rekey/unpair, change.notify)만 KVS nonce(TTL 5분) 조건부 저장으로 막는 안 — 결정 필요 |
| V2 | 낮음 | ACTOR_INACTIVE 등 일부 서명 오류가 HTTP 200 | 표시만, 본문 code 로 분기하므로 동작 영향 없음 |
| V3 | 낮음(수정) | 승인 앱 sys.ping 이 version null → 워크포스 화면 "승인 앱 버전 -" | 5.2.0 에서 수정(appVersion) |
| V4 | 관찰 | 첫 연결 확인 7,033ms(콜드), 이후 0.24~2초 | 6초 예산 근처 — 운영 모니터링 |
| V5 | 관찰 | Forge iframe 안 "복사" 버튼이 자동화 환경에서 클립보드에 안 들어감 | 사용자 직접 페어링은 성공 — 실사용 영향 확인 필요 |

## 4. 결론

URL 유출만으로는 어떤 요청도 핸들러에 닿지 않는다(26종 + 폭주 80건 전부 1~8단계 거부, DB 무접근). 키가 유출돼도 사이트·linkId·iat·작업 허용 목록·actor 정책·스키마가 막는다. 남는 구멍은 V1(키 유출 + 120초 안 동시 재전송)이다.
미실측: 해제 후 호출(NOT_PAIRED — 재페어링 필요해 생략), 권한 없는 활성 사용자 actor(S2b), 워크포스 쪽 유출 키 모의.

## 5. 출처

| 주장 | 근거 |
|---|---|
| webtrigger URL 은 **Forge 플랫폼이 인증하지 않는다** → 인증은 핸들러가 직접(우리: Ed25519 서명) | 공식 [Web triggers (runtime)](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/) "Web trigger URLs are not authenticated by the Forge platform" + 실측(handler `principal: null`, 스파이크 RESULTS) |
| static·dynamic 두 종류, 응답 형식(`statusCode`·`headers`·`body`), 응답에 `X-Ratelimit-*` 기본 헤더 | 공식 [Web triggers (runtime)](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/) · [Web trigger (manifest)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/) + 실측 S14 |
| `webTrigger.getUrl(key, forceCreate)`·URL 조회·삭제(회전) | 공식 [Managing web trigger URLs via SDK](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/) + 실측 W6·S11 |
| **dynamic webtrigger·외부 egress 는 Runs on Atlassian 실격**(D4) | 공식 [Build Runs on Atlassian apps](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/) + `forge deploy` 출력 "not eligible for the Runs on Atlassian program" |
| HMAC 인증 webtrigger | 커뮤니티 [RFC-141](https://community.developer.atlassian.com/t/rfc-141-hmac-authenticated-web-triggers/102029) — 제안 단계, 우리는 쓰지 않음 |
| 위·변조·재전송·사이트·actor 거부 결과(1~3장) | 실측만(evidence/webtrigger) |
