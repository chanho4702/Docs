# APM DB 성능 감사 — 인덱스·행 크기·조회 계층 (2026-09-17)

> 작성일 2026-09-17. 기준 커밋: `moveseye-be-spring` `master` `8df357d`(2026-09-16, `p5-live` 병합). 대상: APM(`premium/apm/`) 전체의 PostgreSQL 스키마(`db/migration/V38~V59`)와 조회 계층.
>
> **한 줄 결론**: 설계는 3단 롤업·일 파티션·해상도 자동 선택·배치 조회가 전부 제대로 돼 있고, 2026-09-01 실측(R3, `../core/r3_apm-volume.md`)에서 잡힌 5건(Q1·Q2·Q3·R1·O1)은 코드에 전부 반영됐다. 그러나 **최대 약점은 인덱스가 아니라 행 크기**다 — `apm_metric_1m` 행당 686B 중 41%가 PK 인덱스 하나이고, 원인(`dims_hash char(64)` + `dims jsonb` 중복 저장, S1·S2)은 **미해결**이다. 트레이스·RUM 파생 테이블 3종(`apm_error_group_1h`·`apm_db_query_group_5m`·`apm_rum_error_5m`)은 PK 선두가 조회 축과 안 맞아 인덱스가 명확히 부족하다.
>
> **읽는 법**: 🔴 = 확인된 위험(용량·지연이 조용히 틀리거나 나빠짐), 🟡 = 확인된 한계(조치가 있으나 부분적), ✅ = 실측 또는 코드로 확인되어 문제 없음. 수치 앞에 **[실측]** 또는 **[추정]**을 명시한다. 이 문서는 사내 검수용이며 검수 번호·§ 표기를 그대로 쓴다.

---

## §1. 경로 구분 — 신호 × 적재 단위 × 테이블 × 보존 × 파티션

경로는 `moveseye-be-spring/src/main/resources/db/migration/`, 코드는 `premium/apm/` 기준.

| 신호 | 적재 단위 | 테이블 | 보존(기본) | 파티션 | 근거 |
|---|---|---|---|---|---|
| 메트릭(RED·런타임) 1m | 분당 UPSERT(덧셈), service+instance 축 | `apm_metric_1m` | 7일 | 일 | V38__apm_p1.sql:209-233 |
| 메트릭 5m | 롤업(대입), service 축만 | `apm_metric_5m` | 30일 | 일 | V38:236-256 |
| 메트릭 1h | 롤업(대입), service 축만 | `apm_metric_1h` | 400일(추정 — 원본은 [실측] 아님, ApmResolution 상수 근거) | 일 | V38:259-278 |
| 스팬(트레이스 원본) | 수신 즉시 INSERT | `apm_span` | 7일 | 일 | V44__apm_trace.sql:57(주석), 60-98 |
| 트레이스 요약 | 병합 UPSERT(여러 배치에 걸쳐 성장) | `apm_trace_summary` | 7일 | 일 | V44:101-149 |
| 서비스맵 엣지 | 5분 롤업 | `apm_service_edge_5m` | 30일 | 일 | V44:152-178 |
| 예외 그룹(지문) | UPSERT | `apm_error_group` | 마지막 발생 90일 후 삭제 | 비파티션 | V44:182-208 |
| 예외 그룹 1시간 집계 | 5분마다 12번 나눠 병합(V45:147) | `apm_error_group_1h` | 트레이스 보존과 연동 | 일 | V44:211-219 |
| DB 쿼리 그룹(지문) | UPSERT | `apm_db_query_group` | 90일 | 비파티션 | V44:222-242 |
| DB 쿼리 그룹 5분 집계 | 롤업 | `apm_db_query_group_5m` | 30일 | 일 | V44:245-260 |
| 외부 의존 5분 집계 | 롤업 | `apm_dependency_5m` | 30일 | 일 | V44:263-282 |
| 배포 이력 | 수신 시 변화 감지 or 웹훅 | `apm_deployment` | 400일(서비스당 하루 몇 건이라 파티션 안 함, V44:289 주석) | 비파티션 | V44:285-310 |
| RUM 페이지/세션/타이밍/영수증 | 5분 집계 | `apm_rum_page_5m` 등 4종 | 30일(ApmRetentionService.java:44 주석) | 일 | V57__apm_rum_kubernetes.sql:35-70 |
| RUM JS 오류 지문 | UPSERT | `apm_rum_js_error_group` | 지문 표본 90일 | 비파티션 | V57:71-77 |
| RUM 오류 5분 집계 | 롤업 | `apm_rum_error_5m` | 30일 | 일 | V57:78-81 |
| RUM 스팬(브라우저) | 수신 INSERT | `apm_rum_span` | 7일 추정(트레이스와 동일 축, [미검증]) | 일 | V57:84-92 |
| **P5 실시간(Live)** | **DB 미사용 — 인메모리 링/버퍼** | 없음 | 해당 없음(휘발성) | 해당 없음 | `overview/live/spans/LiveSpanRing.java` 외, `collector/ingest/live/` |

