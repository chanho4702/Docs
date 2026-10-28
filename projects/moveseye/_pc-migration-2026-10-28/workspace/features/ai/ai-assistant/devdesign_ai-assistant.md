# MovesEye 개발 설계 — AI 어시스턴트 (명령형 설정 에이전트)

> 작성일: 2026-08-18 · 상태: **툴 목록 설계(구현 전)** · 대상: 신규 `moveseye-ai`(별도 서버) + `moveseyee_fe`(채팅 UI) · BE는 기존 REST 소비
> 결정 근거: 사용자 결정 — ① AI는 **별도 서버**(`moveseye-ai`)로 띄운다 ② 툴 목록부터 설계 ③ **2026-08-19 프로바이더 중립으로 전환**: 고객마다 LLM이 다르다(OpenAI·Azure·Ollama…) → 공식 Anthropic SDK 대신 **Spring AI 2.0 + Boot 4**(별도 서버라 BE 3.3과 무관).
> 참고: Spring AI 1.1은 adaptive thinking 부재로 탈락. 2.0은 Boot 4 필수·Jackson 3(`tools.jackson`)·Anthropic/OpenAI 모듈이 공식 SDK 위에 재작성됨(2026-08-19 실측). "SDK 두 개(Anthropic+OpenAI) 나란히"는 메시지/툴콜/스트리밍 포맷 추상화를 우리가 다시 짜는 일이라 채택 안 함.
> **구현 상태(2026-08-19)**: `C:\solutions\moveseye-ai` 스캐폴드 완료 — READ 툴 7개·BE 프록시·확인 게이트·SSE 컨트롤러·프로바이더 팩토리(Anthropic/OpenAI/Azure/Ollama). 단위 11 green, 실 BE 상대 7툴 런타임 확인. **실 LLM 대화는 API 키가 없어 미검증**(가짜 ChatModel로 루프·게이트 검증만).

## 0. 이 기능의 목적

> **"채팅으로 명령하면 MovesEye 설정·운영 작업을 대신 수행한다."** — MCP처럼 에이전틱하게, 그러나 제품 안에서.

- 범위는 **우리가 이미 REST로 래핑한 것**만. Zabbix에 있는데 우리가 안 감싼 기능(매크로·Maintenance 등)은 툴에 없다 → 래핑이 먼저.
- AI가 우리 로직을 얹지 않는다([[zabbix-wrapper-principle]]) — 툴은 기존 엔드포인트의 얇은 프록시. 권한·감사·라이선스는 BE가 그대로 판정.

## 1. 아키텍처 (별도 서버안)

```
FE(채팅 패널) ──SSE──▶ moveseye-ai (:3100)  ──REST(Authorization + x-visitor-id 전달)──▶ moveseye-be-spring (:3000) ──▶ Zabbix / DB
                          │ Anthropic Java SDK (claude-opus-5, adaptive thinking, streaming)
                          │ 대화 저장 · 확인 게이트 · 툴 결과 슬리밍
```

