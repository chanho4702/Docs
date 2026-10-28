# 검수 요청: APM(애플리케이션 모니터링) 설계 v3 — 설계 문서 검수

- 요청일: 2026-08-26
- 요청자: Claude (SOLO-CLAUDE, COLLAB.md §8)
- 성격: **코드 없음 — 설계 문서 2편의 검수.** 구현은 후일 착수(사용자: "일단 나중에 개발할 거고 이거 주력으로 갈 거니까").
- 대상 파일
  - `_workspace/designs/devdesign_apm.md` v3 — 아키텍처·파이프라인·저장·API·알람·라이선스·시장 체크리스트 대조(§13)·핵심 지표 6종 커버리지(§14)·미결 Q
  - `_workspace/designs/devdesign_apm-screens-wbs.md` v1 — 확대 범위·메뉴 13개·차트 프리미티브 18종 구현 가능성·메뉴별 차트 명세·WBS 80여 태스크·Phase별 어림

## 범위 (무엇을 정했나)

1. **수집 경로 = OpenTelemetry 단일**(사용자 결정). 앱 자동계측 → 고객 망 안 **OTel Collector 게이트웨이 1대**(우리는 yaml 생성기·설치 가이드 제공) → BE `/apm/otlp/v1/{metrics,traces,logs}` **json**(Collector `otlphttp encoding: json`) → Postgres(1m/5m/1h 롤업·일 파티션·스팬 7일). tail 샘플링·큐잉·속성 정리는 Collector.
2. 서비스 = 1급 엔티티, `service.name` 첫 수신 시 **자동 등록**.
3. 알람 배달: 제품 자체 푸시가 이메일뿐이라(조사 결과) **Zabbix 7.0 `history.push` → 트래퍼 아이템 → 자동 트리거 → Zabbix 액션/미디어**로 배달(추천안, R10 실측 전).
4. 주력 범위: 에러 그룹·DB 쿼리 그룹·외부 호출·메시징/배치·SLO·배포 전후 비교·합성 감시(Zabbix 웹 시나리오 편입)·RUM·K8s·리포트·AI 툴. Phase P1~P4, 어림 ~210 사람-일.
5. 차트: ECharts 5.6 내장으로 17/18 프리미티브 해결, **트레이스 워터폴 1건만 직접 구현**, 신규 의존 `@dagrejs/dagre`·`sql-formatter`(MIT 2개).
6. 핵심 지표 6종(응답시간·TPS·에러율·트랜잭션 추적·액티브 트랜잭션·DB 연결/쿼리) 전부 커버(§14) — 단 "코드 수준 추적"은 자동계측 기본이 아니라 에이전트 설정 한 줄 필요함을 명시.

## 의도 (버린 대안)

- 에이전트 → BE 직송(v1 A안) 버림: Java SDK가 protobuf만 지원해 BE 의존이 늘고, head 샘플링만 가능해 오류 트레이스를 놓친다. Collector 경유가 두 문제를 한 번에 없앤다.
- Zabbix 래핑을 APM 수집 경로로 쓰는 안(v1 M1) 버림: 사용자 결정. 단 웹 시나리오는 "합성 감시" 화면으로 P3 편입(경쟁 정의 3곳 모두 APM 요소로 꼽음).
- ClickHouse/Tempo 처음부터 도입 버림: 설치형(무도커·Windows) 제약. PG 우선 + 승격 조건(§4.6) 수치화.
- 자체 웹훅 알림 채널 신설 버림: Zabbix 배달 경유로 라우팅·에스컬레이션·억제를 재사용(래핑 원칙).
- `TracePort`를 `engine-api`에 두는 안(프리미엄 §7.4 문구) 버림: 트레이스는 우리가 저장소 주인이라 소스 중립 포트가 아님.

## 중점 확인 요청 (스스로 불안한 지점)

