# APM P5.1 — 5단계 잔여(Y1~Y3) + 6단계(Collector 생성 설정·설치 가이드·운영 관측·카나리아·라이브 조회) BE 검수

- **대상** worktree `C:\solutions\moveseye-be-spring-p5` · 브랜치 `p5-live` · HEAD `3c76a74` 위 **미커밋**(수정 28 · 신규 10)
- **구현 보고** `reviews/review_apm-p51-s6-be_codex-impl.md` (코덱스 gpt-6-astra)
- **정본** `designs/devdesign_apm-realtime.md` v4.3 §2.1·§2.2·§2.3·§3.2·§3.3·§7.1(6단계 행) / 실측 `verification/r-p5b_apm-live-yaml-correctness.md` / 5단계 검수 `reviews/review_apm-p51-s5-be_claude.md`
- **검수 방식** 읽기 전용(제품 코드 수정 0 — 변이 시험 3건은 적용 후 **md5 대조로 원복 확인**) · 선별 테스트만(전체 `:test` 미실행) · 일시 2026-09-16

---

## 0. 결론

| 항목 | 판정 |
|---|---|
| **🔴 심각** | **3건** (R1 검증 버튼 오염 · R2 별칭 전역 치환이 호환 분기 파괴 · R3 기존 전송 실패 차트 오염) |
| **🟡 권고** | **14건** |
| **🟢 확인** | 9건 |
| **병합 가능 여부** | **조건부 가능** — R1·R3은 화면(P5.2/수집기 탭)이 이 값을 읽기 전에 반드시 처리. R2는 커밋 전 1줄 수정 권고 |
| **R-P5b 재시험 필요 여부** | **불필요.** 생성 yaml의 라이브 프로세서 블록이 R-P5b 통과본 `v4_on.yaml`과 **md5 동일**(`944bde2816044f51aadc30c45fcb3801`) — 13조건·`summary: silent`·`live-slim` 14문장·batch 1s/1000/1·gate 경고 전부 일치 |
| **정본 반영 필요** | **4건** (§3.2 snapshot 교체 계약 · §2.2ⓑ 알람 판정식 · §2.2 별칭 표기 · §7.1 골든 회귀) |

---

## 1. 🔴 최우선 — 생성 yaml이 R-P5b 통과본과 문장 동일한가 → ✅ **PASS**

**직접 대조 방법**: 이 세션 scratchpad에 R-P5b가 남긴 실물 `rp5b/v4_on.yaml`을 찾아, ① 템플릿 `collector-live-template.yaml`과 ② **런타임 테스트가 실제로 생성해 Collector에 먹인** `config.yaml`(`%TEMP%\junit…\run-true-false-false\config.yaml`) 양쪽을 `transform/live-normalize:` ~ `batch/live:` 구간으로 잘라 diff·md5.

| 대조 | 결과 |
|---|---|
| `v4_on.yaml` 라이브 프로세서 블록 | md5 `944bde2816044f51aadc30c45fcb3801` |
| `collector-live-template.yaml` 동일 구간 | **md5 동일 · diff 0줄** |
| **생성 yaml**(실행에 쓰인 것) 동일 구간 | **md5 동일 · diff 0줄** |

개별 불변식 확인:

| 불변식 | 판정 |
|---|---|
| `filter/live-safety` **13조건**, nil·타입 안전 형태만(`Len`·`IsString`·`IsInt`·문자열 비교·`IsMatch`) | ✅ 13/13 문장 동일 |
| `redaction/live` `summary: silent` | ✅ 존재 · `ApmCollectorLiveConfigTest:26`이 문자열로 강제 |
| `transform/live-slim` keep_keys + 정리 4문장(`scope.name`·`version`·`schema_url`·`resource.schema_url`) | ✅ 14문장 전부 동일 |
| `batch/live: timeout 1s · send_batch_max_size 1000` · `num_consumers: 1` | ✅ |
| 상단 gate 경고 | ✅ 4줄 주석이 파일 **맨 앞**(`ApmCollectorConfigGenerator:712`, `startsWith("# ⚠")` 단언) |
| 파이프라인 순서 `memory_limiter → live-normalize → live-http-server → live-slim → redaction/live → live-safety → batch/live` | ✅ 동일 |

유일한 문자열 차이는 **의도된 것**이다 — `${env:MOVESEYE_LIVE_TRACES_URL}`/`${env:RECEIVE_TOKEN}`이 생성기에서 실값으로 치환된다(R-P5b §3.1이 `env:` 없는 맨 `${}`도 0.159.0에서 확장됨을 이미 확인했고, 생성기는 아예 치환한다). 라이브 endpoint는 `endpoint + "-live/v1/traces"` → `…/apm/otlp-live/v1/traces`로 §2.3 경로와 일치(`ApmCollectorConfigGenerator:141`).

> 🟡 **Y-d(아래)** — 이 "문장 동일"을 지키는 **회귀가 없다.** 테스트는 조건 **개수 13**만 센다. `IsMatch` 패턴을 완화하는 식의 변경은 15개 fixture에도, 개수 단언에도 걸리지 않는다. §7.1이 요구하는 것은 개수가 아니라 동일성이므로 **골든 해시 회귀**가 필요하다.

---

