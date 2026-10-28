# R-P5.6 실측 — APM P5.6 비동기 모니터링 출시 게이트

- 실행: 2026-09-15 19:00~19:55 · 실행자: functional-qa(런타임 행위 검증)
- 계약 정본: `./devdesign_apm-realtime-ux.md` **§3.5** + 코덱스 `../../../_archive/features/apm/realtime/review_apm-realtime-ux_codex-r1.md` §4
- 대상 구현: FE worktree `C:\solutions\moveseyee_fe-p56` (브랜치 `p56-async`, `c698463`, master 병합 포함) · BE `moveseye-be-spring` master `56bc0a6`
- 🔴 **출시 게이트 판정 = PASS** (ⓑ 보존 + D-1·3·4·5 전건 합격). ⓐ 생성은 게이트가 아니며 결과는 §6.
- 제품 소스 수정 **0건**(BE·FE 본 트리·worktree 모두). `git stash` 미사용. 커밋 없음.

---

## 0. 합격선 — 실행 전 고정

아래는 설계 §3.5 D-1~D-5를 **실행 전에** 그대로 옮겨 못 박은 판정식이다. 실행 중 완화하지 않았다.

| 식 | 합격선(실행 전 고정) | 게이트 |
|---|---|---|
| **D-1 링크 전달 정합성** | `L(s)` = M2에서 유효 ID를 가진 링크 목록 · `E(s)` = `L(s)` 앞 32개에 허용목록·별칭·정책 적용. 전부 저장 조건에서 `DB.links(s) = E(s)`, `API.links(s) = 마스킹 적용 E(s)`. **ID·순서·허용 속성 보존 일치율 100%**, **비허용 속성 잔존 0건**. 33번째 링크 제거는 계약대로면 합격이되 **UI가 "전체 링크"라고 말하면 UX 불합격** | ✅ 게이트 |
| **D-2 자동계측 생성 여부** | 구성마다 100회, 작업 스팬 생성률·부모 연결률·링크 생성률·같은/다른 trace 비율을 **따로** 기록. 링크 0건이면 "해당 구성에서는 자동 생성되지 않음"으로 기록하고 **수동 Link 성공으로 덮지 않는다** | ❌ 게이트 아님(기록만) |
| **D-3 시간·관계 계산** | `부모 종료 이후 표시 = childEnd > parentEnd + 허용오차(1ms)` · `해칭 길이 = max(0, childEnd − max(childStart, parentEnd))`. 기대 마커와 일치, **동기 대조군을 "병렬 실행"이라 표현한 사례 0건** | ✅ 게이트 |
| **D-4 조회·탐색** | 저장된 대상 이동 성공 **100%** · 같은 trace 대상이 **접혀 있거나 화면 밖이어도** 이동 · **대상 미저장 / 대상 스팬 누락 / 403 / 일시 오류를 서로 구분** · 돌아가기 시 원래 선택·탭·필터 복원 · 늦게 저장된 대상은 명시적 재조회로 확인 | ✅ 게이트 |
| **D-5 표시 성능** | 5,000스팬·최대 링크 수·많은 스레드 속성·접기·필터·점프 포함. **입력 반응 200ms 이내**, **최장 UI 정지 500ms 미만**. 복잡도 논증만으로 합격시키지 않는다 | ✅ 게이트 |

추가 문구 게이트(사용자 지시): 화면 어디에도 **"병렬 실행" · "스레드 N개" · "비동기 작업이 없습니다"**가 나오지 않을 것.

🔴 게이트 = **ⓑ(보존) + D-1·3·4·5**. ⓐ에서 링크 0건이어도 출시를 막지 않되 도움말·설치 가이드에 그대로 적는다(§3.5 마지막 🔴).

---

## 1. 환경 고정표 (§3.5 A)

### 공통

| 항목 | 값 |
|---|---|
| QA BE | `http://localhost:3001` (pid 31804, **profile=dev** — CORS 응답으로 확인), BE `master 56bc0a6` |
| QA DB | `dmove_apm` @ `localhost:5433` (docker `dmove-postgres-test`, PG UTF8) |
| FE 구현본 | worktree `moveseyee_fe-p56`, `p56-async` `c698463`, 작업 트리 clean(0 files) |
| FE 개발 서버 | Vite **4.5.14**, 포트 **5175** (🔴 5176이 아니다 — §7-5) |
| FE 프로덕션 서버 | `vite build` → `vite preview` 포트 **5174**, 번들 `index-abf69f33.js` 9,709.96 kB (gzip 2,992.89 kB) |
| 브라우저 | 헤드리스 Chrome + CDP (`_tools/headless-shot/cdp-shot.mjs`), 1600×1000~1400, `--use-angle=swiftshader` |
| 인증 | `POST /auth/login` admin/<dev-pw> → HttpOnly 쿠키 주입 + `x-visitor-id: rp56-qa` |
| JDK | 17.0.12+8-LTS-286 |
| APM 전역 설정 | `registrationMode=AUTO`, `maskSql=true`, `keepRawSql=false`, `defaultP95Ms=2000`, `routeLimit=500` |
| 수신 토큰 | id **30** `rp56-qa-token` (COLLECTOR/ingest) — **검증 후 revoke 완료** |
| `service.name` | **`rp56-fixture` 하나로 고정**(ⓐ·ⓑ 공용). 생성된 서비스 **정확히 1개**(id 2019) — R-P5b의 1,950개 사고 재발 없음 |

