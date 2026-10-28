# QA — AI 계정 모니터링 M1 · BE↔FE 경계면 정합성(정적)

- 일자: 2026-08-25 · 검증자: `integration-qa` · **정적 대조만**(서버 기동·실호출 없음 → 런타임은 `functional-qa` 몫)
- 대조 3원
  1. 계약서 `_workspace/features/ai/ai-account-monitoring/contract_ai-account-monitoring.md` (EP 10 + R-1 반영본)
  2. BE `moveseye-be-spring/src/main/java/com/dmove/moveseye/aimonitor/**` + `home/HomeWidgetType.java` + `engine-api/.../ErrorCode.java` + `db/migration/V30__ai_monitor.sql`
  3. FE `moveseyee_fe/src/**` (types·services·hooks·constants·pages·routes·locales)

## 판정: **FAIL** — HIGH 1 · MEDIUM 3 · LOW 4

경로·메서드·필드명·enum 표기·i18n은 **전건 일치**한다. 깨진 축은 하나로 모인다 —
**`@JsonInclude(NON_NULL)`로 "키가 생략"되는 값을 FE가 "값이 `null`"로 다루고 있고, 에러 객체 타입도 한 칸 어긋나 있다.**
세 발견이 겹치는 최악의 시나리오는 아래 §0이다.

---

## 0. 세 결함이 겹치는 실제 시나리오 (읽고 시작할 것)

Zabbix Super admin이면서 MovesEye `userRole=USER`인 계정(이 제품에서 흔한 조합):

1. `SideNav`가 `isSuperRole`로 판정 → **모니터링 > AI 사용 현황 메뉴가 보인다**(M-3).
2. 라우트 가드도 같은 축이라 페이지가 **렌더된다**.
3. BE `AdminAccessChecker`는 `userRole`만 보므로 `/ai-monitor/**` 전 호출이 **HTTP 200 + `code:403`**.
4. `useDmoveQuery`가 그것을 `ApiEnvelopeError`로 던지는데, 페이지는 `AiMonitorApiError`만 잡는다 →
   **에러 배너가 안 뜨고 KPI가 전부 $0 / 빈 표로 그려진다**(H-1).

= "권한이 없다"가 "AI를 아무도 안 썼다"로 보인다. 이 레포가 2026-08-05 감사 P1에서 한 번 고친 실패 모양 그대로다.

---

## 1. 발견 항목

| # | 항목 | 기대(BE/계약) | 실제(FE) | 심각도 | 책임 주체 |
|---|---|---|---|---|---|
| H-1 | 조회 에러 소비 경로 | 200+`code:403`/`errorCode`를 화면이 배너로 노출 | 조회 에러를 **한 번도 못 잡는다**(타입 불일치) | **HIGH** | FE |
| M-1 | `asOf` null 판정 | `NON_NULL` → **키 생략** | `usage.asOf === null` → 항상 false | MEDIUM | FE + 계약서 |
| M-2 | `unusedDays` null 판정 | `NON_NULL` → **키 생략** | `row.unusedDays !== null` → 항상 true | MEDIUM | FE + 계약서 |
| M-3 | 관리자 판정 축 | `userRole ∈ {ADMIN, SUPER_ADMIN}` | 메뉴·라우트는 `isSuperRole`(Zabbix role 포함) | MEDIUM | FE |
| L-1 | `periodKey` week 표기 | `2026-W35`(ISO=2자리) | BE가 `2026-W5`(제로패딩 없음) | LOW | BE + 계약서 |
| L-2 | `GET /accounts/{id}` | 계약 §1.2 상세 EP | FE `getAccount` 소비처 0건(고아 함수) | LOW | FE |
| L-3 | 테스트 목의 현실성 | 실제 직렬화(키 생략) | 목이 `null`을 실어 M-1·M-2를 통과시킨다 | LOW | FE |
| L-4 | 계약서 §1.7 예시 | `NON_NULL` 생략 | 예시 JSON이 `null`을 명시 | LOW | 계약서 |

---

### 🔴 H-1. AI 사용 현황 화면이 BE 에러를 **구조적으로 못 잡는다**

**출처**
- `moveseyee_fe/src/pages/monitoring/ai-usage/AiUsagePage.tsx:81`
  ```ts
  const apiError = error instanceof AiMonitorApiError ? error : null;
  ```
- `moveseyee_fe/src/services/ai-monitor.api.ts:23` — `export class AiMonitorApiError extends Error {`
- `moveseyee_fe/src/hooks/useDmoveQuery.ts:39` — `throw new ApiEnvelopeError(result as Record<string, unknown>)`
- `moveseyee_fe/src/services/apiEnvelope.ts:24` — `export class ApiEnvelopeError extends Error {`

**무슨 일이 벌어지나**

`AiMonitorApiError`는 **변경성(mutation) 경로에서만** 생성된다 — `createAccount`/`updateAccount`/`deleteAccount`/`testAccount`가
`unwrapEnvelope`·`toApiError`를 통과하기 때문이다. 반면 조회 5종(`getAccounts`·`getUsage`·`getInventory`·`getAlerts`·`getUsageCompact`)은
`API.get`을 **날것으로 반환**하고, 실패 envelope 판정은 `useDmoveQuery`가 한다. 그때 던져지는 것은 `ApiEnvelopeError`다.

`AiMonitorApiError`와 `ApiEnvelopeError`는 필드가 같지만(`code`·`errorCode`·`status`) **서로 상속 관계가 아니다**(둘 다 `Error` 직계).
따라서 `error instanceof AiMonitorApiError`는 조회 에러에 대해 **영원히 false**이고, `apiError && <Alert .../>` 블록은 죽은 코드다.

묻히는 에러 전부:

| 상황 | BE 응답 | 화면 |
|---|---|---|
| 비관리자 접근 | 200 + `code:403`, `status:"error"` | 무음, $0 대시보드 |
| URL에 `?aiPeriod=` 오타(수동 편집·북마크) | 200 + `AI_MONITOR_INVALID_PERIOD` | 무음, 빈 화면 |
| 선택 계정이 방금 삭제됨 | 200 + `AI_MONITOR_ACCOUNT_NOT_FOUND` | 무음 |

`constants/ai-monitor.ts`의 `AI_MONITOR_ERROR_KEY`(6종)·`resolveAiMonitorErrorKey`·`ai_monitor.error.*` i18n 12줄이
**전부 도달 불가**다 — 계약 §3의 에러 표가 FE에서 소비되는 지점이 0이 된다.

**수정 제안 (택1)**
- (권장) `AiMonitorApiError extends ApiEnvelopeError`로 바꾸면 한 줄로 끝난다. 다른 서비스 12종도 같은 구조라 관례가 개선된다.
- 또는 `AiUsagePage`가 `resolveApiError(error)`(이미 `services/apiEnvelope.ts`에 있다)를 쓰거나
  `error instanceof ApiEnvelopeError || error instanceof AiMonitorApiError`로 넓힌다.

> ⚠️ `AiMonitorSettingsPage`의 `notifyError`는 **mutation 경로라 정상 동작**한다(계정 등록/수정/삭제 실패는 제대로 뜬다).
> 다만 그 화면도 `useAiMonitorAccounts()`의 조회 실패는 아무 데도 안 그린다 — 비관리자가 URL로 직접 오면 빈 표만 보인다.

---

### 🟡 M-1. `asOf`는 `null`로 오지 않는다 — "비용 집계 전" 경고가 절대 안 뜬다

**출처**
- BE `aimonitor/dto/AiMonUsageDto.java` — 레코드에 `@JsonInclude(JsonInclude.Include.NON_NULL)`
- BE `AiMonitorUsageService.summary` — `usageRepository.findLastPricedAt(accountId)`가 `null`이면 **JSON에서 키 자체가 사라진다**
- FE `pages/monitoring/ai-usage/AiUsageKpiRow.tsx:33`
  ```ts
  const costPending = !!usage && usage.asOf === null;
  ```

