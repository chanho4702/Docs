# API 계약 — AI 계정 모니터링 (M1 폴링형)

- 작성: 2026-08-25 · BE: `moveseye-be-spring` (브랜치 ZM-79, **미커밋**)
- 설계 정본: `devdesign_ai-account-monitoring.md` v1 · 조사: `research_ai-account-monitoring.md`
- 범위: **M1(폴링형) + M2(Claude Code OTel 수신, 2026-08-25 추가)**. M3은 미구현.
- M2 계약은 문서 끝의 **# M2 — 수신형** 섹션에 있다(M1에 대한 증분으로 기술).
- 기본 URL: BE 루트(`http://localhost:3000`). 전 엔드포인트 **관리자 전용**.

---

## 0. 공통 규약 (FE가 먼저 알아야 하는 것)

| 항목 | 내용 |
|---|---|
| 응답 껍데기 | `{ status, code, data, ... }` — 기존 `ApiResult`. 성공은 `status:"success"`, `code:200` |
| **에러는 HTTP 200** | 비즈니스 오류는 전부 **HTTP 200 + body `code`/`errorCode`**. 401만 실제 상태 코드(원본 계약 보존) |
| **권한 거부** | HTTP **200** + `code: 403`, `status:"error"`. `errorCode` 없음(메시지 `Access Denied`) |
| 인증 | accessToken 쿠키(`withCredentials`) + **`x-visitor-id` 헤더 필수**(`@VisitorIdCheck`) |
| 권한 판정 | `AdminAccessChecker.requireAdmin` — **userRole ∈ {ADMIN, SUPER_ADMIN}**. `roleid` 기반 `@Roles` 아님(zabbix 미연동 admin도 통과) |
| 시각 | 모든 `LocalDateTime`은 서버 로컬 직렬화(`2026-08-25T04:30:00`). **버킷·집계 내부는 UTC 기준** |
| 금액 | 응답은 USD `double`. 내부 저장·합산은 정수 마이크로달러(합산 오차 차단) |
| **추정치** | `estimated`는 **항상 true**. 프로바이더가 잔액/실청구 API를 주지 않아 "예산 − 우리가 센 사용량"이다 |
| 🔴 **null 표현이 DTO마다 다르다** | 아래 표 참고. **`=== null` 비교를 쓰기 전에 반드시 확인할 것** |

### 0.1 🔴 `null` vs 키 생략 — DTO별로 갈린다

`@JsonInclude(NON_NULL)`이 걸린 DTO는 값이 없는 필드의 **키 자체가 응답에서 빠진다**(TS에서 `undefined`).
안 걸린 DTO는 `"field": null`로 나간다. **같은 계약 안에서 두 방식이 섞여 있으므로** 이 표가 정본이다.

| DTO | 응답 위치 | 빈 값 표현 |
|---|---|---|
| `AiMonAccountDto` | §1.1 · §1.2 · §1.3 · §1.4 | **`null`로 나온다** — `lastOkAt`/`lastError`/`monthlyBudgetUsd`/`credentialMasked`에 `=== null` 써도 된다 |
| `AiMonConnectionTestDto` | §1.6 | **`null`로 나온다** — `detail`/`reason` |
| `AiMonInventoryDto` (+ `Item`) | §1.7 | **키 생략** |
| `AiMonUsageDto` | §2.1 | **키 생략** |
| `AiMonUsageCompactDto` | §2.2 | **키 생략** |
| `AiMonUsageSliceDto` | §2.1의 `by*`/`daily` | **키 생략**(차원 필드가 그 원리다). ⚠️ 활동 지표 4개(`sessions`·`activeTimeSeconds`·`linesAdded`·`linesRemoved`)는 **`byUser`에서만 항상 존재**하고 나머지 슬라이스에서는 키가 없다 — M2-6 참고 |
| `AiMonAlertDto` | §2.3 · §2.2의 `alerts` | **키 생략**(현재 코드는 전 필드를 항상 채운다) |
| `AiMonReceiveTokenDto` | M2-2(토큰 재발급) | **null로 나온다** — 다만 <b>다섯</b> 필드 모두 항상 채워진다(빈 값이 나올 수 있는 필드가 없다) |
| `AiMonUserPlanDto` | M2-10(사용자별 플랜) | **null로 나온다** — 두 필드 모두 항상 채워진다 |
| `AiMonGuideMailDto.SendResult` | M2-12(가이드 메일) | **null로 나온다** — 두 필드 모두 항상 채워진다(`failed`는 전원 성공이면 빈 배열) |

**FE 판정 규칙**: 키 생략 DTO의 옵셔널 필드는 `!== null`/`=== null`이 **항상 빗나간다**.
`== null`(느슨한 비교) 또는 truthiness(`!value`)를 쓸 것.

ℹ️ **배열 필드(`byModel`·`byWorkspace`·`byApiKey`·`daily`·`alerts`)는 생략되지 않는다** — 비어 있어도
`[]`로 나간다(`NON_NULL`은 빈 리스트를 지우지 않고, BE가 이 필드들에 null을 넣는 경로도 없다).
FE가 `?? []`로 방어하는 것은 무해하지만 필요해서 그런 것은 아니다.

---

## 1. 계정 관리

### 1.1 `GET /ai-monitor/accounts` — 목록

응답 `data`: `AiMonAccountDto[]`

```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "id": 1,
      "provider": "ANTHROPIC",
      "kind": "POLL",
      "name": "DMOVE 본사 조직",
      "credentialMasked": "••••igAA",
      "enabled": true,
      "monthlyBudgetUsd": 500.00,
      "lastOkAt": "2026-08-25T04:00:12",
      "lastError": null,
      "failCount": 0,
      "state": "OK",
      "createdAt": "2026-08-24T10:00:00"
    }
  ]
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `number` | |
| `provider` | `"ANTHROPIC" \| "OPENAI"` | M1은 둘뿐 |
| `kind` | `"POLL" \| "RECEIVE"` | M1은 항상 `"POLL"` |
| `name` | `string` | |
| `credentialMasked` | `string \| null` | `"••••" + 뒤 4자리`. 키 미등록/복호화 실패면 `null`. 🔴 **키 원문·암호문은 어떤 응답에도 없다** |
| `enabled` | `boolean` | |
| `monthlyBudgetUsd` | `number \| null` | 미설정이면 `null` |
| `lastOkAt` | `string \| null` | 마지막 폴링 성공. **실패 중에도 지워지지 않는다** |
| `lastError` | `string \| null` | 프로바이더 원문(최대 1000자) |
| `failCount` | `number` | 연속 실패. 성공 시 0 |
| `state` | `"OK" \| "ERROR" \| "DISABLED" \| "PENDING"` | 배지. **DISABLED가 ERROR보다 우선** |
| `createdAt` | `string` | |

`state` 판정: `!enabled` → `DISABLED` / `failCount>0` → `ERROR` / `lastOkAt==null` → `PENDING` / 그 외 `OK`.

### 1.2 `GET /ai-monitor/accounts/{id}` — 상세
`data`: `AiMonAccountDto` (위와 동일). 없으면 `AI_MONITOR_ACCOUNT_NOT_FOUND`.

### 1.3 `POST /ai-monitor/accounts` — 등록

요청 `AiMonAccountUpsertReqDto`:
```json
{
  "provider": "ANTHROPIC",
  "name": "DMOVE 본사 조직",
  "credential": "sk-ant-admin01-…",
  "enabled": true,
  "monthlyBudgetUsd": 500.00
}
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `provider` | ✅ | 폴링은 `ANTHROPIC`/`OPENAI`, 수신은 `CLAUDE_CODE`/`CODEX_CLI`(M2-1·M2-11). 대소문자 무시. 그 외는 `AI_MONITOR_PROVIDER_UNSUPPORTED`, 짝이 안 맞으면 `AI_MONITOR_WRONG_ACCOUNT_KIND` |
| `name` | ✅ | 공백만이면 `AI_MONITOR_NAME_REQUIRED` |
| `credential` | ✅ | **등록에는 필수** — 없으면 `AI_MONITOR_CREDENTIAL_REQUIRED`. `enc:v1`(AES-256-GCM)로 암호화 저장 |
| `enabled` | ❌ | 미지정 시 `true` |
| `monthlyBudgetUsd` | ❌ | 음수면 `AI_MONITOR_INVALID_BUDGET` |

응답 `data`: 생성된 `AiMonAccountDto`.

### 1.4 `PUT /ai-monitor/accounts/{id}` — 수정

요청 DTO는 등록과 동일. **차이가 셋 있다:**

1. 🔴 **`credential`을 비우거나 생략하면 저장된 키를 유지한다**(ZM-100 "비우면 유지"). 공백 문자열도 "안 바꿈"이다.
2. 🔴 **`provider`는 무시된다** — 이미 쌓인 사용량의 의미가 달라지므로 변경 불가. 바꾸려면 새 계정을 만든다.
3. ⚠️ **`monthlyBudgetUsd`는 전체 교체 시맨틱이다** — 필드를 생략하면 `null`로 저장되어 **예산이 지워진다**. FE는 PUT에 항상 현재 예산을 실어 보내야 한다(PUT=전체 교체 관례와 일치).

`name`을 생략하면 기존 이름 유지, 공백만 보내면 `AI_MONITOR_NAME_REQUIRED`.

### 1.5 `DELETE /ai-monitor/accounts/{id}`
`data`: 없음. **쌓인 사용량·인벤토리도 함께 삭제**된다(FK CASCADE + 애플리케이션 삭제).

### 1.6 `POST /ai-monitor/accounts/{id}/test` — 연결 테스트

저장된 Admin 키로 프로바이더를 실제 1회 호출한다(Anthropic: `GET /v1/organizations/workspaces?limit=1` · OpenAI: `GET /v1/organization/projects?limit=1`).

🔴 **실패해도 HTTP 200 + `status:"success"`다.** 실패는 `data.ok=false`로 표현된다 — "키가 틀렸다"는 서버 오류가 아니라 사용자 질문에 대한 정상적인 답이다.

