# APM P2(트레이스) 종단 런타임 QA — WBS 3.4~3.13 · 3.11

- 일시: 2026-09-02 16:25~17:20
- 대상: BE 사본 **`:3001`**(`moveseye-be-spring` HEAD `a0f13d5`, dev 프로필, DB `dmove_apm`@5433 도커) /
  FE Vite **`:5174`**(`moveseyee_fe` HEAD `f4a50a4`) / Collector `otelcol-contrib 0.159.0`(:4317·:4318, 토큰 id 5) /
  샘플 앱 `qa-node`(:8801, Express + `auto-instrumentations-node`) · `qa-python`(:8802, Flask + `opentelemetry-instrument`)
- 라이선스: PREMIUM 기간제(만료 27일 남음) — 화면 배너로 확인
- 계정: `admin` / ADMIN, `x-visitor-id` 필수. USER 판정은 DB `user.role`을 일시 변경 후 **원복**
- 원칙: 판정은 **API 응답 + DB 실측 + DOM 어서션**. 🔴 **스크린샷 0장**(시각 판정이 불가피한 항목이 없었다)
- 🔴 사용자의 **`:3000`·`:5173`은 건드리지 않았다**(둘 다 QA 종료 시점에 살아 있음을 확인). **제품 코드 수정 0.**
- 재현 산출물(일회성): `%TEMP%\claude\C--solutions\73f0e76e-.../scratchpad/qa/p2/`
  (`run_be.py`·`run_node.py`·`traffic.py`·`otlp_trace*.py`·`sweep.py`·`webhook.py`·`critpath.py`·`q.sh`·`api.sh`·`cdp.mjs`·`d1~d8*.mjs`·`resp/*.json`)

---

## 0. 요약표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| **A. 수신** | | | |
| A-1 | `POST /apm/otlp/v1/traces` 200 · 적재 | **PASS** | 3,790건 트래픽 → `apm_span` 3,111행 / `apm_trace_summary` 290행. BE 자기 트레이스에 `POST /apm/otlp/v1/traces` 스팬이 남음 |
| A-2 | tail 정책 — 오류 100% | **PASS** | `/err` 41/41 · `/chain-err` 30/30 = **71/71 (100%)** |
| A-3 | tail 정책 — 느림(≥2s) 100% | **PASS** | `/slow2` 10/10 · `/chain-slow` 10/10 = **20/20 (100%)** |
| A-4 | tail 정책 — 확률 2% | **PASS** | 정상 3,705건 중 **75건 = 2.02%**(목표 2%) |
| A-5 | `sampled_reason` 분포(계약 §7.4 값) | **PASS** | `ERROR`·`SLOW_INFERRED`·`SAMPLED` 3종만 관측, 계약값과 일치 |
| A-6 | 배치 재전송 dedup(동일 본문) | **PASS** | 같은 sha256 재전송 → 스팬 3행·`span_count` 3 불변 |
| A-7 | 배치 재전송 dedup(바이트만 다름) | **PASS** | 공백 1개 추가(sha256 다름) 재전송 → 여전히 3행·3 (논리 dedup 동작) |
| A-8 | SQL 마스킹 기본 정책(MASK) | **PASS** | `'bob@example.com'`·`42`·`'don''t'` → 전부 `?` |
| A-9 | SQL DROP 사분면(`mask_sql=false`) | **PASS** | `db.query.text` 미저장 + `RAW_SQL_BLOCKED/TRACE/db.query.text` 1건 계상(≈15초 지연 플러시) |
| A-10 | 예외 메시지 마스킹(SQL 키워드 포함 시) | **PASS** | `ssn = '900101-1234567' AND age > 42` → `ssn = ? AND age > ?` |
| A-11 | **구 semconv(`db.statement`) 스팬** | **FAIL** | SQL·DB명·주소가 통째로 사라지고 폐기 통계도 없음 — **D4** |
| **B. 롤업** | | | |
| B-1 | `apm_service_edge_5m` | **PASS** | 27행. qa-node→qa-python **SERVICE 엣지 성립**(count 44 = CLIENT 스팬 44와 정확히 일치) |
| B-2 | `apm_error_group(+1h)` | **PASS**(적재) | 8그룹. 단 **조회 창이 잘림 — D1** |
| B-3 | `apm_db_query_group(+5m)` | **PASS** | 68그룹, 5분 버킷 |
| B-4 | `apm_dependency_5m` | **PASS** | 16행 |
| B-5 | 집계 지연 | **PASS** | 5분 주기 + LAG 3분, 실측 최대 ~8분 후 반영(계약 §10.0-6과 일치) |
| **C. 조회 API** | | | |
| C-1 | §10 EP 17개 + §11 EP 4개 전부 응답 | **PASS** | 40콜 전건 HTTP 200, 최대 87ms |
| C-2 | 🔴 §10.6-1 `criticalPath` 3자 정합 | **PASS(해소)** | 실데이터 **8트레이스 전부** 집합 == 배열 == Σ`selfMs` == `criticalPathMs`, delta **0.0** — 표본 JSON만 어긋남(**D6**) |
| C-3 | 오류 코드 4종 + `APM_INVALID_SORT` | **PASS** | `TRACE/ERROR_GROUP/DB_QUERY_GROUP/EDGE_NOT_FOUND` 전부 정확 |
| C-4 | 창 보정(없음·뒤집힘) | **PASS** | `ApmTimeRange.of`가 `to` 기준 1시간으로 접음(계약 문구 "최근 1시간"과 미세 차이 — §5 관찰 1) |
| C-5 | 배포 AUTO 감지 | **PASS** | BE `p2-qa`·qa-node `1.1.0` 두 건 감지. **부트스트랩 규칙(첫 버전 미기록)도 실증** |
| C-6 | 배포 웹훅 15케이스 | **PASS** | 200/400×5/401×2/403/404/멱등/분단위절단/GET 401 — **계약 §11.4와 전건 일치** |
| C-7 | `compare` 창 클램프 | **PASS** | `window=1→5`, `99999→1440`, `afterComplete` 반영 |
| C-8 | `new-errors` | **FAIL** | 배포 후 새로 생긴 예외 그룹이 실재하는데 **모든 창에서 0건** — **D1** |
| C-9 | exemplars → 트레이스 점프 | **FAIL** | 23개 exemplar traceId 중 **0개**가 저장돼 있음 — **D2** |
| C-10 | 에러·DB 그룹 `sampleTraceId` | **PASS** | 8/8 · 12/12 전부 해소 가능(exemplar와 대조적) |
| C-11 | USER 역할 → 200 + code 403 | **PASS**(1건 예외) | 조회 EP 17개 전부 200+403. 🔴 `/apm/live/stream`만 **401** — **D3** |
| **D. 브라우저** | | | |
| D-1 | 트레이스 탐색(산점도·목록·배지) | **PASS** | 표 10행/전체 245건, `sampled-{SAMPLED,SLOW_INFERRED,ERROR}` 배지, "샘플 기준" 고지 |
| D-2 | 산점도 brush 드래그 | **PASS** | URL에 `preset=custom&from&to&trMin&trMax` 반영, 목록 247→232건 갱신 |
| D-3 | 워터폴(정렬·크리티컬·접기·스팬 패널) | **PASS** | 크리티컬 행 `data-critical="1"` 16행, 토글·패널(속성/이벤트/링크) 정상 |
| D-4 | **121행 초과 가상 스크롤 드리프트** | **PASS** | 151스팬 트레이스로 실측: `scrollHeight` 4228 = 151×28 **정확**, 스크롤 1400·바닥에서 시작 인덱스 **오차 0** |
| D-5 | 플레임 탭 | **PASS** | 렌더 + "형제 스팬 합침" 안내 |
| D-6 | 서비스 맵(높이·dagre·엣지 클릭) | **PASS** | React Flow 높이 558, 노드 10·엣지 6, dagre 컬럼 배치, 엣지 클릭 패널(호출수·오류율·p50/95/99 + 추이 2차트) |
| D-7 | 에러 화면 | **부분 FAIL** | 렌더는 정상이나 기본 창에서 **"예외가 없습니다"**(D1) |
| D-8 | DB 화면 | **PASS**(잡음 2건) | 10행 + 흐름도. `dmove_apm\|postgres` 행(**D8**)·1건 표본 p95 242.5ms(**D5**) |
| D-9 | 외부 호출 화면 | **PASS**(관찰 1) | 3행. 계측된 qa-python 호출이 `127.0.0.1`로도 계상(**D9**) |
| D-10 | 서비스 상세 트레이스·트랜잭션 탭 | **PASS** | 트레이스 탭 10행 + `거쳐 간 것 포함` 필터, 트랜잭션 탭 8행 + 산점도 |
| D-11 | 서비스 상세 **배포 탭** | **미구현** | 탭 라벨 `배포 2단계`, `disabled` — §11 BE 전량에 화면이 없다(**D14**) |
| D-12 | USER 사이드바 APM 숨김·전역검색 숨김 | **검증 불가** | USER 로그인 시 **앱 전체가 에러 화면**(SideNav 크래시) — **D7** |
| D-13 | 수집기 `?` 도움말(5단계 순서도·옵션 Collapse) | **PASS** | 5단계 전문 + Collapse 2/3/7개 렌더 |
| D-14 | 콘솔 에러 0 | **부분** | APM 화면 고유 에러 0. React `key` spread 경고는 `/home`·`/asset/list`에도 나오는 **선재 전역 이슈** |
| **E. 회귀** | | | |
| E-1 | P1 API 7종 | **PASS** | 개요·서비스 개요·수집기·알람규칙·live snapshot·폐기통계·red-series 전부 200 |
| E-2 | P1 화면 + Live 패널 | **PASS** | 개요 카드/상태, 서비스 목록 5행, 알람규칙 2행, Live "연결됨" + 흐르는 차트 3 + 오류 엔드포인트 표 |

**결함 15건**: HIGH 2 / MED-HIGH 2 / MED 3 / LOW-MED 2 / LOW 4 / INFO 2.

> ## ✅ 반영 완료 (2026-09-02, BE `a0f13d5` 위)
>
> §1 각 결함에 **`→ 반영`** 한 줄을 달았다. **코드 수정 11건**(D1·D2·D3·D4·D5·D6·D8·D9·D10·D11·D13),
> **계약 명시만 1건**(D12), **범위 밖 3건**(D7=FE 선재 이슈 · D14=FE 미구현, §11.8에서 착수됨 ·
> D15=로컬 `npm install` 누락).
> 신규 마이그레이션 **V46**(트레이스 5분 집계 3종에 `min_ns`·`max_ns`), 신규 오류 코드 2개
> (`APM_TRACE_COMPARE_INVALID`·`FORBIDDEN`), 응답 가산 필드 1개(`Exemplars.points[].stored`).
> `./gradlew.bat :test` **2535 green, skip 0**(직전 2515 대비 +20).
> 계약 갱신: `features/apm/core/contract_apm.md` §7.9 · `features/apm/core/contract_apm-read-api.md` §10.2·§10.3·§10.5·§10.6-2·§11.9.
>
> 🔴 **런타임 재검증은 아직이다** — 전부 단위·통합 테스트로만 확인했다. QA 인프라(:3001 jar·
> Collector·샘플 앱·`dmove_apm`)는 이번 작업에서 **건드리지 않았고**, V46도 그 DB에 적용되지 않았다.

---

## 1. 결함 목록

### 🔴 D1 [HIGH] 에러 그룹 조회가 **1시간 버킷 경계에서 잘려** 15분·1시간 창에서 항상 비어 있다 — `new-errors`는 사실상 영구 0건

- **현상 1 (에러 화면)**: 17:03 시점, 16:34~16:49에 실제로 발생한 예외 8그룹이 있는데도
  - `?from=now-15m` → `total 0`
  - `?from=now-60m` → `total 0`
  - `?from=now-120m` → `total 8`
  화면(`/application-moni­toring/errors`)은 기본 창에서 **"이 기간에 발생한 예외가 없습니다"** 를 보여준다.
