# AI 계정 모니터링 — 설계서 v1 (초안)

- 작성: 2026-08-24
- 상태: 🔒 **구현 완료 후 보류(숨김) — 2026-08-26 사용자 결정 "일단 안 쓸 것 같다"**. 코드·테스트는 전부 보존, FE 진입점만 피처 플래그(`AI_MONITOR_ENABLED=false`)로 숨김(메뉴·라우트·검색·홈 위젯 카탈로그·도움말) + moveseye-ai 챗봇 가이드 엔트리 제거(아래 부록에 보존). **부활 절차: FE 플래그 한 줄 true + 부록 엔트리 재추가**. BE(EP·배치)는 무수정 — 계정 미등록이면 배치는 no-op이라 무해.
- 구현 이력: v1 확정(08-24) → M1+M2+구독 활용도+Codex CLI+가이드 메일 구현·E2E 5라운드 완주(08-25, `review_ai-account-monitoring.md`) → 보류(08-26)

<details><summary>📦 부록: 보류로 제거된 moveseye-ai screens.json 엔트리 (부활 시 재추가)</summary>

```json
{
  "id": "monitoring-ai-usage",
  "path": "/monitoring/ai-account-usage",
  "ko": "AI 사용 현황",
  "en": "AI Usage",
  "menu": "Monitoring > AI Usage",
  "summary": "Organization-wide AI account monitoring (admin only): token usage and estimated cost of registered AI accounts, daily trend, per-model/workspace/API-key/user breakdown, key and member inventory with unused-item detection, and budget/spike alerts. Two source types: polling accounts (Anthropic/OpenAI Admin API keys) and receiving accounts (per-developer telemetry from Claude Code or OpenAI Codex CLI). Three tabs: Usage, Inventory, Accounts.",
  "howto": "Polling: register a provider Admin API key in the Accounts tab (connection test included); the hourly poll fills the Usage tab. Receiving (Claude Code / Codex CLI): add a receiving account for the tool — after acknowledging the data-collection notice you get a one-time receive token plus a ready-made settings snippet and an employee notice template to copy; each developer (or IT via managed deployment) puts the snippet into the tool settings once (Claude Code env / Codex config.toml), then usage flows in automatically and appears per user. Prompts/responses/code content are never collected. Costs are estimates and can lag up to a day. Set a monthly budget per account for 80/100% warnings. This screen is where accounts are managed — there is no separate settings menu. The setup guide can also be emailed to team members right after issuing a token (SMTP must be configured). Codex CLI reports tokens only, so its cost shows as unpriced.",
  "tools": [],
  "keywords": "AI 사용량 비용 계정 모니터링 토큰 예산 Anthropic OpenAI 어드민키 관리키 인벤토리 지출 클로드코드 수신 토큰 텔레메트리 사용자별 동의 코덱스 Codex 메일 발송 안내메일",
  "examplesKo": ["이번 달 AI 비용 얼마나 나왔어?", "AI 계정 어떻게 등록해?", "직원들 Claude Code 사용량 어떻게 수집해?", "안 쓰는 API 키 있어?"],
  "examplesEn": ["How much did we spend on AI this month?", "How do I register an AI account?", "How do I collect Claude Code usage from employees?", "Are there unused API keys?"]
}
```
</details>
- 대상: `moveseye-be-spring`(수집·저장·알람) + `moveseyee_fe`(화면). `moveseye-ai`는 스코프 밖(§8 통합 포인트만).
- 관련: `devdesign_ai-assistant.md`(moveseye-ai 자체 사용량 원장 `ai_usage`와 구분), `devdesign_premium-edition.md`(에디션 게이팅 미결 Q6), `audit_architecture-onprem-scaleout.md`(설치형 전제)

---

## 1. 배경·목적

MovesEye는 인프라 모니터링 제품이다. 고객 조직의 새 관심사인 **AI 지출·사용 현황**을 기존 감시 축(수집 → 시계열 → 대시보드 → 알람)에 그대로 태운다.

한 줄 정의: **"조직이 쓰는 AI 계정(API 조직·구독 시트·개발자 도구)을 등록하면, 사용량·비용을 시계열로 쌓고 예산/이상 알람을 보낸다."**