| 항목 | 결정 | 이유 |
|---|---|---|
| 배치 | **별도 Spring Boot 앱** `moveseye-ai` | BE 재빌드·Boot 버전과 분리, API 키 격리, 장애 격리(AI 죽어도 모니터링 무관) |
| BE 호출 | FE가 보낸 `Authorization`·`x-visitor-id`를 **그대로 전달** | RBAC(AdminAccessChecker)·감사로그 actor·라이선스 판정이 BE에서 그대로 작동. AI 서버는 권한을 따로 갖지 않는다 |
| 툴 = REST 프록시 | 각 툴은 BE 엔드포인트 1개(가끔 2개 조합)에 1:1 | 새 BE 코드 없음. 계약은 이미 Swagger에 있음 |
| 응답 슬리밍 | BE 응답(FE용 큰 DTO) → 툴별 compact 필드만 모델에 전달 | 토큰·캐시·정확도. 목록은 상한 20~50건 |
| 확인 게이트 | 쓰기 툴은 **서버가 루프를 멈추고** FE에 `confirm_required` 이벤트 → 사용자 OK → 실행 → 루프 재개 | 모델이 스스로 "확인됨" 플래그를 세울 수 없게. §3 |
| 대화 저장 | AI 서버 자체 테이블(`ai_conversation`, `ai_message`) — DB 위치는 미결(§7) | 재접속·감사 추적 |
| 라이선스 | feature `AI_ASSISTANT`(프리미엄) — 발급기·BE 4파일 사본 동시 수정 필수([[premium-license-design]]) | 업셀 항목 |
| 모델 | **프로바이더 중립(Spring AI 2.0)** — `ai.llm.provider`로 ANTHROPIC/OPENAI(호환 포함)/AZURE_OPENAI/OLLAMA 택1. Anthropic이면 `claude-opus-5`+adaptive thinking+effort medium+캐시(SYSTEM_AND_TOOLS), OpenAI면 reasoning_effort 매핑. 서버측 fallbacks는 Spring AI 옵션에 없어 v1 제외 | 고객 LLM 상이 |
| LLM 정보 입력 | **구현 완료(2026-08-19, 설치 단위·관리자)**: BE `setting.type=LLM`(V24, apiKey `enc:v1:` 암호화) ← `GET/POST /settings/llm`(관리자) · AI 서버는 `GET /internal/settings/llm`(공유 토큰 `INTERNAL_API_TOKEN`, 양쪽 .env)로 평문 키 수신 → `LlmProviderRegistry`가 기동 시+60초 감지+`POST /ai/settings/reload`로 재시작 없이 교체. `POST /ai/settings/test` 접속 확인(키 비우면 저장 키). 환경변수는 폴백. **남은 것 = 설정 > AI 화면(FE)** | 사용자 결정 "(a) 설치 단위, 관리자 입력, BE 테이블" |

### 1.1 별도 서버의 트레이드오프(사용자 판단용)
- 👍 BE 무수정·독립 배포·API 키 격리·나중에 MCP 서버(외부 에이전트용) 노출도 이 서버가 담당.
- 👎 홉 하나 추가(툴당 +수십 ms, 체감 무시 가능), 인증 전달 코드 필요, BE의 서비스 메서드를 직접 못 써서 **REST에 없는 조합은 툴로 못 만든다**(=REST 먼저 추가). AI 서버 재기동 시 진행 중 확인 게이트 소실(v1 허용).

## 2. 툴 설계 원칙

1. **의도 단위, 안전 단위로 자른다.** `call_zabbix_api` 같은 만능 툴 없음. 파라미터는 사용자 어휘(호스트 이름·심각도 단어) 그대로 받되, ID 해석은 조회 툴로 선행.
2. **이름→ID 해석 규칙(시스템 프롬프트)**: 쓰기 전 반드시 `list_*`로 대상 확정. 후보 2개 이상이면 실행하지 말고 사용자에게 고르게 한다. 0건이면 만들지 말고 보고.
3. **3등급**: `READ`(게이트 없음) / `WRITE`(확인 카드) / `DESTRUCTIVE`(확인 카드 + 대상 이름 재표시 + 삭제 개수 상한 10).
4. **툴 결과는 compact JSON** — id·name·status·핵심 3~6필드. 원본 DTO 통째 금지.
5. **에러는 BE 바디(200+code)를 그대로 모델에 전달**하되 `is_error`로 표시. 모델이 재시도할지 사용자에게 물을지 판단.
6. **비밀값 마스킹**: 설정 조회 툴은 BE가 이미 마스킹한 값만. 자격증명 쓰기 툴은 v1에 없음.
7. **strict tool use**(`strict: true`, `additionalProperties:false`) — 파라미터 오타·환각 차단.

## 3. 확인 게이트 흐름

