# moveseye-ai — MovesEye AI 어시스턴트 서버

채팅으로 MovesEye 운영·설정 작업을 시키는 에이전트 서버. **별도 프로세스(:3100)** 로 뜨고, 기존 BE(:3000) REST를 툴로 감싸서 호출한다.
설계 정본: `../_workspace/features/ai/ai-assistant/devdesign_ai-assistant.md`.

```
FE(채팅 패널) ──SSE──▶ moveseye-ai(:3100) ──REST(사용자 쿠키·x-visitor-id 그대로 전달)──▶ moveseye-be-spring(:3000)
                          │ Spring AI 2.0 (Anthropic / OpenAI 호환 / Azure OpenAI / Ollama — 설정으로 선택)
                          │ 대화 저장(v1 메모리) · 확인 게이트 · 툴 결과 슬리밍
```

## 왜 이렇게 생겼나
- **프로바이더 중립**: 고객마다 쓰는 LLM이 다르다 → Spring AI `ChatModel` 위에서 같은 루프. Anthropic 전용 SDK로 시작했다가 2026-08-19 전환.
- **BE 무수정**: 툴은 BE 엔드포인트의 얇은 프록시. 인증(HttpOnly 쿠키 accessToken / Bearer)과 `x-visitor-id`를 그대로 넘겨 RBAC·감사로그·라이선스 판정을 BE가 그대로 한다. AI 서버는 자기 권한이 없다.
- **Boot 4 + Spring AI 2.0**: BE는 Boot 3.3이라 못 올리지만 이 서버는 독립이라 가능(Spring AI 2.0은 Boot 4 필수, Jackson 3 `tools.jackson`).

## LLM 설정은 어디서 오나 (설치 단위, 관리자 입력)
정본은 **BE 설정 테이블**(`setting.type=LLM`, V24) — 관리자가 설정 > AI 화면에서 넣는다(FE 담당). apiKey는 BE가 `enc:v1:` AES-GCM으로 암호화 저장.
```
관리자 화면 ──POST /settings/llm──▶ BE(암호화 저장) ◀──GET /internal/settings/llm (x-internal-token)── moveseye-ai
   │                                                                                    ▲
   └──POST /ai/settings/test (저장 전 접속 확인) · POST /ai/settings/reload (저장 직후 즉시 반영) ─────────┘
```
- AI 서버는 기동 시 BE 설정을 읽고, 이후엔 **BE가 저장할 때 푸시**(`POST /internal/settings/changed`, 공유 토큰) + FE 저장 직후 `reload` 로 즉시 갈아끼운다. 주기 폴링은 15분 폴백(`AI_SETTINGS_REFRESH`)뿐. 값이 같으면 재생성하지 않는다. **재시작 불필요.**
- BE와 AI 서버 양쪽에 같은 `INTERNAL_API_TOKEN`이 있어야 한다(없거나 다르면 BE가 403 → AI는 env 폴백). 🔴 Git Bash에서 값이 `/`로 시작하면 MSYS가 경로로 변환해 버린다 — `MSYS2_ENV_CONV_EXCL=INTERNAL_API_TOKEN` 지정하거나 `openssl rand -hex 32`로 만들 것.
- BE에 설정이 없으면 환경변수(`AI_PROVIDER/AI_API_KEY/AI_MODEL/AI_BASE_URL`)로 폴백. 둘 다 없으면 기동은 되지만 채팅은 `AI_LLM_UNCONFIGURED`.
- `/ai/settings/status`·`/ai/health`에 `source`(db|env)와 마지막 오류가 보인다.

## 실행
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"     # 전역 JAVA_HOME은 JDK8이라 매번 지정
$env:SPRING_PROFILES_ACTIVE = "dev"                 # 개발: application-dev.yml + logback dev(DEBUG·콘솔). 운영은 미지정(INFO + ./logs 롤링 파일)
$env:INTERNAL_API_TOKEN = "<BE .env와 같은 값>"
$env:BE_BASE_URL = "http://localhost:3000"
# (BE에 설정이 없을 때만) $env:AI_PROVIDER / $env:AI_API_KEY / $env:AI_MODEL / $env:AI_BASE_URL
.\gradlew.bat bootRun
```
- OpenAI 호환 게이트웨이(vLLM·LM Studio·OpenRouter…)는 provider=OPENAI + base-url. Azure OpenAI는 AZURE_OPENAI + `https://{resource}.openai.azure.com` + model=배포이름. Ollama는 키 불필요.
- 전체 설정 키는 `src/main/resources/application.yml`(운영 기본) + `application-dev.yml`(개발 덮어쓰기: dev 툴 엔드포인트 on, CORS localhost, 설정 감지 30초).
- **로깅**: `logback-spring.xml` — dev: com.dmove DEBUG·Spring AI DEBUG·콘솔 / 운영: INFO + `${LOG_PATH:-./logs}/moveseye-ai.log`(일·50MB 분할, 30일·2GB). 레벨 오버라이드 env `LOG_LEVEL_ROOT / LOG_LEVEL_APP / LOG_LEVEL_AI / LOG_LEVEL_HTTP`. yml에 `logging.level.*` 두지 않는다(BE와 동일 규칙). 패턴에 MDC `conv`(대화 ID)가 들어간다.

