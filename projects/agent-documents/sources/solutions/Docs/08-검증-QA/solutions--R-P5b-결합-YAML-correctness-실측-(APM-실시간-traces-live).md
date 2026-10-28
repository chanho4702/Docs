# R-P5b — 결합 YAML correctness 실측 (APM 실시간 `traces/live`)

- **일시** 2026-09-15 17:20 ~ 18:10 (KST)
- **대상** 설계 `_workspace/designs/devdesign_apm-realtime.md` **§2.2 정본 yaml** — 측정 중 **v3 → v4로 개정**되어 **두 판을 모두** 측정했다.
  - **v3** = 16:52 시점 사본(`design_s2.2_frozen.yaml`, md5 `09bc002dcf549dc8c9f15d157f5c2b53`) — 정규화·필터·`live-slim` keep_keys·정리 4문장·`redaction/live`·batch 1,000
  - **v4** = 17:38 시점 사본(`design_s2.2_v4_frozen.yaml`) — v3 + `truncate_all(resource.attributes,128)` + `redaction/live.summary: silent` + **신설 `filter/live-safety`(13조건)** + `num_consumers: 1`
- **판정 기준** 코덱스 3회차 `reviews/review_apm-realtime-design_codex-r3.md` §2(P0 판정 2·3·4·7) · §2.1(실제 오류 신호) · §2.2(필요한 감시와 차단) · §4.4(시험 대상 고정)
- **선행** `verification/r-p5_apm-live-pipeline.md` (R1·R2). 본 문서는 그 문서가 "**①+②를 한 yaml로 합친 최종 조합 자체는 아직 한 번에 돌리지 않았다**"라고 남긴 공백을 메운다.
- **결론 한 줄** — **v3는 FAIL(전송 최대 무한·정리 실패 시 PII 100% 유출), v4는 correctness PASS**. 다만 v4에도 **설계를 바꿔야 할 발견 6건**이 남았고, 그중 **BE 압축본 상한 512 KiB는 정상 입력을 거절한다(🔴 FAIL)**.

---

## 0. 합격선 — 실행 **전** 고정

> 정직 고지: §0을 파일로 먼저 쓰고 시작하지는 않았다. 아래 1~7은 **본 작업 지시문에 적힌 문장을 그대로 판정식으로 굳힌 것**이고(실행 전 고정), 8~11은 **측정 도중 코디네이터가 v4 개정과 함께 추가로 지시한 항목**으로 **해당 실행 전에** 고정했다. 실행 후에 완화하거나 바꾼 기준은 없다.

| # | 항목 | 합격 판정식 |
|---|---|---|
| 1 | validate + 기동 | 결합 yaml이 `validate` 통과 **AND** gate ON/OFF **양쪽에서 기동 성공**(`Everything is ready`). 기동 실패·예상 밖 ERROR 0 |
| 2 | 분기 정확성 | 적격 SERVER **E == 캡처 고유 A** · 자기계측 오포함 **0** · CLIENT/INTERNAL/PRODUCER/CONSUMER/RPC 오포함 **0** · ledger 밖 ID **0** · 적격 SERVER 1,000건 이상 |
| 3 | PII 결합 | 금지 문자열 **13종 전부 캡처 본문 통과 0건** **AND** 대조군(정상 route·service.name·instance.id·method·status_code)이 **원형 보존**(하나라도 소실·변형되면 불합격) **AND** 절단 경계에서 **UTF-8 깨짐(U+FFFD) 0** |
| 4 | 직렬화 최대 | 1,000스팬 배치의 **해제 후 본문 < 2,097,152 B** **AND** **gzip < 524,288 B**. 초과하면 그 자리를 설계 결함으로 보고 |
| 5 | `error_mode: ignore` 실패 fixture | (a) receiver가 SDK에 **200**(저장 경로 재전송 0·중복 0) (b) WARN **2패턴** 발생 (c) 정리 실패 스팬의 live 전송 여부를 **사실로 기록** (d) `otelcol_processor_*` 흔적 유무를 사실로 기록 |
| 6 | 전송 전 차단 시제품 | 5(c)의 스팬 **drop** **AND** 정상 스팬 **통과(오탐 0)** **AND** 조건 자체 오류 시 통과/차단을 사실로 기록 |
| 7 | 설치 가이드 | `ApmInstallGuideService`의 실행줄 3종에 `--feature-gates` **부재**를 문자열로 재확인만(수정 금지) |
| 8 | v4 `filter/live-safety` | 6과 같되 **설계 정본 13조건 그대로** |
| 9 | v4 `summary: silent` | 기본값일 때 요약 속성이 붙는지 / 붙으면 live-safety가 전량 drop하는지를 사실로 기록 |
| 10 | v4 직렬화 최대 3종 | **G≤100 / G=N / 저압축률(난수)** × 1,000 배치. 해제 후 2,097,152 B 초과면 `send_batch_max_size` **800** 재측 |
| 11 | v4 `truncate_all(resource.attributes,128)` · 형태 검사 3종 | 초장문 resource 값이 **128 B 이하로 절단** **AND** method/status_code/error.type 형태 fixture의 통과·차단이 **설계 의도와 일치** |

**공통 불변 조건(전 실행)**: 제품 소스 수정 0 · 사용자 `:3000`/`:5173`/dev DB `dmove`/사용자 Collector(pid 36560) 무접촉 · 두 레포 미커밋 파일 무접촉(`git stash` 미사용).

---

## 1. 시험 대상 고정 (코덱스 §4.4 "시험 대상을 먼저 고정")

