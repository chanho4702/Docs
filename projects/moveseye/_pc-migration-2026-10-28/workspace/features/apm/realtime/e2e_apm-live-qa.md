# E2E QA — APM P1.5 실시간 관제(Live) + R3 성능 수정 (2026-09-01)

- 대상: BE `:3001`(최신 미커밋 소스 jar, DB `dmove_apm` 도커 5433, V43 적용) · FE Vite `:5174`(`VITE_API_URL=http://localhost:3001`) · Collector `:4317/:4318` · 샘플 앱 `qa-node`(:8801) · `qa-python`(:8802).
- 정본: 설계 `./devdesign_apm-live.md` · 계약 `../core/contract_apm-read-api.md` §9 · 검수 요청서 `./review_apm-p1_5-live.md` §5.
- 재현 산출물(일회성): `%TEMP%\claude\C--solutions\73f0e76e-.../scratchpad/qa-live/` (`sse.py`·`burst3.py`·`count.py`·`cdp.mjs`·`*.jsonl`).
- 🔴 사용자의 `:3000`·`:5173`은 건드리지 않았고, 코드는 한 줄도 고치지 않았다.

## 0. 요약표

| 항목 | 판정 | 한 줄 |
|---|---|---|
| **A. SSE 프로토콜** | ✅ PASS | 첫 이벤트 `snapshot`(90칸) → `bucket` 10.0초(6칸) → `heartbeat` 30초. visitorId 3분기·무쿠키 401 전부 계약대로 |
| **B. 지연 실측** | ✅ PASS | 링 도달 **중앙값 8.9초·최대 12.6초**(n=7). SSE 도달 = 링 + 최대 1틱(실측 8.07초). **화면 도달 ≲ 23초** → "실시간(약 30초 이내)" 문구는 실측과 맞고 오히려 여유가 있다 |
| **C. 브라우저 Live 패널** | 🟢 대부분 PASS | 🔴 Chrome MCP 확장 미연결 → **헤드리스 Chrome + CDP**로 대체 검증(스크린샷 0장). 흐름·오류 표·점·토글·재접속·도움말 전부 통과. `enabled:false`·`__other__`·화면 집계 `null`은 재현 불가 |
| **D. R3 성능 수정** | 🟡 부분 | D2·D3·D4 ✅. **D1(24h cold 13초→?)은 미검증 — 전제 불성립**(R3 합성 볼륨이 이미 정리돼 현재 1m 테이블이 37,629행뿐) |
| **E. V43 · RAW_BOUNDS** | ✅ PASS | family별 UNIQUE 실동작(같은 숫자 격자 2행 공존) · `RAW_BOUNDS` 45건 · `poolWaitP95Ms` **4734ms → p50 3.0ms** |
| **F. 회귀 스모크** | ✅ PASS | 서비스 목록·개요·서비스 상세 개요 탭·수집기 상태 탭 4화면 전부 렌더, 에러 배너 0 |

**결함 판정: BE·FE 코드 결함 0건.** 배포·설정 견고성 권고 2건(§H-1 `X-Accel-Buffering` 부재, §H-2 실시간 점 기준이 칸 수 고정).

---

## A. SSE 프로토콜 — ✅ PASS

### A-1. 이벤트 순서·주기 (75초 캡처)

`python sse.py "visitorId=qa-live" 75 a1.jsonl`

| t(초) | event | bytes | 내용 |
|---|---|---|---|
| 0.053 | `snapshot` | 31,630 | svcs=3 · **buckets 길이 [90,90,90]** · enabled=true · bucketSeconds=10 · windowSeconds=900 |
| 8.474 | `bucket` | 3,738 | **buckets 길이 [6,6,6]** |
| 8.475 | `heartbeat` | 20 | `{"ts":1788264948329}` |
| 18.475 / 28.476 / 38.478 / 48.482 / 58.485 / 68.489 | `bucket` | ~3.3KB | 전부 6칸 |
| 38.478 / 68.489 | `heartbeat` | 20 | |

- `bucket` 간격 = **10.00초 × 6회** (편차 0.00~0.01초).
- `heartbeat` 간격 = **30.00 / 30.01초**.
- 첫 `bucket`이 8.47초에 온 것은 tick 스레드가 **연결 수와 무관하게 하나**(설계 §4)라 전역 틱에 맞춰지기 때문 — 연결 시점 위상 차이이며 결함이 아니다.
- 판정: 이벤트 이름·순서·주기·`buckets` 길이(90 vs 6) 전부 계약 §9.2대로. **PASS**

### A-2. `visitorId` 3분기 (계약 §9.3)

| 케이스 | 결과 | 판정 |
|---|---|---|
| `?visitorId=wrong-visitor` (세션과 불일치) | HTTP **401** `{"code":401,"message":"INVALID_TOKEN"}` | ✅ |
| `?visitorId=qa-live` (일치) | HTTP 200 `text/event-stream` + `snapshot` | ✅ |
| 쿼리 미지정 | HTTP 200 `text/event-stream` + `snapshot` | ✅ |

