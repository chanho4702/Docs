# APM(애플리케이션 모니터링) — 설계서 v3.1 (OpenTelemetry 확정 · 주력 기능 범위 · 코덱스 검수 반영)

- 작성: 2026-08-26 (v1 초안 → v2 OTel 확정 → v3 범위 확대 → v3.1 검수 반영, 같은 날)
- 상태: 🟢 **v3.2 — 2026-08-31 구현 착수(P1 WS-0부터). R1·R11·R12(Java) 실측 반영.** (이전) v3.1 — 제품 주력 기능으로 확정(사용자 결정), 개발은 후일 착수. 코덱스 검수(`./review_apm-design.md`) 🔴 13건·🟡 10건 반영 완료(반영 표는 검수 파일 하단). §11 미결 Q 확정 후 구현 착수본으로 갱신.**
- 동반 문서: **`devdesign_apm-screens-wbs.md`** — 확대 범위(§1)·메뉴 13개·차트 프리미티브 18종 구현 가능성(§2)·메뉴별 차트 명세(§3)·WBS 80여 태스크(§4). 아키텍처·파이프라인·저장은 본 문서, 화면·작업은 동반 문서가 정본.
- 대상: `moveseye-be-spring`(수신·저장·API) + `moveseyee_fe`(화면) + **배포 산출물(Collector 설정 템플릿)**. `moveseye-ai`는 §8.4만.
- 관련: `devdesign_premium-edition.md` §7.4(APM 범위 밖 → 본 문서), `devdesign_ai-account-monitoring.md` §5(OTLP http/json 수신기 — 재사용), `devdesign_agent-install-guide.md`(설치 가이드 화면 패턴), `audit_architecture-onprem-scaleout.md`(설치형 제약), `moveseye-docs/guides/pages/모니터링/준비-중인-모니터링.md`(고객 안내 — §1.2 정정)

| 버전 | 변경 | 사유 |
|---|---|---|
| **v3.3** | **R3(볼륨·롤업·질의) 실측 반영**(2026-09-01, `./r3_apm-volume.md`): §4.4 용량 어림을 **행당 150B → 686B**로 확정(인덱스가 절반, 1m PK 하나가 41%) · 1m 7일 **67 GB**·3단 **109 GB** · 5m/1h 어림의 인스턴스 축 3배 과다 정정 · **PG 기본 설정이 질의 플랜을 좌우한다**는 항목 신설 · §4.6 승격 조건을 **용량(20M/35M행·일) + 화면(cold p50 3초) + 롤업(정상 1회 60초)** 3축으로 재작성하고 승격 전 조치 표(Q1·R1·Q2·Q3·O1 완료 / S1·S2 보류) 편입. 구현: `pct24h` 5m+1m 하이브리드 · 롤업 `maxBuckets` 288→60 · 롤업 진단 1문장화 · 설치 가이드 `notices`에 `postgres-tuning`·`capacity-planning` | R3 실측 + 후속 조치 |
| v1 | 3마일스톤(M1 Zabbix 래핑 → M2 OTel 메트릭 → M3 트레이스), 미결 Q1~Q10 | 초안 |
| **v2** | **수집 경로를 OpenTelemetry 단일로 확정.** Zabbix 래핑 M1 삭제(§9 유예로 이동), OTel Collector를 1급 구성요소로 승격, 마일스톤 재편(M1 메트릭·M2 트레이스·M3 로그 상관), Q3(protobuf) 소멸, 서비스 자동 등록 도입. §13 시장 체크리스트 대조(알림 배달 갭 → `history.push`) | 사용자 결정 "수집기는 오픈텔레메트리 쓸거야" + 체크리스트 검토 요청 |
| **v3** | **주력 기능 범위로 확대**: 에러 그룹·DB 쿼리 그룹·외부 호출·메시징/배치·SLO·배포·합성 감시 편입·RUM·K8s·리포트·AI 툴 → 메뉴 13개, Phase 1~4(동반 문서). §14 **핵심 지표 6종 커버리지** 신설. 마일스톤 M1~M3 → Phase P1~P4로 재표기 | 사용자 결정 "주력으로 갈 거니까 범위 확대", 핵심 지표 6종 필수 |
| **v3.2** | **R1·R11·R12(Java) 실측 반영**(2026-08-31, `./r1_apm-collector-roundtrip.md`): 버전 고정 `otelcol-contrib 0.159.0`·`javaagent 2.31.1` · json 세 경로 round-trip 성립 · §3.2 yaml `telemetry.metrics.readers` 형식 · §4.1 **BE 응답 계약 확정(500 금지·503 재시도·401/403/413 즉시 폐기)** · §4.3 정규 경계를 Java 기본과 일치하는 **패밀리 4종**으로, exemplar `filteredAttributes` 폐기, temporality **포인트 단위** 판정, `active_requests` Java ✅ · Flyway 번호 **V38**(V36·V37은 자산에 쓰임) · 패키지 `premium/apm` + 공용 `otel/` | 실측 |
| **v3.1** | **코덱스 검수 반영**: 서비스 식별 `(service_name, env)`+불변 UUID+등록 모드(§2.1) · DOWN 판정 재정의(§2.2) · Collector yaml에 자기 메트릭 scrape·마스킹(transform/redaction)·file_storage 정책 추가(§3.2) · 토큰 1회 노출·설정 생성 POST·403은 영구 실패(§4.1) · 용량 산식에 인스턴스 축·정규 히스토그램 경계·`dims` 정규화 규칙(§4.4) · Zabbix 트리거 키=UUID·소유 태그·드리프트(§4.5) · 데이터 모델 통합 정본(§7) · API 표 P1~P4 전체(§8.1) · RUM 보안(§15) · §1.4 engine-api 문구 정정 · §13·§14 표현 정정 | `review_apm-design.md` 🔴 13·🟡 10 |

---

## 0. 한눈에 보기

**한 줄 요약**: 고객 앱에 OpenTelemetry 자동계측을 붙이고, 고객 망 안의 **OpenTelemetry Collector**가 받아서 샘플링·정리한 뒤 우리 BE로 보낸다. BE는 Postgres에 저장하고 **서비스 단위**로 가용성·응답시간·오류율·처리량·런타임을 보여주며, 트레이스로 원인까지 좁혀 준다.

```
[고객 앱들]                       [고객 망 안, 우리가 설정 템플릿 제공]         [MovesEye BE]
Java -javaagent ─┐
.NET/Node/Python ┼─ OTLP(grpc/http) ─► OpenTelemetry Collector ─ OTLP http/json ─► /apm/otlp/v1/{metrics,traces}
(코드 수정 0)     ┘                      · 배치·메모리 제한                            │ 허용목록·버킷·롤업
                                        · 속성 정리(카디널리티)                        ▼
                                        · tail 샘플링(오류·느림 100%)              Postgres ─► 화면·알람·AI 툴
                                        · 인증 헤더 부착
```

**왜 Collector를 사이에 두나** (v1의 "에이전트 → BE 직송" 대비)

| 관심사 | 에이전트 직송(v1 A안) | **Collector 경유(v2)** |
|---|---|---|
| 프로토콜 | Java SDK는 protobuf만 → BE에 protobuf 의존 추가 | Collector가 **json으로 변환**(`otlphttp` exporter `encoding: json`) → 기존 파서 재사용, BE 의존 0 |
| 트레이스 샘플링 | 에이전트 head 샘플링만 → **오류를 놓친다** | Collector **tail 샘플링** → 오류·느린 요청 100% 보존, 정상만 확률 샘플 |
| 카디널리티·잡음 | BE가 전부 받고 버림 | Collector가 먼저 거르고 BE는 최종 게이트 |
| 앱 설정 | 앱마다 토큰·엔드포인트 | 앱은 `localhost:4317`만, 토큰·주소는 Collector 한 곳 |
| 확장 | — | Prometheus 스크레이프·호스트 메트릭·로그 수신이 **설정 한 줄**(수집 엔진 스텝 6의 다른 길) |
| 설치 부담 | 0 | 단일 바이너리 1개(Windows/Linux, 도커 불필요) — 설치형 제약과 충돌 없음 |

### 0.1 실측 (2026-08-26) — v2에 남는 것만

| 항목 | 실측값 | 설계 반영 |
|---|---|---|
| 재사용 코드 | `aimonitor/otel/{OtlpMetricsParser, OtlpModels, AiMonitorOtlpController}` — resource/scope/metric 순회, sum/gauge/histogram, DELTA/CUMULATIVE, sha256 dedup, Bearer 대조, 415 직접 반환 | `otel/` 공용 승격. **히스토그램은 sum만 취함 → 버킷 보존으로 확장**(p95 필요) |
| BE protobuf 의존 | 0건 | Collector가 json으로 보내므로 **그대로 0 유지** |
| Flyway 최신 | V35 | APM은 **V36~** |
| 라이선스·FE 껍데기 | `Feature.APM`(PREMIUM), `/application-monitoring` 라우트·메뉴·`FeatureGate`, `Empty` 스텁 | 내용물만 채운다 |
| 고객 데모 Zabbix | 웹 시나리오 22건 실사용, JMX 66아이템 수집 0건 | APM 범위 밖(§9). JVM 지표는 OTel 에이전트가 Gateway 없이 준다 |

### 0.2 마일스톤 → Phase (v3: 동반 문서 §1.3이 정본)

| Phase | 한 줄 | 본 문서의 M 대응 | 어림 |
|---|---|---|---|
| **P1** 기반+메트릭 | Collector 템플릿·수신·자동 등록·RED·런타임(5개 런타임)·액티브 요청·풀·알람(Zabbix 배달)·수집기·개요 | M1 | ~75 사람-일 |
| **P2** 트레이스 | 스팬·워터폴·플레임·산점도·서비스 맵·**에러 그룹·DB 쿼리 그룹·외부 호출·배포 전후 비교** | M2 | ~65 |
| **P3** 운영 심화 | SLO·합성 감시 편입·메시징/배치·리포트·AI 툴·홈 위젯 | (신규) | ~40 |
| **P4** 경험 확장 | RUM·로그 상관·K8s 컨텍스트 | M3 + 신규 | ~30 |
| 후보 | 외부 APM(Datadog·Jaeger/Tempo) 읽기 연동 | M4 | Q6 |

---

## 1. 배경·목적

### 1.1 as-is
라이선스(`Feature.APM` PREMIUM)·FE 라우트/메뉴/게이트·"준비 중" 스텁·문서 "[예정]"까지 **껍데기는 전부 있고 내용물 0**. BE `premium/apm/` 패키지는 예약만.

### 1.2 정정 — 고객 문서의 잘못된 문구
`준비-중인-모니터링.md`: "Prometheus·Datadog 소스가 붙어야 애플리케이션 지표를 수집할 수 있다" → **틀림.** APM은 외부 모니터링 소스에서 **가져오는** 게 아니라 고객 앱이 **우리에게 보내는** 것이다. 확정 후 문서 갱신(§8.3).

### 1.3 한 줄 정의
> **고객이 운영하는 애플리케이션(서비스)이 살아 있는지, 얼마나 빠른지, 얼마나 실패하는지를 서비스 단위로 보여주고, 나빠졌을 때 어느 엔드포인트·호출·의존이 원인인지 좁혀 준다.**

서버 모니터링과의 차이: **주어가 호스트가 아니라 서비스.** "사내 Jira가 지금 느린가"에 답한다.