| 항목 | 값 |
|---|---|
| Collector 바이너리 | `C:\solutions\_tools\otel\otelcol-contrib.exe` · **0.159.0** · sha256 `e15e33cbd50c5890abff1776a997c56b007a1d1bbf617e9faac80dabd016d8cb` · 372,056,064 B · 2026-08-18 10:15:46 |
| 포트 | RP5b 전용 — otlp grpc **4327** · http **4328** · self **8889** · health **13134** (사용자 Collector `:4317/4318/8888/13133`와 완전 분리, 무접촉 확인) |
| feature gate | `--feature-gates=ottl.set.allowNil` (ON 실행) / 없음(OFF 실행) |
| 기준 yaml | `rp5/gen_base.yaml`(BE `POST /apm/collector-config` **실제 생성물**) + §2.2 라이브 블록. v3 → `v3_on.yaml`(md5 `cb182548a23f6ad9fde120c90c0608dd`), v4 → `v4_on.yaml` |
| `num_consumers` | v3 = 2(설계값) · v4 = 1(설계값) |
| BE(저장 경로) | QA **`:3001`**(pid 31804, dev 프로필, DB `dmove_apm`@5433 도커 `dmove-postgres-test`) — 라이브 경로는 BE 미구현이라 캡처 서버가 종단 |
| 캡처 서버 | `rp5b/capture.mjs` `:4401` — gzip JSON 수신, **BE 파싱 전 본문**을 그대로 보존(`raw_*.ndjson`) + PII 심층 스캔 |
| 저장 경로 프록시 | `rp5b/sproxy.mjs` `:4402` → BE `:3001` — 중복·응답코드 계측 |
| 부하원 | `gen4.mjs`(BSP 에뮬레이션, PII 13종 fixture) · `inject.mjs`(경계·형태 fixture 직접 주입) · `fatgen.mjs`/`fatgen2.mjs`(포화 배치) |
| 시계 | 전 지점 동일 호스트 단일 시계 |
| 하네스 | 전부 scratchpad `…\scratchpad\rp5b\` — **제품 소스 수정 0** |

---

## 2. 결과 요약표

| # | 시험 | v3 (16:52 정본) | v4 (17:38 정본) |
|---|---|---|---|
| 1 | validate + 기동 (gate ON/OFF) | ✅ PASS | ✅ PASS |
| 2 | 분기 정확성 | ✅ PASS (E=A=8,444 · 오포함 0 · 탈락 0) | ✅ PASS (E=A=8,431 · 오포함 0 · 탈락 0) |
| 3 | PII 결합 13종 + 대조군 + 절단 경계 | ✅ PASS (13/13 차단 · 대조군 보존 · U+FFFD 0) | ✅ PASS (동일) |
| 4 | 직렬화 최대 (해제 후 2 MiB) | 🔴 **FAIL — 상한 없음(11.9~26.2 MiB 실측)** | ✅ PASS (최악 **1.337 MiB**) |
| 4b | 직렬화 최대 (gzip 512 KiB) | 🔴 FAIL | 🔴 **FAIL — 572.4 KiB(정상 입력)** |
| 5 | `error_mode: ignore` 실패 fixture | 🔴 **FAIL — 정리 실패 스팬 PII 100% 전송** | ✅ PASS (전량 차단) |
| 6 | 전송 전 차단 | (없음) | ✅ PASS + ⚠️ **조건별 fail-open** |
| 7 | 설치 가이드 gate 부재 | ✅ 확인(문자열 0건, 수정 없음) | 동일 |
| 8 | `filter/live-safety` 13조건 | — | ✅ PASS (정상 오탐 0 · 실패 전량 drop) |
| 9 | `redaction/live.summary` | — | ✅ 기본값도 silent · info/debug면 **live 전량 소실** |
| 10 | 직렬화 3종(G≤100·G=N·저압축) | — | ✅ 해제 후 PASS / 🔴 압축 FAIL |
| 11 | `truncate_all(resource,128)` + 형태 3종 | 🔴 resource 미제한(900 B 통과) | ✅ 126 B 절단 · 형태 13 fixture **13/13 기대 일치** |

**종합 — v3 FAIL · v4 correctness PASS(조건부).** v4에서도 §4b(압축본 상한)는 설계 수정 없이는 운영에서 정상 배치를 거절한다.

---

## 3. 시험 1 — validate + 기동 (gate ON/OFF)

### 3.1 validate

| 대상 | 결과 |
|---|---|
| v3 결합 yaml(`${env:…}` 치환판) | ✅ 통과(무출력, exit 0) |
| v3 결합 yaml **설계 원문 그대로**(`${MOVESEYE_LIVE_TRACES_URL}`·`${RECEIVE_TOKEN}`·`${SELF_SERVICE_NAME_*}` 맨 `${}`) | ✅ 통과 — **0.159.0은 `env:` 접두 없는 `${VAR}`도 환경변수로 확장한다**(기동도 성공) |
| v4 결합 yaml + 변형 3종(`summary` 제거·batch 800·batch 60s) | ✅ 전부 통과 |
| 환경변수 **미설정** 상태 | `Error: exporters::otlphttp/moveseye-live: at least one endpoint must be specified` — **조용한 실패가 아니라 명시적 거부**. 🟢 설치 가이드 관점에서 좋은 성질 |

🔴 **R-P5 §2.1이 남긴 경고는 유효하다** — validate 통과는 correctness 증거가 아니다. 아래 gate OFF 실행이 validate를 통과하고 기동도 되지만 결과가 전혀 다르다.

### 3.2 기동 — gate ON

v3·v4 모두 `Everything is ready. Begin running and processing data.` 도달. ERROR 0.
WARN은 **7줄 전부 별칭 deprecation**뿐(라이브 블록과 무관, R-P5 P2-1이 이미 별건으로 잡아 둔 것):

```
warn  builders/builders.go:40  "otlphttp" alias is deprecated; use "otlp_http" instead   ... otelcol.component.id: otlphttp/moveseye-live
warn  builders/builders.go:40  "resourcedetection" alias is deprecated; use "resource_detection" instead
```

INFO 1줄 — `ottl@v0.159.0/parser_collection.go:647 one or more paths were modified to include their context prefix, please rewrite them accordingly`. 🟢 **라이브 블록이 아니라 저장 경로 `transform/sql`(무접두 `attributes[...]`)이 원인**이다. 라이브 블록은 전부 `span.`·`resource.`·`instrumentation_scope.` 접두를 쓰므로 이 INFO를 만들지 않는다 — 설계 §2.2의 함정 (2)는 **라이브 블록 기준으로는 이미 해소됐고, 남은 대상은 생성 yaml의 저장 블록**이다.

### 3.3 기동 — gate OFF 🔴 **설계·R-P5의 "경고 0건"은 사실이 아니다**

| | v3 gate ON | **v3 gate OFF** | **v4 gate OFF** |
|---|---|---|---|
| live 도달 스팬 | 1,323 | **1,359** | **0** |
| PII 유출 벡터 | 0 | 🔴 **2종** (`events[].name` 1,359 · `links[].attributes` 1,359) | **0** |
| `span.events` 실린 스팬 | 0 | **1,359 / 1,359 (100%)** | 0 |
| raw B/스팬 | 522 | **885 (+70%)** | — |
| gzip B/스팬 | 62 | **102 (+65%)** | — |
| `live-safety` 차단 | — | — | **1,345** |
| **Collector 경고** | — | 🔴 **1건 존재** | 1건 존재 |

**gate OFF WARN 원문(전문):**

```
2026-09-15T17:52:55.487+0900  warn  ottlfuncs/func_set.go:46
The OTTL 'set' function silently ignored a nil value. This behavior is deprecated and will change in a future release.
Enable the feature gate 'ottl.set.allowNil' to pass nil to the target.
{"resource":{...,"service.name":"otelcol-contrib","service.version":"0.159.0"}, ...}
```

- 🔴 **설계 §2.2 리스크 #13의 "Collector 경고 0건 · 로그 0 · 카운터 0"과 R-P5 §4.3의 "Collector 로그 경고: 없음(조용히 무시)"은 둘 다 정정 대상이다.** 코덱스 §5의 지적이 맞다. 정확한 문구는 **"프로세스 수명당 1회 WARN이 뜨지만, ① 기능은 차단되지 않고 ② 전용 카운터가 없으며 ③ 제품(수집기 탭)이 이 로그를 보고 있지 않다"**.
- 이 WARN은 **파이프라인·컴포넌트 라벨이 없다**(`ottlfuncs/func_set.go`는 전역). 어느 프로세서의 어느 문장인지 알려 주지 않으므로, 알람은 "이 Collector에 gate가 빠졌다"까지만 말할 수 있다.
- 🟢 **v4의 실질 개선**: gate OFF의 결과가 **PII 유출 → live 완전 실명(0건) + 차단 카운터 1,345**로 바뀐다. 설계 v4 §2.2 주석("PII 전송이 아니라 점 소실 + 차단 수 상승으로 나타난다")이 **실측으로 확인**됐다.
- ℹ️ gate OFF에서 유출 벡터는 **3종이 아니라 2종**이었다. `events[].attributes`의 값(`exception.message`)은 **`redaction/live`가 마스킹**했다(`PII-EVENTATTR-904-****`로 도착). 즉 **redaction은 event 속성까지 훑지만 `events[].name`과 `links[].attributes`는 훑지 않는다** — §7-③ 참조.

---

## 4. 시험 2 — 분기 정확성 (v3·v4)

부하: `gen4.mjs` 150 SERVER/초 · 3서비스 · 120초 · BSP 1,000ms · 오류 20% · 느림 10% · **RPC 20% · 구 semconv 25% · 자기계측 10%** · PII 13종.

| 항목 | **v3** | **v4** | 판정 |
|---|---:|---:|---|
| ledger SERVER 총 | 11,809 | 11,730 | — |
| 적격(HTTP·비자기계측) `E` | 8,444 | 8,431 | — |
| 캡처 고유 ID `A` | **8,444** | **8,431** | ✅ `E == A` |
| 캡처 kind 분포 | `{2: 8444}` | `{2: 8431}` | ✅ SERVER만 |
| 자기계측 오포함 | **0** / 1,166 주입 | **0** / 1,221 주입 | ✅ |
| RPC 오포함 | **0** / 2,199 주입 | **0** / 2,078 주입 | ✅ |
| CLIENT/INTERNAL/DB 오포함 | **0** / 약 87,000 주입 | **0** / 약 87,000 | ✅ |
| ledger 밖 ID 유입 | 0 | 0 | ✅ |
| 중복 도착 | 0 | 0 | ✅ |
| **적격 SERVER 탈락** | **0** | **0** | ✅ |
| 구 semconv 스팬 정규화 | 2,143건 전부 `method+status_code+route` 3종 보유 | 2,080건 전부 동일 | ✅ §3.4 결함 해소 확인 |
| events/links 실린 스팬 | 0 | 0 | ✅ |
| raw/스팬 · gzip/스팬 | 458.0 B · 53.2 B (8.6배) | 458.0 B · 53.2 B | R-P5 458 B와 일치 |
| Collector 수신→live 비율 | 98,650 → 8,444 (8.6%) | 98,650 → 8,431 | — |

**합격**. 결합 yaml에서도 ①(정규화·필터·`_live`·scope attrs)과 ②(scope 4문장·redaction·truncate)가 **서로 간섭하지 않는다**.

---

## 5. 시험 3 — PII 결합 검증 (v3·v4 동일하게 PASS)

### 5.1 13종 fixture 전량 차단

`pii.json`의 13개 문자열을 **모든 자리**에 심었다 — span.name · status.message · events[].name · events[].attributes · links[].attributes · traceState · scope.attributes · scope.name · resource/scope schemaUrl · 허용목록 밖 span/resource 속성 · **허용목록 안 `http.route` 값** · **허용목록 안 `service.instance.id` 값**.

| 자리 | v3 결합 | v4 결합 |
|---|---|---|
| 13자리 전부 | **0건** | **0건** |

캡처 서버가 본 필드 상태(BE 파싱 전 본문):

```
resource.attrKeys = ['service.name','service.instance.id','deployment.environment.name']
span.attrKeys     = ['http.request.method','http.route','http.response.status_code','error.type']
span.events / span.links / span.traceState / span.status.message  → 전부 부재(0건)
scope.name / scope.version / scope.schemaUrl / resource.schemaUrl → 전부 부재(빈 문자열 → JSON 필드 소멸)
span.name         = '_live' (8,431/8,431)
```

### 5.2 대조군 — "전부 버려서 0"이 아님

- 같은 실행 안의 정상 route가 **원형 그대로** 도착: `/orders/{id}` · `/users/{id}` · `/cart/{id}` · `/search` · `/health` · `/orders`
- `service.name` `rp5-svc-1/2/3` 원형 보존. `redaction/live` 오탐 0.
- 무-PII 대조 주입(`inject.mjs --case control`) 3건 전부 원형 보존:
  `orders-api / orders-api-7f3c2a / GET /orders/{id} / 200 / java.lang.IllegalStateException`,
  `users-api / users-api-01 / PUT /users/{id}/profile / 204`, `cart-api / cart-api-b2 / DELETE /cart/{cartId}/items/{itemId} / 404`
- 🟢 **redaction은 값 전체를 버리지 않고 매치 구간만 마스킹한다**: `/users/{id}/PII-ROUTEVAL-909-****`, `PII-SVCINST-911-****` — 주민번호·카드번호 부분만 `****`. 식별자로서의 앞부분은 남으므로 화면 유용성이 유지된다.

### 5.3 허용 값의 타입·길이·절단 경계 (v3 기준 주입, v4에서 재확인)

| fixture | 입력 | **v3 결과** | **v4 결과** |
|---|---|---|---|
| ASCII route 300자 | 300 B | `truncate_all`로 **정확히 256 B** | 256 B |
| **한글 route 300 B**(경계가 글자 한가운데) | `/ab` + 한×99 = 300 B | **255 B / 87자 · U+FFFD 없음** | 동일 |
| 한글 `error.type` 300 B | 300 B | **255 B / 85자 · U+FFFD 없음** | 🔴 **live-safety가 drop**(정상) |
| resource 값 900 B (service.name·instance.id) | 900 B | 🔴 **900 B 그대로 통과** | ✅ **126 B로 절단** |
| `status_code`를 문자열 `"200"` | stringValue | 🔴 **그대로 통과** | ✅ **drop** |
| `route`를 double 3.14 · `status_code`를 bool | doubleValue/boolValue | 🔴 **그대로 통과** | ✅ **drop** |
| `method`를 arrayValue(2원소) | arrayValue | 🔴 **배열 전체 61 B 통과** | ✅ **drop** |
| 정상 대조군 | — | 통과 | 통과 |

🟢 **UTF-8 깨짐 없음 — 설계의 우려는 해소된다.** OTTL `truncate_all`은 **바이트 상한을 지키되 문자 경계에서 자른다**(256 B 상한에서 255 B로 멈춤). 설계 §2.2의 "🔴 바이트 기준(한글 route는 85자에서 잘린다)"은 맞지만, "한글 경계 잘림 시 UTF-8 깨짐"은 **일어나지 않는다**. 이 문장은 "문자 경계 안전"으로 보강해야 한다.

---

## 6. 시험 4 — 직렬화 최대 실측 (코덱스 P0 판정 3)

### 6.0 🔴 먼저: 설계 §2.2/§5.1·R-P5 §14.1의 `\uXXXX` 설명은 **사실이 아니다**

캡처 본문의 **바이트를 직접 세었다**:

| 배치 | 바이트 | `\u` 등장 | 한글(`주`, UTF-8 3B) 등장 |
|---|---:|---:|---:|
| ASCII 포화 1,000스팬 | 786,779 | **0** | 0 |
| **한글 포화 1,000스팬** | 785,699 | **0** | **109,280** |
| poison 1,000스팬 | 12,516,619 | **0** | 2,316,000 |

- **Collector의 OTLP/HTTP JSON exporter는 비-ASCII를 이스케이프하지 않는다. 원시 UTF-8로 그대로 쓴다.**
- 따라서 설계 §2.2 "🔴 길이를 바이트로 정해도 전송 크기는 그 2배가 될 수 있다 — JSON 인코딩이 비-ASCII를 `\uXXXX`(자당 6바이트)로 부풀린다(256바이트 한글 = 85자 × 6 = 510B)"는 **삭제 대상**이다. **같은 바이트 상한이면 한글 비용 = ASCII 비용**(785,699 vs 786,779 — 한글이 오히려 1 KB 작다).
- **R-P5 §14의 "최악 · UTF-8 한글 2.09~2.11 MiB(초과)"는 fixture 결함이었다.** 재현해 원인을 분해했다 — `gen3.mjs --fat --fatch ko`의 `rep(n)`이 `.slice(0, n)`으로 **문자 수**를 세어, "error.type 64"가 실제로는 **한글 64자 = 192 B**였고 `truncate_all(span.attributes, 256)`이 이를 자르지 않았다. 즉 **JSON 인코딩이 아니라 fixture의 바이트/문자 혼동**이 +250 B/스팬을 만들었다.

| 기여 분해 (각 1,000스팬 배치, v3) | raw/스팬 | ASCII 기준 대비 |
|---|---:|---:|
| ASCII, 설계 **바이트** 상한 준수 | 787 B | 기준 |
| 한글, 설계 **바이트** 상한 준수 | 786 B | **−1 B** |
| `kochars`(= R-P5 fixture, **문자** 상한) | 945 B | +158 B |
| ↳ `error.type`만 한글 192 B | 920 B | **+133 B ← 지배항** |
| ↳ `http.route`만 한글(truncate가 자름) | 792 B | +5 B |
| ↳ resource 값만 한글 384 B | 817 B | +30 B |

### 6.1 🔴 v3 — 전송 최대에 **상한이 없다** (코덱스 P0 판정 3이 정확했다)

v3의 유일한 크기 제약은 `truncate_all(span.attributes, 256)`이다. 그 **밖**은 전부 무제한이다.

| fixture (1,000스팬 배치, v3, gate ON) | 해제 후 raw | 2 MiB 대비 | gzip | 512 KiB 대비 | raw/스팬 |
|---|---:|---|---:|---|---:|
| 정상 포화(ASCII, 설계 상한) | 0.750 MiB | ✅ | 35.5 KiB | ✅ | 787 B |
| 정상 포화(한글, 설계 상한) | 0.749 MiB | ✅ | 35.5 KiB | ✅ | 786 B |
| 허용 키에 **arrayValue(200원소)** | 9.879 MiB | 🔴 **4.8배 초과** | 187.5 KiB | ✅ | 10,358 B |
| **poison**(resource 8 KB + array), 그룹 100 | **11.937 MiB** | 🔴 **5.7배 초과** | 210.2 KiB | ✅ | 12,517 B |
| **poison**, 그룹 = 스팬 수(1,000) | **26.213 MiB** | 🔴 **12.5배 초과** | 235.8 KiB | ✅ | 27,486 B |

무한의 경로 **3가지**:
1. **resource 속성 값** — `truncate_all(span.attributes, …)`는 resource를 건드리지 않는다. `service.name`·`service.instance.id`를 8 KB로 보내면 8 KB가 그대로 나간다(§5.3 900 B fixture도 원형 통과).
2. **허용 키의 비-문자열 값** — `truncate_all`은 문자열만 자른다. `http.request.method`에 200원소 배열을 넣으면 통째로 나간다.
3. **resource 그룹 수** — batch 프로세서는 **서로 다른 업스트림 요청의 동일 resource를 병합하지 않는다**(실측: 같은 resource를 40회 나눠 보내면 출력 배치에 40개 그룹이 그대로 남는다). 그룹마다 resource+scope 블록 전체가 복제된다.

🔴 **더 나쁜 것: gzip 상한이 이것을 못 막는다.** 26.2 MiB 배치의 gzip은 235.8 KiB뿐이라 **512 KiB 압축본 관문을 통과**하고, BE는 해제 중에야 2 MiB를 넘는 것을 알게 된다 → 배치 전량(1,000스팬) 거절. 즉 v3에서는 **한 서비스의 잘못된 계측 하나가 그 배치의 라이브를 통째로 날린다**.

### 6.2 ✅ v4 — 상한이 생긴다 (해제 후는 PASS)

v4는 `truncate_all(resource.attributes, 128)`로 경로 1을, `filter/live-safety`의 타입·형태 조건으로 경로 2를 막는다. 남는 변수는 경로 3(그룹 수)뿐이다. **live-safety를 통과할 수 있는 최대치로만** 채운 1,000스팬 배치를 G를 바꿔 가며 쟀다(route 256 B · method 16 ASCII · error.type 64 ASCII · resource 3키 × 128 B):

| charset | G(그룹) | 해제 후 raw | 2 MiB 대비 | gzip | 512 KiB 대비 | raw/스팬 | 압축비 |
|---|---:|---:|---|---:|---|---:|---:|
| ASCII | 40 | 0.768 MiB | ✅ 2.6배 여유 | 35.6 KiB | ✅ | 805 B | 22.1× |
| ASCII | **100** | 0.803 MiB | ✅ 2.5배 | 37.4 KiB | ✅ | 842 B | 22.0× |
| ASCII | **1,000 (=N)** | **1.337 MiB** | ✅ **1.53배** | 48.6 KiB | ✅ | 1,402 B | 28.2× |
| 한글 | 1,000 (=N) | 1.335 MiB | ✅ 1.53배 | 49.9 KiB | ✅ | 1,400 B | 27.4× |
| **난수(저압축)** | 40 | 0.768 MiB | ✅ | 292.0 KiB | ✅ | 805 B | 2.7× |
| **난수(저압축)** | 100 | 0.803 MiB | ✅ | 310.3 KiB | ✅ | 842 B | 2.7× |
| **난수(저압축)** | **1,000 (=N)** | 1.337 MiB | ✅ | 🔴 **572.4 KiB** | 🔴 **초과** | 1,402 B | 2.4× |

- ✅ **해제 후 2 MiB는 어떤 조합에서도 넘지 않는다** → 설계 규칙("초과면 800")의 발동 조건이 아니다. **`send_batch_max_size: 1000` 유지가 타당하다.**
- 설계 §2.3.0의 산술 상한(그룹 ≤100 = 1.13 MiB, 그룹 = 스팬 수 = 1.99 MiB)은 **보수적**이었다. 실측은 0.80 MiB / 1.34 MiB. 산술을 실측값으로 교체하면 된다.
- 🔴 **압축본 512 KiB 상한은 정상 입력을 거절한다.** 난수 G=N 배치는 **유효한 라이브 페이로드**(전부 live-safety 통과·PII 0·형태 정상)인데 gzip 572.4 KiB로 BE 관문에 걸린다. 현실 대응물: 해시·UUID가 섞인 route 세그먼트, 무작위 instance id, 컨테이너 해시 서비스명.
- 참고로 **`send_batch_max_size: 800`으로 낮춰도 해결되지 않는다** — 난수 G=N(800) = 해제 후 1.070 MiB / gzip **458.7 KiB**로 512 KiB까지 여유가 **10%뿐**이다. 엔트로피가 조금만 더 높으면 다시 넘는다.

**압축본 상한의 올바른 값(산술)**: 해제 후 상한이 2 MiB라면, gzip은 비압축 데이터에서 **거의 줄지 않는다**(deflate stored block, 최악 ≈ 원본 + 0.03% + 18 B). 압축본 상한은 **해제 후 상한과 같은 2 MiB**여야 "유효한 ≤2 MiB 페이로드를 절대 거절하지 않는다"가 성립한다. 압축 상한의 목적(해제 전에 회선 읽기를 묶어 zip-bomb을 막는 것)은 2 MiB에서도 그대로 달성되고, 23 MiB로 부푸는 폭탄은 **해제 중 스트리밍 검사**(`ApmOtlpController:301-331, :476` 재사용)가 잡는다.

---

## 7. 시험 5 — `error_mode: ignore` 실패 fixture

실패 주입 4종 + 기준선. 부하는 각 40초 · 60 SERVER/초 · 오류 100% · PII 13종.
실패 유도 문장은 `ParseJSON(span.attributes["http.route"])`(route는 JSON이 아니므로 반드시 런타임 실패) 또는 `Substring(span.attributes["http.route"], 0, 500)`(범위 초과).

| 변형 | 실패 위치 | live 도달 | **PII 유출** | WARN `failed to execute statement` | WARN `failed to eval condition` | 저장 경로 중복 | SDK 응답 |
|---|---|---:|---:|---:|---:|---:|---|
| 기준선 v3 | 없음 | 1,323 | 0 | 0 | 0 | **0** | 200×40 |
| A `fnorm` | `transform/live-normalize`(정리와 무관) | 1,349 | 0 | **170** | 0 | **0** | 200×40 |
| B `ffirst` | `transform/live-slim`의 **첫 문장** | 1,338 | 0 | 52 | 0 | **0** | 200×40 |
| C `fclean` | `set(span.status.message,"")` **정리 문장 자체** | 1,337 | 🔴 **1,337 (100%)** | 52 | 0 | **0** | 200×40 |
| D `fcond2` | `filter/live-http-server`의 **조건** | 1,343 | 0 | 0 | **52** | **0** | 200×40 |
| C′ `v4fclean` | C와 동일, **v4** | **0** | **0** | 52 | 0 | **0** | 200×40 |

### (a) receiver가 SDK에 200을 주는가 — ✅ 전 변형 200, 저장 경로 재전송·중복 0

전 실행에서 생성기 `exportCodes = {"200": 40}`, sproxy `dupes: 0` · `codes {"200": 34}`. **R-P5 §13이 `propagate`에서 본 503×5,176 / 저장 중복 300%는 `ignore`에서 완전히 사라진다.** P0-5 결정(a)의 전제가 결합 yaml에서도 유지된다.

### (b) WARN 2패턴 — ✅ 둘 다 실재. 코덱스 §2.1이 정확했다

```
warn  ottl@v0.159.0/parser.go:423  failed to execute statement
  {"otelcol.component.id":"transform/live-normalize","otelcol.component.kind":"processor",
   "otelcol.pipeline.id":"traces/live","otelcol.signal":"traces",
   "error":"expected string but got nil",
   "statement":"set(span.attributes[\"rp5.fail\"], ParseJSON(span.attributes[\"http.route\"]))"}

