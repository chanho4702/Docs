---
name: ai-account-monitoring-design
description: "AI 계정 모니터링 — 설계 v1 확정 + M1(폴링형) 구현·QA 완주(2026-08-25, 미커밋·검수대기)"
metadata: 
  node_type: memory
  type: project
  originSessionId: eb10f1b8-0d1a-4ab8-bf2b-f9dcb034f2f4
  modified: 2026-08-26T00:04:32.364Z
---

2026-08-24 신규 기능 축 **확정**: 모니터링 제품으로서 "AI 계정"을 감시 대상으로 — 조직 AI 지출·활용률·이상 감시(Langfuse류 트레이싱 아님). 설계서 v1 확정 `_workspace/devdesign_ai-account-monitoring.md` + **조사 문서**(근거 URL·엔드포인트·OTel env 설정법·미실측 체크리스트 6항) `_workspace/research_ai-account-monitoring.md`.

- **2경로를 한 스키마·한 화면에**: A=폴링(Anthropic Admin API usage/cost/인벤토리, OpenAI usage/costs — Admin 키 필요) / B=수신(Claude Code OTel — **OTLP http/json 공식 지원 확인**이라 BE가 protobuf 없이 JSON POST로 수신 가능, 메트릭 `claude_code.token.usage`·`cost.usage` 등 8종, user.email 귀속).
- 위치: BE 일반 기능(AWS CE급, 엔진 포트 승격 안 함). 테이블 초안 ai_mon_account / ai_mon_usage(마이크로달러 정수) / ai_mon_inventory.
- 🔴 제약: 잔액 API 없음(예산−집계로 대체, [[ai-assistant-design]]의 ai_usage와 동일 판단) · Anthropic AWS(Bedrock) 조직엔 Usage/Cost API 미제공 · 폴링형은 설치형 고객 아웃바운드 인터넷 필요 · 비용 집계는 하루 안팎 지연 · 개인 구독 플랜 폴링은 공식 경로 없음(스크래핑 금지).
- 테스트: Anthropic은 기존 조직(moveseye-ai 사용량이 이미 쌓임)+Admin 키 발급만, Claude Code는 우리 개발 환경 자체가 테스트 장비. **착수 전 준비물(사용자 액션): Anthropic Admin 키 발급 + OpenAI Admin 키·소액 크레딧.**
- **결정(2026-08-24, 사용자)**: Q1=M1은 Anthropic+OpenAI **동시** · Q4=**일반 에디션**(premium 아님·게이팅 코드 불필요, [[premium-license-design]] 무관) · Q6=Copilot/Cursor **범위 제외**(조직 플랜 미보유 → 실검증 불가). Q2/Q3/Q5는 기본안 확정(메뉴 "모니터링>AI 사용 현황" 신설 · OTLP http/json 직접 파싱 · moveseye-ai ai_usage는 M3 편입).

**🔒 보류(숨김) 상태로 커밋 완료(2026-08-26 사용자 지시)**: "일단 안 쓸 것 같다" → 코드 전부 보존, FE 진입점 5곳(메뉴·라우트·검색·홈 위젯 카탈로그·도움말)을 단일 플래그 **`featureFlags.ts AI_MONITOR_ENABLED=false`**로 숨김(이미 추가된 홈 위젯 인스턴스도 렌더 제외·서버 레코드 보존). 플래그 ON/OFF 양쪽 전체 jest green — **한 줄 복구 검증됨**. moveseye-ai 챗봇 가이드 엔트리는 제거(원복), 내용은 설계서 부록에 보존. **커밋**: BE `be61d06`(84파일)·FE `423aa00`(50파일, 숨김 포함) 둘 다 `#ZM-115`, 미푸시. moveseye-ai는 커밋 대상 없음. Codex 검수는 커밋 후에도 유효(review 문서 대기).

**후속 확장 완주(2026-08-25 오후)**: 표 재구성(byUser 12→6열, 🔴DmoveTable scroll 기본값 {x:1000}이 스크롤 강제) · **Codex CLI 수신**(🔴실측이 문서를 뒤집음: 메트릭이 아니라 resourceLogs·문자열 숫자 → /v1/logs 신설, 🔴timeUnixNano "0"→1970 버킷 소실→시각 폴백 3단, user.email 실수신 확인, 비용 미제공→priced=false·플랜/활용도 생략(토큰0 사용자는 유지)) · 가이드 메일(BE relay·SMTP 미설정=명확한 에러·형식 오류=전체 거부) · 토큰 응답 provider(도구 오인=조용한 무수신 차단). E2E 5라운드까지 전 결함 종결. 최종 BE 1,350 green(aimonitor 205)·FE 1,275·i18n 269리프. ⚠️Codex 스니펫 경로가 /v1/metrics→/v1/logs로 변경된 이력 — 초기 안내로 설정한 사용자 재안내 필요(현재 해당자 없음).