Langfuse류(개발자용 트레이싱)와의 차별점: 우리는 프롬프트 디버깅이 아니라 **운영 감시**다 — 비용, 활용률, 이상 징후, 알림.

## 2. 범위

두 수집 경로를 **처음부터 한 스키마·한 화면**에 담되, 구현은 마일스톤으로 순차 진행한다.

| 마일스톤 | 내용 | 근거 |
|---|---|---|
| **M1** | 폴링형: Anthropic Admin API(usage/cost/키 인벤토리) + OpenAI Usage·Costs API **동시**(Q1 확정) | 공식 API 확실, BE 배치만으로 구현 가능 |
| **M2** | 수신형: Claude Code OTel 메트릭 수신(OTLP http/json) → 개발자별 사용 현황 | 구독 계정을 볼 수 있는 유일한 공식 통로, 차별화 크다 |
| **M3** | 확장: Anthropic Enterprise Analytics API, OTel 이벤트 로그(툴 사용·에러), moveseye-ai `ai_usage` 소스 편입(Q5) | 고객 수요 확인 후 |

> Copilot·Cursor는 **범위에서 제외**(Q6 확정: 조직/팀 플랜 미보유 → 실검증 불가). 스키마의 provider enum 여지만 남기고 구현·화면·문서 어디에도 싣지 않는다.

**비범위(명시적으로 안 하는 것)**
- 프롬프트/응답 원문 저장·트레이싱(Langfuse 영역). OTel 이벤트도 기본 redaction 상태만 수신.
- 개인 구독 플랜(Claude Pro/Max, ChatGPT Plus)의 사용량 폴링 — 공식 API가 없다. 웹 스크래핑 금지(약관·취약성).
- AI 계정에 대한 **쓰기**(키 비활성화, 시트 회수 등) — 2차. M1~M3은 전부 읽기 전용.
- 잔액(남은 크레딧) 표시 — 프로바이더 API가 없다(기정사실, `moveseye-ai` V5 주석과 동일). "관리자 입력 예산 − 집계 사용량"으로만 계산하고 `estimated` 표기.

## 3. 아키텍처 개요

```
[경로 A: 폴링]  Anthropic Admin API / OpenAI Admin API / (M3: Copilot·Cursor)
                    │  SchedulerJob 주기 조회 (아웃바운드 HTTPS)
                    ▼
            ┌────────────────────────────────┐
            │ ai_mon_account (등록 계정)       │
            │ ai_mon_usage   (사용량 시계열)   │──→ 대시보드 · 홈 위젯
            │ ai_mon_inventory (키/시트 목록)  │──→ 알람 규칙 → 기존 알림 채널
            └────────────────────────────────┘
                    ▲
                    │  OTLP http/json POST (인바운드, 수신 토큰 인증)
[경로 B: 수신]  개발자 PC들의 Claude Code (CLAUDE_CODE_ENABLE_TELEMETRY=1)
```

- 위치: **`moveseye-be-spring` 일반 기능**으로 시작한다(AWS CE 연동과 같은 급). 엔진 포트 승격은 하지 않는다 — 데이터소스이긴 하나 호스트 메트릭과 질의 모양이 달라 기존 포트(Metric/Inventory/Alert)에 안 맞고, 승격 조건은 수집 엔진 설계서의 원칙을 따른다.
- 🔴 **설치형 제약**: 경로 A는 고객사 서버에서 `api.anthropic.com`/`api.openai.com`으로 **아웃바운드 인터넷이 열려 있어야** 동작한다. 폐쇄망 고객은 경로 A 불가·경로 B(내부망 수신)만 가능 — 화면이 이 사실을 안내해야 한다(연결 테스트 버튼 필수).

## 4. 경로 A — 폴링형 (M1)

### 4.1 프로바이더 스펙 (2026-08-24 문서 기준 — 🔴 구현 착수 시 실응답 실측으로 재확정)

