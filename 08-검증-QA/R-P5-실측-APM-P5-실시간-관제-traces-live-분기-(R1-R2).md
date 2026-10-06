# R-P5 실측 — APM P5 실시간 관제 `traces/live` 분기 (R1·R2)

> 2026-09-15 · functional-qa · 코덱스 2회차 `reviews/review_apm-realtime-design_codex-r2.md` **§5.2~§5.5를 실측 계약으로** 수행.
> 설계 정본 `designs/devdesign_apm-realtime.md` §2.2·§3·§5·§6. 🔴 **측정 도중 15:04에 v1 → v2로 개정**되어, v2 원문에 대한 재측정을 §4에 따로 뒀다.
>
> 🔴 **제품 소스 수정 0.** 시제품·하네스·설정은 전부 scratchpad `rp5/`. 사용자 `:3000`·`:5173`·dev DB `dmove`는 접촉하지 않았다.
> 🔴 사용자 Collector(pid 36560, `:4317/:4318/:8888/:13133` → BE `:3000`)는 **건드리지 않았다**. RP5는 포트를 전부 분리한 **별도 인스턴스**다.


**결론 한 줄:** Collector 분기 자체는 타당하다(유실 **0.0000%** · 완료→링 p50 **585ms** · 슬림 스팬 **458B** · 장애 5종에서 저장 경로 무손상).
**그러나 설계 원문 그대로 구현하면 안 된다** — PII 4종 유출(§4.2) · `error_mode: propagate`가 저장을 **300% 중복**(§13) · 최악 배치가 **2MB 상한 초과**(§14) · feature gate가 실행 명령에 없어 PII 방어가 조용히 꺼짐(§6).
**R1 = 조건부 PASS(P0 반영 시) · R2 = FAIL**(R2-1 CPU 1.49배 · R2-8 저장 중복). 고쳐야 할 것은 §9의 **P0 7건**.

| 절 | 내용 | 핵심 판정 |
|---|---|---|
| §0 | 합격선 **사전 고정** | 코덱스 §5.2~5.5 그대로 |
| §1·§2 | 환경 · 동작하는 최종 yaml | 부하 천장 **600 SERVER/초**(호스트 한계) |
| §3 | R1 — OTTL·PII·분기·유실·지연·바이트 | 유실 0 · 지연 p50 585ms · PII는 조합에 따라 갈림 |
| §4 | **설계 v2 원문 재측정** | 고친 것 7 · **남은 유출 4** |
| §5 | R2 A/B (OFF→ON→OFF) | CPU **1.49배 FAIL** · 저장 정확성 PASS |
| §6 | 배포 결합 위험(feature gate) | 🔴 yaml만 고치면 PII 3종 + 전송량 47% |
| §7 | 설계 §5 추정 대비 실측 | 스팬 크기·gzip은 설계가 맞거나 유리 |
| §10~§14 | 지연·BSP · 큐 오버플로 · 장애 5종 · **propagate 중복** · **최악 배치** | §13·§14가 신규 FAIL 2건 |
| §15 | 종합 판정표 | R1 10항목 · R2 10항목 |
| §9·§16·§17 | 권고 · 미측정 · 원복 | P0 7 · P1 3 · P2 1 |

---

## 0. 합격선 — 실행 **전** 고정 (pre-registration)

> 아래는 코덱스 §5.4·§5.5 판정식을 그대로 옮긴 것이다. **측정 뒤 바꾸지 않는다.**
> 이 절은 첫 측정 실행 이전에 작성해 커밋했다(작성 시각 2026-09-15 14:4x, 첫 부하 실행 15:0x).

### 0.1 R1 합격선

| # | 검증 | 합격 판정식 (고정) |
|---|---|---|
| R1-1 | 분기 정확성 | 비대상(SERVER 아님·자기계측) 오포함 **= 0** ∧ 정상 적격 SERVER의 의도치 않은 필터 탈락 **= 0** |
| R1-2 | PII 제거 | 캡처 서버가 받은 **BE 파싱 전 live HTTP 본문**에서 금지 문자열 통과 **= 0**. 동시에 정상 fixture(route·service·instance·status_code)는 전달될 것. **전부 버려서 0건이 된 결과는 불합격** |
| R1-3 | 정상 유실 | `loss = |E \ A| / |E| < 0.001` (E=Collector 도달 적격 SERVER ID, A=캡처 수신 ID). **각 반복 모두** 충족 |
| R1-4 | 집계 정확성 | 수용된 고유 관측의 count·오류·slow 오차 **= 0** (버킷 귀속은 `endTs` 기준) |
| R1-5 | 표본 분리 | `stats.count = 수용 고유 관측 수` ∧ `displayed ≤ 상한`. reservoir 탈락이 `rejectedSpans`를 늘리면 **불합격** |
| R1-6 | TTL 영향 | hot path DB 호출 **= 0**. TTL마다 반복 거절하면 불합격 |
| R1-7 | 지연 | `p50(완료→링) < 5s` (기존 기준) · 추가 제안 `p95(완료→화면) ≤ 5s`, `p99 ≤ 10s`. **유실률과 함께** 통과해야 함 |
| R1-8 | 늦은 도착·중복 | 버킷 귀속 오류 = 0 · 계약 dedup 기간 안 추가 집계 = 0 · 5초 이후 수정이 FE 미반영이면 불합격 |
| R1-9 | 부분 성공 응답 | BE 수량 보존식 일치 · 유효 `partialSuccess`는 재전송 **= 0** + WARN 확인 · 503도 retry OFF에서 exporter 재시도 **= 0** |
| R1-10 | URL·본문 상한 | 목적 경로 일치 · 제한 이하 수용 · 초과 계약대로 거절. 평균 크기만 확인하면 미완료 |

### 0.2 R2 합격선

| # | 검증 | 합격 판정식 (고정) |
|---|---|---|
| R2-1 | 정상 CPU | `C = ΔCPU_seconds / Δwall_seconds`; 잠정 `C_ON / C_OFF ≤ 1.20` |
| R2-2 | 정상 메모리 | 잠정 `RSS_ON,p95 / RSS_OFF,p95 ≤ 1.20`, peak는 설정 예산(`memory_limiter` 512MiB) 이내 |
| R2-3 | 저장 처리량 | 추가 유실 = 0 ∧ 추가 중복 = 0 ∧ `T_ON / T_OFF ≥ 0.99` |
| R2-4 | 저장 지연 | `L_ON,p95 − L_OFF,p95 ≤ max(0.1 × L_OFF,p95, 500ms)` |
| R2-5 | live 무응답 | live EP만 3초 초과 무응답 120초 → 저장 기준 유지 · live 실패 계수 증가 · retry OFF 유지 |
| R2-6 | HTTP 거절 | 429·503·전량 metadata 거절 partialSuccess 각 120초 → 응답별 전송 실패/WARN/거절 계수가 구분될 것 · 저장 추가 유실·중복 = 0 |
| R2-7 | 연결 거부·reset | 저장 기준 유지 · live 큐·in-flight가 선언 상한 초과 시 불합격 |
| R2-8 | transform 실패 | receiver 응답·SDK 재전송 확인. 저장 분기에 추가 유실·중복이 생기면 **현재 배치 순서 불합격** |
| R2-9 | 메모리 압박 | 지원 예산 안에서는 저장 기준 유지 · OOM = 0 · 무한 증가 = 0 |
| R2-10 | 복구·freshness | 잠정 30초 안에 live 큐 정상화, 60초 안에 RSS 장애 전 범위 복귀 |

**R2 최종 판정식:** `PASS = 저장 추가 유실 0 ∧ 저장 추가 중복 0 ∧ 저장 처리량·지연 기준 충족 ∧ 모든 live 큐·동시성·메모리가 선언 상한 이내 ∧ 실패·부분 거절·복구를 관측 가능`

### 0.3 실행 전 선언한 계약 이탈 (측정 전 명시)

| 항목 | 코덱스 계약 | 이번 실행 | 사유 |
|---|---|---|---|
| 반복·시간 | 프로필당 준비 2분·측정 10분·drain 2분 × **3회** | 프로필당 측정 **3~10분 × 1~2회** | 단일 QA 호스트(14코어)에서 L1~L5 × 3회는 10시간 이상. 시간 축소는 **측정 후 판정 완화 사유로 쓰지 않는다** — 반복 부족은 각 표에 `반복 n=` 으로 남긴다 |
| 부하원 | 샘플 앱 + 합성 OTLP 주입 | **합성 OTLP 주입 단독**(BSP 에뮬레이션) | 샘플 앱(qa-node/qa-python)은 1,000 SERVER/초를 낼 수 없다. BSP A/B는 **SDK 에뮬레이션**이며 실 javaagent 2.31.1 측정이 아니다 — R7에서 별도 필요 |
| BE 라이브 EP | `POST /apm/otlp-live/v1/traces` | **미구현**(P5.1 본 구현 전) → 캡처 서버가 대역 | R1-4·R1-5·R1-6·R1-8은 BE 링·집계가 있어야 측정 가능 → **미측정**으로 남긴다 |
| 저장 경로 | 실 BE `:3001` `/apm/otlp/v1/traces` | 그대로 사용(`dmove_apm`@5433) | — |


---

## 1. 환경 (§5.2 공통 준비 기록)

| 항목 | 값 |
|---|---|
| 호스트 | Windows 11 Pro 26200 · 14 논리코어 · **기준 CPU 부하 54~72%**(IntelliJ·Docker Desktop·Chrome·Mattermost 상주) 🔴 격리 환경이 아니다 |
| Collector | `otelcol-contrib 0.159.0` (`C:\solutions\_tools\otel\otelcol-contrib.exe`) — **RP5 전용 별도 인스턴스** grpc `:4327` · http `:4328` · self `:8889` · health `:13134` · 큐 `scratchpad/rp5/queue` |
| 사용자 Collector | pid 36560, `:4317/:4318/:8888/:13133` → BE `:3000`. **손대지 않음**(공존 확인) |
| BE(저장 경로) | QA `:3001` — `scratchpad/qa/p4/be.jar`(pid 31804, JDK17 `-Xmx1g`, dev, DB `dmove_apm`@5433 도커) |
| 수신 토큰 | `POST /apm/receive-tokens` 로 신규 발급 — id **29** `rp5-live-measure`(COLLECTOR/ingest). QA DB 쓰기 1건 |
| 기준 yaml | `POST /apm/collector-config {tokenId:29, os:"windows", slowMs:2000, normalPct:2, memoryLimitMib:512}` **실제 생성물** → `rp5/gen_base.yaml`(129줄) |
| 부하원 | 합성 OTLP/HTTP JSON 주입 `rp5/gen.mjs` (BSP 에뮬레이션: scheduleDelay·maxExportBatch 512·maxQueue 2048·maxInflight 8) |
| 캡처 서버 | `rp5/capture.mjs` `:4401` — gzip JSON 수신, 도착 시각·바이트·스팬 ID 기록, PII 심층 스캔, 장애 주입(`hang/429/503/refuse/partial/refuse`) |
| 저장 경로 프록시 | `rp5/sproxy.mjs` `:4402` → BE `:3001`. **OFF·ON 양쪽에 동일하게 끼워** 처리량·지연·중복을 같은 자로 잰다 |
| 시계 | 모든 지점이 **동일 호스트 단일 시계**(`Date.now()`) → 호스트 간 시계 오차 항목은 해당 없음 |
| 부하 실측 상한 | 🔴 **약 600~650 SERVER/초(전체 약 5,000 스팬/초)가 이 호스트의 천장**이다. 워커 1·2·4개 모두 같은 값(생성기 직결 614/초) → L2(1,000)·L3(1,500)·L5(5,000)는 **도달 불가**. 본 측정은 **L2′ ≈ 600 SERVER/초**로 부른다 |