### A-3. 쿠키 없이 → **401** `INVALID_TOKEN`. ✅ (컨트롤러 도달 전 `JwtAuthFilter`가 막는다)

### A-4. `GET /apm/live/snapshot` envelope

```
HTTP=200 time=0.052s
status=success code=200
data keys = [bucketSeconds, enabled, endpoints, serverTime, services, windowSeconds]
enabled=true  bucketSeconds=10  windowSeconds=900  serverTime=1788264775057
services=3 (moveseye-be/dev, qa-node, qa-python), 각 buckets=90
```
계약 §9.4 필드 전부 존재·값 일치. ✅

### A-5. 토글 off 시 연결 종료 — ✅ (실측은 **C-5** 참조: 브라우저 소켓 3→2)
### A-6. `stream-timeout-seconds=1800` — ⚪ **미검증**(30분 대기가 필요해 이번 회차 범위 밖)

---

## B. 지연 실측 — ✅ PASS (목표 30초, 실측 화면 도달 ≲ 23초)

### B-0. 🔴 먼저 바로잡은 측정 전제 — "요청 시각의 칸"이 아니다

첫 시도는 *"버킷 경계 +0.3초에 버스트를 쏘고, **그 버킷 ts**에 나타나는 시각"* 을 쟀는데,
경계에서 2초·4초 떨어뜨리자 **90초를 기다려도 그 버킷에는 영영 안 나타났다**(`burst2_results.json` trial 2·3 = null).

원인은 결함이 아니라 OTel 메트릭의 성질이다 — 링의 칸은 **개별 요청의 시각이 아니라 exporter가 찍은 데이터포인트 시각(= export 시점)** 으로 정해진다. 그래서 한 버스트가 앞뒤 칸에 나뉘어 실린다.
👉 **이 문서의 지연 수치는 "요청 → 링의 아무 칸에서든 보이기까지"로 측정한 것이다**(`burst3.py`). 화면 관점에서 옳은 정의다.
👉 ⚠️ 부수 함의: 10초 칸은 "요청이 일어난 10초"가 아니라 **"export가 도착한 10초"** 다. 초 단위 정밀 상관에는 쓸 수 없다(설계가 "실시간이 아니라 30초 이내"라고 못박은 이유와 같은 뿌리).

### B-1. 링 도달 지연 (n=7, 버킷 내 위상 무작위, `qa-node` `/items/:id` 20건 버스트)

| # | 버킷 내 위상(초) | 링 도달(초) |
|---|---|---|
| 1 | 0.71 | **3.71** |
| 2 | 8.23 | 6.21 |
| 3 | 9.49 | 5.06 |
| 4 | 3.45 | 10.86 |
| 5 | 2.29 | 12.11 |
| 6 | 5.44 | 8.94 |
| 7 | 1.81 | **12.63** |

**중앙값 8.94초 · 최소 3.71초 · 최대 12.63초** (20건 전량이 링에 반영된 시각 기준, 폴링 해상도 0.3초)

### B-2. SSE 도달 = 링 도달 + 최대 1틱

같은 버스트를 SSE 캡처와 대조(`b_sse.jsonl`): 5회 전부 **t0 + 8.07초**에 `bucket` 이벤트로 도착.
tick은 10초 고정 주기이므로 SSE 추가 지연은 **0~10초**(기대 5초).

### B-3. 종합 — 문구 판정

| 구간 | 실측 |
|---|---|
| 앱 → 수집기 → BE 링 | 중앙값 8.9초 / 최대 12.6초 |
| 링 → SSE push | 0~10초 |
| SSE → 화면 렌더 | ~0 |
| **합계(화면 도달)** | **중앙값 ≈ 14초 · 최악 ≈ 23초** |

- 설계 예산 25~35초보다 **빠르다**. 이 환경 샘플 앱의 export 주기가 권장값(10초)이거나 그보다 짧기 때문으로 보인다(앱 설정을 직접 읽지는 못했다 — 프로세스 환경변수 접근 불가).
- 🔴 **화면 문구 "실시간(약 30초 이내)"은 실측과 모순되지 않는다**(실측 ≲ 23초 ≤ 30초). FE 문구 실물: `apm.live.note` = `"Live (within about 30 seconds) · {{minutes}}-minute window"` / 한국어 `"실시간(약 30초 이내) · {{minutes}}분 창"`. ✅ 계약 §9.5-1 준수.
- ⚠️ 단, **고객 앱이 `OTEL_METRIC_EXPORT_INTERVAL` 기본값 60초면 이 수치는 성립하지 않는다**(설계 §1이 이미 명시). 이번 실측은 "권장 설정을 지킨 경우"의 값이다.