### 1.4 원칙
1. **OpenTelemetry 표준을 그대로 쓴다.** 자체 SDK·에이전트·프로토콜을 만들지 않는다. 시맨틱 컨벤션(stable)의 이름·차원을 우리 모델로 삼는다.
2. **Collector가 "우리 것"이 아니라 "우리가 설정을 주는 표준 부품"이다.** 소스 수정·포크 없음. 우리 산출물은 **설정 템플릿과 검증 화면**.
3. **수집층 중립(P2-1)**: `Feature.APM`·APM 어휘는 `premium/apm/`에만. `engine-api`의 **소스 중립 포트(`engine/`)에는 손대지 않는다.** 단 `engine-api`의 **Zabbix 전용 계약(`zabbix/` — host·alert·action·discovery 등이 이미 있음)** 에 `history.push` 계약 1개를 추가하는 것은 기존 관례(트리거·매크로·유지보수 계약과 동급)대로 허용한다 — "값 적재"는 APM 무관한 범용 Zabbix 능력이다(D11 "값이 답하는 질문"). 트래퍼 호스트·아이템·트리거 프로비저닝은 새 포트가 아니라 기존 `zabbixadmin` 관리 서비스(`ZabbixItemManageService`·`ZabbixTriggerManageService`·`HostManageService`)를 `premium/apm/alert/bridge/ZabbixAlertBridge`가 호출한다(v3.1 정정 — 코덱스 B4).
4. **설치형 제약**: 새 DB 없음. Postgres 파티션·롤업·샘플링으로 시작, 승격 조건 수치화(§4.6).
5. **화면이 고정된 오피니언 제품** — Grafana식 임의 쿼리가 아니라 **허용목록 메트릭**과 고정 차원.

---

## 2. 도메인 모델 — "서비스"가 1급 엔티티

### 2.1 ApmService — 식별·등록 정책 (v3.1 재정의)

**식별자**: 서비스의 자연키는 **`(service_name, env)`** 쌍이다(같은 이름이 dev/prod에 공존). `env`는 리소스 `deployment.environment(.name)`에서 오고 없으면 `''`. 내부 참조는 **불변 UUID `service_uid`** — Zabbix 트리거 키·URL·알람 이력·SLO 전부 UUID를 쓰고, 이름은 표시용이라 바꿔도 아무것도 안 깨진다.

**정규화(canonicalization)**: 이름·env는 trim → NFC → 소문자 비교(저장은 원문) → 길이 128 절단. 정규화 후 같은 쌍은 같은 서비스.

**등록 모드**(수집기 설정, 전역): 
| 모드 | 동작 | 기본 |
|---|---|---|
| `AUTO` | 첫 수신 시 즉시 서비스 생성·표시 | ✅ 기본(온보딩 60초 경험) |
| `APPROVE` | 첫 수신 시 "승인 대기" 목록에만 두고 데이터는 **버린다**(저장 안 함) — 관리자가 승인해야 서비스가 된다 | 운영 환경 권장 |
| `ALLOWLIST` | 사전 등록된 `(name, env)`만 받고 나머지는 폐기 카운터만 | 엄격 고객 |

- **`unknown_service:*`** 는 어떤 모드에서도 서비스로 만들지 않는다 — 별도 "이름 없는 앱" 큐(인스턴스·호스트만 기록)로 격리하고 설치 가이드로 유도.
- **자동 숨김 TTL**: 마지막 수신 후 N일(기본 14) 미수신이면 자동 숨김, 보존 기간 뒤 자동 삭제(데이터 포함). 숨김은 표시 억제일 뿐 생성 억제가 아니므로 생성 억제는 위 모드가 맡는다.

```
ApmService
 ├ service_uid(UUID, 불변), service_name, env  (UNIQUE(service_name_norm, env_norm))
 ├ display_name, description, tags[], owner, apdex_t, slow_threshold_ms
 ├ state(ACTIVE|PENDING_APPROVAL|HIDDEN), first_seen_at, last_seen_at, hidden_at
 ├ instances[]  ← service.instance.id 별 마지막 수신·version·host.name·(P4) k8s.pod.name
 └ 파생: status(§2.2), availability24h, p50/p95/p99, errorRate, rps, activeRequests
```

- **호스트 연결**: 리소스 `host.name` ↔ Zabbix 호스트명 매칭(정규화 문자열 + 수동 보정) → 서버 모니터링 링크. 자산·맵은 링크만(Q8).

### 2.2 상태 판정
| 상태 | 조건 |
|---|---|
| UP | 최근 5분 수신 있음 · 오류율 < 임계 · p95 < 임계 |
| DEGRADED | 수신 있음 · 임계 초과(알람 규칙 §4.5와 동일 기준) |
| DOWN | **합성 감시(P3)가 바인딩돼 있고 그 결과가 실패**일 때만. 메트릭 부재로 DOWN을 추론하지 않는다(v3.1 — 저트래픽 서비스 오판 방지) |
| STALE | 최근 N분(기본 5, 서비스별 "기대 트래픽" 설정으로 연장 가능) 수신 없음. **배포 직후 grace 10분**은 STALE 제외. "앱이 죽었나 vs 파이프라인이 끊겼나"는 Collector 상태(§3.4)로 가른다 — Collector 자체가 STALE이면 그 아래 서비스는 `UNKNOWN(수집기 끊김)`으로 표시 |

### 2.3 신호 4종 + 런타임
| 신호 | 출처(OTel) |
|---|---|
| 가용성 | 수신 지속 여부(STALE) + 오류율 |
| 응답시간 | `http.server.request.duration` 히스토그램 → p50/p95/p99 |
| 오류율 | status_code 5xx 비율(+ 스팬 `status=ERROR`, M2) |
| 처리량 | 히스토그램 count/Δt (rps) |
| 런타임 | `jvm.*`, `db.client.connection.*`, `process.*`; .NET/Node/Python 대응표 |

### 2.4 경계 — DB 모니터링(2단계)
앱 입장(커넥션 풀, 앱에서 본 DB 호출 지연 `db.client.*`)은 **APM**, DB 인스턴스 내부(세션·락·복제)는 **DB 모니터링**. Redis·Kafka는 앱 스택으로 보아 APM(Q9).

---

## 3. 수집 파이프라인 — OpenTelemetry Collector

### 3.1 배치 토폴로지
- **게이트웨이 모드 1대**(고객 사이트당) 기본. 앱 → Collector(`:4317` grpc / `:4318` http) → BE. 
- 🔴 tail 샘플링은 **한 트레이스의 모든 스팬이 같은 Collector에 와야** 한다 → 게이트웨이 1대가 자연스럽다. 다중 Collector가 필요해지면 `loadbalancing` exporter(trace_id 라우팅) 2계층 — §4.6 승격 항목.
- 에이전트(사이드카/호스트) 모드는 강제하지 않는다. 앱이 게이트웨이로 직접 보내면 된다(LAN).
- 배포 형태: **`otelcol-contrib` 단일 바이너리**(Windows 서비스 / Linux systemd). 도커 불필요 → 설치형·무도커 경로와 정합. 버전은 우리가 **검증한 버전을 고정**해 가이드에 명시(에이전트 설치 가이드의 `{major}-latest` 별칭 교훈 — 여기선 contrib 릴리스 URL이 풀버전).

### 3.2 설정 템플릿 (우리 산출물) — 골자
```yaml
receivers:
  otlp: { protocols: { grpc: {endpoint: 0.0.0.0:4317}, http: {endpoint: 0.0.0.0:4318} } }
  prometheus/self:                                        # v3.1: Collector 자기 메트릭(otelcol_*) → §3.4 수집기 화면
    config: { scrape_configs: [ { job_name: otelcol, scrape_interval: 30s, static_configs: [ { targets: ['127.0.0.1:8888'] } ] } ] }
processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
  resourcedetection: { detectors: [env, system] }        # host.name 보강
  # ── v3.1 마스킹·PII: 삭제는 정확한 키 목록 + 정규식(attributes processor의 `*` 와일드카드는 보장되지 않음) ──
  attributes/drop:
    actions:
      - { key: url.full, action: delete }                 # 쿼리스트링 포함 원시 URL
      - { key: url.query, action: delete }
      - { key: user_agent.original, action: delete }
      - { pattern: '^http\.(request|response)\.header\..*', action: delete }   # 헤더 전부(regex)
      - { key: enduser.id, action: hash }
  redaction/pii:                                          # 값 안의 카드번호·주민번호·이메일 패턴 마스킹
    allow_all_keys: true
    blocked_values: [ '\b\d{6}-\d{7}\b', '\b(?:\d[ -]*?){13,16}\b', '[\w.+-]+@[\w-]+\.[\w.]+' ]
  transform/sql:                                          # db.query.text 리터럴 → ? (에이전트 마스킹 실패분 2중 방어)
    trace_statements:
      - context: span
        statements:
          - replace_pattern(attributes["db.query.text"], "'[^']*'", "?")
          - replace_pattern(attributes["db.query.text"], "\\b\\d+\\b", "?")
          - truncate_all(attributes, 4096)               # 스택트레이스·SQL 상한
  filter/metrics:                                         # 허용목록(§4.3) 밖 메트릭 폐기 — otelcol_* 포함
    metrics: { include: { match_type: regexp, metric_names: [ 'http\.server\..*', 'http\.client\..*', 'rpc\..*', 'jvm\..*', 'db\.client\..*', 'process\..*', 'messaging\..*', 'otelcol_.*' ] } }
  tail_sampling:                                          # P2 — 🔴 모든 스팬이 같은 Collector에 와야 한다(§3.1)
    decision_wait: 10s
    num_traces: 50000                                     # R2 실측으로 확정(예상 trace TPS × decision_wait × 여유)
    policies:
      - { name: errors,  type: status_code, status_code: {status_codes: [ERROR]} }
      - { name: slow,    type: latency,     latency: {threshold_ms: 2000} }
      - { name: normal,  type: probabilistic, probabilistic: {sampling_percentage: 2} }
  batch: { timeout: 5s, send_batch_size: 512, send_batch_max_size: 1024 }   # 바이트 상한은 없음 → BE 8MB + gzip, 413 시 분할 재전송 없음(R1에서 경계 확정)
exporters:
  otlphttp/moveseye:
    endpoint: https://<moveseye>/apm/otlp          # BE(또는 nginx) — /v1/metrics, /v1/traces, /v1/logs 자동 접미
    encoding: json                                  # 🔴 BE 파서가 json 전용 — protobuf 의존 없이 재사용 (R1)
    compression: gzip
    headers: { Authorization: "Bearer <수신 토큰>" }  # 토큰은 발급 시 1회만 표시 — 이 파일 권한 600/관리자 전용
    sending_queue: { enabled: true, storage: file_storage, queue_size: 5000 }
    retry_on_failure: { enabled: true, max_elapsed_time: 30m }   # 5xx·네트워크만 재시도. 🔴 401/403/413은 영구 실패로 즉시 폐기(§4.1)
extensions:
  file_storage: { directory: <데이터 디렉터리>/otelcol-queue, create_directory: true, timeout: 1s, compaction: { on_start: true, directory: <같은 경로>, max_transaction_size: 65536 } }   # v3.2: 정본 템플릿 = BE `src/main/resources/apm/collector-template.yaml`(validate 통과)
  health_check: { endpoint: 127.0.0.1:13133 }
service:
  telemetry: { metrics: { level: normal, readers: [ { pull: { exporter: { prometheus: { host: 127.0.0.1, port: 8888 } } } } ] } }   # v3.2: 0.159에서 address 키는 제거됨(R1 실측)
  pipelines:
    metrics:      { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, filter/metrics, batch], exporters: [otlphttp/moveseye] }
    metrics/self: { receivers: [prometheus/self], processors: [memory_limiter, filter/self, batch], exporters: [otlphttp/moveseye] }   # v3.2: filter/self(^otelcol[._]) — 스크레이프 메타 제거(R14)
    traces:       { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, transform/sql, tail_sampling, batch], exporters: [otlphttp/moveseye] }
    logs:         { receivers: [otlp],            processors: [memory_limiter, resourcedetection, attributes/drop, redaction/pii, batch], exporters: [otlphttp/moveseye] }   # P4
```
- 설정 화면(§8.2 "수집기")에서 **토큰(ID 선택)·BE 주소·샘플링 비율·느림 임계·허용목록 스택·마스킹 강도·원문 SQL 보존 opt-in**을 고르면 위 yaml을 **생성해 내려준다**(POST, `Cache-Control: no-store`). 손편집은 가능하되 "우리 템플릿 = 지원 범위". **원문 SQL·헤더 보존은 opt-in**이며 켜면 화면에 개인정보 경고 배너 + 감사 로그.
- **file_storage 정책**: 데이터 디렉터리 하위, 권한 700, 큐 상한 5,000 배치(≈수백 MB), Collector 재기동 시 compaction. 디스크 큐에는 마스킹 **후** 데이터만 남는다(프로세서가 exporter 앞). BE 장기 장애·라이선스 만료 시 큐 잔존물은 "수집기 중지" 절차에서 삭제 안내.
- 🔴 **R1 실측 범위(코덱스 A1 반영)**: 고정 `otelcol-contrib` 버전에서 metrics·traces·logs 세 경로 json — explicit **및 exponential** histogram·버킷·exemplar·스팬 event/link·resource/scope·gzip·본문 상한(413) 경계까지 전부 round-trip. **JSON 형식이 파서·스키마를 결정하므로 R1은 WS-0.2보다 먼저**(동반 문서 WBS 수정).
- 🔴 **다중 Collector 금지 문구(코덱스 A5)**: P1 설치 가이드에 "게이트웨이 1대. 두 대 이상이면 trace_id 일관 해싱(`loadbalancing` exporter 2계층) 없이는 트레이스가 갈라져 tail 샘플링이 무의미"를 명시. HA 요구 시 active-standby(파일 큐 공유 없음, 전환 중 유실 허용)로 안내, active-active는 §4.6 승격 항목.