## 2. 저장 경로 불변 → ✅ (단 **바이트 동일은 아니다**)

- **파이프라인 정의 불변** ✅ — `ApmCollectorLiveConfigTest:31~35`가 off/on 두 yaml을 SnakeYAML로 파싱해 `service.pipelines`의 **기존 항목 전부를 map 동등성으로** 비교한다(중복 키 금지 옵션까지 켜 둠). `traces`(tail_sampling 포함)·`metrics`·`metrics/self`·`logs` 어느 것도 프로세서 순서가 바뀌지 않았다.
- **런타임 회귀도 있다** ✅ — `ApmCollectorLiveRuntimeTest:124`가 실제 Collector 구동 후 저장 캡처 본문에 `db.query.text`·`select ?`가 들어 있는지 단언한다(= `transform/sql` 마스킹이 라이브 블록 추가 뒤에도 작동). §7.1의 "저장 pipeline gate 회귀" 항목 충족.
- **`liveSpans=false`에서 출력이 기존과 바이트 동일한가 → ❌ 아니다.** 다만 셋 다 의도된 변경이다:
  1. 별칭 교체(`otlphttp/moveseye`→`otlp_http/moveseye`, `resourcedetection`→`resource_detection`) — 정의 2줄 + 파이프라인 4줄 + k8s 1줄.
  2. `ApmCollectorConfigGenerator:718`의 `template()`이 `\r\n`→`\n`로 정규화. **템플릿 3종은 이 작업 트리에서 실제로 CRLF**이고(`collector-live-template.yaml` CR 80개 확인) `core.autocrlf=true`다 → 기존에는 CRLF 출력, 지금은 LF 출력. 문자열 절단 수술(`live()`/`liveObservation()`의 `indexOf("\nexporters:")`)이 CRLF에서 조용히 실패하므로 **정규화 자체는 올바른 방어**다.
  3. `liveSpans=true`일 때만 `service.telemetry.metrics.level`이 `normal`→`detailed`로 승격(`ApmCollectorConfigGenerator:748`). off에서는 `normal` 유지 ✅. (→ 🟡 Y-g)

---

## 3. deprecated 별칭 교체 → ✅ 유효 / 🔴 R2 부작용

- **0.159.0에서 유효한 이름인가 → ✅ 실증.** `ApmCollectorLiveRuntimeTest:141`이 실제 Collector 로그에 `alias is deprecated`가 **없음**을 단언하고 통과했다(선별 재실행 2/2 green). R-P5b §3.2가 관측한 경고 원문(`"otlphttp" alias is deprecated; use "otlp_http" instead`, `"resourcedetection" … use "resource_detection"`)이 지시한 이름과 정확히 같다.
- 기존 사용자 설정과의 충돌: 생성 yaml만 바뀌고 사용자가 손댄 파일은 그대로다. BE 쪽 대조 코드는 두 표기를 모두 받는다(`ApmCollectorMetricStore.isLiveExporter`, `ApmCollectorLogStore.LIVE_COMPONENTS`) ✅.
- 🔴 **R2 — 전역 문자열 치환이 그 호환 분기를 Collector 쪽에서만 파괴한다.** 아래 §8-R2.

---

## 4. 설치 가이드 (`ApmInstallGuideService`)

| 항목 | 판정 |
|---|---|
| Windows `New-Service -BinaryPathName '"<bin>" --config "<cfg>" --feature-gates=ottl.set.allowNil'` | ✅ **실행형으로 검증됨** — 런타임 테스트가 이 문자열을 `collector.service` 스텝에서 꺼내 `-BinaryPathName '…'` 안쪽만 토큰화해 **그대로 Collector를 기동**한다(`ApmCollectorLiveRuntimeTest:83~95`). 가이드 문자열 ≠ 실제 실행 가능의 간극이 닫혔다 |
| Linux `ExecStart=%s --config %s --feature-gates=…` | ✅ 형태 유효(문자열 회귀만 — 코덱스 고지대로) |
| macOS plist `<string>--feature-gates=…</string>` 추가 | ✅ 형태 유효(문자열 회귀만) |
| `binPath(WINDOWS)` == 등록 스텝의 `installDir + "\otelcol-contrib.exe"` | ✅ 동일(`ApmInstallPaths:112`) — 갱신 명령이 서비스를 다른 경로로 돌려놓지 않는다 |
| **기존 설치 갱신 절**(`collector.update`) | ✅ 3 OS 전부 신설. Windows는 `Invoke-CimMethod … Change @{PathName=…}`로 **설정만 덮어써도 실행 인자는 안 바뀐다**는 함정을 명시 |
| 고객 문구 규칙(검수번호·§·"실측"·HTML 태그·내부 용어) | ✅ **위반 0.** `§`·`실측`·`<b>` 히트는 전부 Javadoc이며 고객 문자열에 없다. `ApmCollectorLiveConfigTest:50`이 `update.note()`에 `§`·`실측`·`<b>`·`R-P5` 부재를 강제 |
| BSP 지연 프로필 | ✅ `OTEL_BSP_SCHEDULE_DELAY=1000` + `OTEL_BSP_MAX_QUEUE_SIZE=2048` 공통 env로 추가, 문구도 "보장하지 않는다"까지 정직 |