🔴 **P5 라이브는 DB를 쓰지 않는다.** `ApmLiveSnapshotService`(`overview/live/ApmLiveSnapshotService.java`)는 요약 스냅샷을 인메모리 `LiveBuffer`/`LiveSpanArena`에서 만들고, **DB 접촉은 딱 한 곳**이다 — 224행 `serviceRepository.findAllById(ids)`로 서비스 표시명(`displayName`/`serviceName`)만 조회한다(255-256행). 수신 파이프라인(`collector/ingest/live/LiveMetadataSource.java`)은 토큰·서비스·대기 등록 판정에 `ApmReceiveTokenRepository`·`ApmServiceRepository`·`ApmPendingServiceRepository`를 쓰지만 이는 **적재 입구**의 일이지 라이브 조회 경로가 아니다. 이 구조 덕에 라이브 화면은 이 문서가 다루는 DB 성능 문제와 무관하다 — 대신 **BE 다중 인스턴스 전제가 없다는 별도 위험**이 있다(§6-⑥).

---

## §2. 인덱스 현황 — 테이블 × 인덱스 × 종류 × 노리는 질의 × 판정

| 테이블 | 인덱스 | 종류 | 노리는 질의 | 판정 | 근거(파일:행) |
|---|---|---|---|---|---|
| `apm_metric_1m` | PK `(service_id, instance_id, metric, dims_hash, bucket_start)` | B-tree(복합5) | 적재 UPSERT 충돌키 + 단건 조회 | 🔴 **크다** — [실측] 3,950MB, 행당 280.8B, 리프 밀도 52%(R3 §3.2). 1m 테이블 전체 용량의 41% | V38:229; r3_apm-volume.md §3.2 |
| `apm_metric_1m` | `apm_metric_1m_query_idx (service_id, metric, bucket_start)` | B-tree | RED 계열·엔드포인트 시계열 | ✅ 잘 쓰인다(R3 EXPLAIN [A][C][D]가 전부 이 인덱스나 PK를 탄다) | V38:232-233 |
| `apm_metric_1m` | (그 외 없음) | — | `metric` 조건 없는 질의 | 🔴 **부족** — 인덱스가 이 2개뿐이라 metric 없이 service_id만 주면 PK 선두 접두만 쓰고 스캔 폭이 크다. `observedMetrics` distinct가 인덱스 엔트리 1,405만 개를 훑는 사례가 실측됐다(R3 §6[D], 3,677ms) | r3_apm-volume.md §6[D] |
| `apm_metric_5m` | PK `(service_id, metric, dims_hash, bucket_start)` + `apm_metric_5m_query_idx (service_id, metric, bucket_start) INCLUDE (dims_hash)` | B-tree | 5m 조회 전반 | ✅ INCLUDE 커버링으로 힙 접근 없이 인덱스만으로 끝남(R3 [B] HashAggregate, 스필 없음) | V38:251-256 |
| `apm_metric_1h` | PK 동형 + `apm_metric_1h_query_idx` INCLUDE(dims_hash) | B-tree | 1h 조회 | ✅ 5m과 동일 구조 | V38:274-278 |
| `apm_span` | PK `(trace_id, span_id, start_ts)` | B-tree | 단건 조회 | ✅ | V44:89 |
| `apm_span` | `apm_span_service_idx (service_id, start_ts)` | B-tree | 서비스별 시간창 스캔(목록·드릴다운) | ✅ | V44:93 |
| `apm_span` | `apm_span_attrs_idx` | **GIN**(jsonb_path_ops) | `attr=k:v` 필터(`@>`만, `?`류는 못 탐) | ✅ 조회는 맞지만 **쓰기 비용 미측정**(GIN은 append-only 부하가 B-tree보다 큼) | V44:95-98 |
| `apm_span` | `apm_span_start_brin` | **BRIN** | 서비스 필터 없이 최근 창 전체 스캔 | ✅ 설계상 타당(시간 상관관계 이용, 삽입비용 사실상 0) — [미검증] 실측 안 됨 | V45__apm_trace_rollup.sql:25-35 |
| `apm_span` | `apm_span_root_internal_idx` | **부분 인덱스**(`WHERE kind='INTERNAL' AND parent_span_id IS NULL`) | 지연 도착 판정(late-arrival job) | ✅ 조건이 좁아 인덱스는 작음 — 그래도 모든 INSERT가 술어를 평가(주석이 명시) | V54__apm_job_late_arrival.sql:25-38 |
| `apm_trace_summary` | PK `(trace_id, start_ts)` + `apm_trace_summary_service_idx`(root_service_id, start_ts) + `_slow_idx`(root_service_id, duration_ns DESC) + BRIN(start_ts) | B-tree×3 + BRIN | 목록 정렬·서비스 필터·서비스 없는 최근 창 | ✅ | V44:141-149; V45:38-39 |
| `apm_error_group` | PK bigserial + UNIQUE(service_id, fingerprint) + `apm_error_group_seen_idx(service_id, last_seen_at)` | B-tree | 최근 발생 정렬 | ✅ | V44:185-208 |
| **`apm_error_group_1h`** | PK `(group_id, bucket_start)` | B-tree | 그룹별 시간창 합계(errors 목록·상세) | 🔴 **부족** — PK 선두가 `group_id`라 "이 시간창의 그룹들"을 찾는 질의(§4 참조)는 이 인덱스를 못 타고 **파티션 프루닝에만 의존** | V44:211-219 |
| `apm_db_query_group` | PK bigserial + UNIQUE(service_id, fingerprint) + `apm_db_query_group_seen_idx` | B-tree | 최근 발생 정렬 | ✅ | V44:226-245 |
| **`apm_db_query_group_5m`** | PK `(group_id, bucket_start)` | B-tree | 그룹별 5분 집계 시간창 합계 | 🔴 **부족** — 위와 동일 이유. 부가 인덱스 없음 | V44:248-260; V46 ALTER는 컬럼만 추가(min_ns/max_ns), 인덱스는 그대로 |
| `apm_dependency_5m` | PK `(service_id, target, bucket_start)` | B-tree | 서비스별 의존 시계열 | ✅ PK 선두가 service_id라 정상 사용 가능 | V44:281 |
| `apm_service_edge_5m` | PK + `apm_service_edge_5m_query_idx(from_service_id, bucket_start)` | B-tree | 서비스맵 시계열 | ✅ | V44:174-178 |
| `apm_rum_page_5m` | PK 복합5(group_id,browser,os,country,bucket) + `apm_rum_page_bucket(bucket)` | B-tree | 페이지 집계 조회 | 🟡 group_id 없이 bucket만으로는 전체 서비스 스캔(부가 인덱스가 group_id 선두가 아님) | V57:35-52 |
| **`apm_rum_error_5m`** | PK `(group_id, fingerprint, bucket)` | B-tree | 그룹·시간창 오류 합계 | 🔴 **부족** — PK 2번째 컬럼이 `fingerprint`라 "이 그룹의 이 시간창"(group_id + bucket만 있는) 질의는 fingerprint를 몰라 인덱스 선두 접두만 쓰거나 못 씀. 부가 인덱스 없음 | V57:78-81 |
| `apm_rum_js_error_group` | PK(group_id,fingerprint) + `apm_rum_js_error_seen(last_seen_at)` | B-tree | 최근 발생 정렬 | ✅ | V57:71-77 |
| `apm_rum_span` | PK + `apm_rum_span_trace(trace_id,start_ts)` + `apm_rum_span_group_time(group_id,start_ts)` | B-tree×2 | 트레이스별/그룹별 조회 | ✅ | V57:84-92 |

