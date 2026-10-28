# E2E 런타임 검증 — AI 계정 모니터링 (M1)

- 실행: 2026-08-25 · functional-qa (행위/런타임 검증)
- 대상: BE `moveseye-be-spring` ZM-79(미커밋) + FE `moveseyee_fe` master(미커밋)
- 입력: `features/ai/ai-account-monitoring/contract_ai-account-monitoring.md` · 정적 QA `qa_ai-account-monitoring.md`(PASS)
- 기동: BE `bootRun` dev 프로필(JDK17, :3000, 도커 PG 5433) / FE `npm run dev` :5173 / Chrome MCP
- 검증 후 **테스트 데이터·계정 전량 삭제, 프로세스 종료 완료**(§6)

> **한 줄 요약** — 계약서 §0~§4의 런타임 행위는 **값 수준까지 계약과 일치**했다.
> 결함 2건(MEDIUM)은 **둘 다 "숫자가 아니라 숫자를 읽는 방식"**에 있다:
> 비용 반영 시각이 9시간 어긋나고, 홈 위젯의 예산 초과 게이지가 **초록색**으로 그려진다.
> 덤으로 **프로바이더 실호출이 처음으로 실측**됐다(계약 §5-B의 "미검증" 일부 해소).

---

## 1. 총괄표

| # | 시나리오 | 판정 | 근거 |
|---|---|---|---|
| 1 | 기동·V30 마이그레이션·빈 목록 200 | **PASS** | §2.1 |
| 2 | empty state(등록 유도) · 사이드 메뉴 존재 · 설정 메뉴 부재 | **PASS** | §2.2 |
| 3 | 계정 등록 · 키 마스킹 · `enc:v1` 암호화 저장 | **PASS** | §2.3 |
| 4 | 연결 테스트 실패 UX(무음 실패 아님) | **PASS** | §2.4 |
| 5 | 사용량 화면 KPI/차트/표 값 일치 | **PASS** (결함 D-1·D-3 동반) | §2.5 |
| 6 | 알람 카드 = `GET /ai-monitor/alerts` | **PASS** | §2.6 |
| 7 | 수정 시맨틱(시크릿 비우면 유지 · 예산 반영) | **PASS** | §2.7 |
| 8 | 홈 위젯 추가·렌더 · 비관리자 미노출 | **PASS** (결함 D-2 동반) | §2.8 |
| 9 | 권한 차단 (a) 메뉴 (b) 직접 진입 (c) API 403 | **PASS** | §2.9 |
| 10 | 계정 삭제 + `ai_mon_usage`/`ai_mon_inventory` CASCADE | **PASS** | §2.10 |
| 11 | 설정>스케줄러에 2종 노출 | **PARTIAL** | §2.11 |
| + | 에러 코드 6종 · periodKey 3종 · 예산 미설정 시 5필드 생략 | **PASS** | §3 |

**결함 6건** — MEDIUM 3 · LOW 3. **HIGH 0.** 상세는 §4.

---

## 2. 시나리오별 상세

### 2.1 기동·마이그레이션 — PASS

기동 전 :3000에 **V30 이전 빌드의 BE가 떠 있었다**(`flyway_schema_history` 최신 = V29).
그대로 검증했다면 "엔드포인트 404"로 오진할 상태였으므로 **종료 후 재빌드·재기동**했다.

```
V30 | V30__ai_monitor.sql | success=t          ← 기동 로그·DB 양쪽 확인
테이블 3종 생성: ai_mon_account / ai_mon_usage / ai_mon_inventory
scheduler_setting 시드 2건: ai_monitor_usage_poll(interval 60m, {"lookbackHours":48})
                            ai_monitor_cost_poll(daily 04:30, {"costLookbackDays":3})
기동 로그: Scheduler 'ai_monitor_usage_poll' registered (every 60m)
          Scheduler 'ai_monitor_cost_poll'  registered (daily 0 30 4 * * *)
```

관리자 세션으로 4개 조회 EP 전부 200:

| EP | 응답 |
|---|---|
| `GET /ai-monitor/accounts` | `data: []` |
| `GET /ai-monitor/usage?period=month` | 합계 0, `byModel`/`byWorkspace`/`byApiKey`/`daily` 전부 `[]` |
| `GET /ai-monitor/usage/compact` | `accounts:0`, **예산 5필드 키 생략** |
| `GET /ai-monitor/alerts` | `data: []` |

🔴 계약 §2.1의 핵심 규약 2개를 런타임에서 확인: 계정 미선택 시 `accountId`/`accountName` **키 생략**,
비용 폴링 전이면 `asOf` **키 생략**(`null` 아님). FE의 `!usage.asOf` 판정이 실제로 맞는 가지를 탄다.

### 2.2 empty state — PASS

`/monitoring/ai-usage` 진입(계정 0건). **$0 KPI 대신 등록 유도 화면**만 렌더:

```
DOM 어서션: .ant-statistic 개수 = 0, .ant-tabs-tab 개수 = 0
본문: "등록된 AI 계정이 없습니다 | 아래에서 AI 계정을 등록하면 다음 수집부터 …"
    + "폴링에는 인터넷 아웃바운드가 필요합니다 | … 폐쇄망이면 폴링이 동작하지 않습니다"
    + [등록된 계정] 표 + [계정 추가] 버튼 2개
```

설계 §8의 의도("$0 대시보드가 'AI를 안 쓰는 조직'처럼 보이는 것을 막는다")가 **화면에서 성립**한다.
폐쇄망 안내가 첫 화면에 있는 것도 계약 §5-C-7 요구를 충족.

**메뉴**: 사이드바 `모니터링` 서브메뉴에 `<a href="/monitoring/ai-usage">AI 사용 현황</a>` 존재(관리자 세션).
**설정 메뉴**: `SETTINGS_ENTRIES`에 AI 모니터링 항목 없음 — 코드에 "다시 추가하지 말 것" 주석까지 있음.
고아 화면 없음(도달 경로 확보) ✅

### 2.3 계정 등록 — PASS

계정 관리 탭 → [계정 추가] → Anthropic / 이름 `QA 테스트 조직` / 가짜 Admin 키 / 월 예산 100 → 저장.

| 확인 | 결과 |
|---|---|
| 목록 표시 | `QA 테스트 조직 / Anthropic · ••••igAA / 수집 대기 / 아직 수집된 적 없음 / $100.00` |
| 마스킹 | `credentialMasked: "••••igAA"` — 키 뒤 4자리만. **원문·암호문 모두 응답에 없음** |
| `state` | `PENDING`(=`lastOkAt` null) → 화면 "수집 대기" |
| **DB 암호화** | `credential` = `enc:v1:oTXlF/H8z…`(115자) |
| **평문 유출** | `select count(*) … where credential like '%sk-ant%' or like '%QATEST%'` → **0** |

### 2.4 연결 테스트 — PASS (아웃바운드 열려 있어 **실호출로 검증**)

이 환경은 폐쇄망이 아니었다 — `api.anthropic.com` / `api.openai.com` 양쪽에 실제로 나갔고
**프로바이더가 낸 진짜 401**이 돌아왔다.

```
Anthropic: {"ok":false,"provider":"ANTHROPIC","detail":null,
            "reason":"HTTP 401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",
                      \"message\":\"API key is invalid.\"},\"request_id\":null}"}
OpenAI:    {"ok":false,"provider":"OPENAI","detail":null,
            "reason":"HTTP 401 {\"error\":{\"message\":\"Incorrect API key provided: sk-admin*****zzzz. …\",
                      \"type\":\"invalid_request_error\",\"code\":\"invalid_api_key\"}}"}
```

- HTTP **200 + `status:"success"` + `ok:false`** — 계약 §1.6대로. 실패를 서버 오류로 만들지 않았다.
- 화면에 원인이 **프로바이더 원문 그대로** 표시된다(무음 실패 아님) ✅
- BE 로그는 `WARN … AI provider call failed: GET /v1/organizations/workspaces -> HTTP 401` — ERROR 아님(적절).
- 계약 §1.6 단서 확인: 연결 테스트 후에도 `fail_count=0`, `last_error=NULL`, `last_ok_at=NULL` — **수집 건강 상태를 건드리지 않는다** ✅

> ℹ️ **계약 §5-B 부분 해소.** 401이 왔다는 것은 URL 경로·`anthropic-version`/인증 헤더 형태가
> 프로바이더에 **받아들여졌다**는 뜻이다(경로가 틀렸으면 404, 헤더가 없으면 다른 코드).
> 즉 **인증·에러 경로는 실측 완료**. 여전히 미검증인 것은 **성공 응답 파싱(필드명·페이지네이션)**뿐이다.

### 2.5 사용량 화면(데이터 있음) — PASS

dev DB에 테스트 행 6건 직접 INSERT(설계대로 토큰=1h/`priced=false`, 비용=1d/`priced=true`),
모델 2종 · 2일치 · 예산 100 대비 **초과** 상태.

| 항목 | 삽입값 | API `data` | 화면(DOM) |
|---|---|---|---|
| costUsd | $80.00 + $45.50 | `125.5` | `$125.50/ $100.00` |
| inputTokens | 1,000K+200K+500K+100K | `1800000` | `1.8M` |
| outputTokens | 180,000 | `180000` | `180K` |
| cacheRead / cacheWrite | 75,000 / 15,000 | `75000` / `15000` | `75K` / `15K` |
| calls | 0 | `0` | `0` |
| unpricedRows | 1h 행 4건 | `4` | 배지 `단가 미산정 4건` |
| budget/percent/remaining | 100 | `100.0` / `125.5` / `-25.5` | 게이지 `125.5%` **빨강**(`rgb(207,19,34)`) + `예산 초과` 태그 |

- `byModel` **비용 내림차순**(sonnet $80 → haiku $45.50), `byApiKey` 동일, `daily` **날짜 오름차순** — 계약 §2.1 정렬 규약 일치.
- 각 슬라이스의 차원 필드만 채워지고 나머지는 JSON에서 생략됨(`AiMonUsageSliceDto` 규약) ✅
- 상시 안내 노출: `이 숫자는 청구서가 아니라 추정치입니다 … · 비용 반영 시각 … · 2026-08-01 ~ 2026-08-25`
- 비용 폴링 전 상태에서는 같은 자리에 `비용이 아직 집계되지 않았습니다 — $0을 '안 썼다'로 읽지 마세요`가 떴다 → **`asOf` 두 가지 가지 모두 실측** ✅

**일별 차트**: ECharts 캔버스 1422×256 생성, 축이 데이터와 일치(비용축 $0~$80, 토큰축 0~1.5M, 카테고리 `2026-08-23`/`2026-08-24`, 범례 `비용`/`토큰(입력+출력)`), 캔버스 페인트 픽셀 2.79%.
⚠️ 시각적으로는 막대가 납작하게 보이는데 **MCP 탭 rAF 정지(애니메이션 중단)**다 — 렌더 버그 아님([[chrome-mcp-hidden-tab-no-raf]]).

→ 결함 **D-1**(asOf 시각 9시간 어긋남) · **D-3**(unpricedRows 상시 >0) 참조.

### 2.6 알람 카드 — PASS

예산 초과 데이터에서 `GET /ai-monitor/alerts`와 화면 알람 카드가 **문자열까지 일치**:

```
BUDGET_OVER  critical  "이번 달 예산 100.00 USD를 넘었습니다 — 125.50 USD (125.5%)"  value 125.5
USAGE_SPIKE  warning   "2026-08-24 토큰 사용량이 직전 7일 평균의 3.5배입니다 (660,000 → 평균 188,571)"  value 3.5
```

