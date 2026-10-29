---
name: apm-daily-users-ip-hash
description: "10-12 APM '오늘 사용자 수' 검토만(구현 보류). 와탭식 IP 해시 방향 설명까지. 현재 수집기가 IP 삭제+트레이스 샘플링이라 별도 집계 통로 필요"
metadata:
  node_type: memory
  type: project
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-12T06:25:50.221Z
---

10-12 사용자 질문 "금일 사용자 수 못 보나?" → 조사·코덱스 자문 후 와탭식 IP 해시 방향을 설명만 함. 사용자: "구현까진 안할거라서"(보류).

- 현재 불가 이유: 수집기 `attributes/drop`이 client.address·network.peer.address 삭제, BE `ApmSpanAttrAllowlist`도 거부. 트레이스는 tail_sampling(에러·느림·확률)이라 BE 저장분으로 distinct 세면 과소.
- RUM session_hash는 스니펫 초기화마다 새 UUID(만료 없음) + 화면 값은 차원·5분 합산이라 과다. 서비스별 집계 불가(group_id=페이지 그룹).
- 경쟁사: 와탭=에이전트가 IP 기본(쿠키·JSESSIONID·헤더 옵션), 제니퍼=에이전트 쿠키(문서 본문 미확인), 데이터독=RUM 15분/4시간 세션.
- 와탭식 필요 작업: 수집기에 샘플링 전 사용자 집계 통로(서버 스팬→IP 해시+서비스만), BE 일 dedupe 표·조회 API, FE 카드, 가이드(XFF 프록시·끄기 옵션). 고객은 수집기 설정 재배포. 결정 필요: 기본 켜짐 여부(개인정보), 전송량.
- 코덱스 자문 전문: `_workspace/_archive/features/apm/backlog/apm-daily-users-options_codex-20261012.md`

**How to apply:** 재개 시 위 사실부터 — "BE 쿼리 하나면 된다"로 오판하지 말 것. 착수 전 코덱스에 전송량·개인정보·프록시 설계 검토. 관련 [[apm-alert-channel-decision-2026-10-10]]
