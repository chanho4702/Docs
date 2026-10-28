# APM R1 실측 픽스처 (2026-08-31)

🔴 **손으로 만든 것이 아니다.** `otelcol-contrib 0.159.0` → BE 수신 경로에서 그대로 캡처한 페이로드다.
그래서 `OtlpMetricsReaderTest`의 기대값은 "스펙이 이럴 것이다"가 아니라 **"실제로 이렇게 온다"**이고,
값이 어긋나면 우리 코드가 아니라 **에이전트·수집기 버전이 바뀐 것**을 먼저 의심해야 한다.

- 수집기 `otelcol-contrib 0.159.0`, exporter `otlphttp` `encoding: json` + `compression: gzip`(해제 후 저장)
- 계측 `opentelemetry-javaagent 2.31.1`, 대상 = `moveseye-be-spring` 자기 자신(:3001, dev 프로필)
- 판독 정본: `_workspace/verification/r1_apm-collector-roundtrip.md`
- 원본 전량(151파일): `_workspace/_archive/data/apm-r1-fixtures/`

| 파일 | 원본 | 무엇을 고정하나 |
|---|---|---|
| `metrics-round1-explicit.json` | `round1-explicit/metrics-0020.json` | explicit histogram · CUMULATIVE · 정규 경계 14단 · exemplar(traceId·spanId + 🔴 원문이 실린 `filteredAttributes`) · http 라우트 10종 |
| `metrics-round2-exponential.json` | `round2-exponential-delta/metrics-0038.json` | exponential histogram · DELTA · scale 7/offset -730/144버킷 · 🔴 같은 배치의 `jvm.memory.used`는 CUMULATIVE(포인트 단위 판정의 근거) |
| `metrics-otelcol-self.json` | `round1-explicit/metrics-0013.json` | Collector 자기 메트릭이 **별도 resource**(`service.name=otelcol-contrib`)로 온다 · 이름 접두 `otelcol_`/`otelcol.` 두 벌 |
| `traces-round1.json` | `round1-explicit/traces-0006.json` | `exception` 이벤트(스택트레이스 전문)가 실린 스팬 · 루트에는 `parentSpanId` 필드 자체가 없다 |
| `logs-round1.json` | `round1-explicit/logs-0002.json` | 로그에 `traceId`·`spanId`가 붙어 온다(M3 로그 상관의 근거) |

⚠️ `traces-*`·`logs-*`는 **아직 읽는 코드가 없다**(M2·M3). 스키마·파서를 짤 때 형식을 확인할 근거로 미리 넣어 둔 것이다.

⚠️ AI 계정 모니터링 픽스처(`src/test/resources/aimonitor/`)와 **섞지 않는다** — 저쪽은 미실측 합성이고 어휘도 다르다.