- **현상 2 (`new-errors`)**: 배포 id 2(qa-node `1.1.0`, `detected_at 16:47:00`) 이후
  `first_seen_at 16:49:18`인 **새 예외 그룹 id 14**(`Error`, 36건)가 DB에 실재하는데
  `window=60·240·1440` **전부 `total 0`**.
- **원인**: `ApmErrorQueryService.query()` (`.../premium/apm/trace(s)/errors/ApmErrorQueryService.java:131-142`)
  ```sql
  join ( select group_id, sum(count) ... from apm_error_group_1h
          where bucket_start >= ? and bucket_start < ?   -- ← 창의 raw 경계
          group by group_id ) b on b.group_id = g.id
  ```
  `apm_error_group_1h`는 **1시간 버킷**이고 `bucket_start`는 왼쪽 경계다. 창이 정시에 시작하지 않으면
  사건이 들어 있는 버킷이 통째로 배제된다. 창을 정시로 내림(floor)하지 않는다.
  - `new-errors`는 창 시작이 **배포 시각(분 단위)** 이라 정시에 걸릴 확률이 1/60 — 실질적으로 항상 0이다.
  - `ApmDeploymentService.newErrors` 주석의 *"⚠️ 시각 정밀도는 롤업 주기(1시간 버킷)가 아니라 그룹 행의
    `first_seen_at`(초 단위)이다"* 는 **사실이 아니다**. `first_seen_at` 필터 앞에서 조인이 먼저 잘라낸다.
- **재현**
  ```bash
  NOW=$(( $(date +%s)*1000 ))
  curl -s -b cookies.txt -H "x-visitor-id: qa" "http://127.0.0.1:3001/apm/errors?from=$((NOW-3600000))&to=$NOW"   # total 0
  curl -s -b cookies.txt -H "x-visitor-id: qa" "http://127.0.0.1:3001/apm/errors?from=$((NOW-7200000))&to=$NOW"   # total 8
  curl -s -b cookies.txt -H "x-visitor-id: qa" "http://127.0.0.1:3001/apm/deployments/2/new-errors?window=1440"   # total 0
  ```
- **부수 확인**: 5분 버킷 테이블(`apm_db_query_group_5m`·`apm_service_edge_5m`·`apm_dependency_5m`)에도
  같은 패턴이 있으나 **사각지대가 5분**이라 FE 최소 프리셋(15분)에서는 대부분 살아난다.
  실측: 17:05에 `db/queries?from=now-5m` → `total 0`, `now-15m` → 28. 서비스 맵도 5분 창에서 `edges 0`.
- **심각도 근거**: 에러 화면은 "지금 무슨 오류가 나나"에 답하는 화면이고, `new-errors`는 §11 배포 기능의
  절반이다. 둘 다 **정상 동작처럼 보이는 빈 화면**을 내므로 사용자가 결함임을 알 방법이 없다.
- **→ 반영(2026-09-02)**: 버킷 조인의 **창 시작만 정시로 내리고**(`ApmTimeRange.fromTsHourFloor`, 목록·상세·시계열 3곳) 넓힌 만큼의 오탐은 **그룹 행의 초 단위 `first_seen_at`·`last_seen_at` 교집합**으로 2차 필터. ⚠️ `count`는 창을 덮는 정시 버킷 전체의 합이라 **요청한 창보다 넓다**(1시간 해상도의 불가피한 대가 — 계약 §10.2에 명시). 5분 단은 의도적으로 그대로 뒀다. IT 2건 신설(17:03에 "최근 15분" 재현 / 창 밖에서만 산 그룹은 여전히 제외).

---

### 🔴 D2 [HIGH] exemplar → 트레이스 점프가 실측 **0/23** — 메트릭은 100%인데 트레이스는 2%만 남는다

- **현상**: `GET /apm/services/{uid}/exemplars?metric=http.server.request.duration` 이 준
  **23개 exemplar `traceId` 중 저장된 것이 0개**다(`apm_span`·`apm_trace_summary` 양쪽 모두 0행).
  대조군으로 같은 창의 에러 그룹 `sampleTraceId` **8/8**, DB 그룹 `sampleTraceId` **12/12**는 전부 해소된다.
- **원인(구조)**: exemplar는 **메트릭 경로**(요청 100%)에서 나오고, 트레이스는 **Collector tail 샘플링**을
  통과한 것만 남는다(오류 100% · ≥2000ms 100% · 나머지 2%). exemplar가 고르는 값은 버킷의 **최대 지연**인데,
  그 최대값이 2초 미만·정상 응답이면 남을 확률이 2%다. 실측 hit rate = **0%**.
- **화면에 미치는 영향**: 계약 §10.0-2가 `APM_TRACE_NOT_FOUND`를 **"만료됐습니다"** 로 안내하라고 못박아 뒀는데,
  이 경우는 만료가 아니라 **처음부터 저장된 적이 없는** 것이다. 사용자는 "7일이 지났나?" 하고 보존 기간을
  의심하게 되고, 창을 좁혀도 영원히 열리지 않는다.
- **재현**
  ```bash
  # 1) exemplar traceId 23개를 받아
  curl -s -b cookies.txt -H "x-visitor-id: qa" \
    "http://127.0.0.1:3001/apm/services/9c74ec1c-.../exemplars?metric=http.server.request.duration&from=..&to=..&step=300&limit=50"
  # 2) 각각을 상세로 열면 전부 404
  curl -s -b cookies.txt -H "x-visitor-id: qa" http://127.0.0.1:3001/apm/traces/82b5fb13b72a953064db5620d59d2641
  # {"status":"error","code":404,"errorCode":"APM_TRACE_NOT_FOUND","message":"... 보존 기간(7일)이 지났을 수 있습니다."}
  ```
- **다행인 점**: 계약 §10.7이 *"여전히 미착수: #17 exemplar 점프"* 라고 적었듯 **FE가 아직 이 링크를 걸지 않았다.**
  거는 순간 죽은 링크가 된다 — 착수 전에 결정이 필요하다.
- **참고 선택지**(우리가 고르지 않는다, 판단 재료만): ① Collector `tail_sampling`에 exemplar가 가리키는
  트레이스를 남기는 정책 추가 ② exemplar 응답에서 서버가 **저장 여부를 확인해** `traceId`를 `null`로 내리거나
  `resolvable:boolean`을 실어 주기 ③ FE 문구를 "만료" 대신 "이 요청은 샘플로 저장되지 않았습니다"로 분리.
- **→ 반영(2026-09-02)**: 선택지 ②+③. exemplar 항목에 **`stored: boolean`** 추가 — 서버가 `apm_trace_summary`를 **배치 1회** 조회해 채운다(창 ±5분으로 파티션 프루닝). `traceId`는 그대로 싣고 FE가 `stored=false`를 "샘플로 저장되지 않음"으로 표시한다. 🔴 상세 404에 새 코드를 만들지 **않았다** — 그 EP는 "샘플링 탈락"과 "보존 만료"를 구분할 방법이 없다. 옛 주석의 "점마다 찌르는 비용이 크다"는 확인 방법을 잘못 가정한 것이었다. 계약 §10.2 갱신, IT 1건.

---

### 🔴 D3 [MED-HIGH] `/apm/live/stream`이 USER에게 **401 INVALID_TOKEN**을 준다 — 계약은 200 + code 403

- **현상**(역할만 바꾼 2×2 대조, 세션·visitorId 동일 조건):

  | 역할 | `/apm/live/snapshot` | `/apm/live/stream` |
  |---|---|---|
  | ADMIN | 200 (데이터) | 200 `event:snapshot` |
  | USER | **200 + `code:403`** ✅ | 🔴 **HTTP 401 `INVALID_TOKEN`** |

- **계약 위반**: `features/apm/core/contract_apm-read-api.md` §10.5 — *"SSE(`/apm/live/stream`)도 같은 판정이며 **emitter를
  만들기 전에** 거부한다"*, *"거부 형태는 레포 전역 계약대로 HTTP 200 + body `code:403`(401만 실제 상태 코드)"*.
- **영향**: 유효한 세션이 401을 받으면 FE의 401 처리(리프레시 → 재시도 → 로그아웃)가 돌아간다.
  `useApmLive`/axios 인터셉터는 이것을 **세션 만료**로 읽는다 — 권한 문제가 로그인 문제로 둔갑한다.
- **부수 증상(로그 오염)**: 시도마다 BE가 **ERROR 스택 트레이스**를 남긴다.
  ```
  ERROR o.a.c.c.C.[.[.[/].[dispatcherServlet] : Servlet.service() ... threw exception
    [Unable to handle the Spring Security Exception because the response is already committed.] with root cause
  org.springframework.security.access.AccessDeniedException: Access Denied
      at org.springframework.security.web.access.intercept.AuthorizationFilter.doFilter(AuthorizationFilter.java:98)
      ... CoyoteAdapter.asyncDispatch ...
  ```
  같은 사건이 APM 자기 감시에도 `java.io.IOException` 예외 그룹(id 20·21)으로 잡혔다.
- **추정 원인**(코드 순서상 컨트롤러는 옳다 — `ApmLiveStreamController.stream` L192-205에서
  `requireSession` → `ApmAccessChecker.requireRead` 순): `requireRead`의 `ForbiddenError`를
  `produces = text/event-stream` 핸들러에서 렌더하지 못해 `/error` 재디스패치가 일어나고, 그 디스패치에는
  SecurityContext가 없어 `AuthorizationFilter`가 익명으로 보고 `authenticationEntryPoint`(401)로 빠지는 경로.
  **기전은 추정이고, 관측된 응답·로그는 확정이다.**
- **재현**
  ```bash
  # user.role='USER'로 바꾸고 새로 로그인한 쿠키로
  curl -s -b cu.txt -H "x-visitor-id: v" http://127.0.0.1:3001/apm/live/snapshot -w '|%{http_code}'
  #   {"status":"error","code":403,"message":"Access Denied"}|200
  curl -s -b cu.txt -H "x-visitor-id: v" -H 'Accept: text/event-stream' http://127.0.0.1:3001/apm/live/stream -w '|%{http_code}'
  #   {"status":"error","code":401,"message":"INVALID_TOKEN"}|401
  ```
- **→ 반영(2026-09-02)**: 추정한 기전이 맞았다. `requireRead`(던짐) → **`canRead` + 응답 직접 쓰기**로 교체하고 emitter 대신 `null`을 반환한다(`ResponseBodyEmitterReturnValueHandler`가 null을 "처리됨"으로 받는다). 🔴 회귀 테스트는 응답 값이 아니라 **`getResolvedException() == null`**(예외 해석기를 타지 않았다)을 본다 — 기존 MockMvc 테스트는 **예전 코드에서도 초록이었다**(표준 예외 해석기가 협상을 느슨하게 통과시킨다). 함께 D11로 `errorCode:"FORBIDDEN"`도 실린다.

---

### 🔴 D4 [MED-HIGH] 구 semconv 스팬은 **SQL·DB 이름·서버 주소를 전부 잃는다**, 그리고 그 사실이 아무 데도 안 남는다

- **현상**: `db.statement`·`db.name`·`net.peer.name`만 실은 CLIENT 스팬을 보내면 저장되는 속성이
  **`db.system` 하나뿐**이다.
  ```
  span b4b4... "SELECT orders" CLIENT  attrs = { "db.system": "mysql" }
  # 보낸 것: db.system, db.statement("SELECT * FROM orders WHERE user='kim' AND id=9"), db.name, net.peer.name
  ```
- **원인**: `ApmSpanAttrAllowlist.ALLOWED_KEYS`에 `db.system`·`db.system.name`·`db.namespace`·`db.query.text`는
  있으나 **구 이름 `db.statement`·`db.name`·`net.peer.name`이 없다**. 허용목록 밖 키는 조용히 버려진다.