```
model → tool_use(create_trigger{...})
AI서버: 등급 WRITE → pending 저장(actionId, 요약문, 파라미터) → SSE `confirm_required{actionId, summary, params}` → 대기(최대 5분)
FE: 카드 렌더 [실행][취소] → POST /ai/actions/{actionId}/confirm | /cancel
AI서버: confirm → BE 호출 → tool_result(결과) → 루프 재개 → 스트리밍 계속
        cancel/timeout → tool_result("사용자가 취소함", is_error) → 모델이 정중히 마무리
```
- 한 턴에 쓰기 툴 여러 개(병렬 tool_use)면 **카드 하나에 묶어** 일괄 승인/개별 해제.
- DESTRUCTIVE는 카드에 대상 이름 목록 표시, 10건 초과면 툴 자체가 거부("나눠서 요청").
- 구현: SDK **수동 루프**(`stop_reason == tool_use` while문) — 확인 대기가 HTTP 요청 경계를 넘을 수 있어 Tool Runner 훅보다 제어가 쉬움. v1은 SSE 연결 유지 + `CompletableFuture` 대기(단일 인스턴스 전제).

## 4. 툴 목록 v1 (총 34개: READ 16 · WRITE 14 · DESTRUCTIVE 4)

### 4.1 READ — 대상 찾기·상태 보기
| # | 툴 | 파라미터 | BE 엔드포인트 | 반환(compact) |
|---|---|---|---|---|
| R1 | `list_hosts` | search?, groupId?, deviceType?, status?(enabled/disabled), limit≤50 | `GET /hosts/manage` | [{hostId, host, name, groups[], deviceType, status, ip}] |
| R2 | `get_host` | hostId | `GET /hosts/manage/{hostid}` + `GET /hosts/detail/{hostid}` | 인터페이스·템플릿·태그·그룹·프록시·가용성 |
| R3 | `get_host_health` | hostId | `GET /hosts/{hostid}/livecheck` + `/collected-info` | ping·agent 가용, cpu/mem/disk 현재값 |
| R4 | `list_host_groups` | search? | `GET /hosts/hostgroups` | [{groupId, name, hostCount}] |
| R5 | `list_templates` | search?, limit≤50 | `GET /zabbix-manage/templates` | [{templateId, name, groups[]}] |
| R6 | `list_device_classifications` | — | `GET /settings/device-classifications` | [{code, label}] |
| R7 | `list_problems` | hostId?, groupId?, severity?, acknowledged?, limit≤50 | `GET /event/problems` | [{eventId, host, name, severity, since, acked, suppressed}] |
| R8 | `get_problem` | eventId | `GET /event/problems/{id}` (+`/{id}/acknowledge` 이력) | 상세 + ack 이력 |
| R9 | `list_items` | hostId \| templateId, search?, status?, limit≤50 | `GET /zabbix-manage/items` | [{itemId, name, key, type, valueType, delay, status, source(template?)}] |
| R10 | `list_item_keys` | hostId | `GET /zabbix-manage/items/keys` | 트리거 expression 작성용 키 목록 |
| R11 | `list_triggers` | hostId \| templateId, search?, severity?, status?, limit≤50 | `GET /zabbix-manage/triggers` | [{triggerId, description, expression, priority, status, source}] |
| R12 | `get_trigger` | triggerId | `GET /zabbix-manage/triggers/{triggerid}` | 전체 필드 |
| R13 | `list_actions` | eventsource?, search? | `GET /zabbix-manage/actions` (+`/options` 캐시) | [{actionId, name, eventsource, status}] |
| R14 | `get_action` | actionId | `GET /zabbix-manage/actions/{actionid}` | 조건·오퍼레이션 요약 |
| R15 | `list_media_types` | — | `GET /zabbix-manage/media-types` | [{mediaTypeId, name, type, status}] (비밀값 없음) |
| R16 | `list_assets` | search?, limit≤50 | `GET /assets` | [{assetId, name, type, status, linkedHostId}] |