## API (FE 접점)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/ai/health` | 프로바이더·툴 수 (인증 없음) |
| GET | `/ai/tools` | 노출 툴 목록(이름·등급·스키마) |
| GET | `/ai/artifacts/{id}` | 대화가 만든 파일 다운로드(xlsx). 소유자만, 24h 후 삭제 |
| GET | `/ai/screens/resolve?route=` | 지금 보고 있는 화면(+`?tab=`)의 이름·예시 질문·커버 툴. FE 플로팅 챗봇 헤더용 |
| GET | `/ai/commands?route=` | 입력창 "/" 명령 목록(그룹→세부, 현재 화면 우선). 선택 시 **문구를 채울 뿐** 실행 경로는 일반 대화와 같다 |
| GET | `/ai/insights/alerts?period=daily\|weekly&generate=&refresh=` | 홈 "AI 알림 분석" 위젯. 기본은 **캐시만**(없으면 `available:false`), `generate=true`일 때만 LLM 호출 |
| POST | `/ai/conversations` | 대화 생성 → `{id}` |
| GET | `/ai/conversations?limit=` | 내 대화 목록 |
| GET | `/ai/conversations/{id}` | 대화 + transcript(FE 재렌더용) |
| DELETE | `/ai/conversations/{id}` | 삭제 |
| POST | `/ai/conversations/{id}/messages` | `{message}` → **SSE** 스트림 |
| POST | `/ai/actions/{actionId}/confirm` · `/cancel` | 확인 카드 응답 |
| GET | `/ai/settings/status` | (관리자) 현재 프로바이더·출처·마지막 오류 |
| POST | `/ai/settings/reload` | (관리자) BE 설정 즉시 재적용 |
| POST | `/ai/settings/test` | (관리자) `{provider, apiKey?, baseUrl?, model, effort?, maxTokens?}` 접속 확인 — apiKey 비우면 저장된 키로 시험 |

모든 엔드포인트는 BE와 같은 헤더(쿠키 + `x-visitor-id`)로 부른다. 응답 껍데기도 BE와 동일 `{status, code, data, message}`.

**오류 코드**: `common/AiErrorCode` 한 곳(HTTP 응답 `errorCode`·SSE `error{errorCode,message}` 동일). LLM 쪽 예외는 `llm/LlmErrorClassifier`가 **예외 타입·HTTP 상태로** 분류(`AI_LLM_AUTH`·`AI_LLM_MODEL_NOT_FOUND`·`AI_LLM_RATE_LIMIT`·`AI_LLM_UNREACHABLE`·`AI_LLM_TIMEOUT`·`AI_LLM_UNCONFIGURED` …).

**SSE 이벤트**: `text_delta{text}` · `tool_call{id,name,tier,input}` · `tool_result{id,name,error,elapsedMs,preview}` · `confirm_required{actionId,name,tier,summary,input,timeoutSeconds}` · `confirm_resolved{actionId,decision}` · `artifact{artifactId,filename,url,sizeBytes,expiresAt}`(파일 산출물) · `done{finish,rounds,toolCalls,inputTokens,outputTokens,…}` · `error{errorCode,message}`

확인 카드가 뜨면 스트림은 열린 채 최대 5분(`AI_CONFIRM_TIMEOUT`) 대기하고, FE는 별도 요청으로 confirm/cancel 한다. 모델은 이 결정을 만들 수 없다(서버 게이트).