**Anthropic** — Admin API 키(`sk-ant-admin…`, 콘솔 조직 관리자만 발급) + `anthropic-version` 헤더.
- 사용량: `GET /v1/organizations/usage_report/messages` — 토큰(input/output/cache)을 시간 버킷(1m/1h/1d)으로, `group_by`: `api_key_id`·`workspace_id`·`model`·`service_tier`. 페이지네이션 있음.
- 비용: `GET /v1/organizations/cost_report` — USD, 일 단위 버킷.
- 인벤토리: `GET /v1/organizations/api_keys`, `/workspaces`, `/users`.
- ⚠️ AWS(Bedrock 경유) 조직에는 Usage/Cost API가 제공되지 않음(콘솔만) — 문서 명시.
- Claude **Enterprise**(claude.ai 조직)는 Admin API 키가 없고 **Enterprise Analytics API**가 별도 존재(사용자 이메일·개인별 토큰/USD 귀속) → M3.

**OpenAI** — Admin 키 필요.
- 사용량: `GET /v1/organization/usage/completions`(+ embeddings 등 카테고리별), 버킷·`group_by`(project_id, model 등).
- 비용: `GET /v1/organization/costs` — 일 단위.

**공통 특성(화면·기대치 설계에 반영)**
- 비용 집계는 프로바이더 쪽에서 **수 시간~하루 지연**될 수 있다 → 대시보드는 "일 단위 비용 + 준실시간 토큰"으로 표기하고 `estimated`/`asOf`를 밝힌다.
- Admin API 호출 자체는 토큰 과금이 아니다(무료로 알려짐 — 🔴 실측 시 재확인). rate limit은 있으므로 폴링 주기는 보수적으로(§4.2).

### 4.2 수집 배치

- `SchedulerJob` 2종:
  - **usage-poll**: 1시간 주기. 마지막 적재 버킷 이후만 증분 조회(1h 버킷). 재실행 안전(멱등 upsert — 버킷+차원 조합이 자연키).
  - **cost-poll + inventory-poll**: 1일 주기(새벽). 비용은 **최근 3일을 매번 재조회**해 지연 정산분을 덮어쓴다(AWS CE에서 배운 지연 정산 패턴).
- 실패 처리: 계정별 `last_ok_at`/`last_error` 저장 → 화면 상태 배지 + "폴링 연속 실패" 알람(§7).

## 5. 경로 B — 수신형 (M2)

### 5.1 수신 엔드포인트