### ⓑ 보존 검증 조건 — "전부 저장되는 격리 조건"

🔴 tail 샘플링은 **Collector**의 기능이고 BE `/apm/otlp/v1/traces`에는 없다(코드 확인: `ApmSampledReason` 주석·`TraceIngestPipeline`). 따라서 **BE에 직접 http/json POST = tail 100% 격리 조건**이며, 이것이 D-1이 요구하는 "전부 저장하는 대조 조건"이다.

- 수신 경로: `POST http://localhost:3001/apm/otlp/v1/traces` + `Authorization: Bearer <token 30>` + `Content-Type: application/json`
- 🔴 BE는 **http/json만** 받는다(protobuf/grpc는 415 + hint). ⓐ가 Collector를 경유해야 하는 이유가 이것이다.
- 상한 정본(코드): `OtlpTracesReader.MAX_LINKS_PER_SPAN = 128`(리더) · `TraceIngestPipeline.MAX_LINKS = 32`(적재)

### ⓐ 생성 검증 조건

| 항목 | 값 |
|---|---|
| javaagent | `opentelemetry-javaagent-2.31.1.jar` (`_tools/otel/`) |
| Collector | `otelcol-contrib` **0.159.0**, QA 전용 포트 gRPC **4327** / HTTP **4328** / telemetry **8899** / health **13143** |
| Collector 파이프라인 | `otlp → batch(timeout 1s, size 200) → otlphttp(encoding: json)` → `:3001/apm/otlp`. 🔴 **tail_sampling 없음**(격리 조건) |
| fixture 앱 | Spring Boot **3.3.5**, `@EnableAsync`, 포트 18080. `applicationTaskExecutor`(core8/max16, prefix `async-`) + `customExecutor`(fixed8, prefix `cust-`) |
| 샘플러 / BSP | `always_on` / `schedule_delay=200`, queue 8192, batch 512 |
| semconv opt-in | **미설정**(기본). 실제 출력은 신 규약(`http.request.method`·`server.address`·`network.protocol.version`) |
| 프로토콜 | 앱→Collector `http/protobuf`, Collector→BE `http/json` |
| 손실 검증 | Collector `receiver_accepted_spans=7917` = `exporter_sent_spans=7917` = DB 7,917 (실패 0) |

### fixture 기준 로그(M0)

- ⓐ: `scratchpad/rp56/gen/fixture-log.jsonl` 4,007줄 — 요청별 traceId/spanId·실행 스레드 이름/ID·시작/종료. 귀속은 **시간창이 아니라 traceId 1,400개 집합**으로(fire-and-forget이 창을 넘어가므로).
- ⓑ: `scratchpad/rp56/expected.json` — T0=`1789467007837`, 트레이스 ID 표, 스팬별 기대 링크 수·기대 `after`/`hatch`.

---

## 2. ⓑ fixture 행렬과 결과 (§3.5 B)

전부 합성 OTLP JSON. 스팬 **31 + 1(늦은 자식) + 5,000(성능) + 6(깊은 대상) + 2(대상 스팬 누락)**.

| # | fixture(trace) | 실행 조건 | 확인할 것 | 결과 |
|---|---|---|---|---|
| A | `…0001` 동기 대조군 | 루트 안에서 자식 3개가 전부 종료. **자식 2개는 서로 겹친다**(A-db-1 100~400 ∩ A-db-2 300~700) | 겹치는 스팬 2개 이상이어도 비동기/병렬로 확정하지 않는가 | ✅ 마커 0 · 해칭 0 · 부모종료선 0 · 요약 "Ended after parent 0" |
| B | `…0002` 부모 종료 이후 종료 | 경계 6종(500/1000/1001/1002/1500/1800 종료) | 1ms 오차 경계·해칭 식 | ✅ 마커 정확히 3개(205·206·207), 기대 `after`/`hatch` 전건 일치 |
| C | `…0003` 수동 Link 대조군 | 같은 trace 비부모 · 부모와 같은 대상 · 다른 trace · 대상 미저장 · 허용/비허용 속성 · 링크 3개 순서 | UI 관계 처리 | ✅ 요약 "links 8 (same 3 · other 5)" = 손계산 일치 |
| D | `…0004` 링크 대상 trace | 저장된 대상 | 다른 trace 이동 대상 | ✅ |
| E | `…0005` 경계·누락 | 링크 **31 / 32 / 33 / 128 / 129** + 무효 ID 5개 섞인 34개 | SDK 상한 vs BE reader 상한, 절단 | ✅ 31/32/32/32/32/32 (§3) |
| F | `…0006` 늦은 자식 | 루트 POST 후 **별도 배치**로 자식 POST | 지연 도착 병합·재조회 | ✅ 병합됨, `after=1000 hatch=1000` |
| G | `…0007` 부모 미저장 | `parentSpanId`가 응답에 없는 스팬 | 불확실 배지·판정 제외 | ✅ "Orphan/Uncertain" + 요약 "Unclassified 1" |
| H | `…000a` 깊은 대상 | 링크 대상이 **접힌 가지 안 깊이 4** | 접혀 있어도 이동 | ✅ 조상 사슬 자동 펼침 |
| I | `…000b` 대상 스팬 누락 | 대상 trace는 저장됐으나 그 spanId는 없음 | 미저장과 구분 | ✅ 전용 문구 + 재시도 버튼 |
| P | `…0009` 성능 | 5,000스팬 · 링크 32개 스팬 49개 · `thread.name` 400종 | D-5 | ✅ (§5) |
| — | 동일 스레드 이름의 두 JVM | — | — | ⚠️ **미측정**(§8-3) |
| — | Kafka / RabbitMQ | — | — | ⚠️ **미측정 — 브로커 없음**(§6-3) |