warn  ottl@v0.159.0/parser.go:496  failed to eval condition
  {"otelcol.component.id":"filter/live-http-server","otelcol.component.kind":"processor",
   "otelcol.pipeline.id":"traces/live","otelcol.signal":"traces",
   "error":"invalid character '/' looking for beginning of value",
   "condition":"ParseJSON(span.attributes[\"http.route\"])[\"x\"] == 1"}
```

- 🟢 두 WARN 모두 **`otelcol.component.id` · `otelcol.pipeline.id` 라벨을 달고 있다** → 컴포넌트·파이프라인별 집계가 가능하다(코덱스 §2.2 수정안 1이 요구한 것).
- 🔴 **WARN 수는 손실 수가 아니다**: 변형 A는 13,196스팬 전부가 실패했는데 WARN은 **170줄**, C는 1,337스팬 실패에 **52줄**. 내부 로그 샘플링이 걸려 있다. 코덱스의 "로그 기반 계수는 정확한 손실 계수가 아니다"가 **실측으로 확인**된다.
- ⚠️ 설계 §2.2·§6.4가 적어 둔 감시 패턴 **`failed processing traces`는 `ignore` 모드에서 0건**이다(전 변형 0). 그 문자열을 감시 대상으로 남기면 아무것도 못 잡는다 — 위 두 패턴으로 교체해야 한다.

### (c) 정리 실패 스팬이 live로 그대로 전송되는가 — 🔴 **v3는 그렇다. 100%**

- **변형 B가 먼저 밝힌 사실**: OTTL `ignore`는 문장 하나가 실패해도 **같은 블록의 나머지 문장을 계속 실행한다**. 실패 문장을 `live-slim` **맨 앞**에 두었는데도 뒤따르는 13개 정리 문장이 전부 정상 동작했다(PII 0 · 허용 키만 · scope 전부 비움). 코덱스 §2.1의 소스 해석이 맞다.
- **변형 C가 밝힌 위험의 실체**: 따라서 남는 위험은 **실패한 그 문장의 효과만 건너뛴다**는 것이다. `set(span.status.message, "")`가 실패하자 **1,337/1,337스팬이 PII를 실은 `status.message`를 그대로 달고 live로 전송**됐다.
  - 🔴 그리고 **`redaction/live`가 그것을 잡지 못했다** — 심은 값이 `PII-STATUSMSG-902-hong@example.com`(이메일 패턴 보유)인데 마스킹되지 않았다. **redaction은 속성 값만 검사한다. `status.message`·`span.name`·`traceState`·scope 필드·`events[].name`·`links[].attributes`는 검사 대상이 아니다**(§3.3 gate OFF 실행에서 `events[].attributes`는 마스킹됐고 `events[].name`·`links[].attributes`는 원형 통과 — 경계가 정확히 여기다).
  - 즉 **설계가 "Collector 1차 방어선"으로 제시한 두 층(키 정리 `keep_keys`/`set` + 값 검사 `redaction`) 사이에 구멍이 있다.** `set` 계열이 실패하는 순간 그 필드에는 아무 방어도 남지 않는다. → **전송 전 차단(§8)이 선택이 아니라 필수**라는 코덱스 §2.2-3의 결론이 실증됐다.
- ✅ **v4에서는 0건.** 같은 fixture(`v4fclean`)에서 live 도달 **0**, PII **0**, `live-safety` 차단 **1,351**.

### (d) `otelcol_processor_*` 흔적 — 🟡 실패 전용 카운터는 없지만 처리량 카운터는 쓸 만하다

```
otelcol_processor_incoming_items{otel_signal="traces",processor="filter/live-safety"}  1351
otelcol_processor_outgoing_items{otel_signal="traces",processor="filter/live-safety"}  0
otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}                   1351
otelcol_processor_filter_spans_filtered{filter="filter/live-http-server"}             11876
otelcol_processor_internal_duration_bucket{otel_signal="traces",processor="filter/live-safety",le=...}
```

- **transform 프로세서의 문장 실패는 어떤 메트릭에도 올라오지 않는다**(변형 A·B·C에서 `incoming == outgoing`). 설계 §2.2의 "❓3회차 질문 1 — `ignore` 모드에서 실패 문장이 메트릭으로 올라오는지 미확인"의 답은 **"올라오지 않는다"**.
- 🟢 대신 **filter 프로세서는 정확한 전용 카운터가 있다** — `otelcol_processor_filter_spans_filtered`. 따라서 "정리 실패 감시"는 **로그 WARN 2패턴(부정확·샘플링)** + **filter 차단 카운터(정확)**의 조합으로 구성해야 한다.
- 🔴 **라벨 이름 정정**: 설계 §2.2는 `otelcol_processor_filter_spans_filtered{filter="live-safety"}`라고 적었지만 실제 라벨 값은 **`filter="filter/live-safety"`**(타입 접두 포함)다. `ApmCollectorMetricStore` 구현 시 이 문자열로 맞춰야 한다.

---

## 8. 시험 6·8 — 전송 전 차단 `filter/live-safety` (v4 정본 13조건)

### 8.1 정상 대조군 — 오탐 0 ✅

v4 본 부하(8,431 적격 스팬, PII fixture 포함, 구 semconv 25%·오류 20%·느림 10%) 전체에서
`otelcol_processor_filter_spans_filtered{filter="filter/live-safety"} = **0**`, `incoming 8431 / outgoing 8431`.
**정상 스팬은 한 건도 걸리지 않는다.**

### 8.2 차단 대상 — 기대대로 전부 drop ✅

| 입력 | 걸리는 조건 | 결과 |
|---|---|---|
| `set(span.status.message,"")` 실패로 남은 PII 메시지 | `span.status.message != ""` | ✅ 1,351건 drop · live 0 |
| **gate OFF**(events/links 잔존) | `Len(span.events) > 0` / `Len(span.links) > 0` | ✅ 1,345건 drop · live 0 · PII 0 |
| `redaction` 요약 속성 부착(§8.4) | `Len(span.attributes) > 4` | ✅ 전량 drop |
| 한글 `error.type` 255 B | `not IsMatch(error.type, "^[A-Za-z0-9_.$-]{1,64}$")` | ✅ drop |
| `status_code`가 문자열/실수/불리언 | `not IsInt(...)` | ✅ drop |
| `route`가 double | `not IsString(...)` | ✅ drop |
| `method`가 arrayValue | `not IsMatch(method, "^[A-Za-z_]{1,16}$")` | ✅ drop |

**형태 검사 3종 — fixture 13건 전수(시험 11)**: 전부 기대와 일치.

| fixture | 기대 | 결과 |
|---|---|---|
| `method=GET` / `_OTHER` / `get` | 통과 | ✅ 통과 |
| `method=GET123`(숫자) / 17자 / `GET-X`(하이픈) | 차단 | ✅ 차단 |
| `status_code` int 503 / 부재(nil) | 통과 | ✅ 통과 |
| `status_code` double 200.0 | 차단 | ✅ 차단 |
| `error.type='java.lang.Foo$Bar-1'` / 64자 경계 | 통과 | ✅ 통과 |
| `error.type='java lang Foo'`(공백) / 65자 | 차단 | ✅ 차단 |

→ 13/13 일치. 🟡 부작용 메모: `^[A-Za-z_]{1,16}$`는 **소문자 method(`get`)를 통과**시키고 **숫자·하이픈이 든 커스텀 method를 조용히 drop**한다. semconv 규정상 미지 method는 `_OTHER`로 정규화되므로 실해가 낮지만, "통과 못 한 이유"를 운영자가 알 수 있어야 한다(차단 카드에 `reason`이 없으면 원인 추적이 불가능하다 — 아래 §10-⑥).

### 8.3 🔴 조건 자체가 오류일 때 — **조건 단위 fail-open**(코덱스 §2.2-3의 "그 검증 자체의 오류 시 통과 여부"의 답)

두 실험으로 갈라 확인했다.

| 실험 | 구성 | live 도달 | PII | `live-safety` 차단 | `failed to eval condition` |
|---|---|---:|---:|---:|---:|
| `v4brk` | 13조건 **앞에** 반드시 실패하는 14번째 조건을 추가 + C fixture | **0** | 0 | **1,333** | 52 |
| `v4hole` | **`span.status.message != ""` 조건 자체**를 실패하는 표현으로 교체 + C fixture | **1,335** | 🔴 **1,335** | **0** | 52 |

- ✅ **한 조건이 깨져도 나머지 12조건은 정상 동작한다**(`v4brk`). 즉 오류가 프로세서 전체를 무력화하지는 않는다.
- 🔴 **깨진 그 조건이 담당하던 검사만 조용히 사라진다**(`v4hole`) — 유일한 신호는 샘플링된 WARN 52줄이고, **차단 카운터는 0**이라 "잘 돌고 있다"처럼 보인다.
- → **설계 §2.2의 live-safety 주석("아래 조건은 nil·타입에 안전한 형태만 쓴다")은 권고가 아니라 불변식으로 승격해야 한다.** 그리고 `failed to eval condition` WARN을 **파이프라인 `traces/live` 한정으로 0건 유지**하는 것이 알람 조건이어야 한다(0이 아니면 게이트에 구멍이 뚫린 상태).
- 현행 13조건은 이 불변식을 지킨다: `Len`·`IsString`·`IsInt`·문자열 비교·`IsMatch`는 nil·타입 변주 fixture(§5.3·§8.2) 전체에서 **한 번도 eval 오류를 내지 않았다**(정상 실행 WARN 0). 실행 검증 완료.

### 8.4 시험 9 — `redaction/live`의 `summary`

| 설정 | 요약 속성 부착 | live 도달 | `live-safety` 차단 |
|---|---|---:|---:|
| `summary: silent`(설계 v4) | 없음 | 1,323~8,431 정상 | 0 |
| **설정 생략(기본값)** | **없음** — `span.attrKeys`가 허용 4키 그대로 | 1,352 정상 | **0** |
| `summary: info` | 있음 | **0** | **470 (전량)** |
| `summary: debug` | 있음 | **0** | **466 (전량)** |

- ✅ **0.159.0의 기본값은 이미 `silent`**다 — `summary` 줄이 없어도 요약 속성은 붙지 않는다. 설계의 우려는 "기본값"에서는 발생하지 않는다.
- 🔴 그러나 **누군가 `info`/`debug`로 바꾸면 라이브가 즉시 100% 실명한다.** 그러므로 `summary: silent`를 **명시하는 것 자체가 방어**다(설계 v4가 명시한 것이 옳다). 생성기(`ApmCollectorConfigGenerator`)가 이 줄을 반드시 찍고, 운영 문서에 "이 값을 바꾸면 실시간 화면이 빈다"를 적어야 한다.

---

## 9. 시험 7 — 설치 가이드 실행줄 (수정 없음, 문자열 확인만)

`moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmInstallGuideService.java`

| 실행줄 | 위치 | `--feature-gates` |
|---|---|---|
| Windows `New-Service -BinaryPathName '"…\otelcol-contrib.exe" --config "…"'` | `:230-233` | **없음** |
| Linux systemd `ExecStart=%s --config %s` | `:256` | **없음** |
| macOS plist `ProgramArguments = [%s, --config, %s]` | `:325-330` | **없음** |

- 파일 전체 `feature-gates` 등장 **0회**, `ApmInstallGuideServiceTest`도 **0회**. R-P5 §6·P0-3의 지적이 그대로 유효하다. **본 시험에서 수정하지 않았다.**
- §3.3에서 확인한 대로 gate 미설정의 유일한 자동 신호는 프로세스 수명당 1회 WARN이고, v4 도입 후의 증상은 "라이브 화면이 빈다 + 차단 카운터가 튄다"이다. 세 실행줄 수정은 여전히 P5.1 필수.

---

## 10. 🔴 설계 §2.2(v4)에 대한 수정 권고

| # | 대상 | 지금 문서 | 실측 | 권고 |
|---|---|---|---|---|
| ① | §2.2 truncate 불릿 · §5.1 | "JSON 인코딩이 비-ASCII를 `\uXXXX`(자당 6바이트)로 부풀린다 … 전송 크기는 그 2배" | `\u` **0개**. 원시 UTF-8. 한글=ASCII 비용 | **문장 삭제.** 대신 "OTTL `truncate_all`은 **바이트 상한을 지키되 문자 경계에서 자른다**(256 B → 255 B, UTF-8 깨짐 없음)"로 교체 |
| ② | §2.2 리스크 #13 · R-P5 §4.3 | gate OFF "Collector 경고 0건 · 로그 0 · 카운터 0" | **WARN 1건 존재**(`ottlfuncs/func_set.go:46`, 전문 §3.3) | "프로세스 수명당 **1회 WARN**은 있으나 파이프라인·문장 라벨이 없고 기능 차단도 카운터도 없다"로 정정. 수집기 탭이 이 문자열을 감시 |
| ③ | §2.2 "Collector 1차 방어선" 불릿 | 키 정리 + 값 검사(`redaction`)로 2층 방어 | **redaction은 속성 값만 본다.** `status.message`·`span.name`·`traceState`·scope 필드·`events[].name`·`links[].attributes`는 **검사 대상 밖** | 방어 범위를 표로 명시하고, **비-속성 필드의 유일한 방어는 `filter/live-safety`**임을 적는다(§7c 근거) |
| ④ | §2.2 감시 패턴 · §6.4 | `failed processing traces` | **`ignore`에서 0건.** 실제는 `failed to execute statement` / `failed to eval condition` | 두 패턴으로 교체 + "로그는 샘플링돼 손실 계수가 아니다"(A: 13,196 실패 → 170줄) 명기 |
| ⑤ | §2.2 live-safety 주석 | "`otelcol_processor_filter_spans_filtered{filter="live-safety"}`(존재·라벨은 R-P5b 확인)" | **존재한다. 라벨 값은 `filter="filter/live-safety"`**(타입 접두 포함) | 라벨 문자열 정정. `incoming_items`/`outgoing_items`도 프로세서별로 존재하므로 함께 수집 |
| ⑥ | §2.2 live-safety `error_mode: ignore` 주석 | "조건 평가 오류 시 … 스팬을 남긴다(fail-open)" — 권고 수준 | **조건 단위 fail-open 실증**: 깨진 조건이 담당한 검사만 사라지고 차단 카운터는 0, WARN만 52줄 | **불변식으로 승격**: "live-safety 조건은 nil·타입에 안전한 형태만" + **알람 조건 `failed to eval condition{pipeline=traces/live} == 0`** 추가. 차단 카드에 `reason`(어느 조건) 표시 |
| ⑦ | §2.2 `batch/live` 주석 · §2.3.0 | "1.06 MiB는 외삽 · 그룹 ≤100 = 1.13 MiB, 그룹 = 스팬 수 = 1.99 MiB · 넘으면 800" | **실측 G=100 → 0.803 MiB, G=N(1,000) → 1.337 MiB(ASCII·한글 동일)** | 산술을 실측으로 교체. **`send_batch_max_size: 1000` 유지**(800 불필요). 그룹 수가 유일한 변수임을 명기 |
| ⑧ | §2.3 압축본 상한 512 KB `[R-P5 P1-1]` | "실측 압축비 10.5~11.5배 → 2 MB 해제분 ≈ 174 KB → 여유 3배 = 512 KB" | 🔴 **정상 입력이 572.4 KiB**(난수 값·G=N·1,000스팬, live-safety 전부 통과). 800으로 낮춰도 458.7 KiB로 여유 10% | **압축본 상한을 해제 후 상한과 같은 2 MiB로 올린다.** 평균 압축비를 상한 근거로 쓰지 않는다(코덱스 P0 판정 7). zip-bomb은 해제 중 스트리밍 검사가 막는다 |
| ⑨ | §2.2 `transform/live-slim` 불변식 | "입력에 의존해 실패할 수 없는 문장만(상수 set·keep_keys·truncate_all)" | 실측이 이 불변식의 **값**을 증명: 이 블록의 문장 하나가 실패하면 그 필드는 **무방비로 전송**(v3 100%) | 유지. 추가로 **"이 블록을 고칠 때는 §7의 C fixture(정리 문장 실패)를 반드시 재실행"**을 절차로 적는다 |
| ⑩ | §2.2 `${...}` 자리표시자 | — | 0.159.0은 **맨 `${VAR}`도 환경변수로 확장**하고, 미설정이면 기동을 **명시적으로 거부**한다 | 🟢 정보로 추가(안전한 성질). `${env:VAR}` 권장은 유지(상위 버전 호환) |

### 동작 최종 yaml (권고 반영본 — `traces/live` 블록만)

> v4 정본에서 **실측으로 바꾼 곳은 없다**(yaml 자체는 v4 그대로 통과). 아래는 v4 원문에 ①②④⑤⑥⑦의 **주석·운영 규칙**만 바로잡은 것이고, 🔴 ⑧은 **BE 설정값**이라 yaml 밖이다.
> 전문 사본: `…/scratchpad/rp5b/v4_on.yaml` (실행 검증본, 본 문서의 모든 v4 수치가 이 파일에서 나왔다)

```yaml
# 🔴 실행 명령에 --feature-gates=ottl.set.allowNil 이 없으면 span.events/links 정리가 무시된다.
#    0.159.0은 프로세스 수명당 WARN 1회만 남긴다(ottlfuncs/func_set.go:46) — 파이프라인 라벨이 없고 카운터도 없다.
#    v4에서는 그 결과가 PII 유출이 아니라 filter/live-safety 전량 차단(라이브 실명)으로 나타난다.  [R-P5b §3.3]
processors:
  transform/live-normalize:
    error_mode: ignore                      # 실패해도 상류 200 유지·저장 경로 중복 0 (R-P5b §7a)
    trace_statements:
      - context: span
        statements:
          - set(span.attributes["http.request.method"], span.attributes["http.method"]) where span.attributes["http.request.method"] == nil and span.attributes["http.method"] != nil
          - set(span.attributes["http.response.status_code"], span.attributes["http.status_code"]) where span.attributes["http.response.status_code"] == nil and span.attributes["http.status_code"] != nil
  filter/live-http-server:
    error_mode: ignore                      # 조건 오류 = 그 조건만 false(fail-open) — 조건은 nil·타입 안전하게만
    traces:
      span:
        - 'span.kind != SPAN_KIND_SERVER'
        - 'span.attributes["http.request.method"] == nil'
        - 'resource.attributes["service.name"] == "${SELF_SERVICE_NAME_BE}"'
        - 'resource.attributes["service.name"] == "${SELF_SERVICE_NAME_COLLECTOR}"'
  transform/live-slim:
    error_mode: ignore                      # 🔴 불변식: 입력 의존 문장 금지. 여기 문장 하나가 실패하면 그 필드는
                                            #    redaction 으로도 안 걸러진다(status.message·name·traceState·scope) — R-P5b §7c
    trace_statements:
      - context: span
        statements:
          - keep_keys(resource.attributes, ["service.name", "service.instance.id", "deployment.environment.name"])
          - truncate_all(resource.attributes, 128)     # ✅ R-P5b: 900 B → 126 B. 없으면 전송 최대가 무한(v3에서 26.2 MiB 실측)
          - set(resource.schema_url, "")
          - keep_keys(instrumentation_scope.attributes, [])
          - set(instrumentation_scope.name, "")
          - set(instrumentation_scope.version, "")
          - set(instrumentation_scope.schema_url, "")
          - keep_keys(span.attributes, ["http.route", "http.request.method", "http.response.status_code", "error.type"])
          - set(span.name, "_live")
          - set(span.status.message, "")
          - set(span.trace_state, "")
          - set(span.events, nil)
          - set(span.links, nil)
          - truncate_all(span.attributes, 256)         # ✅ 바이트 상한이되 **문자 경계에서 자른다**(255 B/87자, U+FFFD 0) — R-P5b §5.3
  redaction/live:
    allow_all_keys: true
    blocked_values:
      - '\b\d{6}-\d{7}\b'
      - '\b(?:\d[ -]*?){13,16}\b'
      - '[\w.+-]+@[\w-]+\.[\w.]+'
    summary: silent        # 0.159.0 기본값도 silent 지만 **명시가 방어**다 — info/debug 면 요약 속성이 붙어 live-safety 가 전량 drop(라이브 100% 실명). R-P5b §8.4
                           # 🔴 방어 범위: 속성 값(span·event attributes)만. status.message·span.name·traceState·scope·events[].name·links[].attributes 는 검사하지 않는다 — R-P5b §7c
  filter/live-safety:
    error_mode: ignore     # 🔴 조건 **단위** fail-open 실증: 깨진 조건이 맡던 검사만 조용히 사라지고 차단 카운터는 0 이 된다(R-P5b §8.3).
                           #    → 알람: pipeline=traces/live 의 WARN `failed to eval condition` 은 **0 이어야 한다**.
                           #    아래 13조건은 nil·비문자열·배열·빈 슬라이스 fixture 전체에서 eval 오류 0 으로 실행 검증됨(R-P5b §8.2·§5.3)
    traces:
      span:
        - 'Len(span.events) > 0'
        - 'Len(span.links) > 0'
        - 'span.name != "_live"'
        - 'span.status.message != ""'
        - 'span.trace_state != ""'
        - 'instrumentation_scope.name != "" or instrumentation_scope.version != "" or instrumentation_scope.schema_url != ""'
        - 'resource.schema_url != ""'
        - 'Len(instrumentation_scope.attributes) > 0'
        - 'Len(span.attributes) > 4 or Len(resource.attributes) > 3'
        - 'span.attributes["http.route"] != nil and not IsString(span.attributes["http.route"])'
        - 'not IsMatch(span.attributes["http.request.method"], "^[A-Za-z_]{1,16}$")'
        - 'span.attributes["http.response.status_code"] != nil and not IsInt(span.attributes["http.response.status_code"])'
        - 'span.attributes["error.type"] != nil and not IsMatch(span.attributes["error.type"], "^[A-Za-z0-9_.$-]{1,64}$")'
    # 차단 수 = otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}   ← 🔴 라벨에 타입 접두 "filter/" 가 붙는다
    # 통과 수 = otelcol_processor_outgoing_items{processor="filter/live-safety"}
  batch/live: { timeout: 1s, send_batch_size: 1000, send_batch_max_size: 1000 }
    # ✅ R-P5b 실측: live-safety 통과 가능한 최대 1,000스팬 배치 = 해제 후 **1.337 MiB**(그룹=스팬 수, ASCII·한글 동일),
    #    그룹 100 이면 0.803 MiB. 2 MiB 대비 1.53배 여유 → **800 으로 내릴 필요 없다**.
    #    🔴 단 gzip 은 저압축 입력에서 **572.4 KiB** → BE 압축본 상한 512 KiB 를 **정상 입력이 넘는다**(§2.3 수정 필요, 2 MiB 로).