- `POST /ai-monitor/otlp/v1/metrics` — **OTLP http/json** 전용(공식 지원 확인됨). protobuf/grpc는 받지 않는다(의존성·복잡도 회피, 미결 Q3).
- 인증: 화면에서 발급하는 **수신 토큰**(계정 등록의 한 종류, `kind=RECEIVE`). 개발자는 아래를 셸 프로필에 넣는다:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://<moveseye-be>:3000/ai-monitor/otlp
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <수신 토큰>"
```

- 이 설정 스니펫은 화면이 복사 버튼으로 제공한다(도움말 없는 메뉴로 오안내하지 않기 — cloud-aws-gating 교훈).

### 5.2 메트릭 매핑 (Claude Code 공식 메트릭, 문서 확인됨)

| OTel 메트릭 | 우리 저장 |
|---|---|
| `claude_code.token.usage` (attr: `type`=input/output/cacheRead/cacheCreation, `model`) | `ai_mon_usage` 토큰 4열 |
| `claude_code.cost.usage` (USD) | `cost_micro_usd` (Claude Code 자체 추정치 — `priced=true`, `source=AGENT_REPORTED`) |
| `claude_code.session.count`, `active_time.total`, `lines_of_code.count` | 부가 지표(개발자 활동) — 별도 열 |
| 표준 attr: `user.id`·`user.email`·`organization.id`·`session.id` | 사용자 귀속 축(`user_key`=email 우선) |

- 카운터는 **델타 합산**으로 적재(60초 간격 export). 세션 단위 원장이 아니라 시간 버킷 합산으로 저장해 경로 A와 같은 모양을 만든다.
- 이벤트 로그(`OTEL_LOGS_EXPORTER`, api_error·tool_decision 등)는 M3 — 메트릭만으로 M2 가치가 선다.
- 🔴 `user.email`은 개인정보다 — 수집 고지 문구를 화면에 명시하고, 표시할 때 관리자만 개인 식별 뷰(폴링형 scope=all과 같은 원칙: "남의 사용 패턴은 업무 정보").

### 5.3 수집 동의·고지 (M2 필수 — 2026-08-25 사용자 지시)

설치형 B2B 특성상 최종 사용자(직원)가 제품 화면을 보지 않으므로, 동의 구조는 **관리자 고지 확인 + 배포용 안내문 제공** 2단으로 한다:

1. **관리자 고지 확인**: 수신 토큰 발급 화면에 수집 항목을 명시하고 확인 체크 없이는 발급 불가 —
   - 수집하는 것: 사용자 이메일·계정 ID, 모델별 토큰/추정 비용, 세션 수, 활동 시간, 코드 라인 수
   - **수집하지 않는 것(핵심 안심 포인트)**: 프롬프트·응답·코드 내용 원문 — Claude Code 기본 redaction 상태 그대로 받으며, 원문 수집 옵션(`OTEL_LOG_USER_PROMPTS` 등)은 안내하지도 받지도 않는다
   - 용도: 조직 내 AI 사용량·비용 파악. 표시: 개인 식별 뷰는 관리자 전용
2. **배포용 안내문 템플릿**: 회사가 직원에게 공지할 한글 안내문(수집 항목·미수집 항목·목적·조회 권한)을 화면에서 복사 제공 — 설정 스니펫과 한 쌍.
3. 대시보드 사용자별 뷰 상단에도 수집 범위 요약을 상시 노출(관리자가 오남용 범위를 착각하지 않게).

### 5.3.5 구독 플랜 대비 활용도 (2026-08-25 사용자 지시 — M2 확장)

🔴 **수신(구독) 계정에서 달러의 의미는 폴링 계정과 정반대다**: 폴링=실지출(초과는 나쁨·경고), 수신=**API 환산 가치**(정액 구독이므로 플랜가 초과는 본전 뽑는 것·좋음, 저활용이 시트 낭비·주의). 예산 로직 하나로 뭉개면 많이 쓴 사람에게 빨간 경고가 뜨는 뒤집힌 화면이 된다.

- **플랜 입력은 사용자별**(사용자 결정): 수신 계정에 기본 플랜가(월 USD, 예: 100) + 사용자별 예외 지정(예: A는 200). 사람마다 5x/20x 플랜이 다른 현실 반영.
- byUser에 플랜가·**활용도**(월 환산 사용액 / 플랜가 %) 노출 — 플랜 미지정 사용자는 활용도 없음.
- 표시 의미: 활용도 높음=긍정(색 반전 — 예산 경고색 금지), **저활용=시트 낭비 신호**(임계 예: 월중 기준 저조 표시). 알람 신설은 보류(무수신 알람이 극단 케이스를 이미 잡음) — 표시만.
- 수신 계정에서 monthlyBudgetUsd(지출 상한 시맨틱)는 쓰지 않는다 — 예산 경고/알람 평가에서 수신 계정 제외.

### 5.3.7 수신 대상 확장 — Codex CLI (2026-08-25 사용자 확인)

수신형은 Claude Code 전용이 아니다 — **OpenAI Codex CLI도 옵트인 OTel 내보내기를 공식 지원**한다(`~/.codex/config.toml`의 `[otel]`·`[otel.metrics_exporter]`, OTLP HTTP). 토큰은 `codex.turn.token_usage` 히스토그램(token_type: input/cached_input/output/reasoning_output/total)으로 온다.
- 수신 계정 provider에 `CODEX_CLI` 추가(kind=RECEIVE 동일 흐름 — 동의·토큰·스니펫). 스니펫은 env가 아니라 **config.toml 블록**.
- 🔴 Codex는 **비용(USD)을 주지 않는다** → 토큰만 적재, `priced=false`(M1의 "단가 미산정" 규칙이 그대로 화면에 정직하게 노출). `total`은 파생값이므로 이중 집계 금지(개별 type만 적재).
- 사용자 귀속 축은 실측으로 확정할 것(Claude Code처럼 email이 오는지 — 미실측 항목으로 관리).

### 5.4 설정 가이드 (M2 필수)

- 토큰 발급 → **완성된 설정 스니펫**(서버 주소·토큰이 채워진 `~/.claude/settings.json` env 블록) 복사 버튼 + 관리 배포(`managed-settings.json`) 경로 안내 3방식(§배포표).
- 연결 확인 UX: 설정 후 첫 수신 시 대시보드에 사용자 등장 → "무수신 N일" 알람이 미설정자를 짚는다.
- 화면 도움말(FE page-guide)과 AI 챗봇 화면 가이드(moveseye-ai screens.json)에 설정 절차 반영.
- **가이드 위치(2026-08-25 사용자 지시)**: 주 무대는 계정 추가/재발급 시점의 토큰 모달(이미 구현). **사용자별 탭에도** "사용자가 안 보이면? 설정 안내" 재진입 요약을 둔다.
- **가이드 메일 발송(2026-08-25 사용자 지시)**: 토큰 모달에서 받는 사람(이메일 목록) 입력 → 스니펫+공지문이 든 안내 메일 발송. 🔴 토큰은 해시만 저장하므로 **발급/재발급 직후에만 가능**(FE가 그 시점의 원문으로 본문 구성 → BE는 relay). 관리자 전용, 토큰이 메일로 나간다는 고지 필수. SMTP 미설정이면 침묵 대신 명확한 에러("메일 서버 미설정")로 — 이 기능이 Q7(SMTP 활성화)의 첫 실수요다.

## 6. 데이터 모델 (Flyway 초안 — 번호는 착수 시점 최신으로)

```sql
-- 등록 계정: 폴링 자격증명 or 수신 토큰. 자격증명은 ZM-105 암호화(enc:v1) 재사용
CREATE TABLE ai_mon_account (
    id            BIGSERIAL PRIMARY KEY,
    provider      VARCHAR(32)  NOT NULL,  -- ANTHROPIC | OPENAI | CLAUDE_CODE | (M3: ANTHROPIC_ENTERPRISE). VARCHAR라 추후 값 추가는 무마이그레이션
    kind          VARCHAR(16)  NOT NULL,  -- POLL | RECEIVE
    name          VARCHAR(128) NOT NULL,
    credential    TEXT,                   -- enc:v1 암호화. RECEIVE면 수신 토큰 해시
    enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    monthly_budget_usd NUMERIC(12,2),     -- 예산은 계정 단위(잔액 API 부재의 대체)
    last_ok_at    TIMESTAMP,
    last_error    TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT now()
);