비용 폴링(`ai_monitor_cost_poll`, daily 04:30)이 아직 한 번도 안 돈 설치본에서 `asOf`는 **`undefined`**다.
`undefined === null`은 false → `costPending`이 항상 false → KPI 카드의 `ai_monitor.cost_pending` 경고가 렌더되지 않는다.

계약 §2.1이 🔴로 못박은 "**0원을 '안 씀'으로 그리면 안 된다**"가 KPI 카드에서 무력화된다.
(같은 화면의 `AiUsagePage.tsx:190`은 `usage?.asOf ? … : cost_pending` — **truthiness라 정상 동작**한다.
즉 상단 안내 배너에는 뜨고 KPI 카드에는 안 뜨는 반쪽 상태다.)

- **FE 수정**: `usage.asOf == null`(느슨한 비교) 또는 `!usage.asOf`.
- **계약서 수정**: §2.1 필드 표가 `accountId`/`accountName`에 대해서만 "생략(JSON에 키 없음, `NON_NULL`)"을 명시하고
  `asOf`는 `string | null`로 적어 뒀다. FE가 그 표를 그대로 옮겼다 — `asOf`도 "생략"으로 고쳐야 한다.

---

### 🟡 M-2. `unusedDays` 생략 → 사용 이력 없는 항목에 빈 "미사용 일" 텍스트가 붙는다

**출처**
- BE `aimonitor/dto/AiMonInventoryDto.java` — 레코드와 중첩 `Item` **양쪽에** `@JsonInclude(NON_NULL)`
- BE `AiMonitorInventoryService.get` — `lastUsed == null ? null : Duration.between(...).toDays()`
- FE `pages/monitoring/ai-usage/AiMonitorInventoryTab.tsx:94`
  ```tsx
  {row.unusedDays !== null && (
    <Typography.Text type={row.unusedDays >= AI_MONITOR_UNUSED_DAYS ? "warning" : "secondary"}>
      {t("ai_monitor.inventory.unused_days", { count: row.unusedDays })}
  ```

`lastUsedAt`이 없는 항목(계약 §1.7 예시의 `MEMBER`, `lastUsedSource:"NONE"`)은 `unusedDays` 키가 **생략**된다 →
`undefined !== null`이 true → 블록이 렌더되고, `count: undefined`로 보간돼 **숫자 없는 "미사용 일" 문구**가 남는다.
`NONE`("모름")을 표시하는 바로 그 행에 미사용 일수 문구가 따라붙어, 계약 §1.7이 막으려던 오독("안 씀")을 오히려 만든다.

- **FE 수정**: `row.unusedDays != null &&` (또는 `typeof row.unusedDays === "number"`).
- **계약서 수정**: §1.7 예시 JSON이 `"lastUsedAt": null, "unusedDays": null`을 실어 놨는데 실제 직렬화는 **키가 없다**(L-4와 동건).

---

### 🟡 M-3. 관리자 판정 축이 세 곳에서 두 종류다

| 지점 | 판정식 | 출처 |
|---|---|---|
| BE 전 EP | `userRole ∈ {ADMIN, SUPER_ADMIN}` | `AdminAccessChecker.requireAdmin` (`AiMonitorController` 전 메서드 첫 줄) |
| 홈 위젯 `ai_monitor_cost` | `useIsUserRoleAdmin` = `userRole ∈ {ADMIN, SUPER_ADMIN}` ✅ | `pages/home/widgets/ai/AiMonitorCostWidget.tsx:35`, `pages/home/HomePage.tsx:34` |
| 설정 > AI 모니터링 · 모니터링 > AI 사용 현황 | `isSuperRole` = `userRole===ADMIN \|\| role?.type===Zabbix SUPER_ADMIN` ❌ | `layouts/app/SideNav.tsx:88,217`, `routes/routes.tsx:232`(PageWrapper `adminOnly`) |

두 방향으로 어긋난다.

- **(a) `userRole=USER` + Zabbix Super admin** → FE는 열어 주고 BE가 403. §0의 무음 실패.
- **(b) `userRole=SUPER_ADMIN`(Zabbix 미연동)** → BE 허용 + 홈 위젯 렌더 + 데이터 정상인데,
  **메뉴는 숨겨지고 위젯의 "더보기" 링크(`moreTo={PATH_MONITORING.aiUsage}`)는 404로 튄다.**

`useIsUserRoleAdmin`의 주석이 이 함정을 이미 적어 뒀다(2026-08-18 QA F1). 홈 위젯만 그 교훈을 반영했고 메뉴·라우트는 안 됐다.

- **FE 수정**: 이 기능의 메뉴 `show`와 라우트 `adminOnly` 판정을 `useIsUserRoleAdmin`으로 맞춘다.
  ⚠️ `PageWrapper`의 `isSuperRole`은 **다른 화면들과 공유**되므로 전역 교체는 회귀 위험이 있다 —
  이 두 라우트에만 적용되는 축을 쓰거나, 전역 교체를 별도 과제로 분리할 것.

---

### 🟢 LOW

**L-1 `periodKey`의 ISO 주 번호에 제로패딩이 없다** — 책임: BE(+계약서)
`AiMonitorUsageService.periodKey`:
```java
case PERIOD_WEEK -> today.get(WeekFields.ISO.weekBasedYear())
        + "-W" + today.get(WeekFields.ISO.weekOfWeekBasedYear());
```
1~9주는 `2026-W5`로 나간다. 계약 §2.1은 `2026-W35`(ISO)라고만 적어 폭을 규정하지 않았지만 ISO 8601은 2자리다.
FE는 문자열을 그대로 표시만 하므로(위젯 `usage.periodKey`) 기능 영향은 없다. `%02d`로 맞추고 계약서에 폭을 명시할 것.

**L-2 `GET /ai-monitor/accounts/{id}` 소비처 없음** — 책임: FE(또는 계약서)
`services/ai-monitor.api.ts`의 `getAccount`가 export만 되고 어떤 훅·화면도 쓰지 않는다(목록에서 행 객체를 그대로 편집 모달에 넘긴다).
계약 §1.2는 실제로 미사용 EP다. 지금 구조에서 필요 없다면 FE 함수를 지우거나, 남긴다면 그 이유를 주석으로 남길 것.

**L-3 FE 테스트 목이 M-1·M-2를 가린다** — 책임: FE
- `src/__tests__/AiUsagePage.test.tsx:204` → `baseUsage({ asOf: null })`
- `src/__tests__/AiMonitorInventoryTab.test.tsx:98` → `unusedDays: null`

둘 다 **계약서 예시 JSON을 그대로 옮긴 목**이라 실제 직렬화(키 생략)와 다르고, 그래서 초록이다.
목을 "키 없음"으로 바꾸면 두 테스트가 실제로 실패하며 결함을 잡는다 — 수정 후 회귀 방어로 쓸 것.

**L-4 계약서 §1.7 예시/표가 `NON_NULL` 생략을 반영하지 않는다** — 책임: 계약서
`syncedAt`·`usageSince`·`displayName`·`status`·`lastUsedAt`·`unusedDays` 모두 키가 생략된다.
현재 FE 렌더는 `??`·truthiness라 `unusedDays` 외에는 무해하지만, 표기를 통일하지 않으면 같은 실수가 재발한다.

---

## 2. PASS 항목 (교차 확인 완료)

