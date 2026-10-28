# MovesEye APM — Collector 설정 파일(config.yaml) 한 줄씩 설명

> 작성 2026-09-15 · 대상: 수집기 › 토큰·설정 탭에서 내려받은 `config.yaml`을 처음 여는 사람
> 기준 템플릿: BE `src/main/resources/apm/collector-template.yaml`(otelcol-contrib 0.159.0 검증본)
> 관련: [수집기 메뉴 설명](apm-handbook/solutions--05-menus-and-tabs.md) 4.5.3절 · [운영 절차](apm-handbook/solutions--12-operations.md) 7.1절

## 0. 한눈에

이 파일은 고객 서버에 설치되는 **OpenTelemetry Collector("집하장")의 업무 지침서**다. 앱 언어(Java·.NET·Node·Python)와 무관하게 같은 파일을 쓴다.

구조는 다섯 덩어리다.

| 덩어리 | 역할 | 비유 |
|---|---|---|
| `receivers` | 어디로 데이터가 들어오나 | 접수창구 |
| `processors` | 보내기 전에 어떻게 손보나 | 검수·포장 |
| `exporters` | 어디로 보내나 | 발송 |
| `extensions` | 파이프라인 밖의 보조 장치 | 창고·상태등 |
| `service` | 위 부품을 실제로 연결하는 배선 | 작업 지시서 |

발급 창에서 고른 값 다섯 개가 이 파일 안에 이렇게 박힌다.

| 발급 창 항목 | yaml 위치 | 이 예시의 값 |
|---|---|---|
| MovesEye 주소 | `exporters.otlphttp/moveseye.endpoint` | `http://localhost:3000/apm/otlp` |
| 느린 요청 임계(ms) | `tail_sampling.policies[slow].threshold_ms` | 2000 |
| 정상 트레이스 표본(%) | `tail_sampling.policies[normal].sampling_percentage` | 2 |
| 메모리 상한(MiB) | `memory_limiter.limit_mib` | 512 |
| 디스크 큐 경로 | `extensions.file_storage.directory` | `C:\ProgramData\moveseye\otelcol-queue` |
| 원문 SQL 보존 | `transform/sql` 프로세서 **유무** | 보존(프로세서 없음) ⚠️ |

---

## 1. 머리말 주석

```yaml
# ── MovesEye가 생성한 설정입니다 (2026-09-15 09:27) ─────
# 🔴 이 파일에는 수신 토큰 원문이 들어 있습니다. 파일 권한을 600(Windows는 관리자 전용)으로 두고, 형상관리에 올리지 마세요.
# ⚠️ 원문 SQL 보존(keepRawSql)을 켜서 db.query.text 리터럴 마스킹 프로세서가 빠져 있습니다.
# ℹ️ 게이트웨이 Collector는 1대만 두세요 — 두 대 이상이면 tail 샘플링이 무의미해집니다.
```

- **토큰 원문이 들어 있다**: 서버는 해시만 갖고 있어 이 파일을 잃으면 다시 못 받는다. 읽기 권한을 제한하고 git에 올리지 않는다.
- **원문 SQL 보존 경고**: 발급 때 "보존"을 골랐다는 뜻. 아래 §3의 `transform/sql`이 빠져 있다. 로컬 시험이 아니면 "마스킹"으로 다시 발급하는 것이 맞다.
- **Collector 1대**: 한 트레이스의 모든 스팬이 같은 Collector에 와야 샘플링 판정이 된다. 두 대가 같은 토큰으로 보내면 수집기 지표도 서로 덮어쓴다.

그 아래 템플릿 주석(`${MOVESEYE_ENDPOINT}` 등)은 **원래 자리표시 이름을 설명**하는 것이다. 서버는 설정 줄만 치환하고 주석은 그대로 두므로, 어느 값이 어디서 왔는지 이 주석으로 역추적할 수 있다.

---

