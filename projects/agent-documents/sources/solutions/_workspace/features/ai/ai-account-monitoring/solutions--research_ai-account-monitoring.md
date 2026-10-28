# AI 계정 모니터링 — 조사 자료 (근거·방법 정리)

- 조사일: 2026-08-24
- 목적: 설계서(`devdesign_ai-account-monitoring.md`)의 판단이 **무엇을 근거로 했고, 각 기술을 실제로 어떻게 쓰는지**를 남긴다. 설계서가 "무엇을 만들까"라면 이 문서는 "왜 되는지 + 어떻게 하는지"다.
- 신뢰도 표기: ✅공식문서 확인(URL 명시) · ✅코드 실측(파일 경로 명시) · ⚠️지식 기반 — **구현 착수 시 실측으로 재확정 필요**

---

## 1. 사내 기존 자산 — 코드 실측 ✅

> 조사 방법: `moveseye-ai`·`moveseyee_fe` 소스 grep + 파일 직접 확인 (2026-08-24)

### 1.1 moveseye-ai에 이미 있는 것 (자체 어시스턴트 사용량 계량)

"계정별 AI 사용량 모니터링"의 축소판이 이미 존재한다. 이번 기능은 이것의 **외부 확장판**이라 설계 판단 다수를 재사용했다.

| 자산 | 위치 | 내용 |
|---|---|---|
| 원장 테이블 | `moveseye-ai/src/main/resources/db/migration/V5__ai_usage.sql` | LLM 호출 1건 = 1행. `owner_key`(사용자 id)·`username`(삭제 대비 표시명 보존)·`kind`·provider·model·토큰 4종·`cost_micro_usd`·`priced`·`conversation_id` |
| 집계 서비스 | `moveseye-ai/.../usage/UsageService.java` | 기간(day/week/month)·byKind/byModel/daily/byUser 집계, 월 예산 대비 percent/remaining/warn/over |
| API | `moveseye-ai/.../usage/api/UsageController.java` | `GET /ai/usage`(scope=all은 관리자만 — "남의 사용 패턴은 업무 정보"), `GET /ai/usage/compact` |
| FE 소비처 | `moveseyee_fe/src/pages/setting/ai/AiUsageCard.tsx`, `pages/home/widgets/ai/AiUsageWidget.tsx`, `hooks/useAiUsage.ts`, `services/ai.api.ts`, `types/ai.ts` | 설정>AI 카드(관리자면 사용자별 표)·홈 위젯·챗봇 하단 미터 |

**재사용한 설계 판단 (원장 코드 주석에 근거 명시돼 있음):**
- 🔴 **잔액(남은 크레딧) 조회 API는 프로바이더가 안 준다**(Anthropic·OpenAI 공통) → "관리자 입력 월 예산 − 우리가 센 사용량"으로 잔여를 만들고 응답에 `estimated: true`를 싣는다. (V5 파일 상단 주석 + UsageService javadoc)
- 🔴 **비용은 정수 마이크로달러(`cost_micro_usd`)로 합산** — double 합산은 총액이 어긋난다. (V5 주석)
- 🔴 **단가 미상 모델을 0원으로 적지 않는다**(`priced=false` + `unpricedCalls` 노출) — "싸게 쓰고 있다"는 거짓 확신 방지. (V5 주석)

### 1.2 재사용 가능한 인프라

| 인프라 | 근거 | 이번 기능에서의 용도 |
|---|---|---|
| 자격증명 암호화 `enc:v1` (AES-256-GCM) | ZM-105 `2839aed` (BE 설정 자격증명 암호화) | Admin API 키 저장 |
| SchedulerJob (DB 관리형 배치 스케줄) | BE V15/V16 계열 | 폴링 배치 2종 |
| 알림 채널·배달 경로 | 기존 알림 설정 (moveseye-ai 알림설정 툴 7종이 3단 진단할 정도로 성숙) | 예산/급증/미사용/수집실패 알람 전달 |
| 홈 위젯 레지스트리 | `moveseyee_fe/src/pages/home/widgets/registry.tsx` | "AI 비용" 위젯 추가 |

---

## 2. Anthropic — Admin API / Usage & Cost API ✅공식문서

> 조사 방법: 웹 검색(2026-08-24) → 공식 문서 확인
> 근거: https://platform.claude.com/docs/en/manage-claude/usage-cost-api · https://platform.claude.com/docs/en/manage-claude/admin-api

### 2.1 무엇이 가능한가

- 조직 전체 **토큰 사용량**을 모델별·워크스페이스별·API 키별·service tier별로 조회.
- **비용(USD) 리포트** 별도 엔드포인트.
- **인벤토리**: API 키 목록·워크스페이스·멤버 조회 (→ 미사용 키 감지의 재료).