1. 🔴 **Collector `otlphttp` `encoding: json`에 의존하는 구조** — 이 옵션이 고정 버전에서 히스토그램 버킷·exemplar·스팬 이벤트까지 온전히 json으로 내보내는지 문서로만 확인했다(R1 실측 전). 만약 json 경로가 불완전하면 protobuf 디코더(Q3-A)로 되돌아가야 하고 BE 의존이 생긴다. **설계가 이 한 옵션에 과하게 기대고 있는지** 봐 달라.
2. 🔴 **Zabbix `history.push`로 알람 배달** — 7.0 신설 API를 근거로 했는데 트래퍼 아이템 전제·권한·프록시 경유 호스트에서의 동작을 실측하지 않았다. 대안(자체 웹훅)보다 정말 단순한지, "우리 규칙 → Zabbix 트리거 자동 동기화"가 드리프트(사용자가 Zabbix에서 트리거를 손대는 경우)를 어떻게 다룰지 설계가 비어 있다.
3. 🟡 **Postgres 시계열 용량 어림**(§4.4: 서비스 10×route 50×method 3×status 4 = 6,000행/분)이 현실적인지, 파티션+롤업만으로 90일 질의 1s가 가능한지. `dims jsonb`+`dims_hash` 자연키 설계의 함정.
4. 🟡 **서비스 자동 등록의 부작용** — 오타·임시 앱이 서비스로 계속 생기는 문제를 "숨김"만으로 막을 수 있는지. `service.name` UNIQUE와 env 분리(같은 이름 다른 env) 처리가 §2.1에 모호하다.
5. 🟡 **tail 샘플링 게이트웨이 1대 전제** — 고객이 Collector를 여러 대 두면 트레이스가 갈라진다. 설계는 §4.6 승격 조건으로 미뤘는데, P1부터 `loadbalancing` 2계층을 가이드에 넣어야 하는지.
6. 🟡 **라이선스 만료 시 OTLP 403**(Q7-A) — Collector가 재시도·디스크 큐로 버티다가 `max_elapsed_time` 뒤 데이터를 버린다. 30일 유예 기간의 데이터 손실이 프리미엄 P17 원칙과 맞는지, 아니면 "받되 저장 안 함"이 나은지.
7. 🟡 **WBS 어림(~210일)의 누락** — 특히 FE 워터폴(6.5 L)·서비스 맵(6.6 L)·수집기 화면(7.9 L)이 과소인지, 로그 도메인 의존(5.2)을 P4에 둔 것이 맞는지.
8. 🟢 §13 체크리스트 채점의 정직성 — "확장 시 비용 0 증가"·"락인 없음"을 강점으로 썼는데 과장인지. K8s·RUM·프로파일링 부재를 소개서에 그대로 쓰는 문장(§13.3)이 영업상 괜찮은지는 사용자 판단이지만, 기술적으로 틀린 주장이 있는지.
9. 🟢 §14 "코드 수준 추적은 자동이 아니다"(`otel.instrumentation.methods.include`) 서술이 정확한지 — Java agent 기준으로 썼고 .NET/Node는 동급 옵션을 확인하지 않았다.

## 검증 현황

- ✅ 코드베이스 실측: `Feature.APM`·FE 라우트/게이트/스텁·`aimonitor/otel` 파서(히스토그램 sum만)·BE protobuf 의존 0·Flyway V35·자체 알림 채널 = `EmailService`뿐(Slack/Teams는 Zabbix 미디어 타입 관리)·FE 차트 스택(ECharts 5.6, 사용 시리즈 line/bar/pie/gauge)·`@xyflow/react`·`InstanceTimeline`.
- ✅ 외부 실측: 고객 데모 Zabbix 7.0.6 — 웹 시나리오 22건 실사용, JMX 66아이템 수집 0건(Java Gateway 미구성), 템플릿 347.
- ✅ 참고 자료: WhaTap 비교 가이드(체크리스트 7·핵심 지표 6), AWS·Elastic APM 정의 페이지.
- ❌ **미검증(전부 문서 기준)**: R1 Collector json 경로 · R2 tail 샘플링 메모리 · R3 PG 볼륨 · R10 `history.push` · OTel Java SDK json 미지원 주장 · `http.server.active_requests`의 Node/Python 제공 여부 · Collector CORS(RUM) · 어림 공수.
- ❌ 코드 변경 없음, 빌드·테스트 해당 없음.

## 검수 결과 (Codex, 2026-08-26)

### (A) 중점 확인 9건 판정 표