service:
  pipelines:
    traces/live: { receivers: [otlp], processors: [memory_limiter, transform/live-normalize, filter/live-http-server, transform/live-slim, redaction/live, filter/live-safety, batch/live], exporters: [otlphttp/moveseye-live] }
```

---

## 11. 하네스 · 재현

`…\AppData\Local\Temp\claude\C--solutions\73f0e76e-73ad-4f5f-b22e-ed7729545a96\scratchpad\rp5b\` (제품 소스 수정 0)

| 파일 | 역할 |
|---|---|
| `design_s2.2_frozen.yaml` / `design_s2.2_v4_frozen.yaml` | 설계 §2.2 **v3(16:52) / v4(17:38) 원문 동결 사본** |
| `v3_on.yaml` / `v3_asdesign.yaml` | v3 결합 정본(치환판 / `${}` 원문판) |
| `v4_on.yaml` | **v4 결합 정본 — 본 문서 v4 수치의 출처** |
| `v3_fail_norm / _first / _clean / _cond2 .yaml` | `ignore` 실패 fixture A·B·C·D |
| `v4_fail_clean / _safety_broken / _safety_holed .yaml` | v4 차단 검증 · 조건 단위 fail-open 검증 |
| `v4_nosummary / _suminfo / _sumdebug .yaml` | `redaction.summary` 3판 |
| `v4_fat1000 / v4_fat800 / v3_fat1000 .yaml` | 정확히 N스팬 배치 측정용(`timeout: 60s`) |
| `gen4.mjs` | PII 13종 BSP 에뮬레이션 부하원(R-P5에서 그대로 재사용) |
| `inject.mjs` | 경계·타입·형태 fixture 직접 주입(`--case boundary\|control\|formcheck`) |
| `fatgen.mjs` / `fatgen2.mjs` | 포화 배치(기여 분해용 / v4 제약 하 최대치·그룹 수·압축률) |
| `capture.mjs` | 라이브 캡처 `:4401` — PII 스캔 + **원문 보존 `--raw`**(본 작업에서 추가) |
| `sproxy.mjs` | 저장 경로 프록시 `:4402` → BE `:3001`(중복 계측) |
| `colctl.sh` `capctl.sh` `run_col.sh` `failrun.sh` | 기동·정지·무인 실행 |
| `branch.py` `dumpraw.py` `enc.py` | 분기 집계 / 캡처 본문 필드·바이트·U+FFFD 덤프 / 인코딩 카운트 |
| `cleanup_count.sql` `cleanup_do.sql` | 정리(§12) |

**재현 — 한 벌:**
```bash
cd <scratchpad>/rp5b
./capctl.sh start t1
./colctl.sh start v4_on.yaml col.log on
node gen4.mjs --endpoint http://127.0.0.1:4328/v1/traces --rate 150 --services 3 --sec 120 --bsp 1000 \
     --pii --errpct 20 --slowpct 10 --rpcpct 20 --oldsempct 25 --selfpct 10 --ledger t1_led.ndjson --label t1
