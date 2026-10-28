---
name: ai-assistant-design
description: AI 어시스턴트 — moveseye-ai(Boot 4+Spring AI 2.0). 2026-08-20 기준 툴 **52개**(로드맵 완주 + 커스텀 차트 4·알림설정 7) + 플로팅 챗봇·화면/탭 가이드·'/'명령·AI 알림분석 홈위젯. 68 green, ZM-112 푸시. 실 LLM 대화만 미검증(키 없음)
metadata:
  type: project
---

MovesEye "명령형 AI 어시스턴트"(MCP처럼 툴 호출로 설정 수행). 설계서 `_workspace/devdesign_ai-assistant.md`, 코드 `C:\solutions\moveseye-ai`(README·CLAUDE.md).
- **별도 서버 :3100**, 툴 = BE REST 프록시(쿠키·x-visitor-id 그대로 전달 → RBAC·감사·라이선스는 BE가 판정). BE 무수정.
- **2026-08-19 스택 전환**: 공식 Anthropic SDK → **Spring Boot 4.0.7 + Spring AI 2.0**(Jackson 3 `tools.jackson`). 이유: 고객마다 LLM 다름(사용자 지적). Spring AI 1.1은 adaptive thinking 없어 탈락, 2.0은 Boot 4 필수·Anthropic/OpenAI 모듈이 공식 SDK 위에 재작성·`options()`에 apiKey/baseUrl·프롬프트 옵션은 기본값과 병합 안 됨(`defaults.mutate()`로 완전 옵션 생성)·모델 빌더의 toolCallingManager는 deprecated.
- 구조: `LlmProviderFactory`(ANTHROPIC/OPENAI/AZURE_OPENAI/OLLAMA 프로그램적 생성, 자동설정 미사용) · `ChatService`(ChatModel.stream + MessageAggregator + ToolCallingManager.executeToolCalls 수동 루프) · `AiToolCallbacks`(ToolCallback 어댑터: 호출 상한·확인 게이트·SSE 이벤트) · `PendingActionGate`(모델이 못 건드리는 confirm/cancel) · READ 툴 7개(`AbstractBeTool`).
- 검증: 단위 11 green(가짜 ChatModel로 툴 왕복·게이트 취소 포함), 실 BE 상대 7툴 런타임 OK(`AI_DEV_TOOLS_ENDPOINT=true` + `POST /ai/dev/tools/{name}`). **실 LLM 대화는 API 키 부재로 미검증** — 키 받으면 첫 할 일.
- **LLM 설정(2026-08-19 완료)**: 설치 단위·관리자 입력. BE `setting.type=LLM`(V24, apiKey enc:v1) `GET/POST /settings/llm` + 서버 간 `GET /internal/settings/llm`(x-internal-token = 양쪽 .env `INTERNAL_API_TOKEN`, permitAll+컨트롤러 검사, fail-closed). AI: `LlmProviderRegistry`(BE→env 폴백, 60초 감지, `POST /ai/settings/reload`), `POST /ai/settings/test`(키 비우면 저장 키), 오류는 `AiErrorCode` enum + `LlmErrorClassifier`(SDK 예외 타입/HTTP 상태로 분류, 문자열 매칭 없음). 실측: 가짜 키→AI_LLM_AUTH, Ollama 미기동→AI_LLM_UNREACHABLE.
- 구조 재편: common/ config/ auth/ be/ llm/(settings/) tool/(host/alert/zabbix) chat/(conversation/gate/engine/api) dev/. Lombok(@RequiredArgsConstructor/@Slf4j/@Getter fluent). yml: application(운영)+application-dev, logback-spring.xml(BE와 동일 규칙, MDC conv).
- 🔴 함정: `gradlew --stop`은 같은 Gradle 버전 BE bootRun 데몬까지 죽임(사고 1회) → `bootRun --no-daemon`. Git Bash에서 `/`로 시작하는 env 값(base64 토큰)은 MSYS가 경로로 변환 → `MSYS2_ENV_CONV_EXCL=INTERNAL_API_TOKEN` 또는 hex 토큰. moveseye-be/.env와 moveseye-be-spring/.env의 CREDENTIAL_ENCRYPTION_KEY가 서로 다름(BE 실행은 moveseye-be/.env 기준).
- **2026-08-19 권장안 5건 확정**: 대화=Postgres(구현: `ai_conversation/ai_message`, flyway_schema_history_ai, 🔴baseline-version 0 필수—기본 1이면 V1 건너뜀) · 순서=FE 설정화면→실LLM→WRITE · FE→AI 직접 호출 · 우측 드로어 · 관리자만. WRITE 3(create_host/create_trigger/acknowledge_problem) 구현+실 BE 검증(테스트 호스트 생성 후 삭제 — BE DELETE는 confirmName 필요). 계약서 `_workspace/features/ai/ai-assistant/contract_ai-assistant.md`, **FE 완료(2026-08-19, 미커밋 56파일)**: `/setting/ai` 설정 화면 + 채팅 드로어 + `/ai-assistant` 페이지(둘 다, 상태는 `stores/aiChatStore.ts` 모듈 싱글턴+useSyncExternalStore로 공유 — Context면 라우트 그룹 이동 시 레이아웃 리마운트로 스트림 소실), `axiosInstance`를 `createDmoveApi(baseURL)` 팩토리로 리팩터, SSE는 fetch+ReadableStream, `VITE_AI_URL`. jest 신규 24 pass, 브라우저 검증됨(확인 카드만 실 LLM 없어 미검증). 마크다운은 자작 최소 렌더러. 🔴 Vite 포트 자동 증가(5174)로 CORS 막히면 "미설정"처럼 보임 → dev CORS 5173~5175 허용.
- **MCP 계정 연동(2026-08-19 구현·E2E 통과)**: AI 서버 `/mcp`(Spring AI MCP 서버, 툴 10개) + 자체 OAuth 2.1(메타데이터·RFC7591 동적등록·PKCE·refresh 회전, `mcp/oauth/`) + BE `user.mcp_permission`(V25 NONE/READ/READ_WRITE, `PATCH /users/{id}/mcp-permission`) + BE 서명 `typ=mcp` JWT(1h, `/internal/mcp/tokens`) + BE `McpAccessInterceptor`(경로 허용목록·read=GET만, 시각세션 면제). FE(동의 페이지·MyPage 연결된 앱·사용자관리 권한 셀렉트·x-lang)는 fe-engineer 2차 진행. 🔴 MCP 툴 핸들러는 transport context의 Authorization으로 사용자를 되찾는다(WebMvcStreamableServerTransportProvider contextExtractor 직접 빈 등록, McpJsonMapper는 JacksonMcpJsonMapper(JsonMapper)로 생성).
- **i18n(2026-08-19)**: 사용자 문구 ko/en(`Msg`+`messages*.properties`, `x-lang`/Accept-Language, 턴 스레드에 로케일 전달), 모델용 텍스트(툴 설명·시스템 프롬프트)는 영어 고정 + `[Answer language: …]` 태그. 컨트롤러 로직은 서비스로 분리(OAuthService·ConsentService·LlmConnectionTestService·ChatTurnLauncher).
- **2026-08-19 후반**: 툴 15개(데이터소스별 `source()` NEUTRAL/ZABBIX, `zabbix_` 접두, 연결 안 된 소스 툴은 턴에 미노출 — BE /home/system-status) · 신규 zabbix_get_host(모니터링 카테고리 요약)·zabbix_link_templates·zabbix_create_item(trapper delay 0)·list_assets·get_asset. 설치형 4개 반영(공개 URL X-Forwarded 자동, MCP 기본 OFF `AI_MCP_ENABLED`, 동적등록 잠금 옵션, nginx 예시). FE 2차 완료(동의 페이지·연결된 앱·권한 셀렉트·x-lang·안내). BE `UserResponseDto.mcpPermission` 추가. 🔴 BE 세션은 계정당 1개(재로그인=이전 세션 INVALID_TOKEN) — FE 에이전트 로그인이 내 curl 세션을 계속 끊음. 🔴 FE i18n 코드 `kr`≠`ko`.
- **2026-08-19 로드맵 완주(툴 10→41, 커밋 6개 origin/main 푸시, 단위 48 green, 전 툴 실 BE 검증)**: 조회 5 → **엑셀 리포트**(`create_report` problems/hosts/assets 전건 페이지 순회 ≤5000행 + `export_table`, POI SXSSF로 **서버가** 파일 생성, `ai_artifact` V3 24h TTL, `GET /ai/artifacts/{id}` 소유자만, SSE `artifact` 이벤트) → 변경 8 → 자산·비용 6 → DESTRUCTIVE 4 → **화면 카탈로그 30개(`resources/docs/screens.json`)+`search_docs`+메시지 선택 `route`**("이 화면 요약"). 항목별 교훈은 `_workspace/features/ai/ai-assistant/review_ai-tool-coverage.md`와 vault 노트 §4.7.
- 🔴 **이번에 잡은 조용한 버그 3건**: (1) `create_host`가 인터페이스를 `hostInterface` 키로 보내 **BE가 무시 → 인터페이스 없는 호스트** 생성(BE DTO는 `@JsonProperty("interface")`) (2) BE 비용 응답 키가 `assetId`가 아니라 **`id`**(연차표 `years`, 원문 `rawPurchaseCost`) — 빈 문자열이 조용히 나갔다 (3) 깨진 요청 본문이 **500 AI_INTERNAL**로 나가 "AI 서버가 죽었나"로 오진 → 400으로 교정.
- 🔴 **BE `PUT /hosts/manage/{id}`는 전체 교체** — `zabbix_update_host`는 단건 GET 후 read-modify-write(템플릿·그룹·상태 보존, 프록시 감시 호스트는 거부). 🔴 **DESTRUCTIVE 카드에 대상 이름**을 실으려 `AiTool.summarize(ToolContext, input)` 오버로드 신설(기존 시그니처는 id만 알아서 "id만 적힌 카드" = 검토 불가). 🔴 **한국어 가이드 검색은 `keywords` 필드가 주 색인**(본문은 모델용 영어), 조사는 뒤 1~2자 절단하되 절단 매치는 점수 하향.
- **2026-08-20 추가(전부 실 BE/실 Zabbix 검증)**: ① **커스텀 차트 4종**(`/host/{id}/widgets` — 위젯=제목+차트종류+아이템목록, 자리 계산은 툴이 하고 남의 호스트 아이템은 거부: BE는 저장 성공하고 화면엔 **빈 차트**만 남는 조용한 실패) ② **알림 설정 7종** — 핵심은 `check_notification_delivery`(채널·수신처·액션 3단 진단; 하나만 빠져도 조용히 안 나감). 수신처 PUT은 전체교체라 read-modify-write, 심각도 "이상"→비트마스크(high=48). **액션 생성/수정은 미개방**(Zabbix 원형 바디 → 오작동 시 "알림 0건 또는 전원 폭탄") ③ **화면 카탈로그 30 + 탭 14**(아이템/트리거/디스커버리/매크로 등, `?tab=`까지 해석) + `search_docs` + 메시지 `route` ④ **'/'명령 7그룹 26개**(`docs/commands.json`+`GET /ai/commands`) — **예약어 실행이 아니라 입력창 문구 채우기**(코드 분기하면 자연어 강점을 버림) ⑤ **AI 알림 분석 홈위젯**(`ai_insight` V4 캐시 + `GET /ai/insights/alerts` + BE `HomeWidgetType.AI_ALERT_DIGEST`) — 숫자는 서버 집계·모델은 해석만. **사전생성 배치 보류**(배치엔 사용자 세션이 없어 "서버가 관리자인 척" 토큰 발급이 필요 → 결정 대기).
- 🔴 **2026-08-20 잡은 버그 3건**: (1) **x-lang이 통째로 무시**되고 있었다 — `LocaleFilter`가 넣어도 DispatcherServlet이 자기 LocaleResolver로 덮어쓴다(기본 AcceptHeader→서버 로케일). `WebConfig`에 LocaleResolver 빈 등록으로 해결, `kr`도 한국어로 받게 함(FE 코드가 kr). (2) **BE `/users/my-profile`이 Zabbix 미연동 로컬 계정에서 HTTP 500** — zabbix_userid null인데 Zabbix 조회를 걸었다. FE useAuth가 부팅 때 부르는 API라 **그 계정은 로그인해도 화면이 안 섰다**(권한 테스트 중 발견, BE 수정+회귀테스트). (3) 깨진 본문이 500 AI_INTERNAL → 400으로.
- 🔴 **권한 실측(2026-08-20)**: AI는 자기 권한이 없고 요청자 토큰을 그대로 넘긴다 — USER 계정으로 `zabbix_create_host`·`set_user_notification`·관리목록 전부 **Access Denied**, 알람 조회·홈위젯은 통과, AI 알림분석 EP는 AI 서버가 403. ⚠️ **채팅 진입 자체는 인증만 요구**(관리자 판정 없음) — 관리자 전용으로 잠글지 정책 결정 대기.
- 미결: 실 LLM 대화 검증(키) · 액션 생성(초안+승인 설계) · 알림분석 사전생성 정책 · 채팅 진입 권한 정책 · 감사 헤더(M4) · 라이선스 feature 게이트 · MCP 다중 인스턴스 · BE/FE 미커밋분(승인 필요).

