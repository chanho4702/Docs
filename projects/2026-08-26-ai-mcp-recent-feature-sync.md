# 2026-08-26 AI MCP recent feature sync

- 최근 FE·BE 이력을 기준으로 AI 계정 모니터링(`GET /ai-monitor/usage`)은 제품 화면에만 있고 외부 MCP에는 노출되지 않은 것을 확인했다.
- MCP 확장은 AI 서버의 읽기 전용 도구와 BE `McpAccessInterceptor` 허용 경로를 함께 추가해야 한다. 둘 중 하나만 바꾸면 호출이 막히거나 외부에 노출되지 않는다.
- 민감한 AI 계정 사용량은 MCP의 자체 권한만으로 판단하지 않고, 기존 BE `AdminAccessChecker`를 최종 권한 판정으로 유지한다.
- 과거 FE의 `mcpOverrides` 보조 상태는 BE 목록 응답이 `mcpPermission`을 제공한 뒤에는 정본과 어긋날 수 있으므로 refetch 기반으로 제거했다.
