# §2 배경지식 — 이 제품이 서 있는 땅

> **MovesEye APM 종합 안내서** 분책 02/18 · 원본 절 **§2 (2.1~2.7)** · 마지막 갱신 **2026-09-14**(원본 `apm-handbook.md` 2026-09-14 작성분을 내용 수정 없이 옮김, 분책 2026-09-14).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. APM이 답하는 질문 네 가지와 그것이 서버 모니터링(Zabbix)과 다른 이유
> 2. OpenTelemetry가 무엇을 해 주고 무엇을 안 해 주는지 — 특히 OTLP JSON으로 올 때의 함정 8가지와 semconv 안정화
> 3. Zabbix·PostgreSQL·SRE(SLO)·RUM/Web Vitals·K8s에서 빌려 쓴 개념과 그 한계
>
> **전제 문서** — 이전 [01-what-to-see.md](solutions--01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) · 다음 [03-constraints.md](solutions--03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md). 용어는 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 2. 배경지식 — 이 제품이 서 있는 땅

> 이 장을 읽으면: ① APM이 답하는 질문 네 가지와 그것이 서버 모니터링과 다른 이유, ② OpenTelemetry가 **무엇을 해 주고 무엇을 안 해 주는지**(특히 JSON으로 올 때의 함정), ③ Zabbix·PostgreSQL·SRE·RUM·K8s에서 우리가 빌려 쓴 개념과 그 한계를 알게 된다.

### 2.1 APM이 답하는 질문 네 가지

| | |
|---|---|
| **무엇을** | APM은 서비스에 대해 네 가지를 묻는다 — **느린가**(응답시간 p50/p95/p99), **깨졌나**(오류율·가용성), **왜**(어느 엔드포인트·DB 호출·외부 의존이 원인인가 → 트레이스), **누가 영향받나**(어느 서비스·페이지·사용자 경험이 나빠졌나 → 서비스 맵·RUM·SLO) |
| **어떻게** | 앞 둘은 **메트릭**(전량, 1분 집계)으로, "왜"는 **트레이스**(샘플)로, "누가"는 메트릭을 다시 자르거나(SLO) 브라우저에서 따로 잰다(RUM). 이 셋을 한 화면에서 서로 링크로 잇는 것이 제품이다 |
| **왜** | 서버 모니터링(Zabbix)은 주어가 **호스트**다 — CPU 80%가 서비스 지연인지 배치인지 모른다. 사용자 결정(2026-08-26): "주력으로 갈 거니까 범위 확대" — 경쟁 정의(WhaTap 핵심 지표 6·AWS 13·Elastic)를 채점표로 놓고 그 빈칸을 로드맵 안으로 끌어왔다 |
| **조건·전제** | 앱이 **계측**을 달아야 한다. 계측 없는 레거시·서드파티 바이너리는 합성 감시(바깥에서 URL 두드리기)로 가용성·응답시간만 본다 — "계측 없음" 배지가 그 한계를 드러낸다 |
| **함정·교훈** | "코드 수준(메서드 단위) 추적"은 자동이 아니다. 자동계측은 **프레임워크 경계**(컨트롤러·JDBC·HTTP 클라이언트·메시징)까지만 스팬을 만든다. Java는 `otel.instrumentation.methods.include`로 코드 수정 0 추가가 되지만 다른 언어는 일반화하지 않는다 |

**더 보기**: `designs/devdesign_apm.md` §1.3(한 줄 정의)·§13(시장 대조)·§14(6종 커버리지·"코드 수준 추적" 주의) · `reviews/review_apm-design.md` #9 · `guides/apm-opentelemetry-primer.md` §3·§5.
**출처**: Java 에이전트 메서드 계측 옵션(`otel.instrumentation.methods.include`) https://opentelemetry.io/docs/zero-code/java/agent/configuration/ · `@WithSpan` 주석 https://opentelemetry.io/es/docs/zero-code/java/agent/annotations/ · Go 자동계측 현황(베타) https://opentelemetry.io/blog/2025/go-auto-instrumentation-beta/ .

### 2.2 OpenTelemetry — 세 시그널, 자동계측, Collector

