---
name: qa-minimize-screenshots
description: "QA/검증 시 스크린샷 최소화 — 사용자 지시(2026-07-13). 기본은 API 응답·DOM 어서션, 스크린샷은 시각 판정이 불가피할 때만 최소 장수"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8c2d203c-480c-4c2a-a87f-a4300c252bf7
---

2026-07-13 사용자 지시: functional-qa가 E2E 증거로 스크린샷 17장을 남긴 것에 대해 "너한테 도움 안 되잖아, 토큰 낭비 같은데 불필요하면 하지 마".

**Why:** 스크린샷은 에이전트가 읽을 때 토큰을 크게 소모하는데, 대부분의 검증(필드 값, 목록 렌더, 뱃지 텍스트, 라우팅)은 API 응답·DOM 어서션으로 판정 가능하다. 시각 렌더링 자체가 검증 대상인 경우(레이어 겹침, 색상, 차트 형태)에만 스크린샷이 실제 가치를 가진다.

**How to apply:** 검증·QA 작업(직접 수행이든 에이전트 지시든)에서 기본 수단은 API 응답 발췌 + DOM 어서션 + 재현 명령. 스크린샷은 DOM으로 판정 불가한 시각 항목에만, 해당 판정에 필요한 최소 장수만. "증거용" 습관적 캡처 금지. 하네스 파일에도 반영됨: `.claude/agents/functional-qa.md` 핵심 원칙 + `.claude/skills/fullstack-feature/SKILL.md` Phase3-5 (2026-07-13). 관련: [[assets-core-devdesign]].