- **화면에 드러난 결과**(둘 다 실물 확인):
  - DB 화면에 `qa-oldsemconv | mysql | **SELECT orders** | 240 ms`가 뜬다 — "쿼리(정규화)" 칸에 실린 것은
    쿼리가 아니라 **스팬 이름**이다(폴백).
  - 서비스 맵에 DB 노드가 **`mysql`** 이라는 이름으로 선다(`server.address`가 없어 엔진 종류가 주소 자리에 온다).
    `data-testid="apm-map-node-DB:mysql"`.
- **🔴 폐기 통계가 0**: `apm_ingest_drop_stat`에서 `signal='TRACE'`인 행은 `RAW_SQL_BLOCKED` 하나뿐이다.
  허용목록에서 버린 **속성**은 세지 않는다. 메트릭 쪽에는 `NOT_ALLOWLISTED`가 72,798건 쌓여 있어
  "왜 안 보이나"에 답하는데, 트레이스 쪽에는 그 축이 아예 없다.
- **완화 요소**: 설치 가이드는 java/node/python 모두 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database`를
  **"반드시"·"필수에 가깝습니다"** 로 안내한다(P1 D1 수정의 결과). 즉 **문서는 맞다.**
  다만 같은 문구가 HTTP 지표에 대해 *"MovesEye가 별칭으로 받아 주기는 하지만"* 이라고 적고 있어
  사용자는 **DB도 별칭이 있을 것으로 읽는다** — 트레이스에는 별칭이 없다.
  `.NET` 가이드에는 `SEMCONV` 문자열이 **0건**이다(**D13**).
- **재현**: `scratchpad/qa/p2/` 의 `otlp_trace2.py`(둘 다 실은 경우) / 인라인 스크립트(구 키만 실은 경우).
- **→ 반영(2026-09-02)**: ① `ApmSpanAttrAllowlist.LEGACY_ALIAS` 신설 **12쌍**(`db.statement`→`db.query.text` · `db.name`→`db.namespace` · `db.operation`·`db.sql.table` · `net.peer.name`/`http.host`→`server.address` · `net.peer.port`→`server.port` · HTTP 4쌍 · `http.url`→`url.full`). **신 이름이 있으면 그쪽이 이기고**, **별칭 해석이 거부 판정보다 먼저**라 `http.url`은 펴진 뒤 거부된다(구 이름이 우회로가 되지 않는다). ② 허용목록 밖 폐기를 **`NOT_ALLOWLISTED`/`signal=TRACE`/키별**로 계상 — 거부 목록에서 버린 것도 같은 칸에 센다(화면의 질문은 "왜 안 보이나" 하나다). 배치당 distinct 키 128 상한, 초과분은 `__other__`. ⚠️ 단위가 **속성**이라 같은 표의 스팬·포인트 행과 더하면 안 된다. 단위 테스트 5건 + 파이프라인 테스트 2건.

---

### D5 [MED] 관측이 적은 구간에서 백분위가 **평균·실측값보다 크게** 나온다 — 트레이스 롤업에 min/max 보정이 없다

- **현상**: `db.query.text` 1건(실제 소요 **110ms**)짜리 그룹의 응답
  ```json
  { "queryNorm":"SELECT id, name FROM users WHERE email = ? ...",
    "count":1, "totalMs":110.0, "avgMs":110.0,
    "p50Ms":175.0, "p95Ms":242.5, "p99Ms":248.5 }
  ```
  `p50`이 `avg`의 **1.59배**, `p99`는 2.26배다. **단일 관측이면 p50=p95=p99=avg여야 한다.**
- 더 눈에 띄는 형태: DB 화면에서 서로 다른 두 행(240ms 1건 / 110ms 1건)이 **둘 다 p95 242.5ms**로 나온다.
  같은 히스토그램 버킷 `(0.1, 0.25] s`에 들어갔기 때문이다.
- **원인**: 5분 롤업 테이블이 `count`·`sum`·`hist_counts`·`bounds_id`만 갖고 **min/max가 없다**.
  백분위를 버킷 경계에서 보간해 내는데, 그 값을 기록된 실측 범위로 조이지 않는다.
  `apm_hist_bounds` id=1 = `[0.005,0.01,0.025,0.05,0.075,0.1,0.25,0.5,0.75,1,2.5,5,7.5,10]` — 100ms~250ms 사이가
  한 칸이라 그 구간의 오차가 크다.
- **선례**: P1 QA **D2**가 메트릭 쪽에서 같은 문제를 잡았고 *"백분위를 기록된 min/max로 검증"* 으로 닫혔다.
  **트레이스 롤업 4종(엣지·DB·의존·에러)은 그 보정을 물려받지 않았다.**
- **재현**: `GET /apm/db/queries/{groupId}` (표본 트레이스 `d1d1d1d1...`, 실제 스팬 duration 110ms 고정).
- **영향 범위**: 엣지 시계열·의존 추이·DB 그룹 — 트래픽이 적은 서비스·심야 구간에서 상시.
- **→ 반영(2026-09-02)**: **V46 신설** — `apm_service_edge_5m`·`apm_db_query_group_5m`·`apm_dependency_5m`에 `min_ns`·`max_ns`(bigint 나노초). 롤업이 대입으로 채우고 조회는 `ApmPercentiles.of(..., minRaw, maxRaw)`로 **세 백분위를 모두** 조인다(P1 D2가 만든 클램프 재사용, 단위 환산은 `ApmSpanLatency` 한 곳). 🔴 `apm_error_group_1h`는 히스토그램 자체가 없어 대상이 아니다. ⚠️ V46 이전 행은 NULL → 보정이 꺼진 채 **예전 값 그대로**(안전한 방향). IT 3건 + 롤업 IT 1건.

---

### D6 [MED] BE 계약 표본 `trace-detail.json`이 **실제 서비스가 만들 수 없는 값**을 담고 있고, FE가 그것에 맞춰 규칙과 테스트를 만들었다

- **§10.6-1 FE 확인 요청 1에 대한 답 — 실데이터로 판정했다.**
  8개 트레이스(스팬 4~151, 단일/다중 서비스, 정상/오류/느림)에서
  **`onCriticalPath:true` 스팬 집합 == `criticalPath` 배열(순서까지) == 강조된 스팬의 Σ`selfMs` == `criticalPathMs`**,
  차이 **0.0**. 예:
  ```
  bea996eb(GET /chain-slow, 7스팬)  flagSet=6 arr=6 equal=True
    Σ selfMs = 0.042+0.0267+0.0235+1938.6624+9.2909+301.4777 = 2249.5232
    criticalPathMs                                            = 2249.5232   (delta 0.0)
  ```
  → **서비스는 둘을 따로 계산하지 않는다. 어긋나지 않는다.**
- **그런데 표본은 어긋나 있다**: `moveseye-be-spring/src/test/resources/apm/contract/trace-detail.json`
  ```
  criticalPath = ["aaaa111122223333","cccc111122223333"]      criticalPathMs = 107.2 (22.4 + 84.8)
  bbbb111122223333  selfMs 41.0  onCriticalPath: true   ← 배열에 없고 합계에도 없다
  ```
  형제 두 스팬(41.0 / 84.8) 중 짧은 쪽이 크리티컬 패스로 표시돼 있다 — 알고리즘상 나올 수 없는 값이다.
  계약이 *"전부 실제 DTO를 애플리케이션과 같은 조건의 ObjectMapper로 직렬화한 결과(지어낸 값이 아니다)"* 라고
  적은 것은 **DTO는 진짜지만 값은 손으로 채운** 것이다.
- **FE에 옮겨붙은 결과**:
  - `src/__tests__/fixtures/apmTraceContractSample.ts:272-295` — 주석까지 달아 그대로 복제
  - `src/pages/.../waterfall/apmWaterfall.ts:146-155` — 두 출처를 **합집합**으로 강조하는 규칙
  - `src/__tests__/apmTraces.test.ts:235` — *"`criticalPath` 배열과 스팬의 `onCriticalPath`를 합집합으로 본다"* 테스트
  즉 **존재하지 않는 서버 거동을 위해 FE에 규칙과 회귀 테스트가 하나씩 생겼다.**
  합집합 규칙 자체는 무해하지만(실데이터에선 두 집합이 같아 결과가 동일), 표본을 고치지 않으면
  다음 사람도 같은 방어를 반복한다.
- **함께 확인 — §10.6-1 요청 2(`db.statement` vs `db.query.text`)**: 실서버는 **`db.query.text`가 정본**이다.
  표본의 `db.statement`는 구 semconv 형태이고, 실제로 그 키로 오면 **저장되지 않는다**(D4).
  `keep_raw_sql`이 켜지든 꺼지든 키는 `db.query.text` 하나다(꺼짐=마스킹본, 켜짐=원문).
- **→ 반영(2026-09-02)**: 표본의 크리티컬 패스 세 필드(`selfMs`·`depth`·`orphan` 포함)를 **`ApmSpanTree.build`·`criticalPath`를 실제로 돌려서** 만든다 — 손편집 여지를 없앴다. SQL 키는 `db.query.text`로 교체. 🔴 파일 대조만으로는 "둘 다 틀려도 초록"이라 **불변식 테스트**를 추가했다(플래그 집합 == 배열 == Σ`selfMs` == `criticalPathMs`, 그리고 표본이 구 SQL 키를 쓰지 않는지). 계약 §10.6-2에 FE 회신을 적었다 — FE는 이미 합집합 규칙을 철회하고 BE 표본 재생성을 기다리고 있었다(§11.8).

---

### D7 [MED] `USER` 역할 계정은 **앱 전체가 에러 화면** — P2 수용 항목(사이드바 APM 숨김)을 검증할 수 없다

- **현상**: `user.role='USER'`로 로그인하면 어떤 경로(`/home` 포함)에서도
  ```
  Oops!  Sorry, an unexpected error has occurred.
  The page you tried to open has the following error:
  Cannot read properties of undefined (reading 'view')
  ```
  콘솔: `TypeError: Cannot read properties of undefined (reading 'view')  at getItems (SideNav.tsx:211:53)`
- **원인**: `GET /users/me/permissions`가 USER에게 **`data: []`** 를 준다(ADMIN에겐 module 배열).
  `SideNav.tsx`는 `if (!permissions) return []`(L141)로 **null만** 막고, 이후
  `permissions?.hostGroup.view`(L204) · `permissions?.serverMonitoring.view`(L214)처럼
  **중첩 키에는 옵셔널 체이닝이 없다.**
- **선재 여부**: `permissions?.X.view` 패턴과 `/users/me/permissions`는 P2 이전부터 있던 코드다.
  **P2가 만든 회귀는 아니다.** 다만 P2가 요구한 검증 항목을 막는다.
- **P2 쪽은 정적으로는 맞게 돼 있다**: `SideNav.tsx:288-299`에 APM 그룹 `show: isUserRoleAdmin`,
  `useIsUserRoleAdmin` 축 사용, 주석에 BE와 같은 축임을 명시. **런타임 확인만 불가**.
- **재현**: `update "user" set role='USER' where id=1` → 재로그인 → `/home`.
  (QA 종료 시 `ADMIN`으로 **원복 확인**)

---

### D8 [LOW-MED] SQL이 없는 **커넥션 스팬**이 DB 쿼리 그룹이 되어 화면에 `dmove_apm|postgres`가 "쿼리"로 뜬다

- **현상**: DB 화면 3위 행 — `moveseye-be | postgresql | **dmove_apm|postgres** | 90.1 ms | 26회`.
  원본 스팬은 OTel Java agent의 JDBC 커넥션 스팬이다.
  ```json
  { "name":"dmove_apm|postgres", "kind":"CLIENT",
    "attrs": { "db.query.text": "",  "db.namespace": "dmove_apm|postgres",
               "db.system.name": "postgresql", "server.address":"localhost", "server.port":"5432" } }
  ```
  `db.query.text`가 **빈 문자열**인데도 그룹이 만들어지고, `query_norm`이 `db.namespace`/스팬 이름으로 폴백한다.
- **영향**: "느린 쿼리 Top" 표에 쿼리가 아닌 것이 상위에 섞인다(26회·90ms는 실제 쿼리보다 크다).
  카디널리티 폭발은 아니지만 표의 신뢰를 깎는다.
- **재현**: `select query_norm from apm_db_query_group where id=12` → `dmove_apm|postgres`.
- **→ 반영(2026-09-02)**: 롤업 소스에서 **`db.query.text` 키가 있는데 빈 문자열**인 스팬을 제외한다(`jsonb_exists` — JDBC가 SQL 안의 `?`를 바인드로 읽어 `attrs ? 'k'`를 못 쓴다). ⚠️ **키가 아예 없는 경우는 그대로 둔다** — 그건 정책 DROP일 수 있고, 그때는 스팬 이름 폴백이 표의 행을 세우는 유일한 수단이다(`mask_sql=false` 설치본의 DB 화면이 통째로 비는 것을 막는다). 롤업 IT 1건.

---

### D9 [LOW-MED] 계측된 서비스 호출이 **"외부 호출"에도 그대로 계상**된다 — 맵은 `SERVICE`, 의존은 `127.0.0.1`

- **현상**: 같은 44건의 qa-node→qa-python 호출이
  - `/apm/service-map` → `SERVICE:...qa-node → SERVICE:...qa-python` (엣지, 44건)
  - `/apm/dependencies` → `qa-node → **127.0.0.1**` (44건, 오류 30, 68.18%)
  양쪽에 나온다. 롤업 테이블도 `apm_service_edge_5m(to_kind=SERVICE, to_ref=3)`와
  `apm_dependency_5m(target='127.0.0.1')` 두 벌로 적재된다.
- **계약상**: §10.2가 `target = server.address`라고 정의하므로 **스펙대로**다.
  다만 화면 이름이 "외부 호출"이라 사용자는 "내부 서비스 호출은 빠져 있다"고 읽는다.
  문구 또는 필터(계측된 서비스로 해소된 엣지 제외 토글) 중 하나가 필요하다 — **결정 필요, 코드 결함 아님**.
- **→ 반영(2026-09-02, 결정 번복)**: 토글이 아니라 **집계에서 제외**했다. 의존 롤업이 서비스 맵과 **같은 조인**(자식 스팬이 다른 서비스에 있는가)으로 판정한다 — 두 곳이 다른 규칙을 쓰면 같은 호출이 한쪽에선 내부, 한쪽에선 외부가 된다. ⚠️ 대입 UPSERT라 **과거 버킷의 기존 `127.0.0.1` 행은 남는다**(롤업이 다시 도는 구간만 사라진다). ⚠️ 상대가 계측돼 있어도 그 스팬이 LAG 안에 못 오면 외부로 분류된다(맵의 `SERVICE`/`HTTP` 판정과 같은 조건). 롤업 IT 1건.

---

### D10 [LOW] `POST /apm/traces/compare` 인자 누락 400에 `errorCode`가 `APM_TRACE_NOT_FOUND`

```json
{"status":"error","code":400,"errorCode":"APM_TRACE_NOT_FOUND","message":"baselineTraceId·targetTraceId가 모두 필요합니다."}
```
- 계약 §10.3이 *"(비교 요청의 필드가 비면 400)"* 이라고 적어 **의도된 재사용**이긴 하다.
  하지만 FE가 `errorCode`로 분기하면 §10.0-2 지침대로 **"이 트레이스는 만료됐습니다"** 를 띄운다 —
  실제로는 호출부 버그다. `code`(400)와 `errorCode`가 서로 다른 이야기를 한다.
- **→ 반영(2026-09-02)**: `ErrorCode.APM_TRACE_COMPARE_INVALID` 신설(400). 없는 트레이스는 여전히 `APM_TRACE_NOT_FOUND`(404)이고, IT가 **둘이 갈렸는지**를 함께 고정한다. 계약 §10.3 갱신.

### D11 [LOW] 403 응답만 **영어 메시지 + `errorCode` 없음**

```json
{"status":"error","code":403,"message":"Access Denied"}     // 다른 오류: errorCode + 한국어
```
- 17개 EP 전부 같은 형태. FE가 `errorCode`로 분기할 수 없고, 그대로 노출하면 한글 화면에 영어가 뜬다.
- **→ 반영(2026-09-02)**: `ErrorCode.FORBIDDEN` 신설 + `ForbiddenError`가 **선택적으로** 코드를 싣게 하고, `ApmAccessChecker`만 그것을 쓴다(메시지도 한국어). 🔴 **전역 호출부는 그대로 뒀다** — `RolesInterceptor`·`DmovePermissionChecker`·MCP 인터셉터는 코드를 안 실어 `ApiResult`의 `NON_NULL`이 키를 지우므로 **응답이 한 글자도 안 바뀐다**(1:1 계약 보존이 우선). 그쪽까지 넓히려면 FE가 그 메시지를 어떻게 쓰는지 확인이 먼저다.

### D12 [LOW] `exception.stacktrace`·비-SQL `exception.message`의 리터럴은 마스킹되지 않는다

```
저장값: "org.postgresql.util.PSQLException: ERROR: duplicate key value 'bob@example.com'\n\tat ..."
저장값: "no row for email = 'bob@example.com' id 42"
```
- 계약(`features/apm/core/contract_apm.md` §7.3)이 *"SQL 키워드 쌍이 보이면 리터럴을 마스킹"* 이라고 못박아 뒀으므로 **스펙대로**다
  (`SELECT ... FROM`이 있는 메시지는 실제로 마스킹됐다 — A-10 PASS).
- 다만 예외 헤더 줄에 개인정보가 실리는 것은 흔한 형태이고, `mask_sql=false`(DROP) 설정에서도 이 값은 남는다.
  **정책 확인 필요 항목**으로만 남긴다.
- **→ 반영(2026-09-02, 코드 변경 없음)**: 스펙 유지. 자유 텍스트의 모든 따옴표 안을 가리면 예외 메시지가 `Cannot find ? in ?`처럼 **읽을 수 없는 문자열**이 되어 에러 화면이 답해야 할 질문에 아무도 답하지 못한다. **계약 `features/apm/core/contract_apm.md` §7.9에 "마스킹의 한계" 표를 명시**하고(가리는 것/못 가리는 것 실측 3줄), 개인정보가 예외에 실리는 설치본은 Collector `redaction/pii`가 정본·원문 열람 자격(§10.5)이 2차 방어선임을 적었다.

### D13 [LOW] `.NET` 설치 가이드에 `SEMCONV_STABILITY_OPT_IN` 안내가 **0건**
- `GET /apm/install-guide?os=linux&stack=dotnet` 전문에 해당 문자열 0회(java 1 / node 2 / python 2).
  .NET OTel도 구 semconv가 기본인 조합이 있어 **D4를 그대로 밟는다**.
- **→ 반영(2026-09-02)**: `app.restart` 스텝 문구 + `OTEL_SEMCONV_STABILITY_OPT_IN=http,database` 환경변수 항목을 DOTNET 분기에 추가(node·python과 같은 수준). 문구는 D4 반영에 맞춰 "별칭으로 받아 주지만 구제이지 정상 경로가 아니다"로 통일했다.

### D14 [INFO] §11(배포) BE 전량이 **화면 없이** 있다
- 서비스 상세 탭 12개 중 배포 탭은 라벨 `배포 2단계` + `ant-tabs-tab-disabled`.
  RED 차트의 배포 markLine도 미소비(계약 §11.5 FE 반영 항목 6개 전부 미착수).
- BE는 완성돼 있고(웹훅 15케이스 전건 통과·AUTO 감지 실증) `red-series`가 이미 `deployments`를 싣는다.

### D15 [INFO] `@dagrejs/dagre`가 `node_modules`에 없었다(`package.json`·`package-lock.json`에는 있음)
- QA 시작 시점의 작업 트리에서 `npm install`이 안 돌아 있어 **서비스 맵 화면이 뜨지 않는 상태**였다.
  QA가 `npm install --no-save --no-package-lock`으로 설치해 진행했다(**두 매니페스트 md5 불변 확인**).
- 시사점: 커밋 `f30f5ec`(서비스 맵 dagre) 이후 **이 화면을 로컬에서 띄워 본 적이 없을 가능성**이 높다.

---

## 2. A. 수신 — 상세

### A-2~A-4 tail 샘플링 실동작 (`traffic.py base`, 3,790요청 / 10.5초)

| 경로 | 보낸 수 | 저장된 트레이스 | 비율 | `sampled_reason` |
|---|---|---|---|---|
| `GET /err` (500) | 41 | **41** | **100%** | `ERROR` |
| `GET /chain-err` (500) | 30 | **30** | **100%** | `ERROR` |
| `GET /slow2` (2.5s) | 10 | **10** | **100%** | `SLOW_INFERRED` |
| `GET /chain-slow` (~2.2s) | 10 | **10** | **100%** | `SLOW_INFERRED` |
| `GET /ok` | 1,504 | 35 | 2.33% | `SAMPLED` |
| `GET /items/:id` | 1,500 | 33 | 2.20% | `SAMPLED` |
| `GET /chain` | 301 | 4 | 1.33% | `SAMPLED` |
| qa-python `GET /ok` | 400 | 3 | 0.75% | `SAMPLED` |
| **정상 합계** | **3,705** | **75** | **2.02%** | 목표 2% |

- 정책 이름(`errors`/`slow`/`normal`)이 아니라 **BE가 붙인 라벨**만 관측됐다 — 계약 §8.7 표와 일치.
- `SLOW`(수집기·에이전트가 속성으로 알려 준 경우)는 이번 환경에서 발생하지 않아 **미관측**.

### A-6·A-7 dedup

| 시도 | sha256 | HTTP | `apm_span` 행 | `span_count` |
|---|---|---|---|---|
| 최초 | `7d6d8e68…` | 200 `{}` | 3 | 3 |
| 동일 본문 재전송 | `7d6d8e68…` | 200 `{}` | **3** | **3** |
| 공백 1개만 다름 | `1225434d…` | 200 `{}` | **3** | **3** |

- 영수증(`apm_otlp_receipt.body_sha256`)과 **논리 dedup(trace_id+span_id)** 두 층이 각각 동작한다.

### A-8~A-10 SQL·예외 정책 (`mask_sql=true` · `keep_raw_sql=false` = 기본)

| 보낸 값 | 저장된 값 | 판정 |
|---|---|---|
| `SELECT id, name FROM users WHERE email = 'bob@example.com' AND age > 42 AND note = 'don''t'` | `... email = ? AND age > ? AND note = ?` | MASK ✅ |
| `exception.message: "ERROR: duplicate key; SELECT id FROM members WHERE ssn = '900101-1234567' AND age > 42"` | `... ssn = ? AND age > ?` | MASK ✅ |
| `exception.message: "no row for email = 'bob@example.com' id 42"` | 원문 그대로 | 스펙대로(D12) |
| `exception.stacktrace` 헤더 줄의 `'bob@example.com'` | 원문 그대로 | 스펙대로(D12) |
| `db.statement` (구 키) | **미저장** | D4 |

- `mask_sql=false`(DROP 사분면)로 바꿔 재전송 → `attrs`에 `db.system.name`만, `RAW_SQL_BLOCKED/TRACE/db.query.text` **1건 계상**.
  ⚠️ 폐기 통계는 **비동기 플러시**라 ~15초 뒤에 나타난다(즉시 조회하면 0건으로 보인다).
  설정은 QA 종료 시 `maskSql=true`로 **원복 확인**.

---

## 3. B. 롤업 — 상세

```
apm_span 3,111 · apm_trace_summary 290 · apm_service_edge_5m 27 ·
apm_error_group 8 · apm_db_query_group 68 · apm_dependency_5m 16 · apm_deployment 4
```

### B-1 SERVICE 엣지 — 성립한다

```
from_service_id | to_kind | to_ref | bucket_start        | count | error_count
2 (qa-node)     | SERVICE | 3 (qa-python) | 16:30:00     |  44   |  30
1 (moveseye-be) | DB      | localhost     | 16:30:00     |  24   |   0
1 (moveseye-be) | HTTP    | 169.254.169.254 | 16:30:00   |   2   |   2
```
- **44 = 30(`/chain-err`) + 10(`/chain-slow`) + 4(`/chain`)** — qa-node의 CLIENT 스팬 44개와 정확히 일치.
- API로도 같은 값: `errorRatePct 68.18`, `p50/p95/p99 = 66.3 / 445.0 / 489.0 ms`, `mixedBounds:false`.
- 노드 유형 판정도 계약대로 동작: `SERVICE`(자식이 다른 서비스) → `DB`(`db.system`) → `HTTP`(나머지).

### B-3 DB 쿼리 그룹
- 68그룹 / 5분 버킷. `query_norm`은 리터럴이 지워진 정규화형이고 사람이 읽을 수 있다.
- 잡음 2종: 커넥션 스팬(D8), 구 semconv 스팬의 스팬 이름 폴백(D4).

### B-5 집계 지연
- 16:32 트래픽 → 16:41(9분 후) 롤업 4종 전부 채워짐. 5분 주기 + LAG 3분과 부합.

---

## 4. C. 조회 API — 상세

### C-1 응답표 (관리자 쿠키, `resp/*.json`에 전문 보존)

| EP | HTTP | code | ms |
|---|---|---|---|
| `/apm/traces` (+ status·service·involved·minMs·maxMs·sort·offset 7변형) | 200 | 200 | 24~36 |
| `/apm/traces/scatter` (default · cells=60&perCell=3) | 200 | 200 | 30~32 |
| `/apm/traces/{id}` · `/flame` · `POST /compare` | 200 | 200 | 11~28 |
| `/apm/service-map` · `/edges/series` (DB·SERVICE·HTTP 3종) | 200 | 200 | 12~34 |
| `/apm/errors` · `/{id}` · `/{id}/series` | 200 | 200 | 14~39 |
| `/apm/db/queries` · `/{id}` · `/{id}/series` · `/db/systems` | 200 | 200 | 14~35 |
| `/apm/dependencies` · `/series` | 200 | 200 | 11~32 |
| `/apm/services/{uid}/exemplars` | 200 | 200 | 16~38 |
| `/apm/services/{uid}/deployments` ×5 · `/deployments/{id}/compare` · `/new-errors` | 200 | 200 | 15~32 |

오류 경로:

| 케이스 | HTTP | code | errorCode |
|---|---|---|---|
| 없는 traceId · 형식이 틀린 traceId | 200 | 404 | `APM_TRACE_NOT_FOUND` (구분하지 않음 — 계약대로) |
| 없는 errorGroup / dbQueryGroup / deployment | 200 | 404 | `APM_*_NOT_FOUND` |
| 없는 엣지 | 200 | 404 | `APM_EDGE_NOT_FOUND` |
| `sort=nope` (traces / errors) | 200 | 400 | `APM_INVALID_SORT` + 허용목록 안내 |
| `compare` 인자 누락 | 200 | 400 | `APM_TRACE_NOT_FOUND` (**D10**) |
| `involved=<uuid>` | 200 | 400 | `INVALID_DATA` — `involved`는 **boolean**이다(오해 주의). `service=<uid>&involved=true`가 올바른 사용법이며 정상 동작(qa-python: 거쳐 간 것 47 vs 시작한 것 3) |
| 없는 의존 target | 200 | 200 | 빈 `points` (엣지의 404와 비대칭 — 관찰) |

### C-2 🔴 크리티컬 패스 3자 정합 (§10.6-1 FE 요청 1 해소)

| 트레이스 | 스팬 | flagSet | arr | 집합 동일 | 순서 동일 | Σ selfMs | criticalPathMs | delta |
|---|---|---|---|---|---|---|---|---|
| `ee7f3427` POST /apm/otlp/v1/traces | 35 | 2 | 2 | ✅ | ✅ | 74.8957 | 74.8957 | 0.0 |
| `ed78879c` POST /apm/otlp/v1/metrics | 21 | 4 | 4 | ✅ | ✅ | 10.6373 | 10.6373 | 0.0 |
| `f84f7741` POST /apm/otlp/v1/metrics | 17 | 4 | 4 | ✅ | ✅ | 13.8168 | 13.8168 | 0.0 |
| `55aa529d` SchedulerManager$$Lambda.run | 13 | 2 | 2 | ✅ | ✅ | 205.0917 | 205.0917 | 0.0 |
| `766bf7dc` GET /chain | 7 | 6 | 6 | ✅ | ✅ | 137.927 | 137.927 | 0.0 |
| `db9d5bcd` GET /chain | 7 | 6 | 6 | ✅ | ✅ | 79.248 | 79.248 | 0.0 |
| `7bc3aa48` GET /chain-err | 7 | 6 | 6 | ✅ | ✅ | 71.0424 | 71.0424 | 0.0 |
| `bea996eb` GET /chain-slow | 7 | 6 | 6 | ✅ | ✅ | 2249.5232 | 2249.5232 | 0.0 |

**답: 실제 서비스는 셋을 어긋나게 만들지 않는다. 표본만 어긋나 있다(D6).**
FE는 배열을 정본으로 삼아도 되고, 지금의 합집합 규칙을 유지해도 결과가 같다.

### C-5 배포 AUTO 감지 — 부트스트랩 규칙까지 실증

| 사건 | 결과 |
|---|---|
| BE를 `service.version=p2-qa`로 기동(이전 버전 `live-1`·`qa-1` 존재) | **AUTO 기록됨** id 1, `detectedAt 07:29:00Z`(분 절단), `rolloutPct:null`, `currentRolloutPct:50.0` |
| qa-node를 `1.0.0`으로 기동(그 서비스의 **알려진 버전 0개**) | **기록 안 됨** ✅ 부트스트랩 규칙대로 |
| qa-node를 `1.1.0`으로 재기동 | **AUTO 기록됨** id 2, `currentRolloutPct:50.0`, `currentInstances:1` |

### C-6 배포 웹훅 15케이스 — 전건 계약 일치

| # | 케이스 | 기대 | 실제 |
|---|---|---|---|
| 1 | 정상 | 200 `created:true` | ✅ `{"id":3,...,"created":true}` (envelope 아님) |
| 2 | 같은 (서비스·버전·분) 재전송 | 200 `created:false`, 같은 id | ✅ `{"id":3,...,"created":false}` |
| 3 | `version` 누락 | 400 `APM_DEPLOYMENT_VERSION_REQUIRED` | ✅ |
| 4·5 | `rolloutPct` 140 / -1 | 400 `APM_DEPLOYMENT_ROLLOUT_INVALID` | ✅ |
| 6 | **깨진 JSON** | **실제 HTTP 400** `APM_DEPLOYMENT_BODY_INVALID` | ✅ (200+INVALID_DATA로 새지 않는다) |
| 7 | 본문 없음 | 400 `VERSION_REQUIRED` | ✅ |
| 8·9 | 토큰 없음 / 틀린 토큰 | 401 `invalid receive token` | ✅ |
| 10 | `scope=ingest` 토큰 | 403 | ✅ `token not allowed to record deployments` |
| 11 | 없는 uid | 404 `APM_SERVICE_NOT_FOUND` | ✅ |
| 12 | uid가 UUID 아님 | 400 | ✅ `service uid is not a UUID` |
| 13 | 깨진 본문 + 틀린 토큰 | **400이 먼저** | ✅ |
| 14 | `detectedAtMs` 명시 | 200, 분 절단 | ✅ `1788300000000 → 2026-09-01T22:00:00Z` |
| 15 | 같은 경로 **GET** (쿠키 없음) | 401 | ✅ `permitAll`은 POST에만 |

- 토큰 발급: `POST /apm/receive-tokens {"scopes":["deploy"]}` 성공, 오타 `"deploys"`는
  `400 APM_TOKEN_SCOPE_UNSUPPORTED` + *"허용: deploy, ingest"* 로 거절 ✅

### C-11 USER 역할 (DB `role` 임시 변경 → **원복 확인**)

17개 EP(`traces`·`scatter`·`{id}`·`flame`·`service-map`·`errors`·`db/queries`·`db/systems`·`dependencies`·
`deployments`·`compare`·`new-errors`·`services/overview`·`overview`·`live/snapshot`·`collectors`·`settings`)
→ 전부 **HTTP 200 + `{"status":"error","code":403,"message":"Access Denied"}`** ✅
예외 1건: `/apm/live/stream` **401** (**D3**).

---

## 5. 관찰(결함 아님)

1. **뒤집힌 창의 보정 방식이 계약 문구와 미세하게 다르다.** 계약은 *"없거나 뒤집히면 **최근 1시간**"*,
   코드(`ApmTimeRange.of`)는 *"**끝(`to`) 기준** 1시간"*. `from=NOW&to=NOW-2h`를 주면 **2시간 전의 1시간 창**이
   열린다(`/apm/service-map`가 `from:…306000, to:…906000`을 되돌려 준 것이 그 증거). 데이터가 없으면
   "뒤집힌 요청"과 "그 시각에 데이터가 없음"이 구분되지 않는다. 코드 주석은 정확하므로 **계약 문구 쪽을 맞추면 된다.**
2. **`route` 필터는 부분 일치다.** `route=/chain` → `GET /chain`·`GET /chain-slow` 둘 다 나온다(45건).
   `apm_trace_summary`에 route 컬럼이 없어 루트 스팬 이름으로 거르기 때문이며, 계약 §10.6-1과
   화면 도움말("정확히 일치하지 않을 수 있습니다")이 이미 그렇게 안내한다.
3. **`scatter`의 `total`과 `points.length`가 다르다**(187 vs 48) — 계약대로. 화면도 "표본" 배지를 단다.
4. **`/apm/errors`는 예외 이벤트를 센다. HTTP 500 트레이스는 세지 않는다.** 이번 트래픽의 오류 70건은
   `res.status(500)`이라 예외 이벤트가 없어 에러 그룹이 0이었고, `/boom`(실제 throw) 12요청에서 비로소
   그룹이 생겼다. 화면 문구가 "오류 트레이스 수"로 읽히지 않는지 확인할 것.
5. **React `key` spread 경고는 전역 선재 이슈**다 — `/home`·`/asset/list`에서도 동일하게 나온다. P2 무관.
6. **`/apm/live/stream`은 ADMIN에게 정상**(SSE `event:snapshot` 즉시 수신). Live 패널도 "연결됨" + 흐르는 차트 3 + 오류 엔드포인트 표 전부 정상.

---

## 6. 미검증 항목과 이유

| 항목 | 이유 |
|---|---|
| `sampled_reason = "SLOW"`(수집기·에이전트가 속성으로 알려 준 경우) | 이 환경의 tail 샘플러는 정책 이름을 스팬에 심지 않는다. 인위적 주입은 "우리가 만든 값"이 되어 의미가 없어 하지 않음 |
| USER 계정의 **사이드바 APM 숨김 · 전역 검색 숨김** | D7로 앱이 렌더되지 않아 물리적으로 불가. 코드(`show: isUserRoleAdmin`)는 정적으로 확인 |
| 배포 탭 화면 · RED 차트 배포 markLine | FE 미구현(D14) |
| exemplar 점프 화면 동작 | FE 미착수(계약 §10.7). API 레벨에서만 판정(D2) |
| 다중 노드 배포 감지 경합 · 30분 창의 유령/미감지 빈도 | 단일 프로세스 · 단일 세션 규모라 재현 불가(계약 §11.6이 이미 미검증으로 표기) |
| 7일 보존 만료 후 `APM_TRACE_NOT_FOUND` | 7일 경과가 필요 |
| 트레이스 목록 `total` 10만 cap · `totalCapped` | 데이터 규모 미달(관측 최대 290) |
| `truncated`(엣지 2,000 상한)·`cycleBroken`·`rootMissing` 배지 | 실데이터에서 발생하지 않음. 고아 스팬(`orphan`)만 인위 주입으로 적재 확인 |
| 라이선스 만료/차단 상태의 트레이스 수신 | P1 QA(C-3)에서 이미 실증, 이번 범위 밖 |

---

## 7. 환경 정리 상태

**QA가 이번 회차에 띄운 것 — 정리 완료**
- 헤드리스 Chrome(CDP 9224, 프로필 `qa/p2/chromeprofile`) → 종료 확인 `CDP9224=000`
- 트래픽 스크립트(`traffic.py`)·OTLP 주입 스크립트 → 일회성, 잔여 프로세스 없음

**유지(인프라 — 다음 회차가 그대로 쓴다)**

| 대상 | 상태 | 이번 회차 변경 |
|---|---|---|
| BE `:3001` (pid 41964) | 200 | 🔴 **새 jar로 교체**(`a0f13d5` 빌드, `qa/p2/be.jar`). Flyway가 `dmove_apm`에 **V44·V45 적용 확인**(로그 81-83행) |
| FE `:5174` (pid 45308) | 200 | 🔴 **재기동**. `@dagrejs/dagre` 설치(매니페스트 불변), `VITE_API_URL=http://localhost:3001`을 **프로세스 env로** 주입(`.env` 파일은 손대지 않음 — 사용자의 `:5173`이 같은 파일을 쓴다) |
| Collector `:4317/:4318` (pid 22576) | health 200 | 변경 없음. traces 파이프라인(`tail_sampling → otlphttp /v1/traces`) **이미 존재**해 재생성하지 않음 |
| `qa-node` `:8801` | 200 | 🔴 **`server2.js`로 교체**(`/chain`·`/chain-err`·`/chain-slow`·`/slow2`·`/boom` 추가), `OTEL_SERVICE_VERSION=1.1.0` |
| `qa-python` `:8802` | 200 | 변경 없음 |
| **사용자 BE `:3000`** (pid 15196) | 살아 있음 | **건드리지 않음** |
| **사용자 FE `:5173`** (pid 24104) | 200 | **건드리지 않음** |

**QA DB(`dmove_apm`)에 남긴 테스트 데이터** — 운영 DB가 아니므로 정리하지 않았다
- 서비스 2개 신규: `qa-direct`·`qa-oldsemconv`(수동 OTLP 주입용)
- 수신 토큰 id 6 `p2-qa-deploy`(scope=deploy)
- `apm_deployment` 4행(AUTO 2 · WEBHOOK 2)
- 수동 주입 트레이스 5건: `d1d1…`(마스킹) · `d2d2…`(구/신 키 혼재) · `d3d3…`(구 키만) · `d4d4…`(151스팬) · `d5d5…`(DROP)

**원복 확인**
- `user.role` → `ADMIN` ✅ (`select id,username,role from "user"` → `1|admin|ADMIN`)
- `apm_setting.mask_sql` → `true`, `keep_raw_sql` → `false` ✅
- `moveseyee_fe` 작업 트리 `git status --porcelain` **비어 있음**, `package.json`/`package-lock.json` md5 불변 ✅
- 제품 코드 수정 **0**

---

# 8. 2회차 — 결함 수정 재검증 + FE 3차 화면 (2026-09-02 18:45~19:22)

- 대상: BE **`5afa90b`** 새 jar로 `:3001` 재기동(`bootJar -x test`, clean·bootRun 금지) —
  Flyway 로그 80-82행 `Current version 45 → Migrating to "46 - apm trace rollup min max" → Successfully applied 1 migration`.
  FE `:5174`는 재기동 없이 HMR 상태 그대로(`moveseyee_fe` HEAD **`65e3446`**).
- 트래픽: 1회차 `traffic.py base` **2회**(18:47·19:18, 각 3,790요청) + `/boom` 12 + `/boom2` 23.
  D1 `new-errors` 재현을 위해 qa-node를 **`1.2.0`** 으로 재기동(AUTO 배포 id 6, `detected_at 18:47:00`)하고
  샘플 앱에 `/boom2`(고유 메시지 `qa boom2 r2 tag=r2a`) 라우트를 더했다. **제품 코드 수정 0.**
- 판정 수단: API 응답 + DB 실측 + DOM 어서션. 🔴 **스크린샷 0장**.
- 🔴 사용자의 `:3000`은 시종 살아 있었고 건드리지 않았다. `:5173`은 **QA 시작 시점에 이미 내려가 있었다**(첫 포트 스캔에서 `000`) — QA가 종료시킨 것이 아니다.

## 8.0 요약표

| 결함 | 심각도 | 2회차 판정 | 근거 한 줄 |
|---|---|---|---|
| **D1** 에러 조회 1시간 버킷 절단 | HIGH | **PASS** | `now-15m` total **3** · `now-60m` total **4**(1회차 둘 다 0). `new-errors?window=60` **1건** |
| **D2** exemplar → 트레이스 점프 | HIGH | **PASS** | 응답에 `stored` 존재. `stored=true` 2건 상세 **200**, `false` 3건 **404**. 화면 칩 링크 2 / 회색 6 |
| **D3** `/apm/live/stream` USER 401 | MED-HIGH | **PASS** | **HTTP 200 + `code:403`**. BE 로그에 SSE 관련 **ERROR·스택 0줄** |
| **D4** 구 semconv 스팬 속성 소실 | MED-HIGH | **PASS** | 별칭 12쌍 전부 저장 확인, 신 이름 우선, `NOT_ALLOWLISTED/TRACE` **키별 22행** |
| **D5** 백분위 min/max 미보정 | MED | **PASS** | 단일 관측 그룹 p50=p95=p99=avg(140.0·240.0·0.9656). V46 버킷 백분위 전부 `[min,max]` 안 |
| **D6** 계약 표본이 불가능한 값 | MED | **PASS** | 표본: 집합==배열==Σ`selfMs`==`criticalPathMs`, `db.query.text`로 교체. 실데이터 **14/14 delta 0.0** |
| **D7** USER 앱 전체 에러 화면 | MED | **PASS** | USER 로그인 정상 렌더(메뉴 4그룹), 사이드바 APM 없음, 전역검색 "트레이스" **0건** |
| **D8** 빈 SQL 커넥션 스팬 | LOW-MED | **PASS** | `dmove_apm\|postgres` 그룹의 마지막 버킷 **18:35**(구 jar). 18:40·18:45·18:50 버킷엔 없음 |
| **D9** 계측 서비스가 외부 호출로 | LOW-MED | **PASS** | `127.0.0.1` 의존 행 마지막 버킷 **16:45**. 18:47 트래픽의 chain 47건은 SERVICE 엣지에만 |
| **D10** compare 인자 누락 errorCode | LOW | **PASS** | 400 `APM_TRACE_COMPARE_INVALID` / 없는 트레이스는 404 `APM_TRACE_NOT_FOUND`로 갈림 |
| **D11** 403 영어 + errorCode 없음 | LOW | **PASS** | `{"code":403,"errorCode":"FORBIDDEN","message":"APM 화면을 볼 권한이 없습니다."}` |
| **D12** 예외 리터럴 마스킹 한계 | LOW | **PASS(문서)** | `features/apm/core/contract_apm.md:1820` "§7.3 마스킹의 한계" 실재. 동작은 1회차와 동일 |
| **D13** .NET 가이드 SEMCONV 0건 | LOW | **PASS** | dotnet 가이드에 **2회**(java 1 / node 2 / python 2와 같은 수준), `app.restart` 문구 + 환경변수 항목 |
| **D14** §11 배포 화면 없음 | INFO | **PASS(구현됨)** | 배포 탭 활성 · 목록 4행 · 롤아웃 2열 · 전후 비교 막대 3 · 신규 예외 표 · 웹훅 카드 |
| **D15** `@dagrejs/dagre` 미설치 | INFO | **유지** | 1회차가 `--no-save`로 설치한 상태 그대로. 매니페스트 불변, 서비스 맵 정상 |
| **FE 3차** 배포 탭·RED markLine·exemplar 칩 | — | **PASS** | 아래 §8.2 |
| **회귀** 수신·롤업·목록·워터폴 | — | **PASS** | EP 22개 전건 200, 목록 전체 307건·배지 3종, 워터폴 20스팬 |

**1회차 결함 15건 전건 해소.** 새 결함 **3건**(D16 LOW · **D17 MED** · D18 LOW).

## 8.1 결함별 재검증 상세

### D1 — PASS

```
18:58  GET /apm/errors?from=now-15m   → total 3   (1회차 0)
       GET /apm/errors?from=now-60m   → total 4   (1회차 0)
19:04  GET /apm/deployments/6/new-errors?window=60 → total 1
       {"groupId":83,"exceptionType":"Error","messageNorm":"qa boom2 r2 tag=r2a",
        "count":48,"topRoutes":[{"route":"/boom2","count":48}]}
```
배포 6은 `detected_at 18:47:00` — **정시가 아닌 분**이라 1회차라면 0이 나왔을 조건이다.

`count`가 정시 버킷 합이라는 계약 §10.2 문구를 DB로 대조했다.

| 그룹 | `apm_error_group_1h` 버킷 | 15분 창(18:43→18:58, floor 18:00) | 60분 창(17:58→18:58, floor 17:00) |
|---|---|---|---|
| 14 | 16:00=36 · 18:00=36 | **36** ✅ | **36** ✅ |
| 3 | 16:00=16 · 17:00=56 · 18:00=18 | **18** ✅ | 56+18 = **74** ✅ |
| 1 | 16:00=1 · 18:00=1 | **1** ✅ | **1** ✅ |
| 64 | 18:00=1 | 창에서 **제외**(last_seen 18:29) ✅ | 포함 ✅ |

→ 창 시작만 정시로 내리고 `first_seen/last_seen` 초 단위 교집합으로 2차 필터한다는 반영 내용이
**그대로 관측된다**. 그룹 64가 15분 창에서 빠지는 것이 2차 필터가 사는 증거다.

### D2 — PASS (API + 화면)

- 응답 항목에 `stored` 존재(`keys = ts, count, maxMs, traceId, stored`).
- 3시간 창 34포인트 중 `stored=true` 2건 → 상세 **200**(스팬 7·16), `false` 3건 → **404 `APM_TRACE_NOT_FOUND`**.
- 화면(`?tab=overview`, 16:45~17:15 커스텀 창): 칩 8개 중
  **`apm-exemplar-link` 2개**(`href=/application-monitoring/traces/bbb0305…`·`/…fcafd032…`) ·
  **`apm-exemplar-not-stored` 6개**(`closest('a')` **없음** = 링크가 아니다).
  안내 문구 *"트레이스는 샘플링을 통과한 것만 저장되므로 열리지 않는 항목이 있습니다."* 렌더.
- 링크를 실제로 따라가면 `GET /apm/live/stream · 11.79 s · 7스팬` 상세가 열린다(죽은 링크 아님).
- 🔴 다만 **칩 라벨과 링크 대상이 어긋나는 별개의 문제**를 이 화면에서 발견했다 — **D17**.

### D3 — PASS

| 역할 | `/apm/live/snapshot` | `/apm/live/stream` |
|---|---|---|
| USER | 200 + `code:403` `errorCode:FORBIDDEN` | **200 + `code:403` `errorCode:FORBIDDEN`** ✅ |

BE 로그를 시도 직전 줄 수(1591)로 잘라 확인: 이후 `ERROR` **5줄**은 전부
`GlobalExceptionHandler : HTTP error: APM 화면을 볼 권한이 없습니다.` **한 줄짜리**이고
snapshot 1 + 조회 EP 4 = 5에 정확히 대응한다. **SSE는 로그를 한 줄도 남기지 않았다**(응답을 직접 써서 예외 해석기를 안 탄다).
1회차의 `AccessDeniedException` 스택·`Unable to handle the Spring Security Exception` **0건**.

> 관찰(결함 아님): 403은 여전히 `ERROR` 레벨로 남는다. 권한 거부가 로그 레벨상 오류로 보이는 것은 P2 이전부터의 전역 동작이다.

### D4 — PASS

구 키만 실은 스팬(`aa11…`)이 저장된 결과 — **전부 신 이름으로 펴져 있다**:

```
b102… "SELECT orders" CLIENT
  db.system         mysql
  db.query.text     SELECT * FROM orders WHERE user=? AND id=?   ← db.statement, 마스킹까지 적용
  db.namespace      shopdb            ← db.name
  server.address    mysql.internal    ← net.peer.name
  server.port       3306              ← net.peer.port
  db.operation.name SELECT            ← db.operation
  db.collection.name orders           ← db.sql.table
b101… "GET /legacy" SERVER
  http.request.method GET             ← http.method
  url.path            /legacy         ← http.target
  http.response.status_code 200       ← http.status_code
```
- **신 이름 우선**도 실증: 구·신 둘 다 실은 `b202…`는 `db.query.text=…:u…:i`(신) · `db.namespace=newdb` ·
  `server.address=new.host` · `http.request.method=GET`(구 `http.method=POST`가 아님).
- **`http.url`은 `url.full`로 펴진 뒤 거부**된다(저장 안 됨 + 폐기 1건 계상) — 구 이름이 우회로가 되지 않는다.
- 폐기 통계: `apm_ingest_drop_stat` `signal='TRACE'` `reason='NOT_ALLOWLISTED'`가 **키별로** 쌓인다
  (`router.version` 432 · `express.name` 216 · `net.peer.ip` 61 …). `GET /apm/ingest/drops` 응답에도
  **TRACE 22행**이 실려 화면이 "왜 안 보이나"에 답할 수 있다(1회차엔 `RAW_SQL_BLOCKED` 1행뿐).
- 🔴 관찰: 거부된 키는 **보낸 이름이 아니라 정규화된 이름**으로 계상된다(`http.url`을 보냈는데 `url.full`로 집계).
  "내가 보낸 그 키"로 찾으면 없다 — 화면 도움말에 한 줄이 필요할 수 있다.

### D5 — PASS

단일 관측 DB 쿼리 그룹(V46 이후 새 버킷):

| 그룹 | 실제 스팬 | `count` | `avgMs` | `p50/p95/p99` |
|---|---|---|---|---|
| 830 | 240 ms | 1 | 240.0 | **240.0 / 240.0 / 240.0** |
| 829 | 140 ms | 1 | 140.0 | **140.0 / 140.0 / 140.0** |
| 826 | 0.9656 ms | 1 | 0.9656 | **0.9656 / 0.9656 / 0.9656** |

1회차의 "서로 다른 두 행이 둘 다 p95 242.5ms"는 사라졌다(240 vs 140으로 갈린다).

의존 시계열(`target=169.254.169.254`)에서 **V46 경계가 그대로 보인다**:

| 버킷 | DB `min_ns/max_ns` | API p50 / p95 / p99 | 판정 |
|---|---|---|---|
| 18:05~18:25 | **NULL**(V46 이전) | 5.0 / 47.5 / 49.5 | 보정 꺼짐 — 예전 값 그대로(설계대로) |
| 18:30 | 10.65 / 11.54 | 11.097 / 11.498 / 11.534 | **[min,max] 안** ✅ |
| 18:35 | 1.72 / 22.17 | 5.0 / 21.149 / 21.967 | ✅ |
| 18:40 | 1.31 / 11.50 | 5.0 / 10.993 / 11.401 | ✅ |
| 18:50 | 11.78 / 13.59 | 12.686 / 13.499 / 13.571 | ✅ |

엣지 시계열(SERVICE qa-node→qa-python, 18:45 버킷 min 23.63 / max 314.41)도
p50 42.58 · p95 299.87 · p99 311.51로 범위 안. ⚠️ 시계열 응답은 min/max를 싣지 않으므로
판정은 DB 대조로 했다.

### D6 — PASS

`src/test/resources/apm/contract/trace-detail.json`:
```
criticalPath 배열   = [aaaa1111…, cccc1111…]
onCriticalPath 집합 = [aaaa1111…, cccc1111…]   집합·순서 모두 동일
Σ selfMs 107.2  ==  criticalPathMs 107.2   (delta -0.0)
bbbb1111… selfMs 41.0  onCriticalPath: false   ← 1회차의 true가 고쳐졌다
attrs SQL 키 = db.query.text (db.statement 0건)
```
실서버 재확인(루트 이름이 서로 다른 **14 트레이스**: `/chain`·`/chain-err`·`/chain-slow`·`/boom`·`/boom2`·
`/err`·`/ok`·`/items/:id`·`/slow2`·`/legacy`·`/mixed`·`GET /apm/errors`·`/users/me/permissions`·Redis `HELLO`)
→ **14/14 delta 0.0**. 1회차 결론(서비스는 셋을 어긋나게 만들지 않는다) 그대로.

### D7 — PASS (FE `65e3446`가 함께 고쳤다)

`user.role='USER'`로 바꾼 뒤 **UI 폼 로그인**(쿠키 주입이 아니라 실제 로그인):
```
/home  → 정상 렌더. "Oops"·"unexpected error" 0
사이드바 = 홈 / 운영 관제(모니터링·이벤/알림) / 자산과 구성(자산 관리·데이터 소스 관리)  — 메뉴 4
APM 그룹 없음(apmInSidebar=false)
전역 검색 "트레이스" → "일치하는 화면이나 호스트가 없습니다"
```
1회차의 `SideNav.tsx:211` `Cannot read properties of undefined (reading 'view')` 재현되지 않음.
검증 후 `role='ADMIN'` **원복 확인**(`1|admin|ADMIN`).

### D8 · D9 — PASS

| | 마지막으로 나온 버킷 | 새 버킷(18:40·18:45·18:50) |
|---|---|---|
| D8 `dmove_apm\|postgres` DB 쿼리 그룹(id 12) | **18:35**(구 jar가 채운 것) | **없음** ✅ |
| D9 `127.0.0.1` 의존 행 | **16:45** | **없음** ✅ (18:45 버킷의 chain 47건은 `apm_service_edge_5m`에 `SERVICE` 엣지로만) |

⚠️ 반영 노트대로 **과거 버킷의 기존 행은 남아 있다**(대입 UPSERT). 화면에서 창을 과거로 넓히면 여전히 보인다 — 결함이 아니라 알려진 한계.

부수 효과: D4 별칭 덕에 `qa-oldsemconv`의 DB 그룹 `query_norm`이 스팬 이름 폴백(`SELECT orders`)이 아니라
**진짜 쿼리**(`SELECT * FROM orders WHERE user=? AND id=?`)로 선다.

### D10 · D11 · D13 — PASS

```
POST /apm/traces/compare {}                       → 400 APM_TRACE_COMPARE_INVALID
POST /apm/traces/compare {baselineTraceId만}      → 400 APM_TRACE_COMPARE_INVALID
POST /apm/traces/compare {없는 id 2개}            → 404 APM_TRACE_NOT_FOUND      ← 갈렸다
USER 403 (17개 EP 동일)                            → {"code":403,"errorCode":"FORBIDDEN",
                                                     "message":"APM 화면을 볼 권한이 없습니다."}
GET /apm/install-guide?stack=dotnet                → SEMCONV_STABILITY_OPT_IN 2회
```
.NET 문구도 확인: `app.restart` 스텝에 *"🔴 아래 환경변수 **OTEL_SEMCONV_STABILITY_OPT_IN=http,database** 를
반드시 넣으세요 … MovesEye가 별칭으로 받아 주지만 그건 **구제**이지 정상 경로가 아닙니다(계측 버전이 올라가면
별칭이 먼저 사라집니다)"* — D4 반영과 문구가 일치한다.

## 8.2 FE 3차 화면 (브라우저, 헤드리스 Chrome CDP 9224)

### 배포 탭 — PASS

```
탭 라벨 "배포"  ant-tabs-tab-disabled 없음   data-testid="apm-deployments-tab" 존재
컬럼: 버전 | 시각 | 출처 | 롤아웃(기록) | 롤아웃(지금) | 메타      ← 롤아웃 두 열 ✅
행 4 (전체 4 items):
  1.2.0             2026-09-02 18:47:00  자동 감지  —    50% (인스턴스 1)  detectedBy=ingest
  9.9.9-webhook     2026-09-02 16:48:00  웹훅       20%  0%  (인스턴스 0)  commit=9f2c1a / pipeline=https://ci/1
  1.1.0             2026-09-02 16:47:00  자동 감지  —    50% (인스턴스 1)  detectedBy=ingest
  9.9.9-explicit-ts 2026-09-02 07:00:00  웹훅       —    0%  (인스턴스 0)  —
apm-deploy-rollout 4 · apm-deploy-current-rollout 4 · apm-deploy-source 4(자동 감지 2 / 웹훅 2)
apm-deploy-unselected · apm-deploy-webhook · apm-deploy-token-link · apm-deploy-auto-gaps 전부 렌더
```
BE `GET /apm/services/{uid}/deployments`의 4행과 **값까지 일치**.

### 행 선택 → 전후 비교 — PASS

```
apm-deploy-compare 렌더, 비교 창 15/30/60/180/360/1440분
canvas 3장 = 초당 요청 · 오류율 · p95            ← "전후 비교 막대 3장" ✅
apm-deploy-after-partial: "아직 23분치만 모였습니다(요청한 창 60분)"
                         "진행 중인 배포입니다. 두 창의 길이가 달라 건수를 그대로 비교하면
                          급감처럼 보이므로, 비율 지표만 나란히 놓았습니다."
meta: 배포 전 2 · 60분 / 배포 후 3,427 · 23분
note: "개선·악화 판정이 아닙니다 … · p50 -14.7 ms · p99 48.1 ms · Apdex -0
       · 배포 전 0 % → 배포 후 3.09 % · 0 rps → 2.39 rps"
신규 예외 표 1행:  Error | qa boom2 r2 tag=r2a | 72 | 72 | /boom2 | 18:57:50 | 19:03:30
웹훅 카드: 자동 감지 사각 3가지 + scope=deploy 안내 + curl 예시(서비스 uid가 박힌 실제 명령)
```
신규 예외 표가 D1의 `new-errors` API 결과와 같은 그룹을 가리킨다 — **두 층이 교차 검증됐다.**

### 개요 탭 RED 배포 markLine — PASS

`data-testid="apm-deployment-marker"` **3개**(요청수·오류율·응답시간 세 RED 차트에 각 1개), 라벨 `1.2.0`.
`moveseye-be` 서비스에서는 `p2-qa` 3개. 창에 배포가 없으면 0개(1시간 프리셋에서 0 관측) — 조건부 렌더 정상.

### exemplar 칩 3상태 — PASS (§8.1 D2 참조)

### 콘솔 에러

**APM 화면 고유 JS 예외 0.** 관측된 `Log.entryAdded(error)`는 전부
`Failed to load resource: 401`(액세스 토큰 30분 만료 → `/auth/refresh` 200 → 재시도)과
BE 재기동 순간의 `ERR_CONNECTION_REFUSED`뿐이다. 1회차의 React `key` spread 경고와 마찬가지로 P2 무관.

## 8.3 회귀

- 수신: `traffic.py base` 3,790요청 ×2 전건 200. 저장 트레이스 **307건**(목록 `전체 307`).
- 롤업: `apm_service_edge_5m`·`apm_db_query_group_5m`·`apm_dependency_5m` 새 버킷 정상,
  `min_ns`/`max_ns` 채워짐. 에러 그룹은 5분 주기+3분 LAG대로 **~6분 뒤** 새 그룹(83) 생성.
- 조회 EP **22개 전건 HTTP 200**(`overview`·`services/overview`·`collectors`·`alert-rules`·`live/snapshot`·
  `ingest/recent`·`ingest/drops`·`red-series`·`traces`·`scatter`·`{id}`·`flame`·`service-map`·`errors`·
  `db/queries`·`db/systems`·`dependencies`·`deployments`·`compare`·`new-errors`·`exemplars`·`settings`·`install-guide`).
  ⚠️ 1회차 문서의 "폐기통계"는 `/apm/ingest/drops`다(`/apm/ingest/drop-stats`는 404 — QA 쪽 오기).
- 화면: 트레이스 목록 10행 / 전체 307, `표본`·`느림(추정)`·`오류` 배지 3종, 산점도 canvas 1.
  워터폴 20스팬(`크리티컬 패스 212.7 ms / 전체 232.8 ms`), 탭 `워터폴`·`플레임`, 스팬 패널 정상.

## 8.4 새 결함

### 🔴 D17 [MED] CUMULATIVE 지표에서 exemplar의 **값이 버킷을 넘어 고정**된다 — 칩 라벨과 링크 대상이 서로 다른 요청을 가리킨다

- **현상**(16:45~17:15 창, `step=300`):

  | 버킷 | `maxMs` | `traceId` | `stored` | 그 traceId의 **실제** 지연 |
  |---|---|---|---|---|
  | 16:45 | 1,733.4 | 7a07953c… | false | — |
  | 16:50 | **5,822.0** | fcafd032… | true | **5,822.07 ms** ✅ 일치 |
  | 16:55 | **5,822.0** | 61507b7b… | false | (다른 요청) |
  | 17:00 | **5,822.0** | bff965f8… | false | (다른 요청) |
  | 17:05 | **104,881.2** | 162428ec… | false | (다른 요청) |
  | 17:10 | **104,881.2** | **fa6912e0…** | **true** | **130.9 ms** 🔴 **800배 차이** |

  값은 **같은 수가 여러 버킷에 그대로 반복**되고 `traceId`만 매 버킷 바뀐다.
  화면 칩은 `09-02 17:10 · 104.88 s`라고 적으면서 **`POST /auth/login`(130.9 ms)** 트레이스로 링크된다.
- **원인**: 히스토그램이 **CUMULATIVE**로 오면 `max`는 누적 최대라 리셋되지 않는데, 롤업이 그 값을 버킷 값으로
  그대로 싣는다. count/sum은 차분되지만 **max는 차분 대상이 아니다**. 붙는 exemplar는 그 export 배치가 실은
  최신 것이라 최대값을 낸 요청과 무관하다.
- **환경 격리로 확정**: 같은 BE를 `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`로만 바꿔
  재기동(19:15)하니 **그 시점 이후 버킷부터 값이 버킷마다 달라진다**(1,855.3 → 474.6 → 426.2 → 516.4 → 782.4).
  19:14 이전 버킷은 계속 13,069.5로 고정. **코드 아닌 것은 아무것도 바꾸지 않았다.**
- **왜 결함인가**: 설치 가이드가 이 환경변수를 *"🔴 권장 … 빠뜨려도 데이터는 받습니다(**CUMULATIVE도 처리**)"* 라고
  명시한다. 즉 **지원한다고 적어 둔 조합에서 값이 틀린다.** 그리고 이것이 D2의 `stored` 적중률을 구조적으로 더 낮춘다 —
  붙는 traceId가 "느렸던 그 요청"이 아니라 아무 최근 요청이라 tail 샘플링을 통과했을 이유가 없다.
- **재현**: `scratchpad/qa/p2r2/` — BE를 temporality 미지정(에이전트 기본=CUMULATIVE)으로 띄우고
  `GET /apm/services/{uid}/exemplars?...&step=60`을 10분 창으로 조회.
- **선택지(판단 재료)**: ① 누적 max를 이전 버킷 max와 비교해 **증가분이 없으면 그 버킷의 exemplar를 내리지 않는다**
  ② exemplar 항목에 `carriedOver:boolean`을 실어 FE가 회색 처리 ③ 가이드에서 delta를 **필수**로 승격.
- **→ 반영**(2026-09-02, BE): 선택지 ①②가 아니라 **출처를 바꿨다** — exemplar 값·시각을 정본으로 저장(V47 `exemplar_value`, 버킷 밖 시각은 폐기) + CUMULATIVE의 `min`/`max`는 NULL + 설치 가이드 5스택에 "극값·exemplar 값은 delta에서만 정확" 명시. 계약 `features/apm/core/contract_apm.md` §7.9.1 · `features/apm/core/contract_apm-read-api.md` §10 #17. ⚠️ **재검증 필요**: V47 적용 후 새로 쌓인 버킷에서만 값이 산다(이전 버킷은 라벨 `null`), 실시간 "느린 엔드포인트" Top이 CUMULATIVE에서 비는지도 함께 볼 것.

### D16 [LOW] 배포 목록 표가 로딩 중 **"이 기간에 감지된 배포가 없습니다"** 를 약 1초 보여 준다(스피너 없음)

- 콜드 마운트 타임라인 실측:
  ```
  4.5s  표 없음
  6.2s  rows 0 · spinning false · ant-empty "이 기간에 감지된 배포가 없습니다."
  7.3s  rows 4
  ```
- 데이터는 결국 들어오므로 기능 결함은 아니다. 다만 **"정상 동작처럼 보이는 빈 화면"**(D1이 HIGH였던 이유와 같은 계열)이고,
  로그인 직후처럼 `/auth/refresh`가 끼는 경로에서는 이 구간이 더 길어진다(첫 측정에서 12초까지 빈 상태였다).
- 선례: 메모리 `fe-dmovetable-loading-spinner` — `loading` prop을 안 넘기면 스피너/빈 상태 분기가 어긋난다.

### D18 [LOW] USER가 APM 화면을 URL로 직접 열면 화면마다 안내가 다르다 — 에러 화면만 "예외가 없습니다"

- 메뉴·전역검색에서는 숨겨져 있으나(D7 PASS) 주소를 직접 치면 골격은 렌더된다(데이터는 BE가 403으로 막으므로 유출 없음).
  그때 표시가 갈린다:

  | 경로 | USER에게 보이는 것 |
  |---|---|
  | `/application-monitoring/traces` | **"이 작업을 수행할 권한이 없습니다."** ✅ |
  | `/application-monitoring/overview` | 카드마다 **"이 작업을 수행할 권한이 없습니다."** ✅ |
  | `/application-monitoring/errors` | 🔴 **"이 기간에 발생한 예외가 없습니다."** — 권한 문구 0건 |
- 에러 화면만 403을 **빈 결과로 오인**해 그린다. 사용자는 "우리 시스템은 오류가 없구나"로 읽는다.
  D11로 `errorCode:"FORBIDDEN"`이 실리게 됐으니 그것으로 분기할 수 있다.

## 8.5 관찰(결함 아님)

1. **폐기 통계는 정규화된 키 이름으로 센다.** `http.url`을 보내면 `url.full`로 계상된다(별칭 해석이 거부 판정보다 먼저이므로 설계대로). 다만 "내가 보낸 키"로 화면에서 찾으면 없다.
2. **403은 여전히 `ERROR` 레벨 로그 한 줄을 남긴다.** 스택은 사라졌다(D3). 권한 거부가 오류 로그로 집계되는 것은 P2 이전부터의 전역 동작.
3. **서비스 상세 제목이 `qa-node ()`** 로 렌더된다 — `env`가 빈 서비스(qa-node·qa-python)는 괄호만 남는다. 순수 표시 문제.
4. `/apm/ingest/drop-stats`는 존재하지 않는다. 실제 경로는 **`/apm/ingest/drops`**(1회차 문서 §0 E-1의 "폐기통계" 표기가 모호했다).

## 8.6 미검증 항목과 이유 (2회차)

| 항목 | 이유 |
|---|---|
| `sampled_reason = "SLOW"` | 1회차와 동일 — 이 환경의 tail 샘플러가 정책 이름을 스팬에 심지 않는다 |
| exemplar 칩의 **"확인 불가"(구 BE) 3번째 상태** | 서버가 항상 `stored`를 싣는다. 구 BE 응답을 흉내 내는 것은 "우리가 만든 값"이라 하지 않았다. 단위 테스트(`apmDeployments.test.tsx`)가 덮는다 |
| 7일 보존 만료 · `totalCapped`(10만) · `truncated`(엣지 2,000) | 시간·데이터 규모 미달(관측 최대 307) |
| 다중 노드 배포 감지 경합 | 단일 프로세스라 재현 불가(계약 §11.6이 이미 미검증 표기) |
| D9의 **과거 버킷 잔여 행 소멸** | 대입 UPSERT라 롤업이 다시 도는 구간만 사라진다 — 설계대로이며 기다림이 필요 |
| D17의 **수정 후 재검증** | 이번 회차에서 처음 발견한 결함 |

## 8.7 환경 상태 (2회차 종료 시점)

**유지(다음 회차가 그대로 쓴다)**

| 대상 | 상태 | 이번 회차 변경 |
|---|---|---|
| BE `:3001` (pid 39060) | 200 | 🔴 **새 jar `5afa90b`**(`qa/p2/be.jar` 교체). `dmove_apm`에 **V46 적용 확인**. 기동 옵션은 `run_be.py` **기본값으로 복구**(D17 확인용 `…TEMPORALITY_PREFERENCE=delta` 실험은 되돌렸다) |
| FE `:5174` (pid 45308) | 200 | **변경 없음**(재기동 안 함, HMR 상태 그대로) |
| Collector `:4317/:4318` (pid 22576) | 200 | 변경 없음 |
| `qa-node` `:8801` (pid 6792) | 200 | 🔴 **`OTEL_SERVICE_VERSION=1.2.0`으로 재기동** + `server2.js`에 `/boom2` 라우트 추가(고유 예외 메시지, D1 `new-errors` 재현용) |
| `qa-python` `:8802` | 200 | 변경 없음 |
| **사용자 BE `:3000`** | 살아 있음 | **건드리지 않음** |
| **사용자 FE `:5173`** | `000` | **건드리지 않음** — QA **시작 시점부터** 내려가 있었다(첫 포트 스캔 기록) |

**QA DB(`dmove_apm`)에 추가된 데이터** — 운영 DB가 아니므로 정리하지 않았다
- `apm_deployment` id **6**(qa-node `1.2.0`, AUTO, `detected_at 18:47:00`)
- `apm_error_group` id **83**(`Error` / `qa boom2 r2 tag=r2a`, 72건, route `/boom2`)
- 수동 주입 트레이스 2건: `aa11…`(구 semconv 키만) · `aa22…`(구·신 혼재)
- `apm_db_query_group` 829·830(qa-oldsemconv mysql)

**원복 확인**
- `user.role` → **`ADMIN`** ✅ (`1|admin|ADMIN`)
- `apm_setting` → `maskSql:true`, `keepRawSql:false` ✅ (이번 회차엔 변경하지 않았다)
- `moveseye-be-spring` · `moveseyee_fe` **양쪽 `git status --porcelain` 비어 있음** ✅
- 제품 코드 수정 **0**
- 재현 산출물(일회성): `%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\p2r2\`
  (`q.sh`·`api.sh`·`relogin.sh`·`d4_legacy.py`·`cdp.mjs`·`uilogin.mjs`·`r2_user*.mjs`·`r2_fe3.mjs`·
  `r2_exemplar.mjs`·`r2_ex2.mjs`·`r2_ex3.mjs`·`r2_smoke.mjs`·`probe.mjs`·`netprobe.mjs`·`timeline.mjs`·`tr/`·`tr2/`)