### 3.3 앱 계측 — 스택별 한 줄
| 스택 | 방법 | 비고 |
|---|---|---|
| Java(Spring·Tomcat·Jira 등) | `-javaagent:opentelemetry-javaagent.jar` + `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector>:4317` | JVM 런타임 메트릭 포함, Java Gateway 불필요 |
| .NET | `OTEL_DOTNET_AUTO_*` 자동계측 | |
| Node | `--require @opentelemetry/auto-instrumentations-node/register` | |
| Python | `opentelemetry-instrument python app.py` | |
| Go·기타 | SDK 수동(가이드만) | |
- 에이전트 쪽 샘플러는 **`always_on`**(전량 Collector로) — LAN이라 부담 적고, 판단은 Collector tail에서. 트래픽이 큰 서비스만 `parentbased_traceidratio`로 낮추도록 가이드.

### 3.4 파이프라인 상태 가시화 (STALE의 원인을 가른다)
- §3.2의 `prometheus/self` receiver + `metrics/self` 파이프라인이 Collector 자기 메트릭(`otelcol_exporter_send_failed_*`, `otelcol_exporter_queue_size`, `otelcol_receiver_accepted_*`, `otelcol_processor_tail_sampling_*`, 빌드 버전)을 우리에게 보낸다(허용목록에 `otelcol_.*` 포함 — v3.1 코덱스 B1 정정). Collector 식별은 `service.instance.id`(자기 메트릭 리소스)로. 화면 "수집기" 탭: 마지막 수신·큐 적체·전송 실패·버전·tail 샘플링 버퍼 초과. 
- 이걸로 "앱이 죽음" vs "Collector가 죽음" vs "BE 수신 거부"를 화면에서 가른다.

---

## 4. 수신·저장 (BE `premium/apm/`)

### 4.1 수신 엔드포인트
- `POST /apm/otlp/v1/metrics`, `/v1/traces` (P2), `/v1/logs` (P4). `SecurityConfig` permitAll + **Bearer 수신 토큰**(사이트/Collector 단위, 여러 개 발급·회수 가능). AI 모니터링 `RECEIVE` 토큰 패턴 재사용.
- **토큰 취급(v3.1, 코덱스 B3)**: 원문은 **발급 응답에 1회만** 실리고 DB에는 sha256만 남는다. 이후 API는 전부 **토큰 ID**로 참조. 설정 yaml 생성은 `POST /apm/collector-config`(본문에 token_id·옵션, 응답 `Cache-Control: no-store`, 관리자 권한) — 토큰이 URL·프록시 로그·Referer에 남는 GET은 만들지 않는다. 회수 즉시 401.
- **권한(P1 최소, 코덱스 🟡)**: 토큰 발급/회수·설정 생성·마스킹 opt-in·합성 감시 자격증명·알람 규칙 = **관리자 역할**. 서비스 목록·차트·트레이스 열람 = 운영자 이상. SQL 원문·스택트레이스 열람은 관리자(설정으로 운영자 허용). 서비스 단위 데이터 권한은 Q17(2차).
- **`Feature.APM` 필수** — 미보유·만료(`READ_ONLY`)면 **403**. 🔴 **403은 OTLP exporter가 영구 실패로 분류해 재시도 없이 즉시 폐기한다**(v3.1 — 코덱스 A6: "30분 재시도로 버틴다"는 v2 전제는 틀림). 따라서 만료 = 그 순간부터 데이터 손실이며, 이것이 프리미엄 P17(만료 시 프리미엄 완전 차단)과 일치한다. 대신 (a) 만료 D-14/D-7/D-1 라이선스 배너에 "APM 수집이 중단됩니다" 문구, (b) 수집기 화면에 "만료 시 수집기 중지·토큰 회수" 버튼, (c) 만료 후 Collector 로그에 남을 403 메시지를 설치 가이드 FAQ에 기재. 401/403/413/429/5xx별 Collector 실제 동작은 **R11 실측**.
- 본문 상한 **8MB**(gzip 해제 후, `send_batch_max_size 1024` + 스택트레이스 배치 대비) → 413. sha256 dedup, `timeUnixNano=0` 방어, DELTA/CUMULATIVE 정규화, OTLP 경로만 실제 HTTP 상태 — AI 모니터링 실측 교훈 그대로.
- 🔴 **응답 코드 계약(v3.2, R11 실측)**: exporter는 **429·502·503·504만 재시도**하고 나머지는 전부 즉시 폐기한다 — **500도 폐기**(60초에 31배치 손실 실측). 따라서 수신 컨트롤러는 200 `{}` / 400·415(형식) / 401(토큰) / 403(기능 미보유·만료) / 413(상한) / **503(적재 중 예외·DB 장애·일시 장애)** 만 낸다. 500 금지 — 전역 예외 핸들러에 닿지 않게 컨트롤러 안에서 전부 잡는다. 기존 `AiMonitorOtlpController`의 "적재 실패=500" 분기는 같은 이유로 503으로 정정한다(별건).
- temporality는 **데이터포인트 단위**로 판정한다(v3.2): delta 선호를 켜도 UpDownCounter(`jvm.memory.*`·`db.client.connection.count`·`http.server.active_requests`)는 CUMULATIVE로 온다. 가이드는 `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`를 기본 권고(히스토그램·카운터가 delta가 되어 1분 적재가 차분 없이 끝난다).
- `aimonitor/otel/` → **`otel/` 공용 패키지로 이동**, `Point`에 `bucketCounts[]`·`explicitBounds[]`(+exemplar trace_id, M2) 추가.

### 4.2 서비스 자동 등록
리소스 속성에서 `service.name`·`service.instance.id`·`service.version`·`deployment.environment`·`host.name`을 뽑아 `apm_service`/`apm_instance` upsert(캐시로 매 배치 DB 왕복 회피).

### 4.3 허용목록 메트릭 (BE 최종 게이트 — Collector 필터와 이중)
| 메트릭 | 타입 | 보존 차원 | 화면 |
|---|---|---|---|
| `http.server.request.duration` | histogram(s) | `http.request.method`, `http.route`, status class(2xx/3xx/4xx/5xx로 접음) | 엔드포인트 표·RED |
| `http.client.request.duration` | histogram | `server.address`, status class | 외부 의존 |
| `jvm.memory.used` / `.limit` / `.committed` | gauge | `jvm.memory.type` | 런타임 |
| `jvm.gc.duration` | histogram | `jvm.gc.name` | 런타임 |
| `jvm.thread.count`, `jvm.cpu.recent_utilization`, `jvm.class.count` | gauge | — | 런타임 |
| `db.client.connection.count` / `.pending_requests` / `.wait_time` | gauge/hist | `db.client.connection.state`, pool name | 커넥션 풀 |
| `process.cpu.utilization`, `process.memory.usage` | gauge | — | 비-JVM 런타임 공통 |
| `http.server.active_requests` | updowncounter | method | **액티브 트랜잭션**(현재 처리 중 요청 수 — §13 체크리스트 반영) |
| `db.client.operation.duration` | histogram | `db.system`, `db.operation.name`, `db.collection.name` | **DB 호출 지연·슬로우 쿼리 후보**(§13). 쿼리 원문은 스팬 `db.query.text`(M2, 마스킹 기본) |
| `otelcol_*` (수집기 자기 메트릭) | counter | exporter/receiver | 수집기 탭 |
- `http.route`는 템플릿 경로라 유한. route 계측이 없으면 원시 경로가 올 수 있음 → **서비스당 500 상한**, 초과분 `__other__` + 경고. Collector `attributes/drop`이 1차 방어.
- 나머지는 폐기(폐기 카운터만 증가 → 수집기 탭에 "받았지만 안 쓰는 메트릭 n종" 표시, 허용목록 확장 근거).
- ✅ v3.2: **Java(2.31.1)는 플래그 없이 `http.server.active_requests`를 낸다**(R12 실측). 아래 문단은 .NET/Node/Python에만 남는 주의다.
- 🔴 **`http.server.active_requests`는 시맨틱 컨벤션상 opt-in**이라 언어별 자동계측이 기본 제공한다고 보장할 수 없다(v3.1 코덱스 A9). 미수신 시 P2에서 서버 스팬 in-flight 수로 근사하고, 화면은 "계측 미제공" 배지. **R12 실측**: Java/.NET/Node/Python 자동계측 기본 조합에서 active_requests·풀·operation.duration이 실제로 나오는지.
- **exemplar(v3.2)**: 데이터포인트 exemplar에서 **traceId·spanId·시각·값만** 보존하고 `filteredAttributes`는 폐기한다 — 실측에서 원문 SQL(`db.query.text`)·`url.path`·`client.address`·`user_agent.original`이 그대로 실려 왔고 Collector `attributes/drop`은 exemplar 속성을 만지지 않는다.
- **차원 정규화 규칙(코덱스 A3)**: `dims`는 허용 키만 **키 정렬**한 canonical JSON(NULL·빈값은 `''`, 값 길이 256 절단)으로 직렬화하고 `dims_hash = sha256(canonical)`. 자연키는 `(service_id, instance_id, metric, dims_hash, bucket_start)`이며 `dims` 원문을 함께 저장해 해시 충돌 시 원문 비교로 판정(충돌 카운터 기록).
- **히스토그램 경계 정규화(코덱스 B8, v3.2 실측 정정)**: 메트릭 패밀리별 **정규 경계(canonical bounds)** 를 고정한다 — Java 에이전트 기본값과 **일치**시켜 기본 조합에서는 재버킷이 0건이 되게 한다: `duration_s`(`http.*.duration`·`rpc.*`) 14단 `0.005…10`, `db_operation_s`(`db.client.operation.duration`) 9단 `0.001,0.005,0.01,0.05,0.1,0.5,1,5,10`, `gc_s`(`jvm.gc.duration`) 4단 `0.01,0.1,1,10`, `pool_ms`(`db.client.connection.*_time`, 단위 ms) 15단 `0,5,10,25,…,10000`. 수신 버킷의 경계가 다르면 **선형 보간으로 정규 경계에 재버킷**한 뒤 저장하고 원래 경계는 `apm_ingest_drop_stat`에 기록(재버킷은 오차를 만든다 → 화면에 `rebucketed` 표시). **exponential histogram**은 정규 경계로 변환(밑·스케일에서 경계 계산). 그래서 같은 메트릭의 모든 행은 같은 `bounds_id`를 갖고 롤업은 count 벡터의 단순 합이 된다.

