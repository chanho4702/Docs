---
title: AI 어시스턴트 + MCP 계정 연동 — 채팅으로 설정을 시키고, 외부 AI 에이전트도 우리 계정으로 붙는다
date: 2026-08-19
project: moveseye
tags: [moveseye, ai, llm, spring-ai, mcp, oauth, agent, tools, i18n]
status: in-progress (서버 완료·FE 1차 완료·FE 2차 진행, 미커밋, 실 LLM 미검증)
---

# AI 어시스턴트 + MCP 계정 연동 (moveseye-ai)

**요청 한 줄:** "여기다 AI 붙여서 명령으로 설정 같은 걸 시킬 수 있게, MCP처럼 에이전틱하게." → 하루 반 만에 별도 서버·설정 저장·대화 저장·MCP까지 확장됐다.

[[moveseye]] 허브 · 설계 정본 `_workspace/devdesign_ai-assistant.md` · 계약 `_workspace/contract_ai-assistant.md` · 코드 `C:\solutions\moveseye-ai` (README·CLAUDE.md)

---

## 1. 쉽게 말하면 뭘 만들었나

**한 문장:** MovesEye에 "채팅으로 일 시키는 직원"을 하나 넣었고, 그 직원이 쓰는 **버튼(툴) 10개**를 만들었고, 그 버튼을 **외부 AI(Claude Desktop·Cursor)도 우리 계정으로 로그인해서 누를 수 있게** 했다.

### 1.1 채팅 어시스턴트 (제품 안)
- 사용자가 채팅창에 "linux 그룹 호스트 몇 대야?", "web-01에 CPU 90% 트리거 만들어줘"라고 치면
- AI가 **버튼 목록**(호스트 목록 보기, 알람 보기, 트리거 만들기…) 중에 뭘 누를지 고르고
- **우리 서버가 대신 누른다** — 기존 BE API를 그대로 호출(BE 코드 수정 0줄, 권한·기록도 BE가 하던 대로).
- **바꾸는 버튼은 사람이 OK 해야 실행**(확인 카드). AI 혼자 OK 못 누르게 서버 쪽에서 막음.
- 화면은 두 진입점: 헤더 **드로어**(다른 화면 보면서) + 사이드바 **전용 페이지** `/ai-assistant`. 둘이 같은 대화를 공유.

### 1.2 어느 LLM이든 (프로바이더 중립)
- 처음엔 Anthropic 공식 SDK로 짰다가 "고객마다 쓰는 LLM이 다르다" 지적 → **Spring AI 2.0**으로 갈아탐. 설정 하나로 **Claude / OpenAI(호환 게이트웨이 포함) / Azure OpenAI / Ollama** 선택.
- LLM 정보(회사·키·모델·주소)는 **관리자가 설정 > AI 화면에서 입력** → BE DB에 암호화 저장 → AI 서버가 읽어 **재시작 없이 반영**. [연결 테스트] 버튼으로 저장 전 확인.

### 1.3 MCP 계정 연동 (제품 밖 AI가 우리를 쓴다)
- 사용자가 Claude Desktop에 `https://…/mcp` 커넥터를 추가하면 → 브라우저에 **MovesEye 로그인·"허용할까요?" 화면** → [허용] → 끝. 토큰은 사용자가 만질 일 없음(아틀라시안 MCP와 같은 OAuth 방식).
- **권한은 계정 단위**: 관리자가 사용자 관리에서 `MCP 권한 = 없음 / 읽기 / 읽기·쓰기`를 준다. 이 권한이 3중으로 먹는다 — 동의 화면 상한 → 토큰 발급 재검사 → **BE가 요청마다 차단**(읽기 토큰은 GET만, 설정/사용자/라이선스 API는 어떤 MCP 토큰도 못 감).
- 연결 끊기는 MyPage > 연결된 앱.

### 1.4 언어
- 사용자에게 보이는 문구는 **ko/en**(FE가 `x-lang` 헤더로 알려줌). AI 모델에게 가는 텍스트(툴 설명·시스템 프롬프트)는 **영어 고정** + "이 언어로 답해" 태그. 모델은 영어 지시를 가장 안정적으로 따르고, MCP 툴 설명은 외국 사용자에게도 보이니까.