🟡 **Y-l** — macOS 갱신 명령이 `bootout … && bootstrap …`이다. 데몬이 이미 언로드된 호스트에서는 `bootout`이 0이 아닌 코드를 반환해 **`&&`가 끊기고 bootstrap이 실행되지 않는다**. `sudo launchctl bootout system/<label> 2>/dev/null; sudo launchctl bootstrap system <plist> && sudo launchctl print …` 형태 권고.

🟡 **Y-m** — 생성 yaml 헤더의 자리표시 **범례에 `${MOVESEYE_LIVE_TRACES_URL}`이 없다**(`collector-template.yaml:13~20`). 생성기는 치환하지만, 파일이 스스로 설명하는 목록이 불완전해졌다.

🟡 **Y-n(경미)** — `OTEL_BSP_SCHEDULE_DELAY`가 공통 env 목록 **맨 앞**에 들어가 `OTEL_SERVICE_NAME`(가장 중요한 값)이 두 번째로 밀렸다. 순서만 뒤로.

---

## 5. V59 마이그레이션 → ✅ 정합

| 관례 | 판정 |
|---|---|
| 번호 충돌 | ✅ 본 레포 최신이 V58(`home_widget_dashboard_key`, 타 세션), 메인 체크아웃에도 V59 없음 |
| dev DB 미적용 전제 | ✅ 확인 — `dmove`@5433은 V58까지, `to_regclass('apm_collector_log_1m')`가 **NULL** |
| 멱등 DDL | ✅ `CREATE TABLE IF NOT EXISTS` · `CREATE INDEX IF NOT EXISTS` |
| V38 공통 규칙(시각 컬럼 `DEFAULT now()` 금지) | ✅ `bucket_start`·`last_seen_at` 전부 앱이 만든 값 |
| V27식 `'{}'` 기본값 함정 | ✅ 해당 없음(jsonb·배열 컬럼 없음) |
| NULL vs 빈 문자열 | ✅ PK 구성요소인 `pipeline`·`component`는 `NOT NULL DEFAULT ''` — PG UNIQUE가 NULL을 중복으로 안 보는 함정을 정확히 피했다. 반면 "결측"을 표현해야 하는 `partial_spans`만 nullable |
| 파티션 | 미사용. `apm_metric_1m`(V38)도 비파티션이고 보존은 배치 삭제(`ApmCollectorLogStore.expire()` 1시간 주기·7일)라 관례 일치 ✅ |
| 롤백 불가 변경 | 없음(신규 테이블 1 + 인덱스 1, 기존 스키마 무변경) ✅ |

---

## 6. `ApmCollectorMetricStore` · `ApmCollectorLogStore`

**기존 집계 형태 보존**: `series()`/`CollectorCell`/센티널 규약은 손대지 않고 `liveMetrics()`·`liveLogs()`를 **추가**만 했다 ✅. `ApmCollectorQueryServiceTest` 8건·`ApmCollectorMetricStoreIT` 10건 전부 green.

**메트릭 이름·라벨의 실재성** — R-P5b가 실제 Collector에서 긁어 둔 `base_metrics.txt`로 대조:

| 코드가 기대하는 것 | 실측 |
|---|---|
| `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` | ✅ 존재(`filter="filter/live-http-server"` 형태 확인) — 타입 접두 `filter/` 포함 |
| `otelcol_processor_incoming_items{processor=…}` / `outgoing_items` | ✅ 존재(`_total` 접미 없음) |
| `otelcol_exporter_queue_size{exporter=…}` | ✅ 존재 |

**로그 계수가 "손실 수가 아님"이 드러나는가 → ✅ 3중으로 명시**: V59 파일 1행 주석 · `ApmCollectorLogStore` 클래스 주석 · `ApmCollectorLiveDto.Logs` Javadoc("샘플링된 로그 관측치이며 정확한 거절/손실 수가 아니다") + DTO에 `sampled` 필드로 **응답에도** 실린다. 컨트롤러 `@Operation` 설명에도 "WARN과 전송 실패 신호는 손실 수가 아닙니다"가 있다.

**90초 null 규칙 / 보존·정리** ✅ — `liveLogs()`가 `last_seen_at`이 `to-90s`보다 오래면 전 수치를 null로 내리고 `observedAt`만 남긴다. `ApmCollectorMetricStoreIT.sampledLogsPersistSeparatelyAndStaleCollectionIsNull`·`freshOrdinaryLogMeansObservedZeroAndNoLogsMeansUnknown`이 **"조용한 로그=0" vs "로그 없음=null"을 갈라서** 단언한다 — §7.1의 "로그 수집 중단 시 결측 ≠ 0" 요건 충족 ✅. 원문 미저장도 `json_agg`로 `private-marker` 부재를 확인한다 ✅.

🟡 **Y-r** — `enqueueFailed`/`sendFailed`는 **실패가 한 번도 없으면 메트릭 자체가 존재하지 않아** null이 된다(R-P5b 스크레이프에도 두 메트릭이 없다). DTO 계약상 null = "관측 불가"인데 실제로는 "실패 0"인 경우가 대다수다. 화면이 정상 상태를 "관측 불가"로 그릴 위험 → `sent_spans`가 있고 failure 계열만 없으면 0으로 볼지, 아니면 별도 플래그를 둘지 결정 필요.