- `usage/compact.alerts`도 동일 배열 ✅
- **예산을 200으로 올리자 `BUDGET_OVER`가 즉시 사라지고 `USAGE_SPIKE`만 남았다** → 알람이 "지금 참인 조건"이라는 계약 §2.3 성격 확인.
- 화면에 `이 목록은 '발송된 알림'이 아니라 지금 참인 조건입니다…` 문구 노출 — 계약 §5-A / R-2 요구 충족 ✅

### 2.7 수정 시맨틱 — PASS (계약 §1.4 3항목 전부)

수정 모달 프리필: 이름 채움 · **시크릿 빈칸** · **예산 100 프리필** · **프로바이더 disabled**
(안내: "등록 후에는 바꿀 수 없습니다. 이미 쌓인 사용량의 의미가 달라지기 때문입니다").

시크릿을 비운 채 이름+예산만 바꿔 저장:

```
before  md5(credential) = b47ec8837fd04e2d695b05378edb3de8
after   md5(credential) = b47ec8837fd04e2d695b05378edb3de8   ← 바이트 동일, 키 유지 ✅
        name = 'QA 테스트 조직 (이름만 수정)'  monthly_budget_usd = 200.00 → 100.00
```

🔴 **"PUT 전체 교체라 예산이 지워진다"는 지뢰가 실제로 밟히지 않는다** — 모달이 현재 예산을 항상
프리필해 다시 실어 보내기 때문. 계약 §1.4-3의 대응이 런타임에서 작동함을 확인.

### 2.8 홈 위젯 — PASS (결함 D-2 동반)

- 카탈로그 `AI` 구역에 **`AI 계정 비용` [관리자]** 노출. 설명이 `AI 사용량`(어시스턴트 자체)과의 혼동을 막는다.
- 추가 시 **`WIDGET_TYPE_INVALID` 없이 정상 저장**(`home_widget` id=77, `widget_type='ai_monitor_cost'`) → 계약 R-1(BE enum 추가)의 런타임 확인 ✅
- compact 값 렌더: `$125.50/ $100.00` · `추정치` · `예산 초과`(빨강 태그) · `125.5%` · `계정 1개 · 2026-08` · 알람 요약 `… 외 1건`
- **비관리자(chanho/USER) 홈에는 이 위젯이 아예 렌더되지 않는다** ✅ (`AI 알림 분석`·`최근 리포트`·`배치·동기화 상태` 등 다른 adminOnly 위젯과 함께 사라짐)

→ 게이지 색상 결함 **D-2** 참조.

### 2.9 권한 차단 — PASS

비관리자 확보: dev DB `chanho`(id=114, `role=USER`, platform DMOVE)의 비밀번호를 임시로 바꿔 로그인
(검증 후 **원래 해시로 복구 완료** — §6).

| | 기대 | 실제 |
|---|---|---|
| **(a) 사이드 메뉴** | 항목 미노출 | `모니터링` 서브메뉴를 **펼친 상태**에서 링크 6개 중 `/monitoring/ai-usage` **없음**(관리자 세션에선 있음) ✅ |
| **(b) 직접 진입** | "$0 대시보드"가 아니어야 함 | `/monitoring/ai-usage` → **`/errors/404`로 리다이렉트**. `.ant-statistic` 0개 ✅ |
| **(c) API** | 200 + `code:403` | `accounts`·`usage`·`compact`·`alerts`·`POST accounts` **전부** `{"status":"error","code":403,"message":"Access Denied"}`, `errorCode` 필드 없음 ✅ |

> ⚠️ (b)는 지시서의 "**에러 배너**"가 아니라 **404 리다이렉트**다. `PageWrapper`의 `userRoleAdminOnly`
> 가드가 이 앱의 다른 관리자 전용 라우트와 **동일한 관례**로 처리한 결과다(`routes.tsx:262`).
> **핵심 실패 모드("$0 대시보드로 보임")는 발생하지 않으므로 PASS로 판정**했다.
> 부수 확인: 클라이언트 상태(redux `userRole`)를 `ADMIN`으로 조작해도 `useAuth()`가 서버 값으로
> 덮어써 **가드를 속일 수 없었다** — `AiUsagePage`의 403 배너 경로는 라우트 가드가 먼저 막아 사실상
> 도달 불가(방어적 코드로 남아 있는 것은 무해).

### 2.10 삭제 + CASCADE — PASS

```
before  acc=1  usage=6  inv=2
DELETE /ai-monitor/accounts/1  → {"status":"success","code":200}
after   acc=0  usage=0  inv=0        ← 사용량·인벤토리 전량 CASCADE 삭제 ✅
목록/사용량/알람 EP 모두 빈 상태로 복귀
```

### 2.11 스케줄러 화면 — **PARTIAL**

**검증됨**
- `GET /settings/schedulers`가 두 job을 시드값 그대로 반환:
  `ai_monitor_cost_poll`(daily 04:30, `{"costLookbackDays":3}`, nextRunAt 2026-08-26T04:30) ·
  `ai_monitor_usage_poll`(interval 60m, `{"lookbackHours":48}`)
- FE 라벨 매핑 존재: `constants/scheduler.ts`의 `ai_monitor_*` 항목 + `kr.json`/`en.json`
  (`AI 사용량 수집` / `AI 비용·인벤토리 수집` + 각 설명)
- **수동 실행 2종 성공**: `POST /settings/schedulers/{job}/run` → 로그
  `Scheduler 'ai_monitor_usage_poll' done in 3ms (skipped (등록된 계정 없음))` — 계약 §4의
  "계정이 없으면 skipped" 경로 실측 ✅ (예외·스택트레이스 없음)

**미검증**: 스케줄러 **화면의 실제 렌더**(행·라벨 표시). 브라우저 로그인이 막혀(§5-1) 확인하지 못했다.
데이터·라벨 키가 모두 있으므로 렌더 실패 가능성은 낮지만 **눈으로 본 것은 아니다.**

---

## 3. 계약 규약 스팟체크 (전부 PASS)

**에러 코드 6종** — 전부 HTTP 200 + body `code:400` + `errorCode`:

| 요청 | `errorCode` |
|---|---|
| `credential` 누락 등록 | `AI_MONITOR_CREDENTIAL_REQUIRED` |
| `provider:"CLAUDE_CODE"` | `AI_MONITOR_PROVIDER_UNSUPPORTED` |
| `monthlyBudgetUsd:-5` | `AI_MONITOR_INVALID_BUDGET` |
| `name:"   "` | `AI_MONITOR_NAME_REQUIRED` |
| `GET /accounts/999` | `AI_MONITOR_ACCOUNT_NOT_FOUND` |
| `?period=year` | `AI_MONITOR_INVALID_PERIOD` (조용한 폴백 없음 ✅) |

**periodKey** — `day → 2026-08-25` · `week → 2026-W35`(**제로패딩, QA L-1 수정 실측 확인**) · `month → 2026-08`.
`week` 구간은 `2026-08-19 ~ 2026-08-25` = **최근 7일**(이번 주 아님) ✅

**예산 미설정 계정만 있을 때** (계약 §2.2의 명시적 지뢰):
```
compact: {"accounts":1,"costUsd":0.0,"calls":0,"alerts":[]}   ← 예산 5필드 전부 키 생략
usage  : budget 관련 키 present = []                           ← 0을 내려보내지 않음 ✅
```
→ 화면이 "예산 0원 초과"로 그릴 위험 없음.

**`@JsonInclude(NON_NULL)` 분기(§0.1)가 런타임에서 정확히 표대로 갈렸다:**
- `AiMonAccountDto` → `"lastOkAt":null,"lastError":null,"monthlyBudgetUsd":null` (**null 그대로**)
- `AiMonConnectionTestDto` → `"detail":null` (**null 그대로**)
- `AiMonInventoryDto` → MEMBER 항목에 `lastUsedAt`·`unusedDays` **키 자체가 없음**
- `AiMonUsageDto` → `asOf`·예산 5필드 **키 생략**

**인벤토리 파생 판정** — 사용량 행에서 `lastUsedSource`가 실제로 파생되는지 확인:
```json
{"accountId":1,"syncedAt":"…","usageSince":"2026-08-23T00:00:00","items":[
  {"itemType":"API_KEY","externalId":"apikey_QA1","displayName":"prod-key","status":"active",
   "lastUsedAt":"2026-08-24T09:00:00","lastUsedSource":"DERIVED","unusedDays":1},
  {"itemType":"MEMBER","externalId":"user_QA","displayName":"QA Tester","status":"admin",
   "lastUsedSource":"NONE"}]}
```
`lastUsedAt`이 내가 넣은 마지막 1h 버킷과 정확히 일치 → DERIVED 파생 로직 정상. `usageSince`도 min(bucket_start) 일치.

---

## 4. 결함

### 🟠 D-1 (MEDIUM · **BE**) — `asOf`·`syncedAt`이 DB 시각이라 앱 시각과 어긋난다

**증상.** 화면 안내가 `비용 반영 시각 2026-08-25 02:58`로 표시된다. 실제 적재 시각은 **11:58 KST**.
**9시간 과거**로 보인다.

**원인.** `AiMonUsageRepository.upsert`(그리고 `ai_mon_inventory.synced_at` 기본값)가
**`NOW()` — 즉 DB 세션 타임존**으로 `timestamp without time zone`에 쓴다. 반면 같은 기능의
`ai_mon_account.created_at`은 **앱(JPA)이 KST로** 넣는다. 두 값이 같은 응답에서 naive `LocalDateTime`으로
직렬화되므로, **DB TZ ≠ 앱 TZ이면 조용히 어긋난다.**

```
ai_mon_account.created_at : 2026-08-25 11:55:17   (앱, KST)
ai_mon_usage.updated_at   : 2026-08-25 02:58:03   (DB NOW(), UTC)
docker exec … psql -c "show timezone" → Etc/UTC     /  로컬 date → 11:58 KST
```

**영향.** `asOf`는 설계가 **"이 숫자가 얼마나 최신인가"의 유일한 신호**로 삼은 값이다(§2.1·§5-C).
9시간 과거로 보이면 방금 수집한 비용이 "어제 새벽 값"으로 읽힌다. `GET …/inventory`의 `syncedAt`도 같다.
dev/도커 기본 구성에서 **항상 재현**되고, Postgres를 UTC로 운영하는 설치본에서도 그대로 난다.

**출처.** `aimonitor/domain/AiMonUsageRepository.java`(upsert `updated_at = NOW()`) ·
`db/migration/V30__ai_monitor.sql`(`synced_at … default now()`)
**제안.** 시각을 앱에서 만들어 파라미터로 넘기거나(다른 테이블과 동일한 축), `NOW()` 대신
`timestamptz`/명시 변환을 쓴다. **한 기능 안에서 시계가 둘이면 어느 쪽이든 언젠가 틀린다.**

---

### 🟠 D-2 (MEDIUM · **FE**) — 홈 위젯의 예산 게이지가 **초과 상태인데 초록색**

**증상.** 홈 "AI 계정 비용" 위젯에서 예산 125.5% 초과인데 진행 막대가 **antd 성공 초록**으로 100% 꽉 찬다.
같은 데이터로 사용량 페이지 KPI는 **빨강**이다.