| # | 판정 | 검수 의견 |
|---|---|---|
| 1 | 🔴 조건부 통과 | `otlphttp.encoding: json` 자체는 유효한 OTLP/HTTP Protobuf-JSON 옵션이다. 다만 SDK 일반 규격도 JSON 지원을 필수로 강제하지 않고, Collector 고정 버전의 JSON marshal 결과가 현재 `aimonitor/otel` 파서 확장 범위와 정확히 맞는지는 미확정이다. R1은 metrics만이 아니라 explicit/exponential histogram, bucket, exemplar, trace event/link, resource/scope, logs, gzip·4MB 초과를 모두 실제 round-trip 해야 한다. [OTLP exporter 규격](https://opentelemetry.io/docs/specs/otel/protocol/exporter/) |
| 2 | 🔴 조건부 통과 | Zabbix 7.0의 `history.push`는 실제 신설 기능이고, trapper item 또는 trapping-enabled HTTP agent item이 필요하다. API 권한 Allow/Deny와 감사 로그도 고려해야 한다. 다만 프록시 경유 호스트인지와는 무관하게 BE가 Zabbix Server API에 직접 push한다. “규칙→트리거 자동 동기화”의 소유권·삭제·수정 충돌·복구 정책이 비어 있으므로 R10 성공만으로 설계 확정은 불가하다. [Zabbix 7.0 문서](https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf) |
| 3 | 🔴 변경 필요 | §4.4의 6,000행/분 산식은 `instance_id` 축을 빼고 계산했다. 평균 10인스턴스면 즉시 60,000행/분이며, 런타임·풀·Collector 메트릭, 롤업 테이블도 빠져 있다. 90일 조회도 1h 롤업만으로 1초를 보장하지 않는다. `dims_hash` 단독 자연키는 충돌·canonical JSON·NULL/빈값 정규화 규칙이 없어 위험하다. |
| 4 | 🔴 변경 필요 | §2.1은 `service.name + deployment.environment`를 식별 근거로 쓰면서 `service_name UNIQUE`만 선언한다. 같은 서비스명이 dev/prod에 있으면 충돌한다. 숨김은 생성 억제가 아니므로 allowlist/승인 대기·자동 숨김 TTL·`unknown_service:*` 분리·서비스명/환경 canonicalization이 필요하다. |
| 5 | 🟡 조건부 통과 | trace 단위 affinity가 필요하다는 판단은 맞다. 단일 Gateway P1에는 2계층을 미리 설치할 필요는 없지만, P1 가이드에 “다중 Collector는 trace-id consistent hashing 없이는 불가”를 명시하고 HA 시 데이터 유실/중복 정책을 정해야 한다. `tail_sampling`의 `num_traces`, 예상 TPS, 저장 한도도 R2 측정값으로 고정해야 한다. |
| 6 | 🔴 변경 필요 | 403 뒤 Collector가 30분간 재시도·파일 큐로 버틴다는 전제는 부정확할 가능성이 높다. OTLP exporter는 일반적으로 403을 영구 실패로 분류해 재시도하지 않으며, `max_elapsed_time`은 라이선스 유예가 아니다. “받되 저장 안 함”도 라이선스 경계와 민감 데이터 처리 면에서 더 낫지 않다. 만료 전 사전 경고·Collector 중지/토큰 회수 UX·403 실제 동작 실측을 설계에 넣어야 한다. |
| 7 | 🔴 변경 필요 | ~210일은 과소 산정이다. 특히 C7 워터폴(가상화·키보드·접기·정렬·패널·성능), C9 맵, 수집기 설치/토큰/Windows 서비스/진단 UX가 각각 L을 넘어설 수 있다. P4 로그는 아직 존재하지 않는 로그 도메인 설계에 선행 의존하므로 현재 공수 합계에 넣을 수 없다. |
| 8 | 🟡 수정 권고 | “라이선스 비용 증가 0”은 제품 가격만 뜻할 때만 맞다. 수집기 CPU·디스크, Postgres 증설, ClickHouse 승격 운영비는 증가한다. “락인 없음”도 OTel 송신은 맞지만, 집계·알람·화면·보존 데이터의 export/portability 정책이 없으므로 절대 표현은 과장이다. |
| 9 | 🟡 대체로 정확 | Java agent의 `otel.instrumentation.methods.include`와 `@WithSpan` 설명은 정확하다. 다만 `@WithSpan`은 코드/의존성 변경일 수 있어 “코드 수정 0”과 구분해야 한다. .NET/Node/Python에 동등한 선언형 메서드 계측 옵션이 있다고 일반화하면 안 된다. 또한 `http.server.active_requests`는 시맨틱 컨벤션상 opt-in이지 Java/.NET 자동 제공 보장이 아니다. [Java methods 설정](https://opentelemetry.io/es/docs/zero-code/java/agent/annotations/), [HTTP metric 규약](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md) |

### (B) 추가 발견 결함(심각도순)

- 🔴 §3.2·§3.4 충돌: YAML에는 Collector 자기 메트릭을 scrape할 `prometheus` receiver/pipeline이 없고, 기존 `filter/metrics` 허용목록은 `otelcol_*`를 통과시키지 않는다. 따라서 §3.4의 큐·전송 실패·버전 화면 데이터가 들어오지 않는다.

- 🔴 §3.2의 `attributes/trim`에서 `http.request.header.*`는 attributes processor의 일반 wildcard 삭제로 보장되지 않는다. 특히 M2의 `db.query.text`, span attributes, exception event는 현재 마스킹 정책 없이 BE까지 갈 수 있다. §14의 “기본 마스킹”을 Collector transform/redaction 규칙, 허용 속성 목록, 원문 보존 opt-in, 감사 로그로 구체화해야 한다.

- 🔴 §8.1의 `GET /apm/collector-config?token&…`은 수신 토큰을 URL·프록시 로그·브라우저 history·Referer에 노출한다. 토큰 원문은 발급 순간 1회만 반환하고, 설정 생성은 토큰 ID를 쓰거나 권한 있는 POST 본문으로 처리해야 한다. 생성 YAML의 `Cache-Control: no-store`, 다운로드 권한, 파일 권한 안내도 필요하다.

- 🔴 §1.4는 `engine-api`·`engine-zabbix` 무수정을 원칙으로 하나, 동반 문서 WS-2.2는 `engine-api zabbix/`에 history push·가상 호스트·트리거 생성 계약을 추가한다. 어느 쪽이 정본인지 결정하고, ADR D10의 “소스 공통 개념만 포트화” 원칙에 맞춰 APM 전용 provisioning을 어디에 둘지 확정해야 한다.

- 🔴 §8.1 API 표는 P1/M2 일부만 있다. 화면 문서 §3.6~§3.21이 요구하는 error/DB/dependency/deployment/SLO/messaging/synthetic/alert preview·history/report/RUM API가 빠졌다. 특히 합성 감시는 생성·수정·삭제를 명시하지만 API와 권한 모델이 없다.

- 🔴 RUM 설계(동반 문서 §1.1, §2, §3.18, WS-5.1)는 브라우저에 Collector 수신 토큰을 노출하게 된다. CORS `allowed_origins`만으로는 충분하지 않다. 별도 짧은 수명의 public RUM token, origin allowlist, rate/size 제한, trace-context 허용 헤더, PII URL query/header 제거, CSP·동의 정책을 설계해야 한다.

- 🔴 §7 데이터 모델은 화면에서 사용하는 `apm_alert_event`, `apm_deployment`, SLO 스냅샷, error/query group, dependency 집계, synthetic binding의 보존·인덱스·삭제 정책을 완결적으로 정의하지 않는다. WBS V36~V38에 흩어져 있어 설계 정본이 분열됐다.

- 🔴 §4.4·§5: histogram bounds가 서로 다른 데이터포인트를 어떻게 롤업·병합할지 없다. `bounds_id`가 다르면 bucket count를 단순 합산할 수 없고, `apm_service_edge_5m.p95`도 다시 집계 가능한 값이 아니다. explicit/exponential histogram 지원 범위, bounds 정규화/재버킷 전략, 롤업 보존값을 정해야 한다.

- 🟡 §2.2의 DOWN 정의는 “요청 없음 + 런타임 수신”이라 저트래픽 서비스도 DOWN으로 오판한다. 기본 STALE라는 문구만으로는 부족하며, synthetic 결과·배포 직후 grace·트래픽 기대치·운영자 설정을 상태 모델에 넣어야 한다.

- 🟡 §4.5의 Zabbix trigger key에 사용자 서비스명을 직접 넣으면 특수문자·이름 변경·동일 서비스 환경 분리가 깨진다. 내부 immutable service UUID를 사용하고 Zabbix object ID 매핑, ownership tag, drift 상태를 저장해야 한다.

- 🟡 `file_storage`는 디스크 경로·권한·암호화·용량·보존·복구 정책이 없다. 라이선스 만료·BE 장애 때 민감한 trace/SQL이 고객 Collector 디스크에 남는다.

- 🟡 서비스 권한(Q17)이 “2차”여도 수신 토큰 발급/회수, SQL·stacktrace 열람, synthetic credential 수정은 최소 관리자 권한을 P1에 명시해야 한다.

- 🟡 §3.2의 4MB 본문 상한과 `send_batch_size: 512`는 호환이 보장되지 않는다. trace event/stacktrace가 많은 배치가 413을 맞을 수 있으므로 압축 여부·최대 batch byte·413 분할/드롭 동작을 R1에 포함해야 한다.

- 🟡 동반 문서 §1.2는 메뉴 13개 전체 노출을 전제로 하나, §5 S1과 본문 §11은 상위 6개 노출을 추천한다. IA와 구현 범위를 하나로 고정해야 한다.

- 🟡 WS-0.3은 0.2 뒤에 배치됐지만 §4.2의 첫 2주는 R1을 먼저 하라고 한다. JSON 형식이 파서·스키마를 결정하므로 R1 fixture 확보가 0.2의 선행이어야 한다.

- 🟡 WS-5.3 K8s를 M으로 잡았지만 RBAC, ServiceAccount, DaemonSet/Deployment 토폴로지, multi-cluster 식별, collector 배포와 보안 검증이 빠졌다. P4 공수 및 선행 인프라 과제로 분리해야 한다.

### (C) 착수 전 반드시 실측할 항목 목록

- 고정 `otelcol-contrib` 버전에서 metrics/traces/logs JSON 전송: explicit·exponential histogram, exemplar, event/link, resource/scope, gzip, 413 경계.
- `http.server.active_requests`와 DB pool/operation metric을 Java/.NET/Node/Python별 실제 자동계측 조합에서 수집.
- tail sampling의 예상 trace TPS별 RSS, 큐 적체, decision buffer overflow, 다중 Gateway trace affinity.
- 10서비스×50route×실제 인스턴스 수와 런타임 메트릭을 포함한 PG 행수·인덱스 크기·롤업 시간·90일 query plan.
- bounds가 다른 histogram의 1m→5m→1h 롤업 p95 오차.
- Zabbix 7.0 `history.push`의 권한, trapper item, trigger/action/media, 사용자가 trigger를 수정·삭제한 뒤 동기화 결과.
- Collector의 401/403/429/5xx별 retry·file_storage 잔존·재기동 동작.
- RUM CORS/preflight, origin 우회 불가 여부, 토큰 노출 없이 OTLP 송신 가능한지.
- SQL·exception·URL·header가 Collector와 BE 저장소에서 실제로 제거/마스킹되는지.
- Windows 서비스 설치·업그레이드·파일 권한·Collector 상태 메트릭 scrape와 `otelcol_*` 수신.

### (D) 한 줄 총평

방향은 타당하지만, 현재 v3는 수신 JSON·서비스 식별·저장 롤업·Zabbix 쓰기 경계·토큰/PII 보안의 핵심 계약이 비어 있어 위 🔴 항목을 설계에 반영한 뒤 구현에 착수해야 합니다.


## 반영 (Claude, 2026-08-26 — v3.1 / 동반 문서 v1.1)

| 검수 항목 | 반영 | 위치 |
|---|---|---|
| A1 json 의존(🔴) | [x] R1 범위를 metrics·traces·logs·exponential 히스토그램·exemplar·event/link·gzip·413까지 확대, **WBS 0.1로 최우선 이동**(파서 0.3보다 선행). 실패 시 Q3 protobuf 회귀 명시 | 설계서 §3.2 R1 문단, WBS 0.1·0.3·§4.2 |
| A2 history.push 소유권·드리프트(🔴) | [x] 아이템 키=불변 UUID·소유 태그·매핑 저장·일 1회 드리프트 대조(OURS/THEIRS, 삭제 시 재생성, 액션은 안 만듦)·API 권한 진단 | §4.5 "소유권·드리프트 계약", WBS 2.3·2.8, API `resync`·`zabbix-status` |
| A3 용량·dims_hash(🔴) | [x] 인스턴스 축 포함 재산정(1만 행/분·1m 100M행/7일), 인스턴스는 1m만 보존, canonical JSON+원문 비교 규칙, 질의 목표를 "보장"에서 "R3로 확정"으로 | §4.3 차원 정규화, §4.4 |
| A4 서비스 식별(🔴) | [x] `(name, env)` UNIQUE·정규화·불변 UUID·등록 모드 3종·`unknown_service` 격리·자동 숨김 TTL | §2.1, §7 V36, WBS 0.6 |
| A5 다중 Collector(🟡) | [x] P1 가이드 문구(1대·일관 해싱 없이는 불가)·active-standby·`num_traces` R2 확정 | §3.2 하단 |
| A6 403 동작(🔴) | [x] "재시도로 버틴다" 전제 폐기 → 403=영구 실패·즉시 손실, D-14/7/1 배너·중지/회수 버튼·FAQ, R11 실측 | §4.1, WBS 0.14·7.9b, R11 |
| A7 공수 과소(🔴) | [x] 워터폴·맵·수집기 XL, 등록 엔진·마스킹·R 실측 태스크 추가, 로그·K8s 인프라 합계 제외 → ~247일+별도 | WBS §4.1 |
| A8 비용·락인 표현(🟡) | [x] "라이선스 비용 불변 / 운영비는 증가"로 분리, "락인 없음"은 계측·수집 계층 한정 + 내보내기 | §13.1-4, §13.2 |
| A9 코드 수준·active_requests(🟡) | [x] `@WithSpan`=코드 변경 구분, .NET/Node/Python 일반화 삭제(R13), active_requests opt-in 명시(R12) | §14, §4.3 |
| B1 otelcol_* 미수신(🔴) | [x] `prometheus/self` receiver + `metrics/self` 파이프라인 + 허용목록 `otelcol_.*` | §3.2 yaml, §3.4 |
| B2 마스킹 부재(🔴) | [x] `attributes/drop`(regex 헤더)·`redaction/pii`·`transform/sql`·4KB 절단·opt-in 감사·열람 권한, R14 | §3.2 yaml, §4.1 권한, §14 마스킹 계약, WBS 0.13 |
| B3 토큰 URL 노출(🔴) | [x] 원문 1회 반환·이후 토큰 ID·`POST /apm/collector-config` no-store·파일 권한 | §4.1, §8.1 |
| B4 engine-api 경계 충돌(🔴) | [x] §1.4 정정 — `engine/` 무수정, `zabbix/`에 `history.push` 계약 1개만, 프로비저닝은 기존 zabbixadmin 서비스 재사용(`ZabbixAlertBridge`) | §1.4, WBS 2.2·2.3 |
| B5 API 표 누락(🔴) | [x] P1~P4 전 EP + 권한 열(🅐/🅞) + 합성 감시 CRUD·웹훅 토큰 scope | §8.1 |
| B6 RUM 토큰 노출(🔴) | [x] §15 신설: 공개 RUM 토큰·origin·레이트리밋·traceparent만·PII·CSP/동의·리플레이 금지 | §15, WBS 5.1a/5.1b |
| B7 데이터 모델 분열(🔴) | [x] §7을 V36~V39 통합 표(보존·인덱스·삭제)로 재작성, WBS는 §7 참조 | §7 |
| B8 히스토그램 경계 병합(🔴) | [x] 패밀리별 정규 경계·재버킷·exponential 변환·`rebucketed` 표시, 엣지는 p95 대신 히스토그램 벡터 | §4.3, §5, WBS 1.8 |
| 🟡 DOWN 오판 | [x] DOWN은 합성 감시 실패에서만, STALE 기대 트래픽·배포 grace·수집기 끊김=UNKNOWN | §2.2 |
| 🟡 트리거 키 서비스명 | [x] UUID 키 | §4.5 |
| 🟡 file_storage 정책 | [x] 경로·권한·상한·마스킹 후 저장·만료 시 삭제 안내 | §3.2 |
| 🟡 P1 권한 | [x] 관리자/운영자 매핑 | §4.1, §8.1 권한 열 |
| 🟡 4MB vs batch | [x] 8MB+gzip·`send_batch_max_size`·413 경계 R1 | §3.2, §4.1 |
| 🟡 IA 불일치 | [x] 상위 6 노출 확정 | 동반 §1.2, §5 S1 |
| 🟡 WBS 0.3 순서 | [x] R1을 0.1로 | WBS |
| 🟡 K8s 과소 | [x] 5.3a 인프라 과제 분리·합계 제외 | WBS 5.3a/b |
| (C) 실측 목록 | [x] R1·R2·R3·R10~R15로 설계서 §10에 등록, WBS에 태스크화(0.1·0.13·0.14·1.7·1.8·1.9·2.1) | §10 |

미반영·보류: 없음. 단 (C)의 실측 전부가 **착수 시 수행** 항목이라 설계 확정 ≠ 전제 검증 완료 — 착수본(v4)은 실측 결과로 다시 쓴다.