🟡 **Y-s** — `ApmDimsNormalizer.collectAll()`이 5개 키(`exporter`·`error_type`·`filter`·`processor`·`otel_signal`)를 선점하면서 12개 상한에서 **기존에 살아남던 라벨 일부가 밀려난다.** 같은 메트릭의 과거 행과 신규 행이 서로 다른 dims(= 다른 시리즈)가 된다. 영향은 작지만 회귀는 신규 키 보존만 덮는다.

🟡 **Y-t** — `record()`가 분류 불가 `other` 로그도 `observed++`하고 **전부 0인 행을 INSERT**한다(생존 신호 의도). 그 의도가 코드/DTO 어디에도 안 적혀 있어 다음 사람이 버그로 읽기 쉽다.

---

## 7. 카나리아 11종 → ✅ 정본과 1:1

정본 §2.3(라인 257) 고정 목록 ↔ `LiveSlimReason`:

`eventsPresent` · `linksPresent` · `unknownKey` · `scopeResidue` · `resourceSchemaUrl` · `nameNotLive` · `statusMessage` · `traceState` · `typeMismatch` · `lengthOver` · `formUnsafe` — **순서까지 동일, 누락 0, 초과 0** ✅

- **원문 미기록** ✅ — 라이브 ingest 패키지(`ingest/live/*.java`)에 **로그 문장이 0건**(grep 확인). 라벨은 enum 이름뿐, 예외 메시지는 `LiveIngestException.malformed()` 고정 문자열. `LiveSlimCanaryTest`가 11종 전부에 대해 `item.toString()`에 fixture 문자열(`private-sample`) 부재를 단언 ✅
- **수신 집계 영향 없음** ✅ — 같은 테스트가 매 케이스마다 `accepted == 1`, `rejected == 0`, `rejectedSpans` 전 항목 0을 단언한다(= 카나리아는 경고이지 거절이 아니다)
- **파서 정확도** ✅ — `BoundedText.full`은 바이트 상한을 **초과**할 때만 true이므로, OTTL `truncate_all(256)`이 만든 정확히 256 B 값에 `lengthOver` 오탐이 나지 않는다. resource/scope가 spans **뒤에** 오는 JSON에서도 같은 `Checks`를 공유하도록 설계했고 전용 회귀(`resourceAndScopeAfterSpansStillApplyToEverySpan`)가 있다
- 🟡 **Y-k(성능)** — `attributes()`가 속성마다 `Set.of("http.method","http.status_code","deployment.environment")`를 새로 만들고, `checkForm()`이 `String.matches`로 매번 Pattern을 컴파일한다. 수신 핫패스다 → `static final Set` / `static final Pattern`으로.
- 🟡 **Y-u(경미)** — `scope.attributes` 잔존을 `unknownKey`로 센다(`LiveSpanParser:196`). 정본에서 그 자리는 `scopeResidue`(scope name/version/schemaUrl)와 `unknownKey`(허용목록 밖 키) 사이 경계가 모호하지만, 화면이 "정본 yaml 누락"과 "허용목록 밖 키"를 다르게 안내한다면 `scopeResidue`가 더 맞다.

---

## 8. 🔴 목록 (재현 · 수정안)

### 🔴 R1 — 수집기 **자기 로그가 "최근 수신" 검증 카운터를 오염**시킨다
`ApmOtlpController:375~381`
```java
int observed = collectorLogs.record(token.getId(), logs, …);
if (observed > 0) { recentTracker.record(token.getId(), receivedAt, observed, 0); return ok; }
```
`ApmIngestRecentTracker`는 클래스 주석이 못박은 대로 **"설치 직후 '설정이 맞았나'를 60초 안에 확인하는" 검증 버튼 전용**이다. 그런데 `liveSpans=true` 설정에는 `logs/self` 파이프라인이 따라붙어 **Collector 자신의 로그**가 5초 배치로 같은 토큰·같은 EP로 계속 들어온다. 분류 불가 로그도 `observed++` 되므로(`ApmCollectorLogStore:60`) 카운터가 올라간다.

**재현**: liveSpans=true 설정으로 Collector 기동 → 애플리케이션 SDK는 **아무것도 안 붙임** → 수집기 화면 검증 버튼이 `points > 0`으로 **"최근 60초 수신 있음"**을 보고한다. 앱 계측이 통째로 잘못돼 있어도 초록불이 뜬다 — 이 버튼의 존재 이유가 사라진다.

**수정안**: 자기 관측 로그는 `recentTracker`에 넣지 않는다.
```java
if (observed > 0) return ResponseEntity.ok(Map.of());   // recentTracker.record(...) 제거
```
수집기 생존 여부는 이미 `ApmCollectorLiveDto.Logs.observedAt`(= `apm_collector_log_1m.last_seen_at`)이 답한다. 회귀 1건: "자기 관측 로그만 들어온 뒤 `GET /apm/ingest/recent`가 비어 있다".