### B-4. 부수 확인 — 건수 정확도 (링이 값을 부풀리지 않는가)

`/items/:id`로 **정확히 50건** 발사 → `endpoints` 행 `GET /items/:id requests=50`. **오차 0.** (`count.py`)
> 🔴 첫 측정에서 "24건 쐈는데 39건"으로 보였던 것은 **내 배경 트래픽 스크립트가 안 죽어 있었던 것**이 원인이었다(`pkill`이 이 셸에 없다). BE 결함 아님.

---

## E. V43 · RAW_BOUNDS — ✅ PASS

### E-1. `apm_hist_bounds` family 분포

```sql
select family, count(*) from apm_hist_bounds group by 1;
 db_operation_s 1 | duration_s 1 | gc_s 1 | observed 4 | pool_ms 1 | pool_s 1
```

🔴 **V43이 실제로 필요했다는 증거**: id=5 `pool_ms`와 id=10 `observed`의 `bounds`가 **문자 그대로 같은 배열**이다
(`{0,5,10,25,50,75,100,250,500,750,1000,2500,5000,7500,10000}`).
V43 이전의 `UNIQUE(bounds)`였다면 이 두 행은 공존할 수 없었고, 초 값이 ms 라벨로 읽혀 **1000배 사고**가 났을 자리다. ✅

⚠️ 관찰: `observed_ms` 행은 **0개**다. 현 환경에서 접기를 거부당한 격자가 전부 `unit="s"`(HikariCP semconv)라 그렇고,
코드(`ApmMetric1mStore.observedFamily`)는 `"ms"` 명시일 때만 `observed_ms`를 쓴다 — 설계대로다. **`observed_ms` 경로 자체는 이번 환경에서 미실증**.

### E-2. `apm_ingest_drop_stat`에 `RAW_BOUNDS` 등장 — ✅

| reason | metric_name | count | last_seen |
|---|---|---|---|
| `RAW_BOUNDS` | `db.client.connection.wait_time` | 45 | 21:16:17 |
| `RAW_BOUNDS` | `db.client.connection.use_time` | 45 | 21:16:17 |
| `REBUCKETED` | `http.server.request.duration` | 16 | 21:16:17 |
| `REBUCKETED` | `db.client.connection.wait_time` | 901 | **21:08:27**(구 jar 시점, 이후 정지) |

🔴 읽는 법: 같은 메트릭이 21:08까지는 `REBUCKETED`(=분할 재버킷을 했다)였다가 **21:08 이후로는 `RAW_BOUNDS`로 바뀌었다**. D2 수정이 런타임에 실제로 발동한 지점이 로그로 남았다.

### E-3. `poolWaitP95Ms` 정상화 — ✅ (D2가 고치려던 바로 그 값)

`GET /apm/services/{uid}/runtime?from=…&to=…` (⚠️ `from`/`to`는 **epoch ms**다. `now-1h` 문자열은 **200 + body code 400**)

| | 값 |
|---|---|
| 수정 전(설계서·`HistogramRebucketer` 주석의 실측) | **4734 ~ 4755 ms** |
| **지금(실측 60점, 최근 1시간)** | p50 **2.99 ms** · p90 21.7 ms · **max 113.3 ms** · 50ms 초과 3점 |

"≤ 수십 ms"에 부합. 최대 113ms는 24h 쿼리 부하 구간과 겹치는 값이라 실제 대기로 설명된다. ✅

---

## C. 브라우저 Live 패널 — ✅ 대부분 PASS (일부 재현 불가)

> 🔴 **검증 수단 변경**: Chrome MCP 확장이 이 세션에 연결돼 있지 않았다(`list_connected_browsers` → `[]`).
> 대신 **헤드리스 Chrome을 직접 띄워 CDP로 구동**했다(`chrome.exe --headless=new --remote-debugging-port=9223`, 드라이버 `cdp.mjs`).
> 판정은 전부 **DOM 어서션 + 차트↔표 전환으로 읽은 실제 값**이고, 스크린샷은 한 장도 찍지 않았다.
> ⚠️ 따라서 "픽셀이 어떻게 보이는가"(색·겹침)는 이 회차의 검증 범위가 아니다.

### C-1. 진입·헤더·연결 상태 — ✅

`http://localhost:5174/application-monitoring/overview?live=1`

| 확인 | 실제 |
|---|---|
| 패널 존재 | `[data-testid="apm-live-panel"]` ✅ |
| 토글 | `aria-checked="true"`, `disabled=false`, `ant-switch-checked` ✅ |
| 헤더 문구 | **"Live (within about 30 seconds) · 15-minute window"** ✅ (계약 §9.5-1, 창 길이는 `windowSeconds`에서 읽음) |
| 연결 상태 | **"Connected"** ✅ |
| 차트 3장 | `apm-live-chart-rps` / `-active` / `-error-rate` 전부 존재 ✅ |