## 2. receivers — 어디로 들어오나

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
```

- 고객 앱의 OTel 에이전트가 데이터를 보내는 **두 개의 문**. gRPC(4317)와 HTTP(4318) 둘 다 연다.
- 앱 쪽 환경변수 `OTEL_EXPORTER_OTLP_ENDPOINT=http://<Collector 서버>:4317`이 여기를 가리킨다.
- `0.0.0.0` = 어느 네트워크 인터페이스로 오든 받는다. 같은 서버의 앱만 받을 거면 `127.0.0.1`로 좁혀도 된다.

```yaml
  prometheus/self:
    config:
      scrape_configs:
        - job_name: otelcol
          scrape_interval: 30s
          static_configs:
            - targets: ['127.0.0.1:8888']
```

- Collector가 **자기 자신의 상태**(큐 적체·전송 실패 횟수·버전)를 30초마다 자기 8888 포트에서 읽어 온다.
- 이 값이 MovesEye로 올라가 화면 **수집기 › 상태 탭**의 표와 차트가 된다. 8888은 §6 `service.telemetry`가 여는 포트다.

---

## 3. processors — 보내기 전에 손보는 단계

파이프라인(§6)에 적힌 **순서대로** 지나간다. 정의된 순서가 아니라 파이프라인의 순서가 실행 순서다.

### memory_limiter

```yaml
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
```

- 1초마다 메모리를 재서 512MiB를 넘으려 하면 **받기를 잠시 거부**한다. 트래픽 폭주 때 Collector가 고객 서버 메모리를 다 먹는 것을 막는 안전장치.
- 발급 창 "메모리 상한"이 이 숫자. 항상 파이프라인 맨 앞에 둔다.

### resourcedetection

```yaml
  resourcedetection: { detectors: [env, system] }
```

- 이 서버의 호스트명·OS 같은 정보를 데이터에 덧붙인다(`host.name`).
- 화면에서 APM 인스턴스 ↔ Zabbix 서버 모니터링을 **링크로 연결**하는 근거. Zabbix 호스트명과 정확히 같을 때만 자동으로 걸린다.

### attributes/drop — 개인정보가 될 수 있는 키 삭제

```yaml
  attributes/drop:
    actions:
      - { key: url.full, action: delete }                 # 쿼리스트링 포함 원시 URL
      - { key: url.query, action: delete }
      - { key: user_agent.original, action: delete }
      - { key: client.address, action: delete }
      - { key: network.peer.address, action: delete }
      - { pattern: '^http\.(request|response)\.header\..*', action: delete }   # 헤더 전부
      - { key: enduser.id, action: hash }
```

| 지우는 것 | 이유 |
|---|---|
| `url.full`, `url.query` | 쿼리스트링에 검색어·토큰·개인정보가 실린다. 경로(`url.path`)는 남아서 엔드포인트 통계는 된다 |
| `user_agent.original` | 브라우저 지문 |
| `client.address`, `network.peer.address` | 클라이언트 IP |
| `http.request.header.*`, `http.response.header.*` | 쿠키·인증 헤더 |
| `enduser.id` → **hash** | 지우지 않고 해시. "같은 사용자인지"는 알되 누구인지는 모르게 |

### redaction/pii — 값 안의 패턴 가리기

```yaml
  redaction/pii:
    allow_all_keys: true
    blocked_values:
      - '\b\d{6}-\d{7}\b'              # 주민번호 형태
      - '\b(?:\d[ -]*?){13,16}\b'      # 카드번호 13~16자리
      - '[\w.+-]+@[\w-]+\.[\w.]+'      # 이메일
```

- 위 `attributes/drop`이 **키 단위** 삭제라면, 이건 **어떤 키든 값 안에** 이 패턴이 있으면 가린다.
- `allow_all_keys: true` = 키를 골라 막는 게 아니라 값만 검사한다.

### (이 파일에는 없음) transform/sql — SQL 리터럴 마스킹