```json
// 성공
{ "status": "success", "code": 200,
  "data": { "ok": true, "provider": "ANTHROPIC", "detail": "workspaces=3", "reason": null } }

// 실패
{ "status": "success", "code": 200,
  "data": { "ok": false, "provider": "ANTHROPIC", "detail": null,
            "reason": "HTTP 401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\"}}" } }
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `ok` | `boolean` | |
| `provider` | `string` | |
| `detail` | `string \| null` | 성공 시 응답 요약 |
| `reason` | `string \| null` | 실패 사유 = **프로바이더 원문**(최대 500자). 특수 값: `NO_CREDENTIALS` 대신 `AI_MONITOR_CREDENTIAL_REQUIRED`, `AI_MONITOR_PROVIDER_UNSUPPORTED` |

⚠️ 연결 테스트는 `lastError`/`failCount`를 **바꾸지 않는다**(수집 건강 상태와 사용자 버튼을 섞지 않는다).

### 1.7 `GET /ai-monitor/accounts/{id}/inventory` — 인벤토리

```json
{
  "status": "success", "code": 200,
  "data": {
    "accountId": 1,
    "syncedAt": "2026-08-25T04:30:00",
    "usageSince": "2026-06-01T00:00:00",
    "items": [
      {
        "itemType": "API_KEY",
        "externalId": "apikey_01AAA",
        "displayName": "prod-server",
        "status": "active",
        "lastUsedAt": "2026-08-24T09:00:00",
        "lastUsedSource": "DERIVED",
        "unusedDays": 1
      },
      {
        "itemType": "MEMBER",
        "externalId": "user_01ZZ",
        "displayName": "홍길동 <hong@dmove.co.kr>",
        "status": "admin",
        "lastUsedSource": "NONE"
      }
    ]
  }
}
```

> 🔴 **둘째 항목에 `lastUsedAt`·`unusedDays` 키가 아예 없는 것이 실제 응답이다.** `AiMonInventoryDto`는
> 레코드와 중첩 `Item` **양쪽에** `@JsonInclude(NON_NULL)`이 걸려 있어 값이 없는 필드는 **키째 빠진다**.
> TS에서는 `null`이 아니라 `undefined`다 — `row.unusedDays !== null`은 **항상 true**가 되므로
> `!= null`(느슨한 비교)이나 `!row.unusedDays`로 판정할 것.

| 필드 | 타입 | 비고 |
|---|---|---|
| `syncedAt` | `string?` | **없으면 키 생략.** 한 번도 동기화 안 됨(= `items` 빈 배열) |
| `usageSince` | `string?` | **없으면 키 생략.** 우리가 사용량을 쌓기 시작한 시각 — DERIVED 판정의 신뢰 하한 |
| `items[].itemType` | `"API_KEY" \| "MEMBER" \| "WORKSPACE"` | 항상 존재. WORKSPACE = Anthropic workspace / OpenAI project |
| `items[].externalId` | `string` | 항상 존재 |
| `items[].displayName` | `string?` | **없으면 키 생략** |
| `items[].status` | `string?` | **없으면 키 생략.** 프로바이더 원문(`active`·`archived`·역할명 등) |
| `items[].lastUsedAt` | `string?` | **없으면 키 생략**(= `lastUsedSource:"NONE"`) |
| `items[].lastUsedSource` | `"PROVIDER" \| "DERIVED" \| "NONE"` | 항상 존재. 🔴 아래 참고 |
| `items[].unusedDays` | `number?` | **없으면 키 생략**(`lastUsedAt`이 없을 때) |

🔴 **`lastUsedSource`를 화면이 반드시 표시해야 한다:**
- `PROVIDER` — 프로바이더가 준 값(OpenAI api_keys).
- `DERIVED` — 우리가 적재한 사용량에서 파생(**Anthropic은 `last_used_at`을 주지 않는다**). ⚠️ **도입 이전 사용분은 안 보인다** → `usageSince`가 90일보다 최근이면 "미사용"으로 읽으면 안 된다.
- `NONE` — 알 수 없음. **"안 씀"이 아니다.**

---

## 2. 사용량 조회

### 2.1 `GET /ai-monitor/usage?accountId=&period=`

| 쿼리 | 필수 | 기본 | 비고 |
|---|---|---|---|
| `accountId` | ❌ | (없음) | 비우면 **전 계정 합산** |
| `period` | ❌ | `month` | `day` \| `week` \| `month`. 그 외는 `AI_MONITOR_INVALID_PERIOD`(조용히 폴백하지 않는다) |

구간: `day`=오늘 / `week`=**최근 7일**(이번 주 아님) / `month`=이달 1일~오늘.

```json
{
  "status": "success", "code": 200,
  "data": {
    "accountId": 1,
    "accountName": "DMOVE 본사 조직",
    "period": "month",
    "periodKey": "2026-08",
    "from": "2026-08-01",
    "to": "2026-08-25",
    "currency": "USD",
    "estimated": true,
    "asOf": "2026-08-25T04:30:11",
    "calls": 1280,
    "costUsd": 123.456789,
    "inputTokens": 1200000,
    "outputTokens": 80000,
    "cacheReadTokens": 450000,
    "cacheWriteTokens": 30000,
    "unpricedDays": 0,
    "budgetUsd": 500.0,
    "percent": 24.7,
    "remainingUsd": 376.543211,
    "warn": false,
    "over": false,
    "byModel": [
      { "model": "claude-sonnet-4-5", "calls": 1200, "costUsd": 120.0,
        "inputTokens": 1150000, "outputTokens": 75000,
        "cacheReadTokens": 450000, "cacheWriteTokens": 30000 }
    ],
    "byWorkspace": [
      { "workspace": "wrkspc_01WWW", "calls": 1280, "costUsd": 123.456789,
        "inputTokens": 1200000, "outputTokens": 80000,
        "cacheReadTokens": 450000, "cacheWriteTokens": 30000 }
    ],
    "byApiKey": [
      { "apiKeyId": "apikey_01AAA", "calls": 1280, "costUsd": 123.456789,
        "inputTokens": 1200000, "outputTokens": 80000,
        "cacheReadTokens": 450000, "cacheWriteTokens": 30000 }
    ],
    "daily": [
      { "day": "2026-08-24", "calls": 90, "costUsd": 8.5,
        "inputTokens": 80000, "outputTokens": 5000,
        "cacheReadTokens": 20000, "cacheWriteTokens": 1000 }
    ]
  }
}
```

**필드 규약**

| 필드 | 타입 | 비고 |
|---|---|---|
| `accountId`/`accountName` | `number?` / `string?` | 전 계정 합산이면 둘 다 **키 생략** |
| `periodKey` | `string` | `day`→`2026-08-25`, `week`→`2026-W05`/`2026-W35`(**ISO, 주 번호 2자리 제로패딩**), `month`→`2026-08`. 🔴 연말 주는 달력 연도가 아니라 ISO 주 기준 연도다(`2027-01-01` → `2026-W53`) |
| `estimated` | `boolean` | **항상 true** |
| `asOf` | `string?` | **비용이 채워진 마지막 적재 시각.** 🔴 아직 비용 폴링이 안 돌았으면 **키가 생략된다**(`null`이 아니다) — `asOf === null`은 항상 false이니 `!usage.asOf` 또는 `== null`로 판정할 것. 이 상태가 "비용 집계 전"이며, 0원을 "안 씀"으로 그리면 안 된다. 🔴 **앱 시계다**(서버 로컬). 예전에는 DB `NOW()`라 앱 TZ와 9시간 어긋났다(E2E D-1, 수정됨) |
| `calls` | `number` | 🔴 **0이 "안 씀"이 아닐 수 있다** — Anthropic usage_report는 요청 건수를 주지 않아 항상 0이다. OpenAI만 실값 |
| `inputTokens` | `number` | **캐시 읽기를 제외한 값**(Anthropic `uncached_input_tokens` 기준. OpenAI는 `input_tokens − input_cached_tokens`로 맞춤) |
| `cacheWriteTokens` | `number` | OpenAI에는 개념이 없어 항상 0(모름이 아니라 정확히 0) |
| `unpricedDays` | `number` | 🔴 **이름·의미가 바뀌었다**(구 `unpricedRows` — E2E D-3). **비용을 아직 못 가져온 날 수**(계정×날짜 기준). `>0`이면 그만큼 총액이 실제보다 적다. **정상 운영에서는 0**이고, 비용 배치가 밀린 날수만큼만 올라간다. 자정~04:30 사이에는 오늘이 1로 잡힐 수 있다(그 시각의 총액은 실제로 오늘분만큼 적다). 배지 문구는 "**N일**"이어야 한다 |
| `budgetUsd` | `number?` | 🔴 **`period=month`이고 예산이 설정된 경우에만 나간다.** 그 외에는 예산 5필드가 전부 **키 생략** |
| `percent` | `number` | 소수 1자리 **반올림(HALF_UP)**. 마이크로달러 정수에서 계산하므로 `125.5/200`은 `62.7`이 아니라 **`62.8`**이다(E2E D-5). 예산 없으면 생략 |
| `remainingUsd` | `number` | 초과 시 **음수**. 예산 없으면 생략 |
| `warn` | `boolean` | 예산 **80%** 이상(≥). ⚠️ **`over`를 포함한다** — 초과 상태에서는 `warn`·`over`가 **함께 true**다(§2.3의 알람 코드는 반대로 배타). 소비자는 `over ? … : warn ? …` 순서로 읽을 것 |
| `over` | `boolean` | 예산 초과(>). 예산 없으면 생략 |
| `byModel`/`byWorkspace`/`byApiKey`/`daily` | `AiMonUsageSliceDto[]` | 아래 |

**`AiMonUsageSliceDto` — 차원이 필드명으로 온다**

```ts
type TAiMonUsageSlice = {
  model?: string;      // byModel에서만
  workspace?: string;  // byWorkspace에서만
  apiKeyId?: string;   // byApiKey에서만
  day?: string;        // daily에서만 (yyyy-MM-dd)
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};
```

- 해당 차원 필드 **하나만** 채워지고 나머지는 **JSON에서 생략**된다. moveseye-ai `GET /ai/usage`의 `TAiUsageSlice`와 같은 규약이라 FE 카드·차트 재사용 가능.
- 차원 값이 없는 경우(모델 미상 등)는 **빈 문자열 `""`** 이다(`null` 아님).
- 정렬: `byModel`/`byWorkspace`/`byApiKey`는 **비용 내림차순**(동점이면 키 오름차순), `daily`는 **날짜 오름차순**.

### 2.2 `GET /ai-monitor/usage/compact` — 홈 위젯

전 계정 합산, 이번 달 고정.

```json
{
  "status": "success", "code": 200,
  "data": {
    "period": "month",
    "periodKey": "2026-08",
    "currency": "USD",
    "estimated": true,
    "accounts": 2,
    "costUsd": 123.456789,
    "calls": 1280,
    "budgetUsd": 500.0,
    "percent": 24.7,
    "remainingUsd": 376.543211,
    "warn": false,
    "over": false,
    "subscriptionCostUsd": 305.0,
    "alerts": []
  }
}
```

- `accounts`: 등록된 계정 수(**꺼진 것 포함**).
- `budgetUsd`: **예산을 설정한 폴링 계정들의 합**. 🔴 **하나도 없으면 예산 5필드가 생략된다(0이 아니다)** — 0을 내려보내면 화면이 "예산 0원 초과"로 그린다.
- `alerts`: 아래 §3과 동일한 배열.

### 🔴 compact의 `costUsd`는 **폴링(실지출)만**이다 — summary와 다르다

| | `costUsd`가 뜻하는 것 |
|---|---|
| `GET /ai-monitor/usage` (§2.1) | `source` 파라미터대로. 생략하면 **전 소스 합산**(폴링+구독) |
| `GET /ai-monitor/usage/compact` (§2.2) | 🔴 **항상 폴링만**. 구독 사용액은 `subscriptionCostUsd`로 분리 |

**왜 다른가.** compact은 곧 `costUsd / budgetUsd` 비율을 그리는 화면(홈 위젯)이다. 구독 사용액은
지출이 아니라 **API 환산 가치**라 "예산의 몇 %"라는 질문 자체가 성립하지 않는데, 예전에는 분모만
폴링으로 좁히고 분자는 전 소스라 **구독 $305가 폴링 예산 $5 위에 얹혀 위젯이 6100% 빨강**을 그렸다
(E2E M2-D1). 정작 알람은 조용해서(수신 계정은 예산 평가 제외) 화면과 알람이 모순됐다.

| 추가 필드 | 타입 | 비고 |
|---|---|---|
| `subscriptionCostUsd` | `number?` | 이번 달 **구독(수신)** 사용액. 🔴 `costUsd`·예산과 **더하지 말 것**. 수신 사용량이 없으면 **키 생략** |

ℹ️ 구독 사용액을 아예 빼지 않고 분리해 실은 이유: 감추면 **수신 계정만 쓰는 조직의 홈 위젯이
$0으로 보여** "AI를 안 쓰는 조직"처럼 읽힌다(설계 §8이 빈 화면에서 피하려던 오해). 활용도 축은
대시보드의 `byUser`에서 본다(M2-10).

### 2.3 `GET /ai-monitor/alerts` — 알람(현재 참인 조건)

`data`: `AiMonAlertDto[]`

```json
[
  {
    "code": "BUDGET_OVER",
    "severity": "critical",
    "accountId": 1,
    "accountName": "DMOVE 본사 조직",
    "message": "이번 달 예산 500.00 USD를 넘었습니다 — 561.83 USD (112.4%)",
    "value": 112.4
  }
]
```

| `code` | `severity` | 조건 | `value` |
|---|---|---|---|
| `POLL_FAILING` | `critical` | 폴링 **연속 3회** 실패 | 연속 실패 횟수 |
| `BUDGET_OVER` | `critical` | 이달 비용 > 예산 | 사용률(%) |
| `BUDGET_WARN` | `warning` | 이달 비용 ≥ 예산의 **80%** (초과 아님) | 사용률(%) |
| `USAGE_SPIKE` | `warning` | **어제** 토큰(입력+출력)이 직전 7일 평균의 **3배 초과** | 배수 |
| `UNUSED_KEY` | `warning` | **90일** 이상 미사용 API 키 존재(**계정당 1건**, 개수+예시 3개) | 미사용 키 개수 |

🔴 **이것은 "발송된 알림"이 아니라 "지금 참인 조건"이다.** BE에 알림 배달 경로가 없다(→ §5 잔여 이슈 A). 화면이 폴링해 배너/배지로 그린다 — AWS 호출 예산·라이선스 만료 배너와 같은 방식.

**오탐 방지 규칙(FE가 문구를 쓸 때 참고):**
- `BUDGET_WARN`과 `BUDGET_OVER`는 **동시에 나오지 않는다**.
- 꺼진(`enabled=false`) 계정은 `POLL_FAILING` 외 규칙을 **평가하지 않는다**(수집이 멈춰 있어 "여유 있음"이 거짓 안심).
- `USAGE_SPIKE`는 기준선 7일 합이 10,000 토큰 미만이면 판정하지 않는다(도입 초기 오탐 차단). **어제**를 보므로 최대 1일 지연.
- `UNUSED_KEY`는 사용 이력을 알 수 없고 `usageSince`가 90일 이내면 **세지 않는다**.

---

## 3. 에러 코드

전부 **HTTP 200 + body**. `code`는 400(권한 거부만 403).

| `errorCode` | `code` | 발생 |
|---|---|---|
| `AI_MONITOR_ACCOUNT_NOT_FOUND` | 400 | 없는 계정 id |
| `AI_MONITOR_PROVIDER_UNSUPPORTED` | 400 | `provider`가 `ANTHROPIC`/`OPENAI`/`CLAUDE_CODE`/`CODEX_CLI` 밖. 🔴 **M2에서 규칙이 바뀌었다** — `CLAUDE_CODE`는 이제 **유효한 값**이고 수신 계정 등록에는 **반드시** 써야 한다(M2-1). M1 시점의 "CLAUDE_CODE도 거부"는 더 이상 사실이 아니다 |
| `AI_MONITOR_NAME_REQUIRED` | 400 | 이름 누락/공백 |
| `AI_MONITOR_CREDENTIAL_REQUIRED` | 400 | **등록 시** 키 누락(수정은 "비우면 유지") |
| `AI_MONITOR_INVALID_BUDGET` | 400 | `monthlyBudgetUsd` 음수 |
| `AI_MONITOR_INVALID_PERIOD` | 400 | `period`가 `day\|week\|month` 밖 |
| `AI_MONITOR_CONSENT_REQUIRED` | 400 | **M2.** 수신 계정 등록·토큰 재발급에 `consentAcknowledged: true`가 없다(false·누락 모두). 설계서 §5.3 |
| `AI_MONITOR_WRONG_ACCOUNT_KIND` | 400 | **M2.** `provider`와 `kind`가 어긋나거나(`CLAUDE_CODE`/`CODEX_CLI`+`POLL` · `ANTHROPIC`/`OPENAI`+`RECEIVE`), 폴링 계정에 수신 전용 조작(토큰 재발급·구독 플랜·가이드 메일)을 시도 |
| `AI_MONITOR_MAIL_NOT_CONFIGURED` | 400 | **M2-12.** SMTP 미설정 — 침묵하지 않고 즉시 거부한다 |
| `AI_MONITOR_MAIL_INVALID_RECIPIENT` | 400 | **M2-12.** 받는 사람이 비었거나 이메일 형식이 아님(하나라도 틀리면 **전체 거부**) |
| `AI_MONITOR_MAIL_TOO_MANY_RECIPIENTS` | 400 | **M2-12.** 받는 사람이 50명을 넘음 |
| `AI_MONITOR_MAIL_BODY_REQUIRED` | 400 | **M2-12.** 본문이 비었음(BE는 본문을 만들지 않는다) |
| `AI_MONITOR_PLAN_USER_REQUIRED` | 400 | **M2.** 사용자별 플랜 행에 `userKey`가 비어 있다 |
| `AI_MONITOR_INVALID_PLAN` | 400 | **M2.** `planUsd`/`defaultPlanUsd`가 없거나 음수 |

### M2 마이그레이션 요약

| 버전 | 내용 |
|---|---|
| `V30` | 3테이블(계정·사용량·인벤토리) + 스케줄러 시드 2건 |
| `V31` | 활동 지표 4열 + OTel 누적 커서 |
| `V33` | 구독 플랜(계정 기본값 + 사용자별 예외). ⚠️ `V32`는 병행 작업(cloud_cost_daily)이 선점 |
| `V34` | 활동 시간 초→**밀리초**(누적 오차 제거) + OTLP **중복 방어** 영수증 테이블 |
| (없음, 메시지 `Access Denied`) | **403** | 비관리자 — `status:"error"`, `errorCode` 필드 없음 |

---

## 4. 배치·데이터 모델 (FE가 직접 쓰진 않지만 화면 문구에 필요)

**Flyway `V30__ai_monitor.sql`** — `ai_mon_account` / `ai_mon_usage` / `ai_mon_inventory` + `scheduler_setting` 시드 2건.

**스케줄러 job**(설정 > 스케줄러 화면에 나타난다 — 라벨 i18n 필요):

| `job_key` | 기본 주기 | 하는 일 | options |
|---|---|---|---|
| `ai_monitor_usage_poll` | interval **60분** | 1h 버킷 사용량 증분 조회 → 멱등 upsert | `lookbackHours`(기본 48) |
| `ai_monitor_cost_poll` | daily **04:30** | 최근 N일 비용 재조회(덮어쓰기) + 인벤토리 전량 동기화 | `costLookbackDays`(기본 3) |

- 실행 요약은 `scheduler_run_log`에 `ok=2 fail=1 rows=57 alerts=2` 꼴로 남는다. 계정이 없으면 `skipped (등록된 계정 없음)`.
- **부분 실패는 성공**(요약에 `fail=N`), **전 계정 실패는 실패**(실행 이력에 failed).
- 두 배치 모두 `requiresActiveLicense=true` — 라이선스 만료 시 돌지 않는다.
- 따라잡기 상한 **30일** — 서버가 더 오래 꺼져 있었으면 그 사이는 **데이터 공백**으로 남는다(로그 경고).

---

## 5. 🔴 잔여 이슈 (읽지 않고 배포하지 말 것)

### A. 알람 "발송"이 없다 — 설계서 §7의 전제가 현 코드에서 성립하지 않는다

설계서 §7은 "기존 알림 채널(배달 경로 포함)에 그대로 태운다"고 적었지만, **BE에는 알림을 보낼 수 있는 경로가 하나도 없다**(조사 실측):

| 후보 | 왜 안 되나 |
|---|---|
| `EmailService` | 인증 전용 3개 메서드뿐. **`spring.mail.*` 미설정이라 `JavaMailSender` 빈 자체가 없어** 전부 `PENDING`으로 skip. 템플릿도 RESET 1개 |
| Zabbix 액션/미디어타입 | 액션은 **Zabbix가 낸 eventsource 0~4 이벤트**에만 반응. BE에 임의 이벤트를 주입할 코드(trapper/sender)가 없다 |
| 알림벨 `GET /event/bells` | `alertPort.listActive` = **Zabbix `problem.get` 라이브 조회**. 로컬 `event_problems`는 읽는 경로가 없어 우회 불가 |
| `AlertPort` | 읽기 포트(+ack). 알람 **생성** 메서드 없음 |

**M1의 선택**: 이 레포의 기존 관행(AWS 호출 예산 `BUDGET_EXHAUSTED` · 라이선스 만료 배너)을 따라 **평가 + 로그 + 상태 노출**까지만 했다. `GET /ai-monitor/alerts`와 `usage/compact.alerts`가 그 창구다.

**실제 push가 필요하면 셋 중 하나를 결정해야 한다(사용자 결정 필요):**
1. **SMTP 활성화** — `application.yml`에 `spring.mail.*` + `.env`에 `MAIL_*`, `EmailType`/`EmailTemplates`에 알람 타입 추가, `EmailService`에 범용 발송 메서드. 기반 코드(`EmailServiceImpl.runSendEmail`)는 이미 정상이라 **가장 짧다**. 단 설치형이라 고객사 SMTP를 설정 화면에서 받아야 할 가능성이 크다(`Setting` + `SettingSecretCodec` 연계).
2. **인앱 알림 테이블 신설** — `notification` 테이블 + 조회/읽음 EP. FE 알림벨이 `event/bells` 응답 shape에 강결합돼 있어 **FE 변경이 불가피**.
3. **Zabbix에 태우기** — trapper item + 트리거 + 액션 프로비저닝 + zabbix_sender. 고객 Zabbix 스키마를 우리가 오염시킨다. **가장 비싸다.**

→ **설계서 §7을 다시 쓰고 §11 준비물에 "알림 방식 결정"을 추가해야 한다.**

### B. 프로바이더 응답이 전부 미실측이다

- 🔴 **Anthropic**: Admin 키(`sk-ant-admin…`)를 아직 발급받지 못했다(설계서 §11 준비물). 파싱은 2026-08 문서 기반이고, 필드명은 `ProviderJson`의 **별칭 목록**으로만 방어된다.
- 🔴 **OpenAI**: Admin 키·크레딧 미보유. 조사 §3 자체가 "지식 기반"이라 **파라미터 이름(`group_by` vs `group_by[]`)·필드명이 실제와 다를 가능성이 Anthropic보다 높다.**
- 픽스처 4개(`src/test/resources/aimonitor/*.json`)에 각각 "미실측 — 실응답으로 재확정 필요"와 **무엇을 확인해야 하는지**를 적어 두었다. 실 키를 받으면 **픽스처 교체 → 파서 테스트 재실행 → 별칭 축소**가 첫 작업이다.
- 미확정 항목(조사 §6 체크리스트): 페이지네이션 방식(`has_more`/`next_page`/`after_id`), `anthropic-version` 값, Admin API 과금 여부·rate limit, 비용 정산 지연 폭.

### C. 알려진 한계 (결함 아님 — 화면 문구로 알려야 함)

1. **OpenAI 토큰은 completions만 센다.** embeddings·images 등 카테고리별 엔드포인트를 따로 돌지 않는다(호출량 배증 회피). **비용(`/costs`)은 전 카테고리 합계라 돈은 새지 않고 토큰만 completions 기준**이다.
2. **`calls`는 Anthropic에서 항상 0**이다(§2.1 참고).
3. **`UNUSED_KEY`는 도입 90일 뒤부터 신뢰할 수 있다**(Anthropic이 `last_used_at`을 안 주므로 우리 적재분에서 파생). `usageSince`로 판단할 것.
4. **`USAGE_SPIKE`는 어제 기준**이라 최대 1일 지연된다(오늘은 진행 중이라 항상 평균보다 작아 규칙이 성립하지 않는다).
5. **`monthlyBudgetUsd`는 PUT 전체 교체**다 — 부분 수정하면 예산이 지워진다(§1.4).
6. **Bedrock 경유 Anthropic 조직**은 Usage/Cost API가 제공되지 않는다(문서 명시). 연결 테스트가 실패하며 `reason`에 원문이 남는다 — 화면이 이 경우를 안내하면 좋다.
7. **폐쇄망 고객은 폴링이 불가능하다**(`api.anthropic.com`/`api.openai.com` 아웃바운드 필요). 설정 화면에 이 사실과 연결 테스트 버튼이 있어야 한다(설계서 §3).

### D. FE 쪽에 남는 일 (이 계약 범위 밖)

- 메뉴 IA(🔄 2026-08-25 사용자 결정으로 개편): **설정 메뉴 항목 없음.** 모니터링 > AI 사용 현황 단일 화면(사용량/인벤토리/**계정 관리** 3탭) + 홈 위젯 1종. 계정 등록·수정·연결 테스트는 "계정 관리" 탭에서. 🔴 **고아 화면 금지**(cloud-aws-gating 교훈) — `SideNav`에 실제 도달 경로 확보(반영 완료).
- 도움말 등록(`moveseye-ai/resources/docs/screens.json` + FE 도움말) — 도움말 없는 메뉴는 오안내를 낳는다.
- 홈 위젯은 **관리자 전용**(`useIsUserRoleAdmin`) — compact EP가 비관리자에게 403이다.
- i18n: 스케줄러 화면의 `ai_monitor_usage_poll`/`ai_monitor_cost_poll` 라벨.

---

## 6. 검증 상태

| 항목 | 상태 |
|---|---|
| 빌드 (`build -x test`) | ✅ |
| 단위·통합 테스트 | ✅ **app 1108 / engine-zabbix 90, 실패 0 · skip 0** (신규 66건) |
| V30 마이그레이션 | ✅ 빈 DB에 V1~V30 전량 적용 확인(`AiMonitorRepositoryIT`, 도커 PG 5433) |
| 네이티브 SQL(upsert 멱등·COALESCE·CAST 분기·to_char·CASCADE) | ✅ 실 Postgres에서 실행 검증 |
| 권한(비관리자 차단·zabbix 미연동 admin 통과) | ✅ MockMvc |
| **프로바이더 실호출** | ❌ **미검증**(§5-B) |
| **런타임 기동·FE 연동** | ❌ 미실시 |

---

## 🔄 FE 요청사항 (2026-08-25 · FE M1 연동 중 발견)

FE 구현(`moveseyee_fe`, 미커밋)은 이 계약대로 전부 붙였다. 다만 **BE 한 줄이 없으면 홈 위젯이
작동하지 않는다.**

### ✅ R-1. `HomeWidgetType` enum에 `AI_MONITOR_COST`가 없다 (홈 위젯 차단) — **반영 완료 (2026-08-25, BE)**

> **처리 결과**
> - `home/HomeWidgetType.java` — `AI_USAGE` 바로 아래에 `AI_MONITOR_COST("ai_monitor_cost", false, true, true, 4, 6)` 추가. FE `HOME_WIDGET_TYPES` 배열과 **순서까지 일치**한다(`ai_usage` → `ai_monitor_cost` → `recent_reports`).
> - `HomeWidgetDefaults`는 **건드리지 않았다** — 요청대로 기본 세트에 넣지 않았다.
> - `HomeWidgetCatalogTest` — 카탈로그 표 16→17종, adminOnly 3→4종으로 갱신. `defaultSetMembership`의 기존 단언(`admin`의 adminOnly = `RECENT_REPORTS` + `SYSTEM_SCHEDULER` 정확히 2개)이 **"기본 세트에 넣지 않는다"를 자동으로 지킨다** — 나중에 누가 defaults에 끼우면 그 테스트가 깨진다. 그 사실을 주석으로 남겼다.
> - 검증: `home.*` + `aimonitor.*` **105건 green(실패 0 · skip 0)**. 전체 스위트는 요청대로 재실행하지 않았다.
> - `ai_usage`(어시스턴트 자체 사용량)와 헷갈리기 쉬워 enum javadoc에 둘의 차이를 명시했다.

`§5-D`가 "홈 위젯 1종"을 FE 할 일로 적었지만, **홈 위젯 타입의 정본은 BE enum**이다
(`home/HomeWidgetType.java` — "미지 타입 POST는 `WIDGET_TYPE_INVALID`"). 현재 enum에는
`AI_USAGE`(moveseye-ai 어시스턴트 자체 사용량)만 있고 계정 모니터링용 항목이 없다.

FE는 카탈로그·렌더러·메타를 `ai_monitor_cost`로 이미 채워 두었다. 이대로 배포하면
**카탈로그에는 보이는데 "위젯 추가"를 누르면 `WIDGET_TYPE_INVALID`로 거부**된다.

필요한 변경(1줄 + 테스트 표 1행):

```java
// HomeWidgetType.java — AI 구역, AI_USAGE 아래
/** AI 계정 비용(이번 달). 데이터는 BE {@code GET /ai-monitor/usage/compact}. 관리자 전용. */
AI_MONITOR_COST("ai_monitor_cost", false, true, true, 4, 6),
```

- `pinned=false` / `uniquePerDashboard=true` / `adminOnly=true` / 기본 크기 `4x6`.
- `adminOnly=true`인 이유: `usage/compact`가 `AdminAccessChecker`로 막혀 있어 비관리자에게는 403이다.
- 기본 세트(`HomeWidgetDefaults`)에는 **넣지 말 것** — 계정을 등록하지 않은 설치본에서 홈에 빈 카드가 생긴다.
- BE 쪽 `HomeWidgetCatalogTest`(카탈로그 표)도 같이 한 행 늘려야 한다. FE 쪽 대응 표
  (`__tests__/homeWidgetRegistry.test.tsx`)에는 이미 같은 값으로 넣어 두었다.

### 🟡 R-2. `GET /ai-monitor/alerts`가 유일한 알람 창구라는 점 재확인

§5-A의 결론대로 FE는 대시보드 알람 카드 + 홈 위젯 경고로 노출했고, "발송된 알림이 아니라 지금
참인 조건"이라는 문구를 화면에 명시했다. **알림 push 방식(§5-A의 3안)이 정해지면 이 문구와
노출 위치를 다시 손봐야 한다** — 지금 상태는 "알림이 안 왔으니 문제없다"는 오독을 문구로만 막고 있다.

### ℹ️ R-3. 계약과 다르게 처리한 곳 — 없음

필드명·옵셔널 여부·에러코드는 계약 그대로 옮겼다. 다만 FE는 아래를 **방어적으로** 다룬다
(계약 위반이 아니라 `@JsonInclude(NON_NULL)` 대응):

- `byModel`/`byWorkspace`/`byApiKey`/`daily`가 응답에서 빠져 와도 빈 배열로 취급한다.
- 예산 5필드는 `period=month`가 아니거나 예산이 없으면 게이지를 **아예 그리지 않는다**(0%로 그리지 않는다).
- `calls`는 선택 계정이 Anthropic 단독일 때 표에서 열을 숨긴다(항상 0이라 "0건"이 거짓 사실이 된다).

---

## ✅ QA 반영 이력 (2026-08-25 · `qa_ai-account-monitoring.md`)

integration-qa가 지적한 항목 중 **BE·계약서 몫**을 반영했다. FE 몫(M-1·M-2의 판정식, L-3 테스트 목)은
FE 쪽에서 처리한다.

| QA | 항목 | 처리 |
|---|---|---|
| **L-1** | `periodKey` 주 번호 제로패딩 없음(`2026-W5`) | ✅ **BE 수정** — `AiMonitorUsageService.periodKey`를 `%d-W%02d`로. 이제 `2026-W05`. 테스트 2건 추가(패딩 + 문자열 정렬 역전 방지, 그리고 `2027-01-01 → 2026-W53` 주 기준 연도) |
| **M-1** | `asOf`가 `null`이 아니라 **키 생략** | ✅ **계약서 정정** — §2.1 표에서 `string \| null` → `string?`(키 생략)로 고치고 FE 판정식(`!usage.asOf` / `== null`)을 명시 |
| **M-2 · L-4** | §1.7 예시·표가 `NON_NULL` 생략 미반영 | ✅ **계약서 정정** — 예시 JSON의 `lastUsedAt: null`·`unusedDays: null`을 **키 생략** 형태로 바꾸고, 표 전 항목을 `?`(생략) 표기로 정리 + `displayName`·`externalId` 행 보강 |
| (근본 원인) | 같은 계약에 `null` 방식과 키 생략 방식이 섞여 있음 | ✅ **§0.1 신설** — DTO별 빈 값 표현 대응표. `AiMonAccountDto`·`AiMonConnectionTestDto`는 **`null`을 그대로 내보내므로 `=== null`이 유효**하고, 나머지 5개는 키가 생략된다. 이 구분이 없으면 같은 종류의 버그가 계속 난다 |

**정정 과정에서 확인한 사실 하나** — QA·FE 양쪽이 "배열도 생략될 수 있다"고 가정했으나 **사실이 아니다.**
`NON_NULL`은 빈 리스트를 지우지 않고, BE가 `byModel`/`byWorkspace`/`byApiKey`/`daily`/`alerts`에 null을
넣는 경로도 없다 → **비어 있어도 `[]`로 나간다.** FE의 `?? []` 방어는 무해하지만 필요해서 그런 것은
아니다(§0.1에 명시).

⚠️ **`periodKey` 패딩은 moveseye-ai의 `GET /ai/usage`와 어긋난다** — 저쪽은 여전히 패딩이 없다
(`2026-W5`). 어휘를 맞추려 만든 계약이지만 **틀린 쪽을 따라가지는 않았다.** moveseye-ai 정정은 그
응답을 쓰는 화면의 회귀 위험이 있어 별도 과제로 남긴다.

---

## ✅ E2E 반영 이력 (2026-08-25 · `e2e_ai-account-monitoring.md`)

functional-qa의 런타임 검증에서 나온 **BE 몫**을 반영했다. FE 몫(D-2 게이지 색·D-6 라벨)은 FE에서 처리한다.

| E2E | 항목 | 처리 |
|---|---|---|
| **D-1** (MED) | `asOf`·`syncedAt`이 DB `NOW()`라 앱 TZ와 9시간 어긋남 | ✅ **앱 시계로 통일.** `AiMonUsageRepository.upsert`가 `updatedAt`을 파라미터로 받고, `V30`의 `DEFAULT now()` 4개를 전부 제거해 앱이 반드시 넘기게 했다(안 넘기면 NOT NULL로 즉시 실패 — 조용히 다른 시계가 끼어드는 것보다 낫다). 적재 시각은 **폴링 1회당 하나**를 루프 밖에서 만들어 그 회차 전 행에 싣는다 |
| **D-3** (MED) | `unpricedRows`가 구조적으로 항상 `>0` | ✅ **의미 재정의 + 필드명 변경** — `unpricedRows`(행 수) → **`unpricedDays`**(비용 못 가져온 계정×날짜 수). 정상 운영에서 **0**이 된다 |
| **D-4** (LOW) | `warn`/`over` 동시 true | ✅ **계약서 명시**(§2.1 `warn` 행 + DTO javadoc). 배타로 바꾸지 않았다 — 이유는 아래 |
| **D-5** (LOW) | `percent` 62.75 → 62.7 절사 | ✅ **계산 자체를 정수 마이크로달러 기반으로 교체.** 반올림 함수도 `BigDecimal` HALF_UP으로 |

### 판단 근거 세 가지

**1. D-1은 "어느 시계가 맞나"가 아니라 "시계가 몇 개냐"의 문제였다.**
이 레포의 관행은 조사해 보니 명확했다 — 가장 최근의 같은 성격 기능인 `V28__cloud_snapshot.sql`이
`run_at timestamp NOT NULL`에 **DB 기본값 없이** 앱이 넣는다(`CloudSnapshotService`가 수집 1회당
`LocalDateTime.now()` 하나를 만들어 전 행에 싣는다). `V30`만 그 관행에서 벗어나 있었다. 그대로 맞췄다.
`V1__baseline.sql`의 `DEFAULT now()`들은 TypeORM 잔재이고, 그 테이블들도 실제로는
`BaseEntity`의 `@CreationTimestamp`(=앱)가 값을 넣어 기본값이 발동하지 않는다.

**2. D-4는 배타로 바꾸지 않고 문서화했다.** `warn`은 "경고선을 넘었다"는 **단조 임계값**이라
`over`를 포함하는 편이 조건이 덜 미끄럽다(소비자는 `over ? … : warn ? …`로 읽는다).
알람 코드가 배타인 것은 **다른 이유** — 화면에 같은 사실이 두 줄로 뜨면 안 되기 때문이다.
두 층의 규칙이 다르다는 사실 자체를 계약에 적는 것이 맞다고 판단했다.

**3. D-5는 반올림만 고쳐서는 안 됐다.** `Math.round`를 `BigDecimal` HALF_UP으로 바꿔도
여전히 `62.7`이 나왔다 — **입력값이 애초에 `62.75`가 아니었기** 때문이다.
`costUsd / budget * 100`은 나눗셈이 먼저라 이진 오차가 끼고 100을 곱하며 100배로 커져
`62.74999999999999`가 된다. 그래서 이 레포의 원칙("비용은 정수 마이크로달러")을 퍼센트 계산까지
끌고 와, 나눗셈을 `BigDecimal`에서 **마지막에 한 번만** 한다. 알람 메시지의 퍼센트도 같은 함수를
쓰게 고쳤다(안 그러면 KPI와 알람의 숫자가 어긋난다).

### ⚠️ dev DB 복구 (이미 처리했으나 다른 환경에서 재현될 수 있음)

`V30`은 **아직 어디에도 커밋·배포되지 않았지만 dev DB(도커 5433 `dmove`)에는 적용돼 있었다.**
파일을 고쳤으므로 그대로 두면 다음 `bootRun`이 **checksum mismatch로 기동 실패**한다.
`V30`은 전부 멱등(`CREATE TABLE IF NOT EXISTS`·`ON CONFLICT DO NOTHING`)이라 **데이터를 지우지 않고**
복구했다 — 등록돼 있던 계정 1건은 그대로 살아 있다:

```sql
ALTER TABLE ai_mon_account   ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE ai_mon_account   ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE ai_mon_usage     ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE ai_mon_inventory ALTER COLUMN synced_at  DROP DEFAULT;
DELETE FROM flyway_schema_history WHERE version='30';   -- 다음 기동에 새 체크섬으로 재기록된다
```

같은 상태의 DB가 또 있으면(다른 개발자 PC 등) 위 5줄을 실행하면 된다.
🔴 **`V30`이 한 번이라도 커밋·배포되면 이 방식은 못 쓴다** — 그때부터는 `V31`로 분리해야 한다
(`moveseye-be-spring/CLAUDE.md` §3 #7).

### 검증

- `aimonitor.*` **78건 green**(신규 10건: 시계 축 2 · `unpricedDays` 5 · 반올림/퍼센트 3).
  이 중 `AiMonitorRepositoryIT` **17건은 실제 Postgres**에서 돌아 수정된 `V30`이 빈 DB에 적용되는 것까지 확인.
- 전체 스위트 **app 1120 / engine-zabbix 90, 실패 0 · skip 0**.
- 🔴 **`percent` 회귀 테스트가 실제로 결함을 한 번 더 잡았다** — 반올림만 고친 1차 수정에서 빨갛게 떴고,
  그 덕에 계산 순서 문제(위 판단 근거 3)를 찾았다.

---

# M2 — 수신형 (Claude Code OTel 텔레메트리)

- 구현: 2026-08-25 · 설계서 §5. **M1과 같은 테이블·같은 조회 API**를 쓰고 `source='OTEL'`로 갈린다.
- 마이그레이션: **`V31__ai_monitor_otel.sql`**(V30 확장이 아니라 분리 — 근거는 §M2-7).

## M2-1. 수신 계정 등록 (`POST /ai-monitor/accounts`)

M1과 같은 엔드포인트·같은 요청 DTO다. **세 필드가 더 있다:**

```json
{
  "provider": "CLAUDE_CODE",
  "kind": "RECEIVE",
  "name": "개발팀 Claude Code",
  "consentAcknowledged": true
}
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `provider` | ✅ | 수신은 **`CLAUDE_CODE`**(Claude Code) 또는 **`CODEX_CLI`**(OpenAI Codex CLI, M2-11). |
| `kind` | ✅ | `"RECEIVE"`. 생략하면 `POLL`로 처리된다 |
| `consentAcknowledged` | ✅ | 🔴 **`true`가 아니면 `AI_MONITOR_CONSENT_REQUIRED`.** false·누락 모두 거부. ⚠️ **BE 게이트는 '사람이 확인했다'를 증명하지 못한다** — 어떤 클라이언트든 `true`를 보낼 수 있다. 실제 고지는 화면이 지고, BE는 *API를 직접 부르는 경로가 고지를 의식하지 않고 지나가는 것*만 막는다. 그러므로 **FE는 이 값을 상수로 박지 말고 사용자 체크박스에 묶어야 한다** |
| `credential` | ❌ | **보내지 않는다.** 서버가 토큰을 만든다(보내도 무시) |
| `monthlyBudgetUsd` | ❌ | 🔴 **수신 계정에서는 저장돼도 무시된다**(M2-10) — 구독에는 지출 상한이 없다 |
| `defaultPlanUsd` | ❌ | **M2-10.** 기본 구독 플랜가(월 USD). 수신 계정 전용이며 폴링 계정에서는 저장하지 않는다 |