```
홈 위젯   .ant-progress-bg  background = rgb(82, 196, 26)    ← 초록(성공색)
페이지 KPI .ant-progress-bg  background = rgb(207, 19, 34)   ← 빨강
```

**원인.** `pages/home/widgets/ai/AiMonitorCostWidget.tsx:70-73`의 `<Progress>`에 **`strokeColor`가 없다.**
`percent={Math.min(percent,100)}` → 100이 되면 antd가 `status="success"`를 적용해 초록으로 칠한다.
사용량 페이지(`AiUsageKpiRow.tsx:66-70`)는 `strokeColor={barColor(percent)}`를 넘겨 정상.

**영향.** **홈은 사람들이 읽지 않고 훑는 화면**이다. 꽉 찬 초록 막대는 보편적으로 "완료/정상" 신호라
설계가 피하려던 거짓 안심을 정확히 만든다. 옆의 빨간 `예산 초과` 태그가 유일한 반증이다.
경고 구간(80~99%)도 같은 이유로 주황이 아니라 **기본 파랑**으로 나온다.

**제안.** `AiUsageKpiRow`의 `barColor`를 공유해 `strokeColor`를 넘긴다(1줄). 두 곳이 같은 함수를 쓰면
색 규칙이 갈리지 않는다.

---

### 🟠 D-3 (MEDIUM · **BE**) — `unpricedRows`가 **구조적으로 항상 >0**이라 배지가 거짓말을 한다

**증상.** 이틀치 비용을 **빠짐없이** 넣은 상태인데도 `unpricedRows: 4`가 나오고, 화면에
`단가 미산정 4건` 배지가 뜬다. 계약 §2.1은 이 값이 `>0`이면 **"총액이 실제보다 적다"**는 뜻이라고
정의했는데, 이 경우 총액은 정확하다.

**원인.** 설계상 **토큰은 1h 버킷(`priced=false`)·비용은 1d 버킷(`priced=true`)에 따로 쌓인다**
(`AiMonUsageRepository` 주석). 두 행의 자연키가 달라 1h 행은 **영원히 `priced=false`로 남는다.**
집계는 `SUM(CASE WHEN priced THEN 0 ELSE 1 END)` — 즉 **범위 안의 모든 1h 행 수**를 센다.

**영향.** 실제 운영에서 한 달치는 (시간 × 모델 × 워크스페이스 × 키) 조합이라 수백~수천 행이다.
배지는 `단가 미산정 1,247건`처럼 **항상 켜져 있고 값도 계속 커진다** → 정작 비용 폴링이 진짜로
밀렸을 때 구분이 안 된다. 경고가 상시 켜지면 경고가 아니다.

**출처.** `AiMonUsageRepository.totals` / `upsert`(`priced = ai_mon_usage.priced OR EXCLUDED.priced`)
**제안.** "비용이 안 붙은 **행 수**"가 아니라 "비용을 아직 못 가져온 **날 수**"로 재정의한다
(1d 비용 행이 없는 `day`의 개수). 지금 값은 사용자가 물은 질문("얼마나 빠졌나")에 대한 답이 아니다.

---

### 🟡 D-4 (LOW · **BE/계약**) — `warn`과 `over`가 동시에 `true`

`percent=125.5`에서 `"warn":true,"over":true`가 함께 나간다(예산 200으로 올리면 둘 다 false).
계약 §2.1 정의(`warn` = 80% 이상 ≥)에 문자 그대로는 맞고, §2.3의 "동시에 나오지 않는다"는
**alerts 코드** 얘기라 위반은 아니다. FE가 `over ? … : warn ? …` 우선순위로 처리해 **화면 영향 없음**.
다만 같은 어휘가 알람에서는 배타, DTO에서는 포함이라 다음 소비자가 헷갈릴 여지가 있다 —
계약서에 한 줄 명시하거나 `warn`을 배타로 맞추는 편이 낫다.

### 🟡 D-5 (LOW · **BE**) — `percent` 반올림이 경계값에서 내려간다

`125.5 / 200 = 62.75%` → 응답 `62.7`. 계약 §2.1은 "소수 1자리 **반올림**"이라 `62.8`이 기대값이다.
double 연산(`62.74999…`)의 절사로 보인다. 표시상 0.1 차이라 실사용 영향은 미미하나, 계약 문구와 다르다.

### 🟡 D-6 (LOW · **FE**) — 메뉴 라벨과 화면 제목이 다르다

사이드 메뉴 `AI 사용 현황` ↔ 화면 제목·브레드크럼 `AI 사용량`.
같은 화면을 두 이름으로 부르면 도움말·검색·문의에서 어긋난다. 하나로 통일 권장.

---

## 5. 결함이 아닌 것 (재조사 방지)

1. **브라우저 로그인이 중간부터 먹통** — `/sign-in` 제출이 네트워크 요청조차 내지 않았다.
   원인은 `SignIn.tsx:58` `await FingerprintJS.load()`다. **MCP 탭은 `visibilityState=hidden`**이라
   내부의 idle 콜백이 안 돌아 여기서 멈춘다([[chrome-mcp-hidden-tab-no-raf]] 계열).
   포그라운드 브라우저에서는 정상이므로 **제품 결함으로 보고하지 않는다.**
   ⚠️ 다만 관찰 사실 하나는 남긴다 — **fp가 지연/실패하면 로그인 버튼이 아무 반응 없이 멈추고
   타임아웃도 안내도 없다.** 광고 차단기·프라이버시 확장에서도 같은 증상이 가능하다.
   이 기능 범위 밖의 선재 이슈이며, 필요하면 별도 과제로 다룰 것.
2. **일별 차트가 납작하게 보임** — 같은 rAF 정지. 캔버스·축·범례는 정상이고 픽셀도 그려져 있다.
3. **antd 토스트가 안 사라짐** — 같은 원인(타이머/애니메이션 정지). 제품 동작 아님.
4. **`ant-progress-status-success` 클래스가 페이지 KPI에도 붙음** — `strokeColor`가 이기므로 실제 색은 빨강.
   D-2는 클래스가 아니라 **`strokeColor` 부재**가 원인이다.
5. **BE 콘솔 로그의 한글 깨짐** — 내가 PowerShell로 리디렉션해 캡처한 부작용. 서버는 UTF-8로 뜬다.
6. **`GlobalExceptionHandler`가 검증 오류를 ERROR 레벨로 남김** — 전역 선재 관례. 이 기능 몫 아님.

---

## 6. 정리(원상복구) — 완료

| 항목 | 상태 |
|---|---|
| `ai_mon_account` / `ai_mon_usage` / `ai_mon_inventory` | **0행** (테스트 계정 2개·사용량 6행·인벤토리 2행 전량 삭제) |
| `home_widget` id=77 (`ai_monitor_cost`) | **삭제** |
| `user`(id=114 chanho) 비밀번호 해시 | **원래 값으로 복구** (`$2b$10$KjYVtlxq…`) |
| `scheduler_setting` AI job 2건 | **존치**(V30 시드 — 정상 상태) |
| BE :3000 · FE :5173 | **종료**, 포트 해제 확인 |
| Chrome MCP 탭 | **전부 닫음** |

> Gradle 데몬 java 프로세스는 남겨 두었다(`gradlew --stop` 금지 규약).

---

## 7. 남은 검증 공백

| 항목 | 왜 못 했나 |
|---|---|
| 설정>스케줄러 **화면 렌더** | 브라우저 로그인 막힘(§5-1). API·라벨 키는 확인 |
| 인벤토리 탭 **데이터 있는 상태의 화면** | 동상. API 응답은 계약과 일치 확인 |
| 프로바이더 **성공 응답 파싱** | 실 Admin 키 없음 — 계약 §5-B 그대로 남음. **인증·에러 경로는 §2.4에서 실측 해소** |
| 폴링 배치의 **실제 적재** | 유효 키가 없어 "계정 없음 skip"까지만 |
| 라이선스 만료 시 배치 중단(`requiresActiveLicense`) | dev 라이선스가 ACTIVE |

---

## 8. 재현 방법

```bash
# BE (JAVA_HOME 명시 필수 — 전역은 corretto 1.8)
#   .env를 같은 셸에 export한 뒤 SPRING_PROFILES_ACTIVE=dev PORT=3000 으로 gradlew bootRun
# FE
#   cd C:\solutions\moveseyee_fe && npm run dev -- --host 0.0.0.0     # :5173

# 로그인 + 호출 (access token 수명이 짧아 매 호출 전에 재로그인)
curl -s -c c.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" -H "x-visitor-id: qa-e2e" \
  -d '{"username":"admin","password":"qwe123"}' -o /dev/null
curl -s -b c.txt -H "x-visitor-id: qa-e2e" "http://localhost:3000/ai-monitor/usage?period=month"

# 테스트 데이터 (한글 인라인 금지 — UTF-8 파일로 --data-binary 또는 psql -f)
docker cp seed_usage.sql dmove-postgres-test:/tmp/ && \
  docker exec dmove-postgres-test psql -U postgres -d dmove -f /tmp/seed_usage.sql

# D-1 재현
docker exec dmove-postgres-test psql -U postgres -d dmove \
  -c "select created_at from ai_mon_account; select max(updated_at) from ai_mon_usage; show timezone;"
# D-2 재현: 홈 위젯 추가 후 브라우저 콘솔에서
#   getComputedStyle(document.querySelector('.ant-progress-bg')).background
```

---
---

# M2 검증 — 수신형(Claude Code OTel) + 구독 플랜 활용도

- 실행: 2026-08-25 · functional-qa 2라운드 · 기준 문서: `features/ai/ai-account-monitoring/contract_ai-account-monitoring.md`의 **`# M2`** 섹션
- 기동: BE `bootRun` dev(JDK17, :3000, 재빌드) / FE :5173(선재 인스턴스) / Chrome MCP
- 🔴 **이번 라운드의 성과**: 계약 `M2 잔여 이슈 #1`(OTLP 실 페이로드 미실측)을 **이 머신의 실제
  Claude Code로 실측 해소**했다. temporality·`user.email` 위치·`type` 철자 세 가지 모두 확정(§M-2).
- 사용자가 등록해 둔 기존 계정(id=3 `클로드 api key`)은 **손대지 않고 원복 확인**(§M-7).

> **한 줄 요약** — M2의 설계 의도는 **거의 전부 런타임에서 성립**했다. 특히 "가장 잘 쓴 개발자가
> 빨개지는 뒤집힌 화면"은 확실히 막혀 있다(137.5% → **초록 "본전"**). 그러나 **홈 위젯이 구독
> 사용액을 폴링 예산으로 나눠 "예산 6100% 초과"라는 빨간 거짓 경고**를 띄운다 — M2-10이 막으려던
> 바로 그 실패가 분모만 고치고 분자를 놓쳐서 되살아났다.

---

## M-1. 총괄표

| # | 시나리오 | 판정 | 근거 |
|---|---|---|---|
| 1 | 기동 · V31 · V33 적용 | **PASS** | §M-3 |
| 2 | 수신 계정 등록 · consent 게이트 · 토큰 해시 저장 | **PASS** | §M-4 |
| 3 | **OTLP 실측**(실제 Claude Code → BE) | **PASS** | §M-2 |
| 4 | 수신 보안(401/중복경로/415/재발급) | **FAIL 1건** | §M-5 |
| 5 | 재발급 UI — 동의 체크 전 차단 | **PASS** | §M-6 |
| 6 | byUser 활동 3열 · 플랜/활용도 열 · **색·라벨** | **PASS** | §M-6 |
| 7 | 사용자별 플랜(기본/예외/제거/검증) | **PASS** | §M-6 |
| 8 | 수신 계정 예산 제외 | **부분 FAIL** | §M-5 |
| 9 | 무수신 알람 2종 | **PASS** | §M-5 |
| 10 | 홈 위젯 compact가 폴링 계정만 합산 | **FAIL** | §M-5 |
| 11 | 정리 · 기존 계정 보존 | **완료** | §M-7 |