### C-2. 🔴 차트가 오른쪽으로 흐르는가 — ✅ **정확히 실시간 속도**

차트↔표 전환(`sessionStorage['chartView:apm-live-chart-rps']='table'`)으로 **실제 점 값을 표로 읽어** 40초 간격 2회 비교:

- 두 시점 모두 **90행 고정**(= 창 15분 / 10초 칸).
- T+40초의 첫 3행이 T0의 **4번째 행**에서 발견됨 → **창이 정확히 4칸 = 40초만큼 밀렸다.** ✅
- 값도 함께 갱신(마지막 행 `3.8 rps` → `2.1 rps`).
- `append`가 아니라 ts 정렬 배열임을 뒷받침(행 수가 늘지 않고 밀린다).

### C-3. 🔴 지금 오류 나는 엔드포인트 표 — ✅

`qa-node /err`(HTTP 500) 트래픽 투입 → **40초 안에** 표에 등장:

| 서비스 | METHOD | route | 요청 | 오류 | 오류율 | 최대 | 배지 |
|---|---|---|---|---|---|---|---|
| qa-node | GET | `/err` | 92 | 92 | **100 %** | 1.2 ms | **Errors + Slow** |
| qa-node | GET | `/slow` | 32 | 0 | 0 % | 315.3 ms | Slow |
| moveseye-be | POST | `/apm/otlp/v1/metrics` | 14 | 0 | 0 % | 49.5 ms | Slow |

- `topError`·`topSlow`가 **동시에 붙는 행**을 실물로 확인(계약 §9.4 "둘 다 true일 수 있다"). ✅
- 오류율 100%가 정확(92/92). ✅
- ⚪ `__other__` 비링크는 **재현 불가** — route 상한 200에 걸리게 하려면 서비스 하나에 200개 넘는 route가 필요하다(샘플 앱은 4개). 코드상 `apmLiveIsOtherRoute`로 링크를 만들지 않는 분기가 있고 `data-testid="apm-live-endpoint-other"`가 붙지만, **런타임 미검증**.

### C-4. 🔴 서비스 카드 실시간 점 — ✅ **"기준 조정 필요" 아님, 그대로 잘 켜진다**

검수 요청서 §4의 우려("점 기준 2칸(20초)이 파이프라인 지연 3칸보다 짧아 실측에서 안 켜질 수 있다")를 직접 겨눈 실험:

| 시점 | 점 개수 | 어느 서비스에 붙었나 |
|---|---|---|
| 3개 서비스 모두 트래픽 | **9** | moveseye-be · qa-node · qa-python (카드 3곳 × 3서비스) |
| `qa-python`만 트래픽 중단 후 | **6** | moveseye-be · qa-node (**qa-python 사라짐**) |

- 트래픽이 있는 서비스는 켜지고, 끊긴 서비스는 꺼진다. ✅
- 우려가 현실화되지 않은 이유는 B의 실측이 설명한다 — **링 도달 중앙값 8.9초 < 20초(2칸)** 이므로 최근 2칸 안에 값이 들어온다. 다만 이 여유는 **export 주기가 짧을 때만** 성립한다: 고객 앱이 기본 60초면 2칸 기준은 거의 켜지지 않는다.
  👉 권고: 기준을 칸 수 고정이 아니라 **`bucketSeconds`와 무관한 "최근 N초"** 로 두거나, 상수를 3~4칸으로 올리는 편이 설정 변화에 강하다(현 상태로 결함은 아님).

### C-5. 토글 off → 연결 종료 — ✅ (설계 §7 "연결을 남기지 않는다")

Ant Switch를 **실제로 클릭**하고 헤드리스 Chrome 프로세스의 `:3001` ESTABLISHED 소켓을 셌다:

| 단계 | URL | 토글 | 연결 표시 | 차트 | **:3001 소켓** |
|---|---|---|---|---|---|
| ON(초기) | `?live=1` | checked | Connected | 있음 | **3** |
| **OFF** | `` (쿼리 제거) | unchecked | 없음 | **언마운트** | **2** ✅ |
| 다시 ON | `?live=1` | checked | Connected | 있음 | 2 |

- off 시 URL에서 `live=1`이 빠지고, 안내 문구(`off_hint`, "Turn Live on to watch incoming traffic…")가 뜨며, **소켓이 실제로 하나 줄었다**. ✅
- ⚠️ 다시 ON에서 숫자가 그대로인 것은 유휴 소켓 재사용으로 보인다(끊김의 증거는 OFF 구간의 감소로 이미 충분).

### C-6. 재접속(탭 새로고침) → `snapshot`으로 복원 — ✅

`Page.reload` 후 폴링:

| t | 연결 | rps 표 행 수 | 엔드포인트 |
|---|---|---|---|
| +2초 | (마운트 중) | — | 0 |
| **+4초** | **Connected** | **90** | **5** ✅ |
| +6/9/12초 | Connected | 90 | 5 |

창 전체(90칸)가 4초 안에 복원됐다 — `EventSource` 재연결 시 서버가 `snapshot`을 다시 주는 계약(§9.5-4)대로. FE가 `/snapshot`을 따로 부를 필요 없음도 확인.

### C-7. `?` 도움말 · 툴팁 — ✅

- `[data-testid="apm-help-live_panel"]` 클릭 → Popover:
  > "Traffic arriving right now, in 10-second buckets (live, within about 30 seconds). / A separate connection (SSE) you can switch on and off; the server pushes the newest buckets every 10 seconds. It is live but not second-by-second — the app's export interval (10 seconds is what we recommend) plus the collector's batching (5 seconds) mean values usually reach this screen 25-35 seconds after the request"
  - 🔴 지연 예산을 **화면 안에서** 설명하고 있다. 계약 §9.5-1의 취지와 일치. ✅
- 배지 툴팁: "Among the top endpoints by latency in the last 60 seconds." ✅

### C-8. `null`을 0으로 칠하지 않는가 — 🟡 **API 층에서만 확증, 화면 집계에서는 재현 불가**

- **API**: `qa-python` 트래픽을 끊자 최근 칸이 `{"requests":0, "errorRatePct":null, "p95Ms":null}`로 내려왔다 — 0%가 아니라 `null`. ✅ (계약 §9.4)
  `activeRequests`도 관측 없으면 `null`(`qa-node`는 Node 계측이 `http.server.active_requests`를 아예 안 내보내 **항상 null**).
- **화면**: Live 차트 3장은 `apmLiveSeries`가 **전 서비스를 합산**한다. BE 자기계측이 매 칸에 요청을 만들어 **합계가 0인 칸이 생기지 않아** `—` 렌더 경로를 이 환경에서 만들 수 없었다(표 90행 전부 값 있음, 대시 0개). → **미검증**(코드 경로는 `apmFormatOrDash`로 존재).

### C-9. 미검증 항목

| 항목 | 왜 |
|---|---|
| `enabled:false`(설치본이 실시간 끔) 안내 렌더 | `APM_LIVE_ENABLED=false`로 BE 재기동이 필요 — 가동 중 환경을 끄지 말라는 지시 |
| `__other__` 비링크 | route 상한 200 도달 불가(C-3) |
| 화면 집계에서 `—` | C-8 |
| 픽셀 수준(색·겹침) | 헤드리스 + 스크린샷 최소 원칙 |

---

## D. R3 성능 수정 — 🟡 부분 (D1은 전제 불성립)

### D-1. `GET /apm/services/overview` 24h — ⚪ **미검증(전제 불성립)**

⚠️ 지시문의 `?from=now-24h&to=now`는 **이 API의 형식이 아니다** — `from`/`to`는 `Long`(**epoch ms**)이고, 문자열을 주면 **200 + body `code:400`**("입력값 형식을 확인해 주세요")이 온다. epoch ms로 다시 측정했다.

| 구분 | 측정 |
|---|---|
| cold(서로 다른 24h 창 3회, 첫 접촉) | **0.026 / 0.027 / 0.021초** |
| warm(같은 창 3회) | **0.020 / 0.021 / 0.023초** |

🔴 **이 숫자로 "13초 → 개선"이라고 말할 수 없다.** R3의 13초는 합성 볼륨 데이터에서 나온 값인데 그 데이터는 이미 정리됐고(`r3/90_cleanup.sql`), 지금 `apm_metric_1m`은 **37,629행 / 서비스 3개**뿐이다. 이 규모에서는 어떤 구현이든 수십 ms다.
👉 검수 요청서 §3의 "⚠️ cold 13초→? 효과는 **미재측**"은 **이 회차에서도 해소되지 않았다.** 재현하려면 R3 적재 스크립트를 다시 돌려야 한다.
- 부수 확인: 응답 자체는 정상(`services` 3행 + `summary`·`envs`·`tags`), 값도 서비스별로 갈린다(qa-node `errorRatePct` 3.33%). ✅

### D-2. `apm_rollup` 실행 시간 · `maxBuckets` — 🟡

BE 로그(`be3001.log`):
```
21:13:59  Scheduler 'apm_rollup' done in 61ms (5m=262 1h=0)
21:18:59  Scheduler 'apm_rollup' done in 27ms (5m=141 1h=0)
```
- 5분 주기 실행이 **61ms · 27ms**로 정상 동작. ✅
- ⚪ `maxBuckets` 5m=60 상한은 **코드로만 확인**(`ApmRollupService.DEFAULT_MAX_BUCKETS_5M = 60`, `1H = 12`). 상한이 실제로 무는 것은 **밀린 구간이 5시간을 넘을 때**인데, BE가 계속 돌고 있어 워터마크가 현재(`rollup_watermark_5m = 2026-09-01T21:10`)라 **이번 회차에서 상한이 발동한 적이 없다**. 로그의 `5m=262`는 버킷 수가 아니라 **삽입 행 수**다(혼동 주의).