### 2.2 사용 방법

1. **키 발급**: Claude Console에서 조직 **관리자 역할**만 Admin API 키(`sk-ant-admin…`) 발급 가능. 일반 API 키로는 이 엔드포인트들이 안 열린다.
2. **호출**: 헤더 `x-api-key: <admin키>` + `anthropic-version` 필수. ⚠️버전 값·페이지네이션 파라미터는 실측으로 확정.

```
GET https://api.anthropic.com/v1/organizations/usage_report/messages
    ?starting_at=...&ending_at=...&bucket_width=1h        # 1m | 1h | 1d
    &group_by[]=api_key_id&group_by[]=model               # workspace_id·service_tier도 가능
GET https://api.anthropic.com/v1/organizations/cost_report  # USD, 일 단위 버킷
GET https://api.anthropic.com/v1/organizations/api_keys     # 인벤토리
GET https://api.anthropic.com/v1/organizations/workspaces
GET https://api.anthropic.com/v1/organizations/users
```

### 2.3 제약 (문서 명시)

- ⚠️ **Claude Platform on AWS(Bedrock) 조직에는 Usage/Cost API 미제공** — 콘솔 화면으로만. Bedrock 고객은 CloudWatch/Cost Explorer 경로가 답(우리 AWS 연동 자산 활용 가능).
- **Claude Enterprise**(claude.ai 조직)는 콘솔에 안 나타나고 Admin API 키가 없다 → 별도의 **Enterprise Analytics API**가 유일한 경로. 이건 사용자 **이메일·개인별 토큰·USD·참여 패턴**까지 주는 더 세밀한 API (M3 후보). 참고: https://www.finout.io/blog/anthropics-enterprise-analytics
- ⚠️ Admin API 호출 자체는 토큰 과금이 아닌 것으로 알려짐 — **실측 재확인 항목**.

### 2.4 우리의 테스트 조건

- 이미 보유한 API 조직으로 검증 가능. **moveseye-ai가 이 조직 키로 실호출 중이라 사용량 데이터가 이미 쌓여 있다** → 테스트 트래픽을 만들 필요 없이 Admin 키 발급(사용자 액션)만 하면 즉시 실측 가능.

---

## 3. OpenAI — Usage / Costs API ⚠️지식 기반

> 조사 방법: 웹 검색 결과에 교차 언급 확인. 상세 파라미터는 공식 문서 재확인 전 — **M1 착수 시 실측 필수**

- `GET /v1/organization/usage/completions` (+ embeddings 등 카테고리별 엔드포인트), 시간 버킷·`group_by`(project_id, model 등).
- `GET /v1/organization/costs` — 일 단위 비용.
- **Admin 키**(일반 키와 구분, 조직 Owner가 발급) 필요 — Anthropic과 같은 구조.
- 테스트 조건: 계정 + 소액 크레딧으로 샘플 사용량 생성 필요(현재 미보유 → 준비물).

---

## 4. Claude Code — OpenTelemetry 텔레메트리 ✅공식문서 (가장 상세히 확인)

> 조사 방법: 웹 검색 → 공식 문서 **본문 전체 확인**(WebFetch, 2026-08-24)
> 근거: https://code.claude.com/docs/en/monitoring-usage

### 4.1 핵심 발견 — 설계를 바꾼 사실

**`OTEL_EXPORTER_OTLP_PROTOCOL`이 3종 지원: `grpc` · `http/protobuf` · `http/json`.**
→ `http/json`이 공식 지원되므로 우리 BE가 **protobuf/grpc 의존성 없이 일반 JSON POST 컨트롤러**로 받을 수 있다. 수신형(경로 B)의 구현 난이도를 결정한 사실.

또한 **구독(Pro/Max) 계정에서도 telemetry는 동일하게 나간다** — API 키 없이 계정 로그인으로 쓰는 사용자도 모니터링 대상이 된다. 구독형 계정을 볼 수 있는 유일한 공식 통로.

### 4.2 사용 방법 (개발자 PC 측 설정)