## 2. 최종 동작 yaml — 네 판의 차이가 곧 결론

> 🔴 **판본 주의.** 설계서 `devdesign_apm-realtime.md`는 **측정 도중인 2026-09-15 15:04에 개정**되었다(코덱스 r2 반영 = 설계 v2).
> 아래 **H1~H3은 개정 *전* 초안(설계 v1 §2.2)** 을 출발점으로 삼은 내 하네스 반복이고, **§4가 개정 *후* 설계 v2 원문**에 대한 재측정이다.
> H1→H3에서 찾은 것 중 설계 v2가 이미 고친 항목은 §4에 그렇게 적었다.

| 판 | 내용 | PII 결과 |
|---|---|---|
| **H1 (설계 v1 §2.2 초안 그대로)** | `rp5/rp5_live.yaml` | 🔴 **13종 중 6종 유출** |
| **H2** (+scope name/version/schema_url, +resource schema_url, +truncate_all, **+`--feature-gates=ottl.set.allowNil`**) | `rp5/rp5_live_v2.yaml` | 🔴 **2종 유출**(허용 키의 *값*) |
| **H3 = 유출 0을 만든 최소 조합** (+`redaction/live` 를 라이브 파이프라인에 편입) | `rp5/rp5_live_v3.yaml` | ✅ **0종** |
| **D2 = 설계 v2 §2.2 원문** | `rp5/design_v2.yaml` | §4 |

### 2.1 H3 `traces/live` 블록 (실행 검증됨)

```yaml
processors:
  filter/live-server:
    error_mode: ignore
    traces:
      span:
        - 'kind.string != "Server"'
        - 'IsMatch(resource.attributes["service.name"], "^(otelcol|moveseye-be).*")'
  transform/live-slim:
    error_mode: propagate
    trace_statements:
      - context: resource
        statements:
          - keep_keys(attributes, ["service.name", "service.instance.id", "deployment.environment.name"])
          - set(schema_url, "")                 # ← 설계 v1·v2 **양쪽 모두 없는 문장**. schemaUrl 로 문자열이 샜다
      - context: scope
        statements:
          - keep_keys(attributes, [])
          - set(name, "")                       # ← 설계 v1·v2 **양쪽 모두 없는 문장**. scope.name 으로 샜다
          - set(version, "")                    # ← 설계 v1·v2 **양쪽 모두 없는 문장**
          - set(schema_url, "")                 # ← 설계 v1·v2 **양쪽 모두 없는 문장**
      - context: span
        statements:
          - keep_keys(attributes, ["http.route", "http.request.method", "http.response.status_code", "error.type", "rpc.system"])
          - set(name, "")
          - set(status.message, "")
          - set(trace_state, "")
          - set(events, nil)                    # 🔴 --feature-gates=ottl.set.allowNil 없으면 조용히 무시된다
          - set(links, nil)                     # 🔴 같음
          - truncate_all(attributes, 256)
  redaction/live:                               # ← 설계 v1·v2 **양쪽 모두 없는 문장**. keep_keys 는 '키'만 거른다 — 허용 키의 '값'은 그대로 나간다
    allow_all_keys: true
    blocked_values:
      - '\b\d{6}-\d{7}\b'
      - '\b(?:\d[ -]*?){13,16}\b'
      - '[\w.+-]+@[\w-]+\.[\w.]+'
  batch/live: { timeout: 1s, send_batch_size: 1000, send_batch_max_size: 2000 }

exporters:
  otlphttp/moveseye-live:
    traces_endpoint: "${env:MOVESEYE_LIVE_TRACES_URL}"    # 완전 URL. ✅ 실측 url_path=/apm/otlp-live/v1/traces 로 정확히 감
    encoding: json
    compression: gzip
    headers: { Authorization: "Bearer ${env:RECEIVE_TOKEN}" }
    timeout: 3s
    sending_queue: { enabled: true, sizer: requests, queue_size: 5, num_consumers: 1,
                     wait_for_result: false, block_on_overflow: false }
    retry_on_failure: { enabled: false }

service:
  pipelines:
    traces/live: { receivers: [otlp],
                   processors: [memory_limiter, filter/live-server, transform/live-slim, redaction/live, batch/live],
                   exporters: [otlphttp/moveseye-live] }
```

**기동 명령에 feature gate가 반드시 붙는다(설계 v2도 같은 요구):**
```
otelcol-contrib --config file:<...>/rp5_live_v3.yaml --feature-gates=ottl.set.allowNil
```

## 3. R1 — 분기·PII·정합성·지연

### 3.1 OTTL 구문 실측 (N8 사전 검토 답)

`otelcol-contrib validate` + **런타임 통과 데이터 검사**를 둘 다 했다. 🔴 **validate 통과는 아무 증거가 아니다** — 아래 6개 전부 validate를 통과하지만 런타임 동작은 갈린다.

| 구문 | validate | 런타임 실측 |
|---|---|---|
| `kind.string != "Server"` | ✅ | ✅ 동작. SERVER만 남고 CLIENT/INTERNAL 0건 통과 |
| `keep_keys(resource.attributes, [...])` | ✅ | ✅ 허용 3키만 남음(`process.command_line` 제거 확인) |
| `keep_keys(scope.attributes, [])` — `context: scope` | ✅ | ✅ scope attributes 제거 |
| `set(name, "")` (span) | ✅ | ✅ 제거. 🔴 **JSON에 `name` 필드 자체가 사라진다**(proto3 기본값 생략) — 빈 문자열이 아니라 **부재**다. BE 파서는 `name` 없음을 정상으로 받아야 한다 |
| `set(status.message, "")` · `set(trace_state, "")` | ✅ | ✅ 제거 |
| **`set(events, nil)` · `set(links, nil)`** | ✅ | 🔴 **게이트 없으면 조용히 무시**(`ottl.set.allowNil` 기본 **false/Alpha**). events·links PII가 **100% 통과**했다. `--feature-gates=ottl.set.allowNil` 을 켜야 비로소 제거된다 |
| `set(events, [])` / `delete_key(events,…)` / `limit(...)` | ✅ | 미채택(게이트 방식이 동작하므로 불필요) |
| `set(instrumentation_scope.name/version/schema_url, "")`, `set(resource.schema_url,"")` | ✅ | ✅ 동작 — v1에 **없던 문장**이며 없으면 샌다 |
| 경로 접두 | — | ℹ️ 0.159.0은 `set(name,…)` 같은 무접두 경로를 **자동으로 `span.name` 으로 고쳐 쓰고 INFO 로그**를 남긴다(`please rewrite them accordingly`). 설계 yaml은 접두를 붙여 적는 편이 안전 |

### 3.2 PII — 자리 13곳에 심어 캡처 서버 수신 본문(BE 파싱 전)을 스캔

| # | 심은 자리 | H1(설계 v1 초안) | H2 | **H3** |
|---|---|---|---|---|
| 1 | `span.name` | ✅ 차단 | ✅ | ✅ |
| 2 | `span.status.message` | ✅ 차단 | ✅ | ✅ |
| 3 | **`span.events[].name`** | 🔴 **유출 60/60** | ✅ | ✅ |
| 4 | **`span.events[].attributes`** | 🔴 **유출 60/60** | ✅ | ✅ |
| 5 | **`span.links[].attributes`** | 🔴 **유출 60/60** | ✅ | ✅ |
| 6 | `span.traceState` | ✅ 차단 | ✅ | ✅ |
| 7 | `scope.attributes` | ✅ 차단 | ✅ | ✅ |
| 8 | span attr (허용목록 **밖**) | ✅ 차단 | ✅ | ✅ |
| 9 | **`http.route` 의 *값*** (허용목록 **안**) | 🔴 **유출 47/60** | 🔴 **유출 65/65** | ✅ |
| 10 | resource attr (허용목록 밖) | ✅ 차단 | ✅ | ✅ |
| 11 | **`service.instance.id` 의 *값*** (허용목록 안) | 🔴 **유출 60/60** | 🔴 **유출 65/65** | ✅ |
| 12 | **`scope.name`** | 🔴 **유출 60/60** | ✅ | ✅ |
| 13 | **`schemaUrl`**(resource·scope 양쪽) | 🔴 **유출 120/60** | ✅ | ✅ |
| | **합계** | 🔴 **6종 유출** | 🔴 **2종 유출** | **✅ 0종** |

**대조군(전부 버려서 0건이 된 것이 아님을 증명):** 같은 실행에서 정상 fixture가 그대로 도달했다 — 10분 본 측정 347,830 스팬의 속성 조합이
`[http.request.method, http.response.status_code, http.route]` 298,029 · `[error.type, …]` 15,783 · `[rpc.system]` 16,590 · `[http.route]` 15,749.

### 3.3 분기 정확성 (R1-1) — **PASS**

본 측정: L2′ 600 SERVER/초 · 10서비스 · **10분** · 반복 n=1 · SERVER 총 358,670건(자기계측 fixture 10,840 포함).

| 항목 | 실측 | 판정 |
|---|---:|---|
| 적격 SERVER `E` | 347,830 | — |
| 캡처 수신 고유 ID `A` | 347,830 | — |
| **비대상 오포함 — 자기계측**(`moveseye-be`·`otelcol-contrib`) | **0** / 10,840 주입 | ✅ |
| **비대상 오포함 — SERVER 아닌 kind**(CLIENT·INTERNAL·DB) | **0** / 약 260만 주입 | ✅ |
| 캡처 kind 분포 | `{2: 347830}` (2=SERVER) | ✅ |
| ledger 밖 ID 유입 | 0 | ✅ |
| **정상 적격의 의도치 않은 탈락** | **0** | ✅ |

Collector 수신 누계 `otelcol_receiver_accepted_spans` **3,000,169** → 라이브 exporter 송신 **347,830**(11.6%). 설계 §5.3의 "SERVER 13%"와 근사.

### 3.4 🔴 구/신 semconv — 분기는 통과하지만 **화면 분류가 깨진다** (설계 결함, 코덱스 N5 확증)

`filter/live-server`는 kind만 본다. 구형 semconv(`http.method`)를 쓰는 SERVER 스팬은 **필터를 통과해 BE에 도달하지만**, `keep_keys` 허용목록이 신형 키 이름만 담고 있어 **속성이 `http.route` 하나만 남는다**.

| 부류 | 캡처 스팬 수(10분) | 살아남은 속성 |
|---|---:|---|
| 신형 HTTP | 313,812 | `http.request.method`, `http.response.status_code`, `http.route` (+`error.type`) |
| RPC | 17,467 | `rpc.system` (+`error.type`) |
| **구형 semconv** | **16,551** | 🔴 **`http.route` 만** — method·status_code 전부 소실 |

> ℹ️ **설계 v2(15:04 개정)는 이 문제를 이미 겨냥했다** — `transform/live-normalize`가 `http.method`→`http.request.method`, `http.status_code`→`http.response.status_code`를 **필터보다 먼저** 매핑한다. 그 정규화가 실제로 동작하는지는 **§4에서 재측정**했다.

결과(위 H3 구성, 정규화 없음 기준): 구형 스팬은 `http.request.method` 부재 → `proto`가 HTTP가 아니라 **OTHER**로 분류되고, `http.response.status_code` 부재 → **5xx 오류가 보이지 않으며**, `routeId`의 축인 `method+route`에서 method가 빠진다. 즉 **조용히 잘못 표시된다**(거절되지도, 계수되지도 않는다).

### 3.5 정상 유실 (R1-3) — **PASS**