### 🔴 R2 — 전역 `replace("otlphttp/", "otlp_http/")`가 관측 템플릿의 **구 별칭 호환 분기를 파괴**한다
`ApmCollectorConfigGenerator:153` — 조립이 **끝난 뒤** 문자열 전체에 치환을 건다. 그래서 `collector-live-observation-template.yaml`이 일부러 둘 다 받도록 쓴 두 자리가 중복으로 접힌다. 실제 생성물(`run-true-false-false/config.yaml`):
```
181:  … log.attributes["otelcol.component.id"] == "otlp_http/moveseye-live" or … == "otlp_http/moveseye-live")
185:  … IsMatch(…, "^(…|otlp_http/moveseye-live|otlp_http/moveseye-live)$")
```
**재현**: 구 별칭(`otlphttp/moveseye-live`)으로 손수 편집한 설정을 쓰는 Collector에서 BE가 `partialSuccess`를 돌려주면, 그 로그는 `kind="other"`로 접혀 **`partialSuccessWarn`이 조용히 0**이 된다(BE 쪽 `LIVE_COMPONENTS`는 둘 다 받으므로 "왜 0인지"가 더 안 보인다).

**수정안**: 치환의 유일한 실제 대상은 `kubernetes()`가 하드코딩한 k8s 파이프라인 문자열이다.
```java
// ApmCollectorConfigGenerator:698~699
"… exporters: [otlp_http/moveseye] }"   // otlphttp/ → otlp_http/ 로 직접 수정
// 그리고 :153 의 전역 replace 두 개를 삭제
```
회귀 1건: 생성 yaml에 `"otlphttp/moveseye-live"`가 **정확히 1회** 남아 있을 것.

### 🔴 R3 — 라이브 exporter 실패가 **기존 P4 "전송 실패" 차트에 합산**된다
`ApmCollectorMetricStore.series()`는 `metric like 'otelcol_exporter_send_failed%'`를 **exporter 구분 없이** 합산하고 `max(queue_size)`도 전 exporter 공통이다. 같은 클래스 Javadoc이 이 지표를 "'수집기가 끊겼나'에 답한다"고 못박았다.

그런데 라이브 exporter는 설계상 **손실이 정상 동작**이다 — `queue_size: 5` · `block_on_overflow: false` · `retry_on_failure: disabled` · `timeout: 3s`. BE 라이브 EP 하나만 느려져도 `otelcol_exporter_send_failed_spans{exporter="otlp_http/moveseye-live"}`가 상승하고, 저장 경로는 완전히 멀쩡한데 **수집기 탭이 "전송 실패 급증"을 그린다**. 정본이 `enqueue_failed + send_failed{exporter=live}`를 **별도 "전송 실패 신호"로 부르라**고 한 것과 정면으로 어긋난다(§2.1 ⑤).

**재현**: liveSpans=true 상태에서 BE의 `/apm/otlp-live/v1/traces`만 5xx로 만들면 `GET /apm/collectors/{id}/series`의 `sendFailed`가 오른다(저장 경로 무손상).

**수정안**: `series()` SQL의 `send_failed` filter 절과 where 절에 exporter 제외를 추가.
```sql
sum(m.sum) filter (where m.metric like ?
    and coalesce(m.dims->>'exporter','') not in ('otlphttp/moveseye-live','otlp_http/moveseye-live')) as send_failed
```
`queue_size`도 동일 조건 권고(라이브 큐 최대 5는 저장 큐 5000과 한 칸에 섞을 값이 아니다). 회귀 1건: 라이브 exporter 실패 행을 넣어도 `CollectorCell.sendFailed`가 변하지 않을 것.

---

## 9. A-Y1 ~ A-Y3 판정

### Y1 — `control{degraded, reason}` 3종 → ✅ **해소**
`LiveSnapshotRemainingTest:35·41·50`. **모킹으로 우회하지 않았다** — 셋 다 그 상황을 실제로 만든다:
- `frame_limit`: frame 상한 4,000 B로 연결 → 200점 주입 → tick
- `arena_pressure`: 축소된 `LiveSpanStorageProperties`로 링을 만들고 **`counters().arenaPressure`가 양수임을 먼저 단언**한 뒤 tick
- `connection_queue`: 연결 큐 12,000 B로 연결 → 200점

`reason` 문자열과 `clientKeepRatio`(1 / 1 / 0.5)까지 단언한다. Mockito 사용 0건.

### Y2 — 점당 90 B · 만석 0.828504 → ✅ 정본과 일치, 🟡 근거는 산술뿐
`LiveSpanSnapshot.POINT_BYTES = 90`. 검증식 `keepRatio(1_350_000, 0, 0, 96 MiB)` = 100,663,296 / (1,350,000 × 90) = **0.828504** — 정본 §3.3의 0.83과 맞는다. 두 번째 단언(emphasis 50,000 · fixed 128 KiB → 0.82)도 타당하다.

정수 `1/k` → 연속 비율 전환도 개선이다. 표본 선택이 `floorMod(hash, keep)`에서 `(hash>>>11)·2⁻⁵³ < ratio`로 바뀌면서, **ratio를 낮추면 이전 표본의 부분집합**이 되는 단조성이 생겼다(재시작 시 점이 튀지 않는다).