| | |
|---|---|
| **무엇을** | 시그널 셋: **메트릭**(수치 시계열: sum·gauge·histogram), **트레이스**(스팬 트리), **로그**(레코드+`trace_id`). 여기에 **컨텍스트 전파**(`traceparent` 헤더로 `trace_id`를 서비스 간에 넘김)가 셋을 잇는다. **Resource**(`service.name`·`service.instance.id`·`host.name`…)는 "누가 보냈나"의 속성 |
| **어떻게** | **자동계측(SDK auto-instrumentation)**: Java는 `-javaagent:opentelemetry-javaagent.jar` 한 줄(바이트코드 주입), .NET은 `OTEL_DOTNET_AUTO_*`, Node는 `--require @opentelemetry/auto-instrumentations-node/register`, Python은 `opentelemetry-instrument python app.py`. 앱 코드 수정 0으로 HTTP 서버/클라이언트·DB·메시징·런타임 지표와 스팬이 나온다. **Go는 자동계측이 없다**(SDK 수동). **Collector**는 `receiver → processor → exporter` 파이프라인이다: 받고(OTLP), 거르고·가리고·묶고(memory_limiter·attributes·redaction·transform·filter·tail_sampling·batch), 내보낸다(`otlphttp`, 디스크 큐·재시도 포함) |
| **왜 중요한가** | OTel은 **계측과 전송을 표준으로 공짜**로 주지만 **백엔드(저장·집계·화면·알람·보존)는 없다** — 그 절반이 이 프로젝트다. 그리고 "표준"이라도 언어별 채택 속도·기본값이 달라 실측 없이는 못 믿는다(아래 함정) |
| **조건·전제** | Collector와 BE의 접점은 `otlphttp` exporter의 `encoding: json` 옵션. ✅ R1 실측(2026-08-31)에서 metrics·traces·logs 세 경로 모두 explicit/exponential 히스토그램·exemplar·스팬 event/link·gzip까지 JSON으로 온전히 왕복했다. 그래서 BE에 protobuf 의존이 **0**이다 |
| **함정·교훈 — OTLP JSON** | ✅ 전부 R1 실측이다. ① **enum이 숫자**로 온다(`aggregationTemporality` 1=DELTA·2=CUMULATIVE, span `kind` 1~5, `status.code` 2=ERROR, 미설정은 `"status": {}`) ② **64비트 정수는 문자열**(`count`·`bucketCounts[]`·`asInt`·`timeUnixNano`) — `sum`·`explicitBounds`·`asDouble`은 숫자 ③ trace/span id는 **소문자 hex**(32/16자) ④ `bucketCounts.length == explicitBounds.length + 1`(마지막이 +∞ 버킷) ⑤ **temporality는 데이터포인트 단위**로 갈린다 — delta 선호를 켜도 UpDownCounter(`jvm.memory.*`·`db.client.connection.count`·`http.server.active_requests`)는 CUMULATIVE로 남는 것이 스펙 ⑥ **exemplar의 `filteredAttributes`에 원문**(`db.query.text` SQL 리터럴·`url.full`·`client.address`·`user_agent.original`)이 실리고 Collector의 어느 프로세서도 exemplar 속성을 만지지 않는다 → BE 폐기가 유일한 방어 ⑦ 루트 스팬은 `parentSpanId` **필드 자체가 없다**(빈 문자열 아님) ⑧ `zeroCount`처럼 0인 필드는 생략(proto3) |
| **함정·교훈 — semconv 안정화** | HTTP·DB 시맨틱 컨벤션이 최근 개정돼 **구 이름**(`http.server.duration` ms·`db.statement`·`net.peer.name`)과 **신 이름**(`http.server.request.duration` s·`db.query.text`·`server.address`)이 공존한다. Java 2.31.1은 신 이름이 기본이지만 **Node·Python은 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database`가 없으면 구 이름**으로 보낸다 — P1 QA D1에서 Python 앱이 "정상"으로 등록되고 RED 지표는 전량 폐기된 이유. BE는 구 이름 별칭(메트릭 12·스팬 속성 12쌍)을 두되 가이드에서 opt-in을 **필수**로 적는다 |

**더 보기**: JSON 함정 ①~⑧ = `verification/r1_apm-collector-roundtrip.md` §2.1~§2.7 · semconv 사고 = `verification/e2e_apm-p1-qa.md` D1·`e2e_apm-p2-qa.md` D4·D13 · 별칭 = `contract_apm.md` §3(`ApmMetricAllowlist`)·§7.3(`ApmSpanAttrAllowlist.LEGACY_ALIAS`) · `guides/apm-opentelemetry-primer.md` §2·§10 · `otel/json/`·`otel/metric/`·`otel/trace/` `package-info.java`.
**출처**: OTLP 프로토콜 규격(JSON 인코딩·재시도 코드) https://opentelemetry.io/docs/specs/otlp/ · OTLP exporter 규격 https://opentelemetry.io/docs/specs/otel/protocol/exporter/ · 메트릭 OTLP exporter·temporality preference env https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/otlp/ · SDK 환경변수 https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ · HTTP semconv 마이그레이션(`OTEL_SEMCONV_STABILITY_OPT_IN`) https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/ · HTTP 메트릭 semconv(`http.server.request.duration`·`active_requests` opt-in) https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md · Collector 설정(receiver→processor→exporter) https://opentelemetry.io/docs/collector/configuration/ · `otlphttp` exporter(`encoding: json`) https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter · exporter 큐·재시도 https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/exporterhelper/README.md · Java 에이전트 https://opentelemetry.io/docs/zero-code/java/agent/ · .NET https://opentelemetry.io/docs/zero-code/dotnet/ · Node https://opentelemetry.io/docs/zero-code/js/ · Python https://opentelemetry.io/docs/zero-code/python/ · Go SDK https://opentelemetry.io/docs/languages/go/ .

### 2.3 Zabbix를 "빌려 쓰는" 원칙

| | |
|---|---|
| **무엇을** | 이 제품의 대원칙: Zabbix에 있는 것은 **감싸서 쓰고, 우리 로직을 얹지 않는다**. APM에서 Zabbix를 쓰는 자리는 딱 둘 — **알람 배달**(우리 판정값을 트래퍼 아이템에 `history.push` → 우리가 만든 트리거 → 고객의 액션·미디어) · **합성 감시**(Zabbix 웹 시나리오 `httptest`를 그대로 관리·표시) |
| **어떻게** | 가상 호스트 `MovesEye APM`(인터페이스 없음) 하나에 아이템 키 `apm.<kind>[<uuid>]`(트래퍼·float), 트리거 `last(...) > 임계`, 소유 태그 `owner:moveseye-apm`·`apm_uid:<uuid>`. 값은 5분마다 BE가 민다. 합성 감시는 `httptest.*` JSON-RPC를 가공 없이 나르고 결과는 자동 생성되는 보통 아이템(`web.test.*`)을 `item.get`/`history.get`으로 읽는다 |
| **왜** | v2 조사에서 제품의 자체 푸시 채널은 **이메일뿐**이고 Slack·Teams·Jandi는 전부 Zabbix 미디어 타입이었다. 자체 웹훅 채널(B안)은 라우팅·에스컬레이션·억제·유지보수 창을 다시 만드는 일이고 Zabbix 알림과 두 갈래가 된다. A안이면 그 전부가 **공짜**. 합성 감시도 데모 Zabbix에 22건이 실사용 중이라 스케줄러를 하나 더 만들 이유가 없었다 |
| **조건·전제** | Zabbix **7.0**(`history.push`는 7.0 신설), 제품의 Zabbix 서비스 계정에 쓰기 권한. 고객이 액션을 만들어야 알림이 실제로 나간다 — **액션·미디어는 우리가 절대 만들지 않는다**(운영 정책이라서). 데모 서버 실측: 액션 17개 중 우리 그룹을 조건으로 가진 것 **0** → "알림 액션 없음" 진단 배지가 필수였다 |
| **함정·교훈** | ✅ R10 실측 8가지: ① 응답은 **항목 단위**(`data[i].error` = 그 값은 버려짐, `response:"success"`는 수신 확인일 뿐) ② 아이템 생성 직후 push는 서버 **설정 캐시 동기화(~10초)** 전이라 "No permissions to referred object or it does not exist"로 실패 — **대기≠실패** ③ 잘못된 타입은 push 성공 후 아이템이 NOT_SUPPORTED ④ `problem.get recent:true`는 최근 해소분까지 돌려줘 복구 판정에 못 쓴다 ⑤ 매핑 탐색 키는 태그 `apm_uid`(triggerid는 사용자 삭제·재생성으로 바뀐다) ⑥ 같은 문구가 "권한 없음/없음/미동기"를 겸한다 ⑦ 호스트는 인터페이스 없이 1개 ⑧ 액션 진단은 `action.get selectFilter` 조건 0(호스트 그룹)/26(태그) 대조. P3에서 하나 더: **Zabbix 7.0 `httptest`에 `post_type` 필드가 없고**(`posts`가 문자열이면 RAW, 배열이면 FORM), `ZBX_POSTTYPE_RAW=0/FORM=1`을 코드가 거꾸로 읽고 있었다 — 문서 기반 구현은 테스트도 같은 문서를 베낀다 |

**더 보기**: R10 8가지 = `verification/r10_apm-zabbix-history-push.md` §1·§2 · 알람 배달 갭·A안 선택 = `designs/devdesign_apm.md` §4.5(Q14) · Zabbix 객체 규약 = `contract_apm.md` §6.2(`ZabbixAlertBridge`)·§6.4·§6.5 · `post_type`·RAW/FORM = `reviews/review_apm-p3-w2_codex.md` #1·#2·`contract_apm-p3.md` §3.0·§3.4·§7.1 · 원칙 = 메모리 `zabbix-wrapper-principle`.
**출처**: Zabbix 7.0 매뉴얼(PDF — `history.push`·트래퍼 아이템·트리거·API 권한) https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf · `httptest` 객체(단계 필드에 `post_type` 없음) https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · 웹 모니터링 결과 아이템(`web.test.*`) https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items · 소스 정본 `CHttpTest.php` https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · `ZBX_POSTTYPE_RAW=0/FORM=1` https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php .

### 2.4 PostgreSQL — 파티션·UPSERT·워터마크·advisory lock·히스토그램 보간

| | |
|---|---|
| **무엇을** | 새 DB 없이 Postgres 하나로 시계열을 감당하기 위해 빌린 다섯 가지 기법 |
| **어떻게** | **일 파티션**(`apm_metric_1m_p20260831`처럼 날짜별 자식 표, 보존 정리는 DROP) · **UPSERT**(`INSERT … ON CONFLICT DO UPDATE`) · **워터마크 롤업**(`apm_setting.rollup_watermark_*`에 "여기까지 접었다"를 두고 닫힌 버킷만 LAG를 두고 접는다) · **`pg_advisory_xact_lock(hashtextextended(trace_id))`**(행이 아직 없는 트레이스의 첫 수신을 직렬화) · **히스토그램 선형 보간**(버킷 누적 개수에서 p95 위치를 찾아 버킷 안은 균등 분포로 가정) |
| **왜** | 설치형·무도커·Windows 제약이라 ClickHouse/Tempo를 처음부터 들일 수 없었다. 대신 승격 조건을 **숫자로** 박았다([3.7절](solutions--03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md)) |
| **조건·전제** | ✅ R3 실측: 서비스 10·인스턴스 3·route 50 → 1m **14.04M행/일**, 행당 **686B**(인덱스가 절반), 1m 7일 67GB·3단 109GB. 정상 롤업 1회 **1.2초**. 🔴 그리고 **`work_mem` 4MB(기본)면 큰 GROUP BY가 전부 디스크로 스필**한다 — `order by` 제거·전개 폭 축소는 플랜을 못 바꿨고 `work_mem` 64MB 하나가 Sort+GroupAggregate를 HashAggregate로 뒤집었다. PG 튜닝은 선택이 아니다([7.10절](solutions--12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md)) |
| **함정·교훈** | ① **파티션 키는 모든 PK/UNIQUE에 들어가야 한다** — 설계의 `PK(trace_id, span_id)`는 일 파티션과 양립 불가라 `(trace_id, span_id, start_ts)`가 됐고, 그래서 논리 키 dedup이 따로 필요해졌다 ② **DEFAULT 파티션을 만들지 않는다**(있으면 범위 밖 행이 거기 쌓여 통째 DROP을 못 쓴다) ③ 덧셈 UPSERT는 **재실행에 두 번 센다** — 롤업은 대입이어야 한다 ④ **히스토그램 보간의 한계**: 버킷 안이 균등 분포라는 가정은 버킷이 넓을수록 틀린다. 초 단위 값이 ms 격자 `(0,5]`에 몰려 온 것을 12칸으로 "펴서" 담자 p95가 **4.7초**로 둔갑했다(P1 QA D2) — 촘촘한 격자로 분할 재버킷은 **날조**라 금지, 병합만 허용 ⑤ `extract(epoch from timestamp)`는 UTC, 자바는 시스템 TZ — KST에서 히트맵이 540칸 밀린다 |

**더 보기**: 실측 수치 = `verification/r3_apm-volume.md` §0·§3(686B·41%)·§4(1.2초)·§6(EXPLAIN)·§9.2(`work_mem` A/B) · 파티션 규칙 = `contract_apm.md` §1(DEFAULT 파티션 없음·`ApmPartitionService`) · PK 강제 = `contract_apm.md` §7.2 #2·`ApmTraceSchemaIT` · 대입 vs 덧셈 = `contract_apm.md` §5.2·§7.8.8(`reviews/review_apm-p2-w2_codex.md` 🔴1) · advisory lock = `contract_apm.md` §7.7(`reviews/review_apm-p2-w1_codex.md` 🔴1)·`trace/ingest/ApmTraceWriter` · 보간 사고 = `verification/e2e_apm-p1-qa.md` D2·`db/migration/V43` 머리 주석 · TZ 함정 = 경험 노트 `2026-08-31-apm-p1-implementation.md` · `otel/histogram/HistogramRebucketer.java`·`core/metric/ApmPercentiles.java`.
**출처**: PostgreSQL 공식 문서(파티셔닝·advisory lock·`INSERT … ON CONFLICT` — 상위 페이지) https://www.postgresql.org/docs/current/ · 자원 설정(`work_mem`·`shared_buffers`) https://www.postgresql.org/docs/current/runtime-config-resource.html · WAL 설정(`max_wal_size`) https://www.postgresql.org/docs/current/runtime-config-wal.html .

### 2.5 SRE의 SLO — 멀티윈도우 번 레이트, 왜 AND가 아니라 OR인가

| | |
|---|---|
| **무엇을** | **SLI** = 좋은 요청 ÷ 잰 요청(가용성은 5xx가 아닌 것, 지연은 임계 이하). **SLO** = 롤링 창(7·30일)에서 SLI ≥ 목표. **에러 버짓** = `(1−목표) × measured`. **번 레이트** = 창 안 나쁜 비율 ÷ `(1−목표)` — 1이면 창 끝에 딱 소진, 14.4면 30일 예산을 **1시간에 2%**씩 태운다 |
| **어떻게** | SRE 워크북의 멀티윈도우 알람: `(burn1h > T AND burn5m > T) OR (burn6h > T/2.4 AND burn30m > T/2.4)`. 긴 창(1h·6h)이 "심각한가", 짧은 확인 창(5m·30m)이 **"아직도 나쁜가"**를 묻는다. 기본 T = `0.02 × windowDays × 24`(30일 14.4·7일 3.36), 상한 `1/(1−목표)`, 2.4는 두 SRE 항목의 비율 `(2%/1h) ÷ (5%/6h)` |
| **왜 OR인가** | 두 줄은 **서로 다른 알람**이다 — 빠른 소진(즉시 페이지)과 느린 소진(몇 시간에 걸쳐 샘). 처음 구현이 AND로 묶어 `burn1h = burn6h = 10`인 **지속 장애가 발화하지 않았다**(1시간 조건 14.4를 못 넘어서). 확인 창이 없으면 1시간 창의 기억 때문에 **복구된 뒤 최대 1시간을 더 울린다** |
| **조건·전제** | 4xx는 실패가 아니다(봇 트래픽 하나가 SLO를 깨면 안 된다). `null`은 0이 아니다 — 요청 0건 창의 SLI를 0%로 읽으면 새벽 서비스가 매일 버짓을 통째로 태운 것이 되고, 100%로 읽으면 죽어 있던 시간이 완벽한 시간이 된다 |
| **함정·교훈** | 임계를 상한 이상으로 두면 **영원히 안 울리는 알람**이 저장된다(서버가 거절). 임계 하한 1은 허용(판정이 초과라 자동 발화 아님). `measured ≠ requests` — LATENCY에서 히스토그램이 없는 조각을 분모에서 조용히 빼면 "정상 100건 + 못 잰 9,900건 = SLI 100%"가 된다 → 둘을 따로 들고 갈리면 `mixedBounds` |

**더 보기**: 정의·산식 = `contract_apm-p3.md` §1.4·§1.5·§1.8 · AND→OR·창 3조각·`measured`·`finalized` = `reviews/review_apm-p3-w1_codex.md` 🔴1~🔴4 · 검증 수치(14.4·3.36·1000) = `verification/e2e_apm-p3-qa.md` §0 1-2~1-5 · `premium/apm/slo/ApmSloCalculator.java`·`ApmSloService`.
**출처**: Google SRE Workbook "Alerting on SLOs"(멀티윈도우·멀티번레이트 표: 1h/5m 14.4배·6h/30m 6배) https://sre.google/workbook/alerting-on-slos/ .

### 2.6 RUM / Web Vitals — 브라우저는 믿을 수 없는 손님

| | |
|---|---|
| **무엇을** | Google Web Vitals 5종과 임계(경계 포함): **LCP** 2500/4000ms · **INP** 200/500ms · **CLS** 0.1/0.25 · **TTFB** 800/1800ms · **FCP** 1800/3000ms(good ≤ 앞, needs ≤ 뒤, poor 그 초과). 여기에 페이지 로드 navigation/resource timing·JS 오류·프론트 스팬(fetch/XHR) |
| **어떻게** | 고객 사이트 번들에 우리 스니펫(OTel Web SDK **2.x** + `web-vitals`) → 브라우저가 **Collector 없이 BE `/apm/rum/v1/*`로 직접** OTLP/JSON POST(CORS preflight 포함) |
| **왜 직접인가** | 설계 §15가 "Collector 별도 receiver vs BE 직접" 중 택1로 남겼고 **BE 직접**을 골랐다 — CORS·레이트리밋·origin 검증을 우리가 통제해야 하기 때문 |
| **조건·전제** | **토큰이 JS에 박혀 누구나 본다.** 그래서 Collector 토큰과 **다른 종류**(kind=RUM, origin 바인딩, 회수 가능)이고, 상한(초당·일·바이트)과 PII 제거가 수신의 절반이다. Origin은 비브라우저 클라이언트가 위조할 수 있다 → RUM 데이터는 **서버 집계(RED·SLO·서비스 맵·리포트)에 절대 섞지 않는다** |
| **함정·교훈** | 임계가 **버킷 경계**여야 good/needs/poor를 보간 없이 센다(그래서 전용 격자 `rum_ms` 21경계·`rum_score` 11경계). 세션은 "페이지·브라우저·OS·국가·5분 버킷별 distinct의 **합**"이라 GA보다 크다(`sessionMode`가 그 정의를 말한다). 국가는 GeoIP가 아니라 `CF-IPCountry`/`Accept-Language` **힌트** |

**더 보기**: 보안 계약 = `designs/devdesign_apm.md` §15(코덱스 B6) · 임계·격자·세션 정의 = `contract_apm-p4.md` §1(PII·상한)·§2(수신)·§3(세션)·§4(임계 표) · 실 브라우저 실측 = `verification/e2e_apm-p4-qa.md` §0 5-1~5-5·6-3 · [6.6절](solutions--11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md).
**출처**: Web Vitals 정의·임계(LCP 2.5s/4s·INP 200/500ms·CLS 0.1/0.25) https://web.dev/articles/vitals · `web-vitals` 라이브러리(`onLCP`·`onINP`·`onCLS`·`onTTFB`·`onFCP`) https://github.com/GoogleChrome/web-vitals · OpenTelemetry 브라우저 SDK 시작 https://opentelemetry.io/docs/languages/js/getting-started/browser/ .

### 2.7 K8s 컨텍스트 — 세 부품이 각각 무엇을 주나

| | |
|---|---|
| **무엇을** | Collector contrib의 K8s 부품 셋: **`k8sattributes`**(프로세서 — 스팬·메트릭에 `k8s.pod.name`·`namespace`·`node`·`deployment` 등 리소스 속성을 붙인다) · **`kubeletstats`**(리시버 — 노드의 kubelet에서 pod/container CPU·메모리 등을 긁는다) · **`k8s_cluster`**(리시버 — API 서버에서 클러스터 상태 메트릭, 예: `k8s.container.restarts` Gauge와 리소스 속성 `k8s.container.status.last_terminated_reason`) |
| **어떻게** | 설정 생성기 `kubernetes: true`가 셋과 `metrics/k8s` 파이프라인을 yaml에 끼워 넣는다. BE는 `k8s.container.restarts` 포인트의 **증가**를 재시작으로, 그 포인트의 리소스 속성 `last_terminated_reason=OOMKilled`를 OOM으로 읽어 `apm_instance`에 붙인다 |
| **왜** | "서비스 ↔ 파드/노드, 재시작·OOM"이 경쟁 정의의 K8s 항목이고, 앱 재시작은 배포 판정·STALE 오진과 얽힌다 |
| **조건·전제** | ServiceAccount RBAC(pods/namespaces/nodes/replicasets/deployments get/list/watch + nodes/stats), kubelet TLS CA, `K8S_NODE_NAME` Downward API. 🔴 생성 yaml은 **한 노드 시험용** — 운영은 `kubeletstats` DaemonSet + `k8s_cluster` 클러스터당 1개로 갈라야 한다(중복이면 과대 수집). RBAC·배포 자체는 WBS 5.3a **인프라 별건** |
| **함정·교훈** | `last_terminated_reason`은 **메트릭이 아니라 기본 비활성 리소스 속성**이다 — 첫 구현이 메트릭 이름으로 찾아 OOM이 영원히 null이었고, 테스트가 그 지어낸 이름을 스스로 먹여 초록이었다([6.7절](solutions--11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md)). 재시작 속성 정본은 `k8s.container.restart_count`(`container.restart_count`는 semconv에 없다). 검수자 지시(`k8sattributes.extract.metadata`)도 contrib 0.159.0 `Validate()`가 거부해 `k8s_cluster.resource_attributes`로 갔다 |

**더 보기**: `contract_apm-p4.md` §6(R2 설정 위치 정정·보존 속성·배지 규칙) · `reviews/review_apm-p4-be_claude.md` R1·R2·R3·R5·R18·변이 B3 · `verification/e2e_apm-p4-qa.md` D1 · `premium/apm/service/instance/ApmKubernetesMetricObserver`·`ApmKubernetesStateWriter` · `collector/config/ApmCollectorConfigGenerator#kubernetes`.
**출처**: `k8sattributes` 프로세서 https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/k8sattributesprocessor (0.159.0 `Config.Validate` https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go ) · `kubeletstats` 리시버 https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver · `k8s_cluster` 리시버 https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/k8sclusterreceiver (0.159.0 메트릭·리소스 속성 표 — `last_terminated_reason` 기본 비활성 https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md ) · K8s semconv 속성(`k8s.container.restart_count`) https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ .

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `designs/devdesign_apm.md` · `reviews/review_apm-design.md` · `guides/apm-opentelemetry-primer.md` · `verification/r1_apm-collector-roundtrip.md` · `verification/e2e_apm-p1-qa.md` · `e2e_apm-p2-qa.md` · `contract_apm.md` · `otel/json/` · `otel/metric/` · `otel/trace/` · `verification/r10_apm-zabbix-history-push.md` · `reviews/review_apm-p3-w2_codex.md` · `contract_apm-p3.md` · `verification/r3_apm-volume.md` · `reviews/review_apm-p2-w2_codex.md` · `reviews/review_apm-p2-w1_codex.md` · `trace/ingest/ApmTraceWriter` · `db/migration/V43` · `2026-08-31-apm-p1-implementation.md` · `otel/histogram/HistogramRebucketer.java` · `core/metric/ApmPercentiles.java` · `reviews/review_apm-p3-w1_codex.md` · `verification/e2e_apm-p3-qa.md` · `premium/apm/slo/ApmSloCalculator.java` · `contract_apm-p4.md` · `verification/e2e_apm-p4-qa.md` · `reviews/review_apm-p4-be_claude.md` · `premium/apm/service/instance/ApmKubernetesMetricObserver` · `collector/config/ApmCollectorConfigGenerator#kubernetes`
- 클래스·식별자: `ApmMetricAllowlist` · `ApmSpanAttrAllowlist.LEGACY_ALIAS` · `package-info.java` · `ZabbixAlertBridge` · `post_type` · `zabbix-wrapper-principle` · `work_mem` · `ApmPartitionService` · `ApmTraceSchemaIT` · `measured` · `finalized` · `ApmSloService` · `ApmKubernetesStateWriter`
- 관련 분책: 이전 [01-what-to-see.md](solutions--01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) · 다음 [03-constraints.md](solutions--03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · 출처 전체 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| Java 에이전트 · 설정(`methods.include`) · `@WithSpan` · 릴리스 | https://opentelemetry.io/docs/zero-code/java/agent/configuration/ · https://opentelemetry.io/es/docs/zero-code/java/agent/annotations/ · https://opentelemetry.io/docs/zero-code/java/agent/ |
| Go SDK · `otelhttp` · 자동계측 베타 | https://opentelemetry.io/blog/2025/go-auto-instrumentation-beta/ · https://opentelemetry.io/docs/languages/go/ |
| OTLP 프로토콜 규격(JSON 인코딩·재시도 코드 429/502/503/504) | https://opentelemetry.io/docs/specs/otlp/ |
| OTLP exporter 규격 | https://opentelemetry.io/docs/specs/otel/protocol/exporter/ |
| 메트릭 OTLP exporter·temporality preference | https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/otlp/ |
| SDK 환경변수(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_*`·`OTEL_METRIC_EXPORT_INTERVAL`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ |
| HTTP semconv 마이그레이션(`OTEL_SEMCONV_STABILITY_OPT_IN`) | https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/ |
| HTTP 메트릭 semconv(`http.server.request.duration`·`active_requests`) | https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md |
| Collector 설정(파이프라인) | https://opentelemetry.io/docs/collector/configuration/ |
| `otlphttp` exporter(`encoding: json`) | https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter |
| exporter 큐·재시도(`sending_queue`·`retry_on_failure`) | https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/exporterhelper/README.md |
| .NET 자동계측 · 저장소 | https://opentelemetry.io/docs/zero-code/dotnet/ |
| Node 자동계측 · 패키지 | https://opentelemetry.io/docs/zero-code/js/ |
| Python 자동계측 | https://opentelemetry.io/docs/zero-code/python/ |
| Zabbix 7.0 매뉴얼 PDF(`history.push`·트래퍼·트리거·API) | https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf |
| Zabbix `httptest` 객체 · 웹 모니터링 아이템 | https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items |
| Zabbix 소스 정본(`CHttpTest.php`·`defines.inc.php`) | https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php |
| PostgreSQL 문서(상위) · 자원 설정 · WAL 설정 | https://www.postgresql.org/docs/current/ · https://www.postgresql.org/docs/current/runtime-config-resource.html · https://www.postgresql.org/docs/current/runtime-config-wal.html |
| Google SRE Workbook — Alerting on SLOs(멀티윈도우 번 레이트) | https://sre.google/workbook/alerting-on-slos/ |
| Web Vitals 정의·임계 · `web-vitals` 라이브러리 | https://web.dev/articles/vitals · https://github.com/GoogleChrome/web-vitals |
| OpenTelemetry 브라우저 SDK | https://opentelemetry.io/docs/languages/js/getting-started/browser/ |
| `k8sattributes` 프로세서 · 0.159.0 `config.go`(`Validate`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/k8sattributesprocessor · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go |
| `kubeletstats` 리시버 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver |
| `k8s_cluster` 리시버 · 0.159.0 `documentation.md`(리소스 속성 기본 비활성) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/k8sclusterreceiver · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md |
| K8s semconv 속성(`k8s.container.restart_count`) | https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.