## MCP 계정 연동 (외부 AI 에이전트가 MovesEye 툴을 쓴다) — 2026-08-19
Claude Desktop·Cursor 등에서 `{공개URL}/mcp`(Streamable-HTTP)를 커넥터로 추가하면 표준 OAuth 2.1 흐름으로 **MovesEye 계정에 로그인·동의**하고 토큰을 받는다. 사용자는 토큰을 만질 일이 없다.
```
클라이언트 → GET /mcp (401 + WWW-Authenticate: resource_metadata) → /.well-known/oauth-protected-resource → /.well-known/oauth-authorization-server
          → POST /oauth/register(동적 등록) → GET /oauth/authorize(PKCE) → 302 FE /oauth/consent?rid → 사용자 [허용]
          → POST /ai/oauth/consent/{rid}(쿠키) → code → POST /oauth/token → access(BE 서명 JWT typ=mcp, 1h) + refresh(30일, 회전)
          → POST /mcp (Bearer) → 툴 실행(BE는 그 사용자 토큰으로 호출) 
```
- **권한은 계정 단위**: 관리자가 사용자 관리에서 `mcp_permission`(NONE/READ/READ_WRITE)을 준다. 동의 때 AI 서버가 my-profile로 확인하고, 발급은 BE `/internal/mcp/tokens`가 다시 검사한다.
- **BE가 최종 방어**: MCP 토큰은 `McpAccessInterceptor`가 경로 허용목록(호스트·알람·Zabbix 관리·자산·내 프로필)과 scope(read=GET만)로 좁힌다. 시각 세션(x-visitor-id) 검사는 MCP 토큰에 면제.
- 확인 카드는 없다(MCP엔 그 UX가 없음) — 클라이언트가 자기 방식으로 사용자에게 확인하고, 서버는 계정 권한으로 막는다. WRITE 툴 설명에 "실행 전 사용자 확인" 지시가 붙어 나간다.
- **인증 캐시와 BE 401**(ZM-157): 토큰 검증 성공은 5분 캐시한다. 인증 뒤 호출 처리 중(데이터소스 사전 조회·툴 실행) BE가 401을 주면(비활성화·역할 변경 등) 그 토큰 캐시를 즉시 버리고(폐기 세대를 올려 진행 중이던 조회의 재삽입도 막는다) 툴 오류(`mcp.auth_revoked`)로 답한다 → 다음 `/mcp` 요청은 BE에 다시 물어 HTTP 401 + `WWW-Authenticate`로 재인증이 시작된다. 401 감지는 `be/BeAuthFailures`(스레드 범위) — 툴이 대상별 오류로 삼켜도 남는다.
- 연결 끊기: MyPage > 연결된 앱(`DELETE /ai/mcp/grants/{id}`) → refresh 폐기(access는 최대 1h 유효). 관리자가 권한을 NONE으로 내리면 다음 갱신부터 거부되고 연결도 끊긴다.
- **계정 보안 변경 시 자동 회수**(ZM-157 A1, 계약 `_workspace/contract_zm-157-followups.md` A1): 비밀번호 변경·재설정·비활성화·삭제는 BE 사용자 세대(`REFRESH_GEN:<userId>`)를 올린다.
  - **동의 승인 시점에 세대를 고정한다(D2)**: [허용] 때 `GET /internal/mcp/users/{userId}/generation`(x-internal-token)으로 세대를 읽어 인가 코드(Redis `PendingAuthStore.Code.generation`)에 넣는다. 읽기는 my-profile 확인보다 **먼저** 한다(읽은 뒤 세대가 오르면 쿠키 세션도 끊겨 확인이 실패하거나, 교환에서 BE가 거부한다). 조회가 실패·거부되면 **동의 실패**(코드 미발급, `mcp.consent.generation_unavailable`).
  - **코드 교환**(`authorization_code`)은 코드의 세대를 `expectedGeneration`으로 보낸다 → 승인 뒤 10분 안에 비밀번호가 바뀌었으면 BE가 `MCP_GRANT_REVOKED` → `invalid_grant`(연결 미생성). 세대 없는 코드(D2 배포 전에 승인된 Redis 잔존 코드)는 BE에 묻지 않고 `invalid_grant`. 발급 응답의 `generation`이 없으면(구버전 BE) `server_error`(500), 코드 세대와 다르면 `invalid_grant` — 어느 쪽도 연결을 만들지 않는다. 연결의 `generation`(V8) = 코드의 세대.
  - **갱신**(`refresh_token`)은 연결에 저장된 세대를 `expectedGeneration`으로 보낸다. `MCP_GRANT_REVOKED`면 연결을 폐기(연결된 앱 목록에서 사라짐)하고 `invalid_grant` → 클라이언트가 재연결을 시작한다. 성공 응답의 `generation`이 저장값과 다르거나 없으면(기대 세대를 확인하지 않는 구버전 BE) 발급된 access를 버리고 같은 방식으로 폐기한다(실패로 닫음).
  - 이미 나간 access 토큰은 BE `McpAccessInterceptor`가 `gen` 클레임으로 요청마다 막는다(HTTP 401 → 위 "인증 캐시와 BE 401" 흐름).
  - **`generation`이 없는 옛 연결(V8 이전)은 거부**한다 — 어느 세대에서 만든 연결인지 몰라 비밀번호를 바꾼 뒤에도 살아 있던 연결일 수 있다. V8이 기존 활성 연결을 일괄 폐기하고, 런타임도 갱신 때 BE에 묻지 않고 폐기 + `invalid_grant`. 배포 후 사용자마다 **1회 재연결**이 필요하다(재로그인 공지와 함께).
  - **폐기는 영구 거부 코드만(D5)**: `MCP_GRANT_REVOKED`(→ `invalid_grant`), `MCP_USER_INACTIVE`·`MCP_PERMISSION_DENIED`·`USER_NOT_FOUND`(→ `access_denied`). 목록에 없는 거부 코드는 연결을 **남기고** `access_denied`(경고 로그).
  - **일시 장애는 보존 + 503(D5)**: BE `FAILED_TO_ACQUIRE_LOCK`(사용자 행 잠금 대기 초과 — 이름 수정 등이 길게 잡고 있을 때)이나 BE 호출 자체 실패(HTTP 오류·연결 실패)는 연결·refresh를 그대로 두고, 코드 교환이면 소비한 인가 코드를 남은 수명만큼 **되돌린 뒤**(`restoreCode`, SET NX) 토큰 엔드포인트가 HTTP **503** `{"error":"temporarily_unavailable"}`로 답한다 → 클라이언트는 같은 refresh/코드로 재시도하면 된다.
  - **refresh 교체는 조건부**: `UPDATE … WHERE id=? AND refresh_token_hash=<이전 해시> AND revoked_at IS NULL AND expires_at > now()`, 0행이면 `invalid_grant`. 같은 refresh로 동시에 온 두 요청은 **하나만 성공**하고(두 번째는 발급한 access를 버림), 갱신 도중 연결이 끊겼을 때도 새 refresh가 나가지 않는다.
- 테이블: `ai_oauth_client`, `ai_oauth_grant`(V2, `generation` V8). 인가 코드·동의 대기는 Redis(`PendingAuthStore`, 10분).
- 필요 설정: `AI_PUBLIC_URL`(이 서버 공개 URL — 메타데이터 issuer·redirect에 박힘), `FE_PUBLIC_URL`(동의 화면), `INTERNAL_API_TOKEN`.