### 4.4 저장 — Postgres, 롤업 3단
```
apm_metric_1m (원시 1분)  7일  · apm_metric_5m  30일 · apm_metric_1h  400일     — 일 파티션
행 = (service_id, instance_id, metric, dims_hash, dims jsonb, bucket_start, count, sum, min, max, hist_counts int[], bounds_id)
apm_hist_bounds (bounds double[] UNIQUE)  — 경계 정규화
```
- 롤업·보존 `SchedulerJob` 2종(`apm_rollup` 5분, `apm_retention` 일 1회). 롤업은 같은 `bounds_id`끼리 count 벡터 합·sum 합·min/max — §4.3 정규 경계 덕에 병합 규칙이 단순하다.
- **용량 어림(v3.3 — R3 실측 확정, `./r3_apm-volume.md`)**: RED 행 = 서비스 10 × 인스턴스 평균 3 × route 50 × method 2(실효) × status class 3(실효) = **9,000행/분** + 런타임/풀(인스턴스 30 × 메트릭 25 = 750) + Collector 자기 메트릭(~50) ≈ **1만 행/분 = 14M행/일** — 🔴 **R3 실측 9,750행/분·14.04M행/일로 이 행 수 어림은 맞았다.** 다만 **행당 비용이 150B가 아니라 686B**다(힙 393 + 인덱스 293, PG 18 기본 설정). 1m 7일 ≈ 98M행 = **67 GB**. **5m/1h는 인스턴스 축이 없어** 각각 0.94M행/일·0.078M행/일이고 30일 19 GB · 400일 22 GB — **3단 합계 ≈ 109 GB**(구 어림 "5m 30일 85M · 1h 400일 100M"은 인스턴스 축 소멸을 빠뜨린 3배 과다였다). 🔴 **용량의 절반이 인덱스이고, `apm_metric_1m`의 PK 하나가 전체의 41%**다 — 키의 `dims_hash char(64)`가 68B, 리프 밀도는 무작위 삽입 탓에 52%. `dims`를 사전 테이블로 빼면 행당 686→400B로 내려간다(§4.6 승격 전 조치 S1). **인스턴스 축은 1m에서만 보존**하고 5m/1h 롤업은 서비스 합산(인스턴스별 장기 추이는 안 준다 — 화면 §3.10 small multiples는 7일 한정). 서비스 50·인스턴스 5면 1m 일 117M행 → 7일 **562 GB**, 3단 **770 GB**로 단일 박스 한계를 명백히 넘는다.
- **질의 목표 — R3 실측**: 화면 기본 창(1h·6h·24h)은 1m/5m, 7d는 5m, 30d+는 1h. 단일 서비스는 목표를 지킨다(6h RED **0.53초**, 24h RED·엔드포인트 **0.11초**, 히트맵 6h **0.05초**). 🔴 **목록 화면이 목표를 13배 넘겼다** — `/apm/services/overview` 24h가 서비스 13·14M행/일에서 **cold 13~14초**(warm 1.8~3.9초). 원인은 `availability24hPct`가 1m 원시 12.96M행을 288칸으로 접는 것이고(EXPLAIN 28.2초, 임시파일 2.8 GB), 캐시가 5분 버킷이라 **5분마다 한 번씩** 이 값을 문다. 동시성 4에서 처리율 0.79 req/s. ✅ **2026-09-01 조치 완료(Q1)**: 그 경로를 **5m 기준선 + 롤업 워터마크가 정하는 1m 꼬리**로 바꿨다(스트립과 같은 판정 함수 유지, 5분 칸 = 5m 버킷이라 해상도 손실 없음) → 스캔 1/15.
- 🔴 **PG 기본 설정이 질의 플랜을 좌우한다 — 튜닝은 선택이 아니다**(R3 후속 실측, 2026-09-01). `work_mem`이 기본 4MB면 APM의 큰 GROUP BY가 전부 디스크로 스필하고 플래너가 HashAggregate 대신 **Sort+GroupAggregate**를 고른다. 🔴 **`order by`를 걷어내도, 히스토그램 전개 폭을 24→15로 줄여도 플랜은 바뀌지 않았다** — 뒤집은 것은 `work_mem` 하나(4MB→64MB)였고 그때 스필이 사라졌다(6h RED 251 ms → 186 ms, 임시파일 24 MB×3 → 0). 그래서 권장 설정을 **설치 가이드 `notices`(`postgres-tuning`)로 제품이 직접 안내**한다: `work_mem 64MB` · `shared_buffers` RAM 25% · `maintenance_work_mem 1GB` · `max_wal_size 4GB`.
- 🔴 시각 컬럼 `DEFAULT now()` 금지(V30 교훈), varchar enum(값 추가에 마이그레이션 없이).

### 4.5 알람 — 우리 규칙, 배달은 Zabbix에 태운다
서비스별 `오류율 > x% (5분)`, `p95 > y ms (5분)`, `수신 끊김 > n분`, `수집기 전송 실패 누적`, (선택) `SLO 가용성 < 목표`. 기본값은 전역, 서비스별 덮어쓰기.

🔴 **배달 경로가 v2 조사에서 갭으로 드러났다**: 제품의 자체 푸시 채널은 `EmailService` 하나뿐이고, Slack·Teams·Jandi·웹훅은 전부 **Zabbix 미디어 타입**(우리는 관리 화면만 제공)이다. AI 모니터링의 `evaluateAll()`도 화면 표시용이지 푸시가 아니다. APM 알람을 이메일로만 보내면 체크리스트 "기존 도구 연동"(§13-7)에서 탈락한다. 선택지(Q14):
- **A. Zabbix 배달 경유(추천, 래핑 원칙)** — BE가 "MovesEye APM" 가상 호스트의 트래퍼 아이템에 **Zabbix 7.0 `history.push` API**로 값을 밀고, 트리거는 우리 규칙으로 자동 생성·동기화. 그러면 **Zabbix 액션·미디어(Slack/Teams/Jandi/메일)·에스컬레이션·유지보수 창·기존 Problem 화면·알림 벨이 전부 공짜**로 붙는다. 알림 채널을 새로 만들지 않는다(§9).
- B. 자체 웹훅 채널 신설(Slack/Teams incoming webhook) — 코드는 작지만 라우팅·에스컬레이션·억제를 다시 만들게 되고 Zabbix 알림과 두 갈래가 된다.
- ✅ **R10 실측 완료(v3.2, 2026-08-31, `./r10_apm-zabbix-history-push.md`)**: 7.0.6에서 인터페이스 없는 가상 호스트+트래퍼 아이템에 `history.push` → 5초 내 Problem, 6초 내 복구, 드리프트 감지·OURS 복원·삭제 후 재생성 전부 API로 성립. 폴백(`zabbix_sender`) 불필요. **확정 계약 8가지**: ① 응답은 항목 단위(`data[i].error` = 그 값은 버려짐, `response:"success"`는 수신 확인일 뿐) ② 아이템 생성 직후 push는 `does not exist`로 실패 — **서버 설정 캐시 동기화(~10초) 대기·재시도** 필요 ③ 잘못된 타입은 push 성공 후 아이템이 NOT_SUPPORTED가 된다 → 값 검증은 우리 몫, 동기화 배치가 `state=1`을 배지로 ④ 복구 판정에 `problem.get recent:true` 금지(최근 해소분 포함) → `recent:false` 또는 `event.get r_eventid` ⑤ 매핑 탐색 키는 태그 `apm_uid`(triggerid는 사용자 삭제·재생성으로 바뀜) ⑥ 호스트는 인터페이스 없이 1개(`MovesEye APM`), 아이템 키에 UUID ⑦ "권한 없음·없음·캐시 미동기"가 같은 문구라 진단 EP는 `host.get`/`item.get` 가시성으로 가른다 ⑧ 액션 진단은 `action.get selectFilter`의 호스트 그룹(조건 0)/태그(조건 26) 조건 대조 — 데모 서버 17개 액션 중 0개가 우리 그룹을 참조(배지 필수).

**A안의 소유권·드리프트 계약(v3.1 — 코덱스 A2·🟡)**
- 아이템 키는 서비스 이름이 아니라 **불변 UUID**: `apm.error_rate[<service_uid>]`·`apm.p95[<service_uid>]`·`apm.stale[<service_uid>]`·`apm.slo_burn[<slo_uid>]`. 이름 변경·특수문자·env 분리에 영향 없음. 아이템/트리거 이름(표시용)에만 표시명을 넣고 이름 변경 시 갱신.
- Zabbix 객체는 **우리 소유 태그**(`owner:moveseye-apm`, `apm_uid:<uuid>`)로 표시하고, 매핑(`apm_alert_rule.zbx_itemid/triggerid`)을 저장.
- **동기화 주기(일 1회 + 규칙 변경 시)**: 우리 규칙 ↔ Zabbix 트리거를 대조해 (a) 사용자가 Zabbix에서 트리거 표현식을 바꿨으면 **덮어쓰지 않고** 규칙에 `drift=true` 배지 + "우리 값으로 되돌리기/Zabbix 값 채택" 선택, (b) 삭제됐으면 재생성(감사 로그), (c) 규칙 삭제 시 Zabbix 객체도 삭제(소유 태그 있는 것만). 액션·미디어는 **절대 우리가 만들지 않는다** — 고객의 Zabbix 액션이 우리 호스트 그룹 "MovesEye APM"을 조건에 넣도록 가이드(설정 화면에 "알림 액션 없음" 진단 배지).
- API 권한: `history.push`는 아이템 호스트에 대한 쓰기 권한이 필요 — 제품의 Zabbix 서비스 계정(슈퍼관리자)으로 실행하며, 고객이 계정을 제한했으면 진단 배지. 감사 로그는 Zabbix 쪽 audit에 남는다.

### 4.6 승격 조건 (Postgres → ClickHouse / Collector 2계층)

