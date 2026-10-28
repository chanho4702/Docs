# 부록 A. 용어 사전(전체)

> **MovesEye APM 종합 안내서** 분책 14/18 · 원본 절 **부록 A** · 마지막 갱신 **2026-09-17**(원본 `apm-handbook.md` 2026-09-14 작성분에 P5(라이브 관제) 용어를 보강).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. 본문에 나오는 용어·식별자(Apdex부터 ZBX cleanup queue까지) 각각의 뜻과 우리 맥락
> 2. 같은 말이 두 뜻인 것(bucket·UPSERT 덧셈/대입)을 문맥으로 가르는 법
> 3. 값 규약(SLO_BURN `>0/0/−1`·sampled_reason·token scope/kind)
> 4. P5 라이브 관제 전용 용어(arena·reservoir·강조 계층·SSE 프레임 식별자)
>
> **전제 문서** — 이전 [13-verification.md](13-verification.md) · 다음 [15-overturned.md](15-overturned.md) · 목차 [00-index.md](00-index.md). 용어는 [14-glossary.md](14-glossary.md), 출처 전체는 [17-sources.md](17-sources.md). P5 전체 그림은 [18-p5-realtime.md](18-p5-realtime.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 부록 A. 용어 사전(전체)

| 용어 | 뜻 · 우리 맥락 |
|---|---|
| Apdex | `(satisfied + tolerating/2) / total`, T=0.5s 기본(satisfied ≤ T, tolerating ≤ 4T). 히스토그램 보간 |
| advisory lock | `pg_advisory_xact_lock(hashtextextended(trace_id))` — 트랜잭션 잠금(세션 잠금은 반납 커넥션이 잠금을 든 채 재사용될 위험) |
| allowlist(허용목록) | 메트릭 11종·스팬 속성(거부>허용)·RUM 속성. 밖은 버리고 `apm_ingest_drop_stat`에 사유×이름으로 센다 |
| APPROVE / ALLOWLIST / AUTO | 등록 모드. APPROVE는 대기열에만 두고 데이터는 버린다, ALLOWLIST는 사전 등록만 |
| arena(아레나) | `LiveSpanArena` — P5 라이브 스팬 점의 **전역 슬롯 풀**. 45B 슬롯에 재사용 방식으로 저장(전역 base 1,300k/emphasis 50k). DB가 아니라 메모리 배열이라는 뜻에서 이 이름. [18-p5-realtime.md](18-p5-realtime.md) §10.3 |
| BRIN | 블록 범위 인덱스. 트레이스 롤업의 `start_ts` 범위 스캔용(삽입 비용 ~0) |
| bounds_id / family | `apm_hist_bounds` 행 id / 격자의 족보 라벨(`duration_s`·`db_operation_s`·`gc_s`·`pool_ms`·`pool_s`·`observed`·`observed_ms`·`rum_ms`·`rum_score`). UNIQUE `(bounds, family)` |
| bucket(버킷) | 시간 버킷(1m/5m/1h/10초 칸) 또는 히스토그램 버킷 — 문맥으로 가른다 |
| burn rate(번 레이트) | 창 안 나쁜 비율 ÷ (1−목표). 4창(1h·5m·6h·30m), `burnCondition` FAST/SLOW/NONE/UNKNOWN |
| cache_ready / pendingCache | Zabbix 아이템의 첫 push 성공 여부 / 생성 2분 이내의 캐시 미동기(실패로 안 센다) |
| canonical bounds(정규 경계) | 패밀리별 고정 히스토그램 경계(`CanonicalBounds`). 롤업을 벡터 합으로 만든다 |
| Collector(수집기) | `otelcol-contrib` 게이트웨이. 화면 "수집기"는 이것의 상태·토큰·설정·설치·RUM 탭 |
| critical path(크리티컬 패스) | 자기 시간 합이 최대인 루트→리프 경로 |
| CUMULATIVE / DELTA | 누적 / 증분 temporality. 포인트 단위 판정, UpDownCounter는 delta 선호에도 CUMULATIVE |
| DEGRADED / DOWN / STALE / UNKNOWN / UP | 서비스 상태 5종([6.1절](07-p1-metrics.md)) |
| dims / dims_hash | 허용 차원 canonical JSON / 그 sha256. 자연키 구성 요소 |
| drift(드리프트) | 사용자가 Zabbix에서 우리 트리거 표현식을 바꿈. 배지만 세우고 되돌리지 않는다(OURS/THEIRS는 화면에서) |
| effective / appliedRuleUid | 서비스 상세 "적용 규칙"에서 실제 감시 중인 규칙 표시(활성 서비스별 규칙만 전역을 덮는다) |
| emphasis layer(강조 계층) | P5 라이브 arena의 **오류·느림 전용 별도 예산**(전역 50k·서비스당 20k). 정상 표본(기본 계층)에 묻혀 사라지지 않도록 따로 "강조"해서 담는다는 뜻. 초과 시 그 계층만 초별 reservoir. [18-p5-realtime.md](18-p5-realtime.md) §10.2 |
| error budget(에러 버짓) | `(1−목표) × measured`, 반올림 없음. 남은 % 음수 가능 |
| exemplar | 히스토그램 버킷의 대표 표본(값+traceId+시각). 최댓값 아님. `stored`로 트레이스 존재 여부 |
| exceedsTopBound | 백분위가 +∞ 버킷에 걸림 → 하한 표시(`≥`) |
| exponential histogram | 밑 2^(1/2^scale) 격자. 정규 경계로 변환 |
| feature gate | Collector의 실험적 동작을 켜고 끄는 실행 플래그(`--feature-gates=...`). P5 라이브 파이프라인은 `ottl.set.allowNil`이 빠지면 OTTL 정리 문장이 **오류 없이 무시**되어 PII·전송량이 는다. [12-operations.md](12-operations.md) §7.12 |
| fingerprint(지문) | 예외: `sha256(type|정규화 메시지)` / SQL: `sha256(db_system|apm_sql_norm)` |
| finalized | SLO 일 스냅샷 확정 플래그(미확정은 다음 회차가 다시 계산) |
| head / tail 샘플링 | 요청 시작 시 확률 / 끝난 뒤 결과 보고 결정. 우리는 tail(Collector). 🔴 P5 라이브(`traces/live`)는 tail 샘플링 **앞**에서 갈라져 이 결정 자체를 타지 않는다 — 그래서 라이브는 전량 수신이고 저장은 정상 2%만 남는다. [06-data-path.md](06-data-path.md) §5.3 |
| history.push | Zabbix 7.0 API — 트래퍼 아이템 값 적재. 항목 단위 `data[i].error` |
| INP / LCP / CLS / TTFB / FCP | Web Vitals 5종(임계 [2.6절](02-background.md)) |
| job.name 규약 | 배치 잡: 루트 스팬·INTERNAL·`job.name` 속성(우리 규약, OTel 표준 없음) |
| k8sattributes / kubeletstats / k8s_cluster | [2.7절](02-background.md) |
| LAG | 롤업이 닫힌 버킷을 기다리는 여유(메트릭 2분·트레이스 3분) |
| LEGACY_ALIAS | 구 semconv → 신 이름 별칭(메트릭·스팬 속성 12쌍). 신 이름 우선, 별칭 해석이 거부보다 먼저 |
| Live / LiveBuffer | P1.5 인메모리 10초 링. `snapshot`·`bucket`·`heartbeat` SSE |
| measured vs requests | SLI 분모(잰 요청) vs 창 안 전체 요청. 갈리면 `mixedBounds` |
| mixedBounds | 한 시계열에 경계 다른 조각 혼재 → 백분위 `null`, 건수는 정확. `bounds_id NULL` 혼입도 true |
| `__other__` | route 상한(적재 500·Live 200) 초과분 자리표시. 링크로 만들지 않는다 |
| origin allowlist | RUM 토큰별 `scheme://host[:port]` 정확 문자열 ≤32. 빈 목록=수신 중지 |
| ORPHANED | 대상 집합에서 빠진 알람 바인딩 상태(트리거 내림, 삭제 아님) |
| OTLP receipt(영수증) | `apm_otlp_receipt` 본문 sha256 — 배치 재전송 dedup. 적재 뒤 기록 |
| OTTL | OpenTelemetry Transformation Language. Collector `filter`·`transform` 프로세서의 조건·문장 문법(`keep_keys`·`set`·`IsMatch`·`Len`). P5 라이브 슬림화·정리가 전부 이 문법으로 쓰인다 |
| p50/p95/p99 | 히스토그램 버킷 선형 보간 + min/max 클램프. 관측 0이면 `null` |
| partition(파티션) | 일 단위 자식 표 `<table>_p<yyyyMMdd>`, D+2 선생성, DEFAULT 파티션 없음 |
| pointsRev / statsRev | P5 SSE 스트림에서 표본(arena)과 집계(stats)가 갱신될 때마다 각각 오르는 **독립** 리비전 번호. 표본이 깎여도 통계는 안 바뀔 수 있어 화면이 "무엇이 바뀌었는지"를 이 값으로 가른다 |
| preflight | CORS OPTIONS. RUM에서 필터가 직접, 사유 무관 403 |
| provisionalUntil | P5 라이브 최신 1초 집계 칸이 "아직 확정 전"임을 나타내는 타임스탬프. 그 전까지 화면은 해당 칸을 잠정(해칭)으로 그린다 |
| RAW_BOUNDS / REBUCKETED / BOUNDS_CONFLICT | 접기 거부·원본 격자 저장 / 병합 재버킷됨(근사) / 같은 1m 행에 경계 충돌 → 벡터 NULL |
| RED | Rate·Errors·Duration |
| rebucket(재버킷) | 다른 격자로 접기. **병합만** 허용 |
| reservoir(층화 표본) | P5 라이브 arena가 예산 초과 시 쓰는 **stratified reservoir sampling** — 서비스·초 단위로 층(strata)을 나눠 그 안에서 균등 무작위로 남긴다. 통계학의 저수지 표본 추출 이름을 그대로 씀. 통계(§10.2 집계)는 이 표본을 안 거친다 |
| rollup(롤업) | 1m→5m→1h(대입 UPSERT, 워터마크), 트레이스 4+2종 |
| route_limit | 서비스당 route 상한 500(`apm_setting`) |
| RUM | Real User Monitoring — 브라우저 실사용자 |
| sampled_reason | `ERROR`·`SLOW_INFERRED`·`SAMPLED`·(에이전트 속성 원문·`SLOW`) |
| semconv | Semantic Conventions. `OTEL_SEMCONV_STABILITY_OPT_IN` |
| sentinel service_id=0 | 수집기 자기 메트릭 시계열. 서비스 질의는 `service_id > 0` 필수 |
| seq / sinceSeq | P5 SSE 프레임의 일련번호 / 클라이언트가 재접속 시 "이 번호 다음부터 달라"고 보내는 커서. 병합 규칙(누락·중복 판정)의 기준 |
| sessionMode | RUM 세션 정의 문자열 `DISTINCT_PER_PAGE_DIMENSION_5M_SUM` |
| SLI / SLO | [2.5절](02-background.md) |
| SLO_BURN | 번 알람 kind(설계 표기 `SLO_BURN_RATE`는 별칭). 아이템 `apm.slo_burn[<slo_uid>]`, 값 `>0/0/−1` |
| span / trace | 구간 / 트리 |
| SSE(Server-Sent Events) | 서버가 단방향으로 흘려보내는 HTTP 스트림. `EventSource`가 `Last-Event-ID`로 자동 재접속. P1.5 Live(`/apm/live/stream`, 10초 칸)와 P5 라이브(`/apm/live/spans/stream`, 1초 tick)가 각각 **별개 연결**로 쓴다(사용자당 연결 상한 4) |
| staleDefinition / def_version | 스냅샷이 당시 정의로 잰 것 / 재는 기준이 바뀔 때만 오르는 버전 |
| status_class | HTTP 상태를 `1xx~5xx`로 접은 파생 차원. 원 코드는 버림 |
| streamEpoch | P5 SSE 재연결 시 스트림의 "세대"를 구분하는 값. 서버 재시작·재연결로 이전 상태가 무효화됐음을 클라이언트가 이 값의 변화로 안다 |
| timingMode | RUM 상세 timing `AGGREGATE_AVERAGE`(개별 로드 아님) |
| token scope / kind | `ingest`·`deploy`(kind COLLECTOR) / `rum`(kind RUM). 서로 못 쓴다 |
| traceparent | W3C Trace Context 헤더. 프론트→백 연결 |
| truncated | 조회 상한(RUM 50,000행·합성 이력·산점도 COUNT_CAP)에 걸림 — 수집 공백과 다른 문구 |
| UNSET | 스팬 status 미지정 = 절대다수(실패 아님) |
| UpDownCounter | 오르내리는 카운터(active_requests·jvm.memory·pool count). 합산 금지, 마지막 값 |
| UPSERT | 1m 덧셈 / 롤업·RUM 대입·원소별 합 |
| viewKey | P5 SSE 스트림에서 클라이언트가 보고 있는 뷰(필터·시간창 조합)를 식별하는 키. `streamEpoch`·`seq`와 함께 재접속 시 병합 대상을 가른다 |
| visitorId | 브라우저 식별자(세션 바인딩). SSE는 쿼리로 |
| watermark(워터마크) | `rollup_watermark_5m/1h`·`trace_rollup_watermark_5m`. 0행이면 붙잡는다 |
| Web Vitals | [2.6절](02-background.md) |
| ZBX cleanup queue | `apm_zbx_cleanup` — 지운 규칙의 Zabbix 객체 정리(트리거 먼저) |
| collecting(수집) | 🔴 서비스별 **적재 스위치**(V60 `apm_service.collecting`). 숨김과 **다른 축**이다 — 숨김은 목록에서 감추고 데이터는 쌓이지만 이쪽은 목록에 남기고 **저장만** 멈춘다. 멈춰도 `last_seen_at`은 갱신된다(멈춘 것은 저장이지 수신이 아니다). 운영 절차는 [7.13절](12-operations.md) |
| COLLECTION_PAUSED | 🔴 위 스위치로 버린 데이터의 **전용 폐기 사유**. `PENDING`(승인 대기)·`REJECTED`(미등록)와 섞지 않는다 — 저 둘은 화면이 승인을 권해야 하지만 이쪽은 이미 허락했다가 스스로 끈 것이다. 라이브 스팬 쪽 대응 사유는 `serviceCollectionPaused` |
| 완료 요청 지연 구간 차트 | 끝난 요청을 걸린 시간대(100 ms/500 ms/1 s/5 s/그 위)로 갈라 쌓는 막대. 🔴 **진행 중인 요청이 아니다**(그건 자바 에이전트 확장이 있어야 한다). 🔴 산점도와 **모집단이 다르다** — 점은 상한 걸린 표본, 이 막대는 수신 전량. 상세는 [10.5.1절](18-p5-realtime.md) |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 이 문서 본문에는 절별 **더 보기** 줄이 없다(부록·목차 성격). 근거 문서 전체는 [17-sources.md](17-sources.md) D.2.
- 관련 분책: 이전 [13-verification.md](13-verification.md) · 다음 [15-overturned.md](15-overturned.md) · 목차 [00-index.md](00-index.md) · 용어 [14-glossary.md](14-glossary.md) · P5 라이브 관제 용어의 전체 맥락 [18-p5-realtime.md](18-p5-realtime.md) · 출처 전체 [17-sources.md](17-sources.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

이 문서 본문에는 외부 URL을 직접 인용한 줄이 없다. 전체 목록은 [17-sources.md](17-sources.md) D.1.