| 반복 | 프로필 | 적격 E | 캡처 A | `|E\A|` | loss | 판정(<0.1%) |
|---|---|---:|---:|---:|---:|---|
| 본 측정 10분 | L2′ 600/s ×10svc | 347,830 | 347,830 | **0** | **0.0000%** | ✅ |
| 보정 20초 | 653/s ×5svc | 13,055 | 13,055 | 0 | 0.0000% | ✅ |
| 보정 20초 (4워커) | 648/s | 12,969 | 12,969 | 0 | 0.0000% | ✅ |
| 분기 5초 | 20/s | 43 | 43 | 0 | 0.0000% | ✅ |

캡처 측 **중복 스팬 0건** · `otelcol_receiver_refused_spans` **0** · exporter `enqueue_failed` 0.
`otelcol_exporter_sent_spans{…-live}` **347,830 = 캡처 수신 수 = 적격 E** (세 지점이 정확히 일치).

### 3.6 지연 (R1-7) — 완료→링 **PASS**, 완료→화면 **미측정**

같은 호스트 단일 시계. `완료(스팬 endTime = BSP 큐 투입)` → `라이브 HTTP 본문이 캡처 서버에 도착`.

| 구간 | p50 | p95 | p99 | max | 합격선 | 판정 |
|---|---:|---:|---:|---:|---|---|
| 완료 → 라이브 도달(≈링 직전) n=347,830 | **585 ms** | **1,054 ms** | **1,775 ms** | 6,265 ms | `p50 < 5s` | ✅ |
| 완료 → 화면 | — | — | — | — | `p95 ≤ 5s`·`p99 ≤ 10s` | **미측정**(BE 링·SSE·FE 미구현) |

⚠️ **이 수치의 SDK 측 기여분은 과소평가돼 있다.** 이 본 측정은 `gen.mjs`로 돌렸는데, 그 판에는 `scheduleDelay`를 무력화하는 50ms 강제 플러시 버그가 있었다(§10.1에서 자진 신고). 즉 위 p50 585ms는 **"SDK가 거의 즉시 내보낼 때"의 하한**이며, 지배항은 Collector의 `batch/live: 1s`다(§10.2).
규격을 지킨 재측정(§10.3)에서는 같은 600 SERVER/초 부하에서 **BSP 5,000ms → p50 789ms · p95 1,521ms**, **BSP 1,000ms → p50 711ms · p95 1,227ms**로, 고트래픽에서는 차이가 작아 위 결론(합격선 대비 큰 여유)은 **유지된다**. 반면 **저트래픽에서는 기본값이 기준을 깬다**(§10.3).

### 3.7 바이트·배치 — 설계 §5.1 추정 대조

| 항목 | 설계 추정 | **실측** | 차이 |
|---|---|---:|---|
| 슬림 스팬 raw 크기 | 500 B (민감도 400~800) | **458 B**(정상) / **524 B**(PII fixture 포함) | **−8% ~ +5%** — 설계값 유효 |
| gzip 후 | 5~9배 압축 가정 | **10.5~11.5배**, **44~45 B/스팬** | 🟢 설계보다 **유리** |
| 배치 스팬 수 | `send_batch_size 1000` | p50 **625** · p95 661 · max 980 | 1초 배치 × 600/초와 일치 |
| 배치 raw 바이트 | — | p50 **326 KB** · p95 344 KB · **max 476 KB** | — |
| **BE 본문 상한 2MB 대조** | 최대 2,000스팬 × 500B ≈ 1MB, 여유 2배 | 실측 단가로 환산: 2,000 × 524B = **1.05 MB**. 800B 상단이면 **1.6 MB** | ⚠️ **상단 여유 25%뿐** |

- 전송량 환산(실측 단가): 600 SERVER/초 = raw 314 KB/s · **gzip 27 KB/s**. 1,500/초로 외삽하면 raw 786 KB/s · **gzip 66 KB/s ≈ 5.7 GB/일**(설계 §5.1 표의 "1,000/초 → 4.8~8.6GB/일"과 같은 자리).
- 🔴 **`traces_endpoint` 완전 URL 방식은 정확히 동작한다** — self metric이 `url_path="/apm/otlp-live/v1/traces"`로 찍혔다(exporter가 `/v1/traces`를 덧붙이지 않는다). 설계 §2.2의 v0 문자열 접합 폐기 결정이 옳다.
- ℹ️ 생성 yaml의 **컴포넌트 별칭이 0.159.0에서 deprecated** — 기동 시 WARN `"otlphttp" alias is deprecated; use "otlp_http" instead` · `"resourcedetection" → "resource_detection"`. 지금은 동작하나 상위 버전에서 깨진다. **`ApmCollectorConfigGenerator` 손볼 것**(P5와 무관한 별건).

### 3.8 BE 링·SSE가 없어 **측정할 수 없는 R1 항목** (미측정, 사유 명시)

| # | 항목 | 왜 못 쟀나 | 언제 재나 |
|---|---|---|---|
| R1-4 | 집계 정확성(count·오류·slow·p95 오차 0) | `LiveSpanIngestor`·집계 슬롯이 없다. 캡처 서버는 도착 사실만 안다 | P5.1 수신 EP + 링 구현 직후 |
| R1-5 | 표본 분리(`stats.count` vs `displayed`) | reservoir·`retained`·`displayed` 개념 자체가 BE에 없다 | 같음 |
| R1-6 | TTL 영향(hot path DB 0회·TTL 반복 거절) | `LiveMetadataCache` 미구현 | 같음. **설계 §2.3.1 v2의 refresh-ahead(soft 20s/hard 30s)가 실제로 TTL 경계 거절을 0으로 만드는지**가 이 항목의 핵심 |
| R1-8 | 늦은 도착·중복(0·3·6·30·61초 fixture) | 버킷 귀속·dedup·`provisionalUntil` 모두 BE 링 기능 | 같음. 특히 **60초 dedup vs 900초 늦은 도착 허용의 불일치**(설계 §2.4가 스스로 한계로 적은 것)를 61초 fixture로 관측할 것 |
| R1-7 후반 | 완료→**화면** p95/p99 | SSE·FE 미구현 | R4와 함께 |
| R1-9 부분 | BE 수량 보존식(`입력 = 신규 + 중복 + 거절`) | BE 거절 카운터 없음. **exporter 쪽 거동만** 이번에 측정(§3.9) | P5.1 직후 |

### 3.9 🔴 보안 체인 — `permitAll` 한 줄을 빠뜨리면 **조용히 영구 폐기**된다 (실측)

설계 §2.3은 "`/apm/otlp-live/**` 추가 필수 — 자동 적용되지 않는다"고 적었다. 실제로 확인했고, **증상이 예상보다 나쁘다**.

```
POST :3001/apm/otlp-live/v1/traces   → 401  {"status":"error","code":401,"message":"INVALID_TOKEN"}   ← JWT 필터(세션 envelope)
POST :3001/apm/otlp/v1/traces        → 401  {"error":"invalid receive token"}                          ← OTLP 컨트롤러 자기 응답
```

- ✅ `SecurityConfig:79`의 `"/apm/otlp/**"`는 `"/apm/otlp-live/..."`를 **매치하지 않는다**(AntPath의 `/` 경계).
- 🔴 그래서 미등록 상태에서는 JWT 필터가 먼저 401을 낸다. 그리고 **R1 §3 실측에 따르면 Collector는 401을 `Permanent error`로 보고 재시도 없이 즉시 폐기**한다 → 설정 한 줄 누락이 "라이브가 안 나온다"가 아니라 **아무 로그 없이 영구 데이터 폐기**로 나타난다.
- 🔴 응답 **본문 모양도 다르다**. 라이브 EP는 machine 클라이언트용 OTLP 모양(`{"error":…}` 또는 `partialSuccess`)을 내야 하는데, 필터 단계에서 끊기면 **사람용 세션 envelope**가 나간다. 설계 §2.3의 "(c) 경로 매칭 필터 하나(`LiveIngestGuardFilter`)"가 이 자리를 덮어야 한다는 근거다.

**권고:** `SecurityConfig` 추가와 함께 **`/apm/otlp-live/v1/traces`가 permitAll인지 확인하는 테스트**를 넣을 것(경로 오타·리팩터링에 대한 회귀 방어). R6 "500 누출 0" 항목과 같은 자리.

### 3.10 R1-10 본문·URL 상한 — 부분 측정

| 항목 | 실측 | 판정 |
|---|---|---|
| 목적 경로 일치 | exporter self metric `url_path="/apm/otlp-live/v1/traces"` — `traces_endpoint` 완전 URL이 그대로 쓰인다(`/v1/traces` 덧붙임 없음) | ✅ |
| Content-Type / Encoding | `application/json` / `gzip` (캡처 서버 헤더 확인) | ✅ |
| 실제 배치 본문 | p50 326 KB · max 476 KB (해제 후) @600 SERVER/초 | ✅ 2MB 이내 |
| 2,000스팬 포화 배치 | §5.3에서 별도 측정 | — |
| 제한 초과 거절 | **미측정** — BE 라이브 EP 미구현 | 미측정 |

🔴 **설계 §2.3에 빠진 것 — 압축본 회선 상한.** 저장 경로는 상한이 **둘**이다:
`app.apm.otlp.max-body-bytes: 8388608`(해제 후) **와** `app.apm.otlp.max-compressed-bytes: 2097152`(회선). 라이브는 설계에 "2MB(해제 후 기준)" **하나만** 있다.
실측 gzip 비율이 **10.5~11.5배**(코드 주석의 5~9배 가정보다 높다)이므로, 압축 상한을 따로 두지 않으면 **2MB짜리 gzip이 약 23MB로 풀리며** 해제 버퍼가 먼저 터진다. 라이브에도 회선 상한(실측 단가로는 2MB 해제분 ≈ **174KB 압축**, 여유 3배면 512KB 정도)을 명시할 것.
✅ 재사용할 자산은 있다 — `ApmOtlpController`의 `readBounded`·Content-Length 선검사·gzip 해제 중 상한 검사(`:301-331, :476`)가 그대로 쓸 수 있는 형태다.

---

## 4. 설계 v2(15:04 개정) §2.2 원문 재측정

> 측정 도중 설계가 개정되어, **개정판 §2.2 yaml을 그대로 옮긴 `rp5/design_v2.yaml`** 로 다시 돌렸다.
> 개정판이 새로 넣은 것: `transform/live-normalize`(구/신 semconv 매핑) · `filter/live-http-server`(HTTP SERVER만, RPC 제외) ·
> `span.kind != SPAN_KIND_SERVER` enum 표기 · `keep_keys(instrumentation_scope.attributes, [])`를 **span 컨텍스트**에서 ·
> `set(span.name, "_live")` · `num_consumers: 2` · `rpc.system` 허용목록 제거.

### 4.1 설계 v2가 **고친 것** — 실측으로 확인

부하: 150 SERVER/초 · 3서비스 · 90초 · PII 심음 · 오류 20% · 느림 10% · **RPC 20% · 구형 semconv 25% · 자기계측 10%** 혼합. SERVER 8,853건 생성.

| 항목 | 실측 | 판정 |
|---|---|---|
| `span.kind != SPAN_KIND_SERVER` **enum 표기** | 동작 — 캡처 kind 전부 SERVER | ✅ (`kind.string "Server"`도 동작 — 둘 다 유효) |
| **`transform/live-normalize`(구/신 semconv 매핑)** | 구형 스팬 **1,548건이 `http.request.method`·`http.response.status_code`·`http.route` 3종을 모두 갖고 도착** | ✅ **§3.4 결함 해소** |
| `filter/live-http-server` RPC 제외 | RPC 1,803건 생성 → 캡처 **0건** | ✅ (첫 출시 HTTP만 결정대로) |
| 자기계측 제외(정확한 서비스명) | self 873건 생성 → 캡처 **0건** | ✅ |
| HTTP 적격 유실 | `E` 6,346 → 캡처 6,346, **누락 0** | ✅ |
| `keep_keys(instrumentation_scope.attributes, [])` **span 컨텍스트에서** | scope attributes 제거됨 | ✅ (별도 `context: scope` 불필요) |
| **`set(span.name, "_live")`** 고정 이름 | 6,346건 모두 `name="_live"`로 도착. exporter·JSON 직렬화 문제 없음 | ✅ 설계의 ❓ 해소 — 빈 문자열(필드 소멸)보다 이쪽이 파서에 명확하다 |
| `set(span.events, nil)`·`set(span.links, nil)` (gate ON) | events·links **0건** | ✅ |
| 허용목록 밖 span/resource 속성 | 제거됨 | ✅ |