## 설치형 배포 — 고객은 URL 하나만 본다 (2026-08-19)
```
                     ┌─ /            → FE 정적(빌드 산출물)
https://moveseye.corp ─ nginx ─┼─ /api/      → moveseye-be-spring :3000   (기존)
                     └─ /ai/ /mcp /oauth/ /.well-known/  → moveseye-ai :3100   (단 /oauth/consent 는 FE 화면)
```
- AI 서버는 **컨테이너 하나 추가**일 뿐 고객에게 별도 서버로 보이지 않는다. 공개 URL·동의 리다이렉트는 `X-Forwarded-Proto/Host`로 **자동 계산**(`PublicUrlResolver`) — `AI_PUBLIC_URL`을 손으로 맞출 필요 없음(프록시가 헤더를 안 넘기는 특수 환경만 명시).
- FE는 같은 오리진에서 `/ai/...`, `/mcp`로 부른다 → 운영에선 `VITE_AI_URL`을 비우거나 같은 도메인으로. CORS도 같은 오리진이면 무관.
- **MCP는 기본 OFF**(`AI_MCP_ENABLED=false`) — 모니터링 데이터가 외부 LLM 서비스(Claude Desktop 등)로 나가는 기능이라 고객사가 명시적으로 켠다. 폐쇄망은 어차피 불가(사내 LLM으로 채팅만). 켤 땐 https 필수(Claude Desktop 커넥터 요구), `AI_MCP_DYNAMIC_REGISTRATION=false`로 사전 등록 클라이언트만 허용할 수도 있다. **DESTRUCTIVE 툴(영구 삭제·자산 제외)은 MCP에 기본 비노출** — MCP엔 서버 측 확인 카드가 없어 자동 승인 클라이언트가 데이터에 심긴 지시로 지울 수 있다(ZM-157). `AI_MCP_ALLOW_DESTRUCTIVE=true`로 켜도 write 권한 + 호출 1회 대상 수 상한(`AI_MCP_MAX_DESTRUCTIVE_TARGETS`, 기본 1)을 통과해야 한다. 위험도는 **호출 입력으로** 판정한다 — 정적 WRITE 툴이라도 파괴적 입력(`zabbix_unlink_templates`의 `clear=true` = 템플릿 아이템·트리거·이력 삭제)이면 같은 제한을 받는다(목록엔 남고 그 입력의 호출만 거부).
- nginx 예시:
```nginx
location /api/  { proxy_pass http://be:3000/;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; }
location /ai/   { proxy_pass http://ai:3100/ai/;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; proxy_buffering off; proxy_read_timeout 600s; }  # SSE: 버퍼링 끄기·타임아웃 넉넉히
location /mcp   { proxy_pass http://ai:3100/mcp;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; proxy_buffering off; }
location = /oauth/consent { try_files /index.html =404; }  # 🔴 동의 화면은 FE 라우트(SPA) — 아래 /oauth/ 프록시보다 먼저 잡아야 한다(server 블록의 root = FE 빌드 산출물 전제)
location /oauth/        { proxy_pass http://ai:3100/oauth/;        proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; }
location /.well-known/  { proxy_pass http://ai:3100/.well-known/;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-Host $host; }
```
- docker-compose에 `ai` 서비스 추가: 이미지 `moveseye-ai`(`gradlew bootJar` → `java -jar`), env = BE와 같은 `DB_*` + `INTERNAL_API_TOKEN`(BE와 동일) + `AI_MCP_ENABLED`. LLM 키는 env가 아니라 **관리자 화면**에서.
- 필요 env 정리는 `.env.example`.

### DB 마이그레이션 배포 주의 — V7(`ai_insight` 사용자별 캐시, ZM-157)
V7은 알림 요약 캐시의 유니크 키를 `(kind, period, period_key, lang)` → `+ owner_key`로 **교체**하고 기존 공유 캐시 행을 지운다. **구버전 코드와 같은 DB를 동시에 쓸 수 없다.**
- 🔴 **구버전 AI 서버 프로세스를 모두 내린 뒤** 새 코드로 기동한다(V7은 기동 시 자동 적용). 롤링·블루그린 병행 금지 — 구버전의 `ON CONFLICT (kind, period, period_key, lang)`은 대응 제약이 사라져 **요약 저장([지금 분석])이 실패**하고, owner 조건 없는 조회는 남의 요약을 돌려주거나 행이 여럿이라 오류가 난다. Flyway 기본값(`*:future` 무시) 때문에 구버전도 **기동은 정상**이라 장애가 요약 위젯에서만 조용히 드러난다.
- 🔴 **롤백 시 코드만 되돌리면 안 된다**(위와 같은 이유로 요약 저장 실패). 새 버전 프로세스를 모두 내린 뒤 아래를 실행하고 구버전을 기동한다. 지워지는 것은 캐시뿐이다(다음 [지금 분석]에서 다시 만든다 — LLM 비용만 든다):
```sql
BEGIN;
DELETE FROM ai_insight;   -- 사용자별 행은 공유 캐시로 합칠 수 없다(누구 권한 범위인지 섞인다)
ALTER TABLE ai_insight DROP CONSTRAINT IF EXISTS ai_insight_uniq;
ALTER TABLE ai_insight ADD CONSTRAINT ai_insight_uniq UNIQUE (kind, period, period_key, lang);
ALTER TABLE ai_insight DROP COLUMN IF EXISTS owner_key;
DELETE FROM flyway_schema_history_ai WHERE version = '7';   -- 다시 올릴 때 V7이 재적용되도록
COMMIT;
```
- 구 4열 제약을 남기는 호환안은 없다(아래 V8 절은 별개): 새 코드는 같은 기간·언어에 사용자마다 행을 만들어 4열 제약에 걸리고, 부분 유니크 인덱스(`WHERE owner_key = ''`)는 구버전의 `ON CONFLICT (4열)`이 추론하지 못한다. 무중단 병행이 필요해지면 **새 테이블로 분리**(구버전은 `ai_insight`, 새 버전은 별도 테이블 → 후속 마이그레이션에서 구 테이블 삭제)해야 한다. 현재는 AI 서버가 단일 인스턴스 전제(대화 busy·OAuth 인가 코드/동의 대기가 메모리)라 정지 후 교체 배포로 충분하다.