**Why:** BE 3.3은 못 올리지만 AI 서버는 독립이라 Boot 4/Spring AI 가능. 프로바이더 중립이 제품 요구.
**How to apply:** 새 툴은 `AbstractBeTool` 상속 + compact 결과 + (WRITE/DESTRUCTIVE면) `summarize(ctx,…)`에 대상 이름. 새 화면은 `screens.json`에 한 줄(한국어 keywords 필수). 다음 = 실 LLM 키로 대화·확인 카드 검증. `com.fasterxml` 쓰지 말 것. 서버 띄운 채 gradle test 금지. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--premium-license-design|premium-license-design]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-wrapper-principle|zabbix-wrapper-principle]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--curl-hangul-cp949-false-500|curl-hangul-cp949-false-500]]

**사용량 표시 (2026-08-20 추가, `master`/`develop` 머지·푸시 완료)**
프로바이더(Anthropic·OpenAI)가 **잔액 조회 API를 주지 않는다** — "남은 사용량"은 만들 수 없다.
그래서 `ai_usage`(V5) 원장에 턴마다 토큰·비용(micro USD 정수)을 적고, 관리자가 설정 > AI에 적은
**월 예산(`LlmInfoDto.monthlyBudgetUsd`)에서 빼서** 잔여를 만든다. 초과해도 **차단하지 않는다(경고만)**.
단가는 `ai.pricing.models`(1M 토큰당 USD, yml) — 모르는 모델은 0원이 아니라 `priced=false`로 남기고
화면이 "적게 집계됐다"고 밝힌다(0으로 적으면 "안 쓰고 있다"는 거짓 확신을 준다).
EP `GET /ai/usage`(scope=all은 관리자) · `/ai/usage/compact`. 표시 4곳 = 설정>AI · 챗봇 하단 · AI 어시스턴트 사이드바 · 홈 위젯 `ai_usage`.
실측 검증: 입력 7,270 · 출력 218 → $0.0418(손계산 일치).