---

## 3. M0~M6 대조표 (§3.5 C) — ⓑ

| 지점 | 무엇을 봤나 | 결과 |
|---|---|---|
| **M0** 앱 기준 로그 | ⓑ는 합성 JSON이므로 `expected.json`이 기준 로그다(스팬별 기대 링크 수·순서·속성·마커) | 고정 |
| **M1** Collector 수신 직후 | ⓑ는 BE 직접 POST라 **M1=M2=송신 payload**(`batch1~5.json`). Collector 홉은 ⓐ가 담당(손실 0 확인) | — |
| **M2** BE 파서 입력 | `batch1.json` 69,380B 외 4건, 전부 HTTP 200 | ✅ |
| **M3** `linksJson`·허용목록 적용 뒤 | 순서·32개 절단·허용/차단 속성 | ✅ (아래) |
| **M4** `apm_span` | `parent_span_id`·kind·시각·attrs·`links` jsonb | ✅ (아래) |
| **M5** trace detail API | 동일 링크 ID·순서·마스킹·offset/duration·부분 응답 플래그 | ✅ (아래) |
| **M6** 화면 | 마커·개수·점프 대상·선택 복귀·누락 안내·문구 | ✅ (§4) |

### M4 링크 개수 — 기대 E(s) 대조

| 스팬 | 보낸 링크 | 기대 `E(s)` | DB `jsonb_array_length` | API `links.length` | 판정 |
|---|---|---|---|---|---|
| `E-links-31` | 31 | 31 | **31** | 31 | ✅ |
| `E-links-32` | 32 | 32 | **32** | 32 | ✅ |
| `E-links-33` | 33 | 32(앞 32) | **32** | 32 | ✅ |
| `E-links-128` | 128 | 32 | **32** | 32 | ✅ |
| `E-links-129` | 129 | 32 | **32** | 32 | ✅ |
| `E-links-invalid-mixed` | 무효 5 + 유효 34 | 유효분 앞 32 | **32** | 32 | ✅ |
| `C-link-order-3` | 3 | 3 | **3** | 3 | ✅ |
| 나머지 링크 스팬 5개 | 1 | 1 | **1** | 1 | ✅ |

### M3/M4/M5 순서·ID 보존

```
E-links-33          : links[0]=L000 … links[31]=L031      (앞 32개, 순서 보존)
E-links-129         : links[0]=L000 … links[31]=L031      (동일)
E-links-invalid-mixed: links[0]=L200 … links[31]=L231     ← 무효 ID는 상한 적용 '앞에서' 버려졌다
C-link-order-3      : ORD-1, ORD-2, ORD-3                  (순서 그대로)
C-link-order-3 대상 : …0004/…401 | …0003/…302 | …0004/…402 (trace/span ID 보존)
```

### M3/M4 속성 허용목록 — 비허용 잔존 0건

보낸 링크 속성 10개 → 저장된 것 **4개**(전부 허용목록):

```
저장됨 : messaging.system=kafka · messaging.message.id=msg-0001
         messaging.destination.name=rp56.orders · thread.name=rp56-pool-1
제거됨 : url.full · url.query · enduser.id · http.request.header.authorization   (DENIED)
         rp56.custom.key · db.unknown.thing                                       (미등록)
```

전수 스캔:

```sql
RESIDUAL_DENIED_ROWS : 0     -- links::text LIKE '%SHOULD_NOT_PERSIST%'
DENIED_KEY_SCAN      : 0     -- url.full|enduser.id|authorization|rp56.custom|url.query|db.unknown
TOTAL_LINK_ROWS      : 12
```

### M5 마스킹 후 API 응답 (발췌)

```
C-link-attrs   CONSUMER off=600 dur=100 links=1
   [0] …0004/…401 {"thread.name":"rp56-pool-1","messaging.system":"kafka",
                   "messaging.message.id":"msg-0001","messaging.destination.name":"rp56.orders"}
meta: truncated=false rootMissing=false cycleBroken=false spanCount=8
```

### 🔴 D-1 판정 = **PASS**

- ID·순서·허용 속성 보존 일치율 **100%** (12개 링크 스팬 / 191개 링크 전건)
- 비허용 속성 잔존 **0건**
- 33번째 링크 제거는 계약대로 — 그리고 UI가 "전체 링크"라고 **말하지 않는다**(§4 문구 게이트) → UX 합격