**요약**: 인덱스가 명확히 부족한 곳은 **3곳**(`apm_error_group_1h`, `apm_db_query_group_5m`, `apm_rum_error_5m`) — 전부 "그룹+시간창" 조회가 필요한데 PK 선두가 그룹 축이 아니거나 시간창 축 바로 다음이 그룹 축이 아니어서, 실제로는 **일 파티션 프루닝만으로 스캔 범위를 좁히는** 구조다. 데이터량이 늘면(예: DB 쿼리 지문 수백 종 × 30일) 이 세 테이블부터 EXPLAIN이 나빠질 가능성이 높다(🔴 [미검증] — R3는 메트릭만 쟀고 이 세 테이블은 실측 대상이 아니었다).

---

## §3. 파티션

- **기준 컬럼**: 메트릭 3종·스팬·트레이스 요약·서비스맵 엣지·예외/DB쿼리 5분·1시간 집계·RUM 5종 전부 `PARTITION BY RANGE (bucket_start)` 또는 `(start_ts)` — **일 단위**다. ⚠️ 5분·1시간 **집계** 테이블도 버킷 폭(5분/1시간)과 파티션 폭(1일)이 다른 축이라는 점을 코드 주석이 두 번 못 박는다(V38:320-321, be-spring/CLAUDE.md §0.5③).
- **생성 주체 둘**:
  1. **설치 시점**(마이그레이션 `DO $$` 블록) — 오늘−1~오늘+2(4일치)를 만든다. 날짜를 하드코딩하지 않는 이유는 "설치 시점이 언제든 도는 파일"이기 때문(V38:284-286, V44:313-318, V57:94-104 세 곳에 동일 패턴 반복).
  2. **런타임**(`ApmPartitionService.ensurePartition`) — 수신 시점에 범위 밖 시각이 오면 그때 만든다. 🔴 be-spring/CLAUDE.md §0.5③이 명시하듯 이 클래스는 **배치 전용이 아니라 수신 적재 경로가 요청 시점에 직접 부른다**(`ApmMetric1mStore#store`) — 실패하면 배치가 아니라 **수신이 손실**된다.