**M2+구독 활용도 완주(2026-08-25, Codex 검수 대기)**: OTLP http/json 수신(proto 의존성 0)·수신 토큰 해시·동의 게이트(등록·재발급 동일 고지 재사용)·스니펫/공지문 복사·byUser(활동 3열+플랜/활용도)·사용자별 플랜(V33, month 전용·색 반전·저활용=시트낭비)·수신 예산 제외·compact `subscriptionCostUsd` 분리. **실측 확정(실제 Claude Code 전송)**: temporality=DELTA(숫자 1)·user.email=dataPoint 속성·type 철자 일치 → 중복 3배 실재 확인 → sha-256 영수증 dedup(V34, TTL 30분). 🔴교훈: OTLP EP만 진짜 HTTP 상태(200이면 exporter가 데이터 버림·503=재시도 유도) · protobuf 오설정 500→415(SDK 기본이 protobuf) — **슬라이스 테스트에 전역 핸들러 안 걸면 실경로보다 관대** · 활동시간은 밀리초 저장(DELTA엔 이월 커서 둘 자리 없음). 최종 BE 1,308 green·FE 1,229(+선재1)·마이그레이션 V30/31/33/34. 검수 문서 완성: _workspace/features/ai/ai-account-monitoring/review_ai-account-monitoring.md(§8 검수 요망 6지점).

**M1 구현 완주(2026-08-25, 전량 미커밋·검수요청 _workspace/features/ai/ai-account-monitoring/review_ai-account-monitoring.md)**: BE `aimonitor/` 패키지+V30(3테이블)+EP 10+HomeWidgetType `AI_MONITOR_COST` / FE 3탭 화면(**사용자 결정으로 설정 메뉴 없이** AI 사용 현황에 계정 관리 흡수)+홈 위젯. 정적 QA FAIL→PASS·E2E HIGH 0, 결함 총 14건 전건 수정. BE 1,210 green·FE 1,163(+선재 1). 🔴교훈: `@JsonInclude(NON_NULL)` 키 생략 vs null 혼재는 **DTO별 대응표(계약 §0.1)로 못 박아야** FE `=== null`이 안 빗나감 · **브레드크럼이 URL 세그먼트→i18n 키 파생**이라 `ai-usage`가 남의 `ai_usage` 네임스페이스를 침범 → URL을 `/monitoring/ai-account-usage`로 변경 · percent는 반올림이 아니라 **나눗셈 선행이 진범**(마이크로달러 BigDecimal로 이관) · DB `DEFAULT NOW()`는 앱 시계와 이원화(V28 관행=앱이 넣음). **미결/잔여**: Q7 알람 push 채널(SMTP/인앱/Zabbix trapper 택1) · 프로바이더 **성공 응답 파싱 미실측**(Admin 키 대기, OpenAI가 더 불안) · V30 커밋 후엔 수정 시 V31 분리 · moveseye-ai 주차 표기 `2026-W5` 불일치 · 로그인 FingerprintJS 무타임아웃(선재).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

AI 계정 모니터링 — M1(폴링)+M2(Claude Code·Codex CLI 수신)+구독 활용도 완주 후 **🔒 2026-08-26 보류(숨김) 상태로 커밋 완료**: BE `be61d06`·FE `423aa00` #ZM-115(미푸시). 숨김=FE `AI_MONITOR_ENABLED=false` 단일 플래그(진입점 5곳), **한 줄 복구 검증됨**(ON/OFF 양쪽 jest green). 🔴실측이 문서를 뒤집은 것: Codex는 메트릭 아닌 resourceLogs·timeUnixNano "0"→1970 소실·temporality=DELTA·중복 3배→sha256 dedup. 🔴교훈: NON_NULL은 DTO별 표·브레드크럼 세그먼트→i18n 키 침범·OTLP만 진짜 HTTP 상태·DmoveTable scroll 기본값 {x:1000}. 잔여: Codex 검수(review 문서 대기)·Q7 알람 push·폴링 성공 응답 미실측(Admin 키)·부활 절차는 설계서 상단
