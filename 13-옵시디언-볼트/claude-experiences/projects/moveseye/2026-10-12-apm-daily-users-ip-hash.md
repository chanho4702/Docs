---
type: project
tags: [moveseye, apm, rum, privacy, analysis, held]
created: 2026-10-12
updated: 2026-10-12
status: paused
---

# 2026-10-12 — "오늘 사용자 수 못 보나?" → 와탭식 IP 해시 방향만 설명, 구현 보류

- 프로젝트: [[moveseye]] · 기능 지도 [[apm-조회와-분석]] · 정본 코덱스 자문 `_workspace/_archive/features/apm/backlog/apm-daily-users-options_codex-20261012.md` · 메모리 `apm-daily-users-ip-hash`
- 사용자: "구현까진 안할거라서" → **보류**.

## 지금 못 보는 이유 (조사로 확인)
- 수집기 `attributes/drop`이 `client.address`·`network.peer.address`를 삭제하고 BE `ApmSpanAttrAllowlist`도 거부한다 — IP가 서버에 도착하지 않는다.
- 트레이스는 `tail_sampling`(에러·느림·확률)이라 BE 저장분으로 distinct를 세면 **과소**.
- RUM `session_hash`는 스니펫 초기화마다 새 UUID(만료 없음) + 화면 값은 차원·5분 합산이라 **과다**. 서비스별 집계 불가(group_id = 페이지 그룹).

## 경쟁사
와탭 = 에이전트가 IP 기본(쿠키·JSESSIONID·헤더 옵션) · 제니퍼 = 에이전트 쿠키 · 데이터독 = RUM 15분/4시간 세션.

## 하려면(와탭식)
수집기에 **샘플링 전** 사용자 집계 통로(서버 스팬 → IP 해시 + 서비스만) · BE 일 dedupe 표·조회 API · FE 카드 · 가이드(XFF 프록시·끄기 옵션). 고객은 수집기 설정 재배포. 결정 필요: 기본 켜짐 여부(개인정보)·전송량.

## 재개 시
"BE 쿼리 하나면 된다"로 오판하지 말 것 — 샘플링 전 집계 통로가 본체. 착수 전 코덱스에 전송량·개인정보·프록시 설계 검토.

## 관련
[[2026-10-12-apm-alert-channel-neutral-delivery]] · [[2026-09-16-apm-observability-backlogs]] · [[otel-collector-pitfalls]]