> **v3.3 — R3 실측으로 재확정**(`./r3_apm-volume.md` §9). 구 기준("1m 일 50M행 또는 롤업 5분 초과")에는 세 문제가 있었다. ① 행 수 기준이 용량보다 늦게 울린다(50M행/일 = 1m 7일 **240 GB**). ② "롤업 5분 초과"는 정상 운영이 아니라 **백필에서만** 울려 오탐이다(정상 1회 실측 **1.2초**). ③ **화면 지연이 기준에 없었다** — 실측에서 가장 먼저 무너진 축이다.
>
> 측정 기준선(R3, 2026-09-01): 서비스 10 · 인스턴스 3 · route 50 → 1m 14.04M행/일, 행당 686 B(인덱스 포함), 1m 7일 67 GB · 3단 합계 109 GB. PG 18 무튜닝 단일 박스.

- 🔴 **용량(1차 기준)**: `apm_metric_1m` 일 증가 > **20M행**(≈ 1m 7일 96 GB, 3단 합계 ≈ 155 GB) → 저장 계층 교체 **검토**. **> 35M행/일**(3단 합계 ≈ 270 GB) → 교체 **착수**. (`ApmMetricStore` 인터페이스로 격리)
  - 행당 686 B를 상수로 본 환산이다. 아래 S1(=`dims` 사전 테이블)을 적용하면 임계를 1.7배 올릴 수 있다.
- 🔴 **화면(2차 기준, 실제로 가장 먼저 온다)**: 서비스 목록(`/apm/services/overview`) **cold p50 > 3초** 또는 단일 서비스 6h RED > 1.5초 → 질의 계층 손질(아래 Q1~Q3) → 그래도 넘으면 교체.
  - ⚠️ **판정 전에 PG 튜닝(`work_mem` 등, §4.4)이 되어 있는지부터 확인한다** — 무튜닝 값으로 이 기준을 재면 교체가 필요 없는 설치에서도 울린다.
- **롤업**: "5분 초과"를 **정상 운영 1회 기준**으로 못 박는다 — 닫힌 버킷 1개를 접는 데 **> 60초**(5분 예산의 20%)면 승격. R3 실측 **1.2초**. 밀린 구간 따라잡기는 이 기준에서 **제외**하고, 대신 `maxBuckets`를 낮춰 단일 문장이 5분을 넘지 않게 한다(아래 R1).
- 일 스팬 > 20M → 트레이스 저장소 교체
- Collector 1대 CPU/메모리 한계 or 사이트 다중화 → `loadbalancing` exporter 2계층
- 고객이 ClickHouse 운영 중 → 그쪽으로

**승격 전에 할 수 있는 것** (R3 §9.1, 상태는 2026-09-01 기준)

| # | 조치 | 효과 | 상태 |
|---|---|---|---|
| **Q1** | `availability24hPct`를 **5m 기준선 + 1m 꼬리** 하이브리드로(스트립과 같은 판정 함수 유지). 꼬리 길이는 상수가 아니라 **롤업 워터마크**가 정한다 — 롤업이 밀린 동안은 1m을 더 읽어 느려지되 틀리지 않는다 | 목록 스캔 12.96M행 → 1/15 | ✅ 완료 |
| **R1** | `DEFAULT_MAX_BUCKETS_5M` 288 → **60**, `_1H` 48 → **12** | 백필 단일 문장 6분 39초 → ~80초 | ✅ 완료 |
| **Q2** | 시계열 질의의 `order by bucket_start`를 자바 정렬로 | 🔴 **효과 없음이 확인됐다** — 플랜을 정하는 것은 `work_mem`이었다(§4.4). 변경은 유지(플래너 제약을 하나 줄이고 결과 정렬은 자바가 한다) | ✅ 완료(효과는 O1) |
| **Q3** | 롤업의 경계-갈림 진단을 INSERT와 **한 문장**으로(CTE `materialized` 1회 스캔) | 원본 스캔 2회 → 1회. 실측 6.50초 → 6.02초(324k행), 백필에서는 선조회만 7초였다 | ✅ 완료 |
| **O1** | 설치 가이드 `notices`에 **PG 권장 설정 + 용량 공식** | 🔴 **여기가 진짜 지렛대다** — 6h RED 251→186 ms, 스필 소멸 | ✅ 완료 |
| **S1** | `dims`를 사전 테이블(`apm_dims`)로 빼고 메트릭 테이블은 `dims_id int`만 | 행당 **686 → ~400 B (−42%)**, 1m 7일 67 → 39 GB | ⏸ **P2와 함께 판단** — 1m PK 변경이라 마이그레이션·적재·조회를 동시에 건드린다 |
| S2 | (S1을 못 하면) `dims_hash`를 `char(64)` → `bytea(32)` | 행당 −60 B (−9%) | ⏸ 미착수 |

---

## 5. M2 — 트레이스·서비스 맵

- 수신 `/v1/traces`. 샘플링은 **Collector tail**(§3.2): 오류·느림 100%, 정상 2%(설정 화면에서 조정). 화면엔 `sampled` 항상 표기, **오류율·처리량은 메트릭(전량)에서**, 트레이스는 예시.
- 저장(일 파티션, 보존 7일):
```
apm_span           (trace_id, span_id, parent_span_id, service_id, name, kind, start, duration_ns, status, attrs jsonb)
apm_trace_summary  (trace_id, root_service_id, root_name, start, duration_ns, error, span_count)   — 목록은 이것만
apm_service_edge_5m(from_service_id, to_kind, to_ref, bucket, count, error_count, hist_counts int[], bounds_id)   — 서비스 맵 (p95는 저장하지 않고 히스토그램 벡터 보존 → 재집계 가능, v3.1 코덱스 B8)
```
- 서비스 맵 엣지 = `CLIENT` 스팬의 `peer.service`/`server.address` + 부모 관계 5분 롤업. 샘플링 데이터라 비율은 맞고 절대 건수는 근사.
- 메트릭 exemplar(trace_id)를 보존하면 "p95 막대 → 그 시점 느린 트레이스"로 바로 점프 — R1에서 json에 exemplar가 실리는지 확인.
- `TracePort`(프리미엄 §7.4)는 엔진 포트로 만들지 않는다 — 우리가 저장소 주인이라 소스 중립 조회가 아니다. `premium/apm/trace/TraceStore`(PG). 외부 APM 연동(M4)은 읽기 어댑터+링크아웃으로 그때 일반화(YAGNI).

## 6. M3 — 로그 상관 (조건부)
Collector `filelog`/앱 로그 appender로 `trace_id`가 붙은 로그를 `/v1/logs`로 받아 트레이스 상세에서 "이 요청의 로그" 표시. 로그 도메인(`devdesign_log-domain.md` 예정)과 저장소를 공유해야 하므로 **그 설계 이후**. 여기선 수신 경로·`trace_id` 인덱스만 예약.

---

## 7. 데이터 모델 — 통합 정본 (v3.1, 코덱스 B7: 테이블·보존·인덱스·삭제를 한 곳에)

공통 규칙: 시각 NOT NULL·DEFAULT 없음(V30 교훈) · enum은 varchar · 서비스 참조는 `service_id`(bigint FK) + 외부 노출은 `service_uid`(UUID) · 파티션 테이블은 일 단위, 배치가 D+2까지 선생성·보존 초과 DROP · 서비스 삭제 = 하위 전부 CASCADE(파티션 테이블은 배치 삭제).

| 마이그레이션 | 테이블 | 핵심 컬럼 / 키 | 보존 | 인덱스 |
|---|---|---|---|---|
| **V38 (P1)** — v3.2: 최신이 V37(`asset_version`)이라 번호 재조정. 이하 V37→V39·V38→V40·V39→V41 | `apm_service` | `service_uid UUID UNIQUE`, `service_name`, `env`, `name_norm`, `env_norm`, `display_name`, `state`, `apdex_t`, `slow_threshold_ms`, `tags text[]`, `owner`, `first/last_seen_at`, `hidden_at` — **UNIQUE(name_norm, env_norm)** | 영구(자동 숨김 TTL 후 삭제) | state, last_seen_at |
| | `apm_instance` | `service_id`, `instance_id`, `version`, `host_name`, `first/last_seen_at`, `k8s_pod`, `k8s_node`(P4) — UNIQUE(service_id, instance_id) | 미수신 30일 후 삭제 | (service_id, last_seen_at) |
| | `apm_receive_token` | `token_hash`, `label`, `kind`(COLLECTOR/RUM P4), `scopes`, `last_seen_at`, `revoked_at`, `created_by` | 영구 | token_hash UNIQUE |
| | `apm_collector` | `token_id`, `collector_instance_id`, `version`, `last_seen_at`, `queue_size`, `send_failed_total`, `sampling_dropped_total` | 영구 | |
| | `apm_hist_bounds` | `bounds double[] UNIQUE`, `family` | 영구 | |
| | `apm_metric_1m` (파티션) | `service_id`, `instance_id`, `metric`, `dims_hash`, `dims jsonb`, `bucket_start`, `count`, `sum`, `min`, `max`, `hist_counts int[]`, `bounds_id`, `exemplar_trace_id` — **PK(service_id, instance_id, metric, dims_hash, bucket_start)** | 7일 | (service_id, metric, bucket_start) |
| | `apm_metric_5m` / `_1h` (파티션) | 위와 같되 `instance_id` 없음(서비스 합산) | 30일 / 400일 | (service_id, metric, bucket_start) INCLUDE(dims_hash) |
| | `apm_ingest_drop_stat` | `token_id`, `reason`(NOT_ALLOWLISTED/ROUTE_OVERFLOW/REBUCKETED/UNKNOWN_SERVICE/PENDING), `metric_name`, `count`, `last_seen_at` | 30일 롤링 | |
| | `apm_pending_service` | `service_name`, `env`, `first_seen_at`, `sample_resource jsonb` — APPROVE 모드 대기열 | 승인/거절 시 삭제 | |
| | `apm_alert_rule` | `rule_uid UUID`, `service_id NULL=전역`, `kind`, `threshold`, `window_min`, `enabled`, `zbx_itemid`, `zbx_triggerid`, `drift`, `synced_at` | 영구 | |
| | `apm_alert_event` | `rule_id`, `service_id`, `fired_at`, `resolved_at`, `value`, `zbx_eventid` | 400일 | (service_id, fired_at) |
| | `apm_setting` | 등록 모드·마스킹 opt-in·기본 임계·TTL 등 키-값 | 영구 | |
| **V37 (P2)** | `apm_span` (파티션) | `trace_id bytea`, `span_id`, `parent_span_id`, `service_id`, `name`, `kind`, `start_ts`, `duration_ns`, `status`, `attrs jsonb`, `events jsonb`, `links jsonb` — PK(trace_id, span_id) | 7일 | (service_id, start_ts), (trace_id), attrs GIN(jsonb_path_ops) |
| | `apm_trace_summary` (파티션) | `trace_id`, `root_service_id`, `root_name`, `start_ts`, `duration_ns`, `error`, `span_count`, `service_ids int[]`, `sampled_reason` | 7일 | (root_service_id, start_ts), (root_service_id, duration_ns DESC) |
| | `apm_service_edge_5m` (파티션) | `from_service_id`, `to_kind`(SERVICE/DB/HTTP/QUEUE), `to_ref`, `bucket_start`, `count`, `error_count`, `hist_counts`, `bounds_id` | 30일 | (from_service_id, bucket_start) |
| | `apm_error_group` | `service_id`, `fingerprint`, `exception_type`, `message_norm`, `first/last_seen_at`, `count_total`, `sample_trace_id`, `sample_stack text` | 마지막 발생 90일 후 삭제 | (service_id, last_seen_at) |
| | `apm_error_group_1h` (파티션) | `group_id`, `bucket_start`, `count`, `endpoint_counts jsonb` | 90일 | |
| | `apm_db_query_group` | `service_id`, `fingerprint`, `db_system`, `query_norm text`, `first/last_seen_at`, `sample_trace_id` | 마지막 90일 | |
| | `apm_db_query_group_5m` (파티션) | `group_id`, `bucket_start`, `count`, `sum`, `hist_counts`, `bounds_id`, `error_count` | 30일 | |
| | `apm_dependency_5m` (파티션) | `service_id`, `target`(server.address), `bucket_start`, `count`, `error_count`, `timeout_count`, `hist_counts`, `bounds_id` | 30일 | |
| | `apm_deployment` | `service_id`, `version`, `detected_at`, `source`(AUTO/WEBHOOK), `rollout_pct`, `meta jsonb` | 400일 | (service_id, detected_at) |
| **V38 (P3)** | `apm_slo` | `slo_uid`, `service_id`, `sli_kind`(AVAILABILITY/LATENCY), `target`, `window_days`, `latency_threshold_ms`, `zbx_*` | 영구 | |
| | `apm_slo_snapshot` | `slo_id`, `day`, `good`, `total`, `budget_remaining`, `burn_1h`, `burn_6h` | 400일 | |
| | `apm_synthetic_binding` | `service_id`, `zbx_httptestid`, `label` — UNIQUE(zbx_httptestid) | 영구 | |
| | `apm_messaging_5m` / `apm_job_run` | 큐·토픽 집계 / 배치 실행 이력(`job_name`, `start`, `duration`, `status`, `trace_id`) | 30일 / 90일 | |
| | `apm_report_snapshot` | 리포트 체계 편입(기존 리포트 테이블 규약) | 기존 정책 | |
| **V39 (P4)** | `apm_log` (파티션) | 로그 도메인 설계와 합의 후 확정 — 최소 `trace_id`, `span_id`, `service_id`, `ts`, `severity`, `body`, `attrs` | 7일 | (trace_id), (service_id, ts) |
| | `apm_rum_page_5m` / `apm_rum_token` | 페이지 그룹 집계 / 공개 RUM 토큰(§15) | 30일 / 영구 | |