### D-3. 롤업 CTE 결과 · `mixed` — ✅

| | |
|---|---|
| `apm_metric_1m` | 37,629행 |
| `apm_metric_5m` | **7,822행** (시간대별로 계속 증가: 21시 403 · 20시 1,549 · 19시 1,564 …) |
| `apm_metric_1h` | 892행 |
| 워터마크 | `5m=2026-09-01T21:10` · `1h=2026-09-01T20:00` |
| **`mixed`(bounds_id 갈린 그룹)** | **로그에 WARN 0건** = `mixedBoundsGroups()==0` |

🔴 `mixed`는 0일 때 아무것도 찍지 않는 설계(`ApmRollupJob`은 `>0`일 때만 WARN)라, **로그에 없다 = 갈린 그룹이 없었다**. V43으로 family가 쪼개진 뒤에도 롤업 그룹 안에서 `bounds_id`가 갈리지 않았다 → **검수 요청서 §5-6에 대한 실측 답**. ✅

### D-4. 설치 가이드 notices — ✅

`GET /apm/install-guide?os=linux&stack=java` → `notices` **7건**(WARNING 4 · INFO 3). 필드는 `{code, level, text}`.
그중 R3 O1이 추가한 두 건 확인:
- `postgres-tuning` (WARNING) — work_mem 64MB · shared_buffers 25% 등
- `capacity-planning` (INFO) — 686B/행 · 9.6GB/일 등

⚠️ 지시문은 "`notices`에 `postgres-tuning`·`capacity-planning` **id**"라고 했는데 실제 필드명은 **`code`**다(`id`는 없다).

---

## F. 회귀 스모크 — ✅ PASS

| 화면 | 결과 |
|---|---|
| 서비스 목록 `/application-monitoring/services` | 테이블 **3행**(qa-node Degraded 0.76rps/19.69%/322.8ms · moveseye-be Up · qa-python Up), 에러 배너 0 ✅ |
| 개요 `/application-monitoring/overview` | 카드 **13**개, 에러 0 ✅ |
| 서비스 상세 개요 탭 `/services/{uid}?tab=overview` | 카드 13 · canvas 6 · 탭 12개(Overview~Settings) · 인스턴스 2개 표시, 에러 0 ✅ |
| 수집기 `/collectors` 상태 탭 | 표 **56행**(드롭 사유 목록 포함) · 탭 4개(Status/Tokens & config/Install guide/Registration & settings), 에러 0 ✅ |

---

## G. 🔴 검수 요청서 §5 "불안한 지점" — 항목별 실측 답

### §5-1. SSE 세션 대조가 선택적(visitorId 없으면 통과) — 우회 경로인가?

**답: 실질적 우회 경로가 아니다. 다만 "완화"인 것은 맞다.**

- 실측 3분기는 계약대로다: 불일치 **401** / 일치 **200** / 미지정 **200**.
- 🔴 **제품 클라이언트는 항상 보낸다** — 브라우저가 실제로 연 요청 URL을 CDP로 확인:
  `http://localhost:3001/apm/live/stream?visitorId=qa-live-browser` (`Network.responseReceived`, status 200, `text/event-stream`)
- 즉 "밀린 브라우저가 스트림만 계속 받는" 시나리오는 **FE로는 발생하지 않고**, 수동으로 `visitorId`를 뺀 클라이언트여야 하는데 그러려면 **이미 유효한 `accessToken` 쿠키를 갖고 있어야 한다**(없으면 401). 얻는 것이 "이미 인증된 주체가 세션 바인딩만 회피"라 위험 등급은 낮다.
- ⚠️ 남는 실제 구멍: **연결 중에는 다시 검사하지 않는다.** 다른 기기 로그인으로 밀려도 이미 열린 스트림은 최대 `stream-timeout-seconds`(30분) 흐른다. 설계가 인정한 트레이드오프이며, 좁히려면 timeout을 줄이는 것이 유일한 손잡이다(설계 §4).

### §5-2. 아파치 SSE 버퍼링 · 연결 누수 · 라이선스는 연결 시점에만

- **버퍼링**: ⚪ **미검증**(이 환경에 아파치가 없다). 다만 응답 헤더를 실측했고 **구체적 권고가 하나 나왔다**:
  ```
  Content-Type: text/event-stream
  Cache-Control: no-cache, no-store, max-age=0, must-revalidate
  Access-Control-Allow-Origin: http://localhost:5174
  Access-Control-Allow-Credentials: true
  ```
  🔴 **`X-Accel-Buffering: no`가 없다.** 이 한 줄은 nginx의 표준 무버퍼 신호이고 다른 프록시는 무시하므로 **넣어서 잃을 것이 없다**. 아파치 쪽은 여전히 `SetEnv no-gzip 1` + 프록시 flush 설정을 배포 전에 확인해야 한다.