- **DEFAULT 파티션 없음(의도적)**: V38:288-290, V44:317-318이 이유를 명시한다 — DEFAULT가 있으면 범위 밖 행이 전부 거기 쌓이고, 보존 배치의 "파티션 통째 DROP" 전략이 그 안에서는 DELETE로 골라내야 하는 것으로 퇴화한다.
- **PK가 파티션 키를 포함해야 하는 대가**: PG 파티션 테이블은 PK가 파티션 키를 포함해야 하므로 `dims_hash char(64)`(68B)가 5개 메트릭 테이블·트레이스 파생 테이블 다수의 PK에 강제로 들어간다 — 이것이 §2·§6의 행 크기 문제의 구조적 원인이다. `apm_trace_summary`는 한 걸음 더 나아가 **PK 값(start_ts)이 나중에 내려갈 수 있어**(더 이른 스팬이 늦게 도착) UPDATE가 행을 다른 파티션으로 옮기는 PG 11+ row movement가 실제로 일어난다(V44:111-114 주석) — 이 갱신 비용은 [미검증].

---

## §4. 조회 계층

### 4.1 해상도 자동 선택
`ApmResolution`(core/metric/ApmResolution.java)이 창 길이와 보존 일수를 보고 1m/5m/1h를 고른다(`choose`/`rawWithinRetention`/`escalateForRetention`). ✅ N+1 없이 서비스 목록 등은 배치(`serviceCells(List<Long> ids, ...)`) 형태로 조회한다(§핵심 1 확인 — 실제로 `ApmLiveSnapshotService`·`ApmAvailabilityService` 등에서 ID 리스트를 한 번에 넘기는 패턴 다수 확인).

### 4.2 창 상한 — RUM만 있다
🔴 **`RumQueryService.java:63-64`**가 유일하게 명시적 시간창 상한을 건다:
```java
if (start <= 0 || end <= start || end - start > 30L * 86400000)
    throw bad("조회 기간은 30일 이내이며 from < to여야 합니다.");
```
반면 메트릭 조회의 공용 시간창 클래스 `core/metric/ApmTimeRange.java`에는 최대 범위 검증이 없다(코드 내 `MAX`/`validate` 계열 상수·메서드 부재 확인). 즉 **메트릭·트레이스 조회는 사용자가 임의로 넓은 창(예: 1년)을 요청해도 서버가 거부하지 않는다** — 응답 크기는 각 화면의 `LIMIT`/집계 상한이 개별적으로 막을 뿐, 시간창 자체의 상한은 없다.