| 검증 축 | 결과 |
|---|---|
| **EP 경로·메서드 10/10** | 전건 일치. FE `baseUrl="ai-monitor"` + 클래스 `@RequestMapping("/ai-monitor")` → `/ai-monitor/accounts`, `/accounts/{id}`, `/accounts/{id}/test`, `/accounts/{id}/inventory`, `/usage`, `/usage/compact`, `/alerts` |
| **쿼리 파라미터** | `accountId`·`period` 이름·옵셔널 일치(`@RequestParam(required=false, defaultValue="month")` ↔ FE는 항상 실어 보냄) |
| **응답 필드 1:1** | `AiMonAccountDto`(13) · `AiMonConnectionTestDto`(4) · `AiMonInventoryDto`(4+7) · `AiMonUsageDto`(24) · `AiMonUsageSliceDto`(10) · `AiMonUsageCompactDto`(13) · `AiMonAlertDto`(6) — **필드명·타입 어긋남 0**. nullable 취급만 위 M-1/M-2 |
| **Lombok `isXxx` 함정** | 해당 없음 — 응답 DTO가 전부 `record`(`boolean enabled`/`estimated`/`ok` → JSON 키 그대로) |
| **언랩 깊이** | 조회는 인터셉터(`return body`) + `useDmoveQuery`(`envelope?.data`) 2겹 → 소비처가 payload 직접 수신. **`data.data` 과다 언랩 0건**. 변경성은 `unwrapEnvelope` 1겹(useDmoveQuery 미경유) — 올바름 |
| **시크릿 "비우면 유지"** | BE `trimToNull(req.getCredential())` → null이면 `AiMonAccount.update`가 `credential`을 건드리지 않음. FE 모달은 `...(credential ? { credential } : {})`로 **필드 자체를 생략**. **빈 문자열도 동일 처리**되므로 양쪽 시맨틱 일치. 등록은 FE `required: !isEdit` + BE `AI_MONITOR_CREDENTIAL_REQUIRED` 이중 방어 |
| **`monthlyBudgetUsd` 전체 교체** | BE `update`가 무조건 대입(생략=지움). FE 모달이 수정 시 현재 값을 프리필하고 `undefined`면 `null`을 **명시 전송** — 계약 §1.4-3 준수 |
| **`provider` 무시(수정)** | BE `update`가 읽지 않음. FE는 수정 모드에서 Select `disabled` + `provider_locked` 안내 |
| **에러 계약** | 6종 `ErrorCode` 존재(`ErrorCode.java:348~361`), `ApiError(ErrorCode)` → `HttpStatus.BAD_REQUEST` → `GlobalExceptionHandler`가 **HTTP 200 + body `code:400` + `errorCode`**. 권한 거부는 200+`code:403`·`errorCode` 없음. FE `resolveAiMonitorErrorKey`가 `code===403`을 코드 표가 아닌 `code`로 분기 — **표 자체는 정확**(다만 H-1로 도달 불가) |
| **연결 테스트 실패=성공 응답** | BE `AiMonConnectionTestDto.failure(...)`를 `success()` 래핑. FE `testAccount`가 throw하지 않고 `result.ok`로 분기, 목록 무효화도 안 함(§1.6 준수) |
| **enum 문자열** | `ANTHROPIC`/`OPENAI` · `POLL`/`RECEIVE` · `OK`/`ERROR`/`DISABLED`/`PENDING` · `day`/`week`/`month` · `API_KEY`/`MEMBER`/`WORKSPACE` · `PROVIDER`/`DERIVED`/`NONE` · `critical`/`warning` · 알람 5코드 — **3원 전부 동일 표기**. FE의 `Record<...>` 맵 4종에 누락 키 없음 |
| **홈 위젯 시그니처** | BE `AI_MONITOR_COST("ai_monitor_cost", false, true, true, 4, 6)` ↔ FE `meta("ai_monitor_cost","ai",4,6,{unique:true,adminOnly:true})` — pinned/unique/adminOnly/4×6 **전부 일치**. `HOME_WIDGET_TYPES` 배열 순서도 enum 순서(`ai_usage`→`ai_monitor_cost`→`recent_reports`)와 동일. `HomeWidgetDefaults` 미등재 확인(요청대로) |
| **스케줄러 job_key** | V30 시드 `ai_monitor_usage_poll`(interval 60) / `ai_monitor_cost_poll`(daily 04:30) ↔ `AiMonitorJobs.JOB_*` ↔ FE `constants/scheduler.ts` — 3원 일치 |
| **인증 헤더** | 컨트롤러 클래스 `@VisitorIdCheck`. FE는 공용 `API`(`createDmoveApi`) 사용 → `withCredentials:true` + `x-visitor-id` 자동 주입 |
| **고아 화면 없음** | `SettingsMenu.SETTINGS_ENTRIES`에 `ai-monitor` 등재 · `SideNav`에 `ai-usage` 등재 · `routes.tsx` 양쪽 라우트 존재 · `navSearchEntries`·`page-guide`에도 등록됨(도움말 있음) |
| **i18n** | 정적 `ai_monitor.*` 키 **113개 + 동적 조립 키 30개**(state·item_type·source·period·dimension·alert·provider_hint·위젯 카탈로그·스케줄러 라벨) → **kr.json/en.json 양쪽 누락 0**. 루트 키 중복 0(kr 890 / en 901 루트 키 원시 스캔) |

---

## 3. 담당별 조치 요약

**FE (`fe-engineer`)**
1. H-1 — `AiMonitorApiError extends ApiEnvelopeError` (권장) 또는 `AiUsagePage`의 에러 판정 확장. **배포 전 필수.**
2. M-1 — `AiUsageKpiRow.tsx:33` `usage.asOf == null`
3. M-2 — `AiMonitorInventoryTab.tsx:94` `row.unusedDays != null`
4. M-3 — 두 라우트·메뉴의 관리자 축을 `useIsUserRoleAdmin`으로(전역 `PageWrapper` 교체는 별도 과제)
5. L-3 — 테스트 목에서 `asOf: null`·`unusedDays: null`을 **키 생략**으로 교체(수정 전 실패 확인 → 회귀 방어)
6. L-2 — 미사용 `getAccount` 정리 여부 결정

**BE (`be-engineer`)**
- L-1 — `periodKey`의 ISO 주 번호 2자리 제로패딩

**계약서**
- §2.1 필드 표: `asOf`를 "`null`" → "**생략**(`NON_NULL`)"로
- §1.7 예시 JSON·표: `syncedAt`·`usageSince`·`displayName`·`status`·`lastUsedAt`·`unusedDays`가 **키 생략**임을 명시
- §2.1 `periodKey` week 표기 폭(2자리) 명시

---

## 4. 이 검증이 **하지 않은 것**

- 서버 기동·실호출·브라우저 렌더(→ `functional-qa`)
- 프로바이더 실응답 대조 — 계약 §5-B대로 **Anthropic/OpenAI Admin 키 미보유로 여전히 미실측**
- 알람 push 경로(계약 §5-A) — BE에 배달 경로가 없다는 사실은 이번에도 코드에서 재확인됨(`AiMonitorAlertService`는 평가만)

---
---

# 재검증 (2차) — 2026-08-25 · `integration-qa`

- 대상: 1차 발견 8건의 수정 + **화면 재배치**(사용자 결정: 설정 > AI 모니터링 메뉴 제거 → 계정 관리를 `모니터링 > AI 사용 현황`의 "계정 관리" 탭으로 흡수, 계정 0건 empty state)
- 방식: 정적 대조만. 바뀐 축만 재대조(전체 재검증 아님)

## 판정: **PASS** — 1차 8건 **전건 CLOSED** · 신규 잔여 **LOW 5건**(HIGH 0 · MEDIUM 0)

배포를 막는 항목은 없다. 신규 5건은 전부 "지금 틀리게 동작하지는 않지만 다음 사람이 같은 함정에 빠지게 두는" 부류다.

---

## 1. 1차 발견 8건 — 닫힘 확인 (코드 실물)