### 4.2 WRITE — 확인 카드
| # | 툴 | 파라미터(사용자 어휘) | BE | 비고 |
|---|---|---|---|---|
| W1 | `create_host` | host, name?, groupIds[] \| newGroupNames[], interface{type:agent/snmp/ipmi/jmx, ip?, dns?, port?}, templateIds[]?, tags[]?, deviceType?, proxyId? | `POST /hosts/manage` | `HostCreateReqDto` 1:1. 필수 누락 시 툴이 검증 에러 반환(모델이 되묻게) |
| W2 | `update_host` | hostId, 변경 필드만 | `PUT /hosts/manage/{hostid}` | 🔴 태그는 전체교체 — 툴 내부에서 `get_host`로 round-trip 병합 후 전송([[host-classification-tags-feature]]) |
| W3 | `set_host_status` | hostId, enabled | `PATCH /hosts/manage/{hostid}/status` | |
| W4 | `set_device_type` | hostIds[]≤50, deviceType | `PATCH /hosts/manage/device-type` | 일괄 분류 |
| W5 | `link_templates` | hostId, templateIds[] | `POST /zabbix-manage/templates/{id}/link` | host-side. 이미 링크된 건 무시 |
| W6 | `unlink_templates` | hostId, templateIds[], clear?(false) | `POST /zabbix-manage/templates/{id}/unlink` | clear=true는 DESTRUCTIVE 취급 |
| W7 | `create_item` | hostId \| templateId, name, key, type, valueType, delay?, units?, description?, interfaceId?, masterItemId? | `POST /zabbix-manage/items` | `ItemCreateReqDto` 1:1 |
| W8 | `update_item` | itemId, 변경 필드 | `PUT /zabbix-manage/items/{itemid}` | |
| W9 | `set_item_status` | itemId, enabled | `PATCH …/status` | |
| W10 | `create_trigger` | hostId \| templateId, description, expression, priority(0~5 또는 단어), recoveryMode?, recoveryExpression?, manualClose?, comments?, opdata?, url? | `POST /zabbix-manage/triggers` | `TriggerCreateReqDto` 1:1. 🔴 expression은 `/host/key` 형식 — 툴 설명에 예시 넣고 `list_item_keys` 선행 강제 |
| W11 | `update_trigger` | triggerId, 변경 필드 | `PUT /zabbix-manage/triggers/{triggerid}` | clearable 필드는 빈문자열=클리어(putIfProvided) |
| W12 | `set_trigger_status` | triggerId, enabled | `PATCH …/status` | |
| W13 | `acknowledge_problem` | eventId, message?, closeProblem?, changeSeverity?, suppressUntil?, acknowledge(true) | `PUT /event/{id}/acknowledge` | `EventAcknowledgeReqDto`. closeProblem=true는 카드에 강조 |
| W14 | `set_action_status` / `set_media_type_status` | id, enabled | `PATCH …/status` | 액션·미디어는 v1에서 **on/off만**(생성·수정은 필드가 Zabbix 원형 Map이라 v2) |

### 4.3 DESTRUCTIVE — 강확인
| # | 툴 | 파라미터 | BE | 제한 |
|---|---|---|---|---|
| D1 | `delete_host` | hostId | `DELETE /hosts/manage/{hostid}` | 1건씩만 |
| D2 | `delete_items` | itemIds[]≤10 | `DELETE /zabbix-manage/items` | 템플릿 상속 아이템은 BE가 거부 → 그대로 전달 |
| D3 | `delete_triggers` | triggerIds[]≤10 | `DELETE /zabbix-manage/triggers` | |
| D4 | `exclude_asset` | assetId | `DELETE /assets/{id}` (soft) | 복구는 `PATCH /restore` — v2 |