정상 발급본에는 아래 블록이 있고 `traces` 파이프라인의 `redaction/pii`와 `tail_sampling` 사이에 들어간다.

```yaml
  transform/sql:
    trace_statements:
      - context: span
        statements:
          - replace_pattern(attributes["db.query.text"], "'[^']*'", "?")   # '홍길동' → ?
          - replace_pattern(attributes["db.query.text"], "\\b\\d+\\b", "?") # 123 → ?
          - truncate_all(attributes, 4096)                                  # 스택·SQL 길이 상한
```

- 쿼리 문장의 **값**만 `?`로 바꿔 구조는 남기고 데이터는 지운다. `WHERE name = '홍길동'` → `WHERE name = ?`.
- 발급 창에서 "원문 SQL 보존"을 고르면 이 블록이 **통째로 빠진다**(약하게 되는 게 아니라 제거). 그러면 쿼리 값의 개인정보가 그대로 저장되고, 누가 켰는지 감사 로그에 남는다.
- ⚠️ 이 예시 파일은 그 상태다. 운영용이면 "마스킹"으로 재발급할 것.

### filter/metrics — 지표 허용목록

```yaml
  filter/metrics:
    metrics:
      include:
        match_type: regexp
        metric_names:
          - 'http\.server\..*'   # 서버 요청수·응답시간·오류
          - 'http\.client\..*'   # 외부 호출
          - 'rpc\..*'            # gRPC
          - 'jvm\..*'            # 힙·GC·스레드
          - 'k8s\..*'            # 쿠버네티스
          - 'db\.client\..*'     # 커넥션 풀
          - 'process\..*'        # CPU·메모리
          - 'messaging\..*'      # 큐·카프카
```

- 이름이 목록에 맞는 지표만 통과, 나머지는 버린다. 저장량 통제가 목적.
- BE에도 같은 허용목록이 한 번 더 있다(이중 방어). 여기서 통과해도 BE가 거부하면 수집기 탭 폐기 통계에 사유가 잡힌다.

### filter/self

```yaml
  filter/self:
    metrics:
      include:
        match_type: regexp
        metric_names: [ '^otelcol[._].*' ]
```

- §2 `prometheus/self`가 읽어 온 것 중 `otelcol.`로 시작하는 것만 남긴다. `up`·`scrape_duration` 같은 스크레이프 잡음 제거.

### tail_sampling — 어떤 트레이스를 남길까

```yaml
  tail_sampling:
    decision_wait: 10s
    num_traces: 50000
    policies:
      - { name: errors,  type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: slow,    type: latency,     latency: { threshold_ms: 2000 } }
      - { name: normal,  type: probabilistic, probabilistic: { sampling_percentage: 2 } }
```

- 트레이스는 전부 저장하면 너무 많다. **다 본 뒤에**("tail") 남길지 정한다. 그래서 첫 스팬이 오고 10초(`decision_wait`)를 기다렸다가 판정한다.
- 세 정책 중 **하나라도** 맞으면 보관.

| 정책 | 뜻 | 발급 창 항목 |
|---|---|---|
| `errors` | 오류 상태인 요청은 **100%** | 고정 |
| `slow` | 2000ms 넘긴 요청은 **100%** | 느린 요청 임계(ms) |
| `normal` | 나머지 정상 요청은 **2%**만 | 정상 트레이스 표본(%) |

- `num_traces: 50000` = 판정 대기 중인 트레이스를 최대 5만 개까지 메모리에 들고 있는다.
- 🔴 한 트레이스의 스팬이 여러 Collector로 흩어지면 판정이 안 된다. Collector가 1대여야 하는 이유.

### batch

```yaml
  batch: { timeout: 5s, send_batch_size: 512, send_batch_max_size: 1024 }
```

- 낱개로 보내지 않고 **5초마다 또는 512건이 차면** 한 번에 보낸다. 최대 1024건. BE 요청 수를 줄이는 용도라 항상 파이프라인 맨 뒤.