🔴 **`provider`와 `kind`는 짝이 맞아야 한다.** `CLAUDE_CODE`+`POLL` 또는 `ANTHROPIC`+`RECEIVE`는
`AI_MONITOR_WRONG_ACCOUNT_KIND`다 — 물어볼 API가 없는 쪽을 폴링으로 걸거나, 보내 주지 않는 쪽을
수신으로 걸면 계정이 영영 조용하다.

**응답** — `AiMonAccountDto`에 M2용 필드 2개가 추가됐다(M1 응답에도 함께 나간다):

```json
{
  "id": 7,
  "provider": "CLAUDE_CODE",
  "kind": "RECEIVE",
  "name": "개발팀 Claude Code",
  "credentialMasked": null,
  "hasCredential": true,
  "issuedToken": "<마스킹>",
  "endpoint": "http://moveseye.example.com:3000/ai-monitor/otlp",
  "enabled": true,
  "monthlyBudgetUsd": null,
  "defaultPlanUsd": 100.00,
  "lastOkAt": null,
  "lastError": null,
  "failCount": 0,
  "state": "PENDING",
  "createdAt": "2026-08-25T14:02:11"
}
```

| 필드 | 비고 |
|---|---|
| `hasCredential` | **신규.** 자격증명(키 또는 토큰)이 등록돼 있는가. 수신 계정은 `credentialMasked`가 항상 null이라 이 값으로 판단한다 |
| `issuedToken` | **신규.** 🔴 **등록·재발급 응답에서 단 1회만** 실린다. 그 외에는 항상 `null` — 서버가 해시만 보관해 **다시 조회할 수 없다** |
| `endpoint` | **신규.** `OTEL_EXPORTER_OTLP_ENDPOINT`에 넣을 값 — **등록 응답과 재발급 응답이 같은 값**을 준다. 🔴 수신 계정에만 실리고 폴링 계정에서는 `null`이다(§0.1대로 이 DTO는 null을 그대로 내보낸다). 🔴 `/v1/metrics`를 붙이지 않는다 — exporter가 스스로 붙인다 |
| `credentialMasked` | 🔴 수신 계정은 **항상 null**. 저장된 것이 해시라 뒤 4자리에 아무 뜻이 없다 |
| `state` | 수신 계정에서 `PENDING`은 "아직 아무도 안 보냈다", `OK`는 "받고 있다"를 뜻한다 |