### 4.3 LIMIT 없는 질의
| 서비스 | 위치 | 문제 |
|---|---|---|
| `ApmErrorQueryService` | `trace/errors/ApmErrorQueryService.java:172` | `select count(*) ` + 그룹×1시간 집계 조인 서브쿼리 — **LIMIT 없음**, 목록 페이지네이션의 total을 구하려고 매 요청 전체를 다시 센다 |
| 〃 | 같은 파일:153-157 | `q`(검색어) 필터가 `g.exception_type ilike ? or g.message_norm ilike ?`로 **양쪽 와일드카드**(`%q%`)를 쓴다. `pg_trgm` extension이 마이그레이션 전체에서 **한 번도 생성되지 않음**(grep 결과 0건) — 즉 이 ilike는 인덱스를 절대 못 타고 항상 시퀀셜 스캔이다 |
| `observedMetrics`(`ApmMetricStore`) | R3 실측(§6[D]) | 결과 162행을 위해 인덱스 엔트리 1,405만 개(Index Only Scan)를 순회 — PG에 인덱스 스킵 스캔이 없다는 코드 주석이 그대로 수치화됨. 호출자(`ApmRuntimeFamilyResolver`)의 **캐시가 사실상 필수**임이 실측으로 확인됨 |

### 4.4 정렬/페이징·동적 WHERE
- `ApmErrorQueryService.list`는 정렬 컬럼을 화이트리스트(`SORTS` 맵)로 검증한 뒤 문자열 결합하는 안전한 동적 정렬을 쓴다(120-125행) — SQL 인젝션 관점은 문제없음, 다만 §4.3의 count(*) 비용은 그대로.
- 같은 서비스의 시간창 조인은 "정시로 내린 경계 + 초 단위 2차 필터"(132-144행)라는 의도된 보수적 근사를 쓴다 — 창 경계 근방 그룹이 과다 포함될 수 있음(성능과 무관, 정확도 트레이드오프).

---

## §5. 실측으로 잡은 문제 × 조치 × 현재 상태

출처: `../core/r3_apm-volume.md`(2026-09-01, WBS 1.7). "9.2 조치 결과" 절이 같은 날 후속 커밋으로 5건(Q1·Q2·Q3·R1·O1)의 구현을 보고했고, 이번 감사에서 코드로 재확인했다.