**결함 4건** — HIGH 1 · MEDIUM 1 · LOW 2. (라운드 1 결함 중 **D-1·D-2·D-3 해소 확인** — §M-8)

---

## M-2. 🔴 OTLP 실측 기록 (계약 잔여 이슈 #1 해소)

**방법.** scratchpad 작업 폴더에서 그 프로세스에만 환경변수를 걸고 실제 `claude -p "1+1은?"`를 실행.
페이로드 원문을 보려고 캡처 프록시(:3999)를 한 겹 두고 **그대로 :3000 BE로 전달**했다.

```
CLAUDE_CODE_ENABLE_TELEMETRY=1  OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/json  OTEL_METRIC_EXPORT_INTERVAL=10000
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3999/ai-monitor/otlp
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <발급 토큰>"
→ Claude Code 2.1.241 / 요청 경로 POST /ai-monitor/otlp/v1/metrics
→ Content-Type: application/json · 7,075 bytes · BE 응답 200 {}
```

### 확인해야 했던 세 가지 — 전부 확정

| 계약 질문 | **실측 결과** |
|---|---|
| (a) `user.email`이 resource 속성인가 데이터포인트 속성인가 | 🔴 **데이터포인트 속성이다.** resource에는 없다 |
| (b) temporality가 숫자인가 문자열인가, delta인가 cumulative인가 | 🔴 **숫자 `1` = DELTA.** 문자열 아님. `isMonotonic: true` |
| (c) `type` 값 철자 | 🔴 **`input` · `output` · `cacheRead` · `cacheCreation`** — 계약 추정과 **정확히 일치** |

```
resource attributes : host.arch, os.type, os.version, service.name(claude-code), service.version(2.1.241)
dataPoint attributes: user.id, user.email, user.account_id, user.account_uuid, organization.id,
                      session.id, terminal.type, model, query_source, effort, type, start_type
scope               : com.anthropic.claude_code 2.1.241
메트릭 4종          : claude_code.session.count / .cost.usage(USD, double)
                      / .token.usage(tokens) / .active_time.total(s, double)
```

- ℹ️ `claude_code.lines_of_code.count`는 **이번 실행에 코드 편집이 없어 나오지 않았다**(미출현 ≠ 부재).
- ℹ️ `commit.count`·`pull_request.count`도 미출현. 계약의 "받아도 버린다"는 확인 못 함.

### 적재 결과 — 페이로드와 정확히 일치

| 항목 | 페이로드 | `ai_mon_usage` |
|---|---|---|
| input / output | 2 / 12 | 2 / 12 ✅ |
| cacheRead / cacheCreation | 29,895 / 11,888 | `cache_read_tokens` 29,895 / `cache_write_tokens` 11,888 ✅ |
| cost | 0.053654999… USD | `cost_micro_usd` 53,655 ✅(반올림) |
| sessions | 1 | 1 ✅ (모델 속성이 없어 `model=''` 행에 분리 적재) |
| active_time | **2.322 s** | `active_time_seconds` **2** ⚠️(소수부 버림 — M2-L1) |
| user | `user.email` | `user_key = dmv.dev.claude@gmail.com` ✅ |
| `ai_mon_otel_cursor` | — | **0행** ✅ delta라 커서 불필요 — 코드 경로가 맞게 갈렸다 |

### 🔴 파생 확정 1 — 잔여 이슈 #2(delta 재전송 중복)는 **가설이 아니라 실재**다

temporality가 DELTA로 확정됐으므로 `M2-9`의 "누적이면 커서가 막아 준다"는 안전망이 **작동하지
않는다**. 실제로 같은 페이로드를 3회 POST하니 **정확히 3배로 누적**됐다:

```
1회분: input 2   output 12   cacheRead 29,895   cost 53,655   sessions 1   active 2
3회후: input 6   output 36   cacheRead 89,685   cost 160,965  sessions 3   active 6
```

→ 계약이 "실측 후 재전송 빈도가 문제가 되면 그때 dedup 키를 넣는다"고 유예한 항목인데, **판단에
필요한 실측이 이제 나왔다**: OTLP는 at-least-once이고 우리 경로는 방어 수단이 없다. 재전송은
네트워크 단절·5xx 재시도에서 정상적으로 발생하므로 **결정을 미룰 근거가 하나 줄었다.**

### ℹ️ 파생 확정 2 — 버킷은 UTC다