-- 사용량 시계열: 두 경로가 같은 모양으로 적재. 버킷+차원 조합 upsert(멱등)
CREATE TABLE ai_mon_usage (
    id            BIGSERIAL PRIMARY KEY,
    account_id    BIGINT      NOT NULL REFERENCES ai_mon_account(id),
    bucket_start  TIMESTAMP   NOT NULL,
    bucket_width  VARCHAR(4)  NOT NULL,   -- 1h | 1d
    day           DATE        NOT NULL,   -- 집계 축 실체화(ai_usage와 동일 판단)
    source        VARCHAR(16) NOT NULL,   -- POLL | OTEL
    model         VARCHAR(128),
    workspace_key VARCHAR(128),           -- Anthropic workspace_id / OpenAI project_id
    api_key_id    VARCHAR(128),           -- 폴링형 키 귀속
    user_key      VARCHAR(128),           -- 수신형 사용자 귀속(email 우선)
    input_tokens  BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cache_read_tokens  BIGINT NOT NULL DEFAULT 0,
    cache_write_tokens BIGINT NOT NULL DEFAULT 0,
    cost_micro_usd BIGINT NOT NULL DEFAULT 0,  -- 정수 마이크로달러(ai_usage 교훈: double 합산 금지)
    priced        BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (account_id, bucket_start, bucket_width, source, model, workspace_key, api_key_id, user_key)
);
CREATE INDEX ai_mon_usage_day_idx ON ai_mon_usage (account_id, day);