| # | 문제(R3 실측) | 조치 | 현재 상태 | 확인 근거 |
|---|---|---|---|---|
| **Q1** | 서비스 목록 `availability24hPct`가 1m 원시 12.96M행을 246칸으로 접어 **[실측] cold 13~14초**(EXPLAIN 28.2초, 임시파일 2.8GB) | `serviceCells`를 5m 단으로 내리고 롤업 지연분(꼬리)만 1m으로 보강하는 하이브리드 | ✅ **해결됨** — `ApmAvailabilityService.java:105` `PCT_BASE = ApmResolution.M5`, 185행 `ApmResolution.rawWithinRetention`으로 꼬리 구간만 1m 조회(192·196·202·211행). 🔴 꼬리 길이는 30분 상수가 아니라 **롤업 워터마크 기준**으로 정함(R3 §9.2 마지막 문단) — 재실측은 안 됨(합성 데이터 삭제 후 미재적재) | ApmAvailabilityService.java:105,185,192,196,202,211 |
| **Q2** | `redSeries`의 `order by bucket_start`가 6h RED에서 324,000행 정렬(디스크 71.9MB, R3 §6[A]) 유발로 추정 | `order by`를 SQL에서 빼고 결과(수백 행) 정렬을 자바로 이동 | 🟡 **부분 — 전제가 부정됨** — 같은 날 A/B 재검증 결과, 플래너가 GroupAggregate를 고른 진짜 원인은 `order by`가 아니라 **해시 그룹 수 과소추정**(추정 32,401 vs 실제 360)이었다. `work_mem`을 64MB로 올리면 order by 유무와 무관하게 HashAggregate로 전환됨(스필 소멸). 변경 자체(Java 정렬 이동)는 손해가 없어 유지했지만 "무료로 수 배"의 효과는 **O1(work_mem)의 몫**이지 Q2가 아니다 | r3_apm-volume.md §9.2 표 |
| **Q3** | `countMixedBoundsGroups`(진단 선조회)가 롤업 INSERT와 별도 GROUP BY를 돌려 백필 시 ~7초 낭비 | 진단 선조회를 롤업 INSERT의 부산물로 통합 | ✅ **해결됨** — R3 재측정으로 6.50초→6.02초(중앙값, 교대 3회) 확인. 창이 커질수록 이득 커짐 | r3_apm-volume.md §9.2 |
| **R1** | 24시간 백필 1회가 **[실측] 6분 39초**(`DEFAULT_MAX_BUCKETS_5M=288`=하루치를 한 문장으로), 임시파일 6.7GB | `DEFAULT_MAX_BUCKETS_5M` 288→60, `_1H` 48→12로 축소해 단일 문장 상한을 낮춤 | ✅ **해결됨(코드 확인)** — `ApmRollupService.java:115` `DEFAULT_MAX_BUCKETS_5M = 60`, 117행 `DEFAULT_MAX_BUCKETS_1H = 12`. 권고값(288→60, 48→12)과 정확히 일치. 재백필 실측(단일 문장 ≤1.5분 목표)은 [미검증] | ApmRollupService.java:115,117 |
| **O1** | PG 스필 3건(§6 [A][C]와 백필)이 전부 `work_mem=4MB` 기본값 산물 | 설치 가이드에 PG 권장 설정(`work_mem`≥64MB, `shared_buffers`≥RAM 25%, `max_wal_size`≥4GB) 안내 | ✅ **해결됨(코드 확인)** — `ApmDocRef.java`에 `PG_RUNTIME_RESOURCE`(260-264행, "🔴 R3에서 조회 플랜을 뒤집은 work_mem이 정의된 곳")·`PG_RUNTIME_WAL`(266-269행) 두 항목이 설치 가이드 notice 카탈로그에 등재됨 | ApmDocRef.java:260-269 |
| **S1** | 행당 686B 중 힙 393B(`dims` jsonb + `dims_hash` char(64) 중복) | `dims`를 사전 테이블(`apm_dims(id, dims_hash, dims jsonb)`)로 빼고 메트릭 테이블은 `dims_id int`만 저장 | 🔴 **미해결(보류)** — R3 §9.2가 "P2와 함께 판단으로 보류"라 적었고, 이번 감사에서 `dims_hash`·`apm_dims` 관련 마이그레이션을 전수 검색한 결과 V38 이후 **어떤 파일도 이 스키마를 건드리지 않음**(grep 결과 V38 단독 매치). 여전히 행당 686→~400B(−42%) 절감 여지가 그대로 남아 있음 | migration/ 전수 grep(V38만 매치) |
| **S2** | (S1 대안) `dims_hash char(64)`→`bytea(32)` | hex 문자열 대신 원시 sha256 바이너리 저장 | 🔴 **미해결** — 위와 동일 근거, char(64) 그대로 | V38__apm_p1.sql:215,239,262 (수정 이력 없음) |
| **R7** | (별도 감사 `../../infra/scale-call-guard/audit_scale-5000-hosts.md` R7) "노드 로컬 상태 — BE 여러 대 전제가 코드에 없음 → APM 수치 N배" | 미착수 | 🔴 **미해결, 이 문서 범위와 인접** — §1에서 확인한 P5 라이브의 인메모리 링(`LiveSpanRing`/`LiveBuffer`)이 정확히 이 유형이다: BE를 2대 이상 띄우면 각 인스턴스가 독립된 링을 가져 라이브 수치가 인스턴스마다 다르게 보일 수 있다. DB 성능과는 별개 축이라 이 감사에서 직접 측정하지 않았다 | audit_scale-5000-hosts.md:42 |
| **M-3** | (원 조사 산출물 파일이 비어 있어 확인 불가) | — | ⚠️ **확인 불가** — 근거 파일(`a22a2b968e46566c4.output`)이 0바이트로 생성되어 이 식별자의 정의를 이 세션에서 추적하지 못했다. `_workspace` 전수 검색으로도 DB 성능 맥락의 "M-3"을 특정하지 못함 — 후속 확인 필요 | §8 참조 |
| **검수3** | (위와 동일 사유) | — | ⚠️ **확인 불가** — `apm-code-walkthrough.md`·`apm-scope-reestimate.md` 등에 "검수 3회"라는 표현은 있으나 이는 **P1 전체 검수 라운드 횟수**를 가리키는 것으로 보이고, DB 성능 관련 단일 이슈 코드로 보기 어렵다. 후속 확인 필요 | apm-code-walkthrough.md:65,75 |