15:49 KST 수신분이 `bucket_start 2026-08-25 06:00`(UTC)에 들어갔다. 계약 §0("버킷·집계 내부는
UTC")대로지만, **M2는 사람별 일일 활동을 보는 화면**이라 한국 사용자의 오전 8시대 작업이 전날로
분류된다. 결함으로 올리지 않되(계약 명시), 화면 문구에서 한 번은 짚어야 할 사실이다.

---

## M-3. 기동·마이그레이션 — PASS

```
V30 → V31__ai_monitor_otel.sql → V32 → V33__ai_monitor_user_plan.sql   전부 success
신규 테이블: ai_mon_otel_cursor · ai_mon_user_plan
ai_mon_usage 신규 4열: sessions · active_time_seconds · lines_added · lines_removed
ai_mon_account 신규: kind · default_plan_usd
```

⚠️ 기동 전 :3000에 **V33 이전 BE**가 떠 있었다(flyway 최신 V32). 라운드 1과 같은 스테일 함정이라
종료 후 재빌드·재기동했다.

---

## M-4. 수신 계정 등록 — PASS

| 검증 | 결과 |
|---|---|
| `consentAcknowledged` 누락 | `AI_MONITOR_CONSENT_REQUIRED` ✅ |
| `consentAcknowledged: false` | `AI_MONITOR_CONSENT_REQUIRED` ✅ |
| `CLAUDE_CODE` + `POLL` | `AI_MONITOR_WRONG_ACCOUNT_KIND` ✅ |
| `ANTHROPIC` + `RECEIVE` | `AI_MONITOR_WRONG_ACCOUNT_KIND` ✅ |
| 등록 응답 | `issuedToken` + `endpoint`(`…/ai-monitor/otlp`, `/v1/metrics` 없음) + `hasCredential:true` + `credentialMasked:null` + `defaultPlanUsd` ✅ |
| **재조회 시 `issuedToken`** | **`null`** — 1회성 ✅ |
| 폴링 계정의 `endpoint` | `null` ✅ |
| **DB 저장 형태** | `rcv:v1:dc69b761…`(SHA-256 hex 64자) — **평문 0건 · `enc:` 0건** ✅ |

**UI**(계정 추가 모달): `RECEIVE` 선택 시 Provider·Admin API key·Monthly budget 입력이 **숨겨지고**
Default plan price가 나타난다. 수집 항목 고지문이 모달 안에 있고 **동의 체크 전 [Save]가 disabled**다
— 계약이 "상수로 박지 말고 체크박스에 묶어라"라고 못박은 지점이 그대로 지켜졌다 ✅

---

## M-5. 수신 경로·예산 — 결함 3건

### 검증 결과표

| 검증 | 기대 | 실제 |
|---|---|---|
| 토큰 없음 / 틀린 토큰 / `Bearer` 형식 아님 | 401 | **401 / 401 / 401** ✅ |
| 소문자 `bearer` | 200 | **200** ✅ |
| 중복 경로 한 겹 `…/v1/metrics/v1/metrics` | 200 + WARN | **200 + WARN 로그 확인** ✅ |
| 세 겹 | 404 | **404** ✅ |
| 깨진 JSON | 400 | **400** ✅ |
| **`Content-Type: application/x-protobuf`** | **415** | 🔴 **500** — **M2-D2** |
| 재발급 consent 없이 | `AI_MONITOR_CONSENT_REQUIRED` | ✅ |
| 폴링 계정에 재발급 | `AI_MONITOR_WRONG_ACCOUNT_KIND` | ✅ |
| 재발급 후 옛 토큰 / 새 토큰 | 401 / 200 | **401 / 200** ✅ |
| 수신 현황 `POST /test` | `kind`·`lastReceivedAt`·`receivingUsers` | `{ok:true, kind:"RECEIVE", detail:"users=1", receivingUsers:1}` ✅ |

**무수신 알람**(시나리오 9) — 데이터 조작으로 3케이스 전부 확인:
- 개별만 조용 → `RECEIVER_SILENT` warning, `value=1`(인원수), 예시 이름 포함 ✅
- 계정 전체 조용 → `RECEIVE_SILENT` critical, `value=15`(경과 일수) ✅ 이때 **`RECEIVER_SILENT`는 억제**됨 ✅
- `last_ok_at = NULL`(한 번도 수신 없음) → **`RECEIVE_SILENT` 미발생** ✅
- ℹ️ 사용자별 무수신 판정 기준은 `bucket_start`가 아니라 **`MAX(updated_at)`(적재 시각)**이다.
  "그 사람이 안 보내고 있다"에는 이쪽이 맞다.

**소스 필터**(계약 M2-6): `source=POLL` → 0.0 / `source=OTEL` → 305.0 / **알 수 없는 값은 거부하지
않고 전체로 접히며 `source` 키가 생략**된다 ✅

---

### 🔴 M2-D1 (HIGH · **BE**) — 홈 위젯이 "예산 6100% 초과"라는 거짓 경고를 띄운다

**증상.** 홈 대시보드 `AI 계정 비용` 위젯:

```
$305.00 / $5.00      [Estimated] [Over budget]      6100%      막대 100% 빨강(rgb(211,58,44))
2 accounts · 2026-08
```

- **$305.00은 전부 수신(구독) 사용액**이다 — 정액 구독이라 지출 상한 자체가 없다.
- **$5.00은 폴링 계정의 예산**이다.
- **실제 폴링 지출은 $0.00.** 예산을 1원도 쓰지 않았는데 6100% 초과로 빨갛다.

**원인.** `AiMonitorUsageService`가 **분모만 고치고 분자를 놓쳤다.**
`budgetOf()`는 `hasBudgetSemantics()`로 수신 계정을 정확히 제외하는데, 비율의 분자인
`costUsd`는 `summary(null, PERIOD_MONTH)` — **전 소스 합산**이다.

```java
// AiMonitorUsageService.compact()
AiMonUsageDto full = summary(null, PERIOD_MONTH);   // ← costUsd = POLL + OTEL 전부
… full.costUsd(), full.budgetUsd(), full.percent(), full.over()   // ← budget만 POLL 전용
```

**실측:**
```
GET /ai-monitor/usage/compact       → costUsd 305.0 / budgetUsd 5.0 / percent 6100.0 / over true
GET /ai-monitor/usage?period=month  → 동일(전 계정 합산 경로도 같은 결함)
GET /ai-monitor/usage?period=month&source=POLL → costUsd 0.0   ← 진짜 폴링 지출
```

**영향.**
1. 랜딩 화면이 상시 빨간 거짓 경고를 낸다 — M2-10이 "예산 로직 하나로 뭉개면 안 된다"며 막으려던
   실패가 **분자 쪽으로 되살아났다**.
2. `GET /ai-monitor/alerts`는 `BUDGET_OVER`를 내지 않는다(수신 계정 평가 제외가 정상 동작).
   그래서 **위젯은 빨갛고 바로 옆 알람 목록은 조용한 모순**이 생긴다 — 관리자가 어느 쪽을 믿어야
   할지 알 수 없다.
3. 수신 계정을 쓰는 조직일수록 심해진다(구독 사용액이 클수록 %가 커진다).

**제안.** 예산 비율의 분자도 **폴링 소스로 제한**한다(`source=POLL` 합계로 `percent`/`remainingUsd`/
`warn`/`over` 계산). `costUsd` 자체는 "조직 전체 AI 지출"로 남겨도 되지만, **그 값과 예산을 같은
분수에 넣지 않는다.** 두 숫자를 나란히 보여 주려면 "총 사용액 $305 · 예산 대비 $0/$5"처럼 분리한다.

---

### 🟠 M2-D2 (MEDIUM · **BE**) — protobuf 요청이 415가 아니라 500 → **exporter 무한 재시도**

```
POST /ai-monitor/otlp/v1/metrics  Content-Type: application/x-protobuf
→ HTTP 500 {"statusCode":500,"message":"Internal server error"}     (계약 M2-4는 415)
BE 로그: org.springframework.web.HttpMediaTypeNotSupportedException:
         Content-Type 'application/x-protobuf' is not supported
```

**원인.** 컨트롤러의 `consumes = APPLICATION_JSON_VALUE`가 Spring 표준대로
`HttpMediaTypeNotSupportedException`을 올리는데, **앱 전역 `GlobalExceptionHandler`가 이를 삼켜
일반 500으로 바꾼다.** "OTLP 경로만 실제 상태 코드를 쓴다"는 계약이 전역 핸들러에 막힌 것이다.

**영향 — 계약 자신의 표가 말해 준다.** `415`는 exporter가 **폐기**, `500`은 **재시도**다.
🔴 그런데 **OTel SDK의 기본 프로토콜이 `http/protobuf`**다. 개발자가 `OTEL_EXPORTER_OTLP_PROTOCOL`을
빠뜨리면 곧바로 이 경로에 들어오고, 서버는 영원히 받아 줄 수 없는 요청을 **무한 재시도**로 계속
받는다. 관리자 화면에는 "무수신"으로만 보여 원인을 주소·토큰으로 오진하게 된다 — 계약이 415를
명시한 이유가 정확히 이것이었다.

**제안.** OTLP 컨트롤러에 스코프된 `@ExceptionHandler(HttpMediaTypeNotSupportedException.class)`로
415를 돌려준다(전역 핸들러의 "에러도 200" 관례는 건드리지 않는 범위에서).

---

### 🟡 M2-D3 (LOW · **BE**) — 수신 계정 수정 시 `monthlyBudgetUsd`가 조용히 지워진다

계약 M2-10은 기존에 들어 있던 예산 값을 **"저장된 채로 무시된다 — 지우지 않은 이유는 되돌릴 수 없는
파괴를 피하기 위해서"**라고 했지만, `PUT /ai-monitor/accounts/{id}`(예산 필드 생략, 수신 계정)를
보내면 **DB 값이 NULL로 교체**된다. 수정 폼이 수신 계정에서 이 입력을 숨기므로(설계대로), **관리자가
이름만 바꿔도 저장돼 있던 값이 사라진다.**

```
before  monthly_budget_usd = 3.05
PUT {"name":"…","enabled":true,"defaultPlanUsd":100}
after   monthly_budget_usd = NULL
```

무시되는 값이라 **기능 피해는 없다.** 다만 계약이 명시한 보존 약속과 어긋나므로, 보존하든지
계약 문구를 고치든지 한쪽으로 맞춰야 한다.

---

### 🟡 M2-L1 (LOW · **BE**) — `active_time` 소수부가 배치마다 버려진다

페이로드 `2.322`초 → `active_time_seconds = 2`. 계약이 "초 단위 원 단위"라 했으니 초 저장은 맞지만
**버림이 배치마다 반복**된다. 10초 간격 export면 하루 수천 배치이고, 배치당 최대 1초씩 과소계상돼
활동 시간이 구조적으로 짧게 나온다. 마이크로달러처럼 **정수 밀리초로 담거나 잔여분을 이월**하면
같은 방식으로 해결된다.

---

## M-6. 화면 검증 — 전부 PASS (여기가 M2의 핵심)

경로가 라운드 1의 `/monitoring/ai-usage` → **`/monitoring/ai-account-usage`**로 바뀌었다.
쿼리 상태 키도 `aiAccountId` · `aiPeriod` · `aiTab` · `aiSource`다. 탭 4개:
`Usage` · **`By user`** · `Keys & members` · `Accounts`.

### byUser 표 (계정 선택 + month)

```
User               Cost      Calls  Input   Output  CacheR  CacheW  Sessions  Active time  Lines of code   Plan      Utilization
hong@dmove.co.kr   $275.00   0      1.5M    150K    75K     15K     12        1h 30m       +820 −310       $200.00   137.5% [Paid off]
kim@dmove.co.kr    $30.00    0      200K    20K     0       0       2         15m          +40  −10        $100.00   30%    [Underused]
```

- **활동 3열이 삽입값과 정확히 일치**: sessions 8+4=12 · active 3600+1800=5400초 → `1h 30m` ·
  lines +500+320 / −200−110 → `+820 −310` ✅
- 활용도 계산 일치: 275/200 → **137.5%**, 30/100 → **30%** ✅

### 🔴 색·라벨 — 뒤집힌 화면이 아님을 실측 확인

| 값 | 색(computed) | 라벨 | 판정 |
|---|---|---|---|
| **137.5%** | `rgb(31, 146, 84)` = **초록(성공 계열)** | **"Paid off"** | ✅ 빨강 아님 — **요구 충족** |
| 30% | `rgb(212, 107, 8)` = 주황(주의) | "Underused" | ✅ 저활용이 주의 신호 |
| 91.7%(플랜 300으로 변경 후) | — | "Normal" | ✅ 3구간 라벨 동작 |

색만이 아니라 **라벨 태그가 함께** 붙어 있어 색각 이상에서도 뜻이 전달된다(팔레트 규칙 4).

### 열 생략 조건

| 조건 | Plan/Utilization 열 |
|---|---|
| 계정 선택 + `month` + RECEIVE | **표시** ✅ |
| `week` | **없음** ✅ |
| `day` / 전 계정 합산 / 폴링 계정 | **없음**(API에서도 생략) ✅ |

### 사용자별 플랜 편집 (시나리오 7)

- 화면 문구: `Account default plan: $100.00` / "기본값인 사람은 넣지 말라"(예외만 두라는 계약 의도) /
  **"Saving replaces the whole list…"**(전체 교체 시맨틱 명시) ✅
- 200 → **300**으로 바꿔 저장 → 사용량 표가 **자동 갱신**되어 `91.7% Normal` ✅ (쿼리 무효화 동작)
- **행 삭제 후 저장 → 계정 기본값 $100.00 복귀**, `275% Paid off` ✅
- API 레벨 규칙도 전부 확인: 예외 우선 ✅ / 음수는 `AI_MONITOR_INVALID_PLAN`이고 **기존 목록 보존** ✅ /
  같은 `userKey` 중복은 **뒤엣것 승리** ✅ / 빈 배열은 전부 삭제 ✅ / 폴링 계정은 `WRONG_ACCOUNT_KIND` ✅

### 재발급 모달 (시나리오 5)

- 경고 문구: "기존 토큰이 즉시 중단되므로 모든 개발자 PC가 실패한다 — 새 스니펫을 재배포해야 한다" ✅
- 수집 항목 고지(수집함 / 수집 안 함: **프롬프트 원문·응답 원문·코드 내용**) ✅
- **동의 체크박스 미체크 → [Reissue token] `disabled`**, 체크 → 활성, 해제 → 다시 비활성 ✅

### 계정 관리 표 — kind별로 다른 액션

- 폴링: `Test connection` / 수신: `Check reception` + `Reissue token` ✅
- 수신 행 표시: `Receiving · Claude Code · Token issued` · 예산 `No budget` ✅
- **수정 폼이 kind에 따라 정확히 반대**: 수신은 Provider·Admin key·Monthly budget **숨김** +
  Default plan **표시**, 폴링은 그 반대 ✅

---

## M-7. 정리(원상복구) — 완료

| 항목 | 상태 |
|---|---|
| 테스트 수신 계정(id=4) | **삭제** — `ai_mon_usage`·`ai_mon_user_plan`·`ai_mon_otel_cursor` CASCADE 0행 확인 |
| 홈 위젯 `ai_monitor_cost` | **삭제** |
| **사용자 기존 계정(id=3 `클로드 api key`)** | **보존 + 스냅샷 복원** — `monthly_budget_usd 5.00` · `fail_count 2` · `last_error` 원문 · `last_ok_at NULL` · `updated_at 15:43:37.213196` |
| BE :3000 · 캡처 프록시 :3999 | **종료**, 포트 해제 확인 |
| FE :5173 | **선재 인스턴스라 그대로 둠**(내가 띄우지 않았다) |
| 일회성 스크립트·로그·캡처 | 전부 **세션 scratchpad**에만 생성(`_workspace`에 남긴 것 없음) |
| Chrome MCP 탭 | 전부 닫음 |

⚠️ 기동 전에 떠 있던 **V33 이전 BE(pid 13712)는 내가 종료**했고 검증 종료와 함께 :3000은 비어 있다.
다시 쓰려면 재기동이 필요하다.

---

## M-8. 라운드 1 결함의 후속 상태

| 라운드1 | 항목 | 현재 |
|---|---|---|
| **D-1** | `asOf`가 DB `NOW()`(UTC)라 9시간 어긋남 | ✅ **해소** — `updated_at`이 앱 시각으로 저장된다(실 OTEL 적재 `asOf 15:49:50` = 로컬시각 일치). `DEFAULT now()`도 제거돼 이제 NOT NULL 명시 삽입이다 |
| **D-2** | 홈 위젯 예산 막대가 100%에서 **초록** | ✅ **해소** — 초과 시 `rgb(211,58,44)` 빨강. (단 그 빨강이 지금은 **거짓 경고**를 그린다 → M2-D1) |
| **D-3** | `unpricedRows`가 구조적으로 항상 >0 | ✅ **해소** — 필드가 **`unpricedDays`로 재정의**됐고 비용이 다 들어온 구간에서 `0` |
| D-4 | `warn`·`over` 동시 true | 미확인(이번 범위 밖) |
| D-5 | `percent` 경계값 절사 | 미확인. 다만 `utilizationPercent`는 **HALF_UP으로 명시**돼 91.7%가 정확히 나왔다 |
| D-6 | 메뉴/제목 라벨 불일치 | 경로·라벨이 재정비됨(`ai-account-usage`). 한국어 라벨 재확인은 미실시(이번 세션 UI가 영문) |

---

## M-9. 남은 검증 공백

| 항목 | 사유 |
|---|---|
| `lines_of_code.count` 실측 | 이번 실행에 코드 편집이 없어 메트릭 자체가 안 나왔다. **코드를 고치는 세션으로 1회 더** 쏘면 확정된다 |
| `commit.count`·`pull_request.count` "받아도 버린다" | 위와 같은 이유로 미출현 |
| CUMULATIVE 경로·커서 | 실측이 DELTA로 확정돼 **실행되지 않는 방어 코드**로 남았다(픽스처 테스트로만 검증됨) |
| 413(본문 상한)·503(라이선스 만료) | 미검증 |
| 한국어 UI 라벨 | 이번 세션이 영문 로케일이었다 |
| 인벤토리 `itemType:"RECEIVER"` 화면 | API 계약은 확인, 탭 렌더는 미확인 |

---

## M-10. 재현 방법

```bash
# OTLP 실측 (프록시 없이 BE 직행도 동일)
cd <scratchpad>/ccwork
CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_PROTOCOL=http/json OTEL_METRIC_EXPORT_INTERVAL=10000 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000/ai-monitor/otlp \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>" \
claude -p "1+1은?"

# M2-D1 재현 (수신 계정에 사용량이 있고 폴링 계정에 예산이 있을 때)
curl -s -b c.txt -H "x-visitor-id: qa-e2e" http://localhost:3000/ai-monitor/usage/compact
#   → costUsd(전 소스) / budgetUsd(폴링 전용) / percent 폭주
curl -s -b c.txt -H "x-visitor-id: qa-e2e" "http://localhost:3000/ai-monitor/usage?period=month&source=POLL"
#   → 진짜 폴링 지출(0.0)

# M2-D2 재현
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/ai-monitor/otlp/v1/metrics \
  -H "Content-Type: application/x-protobuf" -H "Authorization: Bearer <token>" \
  --data-binary @payload.json
#   → 500 (계약은 415)
```

### 🔴 다음 QA를 위한 환경 메모

- **브라우저 로그인은 MCC 탭에서 매우 느리다** — 제출 후 **수십 초 뒤에** 이동이 완료되는 경우가 있다
  (`SignIn.tsx`의 `setTimeout(navigate, 1000)`이 백그라운드 탭에서 지연). 라운드 1에서
  FingerprintJS를 원인으로 지목했으나 **이번에 직접 측정하니 fp는 1초 만에 정상 완료**했다 —
  원인은 fp가 아니라 **탭 백그라운드 타이머 지연**이다. 실패로 단정하지 말고 다른 탭 상태를 확인할 것.
- 라우트가 `/monitoring/ai-account-usage`로, 쿼리 키가 `aiAccountId`/`aiPeriod`/`aiTab`으로 바뀌었다.
  옛 URL로 들어가면 **404**이고, 쿼리 키를 틀리면 조용히 "전 계정"으로 열려 플랜 열이 사라진다.

---
---

# 3라운드 검증 — Codex CLI 수신 · 가이드 메일 · 표 재구성

- 실행: 2026-08-25 · functional-qa 3라운드 · 기준: 계약서 최신분(`M2-11` Codex · `M2-12` 가이드 메일 · `AiMonReceiveTokenDto.provider`)
- 기동: BE `bootRun` dev(JDK17 재빌드, V30~V35 적용) / FE :5173(선재) / Chrome MCP
- 범위 한정: 2라운드에서 PASS한 항목은 재검증하지 않았다.
- 🔴 **이번 라운드의 성과**: `M2-11`의 미실측 전제를 **실제 Codex CLI 0.149.0으로 실측**했고,
  그 결과 **Codex 수신이 실동작하지 않는다**는 것을 확인했다(§R-2).

> **한 줄 요약** — 화면 쪽 추가분(토큰 모달 분기·가이드 메일·재진입 가이드·표 재구성)은 **전부
> 잘 만들어졌다**. 특히 토큰 모달의 localhost 경고와 "형식 오류 = 전체 거부" 안내는 계약이 요구한
> 수준을 넘는다. 그러나 **Codex CLI는 메트릭을 보내지 않는다** — 우리 파서가 기다리는
> `codex.turn.token_usage` 히스토그램은 이 버전에 존재하지 않고, 실제로 붙여 보면 **200 OK를 받으며
> 0행이 적재**된다. 관리자에게는 "무수신"으로만 보인다.

---

## R-1. 총괄표

| # | 시나리오 | 판정 | 근거 |
|---|---|---|---|
| 1 | Codex 계정 등록·토큰 모달 분기·endpoint 표시 | **PASS** | §R-3 |
| 2a | **Codex 실측**(실제 CLI → BE) | **FAIL** | §R-2 |
| 2b | Codex 픽스처 적재(토큰 매핑·total 무시) | **PASS** | §R-4 |
| 2c | 비용 미제공 신호(단가 미산정 배지·KPI 문구) | **부분 FAIL** | §R-4 |
| 3 | 가이드 메일(SMTP 미설정·형식 오류·토큰 고지) | **PASS** (공지문 결함 1건) | §R-5 |
| 4 | byUser 재진입 가이드 | **PASS** | §R-6 |
| 5 | 표 재구성(6열·가로 스크롤·대비) | **PASS** (대비 LOW) | §R-7 |
| 6 | 정리·기존 계정 보존 | **완료** | §R-8 |

**결함 4건** — HIGH 1 · MEDIUM 2 · LOW 1.

---

## R-2. 🔴 R3-D1 (HIGH · BE) — Codex CLI는 메트릭을 보내지 않는다. 수신이 성립하지 않는다

### 실측 방법

사용자의 `~/.codex/config.toml`은 **건드리지 않고** 런타임 오버라이드(`-c`)로만 설정했다.

```bash
codex -c 'otel.environment="prod"' \
      -c 'otel.exporter={otlp-http={endpoint="<프록시>/ai-monitor/otlp/v1/metrics",
                                    protocol="json",headers={Authorization="Bearer <토큰>"}}}' \
      exec --skip-git-repo-check "Reply with exactly: 4"
→ codex-cli 0.149.0 / 7,972 tokens used / 페이로드 6건 전송
```

### 결과 — 200 OK인데 0행

```
프록시 upstream_status : 200 × 6
ai_mon_usage(account=5): 0 rows
ai_mon_account          : last_ok_at = NULL, fail_count = 0   ← 상태가 PENDING에서 안 움직인다
BE 로그                 : OTLP 수신 account=5 rows=0  (× 6)
```

### 원인 — 신호 종류가 다르다

실 페이로드의 최상위 키는 `resourceMetrics`가 **아니라 `resourceLogs`**다.

| 항목 | 계약 M2-11 전제 | **실측(0.149.0)** |
|---|---|---|
| 신호 | 메트릭 `codex.turn.token_usage` 히스토그램 | 🔴 **OTLP 로그** (`resourceLogs`, scope `codex_otel.log_only`) |
| 토큰 위치 | 히스토그램 `sum`, 속성 `token_type` | 🔴 **`codex.sse_event` 로그 레코드의 속성** |
| 토큰 속성명 | `input`/`cached_input`/`output`/`reasoning_output`/`total` | `input_token_count` · `cached_token_count` · `output_token_count` · `reasoning_token_count` · `cache_write_token_count` · `tool_token_count` (**전부 문자열**) |
| 사용자 귀속 | ⚠️ 미실측("안 올 수 있다") | ✅ **온다** — `user.email` · `user.account_id`가 로그 레코드에 실린다 |

관측된 로그 이벤트: `codex.conversation_starts` · `codex.api_request` · `codex.sse_event` ·
`codex.turn_ttft` · `codex.user_prompt` · `codex.startup_phase` · `codex.websocket_connect/request`.
resource 속성: `telemetry.sdk.*` · `host.name` · `service.name=codex_exec` · `service.version=0.149.0` · `env`.

**메트릭을 켜는 스위치는 없다.** `otel.metrics` · `otel.signals` · `otel.exporter_metrics` 모두
`unknown configuration field`로 거부됐다(`--strict-config`로 확인). 유효한 필드는 `otel.environment`,
`otel.exporter`, `otel.log_user_prompt` — **로그 전용 서브시스템**이다.

### 왜 HIGH인가

BE에는 로그 수신 경로가 없다(계약 M2-5: "로그 수신 엔드포인트 자체가 없다"). 그래서 이 조합은
**모든 단계가 성공으로 보이면서 데이터만 사라진다**:

1. 관리자가 계정을 만들고 스니펫을 배포한다 — 화면상 아무 문제 없다.
2. 개발자가 설정을 정확히 넣는다 — Codex가 실제로 전송한다.
3. 서버가 **200 OK**를 준다 — exporter는 성공으로 보고 버린다.
4. 7일 뒤 `RECEIVE_SILENT`가 뜬다: **"서버 주소·토큰 설정을 확인하세요."**
   → 관리자는 **정확하게 설정된 것들**을 의심하게 된다.

계약이 M2-2에서 경고한 "조용한 무수신"이, 오설정이 아니라 **우리 전제 때문에** 재현된다.

**제안(택1).**
- (a) `resourceLogs`를 파싱해 `codex.sse_event`의 토큰 속성을 적재한다. `user.email`이 함께 오므로
  **사용자별 귀속까지 가능**하다(계약이 포기했던 것). 🔴 단 `tool_token_count`는 `input`과 겹치는
  값으로 보이므로 합산하면 안 된다 — 별도 실측 필요.
- (b) 로그를 지원하지 않기로 하면, **최소한 `resourceMetrics`가 없는 본문을 200으로 삼키지 말 것**.
  `rows=0`일 때 계정 상태나 응답으로 "받았지만 해석하지 못했다"를 남겨야 4단계의 오진이 끊긴다.

### ℹ️ 부수 실측 — 프라이버시 기본값은 안전하다

`codex.user_prompt` 이벤트의 `prompt` 속성은 **`[REDACTED]`**로 온다(`prompt_length`만 숫자).
설계서의 "프롬프트 원문을 수집하지 않는다"는 Codex 기본값에서 지켜진다. 🔴 다만 `otel.log_user_prompt`
라는 **유효한 설정 필드가 존재**하므로, 스니펫에 이 값을 넣지 않는 현재 방침을 유지해야 한다.

---

## R-3. Codex 계정 등록·토큰 모달 — PASS

| 검증 | 결과 |
|---|---|
| `CODEX_CLI` + consent 누락 | `AI_MONITOR_CONSENT_REQUIRED` ✅ |
| `CODEX_CLI` + `POLL` | `AI_MONITOR_WRONG_ACCOUNT_KIND` ✅ |
| 등록 응답 | `provider:"CODEX_CLI"` · `issuedToken` · `endpoint`(**base URL**) · `credentialMasked:null` ✅ |
| **재발급 응답 `provider`** | Codex → `"CODEX_CLI"`, Claude Code → `"CLAUDE_CODE"` ✅ (신규 필드 동작) |
| 재발급 응답만으로 스니펫 조립 | 필드 `[accountId, accountName, endpoint, provider, token]` — **가능** ✅ |

### 토큰 모달이 도구별로 갈린다

| | Codex CLI | Claude Code |
|---|---|---|
| 탭 | **`config.toml (권장)` · `직원 공지문`** | **`설정 파일(권장)` · `셸 프로필` · `직원 공지문`** |
| 스니펫 | `[otel]` TOML 블록 | `settings.json`의 `env` 블록 |
| **endpoint** | `…/ai-monitor/otlp**/v1/metrics**` ✅ | `…/ai-monitor/otlp` (**붙이지 않음**) ✅ |
| 설정 파일 안내 | `~/.codex/config.toml` | `~/.claude/settings.json` |
| 제목 기본값 | `[MovesEye] **Codex CLI** 사용량 수집 설정 안내` | `[MovesEye] **Claude Code** …` |

Codex 탭은 경로를 붙인 **이유까지** 적는다:
> "설정에 들어가는 주소: …/otlp/v1/metrics (Codex는 준 주소를 그대로 쓰므로 /v1/metrics 까지 붙인
> 값입니다 — 아래 스니펫에 이미 반영돼 있습니다)"