### 4.2 🔴 설계 v2에 **여전히 남은 유출 4종** (같은 실행)

| 자리 | 유출 건수 | 왜 남나 | 고치는 문장 |
|---|---:|---|---|
| **`http.route` 의 값** | **4,798** | `keep_keys`는 **키**만 거른다. 허용한 키의 값은 손대지 않는다 | `redaction/live`(값 패턴 검사) 또는 OTTL `replace_pattern` |
| **`service.instance.id` 의 값** | **3,603** | 같음 | 같음 |
| **`scope.name`** | **3,603** | 설계 v2는 `instrumentation_scope.**attributes**`만 비운다. name·version은 문장이 없다 | `set(instrumentation_scope.name, "")` · `set(instrumentation_scope.version, "")` |
| **`schemaUrl`**(resource·scope 각 1회) | **7,206** | 문장 자체가 없다 | `set(resource.schema_url, "")` · `set(instrumentation_scope.schema_url, "")` |

**설계 v2 스스로 적은 두 문장이 서로 충돌한다:**
> §2.2 — "BE에서 버리는 것은 **이미 일어난 전송 노출**을 되돌리지 못하므로 **Collector 쪽이 1차 방어선**이다."
> §2.2 — "허용 속성의 **값 검사**를 따로 둔다 — `http.route`는 템플릿 형태만 허용(… `__unsafe__`로 치환), `service.instance.id`는 원문을 화면에 내지 않고 …" ← **BE 쪽 조치**로 적혀 있다.

값 검사를 BE에 두면, **BE가 치환하기 전에 원문이 이미 네트워크를 건너간다.** 이번 실측이 그 경로를 정확히 보여 준다(캡처 서버 = BE 파싱 전 본문). 🔴 **값 검사는 Collector에도 있어야 한다** — BE 치환은 화면 노출 방어이고, Collector 값 검사는 전송 노출 방어다. 둘은 대체재가 아니다.

`scope.name`·`schemaUrl`은 설계 v2가 "R1 점검 대상"이라고만 적고 **문장을 넣지 않았다** — 점검 결과 **넣어야 한다**.

### 4.3 gate OFF 대조 — 같은 yaml, `--feature-gates` 만 뺐을 때

| | gate **ON** | gate **OFF** |
|---|---|---|
| 유출 벡터 수 | **4종** | 🔴 **7종** (+`events[].name`, +`events[].attributes`, +`links[].attributes`) |
| `span.events` 실린 스팬 | 0 | **2,620 / 2,620 (100%)** |
| `span.links` 실린 스팬 | 0 | **2,620 / 2,620 (100%)** |
| raw 바이트/스팬 | 715 B | **1,053 B (+47%)** |
| gzip 바이트/스팬 | 59 B | **97 B (+64%)** |
| Collector 로그 경고 | — | **없음**(조용히 무시) |

→ 게이트 하나가 **PII 3종 + 전송량 47%**를 가른다. 그리고 그 사실을 알려 주는 신호가 **어디에도 없다**. §6 참조.

---

---

## 5. R2 — Collector 비용·저장 경로 보호 (OFF → ON → OFF)

동일 부하(L2′ 약 600 SERVER/초 · 10서비스 · 측정 240초 · warm-up 20초 · drain 60초), 매 구간 **Collector 재기동 + 영속 큐 삭제**(이월 차단).
저장 경로는 세 구간 모두 **같은 프록시**(`sproxy :4402` → BE `:3001`)를 지난다 — 같은 자로 잰다.

### 5.1 실측표

| 구간 | `C = ΔCPU/Δwall` | ΔCPU | RSS p50 / p95 / max | SERVER 부하 | Collector 수신 | live 송신 | 저장 송신 |
|---|---:|---:|---|---:|---:|---:|---:|
| **off1** | 0.107 | 35.2 s | 247 / **249** / 256 MB | 150,765 | 1,259,828 | 0 | 109,146 |
| **on1** | **0.137** | 45.2 s | 253 / **263** / 284 MB | 143,480 | 1,193,494 | **142,375** | 105,156 |
| **off2** | 0.077 | 25.2 s | 234 / **248** / 248 MB | 157,465 | 1,316,728 | 0 | 116,231 |

| 구간 | 저장 스팬 | 고유 | **중복** | BE 처리 p50 / p95 | 완료→저장 도달 p50 / p95 | 응답 코드 |
|---|---:|---:|---:|---|---|---|
| off1 | 110,697 | 110,697 | **0** | 1,378 / 4,066 ms | 11,193 / **12,016** ms | 200 ×248 |
| on1 | 106,191 | 106,191 | **0** | 2,933 / 9,312 ms | 11,265 / **12,422** ms | 200 ×239 |
| off2 | 116,750 | 116,750 | **0** | 639 / 1,237 ms | 11,055 / **11,962** ms | 200 ×260 |

### 5.2 판정 (사전 고정 판정식 그대로)

| # | 판정식 | 실측 | **판정** |
|---|---|---|---|
| R2-1 | `C_ON / C_OFF ≤ 1.20` | `C_OFF`(두 OFF 평균) **0.092** · `C_ON` **0.137** → **1.49** | 🔴 **FAIL** |
| R2-2 | `RSS_ON,p95 / RSS_OFF,p95 ≤ 1.20` | 263 / 249 = **1.057** · ON peak 284MB < `memory_limiter` 512MiB | ✅ PASS |
| R2-3 | 추가 유실 0 ∧ 추가 중복 0 ∧ `T_ON/T_OFF ≥ 0.99` | 중복 **0/0/0** · 정규화 처리량 0.740/0.738 = **1.003** | ✅ PASS |
| R2-4 | `L_ON,p95 − L_OFF,p95 ≤ max(0.1×L_OFF,p95, 500ms)` | 12,422 − 11,989 = **+433 ms** (허용 1,199 ms) | ✅ PASS |
| — | 라이브 유실(부수 측정) | on1 적격 143,480 → 캡처 143,480, **loss 0.0000%** | ✅ |

### 5.3 🔴 R2-1 CPU FAIL — 무엇이 사실이고 무엇이 불확실한가

**사실(방향):** `C_ON`(0.137)은 **두 OFF 구간 모두보다 높다** — off1 대비 +28%, off2 대비 +78%. 스팬당으로 환산해도 같다: 1M 스팬당 CPU **off1 27.9 s · off2 19.1 s · on1 37.9 s**. 라이브 분기가 CPU를 더 쓴다는 방향은 뒤집히지 않는다.
설계 §5.3이 미리 적은 이유와 일치한다 — **filter 앞 비용은 SERVER 수가 아니라 전체 스팬 수에 비례**한다. 이 부하에서 fan-out·filter는 초당 약 5,000스팬 **전부**를 복제·순회하고, 그중 11.6%만 남는다.

**불확실(크기):** 두 OFF 구간이 **서로 39% 차이**난다(0.107 vs 0.077). 호스트가 격리돼 있지 않아(기준 CPU 54~72%) 배수의 정밀도가 낮다. 따라서 **"1.49배"라는 숫자를 제품 수치로 쓰면 안 된다.**

**그럼에도 합격선을 완화하지 않는다.** 사전 고정한 판정식에 따라 **FAIL로 기록**한다. 다음 중 하나를 해야 한다:
1. **격리 호스트에서 재측정**(OFF/ON/OFF × 3회) — 코덱스 §5.2 환경 요건을 실제로 갖춘 뒤. 그때 `≤1.20`을 유지할지 결정한다.
2. 20% 목표가 물리적으로 무리라면 **목표 자체를 3회차 안건으로 올린다**(결과를 먼저 기록하고 근거를 적는다 — 설계 §6 서문 규칙).
3. 비용을 줄인다 — `filter/live-http-server`를 더 앞으로(불가: receiver 직후가 이미 앞), 또는 **별도 live Collector 프로세스**(설계 §2.1 대안, 단 receiver 분기 지점 공유 비용은 남는다).

⚠️ **BE 처리 시간(`beMs`)은 판정 지표가 아니다** — off1 4,066ms · on1 9,312ms · **off2 1,237ms**로 OFF끼리도 3배 차이 난다. 같은 호스트에 BE·Collector·생성기·캡처가 모두 있어 생긴 경합이며, 라이브 ON의 효과로 읽으면 안 된다. **사전 고정 지표인 `완료→저장 도달 p95`는 세 구간이 11.96~12.42초로 안정**(tail_sampling `decision_wait 10s` + `batch 5s`가 지배)하고 그것이 PASS다.

### 5.4 저장 경로 정확성 — 세 구간 모두 **중복 0 · 추가 유실 0**

`sproxy`가 저장 스트림의 `spanId`를 전수 집계했다: off1 110,697 고유 / on1 106,191 고유 / off2 116,750 고유, **중복 0건**. 응답은 전 구간 200뿐(4xx·5xx·연결 오류 0).
`otelcol_receiver_refused_spans` 0 · `exporter_enqueue_failed_spans` 0.
→ **R2 최종 판정식의 "저장 추가 유실 0 ∧ 추가 중복 0"은 충족**한다. 걸린 것은 자원 목표(R2-1) 하나다.

---

## 6. 🔴 배포 결합 위험 — yaml만 고치면 PII가 샌다

`set(span.events, nil)`·`set(span.links, nil)`는 **`--feature-gates=ottl.set.allowNil` 이 없으면 오류도 경고도 없이 무시된다**(§3.1 실측). 그런데 그 플래그는 **yaml이 아니라 실행 명령**에 있다.

현재 설치 가이드(`GET /apm/install-guide?os=linux&stack=java`)가 내려 주는 systemd 유닛은 다음과 같다(실측):

```
ExecStart=/usr/local/bin/otelcol-contrib --config /etc/moveseye/collector.yaml
```

- 🔴 `--feature-gates` **없음**. 가이드 전문에 `feature-gates` 문자열이 **0건**이다.
- 🔴 결과: 관리자가 "새 설정 yaml을 받아 덮어쓰기"만 하면 **라이브 파이프라인은 켜지지만 events/links 정리는 안 된다** → 스택트레이스·예외 메시지·링크 속성이 그대로 전송된다. **조용하다**(로그도 카운터도 없다).

**권고 3단(P5.1 필수):**
1. `ApmInstallGuide`의 linux systemd `ExecStart`·Windows 서비스 등록·macOS launchd **전부**에 `--feature-gates=ottl.set.allowNil` 추가. 설정 yaml과 **같은 화면에서 같이** 바뀌게.
2. `ApmCollectorConfigGenerator`가 라이브 블록을 넣을 때, yaml 상단 주석에 **"이 설정은 `--feature-gates=ottl.set.allowNil` 없이 쓰면 PII가 전송된다"**를 빨간 문구로 박는다(지금 토큰 자리표시 안내를 넣는 그 자리).
3. 🔴 **BE 쪽 카나리아** — 라이브 수신 파서가 스팬에 `events` 또는 `links`가 **하나라도 있으면** 그 배치를 거절하지 말고(데이터는 살린다) **전용 카운터**(`slimBypassed` 같은)를 올리고 수집기 탭에 경고로 띄운다. Collector 쪽 실수를 제품이 **관측 가능**하게 만드는 유일한 방법이다. gate가 꺼졌는지 yaml만 봐서는 알 수 없다.