---

## §6. 남은 위험 6가지 (우선순위순)

| 순위 | 위험 | 근거 | 예상 증상 | 권고 조치 |
|---|---|---|---|---|
| ① | **행 크기로 용량이 먼저 무너진다** | [실측] 686B/행, PK 41%. 서비스 50·인스턴스 5로 늘리면 1m 7일 **[추정] 562GB**, 3단 합계 **[추정] 770GB**(R3 §3.4) | 설치형 단일 박스가 디스크 용량으로 먼저 막힘 — 화면 지연보다 먼저 온다는 보장 없음 | S1(사전 테이블 분리, −42%) 우선 착수. 안 되면 S2(bytea)라도 |
| ② | **목록 cold 13~14초의 재실측이 없다** | Q1 코드는 배포됐지만(§5) R3 §9.2가 "합성 데이터를 이미 지웠고 재적재 안 함"이라 명시 — 실제로 몇 초로 줄었는지 **[미검증]** | Q1이 이론대로 안 먹혔을 경우 배포 후에야 발견 | 다음 볼륨 실측(또는 P2/P5 착수 전)에서 동일 시나리오로 재측정 |
| ③ | **`ApmErrorQueryService`의 무상한 count(*) + trigram 없는 ilike** | §4.3 — count(*)에 LIMIT 없음, `pg_trgm` 미설치로 `ilike '%q%'`가 항상 seq scan | 예외 그룹 수·검색어 사용이 늘면 목록 조회가 선형으로 느려짐 | `pg_trgm` + GIN(`gin_trgm_ops`) 인덱스 추가, count(*)는 근사치(estimate) 또는 캐시로 대체 검토 |
| ④ | **롤업 파생 3종의 인덱스 부재** | §2 — `apm_error_group_1h`·`apm_db_query_group_5m`·`apm_rum_error_5m` 모두 PK 선두가 그룹 축이라 시간창 스캔이 파티션 프루닝에만 의존 | 지문(그룹) 종류가 많아지면(수백~수천) 조회가 파티션 전체 스캔에 가까워짐 | `(bucket_start, group_id)` 또는 `(group_id, bucket_start) INCLUDE (...)` 보완 인덱스 검토(현재 PK와 컬럼 순서만 다름 — 추가 인덱스로 커버 가능) |
| ⑤ | **`apm_span`의 GIN+부분 인덱스 2개, 쓰기 비용 미측정** | §2 — `apm_span_attrs_idx`(GIN jsonb_path_ops) + `apm_span_root_internal_idx`(부분, 모든 INSERT가 술어 평가) | 스팬 수신량이 늘면(설계 상한 일 2천만) GIN 유지비가 수신 처리율을 갉아먹을 수 있음 | 수신 부하 동시 실측(R3 §8-3 "동시 수신 부하 없음"이 이미 한계로 명시됨) 시 GIN 삽입 비용 별도 측정 |
| ⑥ | **메트릭·트레이스 조회에 시간창 상한 없음(RUM만 30일)** | §4.2 — `ApmTimeRange`에 최대 범위 검증 없음, `RumQueryService.java:63-64`만 명시적 30일 cap | 사용자가 극단적으로 넓은 창(수개월)을 조회하면 §4.3의 무제한 스캔과 결합해 임의로 무거운 질의가 가능 | 메트릭/트레이스 조회에도 화면별 합리적 상한(예: 90일) 도입 검토 |

---

## §7. 운영 권고와 승격 판정 전 확인 사항