🔴 **계약 잔여이슈 #5(`public-base-url`)까지 화면이 막고 있다** — endpoint가 localhost면 경고가 뜬다:
> "이 주소로는 아무 데이터도 들어오지 않습니다 — localhost는 개발자 PC에서 자기 자신을 가리킵니다."

토큰 1회성 경고, 재발급 시 기존 배포 무효 경고도 모달 상단에 있다 ✅

---

## R-4. Codex 페이로드 적재 — 매핑 PASS · 비용 문구 부분 FAIL

픽스처(`otlp_metrics_codex.json`)를 실 엔드포인트로 POST(200):

| `token_type` | 기대 | **적재값** |
|---|---|---|
| `input` 4500 | `input_tokens` | **4500** ✅ |
| `cached_input` 1200 | `cache_read_tokens` | **1200** ✅ |
| `output` 600 + `reasoning_output` 900 | `output_tokens` 합산 | **1500** ✅ |
| `total` 7200 | 🔴 버린다 | **반영 없음** ✅ |
| 비용 | 0 · `priced=false` | **0 · f** ✅ |
| 사용자 귀속 없음 | `user_key=''` | **''** ✅ |

조회 응답: `costUsd 0.0` · **`unpricedDays 1`** · `asOf` **키 생략** · `byUser`는 빈 조각 하나 ✅

