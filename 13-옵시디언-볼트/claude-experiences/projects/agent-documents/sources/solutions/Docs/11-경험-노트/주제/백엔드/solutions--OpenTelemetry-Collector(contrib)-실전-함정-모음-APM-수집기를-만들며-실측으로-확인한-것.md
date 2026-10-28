---
type: topic
tags: [topic, backend, opentelemetry, otel-collector, otlp, observability, lesson]
created: 2026-09-28
updated: 2026-09-28
---

# OpenTelemetry Collector(contrib) 실전 함정 모음 — APM 수집기를 만들며 실측으로 확인한 것

moveseye APM(2026-08-31~09-28, `otelcol-contrib 0.159.0` + `opentelemetry-javaagent 2.31.1`)에서 문서에 없거나 문서와 다르게 동작해 시간을 잃은 것들. 전부 실측 근거가 있다.

## 수신 측(BE가 OTLP를 받을 때)

- 🔴 **Collector는 500을 즉시 폐기한다.** 재시도 대상은 429·502·503·504만. 적재 실패는 **503**으로 답해야 데이터가 산다. "적재 실패=500" 주석은 틀렸다. → [[projects/moveseye/2026-08-31-apm-p1-implementation|2026-08-31-apm-p1-implementation]]
- 🔴 **`partialSuccess`는 성공으로 취급된다**(재전송 없음) — 부분 거절은 수량 보존식(N=A+D+R)으로 응답 안에 적어야 한다.
- 🔴 인증 경로 실수는 **영구 손실**: 401은 `Permanent error`로 분류돼 재시도하지 않는다(`/apm/otlp-live/**`를 permitAll에서 빠뜨렸던 사례).
- 429는 폐기가 아니라 지연이지만 exporter의 **재시도 예산(`max_elapsed_time`, 기본 5분·우리 30분)**을 소모한다. `max_elapsed_time: 0`(무한)은 독 배치가 소비자를 영구 점유하므로 금지.
- exemplar `filteredAttributes`에 **원문 SQL·url.path·IP**가 실린다 → BE에서 폐기. delta 선호를 켜도 UpDownCounter는 CUMULATIVE → 포인트 단위 temporality 판정. CUMULATIVE 극값은 차분 불가.
- 배치 UPSERT 적재는 동시 요청이 같은 행을 반대 순서로 잠가 교착 → [[topics/backend/concurrent-upsert-lock-order|concurrent-upsert-lock-order]].

## 프로세서·OTTL

- 🔴 **`redaction/pii`의 `blocked_values` 숫자 패턴(`\b(?:\d[ -]*?){13,16}\b`, 카드번호용)이 로그 본문의 13자리 epoch ms를 가려 JSON을 깨뜨린다.** 증상은 "부하 중에만 목록이 안 들어옴"(빈 `[]`은 통과). 로그 본문에 JSON을 실어 보내는 기능은 전부 같은 함정 — **13자리 이상 숫자 연속 금지**, BE 파서는 실패를 로그로 남길 것. → [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]]
- 🔴 `attributes/keep_keys`는 **키만** 거른다 — 값 안의 PII는 `redaction` + OTTL 문장이 따로 필요하다.
- 🔴 `ottl.set.allowNil` feature gate는 **yaml이 아니라 실행 명령**(`--feature-gates=ottl.set.allowNil`)이다. 미설정이면 `set(nil)`이 조용히 무시돼 PII가 남고 전송량이 47% 늘었다. 설치 가이드·서비스 정의(systemd·plist·New-Service)에 넣어야 한다.
- 🔴 `error_mode: propagate`면 OTTL 실패 → 503 → SDK 재전송 → **저장 경로 300% 중복**. `ignore`로 바꾸면 실패가 exporter 카운터에 안 잡힌다 — 실제 신호는 WARN `failed to execute statement`/`failed to eval condition`/gate 1회 WARN **로그**뿐. → 로그 계수 + BE 후조건 카나리아 + **전송 전 차단(`filter`)** 세 겹.
- 🔴 `filter` 조건에 자기 서비스 제외(`service.name == "moveseye-be"`)를 두면 셀프 모니터링의 유일한 대상이 사라진다.
- 기본 제외 + 추가 없음 = 프로세서를 **통째로 제거**해야 한다. 빈 `include`는 모든 지표를 폐기한다.
- `tail_sampling`은 **어느 정책이 통과시켰는지 안 적는다** → 저장값 이름에 한계를 박는다(`SLOW_INFERRED`). 실시간 전량 뷰가 필요하면 `tail_sampling` **앞**에서 파이프라인을 분기한다.
- Collector 0.159는 `telemetry.metrics.address` 제거 → `readers` 형식.