🟡 **Y-c** — 90 B의 근거는 주석 한 줄("튜플 78~85 B에 숫자 폭 여유")이다. 실제 튜플 `[int, float, int, int, int, "32hex", "16hex"]`을 세면 typical ≈ 88 B(구분자 포함)로 **여유가 2 B**뿐이고, `durationMs`가 지수 표기로 길어지면 초과한다. 실제 버킷 하나를 직렬화해 **점당 바이트 ≤ POINT_BYTES**를 단언하는 회귀 1건 권고. (초과해도 Y3의 축소·재시작이 받아 주므로 사고는 아니다.)

### Y3 — 전송량 초과 시 축소·재시작 → ✅ 동작, 🔴 아님 / 🟡 2건 + **정본 반영 1건**
`LiveSpanSnapshot:26~44`. 초과 시 `SnapshotOverflow`를 던져 `ratioLimit = ratio × 0.8`로 낮추고 **새 `snapshotId`로 begin부터 다시** 보낸다. 미완 snapshot에는 `end`를 내지 않고 `degraded{frame_limit}`을 먼저 발행한다. 회귀 `snapshotGrowthRestartsWithSmallerSampleInsteadOf503`이 begin ≥ 2 · 마지막 `snapshotKeepRatio < 1` · `end` 정확히 1건 · `end.snapshotId == 마지막 begin.snapshotId` · `control{reject}` 0건을 단언한다(테스트 전용 `transferCap`=220 KB 주입, 프로덕션 32/96 MiB 경로 자체는 미실행).

**§3.2 병합 규칙·FE 계약 안전성 판단**: `end`가 마지막 `snapshotId`로만 나가고 체크섬/청크 수도 그 시도 기준이므로 **서버 쪽은 일관적**이다. 그러나 §3.2 규칙 2는 "`begin`~`end`를 모아 `end`에서 한 번에 확정, 누락·불일치면 **재요청**"만 말한다 — 중간에 **새 `begin`이 도착하는 경우가 계약에 없다.** 정본대로 구현한 FE는 두 번째 begin 이후의 chunk를 첫 snapshotId와 대조해 "불일치 → 재요청"으로 가거나, 최악에는 두 시도의 chunk를 섞는다.

→ **정본 반영 항목 ①**: §3.2에 "`snapshot.begin`이 다시 도착하면 직전 미완 snapshot 버퍼를 **폐기하고** 새 `snapshotId`로 다시 모은다. `end` 없이 끝난 snapshotId는 확정하지 않는다"를 명시. `degraded{frame_limit}`이 선행 신호임도 함께.

🟡 **Y-b** — 재시작 루프에 **횟수 상한이 없다**(`while(true)`, ratio 0.8배씩 0.01까지 ≈ 최대 21회). 더 중요한 것은 매 시도마다 `transferred = 0`으로 리셋되므로 **회선에 실제로 나간 누적 바이트는 `transferCap`을 넘는다** — 상한이 "마지막 시도"에만 적용된다. 연결 큐 8 MiB·전역 고유 96 MiB 예산이 뒤를 받치긴 하나, 시도 수를 3회 정도로 묶고 그 뒤에는 현 동작(`TooLarge` → 503)으로 떨어뜨리는 편이 안전하다. 회귀 1건 권고.

---

## 10. 테스트 품질 — §7.1 6단계 필수 회귀 대조

| §7.1이 요구한 회귀 | 판정 | 근거 |
|---|---|---|
| gate OFF | ✅ | `ApmCollectorLiveRuntimeTest` `runScenario(false,false)` — 실제 Collector에서 `silently ignored a nil value` 로그 + `nilGate` 분류 + live 0 + 차단 1 |
| 필드별 정리 실패 | ✅ | `bypassSlim` 15종 fixture(events·links·name·status·traceState·scope 3종·scopeAttributes·resourceSchema·unknown·routeType·methodForm·statusType·errorForm) 전부 전송 전 차단 |
| 잘못된 타입 | ✅ | `routeType`(int) · `statusType`(string) |
| 값 검사 실패 | ✅ | `methodForm` · `errorForm` |
| **로그 수집 중단(결측 ≠ 0)** | ✅ | `ApmCollectorMetricStoreIT.freshOrdinaryLogMeansObservedZeroAndNoLogsMeansUnknown` + stale 91초 케이스 |
| 정상 fixture 보존 | ✅ | gate ON에서 `/orders/{id}`·`_live` 도착, `private-marker`·`db.query.text` 부재 |
| 위험 payload 전송 전 차단 | ✅ | `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` 실측 계수 |
| exporter별 enqueue/send 실패·partial 거절 분리 | ✅ | `liveExporterErrorTypesAndSafetyLabelsSurviveStorage`(error_type 분리·잘못된 라벨 `live-safety` 무시) + 런타임 `partialSuccess` 분류 |
| **실제 시작 명령으로 생성 YAML 구동** | ✅ | 가이드 문자열 → 토큰화 → `validate` → 기동까지 전부 실행 |
| **저장 pipeline 회귀(`transform/sql` 런타임)** | ✅ | 저장 캡처에 `select ?` 단언 |
| **라이브 블록이 `v4_on.yaml`과 문장 동일** | 🟡 **미덮임** | 조건 **개수 13**만 단언 → Y-d |