### 🟠 R3-D2 (MEDIUM · BE+FE) — 비용을 **영영** 모르는 소스가 "아직 안 왔다 / 저활용"으로 읽힌다

Codex 계정 화면의 실제 표시:

```
Cost this period  $0        [Estimated] [1 days without cost]
안내문: "비용은 하루 한 번 수집되고 … 최근 사용분이 아직 반영되지 않았을 수 있습니다.
        · 비용이 아직 집계되지 않았습니다 — $0을 '안 썼다'로 읽지 마세요."
byUser: Unattributed (from polling) │ $0 │ 7K │ 0 sessions · 0m │ 0% [Underused]
```

문제 셋:

1. **"아직(yet)"이 거짓이다.** Codex는 비용을 **구조적으로 제공하지 않는다**(계약 M2-11-3).
   기다리면 온다는 문구라 관리자는 오지 않을 숫자를 기다리고, `1 days without cost`는 매일 늘어난다.
   계약이 권고한 **"이 도구는 비용을 제공하지 않습니다"** 문구가 화면에 없다.
2. 🔴 **`0% Underused`(주황 주의)** — 비용이 0이라 활용도가 항상 0%가 되고, 화면은 이를 **저활용
   =시트 낭비**로 칠한다. 실제로는 **"활용도를 알 수 없음"**이다. 설계 §5.3.5가 막으려던
   "뒤집힌 화면"이 Codex 계정에서 다른 방향으로 재현된다 — 아무리 많이 써도 주황이다.
   → 플랜 2필드 생략 조건에 **"이 소스가 비용을 제공하는가"**가 없다(계약 M2-10의 네 조건 모두
   플랜 쪽만 본다). 비용이 구조적으로 0인 소스에서는 두 필드를 **생략**하는 편이 맞다.
3. 🟡 **라벨이 틀렸다** — 빈 `user`를 **"Unattributed (from polling)"**로 표시하는데, 이 행은
   **OTEL(Codex) 수신분**이다. 폴링 탓으로 설명하면 원인을 잘못 짚는다(LOW, R3-D4로 분리).

---

## R-5. 가이드 메일 — PASS (공지문 결함 1건)

### API

| 검증 | 결과 |
|---|---|
| SMTP 미설정 상태에서 발송 | **`AI_MONITOR_MAIL_NOT_CONFIGURED` 즉시 반환** ✅ 침묵·PENDING 아님 |
| 폴링 계정(3)에 발송 | `AI_MONITOR_WRONG_ACCOUNT_KIND` ✅ |

ℹ️ 검사 순서는 **kind → SMTP 설정 → 페이로드 검증**이다. SMTP가 없으면 수신자·본문 검증까지
가지 않으므로 **이 환경에서는 페이로드 검증 규칙(형식 오류 전체 거부·50명 상한·body 필수)을
API 레벨로 확인할 수 없었다**(§R-9). 보낼 수 없는 요청을 먼저 끊는 순서 자체는 합리적이다.

### 화면 (모달 → `직원 공지문` 탭)

- **토큰 포함 고지** ✅
  > "이 메일에는 수신 토큰이 포함됩니다 — 대상자에게만 발송하세요 / 토큰을 가진 사람은 누구나 이
  > 계정으로 사용량을 보낼 수 있습니다. 전체 메일링 리스트나 공개 채널로 보내지 마세요.
  > **서버는 이 본문을 저장하지도 로그에 남기지도 않습니다.**"
- **형식 오류를 화면이 먼저 잡는다** ✅ — `not-an-email` 입력 시 Select가 error 상태가 되고
  전용 배너가 뜬다: **"형식이 올바르지 않은 주소가 있습니다 — 하나라도 틀리면 전체가 발송되지
  않습니다"** + 문제 주소 표시. **[안내 메일 보내기] 버튼 disabled** ✅
- 수신자 힌트: "받는 사람 N명 (최대 50명). 같은 주소는 자동으로 한 번만 보냅니다." ✅
- 닫기 경고: "이 창을 닫으면 토큰이 사라져 다시 보낼 수 없습니다…" ✅ (계약 M2-12의 "발급 직후에만")
- **SMTP 실패 UX** ✅ — 실제 발송 시 토스트가 뜬다:
  > "메일 서버(SMTP)가 설정되지 않아 보낼 수 없습니다. 서버 관리자에게 SMTP 설정을 요청한 뒤 다시
  > 시도하세요. **그때까지는 스니펫을 복사해 직접 전달하세요.**"

  ⚠️ 처음 관측 때 아무것도 안 보여 무음 실패로 오인할 뻔했다 — **MCP 탭 타이머 지연 때문에
  6초 뒤 샘플링에서 이미 사라진 것**이었다. 150ms 간격 폴링으로 재측정해 정상 렌더를 확인했다.
  판정 근거를 토스트 1회 관측에 두지 말 것.

### 🟠 R3-D3 (MEDIUM · FE) — Codex 계정의 직원 공지문이 **Claude Code 기준으로 쓰여 있다**

`CODEX_CLI` 계정의 공지문 본문(그대로 발송되는 완성본):

```
[안내] 개발 도구(Claude Code) 사용량 집계 시행
조직의 AI 사용량과 비용을 파악하기 위해 Claude Code 사용 통계를 수집합니다. …
수집하는 것
 - 사용자 이메일 또는 계정 ID
 - 모델별 토큰 사용량(입력·출력·캐시 읽기/쓰기)
 - Claude Code가 계산한 추정 비용      ← Codex는 비용을 주지 않는다
 - 세션 수                              ← Codex 페이로드에 없다
 - 활동 시간(초)                        ← 없다
 - 코드 라인 수(추가·삭제 건수만)       ← 없다
```

`Codex` 언급 **0회**, `Claude Code` **3회**. 제목 입력의 placeholder는 `Codex CLI`로 올바른데
**본문만 분기되지 않았다.**

**왜 MEDIUM인가** — 이건 스타일 문제가 아니라 **고지문의 사실관계 오류**다. 이 문서의 존재 이유가
"무엇을 수집하는지 정확히 알린다"인데, 받는 사람은 쓰지도 않는 도구 이름과 수집되지 않는 항목 4개를
읽는다. 설계의 신뢰 논거 전체가 이 텍스트의 정확성에 기대고 있다.

---

## R-6. byUser 재진입 가이드 — PASS

수집 범위 안내 배너의 액션 버튼 **"사용자가 안 보이나요?"**(en: *Not seeing your users?*) → 모달
**"사용자가 안 보일 때 — 설정 안내"**:

- "설정을 마친 사람만 이 표에 나타납니다" ✅
- 🔴 **무음 실패 경로를 명시** ✅
  > "서버 주소가 사내에서 닿지 않거나(localhost 등) 토큰이 무효가 되면 **아무 오류 없이 조용히**
  > 아무것도 들어오지 않습니다 — 설정을 먼저 확인하세요."
- 계정별 도구·설정 파일 표시: `tool: Codex CLI · config file: ~/.codex/config.toml` ✅
- **토큰 placeholder 명시** ✅
  > "아래 스니펫의 토큰은 **자리표시자**입니다 / 서버는 해시만 보관해 다시 보여줄 수 없습니다.
  > 발급 때 복사한 값을 넣으세요. 잃어버렸다면 계정 관리 탭에서 재발급하는 방법뿐이고,
  > **재발급하면 이미 배포된 설정이 모두 무효가 됩니다.**"
- 스니펫도 provider별로 갈린다(Codex=config.toml+`/v1/metrics`, CC=settings.json+base URL) ✅

---

## R-7. 표 재구성 — PASS (대비만 LOW)

### 6열 · 가로 스크롤

```
User │ Cost │ Calls │ Tokens │ Activity │ Utilization      ← 6열 ✅
hong@dmove.co.kr │ $275.00 │ 0 │ 1.7M │ 12 sessions · 1h 30m +820 −310 │ 275% [Paid off]
kim@dmove.co.kr  │ $30.00  │ 0 │ 220K │ 2 sessions · 15m   +40  −10   │ 30%  [Underused]
```

토큰 4종 → `Tokens` 한 열, 활동 3종 → `Activity` 한 열로 접혔다.
`scroll={{}}` — **고정 x가 없다**. 컨테이너 폭을 바꿔 가며 실측:

| 컨테이너 | 1280 | 1100 | 1024 | 900 | 768 |
|---|---|---|---|---|---|
| `scrollWidth − clientWidth` | 3px | 3px | 3px | 3px | 3px |

폭과 **무관하게 일정한 3px**은 테두리/서브픽셀 반올림이지 콘텐츠 넘침이 아니다 →
**1280에서 가로 스크롤 없음** ✅ (문서 전체 가로 넘침도 0)

### 🟡 R3-D4 (LOW · FE) — 활용도 셀 대비가 WCAG AA 미달 + 빈 사용자 라벨 오기

2라운드에서 육안으로 넘긴 항목을 수치로 측정했다:

| 요소 | 전경/배경 | 글자 | **대비** | AA 기준 |
|---|---|---|---|---|
| `275%` | `rgb(31,146,84)` / 흰색 | 14px · 400 | **3.96 : 1** | 4.5 미달 |
| `30%` | `rgb(212,107,8)` / 흰색 | 14px · 400 | **3.56 : 1** | 4.5 미달 |
| 태그 `Paid off` | 흰색 / `rgb(31,146,84)` | 12px · 400 | **3.96 : 1** | 4.5 미달 |
| 태그 `Underused` | 흰색 / `rgb(212,107,8)` | 12px · 400 | **3.56 : 1** | 4.5 미달 |

굵기 400·14px/12px이라 "큰 텍스트(3:1)" 예외에 해당하지 않는다.
⚠️ **뜻은 라벨 텍스트로도 전달되므로 정보 손실은 없다** — 가독성 문제이지 색맹 접근성 실패는 아니다.
녹색을 한 단계 어둡게(예: `#177245`), 주황을 `#a85400` 수준으로 내리면 AA를 넘긴다.