- **크로스 오리진 쿠키**: ✅ **실동작 확인**. FE(:5174) → BE(:3001)에서 `ACAO`+`ACAC:true`가 붙고 `accessToken`(`SameSite=Strict`)이 실려 스트림이 붙었다. 단 이는 같은 `localhost`(포트만 다름)라 same-site였기 때문이다 — **호스트가 다른 실서버에서는 `app.cookie.same-site` 설정에 그대로 달려 있다**(Live 고유 위험이 아니라 앱 전체 API와 같은 조건).
- **연결 누수**: ✅ 토글 off로 소켓이 실제로 줄었다(C-5). 탭 여닫기 반복 누수는 ⚪ 미검증.
- **라이선스**: ⚪ 미검증(라이선스를 만료시켜야 함).

### §5-3. 메모리 상한 ~27MB(route 카디널리티 큰 서비스 미실측) — ⚪ **미검증**

샘플 앱의 route가 4개뿐이라 카디널리티 부하를 만들지 못했다. JVM 힙(`poolActive` 옆 `memoryUsed heap` 39~83MB)은 링 점유를 분리해 보여주지 않는다.

### §5-4. 액티브 트랜잭션은 "칸의 마지막 관측값" — ✅ **확인, 그리고 읽는 법 주의**

- `moveseye-be` `activeRequests` = 1.0~2.0(합이 아니라 마지막 값). `qa-python` = 0.0. **`qa-node` = 항상 `null`**.
- 🔴 `qa-node`가 null인 것은 결함이 아니라 **Node OTel 자동계측이 `http.server.active_requests`를 내보내지 않기** 때문이다(같은 시각 `requests`는 60건씩 들어온다). 관측 없으면 null이라는 규칙이 그대로 지켜졌다.
- ⚠️ 화면 영향: "액티브" 차트는 **그 지표를 내보내는 서비스만** 합산한다. 스택에 따라 서비스가 통째로 빠지므로, 이 차트를 "전체 동시 처리량"으로 읽으면 과소평가한다.

### §5-5. 증분 6칸 겹침 + 덮어쓰기 멱등성 — ✅ **실측으로 확증**

SSE 캡처 3벌(총 92 이벤트)에서 같은 `(serviceUid, ts)`가 여러 번 실린 경우를 전부 추적:

| 캡처 | 이벤트 | 서로 다른 (uid,ts) | 2회 이상 등장 | 늦게 채워짐(값 증가) | **값이 줄어듦** |
|---|---|---|---|---|---|
| `a1.jsonl` | 8 | 291 | 33 | 6 | **0** |
| `b_sse.jsonl` | 43 | 396 | 138 | 27 | **0** |
| `b3_sse.jsonl` | 41 | 387 | 132 | 12 | **0** |

- 전형적인 시퀀스가 `[0, 7, 7, 7, 7, 7]` · `[0, 30, 30, 30, 30, 30, 30]` 이다 — **처음 실릴 때는 반드시 0이고, 다음 tick에서 값이 채워진 뒤로는 변하지 않는다.**
- 🔴 **값이 줄어든 사례 0건 / 1,074키** → 늦게 도착한 이벤트가 앞 칸을 지우는 순서 문제는 **없다**.
- 🔴 동시에 이것은 **"증분을 1칸만 보내면 실시간 차트가 항상 0"** 이라는 설계 §4의 주장을 그대로 증명한다(맨 끝 칸의 첫 관측값은 예외 없이 0이었다).

### §5-6. V43 이후 family별 두 행 — 롤업 `bounds_id` 불일치 처리 — ✅ **정상**

- 같은 숫자 격자가 `pool_ms`(id 5)와 `observed`(id 10)로 **실제로 두 행 공존** 중(E-1).
- 그럼에도 롤업의 `mixed`(그룹 안 `bounds_id` 분열) WARN은 **0건**(D-3). 분리 병합이 깨지지 않았다.
- ⚠️ `observed_ms` 라벨 경로는 이 환경에서 **한 번도 타지 않았다**(거부된 격자가 전부 `unit="s"`). 반대 방향 1000배 방지 장치 자체는 미실증.

### §5-7. R3 수정의 결과 동일성(Q2 정렬 이관 · Q1 하이브리드가 %를 바꾸지 않는가) — ⚪ **미검증**

수정 전 빌드가 이 환경에 없어 A/B 비교가 불가능하다. 간접 확인만: `/apm/services/overview` 24h 응답의 `errorRatePct`가 서비스별로 갈리고(0.10% / 3.33% / 0.22%) 목록 화면의 상태 판정(Degraded/Up)과 모순되지 않는다.