환경변수는 **Claude Code 실행 전에** 설정돼 있어야 한다(실행 후 export는 무효).

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1                  # 필수 스위치
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://<moveseye-be>:3000/ai-monitor/otlp
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <수신 토큰>"
# 선택: OTEL_METRIC_EXPORT_INTERVAL=60000 (기본 60초)
# 선택: OTEL_LOGS_EXPORTER=otlp (이벤트 로그 — M3)
```

### 4.3 수신하게 될 메트릭 (문서의 전체 목록)

| 메트릭 | 의미 | 단위 | 주요 속성 |
|---|---|---|---|
| `claude_code.token.usage` | 토큰 소비 | tokens | `type`(input/output/cacheRead/cacheCreation), `model` |
| `claude_code.cost.usage` | 세션 비용(자체 추정) | USD | `model` |
| `claude_code.session.count` | 세션 시작 수 | — | `start_type` |
| `claude_code.active_time.total` | 활동 시간 | s | `type`(user/cli) |
| `claude_code.lines_of_code.count` | 수정 라인 수 | — | `type`(added/removed) |
| `claude_code.commit.count` / `pull_request.count` | 커밋/PR 수 | — | — |
| `claude_code.code_edit_tool.decision` | 편집 승인/거부 | — | `tool_name`, `decision` |

**모든 메트릭 공통 속성**: `session.id`, `app.version`, `user.id`, `user.account_uuid`, `user.email`, `organization.id`, `terminal.type` → **사용자 귀속 축은 `user.email`** (개인정보 — 수집 고지·관리자 한정 뷰 필요, 설계서 §5.2).

### 4.4 이벤트 로그 (M3 후보, 문서 확인)

`OTEL_LOGS_EXPORTER=otlp` 시 13종 이벤트(`user_prompt`·`api_request`·`api_error`·`tool_result`·`tool_decision` 등)가 온다. **기본 redaction** — 프롬프트/응답 원문은 `OTEL_LOG_USER_PROMPTS=1` 등을 켜야만 포함된다. 우리는 원문 수집 안 함(설계서 비범위) → 기본 상태 그대로가 우리 정책과 일치.

---

## 5. 구독형(계정 연동) 제품 전반 조사 — 결론: 팀/엔터프라이즈만 API가 있다

> 조사 방법: 웹 검색(2026-08-24) + 지식. 아래 표의 ⚠️ 항목은 해당 제품 채택 시 재조사 필요

| 제품 | 프로그래밍 방식 조회 | 판단 |
|---|---|---|
| Claude Pro/Max (개인) | ❌ 없음. 앱 내 `/usage`뿐 | 폴링 불가. **Claude Code OTel이 유일한 공식 통로**(§4) |
| ChatGPT Plus (개인) | ❌ 없음 | 범위 밖 |
| ChatGPT Team/Enterprise | ⚠️ Enterprise Compliance API 존재 | 수요 확인 전 범위 밖 |
| GitHub Copilot (조직) | ✅ REST API — 시트 관리 + 사용 메트릭(활성 사용자·제안/수락) | API는 탄탄하나 **조직 플랜 미보유로 실검증 불가 → 범위 제외**(2026-08-24 사용자 확인) |
| Cursor (팀) | ⚠️ Admin API(멤버별 사용량) 존재 | 동상 — 범위 제외 |
| 웹 대시보드 스크래핑 | — | **금지**: 약관 위반 소지 + UI 변경에 즉시 붕괴. 제품에 넣을 수 없는 방식 |

**여기서 세운 원칙**: 공식 API가 있어도 **실계정으로 검증할 수 없으면 범위에 넣지 않는다.** (이 레포 반복 교훈 — 실서버 round-trip에서만 잡힌 결함 다수: 액션 filter -32602, Zabbix 대소문자 정렬, 언박싱 NPE 등. "문서 ≠ 실응답")

---

## 6. 미실측 항목 총정리 (구현 착수 시 실측 체크리스트)

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | Anthropic usage_report/cost_report **실제 응답 shape**(필드명·페이지네이션·`anthropic-version` 값) | Admin 키 발급 후 curl → 응답을 픽스처로 캡처 |
| 2 | Admin API 호출의 과금 여부·rate limit | 실호출 + 응답 헤더 확인 |
| 3 | 비용 집계 반영 지연 폭(수 시간~하루로 추정) | 실사용 발생 시각 vs cost_report 반영 시각 비교 |
| 4 | OpenAI usage/costs 엔드포인트·파라미터 전반 | 계정 준비 후 동일 절차 |
| 5 | OTLP http/json **실제 페이로드 구조**(resourceMetrics 중첩·델타/누적 temporality) | 이 개발 PC의 Claude Code로 dev BE에 실전송 → 바디 덤프 |
| 6 | Claude Code 메트릭의 카운터 누적 방식(재시작 시 리셋 여부) | 세션 재시작 걸쳐 실측 |

---

## 7. 출처 일람

- Anthropic Usage & Cost API — https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- Anthropic Admin API — https://platform.claude.com/docs/en/manage-claude/admin-api
- Claude Code Monitoring(OTel 전체 스펙) — https://code.claude.com/docs/en/monitoring-usage
- Anthropic Enterprise Analytics API 소개 — https://www.finout.io/blog/anthropics-enterprise-analytics
- 사내 코드 실측 — §1의 파일 경로들 (2026-08-24 기준)
