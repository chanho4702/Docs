# §6 단계별 상세 — P1 메트릭·알람 (+ P1.5 실시간 Live)

> **MovesEye APM 종합 안내서** 분책 07/18 · 원본 절 **§6 머리말 · 6.1 · 6.2** · 마지막 갱신 **2026-09-17**(원본 `apm-handbook.md` 2026-09-14 작성분 §6.2에 P5와의 관계 행을 추가).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. P1 — 수신·등록 엔진·허용목록·1m 적재·롤업 3단·보존·조회·알람 5종·Zabbix 브리지를 무엇/어떻게/왜/조건/함정으로
> 2. 왜 exemplar가 최댓값이 아닌가(V47)·왜 재버킷은 병합만인가·왜 서비스별 트리거에 uid 접미가 붙나
> 3. P1.5 실시간(Live) — 인메모리 10초 링·SSE·"약 30초 이내" 문구의 근거와 단일 인스턴스 전제
> 4. P1.5 Live와 P5 실시간 관제가 **왜 별개 기능으로 남았는지**, 어디서 값을 주고받는지
>
> **전제 문서** — 이전 [06-data-path.md](solutions--06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) · 다음 [08-p2-traces.md](solutions--08-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P2-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8A%A4-%EC%84%9C%EB%B9%84%EC%8A%A4-%EB%A7%B5-%EC%97%90%EB%9F%AC-DB-%EC%9D%98%EC%A1%B4-%EB%B0%B0%ED%8F%AC.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md). 용어는 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md). P5 전체 그림은 [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 6. 단계별 상세

> 이 장을 읽으면: 단계마다 **무엇을 / 어떻게 / 왜(버린 대안) / 조건 / 함정**을 다시 잡고, 특히 "왜 exemplar가 최댓값이 아닌가", "왜 PK에 start_ts가 들어갔나", "왜 예외 롤업은 대입인가", "왜 preflight는 사유 무관 403인가", "왜 SLO를 끌 때 −1을 미는가", "왜 리포트 id를 갈랐나", "왜 V48은 V27을 베끼지 않았나" 같은 결정의 근거를 알게 된다.

### 6.1 P1 — 메트릭·알람

| | |
|---|---|
| **무엇을** | 수신(토큰·8MB·dedup) → 등록 엔진(`(name, env)` 자연키·불변 UUID·모드 AUTO/APPROVE/ALLOWLIST·`unknown_service` 격리·자동 숨김 14일) → 허용목록 11종(HTTP RED·active_requests·JVM 8·HikariCP 풀 7·`db.client.operation.duration`·process 2·`otelcol_*`) → 1m 적재 → 롤업 3단 → 보존 → 조회(RED·엔드포인트·상태코드·런타임 슬롯·인스턴스·가용성·Apdex) → 알람 5종(`ERROR_RATE`·`P95_LATENCY`·`STALE`·`COLLECTOR_FAILURE`·`ACTIVE_REQUESTS_SPIKE`) → Zabbix 브리지·드리프트 동기화 |
| **어떻게** | 정규 경계 4패밀리(`duration_s` 14단 = Java 기본과 동일 → 재버킷 0건, `db_operation_s` 9단, `gc_s` 4단, `pool_ms` 15단) · `dims` = 허용 키만 키 정렬 canonical JSON(없는 키는 `''`) + `dims_hash` sha256 · `status_class`로 접고 원 코드는 버림 · route 500 상한(LRU 아님 — 밀어내면 시간에 따라 무제한) · CUMULATIVE는 첫 관측이 `time−startTime < 120초`면 통째로, 아니면 버리고 기억 · 상태 판정: STALE(5분 미수신, 배포 후 grace 10분) → UNKNOWN(수집기도 STALE) → DEGRADED(5분 창 오류율 > 5% 또는 p95 > 2000ms) → DOWN(합성 바인딩 실패만) → UP · 가용성 % = `UP+DEGRADED ÷ 판정된 칸`, **UNKNOWN·보존 밖 칸은 분모 제외**, 판정 칸 0이면 `null` |
| **왜** | 인스턴스 축은 1m에서만(5m/1h는 서비스 합산 — 인스턴스별 장기 추이는 안 준다). 카운터의 정본은 `sum`, 게이지의 정본은 `sum/count`·min/max(한 행에 두 종류 값이 산다). 4xx는 오류가 아니다(클라이언트 잘못). "메트릭 부재로 DOWN을 추론하지 않는다"(저트래픽 오판) — DOWN은 합성 감시만이 말한다 |
| **조건·전제** | `OTEL_SERVICE_NAME` 없는 앱은 서비스가 되지 않는다. 히스토그램 경계가 정규와 다르면 **병합만** 허용(`mergesExactlyInto`), 못 접으면 수신 격자 그대로 `observed`/`observed_ms` family로 저장하고 `RAW_BOUNDS` 카운트 · 조회에서 경계 혼재면 `mixedBounds=true`·백분위 `null`(건수·오류율은 정확) |
| **함정·교훈** | 🔴 **exemplar는 최댓값이 아니다**(P2 QA D17): 라벨은 `max` 컬럼, 링크는 `exemplar_trace_id`에서 왔는데 CUMULATIVE에서 극값은 차분이 안 되어 한 번 커진 `max`가 다섯 버킷에 고정(104,881ms)되고 exemplar는 그 배치의 **대표 표본**(130ms)이었다 → V47: 값의 정본을 exemplar 자신(`asDouble`), 귀속은 exemplar `timeUnixNano`, traceId와 값을 **같은 행에서 한 쌍**(UPSERT의 `case`, 롤업의 같은 정렬), CUMULATIVE 히스토그램의 min/max는 **저장하지 않는다**(NULL). 🔴 알람 "활성 서비스별 규칙만 전역을 덮는다"(A22 — 꺼진 규칙이 전역을 가려 임계선이 사라졌다) · 🔴 Zabbix 아이템은 (kind, 서비스) 단위로 **공유**, 트리거만 규칙마다 → 삭제에 참조 카운트, 트리거 먼저 · 🔴 서비스별 트리거 이름에 `(서비스 규칙 <uid 8자>)` 접미(P3 2회차 D10 — 전역과 같은 이름이라 영영 못 만들어졌고 알림이 통째로 멈춘 상태였다; 전역 이름은 고객 액션 조건이 걸려 있을 수 있어 **안 바꾼다**) · 롤업 `apm_int_array_sum`의 sfunc가 STRICT면 모든 히스토그램이 사라진다 |

**더 보기**: 등록 엔진 = `contract_apm.md` §2.5(`ApmRegistrar`) · 허용목록·dims·차분·1m UPSERT·exemplar = §3(`ApmMetricAllowlist`·`ApmDimsNormalizer`·`CumulativeDeltaTracker`·`ApmMetric1mStore`) · 롤업·보존 = §5.2·§5.4 · Zabbix 규약·평가·드리프트 = §6.2·§6.4·§6.5 · 상태 판정·가용성 = `contract_apm-read-api.md` §5 · exemplar≠최댓값 = `verification/e2e_apm-p2-qa.md` D17·`db/migration/V47` · 재버킷 병합만·V43 = `verification/e2e_apm-p1-qa.md` D2·`e2e_apm-live-qa.md` §E · `effective` = `analysis/apm-p1-logic-analysis.md` §12 A22 · 트리거 이름 접미 = `verification/e2e_apm-p3-qa.md` §7.2 D10 · 종단 = `verification/e2e_apm-selfmonitoring.md`.
**출처**: HTTP 메트릭 semconv https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md · Zabbix 7.0 매뉴얼 https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf .

### 6.2 P1.5 — 실시간(Live)

| | |
|---|---|
| **무엇을** | 개요 상단 "실시간(약 30초 이내)" 토글: 흐르는 차트 3(rps·액티브·오류율)·p95·"최근 60초 오류/느린 엔드포인트" 표·서비스 카드 실시간 점 |
| **어떻게** | 인메모리 링 두 축 — 서비스 링 90칸(15분)·route 링 6칸(60초), 메트릭은 `http.server.request.duration`·`active_requests` **둘뿐**, 에폭 기준 절대 정렬 10초 칸, 회전=덮어쓰기, `synchronized` 한 겹. SSE `GET /apm/live/stream`: 연결 즉시 `snapshot`(90칸) → 10초마다 `bucket`(뒤 **6칸** 겹침) → 30초 `heartbeat`, tick 스레드 **1개**(보는 사람 0이면 DB도 안 읽음). FE 병합은 `(serviceUid, ts)` 덮어쓰기 한 줄 |
| **왜** | 저장 경로 최소 알갱이가 1분 + 30초 새로고침이라 화면은 늘 1~2분 전. DB에 10초 칸을 두면 행이 6배인데 15분만 살면 되는 데이터. route 링을 15분으로 들면 최악 27MB → **400MB** — 창 분리가 메모리를 지키는 유일한 장치. 증분이 1칸이면 파이프라인 지연(25~35초) 탓에 **실시간 차트 맨 끝이 항상 0** |
| **조건·전제** | 🔴 알갱이를 정하는 것은 **상류** — 앱 export 주기(기본 60초)가 그대로면 링은 60초마다 한 칸. 단일 BE 인스턴스 전제(2대면 화면이 절반만 움직이고 그 사실이 안 드러난다 — 승격은 Redis Stream). 재기동하면 비어서 시작. 문구는 "초 단위"가 아니라 **"약 30초 이내"**(계약값) — ✅ 실측 화면 도달 중앙값 ≈14초·최악 ≈23초 |
| **함정·교훈** | 🔴 `EventSource`는 커스텀 헤더를 못 실어 `visitorId`를 **쿼리**로 받되 판정은 인터셉터와 같은 코드(`VisitorSessionChecker`) — 한때 "없으면 통과"였고 그것이 세션 바인딩 우회였다(둘 다 없으면 401) · 라이선스는 연결 시점만 → 수명 600초 · `@Min/@Max`는 곱셈을 못 막아 `ApmLiveProperties`가 힙 예산·창 배수를 직접 검사해 **기동 실패** · 링에는 `liveMaxOf`(export의 최상위 버킷 상한)를 따로 준다(V47이 저장 `max`를 NULL로 만들며 Top 축을 잃었던 회귀) · 아파치 SSE 버퍼링(`flushpackets=on`) 실서버 미확인 |
| **P5와의 관계**(2026-09-17) | 🔴 P5 실시간 관제([18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md))는 이 패널과 **다른 기능**이다 — 이 Live 패널(10초 칸·개요 상단 토글·`/apm/live/stream`)은 **그대로 둔다**. 합치지 않은 이유 둘: ① 한 화면에 SSE 연결을 두 개 붙들게 된다(사용자당 연결 상한 4가 그만큼 빨리 찬다) ② 데이터 성격이 다르다 — 이쪽은 P1 메트릭 링의 10초 알갱이(응답 주기 상류가 결정), P5는 tail 샘플링 **앞**에서 가른 완료 HTTP SERVER 스팬의 1초 집계다(§10.3). 대신 P5 "요청 관제" 탭의 **동시 요청 타일·서비스 타일의 CPU/heap**은 이 P1.5 메트릭 링에서 런타임 값을 **읽어 쓴다**(7단계 `live{}` 공급) — export 주기(10~60초) 그대로를 노출하고 1초 속도계와 같은 빠르기로 꾸미지 않는다 |

**더 보기**: 지연 산수·문구 = `designs/devdesign_apm-live.md` §1 · 링 두 축·메모리 = §3.1·§3.2 · 집계 규칙(null·마지막 값) = §3.4 · SSE 이벤트·6칸 겹침 = §4·`contract_apm-read-api.md` §9.2 · 인증 두 함정 = §4(`VisitorSessionChecker`)·`reviews/review_apm-p1_5-live_codex.md` 🔴1 · 힙 예산·기동 실패 = §5(`ApmLiveProperties`) · 다중 인스턴스 승격 = §6 · 실측 지연·멱등 = `verification/e2e_apm-live-qa.md` §A·§B·§5-5 · `liveMaxOf` 회귀 = `reviews/review_apm-p2-qafix_codex.md` #1 · 코드 `premium/apm/overview/live/` · P5와의 경계·`live{}` 공급 = [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.4(1)·§10.6 7단계.
**출처**: SDK 환경변수(`OTEL_METRIC_EXPORT_INTERVAL`) https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ .

---

## 보강 — 이 단계와 관련된 §4·§5·§8 조각(사본)

> 🔁 **보강(사본)** — 아래는 §4.2(단계 표)·§4.3(데이터 모델)·§5(데이터의 길)·§8.2(QA 수치)에서 이 단계에 해당하는 조각을 **그대로 복사**한 것이다(각 파일이 혼자 읽히게). 정본은 [04-overview.md](solutions--04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) §4.2·§4.3 · [06-data-path.md](solutions--06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) §5 · [13-verification.md](solutions--13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) §8.2이며, 어긋나면 정본이 맞다.

**보강 A — §4.2 단계 표에서 P1·P1.5 행 (정본 04-overview.md §4.2)**

| 단계 | 날짜(커밋) | 무엇 | 핵심 수치 | 검증 |
|---|---|---|---|---|
| **P1 기반+메트릭** | 08-31~09-01 (BE `3b67d01`→`ee8ad09`, FE `223ae83`→`5f25846`) | R1·R10·R11·R14 실측 → V38~V43 · OTLP 수신·토큰·등록 엔진·허용목록·1m 적재·롤업 3단·보존·알람(Zabbix 브리지·평가·드리프트) · 화면 10(개요·목록·상세 5탭·알람 3탭·수집기 4탭) | 14테이블, 배치 5종, 알람 kind 5, 히스토그램 패밀리 4 | self-monitoring 종단 3회차 · 코덱스 3회(🔴 5) · 로직 분석 A1~A29 · P1 QA 결함 8 |
| **P1.5 실시간(Live)** | 09-01 (BE `1b43bb1`, FE `57dbd2b`) | 인메모리 10초 링 + SSE(`/apm/live/stream`) · V43 family UNIQUE · R3 성능 수술 3건 | 창 15분·틱 10초·힙 ≈29MB | 코덱스 4차(🔴 세션 바인딩 우회) · Live QA 결함 0(화면 도달 중앙값 ≈14초·최악 ≈23초) |

**보강 B — §4.3 데이터 모델에서 V38~V43 (정본 04-overview.md §4.3)**

| 마이그레이션 | 표 | 무엇을 담나 |
|---|---|---|
| **V38** `apm_p1` | `apm_service`·`apm_instance` | 서비스(자연키 `(name_norm, env_norm)`, 불변 `service_uid`, 상태 ACTIVE/PENDING_APPROVAL/HIDDEN, apdex_t·slow_threshold·호스트 수동 매핑) / 인스턴스(버전·호스트·마지막 수신) |
| | `apm_receive_token`·`apm_collector`·`apm_otlp_receipt` | 토큰(해시·kind·scopes·회수) / 수집기 상태(버전·큐·전송 실패·샘플링 드롭) / 영수증(본문 sha256, 재전송 dedup) |
| | `apm_hist_bounds` | 히스토그램 경계 카탈로그(`bounds`·`family`) — 삭제 금지 |
| | `apm_metric_1m/5m/1h` 🔷 | 시계열 3단. 행 = (서비스, [인스턴스], 메트릭, dims_hash, 버킷) + count·sum·min·max·hist_counts·bounds_id·exemplar |
| | `apm_ingest_drop_stat`·`apm_pending_service`·`apm_setting` | "받았는데 왜 저장이 다른가" 카운터(사유×메트릭) / APPROVE 모드 대기열 / 전역 설정·워터마크 키-값 |
| | `apm_alert_rule`·`apm_alert_event` | 알람 규칙(전역/서비스별, kind·임계·창) / 발화 이력(`zbx_eventid`) |
| V39 | `apm_setting.updated_by` | 설정 변경 책임 소재(원문 SQL opt-in 감사) |
| V40 | 집계 `apm_int_array_sum` | 롤업의 히스토그램 벡터 원소별 합(STRICT 아님이 핵심) |
| V41 | `apm_alert_rule_binding` | 규칙×대상별 Zabbix 객체 매핑(itemid·triggerid·cache_ready·drift·error) |
| V42 | binding ORPHANED | 대상 집합에서 빠진 쌍의 상태 |
| V43 | `UNIQUE(bounds, family)` | 같은 숫자 격자를 family별로 딴 줄로(초/ms 1000배 오독 방지) |

**보강 C — §5.1 메트릭의 길 그림 (정본 06-data-path.md §5.1 — 관문별 "왜 이 자리인가" 표는 정본에)**

```
 [고객 앱]                 [고객 망 — Collector 0.159.0]                      [MovesEye BE]                                  [화면·알람]
 -javaagent ──OTLP grpc──▶ receiver otlp                                       POST /apm/otlp/v1/metrics
  10~15초마다 export        ├ memory_limiter · resourcedetection(host.name)     ① 415/413/gzip 스트리밍 상한 8MB
                            ├ attributes/drop (url.full·query·UA·IP·헤더)       ② 401 토큰(sha256) → 403 용도(kind·scope) → 403 라이선스
                            ├ filter/metrics (허용 접두 정규식)                 ③ 400 JSON → 영수증 dedup 판정(본문 sha256)
                            ├ batch 5s/512                                      ④ OtlpMetricsReader — 깨진 것만 버림, 해석 안 함
                            └ exporter otlphttp json+gzip                       ⑤ MetricIngestor
                              · file_storage 디스크 큐 5000                        ⑤a 수집기 자기 메트릭 분리(service.name=otelcol*) → apm_collector + 센티널 service_id=0
                              · retry 429/502/503/504만                            ⑤b 서비스 귀속 ApmRegistrar (name,env) 정규화 → AUTO/APPROVE/ALLOWLIST · unknown_service 격리
                                                                                   ⑤c 허용목록 + 구 semconv 별칭 → 밖은 NOT_ALLOWLISTED 카운트
                                                                                   ⑤d 차원 정규화: 허용 키만·키 정렬·status_class 접기·route 500 상한 __other__ → dims_hash
                                                                                   ⑤e CUMULATIVE 차분(포인트 단위 temporality) · 첫 관측 규칙
                                                                                   ⑤f 정규 경계 재버킷(병합만) · exemplar traceId+값 한 쌍
                                                                                ⑥ ApmMetric1mStore UPSERT(덧셈) → apm_metric_1m ─┐
                                                                                ⑦ stored>0 이면 LiveBuffer.offer() (절대 안 던짐) │      ┌─ 10초 링 → SSE → 개요 "실시간"
                                                                                ⑧ 영수증 기록 → 200 {}                              │      │
                                                                                                                                    ▼      │
                                                          5분마다 apm_rollup: 1m ─(닫힌 버킷, LAG 2분, 워터마크)─▶ 5m ─▶ 1h   (대입 UPSERT)
                                                          매일 apm_partition_maintain(D+2 선생성) · apm_retention(DROP·숨김)
                                                                                                                                    │
                                        ┌───────────────────────────────────────────────────────────────────────────────────────────┘
                                        ▼ 조회 (ApmMetricStore · ApmResolution이 창 길이로 1m/5m/1h 선택)
                                        · 백분위 ApmPercentiles(버킷 선형 보간, min/max 클램프) · ApmHistogramMerger(경계 혼재→mixedBounds)
                                        · 상태 판정 ApmStatusJudge(UP/DEGRADED/DOWN/STALE/UNKNOWN) · 가용성(5m 기준선+1m 꼬리) · 권한 apm.view
                                        ▼
                                        화면: URL query 상태(useApmTimeRange) · 차트↔표 전환 · 배지(rebucketed/mixedBounds/__other__/sampled)
                                        알람: 5분마다 apm_alert_evaluate(1m 원본 집계) → history.push → Zabbix 트리거 → 고객 액션(Slack/Teams)
```

**보강 D — §8.2 QA 수치에서 P1·self-monitoring·Live 행 (정본 13-verification.md §8.2)**

| 단계 | 결과 | 남은 것 |
|---|---|---|
| P1 QA(09-01) | 결함 8(HIGH 1: Python semconv) 전건 반영 | 비관리자 읽기전용 미검증(당시 계정 없음 → 권한 QA로 대체)·개요/알람/도움말 브라우저 일부 미완 |
| self-monitoring 3회차 | 빈 DB → 수신 → 등록 → 적재 → 조회 → 롤업 → Zabbix 실 프로비저닝·push ok | 데모 Zabbix 잔존물(호스트 10757) self-monitoring용 |
| Live QA | 결함 0, 권고 2(`X-Accel-Buffering`·점 기준 시간화) | 아파치 버퍼링·`enabled:false`·`__other__` 재현 불가 |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `contract_apm.md` · `contract_apm-read-api.md` · `verification/e2e_apm-p2-qa.md` · `db/migration/V47` · `verification/e2e_apm-p1-qa.md` · `e2e_apm-live-qa.md` · `analysis/apm-p1-logic-analysis.md` · `verification/e2e_apm-p3-qa.md` · `verification/e2e_apm-selfmonitoring.md` · `designs/devdesign_apm-live.md` · `reviews/review_apm-p1_5-live_codex.md` · `verification/e2e_apm-live-qa.md` · `reviews/review_apm-p2-qafix_codex.md` · `premium/apm/overview/live/`
- 클래스·식별자: `ApmRegistrar` · `ApmMetricAllowlist` · `ApmDimsNormalizer` · `CumulativeDeltaTracker` · `ApmMetric1mStore` · `effective` · `VisitorSessionChecker` · `ApmLiveProperties` · `liveMaxOf`
- 관련 분책: 이전 [06-data-path.md](solutions--06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) · 다음 [08-p2-traces.md](solutions--08-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P2-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8A%A4-%EC%84%9C%EB%B9%84%EC%8A%A4-%EB%A7%B5-%EC%97%90%EB%9F%AC-DB-%EC%9D%98%EC%A1%B4-%EB%B0%B0%ED%8F%AC.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · P5 실시간 관제(§6.2와의 관계) [18-p5-realtime.md](solutions--18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) · 출처 전체 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| HTTP 메트릭 semconv(`http.server.request.duration`·`active_requests`) | https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md |
| Zabbix 7.0 매뉴얼 PDF(`history.push`·트래퍼·트리거·API) | https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf |
| SDK 환경변수(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_*`·`OTEL_METRIC_EXPORT_INTERVAL`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.