**화면 카탈로그 동기화 (2026-08-31, 커밋 `bef2e69` 미푸시)**
🔴 **카탈로그가 조용히 뒤처진다.** AI가 아는 화면 30개 vs FE 실제 46개 — 지목받은 자산 현황·구성 현황이
둘 다 빠져 있었다. 미등록이면 에러가 아니라 **가장 긴 접두 일치로 상위 화면 설명이 나간다**
(`/asset/dashboard`에서 물으면 자산 목록 설명). 사용자 관리는 2026-08-20에 설정으로 옮겨 갔는데
카탈로그가 **구 경로(지금은 redirect)** 를 가리켜 실사용 경로에서 해석 실패.
- 신규 16 + 경로 정정 1 + 탭 12(ZM-118 대시보드 5·이벤트 현황 `?tab=overview`·비용 dashboard/hw/cloud).
  설명 본문은 FE `page_guide` 한국어 도움말(정본)에서 옮겼다 — 두 곳이 다른 말을 하지 않게.
- `commands.json`의 `/` 명령 15개에 새 화면 23건 연결.
- 🔴 **등록만으론 반쪽** — 두 화면은 데이터 툴이 없어 설명만 하고 "요약해줘"엔 못 답했다.
  `get_asset_dashboard`(`/assets/dashboard`)·`zabbix_get_config_overview`(`/zabbix-manage/overview`) 신설.
  화면과 **같은 BE 집계**를 읽는다(규칙 재구현 금지 — 숫자가 갈리면 어느 쪽도 못 믿는다).
  분포는 상위 10·큐 10건으로 줄이되 **전체 건수는 남긴다**, `live=null`·`degraded`는 0으로 뭉개지 않는다.