### DB 마이그레이션 배포 주의 — V8(`ai_oauth_grant.generation`, MCP 연결 회수, ZM-157 A1)
V8은 `ai_oauth_grant`에 `generation BIGINT`(NULL 허용)를 **추가만** 하고, 기존 활성 연결(`generation IS NULL`)을 **일괄 폐기**한다. 스키마상으로는 구버전과 공존하지만(구버전의 `INSERT`·`SELECT *`는 새 컬럼을 무시) **보안상 병행 금지**다.
- 🔴 **BE를 먼저**(A1·D2·D5 반영본: `GET /internal/mcp/users/{id}/generation`·응답 `generation`·`expectedGeneration` 필수 검사·`gen` 클레임) 올린 뒤 AI를 올린다. 새 AI + 구 BE면 동의 승인 때 세대 조회가 실패해 **새 연결이 전부 막히고**(동의 화면 오류), 기존 연결 갱신도 응답 `generation` 누락으로 실패로 닫힌다(의도된 fail-closed). 반대로 새 BE + 구 AI면 구 AI의 발급 요청에 `expectedGeneration`이 없어 BE가 전부 거부한다 → **구 AI의 MCP 연결은 BE 배포 순간 전부 끊긴다**(AI를 곧바로 이어서 배포).
- Redis에 남은 D2 이전 인가 코드(세대 없음, 최대 10분)는 교환에서 거부된다 — 그 순간 연결 중이던 사용자는 다시 연결.
- 🔴 **구버전 AI 프로세스를 모두 내린 뒤** 새 버전을 기동한다. 구버전이 함께 돌면 (1) 구버전이 만든 연결은 `generation`이 NULL이라 새 버전에서 다음 갱신 때 끊기고, (2) 구버전은 `expectedGeneration` 없이 발급을 요청하므로 D2 반영 BE에선 전부 거부되고(연결 끊김), D2 이전 BE였다면 현재 세대로 재발급돼 회수가 무력화된다. 구버전은 또 잠금 실패(`FAILED_TO_ACQUIRE_LOCK`)에도 연결을 폐기하고 refresh 교체가 비조건부다.
- 배포 직후 모든 MCP 사용자는 **1회 재연결**이 필요하다(V8 일괄 폐기 — 이미 발급된 access는 최대 1h 유효). 재로그인 공지(A3 `typ` 도입)와 함께 안내한다.
- 롤백: 코드만 되돌려도 **기동은 된다**(컬럼 추가뿐, 구버전은 무시). 단 BE가 D2 반영본인 채로 AI만 되돌리면 위 (2)로 MCP 발급이 전부 거부된다 — AI를 되돌릴 땐 BE도 함께 되돌린다(그 경우 롤백 중에는 계정 보안 변경이 MCP 연결을 끊지 못한다). 다시 올릴 때 구버전이 만든 연결(NULL)은 런타임 거부로 1회 재연결된다. 컬럼을 지우려면 새 버전 정지 후:
```sql
BEGIN;
ALTER TABLE ai_oauth_grant DROP COLUMN IF EXISTS generation;
DELETE FROM flyway_schema_history_ai WHERE version = '8';   -- 다시 올릴 때 V8이 재적용(=그 시점 연결 일괄 폐기)되도록
COMMIT;
```

## 언어 (ko / en)
- **사용자 노출 문구**(오류 메시지·툴 안내·확인 카드 요약·연결 안내)는 `messages.properties`(ko 기본)·`messages_en.properties`. 요청 헤더 `x-lang: ko|en` → `Accept-Language` → 기본 ko(`LocaleFilter`). 채팅 턴 스레드에도 로케일이 전달된다.
- **모델에게 가는 텍스트**(툴 이름·설명·파라미터 설명·시스템 프롬프트)는 **영어 고정**. 답변 언어는 사용자 메시지 앞의 `[Answer language: Korean|English]` 태그로 지시한다(캐시 프리픽스를 안 깨려고 시스템 프롬프트에 안 넣음).
- MCP 툴 설명은 클라이언트(Claude 등) 사용자에게도 보이므로 영어.

## 패키지 구조
```
common/        AiErrorCode · AiException · ApiResponse · ApiExceptionHandler · Msg(i18n) · LocaleFilter
config/        AiProperties · WebConfig(CORS·executor) · BeClientConfig
auth/          AuthPreflight (BE 세션으로 인증·관리자 판정)
be/            BeGateway · BeProxyClient · BeApiException                     (BE REST 프록시)
llm/           LlmProvider · LlmProviderSource · LlmConfig · LlmProviderFactory · LlmProviderRegistry · LlmErrorClassifier
llm/settings/      BeLlmSettingsClient · LlmConnectionTestService              (설정 읽기·접속 테스트)
llm/settings/api/  LlmSettingsController · InternalSettingsController          (관리자·BE 설정 API)
tool/          AiTool · ToolTier · DataSource · ToolContext · ToolResult · ToolInput · JsonSchemas · ToolRegistry · AbstractBeTool · ZabbixCodes
tool/host/     zabbix_list_hosts · zabbix_get_host · list_host_groups · get_group_overview · get_host_metrics · zabbix_list_templates · zabbix_create_host · zabbix_update_host · zabbix_set_host_status · zabbix_set_device_type · zabbix_delete_host
tool/alert/    list_problems · get_problem · acknowledge_problem
tool/zabbix/   zabbix_list_items · zabbix_list_item_keys · zabbix_list_triggers · zabbix_create_item · zabbix_update_item · zabbix_set_item_status · zabbix_create_trigger · zabbix_update_trigger · zabbix_set_trigger_status · zabbix_link_templates · zabbix_unlink_templates
tool/asset/    list_assets · get_asset · update_asset · sync_assets · exclude_asset
tool/cost/     get_cost_dashboard · list_cost_incomplete · get_asset_cost · update_asset_cost
tool/system/   get_system_status · list_device_classifications
tool/report/   create_report · export_table · ReportBuilder(BE 페이지 순회→xlsx)
artifact/      ArtifactStore(ai_artifact + 디스크, 매시 만료 정리) · XlsxWriter(POI SXSSF)
artifact/api/  ArtifactController(GET /ai/artifacts/{id})
docs/          ScreenCatalog · CommandCatalog                                  (화면·명령 카탈로그)
docs/api/      ScreenController                                                 (화면·명령 조회 API)
insight/       AlertDigestService · AlertStatsCollector                         (AI 알림 분석)
insight/api/   InsightController                                                 (알림 분석 API)
usage/         UsageService · UsageStore · Pricing                              (AI 사용량·비용)
usage/api/     UsageController                                                   (사용량 조회 API)
chat/conversation/  Conversation · ConversationStore(v1 메모리)
chat/gate/          PendingActionGate (확인 카드)
chat/engine/        ChatService(턴 루프) · AiToolCallbacks(ToolCallback 어댑터) · TurnScope · SystemPrompt
chat/api/           ChatController · SseSink
mcp/                McpServerConfig(툴 노출·transport) · McpAuthFilter · McpTokenValidator
mcp/oauth/          OAuthService·OAuthController(메타데이터·등록·authorize·token) · ConsentService·ConsentController · OAuthStore · PendingAuthStore · BeMcpTokenClient
dev/api/            DevToolController (개발 전용)
```
컨트롤러는 HTTP 매핑만, 로직은 서비스(`OAuthService`·`ConsentService`·`LlmConnectionTestService`·`ChatTurnLauncher`).
프로바이더 전용 타입(Anthropic/OpenAI SDK)은 `llm/` 안에서만 쓴다.

