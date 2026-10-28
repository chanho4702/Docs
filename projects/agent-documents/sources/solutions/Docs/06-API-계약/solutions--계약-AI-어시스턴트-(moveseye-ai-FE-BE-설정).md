# 계약 — AI 어시스턴트 (moveseye-ai ↔ FE, BE 설정)

> 작성 2026-08-19 · 상태: **BE·AI 서버 구현 완료(런타임 검증됨) → FE 연동 착수** · 설계 정본 `devdesign_ai-assistant.md`
> 서버 두 곳: **BE(:3000)** = 기존 `VITE_API_URL`, **AI(:3100)** = 신규 `VITE_AI_URL`(기본 `http://localhost:3100`). FE는 AI 서버를 **직접** 호출한다(결정 #3).

## 0. 공통
- 인증: BE와 완전히 동일 — HttpOnly 쿠키(`withCredentials: true`) + 헤더 `x-visitor-id`. AI 서버는 그 쿠키로 BE `/users/my-profile`을 호출해 사용자를 확인한다(별도 로그인 없음).
- 응답 껍데기: BE와 동일 `{status:"success"|"error", code, errorCode?, message?, data?}`. FE 인터셉터(1겹 언랩)를 재사용할 수 있게 **AI 서버용 axios 인스턴스**를 하나 더 만든다(baseURL만 `VITE_AI_URL`, 나머지 인터셉터 동일).
- 오류 코드(`errorCode`, HTTP 응답·SSE `error` 이벤트 공통):
  `AI_UNAUTHORIZED`(401) · `AI_FORBIDDEN`(403, 관리자 전용) · `AI_BAD_REQUEST` · `AI_NOT_FOUND` · `AI_CONVERSATION_BUSY`(409, 이전 턴 처리 중) · `AI_ACTION_NOT_PENDING` · `AI_BE_UNREACHABLE`/`AI_BE_ERROR`(502) · `AI_LLM_UNCONFIGURED`(503, 설정 없음 → 설정 화면 안내) · `AI_LLM_AUTH` · `AI_LLM_MODEL_NOT_FOUND` · `AI_LLM_RATE_LIMIT` · `AI_LLM_UNAVAILABLE` · `AI_LLM_UNREACHABLE` · `AI_LLM_TIMEOUT` · `AI_LLM_BAD_REQUEST` · `AI_LLM_ERROR` · `AI_INTERNAL`
  → `message`는 이미 사용자용 한국어 문구. FE는 그대로 표시하고, `AI_LLM_UNCONFIGURED`만 "설정 > AI로 이동" 링크를 붙인다.
- 노출 범위(결정 #5): **관리자(ADMIN/SUPER_ADMIN)만** — `useAuth().isAdmin` 기준으로 메뉴·드로어 버튼 숨김. 라이선스 feature `AI_ASSISTANT` 게이트는 BE enum에 아직 없음 → `FeatureGate` 자리만 TODO 주석.

## 1. 설정 > AI (LLM 접속정보) — 관리자
### 1.1 BE (`VITE_API_URL`)
| 메서드 | 경로 | 요청 | 응답 `data` |
|---|---|---|---|
| GET | `/settings/llm` | — | `null`(미설정) 또는 `{id, type:"LLM", value:{provider, baseUrl, model, effort, maxTokens}, createdAt, updatedAt}` — **apiKey는 절대 안 옴** |
| POST | `/settings/llm` | `{provider, apiKey?, baseUrl?, model, effort?, maxTokens?}` | 위와 동일 |

- `provider`: `"ANTHROPIC" | "OPENAI" | "AZURE_OPENAI" | "OLLAMA"`
- `apiKey`: **비워 보내면 "기존 키 유지"**(Zabbix 비밀번호와 같은 규칙). 최초 저장인데 비면 `SETTING_PASSWORD_REQUIRED`(400). OLLAMA는 키 없이 저장 가능.
- `baseUrl`: 비우면 프로바이더 기본. OPENAI 호환 게이트웨이(vLLM·LM Studio·OpenRouter…)·Azure(`https://{resource}.openai.azure.com`)·Ollama(`http://host:11434`)는 필수 안내.
- `model`: 필수. AZURE_OPENAI는 배포 이름. `effort`: `""|low|medium|high|xhigh|max`(선택, 기본 medium). `maxTokens`: 256~128000(선택, 기본 8000).

### 1.2 AI 서버 (`VITE_AI_URL`) — 관리자
| 메서드 | 경로 | 요청 | 응답 `data` |
|---|---|---|---|
| GET | `/ai/settings/status` | — | `{state:"ready"|"unconfigured", provider:"openai model=… source=db"|null, source:"db"|"env"|null, version, lastError, checkedAt}` |
| POST | `/ai/settings/test` | `{provider, apiKey?, baseUrl?, model, effort?, maxTokens?}` (폼 값 그대로) | `{ok:true, latencyMs, model, reply, message:"연결 성공"}` 또는 `{ok:false, errorCode, message, latencyMs?}` — **HTTP는 항상 200**, `ok`로 판정. apiKey 비우면 저장된 키로 시험 |
| POST | `/ai/settings/reload` | — | status와 동일 — **저장 성공 직후 반드시 호출**(안 하면 최대 60초 뒤 자동 반영) |

### 1.3 화면
- 경로 `/setting/ai`(기존 설정 하위, `adminOnly`), 메뉴 "AI 어시스턴트" (i18n ko/en).
- 카드 1 "현재 상태": status(state 뱃지, provider 문자열, source, lastError, checkedAt) + [새로고침].
- 카드 2 "LLM 접속정보" 폼: provider(Select) / apiKey(Input.Password, placeholder "저장된 키 유지하려면 비워두세요" — 저장돼 있으면 안내) / baseUrl / model / effort(Select) / maxTokens(InputNumber). 버튼 [연결 테스트](test → 결과 Alert) [저장](BE POST → 성공 시 AI reload → status 갱신 → message).
- provider별 힌트 텍스트(모델 예시·baseUrl 필요 여부) 표시. 폼 규칙은 기존 Zabbix/클라우드 설정 화면과 같은 스타일.

## 2. 채팅(드로어 + 페이지) — 관리자 (`VITE_AI_URL`)  ※ 2026-08-19 최종: **드로어 유지 + 별도 페이지 추가, 상태 공유**
### 2.1 REST
| 메서드 | 경로 | 응답 `data` |
|---|---|---|
| POST | `/ai/conversations` | `{id, title:null, createdAt, updatedAt, busy:false, messages:0}` |
| GET | `/ai/conversations?limit=20` | `[{id, title, createdAt, updatedAt, busy, messages}]` (내 것만, 최근순) |
| GET | `/ai/conversations/{id}` | 위 + `transcript:[…]` (재접속 시 다시 그릴 사람용 기록) |
| DELETE | `/ai/conversations/{id}` | `{deleted:boolean}` |
| POST | `/ai/actions/{actionId}/confirm` · `/cancel` | `{actionId, decision:"APPROVED"|"CANCELLED"}` / 404 `AI_ACTION_NOT_PENDING` |
| GET | `/ai/tools` | `[{name, tier:"READ"|"WRITE"|"DESTRUCTIVE", description, inputSchema}]` (도움말용) |
| GET | `/ai/screens/resolve?route=` | **(2026-08-20 추가)** `{route, known, id, name, menu, path, tab?, examples[], tools[]}` — 지금 보고 있는 화면 이름(로케일 반영, 탭이 있으면 `"화면 · 탭"`)과 그 화면에서 바로 눌러 볼 예시 질문. 모르는 경로도 200 `{known:false}`(404 아님). 🔴 FE는 `route`에 **pathname + `?tab=` 만** 실어 보낸다(서버는 `tab`만 읽는다) |
| GET | `/ai/commands?route=` | **(2026-08-20 추가)** `{groups:[{id,label,hint,commands:[{id,label,template,forThisScreen}]}], suggested:[…], screenId?}` — 입력창 "/" 메뉴. 선택 시 `template`을 **입력창에 채우고 사용자가 고쳐 보낸다**(자동 전송 금지). `{호스트}` 자리표시자는 그대로 둔다 |
| GET | `/ai/insights/alerts?period=daily\|weekly` | **(2026-08-20 추가)** 홈 위젯 `ai_alert_digest`. 기본은 캐시만 → `{period, available:false, message}` 또는 `{available:true, periodKey, summary(마크다운), stats, model, generatedAt, cached}`. **`generate=true`(사용자가 [지금 분석] 클릭) 일 때만 LLM 호출**, `refresh=true`는 재생성. 관리자 전용. LLM 미설정/키 오류는 502 `AI_LLM_*` |
| GET | `/ai/artifacts/{id}` | **(2026-08-19 추가) 산출물 다운로드** — 바이너리(xlsx), `Content-Disposition: attachment; filename*=…`(CORS expose 됨). 소유자만, 아니면/만료면 404 `AI_NOT_FOUND`. 24h 후 자동 삭제 |

**transcript 항목** `{type, at, …}`: `user{text}` · `assistant{text}` · `tool_call{name,tier,input}` · `tool_result{id,name,error,elapsedMs,preview}` · `confirm_required{actionId,name,summary}` · `confirm_resolved{actionId,decision}` · `artifact{artifactId,filename,url,sizeBytes,expiresAt}`(2026-08-19)

### 2.2 메시지 전송 = SSE (POST)
`POST /ai/conversations/{id}/messages` body `{message}`(≤4000자) **+ 선택 `route`(≤300자, 2026-08-19 추가 — 사용자가 보고 있는 화면 경로, 예 `/asset/cost`)**, 응답 `text/event-stream`.
- **"이 화면 요약/분석" 버튼**: 채팅 UI(드로어·페이지)에서 현재 라우트(`location.pathname` + 필요하면 주요 쿼리)를 `route`로 실어 보내면 AI가 그 화면이 무엇인지 알고 해당 READ 툴로 실제 수치를 채워 답한다. 일반 대화에도 `route`를 항상 실어 보내면 "여기 뭐가 문제야?" 같은 지시대명사가 통한다(드로어는 화면 위에 떠 있으므로 특히 유용).
- **POST라 EventSource 불가** → `fetch(url, {method:"POST", credentials:"include", headers:{"Content-Type":"application/json","x-visitor-id":…}, body})` 후 `response.body` ReadableStream을 읽어 `event:`/`data:` 줄 파싱(빈 줄이 이벤트 구분). 요청 전 HTTP 오류(401/409/503)는 일반 JSON 껍데기로 옴.
- 이벤트(`data`는 JSON):
  - `text_delta {text}` — 어시스턴트 답변 조각(이어 붙여 렌더, 마크다운)
  - `tool_call {id, name, tier, input}` — "🔍 list_hosts 실행 중…" 칩
  - `tool_result {id, name, error, elapsedMs, preview}` — 칩을 완료/실패로 갱신(preview는 접힌 상세)
  - `confirm_required {actionId, callId, name, tier, summary, input, timeoutSeconds}` — **확인 카드**: summary + input(키:값 표) + [실행][취소]. DESTRUCTIVE면 빨간 강조. 응답은 2.1의 confirm/cancel POST. 카드가 떠 있는 동안 스트림은 열려 있고 입력창은 잠근다.
  - `confirm_resolved {actionId, decision:"APPROVED"|"CANCELLED"|"TIMEOUT"}` — 카드 상태 갱신
  - `artifact {artifactId, filename, url, sizeBytes, expiresAt}` — **(2026-08-19 추가) 파일 산출물**(create_report/export_table 결과). `url`은 AI 서버 상대경로 `/ai/artifacts/{id}` → `VITE_AI_URL + url`을 쿠키·x-visitor-id 붙여 fetch → blob 저장(파일명은 `filename` 또는 Content-Disposition). 메시지 영역에 **다운로드 카드/버튼**(파일명·크기·"24시간 후 만료")로 그린다. 모델 답변에도 `[파일명](/ai/artifacts/…)` 마크다운 링크가 오는데 상대경로라 그대로 열면 FE 오리진으로 가니 **마크다운 링크 렌더러가 `/ai/artifacts/` 접두 링크를 가로채 같은 다운로드 로직**을 타게 한다.
  - `done {finish:"end_turn"|"max_tokens"|"refusal"|"error"|"empty", rounds, toolCalls, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, elapsedMs}` — 턴 종료(입력창 해제)
  - `error {errorCode, message}` — 턴 실패(그 뒤 스트림 종료). `AI_LLM_UNCONFIGURED`면 설정 화면 링크.
- 같은 대화에 동시 전송 금지(409 `AI_CONVERSATION_BUSY`).

### 2.3 화면 — 두 진입점, 상태 하나
- **드로어**: 헤더 AI 버튼(관리자만) → 우측 Drawer. 다른 화면을 보면서 쓰는 용도. `/ai-assistant` 페이지에 있을 땐 버튼 숨김/비활성.
- **페이지** `/ai-assistant`(adminOnly, 사이드바 최상위 메뉴 "AI 어시스턴트"): 좌 대화 목록(새 대화·삭제) + 우 채팅. 대화 선택은 URL query `?c=<id>`.
- 채팅 본문(메시지 리스트·툴 칩·확인 카드·입력창)은 **하나의 컴포넌트**를 양쪽이 재사용. 대화 목록·현재 대화·진행 중 스트림·확인 카드 상태는 **공용 store/context**(레이아웃 레벨) — 드로어에서 시작한 턴이 페이지에서도 보이고, App의 라우트 리마운트에도 살아남는다.
- 메시지 영역: 사용자 말풍선 / 어시스턴트 마크다운 / 툴 칩 / 확인 카드 + 입력창(Enter 전송, Shift+Enter 줄바꿈, 처리 중 잠금).
- 첫 진입에 대화가 없으면 예시 프롬프트 3개("linux 그룹 호스트 몇 대야?", "지금 심각도 높은 알람 보여줘", "web-01 트리거 목록").
- 상태 배너: `GET /ai/health`(인증 없음) `data.state`가 `unconfigured`면 페이지 상단에 "LLM 미설정 — 설정 > AI" 안내. `data.mcpEnabled`(boolean, 2026-08-19 추가)가 false면 MCP 관련 UI(연결된 앱·연결 안내·동의 페이지 안내)는 숨긴다(설치형 기본 OFF).

## 3. 현재 툴(61) — **데이터소스별 분리**(2026-08-19 결정: Zabbix·Elastic·Prometheus·Datadog는 연결 상태별로 할 수 있는 게 다르다)
`GET /ai/tools` 항목에 `source`(NEUTRAL | ZABBIX | ELASTIC | PROMETHEUS | DATADOG) 포함. 소스 전용 툴은 이름에 접두어. **연결 안 된 소스의 툴은 채팅 턴에 아예 노출되지 않는다**(BE `/home/system-status.dataSources` 기준, 60초 캐시). MCP는 목록엔 있되 호출 시 "소스 미연결" 오류.
- NEUTRAL(공통, 항상): `list_host_groups` · `get_group_overview` · `list_problems` · `get_problem` · `get_host_metrics` · `get_system_status` · `list_device_classifications` · `list_assets` · `get_asset`(assetId 없으면 자산 요약) · `acknowledge_problem`(WRITE) · **`create_report`**(2026-08-19: 엑셀 리포트 kind=problems|hosts|assets, 전건 페이지 순회 최대 5000행) · **`export_table`**(모델이 만든 소규모 표 → xlsx) · **자산·비용 6종(2026-08-19)**: `update_asset`(WRITE: 담당자·생애주기·메모만) · `sync_assets`(WRITE: add_only|add_update) · `get_cost_dashboard`(기간 KPI+지출 분해) · `list_cost_incomplete`(비용 미입력 큐+사유) · `get_asset_cost`(감가상각 상세·파라미터 출처) · `update_asset_cost`(WRITE: 취득가·취득일·내용연수·유지보수/리스, 소급 재계산 경고) · **`exclude_asset`(DESTRUCTIVE: 관리 제외 soft delete, restore=true로 복원)** · **`search_docs`(2026-08-19: 제품 사용 가이드 — 화면 30개 카탈로그 검색, "어디서 하나요?"에 답)** · **점검 기간 3종(2026-08-20)**: `list_maintenances` · `schedule_maintenance`(WRITE, 일회성만) · `cancel_maintenance`(WRITE) · **`check_monitoring_coverage`(2026-08-20: 템플릿 없음·수집 0·트리거 0·에이전트 불가 + deep이면 cpu/mem/disk/net 누락)** · **트리아지 2종(2026-08-20)**: `brief_problem`(알람 1건 원인 브리핑 — 조치이력·이전 발생·동시 알람·자원·직전 구성 변경을 한 번에) · `list_config_changes`(구성 변경 이력, BE 신규 EP `GET /zabbix-manage/change-logs`) · **알림 액션 생성 2종(2026-08-20)**: `list_alert_action_options`(사용자·그룹·미디어·호스트그룹 id) · `create_alert_action`(WRITE — 최소 심각도·범위·수신자·채널만 받아 서버가 Zabbix 구조 조립, 확인 카드는 이름 기반 초안) · **알림 설정 7종(2026-08-20)**: `check_notification_delivery`(채널·수신처·액션 3단 진단 — "왜 메일이 안 와요?") · `list_media_types` · `set_media_type_status`(WRITE) · `list_alert_actions` · `set_alert_action_status`(WRITE) · `list_user_notifications` · `set_user_notification`(WRITE, 전체 교체 API라 다른 채널 보존). ⚠️ **액션 생성/수정은 미제공**(화면으로 안내) · **커스텀 차트 4종(2026-08-20)**: `list_host_charts` · `create_host_chart`(WRITE) · `update_host_chart`(WRITE) · `delete_host_chart`(WRITE) — 호스트 모니터링 화면의 위젯(`/host/{id}/widgets`)을 대화로 만든다. 차트 종류는 FE `TWidgetChartType`(line/area/bar/scatter/pie/gauge), 위치·크기는 서버가 자동 배치(기존 위젯 아래, 기본 6×12)
- ZABBIX(Zabbix 연결 시): `zabbix_list_hosts` · `zabbix_get_host`(상세+"무엇이 모니터링되나" 카테고리 요약: cpu/memory/disk/network) · `zabbix_list_templates` · `zabbix_list_items` · `zabbix_list_item_keys` · `zabbix_list_triggers` · `zabbix_create_host`(WRITE) · `zabbix_link_templates`(WRITE, "메모리/네트워크 모니터링 켜줘") · `zabbix_create_item`(WRITE) · `zabbix_create_trigger`(WRITE) · **2026-08-19 추가 변경 8종(전부 WRITE·확인 카드)**: `zabbix_update_host`(이름·주소·그룹·분류·태그) · `zabbix_set_host_status`(활성/비활성, ≤10) · `zabbix_set_device_type`(분류 일괄, ≤50) · `zabbix_unlink_templates`(clear=true면 아이템·트리거·이력까지 삭제) · `zabbix_update_item` · `zabbix_set_item_status`(≤20) · `zabbix_update_trigger` · `zabbix_set_trigger_status`(≤20) · **DESTRUCTIVE 3종(2026-08-19)**: `zabbix_delete_host`(confirmName 재입력 필요) · `zabbix_delete_items`(≤10) · `zabbix_delete_triggers`(≤10) — 확인 카드 `summary`에 **대상 이름**이 실려 온다(FE는 그대로 보여주면 된다), `tier:"DESTRUCTIVE"`는 빨간 강조
- ELASTIC/PROMETHEUS/DATADOG: 아직 없음(BE 데이터소스가 붙으면 그 소스 툴을 추가)
확인 카드 흐름(2.2)은 실 LLM 키가 들어와야 실제로 볼 수 있다.

## 4. MCP 계정 연동 (2026-08-19 추가 — 외부 AI 에이전트가 MovesEye 계정으로 툴을 쓴다)
사용자가 Claude Desktop/Cursor 등에서 MovesEye를 연결하면 → 브라우저로 FE 동의 화면 → 승인 → 클라이언트가 토큰을 받아 `POST {AI}/mcp`를 호출한다. 계정별 권한은 **관리자가 사용자 관리에서** 준다.

### 4.1 BE (`VITE_API_URL`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| PATCH | `/users/{id}/mcp-permission` | 관리자. body `{permission:"NONE"|"READ"|"READ_WRITE"}` → `{id, mcpPermission}` |
| GET | `/users/my-profile` | 이제 `mcpPermission` 필드 포함(NONE/READ/READ_WRITE) |
| GET | `/users` (사용자 관리 목록, `UserResponseDto`) | 각 행에 `mcpPermission` 포함(2026-08-19 추가) → 사용자 관리 표 셀렉트 현재값 |

### 4.2 AI 서버 (`VITE_AI_URL`, 쿠키 인증)
| 메서드 | 경로 | 응답 `data` |
|---|---|---|
| GET | `/ai/oauth/consent/{rid}` | `{rid, clientName, clientId, redirectHost, requestedScope:"read"|"write", myPermission, canGrantRead, canGrantWrite, userId, username, expiresAt}` (평평한 필드) — 404 `AI_NOT_FOUND`(만료) |
| POST | `/ai/oauth/consent/{rid}` | body `{approve:boolean, scope?:"read"|"write"}` → `{approved, redirectTo}` — **FE는 `window.location.href = redirectTo`** (클라이언트로 돌아감). 권한 부족이면 403 `AI_FORBIDDEN`(message에 이유) |
| GET | `/ai/mcp/grants` | `[{id, clientId, clientName, scope, createdAt, lastUsedAt, expiresAt}]` 내 연결된 앱 |
| DELETE | `/ai/mcp/grants/{id}` | `{revoked, note}` 연결 끊기 |

### 4.3 화면
- **동의 페이지 `/oauth/consent?rid=…`** (로그인 필요 — 미로그인이면 로그인 후 같은 URL로 복귀): 클라이언트 이름·돌아갈 호스트·요청 권한(read: 조회만 / write: 조회+변경) 표시. `canGrantWrite`가 false인데 write 요청이면 "읽기만 허용" 선택지 또는 안내(관리자에게 권한 요청). 버튼 [허용][거부] → 둘 다 응답의 `redirectTo`로 이동. 만료(404)면 "클라이언트에서 다시 연결하세요".
- **내 정보(MyPage) > 연결된 앱**: grants 목록(이름·권한·연결일·마지막 사용) + [연결 끊기].
- **사용자 관리**: 사용자별 "MCP 권한" 셀렉트(NONE/READ/READ_WRITE) → PATCH. 관리자만.
- 클라이언트 등록 안내 문구(설정 > AI 또는 MyPage): MCP 주소 = `{VITE_AI_URL}/mcp` (Streamable HTTP, OAuth). 예: Claude Desktop "커넥터 추가" 에 그 주소만 넣으면 됨.

### 4.4 언어(i18n) — 2026-08-19
AI 서버는 요청 헤더 **`x-lang: ko|en`**(없으면 `Accept-Language`, 둘 다 없으면 ko)로 사용자 문구·툴 안내·확인 카드 요약·모델 답변 언어를 정한다. **FE는 AI 서버 호출 전부에 `x-lang`(i18n.language 기준 ko/en)을 붙인다**(aiAxiosInstance·SSE fetch 둘 다).

## 🔄 FE 요청사항 (BE/AI에 필요한 변경이 생기면 여기 적는다)
- **AI 서버 CORS 허용 오리진에 Vite 대체 포트를 추가해 달라** (2026-08-19 FE 연동 중 실측).
  `application-dev.yml`의 `AI_CORS_ALLOWED_ORIGINS` 기본값이 `http://localhost:5173`뿐이라,
  5173이 이미 점유돼 Vite가 **5174로 자동 증가**하면 AI 서버 호출이 전부 `Failed to fetch`(브라우저
  CORS 차단)로 죽는다. 화면에는 "미설정"처럼 보여 **원인 추적이 어렵다**(BE :3000은 정상이라 더 헷갈림).
  → dev 기본값에 `http://localhost:5174,http://localhost:5175` 정도를 함께 넣어 주면 좋겠다.
  (당장은 FE에서 5173으로 띄워 우회 가능 — 차단 사유이지 결함은 아님.)
- 참고(변경 요청 아님): `GET /ai/health` 응답 `data`에는 계약에 없는 `tools`(등록 툴 개수)가 함께 온다.
  FE는 설정 화면 상태 카드에 **있으면 표시**하도록 선택 필드로 받아 뒀다.

### 2차(MCP 계정 연동) 연동 중 실측 — 2026-08-19

- 🔴 **`GET /users` 목록 응답에 `mcpPermission`이 없다 — 추가해 달라.**
  계약 §4.1은 `GET /admin/users`에 필드가 실린다고 적었는데, **FE 사용자 관리 화면(Zabbix 관리 >
  사용자 관리 > 사용자 탭)이 실제로 쓰는 목록은 `GET /users`**(`UserResponseDto`)다. 이쪽에는
  `mcpPermission`이 없어 화면이 **현재 값을 표시할 수 없다**(변경·저장은 정상 동작 확인).
  - 실측: `GET /users?limit=3` 응답 items에 필드 부재. DB에는 값이 있다
    (`user` 테이블: admin=READ_WRITE, chanho/guest/Admin=NONE).
  - `GET /admin/users`는 대안이 못 된다 — admin 계정으로도 **403 Access Denied**이고,
    페이지네이션·필터 계약도 목록 화면과 다르다.
  - 요청: `UserResponseDto`에 `mcpPermission`(= `user.getMcpPermissionOrNone()`) 한 필드 추가.
    FE는 이미 `TUser.mcpPermission?`(선택)으로 받고 있어 **추가되는 즉시 별도 수정 없이 표시**된다.
  - 그때까지의 FE 동작: 값이 없으면 셀렉트를 `-`(placeholder)로 비워 둔다.
    **모르는 값을 NONE으로 단정하지 않는다** — 실제 READ_WRITE인 계정이 "권한 없음"으로 보이면
    관리자가 오판한다. 저장에 성공한 값만 화면에 남긴다(로컬 override).

- 🔴 **계약 §4.2의 consent 응답 shape 정정**: `user{id, username}` 중첩이 아니라 **평평하다**.
  실제: `{rid, clientName, clientId, redirectHost, requestedScope, myPermission, canGrantRead,
  canGrantWrite, userId, username, expiresAt}` (`ConsentService.ConsentInfo` record 그대로).
  FE는 실제 응답(`userId`/`username`)에 맞췄다. 계약 문서를 고쳐 두면 다음 사람이 헷갈리지 않는다.

- 참고(변경 요청 아님): `GET /ai/health` `data.mcpEnabled`(boolean) 반영 완료.
  FE는 **명시적으로 `true`일 때만** MCP UI(MyPage 연결된 앱·커넥터 주소 안내·사용자 관리 MCP 권한
  컬럼)를 그린다. 필드가 없거나 헬스를 못 받은 상태는 **꺼짐**으로 본다(설치형 기본 OFF 전제).
  동의 페이지는 꺼져 있으면 "MCP 연동이 꺼져 있습니다" 안내로 끝낸다.

- 참고(변경 요청 아님): AI 진입점(사이드바 "AI 어시스턴트" 메뉴·헤더 AI 버튼)을 `GET /ai/health`
  `data.state === "ready"`로 게이팅했다. **AI 서버가 잠깐 내려가면 진입점이 함께 비활성**된다
  (2026-08-19 재기동 중 실제로 목격 — 결함 아님, 설계대로). react-query `staleTime` 60초·포커스
  refetch로 서버가 돌아오면 자동 복구된다.