## M2-2. 토큰 재발급 (`POST /ai-monitor/accounts/{id}/token`)

```json
// 요청
{ "consentAcknowledged": true }

// 응답 data
{
  "accountId": 7,
  "accountName": "개발팀 Claude Code",
  "provider": "CLAUDE_CODE",
  "token": "<마스킹>",
  "endpoint": "http://moveseye.example.com:3000/ai-monitor/otlp"
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `provider` | `string` | 🔴 **`CLAUDE_CODE` \| `CODEX_CLI`.** 이 토큰이 쓰일 도구다 — 아래 참고 |
| `token` | `string` | 🔴 원문. 다시 조회할 수 없다 |
| `endpoint` | `string` | 두 도구가 **같은 값**을 받는다. 가르는 것은 `provider`뿐이다 |

🔴 **`provider`로 스니펫 형식과 endpoint 조립을 가른다 — 두 도구의 규칙이 반대다:**

| `provider` | 스니펫 | `endpoint` 사용법 |
|---|---|---|
| `CLAUDE_CODE` | env 블록(M2-5) | **그대로** 넣는다 — exporter가 `/v1/metrics`를 붙인다 |
| `CODEX_CLI` | `config.toml` `[otel]`(M2-11) | 뒤에 **`/v1/metrics`를 이어 붙인다** |

도구를 잘못 알면 스니펫이 틀리고, 그 결과는 **조용한 무수신**이라 발견이 늦다(관리자는 주소·토큰을
의심하게 된다). 응답이 자기 도구를 밝히므로 화면이 상태로 들고 다니며 추측할 필요가 없다.

ℹ️ 등록 응답(§M2-1)은 `AiMonAccountDto`라 이미 `provider`를 갖고 있다 — 두 경로 모두 같은 정보를 준다.

- 🔴 **기존 토큰은 즉시 무효**다. 그 토큰을 쓰던 개발자 PC가 전부 401이 되므로 **새 스니펫을 다시 배포**해야 한다 — 화면이 이 사실을 경고할 것.
- `consentAcknowledged` 필수(재발급은 사실상 수집 재개 결정이다). 없으면 `AI_MONITOR_CONSENT_REQUIRED`.
- 폴링 계정에 호출하면 `AI_MONITOR_WRONG_ACCOUNT_KIND`.
- 🔴 **`endpoint`에 `/v1/metrics`가 없다.** OTel exporter가 스스로 붙인다.
- ℹ️ **등록 응답(§M2-1)에도 같은 `endpoint`가 실린다** — 토큰 모달이 브라우저 주소를 추정할 필요가 없다. 두 경로가 같은 값을 주므로 등록 직후와 재발급 후의 스니펫이 어긋나지 않는다.

## M2-3. 수신 현황 (`POST /ai-monitor/accounts/{id}/test`)

M1과 **같은 엔드포인트**지만 수신 계정에서는 의미가 다르다 — 우리가 나가서 부를 곳이 없으므로
**받은 흔적**을 돌려준다. `AiMonConnectionTestDto`에 3필드가 추가됐다.

```json
// 받고 있는 경우
{ "ok": true, "provider": "CLAUDE_CODE", "detail": "users=4", "reason": null,
  "kind": "RECEIVE", "lastReceivedAt": "2026-08-25T13:58:02", "receivingUsers": 4 }