| QA | 상태 | 근거 |
|---|---|---|
| **H-1** 조회 에러 소비 불가 | ✅ **CLOSED** | `services/ai-monitor.api.ts:35` → `export class AiMonitorApiError extends ApiEnvelopeError`. 소비처도 **부모 타입으로** 판정: `AiUsagePage.tsx:86` / `AiMonitorAccountsTab.tsx:99,112`. 회귀 방어 테스트 3건(`AiUsagePage.test.tsx:172~198`이 `new ApiEnvelopeError(...)`로 403·`INVALID_PERIOD`·`ACCOUNT_NOT_FOUND`를 각각 던진다) + `AiMonitorAccountsTab.test.tsx:138`이 `instanceof ApiEnvelopeError`를 직접 단언 |
| **M-1** `asOf === null` | ✅ **CLOSED** | `AiUsageKpiRow.tsx:35` → `usage.asOf == null`(느슨한 비교, 주석에 사유 명시). 타입도 `asOf?: string`로 정정(`types/ai-monitor.ts:171`). 테스트 `AiUsagePage.test.tsx:264`가 **`omit(baseUsage(), ["asOf"])`** — 키 생략 형태로 바뀌었고 배너·KPI **양쪽**을 단언 |
| **M-2** `unusedDays !== null` | ✅ **CLOSED** | `AiMonitorInventoryTab.tsx:98` → `typeof row.unusedDays === "number"`. **0일이 유효한 값이라 truthiness를 못 쓴다**는 판단이 주석에 남아 있다(falsy 검사로 갔으면 `unusedDays:0`이 사라졌을 것). 테스트 3건: 키 생략(114) · `unusedDays:0` 표시(154) · 정상값 |
| **M-3** 관리자 판정 축 | ✅ **CLOSED** | 새 축 `userRoleAdminOnly` 신설 — `routes/routes.tsx:155,259,261`(`ADMIN_USER_ROLES` 재사용, 훅을 못 쓰는 조기 반환 뒤라 배열을 `useIsUserRoleAdmin.ts:11`에서 export). 적용: 라우트 `routes.tsx:464` · `SideNav.tsx:225` · `navSearchEntries.ts:97` · `GlobalSearch.tsx:127`. **기존 `adminOnly`는 그대로 두어 다른 화면 회귀 없음**(전역 교체를 별도 과제로 분리한 판단이 주석에 남아 있다) |
| **L-1** week `periodKey` 패딩 | ✅ **CLOSED** | BE `AiMonitorUsageService.periodKey:214` → `"%d-W%02d".formatted(...)`. 테스트 2건(`AiMonitorUsageServiceTest:84,96`)이 `2026-W05`와 **문자열 정렬 역전**(5주차가 35주차 뒤로 가는 것) + `2027-01-01 → 2026-W53`(ISO 주 기준 연도)까지 잠근다 — 1차 지적보다 넓게 막았다 |
| **L-2** 고아 `getAccount` | ✅ **CLOSED** | `services/ai-monitor.api.ts`·`hooks/useAiMonitor.ts`에서 grep 0건(제거됨) |
| **L-3** 테스트 목이 계약 예시 복사 | ✅ **CLOSED**(1건 잔여 → N-3) | `asOf`·`unusedDays` 목이 **키 생략** 형태로 교체됨. `syncedAt`/`usageSince`만 아직 `null`(→ N-3) |
| **L-4** 계약서 `NON_NULL` 미반영 | ✅ **CLOSED** | 계약서 **§0.1 신설** — DTO별 빈 값 표현 대응표 + "FE 판정 규칙"(`== null`/truthiness). §1.7 예시 JSON을 키 생략 형태로 교체하고 주석(190~193)으로 `!== null`이 항상 참인 이유까지 적었다. §2.1 `periodKey` 행도 패딩·ISO 주 연도 반영 |

> 🔎 **BE DTO의 `NON_NULL` 배치는 1차와 동일하다**(재확인): `AiMonAccountDto`·`AiMonAccountUpsertReqDto`·`AiMonConnectionTestDto` = 없음 / 나머지 5개 = 있음(`AiMonInventoryDto`는 레코드+`Item` 2곳). 즉 계약서 §0.1 표가 실물과 일치한다.

---

## 2. §0.1 표 ↔ FE 타입 옵셔널 — **전수 일치** (1차 문제 축 재점검)

| DTO / §0.1 규정 | FE 타입 | 판정 |
|---|---|---|
| `AiMonAccountDto` — **`null`로 나온다** | `credentialMasked`·`monthlyBudgetUsd`·`lastOkAt`·`lastError` = `T \| null`(필수 키) | ✅ |
| `AiMonConnectionTestDto` — **`null`로 나온다** | `detail`·`reason` = `string \| null` | ✅ |
| `AiMonInventoryDto` + `Item` — **키 생략** | `syncedAt?`·`usageSince?` / `displayName?`·`status?`·`lastUsedAt?`·`unusedDays?` · 항상 오는 `accountId`·`items`·`itemType`·`externalId`·`lastUsedSource`는 필수 | ✅ |
| `AiMonUsageDto` — **키 생략** | `accountId?`·`accountName?`·`asOf?`·`budgetUsd?`·`percent?`·`remainingUsd?`·`warn?`·`over?` | ✅ (`budgetUsd`의 `\| null` 여분 → N-4) |
| `AiMonUsageCompactDto` — **키 생략** | 예산 5필드 옵셔널, `accounts`·`costUsd`·`calls`·`alerts` 필수 | ✅ (동일 N-4) |
| `AiMonUsageSliceDto` — **키 생략** | `model?`·`workspace?`·`apiKeyId?`·`day?` + 수치 6필드 필수 | ✅ |
| `AiMonAlertDto` — 키 생략(현재 전 필드 채움) | 6필드 전부 필수 | ✅ — `AiMonitorAlertService`의 5개 규칙 전부가 `accountId`·`accountName`·`value`를 항상 채우는 것 재확인 |
| 배열은 생략되지 않음(§0.1 ℹ️) | `byModel`·`byWorkspace`·`byApiKey`·`daily`·`alerts` = 필수 배열 | ✅ |

**`=== null`/`!== null` 잔존 사용처 전수 확인** — 위험한 것 0건:
- `AiUsageKpiRow.tsx:65`·`AiMonitorCostWidget.tsx:69`의 `percent !== null` → 직전 줄에서 `?? null`로 정규화한 로컬 변수라 안전
- `AiUsagePage.tsx:157`의 `accountId === null` → URL에서 만든 FE 로컬 값
- `AiMonitorAccountsTab.tsx:218`의 `value === null || value === undefined` → `AiMonAccountDto`(= `null` 방식 DTO)라 유효, `undefined`까지 겹쳐 막아 무해

---

## 3. 재배치 후 경계면 — 고아 참조 **0건**

| 점검 | 결과 |
|---|---|
| `PATH_SETTING.aiMonitor` 참조 | **0건**(상수 정의 자체 제거) |
| `pages/setting/ai-monitor/` | **디렉터리 없음**. `AiMonitorSettingsPage` 참조 0건 |
| 파일 이동 | `AiMonitorAccountModal.tsx`가 `pages/monitoring/ai-usage/`로 함께 이동, `AiMonitorAccountsTab.tsx:48`이 `./AiMonitorAccountModal`로 **동일 디렉터리 상대 경로** 참조 ✅ |
| 설정 전용 자산 잔재 | 이동한 파일들에 `SettingsHero`·`settings-control-plane.scss`·`constants/routes` import **0건**(설정 화면 골격을 끌고 오지 않았다) ✅ |
| `SettingsMenu.SETTINGS_ENTRIES` | `ai-monitor` 항목 제거, 10항목 남음. 타입에 `userRoleAdminOnly` 필드 **없음** — `adminOnly`만 쓰고 필터도 `!entry.adminOnly \|\| isSuperRole` 그대로라 **다른 항목에 부작용 없음** ✅. 경로 매칭 주석(`:150`)만 `/setting/ai-monitor`를 예시로 남겨 두었으나 세그먼트 경계 설명용이라 무해 |
| `settings_menu_desc.ai_monitor` | kr·en 양쪽에서 **제거됨**(고아 번역 없음) ✅ |
| 도움말 `page-guide` | 설정 항목 제거, `monitoring_ai_usage` 1건 유지. `page_guide` 고아 키 **0건**, 용어 3종(`ai_estimated_cost`·`ai_admin_key`·`ai_last_used_source`) kr·en 존재 ✅ |
| 탭 3개 구조 | `AI_MONITOR_TAB = {USAGE, INVENTORY, ACCOUNTS}` 상수화. 탭 상태는 기존대로 URL 쿼리(`aiTab`) — `[[fe-page-remount-on-navigate]]` 준수. 테스트가 `aiTab=accounts` 딥링크까지 단언(`AiUsagePage.test.tsx:343`) ✅ |
| 기존 훅·타입 소비 | `useAiMonitorAccounts/Usage/Inventory/Alerts/UsageCompact` + 뮤테이션 4종 시그니처 **무변경**, 소비처만 이동. 쿼리키 5종·무효화 묶음 그대로 ✅ |
| 홈 위젯 | `AiMonitorCostWidget` 무변경, `moreTo={PATH_MONITORING.aiUsage}` 유효. BE `HomeWidgetType.AI_MONITOR_COST`(4×6·unique·adminOnly) ↔ FE 메타 일치 유지 ✅ |
| i18n | `ai_monitor.*` **사용 121 / 정의 121 · 누락 0 · 고아 0 · kr↔en 완전 동일**. 루트 키 중복 0. 제거된 화면 키(`menu`·`eyebrow`·`title`·`description`·`go_dashboard`·`manage_accounts`)가 **남김없이 정리**됐고 신규(`tab.accounts` 등)가 양쪽에 있다 ✅ |