## 7. 설계 §5 추정 대비 실측 차이

| 설계 §5 항목 | 추정 | **실측** | 차이 |
|---|---|---:|---|
| §5.1 슬림 스팬 raw | **500 B** (민감도 400~800) | **458 B**(정상) · 516~524 B(PII fixture) · 715 B(설계 v2, 값 미세척) | **−8% ~ +5%** — 중심값 유효 |
| §5.1 gzip 비율 | **5~9배** (R1 기존 배치에서 가져온 가정) | **10.5~11.5배** · **44~45 B/스팬** | 🟢 **설계보다 유리**. 1초 슬림 배치는 반복 구조라 더 잘 눌린다 |
| §5.1 1,000/초 추가 전송 | 43.2 GB/일 raw · 4.8~8.6 GB/일 gzip | 실측 단가 외삽: **39.6 GB/일 raw · 3.8 GB/일 gzip** | gzip 쪽이 **추정 하한의 80%** |
| §5.3 SERVER 비율 | 13% (R1 507 중 64) | **11.6%** (수신 3,000,169 → live 347,830) | 근사 일치 |
| §5.3 Collector 비용 | "R2 A/B로 확정" · 잠정 ≤ +20% | **+49%** (`C_OFF` 0.092 → `C_ON` 0.137) 🔴 단 OFF끼리 39% 편차 | §5.3 **FAIL** — §5.2 참조 |
| §5.3 exporter 큐 메모리 | 5배치 × 2,000 × 500B ≈ 5MB 대기분 | 정상 부하에서 **live 큐 최대 1/5**(압박 없음) · RSS ON−OFF **+14MB** | 정상 상태에서는 여유 |
| §5.3 최대 체류 산식 | `queue_size × 배치주기 + num_consumers × timeout = 5 + 6 = 11초` | 정상 상태 실측 지연 p99 **1.78초**, max 6.27초 | 산식은 **최악 상한**으로 타당(정상엔 도달 안 함) |
| §2.2 배치 크기 | 최대 2,000 × ~500B ≈ 1MB | @600/초: p50 **625스팬 / 326 KB**, max 980 / 476 KB | 2,000 포화 배치는 §8 별도 측정 |
| §2.3 본문 상한 2MB | "평균 500B × 2,000은 최대의 증명이 아니다" | 실측 단가 환산 **1.05 MB**(524B) · 800B 상단이면 **1.6 MB** | ⚠️ 여유 **25%** — 압축본 상한은 **설계에 없음**(§3.10) |

---

## 8. 하네스·재현 (전부 scratchpad — 제품 소스 수정 0)

`…\AppData\Local\Temp\claude\C--solutions\73f0e76e-73ad-4f5f-b22e-ed7729545a96\scratchpad\rp5\`

| 파일 | 역할 |
|---|---|
| `gen_base.yaml` | `POST /apm/collector-config` 가 **실제로 생성한** 기준 yaml(129줄) |
| `rp5_live.yaml` / `rp5_live_v2.yaml` / `rp5_live_v3.yaml` | 하네스 H1 / H2 / **H3(유출 0)** |
| `design_v2.yaml` | **설계 v2 §2.2 원문 그대로** |
| `ab_on.yaml` / `ab_off.yaml` | R2 A/B (저장 경로를 `sproxy :4402` 경유로) |
| `errp2_propagate.yaml` / `errp2_ignore.yaml` | `error_mode` 상류 전파 시험(런타임 실패 문장 주입) |
| `maxbatch.yaml` | 2,000스팬 포화 배치 본문 크기 측정용 |
| `gen.mjs` / `gen2.mjs` | 합성 OTLP 생성기(BSP 에뮬레이션) / **재시도 SDK** 판 |
| `capture.mjs` | 라이브 캡처 서버 `:4401` — PII 스캔·바이트·도착시각·장애 주입 |
| `sproxy.mjs` | 저장 경로 프록시 `:4402` → BE `:3001` — 처리량·지연·**중복** |
| `analyze.py` / `abreport.py` | R1 집계 / R2 A/B 판정 |
| `run_col.sh` `capctl.sh` `genrun.sh` `msample.sh` | Collector·캡처·다중 워커·메트릭 샘플러 |
| `ab.sh` `stage2.sh`~`stage5.sh` | 무인 실행 스크립트 |
| `pii.json` | 심는 민감 문자열 13종(생성기·캡처 서버 공유) |

**재현 — 최소 한 벌:**
```bash
cd <scratchpad>/rp5
export RECEIVE_TOKEN=<토큰>; export MOVESEYE_LIVE_TRACES_URL=http://127.0.0.1:4401/apm/otlp-live/v1/traces
node gen.mjs --dumppii --piiout pii.json
./capctl.sh start t1
./run_col.sh rp5_live_v3.yaml col.log --feature-gates=ottl.set.allowNil &
node gen.mjs --endpoint http://127.0.0.1:4328/v1/traces --rate 150 --services 3 --sec 90 --bsp 1000 \
     --pii --errpct 20 --rpcpct 20 --oldsempct 25 --selfpct 10 --ledger t1_led.ndjson --label t1
python analyze.py t1          # 유실·지연·PII·바이트·분기
```

**PII 유출 재현(설계 v2 원문 · 게이트 유무):**
```bash
./run_col.sh design_v2.yaml a.log --feature-gates=ottl.set.allowNil   # → 유출 4종
./run_col.sh design_v2.yaml b.log                                     # → 유출 7종(events·links 추가)
```

### 8.1 포화 배치(2,000스팬) 본문 — R1-10 확정 측정

`batch/live`를 `timeout: 30s · send_batch_size: 2000`으로 바꿔 **정확히 2,000스팬 배치**를 만들어 쟀다(12배치).

| 배치 | 스팬 | raw | gzip | raw/스팬 |
|---|---:|---:|---:|---:|
| 정상 속성(짧은 route) × 6배치 | **2,000** | **892 KB (0.85 MiB)** | 86.7 KB | 446 B |

→ 설계 §2.3의 **2MB(해제 후) 상한 대비 여유 2.4배**. 평균이 아니라 **포화 배치 실측**이다.
⚠️ 단 이것은 **짧은 route**의 경우다. 설계 §3.3이 허용하는 **문자열 상한을 꽉 채운 최악**(route 256자·instance 128·error.type 64·service 128, 한글이면 UTF-8 3바이트)은 §14에서 따로 쟀다.

---

## 9. 설계 수정 권고

번호는 우선순위. **P0 = P5.1 착수 전에 설계서에 반영**, P1 = P5.1 구현에 포함, P2 = 문서·후속.

### P0-1 🔴 `traces/live`에 **값 검사(redaction)** 를 넣는다 — Collector가 1차 방어선

설계 v2 §2.2는 허용 속성의 값 검사를 **BE 쪽 `__unsafe__` 치환**으로만 적었다. 실측상 **BE가 보기 전에 원문이 전송된다**(§4.2, `http.route` 4,798건·`service.instance.id` 3,603건).
→ 라이브 파이프라인에 `redaction/live`(또는 동등한 OTTL `replace_pattern`)를 **추가**한다. 실행 검증된 최소 형태:

```yaml
  redaction/live:
    allow_all_keys: true
    blocked_values:
      - '\b\d{6}-\d{7}\b'          # 주민등록번호
      - '\b(?:\d[ -]*?){13,16}\b'  # 카드번호
      - '[\w.+-]+@[\w-]+\.[\w.]+'  # 이메일
# traces/live: [..., transform/live-slim, redaction/live, batch/live]
```
BE 쪽 `__unsafe__` 치환은 **그대로 유지**한다(화면 노출 방어). 둘은 대체재가 아니다 — 설계서에 그렇게 적을 것.

**대조군 실측 — `redaction/live`는 정상 값을 망가뜨리지 않는다.** PII 없이 같은 구성으로 돌려 실제 전달된 값을 찍어 봤다(1,561스팬):
```
http.route          '/orders'  '/health'  '/search'  '/users/{id}'  '/orders/{id}'  '/cart/{id}'
service.instance.id 'inst-rp5-svc-1-2'  'inst-rp5-svc-2-3'
service.name        'rp5-svc-1'  'rp5-svc-2'
```
전부 원형 그대로다(오탐 0). ⚠️ 유일한 주의: **13~16자리 연속 숫자를 담은 route**(예: `/orders/1234567890123`)는 카드번호 패턴에 걸려 마스킹된다 — route가 템플릿(`{id}`)으로 정규화된 정상 계측에서는 발생하지 않고, 발생한다면 그 값 자체가 식별자라 마스킹이 오히려 바람직하다. 이 성질을 문서에 적어 둘 것.

### P0-2 🔴 빠진 OTTL 문장 4개를 넣는다 — `scope.name`·`version`·`schema_url`·`resource.schema_url`

설계 v2는 이들을 "R1 점검 대상"으로만 두고 문장을 넣지 않았다. **점검 결과 샌다**(§4.2: `scope.name` 3,603건 · `schemaUrl` 7,206건). 전부 validate·런타임 검증 완료:

```yaml
      - context: span
        statements:
          - set(instrumentation_scope.name, "")
          - set(instrumentation_scope.version, "")
          - set(instrumentation_scope.schema_url, "")
          - set(resource.schema_url, "")