---

## 2. 구조 한 장

```
FE(:5173) ──SSE──▶ moveseye-ai(:3100)  ──REST(사용자 쿠키 그대로 전달)──▶ moveseye-be-spring(:3000) ──▶ Zabbix/DB
                     │ Spring Boot 4 + Spring AI 2.0 (Anthropic/OpenAI/Azure/Ollama)
                     │ 툴 10개 = BE REST 프록시 · 확인 게이트 · Postgres 대화 저장(ai_*)
                     │ /mcp (Streamable-HTTP) + OAuth 2.1 인가 서버 ◀── Claude Desktop / Cursor
                     └ LLM 설정은 BE setting(LLM, 암호화) ← 관리자 화면 · 60초/즉시 리로드
```
- **왜 별도 서버?** BE는 Boot 3.3이라 Spring AI 2.0(Boot 4 필수)을 못 올린다. 별도면 BE 무수정·장애 격리·API 키 격리. 대신 배포 하나 늘고 REST 없는 조합은 툴로 못 만든다(→ REST 먼저). 나중에 BE가 Boot 4 되면 합치는 문은 열어 둠(툴이 REST를 부르니 서비스 직접 호출로 바꾸기만 하면 됨).
- **BE 변경(최소)**: `setting.type=LLM`(V24) + `/settings/llm` · `/internal/settings/llm`(서버 간 토큰) · `user.mcp_permission`(V25) + `PATCH /users/{id}/mcp-permission` · `/internal/mcp/tokens` · `McpAccessInterceptor` · JWT `typ=mcp`.

## 3. 핵심 결정 (왜)
| 결정 | 이유 |
|---|---|
| 툴은 "의도 단위"로 잘게, 만능 `call_zabbix_api` 금지 | 위험하고 오작동 추적 불가. Zabbix 래핑 원칙(우리 로직 얹지 않기)과 같은 선 |
| 확인 게이트는 **서버**가 강제 | 모델이 "확인됨" 플래그를 스스로 세울 수 없어야 함. SSE `confirm_required` → FE 카드 → 서버 재개 |
| Spring AI 2.0 + Boot 4 (별도 서버라 가능) | 프로바이더 중립. 1.1은 adaptive thinking 없어 탈락. SDK 두 개 나란히는 추상화를 우리가 다시 짜는 일 |
| 대화 저장 = **Postgres**, Redis는 나중에 게이트/캐시용 | 감사·검색·30일 보존이 필요한 "기록"이라 내구 저장 |
| LLM 정보는 관리자 입력·설치 단위 | 사용자 단위는 개인 키 관리·비용 귀속이 복잡. 지금은 불필요 |
| MCP는 **계정 연동(OAuth)**, 토큰 복사 방식은 안 만듦 | Claude Desktop/claude.ai 커넥터가 OAuth를 기대. 토큰 복사는 만들어도 곧 버림 |
| MCP엔 확인 카드 없음 → 계정 권한(read/write) + 클라이언트 측 확인 | MCP 스펙엔 우리 카드 같은 UX가 없다. 대신 BE가 요청마다 scope로 막는다 |
| 사용자 문구 i18n / 모델 텍스트 영어 고정 | 모델 안정성·MCP 툴 설명 노출·프롬프트 캐시 프리픽스 보존 |
| 오류는 `AiErrorCode` enum + 타입 기반 분류기 | 문자열 매칭 지적 → SDK 예외 타입/HTTP 상태로 분류(`LlmErrorClassifier`) |
| 컨트롤러는 매핑만 | 로직은 `OAuthService`·`ConsentService`·`LlmConnectionTestService`·`ChatTurnLauncher` |
| **툴을 데이터소스별로 분리**(`source()`: NEUTRAL / ZABBIX / ELASTIC / PROMETHEUS / DATADOG, 전용 툴은 `zabbix_` 접두) | 사용자 지적: 소스마다 할 수 있는 게 다르다. 수집 엔진의 중립 포트 vs 소스 전용 구분과 같은 선. 연결 안 된 소스의 툴은 턴에 아예 안 넘긴다(BE `/home/system-status` 기준) |