---

## 4. 신규 잔여 항목 (LOW 5)

### N-1 [FE] 빈 상태 분기가 "조회 실패"와 "진짜 0건"을 구분하지 않는다
`pages/monitoring/ai-usage/AiUsagePage.tsx:89,101`
```ts
const hasAccounts = (accounts?.length ?? 0) > 0;
if (!accountsLoading && !hasAccounts) { /* 등록 유도 화면 */ }
```
목록 조회가 **실패**하면 `accounts`가 `undefined` → `hasAccounts=false` → 화면 전체가 "등록된 계정이 없습니다 · 계정을 등록하세요"로 바뀐다.

- envelope 오류(403 등)는 `AiMonitorAccountsTab`의 `listError` 배너(`:277`)가 함께 떠서 **원인이 보인다** — 다만 "계정 없음"과 "권한 없음"이 동시에 떠 문구가 서로 어긋난다.
- 🔴 **axios reject 경로**(BE 다운·5xx·네트워크 단절)는 `ApiEnvelopeError`가 아니라 `listError`가 `null`이 되어 **배너 없이** "계정을 등록하세요"만 남는다. 서버 장애가 "아직 등록 안 함"으로 읽힌다.
- 수정 제안: 분기에 `isError`를 함께 본다(`!accountsLoading && !accountsError && !hasAccounts`). 조회 실패는 등록 유도가 아니라 오류 화면이어야 한다.
- 참고: 재배치 **전에도** 같은 판정식이었지만, 그때는 대시보드 위에 배너 한 줄이었고 지금은 화면 전체가 바뀌므로 오독의 폭이 커졌다.

### N-2 [계약서] §5-D의 메뉴 IA가 개편 전 상태로 남아 있다
`features/ai/ai-account-monitoring/contract_ai-account-monitoring.md:453`
> 메뉴 IA: **설정 > AI 모니터링(계정 등록)** + 모니터링 > AI 사용 현황 + 홈 위젯 1종 … `SettingsMenu.SETTINGS_ENTRIES`/`SideNav`에 실제 도달 경로를 만들 것

설계서 `devdesign_ai-account-monitoring.md` §8은 개편을 반영했고(2026-08-25 개편 배너 + "설정 메뉴 항목은 만들지 않는다") 코드도 그렇게 갔는데, **계약서만 옛 IA를 지시**한다. 다음에 이 문서로 착수하는 사람이 지운 메뉴를 되살릴 수 있다. §5-D를 설계 §8과 같게 고칠 것(고아 화면 금지 원칙 자체는 유지).

### N-3 [FE] 인벤토리 테스트 목의 `syncedAt`/`usageSince`가 아직 `null`
`src/__tests__/AiMonitorInventoryTab.test.tsx:66,67`
```ts
syncedAt: null, usageSince: null,
```
`AiMonInventoryDto`는 §0.1상 **키 생략** DTO다. FE 코드가 `!data?.syncedAt` truthiness라 통과하지만, L-4에서 세운 "목은 와이어 형태로" 규약과 어긋난 마지막 두 줄이다. 같은 파일의 `lastUsedAt`·`unusedDays`는 이미 키 생략으로 고쳐져 있어 **한 파일 안에서 두 방식이 섞여 있다** — 다음 사람이 어느 쪽이 맞는지 헷갈린다. 키 생략으로 통일할 것.

### N-4 [FE] `budgetUsd?: number | null`의 `| null`은 §0.1상 발생하지 않는 값
`types/ai-monitor.ts:184`(`TAiMonUsage`)·`:213`(`TAiMonUsageCompact`)
같은 DTO의 다른 옵셔널 필드는 전부 `?`만 붙었는데 이 둘만 `| null`이 남았다. 키 생략 DTO이므로 `null`은 오지 않는다. 소비처가 `?? null`로 정규화해 무해하지만, §0.1 표를 코드로 옮긴 결과물에 예외가 하나 남으면 "여긴 null도 오나?"라는 오해가 재생산된다.

### N-5 [FE / moveseye-ai] AI 어시스턴트 화면 카탈로그에 이 화면이 없다 — 이월 갭
`moveseye-ai/src/main/resources/docs/screens.json`(30개)에 `/monitoring/ai-usage` **미등록**(`/setting/ai`·`/ai-assistant` 등은 있다).
계약 §5-D의 "도움말 등록(`screens.json` + FE 도움말)" 중 **FE page-guide 쪽만 완료**된 상태다. FE 도움말이 정본이라 화면 자체는 자립하지만(`page-guide.ts` 주석: "AI 없이 완결되어야 한다"), AI 어시스턴트에게 "AI 비용 어디서 봐?"라고 물으면 안내하지 못한다.
재배치와 무관한 **이월 갭**이며 `moveseye-ai` 레포 작업이라 이 QA 범위 밖이다 — 별도 과제로 남길 것.

---

## 5. 담당별 조치 (전부 LOW — 배포 차단 아님)

- **FE**: N-1(빈 상태에 `isError` 분기) · N-3(목 통일) · N-4(`| null` 제거)
- **계약서**: N-2(§5-D를 설계 §8과 동기화)
- **별도 과제**: N-5(`moveseye-ai` screens.json) · 계약서가 이미 적어 둔 **moveseye-ai `/ai/usage`의 `periodKey` 패딩 불일치**(`2026-W5`) — 이번에 BE만 고쳐 두 서버 표기가 갈렸다는 사실이 문서에 남아 있다

## 6. 2차에서도 하지 않은 것

- 서버 기동·실호출·브라우저 렌더(→ `functional-qa`). **탭 전환·empty state·403 배너의 실제 렌더는 미검증**
- FE 테스트 스위트 실행(정적 범위 밖) — 목의 형태만 읽어서 판정했다
- 프로바이더 실응답(계약 §5-B) — Admin 키 미보유로 여전히 미실측

---
---

# M2 검증 (수신형 · Claude Code OTel) — 2026-08-25 · `integration-qa`

- 대상: 계약서 `# M2 — 수신형` 섹션 + §0.1 갱신분 ↔ BE `aimonitor/otel/**`·DTO·서비스 ↔ FE 갱신분
- 방식: 정적 대조만(서버 기동·실호출·OTLP 실송신 없음)

## 판정: **PASS** — HIGH 0 · MEDIUM 1 · LOW 7

**기능을 깨는 불일치는 없다.** 등록·재발급·수신현황·활동 지표·소스 필터·알람·에러코드가 3원에서
값 단위로 맞물린다. 발견 8건은 **문서(계약서·Swagger) 드리프트와 타입 과소·과대 선언**이며,
그중 하나(M2-F1)만 "계약서만 읽고 구현하면 틀린 결론에 도달한다"는 이유로 MEDIUM이다.

