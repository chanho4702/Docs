# APM R1 실측 픽스처 (2026-08-31)

OTel Collector → BE 수신 경로의 **실 페이로드**. 파서·스키마의 정본 근거(설계서 `devdesign_apm.md` §3.2 R1, WBS 0.1).

- 수집기: `otelcol-contrib` **0.159.0** (windows_amd64, `C:\solutions\_tools\otel\`), exporter `otlphttp` `encoding: json` + `compression: gzip`
- 계측: `opentelemetry-javaagent` **2.31.1**, 대상 = `moveseye-be-spring` 자기 자신(:3001, dev 프로필)
- 캡처: scratchpad `r1/capture.py` (gzip 해제 후 원문 저장). 파일명 `{signal}-{seq}.json`

| 라운드 | 에이전트 설정 | 내용 |
|---|---|---|
| `round1-explicit/` | 기본(explicit bucket histogram, CUMULATIVE) + `OTEL_INSTRUMENTATION_HTTP_*_EMIT_EXPERIMENTAL_TELEMETRY=true` + `OTEL_SEMCONV_STABILITY_OPT_IN=database` | metrics 11(자바 에이전트 + otelcol 자기 메트릭), traces 11, logs 다수 |
| `round2-exponential-delta/` | `..._DEFAULT_HISTOGRAM_AGGREGATION=base2_exponential_bucket_histogram` + `..._TEMPORALITY_PREFERENCE=delta` + experimental off | exponential 히스토그램·DELTA·active_requests 유무 확인용 |

판독 결과는 `_workspace/features/apm/core/r1_apm-collector-roundtrip.md`.
