---
tags: [moveseye, ai, monitoring, frontend]
updated: 2026-08-22
---

# AI 알람 인텔리전스 별도 화면

## 결정

AI 어시스턴트의 채팅과 분리해, 운영자가 정기적으로 보는 알람 요약을 `/ai-assistant/alert-intelligence` 별도 화면으로 제공한다. 사이드바는 `AI 어시스턴트 > AI 어시스턴트 / 알람 인텔리전스` 하위 구조로 구성한다.

## 원칙

- 서버가 집계한 수치(`total`, `unacknowledged`, `repeatingProblems`, severity·host·problem 분포)를 화면의 근거로 보여 준다.
- LLM은 수치를 재계산하지 않고 운영 브리핑을 해석한다.
- 화면 진입은 캐시만 조회한다. 사용자가 `지금 분석` 또는 `분석 새로고침`을 눌렀을 때만 LLM을 호출한다.
- 심층 조사는 채팅으로 넘기고, 원본 Problem 목록은 기존 알람 화면으로 이동한다.

## 현재 범위와 다음 단계

기존 `GET /ai/insights/alerts`의 aggregate 응답으로 구현했다. 현재 top host/problem에는 식별자가 없으므로 상세 Problem으로 곧바로 드릴다운할 수 없고, 전체 Problem 목록으로만 연결한다. 개별 근거 링크가 필요해지면 응답에 안전한 problem/host 식별자와 기간 필터를 추가하는 별도 계약이 필요하다.

관련: [[projects/moveseye/2026-08-20-ai-usage-metering|2026-08-20-ai-usage-metering]] [[projects/moveseye/2026-08-21-ai-assistant-resilience-phase1|2026-08-21-ai-assistant-resilience-phase1]]

## 런타임 교훈 (2026-08-22)

Anthropic adaptive thinking 모델에서 동기 `ChatModel.call()`은 텍스트 본문이 비어 있는 응답을 반환할 수 있었다. 알람 요약도 채팅과 동일하게 `stream()`과 `MessageAggregator`로 텍스트 delta를 수집해야 안정적으로 저장된다. 설정 연결 테스트는 짧은 `OK` 응답까지 확인해야 하며, 실제 요약 생성 검증을 대체하지 않는다.
