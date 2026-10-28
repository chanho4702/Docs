---
name: no-asapp-preference
description: Jira API 호출은 asApp 지양 — 마켓플레이스 앱 심사 부담. asUser(사용자 컨텍스트) 기반 유지
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 350410a5-f8b7-451b-9de6-5f4a190183c8
---

Jira API 호출에서 `api.asApp()` 사용을 지양하고 `asUser`(사용자 컨텍스트)를 유지한다. (2026-06-11, 배치 401 수정 방향 논의 중 사용자 지시)

**Why:** asApp 권한 사용은 Atlassian Marketplace 앱 심사에서 까다로운 검토 대상이 되어 심사가 번거로워진다.

**How to apply:** 사용자 요청 경로(resolver)에서는 asUser 유지. **단 스케줄 배치는 예외** — 사용자 컨텍스트가 원천 부재라 asApp이 Forge 표준 패턴이고, asApp은 manifest 스코프를 바꾸지 않아 심사에 추가 부담이 없음(2026-06-11 논의로 확정: 일일 배치는 asApp 허용). 적용 방식: 공통 API 모듈 기본값(`as:'user'`)은 불변, 배치 호출 체인에만 `as:'app'` 옵션 전달. 관련: [[analysis-review-2026-06]]의 배치 401(AUTH_TYPE_UNAVAILABLE) 발견.