**같은 셀의 별건**: 빈 `user` 키를 **"Unattributed (from polling)"**로 표시하는데 실제로는
OTEL 수신분이다(§R-4-3). "이 도구가 사용자 정보를 보내지 않습니다"가 맞는 설명이다.

---

## R-8. 정리(원상복구) — 완료

| 항목 | 상태 |
|---|---|
| 테스트 계정 id=5(Codex)·id=6(Claude Code) | **삭제**(CASCADE) |
| `ai_mon_usage`/`inventory`/`user_plan`/`otel_cursor` | **전부 0행** |
| 홈 위젯 `ai_monitor_cost` | 0행 |
| **사용자 기존 계정 id=3 `클로드 api key`** | **보존 + 스냅샷 복원**(budget 5.00 · fail_count 2 · last_error 원문 · last_ok_at NULL · updated_at 15:43:37.213196) |
| **사용자 `~/.codex/config.toml`** | 🔴 **수정하지 않음** — 런타임 `-c` 오버라이드만 사용 |
| BE :3000 · 캡처 프록시 :3999 | **종료**, 포트 해제 확인 |
| FE :5173 | 선재 인스턴스라 그대로 둠 |
| 스크립트·캡처·codexwork | 전부 **세션 scratchpad**에만 생성(`_workspace` 산출물 없음) |
| Chrome MCP 탭 | 닫음 |

---

## R-9. 남은 검증 공백

| 항목 | 사유 |
|---|---|
| 가이드 메일 페이로드 검증(형식 오류 전체 거부·50명 상한·body 필수)의 **API 레벨** | SMTP 미설정 검사가 먼저 걸려 도달 불가. **화면 레벨에서는 확인됨** |
| 가이드 메일 **정상 발송·부분 실패(`failed[]`)** | SMTP 미설정 |
| Codex `tool_token_count`의 의미 | `input`과 값이 겹쳐 보이나 미확정 — 로그 파싱을 구현한다면 반드시 실측할 것 |
| Codex `lines_of_code`/세션/활동시간 | 해당 신호 자체가 없다(로그에도 없음) |
| 2라운드 잔여(D-4 `warn`·`over` 동시 true, 413/503, 인벤토리 RECEIVER 화면) | 이번 범위 밖 |

---

## R-10. 재현 방법

```bash
# Codex 실측 (사용자 config.toml 미수정 — 런타임 오버라이드)
codex -c 'otel.environment="prod"' \
      -c 'otel.exporter={otlp-http={endpoint="http://localhost:3000/ai-monitor/otlp/v1/metrics",
                                    protocol="json",headers={Authorization="Bearer <token>"}}}' \
      exec --skip-git-repo-check "Reply with exactly: 4"
# → BE 로그에 "OTLP 수신 account=N rows=0" 이 반복되고 ai_mon_usage는 비어 있다
# → 페이로드 최상위 키가 resourceMetrics 가 아니라 resourceLogs 임을 프록시로 확인

# 메트릭 스위치 부재 확인
codex -c 'otel.metrics=true' --strict-config exec "x"   # unknown configuration field

# R3-D3 재현: CODEX_CLI 계정 → 재발급 → [직원 공지문] 탭 본문에 "Claude Code" 3회
# R3-D4 재현: byUser 표 활용도 셀에서
#   getComputedStyle(cell.querySelector('.ant-tag')).backgroundColor  → 대비 계산
```

---
---

# 4라운드 재검증 — R3-D1~D4 수정 확인 (초미니)

- 실행: 2026-08-25 · 범위: **3라운드 FAIL 항목의 실측 재확인만**
- 기동: BE 재빌드(V30~V35) / 사용자 `~/.codex/config.toml` **무수정**(런타임 `-c` 오버라이드)

| # | 항목 | 판정 |
|---|---|---|
| 1 | Codex 실적재(`/v1/logs`) · 토큰 매핑 · `user.email` 귀속 | **PASS**(단, **신규 결함 R4-D1**) |
| 2 | 활용도 규칙(cost 미제공 → "알 수 없음") | **PASS**(API 레벨) |
| 3 | Codex 공지문이 Codex 기준으로 렌더 | **PASS**(소스·i18n 레벨) |
| 4 | 정리·기존 계정 보존 | **완료** |

---

## 1. Codex 실적재 — PASS (R3-D1 해소)

FE 스니펫 생성기가 만드는 값 그대로(`codexOtlpUrl` = `<endpoint>/v1/logs`) 설정해 실제 CLI 1턴 실행:

```
endpoint : http://localhost:3000/ai-monitor/otlp/v1/logs
BE 로그  : OTLP LOGS 수신 account=7 rows=1   ← 3라운드의 rows=0에서 바뀜
적재     : source=OTEL  model=gpt-5.6-terra
           user_key=dmv.dev.claude@gmail.com   ← user.email 귀속 동작
           input=30,623  output=5  cache_read=11,008  cost=0  priced=f
계정     : last_ok_at 갱신됨(PENDING 탈출)
```

- 🔴 **0행 WARN 로그도 확인** — 토큰이 없는 이벤트 페이로드에는
  `"OTLP LOGS 수신했으나 적재할 것이 없다(account=7) — 페이로드가 비었거나 우리가 아는 신호가
  아니다. 이 로그가 반복되면 도구·버전을 확인할 것"`이 남는다. 3라운드 제안 (b)가 반영됐다.
- ℹ️ `tool_token_count`는 합산되지 않았다(합산했다면 값이 배로 커진다) ✅

### 🔴 R4-D1 (HIGH · BE) — 신규: Codex 행이 **1970-01-01**에 적재된다

적재는 되는데 **모든 기간 조회에서 사라진다.**

```
ai_mon_usage: bucket_start = 1970-01-01 00:00:00 · day = 1970-01-01
GET /ai-monitor/usage?accountId=7&period=month → byUser [] · unpricedDays 0
```

**원인.** Codex 로그 레코드는 `"timeUnixNano": "0"` + `"observedTimeUnixNano": "1787…"`로 온다
(3라운드 캡처에서 확인된 모양). 파서는 폴백을 갖고 있지만 **`null`일 때만** 동작한다:

```java
// OtlpMetricsParser.java:167-170
Instant time = unixNanoToInstant(text(record, "timeUnixNano"));   // "0" → Instant.EPOCH (non-null)
if (time == null) {                                               // ← 걸리지 않는다
    time = unixNanoToInstant(text(record, "observedTimeUnixNano"));
}
```

`"0"`은 **없는 값이 아니라 있는 값 0**이라 폴백이 건너뛰어지고 epoch에 박힌다.

**영향.** 사용자 눈에는 **R3-D1과 증상이 같다** — 계정은 "수신 중"(`last_ok_at` 갱신, `rows=1`
로그)인데 사용량 화면은 영원히 비어 있다. 로그·계정 상태가 모두 건강해 보여 원인 추적이 더 어렵다.

**제안.** `unixNanoToInstant`가 **0 이하를 없는 값으로 취급**하게 하면 기존 폴백이 그대로 살아난다.
(이 저장소의 [[home-widget-dashboard]] 교훈 "from/to 없으면 epoch 0 창=0건"과 같은 계열이다.)

> 검증 편의를 위해 이 행의 날짜만 오늘로 고쳐 아래 2번을 이어서 확인했다(적재 경로 자체는 정상).

---

## 2. 활용도 규칙 — PASS (R3-D2 해소)

토큰은 있고 비용은 구조적으로 0인 Codex 계정에서:

```
costUsd 0.0 · unpricedDays 1
byUser: user='dmv.dev.claude@gmail.com' in=30,623 out=5
        planUsd=(키 생략)  utilizationPercent=(키 생략)
```

3라운드의 **`0% Underused`(주황 주의)가 사라지고 두 필드가 생략**된다 → 화면은 "알 수 없음"으로
그린다(FE는 `value == null`에서 `plan.unset`을 렌더). "가장 많이 쓴 사람이 주황"이 되던 역전 해소.

⚠️ **브라우저 렌더는 이번 라운드에 재확인하지 못했다** — Chrome 확장이 연결되지 않아(3라운드 종료
시 브라우저가 닫힘) API·소스 레벨로만 확인했다. 렌더 분기 자체는 2·3라운드에서 실측된 코드 경로다.

---

## 3. Codex 공지문 — PASS (R3-D3 해소)

`buildTelemetryAnnouncement({ provider, toolLabel, t })`가 도구별로 갈린다:

| | Claude Code | **Codex CLI** |
|---|---|---|
| 제목·목적문 | `{{tool}}` 보간 | `{{tool}}` 보간 → **"Codex CLI"** |
| 수집 항목 | identity · tokens · **cost · sessions · active_time · lines** | **identity · tokens 둘만** |
| 추가 문구 | 없음 | `consent.codex_unavailable` — "이 도구는 비용·세션·활동 시간·코드 라인 수를 제공하지 않아 수집되지 않습니다(토큰 사용량만 옵니다)" |

3라운드에 지적한 **"Codex 계정인데 본문이 Claude Code"**와 **수집되지 않는 항목 4개 나열**이 모두
제거됐다. 코드에 `R3-D3` 주석으로 근거가 남아 있다.

⚠️ 위와 같은 이유로 **화면 렌더는 미재확인**(소스·i18n 대조).

---

## 4. 정리 — 완료

| 항목 | 상태 |
|---|---|
| 테스트 계정 id=7 | 삭제(CASCADE) — `usage`/`inv`/`plan`/`cursor` 전부 0행 |
| **사용자 계정 id=3** | 보존 확인(budget 5.00 · fail_count 2 · last_ok_at NULL · updated_at 15:43:37.213196) |
| 사용자 `~/.codex/config.toml` | **무수정**(런타임 `-c`만) |
| BE :3000 | 종료 |
| Chrome | 이번 라운드에 내가 띄웠으므로 **다시 닫음**(라운드 시작 시 미실행 상태였다) |
| 스크립트 | 세션 scratchpad에만 |

**R3-D4(대비 3.96/3.56:1)** 는 이번 범위에 없어 재측정하지 않았다.

---

## 5라운드 (마이크로) — R4-D1 해소 확인 · **PASS**

2026-08-25 · 범위: 버킷 시각 하나만. 실제 Codex CLI 1턴(`-c` 오버라이드, 사용자 `config.toml` 무수정).

```
실행 시각    local 18:46 KST  =  db_now 09:46 UTC
적재 버킷    bucket_start = 2026-08-25 09:00:00 (UTC 시간 버킷)  ·  day = 2026-08-25
             source=OTEL  model=gpt-5.6-terra  user_key=dmv.dev.claude@gmail.com
             input=30,205  output=5  cache_read=11,008
조회         GET /ai-monitor/usage?accountId=8&period=month  (from 2026-08-01 ~ to 2026-08-25)
             → inputTokens 30,205
             → byUser: user='dmv.dev.claude@gmail.com' in=30,205 out=5
```

4라운드의 **1970-01-01 적재가 사라졌다** — 3단 폴백(`timeUnixNano` → `observedTimeUnixNano` →
서버 수신 시각)이 `"0"`을 넘기고 현재 시각대 버킷에 정확히 들어간다. `period=month` 조회의
`byUser`에 사용자가 **이메일 귀속 그대로** 나타난다.

정리: 테스트 계정 id=8 삭제(전 테이블 0행), 사용자 계정 id=3 스냅샷 유지, BE :3000 종료.