---

## 1. 발견 항목

| # | 항목 | 기대 | 실제 | 심각도 | 책임 주체 |
|---|---|---|---|---|---|
| M2-F1 | §3 에러 코드 표 | 신규 2종 등재 + CLAUDE_CODE는 유효값 | 2종 누락 + "CLAUDE_CODE는 거부"로 **반대로** 적혀 있음 | **MEDIUM** | 계약서 |
| M2-F2 | `issuedToken` 빈 값 표현 | `null`로 나감(계약 M2-1) | BE `@Schema`는 "생략된다"고 서술(같은 파일 안에서 모순) | LOW | BE |
| M2-F3 | Swagger `@Schema` 3곳 | M2 반영 | `provider` allowableValues에 CLAUDE_CODE 누락 · `kind` "M1은 POLL만" · SliceDto 설명에 `user` 누락 | LOW | BE |
| M2-F4 | `receivingUsers` 타입 | POLL이면 `null`(계약 M2-3) | FE `receivingUsers: number`(non-null 선언) | LOW | FE |
| M2-F5 | AccountsTab 주석 | 등록 응답도 `endpoint`를 준다 | `:493` 주석이 "등록 응답에는 endpoint가 없어 추정값"(stale) | LOW | FE |
| M2-F6 | 재발급 동의 | "재발급은 수집 재개 결정"이라 동의 필요 | FE가 `consentAcknowledged: true`를 서비스에 하드코딩 → BE 게이트 자동 통과 | LOW | FE + 계약서 |
| M2-F7 | §0.1 DTO 표 | 신규 DTO 등재 | `AiMonReceiveTokenDto` 미등재 | LOW | 계약서 |
| M2-F8 | M2-4 상태 코드 표 | exporter가 만날 수 있는 상태 전부 | **415**(Content-Type 불일치) 누락 | LOW | 계약서 |

---

### 🟡 M2-F1. §3 에러 코드 표가 M2를 반영하지 않았고, 한 줄은 **반대로** 적혀 있다

`features/ai/ai-account-monitoring/contract_ai-account-monitoring.md:379~392` (§3)

1. **신규 2종이 표에 없다** — `AI_MONITOR_CONSENT_REQUIRED`·`AI_MONITOR_WRONG_ACCOUNT_KIND`.
   둘 다 BE `ErrorCode.java:370,372`에 존재하고 FE `AI_MONITOR_ERROR_KEY:199,200`이 이미 소비한다.
   M2 섹션 본문(M2-1·M2-2)에는 언급돼 있으나 **정본 표에는 없어** 표만 보는 사람이 놓친다.
2. 🔴 **더 나쁜 한 줄** — 표가 아직 이렇게 적혀 있다:
   > `AI_MONITOR_PROVIDER_UNSUPPORTED` | 400 | `provider`가 `ANTHROPIC`/`OPENAI` 밖(**M2 값 `CLAUDE_CODE` 포함**)

   M1 시점에는 맞았지만 지금은 **정반대**다. `AiProvider`에 `CLAUDE_CODE`가 정식으로 들어갔고
   (`domain/AiProvider.java`), M2 수신 계정 등록은 **바로 그 값을 반드시 써야** 한다(M2-1).
   계약서만 읽고 구현하는 사람은 "CLAUDE_CODE를 보내면 거부당한다"고 읽어 **M2 등록 자체를
   불가능한 것으로 결론짓는다.** 누락보다 오도가 비싸서 MEDIUM으로 둔다.

- 수정 제안: §3 표에 2행 추가 + `PROVIDER_UNSUPPORTED` 설명을 "`ANTHROPIC`/`OPENAI`/`CLAUDE_CODE` 밖"으로.
- ℹ️ 기능 영향은 없다 — FE가 두 코드를 이미 i18n까지 붙여 뒀다(아래 §2 확인).

---

### 🟢 M2-F2. `issuedToken`이 "생략"인지 "null"인지가 BE 파일 안에서 엇갈린다

`dto/AiMonAccountDto.java`
```java
@Schema(description = "발급된 수신 토큰 원문. 🔴 등록·재발급 응답에서 단 1회만 실린다 — "
        + "그 외에는 항상 생략된다(다시 조회할 수 없다).")   // ← 여기는 "생략"
String issuedToken,
```
그런데 같은 파일 `withIssuedToken`의 javadoc은 정확하게 적어 두었다:
> `issuedToken`은 `NON_NULL`이 아니라 **이 DTO의 다른 필드와 같이** null로 직렬화되지만…

**실제는 후자가 맞다.** `AiMonAccountDto`에는 `@JsonInclude`가 없고(§0.1의 "`null`로 나온다" DTO),
계약 M2-1도 "그 외에는 항상 `null`"로 적었다. FE 타입도 `issuedToken: string | null`(`:98`)이라
**세 곳 중 `@Schema` 설명만 틀렸다.** Swagger를 보고 붙이는 사람이 `undefined` 검사를 짜게 된다.

---

### 🟢 M2-F3. Swagger `@Schema` 드리프트 3곳 (M1 문구가 남음)

| 위치 | 지금 | 실제 |
|---|---|---|
| `AiMonAccountDto.provider` | `allowableValues = {"ANTHROPIC", "OPENAI"}` | `CLAUDE_CODE` 누락 |
| `AiMonAccountDto.kind` | "수집 방식. **M1은 POLL만.**" | M2에서 `RECEIVE`가 정식 값 |
| `AiMonUsageSliceDto` 클래스 | "차원 필드(model/workspace/apiKeyId/day) 중 하나만" | `user` 누락(필드 `@Schema`에는 있다) |

세 곳 모두 **필드 자체는 정상**이고 설명 문자열만 M1 상태다. 코드 생성기나 Swagger UI로 계약을
읽는 경로에서만 문제가 된다. (`AiMonConnectionTestDto`의 클래스 javadoc도 "저장된 Admin 키로 …"만
서술하지만, 바로 아래 `receiving()` javadoc이 RECEIVE 의미를 정확히 적어 놔 오도되지 않는다.)

---

### 🟢 M2-F4. `receivingUsers`를 FE가 non-null로 선언했다

`types/ai-monitor.ts:181` → `receivingUsers: number;`
BE `AiMonConnectionTestDto`의 `Integer receivingUsers`는 `NON_NULL`이 **아닌** DTO라 POLL 계정에서
`null`로 나간다(계약 M2-3: "RECEIVE 전용. POLL이면 항상 null").

**지금은 무해하다** — 유일한 소비처가 `result.kind === "RECEIVE"` 분기 안이다
(`AiMonitorAccountsTab.tsx:431,453`). 하지만 타입이 "항상 숫자"라고 말하고 있어, 나중에 누가
분기 밖에서 `result.receivingUsers.toLocaleString()`을 쓰면 런타임에서 터진다.
`lastReceivedAt`은 같은 자리에서 `string | null`로 올바르게 선언돼 있어 **한 타입 안에서 두 규칙이
섞였다** — `number | null`로 맞출 것.

---

### 🟢 M2-F5. 같은 파일 안에서 `endpoint` 출처 설명이 서로 반대다

`pages/monitoring/ai-usage/AiMonitorAccountsTab.tsx`
- `:138` — "`endpoint`도 **등록 응답이 준다**(재발급과 같은 값) — 그게 정본이라 그대로 쓴다" ✅ (맞다)
- `:493` — "등록 응답에는 **endpoint가 없어 추정값**이다 — 재발급 응답만 정본이다(계약 M2-2)" ❌ (stale)

**코드 동작은 맞다** — `setEndpointVerified(!!created.endpoint)`(`:142`)라 BE가 주면 "정본"으로 표시하고,
BE는 실제로 준다(`AiMonAccountDto.of(...)`가 수신 계정에 `otlpEndpoint()`를 채운다). 주석만 옛 계약
(FE 요청 반영 전) 상태다. 남겨 두면 다음 사람이 `guessOtlpEndpoint()` 폴백을 정상 경로로 오해한다.