**누락 나열**: (a) 라이브 블록 골든 동일성(Y-d) · (b) 점당 직렬화 바이트 실측(Y-c) · (c) 컨트롤러를 **경유한** 앱 로그 회귀 — `ApmOtlpControllerTest`는 `ApmCollectorLogStore`를 mock으로 갈아 끼워 새 분기가 한 번도 실행되지 않는다(Y-o) · (d) snapshot 재시작 횟수 상한(Y-b).

### 변이 시험 3/3 **전부 검출** (적용 → 실행 → 원복 → md5 대조 완료)

| 변이 | 검출 | 잡은 테스트 |
|---|---|---|
| **M1** `filter/live-safety`에서 `'span.status.message != ""'` **1조건 제거**(R-P5b §8.3의 `v4hole` 구멍 재현) | ✅ **3건 실패** | `ApmCollectorLiveConfigTest.liveIsExplicitOptInAndDoesNotChangeStoragePipelines`(13조건) · `…RuntimeTest:141`(차단 15 미달) · `…RuntimeTest:109`(정리 실패 스팬 전송 전 차단 실패) |
| **M2** Windows `New-Service`에서 `--feature-gates=ottl.set.allowNil` 제거 | ✅ **3건 실패** | `everyOsIncludesGateUpgradeAndBspProfile[WINDOWS]` · 런타임 2건(실행 인자 단언) |
| **M3** 카나리아 `statusMessage` 사유 무력화(`residue(...)` → `skipChildren()`) | ✅ **1건 실패** | `LiveSlimCanaryTest.countsEveryPostconditionOnceWithoutRetainingOriginal[7] reason=statusMessage` |

**원복 검증** — 변이 전/후 md5 완전 일치:
```
ed285eb9b44b15753a16fc59f9c138dd  collector-live-template.yaml
2283fd5c1c15aad3d6c362723706f070  ApmInstallGuideService.java
1e098e007b485d464f296a5f7b961aa1  LiveSpanParser.java
```
`git status --short` 38줄(수정 28 + 신규 10)로 검수 전과 동일.

---

## 11. 선별 재실행 수치 · 위생

| 실행 | 결과 |
|---|---|
| `ApmCollectorConfigGeneratorTest` 29 · `LiveSlimCanaryTest` 14 · `ApmCollectorPropertiesConsistencyTest` 10 · `LiveSnapshotRemainingTest` 5 · `ApmCollectorLiveConfigTest` 5 · `ApmKubernetesConfigTest` 2 | **65 / 0 실패 / 0 skip** |
| `ApmCollectorLiveRuntimeTest`(실 Collector 0.159.0 구동, 4 시나리오) | **2 / 0 실패 / 0 skip** · 59초 |
| `ApmCollectorMetricStoreIT` 10 · `ApmCollectorQueryServiceTest` 8 · `ApmCollectorApiMvcTest` 14 · `ApmOtlpControllerTest` 22 · `ApmDimsNormalizerTest` 2 · `LiveIngestSecurityChainTest` 11 · `ApmReceiveTokenServiceTest` 17 | **84 / 0 실패 / 0 skip** (도커 `dmove-postgres-test` 사용) |
| **합계** | **151건 green**(전체 `:test` 미실행 — 호스트 메모리 제약, `--max-workers=1`, 실행 중 여유 5.9 GB 이상 유지) |

- `git diff --check` → **깨끗함**(공백 오류 0). LF/CRLF 경고는 `core.autocrlf=true` 환경의 일반 경고.
- worktree 임시 파일 **0건** — 신규 10개는 전부 의도된 산출물(소스 3·yaml 2·V59 1·테스트 4).
- 🟡 **Y-p** — `ApmCollectorLiveRuntimeTest`가 `@TempDir(cleanup = NEVER)`라 실행마다 `%TEMP%\junit…`에 Collector 로그·큐가 남는다(현재 55개 · 5.4 MB 누적). 증거 보존 의도는 이해되나 최근 N개만 남기거나 실패 시에만 보존하는 편이 낫다.

---

## 12. 🟡 전체 목록 (14건)