### 4.4 v1 제외(의도적) — 이유
| 영역 | 이유 |
|---|---|
| 설정 > Zabbix/클라우드 자격증명 쓰기 | 비밀값·연결 전환은 사람이 화면에서. AI는 조회(마스킹)만 |
| 사용자·역할·권한, 라이선스 | 권한 상승 경로. AI 밖 |
| 액션·미디어타입 생성/수정 | 요청 바디가 Zabbix 원형(`filter`/`operations` Map) — 자연어→구조 변환 정확도 확보 후 v2 |
| 네트워크 디스커버리·LLD·템플릿그룹 CRUD | 사용 빈도 낮음, v2 |
| 지리/네트워크 맵, 비용, 위젯 | 시각 편집 성격 |
| 리포트·스케줄러 설정 | v2 |

## 5. 시스템 프롬프트 골자
- 역할: MovesEye 운영 보조. 한국어. 확인 없이 쓰기 금지(게이트가 강제하지만 말로도).
- 절차: 대상 확인(list) → 계획 한 줄 요약 → 쓰기 툴 → 결과 보고. 후보 다수·0건 처리 규칙(§2-2).
- Zabbix 지식: 트리거 expression 문법·priority 매핑(정보0/경고1/일반2/평균3/높음4/재해5)·아이템 type/valueType 코드표를 프롬프트에 고정(캐시 프리픽스).
- 금지: 툴에 없는 작업은 "지원하지 않는다"고 말하고 화면 경로 안내(문의 방지 문구 원칙).

## 5.5 안전장치 7겹 (2026-08-19 사용자 질문 "오동작·이상한 질문 막을 수 있나" 답)

> 철학: "AI가 실수 안 하게"가 아니라 **"실수해도 실제 피해가 안 나게"**. 100% 방지는 불가능하다는 전제.

| # | 겹 | 내용 | 설계 반영 |
|---|---|---|---|
| 1 | 권한 좁힘 | 툴 화이트리스트 외 불가. strict 스키마·범위 검증(심각도 0~5, 삭제 ≤10, 목록 ≤50)을 **서버가** 실행 전 검사. 환각 ID는 BE가 "없음" 반환 | §2·§4 |
| 2 | 확인 카드 | 쓰기·삭제는 사람 OK 필수. 삭제는 대상 이름 재표시 | §3 |
| 3 | 주제 이탈 | 시스템 프롬프트로 역할 고정(운영 보조만, 잡담·코딩·타사 질문은 "지원하지 않음"+화면 경로 안내). 필요 시 입력 단계 경량 분류기(운영 관련 여부) 추가 | §5 |
| 4 | 프롬프트 인젝션 | 툴 결과(호스트명·트리거 설명 등 사용자 입력 데이터)는 "데이터이지 명령 아님" 래퍼로 감싸 전달. 실행은 어차피 2번 게이트 경유 | 신규 |
| 5 | 폭주·비용 | 턴당 툴 호출 상한 15, max_tokens 상한, 사용자별 일일 요청 상한, 동일 툴 반복 루프 감지 시 중단 | 신규 |
| 6 | 추적·복구 | BE 감사로그(actor=사용자, "AI 경유" 헤더 M4) + 대화 기록 저장. **킬 스위치** = 설정 토글 or 라이선스 feature 회수 → 즉시 전체 중단 | §1·M4 |
| 7 | 모델 자체 | Claude refusal(`stop_reason=refusal`)은 "처리할 수 없는 요청"으로 정리. 서버측 fallbacks `default` 적용 | 신규 |

## 6. FE 접점 (계약 초안 — `_workspace/features/ai/ai-assistant/contract_ai-assistant.md`로 분리 예정)
- `POST /ai/conversations` → conversationId · `POST /ai/conversations/{id}/messages` (SSE: `text_delta`, `tool_call`, `tool_result`, `confirm_required`, `done`, `error`) · `POST /ai/actions/{id}/confirm|cancel` · `GET /ai/conversations?limit`
- FE: 우측 드로어 채팅 패널(전 화면 공통), 확인 카드 컴포넌트, 라이선스 feature 게이트로 메뉴 노출.