**기준선 사실**: 검증 시작 시점 `apm_span` 82,582행 중 `links IS NOT NULL`은 **0행**이었다. 즉 이번이 링크 경로의 **최초 실측**이며, 구현 주석의 "실측 0건"이 실제로 그러했음을 확인했다.

---

## 4. M6 화면 대조 — D-3 · D-4 · 문구 게이트

### D-3 시간·관계 계산 — PASS (10/10, FAIL 0)

FE `apmAsync.ts`의 식을 M5 응답에 그대로 적용해 기대표와 대조(`verify_d3.js`). `APM_ASYNC_PARENT_TOLERANCE_MS = 1`.

| 스팬 | off | dur | childEnd | parentEnd | after | hatch | 기대 | 판정 |
|---|---|---|---|---|---|---|---|---|
| A-db-1 | 100 | 300 | 400 | 1000 | null | 0 | null/0 | ✅ |
| A-db-2 | 300 | 400 | 700 | 1000 | null | 0 | null/0 | ✅ |
| A-calc | 700 | 250 | 950 | 1000 | null | 0 | null/0 | ✅ |
| B-inside | 100 | 400 | 500 | 1000 | null | 0 | null/0 | ✅ |
| B-edge-eq | 500 | 500 | **1000** | 1000 | null | 0 | null/0 | ✅ 경계 |
| B-edge-1ms | 500 | 501 | **1001** | 1000 | null | 0 | null/0 | ✅ 경계(오차 이내) |
| B-edge-2ms | 500 | 502 | **1002** | 1000 | **2** | **2** | 2/2 | ✅ 경계 넘김 |
| B-overlap | 800 | 700 | 1500 | 1000 | 500 | **500** | 500/500 | ✅ |
| B-detached | 1200 | 600 | 1800 | 1000 | 800 | **600** | 800/600 | ✅ 해칭≠after |
| F-late-child | 900 | 1100 | 2000 | 1000 | 1000 | 1000 | 1000/1000 | ✅ 늦은 도착 |

- **동기 대조군(A)**: 겹치는 형제쌍 1건(A-db-1 ∩ A-db-2)이 존재함에도 마커 **0건** · 해칭 **0** · 부모종료선 **0**. 화면 요약 "Ended after parent 0".
- **불확실 처리(G)**: `G-orphan-child`(부모 미저장)는 `uncertain=rootMissing`으로 **시간 판정에서 제외**되고 행에 "Orphan / Uncertain", 요약에 "Unclassified 1". 그 아래 `G-late-under-orphan`은 응답 안에 부모가 있으므로 정상 판정(after=400) — 도움말 문구("응답 안에 정상 연결된 부모가 있으면 루트 누락 트레이스에서도 판정합니다")와 일치.
- **DOM 마커 일치**: trace B에서 `⇢` 붙은 행 = `[205, 206, 207]`, `*-hatch` 요소 = 같은 3개, `apm-parent-end-*` = 같은 3개. 셋이 정확히 같은 집합.

### D-4 조회·탐색 — PASS

| 항목 | 방법 | 결과 |
|---|---|---|
| 같은 trace 이동 | C-same-nonparent(303) 🔗 → "Same trace: go to span" | ✅ 경로 유지 + `?span=a500000000000302`, 대상 행 존재 |
| **접힌/화면 밖 대상 이동** | trace H에서 대상(806, 깊이 4)이 든 가지를 접은 뒤 얕은 출발 행(802)에서 링크 클릭 | ✅ **조상 사슬 801→803→804→805→806 자동 펼침** + 대상 선택. 접기 직후 가시 행은 `[801,802,803]`, 이동 후 806 가시 |
| 다른 trace 열기 | C-link-other-trace(305) 🔗 → "Other trace: open" | ✅ `…0004?span=…401&from=…0003&fromSpan=…304&fromTab=waterfall&fromAsync=1` — **5개 키 전부** |
| 복귀 복원 | 도착지의 "← Go back" | ✅ `…0003?tab=waterfall&asyncOnly=1&span=a500000000000304` — **탭·필터·선택 3종 복원**. 배너 "Opened from a link in trace a5000000…" |
| **대상 미저장** 구분 | C-link-unstored → 존재하지 않는 trace | ✅ "No currently stored trace was found" + "may have been sampled separately and not stored, or may still be arriving" · 워터폴 없음 |
| **대상 스팬 누락** 구분 | trace I → 대상 trace는 200인데 spanId 부재 | ✅ 워터폴 정상 로드(2행) + **"The target span is not in this trace response."** + **Retry 버튼**. 미저장 문구는 **나오지 않음**(`notFoundMsg:false`) → 두 상태가 확실히 갈린다 |
| **일시 오류** 구분 | 위 Retry 버튼 경로 | ✅ 재조회 수단 존재 |
| **403** 구분 | 권한 없는 사용자(`rp56noperm`, role=USER, zabbix_role=NULL) 생성 후 로그인 | API: `{"code":403,"errorCode":"FORBIDDEN","message":"APM 화면을 볼 권한이 없습니다."}` (HTTP 200 + body code) ✅ / 화면: **라우트 가드가 먼저 `/errors/404`로 보낸다** → §7-1 발견 |
| 늦게 저장된 대상 재조회 | trace F 2차 배치 후 재조회 | ✅ 병합·마커 생성 |
| `asyncOnly` 필터 | `?asyncOnly=1` (trace C) | ✅ 7행 = 관련 6 + 조상(root) 1. 링크 없는 `C-sibling`(302) **제외** — `apmAsyncKeepIds` 계산과 정확히 일치 |