// 아직 아무도 안 보낸 경우
{ "ok": false, "provider": "CLAUDE_CODE", "detail": "아직 수신 없음", "reason": "NO_TELEMETRY_YET",
  "kind": "RECEIVE", "lastReceivedAt": null, "receivingUsers": 0 }
```

| 필드 | 비고 |
|---|---|
| `kind` | `POLL`\|`RECEIVE` — 응답 해석 방식을 가른다 |
| `lastReceivedAt` | RECEIVE 전용. POLL이면 항상 `null` |
| `receivingUsers` | RECEIVE 전용. 보내 온 사용자 수 |

🔴 **`ok:false`가 오류가 아니다.** 수신 계정에서 `ok`는 "한 번이라도 받은 적이 있는가"이므로,
false는 대개 "아직 아무도 설정하지 않았다"다 — 화면은 **실패가 아니라 설정 안내**를 보여줘야 한다.

## M2-4. OTLP 수신 (`POST /ai-monitor/otlp/v1/metrics`)

**FE가 호출하지 않는다.** 개발자 PC의 Claude Code가 직접 부른다. FE는 이 경로를 **스니펫에 넣기만** 한다.

| 항목 | 값 |
|---|---|
| **정본 경로** | `POST /ai-monitor/otlp/v1/metrics`(Claude Code) · 🔴 **`POST /ai-monitor/otlp/v1/logs`**(Codex CLI — M2-11). 인증·중복 방어·상태 코드 규약은 동일 |
| 인증 | `Authorization: Bearer <수신 토큰>` — 쿠키·`x-visitor-id` **불필요**(CLI가 호출한다). `Bearer` 대소문자 무관 |
| Content-Type | `application/json` (OTLP **http/json** 전용. protobuf/grpc는 받지 않는다) |
| 본문 상한 | 1MB(`app.ai-monitor.otlp.max-body-bytes`) |

### 🔴 중복 경로도 받아 준다 (오설정 구제)

`POST /ai-monitor/otlp/v1/metrics/v1/metrics` **도 정상 수용**한다. FE가 스니펫에 넣는 값은 계약대로
`…/ai-monitor/otlp`까지이고 exporter가 `/v1/metrics`를 붙이지만, 개발자가 OTel 일반 문서를 보고
**전체 경로를 그대로** 환경변수에 넣는 실수가 흔하다.

**판단 근거** — 404로 두면 잃는 것이 **그 개발자의 텔레메트리 전량**인데, 관리자 눈에는 "무수신"
알람으로만 보여 **원인을 서버 주소·토큰으로 오진하게 된다**. 계약의 순수함보다 데이터를 잃는 값이
크다고 봤다. 다만 **조용히 받지는 않는다** — 이 경로로 들어오면 BE가 WARN 로그를 남긴다:

```
OTLP 수신 경로가 중복됐다(/ai-monitor/otlp/v1/metrics/v1/metrics). 받아 주기는 했지만
개발자의 OTEL_EXPORTER_OTLP_ENDPOINT에 /v1/metrics가 붙어 있다 —
'…/ai-monitor/otlp'까지만 넣어야 한다(exporter가 나머지를 붙인다).
```

⚠️ **관용은 한 겹까지다.** 세 겹 이상(`…/v1/metrics/v1/metrics/v1/metrics`)은 **404**다 — 오타를
무한히 받아 주면 그건 계약이 아니라 추측이 된다.
ℹ️ FE는 이 관용에 기대지 말고 **응답의 `endpoint`를 그대로** 스니펫에 넣을 것(그 값이 정본이다).

🔴 **이 엔드포인트만 "에러도 HTTP 200" 계약을 따르지 않는다.** 클라이언트가 OTel exporter라
**상태 코드로** 판단하기 때문이다 — 200이면 데이터를 버리고, 5xx면 재시도한다.

| 상태 | 언제 | exporter 동작 |
|---|---|---|
| **200** `{}` | 정상 수용 | 데이터 폐기(정상) |
| **401** | 토큰 없음·틀림·`Bearer` 형식 아님 | 폐기 |
| **400** | JSON 파싱 실패 | 폐기(재시도해도 같다) |
| **415** | `Content-Type`이 `application/json`이 아님 | 폐기. 🔴 **OTel SDK 기본이 `http/protobuf`**라 `OTEL_EXPORTER_OTLP_PROTOCOL`을 빠뜨리면 곧바로 여기로 온다. 응답 본문에 `hint`로 조치를 적어 준다 |
| **413** | 본문 상한 초과 | 폐기 |
| **503** | 라이선스 만료·잠금 | **재시도** — 갱신하면 버퍼분이 들어온다 |
| **500** | 우리 쪽 적재 실패 | **재시도** |

## M2-5. 개발자 배포용 값 (FE가 스니펫으로 조립할 것)

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=<응답의 endpoint>
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <응답의 token>"
```