python branch.py t1 t1                       # 분기·유실·배치 크기
curl -s http://127.0.0.1:4401/_stat          # PII 13종·필드 잔존

# 직렬화 최대
./colctl.sh start v4_fat1000.yaml col.log on
node fatgen2.mjs --n 1000 --groups 1000 --charset rand

# 정리 실패 fixture (v3 는 PII 100% 유출 / v4 는 전량 차단)
./failrun.sh x v3_fail_clean.yaml on
./failrun.sh y v4_fail_clean.yaml on
```

---

## 12. 정리 결과 (R-P5 §17 부작용 원복 + 본 작업 부작용)

| 대상 | 삭제 전 | 삭제 후 | 상태 |
|---|---:|---:|---|
| `apm_receive_token` **id 29 `rp5-live-measure`** | 1 | **0** | ✅ 회수(나머지 6건 id 1~6은 기존 QA 토큰, 보존) |
| `apm_service` (env `rp5`·`rp5b` + 본 작업 생성분) | 1,987 / 전체 1,996 | **0** / 전체 **9** | ✅ 기존 9건(`moveseye-be`·`qa-*`)만 남음 |
| `apm_span` | 1,889,511 대상 / 전체 1,972,093 | **0** / 전체 **82,582** | ✅ |
| `apm_trace_summary` | 245,002 대상 / 전체 246,426 | **0** / 전체 **1,424** | ✅ |
| `apm_instance` (cascade) | 1,999 | 전체 **24** | ✅ |
| `apm_otlp_receipt` (token 29) | 4,905 / 전체 4,905 | **0** | ✅ |
| `apm_service_edge_5m` / `apm_dependency_5m` / `apm_db_query_group_5m` | 356 / 178 / 178 | 0 | ✅ |
| `apm_metric_1m/5m/1h` · `apm_messaging_5m` · `apm_zbx_cleanup` | 0 | 0 | 해당 없음 |

삭제 범위는 `apm_service.first_seen_at::date = 2026-09-15` — 오늘 최초 등장이 **14:39:01**(R-P5 시작 시각)이고 그 이전 서비스는 9건(09-01~09-07)뿐임을 확인한 뒤 적용했다. 단일 트랜잭션, `ON_ERROR_STOP`.
🔴 **주의(다음 회차용)**: 본 작업의 poison/난수 fixture는 **저장 파이프라인에도 fan-out**되어 unique `service.name`으로 **1,950여 개의 쓰레기 서비스**를 QA DB에 만들었다. 포화 배치 측정을 할 때는 저장 분기를 끊거나 `service.name`을 고정하는 편이 낫다.

| 프로세스 · 환경 | 상태 |
|---|---|
| RP5b Collector(`:4327/4328/8889/13134`) | **종료** (포트 미청취 확인) |
| 캡처 서버(`:4401`) · 저장 프록시(`:4402`) | **종료** |
| RP5b 큐 디렉터리 `scratchpad/rp5b/queue` | 삭제 |
| **사용자 Collector**(pid 36560, `:4317/4318/8888/13133`) | 🟢 **무접촉 · 계속 실행 중** |
| 사용자 `:3000`(pid 31080) · `:5173`(pid 33704) · dev DB `dmove` | 🟢 **무접촉** |
| QA BE `:3001`(pid 31804) · QA DB `dmove_apm`@5433 | 🟢 **유지**(QA 인프라 존치) |
| 제품 소스 `moveseye-be-spring` · `moveseyee_fe` | 🟢 **수정 0** — 타 세션 미커밋 파일 무접촉, `git stash` 미사용 |

---

## 13. 미측정 · 남은 것

| 항목 | 사유 |
|---|---|
| BE 라이브 수신부의 실제 413/400/415 거절 | BE 미구현(§2.3은 설계 단계). 본 문서 §6의 바이트 수치가 그 상한 설계의 입력 |
| CPU·RSS A/B, 정식 3회 반복, L2/L3 부하 | R2′의 범위(코덱스 §4.4). 본 작업은 **correctness 전용**이며 부하는 60~150 SERVER/초 |
| `num_consumers` 1 vs 2 비교 | R2′ 범위. v3는 2, v4는 1로 각각 정본값 그대로 돌렸고 correctness 차이는 없었다 |
| 실 javaagent 2.31.1 | R7 범위 |
| `dict.instances.key` 해시 입력이 원본인지 redaction 후 값인지 | 설계 미결(코덱스 §5 말미). 본 실측은 **BE 도착 시점에 이미 마스킹된 값**(`PII-SVCINST-911-****`)임을 보였다 — 해시 입력은 마스킹 후 값이 되고, 같은 패턴에 걸린 여러 인스턴스가 한 key로 합쳐진다. 설계가 이 동작을 명시해야 한다 |