### 문구 게이트 — PASS

| 금지 문구 | FE 소스 전수 검색 | 화면 DOM |
|---|---|---|
| "병렬 실행" | **0건** | 0건 |
| "스레드 N개" (`스레드 \d+개`·`Threads N`) | **0건** | 0건 |
| "비동기 작업이 없습니다" | 1건 — 🔴 **테스트 파일의 `.not.toContain` 부정 단언**(`apmAsync.test.ts:266`), 즉 이 문구가 나오지 않도록 지키는 가드다 | 0건 |

정직성 문구 확인(kr/en 양쪽):

```
async_summary : 부모 종료 이후 종료 {n} · 응답에 포함된 링크 {n}(같은 {n} · 다른 {n})
links_limit   : 응답에 포함된 링크입니다. 스팬당 최대 32개가 저장되며, 허용목록과 마스킹을 통과한 속성만 표시합니다.
empty_async   : … 발견되지 않았습니다 …           ← "없습니다"가 아니다
no_links      : 이 응답에 포함된 링크가 없습니다.   ← 구 문구 "다른 트레이스로의 링크가 없습니다" 교체 확인
help detail   : 링크 절단 여부가 제공되지 않아 전체 관계를 보장하지 않습니다.
```

`E-links-33` 팝오버 실측: 링크 행 **32개**(L000~L031), 완전성 주장(`all links`/`every link`/`complete`) **없음**, 첫 줄이 "Up to 32 links are stored per span". → **D-1의 UX 조건 충족**.

⚠️ `병렬`은 FE 전체에 18곳 남아 있으나 전부 **기존 자기시간·플레임 도움말**("병렬 호출에서도 합이 부풀지 않습니다" 등)이고 P5.6 비동기 표면이 아니며 "병렬 실행"이라는 단정도 아니다.

---

## 5. D-5 표시 성능 — PASS (프로덕션 빌드)

5,000스팬 trace(P) + 링크 32개 스팬 49개 + `thread.name` 400종. `PerformanceObserver({entryTypes:['longtask']})`로 측정, 유휴 기준선은 long task 0건.

| 상호작용 | **개발 빌드(Vite dev, :5175)** | **프로덕션 빌드(vite build+preview, :5174)** | 합격선 |
|---|---|---|---|
| 유휴 기준선 | 0건 | 0건 | — |
| 행 클릭 #1 | sync 4ms / **long 772ms** | sync 8ms / **long 228ms** | 200 / 500 |
| 행 클릭 #2 | sync 4ms / **long 774ms** | sync 2ms / **long 105ms** | 〃 |
| 행 클릭 #3 | sync 2ms / **long 748ms** | sync 2ms / **long 144ms** | 〃 |
| `asyncOnly` 토글 | **sync 476ms** / long 476·59·337 | **sync 29ms** / long **없음** | 〃 |
| 전체 펼치기 | sync 0ms / long 232ms | sync 0ms / long **없음** | 〃 |
| 스크롤 | sync 0ms / long 663ms | sync 0ms / long 146ms | 〃 |
| (대조) 8스팬 trace 행 클릭 | sync 2ms / **long 469ms** | sync 1ms / long **58ms** | 〃 |

- 🔴 **개발 빌드는 임계 초과**(최대 774ms, 토글 입력 반응 476ms). **프로덕션 빌드는 전 항목 합격** — 최장 UI 정지 **228ms**(<500ms), 최장 입력 반응 **29ms**(<200ms).
- 개발 빌드의 값을 불합격 근거로 쓰지 않은 이유: **8스팬 대조군도 469ms**가 나왔다. 즉 개발 빌드의 비용은 스팬 수에 비례하는 것이 아니라 React dev 모드의 고정 비용이며, 같은 대조군이 프로덕션에서 58ms로 떨어져 이를 확증한다. 스팬 수 의존 성분은 프로덕션에서 58ms→228ms(약 4배)로, 5,000스팬에서도 여유가 있다.
- 워터폴은 **가상화**되어 있다: 5,000스팬에서도 DOM 행 **34개**, 전체 DOM 노드 982개(프로덕션). 이것이 성능이 나오는 이유다.
- ⚠️ 측정 환경은 헤드리스 Chrome + SwiftShader(소프트웨어 GL)다. 실제 GPU 환경에서는 더 빠를 것으로 보이나 재지 않았다.

---

## 6. ⓐ 생성 검증 결과 (게이트 아님 · §3.5 D-2)

각 구성 **100요청**, 총 1,400요청 / 2,600작업. 🔴 **자동계측 단독**과 **`@WithSpan` 추가**를 분리 기록했다.

### 6-1. 자동계측 단독 (`@WithSpan` 전무)