## 4. 겪은 문제 & 교훈 (🔴 = 다시 당하지 말 것)
1. 🔴 **`gradlew --stop`이 BE를 죽였다** — 같은 Gradle 버전(9.2.1) 데몬을 전부 내리므로 BE bootRun 데몬까지 종료. 환경변수를 새로 넣어 띄울 땐 `bootRun --no-daemon`.
2. 🔴 **Git Bash가 `/`로 시작하는 환경변수 값을 경로로 바꾼다** — base64 토큰이 `/Dy…`로 시작해 `C:/Program Files/Git/Dy…`가 됨(403의 진짜 원인, "토큰 불일치"로 오진할 뻔). `MSYS2_ENV_CONV_EXCL=INTERNAL_API_TOKEN` 또는 hex 토큰.
3. 🔴 **Flyway `baseline-on-migrate`의 기본 baseline-version=1이면 V1을 건너뛴다** — BE 테이블이 이미 있는 스키마라 baseline이 필요한데, 히스토리 테이블만 생기고 `ai_*` 테이블은 없었다. `baseline-version: 0`.
4. **Spring AI 2.0 함정**: 프롬프트 옵션이 모델 기본값과 병합되지 않는다(`defaults.mutate()…build()`로 매 턴 완전한 옵션) · 모델 빌더의 `toolCallingManager`는 deprecated · Anthropic/OpenAI 모듈은 공식 SDK 위에 재작성돼 `options()`에 apiKey/baseUrl이 들어간다 · Jackson 3(`tools.jackson`)라 `com.fasterxml` 쓰면 안 됨.
5. **MCP 서버 배선**: 자동설정의 transport provider를 대체해 `contextExtractor`로 Authorization 헤더를 실어야 툴 핸들러가 "누가 불렀는지" 안다. `McpJsonMapper` 빈은 없고 `JacksonMcpJsonMapper(JsonMapper)`로 만든다. Ollama 기본 재시도는 지수 백오프로 몇 분을 끈다 → 연결 테스트는 1회 재시도.
6. **BE 세션 함정**: 같은 계정 재로그인 시 이전 visitor 세션이 무효(`USER_LOGIN_KEY_{userId}` 단일) → 테스트 중 `INVALID_TOKEN`은 서버 결함이 아니다. MCP 토큰은 브라우저 세션이 없어 시각 세션 검사를 면제해야 했다.
7. **Vite 포트 자동 증가(5174)로 CORS가 막히면 화면엔 "미설정"처럼 보인다** — dev CORS에 5173~5175 허용.
8. **Bash 도구 히어독에 따옴표/한글이 많으면 파싱이 깨진다** → 파일은 Write 도구, 스크립트는 파일로 써서 실행.
9. **`/event/problems`는 from/to 없으면 0건**(epoch 0 창) — 홈 위젯 때와 같은 함정 재확인. 툴이 30일 창을 기본으로 채운다.

## 4.5 설치형 배포 관점 재점검 (사용자 "찝찝한데" → 4개 확정)
1. **URL 하나** — 리버스 프록시 뒤에 FE·BE·AI를 한 오리진으로(`/api`→BE, `/ai`·`/mcp`·`/oauth`·`/.well-known`→AI). 공개 URL은 `X-Forwarded-*`에서 **자동 계산**(`PublicUrlResolver`+`ForwardedHeaderFilter`) — 설치 때 손으로 맞추는 값 제거.
2. **MCP 기본 OFF**(`AI_MCP_ENABLED=false`) — 데이터가 외부 LLM 서비스로 나가는 기능이라 고객사 옵트인. 폐쇄망은 어차피 불가. `/ai/health.mcpEnabled`로 FE가 관련 UI를 숨김. 라이선스 feature 게이트는 다음(발급기·BE 4파일 사본 동시 수정).
3. **동적 클라이언트 등록 잠금 옵션**(`AI_MCP_DYNAMIC_REGISTRATION=false`).
4. **https**는 프록시에서(Claude Desktop 커넥터 요구). nginx·compose 예시는 `moveseye-ai/README.md`.
교훈: 개발 기본값(localhost·MCP on)을 그대로 배포 기본값으로 두면 설치형에서 어긋난다 — "고객이 뭘 보고 뭘 켜야 하나"를 기본값 설계 단계에서 따로 물어야 한다.