- **`ScreenToolReferenceTest` 신설** — 카탈로그의 `tools`가 없는 툴을 가리키면 빌드에서 잡는다.
  이 축엔 방어선이 없었다(명령→화면은 `CommandCatalogTest`가 이미 막고 있었다).
- 남은 drift(손 안 댐): FE `AI_TOOL_CATALOG` 43/62(나머지는 도움말에 영어 설명으로 뜬다),
  FE `page-guide.ts`에 화면 6개 미등록(클라우드 하위 4·이벤트 상세 계열·모니터링 상세).
- 검수 요청서 `_workspace/features/ai/ai-assistant/review_ai-screen-catalog-sync.md`. 🔴 **런타임 미검증** — DTO 필드명을
  소스로만 맞췄다(이 레포가 경고하는 "이름만 보고 쓰면 조용히 빈 값" 함정 그대로). 실호출 1회면 갈린다.

산출물 경로 유실 건은 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--deploy-server-topology|deploy-server-topology]]에 적었다.


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

AI 어시스턴트 — `moveseye-ai`(Boot 4+Spring AI 2.0) **툴 52개(2026-08-20)**: 로드맵 완주분 41 + 커스텀차트 4 + 알림설정 7(배달경로 3단 진단). 플로팅 챗봇·화면/탭 가이드(30화면+14탭)·'/'명령 26개·AI 알림분석 홈위젯(V4 캐시). 68 green, ZM-112 푸시. 실 LLM 대화만 미검증. 🔴x-lang 무시 버그(LocaleResolver 미등록)·my-profile 500(로컬계정)·PUT은 전체교체·BE 비용키는 id·한글 curl은 cp949·gradlew --stop 금지