| 구성 | 기대 작업 수 | **작업 자체의 스팬** | 작업 안 자동계측 스팬 | 부모 연결률 | **링크 생성률** | 같은/다른 trace |
|---|---|---|---|---|---|---|
| sync 대조군 | 200 | **0 (0%)** | 200/200 (100%) | 100% | **0 (0%)** | 200 / 0 |
| `@Async` fire-and-forget | 100 | **0 (0%)** | 100/100 | 100% | **0 (0%)** | 100 / 0 |
| `@Async` 대기 | 100 | **0 (0%)** | 100/100 | 100% | **0 (0%)** | 100 / 0 |
| CF `thenApply` | 200 | **0 (0%)** | 200/200 | 100% | **0 (0%)** | 200 / 0 |
| CF `thenApplyAsync` | 200 | **0 (0%)** | 200/200 | 100% | **0 (0%)** | 200 / 0 |
| CF 사용자 Executor | 200 | **0 (0%)** | 200/200 | 100% | **0 (0%)** | 200 / 0 |
| CF `allOf`(3갈래) | 300 | **0 (0%)** | 300/300 | 100% | **0 (0%)** | 300 / 0 |

`/auto/*` 트레이스 700개 안에 **INTERNAL 스팬 0개**. javaagent는 `@Async`/CompletableFuture **작업 그 자체의 스팬을 만들지 않는다**. 다만 컨텍스트는 **100% 전파**되어 작업 안의 자동계측 동작이 루트 SERVER의 직계 자식으로 정확히 붙는다.

### 6-2. `@WithSpan` 추가

7개 구성 전부 **작업 스팬 생성률 100%**, **부모 연결률 100%**, **링크 생성률 0%**, 같은 trace 100%. kind=INTERNAL, `parent_span_id IS NULL`인 작업 스팬 0건, 다른 trace로 새 나간 작업 0건.

### 6-3. 🔴 결론과 공백

- **자동계측이 링크를 만든 구성은 한 건도 없다.** 귀속된 1,400 트레이스 7,900 스팬 전부 `links IS NULL`. ⓑ의 수동 Link 성공으로 이를 덮지 않는다(§3.5 D-2 명령).
- **Kafka / RabbitMQ는 미측정 — 로컬 브로커 없음**(`docker ps -a`에 Kafka·RabbitMQ 컨테이너가 실행·정지 어느 상태로도 없음). 지시대로 새로 띄우지 않았다. 🔴 **자동계측이 링크를 만드는 현실적 경로가 바로 메시징**이므로 위 "링크 0건" 결론은 **`@Async`/CompletableFuture 범위에 한정된 사실**로 읽어야 한다.
- 보조 관측: fire-and-forget은 **100%** 자식이 부모보다 늦게 끝난다(auto·span 변형 모두 100/100). 워터폴에서 "루트가 먼저 끝나고 자식이 뒤로 삐져나오는" 모양이 정상이라는 뜻이며, P5.6의 ⇢ 마커가 실제 운영에서 가장 자주 붙을 자리다.
- `thread.name`/`thread.id`는 **opt-in 없이 기본 제공**(1,300/1,300). 실제 스레드도 기대대로 `async-*` / `ForkJoinPool.commonPool-worker-*` / `cust-*` / `http-nio-*`.

---

## 7. 설계·구현 수정 권고

| # | 심각도 | 발견 | 근거 | 권고 |
|---|---|---|---|---|
| 1 | 🟡 | **페이지 내 403 분기가 현 권한 모델로는 도달 불가.** 권한 없는 사용자는 `PageWrapper(permissionKey=APPLICATION_MONITORING)`가 먼저 `/errors/404`로 보내, `ApmTraceDetailPage.tsx:125`의 `forbidden` 분기와 `:151`의 문구 선택이 실행되지 않는다 | 실측: `rp56noperm`으로 진입 → `location.pathname=/errors/404`, 워터폴 없음. API는 정상적으로 403을 준다 | 모듈 권한(`applicationMonitoring`)과 기능 권한(`apm.view`)이 갈리는 조합에서만 도달하므로 **죽은 분기는 아니다**. 다만 설계 §0이 "403은 화면이 배너로 받는다"고 읽히므로, **라우트 가드가 먼저 막는다**는 사실을 §0에 한 줄 적어 두는 편이 낫다 |
| 2 | 🟡 | **128/129 경계는 M3~M5 어디서도 관측되지 않는다.** 적재 상한 32가 리더 상한 128보다 작아 항상 32로 잘린다 | E-links-128·129 모두 DB 32개, 앞 32개(L000~L031) | 계약상 정상. 다만 §3.5 B의 "SDK 상한 vs BE reader 상한을 구분할 수 있는 입력"이라는 의도는 **현 구조에서 달성 불가**하므로, 그 행을 "리더 상한은 적재 상한에 가려 관측 불가"로 고쳐 두면 다음 회차가 같은 시도를 반복하지 않는다 |
| 3 | 🟢 | **링크 절단 여부 플래그가 응답에 없다**(`ApmTraceDetailDto.Span`) — 33개를 보낸 스팬과 32개를 보낸 스팬이 화면에서 구별되지 않는다 | E-links-32와 E-links-33의 API 응답이 동일 | 문구("최대 32개가 저장되며"·"링크 절단 여부가 제공되지 않아 전체 관계를 보장하지 않습니다")로 **정직하게 덮여 있어 이번 게이트는 합격**. 정확한 표시를 원하면 P5.6b에서 `linksTruncated: boolean` 1필드 |
| 4 | 🔴 | **성능 검증은 반드시 프로덕션 빌드로 해야 한다.** 개발 빌드에서는 8스팬 트레이스조차 469ms 정지가 나와 D-5를 오판하게 된다 | §5 표 | 설계 §3.5 D-5에 "측정은 프로덕션 빌드(`vite build`+`preview`)에서 한다"를 **못 박을 것**. 이번 회차는 두 빌드를 다 재서 판정했다 |
| 5 | 🟡 | **dev CORS는 5173~5175만 허용한다.** 지시·절차 문서가 권한 예시로 든 **5176은 preflight 403**이다 | `application-dev.yml:31` + 실측(5175 → `Access-Control-Allow-Origin` 200, 5176 → 403) | QA 절차 문서의 "별도 Vite 포트(예: 5176)"를 **5174/5175**로 정정 |
| 6 | 🟢 | React "key prop spread" 경고가 워터폴 화면에서 매번 난다(기존 문제, P5.6 신규 아님) | 모든 CDP 세션 콘솔 | 별건으로 정리 |