---

## 8. API·화면·통합

### 8.1 API (`/apm/**`, 전부 Feature.APM)
권한 표기: 🅐 관리자 · 🅞 운영자 이상(읽기). `{uid}`는 `service_uid`. 시계열 EP는 공통 `from&to&step`(step 미지정 시 창 길이로 자동).

| 구분 | EP | P | 권한 |
|---|---|---|---|
| 서비스 | `GET /apm/services/overview` · `GET /apm/services/{uid}` · `PUT /apm/services/{uid}`(display/tags/owner/apdex_t/slow_threshold/hidden/host 수동 매핑) · `DELETE`(숨김 후 삭제) · `GET .../instances` · `GET /apm/services/pending` · `POST /apm/services/pending/{id}/approve|reject`(APPROVE 모드) · `GET /apm/services/unknown`(이름 없는 앱) | 1 | 🅞 / 🅐(PUT·DELETE·승인) |
| RED·런타임 | `GET /apm/services/{uid}/red-series` · `GET .../endpoints`(route 표, 정렬·페이지) · `GET .../endpoints/{routeHash}/series` · `GET .../status-codes` · `GET .../active-requests` · `GET .../runtime?family=jvm|dotnet|node|python|go` · `GET .../pool` · `GET .../instances/{id}/series` | 1 | 🅞 |
| 알람 | `GET/POST/PUT/DELETE /apm/alert-rules` · `GET /apm/services/{uid}/alert-rules` · `POST /apm/alert-rules/preview`(규칙+기간 → 시계열+발화 시뮬레이션) · `GET /apm/alert-events?service&from&to` · `POST /apm/alert-rules/{id}/resync`(드리프트 해소: OURS/THEIRS) · `GET /apm/alert-rules/zabbix-status`(호스트 그룹·액션 진단) | 1 | 🅐(쓰기) / 🅞(읽기) |
| 수집기 | `GET /apm/receive-tokens` · `POST /apm/receive-tokens`(원문 1회 반환) · `DELETE /apm/receive-tokens/{id}`(회수) · `GET /apm/collectors` · `GET /apm/collectors/{id}/series`(수신량·큐·실패) · **`POST /apm/collector-config`**(token_id+옵션 → yaml, no-store) · `GET /apm/install-guide?os=&stack=` · `GET /apm/ingest/recent?token_id`(60초 검증) · `GET /apm/ingest/drops` · `GET/PUT /apm/settings`(등록 모드·마스킹 opt-in·TTL) | 1 | 🅐 |
| 수신 | `POST /apm/otlp/v1/metrics` · `/v1/traces`(P2) · `/v1/logs`(P4) · `POST /apm/rum/v1/traces`·`/metrics`(P4, §15 공개 토큰) | 1·2·4 | 토큰 |
| 트레이스 | `GET /apm/traces?service&route&status&minMs&maxMs&attr=k:v&from&to`(목록) · `GET /apm/traces/scatter?…`(다운샘플 점) · `GET /apm/traces/{traceId}`(트리+크리티컬 패스) · `GET /apm/traces/{traceId}/flame` · `POST /apm/traces/compare`(두 trace) · `GET /apm/traces/{traceId}/logs`(P4) | 2 | 🅞 |
| 서비스 맵 | `GET /apm/service-map?from&to&env` · `GET /apm/service-map/edges/{from}/{to}/series` · `GET/PUT /apm/service-map/layout`(사용자별) | 2 | 🅞 |
| 에러 | `GET /apm/errors?service&from&to`(그룹 표, 전 서비스) · `GET /apm/errors/{groupId}`(스택·엔드포인트·예시 trace) · `GET /apm/errors/{groupId}/series` · `GET /apm/errors/treemap` | 2 | 🅞(스택 원문 🅐 또는 설정) |
| DB | `GET /apm/db/queries?service&system&from&to` · `GET /apm/db/queries/{groupId}` · `GET .../series` · `GET /apm/db/slow-series` · `GET /apm/db/systems`(sankey) | 2 | 🅞(SQL 원문 열람 정책 동일) |
| 외부 호출 | `GET /apm/dependencies?service&from&to` · `GET /apm/dependencies/{target}/series` · `GET /apm/dependencies/sankey` | 2 | 🅞 |
| 배포 | `GET /apm/services/{uid}/deployments` · **`POST /apm/services/{uid}/deployments`**(CI/CD 웹훅, 토큰 인증: 수신 토큰 scope `deploy`) · `GET /apm/deployments/{id}/compare`(전후 1h) · `GET /apm/deployments/{id}/new-errors` | 2 | 🅞 / 웹훅 토큰 |
| SLO | `GET/POST/PUT/DELETE /apm/slos` · `GET /apm/slos/{uid}`(버짓·번 레이트·캘린더) · `GET /apm/slos/{uid}/series` | 3 | 🅐(쓰기) |
| 합성 감시 | `GET /apm/synthetics`(Zabbix httptest 목록+결과) · `POST/PUT/DELETE /apm/synthetics/{httptestid}` · `GET .../results?from&to`(단계별) · `GET .../calendar` · `POST /apm/services/{uid}/synthetics/bind|unbind` · `GET /apm/synthetics/proxies` · `GET /apm/synthetics/error-catalog` | 3 | 🅐(쓰기·자격증명) / 🅞 |
| 메시징·배치 | `GET /apm/messaging/destinations` · `GET .../{dest}/series` · `GET /apm/jobs` · `GET /apm/jobs/{name}/runs` · `GET /apm/jobs/timeline?from&to` | 3 | 🅞 |
| 리포트·위젯·AI | 리포트 체계 EP 재사용(`/reports?type=APM_WEEKLY`) · `GET /home/widgets/apm-*`(위젯 3) · AI 툴은 위 EP 프록시 | 3 | 기존 |
| RUM | `GET /apm/rum/pages?from&to` · `GET /apm/rum/pages/{groupId}` · `GET /apm/rum/vitals` · `GET /apm/rum/breakdown?by=browser|os|geo` · `GET/POST/DELETE /apm/rum/tokens` · `PUT /apm/rum/origins` | 4 | 🅞 / 🅐(토큰·origin) |
| 로그 | `GET /apm/logs?service&trace_id&severity&from&to` · `GET /apm/logs/histogram` | 4 | 🅞 |
| 진단 | `GET /apm/diagnostics/bundle`(수집기 상태·최근 수신 샘플 마스킹·설정 마스킹본 zip) | 3 | 🅐 |

전역 관례(200+바디 code), OTLP·RUM 수신 경로만 실제 HTTP 상태. 전 EP `FeatureInterceptor(APM)`.

### 8.2 화면 (`/application-monitoring`)
- **목록**: 서비스 카드/테이블(상태·24h 가용성·p95·오류율·rps·인스턴스 수·마지막 수신). 필터 env/tag/hidden. **빈 상태 = 온보딩**: "수집기 설정 만들기 → 앱에 한 줄 → 60초 안에 여기 나타납니다" + 실시간 수신 대기 표시.
- **상세** 탭: 개요(신호 4종 스파크라인·최근 알람) · 엔드포인트(route 표, 정렬 p95/오류/호출수) · 런타임(JVM/풀/프로세스) · 의존(외부 호출) · 트레이스(M2) · 인스턴스 · 설정(표시명·태그·알람 규칙).
- **수집기**(설정 성격, 서비스 밖): 토큰 발급·Collector 상태·yaml 생성·스택별 설치 가이드(에이전트 설치 가이드 패턴)·"최근 60초 수신" 검증 버튼·버린 메트릭 목록.
- **서비스 맵**(M2): React Flow 재사용.
- 홈 위젯 "애플리케이션 상태" +1, 도움말 +3(목록·상세·수집기), i18n `apm.*`, 3단 브레드크럼 `replacePathBreadcrumb`.

### 8.3 문서
`준비-중인-모니터링.md`에서 APM 분리 → `애플리케이션-모니터링.md` + `수집기-설치.md`(Collector). "Prometheus·Datadog 필요" 문구 삭제. 소개서 로드맵의 "Datadog: APM [예정]"은 M4로 정정.

### 8.4 moveseye-ai
`screens.json` +1(탭 가이드 포함), 툴 `apm_list_services`·`apm_service_status`·`apm_slow_endpoints`·`apm_trace_lookup`(M2)·`apm_collector_status`. BE REST 프록시, BE 무수정.

---

## 9. 비범위·유예
- **Zabbix 웹 시나리오·프로세스/포트·JMX 템플릿 래핑(v1 M1)** — 수집 경로로서는 제외(APM 수집기는 OTel 단일). 단 **합성 감시(URL 두드리기)는 AWS·Elastic·WhaTap 모두 APM 구성요소로 꼽는 항목**(§13)이고 데모 Zabbix에 22건 실사용이 있다 → "M1.5 합성 감시 탭"으로 **격상 후보**(Q15): APM 서비스 상세에 Zabbix 웹 시나리오를 바인딩해 "밖에서 본 가용성"을 나란히 보여준다. 수집은 여전히 Zabbix, 화면만 APM. 결정 전까지 유예.
- RUM(브라우저 실사용자), 프로파일링, 자체 SDK, 상용 APM 에이전트 호환, 알림 채널 신설, 트레이스 전량·무기한 보존.
- Collector 자체를 우리가 **운영**(업그레이드·모니터링 대행)하는 것 — 설정·상태 가시화까지만.
- Collector의 Prometheus 스크레이프·hostmetrics로 **인프라 메트릭까지 대체**하는 것 — 수집 엔진 스텝 6과 얽히므로 여기서 결정하지 않음(§11 Q11).