## 에이전트·SDK

- Java `http.server.active_requests`는 **실험 지표**라 기본으로 안 나온다 — `OTEL_INSTRUMENTATION_HTTP_SERVER_EMIT_EXPERIMENTAL_TELEMETRY=true`. 화면에 카드를 두면 가이드에도 켜는 옵션을 넣어야 한다. → [[projects/moveseye/2026-09-16-apm-observability-backlogs|2026-09-16-apm-observability-backlogs]]
- Python은 구 semconv(`http.server.duration`)가 기본 → `OTEL_SEMCONV_STABILITY_OPT_IN=http` 필수. Node·Python 런타임 메트릭은 별도 패키지.
- 자바 에이전트가 `db.client.connection.wait_time`을 **초 단위 + SDK 기본 ms 격자**로 보내 재버킷이 한 칸을 12칸에 균등 분배(분포 날조). 히스토그램은 **소스보다 촘촘한 격자로 접지 말고** `(bounds, family)` UNIQUE로 격자 분할을 막는다.
- 지연은 "초 단위"가 안 된다 — 에이전트 export 기본 60초(권고 10초) + BSP → 25~35초. 문구는 '실시간(약 30초 이내)'. 저트래픽에서 BSP 1000ms는 필수(p95 5.7초).
- `-javaagent`를 `JAVA_TOOL_OPTIONS`로 달면 Gradle 데몬까지 계측돼 `unknown_service` 유령 서비스가 생긴다 — bootRun JVM 인자로만.
- 에이전트 서비스 이름이 바뀌면 **새 서비스로 등록**되고 원래 서비스는 STALE — "수집 끊김"으로 오진하기 쉽다. 수집 진단은 에이전트→Collector→BE→서비스 등록 4단계로 나눈다.

## 운영·설정 파일

- 🔴 `config.yaml`을 PowerShell `Get-Content`로 읽고 다시 쓸 때 `-Encoding UTF8`을 빠뜨리면 cp949로 읽어 깨진다. YAML "control characters are not allowed"의 실체는 **U+0080(C1) 문자**였다 — `b<32`만 스캔하면 0건. 깨진 글자가 주석 안이면 주석만 걷어 토큰 재발급 없이 살릴 수 있다(`otelcol-contrib validate`).
- 생성한 yaml은 `validate`로 확인하고, 프로세서 목록은 **골든 파일 + MD5**로 회귀를 고정한다(조건 완화·`summary` 변경·keep_keys 변경까지 검출).
- 큐 크기 단위: `sizer: bytes`는 논리 크기≠디스크·신호별 ×3·int 오버플로(`2048×2^20`) — **요청 수** 기준 유지. → [[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]]

## 검증 절차

- 화면 판정은 export 주기 때문에 **8~10초 대기**(4초면 빈 표 오진).
- 부하 루프 curl에 `-c`(쿠키 저장) 금지 — 응답 쿠키가 세션을 덮어 401. 로그인만 `-c`, 나머지 `-b`.
- Collector 로그 샘플링 때문에 로그 계수는 **손실 수가 아니다**(90초 무관측은 null).

관련: [[projects/moveseye/2026-08-26-apm-design|2026-08-26-apm-design]] · [[projects/moveseye/2026-08-31-apm-p1-implementation|2026-08-31-apm-p1-implementation]] · [[projects/moveseye/2026-09-02-apm-p2-traces|2026-09-02-apm-p2-traces]] · [[projects/moveseye/2026-09-23-apm-p5-realtime|2026-09-23-apm-p5-realtime]] · [[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]] · [[topics/backend/concurrent-upsert-lock-order|concurrent-upsert-lock-order]]