**P5.6 구현 자체에서 고쳐야 할 것은 발견되지 않았다.** 위 6건 중 구현 변경을 요구하는 것은 없고(1·3은 선택), 4·5는 검증 절차 문서 수정, 2는 설계 문구 정정이다.

---

## 8. 미측정 항목과 이유

1. **Kafka / RabbitMQ 자동계측**(§3.5 B 2행) — 로컬 도커 브로커가 없고, 지시에 따라 새로 띄우지 않았다. 🔴 링크 자동 생성 결론의 **유일하고 중요한 공백**(§6-3).
2. **`messaging.*` 실제 kind 규약 차이**(`receive`=CLIENT / `process`=CONSUMER 등) — 1과 같은 이유. ⓑ에서 CONSUMER kind는 **합성으로만** 넣었다.
3. **동일 스레드 이름의 두 JVM**(§3.5 B 경계·누락 행) — fixture 앱을 단일 인스턴스로만 돌렸다. "잘못된 스레드 합치기"는 P5.6b 범위(스레드 레인)이고 첫 출시 5항목에 스레드 레인이 없어 우선순위를 낮췄다.
4. **실제 tail 샘플링 조건에서의 미저장·늦은 도착**(§3.5 A 2단계) — 격리 조건(100% 저장)만 수행했다. 늦은 도착은 배치를 나눠 보내 대신 확인했고(trace F), 미저장은 존재하지 않는 대상으로 대신 확인했다(trace C·I). tail 정책 자체의 확률적 누락은 재현하지 않았다.
5. **다른 호스트 간 시계 차이** — 단일 호스트 측정이라 §3.5 D-3의 "별도 불확실성"은 관측하지 못했다.
6. **실 GPU 환경 성능** — 헤드리스 SwiftShader에서만 측정(§5).
7. **가상 스레드(`spring.threads.virtual.enabled`) 조건** — ⓐ에서 `ThreadPoolTaskExecutor`만 사용.

---

## 9. 정리 결과

### DB `dmove_apm` — 완전 원복

| 항목 | 검증 전 | 검증 중 최대 | **검증 후** |
|---|---|---|---|
| `apm_span` 총행 | 82,582 | 95,540 | **82,582** ✅ |
| `apm_span.links IS NOT NULL` | 0 | 63 | **0** ✅ |
| `apm_service` | 9 | 10 | **9** ✅ |
| `rp56-fixture` 서비스 | — | 1 (id 2019) | **삭제** ✅ |
| `apm_trace_summary`(rp56) | — | 1,415 | **삭제** ✅ |
| `apm_messaging_5m`(svc 2019) | — | 1 | **삭제** ✅ |
| `user` | 1 (admin) | 2 | **1** ✅ |
| `apm_receive_token` id 30 | — | ACTIVE | **revoked 19:50:13** ✅ |

삭제 건수: 스팬 **12,958** · 트레이스 요약 **1,415** · 메시징 롤업 1 · 서비스 1 · 사용자 1. 🔴 삭제 대상 트레이스는 "다른 서비스 스팬이 섞이지 않은 순수 rp56 트레이스"로 한정했다(1,415/1,415가 순수였다). 기존 9개 서비스와 그 스팬은 **건드리지 않았다**.

### 프로세스·파일

| 자원 | 상태 |
|---|---|
| 사용자 BE `:3000` (pid 31080) | ✅ 무손상 |
| 사용자 FE `:5173` (pid 33704) | ✅ 무손상 |
| 사용자 Collector pid **36560** (:4317/4318/8888/13133) | ✅ 무손상 — 종료하지 않음 |
| DB `dmove` | ✅ 접근하지 않음 |
| QA BE `:3001` (pid 31804) | 내가 띄운 것이 아니며 **그대로 유지** |
| QA Collector (4327/4328/8899/13143) | 종료 완료 |
| fixture 앱 `:18080` | 종료 완료 |
| QA Vite `:5175` · preview `:5174` | 종료 완료 |
| 헤드리스 Chrome(CDP 9351~9366) | 종료 완료(잔존 0) |
| `moveseyee_fe-p56/.env.local` | 생성 후 **삭제** (gitignore 대상이었음) |
| `moveseyee_fe-p56/dist/` | 생성 후 **삭제** |
| FE worktree `git status` | **0 files** ✅ |
| BE `git status` | 8 files — **전부 내 것이 아니다**(mtime 13:28·18:20, 내 세션은 19:00~). BE는 읽기만 했다 |