---

### 🟢 M2-F6. 재발급의 `consentAcknowledged`가 서비스에 하드코딩돼 있다

`services/ai-monitor.api.ts:133~136`
```ts
const reissueToken = (id: number): Promise<TAiMonReceiveToken> =>
  API.post(`${baseUrl}/accounts/${id}/token`, { consentAcknowledged: true })
```
BE는 재발급에도 `requireConsent`를 건다(`AiMonitorAccountService.reissueToken`). 이유는 계약 M2-2가
적은 대로 **"재발급은 사실상 수집 재개 결정"**이기 때문이다. 그런데 FE가 `true`를 고정으로 실어
보내므로 **그 게이트는 화면에서 아무것도 확인하지 않는다.**

화면의 Popconfirm은 무효화만 경고한다(문구 확인함):
> 기존 토큰이 즉시 무효가 되어, 지금 설정된 모든 개발자 PC가 전송에 실패합니다. 새 스니펫을 다시 배포해야 합니다.

즉 관리자는 "배포가 깨진다"는 경고만 보고 **수집 고지는 다시 보지 않는다.** 등록 때는
`AiMonitorConsentNotice` 체크박스가 `consentAcknowledged`와 1:1인데(모달 `:119`, `okDisabled` 게이트),
재발급 경로만 그 대칭이 끊겼다.

- 판단: **결함이라기보다 계약의 공백**이다 — 계약 M2-2는 "필수"라고만 적고 화면이 무엇을 보여줘야
  하는지 규정하지 않았다. 다만 BE가 굳이 게이트를 건 의도가 FE에서 소멸했다는 사실은 남겨 둔다.
- 선택지: (a) Popconfirm 문구에 수집 계속 사실을 한 줄 더한다 (b) 계약 M2-2에 "재발급은 무효화 경고로
  갈음한다"를 명시해 의도를 맞춘다. **둘 중 하나는 해야 한다** — 지금은 BE 주석과 FE 동작이 다른 말을 한다.

---

### 🟢 M2-F7 · M2-F8 (계약서 보강)

- **M2-F7** — §0.1의 DTO 대응표에 **`AiMonReceiveTokenDto`가 없다**. 이 DTO는 `@JsonInclude`가 없어
  "`null`로 나온다" 쪽이고, 네 필드가 항상 채워져 실무 영향은 0이다. 다만 §0.1이 "이 표가 정본"이라고
  선언한 표라 신규 DTO가 빠지면 표의 권위가 약해진다(1차 QA L-4가 만든 장치다).
- **M2-F8** — M2-4의 상태 코드 표에 **415가 없다.** 컨트롤러가 `consumes = APPLICATION_JSON_VALUE`라
  개발자가 `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`로 설정하면 415가 나가고 exporter는 영구 실패로
  버린다. 계약이 "http/json 전용"이라고 서술은 했으나 **표에 없어** 관리자가 415 로그를 봤을 때
  "우리 표에 없는 코드"가 된다. 한 행 추가로 끝난다.

---

## 2. PASS 항목 (교차 확인 완료)

### 2-1. 수신 계정 등록 · 재발급 · 수신 현황

| 검증 축 | 결과 |
|---|---|
| `provider`↔`kind` 짝 검증 | BE `receive == provider.isPollable()` 한 줄로 네 조합 전부 정확 — POLL+ANTHROPIC ✅ / RECEIVE+CLAUDE_CODE ✅ / POLL+CLAUDE_CODE ❌ / RECEIVE+ANTHROPIC ❌. FE는 **kind에서 provider를 자동으로 정해** 어긋난 조합을 만들 수 없게 막았다(모달 `:91~93`) — 서버 검증에 의존하지 않는 이중 방어 |
| `consentAcknowledged` | BE `requireConsent`가 `Boolean.TRUE.equals` — false·누락·null 전부 거부 ✅. FE는 수신 등록에서만 실어 보내고(`:119`) 체크 전에는 OK 버튼을 잠근다(`okDisabled`) ✅ |
| `credential` 무시 | BE는 receive 분기에서 `req.getCredential()`을 아예 읽지 않는다 ✅. FE도 `receiving ? {} : {credential}`로 안 보낸다(모달 `:118`) ✅ |
| `issuedToken` 1회 | `of()`가 항상 null → `withIssuedToken()`만 채운다. 목록·상세는 그 메서드를 안 거쳐 **누출 경로 0** ✅. FE는 mutation 결과에서 즉시 붙잡아 모달로 띄운다(`:141~147`) — 무효화 이후에 읽지 않는다 ✅ |
| `endpoint` | 등록·재발급이 **같은 `otlpEndpoint()`** 를 쓴다 ✅. 수신 계정에만 실리고 폴링은 null(`receive ? otlpEndpoint : null`) ✅. `/v1/metrics` 미포함 ✅. FE는 응답값 우선, 없을 때만 `guessOtlpEndpoint()` ✅ |
| `hasCredential` | 수신 계정은 `credentialMasked`가 항상 null이고 `hasCredential`로 판단 — BE `of()` ✅, FE 타입 `hasCredential: boolean` ✅, 화면이 실제로 그 축으로 그린다(`:217~219`) ✅ |
| 재발급 경로·시맨틱 | `POST /ai-monitor/accounts/{id}/token`(컨트롤러 `:116`) ↔ FE `${baseUrl}/accounts/${id}/token` ✅. 폴링 계정 호출은 `WRONG_ACCOUNT_KIND` ✅, FE는 버튼 자체를 `kind === "RECEIVE"`에서만 그린다 ✅ |
| 수신 현황 | `receiving()` 팩토리 — `ok = lastReceivedAt != null` · `detail = "users=N"` / `"아직 수신 없음"` · `reason = "NO_TELEMETRY_YET"` — **계약 M2-3 예시와 문자열까지 일치** ✅. FE가 `ok:false`를 **error가 아니라 info**로 그리고 별도 문구를 쓴다(`waiting` 분기) — 계약의 🔴 지시 그대로 ✅ |
| `lastOkAt` 갱신 | OTLP 적재 성공 시 `AiMonAccount::markOk`(`AiMonitorOtelService:141`) — 수신 계정의 `state`가 PENDING→OK로 살아나고 `lastReceivedAt`·`RECEIVE_SILENT`의 근거가 채워진다 ✅ (이게 없으면 수신 계정이 영원히 PENDING이었다) |
| RECEIVER 인벤토리 | 적재 시 `inventoryRepository.upsert(..., TYPE_RECEIVER, user, ...)`(`:136`) ✅, 상수값 `"RECEIVER"` ↔ FE `TAiMonInventoryItemType`에 `"RECEIVER"` ✅, i18n `inventory.item_type.receiver` 존재 ✅ |

### 2-2. OTLP 스니펫 ↔ BE 수신 (env 키·프로토콜·경로·헤더)