---

## 10. 리스크·착수 시 실측
| # | 항목 | 확인 |
|---|---|---|
| R1 | ✅ 2026-08-31 완료 — Collector `otlphttp` `encoding: json` 동작·히스토그램 버킷·exemplar 포함 | `./r1_apm-collector-roundtrip.md` (R11·R12 Java·R14 Collector 측 포함) |
| R2 | tail 샘플링 메모리(decision_wait 동안 스팬 보관) | 부하 시 Collector RSS 실측, `memory_limiter` 값 확정 |
| R3 | Postgres 볼륨·파티션 | V36 파티션 + 롤업 배치 실측(§4.4 어림 검증) |
| R4 | route 카디널리티 | 500 상한 + `__other__` + 폐기 카운터 |
| R5 | STALE 오진(앱 정상인데 Collector 큐 적체) | §3.4 수집기 자기 메트릭으로 원인 분리 |
| R6 | 인바운드 `/apm/otlp/**` nginx 미노출 | 설치 가이드 location + 검증 버튼 |
| R7 | `service.name` 미설정 → `unknown_service:*` | 화면 경고 + 가이드 유도 |
| R8 | 라이선스 만료 403 시 Collector 재시도 폭주 | `max_elapsed_time` 상한 + 만료 안내에 수집기 중지 절차 |
| R9 | Windows 서비스 등록·한글 경로 | 설치 가이드 실측(에이전트 설치 가이드 교훈) |
| R10 | ✅ 2026-08-31 완료 — Zabbix 7.0 `history.push`로 트래퍼 아이템에 값 적재(§4.5-A 전제) | 데모 Zabbix round-trip 성립(미디어 도달은 액션이 없어 미확인 — 고객 액션 몫). 결과 `./r10_apm-zabbix-history-push.md` |
| R11 | Collector의 401/403/413/429/5xx별 재시도·file_storage 잔존·재기동 동작(§4.1 만료 정책 전제) | BE를 각 코드로 응답하게 두고 Collector 로그·큐 디렉터리 관찰 |
| R12 | `http.server.active_requests`·풀·`db.client.operation.duration`이 Java/.NET/Node/Python 자동계측 기본 조합에서 실제 수집되는지 | 스택별 샘플 앱 4개 |
| R13 | 스택별 "코드 수정 0" 메서드 계측 옵션 존재 여부(.NET/Node/Python) | 문서+샘플 앱 |
| R14 | 마스킹 체인이 SQL·예외·URL·헤더를 Collector·BE 양쪽에서 실제로 제거하는지 | PII 심은 샘플 요청 → DB 원문 grep 0건 |
| R15 | Windows 서비스 설치·업그레이드·파일 권한·자기 메트릭 scrape·`otelcol_*` 수신 | 설치 가이드 완주 |

---

## 11. 미결 (사용자 확정 대기)
| # | 질문 | 추천 |
|---|---|---|
| **Q1** | APM 전부 PREMIUM(`Feature.APM`)? | 예 — 문서·메뉴와 정합 |
| **Q5** | M2(트레이스) 착수 조건 | M1 실사용 1곳 이후(샘플링 값은 실데이터로) |
| **Q6** | 외부 APM 읽기 연동(M4) 로드맵 포함 | 표기만, 설계 보류 |
| **Q7** | 만료·미보유 시 수신 | 403 거부(P17) |
| **Q8** | 서비스 ↔ 자산 | 링크만 |
| **Q9** | Redis·Kafka는 APM | §2.4대로 |
| **Q10** | 착수 순서(GPU→DB→APM vs APM 먼저) | 사용자 결정 |
| **Q11(신규)** | Collector 바이너리를 **설치 번들에 동봉**할지, 다운로드 링크만 줄지 | 번들 동봉(폐쇄망 고객·버전 고정) — 설치 번들 자체가 아직 없으므로(감사 결과) 설치 번들 과제와 함께 |
| **Q12(신규)** | 에이전트 → BE **직송**(Collector 없이)도 허용할지 | **불허**. json 변환·샘플링·큐잉이 전부 Collector에 있으므로 "Collector 필수"가 단순하다 |
| **Q13(신규)** | Collector로 Prometheus/hostmetrics까지 받아 수집 엔진 스텝 6(Prometheus 어댑터)을 대체할지 | 지금 결정 안 함 — 스텝 6 재개 시 재논의 트리거로 등록 |
| **Q14(신규)** | APM 알람 배달 경로 — A. Zabbix `history.push`+트리거 경유(Slack/Teams/Jandi 공짜) / B. 자체 웹훅 채널 | **A** (§4.5) |
| **Q15(신규)** | 합성 감시(Zabbix 웹 시나리오)를 M1.5로 APM 상세에 편입할지 | **편입** — 경쟁 정의 3곳 모두 APM 요소로 꼽음, 수집 코드 0(Zabbix) |
| **Q16(신규)** | 배포 마커·SLO 목표(§13-2·7 저비용 보강)를 M1에 넣을지 | **M1** — `service.version` 변화 감지 + 가용성 목표 % 한 칸, 규모 소 |
| **Q17(신규)** | 서비스 단위 데이터 권한(사용자 그룹 → 볼 수 있는 서비스) | 1차는 **APM 전체 = 관리자+운영자 역할**로 단순화, 서비스 권한은 2차 |
| **S1~S5(v3, 동반 문서 §5)** | 메뉴 노출 수(13 vs 상위 6) · 워터폴 직접 구현 · 맵 레이아웃 dagre · RUM 시점 · 배치 스팬 규약 | 상위 6 노출 · 직접 구현 · dagre · P4 유지 · 우리 규약 |
| ~~Q2~~ Browser-Test · ~~Q3~~ protobuf · ~~Q4~~ 저장소 | v2에서 소멸(범위 밖 / Collector가 json 변환 / PG 확정) | — |

---

## 12. 구현 단계 (Q 확정 후 v3에서 상세화)
| 단계 | 산출물 | 검증 |
|---|---|---|
| M1-a 파이프라인 | `otel/` 승격+버킷 보존, `/apm/otlp/v1/metrics`, 토큰, 자동 등록, V36, Collector yaml 생성기 | R1 self-monitoring round-trip |
| M1-b 저장·롤업·알람 | 1m/5m/1h, 배치 2종, 허용목록, `ApmAlertService` | 볼륨 실측(R3) |
| M1-c 화면 | 목록·상세·수집기·설치 가이드·홈 위젯·도움말·AI 가이드 | 브라우저 E2E |
| M2 | traces 수신·파티션·워터폴·서비스 맵·exemplar 점프 | 부하 시 R2 |
| M3 | logs 수신·trace_id 상관 | 로그 도메인 설계 후 |

## 13. 시장 체크리스트 대조 (2026-08-26 추가 — 사용자 제공 7항목 + AWS·Elastic·WhaTap 정의)

> 근거: WhaTap "APM 솔루션 비교 가이드"(체크리스트 원문·핵심 지표 6종), AWS "APM이란"(기능 13종), Elastic "APM이란"(데이터 유형·OTel·평가 기준). **고객이 이 표로 우리를 채점한다**고 가정하고 v2 설계를 대조했다.

### 13.1 체크리스트 7항목

| # | 항목 | v2 설계의 답 | 판정 | 보강(반영 위치) |
|---|---|---|---|---|
| 1 | **기술 스택 호환** — Java·Node·Python·.NET·Go / 클라우드·온프레·하이브리드 | OTel 자동계측: Java·.NET·Node·Python·PHP·Ruby 무코드, Go는 SDK 수동(§3.3). Collector 게이트웨이는 망 어디든 → 온프레·클라우드·하이브리드 동일 | ✅ 강점 | Go·C++는 "수동 계측 가이드"로 정직 표기. eBPF 무코드 계측(OTel eBPF Instrumentation)은 후보로만 |
| 2 | **모니터링 범위** — APM만? 서버·DB·K8s 통합? | 서버·네트워크(Zabbix)·클라우드(AWS)·자산·비용·맵·Zabbix 관리가 **이미 한 제품**, APM은 `host.name`으로 서버 화면과 상호 링크(§2.1), DB 모니터링은 2단계 | ✅ 서버·DB / 🔴 **K8s 없음** | K8s는 수집 엔진 스텝 6(보류)과 얽힘 — Collector `k8s_cluster`/`kubeletstats` receiver가 지름길이라 Q13 재논의 트리거에 추가. 소개서에 "K8s 미지원" 명시 |
| 3 | **확장성** — 에이전트·대상 유연 확장 | 앱 추가 = 한 줄, 서비스 자동 등록(§4.2). 저장은 PG 파티션·롤업, 승격 조건 수치화(§4.6) | 🟡 | **목표 규모를 명시**: 1차 목표 서비스 ≤50·route ≤200·트레이스 일 ≤20M. 그 위는 ClickHouse 승격 — 설치형에서 "유연"의 상한을 숨기지 않는다 |
| 4 | **비용 구조** — 호스트/사용량 기반? 확장 시 증가폭? 무료 체험·POC? | 에디션 정액(기간제/영구), `maxHosts` 미사용·데이터량 과금 없음 → **라이선스 비용은 확장 시 불변**. 체험은 `durationDays=30` PREMIUM 키 발급으로 가능(TRIAL enum 없어도 됨) | ✅ 차별점 | 영업 문구(v3.1 정정, 코덱스 A8): "서비스·트래픽이 늘어도 **라이선스** 비용 불변 — 단 수집기·DB 서버 자원(운영비)은 고객 부담으로 증가"라고 **둘을 갈라** 쓴다. "비용 0 증가"라는 절대 표현은 쓰지 않는다. POC 키 발급 절차를 발급 도구 README에 1절 추가 |
| 5 | **도입 편의성** — 설치·초기 설정·러닝커브 | Collector 1바이너리 + yaml 생성기 + 앱 한 줄 + "60초 수신 검증" + 자동 등록 + 화면 도움말·AI 가이드(§8.2) | 🟡 | 상용(WhaTap "에이전트 하나")보다 **Collector 한 단계가 더 있다** → Q11 번들 동봉 + Windows 서비스 등록 스크립트로 "설치 프로그램 1개" 체감으로 맞춘다 |
| 6 | **기술 지원** — 한국어·국내 지원·즉시 대응 | 국내 벤더·한국어 UI/도움말. 제품이 할 몫 = **진단 가시화**(수집기 탭·폐기 카운터·라이선스 진단) | ✅ 조직 / 🟡 제품 | "진단 번들 내보내기"(수집기 상태·최근 수신 샘플·버전·설정 마스킹본 zip) 후보 — M1-c에 소(小)로 편입 검토 |
| 7 | **기존 도구 연동** — CI/CD·Slack/Teams·협업 도구 | 🔴 조사 결과 자체 푸시는 **이메일뿐**, Slack/Teams/Jandi는 Zabbix 미디어 타입 | 🔴 갭 → 해소안 | **§4.5-A Zabbix `history.push` 경유**로 Slack/Teams/Jandi/에스컬레이션을 그대로 씀(Q14). CI/CD는 **배포 마커**: `service.version` 변화를 자동 감지해 차트에 세로선(코드 0, Q16) + `POST /apm/services/{id}/deployments` 웹훅(파이프라인이 호출) |