-- 인벤토리 스냅샷: API 키·시트 목록(미사용 감지용). 폴링 때 전량 교체
CREATE TABLE ai_mon_inventory (
    id            BIGSERIAL PRIMARY KEY,
    account_id    BIGINT      NOT NULL REFERENCES ai_mon_account(id),
    item_type     VARCHAR(16) NOT NULL,   -- API_KEY | MEMBER | (M3: SEAT)
    external_id   VARCHAR(128) NOT NULL,
    display_name  VARCHAR(256),
    status        VARCHAR(32),
    last_used_at  TIMESTAMP,              -- 제공되는 경우만
    synced_at     TIMESTAMP   NOT NULL,
    UNIQUE (account_id, item_type, external_id)
);
```

- NULL 차원 주의: UNIQUE에 NULL이 섞이면 Postgres는 중복을 허용한다 → 적재 시 NULL 대신 빈 문자열 `''` 정규화(구현 노트).

## 7. 알람

> 🔴 **구현 중 정정(2026-08-25)**: "기존 알림 채널에 그대로 태운다"는 현 BE에서 **성립하지 않는다** — BE에 알림을 발신할 경로가 없다(EmailService는 spring.mail 미설정으로 빈 부재·전부 PENDING skip, Zabbix 액션은 Zabbix 발원 이벤트에만 반응하고 BE에 이벤트 주입 코드 없음, 알림벨은 problem.get 라이브 조회라 끼워 넣을 자리 없음). M1은 기존 관행(AWS 예산 BUDGET_EXHAUSTED·라이선스 배너)대로 **평가 + 상태 노출**까지: `GET /ai-monitor/alerts` + `usage/compact.alerts`가 창구이고 대시보드·홈 위젯이 표시한다. **실제 push는 미결 Q7**(§10) — SMTP 활성화 / 인앱 알림 테이블 신설 / Zabbix trapper 프로비저닝 중 택1(비용 비교는 계약서 `features/ai/ai-account-monitoring/contract_ai-account-monitoring.md` §5-A).

규칙 평가는 usage-poll 직후 + 일 1회.

| 규칙 | 조건(기본값, 계정별 조정 가능) |
|---|---|
| 예산 경고/초과 | 월 누적 비용 ≥ 예산의 80% / 100% (ai_usage의 WARN 90%와 통일할지 미결 Q5) |
| 사용량 급증 | 일 토큰이 직전 7일 평균의 N배(기본 3배) 초과 |
| 미사용 키/시트 | `last_used_at` 기준 N일(기본 90일) 이상 미사용 항목 존재 |
| 수집 실패 | 폴링 연속 3회 실패 or 수신 계정이 N일(기본 7일) 무수신 |

## 8. 화면 (FE)

> 🔄 **2026-08-25 사용자 결정으로 개편**: 계정 관리를 설정 메뉴에 두지 않고 **AI 사용 현황 화면 안에서 관리**한다. 설정 메뉴 항목은 만들지 않는다(초기 구현분 제거).

1. **모니터링 > AI 사용 현황** — 조회와 관리를 한 화면에:
   - 조회부: 계정 선택 × 기간 → KPI / 일별 추이 / 모델별·워크스페이스별·키별 표 / 인벤토리 / 알람 카드. `estimated`·`asOf`·지연 안내 상시 노출.
   - **관리부(같은 화면)**: "계정 관리" 탭(또는 헤더 관리 버튼) — 계정 등록(프로바이더 선택→Admin 키 입력)·수정·삭제·연결 테스트·예산 입력·상태 배지. 시크릿은 "비우면 유지"(ZM-100), 폐쇄망 안내 문구 포함. 계정 0건이면 조회부 대신 등록 유도 empty state.
   - 화면 전체가 관리자 전용(BE와 동일한 userRole 축)이라 관리부를 같은 화면에 둬도 권한 경계가 깨지지 않는다.
2. **홈 위젯** — "AI 계정 비용" 1종(이번 달 비용/예산/추이). 기존 위젯 레지스트리에 추가.
- 🔴 cloud-aws-gating 교훈 유지: 도달 가능한 경로(고아 화면 금지) / 도움말 등록 / 시크릿 "비우면 유지" 정합.

## 9. 보안

- Admin 키는 일반 API 키보다 권한이 세다(조직 멤버·키 관리 가능) — `enc:v1` 암호화 저장, 응답 마스킹(뒤 4자리), 어떤 로그 레벨에도 기록 금지(기존 규약).
- 수신 토큰은 해시만 저장, 발급 시 1회 표시.
- OTLP 수신은 body 크기 제한 + 미인증 즉시 401(무인증 수집기 오픈 금지).

## 10. 결정사항 (2026-08-24 전건 확정)

| # | 질문 | 결정 |
|---|---|---|
| Q1 | M1 프로바이더 범위 | **Anthropic + OpenAI 동시**(사용자 결정). 단 검증 순서는 실데이터가 이미 있는 Anthropic이 먼저 돌고, OpenAI는 계정 준비(§11) 완료 시점에 실측 |
| Q2 | 메뉴 IA | 기본안 채택 — "모니터링 > AI 사용 현황" 신설, 자산>비용 탭 요약 카드는 M3 |
| Q3 | OTLP http/json 파싱 | 기본안 채택 — 직접 매핑(otel-proto 의존성 안 늘림) |
| Q4 | 에디션 게이팅 | **일반 에디션**(사용자 결정). premium Feature 아님 — 라이선스 게이팅 코드 불필요, 전 고객 제공 |
| Q5 | moveseye-ai `ai_usage` 소스 편입 | 기본안 채택 — M3에서 노출(이미 API 있음 — `GET /ai/usage`) |
| Q6 | Copilot/Cursor | **범위 제외**(사용자 확인: 조직/팀 플랜 미보유 → 실검증 불가). §2 참고 |
| Q7 | **(신규·미결)** 알람 push 채널 — BE에 발신 경로가 없음이 구현 중 확인됨(§7) | **미결(사용자 결정 필요)**: ①SMTP 활성화(spring.mail 설정) ②인앱 알림 테이블 신설 ③Zabbix trapper 주입 중 택1. M1은 화면 노출(alerts EP)로 대체 |

## 11. 테스트·검증 전략

원칙: **"공식 API가 있다" ≠ "검증됐다"** — 이 레포의 반복 교훈(실서버 round-trip에서만 잡힌 결함 다수: 액션 filter, Zabbix 정렬, 언박싱 NPE 등). 문서 기반으로 코드를 쓰되, 실응답 실측 전에는 완료로 치지 않는다.

| 대상 | 방법 | 실계정 필요? |
|---|---|---|
| 경로 A: Anthropic | 콘솔에서 **Admin 키 발급(사용자 액션 필요)** → 실조직 조회. moveseye-ai가 이미 이 조직으로 호출 중이라 **사용량 데이터가 이미 쌓여 있다** = 별도 트래픽 생성 불필요. 호출 무과금(재확인 항목) | ✅ 이미 보유 |
| 경로 A: OpenAI | Admin 키 + 소액 크레딧으로 샘플 사용량 생성 | ⚠️ **착수 전 준비물**(사용자 액션) |
| 경로 B: Claude Code | **지금 쓰는 이 Claude Code가 곧 테스트 장비** — env 4줄 설정 후 dev BE(:3000)로 전송, 적재 확인. 구독(Max) 계정도 telemetry는 동일하게 나간다 | ✅ 이미 보유 |
| 회귀 | 실측 응답을 픽스처로 캡처 → 계약 테스트(파서·upsert 멱등성·마이크로달러 합산). 스키마 drift는 폴링 실패 알람이 운영에서 감지 | — |

## 12. 참고 (2026-08-24 확인)

> **조사 상세는 별도 문서** — 근거(출처 URL·코드 실측 경로)·사용 방법·미실측 체크리스트: `research_ai-account-monitoring.md`

- Anthropic Usage & Cost API / Admin API — platform.claude.com/docs (Admin 키 필요, AWS 조직 미제공, Enterprise는 Analytics API 별도)
- Claude Code Monitoring — code.claude.com/docs/en/monitoring-usage (OTLP grpc·http/protobuf·**http/json**, 메트릭 8종+이벤트 13종, 기본 redaction)
- OpenAI Usage/Costs API — platform.openai.com (organization usage·costs, Admin 키)