| 항목 | FE `claudeCodeTelemetry.ts` | BE / 계약 | 판정 |
|---|---|---|---|
| env 키 5종 | `CLAUDE_CODE_ENABLE_TELEMETRY` · `OTEL_METRICS_EXPORTER` · `OTEL_EXPORTER_OTLP_PROTOCOL` · `OTEL_EXPORTER_OTLP_ENDPOINT` · `OTEL_EXPORTER_OTLP_HEADERS` | 계약 M2-5와 **철자까지 동일** | ✅ |
| 값 | `1` · `otlp` · `http/json` | 컨트롤러 `consumes = application/json` | ✅ |
| endpoint | `normalizeOtlpEndpoint()` — 끝 `/` 제거 + **이미 붙은 `/v1/metrics`를 떼어 낸다** | `@RequestMapping("/ai-monitor/otlp")` + `@PostMapping("/v1/metrics")` | ✅ 맞물린다 |
| 헤더 형식 | `Authorization=Bearer <token>` | `bearer()`가 `regionMatches(true, …)`로 **대소문자 무관** 파싱 | ✅ |
| 🔎 토큰 문자셋 | — | `Base64.getUrlEncoder().withoutPadding()` | ✅ **패딩을 뺀 것이 중요하다** — `=`가 남았다면 `OTEL_EXPORTER_OTLP_HEADERS`의 `key=value` 파싱이 토큰 중간에서 잘렸을 것이다 |
| 중복 경로 관용 | FE는 기대지 않고 정본 값을 넣는다(계약 ℹ️ 준수) | `{"/v1/metrics", "/v1/metrics/v1/metrics"}` + WARN 로그, 세 겹은 404 | ✅ |
| 진단 표시 | `otlpReceiveUrl()`로 **실제 도착 주소**를 별도 표기(스니펫에는 미포함) | — | ✅ 계약 위반 없음 |
| localhost 함정 | `isUnreachableEndpoint()`가 `localhost`/`127.0.0.1`/`::1`을 잡아 경고 | 계약 잔여 이슈 5(`public-base-url` 기본값) | ✅ 계약이 "화면이 알아채게 하라"고 한 것을 실제로 구현 |
| 원문 수집 옵션 | `CLAUDE_CODE_CONTENT_ENV_KEYS` 6종을 **넣지 않을 목록으로 명시** | 계약 M2-5 🔴 · BE에 로그 수신 EP 없음 | ✅ |
| 수집 고지 항목 | `COLLECTED_ITEM_KEYS` 6개 = 이메일/토큰/비용/세션/활동시간/라인 | 계약 M2-5의 수집 값 목록과 1:1 | ✅ |
| 인증 우회 경로 | — | `SecurityConfig:74` → `/ai-monitor/otlp/**` **permitAll** + `@LicenseExempt` + `@VisitorIdCheck` 미부착 | ✅ CLI가 쿠키 없이 도달할 수 있다(빠졌다면 M2 전체가 401이었다) |

### 2-3. 활동 지표 4필드 — §0.1 규칙 ↔ FE

| 규칙(§0.1 · M2-6) | BE | FE | 판정 |
|---|---|---|---|
| `byUser`는 **항상 존재**(0 포함) | `user()` 팩토리만 값 전달, SQL이 `COALESCE(SUM(...), 0)` 4개 → **null 불가** | — | ✅ |
| 타 슬라이스는 **키 생략** | `model()`·`workspace()`·`apiKey()`·`day()` 팩토리가 4필드에 `null` + DTO에 `NON_NULL` | — | ✅ |
| FE 타입 | — | `sessions?`·`activeTimeSeconds?`·`linesAdded?`·`linesRemoved?` + **"옵셔널은 '다른 슬라이스엔 없다'는 뜻이지 byUser에서 없을 수 있다가 아니다"** 주석 | ✅ |
| 렌더 가드 | — | `dimension === "user"`일 때만 4열을 만든다(`AiUsageSliceTable:117`) — "모델별 세션 수"가 만들어질 수 없다 | ✅ |
| 폴링 행의 0 | `user_key = ''` 조각이 0으로 나온다 | `?? 0`으로 **0을 그대로 표시**(— 로 가리지 않는다) + 빈 사용자에 `unattributed_user` 전용 문구 | ✅ 계약의 "0은 사실이다"를 화면이 지켰다 |
| 단위 | `activeTimeSeconds` = 초 원 단위 | `formatDuration(value ?? 0)`으로 사람이 읽는 단위 변환(원값 훼손 없음) | ✅ |

### 2-4. `source` 필터 · 알람 2종 · 에러코드 소비

| 검증 축 | 결과 |
|---|---|
| `source` 파라미터 | 값 `POLL`/`OTEL` — BE `AiMonUsage.SOURCE_POLL="POLL"`·`SOURCE_OTEL="OTEL"` ↔ FE `TAiMonSource`·`AI_MONITOR_SOURCES` 동일 ✅ |
| 기본값·오타 처리 | BE `normalizeSource`가 **알 수 없는 값을 던지지 않고 null(전부)로 접는다** — `period`(거부)와 정반대인 계약 규정 그대로 ✅ |
| FE 전송 | `...(source ? { source } : {})` — 전체일 때 키를 안 보낸다 ✅. 쿼리키에 source 포함(`useAiMonitor:55`)이라 토글이 캐시를 덮지 않는다 ✅ |
| 응답 `source` | BE DTO 필드 존재(`AiMonUsageDto:55`, `NON_NULL`) ↔ FE `source?: TAiMonSource` ✅ |
| URL 상태 | `aiSource` 쿼리 파라미터 + `AI_MONITOR_SOURCES.includes` 검증 후 폴백 — 리마운트에 안 날아간다 ✅ |
| 알람 2종 | BE `CODE_RECEIVE_SILENT`/`CODE_RECEIVER_SILENT` + severity `critical`/`warning` ↔ 계약 표 ✅ ↔ FE `AI_MONITOR_ALERT_TITLE_KEY`(`:114,115`) ✅. `TAiMonAlertCode` 유니온에도 둘 다 있다 ✅ |
| 알람 억제 규칙 | 계정 전체 무수신이면 `return`으로 개별 알람을 **내지 않는다** ✅ · `lastOk == null`(한 번도 수신 없음)이면 아무 알람도 없다 ✅ — 계약의 🔴 두 조항이 코드로 확인됨 |
| 알람 필드 | 5개 규칙 전부 `accountId`·`accountName`·`value`를 채운다 → FE의 non-null 선언 유효 ✅ |
| 에러코드 소비 | `AI_MONITOR_CONSENT_REQUIRED`·`AI_MONITOR_WRONG_ACCOUNT_KIND` 둘 다 `AI_MONITOR_ERROR_KEY`에 매핑(`:199,200`) + i18n kr/en 존재 ✅. 1차 QA H-1 수정 덕에 **조회·변경성 양쪽 경로에서 실제로 잡힌다**(`ApiEnvelopeError` 판정) ✅ |

### 2-5. i18n

`ai_monitor.*` **사용 196 / 정의 196 · 누락 0 · 고아 0 · kr↔en 완전 동일**(M1 121 → M2 196, +75).
동적 조립 키(`source.*` 3 · `kind.*` 4 · `dimension.user` · `alert.receive_silent`/`receiver_silent` ·
`inventory.item_type.receiver` · `provider_hint.claude_code` · 고지문 `consent.collected.*` 6 ·
`consent.not_collected.*` 4)까지 포함해 전수 확인했다.

---

## 3. 담당별 조치

- **계약서**: M2-F1(§3 표 2행 추가 + `PROVIDER_UNSUPPORTED` 설명 정정) · M2-F7(§0.1에 `AiMonReceiveTokenDto`) · M2-F8(415 한 행) · M2-F6의 (b)안을 택한다면 M2-2 보강
- **BE**: M2-F2(`issuedToken` `@Schema` "생략"→"null") · M2-F3(`@Schema` 3곳 M1 문구 정리)
- **FE**: M2-F4(`receivingUsers: number | null`) · M2-F5(`:493` stale 주석) · M2-F6의 (a)안을 택한다면 Popconfirm 문구

## 4. M2에서 하지 않은 것 (정적 범위 밖)

- 🔴 **OTLP 실 송신 미검증** — 계약 M2 잔여 이슈 1이 그대로 남는다. 실제 Claude Code가 보내는
  페이로드의 (a) `user.email` 위치, (b) `aggregationTemporality`의 표현·실제 값, (c) `type` 철자는
  **정적으로 확인할 수 없다.** `OtlpMetricsParser`가 이 셋을 어떻게 읽든 픽스처와만 맞물린 상태다.
- delta 재전송 중복(M2-9) · 커서 리셋 동작 — 런타임·시간 축이라 대조 불가
- 토큰 발급 후 실제 401/200 왕복, 라이선스 만료 503, 1MB 초과 413 — `functional-qa` 몫
- 비용 이중 계상(폴링+수신 동시)의 실제 숫자 — 데이터가 있어야 보인다