### 13.2 경쟁 정의의 기능 목록 대조 (AWS 13종 · WhaTap 핵심 지표 6종 · Elastic)

| 기능 | v2 | 비고 |
|---|---|---|
| 응답시간·처리량(TPS)·오류율 | ✅ M1 | 히스토그램 버킷 기반 p50/p95/p99 |
| 트랜잭션(분산) 추적 | ✅ M2 | tail 샘플링·워터폴·exemplar 점프 |
| **액티브 트랜잭션**(WhaTap) | ✅ 추가 | `http.server.active_requests` 허용목록 편입(§4.3) |
| **DB 연결·쿼리 성능**(WhaTap) | ✅ 추가 | 풀 메트릭 + `db.client.operation.duration`(§4.3) + 스팬 `db.query.text`(M2, 마스킹) |
| 인스턴스 수·스케일 | ✅ M1 | `apm_instance` |
| 가동 시간·**SLA/SLO** | 🟡 | 가용성 %는 있음 → **SLO 목표 한 칸 + 위반 알람**(Q16, 소) |
| **합성 모니터링** | 🟡 유예 → 격상 후보 | Zabbix 웹 시나리오 바인딩(Q15). 세 정의 모두 APM 요소로 꼽음 |
| RUM(실사용자) | ❌ 비범위 | 명시적으로 안 함(§9). 소개서에 표기 |
| 서비스 종속성 맵 | ✅ M2 | |
| 인프라·컴포넌트 심층(CPU·메모리·네트워크) | ✅ 기존 제품 | 서버 모니터링 링크 |
| 로그 상관 | 🟡 M3 | 로그 도메인 이후 |
| 이상 탐지·근본 원인(AI/ML) | 🟡 | `moveseye-ai`에 APM 툴 노출(§8.4) → 대화형 원인 좁히기. 통계적 이상 탐지 엔진은 안 만든다 |
| 개방형 표준·개방형 데이터(Elastic) | ✅ 강점(표현 주의) | OTel 네이티브 — **계측·수집 계층에 락인이 없다**(Collector exporter 하나 추가로 다른 백엔드에 동시 전송 가능). 단 우리 집계·알람 규칙·화면·보존 데이터는 우리 형식이므로 "락인 없음"을 절대 표현으로 쓰지 않는다(v3.1, 코덱스 A8). 데이터 내보내기(CSV·JSON, 프리미엄 P16 원칙)는 P3 리포트와 함께 제공 |
| 배포 옵션(SaaS/하이브리드) | 설치형 단일 | 정직 표기 |
| 보안·암호화·세분화 권한 | 🟡 | 토큰 회수·마스킹은 있음. **서비스 단위 데이터 권한**(호스트 그룹 권한 모델처럼)은 미설계 → Q17 |

### 13.3 정직하게 못 하는 것 (소개서에 그대로 쓸 문장)
- Kubernetes 통합 모니터링 없음(로드맵), RUM 없음, 코드 레벨 프로파일링 없음, SaaS 없음.
- 1차 목표 규모: 서비스 50·트레이스 일 2천만 이하. 그 이상은 저장소 승격 필요.

---

## 14. 핵심 지표 6종 커버리지 (2026-08-26 v3 — 사용자 필수 요건)

> 사용자 제공 표(응답 시간·TPS·에러율·트랜잭션 추적·액티브 트랜잭션·DB 연결/쿼리)는 **전부 필수**. 각 지표가 어느 OTel 시그널에서 나와 어느 화면에 어떤 차트로 보이는지, 무엇이 자동이고 무엇이 고객 설정인지 대조한다.

| 핵심 지표 | OTel 출처(자동계측 기본 제공 여부) | 저장·계산 | 화면·차트(동반 문서 §3) | Phase | 주의 |
|---|---|---|---|---|---|
| **응답 시간** | `http.server.request.duration` 히스토그램 — Java/.NET/Node/Python 자동 ✅ | 1m 버킷 → p50/p95/p99(선형 보간), Apdex(T 설정) | 서비스 개요 C1 3선+밴드, 분포 히트맵 C5, 엔드포인트 표, 산점도 C6 | P1 (산점도 P2) | route 없는 프레임워크는 `__other__`로 접힘 |
| **처리량(TPS)** | 같은 히스토그램의 `count`/Δt ✅ (+`rpc.server.duration` gRPC) | 1m count → rps/TPS, 5m·1h 롤업 | 개요 StatCard C17, 서비스 C1 area, 엔드포인트 표 | P1 | 배치·메시징 처리량은 P3(`messaging.*`) |
| **에러율** | status_code 5xx 비율 ✅ + 스팬 `status=ERROR`(P2) | 1m 5xx/전체, 임계 알람 | C1 line+임계·배포 markLine, 상태코드 stacked C2, 예외 그룹(P2) | P1 (그룹 P2) | 4xx는 기본 제외(설정으로 포함 가능) — 클라이언트 오류를 서비스 오류로 오판 방지 |
| **트랜잭션 추적** | OTLP traces — 자동계측이 **프레임워크 경계**(컨트롤러·DB·HTTP 클라이언트·메시징) 스팬을 만든다 ✅ | tail 샘플링(오류·느림 100%), `apm_span`, 크리티컬 패스 | 워터폴 C7(직접 구현), 플레임 C8, 트레이스 비교 | P2 | 🔴 **"코드 수준(메서드 단위)"은 자동이 아니다** — 자동계측은 프레임워크 호출 경계까지. **Java**는 agent 설정 `otel.instrumentation.methods.include=com.acme.Svc[methodA,methodB]`로 **코드 수정 0**으로 메서드 스팬 추가; `@WithSpan`은 의존성·코드 변경이 따르므로 "코드 수정 0"과 구분해 안내(v3.1 코덱스 A9). **.NET/Node/Python은 동등한 선언형 옵션이 있다고 일반화하지 않는다** — 스택별 가이드에서 각각 확인해 적는다(R13 실측) |
| **액티브 트랜잭션** | `http.server.active_requests` updowncounter — **시맨틱 컨벤션상 opt-in**, 언어·버전별 자동 제공은 보장 없음(v3.1) | 1m gauge(마지막값/최대) | 서비스 개요 C1 area + 급증 알람 규칙(전 5분 평균 ×N) | P1 | 미수신 시 P2에서 서버 스팬 in-flight 수로 근사, 화면 "계측 미제공" 배지. R12 실측 |
| **DB 연결·쿼리 성능** | 풀: `db.client.connection.count/pending_requests/wait_time`(HikariCP·.NET 자동 ✅) · 쿼리: `db.client.operation.duration` + 스팬 `db.query.text`·`db.system` ✅ | 풀 gauge/hist 1m · 쿼리 그룹(SQL 정규화·p95·총시간·슬로우 임계) | 풀 C1 stacked(active/idle/pending)+wait p95 · 쿼리 그룹 표·treemap C13·슬로우 추이 C1·SQL 뷰어 C16·예시 트레이스 | 풀 P1 · 쿼리 그룹 P2 | 🔴 `db.query.text`는 기본 마스킹(리터럴 `?`)이 OTel 권장이라 **파라미터 값은 안 보인다** — 원문 필요 시 고객이 에이전트 옵션으로 해제(개인정보 경고). 슬로우 임계는 서비스 설정(기본 1s) |

**추가로 같은 급으로 다루는 지표(경쟁 정의 합집합)**: 가용성/SLO(P3)·외부 의존 지연(P2)·JVM/런타임(P1)·배포 영향(P2)·Web Vitals(P4).

**DB 쿼리 원문의 마스킹 계약(v3.1, 코덱스 B2)**: 에이전트 기본 마스킹(리터럴 `?`) → Collector `transform/sql`(2중) → BE 저장 시 길이 4KB 절단. 원문 보존은 설정 opt-in(관리자, 감사 로그, 화면 경고 배너). 예외 메시지·스택트레이스도 `redaction/pii` 통과 후 저장, 화면 열람은 권한 정책(§4.1).

**6종 전부의 공통 전제**: 앱이 OTel 자동계측으로 Collector에 데이터를 보내야 한다. 계측이 없는 앱(레거시·서드파티 바이너리)은 **합성 감시(P3)** 로 응답 시간·에러(HTTP 코드)·가용성만 본다 — 처리량·액티브·DB·추적은 불가. 이 한계를 서비스 목록의 "계측 없음" 배지로 드러낸다.

---

## 15. RUM 보안 계약 (v3.1 신설 — 코덱스 B6, P4에서 구현)

브라우저는 신뢰할 수 없는 클라이언트다. Collector 수신 토큰을 브라우저에 넣으면 누구나 우리 파이프라인에 데이터를 밀어 넣을 수 있다.

| 항목 | 계약 |
|---|---|
| 토큰 | Collector 토큰과 **다른 종류**: `apm_rum_token`(공개 가능, 짧은 수명 없이 origin 바인딩, 회수 가능, scope=rum). 브라우저 스니펫에는 이것만 |
| 경로 | 브라우저 → **Collector 별도 receiver**(`otlp/rum`, 포트 분리) 또는 BE `/apm/rum/v1/*` 직접(Collector 없이) — P4에서 택1(기본: BE 직접, CORS·레이트리밋을 우리가 통제) |
| origin | 토큰별 `allowed_origins` 정확 매칭, CORS preflight, `Origin` 없는 요청 거부 |
| 제한 | 토큰별 rps·본문 크기·일 건수 상한, 초과 429 + 폐기 카운터 |
| 헤더 | `traceparent`·`tracestate`만 허용(프론트→백 연결), 나머지 헤더 속성 삭제 |
| PII | `url.query` 제거, `url.path`는 ID 패턴 `/\d+/` → `/{id}/` 정규화(페이지 그룹화 겸용), IP는 저장 안 함(지역은 국가 코드만), `enduser.id` 해시 |
| 동의·CSP | 스니펫 가이드에 쿠키 동의 연동 훅과 CSP `connect-src` 항목 명시 |
| 수신 데이터 | Web Vitals(LCP/INP/CLS/TTFB)·navigation/resource timing·JS 에러(스택 4KB 절단)·프론트 스팬만. 세션 리플레이·입력값 수집은 **하지 않는다** |

---

## 부록 A. 조사 명령 기록 (2026-08-26)
```
grep -n STATUS COLLAB.md                                       # SOLO-CLAUDE
cat license/domain/entitlement/Feature.java                     # APM = 3단계, 별도 설계서
sed -n 965,975p _workspace/features/auth-license/license/devdesign_premium-edition.md         # §7.4
grep -n APPLICATION_MONITORING moveseyee_fe/src/{constants/routes.ts,routes/routes.tsx,layouts/app/SideNav.tsx}
ls aimonitor/otel/ ; grep -n histogram aimonitor/otel/OtlpMetricsParser.java   # 재사용 대상, sum만 취함
grep -n protobuf build.gradle.kts engine-api/build.gradle.kts   # 0건 (v2: 유지)
ls db/migration | sort -V | tail -1                             # V35 → V36
python scratchpad/zbx_apm_survey.py / zbx_apm_survey2.py        # v1 근거(웹 시나리오 22·JMX 0건) — v2에선 §9 유예 근거로만
```