## 4.7 툴 로드맵 완주 (2026-08-19 오후, 10→41개)

사용자 지시 "공수 낮은 순"으로 P1-A 조회 5 → 엑셀 리포트 → P1-B 변경 8 → P1-C 자산·비용 6 → DESTRUCTIVE 4 → 화면 요약/가이드까지 **전부 구현·실 BE 검증**. 커밋 6개, `origin/main`(Bitbucket, ZM-112) 푸시 완료. 단위 48 green.

| 묶음 | 툴 | 이번에 배운 것 |
|---|---|---|
| 조회 5 | `get_group_overview`·`get_host_metrics`·`get_problem`·`get_system_status`·`list_device_classifications` | BE 메모리 summary의 avg/max/min은 **MB**, usagePercentage만 % — 필드 이름으로 단위를 드러냈다 |
| 엑셀 리포트 | `create_report`(problems/hosts/assets 전건 페이지 순회 ≤5000행) · `export_table` | 파일은 **서버가 만든다**(POI SXSSF) — 행을 모델에 태우면 토큰만 태우고 형식도 못 지킨다. `ai_artifact`(V3) 24h TTL + `GET /ai/artifacts/{id}`(소유자만) + SSE `artifact` 이벤트 |
| 변경 8 | `zabbix_update_host`·`set_host_status`·`set_device_type`·`unlink_templates`·`update_item`·`set_item_status`·`update_trigger`·`set_trigger_status` | 🔴 BE `PUT /hosts/manage/{id}`는 **전체 교체** → 툴이 단건 GET으로 read-modify-write(템플릿·그룹·상태 보존). 🔴 인터페이스 키가 `interface`(`@JsonProperty`)인데 기존 `create_host`가 `hostInterface`로 보내 **조용히 무시**되고 있었다(인터페이스 없는 호스트 생성) |
| 자산·비용 6 | `update_asset`·`sync_assets`·`get_cost_dashboard`·`list_cost_incomplete`·`get_asset_cost`·`update_asset_cost` | 🔴 BE 비용 응답의 키는 `assetId`가 아니라 **`id`**, 연차표는 `years`, 원문은 `rawPurchaseCost` — 이름만 보고 쓰면 빈 문자열이 조용히 나간다(실제로 나갔다). 비용 툴은 **파라미터의 출처**(자산 예외/분류 기본값/기본)를 같이 준다 — 안 그러면 모델이 기본값을 확정 사실처럼 말한다 |
| DESTRUCTIVE 4 | `delete_host`(confirmName)·`delete_items`·`delete_triggers`·`exclude_asset` | 🔴 확인 카드에 **대상 이름**을 실으려고 `summarize(ToolContext, input)` 오버로드를 신설했다 — 기존 시그니처는 모델 입력(=id)만 갖고 있어 "id만 적힌 카드"가 나왔고, 그건 사람이 검토할 수 없어 확인 절차가 형식이 된다 |
| 가이드·화면 | `search_docs` + `resources/docs/screens.json`(30개 화면) + 메시지의 선택 `route` | 🔴 **한국어 검색어 필드가 사실상 주 색인**이다 — 본문은 모델용 영어라 한국어 질의가 화면 이름에만 걸렸다. 조사는 뒤 1~2글자를 떼어 맞추되(`엑셀로`→`엑셀`) **뗀 매치는 점수를 낮게** 준다(안 그러면 "비밀번호"가 "비밀값"에 밀린다 — 실제로 밀렸다) |

곁가지 수정 2건: 깨진 요청 본문(잘못된 인코딩·JSON)이 **500 AI_INTERNAL**로 나가던 것을 400으로(“AI 서버가 죽었나”로 오진하게 만든다) · `create_host` 인터페이스 키.