| # | 내용 | 권고 시점 |
|---|---|---|
| Y-b | snapshot 재시작 루프 무제한 + 시도별 `transferred` 리셋으로 실제 회선 누적이 상한 초과 | P5.2 전 |
| Y-c | `POINT_BYTES=90` 실측 회귀 부재(여유 약 2 B) | P5.2 전 |
| Y-d | **라이브 블록 골든(md5) 회귀 부재** — §7.1 "v4_on.yaml과 문장 동일"을 지키는 장치가 없다. 바뀌면 R-P5b 재시험을 강제하도록 | **커밋 전 권고** |
| Y-e | 런타임 테스트가 바이너리 없으면 `assumeTrue`로 **조용히 skip** → CI green. `APM_RUNTIME_REQUIRED=1`류 플래그로 강제 실패 | 다음 라운드 |
| Y-f | **건강한 Collector는 로그를 안 쓴다** → 90초 뒤 `logs.*` 전부 null. 정본 §2.2ⓑ 알람 `failed to eval condition{pipeline=traces/live} == 0`을 이 데이터로는 "정상"으로 판정할 수 없다(항상 "관측 불가") → **정본 반영 ②** 또는 하트비트 도입 | 화면 전 |
| Y-g | `liveSpans=true`에서 `telemetry.metrics.level: detailed` 승격 → 자기 메트릭 카디널리티·`apm_metric_1m` 행 수 증가. 필요한 변경이나 볼륨 상한·회귀 없음 | 출시 부하 검증 |
| Y-h | Collector 내부 로그 **전량**(INFO 포함)이 상시 BE로 전송(5초 배치·100건). 본문은 5종 라벨로 치환되어 PII 위험은 없으나 `other`가 필터를 통과하므로 사실상 상한이 없다 | 출시 부하 검증 |
| Y-i | 자기 로그 피드백 루프(내부 로그 → :4319 → `logs/self` → 전송 실패 → 다시 로그). `error_mode: silent`·retry off·5초 배치로 감쇠되나 BE 장애 중 저율 지속 | 출시 부하 검증 |
| Y-k | 수신 핫패스의 `Set.of(...)` 매 속성 생성 · `String.matches` 매 호출 Pattern 컴파일 | 다음 라운드 |
| Y-l | macOS 갱신 `bootout && bootstrap` 단락 — 미로드 상태에서 갱신 실패 | 다음 라운드 |
| Y-m | 생성 yaml 헤더 범례에 `${MOVESEYE_LIVE_TRACES_URL}` 누락 | 다음 라운드 |
| Y-o | 컨트롤러 경유 앱 로그 회귀 부재(`ApmCollectorLogStore` mock으로 신규 분기 미실행). 400/503 신설 응답도 미검증 | 다음 라운드 |
| Y-r | 실패 0이면 메트릭 자체가 없어 null — "미관측"과 "실패 없음"이 구분 불가 | 화면 전 |
| Y-s/t/u/n/p | dims 선점으로 시리즈 분리 · `other` 행 의도 미기재 · `scope.attributes`를 `unknownKey`로 계수 · env 순서 · 임시 디렉터리 누적 | 여유 시 |

---

## 13. 🟢 확인된 것

1. 생성 yaml 라이브 프로세서 블록 = R-P5b 통과본 **md5 동일** → R-P5b 재시험 불필요
2. 별칭 `otlp_http`·`resource_detection`이 0.159.0에서 유효(실 구동 로그에 deprecation 경고 0)
3. 저장 파이프라인(traces·metrics·logs·metrics/self)·tail 샘플링·프로세서 순서 불변, 런타임 마스킹 회귀까지 존재
4. 카나리아 11종이 정본 목록과 순서까지 1:1, 원문 미기록(패키지 내 로그 문장 0건), 수신 집계 불변
5. Y1 degraded 3종이 **실제 상황**에서 `reason`+`clientKeepRatio`까지 단언(모킹 우회 없음)
6. Y2 90 B가 정본과 일치, 표본 선택이 단조(축소해도 부분집합)
7. V59가 V38 공통 규칙·멱등 DDL·번호 충돌 없음, dev DB 미적용 전제 확인
8. "결측 ≠ 0"이 DTO·주석·V59·API 설명 4곳에 일관되게 기록되고 회귀로 강제됨
9. 변이 3/3 검출, 원복 md5 완전 일치, `git diff --check` 깨끗, worktree 잔여물 0

---

## 14. 수정 라운드 항목 (권고 순서)

1. **R1** `recentTracker.record(...)` 제거 + 회귀 1건 — *검증 버튼이 거짓 초록을 띄운다*
2. **R3** `series()` SQL에서 라이브 exporter 제외 + 회귀 1건 — *기존 화면 오독*
3. **R2** k8s 하드코딩 문자열 수정 + 전역 replace 삭제 + 회귀 1건 — *조용한 0*
4. **Y-d** 라이브 블록 골든(md5) 회귀 추가 — *다음 사람이 R-P5b를 우회하지 못하게*
5. **Y-b** snapshot 재시작 횟수 상한 + 누적 바이트 회귀
6. Y-c · Y-e · Y-l · Y-m · Y-o (경량)

## 15. 정본 반영 항목

| # | 위치 | 내용 |
|---|---|---|
| ① | §3.2 (SSE 병합 규칙 2) | **snapshot 축소·재시작 계약 신설** — 새 `snapshot.begin` 도착 시 직전 미완 snapshot 버퍼를 폐기하고 새 `snapshotId`로 다시 모은다. `end` 없이 끝난 snapshotId는 확정하지 않는다. 선행 신호는 `control{degraded, reason:"frame_limit"}` |
| ② | §2.2 ⓑ | 알람 `failed to eval condition{pipeline=traces/live} == 0`의 **판정 불가 구간 명시** — 로그가 조용하면 수치가 결측이라 "정상 0"으로 읽을 수 없다. 결측을 별도 축으로 표시하거나 하트비트 도입 |
| ③ | §2.2 yaml · §7.1 | exporter 컴포넌트 표기를 **`otlp_http/moveseye-live`로 통일**(0.159.0 정식 명칭). BE 대조는 구 별칭도 받는다는 점을 함께 기재 |
| ④ | §7.1 6단계 행 | "R-P5b 통과본과 문장 동일"을 **골든 해시 회귀로 강제**한다고 명시(조건 개수 단언은 불충분) |
| ⑤ | §3.3 / 수집기 탭 계약 | 라이브 exporter의 `send_failed`는 **기존 수집기 전송 실패 지표와 합산하지 않는다**(R3) |
