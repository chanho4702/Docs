# APM P4 종단 런타임 QA — RUM(브라우저 실사용자) · K8s 컨텍스트

> ✅ **1차에서 낸 D1(HIGH)·D2·D4는 `ace42d5`(BE)·`17ebfbc`(FE)로 수정됐고, 15:12에 재빌드해 런타임 재검증 전건 통과했다 —
> [§7 재검증](#7-수정-재검증-2026-09-14-1512)**. D3·D5·D6은 계약 문구로 정리됐다. 아래 §0~§6은 **1차(10:05~11:30) 시점 기록**이며 그대로 둔다.

- 일시: 2026-09-14 10:05 ~ 11:30 (KST)
- 대상 BE: 사본 **`:3001`** — `moveseye-be-spring` **`6af7c46`** 시점의 **워킹트리 그대로** `bootJar`
  (pid **8144**, dev 프로필, DB **`dmove_apm`@5433** 도커). Flyway `Current version 56 → v57 (apm rum kubernetes)` 실측,
  `Started MoveseyeApplication in 18.535 seconds`
- 대상 FE: Vite **`:5174`**(pid **17196**) — `moveseyee_fe` **`4599f21`**, `VITE_API_URL=http://localhost:3001`
- 계약: `_workspace/features/apm/core/contract_apm-p4.md` (§1~§7 + 🔄 FE 요청사항 F1~F4)
- 판정 원칙: **API 응답 + DB 실측 + 실 브라우저 CORS/DOM 어서션**. 🔴 **스크린샷 0장**
- 🔴 사용자 자원 무접촉: **`:3000`은 QA 시작 시점에 이미 내려가 있었고 내가 띄우지도 내리지도 않았다.**
  dev DB `dmove`·워크트리 `moveseye-be-spring-p4`/`moveseyee_fe-p4` — 열지 않았다. **제품 소스 수정 0**
- 일회성 산출물: `%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\p4\`

## ⚠️ 빌드 기준 고지 (지시대로 `git stash` 없이)

BE·FE 양쪽 워킹트리에 **타 세션 미커밋 15파일씩**이 그대로 있는 상태로 빌드·구동했다.
- BE: `host/cpu`·`host/memory`·`host/network`의 증분 차트 쿼리 + `common/response/IncrementalChart*` (신규 3, 수정 12)
- FE: `hooks/chart/*`·`services/host-monitoring.api.ts`·`utils/index.ts` 등 (신규 6, 수정 9)

APM 패키지와 겹치지 않아 이 QA의 판정에는 영향이 없다고 본다. **`git stash` 미사용, 두 레포 모두 QA 종료 시점 `git status` 15파일 그대로**(HEAD도 불변).

---

## 0. 요약표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| **0. 기동** | | | |
| 0-1 | V57 적용 | **PASS** | 기동 로그 83~85행 `Current version … 56` → `Migrating … "57 - apm rum kubernetes"` → `Successfully applied 1 migration … now at version v57` |
| 0-2 | RUM 스키마 8종 + 파티션 | **PASS** | `apm_rum_page_5m`·`_session_5m`·`_receipt`·`_timing_5m`·`_error_5m`·`_span`(각 일 파티션 4개) + `apm_rum_js_error_group` 생성. `apm_receive_token`에 `allowed_origins text[]`·`rum_rps`·`rum_body_bytes`·`rum_daily_limit` + CHECK 3개 |
| 0-3 | `apm_hist_bounds` RUM 격자 | **PASS** | id 11 `rum_ms`(21 bounds, 200·500·800·1800·2500·3000·4000 포함) · id 12 `rum_score`(11 bounds, 0.1·0.25 포함) |
| **1. RUM 토큰 관리 API (§1·§4)** | | | |
| 1-1 | 발급 — `Issued{token,plainToken,endpoint:"/apm/rum"}` + `Cache-Control: no-store` | **PASS** | 200, 응답 헤더 `Cache-Control: no-store`, `kind:"RUM"`·`scopes:["rum"]` 고정 |
| 1-2 | 목록에 원문·해시 없음 | **PASS** | `RumToken` 11필드만(`plainToken`/`tokenHash` 문자열 0건) |
| 1-3 | Origin 검증 12종 전건 거절 | **PASS** | `*` · `https://*.example.com` · path · query · fragment · userinfo · `"null"` · **대문자** · 공백 결합 · `ftp://` · 빈 문자열 · scheme 없음 → 전부 `200 + code:400 + APM_RUM_INVALID` |
| 1-4 | 허용 목록 상한 32 | **PASS** | 32개 → 200(저장 32) · 33개 → 400 |
| 1-5 | rps/bodyBytes/dailyLimit 범위 | **PASS** | rps 0·1001 / body 1023·8388609 / daily 0·10000001 → 400. 경계값 1·1000 / 1024 / 1 → 200 |
| 1-6 | label 필수(null·빈·공백) | **PASS** | 셋 다 `토큰 라벨은 1~128자여야 합니다.` |
| 1-7 | kind/scope 주입 무시 | **PASS** | `{"kind":"INGEST","scopes":["ingest","rum"]}` 보내도 응답은 `RUM`/`["rum"]` |
| 1-8 | 회수(멱등) · collection DELETE 호환 | **PASS** | `DELETE /tokens/{id}` 2회 → 둘 다 `{revoked:true,tokenId}` · `DELETE /tokens?tokenId=10`도 동일 |
| 1-9 | 없는 토큰·비 RUM 토큰 거절 | **PASS** | 회수·origins·스니펫 전부 `APM_TOKEN_NOT_FOUND` (Collector 토큰 id=1 포함) |
| 1-10 | `PUT /apm/rum/origins` 전체 교체 | **PASS** | 200 + 변경된 `RumToken` 반환. 잘못된 origin 포함 시 400(부분 저장 없음) |
| 1-11 | `lastSeenAt` | **PASS** | 발급 직후 `null` → 첫 수신 성공 후 `2026-09-14T01:29:26.735Z` |
| 1-12 | 🔴 중복 origin 처리 | **관찰(D3)** | 같은 origin 2개를 보내면 **거절이 아니라 조용히 1개로 dedup**된다(계약 §1은 "중복 … 허용하지 않는다") |
| 1-13 | 🔴 회수된 토큰에 origins PUT | **관찰(D2)** | 200으로 통과하고 `allowedOrigins`가 실제로 바뀐다(`revokedAt`은 유지). 수신은 여전히 403이라 보안 영향은 없다 |
| **2. 스니펫 (§5)** | | | |
| 2-1 | DTO 9필드 전량 | **PASS** | `tokenId/endpoint/tokenPlaceholder/installCommand/code/propagateTraceHeaderCorsUrls/cspConnectSrc/notices/references` |
| 2-2 | `Cache-Control: no-store` | **PASS** | 응답 헤더 실측 |
| 2-3 | 원문 재노출 없음 | **PASS** | `code`에 `PASTE_ONCE_ISSUED_RUM_TOKEN` 자리표시만, 실제 발급 원문 문자열 0건 |
| 2-4 | endpoint = 설치 주소 미설정 시 예시 | **PASS** | `https://moveseye.example.com/apm/rum` (`APM_ENDPOINT_HINT` 미설정) |
| 2-5 | `cspConnectSrc`는 MovesEye origin만 (R25) | **PASS** | `["https://moveseye.example.com"]`, 백엔드 origin은 notice로 안내 |
| 2-6 | `propagateTraceHeaderCorsUrls` 기본 빈 목록 | **PASS** | `[]` |
| 2-7 | notices 7종 (SDK 2.x·동의·CSP·전파·origin 목록·세션) | **PASS** | 첫 줄 *"이 스니펫은 OpenTelemetry JS SDK 2.x API를 사용합니다. 1.x와 혼용하지 말고 …"* |
| 2-8 | references 3종 실 URL | **PASS** | otel-browser / web-vitals-guide(web.dev/articles/vitals) / web-vitals-library |
| 2-9 | 잘못된 tokenId / 누락 | **PASS** | 없는 id·Collector 토큰 → `APM_TOKEN_NOT_FOUND` · tokenId 누락 → `INVALID_DATA`(P3 D1 전역 핸들러 경유) |
| 2-10 | 🔴 스니펫이 `unhandledrejection`을 잡지 않음 | **관찰(D4)** | `window.addEventListener('error', …)`만 있다. Promise 거부 오류는 수집되지 않는다 |
| **3. 수신 보안 — OPTIONS preflight (§2)** | | | |
| 3-1 | 허용 origin → 204 + CORS 전량 | **PASS** | `Allow-Origin: http://localhost:5555`(정확 일치) · `Allow-Methods: POST` · `Allow-Headers: Authorization, Content-Type, Content-Encoding, traceparent, tracestate` · `Expose-Headers: Retry-After` · `Max-Age: 60` · `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` · **`Allow-Credentials` 없음** |
| 3-2 | 🔴 열거 방지 — 6종이 **완전히 동일한 403** | **PASS** | 미등록 origin / 없는 tokenId / **회수된 토큰** / 비 RUM 토큰 / Origin 헤더 없음 / tokenId 없음 → 전부 `403 {"error":"RUM request rejected"}`, CORS 허용 헤더 **0개**, `Vary`만 동일 |
| 3-3 | 대소문자·기본 포트 미동치화 | **PASS** | `http://LOCALHOST:5555` → 403 · `https://app.example.com:443` → 403 (등록은 `https://app.example.com`) |
| 3-4 | OPTIONS는 401을 내지 않는다 | **PASS** | 전 케이스 204/403만 |
| 3-5 | 전역 100 rps (R12) | **PASS** | 140회 연속 OPTIONS(0.479s) → **204 정확히 100 / 429 정확히 40**, 첫 429 인덱스 **100** |
| **4. 수신 보안 — POST (§2)** | | | |
| 4-1 | 정상 → 200 `{}` + CORS + `Vary: Origin` | **PASS** | 본문 `{}` |
| 4-2 | Origin 없음 / 미등록 origin | **PASS** | 둘 다 403, CORS 헤더 없음 |
| 4-3 | Bearer 실패만 401 | **PASS** | 잘못된 Bearer·Authorization 없음 → **401**, 그리고 **허용 origin이면 401에도 CORS가 붙는다**(exporter가 상태를 읽게) |
| 4-4 | tokenId ↔ Bearer 불일치 | **PASS** | 403(동일 본문) |
| 4-5 | 회수된 토큰 POST | **PASS** | 403 |
| 4-6 | 깨진 JSON → 400 | **PASS** | `{"resourceSpans":[` → 400 + CORS |
| 4-7 | Content-Type 오류 → 415 | **PASS** | `application/x-protobuf` · **`application/x-www-form-urlencoded`**(getParameter 함정, R11) 둘 다 415 |
| 4-8 | Content-Encoding `br` → 415 / `gzip` → 200 | **PASS** | |
| 4-9 | bodyBytes 초과 → 413 | **PASS** | 토큰 8(2048B)에 8,004B → 413 |
| 4-10 | 배치 4096 상한 → 413 | **PASS** | bodyBytes 8MB 토큰으로 **4096 스팬 200 / 4097 스팬 413** (본문 크기가 아닌 개수 상한임을 분리 확인) |
| 4-11 | gzip 회선 상한 min(bodyBytes, 2MB) | **PASS** | 해제 후 2,088,167B(gz 24,931B) → 413 |
| 4-12 | rps 상한 + `Retry-After: 1` | **PASS** | rps=2 토큰에 6연속 → `200,200,429,429,429,429`, 전 429에 `Retry-After: 1`. 1.2초 뒤 재개 확인(0.2초 간격 4회 → `200,200,429,429`) — **초 경계 2배 허용 없음** |
| 4-13 | dailyLimit + 다음 UTC 자정까지 Retry-After | **PASS** | daily=3 → 3건 수용 후 429. `Retry-After=81783` vs 계산값 81782 (**차 1초**) |
| 4-14 | 🔴 **500 발생 0** | **PASS** | 전 시나리오에서 HTTP 500 0건. BE 로그 `Unhandled exception`/`status=500` **0건**, `apm/rum` 경로가 포함된 ERROR 라인 **0건** |
| 4-15 | 미확인 tokenId를 `token_id=0`으로 기록하지 않음 (R24) | **PASS** | `apm_ingest_drop_stat`에 token_id=0 행 0건 |
| 4-16 | drop stat `signal=RUM` 사유 | **PASS** | `NOT_ALLOWLISTED`·`RUM_PII_REMOVED`·`RUM_ORIGIN_DENIED`·`RUM_RATE_LIMITED`·`RUM_BODY_TOO_LARGE`·`RUM_INVALID_PAYLOAD` 실관측. `RUM_UNAVAILABLE`은 **미검증**(§6) |
| **5. 실 브라우저 E2E (§7-1)** | | | |
| 5-1 | 🔴 **허용 origin 실 브라우저 수집** | **PASS** | headless Chrome 151, `http://localhost:5555`에서 실 preflight 통과 → traces·metrics 3요청 전부 **200 `{}`**. 실 `web-vitals@4`(jsDelivr) 값 TTFB **315.5ms** · FCP **428ms** 전송, 탭 종료 시 LCP·CLS도 도달 |
| 5-2 | 🔴 **미등록 origin은 브라우저가 막는다** | **PASS** | `http://localhost:5556` → *"Response to preflight request doesn't pass access control check"* + `net::ERR_FAILED` ×3, **BE 도달 0건** |
| 5-3 | CSP `connect-src 'self'` | **PASS** | 같은 허용 origin이라도 CSP가 없으면 못 보낸다: *"Connecting to '…/apm/rum/v1/traces' violates … connect-src 'self'"* → `cspConnectSrc` 안내가 실제로 필요함을 실증 |
| 5-4 | 실 브라우저 데이터 정합 | **PASS** | 경로 `/shop/cart/9911` → **`/shop/cart/{id}`**, PV 1 · 세션 1 · JS 오류 1, 리소스 3건 33,261B(`big.png` 30,308 + `web-vitals.iife.js` 2,953), navigation 11구간 실측값 |
| 5-5 | 🔴 브라우저 fetch → 백엔드 trace 연결 | **PASS** | 브라우저가 만든 실 traceId `adab8718…`로 서버 스팬 주입 → `GET /apm/traces/{id}`가 `Browser documentLoad → Browser fetch → qa-rum-backend SERVER` 3단 트리 반환. RUM 상세 `traceIds`에 그 traceId 등장 |
| **6. 수집·집계·조회 (§3·§4)** | | | |
| 6-1 | 경로 정규화 | **PASS** | `?token=secret&pw=1` 제거 · `/orders/123`·`/456`·`/789` → **한 그룹** `/orders/{id}` · UUID·percent-encoded 이메일·32자 hex → `/users/{id}/mail/{id}/x/{id}` |
| 6-2 | PV·세션 합 | **PASS** | Chrome/Windows/KR 4 + Firefox/macOS/JP 1 = **pv 5**, 세션 2+1 = **3**(`DISTINCT_PER_PAGE_DIMENSION_5M_SUM`) |
| 6-3 | 🔴 Web Vitals 분류 — 손검증 일치 | **PASS** | LCP `[1200,1500,2200,3500]` → **good 3 / needs 1 / poor 0** · INP `[150,180,220,600]` → 2/1/1 · CLS `[0.05,0.08,0.12,0.3]` → 2/1/1 · TTFB `[300,700,900,2000]` → 2/1/1 · FCP `[900,1500,2000,3500]` → 2/1/1. **전부 정수**(임계가 정확한 버킷 경계라 재버킷 소수 없음) |
| 6-4 | p75 — 버킷 선형보간 손검증 | **PASS** | 4표본 LCP p75 **2500.0**(3번째 표본이 (1800,2500] 버킷) · INP **250** · CLS **0.15** · TTFB **1000** · FCP **2500**. 5표본(브라우저 428 추가) LCP p75 **2325** = 1800+0.75×700 — 계산 일치 |
| 6-5 | `goodThreshold`/`poorThreshold`/`unit` | **PASS** | LCP 2500/4000 · INP 200/500 · CLS 0.1/0.25(unit `score`) · TTFB 800/1800 · FCP 1800/3000 |
| 6-6 | breakdown 3축 | **PASS** | browser `Unknown 8099 / Chrome 5 / Firefox 1` · os `Unknown/Windows/macOS` · geo `null 8100 / KR 5 / JP 1`. **CF-IPCountry=KR**과 **Accept-Language=ja-JP→JP** 둘 다 실측, 힌트 없으면 `null` |
| 6-7 | series 버킷 | **PASS** | `{10:10 pv1 s1}`, `{10:15 pv8104 s4}` — pv 합 8104 = 4096+4000+5+1+1+1 손검증 일치 |
| 6-8 | 상세 timings (평균) | **PASS** | navigation 11구간 + resource 3건. `/static/app.js` start 120 / dur 80 / 45,000B, `/static/vendor.js` 60/200/120,000B — 입력값과 정확히 일치. `timingMode:"AGGREGATE_AVERAGE"` |
| 6-9 | CLIENT 스팬 이름 = 정규화 요청 대상 (R15) | **PASS** | `fetch GET /api/orders/{id}` (호출 페이지가 아님), `?secret=x` 제거 |
| 6-10 | JS 오류 그룹 | **PASS** | 2그룹(TypeError/ReferenceError), `count`는 조회 창 기준, `firstSeenAt`/`lastSeenAt` ISO UTC |
| 6-11 | 🔴 재전송 멱등(영수증) | **PASS** | 동일 본문 3회 전송 → PV **1** |
| 6-12 | 알 수 없는 groupId / 잘못된 형식 | **PASS** | 64자 0 → `page:null` + 빈 배열 + `samples:0`·good/needs/poor **모두 null** · `not-a-hash` → `code:400 APM_RUM_INVALID` |
| 6-13 | `exceedsTopBound` | **PASS** | LCP 90,000·95,000ms(> top bound 60,000) → `exceedsTopBound:true`, poor 2 |
| 6-14 | `rebucketed` | **PASS** | DELTA 히스토그램(bounds 120/300) 수신 → `rebucketed:true`, INP p75 325 |
| 6-15 | CUMULATIVE 히스토그램 폐기 | **PASS** | `200 {"partialSuccess":{"rejectedDataPoints":"1", …}}` — **int64 문자열**, 그 페이지 그룹 생성 안 됨 |
| 6-16 | traceparent ↔ traceId 충돌 (R14) | **PASS** | 해당 스팬만 `rejectedSpans:"1"`, 같은 배치의 documentLoad는 적재 |
| 6-17 | 시각 범위 (과거 30일~미래 5분) | **PASS** | 과거 40일·미래 10분 → 스팬 단위 거절 / 미래 2분 → 수용 |
| 6-18 | zero/짧은 ID · 빈 본문 | **PASS** | zero traceId·zero spanId·`"ab"` → 400 · `{}` → 400 · 빈 spans 배열 → 200 `{}` |
| **7. PII 규약 (§1)** | | | |
| 7-1 | 🔴 스팬 저장 속성 허용목록 | **PASS** | `apm_rum_span.attrs`에 **`url.path`·`enduser.id`(해시)·`rum.browser`·`traceparent`·`http.request.method`·`http.response.status_code`만**. 주입한 `authorization`·`cookie`·`baggage`·`user_agent.original` **전부 소거** |
| 7-2 | `enduser.id` 토큰별 SHA-256 | **PASS** | `alice@example.com` → `cfc9d5f7…`(64 hex), `bob@` → 다른 해시. 원문 0건 |
| 7-3 | `session.id` 해시 | **PASS** | `apm_rum_session_5m.session_hash`에 `sess-A1` 원문 없음 |
| 7-4 | 🔴 오류 **메시지 첫 줄 미저장** + 스택 마스킹 | **PASS** | 입력 `"TypeError: cannot read x of undefined for alice@example.com\n at render (https://app.test/orders/123?token=SECRET:10:5) …"` → 저장 `"at render (/orders/{id})\nat mount (/static/app.js:99:1)\n"` — **메시지·이메일·호스트·query 전부 제거, path만 정규화 보존** |
| 7-5 | 스택 4KB 절단 | **PASS** | 400 프레임(≈24KB) 입력 → `octet_length(sample_stack)` = **정확히 4096** |
| 7-6 | 실 브라우저 스택도 동일 | **PASS** | Chrome `TypeError` 실 스택 → `"at /rum.html\n"` |
| 7-7 | URL query 미저장 | **PASS** | `resource` 이름 `/static/app.js`(입력 `?v=9`), `/api/browser/{id}`(입력 `?q=secret`) |
| **8. 화면 — RUM 목록 (§2.18)** | | | |
| 8-1 | 라우트·루트 | **PASS** | `/application-monitoring/rum` → `apm-rum-page` |
| 8-2 | 표 열 구성 | **PASS** | `정규화 경로 / 페이지 뷰 (PV) / 버킷 세션 합 / LCP p75 / INP p75 / CLS p75 / JS 오류` — **TTFB·FCP 열 없음(F1 대체안)** |
| 8-3 | 🔴 TTFB 열 부재 안내 상시 표시 (검수 M2) | **PASS** | 표 바로 위 *"페이지별 TTFB p75는 아직 제공되지 않습니다. 상단 분포는 전체 페이지 기준입니다."* |
| 8-4 | 표 값 = API 값 | **PASS** | `/orders/{id} · 5 · 3 · 2,500 ms · 좋음 · 250 ms · 개선 필요 · 0.15 · 개선 필요 · 2` |
| 8-5 | 값 없는 행은 `—` | **PASS** | 관측 없는 5개 행 전부 `—`(0으로 위장하지 않음) |
| 8-6 | 등급 색 축 | **PASS** | `data-grade="good|needs|poor"`가 `Vital.goodThreshold/poorThreshold` 기준으로 붙는다 |
| 8-7 | 🔴 `exceedsTopBound` 하한 표기 | **PASS** | LCP 카드 **`≥ 60,000 ms · 나쁨`** — 무의미한 보간값 93,750이 아니라 격자 상한을 표시 |
| 8-8 | 분포 카드 5장(FCP 포함) | **PASS** | `apm-rum-card-{LCP,INP,CLS,TTFB,FCP}` + `관측 N건` |
| 8-9 | 집계 창 표시 | **PASS** | `실제 집계 창: 2026-09-14 09:35 ~ 2026-09-14 10:40`(5분 내림/올림) |
| 8-10 | 세션 정의 각주 | **PASS** | *"세션은 페이지·브라우저·OS·국가·5분 버킷별 distinct 수의 합입니다. 전체 기간의 고유 세션 수가 아닙니다. …"* |
| 8-11 | 환경 분포 탭 3종 + URL | **PASS** | 브라우저/운영체제/국가 힌트 → `?by=os`·`?by=geo`, 표 전환 값 `알 수 없음 8,100 / KR 5 / JP 1`(**null → "알 수 없음"**) |
| 8-12 | PV/세션 추이 | **PASS** | 캔버스 렌더 + 표 전환 `09-14 10:10 / 1 / 1`, `10:15 / 8,104 / 4`, 관측 없는 칸은 **`—`(0 채움 없음)** |
| 8-13 | 경로 검색 | **PASS** | `Input.Search`라 **Enter/버튼에서** 적용 — `?pageSearch=orders` → 1행. (타이핑만으로는 적용되지 않음: 의도된 동작) |
| 8-14 | `rebucketed` 배지 | **PASS** | `apm-badge-rebucketed=해상도 조정됨` |
| 8-15 | `truncated` 배지 | **미검증** | 50,000행 절단을 만들 수 없었다(§6) |
| **9. 화면 — RUM 상세** | | | |
| 9-1 | 라우트·이동 | **PASS** | 표 링크 → `/application-monitoring/rum/pages/{groupId}` |
| 9-2 | p75 카드 5장(해당 페이지 기준) | **PASS** | `2,500 ms · 좋음` 등 API와 동일, `관측 4건` |
| 9-3 | 🔴 F2 대체 표시 | **PASS** | `apm-rum-p75` 카드가 차트 대신 *"이 응답에는 p75 시계열이 없습니다. 위 카드에서 조회 기간 전체의 p75를 확인할 수 있습니다."* |
| 9-4 | 타이밍 워터폴 = **집계 평균**으로 표기 | **PASS** | 카드 제목 `페이지 로드 timing · 집계 평균`, 각주 *"구간 이름별 시작·소요 시간의 평균입니다. 개별 페이지 로드나 세션 리플레이가 아니며 …"* · `apm-rum-timing-bar` **15개** |
| 9-5 | 리소스 표 | **PASS** | `/api/orders/{id} 1 0 500 0` · `/static/vendor.js 1 60 200 120,000` · `/static/app.js 1 120 80 45,000` |
| 9-6 | JS 오류 그룹 표 + 스택 펼침 | **PASS** | 2행(TypeError·ReferenceError), 행 확장 시 `apm-rum-stack` 2개 렌더 + 복사 버튼. 각주 *"오류 수는 조회 기간 기준입니다. 최초·마지막 관측 시각은 최대 90일 보관된 그룹 이력 기준입니다."* |
| 9-7 | 트레이스 링크 → 워터폴 Browser 행 | **PASS** | `연결된 백엔드 트레이스 9a9a…` → 트레이스 상세에서 **`documentLoad 브라우저 1.50 s` → `fetch GET /api/orders/{id} 브라우저 500 ms` → `GET /api/orders/{id} 400 ms` → `SELECT orders 200 ms`**, 크리티컬 패스 1.50s, `스팬 수 4 / 저장 4` |
| 9-8 | 서버 서비스 목록에 Browser 미포함 | **PASS** | `/apm/services/overview` 응답에 Browser 서비스 없음(주입한 `qa-rum-backend`만 추가) |
| **10. 화면 — 수집기 "브라우저(RUM)" 탭** | | | |
| 10-1 | 탭 존재·루트 | **PASS** | 탭 5종 중 `브라우저(RUM)`, `apm-rum-management` |
| 10-2 | 토큰 표 9열 | **PASS** | `토큰 이름 / 허용 origin (한 줄에 하나) / 초당 요청 제한 / 본문 상한 (bytes) / 일일 관측 예산 (UTC) / 발급 시각 (UTC) / 마지막 수신 / 상태 / 작업` |
| 10-3 | 빈 허용 목록 = "수신 중지" | **PASS** | origin 0개 토큰 행에 `수신 중지` 표기 |
| 10-4 | 공개 토큰 고지 | **PASS** | *"브라우저 전용 공개 토큰입니다. Collector 토큰을 넣지 마세요. 원문은 발급 직후 한 번만 표시되며 목록·스니펫에서는 다시 조회할 수 없습니다."* |
| 10-5 | 🔴 발급 → 원문 1회 모달 | **PASS** | `apm-token-secret-modal` + `apm-token-secret-warning`(*"이 창을 닫으면 토큰 원문을 다시 볼 수 없습니다. 서버는 해시만 저장하므로 복구 경로가 없습니다."*) + **확인 체크 전 닫기 버튼 `disabled`**, 체크 후 활성. RUM은 `configYaml`이 없으므로 `-config`/`-download` 미렌더 |
| 10-6 | 발급 후 목록 갱신 | **PASS** | `qa-p4-ui-token … 활성` 행 즉시 추가 |
| 10-7 | Origin 편집 | **PASS** | 현재 값 프리필 → 2개로 저장 성공 → 표 반영. 잘못된 origin이면 **저장 차단 + 폼 오류** *"scheme://host[:port]를 한 줄에 하나씩 최대 32개 입력하세요. 경로·와일드카드·중복·사용자 정보는 허용하지 않습니다."* |
| 10-8 | 회수 확인 → 상태 전환 | **PASS** | 확인 다이얼로그 *"… 이 토큰을 사용하는 브라우저 수집이 중지됩니다. 재개하려면 새 토큰을 발급해 배포 설정을 교체하세요."* → `회수됨` |
| 10-9 | 스니펫 가이드 | **PASS** | `?tokenId=7`에서 `apm-rum-install-command`·`apm-rum-snippet-code`(4,205자, 자리표시 포함·원문 0)·`apm-rum-csp`(`connect-src 'self' https://moveseye.example.com;`)·`apm-rum-propagation`(`propagateTraceHeaderCorsUrls: []`) + 복사 버튼 4개 |
| 10-10 | 출처 링크 | **PASS** | `apm-doc-ref-otel-browser`·`-web-vitals-guide`·`-web-vitals-library` 3개, 실 URL 연결 |
| **11. 권한 (§1)** | | | |
| 11-1 | `apm.view` off — 조회 EP | **PASS** | `/apm/rum/{pages,vitals,breakdown}`·`/apm/services/overview` 전부 `200 + code:403 + FORBIDDEN` *"APM 화면을 볼 권한이 없습니다."* |
| 11-2 | `apm.edit` off — 관리 EP | **PASS** | `/apm/rum/tokens`·`/snippet`·`PUT /origins` → `FORBIDDEN` *"APM 설정을 변경할 권한이 없습니다."* (view=true 사용자도 동일) |
| 11-3 | `apm.view` on — 조회 통과 | **PASS** | pages·vitals·breakdown·overview 200 |
| 11-4 | FE — view 없음 | **PASS** | `/rum`·`/collectors` 모두 **`/errors/404` 리다이렉트**, 사이드바에 APM 메뉴 없음 |
| 11-5 | FE — view만 있음 | **PASS** | APM 하위 **6개**(수집기 제외) 노출 · RUM 목록 8행 렌더 · **"RUM 수집 설정" 버튼 미렌더** · 수집기 화면은 *"수집기 화면은 APM 편집 권한이 있어야 볼 수 있습니다. … 권한은 역할 편집 화면의 '애플리케이션 모니터링 > APM'에서 켭니다."* |
| 11-6 | FE — 관리자 | **PASS** | APM 하위 **7개**(수집기 포함) |
| 11-7 | 전역 검색 축 분리 | **PASS** | view 사용자 검색 "RUM" → **`사용자 경험(RUM)`만** 노출, `RUM 수집 설정`(edit 축)은 숨겨짐. 관리자는 둘 다 |
| **12. K8s (§6)** | | | |
| 12-1 | 리소스 속성으로 인스턴스 등록 | **PASS** | `k8s.pod.name`·`namespace`·`node`·`deployment`·`k8s.container.restart_count` → `apm_instance`의 K8s 컬럼 5개 채워짐 |
| 12-2 | cluster 게이지 최초 관측은 시각을 만들지 않음 | **PASS** | count=1(등록값과 동일) → `container_restarted_at` NULL 유지 |
| 12-3 | 증가 + OOMKilled | **PASS** | 1→2 + `k8s.container.status.last_terminated_reason=OOMKilled` → `container_restarted_at`·`container_oom_at` 동시 기록 |
| 12-4 | 동일 count·이유 반복 | **PASS** | 재전송 후 두 시각 **바이트 동일**(갱신 없음) |
| 12-5 | reset(count 0) | **PASS** | count 0으로 내려가도 새 재시작을 만들지 않고 **과거 시각은 이력으로 유지** |
| 12-6 | 🔴 늦은 이유 pending 결합 (R3) | **PASS** | 3→4 이유 없이 → `restarted_at` 기록 + `restart_reason_pending=t` → 같은 count로 OOMKilled 도착 → `oom_at` 1회 기록 + `pending=f` → 재수신해도 불변 |
| 12-7 | 🔴 배지 5분 TTL 경계 | **PASS** | `to = obs+4분59초` → **true** / `to = obs+5분00초` → **false** / `+5분01초` → false — *"정확히 5분이면 false"* 계약 그대로 |
| 12-8 | 조회 창 [from,to) 반개 구간 | **PASS** | `to == obs` → false |
| 12-9 | 배지 false여도 시각은 반환 | **PASS** | `restartedAt`/`oomKilledAt`은 그대로 `2026-09-14T01:23:40.026Z` |
| 12-10 | DTO 9필드 | **PASS** | `k8sPod/k8sNode/k8sNamespace/k8sDeployment/containerRestartCount/restarted/oomKilled/restartedAt/oomKilledAt` |
| 12-11 | FE 인스턴스 표 K8s 열 | **PASS** | `K8s 파드 / K8s 노드 / K8s 네임스페이스 / K8s 배포 / 재시작 횟수·관측` — 값 `payment-4b8e / node-a / shop / payment`, 배지 **`재시작 · 이력`** + **`OOMKilled · 이력`**(TTL 해제 후 이력 표기) |
| 12-12 | 🔴 **Collector `kubernetes:true` 옵션** | **FAIL (D1)** | 아래 §2 참조 |
| 12-13 | `observe()` 예외 주입(R1 런타임 확인) | **미검증** | 코드 수정 없이 예외를 만들 수 없다(§6) |
| **13. 회귀** | | | |
| 13-1 | P1~P3 화면 11종 | **PASS** | 개요(카드 13·canvas 1) · 서비스(10행) · 서비스맵 · 트레이스(4행·canvas 1) · 합성감시(**24행**) · 수집기(카드 5) · 알람규칙(**2행**) · SLO(0행 — P3 종료 시점부터 `apm_slo` 0행) · RUM(8행·canvas 7) · 홈(위젯 **12**) — **HTTP ≥400 응답 0건** |
| 13-2 | Live | **PASS** | 별도 라우트가 아니라 **APM 개요 화면 안**의 구성요소다(`/application-monitoring/live`는 애초에 없는 경로). 개요 렌더 정상 |
| 13-3 | 콘솔 에러 | **PASS** | **RUM 신규 0**. 선재 3종만 — React `key` spread 경고 · antd `destroyInactiveTabPane` deprecated · `useForm not connected`. 네트워크 실패는 `localhost:3100/ai/health`(AI 서버 미기동, 의도) 하나뿐 |
| 13-4 | 기존 API 회귀 | **PASS** | `/apm/alert-rules`(전역 규칙 2) · `/apm/synthetics`(22+) · `/apm/collectors` · `/apm/services/overview`(13) 정상 |

**집계: PASS 92 · FAIL 1 · 관찰 4 · 미검증 8**

> → 반영 (2026-09-14, Codex QA 수정 최종 검증): 위 표는 수정 전 런타임 QA 결과다. 수정 worktree `C:\solutions\moveseye-be-spring-p4b` / `p4-qafix` / 기준 `6af7c46`에서 `JAVA_HOME=C:/Program Files/Java/jdk-17`, `GRADLE_USER_HOME=C:/Users/DMOVE/.gradle`, `./gradlew.bat :test` **BUILD SUCCESSFUL (3m 10s)**. XML 303 suites / **3,088건, 실패·오류·skip 0**. 보고서: `C:\solutions\moveseye-be-spring-p4b\build\reports\tests\test\index.html`.
>
> → 반영 (직전 3,086건과 차이): 본 트리 XML과 비교했다. 미커밋 증분 차트 테스트 6건(IncrementalChartQueryTest 3건 및 CPU·memory·network 각 1건)이 기준 worktree에는 없고, 이번 APM 회귀 8건이 추가됐다. 기존 테스트 삭제·skip 없음. D1 4건·D2 거절 1건은 수정 전 실제 실패를 확인했다.
>
> → 반영 (추가 검증·문서): `node --test src/test/resources/apm/rum-snippet.test.mjs` 6건 통과. `RumSchemaIT` 8건·K8s observer IT 1건·LicenseArchitectureTest 7건도 전체 :test에서 통과했다. package-info의 rum/synthetic/messaging/job/report 절, CLAUDE.md, collector-template의 구 restart_count 필터, ApmJobConventions의 V54 완료 경로·원본 7일 보존 설명을 정리했다. git diff --check 통과. 커밋·푸시·clean·bootRun·--stop 미실행.
>
> → 반영 (남은 불안): 수정본 서버 재기동·런타임 QA, 실제 OTel SDK 2.x 번들·브라우저 동의 철회, Collector validate·실제 K8s 배포는 이번에 실행하지 않았다. 아래 U1~U9의 런타임 미검증 표시는 그대로 유지한다.

---

## 1. 🔴 D1 [HIGH] — `kubernetes: true`가 조용히 버려져 K8s 수집 설정이 **화면 경로로는 절대 생성되지 않는다**

> → 반영 (2026-09-14, Codex / p4-qafix): `withSettingDefaults`가 kubernetes를 포함한 전 필드를 전달하도록 수정하고 7인자 옵션 편의 생성자를 제거했다. `ApmCollectorConfigService.generate` 및 토큰 발급 서비스 `issue → generateForIssue` 경유 회귀 테스트를 추가했다. keepRawSql 키를 생략한 JSON + kubernetes:true로 전역 기본값 false/true 모두 검증한다. 수정 전 해당 4건의 실패를 확인했다. 아래 실측은 수정 전 QA 이력으로 유지하며, 수정본의 서버 재기동·런타임 QA는 이번 작업에서 수행하지 않는다.

### 현상

```bash
# 계약 §6이 말하는 그대로 보낸다
curl -X POST /apm/collector-config -d '{"tokenId":20,"endpoint":"https://moveseye.example.com","kubernetes":true}'
#   → 200, 7,258 bytes, k8s 블록 0개 (kubernetes:false와 바이트 단위로 동일)

# keepRawSql을 명시하면 갑자기 된다
curl -X POST /apm/collector-config -d '{"tokenId":20,"endpoint":"…","kubernetes":true,"keepRawSql":false}'
#   → 200, 8,923 bytes, kubeletstats: / k8s_cluster: / k8sattributes: / metrics/k8s 파이프라인 전부 생성
```

발급 동시 생성(`withConfig`) 경로도 같다 — `keepRawSql` 없이 `{"kubernetes":true}` → yaml 5,806B(K8s 없음), `{"kubernetes":true,"keepRawSql":false}` → 7,269B(K8s 있음).

### 원인 (1줄)

`moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigService.java:112-113`

```java
private ApmCollectorConfigOptionsDto withSettingDefaults(ApmCollectorConfigOptionsDto options) {
    …
    if (opts.keepRawSql() != null) {
        return opts;                      // ← 여기로 빠지면 kubernetes가 살아남는다
    }
    return new ApmCollectorConfigOptionsDto(opts.endpoint(), opts.slowMs(), opts.normalPct(),
            opts.memoryLimitMib(), opts.queueDir(), settingService.keepRawSql(), opts.os());
    //     ↑ 7인자 편의 생성자. 그 생성자는 kubernetes를 false로 하드코딩한다
    //       (ApmCollectorConfigOptionsDto.java:48-51)
}
```

즉 **`keepRawSql`이 생략된 모든 요청에서 `kubernetes`가 `false`로 덮인다.**

### 왜 아픈가

- **FE 기본값이 정확히 그 경로다.** `ApmTokenIssueDrawer.tsx:152`가 `keepRawSql: DEFAULT`(= "전역 기본값")로 시작하고, `apmKeepRawSqlPayload`가 그 선택지에서는 `undefined`를 돌려주어 **키를 아예 보내지 않는다**(`:187-188`). 관리자가 발급 Drawer에서 "K8s 수집 블록 활성화" 체크박스(`apm-token-issue-kubernetes`)만 켜고 원문 SQL은 손대지 않는 **가장 자연스러운 조작**이 곧 이 버그다.
- 응답은 200이고 파일도 정상적으로 내려간다. **실패 신호가 전혀 없다** — 관리자는 K8s 블록이 든 yaml을 받았다고 믿고 배포하며, 클러스터에서 파드/노드/재시작 지표가 안 오는 이유를 찾게 된다.
- P4 §6의 "5.3b 생성기"가 **런타임에서 사실상 도달 불가**다.

### 왜 테스트가 못 잡았나

`ApmKubernetesConfigTest`(`:9`, `:37-38`)가 **서비스를 건너뛰고 `new ApmCollectorConfigGenerator(...).generate(options, …)`를 직접 호출**한다. 결함은 서비스 계층에만 있어 3,072개 테스트가 전부 green이다.

### 재현

```bash
cd C:/Users/DMOVE/.../scratchpad/qa/p4
curl -s -b cookies.txt -H "x-visitor-id: qa-e2e" -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:3001/apm/collector-config \
  -d '{"tokenId":20,"endpoint":"https://moveseye.example.com","kubernetes":true}' -o a.yaml
grep -c "k8sattributes:" a.yaml     # → 0   (기대: 1)
```

### 제안

`withSettingDefaults`의 재조립을 8인자 정식 생성자로 바꾸고(`…, settingService.keepRawSql(), opts.os(), opts.kubernetes()`), 7인자 편의 생성자는 삭제하거나 테스트 전용으로 좁힌다. 회귀 테스트는 **generator가 아니라 `ApmCollectorConfigService.generate`** 를 태워야 한다.

---

## 2. 관찰 (결함 미만 · 판단 필요)

### D2 [LOW] 회수된 토큰에 `PUT /apm/rum/origins`가 성공한다

> → 반영 (2026-09-14): 엔티티 변경 전에 회수 여부를 검사해 HTTP 200 + body code:400 / APM_TOKEN_REVOKED로 거절한다. 해당 enum 항목은 이번에 추가했다. 서비스 상태 불변·저장 미호출, 실제 서비스와 GlobalExceptionHandler를 거친 PUT 응답, 활성 토큰 변경·중복 제거 및 DELETE 멱등 회귀 테스트를 추가했다. 수정 전 회수 거절 테스트의 실패를 확인했다.

```
PUT /apm/rum/origins {"tokenId":9,"allowedOrigins":["http://localhost:5555"]}
→ 200 {"id":9, …, "allowedOrigins":["http://localhost:5555"], "revokedAt":"2026-09-14T01:12:20.894317Z"}
```
회수된 토큰은 수신에서 403이라 보안 영향은 없다. 다만 화면의 `Origin 편집` 버튼이 회수된 행에도 그대로 붙어 있어(§10-2 표 실측) **"고쳤는데 아무 일도 안 일어나는" 조작**이 상시로 열려 있다. 거절하거나 버튼을 숨기는 편이 낫다.

### D3 [INFO] 중복 origin은 거절이 아니라 조용한 dedup

> → 반영 (2026-09-14): dedup을 유지하고 계약 §1에 거절 아님·최초 순서 보존·입력 상한 32개는 dedup 전 검사임을 명시했다. FE 안내 문구 변경은 FE 담당 범위다.

계약 §1: *"wildcard, path, query, fragment, userinfo, null, **중복**/합쳐진 origin은 허용하지 않는다"*.
실측: `["http://localhost:5555","http://localhost:5555"]` → **200, 저장 1개**. 결과는 안전하지만 계약 문언과 다르다. 참고로 **FE 폼 오류 문구는 "중복 … 허용하지 않습니다"라고 말한다**(§10-7) — 화면 안내와 서버 거동이 어긋난다. 둘 중 하나를 맞춰야 한다(계약을 "dedup한다"로 고치는 쪽이 간단하다).

### D4 [LOW] 스니펫이 `unhandledrejection`을 수집하지 않는다

> → 반영 (2026-09-14): error/unhandledrejection이 공통 exception 기록 함수를 사용한다. reason을 메시지·JSON으로 변환하지 않으며 기존 서버 PII 정제·UTF-8 4KB 스택 제한을 따른다. 동의 검사와 종료 시 두 리스너 해제를 적용했다. Node VM에서 제품 스니펫을 실행하는 회귀 테스트 6건 통과(일반 오류/Promise 동등성, 문자열·null·객체 reason, 동의 전/철회). 실제 OTel SDK 번들·브라우저 E2E 검증과는 별개다.

`rum-snippet.js`는 `window.addEventListener('error', …)`만 건다. 요즘 SPA의 JS 오류 상당수가 **처리되지 않은 Promise 거부**로 나오는데 그쪽은 통째로 빠진다. 한 줄 추가(`window.addEventListener('unhandledrejection', …)`)로 닫히는 공백이다.

### D5 [INFO] 수신 경로의 `GET`은 RUM 본문 형태를 쓰지 않는다

> → 반영 (2026-09-14): 계약 §2에 실제 HTTP 405 + {"statusCode":405,"message":"Method Not Allowed"}를 명시했다. 코드 무수정.

`GET /apm/rum/v1/traces?tokenId=7` → `405 {"statusCode":405,"message":"Method Not Allowed"}`. 계약 §2는 OPTIONS/POST만 규정하므로 위반은 아니지만, 이 경로에서 나가는 유일한 비-RUM 응답 형태다.

### D6 [INFO] 메트릭만 온 페이지 그룹은 `pv:0 · sessions:1`

> → 반영 (2026-09-14): 계약 §3에 PV는 documentLoad, 세션은 session.id가 있는 메트릭에서도 관측된다는 의미를 명시했다. 메트릭만 수신한 그룹의 pv:0·sessions:1은 허용되는 집계이며 코드 무수정.

Web Vitals gauge만 보내고 documentLoad 스팬이 없으면 그렇게 된다(계약상 정합). 화면에도 `PV 0 / 세션 1`로 나온다 — 계측 가이드를 지키면 안 생기지만, 실무에서 "PV 0인데 세션 1"을 보면 버그로 읽힐 여지가 있다.

---

## 3. 미검증 항목과 이유

| # | 항목 | 이유 |
|---|---|---|
| U1 | `truncated=true` (조회 50,000행 절단) | 50,001행을 만들려면 대량 시드가 필요하고, 배치 4096·일 예산 제약 때문에 수신 경로로는 비현실적. DB 직접 INSERT는 QA 범위를 벗어난다고 판단 |
| U2 | `mixedBounds=true` | 같은 family에 서로 다른 bounds 배열 2행이 공존해야 한다. `CanonicalBounds`가 격자를 고정하므로 런타임 입력만으로는 만들 수 없다(BE IT `RumSchemaIT`가 이 조합을 다룬다) |
| U3 | `RUM_UNAVAILABLE` / 503 | DB·라이선스 조회 실패를 주입해야 한다. 실행 중 DB를 끊으면 다른 세션 자원에 영향이 가서 시도하지 않았다 |
| U4 | R1 — 적재 후 `observe()` 예외 격리 / `K8S_ENRICHMENT_FAILED` | 예외 주입 지점이 코드 안이라 소스 수정 없이는 불가(지시상 소스 수정 금지) |
| U5 | 실 K8s 클러스터 — RBAC·kubelet TLS·k8s_cluster 분리 배치 | 클러스터가 없다. 픽스처 `cluster-restarts-0.159.0.json` 형태를 OTLP metrics로 직접 주입해 **reader→observer→JDBC→조회 DTO→화면**까지는 전 구간 실행했다 |
| U6 | 생성 yaml의 Collector 바이너리 `validate` | otelcol-contrib 바이너리가 이 머신에 없다(P3에서 쓰던 프로세스도 종료된 상태) |
| U7 | 다중 BE 노드·재시작 시 인메모리 일 예산 초기화 | 단일 노드 전제(계약 §7-3이 이미 명시) |
| U8 | 🔴 **실제 OTel Web SDK 2.x 번들 실행** | 스니펫은 계약 §5대로 **ES module 번들 전용**이라 CDN `<script>`로 그대로 못 쓴다. 대신 **실 `web-vitals@4`(jsDelivr IIFE)** 를 로드해 진짜 vitals 값을 만들고, 전송은 스니펫의 `sendVital`/exporter가 만드는 **OTLP/JSON을 그대로 재현**해 실 브라우저 `fetch`로 보냈다. 따라서 **CORS preflight·Authorization·CSP·수신·집계는 전부 실측**이고, 검증되지 않은 것은 **npm 버전 조합과 번들러 빌드** 하나다(계약 §5·R16이 이미 미완료로 표기한 부분과 동일) |
| U9 | 동의 철회(`consentGranted=false` → shutdown) 흐름 | U8과 같은 이유. 스니펫 코드상 종료 함수는 존재 확인 |

---

## 4. 🔴 이번 QA에서 가장 중요한 발견 셋

1. **"체크박스를 켜도 아무 일도 일어나지 않는" K8s 설정(D1) — 그리고 그것이 3,072개 green 아래 숨어 있던 이유.**
   결함 자체는 `withSettingDefaults`가 7인자 생성자로 DTO를 재조립하며 `kubernetes`를 `false`로 덮는 **한 줄**이다. 무서운 건 구조다 —
   ① 응답이 200이고 파일도 내려가서 **실패 신호가 없고**, ② FE 기본값(`keepRawSql: DEFAULT` → 키 미전송)이 **정확히 그 분기**를 타며,
   ③ 테스트가 서비스를 건너뛰고 generator를 직접 부르는 바람에 **전 구간 green**이었다. 레코드에 편의 생성자를 남겨 두면
   "새 필드가 조용히 기본값으로 되돌아가는" 이런 사고가 다시 난다.

2. **계약 §7-1이 "가장 불안한 지점"으로 꼽은 실브라우저 CORS 경로가 실제로 세 갈래 다 정확하다.**
   같은 페이지·같은 토큰으로 **① 등록 origin(5555) → preflight 통과·200 수집**, **② 미등록 origin(5556) → 브라우저가 preflight에서 차단, BE 도달 0**,
   **③ 등록 origin이지만 CSP `connect-src 'self'` → 브라우저가 차단**을 한 회차에서 동시에 관측했다.
   특히 ②는 서버가 403을 주는 것과 별개로 **브라우저 스스로가 데이터를 내보내지 않는다**는 것이라 계약의 origin 바인딩이 실효적임을 뜻한다.
   여기에 실 브라우저가 만든 traceId로 백엔드 스팬을 붙이자 트레이스 상세에 `Browser → Browser fetch → 서버 SERVER → DB CLIENT` 4단 트리가
   그대로 그려졌다 — RUM↔APM 상관이 **머리부터 꼬리까지** 동작한다.

3. **PII 소거가 "필드 몇 개 지우기"가 아니라 실제로 원문을 재구성 불가능하게 만든다.**
   `"TypeError: cannot read x of undefined for alice@example.com\n at render (https://app.test/orders/123?token=SECRET:10:5)"` 를 넣으면
   저장되는 것은 **`"at render (/orders/{id})"`** 하나다 — 메시지 첫 줄(이메일 포함)·호스트·query·경로의 id가 전부 사라지고 프레임 모양만 남는다.
   스팬 속성도 허용목록 6개만 통과해 `authorization`·`cookie`·`baggage`·`user_agent.original`이 전부 소거됐고,
   24KB 스택은 **정확히 4096바이트**로 잘렸다. 반대로 **디버깅에 필요한 정보(프레임 이름·파일 경로·줄 번호)는 남아** 있어
   "안전하지만 쓸모없는 로그"가 되지 않았다.

---

## 5. 환경 상태 (QA 종료 시점)

### 건드리지 않음

- 🔴 **사용자 BE `:3000`은 이 세션 시작 시점(10:05)에 이미 내려가 있었고, 내가 띄우지도 내리지도 않았다.**
  근거: 10:05 `netstat`에 `:3000` 없음 + `Get-Process java` **0건**.
  ⚠️ **추기(15:10 재확인)**: QA 종료(11:30) 뒤인 **13:38:24에 `:3000`(pid 14680)이, 13:37:48에 Vite `:5173`(pid 33704)이 올라왔다** —
  둘 다 내 QA 창 밖에서 **다른 세션이 띄운 것**이다(내가 띄운 프로세스는 pid 8144·17196 둘뿐). 이 문서 §0~§4의 판정에는 영향이 없다.
- dev DB `dmove`(5432·5433 양쪽) · AI `:3100` — 전부 무접촉(QA 창 내내 `:5173`·`:3100`은 떠 있지 않았다).
- 워크트리 `C:\solutions\moveseye-be-spring-p4` · `C:\solutions\moveseyee_fe-p4` — **열지 않았다**.
- BE·FE 워킹트리의 타 세션 미커밋 파일 — **읽기만** 했고 `git stash` **미사용**. 종료 시점 `git status` 각 15파일, HEAD `6af7c46`/`4599f21` 그대로. **제품 소스 수정 0**.

### 내가 띄운 것 (필요 없으면 종료해도 된다)

| 대상 | pid | 비고 |
|---|---|---|
| QA BE `:3001` | **8144** | jar `…\qa\p4\be.jar`, 로그 `…\qa\p4\be3001.log`, DB `dmove_apm`@5433. 15:10 재확인 **살아 있음** |
| Vite `:5174` | **17196** | `moveseyee_fe` 본 트리, `VITE_API_URL=http://localhost:3001`. 15:10 재확인 **살아 있음**(`/sign-in` 200) |
| Gradle 데몬 | 27436 | `bootJar` 빌드로 생성 |

⚠️ 15:10에 하네스가 *"Vite 백그라운드 작업이 메모리 부족으로 중지됨"* 알림을 냈지만, 중지된 것은 **작업 래퍼**이고
분리 실행된 node 프로세스(17196)는 그대로 살아 `:5174`가 200을 준다. 재기동이 필요하면:
`cd C:\solutions\moveseyee_fe && VITE_API_URL=http://localhost:3001 npx vite --port 5174 --strictPort --host 127.0.0.1`

### 내가 띄웠다가 종료한 것

- 헤드리스 Chrome CDP `:9224` (프로필 `…\qa\p4\chromeprofile`) — **종료 완료**
- 정적 페이지 서버 `:5555` · `:5556` (`python -m http.server`) — **종료 완료**

### DB `dmove_apm` — 원복 확인

| 테이블 | 시작 | 종료 | 비고 |
|---|---:|---:|---|
| `apm_service` | 9 | **9** | QA 서비스 4개(`qa-rum-backend`·`qa-k8s-svc`·`qa-k8s-svc2`·`qa-k8s-svc3`) 생성 후 삭제 |
| `apm_span` | 308,295 | **308,295** | 주입한 5스팬 삭제 |
| `apm_instance` | 24 | **24** | K8s 인스턴스 3개 생성 후 서비스 삭제로 동반 정리(`k8s_pod is not null` **0행**) |
| `apm_receive_token` | 6 | **6** | QA 발급 17개(RUM 15 + Collector 2) 전부 삭제. **선재 토큰 id 1~6은 무수정**(id 4 `qa-rum-token` 포함) |
| `apm_rum_page_5m` / `_session_5m` / `_receipt` / `_timing_5m` / `_error_5m` / `_span` / `_js_error_group` | 0 | **0** | V57이 만든 빈 테이블 → QA 데이터 전량 삭제 |
| `apm_ingest_drop_stat` (signal=RUM) | 0 | **0** | |
| `role` | 0 | **0** | 권한 검증용 `QA-P4-NOVIEW`·`QA-P4-VIEW` 생성 후 삭제 |
| `user` | 1 | **1** | `qa-p4-noview`·`qa-p4-view` 생성 후 삭제. **admin 행 무수정**(강등하지 않았다) |
| `flyway_schema_history` | v56 | **v57** | 🔴 이 QA가 적용한 **되돌리지 않는 변경**. `dmove_apm`은 QA 전용 사본이며 스키마 검증이 목적이었다 |

### 실 Zabbix (`dmove.co.kr`)

**아무것도 만들지 않았고 아무것도 지우지 않았다.** P4는 Zabbix를 쓰지 않는다.
⚠️ QA 중 BE 로그에 `Call ZABBIX API error … dmove.co.kr:443 failed to respond` **1건**(10:15:09, `event.get`)이 있었다 — 외부 망 일시 장애로 보이며 이후 회차는 정상(`user.login×1 … event.get×8 avg=122ms`).

### 로그 노이즈 고지

BE 로그의 `AccessDeniedException` / `Exception Processing [ErrorPage…]` / `response is already committed` 스택은 **내가 닫지 않은 헤드리스 탭 4개가 만료 토큰으로 25초마다 폴링한 결과**다(10:32~11:12). RUM 경로가 포함된 ERROR 라인은 **0건**이고 HTTP 500도 0건이다.

---

## 6. 재현 자산

`%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\p4\`

| 파일 | 내용 |
|---|---|
| `run_be.py` · `api.sh` · `cdp.mjs` | BE 기동 / 인증 curl 래퍼 / CDP 드라이버 |
| `t1_token.sh` · `t2_snippet.sh` | 토큰 관리 · 스니펫/origins/회수 |
| `t3_ingest_sec.sh` · `t4_post_sec.sh` · `t5_limits.py` | OPTIONS/POST 보안 · rps·일예산·배치·gzip 상한 |
| `t6_data.py` · `t7_query.py` · `f1_edges.py` | 설계 데이터셋 주입 · 조회 정합 · 엣지(상한초과·재버킷·누적·충돌·시각·ID) |
| `t8_tracelink.py` · `t9_k8s.py` · `t9b_k8s.py` | Browser↔백엔드 트레이스 · K8s 시퀀스 |
| `d1_perm.py` · `d2~d7_*.mjs` | 권한 축(API·FE·사이드바·전역검색) |
| `site/rum.html` · `site/csp.html` | 실 브라우저 RUM 프로브(허용/미등록 origin) · CSP 프로브 |
| `b1_rum_browser.mjs` ~ `f3_badges.mjs` | 브라우저 화면 DOM 어서션 |
| `e1_k8s_fe.mjs` · `e2_regression.mjs` · `e3_recheck.mjs` | K8s 화면 · 회귀 스모크 |
| `be3001.log` · `cfg_true.yaml` · `cfg_k_true2.yaml` | 기동 로그 · D1 증거(동일 요청, `keepRawSql` 유무만 다른 두 yaml) |

---

# §7. 수정 재검증 (2026-09-14 15:12)

- 계기: 1차 보고 후 확인해 보니 **`ace42d5` #ZM-122 [FIX] APM P4 QA 반영**(BE, 11:46 커밋)과
  **`17ebfbc` / 병합 `648418e`**(FE)로 D1~D6이 이미 처리돼 있었다. 둘 다 현 HEAD의 조상임을 `merge-base --is-ancestor`로 확인했다.
- 대상 BE: **`9838cfa`**(#ZM-136, **워킹트리 clean — 1차 때의 미커밋 15파일은 그 사이 커밋됐다**) → `bootJar` 재빌드,
  기존 `:3001`(pid 8144) 종료 후 **pid 31804**로 재기동. Flyway `Current version 57 · No migration necessary`, `Started … in 16.073s`
- 대상 FE: **`e4922db`**(#ZM-136) — Vite `:5174`(pid 17196)가 dev 서버라 현 소스를 그대로 읽는다
- 1차 로그는 `…\qa\p4\be3001_round1.log`로 보존, 2차는 `be3001.log`

## 7.1 재검증 결과

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| **D1** | `POST /apm/collector-config` `kubernetes:true`, **`keepRawSql` 생략** | **CLOSED** | 200 / **8,883 bytes**, `k8sattributes:` 1 · `kubeletstats:` 1 · `k8s_cluster:` 1 · `metrics/k8s` 1 (1차: 7,258B · k8s 0개) |
| D1-b | 거짓 양성 없음 — `kubernetes` 생략 시 | **PASS** | 7,218 bytes, `k8sattributes:` **0** |
| D1-c | 발급 `withConfig` 경로 | **CLOSED** | `{"withConfig":{"endpoint":…,"kubernetes":true}}`(keepRawSql 없음) → yaml 7,229자에 `k8sattributes`·`metrics/k8s` 포함 |
| D1-d | 🔴 다른 옵션 동반 회귀 | **PASS** | `kubernetes:true + slowMs:3333 + os:windows` → 3333 반영 · Windows 큐 경로(`C:\…`) 4곳 · k8s 블록 유지 — "전 필드 전달"로 바꾸며 다른 옵션이 깨지지 않았다 |
| D1-e | 🔴 **결함이 났던 화면 경로 그대로** | **CLOSED** | 발급 Drawer에서 **원문 SQL은 "전역 기본값 (현재 끔)"에 그대로 두고 K8s 체크박스만 켜서** 발급 → 실제 요청 본문 `{"label":"qa-p4r2-uipath","scopes":["ingest"],"withConfig":{…,"kubernetes":true,"keepRawSql":false,…}}` → 원문 모달의 `configYaml` **7,306자에 `k8sattributes`·`kubeletstats`·`metrics/k8s` 전부 존재**, 내려받기 버튼 활성. **FE도 실효값을 명시 전송하도록 바뀌어(17ebfbc) 양쪽에서 막힌다** |
| **D2** | 회수 토큰에 `PUT /apm/rum/origins` | **CLOSED** | `200 + code:400 + APM_TOKEN_REVOKED` *"회수된 RUM 토큰의 Origin은 변경할 수 없습니다. 새 토큰을 발급해 주세요."* · 목록의 `allowedOrigins` **불변** |
| D2-b | 화면에서도 차단 | **CLOSED** | RUM 탭의 `회수됨` 행은 `Origin 편집`·`회수` 버튼이 **둘 다 `disabled`**, `활성` 행은 정상 활성 |
| **D3** | 중복 origin | **계약 정리** | 거동은 그대로 dedup(2개 → 1개 저장). 계약에 명시됐고 **FE 오류 문구도 서버 규약에 맞춰 정정**(1차에 지적한 문구 불일치 해소) |
| **D4** | 스니펫 `unhandledrejection` | **CLOSED** | `code`에 `unhandledrejection` 리스너 존재, 종료 함수의 `removeEventListener` **2개**(error + unhandledrejection) |
| **D5·D6** | 405 응답 형태 · `pv:0 sessions:1` | **계약 명시** | 거동 변경 없이 계약에 규정 |

## 7.2 코멘트

- **D1의 회귀 방어가 두 겹으로 들어갔다.** BE는 7인자 편의 생성자를 제거해 필드 누락을 컴파일 단계에서 막고,
  FE는 실효값을 명시 전송해 서버가 다시 같은 실수를 해도 드러나게 했다. 그리고 새 테스트가
  **generator가 아니라 `ApmCollectorConfigService`를 태운다**(`ApmCollectorConfigServiceTest` +4) — 1차에서 지적한
  "테스트가 서비스를 건너뛰어 전 구간 green이던" 공백이 실제로 닫혔다.
- 커밋 메시지 기준 전체 테스트 **3,088 green(skip 0)**, 스니펫 Node 검사 6건 추가.
  ⚠️ 다만 **그 수치는 내가 돌린 것이 아니라 커밋 본문의 주장**이다. 이 재검증에서 내가 실행한 것은 위 표의 런타임 항목뿐이다.
- 남은 미검증 8건(§3)은 이 수정과 무관하며 **그대로 열려 있다**.
- 🔴 재검증 중 관찰(신규, 낮음): **회수된 토큰으로도 `GET /apm/rum/snippet`이 200을 준다.** 원문을 노출하지 않아 위험은 없고
  화면 셀렉터가 `활성 토큰`만 제시하지만, D2와 같은 계열(죽은 토큰에 열려 있는 조작)이라 함께 좁힐지 판단이 필요하다.

## 7.3 환경 상태 (재검증 종료 시점, 15:15)

- **DB `dmove_apm` 재원복 완료** — `apm_service` 9 · `apm_receive_token` **6**(2차 발급 5개 전부 삭제) ·
  RUM 테이블 전부 0 · `role` 0 · `user` 1 · `apm_span` 308,295 · drop RUM 0. **1차 종료 시점과 동일**.
- 살아 있음: QA BE `:3001` **pid 31804**(⚠️ 1차의 8144는 재빌드하며 내가 종료했다) · Vite `:5174` pid 17196 ·
  헤드리스 Chrome CDP `:9224`(2차에서 다시 띄웠다 — 필요 없으면 종료해도 된다).
- 🔴 **`:3000`(pid 14680, 13:38 기동)과 `:5173`(pid 33704, 13:37 기동)은 다른 세션 것이며 이 세션은 손대지 않았다.**
- 두 레포 워킹트리 **clean(0 파일)** — 이 세션은 제품 소스를 **수정하지 않았고** 커밋도 하지 않았다.