---

## 4. exporters — 어디로 보내나

```yaml
exporters:
  otlphttp/moveseye:
    endpoint: "http://localhost:3000/apm/otlp"
    encoding: json
    compression: gzip
    headers: { Authorization: "Bearer <발급 시 1회 표시된 토큰 원문>" }
    sending_queue: { enabled: true, storage: file_storage, queue_size: 5000 }
    retry_on_failure: { enabled: true, max_elapsed_time: 30m }
```

| 줄 | 뜻 |
|---|---|
| `endpoint` | 발급 창 "MovesEye 주소"에 서버가 `/apm/otlp`를 붙인 값. 실제 요청은 여기에 `/v1/metrics`·`/v1/traces`·`/v1/logs`가 **또 붙는다**(exporter가 스스로). 그래서 주소에 `/v1/metrics`를 적으면 안 된다 |
| `encoding: json` | OTLP 기본은 protobuf인데 MovesEye BE는 **JSON만** 읽는다. 바꾸면 전량 거부 |
| `compression: gzip` | 본문 압축. 프록시가 앞에 있으면 압축 본문 크기 제한(413) 주의 |
| `headers.Authorization` | 수신 토큰. BE가 이걸로 어느 수집기인지 판별. 틀리면 401 |
| `sending_queue` | 보내기 대기열을 메모리가 아니라 **디스크**(`file_storage`, §5)에 둔다. BE가 잠깐 죽어도 최대 5000배치까지 보관 후 재전송 |
| `retry_on_failure` | 네트워크 오류·429·5xx는 **30분까지** 재시도 |

🔴 **재시도하지 않는 것**: 401(토큰 틀림)·403(권한 없음·라이선스 만료)·413(본문 너무 큼)은 즉시 폐기. 토큰 오타나 라이선스 만료는 "데이터가 조용히 사라지는" 상태로만 보인다. 상태 탭 "최근 60초 수신"이 0건이면 먼저 이 셋을 의심한다.

---

## 5. extensions — 파이프라인 밖의 보조 장치

```yaml
extensions:
  file_storage:
    directory: "C:\\ProgramData\\moveseye\\otelcol-queue"
    create_directory: true
    timeout: 1s
    compaction: { on_start: true, directory: "C:\\ProgramData\\moveseye\\otelcol-queue", max_transaction_size: 65536 }
  health_check: { endpoint: 127.0.0.1:13133 }
```

- `file_storage`: §4 `sending_queue`가 실제로 파일을 쓰는 폴더. 발급 창 "디스크 큐 경로"가 이 값.
  - `create_directory: true` = 없으면 만든다. 단 **권한은 설치 가이드의 `icacls` 단계가 잠근다**(마스킹 후 데이터지만 텔레메트리 원문이므로 SYSTEM·관리자만).
  - `compaction.on_start` = 시작할 때 큐 파일을 정리해 크기를 줄인다.
  - 🔴 이 경로는 설치 가이드가 "권한을 잠그세요"라고 안내하는 경로와 **같아야** 한다. 화면이 보여 준 값을 그대로 싣는 이유.
- `health_check`: `http://127.0.0.1:13133`을 열면 살아 있는지 답한다. 서비스 감시·로드밸런서 헬스체크용.

---

## 6. service — 부품을 실제로 연결

```yaml
service:
  extensions: [file_storage, health_check]
  telemetry:
    metrics:
      level: normal
      readers:
        - pull:
            exporter:
              prometheus: { host: 127.0.0.1, port: 8888 }
```

- `extensions`: §5의 두 보조 장치를 켠다. 여기 안 적으면 정의만 있고 동작하지 않는다.
- `telemetry.metrics`: Collector 자기 상태 지표를 8888 포트로 노출. §2 `prometheus/self`가 30초마다 이걸 읽는다. `127.0.0.1`이라 외부에서는 안 보인다.