🔴 **한글 curl 함정 재확인**: Git Bash `curl -d '{"notes":"한글"}'`은 cp949로 나가 서버가 UTF-8 파싱에 실패한다. 툴 결함으로 오진할 뻔했고(위 500→400의 계기), 검증은 UTF-8 파일(`--data-binary @req.json`)이나 python urllib로 해야 한다.

## 5. 검증 상태
- 단위: AI **48 green**(리포트 페이징·xlsx 판독, 변경 툴 round-trip, 비용 입력 검증, DESTRUCTIVE 이름 재검증, 화면 카탈로그 라우트 해석) · 초기 19 green(가짜 ChatModel로 툴 왕복·게이트 취소, WRITE 툴 매핑, OAuth 규칙) · BE 13 green(설정 8·MCP 5).
- 런타임(2026-08-19 오후): **툴 41개 전부 실 BE/실 Zabbix 검증** — 엑셀 3종(hosts 76행·problems 84행·assets 80행)+다운로드(Content-Disposition·소유자 404), 테스트 호스트로 수정→템플릿 연결(43아이템)→아이템/트리거 수정·비활성→unlink clear(43→1)→삭제, 비용 입력→상각 계산→clearFields 원복(dev 데이터 원상복구), 한국어 가이드 검색 6종. 초기 툴 10개 실 BE 상대 OK(테스트 호스트 생성→삭제, 알람 1건에 테스트 메시지 남김) · LLM 설정 저장→리로드→가짜 키 `AI_LLM_AUTH`·Ollama 미기동 `AI_LLM_UNREACHABLE` 분류 · **MCP E2E 전 구간 통과**(401 디스커버리→등록→인가→동의→PKCE 토큰→tools/list·call→비허용 경로 403→refresh→연결 끊기→invalid_grant).
- FE 1차(설정 화면·드로어·페이지)·**2차(OAuth 동의 페이지·MyPage 연결된 앱·사용자 관리 MCP 권한 셀렉트·x-lang·설정 카드 간격·AI 진입점 게이팅·"무엇을 할 수 있나" 안내) 완료** — jest 1011 pass, 브라우저 검증(동의 페이지→code 리다이렉트 실측). 🔴 FE 언어 코드는 `kr`인데 AI 서버는 `ko` — 변환 없이 넘기면 UI는 한국어·답변은 영어. 🔴 `GET /users`(사용자 관리가 쓰는 목록)에 `mcpPermission`이 없어 현재값 표시 불가 → BE `UserResponseDto`에 추가(재기동 검증).
- **미검증: 실제 LLM 대화·확인 카드 흐름** — API 키가 없어서. 이제 설정 > AI 화면에서 키만 넣으면 됨. 실제 Claude Desktop으로 MCP 붙여보기도 남음.

## 6. 남은 것 / 열린 항목
- 실 LLM 키 → 채팅·확인 카드 검증 → 프롬프트·툴 설명 튜닝
- ~~기능 커버리지 로드맵~~ ✅ **전 항목 완료(2026-08-19)** — `_workspace/review_ai-tool-coverage.md`에 항목별 완료 표시와 교훈. 남은 P2는 사용 요청 나올 때.
- 라이선스 feature `AI_ASSISTANT` 게이트, 감사로그 "AI 경유" 표기(M4)
- 리포트 kind 확장 여지: `group_report`·`cost_incomplete`(`ReportBuilder.Kind` 한 줄 + 행 매퍼)
- MCP: 인가 코드·동의 대기가 메모리(단일 인스턴스) → 다중 인스턴스면 Redis
- 커밋: **AI는 Bitbucket `origin/main`에 푸시 완료(ZM-112, 커밋 6개)**. BE(V24·V25 등)·FE(~70파일)는 여전히 미커밋 — 승인 필요
- 관찰: `moveseye-be/.env`와 `moveseye-be-spring/.env`의 `CREDENTIAL_ENCRYPTION_KEY`가 서로 다르다(실행은 `moveseye-be/.env` 기준)

관련 주제 노트: [[dev-runtime-startup]] · [[session-auth-hardening]] · [[zabbix-api-auth]]