- 🔴 **환경변수는 Claude Code 실행 *전에*** 설정돼 있어야 한다(실행 후 export는 무효).
- 🔴 **원문 수집 옵션(`OTEL_LOG_USER_PROMPTS` 등)은 스니펫에 넣지 않는다** — 설계서 §5.3의 핵심 안심 포인트가 "프롬프트·응답·코드 원문을 수집하지 않는다"이고, BE도 메트릭만 받는다(로그 수신 엔드포인트 자체가 없다).
- 수집 항목 고지문(§5.3)에 들어갈 실제 수집 값: **이메일 또는 계정 ID · 모델별 토큰 4종 · 추정 비용 · 세션 수 · 활동 시간(초) · 코드 라인 수(추가/삭제)**. 그 외 메트릭(커밋·PR 수 등)은 **받아도 버린다**.

## M2-6. 조회 API 변경 (M1 계약에 대한 증분)

### `GET /ai-monitor/usage` — 파라미터 1개·필드 2개 추가

| 추가 | 내용 |
|---|---|
| 쿼리 `source` | `POLL`\|`OTEL`. 생략하면 전 소스 합산. 🔴 **알 수 없는 값은 거부하지 않고 "전부"로 접힌다**(period와 달리 선택 필터라, 오타로 화면이 통째로 에러가 되는 것보다 넓게 보여 주는 편이 낫다) |
| 응답 `source` | 적용된 필터. 전체면 **키 생략**(`NON_NULL`) |
| 응답 `byUser` | `AiMonUsageSliceDto[]` — **M2의 핵심 축** |

`AiMonUsageSliceDto`에 차원 필드 `user`와 **활동 지표 4개**가 추가됐다:

```json
// byUser 조각 — 활동 지표가 항상 실린다
{ "user": "hong@dmove.co.kr", "calls": 0, "costUsd": 3.0,
  "inputTokens": 300, "outputTokens": 30, "cacheReadTokens": 0, "cacheWriteTokens": 0,
  "sessions": 12, "activeTimeSeconds": 5400, "linesAdded": 820, "linesRemoved": 310 }

// byModel 조각 — 활동 지표 4개의 키가 아예 없다
{ "model": "claude-sonnet-4-5", "calls": 3, "costUsd": 1.0,
  "inputTokens": 10, "outputTokens": 2, "cacheReadTokens": 1, "cacheWriteTokens": 0 }
```

| 필드 | 타입 | 어디에 나오나 |
|---|---|---|
| `sessions` | `number` | 🔴 **byUser에만.** 세션 시작 수 |
| `activeTimeSeconds` | `number` | 🔴 **byUser에만.** 활동 시간 **초**. ℹ️ 저장은 **밀리초**이고 응답에서 한 번만 초로 반올림한다(V34) — 배치마다 접으면 소수부가 사라져 구조적으로 짧게 나왔다(E2E M2-L1) |
| `linesAdded` / `linesRemoved` | `number` | 🔴 **byUser에만.** 코드 라인 수 |

🔴 **생략 규칙이 슬라이스마다 다르다 — 이게 계약이다:**

| 슬라이스 | 활동 지표 4개 |
|---|---|
| `byUser` | **항상 존재**(값이 없으면 `0`). 폴링 소스 사용자 행(`user: ""`)도 `0`으로 나온다 |
| `byModel` · `byWorkspace` · `byApiKey` · `daily` | **키 자체가 생략**(`NON_NULL`) |

- **byUser 안에서 생략하지 않는 이유**: 행마다 열이 나타났다 사라지면 표가 깨진다. FE가 매 행 `?? 0`을 쓰는 것보다 "이 슬라이스에는 항상 있다"가 단순하다. 폴링 행의 `0`은 **사실이다** — 프로바이더는 세션·활동 시간을 알려 주지 않는다.
- **다른 슬라이스에서 빼는 이유**: "모델별 세션 수"·"일자별 라인 수"는 <b>뜻이 없는 숫자</b>다(활동은 사람에게 귀속된다). 0으로라도 내보내면 FE가 그 열을 그릴 수 있게 되고, 그러면 잘못된 표가 만들어진다.

- 🔴 **개인 식별 축이다.** 관리자 전용(설계서 §5.2 — "남의 사용 패턴은 업무 정보"). 지금은 `/ai-monitor/**`가 전부 관리자 전용이라 자동으로 지켜진다.
- 폴링형 행은 `user`가 **빈 문자열**로 한 조각에 모인다 — "누가 썼는지 프로바이더가 알려 주지 않는다"는 사실을 감추지 않는다.

🔴 **비용을 볼 때는 소스를 나눠야 할 수 있다.** 개발자가 **API 키로** Claude Code를 쓰면 같은 지출이
폴링 리포트(청구 기준)와 수신 텔레메트리(에이전트 추정)에 **둘 다** 잡힌다. 합계는 그 경우 과대
계상이므로 화면이 소스 토글을 제공해야 한다.

### 알람 2종 추가 (`GET /ai-monitor/alerts` · `usage/compact.alerts`)

| `code` | `severity` | 조건 | `value` |
|---|---|---|---|
| `RECEIVE_SILENT` | `critical` | 수신 계정 전체가 **7일** 이상 무수신 | 경과 일수 |
| `RECEIVER_SILENT` | `warning` | 개별 사용자가 7일 이상 무수신(**계정당 1건**, 인원수+예시 3명) | 무수신 인원수 |

- 🔴 **계정 전체가 조용하면 개별 사용자 알람을 내지 않는다** — 전원이 조용한 것을 사람 수만큼 반복하지 않는다.
- 🔴 **한 번도 수신이 없는 계정은 알람을 내지 않는다** — 방금 만든 계정이 곧바로 빨개지면 등록 화면을 벗어나기도 전에 경고가 뜬다. 그건 알람이 아니라 빈 상태 화면이 할 일이다.
- 관리자가 해야 할 일이 다르므로 둘을 합치지 않았다: 계정 무수신 = "배포가 안 됐다/주소·토큰이 틀렸다", 개별 무수신 = "그 사람이 설정을 안 했거나 팀을 떠났다"(§5.4의 연결 확인 UX).

### 인벤토리 — `itemType: "RECEIVER"` 추가

`GET /ai-monitor/accounts/{id}/inventory`에 수신 사용자가 함께 나온다.

```json
{ "itemType": "RECEIVER", "externalId": "hong@dmove.co.kr", "displayName": "hong@dmove.co.kr",
  "status": "active", "lastUsedAt": "2026-08-25T13:58:02", "lastUsedSource": "PROVIDER", "unusedDays": 0 }
```

`lastUsedAt`은 **마지막 수신 시각**이다. 새 테이블을 만들지 않은 이유는 "N일 미사용" 판정이 API 키와
완전히 같은 모양이라 알람·화면이 그대로 재사용되기 때문이다.

## M2-10. 구독 플랜 대비 활용도 (설계서 §5.3.5 · V33)

🔴 **수신 계정에서 달러의 의미는 폴링과 정반대다.** 폴링은 **실지출**(초과=나쁨, 경고)이고 수신은
정액 구독의 **API 환산 가치**(플랜가 초과=본전을 뽑은 것, **저활용이 시트 낭비**)다.
예산 로직 하나로 뭉개면 **가장 잘 쓴 개발자에게 빨간 경고가 뜨는 뒤집힌 화면**이 된다.

### 🔴 수신 계정은 예산에서 제외된다

| 지점 | 동작 |
|---|---|
| `GET /ai-monitor/usage?accountId=<수신계정>` | 예산 5필드(`budgetUsd`·`percent`·`remainingUsd`·`warn`·`over`)가 **전부 생략** |
| `GET /ai-monitor/usage/compact` | 예산 합계에 수신 계정을 **더하지 않는다**(폴링 계정만 합산) |
| `BUDGET_WARN` / `BUDGET_OVER` 알람 | 수신 계정은 **평가하지 않는다** |

⚠️ **이미 수신 계정에 `monthlyBudgetUsd`를 넣어 둔 설치본이 있을 수 있다**(M2 이전에 등록한 계정,
dev DB 포함). 그 값은 **저장된 채로 무시**된다 — 지우지 않은 이유는 되돌릴 수 없는 파괴를 피하기
위해서다. 화면은 수신 계정의 예산 입력을 아예 노출하지 않는 편이 낫다.

### 플랜가 저장 — 기본값 + 사용자별 예외

사람마다 플랜이 다른 현실(5x/20x)을 담기 위해 두 층으로 둔다:

1. **계정 기본값** — `defaultPlanUsd`(계정 등록/수정 요청·응답, M2-1).
2. **사용자별 예외** — 아래 EP. 🔴 **기본값과 같은 사람은 저장하지 않는다**(예외만 둔다). 전원을
   저장하면 기본값을 바꿔도 아무도 따라오지 않는다.

적용 순서: **예외 → 계정 기본값 → (둘 다 없으면) 플랜 모름**.

### `GET /ai-monitor/accounts/{id}/user-plans`

```json
{ "status": "success", "code": 200,
  "data": [ { "userKey": "hong@dmove.co.kr", "planUsd": 200.00 } ] }
```

### `PUT /ai-monitor/accounts/{id}/user-plans` — 전체 교체

```json
// 요청
{ "plans": [ { "userKey": "hong@dmove.co.kr", "planUsd": 200.00 },
             { "userKey": "kim@dmove.co.kr",  "planUsd": 100.00 } ] }
```