## 툴 (현재 61개) — 데이터소스별 분리
툴마다 `source()`가 있다: **NEUTRAL**(어느 소스든 — BE 중립 엔드포인트) / **ZABBIX·ELASTIC·PROMETHEUS·DATADOG**(그 소스가 설정돼 있을 때만). 판정은 BE `/home/system-status.dataSources`(HealthPort, 60초 캐시). 채팅 턴엔 사용 가능한 툴만 넘기고, 사용자 메시지 태그에 `Data sources: zabbix=UP`을 붙인다. MCP는 목록엔 전부 있고 호출 시 미연결이면 오류.
- NEUTRAL: `list_host_groups` `get_group_overview`(그룹 현황: 위험 호스트·cpu/mem/disk 추이 집계·알람 합계·디스크 상위) `list_problems` `get_problem`(상세·조치 이력·이전 발생) `get_host_metrics`(자원 수치 집계) `get_system_status` `list_device_classifications` `list_assets` `get_asset` `acknowledge_problem`(WRITE) `create_report`(엑셀 리포트) `export_table`(모델의 표 → 엑셀) `update_asset`(WRITE, 담당자·생애주기·메모) `sync_assets`(WRITE) `get_cost_dashboard` `list_cost_incomplete` `get_asset_cost`(감가상각 상세) `update_asset_cost`(WRITE) `exclude_asset`(DESTRUCTIVE, 관리 제외/복원) `search_docs`(제품 사용 가이드 검색 — BE를 안 부르는 유일한 툴) `brief_problem`(알람 원인 브리핑) `list_config_changes`(구성 변경 이력)
- 🔴 **`brief_problem`은 4개 조회를 한 번에 모은다**(알람+조치이력·이전 발생·같은 시간대 다른 알람(같은 호스트/다른 호스트로 분리)·자원 수치·**직전 구성 변경**). 원인 추적에서 가장 자주 빠지는 조각이 구성 변경이라 BE에 조회 EP(`/zabbix-manage/change-logs`)를 새로 열었다 — 이력은 예전부터 쌓고 있었지만 읽는 길이 없었다.
- 🔴 **`check_monitoring_coverage`는 목록 1콜로 판정한다** — 템플릿 없음·아이템 0·트리거 0·에이전트 불가는 `/hosts/manage` 응답이 이미 다 준다(itemCount·triggerCount·templates·agentAvailable). 호스트마다 상세를 도는 구조면 40대에서 40콜이 나가고 그건 점검이 아니라 부하다. 자원 계열 누락(`deep`)만 호스트당 1콜(상한 20).
- 🔴 **알람 상세에는 호스트가 없다**(`/event/problems/{id}`는 triggerId만 준다) — 트리거 상세로 되짚는다. 안 그러면 자원·동시알람·변경이 통째로 빠진 채 "브리핑"이 나간다(실측). `list_host_charts` `create_host_chart`(WRITE) `update_host_chart`(WRITE) `delete_host_chart`(WRITE)
- 🔴 **커스텀 차트(`/host/{id}/widgets`)**: 위젯 = 제목 + 차트종류(line/area/bar/scatter/pie/gauge, FE `TWidgetChartType`과 1:1) + 아이템 id 목록 + 12칸 그리드 좌표. **자리는 툴이 계산**한다(기존 위젯 아래) — 모델이 좌표를 지어내면 첫 위젯 위에 겹쳐 그려진다. **아이템이 그 호스트 것인지 검증**한다: 남의 호스트 아이템도 BE는 저장에 성공하고 화면엔 빈 차트만 남는(조용한 실패) 구조라 툴에서 막는다.
- 🔴 **비용 툴은 "출처"를 같이 준다** — 상각 파라미터가 자산별 예외인지 기기유형 기본값인지(`*Source`), 취득일이 추정(created_at 폴백)인지. 그걸 빼면 모델이 기본값을 확정 사실처럼 말한다. `periodTotalCost`는 상각+유지보수+리스 **총합**이라 필드 주석으로 못박았다.
- 🔴 **비용 파라미터 변경은 과거까지 소급 재계산된다**(스냅샷 없음) → `update_asset_cost` 확인 카드 문구가 그 경우에만 ⚠로 바뀐다.
- ZABBIX: `zabbix_list_hosts` `zabbix_get_host`(상세+모니터링 카테고리 요약) `zabbix_list_templates` `zabbix_list_items` `zabbix_list_item_keys` `zabbix_list_triggers` `zabbix_create_host`(WRITE) `zabbix_update_host`(WRITE) `zabbix_set_host_status`(WRITE) `zabbix_set_device_type`(WRITE) `zabbix_link_templates`(WRITE) `zabbix_unlink_templates`(WRITE, clear=이력까지 삭제) `zabbix_create_item`(WRITE, trapper/dependent는 delay 0 자동) `zabbix_update_item`(WRITE) `zabbix_set_item_status`(WRITE) `zabbix_create_trigger`(WRITE) `zabbix_update_trigger`(WRITE) `zabbix_set_trigger_status`(WRITE) `zabbix_delete_host`(DESTRUCTIVE, confirmName) `zabbix_delete_items`(DESTRUCTIVE, ≤10) `zabbix_delete_triggers`(DESTRUCTIVE, ≤10) `check_monitoring_coverage`(안 보고 있던 것 찾기) `list_maintenances` `schedule_maintenance`(WRITE) `cancel_maintenance`(WRITE)
- 🔴 **점검 기간은 일회성만 만든다** — 반복(매주/매월)은 Zabbix timeperiod 원형이라 자연어에서 옮기다 틀리면 "매주 토요일이 매일"이 되어 알림이 영영 죽는다. 반복은 화면에서.
- 🔴 **기본은 알림만 억제(수집 유지)**. `stopCollection=true`는 그 구간 데이터가 영구히 비므로 확인 카드 문구가 ⚠로 바뀐다. 진행 중인 점검을 지우는 것도 마찬가지(억제됐던 알림이 즉시 쏟아진다). `check_notification_delivery` `list_alert_action_options` `create_alert_action`(WRITE) `list_media_types` `set_media_type_status`(WRITE) `list_alert_actions` `set_alert_action_status`(WRITE) `list_user_notifications` `set_user_notification`(WRITE)
- 🔴 **액션 생성은 모델에게 Zabbix 원형을 만들게 하지 않는다** — 바디가 중첩 Map(filter.conditions·operations.opmessage)이라 한 칸 틀리면 "아무에게도 안 가거나 전원에게 폭탄"이다. 툴은 최소 심각도·범위·수신자·채널만 받고 **구조는 서버가 조립**하며, 확인 카드는 id를 이름으로 되돌려 **사람 문장**으로 초안을 보여 준다(id 나열은 검토가 안 된다). 에스컬레이션·복구 알림·태그 조건은 화면에서.
- 🔴 **알림은 셋이 다 맞아야 나간다**(채널·수신처·액션) — 하나만 빠져도 **조용히** 안 나가고 어디에도 에러가 없다. 그래서 개별 조회보다 `check_notification_delivery`(3단 진단)를 중심에 뒀다. 🔴 사용자 수신처 PUT은 **전체 교체**라 read-modify-write(다른 채널 보존). 심각도는 "이상"을 비트마스크로 변환(high → 48). 🔴 **액션 생성/수정은 일부러 안 열었다** — 바디가 Zabbix 원형(중첩 Map)이라 자연어에서 옮기다 틀리면 "알림이 안 가거나 전원에게 폭탄"이 된다.
- 🔴 **`zabbix_update_host`는 read-modify-write다.** BE `PUT /hosts/manage/{id}`가 **전체 교체**(templates 안 보내면 전부 unlink, monitored_by 기본 0)라 툴이 먼저 단건 GET으로 현재값을 읽어 되돌려 보낸다. 프록시 감시 호스트는 proxyId를 복원할 수 없어 거부한다(화면에서 고치라고 안내). 태그는 add/remove 병합, device_type은 별도 필드.
- 🔴 **BE 호스트 생성/수정 바디의 인터페이스 키는 `interface`**(`@JsonProperty("interface")`). `hostInterface`로 보내면 **조용히 무시돼 인터페이스 없는 호스트**가 만들어진다(2026-08-19 실측·수정).
- 새 소스(Prometheus 등)의 툴은 `source()`만 그 소스로 두고 이름에 접두어(`prometheus_…`)를 붙인다. 중립 개념(호스트그룹·알람)은 BE 중립 엔드포인트를 쓰는 툴로.
- 🔴 **DESTRUCTIVE는 확인 카드에 대상 "이름"을 싣는다** — `AiTool.summarize(ToolContext, input)`(ctx 있는 오버로드)에서 BE를 한 번 읽어 호스트/아이템/트리거 이름을 채운다. id만 적힌 카드는 사람이 검토할 수 없어 확인 절차가 형식이 된다. 조회 실패는 요약만 포기하고 실행은 막지 않는다.
- 🔴 **`zabbix_delete_host`는 confirmName을 툴에서도 재검증**한다(BE도 검증하지만, 모델이 이름을 지어낸 채 카드까지 가는 경로를 앞에서 끊는다). 대상 ≤10은 삭제 3종 공통.
## 화면 카탈로그 · "이 화면 요약" — 2026-08-19
- `resources/docs/screens.json`(30개 화면: 경로·메뉴 위치·무엇을 보여주나·주의점·그 화면을 커버하는 툴·한국어 검색어). 화면이 늘면 **json에 한 줄** 추가면 되고 코드는 안 바뀐다.
- 화면 안에 탭이 있으면(`?tab=item` 등) **탭 단위까지** 설명한다 — "아이템 탭이 뭐 하는 데야"에 화면 전체 설명이 나가면 답이 안 된다. 탭 텍스트도 검색 색인에 들어간다.
- `search_docs` 툴이 이걸 검색한다 — "어디서 하나요?"에 메뉴 경로를 지어내지 않게 하는 장치. 🔴 **한국어 검색어(`keywords`)가 사실상 주 색인**이다: 본문은 모델용 영어라 한국어 질의가 화면 이름에만 걸린다. 조사는 뒤 1~2글자를 떼어 맞춘다("엑셀로"→"엑셀"), 단 **조사를 뗀 매치는 점수를 낮게** 준다(안 그러면 "비밀번호"가 "비밀값"에 밀린다 — 실제로 밀렸다).
- **"이 화면 요약/분석"**: FE가 `POST /ai/conversations/{id}/messages` 에 `route`(현재 경로)를 같이 보내면, 그 턴의 사용자 메시지 앞에 `[Current screen: … — 무엇을 보여주는 화면 … Tools that cover it: …]`가 붙는다. 카탈로그에 없는 경로면 경로만 싣고 "search_docs로 확인하라"고 지시한다(지어내기 방지). 등급은 `ToolTier`(READ=바로 실행, WRITE/DESTRUCTIVE=확인 카드). BE `DELETE /hosts/manage/{id}`는 `confirmName` 바디를 요구한다(delete_host 만들 때 참고).