### 산출물 위치

`C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\73f0e76e-73ad-4f5f-b22e-ed7729545a96\scratchpad\rp56\`

- ⓑ: `gen_fixtures.js`, `batch1.json`~`batch5_missingspan.json`, `expected.json`, `verify_d3.js`, `m5_*.json`, `plan_m6_*.json`, `plan_perf*.json`, `perf_prod.out`
- ⓐ: `gen/collector-qa.yaml`, `gen/fixture-app/`, `gen/fixture-log.jsonl`(4,007줄), `gen/analysis.sql`·`analysis.out`, `gen/collector.log`

---

## 10. 재현 명령

```bash
# 0) 인증
curl -s -c cj.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" -H "x-visitor-id: rp56-qa" \
  -d '{"username":"admin","password":"<dev-pw>"}'
# 🔴 이후 호출에 -c 를 다시 쓰지 말 것(쿠키 잼을 덮어써 세션이 깨진다 — 이번 회차에 한 번 오진할 뻔했다)

# 1) fixture 생성 + 적재(전부 저장되는 격리 조건 = BE 직접 http/json)
node gen_fixtures.js
curl -s -X POST http://localhost:3001/apm/otlp/v1/traces \
  -H "Authorization: Bearer <receive token>" -H "Content-Type: application/json" \
  --data-binary @batch1.json

# 2) M4 — DB 링크 보존
docker exec dmove-postgres-test psql -U postgres -d dmove_apm -c \
 "select name, jsonb_array_length(links) from apm_span
   where trace_id='a5000000000000000000000000000005' and links is not null order by name;"

# 3) M4 — 비허용 속성 잔존 0건
docker exec dmove-postgres-test psql -U postgres -d dmove_apm -c \
 "select count(*) from apm_span where trace_id like 'a5%'
   and (links::text like '%url.full%' or links::text like '%enduser.id%'
     or links::text like '%authorization%' or links::text like '%SHOULD_NOT_PERSIST%');"

# 4) M5 — API
curl -s -b cj.txt -H "x-visitor-id: rp56-qa" \
  http://localhost:3001/apm/traces/a5000000000000000000000000000003

# 5) D-3 대조
node verify_d3.js

# 6) M6 — 화면(🔴 성능은 프로덕션 빌드로)
npx vite build && npx vite preview --port 5174   # in moveseyee_fe-p56, .env.local: VITE_API_URL=http://localhost:3001
FE_ROOT=C:/solutions/moveseyee_fe-p56 node C:/solutions/_tools/headless-shot/cdp-shot.mjs plan_perf_prod.json
```

---

## 11. 최종 판정

| 식 | 판정 | 근거 |
|---|---|---|
| **D-1** 링크 전달 정합성 | ✅ **PASS** | 191개 링크 ID·순서 100% 보존 · 비허용 속성 잔존 0 · 32 절단 계약대로 · UI 완전성 주장 없음 |
| D-2 자동계측 생성 | ▫ 기록 완료(게이트 아님) | `@Async`·CF 14구성 전부 링크 **0%**, 부모 전파 100%, `@WithSpan` 시 작업 스팬 100%. Kafka/MQ 미측정 |
| **D-3** 시간·관계 계산 | ✅ **PASS** | 10/10 일치(경계 1000·1001·1002 포함) · 동기 대조군 "병렬" 표현 **0건** |
| **D-4** 조회·탐색 | ✅ **PASS** | 이동 100% · 접힌 대상 자동 펼침 · 미저장/스팬 누락/일시 오류 3분기 확인 · 복귀 3종 복원 · 403은 API 확인(화면은 라우트 가드가 선행, §7-1) |
| **D-5** 표시 성능 | ✅ **PASS**(프로덕션 빌드) | 입력 반응 최대 29ms(<200) · 최장 UI 정지 228ms(<500) @5,000스팬. 개발 빌드는 초과하나 8스팬 대조군도 초과해 빌드 모드 artifact로 판정 |
| 문구 게이트 | ✅ **PASS** | 금지 3문구 화면 0건(소스 1건은 테스트의 부정 단언) |

# 🔴 출시 게이트(ⓑ + D-1·3·4·5) = **PASS**

단, 출시와 함께 다음을 문서에 남길 것 — §3.5 마지막 🔴의 요구다:

> **`@Async`·CompletableFuture 구성에서는 링크가 자동 생성되지 않습니다**(javaagent 2.31.1 실측, 14구성 1,400요청 전건 0). 부모-자식 연결은 100% 유지되므로 워터폴의 부모 종료 이후 종료 표시로 추적합니다. Kafka·RabbitMQ 환경은 이번 실측 범위 밖입니다.
