---
type: feature-map
tags: [moveseye, feature-map, ai, mcp, llm]
updated: 2026-10-19
---

# AI 어시스턴트·MCP — 채팅·툴 카탈로그·확인 게이트·화면 무효화·알람 인텔리전스·LLM 설정·연결된 앱

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — 별도 서버 moveseye-ai(:3100, Boot 4 + Spring AI 2.0). 채팅·툴 카탈로그 75종(BE REST 프록시)·쓰기 확인 게이트·화면 무효화 힌트, 알람 인텔리전스, 사용량 계량, LLM 설정, MCP 서버·OAuth 동의·연결된 앱, AI 계정 모니터링(설계만·보류).

**상태** — 현행. 신설(08-19)·안정성 Phase 1·계량·알람 인텔리전스(08-20~21). APM 툴 8종 추가(09-07). 🔴 Jackson 3·Boot 4라 BE 의존성 복붙 금지.

## 정본 문서 (moveseye-docs)
- [AI 어시스턴트와 MCP(상세 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/features/solutions--AI-%EC%96%B4%EC%8B%9C%EC%8A%A4%ED%84%B4%ED%8A%B8%EC%99%80-MCP.md)
- [MCP 연결 가이드](../../agent-documents/sources/solutions/moveseye-docs/guides/solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- [연결된 앱](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EC%84%A4%EC%A0%95/solutions--%EC%97%B0%EA%B2%B0%EB%90%9C-%EC%95%B1.md)

## 설계·기획 (_workspace)
- [devdesign_ai-assistant](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--devdesign_ai-assistant.md)
- [devdesign_ai-account-monitoring](../../agent-documents/sources/solutions/_workspace/features/ai/ai-account-monitoring/solutions--devdesign_ai-account-monitoring.md)

## 계약 (_workspace/contract_*)
- [contract_ai-assistant](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--contract_ai-assistant.md)
- [contract_ai-assistant-multinode](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--contract_ai-assistant-multinode.md)
- [contract_ai-invalidation](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--contract_ai-invalidation.md)
- [contract_ai-account-monitoring](../../agent-documents/sources/solutions/_workspace/features/ai/ai-account-monitoring/solutions--contract_ai-account-monitoring.md)
- [contract_apm-p3-ai](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--contract_apm-p3-ai.md)

## 보고·검수·QA 증거
- [review_ai-assistant-2026-08-20](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--review_ai-assistant-2026-08-20.md)
- [review_ai-invalidation-and-gate](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--review_ai-invalidation-and-gate.md)
- [review_ai-screen-catalog-sync](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--review_ai-screen-catalog-sync.md)
- [review_ai-tool-coverage](../../agent-documents/sources/solutions/_workspace/features/ai/ai-assistant/solutions--review_ai-tool-coverage.md)
- [review_ai-account-monitoring](../../agent-documents/sources/solutions/_workspace/features/ai/ai-account-monitoring/solutions--review_ai-account-monitoring.md)

## 경험 노트 (Vault)
[[2026-08-19-ai-assistant-mcp]] · [[2026-08-20-ai-usage-metering]] · [[2026-08-21-ai-alert-intelligence]] · [[2026-08-21-ai-assistant-resilience-phase1]] · [[2026-08-24-ai-account-monitoring-design]] · [[2026-08-24-moveseye-ai-package-layout]]

## 열린 항목
- AI 계정 모니터링 구현 0(양사 Admin 키 필요)
- AI 쓰기 무효화 힌트 런타임 미검증
- 실 LLM 대화 미검증(키 없음)

## 이웃 영역
[[apm-조회와-분석]] · [[인증-권한-라이선스]]
