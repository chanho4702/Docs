---
tags: [moveseye, design, ai, monitoring]
updated: 2026-08-24
---

# 2026-08-24 — AI 계정 모니터링 설계 v1 확정

## 무엇을

모니터링 제품으로서 **"AI 계정"을 감시 대상으로 편입**하는 신규 기능 축을 설계하고 확정했다. Langfuse류 개발자 트레이싱이 아니라 **운영 감시** — 조직의 AI 지출·활용률·이상 징후를 기존 축(수집→시계열→대시보드→알람)에 태운다. 설계 정본 `C:\solutions\_workspace\devdesign_ai-account-monitoring.md`.

## 구조 결정

- **2경로 1스키마**: A=폴링(Anthropic Admin API usage/cost/키 인벤토리 + OpenAI usage/costs — Admin 키 필요) / B=수신(Claude Code OTel 메트릭). 저장·화면·알람은 공용, 수집원만 `source` 필드로 구분.
- 위치는 **BE 일반 기능**(AWS CE 연동과 같은 급). 엔진 포트 승격 안 함 — 호스트 메트릭과 질의 모양이 달라 기존 포트에 안 맞는다.
- 알람 4종(예산/급증/미사용 키/수집 실패)은 기존 알림 채널 재사용.

## 사용자 결정 (전건 확정)

- M1은 **Anthropic + OpenAI 동시**.
- **일반 에디션**(premium 게이팅 없음).
- **Copilot/Cursor 범위 제외** — 조직 플랜 미보유라 실검증 불가. "공식 API가 있어도 실계정으로 검증 못 하면 스코프에 안 넣는다"는 원칙 적용.

## 조사에서 확정된 사실 (설계를 바꾼 것)

- **Claude Code OTel은 `http/json` 프로토콜 공식 지원** → BE가 protobuf/grpc 의존성 없이 일반 JSON 컨트롤러로 수신 가능. 수신형 구현 난이도가 한 단계 내려갔다.
- 프로바이더 **잔액 조회 API는 없다**(양사 공통) → "관리자 입력 예산 − 집계"로 대체. moveseye-ai `ai_usage` 때와 같은 결론에 다시 도달.
- **Anthropic AWS(Bedrock) 조직엔 Usage/Cost API 미제공**, Claude Enterprise는 별도 **Enterprise Analytics API**(사용자별 귀속) — M3 후보.
- 개인 구독 플랜(Pro/Max, ChatGPT Plus)은 폴링 경로가 공식적으로 없음 — 스크래핑 금지, 범위 밖 명시.
- 설치형 제약: 폴링형은 고객사 아웃바운드 인터넷 필요 → 폐쇄망 고객은 수신형만 가능. 화면이 안내해야 한다.

## 테스트 전제

"공식 API가 있다 ≠ 검증됐다"(이 레포 반복 교훈). 착수 전 준비물(사용자 액션): **Anthropic Admin 키 발급 + OpenAI Admin 키·소액 크레딧**. Anthropic은 moveseye-ai 사용량이 이미 쌓여 있어 테스트 트래픽 불요, Claude Code는 우리 개발 환경 자체가 테스트 장비.

관련: [[2026-08-20-ai-usage-metering]](자체 어시스턴트 계량 — 예산−집계 패턴의 선례), [[2026-08-21-architecture-audit]](설치형 제약)