---

## H. 결함 · 관찰

| # | 심각도 | 내용 | 재현 |
|---|---|---|---|
| 1 | **권고(LOW)** | SSE 응답에 **`X-Accel-Buffering: no` 헤더가 없다**. nginx 표준 무버퍼 신호이고 다른 프록시는 무시하므로 넣어서 손해가 없다. 실서버 프록시(아파치)에서 이벤트가 뭉쳐 오는 사고의 첫 방어선. | `curl -sI -b cookies.txt 'http://127.0.0.1:3001/apm/live/stream'` |
| 2 | **권고(LOW)** | 실시간 점 기준이 **칸 수 고정(2칸)** 이다. 지금은 잘 켜지지만(C-4), 그것은 **export 주기가 짧아 링 도달이 8.9초**이기 때문이다. 고객 앱이 기본 60초면 2칸(20초) 기준은 거의 켜지지 않는다 — "최근 N초"나 3~4칸이 설정 변화에 강하다. | C-4 |
| 3 | 관찰(정보) | `/apm/live/snapshot`이 마운트마다 **2회** 호출된다. `main.tsx`에 `React.StrictMode`가 있어 **dev 전용 이중 호출**로 보인다(프로덕션 빌드 미확인). | `performance.getEntriesByType('resource')` |
| 4 | 관찰(정보) | 링의 10초 칸은 요청 시각이 아니라 **exporter export 시각**으로 정해진다(B-0). 결함은 아니지만 "21:22:52의 요청"을 칸으로 되짚을 수 없다 — 화면 도움말/문서에 한 줄 있으면 오해를 막는다. | B-0 |
| 5 | 관찰(정보) | "액티브" 차트는 `http.server.active_requests`를 내보내는 서비스만 합산한다(`qa-node`는 항상 null). 전체 동시 처리량으로 읽으면 과소평가. | §5-4 |
| 6 | 문서 오류(사소) | 계약/지시문상 `install-guide`의 notice 식별자는 `id`로 적혀 있으나 실제 필드는 **`code`**다. | D-4 |

**BE·FE 코드 결함으로 판정한 것은 없다.** 1·2는 배포·설정 견고성 권고다.

---

## I. 재현 방법

```bash
cd "%TEMP%\claude\C--solutions\73f0e76e-73ad-4f5f-b22e-ed7729545a96\scratchpad\qa-live"
# 로그인 → cookies.txt
curl -s -c cookies.txt -H 'x-visitor-id: qa-live' -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"<dev-pw>"}' http://127.0.0.1:3001/auth/login
# A. SSE 프로토콜 75초 캡처
python sse.py "visitorId=qa-live" 75 a1.jsonl
# A. 인증 3분기
python sse.py "visitorId=wrong" 3 x.jsonl        # 401
python sse.py "" 3 y.jsonl --nocookie            # 401
# B. 지연 실측(10회, 위상 무작위)
python burst3.py
# B. 건수 정확도
python count.py
# C. 헤드리스 브라우저
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=9223 \
  --user-data-dir=...\qa-live\chromeprofile about:blank
node login.mjs && node tables.mjs && node flow.mjs && node toggle.mjs && node reload.mjs
# D/E. DB
docker exec dmove-postgres-test psql -U postgres -d dmove_apm \
  -c "select family,count(*) from apm_hist_bounds group by 1;" \
  -c "select reason,metric_name,count from apm_ingest_drop_stat where reason='RAW_BOUNDS';"
```

🔴 **주의 2가지**
1. `/apm/services/**`의 `from`·`to`는 **epoch ms**다. `now-24h` 문자열은 200 + body `code:400`.
2. 세션은 `visitorId`에 묶인다 — 다른 `visitorId`로 로그인하면 앞 세션이 401로 밀린다(측정 스크립트가 중간에 죽는 원인).

---

## J. 환경 정리

- 🔴 **BE(:3001) · Collector · 샘플 앱 · FE(:5174)는 지시대로 끄지 않았다.**
- 이번 QA가 띄운 것(헤드리스 Chrome 포트 9223 · 트래픽 스크립트 3종)은 **전부 정리했다**. 종료 후 확인:
  `CDP9223=000`(응답 없음) · `BE3001=200` · `FE5174=200` · `qa-node=200` · `qa-python=200` · LISTENING 7 포트 유지.
- ⚠️ Git Bash의 `ps`는 **인자를 보여주지 않아** `ps aux | grep <script>.sh`가 아무것도 못 찾는다(`pkill`도 없다). 배경 스크립트는 위처럼 PowerShell `Win32_Process.CommandLine`으로 찾아 죽여야 한다 — **이번에 실제로 안 죽은 트래픽이 측정을 한 번 오염시켰다**(B-4).