```yaml
  pipelines:
    metrics:      { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, filter/metrics, batch], exporters: [otlphttp/moveseye] }
    metrics/self: { receivers: [prometheus/self], processors: [memory_limiter, filter/self, batch],                                      exporters: [otlphttp/moveseye] }
    traces:       { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, tail_sampling, batch], exporters: [otlphttp/moveseye] }
    logs:         { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, batch], exporters: [otlphttp/moveseye] }
```

네 줄이 실제 배선이다. 각 줄 = "받기 → 프로세서 **순서** → 보내기".

| 파이프라인 | 무엇 | 지나는 순서 |
|---|---|---|
| `metrics` | 앱 지표(요청수·응답시간·JVM·풀) | 메모리 제한 → 호스트명 → 개인정보 키 삭제 → 허용목록 → 묶기 |
| `metrics/self` | Collector 자기 상태 | 메모리 제한 → otelcol만 → 묶기 |
| `traces` | 트레이스 | 메모리 제한 → 호스트명 → 개인정보 키 삭제 → 값 패턴 가림 → **(정상 발급본은 여기 `transform/sql`)** → 샘플링 → 묶기 |
| `logs` | 로그 | 메모리 제한 → 호스트명 → 개인정보 키 삭제 → 값 패턴 가림 → 묶기 |

- `logs`는 받아서 보내긴 하지만 **BE가 현재 로그를 저장하지 않는다**. 수집기 탭 폐기 통계에 `SIGNAL_NOT_SUPPORTED`로 잡히는 것이 정상.
- 프로세서를 정의만 하고 파이프라인에 안 적으면 동작하지 않고, 파이프라인에 적었는데 정의가 없으면 Collector가 **기동을 거부**한다.

---

## 7. 손대도 되는 것 / 안 되는 것

| 손대도 됨 | 이유 |
|---|---|
| `otlp` 수신 주소를 `127.0.0.1`로 | 같은 서버 앱만 받을 때 노출면 축소 |
| `threshold_ms`·`sampling_percentage`·`limit_mib` | 발급 창 값과 같은 것. 단 다음 재발급 때 화면 값으로 돌아간다 |
| `attributes/drop`·`redaction/pii`에 항목 **추가** | 더 가리는 방향은 안전 |

| 손대면 안 됨 | 결과 |
|---|---|
| `encoding: json` 제거·변경 | BE가 전량 거부 |
| `endpoint`에 `/v1/metrics` 추가 | 경로가 두 번 붙어 404 |
| `filter/metrics` 목록 확장 | Collector는 통과시켜도 BE 허용목록이 거부 → 폐기 통계만 는다 |
| 프로세서를 파이프라인에서만 빼거나 정의만 지움 | 기동 실패 |
| `file_storage.directory`를 가이드와 다른 곳으로 | 권한 잠근 곳과 데이터 쌓이는 곳이 갈린다 |
| 같은 토큰으로 Collector 2대 | 수집기 지표 덮어쓰기·샘플링 무의미 |

## 8. 확인 순서 (설치 후)

1. `Get-Service otelcol` → Running
2. `http://127.0.0.1:13133` 열림
3. 화면 수집기 › 상태 탭 "최근 60초 수신" → 배치 수 > 0
4. 0건이면: Collector 로그에서 연결 거부(주소)·401(토큰)·403(라이선스/권한)·413(크기) 중 무엇인지 확인

---

**더 보기**: 템플릿 정본 `moveseye-be-spring/src/main/resources/apm/collector-template.yaml` · 생성기 `premium/apm/collector/config/ApmCollectorConfigGenerator.java` · 데이터 경로 그림 [06-data-path.md](apm-handbook/solutions--06-data-path.md) · OTel 공식 Collector 설정 문서 https://opentelemetry.io/docs/collector/configuration/ · tail_sampling https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor · file_storage https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/storage/filestorage