```

### P0-3 🔴 feature gate를 **설정이 아니라 실행 명령**에서 보장하고, BE에 카나리아를 둔다

§6 그대로. ① 설치 가이드 3종(systemd·Windows 서비스·launchd)의 실행줄에 `--feature-gates=ottl.set.allowNil` 추가 ② 생성 yaml 상단 경고 문구 ③ **BE 라이브 파서가 `events`/`links` 존재를 카운터로 노출**. ③이 없으면 gate 누락을 제품이 영영 알 수 없다.

### P0-4 🔴 `SecurityConfig`에 `/apm/otlp-live/**` permitAll + 회귀 테스트

§3.9 그대로. 누락 시 **401 → Collector가 Permanent error로 즉시 폐기 → 조용한 영구 손실**. 응답 본문도 사람용 세션 envelope가 나가므로 `LiveIngestGuardFilter`가 OTLP 모양으로 변환해야 한다.

### P0-5 🔴 `error_mode: propagate`를 바꾼다 — 저장 경로 300% 중복 (본문 §13.4)

라이브 정리 문장 하나가 실패하면 receiver가 SDK에 503을 주고, SDK 재전송이 **저장 경로를 4배로 중복**시킨다(실측 26,769건). 대안 3안과 권고는 §13.4 — 측정 근거로는 **(a) `error_mode: ignore` + BE 카나리아**.

### P0-6 🔴 최악 배치가 2MB를 넘는다 — `send_batch_max_size` 2,000 → **1,000**

§14 실측: 설계가 **허용하는** 문자열 상한을 꽉 채운 2,000스팬 배치가 **2.09~2.11 MiB**(UTF-8 한글) · 1.62~1.64 MiB(ASCII)로, 2MB 본문 상한을 **넘거나 여유 22%뿐**이다. 상세·대안 3안은 §14.2. 권장은 **(a) `send_batch_max_size: 1000`**(최악 1.06 MiB).
덧붙여 설계 문구 **"route 256자" → "256바이트"** 로 정정할 것 — OTTL `truncate_all`은 바이트 기준이라 한글 route는 85자에서 잘린다.

### P0-7 🔴 `OTEL_BSP_SCHEDULE_DELAY=1000`은 **저트래픽 서비스에 필수**다 (조건부 권고 → 필수)

§10.3 실측: 10 SERVER/초 서비스에서 기본 5,000ms면 **완료→링 p95가 5,727ms** — 설계의 `p95(완료→화면) ≤ 5초`를 **링에 닿기도 전에** 초과한다. 1,000ms면 1,594ms로 떨어진다.
반대로 600 SERVER/초에서는 영향이 거의 없다(p50 789 vs 711ms). → 설계 §7 리스크 #1·Q16의 **"조건부 권고"를 "저트래픽 필수 · 고트래픽 무관"으로 정정**하고, 설치 가이드가 그렇게 안내하게 한다.

### P1-1 라이브 본문의 **압축본 회선 상한**을 설계에 추가

§3.10. 저장 경로는 `max-body-bytes 8MB` + `max-compressed-bytes 2MB` **두 개**인데 라이브는 "2MB(해제 후)" 하나뿐이다. 실측 gzip 비율이 **10.5~11.5배**(코드 주석의 5~9배 가정보다 높다)라 압축 상한이 없으면 2MB gzip이 약 23MB로 풀린다. `ApmOtlpController`의 `readBounded`·Content-Length 선검사·해제 중 상한을 그대로 재사용할 것.

### P1-3 `OTEL_BSP_MAX_QUEUE_SIZE`도 함께 안내한다

§10.3 ③: `BSP 5000 · 600 SERVER/초`에서만 **SDK 큐 오버플로로 1,175스팬이 앱 안에서 사라졌다**(기본 `maxQueueSize 2048`). Collector에도 BE에도 안 잡히는 유실이다. 설치 가이드가 두 변수를 **짝으로** 안내해야 한다. 실 javaagent 수치는 R7에서 확인.

### P2-1 생성 yaml의 deprecated 별칭 정리 (별건)

0.159.0이 기동 시 WARN: `"otlphttp" → "otlp_http"`, `"resourcedetection" → "resource_detection"`. 지금 동작하지만 상위 버전에서 깨진다. `ApmCollectorConfigGenerator` 수정 대상.

---

## 10. 지연의 지배항은 **BSP가 아니라 Collector의 `batch/live: 1s`** 였다

### 10.1 하네스 결함 자진 신고

1차 저트래픽 BSP A/B(10 SERVER/초 · 1서비스 · 120초)는 **무효**다.

| | 생성 | 캡처 | 유실 | 지연 p50 / p95 / p99 |
|---|---:|---:|---:|---|
| 공칭 BSP 5,000ms | 763 | 763 | 0 | 551 / 982 / 1,043 ms |
| 공칭 BSP 1,000ms | 776 | 776 | 0 | **529 / 983 / 1,046 ms** |

두 값이 같다. 원인은 `gen.mjs`의 `setInterval(flush, 50)` — **scheduleDelay와 무관하게 50ms마다 내보내고 있었다.** BSP 에뮬레이션이 무력화된 상태였다.
→ `gen4.mjs`로 규격(`scheduleDelay` 만료 **또는** 큐가 `maxExportBatchSize` 도달)에 맞춰 고치고 §10.3에서 재측정했다.

### 10.2 그래도 남는 사실 — 1초 배치가 바닥을 정한다

무효인 A/B에서도 **p50 ≈ 530~550ms · p95 ≈ 980ms**가 일관되게 나왔다. 이 값은 `batch/live: {timeout: 1s}`의 **구조적 산물**이다:
스팬이 연속으로 도착하면 배치는 매 1초 비워지므로 임의의 스팬이 기다리는 시간은 **0~1초 균등 ⇒ 기대 500ms · p95 950ms**. 실측과 정확히 일치한다.

따라서 **완료→링 지연의 하한은 SDK 설정과 무관하게 약 1초**이며, 여기에 SDK의 export 지연이 더해진다.
`p50(완료→링) < 5초` 기준에는 큰 여유가 있으나, 화면 문구를 "1초 단위 실시간"으로 쓸 때 **최신 버킷은 늘 잠정이고 최대 1초+α 뒤에 찬다**는 뜻이다(설계 §2.4 `provisionalUntil`과 일관).

---

### 10.3 올바른 BSP A/B (재측정, `gen4.mjs` 규격 준수) — **저트래픽에서는 기본값 5,000ms가 기준을 깬다**

`scheduleDelay` 만료 **또는** 큐가 `maxExportBatchSize`(512) 도달 시에만 export. `maxQueueSize` 2048(OTel 기본값). 각 100초.

| `OTEL_BSP_SCHEDULE_DELAY` | 부하 | 생성 | 캡처 | 유실 | **완료→링 p50** | **p95** | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **5,000 ms**(기본) | **10 SERVER/초** | 636 | 636 | 0 | **3,502 ms** | 🔴 **5,727 ms** | 5,911 | 5,957 |
| **1,000 ms** | **10 SERVER/초** | 401 | 401 | 0 | **997 ms** | **1,594 ms** | 2,048 | 2,836 |
| 5,000 ms | 600 SERVER/초 | 28,620 | 28,480 | 🔴 140 (SDK 큐) | 789 ms | 1,521 ms | 2,443 | 3,855 |
| 1,000 ms | 600 SERVER/초 | 30,522 | 30,522 | **0** | 711 ms | 1,227 ms | 1,457 | 1,758 |

**① 저트래픽에서 BSP가 지배한다 — 그리고 기본값이면 기준을 깬다.**
10 SERVER/초(≈84 스팬/초)면 512개 배치가 차는 데 6초가 걸려 **scheduleDelay가 항상 먼저 발동**한다. 기본 5,000ms에서 **완료→링 p95만 5,727ms** — 설계의 `p95(완료→화면) ≤ 5초` 예산을 **링에 닿기도 전에 초과**한다.
→ 🔴 `OTEL_BSP_SCHEDULE_DELAY=1000` 권고는 **"조건부 권장"이 아니라 저트래픽 서비스에는 필수**다. 설계 §7 리스크 #1·Q16의 "조건부 권고" 문구를 **"저트래픽 서비스 필수 · 고트래픽 무관"**으로 정정할 것.

**② 고트래픽에서는 BSP가 거의 무관하다.** 600 SERVER/초(≈5,000 스팬/초)면 512 배치가 0.1초면 차서 scheduleDelay가 발동하지 않는다(p50 789 vs 711ms). 바닥은 §10.2의 `batch/live: 1s`가 정한다.

**③ 🔴 예상 못 한 발견 — 고트래픽 + 기본 BSP에서 SDK가 스팬을 버린다.**
`BSP 5000 · 600 SERVER/초`에서만 유실 140건(0.49%)이 났고, **원인은 Collector가 아니라 SDK 큐**다 — 생성기의 `bspDropped` **1,175 스팬**(다른 세 조합은 전부 0). `maxQueueSize 2048`(OTel 기본)에 5,000ms 주기를 곱하면 5,000 스팬/초에서 큐가 감당 못 한다.
→ 설치 가이드에 `OTEL_BSP_SCHEDULE_DELAY` 와 **`OTEL_BSP_MAX_QUEUE_SIZE`를 같이** 안내해야 한다. 이 유실은 **Collector 자기 메트릭에도 BE에도 안 잡힌다**(앱 안에서 사라진다) — 설계 §2.3의 "Collector에 도착조차 못 한 유실은 BE가 알 수 없다"의 가장 이른 구간이다.
⚠️ 단 이 수치는 **SDK 에뮬레이션**이다. 실 javaagent 2.31.1의 드롭 카운터(`otel.bsp.dropped.spans`)로 **R7에서 재확인**해야 한다.

---

---

## 11. `queue_size: 5` 오버플로 — 선언한 상한을 지키고, 저장 경로를 건드리지 않는다

캡처 서버를 **응답당 5초 지연** 모드로 약 30초 유지(부하 약 600 SERVER/초 유지). live exporter: `queue_size 5 · sizer requests · num_consumers 1 · timeout 3s · retry OFF · block_on_overflow false`.

| 지표 | 정상 | **장애 중** | 복구 후 |
|---|---:|---:|---:|
| `otelcol_exporter_queue_size` (live) | 0 | **5** (= 선언한 상한, 초과 없음) | 0 |
| `otelcol_exporter_enqueue_failed_spans` (live) | 0 | **11,085** | 11,725(증가 멈춤) |
| `otelcol_exporter_send_failed_spans` (live) | 0 | **6,605** (timeout 3s < hang 5s) | 7,255(증가 멈춤) |
| `otelcol_receiver_refused_spans` | 0 | **0** | **0** |
| 저장 exporter `sent_spans` | 증가 중 | **계속 증가** | 계속 증가 |
| RSS | 243 MB | **243 MB** | 251 MB |

**판정 — 설계 의도대로 동작한다:**
- ✅ 큐가 **선언한 5를 넘지 않는다**. `block_on_overflow: false`라 넘치는 분은 **버린다**(늦은 실시간은 쓸모없다는 설계 결정 그대로).
- ✅ **손실이 숨지 않는다** — `enqueue_failed_spans`·`send_failed_spans`로 정확히 계수된다. 두 축이 다르다: 큐가 꽉 차서 못 들어간 것(enqueue_failed) vs 들어갔지만 전송이 실패한 것(send_failed).
- ✅ **저장 경로 무영향** — `receiver_refused_spans` 0, 저장 exporter는 내내 정상. RSS도 증가하지 않는다.
- ✅ `retry_on_failure: false`가 지켜진다 — 실패분 재전송 없음.
- 🔴 다만 **BE는 이 손실을 알 수 없다**. 설계 §2.3이 이미 적은 대로(“Collector에 도착조차 못 한 유실은 BE가 알 수 없다”), 수집기 탭이 `otelcol_exporter_enqueue_failed_spans`·`send_failed_spans`를 **라이브 exporter 기준으로 따로** 보여 줘야 한다. 지금 자기 메트릭은 exporter 라벨로 구분되므로(`exporter="otlphttp/moveseye-live"`) **수집 가능**하다 — P5.1의 수집기 탭 항목에 넣을 것.

---

## 12. R2 장애 주입 — 라이브만 죽고 저장은 산다

각 장애를 **120초** 유지(부하 약 600 SERVER/초 계속), 앞 40초·뒤 50초는 정상. `retry_on_failure: false` 유지.

| 장애 | 장애 중 live 송신 | **큐 넘침**(`enqueue_failed`) | **전송 실패**(`send_failed`, `error_type`) | `receiver_refused` | 저장 송신(장애 중) | **저장 중복** | 저장 지연 p95 (장애 중) |
|---|---:|---:|---|---:|---:|---:|---:|
| 정상 기준선 | — | 0 | 0 | 0 | — | 0 | 11,962~12,422 ms |
| **무응답**(10초 hang) | 585 | **46,650** | 23,660 `Deadline_Exceeded` | **0** | 54,140 | **0** | **12,026 ms** |
| **429** | 505 | 0 | **66,755 `ResourceExhausted`** | **0** | 48,462 | **0** | **12,528 ms** |
| **503** | 660 | 0 | **72,650 `Unavailable`** | **0** | 53,656 | **0** | **12,097 ms** |

### 12.1 판정

| # | 판정식 | 결과 |
|---|---|---|
| R2-5 무응답 | 저장 처리량·지연 유지 · live 실패 계수 증가 · retry OFF 유지 | ✅ **PASS** — 저장 p95 12,026ms(기준선 안), 저장 계속 흐름, 중복 0, live 실패 70,310건 정확히 계수 |
| R2-6 HTTP 거절 | 응답별 실패 계수가 **구분**될 것 · 저장 추가 유실·중복 0 | ✅ **PASS** — 아래 §12.2 |
| R2-7 연결 거부·reset | 저장 기준 유지 · live 큐·in-flight가 선언 상한 이내 | §12.3 |

### 12.2 🟢 좋은 소식 — Collector가 **실패 원인을 라벨로 구분해 준다**

`otelcol_exporter_send_failed_spans`는 `error_type` 라벨로 갈린다(실측 원문):

```
otelcol_exporter_send_failed_spans{error_permanent="false", error_type="Deadline_Exceeded", exporter="otlphttp/moveseye-live", …}  ← 무응답/timeout
otelcol_exporter_send_failed_spans{error_permanent="false", error_type="ResourceExhausted",  exporter="otlphttp/moveseye-live", …}  ← 429
otelcol_exporter_send_failed_spans{error_permanent="false", error_type="Unavailable",        exporter="otlphttp/moveseye-live", …}  ← 503
```

- 셋 다 `error_permanent="false"`(재시도 가능 분류)지만 **retry OFF라 재전송은 0**이다 — 캡처 서버가 본 요청 수(429 ×120 · 503 ×119)가 배치 수와 같고 중복 요청이 없다.
- `exporter="otlphttp/moveseye-live"` 라벨로 **저장 exporter와 완전히 분리**된다.
→ **수집기 탭에 그대로 올릴 수 있다.** 설계 §2.3의 "Collector에 도착조차 못 한 유실은 BE가 알 수 없다"를 메우는 실제 수단이 이 라벨 세트다.

### 12.3 🔴 손실이 **두 카운터로 갈라진다** — 하나만 보면 과소 보고한다

같은 "라이브 안 나옴"이라도 실패 모드에 따라 손실이 다른 곳에 쌓인다:

| 실패 모드 | 큐 거동 | 손실이 쌓이는 곳 |
|---|---|---|
| **응답이 느림**(무응답·timeout) | consumer가 3초씩 붙잡혀 **큐가 찬다** | 대부분 `enqueue_failed_spans`(46,650) + 일부 `send_failed`(23,660) |
| **응답이 빠른 실패**(429·503·연결거부) | 즉시 실패해 **큐가 안 찬다**(enqueue_failed **0**) | 전부 `send_failed_spans`(66,755 / 72,650) |

→ 수집기 탭·알림은 **`enqueue_failed + send_failed`를 합산**해서 "라이브 유실"로 보여 줘야 한다. 어느 하나만 보면 절반 이상을 놓친다.

### 12.4 연결 거부 · partialSuccess — 나머지 두 장애

| 장애 | 장애 중 live 송신 | `enqueue_failed` | `send_failed` | `receiver_refused` | 저장 스팬 | **중복** | 저장 지연 p95 |
|---|---:|---:|---|---:|---:|---:|---:|
| **연결 거부**(socket destroy) | **0** | 0 | **78,720** (`error_type="_OTHER"`) | **0** | 100,241 | **0** | **11,979 ms** |
| **partialSuccess**(200 + `rejectedSpans:12`) | **78,470** | 0 | **0** | **0** | 100,451 | **0** | **11,966 ms** |

**🟢 코덱스 N4 판정이 실측으로 그대로 확인됐다 — 유효한 `partialSuccess`는 성공 취급이다.**

```
2026-09-15T16:00:41.671+0900  warn  otlphttpexporter@v0.159.0/otlp.go:370  Partial success response
  {"otelcol.component.id": "otlphttp/moveseye-live", "otelcol.signal": "traces",
   "message": "Rejected 12 spans: metadataUnavailable=10, servicePending=2", "dropped_spans": 12}
```
- WARN **119건** = 캡처 서버가 보낸 partialSuccess 응답 수(121)와 일치. `message`·`dropped_spans` 필드가 설계 §2.3의 `errorMessage`·`rejectedSpans`를 그대로 실어 나른다.
- `send_failed_spans` **0** · `sent_spans` 78,470 → **exporter는 성공으로 센다**. 재전송 **0**.
- 🔴 따라서 설계 §2.3의 경고가 옳다 — **`otelcol_exporter_sent_spans`를 "BE가 집계에 성공한 수"로 읽으면 안 된다.** 거절분은 WARN 로그와 **BE 자기 카운터**에만 있다. 수집기 탭은 둘을 나란히 보여 줘야 한다.
- ⚠️ 운영 관점: 로그 WARN은 **기계 판정에 쓰기 나쁘다**(자기 메트릭으로 안 올라온다). BE의 사유별 카운터가 정본이어야 한다는 설계 결정이 이 실측으로 뒷받침된다.

**연결 거부**: `error_type="_OTHER"`로 뭉뚱그려진다(429·503처럼 구분되지 않는다). 로그는 명확하다 —
`error Exporting failed. Dropping data. Try enabling retry_on_failure config option…` (queue_sender.go:62).
`retry_on_failure: false`를 의도적으로 고른 설계에서 이 ERROR 줄은 **정상 동작**인데 로그만 보면 오설정처럼 읽힌다 — 운영 문서에 "라이브 exporter의 이 ERROR는 설계된 폐기"라고 적어 둘 것.

### 12.5 메모리·복구 (R2-9 · R2-10)

장애 해제 후 5초 간격 6회 RSS 추적:

| 장애 | 복구 구간 RSS 추이 |
|---|---|
| 무응답 | 258 → 271 → 271 → 274 → 275 → 274 MB |
| 429 | 279 → 265 → 258 → 289 → 261 → 268 MB |
| 503 | 267 → 272 → 273 → 252 → 250 → 256 MB |
| 연결 거부 | 261 → 262 → 262 → 263 → 263 → 259 MB |
| partialSuccess | 264 → 265 → 266 → 266 → 266 → 266 MB |

- ✅ **OOM 0 · 무한 증가 0**. 전 구간 250~290 MB로 `memory_limiter` 512 MiB 안쪽, 정상 구간(249~263 MB)과 같은 범위.
- ✅ live 큐는 장애 해제 **다음 tick(1초)**에 0으로 복귀(§11) — 잠정 기준 "30초 안 정상화"를 크게 밑돈다.
- ⚠️ **"오래된 점을 현재 TPS에 몰아넣지 않는가"는 검증 못 했다** — 버킷 귀속은 BE 링 기능이라 미구현이다(§3.8). 다만 구조적으로는 안전하다: `block_on_overflow: false`라 밀린 데이터가 **쌓이지 않고 버려지므로** 복구 시 몰아칠 물량 자체가 없다.

---

## 13. 🔴🔴 R2-8 `error_mode: propagate` — 저장 경로에 **300% 중복**이 생긴다 (FAIL)

설계 v2 §2.1 리스크 #10과 코덱스 §4.4가 **"추정"**으로 남긴 항목이다. 실측했고, **추정이 사실이었다.**

### 13.1 실험

라이브 정리 문장에 **런타임에 반드시 실패하는 문장 하나**를 넣었다(route는 JSON이 아니다):
```yaml
  transform/live-slim:
    error_mode: propagate          # ← 설계 v2 원문 그대로
    trace_statements:
      - context: span
        statements:
          - … (기존 정리 문장들) …
          - set(span.attributes["rp5.fail"], ParseJSON(span.attributes["http.route"]))   # 실패 유도
```
파이프라인 순서는 설계 그대로 `… → transform/live-slim → batch/live → exporter`(transform이 **batch 앞**).
부하 150 SERVER/초 · 75초 · **재시도하는 SDK**(`gen2.mjs --retry`, 5xx/429를 최대 3회 재전송 — 실제 OTLP exporter 거동).

### 13.2 결과

| 구성 | SDK가 받은 응답 | SDK 재전송 | live 도달 | **저장 스팬** | **저장 고유** | **저장 중복** |
|---|---|---:|---:|---:|---:|---:|
| **`error_mode: propagate`** (설계 v2 원문) | 🔴 **503 × 5,176** (전량 실패) | **3,882** | **0** | 35,692 | 8,923 | 🔴 **26,769 (고유의 300%)** |
| `error_mode: ignore` (같은 실패 문장) | 200 × 1,282 | 0 | 7,342 | 8,640 | 8,640 | **0** |
| 기준선 (실패 문장 없음) | 200 × 1,286 | 0 | 7,344 | 8,416 | 8,416 | **0** |

Collector 로그: `error traces/processor.go:55 failed processing traces` **125건**.

### 13.3 인과

```
라이브 정리 문장 1개 실패
  → transform 이 오류를 상류로 반환 (error_mode: propagate)
  → fan-out(fanoutconsumer)이 consumer 오류를 모아 receiver 에 반환
  → OTLP receiver 가 SDK 에 503
  → SDK 재전송 (retryable)
  → 🔴 저장 분기는 그 요청을 **이미 정상 처리했는데** 같은 스팬을 다시 받는다
  → apm_span 중복 (실측 4배: 원본 1 + 재시도 3)
```

라이브가 아프면 **저장 데이터가 오염된다.** 라이브는 휘발성 표시 기능이고 저장은 제품의 기록이므로, 방향이 완전히 거꾸로다.

### 13.4 판정과 권고

사전 고정 판정식: *"저장 분기에 추가 유실·중복이 생기면 **현재 배치 순서 불합격**"* → **R2-8 FAIL.**

**P0-5 🔴 라이브 정리를 저장 경로와 격리한다 — 셋 중 하나를 P5.1 전에 고른다**

| 안 | 내용 | 대가 |
|---|---|---|
| **(a) `error_mode: ignore`** + 실패 관측 | 가장 작은 변경. 실측상 중복 0·유실 0 | 🔴 **정리 문장이 실패하면 그 스팬이 덜 깎인 채 통과**한다 → PII가 샐 수 있다. 반드시 **BE 카나리아**(§9 P0-3 ③)와 짝지어야 하고, `transform/live-slim`은 **실패할 수 없는 문장만** 담아야 한다(현 문장들은 상수 set·keep_keys뿐이라 실패 여지가 거의 없다 — 그 성질을 **불변식으로 문서화**할 것) |
| **(b) 정리를 `batch/live` 뒤로** | 비동기 경계 뒤라 오류가 상류로 안 간다 | batch가 원문을 들고 있는 구간이 생긴다(메모리·PII 노출 창). 순서 변경 후 재측정 필요 |
| **(c) 별도 live Collector 프로세스** | 완전 격리 | receiver 분기 지점 공유 비용은 남고, 운영 대상이 하나 늘며 게이트웨이 1대 원칙(tail 샘플링)과 충돌 검토 필요 |

**측정에 근거한 권고는 (a) + BE 카나리아**다. 근거: `ignore`가 중복 0·유실 0으로 측정됐고, 현재 정리 문장 집합(상수 `set`·`keep_keys`·`truncate_all`)은 입력에 의존해 실패할 여지가 사실상 없다. 다만 **`redaction/live`(P0-1)와 `transform/live-normalize`는 입력 의존적**이므로, 이들을 추가할 때 같은 시험(실패 fixture 주입)을 반복해야 한다.
🔴 그리고 어느 안을 고르든 **설계 §2.2의 `error_mode: propagate` 주석("정리 문장이 실패하면 배치를 폐기한다 … 라이브는 손실 허용·PII 통과 불허")은 수정해야 한다** — 실제로는 배치를 폐기하는 것이 아니라 **상류 전체를 실패시키고 저장을 오염시킨다.**

## 14. 🔴 최악 배치가 **2MB 본문 상한을 넘는다** (R1-10 결정적 측정)

설계 §3.3이 **허용하는** 문자열 상한(route 256·error.type 64·instance 128·service 128)을 꽉 채운 2,000스팬 포화 배치를 실제로 만들어 쟀다.
정리 파이프라인은 H3 그대로(`truncate_all(attributes, 256)` 포함). 오류 100%(= `error.type` 전 스팬 부착).

| 문자 종류 | 배치 스팬 | **raw 본문** | gzip | raw/스팬 | 설계 2MB 상한 |
|---|---:|---:|---:|---:|---|
| 짧은 route(정상) | 2,000 | 0.85 MiB | 87 KB | 446 B | ✅ 여유 2.4배 |
| **최악 · ASCII** | 2,000 | **1.62~1.64 MiB** | 94 KB | 849~861 B | 🟡 여유 **22%** |
| **최악 · UTF-8 한글** | 2,000 | 🔴 **2.09~2.11 MiB** | 99 KB | 1,095~1,107 B | 🔴 **초과** |

### 14.1 원인 — JSON 인코딩이 비-ASCII를 `\uXXXX`로 부풀린다

같은 **256바이트** route인데 한글판이 스팬당 **+250 B** 더 든다. 256바이트 한글 = 85자이고, `\uXXXX` 이스케이프는 자당 6바이트라 `85 × 6 = 510 B`(원본 256 대비 +254) — 실측 증분과 정확히 일치한다.
🔴 **길이 상한을 "바이트"로 정해도 전송 크기는 그 2배가 될 수 있다.** 설계 §5.1의 스팬 크기 산정은 ASCII 가정이다.

ℹ️ 부수 확인: OTTL `truncate_all(attributes, 256)`은 **바이트 기준**으로 자른다(한글 85자 + `/` = 256바이트). 문자 수 기준이 아니다 — 설계 문구가 "route 256자"라면 **"256바이트"로 정정**해야 한다(한글 route는 85자에서 잘린다).

### 14.2 권고 (P0-6)

셋 중 하나 이상을 **P5.1 계약 확정 전에** 정한다:

| 안 | 조치 | 비고 |
|---|---|---|
| **(a) `send_batch_max_size` 하향** | 2,000 → **1,000** | 최악 1.06 MiB로 떨어진다. 1초 배치라 정상 부하(≤1,500 SERVER/초)에서 배치가 쪼개질 일이 거의 없다. **가장 단순하고 권장** |
| (b) 본문 상한 상향 | 2MB → 4MB(해제 후) | BE 힙 임시 사용이 2배가 된다(동시 gzip 해제 수 × 상한). §2.3 힙 산정 재계산 필요 |
| (c) Collector에서 길이 상한을 더 낮게 | `truncate_all(attributes, 128)` 등 | route 표시가 잘려 화면 품질이 떨어진다 |

어느 안이든 **압축본 회선 상한(P1-1)과 함께** 정해야 한다 — 최악 배치의 gzip은 94~99 KB에 불과해(압축비 17~22배, 반복 문자열이라 더 잘 눌린다) 회선 상한만으로는 해제 후 크기를 막지 못한다.
🔴 그리고 설계 §2.3의 "최대 2,000 × ~500B ≈ 1MB 평균" 주석은 **실측으로 반증됐다** — 평균은 0.85 MiB가 맞지만 **허용 입력의 최악은 2.1 MiB**다. 코덱스 Q8 "평균 500B는 최대 배치 크기의 증명이 아니다"가 정확했다.

---

## 15. 종합 판정

### 15.1 R1

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| R1-1 | 분기 정확성 | ✅ **PASS** | 비대상 오포함 0(자기계측 10,840·비-SERVER 약 260만·RPC 1,803 전부 차단) · 적격 탈락 0 |
| R1-2 | PII 제거 | 🔴 **설계 v2 원문은 FAIL** (4종 유출) · ✅ **H3 조합은 PASS** (13/13 clean, 정상 fixture 정상 전달) | §4.2 / §3.2 |
| R1-3 | 정상 유실 | ✅ **PASS** | 10분 347,830건 **0.0000%** · 반복 4회 전부 0 · 합격선 <0.1% |
| R1-4 | 집계 정확성 | ⬜ **미측정** | BE 링·집계 미구현 |
| R1-5 | 표본 분리 | ⬜ **미측정** | 같음 |
| R1-6 | TTL 영향 | ⬜ **미측정** | `LiveMetadataCache` 미구현 |
| R1-7 | 지연 | ✅ **PASS(완료→링)** · ⬜ 완료→화면 미측정 | p50 **585 ms** · p95 1,054 · p99 1,775 (합격선 p50<5s). 유실 0과 **함께** 통과 |
| R1-8 | 늦은 도착·중복 | ⬜ **미측정** | BE 버킷·dedup 미구현 |
| R1-9 | 부분 성공 응답 | ✅ **PASS(exporter 측)** · ⬜ BE 수량 보존식 미측정 | partialSuccess = 성공 취급·재전송 0·WARN 119건 확인. 503·429도 retry OFF에서 재시도 0 |
| R1-10 | URL·본문 상한 | 🟡 **부분 PASS** | 목적 경로·Content-Type·gzip 확인 · 포화 2,000스팬 배치 **0.85 MiB**(2MB 대비 2.4배 여유) · 초과 거절은 BE 미구현이라 미측정 · **압축본 상한 설계 누락** |

### 15.2 R2

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| R2-1 | 정상 CPU `≤1.20` | 🔴 **FAIL** | `C_ON/C_OFF` = **1.49**. 방향은 확실(ON이 두 OFF 모두보다 높다), 크기는 불확실(OFF끼리 39% 편차) |
| R2-2 | 정상 메모리 `≤1.20` | ✅ **PASS** | 1.057 · peak 284MB < 512MiB |
| R2-3 | 저장 처리량 | ✅ **PASS** | 추가 유실 0 · 추가 중복 0 · `T_ON/T_OFF` 1.003 |
| R2-4 | 저장 지연 | ✅ **PASS** | +433 ms (허용 1,199 ms) |
| R2-5 | live 무응답 | ✅ **PASS** | 저장 p95 12,026ms(기준선 안)·중복 0·실패 70,310건 계수·재시도 0 |
| R2-6 | HTTP 거절(429·503·partialSuccess) | ✅ **PASS** | `error_type` 라벨로 완전 구분 · 저장 추가 유실·중복 0 |
| R2-7 | 연결 거부·reset | ✅ **PASS** | 저장 p95 11,979ms·중복 0 · live 큐 선언 상한(5) 초과 0 |
| R2-8 | **transform 실패(`propagate`)** | 🔴🔴 **FAIL** | **저장 중복 26,769건(고유의 300%)** — §13 |
| R2-9 | 메모리 압박 | ✅ **PASS** | OOM 0 · 무한 증가 0 · 전 구간 250~290MB |
| R2-10 | 복구·freshness | 🟡 **부분 PASS** | live 큐 1초 내 복귀 · RSS 즉시 정상 범위 · "오래된 점 몰아넣기"는 BE 미구현이라 미측정 |

```text
R2 최종 판정식 대입
  저장 추가 유실 0            ✅
∧ 저장 추가 중복 0            🔴 FAIL — error_mode: propagate 에서 26,769건
∧ 저장 처리량·지연 기준 충족   ✅
∧ live 큐·동시성·메모리 상한 이내 ✅
∧ 실패·부분 거절·복구 관측 가능  ✅
⇒ R2 = FAIL
```

### 15.3 한 줄

> **Collector 분기 자체는 타당하다** — 유실 0.0000%, 지연 p50 585ms, 슬림 스팬 458B, 장애 5종에서 저장 경로 무손상.
> **그러나 지금 설계 원문 그대로 구현하면 안 된다** — ① PII 4종이 새고(§4.2) ② `error_mode: propagate`가 저장 데이터를 300% 중복시키며(§13) ③ feature gate가 실행 명령에 없어 PII 방어가 조용히 꺼진다(§9).
> **P0 5건을 설계에 반영한 뒤 P5.1에 착수하는 것이 맞다.**

---
## 16. 미측정 항목과 이유

| 항목 | 이유 | 언제 |
|---|---|---|
| R1-4 집계 정확성 · R1-5 표본 분리 · R1-6 TTL 영향 · R1-8 늦은 도착·중복 | **BE 라이브 EP·링·집계·메타 캐시가 미구현**(P5.1 전). 캡처 서버는 "도착했다"까지만 안다 | P5.1 최소 종단 직후 |
| R1-7 완료→**화면** p95/p99 | SSE·FE 미구현. 실제 프록시(아파치 `mod_proxy_http`) 경로도 미구성 | P5.2 + R4 |
| R1-9 BE 수량 보존식(`입력 = 신규 + 중복 + 거절`) | BE 거절 카운터 미구현. **exporter 측 거동만** 측정(성공 취급·재전송 0·WARN) | P5.1 직후 |
| R1-10 상한 **초과 거절**(413/400/415) | BE 라이브 EP 미구현. 발신 측 최대 크기는 측정 완료(§14) | P5.1 직후 · R6 |
| R2-10 "오래된 점을 현재 TPS에 몰아넣지 않는가" | 버킷 귀속이 BE 링 기능 | P5.1 직후 |
| L2(1,000)·L3(1,500)·L4(단일 서비스)·L5(5,000) 프로필 | 🔴 **이 호스트의 부하 천장이 약 600 SERVER/초**(워커 수와 무관, 생성기 직결도 614/초). 기준 CPU 부하 54~72% | 격리 호스트 확보 후 |
| 오류 100%·느림 100% 별도 프로필 | 혼합 부하(오류 5~20%·느림 2~10%)만 수행. 최악 배치 측정(§14)에서만 오류 100% 사용 | 격리 호스트 재측정 시 |
| 3회 반복 | 시간. R2 A/B는 OFF/ON/OFF **1세트**, R1 본 측정 10분 **1회**(+짧은 반복 3회) | 같음 |
| 실 javaagent 2.31.1 BSP | **SDK 에뮬레이션**으로 대체. 드롭 카운터·앱 CPU 영향은 측정 못 함 | **R7** |
| writer 반환(설계 §2.5, R1 신규 항목) | SSE 미구현 | P5.1/R6 |
| Java `rule_based_routing` sampler 자기계측 제외 | 실 javaagent 필요 | R7 또는 P5.1 |
| `ottl.set.allowNil` 게이트가 **저장 파이프라인 OTTL**에 주는 영향 | 저장 쪽 OTTL(`transform/sql`의 `replace_pattern`·`truncate_all`)에는 `set(_, nil)`이 없어 영향 없음을 **정적으로 확인**. 런타임 회귀는 미측정 | P5.1 통합 테스트 |

## 17. 환경 원복

| 대상 | 상태 |
|---|---|
| **RP5 Collector**(`:4327/:4328/:8889/:13134`) | **종료** |
| **캡처 서버**(`:4401`) | **종료** |
| **저장 경로 프록시**(`:4402`) | **종료** |
| RP5 큐 디렉터리 `scratchpad/rp5/queue` | 삭제 |
| **사용자 Collector**(pid 36560, `:4317/:4318/:8888/:13133` → BE `:3000`) | 🟢 **손대지 않음 · 계속 실행 중** |
| **QA BE `:3001`**(pid 31804) | 🟢 **유지**(요청대로 QA 인프라 존치) |
| **QA DB `dmove_apm`@5433**(도커 `dmove-postgres-test`) | 🟢 **유지** |
| 사용자 `:3000` · `:5173` · dev DB `dmove` | 🟢 **접촉 없음** |
| 제품 소스(`moveseye-be-spring`·`moveseyee_fe`) | 🟢 **수정 0** — 두 레포 트리의 타 세션 미커밋 파일도 손대지 않음(`git stash` 미사용) |

**남긴 부작용 2건(의도적, 되돌리려면):**
1. QA DB `apm_receive_token`에 **id 29 `rp5-live-measure`** 발급 — 계속 쓸 게 아니면 `DELETE /apm/receive-tokens/29`로 회수.
2. QA BE `:3001`에 R1·R2 부하가 저장한 **APM 스팬·메트릭**이 `dmove_apm`에 들어갔다(서비스명 `rp5-svc-*`, env `rp5`). 보존 배치가 7일 뒤 정리하지만, 즉시 지우려면 해당 `service.name` 기준으로 삭제한다.