## 파일 산출물(엑셀 리포트) — 2026-08-19
- `create_report`(kind=problems|hosts|assets + 필터): BE 목록 API를 **페이지 단위로 끝까지** 읽어(`AI_REPORT_MAX_ROWS` 기본 5000) xlsx(데이터 시트 + 요약 시트, 열 제목은 사용자 로케일)로 쓰고 `ai_artifact`(V3)에 등록 → 결과에 `artifactId`·`downloadUrl`. `export_table`은 모델이 이미 가진 표(≤500×30)를 그대로 xlsx로.
- 파일 본문은 `AI_ARTIFACTS_DIR`(기본 java tmpdir/moveseye-ai/artifacts), 메타는 DB. `AI_ARTIFACTS_TTL`(24h) 지나면 매시 삭제. 다운로드는 `GET /ai/artifacts/{id}` — 다른 /ai/** 와 같은 쿠키 인증, **소유자(userId)만**(남의 것·만료는 404).
- 툴 결과에 `artifactId`가 있으면 `AiToolCallbacks`가 SSE `artifact` 이벤트를 따로 쏜다(FE 다운로드 버튼용). 시스템 프롬프트가 모델에게 `[파일명](downloadUrl)` 링크로 안내하라고 시킨다.
- MCP 클라이언트(Claude Desktop 등)에서 부르면 링크는 나오지만 쿠키가 없어 그 자리에서 못 연다 — 브라우저에서 MovesEye에 로그인한 채로 열어야 한다(설치형은 같은 URL 뒤라 그대로 동작).
- 리포트 종류 추가 = `ReportBuilder.Kind` 한 줄(BE 경로·페이지 크기·열)+행 매퍼. 열 제목 키 `report.col.*` 양쪽 messages에 추가.

## AI 알림 분석(홈 위젯) — 2026-08-20
- 숫자는 서버가 계산(`insight/AlertStatsCollector`: 건수·심각도 분포·미확인·상위 호스트/문제·직전 기간 대비 증감), 모델은 그 숫자를 **해석·문장화**만 한다. 🔴 알람 수백 건을 그대로 태우면 토큰만 쓰고 합계는 오히려 틀린다.
- 요약은 기간 키(일자 `2026-08-20` / ISO 주차 `2026-W34`)+언어 단위로 `ai_insight`(V4)에 캐시. 홈을 열 때마다 LLM을 부르면 비용이 조회 수만큼 난다.
- 🔴 **사전 생성 배치는 일부러 없다** — 알람 조회는 사용자 세션 권한으로 나가는데 배치엔 세션이 없다. "서버가 아무개 관리자인 척" 토큰을 발급하면 권한 흔적이 사라져서, 결정 전엔 만들지 않았다. 대신 위젯이 캐시를 먼저 보고 없으면 사용자가 [지금 분석]을 눌러 **그 사람 권한으로** 만든다.
- BE 홈 위젯 카탈로그에 `ai_alert_digest`(관리자 전용) 추가 — 저장 정책만 BE, 데이터는 이 서버.

## "/" 명령 목록 — 2026-08-20
`resources/docs/commands.json`(7그룹 26명령). 선택하면 **입력창에 문구가 채워질 뿐**이고 실행은 기존 대화와 같은 경로다 — 명령을 코드로 분기하면 "이 명령은 되고 저 문장은 안 되는" 반쪽 UI가 되고 자연어의 강점을 스스로 버린다. `{호스트}` 같은 자리표시자는 사용자가 채운다(한/영 개수 일치를 테스트가 강제). `route`를 주면 그 화면용 명령이 앞으로 온다.

## 대화 저장
Postgres(BE와 같은 DB, dev는 도커 5433) `ai_conversation` / `ai_message`(kind=HISTORY 모델용·TRANSCRIPT 화면용, jsonb). Flyway는 `flyway_schema_history_ai`로 분리, `baseline-version: 0`(BE 테이블이 이미 있는 스키마라 baseline이 필요한데 기본 1이면 V1을 건너뛴다 — 실제로 한 번 당함).
턴 끝마다 `ConversationStore.persistTurn`(HISTORY 통째 교체 + TRANSCRIPT 꼬리 추가), 메모리 캐시 1시간, 보존 `AI_RETENTION_DAYS`(30) 지나면 매일 04:17 삭제. busy(동시 턴 방지)는 메모리 — 단일 인스턴스 전제.

새 툴 추가 = `AbstractBeTool` 상속 + `@Component`. 이름은 `verb_noun`, 스키마는 `JsonSchemas`(strict 호환: 전부 required, 선택은 null 허용, additionalProperties=false, 범위 검증은 `ToolInput`에서), 결과는 compact JSON(원본 DTO 통째 금지).

## 개발용
- dev 프로필이면 `POST /ai/dev/tools/{name}` 로 모델 없이 툴 직접 실행(BE 프록시 검증·QA). 운영 yml은 고정 off(확인 게이트 우회 엔드포인트).
- 테스트: `.\gradlew.bat test` — 스키마/입력검증/BE 언랩/컴팩트 매핑/ChatService 루프(가짜 ChatModel로 툴 왕복·게이트 취소).

## 함정 메모
- Git Bash `curl -d`에 한글을 인라인으로 넣으면 cp949로 나가 400(Invalid UTF-8) — 파일(`--data-binary @msg.json`)로 보낼 것.
- BE 세션은 재로그인/시간 경과로 `INVALID_TOKEN`이 날 수 있다 → 툴 결과에 401 문구로 나타난다(AI 서버 결함 아님).
- Spring AI 2.0은 프롬프트 옵션이 모델 기본값과 병합되지 않는다 → 턴마다 `defaults.mutate()…build()`로 완전한 옵션을 만든다(`LlmProviderFactory`).
- 🔴 `gradlew --stop` 금지 — 같은 Gradle 버전(9.2.1)을 쓰는 BE의 bootRun 데몬까지 죽는다(2026-08-19 실제 사고). 환경변수를 새로 넣어 띄울 땐 `bootRun --no-daemon`.
- Git Bash에서 `INTERNAL_API_TOKEN` 값이 `/`로 시작하면 MSYS가 경로로 바꾼다 → `MSYS2_ENV_CONV_EXCL=INTERNAL_API_TOKEN` 또는 hex 토큰.
