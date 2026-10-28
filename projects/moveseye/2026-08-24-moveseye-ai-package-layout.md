---
tags: [moveseye, moveseye-ai, spring-boot, package-structure]
created: 2026-08-24
---

# moveseye-ai HTTP 패키지 경계 정리

`moveseye-ai`는 기능별 도메인 패키지(`artifact`, `docs`, `insight`, `usage`, `llm/settings`, `dev`)를 유지하되, HTTP controller는 각 도메인의 `api/` 하위로 분리한다.

- 도메인 루트에는 서비스·저장소·카탈로그처럼 재사용되는 애플리케이션 로직만 둔다.
- controller는 `api/`에만 둬 HTTP 요청/응답·인증 진입점이라는 역할을 파일 위치로 드러낸다.
- 기존 `chat/api`와 동일한 규칙이므로 새 기능도 controller를 도메인 루트에 추가하지 않는다.
- package 이동은 Spring component scan과 URL 매핑을 바꾸지 않으며, `gradlew test`로 import·컨텍스트 로딩을 확인한다.

관련: [[2026-08-19-ai-assistant-mcp]], [[2026-08-21-ai-assistant-resilience-phase1]]

## 기능 추가 시 영향 범위

새 운영 기능을 AI와 MCP에서 모두 제공할 때, 기능 구현을 두 번 만드는 것이 아니라 `AiTool` 구현을 한 번 추가하고 채널별 노출을 확인한다.

```text
BE API 계약 변경 또는 신규 API
        ↓
moveseye-ai tool/{domain}/ 새·수정 AiTool (BE 호출, 입력 schema, 결과 축약, tier)
        ↓
ToolRegistry
   ├─ chat/engine: 채팅에서 자동 사용
   └─ mcp/: MCP 노출 목록과 OAuth 권한으로 외부 AI가 사용
```

- BE API의 내부 구현만 바뀌고 AI 서버가 사용하는 요청·응답 계약이 유지되면 AI와 MCP 수정은 필요 없다.
- AI Tool이 새 BE API를 호출하거나 기존 Tool의 입력·응답·권한이 바뀌면 해당 Tool을 수정하고, 채팅과 MCP 노출 여부·schema·설명을 함께 확인한다.
- 채팅 전용 또는 MCP 전용으로 의도한 기능이면 Tool 등록/노출 조건을 분리한다. 두 채널 모두 노출이 기본값은 아니다.
- WRITE/DESTRUCTIVE 기능은 `ToolTier`, 채팅 확인 카드, MCP의 사용자 권한(`READ`/`READ_WRITE`)과 BE 최종 권한 검사를 모두 검토한다.