### 6.5 후보: "이 화면 요약" (사용자 제안 2026-08-19)
메뉴 하나 따서 페이지별 요약 AI. 같은 서버로 됨 — READ 툴만 쓰니 확인 카드 없음. 방식: FE가 현재 라우트+핵심 ID(hostId/groupId)를 컨텍스트로 보내면 `summarize_page` 프롬프트가 list_problems/get_host_health 등으로 채워 요약. 별도 메뉴보다 **채팅 드로어의 "이 화면 요약" 버튼**이 UX상 자연스러움. v1.5 후보 — 사용자 결정 대기.

## 6.7 MCP 계정 연동 (2026-08-19 구현 완료 — 사용자 요청 "우리 계정으로 연동해서 토큰, 계정별 읽기/쓰기 권한")
- **A안(MovesEye = MCP 서버)** 구현: `moveseye-ai` `/mcp`(Streamable-HTTP, Spring AI MCP 서버) + 자체 OAuth 2.1 인가 서버(메타데이터·동적 등록·PKCE·refresh 회전) + FE 동의 화면. 사용자는 클라이언트에서 "연결"만 누른다.
- **계정별 권한**: BE `user.mcp_permission`(V25: NONE/READ/READ_WRITE, 관리자가 사용자 관리에서 부여) → 동의 때 scope 상한 → BE `/internal/mcp/tokens`가 발급 시 재검사 → BE `McpAccessInterceptor`가 경로 허용목록+scope(read=GET만)로 최종 차단. 토큰은 BE 서명 JWT `typ=mcp`(1h) — 시각 세션 검사 면제.
- 노출 툴: 10개 전부(READ 7·WRITE 3). MCP엔 확인 카드가 없어 WRITE는 계정 권한 + 클라이언트 측 확인에 의존.
- 실측 E2E(2026-08-19): 401 디스커버리→등록→authorize→동의→토큰→tools/list·call→BE 403(비허용 경로)→refresh→연결 끊기→invalid_grant 전부 통과.
- 언어: 사용자 문구 ko/en(`x-lang`), 모델 텍스트 영어 고정 + 답변 언어 태그.

## 7. 미결(사용자 결정 필요)
| # | 항목 | 선택지 | 권고 |
|---|---|---|---|
| M1 | 대화 이력 저장소 | ~~Redis~~ | **(a) 확정·구현 완료(2026-08-19)** — Postgres `ai_conversation`/`ai_message`(V1, flyway_schema_history_ai 분리, baseline 0). Redis는 나중에 확인 게이트/캐시용 |
| M2 | AI 서버 스택 | ~~(a) Boot 3.3 + 공식 SDK~~ (b) Boot 4 + Spring AI 2.0 | **(b) 확정(2026-08-19)** — 프로바이더 중립 요구 |
| M3 | 다중 인스턴스 | v1 단일. 확인 게이트 상태·busy를 Redis로 옮기면 다중 가능 | v1 단일(확정) |
| M6 | FE 접근/노출(2026-08-19 확정) | FE→AI 서버 직접 호출(CORS) · **우측 드로어 + 별도 페이지 `/ai-assistant` 둘 다, 상태 공유**(사용자 최종 2026-08-19) · **관리자만** 노출 · 순서 = FE 설정 화면 → 실 LLM 검증 → WRITE 확장 | 확정 |
| M4 | 감사 표기 | BE 감사로그에 "AI 경유" 표시 헤더(`x-ai-conversation`) 추가 여부 | 추가 권고(BE 소폭 수정) |
| M5 | 대화 보존 기간 | 30일 / 무기한 | 30일 + 리포트 retention과 동일 배치 |

## 8. 착수 순서(제안)
1. `moveseye-ai` 스캐폴드 + BE 프록시 클라이언트(헤더 전달) + READ 툴 5개(R1·R4·R7·R9·R11)로 대화 루프 검증
2. 확인 게이트 + WRITE 3개(W1·W10·W13) — "호스트 등록·트리거 생성·알람 ack" 데모 시나리오
3. 나머지 툴 채우기 → FE 드로어 → 라이선스 feature → QA(functional-qa로 시나리오 10개)