- 🔴 **전체 교체다.** 요청에 없는 사용자는 예외가 삭제되어 **계정 기본 플랜가로 되돌아간다**.
  빈 배열(`{"plans": []}`)을 보내면 예외가 전부 사라진다.
- **왜 단건 upsert가 아닌가**: 목록이 팀 규모(수~수십)라 통째로 다루기에 작고, 무엇보다 **삭제가
  표현된다**. 단건 upsert만 두면 "기본값으로 되돌리기"에 별도 DELETE가 필요하고, 화면은 편집 가능한
  표 하나인데 저장 경로가 둘로 갈린다.
- **검증은 저장 전에 전부** 한다 — 한 행이라도 잘못되면 **기존 목록을 지우지 않고** 거부한다
  (부분 실패로 데이터를 잃지 않는다).
- 같은 `userKey`가 두 번 오면 **뒤엣것이 이긴다**(거부하지 않는다 — 저장 전체를 실패시키면 사용자가
  어느 행이 문제인지 모른다).
- 수신 계정 전용. 폴링 계정이면 `AI_MONITOR_WRONG_ACCOUNT_KIND`(쓴 만큼 청구되므로 "플랜가"가 성립하지 않는다).

### `byUser` 슬라이스의 2필드

```json
{ "user": "hong@dmove.co.kr", "costUsd": 275.0, "calls": 0,
  "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheWriteTokens": 0,
  "sessions": 12, "activeTimeSeconds": 5400, "linesAdded": 820, "linesRemoved": 310,
  "planUsd": 200.00, "utilizationPercent": 137.5 }
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `planUsd` | `number` | 이 사용자에게 적용된 월 플랜가 |
| `utilizationPercent` | `number` | `costUsd / planUsd × 100`, 소수 1자리 **반올림(HALF_UP)**. 마이크로달러 정수에서 계산한다(E2E D-5와 같은 방식) |

🔴 **생략 조건 — 넷 중 하나라도 어긋나면 두 필드가 함께 빠진다:**

| 조건 | 이유 |
|---|---|
| `accountId`를 지정했는가 | 플랜은 **계정에 매인 값**이다. 전 계정 합산에서는 같은 이메일이 두 계정에 있을 때 "어느 플랜인가"를 답할 수 없다 |
| 그 계정이 `kind=RECEIVE`인가 | 폴링은 쓴 만큼 청구되므로 "플랜 대비"가 성립하지 않는다 |
| `period=month`인가 | 플랜은 **월 단위 약속**이다. 주·일로 비율을 내면 "오늘 플랜의 3%"처럼 뜻이 없다 — 예산 필드가 month에서만 나가는 것과 같은 규칙 |
| 플랜가를 알고 `> 0`인가 | 모르면 계산할 수 없고, **0이면 활용도가 무한대**가 된다. 🔴 0을 채워 넣지 않는다 |
| 🔴 **이 사용자의 비용을 알 수 있는가** | 토큰은 있는데 **비용 행이 하나도 없으면**(Codex CLI처럼 비용을 영영 주지 않는 소스) 활용도가 항상 0%가 되어 화면이 **저활용(주황)**으로 칠한다. 실제로는 *모르는* 것이라 두 필드를 생략한다(E2E R3-D2). ⚠️ **토큰이 아예 없는 사용자는 예외** — 그건 '안 썼다'가 맞고, 플랜을 받아 두고 쓰지 않는 것이야말로 이 지표가 잡아야 할 시트 낭비다. 혼합 사용자(Claude Code+Codex)는 **priced 비용이 하나라도 있으면** 계산된다 |

⚠️ **활동 지표 4개와 생략 규칙이 다르다** — 활동 지표는 `byUser`에서 값이 0이어도 **항상** 실리고,
플랜 2필드는 **조건부**다. 이유: "세션 0회"는 사실이지만 "플랜가 0원"은 존재하지 않는 값이다.

### 🔴 화면 표시 규칙 (설계서 §5.3.5)

- **활용도가 높은 것은 긍정 신호다.** 예산 사용률과 색을 공유하면 안 된다 — 100%를 넘었다고 빨갛게
  칠하면 "가장 잘 쓴 사람"이 문제로 보인다.
- **저활용이 주의 신호다**(시트 낭비). 임계값은 화면이 정한다.
- **알람은 신설하지 않았다**(설계 결정) — 무수신 알람이 극단 케이스를 이미 잡고, 저활용은 판단이
  필요한 값이라 알람보다 표시가 맞다.

## M2-11. Codex CLI 수신 (설계서 §5.3.7 · **E2E 3라운드 실측으로 전면 개정**)

수신형은 Claude Code 전용이 아니다 — **OpenAI Codex CLI도 옵트인 OTel 내보내기를 지원**한다.
계정 등록(`provider: "CODEX_CLI"`, `kind: "RECEIVE"`)·토큰 발급·동의·중복 방어·무수신 알람은
**Claude Code와 완전히 같은 흐름**이다.

### 🔴 Codex는 메트릭이 아니라 **로그**로 보낸다 (실측: codex-cli 0.149.0)

계약의 원래 전제(`codex.turn.token_usage` 히스토그램)는 **문서 기반 추정이었고 실측에서 존재하지
않았다**. 실제 페이로드의 최상위 키는 `resourceMetrics`가 아니라 **`resourceLogs`**다.

| 항목 | 실측 |
|---|---|
| **수신 경로** | 🔴 **`POST /ai-monitor/otlp/v1/logs`** |
| 신호 | OTLP 로그(`resourceLogs`, scope `codex_otel.log_only`) |
| 토큰 위치 | **`codex.sse_event` 로그 레코드의 속성** |
| 속성명 | `input_token_count` · `cached_token_count` · `output_token_count` · `reasoning_token_count` · `cache_write_token_count` · `tool_token_count` — 🔴 **값이 전부 문자열** |
| 사용자 귀속 | ✅ **`user.email`이 온다**(`user.account_id`도) |
| 메트릭 스위치 | **없다** — `otel.metrics`·`otel.signals`·`otel.exporter_metrics` 전부 unknown field |

**이 전제가 틀렸던 대가**: 서버가 `resourceLogs`에 **200 OK를 주고 0행을 적재**했다. 모든 단계가
성공으로 보이면서 데이터만 사라졌고, 7일 뒤 `RECEIVE_SILENT`가 **정확히 설정된 것들**을 의심하게 만들었다.
그래서 이제 **적재 결과가 0행이면 WARN 로그**를 남긴다(빈 배치와 구분이 안 되는 대가는 있지만,
조용한 데이터 소실보다 시끄러운 편이 낫다).

ℹ️ **메트릭 파서는 지우지 않고 병행 유지한다.** 배포 버전에 따라 메트릭으로 보내는 빌드가 있을 수
있고, 둘 다 받아도 충돌하지 않는다(한쪽만 오면 다른 분기가 안 탈 뿐). **실측 기준은 로그**다.

### Codex 스니펫 정본 (FE가 쓸 값)

```toml
[otel]
environment = "prod"
exporter = { otlp-http = { endpoint = "<응답의 endpoint>/v1/logs", protocol = "json", headers = { Authorization = "Bearer <응답의 token>" } } }
```

- 🔴 **`/v1/logs`를 직접 붙인다**(`/v1/metrics`가 아니다). Codex는 준 주소를 그대로 쓰므로 우리가
  경로를 완성해 줘야 한다 — Claude Code는 exporter가 붙여 준다(M2-2). 응답의 `endpoint`가
  `…/ai-monitor/otlp`이므로 뒤에 `/v1/logs`를 이어 붙인 값이 최종 주소다.
  ⚠️ **기존 안내가 `/v1/metrics`였다면 그 설정으로는 아무것도 들어오지 않는다** — 스니펫을 고치고
  이미 배포된 개발자에게 재안내해야 한다.
- `protocol = "json"` — 우리는 http/json만 받는다. protobuf면 **415**(M2-4).
- 🔴 **`otel.log_user_prompt`를 스니펫에 넣지 않는다.** 유효한 설정 필드이며, 기본값에서는
  프롬프트가 `[REDACTED]`로 온다(실측 확인). 원문 수집은 설계 비범위다.
- 사용자 `~/.codex/config.toml`을 건드리지 않고 시험하려면 런타임 오버라이드(`codex -c '...'`)를 쓴다.

### 토큰 매핑

| 로그 속성 | 우리 열 |
|---|---|
| `input_token_count` | `input_tokens` |
| `cached_token_count` | `cache_read_tokens` |
| `output_token_count` + `reasoning_token_count` | `output_tokens` (**합산**) |
| `cache_write_token_count` | `cache_write_tokens` |
| `tool_token_count` | 🔴 **세지 않는다** — 아래 참고 |

- **`output`과 `reasoning`을 합치는 이유**: 둘 다 모델이 생성한 토큰이고 같은 단가 축이며, 우리
  스키마에 추론 토큰 전용 열이 없다. 나누면 Claude Code 수신분과 열의 의미가 어긋나 두 도구를 한
  표에서 볼 수 없다.
- 🔴 **`tool_token_count`는 `input`과 값이 겹쳐 보이나 미확정**이다(E2E가 실측 필요로 남긴 항목).
  겹치는 값을 더하면 입력 토큰이 두 번 세어지므로 **확인 전에는 세지 않는다** — 적게 세는 것은
  드러나지만 부풀린 것은 숨는다.
- **토큰 값이 실린 레코드만** 담는다. 이벤트 이름 목록을 하드코딩하지 않으므로 Codex가 이벤트를
  추가·개명해도 깨지지 않는다(`conversation_starts`·`user_prompt`·`turn_ttft` 등은 자연히 걸러진다).

### 🔴 관측 시각: `timeUnixNano`는 `"0"`으로 온다 (E2E 4라운드 R4-D1)

Codex 로그 레코드의 `timeUnixNano`는 **문자열 `"0"`**이고 실제 시각은 `observedTimeUnixNano`에 있다.

**0을 값으로 취급하면 `Instant.EPOCH`(non-null)가 되어 폴백이 걸리지 않는다** — 그 결과 모든 행이
**1970-01-01 버킷**에 쌓여 `bucket_start`·`day`가 1970이 되고, **적재는 성공하는데 어떤 기간
조회에서도 보이지 않았다**. `rows=1`·`last_ok_at` 갱신까지 정상이라 원인 추적이 가장 어려운 종류다.

**시각 결정 순서(메트릭·로그 공통):**

| 순위 | 값 | 비고 |
|---|---|---|
| 1 | `timeUnixNano` | 🔴 **0 이하는 "값 없음"**으로 본다(부재와 동일) |
| 2 | 로그: `observedTimeUnixNano` / 메트릭: `startTimeUnixNano` | |
| 3 | **서버 수신 시각** | 아래 참고 |

🔴 **시각을 모른다고 데이터를 버리거나 1970에 넣지 않는다.** 둘 다 이 기능에서 실제로 겪은 실패다 —
1970은 조용한 소실이고, 버리는 것은 그 배치의 사용량이 영영 사라지는 것이다(DELTA는 재전송이 없다).
수신 시각은 **충분히 좋은 근사**다: export 주기가 60초라 1시간 버킷을 벗어날 일이 거의 없다.

ℹ️ 수신 시각은 **요청 1건당 하나**를 만들어 파싱·적재가 같은 값을 쓴다 — 배치 안에서 데이터포인트마다
달라지면 같은 회차가 두 버킷으로 갈린다.

### 비용을 주지 않는다 → 활용도 필드가 생략된다

Codex는 USD를 보내지 않는다 → `cost_micro_usd = 0`, **`priced = false`**.

🔴 **그 결과 `byUser`의 `planUsd`·`utilizationPercent`가 생략된다**(M2-10에 조건 추가 — 아래).
예전에는 비용이 0이라 활용도가 **항상 0%**가 되고 화면이 이를 **저활용(주황)**으로 칠했다.
아무리 많이 써도 주황인 뒤집힌 화면이었다 — 실제로는 **"활용도를 알 수 없음"**이다.

⚠️ `unpricedDays`는 계속 올라간다. 화면은 Codex 계정에 대해 **"이 도구는 비용을 제공하지 않습니다"**로
안내해야 한다 — "아직 집계되지 않았습니다"는 **거짓**이다(기다려도 오지 않는다).

### ✅ 사용자 귀속이 된다 (계약이 포기했던 것)

`user.email`이 실제로 오므로 `byUser`에 **사람 단위로** 잡히고, 인벤토리에 `RECEIVER` 항목이
생기며, 개별 사용자 무수신 알람(`RECEIVER_SILENT`)도 동작한다. 예전 "귀속 불가 폴백" 문구는 철회한다.
(폴백 자체는 남아 있다 — 속성이 없는 페이로드는 `user_key=''`로 계정 단위에 모이고 `RECEIVER`
항목을 만들지 않는다.)

## M2-12. 설정 가이드 메일 (설계서 §5.4)

### `POST /ai-monitor/accounts/{id}/guide-mail`

```json
// 요청
{
  "recipients": ["hong@dmove.co.kr", "kim@dmove.co.kr"],
  "subject": "[MovesEye] Claude Code 사용량 수집 설정 안내",
  "body": "안녕하세요...\n\n[설정 방법]\nexport CLAUDE_CODE_ENABLE_TELEMETRY=1\n..."
}