**이미 제품이 안내하는 것(O1, ApmDocRef.java 260-269행)**:
- `work_mem` — R3 실측에서 조회 플랜을 뒤집은 값. 4MB(기본) vs 64MB에서 [A]([redSeries] 6h)의 external merge 스필이 사라지고 HashAggregate로 전환(186ms, 스필 0). **설치 가이드 notice 중 조회 속도에 가장 크게 기여**.
- `shared_buffers` — 자원 소비 설정 카테고리로 함께 안내.
- `max_wal_size` — 적재 중 체크포인트 몰림 방지.
- 용량 산식 — R3 §9(§4.6 승격 조건 제안)이 "1m 일 증가 > 20M행(1차 기준) → 저장 계층 교체 검토, > 35M행 → 착수", "서비스 목록 cold p50 > 3초(2차 기준, 실제로 가장 먼저 옴) → 질의 계층 손질 → 그래도 넘으면 교체"를 제안했다. 이 문서 작성 시점에 이 제안이 `devdesign_apm.md` §4.6에 실제 반영됐는지는 **[미검증]**(§8 확인 대상).

**승격 판정(Postgres → ClickHouse 등) 전 확인할 것**:
1. §5 Q1의 재실측(위험②) — 안 하면 "고쳤다고 믿는 상태"로 승격 여부를 판단하게 됨.
2. §6 위험①의 S1/S2 여부 결정 — 하지 않고 승격 임계값을 정하면 임계값 자체가 686B 기준이라 낮게 잡힘(R3 §9: "S1 적용 시 임계를 1.7배 올릴 수 있다").
3. 서비스 50·인스턴스 5 시나리오(770GB 추정)가 실제 고객 규모에 해당하는지 영업/설치 사전 조사로 확인 — 설치형 단일 박스 전제와 충돌하는지 여부.
4. 롤업 R1 조치 후 "밀린 구간 따라잡기" 속도(실시간의 60배, R3 §9.1 R1행 추정)가 실제 장애 복구 시나리오(예: 하루 정지 후 재기동)에서 허용 가능한지.

---

## §8. 출처

- **BE 스키마**: `moveseye-be-spring/src/main/resources/db/migration/V38__apm_p1.sql`(메트릭 3단), `V44__apm_trace.sql`(스팬·트레이스·예외·DB쿼리·의존·배포), `V45__apm_trace_rollup.sql`(BRIN·집계 함수), `V46__apm_trace_rollup_min_max.sql`, `V54__apm_job_late_arrival.sql`(부분 인덱스), `V57__apm_rum_kubernetes.sql`(RUM 6테이블).
- **BE 코드**: `premium/apm/core/metric/ApmResolution.java`, `premium/apm/core/batch/rollup/ApmRollupService.java`, `premium/apm/core/batch/retention/{ApmRetentionService,ApmRetentionJob}.java`, `premium/apm/service/status/ApmAvailabilityService.java`, `premium/apm/trace/errors/ApmErrorQueryService.java`, `premium/apm/trace/rollup/ApmTraceRollupService.java`, `premium/apm/job/ApmJobQueryService.java`, `premium/apm/rum/page/RumQueryService.java`, `premium/apm/overview/live/ApmLiveSnapshotService.java`, `premium/apm/collector/ingest/live/LiveMetadataSource.java`, `premium/apm/collector/install/ApmDocRef.java`.
- **실측 정본**: `../core/r3_apm-volume.md`(2026-09-01, 686B/행·cold 13~14초·work_mem A/B·EXPLAIN 4건의 유일한 출처).
- **관련 감사(교차 참조)**: `../../infra/scale-call-guard/audit_scale-5000-hosts.md`(R7 — 노드 로컬 상태, C6 — APM 원본 보존 용량 상한 없음).
- **핸드북**: `../../../guides/apm-handbook/13-verification.md`(검증 방법론·미검증 목록), `../../../guides/apm-handbook/00-index.md` §9(문서 지도).
- **원 조사 산출물 관련 한계**: 이 문서의 근거가 되어야 했던 선행 조사 태스크 출력(`.../tasks/a22a2b968e46566c4.output`)이 작성 시점 0바이트로 확인되어, 이 문서의 모든 수치·판정은 위 1차 출처(마이그레이션 파일·서비스 코드·r3 실측 문서)를 이번 세션에서 **직접 재확인**한 것이다. §5의 R7·M-3·검수3 세 항목은 이 한계로 인해 완전히 특정하지 못했다(표에 사유 명시).