// 응답 data
{ "sent": 2, "failed": [] }
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `recipients` | ✅ | 1~**50**명. 🔴 **하나라도 형식이 틀리면 전체 거부**. 중복은 자동 제거(같은 사람에게 토큰이 두 번 가지 않게) |
| `subject` | ❌ | 비우면 `[MovesEye] AI 사용량 수집 설정 안내` |
| `body` | ✅ | 🔴 **FE가 조립한 완성본**(평문). 서버는 가공하지 않는다 |

### 🔴 BE는 relay일 뿐이다 — 본문을 만들지 않는다

서버는 토큰을 **해시로만** 갖고 있어 스니펫을 조립할 수 없다. 그래서:

1. **발급·재발급 직후에만 쓸 수 있다.** 나중에 다시 보내려면 재발급해야 하고, 그러면 기존 토큰이
   무효가 된다(M2-2). 화면이 이 사실을 미리 말해야 한다.
2. **본문을 저장하지도 로그에 남기지도 않는다.** 안에 토큰 원문이 있다 — `email` 테이블에 적으면
   "해시만 보관한다"는 약속이 뒷문으로 무너진다. 그래서 이 경로만 기존 템플릿 메일과 달리
   **DB 레코드를 만들지 않는다**(발송 이력이 남지 않는다는 뜻이기도 하다).
3. **평문으로 발송한다**(HTML 아님). 본문이 설정 스니펫이라 HTML이면 줄바꿈이 뭉개진다.

### 🔴 SMTP 미설정은 침묵하지 않는다

기존 템플릿 메일 경로는 SMTP가 없으면 레코드를 `PENDING`으로 남기고 **조용히 넘어간다**.
가이드 메일에서 그러면 관리자는 "보냈다"고 믿고 개발자는 영영 못 받는다 — 그래서 보내기 전에
`AI_MONITOR_MAIL_NOT_CONFIGURED`로 거부한다.

ℹ️ 이 기능이 **SMTP 활성화의 첫 실수요**다(§5-A의 미결 항목). 설정 방법: `.env`에 `MAIL_*`,
`application.yml`의 `spring.mail.*`. 판정 조건 셋이 모두 필요하다 — `JavaMailSender` 빈 존재 ·
`app.mail` 설정 · 보내는 주소(`fromEmail`).

### 부분 실패는 감추지 않는다

한 명이 실패해도 **나머지는 보내고** 실패한 주소를 그대로 돌려준다(`failed`). 전부 롤백하면 이미
받은 사람에게 다시 보내야 하고(토큰이 두 번 도는 셈), 성공만 보고하면 관리자는 못 받은 사람을
영영 모른다.

⚠️ **형식 오류는 반대로 전체를 거부한다.** 보내기 전에 알 수 있는 실수라 고칠 기회를 주는 것이 맞고,
부분 발송 후 거부하면 토큰이 이미 절반에게 간 상태가 된다. SMTP 실패는 보내 봐야 아는 것이라 다르다.

## M2-7. V30 확장이 아니라 V31로 분리한 근거

V30은 **아직 커밋 전**이라 고칠 수 있었지만, 그렇게 하면 **더 나쁘다**:

1. **dev DB에 V30이 이미 적용돼 있고 사용자가 등록한 계정 데이터가 들어 있다.** `CREATE TABLE IF NOT EXISTS`는 기존 테이블에 컬럼을 더해 주지 않으므로, V30을 고쳐도 dev DB에는 **손으로 `ALTER`를 쳐야** 한다 — 즉 V31의 내용을 수작업으로 실행하는 것과 같은 일을 하면서 체크섬 복구 절차만 더 붙는다.
2. **이번 변경은 정정이 아니라 순수 추가**다. 마이그레이션을 나누는 것이 원래 규약이다(`moveseye-be-spring/CLAUDE.md` §3 #7). (V30에서 `DEFAULT now()`를 걷어낸 것은 "이미 틀린 파일을 고치는" 정정이라 예외였다.)
3. V31은 `ADD COLUMN IF NOT EXISTS`·`CREATE TABLE IF NOT EXISTS`로 **멱등**이라 어느 환경에서 실행돼도 안전하다.

**결과**: dev DB는 다음 기동에 V30(재적용, 전부 no-op) → V31이 순서대로 적용된다. **복구 작업 없음.**

### V31이 더하는 것

| 대상 | 내용 |
|---|---|
| `ai_mon_usage` | `sessions` · `active_time_seconds`(초) · `lines_added` · `lines_removed` (전부 `bigint NOT NULL DEFAULT 0`) |
| 인덱스 | `ai_mon_usage_user_idx (account_id, user_key, day)` — byUser 조회용 |
| `ai_mon_otel_cursor` | 누적 카운터의 직전 값(§M2-8) |

## M2-8. 🔴 delta / cumulative — 양쪽을 다 처리한다

OTLP Sum 데이터포인트는 `aggregationTemporality`가 두 가지다. **Claude Code가 어느 쪽으로 보내는지는
문서에 없다**(research §6-5·6 미실측). 그래서 둘 다 처리한다:

| temporality | 값의 의미 | 우리 처리 |
|---|---|---|
| `DELTA`(1) | 지난 60초의 증분 | 그대로 더한다 |
| `CUMULATIVE`(2) | 프로세스 시작 이후 누적 | **직전 값과의 차이만** 더한다(`ai_mon_otel_cursor`) |
| 없음/`UNSPECIFIED` | (스펙상 Sum에는 필수라 정상 SDK에서는 오지 않는다) | **누적으로 처리 + 경고 로그** |

**왜 UNSPECIFIED를 누적으로 보는가**: 둘 중 하나를 틀린다면 **누적을 델타로 오해하는 쪽이 훨씬 위험하다**
— 60초마다 누적 전체가 더해져 하루 만에 실제의 수백 배가 되고 예산 알람이 즉시 거짓으로 울린다.
반대(델타를 누적으로 오해)는 증분이 0에 수렴해 **적게** 잡히는데, 그건 `asOf`·`unpricedDays` 같은
기존 신호로 "값이 안 들어온다"가 드러난다.

**누적 처리의 두 가지 세부 규칙:**
- **첫 관측은 적재하지 않는다.** 증분을 알 수 없는데 누적 전체를 더하면 "우리가 보기 전"의 사용량까지 그 시간 버킷에 몰린다. 기준점만 세우고 **다음 배치(60초 뒤)부터** 정확해진다.
- **`startTimeUnixNano`가 바뀌거나 값이 줄면 카운터 리셋**(Claude Code 재시작)으로 보고 현재 값 전체를 증분으로 삼는다. 이게 없으면 재시작 이후 사용량이 통째로 유실된다.

## M2-9. 수신 경로의 중복 방어 (V34)

폴링형 upsert는 **교체**(재폴링해도 같은 결과)지만, 수신형은 **누적**이다(60초마다 오는 증분을 더해야
1시간 버킷이 완성된다). 그래서 **같은 POST를 두 번 받으면 두 번 더해진다** — E2E가 같은 본문 3회 =
3배로 실측했다.

E2E에서 temporality가 **DELTA로 확정**되면서 "누적이면 커서가 차이를 0으로 만든다"는 안전망이
**작동하지 않는 코드**가 됐다. 그래서 **경량 dedup을 도입했다.**

### 동작

적재에 **성공한** 요청 본문의 sha-256을 `ai_mon_otel_receipt`에 남기고, 같은 (계정, 해시)가 다시 오면
**적재 없이 200**을 돌려준다(exporter에게는 성공 — 재전송을 멈춘다). 보존 30분, 그 이후 자동 정리.

- 🔴 **인증 실패는 기록하지 않는다.** 401을 받고 토큰을 고쳐 다시 보내는 것은 **정상 재전송**이라
  막으면 안 된다. 기록은 실제로 적재한 뒤에만 남긴다.
- 🔴 **조건부 삽입(`ON CONFLICT DO NOTHING`)이다.** "조회 후 삽입"이면 동시에 도착한 두 재전송이
  둘 다 통과한다(`SchedulerLeaseService`가 같은 이유로 조건부 UPDATE를 쓴다).
- 계정별로 센다 — 다른 계정의 같은 해시는 막지 않는다.

### 왜 문서화된 한계로 남기지 않았나

exporter는 비2xx에만 재전송하므로 위험 창은 **"적재는 성공했는데 응답이 유실된"** 경우로 좁다.
그런데도 도입한 이유:

1. **발생하면 조용히 부풀고 발견이 늦다.** 비용 감시 제품에서 숫자가 소리 없이 커지는 것은 가장 나쁜
   실패다 — 관리자는 그 숫자를 근거로 판단한다.
2. **비용이 싸다.** 요청당 인덱스 삽입 1회 + 짧은 TTL이라 테이블이 항상 작다.
3. **거짓 중복 위험이 사실상 없다.** 페이로드에 `timeUnixNano`가 들어 있어 서로 다른 export가
   바이트 단위로 같아질 수 없다. 같다면 그건 정말 같은 요청이다.

⚠️ 남는 한계: 30분을 넘겨 도착하는 재전송은 막지 못한다(그때는 exporter가 이미 포기했을 시점이다).

---

## 🔴 M2 잔여 이슈

1. **OTLP 실 페이로드 미실측** — 픽스처(`otlp_metrics_*.json`)는 OTLP 스펙 + Claude Code 문서 기반 추정이다. **이 개발 PC의 Claude Code로 dev BE(:3000)에 실제로 쏴 보는 것**이 다음 검증이다(research §6-5). 확인할 것: (a) `user.email`이 resource 속성인지 데이터포인트 속성인지, (b) temporality가 숫자인지 문자열인지 **그리고 실제로 delta인지 cumulative인지**, (c) `type` 값 철자(`cacheRead`/`cacheCreation`).
2. **delta 재전송 중복** — §M2-9. 실측으로 재전송 빈도를 본 뒤 판단.
3. **세션 수를 `calls`에 넣지 않았다** — 폴링형 `calls`는 "API 요청 건수"인데 Claude Code는 그 값을 주지 않는다. 두 소스를 합산했을 때 서로 다른 것을 더하지 않도록 `sessions` 열에만 담는다. 화면이 소스별로 다른 열을 봐야 한다.
4. **비용 이중 계상** — §M2-6. 소스 필터로 화면이 나눠 보게 했을 뿐, "같은 지출인지" 자동 판별은 하지 않는다(할 방법이 없다 — 폴링 리포트에 어떤 요청이 Claude Code였는지 표시가 없다).
5. **`app.ai-monitor.public-base-url` 설치 시 필수 변경** — 기본값 `http://localhost:3000`은 dev 편의용이다. 개발자 PC에서 `localhost`는 자기 자신이라 그대로 두면 아무 데이터도 안 들어온다. 화면이 스니펫에 이 값을 그대로 보여 주므로 관리자가 알아챌 수는 있다.
6. **배포용 안내문 템플릿(§5.3-2)은 FE 몫** — BE는 수집 항목의 사실만 제공한다(§M2-5).
